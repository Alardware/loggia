// ─────────────────────────────────────────────────────────────────────────────
// La taille du texte (07/11, étape 10 du rapport sur l'usage) : deux crans, propres à cet écran. Le TEXTE grandit, la
// disposition ne bouge pas — la construction fait passer chaque taille par `var(--o-texte)` (scripts/taille_du_texte.mjs).
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CRANS_TEXTE, CLE_TAILLE_TEXTE, lireTailleTexte, appliquerTailleTexte } from '../src/tailletexte.js';
import { estCleAppareil } from '../src/config.js';
import { petitesCapitales } from '../src/styles.js';
import { agrandirJs, agrandirCss, agrandirTaille, greffonTailleDuTexte } from '../scripts/taille_du_texte.mjs';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const src = (f) => lire('src/' + f);
const stockage = (v) => ({ getItem: (k) => (k === CLE_TAILLE_TEXTE ? v : null) });
const X = (n) => `'calc(${n}px * var(--o-texte, 1))'`;
const page = () => {
  const props = new Map();
  return { props, racine: { style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) } } };
};

test('deux crans ; sans réglage, ou illisible, la taille normale ; l’ancien « Très grande » passe à « Grande »', () => {
  assert.deepEqual(CRANS_TEXTE, { normal: 1, grand: 1.15 });
  assert.equal(lireTailleTexte(stockage(null)), 'normal');
  assert.equal(lireTailleTexte(stockage('grand')), 'grand');
  assert.equal(lireTailleTexte(stockage('tres-grand')), 'grand', 'un écran réglé plus grand garde un texte agrandi');
  assert.equal(lireTailleTexte(stockage('__proto__')), 'normal');
  assert.equal(lireTailleTexte(stockage('enorme')), 'normal');
  assert.equal(lireTailleTexte({ getItem: () => { throw new Error('refusé'); } }), 'normal');
});

test('le cran se pose en variable sur la page ; la taille normale la retire', () => {
  const { props, racine } = page();
  const win = { frameElement: null, document: { documentElement: racine } };
  assert.equal(appliquerTailleTexte('grand', win), 1.15);
  assert.deepEqual([props.get('--o-texte'), props.get('--o-texte-carte')], ['1.15', '1.15'], 'une carte grandit d’au plus 15 % : la « Grande » entière');
  assert.equal(appliquerTailleTexte('normal', win), 1);
  assert.equal(props.size, 0, 'sans réglage, chaque taille reste exacte au pixel près');
  assert.equal(appliquerTailleTexte('grand', null), 1.15);
});

test('le zoom du premier essai, resté sur le cadre de panel.js, est défait ; un cadre d’une autre origine ne casse rien', () => {
  const { racine } = page();
  const cadre = { style: { zoom: '1.3', width: 'calc(100% / 1.3)', height: 'calc(100% / 1.3)' } };
  appliquerTailleTexte('grand', { frameElement: cadre, document: { documentElement: racine } });
  assert.deepEqual(cadre.style, { zoom: '', width: '100%', height: '100%' });
  const hostile = { document: { documentElement: racine } };
  Object.defineProperty(hostile, 'frameElement', { get() { throw new Error('origine'); } });
  assert.equal(appliquerTailleTexte('grand', hostile), 1.15);
});

test('à la construction : chaque taille écrite en chiffres passe par la variable', () => {
  assert.equal(agrandirJs('{ fontSize: 13, fontWeight: 700 }'), `{ fontSize: ${X(13)}, fontWeight: 700 }`);
  assert.equal(agrandirJs('{fontSize:12.5}'), `{fontSize:${X(12.5)}}`);
  assert.equal(agrandirJs('{ fontSize: tel ? 12 : 13.5, x }'), `{ fontSize: tel ? ${X(12)} : ${X(13.5)}, x }`);
  assert.equal(agrandirJs("{ fontSize: large ? 'clamp(28px, 3vw, 40px)' : 28 }"), `{ fontSize: large ? 'calc(clamp(28px, 3vw, 40px) * var(--o-texte, 1))' : ${X(28)} }`);
  assert.equal(agrandirJs("{ lineHeight: '14px', marginTop: 2 }"), `{ lineHeight: ${X(14)}, marginTop: 2 }`);
  for (const pareil of ['{ fontSize: taille }', "{ fontSize: '1.2em' }", "{ fontSize: 'inherit' }", '{ lineHeight: 1.2 }'])
    assert.equal(agrandirJs(pareil), pareil, pareil);
});

test('une taille écrite en toutes lettres grandit aussi (07/11 : « il ne s’applique pas partout ») ; une taille ajustée à sa colonne, jusqu’à sa borne haute', () => {
  const T = (v) => `calc(${v} * var(--o-texte, 1))`;
  assert.equal(agrandirTaille('13px'), T('13px'));
  assert.equal(agrandirTaille('var(--o-chiffre-taille, 25px)'), T('var(--o-chiffre-taille, 25px)'), 'les chiffres des cartes');
  assert.equal(agrandirTaille('calc(var(--o-chiffre-taille, 25px) * .6)'), T('calc(var(--o-chiffre-taille, 25px) * .6)'));
  assert.equal(agrandirTaille('clamp(30px, 15.5cqw, 54px)'), T('clamp(30px, 15.5cqw, 54px)'), 'une part de la boîte : en entier');
  assert.equal(agrandirTaille('clamp(10.5px, calc(100cqi / var(--o-larg, 12)), 12px)'),
    'clamp(10.5px, calc(100cqi / var(--o-larg, 12)), calc(12px * var(--o-texte, 1)))', 'ajustée à sa colonne : la borne haute seule');
  for (const pareil of ['1em', '.52em', '120%', 'inherit', T('12px')]) assert.equal(agrandirTaille(pareil), pareil, pareil);
  assert.equal(agrandirJs("{ fontSize: 'var(--o-piece-taille, 25px)', x }"), `{ fontSize: '${T('var(--o-piece-taille, 25px)')}', x }`);
  const coupee = "{ fontSize: 'clamp(20px, calc(100cqi / ' + n + '), 34px)' }";
  assert.equal(agrandirJs(coupee), coupee, 'une chaîne coupée : la source la convertit elle-même');
  assert.equal(agrandirCss('.v { font-size: var(--o-taille, 15px); } .w { font-size: clamp(10px, calc((100cqi - 9px) / 3), 15px) !important; }'),
    `.v { font-size: ${T('var(--o-taille, 15px)')}; } .w { font-size: clamp(10px, calc((100cqi - 9px) / 3), ${T('15px')}) !important; }`);
  assert.equal(agrandirCss('.x { --o-font-size: 12px; font-size: 1em; }'), '.x { --o-font-size: 12px; font-size: 1em; }');
});

test('les icônes gardent leur taille : leur police dessine, elle n’écrit pas', () => {
  const ico = "<i className={'fi fi-rr-' + m.ico} style={{ fontSize: 10, lineHeight: 1 }} />";
  assert.equal(agrandirJs(ico + '<span style={{ fontSize: 10 }}>a</span>'), ico + `<span style={{ fontSize: ${X(10)} }}>a</span>`);
  const css = '.o-confort-ico .fi { font-size: 13px !important; }';
  assert.equal(agrandirCss(css), css);
});

test('dans les feuilles de style : font-size et line-height en pixels ; ce qui s’ajuste à sa boîte ne bouge pas', () => {
  assert.equal(agrandirCss('@media (max-width: 760px) {\n  .a { font-size: 12px !important; line-height: 15px; }\n}'),
    '@media (max-width: 760px) {\n  .a { font-size: calc(12px * var(--o-texte, 1)) !important; line-height: calc(15px * var(--o-texte, 1)); }\n}');
  const ajustee = '.b { font-size: clamp(10.5px, calc(100cqi / 8), 12px); line-height: 1.3; }';
  assert.equal(agrandirCss(ajustee), '.b { font-size: clamp(10.5px, calc(100cqi / 8), calc(12px * var(--o-texte, 1))); line-height: 1.3; }');
});

const modules = (dossier) => readdirSync(new URL('../src/' + dossier, import.meta.url), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? modules(dossier + e.name + '/') : /\.jsx?$/.test(e.name) ? [dossier + e.name] : []);

test('sur les vraies sources : ce qui reste en pixels est recensé, et rien d’autre', () => {
  const restes = [];
  for (const f of modules('')) {
    const js = agrandirJs(src(f));
    for (const m of js.matchAll(/\bfontSize:\s*([A-Za-z_$][\w$.]*|\d[\d.]*)\s*[,}\n]/g)) restes.push(`${f} ${m[1]}`);
    // Une taille en toutes lettres qui ne grandirait pas : seules les relatives (`em`, `%`) suivent leur parent. Une chaîne
    // coupée par un `+` (le mot en grand des fiches) se vérifie plus bas.
    for (const m of js.matchAll(/\bfontSize:\s*'([^'\n]*)'(?=\s*[,}\n])/g)) {
      if (!m[1].includes('--o-texte') && !/^\s*(?:[\d.]+(?:em|%)|inherit)\s*$/.test(m[1])) restes.push(`${f} '${m[1]}'`);
    }
  }
  assert.deepEqual(restes.sort(), [
    'icones.jsx size',                 // les icônes
    'ui.jsx size',
    'views/reglesjour.jsx 10',         // l'icône d'un moment, dans sa pastille
  ]);
  const css = [...agrandirCss(src('index.css')).matchAll(/([^{}]*)\{([^{}]*)\}/g)]
    .filter(([, , decl]) => /(font-size|line-height)\s*:\s*[\d.]+px/.test(decl)).map(([, sel]) => sel.trim());
  assert.ok(css.length > 0 && css.every((sel) => /\.fi\b/.test(sel)), css.join(' | '));
  // Toute taille de police d'index.css grandit, hors des icônes : en pixels, en variable, en part de sa boîte.
  const fixes = [...agrandirCss(src('index.css')).matchAll(/([^{}]*)\{([^{}]*)\}/g)].flatMap(([, sel, decl]) => (/\.fi\b/.test(sel) ? []
    : [...decl.matchAll(/(?<![\w-])font-size\s*:\s*([^;!]+)/g)].map((m) => m[1].trim())
      .filter((v) => !v.includes('--o-texte') && !/^(?:[\d.]+(?:em|%)|inherit|0)$/.test(v)).map((v) => `${sel.trim()} : ${v}`)));
  assert.deepEqual(fixes, []);
});

test('les tailles passées par une variable suivent aussi ; le greffon est branché avant React, sur src/ seulement', () => {
  for (const f of ['fichelumiere.jsx', 'ficheprise.jsx']) {
    assert.ok(src(f).includes("' + Math.max(1, mot.length) + ')), calc(34px * var(--o-texte, 1)))'"), `${f} : le mot en grand, jusqu’à 34 px agrandis`);
  }
  assert.ok(!/font-size:\d/.test(src('cartegeo.js')), 'la carte des présences : ses étiquettes aussi');
  assert.match(src('views/energie.jsx'), /const PASTILLE_GRANDIT = \{ transform: 'scale\(var\(--o-texte, 1\)\)', transformBox: 'fill-box', transformOrigin: 'center' \};/);
  assert.equal((src('views/energie.jsx').match(/<g style=\{PASTILLE_GRANDIT\}>/g) || []).length, 2, 'les pastilles du schéma, en entier');
  assert.equal(petitesCapitales(10).fontSize, 'calc(10px * var(--o-texte, 1))');
  assert.match(src('fichevolet.jsx'), /fontSize: `calc\(\$\{taille\}px \* var\(--o-texte, 1\)\)`/);
  assert.match(src('views/parametres.jsx'), /fontSize: `calc\(\$\{tailleTitre\}px \* var\(--o-texte, 1\)\)`/);
  assert.match(lire('vite.config.js'), /plugins: \[react\(\), orbeRechargee, prechargerBoot, tailleDuTexte\]/);
  assert.equal(greffonTailleDuTexte.enforce, 'pre');
  assert.equal(greffonTailleDuTexte.transform('{ fontSize: 13 }', 'C:/x/node_modules/y/src/a.js'), null);
  assert.equal(greffonTailleDuTexte.transform('{ fontSize: 13 }', 'C:\\loggia\\src\\a.jsx').code, `{ fontSize: ${X(13)} }`);
  assert.equal(greffonTailleDuTexte.transform('{ marginTop: 2 }', '/loggia/src/a.jsx'), null);
});

test('les cartes, à hauteur fixe, lisent le plafond ; la rangée de pastilles d’un scénario suit le texte', () => {
  assert.match(src('index.css'), /\.o-gabarit, \.o-rmcard \{ --o-texte: var\(--o-texte-carte, 1\); \}/);
  assert.ok(src('index.css').includes('@container style(--o-texte-carte: 1.15) { [data-plante] [data-grille] > :nth-child(n+3) { display: none !important; } }'),
    'la carte d’une plante garde sa première rangée de mesures');
  const scn = src('app/scenarios.jsx');
  assert.ok(scn.includes("'--o-texte': 'var(--o-texte-carte, 1)',"), 'la carte de scénario');
  assert.ok(scn.includes("const H_PUCE_SCN = 'calc(8px + 15px * var(--o-texte, 1))';"));
});

test('propre à cet écran : jamais exportée ni importée', () => {
  assert.equal(estCleAppareil(CLE_TAILLE_TEXTE), true);
});

test('posée avant le premier rendu ; réglable dans les deux formats des Paramètres', () => {
  assert.match(src('boot.jsx'), /appliquerTailleTexte\(lireTailleTexte\(\)\);/);
  const p = src('views/parametres.jsx');
  assert.match(p, /const \[tailleTexte, poserTailleTexte\] = useTailleTexte\(\);/);
  assert.match(p, /<OptRow ici title=\{tr\('Taille du texte'\)\}[^\n]*>\n\s*<Seg label=\{tr\('Taille du texte'\)\} value=\{tailleTexte\} opts=\{cransTexte\} onPick=\{poserTailleTexte\} \/>/, 'le PC');
  assert.match(p, /<CarteTel ici titre=\{tr\('Taille du texte'\)\}[^\n]*>\n\s*<ChoixTel titre=\{tr\('Taille'\)\} label=\{tr\('Taille du texte'\)\} value=\{tailleTexte\} opts=\{cransTexte\} onPick=\{poserTailleTexte\} \/>/, 'le téléphone');
});
