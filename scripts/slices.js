// playwright-cli run-code --filename=scripts/slices.js
// Screen-by-screen shots of the pages listed in SLICES (path:width,...), for close review.
async page => {
  const BASE = 'http://127.0.0.1:8788';
  const OUT = 'shots/slices'; // relative to where the playwright-cli session was opened
  const list = '__SLICES__';
  const done = [];
  for (const spec of list.split(',')) {
    const [p, w] = spec.split(':');
    const width = Number(w), height = width === 390 ? 844 : width === 768 ? 1024 : 900;
    await page.setViewportSize({ width, height });
    await page.goto(BASE + p, { waitUntil: 'networkidle' });
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 50)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(800);
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    const name = p === '/' ? 'home' : p.replace(/\//g, '');
    for (let i = 0, y = 0; y < total; i++, y += height) {
      await page.screenshot({ path: `${OUT}/${name}-${width}-${i}.png`, fullPage: true, clip: { x: 0, y, width, height: Math.min(height, total - y) } });
      done.push(`${name}-${width}-${i}`);
    }
  }
  return done.join(' ');
}
