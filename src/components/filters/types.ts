export type FacetOption = { value: string; label: string };

export type FacetDef = {
  key: string;
  label: string;
  options: FacetOption[];
  /** chips = compact toggle buttons; checkbox = vertical list with counts. */
  display?: 'chips' | 'checkbox';
  /** Show this many options before "Show more". */
  collapsedCount?: number;
};

export type Tone = 'green' | 'amber' | 'grey' | 'brand';

export type ListItem = {
  id: string;
  href: string;
  title: string;
  subtitle?: string;
  logo?: string;
  meta: string[];
  tags: string[];
  badge?: { label: string; tone: Tone };
  summary?: string;
  facets: Record<string, string[]>;
  active: boolean;
  updated?: string;
  sortKey?: string;
  search: string;
};

export type LockedFilter = { key: string; value: string; label: string; clearHref: string };

export type ListConfig = {
  facets: FacetDef[];
  sorts: { value: string; label: string }[];
  /** Filters fixed by the page (e.g. a city landing page); shown as chips linking to the broader page. */
  locked?: LockedFilter[];
  noun: [string, string];
  inactiveLabel?: string;
  searchPlaceholder: string;
  pageSize?: number;
  promo: { title: string; text: string; label: string; href: string };
};
