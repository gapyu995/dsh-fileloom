/** Media tests retain their original source-relative imports after consolidation. */
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  resolve: { dedupe: ['react', 'react-dom', '@testing-library/react', '@testing-library/user-event', 'hono', '@hono/node-server'] },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom', restoreMocks: true, setupFiles: ['./media/tests/setup.ts'],
    include: ['media/tests/**/*.spec.{ts,tsx}', '../../packages/file-manager/*/tests/**/*.spec.{ts,tsx}'],
    environmentMatchGlobs: [['../../packages/file-manager/file-manager/tests/**', 'node']],
  },
})
