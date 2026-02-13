import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  define: {
    // Buffer polyfill for @react-pdf/renderer
    'global': 'globalThis',
  },
  optimizeDeps: {
    include: ['@react-pdf/renderer', 'buffer'],
  },
  server: {
    port: 5173,
    proxy: {
      '/functions': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Isolate @react-pdf into its own chunk (loaded on demand)
          'react-pdf': ['@react-pdf/renderer'],
        },
      },
    },
  },
});
