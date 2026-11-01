/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/phir-milenge/' : '/',
  plugins: [
    react(),
    VitePWA({
      // The app shows its own "A newer version of Relay Docs is ready" message.
      // The service worker must never reload the page by itself.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Relay Docs',
        short_name: 'Relay Docs',
        description: 'A document editor that works with no signal.',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        background_color: '#171615',
        theme_color: '#171615',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,woff,woff2,png,svg,ico,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
}));
