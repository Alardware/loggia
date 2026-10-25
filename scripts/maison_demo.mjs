/* La maison de la demo, en 3D (chantier Plan 3D, P8).
 *
 *   node scripts/maison_demo.mjs        → public/demo/maison-demo.glb
 *
 * Une maison INVENTEE, jamais celle d'un utilisateur : six pieces aux ids de
 * zones de la demo (`src/demo.js`, PIECES), une lampe `light.<piece>` par
 * piece, les quatre volets de la demo. Elle suit les memes conventions qu'un
 * modele floor3d — c'est aussi l'exemple qu'on peut montrer a qui veut
 * preparer le sien :
 *
 *   un groupe nomme comme la zone (`cuisine`)  → la piece
 *   `sol_<piece>`                              → son sol (il prend la teinte)
 *   un groupe `light.x` avec un materiau emissif → la lampe
 *   `cover.x` : `_coffre`, `_coulisse_N`, `_lame_N`, `_lame_finale` → le volet
 *
 * Aucune dependance : le .glb s'ecrit a la main — des boites, un cube unite
 * mis a l'echelle par chaque noeud. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ICI, '..', 'public', 'demo', 'maison-demo.glb');

/* ── Le cube unite : 24 sommets (une normale par face), 36 indices ───────── */
const FACES = [
  [[1, 0, 0], [[.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [.5, -.5, .5]]],
  [[-1, 0, 0], [[-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-.5, -.5, -.5]]],
  [[0, 1, 0], [[-.5, .5, -.5], [-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5]]],
  [[0, -1, 0], [[-.5, -.5, .5], [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5]]],
  [[0, 0, 1], [[.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5], [-.5, -.5, .5]]],
  [[0, 0, -1], [[-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5], [.5, -.5, -.5]]],
];
const pos = []; const nor = []; const ind = [];
FACES.forEach(([n, coins], f) => {
  coins.forEach((c) => { pos.push(...c); nor.push(...n); });
  const b = f * 4;
  ind.push(b, b + 1, b + 2, b, b + 2, b + 3);   // sens direct vu de dehors : la face regarde sa normale
});

/* ── Les materiaux ───────────────────────────────────────────────────────── */
const materiaux = [];
const mat = (name, rgb, extra = {}) => { materiaux.push({ name, pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0, roughnessFactor: 0.85 }, ...extra }); return materiaux.length - 1; };
const M = {
  sol: mat('sol_clair', [0.78, 0.74, 0.68]),
  carrelage: mat('carrelage', [0.70, 0.72, 0.74]),
  mur: mat('mur', [0.88, 0.86, 0.82]),
  facade: mat('facade', [0.80, 0.76, 0.70]),
  dalle: mat('dalle', [0.62, 0.60, 0.57]),
  bois: mat('bois', [0.62, 0.45, 0.30]),
  tissu: mat('tissu', [0.45, 0.50, 0.58]),
  blanc: mat('blanc', [0.93, 0.93, 0.92]),
  noir: mat('noir', [0.12, 0.12, 0.14]),
  volet: mat('volet', [0.25, 0.27, 0.30]),
};
/* Une ampoule par lampe : chacune son materiau, sinon deux lampes
 * s'allumeraient ensemble. Emissif, eteint par defaut (le plan l'allume). */
const ampoule = (cle) => mat('ampoule_' + cle, [1, 0.96, 0.88], { emissiveFactor: [1, 0.78, 0.5] });

/* ── Les noeuds ──────────────────────────────────────────────────────────── */
const noeuds = [];
const maillages = new Map();   // materiau -> index de mesh
const meshDe = (m) => { if (!maillages.has(m)) maillages.set(m, maillages.size); return maillages.get(m); };
const noeud = (name, extra = {}) => { noeuds.push({ name, ...extra }); return noeuds.length - 1; };
/** Une boite de `[x0,y0,z0]` a `[x1,y1,z1]`. */
const boite = (name, m, a, b) => noeud(name, {
  mesh: meshDe(m),
  translation: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
  scale: [Math.abs(b[0] - a[0]) || 0.001, Math.abs(b[1] - a[1]) || 0.001, Math.abs(b[2] - a[2]) || 0.001],
});
const groupe = (name, enfants) => noeud(name, { children: enfants });

const H = 2.5; const E = 0.15;   // hauteur et epaisseur des murs

/* Les pieces : [cle, x0, x1, z0, z1, materiau du sol]. */
const PIECES = [
  ['salon', -5, 0, 1, 4, M.sol],
  ['chambre', 0, 5, 1, 4, M.sol],
  ['cuisine', -5, -1, -4, 1, M.carrelage],
  ['entree', -1, 1.5, -4, 1, M.sol],
  ['salle_de_bain', 1.5, 5, -4, -1.5, M.carrelage],
  ['bureau', 1.5, 5, -1.5, 1, M.sol],
];
const sols = PIECES.map(([cle, x0, x1, z0, z1, m]) => boite('sol_' + cle, m, [x0, 0, z0], [x1, 0.02, z1]));

/* Les murs : la facade, puis les cloisons, percees de leurs portes.
 *
 * Une porte ne tombe JAMAIS sur le depart d'une autre cloison : sans cela,
 * un bout de mur se dresse au milieu de l'ouverture (vu le 17/10). Les
 * portes se donnent par leur distance au debut du mur, 80 cm de large. */
const murs = [];
const P = 0.4;   // demi-largeur d'une porte
const mur = (name, m, x0, z0, x1, z1, portes = []) => {
  const long = Math.hypot(x1 - x0, z1 - z0);
  const point = (d) => [x0 + (x1 - x0) * (d / long), z0 + (z1 - z0) * (d / long)];
  const pleins = []; let debut = 0;
  [...portes].sort((a, b) => a - b).forEach((d) => { pleins.push([debut, d - P]); debut = d + P; });
  pleins.push([debut, long]);
  const epais = (a, b) => [Math.abs(b[0] - a[0]) < 1e-6 ? E / 2 : 0, Math.abs(b[1] - a[1]) < 1e-6 ? E / 2 : 0];
  const poser = (nom, a, b, y0, y1) => {
    const [dx, dz] = epais(a, b);
    murs.push(boite(nom, m, [Math.min(a[0], b[0]) - dx, y0, Math.min(a[1], b[1]) - dz], [Math.max(a[0], b[0]) + dx, y1, Math.max(a[1], b[1]) + dz]));
  };
  pleins.forEach(([d0, d1], i) => { if (d1 - d0 > 0.01) poser(name + '_' + i, point(d0), point(d1), 0, H); });
  portes.forEach((d, i) => poser(name + '_linteau_' + i, point(d - P), point(d + P), 2.1, H));
};
mur('facade_nord', M.facade, -5, 4, 5, 4);
mur('facade_sud', M.facade, -5, -4, 5, -4, [5.25]);            // la porte d'entree, au milieu de l'entree
mur('facade_ouest', M.facade, -5, -4, -5, 4);
mur('facade_est', M.facade, 5, -4, 5, 4);
mur('cloison_jour', M.mur, -5, 1, 0, 1, [2.5, 4.5]);            // salon ↔ cuisine, salon ↔ entree
mur('cloison_nuit', M.mur, 0, 1, 5, 1, [0.75, 3.25]);           // entree ↔ chambre, chambre ↔ bureau
mur('cloison_salon_chambre', M.mur, 0, 1, 0, 4, [1.5]);
mur('cloison_cuisine_entree', M.mur, -1, -4, -1, 1, [2.5]);
mur('cloison_entree_nuit', M.mur, 1.5, -4, 1.5, 1, [1.2, 3.6]); // entree ↔ salle de bain, entree ↔ bureau
mur('cloison_bureau_bain', M.mur, 1.5, -1.5, 5, -1.5);

/* Les meubles, dans le groupe de leur piece. */
const meubles = {
  salon: [boite('canape', M.tissu, [-4.6, 0, 2.9], [-2.4, 0.8, 3.7]), boite('table_basse', M.bois, [-4, 0, 1.9], [-3, 0.4, 2.5]), boite('meuble_tv', M.noir, [-4.4, 0, 1.15], [-2.6, 0.5, 1.5])],
  chambre: [boite('lit', M.blanc, [2, 0, 2.2], [3.6, 0.55, 3.9]), boite('chevet', M.bois, [3.7, 0, 3.4], [4.2, 0.5, 3.9])],
  cuisine: [boite('plan_travail', M.bois, [-4.85, 0, -3.85], [-1.2, 0.9, -3.25]), boite('ilot', M.blanc, [-3.6, 0, -1.6], [-2.2, 0.9, -0.8])],
  entree: [boite('banc_entree', M.bois, [-0.8, 0, -3.8], [0.4, 0.45, -3.4])],
  salle_de_bain: [boite('baignoire', M.blanc, [3.2, 0, -3.85], [4.85, 0.55, -3.1]), boite('vasque', M.blanc, [1.7, 0, -3.85], [2.5, 0.85, -3.4])],
  bureau: [boite('bureau_plateau', M.bois, [3.6, 0.72, -1.3], [4.85, 0.76, -0.4]), boite('bureau_pied', M.noir, [3.65, 0, -1.25], [4.8, 0.72, -1.2])],
};

/* Les lampes : une suspension au centre de chaque piece. */
const lampes = PIECES.map(([cle, x0, x1, z0, z1]) => {
  const x = (x0 + x1) / 2; const z = (z0 + z1) / 2;
  return groupe('light.' + cle, [
    boite(cle + '_cordon', M.noir, [x - 0.005, 1.95, z - 0.005], [x + 0.005, H, z + 0.005]),
    boite(cle + '_abat_jour', ampoule(cle), [x - 0.22, 1.75, z - 0.22], [x + 0.22, 1.95, z + 0.22]),
  ]);
});

/* Les volets : coffre, coulisses, 20 lames empilees dans le coffre (le
 * modele est ENREGISTRE OUVERT, comme ceux de floor3d), une lame finale. */
const volet = (cle, axe, fixe, centre) => {
  const L = 1.2; const n = 20;
  const sur = (a0, a1, y0, y1, ep) => (axe === 'x'
    ? [[centre + a0, y0, fixe - ep], [centre + a1, y1, fixe + ep]]
    : [[fixe - ep, y0, centre + a0], [fixe + ep, y1, centre + a1]]);
  const b = (name, m, a0, a1, y0, y1, ep) => { const [p, q] = sur(a0, a1, y0, y1, ep); return boite(name, m, p, q); };
  const enfants = [
    b(`volet_${cle}_coffre`, M.volet, -L / 2 - 0.05, L / 2 + 0.05, 2.1, 2.3, 0.12),
    b(`volet_${cle}_coulisse_1`, M.volet, -L / 2 - 0.05, -L / 2, 0.9, 2.1, 0.03),
    b(`volet_${cle}_coulisse_2`, M.volet, L / 2, L / 2 + 0.05, 0.9, 2.1, 0.03),
  ];
  for (let i = 1; i <= n; i++) enfants.push(b(`volet_${cle}_lame_${i}`, M.volet, -L / 2, L / 2, 2.08, 2.12, 0.01));
  enfants.push(b(`volet_${cle}_lame_finale`, M.noir, -L / 2, L / 2, 2.08, 2.12, 0.015));
  return groupe('cover.volet_' + cle, enfants);
};
const volets = [
  volet('salon', 'x', 4 + E / 2 + 0.03, -2.5),
  volet('chambre', 'x', 4 + E / 2 + 0.03, 2.5),
  volet('cuisine', 'z', -5 - E / 2 - 0.03, -1.5),
  volet('bureau', 'z', 5 + E / 2 + 0.03, -0.25),
];

const racine = groupe('maison_demo', [
  groupe('structure', [boite('dalle', M.dalle, [-5.6, -0.1, -4.6], [5.6, 0, 4.6]), groupe('sols', sols), groupe('murs', murs)]),
  ...PIECES.map(([cle]) => groupe(cle, meubles[cle] || [])),
  groupe('luminaires', lampes),
  groupe('volets_roulants', volets),
]);

/* ── L'ecriture du .glb ──────────────────────────────────────────────────── */
const f32 = (a) => Buffer.from(new Float32Array(a).buffer);
const u16 = (a) => Buffer.from(new Uint16Array(a).buffer);
const morceaux = [f32(pos), f32(nor), u16(ind)];
const vues = []; let decalage = 0;
morceaux.forEach((m, i) => { vues.push({ buffer: 0, byteOffset: decalage, byteLength: m.length, target: i < 2 ? 34962 : 34963 }); decalage += m.length; });
const binaire = Buffer.concat(morceaux);
const accessoires = [
  { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
  { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
  { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' },
];
const meshes = [...maillages.entries()].sort((a, b) => a[1] - b[1])
  .map(([m]) => ({ name: materiaux[m].name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: m }] }));
const json = {
  asset: { version: '2.0', generator: 'Loggia — scripts/maison_demo.mjs' },
  scene: 0, scenes: [{ name: 'Maison de démo', nodes: [racine] }],
  nodes: noeuds, meshes, materials: materiaux,
  accessors: accessoires, bufferViews: vues, buffers: [{ byteLength: binaire.length }],
};
const aligne = (buf, pad) => Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4, pad)]);
const texte = aligne(Buffer.from(JSON.stringify(json)), 0x20);
const bin = aligne(binaire, 0);
const total = 12 + 8 + texte.length + 8 + bin.length;
const tete = Buffer.alloc(12); tete.write('glTF', 0); tete.writeUInt32LE(2, 4); tete.writeUInt32LE(total, 8);
const ch = (buf, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(buf.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, buf]); };
mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(SORTIE, Buffer.concat([tete, ch(texte, 0x4E4F534A), ch(bin, 0x004E4942)]));
console.log(`maison-demo.glb : ${noeuds.length} noeuds, ${total} octets`);
