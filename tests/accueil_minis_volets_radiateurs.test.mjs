// ─────────────────────────────────────────────────────────────────────────────
// LES MINIS DES CARTES DE PIÈCE : VOLETS ET RADIATEURS (03/11).
//
// « Je ne sais pas pourquoi les volets n'apparaissent pas sur les cartes de
// l'Accueil, pourtant ils sont bien dans les pièces, de même que pour les
// radiateurs dans les chambres. »
//  - Volets : la configuration nommait `cover.volet_salon` / `cover.volet_chambre`,
//    renommés dans Home Assistant. Filtrée sur les états, elle se vidait et
//    masquait les volets que la découverte connaissait.
//  - Radiateurs : des modules fil pilote ; seules les entités `climate` avaient
//    une mini.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);

const { setLoggiaState } = await import('../src/state.js');
const { voletCovers } = await import('../src/app/decouverte.jsx');
const { basculeModule } = await import('../src/cartes/chauffage.jsx');

const st = (state, attributes = {}) => ({ state, attributes });

test('une configuration aux volets renommés ne masque plus ceux que la découverte connaît', () => {
  setLoggiaState({
    ent: { covers: { list: [{ id: 'sejour', name: 'Volet Séjour', haid: 'cover.volet_salon' }, { id: 'chambre', name: 'Volet Chambre', haid: 'cover.volet_chambre' }] } },
    resolved: { covers: { available: true, list: [{ id: 'cover.salon_volet_salon', name: 'Volet Salon' }, { id: 'cover.chambre_volet_chambre', name: 'Volet Chambre' }] } },
  });
  const S = { 'cover.salon_volet_salon': st('open', { device_class: 'shutter' }), 'cover.chambre_volet_chambre': st('open', { device_class: 'shutter' }) };
  assert.deepEqual(voletCovers(S).map(c => c.haid), ['cover.salon_volet_salon', 'cover.chambre_volet_chambre']);
});

test('un volet configuré et vivant garde son nom, sans doublon', () => {
  setLoggiaState({
    ent: { covers: { list: [{ id: 'sejour', name: 'Volet Séjour', haid: 'cover.salon_volet_salon' }] } },
    resolved: { covers: { available: true, list: [{ id: 'cover.salon_volet_salon', name: 'Volet Salon' }, { id: 'cover.chambre_volet_chambre', name: 'Volet Chambre' }] } },
  });
  const S = { 'cover.salon_volet_salon': st('open'), 'cover.chambre_volet_chambre': st('closed') };
  const v = voletCovers(S);
  assert.deepEqual(v.map(c => [c.haid, c.name]), [['cover.salon_volet_salon', 'Volet Séjour'], ['cover.chambre_volet_chambre', 'Volet Chambre']]);
});

test('sans états (les clés du poll), la configuration et la découverte entières', () => {
  setLoggiaState({ ent: { covers: { list: [{ id: 'a', name: 'A', haid: 'cover.a' }] } }, resolved: { covers: { available: true, list: [{ id: 'cover.b', name: 'B' }] } } });
  assert.deepEqual(voletCovers(null).map(c => c.haid), ['cover.a', 'cover.b']);
});

// ── Radiateurs ────────────────────────────────────────────────────────────────
const MODULE = { id: 'select.radiateur_chambre_pilot_wire_mode', modeEnt: 'select.radiateur_chambre_pilot_wire_mode', type: 'pilot_wire', decouvert: true, room: 'Chambre' };
function hassAvec(option) {
  const appels = [];
  const hass = {
    states: { [MODULE.modeEnt]: st(option, { options: ['comfort', 'eco', 'frost_protection', 'off'] }) },
    callService: (d, s, data) => { appels.push(['service', d, s, data]); return Promise.resolve(); },
    callWS: (m) => { appels.push(['ws', m]); return Promise.resolve(null); },
  };
  return { hass, appels };
}
const CH = { cle: 'radiateur_chambre', entite: MODULE.modeEnt, planning: true, mode: 'eco', applique: 'eco', modes: ['confort', 'eco', 'hors_gel', 'arret'], options: { confort: 'comfort', eco: 'eco', hors_gel: 'frost_protection', arret: 'off' } };

test('au planning, en Éco : « en marche », et la mini coupe par une reprise en main', async () => {
  const { hass, appels } = hassAvec('eco');
  const b = basculeModule(hass, MODULE, { chauffages: [CH], simulation: false });
  assert.equal(b.on, true);
  b.onToggle();
  await new Promise(r => setTimeout(r, 0));
  const ws = appels.find(a => a[0] === 'ws');
  assert.ok(ws, 'la commande passe par le moteur, pas par le module');
  assert.equal(ws[1].type, 'loggia/chauffage/main');
  assert.equal(ws[1].chauffage, 'radiateur_chambre');
  assert.equal(ws[1].mode, 'arret');
});

test('planning éteint : l’option du module telle qu’il l’écrit', async () => {
  const { hass, appels } = hassAvec('off');
  const b = basculeModule(hass, MODULE, { chauffages: [{ ...CH, planning: false }], simulation: false });
  assert.equal(b.on, false);
  b.onToggle();
  await new Promise(r => setTimeout(r, 0));
  assert.ok(!appels.some(a => a[0] === 'ws'), 'pas de reprise en main hors planning');
  assert.ok(JSON.stringify(appels).includes('"comfort"'), 'le confort, avec la graphie du module');
});

test('un module muet n’a pas de mini', () => {
  const { hass } = hassAvec('unavailable');
  assert.equal(basculeModule(hass, MODULE, { chauffages: [CH] }), null);
});

test('l’Accueil donne leur mini aux modules de la pièce', () => {
  const D = readFileSync(new URL('../src/accueil/dashboard.jsx', import.meta.url), 'utf8');
  assert.ok(D.includes("const modules = climateZones(S).filter(z => z.decouvert && z.modeEnt && S[z.modeEnt]);"));
  assert.ok(D.includes("if (ex && !ex.clim && ex.module) return basculeModule(dashHass, ex.module, etatChauffage);"));
});
