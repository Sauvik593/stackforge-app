import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Generate source maps for production error tracking
    sourcemap: false,
    // Chunk size warning threshold (500kb)
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Split vendor libraries from app code for better caching
        manualChunks: {
          vendor: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        }
      }
    }
  },
  // Optimize dep pre-bundling
  optimizeDeps: {
    include: ['react', 'react-dom', '@supabase/supabase-js']
  },
  // Make env vars available and validated at build time
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
  }
})
