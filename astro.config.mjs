// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://bridgeu.ca',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  prefetch: { defaultStrategy: 'hover' },
  integrations: [react(), sitemap({ filter: (page) => !page.includes('/404') })],
  vite: { plugins: [tailwindcss()] },
});
