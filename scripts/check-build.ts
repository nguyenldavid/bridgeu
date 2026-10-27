// Post-build sanity checks: redirect targets exist, no file exceeds Cloudflare Pages' 25 MiB limit.
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(import.meta.dirname, '../dist');
const errors: string[] = [];

const exists = (route: string) => {
  const clean = route.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  return [`${clean}.html`, `${clean}/index.html`, clean].some((p) => fs.existsSync(path.join(DIST, p)) && fs.statSync(path.join(DIST, p)).isFile()) || clean === '/';
};

const redirects = fs.readFileSync(path.join(DIST, '_redirects'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
for (const line of redirects) {
  const [from, to] = line.split(/\s+/);
  if (to.startsWith('/') && !exists(to)) errors.push(`_redirects: ${from} → ${to} (target missing)`);
  if (!from.includes('*') && exists(from)) errors.push(`_redirects: ${from} shadows a real page`);
}
if (redirects.length > 2100) errors.push(`_redirects has ${redirects.length} rules (Cloudflare limit 2,000 static + 100 dynamic)`);

let files = 0;
const walk = (d: string) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else {
      files++;
      if (fs.statSync(p).size > 25 * 1024 * 1024) errors.push(`${path.relative(DIST, p)} exceeds 25 MiB`);
    }
  }
};
walk(DIST);
if (files > 20000) errors.push(`${files} files (Cloudflare Pages limit is 20,000)`);

console.log(`check-build: ${redirects.length} redirect rules, ${files} files`);
for (const e of errors) console.error('ERROR:', e);
if (errors.length) process.exit(1);
