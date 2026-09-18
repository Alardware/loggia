import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relative : le dashboard est servi depuis /local/loggia/ (www de Home Assistant)
export default defineConfig({
  base: './',
  plugins: [react()],
  // Pré-bundler les grosses dépendances dès le démarrage du serveur dev,
  // plutôt qu'à leur découverte au premier chargement de page.
  optimizeDeps: { include: ['react', 'react-dom', 'three'] },
  server: {
    // Transformer les gros modules avant la première requête du navigateur :
    // App.jsx est un monolithe, son premier chargement est le goulot.
    warmup: { clientFiles: ['./src/main.jsx', './src/App.jsx', './src/ui.jsx', './src/index.css'] },
  },
  build: {
    // La cible de Vite 5 (« modules »), gardée telle quelle à la montée en Vite 7 :
    // la nouvelle cible par défaut laisserait tomber les tablettes en Safari 14-15.
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
    outDir: 'dist', emptyOutDir: false, // emptyOutDir false : on garde les anciens bundles (caches clients)
    // Pas de sourcemap en production : le composant est distribué par HACS et
    // les vieux bundles s'accumulent (emptyOutDir) — les .map multiplieraient
    // le poids de chaque install. Le débogage se fait sur le serveur dev.
    // vendor séparé : react/react-dom ne changent pas entre deploys → les clients ne re-téléchargent que le code app
    rollupOptions: { output: { manualChunks: { vendor: ['react', 'react-dom'], three: ['three'] } } },
  },
});
