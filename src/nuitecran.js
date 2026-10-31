/* « Nuit de l'écran » : Non ou Soleil (Paramètres > Effets, ADR 0287).
 *
 * Une tablette murale qui n'éclaire pas la pièce la nuit. Du coucher au lever
 * du soleil, un voile sombre couvre tout l'écran et la photo de fond baisse
 * (index.css, `html.loggia-nuit`). Le thème, lui, ne change pas : son clair /
 * foncé se décide dans App.jsx, qui en garde l'état (ADR 0287).
 *
 * Un réglage de L'APPAREIL, comme le « Verre des cartes » (verre.js) : c'est
 * la tablette du couloir qui doit se faire oublier, pas le PC du bureau. Le
 * défaut est Non : rien ne change pour qui ne touche à rien.
 *
 * La nuit se lit sur `sun.sun` quand Home Assistant le donne ; sinon sur la
 * course du soleil à la position de la maison (soleilcalc.js, chargé à la
 * demande — en attendant, les heures fixes) ; sinon de 21 h à 7 h. Elle se
 * relit chaque minute, hors de React : aucun rendu de plus. Le démarrage
 * (theme.js) pose les classes avant le premier rendu — une tablette rechargée
 * en pleine nuit ne doit pas s'allumer d'abord. L'écriture et l'intensité
 * lue vivent dans Paramètres (views/parametres.jsx), chargé à la demande. */
import { getHass } from './state.js';

export const CLE_NUIT = 'loggia-nuit';
export const CLE_ASSOMBRIR = 'loggia-nuit-assombrir';
const lire = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

/** Le choix de cet appareil : 'soleil' ou 'non'. */
export const lireNuit = () => (lire(CLE_NUIT) === 'soleil' ? 'soleil' : 'non');

let calc = null, enRoute = null;
/** Charge le calcul du soleil, une fois, s'il y a une position ; puis relit la nuit. */
export function chargerCalcul(hass) {
  const c = hass && hass.config;
  if (!enRoute && c && typeof c.latitude === 'number') {
    // `m` vide : un import retenu par `vite:preloadError` (recharge.js), la page repart.
    enRoute = import('./soleilcalc.js').then(m => { if (m) { calc = m.coursSoleil; poserNuit(); } }, () => { enRoute = null; });
  }
  return enRoute;
}

/** Fait-il nuit ? `sun.sun`, puis le calcul, puis 21 h à 7 h. */
export function soleilCouche(hass, date = new Date()) {
  const s = hass && hass.states && hass.states['sun.sun'];
  if (s && (s.state === 'below_horizon' || s.state === 'above_horizon')) return s.state === 'below_horizon';
  if (!calc) chargerCalcul(hass);
  const h = date.getHours() + date.getMinutes() / 60, c = calc && calc(hass, date);
  return c ? h < c.lever || h >= c.coucher : h >= 21 || h < 7;
}

/** Pose sur la racine : `loggia-nuit-sol` (le réglage, qui arme la
 *  transition), `loggia-nuit` (il fait nuit) et `data-nuit` (l'intensité ;
 *  une valeur inconnue prend celle de Moyen, le repli des variables CSS). */
export function poserNuit(root, hass = getHass(), date) {
  try {
    const r = root || document.documentElement, on = lireNuit() === 'soleil';
    r.classList.toggle('loggia-nuit-sol', on);
    r.classList.toggle('loggia-nuit', on && soleilCouche(hass, date));
    r.setAttribute('data-nuit', lire(CLE_ASSOMBRIR) || 'moyen');
  } catch { /* pas de document */ }
}

/* Chaque minute, tant que le réglage est sur Soleil. Home Assistant est là dès
 * le démarrage (le document parent) ; s'il manquait, le repli horaire ne
 * durerait qu'une minute. */
let suivi = null;
export function suivreNuit() {
  poserNuit();
  if (suivi || lireNuit() !== 'soleil') return;
  suivi = setTimeout(() => { suivi = null; suivreNuit(); }, 6e4);
  if (suivi.unref) suivi.unref(); // Node (les tests) : le minuteur ne retient pas le processus
}
