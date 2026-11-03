/* La caméra en grand quand on sonne (C2, lot 8 Gladys, ADR 0312).
 *
 * UNE OPTION DE L'ÉCRAN, décochée par défaut (Paramètres › Apparence, près de
 * la veille : c'est le même écran de couloir). App ne monte ce module que sur
 * l'écran qui l'a cochée : ailleurs, il ne se télécharge pas.
 *
 * Il guette un appui NEUF — un instant que l'écran n'avait pas, de moins de
 * 60 s : un rechargement ne rejoue jamais l'appui d'avant —, et seulement si
 * l'écran est visible. La fiche de la caméra s'ouvre alors telle quelle (la
 * tuile en grand, son flux, ses modes), sur la caméra que porte le même
 * appareil que la sonnette — le flux que la résolution a retenu —, puis se
 * referme 60 s après l'appui, ou plus tôt par sa croix. Aucune commande ne
 * part d'ici : la fiche ne bascule un mode que sur un geste. */
import { useState, useEffect, useRef } from 'react';
import { CamSheet } from './cartescustom/cartes.jsx';
import { LOGGIA_INDEX, LOGGIA_RESOLVED } from './state.js';
import { evenementsPorte, instantPorte, cameraPorte, libelleDetection, ICONES_DETECTION } from './evenement.js';

export const DUREE_EN_GRAND = 60 * 1000;

/** L'appui neuf d'une sonnette qui a une caméra, et les instants connus d'après :
 * { appui: { id, genre, deviceId, appareil, camera, quand } | null, connus: { id → instant | null } }.
 * `connus` null : la première lecture, qui ne fait qu'apprendre. Une sonnette absente des états n'apprend rien. */
export function appuiNeuf(evs, S, connus, maintenant = Date.now()) {
  const suite = { ...(connus || {}) };
  let appui = null;
  (evs || []).forEach(e => {
    if (e.genre !== 'sonnette' || !e.camera || !S || !S[e.id]) return;
    const t = instantPorte(S, e.id, maintenant);
    const connu = !!connus && Object.prototype.hasOwnProperty.call(connus, e.id);
    if (connu && t != null && t !== connus[e.id] && maintenant - t < DUREE_EN_GRAND && (!appui || t > appui.quand)) appui = { ...e, quand: t };
    suite[e.id] = t;
  });
  return { appui, connus: suite };
}

export default function SonnetteGrand({ hass, onAppui = null }) {
  const [appui, setAppui] = useState(null);
  const connus = useRef(null);
  const S = hass && hass.states;
  const evs = evenementsPorte(LOGGIA_INDEX);
  // Les valeurs du moment passent par une référence vivante : l'effet ne se relance qu'au changement d'une sonnette.
  const vivant = useRef(null);
  vivant.current = { S, evs, onAppui };
  const sig = evs.map(e => (S && S[e.id] ? S[e.id].state : '-')).join('|');
  useEffect(() => {
    const r = appuiNeuf(vivant.current.evs, vivant.current.S, connus.current);
    connus.current = r.connus;
    if (r.appui && document.visibilityState !== 'hidden') setAppui(r.appui);
  }, [sig]);
  useEffect(() => {
    const dire = vivant.current.onAppui;
    if (dire) dire(!!appui);
    if (!appui) return undefined;
    const t = setTimeout(() => setAppui(null), Math.max(0, appui.quand + DUREE_EN_GRAND - Date.now()));
    return () => clearTimeout(t);
  }, [appui]);
  useEffect(() => () => { const dire = vivant.current.onAppui; if (dire) dire(false); }, []);
  if (!appui) return null;
  const liste = (LOGGIA_RESOLVED && LOGGIA_RESOLVED.cameras && LOGGIA_RESOLVED.cameras.list) || [];
  const cam = cameraPorte(appui, LOGGIA_INDEX, liste);
  if (!cam) return null;
  const etats = S || {};
  const retenue = liste.find(c => c && c.id === cam);
  const nom = (retenue && (retenue.label || retenue.name)) || (etats[cam] && etats[cam].attributes && etats[cam].attributes.friendly_name) || appui.appareil || cam;
  const evenement = { genre: 'sonnette', enCours: true, quand: appui.quand, libelle: libelleDetection('sonnette', true), icone: ICONES_DETECTION.sonnette };
  return <CamSheet haid={cam} nom={nom} hass={hass} onClose={() => setAppui(null)} evenement={evenement} />;
}
