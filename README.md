# BridgeU

Static Astro site for [bridgeu.ca](https://bridgeu.ca): research and volunteering opportunities with filters, plus calls to action into the app ([app.bridgeu.ca](https://app.bridgeu.ca)). Deployed on Cloudflare Pages.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:4321 |
| `npm run build` | Builds to `dist/`, then runs `scripts/check-build.ts` (redirect targets exist, no file > 25 MiB) |
| `npm run preview` | Serves the built site |
| `npm run check` | Type-checks Astro, TS and content schemas |
| `npm run import -- <export>/BridgeU/BridgeU` | Regenerates `src/content/**` from a Notion export (one-time migration) |
| `npm run redirects` | Regenerates `public/_redirects` from the old-site snapshot |

Node 22.18+ is required; the scripts are TypeScript run directly by Node.

## Content

All content lives in `src/content/` as Markdown with YAML frontmatter, validated by `src/content.config.ts`. A bad value fails the build.

| Collection | Path | Route |
|---|---|---|
| Research programs | `research/<slug>/index.md` | `/research/<slug>` |
| Organizations | `organizations/<city>/<slug>/index.md` | `/organizations/<city>/<slug>` |
| Volunteer opportunities | `opportunities/<city>/<org>/<slug>/index.md` | `/opportunities/<city>/<org>/<slug>` |
| Blog + med-school advice | `blog/<slug>/index.md` (`section: blog \| med-school`) | `/blog/<slug>` |
| Team | `team/<slug>/index.md` | `/about#team` |

Facet values (cities, causes, statuses, research fields) are defined once in `src/lib/taxonomy.ts`. Add a new city or cause there first.

Images sit next to each entry (`logo.png`, `cover.jpg`) and are optimized at build time. Videos go in `public/media/` (transcode to MP4 under 25 MiB; see `transcodeVideo` in the import script).

Because content is plain Markdown in Git, any Git-based CMS can edit it: Sveltia/Decap CMS, Keystatic or TinaCMS.

## App links

Every link to the app goes through `appUrl(placement, { city })` in `src/lib/app-link.ts`. It adds `utm_source=bridgeu.ca&utm_medium=website&utm_campaign=<placement>` and `city=<City>` (e.g. `city=Kingston`) on city pages. Use the `<AppCTA>` / `<AppBanner>` components rather than hand-written links.

## Filters

`src/components/filters/FilterableList.tsx` is the only React island. Pages pre-render the list (SEO, no-JS) and pass compact items plus facet config from `src/lib/listings.ts`. Filter state lives in the URL (`?cause=animals,healthcare&status=accepting&q=…`), so filtered views are shareable. City and city×cause landing pages (`/volunteering/kingston/healthcare`) are pre-rendered for search engines.

## Redirects from the old Super site

`scripts/overrides/live-pages.json` is a committed snapshot of all 745 URLs in the old sitemap. The old site disappears at DNS cutover, so this snapshot is the only record of them. `npm run redirects` maps 609 of them to new pages; the rest were already 404s and fall back to their section page. **Never add a `_redirects` wildcard that overlaps a live route prefix**: Cloudflare applies redirects before serving files.

## Deploying to Cloudflare Pages

1. Push this folder to GitHub, then in Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**.
2. Framework preset **Astro**, build command `npm run build`, output directory `dist`, environment variable `NODE_VERSION=22`.
3. Add custom domains `bridgeu.ca` and `www.bridgeu.ca` once the zone is on Cloudflare (see PLAN.md §8.1; keep `app.bridgeu.ca` as a DNS-only CNAME to Vercel).
4. Optional: enable Cloudflare Web Analytics for the project.

`public/_headers` sets long-lived caching for `/_astro/*` and security headers.
