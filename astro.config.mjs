import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://wizardloop.com',
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    sitemap({ filter: (page) => !/\/404(?:\.html|\/)?$/.test(page) }),
  ],
  server: { host: '127.0.0.1', port: 4322 },
  build: { format: 'directory' },
  vite: { build: { sourcemap: false } },
});
