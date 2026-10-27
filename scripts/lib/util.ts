import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import YAML from 'yaml';

/** Matches Super's slug style ("1:1 Mentoring On-Site" → "11-mentoring-on-site") so legacy URLs line up. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Returns a slug unique within `taken`, adding -2, -3… on collision. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  let slug = base || 'untitled';
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  taken.add(slug);
  return slug;
}

export function readCsv(file: string): Record<string, string>[] {
  const rows = parse(fs.readFileSync(file, 'utf8'), {
    columns: (header: string[]) => header.map((h) => h.replace(/^[﻿"]+|"+$/g, '').trim()),
    bom: true,
    skip_empty_lines: true,
    relax_quotes: true,
  }) as Record<string, string>[];
  return rows;
}

/** Notion IDs appear as 32 hex chars at the end of exported filenames/links. */
export function notionIdFromPath(p: string): string | null {
  const m = decodeURIComponent(p).match(/([0-9a-f]{32})(?:\.html)?$/);
  return m ? m[1] : null;
}

export function splitList(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Splits a Notion relation cell: "Name (path/Name%20id.html), Other (…)" → ids. */
export function relationIds(v: string | undefined): string[] {
  return [...(v ?? '').matchAll(/\(([^()]*?\.html)\)/g)].map((m) => notionIdFromPath(m[1])).filter((x): x is string => !!x);
}

export function notionDate(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const d = new Date(v.replace(/(\d)(AM|PM)/, '$1 $2'));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

export function writeEntry(file: string, data: Record<string, unknown>, body = ''): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  fs.writeFileSync(file, `---\n${YAML.stringify(clean, { lineWidth: 0 })}---\n${body ? `\n${body.trim()}\n` : ''}`);
}

export function cleanText(s: string | undefined): string {
  return (s ?? '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
}

export function summarize(text: string, max = 180): string {
  const flat = text
    .split('\n')
    .filter((line) => !/^\s*(\*\*[^*]+\*\*|#+ .*|[A-Za-z ?]+:)\s*$/.test(line)) // drop label-only lines ("**How do I sign up?**")
    .map((line) => (/^\s*(?:[-*]|\d+\.)\s+/.test(line) ? `${line.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').replace(/[.;,]?\s*$/, '')};` : line))
    .join(' ')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, flat.lastIndexOf(' ', max)).replace(/[,.;:]$/, '')}…`;
}

/** Returns a usable absolute URL from a messy Notion cell (first URL if several; adds https://), or undefined. */
export function cleanUrl(raw: string | undefined): string | undefined {
  const first = (raw ?? '').split(/[\s,]+/).find(Boolean);
  if (!first || /dead link/i.test(raw ?? '')) return undefined;
  const candidate = /^https?:\/\//i.test(first) ? first : `https://${first}`;
  try {
    const u = new URL(candidate);
    return u.hostname.includes('.') ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
