import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // This is fine to keep
    port: 5173, // Enforce port 5173 explicitly
    strictPort: true, // Don't let it switch to 5174 if 5173 is busy
    // Only keep this proxy if you are ACTUALLY running a separate backend server on port 3000
    // proxy: {
    //   '/api': {
    //     target: 'http://localhost:3000',
    //     changeOrigin: true,
    //   },
    // },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('/react/') || id.includes('/react-dom/')) {
              return 'chunk-react';
            }

            if (id.includes('/framer-motion/')) {
              return 'chunk-framer-motion';
            }

            if (
              id.includes('/zustand/') ||
              id.includes('/zustand/traditional') ||
              id.includes('/zustand/middleware')
            ) {
              return 'chunk-zustand';
            }

            // The barcode scanner's web fallback bundles html5-qrcode
            // (~350 kB min) and is dynamically imported by the plugin itself
            // ("web: () => import('./web')"). It is only reachable through the
            // lazy Food Search chunk and never runs on native — keep it OUT
            // of the boot-critical capacitor chunk (pulled in at launch via
            // the static @capacitor/keyboard import in main.jsx) so rolldown
            // preserves its own async chunk. Check this BEFORE the generic
            // @capacitor rule below.
            // html5-qrcode is the barcode scanner's WEB-only decode engine
            // (~350 kB min), statically imported only by the plugin's async
            // `web.js`. Without this rule rolldown hoists it into the Food
            // Search chunk (its nearest static graph); with it the engine
            // stays in its own chunk, fetched only when a web-platform scan
            // actually initialises — never on native.
            if (id.includes('/html5-qrcode/')) {
              return 'chunk-html5-qrcode';
            }

            if (id.includes('/@capacitor/barcode-scanner')) {
              return undefined;
            }

            if (
              id.includes('/@capacitor/') ||
              id.includes('/@capgo/capacitor-health') ||
              id.includes('/@capgo/capacitor-navigation-bar')
            ) {
              return 'chunk-capacitor';
            }

            if (id.includes('/lucide-react/')) {
              return 'chunk-lucide';
            }

            if (id.includes('/dexie/')) {
              return 'chunk-dexie';
            }

            if (id.includes('/sql.js/')) {
              return 'chunk-sql-vendor';
            }
          }

          if (id.includes('/src/services/foodCatalog.js')) {
            return 'chunk-food-catalog';
          }

          if (id.includes('/src/services/openrouter.js')) {
            return 'chunk-openrouter';
          }

          return undefined;
        },
      },
    },
  },
});
