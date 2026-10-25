// ─────────────────────────────────────────────────────────────────────────────
// Le profil appartient à l'ÉCRAN (ADR 0220, 17/10).
//
// « Sur la synchronisation il faudrait que ce soit comme pour une vraie app. »
//
// Un seul compte Home Assistant sur le PC et la tablette : changer de profil
// sur le PC changeait en silence celui de la tablette. Elle affichait encore
// « Luna » et rangeait déjà les cartes de Guillaume. Cette suite vérifie le
// COMPORTEMENT : deux écrans, un compte, et ce que chacun lit.
// ─────────────────────────────────────────────────────────────────────────────

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });

// Le stockage d'UN navigateur ; chaque test repart d'un écran vierge.
let stockage = {};
globalThis.localStorage = {
  getItem: (k) => (k in stockage ? stockage[k] : null),
  setItem: (k, v) => { stockage[k] = String(v); },
  removeItem: (k) => { delete stockage[k]; },
};

const S = await import('../src/state.js');

const PROFILS = [{ name: 'Guillaume', role: 'Admin' }, { name: 'Luna', role: 'Famille' }];
let envois = [];

beforeEach(() => {
  stockage = {};
  envois = [];
  S.setLoggiaState({ cfg: { loggia_users: PROFILS }, server: true, profil: null, save: (p) => { envois.push(p); return true; } });
});

test('ce que l’écran affiche décide de la part lue, pas le compte', () => {
  // Le PC du même compte vient de passer sur Guillaume : la clé du compte le dit.
  S.setLoggiaState({ cfg: { loggia_users: PROFILS, loggia_active_user: '0',
    loggia_accueil: { __profils: { 0: { pc: ['guillaume'] }, 1: { pc: ['luna'] } } } } });
  // La tablette, elle, affiche Luna.
  S.setLoggiaState({ profil: '1' });
  assert.equal(S.profilActif(), '1', 'la tablette suit le profil de l’ordinateur');
  assert.deepEqual(S.cfgVal('loggia_accueil', null), { pc: ['luna'] },
    'la tablette affiche Luna et lit la grille de Guillaume');
});

test('écrire range dans la part du profil affiché', () => {
  S.setLoggiaState({ cfg: { loggia_users: PROFILS, loggia_active_user: '0' }, profil: '1' });
  S.cfgSet({ loggia_accueil: { pc: ['meteo'] } });
  assert.deepEqual(Object.keys(S.LOGGIA_CFG.loggia_accueil.__profils), ['1']);
});

test('la fiche de l’appareil retrouve le profil au rechargement', () => {
  const id = S.appareilId();
  assert.match(id, /^[a-z0-9]{8,40}$/);
  assert.equal(S.appareilId(), id, 'l’identifiant change d’un appel à l’autre');
  S.setLoggiaState({ cfg: { loggia_users: PROFILS, loggia_active_user: '0',
    loggia_appareils: { [id]: { profil: '1' }, autre000001: { profil: '0' } } } });
  assert.equal(S.profilAppareil(), '1');
  assert.equal(S.profilActif(), '1', 'la clé du compte l’emporte sur la fiche de l’appareil');
});

test('retenir le profil n’envoie que SA fiche, et rien quand elle le dit déjà', async () => {
  const id = S.appareilId();
  S.setLoggiaState({ cfg: { loggia_users: PROFILS, loggia_appareils: { autre000001: { profil: '0' } } } });
  await S.retenirProfilAppareil(1);
  assert.deepEqual(envois, [{ loggia_appareils: { [id]: { profil: '1' } } }],
    'l’écran a envoyé la liste entière : il reprendrait les fiches des autres');
  assert.equal(S.LOGGIA_CFG.loggia_appareils.autre000001.profil, '0', 'la fiche d’un autre écran a disparu');
  await S.retenirProfilAppareil(1);
  assert.equal(envois.length, 1, 'la même fiche repart à chaque rendu');
});

test('sans composant, rien ne part', async () => {
  S.setLoggiaState({ server: false });
  assert.equal(await S.retenirProfilAppareil(1), null);
  assert.equal(envois.length, 0);
});

test('un rang hors liste ne fait pas lire la part d’un profil inexistant', () => {
  S.setLoggiaState({ profil: '7' });
  assert.equal(S.profilActif(), '0');
  S.setLoggiaState({ profil: null, cfg: { loggia_users: PROFILS, loggia_active_user: '9' } });
  assert.equal(S.profilActif(), '0');
});

// ── Les appareils nommés (ADR 0222) ──────────────────────────────────────────

test('le nom automatique se numérote s’il est déjà pris', () => {
  S.setLoggiaState({ cfg: { loggia_users: PROFILS, loggia_appareils: {
    aaaaaaaa1: { nom: 'Tablette' }, aaaaaaaa2: { nom: 'Tablette 2' }, aaaaaaaa3: {} } } });
  assert.equal(S.nomAutoAppareil('Tablette'), 'Tablette 3');
  assert.equal(S.nomAutoAppareil('Téléphone'), 'Téléphone');
});

test('un écran ne range à part que s’il l’a choisi', async () => {
  const id = S.appareilId();
  assert.equal(S.appareilPropre(), null);
  await S.poserFiche(id, { propre: true, nom: 'Tablette' });
  assert.equal(S.appareilPropre(), id);
  assert.deepEqual(envois.at(-1), { loggia_appareils: { [id]: { propre: true, nom: 'Tablette' } } });
  await S.poserFiche(id, { propre: false });
  assert.equal(S.appareilPropre(), null);
});

test('oublier un appareil n’envoie que sa place vide', async () => {
  S.setLoggiaState({ cfg: { loggia_users: PROFILS, loggia_appareils: { autre000001: { nom: 'Cuisine' } } } });
  await S.poserFiche('autre000001', null);
  assert.deepEqual(envois.at(-1), { loggia_appareils: { autre000001: null } });
  assert.deepEqual(S.appareilsConnus(), {});
});

test('reprendre un appareil connu change l’identifiant de cet écran', () => {
  assert.equal(S.adopterAppareil('cuisine0001'), true);
  assert.equal(S.appareilId(), 'cuisine0001');
  assert.equal(S.adopterAppareil('../piege'), false, 'un identifiant mal formé est accepté');
});

// ── L'apparence suit le profil, un écran peut avoir la sienne (ADR 0223) ────

test('l’apparence suit le profil, et seulement le sien', async () => {
  S.setLoggiaState({ cfg: { loggia_users: PROFILS, loggia_apparence: { __profils: { 0: { theme: 'atrium', mode: 'dark' }, 1: { mode: 'light' } } } }, profil: '1' });
  assert.deepEqual(S.apparence(), { mode: 'light' });
  await S.poserApparence({ theme: 'ios' });
  const parts = S.LOGGIA_CFG.loggia_apparence.__profils;
  assert.deepEqual(parts['1'], { mode: 'light', theme: 'ios' });
  assert.deepEqual(parts['0'], { theme: 'atrium', mode: 'dark' }, 'le thème de Luna est devenu celui de Guillaume');
});

test('un écran qui a sa propre apparence passe devant le profil, champ par champ', async () => {
  const id = S.appareilId();
  S.setLoggiaState({ cfg: { loggia_users: PROFILS, loggia_appareils: { [id]: { apparence: true } },
    loggia_apparence: { __profils: { 0: { theme: 'atrium', mode: 'dark' } } } }, profil: '0' });
  await S.poserApparence({ mode: 'light' });
  const part = S.LOGGIA_CFG.loggia_apparence.__profils['0'];
  assert.equal(part.mode, 'dark', 'la tablette a changé le mode de tout le profil');
  assert.deepEqual(part.appareils[id], { mode: 'light' });
  assert.deepEqual(S.apparence(), { theme: 'atrium', mode: 'light' }, 'le thème du profil ne passe plus');
});

test('rien n’est écrit quand rien ne change', async () => {
  S.setLoggiaState({ cfg: { loggia_users: PROFILS, loggia_apparence: { __profils: { 0: { mode: 'dark' } } } }, profil: '0' });
  const avant = envois.length;
  await S.poserApparence({ mode: 'dark' });
  assert.equal(envois.length, avant);
});

// ── Le compte Home Assistant fait foi (19/10) ────────────────────────────────
// « Quand je me connecte, ça me met sur Administrateur au lieu de Guillaume :
// ça doit suivre le profil avec lequel on est connecté à Home Assistant. »
// Puis : « un compte non lié qui garde son choix manuel, oui, mais pas en admin ».

test('le compte relié passe devant la fiche ; un écran non relié ne rouvre pas un Admin', async () => {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(!app.includes('dejaChoisi'), 'la reconnaissance du compte est de nouveau réservée aux écrans neufs');
  const i = app.indexOf('if (profilDuCompte >= 0) { if (profilDuCompte !== userIdx) setUserIdx(profilDuCompte); return; }');
  const j = app.indexOf('const p = parseInt(profilAppareil(), 10);');
  assert.ok(i > 0 && j > i, 'la fiche de l’écran passe devant le compte Home Assistant');
  assert.ok(app.includes("if (estAdmin(cible)) { const j = users.findIndex((u, k) => !estAdmin(k)); if (j >= 0) cible = j; }"),
    'un écran non relié rouvre un profil Admin sans le code');
  assert.ok(app.includes("return (!haAdmin && String(users[i].role || '').toLowerCase() === 'admin') ? -1 : i;"),
    'un compte non administrateur ouvre un profil Admin');
});
