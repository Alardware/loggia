// ─────────────────────────────────────────────────────────────────────────────
// La disposition des cartes suit le type d'écran ; le contenu suit la maison.
//
// Retour du 18/09 : « sur mobile, si je modifie, ça modifie sur PC, et si je
// modifie sur PC ça modifie sur mobile. Ça ne me va pas : chaque appareil a sa
// propre disposition, seul l'ajout ou modification, suppression d'entité,
// carte se synchronise. » Ces tests rejouent ce qu'il a fait.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatEcran, vueFormat, patchFormat, possede, sansPart, grilleDuFormat, poserGrille, echangerPartout, CLES_DISPOSITION, ordonnerSelon, ordreDuFormat, vuePiecesDe, poserVuePieces } from '../src/disposition.js';
import { VUES_SORTIES } from './monolithe.mjs'; // App.jsx + les vues sorties du boot (ADR 0274)

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = (readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8') + readFileSync(join(RACINE, 'src', 'views', 'voletsplan.jsx'), 'utf8') + VUES_SORTIES); // App.jsx + la vue « modes et planning », chargée à la demande depuis le 19/10 (borne du boot).

// Ce que fait `setLayout` d'un patch : une valeur nulle efface la clé.
const ecrire = (L, patch) => {
  const n = { ...L };
  Object.keys(patch).forEach(k => { if (patch[k] == null) delete n[k]; else n[k] = patch[k]; });
  return n;
};
// L'éditeur : chaque écriture passe par `patchFormat`, comme dans `write`.
const geste = (L, format, patch) => ecrire(L, patchFormat(L, format, patch));

const MAISON = { order: ['lampe', 'volet', 'prise'], larges: ['volet'], labels: { lampe: 'Plafonnier' } };

test('le format : la souris fait l’ordinateur, le doigt la tablette ou le téléphone', () => {
  assert.equal(formatEcran(false, true), 'pc');
  assert.equal(formatEcran(false, false), 'pc');
  assert.equal(formatEcran(true, true), 'tablette');
  assert.equal(formatEcran(true, false), 'mobile');
  assert.deepEqual(CLES_DISPOSITION, ['order', 'larges', 'compacts']);
});

test('ranger sur le téléphone ne dérange pas l’ordinateur, et inversement', () => {
  let L = geste(MAISON, 'mobile', { order: ['prise', 'lampe', 'volet'] });
  assert.deepEqual(vueFormat(L, 'mobile').order, ['prise', 'lampe', 'volet']);
  assert.deepEqual(vueFormat(L, 'pc').order, ['lampe', 'volet', 'prise'], 'l’ordinateur a bougé');
  L = geste(L, 'pc', { order: ['volet', 'prise', 'lampe'] });
  assert.deepEqual(vueFormat(L, 'mobile').order, ['prise', 'lampe', 'volet'], 'le téléphone a bougé');
  // La taille aussi : compacte sur le téléphone, standard sur l'ordinateur.
  L = geste(L, 'mobile', { compacts: ['lampe'] });
  assert.deepEqual(vueFormat(L, 'mobile').compacts, ['lampe']);
  assert.equal(vueFormat(L, 'pc').compacts, undefined);
});

test('ajouter, retirer, renommer : partout', () => {
  let L = geste(MAISON, 'mobile', { order: ['prise', 'lampe', 'volet'] });
  L = geste(L, 'mobile', { added: ['camera'], labels: { lampe: 'Suspension' } });
  for (const f of ['pc', 'tablette', 'mobile']) {
    assert.deepEqual(vueFormat(L, f).added, ['camera'], f + ' ne voit pas la carte ajoutée');
    assert.equal(vueFormat(L, f).labels.lampe, 'Suspension', f + ' ne voit pas le nouveau nom');
  }
  L = geste(L, 'pc', { removed: ['prise'] });
  assert.deepEqual(vueFormat(L, 'mobile').removed, ['prise'], 'le retrait ne suit pas');
});

test('un format qui n’a rien rangé suit l’ordinateur ; sa première retouche n’écrit que ce qu’elle touche', () => {
  assert.deepEqual(vueFormat(MAISON, 'tablette'), MAISON, 'rien n’est dupliqué d’avance');
  const L = geste(MAISON, 'tablette', { compacts: ['prise'] });
  assert.deepEqual(L.formats.tablette, { compacts: ['prise'] }, 'la retouche a recopié l’ordinateur (ADR 0221)');
  const t = vueFormat(L, 'tablette');
  assert.deepEqual(t.order, ['lampe', 'volet', 'prise'], 'la tablette a perdu l’ordre qu’elle montrait');
  assert.deepEqual(t.larges, ['volet'], 'et la largeur');
  assert.deepEqual(t.compacts, ['prise']);
  assert.deepEqual(L.order, MAISON.order, 'les clés de l’ordinateur n’ont pas bougé');
});

// ── Ticket #34 : l'ordre retombait en alphabétique sur le téléphone (ADR 0221) ──

test('le scénario du ticket : une compacte au téléphone, puis l’ordinateur range, et le téléphone suit', () => {
  // Le téléphone passe une carte en compact avant que l'ordinateur ait un ordre.
  let L = geste({ labels: {} }, 'mobile', { compacts: ['salon'] });
  // L'ordinateur range ses pièces : Salon en premier.
  L = geste(L, 'pc', { order: ['salon', 'cuisine', 'bureau'] });
  assert.deepEqual(vueFormat(L, 'mobile').order, ['salon', 'cuisine', 'bureau'],
    'le téléphone ignore l’ordre de l’ordinateur : il retombe sur le tri par nom');
  assert.deepEqual(vueFormat(L, 'mobile').compacts, ['salon'], 'et garde sa compacte');
  // Plus tard, l'ordinateur réordonne : le téléphone suit encore.
  L = geste(L, 'pc', { order: ['cuisine', 'salon', 'bureau'] });
  assert.deepEqual(vueFormat(L, 'mobile').order, ['cuisine', 'salon', 'bureau'], 'le téléphone s’est figé sur une copie');
});

test('chaque réglage s’hérite seul ; le vide CHOISI ne réhérite pas', () => {
  const L0 = { order: ['a', 'b'], compacts: ['a'] };
  // Le téléphone retire la dernière compacte : l'éditeur écrit `null` (`vide`).
  const L = geste(L0, 'mobile', { compacts: null });
  assert.deepEqual(L.formats.mobile, { compacts: [] });
  assert.equal(vueFormat(L, 'mobile').compacts, undefined, 'la compacte de l’ordinateur est revenue');
  assert.deepEqual(vueFormat(L, 'mobile').order, ['a', 'b'], 'l’ordre a cessé d’hériter');
  assert.equal(possede(L, 'mobile', 'compacts'), true);
  assert.equal(possede(L, 'mobile', 'order'), false);
  assert.equal(possede(L, 'pc', 'order'), true);
});

test('« Toutes les cartes » : le contenu partout, et ce format revient à l’ordinateur', () => {
  let L = geste(MAISON, 'mobile', { order: ['prise', 'lampe'], compacts: ['lampe'] });
  L = geste(L, 'tablette', { order: ['volet', 'lampe', 'prise'] });
  // La remise à zéro de l'éditeur, depuis le téléphone : la part s'en va.
  L = ecrire(L, { removed: null, added: null, labels: null, types: null, ...sansPart(L, 'mobile') });
  assert.equal(L.labels, undefined, 'les noms reviennent partout');
  assert.equal(L.formats.mobile, undefined, 'le téléphone garde une part vide qui ne suivrait plus rien');
  assert.deepEqual(vueFormat(L, 'mobile').order, MAISON.order, 'le téléphone ne suit pas l’ordinateur');
  assert.deepEqual(vueFormat(L, 'tablette').order, ['volet', 'lampe', 'prise'], 'la tablette garde sa disposition');
  assert.deepEqual(vueFormat(L, 'pc').order, MAISON.order, 'l’ordinateur garde la sienne');
  // La dernière part partie, `formats` s'efface.
  assert.deepEqual(sansPart({ formats: { mobile: {} } }, 'mobile'), { formats: null });
  assert.deepEqual(sansPart(MAISON, 'pc'), {});
});

test('la grille de l’Accueil s’hérite clé par clé', () => {
  const pc = { main: ['meteo', 'pieces'], caches: ['cameras'], tailles: { Salon: 'c' } };
  // Retailler une tuile au téléphone ne recopie que les tailles.
  let acc = poserGrille(pc, 'mobile', { tailles: { Salon: 's' } });
  assert.deepEqual(acc.formats.mobile, { tailles: { Salon: 's' } });
  assert.deepEqual(grilleDuFormat(acc, 'mobile').main, ['meteo', 'pieces']);
  // L'ordinateur réordonne ses sections : le téléphone suit.
  acc = poserGrille(acc, 'pc', { main: ['pieces', 'meteo'] });
  assert.deepEqual(grilleDuFormat(acc, 'mobile').main, ['pieces', 'meteo']);
  assert.deepEqual(grilleDuFormat(acc, 'mobile').tailles, { Salon: 's' });
  // Un geste qui rend la grille ENTIÈRE ne fait pas passer l'héritage dans la part.
  const vue = grilleDuFormat(acc, 'mobile');
  acc = poserGrille(acc, 'mobile', { ...vue, caches: [] });
  assert.deepEqual(Object.keys(acc.formats.mobile).sort(), ['caches', 'tailles']);
  assert.equal(grilleDuFormat(acc, 'mobile').formats, undefined);
});

// ── Les appareils nommés (ADR 0222) : appareil → type d'écran → ordinateur ──

test('un appareil à part hérite de son format, qui hérite de l’ordinateur, réglage par réglage', () => {
  let L = geste({ order: ['a', 'b', 'c'] }, 'tablette', { compacts: ['a'] });
  // La tablette murale range SON ordre : la part va dans `appareils`.
  L = ecrire(L, patchFormat(L, 'tablette', { order: ['c', 'b', 'a'] }, 'cuisine0001'));
  assert.deepEqual(L.appareils.cuisine0001, { order: ['c', 'b', 'a'] });
  assert.equal(L.formats.tablette.order, undefined, 'l’appareil a écrit dans son format');
  const v = vueFormat(L, 'tablette', 'cuisine0001');
  assert.deepEqual(v.order, ['c', 'b', 'a']);
  assert.deepEqual(v.compacts, ['a'], 'l’appareil n’hérite plus de son format');
  // Les autres tablettes ne le voient pas.
  assert.deepEqual(vueFormat(L, 'tablette').order, ['a', 'b', 'c']);
  assert.equal(possede(L, 'tablette', 'order', 'cuisine0001'), true);
  assert.equal(possede(L, 'tablette', 'compacts', 'cuisine0001'), false);
  // Revenir : la part de l'appareil s'en va, celle du format reste.
  L = ecrire(L, sansPart(L, 'tablette', 'cuisine0001'));
  assert.equal(L.appareils, undefined);
  assert.deepEqual(L.formats.tablette, { compacts: ['a'] });
});

test('un ordinateur peut aussi avoir sa mise en page à part', () => {
  const L = ecrire({ order: ['a', 'b'] }, patchFormat({ order: ['a', 'b'] }, 'pc', { order: ['b', 'a'] }, 'bureau00001'));
  assert.deepEqual(L.order, ['a', 'b'], 'les clés historiques ont bougé');
  assert.deepEqual(vueFormat(L, 'pc', 'bureau00001').order, ['b', 'a']);
});

test('l’Accueil d’un appareil à part : sa grille par-dessus celle de son format', () => {
  let acc = poserGrille({ main: ['meteo', 'pieces'], caches: [] }, 'mobile', { caches: ['cameras'] });
  acc = poserGrille(acc, 'mobile', { tailles: { Salon: 's' } }, 'luna000001');
  assert.deepEqual(acc.appareils.luna000001, { tailles: { Salon: 's' } });
  const g = grilleDuFormat(acc, 'mobile', 'luna000001');
  assert.deepEqual(g.caches, ['cameras'], 'l’appareil n’hérite plus de son format');
  assert.deepEqual(g.main, ['meteo', 'pieces']);
  assert.equal(g.appareils, undefined);
  assert.deepEqual(grilleDuFormat(acc, 'mobile').tailles, undefined, 'les autres téléphones voient sa grille');
});

test('changer l’entité d’une carte la suit aussi chez les appareils', () => {
  const p = echangerPartout({ appareils: { x0000001: { order: ['lampe', 'volet'] } } }, 'lampe', 'suspension');
  assert.deepEqual(p.appareils.x0000001.order, ['suspension', 'volet']);
});

test('changer l’entité d’une carte lui garde sa place sur tous les formats', () => {
  const L = geste(MAISON, 'mobile', { order: ['prise', 'lampe', 'volet'], larges: ['lampe'] });
  const p = echangerPartout(L, 'lampe', 'suspension');
  assert.deepEqual(p.order, ['suspension', 'volet', 'prise']);
  assert.deepEqual(p.formats.mobile.order, ['prise', 'suspension', 'volet']);
  assert.deepEqual(p.formats.mobile.larges, ['suspension']);
  assert.deepEqual(echangerPartout({}, 'a', 'b'), {}, 'un agencement vide reste vide');
});

test('l’éditeur des vues passe par ces règles, et l’Accueil par le même format', () => {
  const h = app.slice(app.indexOf('function useLayoutEditor('), app.indexOf('\n}\n', app.indexOf('function useLayoutEditor(')));
  assert.ok(h.includes('const format = formatEcran(useCoarse(), useWide(1180));'));
  assert.ok(h.includes('const layout = vueFormat(layoutOf(cfgKey, scope), format, appareil);'), 'l’éditeur lit l’agencement de tous les formats à la fois');
  assert.ok(h.includes('setLayout(cfgKey, scope, patchFormat(layoutOf(cfgKey, scope), format, patch, appareil))'), 'une écriture de disposition partirait pour toute la maison');
  assert.ok(h.includes('const partout = echangerPartout(tout, id, cible);'));
  assert.ok(app.includes('const formatGrille = formatEcran(tactile, wide);'), 'l’Accueil et les vues ne découpent plus les écrans pareil');
  // ADR 0221 : retirer ou remplacer une carte ne recopie pas l'ordre hérité,
  // « Toutes les cartes » retire la part, l'Accueil s'hérite clé par clé.
  assert.equal(h.split("possede(layoutOf(cfgKey, scope), format, 'order', appareil)").length - 1, 1, 'retirer une carte fige l’ordre du téléphone');
  assert.ok(h.includes("possede(tout, format, 'order', appareil)"), 'remplacer une carte fige l’ordre du téléphone');
  assert.ok(h.includes('...sansPart(layoutOf(cfgKey, scope), format, appareil)'), '« Toutes les cartes » écrit des vides au lieu de suivre l’ordinateur');
  assert.ok(app.includes('const grille = grilleDuFormat(accL, formatGrille, appareilAcc);'));
  assert.ok(app.includes('saveAccL(poserGrille(accL, formatGrille, g, appareilAcc), avec)'), 'l’Accueil recopie encore la grille de l’ordinateur');
  // Les cinq vues rangeables passent par cet éditeur.
  for (const cle of ['ROOM_LAYOUT_KEY, room', "OBJ_LAYOUT_KEY, 'objets'", "'loggia_coverlayout', 'volets'", "EN_LAYOUT_KEY, 'energie'", "'loggia_seclayout', 'securite'"]) {
    assert.ok(app.includes('useLayoutEditor(' + cle), cle);
  }
});

// ── L'ordre des scénarios (« oui fais pareil pour l'ordre des scénarios ») ──

const SCN = [{ id: 'reveil' }, { id: 'je_pars' }, { id: 'bonne_nuit' }, { id: 'cinema' }];

test('les scénarios : l’ordinateur suit le composant, le téléphone son propre ordre', () => {
  const ordres = { mobile: ['cinema', 'reveil'] };
  assert.equal(ordreDuFormat(ordres, 'pc'), null, 'l’ordinateur garde l’ordre du composant');
  assert.equal(ordreDuFormat(ordres, 'tablette'), null, 'la tablette qui n’a rien rangé suit l’ordinateur');
  assert.deepEqual(ordreDuFormat(ordres, 'mobile'), ['cinema', 'reveil']);
  assert.equal(ordreDuFormat(null, 'mobile'), null);
  // Rangés sur le téléphone ; ceux qu'il n'a pas rangés suivent, dans l'ordre du composant.
  assert.deepEqual(ordonnerSelon(SCN, ordreDuFormat(ordres, 'mobile')).map(s => s.id), ['cinema', 'reveil', 'je_pars', 'bonne_nuit']);
  assert.deepEqual(ordonnerSelon(SCN, null).map(s => s.id), SCN.map(s => s.id), 'sans ordre propre, rien ne bouge');
  // Un scénario supprimé depuis n'est qu'un nom de trop dans l'ordre : rien ne casse.
  assert.deepEqual(ordonnerSelon(SCN, ['disparu', 'bonne_nuit']).map(s => s.id), ['bonne_nuit', 'reveil', 'je_pars', 'cinema']);
});

test('la vue et l’Accueil rangent les scénarios par type d’écran', () => {
  const h = app.slice(app.indexOf('function useScenarios('), app.indexOf('\n}\n', app.indexOf('function useScenarios(')));
  assert.ok(h.includes('const format = formatEcran(useCoarse(), useWide(1180));'));
  assert.ok(h.includes("const tous = ordonnerSelon((etat && etat.scenarios) || [], ordreDuFormat(ordres, format));"));
  // L'ordinateur range par la commande OUVERTE depuis l'audit du 03/10 (ADR 0125), plus par `enregistrer`, réservée.
  assert.ok(h.includes("if (format === 'pc') {") && h.includes('const r = await rangerScenarios(h, ids);') && !h.includes('enregistrer({ ordre: ids })') && h.includes('cfgSet({ loggia_scnordre: n });'), 'ranger sur le téléphone réécrirait l’ordre de l’ordinateur');
  assert.ok(h.includes('SCN_ETAT = { ...etat, scenarios: tous }'), 'la veille et la recherche garderaient l’ordre du composant');
  assert.ok(app.includes('const liste = scenariosAccueil(sc.tous);'), 'la rangée de l’Accueil');
  // Sans `catch` (audit du 03/10) : il avalait le refus d'un compte ordinaire.
  assert.ok(app.includes('sc.ordonner(ids);') && !app.includes('sc.ordonner(ids).catch') && !app.includes('sc.enregistrer({ ordre: ids })'), 'les flèches de la vue');
});

test('l’Accueil se souvient : cartes ou plan, par type d’écran', () => {
  /* « Pour l'accueil un réglage pourrait être bien pour afficher de préférence
   * soit les pièces soit le plan par défaut » (01/10). Le choix suit l'ÉCRAN,
   * comme le reste : un plan vaut sur un grand écran, beaucoup moins sur un
   * téléphone où l'on cherche une pièce du pouce. */
  assert.equal(vuePiecesDe(null, 'pc'), 'cartes', 'sans réglage, les cartes');
  assert.equal(vuePiecesDe({ pc: 'plan' }, 'pc'), 'plan');
  assert.equal(vuePiecesDe({ pc: 'plan' }, 'mobile'), 'cartes', 'le téléphone ne suit pas l’ordinateur');
  // Rien d'abime ne passe pour un choix.
  assert.equal(vuePiecesDe({ pc: 'carte' }, 'pc'), 'cartes');
  assert.equal(vuePiecesDe(['plan'], 'pc'), 'cartes');

  /* Une configuration ne garde que ce qui S'ÉCARTE du défaut : revenir aux
   * cartes efface l'entrée, et la dernière effacée efface l'objet. */
  assert.deepEqual(poserVuePieces(null, 'pc', 'plan'), { pc: 'plan' });
  assert.deepEqual(poserVuePieces({ pc: 'plan' }, 'mobile', 'plan'), { pc: 'plan', mobile: 'plan' });
  assert.deepEqual(poserVuePieces({ pc: 'plan', mobile: 'plan' }, 'mobile', 'cartes'), { pc: 'plan' });
  assert.equal(poserVuePieces({ pc: 'plan' }, 'pc', 'cartes'), null, 'plus rien à garder : la clé s’efface');
  assert.equal(poserVuePieces(null, 'pc', 'cartes'), null);
});
