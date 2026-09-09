/* ProcArena results page — the analysis charts under the main table.
 *
 * Four of the paper's figures are redrawn here as lieflat-charts cards
 * (porcelain preset, hand-written SVG):
 *
 *   EX retention      F12 Dumbbell Queue   aggregated from tables.json, exactly
 *                                          like the leaderboard (passed / played)
 *   action share      L16 Matrix Heat      cell labels printed in the paper's Figure 6
 *   failure types     L4  Arc Matrix       cell labels printed in the paper's Figure 8
 *   human audit       L14 Hundred Field    counts printed in the paper's Figure 9
 *
 * The transcribed numbers live in paper_figures.json (with provenance); nothing
 * is recomputed from the results tree.  The two figures whose data is not
 * printed (B2 speedups, per-step action counts) stay as the paper's own SVGs.
 * Exposed as window.PaperCharts = { render(tables), rerender() }.
 */

'use strict';

window.PaperCharts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (p, t, a) => {
    const n = document.createElementNS(NS, t);
    for (const k in a) n.setAttribute(k, a[k]);
    p.appendChild(n);
    return n;
  };
  const txt = (p, a, s) => { const n = el(p, 'text', a); n.textContent = s; return n; };
  const tip = (n, s) => { const t = document.createElementNS(NS, 'title'); t.textContent = s; n.appendChild(t); };
  const rnd = (i, k) => Math.abs(((i * 73856093) ^ (k * 19349663)) % 1000) / 1000;   // deterministic
  const D2R = Math.PI / 180;
  const pol = (cx, cy, r, deg) => [cx + r * Math.cos(deg * D2R), cy + r * Math.sin(deg * D2R)];

  /* ── porcelain preset (lieflat color-presets.js), one light and one dark face ── */
  const PAL = {
    light: {
      BG: '#ffffff', TXT: '#081F5C',
      LAB: 'rgba(8,31,92,.72)', MUT: 'rgba(8,31,92,.60)', FAINT: 'rgba(8,31,92,.40)',
      FLOOR: 'rgba(8,31,92,.24)', QUIET: 'rgba(8,31,92,.15)', TRACK: 'rgba(8,31,92,.12)',
      GRID: 'rgba(8,31,92,.16)',
      DATA: '#334EAC', DATA2: '#7096D1', HERO: '#081F5C', FAINTDATA: '#BAD6EB', BEAD: '#7096D1',
      RAMP: ['#D0E3FF', '#BAD6EB', '#7096D1', '#334EAC', '#081F5C'],
      onRamp: ['#081F5C', '#081F5C', '#081F5C', '#F7F2EB', '#F7F2EB'],
    },
    dark: {
      BG: '#171a21', TXT: '#EDEFF1',
      LAB: 'rgba(237,239,241,.72)', MUT: 'rgba(237,239,241,.60)', FAINT: 'rgba(237,239,241,.40)',
      FLOOR: 'rgba(237,239,241,.24)', QUIET: 'rgba(237,239,241,.15)', TRACK: 'rgba(237,239,241,.14)',
      GRID: 'rgba(237,239,241,.16)',
      DATA: '#7096D1', DATA2: '#9EB3CD', HERO: '#EDEFF1', FAINTDATA: 'rgba(237,239,241,.42)', BEAD: '#7096D1',
      RAMP: ['rgba(237,239,241,.10)', 'rgba(237,239,241,.22)', 'rgba(237,239,241,.42)',
        'rgba(237,239,241,.74)', '#7096D1'],
      onRamp: ['#EDEFF1', '#EDEFF1', '#171a21', '#171a21', '#F7F2EB'],
    },
  };
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    if (t) return t === 'dark';
    return matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const pal = () => (isDark() ? PAL.dark : PAL.light);

  /* unified reveal: draw when scrolled into view; click replays */
  const drawers = new Map();
  const obsReveal = (id, fn) => {
    const n = document.getElementById(id);
    if (!n) return;
    const go = () => { n.innerHTML = ''; fn(n, pal()); };
    drawers.set(id, go);
    const io = new IntersectionObserver((es) => {
      if (es[0].isIntersecting) { go(); io.disconnect(); }
    }, { threshold: .3 });
    io.observe(n);
    n.style.cursor = 'pointer';
    n.addEventListener('click', go);
  };

  let T = null, F = null;
  const label = (id) => (T.models.find((m) => m.id === id) || { label: id }).label;

  /* passed / played over the cells a stage selects — the leaderboard's own sum */
  function agg(modelId, stage) {
    let passed = 0, episodes = 0;
    for (const [key, cell] of Object.entries(T.cells)) {
      const [s, m] = key.split('|');
      if (m !== modelId || s !== stage) continue;
      passed += cell.passed; episodes += cell.episodes;
    }
    return { passed, episodes };
  }

  /* ════ F12 · dumbbell queue — Direct EX → Interactive EX, retention at the end ════ */
  function drawRetention(s, P) {
    const rows = T.models.map((m) => {
      const d = agg(m.id, 'single'), i = agg(m.id, 'multi');
      if (!d.episodes || !i.episodes) return null;
      const was = 100 * d.passed / d.episodes, now = 100 * i.passed / i.episodes;
      return { m, d, i, was, now, ret: 100 * (i.passed / i.episodes) / (d.passed / d.episodes) };
    }).filter(Boolean).sort((a, b) => b.was - a.was);

    const y0 = (i) => 46 + i * 34, X0 = 124, X1 = 356, LO = 20, HI = 70;
    const mapX = (v) => X0 + (v - LO) / (HI - LO) * (X1 - X0);

    // furniture: a faint tick every 10 EX points
    for (let v = LO; v <= HI; v += 10) {
      const x = mapX(v);
      el(s, 'line', { x1: x, y1: 30, x2: x, y2: y0(rows.length - 1) + 14, stroke: P.QUIET,
        'stroke-width': .6, 'stroke-dasharray': '1 4', class: 'fade' });
      txt(s, { x, y: 24, 'font-size': 6.5, 'font-weight': 600, fill: P.FAINT, 'text-anchor': 'middle',
        class: 'fade' }, v + '%');
    }
    txt(s, { x: 404, y: 24, 'font-size': 6.5, 'font-weight': 700, fill: P.FAINT, 'text-anchor': 'end',
      'letter-spacing': '.08em', class: 'fade' }, 'RETAINED');

    rows.forEach((r, i) => {
      const y = y0(i), xa = mapX(r.was), xb = mapX(r.now);
      txt(s, { x: 112, y: y + 3, 'font-size': 7.5, 'font-weight': 700, fill: P.LAB, 'text-anchor': 'end',
        'letter-spacing': '.04em', class: 'fade', style: `animation-delay:${i * .08}s` }, r.m.label);
      el(s, 'line', { x1: X0 - 6, y1: y, x2: X1 + 6, y2: y, stroke: P.TRACK, 'stroke-width': .7,
        class: 'fade', style: `animation-delay:${i * .08}s` });
      // beads: one per EX point given up under interaction (rounded), strung between the dots
      const n = Math.round(r.was - r.now);
      for (let k = 0; k < n; k++) {
        const t = (k + .5) / n, x = xb + t * (xa - xb), yy = y + (rnd(k + 1, i + 3) - .5) * 2.6;
        el(s, 'circle', { cx: x, cy: yy, r: 1.9 + rnd(k + 2, i + 4) * .9, fill: P.BEAD, opacity: .95,
          class: 'pop', style: `animation-delay:${.3 + i * .08 + k * .03}s` });
      }
      const before = el(s, 'circle', { cx: xa, cy: y, r: 4.8, fill: P.BG, stroke: P.DATA, 'stroke-width': 1.7,
        class: 'pop', style: `animation-delay:${.2 + i * .08}s` });
      tip(before, `${r.m.label} — Direct EX ${r.was.toFixed(1)}% (${r.d.passed} / ${r.d.episodes})`);
      const after = el(s, 'circle', { cx: xb, cy: y, r: 5.2, fill: P.HERO,
        class: 'pop', style: `animation-delay:${.6 + i * .08}s` });
      tip(after, `${r.m.label} — Interactive EX ${r.now.toFixed(1)}% (${r.i.passed} / ${r.i.episodes})`);
      txt(s, { x: xa + 9, y: y - 8, 'font-size': 8, 'font-weight': 700, fill: P.FAINTDATA,
        class: 'fade', style: `animation-delay:${.3 + i * .08}s` }, r.was.toFixed(1));
      txt(s, { x: xb - 9, y: y - 8, 'font-size': 9.5, 'font-weight': 800, fill: P.TXT, 'text-anchor': 'end',
        class: 'fade', style: `animation-delay:${.7 + i * .08}s` }, r.now.toFixed(1));
      const ret = txt(s, { x: 404, y: y + 3.5, 'font-size': 9.5, 'font-weight': 800, fill: P.TXT,
        'text-anchor': 'end', class: 'fade', style: `animation-delay:${.9 + i * .08}s` },
        r.ret.toFixed(1) + '%');
      tip(ret, `${r.m.label} — retention ${r.ret.toFixed(1)}% = Interactive EX ÷ Direct EX`);
    });
    txt(s, { x: X0, y: 296, 'font-size': 7, 'font-weight': 600, fill: P.FAINT, class: 'fade' }, '← EX LOST');
    txt(s, { x: X1, y: 296, 'font-size': 7, 'font-weight': 600, fill: P.FAINT, 'text-anchor': 'end',
      class: 'fade' }, 'EX %');
    txt(s, { x: 215, y: 312, 'font-size': 7, 'font-weight': 600, fill: P.FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.12em', class: 'fade', style: 'animation-delay:1s' },
      'ONE BEAD ≈ ONE EX POINT GIVEN UP · HOLLOW = DIRECT · SOLID = INTERACTIVE');
  }

  /* ════ L16 · matrix heat — share of actions, model × tool ════ */
  function drawActions(s, P) {
    const A = F.action_share, rows = F.models, cols = A.tools;
    const X0 = 104, Y0 = 62, STEP = 30, C = 26;
    const bucket = (t) => (t >= 35 ? 4 : t >= 20 ? 3 : t >= 10 ? 2 : t >= 5 ? 1 : 0);
    let max = 0, mi = 0, mj = 0;
    rows.forEach((m, i) => A.rows[m].forEach((t, j) => { if (t > max) { max = t; mi = i; mj = j; } }));

    rows.forEach((m, i) => {
      txt(s, { x: X0 - 10, y: Y0 + i * STEP + C / 2 + 3, 'font-size': 7, 'font-weight': 700, fill: P.LAB,
        'text-anchor': 'end', 'letter-spacing': '.04em', class: 'fade', style: `animation-delay:${i * .04}s` },
        label(m));
    });
    cols.forEach((c, j) => {
      const x = X0 + j * STEP + C / 2, y = Y0 - 9;
      txt(s, { x, y, 'font-size': 6.5, 'font-weight': 700, fill: P.MUT, 'letter-spacing': '.04em',
        transform: `rotate(-55 ${x} ${y})`, class: 'fade', style: `animation-delay:${j * .04}s` }, c);
    });
    rows.forEach((m, i) => A.rows[m].forEach((t, j) => {
      const x = X0 + j * STEP, y = Y0 + i * STEP, d = (i + j) * .02;
      if (!t) {   // silence stays visible: a grain where the model never used the tool
        const z = el(s, 'circle', { cx: x + C / 2, cy: y + C / 2, r: .9, fill: P.FLOOR, class: 'pop',
          style: `animation-delay:${d}s` });
        tip(z, `${label(m)} · ${cols[j]} — 0.00%`);
        return;
      }
      const b = bucket(t);
      const cell = el(s, 'rect', { x, y, width: C, height: C, rx: 4, fill: P.RAMP[b], class: 'pop',
        style: `animation-delay:${d}s` });
      tip(cell, `${label(m)} · ${cols[j]} — ${t.toFixed(2)}% of its actions`);
      txt(s, { x: x + C / 2, y: y + C / 2 + 2.5, 'font-size': 6.5, 'font-weight': 700, fill: P.onRamp[b],
        'text-anchor': 'middle', class: 'fade', style: `animation-delay:${.4 + d}s;pointer-events:none` },
        t.toFixed(1));
      if (i === mi && j === mj) {
        el(s, 'rect', { x: x - 3.5, y: y - 3.5, width: C + 7, height: C + 7, rx: 6, fill: 'none',
          stroke: P.TXT, 'stroke-width': 1, 'stroke-dasharray': '2 3', class: 'fade',
          style: 'animation-delay:.9s' });
      }
    }));
    // shade legend, countable buckets
    const LG = [[0, '<5'], [1, '5–10'], [2, '10–20'], [3, '20–35'], [4, '35+']];
    LG.forEach(([b, lab], k) => {
      const x = X0 + k * 52;
      el(s, 'rect', { x, y: 292, width: 9, height: 9, rx: 2, fill: P.RAMP[b], class: 'fade',
        style: `animation-delay:${1 + k * .05}s` });
      txt(s, { x: x + 13, y: 300, 'font-size': 6.5, 'font-weight': 600, fill: P.MUT, class: 'fade',
        style: `animation-delay:${1 + k * .05}s` }, lab + '%');
    });
    txt(s, { x: 30, y: 300, 'font-size': 7, 'font-weight': 600, fill: P.FAINT, 'letter-spacing': '.1em',
      class: 'fade', style: 'animation-delay:1s' }, 'SHADE = %');
  }

  /* ════ L4 · arc matrix — failures by type, model × type, bubble area = % ════ */
  function drawFailures(s, P) {
    const E = F.failure_types, rows = F.models, cols = E.types;
    const rowY = (i) => 62 + i * 33, colX = (j) => 156 + j * 60, dy = (j) => -12 * Math.sin(Math.PI * j / (cols.length - 1));
    const R = (v) => Math.sqrt(v) * 2.3;
    const shade = (v) => P.RAMP[Math.min(4, Math.floor(v / 7))];
    rows.forEach((m, i) => {
      const d = 'M' + cols.map((_, j) => `${colX(j)} ${rowY(i) + dy(j)}`).join(' L ');
      el(s, 'path', { d, fill: 'none', stroke: P.QUIET, 'stroke-width': 1, pathLength: 1, class: 'draw',
        style: `animation-delay:${i * .08}s` });
      txt(s, { x: 118, y: rowY(i) + 3, 'font-size': 7.5, 'font-weight': 600, fill: P.LAB, 'text-anchor': 'end',
        class: 'fade', style: `animation-delay:${i * .08}s` }, label(m));
      E.rows[m].forEach((v, j) => {
        const x = colX(j), y = rowY(i) + dy(j);
        if (!v) {
          el(s, 'circle', { cx: x, cy: y, r: .9, fill: P.FLOOR, class: 'pop',
            style: `animation-delay:${.2 + i * .08 + j * .02}s` });
          return;
        }
        const dot = el(s, 'circle', { cx: x, cy: y, r: R(v), fill: shade(v), class: 'pop',
          style: `animation-delay:${.2 + i * .08 + j * .02}s` });
        tip(dot, `${label(m)} · ${cols[j]} — ${v.toFixed(1)}% of tasks run`);
        txt(s, { x: x + R(v) + 2.5, y: y + 2.5, 'font-size': 6.5, 'font-weight': 800, fill: P.TXT,
          class: 'fade', style: `animation-delay:${.6 + i * .06}s` }, v.toFixed(1));
      });
    });
    cols.forEach((c, j) => {
      const x = colX(j), y = 62 + dy(j) - (j % 2 ? 36 : 24);   // staggered so neighbours never touch
      txt(s, { x, y, 'font-size': 7, 'font-weight': 700, fill: P.MUT, 'letter-spacing': '.06em',
        'text-anchor': 'middle', class: 'fade', style: `animation-delay:${j * .05}s` }, c.toUpperCase());
      el(s, 'line', { x1: x, y1: y + 3, x2: x, y2: 62 + dy(j) - 14, stroke: P.QUIET, 'stroke-width': .6,
        class: 'fade' });
    });
    txt(s, { x: 215, y: 310, 'font-size': 7, 'font-weight': 600, fill: P.FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.12em', class: 'fade', style: 'animation-delay:1s' },
      'BUBBLE AREA = FAILURES AS % OF THE TASKS THE MODEL RAN');
  }

  /* ════ L14 · hundred field — 180 audited replies, one dot each ════ */
  function drawAudit(s, P) {
    const H = F.human_audit;
    const panel = (ox, title, data, pos, failPos) => {
      txt(s, { x: ox + 20, y: 24, 'font-size': 7.5, 'font-weight': 700, fill: P.MUT, 'letter-spacing': '.1em',
        class: 'fade' }, title);
      const cluster = (cx, cy, n, fill, name, seed, big) => {
        let edge = 0;
        for (let k = 0; k < n; k++) {
          const a = k * 137.508 + seed * 55;
          const rr = big ? 4 + Math.sqrt(k) * 5.9 + rnd(k + 1, seed + 2) * 3
                         : 3 + Math.sqrt(k) * 4.4 + rnd(k + 1, seed + 2) * 2;
          edge = Math.max(edge, rr);
          const [x, y] = pol(cx, cy, rr, a);
          if (big && k % 5 === 0) el(s, 'line', { x1: cx, y1: cy, x2: x, y2: y, stroke: P.QUIET, 'stroke-width': .6,
            class: 'fade', style: `animation-delay:${seed * .05 + k * .008}s` });
          const dot = el(s, 'circle', { cx: x, cy: y, r: 1.6 + rnd(k + 2, seed + 3) * 1.6, fill, opacity: .92,
            class: 'pop', style: `animation-delay:${seed * .05 + k * .008}s` });
          tip(dot, `${name} — one of ${n} replies`);
        }
        if (big) el(s, 'circle', { cx, cy, r: 2.2, fill: P.TXT, class: 'pop', style: `animation-delay:${seed * .05}s` });
        return edge;
      };
      // the pass cluster
      const edge = cluster(pos[0], pos[1], data.pass, P.DATA2, 'Acceptable', 1, true);
      txt(s, { x: pos[0], y: pos[1] + edge + 13, 'font-size': 8, 'font-weight': 800, fill: P.TXT,
        'text-anchor': 'middle', 'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:.6s' },
        `PASS · ${data.pass} (${data.pass_pct}%)`);
      // the failure clusters, one per reason, position = reason
      H.reasons.forEach((name, r) => {
        const [cx, cy] = failPos[r], n = data.fail[r];
        el(s, 'line', { x1: pos[0], y1: pos[1], x2: cx, y2: cy, stroke: P.GRID, 'stroke-width': .7,
          'stroke-dasharray': '2 5', class: 'fade', style: `animation-delay:${.9 + r * .06}s` });
        const e = n ? cluster(cx, cy, n, P.HERO, name, 3 + r, false) : 0;
        if (!n) el(s, 'rect', { x: cx - 3, y: cy - .6, width: 6, height: 1.2, fill: P.FLOOR, class: 'fade' });
        const ly = cy + Math.max(e, 6) + 11;
        txt(s, { x: cx, y: ly, 'font-size': 6.5, 'font-weight': 700, fill: P.LAB,
          'text-anchor': 'middle', 'letter-spacing': '.06em', class: 'fade',
          style: `animation-delay:${.7 + r * .06}s` }, name.toUpperCase());
        txt(s, { x: cx, y: ly + 9, 'font-size': 8, 'font-weight': 800, fill: P.TXT,
          'text-anchor': 'middle', class: 'fade', style: `animation-delay:${.8 + r * .06}s` }, n);
      });
    };
    const grid = (x0) => [[x0, 56], [x0 + 104, 56], [x0, 148], [x0 + 104, 148], [x0, 240], [x0 + 104, 240]];
    panel(0, `ALL ${H.all.n} AUDITED REPLIES`, H.all, [140, 160], grid(300));
    el(s, 'line', { x1: 450, y1: 16, x2: 450, y2: 300, stroke: P.GRID, 'stroke-width': .7, class: 'fade' });
    panel(450, `THE ${H.loc.n} FROM THE LOC POOL`, H.loc, [590, 160], grid(750));
    txt(s, { x: 450, y: 314, 'font-size': 7, 'font-weight': 600, fill: P.FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.12em', class: 'fade', style: 'animation-delay:1.3s' },
      `ONE DOT = ONE REPLY · ${H.all.pass} + ${H.all.fail.reduce((a, b) => a + b, 0)} = ${H.all.n}` +
      ` · ${H.loc.pass} + ${H.loc.fail.reduce((a, b) => a + b, 0)} = ${H.loc.n}`);
  }

  const CHARTS = [
    ['pc-retention', drawRetention],
    ['pc-actions', drawActions],
    ['pc-failures', drawFailures],
    ['pc-audit', drawAudit],
  ];

  async function render(tables) {
    T = tables;
    try {
      const res = await fetch('paper_figures.json');
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      F = await res.json();
    } catch (err) {
      for (const [id] of CHARTS) {
        const n = document.getElementById(id);
        if (n) n.outerHTML = `<p class="muted small">paper_figures.json not found (${err}).</p>`;
      }
      return;
    }
    for (const [id, fn] of CHARTS) obsReveal(id, fn);
  }

  /* theme toggled: redraw whatever has already been revealed */
  function rerender() { for (const go of drawers.values()) go(); }

  return { render, rerender };
})();
