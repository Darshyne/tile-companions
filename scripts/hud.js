/**
 * GM-facing UI: a button in the Tile HUD (and the `promptBind` API used by
 * macros) opening one dialog to add a region / sound / light to the
 * selected tile(s), re-trace an existing region, or detach everything.
 */

import { MODULE_ID, KINDS } from './constants.js';
import { bind, unbind, retrace, getCompanions, isBound } from './link.js';
import { tileFrame, pixelsToUnits } from './geometry.js';
import { prettyName } from './trace.js';
import { CLICK_BEHAVIORS, behaviorLabel } from './behaviors/index.js';

const L = k => game.i18n.localize(`TILECOMPANIONS.${k}`);

/** Tile HUD button (GM only). */
export function registerTileHud() {
  Hooks.on('renderTileHUD', (hud, html) => {
    if ( !game.user.isGM ) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const col = root?.querySelector('.col.right');
    if ( !col || col.querySelector('[data-tile-companions]') ) return;
    const bound = isBound(hud.document);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `control-icon${bound ? ' active' : ''}`;
    btn.dataset.tileCompanions = 'bind';
    btn.dataset.tooltip = L(bound ? 'HudTooltipBound' : 'HudTooltip');
    btn.setAttribute('aria-label', btn.dataset.tooltip);
    btn.innerHTML = '<i class="fa-solid fa-link" inert></i>';
    btn.addEventListener('click', ev => {
      ev.preventDefault(); ev.stopPropagation();
      const selected = canvas.tiles.controlled.map(t => t.document);
      promptBind(selected.length ? selected : [hud.document]);
    });
    col.appendChild(btn);
  });
}

/**
 * Dialog: choose which companions to create (with their main settings),
 * or re-trace / detach. Several tiles → same choices applied to each.
 * @param {TileDocument[]} tiles
 * @returns {Promise<object|null>}
 */
export async function promptBind(tiles) {
  tiles = (tiles ?? []).filter(t => t?.parent);
  if ( !tiles.length ) { ui.notifications.warn(L('Warn.NoTile')); return null; }
  const esc = foundry.utils.escapeHTML;
  const single = tiles.length === 1 ? tiles[0] : null;
  const existing = single ? getCompanions(single) : { region: null, sound: null, light: null };
  const scene = tiles[0].parent;
  const frame = tileFrame(tiles[0]);
  const units = pixelsToUnits(scene, Math.max(frame.w, frame.h));
  const defaultName = single ? prettyName(single) : '';
  const gridUnits = esc(scene.grid?.units || '');
  const byName = (a, b) => a.name.localeCompare(b.name, game.i18n.lang);
  const opt = docs => [`<option value="">${L('Prompt.ConfigureLater')}</option>`, ...docs.sort(byName).map(d => `<option value="${d.uuid}">${esc(d.name)}</option>`)].join('');
  const badge = k => existing[k] ? ` <span class="hint">(${L('Prompt.AlreadyBound')})</span>` : '';
  const dis = k => existing[k] ? 'disabled' : '';

  const content = `
    <p class="hint">${L('Prompt.Hint')}${tiles.length > 1 ? ` ${game.i18n.format('TILECOMPANIONS.Prompt.Multi', { n: tiles.length })}` : ''}</p>
    <fieldset>
      <legend><label><input type="checkbox" name="region" ${dis('region')} ${existing.region ? '' : 'checked'}> ${L('Prompt.Region')}</label>${badge('region')}</legend>
      <div class="form-group">
        <label>${L('Prompt.Name')}</label>
        <div class="form-fields"><input type="text" name="regionName" value="${esc(defaultName)}" placeholder="${L('Prompt.NameAuto')}"></div>
      </div>
      <div class="form-group">
        <label>${L('Prompt.Trace')}</label>
        <div class="form-fields"><input type="checkbox" name="trace" checked></div>
        <p class="hint">${L('Prompt.TraceHint')}</p>
      </div>
      <div class="form-group">
        <label>${L('Prompt.ClickBehavior')}</label>
        <div class="form-fields"><select name="clickBehavior">
          <option value="">${L('Prompt.ClickNone')}</option>
          ${Object.keys(CLICK_BEHAVIORS).map(k => `<option value="${k}">${esc(behaviorLabel(k))}</option>`).join('')}
        </select></div>
        <p class="hint">${L('Prompt.ClickHint')}</p>
      </div>
      <div class="form-group" data-for="clickMacro"><label>${L('Prompt.Macro')}</label><div class="form-fields"><select name="macro">${opt(game.macros.contents)}</select></div></div>
      <div class="form-group" data-for="toScene"><label>${L('Prompt.TargetScene')}</label><div class="form-fields"><select name="targetScene">${opt(game.scenes.contents.filter(s => s !== scene))}</select></div></div>
      <div class="form-group" data-for="openDocument"><label>${L('Prompt.Journal')}</label><div class="form-fields"><select name="journal">${opt(game.journal.contents)}</select></div></div>
      <div class="form-group" data-for="openDocument"><label>${L('Prompt.DocumentUuid')}</label><div class="form-fields"><input type="text" name="documentUuid" placeholder="JournalEntry.xxx.JournalEntryPage.yyy"></div><p class="hint">${L('Prompt.DocumentUuidHint')}</p></div>
      <div class="form-group" data-for="openDocument"><label>${L('Prompt.Grant')}</label><div class="form-fields"><input type="checkbox" name="grant" checked></div></div>
      <div class="form-group" data-for="jukebox"><label>${L('Prompt.Playlist')}</label><div class="form-fields"><select name="playlist">${opt(game.playlists.contents)}</select></div></div>
      <div class="form-group" data-for="any"><label>${L('Prompt.Highlight')}</label><div class="form-fields"><select name="highlight">
        <option value="hover">${game.i18n.localize('TILECOMPANIONS.ClickCommon.FIELDS.highlight.choices.hover')}</option>
        <option value="always">${game.i18n.localize('TILECOMPANIONS.ClickCommon.FIELDS.highlight.choices.always')}</option>
        <option value="never">${game.i18n.localize('TILECOMPANIONS.ClickCommon.FIELDS.highlight.choices.never')}</option>
      </select></div></div>
    </fieldset>
    <fieldset>
      <legend><label><input type="checkbox" name="sound" ${dis('sound')}> ${L('Prompt.Sound')}</label>${badge('sound')}</legend>
      <div class="form-group">
        <label>${L('Prompt.SoundFile')}</label>
        <div class="form-fields">
          <input type="text" name="soundPath" placeholder="sounds/…">
          <button type="button" class="icon fa-solid fa-file-audio" data-action="pickSound" data-tooltip="${L('Prompt.Browse')}" aria-label="${L('Prompt.Browse')}"></button>
        </div>
      </div>
      <div class="form-group">
        <label>${L('Prompt.SoundRadius')} ${gridUnits ? `(${gridUnits})` : ''}</label>
        <div class="form-fields"><input type="number" name="soundRadius" step="0.01" min="0" value="${units}"></div>
      </div>
      <div class="form-group">
        <label>${L('Prompt.SoundVolume')}</label>
        <div class="form-fields"><input type="range" name="soundVolume" min="0" max="1" step="0.05" value="0.5"></div>
      </div>
      <div class="form-group">
        <label>${L('Prompt.SoundRepeat')}</label>
        <div class="form-fields"><input type="checkbox" name="soundRepeat" checked></div>
      </div>
    </fieldset>
    <fieldset>
      <legend><label><input type="checkbox" name="light" ${dis('light')}> ${L('Prompt.Light')}</label>${badge('light')}</legend>
      <div class="form-group">
        <label>${L('Prompt.LightRadii')} ${gridUnits ? `(${gridUnits})` : ''}</label>
        <div class="form-fields">
          <input type="number" name="lightDim" step="0.01" min="0" value="${units}" data-tooltip="${L('Prompt.LightDim')}">
          <input type="number" name="lightBright" step="0.01" min="0" value="${Math.round(units / 2 * 100) / 100}" data-tooltip="${L('Prompt.LightBright')}">
        </div>
      </div>
      <div class="form-group">
        <label>${L('Prompt.LightColor')}</label>
        <div class="form-fields"><color-picker name="lightColor" value=""></color-picker></div>
        <p class="hint">${L('Prompt.LightColorHint')}</p>
      </div>
    </fieldset>
    <div class="form-group">
      <label>${L('Prompt.OpenSheets')}</label>
      <div class="form-fields"><input type="checkbox" name="openSheets" checked></div>
    </div>`;

  const buttons = [{
    action: 'create', label: L('Prompt.Create'), icon: 'fa-solid fa-link', default: true,
    callback: (ev, button) => readForm(button.form, !!single)
  }];
  if ( single && existing.region ) buttons.push({ action: 'retrace', label: L('Prompt.Retrace'), icon: 'fa-solid fa-draw-polygon' });
  if ( tiles.some(isBound) ) buttons.push({ action: 'unbind', label: L('Prompt.Unbind'), icon: 'fa-solid fa-link-slash' });
  buttons.push({ action: 'cancel', label: L('Prompt.Cancel'), icon: 'fa-solid fa-xmark' });

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: L('Prompt.Title'), icon: 'fa-solid fa-link' },
    position: { width: 480 },
    content,
    buttons,
    render: (ev, dialog) => {
      const root = dialog.element;
      // Show only the target rows of the chosen click behavior.
      const sel = root.querySelector('select[name="clickBehavior"]');
      const syncRows = () => root.querySelectorAll('[data-for]').forEach(el => {
        el.style.display = (el.dataset.for === sel.value || (el.dataset.for === 'any' && sel.value)) ? '' : 'none';
      });
      sel?.addEventListener('change', syncRows);
      syncRows();
      root.querySelector('[data-action="pickSound"]')?.addEventListener('click', () => {
        const input = root.querySelector('input[name="soundPath"]');
        const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
        new FP({ type: 'audio', current: input.value, callback: path => { input.value = path; } }).render({ force: true });
      });
    },
    rejectClose: false
  });
  if ( !result || result === 'cancel' ) return null;

  if ( result === 'retrace' ) return retrace(single);

  if ( result === 'unbind' ) {
    const mode = await foundry.applications.api.DialogV2.wait({
      window: { title: L('Prompt.UnbindTitle'), icon: 'fa-solid fa-link-slash' },
      content: `<p>${L('Prompt.UnbindConfirm')}</p>`,
      buttons: [
        { action: 'delete', label: L('Prompt.UnbindDelete'), icon: 'fa-solid fa-trash', default: true },
        { action: 'keep', label: L('Prompt.UnbindKeep'), icon: 'fa-solid fa-link-slash' },
        { action: 'cancel', label: L('Prompt.Cancel'), icon: 'fa-solid fa-xmark' }
      ],
      rejectClose: false
    });
    if ( !mode || mode === 'cancel' ) return null;
    for ( const tile of tiles ) if ( isBound(tile) ) await unbind(tile, { remove: mode === 'delete' });
    return mode;
  }

  // create
  const out = [];
  for ( const tile of tiles ) {
    const opts = foundry.utils.deepClone(result);
    if ( !single && opts.region ) opts.region.name = '';
    out.push(await bind(tile, { ...opts, openSheets: single ? result.openSheets : false }));
  }
  return single ? out[0] : out;
}

function readForm(form, single) {
  const f = form.elements;
  const val = n => f[n]?.value ?? '';
  const chk = n => !!f[n]?.checked;
  const num = n => { const v = Number(val(n)); return Number.isFinite(v) ? v : undefined; };
  const color = (val('lightColor') || '').trim();
  let behavior = null;
  const kind = val('clickBehavior');
  if ( kind ) {
    const system = { highlight: val('highlight') || 'hover' };
    if ( kind === 'clickMacro' ) system.macro = val('macro') || null;
    if ( kind === 'toScene' ) system.targetScene = val('targetScene') || null;
    if ( kind === 'openDocument' ) { system.document = val('documentUuid').trim() || val('journal') || null; system.grant = chk('grant'); }
    if ( kind === 'jukebox' ) system.playlist = val('playlist') || null;
    behavior = { type: kind, system };
  }
  return {
    region: chk('region') ? { trace: chk('trace'), name: single ? val('regionName').trim() : '', behavior } : null,
    sound: chk('sound') ? { path: val('soundPath').trim(), radius: num('soundRadius'), volume: num('soundVolume') ?? 0.5, repeat: chk('soundRepeat') } : null,
    light: chk('light') ? { dim: num('lightDim') ?? 0, bright: num('lightBright') ?? 0, color: color || null } : null,
    openSheets: chk('openSheets')
  };
}

export { KINDS };
