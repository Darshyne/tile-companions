/**
 * The module's single socket listener (`module.tile-companions`, needs
 * "socket": true in the manifest → world relaunch when added):
 *   - grantDocument / grantDocumentDone — the active GM gives a clicker
 *     Observer on a journal (open-document.js);
 *   - resyncMusic — "everyone back to the GM's music": every client stops
 *     its unmanaged music-channel sounds and its jukebox, then re-syncs the
 *     playlists the documents say are playing.
 */

import { MODULE_ID } from './constants.js';
import { handleDocumentSocket } from './behaviors/open-document.js';
import { stop as stopJukebox } from './behaviors/jukebox.js';

const SOCKET = `module.${MODULE_ID}`;

/** Register the listener (call once, at ready). */
export function registerSocket() {
  game.socket.on(SOCKET, data => {
    if ( handleDocumentSocket(data) ) return;
    if ( data?.action !== 'resyncMusic' ) return;
    if ( !game.users.get(data.userId)?.isGM ) return; // only honor GM-initiated requests
    resyncLocalMusic({ fade: data.fade });
  });
}

/**
 * Local half: stop the jukebox, fade out every music-channel sound not
 * managed by a playlist, then re-sync document-playing playlists.
 * @returns {boolean} whether some GM playlist came back
 */
export function resyncLocalMusic({ fade = 1200 } = {}) {
  stopJukebox({ resync: false, silent: true });
  const managed = new Set();
  for ( const p of game.playlists ) for ( const s of p.sounds ) { if ( s.sound ) managed.add(s.sound); }
  for ( const snd of game.audio.playing.values() ) {
    if ( snd.context === game.audio.music && snd.playing && !managed.has(snd) ) snd.stop({ fade, volume: 0 });
  }
  let restored = false;
  for ( const p of game.playlists.playing ) for ( const s of p.sounds ) {
    if ( s.playing ) { s.sync(); restored = true; }
  }
  return restored;
}

/**
 * GM side: broadcast to every client and run locally too (module sockets
 * don't echo back to the emitter).
 */
export function resyncMusicForEveryone({ fade = 1200 } = {}) {
  if ( !game.user.isGM ) return ui.notifications.warn(game.i18n.localize('TILECOMPANIONS.Warn.GMOnly'));
  game.socket.emit(SOCKET, { action: 'resyncMusic', userId: game.user.id, fade });
  const restored = resyncLocalMusic({ fade });
  ui.notifications.info(game.i18n.localize(restored ? 'TILECOMPANIONS.Info.ResyncDone' : 'TILECOMPANIONS.Info.ResyncSilence'));
}
