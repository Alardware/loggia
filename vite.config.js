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

/* Le boot part AVEC la page, plus derrière le catalogue (lot 14 de l'audit du
 * 03/10). L'amorce (`main.jsx`) attend le catalogue de la langue, PUIS importe
 * `boot.jsx` : des modules appellent tr() à l'import, le catalogue doit être
 * posé avant que le boot ne s'ÉVALUE. Rien n'obligeait à le TÉLÉCHARGER après :
 * hors français, en.js puis boot se suivaient (démo à froid, Slow 4G, paquet
 * servi comme par Home Assistant : boot demandé à 4,5 s, derrière demo.js et
 * en.js ; à 0,9 s avec ce greffon). Le lien reste plein : l'Accueil n'y gagne que 0,5 s,
 * l'écran complet 4,2 s avec les polices préchargées d'index.html.
 * Un `modulepreload` télécharge et analyse sans évaluer : l'`import()` de
 * l'amorce trouve le module prêt, et l'ordre d'évaluation ne bouge pas. Le nom
 * haché n'existe qu'à la construction, d'où ce greffon, qui lit le paquet
 * produit : le boot, et ce qu'il importe (`vendor`, React) — pas l'entrée, que
 * la page nomme déjà. Les deux constructions l'ont, celle du paquet HACS et
 * celle de la démo en ligne ; `pack_frontend.py` garde les balises telles
 * quelles, et reconnaît l'entrée d'avant au seul <script type="module">. */
let baseHtml = './';
const prechargerBoot = {
  name: 'loggia-precharger-boot',
  apply: 'build',
  configResolved(c) { baseHtml = c.base; },
  transformIndexHtml: {
    order: 'post',
    handler(html, { bundle }) {
      const morceaux = Object.values(bundle || {}).filter((m) => m.type === 'chunk');
      const boot = morceaux.find((m) => m.name === 'boot');
      // Un boot renommé ou fondu ailleurs ne doit pas reperdre le gain en silence.
      if (!boot) throw new Error('vite.config.js : plus de morceau « boot » à précharger');
      const entrees = new Set(morceaux.filter((m) => m.isEntry).map((m) => m.fileName));
      return [boot.fileName, ...boot.imports.filter((f) => !entrees.has(f))].map((f) => ({
        tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: baseHtml + f }, injectTo: 'head',
      }));
    },
  },
};

// base relative : le dashboard est servi depuis /local/loggia/ (www de Home Assistant)
const config = {
  base: './',
  plugins: [react(), orbeRechargee, prechargerBoot],
  // Pré-bundler les grosses dépendances dès le démarrage du serveur dev,
  // plutôt qu'à leur découverte au premier chargement de page.
  optimizeDeps: { include: ['react', 'react-dom', 'three'] },
  server: {
    /* Le port vient de l'ENVIRONNEMENT quand il est donné (25/09).
     *
     * Plusieurs conversations travaillent parfois sur ce dépôt en même temps,
     * chacune avec son serveur : la première prend 5173, la suivante se
     * heurtait à elle et il a fallu inventer une entrée « -5174 », qui se
     * heurte à son tour. L'outil d'aperçu sait attribuer un port libre et le
     * passe par `PORT` — encore faut-il que Vite le lise, ce qu'il ne fait pas
     * de lui-même.
     *
     * `strictPort` reste faux : sans `PORT`, Vite part de 5173 et prend le
     * premier port libre au lieu d'échouer. */
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    strictPort: false,
    // Transformer les gros modules avant la première requête du navigateur :
    // App.jsx est un monolithe, son premier chargement est le goulot.
    warmup: { clientFiles: ['./src/main.jsx', './src/App.jsx', './src/ui.jsx', './src/index.css'] },
  },
  build: {
    // La cible de Vite 5 (« modules »), gardée telle quelle à la montée en Vite 7 :
    // la nouvelle cible par défaut laisserait tomber les tablettes en Safari 14-15.
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
    // `dist` est VIDÉ à chaque compilation (23/09, plan M2). Il ne l'était pas,
    // « pour les caches clients » — mais la rétention qui protège ces caches vit
    // dans `custom_components/loggia/frontend/`, que le pack garde sur deux
    // générations ; `dist` n'est servi à personne. Sans ce vidage il avait
    // amassé 352 Mo en 3 300 fichiers, dont 354 versions d'`index.js`.
    outDir: 'dist', emptyOutDir: true,
    // Pas de sourcemap en production : le composant est distribué par HACS, et
    // les .map multiplieraient le poids de chaque install pour un débogage qui
    // se fait sur le serveur de développement.
    // vendor séparé : react/react-dom ne changent pas entre deploys → les clients ne re-téléchargent que le code app
    rollupOptions: { output: { manualChunks: { vendor: ['react', 'react-dom'], three: ['three'] } } },
  },
};

export default defineConfig(({ mode }) => {
  if (mode === 'demo') config.plugins.push(siteEnLigne);
  return config;
});
