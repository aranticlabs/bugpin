import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import dts from 'vite-plugin-dts';
import path from 'path';

export default defineConfig({
  plugins: [
    preact(),
    tailwindcss(),
    dts({
      include: ['**/*.ts', '**/*.tsx', '../shared/**/*.ts'],
      exclude: ['tests/**', 'node_modules/**', 'dist/**', 'vite.config.ts'],
      tsconfigPath: './tsconfig.json',
      compilerOptions: {
        rootDir: path.resolve(import.meta.dirname, '..'),
      },
    }),
  ],
  root: '.',
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, '../shared'),
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
    minify: 'oxc',
    cssCodeSplit: false,
    sourcemap: false,
  },
});
