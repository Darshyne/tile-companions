/**
 * Region behavior `tile-companions.clickMacro`: clicking the region runs a
 * macro on the clicking user's client — even if that user has no
 * permission on the macro.
 *
 * Core's own "Execute Macro" region behavior only fires on token events
 * (enter/exit/move), useless on tokenless scenes, and Macro#execute
 * refuses without LIMITED ownership. Since the macro is hand-picked by the
 * GM in this behavior's config, we bypass the ownership check by
 * replicating core's execution mechanics (Macro#executeScript /
 * #executeChat) instead of calling macro.execute(). The script still runs
 * with the *player's* rights: any world write it attempts is subject to
 * the player's normal document permissions — this gives no extra power.
 *
 * Click detection & highlight are shared — see ../region-click.js.
 */

import { MODULE_ID } from '../constants.js';
import { fields, clickFields, COMMON_PREFIX } from './common.js';

export class ClickMacroBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static LOCALIZATION_PREFIXES = ['TILECOMPANIONS.MacroBehavior', COMMON_PREFIX];

  static defineSchema() {
    return {
      macro: new fields.DocumentUUIDField({ type: 'Macro', required: true, blank: false, nullable: true, initial: null }),
      ...clickFields()
    };
  }

  /** No region events — click-driven. */
  static events = {};

  get displayName() {
    return this.label || this.region?.name || '';
  }
}

/**
 * Run the macro of a clickMacro behavior, ignoring macro ownership.
 * @param {RegionBehavior} behavior
 */
export async function executeClickMacro(behavior) {
  const uuid = behavior.system.macro;
  const macro = uuid ? await fromUuid(uuid) : null;
  if ( !macro || macro.documentName !== 'Macro' ) {
    return ui.notifications.warn(game.i18n.localize('TILECOMPANIONS.Warn.NoMacro'));
  }
  const speaker = foundry.documents.ChatMessage.implementation.getSpeaker();
  if ( macro.type === 'chat' ) {
    return ui.chat.processMessage(macro.command, { speaker }).catch(err => {
      console.error(`${MODULE_ID} | chat macro failed:`, err);
      ui.notifications.error('MACRO.Error', { localize: true });
    });
  }
  // Script macro — same wrapper and arguments as Macro##executeScript.
  const character = game.user.character;
  const token = (canvas.ready ? canvas.tokens.get(speaker.token) : null) ?? null;
  const actor = token?.actor ?? game.actors.get(speaker.actor) ?? null;
  const scope = { behavior, region: behavior.region };
  const fn = new foundry.utils.AsyncFunction('speaker', 'actor', 'token', 'character', 'scope', `{${macro.command}\n}`);
  try {
    return await fn.call(macro, speaker, actor, token, character, scope);
  } catch(err) {
    console.error(`${MODULE_ID} | script macro failed:`, err);
    ui.notifications.error('MACRO.Error', { localize: true });
  }
}
