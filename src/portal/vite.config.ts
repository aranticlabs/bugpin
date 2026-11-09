import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'portal-boundary',
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk') continue;
          for (const id of Object.keys(output.modules)) {
            if (/[\\/]src[\\/]admin[\\/]|[\\/]@dnd-kit[\\/]/.test(id)) {
              this.error(
                'The reporter portal cannot include Admin Console or drag-and-drop modules'
              );
            }
          }
        }
      },
    },
  ],
  base: '/reporter-portal/',
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, '../shared'),
      '@shared-ui': path.resolve(import.meta.dirname, '../shared-ui'),
    },
  },
  build: { outDir: '../../dist/portal', emptyOutDir: true, sourcemap: false },
  server: {
    port: 7302,
    strictPort: true,
    proxy: {
      '/api/portal': { target: 'http://localhost:7301', changeOrigin: true, xfwd: true },
      '/branding': { target: 'http://localhost:7301', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    execArgv:
      Number.parseInt(process.versions.node, 10) >= 25 ? ['--no-experimental-webstorage'] : [],
    setupFiles: ['./tests/setup.ts'],
    include: ['./tests/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    css: true,
  },
});
