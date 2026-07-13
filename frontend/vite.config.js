import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: '参考实现 ref-impl',
        short_name: 'ref-impl',
        description: '你来了，所以这里就有了灯光。',
        start_url: '/',
        display: 'standalone',
        background_color: '#fdf8f4',
        theme_color: '#d4926a',
        orientation: 'portrait',
        lang: 'zh-CN',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '^/(chat|api|session|character-session|character-sessions|recent-chats|moments|shares|moods|todos|promises|kv|observation|dreams|xp|memory|memory-hub|group|custom-groups|custom-characters|location|weather|treehole|dashboard|monologue|tts|stt|upload|uploads|concerns|desire|char-states|emotions|mood-logs|avatar|netease|persona|nudge|health|vapid|push)': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
    },
  },
})
