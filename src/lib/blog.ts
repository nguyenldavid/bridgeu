import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** Editorial topics shown as filters on /blog. A post can belong to several. */
export const TOPICS = [
  {
    slug: 'research-opportunities',
    name: 'Research opportunities',
    description: 'Monthly roundups of summer research programs across Canada, with deadlines and links.',
    match: (p: Post) => p.data.tags.includes('Opportunities'),
  },
  {
    slug: 'applying-to-research',
    name: 'Applying to research',
    description: 'How to write cold emails, build a research CV and approach principal investigators.',
    match: (p: Post) => p.data.tags.includes('Tips to Applying to Research'),
  },
  {
    slug: 'student-interviews',
    name: 'Student interviews',
    description: 'Conversations with students who landed research positions and medical school offers.',
    match: (p: Post) => p.data.tags.includes('Student Interviews'),
  },
  {
    slug: 'medical-school',
    name: 'Medical school',
    description: 'Casper, ABS and supplementary application advice from current Canadian medical students.',
    match: (p: Post) => p.data.section === 'med-school' || p.data.tags.includes('Tips to Applying to Medical School'),
  },
] as const;

export type Topic = (typeof TOPICS)[number];

export async function getPosts(): Promise<Post[]> {
  return (await getCollection('blog', (p) => !p.data.draft)).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export const topicsOf = (p: Post) => TOPICS.filter((t) => t.match(p));

export const isVideo = (p: Post) => (p.body ?? '').includes('<video');

/** Short format label shown beside the date. */
export function formatOf(p: Post): string {
  if (isVideo(p)) return 'Video';
  if (p.data.tags.includes('Opportunities')) return 'Roundup';
  if (p.data.tags.includes('Student Interviews')) return 'Interview';
  return 'Guide';
}

export function readingTime(p: Post): string {
  if (isVideo(p)) return '1 min watch';
  const words = (p.body ?? '')
    .replace(/<[^>]+>|!\[[^\]]*\]\([^)]*\)|[#*_>`-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 230))} min read`;
}

export const formatDate = (d: Date, month: 'long' | 'short' = 'long') => d.toLocaleDateString('en-CA', { year: 'numeric', month, day: 'numeric', timeZone: 'UTC' });

export const byline = (p: Post) => p.data.authors.join(' and ');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * One-paragraph summary for lists. Roundups all open with the same greeting,
 * so they're summarized from the programs they list instead.
 */
export function deckOf(p: Post): string {
  if (p.data.tags.includes('Opportunities')) {
    const programs = [...(p.body ?? '').matchAll(/^###\s+(.+)$/gm)]
      .map((m) => m[1].replace(/[*_]/g, '').replace(/^[^\p{L}\p{N}]+/u, '').trim())
      .filter((t) => t && !/^opportunities due/i.test(t));
    const month = MONTHS.findIndex((m) => p.data.title.startsWith(m));
    if (programs.length >= 2 && month >= 0) {
      const year = p.data.date.getUTCFullYear() + (month < p.data.date.getUTCMonth() ? 1 : 0);
      const named = programs.slice(0, 3);
      const list = named.length === 3 ? `${named[0]}, ${named[1]} and ${named[2]}` : named.join(' and ');
      return `${programs.length} research programs closing in ${MONTHS[month]} ${year}, including ${list}.`;
    }
  }
  // Drop attachment-only summaries ("Download guide.pdf") and letter-style salutations.
  const summary = (p.data.summary ?? '').replace(/\\/g, '').replace(/^Dear [^,]{1,40},\s*/, '');
  return /^download\b/i.test(summary) ? '' : summary;
}

/** Article pages only show a dek when it isn't just the opening paragraph repeated. */
export const isGeneratedDeck = (p: Post) => p.data.tags.includes('Opportunities') && deckOf(p) !== (p.data.summary ?? '');
