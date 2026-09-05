/**
 * Jukebox — a per-player, local music player driven by a Playlist
 * document, without touching that document (so no permission needed, no
 * GM needed).
 *
 * Rules:
 *   - starting a jukebox fades out the table's MUSIC channel only (playlist
 *     sounds whose effective channel is "music"): environment and interface
 *     sounds are left alone;
 *   - the jukebox itself plays on the INTERFACE channel, so each player can
 *     raise/lower it with their Interface volume slider independently of
 *     the GM's music;
 *   - stopping it re-syncs whatever playlists the documents say are
 *     playing, so the GM's music comes back;
 *   - the state is published in the player's own User flags
 *     (flags.tile-companions.jukebox) so the GM can list who listens to
 *     what — cleared on stop, and on reload (audio never survives one);
 *   - activating a scene (GM) stops every jukebox at the table.
 *
 * Playback modes mirror the playlist's: sequential (in order, looping),
 * shuffle (random, never twice in a row), simultaneous (all at once);
 * per-track `repeat` loops that track.
 */

import { MODULE_ID } from '../constants.js';
import { fields, clickFields, COMMON_PREFIX } from './common.js';

const FLAG = 'jukebox';
const FADE_IN = 1500;
const FADE_OUT = 1200;

/** Local playback state (null when silent). */
let state = null; // { playlist, sounds: Set<Sound>, order: PlaylistSound[], index, token, mode }

export class JukeboxBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static LOCALIZATION_PREFIXES = ['TILECOMPANIONS.JukeboxBehavior', COMMON_PREFIX];

  static defineSchema() {
    return {
      playlist: new fields.DocumentUUIDField({ type: 'Playlist', required: true, blank: false, nullable: true, initial: null }),
      // Playback mode override; 'playlist' = honor the playlist's own mode.
      mode: new fields.StringField({
        required: true, blank: false, initial: 'playlist',
        choices: {
          playlist: 'TILECOMPANIONS.JukeboxBehavior.FIELDS.mode.choices.playlist',
          sequential: 'TILECOMPANIONS.JukeboxBehavior.FIELDS.mode.choices.sequential',
          shuffle: 'TILECOMPANIONS.JukeboxBehavior.FIELDS.mode.choices.shuffle',
          simultaneous: 'TILECOMPANIONS.JukeboxBehavior.FIELDS.mode.choices.simultaneous'
        }
      }),
      ...clickFields()
    };
  }

  static events = {};

  get displayName() {
    if ( this.label ) return this.label;
    const pl = this.playlist ? fromUuidSync(this.playlist) : null;
    return pl?.name ?? this.region?.name ?? '';
  }
}

/** Click handler: toggle. */
export async function executeJukebox(behavior) {
  const uuid = behavior.system.playlist;
  if ( !uuid ) return ui.notifications.warn(game.i18n.localize('TILECOMPANIONS.Warn.NoPlaylist'));
  const mode = behavior.system.mode === 'playlist' ? null : behavior.system.mode;
  return toggle(uuid, { mode });
}

/* -------------------------------------------- */
/*  Engine                                      */
/* -------------------------------------------- */

function channelOf(sound) {
  return (sound.channel || sound.parent?.channel) ?? 'music';
}

export function isPlaying() {
  return !!state && [...state.sounds].some(s => s.playing);
}

export function status() {
  if ( !state ) return null;
  const current = state.order[state.index];
  return { playlist: state.playlist.name, uuid: state.playlist.uuid, track: current?.name ?? null };
}

export async function start(playlistOrUuid, { mode = null } = {}) {
  const playlist = typeof playlistOrUuid === 'string' ? await fromUuid(playlistOrUuid) : playlistOrUuid;
  if ( !playlist || playlist.documentName !== 'Playlist' ) {
    return ui.notifications.warn(game.i18n.localize('TILECOMPANIONS.Warn.NoPlaylist'));
  }
  const tracks = playlist.sounds.contents.sort((a, b) => a.sort - b.sort);
  if ( !tracks.length ) return ui.notifications.warn(game.i18n.localize('TILECOMPANIONS.Warn.EmptyPlaylist'));

  await stopLocal({ resync: false });

  // Fade out the table's music channel — locally, without touching documents.
  for ( const p of game.playlists ) for ( const s of p.sounds ) {
    if ( s.sound?.playing && channelOf(s) === 'music' ) s.sound.stop({ fade: FADE_OUT, volume: 0 });
  }

  const token = Symbol('jukebox');
  const M = CONST.PLAYLIST_MODES;
  const modeMap = { sequential: M.SEQUENTIAL, shuffle: M.SHUFFLE, simultaneous: M.SIMULTANEOUS };
  const effectiveMode = modeMap[mode] ?? playlist.mode;
  state = { playlist, sounds: new Set(), order: tracks, index: -1, token, mode: effectiveMode };

  if ( effectiveMode === M.SIMULTANEOUS ) {
    for ( const t of tracks ) await playTrack(t, token, tracks.indexOf(t));
  } else {
    await playNext(token, null);
  }
  await publish();
  const s = status();
  ui.notifications.info(game.i18n.format('TILECOMPANIONS.Info.JukeboxOn', { playlist: s.playlist, track: s.track ?? '' }));
}

async function playNext(token, prev) {
  if ( !state || state.token !== token ) return;
  const M = CONST.PLAYLIST_MODES;
  const { order } = state;
  let next;
  if ( state.mode === M.SHUFFLE ) {
    const pool = order.length > 1 ? order.filter(t => t !== prev) : order;
    next = pool[Math.floor(Math.random() * pool.length)];
  } else {
    next = order[(order.indexOf(prev) + 1) % order.length];
  }
  state.index = order.indexOf(next);
  await playTrack(next, token, state.index);
}

async function playTrack(track, token, index) {
  const snd = await foundry.audio.AudioHelper.play({ src: track.path, volume: 0, loop: track.repeat, channel: 'interface' }, false);
  if ( !snd ) return;
  if ( !state || state.token !== token ) { snd.stop(); return; }
  state.sounds.add(snd);
  state.index = index;
  snd.fade(track.volume, { duration: FADE_IN, from: 0 });
  if ( !track.repeat && state.mode !== CONST.PLAYLIST_MODES.SIMULTANEOUS ) {
    snd.addEventListener('end', () => {
      if ( state?.token === token && state.sounds.has(snd) ) {
        state.sounds.delete(snd);
        playNext(token, track).then(publish);
      }
    }, { once: true });
  }
}

/**
 * Stop the local jukebox (fade) and bring the GM's music back.
 * @param {object} [options]
 * @param {boolean} [options.resync=true]
 * @param {boolean} [options.silent=false]
 */
export async function stop({ resync = true, silent = false } = {}) {
  const was = isPlaying();
  const restored = await stopLocal({ resync });
  if ( was && !silent ) {
    ui.notifications.info(game.i18n.localize(restored ? 'TILECOMPANIONS.Info.JukeboxOffResumed' : 'TILECOMPANIONS.Info.JukeboxOff'));
  }
  return was;
}

async function stopLocal({ resync }) {
  if ( state ) {
    for ( const snd of state.sounds ) snd.stop({ fade: FADE_OUT, volume: 0 });
    state = null;
  }
  await unpublish();
  let restored = false;
  if ( resync ) {
    for ( const p of game.playlists.playing ) for ( const s of p.sounds ) {
      if ( s.playing ) { s.sync(); restored = true; }
    }
  }
  return restored;
}

/** Toggle: stop if any jukebox is playing, else start this playlist. */
export async function toggle(playlistOrUuid, options = {}) {
  if ( isPlaying() ) return stop();
  return start(playlistOrUuid, options);
}

/* -------------------------------------------- */
/*  Published state (User flags)                */
/* -------------------------------------------- */

async function publish() {
  const s = status();
  if ( !s ) return;
  try { await game.user.setFlag(MODULE_ID, FLAG, { ...s, since: Date.now() }); }
  catch(err) { console.warn(`${MODULE_ID} | jukebox flag:`, err); }
}

async function unpublish() {
  if ( game.user.getFlag(MODULE_ID, FLAG) === undefined ) return;
  try { await game.user.unsetFlag(MODULE_ID, FLAG); }
  catch(err) { console.warn(`${MODULE_ID} | jukebox flag:`, err); }
}

/** Every user currently publishing a jukebox (GM helper). */
export function listActive() {
  return game.users.contents
    .map(u => ({ user: u, jukebox: u.getFlag(MODULE_ID, FLAG) }))
    .filter(e => e.jukebox && e.user.active)
    .map(e => ({ userName: e.user.name, characterName: e.user.character?.name ?? null, ...e.jukebox }));
}

export function registerJukeboxHooks() {
  Hooks.once('ready', () => { unpublish(); });   // audio never survives a reload: drop stale state
  Hooks.on('updateScene', (scene, changes) => {  // GM activating a scene ends every jukebox
    if ( changes.active === true && isPlaying() ) stop({ silent: false });
  });
}
