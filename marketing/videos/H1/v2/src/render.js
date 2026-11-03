// node render.js [9x16|1x1|both] [outDir]  — renders frame-by-frame (30 fps) via Playwright, encodes with ffmpeg.
// Requires playwright (chromium) and ffmpeg on PATH, Inter installed as a system font.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const FPS = 30;
async function renderOne(fmt, outDir, opt = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: fmt === '1x1' ? 1080 : 1920 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'index.html') + '?fmt=' + fmt);
  await page.waitForFunction('window.ready === true');
  const dur = await page.evaluate('DUR');
  const n = Math.round(dur * FPS);
  const out = path.join(outDir, `H1-v2_${fmt}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = opt.only || null;
  for (let i = 0; i < n; i++) {
    await page.evaluate(`seek(${i / FPS})`);
    const buf = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log('wrote', out);
}
(async () => {
  const which = process.argv[2] || 'both', outDir = path.resolve(process.argv[3] || '..');
  const fmts = which === 'both' ? ['9x16', '1x1'] : [which];
  await Promise.all(fmts.map(f => renderOne(f, outDir)));
})();
