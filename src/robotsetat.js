/* ── Ce que l'écran lit des robots, une fois pour tout l'écran (chantier IoT, I35 ; I3 A, I7, I33) ──
 *
 * `loggia/robots/etat` : le planning de la maison (les passages, « Ne pas
 * déranger », la pluie), sa météo, le journal du module — et le carnet des
 * passages (robots.py) : le passage en cours de chaque robot et ses pièces, sa
 * dernière erreur, les passages des quatorze derniers jours, pour ce que le
 * compte peut lire. La carte en a besoin pour « Passage demain 09:30 » et
 * « Nettoie · Salon, Cuisine », la popup pour son Planning et son Historique.
 * Le magasin est celui des prises (`magasin`, prisesetat.js) : compté par
 * abonnés, rien ne part sans abonné ; 60 s tant qu'une carte est montée, 15 s
 * fiche ouverte (`rapide`) ; relu après chaque commande ; un serveur muet — un
 * composant d'avant ce chantier, Home Assistant pas encore redémarré — garde
 * ce qu'on savait et le dit (`erreur`). Sans rien, rien ne s'invente : la
 * carte dit « Sur la base », « Nettoyage en cours ».
 *
 * Un départ (`lancerRobot`) passe par le serveur : il envoie la commande de
 * l'intégration, note les pièces au carnet, et rend l'état qui remplace le
 * cache. Un serveur d'avant ce chantier : le départ part en direct, comme
 * avant, et le carnet n'en saura rien. Les phrases d'un refus se chargent au
 * premier refus (refusrobots.js) : le démarrage n'en porte rien.
 *
 * « Il bipe » (I7) : Home Assistant ne dit pas qu'un robot bipe. Trois
 * secondes après un `locate` accepté, dans l'onglet qui l'a envoyé, la carte,
 * la compacte et la popup le disent ensemble (`bipeRobot`, `useBipe`). Et le
 * départ que cet onglet vient de lancer se dit avant que le serveur ne l'ait
 * au carnet (`departRobot` ; § 6, ligne 4 : « les pièces du carnet, ou de
 * l'onglet qui a lancé ») — deux minutes au plus, la règle du carnet.
 *
 * Pas de React hormis les crochets : la mécanique se teste à sec
 * (tests/robotsetat.test.mjs), source et horloge doublées.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { magasin, reglerPrisesEtat } from './prisesetat.js';
import { estRefus, enregistrerRefus } from './refus.js';
import { prochainPassage } from './robots.js';
import { poserPartage, lirePartage, oublierPartage, relacherPartage, brutPartage, clesPartagees, ecouterPartage, useOptimistePartage, reglerPartage } from './optimiste.js';

// L'ordre parti, le nuage du robot puis le pont le disent en une dizaine de secondes (I33) : le carnet a alors ouvert la session.
const RELECTURE_MS = 12000;
const BIPE_MS = 3000;
// Un départ demandé vaut pour le passage qui commence dans les deux minutes : la règle du carnet (`DEMANDE_S`, robots_carnet.py).
const DEPART_MS = 120000;
// Ce que répond un serveur sans `loggia/robots/lancer` : un composant d'avant ce chantier, ou un module qui n'a pas démarré.
const SANS_LANCER = new Set(['unknown_command', 'not_available']);
const HORLOGE = { plusTard: (f, ms) => setTimeout(f, ms), annuler: (t) => clearTimeout(t), maintenant: () => Date.now() };
let horloge = HORLOGE;
/* Le canal du toast global (ADR 0046) : un rejet que personne ne reprend. Un test le remplace (`reglerRobotsEtat({ signaler })`) :
 * un rejet non repris y ferait échouer le test — le motif d'`ecrireRegle` (refus.js). */
const RELANCER = (e) => { Promise.reject(e); };
let signaler = RELANCER;
/** Dire un refus, ou une commande qui n'a pas pris : au toast. */
export function signalerRobot(e) {
  signaler(e);
}

/* Le MÊME objet tant que rien ne change (passe bis du 18/10, point 10) : une réponse égale à celle qu'on tient — le cas de presque
 * tous les relevés — rend l'objet tenu, et le magasin, qui compare les objets, ne publie rien : aucune carte ne se redessine pour
 * rien. L'heure de réception qu'on y ajoutait (`recu`), que rien ne lisait, part : elle rendait chaque réponse différente. */
const memeEtat = (r) => {
  const tenu = ETAT.lire().etat;
  try { return tenu && r && JSON.stringify(tenu) === JSON.stringify(r) ? tenu : r; } catch { return r; }
};
const ETAT = magasin((h) => Promise.resolve(h.callWS({ type: 'loggia/robots/etat' }))
  .then(r => (r && typeof r === 'object' ? memeEtat(r) : r)), 60000, 15000);

/** `{ etat, erreur }` de `loggia/robots/etat` — le même objet tant que rien ne change. */
export const lireEtatRobots = () => ETAT.lire();
/** Un état plus frais — celui que rend un départ, la configuration qu'écrit la fiche — remplace le cache ; égal, il le laisse. */
export const poserEtatRobots = (etat) => ETAT.poser(etat && typeof etat === 'object' ? memeEtat(etat) : etat);
/** S'abonner aux changements de l'état des robots, sans le faire relire (un abonné de plus, c'est `abonnerRobots`). */
export const ecouterEtatRobots = (f) => ETAT.ecouter(f);
/** Un abonné de plus — une carte, ou la fiche (`rapide`). Rend la fonction qui désabonne. */
export const abonnerRobots = ({ rapide = false } = {}) => ETAT.abonner({ rapide });
const RIEN = Object.freeze({ etat: null, erreur: false });
/* Une carte d'un autre domaine — la compacte les sert tous — n'écoute rien (passe bis du 18/10, point 10) : elle s'abonnait aux
 * robots, à leurs bips et à leurs gestes, et se redessinait à chacun. */
const rienEcouter = () => () => {};
const lireRien = () => RIEN;

/** `{ etat, erreur }`. `actif` faux : rien ne s'abonne et rien ne se lit ; `rapide` : la fiche. */
export function useEtatRobots(actif = true, { rapide = false } = {}) {
  useEffect(() => (actif ? abonnerRobots({ rapide }) : undefined), [actif, rapide]);
  const lire = actif ? ETAT.lire : lireRien;
  return useSyncExternalStore(actif ? ETAT.ecouter : rienEcouter, lire, lire);
}

let relecture = null;
function relireBientot() {
  if (relecture != null) horloge.annuler(relecture);
  relecture = horloge.plusTard(() => { relecture = null; ETAT.rafraichir(); }, RELECTURE_MS);
}

/** Après une commande directe — pause, base, localiser — : relu tout de suite, et encore quand le robot a dû répondre. */
export function apresCommandeRobot() {
  ETAT.rafraichir();
  relireBientot();
}

/**
 * Ce que le carnet du serveur dit d'un robot, pour sa carte : `{ pieces, tout, erreur, prochain }`.
 *  - `pieces` : les noms des pièces (ou des aires) du passage en cours, s'il est au carnet ; `tout` : Loggia a tout lancé.
 *    Sans session au carnet, celles du départ que cet onglet vient de lancer (`depart`, `departRobot`) ;
 *  - `erreur` : la dernière erreur que son capteur a publiée ;
 *  - `prochain` : le prochain passage planifié qui PARTIRA — un passage que « Ne pas déranger » retiendra ne se propose pas (I18) ;
 *    une tondeuse sans aire allumée (`sansZone`, passe bis 2 du 18/10, point D) : seulement un passage qui nomme ses zones — sans
 *    zone, le serveur le retiendrait.
 * Sans état — serveur muet, pas encore lu — : rien, hors le départ de cet onglet.
 */
export function vueCarnetRobot(etat, robot, maintenant = Date.now(), depart = null, { sansZone = false } = {}) {
  const objet = (x) => (x && typeof x === 'object' ? x : null);
  const e = objet(etat);
  const s = e && objet(e.en_cours) ? e.en_cours[robot] : null;
  const err = e && objet(e.erreurs) ? e.erreurs[robot] : null;
  const cfg = e ? objet(e.config) : null;
  const noms = s && Array.isArray(s.zones) ? s.zones.map(z => z && z.nom).filter(n => typeof n === 'string' && n) : [];
  const calme = cfg && cfg.robots && cfg.robots[robot] ? cfg.robots[robot].calme || null : null;
  const d = !s && depart ? depart : null;
  return {
    // `tout` l'emporte sur la liste (passe bis du 18/10, point 2) : une tondeuse qui tond TOUTES ses aires « tond tout le jardin ».
    pieces: s ? (s.tout || !noms.length ? null : noms) : d && d.pieces && !d.tout ? d.pieces : null,
    tout: s ? !!s.tout : !!(d && d.tout),
    // Le nom du script maison qui a lancé le passage (point A) : il le dit quand ses pièces ne se savent pas.
    libelle: s ? (typeof s.libelle === 'string' && s.libelle) || null : (d && d.libelle) || null,
    erreur: err && typeof err.texte === 'string' && err.texte ? err.texte : null,
    prochain: cfg ? prochainPassage(sansZone ? (cfg.plannings || []).filter(p => p && (p.zones || []).length) : cfg.plannings, robot, maintenant, calme) : null,
  };
}

/* Le départ que CET onglet vient de lancer : `{ pieces, tout, t }`, deux minutes au plus. */
const departs = new Map();
/** Le départ de cet onglet pour ce robot, ou null passé deux minutes. */
export function departRobot(robot, maintenant = horloge.maintenant()) {
  const d = departs.get(robot);
  return d && maintenant - d.t <= DEPART_MS ? d : null;
}

/**
 * Un départ, par le serveur (`loggia/robots/lancer`) : il envoie la commande de l'intégration et note les pièces au carnet ;
 * l'état qu'il rend remplace le cache, et l'on relit quand le robot a dû répondre. `zones` : `[{ id, nom, segments }]`, vide pour
 * tout — une tondeuse tond alors ses aires allumées. Un serveur d'avant ce chantier (`unknown_command`), ou dont le module n'a
 * pas démarré (`not_available`) : `direct()` part comme avant. Un refus garde son code, et sa phrase est chargée avant qu'il
 * remonte au toast ; une coupure remonte telle quelle — le départ est peut-être parti : on ne le redouble pas. Le départ se note
 * pour la carte de cet onglet (`departRobot`) : les pièces nommées, ou tout le logement — une tondeuse sans aire choisie tond ses
 * aires allumées, que l'onglet ne sait pas ; un refus l'efface. Un script maison de l'aspirateur part par le même chemin (`script`,
 * passe bis du 18/10, point A) avec le RÔLE que l'écran lui demande (`role` : `nettoyer_tout`, `pieces_selectionnees`, `pause`,
 * `reprendre`, `retour_base` — passe bis 2, point J) : le serveur le lance s'il est celui de ce rôle, et un départ par script se dit
 * par son nom (`libelle`). `geste` : le jeton du geste que l'appui a posé avec sa GARDE (`poserGeste`) — il tient tant que le serveur
 * n'a pas répondu, et prend son filet à la réponse (passe bis 2 du 18/10, point E). `localiser` (petit paquet du 25/10) : « Localiser »,
 * que le SERVEUR décide — son script `localiser` désigné, sinon `vacuum.locate` ; ni script ni rôle d'ici.
 */
export async function lancerRobot(hass, robot, zones = [], { direct = null, tout = null, script = null, role = null, libelle = null, depart = true, geste = null, localiser = false } = {}) {
  const noms = (zones || []).map(z => z && z.nom).filter(n => typeof n === 'string' && n);
  /* `tout` : une tondeuse qui vise TOUTES ses aires « tond tout le jardin » (passe bis du 18/10, point 2), comme le serveur le notera.
   * `script` : un script maison de l'aspirateur (point A ; sa réponse « Par le serveur ») — un départ dit son nom (`libelle`), un
   * geste (`depart` faux : la pause, la base) ne note rien. */
  const toutVise = script ? false : tout != null ? !!tout : !noms.length && String(robot).startsWith('vacuum.');
  if (depart) departs.set(robot, { pieces: noms.length && !toutVise ? noms : null, tout: toutVise, ...(libelle ? { libelle } : null), t: horloge.maintenant() });
  try {
    /* Le départ direct ATTEND ce qu'il fait (passe bis du 18/10, points 2 et 4) : une tondeuse bascule ses aires avant de tondre, et
     * un échec remonte à l'appelant, qui fait retomber le geste et le dit au toast. */
    if (!hass || typeof hass.callWS !== 'function') {
      if (direct) await direct();
      return null;
    }
    try {
      const etat = await hass.callWS({ type: 'loggia/robots/lancer', robot, zones, ...(localiser ? { localiser: true } : script ? { script, ...(role ? { role } : null) } : null) });
      poserEtatRobots(etat);
      relireBientot();
      return etat;
    } catch (e) {
      if (e && SANS_LANCER.has(e.code) && direct) {
        await direct();
        return null;
      }
      if (estRefus(e)) {
        if (depart) departs.delete(robot);
        try {
          enregistrerRefus((await import('./refusrobots.js')).REFUS_ROBOTS);
        } catch {
          /* La table n'a pas pu se charger : le toast dira le refus par son dernier recours. */
        }
      }
      throw e;
    }
  } finally {
    if (geste != null) relacherGeste(robot, geste);
  }
}

/* ── Le geste en cours d'un robot : une avance pour tout l'écran (passe bis du 18/10, point 1 ; passe bis 2, point N) ──
 *
 * Deux appuis rapprochés sur « Pause » relançaient le robot : chaque carte tenait l'avance de son geste à elle, la puce basculait
 * sous le doigt sur « Reprendre », et le second appui envoyait `start`. Le geste en vol est UNE avance par robot, pour la carte
 * large, l'étroite, la compacte, la popup et la fiche universelle — la variante PARTAGÉE d'optimiste.js (`poserPartage`) : la règle
 * de la maison, « tout état optimiste passe par optimiste.js », tient à la lettre. Le geste : `{ cle, phase, depuis, mot, t }` — la
 * puce qui l'a lancé (`demarrer`, `pause`, `reprendre`, `base`), la phase qu'il annonce (`PHASE_GESTE`, robots.js), la phase RÉELLE
 * d'avant lui, le mot qu'il portait (la popup), son heure. Il est en vol tant que Home Assistant ne l'a pas confirmé — la phase réelle
 * est encore `depuis`, et son `last_changed` n'a pas avancé — et, quoi qu'il arrive, GESTE_TENU_MS après l'appui : une intégration
 * locale répond parfois entre deux appuis d'un doigt qui hésite. Confirmé, il l'est POUR DE BON : la maison revenue à la phase
 * d'avant ne le réarme pas (point G). Son filet passé — la latence de l'appareil et un relevé du pont, que la vue pose —, il s'en va,
 * et la carte redit ce que la maison dit ; un départ par le serveur le GARDE tant que le serveur n'a pas répondu, GARDE_DEPART_MS au
 * plus (point E). Un refus ne fait retomber que SON geste, par son jeton (`oublierGeste`, point F). */
const GESTE = 'robot:';
const GESTE_TENU_MS = 1500;
/** Ce que la garde d'un départ tient au plus : au-delà des 20 s que le serveur attend son intégration (`ATTENTE_DEPART_S`). */
export const GARDE_DEPART_MS = 30000;

/** Un geste parti : la puce qui l'a lancé reste sur lui jusqu'à la réponse de Home Assistant, `filet` ms au plus — `garde` ms tant
 *  que le serveur n'a pas répondu ; `change` : le `last_changed` du robot à l'appui. Un geste neuf remplace celui d'avant. Rend son
 *  jeton. */
export function poserGeste(robot, { cle, phase = null, depuis = null, mot = null, change = null } = {}, filet = 7000, { garde = 0 } = {}) {
  if (!robot || !cle) return null;
  return poserPartage(GESTE + robot, Object.freeze({ cle, phase, depuis, mot, t: horloge.maintenant() }),
    { reel: depuis, change, filet, tenue: Math.min(GESTE_TENU_MS, filet), garde });
}
/** Un refus, une commande qui n'a pas pris : CE geste retombe tout de suite — pas celui qui l'a remplacé. */
export const oublierGeste = (robot, jeton) => oublierPartage(GESTE + robot, jeton);
/** Le serveur a répondu : CE geste prend son filet. */
export const relacherGeste = (robot, jeton) => relacherPartage(GESTE + robot, jeton);
/** Les gestes posés, par robot. */
export const lireGestes = () => Object.fromEntries(clesPartagees().filter(k => k.startsWith(GESTE)).map(k => [k.slice(GESTE.length), brutPartage(k).v]));
/** S'abonner aux gestes d'un robot (posé, parti). Rend la fonction qui cesse. */
export const ecouterGestes = (robot, f) => ecouterPartage(GESTE + robot, f);
/** Le geste en vol d'un robot, ou null : Home Assistant l'a confirmé — `reelle`, la phase qu'il dit, n'est plus celle d'avant le
 *  geste, ou `change`, son `last_changed`, a avancé — passé sa tenue. Lu au moment même : un second appui le lit avant que l'écran
 *  ne se redessine. */
export const gesteEnVol = (robot, reelle, change = null) => (robot ? lirePartage(GESTE + robot, { reel: reelle, change }) : null);
/** Pour un composant : le geste en vol de CE robot, et il se redessine quand un geste de ce robot part ou s'en va. */
export const useGeste = (robot, reelle, change = null) => useOptimistePartage(robot ? GESTE + robot : null, { reel: reelle, change });

/* ── « Il bipe » : trois secondes, dans cet onglet ── */
let bipes = Object.freeze({});
const ecouteursBipe = new Set();
const minuteursBipe = new Map();
function poserBipes(suite) {
  bipes = Object.freeze(suite);
  ecouteursBipe.forEach(f => { try { f(); } catch { /* un écouteur tombé n'arrête pas les autres */ } });
}

/** Un `locate` accepté : « Il bipe : suivez le son » pendant trois secondes ; un second repart pour trois secondes. */
export function bipeRobot(robot) {
  if (!robot) return;
  if (minuteursBipe.has(robot)) horloge.annuler(minuteursBipe.get(robot));
  if (!bipes[robot]) poserBipes({ ...bipes, [robot]: true });
  minuteursBipe.set(robot, horloge.plusTard(() => {
    minuteursBipe.delete(robot);
    const reste = { ...bipes };
    delete reste[robot];
    poserBipes(reste);
  }, BIPE_MS));
}

/** Ce robot bipe-t-il en ce moment, d'après cet onglet ? */
export const bipeEnCours = (robot) => !!bipes[robot];
/** S'abonner aux bips (le début et la fin de chacun). Rend la fonction qui cesse. */
export function ecouterBipes(f) {
  ecouteursBipe.add(f);
  return () => { ecouteursBipe.delete(f); };
}
/** Ce robot bipe-t-il, pour un composant : il se redessine au début et à la fin de SON bip ; sans robot, il n'écoute rien. */
export function useBipe(robot) {
  const lire = () => !!(robot && bipes[robot]);
  return useSyncExternalStore(robot ? ecouterBipes : rienEcouter, lire, lire);
}

/** Pour les tests : la source et l'horloge (celles des prises, `reglerPrisesEtat`), le cache, la relecture et les bips vidés. */
export function reglerRobotsEtat(options = {}) {
  reglerPrisesEtat(options);
  ETAT.remettre();
  if (relecture != null) horloge.annuler(relecture);
  relecture = null;
  minuteursBipe.forEach(t => horloge.annuler(t));
  minuteursBipe.clear();
  bipes = Object.freeze({});
  ecouteursBipe.clear();
  // Les gestes vivent dans la variante partagée d'optimiste.js (point N) : vidés avec elle, sur la même horloge.
  reglerPartage({ horloge: options.horloge || null });
  departs.clear();
  horloge = options.horloge ? { ...HORLOGE, ...options.horloge } : HORLOGE;
  signaler = typeof options.signaler === 'function' ? options.signaler : RELANCER;
}
