/* ── L'état du distributeur côté serveur : un cache partagé (ADR 0155, 05/10) ──
 *
 * La carte du distributeur (son prochain repas) et sa fiche (le Planning)
 * lisent la même réponse, `loggia/distributeurs/etat`. Elle vit ICI, une fois
 * pour tout l'écran, et non dans chaque composant :
 *  - le sondage ne tourne que tant qu'au moins un ABONNÉ est monté — une carte
 *    posée quelque part, ou la fiche ouverte (compteur de références). Rien ne
 *    s'abonne depuis la racine : une maison sans carte du distributeur à
 *    l'écran n'interroge pas le serveur ;
 *  - 60 s pour la carte (une heure de repas ne bouge pas plus vite) ; 15 s tant
 *    que la fiche est ouverte, qui demande en plus le DÉTAIL (`detail: true` :
 *    le programme d'une Tuya officielle, appelé seulement fiche ouverte) ;
 *  - la réponse d'avant reste lue quand tout se démonte : la fiche rouverte
 *    montre aussitôt ce qu'elle savait, puis se met à jour ;
 *  - `erreur` dit que le serveur est MUET (Home Assistant pas encore redémarré
 *    après la mise à jour) : le Planning le dit au lieu de montrer une liste
 *    vide. Une réponse déjà reçue reste montrée — périmée vaut mieux que rien.
 *
 * Pas de React ici hormis le crochet : la mécanique se teste à sec
 * (`tests/distributeuretat.test.mjs`), source et horloge doublées.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { getHass } from './state.js';

const TYPE_ETAT = 'loggia/distributeurs/etat';
const SONDAGE_CARTE_MS = 60000;
const SONDAGE_FICHE_MS = 15000;
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
let detailles = 0;
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
export function lireEtatDistributeur() { return instant; }

/** Une réponse plus fraîche (après une écriture de la fiche) : elle remplace le cache. */
export function poserEtatDistributeur(etat) {
  if (!etat || typeof etat !== 'object') return;
  // Une lecture partie AVANT l'écriture ne la recouvre pas en revenant.
  publie = tour + 1;
  publier({ etat, erreur: false });
}

/** S'abonner aux changements (pour `useSyncExternalStore`). */
export function ecouterEtatDistributeur(f) {
  ecouteurs.add(f);
  return () => { ecouteurs.delete(f); };
}

/** Relire le serveur maintenant. Sans abonné, rien ne part. */
export function rafraichirDistributeur() {
  if (abonnes <= 0) return Promise.resolve(null);
  const h = source();
  if (!h || typeof h.callWS !== 'function') {
    // Pas encore de pont : ce n'est pas une panne, on réessaie bientôt.
    if (relance == null) relance = horloge.plusTard(() => { relance = null; rafraichirDistributeur(); }, ATTENTE_HASS_MS);
    return Promise.resolve(null);
  }
  const n = ++tour;
  let p;
  try { p = Promise.resolve(h.callWS(detailles > 0 ? { type: TYPE_ETAT, detail: true } : { type: TYPE_ETAT })); } catch (e) { p = Promise.reject(e); }
  return p.then(r => {
    if (n < publie) return null;
    publie = n;
    publier(r && typeof r === 'object' ? { etat: r, erreur: false } : { etat: instant.etat, erreur: true });
    return r;
  }, () => {
    if (n < publie) return null;
    publie = n;
    publier({ etat: instant.etat, erreur: true });
    return null;
  });
}

/* La cadence suit les abonnés : aucune sans eux, 15 s si la fiche est
 * ouverte, 60 s sinon. Un changement de cadence repart de zéro. */
function cadence() {
  const voulue = abonnes > 0 ? (detailles > 0 ? SONDAGE_FICHE_MS : SONDAGE_CARTE_MS) : 0;
  if (voulue === periode) return;
  if (minuteur != null) { horloge.arreter(minuteur); minuteur = null; }
  if (!voulue && relance != null) { horloge.annuler(relance); relance = null; }
  periode = voulue;
  if (voulue) minuteur = horloge.repeter(rafraichirDistributeur, voulue);
}

/**
 * Un abonné de plus — une carte, ou la fiche (`detail: true`). Le premier
 * abonné, et la fiche qui s'ouvre, relisent le serveur aussitôt. Rend la
 * fonction qui désabonne (sans effet au second appel).
 */
export function abonnerDistributeur({ detail = false } = {}) {
  abonnes += 1;
  if (detail) detailles += 1;
  const relire = abonnes === 1 || (detail && detailles === 1);
  cadence();
  if (relire) rafraichirDistributeur();
  let fait = false;
  return () => {
    if (fait) return;
    fait = true;
    abonnes -= 1;
    if (detail) detailles -= 1;
    cadence();
  };
}

/**
 * Le crochet de la carte et de la fiche : `{ etat, erreur }`. `actif` faux (le
 * distributeur n'est pas configuré) : rien ne s'abonne, le cache se lit tel quel.
 */
export function useEtatDistributeur(actif = true, { detail = false } = {}) {
  useEffect(() => (actif ? abonnerDistributeur({ detail }) : undefined), [actif, detail]);
  return useSyncExternalStore(ecouterEtatDistributeur, lireEtatDistributeur, lireEtatDistributeur);
}

/** Pour les tests : la source de `hass` et l'horloge doublées, le cache vidé. */
export function reglerDistributeurEtat({ hass = undefined, horloge: h = undefined } = {}) {
  if (minuteur != null) horloge.arreter(minuteur);
  if (relance != null) horloge.annuler(relance);
  minuteur = null; relance = null; periode = 0; abonnes = 0; detailles = 0; tour = 0; publie = 0;
  instant = Object.freeze({ etat: null, erreur: false });
  ecouteurs.clear();
  source = hass === undefined ? () => getHass() : () => hass;
  horloge = h || HORLOGE;
}

/** Combien d'abonnés, et à quelle cadence (lecture seule, pour les tests). */
export function compteDistributeur() { return { abonnes, detailles, periode }; }
