// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { unified } from '@astrojs/markdown-remark';
import remarkBlogBlocks from './src/lib/remark-blog-blocks.mjs';

export default defineConfig({
  site: 'https://bridgeu.ca',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  prefetch: { defaultStrategy: 'hover' },
  // remark pipeline (rather than the default Sätteri) so custom remark plugins run.
  markdown: { processor: unified({ remarkPlugins: [remarkBlogBlocks] }) },
  integrations: [react(), sitemap({ filter: (page) => !page.includes('/404') })],
  vite: { plugins: [tailwindcss()] },
});
