import { useEffect, useMemo, useRef, useState } from 'react';
import type { FacetDef, ListConfig, ListItem, Tone } from './types';
import { applyFilters, stateFromUrl, stateToSearch, type FilterState } from './filtering';

type Props = { items: ListItem[]; config: ListConfig };

const PROMO_AFTER = 8;

export default function FilterableList({ items, config }: Props) {
  const defaultSort = config.sorts[0]?.value ?? 'recommended';
  const pageSize = config.pageSize ?? 24;
  const emptySelection = useMemo(() => Object.fromEntries(config.facets.map((f) => [f.key, [] as string[]])), [config.facets]);
  const [state, setState] = useState<FilterState>({ q: '', sort: defaultSort, inactive: false, selected: emptySelection });
  const [limit, setLimit] = useState(pageSize);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hydrated = useRef(false);

  // URL is the source of truth: read once on mount, then mirror every change.
  useEffect(() => {
    setState(stateFromUrl(window.location.search, config.facets, defaultSort));
    hydrated.current = true;
    const onPop = () => setState(stateFromUrl(window.location.search, config.facets, defaultSort));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [config.facets, defaultSort]);

  useEffect(() => {
    if (!hydrated.current) return;
    const next = `${window.location.pathname}${stateToSearch(state, defaultSort)}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
  }, [state, defaultSort]);

  useEffect(() => setLimit(pageSize), [state, pageSize]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
  }, [drawerOpen]);

  const { results, counts, hiddenInactive } = useMemo(() => applyFilters(items, config.facets, state), [items, config.facets, state]);

  const toggle = (key: string, value: string) =>
    setState((s) => {
      const cur = s.selected[key] ?? [];
      return { ...s, selected: { ...s.selected, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] } };
    });
  const clearAll = () => setState((s) => ({ ...s, q: '', inactive: false, selected: emptySelection }));

  const activeChips = config.facets.flatMap((f) =>
    (state.selected[f.key] ?? []).map((v) => ({ key: f.key, value: v, label: f.options.find((o) => o.value === v)?.label ?? v })),
  );
  const activeCount = activeChips.length + (state.inactive ? 1 : 0);
  const [singular, plural] = config.noun;
  const shown = results.slice(0, limit);

  const panel = <FacetPanel facets={config.facets} state={state} counts={counts} onToggle={toggle} />;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden lg:block" aria-label="Filters">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2 pb-6">{panel}</div>
      </aside>

      <div className="min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Search</span>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input
              type="search"
              value={state.q}
              onChange={(e) => setState((s) => ({ ...s, q: e.target.value }))}
              placeholder={config.searchPlaceholder}
              className="w-full rounded-full border border-line bg-white py-2.5 pr-4 pl-11 text-sm shadow-sm placeholder:text-muted/80 focus:border-brand-400 focus:outline-none"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="btn-secondary flex-1 lg:hidden"
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                <path d="M2.5 5a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 0 1.5H3.25A.75.75 0 0 1 2.5 5Zm2.5 5a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 5 10Zm2.5 5a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5A.75.75 0 0 1 7.5 15Z" />
              </svg>
              Filters{activeCount ? ` (${activeCount})` : ''}
            </button>
            <label className="flex-1 sm:flex-none">
              <span className="sr-only">Sort by</span>
              <select
                value={state.sort}
                onChange={(e) => setState((s) => ({ ...s, sort: e.target.value }))}
                className="w-full rounded-full border border-line bg-white py-2.5 pr-8 pl-4 text-sm font-medium shadow-sm focus:border-brand-400 focus:outline-none"
              >
                {config.sorts.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="mr-1 text-sm font-medium text-muted" aria-live="polite">
            {results.length} {results.length === 1 ? singular : plural}
          </p>
          {config.locked?.map((l) => (
            <a key={`${l.key}-${l.value}`} href={l.clearHref} className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800 hover:bg-brand-200" title={`Remove ${l.label}`}>
              {l.label}
              <span aria-hidden="true">✕</span>
            </a>
          ))}
          {activeChips.map((c) => (
            <button
              key={`${c.key}-${c.value}`}
              type="button"
              onClick={() => toggle(c.key, c.value)}
              className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700"
              aria-label={`Remove filter ${c.label}`}
            >
              {c.label}
              <span aria-hidden="true">✕</span>
            </button>
          ))}
          {(activeCount > 0 || state.q) && (
            <button type="button" onClick={clearAll} className="text-xs font-semibold text-brand-700 underline underline-offset-2">
              Clear all
            </button>
          )}
        </div>

        {results.length === 0 ? (
          <EmptyState promo={config.promo} onClear={clearAll} />
        ) : (
          <ul className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
            {shown.map((item, i) => (
              <Row key={item.id} item={item} promo={i === PROMO_AFTER - 1 && results.length > PROMO_AFTER ? config.promo : undefined} />
            ))}
          </ul>
        )}

        {results.length > limit && (
          <div className="mt-8 flex justify-center">
            <button type="button" onClick={() => setLimit((l) => l + pageSize)} className="btn-secondary btn-lg">
              Show more ({results.length - limit} left)
            </button>
          </div>
        )}

        {hiddenInactive > 0 && (
          <p className="mt-6 text-center text-sm text-muted">
            {hiddenInactive} {config.inactiveLabel ?? 'inactive listings'} hidden.{' '}
            <button type="button" onClick={() => setState((s) => ({ ...s, inactive: true }))} className="font-semibold text-brand-700 underline underline-offset-2">
              Show them
            </button>
          </p>
        )}
        {state.inactive && (
          <p className="mt-6 text-center text-sm text-muted">
            Showing inactive listings.{' '}
            <button type="button" onClick={() => setState((s) => ({ ...s, inactive: false }))} className="font-semibold text-brand-700 underline underline-offset-2">
              Hide them
            </button>
          </p>
        )}
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close filters" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-lg font-bold">Filters</h2>
              <button type="button" onClick={() => setDrawerOpen(false)} className="flex size-9 items-center justify-center rounded-full hover:bg-brand-50" aria-label="Close filters">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{panel}</div>
            <div className="flex gap-3 border-t border-line p-4">
              <button type="button" onClick={clearAll} className="btn-secondary flex-1">
                Clear
              </button>
              <button type="button" onClick={() => setDrawerOpen(false)} className="btn-primary flex-[2]">
                Show {results.length} {results.length === 1 ? singular : plural}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FacetPanel({ facets, state, counts, onToggle }: { facets: FacetDef[]; state: FilterState; counts: Record<string, Record<string, number>>; onToggle: (k: string, v: string) => void }) {
  return (
    <div className="space-y-7">
      {facets.map((f) => (
        <FacetGroup key={f.key} facet={f} selected={state.selected[f.key] ?? []} counts={counts[f.key] ?? {}} onToggle={(v) => onToggle(f.key, v)} />
      ))}
    </div>
  );
}

function FacetGroup({ facet, selected, counts, onToggle }: { facet: FacetDef; selected: string[]; counts: Record<string, number>; onToggle: (v: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const limit = facet.collapsedCount ?? Infinity;
  // Configured order, but options with results come first so collapsed lists aren't full of zeros.
  const ordered = [...facet.options].sort((a, b) => Number((counts[b.value] ?? 0) > 0 || selected.includes(b.value)) - Number((counts[a.value] ?? 0) > 0 || selected.includes(a.value)));
  const options = ordered.filter((o, i) => expanded || i < limit || selected.includes(o.value));
  const hiddenCount = facet.options.length - options.length;

  if (facet.display === 'chips') {
    return (
      <fieldset>
        <legend className="mb-2.5 text-sm font-semibold">{facet.label}</legend>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const on = selected.includes(o.value);
            const n = counts[o.value] ?? 0;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                disabled={!on && n === 0}
                onClick={() => onToggle(o.value)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink hover:border-brand-300 hover:bg-brand-50'
                }`}
              >
                {o.label} <span className={on ? 'text-brand-100' : 'text-muted'}>{n}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">{facet.label}</legend>
      <div className="space-y-0.5">
        {options.map((o) => {
          const on = selected.includes(o.value);
          const n = counts[o.value] ?? 0;
          return (
            <label key={o.value} className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-brand-50 ${!on && n === 0 ? 'opacity-40' : ''}`}>
              <input type="checkbox" checked={on} disabled={!on && n === 0} onChange={() => onToggle(o.value)} className="size-4 rounded border-line accent-brand-600" />
              <span className="flex-1">{o.label}</span>
              <span className="text-xs text-muted tabular-nums">{n}</span>
            </label>
          );
        })}
      </div>
      {facet.options.length > limit && (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1 px-2 text-sm font-semibold text-brand-700 hover:underline">
          {expanded ? 'Show less' : `Show ${hiddenCount} more`}
        </button>
      )}
    </fieldset>
  );
}

const toneClass: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  grey: 'bg-slate-100 text-slate-600 ring-slate-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
};

function Row({ item, promo }: { item: ListItem; promo?: ListConfig['promo'] }) {
  return (
    <>
      <li>
        <Card item={item} />
      </li>
      {promo && (
        <li className="md:col-span-2">
          <a href={promo.href} data-cta="list-inline" className="group flex flex-col gap-4 rounded-2xl bg-brand-700 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold">{promo.title}</p>
              <p className="mt-1 text-sm text-brand-100">{promo.text}</p>
            </div>
            <span className="btn shrink-0 bg-white text-brand-800 group-hover:bg-brand-50">{promo.label} →</span>
          </a>
        </li>
      )}
    </>
  );
}

function Card({ item }: { item: ListItem }) {
  return (
    <article className={`group relative flex h-full gap-4 rounded-2xl border border-line bg-white p-4 transition hover:border-brand-300 hover:shadow-md ${item.active ? '' : 'opacity-70'}`}>
      <Logo src={item.logo} name={item.subtitle || item.title} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug text-ink group-hover:text-brand-700">
            <a href={item.href} className="after:absolute after:inset-0 after:rounded-2xl">
              {item.title}
            </a>
          </h3>
          {item.badge && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${toneClass[item.badge.tone]}`}>{item.badge.label}</span>}
        </div>
        {item.subtitle && <p className="mt-0.5 truncate text-sm text-muted">{item.subtitle}</p>}
        {item.meta.length > 0 && <p className="mt-1 text-xs font-medium text-muted">{item.meta.join(' · ')}</p>}
        {item.summary && <p className="mt-2 line-clamp-2 text-sm text-muted">{item.summary}</p>}
        {item.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.tags.slice(0, 3).map((t) => (
              <span key={t} className="pill">
                {t}
              </span>
            ))}
            {item.tags.length > 3 && <span className="pill bg-slate-100 text-slate-600">+{item.tags.length - 3}</span>}
          </div>
        )}
      </div>
    </article>
  );
}

export function Logo({ src, name }: { src?: string; name: string }) {
  if (src) return <img src={src} alt="" width={48} height={48} loading="lazy" decoding="async" className="size-12 shrink-0 rounded-xl border border-line bg-white object-contain p-1" />;
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-sm font-bold text-brand-800">
      {initials || '•'}
    </span>
  );
}

function EmptyState({ promo, onClear }: { promo: ListConfig['promo']; onClear: () => void }) {
  return (
    <div className="mt-6 rounded-3xl border border-dashed border-brand-200 bg-brand-50/50 p-8 text-center">
      <p className="text-lg font-bold">No matches yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">Try removing a filter, or let us tell you when something matching is posted.</p>
      <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
        <a href={promo.href.replace(/utm_campaign=[^&]*/, 'utm_campaign=empty-state')} data-cta="empty-state" className="btn-primary">
          Get notified in the app
        </a>
        <button type="button" onClick={onClear} className="btn-secondary">
          Clear filters
        </button>
      </div>
    </div>
  );
}
