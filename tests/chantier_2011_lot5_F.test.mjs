// ─────────────────────────────────────────────────────────────────────────────
// Chantier du 20/11, lot 5, lettre F (ADR 0385).
//
//  — A5 : un climatiseur règle sa ventilation et son balayage, un ventilateur ou un purificateur sa
//    vitesse, un humidificateur son humidité visée ; chacun dit son bac plein. Seulement ce que
//    l'appareil SAIT (`supported_features` + sa liste), jamais d'après un nom.
//  — A10 : « Pression de la chaudière basse » et « Granulés bas » se DISENT (fiche du chauffage) ;
//    une tête thermostatique dont la vanne est ouverte dit « chauffe » quand elle ne publie pas son action.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const { setLoggiaState } = await import('../src/state.js');
const { ReglagesAir } = await import('../src/reglagesair.jsx');
// MODIFIÉ (21/11, ADR 0385) : le démarrage dépassait son budget ; la vanne (dont la carte a besoin) reste dans `chauffageseuils.js`,
// les alertes (pression, granulés ; la fiche seule les dit) vivent dans `chauffagealertes.js`, chargé avec la fiche.
const { vanneOuverte, voisinsDeLAppareil, SEUIL_VANNE_PCT, vanneDeLAppareil } = await import('../src/chauffageseuils.js');
const { pressionEnBar, signauxDeLAppareil, SEUIL_PRESSION_BAR, SEUIL_GRANULES_PCT } = await import('../src/chauffagealertes.js');
const { enChauffe } = await import('../src/chauffageecran.js');
const {
  reglagesAir, vitesseDuVentilo, etapeDe, pctDeLEtape, vitesseVoisine, humiditeVisee, humiditeVoisine, humiditeBornee, pasHumidite, bacsEnAlerte, motReglage,
} = await import('../src/reglagesair.js');
const { planAction, commanderService } = await import('../src/actions.js');

const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// Un index d'entités minimal : `[id, appareil, fiche]`.
const index = (...lignes) => new Map(lignes.map(([id, deviceId, m]) => [id, { deviceId, ...(m || {}) }]));
const etats = (o) => Object.fromEntries(Object.entries(o).map(([id, [state, attributes]]) => [id, { entity_id: id, state, attributes: attributes || {} }]));

// ─── A10 : les seuils de l'appareil ──────────────────────────────────────────

test('A10 — la pression se ramène en bars, et ne se lit pas sans unité', () => {
  assert.equal(pressionEnBar(0.6, 'bar'), 0.6);
  assert.equal(pressionEnBar(60, 'kPa'), 0.6);
  assert.equal(pressionEnBar(600, 'mbar'), 0.6);
  assert.ok(Math.abs(pressionEnBar(8.7, 'psi') - 0.5998) < 0.001);
  assert.equal(pressionEnBar(0.6, null), null);
  assert.equal(pressionEnBar(0.6, 'cm'), null);
  assert.equal(pressionEnBar('', 'bar'), null);
  assert.equal(pressionEnBar(null, 'bar'), null);
});

const CHAUDIERE = index(
  ['climate.chaudiere', 'd1'], ['sensor.eau_pression', 'd1', { deviceClass: 'pressure' }],
  ['sensor.autre_pression', 'd2', { deviceClass: 'pressure' }], ['sensor.temp', 'd1', { deviceClass: 'temperature' }],
);

test('A10 — « Pression de la chaudière basse » sous 0,8 bar, avec la valeur lue', () => {
  const S = etats({ 'climate.chaudiere': ['heat'], 'sensor.eau_pression': ['0.6', { unit_of_measurement: 'bar', device_class: 'pressure' }], 'sensor.temp': ['50'] });
  const { alertes } = signauxDeLAppareil('climate.chaudiere', S, CHAUDIERE);
  assert.equal(alertes.length, 1);
  assert.equal(alertes[0].cle, 'pression');
  assert.equal(alertes[0].id, 'sensor.eau_pression');
  assert.equal(alertes[0].texte, 'Pression de la chaudière basse · 0,6 bar');
});

test('A10 — le seuil est strict : 0,8 bar et au-dessus, rien ; 0 bar le dit', () => {
  assert.equal(SEUIL_PRESSION_BAR, 0.8);
  const avec = (v) => signauxDeLAppareil('climate.chaudiere', etats({ 'climate.chaudiere': ['heat'], 'sensor.eau_pression': [v, { unit_of_measurement: 'bar' }] }), CHAUDIERE).alertes;
  assert.equal(avec('0.8').length, 0);
  assert.equal(avec('1.4').length, 0);
  assert.equal(avec('0.79').length, 1);
  assert.equal(avec('0').length, 1);
});

test('A10 — une pression muette, sans unité, ou d’un AUTRE appareil ne dit rien', () => {
  const base = { 'climate.chaudiere': ['heat'] };
  assert.equal(signauxDeLAppareil('climate.chaudiere', etats({ ...base, 'sensor.eau_pression': ['unavailable', { unit_of_measurement: 'bar' }] }), CHAUDIERE).alertes.length, 0);
  assert.equal(signauxDeLAppareil('climate.chaudiere', etats({ ...base, 'sensor.eau_pression': ['0.3'] }), CHAUDIERE).alertes.length, 0);
  assert.equal(signauxDeLAppareil('climate.chaudiere', etats({ ...base, 'sensor.autre_pression': ['0.3', { unit_of_measurement: 'bar' }] }), CHAUDIERE).alertes.length, 0);
});

test('A10 — la pression se reconnaît aussi à sa clé de traduction, jamais à son nom', () => {
  const meta = index(['climate.c', 'd1'], ['sensor.eau_pression', 'd1', { translationKey: 'water_pressure' }], ['sensor.nom_trompeur', 'd1']);
  const S = etats({ 'climate.c': ['heat'], 'sensor.eau_pression': ['0.5', { unit_of_measurement: 'bar' }], 'sensor.nom_trompeur': ['0.1', { unit_of_measurement: 'bar' }] });
  const { alertes } = signauxDeLAppareil('climate.c', S, meta);
  assert.deepEqual(alertes.map(a => a.id), ['sensor.eau_pression']);
});

test('A10 — « Granulés bas » sous 10 %, seulement quand le stock est un POURCENTAGE', () => {
  assert.equal(SEUIL_GRANULES_PCT, 10);
  const meta = index(['climate.poele', 'd1'], ['sensor.stock', 'd1', { translationKey: 'pellet_level' }]);
  const dit = (v, unite) => signauxDeLAppareil('climate.poele', etats({ 'climate.poele': ['heat'], 'sensor.stock': [v, unite ? { unit_of_measurement: unite } : {}] }), meta).alertes;
  assert.deepEqual(dit('8', '%').map(a => [a.cle, a.texte]), [['granules', 'Granulés bas · 8 %']]);
  assert.equal(dit('10', '%').length, 0);
  assert.equal(dit('60', '%').length, 0);
  // Des kilos ou des centimètres : on ne sait pas où est « bas » sans la taille du réservoir.
  assert.equal(dit('2', 'kg').length, 0);
  assert.equal(dit('4', 'cm').length, 0);
  assert.equal(dit('2').length, 0);
});

test('A10 — un capteur sans clé de traduction ne devient pas « granulés » par son nom', () => {
  const meta = index(['climate.poele', 'd1'], ['sensor.poele_pellet_stock', 'd1']);
  const S = etats({ 'climate.poele': ['heat'], 'sensor.poele_pellet_stock': ['3', { unit_of_measurement: '%' }] });
  assert.deepEqual(signauxDeLAppareil('climate.poele', S, meta).alertes, []);
});

test('A10 — la vanne : l’ouverture lue sur la clé de traduction, la plus ouverte des vannes', () => {
  const meta = index(['climate.tete', 'd1'], ['sensor.v1', 'd1', { translationKey: 'valve_position' }], ['sensor.v2', 'd1', { translationKey: 'pi_heating_demand' }],
    ['sensor.v3', 'd1', { translationKey: 'heating_demand' }], ['sensor.v4', 'd1', { translationKey: 'autre' }]);
  const S = etats({ 'climate.tete': ['heat'], 'sensor.v1': ['0'], 'sensor.v2': ['40'], 'sensor.v3': ['unknown'], 'sensor.v4': ['99'] });
  assert.deepEqual(vanneDeLAppareil('climate.tete', S, meta), { id: 'sensor.v2', pct: 40 });
  assert.deepEqual(signauxDeLAppareil('climate.tete', S, meta).vanne, { id: 'sensor.v2', pct: 40 }, 'les alertes de la fiche rendent la même vanne');
  assert.equal(vanneDeLAppareil('climate.tete', etats({ 'climate.tete': ['heat'], 'sensor.v4': ['99'] }), meta), null);
  assert.equal(vanneDeLAppareil('climate.tete', null, meta), null);
});

test('A10 — la vanne est ouverte à partir de 5 %', () => {
  assert.equal(SEUIL_VANNE_PCT, 5);
  assert.equal(vanneOuverte(5), true);
  assert.equal(vanneOuverte({ id: 'x', pct: 100 }), true);
  assert.equal(vanneOuverte(4), false);
  assert.equal(vanneOuverte(0), false);
  assert.equal(vanneOuverte(null), false);
  assert.equal(vanneOuverte(undefined), false);
  assert.equal(vanneOuverte(NaN), false);
});

test('A10 — une tête qui ne publie pas son action « chauffe » vanne ouverte ; celle qui dit idle est crue', () => {
  const base = { famille: 'thermostat', marche: true };
  assert.equal(enChauffe({ ...base, vanne: { pct: 60 } }), true);
  assert.equal(enChauffe({ ...base, action: null, vanne: 60 }), true);
  assert.equal(enChauffe({ ...base, action: undefined, vanne: 60 }), true);
  assert.equal(enChauffe({ ...base, action: '', vanne: 60 }), true);
  assert.equal(enChauffe({ ...base, action: 'idle', vanne: 60 }), false);
  assert.equal(enChauffe({ ...base, action: 'heating', vanne: 0 }), true);
  assert.equal(enChauffe({ ...base, vanne: 2 }), false);
  assert.equal(enChauffe({ ...base }), false);
  // Éteinte ou muette : la vanne n'y change rien.
  assert.equal(enChauffe({ famille: 'thermostat', marche: false, vanne: 80 }), false);
  assert.equal(enChauffe({ famille: 'thermostat', marche: true, muet: true, vanne: 80 }), false);
  // Ni un module fil pilote ni une zone n'ont de vanne.
  assert.equal(enChauffe({ famille: 'module', watts: 0, vanne: 80 }), false);
});

test('A10 — l’appareil se lit dans le registre, jamais sans lui', () => {
  assert.deepEqual(voisinsDeLAppareil(CHAUDIERE, 'climate.chaudiere').sort(), ['climate.chaudiere', 'sensor.eau_pression', 'sensor.temp']);
  assert.deepEqual(voisinsDeLAppareil(CHAUDIERE, 'climate.inconnu'), []);
  assert.deepEqual(voisinsDeLAppareil(null, 'climate.chaudiere'), []);
  assert.deepEqual(signauxDeLAppareil('climate.chaudiere', {}, null), { alertes: [], vanne: null });
  assert.deepEqual(signauxDeLAppareil('climate.chaudiere', null, CHAUDIERE), { alertes: [], vanne: null });
});

// ─── A5 : le climatiseur ─────────────────────────────────────────────────────

const CLIM = { fan_modes: ['auto', 'low', 'high'], fan_mode: 'low', swing_modes: ['off', 'vertical'], swing_mode: 'off', supported_features: 8 | 32 | 1 };

test('A5 — un climatiseur offre sa ventilation et son balayage quand il les déclare', () => {
  const r = reglagesAir('climate.clim', etats({ 'climate.clim': ['cool', CLIM] }), null);
  assert.deepEqual(r.menus.map(m => m.cle), ['fan_mode', 'swing_mode']);
  const vent = r.menus[0];
  assert.equal(vent.titre, 'Ventilation');
  assert.equal(vent.capacite, 'set_fan_mode');
  assert.deepEqual(vent.options.map(o => o.id), ['auto', 'low', 'high']);
  assert.equal(vent.courant, 'low');
  assert.equal(r.menus[1].titre, 'Balayage');
  assert.equal(r.menus[1].courant, 'off');
});

test('A5 — pas de réglage sans le bit : la liste seule ne suffit pas', () => {
  const sans = (sf) => reglagesAir('climate.clim', etats({ 'climate.clim': ['cool', { ...CLIM, supported_features: sf }] }), null).menus.map(m => m.cle);
  assert.deepEqual(sans(8), ['fan_mode']);
  assert.deepEqual(sans(32), ['swing_mode']);
  assert.deepEqual(sans(1), []);
  assert.deepEqual(sans(undefined), []);
});

test('A5 — pas de réglage sans liste, ni avec un seul choix', () => {
  const r = (a) => reglagesAir('climate.clim', etats({ 'climate.clim': ['cool', { supported_features: 8 | 32, ...a }] }), null).menus;
  assert.deepEqual(r({}), []);
  assert.deepEqual(r({ fan_modes: ['auto'], swing_modes: [] }), []);
  assert.deepEqual(r({ fan_modes: ['auto', 'low'] }).map(m => m.cle), ['fan_mode']);
});

test('A5 — le balayage horizontal se règle sur son bit (512), avec sa liste', () => {
  const a = { supported_features: 512, swing_horizontal_modes: ['off', 'on'], swing_horizontal_mode: 'on' };
  const [m] = reglagesAir('climate.clim', etats({ 'climate.clim': ['cool', a] }), null).menus;
  assert.equal(m.cle, 'swing_horizontal_mode');
  assert.equal(m.titre, 'Balayage horizontal');
  assert.equal(m.capacite, 'set_swing_horizontal_mode');
  assert.equal(m.courant, 'on');
});

test('A5 — le moteur d’actions envoie le balayage horizontal, et refuse une option inconnue', () => {
  const S = etats({ 'climate.clim': ['cool', { supported_features: 512, swing_horizontal_modes: ['off', 'on'] }] });
  const p = planAction('climate.clim', 'set_swing_horizontal_mode', 'on', { states: S });
  assert.equal(p.ok, true);
  assert.equal(p.service, 'set_swing_horizontal_mode');
  assert.deepEqual(p.data, { swing_horizontal_mode: 'on' });
  assert.equal(planAction('climate.clim', 'set_swing_horizontal_mode', 'diagonal', { states: S }).ok, false);
});

test('A5 — la ventilation et le balayage partent par leurs commandes existantes', () => {
  const S = etats({ 'climate.clim': ['cool', CLIM] });
  const f = planAction('climate.clim', 'set_fan_mode', 'high', { states: S });
  assert.deepEqual([f.ok, f.service, f.data], [true, 'set_fan_mode', { fan_mode: 'high' }]);
  const w = planAction('climate.clim', 'set_swing_mode', 'vertical', { states: S });
  assert.deepEqual([w.ok, w.service, w.data], [true, 'set_swing_mode', { swing_mode: 'vertical' }]);
  assert.equal(planAction('climate.clim', 'set_fan_mode', 'turbo', { states: S }).ok, false);
});

test('A5 — un appareil muet n’offre rien à régler', () => {
  for (const etat of ['unavailable', 'unknown']) {
    const r = reglagesAir('climate.clim', etats({ 'climate.clim': [etat, CLIM] }), null);
    assert.deepEqual([r.menus, r.vitesse, r.humidite], [[], null, null]);
  }
  assert.deepEqual(reglagesAir('climate.absent', {}, null).menus, []);
});

test('A5 — les mots : ceux de Home Assistant s’il les a, sinon tels que l’appareil les écrit', () => {
  assert.equal(motReglage('climate', 'fan_mode', 'quiet_mode'), 'Quiet mode');
  assert.equal(motReglage('climate', 'fan_mode', 'auto'), 'Auto');
});

// ─── A5 : la vitesse d'un ventilateur ou d'un purificateur ───────────────────

const VENTILO = (a) => ({ 'fan.air': ['on', { supported_features: 1 | 8 | 2, ...a }] });

test('A5 — la vitesse en crans (percentage_step) : 3 crans, le cran vivant, le pourcentage visé', () => {
  const v = vitesseDuVentilo('fan.air', etats(VENTILO({ percentage: 67, percentage_step: 33.33 }))['fan.air']);
  assert.deepEqual(v.etapes, [1, 2, 3]);
  assert.equal(etapeDe(v, 67), 2);
  assert.equal(etapeDe(v, 100), 3);
  assert.equal(etapeDe(v, 0), null);
  assert.equal(pctDeLEtape(v, 3), 100);
  assert.equal(pctDeLEtape(v, 1), 33);
});

test('A5 — la vitesse sans crans (pas de 1 %) : pas à pas de 10 %, jamais à 0, jamais au-dessus de 100', () => {
  const v = vitesseDuVentilo('fan.air', etats(VENTILO({ percentage: 50 }))['fan.air']);
  assert.deepEqual(v.etapes, []);
  assert.equal(vitesseVoisine(v, 1), 60);
  assert.equal(vitesseVoisine(v, -1), 40);
  assert.equal(vitesseVoisine({ ...v, pct: 95 }, 1), 100);
  assert.equal(vitesseVoisine({ ...v, pct: 100 }, 1), null);
  assert.equal(vitesseVoisine({ ...v, pct: 5 }, -1), 1);
  assert.equal(vitesseVoisine({ ...v, pct: 1 }, -1), null);
});

test('A5 — éteint, « − » ne rallume pas ; « + » démarre à 10 %', () => {
  const v = vitesseDuVentilo('fan.air', { state: 'off', attributes: { supported_features: 1 } });
  assert.equal(v.pct, null);
  assert.equal(vitesseVoisine(v, -1), null);
  assert.equal(vitesseVoisine(v, 1), 10);
});

test('A5 — pas de vitesse sans le bit 1, ni pour autre chose qu’un ventilateur', () => {
  assert.equal(vitesseDuVentilo('fan.air', { state: 'on', attributes: { supported_features: 8 } }), null);
  assert.equal(reglagesAir('fan.air', etats({ 'fan.air': ['on', { supported_features: 8 }] }), null).vitesse, null);
  assert.ok(reglagesAir('fan.air', etats(VENTILO({ percentage: 40 })), null).vitesse);
  // Un climat n'a pas de « vitesse » : sa ventilation est un menu.
  assert.equal(reglagesAir('climate.clim', etats({ 'climate.clim': ['cool', { ...CLIM, percentage: 40 }] }), null).vitesse, null);
});

test('A5 — la vitesse part par `set_percentage`, au pas du ventilateur', () => {
  const S = etats(VENTILO({ percentage: 33, percentage_step: 33.33 }));
  const p = planAction('fan.air', 'set_speed', 67, { states: S });
  assert.deepEqual([p.ok, p.domain, p.service, p.data], [true, 'fan', 'set_percentage', { percentage: 67 }]);
});

// ─── A5 : l'humidité visée ───────────────────────────────────────────────────

const HUMIDIF = (a, etat = 'on') => ({ 'humidifier.air': [etat, { min_humidity: 30, max_humidity: 80, humidity: 52, current_humidity: 47, supported_features: 1, available_modes: ['auto', 'sleep'], mode: 'auto', ...a }] });

test('A5 — un humidificateur offre sa consigne d’humidité, ses bornes et l’humidité mesurée', () => {
  const r = reglagesAir('humidifier.air', etats(HUMIDIF()), null);
  assert.deepEqual(r.humidite, { min: 30, max: 80, valeur: 52, courante: 47 });
  assert.deepEqual(r.menus.map(m => [m.cle, m.titre, m.capacite, m.courant]), [['mode', 'Mode', null, 'auto']]);
});

test('A5 — sans bornes publiées, l’humidité va de 0 à 100 ; sans humidité visée, rien', () => {
  const sansBornes = etats({ 'humidifier.air': ['on', { humidity: 50 }] });
  assert.deepEqual(humiditeVisee('humidifier.air', sansBornes['humidifier.air']), { min: 0, max: 100, valeur: 50, courante: null });
  assert.equal(humiditeVisee('humidifier.air', { state: 'on', attributes: {} }), null);
});

test('A5 — le mode d’un humidificateur vient du bit 1 et de sa liste', () => {
  assert.deepEqual(reglagesAir('humidifier.air', etats(HUMIDIF({ supported_features: 0 })), null).menus, []);
  assert.deepEqual(reglagesAir('humidifier.air', etats(HUMIDIF({ available_modes: ['auto'] })), null).menus, []);
});

test('A5 — l’humidité d’un climat se règle sur son bit (4) : « Consigne d’humidité » aussi pour une clim qui déshumidifie', () => {
  const c = etats({ 'climate.clim': ['dry', { supported_features: 4, humidity: 55, min_humidity: 30, max_humidity: 99, current_humidity: 61 }] });
  assert.deepEqual(reglagesAir('climate.clim', c, null).humidite, { min: 30, max: 99, valeur: 55, courante: 61 });
  const sans = etats({ 'climate.clim': ['dry', { supported_features: 1, humidity: 55 }] });
  assert.equal(reglagesAir('climate.clim', sans, null).humidite, null);
  // Le moteur sait déjà l'envoyer, dans les bornes de l'appareil.
  const p = planAction('climate.clim', 'set_humidity', 120, { states: c });
  assert.deepEqual([p.ok, p.data], [true, { humidity: 99 }]);
});

test('A5 — l’humidité voisine : de 5 en 5 sur une plage large, calée sur le cran, dans les bornes', () => {
  const h = { min: 30, max: 80, valeur: 52, courante: null };
  assert.equal(pasHumidite(h), 5);
  assert.equal(humiditeVoisine(h, 1), 55);
  assert.equal(humiditeVoisine(h, -1), 50);
  assert.equal(humiditeVoisine({ ...h, valeur: 55 }, 1), 60);
  assert.equal(humiditeVoisine({ ...h, valeur: 80 }, 1), null);
  assert.equal(humiditeVoisine({ ...h, valeur: 30 }, -1), null);
  assert.equal(humiditeVoisine({ ...h, valeur: 79 }, 1), 80);
  assert.equal(humiditeVoisine({ ...h, valeur: null }, 1), 35);
  // Une plage étroite : de 1 en 1.
  assert.equal(pasHumidite({ min: 40, max: 55 }), 1);
  assert.equal(humiditeVoisine({ min: 40, max: 55, valeur: 50 }, 1), 51);
});

test('A5 — la consigne envoyée reste dans les bornes de l’appareil', () => {
  const h = { min: 30, max: 80 };
  assert.equal(humiditeBornee(h, 120), 80);
  assert.equal(humiditeBornee(h, 5), 30);
  assert.equal(humiditeBornee(h, 52.4), 52);
});

test('A5 — l’humidificateur n’a pas de capacité de moteur : sa consigne et son mode partent par le service du domaine', () => {
  const appels = [];
  const hass = { states: etats(HUMIDIF()), callService: (d, s, data) => { appels.push([d, s, data]); return Promise.resolve(); } };
  commanderService(hass, 'humidifier.air', 'humidifier', 'set_humidity', { entity_id: 'humidifier.air', humidity: 55 });
  commanderService(hass, 'humidifier.air', 'humidifier', 'set_mode', { entity_id: 'humidifier.air', mode: 'sleep' });
  assert.deepEqual(appels, [
    ['humidifier', 'set_humidity', { entity_id: 'humidifier.air', humidity: 55 }],
    ['humidifier', 'set_mode', { entity_id: 'humidifier.air', mode: 'sleep' }],
  ]);
});

// ─── A5 : le bac ─────────────────────────────────────────────────────────────

const DEHUMIDIF = index(
  ['humidifier.deshu', 'd1'], ['binary_sensor.bac', 'd1', { translationKey: 'tankfull', deviceClass: 'problem' }],
  ['binary_sensor.eau', 'd1', { translationKey: 'water_lacks' }], ['binary_sensor.leve', 'd1', { translationKey: 'water_tank_lifted' }],
  ['binary_sensor.sans_eau', 'd1', { translationKey: 'no_water' }], ['binary_sensor.autre', 'd1', { translationKey: 'autre', deviceClass: 'problem' }],
  ['binary_sensor.ailleurs', 'd2', { translationKey: 'tankfull' }], ['binary_sensor.tank_full_par_son_nom', 'd1'],
);

test('A5 — « Bac plein » : le binaire de l’appareil, par sa clé de traduction, allumé', () => {
  const S = etats({ 'humidifier.deshu': ['on', HUMIDIF()['humidifier.air'][1]], 'binary_sensor.bac': ['on'], 'binary_sensor.eau': ['off'], 'binary_sensor.autre': ['on'], 'binary_sensor.ailleurs': ['on'], 'binary_sensor.tank_full_par_son_nom': ['on'] });
  assert.deepEqual(bacsEnAlerte('humidifier.deshu', S, DEHUMIDIF).map(b => [b.cle, b.texte, b.id]), [['plein', 'Bac plein', 'binary_sensor.bac']]);
});

test('A5 — un binaire nommé « tank_full » sans clé de traduction n’est pas un bac', () => {
  const S = etats({ 'humidifier.deshu': ['on'], 'binary_sensor.bac': ['off'], 'binary_sensor.tank_full_par_son_nom': ['on'] });
  assert.deepEqual(bacsEnAlerte('humidifier.deshu', S, DEHUMIDIF), []);
});

test('A5 — réservoir vide et réservoir retiré se disent, une seule ligne par genre', () => {
  const S = etats({ 'humidifier.deshu': ['on'], 'binary_sensor.eau': ['on'], 'binary_sensor.sans_eau': ['on'], 'binary_sensor.leve': ['on'] });
  assert.deepEqual(bacsEnAlerte('humidifier.deshu', S, DEHUMIDIF).map(b => b.texte).sort(), ['Réservoir retiré', 'Réservoir vide']);
});

test('A5 — le bac éteint, muet ou sans registre ne dit rien', () => {
  const S = etats({ 'humidifier.deshu': ['on'], 'binary_sensor.bac': ['off'] });
  assert.deepEqual(bacsEnAlerte('humidifier.deshu', S, DEHUMIDIF), []);
  assert.deepEqual(bacsEnAlerte('humidifier.deshu', etats({ 'binary_sensor.bac': ['unavailable'] }), DEHUMIDIF), []);
  assert.deepEqual(bacsEnAlerte('humidifier.deshu', etats({ 'binary_sensor.bac': ['on'] }), null), []);
});

test('A5 — le bac se dit même quand l’appareil est muet', () => {
  const S = etats({ 'humidifier.deshu': ['unavailable'], 'binary_sensor.bac': ['on'] });
  const r = reglagesAir('humidifier.deshu', S, DEHUMIDIF);
  assert.deepEqual(r.bacs.map(b => b.cle), ['plein']);
  assert.deepEqual([r.menus, r.humidite], [[], null]);
});

// ─── Le rendu ────────────────────────────────────────────────────────────────

const rendre = (hass, id, style) => renderToStaticMarkup(createElement(ReglagesAir, { hass, id, style }));

test('rendu — un climatiseur : deux menus ; un ventilateur : sa vitesse ; un humidificateur : sa consigne et son mode', () => {
  const hass = { states: etats({ 'climate.clim': ['cool', CLIM], ...VENTILO({ percentage: 40, percentage_step: 33.33 }), ...HUMIDIF() }) };
  const clim = rendre(hass, 'climate.clim');
  assert.match(clim, /data-reglage="fan_mode"/);
  assert.match(clim, /data-reglage="swing_mode"/);
  assert.doesNotMatch(clim, /data-reglage="vitesse"|data-reglage="humidite"/);
  const air = rendre(hass, 'fan.air');
  assert.match(air, /data-reglage="vitesse"/);
  assert.equal((air.match(/aria-pressed/g) || []).length, 3);
  assert.equal((air.match(/aria-pressed="true"/g) || []).length, 1);
  const humide = rendre(hass, 'humidifier.air');
  assert.match(humide, /data-reglage="humidite"/);
  assert.match(humide, /data-reglage="mode"/);
  assert.match(humide, /Humidité 47 %/);
  assert.match(humide, /52 %/);
});

test('rendu — un appareil qui ne sait rien régler n’affiche rien', () => {
  const hass = { states: etats({ 'climate.rad': ['heat', { supported_features: 1 }], 'fan.simple': ['on', { supported_features: 0 }] }) };
  assert.equal(rendre(hass, 'climate.rad'), '');
  assert.equal(rendre(hass, 'fan.simple'), '');
  assert.equal(rendre({ states: {} }, 'fan.absent'), '');
  assert.equal(rendre(null, 'fan.absent'), '');
});

test('rendu — le bac plein se dit, au liseré de panne, avec le registre de l’appareil', () => {
  setLoggiaState({ index: { entityMeta: DEHUMIDIF } });
  try {
    const hass = { states: etats({ 'humidifier.deshu': ['on', HUMIDIF()['humidifier.air'][1]], 'binary_sensor.bac': ['on'] }) };
    const html = rendre(hass, 'humidifier.deshu');
    assert.match(html, /class="o-panne"[^>]*data-bac="plein"/);
    assert.match(html, /Bac plein/);
    // Un appareil sans rien à régler dit quand même son bac.
    const seul = rendre({ states: etats({ 'humidifier.deshu': ['off', {}], 'binary_sensor.bac': ['on'] }) }, 'humidifier.deshu');
    assert.match(seul, /data-bac="plein"/);
    assert.doesNotMatch(seul, /data-panneau="air"/);
  } finally { setLoggiaState({ index: null }); }
});

test('rendu — le panneau prend le style de la fiche qui l’accueille', () => {
  const hass = { states: etats({ 'climate.clim': ['cool', CLIM] }) };
  assert.match(rendre(hass, 'climate.clim', { padding: 18, borderRadius: 33 }), /data-panneau="air" style="padding:18px;border-radius:33px/);
});

// ─── Le branchement : les sources ────────────────────────────────────────────

test('branchement — la fiche du chauffage dit ses seuils et accueille les réglages de l’air', () => {
  const t = lire('src/fichechauffage.jsx');
  // ASSERTION MODIFIÉE (21/11, ADR 0385) : la vanne et les alertes sont deux modules ; la carte ne charge que la vanne.
  assert.match(t, /import \{ vanneDeLAppareil \} from '\.\/chauffageseuils\.js'/);
  assert.match(t, /import \{ signauxDeLAppareil \} from '\.\/chauffagealertes\.js'/);
  assert.match(t, /import \{ ReglagesAir \} from '\.\/reglagesair\.jsx'/);
  assert.match(t, /<SeuilsAppareil alertes=\{signaux\.alertes\} \/>/);
  assert.match(t, /\{thermostat && !mort && <ReglagesAir hass=\{hass\} id=\{ch\.entite\} style=\{PANNEAU_HAUT\} \/>\}/);
  // La plaque, le haut et la carte lisent la même vanne.
  assert.match(t, /enChauffe\(\{ famille: 'thermostat', muet: mort, marche, action: a\.hvac_action, vanne \}\)/);
  assert.match(t, /enChauffe\(\{ famille: 'thermostat', muet: mort, marche, action, vanne: signaux\.vanne \}\)/);
});

test('branchement — la carte du chauffage lit la vanne de l’appareil', () => {
  const t = lire('src/cartes/chauffage.jsx');
  // ASSERTION MODIFIÉE (21/11, ADR 0385) : la carte ne lit que la vanne (`vanneDeLAppareil`), pas les alertes de la fiche.
  assert.match(t, /vanneDeLAppareil\(id, hass && hass\.states, LOGGIA_INDEX && LOGGIA_INDEX\.entityMeta\)/);
  assert.match(t, /enChauffe\(\{ famille: 'thermostat', muet: mort, marche, action: a\.hvac_action, vanne \}\)/);
});

test('branchement — la fiche appareil (fan, humidifier, climate) et la fiche d’un climat d’avant offrent les réglages', () => {
  const t = lire('src/appareils/fiches.jsx');
  // ASSERTION MODIFIÉE (21/11, ADR 0385) : les réglages de l'air se chargent à la demande, la fiche appareil les monte par une coquille.
  assert.match(t, /import\('\.\.\/reglagesair\.jsx'\)\.then\(m => \(\{ default: m\.ReglagesAir \}\)\)/);
  assert.doesNotMatch(t, /^import .* from '\.\.\/reglagesair\.jsx'/m);
  assert.equal((t.match(/<ReglagesAir /g) || []).length, 3);
  assert.match(t, /domDe\(x\.id\) === 'humidifier' \|\| domDe\(x\.id\) === 'climate'/);
  assert.match(t, /\{!mort && <div style=\{\{ marginTop: 12[^}]*\}\}><ReglagesAir id=\{id\} hass=\{hass\} \/><\/div>\}/);
});

test('branchement — jamais de <select> natif, un ListeChoix ; jamais d’entity_id en dur ; la couleur par les variables', () => {
  for (const f of ['src/reglagesair.jsx', 'src/reglagesair.js', 'src/chauffageseuils.js', 'src/chauffagealertes.js']) {
    const code = sansCommentaires(lire(f));
    assert.doesNotMatch(code, /<select\b/, f);
    assert.doesNotMatch(code, /['"`](sensor|binary_sensor|climate|fan|humidifier|number|select)\.[a-z0-9_]+['"`]/, f);
    assert.doesNotMatch(code, /#[0-9a-fA-F]{3,6}\b(?<!#fff)/, f);
  }
  assert.match(lire('src/reglagesair.jsx'), /<ListeChoix /);
  // Les choisis sont le bleu plein.
  assert.match(lire('src/reglagesair.jsx'), /background: on \? 'var\(--o-accent-fond\)' : 'transparent', color: on \? '#fff'/);
});

test('branchement — un geste ne part que sur un toucher : aucune commande hors d’un gestionnaire', () => {
  const code = sansCommentaires(lire('src/reglagesair.jsx'));
  assert.doesNotMatch(code, /useEffect/);
  const hors = code.split('\n').filter(l => /\bcommander(Service)?\(/.test(l) && !/const (choisir|envoyer) = |const parti = /.test(l));
  assert.deepEqual(hors, []);
});

test('branchement — attention.js garde ./i18n.js pour SEUL import', () => {
  const code = sansCommentaires(lire('src/attention.js'));
  const imports = [...code.matchAll(/^\s*import\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/gm)].map(m => m[1]);
  assert.deepEqual(imports, ['./i18n.js']);
});
