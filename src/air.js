/* ── L'air : la carte CO₂ du rail de l'Accueil (ADR 0044) ────────────────────
 *
 * Une capture fournie le 18/09 (« j'aime beaucoup cette carte CO₂ ») : le nom,
 * la pièce et la règle d'aération, l'étendue des vingt-quatre heures, une
 * barre par heure — la dernière plus sombre, c'est maintenant —, et un bouton
 * pour aérer. La capture donne la DISPOSITION ; les teintes sont celles des
 * cartes du rail.
 *
 * Ce fichier porte tout ce qui se CALCULE ; pas de React, pas de Home
 * Assistant. Rien sans source : le seuil est celui de la veille CO₂ du
 * serveur quand elle répond, sinon le seul chiffre de la maison
 * (`SEUIL_CO2`) ; le bouton n'existe que s'il y a quelque chose à commander —
 * la ventilation de la veille, sinon les volets de la zone du capteur.
 */
import { tr } from './i18n.js';
import { SEUIL_CO2 } from './attention.js';

const nombre = (v) => { const n = typeof v === 'number' ? v : parseFloat(v); return isNaN(n) ? null : n; };

/** Les points d'un historique Home Assistant : [{t, v}] triés, les états non numériques écartés. */
export function pointsHistorique(brut) {
  const lignes = Array.isArray(brut) ? (Array.isArray(brut[0]) ? brut[0] : brut) : [];
  return lignes
    .map(e => ({ t: Date.parse((e && (e.last_changed || e.last_updated)) || ''), v: nombre(e && e.state) }))
    .filter(p => !isNaN(p.t) && p.v != null)
    .sort((a, b) => a.t - b.t);
}

/**
 * Les barres d'une journée : `n` tranches égales jusqu'à `fin`, chacune la
 * moyenne PONDÉRÉE PAR LE TEMPS de la mesure — un historique ne note que les
 * changements, une heure sans changement vaut la dernière valeur. Avant le
 * premier point on ne sait rien : la barre est nulle, pas zéro.
 */
export function barresJournee(points, fin, { heures = 24, n = 24 } = {}) {
  const debut = fin - heures * 3600000;
  const pas = (fin - debut) / n;
  const pts = (points || []).filter(p => p && Number.isFinite(p.v) && !isNaN(p.t)).sort((a, b) => a.t - b.t);
  const barres = [];
  for (let i = 0; i < n; i++) {
    const a = debut + i * pas, b = a + pas;
    let somme = 0, duree = 0;
    for (let k = 0; k < pts.length; k++) {
      const t0 = Math.max(a, pts[k].t);
      const t1 = Math.min(b, k + 1 < pts.length ? pts[k + 1].t : b);
      if (t1 <= t0) continue;
      somme += pts[k].v * (t1 - t0); duree += t1 - t0;
    }
    barres.push(duree > 0 ? Math.round(somme / duree) : null);
  }
  return barres;
}

/** L'étendue des barres, la valeur du moment comprise : {min, max}, ou nuls. */
export function etendue(barres, actuel = null) {
  const v = (barres || []).filter(x => x != null).concat(nombre(actuel) != null ? [nombre(actuel)] : []);
  if (!v.length) return { min: null, max: null };
  return { min: Math.round(Math.min(...v)), max: Math.round(Math.max(...v)) };
}

/** Le capteur le plus chargé : [{id, piece, valeur}] → celui-là, ou null. */
export function pireCapteur(capteurs) {
  let pire = null;
  (capteurs || []).forEach(c => {
    const v = c && c.id ? nombre(c.valeur) : null;
    if (v == null) return;
    if (!pire || v > pire.valeur) pire = { id: c.id, piece: c.piece || null, valeur: v };
  });
  return pire;
}

/** Le seuil d'aération : celui de la veille CO₂ du serveur, sinon celui de la maison. */
export function seuilCo2(veilles) {
  const s = veilles && veilles.config && veilles.config.co2 ? nombre(veilles.config.co2.seuil) : null;
  return s != null && s > 0 ? Math.round(s) : SEUIL_CO2;
}

/** La ventilation de la veille CO₂ : ses entités, celles qui existent. */
export function ventilationVeille(veilles, states) {
  const liste = veilles && veilles.config && veilles.config.co2 && Array.isArray(veilles.config.co2.ventilation) ? veilles.config.co2.ventilation : [];
  return liste.filter(id => typeof id === 'string' && states && states[id] && states[id].state !== 'unavailable');
}

/** Les volets de la zone d'un capteur, ceux qui savent s'ouvrir (bit OPEN). */
export function voletsDeLaZone(index, states, idCapteur) {
  if (!index || typeof index.areaOf !== 'function' || !idCapteur) return [];
  const zone = index.areaOf(idCapteur);
  const a = (index.areaList || []).find(x => x && x.id === zone);
  return ((a && a.entities) || []).filter(id => {
    if (id.indexOf('cover.') !== 0) return false;
    const st = states && states[id];
    return !!st && st.state !== 'unavailable' && ((st.attributes && st.attributes.supported_features) & 1) === 1;
  });
}

/** Le geste pour aérer : ventiler s'il y a une ventilation, sinon ouvrir les volets ; rien sinon. */
export function actionAerer({ ventilation = [], volets = [] } = {}) {
  if (ventilation.length) return { type: 'ventiler', ids: ventilation, domaine: 'homeassistant', service: 'turn_on', libelle: tr('Ventiler') };
  if (volets.length) return { type: 'volets', ids: volets, domaine: 'cover', service: 'open_cover', libelle: tr('Ouvrir les volets · aérer') };
  return null;
}

/** Les trois repères de l'axe : « −24 h », « −12 h », « maintenant ». */
export function reperesAxe(heures = 24) {
  return ['−' + heures + ' h', '−' + (heures / 2) + ' h', tr('maintenant')];
}
