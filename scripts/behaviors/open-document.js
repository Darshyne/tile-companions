/**
 * Region behavior `tile-companions.openDocument`: clicking the region opens
 * a journal (or one of its pages) for the clicking user — a poster on the
 * wall, a letter on the desk, a newspaper stand… tokenless, players too.
 *
 * Permission: a player usually has NO right on a GM-secret journal (Foundry
 * doesn't even send it to their client). With `grant` enabled the click
 * asks the active GM client, over the module socket, to give the clicker
 * Observer ownership on the journal (and on the page, for a page target) —
 * then the document reaches the client and opens. Without a GM online the
 * player gets a clear warning. Revealing is therefore PERMANENT and per
 * player: exactly what a player who found a clue expects.
 */

import { MODULE_ID } from '../constants.js';
import { fields, clickFields, COMMON_PREFIX } from './common.js';

const SOCKET = `module.${MODULE_ID}`;
const GRANT_TIMEOUT_MS = 8000;
const pending = new Map(); // requestId → resolve

export class OpenDocumentBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static LOCALIZATION_PREFIXES = ['TILECOMPANIONS.DocumentBehavior', COMMON_PREFIX];

  static defineSchema() {
    return {
      // Journal entry OR journal page — validated at click time (no single `type` restriction here).
      document: new fields.DocumentUUIDField({ required: true, blank: false, nullable: true, initial: null }),
      grant: new fields.BooleanField({ initial: true }),
      ...clickFields()
    };
  }

  static events = {};

  /** Hover label: explicit label, else the document's name (if known to this client), else the region's. */
  get displayName() {
    if ( this.label ) return this.label;
    const doc = this.document ? fromUuidSync(this.document) : null;
    return doc?.name ?? this.region?.name ?? '';
  }
}

/* -------------------------------------------- */
/*  Click                                       */
/* -------------------------------------------- */

/** @param {RegionBehavior} behavior */
export async function executeOpenDocument(behavior) {
  const L = k => game.i18n.localize(`TILECOMPANIONS.Warn.${k}`);
  const uuid = behavior.system.document;
  if ( !uuid ) return ui.notifications.warn(L('NoDocument'));

  let doc = await fromUuid(uuid);
  if ( doc && !isJournalTarget(doc) ) return ui.notifications.warn(L('NoDocument'));

  if ( !canRead(doc) ) {
    if ( !behavior.system.grant || game.user.isGM ) return ui.notifications.warn(L('DocumentNoPermission'));
    if ( !game.users.activeGM ) return ui.notifications.warn(L('DocumentNoGM'));
    const ok = await requestGrant(uuid);
    if ( !ok ) return ui.notifications.warn(L('DocumentGrantFailed'));
    doc = await waitForDocument(uuid);
    if ( !doc ) return ui.notifications.warn(L('DocumentGrantFailed'));
  }
  return openJournalTarget(doc);
}

function isJournalTarget(doc) {
  return doc.documentName === 'JournalEntry' || doc.documentName === 'JournalEntryPage';
}

function canRead(doc) {
  if ( !doc ) return false;
  if ( doc.documentName === 'JournalEntryPage' ) {
    return doc.parent.testUserPermission(game.user, 'OBSERVER') && doc.testUserPermission(game.user, 'OBSERVER');
  }
  return doc.testUserPermission(game.user, 'OBSERVER');
}

function openJournalTarget(doc) {
  if ( doc.documentName === 'JournalEntryPage' ) return doc.parent.sheet.render(true, { pageId: doc.id });
  return doc.sheet.render(true);
}

/** Poll until the (freshly shared) document reaches this client. */
async function waitForDocument(uuid, tries = 20) {
  for ( let i = 0; i < tries; i++ ) {
    const doc = await fromUuid(uuid);
    if ( doc && canRead(doc) ) return doc;
    await new Promise(r => setTimeout(r, 150));
  }
  return null;
}

/* -------------------------------------------- */
/*  Socket: grant Observer via the active GM    */
/* -------------------------------------------- */

function requestGrant(uuid) {
  const requestId = foundry.utils.randomID();
  return new Promise(resolve => {
    const timer = setTimeout(() => { pending.delete(requestId); resolve(false); }, GRANT_TIMEOUT_MS);
    pending.set(requestId, ok => { clearTimeout(timer); pending.delete(requestId); resolve(ok); });
    game.socket.emit(SOCKET, { action: 'grantDocument', requestId, uuid, userId: game.user.id });
  });
}

/**
 * Socket handler — called from the module's single socket listener.
 * @returns {boolean} whether the message was handled here
 */
export function handleDocumentSocket(data) {
  if ( data?.action === 'grantDocument' ) {
    if ( game.users.activeGM?.id !== game.user.id ) return true; // exactly one GM client acts
    grantObserver(data.uuid, data.userId)
      .then(ok => game.socket.emit(SOCKET, { action: 'grantDocumentDone', requestId: data.requestId, userId: data.userId, ok }))
      .catch(err => {
        console.error(`${MODULE_ID} | grantDocument failed`, err);
        game.socket.emit(SOCKET, { action: 'grantDocumentDone', requestId: data.requestId, userId: data.userId, ok: false });
      });
    return true;
  }
  if ( data?.action === 'grantDocumentDone' ) {
    if ( data.userId !== game.user.id ) return true;
    pending.get(data.requestId)?.(!!data.ok);
    return true;
  }
  return false;
}

/**
 * GM side: give `userId` Observer ownership on the journal (and on the
 * page for a page target, when the page's own ownership would hide it).
 * Never lowers an existing higher level.
 */
export async function grantObserver(uuid, userId) {
  const doc = await fromUuid(uuid);
  if ( !doc || !isJournalTarget(doc) ) return false;
  const OBS = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  const DEFAULT = CONST.DOCUMENT_META_OWNERSHIP_LEVELS.DEFAULT;
  const journal = doc.documentName === 'JournalEntryPage' ? doc.parent : doc;
  const raise = async target => {
    const current = target.ownership[userId] ?? DEFAULT;
    const effective = current === DEFAULT ? target.ownership.default : current;
    if ( effective >= OBS ) return;
    await target.update({ [`ownership.${userId}`]: OBS });
  };
  await raise(journal);
  if ( doc !== journal ) {
    const inherits = (doc.ownership[userId] ?? DEFAULT) === DEFAULT && doc.ownership.default === DEFAULT;
    if ( !inherits && !doc.testUserPermission(game.users.get(userId), 'OBSERVER') ) {
      await doc.update({ [`ownership.${userId}`]: OBS });
    }
  }
  return true;
}
