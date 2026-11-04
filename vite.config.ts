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
      // No HMR socket: when a phone opens the camera the socket drops, and Vite's client
      // reloads the page on reconnect, which loses the form the officer is filling in.
      hmr: false,
      ws: false,
      // Same-origin paths: an https page can't call http services, and 10.10.10.12 is LAN-only
      proxy: {
        '/v1': { target: env.API_URL || 'http://127.0.0.1:3001', changeOrigin: true },
        '/storage': { target: env.LARAVEL_URL || 'http://10.10.10.12', changeOrigin: true },
      },
    },
  };
});
