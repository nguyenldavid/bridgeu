import type { FacetDef, ListItem } from './types';

export type FilterState = {
  q: string;
  sort: string;
  inactive: boolean;
  selected: Record<string, string[]>;
};

export const normalize = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function matchesFacets(item: ListItem, selected: Record<string, string[]>, skipKey?: string): boolean {
  for (const [key, values] of Object.entries(selected)) {
    if (key === skipKey || values.length === 0) continue;
    const have = item.facets[key] ?? [];
    if (!values.some((v) => have.includes(v))) return false;
  }
  return true;
}

function matchesQuery(item: ListItem, tokens: string[]): boolean {
  return tokens.every((t) => item.search.includes(t));
}

export function applyFilters(items: ListItem[], facets: FacetDef[], state: FilterState) {
  const tokens = normalize(state.q).split(/\s+/).filter(Boolean);
  const base = items.filter((i) => matchesQuery(i, tokens));
  const visibleBase = state.inactive ? base : base.filter((i) => i.active);

  const results = visibleBase.filter((i) => matchesFacets(i, state.selected));
  const hiddenInactive = state.inactive ? 0 : base.filter((i) => !i.active && matchesFacets(i, state.selected)).length;

  // Standard faceted counts: for each facet, apply every filter except its own.
  const counts: Record<string, Record<string, number>> = {};
  for (const f of facets) {
    const pool = visibleBase.filter((i) => matchesFacets(i, state.selected, f.key));
    const c: Record<string, number> = {};
    for (const i of pool) for (const v of i.facets[f.key] ?? []) c[v] = (c[v] ?? 0) + 1;
    counts[f.key] = c;
  }

  return { results: sortItems(results, state.sort), counts, hiddenInactive };
}

export function sortItems(items: ListItem[], sort: string): ListItem[] {
  const out = [...items];
  const az = (a: ListItem, b: ListItem) => a.title.localeCompare(b.title);
  switch (sort) {
    case 'az':
      return out.sort(az);
    case 'org':
      return out.sort((a, b) => (a.subtitle ?? '').localeCompare(b.subtitle ?? '') || az(a, b));
    case 'updated':
      return out.sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? '') || az(a, b));
    default:
      // Recommended: active first, then most recently updated.
      return out.sort((a, b) => Number(b.active) - Number(a.active) || (b.updated ?? '').localeCompare(a.updated ?? '') || az(a, b));
  }
}

export function stateFromUrl(search: string, facets: FacetDef[], defaultSort: string): FilterState {
  const p = new URLSearchParams(search);
  const selected: Record<string, string[]> = {};
  for (const f of facets) {
    const valid = new Set(f.options.map((o) => o.value));
    selected[f.key] = (p.get(f.key) ?? '').split(',').filter((v) => valid.has(v));
  }
  return { q: p.get('q') ?? '', sort: p.get('sort') ?? defaultSort, inactive: p.get('inactive') === '1', selected };
}

export function stateToSearch(state: FilterState, defaultSort: string): string {
  const p = new URLSearchParams();
  if (state.q.trim()) p.set('q', state.q.trim());
  for (const [k, v] of Object.entries(state.selected)) if (v.length) p.set(k, v.join(','));
  if (state.inactive) p.set('inactive', '1');
  if (state.sort !== defaultSort) p.set('sort', state.sort);
  const s = p.toString().replace(/%2C/g, ',');
  return s ? `?${s}` : '';
}
