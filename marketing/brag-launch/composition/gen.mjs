// node gen.mjs  → writes landscape/index.html (1920x1080) and vertical/index.html (1080x1920)
// One template, two compositions. Every visible thing is a function of the paused GSAP timeline.
import { writeFileSync, mkdirSync } from "node:fs";

const DUR = 23.0;

function page(fmt) {
  const V = fmt === "vertical";
  const W = V ? 1080 : 1920, H = V ? 1920 : 1080;
  // Layout per format (px on the canvas).
  const L = V
    ? { capY: 250, capFs: 80, capW: 940, win: [60, 560, 960, 1180], todayWin: [60, 600, 960, 1080],
        phone: [250, 520, 580, 1186], capCard: [430, 1250, 560, 549], card: [90, 820, 900, 300],
        endIcon: 700, endWord: 960, endBtn: 1130, endUrl: 1260, endFine: 1340, titleFs: 112, subFs: 40 }
    : { capY: 130, capFs: 76, capW: 1500, win: [210, 250, 1500, 780], todayWin: [210, 250, 1500, 780],
        phone: [420, 230, 400, 818], capCard: [880, 420, 620, 608], card: [460, 470, 1000, 300],
        endIcon: 330, endWord: 560, endBtn: 720, endUrl: 830, endFine: 900, titleFs: 128, subFs: 38 };
  // Calendar camera regions in image pixels (2880x1800): [x0, y0, x1, y1].
  const CAL0 = V ? [1100, 420, 1900, 1420] : [640, 300, 2340, 1500];
  const CAL1 = V ? [1180, 440, 1820, 1300] : [900, 380, 2100, 1350];
  const TODAY0 = [0, 0, 2880, 1800];
  const TODAY1 = V ? [640, 150, 1800, 1455] : [640, 200, 2100, 1100];
  return `<!doctype html>
<html lang="en" data-composition-variables='[
  {"id":"color-ground","type":"color","label":"Background","default":"#f7f5f3"},
  {"id":"color-ink","type":"color","label":"Text","default":"#0e1520"},
  {"id":"color-accent","type":"color","label":"Accent","default":"#b5b1e5"}
]'>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<script src="assets/gsap.min.js"></script>
<style>
@font-face { font-family: "Exposure"; src: url("assets/fonts/exposure.woff2") format("woff2"); font-weight: 100 900; }
@font-face { font-family: "Figtree"; src: url("assets/fonts/figtree-latin.woff2") format("woff2"); font-weight: 300 900; }
:root { --color-ground: #f7f5f3; --color-ink: #0e1520; --color-accent: #b5b1e5; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: var(--color-ground); }
#root { width: 100%; height: 100%; position: relative; overflow: hidden; font-family: "Figtree", sans-serif; color: var(--color-ink); }
#sky { position: absolute; inset: 0; background: radial-gradient(120% 90% at 50% 105%, #d9d5f0 0%, #e9e6f3 38%, #f7f5f3 72%); }
#clouds { position: absolute; left: -10%; width: 120%; bottom: ${V ? -40 : -60}px; height: ${V ? 520 : 420}px; background: url("assets/img/hero-clouds.webp") center bottom / cover no-repeat; opacity: .95; -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 45%); mask-image: linear-gradient(to bottom, transparent 0%, #000 45%); }
.scene { position: absolute; inset: 0; }
.cap { position: absolute; left: ${(W - L.capW) / 2}px; width: ${L.capW}px; top: ${L.capY}px; text-align: center; font-family: "Exposure", serif; font-weight: 500; font-size: ${L.capFs}px; line-height: 1.04; letter-spacing: -0.035em; color: var(--color-ink); }
.cap i { font-style: italic; }
.w { display: inline-block; white-space: pre; }
.br { display: block; height: 0; }
.win { position: absolute; border-radius: ${V ? 34 : 26}px; overflow: hidden; background: #fff; box-shadow: 0 40px 90px -30px rgba(40, 36, 90, .35), 0 0 0 1px rgba(14, 21, 32, .06); }
.cam { position: absolute; left: 0; top: 0; width: 2880px; height: 1800px; transform-origin: 0 0; }
.cam img { position: absolute; left: 0; top: 0; width: 2880px; height: 1800px; }
.chip { position: absolute; left: 1355px; width: 283px; height: 98px; border-radius: 14px; background: url("assets/img/cal-before.webp") -1355px -1120px / 2880px 1800px; box-shadow: 0 24px 50px -12px rgba(30, 30, 70, .45); }
.ring { position: absolute; border-radius: 16px; box-shadow: 0 0 0 5px rgba(135, 120, 230, .55), 0 0 40px 6px rgba(135, 120, 230, .35); }
.toast { position: absolute; left: 50%; bottom: ${V ? 40 : 34}px; height: ${V ? 78 : 66}px; display: flex; align-items: center; gap: ${V ? 16 : 18}px; padding: 0 ${V ? 14 : 12}px 0 ${V ? 24 : 26}px; border-radius: 999px; background: #161a22; color: #fff; font-size: 28px; white-space: nowrap; box-shadow: 0 20px 50px -14px rgba(10, 12, 20, .5); }
.toast .dot { width: 10px; height: 10px; border-radius: 50%; background: #34d399; }
.toast .b { padding: ${V ? "10px 20px" : "9px 18px"}; border-radius: 999px; font-weight: 600; }
.toast .undo { color: rgba(255, 255, 255, .7); background: rgba(255, 255, 255, .1); }
.toast .keep { color: #0e1520; background: #fff; }
.finger { position: absolute; left: 0; top: 0; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; background: rgba(255, 255, 255, .92); box-shadow: 0 6px 18px rgba(20, 20, 40, .35), 0 0 0 2px rgba(14, 21, 32, .12); }
.title { position: absolute; left: 0; right: 0; text-align: center; font-family: "Exposure", serif; font-weight: 500; font-size: ${L.titleFs}px; line-height: .98; letter-spacing: -0.045em; }
.title i { font-style: italic; }
.sub { position: absolute; left: 0; right: 0; text-align: center; font-size: ${L.subFs}px; color: rgba(14, 21, 32, .68); letter-spacing: -0.01em; }
.phone { position: absolute; filter: drop-shadow(0 40px 60px rgba(40, 36, 90, .35)); }
.capcard { position: absolute; border-radius: 34px; overflow: hidden; box-shadow: 0 40px 80px -24px rgba(40, 36, 90, .38), 0 0 0 1px rgba(14, 21, 32, .06); }
.agcard { position: absolute; border-radius: 30px; background: #fff; box-shadow: 0 40px 90px -30px rgba(40, 36, 90, .35), 0 0 0 1px rgba(14, 21, 32, .06); padding: 44px 48px; }
.agrow { display: flex; align-items: center; gap: 20px; }
.agicon { width: 64px; height: 64px; }
.agtitle { font-size: ${V ? 42 : 40}px; font-weight: 600; letter-spacing: -0.02em; }
.agmeta { font-size: 28px; color: rgba(14, 21, 32, .5); margin-top: 4px; }
.needs { margin-left: auto; padding: 8px 18px; border-radius: 999px; font-size: 28px; font-weight: 600; color: #b45309; background: #fff4e0; box-shadow: 0 0 0 1.5px #f5c47a; }
.btns { display: flex; gap: 16px; margin-top: 34px; }
.btn { position: relative; padding: 16px 34px; border-radius: 999px; font-size: 28px; font-weight: 600; }
.approve { background: #0e1520; color: #fff; }
.notnow { background: #f0eef3; color: rgba(14, 21, 32, .7); }
.approved { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; border-radius: 999px; background: #10b981; color: #fff; }
.endicon { position: absolute; left: 50%; width: ${V ? 220 : 180}px; height: ${V ? 220 : 180}px; margin-left: -${V ? 110 : 90}px; border-radius: ${V ? 52 : 42}px; box-shadow: 0 30px 70px -20px rgba(70, 60, 160, .45); }
.endword { position: absolute; left: 0; right: 0; text-align: center; font-family: "Exposure", serif; font-weight: 500; font-size: ${V ? 150 : 140}px; letter-spacing: -0.05em; line-height: 1; }
.cta { position: absolute; left: 50%; display: flex; align-items: center; gap: 12px; padding: ${V ? "24px 48px" : "20px 42px"}; border-radius: 999px; background: #0e1520; color: #fff; font-size: ${V ? 38 : 34}px; font-weight: 600; white-space: nowrap; }
.url { position: absolute; left: 0; right: 0; text-align: center; font-size: ${V ? 40 : 36}px; font-weight: 600; letter-spacing: -0.01em; }
.fine { position: absolute; left: 0; right: 0; text-align: center; font-size: 30px; color: rgba(14, 21, 32, .6); }
</style>
</head>
<body>
<div id="root" data-composition-id="brag" data-start="0" data-duration="${DUR}" data-width="${W}" data-height="${H}">
  <div id="sky"></div>
  <div id="clouds" data-layout-allow-overflow></div>

  <!-- 1 · Hook: move one meeting, Needt reshuffles the rest, you press Keep -->
  <div id="s1" class="scene clip" data-start="0" data-duration="3.05" data-track-index="1" data-track-kind="graphics">
    <div id="s1-cap1" class="cap"><span class="w">Move </span><span class="w">one </span><span class="w">meeting.</span></div>
    <div id="s1-cap2" class="cap"><span class="w">Needt </span><span class="w">reshuffles </span><span class="w">the </span><span class="w">rest.</span></div>
    <div id="s1-win" class="win" data-layout-allow-overflow style="left:${L.win[0]}px;top:${L.win[1]}px;width:${L.win[2]}px;height:${L.win[3]}px">
      <div id="s1-cam" class="cam">
        <img id="s1-before" src="assets/img/cal-before.webp" alt="" />
        <img id="s1-after" src="assets/img/cal-after.webp" alt="" />
        <div id="s1-ring1" class="ring" style="left:1352px;top:497px;width:289px;height:101px"></div>
        <div id="s1-ring2" class="ring" style="left:1352px;top:1119px;width:289px;height:68px"></div>
        <div id="s1-ring3" class="ring" style="left:1352px;top:1222px;width:289px;height:49px"></div>
        <div id="s1-chip" class="chip" style="top:1120px"></div>
      </div>
      <div id="s1-toast" class="toast"><span class="dot"></span><span>Wed call → 10:00. Products → 16:00, courier → 17:00</span><span class="b undo">Undo</span><span id="s1-keep" class="b keep">Keep</span></div>
    </div>
    <div id="s1-finger" class="finger" data-layout-allow-occlusion></div>
  </div>

  <!-- 2 · The promise, in the landing's own words -->
  <div id="s2" class="scene clip" data-start="3.05" data-duration="3.25" data-track-index="1" data-track-kind="graphics">
    <div id="s2-t1" class="title" style="top:${V ? 700 : 300}px"><span class="w">Everything </span><span class="w">you’re </span>${V ? "<span class=\"br\"></span>" : ""}<span class="w">working </span><span class="w">on,</span></div>
    <div id="s2-t2" class="title" style="top:${V ? 950 : 440}px"><i><span class="w">in </span><span class="w">one </span><span class="w">place.</span></i></div>
    <div id="s2-sub" class="sub" style="top:${V ? 1130 : 610}px">…and your day plans itself.</div>
  </div>

  <!-- 3 · Today on the desktop: one thing next -->
  <div id="s3" class="scene clip" data-start="6.3" data-duration="4.1" data-track-index="1" data-track-kind="graphics">
    <div id="s3-cap1" class="cap"><span class="w">One </span><span class="w">thing </span><span class="w">next.</span></div>
    <div id="s3-cap2" class="cap"><span class="w">Start </span><span class="w">it, </span><span class="w">or </span><span class="w">mark </span><span class="w">it </span><span class="w">done.</span></div>
    <div id="s3-win" class="win" data-layout-allow-overflow style="left:${L.todayWin[0]}px;top:${L.todayWin[1]}px;width:${L.todayWin[2]}px;height:${L.todayWin[3]}px">
      <div id="s3-cam" class="cam"><img src="assets/img/today-light.webp" alt="" /></div>
    </div>
  </div>

  <!-- 4 · Type it like you'd say it -->
  <div id="s4" class="scene clip" data-start="10.4" data-duration="3.8" data-track-index="1" data-track-kind="graphics">
    <div id="s4-cap1" class="cap"><span class="w">Type </span><span class="w">it </span><span class="w">like </span><span class="w">you’d </span><span class="w">say </span><span class="w">it.</span></div>
    <img id="s4-phone" class="phone" src="assets/img/devices_iphone.webp" alt="" style="left:${L.phone[0]}px;top:${L.phone[1]}px;width:${L.phone[2]}px;height:${L.phone[3]}px" />
    <div id="s4-card" class="capcard" style="left:${L.capCard[0]}px;top:${L.capCard[1]}px;width:${L.capCard[2]}px;height:${L.capCard[3]}px"><img src="assets/img/feat_f-capture.webp" alt="" style="width:100%;height:100%;display:block" /></div>
  </div>

  <!-- 5 · Agents: work moves while you're away, you approve -->
  <div id="s5" class="scene clip" data-start="14.2" data-duration="3.85" data-track-index="1" data-track-kind="graphics">
    <div id="s5-cap1" class="cap"><span class="w">Work </span><span class="w">moves </span><span class="w">while </span>${V ? "<span class=\"br\"></span>" : ""}<span class="w">you’re </span><span class="w">away.</span></div>
    <div id="s5-cap2" class="cap"><i><span class="w">You </span><span class="w">approve </span><span class="w">what </span>${V ? "<span class=\"br\"></span>" : ""}<span class="w">matters.</span></i></div>
    <div id="s5-card" class="agcard" style="left:${L.card[0]}px;top:${L.card[1]}px;width:${L.card[2]}px">
      <div class="agrow">
        <img class="agicon" src="assets/img/agents_icon.svg" alt="" />
        <div><div class="agtitle">Send the invoice batch</div><div class="agmeta">An agent did the work · waiting on you</div></div>
        <div id="s5-needs" class="needs">Needs you</div>
      </div>
      <div class="btns"><div id="s5-approve" class="btn approve">Approve<div id="s5-ok" class="approved">Approved ✓</div></div><div class="btn notnow">Not now</div></div>
    </div>
    <div id="s5-finger" class="finger" data-layout-allow-occlusion></div>
  </div>

  <!-- 6 · End card -->
  <div id="s6" class="scene clip" data-start="18.05" data-duration="4.95" data-track-index="1" data-track-kind="graphics">
    <img id="s6-icon" class="endicon" src="assets/img/icon.svg" alt="" style="top:${L.endIcon}px" />
    <div id="s6-word" class="endword" style="top:${L.endWord}px">Needt</div>
    <div id="s6-cta" class="cta" style="top:${L.endBtn}px">Try it free →</div>
    <div id="s6-url" class="url" style="top:${L.endUrl}px">needt.app</div>
    <div id="s6-fine" class="fine" style="top:${L.endFine}px">Free plan + 14 days of Pro.</div>
  </div>

  <audio id="music" src="assets/music.mp3" data-start="0" data-duration="${DUR}" data-track-index="10" data-volume="0.5" data-fade-in="0.2" data-fade-out="1.6"></audio>
  <audio id="sfx-grab" src="assets/sfx/click_003.wav" data-start="0.55" data-track-index="11" data-volume="0.35"></audio>
  <audio id="sfx-drop" src="assets/sfx/drop_002.wav" data-start="1.35" data-track-index="12" data-volume="0.3"></audio>
  <audio id="sfx-keep" src="assets/sfx/click_003.wav" data-start="2.46" data-track-index="13" data-volume="0.4"></audio>
  <audio id="sfx-approve" src="assets/sfx/click_003.wav" data-start="16.93" data-track-index="14" data-volume="0.4"></audio>
  <audio id="sfx-end" src="assets/sfx/impactSoft_medium_001.wav" data-start="18.05" data-track-index="15" data-volume="0.35"></audio>
  <audio id="sfx-cta" src="assets/sfx/bong_001.wav" data-start="20.19" data-track-index="16" data-volume="0.25"></audio>
</div>
<script>
(function () {
  const W = ${W}, H = ${H};
  const tl = gsap.timeline({ paused: true });
  // Camera: fit an image region [x0,y0,x1,y1] (cover) into a window of size w×h.
  function cam(r, w, h) {
    const rw = r[2] - r[0], rh = r[3] - r[1];
    const s = Math.max(w / rw, h / rh);
    return { scale: s, x: -r[0] * s + (w - rw * s) / 2, y: -r[1] * s + (h - rh * s) / 2 };
  }
  const words = (sel) => document.querySelectorAll(sel + " .w");
  function wordsIn(sel, at, gap) {
    tl.fromTo(words(sel), { opacity: 0, filter: "blur(10px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.32, ease: "power3.out", stagger: gap || 0.08 }, at);
  }
  function out(sel, at) { tl.to(sel, { opacity: 0, filter: "blur(10px)", duration: 0.2, ease: "power2.in" }, at); }

  // Clouds drift the whole film (constant, slow).
  tl.fromTo("#clouds", { x: 0 }, { x: -${V ? 70 : 110}, duration: ${DUR}, ease: "none" }, 0);

  // ---- 1 · Hook (0 – 3.05) ----
  const win1 = [${L.win[2]}, ${L.win[3]}];
  const c0 = cam(${JSON.stringify(CAL0)}, win1[0], win1[1]), c1 = cam(${JSON.stringify(CAL1)}, win1[0], win1[1]);
  tl.fromTo("#s1-cam", { x: c0.x, y: c0.y, scale: c0.scale }, { x: c1.x, y: c1.y, scale: c1.scale, duration: 3.05, ease: "power2.inOut" }, 0);
  tl.fromTo("#s1-win", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }, 0);
  wordsIn("#s1-cap1", 0.1);
  out("#s1-cap1", 1.25);
  wordsIn("#s1-cap2", 1.4, 0.07);
  tl.fromTo("#s1-after", { opacity: 0 }, { opacity: 1, duration: 0.28, ease: "power2.out" }, 1.37);
  tl.fromTo("#s1-chip", { y: 0, scale: 1, opacity: 0 }, { opacity: 1, scale: 1.04, duration: 0.12, ease: "power2.out" }, 0.55);
  tl.to("#s1-chip", { y: -620, duration: 0.7, ease: "power2.inOut" }, 0.67);
  tl.to("#s1-chip", { scale: 1, opacity: 0, duration: 0.18, ease: "power2.in" }, 1.37);
  for (const [i, t] of [[1, 1.42], [2, 1.55], [3, 1.62]]) {
    tl.fromTo("#s1-ring" + i, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.out" }, t);
    tl.to("#s1-ring" + i, { opacity: 0, duration: 0.4, ease: "power2.in" }, 2.55);
  }
  tl.fromTo("#s1-toast", { xPercent: -50, y: 40, opacity: 0 }, { xPercent: -50, y: 0, opacity: 1, duration: 0.45, ease: "expo.out" }, 1.75);
  tl.to("#s1-keep", { scale: 0.9, duration: 0.08, ease: "power2.in" }, 2.46);
  tl.to("#s1-keep", { scale: 1, duration: 0.2, ease: "power3.out" }, 2.54);
  tl.to("#s1-toast", { y: 30, opacity: 0, duration: 0.25, ease: "power2.in" }, 2.72);
  // Finger: grab the 16:00 call, drag it to 10:00, then press Keep.
  const winEl = { x: ${L.win[0]}, y: ${L.win[1]} };
  const pt = (ix, iy, c) => ({ left: winEl.x + c.x + ix * c.scale, top: winEl.y + c.y + iy * c.scale });
  // camera mid-values at the moments (good enough: interpolate the eased camera at those times)
  function camAt(t) { const k = gsap.parseEase("power2.inOut")(Math.min(1, t / 3.05)); return { x: c0.x + (c1.x - c0.x) * k, y: c0.y + (c1.y - c0.y) * k, scale: c0.scale + (c1.scale - c0.scale) * k }; }
  const grab = pt(1500, 1169, camAt(0.55)), drop = pt(1500, 549, camAt(1.37));
  const keepX = ${V ? W / 2 + 330 : W / 2 + 380}, keepY = ${L.win[1] + L.win[3] - (V ? 80 : 68)};
  tl.fromTo("#s1-finger", { x: grab.left + 60, y: grab.top + 90, opacity: 0, scale: 1 }, { x: grab.left, y: grab.top, opacity: 1, duration: 0.4, ease: "power3.out" }, 0.15);
  tl.to("#s1-finger", { scale: 0.85, duration: 0.08 }, 0.55);
  tl.to("#s1-finger", { x: drop.left, y: drop.top, duration: 0.7, ease: "power2.inOut" }, 0.67);
  tl.to("#s1-finger", { scale: 1, duration: 0.1 }, 1.37);
  tl.to("#s1-finger", { x: keepX, y: keepY, duration: 0.6, ease: "power2.inOut" }, 1.8);
  tl.to("#s1-finger", { scale: 0.82, duration: 0.08 }, 2.46);
  tl.to("#s1-finger", { scale: 1, opacity: 0, duration: 0.3 }, 2.6);
  // exit: window shrinks and blurs as the promise arrives
  tl.to("#s1-win", { scale: 0.92, opacity: 0, filter: "blur(12px)", duration: 0.3, ease: "power3.in" }, 2.78);
  out("#s1-cap2", 2.8);

  // ---- 2 · Promise (3.05 – 6.3) ----
  wordsIn("#s2-t1", 3.15, 0.07);
  wordsIn("#s2-t2", 3.75, 0.09);
  tl.fromTo("#s2-sub", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.35, ease: "power3.out" }, 4.55);
  out("#s2-t1", 6.05); out("#s2-t2", 6.08); out("#s2-sub", 6.1);

  // ---- 3 · Today (6.3 – 10.4) ----
  const tw = [${L.todayWin[2]}, ${L.todayWin[3]}];
  const t0 = cam(${JSON.stringify(TODAY0)}, tw[0], tw[1]), t1 = cam(${JSON.stringify(TODAY1)}, tw[0], tw[1]);
  tl.fromTo("#s3-win", { opacity: 0, y: 120, rotationX: 14, transformPerspective: 2200 }, { opacity: 1, y: 0, rotationX: 0, duration: 0.8, ease: "expo.out" }, 6.32);
  tl.fromTo("#s3-cam", { x: t0.x, y: t0.y, scale: t0.scale }, { x: t1.x, y: t1.y, scale: t1.scale, duration: 2.6, ease: "power2.inOut" }, 6.9);
  wordsIn("#s3-cap1", 6.45);
  out("#s3-cap1", 7.75);
  wordsIn("#s3-cap2", 7.95, 0.07);
  tl.to("#s3-win", { y: -${V ? 260 : 160}, opacity: 0, filter: "blur(14px)", duration: 0.3, ease: "power3.in" }, 10.12);
  out("#s3-cap2", 10.12);

  // ---- 4 · Capture (10.4 – 14.2) ----
  tl.fromTo("#s4-phone", { y: ${V ? 500 : 420}, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: "expo.out" }, 10.4);
  tl.fromTo("#s4-card", { y: 160, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.7, ease: "expo.out" }, 10.75);
  wordsIn("#s4-cap1", 10.5);
  tl.to(["#s4-phone", "#s4-card"], { opacity: 0, filter: "blur(12px)", y: -40, duration: 0.25, ease: "power2.in", stagger: 0.04 }, 13.92);
  out("#s4-cap1", 13.95);

  // ---- 5 · Agents (14.2 – 18.05) ----
  tl.fromTo("#s5-card", { y: 80, opacity: 0, scale: 0.96 }, { y: 0, opacity: 1, scale: 1, duration: 0.7, ease: "expo.out" }, 14.3);
  wordsIn("#s5-cap1", 14.35);
  out("#s5-cap1", 15.9);
  wordsIn("#s5-cap2", 16.08, 0.08);
  const ax = ${L.card[0] + 48 + 110}, ay = ${L.card[1] + 44 + 64 + 34 + 36 + (V ? 14 : 12)};
  tl.fromTo("#s5-finger", { x: ax + 80, y: ay + 120, opacity: 0, scale: 1 }, { x: ax, y: ay, opacity: 1, duration: 0.55, ease: "power3.out" }, 16.2);
  tl.to("#s5-finger", { scale: 0.82, duration: 0.08 }, 16.93);
  tl.to("#s5-approve", { scale: 0.94, duration: 0.08 }, 16.93);
  tl.to("#s5-approve", { scale: 1, duration: 0.22, ease: "power3.out" }, 17.01);
  tl.fromTo("#s5-ok", { opacity: 0 }, { opacity: 1, duration: 0.18 }, 17.0);
  tl.to("#s5-needs", { opacity: 0, scale: 0.9, duration: 0.2 }, 17.0);
  tl.to("#s5-finger", { opacity: 0, scale: 1, duration: 0.3 }, 17.15);
  tl.to("#s5-card", { scale: 0.9, opacity: 0, filter: "blur(12px)", duration: 0.3, ease: "power3.in" }, 17.75);
  out("#s5-cap2", 17.78);

  // ---- 6 · End card (18.05 – 23) ----
  tl.fromTo("#s6-icon", { scale: 0.6, opacity: 0, rotation: -8 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.9, ease: "expo.out" }, 18.05);
  tl.fromTo("#s6-word", { opacity: 0, filter: "blur(12px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.4, ease: "power3.out" }, 18.55);
  tl.fromTo("#s6-cta", { xPercent: -50, y: 30, opacity: 0 }, { xPercent: -50, y: 0, opacity: 1, duration: 0.6, ease: "expo.out" }, 20.19);
  tl.fromTo("#s6-url", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.35, ease: "power3.out" }, 20.55);
  tl.fromTo("#s6-fine", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out" }, 20.85);

  window.__timelines["brag"] = tl;
})();
</script>
</body>
</html>
`;
}

for (const fmt of ["landscape", "vertical"]) {
  mkdirSync(fmt, { recursive: true });
  writeFileSync(`${fmt}/index.html`, page(fmt));
}
console.log("ok");
