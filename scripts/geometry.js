/**
 * Tile-local coordinate frame.
 *
 * Everything the module remembers about a companion is expressed relative
 * to the tile's *unrotated box*, as fractions (u, v) of the image — u = 0
 * on the left edge, 1 on the right edge; v likewise top → bottom — and
 * "of the image" means mirrored back whenever the tile is flipped
 * (texture.scaleX/scaleY < 0 — Foundry mirrors about the anchor point, so
 * do we). Moving, resizing, rotating or flipping the
 * tile is then a pure re-projection of those fractions: no need to know
 * what the companion looked like in scene space before the change.
 *
 * V14: tile.x/y is the texture ANCHOR point (anchorX/Y default 0.5) and
 * rotation pivots around it. V13: tile.x/y is the top-left corner and
 * rotation pivots around the centre.
 */

const PRECISION = 1e5;

export function isV14() {
  return (game.release?.generation ?? 13) >= 14;
}

/**
 * @typedef {object} TileFrame
 * @property {number} left   scene x of the unrotated box's left edge
 * @property {number} top    scene y of the unrotated box's top edge
 * @property {number} w
 * @property {number} h
 * @property {{x: number, y: number}} pivot  rotation pivot (scene coords)
 * @property {number} rot    degrees
 * @property {boolean} flipX
 * @property {boolean} flipY
 */

/** @param {TileDocument} tile @returns {TileFrame} */
export function tileFrame(tile) {
  const w = tile.width ?? 0, h = tile.height ?? 0;
  const v14 = isV14();
  const ax = v14 ? (tile.texture?.anchorX ?? 0.5) : 0;
  const ay = v14 ? (tile.texture?.anchorY ?? 0.5) : 0;
  const left = tile.x - ax * w, top = tile.y - ay * h;
  const pivot = v14 ? { x: tile.x, y: tile.y } : { x: left + w / 2, y: top + h / 2 };
  // A negative texture scale mirrors the image about its ANCHOR (V14), about its centre (V13).
  const mirror = v14 ? { u: ax, v: ay } : { u: 0.5, v: 0.5 };
  return {
    left, top, w, h, pivot, mirror,
    rot: tile.rotation ?? 0,
    flipX: (tile.texture?.scaleX ?? 1) < 0,
    flipY: (tile.texture?.scaleY ?? 1) < 0
  };
}

/** Image fraction → scene point. */
export function toScene(frame, u, v) {
  if ( frame.flipX ) u = 2 * frame.mirror.u - u;
  if ( frame.flipY ) v = 2 * frame.mirror.v - v;
  const px = frame.left + u * frame.w, py = frame.top + v * frame.h;
  if ( !frame.rot ) return { x: px, y: py };
  const rad = Math.toRadians(frame.rot), cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = px - frame.pivot.x, dy = py - frame.pivot.y;
  return { x: frame.pivot.x + dx * cos - dy * sin, y: frame.pivot.y + dx * sin + dy * cos };
}

/** Scene point → image fraction (inverse of toScene). */
export function toLocal(frame, x, y) {
  if ( frame.rot ) {
    const rad = Math.toRadians(-frame.rot), cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = x - frame.pivot.x, dy = y - frame.pivot.y;
    x = frame.pivot.x + dx * cos - dy * sin;
    y = frame.pivot.y + dx * sin + dy * cos;
  }
  let u = frame.w ? (x - frame.left) / frame.w : 0.5;
  let v = frame.h ? (y - frame.top) / frame.h : 0.5;
  if ( frame.flipX ) u = 2 * frame.mirror.u - u;
  if ( frame.flipY ) v = 2 * frame.mirror.v - v;
  return { u, v };
}

export const round5 = n => Math.round(n * PRECISION) / PRECISION;

/** Flat scene polygon [x, y, ...] → flat fractions [u, v, ...]. */
export function normalizeFlat(frame, points) {
  const out = [];
  for ( let i = 0; i + 1 < points.length; i += 2 ) {
    const { u, v } = toLocal(frame, points[i], points[i + 1]);
    out.push(round5(u), round5(v));
  }
  return out;
}

/** Flat fractions [u, v, ...] → flat scene polygon (integers). */
export function projectFlat(frame, points) {
  const out = [];
  for ( let i = 0; i + 1 < points.length; i += 2 ) {
    const { x, y } = toScene(frame, points[i], points[i + 1]);
    out.push(Math.round(x), Math.round(y));
  }
  return out;
}

/** Stored shapes → Region `shapes` data (polygons only). */
export function shapesToScene(frame, shapes) {
  return shapes
    .filter(s => Array.isArray(s?.points) && s.points.length >= 6)
    .map(s => ({ type: 'polygon', hole: !!s.hole, points: projectFlat(frame, s.points) }));
}

/**
 * Current Region geometry → stored shapes, walking the region's polygon
 * tree so rectangles, circles, ellipses and holes all come back as
 * (possibly holed) polygons. Depth 1 = solid, depth 2 = hole, and so on.
 */
export function shapesFromRegion(region, frame) {
  const out = [];
  const walk = node => {
    for ( const child of node.children ?? [] ) {
      const pts = child.points;
      if ( pts && pts.length >= 6 ) out.push({ points: normalizeFlat(frame, pts), hole: !!child.isHole });
      walk(child);
    }
  };
  walk(region.polygonTree);
  return out;
}

/** Whole tile box, as stored shapes. */
export function fullBoxShapes() {
  return [{ points: [0, 0, 1, 0, 1, 1, 0, 1], hole: false }];
}

/** Pixels → scene distance units (what sound radius / light dim use). */
export function pixelsToUnits(scene, px) {
  const size = scene.grid?.size || 100, dist = scene.grid?.distance || 5;
  return Math.round((px / size) * dist * 100) / 100;
}
