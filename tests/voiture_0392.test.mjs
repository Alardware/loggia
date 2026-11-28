// ─────────────────────────────────────────────────────────────────────────────
// La voiture refaite sur ses exemples (ADR 0392) : la découverte de la charge, du climat et de la trappe ; ce que la fiche en
// lit (`detailsVoiture`) ; l'historique de la semaine (`kmParJour`, `sessionsCharge`) ; la carte et sa barre ; la fiche à
// onglets — un onglet, une commande, seulement quand la voiture publie de quoi (règle 46) ; la clim et la trappe d'une voiture
// ne sont ni un thermostat ni un volet. Les `entity_id` sont ceux du test, jamais ceux du code.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);

const { composesDe } = await import('../src/composes.js');
const { vueVoiture, detailsVoiture, kmParJour, sessionsCharge, pointsDe } = await import('../src/voiturevue.js');
const { CarteVoiture, FicheVoiture } = await import('../src/voiture.jsx');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
const TU = new Date().toISOString();
const st = (id, state, attributes = {}) => ({ entity_id: id, state: String(state), attributes, last_changed: TU, last_updated: TU });
const rendre = (C, p) => renderToStaticMarkup(createElement(C, p));

/* ─── La découverte ─── */

// Un index minimal : l'appareil, la plateforme et la clé de traduction de chaque entité.
function indexDe(liste) {
  const entityMeta = new Map(liste.map(([id, cle, extra]) => [id, { deviceId: 'auto1', platform: 'tesla_fleet', translationKey: cle, ...(extra || {}) }]));
  return { entityMeta, deviceMeta: new Map([['auto1', { name: 'Ma voiture' }]]) };
}
const ENTITES = [
  ['sensor.a_batt', 'charge_state_battery_level'], ['sensor.a_range', 'charge_state_battery_range'], ['sensor.a_odo', 'vehicle_state_odometer'],
  ['sensor.a_etat', 'charge_state_charging_state'], ['binary_sensor.a_cable', 'charge_state_conn_charge_cable'], ['lock.a_portes', 'vehicle_state_locked'],
  ['sensor.a_kw', 'charge_state_charger_power'], ['sensor.a_fin', 'charge_state_minutes_to_full_charge'], ['sensor.a_kwh', 'charge_state_charge_energy_added'],
  ['number.a_limite', 'charge_state_charge_limit_soc'], ['number.a_amperes', 'charge_state_charge_current_request'], ['switch.a_charge', 'charge_state_user_charge_enable_request'],
  ['cover.a_trappe', 'charge_state_charge_port_door_open'], ['cover.a_coffre', 'vehicle_state_rt'], ['climate.a_clim', 'driver_temp'],
  ['switch.a_givre', 'climate_state_defrost_mode'], ['switch.a_volant', 'climate_state_steering_wheel_heater'],
  ['sensor.a_int', 'climate_state_inside_temp'], ['sensor.a_ext', 'climate_state_outside_temp'],
];
const ETATS = {
  'sensor.a_batt': st('sensor.a_batt', '64', { device_class: 'battery', unit_of_measurement: '%' }),
  'sensor.a_range': st('sensor.a_range', '287', { device_class: 'distance', unit_of_measurement: 'km', state_class: 'measurement' }),
  'sensor.a_odo': st('sensor.a_odo', '24512', { device_class: 'distance', unit_of_measurement: 'km', state_class: 'total_increasing' }),
  'sensor.a_etat': st('sensor.a_etat', 'charging', { device_class: 'enum', options: ['charging', 'stopped', 'complete'] }),
  'binary_sensor.a_cable': st('binary_sensor.a_cable', 'on', { device_class: 'connectivity' }),
  'lock.a_portes': st('lock.a_portes', 'locked'),
  'sensor.a_kw': st('sensor.a_kw', '7.1', { device_class: 'power', unit_of_measurement: 'kW' }),
  'sensor.a_fin': st('sensor.a_fin', new Date(Date.now() + 100 * 60000).toISOString(), { device_class: 'timestamp' }),
  'sensor.a_kwh': st('sensor.a_kwh', '12.4', { device_class: 'energy', unit_of_measurement: 'kWh' }),
  'number.a_limite': st('number.a_limite', '80', { unit_of_measurement: '%', min: 50, max: 100, step: 1 }),
  'number.a_amperes': st('number.a_amperes', '16', { device_class: 'current', unit_of_measurement: 'A', min: 5, max: 32, step: 1 }),
  'switch.a_charge': st('switch.a_charge', 'on'),
  'cover.a_trappe': st('cover.a_trappe', 'open', { device_class: 'door', supported_features: 3 }),
  'cover.a_coffre': st('cover.a_coffre', 'closed', { device_class: 'door' }),
  'climate.a_clim': st('climate.a_clim', 'off', { hvac_modes: ['off', 'heat_cool'], current_temperature: 11.5, temperature: 20, min_temp: 15, max_temp: 28, target_temp_step: 0.5 }),
  'switch.a_givre': st('switch.a_givre', 'off'),
  'switch.a_volant': st('switch.a_volant', 'off'),
  'sensor.a_int': st('sensor.a_int', '11.5', { device_class: 'temperature', unit_of_measurement: '°C' }),
  'sensor.a_ext': st('sensor.a_ext', '7.6', { device_class: 'temperature', unit_of_measurement: '°C' }),
};
const decouvrir = (liste = ENTITES, S = ETATS) => composesDe(indexDe(liste), S).find(c => c.genre === 'voiture');

test('la découverte trouve la charge en détail, le climat, la trappe et les températures', () => {
  const c = decouvrir();
  assert.equal(c.puissance, 'sensor.a_kw');
  assert.equal(c.fin, 'sensor.a_fin');
  assert.equal(c.ajoutee, 'sensor.a_kwh');
  assert.equal(c.limite, 'number.a_limite');
  assert.equal(c.courant, 'number.a_amperes');
  assert.equal(c.lancer, 'switch.a_charge');
  assert.equal(c.trappeCover, 'cover.a_trappe');
  assert.equal(c.clim, 'climate.a_clim');
  assert.equal(c.climBouton, null);
  assert.equal(c.degivrage, 'switch.a_givre');
  assert.equal(c.volant, 'switch.a_volant');
  assert.equal(c.interieur, 'sensor.a_int');
  assert.equal(c.exterieur, 'sensor.a_ext');
});

test('la trappe de charge n’est pas un ouvrant : branchée, la voiture n’est pas « Ouverte »', () => {
  const c = decouvrir();
  assert.deepEqual(c.ouvrants, ['cover.a_coffre']);
  const v = vueVoiture({ c, S: ETATS });
  assert.notEqual(v.etat, 'ouverte');
  assert.equal(v.etat, 'charge');
});

test('une voiture qui ne publie rien de plus : aucun rôle neuf, ni onglet ni commande', () => {
  const peu = ENTITES.filter(([id]) => ['sensor.a_batt', 'sensor.a_range', 'lock.a_portes'].indexOf(id) >= 0);
  const c = decouvrir(peu);
  ['puissance', 'fin', 'reste', 'ajoutee', 'limite', 'courant', 'lancer', 'demarrer', 'arreter', 'trappeCover', 'clim', 'climBouton', 'degivrage', 'volant', 'interieur', 'exterieur', 'consommation']
    .forEach(k => assert.equal(c[k], null, k));
  const v = vueVoiture({ c, S: ETATS });
  assert.equal(v.charge, null);
  assert.equal(v.climat, null);
  // Sa batterie a son historique : Voiture et Historique, ni Charge ni Climat.
  const html = rendre(FicheVoiture, { c, hass: { states: ETATS } });
  assert.equal((html.match(/role="tab"/g) || []).length, 2);
  assert.ok(!/>Charge</.test(html) && !/>Climat</.test(html));
  // Sans batterie ni compteur : une seule page, pas de barre d'onglets.
  const nue = rendre(FicheVoiture, { c: { ...c, batterie: null, compteur: null }, hass: { states: ETATS } });
  assert.ok(!/role="tab"/.test(nue));
});

test('des boutons de climat et de charge (Renault, BMW) quand il n’y a ni `climate` ni interrupteur', () => {
  const liste = [['sensor.a_batt', 'battery_level'], ['sensor.a_range', 'battery_autonomy'], ['lock.a_portes', 'lock'],
    ['button.a_clim', 'start_air_conditioner'], ['button.a_go', 'start_charge'], ['button.a_stop', 'stop_charge']];
  const S = { ...ETATS, 'button.a_clim': st('button.a_clim', '2026-11-20T10:00:00+00:00'), 'button.a_go': st('button.a_go', '2026-11-20T10:00:00+00:00'), 'button.a_stop': st('button.a_stop', '2026-11-20T10:00:00+00:00') };
  const c = decouvrir(liste, S);
  assert.equal(c.climBouton, 'button.a_clim');
  assert.equal(c.demarrer, 'button.a_go');
  assert.equal(c.arreter, 'button.a_stop');
  const v = vueVoiture({ c, S });
  assert.equal(v.climat && v.climat.domaine, 'button');
  assert.deepEqual(v.charge.commande, { type: 'boutons', demarrer: 'button.a_go', arreter: 'button.a_stop' });
});

test('BMW : l’autonomie totale se trie parmi plusieurs distances', () => {
  const liste = [['sensor.b_batt', 'remaining_battery_percent'], ['sensor.b_tot', 'remaining_range_total'], ['sensor.b_el', 'remaining_range_electric'],
    ['sensor.b_km', 'mileage'], ['lock.b_portes', 'lock']];
  const S = {
    'sensor.b_batt': st('sensor.b_batt', '70', { device_class: 'battery', unit_of_measurement: '%' }),
    'sensor.b_tot': st('sensor.b_tot', '400', { device_class: 'distance', unit_of_measurement: 'km', state_class: 'measurement' }),
    'sensor.b_el': st('sensor.b_el', '250', { device_class: 'distance', unit_of_measurement: 'km', state_class: 'measurement' }),
    'sensor.b_km': st('sensor.b_km', '30000', { device_class: 'distance', unit_of_measurement: 'km', state_class: 'total_increasing' }),
    'lock.b_portes': st('lock.b_portes', 'locked'),
  };
  const c = composesDe(indexDe(liste), S).find(x => x.genre === 'voiture');
  assert.equal(c.compteur, 'sensor.b_km');
  assert.equal(c.autonomie, 'sensor.b_tot');
});

/* ─── Ce que la fiche lit ─── */

test('la charge : puissance, temps restant depuis l’heure de fin, énergie prise, limite et courant réglables', () => {
  const c = decouvrir();
  const maintenant = Date.now();
  const d = detailsVoiture(c, ETATS, { enCharge: true, branchee: true, maintenant });
  assert.equal(d.charge.puissance.valeur, '7,1');
  assert.equal(d.charge.puissance.unite, 'kW');
  assert.ok(d.charge.reste >= 99 && d.charge.reste <= 100, String(d.charge.reste));
  assert.equal(d.charge.ajoutee.valeur, '12,4');
  assert.deepEqual({ n: d.charge.limite.n, reglable: d.charge.limite.reglable, min: d.charge.limite.min, max: d.charge.limite.max }, { n: 80, reglable: true, min: 50, max: 100 });
  assert.equal(d.charge.courant.unite, 'A');
  assert.deepEqual(d.charge.commande, { type: 'switch', id: 'switch.a_charge', on: true });
  assert.deepEqual(d.charge.trappe, { id: 'cover.a_trappe', ouverte: true, peutOuvrir: true, peutFermer: true });
  // Hors charge : ni temps restant ni heure de fin.
  const repos = detailsVoiture(c, ETATS, { enCharge: false, branchee: true, maintenant });
  assert.equal(repos.charge.reste, null);
  assert.equal(repos.charge.fin, null);
});

test('un temps restant publié en minutes ou en heures', () => {
  const c = { ...decouvrir(), reste: 'sensor.a_reste', fin: null };
  const S = (v, u) => ({ ...ETATS, 'sensor.a_reste': st('sensor.a_reste', v, { device_class: 'duration', unit_of_measurement: u }) });
  assert.equal(detailsVoiture(c, S('95', 'min'), { enCharge: true }).charge.reste, 95);
  assert.equal(detailsVoiture(c, S('1.5', 'h'), { enCharge: true }).charge.reste, 90);
});

test('la phrase de la carte en charge dit le temps qui reste', () => {
  const v = vueVoiture({ c: decouvrir(), S: ETATS });
  assert.match(v.phrase.texte, /^En charge · 1 h (39|40)$/);
});

test('le climat : la `climate`, sa consigne, ses bornes, le mode qui l’allume ; les températures', () => {
  const d = detailsVoiture(decouvrir(), ETATS);
  assert.equal(d.climat.domaine, 'climate');
  assert.equal(d.climat.on, false);
  assert.equal(d.climat.consigne, 20);
  assert.deepEqual([d.climat.min, d.climat.max, d.climat.pas], [15, 28, 0.5]);
  assert.equal(d.climat.modeMarche, 'heat_cool');
  assert.deepEqual(d.climat.degivrage, { id: 'switch.a_givre', on: false });
  assert.equal(d.temps.interieur.valeur, '11,5');
  assert.equal(d.temps.exterieur.valeur, '7,6');
});

/* ─── L'historique ─── */

test('les kilomètres de chaque jour : la dernière valeur du jour moins celle de la veille', () => {
  const minuit = new Date(); minuit.setHours(0, 0, 0, 0);
  const t = (j, h) => minuit.getTime() - j * 86400000 + h * 3600000;
  const pts = [[t(3, 1), 100], [t(2, 9), 130], [t(1, 9), 130], [t(1, 18), 175], [t(0, 8), 190]];
  const km = kmParJour(pts, t(0, 12), 3);
  assert.deepEqual(km.map(k => k.km), [30, 45, 15]);
});

test('les recharges : du passage « en charge » à sa fin, la batterie au début et à la fin ; celle en cours d’abord', () => {
  const t0 = Date.parse('2026-11-20T23:30:00Z');
  const etats = [
    { state: 'stopped', last_changed: new Date(t0 - 3600000).toISOString() },
    { state: 'charging', last_changed: new Date(t0).toISOString() },
    { state: 'complete', last_changed: new Date(t0 + 5400000).toISOString() },
    { state: 'charging', last_changed: new Date(t0 + 86400000).toISOString() },
  ];
  const bat = pointsDe([
    { state: '60', last_changed: new Date(t0 - 60000).toISOString() },
    { state: '80', last_changed: new Date(t0 + 5400000).toISOString() },
    { state: '70', last_changed: new Date(t0 + 86400000 - 60000).toISOString() },
  ]);
  const s = sessionsCharge(etats, bat, t0 + 90000000);
  assert.equal(s.length, 2);
  assert.equal(s[0].fin, null);
  assert.deepEqual([s[1].de, s[1].a], [60, 80]);
});

/* ─── Le rendu ─── */

test('la carte porte la barre de la batterie et le trait de la limite ; la compacte, la barre en fil', () => {
  const c = decouvrir();
  const hass = { states: ETATS };
  const large = rendre(CarteVoiture, { c, hass });
  assert.match(large, /data-barre=""/);
  assert.match(large, /data-limite=""/);
  const compacte = rendre(CarteVoiture, { c, hass, chip: true });
  assert.match(compacte, /data-barre=""/);
  assert.ok(!/data-limite=""/.test(compacte), 'la compacte n’a pas le trait');
});

test('la carte porte le dessin de la voiture en filigrane, sans borne (son choix B) ; ni la compacte, ni une muette', () => {
  const c = decouvrir();
  const large = rendre(CarteVoiture, { c, hass: { states: ETATS } });
  assert.match(large, /data-filigrane=""/);
  assert.match(large, /data-voiture="charge"/, 'le dessin dit l’état : en charge');
  assert.ok(/class="vo-photo-sombre"/.test(large) && /class="vo-photo-clair"/.test(large), 'les deux teintes, le thème choisit');
  assert.ok(!/data-borne/.test(large), 'sans la borne');
  assert.ok(!/data-filigrane=""/.test(rendre(CarteVoiture, { c, hass: { states: ETATS }, chip: true })), 'la compacte n’a pas de filigrane');
  const tues = Object.fromEntries(Object.entries(ETATS).map(([k, e]) => [k, { ...e, state: 'unavailable' }]));
  assert.ok(!/data-filigrane=""/.test(rendre(CarteVoiture, { c, hass: { states: tues } })), 'une muette n’a pas de filigrane');
  // Le code d'aperçu des deux cartes est parti.
  assert.ok(!/APERCU-TEMP|apercuvoiture/.test(lire('src/voiture.jsx')));
});

test('la fiche : quatre onglets quand la voiture publie tout, le dessin, aucune commande de déverrouillage', () => {
  const c = decouvrir();
  const html = rendre(FicheVoiture, { c, hass: { states: ETATS } });
  for (const o of ['Voiture', 'Charge', 'Climat', 'Historique']) assert.ok(html.indexOf('>' + o + '<') >= 0, o);
  assert.equal((html.match(/role="tab"/g) || []).length, 4);
  assert.match(html, /data-voiture="charge"/);
  assert.ok(!/Déverrouiller/.test(html));
  const charge = rendre(FicheVoiture, { c, hass: { states: ETATS }, ongletDepart: 'charge' });
  assert.match(charge, /Limite de charge/);
  assert.match(charge, /Courant de charge/);
  assert.match(charge, /Trappe de charge/);
  const climat = rendre(FicheVoiture, { c, hass: { states: ETATS }, ongletDepart: 'climat' });
  assert.match(climat, /Consigne/);
  assert.match(climat, /Volant chauffant/);
});

test('aucune commande que la voiture ne publie pas : une limite seulement lue n’a pas de pas à pas', () => {
  const c = { ...decouvrir(), limite: 'sensor.a_lim', courant: null, lancer: null, trappeCover: null };
  const S = { ...ETATS, 'sensor.a_lim': st('sensor.a_lim', '90', { unit_of_measurement: '%' }) };
  const html = rendre(FicheVoiture, { c, hass: { states: S }, ongletDepart: 'charge' });
  assert.match(html, /Limite de charge/);
  assert.ok(!/Courant de charge/.test(html));
  assert.ok(!/Trappe de charge/.test(html));
  assert.ok(!/role="switch"/.test(html), 'aucune bascule de charge');
  assert.ok(!/aria-label="Limite de charge/.test(html), 'la limite lue ne se règle pas');
});

/* ─── Les sources ─── */

test('la clim et la trappe d’une voiture ne sont ni un thermostat ni un volet ; la feuille à onglets a sa hauteur fixe', () => {
  const noyau = lire('src/app/noyau.jsx');
  assert.match(noyau, /export const entiteDeCompose = /);
  assert.match(noyau, /if \(r && r\.available\) return sansComposes\(r\.list\);/);
  assert.match(lire('src/app/decouverte.jsx'), /!entiteDeCompose\(x\.haid\)/);
  assert.match(lire('src/cartes/compose.jsx'), /<BottomSheet onClose=\{onClose\} onglets=\{c\.genre === 'voiture'\}>/);
  assert.match(lire('src/feuillecarte.jsx'), /autres = null/);
});

test('la voiture est une photo du dépôt, argent au sombre et graphite au clair (son choix du 27/11) ; « réduire les animations » la fige', () => {
  const d = lire('src/dessinvoiture.jsx');
  assert.ok(!/https?:|\.png|\.jpg/.test(d), 'aucune image venue d’ailleurs : deux webp du dépôt');
  // Les images d'aperçu montraient une voiture du commerce : elles ne partent jamais.
  assert.ok(!/apercu-|PROVISOIRE/.test(d), 'les images provisoires sont remplacées');
  assert.match(d, /import photoSombre from '\.\/assets\/voiture\/voiture-argent\.webp';/);
  assert.match(d, /import photoClair from '\.\/assets\/voiture\/voiture-graphite\.webp';/);
  const css = lire('src/index.css');
  assert.match(css, /\.vo-dessin \.vo-photo-clair \{ display: none; \}/);
  assert.match(css, /html\.loggia-light \.vo-dessin \.vo-photo-sombre \{ display: none; \}/);
  assert.match(css, /html\.loggia-light \.vo-dessin \.vo-photo-clair \{ display: inline; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.vo-flux, \.vo-air, \.vo-remplit \{ animation: none !important; \}/);
  assert.match(css, /html\.loggia-calme :is\(\.vo-flux, \.vo-air, \.vo-remplit\) \{ animation: none !important; \}/);
});
