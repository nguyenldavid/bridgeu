// Maps every URL on the old Super site (bridgeu.ca/sitemap.xml) to its new route and writes public/_redirects.
// Usage: node scripts/build-redirects.ts            (uses cached live titles in .import-cache/live-pages.json)
//        node scripts/build-redirects.ts --refresh  (re-crawls the live site; run before DNS cutover)

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const ROOT = path.resolve(import.meta.dirname, '..');
// Committed snapshot of the old site, since it disappears at DNS cutover.
const CACHE = path.join(ROOT, 'scripts/overrides/live-pages.json');
const LIVE = 'https://bridgeu.ca';
const refresh = process.argv.includes('--refresh');

type LivePage = { path: string; title: string; orgSlug?: string; date?: string };
type Entry = { route: string; title: string; city?: string; orgSlug?: string; date?: string };

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\((currently )?suspended\)/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

async function crawl(): Promise<LivePage[]> {
  if (!refresh && fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const xml = await (await fetch(`${LIVE}/sitemap.xml`)).text();
  const paths = [...xml.matchAll(/<loc>https:\/\/bridgeu\.ca([^<]*)<\/loc>/g)].map((m) => m[1] || '/');
  console.log(`Crawling ${paths.length} live pages…`);
  const out: LivePage[] = [];
  const queue = [...paths];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let p = queue.shift(); p !== undefined; p = queue.shift()) {
        try {
          const html = await (await fetch(LIVE + p, { signal: AbortSignal.timeout(20000) })).text();
          const title = html.match(/<h1[^>]*notion-header__title[^>]*>([^<]*)</)?.[1] ?? html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
          const orgSlug = html.match(/\/(?:kingston|london)orgs\/([a-z0-9-]+)/)?.[1];
          const date = html.match(/(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}/)?.[0];
          out.push({ path: p, title, orgSlug, date });
        } catch (e) {
          console.warn(`  failed ${p}: ${(e as Error).message}`);
          out.push({ path: p, title: '' });
        }
      }
    }),
  );
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(out.sort((a, b) => a.path.localeCompare(b.path)), null, 1));
  return out;
}

function readEntries(collection: string): (Record<string, any> & { id: string })[] {
  const base = path.join(ROOT, 'src/content', collection);
  const files: string[] = [];
  const walk = (d: string) => {
    for (const n of fs.readdirSync(d, { withFileTypes: true })) {
      if (n.isDirectory()) walk(path.join(d, n.name));
      else if (n.name === 'index.md') files.push(path.join(d, n.name));
    }
  };
  walk(base);
  return files.map((f) => {
    const fm = YAML.parse(fs.readFileSync(f, 'utf8').split('---')[1]);
    return { ...fm, id: fm.slug };
  });
}

const opps: Entry[] = readEntries('opportunities').map((e) => ({ route: `/opportunities/${e.id}`, title: e.title, city: e.city, orgSlug: e.id.split('/')[1] }));
const orgs: Entry[] = readEntries('organizations').map((e) => ({ route: `/organizations/${e.id}`, title: e.name, city: e.city }));
const research: Entry[] = readEntries('research').map((e) => ({ route: `/research/${e.id}`, title: e.title }));
const posts: Entry[] = readEntries('blog').map((e) => ({ route: `/blog/${e.id}`, title: e.title, date: String(e.date).slice(0, 10) }));

const claimed = new Set<string>();

function pick(candidates: Entry[], page: LivePage): Entry | undefined {
  const byTitle = candidates.filter((c) => norm(c.title) === norm(page.title));
  if (byTitle.length <= 1) return byTitle[0];
  const byOrg = byTitle.find((c) => c.orgSlug && page.orgSlug && c.orgSlug.replace(/-\d+$/, '') === page.orgSlug.replace(/-\d+$/, ''));
  if (byOrg) return byOrg;
  // Duplicate blog titles: the first date on a live post is usually a deadline shortly after publishing,
  // so take the closest unclaimed post published on or before it.
  const open = byTitle.filter((c) => !claimed.has(c.route));
  const seen = page.date ? new Date(`${page.date} UTC`).toISOString().slice(0, 10) : undefined;
  const best = seen ? open.filter((c) => c.date && c.date <= seen).sort((a, b) => b.date!.localeCompare(a.date!))[0] : undefined;
  const hit = best ?? open.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0] ?? byTitle[0];
  claimed.add(hit.route);
  return hit;
}

// Never add a fallback that overlaps a new route prefix (/research, /blog, /opportunities…):
// Cloudflare applies _redirects before serving files, so it would shadow real pages.
// Section-level rules (exact paths) and per-prefix fallbacks for stale or template pages.
const STATIC: [string, string, number][] = [
  ['/awards', '/research', 301],
  ['/researchers', '/research', 301],
  ['/research/research-assistant', '/research/pathai-lab-research-assistant', 301],
  ['/kingston-volunteering', '/volunteering/kingston', 301],
  ['/kingston-opportunities', '/volunteering/kingston', 301],
  ['/kingston-organizations', '/organizations/kingston', 301],
  ['/london-volunteering', '/volunteering/london', 301],
  ['/london-opportunities', '/volunteering/london', 301],
  ['/london-organizations', '/organizations/london', 301],
  ['/post', '/submit', 301],
  ['/make-a-post', '/submit', 301],
  ['/subscribe', 'https://app.bridgeu.ca/?utm_source=bridgeu.ca&utm_medium=website&utm_campaign=subscribe-redirect', 302],
  ['/medical-school-applications', '/blog/category/med-school', 301],
  ['/medical-school-application-advice', '/blog/category/med-school', 301],
  ['/medical-school-application-advice-database', '/blog/category/med-school', 301],
  ['/blog-posts-database', '/blog', 301],
];
const FALLBACKS: [string, string][] = [
  ['/kingstonopps/*', '/volunteering/kingston'],
  ['/londonopps/*', '/volunteering/london'],
  ['/kingstonorgs/*', '/organizations/kingston'],
  ['/londonorgs/*', '/organizations/london'],
  ['/kingston-database/*', '/organizations/kingston'],
  ['/london-database/*', '/organizations/london'],
  ['/rsrch/*', '/research'],
  ['/blog-posts-database/*', '/blog'],
  ['/medical-school-application-advice-database/*', '/blog/category/med-school'],
  ['/medical-school-applications/*', '/blog/category/med-school'],
  ['/team-database/*', '/about#team'],
];

const pages = await crawl();
const matched: [string, string][] = [];
const unmatched: string[] = [];
const dead: string[] = []; // already 404 on the live site (stale sitemap entries)
const existing = new Set(['/', '/about', '/blog', '/careers', '/contact', '/faq', '/research', '/volunteering']);

for (const page of [...pages].sort((a, b) => Number(!!b.date) - Number(!!a.date))) {
  const [, section] = page.path.split('/');
  let hit: Entry | undefined;
  const city = section?.match(/^(kingston|london)(?:opps|orgs)$/)?.[1];
  // Super's London sections are swapped (/londonopps/* are org pages), so try both collections.
  if (city) hit = pick(section.endsWith('opps') ? opps.filter((o) => o.city === city) : orgs.filter((o) => o.city === city), page) ?? pick(section.endsWith('opps') ? orgs.filter((o) => o.city === city) : opps.filter((o) => o.city === city), page);
  else if (section === 'rsrch') hit = pick(research, page);
  else if (section === 'blog-posts-database' || section === 'medical-school-application-advice-database') hit = pick(posts, page);
  else continue; // section pages and team members are covered by STATIC/FALLBACKS
  if (hit) {
    if (hit.route !== page.path) matched.push([page.path, hit.route]);
  } else if (page.title) unmatched.push(`${page.path}  ("${page.title}")`);
  else dead.push(page.path);
}

const lines = [
  '# Generated by scripts/build-redirects.ts. Do not edit by hand.',
  `# ${matched.length} item redirects from the old Super site; ${unmatched.length} unmatched and ${dead.length} already-dead URLs fall through to section pages.`,
  '',
  '# Section pages',
  ...STATIC.filter(([from]) => !existing.has(from)).map(([from, to, code]) => `${from} ${to} ${code}`),
  '',
  '# Items',
  ...matched.sort(([a], [b]) => a.localeCompare(b)).map(([from, to]) => `${from} ${to} 301`),
  '',
  '# Fallbacks for stale, deleted and template pages',
  ...FALLBACKS.map(([from, to]) => `${from} ${to} 301`),
  '',
];
fs.writeFileSync(path.join(ROOT, 'public/_redirects'), lines.join('\n'));
fs.mkdirSync(path.join(ROOT, 'scripts/reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'scripts/reports/redirects-unmatched.txt'), unmatched.join('\n') + '\n');
console.log(`${matched.length} item redirects, ${dead.length} dead on live site, ${unmatched.length} unmatched (see scripts/reports/redirects-unmatched.txt)`);
