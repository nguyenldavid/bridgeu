import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { CAUSES, CITIES, MODES, OPP_STATUSES, RESEARCH_FIELDS } from './lib/taxonomy';

const slugs = <T extends readonly { slug: string }[]>(list: T) => z.enum(list.map((x) => x.slug) as [T[number]['slug'], ...T[number]['slug'][]]);

const city = slugs(CITIES);
const cause = slugs(CAUSES);

const organizations = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/organizations' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      city,
      causes: z.array(cause).default([]),
      status: slugs(OPP_STATUSES).optional(),
      website: z.url().optional(),
      logo: image().optional(),
      summary: z.string().default(''),
      updatedAt: z.coerce.date().optional(),
    }),
});

const opportunities = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/opportunities' }),
  schema: z.object({
    title: z.string(),
    org: z.string().optional(),
    orgName: z.string().optional(),
    city,
    mode: slugs(MODES),
    causes: z.array(cause).default([]),
    status: slugs(OPP_STATUSES),
    applyUrl: z.url().optional(),
    summary: z.string().default(''),
    updatedAt: z.coerce.date().optional(),
  }),
});

const research = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/research' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      kind: z.enum(['program', 'lab-position']),
      institution: z.string().optional(),
      scope: z.enum(['city', 'national', 'remote']),
      city: z.string().optional(),
      province: z.string().optional(),
      fields: z.array(slugs(RESEARCH_FIELDS)).default([]),
      terms: z.array(z.enum(['summer', 'fall'])).default(['summer']),
      levels: z.array(z.string()).default([]),
      eligibility: z.enum(['open', 'university-specific', 'unspecified']),
      eligibleUniversities: z.array(z.string()).optional(),
      applyUrl: z.url().optional(),
      logo: image().optional(),
      summary: z.string().optional(),
      updatedAt: z.coerce.date().optional(),
    }),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      section: z.enum(['blog', 'med-school']),
      tags: z.array(z.string()).default([]),
      authors: z.array(z.string()).default([]),
      cover: image().optional(),
      summary: z.string().optional(),
      draft: z.boolean().default(false),
    }),
});

const team = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/team' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      role: z.string(),
      photo: image().optional(),
      link: z.url().optional(),
    }),
});

export const collections = { organizations, opportunities, research, blog, team };
