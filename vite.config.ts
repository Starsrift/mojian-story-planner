import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const productionConnectPolicy = "connect-src 'self'"
const developmentConnectPolicy = `${productionConnectPolicy} ws://127.0.0.1:*`

function developmentCspPlugin() {
  return {
    name: 'development-csp',
    apply: 'serve' as const,
    transformIndexHtml(html: string) {
      return html.replace(productionConnectPolicy, developmentConnectPolicy)
    },
  }
}

export default defineConfig({
  plugins: [react(), developmentCspPlugin()],
  base: './',
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'src/**/*.{test,spec}.{js,ts,jsx,tsx}',
      'tests/**/*.{test,spec}.{js,ts,jsx,tsx}',
    ],
    exclude: ['tests/electron/smoke.spec.ts'],
    setupFiles: './src/test/setup.ts',
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
})
