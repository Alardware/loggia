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

const demo = (() => {
  try { return new URLSearchParams(window.location.search).has('demo') && window === window.top; }
  catch (e) { return false; }
})();

/* Le catalogue anglais pese 40 Ko que le boot francophone n'a aucune raison
 * d'emporter : il ne se charge que si la langue resolue le demande, AVANT
 * d'evaluer l'application — des modules appellent tr() a l'import. La
 * resolution recopie `resoudreTot` d'i18n.js (choix explicite, sinon derniere
 * langue servie, sinon navigateur) : i18n ne peut pas etre importe ici sans
 * tirer la moitie du graphe dans l'amorce. Les deux doivent rester d'accord. */
function langueProbable() {
  const lire = (k) => {
    try {
      const v = localStorage.getItem(k);
      if (v == null) return null;
      try { return JSON.parse(v); } catch (e) { return v; }
    } catch (e) { return null; }
  };
  const choix = lire('loggia-langue') || 'auto';
  if (choix !== 'auto') return choix;
  const memo = lire('loggia-langue-active');
  if (memo && /^[a-z]{2}$/.test(memo)) return memo;
  return String((typeof navigator !== 'undefined' && navigator.language) || 'fr').slice(0, 2).toLowerCase();
}

(async () => {
  if (demo) {
    try { (await import('./demo.js')).installerDemo(); }
    catch (e) { console.error('demo indisponible', e); }
    /* `?mode=auto|light|dark` : réglage d'aperçu dans la démo — posé APRÈS
     * l'installation du magasin mémoire (qui repart à neuf à chaque
     * chargement), sinon le vrai localStorage le recevrait. */
    try {
      const q = new URLSearchParams(window.location.search);
      const md = q.get('mode');
      if (md === 'auto' || md === 'light' || md === 'dark') localStorage.setItem('loggia-mode', md);
    } catch (e) { /* rien */ }
  }
  if (langueProbable() === 'en') {
    try { window.__loggiaCatEN = (await import('./langues/en.js')).default; }
    catch (e) { /* reseau : le francais couvre tout */ }
  }
  await import('./boot.jsx');
})();
