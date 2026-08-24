// Disponibilite des vues — verifiee sur des installations synthetiques.
//
// `src/views.js` n'importe rien : pas de React, pas de DOM, pas de Home
// Assistant. Ces cas tournent donc avec le lanceur integre a Node :
//   npm test
//
// Chaque fixture decrit une installation plausible ; l'attente porte sur ce que
// l'utilisateur DOIT voir, ou ne pas voir, dans son menu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewAvailability, allAvailable, VIEW_IDS } from '../src/views.js';

/** Contexte minimal, de la forme que `buildRuntime` fabrique. */
function ctx({ has = {}, views = {}, resolved = {}, entities = null, states = {} } = {}) {
  return {
    ready: true,
    caps: { has, views },
    resolved,
    states,
    userCfg: entities ? { loggia_entities: entities } : {},
  };
}

const ok = (r, vid) => { assert.equal(r[vid].ok, true, vid + ' devrait etre disponible'); };
const ko = (r, vid) => { assert.equal(r[vid].ok, false, vid + ' devrait etre indisponible'); };

test('decouverte pas encore repondue : tout reste affiche', () => {
  const r = viewAvailability({ ready: false });
  VIEW_IDS.forEach(v => ok(r, v));
  assert.deepEqual(Object.keys(allAvailable()).sort(), VIEW_IDS.slice().sort());
});

test('installation vierge : seules Accueil et Parametres subsistent', () => {
  const r = viewAvailability(ctx());
  ok(r, 'accueil');
  ok(r, 'parametres');
  VIEW_IDS.filter(v => v !== 'accueil' && v !== 'parametres').forEach(v => ko(r, v));
  assert.match(r.lumieres.reason, /aucune lumière/);
});

test('petite maison : lumieres, chauffage, volets — rien d’autre', () => {
  const r = viewAvailability(ctx({
    has: { light: 3, climate: 1, cover: 2, scene: 4 },
    views: { lumieres: true, climat: true, volets: true },
    resolved: { rooms: { suggested: [{ id: 'salon' }] } },
  }));
  ['lumieres', 'climat', 'volets', 'scenes', 'pieces'].forEach(v => ok(r, v));
  ['aspirateur', 'medias', 'securite', 'energie', 'systeme', 'croquettes'].forEach(v => ko(r, v));
});

test('zones toutes techniques : la vue Pieces disparait', () => {
  const r = viewAvailability(ctx({
    has: { light: 2 }, views: { lumieres: true },
    resolved: { rooms: { rooms: [], suggested: [], technical: [{ id: 'network' }] } },
  }));
  ko(r, 'pieces');
  assert.match(r.pieces.reason, /zone Home Assistant/);
});

test('capteurs de puissance sans tableau de bord Energie : vue masquee, motif explicite', () => {
  const r = viewAvailability(ctx({
    has: { sensor: 40 },
    views: { energie: true },
    resolved: { energy: { available: false, reason: 'tableau de bord Energie non configure' } },
  }));
  ko(r, 'energie');
  assert.match(r.energie.reason, /tableau de bord Énergie/);
});

test('tableau de bord Energie configure : la vue apparait', () => {
  const r = viewAvailability(ctx({
    has: { sensor: 40 },
    views: { energie: true },
    resolved: { energy: { available: true, haids: { consoJour: 'sensor.grid' }, devices: [] } },
  }));
  ok(r, 'energie');
});

test('pas un seul capteur d’energie : le motif differe de celui du tableau de bord', () => {
  const r = viewAvailability(ctx({ has: { sensor: 3 }, views: { energie: false } }));
  ko(r, 'energie');
  assert.match(r.energie.reason, /aucun capteur/);
});

test('machine supervisee trouvee : la vue Systeme apparait', () => {
  const withHost = viewAvailability(ctx({ resolved: { system: { available: true, hosts: [{ key: 'd1' }] } } }));
  ok(withHost, 'systeme');
  const without = viewAvailability(ctx({ resolved: { system: { available: false } } }));
  ko(without, 'systeme');
  assert.match(without.systeme.reason, /charge processeur/);
});

test('configuration heritee d’une autre installation : entites mortes, vue masquee', () => {
  // Le distributeur est decrit dans la configuration, mais aucune de ses entites
  // n'existe ici — cas typique d'une configuration recopiee d'ailleurs.
  const r = viewAvailability(ctx({
    entities: { feeder: { haids: { reservoir: 'input_number.croquettes' } } },
    states: { 'light.salon': {} },
  }));
  ko(r, 'croquettes');
});

test('distributeur configure et vivant : la vue apparait', () => {
  const r = viewAvailability(ctx({
    entities: { feeder: { haids: { reservoir: 'input_number.croquettes' } } },
    states: { 'input_number.croquettes': { state: '1200' } },
  }));
  ok(r, 'croquettes');
  ok(r, 'objets'); // le distributeur suffit a justifier le regroupement
});

test('un seul aspirateur suffit a ouvrir Objets', () => {
  const r = viewAvailability(ctx({ has: { vacuum: 1 }, views: { aspirateur: true } }));
  ok(r, 'objets');
  ok(r, 'aspirateur');
});

test('plusieurs appareils du meme type ne changent rien a la disponibilite', () => {
  const un = viewAvailability(ctx({ has: { vacuum: 1 }, views: { aspirateur: true } }));
  const trois = viewAvailability(ctx({ has: { vacuum: 3 }, views: { aspirateur: true } }));
  assert.deepEqual(un.aspirateur, trois.aspirateur);
});

test('chaque indisponibilite porte un motif lisible', () => {
  const r = viewAvailability(ctx());
  VIEW_IDS.forEach(v => {
    if (r[v].ok) return;
    assert.equal(typeof r[v].reason, 'string', v + ' : motif manquant');
    assert.ok(r[v].reason.length > 10, v + ' : motif trop court');
  });
});
