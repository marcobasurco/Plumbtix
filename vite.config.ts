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
        // Named vendor chunks — EAGER dependencies only.
        //
        // ⚠ Do NOT list dynamically-imported packages here (@react-pdf,
        // recharts, xlsx, @sentry/browser). Object-form manualChunks hoists
        // such chunks into the entry's static imports to preserve module
        // initialization order — which made the login page preload the
        // 1.4MB PDF renderer. Packages reached only via import() are split
        // automatically by Rollup and load truly on demand.
        //
        // These three are needed at startup anyway, so pinning them buys
        // stable long-term caching (app code changes no longer invalidate
        // users' cached React/Supabase chunks) at zero eager-load cost.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase': ['@supabase/supabase-js'],
          'motion': ['framer-motion'],
        },
      },
    },
  },
});