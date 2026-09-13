import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Dedicated config for the UI tier (hooks + components).
//
// Intentionally standalone rather than extending `vite.config.js`: that file
// carries the app's Rolldown `manualChunks` build options, which have no place
// in a test run (and previously broke `dist/index.html` emission when
// misconfigured). Only the React JSX transform is shared, via the same plugin.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    // UI specs live next to their source and use `.spec.*`; the Node runner
    // owns `tests/**/*.test.js`. The two never overlap.
    include: ['src/**/*.spec.{js,jsx}'],
    setupFiles: ['src/tests/setup.js'],
    css: false,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      // Scope the UI tier's coverage to what this tier actually owns. Logic-only
      // modules are covered by the Node tier (`npm run test:coverage`), so
      // including all of `src/**` here would report them at 0% and make the
      // headline number meaningless.
      include: [
        'src/components/**/*.{js,jsx}',
        'src/hooks/**/*.{js,jsx}',
        'src/utils/visuals/modalStack.js',
      ],
      exclude: ['src/tests/**', 'src/**/*.spec.{js,jsx}'],
      reporter: ['text-summary', 'text'],
    },
  },
});
