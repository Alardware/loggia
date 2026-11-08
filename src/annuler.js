/* « Annuler » pendant cinq secondes après un geste groupé (06/11, étape 7 du rapport sur l'usage).
 *
 * « Seul le minuteur peut s'annuler. Un “Tout éteindre” ou un scénario lancé par erreur ne se rattrape pas. » Avant
 * chaque geste qui touche plusieurs appareils — un scénario, les lumières d'une pièce, Tout éteindre, les volets
 * groupés, une ambiance, une scène ou un script, l'aération, le mode de la maison —, Loggia photographie les lumières,
 * les interrupteurs, les ventilateurs, les volets et les thermostats ; le geste parti, un bandeau dit ce qui s'est fait
 * et propose « Annuler » cinq secondes (`chrome/bandeauannuler.jsx`). Annuler remet comme avant ce qui a CHANGÉ depuis
 * la photo : la lampe, son niveau et son blanc ou sa couleur ; le volet, sa position ; le thermostat, son mode, son
 * préréglage ou sa consigne. Ni l'alarme, ni les serrures, ni les médias : on ne désarme pas, on ne déverrouille pas,
 * on ne relance pas une lecture d'un geste de rattrapage.
 *
 * Un geste qui sait se défaire lui-même (le mode de la maison, que le serveur applique) passe SA fonction (`defaire`) :
 * pas de photo, et c'est elle qu'Annuler appelle. */
import { getHass } from './state.js';
import { commanderService } from './actions.js';
import { avancerLumieres } from './lumieresetat.js';
import { lancerCourse } from './voletcourse.js';
import { OUBLIER_OPTIMISTES } from './optimiste.js';

export const DUREE_ANNULER_MS = 5000;
export const EVENEMENT_ANNULABLE = 'loggia:annulable';
const DOMAINES = ['light', 'switch', 'fan', 'cover', 'climate'];
const MUETS = ['unavailable', 'unknown'];
const nombre = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const ouvert = (etat) => etat === 'open' || etat === 'opening';

/** Ce qu'il faudra peut-être remettre : `{ id: { etat, bri, kelvin, xy, hs, rgb, mode, pos, consigne, preset } }`. */
export function photographier(S) {
  const photo = {};
  Object.keys(S || {}).forEach(id => {
    const st = S[id];
    if (DOMAINES.indexOf(id.split('.')[0]) < 0 || !st || MUETS.indexOf(st.state) >= 0) return;
    const a = st.attributes || {};
    photo[id] = {
      etat: st.state, bri: nombre(a.brightness), kelvin: nombre(a.color_temp_kelvin), xy: Array.isArray(a.xy_color) ? a.xy_color : null,
      // Une couleur se garde dans la forme que la lampe publie : xy d'abord, sinon teinte / saturation, sinon RVB.
      hs: Array.isArray(a.hs_color) ? a.hs_color : null, rgb: Array.isArray(a.rgb_color) ? a.rgb_color : null,
      mode: a.color_mode || null, pos: nombre(a.current_position), consigne: nombre(a.temperature), preset: a.preset_mode || null,
    };
  });
  return photo;
}

/** Les ordres qui remettent comme sur la photo ce qui a changé depuis : `[{ id, domaine, service, data, cible? }]`. */
export function retoursDe(photo, S) {
  const out = [];
  Object.keys(photo || {}).forEach(id => {
    const avant = photo[id], st = S && S[id];
    if (!st || MUETS.indexOf(st.state) >= 0) return;
    const dom = id.split('.')[0];
    const a = st.attributes || {};
    if (dom === 'light') {
      if (avant.etat === 'off') { if (st.state !== 'off') out.push({ id, domaine: 'light', service: 'turn_off', data: { entity_id: id } }); return; }
      if (avant.etat !== 'on') return;
      const enBlanc = avant.mode === 'color_temp';
      const champ = avant.xy ? 'xy_color' : avant.hs ? 'hs_color' : avant.rgb ? 'rgb_color' : null;
      const couleur = avant.xy || avant.hs || avant.rgb;
      const change = st.state !== 'on'
        || (avant.bri != null && Math.abs((nombre(a.brightness) || 0) - avant.bri) > 2)
        || (avant.mode != null && a.color_mode != null && a.color_mode !== avant.mode)
        || (enBlanc && avant.kelvin != null && nombre(a.color_temp_kelvin) !== avant.kelvin)
        || (!enBlanc && champ != null && JSON.stringify(a[champ]) !== JSON.stringify(couleur));
      if (!change) return;
      const data = { entity_id: id };
      if (avant.bri != null) data.brightness = avant.bri;
      if (enBlanc && avant.kelvin != null) data.color_temp_kelvin = avant.kelvin;
      else if (champ) data[champ] = couleur;
      out.push({ id, domaine: 'light', service: 'turn_on', data });
    } else if (dom === 'switch' || dom === 'fan') {
      if (st.state !== avant.etat && (avant.etat === 'on' || avant.etat === 'off')) {
        out.push({ id, domaine: dom, service: avant.etat === 'on' ? 'turn_on' : 'turn_off', data: { entity_id: id } });
      }
    } else if (dom === 'cover') {
      const pos = nombre(a.current_position);
      // Un volet qui bouge encore revient aussi : sa course est celle du geste qu'on annule.
      if (avant.pos != null && (pos == null || Math.abs(pos - avant.pos) > 1 || /ing$/.test(st.state))) {
        out.push({ id, domaine: 'cover', service: 'set_cover_position', data: { entity_id: id, position: avant.pos }, cible: avant.pos });
      } else if (ouvert(st.state) !== ouvert(avant.etat)) {
        // Sans position, ou une position qui ne bouge pas quand le volet change d'état (Home Assistant ne voit pas la course de
        // certains moteurs) : ouvrir ou fermer, pas une position qu'il croit déjà atteinte.
        out.push({ id, domaine: 'cover', service: ouvert(avant.etat) ? 'open_cover' : 'close_cover', data: { entity_id: id }, cible: ouvert(avant.etat) ? 100 : 0 });
      }
    } else if (dom === 'climate') {
      if (st.state !== avant.etat) out.push({ id, domaine: 'climate', service: 'set_hvac_mode', data: { entity_id: id, hvac_mode: avant.etat } });
      if (avant.preset && a.preset_mode !== avant.preset) out.push({ id, domaine: 'climate', service: 'set_preset_mode', data: { entity_id: id, preset_mode: avant.preset } });
      else if (avant.consigne != null && nombre(a.temperature) !== avant.consigne) out.push({ id, domaine: 'climate', service: 'set_temperature', data: { entity_id: id, temperature: avant.consigne } });
    }
  });
  return out;
}

/**
 * Faire un geste groupé qu'on pourra rattraper cinq secondes : la photo d'abord, le geste, puis le bandeau — après sa
 * réponse quand le geste rend une promesse, et seulement s'il a réussi ; un refus remonte tel quel à l'écoute globale.
 * Rend ce que rend le geste.
 */
export function annulable(texte, geste, defaire = null) {
  const h = getHass();
  const photo = defaire ? null : photographier(h && h.states);
  const annoncer = () => {
    try { window.dispatchEvent(new CustomEvent(EVENEMENT_ANNULABLE, { detail: { texte, photo, defaire } })); } catch { /* sans fenêtre */ }
  };
  const r = geste();
  if (r && typeof r.then === 'function') return r.then((v) => { annoncer(); return v; });
  annoncer();
  return r;
}

/** Annuler : la fonction du geste s'il en a une, sinon les ordres de retour — les cartes le montrent tout de suite. Rend le nombre d'ordres. */
export function defaireAnnulable(d) {
  if (!d) return 0;
  // Les cartes lâchent ce que le geste leur avait fait afficher : elles redisent la maison (optimiste.js) — et celles qui le
  // peuvent montrent tout de suite la photo d'avant (la tuile d'une pièce, accueil/briques.jsx).
  try { window.dispatchEvent(new CustomEvent(OUBLIER_OPTIMISTES, { detail: { photo: d.photo || null } })); } catch { /* sans fenêtre */ }
  if (d.defaire) { d.defaire(); return 1; }
  const h = getHass();
  if (!h || !h.states) return 0;
  const ordres = retoursDe(d.photo, h.states);
  const lampes = (service) => ordres.filter(o => o.domaine === 'light' && o.service === service).map(o => o.id);
  if (lampes('turn_on').length) avancerLumieres(lampes('turn_on'), true, h.states);
  if (lampes('turn_off').length) avancerLumieres(lampes('turn_off'), false, h.states);
  ordres.forEach(o => {
    if (o.domaine === 'cover' && o.cible != null) lancerCourse(o.id, o.cible, h.states[o.id]);
    commanderService(h, o.id, o.domaine, o.service, o.data);
  });
  return ordres.length;
}
