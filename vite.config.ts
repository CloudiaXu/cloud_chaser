import { defineConfig } from 'vite';

// GitHub Pages deploys this site at https://cloudiaxu.github.io/cloud_chaser/
// so all built asset URLs need to be prefixed with `/cloud_chaser/`. Local
// dev (vite dev) uses '/' so root-relative paths still work in the IDE.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/cloud_chaser/' : '/',
  server: {
    port: 5173,
    open: true,
  },
}));
