// node render.js <srcDir> <name> [9x16|1x1|both] [outDir]
// Renders frame-by-frame (30 fps) through Playwright and encodes with ffmpeg (H.264, yuv420p, no audio).
// Needs playwright (chromium), ffmpeg on PATH and Inter installed as a system font.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const FPS = 30;
async function renderOne(srcDir, name, fmt, outDir) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: fmt === '1x1' ? 1080 : 1920 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(srcDir, 'index.html') + '?fmt=' + fmt);
  await page.waitForFunction('window.ready === true');
  const n = Math.round((await page.evaluate('DUR')) * FPS);
  const out = path.join(outDir, `${name}_${fmt}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
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
  const [srcDir, name, which = 'both', outDir] = process.argv.slice(2);
  const fmts = which === 'both' ? ['9x16', '1x1'] : [which];
  await Promise.all(fmts.map(f => renderOne(path.resolve(srcDir), name, f, path.resolve(outDir || path.join(srcDir, '..')))));
})();
