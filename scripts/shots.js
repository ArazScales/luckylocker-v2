// playwright-cli run-code --filename=scripts/shots.js
// Full-page screenshots of every page at 390, 768 and 1440, plus every console
// message and CSP violation seen while loading. BASE and OUT come from env-free
// constants so the file stays a single page function.
async page => {
  const BASE = 'http://127.0.0.1:8788';
  const OUT = 'shots'; // relative to where the playwright-cli session was opened: open it from the repo root
  const pages = ['/', '/what-we-carry/', '/new-arrivals/', '/holiday/', '/visit/', '/about/', '/faq/', '/contact/', '/privacy/', '/does-not-exist/'];
  const widths = [390, 768, 1440];
  const log = [];
  page.on('console', (m) => log.push(`[${m.type()}] ${page.url()} ${m.text()}`));
  page.on('pageerror', (e) => log.push(`[pageerror] ${page.url()} ${e.message}`));
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : w === 768 ? 1024 : 900 });
    for (const p of pages) {
      await page.goto(BASE + p, { waitUntil: 'networkidle' });
      await page.evaluate(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
      // walk down the page so scroll-driven pieces settle, then back to top
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); });
      await page.waitForTimeout(900);
      const name = (p === '/' ? 'home' : p.replace(/\//g, '')) + `-${w}.png`;
      await page.screenshot({ path: `${OUT}/${name}`, fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) log.push(`[overflow] ${p} at ${w}: ${overflow}px`);
      const csp = await page.evaluate(() => window.__csp);
      for (const c of csp) log.push(`[csp] ${p} at ${w}: ${c}`);
    }
  }
  return log.join('\n') || 'no console messages';
}
