/**
 * Tile Companions — entry point.
 * Bind a Region, an Ambient Sound and/or an Ambient Light to a Tile; they
 * follow it. Plus tokenless click behaviors for regions (macro, scene,
 * document, jukebox). System-agnostic. See README.md.
 */

import { MODULE_ID, KINDS, SETTING_CASCADE, SETTING_AUTO_RETRACE, SETTING_SYNC_HIDDEN } from './constants.js';
import { registerHooks, bind, unbind, sync, syncScene, retrace, getCompanions, getData, isBound, findTileOf } from './link.js';
import { registerTileHud, promptBind } from './hud.js';
import { traceTileOutline, prettyName } from './trace.js';
import { tileFrame, toScene, toLocal, shapesToScene, shapesFromRegion, pixelsToUnits } from './geometry.js';
import { CLICK_BEHAVIORS, registerClickBehaviors, addClickBehavior, executeClick } from './behaviors/index.js';
import { registerCanvasHooks, getClickableRegions } from './region-click.js';
import { registerSocket, resyncLocalMusic, resyncMusicForEveryone } from './socket.js';
import { grantObserver } from './behaviors/open-document.js';
import * as jukebox from './behaviors/jukebox.js';

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, SETTING_CASCADE, {
    name: 'TILECOMPANIONS.Settings.CascadeDelete.Name',
    hint: 'TILECOMPANIONS.Settings.CascadeDelete.Hint',
    scope: 'world', config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, SETTING_AUTO_RETRACE, {
    name: 'TILECOMPANIONS.Settings.AutoRetrace.Name',
    hint: 'TILECOMPANIONS.Settings.AutoRetrace.Hint',
    scope: 'world', config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, SETTING_SYNC_HIDDEN, {
    name: 'TILECOMPANIONS.Settings.SyncHidden.Name',
    hint: 'TILECOMPANIONS.Settings.SyncHidden.Hint',
    scope: 'world', config: true, type: Boolean, default: true
  });
  registerClickBehaviors();
  registerHooks();
  registerTileHud();
  registerCanvasHooks();
  jukebox.registerJukeboxHooks();
});

Hooks.once('ready', () => {
  registerSocket();
  // Public API for macros / other modules (an `export` alone isn't reachable from macros).
  game.modules.get(MODULE_ID).api = {
    bind, unbind, sync, syncScene, retrace, promptBind,
    getCompanions, getData, isBound, findTileOf,
    traceTileOutline, prettyName,
    tileFrame, toScene, toLocal, shapesToScene, shapesFromRegion, pixelsToUnits,
    CLICK_BEHAVIORS, addClickBehavior, executeClick, getClickableRegions,
    grantObserver, resyncLocalMusic, resyncMusicForEveryone,
    jukebox: { start: jukebox.start, stop: jukebox.stop, toggle: jukebox.toggle, isPlaying: jukebox.isPlaying, status: jukebox.status, listActive: jukebox.listActive },
    KINDS
  };
});
