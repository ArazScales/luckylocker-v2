# Handoff: what we need from Christine, and how to launch

## What we still need from Christine

Everything below is a placeholder on the sample site. Items 1 to 8 go into
`site.config.json`; the rest are copy edits in `src/pages/`.

| # | What | Where it shows |
| --- | --- | --- |
| 1 | Street address, city, state, ZIP | Home, Visit, footer, privacy policy, map, directions |
| 2 | Phone number | Tap-to-call buttons, footer, contact page |
| 3 | Opening hours for each day, and holiday changes | Hours tables, the live open/closed badge |
| 4 | Time zone (e.g. America/Chicago) | Open/closed badge |
| 5 | Facebook, Instagram and TikTok links (whichever she uses) | Footer, contact page |
| 6 | Two Formspree forms (messages and email list), or the address they should email | Contact form, email-list signup |
| 7 | Where her current email-list subscribers live (GoDaddy's list), so they can be moved | Email list |
| 8 | Her name as she wants it on the privacy policy | Privacy policy |
| 9 | Her story: how the shop started, how long it's been open, why the four-leaf clover | About |
| 10 | FAQ answers: donations (yes/no, what, when, receipts), payment methods, holds, returns, restock days, sales, online/shipping, parking, accessibility, holiday hours | FAQ, Visit ("Good to know") |
| 11 | When seasonal stock goes out for each season | Holiday & Seasonal |
| 12 | Photos: the shopfront, inside the shop, and real new arrivals (to replace the drawn samples) | New Arrivals, home |
| 13 | A check of the category examples ("Things that turn up") | What We Carry |
| 14 | Her logo, if she has one she wants to keep (the clover mark is a stand-in) | Header, footer, icons |
| 15 | A read of the privacy policy draft | Privacy |

## Launch checklist for theluckylocker.com (not done; for when she says yes)

1. **Move DNS to Cloudflare.** Add `theluckylocker.com` as a site in Cloudflare (free
   plan), check the imported DNS records against GoDaddy's (keep any email MX, SPF,
   DKIM and DMARC records exactly), then change the nameservers at GoDaddy to the two
   Cloudflare gives you. Wait for Cloudflare to show the zone as active.
2. **Attach the domain to the Pages project.** In Pages > luckylocker-v2 > Custom
   domains, add `theluckylocker.com` and `www.theluckylocker.com`; redirect `www` to
   the apex (or the other way round, one only).
3. **Build for launch.** Set `"preview": { "enabled": false }` in `site.config.json`
   (removes `noindex`, the sample strip and the `X-Robots-Tag` header, adds
   canonical URLs and the sitemap line in `robots.txt`), fill in every placeholder,
   then deploy to the production branch.
4. **Add CAA records** so only the certificate authorities Cloudflare uses can issue
   certificates for the domain, e.g. `0 issue "letsencrypt.org"`,
   `0 issue "pki.goog"`, `0 issue "ssl.com"`, `0 issue "digicert.com"`, plus
   `0 iodef "mailto:support@arazscales.com"`. Check Cloudflare's current list first.
5. **Turn on DNSSEC.** In Cloudflare: DNS > Settings > Enable DNSSEC, then add the DS
   record it shows at GoDaddy (Domain settings > DNSSEC).
6. **Lock the domain at GoDaddy.** Domain settings > turn on Domain lock (transfer
   lock). Keep auto-renew on and the contact email current.
7. **Have Christine turn on 2FA on her GoDaddy account** (an authenticator app, not
   SMS if she can), and on the Cloudflare account that will own the zone.
8. **After launch:** check the headers with `curl -I https://theluckylocker.com/`,
   submit the sitemap in Google Search Console, update the Google Business Profile
   website link, and, once HTTPS has run cleanly for a few weeks, consider
   submitting the domain at hstspreload.org (the header already asks for preload).
