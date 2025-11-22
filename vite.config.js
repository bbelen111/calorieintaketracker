import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Ensure dev server is accessible on the LAN (same as running `vite --host`)
  server: {
    host: true,
  },
});
