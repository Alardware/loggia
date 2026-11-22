// ─────────────────────────────────────────────────────────────────────────────
// Chantier du 20/11, lot 6 (ADR 0386) : la serrure (A4), la voiture (A11), la litière et la fontaine (A12).
// La logique pure se rejoue à sec ; le branchement se lit dans les sources.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
// Les fiches posent des minuteries d'image : la même amorce que tests/lot16_fiches_panne.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
const A = await import('../src/attention.js');
const D = await import('../src/depart.js');
const C = await import('../src/composes.js');
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const src = (f) => readFileSync(join(SRC, f), 'utf8');

const st = (state, attributes = {}) => ({ state, attributes });
/** Un index de Loggia à la main : `{ id: [appareil, plateforme, clé, classe] }`, et le nom de chaque appareil. */
function index(table, noms = {}) {
  const entityMeta = new Map(Object.entries(table).map(([id, [deviceId, platform, translationKey, deviceClass]]) =>
    [id, { deviceId, platform, translationKey: translationKey || null, deviceClass: deviceClass || null, hidden: false, disabled: false }]));
  const deviceMeta = new Map(Object.entries(noms).map(([d, name]) => [d, { name }]));
  return { entityMeta, deviceMeta };
}
/** Les sources de `src/`, chemins relatifs. */
function fichiersSrc(dir = SRC, base = '') {
  return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? fichiersSrc(p, base + n + '/') : /\.(js|jsx)$/.test(n) ? [base + n] : []; });
}

/* ══════════ A4 — la serrure ══════════ */

test('A4 : une serrure bloquée fait un point « Serrure bloquée », ambre, vers Sécurité', () => {
  const S = { 'lock.entree': st('jammed', { friendly_name: 'Entrée' }), 'lock.garage': st('locked', { friendly_name: 'Garage' }) };
  const p = A.pointsAttention({ S }).filter(x => x.cle.indexOf('serrure:') === 0);
  assert.deepEqual(p.map(x => [x.cle, x.niveau, x.titre, x.sous, x.vue, x.haid, x.icone]),
    [['serrure:lock.entree', 'alerte', 'Serrure bloquée', 'Entrée', 'securite', 'lock.entree', 'lock']]);
});

test('A4 : ni masquée, ni groupe, ni d’un autre état', () => {
  const S = {
    'lock.masquee': st('jammed'), 'lock.groupe': st('jammed', { entity_id: ['lock.a'] }),
    'lock.ouverte': st('unlocked'), 'lock.muette': st('unavailable'),
  };
  const p = A.pointsAttention({ S, masque: (id) => id === 'lock.masquee' });
  assert.deepEqual(p.filter(x => x.cle.indexOf('serrure:') === 0), []);
});

const action = (famille, geste, plus = {}) => ({ famille, geste, portee: 'maison', ...plus });
test('A4 : « Je pars » verrouille-t-il ? Une action Serrures · Verrouiller sur toute la maison, sans condition d’heure', () => {
  assert.equal(D.verrouillePar({ id: 'depart', actions: [action('lumieres', 'eteindre'), action('serrures', 'verrouiller')] }), true);
  assert.equal(D.verrouillePar({ id: 'x', actions: [action('serrures', 'verrouiller', { si: 'toujours' })] }), true);
  assert.equal(D.verrouillePar({ id: 'x', actions: [action('serrures', 'verrouiller', { si: 'nuit' })] }), false, 'la nuit seulement : on ne sait pas');
  assert.equal(D.verrouillePar({ id: 'x', actions: [action('serrures', 'verrouiller', { portee: 'piece', piece: 'Entrée' })] }), false);
  assert.equal(D.verrouillePar({ id: 'x', lien: 'script.partir', actions: [action('serrures', 'verrouiller')] }), false, 'un script : on ne sait pas ce qu’il fait');
  assert.equal(D.verrouillePar({ id: 'x', actions: [action('lumieres', 'eteindre')] }), false);
  assert.equal(D.verrouillePar(null), false);
});

test('A4 : « Avant de partir » dit la serrure que le scénario ne verrouillera pas', () => {
  const S = {
    'lock.entree': st('unlocked', { friendly_name: 'Entrée' }),
    'lock.portillon': st('unlocked', { friendly_name: 'Portillon', code_format: '^\\d{4}$' }),
    'lock.service': st('jammed', { friendly_name: 'Service' }),
    'lock.garage': st('locked', { friendly_name: 'Garage' }),
    'lock.cave': st('locking', { friendly_name: 'Cave' }),
    'lock.muette': st('unavailable', { friendly_name: 'Muette' }),
    'lock.masquee': st('unlocked', { friendly_name: 'Masquée' }),
  };
  const ctx = { masque: (id) => id === 'lock.masquee' };
  const sans = D.restesAvantDepart(S, ctx);
  assert.deepEqual(sans.serrures.map(x => [x.id, x.bloquee, x.code]),
    [['lock.entree', false, false], ['lock.portillon', false, true], ['lock.service', true, false]], 'un scénario qui ne verrouille pas : toutes les ouvertes');
  assert.ok(D.resteQuelqueChose(sans));
  const avec = D.restesAvantDepart(S, { ...ctx, verrouille: true });
  assert.deepEqual(avec.serrures.map(x => x.id), ['lock.portillon', 'lock.service'], 'il verrouillera l’entrée ; pas la serrure à code, ni la bloquée');
  assert.equal(D.resteQuelqueChose(D.restesAvantDepart({ 'lock.entree': st('unlocked') }, { verrouille: true })), false, 'rien qu’il ne fera : rien à dire');
});

test('A4 : la feuille offre « Verrouiller », le pavé de l’alarme pour une serrure à code, « Bloquée » sinon', () => {
  assert.ok(src('app/depart.jsx').includes('export const restesMaintenant = (hass, s = null) => restesAvantDepart(hass && hass.states, { ...CTX, verrouille: verrouillePar(s) });'));
  // La feuille se charge à la demande : ses lignes de serrures ne pèsent rien au démarrage.
  assert.ok(src('app/depart.jsx').includes("const FeuilleDepartContenu = lazyRecharge(() => import('../departfeuille.jsx'));"));
  const f = src('departfeuille.jsx');
  assert.ok(f.includes("import { SaisieCodeAlarme } from './cartescustom/cartes.jsx';"));
  assert.ok(f.includes("commanderService(hass, id, 'lock', 'lock', { entity_id: id, ...(c ? { code: c } : {}) })"));
  assert.ok(f.includes("if (x.code) { setCodePour(x.id); setCode(''); } else verrouiller(x.id);"), 'à code : le pavé d’abord');
  assert.ok(f.includes('{x.bloquee ? <span'), 'bloquée : aucun bouton, le mot');
  assert.ok(!/'unlock'\)/.test(f), 'jamais « Déverrouiller » d’ici');
});

test('A4 : la fiche serrure se charge à la demande ; le démarrage n’en garde que la coquille', () => {
  const fiches = src('appareils/fiches.jsx');
  assert.ok(fiches.includes("const FicheSerrureContent = lazyRecharge(() => import('../ficheserrure.jsx'));"));
  const debut = fiches.indexOf('function RoomLockSheet(');
  const corps = fiches.slice(debut, fiches.indexOf('\n}\n', debut));
  assert.ok(!corps.includes('commanderService'), 'aucune commande dans la coquille');
  for (const f of fichiersSrc()) if (f !== 'appareils/fiches.jsx') assert.ok(!/from '(\.\.?\/)+ficheserrure\.jsx'/.test(src(f)), f + ' importe la fiche au démarrage');
});

test('A4 : une serrure à code ne s’ouvre plus d’un appui de carte : la carte ouvre sa fiche', () => {
  assert.ok(src('cartescustom/cartes.jsx').includes("if (a.code_format && onOpen) { onOpen(id); return; } call('lock', s === 'locked' ? 'unlock' : 'lock');"));
  assert.ok(src('cartes/generique.jsx').includes("if (dom === 'lock' && a.code_format && onOpen) { onOpen(id); return; }"));
});

register('./jsx-hooks.mjs', import.meta.url);
const FicheSerrure = (await import(new URL('../src/ficheserrure.jsx', import.meta.url).href)).default;
const rendre = (attrs, etat = 'locked') => renderToStaticMarkup(createElement(FicheSerrure, { id: 'lock.porte', hass: { states: { 'lock.porte': st(etat, { friendly_name: 'Porte', ...attrs }) } } }));

test('A4 : « Ouvrir » n’existe que si la serrure le déclare (bit 1), en deux appuis', () => {
  assert.ok(rendre({ supported_features: 1 }).includes('Tire le pêne'), 'la rangée « Ouvrir »');
  assert.ok(!rendre({ supported_features: 0 }).includes('Tire le pêne'), 'sans le bit, pas de « Ouvrir »');
  assert.ok(!rendre({}).includes('Tire le pêne'));
  const f = src('ficheserrure.jsx');
  assert.ok(f.includes("<BoutonConfirme libelle={tr('Ouvrir')}"), 'deux appuis : « Confirmer ? »');
  assert.ok(f.includes("onConfirme={() => agir('open')}"));
});

test('A4 : à code, la fiche demande le code AVANT d’agir, et l’envoie avec l’ordre', () => {
  const f = src('ficheserrure.jsx');
  assert.ok(f.includes("const agir = (svc) => { if (a.code_format) { setDemande(svc); setCode(''); } else envoyer(svc); };"));
  assert.ok(f.includes("commanderService(hass, id, 'lock', svc, { entity_id: id, ...(c ? { code: c } : {}) });"));
  assert.ok(f.includes('<SaisieCodeAlarme code={code} setCode={setCode} onValider={valider}'), 'le pavé de l’alarme');
  assert.ok(f.includes('const valider = () => { if (!code || !demande) return;'), 'pas de code, rien ne part');
});

test('A4 : bloquée, la fiche le dit ; morte, ni bascule ni « Ouvrir »', () => {
  assert.ok(rendre({}, 'jammed').includes('Le pêne est coincé'));
  const morte = rendre({ supported_features: 1 }, 'unavailable');
  assert.ok(morte.includes('Indisponible') && !morte.includes('role="switch"') && !morte.includes('Tire le pêne'));
});

/* ══════════ A11 — la voiture, par famille ══════════ */

/* Une voiture aux clés de Tesla Fleet (lues dans `homeassistant/components/tesla_fleet/`). */
const TESLA = {
  'sensor.t_batterie': ['t', 'tesla_fleet', 'charge_state_battery_level', 'battery'],
  'sensor.t_autonomie': ['t', 'tesla_fleet', 'charge_state_battery_range', 'distance'],
  'sensor.t_compteur': ['t', 'tesla_fleet', 'vehicle_state_odometer', 'distance'],
  'sensor.t_charge': ['t', 'tesla_fleet', 'charge_state_charging_state', 'enum'],
  'binary_sensor.t_cable': ['t', 'tesla_fleet', 'charge_state_conn_charge_cable', 'connectivity'],
  'lock.t': ['t', 'tesla_fleet', 'vehicle_state_locked', null],
  'lock.t_trappe': ['t', 'tesla_fleet', 'charge_state_charge_port_latch', null],
  'binary_sensor.t_porte': ['t', 'tesla_fleet', 'vehicle_state_df', 'door'],
  'binary_sensor.t_pneu': ['t', 'tesla_fleet', 'vehicle_state_tpms_soft_warning_fl', 'problem'],
  'sensor.t_pression': ['t', 'tesla_fleet', 'vehicle_state_tpms_pressure_fl', 'pressure'],
  'device_tracker.t': ['t', 'tesla_fleet', 'location', null],
};
const ETATS_TESLA = {
  'sensor.t_batterie': st('64', { device_class: 'battery' }),
  'sensor.t_autonomie': st('287', { device_class: 'distance', state_class: 'measurement' }),
  'sensor.t_compteur': st('24512', { device_class: 'distance', state_class: 'total_increasing' }),
  'sensor.t_charge': st('stopped', { device_class: 'enum', options: ['starting', 'charging', 'stopped', 'complete'] }),
  'binary_sensor.t_cable': st('on', { device_class: 'connectivity' }),
  'lock.t': st('locked'), 'lock.t_trappe': st('unlocked'),
  'binary_sensor.t_porte': st('off', { device_class: 'door' }),
  'binary_sensor.t_pneu': st('off', { device_class: 'problem' }),
  'sensor.t_pression': st('2.9', { device_class: 'pressure' }),
  'device_tracker.t': st('home'),
};

test('A11 : une voiture aux clés de Tesla Fleet : chaque rôle à sa place, la trappe de charge n’est pas le verrou', () => {
  const [v] = C.composesDe(index(TESLA, { t: 'Modèle 3' }), ETATS_TESLA);
  assert.equal(v.genre, 'voiture');
  assert.equal(v.nom, 'Modèle 3');
  assert.deepEqual([v.batterie, v.autonomie, v.compteur, v.charge, v.prise, v.verrou, v.position],
    ['sensor.t_batterie', 'sensor.t_autonomie', 'sensor.t_compteur', 'sensor.t_charge', 'binary_sensor.t_cable', 'lock.t', 'device_tracker.t']);
  assert.deepEqual([v.ouvrants, v.pneus, v.pressions], [['binary_sensor.t_porte'], ['binary_sensor.t_pneu'], ['sensor.t_pression']]);
  assert.equal(C.voitureVerrouillee(v, ETATS_TESLA), true, 'la trappe ouverte ne dit rien des portes');
  assert.equal(C.voitureBranchee(v, ETATS_TESLA), true);
  assert.equal(C.voitureEnCharge(v, ETATS_TESLA), false);
  assert.equal(C.voitureEnCharge(v, { ...ETATS_TESLA, 'sensor.t_charge': st('charging') }), true);
});

test('A11 : sans clé de traduction (Renault) : la classe suffit — batterie, autonomie, verrou binaire « on » = déverrouillé', () => {
  const R = {
    'sensor.r_batterie': ['r', 'renault', null, 'battery'],
    'sensor.r_autonomie': ['r', 'renault', 'battery_autonomy', 'distance'],
    'sensor.r_kilometrage': ['r', 'renault', 'mileage', 'distance'],
    'binary_sensor.r_branchee': ['r', 'renault', null, 'plug'],
    'binary_sensor.r_charge': ['r', 'renault', null, 'battery_charging'],
    'binary_sensor.r_verrou': ['r', 'renault', null, 'lock'],
  };
  const S = { 'sensor.r_autonomie': st('210', { device_class: 'distance', state_class: 'measurement' }), 'binary_sensor.r_verrou': st('on', { device_class: 'lock' }), 'binary_sensor.r_charge': st('on') };
  const [v] = C.composesDe(index(R), S);
  assert.deepEqual([v.batterie, v.autonomie, v.compteur, v.prise, v.charge, v.verrou, v.verrous],
    ['sensor.r_batterie', 'sensor.r_autonomie', 'sensor.r_kilometrage', 'binary_sensor.r_branchee', 'binary_sensor.r_charge', null, ['binary_sensor.r_verrou']]);
  assert.equal(C.voitureVerrouillee(v, S), false, 'un binaire `lock` allumé est déverrouillé');
  assert.equal(C.voitureEnCharge(v, S), true);
});

test('A11 : la batterie de 12 V n’est pas celle de la voiture', () => {
  const K = {
    'sensor.k_12v': ['k', 'kia_uvo', 'car_battery_percentage', 'battery'],
    'sensor.k_ev': ['k', 'kia_uvo', 'ev_battery_percentage', 'battery'],
    'sensor.k_autonomie': ['k', 'kia_uvo', 'ev_driving_range', 'distance'],
    'lock.k': ['k', 'kia_uvo', 'door_lock', null],
  };
  assert.equal(C.composesDe(index(K), { 'sensor.k_autonomie': st('300', { state_class: 'measurement' }) })[0].batterie, 'sensor.k_ev');
  // Sans clé sur la batterie de traction : la seule qui reste, une fois celle de 12 V écartée.
  const sansCle = { ...K, 'sensor.k_ev': ['k', 'kia_uvo', null, 'battery'] };
  assert.equal(C.composesDe(index(sansCle), { 'sensor.k_autonomie': st('300', { state_class: 'measurement' }) })[0].batterie, 'sensor.k_ev');
});

test('A11 : ni un téléphone, ni une station météo, ni une tondeuse, ni un traceur de vélo ne sont des voitures', () => {
  const T = {
    // L'application mobile : un podomètre (une distance), une position, une batterie.
    'sensor.tel_distance': ['tel', 'mobile_app', null, 'distance'], 'device_tracker.tel': ['tel', 'mobile_app', null, null], 'sensor.tel_pile': ['tel', 'mobile_app', null, 'battery'],
    // Une station météo : la distance de la foudre, une pile.
    'sensor.meteo_foudre': ['meteo', 'ecowitt', null, 'distance'], 'sensor.meteo_pile': ['meteo', 'ecowitt', null, 'battery'],
    // Une tondeuse : un compteur, une position, une batterie.
    'lawn_mower.tonte': ['tonte', 'husqvarna_automower', null, null], 'sensor.tonte_distance': ['tonte', 'husqvarna_automower', 'total_drive_distance', 'distance'],
    'device_tracker.tonte': ['tonte', 'husqvarna_automower', null, null],
    // Un traceur de vélo : un cumul de distance et une position.
    'sensor.velo_distance': ['velo', 'traceur', null, 'distance'], 'device_tracker.velo': ['velo', 'traceur', null, null],
  };
  const S = {
    'sensor.tel_distance': st('3200', { state_class: 'total_increasing' }), 'sensor.meteo_foudre': st('12', { state_class: 'measurement' }),
    'sensor.velo_distance': st('812', { state_class: 'total_increasing' }),
  };
  assert.deepEqual(C.composesDe(index(T), S), []);
  // Un téléphone dont la distance du jour n'a pas de classe d'état : seule sa plateforme l'écarte.
  assert.deepEqual(C.composesDe(index(T), { ...S, 'sensor.tel_distance': st('3200') }), []);
});

/* ══════════ A12 — la litière et la fontaine ══════════ */

test('A12 : PetKit (deux intégrations, même domaine) : la litière et la fontaine, chacune ses rôles', () => {
  const P = {
    'binary_sensor.l_bac': ['l', 'petkit', 'waste_bin', 'problem'], 'binary_sensor.l_sable': ['l', 'petkit', 'sand_lack', 'problem'],
    'sensor.l_niveau': ['l', 'petkit', 'litter_level', null], 'sensor.l_etat': ['l', 'petkit', 'litter_state', null],
    'sensor.l_passages': ['l', 'petkit', 'times_used', null], 'switch.l_power': ['l', 'petkit', 'power', null],
    'binary_sensor.f_eau': ['f', 'petkit', 'water_level', 'problem'], 'sensor.f_filtre': ['f', 'petkit', 'filter', null],
    'switch.f_power': ['f', 'petkit', 'power', null], 'button.f_reset': ['f', 'petkit', 'reset_filter', null],
  };
  const [f, l] = C.composesDe(index(P, { l: 'Litière', f: 'Fontaine' }), {});
  assert.deepEqual([l.genre, l.bac, l.sableBas, l.sable, l.etat, l.passages], ['litiere', 'binary_sensor.l_bac', 'binary_sensor.l_sable', 'sensor.l_niveau', 'sensor.l_etat', 'sensor.l_passages']);
  assert.deepEqual([f.genre, f.eauBasse, f.filtre, f.pompe, f.remise], ['fontaine', 'binary_sensor.f_eau', 'sensor.f_filtre', 'switch.f_power', 'button.f_reset']);
});

test('A12 : Litter-Robot : les passages de chaque chat vont à la litière quand il n’y en a qu’une', () => {
  const L = {
    'vacuum.lr': ['lr', 'litterrobot', 'litter_box', null], 'sensor.lr_etat': ['lr', 'litterrobot', 'status_code', 'enum'],
    'sensor.lr_tiroir': ['lr', 'litterrobot', 'waste_drawer', null], 'sensor.lr_niveau': ['lr', 'litterrobot', 'litter_level', null],
    'sensor.chat1_visites': ['chat1', 'litterrobot', 'visits_today', null], 'sensor.chat2_visites': ['chat2', 'litterrobot', 'visits_today', null],
    'sensor.robot_croquettes': ['feeder', 'litterrobot', 'food_level', null],
  };
  const liste = C.composesDe(index(L), {});
  assert.equal(liste.length, 1, 'ni les chats ni le distributeur ne sont des litières');
  assert.deepEqual(liste[0].visites, ['sensor.chat1_visites', 'sensor.chat2_visites']);
  assert.equal(C.bacPlein(liste[0], { 'sensor.lr_etat': st('dfs') }), true, 'le code « tiroir plein »');
  assert.equal(C.bacPlein(liste[0], { 'sensor.lr_etat': st('rdy') }), false);
});

test('A12 : Petlibro : le pourcentage d’une litière est son sable ; un distributeur n’est pas pris', () => {
  const B = {
    'binary_sensor.luma_bac': ['luma', 'petlibro', 'rubbish_full_state', 'problem'], 'sensor.luma_pct': ['luma', 'petlibro', 'weight_percent', null],
    'sensor.dock_pct': ['dock', 'petlibro', 'weight_percent', null], 'sensor.dock_filtre': ['dock', 'petlibro', 'remaining_filter_days', null],
    'sensor.gran_dessicant': ['gran', 'petlibro', 'remaining_desiccant', null], 'binary_sensor.gran_food_low': ['gran', 'petlibro', 'food_low', 'problem'],
  };
  const [dock, luma] = C.composesDe(index(B), {});
  assert.deepEqual([luma.genre, luma.sable, luma.eau], ['litiere', 'sensor.luma_pct', undefined]);
  assert.deepEqual([dock.genre, dock.eau, dock.filtreJours], ['fontaine', 'sensor.dock_pct', 'sensor.dock_filtre']);
});

/* ══════════ Les points d'attention ══════════ */

test('A11 : la voiture ouverte ou déverrouillée ne se dit que la nuit ; un pneu bas, toujours', () => {
  const liste = C.composesDe(index(TESLA, { t: 'Voiture' }), ETATS_TESLA);
  const ouverte = { ...ETATS_TESLA, 'binary_sensor.t_porte': st('on'), 'lock.t': st('unlocked') };
  assert.deepEqual(C.alertesComposes(liste, ouverte, { nuit: false }), [], 'le jour, on la charge, on la vide');
  assert.deepEqual(C.alertesComposes(liste, ouverte, { nuit: true }).map(p => [p.cle, p.niveau, p.titre, p.sous, p.haid]),
    [['voiture:t', 'alerte', 'Voiture ouverte la nuit', 'Voiture', 'binary_sensor.t_porte']], 'ouverte : un point, pas deux');
  assert.deepEqual(C.alertesComposes(liste, { ...ETATS_TESLA, 'lock.t': st('unlocked') }, { nuit: true }).map(p => p.titre), ['Voiture déverrouillée la nuit']);
  assert.deepEqual(C.alertesComposes(liste, { ...ETATS_TESLA, 'binary_sensor.t_pneu': st('on') }).map(p => [p.cle, p.titre]), [['pneu:t', 'Pneu sous-gonflé']]);
});

test('A12 : bac plein et eau qui manque, des alertes ; le sable et le filtre usé, des infos — jamais un seuil deviné', () => {
  const l = { appareil: 'l', nom: 'Litière', genre: 'litiere', bac: 'b.bac', sableBas: 'b.sable', tremie: 's.tremie' };
  const f = { appareil: 'f', nom: 'Fontaine', genre: 'fontaine', eauBasse: 'b.eau', filtre: 's.filtre', filtreJours: 's.jours' };
  const dit = (S) => C.alertesComposes([l, f], S).map(p => [p.cle, p.niveau, p.titre]);
  assert.deepEqual(dit({ 'b.bac': st('on'), 'b.eau': st('on') }), [['litiere:l', 'alerte', 'Bac de la litière plein'], ['fontaine:f', 'alerte', 'Fontaine à remplir']]);
  assert.deepEqual(dit({ 's.tremie': st('litter_low'), 's.filtre': st('0') }), [['litiere:l', 'info', 'Litière à remettre'], ['fontaine:f', 'info', 'Filtre de la fontaine à changer']]);
  assert.deepEqual(dit({ 's.filtre': st('5'), 's.jours': st('2') }), [], '5 % de filtre : rien — le seuil n’est pas le nôtre');
  assert.deepEqual(dit({ 'b.bac': st('unavailable') }), [], 'muet : rien');
});

test('les points des appareils composés passent par `autres` ; l’écran les fait, attention.js n’en apprend rien', () => {
  const autres = [{ cle: 'litiere:l', niveau: 'alerte', titre: 'Bac de la litière plein', sous: 'Litière', vue: 'objets', haid: 'binary_sensor.l_bac' }];
  const S = { 'binary_sensor.l_bac': st('on', { device_class: 'problem' }) };
  const masque = (id) => id === 'binary_sensor.l_bac';
  const p = A.pointsAttention({ S, autres, masque, voisins: () => ['binary_sensor'] });
  assert.deepEqual(p.map(x => [x.cle, x.icone]), [['litiere:l', 'paw']], 'un point, pas de « Défaut signalé » en double');
  assert.ok(A.pointsAttention({ S, voisins: () => ['binary_sensor'] }).some(x => x.cle === 'defaut:binary_sensor.l_bac'), 'témoin : sans masque, le défaut se dirait');
  const att = src('attention.js');
  assert.match(att, /^import \{[^}]+\} from '\.\/i18n\.js';$/m);
  assert.equal((att.match(/^import /gm) || []).length, 1, 'attention.js n’importe que i18n.js');
});

test('les entités d’un appareil composé ne sont pas la maison : `appareilCompose`', () => {
  const ix = index(TESLA);
  assert.equal(C.appareilCompose(ix, ETATS_TESLA, 't'), true);
  assert.equal(C.appareilCompose(ix, ETATS_TESLA, 'autre'), false);
  assert.equal(C.appareilCompose(ix, ETATS_TESLA, null), false);
  const noyau = src('app/noyau.jsx');
  assert.ok(noyau.includes('const deCompose = (d) => { const K = composes(LOGGIA_INDEX); return !!K && K.appareilCompose(LOGGIA_INDEX, (getHass() || {}).states, d); };'));
  assert.ok(noyau.includes('return !!m && (m.hidden || m.disabled || deCompose(m.deviceId));'), 'masqueDe : ni « Avant de partir », ni la rangée sûreté');
  assert.ok(noyau.includes("x.entryType !== 'service' && !deCompose(d);"), 'ni les groupes ni les piles');
  assert.ok(src('cartescustom/cartes.jsx').includes('.filter(o => OUVRANT_DCS.indexOf(o.dc) >= 0 && !deLaVoiture(S, o.id));'), 'les ouvrants de la maison');
  assert.ok(src('accueil/dashboard.jsx').includes('|| masqueDe(id)) return;'), 'une litière n’est pas un robot dans « En ce moment »');
});

/* ══════════ Le branchement ══════════ */

test('la voiture, la litière et la fontaine : une carte par appareil dans Objets, sous IoT, leur popup ailleurs aussi', () => {
  const o = src('vues/objets.jsx');
  assert.ok(o.includes("composesMaison.forEach(c => entree(CLE_COMPOSE + c.appareil, { type: 'app', domaine: c.genre,"));
  assert.ok(o.includes('duCompose.has(meta(id).deviceId)) return;'), 'ni ses capteurs ni ses mesures en cartes à part');
  const f = src('appareils/fiches.jsx');
  assert.ok(f.includes('if (k.indexOf(CLE_COMPOSE) === 0) return <Suspense fallback={<div className="o-rmcard" style={{ height: \'100%\' }} />}><CarteCompose cle={k}'));
  assert.ok(f.includes('{composePop && <Suspense fallback={null}><FicheCompose cle={composePop} hass={hass} onClose={() => setComposePop(null)} /></Suspense>}'));
  assert.ok(src('App.jsx').includes("if (typeof x === 'string' && x.indexOf('obj:app:') === 0) return clesDuCompose(x, LOGGIA_INDEX, (getHass() || {}).states || {});"));
  assert.ok(src('app/noyau.jsx').includes('if (s.indexOf(CLE_COMPOSE) === 0)'), 'le nom d’une clé');
  assert.ok(src('accueil/dashboard.jsx').includes('autres: K ? K.alertesComposes(K.composesDe(LOGGIA_INDEX, etatsAcc), etatsAcc, { nuit: soleilCouche(dashHass) }) : [],'));
  assert.ok(src('ecranveille.jsx').includes('autres: alertesComposes(composesDe(LOGGIA_INDEX, S), S, { nuit: soleilCouche(getHass()) }),'));
});

test('le démarrage n’en garde qu’un relais : la découverte, les coquilles, les cartes et les popups se chargent à la demande', () => {
  const b = src('composesboot.js');
  assert.ok(b.includes("enRoute = import('./composes.js')"), 'la découverte, à la demande');
  assert.ok(b.includes("m.deviceClass === 'distance' || PLATEFORMES_ANIMAUX.indexOf(m.platform) >= 0"), 'et seulement s’il y a de quoi la nourrir');
  const c = src('cartes/compose.jsx');
  assert.ok(c.includes("const voiture = () => import('../voiture.jsx');") && c.includes("const animaux = () => import('../animaux.jsx');"));
  assert.ok(src('appareils/fiches.jsx').includes("const CarteCompose = lazyRecharge(() => import('../cartes/compose.jsx').then(m => ({ default: m.CarteCompose })));"));
  // Seuls des morceaux chargés à la demande importent la découverte, les coquilles et les cartes.
  const A_LA_DEMANDE = ['cartes/compose.jsx', 'voiture.jsx', 'voiturevue.js', 'animaux.jsx', 'animauxvue.js', 'ecranveille.jsx'];
  for (const f of fichiersSrc()) {
    if (A_LA_DEMANDE.indexOf(f) >= 0) continue;
    assert.ok(!/from '(\.\.?\/)+(composes|cartes\/compose|compose|voiture|animaux|voiturevue|animauxvue|departfeuille)\.jsx?'/.test(src(f)), f + ' tire au démarrage un morceau du lot 6');
  }
});

test('la démo porte les cas : le portillon à code, la voiture, la litière et la fontaine, à leurs plateformes et à leurs clés', () => {
  const demo = src('demo.js');
  assert.ok(demo.includes("'lock.portillon': s('unlocked', { friendly_name: 'Portillon', code_format: '^\\\\d{4}$', supported_features: 1 }),"));
  assert.ok(demo.includes("voiture: ['tesla_fleet', {") && demo.includes("litiere: ['petkit', {") && demo.includes("fontaine: ['petkit', {"));
  assert.ok(demo.includes("if (format && !new RegExp(format).test(String((data || {}).code || ''))) {"), 'sans code, la démo refuse comme Home Assistant');
  assert.ok(demo.includes("toucher(lid, accroche ? 'jammed' : vise)"), 'le portillon accroche : « Serrure bloquée » se montre');
});
