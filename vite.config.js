import { defineConfig } from 'vite'

export default defineConfig({
  base: '/shany/', // your GitHub Pages repo name or the sub-path you’re serving from
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
});
