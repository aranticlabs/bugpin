/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { readFileSync } from 'fs';

const packageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'),
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
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  build: {
    outDir: '../../dist/admin',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // React and related libraries
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // UI libraries
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-switch',
            '@radix-ui/react-label',
            '@radix-ui/react-separator',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-avatar',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-popover',
            '@radix-ui/react-slot',
          ],
          // TanStack Query and data fetching
          'vendor-query': ['@tanstack/react-query', 'axios'],
          // Utility libraries
          'vendor-utils': [
            'clsx',
            'tailwind-merge',
            'class-variance-authority',
            'lucide-react',
            'sonner',
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
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
