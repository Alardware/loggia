/* ── L'état du planning de chauffe côté serveur : un cache partagé (plan 2, choix 6) ──
 *
 * Les cartes de chauffage, « En ce moment » sur l'Accueil et la fiche lisent la
 * même réponse, `loggia/chauffage/etat`. Elle vit ICI, une fois pour tout
 * l'écran — le modèle exact de `distributeuretat.js` :
 *  - le sondage ne tourne que tant qu'au moins un ABONNÉ est monté (compteur de
 *    références) ; rien ne s'abonne depuis la racine ;
 *  - 60 s pour les cartes et l'Accueil ; 15 s dès qu'un abonné est `rapide`
 *    (la fiche ouverte) — la même demande, plus souvent ;
 *  - la réponse d'avant reste lue quand tout se démonte ;
 *  - `erreur` dit que le serveur est MUET (Home Assistant pas encore redémarré
 *    après la mise à jour) ; une réponse déjà reçue reste montrée ;
 *  - chaque commande (`main`, `maison`, `config`) rend l'état, qui remplace le
 *    cache aussitôt ; un refus remonte tel quel — l'appelant le dit par
 *    `raisonEchec` (refus.js) — et le cache n'en sait rien.
 *
 * Il n'importe pas `chauffage.js` : il est dans le paquet de démarrage. Pas de
 * React ici hormis le crochet : la mécanique se teste à sec
 * (`tests/chauffageetat.test.mjs`), source et horloge doublées.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { getHass } from './state.js';

const TYPE_ETAT = 'loggia/chauffage/etat';
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
  // Le moteur a raté son démarrage (`demarrage` faux) : il ne commande plus rien. Les cartes
  // et la fiche passent alors par l'appareil, comme en « Observer sans agir » — un geste
  // au planning se perdait sans un mot (audit du 19/10). La fiche dit pourquoi.
  if (suite.etat && suite.etat.demarrage === false && !suite.etat.simulation) suite = { ...suite, etat: { ...suite.etat, simulation: true } };
  instant = Object.freeze(suite);
  ecouteurs.forEach(f => { try { f(); } catch { /* un écouteur tombé n'arrête pas les autres */ } });
}

/** L'instantané `{ etat, erreur }` — le même objet tant que rien ne change. */
export function lireEtatChauffage() { return instant; }

/** Un état plus frais (rendu par une commande) : il remplace le cache. */
export function poserEtatChauffage(etat) {
  if (!etat || typeof etat !== 'object') return;
  // Une lecture partie AVANT la commande ne la recouvre pas en revenant.
  publie = tour + 1;
  publier({ etat, erreur: false });
}

/** S'abonner aux changements (pour `useSyncExternalStore`). */
export function ecouterEtatChauffage(f) {
  ecouteurs.add(f);
  return () => { ecouteurs.delete(f); };
}

/** Relire le serveur maintenant. Sans abonné, rien ne part. */
export function rafraichirChauffage() {
  if (abonnes <= 0) return Promise.resolve(null);
  const h = source();
  if (!h || typeof h.callWS !== 'function') {
    // Pas encore de pont : ce n'est pas une panne, on réessaie bientôt.
    if (relance == null) relance = horloge.plusTard(() => { relance = null; rafraichirChauffage(); }, ATTENTE_HASS_MS);
    return Promise.resolve(null);
  }
  const n = ++tour;
  // Une réponse qui n'est pas un objet, ou un rejet : le serveur est muet.
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

/* La cadence suit les abonnés : aucune sans eux, 15 s si l'un est rapide,
 * 60 s sinon. Un changement de cadence repart de zéro. */
function cadence() {
  const voulue = abonnes > 0 ? (rapides > 0 ? SONDAGE_RAPIDE_MS : SONDAGE_MS) : 0;
  if (voulue === periode) return;
  if (minuteur != null) { horloge.arreter(minuteur); minuteur = null; }
  if (!voulue && relance != null) { horloge.annuler(relance); relance = null; }
  periode = voulue;
  if (voulue) minuteur = horloge.repeter(rafraichirChauffage, voulue);
}

/**
 * Un abonné de plus — une carte, l'Accueil, ou la fiche (`rapide`). Le premier
 * abonné, et le premier rapide, relisent le serveur aussitôt. Rend la fonction
 * qui désabonne (sans effet au second appel).
 */
export function abonnerChauffage({ rapide = false } = {}) {
  abonnes += 1;
  if (rapide) rapides += 1;
  const relire = abonnes === 1 || (rapide && rapides === 1);
  cadence();
  if (relire) rafraichirChauffage();
  let fait = false;
  return () => {
    if (fait) return;
    fait = true;
    abonnes -= 1;
    if (rapide) rapides -= 1;
    cadence();
  };
}

/**
 * Le crochet des cartes, de l'Accueil et de la fiche : `{ etat, erreur }`.
 * `actif` faux : rien ne s'abonne, le cache se lit tel quel.
 */
export function useEtatChauffage(actif = true, { rapide = false } = {}) {
  useEffect(() => (actif ? abonnerChauffage({ rapide }) : undefined), [actif, rapide]);
  return useSyncExternalStore(ecouterEtatChauffage, lireEtatChauffage, lireEtatChauffage);
}

/* Le chauffage de l'état dont `champ` vaut `v`, ou null — jamais pour un `v` vide. */
function trouver(etat, champ, v) {
  const liste = etat && Array.isArray(etat.chauffages) ? etat.chauffages : [];
  return (v && liste.find(c => c && c[champ] === v)) || null;
}

/** Le chauffage dont `entite` est l'entity_id, ou null. */
export function chauffageDe(etat, entite) {
  return trouver(etat, 'entite', entite);
}

/** Le chauffage dont `cle` est la clé de configuration, ou null : le seul
 * chemin vers un chauffage INTROUVABLE, dont l'entité est nulle — « En ce
 * moment » ouvre sa fiche par là (plan 2 du chantier Chauffage, tâche 12). */
export function chauffageParCle(etat, cle) {
  return trouver(etat, 'cle', cle);
}

/** Ce chauffage refroidit-il (une pompe à chaleur en froid) ? Le serveur le dit
 * (`avertissements`) : le moteur n'y touche pas, la carte et la fiche commandent
 * alors l'appareil elles-mêmes, comme planning éteint (audit du 19/10). */
export function refroidit(ch) {
  return !!ch && Array.isArray(ch.avertissements) && ch.avertissements.includes('refroidit');
}

/**
 * Une commande du chauffage (`loggia/chauffage/main`, `/maison`, `/config`) :
 * la réponse rendue, et l'état qu'elle porte posé dans le cache — la réponse
 * elle-même, ou sa clé `etat` (`config` rend `{ config, etat }`). Un refus
 * remonte tel quel, le cache n'est pas touché.
 */
export async function commanderChauffage(hass, message) {
  const r = await hass.callWS(message);
  poserEtatChauffage(r && typeof r === 'object' && 'etat' in r ? r.etat : r);
  return r;
}

/** Pour les tests : la source de `hass` et l'horloge doublées, le cache vidé. */
export function reglerChauffageEtat({ hass = undefined, horloge: h = undefined } = {}) {
  if (minuteur != null) horloge.arreter(minuteur);
  if (relance != null) horloge.annuler(relance);
  minuteur = null; relance = null; periode = 0; abonnes = 0; rapides = 0; tour = 0; publie = 0;
  instant = Object.freeze({ etat: null, erreur: false });
  ecouteurs.clear();
  source = hass === undefined ? () => getHass() : () => hass;
  horloge = h || HORLOGE;
}
