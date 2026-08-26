/* ProcArena results page — index.html's script.
 *
 * Renders tables.json (written by viz/export.py) and nothing else.  Every number shown
 * is copied from that file, which in turn copied it from grades.json / episode.json /
 * report.json.  A cell without data renders "not run" — never 0.  The bars in the
 * figures scale copied counts for display; the printed numbers are the counts.
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
  a1: 'A1', a2: 'A2', a3: 'A3', a4: 'A4', a5: 'A5',
  b1: 'B1', b2: 'B2', b3: 'B3', b4: 'B4', c1: 'C1', c2: 'C2',
};
const DIALECT_LABEL = { postgres: 'PostgreSQL', oracle: 'Oracle' };

const PAPER_MODEL_COUNT = 10;   // the paper's line-up; rows appear as data lands

let T = null;   // tables.json

/* ── DEMO FILL ────────────────────────────────────────────────────────
 * ⚠ Placeholder results for layout preview ONLY.  Set DEMO_FILL = false before any
 * release: everything it injects is invented (models and numbers alike) and never
 * touches tables.json — the real pipeline stays copy-only.  Fake cells carry no
 * `rep`, so they are not clickable.
 */

const DEMO_FILL = true;

const DEMO_MODELS = [
  // [id, label, skill 0..1, kind] — skill spreads the board for a realistic look
  ['demo-closed-a', 'GPT-5.2', 0.86, 'closed'],
  ['demo-closed-b', 'Claude Opus 4.5', 0.84, 'closed'],
  ['demo-closed-c', 'Gemini 3 Pro', 0.80, 'closed'],
  ['demo-closed-d', 'Grok 4', 0.72, 'closed'],
  ['demo-open-a', 'Qwen3-Max', 0.70, 'open'],
  ['demo-open-b', 'Kimi K3', 0.64, 'open'],
  ['demo-open-c', 'GLM-5', 0.60, 'open'],
  ['demo-open-d', 'Llama 4 405B', 0.52, 'open'],
];

// open-weight vs closed-source, for the scatter's shading (real models are open)
const MODEL_KIND = { 'deepseek-v4-pro': 'open', 'deepseek-v4-flash': 'open' };
for (const [id, , , kind] of DEMO_MODELS) MODEL_KIND[id] = kind;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function applyDemoFill() {
  let seed = 20260826;
  for (const [id, label, skill] of DEMO_MODELS) {
    T.models.push({ id, label, demo: true });
    const rand = mulberry32(seed += 7919);
    const totals = { single: { passed: 0, episodes: 0 },
                     multi: { passed: 0, episodes: 0 } };
    for (const stage of ['single', 'multi']) {
      // multi-turn is systematically harder — mirror the benchmark's whole point
      const level = stage === 'multi' ? skill - 0.18 : skill;
      for (const dialect of T.dialects) {
        for (const s of T.scenarios) {
          const episodes = 5;
          let passed = 0;
          for (let i = 0; i < episodes; i++) {
            if (rand() < level + (rand() - 0.5) * 0.2) passed++;
          }
          totals[stage].passed += passed;
          totals[stage].episodes += episodes;
          T.cells[`${stage}|${id}|${dialect}|${s}`] = {
            episodes, passed, demo: true,
            attribution: { spec: 0, impl: 0 }, runs: [], rep: null,
          };
        }
      }
    }
    // the figures eat the same invented population, kept consistent with the cells
    const meanSteps = 13 + rand() * 22;
    const oracle = totals.multi.episodes * 4;
    T.interaction.push({
      model: id, demo: true,
      recovered: Math.round(oracle * (0.45 + skill * 0.45)),
      oracle,
      questions: Math.round(totals.multi.episodes * (1.5 + rand() * 3)),
      single: { ...totals.single,
                steps: Math.round(totals.single.episodes * (8 + rand() * 14)) },
      multi: { ...totals.multi,
               steps: Math.round(totals.multi.episodes * meanSteps) },
    });
    const calls = totals.multi.episodes * meanSteps;
    const w = {
      ask_user: 0.05 + rand() * 0.07, ask_selector: rand() * 0.03,
      get_schema: 0.05, describe_table: 0.04 + rand() * 0.04,
      sample_rows: 0.05 + rand() * 0.05, compile_plsql: 0.06 + rand() * 0.05,
      execute_scratch: 0.45 + rand() * 0.15, reset_scratch: 0.03 + rand() * 0.04,
    };
    w.submit = 0.04;
    const wSum = Object.values(w).reduce((a, b) => a + b, 0);
    const tools = {};
    for (const [tool, weight] of Object.entries(w)) {
      tools[tool] = Math.max(1, Math.round(calls * weight / wSum));
    }
    T.actions.push({ model: id, stage: 'multi', tools, demo: true });
    for (const stage of ['single', 'multi']) {
      const failures = totals[stage].episodes - totals[stage].passed;
      // single-turn ships the full spec, so its failures are implementation by
      // definition; multi-turn failures skew towards specification
      const spec = stage === 'multi'
        ? Math.round(failures * (0.55 + rand() * 0.35)) : 0;
      T.attribution_summary.push({
        model: id, stage, demo: true,
        episodes: totals[stage].episodes, failures, spec, impl: failures - spec,
      });
    }
  }
}

function legend(pairs) {
  return el('div', { class: 'fig-legend' }, pairs.map(([label, cls]) =>
    el('span', { class: 'fig-key' }, el('i', { class: `swatch ${cls}` }), label)));
}

/* ── leaderboard: overall EX per model, everything aggregated ─────── */

function modelAggregate(modelId, stage = null) {
  let passed = 0, episodes = 0;
  for (const [key, cell] of Object.entries(T.cells)) {
    const [cellStage, cellModel] = key.split('|');
    if (cellModel !== modelId) continue;
    if (stage && cellStage !== stage) continue;
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
    const tip = `${r.m.label} — single-turn ${single.passed}/${single.episodes}, ` +
      `multi-turn ${multi.passed}/${multi.episodes}`;
    chart.append(el('div', { class: 'lb-row', title: tip },
      el('div', { class: 'lb-label' }, r.m.label),
      el('div', { class: 'lb-track' },
        el('i', { class: 'lb-fill', style: `width:${pct}%` })),
      el('div', { class: 'lb-val' }, `${pct.toFixed(1)}%`,
        el('span', { class: 'lb-n' }, `${r.passed}/${r.episodes}`))));
  }
  box.append(chart);
}

/* ── Tables 4/5: the clickable EX matrices, one dialect at a time ─── */

function cellFor(stage, model, dialect, scenario) {
  return T.cells[`${stage}|${model}|${dialect}|${scenario}`] || null;
}

const MATRIX_DIALECT = { single: 'postgres', multi: 'postgres' };

/* A real exported episode to stand behind a cell that has no representative of its
 * own (the DEMO_FILL cells).  episodes_index only ever holds real exports, so the
 * demo never fabricates a trace — it borrows the nearest genuine one. */
function sampleTrace(stage, dialect, scenario) {
  const entries = Object.entries(T.episodes_index);
  const canonical = ([, m]) =>
    m.stage === stage && m.condition === (T.conditions || {})[stage];
  const hit =
    entries.find((e) => canonical(e) &&
      e[1].dialect === dialect && e[1].scenario === scenario) ||
    entries.find((e) => canonical(e) && e[1].scenario === scenario) ||
    entries.find((e) => canonical(e) && e[1].dialect === dialect) ||
    entries.find(([, m]) => m.stage === stage);
  return hit ? hit[0] : null;
}

function renderMatrix(tableId, toolsId, stage) {
  const dialect = MATRIX_DIALECT[stage];

  const tools = $(toolsId);
  tools.textContent = '';
  const group = el('div', { class: 'filter-group' });
  for (const d of T.dialects) {
    group.append(el('button', {
      class: 'seg' + (d === dialect ? ' is-active' : ''),
      onclick: () => { MATRIX_DIALECT[stage] = d; renderMatrix(tableId, toolsId, stage); },
    }, DIALECT_LABEL[d] || d));
  }
  tools.append(el('span', { class: 'f' }, 'dialect'), group);

  const table = $(tableId);
  table.textContent = '';
  table.append(el('thead', {}, el('tr', {},
    el('th', {}, 'model'),
    T.scenarios.map((s) => el('th', { class: 'n' }, SCEN_LABEL[s] || s)),
    el('th', { class: 'n ovcell' }, 'All'))));

  const body = el('tbody');
  const models = [...T.models].sort((a, b) => {
    const aa = modelAggregate(a.id), bb = modelAggregate(b.id);
    return (bb.episodes ? bb.passed / bb.episodes : -1)
         - (aa.episodes ? aa.passed / aa.episodes : -1);
  });
  for (const model of models) {
    const row = el('tr', {}, el('th', {}, model.label));
    for (const s of T.scenarios) {
      const cell = cellFor(stage, model.id, dialect, s);
      const td = el('td', { class: 'n excell' });
      if (!cell || !cell.episodes) {
        td.classList.add('is-missing');
        td.append(el('span', { class: 'muted', title: 'this experiment has not been run' },
          'not run'));
      } else {
        if (cell.passed === cell.episodes) td.classList.add('is-all');
        else if (cell.passed === 0) td.classList.add('is-none');
        const text = [el('b', {}, String(cell.passed)), ` / ${cell.episodes}`];
        // the single-file preview carries no per-episode data, so no trace links
        const rep = window.EMBEDDED_TABLES
          ? null : (cell.rep || sampleTrace(stage, dialect, s));
        if (rep) {
          const attr = cell.attribution || {};
          const title = cell.rep
            ? `runs: ${cell.runs.join(', ')}` +
              (attr.spec || attr.impl
                ? ` · failures: ${attr.spec} spec / ${attr.impl} impl` : '') +
              ' · click for the representative trace'
            : 'click for a sample trace';
          td.append(el('a', {
            class: 'exlink', title,
            href: `run.html?id=${encodeURIComponent(rep)}`,
          }, ...text));
        } else {
          td.append(el('span', { class: 'exlink' }, ...text));
        }
      }
      row.append(td);
    }
    // pooled column for the dialect on display, same counting as the cells
    let allPassed = 0, allEpisodes = 0;
    for (const s of T.scenarios) {
      const cell = cellFor(stage, model.id, dialect, s);
      if (cell) { allPassed += cell.passed; allEpisodes += cell.episodes; }
    }
    row.append(el('td', { class: 'n excell ovcell' },
      allEpisodes
        ? el('span', { class: 'exlink' }, el('b', {}, String(allPassed)),
            ` / ${allEpisodes}`)
        : el('span', { class: 'muted' }, 'not run')));
    body.append(row);
  }
  table.append(body);
}

/* ── Table 6: B2 performance ──────────────────────────────────────── */

function renderB2() {
  const table = $('#t6');
  const cols = ['run', 'mode', 'model', 'condition', 'dialect', 'episodes',
    'EX pass', 'perf pass', 'both', 'mean speedup vs baseline', 'mean ratio vs gold'];
  table.append(el('thead', {}, el('tr', {}, cols.map((c) => el('th', {}, c)))));
  const body = el('tbody');
  if (!T.b2_performance.length) {
    body.append(el('tr', {}, el('td', { colspan: String(cols.length), class: 'muted' },
      'not run')));
  }
  for (const rowData of T.b2_performance) {
    const perf = rowData.performance || {};
    body.append(el('tr', {},
      el('td', {}, rowData.run),
      el('td', {}, rowData.stage),
      el('td', {}, rowData.model),
      el('td', {}, rowData.condition || '—'),
      el('td', {}, rowData.dialects.join(', ')),
      el('td', { class: 'n' }, String(perf.episodes ?? '—')),
      el('td', { class: 'n' }, String(perf.ex_passed ?? '—')),
      el('td', { class: 'n' }, String(perf.performance_passed ?? '—')),
      el('td', { class: 'n' }, String(perf.both_passed ?? '—')),
      el('td', { class: 'n' }, perf.mean_speedup_vs_baseline ?? '—'),
      el('td', { class: 'n' }, perf.mean_ratio_vs_gold ?? '—')));
  }
  table.append(body);
}

/* ── Table 7: hardening ablation ──────────────────────────────────── */

function renderHardening() {
  const table = $('#t7');
  const cols = ['model', 'dialect', 'full corpus (run)', 'full EX',
    'ablated corpus (run)', 'ablated EX'];
  table.append(el('thead', {}, el('tr', {}, cols.map((c) => el('th', {}, c)))));
  const body = el('tbody');
  if (!T.hardening.length) {
    body.append(el('tr', {}, el('td', { colspan: String(cols.length), class: 'muted' },
      'not run')));
  }
  for (const pair of T.hardening) {
    const f = pair.full, a = pair.ablated;
    body.append(el('tr', {},
      el('td', {}, (f || a).model),
      el('td', {}, (f || a).dialects.join(', ')),
      el('td', {}, f ? f.run : '—'),
      el('td', { class: 'n' }, f ? `${f.passed} / ${f.graded}` : 'not run'),
      el('td', {}, a.run),
      el('td', { class: 'n' }, `${a.passed} / ${a.graded}`)));
  }
  table.append(body);
}

/* ── interaction ability: retention vs turns (paper Fig. 2) ───────── */

const SVG_NS = 'http://www.w3.org/2000/svg';

function sv(tag, attrs = {}, ...kids) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return node;
}

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0;
};

function modelLabel(id) {
  return (T.models.find((x) => x.id === id) || { label: id }).label;
}

function renderInteraction() {
  const fig = $('#fig2');
  fig.textContent = '';
  const points = T.interaction
    .filter((m) => m.single.episodes && m.multi.episodes && m.single.passed)
    .map((m) => ({
      id: m.model,
      label: modelLabel(m.model),
      kind: MODEL_KIND[m.model] || 'open',
      turns: m.multi.steps / m.multi.episodes,
      singleEx: m.single.passed / m.single.episodes,
      retention: (m.multi.passed / m.multi.episodes) /
                 (m.single.passed / m.single.episodes),
      raw: m,
    }));
  if (!points.length) {
    fig.append(el('p', { class: 'muted' }, 'not run'));
    return;
  }
  const skipped = T.interaction.filter((m) => !m.single.episodes || !m.single.passed);

  const W = 680, H = 400, M = { l: 52, r: 130, t: 16, b: 44 };
  const xs = points.map((p) => p.turns), ys = points.map((p) => p.retention);
  const xMin = Math.max(0, Math.min(...xs) - 4), xMax = Math.max(...xs) + 4;
  const yMin = Math.max(0, Math.min(...ys) - 0.08);
  const yMax = Math.min(1.15, Math.max(...ys) + 0.08);
  const X = (v) => M.l + (v - xMin) / (xMax - xMin) * (W - M.l - M.r);
  const Y = (v) => H - M.b - (v - yMin) / (yMax - yMin) * (H - M.t - M.b);

  const svg = sv('svg', { class: 'scatter', viewBox: `0 0 ${W} ${H}`,
                          role: 'img', 'aria-label': 'retention vs turns' });
  // gridlines + ticks
  for (let v = Math.ceil(yMin * 10) / 10; v <= yMax + 1e-9; v += 0.1) {
    svg.append(sv('line', { class: 'sc-grid', x1: M.l, x2: W - M.r,
                            y1: Y(v), y2: Y(v) }));
    svg.append(sv('text', { class: 'sc-tick', x: M.l - 8, y: Y(v) + 3,
                            'text-anchor': 'end' }, v.toFixed(1)));
  }
  const xStep = (xMax - xMin) > 24 ? 10 : 5;
  for (let v = Math.ceil(xMin / xStep) * xStep; v <= xMax; v += xStep) {
    svg.append(sv('text', { class: 'sc-tick', x: X(v), y: H - M.b + 16,
                            'text-anchor': 'middle' }, String(v)));
  }
  // median crosshair
  svg.append(sv('line', { class: 'sc-median', x1: X(median(xs)), x2: X(median(xs)),
                          y1: M.t, y2: H - M.b }));
  svg.append(sv('line', { class: 'sc-median', x1: M.l, x2: W - M.r,
                          y1: Y(median(ys)), y2: Y(median(ys)) }));
  // axis titles + quadrant hints
  svg.append(sv('text', { class: 'sc-axis', x: (M.l + W - M.r) / 2, y: H - 8,
                          'text-anchor': 'middle' },
    'mean steps per multi-turn episode'));
  svg.append(sv('text', { class: 'sc-axis', x: 14, y: (M.t + H - M.b) / 2,
                          transform: `rotate(-90 14 ${(M.t + H - M.b) / 2})`,
                          'text-anchor': 'middle' }, 'retention (multi ÷ single EX)'));
  svg.append(sv('text', { class: 'sc-hint', x: M.l + 6, y: M.t + 12 }, 'asks well'));
  svg.append(sv('text', { class: 'sc-hint', x: W - M.r - 6, y: H - M.b - 8,
                          'text-anchor': 'end' }, 'spends without gaining'));
  // points, biggest first so small ones stay clickable; a label flips to the left
  // side when another point sits close on its right, so labels don't collide
  for (const p of [...points].sort((a, b) => b.singleEx - a.singleEx)) {
    const r = 5 + p.singleEx * 9;
    const x = X(p.turns), y = Y(p.retention);
    const crowdedRight = points.some((q) => q !== p &&
      X(q.turns) > x && X(q.turns) - x < 120 && Math.abs(Y(q.retention) - y) < 16);
    const g = sv('g', { class: `sc-pt sc-${p.kind}` });
    g.append(sv('title', {},
      `${p.label}\nretention ${p.retention.toFixed(2)} · ` +
      `${p.turns.toFixed(1)} steps/episode\n` +
      `single ${p.raw.single.passed}/${p.raw.single.episodes} · ` +
      `multi ${p.raw.multi.passed}/${p.raw.multi.episodes}`));
    g.append(sv('circle', { cx: x, cy: y, r }));
    g.append(sv('text', {
      class: 'sc-label',
      x: crowdedRight ? x - r - 4 : x + r + 4,
      y: y + 3.5,
      'text-anchor': crowdedRight ? 'end' : 'start',
    }, p.label));
    svg.append(g);
  }
  fig.append(svg);
  fig.append(legend([['closed-source', 'sw-closed'], ['open-weight', 'sw-open']]));
  fig.append(el('p', { class: 'muted small' },
    'Point area tracks single-turn EX. ' +
    (skipped.length
      ? `Not plotted (no single-turn baseline yet): ${
          skipped.map((m) => modelLabel(m.model)).join(', ')}.`
      : '')));
}

/* ── action distribution heatmap + EX strip (paper Fig. 3) ────────── */

const TOOL_ORDER = ['ask_user', 'ask_selector', 'get_schema', 'describe_table',
  'sample_rows', 'compile_plsql', 'execute_scratch', 'reset_scratch', 'submit'];
const TOOL_SHORT = {
  ask_user: 'ask', ask_selector: 'select', get_schema: 'schema',
  describe_table: 'describe', sample_rows: 'sample', compile_plsql: 'compile',
  execute_scratch: 'exec', reset_scratch: 'reset', submit: 'submit',
};

function heatCell(value, max, text, { hue = 'accent', title = '' } = {}) {
  const share = max ? value / max : 0;
  const strength = Math.round(Math.min(88, share * 95));
  const cell = el('div', {
    class: 'hm-cell' + (strength > 45 ? ' hm-dark' : ''),
    style: `background: color-mix(in srgb, var(--${hue}) ${strength}%, var(--surface))`,
    title,
  }, text);
  return cell;
}

function multiEx(modelId) {
  const m = T.interaction.find((x) => x.model === modelId);
  return m && m.multi.episodes
    ? { pct: 100 * m.multi.passed / m.multi.episodes,
        passed: m.multi.passed, episodes: m.multi.episodes }
    : null;
}

function renderActions() {
  const fig = $('#fig3');
  fig.textContent = '';
  const rows = T.actions.filter((a) => a.stage === 'multi');
  if (!rows.length) {
    fig.append(el('p', { class: 'muted' }, 'not run'));
    return;
  }
  // hide tools no model ever used
  const tools = TOOL_ORDER.filter((t) =>
    rows.some((r) => (r.tools[t] || 0) > 0));
  const shares = rows.map((r) => {
    const total = Object.values(r.tools).reduce((a, b) => a + b, 0);
    return { r, total,
             share: tools.map((t) => total ? 100 * (r.tools[t] || 0) / total : 0) };
  }).sort((a, b) => {
    const ea = multiEx(a.r.model), eb = multiEx(b.r.model);
    return (eb ? eb.pct : -1) - (ea ? ea.pct : -1);
  });
  const maxShare = Math.max(...shares.flatMap((s) => s.share), 1);

  const grid = el('div', {
    class: 'hm',
    style: `grid-template-columns: 150px repeat(${tools.length}, minmax(46px, 1fr)) 150px`,
  });
  grid.append(el('div', { class: 'hm-head' }, 'share of actions (%)'));
  for (const t of tools) grid.append(el('div', { class: 'hm-head hm-col' }, TOOL_SHORT[t]));
  grid.append(el('div', { class: 'hm-head' }, 'multi-turn EX'));
  for (const { r, total, share } of shares) {
    grid.append(el('div', { class: 'hm-label', title: `${total} tool calls` },
      modelLabel(r.model)));
    tools.forEach((t, i) => {
      grid.append(heatCell(share[i], maxShare, share[i] ? share[i].toFixed(0) : '·',
        { title: `${t}: ${r.tools[t] || 0} calls (${share[i].toFixed(1)}%)` }));
    });
    const ex = multiEx(r.model);
    grid.append(ex
      ? el('div', { class: 'hm-exbar', title: `${ex.passed}/${ex.episodes}` },
          el('i', { style: `width:${ex.pct}%` }),
          el('span', {}, `${ex.pct.toFixed(0)}%`))
      : el('div', { class: 'hm-exbar muted small' }, 'not run'));
  }
  fig.append(el('div', { class: 'scroll-x' }, grid));
  fig.append(el('p', { class: 'muted small' },
    'Rows ordered by multi-turn EX; darker = larger share within the figure.'));
}

/* ── failure attribution heatmap (stands in for paper Fig. 5) ─────── */

const ATTR_COLS = [
  ['spec', 'specification'],
  ['impl', 'implementation'],
];

function renderAttribution() {
  const fig = $('#fig5');
  fig.textContent = '';
  const rows = T.attribution_summary.filter((r) => r.episodes);
  if (!rows.length) {
    fig.append(el('p', { class: 'muted' }, 'not run'));
    return;
  }
  for (const stage of ['multi', 'single']) {
    const group = rows.filter((r) => r.stage === stage)
      .sort((a, b) => (a.failures / a.episodes) - (b.failures / b.episodes));
    if (!group.length) continue;
    const rates = group.flatMap((r) =>
      ATTR_COLS.map(([k]) => 100 * r[k] / r.episodes));
    const maxRate = Math.max(...rates, 1);
    const grid = el('div', {
      class: 'hm',
      style: `grid-template-columns: 150px repeat(${ATTR_COLS.length}, minmax(90px, 1fr)) 150px`,
    });
    grid.append(el('div', { class: 'hm-head' },
      stage === 'multi' ? 'multi-turn (% of episodes)' : 'single-turn (% of episodes)'));
    for (const [, name] of ATTR_COLS) {
      grid.append(el('div', { class: 'hm-head hm-col' }, name));
    }
    grid.append(el('div', { class: 'hm-head' }, 'failed / played'));
    for (const r of group) {
      grid.append(el('div', { class: 'hm-label' }, modelLabel(r.model)));
      for (const [k, name] of ATTR_COLS) {
        const rate = 100 * r[k] / r.episodes;
        grid.append(heatCell(rate, maxRate, rate ? rate.toFixed(0) : '·',
          { hue: 'fail', title: `${name} errors: ${r[k]} of ${r.episodes} episodes` }));
      }
      grid.append(el('div', { class: 'hm-note' }, `${r.failures} / ${r.episodes}`));
    }
    fig.append(el('div', { class: 'scroll-x' }, grid));
  }
  fig.append(el('p', { class: 'muted small' },
    'Single-turn ships the complete spec, so its failures are implementation ' +
    'errors by definition — the contrast with the multi-turn block is the point.'));
}

/* ── appendix: runs kept out of the main tables ───────────────────── */

function renderExtra() {
  const table = $('#extra');
  const cols = ['run', 'why it is outside', 'mode', 'condition', 'model', 'dialect',
    'EX (passed/graded)'];
  table.append(el('thead', {}, el('tr', {}, cols.map((c) => el('th', {}, c)))));
  const body = el('tbody');
  const outside = T.runs.filter((r) => T.excluded[r.run]);
  if (!outside.length) {
    body.append(el('tr', {}, el('td', { colspan: String(cols.length), class: 'muted' }, 'none')));
  }
  for (const r of outside) {
    body.append(el('tr', {},
      el('td', {}, r.run),
      el('td', {}, T.excluded[r.run]),
      el('td', {}, r.stage),
      el('td', {}, r.condition || (r.legacy ? '(legacy manifest)' : '—')),
      el('td', {}, r.model),
      el('td', {}, r.dialects.join(', ')),
      el('td', { class: 'n' }, r.graded ? `${r.passed} / ${r.graded}` : 'not graded')));
  }
  table.append(body);
}

/* ── boot ─────────────────────────────────────────────────────────── */

function renderAll() {
  if (DEMO_FILL) applyDemoFill();
  renderLeaderboard();
  $('#t4-cond').textContent = `· condition: ${T.conditions.single}`;
  $('#t5-cond').textContent = `· condition: ${T.conditions.multi}, full tier`;
  renderMatrix('#t4', '#t4-tools', 'single');
  renderMatrix('#t5', '#t5-tools', 'multi');
  renderB2();
  renderHardening();
  renderInteraction();
  renderActions();
  renderAttribution();
  renderExtra();
  $('#footer-note').textContent =
    `Export generated ${T.generated} · representative-episode rule: ${T.pick}` +
    ` (smallest task id unless configured otherwise) · ${T.note}`;
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
