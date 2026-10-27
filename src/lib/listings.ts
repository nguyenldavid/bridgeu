import { getCollection, type CollectionEntry } from 'astro:content';
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
import type { FacetDef, ListItem, Tone } from '../components/filters/types';
import { normalize } from '../components/filters/filtering';
import { CAUSES, MODES, OPP_STATUSES, PROVINCES, RESEARCH_FIELDS, causeName, cityName, fieldName, statusName } from './taxonomy';

export type Opportunity = CollectionEntry<'opportunities'>;
export type Organization = CollectionEntry<'organizations'>;
export type Research = CollectionEntry<'research'>;

const logoCache = new Map<ImageMetadata, string>();

export async function logoSrc(img?: ImageMetadata): Promise<string | undefined> {
  if (!img) return undefined;
  if (img.format === 'svg') return img.src;
  const hit = logoCache.get(img);
  if (hit) return hit;
  const out = await getImage({ src: img, width: 96, height: 96, fit: 'contain', background: '#ffffff', format: 'webp' });
  logoCache.set(img, out.src);
  return out.src;
}

export const isActiveStatus = (s?: string) => OPP_STATUSES.find((x) => x.slug === s)?.active ?? true;

export function statusTone(s?: string): Tone {
  if (s === 'accepting') return 'green';
  if (s === 'contact') return 'amber';
  return 'grey';
}

export const oppHref = (o: Opportunity) => `/opportunities/${o.id}`;
export const orgHref = (o: Organization) => `/organizations/${o.id}`;
export const researchHref = (r: Research) => `/research/${r.id}`;

export async function loadVolunteering() {
  const [opps, orgs] = await Promise.all([getCollection('opportunities'), getCollection('organizations')]);
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  return { opps, orgs, orgById };
}

export async function opportunityItems(opps: Opportunity[], orgById: Map<string, Organization>): Promise<ListItem[]> {
  return Promise.all(
    opps.map(async (o) => {
      const org = o.data.org ? orgById.get(o.data.org) : undefined;
      const orgName = org?.data.name ?? o.data.orgName ?? '';
      const causes = o.data.causes.map(causeName);
      return {
        id: o.id,
        href: oppHref(o),
        title: o.data.title,
        subtitle: orgName,
        logo: await logoSrc(org?.data.logo),
        meta: [cityName(o.data.city), MODES.find((m) => m.slug === o.data.mode)?.name ?? ''].filter(Boolean),
        tags: causes,
        badge: o.data.status === 'accepting' ? undefined : { label: statusName(o.data.status), tone: statusTone(o.data.status) },
        summary: o.data.summary,
        facets: { cause: o.data.causes, status: [o.data.status], mode: [o.data.mode], org: org ? [org.id] : [] },
        active: isActiveStatus(o.data.status),
        updated: o.data.updatedAt?.toISOString().slice(0, 10),
        search: normalize([o.data.title, orgName, causes.join(' '), o.data.summary].join(' ')),
      } satisfies ListItem;
    }),
  );
}

export function opportunityFacets(items: ListItem[], orgs: Organization[], lockedKeys: string[] = []): FacetDef[] {
  const present = (key: string) => new Set(items.flatMap((i) => i.facets[key] ?? []));
  const causes = present('cause');
  const statuses = present('status');
  const modes = present('mode');
  const orgIds = present('org');
  const facets: FacetDef[] = [
    {
      key: 'status',
      label: 'Availability',
      display: 'chips',
      options: OPP_STATUSES.filter((s) => s.active && statuses.has(s.slug)).map((s) => ({ value: s.slug, label: s.name })),
    },
    { key: 'mode', label: 'Format', display: 'chips', options: MODES.filter((m) => modes.has(m.slug)).map((m) => ({ value: m.slug, label: m.name })) },
    { key: 'cause', label: 'Cause', collapsedCount: 10, options: CAUSES.filter((c) => causes.has(c.slug)).map((c) => ({ value: c.slug, label: c.name })) },
    {
      key: 'org',
      label: 'Organization',
      collapsedCount: 6,
      options: orgs
        .filter((o) => orgIds.has(o.id))
        .sort((a, b) => a.data.name.localeCompare(b.data.name))
        .map((o) => ({ value: o.id, label: o.data.name })),
    },
  ];
  return facets.filter((f) => !lockedKeys.includes(f.key) && f.options.length > 0);
}

export async function organizationItems(orgs: Organization[], oppCount: Map<string, number>): Promise<ListItem[]> {
  return Promise.all(
    orgs.map(async (o) => {
      const n = oppCount.get(o.id) ?? 0;
      const causes = o.data.causes.map(causeName);
      return {
        id: o.id,
        href: orgHref(o),
        title: o.data.name,
        logo: await logoSrc(o.data.logo),
        meta: [cityName(o.data.city), n ? `${n} ${n === 1 ? 'opportunity' : 'opportunities'}` : 'No listed roles'],
        tags: causes,
        badge: o.data.status && o.data.status !== 'accepting' ? { label: statusName(o.data.status), tone: statusTone(o.data.status) } : undefined,
        summary: o.data.summary,
        facets: { cause: o.data.causes, status: [o.data.status ?? 'accepting'] },
        active: isActiveStatus(o.data.status),
        updated: o.data.updatedAt?.toISOString().slice(0, 10),
        search: normalize([o.data.name, causes.join(' '), o.data.summary].join(' ')),
      } satisfies ListItem;
    }),
  );
}

const researchLocation = (r: Research) => (r.data.scope === 'national' ? 'Canada-wide' : r.data.scope === 'remote' ? 'Remote' : r.data.city ?? '');

export async function researchItems(entries: Research[]): Promise<ListItem[]> {
  return Promise.all(
    entries.map(async (r) => {
      const fields = r.data.fields.map(fieldName);
      const location = researchLocation(r);
      const facetLocation = r.data.scope === 'city' ? [`city:${r.data.city}`, `prov:${r.data.province}`] : [r.data.scope];
      return {
        id: r.id,
        href: researchHref(r),
        title: r.data.title,
        subtitle: r.data.institution,
        logo: await logoSrc(r.data.logo),
        meta: [location, r.data.terms.includes('fall') ? 'Summer & fall' : 'Summer', r.data.kind === 'lab-position' ? 'Lab position' : ''].filter(Boolean),
        tags: fields,
        badge: r.data.eligibility === 'university-specific' ? { label: 'University-specific', tone: 'amber' } : r.data.kind === 'lab-position' ? { label: 'Lab position', tone: 'brand' } : undefined,
        summary: r.data.summary,
        facets: {
          location: facetLocation,
          field: r.data.fields,
          eligibility: [r.data.eligibility],
          term: r.data.terms,
          kind: [r.data.kind],
        },
        active: true,
        updated: r.data.updatedAt?.toISOString().slice(0, 10),
        search: normalize([r.data.title, r.data.institution, location, fields.join(' '), r.data.summary].join(' ')),
      } satisfies ListItem;
    }),
  );
}

export function researchFacets(entries: Research[]): FacetDef[] {
  const cities = [...new Set(entries.filter((r) => r.data.scope === 'city').map((r) => `${r.data.province}|${r.data.city}`))].sort();
  const provinces = [...new Set(entries.map((r) => r.data.province).filter((p): p is string => !!p))].sort((a, b) => (a === 'ON' ? -1 : b === 'ON' ? 1 : a.localeCompare(b)));
  const fields = new Set(entries.flatMap((r) => r.data.fields));
  const hasRemote = entries.some((r) => r.data.scope === 'remote');
  return [
    {
      key: 'location',
      label: 'Location',
      collapsedCount: 8,
      options: [
        { value: 'national', label: 'Canada-wide' },
        ...(hasRemote ? [{ value: 'remote', label: 'Remote' }] : []),
        ...provinces.map((p) => ({ value: `prov:${p}`, label: `All of ${PROVINCES[p] ?? p}` })),
        ...cities.map((c) => {
          const [, city] = c.split('|');
          return { value: `city:${city}`, label: city! };
        }),
      ],
    },
    { key: 'field', label: 'Field', collapsedCount: 8, options: RESEARCH_FIELDS.filter((f) => fields.has(f.slug)).map((f) => ({ value: f.slug, label: f.name })) },
    {
      key: 'eligibility',
      label: 'Eligibility',
      display: 'chips',
      options: [
        { value: 'open', label: 'Open to all students' },
        { value: 'university-specific', label: 'University-specific' },
      ],
    },
    {
      key: 'term',
      label: 'Term',
      display: 'chips',
      options: [
        { value: 'summer', label: 'Summer' },
        { value: 'fall', label: 'Fall' },
      ],
    },
  ];
}
