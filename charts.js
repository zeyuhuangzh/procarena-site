/* ProcArena results page — the analysis charts under the main table.
 *
 * Four of the paper's figures are redrawn here as lieflat-charts cards
 * (porcelain blue for the ordered data, the site's own category colors for
 * the audit's failure reasons; hand-written SVG):
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
 *
 * Geometry: half-width cards draw in a 700-unit-wide viewBox, the wide card in
 * 1420, so at the page's ~1500px content width the SVG renders about 1:1 and
 * the type inside matches the page (labels 13–14px, values 15–16px).
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

  /* ── palette: porcelain blues for the ordered data, one light and one dark face;
     CAT = the site's own category colors (style.css tool/persona tokens) for the
     audit's six failure reasons ── */
  const PAL = {
    light: {
      BG: '#ffffff', TXT: '#1c2128', INK: '#081F5C',
      LAB: '#1c2128', MUT: '#5c6672',
      FLOOR: 'rgba(8,31,92,.28)', QUIET: 'rgba(8,31,92,.18)', TRACK: 'rgba(8,31,92,.14)',
      GRID: 'rgba(8,31,92,.16)',
      DATA: '#334EAC', DATA2: '#7096D1', HERO: '#081F5C', BEAD: '#5b7fc7',
      RAMP: ['#D0E3FF', '#BAD6EB', '#7096D1', '#334EAC', '#081F5C'],
      onRamp: ['#081F5C', '#081F5C', '#ffffff', '#ffffff', '#ffffff'],
      CAT: ['#c0392b', '#b3730b', '#7a3fb5', '#0d7c8a', '#1a7f4b', '#6b7280'],
    },
    dark: {
      BG: '#171a21', TXT: '#e3e6eb', INK: '#EDEFF1',
      LAB: '#e3e6eb', MUT: '#98a0ad',
      FLOOR: 'rgba(237,239,241,.28)', QUIET: 'rgba(237,239,241,.18)', TRACK: 'rgba(237,239,241,.16)',
      GRID: 'rgba(237,239,241,.16)',
      DATA: '#7096D1', DATA2: '#9EB3CD', HERO: '#EDEFF1', BEAD: '#7096D1',
      RAMP: ['rgba(237,239,241,.10)', 'rgba(237,239,241,.22)', 'rgba(237,239,241,.42)',
        'rgba(237,239,241,.74)', '#7096D1'],
      onRamp: ['#EDEFF1', '#EDEFF1', '#171a21', '#171a21', '#F7F2EB'],
      CAT: ['#ff7b72', '#e3b341', '#b283f7', '#4ec5d4', '#4cc38a', '#98a0ad'],
    },
  };
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    if (t) return t === 'dark';
    return matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const pal = () => (isDark() ? PAL.dark : PAL.light);

  /* type scale inside the SVGs (viewBox units ≈ px at the page's content width) */
  const FS = { label: 14, value: 16, small: 12.5, note: 12.5, head: 13 };

  /* unified reveal: draw when scrolled into view; click replays */
  const drawers = new Map();
  const obsReveal = (id, fn) => {
    const n = document.getElementById(id);
    if (!n) return;
    const go = () => { n.innerHTML = ''; fn(n, pal()); };
    drawers.set(id, go);
    const io = new IntersectionObserver((es) => {
      if (es[0].isIntersecting) { go(); io.disconnect(); }
    }, { threshold: .2 });
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

    const y0 = (i) => 74 + i * 48, X0 = 200, X1 = 560, LO = 20, HI = 70;
    const mapX = (v) => X0 + (v - LO) / (HI - LO) * (X1 - X0);
    const yEnd = y0(rows.length - 1) + 22;

    // furniture: a faint tick every 10 EX points
    for (let v = LO; v <= HI; v += 10) {
      const x = mapX(v);
      el(s, 'line', { x1: x, y1: 40, x2: x, y2: yEnd, stroke: P.QUIET, 'stroke-width': 1,
        'stroke-dasharray': '2 5', class: 'fade' });
      txt(s, { x, y: 30, 'font-size': FS.small, 'font-weight': 600, fill: P.MUT, 'text-anchor': 'middle',
        class: 'fade' }, v + '%');
    }
    txt(s, { x: 690, y: 30, 'font-size': FS.head, 'font-weight': 700, fill: P.MUT, 'text-anchor': 'end',
      'letter-spacing': '.08em', class: 'fade' }, 'RETAINED');

    rows.forEach((r, i) => {
      const y = y0(i), xa = mapX(r.was), xb = mapX(r.now);
      txt(s, { x: 180, y: y + 5, 'font-size': FS.label, 'font-weight': 700, fill: P.LAB, 'text-anchor': 'end',
        class: 'fade', style: `animation-delay:${i * .08}s` }, r.m.label);
      el(s, 'line', { x1: X0 - 8, y1: y, x2: X1 + 8, y2: y, stroke: P.TRACK, 'stroke-width': 1,
        class: 'fade', style: `animation-delay:${i * .08}s` });
      // beads: one per EX point given up under interaction (rounded), strung between the dots
      const n = Math.round(r.was - r.now);
      for (let k = 0; k < n; k++) {
        const t = (k + .5) / n, x = xb + t * (xa - xb), yy = y + (rnd(k + 1, i + 3) - .5) * 4;
        el(s, 'circle', { cx: x, cy: yy, r: 2.6 + rnd(k + 2, i + 4) * 1.2, fill: P.BEAD, opacity: .95,
          class: 'pop', style: `animation-delay:${.3 + i * .08 + k * .03}s` });
      }
      const before = el(s, 'circle', { cx: xa, cy: y, r: 7.5, fill: P.BG, stroke: P.DATA, 'stroke-width': 2.4,
        class: 'pop', style: `animation-delay:${.2 + i * .08}s` });
      tip(before, `${r.m.label} — Direct EX ${r.was.toFixed(1)}% (${r.d.passed} / ${r.d.episodes})`);
      const after = el(s, 'circle', { cx: xb, cy: y, r: 8, fill: P.HERO,
        class: 'pop', style: `animation-delay:${.6 + i * .08}s` });
      tip(after, `${r.m.label} — Interactive EX ${r.now.toFixed(1)}% (${r.i.passed} / ${r.i.episodes})`);
      txt(s, { x: xa + 13, y: y - 12, 'font-size': FS.label, 'font-weight': 700, fill: P.DATA2,
        class: 'fade', style: `animation-delay:${.3 + i * .08}s` }, r.was.toFixed(1));
      txt(s, { x: xb - 13, y: y - 12, 'font-size': FS.value, 'font-weight': 800, fill: P.TXT, 'text-anchor': 'end',
        class: 'fade', style: `animation-delay:${.7 + i * .08}s` }, r.now.toFixed(1));
      const ret = txt(s, { x: 690, y: y + 6, 'font-size': FS.value, 'font-weight': 800, fill: P.TXT,
        'text-anchor': 'end', class: 'fade', style: `animation-delay:${.9 + i * .08}s` },
        r.ret.toFixed(1) + '%');
      tip(ret, `${r.m.label} — retention ${r.ret.toFixed(1)}% = Interactive EX ÷ Direct EX`);
    });
    txt(s, { x: X0, y: yEnd + 24, 'font-size': FS.small, 'font-weight': 600, fill: P.MUT, class: 'fade' },
      '← EX LOST');
    txt(s, { x: X1, y: yEnd + 24, 'font-size': FS.small, 'font-weight': 600, fill: P.MUT, 'text-anchor': 'end',
      class: 'fade' }, 'EX %');
    txt(s, { x: 350, y: yEnd + 50, 'font-size': FS.note, 'font-weight': 600, fill: P.MUT, 'text-anchor': 'middle',
      'letter-spacing': '.08em', class: 'fade', style: 'animation-delay:1s' },
      'ONE BEAD ≈ ONE EX POINT GIVEN UP · HOLLOW = DIRECT · SOLID = INTERACTIVE');
  }

  /* ════ L16 · matrix heat — share of actions, model × tool ════ */
  function drawActions(s, P) {
    const A = F.action_share, rows = F.models, cols = A.tools;
    const X0 = 158, Y0 = 118, STEP = 50, C = 44;
    const bucket = (t) => (t >= 35 ? 4 : t >= 20 ? 3 : t >= 10 ? 2 : t >= 5 ? 1 : 0);
    let max = 0, mi = 0, mj = 0;
    rows.forEach((m, i) => A.rows[m].forEach((t, j) => { if (t > max) { max = t; mi = i; mj = j; } }));

    rows.forEach((m, i) => {
      txt(s, { x: X0 - 14, y: Y0 + i * STEP + C / 2 + 5, 'font-size': FS.label, 'font-weight': 700, fill: P.LAB,
        'text-anchor': 'end', class: 'fade', style: `animation-delay:${i * .04}s` }, label(m));
    });
    cols.forEach((c, j) => {
      const x = X0 + j * STEP + C / 2 + 4, y = Y0 - 12;
      txt(s, { x, y, 'font-size': FS.head, 'font-weight': 700, fill: P.LAB,
        transform: `rotate(-45 ${x} ${y})`, class: 'fade', style: `animation-delay:${j * .04}s` }, c);
    });
    rows.forEach((m, i) => A.rows[m].forEach((t, j) => {
      const x = X0 + j * STEP, y = Y0 + i * STEP, d = (i + j) * .02;
      if (!t) {   // silence stays visible: a grain where the model never used the tool
        const z = el(s, 'circle', { cx: x + C / 2, cy: y + C / 2, r: 1.6, fill: P.FLOOR, class: 'pop',
          style: `animation-delay:${d}s` });
        tip(z, `${label(m)} · ${cols[j]} — 0.00%`);
        return;
      }
      const b = bucket(t);
      const cell = el(s, 'rect', { x, y, width: C, height: C, rx: 7, fill: P.RAMP[b], class: 'pop',
        style: `animation-delay:${d}s` });
      tip(cell, `${label(m)} · ${cols[j]} — ${t.toFixed(2)}% of its actions`);
      txt(s, { x: x + C / 2, y: y + C / 2 + 5, 'font-size': FS.head, 'font-weight': 700, fill: P.onRamp[b],
        'text-anchor': 'middle', class: 'fade', style: `animation-delay:${.4 + d}s;pointer-events:none` },
        t.toFixed(1));
      if (i === mi && j === mj) {
        el(s, 'rect', { x: x - 5, y: y - 5, width: C + 10, height: C + 10, rx: 10, fill: 'none',
          stroke: P.TXT, 'stroke-width': 1.5, 'stroke-dasharray': '3 4', class: 'fade',
          style: 'animation-delay:.9s' });
      }
    }));
    // shade legend, countable buckets
    const ly = Y0 + rows.length * STEP + 30;
    txt(s, { x: X0 - 14, y: ly + 12, 'font-size': FS.small, 'font-weight': 700, fill: P.MUT, 'text-anchor': 'end',
      'letter-spacing': '.08em', class: 'fade', style: 'animation-delay:1s' }, 'SHADE = %');
    const LG = [[0, '<5'], [1, '5–10'], [2, '10–20'], [3, '20–35'], [4, '35+']];
    LG.forEach(([b, lab], k) => {
      const x = X0 + k * 96;
      el(s, 'rect', { x, y: ly, width: 16, height: 16, rx: 4, fill: P.RAMP[b], class: 'fade',
        style: `animation-delay:${1 + k * .05}s` });
      txt(s, { x: x + 22, y: ly + 13, 'font-size': FS.small, 'font-weight': 600, fill: P.LAB, class: 'fade',
        style: `animation-delay:${1 + k * .05}s` }, lab + '%');
    });
  }

  /* ════ L4 · arc matrix — failures by type, model × type, bubble area = % ════ */
  function drawFailures(s, P) {
    const E = F.failure_types, rows = F.models, cols = E.types;
    const rowY = (i) => 104 + i * 48, colX = (j) => 240 + j * 94;
    const dy = (j) => -18 * Math.sin(Math.PI * j / (cols.length - 1));
    const R = (v) => Math.sqrt(v) * 3.6;
    const shade = (v) => P.RAMP[Math.min(4, Math.floor(v / 7))];
    rows.forEach((m, i) => {
      const d = 'M' + cols.map((_, j) => `${colX(j)} ${rowY(i) + dy(j)}`).join(' L ');
      el(s, 'path', { d, fill: 'none', stroke: P.QUIET, 'stroke-width': 1.4, pathLength: 1, class: 'draw',
        style: `animation-delay:${i * .08}s` });
      txt(s, { x: 206, y: rowY(i) + 5, 'font-size': FS.label, 'font-weight': 700, fill: P.LAB, 'text-anchor': 'end',
        class: 'fade', style: `animation-delay:${i * .08}s` }, label(m));
      E.rows[m].forEach((v, j) => {
        const x = colX(j), y = rowY(i) + dy(j);
        if (!v) {
          el(s, 'circle', { cx: x, cy: y, r: 1.6, fill: P.FLOOR, class: 'pop',
            style: `animation-delay:${.2 + i * .08 + j * .02}s` });
          return;
        }
        const dot = el(s, 'circle', { cx: x, cy: y, r: R(v), fill: shade(v), class: 'pop',
          style: `animation-delay:${.2 + i * .08 + j * .02}s` });
        tip(dot, `${label(m)} · ${cols[j]} — ${v.toFixed(1)}% of tasks run`);
        txt(s, { x: x + R(v) + 5, y: y + 5, 'font-size': FS.head, 'font-weight': 800, fill: P.TXT,
          class: 'fade', style: `animation-delay:${.6 + i * .06}s` }, v.toFixed(1));
      });
    });
    cols.forEach((c, j) => {
      const x = colX(j), y = 104 + dy(j) - (j % 2 ? 60 : 40);   // staggered so neighbours never touch
      txt(s, { x, y, 'font-size': FS.head, 'font-weight': 700, fill: P.LAB, 'letter-spacing': '.06em',
        'text-anchor': 'middle', class: 'fade', style: `animation-delay:${j * .05}s` }, c.toUpperCase());
      el(s, 'line', { x1: x, y1: y + 6, x2: x, y2: 104 + dy(j) - 22, stroke: P.QUIET, 'stroke-width': 1,
        class: 'fade' });
    });
    txt(s, { x: 350, y: 448, 'font-size': FS.note, 'font-weight': 600, fill: P.MUT, 'text-anchor': 'middle',
      'letter-spacing': '.08em', class: 'fade', style: 'animation-delay:1s' },
      'BUBBLE AREA = FAILURES AS % OF THE TASKS THE MODEL RAN');
  }

  /* ════ L14 · hundred field — 180 audited replies, one dot each; reason = color ════ */
  function drawAudit(s, P) {
    const H = F.human_audit;
    // legend across the top: pass + the six failure reasons in the site's category colors
    let lx = 40;
    const key = (fill, name) => {
      el(s, 'circle', { cx: lx + 6, cy: 28, r: 6, fill, class: 'fade' });
      const t = txt(s, { x: lx + 18, y: 33, 'font-size': FS.head, 'font-weight': 600, fill: P.LAB, class: 'fade' }, name);
      lx += 18 + name.length * 7.6 + 30;
      return t;
    };
    key(P.DATA2, 'Acceptable');
    H.reasons.forEach((name, r) => key(P.CAT[r], name));

    const panel = (title, data, pos, failPos) => {
      txt(s, { x: pos[0], y: 78, 'font-size': FS.head, 'font-weight': 700, fill: P.MUT, 'letter-spacing': '.1em',
        'text-anchor': 'middle', class: 'fade' }, title);
      const cluster = (cx, cy, n, fill, name, seed, big) => {
        let edge = 0;
        for (let k = 0; k < n; k++) {
          const a = k * 137.508 + seed * 55;
          const rr = big ? 7 + Math.sqrt(k) * 8.6 + rnd(k + 1, seed + 2) * 4
                         : 5 + Math.sqrt(k) * 6.6 + rnd(k + 1, seed + 2) * 3;
          edge = Math.max(edge, rr);
          const [x, y] = pol(cx, cy, rr, a);
          if (big && k % 5 === 0) el(s, 'line', { x1: cx, y1: cy, x2: x, y2: y, stroke: P.QUIET, 'stroke-width': .9,
            class: 'fade', style: `animation-delay:${seed * .05 + k * .008}s` });
          const dot = el(s, 'circle', { cx: x, cy: y, r: 2.6 + rnd(k + 2, seed + 3) * 2.2, fill, opacity: .95,
            class: 'pop', style: `animation-delay:${seed * .05 + k * .008}s` });
          tip(dot, `${name} — one of ${n} replies`);
        }
        if (big) el(s, 'circle', { cx, cy, r: 3.4, fill: P.TXT, class: 'pop', style: `animation-delay:${seed * .05}s` });
        return edge;
      };
      const edge = cluster(pos[0], pos[1], data.pass, P.DATA2, 'Acceptable', 1, true);
      txt(s, { x: pos[0], y: pos[1] + edge + 24, 'font-size': FS.value, 'font-weight': 800, fill: P.TXT,
        'text-anchor': 'middle', class: 'fade', style: 'animation-delay:.6s' },
        `Pass · ${data.pass} (${data.pass_pct}%)`);
      H.reasons.forEach((name, r) => {
        const [cx, cy] = failPos[r], n = data.fail[r];
        el(s, 'line', { x1: pos[0], y1: pos[1], x2: cx, y2: cy, stroke: P.GRID, 'stroke-width': 1,
          'stroke-dasharray': '3 7', class: 'fade', style: `animation-delay:${.9 + r * .06}s` });
        const e = n ? cluster(cx, cy, n, P.CAT[r], name, 3 + r, false) : 0;
        if (!n) el(s, 'rect', { x: cx - 5, y: cy - 1, width: 10, height: 2, fill: P.FLOOR, class: 'fade' });
        const ly = cy + Math.max(e, 10) + 18;
        txt(s, { x: cx, y: ly, 'font-size': FS.small, 'font-weight': 700, fill: P.CAT[r],
          'text-anchor': 'middle', class: 'fade', style: `animation-delay:${.7 + r * .06}s` }, name);
        txt(s, { x: cx, y: ly + 17, 'font-size': FS.value, 'font-weight': 800, fill: P.TXT,
          'text-anchor': 'middle', class: 'fade', style: `animation-delay:${.8 + r * .06}s` }, n);
      });
    };
    const grid = (x0) => [[x0, 130], [x0 + 150, 130], [x0, 262], [x0 + 150, 262], [x0, 394], [x0 + 150, 394]];
    panel(`ALL ${H.all.n} AUDITED REPLIES`, H.all, [220, 268], grid(470));
    el(s, 'line', { x1: 710, y1: 60, x2: 710, y2: 470, stroke: P.GRID, 'stroke-width': 1, class: 'fade' });
    panel(`THE ${H.loc.n} FROM THE LOC POOL`, H.loc, [920, 268], grid(1170));
    txt(s, { x: 710, y: 500, 'font-size': FS.note, 'font-weight': 600, fill: P.MUT, 'text-anchor': 'middle',
      'letter-spacing': '.08em', class: 'fade', style: 'animation-delay:1.3s' },
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
