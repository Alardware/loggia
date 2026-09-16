/* L'ambiance d'une piece, en une ligne (ADR 0029, etape 2 de la refonte).
 *
 * La carte d'une piece disait « 4 lampes allumees » ou « Tout eteint » : le
 * compte des lumieres, rien d'autre. Elle dit maintenant ce qui compte, dans
 * cet ordre :
 *   - un PROBLEME s'il y en a un : une fenetre ou une porte ouverte, un CO2
 *     au palier « charge » ;
 *   - sinon l'ACTIVITE : « 4 lumieres · TV · Chauffe » ;
 *   - sinon le CALME : « Tout est eteint ».
 * Rien d'invente : chaque mot vient d'un etat de Home Assistant, range dans
 * la piece par sa zone. Pur : pas de React, pas de Home Assistant.
 */
import { tr } from './i18n.js';
import { CLASSES_PORTE, CLASSES_FENETRE, SEUIL_CO2 } from './attention.js';

export const NIVEAUX_PIECE = ['probleme', 'actif', 'calme'];
/* Le probleme en orange (comme le badge CO2 « charge »), l'activite en ambre
 * (la couleur qu'avait deja « 4 lampes allumees »), le calme en retrait. */
export const COULEURS_PIECE = { probleme: 'var(--o-warn2)', actif: 'var(--o-warn)', calme: 'var(--o-text3)' };

/** La ligne d'etat d'une piece. `medias` = [{ tv: bool }] en lecture,
 * `ouverts` = [{ famille: 'porte'|'fenetre' }]. */
export function ambiancePiece({ lumieres = 0, medias = [], chauffe = false, froid = false, ouverts = [], co2 = null } = {}) {
  const problemes = [];
  const liste = Array.isArray(ouverts) ? ouverts.filter(Boolean) : [];
  const portes = liste.filter(o => o.famille === 'porte').length;
  const fenetres = liste.filter(o => o.famille === 'fenetre').length;
  if (portes && fenetres) problemes.push(tr('{n} ouvrants ouverts', { n: portes + fenetres }));
  else if (fenetres) problemes.push(fenetres > 1 ? tr('{n} fenêtres ouvertes', { n: fenetres }) : tr('Fenêtre ouverte'));
  else if (portes) problemes.push(portes > 1 ? tr('{n} portes ouvertes', { n: portes }) : tr('Porte ouverte'));
  const ppm = Number(co2);
  if (co2 != null && !isNaN(ppm) && ppm >= SEUIL_CO2) problemes.push(tr('CO₂ élevé'));
  if (problemes.length) return { niveau: 'probleme', texte: problemes.join(' · '), couleur: COULEURS_PIECE.probleme, icone: 'triangle-warning' };

  const actifs = [];
  const n = Number(lumieres) || 0;
  if (n > 0) actifs.push(n > 1 ? tr('{n} lumières', { n }) : tr('{n} lumière', { n }));
  const lecteurs = Array.isArray(medias) ? medias.filter(Boolean) : [];
  if (lecteurs.some(m => m.tv)) actifs.push(tr('TV'));
  if (lecteurs.some(m => !m.tv)) actifs.push(tr('Musique'));
  if (chauffe) actifs.push(tr('Chauffe'));
  else if (froid) actifs.push(tr('Rafraîchit'));
  if (actifs.length) return { niveau: 'actif', texte: actifs.join(' · '), couleur: COULEURS_PIECE.actif, icone: null };

  return { niveau: 'calme', texte: tr('Tout est éteint'), couleur: COULEURS_PIECE.calme, icone: null };
}

/** Une passe sur les etats : ce que chaque zone a de vivant — lecteurs en
 * lecture (et s'ils sont une television), chauffage qui chauffe ou
 * rafraichit, portes et fenetres ouvertes. Cle = zone normalisee par `norm`
 * (celle de l'appelant, pour comparer comme lui). Une entite sans zone
 * n'appartient a aucune piece ; une entite muette ne compte pas. */
export function ambiancesParPiece(S, areaNameOf, norm = (s) => String(s || '').toLowerCase()) {
  const out = {};
  const piece = (id) => {
    const nom = typeof areaNameOf === 'function' ? areaNameOf(id) : null;
    if (!nom) return null;
    const k = norm(nom);
    return out[k] || (out[k] = { medias: [], chauffe: false, froid: false, ouverts: [] });
  };
  for (const id in (S || {})) {
    const st = S[id];
    if (!st || st.state === 'unavailable' || st.state === 'unknown') continue;
    const a = st.attributes || {};
    if (id.indexOf('media_player.') === 0) {
      if (st.state !== 'playing') continue;
      const r = piece(id); if (r) r.medias.push({ id, tv: a.device_class === 'tv' });
    } else if (id.indexOf('climate.') === 0) {
      if (a.hvac_action !== 'heating' && a.hvac_action !== 'cooling') continue;
      const r = piece(id); if (r) { if (a.hvac_action === 'heating') r.chauffe = true; else r.froid = true; }
    } else if (id.indexOf('binary_sensor.') === 0) {
      if (st.state !== 'on') continue;
      const famille = CLASSES_PORTE.indexOf(a.device_class) >= 0 ? 'porte' : CLASSES_FENETRE.indexOf(a.device_class) >= 0 ? 'fenetre' : null;
      if (!famille) continue;
      const r = piece(id); if (r) r.ouverts.push({ id, nom: a.friendly_name || id, famille });
    }
  }
  return out;
}
