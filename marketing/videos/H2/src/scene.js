/* Needt H2 "Auto-schedule" — overdue pile on one day; the mark pulses and the tasks land in free slots
   across the week; the pinned task keeps its time; the day ends calm, free time lit.
   Truth: src/services/scheduling (overdue tasks rank first and go to work-hours slots that are free;
   scheduleLocked / isFrozen tasks are never moved). */
(function () {
  const { SQ, W, H, ctx, clamp, ramp, lerp, eo3, eo5, eio, back, rr, glow, markBadge, text, pinIcon, endCard, frameStart, frameEnd, boot, FONT, C } = window.NM;
  const DUR = 14.0;

  // ---- timing (seconds) -----------------------------------------------------
  const T = {
    gridIn: [0.3, 1.0],          // week grid and events fade in
    pileIn: 0.9, pileStep: 0.1,  // overdue cards drop onto Today one by one (9 cards → last at 1.7)
    pinIn: 1.9,                  // pinned task appears with its pin
    shake: [2.1, 4.6],           // the pile trembles
    markIn: 2.9, pulses: [3.6, 4.1, 4.6],
    flyStart: 4.6, flyStep: 0.22, flyDur: 0.7, // task i leaves at 4.6 + 0.22 i, lands 0.7 s later (last lands 7.06)
    freeIn: 7.3,                 // free time lights up
    sweep: [7.9, 9.9],           // the "now" line runs down Today; tasks it passes are ticked
    out: [10.1, 10.6],           // calendar fades out
    end: { mark: 10.7, l1: 10.9, l2: 11.35, url: 12.1 },
  };

  // ---- layout ---------------------------------------------------------------
  const G = SQ
    ? { x: 150, y: 250, w: 890, h: 780, head: 52, fs: 1, mark: [540, 112, 64] }
    : { x: 120, y: 640, w: 900, h: 1120, head: 64, fs: 1.3, mark: [540, 340, 108] };
  const H0 = 9, H1 = 17, DAYS = ['Today', 'Tue', 'Wed', 'Thu', 'Fri'];
  const colW = G.w / 5, hourH = (G.h - G.head) / (H1 - H0);
  const top = G.y + G.head, F = G.fs;
  const colX = d => G.x + d * colW;
  const hourY = h => top + (h - H0) * hourH;
  const pad = 6;

  const EVENTS = [ // existing calendar events (busy)
    [0, 9, .5, 'Standup'], [0, 12, 1, 'Lunch'], [1, 10, 1, '1:1'], [2, 12.5, 1, 'Team sync'],
    [3, 9, 1, 'Planning'], [4, 11, 1, 'Review'], [1, 14, 1, 'Interview'], [3, 15, 1, 'Workshop'],
  ];
  const PINNED = { d: 0, s: 15, dur: 1, title: 'Board deck' };
  const TASKS = [ // overdue → free slot [day, start, hours]
    ['Reply to Anna', 0, 9.5, 1], ['Q4 report', 0, 10.5, 1.5], ['Invoice 8841', 0, 13, 1.5],
    ['Book flights', 1, 9, 1], ['Fix login bug', 1, 11, 1.5], ['Grant draft', 2, 9.5, 1.5],
    ['Tax receipts', 2, 14, 1], ['Update deck', 3, 10, 1.5], ['Renew domain', 4, 9, 1],
  ].map(([title, d, s, dur], i) => ({ title, d, s, dur, i }));

  const busy = [...EVENTS.map(e => [e[0], e[1], e[1] + e[2]]), [PINNED.d, PINNED.s, PINNED.s + PINNED.dur], ...TASKS.map(k => [k.d, k.s, k.s + k.dur])];
  const FREE = [];
  for (let d = 0; d < 5; d++) {
    const b = busy.filter(x => x[0] === d).sort((a, c) => a[1] - c[1]);
    let h = H0;
    for (const [, s, e] of b) { if (s - h >= .5) FREE.push([d, h, s]); h = Math.max(h, e); }
    if (H1 - h >= .5) FREE.push([d, h, H1]);
  }

  const shakeOf = (t, i) => {
    const a = ramp(t, T.shake[0], T.shake[0] + .3) * (1 - ramp(t, T.flyStart + i * T.flyStep - .1, T.flyStart + i * T.flyStep));
    return [Math.sin(t * 47 + i * 1.7) * 3.2 * a * F, Math.sin(t * 39 + i * 2.9) * 1.6 * a * F, Math.sin(t * 31 + i) * .012 * a];
  };

  function block(x, y, w, h, title, sub, tone, alpha, extra = {}) {
    if (alpha <= 0) return;
    ctx.save(); ctx.globalAlpha *= alpha;
    if (extra.rot) { ctx.translate(x + w / 2, y + h / 2); ctx.rotate(extra.rot); ctx.translate(-x - w / 2, -y - h / 2); }
    rr(x, y, w, h, 10 * F); ctx.fillStyle = '#0d0f16'; ctx.fill();
    const rgb = tone === 'red' ? C.RED : tone === 'event' ? '255,255,255' : C.PALE;
    const k = extra.redK ?? (tone === 'red' ? 1 : 0);
    ctx.fillStyle = tone === 'event' ? 'rgba(255,255,255,.035)' : `rgba(${k > 0 ? C.RED : C.PALE},${lerp(.07, .13, k)})`; ctx.fill();
    ctx.lineWidth = 1.3; ctx.strokeStyle = tone === 'event' ? 'rgba(255,255,255,.10)' : `rgba(${k > .5 ? C.RED : C.PALE},${lerp(.32, .7, k)})`; ctx.stroke();
    if (tone !== 'event') { rr(x + 5 * F, y + 6 * F, 3.5 * F, h - 12 * F, 2); ctx.fillStyle = `rgba(${k > .5 ? C.RED : C.PALE},${.9})`; ctx.fill(); }
    const tx = x + (tone === 'event' ? 10 : 15) * F;
    ctx.save(); rr(x, y, w, h, 10 * F); ctx.clip();
    const one = h < 40 * F;
    text(title, tx, one ? y + h / 2 : y + 17 * F, 17 * F, 600, '255,255,255', tone === 'event' ? .5 : extra.done ? .5 : .95);
    if (!one && sub) text(sub, tx, y + 38 * F, 14 * F, 500, k > .5 ? C.RED : '255,255,255', k > .5 ? .95 : .45);
    ctx.restore();
    if (extra.pin) pinIcon(x + w - 16 * F, y + 17 * F, 18 * F, '255,255,255', .9);
    if (extra.done) {
      const cx = x + w - 16 * F, cy = y + h - 15 * F, r = 8 * F * clamp(back(extra.done));
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, r), 0, 7); ctx.fillStyle = `rgba(${C.GREEN},.95)`; ctx.fill();
      ctx.strokeStyle = 'rgba(5,6,10,.95)'; ctx.lineWidth = 2 * F; ctx.lineCap = 'round'; ctx.beginPath();
      ctx.moveTo(cx - r * .4, cy); ctx.lineTo(cx - r * .1, cy + r * .3); ctx.lineTo(cx + r * .45, cy - r * .3); ctx.stroke();
    }
    ctx.restore();
  }
  const fmtH = h => `${Math.floor(h)}:${h % 1 ? '30' : '00'}`;

  function draw(t) {
    frameStart();
    const g = 1 - eo3(ramp(t, T.out[0], T.out[1]));
    const gi = eo3(ramp(t, T.gridIn[0], T.gridIn[1])) * g;

    // grid
    if (gi > 0) {
      ctx.save(); ctx.globalAlpha = gi;
      for (let d = 0; d < 5; d++) {
        text(DAYS[d], colX(d) + colW / 2, G.y + G.head * .45, 20 * F, d === 0 ? 700 : 500, '255,255,255', d === 0 ? .95 : .5, 'center');
        if (d) { ctx.beginPath(); ctx.moveTo(colX(d), top); ctx.lineTo(colX(d), top + (H1 - H0) * hourH); ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1; ctx.stroke(); }
      }
      for (let h = H0; h <= H1; h++) {
        ctx.beginPath(); ctx.moveTo(G.x, hourY(h)); ctx.lineTo(G.x + G.w, hourY(h)); ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.stroke();
        text(`${h}:00`, G.x - 14 * F, hourY(h), 14 * F, 500, '255,255,255', .38, 'right');
      }
      // today underline
      rr(colX(0) + colW * .3, G.y + G.head * .78, colW * .4, 3 * F, 2); ctx.fillStyle = `rgba(${C.PALE},.8)`; ctx.fill();
      ctx.restore();
    }

    // free time (after the tasks land)
    const fk = eo3(ramp(t, T.freeIn, T.freeIn + .7)) * g;
    if (fk > 0) for (const [d, s, e] of FREE) {
      const x = colX(d) + pad, y = hourY(s) + 3, w = colW - pad * 2, h = (e - s) * hourH - 6;
      ctx.save(); ctx.globalAlpha = fk;
      rr(x, y, w, h, 10 * F); ctx.fillStyle = `rgba(${C.GREEN},.045)`; ctx.fill();
      ctx.setLineDash([5 * F, 5 * F]); ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(${C.GREEN},.28)`; ctx.stroke(); ctx.setLineDash([]);
      if (e - s >= 1) text('Free', x + w / 2, y + h / 2, 15 * F, 600, C.GREEN, .8, 'center');
      ctx.restore();
    }

    // events
    for (const [d, s, dur, title] of EVENTS) block(colX(d) + pad, hourY(s) + 2, colW - pad * 2, dur * hourH - 4, title, fmtH(s), 'event', gi);

    // sweep (now line) state for Today
    const sweepH = lerp(H0, H1, eio(ramp(t, T.sweep[0], T.sweep[1])));
    const passed = endH => t >= T.sweep[0] && sweepH >= endH ? ramp(sweepH, endH, endH + .35) : 0;

    // pinned task — never moves
    const pk = eo3(ramp(t, T.pinIn, T.pinIn + .45)) * g;
    block(colX(0) + pad, hourY(PINNED.s) + 2 + (1 - pk) * 14, colW - pad * 2, PINNED.dur * hourH - 4, PINNED.title, `${fmtH(PINNED.s)} · pinned`, 'task', pk,
      { pin: true, done: passed(PINNED.s + PINNED.dur) || 0, redK: 0 });

    // overdue tasks: pile on Today → fly to their slots
    const pileY0 = hourY(9.6), step = 21 * F, ph = 58 * F;
    for (const k of TASKS) {
      const a0 = T.pileIn + k.i * T.pileStep;
      const ap = eo3(ramp(t, a0, a0 + .4)); if (ap <= 0) continue;
      const f0 = T.flyStart + k.i * T.flyStep, fk2 = eio(ramp(t, f0, f0 + T.flyDur));
      const [sx, sy, sr] = shakeOf(t, k.i);
      const P0 = [colX(0) + pad + 4 * F + sx, pileY0 + k.i * step + sy - (1 - ap) * 40 * F];
      const P1 = [colX(k.d) + pad, hourY(k.s) + 2];
      const w0 = colW - pad * 2 - 8 * F, w1 = colW - pad * 2;
      const h1 = k.dur * hourH - 4;
      const arc = Math.sin(fk2 * Math.PI) * -60 * F;
      const x = lerp(P0[0], P1[0], fk2), y = lerp(P0[1], P1[1], fk2) + arc;
      const w = lerp(w0, w1, fk2), h = lerp(ph, h1, fk2);
      const red = 1 - ramp(fk2, .55, 1);
      const landed = fk2 >= 1;
      const lk = landed ? ramp(t, f0 + T.flyDur, f0 + T.flyDur + .5) : 0;
      if (fk2 > 0 && fk2 < 1) glow(x + w / 2, y + h / 2, 34 * F, .5 * Math.sin(fk2 * Math.PI) * g);
      const sub = red > .5 ? 'Overdue' : `${fmtH(k.s)}–${fmtH(k.s + k.dur)}`;
      block(x, y, w, h, k.title, sub, 'task', ap * g, { rot: fk2 > 0 ? 0 : sr, redK: red, done: k.d === 0 ? passed(k.s + k.dur) : 0 });
      if (lk > 0 && lk < 1) { ctx.save(); rr(x - 2, y - 2, w + 4, h + 4, 12 * F); ctx.lineWidth = 2.2; ctx.strokeStyle = `rgba(${C.PALE},${.7 * (1 - lk) * g})`; ctx.stroke(); ctx.restore(); }
    }

    // now line in Today
    if (t >= T.sweep[0] && g > 0) {
      const y = hourY(sweepH), a = g * (1 - ramp(t, T.sweep[1], T.sweep[1] + .3) * .6);
      ctx.save(); ctx.globalAlpha = a;
      ctx.beginPath(); ctx.moveTo(colX(0) + 2, y); ctx.lineTo(colX(1) - 2, y); ctx.lineWidth = 2.2 * F; ctx.strokeStyle = `rgba(${C.PALE},.95)`; ctx.stroke();
      ctx.beginPath(); ctx.arc(colX(0) + 4, y, 5 * F, 0, 7); ctx.fillStyle = `rgb(${C.PALE})`; ctx.fill();
      ctx.restore(); glow(colX(0) + 4, y, 16 * F, .6 * a);
    }

    // the mark: appears, pulses as it plans
    const mk = eo5(ramp(t, T.markIn, T.markIn + .6)) * g;
    markBadge(G.mark[0], G.mark[1], G.mark[2], mk, t, T.pulses);
    // a beam from the mark to the pile while it plans
    const beam = ramp(t, T.pulses[0] - .2, T.pulses[0] + .2) * (1 - ramp(t, T.flyStart + 2.2, T.flyStart + 2.8)) * g;
    if (beam > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const x0 = G.mark[0], y0 = G.mark[1] + G.mark[2] * .9, x1 = colX(0) + colW / 2, y1 = pileY0 - 10 * F;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0, (y0 + y1) / 2, x1, y0, x1, y1);
      ctx.lineWidth = 1.6; ctx.strokeStyle = `rgba(${C.PALE},${.55 * beam})`; ctx.stroke(); ctx.restore();
    }

    endCard(t, 'It plans the day.', 'You just show up.', T.end);
    frameEnd(t);
  }
  window.TIMING = T;
  boot(draw, DUR);
})();
