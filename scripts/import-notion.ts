// Converts the Notion export into Astro content collections.
// Usage: node scripts/import-notion.ts <path-to-export>/BridgeU/BridgeU
// Idempotent: wipes and regenerates src/content/*. Manual curation lives in scripts/overrides/.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import sharp from 'sharp';
import { loadPage, bodyToMarkdown, type NotionPage, type AssetHandler } from './lib/notion-html.ts';
import { slugify, uniqueSlug, readCsv, relationIds, splitList, notionDate, writeEntry, cleanText, summarize, cleanUrl } from './lib/util.ts';
import { RAW_CATEGORY_MAP, RESEARCH_CITY_PROVINCE, type CauseSlug, type OppStatus } from '../src/lib/taxonomy.ts';

const SRC = path.resolve(process.argv[2] ?? '../BridgeU/BridgeU');
const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT = path.join(ROOT, 'src/content');
const PUBLIC = path.join(ROOT, 'public');
const CACHE = path.join(ROOT, '.import-cache');
const OVERRIDES = path.join(ROOT, 'scripts/overrides');
const MAX_FILE = 24 * 1024 * 1024;

const report = { warnings: [] as string[], errors: [] as string[], counts: {} as Record<string, number> };
const warn = (m: string) => report.warnings.push(m);

function csvFor(prefix: string): string {
  const f = fs.readdirSync(SRC).find((n) => n.startsWith(prefix) && n.endsWith('.csv') && !n.includes('_'));
  if (!f) throw new Error(`CSV not found for ${prefix}`);
  return path.join(SRC, f);
}

function pagesIn(dir: string): NotionPage[] {
  const abs = path.join(SRC, dir);
  return fs
    .readdirSync(abs)
    .filter((n) => n.endsWith('.html'))
    .map((n) => loadPage(path.join(abs, n)));
}

function loadOverrides<T>(name: string): Record<string, T> {
  const f = path.join(OVERRIDES, name);
  return fs.existsSync(f) ? (YAML.parse(fs.readFileSync(f, 'utf8')) ?? {}) : {};
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Pairs each HTML page with its CSV row. Duplicate keys are consumed in order. */
function joinRows(pages: NotionPage[], rows: Record<string, string>[], keyOfPage: (p: NotionPage) => string, keyOfRow: (r: Record<string, string>) => string) {
  const buckets = new Map<string, Record<string, string>[]>();
  for (const r of rows) {
    const k = keyOfRow(r);
    buckets.set(k, [...(buckets.get(k) ?? []), r]);
  }
  const out: { page: NotionPage; row: Record<string, string> }[] = [];
  for (const page of pages) {
    const row = buckets.get(keyOfPage(page))?.shift();
    if (row) out.push({ page, row });
    else warn(`No CSV row for page "${page.title}" (${path.basename(page.file)}), skipped`);
  }
  for (const [k, left] of buckets) for (const _ of left) warn(`CSV row without HTML page: ${k}`);
  return out;
}

// ---------------------------------------------------------------------------
// Remote images: downloaded once into .import-cache so the asset handler can stay synchronous.

const remoteCache = new Map<string, string | null>();

function isUsableRemote(url: string) {
  return /^https?:/.test(url) && !/secure\.notion-static\.com|app\.notion\.com\/icons|notion\.so\/icons/.test(url);
}

async function prefetchRemote(urls: string[]) {
  fs.mkdirSync(CACHE, { recursive: true });
  await Promise.all(
    [...new Set(urls.filter(isUsableRemote))].map(async (url) => {
      const ext = (url.split('?')[0].match(/\.(png|jpe?g|webp|svg|gif)$/i)?.[1] ?? 'jpg').toLowerCase();
      const dest = path.join(CACHE, `${slugify(url).slice(-80)}.${ext}`);
      if (fs.existsSync(dest)) return remoteCache.set(url, dest);
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 BridgeU-import' } });
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || !/image\//.test(type)) throw new Error(`${res.status} ${type}`);
        fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
        remoteCache.set(url, dest);
      } catch (e) {
        warn(`Remote image unavailable: ${url} (${(e as Error).message})`);
        remoteCache.set(url, null);
      }
    }),
  );
}

function collectRemoteImages(pages: NotionPage[]): string[] {
  const urls: string[] = [];
  for (const p of pages) {
    if (p.icon) urls.push(p.icon);
    if (p.cover) urls.push(p.cover);
    p.$('.page-body img').each((_, el) => {
      urls.push(p.$(el).attr('src') ?? '');
    });
  }
  return urls;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|avif)$/i;

/** Copies an image into `destDir`, returning the relative "./file" path or null. */
function copyImage(src: string | undefined, destDir: string, baseName?: string): string | null {
  if (!src) return null;
  const local = /^https?:/.test(src) ? remoteCache.get(src) : src;
  if (!local || !fs.existsSync(local) || !IMAGE_EXT.test(local)) return null;
  if (fs.statSync(local).size > MAX_FILE) {
    warn(`Image too large, skipped: ${local}`);
    return null;
  }
  const ext = path.extname(local).toLowerCase().replace('.jpeg', '.jpg');
  let name = `${slugify(baseName ?? path.basename(local, path.extname(local))) || 'image'}${ext}`;
  fs.mkdirSync(destDir, { recursive: true });
  for (let i = 2; fs.existsSync(path.join(destDir, name)); i++) name = `${slugify(baseName ?? path.basename(local, path.extname(local)))}-${i}${ext}`;
  const dest = path.join(destDir, name);
  pendingImages.push(resizeInto(local, dest, baseName === 'logo' ? 256 : 1600));
  return `./${name}`;
}

const pendingImages: Promise<void>[] = [];

/** Copies an image, downscaling raster files so the repo and the deploy stay small. */
async function resizeInto(src: string, dest: string, max: number) {
  const ext = path.extname(dest);
  if (ext === '.svg' || ext === '.gif') return fs.copyFileSync(src, dest);
  try {
    const img = sharp(src, { failOn: 'none' });
    const meta = await img.metadata();
    if ((meta.width ?? 0) <= max && fs.statSync(src).size < 400_000) return fs.copyFileSync(src, dest);
    const pipeline = img.rotate().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true });
    const out = ext === '.png' ? pipeline.png({ compressionLevel: 9, palette: true }) : ext === '.webp' ? pipeline.webp({ quality: 82 }) : pipeline.jpeg({ quality: 82, mozjpeg: true });
    await out.toFile(dest);
  } catch (e) {
    warn(`Could not process image ${src}: ${(e as Error).message}`);
    fs.copyFileSync(src, dest);
  }
}

const localPath = (p?: string) => (p && !/^https?:/.test(p) ? path.join(SRC, decodeURIComponent(p)) : p);

// Notion page id → site route, filled as entries are created; used to rewrite internal links.
const routes = new Map<string, string>();

function assetsFor(destDir: string, slug: string): AssetHandler {
  return {
    image: (src) => copyImage(src, destDir),
    link: (id) => routes.get(id) ?? null,
    attachment: (abs) => {
      const ext = path.extname(abs).toLowerCase();
      if (['.mov', '.mp4', '.m4v', '.webm'].includes(ext)) return transcodeVideo(abs, slug);
      const name = `${slug}-${slugify(path.basename(abs, ext))}${ext}`;
      fs.mkdirSync(path.join(PUBLIC, 'files'), { recursive: true });
      fs.copyFileSync(abs, path.join(PUBLIC, 'files', name));
      return `<a href="/files/${name}">Download ${path.basename(abs)}</a>`;
    },
  };
}

function transcodeVideo(abs: string, slug: string): string | null {
  const dir = path.join(PUBLIC, 'media');
  fs.mkdirSync(dir, { recursive: true });
  const mp4 = path.join(dir, `${slug}.mp4`);
  const poster = path.join(dir, `${slug}.jpg`);
  try {
    if (!fs.existsSync(mp4)) {
      console.log(`  transcoding ${path.basename(abs)} → ${path.basename(mp4)}`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', abs, '-vf', 'scale=720:-2', '-c:v', 'libx264', '-crf', '26', '-preset', 'slow', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '96k', mp4]);
    }
    if (!fs.existsSync(poster)) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1', '-i', abs, '-frames:v', '1', '-vf', 'scale=720:-2', poster]);
  } catch (e) {
    report.errors.push(`ffmpeg failed for ${abs}: ${(e as Error).message}`);
    return null;
  }
  if (fs.statSync(mp4).size > MAX_FILE) report.errors.push(`${mp4} exceeds 24 MiB (Cloudflare Pages limit is 25 MiB)`);
  return `<video controls playsinline preload="none" poster="/media/${slug}.jpg" width="720" height="1280"><source src="/media/${slug}.mp4" type="video/mp4"></video>`;
}

function mapCategories(raw: string, where: string): CauseSlug[] {
  const out = new Set<CauseSlug>();
  for (const v of splitList(raw)) {
    const slug = RAW_CATEGORY_MAP[v];
    if (slug) out.add(slug);
    else report.errors.push(`Unmapped category "${v}" in ${where}; add it to RAW_CATEGORY_MAP`);
  }
  return [...out];
}

function orgStatus(raw: string): OppStatus | undefined {
  if (/not accepting/i.test(raw)) return 'not-accepting';
  if (/contact only/i.test(raw)) return 'contact';
  if (/stale/i.test(raw)) return 'stale';
  if (/updated|extracted/i.test(raw)) return 'accepting';
  return undefined;
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`Importing from ${SRC}`);
  for (const dir of ['research', 'organizations', 'opportunities', 'blog', 'team']) fs.rmSync(path.join(CONTENT, dir), { recursive: true, force: true });

  const cities = [
    { slug: 'kingston', orgs: 'kingstonorgs', opps: 'kingstonopps' },
    { slug: 'london', orgs: 'londonorgs', opps: 'londonopps' },
  ];

  const allPages = {
    rsrch: pagesIn('rsrch'),
    researchers: pagesIn('researchers'),
    blog: pagesIn('Blog posts database'),
    med: pagesIn('Medical School Application Advice database'),
    ...Object.fromEntries(cities.flatMap((c) => [[c.orgs, pagesIn(c.orgs)], [c.opps, pagesIn(c.opps)]])),
  } as Record<string, NotionPage[]>;
  await prefetchRemote(Object.values(allPages).flatMap(collectRemoteImages));

  // --- Organizations + opportunities -------------------------------------------------------
  type Opp = { page: NotionPage; row: Record<string, string>; city: string; slug: string; orgId?: string };
  const orgInfo = new Map<string, { slug: string; status?: OppStatus; name: string; dir: string; logo: string | null }>();
  const opps: Opp[] = [];

  for (const c of cities) {
    const orgRows = joinRows(allPages[c.orgs], readCsv(csvFor(c.orgs)), (p) => norm(p.title), (r) => norm(r.Name));
    const taken = new Set<string>();
    for (const { page, row } of orgRows) {
      const slug = uniqueSlug(slugify(row.Name), taken);
      routes.set(page.id, `/organizations/${c.slug}/${slug}`);
      const dir = path.join(CONTENT, 'organizations', c.slug, slug);
      orgInfo.set(page.id, { slug, status: orgStatus(row['Opportunities status'] ?? ''), name: row.Name.trim(), dir, logo: copyImage(page.icon, dir, 'logo') ?? copyImage(localPath(row.Logo), dir, 'logo') });
      page.props.__row = JSON.stringify(row);
    }

    const oppRows = joinRows(
      allPages[c.opps],
      readCsv(csvFor(c.opps)),
      (p) => `${norm(p.title)}|${p.$('table.properties a[data-notion-page-id]').attr('data-notion-page-id')?.replace(/-/g, '') ?? ''}`,
      (r) => `${norm(r.Name)}|${relationIds(r['Related organization'])[0] ?? ''}`,
    );
    const oppTaken = new Map<string, Set<string>>();
    for (const { page, row } of oppRows) {
      const orgId = relationIds(row['Related organization'])[0];
      const org = orgId ? orgInfo.get(orgId) : undefined;
      if (orgId && !org) warn(`Opportunity "${row.Name}" links to unknown org ${orgId}`);
      const orgSlug = org?.slug ?? 'independent';
      const set = oppTaken.get(orgSlug) ?? new Set();
      oppTaken.set(orgSlug, set);
      const cleanName = row.Name.replace(/\s*\((currently )?suspended\)/i, '').trim();
      const slug = uniqueSlug(slugify(cleanName), set);
      routes.set(page.id, `/opportunities/${c.slug}/${orgSlug}/${slug}`);
      opps.push({ page, row, city: c.slug, slug, orgId });
    }

    // Write orgs now that opportunity counts are known.
    for (const { page, row } of orgRows) {
      const info = orgInfo.get(page.id)!;
      const description = cleanText(row.Description);
      writeEntry(
        path.join(info.dir, 'index.md'),
        {
          slug: `${c.slug}/${info.slug}`,
          name: info.name,
          city: c.slug,
          causes: mapCategories(row.Category, `org ${row.Name}`),
          status: info.status,
          website: cleanUrl(row.URL),
          logo: info.logo ?? undefined,
          summary: summarize(description, 200),
          updatedAt: notionDate(row['Last edited time']),
        },
        [description, bodyToMarkdown(page, assetsFor(info.dir, `org-${info.slug}`))].filter(Boolean).join('\n\n'),
      );
    }
    report.counts[`organizations/${c.slug}`] = orgRows.length;
  }

  for (const o of opps) {
    const org = o.orgId ? orgInfo.get(o.orgId) : undefined;
    const orgSlug = org?.slug ?? 'independent';
    const dir = path.join(CONTENT, 'opportunities', o.city, orgSlug, o.slug);
    const body = bodyToMarkdown(o.page, assetsFor(dir, `${orgSlug}-${o.slug}`));
    const description = cleanText(o.row['Notes or Description']);
    const locations = splitList(o.row.Location);
    const suspended = /suspended/i.test(o.row.Name);
    const status: OppStatus = suspended ? 'suspended' : (org?.status ?? 'accepting');
    writeEntry(
      path.join(dir, 'index.md'),
      {
        slug: `${o.city}/${orgSlug}/${o.slug}`,
        title: o.row.Name.replace(/\s*\((currently )?suspended\)/i, '').trim(),
        org: org ? `${o.city}/${org.slug}` : undefined,
        orgName: org?.name ?? (o.row['Organization display name'] || undefined),
        city: o.city,
        mode: locations.includes('Online') ? 'online' : locations.includes('Abroad') ? 'abroad' : 'in-person',
        causes: mapCategories(o.row.Category, `opportunity ${o.row.Name}`),
        status,
        applyUrl: cleanUrl(o.row.URL),
        summary: summarize(description || body, 200),
        updatedAt: notionDate(o.row['Last edited time']),
      },
      body || description,
    );
  }
  report.counts.opportunities = opps.length;

  // --- Research ------------------------------------------------------------------------------
  type ResearchOverride = { fields?: string[]; institution?: string; eligibleUniversities?: string[] };
  const researchOverrides = loadOverrides<ResearchOverride>('research.yaml');
  const rTaken = new Set<string>();
  const research = [
    ...joinRows(allPages.rsrch, readCsv(csvFor('rsrch')), (p) => norm(p.title), (r) => norm(r.Name)).map((x) => ({ ...x, kind: 'program' as const })),
    ...joinRows(allPages.researchers, readCsv(csvFor('researchers')), (p) => norm(p.title), (r) => norm(r['Position title'])).map((x) => ({ ...x, kind: 'lab-position' as const })),
  ];
  for (const { page, row, kind } of research) {
    const title = kind === 'lab-position' ? `${row['Lab name']}: ${row['Position title']}` : row.Name.trim();
    const slug = uniqueSlug(slugify(title), rTaken);
    routes.set(page.id, `/research/${slug}`);
  }
  for (const { page, row, kind } of research) {
    const title = kind === 'lab-position' ? `${row['Lab name']}: ${row['Position title']}` : row.Name.trim();
    const slug = routes.get(page.id)!.split('/').pop()!;
    const dir = path.join(CONTENT, 'research', slug);
    const loc = (row.Location ?? '').trim();
    const scope = loc === 'Canada' ? 'national' : loc === 'Remote' ? 'remote' : 'city';
    const ov = researchOverrides[slug] ?? {};
    if (!ov.fields?.length) warn(`Research "${slug}" has no fields in overrides/research.yaml`);
    const uni = (row['University-specific?'] ?? '').trim();
    const eligibility = cleanText(row['Details (TEMP: Eligibility)'] ?? row.Details);
    const body = bodyToMarkdown(page, assetsFor(dir, `research-${slug}`));
    const site = row['super:Link'] || row['Site link'];
    writeEntry(
      path.join(dir, 'index.md'),
      {
        slug,
        title,
        kind,
        institution: ov.institution,
        scope,
        city: scope === 'city' ? loc : undefined,
        province: scope === 'city' ? RESEARCH_CITY_PROVINCE[loc] : undefined,
        fields: ov.fields ?? [],
        terms: /fall/i.test(row.Type ?? '') ? ['summer', 'fall'] : ['summer'],
        levels: splitList(row['Level of education']).map((l) => slugify(l)),
        eligibility: uni === 'Yes' ? 'university-specific' : uni === 'Open to all' ? 'open' : 'unspecified',
        eligibleUniversities: ov.eligibleUniversities,
        applyUrl: cleanUrl(site),
        logo: copyImage(page.icon ?? row['Display image'], dir, 'logo') ?? undefined,
        summary: summarize(eligibility || body, 200) || undefined,
        updatedAt: notionDate(row['Last edited time']),
      },
      [body, eligibility && `## Eligibility\n\n${eligibility}`].filter(Boolean).join('\n\n'),
    );
  }
  report.counts.research = research.length;

  // --- Blog + med-school advice ----------------------------------------------------------------
  const bTaken = new Set<string>();
  const posts = [
    ...joinRows(allPages.blog, readCsv(csvFor('Blog posts database')), (p) => `${norm(p.title)}|${p.props['Date published']}`, (r) => `${norm(r.Title)}|${r['Date published']}`).map((x) => ({ ...x, section: 'blog' as const })),
    ...joinRows(allPages.med, readCsv(csvFor('Medical School Application Advice database')), (p) => norm(p.title), (r) => norm(r.Title)).map((x) => ({ ...x, section: 'med-school' as const })),
  ].filter(({ row }) => (row.Visibility ?? 'Published') === 'Published');
  const titleCounts = new Map<string, number>();
  for (const { row } of posts) titleCounts.set(norm(row.Title), (titleCounts.get(norm(row.Title)) ?? 0) + 1);
  for (const { page, row } of posts) {
    const date = notionDate(row['Date published'])!;
    const base = slugify(row.Title);
    const slug = uniqueSlug((titleCounts.get(norm(row.Title)) ?? 0) > 1 ? `${base}-${date.slice(0, 7)}` : base, bTaken);
    routes.set(page.id, `/blog/${slug}`);
  }
  for (const { page, row, section } of posts) {
    const slug = routes.get(page.id)!.split('/').pop()!;
    const dir = path.join(CONTENT, 'blog', slug);
    const body = bodyToMarkdown(page, assetsFor(dir, slug));
    writeEntry(
      path.join(dir, 'index.md'),
      {
        slug,
        title: row.Title.trim(),
        date: notionDate(row['Date published']),
        section,
        tags: splitList(row.Tags),
        authors: (row['Written by'] ?? '').split(/\s*&\s*|\s*,\s*/).filter(Boolean),
        cover: copyImage(page.cover, dir, 'cover') ?? undefined,
        summary: summarize(body, 180) || undefined,
      },
      body,
    );
  }
  report.counts.blog = posts.length;

  // --- Team ----------------------------------------------------------------------------------------
  const team = readCsv(csvFor('Team database'));
  const tTaken = new Set<string>();
  for (const row of team) {
    const slug = uniqueSlug(slugify(row.Name), tTaken);
    const dir = path.join(CONTENT, 'team', slug);
    const photo = row.Image ? copyImage(path.join(SRC, decodeURIComponent(row.Image)), dir, 'photo') : null;
    writeEntry(path.join(dir, 'index.md'), { slug, name: row.Name.trim(), role: row.Role || 'Contributor', photo: photo ?? undefined, link: cleanUrl(row['super:Link']) });
  }
  report.counts.team = team.length;

  await Promise.all(pendingImages);

  // --- Report --------------------------------------------------------------------------------------
  fs.mkdirSync(path.join(ROOT, 'scripts/reports'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'scripts/reports/import-report.json'), JSON.stringify({ ...report, routes: Object.fromEntries(routes) }, null, 2));
  console.log('Counts:', report.counts);
  console.log(`${report.warnings.length} warnings (see scripts/reports/import-report.json)`);
  for (const e of report.errors) console.error('ERROR:', e);
  if (report.errors.length) process.exit(1);
}

await main();
