/* ── Le confort d'une pièce, sans React (ADR 0039) ──────────────────────────
 *
 * Quatre mesures au plus — température, humidité, CO₂, bruit —, chacune avec
 * son verdict, et un indice sur 100 qui les résume. Une mesure que la pièce
 * n'a pas ne compte pas et ne s'affiche pas : l'indice se calcule sur ce qui
 * existe, et sans aucune mesure il n'y a pas d'indice.
 *
 * UNE SEULE TABLE DE SEUILS. Les paliers de la température, de l'humidité et du
 * CO₂ sont ceux de la fiche de confort (`COMFORT`, App.jsx), qui délègue
 * désormais ses verdicts ici : la barre de la pièce et sa fiche ne peuvent pas
 * se contredire.
 *
 * Pur : pas de React, pas de Home Assistant, testable à sec
 * (tests/pieces_confort.test.mjs).
 */
import { tr, locale } from './i18n.js';

const OK = 'var(--o-ok)', DOUX = 'var(--o-accent-soft)', FROID = 'var(--o-cold)';
const AMBRE = 'var(--o-warn)', ORANGE = 'var(--o-warn2)', ROUGE = 'var(--o-bad)';

/* Un palier : [borne, mot, couleur]. La borne est EXCLUE (« < 16 »), sauf
 * `inclus` — la température et l'humidité gardent leurs bornes hautes incluses
 * (« ≤ 24 : idéal »), comme la fiche les a toujours lues. Le dernier palier n'a
 * pas de borne. Les mots sont des littéraux : le catalogue les retrouve. */
const PALIERS = {
  temp: () => [[16, tr('Trop froid'), FROID], [18, tr('Frais'), DOUX], [24, tr('Idéal'), OK, true], [26, tr('Un peu chaud'), AMBRE, true], [28, tr('Trop chaud'), ORANGE, true], [null, tr('Très chaud'), ROUGE]],
  hum: () => [[30, tr('Trop sec'), ORANGE], [40, tr('Correct'), AMBRE], [60, tr('Bon'), OK, true], [70, tr('Humide'), AMBRE, true], [null, tr('Trop humide'), ROUGE]],
  co2: () => [[800, tr('Excellent'), OK], [1000, tr('Bon'), OK], [1200, tr('Moyen'), AMBRE], [1400, tr('Élevé'), ORANGE], [null, tr('Confiné'), ROUGE]],
  bruit: () => [[40, tr('Calme'), OK], [55, tr('Animé'), AMBRE], [70, tr('Bruyant'), ORANGE], [null, tr('Très bruyant'), ROUGE]],
};

/* La note d'une mesure, de 0 à 100 : des points d'ancrage reliés en ligne
 * droite, calés sur les paliers ci-dessus — le plateau du « bon » vaut 100, la
 * note descend à mesure qu'on s'en éloigne. */
const COURBES = {
  temp: [[10, 0], [16, 35], [18, 70], [19.5, 100], [23, 100], [24, 90], [26, 60], [28, 30], [32, 0]],
  hum: [[0, 0], [20, 20], [30, 50], [40, 90], [45, 100], [55, 100], [60, 90], [70, 55], [80, 20], [100, 0]],
  co2: [[400, 100], [800, 100], [1000, 85], [1200, 60], [1400, 35], [2000, 10], [3000, 0]],
  bruit: [[0, 100], [35, 100], [40, 90], [55, 60], [70, 25], [85, 0]],
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
