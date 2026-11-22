// ─────────────────────────────────────────────────────────────────────────────
// Audit des thèmes du 13/11 — M2 et E8 : les rayons suivent le thème.
//
// Constat : le rayon d'un thème et le réglage « Arrondi » ne changeaient que le
// cadre des cartes ; boutons, champs, puces et tuiles gardaient leurs 8 à 14 px
// écrits en dur. Sous GitHub (6 px) les boutons restaient à 12 px ; avec des
// coins « ronds » (26 px) l'intérieur paraissait anguleux.
//
// Le choix : les rayons restent ÉCRITS EN CHIFFRES dans les composants — la
// feuille de Prisme et l'interrupteur d'iOS les repèrent par ces chiffres — et
// un bloc d'index.css pose par-dessus un jeton calculé depuis `--o-radius`.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const css = lire('src', 'index.css'), prisme = lire('src', 'prisme.css');
const DEBUT = '/* ── LES RAYONS SUIVENT LE THÈME (audit des thèmes du 13/11, M2 et E8)';
const FIN = '/* ── fin des rayons qui suivent le thème ── */';
const debut = css.indexOf(DEBUT), fin = css.indexOf(FIN);
const bloc = css.slice(debut, fin);
const lignes = bloc.split('\n');

/* La règle, en clair : pour un rayon écrit N et le rayon R du thème, avec REF le rayon où rien ne change. */
const regle = (N, R, REF = 18) => Math.min(Math.max(N, R * N / REF), R);
const coef = (n, ref) => String(Math.round(n / ref * 10000) / 10000).replace(/^0\./, '.');
const jeton = (n, ref) => `--o-r-${n}: min(max(${n}px, calc(var(--o-radius, ${ref}px) * ${coef(n, ref)})), var(--o-radius, ${ref}px));`;

test('le bloc existe, une seule fois, avant celui des deux barres et avant le lot E17 qui ferme la feuille', () => {
  assert.ok(debut > 0 && fin > debut, 'bloc introuvable dans index.css');
  assert.equal(css.split(DEBUT).length - 1, 1); assert.equal(css.split(FIN).length - 1, 1);
  const e17 = css.indexOf("/* ── Lot E17 de l'audit du 12/11 (ADR 0371)");
  assert.ok(e17 > fin, 'le lot E17 doit rester le dernier de la feuille');
  // Le test des deux barres lit tout ce qui va de son titre au lot E17 : ce bloc se range donc AVANT lui.
  const barres = css.indexOf('/* ── LES DEUX BARRES, DANS TOUS LES THÈMES (15/11)');
  assert.ok(fin < barres && barres < e17, 'avant le bloc des deux barres');
});

test('la règle : rien ne change à 18 px, jamais plus rond que le cadre, grandit avec lui', () => {
  for (let n = 6; n <= 18; n++) assert.equal(regle(n, 18), n, n + ' px en « Doux »');
  assert.equal(regle(10, 7), 7); assert.equal(regle(14, 7), 7); assert.equal(regle(6, 7), 6, '« Net » : 7 px au plus, 6 reste 6');
  assert.equal(regle(12, 6), 6); assert.equal(regle(10, 3), 3, 'GitHub à 6 px, One Dark Pro à 3 px');
  assert.ok(Math.abs(regle(10, 26) - 14.44) < .01 && Math.abs(regle(14, 26) - 20.22) < .01, '« Rond » : même proportion que le cadre');
  assert.equal(regle(18, 26), 26, 'un rayon de carte écrit en dur devient celui du cadre');
  for (let n = 6; n <= 18; n++) for (const r of [3, 6, 7, 12, 16, 18, 20, 22, 26]) assert.ok(regle(n, r) <= r, 'jamais plus rond que le cadre');
});

test('un jeton par rayon de 6 à 18 px, écrit selon la règle, et les trois noms pour du code neuf', () => {
  const racine = bloc.slice(bloc.indexOf(':root {'), bloc.indexOf('}', bloc.indexOf(':root {')));
  for (let n = 6; n <= 18; n++) assert.ok(racine.includes('  ' + jeton(n, 18)), '--o-r-' + n + ' ne suit plus la règle');
  assert.ok(racine.includes('--o-r-puce: var(--o-r-8); --o-r-commande: var(--o-r-10); --o-r-tuile: var(--o-r-14);'));
  assert.ok(!/--o-r-(5|19)\b/.test(bloc), 'hors champ : sous 6 px et au-dessus de 18 px');
});

test('Prisme part de son propre rayon (22 px) : en « Doux », rien n’y change', () => {
  const p = bloc.slice(bloc.indexOf('html.loggia-prisme {'), bloc.indexOf('}', bloc.indexOf('html.loggia-prisme {')));
  for (let n = 6; n <= 18; n++) { assert.ok(p.includes('  ' + jeton(n, 22)), '--o-r-' + n + ' de Prisme'); assert.equal(regle(n, 22, 22), n); }
  assert.ok(/radius: '22px'/.test(lire('src', 'theme.js').split('\n  prisme: {')[1].slice(0, 900)), 'le rayon de Prisme a changé : recaler la référence du bloc');
});

test('chaque rayon écrit en ligne reçoit son jeton — précision nulle, et une pilule garde son rayon écrit', () => {
  // Hors champ pour un rayon N : les dessins marqués, l'aperçu des Paramètres, le remplissage d'une jauge, et les pilules —
  // une hauteur ÉCRITE de 7 à 2N + 1 px. Sous 7 px de haut, le plus petit rayon de thème (3 px) fait encore une pilule.
  const pilule = (n) => { const l = []; for (let h = 7; h <= 2 * n + 1; h++) l.push(`[style*="height: ${h}px;"]`); return l.join(', '); };
  for (let n = 6; n <= 18; n++) {
    const l = `:where([style*="border-radius: ${n}px;"]):not(:where([data-rayons-fixes], [data-rayons-fixes] *, .o-par-preview, .o-par-preview *, [data-fill], ${pilule(n)})) { border-radius: var(--o-r-${n}) !important; }`;
    assert.ok(lignes.includes(l), 'règle du rayon ' + n + ' px');
  }
  // La pilule, en clair : rayon écrit N et hauteur écrite H — hors champ dès que H ≤ 2N + 1.
  const protegee = (N, H) => H >= 7 && H <= 2 * N + 1;
  assert.ok(protegee(14, 26) && protegee(14, 25), 'interrupteurs 46 × 26 et 44 × 25'); assert.ok(protegee(12, 24), 'jauge de 24 px'); assert.ok(protegee(9, 18), 'compteur de 18 px');
  assert.ok(!protegee(10, 30) && !protegee(9, 26) && !protegee(14, 38), 'un bouton de 30 px, une pastille de 26 ou de 38 px ne sont pas des pilules');
  // Les pilules que le code écrit vraiment : leur paire rayon / hauteur est bien couverte.
  for (const [f, N, H] of [['src/cartes/briques.jsx', 14, 26], ['src/accueil/briques.jsx', 14, 25], ['src/views/parametres.jsx', 9, 18], ['src/chrome/barrelaterale.jsx', 8, 15]]) {
    assert.ok(new RegExp('height: ' + H + ',[^}\\n]{0,60}borderRadius: ' + N + '\\b').test(lire(...f.split('/'))), f + ' : la pilule ' + H + ' px / ' + N + ' px a changé');
    assert.ok(protegee(N, H));
  }
  assert.ok(lire('src', 'cartes', 'briques.jsx').includes('<span data-fill style={{') && lire('src', 'cartes', 'briques.jsx').includes('height: piste, borderRadius: piste / 2'), 'la jauge : piste de 24 px à 12 px, remplissage marqué `data-fill`');
  assert.ok(!/@property|--o-demi/.test(bloc), 'pas de propriété intermédiaire : treize règles, rien d’autre à tester par élément');
});

test('les composants écrivent toujours leurs rayons en chiffres : Prisme et l’interrupteur d’iOS les repèrent ainsi', () => {
  assert.ok(prisme.includes('[style*="border-radius: 10px"]') && prisme.includes('[style*="border-radius: 12px"]'), 'la feuille de Prisme ne vise plus les rayons écrits');
  const src = join(RACINE, 'src'); let chiffres = 0, jetons = 0;
  (function marche(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) marche(p); else if (/\.jsx?$/.test(e.name)) { const t = readFileSync(p, 'utf8'); chiffres += (t.match(/borderRadius: (?:[6-9]|1[0-8])\b/g) || []).length; jetons += (t.match(/var\(--o-r-/g) || []).length; } } })(src);
  assert.ok(chiffres > 400, 'les rayons en chiffres ont disparu des composants (' + chiffres + ') : Prisme perdrait ses pilules');
  assert.equal(jetons, 0, 'un composant lit un jeton `--o-r-…` : sous Prisme il ne deviendrait plus pilule — à décider avec la feuille de Prisme');
});

test('les rayons fixes portés par une classe : même sélecteur que la règle d’origine, posé après elle', () => {
  const PAIRES = [
    ['.o-confort-mesure { display: flex; align-items: center; gap: 9px; padding: 4px 12px 4px 5px; border-radius: 10px;', '.o-confort-mesure { border-radius: var(--o-r-10); }'],
    ['.o-confort-ico { width: 27px; height: 27px; border-radius: 8px;', '.o-confort-ico { border-radius: var(--o-r-8); }'],
    ['.o-confort-peu .o-confort-ico { width: 30px; height: 30px; border-radius: 10px; }', '.o-confort-peu .o-confort-ico { border-radius: var(--o-r-10); }'],
    ['.o-confort-ico { width: 26px; height: 26px; border-radius: 9px; }', '.o-confort-ico { border-radius: var(--o-r-9); }'],
    ['.sys-mesure .sys-mesure-ico { width: 26px !important; height: 26px !important; border-radius: 9px !important; }', '.sys-mesure .sys-mesure-ico { border-radius: var(--o-r-9) !important; }'],
    ['border-radius: 14px !important; }', '.o-scene-room { border-radius: var(--o-r-14) !important; }'],
    ['.rb-onglets { display: flex; gap: 4px; padding: 5px; border-radius: 16px;', '.rb-onglets { border-radius: var(--o-r-16); }'],
    ['.rb-pastille { position: absolute; z-index: 0; border-radius: 12px;', '.rb-pastille { border-radius: var(--o-r-12); }'],
  ];
  for (const [origine, double] of PAIRES) {
    const a = css.indexOf(origine), b = bloc.indexOf(double);
    assert.ok(a >= 0 && a < debut, 'la règle d’origine a changé : ' + origine);
    assert.ok(b >= 0, 'le double manque : ' + double);
  }
  assert.ok(bloc.includes('.o-reglage-trouve { border-radius: var(--o-r-12); }'));
  // Les pastilles des cartes personnalisées gardent leur rayon fixe : leur lot interdit toute règle hors de son bloc (lot16_boutons_compacts).
  assert.ok(!/\.o-cvpastille|\.o-cvico|\.o-cvcarte/.test(bloc.slice(bloc.indexOf('*/'))),'une règle sur les cartes personnalisées est revenue dans ce bloc');
  // Le cadre d'une fiche : 26 px au plus, moins sous un thème anguleux ; la fiche écrit toujours son rayon en chiffres (ui.jsx).
  assert.ok(lignes.includes(':root { --o-r-feuille: min(26px, calc(var(--o-radius, 18px) * 1.4444)); }') && lignes.includes('html.loggia-prisme { --o-r-feuille: min(26px, calc(var(--o-radius, 22px) * 1.1818)); }'));
  assert.ok(lignes.includes('.o-sheet:where([style*="border-radius: 26px 26px 0px 0px;"]) { border-radius: var(--o-r-feuille) var(--o-r-feuille) 0 0 !important; }'));
  assert.ok(/className=\{?['"`]o-sheet[^\n]*\n?[^\n]*borderRadius: '26px 26px 0 0'|borderRadius: '26px 26px 0 0'/.test(lire('src', 'ui.jsx')), 'la fiche n’écrit plus « 26px 26px 0 0 » : la règle du cadre ne la trouve plus');
  // Tout jeton lu dans la feuille est défini.
  for (const m of css.matchAll(/var\(--o-r-([a-z0-9]+)/g)) assert.ok(bloc.includes('--o-r-' + m[1] + ':'), '--o-r-' + m[1] + ' est lu mais pas défini');
});
