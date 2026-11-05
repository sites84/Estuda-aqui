import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/Estuda-aqui/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Estuda — Plataforma de Estudos',
        short_name: 'Estuda',
        description: 'Resumos didáticos e simulados adaptativos.',
        theme_color: '#101827',
        background_color: '#f4f6fa',
        display: 'standalone',
        start_url: '/Estuda-aqui/',
        icons: [
          { src: '/Estuda-aqui/pwa-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/Estuda-aqui/pwa-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' }
        ]
      }
    })
  ]
})