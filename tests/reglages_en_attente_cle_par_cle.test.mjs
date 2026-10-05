/* Le renvoi du carnet, clé par clé (audit du 03/10).
 *
 * `_set_locked` refuse un lot ENTIER dès qu'une seule clé de la maison y
 * figure, pour un compte qui n'est pas administrateur. Le renvoi du carnet
 * envoyait tout d'un bloc et rayait tout au moindre refus : l'agencement qui
 * attendait à côté d'une clé réservée se perdait — le cas même que le carnet
 * devait sauver (ADR 0109), sur ce que l'ADR 0125 ouvre à tous.
 *
 * On REJOUE `src/enattente.js` contre un faux composant aussi strict que
 * `store.py` pour les clés de ce rejeu, dont il lit la liste des clés
 * ouvertes. Il ne connaît ni les clés propres à un appareil (suffixe
 * « panel »), ni la garde du profil Admin : elles n'entrent pas ici. */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Un stockage d'appareil, en mémoire, posé AVANT le premier appel (voir
 * reglages_en_attente.test.mjs). */
const boite = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (boite.has(k) ? boite.get(k) : null),
    setItem: (k, v) => { boite.set(k, String(v)); },
    removeItem: (k) => { boite.delete(k); },
  },
};

const { poserEnAttente, enAttente, renvoyerEnAttente } = await import('../src/enattente.js');

/* Les clés qu'un compte ordinaire peut écrire, lues dans `store.py` même. */
const STORE = readFileSync(join(RACINE, 'custom_components', 'loggia', 'store.py'), 'utf8');
function ensemble(nom) {
  const m = STORE.match(new RegExp(nom + ': frozenset\\[str\\] = frozenset\\(\\s*\\{([^}]*)\\}'));
  assert.ok(m, `store.py ne déclare plus ${nom} : relire ce faux composant`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}
const OUVERTES = new Set(['loggia_active_user', ...ensemble('AGENCEMENT'), ...ensemble('APPARENCE')]);

/**
 * Le composant vu d'un compte ORDINAIRE, strict comme `_set_locked` : la
 * moindre clé de la maison fait refuser le lot entier, rien n'est écrit, et
 * l'erreur porte un `code` comme celle que Home Assistant renvoie.
 * `coupeAu` fait tomber la connexion au n-ième envoi (une erreur SANS code).
 */
function composantOrdinaire({ coupeAu = 0 } = {}) {
  const maison = {};
  const envois = [];
  const hass = {
    async callWS(msg) {
      assert.equal(msg.type, 'loggia/config/set');
      envois.push(msg.config);
      if (coupeAu && envois.length === coupeAu) throw new Error('Connection lost');
      const reservees = Object.keys(msg.config).filter((k) => !OUVERTES.has(k)).sort();
      if (reservees.length) {
        throw { code: 'not_admin', message: 'reglages reserves aux administrateurs Home Assistant : ' + reservees.join(', ') };
      }
      for (const [k, v] of Object.entries(msg.config)) { if (v == null) delete maison[k]; else maison[k] = v; }
      return { config: { ...maison } };
    },
  };
  return { hass, maison, envois };
}

const AGENCEMENT = { Salon: { larges: ['light.plafonnier'], compacts: ['switch.prise'] } };
/* Le carnet se range par compte (audit du 03/10) : celui du compte ordinaire. */
const MOI = 'compte-famille';

/** Le journal se tait pendant un renvoi qui doit refuser. */
async function sansAvertir(f) {
  const warn = console.warn; console.warn = () => {};
  try { return await f(); } finally { console.warn = warn; }
}

beforeEach(() => { boite.clear(); });

test('le faux composant refuse bien ce que store.py réserve', () => {
  assert.ok(OUVERTES.has('loggia_roomlayout'), 'l’agencement des pièces doit être ouvert à tous (ADR 0125)');
  assert.ok(!OUVERTES.has('loggia_rooms'), 'les pièces configurent la maison : réservées');
});

test('un refus au renvoi ne raye que SA clé : l’agencement qui attendait arrive', async () => {
  /* Rejeu C. Un compte ordinaire. Une clé de la maison est restée au carnet —
   * `saveCfg` ne raye qu'au succès, un refus y reste — puis un rangement s'est
   * perdu en route : la page actualisée pendant l'aller-retour, le cas même
   * de l'ADR 0109. */
  poserEnAttente({ loggia_rooms: [{ name: 'Salon' }] }, MOI);
  poserEnAttente({ loggia_roomlayout: AGENCEMENT }, MOI);
  const { hass, maison } = composantOrdinaire();
  const r = await sansAvertir(() => renvoyerEnAttente(hass, MOI));
  assert.deepEqual(maison.loggia_roomlayout, AGENCEMENT,
    'l’agencement d’un compte ordinaire est parti avec la clé refusée à côté de lui');
  assert.equal('loggia_rooms' in maison, false, 'la configuration de la maison reste réservée');
  assert.deepEqual(r.cles, ['loggia_roomlayout'], 'ce qui est arrivé se compte');
  assert.deepEqual(r.refusees, ['loggia_rooms'], 'le refus nomme SA clé, pas tout le lot');
  assert.equal(r.refus && r.refus.code, 'not_admin');
  assert.equal(enAttente(MOI), null, 'l’arrivé est rayé, le refusé aussi : rien ne se retente en vain');
});

test('une coupure en plein renvoi garde ce qui n’est pas parti — et seulement cela', async () => {
  poserEnAttente({ loggia_roomlayout: AGENCEMENT, loggia_seclayout: { a: 1 }, loggia_objlayout: { b: 2 } }, MOI);
  const { hass, maison, envois } = composantOrdinaire({ coupeAu: 2 });
  const r = await renvoyerEnAttente(hass, MOI);
  assert.deepEqual(maison, { loggia_roomlayout: AGENCEMENT }, 'la première clé est arrivée');
  assert.deepEqual(r.cles, ['loggia_roomlayout']);
  assert.ok(r.erreur && !r.refus, 'une coupure n’est pas un refus');
  assert.equal(envois.length, 2, 'après une coupure on n’insiste pas : la suite échouerait pareil');
  assert.deepEqual(enAttente(MOI), { loggia_seclayout: { a: 1 }, loggia_objlayout: { b: 2 } },
    'ce qui n’est pas arrivé attend le prochain démarrage ; ce qui est arrivé ne repartira pas');
});

test('une clé réécrite PENDANT le renvoi reste au carnet', async () => {
  poserEnAttente({ loggia_roomlayout: AGENCEMENT, loggia_seclayout: { a: 1 } }, MOI);
  const neuf = { Salon: { larges: [] } };
  const hass = {
    async callWS(msg) {
      // `saveCfg` range la même carte pendant l'aller-retour du renvoi.
      if ('loggia_roomlayout' in msg.config) poserEnAttente({ loggia_roomlayout: neuf }, MOI);
      return {};
    },
  };
  await renvoyerEnAttente(hass, MOI);
  assert.deepEqual(enAttente(MOI), { loggia_roomlayout: neuf }, 'la dernière valeur serait celle qui se perdrait');
});
