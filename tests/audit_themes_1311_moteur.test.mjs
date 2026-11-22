// ─────────────────────────────────────────────────────────────────────────────
// Audit des thèmes du 13/11 — LE MOTEUR (validé le 14/11) : M1, M3, M5, E4.
//
//  E4  l'accent REMPLIT et DESSINE : la garde ne lui demande plus que de se
//      voir (3:1), il reste celui du thème dans 29 variantes sur 36 (10 avant) ;
//  M5  le rouge qui porte du blanc a son fond (`--o-bad-fond`), comme l'accent ;
//      E3 (les teintes d'état qui remplissent) est REFUSÉ : rien n'y change ;
//  M1  un thème peut dire ses traits, ses remplissages, ses niveaux de texte,
//      sa barre et son en-tête ;
//  M3  … et ses couleurs d'état, avec leur compagnon « r,g,b » calculé.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { garde, contraste, lireCouleur, SEUILS, JETONS_GARDE } from '../src/contraste.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const lecteur = (o) => (j) => o[j] || '';
const BLANC = [255, 255, 255];

// Les jetons tels que le thème les pose, verre compris (surfaces à 62 %).
const DRACULA = { '--o-bg': '#21222c', '--o-bggrad': 'radial-gradient(ellipse 90% 70% at 50% 0%,#2b2d3d 0%,#1e1f29 60%)', '--o-surfA': 'rgba(52,55,70,.62)', '--o-surfB': 'rgba(40,42,54,.62)',
  '--o-text': '#f8f8f2', '--o-text2': '#8a94c0', '--o-text3': '#8a94c0', '--o-accent': '#bd93f9', '--o-accent-soft': '#bd93f9', '--o-bad': '#f26666', '--o-bad-rgb': '242,102,102', '--o-bw': '1px' };
const IOS_CLAIR = { '--o-bg': '#e5e5ea', '--o-bggrad': 'linear-gradient(165deg,#eef0f5,#e1e4ed)', '--o-surfA': 'rgba(255,255,255,.62)', '--o-surfB': 'rgba(251,251,253,.62)',
  '--o-text': '#1c1c1e', '--o-text2': '#6c6c70', '--o-text3': '#6c6c70', '--o-accent': '#ff9409', '--o-accent-soft': '#b35c00', '--o-bad': '#b71920', '--o-bad-rgb': '183,25,32', '--o-bw': '0px' };

test('E4 — un accent qui se voit n’est plus retouché : le violet de Dracula reste #bd93f9', () => {
  const o = garde(lecteur(DRACULA));
  assert.equal(o['--o-accent'], undefined, 'la garde éclaircissait l’accent pour qu’il se LISE sur son propre disque (#cfb0fb)');
  assert.equal(o['--o-accent-rgb'], undefined);
  // Ce qui s'ÉCRIT dans l'accent garde son jeton, tenu lisible avec les teintes.
  const soft = lireCouleur(o['--o-accent-soft'] || DRACULA['--o-accent-soft']);
  assert.ok(contraste(soft, [40, 42, 54]) >= SEUILS.wcag, 'le texte d’accent reste lisible sur une carte');
  // Et la puce choisie porte toujours du blanc.
  assert.ok(contraste(lireCouleur(o['--o-accent-fond']), BLANC) >= 4.6);
  assert.ok(!lire('src', 'contraste.js').includes('surDisque'), 'la contrainte « lisible sur son disque » est revenue');
});

test('E4 — un accent qui ne se voit PAS est encore ajusté, du plus petit pas : l’orange d’iOS clair ne vire plus au brun', () => {
  const o = garde(lecteur(IOS_CLAIR));
  const a = lireCouleur(o['--o-accent']);
  assert.ok(a, 'un orange à 1,8:1 sur la page claire doit encore être assombri');
  assert.ok(contraste(a, lireCouleur('#e5e5ea')) >= SEUILS.accent, 'une icône, un interrupteur, un trait : 3:1');
  // #915200 (avant) avait une luminosité de 28 % ; le pas qui suffit en garde nettement plus.
  assert.ok(Math.max(a[0], a[1], a[2]) > 180, 'l’orange est redevenu un brun : ' + o['--o-accent']);
  assert.equal(o['--o-accent-rgb'], a.slice(0, 3).map(Math.round).join(','));
});

test('E4 — les deux textes écrits dans l’accent prennent le jeton qui écrit', () => {
  assert.ok(lire('src', 'chrome', 'barrelaterale.jsx').includes("background: 'transparent', color: 'var(--o-accent-soft)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>"), '« Gérer les profils »');
  assert.ok(lire('src', 'views', 'assistant.jsx').includes("const MOT_LU = { color: 'var(--o-accent-soft)', textShadow: '0 0 16px rgba(var(--o-accent-rgb), .8)' };"), 'le mot prononcé');
});

test('M5 — le rouge qui porte du blanc : un fond calculé, posé par la garde, purgé avec le thème', () => {
  const sombre = garde(lecteur(DRACULA)), clair = garde(lecteur(IOS_CLAIR));
  for (const [nom, o] of [['sombre', sombre], ['clair', clair]]) {
    assert.ok(o['--o-bad-fond'], nom + ' : le fond rouge n’est pas posé');
    assert.ok(contraste(lireCouleur(o['--o-bad-fond']), BLANC) >= 4.6, nom + ' : le blanc n’y tient pas');
  }
  // Un rouge de thème clair porte déjà le blanc : il n'est pas assombri.
  assert.equal(clair['--o-bad-fond'], clair['--o-bad'] || '#b71920');
  assert.ok(contraste(lireCouleur('#f26666'), BLANC) < 3.5, 'le rouge d’un thème sombre ne portait pas le blanc : c’est le défaut corrigé');
  assert.ok(JETONS_GARDE.includes('--o-bad-fond'), 'le fond rouge d’un thème suivrait au suivant');
  assert.ok(lire('src', 'index.css').includes(':root { --o-bad-fond: var(--o-bad); }'), 'sans la garde, le jeton n’aurait pas de valeur');
  // Les trois boutons armés que la session Audit a signalés.
  const p = lire('src', 'views', 'parametres.jsx');
  assert.ok(p.includes("const SUPPR_ARME = { background: 'var(--o-bad-fond)', color: '#fff' };"));
  assert.ok(p.includes("background: arm ? 'var(--o-bad-fond)' : 'transparent', color: arm ? '#fff' : 'var(--o-bad)'"), '« Remettre à zéro… » armé');
  assert.ok(lire('src', 'views', 'versions.jsx').includes("const ARME = { ...btnDanger, background: 'var(--o-bad-fond)', color: '#fff' };"));
});

test('M5 — E3 est refusé : les teintes d’état gardent leur correction d’avant', () => {
  // « Laisse E3 » (14/11) : `--o-lampe` et ses voisines ne reçoivent PAS de second jeton « qui remplit ».
  // (`--o-rose-fond` et `--o-purple-fond` existaient avant : le dégradé du bouton de l'assistant.)
  assert.ok(!JETONS_GARDE.some(j => /--o-(lampe|ok|warn|warn2|cyan|gold|cold|orange)-fond$/.test(j)), 'un jeton de remplissage a été ajouté à une teinte d’état');
});

test('M1 et M3 — un thème peut dire ses niveaux ; sans eux, il se pose comme avant', () => {
  const t = lire('src', 'theme.js');
  // Les replis : exactement les valeurs d'avant quand le thème ne dit rien de plus.
  assert.ok(t.includes("set('--o-text1', v.text1 || v.text); set('--o-text2', v.muted); set('--o-text3', v.text3 || v.muted);"));
  assert.ok(t.includes("set('--o-bd1', traits[0] || v.border); set('--o-bd2', traits[1] || traits[0] || v.border); set('--o-bd3', traits[2] || traits[1] || traits[0] || v.border);"));
  assert.ok(t.includes('const fondN = (i) => rempl[i] || rempl[rempl.length - 1] || v.border;'));
  assert.ok(t.includes("set('--o-header', v.entete || v.surface); set('--o-side1', v.barre || v.surfaceElevated || v.surface);"));
  // Les couleurs d'état : le jeton et son compagnon calculé — jamais écrit à la main.
  // ASSERTION MODIFIÉE (15/11, F7) : `lampe` s'ajoute à la liste — la couleur d'une lumière allumée, que Google met à son accent.
  assert.ok(t.includes("const ETATS = ['ok', 'warn', 'warn2', 'bad', 'purple', 'cyan', 'gold', 'cold', 'lampe'];"));
  assert.ok(t.includes("set('--o-' + nom, c); const rgb = cssToRgb(c); if (rgb) set('--o-' + nom + '-rgb', rgb);"));
  // Tout ce qu'un thème peut ainsi poser est purgé au changement de thème.
  const cles = t.slice(t.indexOf('const THEME_KEYS = ['), t.indexOf('const LOGGIA_PRESETS'));
  for (const j of ['--o-text1', '--o-text3', '--o-bd1', '--o-bd3', '--o-s1', '--o-s5', '--o-side1', '--o-header', '--o-ok', '--o-ok-rgb', '--o-warn', '--o-warn2-rgb', '--o-bad-rgb', '--o-purple', '--o-cyan-rgb', '--o-gold', '--o-cold-rgb']) {
    assert.ok(cles.includes("'" + j + "'"), j + ' resterait posé au thème suivant');
  }
  // Les `fine` d'un thème passent toujours en dernier : Atrium, The Projekt et les bleus ne bougent pas.
  assert.ok(t.indexOf('if (v.etats) ETATS.forEach') < t.indexOf('if (v.fine) Object.keys(v.fine).forEach'));
});

test('les conseils météo d’une pièce ne posent plus de couleur en dur', () => {
  const p = lire('src', 'vues', 'piece.jsx');
  const d = p.indexOf("if (mode === 'rain') T.push("), bloc = p.slice(d, p.indexOf('return T;', d));
  assert.ok(d >= 0 && !/'#[0-9a-f]{3,8}'/i.test(bloc), 'une icône pâle écrite en dur disparaissait sur un thème clair');
});
