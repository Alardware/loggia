// Table des ciels, extraite de ciel.js pour qu'App.jsx puisse la lire SANS
// charger le ciel lui-meme (handoff « Loggia themes redesign », ciel-meteo.js,
// 17/10/2026). Valeurs copiees a l'identique : le HANDOFF les designe comme
// specification, elles ne se retouchent pas.
const PRESETS = {
  clair: { cover: .1, rain: 0, snow: 0, fog: 0, storm: 0, wind: .15 },
  nuageux: { cover: .48, rain: 0, snow: 0, fog: 0, storm: 0, wind: .22 },
  couvert: { cover: .88, rain: 0, snow: 0, fog: .1, storm: 0, wind: .25 },
  'pluie-faible': { cover: .86, rain: .24, snow: 0, fog: .12, storm: 0, wind: .28 },
  pluie: { cover: .9, rain: .6, snow: 0, fog: .12, storm: .06, wind: .28, drops: 1.17 },
  orage: { cover: 1, rain: .88, snow: 0, fog: .22, storm: 1, wind: .36, heavy: 0 },
  neige: { cover: .82, rain: 0, snow: 1, fog: .22, storm: 0, wind: .2 },
  brouillard: { cover: .55, rain: 0, snow: 0, fog: .86, storm: 0, wind: .05 },
  vent: { cover: .56, rain: 0, snow: 0, fog: 0, storm: 0, wind: 1 },
  averse: { cover: 1, rain: .92, snow: 0, fog: .3, storm: .48, wind: .4, heavy: 0, drops: .96 },
  'orage-sec': { cover: .94, rain: 0, snow: 0, fog: .08, storm: 1, wind: .5 },
  grele: { cover: .9, rain: .6, snow: 0, fog: .12, storm: .06, wind: .28, hail: .55, drops: .7 },
  'pluie-neige': { cover: .92, rain: .42, snow: .55, fog: .2, storm: .1, wind: .3 },
  'vent-couvert': { cover: .84, rain: 0, snow: 0, fog: 0, storm: 0, wind: .95 },
  exceptionnel: { cover: .5, rain: 0, snow: 0, fog: .25, storm: .2, wind: .45, exc: .85 },
};
for (const k in PRESETS) PRESETS[k] = { hail: 0, exc: 0, heavy: 0, drops: 1, grains: 0, ...PRESETS[k] };

// Les 15 conditions de Home Assistant (etat de weather.*) -> preset du ciel.
export const CIEL_HA = { sunny: 'clair', 'clear-night': 'clair', partlycloudy: 'nuageux', cloudy: 'couvert', fog: 'brouillard', rainy: 'pluie', pouring: 'averse', lightning: 'orage-sec', 'lightning-rainy': 'orage', hail: 'grele', snowy: 'neige', 'snowy-rainy': 'pluie-neige', windy: 'vent', 'windy-variant': 'vent-couvert', exceptional: 'exceptionnel' };

/** Le preset d'une condition HA (ou d'un nom de preset) ; « nuageux » faute de mieux. */
export const cielDe = (m) => PRESETS[CIEL_HA[m] || m] || PRESETS.nuageux;

/* Les ciels assez sombres pour que le texte pose dessus passe au blanc, meme
 * en theme clair — la maquette (Loggia Vues v2) les nomme ainsi, avec la nuit. */
export const CIEL_SOMBRES = ['lightning-rainy', 'lightning', 'pouring', 'hail'];

/* « Ciel animé » : Auto, Léger ou Fixe (Paramètres > Effets). Un réglage de
 * L'APPAREIL, pas du compte : c'est la tablette murale qui rame, pas le PC —
 * et « Auto » y dit justement ce que CET appareil a choisi (« ici : léger »).
 * Il vit ici, et non dans wx3d.jsx, pour que Paramètres le lise sans charger
 * le ciel. */
const CLE_QUALITE_CIEL = 'loggia-ciel-qualite';
export const EVT_QUALITE_CIEL = 'loggia-ciel-qualite';
export function lireQualiteCiel() {
  try { const q = localStorage.getItem(CLE_QUALITE_CIEL); return q === 'leger' || q === 'fixe' ? q : 'auto'; } catch { return 'auto'; }
}
export function ecrireQualiteCiel(q) {
  try { if (q === 'leger' || q === 'fixe') localStorage.setItem(CLE_QUALITE_CIEL, q); else localStorage.removeItem(CLE_QUALITE_CIEL); } catch { /* stockage indisponible */ }
  try { window.dispatchEvent(new Event(EVT_QUALITE_CIEL)); } catch { /* pas de fenêtre */ }
}
/** Le niveau que la qualité « Auto » a retenu sur cet appareil (posé par le ciel lui-même). */
export function niveauCielIci() {
  try { const n = localStorage.getItem('loggia-ciel-actuel'); return n === 'plein' || n === 'leger' || n === 'fixe' ? n : null; } catch { return null; }
}
