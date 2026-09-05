/**
 * Region behavior `tile-companions.toScene`: clicking the region takes the
 * clicking user to another scene — tokenless, players too (a door, a
 * staircase, a city map…). `scene.view()` on the clicker's client; players
 * reach the scene even when it isn't in the navigation bar.
 *
 * `activateForAll` (GM only): activate the scene for the whole table
 * instead — handy for the GM's own navigation regions.
 */

import { fields, clickFields, COMMON_PREFIX } from './common.js';

export class ToSceneBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static LOCALIZATION_PREFIXES = ['TILECOMPANIONS.SceneBehavior', COMMON_PREFIX];

  static defineSchema() {
    return {
      // NOT 'scene': RegionBehaviorType already defines a 'scene' getter (the parent Scene) that would shadow the field.
      targetScene: new fields.DocumentUUIDField({ type: 'Scene', required: true, blank: false, nullable: true, initial: null }),
      activateForAll: new fields.BooleanField({ initial: false }),
      ...clickFields()
    };
  }

  static events = {};

  /** Hover label: explicit label, else the target scene's name, else the region's. */
  get displayName() {
    if ( this.label ) return this.label;
    const scene = this.targetScene ? fromUuidSync(this.targetScene) : null;
    return scene?.name ?? this.region?.name ?? '';
  }
}

/** @param {RegionBehavior} behavior */
export async function executeToScene(behavior) {
  const uuid = behavior.system.targetScene;
  const scene = uuid ? await fromUuid(uuid) : null;
  if ( !scene || scene.documentName !== 'Scene' ) {
    return ui.notifications.warn(game.i18n.localize('TILECOMPANIONS.Warn.NoTargetScene'));
  }
  if ( behavior.system.activateForAll && game.user.isGM ) return scene.activate();
  if ( scene.isView ) return;
  return scene.view();
}
