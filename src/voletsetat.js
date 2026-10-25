/* ── L'état des volets côté serveur : un cache partagé (chantier Volets, § 6.1) ──
 *
 * Les cartes des volets, leur compacte, l'en-tête d'Objets › Volets et la fiche
 * lisent la même réponse, `loggia/volets/etat` — son `volets[entity_id]` dit
 * le prochain mouvement, la protection, l'abri, l'attente, la porte et l'ordre
 * en cours de chaque volet. Elle vit ICI, une fois pour tout l'écran : le
 * modèle exact de `chauffageetat.js` —
 *  - le sondage ne tourne que tant qu'au moins un ABONNÉ est monté ;
 *  - 60 s pour les cartes ; 15 s dès qu'un abonné est `rapide` (la fiche) ;
 *  - la réponse d'avant reste lue quand tout se démonte ;
 *  - `erreur` dit que le serveur est muet ; une réponse reçue reste montrée ;
 *  - une réponse plus vieille ne recouvre ni une plus fraîche, ni ce qu'une
 *    écriture a posé (`poserEtatVolets`).
 * Pas de React hormis le crochet : la mécanique se teste à sec
 * (tests/voletsetat.test.mjs), source et horloge doublées. La vue « modes et
 * planning » (`VoletsContent`) et la feuille d'un garage gardent leur propre
 * lecture : elles ne changent pas (V4, V3).
 */
import { useEffect, useSyncExternalStore } from 'react';
import { getHass } from './state.js';

const TYPE_ETAT = 'loggia/volets/etat';
const SONDAGE_MS = 60000;
const SONDAGE_RAPIDE_MS = 15000;
// Pas encore de `hass` (l'application mobile le pose parfois après le premier
// rendu) : on réessaie vite, une fois à la fois, au lieu d'attendre 60 s.
const ATTENTE_HASS_MS = 2000;

const HORLOGE = {
  repeter: (f, ms) => setInterval(f, ms), arreter: (t) => clearInterval(t),
  plusTard: (f, ms) => setTimeout(f, ms), annuler: (t) => clearTimeout(t),
};

let source = () => getHass();
let horloge = HORLOGE;
let instant = Object.freeze({ etat: null, erreur: false });
const ecouteurs = new Set();
let abonnes = 0;
let rapides = 0;
let minuteur = null;
let periode = 0;
let relance = null;
let tour = 0;        // le numéro de la dernière demande partie
let publie = 0;      // celui de la dernière réponse publiée : une réponse plus vieille ne l'écrase pas

function publier(suite) {
  if (suite.etat === instant.etat && suite.erreur === instant.erreur) return;
  instant = Object.freeze(suite);
  ecouteurs.forEach(f => { try { f(); } catch { /* un écouteur tombé n'arrête pas les autres */ } });
}

/** L'instantané `{ etat, erreur }` — le même objet tant que rien ne change. */
export function lireEtatVolets() { return instant; }

/** Un état plus frais (rendu par une écriture) : il remplace le cache. */
export function poserEtatVolets(etat) {
  if (!etat || typeof etat !== 'object') return;
  publie = tour + 1;
  publier({ etat, erreur: false });
}

/** S'abonner aux changements (pour `useSyncExternalStore`). */
export function ecouterEtatVolets(f) {
  ecouteurs.add(f);
  return () => { ecouteurs.delete(f); };
}

/** Relire le serveur maintenant. Sans abonné, rien ne part. */
export function rafraichirVolets() {
  if (abonnes <= 0) return Promise.resolve(null);
  const h = source();
  if (!h || typeof h.callWS !== 'function') {
    if (relance == null) relance = horloge.plusTard(() => { relance = null; rafraichirVolets(); }, ATTENTE_HASS_MS);
    return Promise.resolve(null);
  }
  const n = ++tour;
  const recu = (r) => {
    if (n < publie) return null;
    publie = n;
    const lu = !!r && typeof r === 'object';
    publier({ etat: lu ? r : instant.etat, erreur: !lu });
    return lu ? r : null;
  };
  let p;
  try { p = Promise.resolve(h.callWS({ type: TYPE_ETAT })); } catch (e) { p = Promise.reject(e); }
  return p.then(recu, () => recu(null));
}

function cadence() {
  const voulue = abonnes > 0 ? (rapides > 0 ? SONDAGE_RAPIDE_MS : SONDAGE_MS) : 0;
  if (voulue === periode) return;
  if (minuteur != null) { horloge.arreter(minuteur); minuteur = null; }
  if (!voulue && relance != null) { horloge.annuler(relance); relance = null; }
  periode = voulue;
  if (voulue) minuteur = horloge.repeter(rafraichirVolets, voulue);
}

/** Un abonné de plus — une carte, l'en-tête, ou la fiche (`rapide`). Le premier
 * abonné, et le premier rapide, relisent aussitôt. Rend la fonction qui désabonne. */
export function abonnerVolets({ rapide = false } = {}) {
  abonnes += 1;
  if (rapide) rapides += 1;
  const relire = abonnes === 1 || (rapide && rapides === 1);
  cadence();
  if (relire) rafraichirVolets();
  let fait = false;
  return () => {
    if (fait) return;
    fait = true;
    abonnes -= 1;
    if (rapide) rapides -= 1;
    cadence();
  };
}

/** Le crochet : `{ etat, erreur }`. `actif` faux : rien ne s'abonne, le cache se lit tel quel. */
export function useEtatVolets(actif = true, { rapide = false } = {}) {
  useEffect(() => (actif ? abonnerVolets({ rapide }) : undefined), [actif, rapide]);
  return useSyncExternalStore(ecouterEtatVolets, lireEtatVolets, lireEtatVolets);
}

/** L'entrée d'un volet dans l'état (§ 6.1), ou null — un serveur d'avant n'a pas `volets`. */
export function voletDe(etat, id) {
  const t = etat && etat.volets;
  return (id && t && typeof t === 'object' && t[id] && typeof t[id] === 'object') ? t[id] : null;
}

/** Pour les tests : la source de `hass` et l'horloge doublées, le cache vidé. */
export function reglerVoletsEtat({ hass = undefined, horloge: h = undefined } = {}) {
  if (minuteur != null) horloge.arreter(minuteur);
  if (relance != null) horloge.annuler(relance);
  minuteur = null; relance = null; periode = 0; abonnes = 0; rapides = 0; tour = 0; publie = 0;
  instant = Object.freeze({ etat: null, erreur: false });
  ecouteurs.clear();
  source = hass === undefined ? () => getHass() : () => hass;
  horloge = h || HORLOGE;
}
