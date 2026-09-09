/* ProcArena results page — index.html's script.
 *
 * Renders tables.json (written by viz/export.py) and nothing else.  Every number
 * shown stands on passed/played counts copied from grades.json — the page formats
 * them as percentages but invents nothing.  A cell without data renders "not run",
 * never 0.  The analysis charts under the table live in charts.js.
 */

'use strict';

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return node;
}

const SCEN_LABEL = {
  a1: 'A1', a2: 'A2', a3: 'A3', a4: 'A4', a5: 'A5', b1: 'B1', b3: 'B3', b4: 'B4',
};
const DIALECT_LABEL = { postgres: 'PostgreSQL', oracle: 'Oracle' };
const STAGE_TITLE = { single: 'Direct', multi: 'Interactive' };

let T = null;   // tables.json

function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t) return t === 'dark';
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

/* ── shared hover tooltip ─────────────────────────────────────────── */

function placeTip(target, html) {
  const tip = $('#viztip');
  tip.innerHTML = html;
  tip.hidden = false;
  const r = target.getBoundingClientRect(), tr = tip.getBoundingClientRect();
  let x = r.left + r.width / 2 - tr.width / 2;
  x = Math.max(8, Math.min(x, innerWidth - tr.width - 8));
  let y = r.top - tr.height - 10;
  if (y < 8) y = r.bottom + 10;
  tip.style.left = `${x}px`;
  tip.style.top = `${y + scrollY}px`;
}

function tipOn(target, htmlFn) {
  target.addEventListener('mouseenter', () => placeTip(target,
    typeof htmlFn === 'function' ? htmlFn() : htmlFn));
  target.addEventListener('mouseleave', () => { $('#viztip').hidden = true; });
}

/* ── aggregation over copied counts ───────────────────────────────── */

function cellFor(stage, model, dialect, scenario) {
  return T.cells[`${stage}|${model}|${dialect}|${scenario}`] || null;
}

/* sum passed/episodes over the cells a filter selects */
function aggWhere(modelId, { stage = 'all', dialect = 'all', scenarios = null } = {}) {
  let passed = 0, episodes = 0;
  for (const [key, cell] of Object.entries(T.cells)) {
    const [s, m, d, sc] = key.split('|');
    if (m !== modelId) continue;
    if (stage !== 'all' && s !== stage) continue;
    if (dialect !== 'all' && d !== dialect) continue;
    if (scenarios && !scenarios.has(sc)) continue;
    passed += cell.passed;
    episodes += cell.episodes;
  }
  return { passed, episodes };
}

const pct = (a) => a.episodes ? 100 * a.passed / a.episodes : null;

/* ── leaderboard: one bar per model, filterable, animated re-rank ── */

const LB = {
  stage: 'all', dialect: 'all',
  scenarios: null,            // Set, filled from T.scenarios on first render
  rows: new Map(),            // model id -> row element (kept across updates)
  built: false,
};

const LB_ROW_H = 64;
const LB_BAR = { light: '#2a78d6', dark: '#3987e5' };   // dataviz slot 1

function lbFilterText() {
  const parts = [
    LB.stage === 'all' ? 'Direct + Interactive' : STAGE_TITLE[LB.stage],
    LB.dialect === 'all' ? 'both dialects' : DIALECT_LABEL[LB.dialect],
    LB.scenarios.size === T.scenarios.length ? 'all sub-scenarios'
      : [...T.scenarios].filter((s) => LB.scenarios.has(s))
          .map((s) => SCEN_LABEL[s]).join(' '),
  ];
  return parts.join(' · ');
}

function lbData() {
  const filter = { stage: LB.stage, dialect: LB.dialect, scenarios: LB.scenarios };
  return T.models
    .map((m) => ({ m, a: aggWhere(m.id, filter) }))
    .sort((x, y) => (pct(y.a) ?? -1) - (pct(x.a) ?? -1));
}

function buildLeaderboard() {
  const box = $('#lb');
  box.textContent = '';
  if (LB.scenarios === null) LB.scenarios = new Set(T.scenarios);

  // header strip: current filter summary + gear
  const head = el('div', { class: 'lb3-head' },
    el('span', { class: 'lb3-filter', id: 'lb3-filter' }),
    el('button', { class: 'btn lb3-gear', id: 'lb3-gear', title: 'filter the leaderboard' },
      '⚙'));
  box.append(head);

  const chart = el('div', { class: 'lb3', id: 'lb3' });
  const grid = el('div', { class: 'lb3-grid', id: 'lb3-grid' });
  chart.append(grid);
  for (const m of T.models) {
    const bar = el('div', { class: 'lb3-bar' },
      el('i', {}), el('span', { class: 'lb3-val' }));
    const row = el('div', { class: 'lb3-row' },
      el('div', { class: 'lb3-name' }, m.label),
      el('div', { class: 'lb3-track' }, bar));
    row.dataset.model = m.id;
    tipOn(row, () => {
      const a = aggWhere(m.id,
        { stage: LB.stage, dialect: LB.dialect, scenarios: LB.scenarios });
      const p = pct(a);
      return `<b>${m.label}</b><br>` +
        `EX <b>${p === null ? '—' : p.toFixed(1) + '%'}</b> · ` +
        `${a.passed} / ${a.episodes} episodes passed<br>` +
        `<i>${lbFilterText()}</i>`;
    });
    LB.rows.set(m.id, row);
    chart.append(row);
  }
  box.append(chart);
  buildGearPopover(head);
  LB.built = true;
  updateLeaderboard(false);
}

function updateLeaderboard(animate = true) {
  const mode = isDark() ? 'dark' : 'light';
  const rows = lbData();
  const max = Math.max(1, ...rows.map((r) => pct(r.a) ?? 0));
  const top = Math.min(100, Math.ceil(max / 10) * 10);

  $('#lb3-filter').textContent = lbFilterText();

  const grid = $('#lb3-grid');
  grid.textContent = '';
  const step = top > 50 ? 20 : 10;
  for (let v = 0; v <= top; v += step) {
    grid.append(el('span', { class: 'lb3-gridline', style: `left:${100 * v / top}%` },
      el('b', {}, `${v}%`)));
  }

  $('#lb3').style.height = `${rows.length * LB_ROW_H + 30}px`;
  rows.forEach((r, i) => {
    const row = LB.rows.get(r.m.id);
    if (!animate) row.classList.add('no-anim');
    row.style.transform = `translateY(${i * LB_ROW_H}px)`;
    const p = pct(r.a);
    const bar = row.querySelector('.lb3-bar');
    bar.querySelector('i').style.width = p === null ? '0%' : `${100 * p / top}%`;
    bar.querySelector('i').style.background = LB_BAR[mode];
    bar.querySelector('.lb3-val').textContent =
      p === null ? '—' : `${p.toFixed(1)}%`;
    if (!animate) requestAnimationFrame(() => row.classList.remove('no-anim'));
  });
}

/* the gear popover: mode / dialect / scenario multi-select, applied on 确定 */

function buildGearPopover(head) {
  const draft = {};
  const pop = el('div', { class: 'lb3-pop', hidden: true });

  const paint = () => {
    pop.textContent = '';
    const group = (label, kids) => el('div', { class: 'lb3-pop-group' },
      el('div', { class: 'lb3-pop-label' }, label),
      el('div', { class: 'filter-group' }, kids));
    const segBtn = (label, active, onclick) =>
      el('button', { class: 'seg' + (active ? ' is-active' : ''), onclick }, label);

    pop.append(group('Mode', [
      ['all', 'All'], ['single', 'Direct'], ['multi', 'Interactive'],
    ].map(([v, label]) => segBtn(label, draft.stage === v,
      () => { draft.stage = v; paint(); }))));

    pop.append(group('Dialect', [
      ['all', 'All'], ['postgres', 'PostgreSQL'], ['oracle', 'Oracle'],
    ].map(([v, label]) => segBtn(label, draft.dialect === v,
      () => { draft.dialect = v; paint(); }))));

    pop.append(group('Sub-scenarios', T.scenarios.map((s) =>
      segBtn(SCEN_LABEL[s], draft.scenarios.has(s), () => {
        if (draft.scenarios.has(s)) draft.scenarios.delete(s);
        else draft.scenarios.add(s);
        paint();
      }))));

    const ok = el('button', { class: 'btn lb3-apply', onclick: () => {
      LB.stage = draft.stage;
      LB.dialect = draft.dialect;
      LB.scenarios = new Set(draft.scenarios);
      pop.hidden = true;
      updateLeaderboard(true);
    } }, 'Apply');
    if (!draft.scenarios.size) {
      ok.disabled = true;
      pop.append(el('div', { class: 'lb3-pop-hint' }, 'pick at least one sub-scenario'));
    }
    pop.append(el('div', { class: 'lb3-pop-foot' }, ok));
  };

  head.append(pop);
  $('#lb3-gear', head).addEventListener('click', (e) => {
    e.stopPropagation();
    if (pop.hidden) {
      draft.stage = LB.stage;
      draft.dialect = LB.dialect;
      draft.scenarios = new Set(LB.scenarios);
      paint();
      pop.hidden = false;
    } else {
      pop.hidden = true;
    }
  });
  document.addEventListener('click', (e) => {
    // composedPath is captured at dispatch, so a button the popover re-rendered
    // away mid-click still counts as an inside click
    const path = e.composedPath ? e.composedPath() : [];
    if (!pop.hidden && !path.includes(pop)) pop.hidden = true;
  });
}

/* ── main results: mode + dialect switches over one table ─────────── */

const VIEW = { stage: 'multi', dialect: 'postgres' };   // default: Interactive · PG

/* red (low) → amber → green (high) score ramp — colors the NUMBER, not the cell */
const RAMP = {
  light: [[0, [0xc4, 0x33, 0x30]], [50, [0xa8, 0x7a, 0x00]], [100, [0x0c, 0x7c, 0x33]]],
  dark: [[0, [0xf2, 0x6f, 0x6b]], [50, [0xe0, 0xae, 0x33]], [100, [0x4f, 0xd9, 0x7f]]],
};

function rampColor(value, mode) {
  const stops = RAMP[mode];
  let [v0, c0] = stops[0], [v1, c1] = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (value >= stops[i][0] && value <= stops[i + 1][0]) {
      [v0, c0] = stops[i]; [v1, c1] = stops[i + 1]; break;
    }
  }
  const t = (value - v0) / (v1 - v0 || 1);
  const c = c0.map((x, i) => Math.round(x + (c1[i] - x) * t));
  return `rgb(${c.join(',')})`;
}

function seg(label, active, onclick) {
  return el('button', { class: 'seg' + (active ? ' is-active' : ''), onclick }, label);
}

function renderTable6() {
  const tools = $('#t6-tools');
  tools.textContent = '';
  tools.append(
    el('div', { class: 'filter-group' }, ['multi', 'single'].map((s) =>
      seg(STAGE_TITLE[s], VIEW.stage === s, () => { VIEW.stage = s; renderTable6(); }))),
    el('div', { class: 'filter-group' }, T.dialects.map((d) =>
      seg(DIALECT_LABEL[d] || d, VIEW.dialect === d,
        () => { VIEW.dialect = d; renderTable6(); }))),
    el('span', { class: 'tools-cond' }, `condition: ${T.conditions[VIEW.stage]}`));

  const mode = isDark() ? 'dark' : 'light';
  const table = $('#t6');
  table.textContent = '';
  table.append(el('thead', {}, el('tr', {},
    el('th', {}, 'model'),
    T.scenarios.map((s) => el('th', { class: 'n' }, SCEN_LABEL[s] || s)),
    el('th', { class: 'n ovcell' }, 'Overall'))));

  const body = el('tbody');
  const rows = T.models
    .map((m) => ({ m, overall: aggWhere(m.id,
      { stage: VIEW.stage, dialect: VIEW.dialect }) }))
    .sort((a, b) => (pct(b.overall) ?? -1) - (pct(a.overall) ?? -1));

  for (const { m, overall } of rows) {
    const tr = el('tr', {}, el('th', {}, m.label));
    const paint = (value, counts, cell) => {
      const td = el('td', { class: 'n excell' });
      if (value === null) {
        td.classList.add('is-missing');
        td.append(el('span', {}, 'not run'));
        return td;
      }
      const color = rampColor(value, mode);
      const content = value.toFixed(1);
      if (cell && cell.rep) {
        const a = el('a', { class: 'exlink',
          href: `run.html?id=${encodeURIComponent(cell.rep)}` }, content);
        a.style.color = color;
        td.append(a);
      } else {
        td.append(el('span', { style: `color:${color}` }, content));
      }
      tipOn(td, `<b>${m.label}</b> · ${STAGE_TITLE[VIEW.stage]} · ` +
        `${DIALECT_LABEL[VIEW.dialect]}<br>` +
        `${counts.passed} / ${counts.episodes} episodes passed` +
        (cell && cell.rep ? '<br><i>click to replay the representative episode</i>' : ''));
      return td;
    };
    for (const s of T.scenarios) {
      const cell = cellFor(VIEW.stage, m.id, VIEW.dialect, s);
      tr.append(paint(cell && cell.episodes ? 100 * cell.passed / cell.episodes : null,
        cell || { passed: 0, episodes: 0 }, cell));
    }
    const ov = paint(pct(overall), overall, null);
    ov.classList.add('ovcell');
    tr.append(ov);
    body.append(tr);
  }
  table.append(body);

  const ramp = $('#t6-ramp');
  ramp.textContent = '';
  const stops = [];
  for (let v = 0; v <= 100; v += 5) stops.push(`${rampColor(v, mode)} ${v}%`);
  ramp.append(
    el('span', { class: 'rampbar-lab' }, 'EX 0%'),
    el('i', { style: `background:linear-gradient(90deg, ${stops.join(',')})` }),
    el('span', { class: 'rampbar-lab' }, '100%'));
}

/* ── boot ─────────────────────────────────────────────────────────── */

/* tint SQL keywords inside the rebuilt Figure-1 code blocks (presentation only) */
function tintOverviewCode() {
  const words = ['CREATE', 'OR', 'REPLACE', 'PROCEDURE', 'LANGUAGE', 'DECLARE',
    'BEGIN', 'END', 'SELECT', 'INTO', 'FROM', 'WHERE', 'INSERT', 'VALUES',
    'RETURNING', 'FOR', 'IN', 'JOIN', 'ON', 'LOOP', 'UPDATE', 'SET', 'DELETE',
    'IF', 'THEN', 'IS', 'AS', 'COUNT'];
  const re = new RegExp(`\\b(${words.join('|')})\\b`, 'g');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  for (const pre of document.querySelectorAll('.ov-code')) {
    pre.innerHTML = esc(pre.textContent)
      .replace(re, '<span class="sql-kw">$1</span>');
  }
}

function renderAll() {
  tintOverviewCode();
  buildLeaderboard();
  renderTable6();
  if (window.PaperCharts) PaperCharts.render(T);
  const updated = (() => {
    try {
      return new Date(T.generated).toLocaleDateString('en-US',
        { year: 'numeric', month: 'long' });
    } catch { return ''; }
  })();
  $('#footer-note').textContent =
    'Every number on this page is copied verbatim from the evaluation ' +
    `records behind the paper${updated ? ` (last updated ${updated})` : ''}; ` +
    'see the paper for the full protocol.';
  $('#loading').hidden = true;
  $('#content').hidden = false;
}

async function load() {
  if (window.EMBEDDED_TABLES) { T = window.EMBEDDED_TABLES; renderAll(); return; }
  try {
    const res = await fetch('tables.json');
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    T = await res.json();
    renderAll();
  } catch (err) {
    $('#loading').textContent =
      `Could not load tables.json (${err}). Run: python -m viz.export --self-check`;
  }
}

$('#copy-bib').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#bibtex').textContent);
    $('#copy-bib').textContent = 'copied ✓';
    setTimeout(() => { $('#copy-bib').textContent = 'copy BibTeX'; }, 1500);
  } catch { /* clipboard unavailable (file://) */ }
});

const themeBtn = $('#btn-theme');
themeBtn.addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme === 'dark' ||
    (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('procarena-theme', root.dataset.theme); } catch { /* ok */ }
  if (T) { updateLeaderboard(false); renderTable6(); }
  if (window.PaperCharts) PaperCharts.rerender();
});
try {
  const saved = localStorage.getItem('procarena-theme');
  if (saved) document.documentElement.dataset.theme = saved;
} catch { /* ok */ }

load();
