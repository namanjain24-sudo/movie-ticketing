import { defineConfig } from 'tsup';

/**
 * The API is bundled rather than plain-`tsc`-compiled so that the `@app/shared`
 * workspace package, which ships TypeScript source instead of a build, gets
 * inlined. Runtime dependencies stay external.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  sourcemap: true,
  noExternal: ['@app/shared'],
});
