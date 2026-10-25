/* ── La teinte d'une pochette (chantier Médias, M8 ; ADR 0207) ──────────────────
 *
 * En lecture, la carte d'un lecteur se teinte de la couleur dominante de sa
 * pochette (sa maquette : « la carte se teinte de ses couleurs pendant la
 * lecture »). L'algorithme est celui que la fiche avait (`extractNpAccent`, la
 * carte HOMEii Flow) : un canvas de 40 × 40, une moyenne pondérée par la
 * saturation et par une lumière recentrée, la saturation relevée à 0,48 au
 * moins. Il quitte la fiche pour ce module : la carte en a besoin, et elle est
 * au démarrage.
 *
 * Deux choses à ne pas refaire :
 *  - le CACHE se fait par TITRE et ARTISTE, pas par adresse (`cleTeinte`) :
 *    Home Assistant change l'adresse de la pochette à chaque état (un jeton
 *    dans l'URL), et un cache par adresse recalculait la teinte à chaque
 *    seconde de lecture ;
 *  - un canvas SOUILLÉ (une pochette servie d'ailleurs que Home Assistant,
 *    sans en-tête CORS) rend `null`, et la carte prend le rose de la maison
 *    (`TEINTE_REPLI`) — jamais une couleur inventée.
 *
 * PUR dans sa règle (`teinteDesPixels`, `cleTeinte`, `rgbTexte`) ; le
 * chargement de l'image touche le navigateur, et se remplace dans les tests.
 */

/** Le rose de la maison, en « r,g,b » de jeton : la teinte quand la pochette n'en donne pas (M8). */
export const TEINTE_REPLI = 'var(--o-rose-rgb)';

const TAILLE = 40;

function rgbVersHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
    h /= 6;
  }
  return [h, s, l];
}

function hslVersRgb([h, s, l]) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < .5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(v * 255));
}

/**
 * La teinte dominante de pixels RGBA (un `Uint8ClampedArray`, ou un tableau) :
 * `[r, g, b]`, ou `null` si rien n'est assez opaque. Un pixel sur quatre est lu.
 */
export function teinteDesPixels(data) {
  if (!data || !data.length) return null;
  let acc = [0, 0, 0], w = 0;
  for (let i = 0; i + 3 < data.length; i += 16) {
    const a = (data[i + 3] || 0) / 255;
    if (a < .08) continue;
    const [h, s, l] = rgbVersHsl([data[i], data[i + 1], data[i + 2]]);
    const bl = 1 - Math.abs(l - .52);
    const wt = a * (.2 + s * 1.9 + bl * .85);
    const tuned = hslVersRgb([h, Math.max(s, .48), Math.min(Math.max(l, .4), .58)]);
    acc = acc.map((e, j) => e + tuned[j] * wt);
    w += wt;
  }
  return w ? acc.map(e => Math.max(0, Math.min(255, Math.round(e / w)))) : null;
}

/** La clé du cache : le titre et l'artiste ; sans eux, l'adresse de la pochette. `null` sans rien. */
export function cleTeinte(l) {
  if (!l) return null;
  if (l.title || l.artist) return String(l.title || '') + '|' + String(l.artist || '');
  return l.art || null;
}

/** « r,g,b » pour `lavisCarte` et `rgba(…)` ; le rose de la maison sans teinte. */
export const rgbTexte = (t) => (Array.isArray(t) && t.length === 3 ? t.join(',') : TEINTE_REPLI);

/* Les pixels d'une image, dans le navigateur : `null` si elle ne charge pas, ou si
 * le canvas est souillé (CORS). Remplaçable dans les tests (`charger`). */
function chargerPixels(url) {
  return new Promise((resolve) => {
    try {
      if (typeof Image === 'undefined' || typeof document === 'undefined') { resolve(null); return; }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = c.height = TAILLE;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, TAILLE, TAILLE);
          resolve(ctx.getImageData(0, 0, TAILLE, TAILLE).data);
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    } catch { resolve(null); }
  });
}

const CACHE = new Map();

/**
 * La teinte d'une pochette, mise en cache par `cle` : une promesse de `[r, g, b]`,
 * ou de `null`. La même clé ne charge qu'une fois, quelle que soit l'adresse ;
 * un chargement en cours se partage.
 */
export function teintePochette(url, cle, { charger = chargerPixels } = {}) {
  const k = cle || url;
  if (!url || !k) return Promise.resolve(null);
  if (CACHE.has(k)) { const v = CACHE.get(k); return v instanceof Promise ? v : Promise.resolve(v); }
  const p = charger(url).then(teinteDesPixels, () => null).then((t) => { CACHE.set(k, t); return t; });
  CACHE.set(k, p);
  return p;
}

/**
 * La teinte déjà LUE pour `cle` — `[r, g, b]`, ou `null` si la pochette n'en
 * donnait pas —, sans attendre ; `undefined` tant qu'elle n'est pas lue, ou pas
 * demandée. La carte s'en sert pour ne pas passer par le rose quand un titre déjà
 * vu revient.
 */
export function teinteConnue(cle) {
  if (!cle || !CACHE.has(cle)) return undefined;
  const v = CACHE.get(cle);
  return v instanceof Promise ? undefined : v;
}

/** Pour les tests : le cache vidé. */
export function oublierTeintes() { CACHE.clear(); }
