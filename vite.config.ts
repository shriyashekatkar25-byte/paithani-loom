import { defineConfig } from 'vite';

export default defineConfig({
  base: '/paithani-loom/',
  build: { outDir: 'docs', emptyOutDir: false, assetsDir: 'assets', target: 'es2020' },
  test: { environment: 'jsdom', globals: true, include: ['tests/**/*.test.ts'] },
});
