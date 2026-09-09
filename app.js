/* ProcArena trace viewer — run.html's script.
 *
 * Reads exactly one thing: the episode view JSON written by `viz/export.py`
 * (`data/<run>--<task_id>.json`), plus `tables.json` for cross-links.  It renders what
 * it reads and computes no benchmark metric: EX and attribution come from grades.json
 * via the export, recovery from episode.json.  Anything absent renders as "not run" /
 * "not graded" — never 0.
 *
 * URL: run.html?id=<run>--<task_id>
 */

'use strict';

/* ── tiny DOM helpers ─────────────────────────────────────────────── */

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

const num = (v, d = 1) =>
  (v === null || v === undefined) ? '—' : Number(v).toFixed(d).replace(/\.0+$/, '');

function seconds(v) {
  if (v === null || v === undefined) return '—';
  return v >= 60 ? `${Math.floor(v / 60)}m ${Math.round(v % 60)}s` : `${Math.round(v)}s`;
}

const kfmt = (v) => (v === null || v === undefined) ? '—'
  : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);

/* ── PL/SQL highlighting (presentation only) ──────────────────────── */

const SQL_WORDS = [
  'select', 'insert', 'update', 'delete', 'from', 'where', 'into', 'values', 'set',
  'create', 'or', 'replace', 'procedure', 'function', 'begin', 'end', 'declare', 'as',
  'is', 'if', 'then', 'else', 'elsif', 'loop', 'while', 'for', 'exit', 'when', 'and',
  'not', 'null', 'in', 'exists', 'like', 'between', 'order', 'group', 'by', 'having',
  'join', 'left', 'right', 'inner', 'outer', 'on', 'distinct', 'union', 'all', 'case',
  'commit', 'rollback', 'exception', 'raise', 'return', 'returns', 'language',
  'plpgsql', 'cursor', 'fetch', 'open', 'close', 'table', 'index', 'view', 'trigger',
];
const SQL_RE = new RegExp(
  String.raw`('(?:[^']|'')*')|(--[^\n]*)|(\b\d+(?:\.\d+)?\b)|\b(` +
  SQL_WORDS.join('|') + String.raw`)\b`, 'gi');

function highlightSql(code) {
  return esc(code).replace(SQL_RE, (m, str, com, n, kw) => {
    if (str) return `<span class="sql-str">${str}</span>`;
    if (com) return `<span class="sql-com">${com}</span>`;
    if (n) return `<span class="sql-num">${n}</span>`;
    return `<span class="sql-kw">${kw}</span>`;
  });
}

/* ── clipped blocks ───────────────────────────────────────────────── */

function block(text, { sql = false, wrap = false } = {}) {
  const pre = el('pre', { class: 'block' + (wrap ? ' wrap' : '') });
  if (sql) pre.innerHTML = highlightSql(text);
  else pre.textContent = text;
  const lines = String(text).split('\n').length;
  if (lines <= 14 && String(text).length < 1600) return pre;
  const box = el('div');
  pre.classList.add('clip');
  const btn = el('button', { class: 'toggle' }, `show all (${lines} lines)`);
  btn.addEventListener('click', () => {
    const clipped = pre.classList.toggle('clip');
    btn.textContent = clipped ? `show all (${lines} lines)` : 'collapse';
  });
  box.append(pre, btn);
  return box;
}

function field(label, ...kids) {
  return el('div', { class: 'field' }, el('div', { class: 'field-k' }, label), ...kids);
}

function idChips(ids) {
  return el('span', { class: 'chiprow' },
    (ids || []).map((id) => el('span', { class: 'chip' }, id)));
}

/* ── page state ───────────────────────────────────────────────────── */

let VIEW = null;
let TABLES = null;   // optional; used for pair cross-links

/* ── header, banners, metrics ─────────────────────────────────────── */

function renderTitle(view) {
  $('#title').innerHTML =
    `${esc(view.task_id)}<span class="sep">·</span>` +
    `${esc(view.model_label || view.model)}` +
    `<span class="sep">·</span>${esc(view.dialect)}` +
    `<span class="sep">·</span>${esc((view.scenario || '').toUpperCase())}` +
    `<span class="sep">·</span>${view.stage === 'multi' ? 'Interactive' : 'Direct'}`;
  document.title = `ProcArena · ${view.task_id} · ${view.stage}`;
}

function pairLink(view) {
  // The paired episode of the same task in the other stage, if it was exported.
  if (!TABLES) return null;
  const wantStage = view.stage === 'multi' ? 'single' : 'multi';
  const hits = Object.entries(TABLES.episodes_index || {}).filter(([id, m]) =>
    m.stage === wantStage && m.model === view.model && m.dialect === view.dialect &&
    id.endsWith(`--${view.task_id}`) &&
    m.condition === (TABLES.conditions || {})[wantStage]);
  if (!hits.length) return null;
  return { id: hits[0][0], stage: wantStage };
}

function renderBanners(view) {
  const box = $('#banners');
  box.textContent = '';
  if (!view.grade) {
    box.append(el('div', { class: 'banner banner-void' },
      'Not graded — this episode has no entry in grades.json. No EX verdict is shown.'));
  }
  const pair = pairLink(view);
  if (pair) {
    const other = pair.stage === 'multi' ? 'Interactive' : 'Direct';
    box.append(el('div', { class: 'banner banner-info' },
      `This task was also played in the ${other} mode: `,
      el('a', { href: `run.html?id=${encodeURIComponent(pair.id)}` },
        `view the ${other} trace →`)));
  }
}

function metric(key, value, cls) {
  return el('div', { class: 'metric' },
    el('div', { class: 'k' }, key),
    el('div', { class: 'v' + (cls ? ` ${cls}` : '') }, value));
}

const ATTRIBUTION_LABEL = {
  spec: 'specification', impl: 'implementation',
};

function renderMetrics(view) {
  const box = $('#metrics');
  box.textContent = '';
  const grade = view.grade;
  const summary = view.summary || {};

  if (grade) {
    box.append(metric('EX', grade.correct ? '✓ pass' : '✗ fail',
      grade.correct ? 'v-ok' : 'v-fail'));
    if (grade.correct === false) {
      box.append(metric('failure', ATTRIBUTION_LABEL[grade.attribution] ||
        grade.attribution || '—', 'v-fail'));
    }
  } else {
    box.append(metric('EX', 'not graded'));
  }
  if (view.stage === 'multi') {
    const oracle = summary.oracle_size ?? view.ledger.length;
    const rec = el('div', { class: 'metric' },
      el('div', { class: 'k' }, 'facts recovered'),
      el('div', { class: 'v' }, `${summary.recovered ?? '—'}`,
        el('small', {}, ` / ${oracle}`)));
    box.append(rec);
    box.append(metric('questions',
      String((summary.questions || {}).ask_user ?? '—')));
  }
  box.append(metric('steps', `${summary.steps ?? '—'}`));
  const tokens = summary.tokens;
  if (tokens && (tokens.input_tokens || tokens.output_tokens)) {
    const t = el('div', { class: 'metric', title:
      `${tokens.calls ?? '—'} LLM calls · ${tokens.input_tokens} prompt tokens, ` +
      `${tokens.output_tokens} completion tokens` });
    t.append(el('div', { class: 'k' }, 'tokens'),
      el('div', { class: 'v' }, `${kfmt(tokens.input_tokens)}`,
        el('small', {}, ` in · ${kfmt(tokens.output_tokens)} out`)));
    box.append(t);
    if (tokens.cost_usd) {
      box.append(metric('cost', `$${Number(tokens.cost_usd).toFixed(3)}`));
    }
  }
  box.append(metric('wall clock', seconds(summary.seconds)));
  box.append(metric('ended by', summary.termination || '—'));
  if (summary.budget && summary.budget.limit) {
    box.append(metric('budget',
      `${num(summary.budget.spent, 1)} / ${num(summary.budget.limit, 0)}`,
      summary.budget.exhausted ? 'v-fail' : undefined));
  }
  box.hidden = false;
}

/* ── left column ──────────────────────────────────────────────────── */

function renderOpening(view) {
  const box = $('#opening');
  box.textContent = '';
  if (!view.task.available) {
    box.append(el('p', { class: 'muted' },
      'task.json for this episode is not in the results tree; the prompt cannot be shown.'));
    return;
  }
  box.append(el('div', { class: 'prose' }, view.task.prompt || '(empty prompt)'));
  for (const mat of view.task.materials || []) {
    box.append(field(`material · ${mat.file}${mat.kind ? ` (${mat.kind})` : ''}`,
      block(mat.text, { sql: /\.(sql|plsql)$/i.test(mat.file) })));
  }
}

function renderBudget(view) {
  const box = $('#budget');
  box.textContent = '';
  const summary = view.summary || {};
  const budget = summary.budget;
  if (budget && budget.limit) {
    const spent = budget.spent ?? 0;
    const pct = Math.min(100, 100 * spent / budget.limit);
    const row = el('div', { class: 'bar-row' },
      el('div', { class: 'lbl' }, el('span', {}, 'points'),
        el('b', {}, `${num(spent, 1)} / ${num(budget.limit, 0)}`)),
      el('div', { class: 'bar' + (budget.exhausted ? ' is-spent' : '') },
        el('i', { style: `width:${pct}%` })));
    box.append(row);
    const spentBy = Object.entries(budget.by_tool || {})
      .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (spentBy.length) {
      box.append(el('div', { class: 'kv' }, spentBy.flatMap(([k, v]) => [
        el('dt', {}, k), el('dd', {}, num(v, 1))])));
    }
  } else {
    const steps = summary.steps, max = view.max_steps;
    if (max) {
      const pct = Math.min(100, 100 * (steps || 0) / max);
      box.append(el('div', { class: 'bar-row' },
        el('div', { class: 'lbl' }, el('span', {}, 'steps'),
          el('b', {}, `${steps ?? '—'} / ${max}`)),
        el('div', { class: 'bar' }, el('i', { style: `width:${pct}%` }))));
      box.append(el('p', { class: 'muted small' },
        'No point budget on this run; the guard is the step cap.'));
    } else {
      box.append(el('p', { class: 'muted small' }, 'No budget recorded.'));
    }
  }
}

/* Recovery ledger: one moment per entry (revealed_at + via), which is all the new
 * harness records — there is no exposed/asked/resolved triple any more. */

const VIA_LABEL = { ask_user: 'ask_user', ask_selector: 'ask_selector' };

function ledgerState(row) {
  if (row.revealed_at !== null && row.revealed_at !== undefined) return 'resolved';
  if (row.refuted) return 'lost-seen';
  return 'lost-unseen';
}

function renderLedgerPanel(view) {
  const box = $('#terms');
  box.textContent = '';
  if (view.stage !== 'multi' || !view.ledger.length) {
    box.append(el('p', { class: 'muted small' },
      view.stage === 'multi' ? 'No oracle entries recorded.'
        : 'Single-turn episode — the task ships complete; there is nothing to recover.'));
    return;
  }
  const got = view.ledger.filter((r) => r.revealed_at !== null && r.revealed_at !== undefined);
  box.append(el('p', { class: 'life-head small' },
    el('b', {}, `${got.length} / ${view.ledger.length}`), ' entries recovered'));
  for (const row of view.ledger) {
    const state = ledgerState(row);
    const trail = state === 'resolved'
      ? `step ${row.revealed_at} · ${VIA_LABEL[row.via] || row.via || '—'}`
      : (row.refuted ? 'refuted' : 'never surfaced');
    const item = el('div', { class: `term is-${state}` },
      el('span', { class: 'surface', title: row.key || '' }, row.id),
      el('span', { class: 'chip' }, row.op),
      el('span', { class: 'trail' }, trail));
    if (state === 'resolved') {
      item.classList.add('is-linked');
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => focusStep(row.revealed_at));
    }
    box.append(item);
  }
  box.append(el('p', { class: 'life-note muted' },
    'Colour: green = recovered, red = refuted, grey = never surfaced. ',
    'Click a recovered entry to jump to the step that surfaced it. ',
    'Full text of every entry is under the Ledger tab.'));
}

function renderMeta(view) {
  const box = $('#meta');
  box.textContent = '';
  const summary = view.summary || {};
  const sim = view.simulator || {};
  const rows = [
    ['run', view.run], ['task', view.task_id], ['stage', view.stage],
    ['condition', view.condition], ['tier', view.tier || '—'],
    ['scenario', view.scenario], ['dialect', view.dialect],
    ['solver', `${view.model_label || view.model} · ${view.solver_id || view.model}` +
      ` (${view.effort || 'default'})`],
    ['max steps', view.max_steps ?? '—'],
    ['simulator gate', sim.gate ?? '—'],
    ['match model', sim.match_model ?? '—'],
    ['selector', sim.selector ?? '—'],
    ['submitted', String(summary.submitted ?? '—')],
    ['malformed', String(summary.submission_malformed ?? '—')],
  ];
  box.append(el('div', { class: 'kv' },
    rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, String(v))])));
}

/* ── timeline ─────────────────────────────────────────────────────── */

const TOOL_CATEGORY = {
  ask_user: 'ask', ask_selector: 'ask',
  get_schema: 'db', describe_table: 'db', sample_rows: 'db',
  compile_plsql: 'scratch', execute_scratch: 'scratch', reset_scratch: 'scratch',
  submit: 'submit',
};

const ERR_RE = /\b(error|exception|failed|ORA-\d+|syntax)/i;

function stepHasError(entry) {
  if (entry.tool === 'compile_plsql' && entry.compiled === false) return true;
  return ERR_RE.test(String(entry.result || '').slice(0, 400));
}

function askCard(entry, body) {
  const args = entry.args || {};
  body.append(field('question', el('div', { class: 'part part-f1' },
    el('div', { class: 'part-text' }, args.question || ''))));
  body.append(field('simulated user replied', el('div', { class: 'part part-f2' },
    el('div', { class: 'part-text' }, entry.result || ''))));
  const verdicts = el('div', { class: 'issues' });
  if ((entry.revealed || []).length) {
    verdicts.append(el('div', { class: 'issue' },
      'revealed: ', idChips(entry.revealed)));
  }
  if ((entry.suppressed || []).length) {
    verdicts.append(el('div', { class: 'issue issue-risk' },
      'suppressed: ', idChips(entry.suppressed)));
  }
  if ((entry.unmatched || []).length) {
    verdicts.append(el('div', { class: 'issue issue-risk' },
      'unmatched: ', idChips(entry.unmatched)));
  }
  if (entry.fallback) {
    verdicts.append(el('div', { class: 'issue' }, `fallback answers: ${entry.fallback}`));
  }
  const loc = entry.loc;
  if (loc && (loc.answers || loc.refused || loc.blocked || loc.none ||
              (loc.items || []).length)) {
    const bits = [];
    if (loc.answers) bits.push(`answered ${loc.answers}`);
    if (loc.refused) bits.push(`refused ${loc.refused}`);
    if (loc.blocked) bits.push(`blocked ${loc.blocked}`);
    if (loc.none) bits.push(`no entry ${loc.none}`);
    const line = el('div', { class: 'issue' }, `LOC fallback: ${bits.join(' · ')} `);
    if ((loc.items || []).length) line.append(idChips(loc.items));
    verdicts.append(line);
  }
  if (verdicts.children.length) body.append(field('oracle bookkeeping', verdicts));
}

function selectorCard(entry, body) {
  const args = entry.args || {};
  body.append(field('question', el('div', { class: 'part part-f1' },
    el('div', { class: 'part-text' }, args.question || ''))));
  const options = entry.options || args.options || [];
  const chosen = Number(entry.result);
  body.append(field('options (selector chose one)',
    el('div', {}, options.map((opt, i) => el('div', {
      class: 'part ' + (i === chosen ? 'part-f2' : 'part-f3'),
    }, el('div', { class: 'part-text' }, `${i === chosen ? '▸ ' : ''}${opt}`))))));
  const bits = [];
  if (entry.entry) bits.push(`entry ${entry.entry}`);
  if (entry.status) bits.push(entry.status);
  if (entry.conflict_noted) bits.push('conflict noted');
  if (bits.length) body.append(el('p', { class: 'muted small' }, bits.join(' · ')));
}

function renderStepCard(entry) {
  const category = TOOL_CATEGORY[entry.tool] || 'other';
  const card = el('div', {
    class: 'card', id: `step-${entry.step}`,
    'data-cat': category, 'data-err': stepHasError(entry) ? '1' : '0',
  });
  const head = el('div', { class: 'card-head' },
    el('span', { class: 'turn-no' }, `#${entry.step}`),
    el('span', { class: `tool tool-${entry.tool}` }, entry.tool || entry.actor));
  if (entry.tool === 'compile_plsql' && 'compiled' in entry) {
    head.append(el('span', { class: `pill ${entry.compiled ? 'pill-ok' : 'pill-fail'}` },
      entry.compiled ? 'compiled' : 'compile error'));
  }
  if (entry.tool === 'submit') {
    head.append(el('span', { class: `pill ${entry.malformed ? 'pill-fail' : 'pill-ok'}` },
      entry.malformed ? 'malformed' : 'received'));
  }
  if (stepHasError(entry) && entry.tool !== 'compile_plsql') {
    head.append(el('span', { class: 'pill pill-fail' }, 'error'));
  }
  if (entry.spent !== undefined && entry.spent !== null) {
    head.append(el('span', {
      class: 'chip chip-spent',
      title: 'budget points spent so far (running total)',
    }, `⌛ ${Number(entry.spent).toFixed(1)}`));
  }
  card.append(head);

  const body = el('div', { class: 'card-body' });
  const args = entry.args;
  if (entry.tool === 'ask_user') {
    askCard(entry, body);
  } else if (entry.tool === 'ask_selector') {
    selectorCard(entry, body);
  } else if (entry.tool === 'submit') {
    body.append(field('submitted answer',
      block((args && args.answer) || JSON.stringify(args), { sql: true })));
  } else if (entry.tool === 'compile_plsql') {
    body.append(field('code', block((args && args.code) || '', { sql: true })));
    body.append(field('compiler', block(entry.result || '', { wrap: true })));
  } else if (entry.tool === 'execute_scratch') {
    body.append(field('sql', block((args && args.sql) || JSON.stringify(args), { sql: true })));
    body.append(field('result', block(entry.result || '', { wrap: true })));
  } else {
    if (args && Object.keys(args).length) {
      body.append(el('div', { class: 'args' },
        Object.entries(args).map(([k, v]) => el('span', { class: 'arg' },
          el('b', {}, `${k}: `), typeof v === 'string' ? v : JSON.stringify(v)))));
    }
    body.append(field('result', block(entry.result || '', { wrap: true })));
  }
  card.append(body);
  return card;
}

function renderTimeline(view) {
  const box = $('#timeline');
  box.textContent = '';
  if (!view.timeline.length) {
    box.append(el('div', { class: 'event' }, 'No transcript recorded for this episode.'));
    return;
  }
  for (const entry of view.timeline) box.append(renderStepCard(entry));
}

function focusStep(step, { smooth = true } = {}) {
  const card = $(`#step-${step}`);
  if (!card) return;
  for (const other of document.querySelectorAll('.card.is-target')) {
    other.classList.remove('is-target');
  }
  card.classList.add('is-target');
  card.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
}

function applyFilters() {
  const show = {
    ask: $('#f-ask').checked, db: $('#f-db').checked,
    scratch: $('#f-scratch').checked,
  };
  const errOnly = false; // the checkbox hides errors instead when unchecked
  const showErr = $('#f-err').checked;
  for (const card of document.querySelectorAll('#timeline .card')) {
    const cat = card.dataset.cat;
    let visible = cat === 'submit' || cat === 'other' || show[cat];
    if (!showErr && card.dataset.err === '1' && cat !== 'submit') visible = false;
    card.hidden = !visible;
  }
  void errOnly;
}

/* ── right tabs ───────────────────────────────────────────────────── */

function renderSubmissionTab(view) {
  const box = $('#tab-submission');
  box.textContent = '';
  const grade = view.grade;
  if (grade) {
    const verdict = el('p', { class: `verdict ${grade.correct ? 'v-ok' : 'v-fail'}` },
      grade.correct ? '✓ EX pass' : '✗ EX fail');
    box.append(verdict);
    if (!grade.correct) {
      if (grade.attribution) {
        box.append(el('p', { class: 'small' },
          el('b', {}, `${ATTRIBUTION_LABEL[grade.attribution] || grade.attribution} error`),
          ` — recovered ${grade.recovered} of ${grade.oracle_size} oracle entries` +
          (grade.attribution === 'spec'
            ? '; it was working from an incomplete spec.'
            : '; information was complete, the code is wrong.')));
      }
      const diagnosis = grade.diagnosis;
      if (diagnosis && diagnosis.kind) {
        box.append(field('diagnosis',
          el('div', {},
            el('span', { class: 'chip' }, diagnosis.kind),
            diagnosis.message
              ? block(diagnosis.message, { wrap: true }) : null)));
      } else if (grade.reason) {
        box.append(field('grader reason', block(grade.reason, { wrap: true })));
      }
    }
  } else {
    box.append(el('p', { class: 'muted' }, 'Not graded.'));
  }
  if (view.submission) {
    box.append(field(`submission (${view.submission.form})`,
      block(view.submission.text, { sql: view.submission.form !== 'diff' })));
  } else {
    box.append(el('p', { class: 'muted' },
      'No submission — the episode ended by ' +
      ((view.summary || {}).termination || 'an unknown cause') + '.'));
  }
}

function renderLedgerTab(view) {
  const box = $('#tab-ledger');
  box.textContent = '';
  if (!view.ledger.length) {
    box.append(el('p', { class: 'muted' },
      view.stage === 'multi' ? 'No oracle entries.' : 'Single-turn — no hidden facts.'));
    return;
  }
  box.append(el('p', { class: 'muted small' },
    'Every fact the task build removed from the prompt, and whether the solver got it ' +
    'back. Answers for entries never surfaced are collapsed — they are spoilers the ' +
    'solver did not see.'));
  for (const row of view.ledger) {
    const state = ledgerState(row);
    const item = el('div', { class: `term is-${state}`, style: 'flex-wrap:wrap' },
      el('span', { class: 'surface' }, row.id),
      el('span', { class: 'chip' }, row.op),
      el('span', { class: 'trail' },
        state === 'resolved' ? `step ${row.revealed_at} · ${row.via}` :
        (row.refuted ? 'refuted' : 'never surfaced')));
    const detail = el('div', { style: 'flex-basis:100%;padding:4px 0 6px' });
    if (row.key) detail.append(el('div', { class: 'small' }, el('b', {}, 'asks: '), row.key));
    if (row.answer) {
      if (state === 'resolved') {
        detail.append(el('div', { class: 'small muted' }, row.answer));
      } else {
        const showBtn = el('button', { class: 'toggle' }, 'show withheld answer');
        const hidden = el('div', { class: 'small muted', hidden: true }, row.answer);
        showBtn.addEventListener('click', () => {
          hidden.hidden = !hidden.hidden;
          showBtn.textContent = hidden.hidden ? 'show withheld answer' : 'hide';
        });
        detail.append(showBtn, hidden);
      }
    }
    item.append(detail);
    box.append(item);
  }
}

function renderDiagnosticsTab(view) {
  const box = $('#tab-diagnostics');
  box.textContent = '';
  const summary = view.summary || {};
  const tools = Object.entries(summary.tools || {}).sort((a, b) => b[1] - a[1]);
  if (tools.length) {
    const max = tools[0][1];
    box.append(field('tool calls', el('div', {}, tools.map(([k, v]) =>
      el('div', { class: 'bar-row' },
        el('div', { class: 'lbl' }, el('span', {}, k), el('b', {}, String(v))),
        el('div', { class: 'bar' },
          el('i', { style: `width:${Math.max(4, 100 * v / max)}%` })))))));
  }
  const questions = summary.questions || {};
  box.append(field('questions', el('div', { class: 'kv' },
    Object.entries(questions).flatMap(([k, v]) =>
      [el('dt', {}, k), el('dd', {}, String(v))]))));
  if (summary.entries_per_question !== undefined) {
    box.append(field('entries per question',
      el('div', {}, String(summary.entries_per_question))));
  }
  const tokens = summary.tokens;
  if (tokens) {
    const rows = [
      ['LLM calls', tokens.calls], ['turns', tokens.turns],
      ['prompt tokens', tokens.input_tokens],
      ['completion tokens', tokens.output_tokens],
      ['cached prompt tokens', tokens.cached_input_tokens],
      ['largest prompt', tokens.max_input_tokens],
      ['wasted calls', tokens.wasted_calls],
    ].filter(([, v]) => v !== undefined && v !== null);
    if (tokens.cost_usd) rows.push(['cost (USD)', Number(tokens.cost_usd).toFixed(4)]);
    box.append(field('token accounting (episode.json)', el('div', { class: 'kv' },
      rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, String(v))]))));
  }
  const loc = summary.loc;
  if (loc && Object.keys(loc).length) {
    const rows = [
      ['answers', loc.answers], ['refused', loc.refused], ['blocked', loc.blocked],
      ['no entry', loc.none], ['inventory size', loc.inventory_size],
    ].filter(([, v]) => v !== undefined && v !== null);
    const kv = el('div', { class: 'kv' },
      rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, String(v))]));
    box.append(field('LOC fallback channel', kv));
    if ((loc.items_used || []).length) {
      box.append(field('LOC items used', idChips(loc.items_used)));
    }
  }
  if (summary.submission_error) {
    box.append(field('submission error', block(summary.submission_error, { wrap: true })));
  }
  const checks = (view.grade || {}).checks;
  if (checks) {
    box.append(field('grader checks', el('div', { class: 'kv' },
      Object.entries(checks).flatMap(([k, v]) =>
        [el('dt', {}, k), el('dd', {}, String(v))]))));
  }
  const metrics = (view.grade || {}).metrics;
  if (metrics && Object.keys(metrics).length) {
    box.append(field('B2 performance metrics (copied from grades.json)',
      el('div', { class: 'kv' }, Object.entries(metrics).flatMap(([k, v]) =>
        [el('dt', {}, k), el('dd', {}, String(v))]))));
  }
}

function renderRawTab(view) {
  const box = $('#tab-raw');
  box.textContent = '';
  box.append(el('p', { class: 'small muted' },
    'The full view JSON this page was rendered from (written by viz/export.py; ',
    'sources: episode.json, transcript.jsonl, grades.json, task.json).'));
  box.append(block(JSON.stringify(view, null, 1)));
}

function renderTabs(view) {
  renderSubmissionTab(view);
  renderLedgerTab(view);
  renderDiagnosticsTab(view);
  renderRawTab(view);
}

/* ── boot ─────────────────────────────────────────────────────────── */

function show(view) {
  VIEW = view;
  renderTitle(view);
  renderBanners(view);
  renderMetrics(view);
  renderOpening(view);
  renderBudget(view);
  renderLedgerPanel(view);
  renderMeta(view);
  renderTimeline(view);
  renderTabs(view);
  applyFilters();
  $('#layout').hidden = false;
  $('#empty').hidden = true;
  const raw = $('#btn-raw');
  if (raw && !window.EMBEDDED_VIEW) {
    raw.hidden = false;
    raw.href = `data/${encodeURIComponent(view.id)}.json`;
    raw.download = `${view.id}.json`;
    raw.textContent = 'view JSON';
  }
  const hash = location.hash.match(/^#step-(\d+)$/);
  if (hash) focusStep(Number(hash[1]), { smooth: false });
}

function showEmpty(why) {
  $('#layout').hidden = true;
  $('#metrics').hidden = true;
  $('#empty').hidden = false;
  if (why) $('#empty-why').textContent = why;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

async function load() {
  // A demo built by viz/build_demo.py ships the view inline; no fetch, works file://.
  if (window.EMBEDDED_VIEW) {
    const back = $('#back-link');
    if (back) back.hidden = true;
    show(window.EMBEDDED_VIEW);
    return;
  }
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (!id) { showEmpty('No ?id= in the URL.'); return; }
  try {
    // tables.json is optional garnish (cross-links); the view is the page.
    const [view, tables] = await Promise.allSettled([
      fetchJson(`data/${encodeURIComponent(id)}.json`),
      fetchJson('tables.json'),
    ]);
    if (tables.status === 'fulfilled') TABLES = tables.value;
    if (view.status === 'rejected') throw view.reason;
    show(view.value);
  } catch (err) {
    showEmpty(String(err));
  }
}

function wire() {
  for (const id of ['f-ask', 'f-db', 'f-scratch', 'f-err']) {
    $(`#${id}`).addEventListener('change', applyFilters);
  }
  for (const head of document.querySelectorAll('.panel-head')) {
    head.addEventListener('click', () => {
      const panel = head.closest('.panel');
      panel.dataset.open = panel.dataset.open === 'true' ? 'false' : 'true';
    });
  }
  const themeBtn = $('#btn-theme');
  if (themeBtn) {
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
  }
}

wire();
load();
