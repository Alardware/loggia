// ─────────────────────────────────────────────────
// Retirer un profil ne décale plus les réglages des suivants (audit du 12/11,
// lot 3, B11 ; ADR 0365).
//
// Les réglages d'un profil sont rangés sous son RANG dans la liste. Retirer le
// profil de rang 1 ne retirait que son nom : le profil de rang 2 passait au
// rang 1 et lisait les favoris, le menu et le thème du profil retiré ; les
// siens restaient orphelins au rang 2, et le prochain profil créé en héritait.
// Tout descend maintenant d'un cran avec la liste, dans UN seul envoi.
//
// Le côté serveur (une fiche d'écran ne change pas de propriétaire quand un
// administrateur la renumérote) : tests/python/test_appareils.py.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
// La langue AVANT l'import, comme les autres suites qui chargent src/.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const S = await import('../src/state.js');

const M = '__profils';
const ADMIN = { name: 'Admin', role: 'Admin' };
const UN = { name: 'Profil un', role: 'Famille' };
const DEUX = { name: 'Profil deux', role: 'Famille', haId: 'compte-deux' };
const TROIS = [ADMIN, UN, DEUX];

// ── La valeur d'un réglage, une fois un rang retiré ──────────────────────────

test('B11 — la part du profil retiré s’en va, les suivantes descendent d’un cran, la commune reste', () => {
  const v = { [M]: { 0: ['a'], 1: ['b'], 2: ['c'], 3: ['d'], '*': ['commun'] } };
  assert.deepEqual(S.partsSansProfil(v, 1), { [M]: { 0: ['a'], 1: ['c'], 2: ['d'], '*': ['commun'] } });
  // Le dernier rang : rien ne descend, aucune part orpheline ne reste.
  assert.deepEqual(S.partsSansProfil(v, 3), { [M]: { 0: ['a'], 1: ['b'], 2: ['c'], '*': ['commun'] } });
  // Un profil qui n'avait rien rangé : les autres descendent quand même.
  assert.deepEqual(S.partsSansProfil({ [M]: { 0: ['a'], 2: ['c'] } }, 1), { [M]: { 0: ['a'], 1: ['c'] } });
  // Plus rien : la clé s'efface.
  assert.equal(S.partsSansProfil({ [M]: { 1: ['b'] } }, 1), null);
  // Une valeur d'avant la bascule est commune à tous : elle ne bouge pas. Rien du tout reste rien.
  assert.deepEqual(S.partsSansProfil({ pc: ['meteo'] }, 1), { pc: ['meteo'] });
  assert.equal(S.partsSansProfil(null, 1), null);
  // La valeur d'origine n'est pas modifiée.
  assert.deepEqual(v[M][1], ['b']);
});

test('B11 — le menu : la part commune n’échoit qu’au premier profil, et s’en va avec lui', () => {
  // Retirer un AUTRE profil ne touche pas la part commune du menu.
  assert.deepEqual(S.partsSansProfil({ [M]: { '*': ['energie'], 1: ['climat'] } }, 1, true), { [M]: { '*': ['energie'] } });
  // Retirer le PREMIER : sans cela, le profil qui prend sa place hériterait de son menu.
  assert.deepEqual(S.partsSansProfil({ [M]: { '*': ['energie'], 1: ['climat'] } }, 0, true), { [M]: { 0: ['climat'] } });
  assert.equal(S.partsSansProfil(['energie'], 0, true), null, 'le menu d’avant la bascule appartenait au premier profil');
  assert.deepEqual(S.partsSansProfil(['energie'], 2, true), ['energie']);
  // Une disposition, elle, s'hérite : sa part commune reste.
  assert.deepEqual(S.partsSansProfil({ [M]: { '*': { pc: [] }, 1: { pc: ['x'] } } }, 0), { [M]: { '*': { pc: [] }, 0: { pc: ['x'] } } });
});

// ── La fiche d'un écran, et le profil qu'un écran affiche ────────────────────

test('B11 — la fiche d’un écran suit son profil : un rang supérieur descend, le profil retiré passe au premier non Admin', () => {
  const apres = [ADMIN, DEUX];
  assert.equal(S.rangApresRetrait('2', 1, apres), '1', 'l’écran du profil suivant reste sur l’ancien rang');
  assert.equal(S.rangApresRetrait('0', 1, apres), null, 'un rang inférieur ne change pas');
  // L'écran qui affichait le profil retiré : le premier profil qui n'est pas Admin (ici le rang 1, déjà le sien : rien à écrire).
  assert.equal(S.rangApresRetrait('1', 1, apres), null);
  assert.equal(S.rangApresRetrait('3', 3, [ADMIN, UN, DEUX]), '1');
  // Que des Admin : le premier.
  assert.equal(S.rangApresRetrait('1', 1, [ADMIN]), '0');
  // Une fiche sans profil lisible n'est pas touchée.
  assert.equal(S.rangApresRetrait(undefined, 1, apres), null);
  assert.equal(S.rangApresRetrait('admin', 1, apres), null);
});

test('B11 — sur un autre écran, le profil affiché se retrouve dans la liste d’après', () => {
  // Un profil retiré AVANT le sien : son rang descend.
  assert.equal(S.rangDuProfil(TROIS, 2, [ADMIN, DEUX]), 1);
  // Retrouvé par son compte Home Assistant, même renommé entre-temps.
  assert.equal(S.rangDuProfil(TROIS, 2, [ADMIN, { ...DEUX, name: 'Renommé' }]), 1);
  // Un profil retiré APRÈS le sien : rien ne bouge.
  assert.equal(S.rangDuProfil(TROIS, 1, [ADMIN, UN]), 1);
  // SON profil a été retiré : le premier qui n'est pas Admin.
  assert.equal(S.rangDuProfil(TROIS, 1, [ADMIN, DEUX]), 1);
  assert.equal(S.rangDuProfil([ADMIN, UN], 1, [ADMIN]), 0);
  // La liste n'a pas raccourci : un profil retouché sur place garde son rang, un profil ajouté ne déplace personne.
  assert.equal(S.rangDuProfil(TROIS, 1, [ADMIN, { ...UN, name: 'Autre nom' }, DEUX]), 1);
  assert.equal(S.rangDuProfil([ADMIN, UN], 1, [ADMIN, UN, DEUX]), 1);
  assert.equal(S.rangDuProfil(TROIS, 2, []), 0);
});

// ── Le retrait, de bout en bout ──────────────────────────────────────────────

const maison = () => ({
  loggia_users: TROIS,
  loggia_epingles: { [M]: { 0: ['a-admin'], 1: ['b-un'], 2: ['c-deux'] } },
  loggia_apparence: { [M]: { 1: { theme: 'saphir' }, 2: { theme: 'givre', appareils: { ecrandeux001: { mode: 'dark' } } } } },
  'loggia-shownviews': { [M]: { 0: ['lumieres'], 1: ['climat'], 2: ['medias'] } },
  loggia_accueil: { pc: ['meteo'] },        // d'avant la bascule : commune à tous
  loggia_rooms: [{ room: 'Séjour' }],       // de la maison, pas d'un profil
  loggia_appareils: { ecranadmin01: { profil: '0', nom: 'Bureau' }, ecranun00001: { profil: '1' }, ecrandeux001: { profil: '2', format: 'tablette' } },
});

test('B11 — retirer le profil de rang 1 : UN seul envoi, où tout descend d’un cran', async () => {
  const envois = [];
  S.setLoggiaState({ cfg: maison(), server: true, profil: '0', save: (lot) => { envois.push(lot); return true; } });
  const issue = await S.retirerProfil(1, [ADMIN, DEUX]);
  assert.equal(issue, true);
  assert.equal(envois.length, 1, 'la liste et la renumérotation ne partent pas ensemble');
  const lot = envois[0];
  assert.deepEqual(lot.loggia_users, [ADMIN, DEUX]);
  // Le profil « deux » retrouve SES favoris, son thème (et l'apparence propre à son écran), son menu.
  assert.deepEqual(lot.loggia_epingles, { [M]: { 0: ['a-admin'], 1: ['c-deux'] } });
  assert.deepEqual(lot.loggia_apparence, { [M]: { 1: { theme: 'givre', appareils: { ecrandeux001: { mode: 'dark' } } } } });
  assert.deepEqual(lot['loggia-shownviews'], { [M]: { 0: ['lumieres'], 1: ['medias'] } });
  // Ce qui n'est pas rangé par rang ne part pas.
  assert.ok(!('loggia_accueil' in lot) && !('loggia_rooms' in lot));
  // Les fiches : seule celle qui change part, et seulement son rang — le composant la fusionne.
  assert.deepEqual(lot.loggia_appareils, { ecrandeux001: { profil: '1' } });
  // À l'écran tout de suite : la liste entière des fiches, les autres champs intacts.
  assert.deepEqual(S.LOGGIA_CFG.loggia_appareils, { ecranadmin01: { profil: '0', nom: 'Bureau' }, ecranun00001: { profil: '1' }, ecrandeux001: { profil: '1', format: 'tablette' } });
  // Ce que chacun LIT ensuite : le profil « deux », passé au rang 1, voit ses favoris — plus ceux du profil retiré.
  S.setLoggiaState({ profil: '1' });
  assert.deepEqual(S.cfgVal('loggia_epingles', null), ['c-deux'], 'le profil suivant a hérité des favoris du profil retiré');
  // Aucune part orpheline : un profil créé plus tard au rang 2 n'héritera de rien.
  assert.deepEqual(Object.keys(S.LOGGIA_CFG.loggia_epingles[M]).sort(), ['0', '1']);
});

test('B11 — retirer le premier profil : le menu commun ne passe pas au suivant ; sans composant, pas de fiche', async () => {
  const envois = [];
  const cfg = { loggia_users: [ADMIN, { ...ADMIN, name: 'Second admin' }, UN], 'loggia-hiddenviews': ['energie'],
    'loggia-vueordre': { [M]: { '*': ['a', 'b'], 1: ['b', 'a'] } }, loggia_scnordre: { [M]: { 0: ['x'], 2: ['z'] } },
    loggia_appareils: { ecranun00001: { profil: '2' } } };
  S.setLoggiaState({ cfg, server: false, profil: '0', save: (lot) => { envois.push(lot); return true; } });
  await S.retirerProfil(0, cfg.loggia_users.slice(1));
  const lot = envois[0];
  assert.equal(lot['loggia-hiddenviews'], null, 'le menu d’avant la bascule est passé au profil suivant');
  assert.deepEqual(lot['loggia-vueordre'], { [M]: { 0: ['b', 'a'] } });
  assert.deepEqual(lot.loggia_scnordre, { [M]: { 1: ['z'] } });
  assert.ok(!('loggia_appareils' in lot), 'sans composant, aucune fiche ne part');
  assert.ok(!('loggia-hiddenviews' in S.LOGGIA_CFG), 'une clé effacée reste dans le cache');
});

// ── Le branchement ───────────────────────────────────────────────────────────

test('B11 — la suppression d’un profil passe par la renumérotation, et un autre écran suit son profil', () => {
  assert.ok(MONOLITHE.includes('const a = users.filter((_, j) => j !== i); retirerUnProfil(i, a);'), 'la suppression n’envoie que la liste');
  assert.ok(MONOLITHE.includes('const retirerUnProfil = (i, a) => { try { retirerProfil(i, a); } catch {} setUsers(a); };'));
  assert.ok(MONOLITHE.includes('const rang = rangDuProfil(users, userIdx, suite);') && MONOLITHE.includes('if (rang !== userIdx) setUserIdx(rang);'),
    'un écran resté allumé garde un rang qui ne veut plus rien dire');
});
