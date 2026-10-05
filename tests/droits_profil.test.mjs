// ─────────────────────────────────────────────────────────────────────────────
// Un droit accordé qui n'enregistre rien se dit (audit du 03/10).
//
// « Règles », « Interrupteurs » et « Alertes » s'accordent à un profil Famille,
// et la section s'ouvre. Ce qu'on y règle, le composant le réserve pourtant aux
// comptes administrateurs de Home Assistant : `require_admin` sur les commandes
// des modules, `loggia_alertes` parmi les clés de la maison (store.py). Sous un
// compte ordinaire rien ne s'enregistrait, et l'écran disait « le composant ne
// répond pas » (les alertes), « Unauthorized » (les règles), ou rien du tout
// (« Observer sans agir » jetait ses quatre refus).
//
// La frontière ne bouge pas (ADR 0125). Ce fichier tient ce qui change : un
// refus se dit comme tel, nomme sa clé, et ne passe plus pour une panne ; et
// l'éditeur de profil prévient au moment d'accorder. `refus.js` est REJOUÉ par
// import ; les sources ne sont relues que pour vérifier qu'il est branché.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estRefus, clesRefusees, raisonEchec, bilanEcritures } from '../src/refus.js';
import { DROITS_IDS, DROITS_ADMIN_HA } from '../src/state.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

// Ce que le composant et Home Assistant renvoient vraiment.
const NOT_ADMIN = { code: 'not_admin', message: 'reglages reserves aux administrateurs Home Assistant : loggia_alertes' };
const UNAUTHORIZED = { code: 'unauthorized', message: 'Unauthorized' };
// Une coupure : la bibliothèque rejette le message entier, son code rangé sous `error`.
const COUPURE = { type: 'result', success: false, error: { code: 3, message: 'Connection lost' } };
const PANNE = 'Enregistrement impossible — le composant ne répond pas.';
const MAISON = (k) => `« ${k} » non enregistré — ce réglage appartient à la maison, et seul un administrateur Home Assistant peut le changer`;

test('le refus d’une clé de la maison ne s’annonce plus comme une panne', () => {
  assert.ok(estRefus(NOT_ADMIN));
  assert.equal(clesRefusees(NOT_ADMIN), 'loggia_alertes');
  const texte = raisonEchec(NOT_ADMIN, 'autre_cle');
  assert.notEqual(texte, PANNE, 'un refus redevient « le composant ne répond pas »');
  assert.equal(texte, MAISON('loggia_alertes'), 'la clé nommée par le composant passe devant celle que l’écran croyait écrire');
});

test('require_admin ne nomme rien : l’écran nomme la clé qu’il écrivait', () => {
  assert.ok(estRefus(UNAUTHORIZED));
  assert.equal(clesRefusees(UNAUTHORIZED), '');
  assert.equal(raisonEchec(UNAUTHORIZED, 'loggia_volets'), MAISON('loggia_volets'));
  assert.ok(!raisonEchec(UNAUTHORIZED, 'loggia_volets').includes('Unauthorized'), 'le mot anglais de Home Assistant revient à l’écran');
  // Sans clé connue : la forme sans nom — jamais la panne.
  assert.equal(raisonEchec(UNAUTHORIZED), 'Réglage non enregistré — il appartient à la maison, et seul un administrateur Home Assistant peut le changer');
});

test('une coupure reste une panne : elle ne se fait pas passer pour un refus', () => {
  for (const e of [COUPURE, undefined, null, 3, new Error('socket')]) {
    assert.ok(!estRefus(e), String(e));
    assert.equal(raisonEchec(e, 'loggia_alertes'), PANNE);
  }
});

test('un autre refus garde son motif, dans une phrase traduite', () => {
  /* Le dernier recours : un code que la table ne connaît pas. Un plafond, lui,
   * se dit par son code depuis l'audit du 03/10 (refus_codes.test.mjs). */
  const illisible = { code: 'invalid_format', message: 'famille inconnue : arrosage' };
  assert.equal(raisonEchec(illisible, 'loggia_scenarios'),
    'Réglage non enregistré — le composant l’a refusé : famille inconnue : arrosage');
  const trop = { code: 'payload_too_large', message: 'valeur trop volumineuse pour loggia_volets (300000 > 262144 octets)' };
  assert.equal(raisonEchec(trop, 'loggia_volets'), '« loggia_volets » non enregistré — trop volumineux',
    'un plafond se dit dans la langue de l’écran, et nomme la clé que l’écran écrivait');
});

test('« Observer sans agir » : quatre refus ne s’avalent plus', async () => {
  const refuse = () => Promise.reject(UNAUTHORIZED);
  const texte = await bilanEcritures([
    ['loggia_volets', refuse()],
    ['loggia_fenetres', refuse()],
    ['loggia_presence', Promise.resolve({ config: {} })],
    ['loggia_nuit', refuse()],
  ]);
  assert.equal(texte, MAISON('loggia_volets, loggia_fenetres, loggia_nuit'), 'les écritures refusées, et elles seules');
  assert.equal(await bilanEcritures([['loggia_volets', Promise.resolve({})]]), '', 'tout a pris : rien à dire');
  assert.equal(await bilanEcritures([['loggia_nuit', Promise.reject(COUPURE)]]), PANNE);
});

test('les sections des trois droits passent par le même motif', () => {
  const par = lire('src', 'views', 'parametres.jsx');
  assert.ok(!par.includes(".catch(() => setMsg(tr('Enregistrement impossible — le composant ne répond pas.')))"),
    'les alertes annoncent de nouveau une panne sur un refus');
  assert.ok(par.includes("setMsg(raisonEchec(e, 'loggia_alertes'))"), 'le refus des alertes ne nomme plus sa clé');
  const debut = par.indexOf('const basculerObserve = async () => {');
  assert.ok(debut > 0, '« Observer sans agir » a disparu');
  const corps = par.slice(debut, par.indexOf('\n  };', debut));
  assert.ok(!corps.includes('.catch(() => null)'), '« Observer sans agir » avale de nouveau ses refus');
  assert.ok(corps.includes('setObsRefus(await bilanEcritures(['), 'le bilan des quatre écritures n’est plus gardé');
  assert.ok(par.includes('{obsRefus && (') && par.includes('<span>{obsRefus}</span>'), 'le refus ne s’affiche plus sous la barre des règles');
  for (const [v, cle] of [['volets', 'loggia_volets'], ['fenetres', 'loggia_fenetres'], ['presence', 'loggia_presence'],
    ['nuit', 'loggia_nuit'], ['veilles', 'loggia_veilles'], ['interrupteurs', 'loggia_interrupteurs']]) {
    assert.ok(lire('src', 'views', v + '.jsx').includes(`setErr(raisonEchec(e, '${cle}'));`),
      `${v}.jsx : un refus s’affiche de nouveau en « Unauthorized », ou passe pour une panne`);
  }
});

test('l’éditeur de profil prévient quand il accorde ce que le composant réserve', () => {
  assert.deepEqual([...DROITS_ADMIN_HA].sort(), ['alertes', 'inter', 'regles']);
  for (const d of DROITS_ADMIN_HA) assert.ok(DROITS_IDS.includes(d), d + ' a quitté le catalogue des droits');
  const par = lire('src', 'views', 'parametres.jsx');
  const debut = par.indexOf('function UserEditor(');
  const corps = par.slice(debut, par.indexOf('\n}', debut));
  assert.ok(corps.includes('DROITS_ADMIN_HA.indexOf(did) >= 0 && droits.indexOf(did) >= 0'), 'l’avertissement ne suit plus les cases cochées');
  assert.ok(corps.includes('{sousAdminHA.length > 0 && ('), 'l’avertissement a disparu de l’éditeur de profil');
});

test('la frontière ne bouge pas : les alertes restent une clé de la maison', () => {
  const store = lire('custom_components', 'loggia', 'store.py');
  const ouvertes = store.slice(store.indexOf('AGENCEMENT: frozenset'), store.indexOf('OUVERTES_A_TOUS: frozenset'));
  assert.ok(ouvertes.includes('"loggia_accueil"'), 'la liste des clés ouvertes est illisible');
  assert.ok(!ouvertes.includes('"loggia_alertes"'), 'les alertes sont devenues ouvertes à tous : c’est une décision de l’utilisateur, pas ce correctif');
});
