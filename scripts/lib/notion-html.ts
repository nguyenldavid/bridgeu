import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

export type NotionPage = {
  id: string; // 32-hex, no dashes
  file: string;
  title: string;
  icon?: string; // absolute local path or remote URL
  cover?: string;
  props: Record<string, string>;
  $: cheerio.CheerioAPI;
};

export function loadPage(file: string): NotionPage {
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
  const article = $('article.page');
  const id = (article.attr('id') ?? '').replace(/-/g, '');
  const dir = path.dirname(file);
  const resolve = (src?: string) => {
    if (!src) return undefined;
    if (/^https?:/.test(src)) return src;
    return path.join(dir, decodeURIComponent(src));
  };
  const props: Record<string, string> = {};
  $('table.properties tr').each((_, tr) => {
    const key = $(tr).find('th').text().trim();
    props[key] = $(tr).find('td').text().trim();
  });
  return {
    id,
    file,
    title: $('h1.page-title').first().text().trim(),
    icon: resolve($('.page-header-icon img.icon').attr('src')),
    cover: resolve($('img.page-cover-image').attr('src')),
    props,
    $,
  };
}

export type AssetHandler = {
  /** Copies a local/remote image next to the entry and returns the markdown-relative src, or null to drop it. */
  image(absOrUrl: string): string | null;
  /** Handles non-image attachments (video, pdf). Returns replacement HTML/markdown, or null to drop. */
  attachment(absPath: string): string | null;
  /** Maps a Notion page id to a site route, or null to unlink. */
  link(notionId: string): string | null;
};

const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '_' });
td.use(gfm);
td.addRule('list-item', {
  filter: 'li',
  replacement: (content, node) => {
    const parent = node.parentNode as HTMLElement;
    const index = Array.prototype.indexOf.call(parent.children, node);
    const marker = parent.nodeName === 'OL' ? `${index + 1}. ` : '- ';
    const text = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, `\n${' '.repeat(marker.length)}`);
    return marker + text.trimEnd() + (node.nextSibling ? '\n' : '');
  },
});
td.keep(['video']);
td.addRule('figure-image', {
  filter: (node) => node.nodeName === 'FIGURE',
  replacement: (content) => `\n\n${content.trim()}\n\n`,
});

/** Converts the page body to markdown, dropping Notion boilerplate (feedback footer, embedded DB tables). */
export function bodyToMarkdown(page: NotionPage, assets: AssetHandler): string {
  const { $ } = page;
  const body = $('.page-body').first().clone();
  if (!body.length) return '';
  const dir = path.dirname(page.file);

  // The "See a mistake or have any feedback?" footer is rendered by the site layout instead.
  body.find('.column-list').each((_, el) => {
    if (/see a mistake|feedback/i.test($(el).text())) $(el).remove();
  });
  body.find('p, h1, h2, h3').each((_, el) => {
    if (/^see a mistake or have any feedback\??$/i.test($(el).text().trim())) {
      $(el).nextAll().remove();
      $(el).remove();
    }
  });
  body.find('.collection-content').remove();
  body.find('p').each((_, el) => {
    if (/^related opportunities:?$/i.test($(el).text().trim())) $(el).remove();
  });

  // Notion exports every bullet as its own <ul>; merge adjacent lists so markdown gets tight lists.
  body.find('ul + ul, ol + ol').each((_, el) => {
    const prev = $(el).prev();
    if (prev[0]?.tagName === el.tagName) {
      prev.append($(el).children());
      $(el).remove();
    }
  });

  // Collapse Notion's deeply nested <strong> wrappers.
  for (let i = 0; i < 30 && body.find('strong > strong').length; i++) {
    body.find('strong > strong').each((_, el) => {
      $(el).replaceWith($(el).html() ?? '');
    });
  }

  body.find('img').each((_, el) => {
    const src = $(el).attr('src') ?? '';
    const abs = /^https?:/.test(src) ? src : path.join(dir, decodeURIComponent(src));
    const out = assets.image(abs);
    if (out) {
      $(el).attr('src', out);
      $(el).attr('alt', $(el).attr('alt') || '');
      // Images are wrapped in <a href=same-image> by Notion; unwrap.
      const parent = $(el).parent('a');
      if (parent.length) parent.replaceWith($(el));
    } else {
      $(el).remove();
    }
  });

  body.find('.source a, a').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (/^(https?:|mailto:|tel:)/.test(href)) return;
    const id = href.match(/([0-9a-f]{32})\.html$/)?.[1];
    if (id) {
      const route = assets.link(id);
      if (route) $(el).attr('href', route);
      else $(el).replaceWith($(el).text());
      return;
    }
    if (href && !href.startsWith('#')) {
      const abs = path.join(dir, decodeURIComponent(href));
      const replacement = fs.existsSync(abs) ? assets.attachment(abs) : null;
      const container = $(el).closest('figure').length ? $(el).closest('figure') : $(el);
      if (replacement) container.replaceWith(`<div data-attachment>${replacement}</div>`);
      else container.remove();
    }
  });

  let md = td.turndown(body.html() ?? '');
  md = md
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*\*\*\s*\*\*\s*$/gm, '')
    .trim();
  // Drop Notion "template" bodies that only contain empty labels.
  const meaningful = md.replace(/\*\*[^*]+:\*\*|[#*_\s:]|Description|Due date|Requirements/gi, '');
  return meaningful.length < 20 ? '' : md;
}
