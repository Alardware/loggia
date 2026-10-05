// Lot 15 de l'audit du 03/10 — contraste des puces et des boutons pleins.
//
// 1. Le fond d'accent (`--o-accent-fond`) est CALCULÉ pour porter du blanc
//    (4,7:1 au moins, src/contraste.js) : le quasi-noir `#06121f` que gardaient
//    six boutons pleins y tombait à 4,00:1. Seules restent deux icônes (3:1
//    suffit) et l'écran d'erreur de boot.jsx, à couleurs fixes.
// 2. Le compteur des filtres d'Objets ne s'efface plus par une opacité (2,53:1
//    sur la puce choisie, 4,35:1 ailleurs) mais par un jeton du thème.
// 3. Les zones du plan du robot passent au bleu plein ; l'aperçu choisi de la
//    galerie (CarteApercu) est tranché : ce n'est pas une puce.
// 4. Le style de puce de styles.js n'est plus recopié dans cinq vues.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireCouleur, contraste, composer, garde, SEUILS } from '../src/contraste.js';
import * as STYLES from '../src/styles.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const NL = String.fromCharCode(10);
const APP = lire('src', 'App.jsx');
const bloc = (src, debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };
const sources = (dir) => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? sources(p) : /\.(jsx?|mjs)$/.test(n) ? [p] : []; });

test('aucun texte quasi noir sur le fond d’accent — sauf deux icônes', () => {
  const fautes = [];
  for (const f of sources(join(RACINE, 'src'))) {
    const nom = relative(RACINE, f).split('\\').join('/');
    lire(...nom.split('/')).split(NL).forEach((l, i) => {
      if (l.indexOf('#06121f') < 0) return;
      // Une icône seule dans sa case (la coche du composeur) : 3:1 lui suffit.
      if (nom === 'src/App.jsx' && l.includes("<Fi i={on ? 'check' : 'plus'} size={11} /></span>")) return;
      // La coche de l'accueil, son pendant ; et le logo « O » sur son dégradé.
      if (nom === 'src/Onboarding.jsx' && (l.includes('<Fi i="check" size={11} color="#06121f" />') || l.includes("linear-gradient(135deg,var(--o-ok),var(--o-accent))"))) return;
      // L'écran d'erreur : ses couleurs sont fixes, le thème n'a peut-être pas chargé.
      if (nom === 'src/boot.jsx' && l.includes("background: '#4f8cff', color: '#06121f'")) return;
      fautes.push(nom + ':' + (i + 1));
    });
  }
  assert.deepEqual(fautes, [], 'du quasi-noir sur un fond plein, là où le blanc est calculé pour tenir');
  // Les six boutons pleins de l'audit, nommément.
  assert.ok(lire('src', 'ui.jsx').includes("background: accent ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: accent ? '#fff' : 'var(--o-text1)',"), 'editBtn (Restaurer)');
  assert.ok(lire('src', 'Onboarding.jsx').includes("fontSize: 13, fontWeight: 700, background: 'var(--o-accent-fond)', color: '#fff',"), 'Commencer, Continuer, Ouvrir mon dashboard');
  assert.ok(bloc(APP, 'function BandeauEdition(', NL + 'function ').includes("background: accent ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: accent ? '#fff' : 'var(--o-text1)'"), 'Ajouter une carte');
  for (const f of ['function CardEditSheet(', 'function FichePiece(', 'function FicheScenario(']) {
    assert.ok(/background: 'var\(--o-accent-fond\)', color: '#fff'(, opacity: [^}]+)? \}\}><Fi i="plus" size=\{12\} \/>\{tr\('Enregistrer'\)\}/.test(bloc(APP, f, NL + 'function ')), f + ' : Enregistrer');
  }
});

test('le blanc tient sur le fond d’accent ; le quasi-noir, non', () => {
  // Loggia sombre : l'accent #4f8cff, son fond assombri par la garde.
  const fond = lireCouleur(garde((j) => ({ '--o-bg': '#0b101b', '--o-accent': '#4f8cff', '--o-text': '#eaf0fb' })[j] || '')['--o-accent-fond']);
  assert.ok(contraste(fond, [255, 255, 255]) >= SEUILS.surAccent, 'le blanc : le seuil pour lequel le fond est calculé');
  assert.ok(contraste(fond, lireCouleur('#06121f')) < 4.5, 'le quasi-noir manquait 4,5:1 — c’était le constat');
});

/* Les jetons de Loggia (index.css) dont dépend le compteur. */
const LOGGIA = {
  sombre: { '--o-bg': '#0b101b', '--o-bggrad': '', '--o-surfA': 'rgba(22,29,42,.9)', '--o-surfB': 'rgba(16,22,34,.9)', '--o-s1': 'rgba(255,255,255,.05)', '--o-s2': 'rgba(255,255,255,.04)',
    '--o-text': '#eaf0fb', '--o-text1': '#c2cadb', '--o-text2': '#8c98b2', '--o-text3': '#7d8aa6', '--o-accent': '#4f8cff' },
  clair: { '--o-bg': '#eef2f8', '--o-bggrad': '', '--o-surfA': 'rgba(255,255,255,.96)', '--o-surfB': 'rgba(248,250,253,.96)', '--o-s1': 'rgba(20,30,55,.05)', '--o-s2': 'rgba(20,30,55,.04)',
    '--o-text': '#16203a', '--o-text1': '#27324d', '--o-text2': '#5a6884', '--o-text3': '#5d6b86', '--o-accent': '#4f8cff' },
};

test('le compteur des filtres d’Objets : discret par un jeton, lisible à 4,5:1', () => {
  // Les valeurs recopiées ci-dessus doivent rester celles d'index.css : sinon
  // les mesures porteraient sur une palette qui n'existe plus.
  const CSS = lire('src', 'index.css');
  for (const [nom, t] of Object.entries(LOGGIA)) for (const j of ['--o-bg', '--o-surfA', '--o-surfB', '--o-s1', '--o-s2', '--o-text3']) {
    assert.ok(CSS.includes(j + ':' + t[j] + ';'), nom + ' : ' + j + ' a changé dans index.css — réaligner LOGGIA');
  }
  const vue = bloc(APP, 'function ObjetsView(', NL + 'function ');
  assert.ok(vue.includes("<span className=\"o-objfiltre-nb\" aria-hidden=\"true\" style={{ fontWeight: 800, color: on ? 'inherit' : 'var(--o-text3)' }}>{n}</span>"),
    'non choisie : le gris tertiaire ; choisie : le blanc de la puce');
  assert.ok(!/o-objfiltre-nb[^>]*opacity/.test(vue), 'plus d’opacité : elle tombait à 2,53:1 sur la puce choisie, 4,35:1 ailleurs');
  for (const [nom, t] of Object.entries(LOGGIA)) {
    const out = garde((j) => t[j] || '');
    const lu = (j) => lireCouleur(out[j] || t[j]);
    const puceFond = composer(lu('--o-bg'), lu('--o-s1'));
    assert.ok(contraste(lu('--o-text3'), puceFond) >= 4.5, nom + ' : le gris tertiaire sur une puce non choisie');
    assert.ok(contraste([255, 255, 255], lu('--o-accent-fond')) >= 4.5, nom + ' : le blanc sur la puce choisie');
    // Ce que donnait l'opacité, pour mémoire : le blanc à 55 % sur le bleu.
    const avant = composer(lu('--o-accent-fond'), [255, 255, 255, 0.55]);
    assert.ok(contraste(avant, lu('--o-accent-fond')) < 4.5, nom + ' : l’ancien compteur manquait le seuil');
  }
  // La garde le tient pour tout thème : un gris trop pâle sur `--o-s1` est relevé.
  const pale = { ...LOGGIA.sombre, '--o-text3': '#4a5163' };
  const out = garde((j) => pale[j] || '');
  assert.ok(contraste(lireCouleur(out['--o-text3']), composer(lireCouleur(pale['--o-bg']), lireCouleur(pale['--o-s1']))) >= 4.5, 'un thème au gris trop pâle est relevé');
});

test('les zones du plan du robot : choisie en bleu plein, sinon une surface opaque du thème', () => {
  const vac = lire('src', 'vacplan.jsx');
  assert.ok(vac.includes("background: on ? 'var(--o-accent-fond)' : 'var(--o-bg)',") && vac.includes("color: on ? '#fff' : 'var(--o-text)',"), 'bleu plein et texte blanc');
  assert.ok(vac.includes("border: '1.5px solid ' + (on ? 'transparent' : z ? 'rgba(var(--o-text3-rgb),.6)' : 'rgba(var(--o-gold-rgb),.75)'),"), 'une pièce à nommer garde son liseré doré');
  for (const vieux of ["'rgba(255,255,255,.94)'", "'#0b101b'", "'rgba(8,13,22,.82)'", "'rgba(255,214,102,.75)'"]) assert.ok(!vac.includes(vieux), vieux + ' : une couleur en dur est revenue');
});

test('l’aperçu choisi de la galerie n’est pas une puce : cadre teinté, pas de bleu plein', () => {
  const c = bloc(APP, 'function CarteApercu(', NL + '}');
  assert.ok(c.includes("background: actif ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', border: '1px solid ' + (actif ? 'var(--o-accent-fond)' : 'var(--o-bd2)')"), 'le cadre teinté et son filet');
  assert.ok(c.includes('aria-pressed={actif}'), 'le choix se dit');
  assert.ok(!c.includes("actif ? 'var(--o-accent-fond)' : 'var(--o-s2)'"), 'le bleu plein recouvrirait la carte qu’il montre');
  assert.ok(APP.includes("Choisi, l'aperçu n'est PAS une puce (lot 15 de l’audit du 03/10)"), 'la décision est écrite là où on la lirait');
});

test('la puce de styles.js n’est plus recopiée : même dessin, une seule règle du choix', () => {
  const { puce, puceHaute } = STYLES;
  assert.equal(typeof puceHaute, 'function', 'la variante haute vit dans styles.js');
  const choisie = { background: 'var(--o-accent-fond)', color: '#fff' };
  assert.deepEqual(puce(true), { padding: '6px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: 'none', ...choisie });
  assert.deepEqual(puce(false), { padding: '6px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: 'none', background: 'var(--o-s1)', color: 'var(--o-text2)' });
  // Le dessin des trois copies des Volets et des Interrupteurs, à l'identique.
  assert.deepEqual(puceHaute(true), { padding: '7px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: 'none', ...choisie });
  assert.deepEqual(puceHaute(false), { padding: '7px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: 'none', background: 'var(--o-s1)', color: 'var(--o-text1)' });
  for (const [f, attendu] of [
    ['volets.jsx', "import { puceHaute as puce } from '../styles.js';"],
    ['interrupteurs.jsx', "import { puceHaute } from '../styles.js';"],
    ['fenetres.jsx', "import { puce as pucePartagee } from '../styles.js';"],
    ['nuit.jsx', "import { puce } from '../styles.js';"],
    ['presence.jsx', "import { puce } from '../styles.js';"],
  ]) {
    const s = lire('src', 'views', f);
    assert.ok(s.includes(attendu), f + ' : importe la puce partagée');
    assert.ok(!s.includes("background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff'"), f + ' : la règle du choix est recopiée');
  }
  assert.ok(lire('src', 'views', 'interrupteurs.jsx').includes('  const puce = puceHaute;'), 'les réglages d’un geste');
  // Fenêtres garde son rembourrage d'un pixel plus serré, à découvert.
  assert.ok(lire('src', 'views', 'fenetres.jsx').includes("  const puce = (on) => ({ ...pucePartagee(on), padding: '6px 11px' });"), 'l’écart des Fenêtres');
});
