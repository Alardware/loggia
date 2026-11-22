// ─────────────────────────────────────────────────────────────────────────────
// Chantier du 20/11, lot 1 : les quatre défauts (F1 à F4 ; ADR 0381).
//
//  — F1 : une borne qui publie un statut de panne (`error`, `faulted`, `Faulted`
//    d'OCPP) se disait « Branchée » ou « Débranchée » selon la prise. Elle dit
//    « En défaut », en rouge, sur la carte et la popup, et l'Accueil pose un
//    point « Borne en défaut ».
//  — F2 : les tuiles Gaz et Eau d'Énergie lisaient l'ÉTAT du compteur, qui est
//    souvent un index (Gazpar, Suez, Veolia) : « Eau 1 235 m³ » pour la journée.
//    Elles lisent la journée comme l'électricité ; l'eau s'écrit en litres sous
//    1 m³ (0,35 m³ s'écrivait « 0 »).
//  — F3 : les traceurs d'objets n'étaient reconnus que chez Invoxia. S'y
//    ajoutent Tile, Tractive et Traccar Server (noms lus dans leurs manifestes) ;
//    Traccar Client (une application de téléphone) et Bermuda (qui suit aussi
//    des téléphones) restent dehors.
//  — F4 : un volet dont Home Assistant SUPPOSE la position (`assumed_state`,
//    moteur radio sans retour) n'a pas de bout sûr : Monter et Descendre
//    restent offerts.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { device, entity, state, states, ctxOf } from './fixtures.mjs';

// La langue de la machine ne doit pas changer le résultat (garde-fou de la CI).
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });

const { vueBorne } = await import('../src/bornevue.js');
const { borneEnCharge, borneEnDefaut, statutEnPanne } = await import('../src/borne.js');
const { pointsAttention } = await import('../src/attention.js');
const { tuileEau, tuileGaz } = await import('../src/energievolumes.js');
const { setLoggiaState, estTraceur } = await import('../src/state.js');
const { vueVolet } = await import('../src/voletecran.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/* ════════════ F1 — LA BORNE EN DÉFAUT ════════════ */

const BORNE = { appareil: 'd_borne', puissance: 'sensor.b_puissance', courant: null, prise: 'binary_sensor.b_prise', statut: 'sensor.b_statut', interrupteur: null, energie: null };
const garage = (statut, { watts = '0', prise = 'on' } = {}) => ({
  'sensor.b_puissance': { state: watts, attributes: { device_class: 'power', unit_of_measurement: 'W', friendly_name: 'Borne Puissance' } },
  'binary_sensor.b_prise': { state: prise, attributes: { device_class: 'plug' } },
  'sensor.b_statut': { state: statut, attributes: { device_class: 'enum' } },
});

test('F1 — un statut de panne dit « En défaut », en rouge, quelle que soit la prise', () => {
  for (const statut of ['error', 'faulted', 'fault', 'Faulted', 'ERROR']) {
    const v = vueBorne({ borne: BORNE, S: garage(statut) });
    assert.equal(v.etat, 'defaut', statut);
    assert.equal(v.phrase.texte, 'En défaut', statut);
    assert.equal(v.phrase.encre, 'var(--o-bad)', statut);
    assert.equal(v.plaque[1], 'var(--o-bad)', 'la plaque prend la couleur d’alerte du thème');
  }
  assert.equal(vueBorne({ borne: BORNE, S: garage('error', { prise: 'off' }) }).etat, 'defaut', 'débranchée ou non : la panne d’abord');
  assert.equal(borneEnDefaut(BORNE, garage('Faulted')), true);
  assert.equal(borneEnDefaut(BORNE, garage('charging')), false);
  assert.equal(borneEnDefaut(BORNE, garage('unavailable')), false, 'muette n’est pas en panne');
  assert.equal(borneEnDefaut({ ...BORNE, statut: null }, garage('error')), false, 'sans statut, on ne sait pas');
  assert.equal(borneEnDefaut(null, {}), false);
});

test('F1 — ce qui marchait marche encore : la charge, la pause, branchée, débranchée', () => {
  assert.equal(vueBorne({ borne: BORNE, S: garage('charging', { watts: '7200' }) }).etat, 'charge');
  assert.equal(vueBorne({ borne: BORNE, S: garage('Charging') }).etat, 'charge', 'la casse d’OCPP');
  assert.equal(borneEnCharge(BORNE, garage('Charging')), true, 'Objets la compte active');
  assert.equal(vueBorne({ borne: BORNE, S: garage('connected') }).etat, 'branchee');
  assert.equal(vueBorne({ borne: BORNE, S: garage('disconnected', { prise: 'off' }) }).etat, 'debranchee');
  assert.equal(vueBorne({ borne: BORNE, S: garage('charging', { watts: '7200' }) }).phrase.encre, 'var(--o-ok)');
});

test('F1 — l’Accueil pose « Borne en défaut », au nom de l’appareil ; rien sinon', () => {
  // L'écran passe le capteur de statut de la borne en panne (`statutEnPanne`) : `attention.js` reste pur.
  const ctx = (S, borne = BORNE) => ({ S, borneEnPanne: statutEnPanne(borne, S), nomAppareil: (id) => (id === 'sensor.b_statut' ? 'Wallbox' : null) });
  assert.equal(statutEnPanne(BORNE, garage('error')), 'sensor.b_statut');
  assert.equal(statutEnPanne(BORNE, garage('connected')), null);
  const p = pointsAttention(ctx(garage('error'))).find(x => x.cle.indexOf('borne:') === 0);
  assert.ok(p, 'un point');
  assert.equal(p.titre, 'Borne en défaut');
  assert.equal(p.niveau, 'alerte');
  assert.equal(p.sous, 'Wallbox');
  assert.equal(p.vue, 'objets');
  assert.equal(p.haid, 'sensor.b_statut');
  assert.equal(pointsAttention(ctx(garage('charging'))).filter(x => x.cle.indexOf('borne:') === 0).length, 0);
  assert.equal(pointsAttention(ctx(garage('error'), null)).filter(x => x.cle.indexOf('borne:') === 0).length, 0, 'sans borne, rien');
  // Les deux écrans qui posent les points le lui donnent : l'Accueil et l'écran de veille.
  for (const f of ['src/accueil/dashboard.jsx', 'src/ecranveille.jsx']) assert.match(lire(f), /borneEnPanne: statutEnPanne\(enBorne\(\), /, f);
});

test('F1 — la popup écrit la panne en rouge, comme la carte', () => {
  const fiche = lire('src/ficheborne.jsx');
  assert.match(fiche, /v\.etat === 'defaut' \? 'var\(--o-bad\)'/);
});

/* ════════════ F2 — LES TUILES GAZ ET EAU ════════════ */

test('F2 — la journée, pas l’index : le gaz et l’eau rejoignent les compteurs du jour', () => {
  const vue = lire('src/views/energie.jsx');
  assert.match(vue, /const CPT_JOUR = \[EN\.gasJour, EN\.waterJour, EN\.consoJour,/, 'demandés avec les autres compteurs du jour');
  // Les tuiles lisent la journée (`valJour`), jamais l'état brut.
  assert.match(vue, /tuileGaz\(valJour\(EN\.gasJour, false\)/);
  assert.match(vue, /tuileEau\(valJour\(EN\.waterJour, false\)/);
  assert.doesNotMatch(vue, /dec\(num\(EN\.waterJour\)/);
  assert.doesNotMatch(vue, /dec\(numKwh\(EN\.gasJour\)/);
});

test('F2 — l’eau en litres sous 1 m³, en m³ au-dessus ; sans chiffre, pas de tuile inventée', () => {
  assert.deepEqual(tuileEau(0.35, 'm³'), { valeur: 350, decimales: 0, unite: 'L' });
  assert.deepEqual(tuileEau(0.35, 'm3'), { valeur: 350, decimales: 0, unite: 'L' });
  assert.deepEqual(tuileEau(1.24, 'm³'), { valeur: 1.24, decimales: 2, unite: 'm³' });
  assert.deepEqual(tuileEau(212, 'L'), { valeur: 212, decimales: 0, unite: 'L' });
  assert.deepEqual(tuileEau(12.5, 'gal'), { valeur: 12.5, decimales: 1, unite: 'gal' });
  assert.deepEqual(tuileEau(80, null), { valeur: 80, decimales: 0, unite: 'L' }, 'sans unité : des litres, comme avant');
  assert.equal(tuileEau(null, 'm³'), null);
  assert.equal(tuileEau(NaN, 'm³'), null);
});

test('F2 — le gaz : une énergie se dit en kWh, un volume garde son unité', () => {
  assert.deepEqual(tuileGaz(12.4, 'kWh'), { valeur: 12.4, decimales: 1, unite: 'kWh' });
  for (const [v, u, kwh] of [[12400, 'Wh', 12.4], [3.6, 'MJ', 1]]) {
    const g = tuileGaz(v, u);
    assert.equal(g.unite, 'kWh', u);
    assert.ok(Math.abs(g.valeur - kwh) < 1e-9, u + ' : ' + g.valeur);
  }
  assert.deepEqual(tuileGaz(1.6, 'm³'), { valeur: 1.6, decimales: 1, unite: 'm³' });
  assert.deepEqual(tuileGaz(5, null), { valeur: 5, decimales: 1, unite: 'kWh' });
  assert.equal(tuileGaz(null, 'kWh'), null);
});

/* ════════════ F3 — LES TRACEURS D'OBJETS ════════════ */

function avecTraceur(plateforme, f) {
  const fx = {
    areas: [], floors: [],
    devices: [device('d_obj', 'Objet', null, { integration: plateforme })],
    entities: [entity('device_tracker.objet', { device: 'd_obj', platform: plateforme })],
    states: states(state('device_tracker.objet', 'home', { friendly_name: 'Objet', source_type: 'gps' })),
  };
  const ctx = ctxOf(fx, {});
  setLoggiaState({ index: ctx.index, ent: {}, cfg: {}, resolved: null });
  try { return f(); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}

test('F3 — Tile, Tractive et Traccar Server sont des traceurs d’objets', () => {
  for (const p of ['tile', 'tractive', 'traccar_server', 'invoxia', 'invoxia_biotracker']) {
    avecTraceur(p, () => assert.equal(estTraceur('device_tracker.objet'), true, p));
  }
});

test('F3 — un téléphone, un routeur, Bermuda restent dehors', () => {
  for (const p of ['mobile_app', 'traccar', 'bermuda', 'unifi', 'ping', 'icloud', 'life360', 'owntracks']) {
    avecTraceur(p, () => assert.equal(estTraceur('device_tracker.objet'), false, p));
  }
});

/* ════════════ F4 — LE VOLET À ÉTAT SUPPOSÉ ════════════ */

const volet = (etat, attrs) => ({ state: etat, attributes: { device_class: 'shutter', supported_features: 15, ...attrs } });

test('F4 — une position SUPPOSÉE n’est pas un bout atteint : Monter et Descendre restent offerts', () => {
  const haut = vueVolet({ st: volet('open', { current_position: 100, assumed_state: true }) });
  assert.equal(haut.peutMonter, true, 'en haut supposé : Monter reste offert');
  assert.equal(haut.peutDescendre, true);
  const bas = vueVolet({ st: volet('closed', { current_position: 0, assumed_state: true }) });
  assert.equal(bas.peutDescendre, true, 'en bas supposé : Descendre reste offert');
  assert.equal(bas.peutMonter, true);
});

test('F4 — une position MESURÉE garde sa règle : Monter inerte en haut, Descendre en bas', () => {
  assert.equal(vueVolet({ st: volet('open', { current_position: 100 }) }).peutMonter, false);
  assert.equal(vueVolet({ st: volet('closed', { current_position: 0 }) }).peutDescendre, false);
  assert.equal(vueVolet({ st: volet('open', { current_position: 100, assumed_state: false }) }).peutMonter, false, '`false` écrit vaut une mesure');
});

test('F4 — sans position publiée, aucune n’est inventée : « Ouvert », jamais un pourcentage', () => {
  const v = vueVolet({ st: volet('open', { assumed_state: true, supported_features: 11 }) });
  assert.equal(v.phrase, 'Ouvert');
  assert.equal(v.peutMonter, true);
  assert.equal(v.peutDescendre, true);
});
