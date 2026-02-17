import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  root: '.',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  build: {
    lib: {
      entry: 'index.ts',
      name: 'BugPin',
      fileName: (format) => {
        if (format === 'iife') return 'widget.js';
        if (format === 'es') return 'widget.esm.js';
        return 'widget.cjs.js';
      },
      formats: ['iife', 'es', 'cjs'],
    },
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: 'esbuild',
    cssCodeSplit: false,
    sourcemap: true,
  },
});
