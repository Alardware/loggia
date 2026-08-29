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

(async () => {
  if (demo) {
    try { (await import('./demo.js')).installerDemo(); }
    catch (e) { console.error('demo indisponible', e); }
  }
  await import('./boot.jsx');
})();
