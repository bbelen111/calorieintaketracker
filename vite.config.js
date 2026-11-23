import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Dev-only dependency pre-bundling. These packages are only reachable
  // through lazy/dynamic imports (React.lazy modals, notification/HR service
  // bridges), so Vite's startup scan can miss them in a stale cache and then
  // re-optimize the first time the surface opens. That runtime re-optimization
  // changes the deps hash while the lazy import is in flight, aborting it with
  // "504 (Outdated Optimize Dep)" and crashing the dynamic import. Declaring
  // them up front keeps the optimizer hash stable for the whole session.
  optimizeDeps: {
    include: [
      '@capacitor/barcode-scanner',
      '@capacitor-community/bluetooth-le',
      '@capacitor-community/keep-awake',
      '@capacitor/filesystem',
      '@capacitor/local-notifications',
      '@capacitor/push-notifications',
      '@capacitor/share',
      'sql.js',
    ],
  },
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

            // The live heart-rate sensor (Bluetooth LE) and keep-awake
            // plugins are dynamically imported by services/heartRateSensor.js
            // only when the user pairs or records. Keep them in their own
            // async chunks — never in the boot-critical capacitor chunk.
            if (id.includes('/@capacitor-community/')) {
              return undefined;
            }

            // Local and remote push notification plugins are dynamically
            // imported by services/notificationBridge.js so they never enter
            // the boot-critical capacitor chunk.
            if (
              id.includes('/@capacitor/local-notifications') ||
              id.includes('/@capacitor/push-notifications')
            ) {
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
