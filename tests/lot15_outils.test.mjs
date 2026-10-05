/* Un utilitaire, un endroit (lot 15 de l'audit du 03/10).
 *
 * Cinq petits outils vivaient en plusieurs exemplaires : `domaineDe` (sept),
 * « minuscules sans accents » (sept, sous cinq noms), RGB → hexadécimal (neuf,
 * dont cinq sans bornage), `cleJour` (redéfinie deux fois dans App.jsx, qui
 * importe pourtant agenda.js) et l'icône `Fi` (recopiée dans Onboarding.jsx).
 * Une copie qui dérive ne se voit pas : on corrige l'une, les autres gardent
 * le défaut.
 *
 * Deux étages. (1) Le module commun rend EXACTEMENT ce que rendaient les
 * copies, sur ce qu'elles recevaient : les anciennes formules sont écrites
 * ici, pas dans src/. (2) Aucune copie ne revient dans src/, ni sous son nom,
 * ni sous un autre.
 *
 * outils.js est importé DANS chaque test qui le lit : sur le code d'avant,
 * chaque test échoue pour sa propre raison, pas tous pour un module absent. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const parcourir = (dir, out = []) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) parcourir(p, out);
    else if (/\.(js|jsx)$/.test(n)) out.push(p);
  }
  return out;
};
/* Les langues sont des catalogues, sans code à recopier. */
const SOURCES = parcourir(join(RACINE, 'src'))
  .map(p => [relative(RACINE, p).split(sep).join('/'), readFileSync(p, 'utf8')])
  .filter(([c]) => !c.startsWith('src/langues/'));
const lire = (c) => (SOURCES.find(([x]) => x === c) || [c, ''])[1];
const outils = () => import('../src/outils.js');

/* Les copies retirées, telles qu'elles étaient écrites. */
const ANCIEN = {
  domaineDe: (id) => (typeof id === 'string' ? id.slice(0, id.indexOf('.')) : ''),
  // choix.js
  accentsChoix: (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
  // discovery.js, robots.js, `aplatiIcone` d'App.jsx
  accentsOu: (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
  // `srNorm` d'App.jsx (la recherche globale)
  srNorm: (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
  // `sansAccent` d'autos.js : les minuscules AVANT les accents
  autos: (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  // le filtre des automatisations (views/parametres.jsx)
  parametres: (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  // App.jsx, quatre fois, sur `a.rgb_color` : sans bornage
  hexNu: (c) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''),
  // `rgbHex` (nuancier Hue) et `discoverLights` d'App.jsx : bornés
  hexBorne: (c) => '#' + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join(''),
  // vacplan.jsx : la clé d'un seau, sans dièse
  hexVacplan: (r, g, b) => [r, g, b].map(x => x.toString(16).padStart(2, '0')).join(''),
  // views/interrupteurs.jsx
  enHex: (rgb) => '#' + rgb.map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join(''),
  cleJour: (d) => d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(),
};

/* Ce que les appelants donnaient vraiment : des identifiants, des noms de
 * pièces et d'appareils, des recherches tapées, dans les sept langues. */
const TEXTES = [
  '', 'light.salon', 'Éclairage Séjour', 'Réfrigérateur', 'ÉTÉ', 'Chambre d’enfant', 'Lumières cuisine',
  'Küche Bügeleisen', 'Wäschetrockner', 'Słoneczko łóżko', 'Żółć Gęślą', 'Señal añadir', 'Città perché',
  'Ĳsselmeer', 'Façade', 'ÀÉÎÕÜ ç ñ', 'İstanbul', 'ΆΣ σοφός', 'Ǆ ǅ', 'ﬁ ligature', 'MacIntel', 'iPad',
  'camera.entree_snapshot', 'switch.camera_entree_motion_tracking', 'vacuum.robot · Filtre',
];

test('domaineDe : le module rend ce que rendaient les sept copies', async () => {
  const { domaineDe } = await outils();
  for (const x of ['light.salon', 'binary_sensor.porte_entree', 'sensor.a.b', 'a.', '.b', '', 'sanspoint', null, undefined, 42, {}, ['light.x']]) {
    assert.equal(domaineDe(x), ANCIEN.domaineDe(x), JSON.stringify(x));
  }
  assert.equal(domaineDe('light.salon'), 'light');
  assert.equal(domaineDe(null), '', 'ce qui n’est pas une chaîne n’a pas de domaine');
});

test('sansAccents : le même texte que chaque copie, sur tout ce qu’elle recevait', async () => {
  const { sansAccents } = await outils();
  for (const t of TEXTES) {
    for (const [nom, f] of Object.entries(ANCIEN).filter(([k]) => ['accentsChoix', 'accentsOu', 'srNorm', 'autos', 'parametres'].includes(k))) {
      assert.equal(sansAccents(t), f(t), `${nom} ≠ sansAccents sur ${JSON.stringify(t)}`);
    }
  }
  /* L'ordre « minuscules puis accents » (autos.js, parametres.jsx) contre
   * « accents puis minuscules » : le même résultat pour chaque caractère du
   * plan multilingue de base, seul ou entouré — sigma final compris. */
  for (let cp = 0; cp < 0x10000; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const c = String.fromCodePoint(cp);
    for (const t of [c, 'a' + c, c + 'a', 'Σ' + c, 'aΣ' + c]) {
      if (sansAccents(t) !== ANCIEN.autos(t)) assert.fail(`U+${cp.toString(16)} : ${sansAccents(t)} ≠ ${ANCIEN.autos(t)}`);
    }
  }
  assert.equal(sansAccents('Éclairage Séjour'), 'eclairage sejour');
  assert.equal(sansAccents(null), '');
  assert.equal(sansAccents(undefined), '');
  // Le seul écart avec `s || ''` : un 0 reste « 0 ». Aucun appelant n'en passait.
  assert.equal(sansAccents(0), '0');
});

test('versHex rend la couleur des neuf copies, et borne ce qu’elles laissaient filer', async () => {
  const { versHex } = await import('../src/contraste.js');
  for (let v = 0; v < 256; v++) {
    const c = [v, 255 - v, (v * 37) % 256];
    assert.equal(versHex(c), ANCIEN.hexNu(c), 'rgb_color de Home Assistant, ' + c);
    assert.equal(versHex(c), ANCIEN.hexBorne(c));
    assert.equal(versHex(c), ANCIEN.enHex(c));
    // vacplan : la clé gardée dans la configuration ne bouge pas d'un caractère.
    assert.equal(versHex(c).slice(1), ANCIEN.hexVacplan(...c));
  }
  /* Hors de 0–255, la copie nue écrivait une couleur que le navigateur rejette ;
   * la version bornée la ramène dans la plage. */
  assert.ok(!/^#[0-9a-f]{6}$/.test(ANCIEN.hexNu([300, -5, 12])), 'la copie nue sortait de la plage');
  assert.equal(versHex([300, -5, 12]), '#ff000c');
  assert.equal(versHex([12.6, 0, 0]), '#0d0000', 'un réel s’arrondit');
  // L'icône d'interrupteur garde la troncature et le 0 de son ancienne copie.
  const enHex = (rgb) => versHex(rgb.map(v => v | 0));
  for (const c of [[255, 170, 60], [12.9, 300, -4], [NaN, '128', 0], [undefined, null, 255.99]]) {
    assert.equal(enHex(c), ANCIEN.enHex(c), JSON.stringify(c));
  }
});

test('cleJour : agenda.js fait foi, et App.jsx l’importe au lieu de la réécrire', async () => {
  const { cleJour } = await import('../src/agenda.js');
  for (const d of [new Date(2026, 0, 1), new Date(2026, 9, 25, 23, 30), new Date(2027, 11, 31, 0, 0)]) {
    assert.equal(cleJour(d), ANCIEN.cleJour(d));
  }
  assert.match(lire('src/App.jsx'), /^import \{[^}]*\bcleJour\b[^}]*\} from '\.\/agenda\.js';$/m, 'App.jsx ne prend pas cleJour à agenda.js');
});

test('Fi : le premier lancement prend l’icône de ui.jsx', () => {
  const onb = lire('src/Onboarding.jsx');
  assert.match(onb, /^import \{[^}]*\bFi\b[^}]*\} from '\.\/ui\.jsx';$/m, 'Onboarding.jsx ne prend pas Fi à ui.jsx');
  // Le commentaire d'avant justifiait la copie par un cycle avec App.jsx, où Fi ne vit plus.
  assert.ok(!onb.includes('Meme rendu que dans App.jsx'), 'le commentaire périmé est resté');
});

/* ── Aucune copie ne revient ──────────────────────────────────────────────── */

/* Le nom réservé et son seul domicile. */
const DOMICILES = {
  domaineDe: 'src/outils.js',
  sansAccents: 'src/outils.js',
  versHex: 'src/contraste.js',
  cleJour: 'src/agenda.js',
  Fi: 'src/ui.jsx',
};
/* Les mêmes corps sous un autre nom — `domainOf`, `srNorm`, `aplatiIcone`,
 * `sansAccent`, `norm`, `rgbHex`, `enHex`, `hex` les portaient. Les variantes
 * qui font AUTRE CHOSE (couper les blancs, fabriquer un identifiant) ne sont
 * pas des copies : `aplati` d'applis.js, de marques.js, `vacSlug`… passent. */
const ACCENTS = String.raw`\.normalize\(\s*['"]NFD['"]\s*\)\.replace\(\s*\/\[[^\]\n]+\]\/g\s*,\s*(?:''|"")\s*\)`;
const PARAM = String.raw`(?:String\(\s*)?\(?\s*\1\b[^;\n]*?\)?\s*`;
const CORPS = [
  ['domaineDe', 'src/outils.js', /\(\s*(\w+)\s*\)\s*=>\s*\(?\s*typeof\s+\1\s*===\s*['"]string['"]\s*\?\s*\1\.slice\(\s*0\s*,\s*\1\.indexOf\(\s*['"]\.['"]\s*\)\s*\)/g],
  ['sansAccents', 'src/outils.js', new RegExp(String.raw`\(\s*(\w+)\s*\)\s*=>\s*` + PARAM + String.raw`(?:\.toLowerCase\(\))?` + ACCENTS + String.raw`(?:\.toLowerCase\(\))?\s*;`, 'g')],
  ['sansAccents', 'src/outils.js', new RegExp(String.raw`function\s+\w+\s*\(\s*(\w+)\s*\)\s*\{\s*return\s+` + PARAM + String.raw`(?:\.toLowerCase\(\))?` + ACCENTS + String.raw`(?:\.toLowerCase\(\))?\s*;\s*\}`, 'g')],
  ['versHex', 'src/contraste.js', /toString\(16\)\.padStart\(\s*2/g],
  ['cleJour', 'src/agenda.js', /getFullYear\(\)\s*\+\s*'-'\s*\+\s*\w+\.getMonth\(\)\s*\+\s*'-'\s*\+\s*\w+\.getDate\(\)/g],
  ['Fi', 'src/ui.jsx', /className=\{'fi fi-rr-' \+ i\}/g],
];
const ligne = (texte, i) => texte.slice(0, i).split('\n').length;

test('aucune copie d’un utilitaire commun dans src/', () => {
  const fautes = [];
  for (const [nom, chez] of Object.entries(DOMICILES)) {
    const re = new RegExp(String.raw`(?:\b(?:const|let|var)\s+${nom}\s*=|\bfunction\s+${nom}\s*\()`, 'g');
    for (const [c, t] of SOURCES) {
      if (c === chez) continue;
      for (const m of t.matchAll(re)) fautes.push(`${c}:${ligne(t, m.index)} redéfinit ${nom} (il vit dans ${chez})`);
    }
  }
  for (const [nom, chez, re] of CORPS) {
    for (const [c, t] of SOURCES) {
      if (c === chez) continue;
      for (const m of t.matchAll(re)) fautes.push(`${c}:${ligne(t, m.index)} recopie ${nom} (${chez}) : ${m[0].slice(0, 60)}`);
    }
  }
  assert.deepEqual(fautes, [], 'importe l’outil commun au lieu de le recopier :\n  ' + fautes.join('\n  '));
});

test('le filet voit bien une copie, même renommée', () => {
  /* Sans ce témoin, une expression devenue fausse laisserait tout passer, et le
   * test du dessus resterait vert pour rien. */
  const echantillons = [
    "const domainOf = (id) => (typeof id === 'string' ? id.slice(0, id.indexOf('.')) : '');",
    "const srNorm = (s) => (s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();",
    "const sansAccent = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');",
    "function plat(x) {\n  return String(x == null ? '' : x).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();\n}",
    "const enHex = (rgb) => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');",
    "const k = (d) => d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();",
    "return <i aria-hidden=\"true\" className={'fi fi-rr-' + i} />;",
  ];
  for (const e of echantillons) {
    assert.ok(CORPS.some(([, , re]) => { re.lastIndex = 0; return re.test(e); }), 'le filet ne voit pas : ' + e);
  }
  // Une variante qui fait autre chose n'est pas une copie.
  for (const e of [
    "const aplati = (s) => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim().toLowerCase();",
    "const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, '_');",
  ]) {
    assert.ok(!CORPS.some(([, , re]) => { re.lastIndex = 0; return re.test(e); }), 'le filet prend pour une copie : ' + e);
  }
});
