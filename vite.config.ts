import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {

	allowedHosts: ['msvrms.mpjasin.gov.my'],
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Same-origin paths: an https page can't call http services, and 10.10.10.12 is LAN-only
      proxy: {
        '/v1': { target: env.API_URL || 'http://127.0.0.1:3001', changeOrigin: true },
        '/storage': { target: env.LARAVEL_URL || 'http://10.10.10.12', changeOrigin: true },
      },
    },
  };
});
