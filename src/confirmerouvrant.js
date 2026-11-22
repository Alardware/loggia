/* ── Ouvrir un portail ou un garage : un second toucher (chantier du 20/11, A9 ; Gladys X6 ; ADR 0385) ──
 *
 * Un doigt qui glisse sur la carte d'un portail ou d'une porte de garage, et la maison s'ouvre. Pour ces deux ouvrants — la classe
 * `gate` ou `garage` de Home Assistant, jamais un nom —, OUVRIR se fait en deux temps, comme « Relancer l'intégration » ou « Redémarrer
 * HA » : le premier toucher arme la question, « Confirmer ? » 4 s ; le second, sur le même geste, l'envoie. Sans second toucher, elle
 * tombe seule et rien n'est parti. Fermer et arrêter ne demandent rien : ils ne laissent entrer personne. Un volet non plus.
 *
 * « Ouvrir » est ce que dit le geste : `open` ; une position (`set_position`) plus haute que celle d'où l'on part. Le geste armé est
 * celui du REGISTRE `gestesCover` (outils.js), tel que la carte l'enverrait. Le verdict — armer, envoyer — est pur (`suiteConfirmation`) ;
 * le crochet ne fait que tenir la minuterie. Pas de Home Assistant ici : la carte passe ce qu'elle envoie.
 */
import { useState, useRef, useEffect, useCallback } from 'react';

/** Les classes de cover dont l'ouverture se confirme. */
export const CLASSES_A_CONFIRMER = Object.freeze(['gate', 'garage']);
/** Le temps que dure la question, comme les autres confirmations en deux temps (« Relancer l'intégration »). */
export const DELAI_CONFIRMATION_MS = 4000;

/** Le cover est-il un portail ou une porte de garage ? Sa classe, jamais son nom. */
export const ouvrantSensible = (st) => !!st && !!st.attributes && CLASSES_A_CONFIRMER.indexOf(st.attributes.device_class) >= 0;

const OUVRE = ['open', 'open_tilt'];
const PLACE = ['set_position', 'set_tilt_position'];

/** Ce geste (`{ capacite, valeur }`, de `gestesCover`) ouvre-t-il ? `pos` : la position d'où l'on part (0 si inconnue). */
export function ouvre(g, pos) {
  if (!g) return false;
  if (OUVRE.indexOf(g.capacite) >= 0) return true;
  return PLACE.indexOf(g.capacite) >= 0 && Number(g.valeur) > (Number.isFinite(Number(pos)) ? Number(pos) : 0);
}

const cleGeste = (g) => g.capacite + ':' + (g.valeur == null ? '' : g.valeur);

/**
 * Que fait ce toucher ? `armee` : `{ cle, depuis }` ou null — la question déjà posée. Rend `{ action, armee }` :
 *  - `envoyer` : le geste part (et rien ne reste armé) — un portail qui ne s'ouvre pas, un geste de fermeture ou d'arrêt, un volet ;
 *  - `armer` : la question se pose, « Confirmer ? » — la même clé, plus de 4 s après, est une question neuve.
 */
export function suiteConfirmation(armee, g, pos, sensible, maintenant) {
  if (!sensible || !ouvre(g, pos)) return { action: 'envoyer', armee: null };
  const cle = cleGeste(g);
  const ecart = armee ? maintenant - armee.depuis : NaN;
  if (armee && armee.cle === cle && ecart >= 0 && ecart < DELAI_CONFIRMATION_MS) return { action: 'envoyer', armee: null };
  return { action: 'armer', armee: { cle, depuis: maintenant } };
}

/**
 * Le crochet d'une carte de cover : `st` son état. Rend :
 *  - `armee` : la question est posée (la phrase dit « Confirmer ? ») ;
 *  - `tour` : change à chaque fois que la question se pose ou tombe — la clé d'une glissière peinte à la main, qui doit revenir à
 *    la position réelle quand l'ordre n'est pas parti ;
 *  - `demander(g, pos, envoi)` : un toucher sur un geste — `envoi` part, ou la question se pose ;
 *  - `confirmer()` : le second toucher sur le bouton armé — envoie CE QUI EST ARMÉ, un clic de la glissière comme d'« Ouvrir » ;
 *  - `annuler()` : un autre ordre est parti (fermer, arrêter) : la question tombe, l'ouverture abandonnée ne part pas.
 */
export function useConfirmerOuverture(st) {
  const sensible = ouvrantSensible(st);
  const [armee, setArmee] = useState(null);
  const [tour, setTour] = useState(0);
  const ref = useRef({ armee: null, envoi: null, minuteur: 0 });
  useEffect(() => () => clearTimeout(ref.current.minuteur), []);
  const desarmer = useCallback(() => {
    clearTimeout(ref.current.minuteur);
    const etait = ref.current.armee;
    ref.current = { armee: null, envoi: null, minuteur: 0 };
    if (etait) { setArmee(null); setTour(t => t + 1); }
  }, []);
  const demander = (g, pos, envoi) => {
    const s = suiteConfirmation(ref.current.armee, g, pos, sensible, Date.now());
    if (s.action === 'envoyer') { desarmer(); envoi(); return true; }
    clearTimeout(ref.current.minuteur);
    ref.current = { armee: s.armee, envoi, minuteur: setTimeout(desarmer, DELAI_CONFIRMATION_MS) };
    setArmee(s.armee);
    setTour(t => t + 1);
    return false;
  };
  const confirmer = () => {
    const { armee: a, envoi } = ref.current;
    const frais = !!a && Date.now() - a.depuis < DELAI_CONFIRMATION_MS;
    desarmer();
    if (frais && envoi) envoi();
  };
  // Un cover devenu muet entre-temps n'a plus de question à poser.
  useEffect(() => { if (!sensible) desarmer(); }, [sensible, desarmer]);
  return { armee: !!armee, tour, demander, confirmer, annuler: desarmer };
}
