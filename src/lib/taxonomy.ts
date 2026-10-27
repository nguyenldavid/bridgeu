// Single source of truth for public facet values. Shared by the import script and the site.

export const CITIES = [
  { slug: 'kingston', name: 'Kingston' },
  { slug: 'london', name: 'London' },
] as const;

export type CitySlug = (typeof CITIES)[number]['slug'];

export function cityName(slug: string): string {
  return CITIES.find((c) => c.slug === slug)?.name ?? slug;
}

export const CAUSES = [
  { slug: 'healthcare', name: 'Healthcare' },
  { slug: 'mental-health', name: 'Mental Health' },
  { slug: 'education', name: 'Education & Tutoring' },
  { slug: 'children-youth', name: 'Children & Youth' },
  { slug: 'seniors', name: 'Seniors' },
  { slug: 'poverty-relief', name: 'Poverty Relief' },
  { slug: 'food-security', name: 'Food Security' },
  { slug: 'housing', name: 'Housing' },
  { slug: 'accessibility', name: 'Accessibility & Disability' },
  { slug: 'arts-culture', name: 'Arts & Culture' },
  { slug: 'animals', name: 'Animals' },
  { slug: 'environment', name: 'Environment' },
  { slug: 'justice-equity', name: 'Justice & Equity' },
  { slug: 'gender-equality', name: 'Gender Equality' },
  { slug: 'lgbtq', name: '2SLGBTQ+' },
  { slug: 'substance-use', name: 'Substance Use' },
  { slug: 'global-development', name: 'Global Development' },
  { slug: 'employment', name: 'Employment' },
  { slug: 'government', name: 'Government & Public Service' },
  { slug: 'mnbgf', name: 'MNBGF' },
  { slug: 'other', name: 'Other' },
] as const;

export type CauseSlug = (typeof CAUSES)[number]['slug'];

export function causeName(slug: string): string {
  return CAUSES.find((c) => c.slug === slug)?.name ?? slug;
}

/** Raw Notion "Category" values → public cause slug. Unknown values fail the import. */
export const RAW_CATEGORY_MAP: Record<string, CauseSlug> = {
  Healthcare: 'healthcare',
  'Mental Health': 'mental-health',
  Education: 'education',
  'Child Care': 'children-youth',
  'Senior Care': 'seniors',
  'Poverty Relief': 'poverty-relief',
  'Food Insecurity': 'food-security',
  Housing: 'housing',
  Accessibility: 'accessibility',
  Disability: 'accessibility',
  Arts: 'arts-culture',
  Animals: 'animals',
  Environment: 'environment',
  'Clean Water & Sanitation': 'environment',
  'Responsible Consumption & Production': 'environment',
  'Peace & Justice': 'justice-equity',
  'Anti-Racial Discrimination': 'justice-equity',
  'Gender Equality': 'gender-equality',
  'Menstrual Equity': 'gender-equality',
  'LGBTQ+ Advocacy': 'lgbtq',
  'Substance Management': 'substance-use',
  'Global Development': 'global-development',
  Employment: 'employment',
  'Government (Municipal/Provincial/Federal)': 'government',
  MNBGF: 'mnbgf',
  Miscellaneous: 'other',
};

export const OPP_STATUSES = [
  { slug: 'accepting', name: 'Accepting volunteers', active: true },
  { slug: 'contact', name: 'Contact to join', active: true },
  { slug: 'not-accepting', name: 'Not currently accepting', active: false },
  { slug: 'suspended', name: 'Suspended', active: false },
  { slug: 'stale', name: 'May be out of date', active: false },
] as const;

export type OppStatus = (typeof OPP_STATUSES)[number]['slug'];

export function statusName(slug: string): string {
  return OPP_STATUSES.find((s) => s.slug === slug)?.name ?? slug;
}

export const MODES = [
  { slug: 'in-person', name: 'In person' },
  { slug: 'online', name: 'Online' },
  { slug: 'abroad', name: 'Abroad' },
] as const;

export type Mode = (typeof MODES)[number]['slug'];

export const PROVINCES: Record<string, string> = {
  ON: 'Ontario',
  BC: 'British Columbia',
  AB: 'Alberta',
  QC: 'Quebec',
};

export const RESEARCH_CITY_PROVINCE: Record<string, keyof typeof PROVINCES> = {
  Toronto: 'ON',
  Kingston: 'ON',
  Hamilton: 'ON',
  Ottawa: 'ON',
  Brampton: 'ON',
  Markham: 'ON',
  Barrie: 'ON',
  London: 'ON',
  Vancouver: 'BC',
  Edmonton: 'AB',
  Montreal: 'QC',
};

export const RESEARCH_FIELDS = [
  { slug: 'neuroscience', name: 'Neuroscience & Brain Health' },
  { slug: 'oncology', name: 'Cancer & Oncology' },
  { slug: 'cardiovascular', name: 'Heart & Vascular' },
  { slug: 'infection-immunity', name: 'Infection & Immunity' },
  { slug: 'genetics', name: 'Genetics & Molecular Biology' },
  { slug: 'child-health', name: 'Child & Maternal Health' },
  { slug: 'womens-health', name: "Women's Health" },
  { slug: 'metabolism', name: 'Diabetes, Liver & Metabolism' },
  { slug: 'nutrition', name: 'Nutrition' },
  { slug: 'transplant', name: 'Transplant & Organ Systems' },
  { slug: 'blood-stem-cells', name: 'Blood & Stem Cells' },
  { slug: 'biophysics', name: 'Biophysics & Medical Imaging' },
  { slug: 'ai-data', name: 'AI & Data Science' },
  { slug: 'public-health', name: 'Public & Population Health' },
  { slug: 'humanities', name: 'Health Humanities & Education' },
  { slug: 'environment', name: 'Environment & Urban' },
  { slug: 'multidisciplinary', name: 'Multidisciplinary' },
] as const;

export type FieldSlug = (typeof RESEARCH_FIELDS)[number]['slug'];

export function fieldName(slug: string): string {
  return RESEARCH_FIELDS.find((f) => f.slug === slug)?.name ?? slug;
}
