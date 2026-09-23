/**
 * Amorce. Elle ne fait qu'une chose : decider AVANT d'evaluer l'application.
 *
 * `?demo` sur la page directe installe la maison de demonstration — dont le
 * remplacement du localStorage par un magasin memoire. Or les modules de
 * l'application lisent le stockage DES leur evaluation (langue, theme,
 * reglages) : un import statique de App ici s'executerait avant la demo, et
 * elle lirait la vraie configuration. D'ou les imports dynamiques : rien de
 * l'application n'est evalue tant que le decor n'est pas plante.
 *
 * Le mode demo exige la page DIRECTE (window === window.top) : dans l'iframe
 * du panneau, le vrai Home Assistant est au-dessus, on ne melange pas.
 */
// Le CSS reste ici, dans l'amorce : importe depuis boot.jsx (dynamique), il
// deviendrait un asset charge en retard — flash sans style, et plus de <link>
// dans index.html pour l'inline du paquet (pack_frontend l'exige).
import './index.css';
import { CHARGEURS, langueServie } from './langues/index.js';

/* La démo EN LIGNE (GitHub Pages) est une construction à part : `npm run
 * build:demo`, mode Vite « demo ». Il n'y a pas de Home Assistant derrière :
 * elle démarre TOUJOURS dans la maison de démonstration, sans `?demo`, et
 * n'attend aucune adresse. Dans la construction normale, MODE vaut
 * 'production' : la condition disparaît à la compilation, le panneau servi
 * par Home Assistant ne peut pas s'y retrouver. */
const DEMO_SEULE = import.meta.env.MODE === 'demo';

const demo = (() => {
  if (DEMO_SEULE) return true;
  try { return new URLSearchParams(window.location.search).has('demo') && window === window.top; }
  catch { return false; }
})();

/* Un catalogue pese 40 a 50 Ko que le boot francophone n'a aucune raison
 * d'emporter : celui de la langue resolue se charge, et lui seul, AVANT
 * d'evaluer l'application — des modules appellent tr() a l'import. La
 * resolution recopie `resoudreTot` d'i18n.js (choix explicite, sinon derniere
 * langue servie, sinon navigateur) : i18n ne peut pas etre importe ici sans
 * tirer la moitie du graphe dans l'amorce. Les deux doivent rester d'accord.
 * `langues/index.js`, lui, est minuscule : c'est la liste des catalogues,
 * importee en tete avec le CSS. */
function langueProbable() {
  const lire = (k) => {
    try {
      const v = localStorage.getItem(k);
      if (v == null) return null;
      try { return JSON.parse(v); } catch { return v; }
    } catch { return null; }
  };
  const choix = lire('loggia-langue') || 'auto';
  if (choix !== 'auto') return choix;
  const memo = lire('loggia-langue-active');
  if (memo && /^[a-z]{2}$/.test(memo)) return memo;
  return String((typeof navigator !== 'undefined' && navigator.language) || 'fr').slice(0, 2).toLowerCase();
}

(async () => {
  if (demo) {
    // Lu par la barre latérale : la démo n'a pas de serveur à nommer.
    window.__loggiaDemo = true;
    if (DEMO_SEULE) document.title = 'Loggia — démonstration';
    try { (await import('./demo.js')).installerDemo(); }
    catch (e) { console.error('demo indisponible', e); }
    /* `?mode=auto|light|dark` et `?lang=<code>` : réglages d'aperçu dans la
     * démo — posés APRÈS l'installation du magasin mémoire (qui repart à neuf
     * à chaque chargement), sinon le vrai localStorage les recevrait.
     * `lang` sert à VÉRIFIER une traduction : sans lui, il fallait changer la
     * langue de Home Assistant pour voir l'anglais. Tout code que Loggia sert
     * en entier est accepté (`langueServie`). */
    try {
      const q = new URLSearchParams(window.location.search);
      const md = q.get('mode');
      if (md === 'auto' || md === 'light' || md === 'dark') localStorage.setItem('loggia-mode', md);
      const lg = q.get('lang');
      if (lg && langueServie(lg)) localStorage.setItem('loggia-langue', JSON.stringify(lg));
      /* `?theme=ios` : le thème, comme le mode — pour REJOUER l'audit de
       * contraste variante par variante (15 thèmes × clair et sombre) au lieu
       * de cliquer dans les Paramètres à chaque passe. Un nom inconnu retombe
       * sur Loggia : `applyLook` ne connaît que ses propres thèmes. */
      const th = q.get('theme');
      if (th != null && /^[a-z]{0,20}$/.test(th)) localStorage.setItem('loggia-theme', th);
      /* `?vue=energie` ou `?vue=room:Salon` : ouvrir une vue sans cliquer.
       * La vue courante vit dans `sessionStorage`, que la demo ne remplace
       * pas — on l'y pose avant que l'application ne la lise. Sert aux
       * captures du README et a verifier une vue d'un seul chargement. */
      const vu = q.get('vue');
      if (vu && /^[a-z]+(:.{1,40})?$/.test(vu)) sessionStorage.setItem('loggia-vue', vu);
    } catch { /* rien */ }
  }
  const probable = langueProbable();
  if (CHARGEURS[probable]) {
    try { window.__loggiaCatalogue = { code: probable, cat: (await CHARGEURS[probable]()).default }; }
    catch { /* reseau : le francais couvre tout */ }
  }
  await import('./boot.jsx');
})();
