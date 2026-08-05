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
