/**
 * The binding between a Tile and its companions (Region / AmbientSound /
 * AmbientLight) — creation, removal, and the two-way synchronisation.
 *
 * Data model — everything lives in flags, nothing in settings:
 *
 *   tile.flags["tile-companions"] = {
 *     region: { id, shapes: [{ points: [u, v, ...], hole }] },  // image fractions, see geometry.js
 *     sound:  { id, u, v },
 *     light:  { id, u, v, rotation }                             // rotation relative to the tile's
 *   }
 *   companion.flags["tile-companions"].tile = tileId            // reverse link
 *
 * Who writes what (so that exactly one client acts on each change):
 *   - tile → companions (move/resize/rotate/flip/hide/delete): the client
 *     that made the tile change (`userId === game.user.id`). Only GMs can
 *     edit tiles, and that client has the scene on its canvas — needed to
 *     re-trace the outline when the image changes.
 *   - companions → tile (a user drags the sound, reshapes the region…):
 *     the designated active GM (`game.users.activeGM`), pure data, no
 *     canvas needed.
 * Every write the module makes carries the `tileCompanions` operation
 * option, so its own hooks ignore the echo.
 */

import { MODULE_ID, KINDS, DOC_NAME, COLLECTION, OPT, SETTING_CASCADE, SETTING_AUTO_RETRACE, SETTING_SYNC_HIDDEN } from './constants.js';
import { tileFrame, toScene, toLocal, shapesToScene, shapesFromRegion, normalizeFlat, fullBoxShapes, pixelsToUnits, round5 } from './geometry.js';
import { traceTileOutline, prettyName } from './trace.js';
import { addClickBehavior } from './behaviors/index.js';

const GEOMETRY_KEYS = ['x', 'y', 'width', 'height', 'rotation'];
const TEXTURE_GEOMETRY_KEYS = ['anchorX', 'anchorY', 'scaleX', 'scaleY'];

const L = (key, data) => data ? game.i18n.format(`TILECOMPANIONS.${key}`, data) : game.i18n.localize(`TILECOMPANIONS.${key}`);
const has = (docOrClass, field) => !!docOrClass?.schema?.fields?.[field];
const ours = () => ({ [OPT]: true });
const normDeg = a => ((a % 360) + 360) % 360;
const docClass = kind => CONFIG[DOC_NAME[kind]].documentClass;

/* -------------------------------------------- */
/*  Reading                                     */
/* -------------------------------------------- */

/** The module's flag data on a tile (never null). */
export function getData(tile) {
  return tile?.flags?.[MODULE_ID] ?? {};
}

/**
 * The live companion documents of a tile.
 * @param {TileDocument} tile
 * @returns {{region: RegionDocument|null, sound: AmbientSoundDocument|null, light: AmbientLightDocument|null}}
 */
export function getCompanions(tile) {
  const data = getData(tile);
  const scene = tile?.parent;
  const out = {};
  for ( const kind of KINDS ) {
    const id = data[kind]?.id;
    out[kind] = (id && scene) ? (scene[COLLECTION[kind]].get(id) ?? null) : null;
  }
  return out;
}

/** Does the tile have at least one live companion? */
export function isBound(tile) {
  const c = getCompanions(tile);
  return KINDS.some(k => c[k]);
}

/** The tile a companion document is bound to, if any. */
export function findTileOf(doc) {
  const id = doc?.flags?.[MODULE_ID]?.tile;
  return id ? (doc.parent?.tiles.get(id) ?? null) : null;
}

/* -------------------------------------------- */
/*  Creating / removing                         */
/* -------------------------------------------- */

/**
 * Create companions for a tile. Each of `region`, `sound`, `light` is
 * `true` (defaults), an options object, or null/undefined (skip). Kinds the
 * tile already has are left alone.
 *
 * @param {TileDocument} tile
 * @param {object} [options]
 * @param {boolean|object} [options.region]  { trace=true, name, color, visibility, behavior: { type, system } }
 * @param {boolean|object} [options.sound]   { path, radius, volume=0.5, repeat=true, walls=true, easing=true, u=0.5, v=0.5, name }
 * @param {boolean|object} [options.light]   { dim, bright, color, angle=360, animation, walls=true, vision=false, u=0.5, v=0.5, rotation=0, name }
 * @param {boolean} [options.openSheets=true]  open the sound/light config sheets afterwards
 * @returns {Promise<{region?: RegionDocument, sound?: AmbientSoundDocument, light?: AmbientLightDocument, traced?: boolean}>}
 */
export async function bind(tile, { region = null, sound = null, light = null, openSheets = true } = {}) {
  if ( !game.user.isGM ) { ui.notifications.warn(L('Warn.GMOnly')); return {}; }
  const scene = tile?.parent;
  if ( !scene ) { ui.notifications.warn(L('Warn.NoScene')); return {}; }

  const frame = tileFrame(tile);
  const existing = getCompanions(tile);
  const flag = foundry.utils.deepClone(getData(tile));
  const created = {};
  const link = { [MODULE_ID]: { tile: tile.id } };
  const levels = has(tile, 'levels') ? [...(tile._source.levels ?? [])] : null;
  const applyCommon = (data, kind) => {
    const cls = docClass(kind);
    data.flags = link;
    if ( has(cls, 'hidden') ) data.hidden = !!tile.hidden;
    if ( levels && has(cls, 'levels') ) data.levels = levels;
    if ( kind !== 'region' && has(cls, 'elevation') ) data.elevation = tile.elevation ?? 0;
    return data;
  };
  const defaultRadius = pixelsToUnits(scene, Math.max(frame.w, frame.h));

  // Region — traced outline, else the tile's box.
  if ( region && !existing.region ) {
    const opts = region === true ? {} : region;
    let shapes = null, traced = false;
    if ( opts.trace !== false ) {
      try {
        const pts = await traceTileOutline(tile);
        if ( pts ) { shapes = [{ points: normalizeFlat(frame, pts), hole: false }]; traced = true; }
      } catch(err) {
        console.warn(`${MODULE_ID} | alpha tracing failed, using the tile box:`, err);
      }
    }
    shapes ??= fullBoxShapes();
    const data = applyCommon({ name: opts.name || prettyName(tile), shapes: shapesToScene(frame, shapes) }, 'region');
    if ( opts.color ) data.color = opts.color;
    if ( opts.visibility != null ) data.visibility = opts.visibility;
    const [doc] = await scene.createEmbeddedDocuments('Region', [data], ours());
    flag.region = { id: doc.id, shapes };
    created.region = doc;
    created.traced = traced;
    // Optional click behavior: { type: 'clickMacro'|'toScene'|'openDocument'|'jukebox', system }
    if ( opts.behavior?.type ) {
      created.behavior = await addClickBehavior(doc, opts.behavior.type, opts.behavior.system ?? {}, ours());
    }
  }

  // Sound — at the tile's centre by default, radius = the tile's larger side.
  if ( sound && !existing.sound ) {
    const opts = sound === true ? {} : sound;
    const u = opts.u ?? 0.5, v = opts.v ?? 0.5;
    const p = toScene(frame, u, v);
    const data = applyCommon({
      x: Math.round(p.x), y: Math.round(p.y),
      radius: opts.radius ?? defaultRadius,
      path: opts.path ?? '',
      repeat: opts.repeat ?? true,
      volume: opts.volume ?? 0.5,
      walls: opts.walls ?? true,
      easing: opts.easing ?? true
    }, 'sound');
    if ( has(docClass('sound'), 'name') ) data.name = opts.name || prettyName(tile);
    const [doc] = await scene.createEmbeddedDocuments('AmbientSound', [data], ours());
    flag.sound = { id: doc.id, u, v };
    created.sound = doc;
  }

  // Light — at the tile's centre, dim = larger side, bright = half; turns with the tile.
  if ( light && !existing.light ) {
    const opts = light === true ? {} : light;
    const u = opts.u ?? 0.5, v = opts.v ?? 0.5;
    const rel = opts.rotation ?? 0;
    const p = toScene(frame, u, v);
    const dim = opts.dim ?? defaultRadius;
    const bright = opts.bright ?? Math.round(dim / 2 * 100) / 100;
    const config = { dim, bright, color: opts.color || null, angle: opts.angle ?? 360 };
    if ( opts.animation ) config.animation = opts.animation;
    const data = applyCommon({
      x: Math.round(p.x), y: Math.round(p.y),
      rotation: normDeg(frame.rot + rel),
      walls: opts.walls ?? true,
      vision: opts.vision ?? false,
      config
    }, 'light');
    if ( has(docClass('light'), 'name') ) data.name = opts.name || prettyName(tile);
    const [doc] = await scene.createEmbeddedDocuments('AmbientLight', [data], ours());
    flag.light = { id: doc.id, u, v, rotation: rel };
    created.light = doc;
  }

  const kinds = KINDS.filter(k => created[k]);
  if ( !kinds.length ) { ui.notifications.info(L('Info.NothingToDo')); return created; }
  await tile.update({ [`flags.${MODULE_ID}`]: flag }, ours());

  ui.notifications.info(L(created.region ? (created.traced ? 'Info.BoundTraced' : 'Info.BoundBox') : 'Info.Bound', {
    name: prettyName(tile),
    list: kinds.map(k => L(`Kind.${k}`)).join(', ')
  }));
  if ( openSheets ) {
    for ( const k of ['sound', 'light'] ) created[k]?.sheet?.render({ force: true });
    created.behavior?.sheet?.render({ force: true });
  }
  return created;
}

/**
 * Detach companions from a tile — deleting them (default) or leaving them
 * in the scene as ordinary, independent documents.
 * @param {TileDocument} tile
 * @param {object} [options]
 * @param {boolean} [options.remove=true]
 * @param {string[]} [options.kinds=KINDS]
 */
export async function unbind(tile, { remove = true, kinds = KINDS } = {}) {
  if ( !game.user.isGM ) return ui.notifications.warn(L('Warn.GMOnly'));
  const scene = tile?.parent;
  const c = getCompanions(tile);
  const updates = {};
  for ( const kind of kinds ) {
    const doc = c[kind];
    if ( doc && scene ) {
      if ( remove ) await scene.deleteEmbeddedDocuments(DOC_NAME[kind], [doc.id], ours());
      else await doc.update({ [`flags.${MODULE_ID}.-=tile`]: null }, ours());
    }
    if ( getData(tile)[kind] ) updates[`flags.${MODULE_ID}.-=${kind}`] = null;
  }
  if ( Object.keys(updates).length ) await tile.update(updates, ours());
  ui.notifications.info(L(remove ? 'Info.Unbound' : 'Info.Detached', { name: prettyName(tile) }));
}

/* -------------------------------------------- */
/*  Tile → companions                           */
/* -------------------------------------------- */

/**
 * Re-project the companions from the tile's current state.
 * @param {TileDocument} tile
 * @param {object} [what]  which aspects to push (all by default)
 */
export async function sync(tile, { geometry = true, hidden = true, elevation = true, levels = true } = {}) {
  const scene = tile?.parent;
  if ( !scene ) return;
  const data = getData(tile);
  const c = getCompanions(tile);
  const frame = tileFrame(tile);
  const per = { region: {}, sound: {}, light: {} };

  if ( geometry ) {
    if ( c.region && data.region?.shapes?.length ) per.region.shapes = shapesToScene(frame, data.region.shapes);
    if ( c.sound ) {
      const p = toScene(frame, data.sound?.u ?? 0.5, data.sound?.v ?? 0.5);
      per.sound.x = Math.round(p.x); per.sound.y = Math.round(p.y);
    }
    if ( c.light ) {
      const p = toScene(frame, data.light?.u ?? 0.5, data.light?.v ?? 0.5);
      per.light.x = Math.round(p.x); per.light.y = Math.round(p.y);
      per.light.rotation = normDeg(frame.rot + (data.light?.rotation ?? 0));
    }
  }
  if ( hidden && game.settings.get(MODULE_ID, SETTING_SYNC_HIDDEN) ) {
    for ( const k of KINDS ) if ( c[k] && has(c[k], 'hidden') ) per[k].hidden = !!tile.hidden;
  }
  if ( elevation ) {
    for ( const k of ['sound', 'light'] ) if ( c[k] && has(c[k], 'elevation') ) per[k].elevation = tile.elevation ?? 0;
  }
  if ( levels && has(tile, 'levels') ) {
    const value = [...(tile._source.levels ?? [])];
    for ( const k of KINDS ) if ( c[k] && has(c[k], 'levels') ) per[k].levels = value;
  }

  await Promise.all(KINDS.filter(k => c[k] && Object.keys(per[k]).length).map(k =>
    scene.updateEmbeddedDocuments(DOC_NAME[k], [{ _id: c[k].id, ...per[k] }], ours())
  ));
}

/** Sync every bound tile of a scene (after an import, say). */
export async function syncScene(scene = canvas.scene) {
  for ( const tile of scene?.tiles ?? [] ) if ( isBound(tile) ) await sync(tile);
}

/**
 * Trace the tile's image again and reshape its region accordingly.
 * @param {TileDocument} tile
 * @param {object} [options]
 * @param {boolean} [options.waitForTexture=false]  the image just changed: wait for the new texture to load
 * @param {PIXI.Texture} [options.previousTexture]
 * @returns {Promise<object[]|null>}  the stored (normalised) shapes, or null if there is no region
 */
export async function retrace(tile, { waitForTexture = false, previousTexture = null } = {}) {
  const c = getCompanions(tile);
  if ( !c.region ) return null;
  const obj = tile.object;
  if ( !obj ) { console.info(`${MODULE_ID} | tile ${tile.id} is not on this client's canvas, cannot retrace`); return null; }
  if ( waitForTexture ) await waitTexture(obj, previousTexture);
  const frame = tileFrame(tile);
  let shapes = null, traced = false;
  try {
    const pts = await traceTileOutline(tile);
    if ( pts ) { shapes = [{ points: normalizeFlat(frame, pts), hole: false }]; traced = true; }
  } catch(err) {
    console.warn(`${MODULE_ID} | alpha tracing failed, using the tile box:`, err);
  }
  shapes ??= fullBoxShapes();
  await c.region.update({ shapes: shapesToScene(frame, shapes) }, ours());
  await tile.update({ [`flags.${MODULE_ID}.region.shapes`]: shapes }, ours());
  ui.notifications.info(L(traced ? 'Info.Retraced' : 'Info.RetracedBox', { name: prettyName(tile) }));
  return shapes;
}

/** Wait (bounded) for the placeable to have swapped to a new, loaded texture. */
async function waitTexture(obj, before, timeout = 8000) {
  const t0 = Date.now();
  while ( Date.now() - t0 < timeout ) {
    const tex = obj.texture;
    if ( tex && tex !== before && tex.valid && obj.mesh ) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

export function registerHooks() {
  // A pasted / duplicated tile must not inherit the original's links, nor a
  // pasted companion the reverse link (moving the copy would move the
  // original's companions). Scene duplication doesn't go through these hooks,
  // so links survive it — ids are kept, which is exactly right.
  Hooks.on('preCreateTile', (doc, data, options) => {
    if ( options?.[OPT] || !doc.flags?.[MODULE_ID] ) return;
    doc.updateSource({ [`flags.-=${MODULE_ID}`]: null });
  });
  for ( const kind of KINDS ) {
    Hooks.on(`preCreate${DOC_NAME[kind]}`, (doc, data, options) => {
      if ( options?.[OPT] || !doc.flags?.[MODULE_ID]?.tile ) return;
      doc.updateSource({ [`flags.${MODULE_ID}.-=tile`]: null });
    });
    Hooks.on(`update${DOC_NAME[kind]}`, (doc, changed, options) => onUpdateCompanion(kind, doc, changed, options));
    Hooks.on(`delete${DOC_NAME[kind]}`, (doc, options) => onDeleteCompanion(kind, doc, options));
  }
  Hooks.on('updateTile', onUpdateTile);
  Hooks.on('deleteTile', onDeleteTile);
}

function onUpdateTile(tile, changed, options, userId) {
  if ( options?.[OPT] || userId !== game.user.id ) return;
  const data = getData(tile);
  if ( !KINDS.some(k => data[k]) ) return;
  const geometry = GEOMETRY_KEYS.some(k => k in changed)
    || (!!changed.texture && TEXTURE_GEOMETRY_KEYS.some(k => k in changed.texture));
  const hidden = 'hidden' in changed;
  const elevation = 'elevation' in changed;
  const levels = 'levels' in changed;
  const src = !!changed.texture && ('src' in changed.texture);
  const previousTexture = tile.object?.texture ?? null; // the redraw happens on the ticker, after this hook
  (async () => {
    if ( geometry || hidden || elevation || levels ) await sync(tile, { geometry, hidden, elevation, levels });
    if ( src && data.region && game.settings.get(MODULE_ID, SETTING_AUTO_RETRACE) ) {
      await retrace(tile, { waitForTexture: true, previousTexture });
    }
  })().catch(err => console.error(`${MODULE_ID} | sync failed:`, err));
}

function onDeleteTile(tile, options, userId) {
  if ( options?.[OPT] || userId !== game.user.id ) return;
  if ( !game.settings.get(MODULE_ID, SETTING_CASCADE) ) return;
  const scene = tile.parent;
  if ( !scene ) return;
  const data = getData(tile);
  for ( const kind of KINDS ) {
    const id = data[kind]?.id;
    if ( !id || !scene[COLLECTION[kind]].has(id) ) continue;
    scene.deleteEmbeddedDocuments(DOC_NAME[kind], [id], ours())
      .catch(err => console.error(`${MODULE_ID} | cascade delete failed:`, err));
  }
}

/* -------------------------------------------- */
/*  Companions → tile                           */
/* -------------------------------------------- */

function onUpdateCompanion(kind, doc, changed, options) {
  if ( options?.[OPT] ) return;
  if ( game.users.activeGM?.id !== game.user.id ) return;
  const tile = findTileOf(doc);
  if ( !tile || getData(tile)[kind]?.id !== doc.id ) return;
  const frame = tileFrame(tile);
  const updates = {};
  if ( kind === 'region' ) {
    if ( 'shapes' in changed ) updates[`flags.${MODULE_ID}.region.shapes`] = shapesFromRegion(doc, frame);
  } else {
    if ( ('x' in changed) || ('y' in changed) ) {
      const { u, v } = toLocal(frame, doc.x, doc.y);
      updates[`flags.${MODULE_ID}.${kind}.u`] = round5(u);
      updates[`flags.${MODULE_ID}.${kind}.v`] = round5(v);
    }
    if ( kind === 'light' && ('rotation' in changed) ) {
      updates[`flags.${MODULE_ID}.light.rotation`] = normDeg(doc.rotation - frame.rot);
    }
  }
  if ( !Object.keys(updates).length ) return;
  tile.update(updates, ours()).catch(err => console.error(`${MODULE_ID} | reverse sync failed:`, err));
}

function onDeleteCompanion(kind, doc, options) {
  if ( options?.[OPT] ) return;
  if ( game.users.activeGM?.id !== game.user.id ) return;
  const tile = findTileOf(doc);
  if ( !tile || getData(tile)[kind]?.id !== doc.id ) return;
  tile.update({ [`flags.${MODULE_ID}.-=${kind}`]: null }, ours())
    .catch(err => console.error(`${MODULE_ID} | unlink failed:`, err));
}
