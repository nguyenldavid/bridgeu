# BridgeU Website Rebuild: Implementation Plan

Moving the BridgeU marketing and opportunities site off Notion/Super and onto a fast static **Astro + React** site, hosted on **Cloudflare Pages**.

**Goals**
1. **Fast.** Static HTML with very little JavaScript. Target 95+ on Lighthouse and LCP under 1.5s on a mid-range phone.
2. **Clear filters** for Research and Volunteering opportunities. Filter state lives in the URL so filtered views can be shared.
3. **Clear calls to action for the app** (`https://app.bridgeu.ca`) on every page, with tracking for each placement.
4. **Easy to maintain.** Content comes from the Notion data through a repeatable import script, not from hand-edited HTML.

---

## 0. Decisions (confirmed 2026-10-27)

| Topic | Decision |
|---|---|
| Unclear or stale content (`MNBGF` category, suspended/stale listings, the `researchers` lab-posting row, med-school videos) | **Include it in the site for now.** Nothing is dropped at import. Inactive listings show behind a "Show inactive" toggle. `MNBGF` shows as its own category until it's renamed |
| App deep links | **The app accepts parameters like `city`**, so CTAs are contextual (§6) |
| Careers | Stub page only. No Careers database |
| Live site | `https://bridgeu.ca` (Super, hosted on Vercel; DNS at Porkbun). Its sitemap (745 URLs) drives the redirect map (§8.5) |
| Videos | The 3 clips are ~1-minute vertical 1080×1920 videos. Transcode them to 720×1280 H.264 MP4 (each well under the 25 MiB limit) and host them **in the Pages deploy itself**. No Stream or YouTube needed |
| App param format | `city=Kingston` (display name, capitalized) |
| Research deadlines | **Not on the site.** Deadlines live in the app, so research pages send users there ("See deadlines & get reminders"). §4.3's deadline parsing and the deadline filters in §5.2 are dropped |
| Editing going forward | **No more Notion.** The import is a one-time migration. Content is Markdown in Git, so a Git-based CMS (Sveltia/Decap, Keystatic, TinaCMS) can be added on top; the CMS is not chosen yet. §8.4's Notion API loader is dropped |
| DNS | Approved to move `bridgeu.ca` nameservers to Cloudflare |

### Build status (2026-10-27)

Built in `site/`; see `site/README.md`. Deviations from the plan below:
- Routes: `/opportunities/<city>/<org>/<slug>` and `/organizations/<city>/<slug>` (the city segment avoids clashes such as "Big Brothers Big Sisters" existing in both cities).
- Redirects: the old site had its London sections swapped (`/londonopps/*` were org pages). The generator handles this. 609 URLs map to specific pages, and 89 sitemap URLs were already 404 on the live site.
- Research fields in `scripts/overrides/research.yaml` are a first pass by Claude and need a quick review by the team.
- Listing pages ship ~74 KB gzipped JS (React 66 KB). That's slightly over the 70 KB budget; switch to `preact/compat` if needed.

---

## 1. What's in the export

Source: `BridgeU/` (Notion HTML + CSV export, about 1,400 files, 503 MB).

### 1.1 Content databases (these drive the site)

| Notion DB | CSV rows | Becomes | Key fields |
|---|---|---|---|
| `rsrch` | 51 | **Research opportunities** | Name, Location (city), Level of education, Type, University-specific?, super:Link, Display image, Details (eligibility), Misc notes (has the real deadlines), page body |
| `kingstonopps` | 224 | **Volunteer opportunities** (Kingston) | Name, Category (multi), Related organization, URL, Logo, Notes or Description, page body (position description + "How do I sign up?") |
| `londonopps` | 122 | **Volunteer opportunities** (London) | same schema as kingstonopps |
| `kingstonorgs` | 95 | **Organizations** (Kingston) | Name, Category, Description, Location, Logo, URL, Opportunities status, Related opportunities |
| `londonorgs` | 100 | **Organizations** (London) | same as kingstonorgs (minus formatting flags) |
| `Blog posts database` | 14 | **Blog** | Title, Date published, Tags, Written by, page body + images |
| `Medical School Application Advice database` | 4 | **Med school advice** (blog category) | Title, Tags, Written by, page body, **3 videos of 112 to 129 MB each** |
| `Team database` | 17 | **About → Team** | Name, Image, Role, Link |
| `researchers` | 1 | **Research opportunities** (`kind: lab-position`) | "PathAI Lab · Research Assistant · Remote". Merged into the research collection with a "Lab position" badge |

### 1.2 Site pages

| Notion page | New route | Notes |
|---|---|---|
| BridgeU (home) | `/` | Hero ("Bridging the gap to meaningful opportunities near you"), partner logos (Queen's, Western, DDQIC, Microsoft, Webstraw), 3 value props, "Discover opportunities" → app |
| Research | `/research` | Filterable research list |
| Awards | (redirect → `/research`) | **Duplicate** of the Research page (same copy, same `rsrch` DB). Merge them |
| Volunteering | `/volunteering` | City picker → filterable list |
| London/Kingston Volunteering | `/volunteering/[city]` | Landing pages that were just "Opportunities / Organizations" link cards. Fold into the filter page |
| London/Kingston Opportunities | `/volunteering?city=…` | Replaced by the filter UI |
| London/Kingston Organizations | `/organizations` (+ `?city=`) | Org directory |
| Kingston/London Database | (not published) | Internal admin views |
| Blog | `/blog`, `/blog/[slug]` | |
| Medical School Application Advice | `/blog/category/med-school` or `/med-school-advice` | |
| About Us | `/about` | Includes team grid |
| FAQ | `/faq` | Use `<details>` accordions + FAQPage JSON-LD |
| Contact | `/contact` | Links out to `bridgeu-feedback.paperform.co`, `hello@bridgeu.ca` |
| Make a post | `/submit` | Links out to `bridgeu.paperform.co` |
| Subscribe | (redirect → app) | The page already says "subscribe by registering in our app", so it becomes an app CTA |
| Careers | `/careers` | Stub page ("Join our team at BridgeU.") plus a contact link. No database |

### 1.3 Data quality issues the import must handle

- **Research deadlines aren't structured.** `Typical due date` is filled in for only 2 of 51 rows. The real deadlines sit in free text in `Miscellaneous notes (TO REMOVE)`, e.g. `"January 12, 2025"`, `"Tuesday, February 25, 2025, at 11:55 pm EST"`, `"Temporarily paused"`, `"No updated deadline for 2024/25"`, `"DEAD LINK: …"`. They need parsing plus **manual review** (see §4.3).
- **Research fields barely vary.** `Level of education` = Undergraduate (51/51), `Type` = Summer Studentship (50/51). Neither works as a filter yet. A **Field/Discipline** tag needs to be added (§4.3).
- **Research location mixes cities and "Canada"** (Toronto 25, Canada 13, Vancouver, Kingston, Hamilton, Ottawa, Edmonton, Montreal, Brampton, Markham, Barrie). Derive a `province` field and an `isNational` flag.
- **Category taxonomy is inconsistent** across the four volunteering DBs: `Miscellaneous,Poverty Relief` (no space), both `Disability` and `Accessibility`, `Child Care` vs youth programs, and an unexplained code `MNBGF`. Normalize to one controlled list (§4.2).
- **Status is buried in names**, e.g. `Visiting Hospice (Currently Suspended)`. Pull it into a `status` field.
- **Org-level status** (`Opportunities status`): "Updated/extracted within last week", "Scoped (join by contact only)", "Scoped (not accepting)", "Stale", etc. Map these to public statuses: `accepting` / `contact-to-join` / `not-accepting`.
- **Opportunity `Location` is empty** for 119 of 224 Kingston rows. Derive it from the source DB (city), and keep `Online`/`Abroad` where they're set.
- **The `Logo` column in opps CSVs uses expired Notion S3 URLs** (`s3-us-west-2.amazonaws.com/secure.notion-static.com/…`). Use the **local files** referenced in each detail page's HTML instead.
- **Some research `Display image`s are hotlinked** to third-party sites (Wikimedia, canheart.ca, etc.). Download them at import time and self-host.
- **Names and slugs collide:** many opps are called "General Volunteer"; there are 3 blog posts titled "February Research Opportunities"; there's a duplicate "Children's Aid Society" org; "Community Living Kingston" vs "…District". Slugs = `org-slug/opp-slug`, blog slugs get the date, orgs get deduplicated.
- **3 research folders have truncated names and are empty** (UofT LMP, UofT St George, Women's College). Check that those rows still render from the CSV.
- **Internal-only columns must never ship:** `Created by`, `Last edited by`, `Upload status`, `Done Formatting?`, `Extracted Opportunities?`, `(TEMP: …)`, `(TO REMOVE)`.
- **Two identical rsrch CSVs** (`rsrch …csv` and `rsrch …_rsrch …csv`). Use one.
- **The 3 med-school videos (112 to 129 MB each, ~1 min, 1080×1920) exceed Cloudflare Pages' 25 MiB per-file limit as exported.** Transcode them once with ffmpeg (§8.2) and commit the MP4s plus poster frames.
- **Blog images run up to 7.1 MB.** The build image pipeline will compress them.
- **Some blog dates are in the future** (e.g. "September 23, 2026"). Fine, but check them against `Visibility = Published`.

---

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Astro 5** (`output: 'static'`) | Ships zero JS by default. Every page is pre-rendered HTML |
| Interactivity | **React 19 islands** (`@astrojs/react`) for filters only | JS loads only where it's needed. Optionally alias to `preact/compat` later to save around 40 KB |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`) | Small CSS output and fast to iterate on |
| Content | **Astro Content Collections** + Zod schemas | Typed, validated data. The build fails on bad content |
| Import | `scripts/import-notion.ts` (Node + `csv-parse` + `cheerio` + `turndown`) | Turns the export into clean JSON/Markdown |
| Search | **MiniSearch** (client-side) over a pre-built index | About 350 records is small enough to search fully in the browser |
| Images | `astro:assets` (`<Image>`/`<Picture>`, sharp) | AVIF/WebP, responsive sizes, lazy-loading |
| Fonts | Self-hosted Inter via `@fontsource-variable/inter` | Matches the current Notion look with no third-party font request |
| Icons | `astro-icon` or inline SVG (Lucide) | No icon font |
| Analytics | Cloudflare Web Analytics, plus UTM on app links | No cookies and free |
| SEO | `@astrojs/sitemap`, JSON-LD, OG images | |
| Quality | TypeScript strict, ESLint, Prettier, Playwright smoke tests, Lighthouse CI | |
| Hosting | **Cloudflare Pages** (Git integration) | Preview deploys per branch |

---

## 3. Project structure

```
bridgeu-site/
├─ astro.config.mjs
├─ package.json
├─ public/
│  ├─ _headers              # cache + security headers (Cloudflare)
│  ├─ _redirects            # old Notion/Super URLs → new routes
│  ├─ favicon.svg
│  └─ robots.txt
├─ scripts/
│  ├─ import-notion.ts      # export → src/content/** (idempotent)
│  ├─ lib/{csv,html,slug,categories,deadlines,images}.ts
│  └─ overrides/            # hand-maintained corrections (survive re-imports)
│     ├─ research-deadlines.yaml
│     ├─ research-fields.yaml
│     └─ org-merges.yaml
├─ src/
│  ├─ content.config.ts     # collection schemas (Zod)
│  ├─ content/
│  │  ├─ research/*.md      # frontmatter + body
│  │  ├─ opportunities/*.md
│  │  ├─ organizations/*.md
│  │  ├─ blog/*.md
│  │  └─ team.json
│  ├─ assets/               # imported images (optimized at build)
│  ├─ lib/
│  │  ├─ app-link.ts        # appUrl(placement, params) → UTM'd app.bridgeu.ca link
│  │  ├─ taxonomy.ts        # categories, cities, statuses (single source of truth)
│  │  └─ deadlines.ts       # status calculation (open / closing soon / closed)
│  ├─ components/
│  │  ├─ AppCTA.astro       # all app CTAs go through this
│  │  ├─ Header.astro / Footer.astro / MobileCTABar.astro
│  │  ├─ OpportunityCard.astro
│  │  ├─ ResearchCard.astro
│  │  ├─ OrgCard.astro
│  │  └─ filters/           # React islands
│  │     ├─ FilterableList.tsx
│  │     ├─ FilterSidebar.tsx / FilterDrawer.tsx (mobile)
│  │     ├─ FacetGroup.tsx  # checkbox group with counts
│  │     ├─ ActiveFilterChips.tsx
│  │     ├─ SearchBox.tsx
│  │     └─ useUrlFilters.ts
│  ├─ layouts/Base.astro
│  └─ pages/
│     ├─ index.astro
│     ├─ research/index.astro
│     ├─ research/[slug].astro
│     ├─ volunteering/index.astro
│     ├─ volunteering/[city]/index.astro          # SEO landing (pre-filtered)
│     ├─ volunteering/[city]/[category].astro     # SEO landing, e.g. /volunteering/kingston/healthcare
│     ├─ opportunities/[org]/[slug].astro         # volunteer opp detail
│     ├─ organizations/index.astro
│     ├─ organizations/[slug].astro
│     ├─ blog/index.astro, blog/[slug].astro
│     ├─ about.astro, faq.astro, contact.astro, submit.astro, careers.astro
│     ├─ 404.astro
│     └─ data/{research,volunteering}.json.ts     # static JSON endpoints for filter islands
└─ tests/ (playwright)
```

Keep the raw export **outside** the repo, or in a git-ignored `export/` folder. Only the normalized `src/content` output gets committed, so content changes show up in PRs as readable diffs.

---

## 4. Data model and import pipeline

### 4.1 Collection schemas (`src/content.config.ts`)

```ts
research: {
  title: string
  slug: string
  institution?: string            // derived/curated (e.g. "SickKids", "UofT")
  city: string | null              // "Toronto" | null when national
  province: 'ON'|'BC'|'AB'|'QC'|…|null
  isNational: boolean              // Location == "Canada"
  fields: Field[]                  // NEW: curated discipline tags (§4.3)
  term: 'summer'|'fall'|'fall-summer'
  educationLevel: ('undergraduate'|'graduate'|'medical'|'high-school')[]
  eligibility: 'open'|'university-specific'
  eligibleUniversities?: string[]  // when university-specific
  funded?: boolean                 // stipend/award: optional, curated
  deadline?: ISODate               // next/most recent deadline
  deadlineNote?: string            // "Funding application Jan 24; otherwise May 5"
  deadlineStatus: 'open'|'closing-soon'|'upcoming'|'closed'|'rolling'|'paused'|'unknown' // computed at build
  applyUrl: url
  logo?: image
  summary: string                  // first ~200 chars of eligibility/body
  updatedAt: ISODate               // Notion "Last edited time"
  body: markdown                   // eligibility + details
}

opportunity: {
  title, slug, orgSlug           // org reference
  city: 'kingston'|'london'
  mode: 'in-person'|'online'|'hybrid'|'abroad'
  categories: Category[]           // normalized taxonomy
  status: 'accepting'|'contact-to-join'|'suspended'|'not-accepting'
  applyUrl?: url
  contact?: { email?, phone? }     // parsed from "How do I sign up?"
  summary: string
  updatedAt: ISODate
  body: markdown
}

organization: {
  name, slug, city, categories, description, website, logo,
  status: 'accepting'|'contact-to-join'|'not-accepting'|'stale'
  opportunityCount: number         // computed
}

blog: { title, slug, date, tags[], authors[], cover?, section: 'blog'|'med-school', draft: boolean }
team: { name, role, photo, link }
```

### 4.2 Cause taxonomy for volunteering (normalized)

One controlled list in `src/lib/taxonomy.ts`. Each raw Notion value maps to exactly one entry. The import **fails** on any value it hasn't seen before, so nothing slips through silently.

| Public category | Raw Notion values mapped |
|---|---|
| Healthcare | Healthcare |
| Mental Health | Mental Health |
| Education & Tutoring | Education |
| Children & Youth | Child Care |
| Seniors | Senior Care |
| Poverty Relief | Poverty Relief |
| Food Security | Food Insecurity |
| Housing | Housing |
| Accessibility & Disability | Accessibility, Disability |
| Arts & Culture | Arts |
| Animals | Animals |
| Environment | Environment, Clean Water & Sanitation, Responsible Consumption & Production |
| Justice & Equity | Peace & Justice, Anti-Racial Discrimination |
| Gender Equality | Gender Equality, Menstrual Equity |
| 2SLGBTQ+ | LGBTQ+ Advocacy |
| Substance Use | Substance Management |
| Global Development | Global Development |
| Employment | Employment |
| Government & Public Service | Government (Municipal/Provincial/Federal) |
| Other | Miscellaneous |
| MNBGF | MNBGF (kept as-is for now, §0; rename later in `taxonomy.ts`) |

### 4.3 Research enrichment (needs a short manual curation pass)

The research data has too little structure for useful filters. Add curated fields through `scripts/overrides/*.yaml`, which the import merges over the CSV data so corrections survive re-imports:

- **`deadline` / `deadlineNote`**: parse the Misc-notes column automatically (regex over month names, plus `chrono-node`), then a person reviews all 51. About 1 to 2 hours.
- **`fields`** (discipline). Suggested list: Neuroscience, Cancer/Oncology, Cardiovascular, Infectious Disease & Immunology, Genetics & Molecular Biology, Pediatrics & Child Health, Women's Health, Mental Health & Psychiatry, Public Health & Epidemiology, Biomedical Engineering/Physics, Nutrition, Transplant & Organ Systems, AI/Data Science in Health, Environment & Urban, General/Multidisciplinary. About 1 hour to tag.
- **`eligibleUniversities`** for the 6 "Yes" university-specific rows.
- **`funded`**: most are paid studentships. Confirm per program.
- Flag rows with "DEAD LINK" or "Temporarily paused" → `deadlineStatus: 'paused'`, or hide them.

**Deadline status is computed at build time** (relative to the build date): `open` (deadline ≥ today), `closing-soon` (≤ 21 days away), `upcoming` (recurring annual program whose last deadline passed and should reopen; shown as "Typically opens ~January"), `closed`, `rolling`, `paused`, `unknown`. A daily scheduled rebuild (§8.4) keeps these current.

### 4.4 Import script steps (`npm run import -- --src ../BridgeU`)

1. Read each CSV with `csv-parse` (BOM-aware, multi-line quoted cells).
2. For each row, find the matching detail HTML (via the relative links in the CSV, which carry the Notion ID) and load it with **cheerio**:
   - Take only `.page-body` (skip the property table and the boilerplate "See a mistake or have any feedback?" footer, which becomes a shared component).
   - Convert to Markdown with **turndown** (GFM tables plugin).
   - Rewrite image `src` → copy into `src/assets/<collection>/<slug>/` and use relative imports.
   - Pull out `mailto:` and `tel:`/phone numbers from the "How do I sign up?" section into `contact`.
3. Normalize categories, city, status. Generate stable slugs (`@sindresorhus/slugify`). Dedupe orgs using `org-merges.yaml`.
4. Resolve relations: opp → org (by Notion ID in the `Related organization` link), org → opps.
5. Merge overrides YAML.
6. Remove internal columns. Write `.md` files with frontmatter (sorted keys, so diffs stay stable).
7. Print a **report**: counts per collection, unmapped categories, missing logos, missing apply URLs, unparsed deadlines, slug collisions. Exit non-zero if there are blocking errors.

---

## 5. Filtering UX (the core feature)

### 5.1 Architecture

- Each listing page (`/research`, `/volunteering`, `/organizations`) is **pre-rendered as full HTML**: every card in the default sort order. Search engines and no-JS users get the complete list, and the first paint needs no JS.
- A React island, `<FilterableList client:idle>`, hydrates on top. It gets a **compact JSON payload** (id, title, org, facets, deadline, summary of about 120 chars, logo URL) inlined as a prop or fetched from `/data/*.json`. Estimated size is under 40 KB gzipped for all ~350 volunteer opps.
- Filtering is pure client-side array filtering (instant, no network). Facet counts are recalculated on every change.
- **URL is the source of truth:** `?city=kingston&cause=healthcare,mental-health&status=accepting&q=hospice&sort=newest`. Shareable, bookmarkable, and back-button friendly (`history.replaceState`, debounced for search).
- Pre-rendered **SEO landing pages** for each city × category combination with results (e.g. `/volunteering/kingston/animals`) use the same island with preset filters, a unique `<title>`/H1/intro, and a canonical URL.

### 5.2 Research filters

| Filter | Control | Values |
|---|---|---|
| Search | text box | title, institution, field, body keywords |
| **Deadline status** | segmented chips | Open now · Closing soon · Opening soon · All (default: hide `closed`/`paused`) |
| **Deadline month** | multi-select | Jan–Dec (most programs close Jan to Mar) |
| **Location** | grouped checkboxes | Canada-wide · Ontario (Toronto, Hamilton, Kingston, Ottawa, Brampton, Markham, Barrie) · BC (Vancouver) · AB (Edmonton) · QC (Montreal) |
| **Field** | checkboxes with counts | curated list (§4.3) |
| **Eligibility** | radio | Open to all students · University-specific (with sub-list) |
| **Term** | checkboxes | Summer · Fall |
| Funded | toggle | Paid/funded only |
| **Sort** | select | Deadline (soonest), Recently updated, A–Z |

Cards show the logo, title, institution, a city badge, a **deadline badge** ("Closes Jan 24" in amber when closing soon, "Typically opens Jan", or "Closed"), field tags, and "Apply on site ↗".

### 5.3 Volunteering filters

| Filter | Control | Values |
|---|---|---|
| Search | text box | title, org name, description |
| **City** | prominent tabs at top | All · Kingston (224) · London (122) · Online |
| **Cause** | checkboxes with counts, top 8 shown + "Show more" | normalized taxonomy (§4.2) |
| **Availability** | chips | Accepting now · Contact to join · (hide suspended/not-accepting by default, "Show inactive" toggle) |
| **Mode** | chips | In-person · Online |
| **Organization** | searchable combobox | ~190 orgs |
| **Sort** | select | Recently updated, A–Z, Organization |

Possible later facets (need new data): *Time commitment*, *Minimum age* (highly relevant to high-school students), *Good for: pre-med / pre-health* (Healthcare tags overlap with research users).

### 5.4 Filter UI behaviour

- **Desktop:** sticky left sidebar with the facets, results grid on the right, and a result count plus active-filter chips above the grid ("Kingston ✕", "Healthcare ✕", "Clear all").
- **Mobile:** a "Filters (3)" button opens a full-height drawer, and a "Show 42 results" button applies and closes it. The city tabs stay visible outside the drawer.
- Facet options show live counts, and options with zero results are disabled (not hidden), so users don't get stuck.
- **Empty state:** "No matches. Try removing a filter," plus an app CTA: *"Get notified when new [Healthcare] opportunities in [Kingston] are posted"* → `app.bridgeu.ca` (§6).
- Accessibility: real `<fieldset>`/`<legend>`/checkboxes, keyboard reachable, an `aria-live="polite"` result count, and visible focus rings.
- Pagination: client-side "Load more" in batches of 24 (all data is already on the client). The pre-rendered HTML lists everything for SEO.

---

## 6. App CTA strategy (`app.bridgeu.ca`)

The app is where users **subscribe, get personalized alerts, and save/track** opportunities. The site's job is discovery and SEO, then converting visitors to the app. Every CTA goes through one component so wording and tracking stay consistent:

```astro
<AppCTA placement="detail-sidebar" variant="primary" context={{ city, cause }} />
```

`appUrl()` builds `https://app.bridgeu.ca/?utm_source=bridgeu.ca&utm_medium=website&utm_campaign=<placement>` and adds **context params from the page the visitor is on**:

| Page | Params passed |
|---|---|
| `/volunteering/kingston/*`, Kingston opp/org detail | `city=kingston` (+ `cause=<slug>` on category pages) |
| `/volunteering/london/*`, London opp/org detail | `city=london` (+ `cause`) |
| `/volunteering` with active filters | the current `city` (and `cause` if one is selected) |
| `/research`, research detail | `type=research` (+ `city=` for city-specific programs) |

The param names and values live in one map in `src/lib/app-link.ts`, so they're easy to align with what the app expects (see §11 Q1).

| Placement | Copy (draft) | Style |
|---|---|---|
| Header (every page) | **Open the app** | Primary button, always visible |
| Mobile bottom bar | **Get BridgeU alerts →** | Sticky, dismissible (choice saved in localStorage) |
| Home hero | **Discover opportunities** (primary) · Browse research (secondary, on-site) | Large |
| Home mid-page | "Sign up to receive updates on fulfilling opportunities today." → **Create free account** | Banner |
| Listing page header | "Get new [Research] opportunities in your inbox" → **Get alerts** | Inline banner above results |
| Listing in-grid (after the 8th card) | "Save and track opportunities in the BridgeU app" | Card-shaped promo |
| Empty filter results | "Get notified when matching opportunities are posted" | Primary |
| Opportunity detail sidebar | **Apply on [org] site ↗** (primary, external) + **Save to BridgeU** / **Get similar alerts** (secondary → app) | Sticky on desktop |
| Research detail deadline box | "Never miss a deadline: get reminders in the app" | |
| Blog post end | "Find research opportunities like these in the app" | |
| Footer | App link + Subscribe | |
| `/subscribe` (old URL) | 301 → app signup | |

Rule: the **external "Apply"** link stays the main action on detail pages, because students need it and it builds trust. The app CTA is a strong secondary action there and the primary action everywhere else.

Tracking: Cloudflare Web Analytics for pageviews. CTA clicks are measured by the UTM campaign showing up in the app's analytics. Optionally add a tiny `navigator.sendBeacon` to a Pages Function for counts on the site side.

---

## 7. Design direction

- Keep the current brand: Notion-style clean layout, **purple accent** (the site uses Notion's purple icon set), and Inter. Bring over the existing illustrations (`prioritize.svg`, `deliveries.svg`, `scientist.png`, `happy_announcement.png`, etc.) and partner logos.
- Design tokens in Tailwind `@theme`: `--color-brand-*` (purple scale), neutral greys, status colours (green = open/accepting, amber = closing soon, grey = closed).
- Cards: logo (square, 48px, `object-contain` on white), title, org, 2 to 3 tag pills, a status badge, and a one-line summary.
- Organization pages: logo, description, category tags, website, and a list of their opportunities with the same card component.
- Dark mode: optional, phase 2.

---

## 8. Cloudflare Pages deployment

### 8.1 Setup
- Connect the GitHub repo → Cloudflare Pages. Framework preset **Astro**, build command `npm run build`, output `dist`, env `NODE_VERSION=22`.
- Production branch `main` → `bridgeu.ca` (+ `www` → apex redirect). Every PR gets a preview URL `*.bridgeu-site.pages.dev`.
- **DNS today:** nameservers are at **Porkbun**. The apex `bridgeu.ca` → Vercel (`76.76.21.21`, the current Super site), and `app.bridgeu.ca` → CNAME to Vercel. Cloudflare Pages needs the zone on Cloudflare to serve the apex domain, so:
  1. Add `bridgeu.ca` as a zone in Cloudflare and copy over all existing records. **Keep `app.bridgeu.ca` as a DNS-only (grey-cloud) CNAME to Vercel** so the app isn't affected. Keep any MX/TXT records too (`hello@bridgeu.ca` email).
  2. Switch the nameservers at Porkbun → Cloudflare. Nothing changes for users yet, because the apex still points at Vercel.
  3. At launch, attach `bridgeu.ca` + `www` to the Pages project, which swaps the apex record. Rollback means pointing the apex back at `76.76.21.21`.

### 8.2 Limits to design around
- **25 MiB max per file.** The med-school `.mov` files are ~1 minute each, so transcode them once:
  ```sh
  ffmpeg -i in.mov -vf scale=720:-2 -c:v libx264 -crf 26 -preset slow -movflags +faststart -c:a aac -b:a 96k out.mp4   # ≈ 8–15 MB
  ffmpeg -i in.mov -frames:v 1 -vf scale=720:-2 poster.jpg
  ```
  Serve with `<video controls playsinline preload="none" poster=…>`, so nothing downloads until the user hits play. The import script should **fail** on any file over 24 MiB.
- 20,000 files per deployment: no issue (we'll ship around 1,500 to 2,500).
- `_redirects`: up to 2,000 static + 100 dynamic rules. The legacy map (~745 rules) fits.
- Keep PDFs (`Casper_guide.pdf`, the Salvation Army application PDF) in `public/files/`.

### 8.3 `public/_headers`
```
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### 8.4 Keeping deadlines and content fresh
- **Daily scheduled rebuild** so `deadlineStatus` moves from open → closing soon → closed without anyone editing content. Use a Cloudflare Pages **Deploy Hook** triggered by a tiny scheduled Worker (cron `0 9 * * *`) or a GitHub Actions `schedule`.
- Phase 2: replace the manual export with a **Notion API loader** (Astro Content Layer `loader`) that reads the same DBs at build time, so editors keep working in Notion and publish by triggering the deploy hook. The overrides YAML keeps working on top.

### 8.5 Redirects from the live site (`public/_redirects`, generated)

The live sitemap (`https://bridgeu.ca/sitemap.xml`) has **745 URLs**:

| Live prefix | Count | Notes |
|---|---|---|
| `/kingstonopps/<slug>` | 301 | More than the 224 in the export, so ~77 are stale or deleted pages |
| `/londonorgs/<slug>` | 122 | |
| `/londonopps/<slug>` | 100 | |
| `/kingstonorgs/<slug>` | 95 | |
| `/rsrch/<slug>` | 53 | |
| `/blog-posts-database/<slug>` | 23 | Includes **Super template leftovers** (`what-is-notion-and-why-is-it-so-cool`, `6-positive-office-habits`, `test-page`, …) |
| `/team-database/<slug>` | 23 | Includes template people (`anna`, `hamish`, `moosh`, `zaf`, …) |
| `/medical-school-application-advice-database/<slug>` | 5 | |
| Top-level pages | ~23 | `/about`, `/awards`, `/post`, `/subscribe`, `/kingston-volunteering`, … |

Super slugs are `slugify(title)`, with `-1`, `-2` added on collisions (70 URLs have a suffix, e.g. `february-research-opportunities-3`). That makes collided slugs impossible to rebuild from titles alone, so build the map from the live site **once**:

1. `scripts/build-legacy-map.ts` fetches each sitemap URL (throttled to about 5 req/s) and reads its `<h1>`. For opportunities it also reads the related-organization name. Match the result to export rows on (collection, normalized title, org).
2. It writes `scripts/overrides/legacy-urls.json`: `{ legacyPath → { collection, id } }`, committed and reviewed by a person. Unmatched URLs are listed in the report.
3. The import emits `public/_redirects` from it (all 301):

```
# Section pages
/awards                     /research                     301
/researchers                /research                     301
/research/research-assistant /research/pathai-lab-research-assistant 301
/volunteering               /volunteering                 200
/kingston-volunteering      /volunteering/kingston        301
/kingston-opportunities     /volunteering/kingston        301
/kingston-organizations     /organizations/kingston       301
/london-volunteering        /volunteering/london          301
/london-opportunities       /volunteering/london          301
/london-organizations       /organizations/london         301
/kingston-database/*        /organizations/kingston       301
/london-database/*          /organizations/london         301
/post                       /submit                       301
/subscribe                  https://app.bridgeu.ca/?utm_source=bridgeu.ca&utm_medium=website&utm_campaign=subscribe-redirect 302
/medical-school-applications/*                /blog/category/med-school 301
/medical-school-application-advice-database   /blog/category/med-school 301
/team-database/*            /about#team                   301

# Generated per item (examples)
/kingstonopps/animal-care          /opportunities/sandy-pines-wildlife-centre/animal-care   301
/rsrch/sickkids-ssure              /research/sickkids-ssure                                 301
/blog-posts-database/february-research-opportunities-3   /blog/2025-01-26-february-research-opportunities 301

# Fallbacks (after specific rules): stale/unmatched items go to their section
/kingstonopps/*             /volunteering/kingston        301
/londonopps/*               /volunteering/london          301
/kingstonorgs/*             /organizations/kingston       301
/londonorgs/*               /organizations/london         301
/rsrch/*                    /research                     301
/blog-posts-database/*      /blog                         301
```

Template junk (the Super demo blog posts and fake team members) is caught by the fallbacks. A Playwright check requests every legacy URL against the preview deploy and asserts a 301 to a 200 page.

---

## 9. SEO and performance

- One `<title>`/meta description per page, generated from content. Canonical URLs, plus OG/Twitter cards (one static OG image per section; optional per-opportunity OG generated with `satori` in phase 2).
- **JSON-LD**: `Organization` (site), `FAQPage` (/faq), `BlogPosting` (blog), `VolunteerAction`/`Event` is not a good fit, so use `ItemList` on listing pages and `Organization` on org pages.
- `@astrojs/sitemap`. Exclude filtered query URLs (only the canonical landing pages get indexed).
- Performance budget, enforced in Lighthouse CI on PRs:
  - Home and detail pages: **0 KB JS** apart from the mobile menu (a few hundred bytes of inline script).
  - Listing pages: **≤ 70 KB gz JS** (React + island + MiniSearch). Lower if switched to Preact.
  - LCP ≤ 1.5s, CLS < 0.05, all images with width/height set, AVIF/WebP, `loading="lazy"` below the fold.
- Prefetch internal links (`prefetch: { defaultStrategy: 'hover' }`).

---

## 10. Phased delivery

### Phase 0: Decisions & setup (½ day)
- [ ] Answer the open questions (§11)
- [ ] Create repo, `npm create astro@latest`, add React, Tailwind, sitemap, TS strict, ESLint/Prettier
- [ ] Connect Cloudflare Pages, so the first preview deploy of a hello-world page is live

### Phase 1: Import pipeline (1.5 to 2 days)
- [ ] CSV + HTML parsers, slugging, image copying, relation resolution
- [ ] Category/city/status normalization + unknown-value failure
- [ ] Deadline parser + `research-deadlines.yaml` generated for review
- [ ] Import report; fix data issues listed in §1.3
- [ ] Content Collection schemas validate the full dataset

### Phase 2: Layout, design system, static pages (1.5 days)
- [ ] Base layout, header (with app CTA), footer, mobile CTA bar
- [ ] Home, About (team grid), FAQ, Contact, Submit, Careers, 404
- [ ] `AppCTA` component + `appUrl()` helper

### Phase 3: Listings, detail pages, filters (3 days)
- [ ] Opportunity / Research / Org cards
- [ ] Detail pages for research, opportunities, orgs (with "report a mistake" block + app CTA)
- [ ] `FilterableList` island: URL state, facets with counts, chips, search, sort, load-more
- [ ] Mobile filter drawer; accessibility pass
- [ ] City and city × category SEO landing pages

### Phase 4: Blog & media (1 day)
- [ ] Blog index with tag filter, post template, med-school section
- [ ] Transcode the 3 videos to 720p MP4 + posters; image optimization check

### Phase 5: Curation (1 to 2 hours of editor time, can run alongside Phase 3)
- [ ] Review research deadlines, tag research fields, confirm university-specific lists
- [ ] Merge duplicate orgs (`org-merges.yaml`). Everything else, including `MNBGF` and stale/suspended items, stays in for now (§0)

### Phase 6: Launch hardening (1.5 days)
- [ ] `build-legacy-map.ts` → review `legacy-urls.json` → generated `_redirects`; `_headers`
- [ ] Lighthouse CI + Playwright smoke tests (filters, deep-link URLs, CTA hrefs carry UTM + city, all 745 legacy URLs redirect correctly)
- [ ] Move the DNS zone to Cloudflare ahead of launch (records copied, `app.` grey-clouded to Vercel)
- [ ] Cloudflare Web Analytics, daily rebuild cron
- [ ] Content QA on preview URL → attach `bridgeu.ca` to Pages (cutover) → submit new sitemap in Google Search Console

### Phase 7: Post-launch (optional)
- Notion API live loader + publish button (deploy hook)
- Per-opportunity OG images
- New facets: time commitment, minimum age, pre-health flag
- Deep links into the app (`?save=<id>`, prefilled alert preferences)
- Swap React → Preact if the JS budget gets tight

**Estimated total: about 9 to 11 developer-days** to a launch-ready site.

---

## 11. Open questions

Resolved: app params (yes, `city`), Careers (stub), live site (bridgeu.ca), and unclear content (include it for now). See §0.

Still open. None of these block starting Phases 0 to 3:

1. **Exact app param names and values.** Is it `?city=kingston` (lowercase slug) or `?city=Kingston`? Does the app also take `cause`/`category` or `type=research|volunteering`? If not, we send `city` only.
2. **Source of truth going forward.** Keep editing in Notion (then build the API loader in Phase 7), or does the app's database already hold these opportunities? If the app has an API, the site could build from it instead.
3. **DNS move.** Is it OK to move the `bridgeu.ca` nameservers from Porkbun to Cloudflare (registration stays at Porkbun)? Who has Porkbun and Vercel access for the cutover?
