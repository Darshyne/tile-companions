/**
 * Alpha-outline tracing of a Tile's image → scene-space polygon.
 *
 * Lifted from coc7-dialogues' tile-to-region tool (same author). The
 * visible (alpha) outline of the texture is traced (Moore neighbour tracing
 * on a downscaled alpha mask, Douglas-Peucker simplification) and projected
 * into scene coordinates through the tile mesh's own LOCAL transform — so
 * anchor, scale/flip, rotation and fit mode are all honoured without
 * re-implementing Foundry's texture math. The primary group sits at the
 * scene origin, so local = scene; and unlike worldTransform, the local
 * transform is current even when no frame has been rendered yet.
 *
 * Trap (verified on V14): the mesh position/scale/rotation are set by the
 * placeable's render flags, flushed on the ticker — a freshly created tile
 * (or a hidden browser tab) still has its mesh at the origin. Hence
 * `applyRenderFlags()` before reading.
 *
 * Returns null when the pixels can't be read (video tile, cross-origin
 * image without CORS → tainted canvas); callers fall back to the box.
 */

import { MODULE_ID } from './constants.js';

const MASK_MAX = 256;        // longest side of the alpha mask used for tracing
const ALPHA_THRESHOLD = 48;  // 0-255: pixels above count as "visible"
const SIMPLIFY_EPS = 1.25;   // Douglas-Peucker tolerance, in mask pixels

/**
 * @param {TileDocument} tile
 * @returns {Promise<number[]|null>}  flat [x, y, ...] scene polygon
 */
export async function traceTileOutline(tile) {
  const obj = tile.object;
  if ( !obj ) return null;
  obj.applyRenderFlags?.();
  const mesh = obj.mesh;
  const texture = mesh?.texture;
  const source = texture?.baseTexture?.resource?.source;
  if ( !mesh || !texture?.valid || !source || (source instanceof HTMLVideoElement) ) return null;

  const texW = texture.orig?.width ?? texture.width, texH = texture.orig?.height ?? texture.height;
  const scale = Math.min(1, MASK_MAX / Math.max(texW, texH));
  const w = Math.max(2, Math.round(texW * scale)), h = Math.max(2, Math.round(texH * scale));
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const ctx = off.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data; // throws on tainted canvases → caller falls back

  // Binary mask with a 1px transparent border so the tracer never runs off the edge.
  const W = w + 2, H = h + 2;
  const mask = new Uint8Array(W * H);
  let count = 0;
  for ( let y = 0; y < h; y++ ) for ( let x = 0; x < w; x++ ) {
    if ( data[(y * w + x) * 4 + 3] > ALPHA_THRESHOLD ) { mask[(y + 1) * W + (x + 1)] = 1; count++; }
  }
  if ( count < 4 ) return null;

  const contour = traceLargestContour(mask, W, H);
  if ( !contour || contour.length < 3 ) return null;
  const simplified = simplify(contour, SIMPLIFY_EPS);
  if ( simplified.length < 3 ) return null;

  // Mask pixel → texture pixel → sprite-local (anchor-relative) → scene.
  const ax = mesh.anchor?.x ?? (tile.texture?.anchorX ?? 0), ay = mesh.anchor?.y ?? (tile.texture?.anchorY ?? 0);
  mesh.transform.updateLocalTransform();
  const M = mesh.transform.localTransform;
  const out = [];
  const tmp = new PIXI.Point();
  for ( const [mx, my] of simplified ) {
    const px = (mx - 1) / scale, py = (my - 1) / scale;
    tmp.set(px - ax * texW, py - ay * texH);
    M.apply(tmp, tmp);
    out.push(Math.round(tmp.x), Math.round(tmp.y));
  }
  return out;
}

/** Moore neighbour tracing of the outer contour of the largest 4-connected blob. */
function traceLargestContour(mask, W, H) {
  const label = new Int32Array(W * H);
  let best = null, bestSize = 0, next = 1;
  const stack = [];
  for ( let i = 0; i < mask.length; i++ ) {
    if ( !mask[i] || label[i] ) continue;
    let size = 0; stack.push(i); label[i] = next;
    while ( stack.length ) {
      const p = stack.pop(); size++;
      const x = p % W, y = (p / W) | 0;
      for ( const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] ) {
        const nx = x + dx, ny = y + dy;
        if ( nx < 0 || ny < 0 || nx >= W || ny >= H ) continue;
        const q = ny * W + nx;
        if ( mask[q] && !label[q] ) { label[q] = next; stack.push(q); }
      }
    }
    if ( size > bestSize ) { bestSize = size; best = next; }
    next++;
  }
  if ( !best ) return null;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && label[y * W + x] === best;

  let sx = -1, sy = -1;
  for ( let i = 0; i < label.length; i++ ) if ( label[i] === best ) { sx = i % W; sy = (i / W) | 0; break; }

  const N = [[-1,0],[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1]];
  const contour = [[sx, sy]];
  let cx = sx, cy = sy, backtrack = 0;
  const maxSteps = bestSize * 4 + 8;
  for ( let steps = 0; steps < maxSteps; steps++ ) {
    let found = false;
    for ( let k = 0; k < 8; k++ ) {
      const dir = (backtrack + k) % 8;
      const nx = cx + N[dir][0], ny = cy + N[dir][1];
      if ( inside(nx, ny) ) {
        backtrack = (dir + 6) % 8;
        cx = nx; cy = ny;
        found = true;
        break;
      }
    }
    if ( !found ) break;
    if ( cx === sx && cy === sy ) break;
    contour.push([cx, cy]);
  }
  return contour;
}

/** Douglas-Peucker (closed polygon treated as an open chain from its first point). */
function simplify(points, eps) {
  if ( points.length <= 3 ) return points;
  const sq = eps * eps;
  const keep = new Uint8Array(points.length); keep[0] = 1; keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while ( stack.length ) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = points[a], [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
    for ( let i = a + 1; i < b; i++ ) {
      const [px, py] = points[i];
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const ex = ax + t * dx - px, ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if ( d > maxD ) { maxD = d; idx = i; }
    }
    if ( maxD > sq && idx > 0 ) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

/** Human-readable name from a tile: its name (V14), else its image file name. */
export function prettyName(tile) {
  if ( tile?.name ) return tile.name;
  const src = tile?.texture?.src;
  const fallback = game.i18n.localize('TILECOMPANIONS.DefaultName');
  if ( !src ) return fallback;
  const base = decodeURIComponent(src.split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '');
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase()) || fallback;
}
