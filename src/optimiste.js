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
import { useState, useEffect, useRef, useCallback } from 'react';

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
