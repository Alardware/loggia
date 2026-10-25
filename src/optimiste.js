/* ─────────────────────────────────────────────────────────────────────────────
 * Un etat optimiste qui EXPIRE.
 *
 * Une carte n'attend pas Home Assistant pour changer d'aspect : elle montre
 * tout de suite ce qu'on vient de lui demander, sinon le doigt arrive avant
 * l'image. Ce mensonge utile ne se vidait que si l'etat REEL bougeait —
 * `useEffect(() => setOv(null), [reel])`, recopie dans quatorze cartes.
 *
 * Quand l'etat reel ne bouge jamais, il tenait indefiniment : commande
 * refusee, volet qui bute a 1 %, echo Zigbee qui rejoue l'ancienne valeur. La
 * carte disait « Ferme » pendant que la maison disait « ouvert », et SEUL un
 * changement de page le revelait — le composant mourait, l'etat optimiste avec
 * lui, et la verite reapparaissait. L'utilisateur croyait alors que le RETOUR
 * mentait, alors que c'etait l'affichage d'avant (retour du 27/09 : « si je
 * ferme mes volets et que je change de page et que je reviens la carte est
 * ouvert alors que le volet est bien ferme »).
 *
 * Deux cartes sur quatorze avaient un filet. C'est desormais le meme pour
 * toutes : passe ce delai, la carte redit ce que la maison dit, quoi qu'il
 * arrive. Un affichage en retard se corrige tout seul ; un affichage faux, non.
 *
 * `reel` est une SIGNATURE : passer plusieurs valeurs se fait en les joignant,
 * comme le faisait le tableau de dependances qu'il remplace.
 *
 * Son propre module (lot 15 de l'audit du 03/10) : il vivait dans App.jsx sans
 * y etre exporte. Parametres, charge a part, recopiait donc son propre etat
 * optimiste pour les automatisations — sans minuteur : une automatisation que
 * HA refusait de couper restait « coupee » tant qu'on ne quittait pas la page.
 * ───────────────────────────────────────────────────────────────────────────── */
import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';

const OPTIMISTE_MS = 6000;
export function useOptimiste(reel, delai = OPTIMISTE_MS) {
  const [ov, setOv] = useState(null);
  const minuteur = useRef(0);
  useEffect(() => () => clearTimeout(minuteur.current), []);
  /* L'etat reel a REPONDU : le filet n'a plus de raison d'attendre.
   *
   * Mais « je ne sais pas » n'est pas une reponse. Une carte de piece rend
   * `null` quand la liste de ses plafonniers est momentanement vide ; l'effet
   * se declenchait quand meme et jetait l'optimiste. L'affichage retombait
   * alors sur un compteur lui aussi vide — donc ETEINT —, puis remontait tout
   * seul des que la liste revenait. Repete, cela fait clignoter la bascule
   * (retour du 01/10 : « le toggle change d'etat plusieurs fois de suite »,
   * alors que la lampe, elle, reste allumee).
   *
   * On n'efface donc que sur une VALEUR. Le minuteur reste le filet : un
   * optimiste qui n'obtient jamais de reponse expire quand meme. */
  useEffect(() => {
    if (reel == null) return;
    clearTimeout(minuteur.current); setOv(null);
  }, [reel]);
  const poser = useCallback((v) => {
    setOv(v);
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setOv(null), delai);
  }, [delai]);
  return [ov, poser];
}

/* Plusieurs demandes dans un même filet : id → { v, t, at, echo }, `t` étant
 * le `last_changed` de l'entité au moment de la demande, `at` sa date.
 *
 * Une signature commune à toute une liste jette TOUTES les demandes dès
 * qu'une seule entité répond. Celle qui était encore en vol retombait alors
 * sur l'état d'avant, puis repartait à sa réponse — l'aller-retour de bascule
 * du 01/10, mesuré en démo sur deux automatisations (lot 15 de l'audit du
 * 03/10). La réponse se lit donc PAR entité : son `last_changed` a bougé,
 * HA a parlé pour elle ; sinon la demande tient.
 *
 * Relecture du lot 15 (04/10), deux trous dans cette lecture :
 * - deux appuis rapides sur la MÊME ligne : l'écho de la première commande
 *   bougeait `last_changed` et rendait la ligne à l'état que la seconde
 *   annule, jusqu'à la réponse de celle-ci (ON → off → ON → off → ON, le
 *   faux « off » tenant tout un sondage, 2 s). Une demande qui en remplace
 *   une encore en vol retient sa valeur (`echo`) : la voir revenir n'est
 *   pas une réponse. Toute autre valeur en est une — un autre appareil
 *   reprend la main comme avant ;
 * - le minuteur était celui de la TABLE : chaque bascule d'une autre ligne
 *   le relançait, et un refus restait affiché tant qu'on en basculait
 *   (31 s pour six bascules, au lieu de 6). `useDemandes` vise l'échéance
 *   la plus proche et ne retire qu'elle ; les autres gardent la leur.
 *
 * `reel` est ce que la maison dit sans demande : le `sinon` de la lecture.
 * Reste borné par les 6 s : un autre appareil qui ramène la ligne sur
 * l'écho, juste après la réponse d'un double appui, n'est cru qu'à
 * l'échéance — rien ne distingue cet état de l'écho attendu. */
const tient = (d, etat, reel) => !!(d && etat && (etat.last_changed === d.t || (d.echo !== undefined && reel === d.echo)));
export const demandeCle = (v, etat, avant, reel) => ({ v, t: etat ? etat.last_changed : undefined, at: Date.now(), echo: tient(avant, etat, reel) ? avant.v : undefined });
export function enVol(ov, id, etat, sinon) {
  return tient(ov && ov[id], etat, sinon) ? ov[id].v : sinon;
}
/* `[demandes, demander]` : `demander(id, v, etat, reel)` pose une demande,
 * `enVol(demandes, id, etat, reel)` la lit. Une table nulle quand rien
 * n'est en route, comme `useOptimiste`.
 *
 * `at` est l'heure MURALE, que `useOptimiste` (un `setTimeout` nu)
 * ignorait : une horloge qui recule (tablette resynchronisée) aurait figé
 * un refus d'autant — une heure pour une heure. Une demande datée d'après
 * « maintenant » s'en va donc au premier tour ; la plus proche échéance
 * restante est alors passée, et aucun minuteur n'attend plus que `delai`. */
export function useDemandes(delai = OPTIMISTE_MS) {
  const [demandes, setDemandes] = useState(null);
  useEffect(() => {
    if (!demandes) return undefined;
    const echeance = Math.min(...Object.keys(demandes).map(id => demandes[id].at));
    const m = setTimeout(() => setDemandes(o => {
      const vives = {}, maintenant = Date.now();
      Object.keys(o || {}).forEach(id => { if (o[id].at > echeance && o[id].at <= maintenant) vives[id] = o[id]; });
      return Object.keys(vives).length ? vives : null;
    }), Math.max(0, echeance + delai - Date.now()));
    return () => clearTimeout(m);
  }, [demandes, delai]);
  const demander = useCallback((id, v, etat, reel) => setDemandes(o => ({ ...o, [id]: demandeCle(v, etat, o && o[id], reel) })), []);
  return [demandes, demander];
}

/* ── La variante PARTAGÉE : une avance pour tout l'écran (chantier IoT, passe bis 2 du 18/10, point N) ──
 *
 * `useOptimiste` tient l'avance d'UNE carte. Un robot a la sienne sur sa carte large, son étroite, sa compacte, sa popup et sa
 * fiche universelle : chacune la tenait à part, et un second appui tombait sur la puce inverse — deux appuis sur « Pause »
 * relançaient le robot. Puis un magasin à lui (robotsetat.js), une exception à la règle. La variante partagée tient l'avance par
 * CLÉ, pour tout l'écran, au contrat de `useOptimiste` :
 *  - elle EXPIRE : `filet` ms après l'appui ; tant qu'une réponse est attendue (`garde`, un départ par le serveur), `garde` ms au
 *    plus — `relacherPartage` la rend au filet, compté de là ;
 *  - l'état réel la lève dès qu'il RÉPOND — `reel`, sa signature, n'est plus celle de l'appui, ou son `last_changed` (`change`) a
 *    avancé — et c'est ACQUIS : la maison revenue à l'état d'avant ne la réarme pas ; un relevé plus vieux que l'appui ne compte pas ;
 *  - quoi qu'il arrive, elle tient `tenue` ms : une intégration locale répond parfois entre deux appuis d'un doigt qui hésite ;
 *  - avec une `cible` (les lumières, audit du 19/10, B3), l'état réel ne répond qu'en l'ATTEIGNANT : allumée → appui (off) →
 *    appui (on), l'écho du premier ordre — `off`, son `last_changed` avancé — effaçait l'avance du second, et la carte disait
 *    « éteinte » le temps d'un relevé ; les paliers d'un fondu (48) faisaient sauter le 60 posé sous le doigt. C'est l'idée de
 *    `useDemandes` : l'écho d'un ordre remplacé n'est pas une réponse. Un ordre jamais atteint tombe au filet, comme avant.
 * Lue au moment même (`lirePartage`) : un second appui la voit avant le prochain rendu. Un refus n'oublie que SON avance
 * (`oublierPartage(cle, jeton)`) : un refus tardif ne fait pas tomber le geste qui l'a remplacée. Les minuteurs seuls font passer
 * le temps, comme ceux de `useOptimiste`. */
const HORLOGE = { plusTard: (f, ms) => setTimeout(f, ms), annuler: (t) => clearTimeout(t) };
let horloge = HORLOGE;
const PARTAGES = new Map(); // clé → { id, v, reel, change, filet, tenu, garde, mTenue, mFin }
const REPONDUES = new Set(); // les jetons dont l'état réel a répondu : acquis
const ECOUTES = new Map();
let jetons = 0;
const prevenir = (cle) => (ECOUTES.get(cle) || []).forEach(f => { try { f(); } catch { /* un écouteur tombé n'arrête pas les autres */ } });
const instant = (x) => (x == null ? NaN : Date.parse(x));
function retirer(cle, e) {
  horloge.annuler(e.mTenue); horloge.annuler(e.mFin);
  REPONDUES.delete(e.id);
  if (PARTAGES.get(cle) === e) { PARTAGES.delete(cle); prevenir(cle); }
}
const finir = (cle, e, ms) => { horloge.annuler(e.mFin); e.mFin = horloge.plusTard(() => retirer(cle, e), ms); };

/** Pose l'avance de `cle` — elle remplace celle d'avant. Rend son jeton (`oublierPartage`, `relacherPartage`).
 *  `cible` (facultative) : la valeur que l'état réel doit ATTEINDRE pour répondre — `undefined` : toute réponse compte. */
export function poserPartage(cle, v, { reel, change = null, filet = OPTIMISTE_MS, tenue = 0, garde = 0, cible = undefined } = {}) {
  const avant = PARTAGES.get(cle);
  if (avant) retirer(cle, avant);
  const e = { id: ++jetons, v, reel, change, filet, tenu: tenue > 0, garde: garde > 0, cible };
  if (e.tenu) e.mTenue = horloge.plusTard(() => { e.tenu = false; if (REPONDUES.has(e.id)) retirer(cle, e); }, tenue);
  finir(cle, e, garde || filet);
  PARTAGES.set(cle, e);
  prevenir(cle);
  return e.id;
}

/** L'avance de `cle` encore en vol, ou null : l'état réel (`reel`, `change`) a répondu — sa tenue passée —, ou son filet aussi.
 *  Avec une `cible`, répondre, c'est l'atteindre : un relevé qui dit autre chose — l'écho d'un ordre plus ancien, un palier — ne compte pas. */
export function lirePartage(cle, { reel, change } = {}) {
  const e = PARTAGES.get(cle);
  if (!e) return null;
  const a = instant(change), b = instant(e.change);
  const repondu = e.cible !== undefined ? reel === e.cible && (a > b || reel !== e.reel) : (a > b || (reel !== undefined && reel !== e.reel));
  if (!(a < b) && repondu) REPONDUES.add(e.id);
  return e.tenu || !REPONDUES.has(e.id) ? e.v : null;
}

/** Un refus : l'avance de CE jeton tombe tout de suite — pas celle qui l'a remplacée. */
export function oublierPartage(cle, jeton) {
  const e = PARTAGES.get(cle);
  if (e && jeton != null && e.id === jeton) retirer(cle, e);
}

/** La réponse attendue est venue : l'avance de CE jeton quitte sa garde et prend son filet, compté de maintenant. */
export function relacherPartage(cle, jeton) {
  const e = PARTAGES.get(cle);
  if (e && e.id === jeton && e.garde) { e.garde = false; finir(cle, e, e.filet); }
}

/** L'avance brute de `cle` (le même objet tant qu'elle ne change pas), ou null. */
export const brutPartage = (cle) => PARTAGES.get(cle) || null;
/** Les clés des avances posées. */
export const clesPartagees = () => [...PARTAGES.keys()];
/** S'abonner aux avances de `cle` (posée, partie). Rend la fonction qui cesse. */
export function ecouterPartage(cle, f) {
  if (!ECOUTES.has(cle)) ECOUTES.set(cle, new Set());
  ECOUTES.get(cle).add(f);
  return () => { const s = ECOUTES.get(cle); if (s) { s.delete(f); if (!s.size) ECOUTES.delete(cle); } };
}
const ABONNER = new Map();
const rien = () => () => {};
/** Pour un composant : l'avance de `cle` encore en vol (`lirePartage`), et il se redessine quand elle se pose ou s'en va. */
export function useOptimistePartage(cle, signature) {
  if (cle && !ABONNER.has(cle)) ABONNER.set(cle, (f) => ecouterPartage(cle, f));
  const lire = () => (cle ? PARTAGES.get(cle) || null : null);
  useSyncExternalStore(cle ? ABONNER.get(cle) : rien, lire, lire);
  return cle ? lirePartage(cle, signature) : null;
}

/** Pour les tests : les avances vidées, leurs minuteurs arrêtés, l'horloge doublée (`plusTard`, `annuler`). */
export function reglerPartage({ horloge: h = null } = {}) {
  PARTAGES.forEach(e => { horloge.annuler(e.mTenue); horloge.annuler(e.mFin); });
  PARTAGES.clear(); REPONDUES.clear(); ECOUTES.clear();
  horloge = h ? { ...HORLOGE, ...h } : HORLOGE;
}
