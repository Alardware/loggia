// ─────────────────────────────────────────────────────────────────────────────
// L'énergie n'invente plus de zéros (audit du 03/10).
//
// Une seule cause, plusieurs écrans : une entité muette lue comme 0.
//
//   — la vue Énergie : un Linky indisponible valait 0 kWh consommés, le
//     garde-fou de l'autosuffisance ne jouait jamais, et 6,2 kWh produits
//     faisaient « 100 % » ;
//   — son en-tête : « Consommation 0 W » au-dessus de chiffres qui, eux,
//     disaient « — » ; et son schéma solaire, « 0 W » sur la maison et
//     « ↓ 0 W » sur le pylône, juste au-dessus des mêmes « — » ;
//   — la bannière de l'Accueil : une maison sans compteur voyait
//     « ↓ 0 W IMPORT RÉSEAU » en permanence ; et la carte « Énergie maison »
//     annonçait « Solaire 100 % » dès que le compteur réseau se taisait.
//
// Règle du zéro (ADR 0030) : ce qui ne se lit pas s'affiche « — » ou
// n'apparaît pas — mais un zéro LU reste un zéro. Les calculs se vérifient à
// sec (src/bilan.js) ; le branchement se relit, commentaires ôtés : ils
// citent l'ancien code.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// `i18n.js` résout sa langue à l'import : la fixer AVANT (règle du dépôt).
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { consoJourKwh, autosuffisance, resumeEnergie } = await import('../src/bilan.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8').replace(/\r\n/g, '\n');

/** Le CODE d'une fonction d'App.jsx, sans ses commentaires. */
const code = (debut) => {
  const i = APP.indexOf(debut);
  assert.notEqual(i, -1, debut + ' introuvable');
  return APP.slice(i, APP.indexOf('\nfunction ', i + 1))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
};

test('le total du jour : un compteur lisible, sinon rien — jamais 0 kWh par défaut', () => {
  assert.equal(consoJourKwh({ jour: 7.5, hc: 3, hp: 2, reseau: 9 }), 7.5, 'le compteur du jour fait foi');
  assert.equal(consoJourKwh({ jour: 0, hc: 3, hp: 2 }), 0, 'même à zéro, s’il est LU');
  assert.equal(consoJourKwh({ hc: 3.5, hp: 2.25, reseau: 9 }), 5.75, 'sinon heures creuses + heures pleines');
  assert.equal(consoJourKwh({ hc: 3.5, hp: null }), 3.5, 'un seul index lisible suffit, comme avant');
  assert.equal(consoJourKwh({ hc: 0, hp: 0, reseau: 4 }), 4, 'une somme nulle cède au total réseau, comme avant');
  assert.equal(consoJourKwh({ reseau: 4 }), 4);
  assert.equal(consoJourKwh({ hc: 0, hp: 0 }), 0, 'un zéro LU reste un zéro');
  assert.equal(consoJourKwh({ reseau: 0 }), 0, 'un zéro LU reste un zéro');
  // Le Linky indisponible : tout est muet.
  assert.equal(consoJourKwh({ jour: null, hc: null, hp: null, reseau: null }), null, 'aucun compteur ne répond : pas de total, pas 0 kWh');
  assert.equal(consoJourKwh({}), null);
  assert.equal(consoJourKwh(), null);
  assert.equal(consoJourKwh({ jour: NaN, hc: undefined, reseau: Infinity }), null, 'NaN ou l’infini ne se lisent pas');
});

test('l’autosuffisance : pas de cadran sans production ET consommation lisibles', () => {
  // Le cas de l'audit : 6,2 kWh produits, Linky muet. C'était 100 %.
  assert.equal(autosuffisance(6.2, consoJourKwh({})), null, '6,2 kWh produits et un compteur muet ne font pas 100 %');
  assert.equal(autosuffisance(6.2, null), null);
  assert.equal(autosuffisance(null, 5), null, 'sans production lisible non plus');
  assert.equal(autosuffisance(4, 4, 1), 43, '3 kWh de solaire consommés sur 7 au total');
  assert.equal(autosuffisance(4, 4), 50, 'sans injection lisible, tout le solaire compte comme consommé — comme avant');
  assert.equal(autosuffisance(6, 0), 100, 'rien acheté au réseau, LU au compteur : 100 % est vrai');
  assert.equal(autosuffisance(2, 3, 5), 0, 'plus d’injection que de production : rien de consommé');
  assert.equal(autosuffisance(0, 0), null, 'une journée vide n’a pas de taux');
});

test('l’en-tête de la vue Énergie ne dit que ce qui se lit', () => {
  assert.equal(resumeEnergie({ conso: 640, solaire: 0, reseau: 640 }), 'Consommation 640 W · production solaire 0 W · réseau 640 W', 'un solaire LU à 0 W se dit');
  assert.equal(resumeEnergie({ conso: null, solaire: 320, reseau: 250 }), 'Production solaire 320 W · réseau 250 W', 'la consommation muette part, et la ligne garde sa majuscule');
  assert.equal(resumeEnergie({ reseau: 250 }), 'Réseau 250 W');
  assert.equal(resumeEnergie({ conso: null, solaire: NaN, reseau: undefined }), '', 'rien de lisible : pas de ligne');
  assert.equal(resumeEnergie(), '');
});

test('le branchement de la vue Énergie : ses chiffres muets ne valent plus 0', () => {
  assert.ok(APP.includes("import { consoJourKwh, autosuffisance, resumeEnergie } from './bilan.js';"), 'App n’importe plus le bilan');
  const en = code('function EnergieContent(');
  assert.ok(!en.includes('(hcToday + hpToday) ||'), 'la somme des index muets revaut 0 kWh');
  assert.ok(en.includes('const totalToday = consoJourKwh({'), 'le total du jour ne passe plus par consoJourKwh');
  assert.ok(en.includes('numKwh(EN.consoHcToday, null)') && en.includes('numKwh(EN.consoHpToday, null)') && en.includes('reseau: numKwh(EN.consoReseauToday, null)'),
    'un index muet doit arriver null, pas 0');
  assert.ok(en.includes('autosuffisance(prodJour, totalToday, injJour, injectionMuette)'), 'l’autosuffisance se recalcule dans la vue');
  assert.ok(!en.includes("tr('Consommation') + ' ' + fmtW(consoW)"), 'l’en-tête revient bâti sur des 0 W');
  assert.ok(en.includes('{ligneEnTete && <div'), 'sans rien de lisible, la ligne d’en-tête doit disparaître');
  assert.ok(en.includes('{consoLue ? <Num v={consoW}'), 'le chiffre « Conso maison » et l’en-tête doivent suivre la même condition');
  assert.ok(en.includes('{reseauLu && <span') && en.includes("tr('PAS DE SURPLUS')"), '« PAS DE SURPLUS » sans compteur affirme ce que rien ne mesure');
  // Le schéma solaire, juste au-dessus des chiffres : mêmes conditions.
  assert.ok(en.includes('gridW={consoAvail || exporting ? importW : null}') && en.includes('homeW={consoLue ? consoW : null}'),
    'le schéma solaire reçoit encore des 0 W pour un compteur muet');
  const arc = code('function SunArc(');
  assert.ok(arc.includes('{homeW != null && <Chip icon="house"'), 'la pastille de la maison affiche « 0 W » sans compteur');
  assert.ok(arc.includes('{gridW != null && <Chip icon="pylon"'), 'le pylône affiche « ↓ 0 W » sans compteur');
});

test('le branchement de l’Accueil et de la carte Énergie : sans compteur, ni tuile réseau ni « Solaire 100 % »', () => {
  const acc = code('function deriveAccueil(');
  assert.ok(acc.includes('metricExport: gridVal == null ? null : {'), 'la tuile réseau doit disparaître quand rien ne se lit');
  assert.ok(!/raw: [^,]*\|\| 0/.test(acc), 'le `|| 0` repasse sous le « — » de Num');
  assert.ok(!acc.includes('? 100 : 0)'), 'l’autosuffisance de l’Accueil réinvente 100 % ou 0 %');
  assert.ok(APP.includes('if (!a || a.metricExport) cases.push('), 'la bannière doit tester la tuile, pour qu’un null la retire');
  const carte = code('function CvEnergie(');
  assert.ok(!carte.includes('grid || 0'), 'un compteur muet refait du solaire toute la maison');
  assert.ok(carte.includes('const maison = grid != null ?'), 'sans compteur réseau, la consommation de la maison est inconnue');
  assert.ok(carte.includes('maison != null ? 100 - (part || 0) : 0'), 'la barre se peint en réseau sur une maison inconnue');
});

/* Relecture du 03/10 : un compteur CONFIGURÉ qui se tait n'est pas un compteur
 * absent. Une moitié muette ne doit plus produire un pourcentage faux. */
test('une injection configurée mais muette ne vaut pas zéro : pas de cadran', () => {
  // 10 kWh produits, 5 achetés ; l'injection (7 kWh en vrai) ne répond pas.
  assert.equal(autosuffisance(10, 5, null, true), null, '67 % s’affichait au lieu de rien (37 % en vrai)');
  assert.equal(autosuffisance(10, 5, null), 67, 'une injection JAMAIS configurée garde le calcul d’avant');
});

test('un index HC/HP configuré mais muet ne s’additionne pas', () => {
  assert.equal(consoJourKwh({ hc: 2, hp: null, hpMuet: true }), null, 'heures pleines muettes : 2 kWh passaient pour la journée entière');
  assert.equal(consoJourKwh({ hc: 2, hp: null, hpMuet: true, reseau: 10 }), 10, 'le total réseau prend le relais');
  assert.equal(consoJourKwh({ hc: 2, hp: null }), 2, 'un seul index, l’autre jamais configuré : inchangé');
});

test('le branchement : la vue Énergie dit « configuré mais muet »', () => {
  const en = code('function EnergieContent(');
  assert.ok(en.includes('const injectionMuette = !!EN.injectionJour && injJour == null;'));
  assert.ok(en.includes('autosuffisance(prodJour, totalToday, injJour, injectionMuette)'));
  assert.ok(en.includes('if (fossilePct == null || totalToday == null || injectionMuette) return null;'), 'la part bas-carbone aussi');
  assert.ok(en.includes('hcMuet, hpMuet });'));
});

test("l’achat au réseau ne se dit qu’au compteur : un capteur de surplus seul ne l’invente pas", () => {
  // Relecture du 03/10 : la nuit, sans surplus, « réseau 0 W » et « ↓ 0 W »
  // s’affichaient alors que rien n’avait mesuré l’achat.
  const en = code('function EnergieContent(');
  assert.ok(en.includes('const sensLu = exporting ? reseauLu : consoAvail;'));
  assert.ok(en.includes('reseau: sensLu ? gridNetW : null,'), 'l’en-tête');
  assert.ok(en.includes(`{sensLu ? <Num v={exporting ? surplusW : importW} suffix=" W" /> : '—'}`), 'le chiffre « Achat réseau »');
});

test('la notification « Surplus solaire » ne lit qu’une puissance, jamais l’index cumulé', () => {
  // Relecture du 03/10 : l’index d’export (850 kWh) passait le seuil de 100 W
  // en permanence, la nuit comprise.
  const n = code('function deriveNotifs(');
  assert.ok(n.includes('const net = wattsOf(EH.consoNow);'));
  assert.ok(n.includes('const sur = net != null ? Math.max(0, -net) : wattsOf(EH.injectionNow || EH.surplusNow);'));
  assert.ok(!n.includes('injectionJour'), 'un compteur d’énergie comparé à un seuil en watts');
});

test('la tuile Énergie garde le signe du réseau : un compteur net à l’export ne double plus la maison', () => {
  const c = code('function CvEnergie(');
  assert.ok(c.includes('const maison = grid != null ? Math.max(0, Math.round((sol || 0) + grid)) : null;'),
    'solaire 3000 W et réseau −2000 W faisaient une maison à 3000 W au lieu de 1000');
});
