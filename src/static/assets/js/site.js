// The Lucky Locker: the site's only script. No dependencies, no third parties.
// Security rules kept here: data from JSON and the page is written with
// textContent / createElement only (never innerHTML), URLs are checked before
// use, and nothing is evaluated.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

/* ---------- menu ---------- */

function initMenu() {
  const toggle = $('[data-menu-toggle]');
  const menu = $('[data-menu]');
  const header = $('[data-header]');
  if (!toggle || !menu || !header) return;

  const setOpen = (open) => {
    if (open) {
      const bottom = Math.max(0, header.getBoundingClientRect().bottom);
      menu.style.setProperty('--menu-top', `${Math.round(bottom)}px`);
    }
    toggle.setAttribute('aria-expanded', String(open));
    $('.menu-toggle__label', toggle).textContent = open ? 'Close' : 'Menu';
    menu.hidden = !open;
    menu.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
    if (open) $('a', menu)?.focus();
  };

  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
  // Keep Tab inside the open menu (toggle + menu links).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || menu.hidden) return;
    const items = [toggle, ...$$('a, button', menu)];
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  window.matchMedia('(min-width: 1100px)').addEventListener('change', (m) => { if (m.matches) setOpen(false); });
}

/* ---------- hours and the open / closed badge ---------- */

const toMinutes = (hhmm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

function fmt(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 && h < 24 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

/** The current day (0 = Sunday) and minute of the day in the shop's own time zone. */
function shopNow(tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function initHours() {
  const table = $('[data-hours]');
  if (!table) return;
  let tz = table.dataset.tz;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { tz = undefined; }
  const sample = table.dataset.sample === 'true';

  const week = {};
  for (const row of $$('tr[data-day]', table)) {
    week[Number(row.dataset.day)] = { open: toMinutes(row.dataset.open), close: toMinutes(row.dataset.close) };
  }

  const update = () => {
    const { day, minutes } = shopNow(tz);
    for (const t of $$('[data-hours]')) {
      for (const row of $$('tr[data-day]', t)) row.classList.toggle('is-today', Number(row.dataset.day) === day);
    }

    const today = week[day];
    let state = 'closed';
    let text;
    if (today && today.open != null && minutes >= today.open && minutes < today.close) {
      const left = today.close - minutes;
      state = left <= 30 ? 'soon' : 'open';
      text = left <= 30 ? `Closing soon · ${fmt(today.close)}` : `Open now · until ${fmt(today.close)}`;
    } else if (today && today.open != null && minutes < today.open) {
      text = `Closed now · opens ${fmt(today.open)}`;
    } else {
      let next = null;
      for (let i = 1; i <= 7; i++) {
        const d = (day + i) % 7;
        if (week[d] && week[d].open != null) { next = { d, i }; break; }
      }
      text = next
        ? `Closed now · opens ${next.i === 1 ? 'tomorrow' : DAY_NAMES[next.d]} ${fmt(week[next.d].open)}`
        : 'Closed now';
    }

    const todayText = today && today.open != null ? `Today ${fmt(today.open)} – ${fmt(today.close)}` : 'Closed today';

    for (const badge of $$('[data-open-badge]')) {
      badge.dataset.state = state;
      const label = $('[data-open-text]', badge);
      label.textContent = text;
      const note = $('[data-open-note]', badge);
      if (note) note.textContent = sample ? '(sample hours)' : '';
      badge.hidden = false;
    }
    for (const t of $$('[data-today-hours]')) t.textContent = todayText;
  };

  update();
  setInterval(update, 60_000);
}

/* ---------- new arrivals ---------- */

const SAFE_IMAGE = /^\/assets\/img\/arrivals\/[a-z0-9][a-z0-9-]*\.(svg|png|jpe?g|webp)$/;
const TILES = ['tile--sky', 'tile--blush', 'tile--butter', 'tile--mint', 'tile--peach', 'tile--stone'];
const TEXT_MAX = 120;

const clean = (v, max = TEXT_MAX) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function loadArrivals() {
  const res = await fetch('/assets/data/new-arrivals.json', { headers: { Accept: 'application/json' }, cache: 'no-cache' });
  if (!res.ok) throw new Error(`arrivals: ${res.status}`);
  const data = await res.json();
  const categories = (Array.isArray(data.categories) ? data.categories : [])
    .map((c) => ({ id: clean(c.id, 40), label: clean(c.label, 40) }))
    .filter((c) => /^[a-z0-9-]+$/.test(c.id) && c.label);
  const known = new Set(categories.map((c) => c.id));
  const items = (Array.isArray(data.items) ? data.items : [])
    .map((it) => ({
      name: clean(it.name),
      category: clean(it.category, 40),
      price: clean(it.price, 24),
      note: clean(it.note),
      image: clean(it.image, 200),
      alt: clean(it.alt, 200),
      sample: it.sample === true,
    }))
    .filter((it) => it.name && known.has(it.category) && SAFE_IMAGE.test(it.image));
  return { updated: clean(data.updated, 10), categories, items };
}

function arrivalCard(item, labelOf, index) {
  const media = el('div', { class: `card__media ${TILES[index % TILES.length]}` },
    el('img', { src: item.image, alt: item.alt || item.name, width: 400, height: 400, loading: index < 4 ? 'eager' : 'lazy', decoding: 'async' }));
  const meta = el('div', { class: 'card__meta' },
    el('span', { class: 'card__price', text: item.price }),
    el('span', { class: 'card__cat', text: labelOf(item.category) }));
  const body = el('div', { class: 'card__body' },
    el('h3', { class: 'card__title', text: item.name }),
    item.note ? el('p', { class: 'card__text', text: item.note }) : null,
    meta);
  const card = el('article', { class: 'card' }, media, body);
  if (item.sample) card.prepend(el('span', { class: 'tag tag--ink card__badge', text: 'Sample' }));
  return card;
}

function renderGrid(grid, items, labelOf) {
  grid.replaceChildren(...items.map((it, i) => el('li', { class: 'arrivals-grid__item' }, arrivalCard(it, labelOf, i))));
}

async function initArrivals() {
  const grid = $('[data-arrivals]');
  if (!grid) return;
  const limit = Number(grid.dataset.limit) || 0;
  // The build pre-renders the cards from the same JSON (no layout shift, works
  // without JavaScript). A short list (home page) needs nothing more.
  if (limit && grid.children.length) return;
  const status = $('[data-arrivals-status]');
  let data;
  try {
    data = await loadArrivals();
  } catch {
    if (status) status.textContent = 'New arrivals could not load. Please refresh the page.';
    return;
  }
  const labelOf = (id) => data.categories.find((c) => c.id === id)?.label ?? id;

  const updated = $('[data-arrivals-updated]');
  if (updated && /^\d{4}-\d{2}-\d{2}$/.test(data.updated)) {
    const d = new Date(`${data.updated}T12:00:00Z`);
    updated.textContent = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    updated.setAttribute('datetime', data.updated);
  }

  if (limit) {
    renderGrid(grid, data.items.slice(0, limit), labelOf);
    return;
  }

  // Full page: category filters, deep-linkable as ?cat=vintage
  const filterBar = $('[data-filters]');
  const empty = $('[data-arrivals-empty]');
  const counts = Object.fromEntries(data.categories.map((c) => [c.id, data.items.filter((i) => i.category === c.id).length]));
  const options = [{ id: 'all', label: 'All', count: data.items.length }, ...data.categories.map((c) => ({ ...c, count: counts[c.id] }))];

  const params = new URLSearchParams(location.search);
  let current = options.some((o) => o.id === params.get('cat')) ? params.get('cat') : 'all';

  let buttons = $$('button[data-cat]', filterBar);
  if (!buttons.length) {
    buttons = options.map((o) =>
      el('button', { class: 'filter', type: 'button', 'data-cat': o.id, 'aria-pressed': String(o.id === current) },
        el('span', { text: o.label }),
        el('span', { class: 'filter__count', text: String(o.count) }),
        el('span', { class: 'sr-only', text: o.count === 1 ? ' item' : ' items' })));
    filterBar.replaceChildren(...buttons);
  }

  const apply = (push) => {
    const shown = current === 'all' ? data.items : data.items.filter((i) => i.category === current);
    renderGrid(grid, shown, labelOf);
    grid.classList.add('is-filtered');
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.cat === current));
    if (empty) empty.hidden = shown.length > 0;
    if (status) {
      const name = current === 'all' ? 'all categories' : labelOf(current);
      status.textContent = `Showing ${shown.length} ${shown.length === 1 ? 'item' : 'items'} in ${name}.`;
    }
    if (push) {
      const url = new URL(location.href);
      if (current === 'all') url.searchParams.delete('cat'); else url.searchParams.set('cat', current);
      history.replaceState(null, '', url);
    }
  };

  filterBar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cat]');
    if (!b || b.dataset.cat === current) return;
    current = b.dataset.cat;
    apply(true);
  });
  $('[data-show-all]')?.addEventListener('click', () => { current = 'all'; apply(true); buttons[0].focus(); });
  if (current !== 'all' || !grid.children.length) apply(false);
}

/* ---------- hero lockers: doors swing open once on load ---------- */

function initLockers() {
  const bank = $('[data-lockers]');
  if (!bank) return;
  requestAnimationFrame(() => requestAnimationFrame(() => bank.classList.add('is-entered')));
}

/* ---------- moment: words turn to ink as they cross the middle of the screen ---------- */

function initWordHighlight() {
  const block = $('[data-word-highlight]');
  if (!block) return;
  const text = $('.statement__text', block);
  const keys = new Set((block.dataset.keys || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));

  // Rebuild the sentence as word spans, text only.
  const source = text.textContent.replace(/\s+/g, ' ').trim();
  const frag = document.createDocumentFragment();
  source.split(' ').forEach((word, i) => {
    if (i) frag.append(' ');
    const bare = word.toLowerCase().replace(/[^a-z]/g, '');
    frag.append(el('span', { class: keys.has(bare) ? 'w w--key' : 'w', text: word }));
  });
  const words = el('span', { 'aria-hidden': 'true' });
  words.append(frag);
  text.replaceChildren(el('span', { class: 'sr-only', text: source }), words);
  block.classList.add('js-words');

  const wordEls = $$('.w', text);
  if (reduceMotion.matches) { wordEls.forEach((w) => w.classList.add('is-lit')); return; }

  let ticking = false;
  const update = () => {
    ticking = false;
    const line = window.innerHeight * 0.62;
    for (const w of wordEls) w.classList.toggle('is-lit', w.getBoundingClientRect().top < line);
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };

  const io = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) { window.addEventListener('scroll', onScroll, { passive: true }); update(); }
    else window.removeEventListener('scroll', onScroll);
  });
  io.observe(block);
}

/* ---------- what we carry: highlight the locker in view ---------- */

function initScrollSpy() {
  const index = $('[data-carry-index]');
  if (!index) return;
  const links = $$('a[href^="#"]', index);
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const setCurrent = (id) => {
    for (const [key, a] of byId) {
      const on = key === id;
      a.classList.toggle('is-current', on);
      if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
    }
  };
  const sections = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  if (!sections.length) return;
  let ticking = false;
  const update = () => {
    ticking = false;
    const line = window.innerHeight * 0.4;
    let current = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top <= line) current = s;
    setCurrent(current.id);
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

/* ---------- map: nothing loads from Google until asked ---------- */

function initMap() {
  for (const frame of $$('[data-map]')) {
    const button = $('button', frame);
    const src = frame.dataset.mapSrc || '';
    if (!button || !src.startsWith('https://www.google.com/maps')) continue;
    button.addEventListener('click', () => {
      const iframe = el('iframe', {
        src,
        title: frame.dataset.mapTitle || 'Map',
        loading: 'lazy',
        referrerpolicy: 'no-referrer',
        sandbox: 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox',
        allowfullscreen: true,
      });
      frame.replaceChildren(iframe);
      iframe.focus();
    });
  }
}

/* ---------- forms: validation, honeypot, Formspree over fetch ---------- */

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

function fieldError(field) {
  const input = $('input, textarea', field);
  const value = input.value.trim();
  const name = field.dataset.label || 'This field';
  if (input.required && !value) return `${name}: please fill this in.`;
  if (value && input.type === 'email' && !EMAIL.test(value)) return 'Email: type an address like name@example.com.';
  const min = Number(input.getAttribute('minlength') || 0);
  if (value && min && value.length < min) return `${name}: write at least ${min} characters.`;
  const max = Number(input.getAttribute('maxlength') || 0);
  if (max && value.length > max) return `${name}: keep it under ${max} characters.`;
  return '';
}

function showError(field, message) {
  const input = $('input, textarea', field);
  const out = $('.field__error', field);
  if (message) {
    field.setAttribute('data-invalid', '');
    input.setAttribute('aria-invalid', 'true');
    out.textContent = message;
    out.hidden = false;
  } else {
    field.removeAttribute('data-invalid');
    input.removeAttribute('aria-invalid');
    out.textContent = '';
    out.hidden = true;
  }
}

function initForms() {
  for (const form of $$('form[data-form]')) {
    const status = $('[data-form-status]', form);
    const submit = $('button[type="submit"]', form);
    const fields = $$('.field[data-label]', form);
    const live = form.dataset.live === 'true';
    const action = form.getAttribute('action') || '';
    const setStatus = (tone, msg) => { status.dataset.tone = tone; status.textContent = msg; };

    for (const f of fields) {
      $('input, textarea', f).addEventListener('blur', () => { if (f.hasAttribute('data-invalid')) showError(f, fieldError(f)); });
      $('input, textarea', f).addEventListener('input', () => { if (f.hasAttribute('data-invalid')) showError(f, fieldError(f)); });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      let firstBad = null;
      for (const f of fields) {
        const msg = fieldError(f);
        showError(f, msg);
        if (msg && !firstBad) firstBad = f;
      }
      if (firstBad) {
        setStatus('error', 'Please fix the highlighted field.');
        $('input, textarea', firstBad).focus();
        return;
      }
      // Honeypot filled in: act as if sent, send nothing.
      const trap = $('input[name="_gotcha"]', form);
      if (trap && trap.value) { form.reset(); setStatus('ok', form.dataset.sent); return; }

      if (!live || !action.startsWith('https://formspree.io/f/')) {
        setStatus('info', 'This is a preview, so nothing was sent. The form goes live once the shop’s Formspree address is added.');
        return;
      }

      submit.setAttribute('aria-busy', 'true');
      submit.disabled = true;
      setStatus('info', 'Sending…');
      try {
        const res = await fetch(action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
        form.reset();
        setStatus('ok', form.dataset.sent);
      } catch {
        setStatus('error', 'That didn’t send. Please try again in a minute, or call the shop.');
      } finally {
        submit.removeAttribute('aria-busy');
        submit.disabled = false;
      }
    });
  }
}

/* ---------- start ---------- */

initMenu();
initHours();
initLockers();
initWordHighlight();
initScrollSpy();
initMap();
initForms();
initArrivals();
