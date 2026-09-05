/**
 * Central table of the click behaviors: registration (main.js), click
 * dispatch (region-click.js), the HUD dialog and `bind()` all read it.
 */

import { MODULE_ID } from '../constants.js';
import { ClickMacroBehaviorType, executeClickMacro } from './click-macro.js';
import { ToSceneBehaviorType, executeToScene } from './to-scene.js';
import { OpenDocumentBehaviorType, executeOpenDocument } from './open-document.js';
import { JukeboxBehaviorType, executeJukebox } from './jukebox.js';

/**
 * key → { type (full sub-type name), model, execute(behavior), icon, hint (i18n key) }
 */
export const CLICK_BEHAVIORS = {
  clickMacro: { type: `${MODULE_ID}.clickMacro`, model: ClickMacroBehaviorType, execute: executeClickMacro, icon: 'fa-solid fa-scroll', hint: 'TILECOMPANIONS.MacroBehavior.Hint' },
  toScene: { type: `${MODULE_ID}.toScene`, model: ToSceneBehaviorType, execute: executeToScene, icon: 'fa-solid fa-map', hint: 'TILECOMPANIONS.SceneBehavior.Hint' },
  openDocument: { type: `${MODULE_ID}.openDocument`, model: OpenDocumentBehaviorType, execute: executeOpenDocument, icon: 'fa-solid fa-book-open', hint: 'TILECOMPANIONS.DocumentBehavior.Hint' },
  jukebox: { type: `${MODULE_ID}.jukebox`, model: JukeboxBehaviorType, execute: executeJukebox, icon: 'fa-solid fa-record-vinyl', hint: 'TILECOMPANIONS.JukeboxBehavior.Hint' }
};

/** Full sub-type name → click handler. */
export const CLICK_HANDLERS = Object.fromEntries(Object.values(CLICK_BEHAVIORS).map(b => [b.type, b.execute]));

/** Register the sub-types with Foundry (init). */
export function registerClickBehaviors() {
  for ( const b of Object.values(CLICK_BEHAVIORS) ) {
    CONFIG.RegionBehavior.dataModels[b.type] = b.model;
    CONFIG.RegionBehavior.typeIcons[b.type] = b.icon;
    if ( CONFIG.RegionBehavior.typeHints ) CONFIG.RegionBehavior.typeHints[b.type] = b.hint;
  }
}

/** Localised label of a click behavior kind. */
export function behaviorLabel(key) {
  return game.i18n.localize(`TYPES.RegionBehavior.${CLICK_BEHAVIORS[key].type}`);
}

/**
 * Attach a click behavior to a region.
 * @param {RegionDocument} region
 * @param {string} key       clickMacro | toScene | openDocument | jukebox
 * @param {object} [system]  behavior data (macro / targetScene / document / playlist, label, highlight, color…)
 * @param {object} [options] operation options
 * @returns {Promise<RegionBehavior>}
 */
export async function addClickBehavior(region, key, system = {}, options = {}) {
  const kind = CLICK_BEHAVIORS[key];
  if ( !kind ) throw new Error(`${MODULE_ID} | unknown click behavior "${key}"`);
  const [doc] = await region.createEmbeddedDocuments('RegionBehavior', [{ name: behaviorLabel(key), type: kind.type, system }], options);
  return doc;
}

/** Run a click behavior by hand (API / macros). */
export function executeClick(behavior) {
  return CLICK_HANDLERS[behavior?.type]?.(behavior);
}
