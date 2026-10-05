// ─────────────────────────────────────────────────────────────────────────────
// Les pièces du plan du robot, lues dans les pixels (lot 16, 05/10).
//
// Point 10a du second audit : `detecterPieces` (vacplan.jsx) retrouve les
// pièces de la carte du robot par leur COULEUR, et rien ne l'exerçait — les
// tests ne lisaient vacplan.jsx que comme du texte. Le calcul est sorti tel
// quel dans src/vacplan_pixels.js, sans React ni canvas, et ce fichier FIGE
// son comportement d'aujourd'hui sur des images fabriquées.
//
// Il ne le corrige pas. Trois limites connues y sont épinglées comme telles
// (fin du fichier) : la clé d'une pièce hachurée bascule quand la variante
// claire devient majoritaire, une éclaircie vers le blanc scinde la pièce, et
// `attendu` peut évincer une vraie pièce au profit d'une variante. Le seuil 0,020 a été « mesuré sur une carte
// hachurée » réelle ; on n'y touche qu'avec une capture d'une vraie carte du
// robot fournie par l'utilisateur — et changer la clé effacerait les noms déjà
// donnés aux pièces (`loggia_vacplan`). Si l'un de ces tests casse, c'est que
// l'heuristique a changé : le dire, pas réaligner en silence.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const px = () => import('../src/vacplan_pixels.js');

/** Image RGBA de w × h ; `f(x, y)` rend [r, g, b] ou [r, g, b, a]. */
function image(w, h, f) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = f(x, y), i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c.length > 3 ? c[3] : 255;
    }
  }
  return d;
}
/** Le résultat, arrondi au dix-millième : ce que l'écran en fait. */
const vu = (r) => r.map(p => [p.couleur, +p.part.toFixed(4), +p.x.toFixed(3), +p.y.toFixed(3)]);
const cles = (r) => r.map(p => p.couleur);

// Deux pastels de carte de robot, un mur, et ce qui n'est pas une pièce.
const BLEU = [120, 170, 230], ORANGE = [240, 170, 120], VERT = [150, 220, 140];
const MUR = [40, 40, 40], TRAJET = [250, 250, 250], GRIS = [150, 150, 160], FOND = [20, 20, 30];
// Deux façons d'éclaircir une pièce : hachures « × 1,15 », ou mélange vers le blanc.
const fois115 = (c) => c.map(v => Math.min(255, Math.round(v * 1.15)));
const blanc15 = (c) => c.map(v => Math.round(v * 0.85 + 255 * 0.15));
/** Deux pièces séparées par un mur ; la bleue hachurée sur une part `h`. */
const deuxPieces = (h, eclaircir, lesDeux = false) => image(200, 100, (x, y) => {
  if (x === 100 || y === 0 || y === 99) return MUR;
  const base = x < 100 ? BLEU : ORANGE;
  return ((x < 100 || lesDeux) && ((x + y) % 10) / 10 < h) ? eclaircir(base) : base;
});

test('le calcul vit dans vacplan_pixels.js, sans React, et le plan l’importe au lieu de le garder', () => {
  const module = lire('src', 'vacplan_pixels.js');
  const plan = lire('src', 'vacplan.jsx');
  assert.ok(!/from\s+['"]react/.test(module), 'vacplan_pixels.js importe React : il ne se teste plus sous node');
  assert.match(module, /^import \{ versHex \} from '\.\/contraste\.js';$/m, 'la clé ne passe plus par versHex');
  assert.match(plan, /^import \{ detecterPieces \} from '\.\/vacplan_pixels\.js';$/m);
  for (const nom of ['PALIER', 'quant', 'hex', 'ecart', 'detecterPieces']) {
    assert.ok(!new RegExp(String.raw`(?:\b(?:const|let|var)\s+${nom}\s*=|\bfunction\s+${nom}\s*\()`).test(plan),
      `vacplan.jsx redéfinit ${nom} : deux copies divergeraient en silence`);
  }
  assert.ok(!plan.includes('versHex'), 'vacplan.jsx n’a plus de couleur à écrire lui-même');
});

test('quantification et clé : les paliers de 24 et l’hexadécimal sans dièse de loggia_vacplan', async () => {
  const { PALIER, quant, hex } = await px();
  assert.equal(PALIER, 24);
  assert.deepEqual([0, 11, 12, 35, 36, 239, 251, 252, 255].map(quant), [0, 0, 24, 24, 48, 240, 240, 255, 255]);
  assert.deepEqual(BLEU.map(quant), [120, 168, 240]);
  assert.equal(hex(...BLEU.map(quant)), '78a8f0');
  assert.equal(hex(0, 0, 0), '000000');
  assert.equal(hex(255, 255, 255), 'ffffff');
});

test('ecart : la teinte seule, la clarté mise de côté', async () => {
  const { ecart, quant } = await px();
  assert.equal(ecart([100, 50, 25], [200, 100, 50]), 0, 'la même teinte, deux fois plus claire');
  assert.equal(ecart([0, 0, 0], [0, 0, 0]), 0, 'le noir ne divise pas par zéro');
  assert.equal(ecart(BLEU, ORANGE), ecart(ORANGE, BLEU));
  assert.equal(+ecart(BLEU.map(quant), ORANGE.map(quant)).toFixed(4), 0.2273, 'deux pastels de carte, très loin du seuil');
});

test('deux aplats et un mur : deux pièces, chacune ancrée chez elle', async () => {
  const { detecterPieces } = await px();
  const d = image(200, 100, (x, y) => (x === 100 || y === 0 || y === 99) ? MUR : (x < 100 ? BLEU : ORANGE));
  const attendu = [['78a8f0', 0.49, 0.24, 0.5], ['f0a878', 0.4802, 0.75, 0.5]];
  assert.deepEqual(vu(detecterPieces(d, 200, 100)), attendu);
  assert.deepEqual(vu(detecterPieces(d, 200, 100, 2)), attendu, 'le robot déclare deux pièces : rien ne change');
});

test('fond sombre, trajet blanc, zone grise et pixels transparents ne sont pas des pièces', async () => {
  const { detecterPieces } = await px();
  const d = image(200, 100, (x, y) => {
    if (y < 10) return FOND;
    if (y === 50) return TRAJET;
    if (x >= 180) return GRIS;
    if (x >= 170) return [...VERT, 120];
    return x < 90 ? BLEU : ORANGE;
  });
  assert.deepEqual(vu(detecterPieces(d, 200, 100)), [['78a8f0', 0.396, 0.22, 0.54], ['f0a878', 0.352, 0.64, 0.54]]);
});

test('`attendu` borne le nombre : les plus étendues d’abord', async () => {
  const { detecterPieces } = await px();
  const d = image(200, 100, (x) => x < 70 ? BLEU : (x < 140 ? ORANGE : VERT));
  assert.deepEqual(cles(detecterPieces(d, 200, 100)), ['78a8f0', 'f0a878', '90d890']);
  assert.deepEqual(cles(detecterPieces(d, 200, 100, 2)), ['78a8f0', 'f0a878']);
  assert.deepEqual(cles(detecterPieces(d, 200, 100, 1)), ['78a8f0']);
  assert.deepEqual(cles(detecterPieces(d, 200, 100, 9)), ['78a8f0', 'f0a878', '90d890'], 'plus de pièces annoncées que trouvées');
});

test('pièce en L : l’ancre tombe DANS la pièce, pas dans le creux du L', async () => {
  const { detecterPieces } = await px();
  const dansL = (x, y) => x < 30 || y >= 70;
  const d = image(100, 100, (x, y) => dansL(x, y) ? BLEU : MUR);
  const [p] = detecterPieces(d, 100, 100, 1);
  assert.deepEqual(vu([p]), [['78a8f0', 0.51, 0.28, 0.64]]);
  assert.ok(dansL(p.x * 100, p.y * 100), 'le centre de masse seul tomberait dans le mur');
});

test('un bruit de ± 8 niveaux ne scinde ni ne déplace les pièces', async () => {
  const { detecterPieces } = await px();
  let graine = 7;
  const alea = () => { graine = (graine * 1103515245 + 12345) & 0x7fffffff; return graine / 0x7fffffff; };
  const d = image(200, 100, (x) => (x < 100 ? BLEU : ORANGE).map(v => Math.round(v + (alea() - 0.5) * 16)));
  assert.deepEqual(vu(detecterPieces(d, 200, 100)), [['f0a878', 0.5, 0.74, 0.48], ['78a8f0', 0.5, 0.24, 0.48]]);
});

test('une pièce étroite collée au bord compte, ancrée au bord', async () => {
  const { detecterPieces } = await px();
  const d = image(200, 100, (x) => x >= 196 ? VERT : (x < 100 ? BLEU : [0, 0, 0, 0]));
  assert.deepEqual(vu(detecterPieces(d, 200, 100)), [['78a8f0', 0.5, 0.24, 0.48], ['90d890', 0.02, 0.98, 0.48]]);
});

test('dimensions impaires : la dernière colonne et la dernière ligne sont lues, les parts dépassent un peu 1', async () => {
  const { detecterPieces } = await px();
  /* 101 × 51 lus un pixel sur deux : 51 × 26 = 1 326 points, mais `total`
   * vaut w × h / 4 = 1 287,75. Les parts additionnées font 1,03 : sans effet
   * sur le seuil de 1,2 % à cette échelle, épinglé tel quel (05/10). */
  const d = image(101, 51, (x) => x < 50 ? BLEU : ORANGE);
  assert.deepEqual(vu(detecterPieces(d, 101, 51)), [['f0a878', 0.5249, 0.733, 0.471], ['78a8f0', 0.5048, 0.238, 0.471]]);
});

test('sous 1,2 % de l’image, une tache n’est pas une pièce', async () => {
  const { detecterPieces } = await px();
  // 200 × 100 lus un pixel sur deux : 5 000 points ; 1,2 % = 60.
  const tache = (larg) => image(200, 100, (x, y) => (x < larg && y < 20) ? VERT : BLEU);
  assert.deepEqual(cles(detecterPieces(tache(10), 200, 100)), ['78a8f0'], '50 points : 1 %');
  assert.deepEqual(vu(detecterPieces(tache(14), 200, 100)), [['78a8f0', 0.986, 0.5, 0.5], ['90d890', 0.014, 0.03, 0.08]], '70 points : 1,4 %');
});

test('part minimale au plus près : 1,18 % et 1,2 % pile refusés, 1,22 % retenu (relecture du lot 16, 05/10)', async () => {
  const { detecterPieces } = await px();
  /* Les taches de 1 % et 1,4 % ci-dessus laissaient glisser le seuil de 0,0101
   * à 0,0139. 200 × 100 lus un pixel sur deux : 5 000 points, en colonnes de
   * 50 ; la tache en prend exactement n, colonne après colonne (les pixels non
   * lus restent bleus). Le seuil tient entre 1,18 % et 1,22 %, et la
   * comparaison reste stricte : 60 points, 1,2 % pile, ne font pas une pièce. */
  const tache = (n) => image(200, 100, (x, y) => (x % 2 === 0 && y % 2 === 0 && (x / 2) * 50 + y / 2 < n) ? VERT : BLEU);
  for (const [n, quoi] of [[55, '1,1 %'], [59, '1,18 %'], [60, '1,2 % pile']]) {
    assert.deepEqual(cles(detecterPieces(tache(n), 200, 100)), ['78a8f0'], n + ' points : ' + quoi);
  }
  assert.deepEqual(vu(detecterPieces(tache(61), 200, 100)), [['78a8f0', 0.9878, 0.5, 0.5], ['90d890', 0.0122, 0, 0.42]], '61 points : 1,22 %');
  assert.deepEqual(vu(detecterPieces(tache(65), 200, 100)), [['78a8f0', 0.987, 0.5, 0.5], ['90d890', 0.013, 0, 0.4]], '65 points : 1,3 %');
});

test('deux pièces de teintes proches : au-delà de 0,020 deux pièces, en deçà une seule', async () => {
  const { detecterPieces, ecart, quant } = await px();
  const voisins = (autre) => image(200, 100, (x, y) => (x === 100 || y === 0 || y === 99) ? MUR : (x < 100 ? BLEU : autre));
  // [120, 180, 230] : palier [120, 192, 240], écart 0,031 — distinctes.
  assert.equal(+ecart(BLEU.map(quant), [120, 180, 230].map(quant)).toFixed(4), 0.0312);
  assert.deepEqual(cles(detecterPieces(voisins([120, 180, 230]), 200, 100)), ['78a8f0', '78c0f0']);
  // [120, 170, 210] : palier [120, 168, 216], écart 0,0186 — LIMITE : deux pièces
  // réelles de ce bleu et de celui-là n'en font qu'une sur le plan.
  assert.equal(+ecart(BLEU.map(quant), [120, 170, 210].map(quant)).toFixed(4), 0.0186);
  assert.deepEqual(vu(detecterPieces(voisins([120, 170, 210]), 200, 100)), [['78a8f0', 0.9702, 0.49, 0.5]]);
});

test('les deux seuils sont exportés et figés à leur valeur (relecture du lot 16, 05/10)', async () => {
  /* Épinglés par leurs seuls effets, ils glissaient sans bruit : la fusion de
   * 0,0187 à 0,0273, la part minimale de 0,0101 à 0,0139. */
  const { SEUIL_FUSION, PART_MIN } = await px();
  assert.equal(SEUIL_FUSION, 0.020);
  assert.equal(PART_MIN, 0.012);
});

test('fusion au plus près de 0,020 : une pièce juste en deçà, deux juste au-delà (relecture du lot 16, 05/10)', async () => {
  const { detecterPieces, ecart, SEUIL_FUSION } = await px();
  const voisins = (a, b) => image(200, 100, (x, y) => (x === 100 || y === 0 || y === 99) ? MUR : (x < 100 ? a : b));
  /* Teintes déjà sur leurs paliers (255 compris) : la clé est la couleur même.
   * Les deux premières paires, de la relecture, tiennent le seuil entre 0,0196
   * et 0,0205 ; les deux dernières, les plus serrées d'une recherche exhaustive
   * sur les paliers, entre 0,019996 et 0,0200025 — loin au-dessus de l'erreur
   * d'arrondi : une réécriture équivalente d'ecart passe, un seuil déplacé non.
   * Une douzaine de paires tombent sur 0,020 au dernier bit près : les épingler
   * figerait l'arrondi flottant, pas l'heuristique — `<` contre `<=` reste libre. */
  for (const [a, b, e, attendu] of [
    [[24, 96, 216], [24, 96, 240], '0.0196', [['1860d8', 0.9702, 0.49, 0.5]]],
    [[24, 96, 144], [24, 120, 192], '0.0205', [['186090', 0.49, 0.24, 0.5], ['1878c0', 0.4802, 0.75, 0.5]]],
    [[120, 168, 72], [144, 192, 72], '0.019996', [['78a848', 0.9702, 0.49, 0.5]]],
    [[168, 192, 168], [240, 255, 216], '0.0200025', [['a8c0a8', 0.49, 0.24, 0.5], ['f0ffd8', 0.4802, 0.75, 0.5]]],
  ]) {
    assert.equal(ecart(a, b).toFixed(e.length - 2), e);
    assert.equal(ecart(a, b) < SEUIL_FUSION, attendu.length === 1, e);
    assert.deepEqual(vu(detecterPieces(voisins(a, b), 200, 100)), attendu, 'écart ' + e);
  }
});

test('hachures « × 1,15 » : la pièce reste une, sa clé tient tant que la part hachurée reste sous la moitié', async () => {
  const { detecterPieces } = await px();
  for (const h of [0.1, 0.3, 0.4]) {
    assert.deepEqual(vu(detecterPieces(deuxPieces(h, fois115), 200, 100)),
      [['78a8f0', 0.49, 0.24, 0.5], ['f0a878', 0.4802, 0.75, 0.5]], 'hachures ' + h);
  }
});

/* ── Limites connues, épinglées telles quelles (05/10) ────────────────────── */

test('LIMITE : la clé d’une pièce est celle de son palier le plus peuplé — hachurée à moitié, elle bascule', async () => {
  const { detecterPieces } = await px();
  /* La fusion marche (écart 0,0177 < 0,020), mais le groupe prend la couleur
   * du seau qui compte le plus de points : à partir de 50 % hachuré, 78a8f0
   * devient 90c0ff. Le nom donné à la pièce, rangé sous 78a8f0, ne la retrouve
   * plus et le « ? » revient. */
  for (const h of [0.5, 0.6]) {
    assert.deepEqual(vu(detecterPieces(deuxPieces(h, fois115), 200, 100, 2)),
      [['90c0ff', 0.49, 0.25, 0.5], ['f0a878', 0.4802, 0.75, 0.5]], 'hachures ' + h);
  }
});

test('LIMITE : éclaircie de 15 % vers le blanc, une pièce hachurée se scinde en deux teintes', async () => {
  const { detecterPieces } = await px();
  // Écart 0,0273 entre 78a8f0 et 90c0f0 : au-dessus du seuil, pas de fusion.
  assert.deepEqual(vu(detecterPieces(deuxPieces(0.3, blanc15, true), 200, 100)), [
    ['78a8f0', 0.294, 0.24, 0.5], ['f0a878', 0.288, 0.74, 0.5], ['90c0f0', 0.196, 0.25, 0.5], ['f0c090', 0.1922, 0.75, 0.5],
  ]);
  // `attendu` cache la scission… tant que la teinte de base reste majoritaire.
  assert.deepEqual(cles(detecterPieces(deuxPieces(0.3, blanc15, true), 200, 100, 2)), ['78a8f0', 'f0a878']);
  assert.deepEqual(cles(detecterPieces(deuxPieces(0.6, blanc15, true), 200, 100, 2)), ['90c0f0', 'f0c090']);
});

test('LIMITE : `attendu` garde la variante d’un grand séjour et évince le petit WC', async () => {
  const { detecterPieces } = await px();
  // Séjour bleu hachuré sur 40 %, chambre orange, WC vert ; le robot déclare trois pièces.
  const d = image(200, 100, (x, y) => {
    if (x === 140 || x === 180 || y === 0 || y === 99) return MUR;
    const base = x < 140 ? BLEU : (x < 180 ? ORANGE : VERT);
    return (x < 140 && ((x + y) % 10) / 10 < 0.4) ? blanc15(base) : base;
  });
  assert.deepEqual(cles(detecterPieces(d, 200, 100)), ['78a8f0', '90c0f0', 'f0a878', '90d890']);
  assert.deepEqual(vu(detecterPieces(d, 200, 100, 3)),
    [['78a8f0', 0.4116, 0.34, 0.5], ['90c0f0', 0.2744, 0.35, 0.5], ['f0a878', 0.1862, 0.8, 0.5]],
    'le WC 90d890 n’est plus sur le plan');
});
