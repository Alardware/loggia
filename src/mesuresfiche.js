/* ── Ce que calcule la fiche d'une mesure (chantier Capteurs, § 4, § 6 et § 7 ; C9) ─────────
 *
 * Sans React, testable à sec (tests/fiche_mesure.test.mjs). Chargé avec la fiche
 * (`fichecapteur.jsx`), jamais au démarrage : rien d'ici ne sert la carte. La
 * table reste UNE (`confort.js`) : les zones, leurs bornes, leurs mots et leurs
 * couleurs viennent de là. Les valeurs arrivent dans le repère de la table — le
 * Celsius, le km/h (`versTable`, la vue d'une mesure) — ; les chiffres écrits
 * repartent dans l'unité du capteur.
 */
import { tr, locale } from './i18n.js';
import { zonesMesure, echelleMesure, repereDans, versRepere, chiffreMesure } from './confort.js';
import { nombre } from './format.js';

const JOUR = 24 * 3600000;
const instant = (x) => (typeof x === 'number' ? x : Date.parse(x));

/** Les moyennes sur 5 minutes que rend `recorder/statistics_during_period` pour `id`, en points `{ t, v }`, ou []. Un point se date
 * au DÉBUT de sa tranche (`start`, correction bis, point 12) : la moyenne de 21:25 à 21:30 dit la mesure depuis 21:25 — « depuis »
 * le redit ; à défaut, sa fin. */
export function lireStats(r, id) {
  const l = r && typeof r === 'object' && Array.isArray(r[id]) ? r[id] : [];
  return l.map(x => ({ t: instant(x.start != null ? x.start : x.end), v: x.mean == null ? NaN : Number(x.mean) }))
    .filter(p => Number.isFinite(p.t) && Number.isFinite(p.v));
}

/* Le rang de la zone d'une valeur, lu dans les zones d'une famille déjà bâties (`zonesMesure`) : la table ne se rebâtit pas à
 * chaque point d'une courbe (correction bis, point 13). -1 hors de toute zone. */
const rangDans = (zones, v) => zones.findIndex(z => (z.inclus ? v <= z.a : v < z.a));

/* Le conseil d'une zone hors du bon (§ 6, C9) : le CO₂ moyen, élevé ou confiné ;
 * l'humidité trop haute ou trop basse ; les particules et les COV. La
 * température, le bruit, la lumière et le vent n'en ont pas — ni une zone du
 * dehors, où rien n'est une alerte (C15, révisé le 16/10). */
export function conseilMesure(cle, z) {
  if (!z || z.bon || z.dehors) return null;
  if (cle === 'co2') return z.i === 2 ? tr('Pensez à aérer avant la nuit.') : tr('Ouvrez la fenêtre 10 minutes.');
  if (cle === 'hum') return z.i > 4 ? tr('Aérez : l’air est trop humide.') : tr('L’air est sec.');
  // Les PM10 et le NO₂ de la maison aussi (chantier G4, A5) ; pas l'ozone, qui vient surtout du dehors.
  if (cle === 'pm25' || cle === 'cov' || cle === 'pm10' || cle === 'no2') return tr('Aérez 5 minutes.');
  return null;
}

/**
 * Depuis quand la mesure est dans sa zone (C9) : `{ t, borne, dessous }` —
 * l'heure où la courbe a franchi la borne de la zone, côté bon (`borne`, dans le
 * repère de la table), et si la zone est SOUS le bon (trop froid, trop sec).
 * `points` en `{ t, v }` dans le repère de la table, du plus ancien au plus
 * récent ; `z`, la zone de la carte (`{ i, bon }`) ; `zones`, celles de sa
 * famille, bâties une seule fois (`zonesMesure`). Rien pour une zone bonne, ni quand la
 * courbe ne le dit pas : sa dernière tranche n'y est pas encore, ou toute la
 * journée y était — « depuis » serait plus vieux que la courbe.
 */
export function depuisMesure(points, cle, z, zones = zonesMesure(cle)) {
  if (!z || z.bon || !zones[z.i]) return null;
  const dessous = zones.slice(z.i + 1).some(x => x.bon);
  const dedans = (p) => { const i = rangDans(zones, p.v); return i >= 0 && (dessous ? i <= z.i : i >= z.i); };
  const pts = (points || []).filter(p => Number.isFinite(p.t) && Number.isFinite(p.v));
  let k = pts.length - 1;
  if (k < 1 || !dedans(pts[k])) return null;
  while (k > 0 && dedans(pts[k - 1])) k--;
  return k === 0 ? null : { t: pts[k].t, borne: dessous ? zones[z.i].a : zones[z.i].de, dessous };
}

/** « Au-dessus de 1 600 ppm depuis 21:30. » : le seuil dans l'unité du capteur (`unite` : 'C' ou 'F', l'unité d'un vent ; `ecrite` : l'unité affichée). */
export function texteDepuis(d, cle, unite, ecrite) {
  if (!d) return null;
  const v = nombre(repereDans(cle, d.borne, unite)) + (ecrite ? '\u00a0' + ecrite : '');
  const h = new Date(d.t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  return d.dessous ? tr('Au-dessous de {v} depuis {h}.', { v, h }) : tr('Au-dessus de {v} depuis {h}.', { v, h });
}

/**
 * La courbe des 24 heures (§ 4), dans un cadre de 400 × 120. `points` en
 * `{ t, v }` dans le repère de la table, du plus ancien au plus récent ; le
 * temps va de `maintenant` − 24 h à `maintenant` ; les valeurs, du plus bas au
 * plus haut de la journée, un peu élargis — sur l'axe de sa barre,
 * logarithmique pour la luminosité. Rend `{ ligne, aire, bandes, reperes }` :
 * les chemins de la ligne et de l'aire ; une bande par zone hors du bon que
 * l'axe traverse, `{ y, h, rgb }` (C5 : le bon reste sans fond) ; les repères
 * de la table que l'axe montre, `{ t, y }`, écrits dans l'unité du capteur
 * (`unite`), à 12 px au moins l'un de l'autre. Null sous deux points. `zones` faux — une mesure du dehors que la
 * table ne juge pas (C15) — : ni bandes ni repères, l'axe de sa famille seul (logarithmique pour la luminosité).
 * `dehors` : les zones et les repères du dehors, quand la famille en a (C15, révisé le 16/10).
 */
export function courbeMesure(points, { cle = null, unite = null, maintenant, zones = true, dehors = false }) {
  const pts = (points || []).filter(p => Number.isFinite(p.t) && Number.isFinite(p.v));
  if (pts.length < 2) return null;
  const e = cle ? echelleMesure(cle, unite, dehors) : null;
  const ax = (x) => (e && e.log ? Math.log10(Math.max(1, x)) : x);
  const vs = pts.map(p => ax(p.v));
  let bas = Math.min(...vs), haut = Math.max(...vs);
  // Une journée presque plate se trace au milieu, sur un dixième de l'axe de sa barre (une unité, sans table).
  const plat = e ? (ax(e.a) - ax(e.de)) / 10 : 1;
  if (haut - bas < plat) { const m = (haut + bas) / 2; bas = m - plat / 2; haut = m + plat / 2; }
  const marge = (haut - bas) * 0.08;
  bas -= marge; haut += marge;
  const W = 400, H = 120, HAUT = 6;
  const arrondi = (x) => Math.round(x * 10) / 10;
  const X = (t) => arrondi(Math.max(0, Math.min(W, (t - (maintenant - JOUR)) / JOUR * W)));
  const Y = (u) => arrondi(H - (Math.max(bas, Math.min(haut, u)) - bas) / (haut - bas) * (H - HAUT));
  const ligne = pts.map((p, k) => (k ? 'L' : 'M') + X(p.t) + ' ' + Y(ax(p.v))).join('');
  const aire = ligne + 'L' + X(pts[pts.length - 1].t) + ' ' + H + 'L' + X(pts[0].t) + ' ' + H + 'Z';
  const bandes = cle && zones ? zonesMesure(cle, dehors).filter(z => !z.bon).map(z => {
    const d = Math.max(bas, ax(z.de)), f = Math.min(haut, ax(z.a));
    return f > d ? { y: Y(f), h: arrondi(Y(d) - Y(f)), rgb: z.rgb } : null;
  }).filter(Boolean) : [];
  // Les repères que l'axe montre, à 12 px au moins l'un de l'autre : celui qui serre le précédent se tait.
  const reperes = [];
  for (const r of e && zones ? e.reperes : []) {
    const u = ax(r.v), y = Y(u);
    if (u > bas && u < haut && (!reperes.length || reperes[reperes.length - 1].y - y >= 12)) reperes.push({ t: nombre(r.t), y });
  }
  return { ligne, aire, bandes, reperes };
}

/**
 * Le nom des zones sous la barre de la fiche (§ 4) : celui de la zone où l'on
 * est, toujours — centré sous sa bande, gardé dans la barre ; les autres s'ils
 * tiennent sous leur bande à la plus petite largeur de la fiche (`largeur` :
 * 240 px, au téléphone de 320 px) sans toucher un nom déjà posé. Les largeurs
 * s'estiment large : 7 px par signe, en 11,5 px / 800 (de 6,2 à 7,1 mesurés).
 * Plus large, tout s'écarte.
 * Rend `[{ k, t, pos, on }]`, `pos` en % de la barre, dans l'ordre des zones.
 */
export function motsBarre(barre, largeur = 240) {
  const SIGNE = 7, AIR = 4;
  let debut = 0;
  const bandes = barre.zones.map((z, k) => { const b = { k, t: z.t, de: debut, a: debut + z.part }; debut += z.part; return b; });
  const px = (pc) => pc / (debut || 100) * largeur;
  const poses = [];
  const libre = (g, d) => poses.every(m => d + AIR <= m.g || g >= m.d + AIR);
  const ici = bandes[barre.i], l0 = ici.t.length * SIGNE;
  const c0 = Math.max(l0 / 2, Math.min(largeur - l0 / 2, px((ici.de + ici.a) / 2)));
  poses.push({ k: ici.k, t: ici.t, g: c0 - l0 / 2, d: c0 + l0 / 2, on: true });
  for (const b of bandes) {
    const l = b.t.length * SIGNE, c = px((b.de + b.a) / 2);
    if (b.k !== barre.i && l + AIR <= px(b.a - b.de) && libre(c - l / 2, c + l / 2)) poses.push({ k: b.k, t: b.t, g: c - l / 2, d: c + l / 2, on: false });
  }
  return poses.sort((x, y) => x.k - y.k).map(m => ({ k: m.k, t: m.t, pos: Math.round((m.g + m.d) / 2 / largeur * 1000) / 10, on: m.on }));
}

/**
 * La journée d'une mesure, calculée UNE fois par lecture (correction bis, point 13 : la fiche la garde dans un `useMemo`) : les
 * points lus dans l'unité du capteur (`brut` : les statistiques, sinon l'histoire ; null tant que rien n'est lu), ramenés au repère
 * de la table ; la courbe ; « depuis » ; « min · max ». `zi` : le rang de la zone de la carte (-1 sans zone) ; `neutre` : une mesure
 * que la table ne juge pas (C15) — sa courbe, sans bandes ni repères ; `dehors` : une mesure du dehors (C15, révisé le 16/10) — sa
 * courbe sur les zones du dehors, et pas de « depuis » : rien n'y est une alerte ; `ecrite` : l'unité affichée.
 */
export function journeeMesure(brut, { cle = null, uniteTable = null, ecrite = '', neutre = false, dehors = false, zi = -1, maintenant = null } = {}) {
  const t = maintenant == null ? Date.now() : Number(maintenant);
  const lus = Array.isArray(brut) ? brut : [];
  const table = lus.map(p => ({ t: p.t, v: versRepere(cle, p.v, uniteTable) }));
  const zones = cle ? zonesMesure(cle, dehors) : [];
  const z = zones[zi] ? { i: zi, bon: zones[zi].bon } : null;
  const courbe = courbeMesure(table, { cle, unite: uniteTable, maintenant: t, zones: !neutre, dehors });
  const depuis = cle && !dehors ? texteDepuis(depuisMesure(table, cle, z, zones), cle, uniteTable, ecrite) : null;
  const ecrire = (v) => (cle ? chiffreMesure(cle, v, uniteTable) : nombre(v, 1, 0));
  const vs = lus.map(p => p.v);
  const minmax = vs.length > 1 ? tr('min {a} · max {b}', { a: ecrire(Math.min(...vs)), b: ecrire(Math.max(...vs)) }) : null;
  return { courbe, depuis, minmax };
}

/** Le dernier signal (§ 7) : le `last_updated` le plus récent des entités de l'appareil (`ids`), en ms ; null sans aucun. */
export function dernierSignal(S, ids) {
  const t = ids.map(e => (S && S[e] ? Date.parse(S[e].last_updated || S[e].last_changed) : NaN)).filter(Number.isFinite);
  return t.length ? Math.max(...t) : null;
}
