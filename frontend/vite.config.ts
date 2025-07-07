import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Change dev server port to 3000
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
  base: './',
  build: {
    // Ensure assets are copied and paths are relative
    assetsDir: 'assets',
    // Copy public files to dist
    copyPublicDir: true
  }
});
