/* Needt H3 "Everything in one place" — calendars, mail, docs and habits stream in from the edges and sync
   into one surface; a person adds one task and it shows in Today, on the calendar and in the list.
   Truth: calendars sync Google / Outlook / CalDAV into local data (src/lib/*-calendar*); mail is read-only
   (src/lib/mail/scopes.ts) so it only flows in; Docs (Page) and Habits exist. No third-party names. */
(function () {
  const { SQ, W, H, ctx, clamp, ramp, lerp, eo3, eo5, eio, back, mix, bez, rr, glow, markBadge, text, pill, finger, endCard, frameStart, frameEnd, boot, FONT, C } = window.NM;
  const DUR = 14.0;
  const F = SQ ? 1 : 1.3;

  const T = {
    srcIn: [0.4, 0.6, 0.8, 1.0],   // Calendars, Mail, Docs, Habits labels
    stream: [0.5, 4.0],            // chips travel to the centre
    markIn: 2.6, pulses: [3.4, 3.9],
    panel: [4.1, 4.9],             // one surface grows from the mark
    split: [5.3, 5.9],             // it settles as Today; Calendar and Tasks open beside it
    calIn: 5.55, listIn: 5.75,
    composer: 6.5, type: [6.85, 7.65], tap: 7.95, // "+ New task", typed title, tap Add
    land: [8.2, 8.35, 8.5],        // the task appears in Today, Calendar, Tasks
    out: [10.2, 10.7],
    end: { mark: 10.8, l1: 11.0, l2: 11.45, url: 12.2 },
  };

  // ---- sources and their chips ---------------------------------------------
  const SRC = SQ
    ? [{ key: 'Calendars', at: [110, 110] }, { key: 'Mail', at: [970, 110] }, { key: 'Docs', at: [110, 970] }, { key: 'Habits', at: [970, 970] }]
    : [{ key: 'Calendars', at: [170, 200] }, { key: 'Mail', at: [910, 200] }, { key: 'Docs', at: [170, 1720] }, { key: 'Habits', at: [910, 1720] }];
  const CENTER = SQ ? [540, 540] : [540, 960];
  const CHIPS = [
    [0, 'cal', 'Standup  9:30'], [0, 'cal', 'Dentist  16:15'], [0, 'cal', 'Flight  07:40'],
    [1, 'mail', 'Sarah  Re: invoice 8841'], [1, 'mail', 'Bank  Statement ready'], [1, 'mail', 'Leo  Draft attached'],
    [2, 'doc', 'Q4 plan'], [2, 'doc', 'Brand notes'], [2, 'doc', 'Trip checklist'],
    [3, 'habit', 'Run  5-day streak'], [3, 'habit', 'Read  20 min'], [3, 'habit', 'Water  6 of 8'],
  ].map(([s, kind, label], i) => ({ s, kind, label, i, t0: T.stream[0] + (i % 3) * .55 + s * .12 }));

  function srcPath(s) {
    const A = SRC[s].at, B = CENTER;
    const bend = s % 2 ? -1 : 1;
    return [A, [lerp(A[0], B[0], .35) + bend * 60 * F, lerp(A[1], B[1], .2)], [lerp(A[0], B[0], .75), lerp(A[1], B[1], .8) - bend * 40 * F], B];
  }

  function icon(kind, x, y, s, a) {
    ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.6 * F;
    if (kind === 'cal') { rr(x - s / 2, y - s / 2 + 1, s, s - 2, 3); ctx.stroke(); ctx.fillRect(x - s / 2, y - s / 2 + 1, s, s * .22); }
    else if (kind === 'mail') { rr(x - s / 2, y - s * .38, s, s * .76, 3); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - s / 2 + 2, y - s * .3); ctx.lineTo(x, y + s * .05); ctx.lineTo(x + s / 2 - 2, y - s * .3); ctx.stroke(); }
    else if (kind === 'doc') { rr(x - s * .38, y - s / 2, s * .76, s, 3); ctx.stroke(); for (let i = 0; i < 3; i++) ctx.fillRect(x - s * .22, y - s * .22 + i * s * .2, s * .44, 1.5 * F); }
    else if (kind === 'habit') { ctx.beginPath(); ctx.arc(x, y, s * .45, 0, 7); ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, s * .45, -Math.PI / 2, -Math.PI / 2 + Math.PI * 1.4); ctx.strokeStyle = `rgba(${C.PALE},.95)`; ctx.stroke(); }
    else if (kind === 'task') { ctx.beginPath(); ctx.arc(x, y, s * .45, 0, 7); ctx.stroke(); }
    ctx.restore();
  }
  function chip(kind, label, x, y, a, sc = 1) {
    if (a <= 0) return;
    const fs = 20 * F * sc; ctx.font = `500 ${fs}px ${FONT}`;
    const [nm, rest] = label.split('  ');
    ctx.font = `600 ${fs}px ${FONT}`; const nw = ctx.measureText(nm).width;
    ctx.font = `400 ${fs}px ${FONT}`; const rw = rest ? ctx.measureText('  ' + rest).width : 0;
    const w = nw + rw + fs * 2.9, h = fs * 2.1;
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x - w / 2, y - h / 2);
    rr(0, 0, w, h, h / 2.6); ctx.fillStyle = 'rgba(14,17,26,.94)'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.stroke();
    icon(kind, fs * 1.1, h / 2, fs * .9, 1);
    text(nm, fs * 2.0, h / 2 + 1, fs, 600, '255,255,255', .9);
    if (rest) text('  ' + rest, fs * 2.0 + nw, h / 2 + 1, fs, 400, '255,255,255', .55);
    ctx.restore();
  }

  // ---- the one surface: Today, Calendar, Tasks ------------------------------
  const L = SQ
    ? { today: [60, 250, 300, 560], cal: [390, 250, 300, 560], list: [720, 250, 300, 560], comp: [190, 880, 700, 76] }
    : { today: [90, 280, 900, 520], cal: [90, 840, 900, 400], list: [90, 1280, 900, 370], comp: [90, 1700, 900, 96] };
  const TODAY_ROWS = [['cal', 'Standup', '9:30'], ['task', 'Pay invoice 8841', 'from mail'], ['doc', 'Q4 plan', 'doc'], ['habit', 'Run', '5-day streak']];
  const CAL_BLOCKS = [[9.5, .5, 'Standup'], [12, 1, 'Lunch'], [16.25, .75, 'Dentist']];
  const LIST_ROWS = ['Pay invoice 8841', 'Send Q4 plan', 'Book dentist follow-up'];
  const NEW = 'Call the accountant', NEW_AT = 15;

  function panel(r, title, a, hi = 0) {
    const [x, y, w, h] = r;
    ctx.save(); ctx.globalAlpha *= a;
    rr(x, y, w, h, 22 * F); ctx.fillStyle = '#0c0e14'; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = `rgba(${hi ? C.PALE : '255,255,255'},${hi ? .5 : .12})`; ctx.stroke();
    text(title, x + 24 * F, y + 34 * F, 22 * F, 700, '255,255,255', .95);
    ctx.restore();
  }
  function row(x, y, w, kind, title, sub, a, hl = 0) {
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a;
    if (hl > 0) { rr(x - 8 * F, y - 22 * F, w + 16 * F, 44 * F, 12 * F); ctx.fillStyle = `rgba(${C.PALE},${.12 * hl})`; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = `rgba(${C.PALE},${.6 * hl})`; ctx.stroke(); }
    icon(kind, x + 12 * F, y, 18 * F, 1);
    text(title, x + 34 * F, y, 19 * F, 600, '255,255,255', .92);
    if (sub && !SQ) text(sub, x + w, y, 16 * F, 500, '255,255,255', .45, 'right');
    ctx.restore();
  }

  function draw(t) {
    frameStart();
    const g = 1 - eo3(ramp(t, T.out[0], T.out[1]));
    const sc = 1 - ramp(t, T.panel[0] - .2, T.panel[0] + .3);   // stream scene fades as the surface grows

    // streams, labels, chips
    if (sc > 0) {
      SRC.forEach((s, i) => {
        const a = eo3(ramp(t, T.srcIn[i], T.srcIn[i] + .5)) * sc;
        const P = srcPath(i);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let k = -2; k <= 2; k++) {
          const off = k * 12 * F, Q = P.map((p, j) => j === 0 || j === 3 ? p : [p[0] + off, p[1] - off]);
          ctx.beginPath(); for (let j = 0; j <= 40; j++) { const p = bez(Q, j / 40 * a); j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
          ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${C.PALE},${.16 * a})`; ctx.stroke();
        }
        ctx.restore();
        // label with a turning sync arrow
        const [lx, ly] = s.at;
        const pb = pill(s.key, lx, ly - 20 * F, 22 * F, '255,255,255', .08, .3, .92, 'center', clamp(back(ramp(t, T.srcIn[i], T.srcIn[i] + .45)), 0, 1.06) * (a > 0 ? 1 : 0));
        if (a > 0) {
          const rx = pb.cx + pb.w / 2 + 22 * F, ry = pb.cy, rot = t * 3.2;
          ctx.save(); ctx.globalAlpha = a; ctx.translate(rx, ry); ctx.rotate(rot);
          ctx.beginPath(); ctx.arc(0, 0, 9 * F, .3, Math.PI * 1.6); ctx.lineWidth = 2 * F; ctx.strokeStyle = `rgba(${C.PALE},.9)`; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(9 * F * Math.cos(1.6 * Math.PI) + 4 * F, 9 * F * Math.sin(1.6 * Math.PI) - 3 * F); ctx.lineTo(9 * F * Math.cos(1.6 * Math.PI), 9 * F * Math.sin(1.6 * Math.PI)); ctx.lineTo(9 * F * Math.cos(1.6 * Math.PI) + 1 * F, 9 * F * Math.sin(1.6 * Math.PI) + 5 * F); ctx.stroke();
          ctx.restore();
        }
      });
      for (const c of CHIPS) {
        const p = ramp(t, c.t0, c.t0 + 2.1); if (p <= 0 || p >= 1) continue;
        const e = eio(p), [x, y] = bez(srcPath(c.s), e);
        const a = Math.min(ramp(p, .32, .42), 1 - ramp(p, .82, 1)) * sc; // appear clear of the source label
        chip(c.kind, c.label, x, y, a, 1 - .35 * ramp(p, .6, 1));
        if (p > .85) glow(CENTER[0], CENTER[1], 40 * F, (1 - ramp(p, .85, 1)) * .6 * sc);
      }
    }

    // mark in the centre; it pulses as things sync, then the surface grows out of it
    const mk = eo5(ramp(t, T.markIn, T.markIn + .6)) * (1 - ramp(t, T.panel[0], T.panel[0] + .5));
    markBadge(CENTER[0], CENTER[1], 84 * F, mk, t, T.pulses);

    // the surface: grows from the centre as one panel, then settles into Today + Calendar + Tasks
    const grow = eo3(ramp(t, T.panel[0], T.panel[1])) * g;
    if (grow > 0) {
      const sp = eio(ramp(t, T.split[0], T.split[1]));
      const one = SQ ? [240, 250, 600, 560] : [90, 560, 900, 520];
      const tr = one.map((v, i) => lerp(v, L.today[i], sp));
      const cx = tr[0] + tr[2] / 2, cy = tr[1] + tr[3] / 2;
      const r = [cx - tr[2] / 2 * grow, cy - tr[3] / 2 * grow, tr[2] * grow, tr[3] * grow];
      const hit = t >= T.land[0] ? 1 - ramp(t, T.land[0] + .6, T.land[0] + 1.4) : 0;
      panel(r, grow > .9 ? 'Today' : '', 1, hit);
      const rowsA = ramp(t, T.panel[1] - .3, T.panel[1] + .2);
      const step = SQ ? 58 : 72 * F / 1.3 * 1.15;
      const newA = eo3(ramp(t, T.land[0], T.land[0] + .4));
      const rows = [...TODAY_ROWS];
      rows.forEach(([k, ti, sub], i) => row(r[0] + 26 * F, r[1] + 90 * F + i * step + (newA * step), r[2] - 52 * F, k, ti, sub, rowsA * eo3(ramp(t, T.panel[1] - .3 + i * .08, T.panel[1] + .1 + i * .08))));
      if (newA > 0) row(r[0] + 26 * F, r[1] + 90 * F, r[2] - 52 * F, 'task', NEW, '15:00', newA, 1 - ramp(t, T.land[0] + .8, T.land[0] + 1.6));

      // Calendar (one day)
      const ca = eo3(ramp(t, T.calIn, T.calIn + .5)) * g;
      if (ca > 0) {
        const [x, y, w, h] = L.cal; const hit2 = t >= T.land[1] ? 1 - ramp(t, T.land[1] + .6, T.land[1] + 1.4) : 0;
        ctx.save(); ctx.globalAlpha = ca; ctx.translate(0, (1 - ca) * 20);
        panel(L.cal, 'Calendar', 1, hit2);
        const gy = y + 70 * F, gh = h - 90 * F, h0 = 9, h1 = 18, hh = gh / (h1 - h0);
        for (let hr = h0; hr <= h1; hr += SQ ? 3 : 1) { const yy = gy + (hr - h0) * hh; ctx.beginPath(); ctx.moveTo(x + 70 * F, yy); ctx.lineTo(x + w - 20 * F, yy); ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.stroke(); text(`${hr}:00`, x + 58 * F, yy, 13 * F, 500, '255,255,255', .35, 'right'); }
        const blk = (s, d, label, a, hl) => { const by = gy + (s - h0) * hh + 2, bh = d * hh - 4; rr(x + 76 * F, by, w - 102 * F, bh, 8 * F); ctx.fillStyle = hl ? `rgba(${C.PALE},${.16})` : 'rgba(255,255,255,.06)'; ctx.globalAlpha = ca * a; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = hl ? `rgba(${C.PALE},.7)` : 'rgba(255,255,255,.12)'; ctx.stroke(); ctx.save(); rr(x + 76 * F, by, w - 102 * F, bh, 8 * F); ctx.clip(); text(label, x + 88 * F, by + Math.min(bh / 2, 16 * F), 15 * F, 600, '255,255,255', .85); ctx.restore(); ctx.globalAlpha = ca; };
        CAL_BLOCKS.forEach(([s, d, l]) => blk(s, d, l, 1, 0));
        const na = eo3(ramp(t, T.land[1], T.land[1] + .4)); if (na > 0) blk(NEW_AT, 1, NEW, na, 1);
        ctx.restore();
      }
      // Tasks list
      const la = eo3(ramp(t, T.listIn, T.listIn + .5)) * g;
      if (la > 0) {
        const [x, y, w] = L.list; const hit3 = t >= T.land[2] ? 1 - ramp(t, T.land[2] + .6, T.land[2] + 1.4) : 0;
        ctx.save(); ctx.globalAlpha = la; ctx.translate(0, (1 - la) * 20);
        panel(L.list, 'Tasks', 1, hit3);
        const na = eo3(ramp(t, T.land[2], T.land[2] + .4)), st = SQ ? 54 : 66;
        if (na > 0) row(x + 26 * F, y + 90 * F, w - 52 * F, 'task', NEW, SQ ? '' : 'Today', na, 1 - ramp(t, T.land[2] + .8, T.land[2] + 1.6));
        LIST_ROWS.forEach((ti, i) => row(x + 26 * F, y + 90 * F + (i + na) * st, w - 52 * F, 'task', ti, '', 1));
        ctx.restore();
      }
      // composer
      const co = eo3(ramp(t, T.composer, T.composer + .4)) * g * (1 - ramp(t, T.land[0] + .2, T.land[0] + .6));
      if (co > 0) {
        const [x, y, w, h] = L.comp;
        ctx.save(); ctx.globalAlpha = co; ctx.translate(0, (1 - co) * 24);
        rr(x, y, w, h, h / 2); ctx.fillStyle = '#10131b'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = `rgba(${C.PALE},.45)`; ctx.stroke();
        const n = Math.round(NEW.length * ramp(t, T.type[0], T.type[1]));
        const typed = NEW.slice(0, n), caret = (Math.floor(t * 2.2) % 2 === 0) && t < T.tap;
        text(n ? typed + (caret ? '|' : '') : '+ New task', x + 30 * F, y + h / 2, 21 * F, n ? 600 : 500, '255,255,255', n ? .95 : .5);
        const timeA = ramp(t, T.type[1], T.type[1] + .2);
        let tx = x + w - 24 * F;
        const add = pill('Add', tx, y + h / 2 - 18 * F, 19 * F, C.PALE, .14, .7, 1, 'right');
        if (timeA > 0) { ctx.globalAlpha = co * timeA; pill('Today 15:00', add.cx - add.w / 2 - 12 * F, y + h / 2 - 18 * F, 17 * F, '255,255,255', .07, .25, .8, 'right'); ctx.globalAlpha = co; }
        ctx.restore();
        window.__add = [add.cx, add.cy];
      }
      if (window.__add) finger(window.__add[0], window.__add[1], t, T.tap - .55, T.tap, T.tap + .6, F);
    }

    endCard(t, 'Everything you’re working on.', 'One place.', T.end);
    frameEnd(t);
  }
  window.TIMING = T;
  boot(draw, DUR);
})();
