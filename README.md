# The Lucky Locker website, v2

A free sample website for The Lucky Locker, a thrift store ("Lucky Finds Lovely
Prices"), made by ARAZ Scales. Plain HTML, CSS and JavaScript, built by a small
Node script with no runtime dependencies, hosted on Cloudflare Pages.

v1 lives in a separate repo (`ArazScales/luckylocker-site`) and is untouched, so the
two can be compared.

- **Preview:** https://preview.luckylocker-v2.pages.dev. It is kept out of search
  engines with `noindex` and shows a thin "sample website" strip.
- **Not connected to theluckylocker.com.** The domain and its DNS have not been
  touched. See [docs/HANDOFF.md](docs/HANDOFF.md) for the launch checklist.

## Pages

| URL | Source | What it is |
| --- | --- | --- |
| `/` | `src/pages/index.html` | Home: locker hero, visit block, categories, new arrivals, email list |
| `/what-we-carry/` | `what-we-carry.html` | A section per category, with a sticky locker index |
| `/new-arrivals/` | `new-arrivals.html` | Grid from `new-arrivals.json`, with category filters |
| `/holiday/` | `holiday.html` | Holiday and seasonal decor, by season |
| `/visit/` | `visit.html` | Hours with a live open/closed badge, map, directions, tap-to-call |
| `/about/` | `about.html` | Placeholder story in Christine's voice |
| `/faq/` | `faq.html` | Donations, payment, holds and more (answers are TODO) |
| `/contact/` | `contact.html` | Contact form and email-list signup |
| `/privacy/` | `privacy.html` | Privacy policy (we collect emails) |
| any other | `404.html` | "This locker is empty" |

## Change the shop's details

Everything the site says about the business is in **`site.config.json`**:
address, phone, time zone, hours, social links and form endpoints. Anything still
marked `"placeholder": true` shows on the site with a dashed orange underline and a
TODO tag.

```bash
grep -n '"placeholder": true' site.config.json
```

Change a value, set its `placeholder` to `false`, then `npm run build`.

## Add a new arrival

Edit **`src/static/assets/data/new-arrivals.json`**. Copy an item, change it, save,
build. Fields: `name`, `category` (one of the category ids at the top of the file),
`price` (any text, e.g. `"$8"` or `"3 for $5"`), `note`, `image` (a file in
`src/static/assets/img/arrivals/`), `alt` (what the picture shows) and `sample`
(set `false` or remove it on real items; `true` shows the "Sample" tag). Update
`updated` (YYYY-MM-DD).

The build renders the cards into the page (fast, no layout shift, works without
JavaScript). The page script re-renders them with `createElement`/`textContent`
when a category filter is used. `/new-arrivals/?cat=vintage` links straight to one
category. The first four items also show on the home page.

## Forms

Both forms post to [Formspree](https://formspree.io): create two forms there (one
for messages, one for the email list) and put their endpoints in `forms` in
`site.config.json`, with `"placeholder": false`. Until then, submitting shows a
"this is a preview" message and sends nothing. Each form has a hidden `_gotcha`
honeypot, length limits and client-side validation with an error under each field.

## Commands

Node 22 or newer.

```bash
npm ci                 # installs wrangler (dev only; nothing ships to the browser)
npm run build          # builds dist/ (preview: noindex + sample strip)
npm run build:launch   # builds dist/ for the real domain (indexable, no strip)
npm run serve          # http://127.0.0.1:8788, applies _headers so the CSP is enforced locally
npm run deploy         # builds and uploads dist/ to Cloudflare Pages (preview branch)
npm audit              # dependency check (dev dependencies only)
```

Checks used during the build of this site (need the local server running):

```bash
playwright-cli run-code --filename=scripts/shots.js       # full-page shots at 390, 768, 1440 into shots/
playwright-cli run-code --filename=scripts/a11y-check.js  # keyboard, forms, filters, map, reduced motion, console
```

## Security

- `src/static/_headers` sets the CSP and the other security headers on every
  response. The CSP allows only this site's own scripts, styles, fonts and images,
  Formspree for the forms, and a Google Maps frame.
- No third-party JavaScript, no CDNs, no analytics, no web fonts from Google.
  Figtree is self-hosted as one variable `woff2` (SIL Open Font License,
  `assets/fonts/OFL.txt`).
- No inline `<script>`, no `style=""` attributes, no `on*=` handlers. The build
  refuses to output a page that has any of them.
- Data from JSON and the config is written with `textContent`/`createElement` in
  the browser, or HTML-escaped by the build. Image paths are checked against
  `/assets/img/arrivals/`.
- The Google map only loads when someone presses "Show the map".
- No email addresses in the HTML. `/.well-known/security.txt` points to
  support@arazscales.com.
- External links carry `rel="noopener noreferrer"`.

## Files

```
build.mjs              the build (zero dependencies)
site.config.json       every fact about the shop
src/pages/             one file per page
src/partials/          layout (head, header, footer) and the email-list band
src/static/            copied as-is: assets, _headers, .well-known, icons
scripts/serve.mjs      local server that applies _headers
scripts/shots.js       screenshot pass (playwright-cli)
scripts/a11y-check.js  behaviour and accessibility checks (playwright-cli)
docs/HANDOFF.md        what we still need from Christine, and the launch checklist
```
