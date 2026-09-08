# Never Roll a 1

A free dice game where you try to complete 10 rolls without hitting a 1. Under the fair-die model, each attempt has a roughly 16.15% chance of success. No wagers, purchases, or monetary prizes are involved.

## How to Play

1. Click **Start Game** to begin
2. Roll the die up to 10 times
3. If you roll a 1, you lose
4. Survive all 10 rolls to win
5. Consecutive wins build your **win streak**
6. Optionally sign in and choose a public display name to save scores. Subsequent wins are automatically submitted while signed in.

## Features

- **Win Streaks** — consecutive game wins tracked locally
- **Daily & All-Time Stats** — tap stat cards to cycle through views
- **Leaderboard** — daily and all-time rankings via Firebase (Google sign-in)
- **Share** — Wordle-style share text for your victories
- **Mobile-friendly** — responsive design with Tailwind CSS

## Tech Stack

- Vanilla HTML/CSS/JS (single `index.html`)
- [Tailwind CSS](https://tailwindcss.com/) compiled locally for production
- [Firebase](https://firebase.google.com/) (Auth + Firestore) for leaderboard

## Setup

### Local development and production build

Use Node.js 24 and npm:

```sh
npm ci
npm run build
npm test
python3 -m http.server 8080 --directory dist
```

Open `http://localhost:8080`. The build compiles all root HTML classes into `assets/styles.css` and copies only public pages/assets into `dist`. Generated CSS, `dist`, and `node_modules` are ignored by Git. Run the build again after editing HTML or Tailwind classes; do not use Tailwind's runtime CDN in production. The Node built-in test runner needs no additional testing dependency.

The core game continues working offline after its initial load. A fresh offline visit is not supported. Firebase, external reference links, and remote score saving require connectivity. If storage is blocked or corrupt, gameplay remains available with a visible persistence warning.

### With Leaderboard

1. Create a [Firebase project](https://console.firebase.google.com/)
2. Enable **Google sign-in** in Firebase Authentication
3. Create a **Firestore** database
4. Confirm that `firebaseConfig` in `index.html` belongs to your project and authorize your production and development domains in Authentication. Firebase browser configuration identifies the project; access control must come from deployed rules, not hiding that configuration.
5. Review and test `firestore.rules` and `firestore.indexes.json` against your existing data before deployment. With an authenticated Firebase CLI, explicitly select the intended project:

   ```sh
   firebase deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
   ```

6. Verify Google sign-in, score submission, daily/all-time rankings, and index readiness on the deployed site.

Daily statistics and leaderboard date keys use UTC. Legacy local-date statistics reset at the first UTC-based initialization; all-time totals are retained.

Rules restrict writes to the signed-in user's document IDs, validate score/name fields, require server timestamps, and accept only improved scores. Public leaderboard documents include the account-linked UID, display name, streak, attempts, submission time, and daily date where applicable. Private name records are readable only by their owner. Denied users are tracked through admin-managed `blockedUsers` records.

**Limitations:** These are client-reported scores, not verified gameplay. Rules cannot prove fair rolls or a genuine streak, and the submitted daily date is validated for format, not attested as the current UTC date. Do not attach prizes to these rankings. Netlify deployments do **not** deploy Firestore rules/indexes. The live Firebase configuration, rules, and existing records have not been verified here.

Before enabling a public leaderboard operationally, test that:

- Signed-out clients cannot write; a user cannot read another private name record or change another user's score.
- Malformed names, unexpected fields, non-integer scores, attempts below streak length, and client timestamps are rejected.
- Equal/worse scores cannot replace a personal best; valid new/improved scores succeed.
- A `blockedUsers/{uid}` document prevents subsequent profile/score writes and cannot be created, read, or removed by browser clients.
- Both leaderboard queries and all rank queries work once indexes finish building.

### Moderation and deletion operations

The Contact page and leaderboard expose a report route. Confirm that `contact@neverrollone.com` is monitored before relying on it; delivery and response times have not been verified.

1. Review a report using its display name, daily date/all-time tab, and details. Use the Firebase console to identify the account UID; names alone need not be unique.
2. For confirmed abuse, create an admin-only `blockedUsers/{uid}` record to prevent re-publication, then remove offending `dailyScores` and `allTimeScores` records. Review the private `users/{uid}` name record too. Disabling Firebase Authentication alone may not immediately invalidate an existing session, so retain the write block.
3. Review repeated abuse manually. These rules provide a write block, not automated content moderation or anti-cheat. If you cannot supervise the feature, disable its reads/writes through reviewed Firestore rules and remove its public UI before monetizing.
4. For a verified deletion request, remove the Firebase Authentication user, `users/{uid}`, `allTimeScores/{uid}`, and **all** `dailyScores` documents associated with that UID. Follow applicable retention duties when handling moderation records and backups; do not request passwords or sign-in tokens.
5. Signing out is not deletion. Browser statistics must be cleared separately on the user's device.

## Deployment

Configured for [Netlify](https://www.netlify.com/): `npm run build`, publishing `dist` only. The configuration redirects `www.neverrollone.com` to `neverrollone.com` and `/index.html` to `/`, and preserves `.html` URLs. Enable **Force HTTPS** and verify the primary domain and TLS certificate in Netlify; that account setting cannot be guaranteed by the repository.

Canonical links and the sitemap use `https://neverrollone.com`. Update them together if the primary domain changes. `404.html` is intended for Netlify's real 404 handling; do not add a catch-all rewrite to `index.html`.

## AdSense readiness: owner verification required

**Ad serving is deliberately disabled on every page.** There are no AdSense loaders, ad requests, manual ad slots, or homemade consent banners. The homepage retains only non-executing publisher-account metadata. This avoids treating a CSS visibility toggle as consent management. Removing ads does not itself guarantee approval.

`ads.txt` uses the publisher ID previously configured in the application. Compare its **entire entry** against the correct AdSense account before deployment; ownership/authorization was not independently verified.

Do not re-enable advertising until these checks are complete:

- [ ] Obtain the actual rejection notice and affected domain. Confirm this is AdSense publisher approval, not a Google Ads campaign disapproval.
- [ ] Verify every public page, canonical, sitemap, `robots.txt`, and `ads.txt` on the live primary domain. Test HTTP → HTTPS, www → primary, `/index.html` → `/`, and an unknown URL returning HTTP 404. Check for crawl-blocking hosting/firewall settings.
- [ ] Confirm publisher ownership and authorization in AdSense. `ads.txt` status and site approval are different checks.
- [ ] Verify the operator/contact information, monitor the mailbox, and establish moderation/deletion procedures. Review audience and children's-privacy obligations with appropriate advice; a general-audience label or age disclaimer alone is not compliance.
- [ ] Review privacy disclosures against actual Firebase, hosting logs, account-injected services, and retention settings. Obtain legal review where needed.
- [ ] Configure a Google-certified CMP where required, including applicable EEA, UK, and Switzerland traffic. The CMP must support valid consent signals and reopening/withdrawing choices. There is intentionally no pretend “privacy choices” button without a working provider.
- [ ] Test fresh visits, acceptance, rejection, withdrawal, and returning visits in applicable regions. Inspect actual storage and network requests. Do not assume non-personalized advertising avoids consent requirements.
- [ ] If serving ads later, add one loader per eligible page only through the verified consent integration. Use responsive in-flow units away from game controls; keep Contact, Privacy, Terms, and error pages ad-free. Verify Auto ads and page exclusions in the account. Do not restore the custom sticky banner.
- [ ] Test 320px/375px phone widths, desktop, keyboard-only navigation, reduced motion, modal focus, storage failures, unavailable Firebase, clipboard denial, and sessions spanning UTC midnight. With future ads enabled, verify no clipping, overlap, or accidental-click placement, including open modals.
- [ ] Review traffic sources for automated, incentivized, purchased, or otherwise invalid traffic. Never click live ads as a test.
- [ ] Resubmit only after meaningful fixes are deployed, following any review restrictions shown in the account. There is no guaranteed approval or arbitrary article/word-count target.

Live site, Google policy pages, and account-side configuration could not be checked from this implementation environment due to DNS/network restrictions. The following official references must be reviewed before enabling ads:

- [AdSense program policies](https://support.google.com/adsense/answer/48182)
- [Google Publisher Policies](https://support.google.com/publisherpolicies/answer/10502938)
- [Google EU user consent policy](https://www.google.com/about/company/user-consent-policy/)
- [AdSense ads.txt guidance](https://support.google.com/adsense/answer/7532444)

## License

The previous README described this project as MIT, but no license file is included. Confirm the intended license and add its actual terms before redistributing or granting rights; the build package is private and does not declare a new license grant.
