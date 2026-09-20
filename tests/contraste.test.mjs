// La garde de contraste des thèmes (19/09, v3.60.0, ADR 0060) : chaque thème
// garde ses couleurs, mais aucune ne passe sous son seuil de lisibilité.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireCouleur, contraste, composer, ajuster, garde, versHex, SEUILS, JETONS_GARDE, LAVIS, LAVIS_DENSE } from '../src/contraste.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');

// Les jetons d'un thème, tels que `getComputedStyle` les rendrait.
const LOGGIA_SOMBRE = {
  '--o-bg': '#0b101b', '--o-bggrad': '', '--o-surfA': 'rgba(22,29,42,.62)', '--o-surfB': 'rgba(16,22,34,.62)',
  '--o-text': '#eaf0fb', '--o-text2': '#8c98b2', '--o-text3': '#7d8aa6', '--o-text3-rgb': '125,138,166',
  '--o-accent': '#4f8cff', '--o-accent-soft': '#6ea8ff', '--o-ok': '#34d399', '--o-ok-rgb': '52,211,153',
  '--o-warn': '#ffce73', '--o-bad': '#ef4444', '--o-cold': '#60a5fa', '--o-rose': '#ff2d78', '--o-purple': '#a78bfa',
};
const lecteur = (t) => (jeton) => t[jeton] || '';

test('les couleurs se lisent, se composent et se mesurent', () => {
  assert.deepEqual(lireCouleur('#abc'), [170, 187, 204, 1]);
  assert.deepEqual(lireCouleur('rgba(1, 2, 3, 0.5)'), [1, 2, 3, 0.5]);
  assert.deepEqual(lireCouleur('rgb(1 2 3 / 50%)'), [1, 2, 3, 0.5]);
  assert.equal(lireCouleur('color(srgb 0 0.5 1)')[1], 127.5);
  assert.equal(lireCouleur('pas une couleur'), null);
  assert.equal(Math.round(contraste([255, 255, 255], [0, 0, 0])), 21);
  // Une surface translucide posée sur le fond : c'est ce que voit l'œil.
  assert.equal(versHex(composer([11, 16, 27], [22, 29, 42, 0.62])), '#121824');
});

test('ajuster ne bouge que ce qui manque son seuil, et garde la teinte', () => {
  const fond = [[18, 24, 36]];
  const bon = [255, 255, 255];
  assert.deepEqual(ajuster(bon, fond, 4.5, 1), bon, 'ce qui tient déjà ne bouge pas');
  const faible = [90, 100, 120];
  const mieux = ajuster(faible, fond, 5, 1);
  assert.ok(contraste(mieux, fond[0]) >= 5, 'le seuil est atteint');
  assert.ok(mieux[2] > mieux[0], 'la teinte froide reste froide');
  // Sur un fond clair, on assombrit.
  const sombre = ajuster([150, 160, 180], [[238, 242, 248]], 5, -1);
  assert.ok(contraste(sombre, [238, 242, 248]) >= 5);
});

test('Loggia garde ses gris : la garde ne touche que le fond d’accent', () => {
  const o = garde(lecteur(LOGGIA_SOMBRE));
  assert.equal(o['--o-text2'], undefined, 'le gris secondaire de Loggia tient déjà');
  assert.equal(o['--o-text3'], undefined, 'le gris tertiaire aussi');
  assert.ok(o['--o-accent-fond'], 'le fond d’accent est posé (il porte du texte blanc)');
  assert.ok(contraste(lireCouleur(o['--o-accent-fond']), [255, 255, 255]) >= SEUILS.surAccent, 'le blanc y est lisible');
  // Le bouton de l'assistant : son violet s'assombrit pour l'icône blanche.
  assert.ok(contraste(lireCouleur(o['--o-purple-fond']), [255, 255, 255]) >= SEUILS.surIcone);
});

// Audit du 20/09 (ADR 0063) : 13 528 textes, 15 thèmes × clair et sombre. Les
// seuls sous 4,5:1 — 303 sur 306 — étaient au pied d'une carte TEINTÉE. Tenir
// le seuil là demande un gris nettement plus clair ; posé partout, il changeait
// le visage de Loggia. Il ne vaut donc que sur ces cartes.
test('sur une carte teintée, les gris ont une variante à 4,5:1 — et Loggia garde les siens ailleurs', () => {
  const o = garde(lecteur(LOGGIA_SOMBRE));
  assert.equal(o['--o-text2'], undefined, 'le gris ordinaire ne bouge pas');
  const carte = composer([11, 16, 27], [22, 29, 42, 0.62]);
  let ordinaireEchoue = false;
  for (const teinte of ['--o-warn', '--o-accent-soft', '--o-ok', '--o-cold', '--o-purple', '--o-rose', '--o-bad']) {
    const t = lireCouleur('rgb(' + (o[teinte + '-rgb'] || LOGGIA_SOMBRE[teinte + '-rgb']) + ')') || lireCouleur(o[teinte] || LOGGIA_SOMBRE[teinte]);
    const fond = composer(carte, [t[0], t[1], t[2], LAVIS_DENSE]);
    assert.ok(contraste(lireCouleur(o['--o-text2-lavis']), fond) >= SEUILS.text2Lavis - 0.01, 'gris secondaire sur ' + teinte);
    assert.ok(contraste(lireCouleur(o['--o-text3-lavis']), fond) >= SEUILS.wcag - 0.01, 'gris tertiaire sur ' + teinte);
    if (contraste(lireCouleur(LOGGIA_SOMBRE['--o-text3']), fond) < SEUILS.wcag) ordinaireEchoue = true;
  }
  assert.ok(ordinaireEchoue, 'le gris ordinaire tiendrait déjà : la variante ne servirait à rien');
  // La hiérarchie se lit encore : le secondaire reste plus clair que le tertiaire.
  assert.ok(contraste(lireCouleur(o['--o-text2-lavis']), carte) > contraste(lireCouleur(o['--o-text3-lavis']), carte));
  assert.equal(o['--o-text3-lavis-rgb'].split(',').length, 3, 'le compagnon « r,g,b » suit');
  for (const j of ['--o-text2-lavis', '--o-text3-lavis', '--o-text3-lavis-rgb']) assert.ok(JETONS_GARDE.includes(j), j + ' échapperait à la purge au changement de thème');
  // Les cartes teintées substituent la variante aux gris, et :root la définit
  // avant le passage de la garde (sinon `var()` serait invalide).
  assert.ok(css.includes('[style*="transparent 28%"], [style*="transparent 62%"], [style*="background: rgba(var(--o-"], .o-piecestd, .o-tuile-alarme, .grid-qscenes > * {'));
  assert.ok(css.includes('--o-text2: var(--o-text2-lavis); --o-text3: var(--o-text3-lavis); --o-text3-rgb: var(--o-text3-lavis-rgb);'));
  assert.equal(css.split('--o-text2-lavis:#').length - 1, 3, 'sombre, clair et îlot sombre');
  // Les sélecteurs lisent un dégradé que les cartes posent en ligne : s'il change, la règle ne prend plus.
  assert.ok(src.split('linear-gradient(180deg,transparent 28%,').length - 1 >= 8);
  // Le rouge d'alerte et le rose gardent leur force : ils ne parlent jamais seuls.
  assert.equal(SEUILS.surLavis, 4.5);
  assert.equal(SEUILS.surLavisVif, 4.2);
  assert.ok(LAVIS_DENSE > LAVIS, 'les variantes visent un lavis plus dense que le nominal');
});

// Les teintes qui ÉCRIVENT sur une carte teintée : « Ouvert » en violet sur sa
// carte, « 1480 ppm » ambre sur une pièce rose — les 86 textes qui restaient
// sous 4,5:1 après les gris. Même remède : une variante qui ne vaut que là.
test('sur une carte teintée, chaque teinte a sa variante — et la teinte du thème ne bouge pas', () => {
  const o = garde(lecteur(LOGGIA_SOMBRE));
  const carte = composer([11, 16, 27], [22, 29, 42, 0.62]);
  const lavisDe = (j) => { const t = lireCouleur('rgb(' + (o[j + '-rgb'] || LOGGIA_SOMBRE[j + '-rgb']) + ')') || lireCouleur(o[j] || LOGGIA_SOMBRE[j]); return composer(carte, [t[0], t[1], t[2], LAVIS_DENSE]); };
  const TESTEES = ['--o-warn', '--o-accent-soft', '--o-ok', '--o-cold', '--o-purple'];
  for (const ecrit of TESTEES) {
    const v = lireCouleur(o[ecrit + '-lavis']);
    assert.ok(v, ecrit + '-lavis est posé');
    // Une teinte peut écrire sur la carte d'une AUTRE teinte.
    // 0,03 de jeu : la couleur est arrondie à l'hexadécimal après le calcul.
    for (const fond of TESTEES) assert.ok(contraste(v, lavisDe(fond)) >= SEUILS.wcag - 0.03, ecrit + ' sur la carte ' + fond);
  }
  // Le rouge d'alerte et le rose : contre LEUR lavis seulement — tenus contre la
  // carte ambrée, ils tournaient au pastel.
  for (const vif of ['--o-bad', '--o-rose']) assert.ok(contraste(lireCouleur(o[vif + '-lavis']), lavisDe(vif)) >= SEUILS.wcag - 0.01, vif + ' sur son lavis');
  // Le vert d'état de Loggia tient déjà partout : sa variante EST la teinte.
  assert.equal(o['--o-ok'], undefined, 'la teinte du thème ne bouge pas');
  for (const j of ['--o-purple-lavis', '--o-bad-lavis', '--o-piece-vert-lavis']) assert.ok(JETONS_GARDE.includes(j), j + ' échapperait à la purge');
  // La feuille de style : la substitution sur les cartes teintées, et un défaut
  // qui rend la teinte elle-même tant que la garde n'est pas passée (mode sans
  // apparence, premier affichage) — sans lui, `var()` serait invalide et la
  // carte perdrait ses couleurs.
  assert.ok(css.includes('--o-purple: var(--o-purple-lavis);') && css.includes('--o-bad: var(--o-bad-lavis);'));
  assert.equal(css.split('--o-purple-lavis: var(--o-purple);').length - 1, 2, 'le défaut, dans :root et dans l’îlot sombre');
  // Jamais le compagnon « r,g,b » : c'est lui qui teinte la carte elle-même.
  assert.ok(!/--o-[a-z-]+-rgb: var\(--o-(?!text3)[a-z-]+-lavis/.test(css), 'un compagnon r,g,b est substitué : la carte changerait de teinte');
  assert.ok(css.includes('[style*="background: rgba(var(--o-"]'), 'les pastilles à fond teinté suivent la règle');
  // Le texte principal aussi : inchangé dans Loggia, rattrapé dans une palette terne.
  assert.equal(o['--o-text-lavis'], '#eaf0fb', 'le texte de Loggia tient déjà : sa variante est lui-même');
  const terne = garde(lecteur({ '--o-bg': '#21252b', '--o-surfA': 'rgba(47,52,62,.62)', '--o-surfB': 'rgba(40,44,52,.62)', '--o-text': '#abb2bf', '--o-text1': '#9da5b4', '--o-text2': '#7f848e', '--o-text3': '#7f848e', '--o-accent': '#61afef', '--o-accent-soft': '#61afef', '--o-lampe': '#e5c07b', '--o-lampe-rgb': '229,192,123' }));
  const carteTerne = composer(composer([33, 37, 43], [47, 52, 62, 0.62]), [229, 192, 123, LAVIS_DENSE]);
  for (const j of ['--o-text-lavis', '--o-text1-lavis']) assert.ok(contraste(lireCouleur(terne[j]), carteTerne) >= SEUILS.wcag - 0.03, j + ' sur la carte d’une lampe, One Dark Pro');
  assert.ok(css.includes('--o-text: var(--o-text-lavis); --o-text1: var(--o-text1-lavis);') && css.includes('--o-text-lavis: var(--o-text); --o-text1-lavis: var(--o-text1);'));
});

test('une palette venue d’ailleurs est rattrapée, sans perdre sa couleur', () => {
  // One Dark Pro : le gris « muted » de l'éditeur tombe à 3,4:1 sur ses cartes.
  const un = { '--o-bg': '#21252b', '--o-bggrad': 'linear-gradient(170deg,#23272e,#1d2025)', '--o-surfA': 'rgba(47,52,62,.62)', '--o-surfB': 'rgba(40,44,52,.62)', '--o-text': '#abb2bf', '--o-text2': '#7f848e', '--o-text3': '#7f848e', '--o-accent': '#61afef', '--o-accent-soft': '#61afef' };
  const o = garde(lecteur(un));
  const fondCarte = composer([33, 37, 43], [47, 52, 62, 0.62]);
  assert.ok(contraste(lireCouleur(o['--o-text2']), fondCarte) >= SEUILS.text2, 'le gris secondaire passe le seuil');
  assert.ok(contraste(lireCouleur(o['--o-text3']), fondCarte) >= SEUILS.text3);
  // Neumorphix : accent turquoise clair — le blanc ne tenait pas dessus (2,4:1).
  const neu = { '--o-bg': '#1e2128', '--o-surfA': 'rgba(44,50,62,.62)', '--o-surfB': 'rgba(38,43,53,.62)', '--o-text': '#e2e8f0', '--o-text2': '#94a3b8', '--o-text3': '#94a3b8', '--o-accent': '#5de0d8', '--o-accent-soft': '#5de0d8' };
  const n = garde(lecteur(neu));
  assert.ok(contraste(lireCouleur(n['--o-accent-fond']), [255, 255, 255]) >= SEUILS.surAccent);
  // Atrium clair : le vert d'état garde son compagnon « r,g,b » vif pour les
  // points — mais un badge l'écrit : il rejoint la teinte lisible.
  const at = { '--o-bg': '#f2f4f7', '--o-surfA': 'rgba(255,255,255,.62)', '--o-surfB': 'rgba(255,255,255,.62)', '--o-text': '#101828', '--o-text2': '#475467', '--o-text3': '#8a93a1', '--o-accent': '#5b8cff', '--o-accent-soft': '#1d55c9', '--o-ok': '#15803d', '--o-ok-rgb': '34,197,94' };
  const a = garde(lecteur(at));
  assert.ok(a['--o-ok-rgb'], 'le compagnon illisible est aligné');
  assert.ok(contraste(lireCouleur('rgb(' + a['--o-ok-rgb'] + ')'), [255, 255, 255]) >= SEUILS.teinte);
  assert.ok(contraste(lireCouleur(a['--o-text3']), [255, 255, 255]) >= SEUILS.text3, 'le gris tertiaire d’Atrium clair');
});

test('une carte plate se détache de la page — mais seulement faute de filet', () => {
  // Neumorphix clair : ni filet (`--o-bw` à 0) ni ombre sur ces blocs ; la
  // carte se confondait avec la page (1,06:1).
  const plat = { '--o-bg': '#e8eaf0', '--o-surfA': 'rgba(238,240,246,.62)', '--o-surfB': 'rgba(238,240,246,.62)', '--o-text': '#2c2f3a', '--o-text2': '#606470', '--o-text3': '#606470', '--o-accent': '#6c7ae0', '--o-accent-soft': '#5563cc', '--o-bw': '0px' };
  const o = garde(lecteur(plat));
  assert.ok(o['--o-surfA'], 'la surface s’écarte du fond');
  assert.ok(contraste(composer([232, 234, 240], lireCouleur(o['--o-surfA'])), [232, 234, 240]) >= SEUILS.carte);
  // Le même thème AVEC un filet : la carte se voit déjà, on n’y touche pas.
  const avecFilet = garde(lecteur({ ...plat, '--o-bw': '1px' }));
  assert.equal(avecFilet['--o-surfA'], undefined, 'un trait d’un pixel suffit');
});

test('la garde est branchée, purgée, et les thèmes sans ombre gardent un filet', () => {
  assert.ok(src.includes("import { garde, JETONS_GARDE, lisibleSurLavis } from './contraste.js';"), 'le module est importé');
  // La couleur vraie d'une ampoule habille sa carte ; l'icône prend la lisible.
  assert.ok(src.includes('const accentLu = (rgb && color) ? lisibleSurLavis(color, estClair(), .7) : accent;'), 'la carte lumière d’une pièce');
  assert.ok(src.includes("const teinteLu = rgbHex ? lisibleSurLavis(rgbHex, estClair(), .28) : teinte;"), 'la carte compacte');
  assert.ok(src.includes('const corrige = garde(t => csFinal.getPropertyValue(t).trim());') && src.includes('Object.keys(corrige).forEach(k => root.style.setProperty(k, corrige[k]));'), 'applyLook pose ce que la garde rend');
  assert.ok(src.includes('JETONS_GARDE.forEach(k => root.style.removeProperty(k));'), 'applyTheme les purge : la correction d’un thème ne suit pas au suivant');
  // La surface lue est celle DU thème (le bogue : elle était retirée avant d'être lue).
  assert.ok(src.includes('const brut = getComputedStyle(root).getPropertyValue(token).trim();'), 'la surface du thème est lue avant d’être retouchée');
  // Atrium : le filet, porté par l'ombre, faute de bordure.
  assert.ok(src.includes("shadow: '0 0 0 1px rgba(255,255,255,.085)'") && src.includes("shadow: '0 0 0 1px rgba(16,24,40,.14)'"), 'Atrium garde son filet d’un pixel');
  assert.ok(src.includes("'--o-shadow-hover', '--o-shadow-rangee',"), 'le jeton de la rangée se purge aussi');
  // La rangée des scénarios : une ombre courte, contenue par le rembourrage.
  assert.ok(css.includes('.grid-qscenes > button { box-shadow: var(--o-shadow-rangee, 0 1px 2px rgba(0,0,0,.16), 0 3px 8px rgba(0,0,0,.12)) !important; }'), 'l’ombre courte de la rangée');
  assert.ok(css.includes('--o-rose-fond:#e01f63; --o-purple-fond:#7c5ce0;'), 'le repli des fonds du bouton de l’assistant');
  // Tout ce que la garde peut poser doit être purgeable.
  for (const cle of Object.keys(garde(lecteur(LOGGIA_SOMBRE)))) assert.ok(JETONS_GARDE.includes(cle), cle + ' manque à JETONS_GARDE');
});
