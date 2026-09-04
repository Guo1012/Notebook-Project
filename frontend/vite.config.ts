import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/runtime-api': {
        target: 'http://127.0.0.1:8100',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/runtime-api/, '')
      },
      '/runtime-proxy': { target: 'http://127.0.0.1:8200', changeOrigin: true, ws: true }
    }
  },
  // mathjax-full's CommonJS build falls back to eval('require') when this
  // compile-time constant is missing, which is invalid in a browser.
  define: { PACKAGE_VERSION: JSON.stringify('3.2.1') }
});
