/**
 * Les pieces du plan du robot, lues dans les pixels de sa carte.
 *
 * Sorti de vacplan.jsx tel quel (lot 16, 05/10) : sans React ni canvas, le
 * calcul se verifie sous `node --test` sur des images fabriquees
 * (tests/lot16_vacplan_pixels.test.mjs). Rien n'y a change : la cle d'un seau
 * est celle que garde `loggia_vacplan`, un caractere de plus et les pieces
 * deja nommees reperdent leur nom.
 */
import { versHex } from './contraste.js';

// Quantification : le rendu de la carte est legerement bruite (anti-aliasing,
// compression), deux pixels d'une meme piece ne sont jamais identiques au bit
// pres. On regroupe par paliers de 24 niveaux.
export const PALIER = 24;
export const quant = (v) => Math.min(255, Math.round(v / PALIER) * PALIER);
// La cle d'un seau, sans diese : c'est elle que garde l'association couleur ->
// piece (`loggia_vacplan`). Le calcul est versHex (lot 15 de l'audit du 03/10) ;
// `quant` rend deja des entiers de 0 a 255, la cle ne change pas d'un caractere.
export const hex = (r, g, b) => versHex([r, g, b]).slice(1);

// Les deux seuils de `detecterPieces`, exportes pour que les tests les figent
// a leur valeur (relecture du lot 16, 05/10) : epingles par leurs seuls
// effets, ils glissaient sans bruit, la fusion de 0,0187 a 0,0273, la part
// minimale de 0,0101 a 0,0139. Les changer est une decision, prise sur une
// capture d'une vraie carte du robot.
// Fusion de deux teintes : 0,020, mesure sur une carte hachuree — au-dela,
// deux pastels distincts fusionnent ; en deca, une meme piece se scinde.
export const SEUIL_FUSION = 0.020;
// Part minimale d'une piece : 1,2 % des points lus, strictement depasses.
export const PART_MIN = 0.012;

/**
 * Distance de TEINTE, clarte mise de cote.
 *
 * Les hachures et le trace du robot eclaircissent une piece sans en changer la
 * couleur : en RGB brut leur ecart (~45) depasse celui de deux pastels voisins
 * (~40), impossible a departager. Rapporter chaque canal a la somme des trois
 * annule la clarte et ne garde que la teinte.
 */
export function ecart(a, b) {
  const sa = (a[0] + a[1] + a[2]) || 1, sb = (b[0] + b[1] + b[2]) || 1;
  const dr = a[0] / sa - b[0] / sb, dg = a[1] / sa - b[1] / sb;
  return Math.sqrt(dr * dr + dg * dg);
}

/**
 * Regions colorees d'une image.
 *
 * Ne retient que les teintes franches et suffisamment etendues : le fond, les
 * murs, le trajet du robot (blanc) et les hachures sont soit trop sombres, soit
 * trop desatures, soit trop rares pour passer les seuils.
 *
 * @param {number} attendu  Nombre de pieces que le robot declare. On ne garde
 *   que les regions les plus etendues jusqu'a ce compte : au-dela, ce sont des
 *   variantes de teinte, pas des pieces.
 */
export function detecterPieces(data, w, h, attendu = 0) {
  const seaux = new Map();
  // Un pixel sur deux dans chaque direction : quatre fois moins de travail,
  // pour un resultat identique a cette echelle.
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 200) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      // Trop sombre (murs, fond) ou trop gris (trajet, hachures) : ce n'est pas
      // une piece.
      if (max < 90 || max - min < 18) continue;
      const k = hex(quant(r), quant(g), quant(b));
      let s = seaux.get(k);
      if (!s) { s = { n: 0, sx: 0, sy: 0, pts: [] }; seaux.set(k, s); }
      s.n++;
      s.sx += x; s.sy += y;
      s.pts.push(x, y);
    }
  }
  const total = (w * h) / 4;
  // Regroupement des teintes voisines : une piece hachuree ou parcourue par le
  // robot produit plusieurs paliers qui sont la MEME piece.
  const groupes = [];
  [...seaux.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .forEach(([couleur, s]) => {
      const rgb = [parseInt(couleur.slice(0, 2), 16), parseInt(couleur.slice(2, 4), 16), parseInt(couleur.slice(4, 6), 16)];
      const proche = groupes.find(g => ecart(g.rgb, rgb) < SEUIL_FUSION);
      if (proche) {
        proche.n += s.n; proche.sx += s.sx; proche.sy += s.sy;
        for (let i = 0; i < s.pts.length; i++) proche.pts.push(s.pts[i]);
      } else {
        groupes.push({ couleur, rgb, n: s.n, sx: s.sx, sy: s.sy, pts: s.pts.slice() });
      }
    });
  const retenus = groupes.filter(g => g.n / total > PART_MIN);
  // Le robot fait foi sur le NOMBRE de pieces.
  const gardes = attendu > 0 ? retenus.slice(0, attendu) : retenus;
  return gardes
    .map(g => [g.couleur, g])
    .map(([couleur, s]) => {
      // Centre de masse, puis le point REEL de la piece qui s'en approche le
      // plus : sur une forme en L, le centre de masse tombe dans le vide.
      const cx = s.sx / s.n, cy = s.sy / s.n;
      let bx = s.pts[0], by = s.pts[1], best = Infinity;
      for (let i = 0; i < s.pts.length; i += 2) {
        const dx = s.pts[i] - cx, dy = s.pts[i + 1] - cy;
        const d = dx * dx + dy * dy;
        if (d < best) { best = d; bx = s.pts[i]; by = s.pts[i + 1]; }
      }
      // En fractions de l'image : le rendu peut etre a n'importe quelle taille.
      return { couleur, part: s.n / total, x: bx / w, y: by / h };
    })
    .sort((a, b) => b.part - a.part);
}
