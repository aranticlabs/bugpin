/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { readFileSync } from 'fs';
import { defineConfig } from 'vitest/config';

const packageJson = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../package.json'), 'utf-8')
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  root: '.',
  base: '/admin',
  publicDir: 'public',
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, '../shared'),
    },
  },
  build: {
    outDir: '../../dist/admin',
    emptyOutDir: true,
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](?:react|react-dom|react-router|react-router-dom)(?:[\\/]|$)/,
              priority: 40,
            },
            {
              name: 'vendor-ui',
              test: /node_modules[\\/]@radix-ui[\\/]/,
              priority: 30,
            },
            {
              name: 'vendor-query',
              test: /node_modules[\\/](?:@tanstack[\\/]react-query|axios)(?:[\\/]|$)/,
              priority: 20,
            },
            {
              name: 'vendor-utils',
              test: /node_modules[\\/](?:clsx|tailwind-merge|class-variance-authority|lucide-react|sonner)(?:[\\/]|$)/,
              priority: 10,
            },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 7300,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:7301',
        changeOrigin: true,
      },
      '/branding': {
        target: 'http://localhost:7301',
        changeOrigin: true,
      },
      '/admin/branding': {
        target: 'http://localhost:7301',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/admin/, ''),
      },
      '/test-widget': {
        target: 'http://localhost:7301',
        changeOrigin: true,
      },
      '/widget.js': {
        target: 'http://localhost:7301',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 7300,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['./tests/**/*.test.{ts,tsx}'],
    css: true,
    // Use threads pool instead of forks to avoid stack overflow issues with coverage
    pool: 'threads',
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
