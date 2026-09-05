/**
 * Canvas side of the click behaviors: make Regions carrying one of them
 * clickable for every user (players included), with a hover highlight,
 * a name label and a pointer cursor.
 *
 * Why not rely on the Region placeable itself: for players the Region
 * layer is never active and regions are usually invisible, and Region
 * behaviors receive no click events. So we:
 *   - listen to pointer events on canvas.stage (re-attached at every
 *     canvasReady, since core removes all stage listeners on redraw),
 *   - hit-test the pointer against `regionDocument.polygonTree`,
 *   - draw our own highlight in the interface group — purely decorative
 *     (eventMode 'none'): an interactive PIXI object there would capture
 *     pointer events and keep the GM from grabbing what lies under it.
 *
 * The GM only triggers clicks from the Token layer, so editing tools keep
 * their clicks.
 */

import { MODULE_ID } from './constants.js';
import { CLICK_HANDLERS } from './behaviors/index.js';

const CLICK_TOLERANCE_PX = 6;   // screen pixels of pointer travel still counted as a click
const HOVER_ALPHA = 0.16;       // discreet tints — the region must read as a hint, not a slab
const ALWAYS_ALPHA = 0.06;

let container = null;          // PIXI.Container in canvas.interface
let hovered = null;            // { region, behavior } | null
let downAt = null;             // screen coords at pointerdown
let mouseHandlerRegistered = false;
let cursorTicker = null;

/* -------------------------------------------- */
/*  Public                                      */
/* -------------------------------------------- */

export function registerCanvasHooks() {
  Hooks.on('canvasReady', onCanvasReady);
  Hooks.on('canvasTearDown', onCanvasTearDown);
  for ( const hook of ['createRegion', 'updateRegion', 'deleteRegion', 'createRegionBehavior', 'updateRegionBehavior', 'deleteRegionBehavior'] ) {
    Hooks.on(hook, () => { if ( canvas?.ready ) refreshStatic(); });
  }
}

/**
 * All (region, behavior) pairs on the current scene that are clickable
 * for the current user — one clickable behavior per region (the first
 * enabled one).
 * @returns {{region: RegionDocument, behavior: RegionBehavior}[]}
 */
export function getClickableRegions() {
  const out = [];
  if ( !canvas?.scene ) return out;
  for ( const region of canvas.scene.regions ) {
    if ( region.hidden && !game.user.isGM ) continue;
    for ( const behavior of region.behaviors ) {
      if ( !(behavior.type in CLICK_HANDLERS) || behavior.disabled ) continue;
      out.push({ region, behavior });
      break;
    }
  }
  return out;
}

/* -------------------------------------------- */
/*  Canvas lifecycle                            */
/* -------------------------------------------- */

function onCanvasReady() {
  container = canvas.interface.addChild(new PIXI.Container());
  container.name = `${MODULE_ID}-highlights`;
  container.zIndex = 1000;
  container.eventMode = 'none';
  container.sortableChildren = true;
  if ( typeof canvas.interface.sortChildren === 'function' ) canvas.interface.sortChildren();

  canvas.stage.on('pointerdown', onPointerDown);
  canvas.stage.on('pointerup', onPointerUp);
  canvas.stage.on('pointerupoutside', onPointerCancel);
  if ( !mouseHandlerRegistered ) {
    canvas.registerMouseMoveHandler(onMouseMove, 0, null, true);
    mouseHandlerRegistered = true;
  }
  hovered = null;
  refreshStatic();
}

function onCanvasTearDown() {
  enforceCursor(false);
  hovered = null;
  downAt = null;
  container = null; // destroyed with the interface group
}

/* -------------------------------------------- */
/*  Hit testing & pointer handling              */
/* -------------------------------------------- */

function hitTest(point) {
  for ( const entry of getClickableRegions() ) {
    if ( entry.region.polygonTree.testPoint(point) ) return entry;
  }
  return null;
}

function onMouseMove(worldPos) {
  if ( !canvas.ready || !container ) return;
  const hit = hitTest(worldPos);
  if ( hit?.region === hovered?.region ) return;
  hovered = hit;
  drawHover();
  enforceCursor(!!hit);
}

function onPointerDown(event) {
  if ( event.button !== 0 ) return;
  const g = event.global;
  downAt = { x: g.x, y: g.y };
}

function onPointerCancel() {
  downAt = null;
}

function onPointerUp(event) {
  if ( event.button !== 0 || !downAt ) return;
  const g = event.global;
  const moved = Math.hypot(g.x - downAt.x, g.y - downAt.y);
  downAt = null;
  if ( moved > CLICK_TOLERANCE_PX ) return; // that was a drag/pan
  if ( game.user.isGM && (canvas.activeLayer !== canvas.tokens) ) return; // don't steal editing clicks
  const world = event.getLocalPosition(canvas.stage);
  const hit = hitTest(world);
  if ( !hit ) return;
  CLICK_HANDLERS[hit.behavior.type]?.(hit.behavior);
}

/**
 * Pointer cursor over a clickable region — written to the canvas style
 * each frame from a ticker, not with an interactive PIXI hit object (which
 * would capture pointer events). Re-asserted per frame because some
 * systems (CoC7's Chaosium Canvas Interface, for one) reset the cursor on
 * every mousemove. Only on the Token layer, never in editing modes.
 */
function enforceCursor(active) {
  if ( cursorTicker ) { canvas.app?.ticker?.remove(cursorTicker); cursorTicker = null; }
  const view = canvas.app?.view;
  if ( !view ) return;
  if ( !active ) {
    canvas.app.renderer.events.currentCursor = null; // let PIXI re-evaluate on the next move
    view.style.cursor = cursorStyle('default');
    return;
  }
  cursorTicker = () => {
    if ( !hovered || downAt ) return;
    if ( canvas.activeLayer !== canvas.tokens ) return;
    const want = cursorStyle('pointer');
    if ( view.style.cursor !== want ) view.style.cursor = want;
  };
  canvas.app.ticker.add(cursorTicker);
}

function cursorStyle(mode) {
  const style = canvas.app?.renderer?.events?.cursorStyles?.[mode];
  return typeof style === 'string' ? style : mode;
}

/* -------------------------------------------- */
/*  Drawing                                     */
/* -------------------------------------------- */

function refreshStatic() {
  if ( !container ) return;
  for ( const child of [...container.children] ) if ( child.name === 'static' ) child.destroy({ children: true });
  const g = new PIXI.Graphics();
  g.name = 'static';
  g.zIndex = 0;
  g.eventMode = 'none';
  for ( const { region, behavior } of getClickableRegions() ) {
    if ( behavior.system.highlight !== 'always' ) continue;
    fillRegion(g, region, colorOf(region, behavior), ALWAYS_ALPHA, false);
  }
  container.addChild(g);
  drawHover();
}

function drawHover() {
  if ( !container ) return;
  for ( const child of [...container.children] ) if ( child.name === 'hover' ) child.destroy({ children: true });
  if ( !hovered ) return;
  const { region, behavior } = hovered;
  if ( behavior.system.highlight === 'never' ) return;
  const wrap = new PIXI.Container();
  wrap.name = 'hover';
  wrap.zIndex = 1;
  wrap.eventMode = 'none';
  const g = new PIXI.Graphics();
  fillRegion(g, region, colorOf(region, behavior), HOVER_ALPHA, true);
  wrap.addChild(g);

  const name = behavior.system.displayName;
  if ( name ) {
    const style = CONFIG.canvasTextStyle.clone();
    style.fontSize = Math.max(20, Math.round(canvas.dimensions.size * 0.32));
    style.fill = 0xffffff;
    style.stroke = 0x000000;
    style.strokeThickness = 4;
    const PreciseText = foundry.canvas.containers?.PreciseText ?? globalThis.PreciseText;
    const text = new PreciseText(name, style);
    const b = region.bounds;
    text.anchor.set(0.5, 1);
    text.position.set(b.x + b.width / 2, b.y - 6);
    wrap.addChild(text);
  }
  container.addChild(wrap);
}

function fillRegion(g, region, color, alpha, outline) {
  if ( outline ) g.lineStyle({ width: 3, color, alpha: Math.min(1, alpha * 3) });
  g.beginFill(color, alpha);
  for ( const poly of region.polygons ) g.drawPolygon(poly);
  g.endFill();
  if ( outline ) g.lineStyle(0); // PIXI: lineStyle() with no argument throws
}

function colorOf(region, behavior) {
  const c = behavior.system.color ?? region.color;
  return Number(c ?? 0xffffff);
}
