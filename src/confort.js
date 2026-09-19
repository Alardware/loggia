/* ── Le confort d'une pièce, sans React (ADR 0039) ──────────────────────────
 *
 * Quatre mesures au plus — température, humidité, CO₂, bruit —, chacune avec
 * son verdict, et un indice sur 100 qui les résume. Une mesure que la pièce
 * n'a pas ne compte pas et ne s'affiche pas : l'indice se calcule sur ce qui
 * existe, et sans aucune mesure il n'y a pas d'indice.
 *
 * UNE SEULE TABLE DE SEUILS. La barre de la pièce, sa fiche (`COMFORT`,
 * App.jsx), les cartes des capteurs et leur jauge lisent les paliers d'ici :
 * ils ne peuvent pas se contredire. Ce sont ceux des captures Netatmo fournies
 * le 19/09 (« les valeurs sont inscrites sur les photos ») : bornes et
 * couleurs.
 *
 * Pur : pas de React, pas de Home Assistant, testable à sec
 * (tests/pieces_confort.test.mjs).
 */
import { tr, locale } from './i18n.js';

const OK = 'var(--o-ok)', DOUX = 'var(--o-accent-soft)', BLEU = 'var(--o-cold)';
const AMBRE = 'var(--o-warn)', ORANGE = 'var(--o-warn2)', ROUGE = 'var(--o-bad)';

/* Un palier : [borne, mot, couleur]. La borne est EXCLUE (« < 15 »), sauf
 * `inclus` (« ≤ 23 : idéal »). Le dernier palier n'a pas de borne. Les mots
 * sont des littéraux : le catalogue les retrouve.
 *
 * Les bornes et les couleurs des captures : le bleu, c'est l'idéal ; puis le
 * vert, le jaune (ambre), l'orange et le rouge à mesure qu'on s'en éloigne —
 * des deux côtés pour la température et l'humidité. */
const PALIERS = {
  temp: () => [[15, tr('Trop froid'), ROUGE], [16, tr('Froid'), ORANGE], [17, tr('Frais'), AMBRE], [18, tr('Bon'), OK], [23, tr('Idéal'), BLEU, true], [26, tr('Bon'), OK, true], [27, tr('Un peu chaud'), AMBRE, true], [29, tr('Chaud'), ORANGE, true], [null, tr('Trop chaud'), ROUGE]],
  hum: () => [[15, tr('Très sec'), ROUGE], [20, tr('Trop sec'), ORANGE], [30, tr('Sec'), AMBRE], [40, tr('Bon'), OK], [50, tr('Idéal'), BLEU, true], [60, tr('Bon'), OK, true], [70, tr('Humide'), AMBRE, true], [80, tr('Trop humide'), ORANGE, true], [null, tr('Très humide'), ROUGE]],
  co2: () => [[900, tr('Excellent'), BLEU], [1150, tr('Bon'), OK], [1400, tr('Moyen'), AMBRE], [1600, tr('Élevé'), ORANGE], [null, tr('Confiné'), ROUGE]],
  bruit: () => [[50, tr('Calme'), BLEU], [65, tr('Modéré'), OK], [70, tr('Animé'), AMBRE], [80, tr('Bruyant'), ORANGE], [null, tr('Très bruyant'), ROUGE]],
};

/* La note d'une mesure, de 0 à 100 : des points d'ancrage reliés en ligne
 * droite, calés sur les paliers ci-dessus — le plateau de l'idéal (le bleu)
 * vaut 100, la note descend à mesure qu'on s'en éloigne. */
const COURBES = {
  temp: [[13, 0], [15, 25], [16, 45], [17, 65], [18, 100], [23, 100], [26, 70], [27, 55], [29, 25], [31, 0]],
  hum: [[5, 0], [15, 25], [20, 45], [30, 70], [40, 100], [50, 100], [60, 70], [70, 45], [80, 25], [90, 0]],
  co2: [[400, 100], [900, 100], [1150, 80], [1400, 55], [1600, 30], [2200, 0]],
  bruit: [[0, 100], [50, 100], [65, 70], [70, 55], [80, 25], [90, 0]],
};

export const MESURES_CONFORT = ['temp', 'hum', 'co2', 'bruit'];
const HABILLAGE = {
  temp: () => ({ nom: tr('Température'), icone: 'thermometer-half' }),
  hum: () => ({ nom: tr('Humidité'), icone: 'humidity' }),
  co2: () => ({ nom: 'CO₂', icone: 'wind' }),
  bruit: () => ({ nom: tr('Bruit'), icone: 'volume' }),
};

const lisible = (v) => v != null && v !== '' && !isNaN(v);

export function verdictMesure(cle, v) {
  if (!PALIERS[cle] || !lisible(v)) return null;
  const n = Number(v);
  const p = PALIERS[cle]().find(([borne, , , inclus]) => borne == null || (inclus ? n <= borne : n < borne));
  return { t: p[1], c: p[2] };
}

/* La JAUGE d'une mesure (cartes des capteurs et fiche de confort, 19/09) :
 * les paliers ci-dessus sur une échelle LINÉAIRE, bornée comme celles des
 * captures, et leurs repères — les chiffres écrits sous leurs barres. Les
 * positions sont des pourcentages de la barre. */
const ECHELLES = {
  temp: { de: 14, a: 30, reperes: [15, 17, 23, 26, 29] },
  hum: { de: 12, a: 83, reperes: [15, 30, 40, 50, 60, 70, 80] },
  co2: { de: 850, a: 1700, reperes: [900, 1150, 1400, 1600] },
  bruit: { de: 46, a: 83, reperes: [50, 65, 70, 80] },
};
const position = (e, x) => Math.round(Math.max(0, Math.min(100, (x - e.de) / (e.a - e.de) * 100)) * 10) / 10;

/** L'échelle d'une mesure : { de, a, bandes: [{de, a, c}], reperes: [{v, pos}] }, ou null. */
export function echelleMesure(cle) {
  const e = ECHELLES[cle];
  if (!e || !PALIERS[cle]) return null;
  let debut = e.de;
  const bandes = PALIERS[cle]().map(([borne, , c]) => {
    const fin = borne == null ? e.a : borne;
    const b = { de: position(e, debut), a: position(e, fin), c };
    debut = fin;
    return b;
  });
  return { de: e.de, a: e.a, bandes, reperes: e.reperes.map(v => ({ v, pos: position(e, v) })) };
}

/** La jauge d'une valeur : l'échelle, la position du trait et le verdict — ou null. */
export function jaugeMesure(cle, v) {
  const e = echelleMesure(cle);
  if (!e || !lisible(v)) return null;
  return { ...e, pos: position(ECHELLES[cle], Number(v)), verdict: verdictMesure(cle, v) };
}

/* La mesure d'un capteur Home Assistant, lue à sa classe. */
const CLES = { temperature: 'temp', humidity: 'hum', carbon_dioxide: 'co2', sound_pressure: 'bruit' };
export function cleMesure(deviceClass) { return CLES[deviceClass] || null; }

/* La PILE en cinq barres, comme la capture du 19/09 : 100 % → cinq vertes,
 * 80 → quatre vert clair, 60 → trois jaunes, 40 → deux orange, 20 → une
 * rouge — au plus proche (81 % en montre quatre), jamais moins d'une. */
const VERT_CLAIR = 'color-mix(in srgb, var(--o-ok) 55%, var(--o-warn))';
export function barresPile(pct) {
  if (!lisible(pct)) return null;
  const n = Math.max(1, Math.min(5, Math.round(Number(pct) / 20)));
  return { n, c: [ROUGE, ORANGE, AMBRE, VERT_CLAIR, OK][n - 1] };
}

export function scoreMesure(cle, v) {
  const pts = COURBES[cle];
  if (!pts || !lisible(v)) return null;
  const n = Number(v);
  if (n <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (n <= x1) return Math.round(y0 + (y1 - y0) * (n - x0) / (x1 - x0));
  }
  return pts[pts.length - 1][1];
}

const nombre = (n, decimales) => Number(n).toLocaleString(locale(), { maximumFractionDigits: decimales, minimumFractionDigits: 0 });

/** « 21,4 °C », « 47 % », « 612 ppm », « 34 dB ». */
export function valeurConfort(cle, v) {
  if (!lisible(v)) return null;
  if (cle === 'temp') return nombre(v, 1) + ' °C';
  if (cle === 'hum') return nombre(v, 0) + ' %';
  if (cle === 'co2') return nombre(v, 0) + ' ppm';
  if (cle === 'bruit') return nombre(v, 0) + ' dB';
  return null;
}

/* Le mot de l'indice. Les mêmes couleurs que les mesures : un indice ambre
 * s'explique toujours par une mesure ambre ou pire. */
export function verdictIndice(indice) {
  if (!lisible(indice)) return null;
  if (indice >= 80) return { t: tr('Confortable'), c: OK };
  if (indice >= 60) return { t: tr('Correct'), c: DOUX };
  if (indice >= 40) return { t: tr('Acceptable'), c: AMBRE };
  if (indice >= 20) return { t: tr('À améliorer'), c: ORANGE };
  return { t: tr('Inconfortable'), c: ROUGE };
}

/* L'INDICE : la moyenne des notes, tirée vers le bas par la pire. Une pièce à
 * 21 °C n'est pas confortable si l'air y est confiné : la moyenne seule le
 * cacherait, la pire note seule ignorerait tout le reste. */
export function indiceConfort(valeurs) {
  const mesures = MESURES_CONFORT
    .filter(cle => valeurs && lisible(valeurs[cle]))
    .map(cle => ({ cle, ...HABILLAGE[cle](), valeur: valeurConfort(cle, valeurs[cle]), verdict: verdictMesure(cle, valeurs[cle]), score: scoreMesure(cle, valeurs[cle]) }));
  if (!mesures.length) return null;
  const notes = mesures.map(m => m.score);
  const moyenne = notes.reduce((a, n) => a + n, 0) / notes.length;
  const indice = Math.round((moyenne + Math.min(...notes)) / 2);
  return { indice, verdict: verdictIndice(indice), mesures };
}

/* Le capteur de bruit d'une pièce : la `device_class` fait foi. L'unité ne
 * suffit pas — la force d'un signal Wi-Fi se mesure aussi en dB. */
export function capteurBruit(ids, S) {
  return (ids || []).find(id => {
    const st = S && S[id];
    return String(id).indexOf('sensor.') === 0 && !!st && st.attributes && st.attributes.device_class === 'sound_pressure' && lisible(parseFloat(st.state));
  }) || null;
}
