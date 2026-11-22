/* Ce qu'une caméra sait faire en plus de filmer : se mettre en mode privé, s'orienter (chantier du 20/11, A8).
 *
 * Tout se lit dans l'index des registres de Home Assistant : la PLATEFORME de l'entité, sa CLÉ DE TRADUCTION
 * (le nom que l'intégration lui donne, le même dans toutes les langues) et son appareil. Jamais un nom, jamais un
 * entity_id.
 *
 * Les clés viennent du code PUBLIC des intégrations (relevées le 21/11) :
 *  - UniFi Protect et Reolink publient un `switch` de clé `privacy_mode` (allumé = objectif occulté). Chez Reolink,
 *    caméra en mode privé, TOUTES les autres entités de l'appareil passent « indisponible » : c'est ce qui se lisait
 *    « hors ligne ». Tapo (intégration `tplink`) n'a pas de tel interrupteur : le mode privé y est la caméra éteinte.
 *  - Reolink publie des `button` `ptz_up` / `ptz_down` / `ptz_left` / `ptz_right` et `ptz_stop` : une pression lance
 *    le mouvement, qui dure jusqu'à `ptz_stop` — d'où « maintenir pour bouger ». Tapo (`tplink`) publie `tilt_up`,
 *    `tilt_down`, `pan_left`, `pan_right` : un cran de `pan_step` degrés par pression, rien à arrêter.
 *  - ONVIF (`onvif.ptz`) ne dit PAS si la caméra bouge : le service existe pour toute caméra ONVIF, et il n'y a
 *    aucune entité à lire. UniFi Protect n'a pas de commande de direction (un service de position mémorisée,
 *    `ptz_goto_preset`, et une rotation automatique `ptz_patrol`). Sans signe sûr, pas de croix. */

import { domaineDe } from './outils.js';

/* Par plateforme : le mode du mouvement (`continu` = maintenir, `pas` = un cran par appui) et la clé de chaque sens. */
const PTZ = {
  reolink: { mode: 'continu', haut: 'ptz_up', bas: 'ptz_down', gauche: 'ptz_left', droite: 'ptz_right', stop: 'ptz_stop' },
  tplink: { mode: 'pas', haut: 'tilt_up', bas: 'tilt_down', gauche: 'pan_left', droite: 'pan_right' },
};
const SENS = ['haut', 'bas', 'gauche', 'droite'];

/* Les entités du même appareil que `camId`, avec ce que le registre en sait ; [] sans appareil connu. Les entités
 * désactivées n'existent pas pour Home Assistant : on ne les lit pas. */
function voisines(index, camId) {
  const meta = index && index.entityMeta && typeof index.entityMeta.get === 'function' ? index.entityMeta.get(camId) : null;
  if (!meta || !meta.deviceId) return { meta: null, liste: [] };
  const liste = [];
  index.entityMeta.forEach((m, id) => { if (id !== camId && m.deviceId === meta.deviceId && !m.disabled) liste.push({ id, m }); });
  return { meta, liste };
}

/** La caméra est-elle en mode privé ? Vrai quand l'interrupteur `privacy_mode` de son appareil est allumé. Sans
 *  interrupteur, ou s'il est indisponible, faux : on ne tire rien d'une entité qui ne répond pas. */
export function camPrivee(index, S, camId) {
  if (!S || !camId) return false;
  const { liste } = voisines(index, camId);
  const sw = liste.find(({ id, m }) => domaineDe(id) === 'switch' && m.translationKey === 'privacy_mode');
  return !!sw && !!S[sw.id] && S[sw.id].state === 'on';
}

/** De quoi orienter la caméra : `{ mode, haut, bas, gauche, droite, stop }` (les identifiants des boutons, ceux qui
 *  manquent absents), ou null quand rien n'est sûr. En mode `continu`, sans bouton d'arrêt rien ne part : une
 *  caméra qu'on ne saurait pas arrêter ne se pilote pas. */
export function ptzDe(index, S, camId) {
  if (!S || !camId) return null;
  const { meta, liste } = voisines(index, camId);
  const table = meta && PTZ[meta.platform];
  if (!table) return null;
  const sortie = { mode: table.mode };
  liste.forEach(({ id, m }) => {
    if (domaineDe(id) !== 'button' || m.platform !== meta.platform || !S[id]) return;
    const cle = SENS.concat('stop').find(k => table[k] && table[k] === m.translationKey);
    if (cle && !sortie[cle]) sortie[cle] = id;
  });
  if (!SENS.some(k => sortie[k])) return null;
  if (table.mode === 'continu' && !sortie.stop) return null;
  return sortie;
}
