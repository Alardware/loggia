import { cpSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* L'orbe (src/orbe.jsx) nait dans un effet a dependances vides : le
 * remplacement a chaud de Vite echange le module sans rejouer cet effet, et
 * l'on regarderait l'ancien rendu (mesure du 09/09/2026). En developpement, la
 * modifier recharge donc toute la page. La regle vivait dans le module
 * (`import.meta.hot.accept`) ; l'analyse CodeQL de GitHub ne savait pas lire
 * cette ligne et laissait tout le fichier hors de son examen (19/09/2026).
 * Ici, elle ne touche que le serveur de developpement. */
const orbeRechargee = {
  name: 'loggia-orbe-rechargee',
  apply: 'serve',
  handleHotUpdate({ file, server }) {
    if (file.endsWith('/src/orbe.jsx')) {
      server.ws.send({ type: 'full-reload' });
      return [];
    }
    return undefined;
  },
};

/* Le site en ligne a des pages que le dashboard n'a pas : mentions légales,
 * confidentialité, conditions d'utilisation, cookies (`site/legal/`). Elles
 * parlent du SITE — son éditeur, son hébergeur — et n'ont rien à faire dans le
 * Home Assistant des gens. Elles ne vivent donc pas dans `public/`, que toutes
 * les constructions copient et que HACS livrerait : ce greffon les dépose dans
 * la seule construction « demo », celle que GitHub Pages publie
 * (tests/pages_legales.test.mjs).
 *
 * Même greffon, même raison, pour ce qui rend le site LISIBLE SANS JAVASCRIPT
 * (tests/site_lisible.test.mjs) : un moteur de recherche ou un agent IA qui
 * ouvre la page ne voyait qu'un `<div id="root">` vide. La page du site reçoit
 * donc une description, des données structurées et un contenu de repli
 * (`site/_tete.html`, `site/_sans-script.html`) ; celle du paquet HACS, servie
 * derrière l'authentification de Home Assistant, n'en a aucun besoin et ne
 * change pas d'un octet. Un fichier de `site/` dont le nom commence par `_`
 * est un gabarit : il s'injecte, il ne se copie pas. */
let racine = '';
let sortie = '';
const gabarit = (nom) => readFileSync(join(racine, 'site', nom), 'utf8').trim();
const siteEnLigne = {
  name: 'loggia-site-en-ligne',
  apply: 'build',
  configResolved(c) { racine = c.root; sortie = resolve(c.root, c.build.outDir); },
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      const version = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8')).version;
      const avant = html;
      html = html.replace('<title>Loggia</title>', '<title>Loggia — tableau de bord pour Home Assistant (démonstration)</title>');
      html = html.replace('</head>', `${gabarit('_tete.html').replace('{{version}}', version)}
</head>`);
      html = html.replace('<div id="root"></div>', `<div id="root"></div>
  ${gabarit('_sans-script.html')}`);
      // Un repère disparu d'index.html ne doit pas passer inaperçu.
      if (html.length - avant.length < 500) throw new Error('index.html a changé : le site en ligne ne reçoit plus ses gabarits');
      return html;
    },
  },
  closeBundle() {
    cpSync(join(racine, 'site'), sortie, { recursive: true, filter: (src) => !basename(src).startsWith('_') });
  },
};

// base relative : le dashboard est servi depuis /local/loggia/ (www de Home Assistant)
const config = {
  base: './',
  plugins: [react(), orbeRechargee],
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
};

export default defineConfig(({ mode }) => {
  if (mode === 'demo') config.plugins.push(siteEnLigne);
  return config;
});
