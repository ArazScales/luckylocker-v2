// playwright-cli run-code --filename=scripts/a11y-check.js
// Keyboard, focus, form, filter, map and reduced-motion checks against the local server.
async page => {
  const BASE = 'http://127.0.0.1:8788';
  const out = [];
  const csp = [];
  page.on('console', (m) => { if (m.type() === 'error' || /Content Security Policy/i.test(m.text())) csp.push(`${page.url()} ${m.text()}`); });
  const focused = () => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}${a.className ? '.' + String(a.className).split(' ')[0] : ''} "${(a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 30)}"` : 'none'; });

  // 1. skip link first, visible when focused; menu on a phone
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  out.push('first tab: ' + await focused());
  const skipVisible = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return r.top >= 0 && r.bottom > 0; });
  out.push('skip link on screen when focused: ' + skipVisible);
  await page.keyboard.press('Enter');
  out.push('after skip: ' + await focused());
  await page.keyboard.press('Shift+Tab');
  const toggle = page.locator('[data-menu-toggle]');
  await toggle.focus();
  await page.keyboard.press('Enter');
  out.push('menu expanded: ' + await toggle.getAttribute('aria-expanded') + ', focus: ' + await focused());
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  out.push('focus stays in menu after 12 tabs: ' + await page.evaluate(() => !!document.activeElement.closest('[data-menu], [data-menu-toggle]')));
  await page.keyboard.press('Escape');
  out.push('after Escape: expanded=' + await toggle.getAttribute('aria-expanded') + ', focus: ' + await focused());

  // 2. focus ring visible on a button
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  out.push('3rd tab at 1440: ' + await focused() + ' outline: ' + await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle + ' ' + getComputedStyle(document.activeElement).outlineWidth));

  // 3. empty form submit: errors, focus moves to the first bad field
  await page.goto(BASE + '/contact/', { waitUntil: 'networkidle' });
  await page.locator('form[data-form="contact"] button[type="submit"]').click();
  out.push('contact empty submit: focus ' + await focused() + '; errors: ' + JSON.stringify(await page.$$eval('form[data-form="contact"] .field__error:not([hidden])', (e) => e.map((x) => x.textContent))));
  await page.fill('#contact-name', 'Test Person');
  await page.fill('#contact-email', 'not-an-email');
  await page.fill('#contact-message', 'Hello there, is the lamp still in?');
  await page.locator('form[data-form="contact"] button[type="submit"]').click();
  out.push('bad email: ' + await page.textContent('#contact-email-error'));
  await page.fill('#contact-email', 'test@example.com');
  await page.locator('form[data-form="contact"] button[type="submit"]').click();
  out.push('valid submit (preview): ' + await page.textContent('form[data-form="contact"] [data-form-status]'));
  out.push('maxlength on inputs: ' + JSON.stringify(await page.$$eval('input:not([type=hidden]), textarea', (e) => e.map((x) => x.id + ':' + x.maxLength))));

  // 4. filters
  await page.goto(BASE + '/new-arrivals/?cat=vintage', { waitUntil: 'networkidle' });
  out.push('deep link vintage: ' + await page.locator('[data-arrivals] > li').count() + ' items, ' + await page.textContent('[data-arrivals-status]'));
  await page.locator('button[data-cat="books-dvds"]').click();
  out.push('filter books: ' + await page.locator('[data-arrivals] > li').count() + ' items, url ' + new URL(page.url()).search + ', pressed ' + await page.locator('button[data-cat="books-dvds"]').getAttribute('aria-pressed'));

  // 5. map facade: nothing from Google until the click
  await page.goto(BASE + '/visit/', { waitUntil: 'networkidle' });
  out.push('iframes before click: ' + await page.locator('iframe').count());
  await page.locator('[data-map] button').click();
  await page.waitForTimeout(2500);
  out.push('iframe after click: ' + await page.locator('iframe').count() + ' src ' + (await page.locator('iframe').getAttribute('src')).slice(0, 60));

  // 6. reduced motion: doors open at once, words all ink, no running animations
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  out.push('reduced motion: running animations ' + await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().duration > 1).length) +
    ', unlit words ' + await page.evaluate(() => document.querySelectorAll('.statement__text .w:not(.is-lit)').length) +
    ', door transform ' + await page.evaluate(() => getComputedStyle(document.querySelector('.locker--open .locker__door')).transform.slice(0, 24)));
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  out.push('console errors / CSP: ' + (csp.length ? csp.join(' | ') : 'none'));
  return out.join('\n');
}
