/* ProcArena results page — index.html's script.
 *
 * Renders tables.json (written by viz/export.py) and nothing else.  Every number shown
 * stands on passed/played counts copied from grades.json into tables.json — the page
 * formats them as percentages but invents nothing.  A cell without data renders
 * "not run" — never 0.  The analysis figures are the paper's own figures, shipped as
 * static SVG under figures/.
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
const STAGE_TITLE = {
  single: 'Direct', multi: 'Interactive',
};

let T = null;   // tables.json

/* ── leaderboard: overall EX per model, everything aggregated ─────── */

function cellFor(stage, model, dialect, scenario) {
  return T.cells[`${stage}|${model}|${dialect}|${scenario}`] || null;
}

function modelAggregate(modelId, stage = null, dialect = null) {
  let passed = 0, episodes = 0;
  for (const [key, cell] of Object.entries(T.cells)) {
    const [cellStage, cellModel, cellDialect] = key.split('|');
    if (cellModel !== modelId) continue;
    if (stage && cellStage !== stage) continue;
    if (dialect && cellDialect !== dialect) continue;
    passed += cell.passed;
    episodes += cell.episodes;
  }
  return { passed, episodes };
}

function renderLeaderboard() {
  const rows = T.models
    .map((m) => ({ m, ...modelAggregate(m.id) }))
    .filter((r) => r.episodes > 0)
    .sort((a, b) => (a.passed / a.episodes) - (b.passed / b.episodes));
  const box = $('#lb');
  box.textContent = '';
  if (!rows.length) {
    box.append(el('p', { class: 'muted' }, 'not run'));
    return;
  }
  const chart = el('div', { class: 'lb' });
  for (const r of rows) {
    const pct = 100 * r.passed / r.episodes;
    const single = modelAggregate(r.m.id, 'single');
    const multi = modelAggregate(r.m.id, 'multi');
    const tip = `${r.m.label} — Direct ${single.passed}/${single.episodes}, ` +
      `Interactive ${multi.passed}/${multi.episodes}`;
    chart.append(el('div', { class: 'lb-row', title: tip },
      el('div', { class: 'lb-label' }, r.m.label),
      el('div', { class: 'lb-track' },
        el('i', { class: 'lb-fill', style: `width:${pct}%` })),
      el('div', { class: 'lb-val' }, `${pct.toFixed(1)}%`,
        el('span', { class: 'lb-n' }, `${r.passed}/${r.episodes}`))));
  }
  box.append(chart);
}

/* ── the paper's Table 6: Direct block over Interactive block ─────── */

// column list: per dialect, the eight sub-scenarios then the dialect EX total
const T6_COLS = (dialect) => [
  ...T.scenarios.map((s) => ({ dialect, scenario: s })),
  { dialect, scenario: null },   // the EX (overall) column
];

function t6Value(stage, model, col) {
  if (col.scenario) {
    const cell = cellFor(stage, model, col.dialect, col.scenario);
    return cell && cell.episodes ? cell : null;
  }
  const agg = modelAggregate(model, stage, col.dialect);
  return agg.episodes ? agg : null;
}

/* Bold the column's best and underline the runner-up within one stage block, the
 * way the paper's Table 6 marks them.  Ties share the mark. */
function columnMarks(stage, cols) {
  const marks = new Map();   // `${model}|${ci}` -> 'best' | 'second'
  cols.forEach((col, ci) => {
    const pcts = T.models.map((m) => {
      const v = t6Value(stage, m.id, col);
      return v ? 100 * v.passed / v.episodes : null;
    });
    const distinct = [...new Set(pcts.filter((p) => p !== null)
      .map((p) => p.toFixed(1)))].map(Number).sort((a, b) => b - a);
    if (!distinct.length) return;
    T.models.forEach((m, mi) => {
      if (pcts[mi] === null) return;
      const rounded = Number(pcts[mi].toFixed(1));
      if (rounded === distinct[0]) marks.set(`${m.id}|${ci}`, 'best');
      else if (distinct.length > 1 && rounded === distinct[1]) {
        marks.set(`${m.id}|${ci}`, 'second');
      }
    });
  });
  return marks;
}

function renderTable6() {
  const table = $('#t6');
  table.textContent = '';
  const cols = [...T6_COLS('postgres'), ...T6_COLS('oracle')];
  const perDialect = cols.length / 2;

  const groupRow = el('tr', {},
    el('th', {}),
    T.dialects.map((d, i) => el('th', {
      class: 'n t6-group' + (i ? ' gsep' : ''),
      colspan: String(perDialect),
    }, DIALECT_LABEL[d] || d)));
  const headRow = el('tr', {}, el('th', {}, 'model'));
  cols.forEach((col, ci) => {
    const cls = 'n' + (ci === perDialect ? ' gsep' : '') +
      (col.scenario ? '' : ' ovcell');
    headRow.append(el('th', { class: cls },
      col.scenario ? (SCEN_LABEL[col.scenario] || col.scenario) : 'EX'));
  });
  table.append(el('thead', {}, groupRow, headRow));

  for (const stage of ['single', 'multi']) {
    const body = el('tbody');
    body.append(el('tr', { class: 't6-block' },
      el('th', { colspan: String(cols.length + 1) },
        `${STAGE_TITLE[stage]} `,
        el('span', { class: 'muted small' },
          `· condition: ${T.conditions[stage]}`))));
    const marks = columnMarks(stage, cols);
    for (const m of T.models) {
      const row = el('tr', {}, el('th', {}, m.label));
      cols.forEach((col, ci) => {
        const cls = 'n excell' + (ci === perDialect ? ' gsep' : '') +
          (col.scenario ? '' : ' ovcell');
        const td = el('td', { class: cls });
        const v = t6Value(stage, m.id, col);
        if (!v) {
          td.classList.add('is-missing');
          td.append(el('span', {
            class: 'muted', title: 'this experiment has not been run',
          }, 'not run'));
        } else {
          const pct = (100 * v.passed / v.episodes).toFixed(1);
          const mark = marks.get(`${m.id}|${ci}`);
          const num = mark === 'best' ? el('b', {}, pct)
            : mark === 'second' ? el('u', {}, pct) : el('span', {}, pct);
          const cell = col.scenario ? v : null;
          const title = `${m.label} · ${STAGE_TITLE[stage]} · ` +
            `${DIALECT_LABEL[col.dialect]}` +
            (col.scenario ? ` · ${SCEN_LABEL[col.scenario]}` : ' · overall') +
            ` — ${v.passed} / ${v.episodes} episodes` +
            (cell && cell.rep ? ' · click for the representative trace' : '');
          if (cell && cell.rep) {
            td.append(el('a', {
              class: 'exlink', title,
              href: `run.html?id=${encodeURIComponent(cell.rep)}`,
            }, num));
          } else {
            td.append(el('span', { class: 'exlink', title }, num));
          }
        }
        row.append(td);
      });
      body.append(row);
    }
    table.append(body);
  }

  const reps = Object.values(T.cells).filter((c) => c.rep).length;
  $('#t6-note').textContent =
    `${reps} of ${Object.keys(T.cells).length} cells carry an exported ` +
    `representative trace · representative rule: ${T.pick} (smallest task id ` +
    'unless configured otherwise)';
}

/* ── appendix: experiments kept out of the main table ─────────────── */

function renderExtra() {
  const table = $('#extra');
  table.textContent = '';
  const cols = ['experiment', 'why it is outside', 'mode', 'solver', 'dialect',
    'EX (passed/graded)'];
  table.append(el('thead', {}, el('tr', {}, cols.map((c) => el('th', {}, c)))));
  const body = el('tbody');
  const outside = (T.experiments || []).filter((e) => !e.in_main);
  if (!outside.length) {
    body.append(el('tr', {}, el('td', {
      colspan: String(cols.length), class: 'muted',
    }, 'none — every finished experiment is in the main table')));
  }
  for (const e of outside) {
    let passed = 0, graded = 0;
    for (const s of Object.values(e.scenarios || {})) {
      passed += s.passed; graded += s.graded;
    }
    body.append(el('tr', {},
      el('td', {}, e.name),
      el('td', {}, T.excluded[e.name] || '—'),
      el('td', {}, e.mode),
      el('td', {}, e.solver),
      el('td', {}, DIALECT_LABEL[e.dialect] || e.dialect),
      el('td', { class: 'n' }, graded ? `${passed} / ${graded}` : 'not graded')));
  }
  table.append(body);
}

/* ── boot ─────────────────────────────────────────────────────────── */

function renderAll() {
  renderLeaderboard();
  renderTable6();
  renderExtra();
  $('#footer-note').textContent =
    `Export generated ${T.generated} · ${T.note}`;
  $('#loading').hidden = true;
  $('#content').hidden = false;
}

async function load() {
  // a hand-assembled single-file preview ships tables.json inline; no fetch, no server
  if (window.EMBEDDED_TABLES) {
    T = window.EMBEDDED_TABLES;
    renderAll();
    return;
  }
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
});
try {
  const saved = localStorage.getItem('procarena-theme');
  if (saved) document.documentElement.dataset.theme = saved;
} catch { /* ok */ }

load();
