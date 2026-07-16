import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split the heaviest stable dependencies into their own cacheable
        // chunks instead of one monolithic bundle.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@xyflow')) return 'vendor-flow';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('gifenc') || id.includes('html-to-image')) return 'vendor-export';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
})
