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
        manualChunks: {
          'chunk-react': ['react', 'react-dom'],
          'chunk-framer-motion': ['framer-motion'],
          'chunk-zustand': [
            'zustand',
            'zustand/traditional',
            'zustand/middleware',
          ],
          'chunk-capacitor': [
            '@capacitor/core',
            '@capacitor/app',
            '@capacitor/keyboard',
            '@capacitor/preferences',
            '@capacitor/splash-screen',
            '@capacitor/status-bar',
            '@capacitor/barcode-scanner',
            '@capgo/capacitor-health',
            '@capgo/capacitor-navigation-bar',
          ],
          'chunk-lucide': ['lucide-react'],
          'chunk-dexie': ['dexie'],
          'chunk-sql-vendor': ['sql.js'],
          'chunk-food-catalog': ['./src/services/foodCatalog.js'],
          'chunk-gemini': ['./src/services/gemini.js'],
        },
      },
    },
  },
});
