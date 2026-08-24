import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relative : le dashboard est servi depuis /local/loggia/ (www de Home Assistant)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist', emptyOutDir: false, // emptyOutDir false : on garde les anciens bundles (caches clients)
    // vendor séparé : react/react-dom ne changent pas entre deploys → les clients ne re-téléchargent que le code app
    rollupOptions: { output: { manualChunks: { vendor: ['react', 'react-dom'], three: ['three'] } } },
  },
});
