// La vue Systeme d'une machine Home Assistant OS (17/09, ADR 0037) : les
// mesures en tuiles, la charge de la derniere heure, les versions, les modules
// complementaires, le reseau, le journal — et rien qui s'affiche sans source.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* La langue de la MACHINE qui lance les tests ne doit rien changer au resultat.
 *
 * `i18n.js` resout sa langue a l'import, d'apres `navigator.language` — que Node
 * publie depuis la version 21, d'apres le systeme. Sur un poste francais les
 * nombres sortaient « 1,9 Go » ; sur le runner d'integration, anglais, « 1.9 Go »
 * et « 14 Sept » : quatre tests verts ici, rouges la-bas. Les attentes sont
 * ecrites en francais, la langue est donc FIXEE avant le premier import — d'ou
 * les imports dynamiques, les seuls a s'executer apres cette ligne. */
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const {
  SEUILS, niveau, enOctets, tailleLisible, paireTailles, nomCarte, dureeLisible, depuisDemarrage, dureeCapteur,
  tuilesMesures, seaux, resumeSerie, lignesVersions, derniereSauvegarde, momentLisible, modulesComplementaires,
  interfaceReseau, debitLisible, baseDeDonnees, etatCloud, journalSysteme, origineJournal, alertesSysteme,
} = await import('../src/systeme.js');
const { capteursHote, interfaceDe } = await import('../src/resolve.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const NL = String.fromCharCode(10);
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const vue = lire('src', 'views', 'systeme.jsx');
const pur = lire('src', 'systeme.js');
const app = lire('src', 'App.jsx');
const css = lire('src', 'index.css');
const en = lire('src', 'langues', 'en.js');
const demo = lire('src', 'demo.js');
const conf = lire('src', 'sysconf.js');
const police = lire('public', 'fonts', 'uicons-regular-rounded.css');
const MIO = 1024 ** 2, GIO = 1024 ** 3;
const e = (state, attributes = {}) => ({ state: String(state), attributes });
const ligneDe = (texte, debut) => { const i = texte.indexOf(debut); assert.ok(i >= 0, debut + ' introuvable'); return texte.slice(i, texte.indexOf(NL, i)); };

test('les seuils : a surveiller, puis critique — la memoire et le disque gardent 85 / 92', () => {
  assert.deepEqual(SEUILS.memoire, [85, 92]);
  assert.deepEqual(SEUILS.disque, [85, 92]);
  assert.equal(niveau(84.9, SEUILS.memoire), 'ok');
  assert.equal(niveau(85, SEUILS.memoire), 'warn');
  assert.equal(niveau(92, SEUILS.memoire), 'bad');
  assert.equal(niveau(69, SEUILS.temperature), 'ok');
  assert.equal(niveau(70, SEUILS.temperature), 'warn');
  assert.equal(niveau(80, SEUILS.temperature), 'bad');
  assert.equal(niveau(null, SEUILS.cpu), 'ok', 'sans mesure, rien a signaler');
  assert.equal(niveau(99, null), 'ok');
});

test('les tailles passent par l’octet et se disent en Go, en Mo', () => {
  assert.equal(enOctets(2540, 'MiB'), 2540 * MIO);
  assert.equal(enOctets('1.5', 'GiB'), 1.5 * GIO);
  assert.equal(enOctets(3, 'GB'), 3e9);
  assert.equal(enOctets(12, '%'), null, 'un pourcentage n’est pas une taille');
  assert.equal(enOctets('unknown', 'MiB'), null);
  assert.equal(tailleLisible(412 * MIO), '412 Mo');
  assert.equal(tailleLisible(1945.6 * MIO), '1,9 Go', 'une decimale sous dix');
  assert.equal(tailleLisible(58.4 * GIO), '58 Go', 'aucune au-dela');
  assert.equal(tailleLisible(8 * GIO), '8 Go', 'pas de « ,0 »');
  assert.equal(tailleLisible(null), null);
  assert.equal(tailleLisible(-1), null);
  assert.equal(paireTailles(2540 * MIO, 8192 * MIO), '2,5 Go / 8 Go');
  assert.equal(paireTailles(82 * MIO, 2048 * MIO), '0,1 Go / 2 Go', 'l’utilise se dit dans l’unite du total');
  assert.equal(paireTailles(58.4 * GIO, 128 * GIO), '58 Go / 128 Go');
  assert.equal(paireTailles(null, 8 * GIO), null);
  assert.equal(paireTailles(1, 0), null);
});

test('la machine : le code de carte du Superviseur devient un nom, un code inconnu reste tel quel', () => {
  assert.equal(nomCarte('rpi5-64'), 'Raspberry Pi 5');
  assert.equal(nomCarte('generic-x86-64'), 'PC x86-64');
  assert.equal(nomCarte('green'), 'Home Assistant Green');
  assert.equal(nomCarte('ova'), 'Machine virtuelle');
  assert.equal(nomCarte('carte-de-demain'), 'carte-de-demain', 'jamais un nom devine');
  assert.equal(nomCarte(null), null);
});

test('« en ligne depuis » : microsecondes du Superviseur, millisecondes, secondes ou date', () => {
  const maintenant = Date.UTC(2026, 8, 17, 12, 0, 0);
  const duree = (12 * 24 + 6) * 3600;
  const demarrage = maintenant - duree * 1000;
  assert.equal(depuisDemarrage(demarrage * 1000, maintenant), duree, 'microsecondes');
  assert.equal(depuisDemarrage(demarrage, maintenant), duree, 'millisecondes');
  assert.equal(depuisDemarrage(demarrage / 1000, maintenant), duree, 'secondes');
  assert.equal(depuisDemarrage(new Date(demarrage).toISOString(), maintenant), duree, 'date');
  assert.equal(depuisDemarrage(String(demarrage * 1000), maintenant), duree, 'un nombre ecrit en texte');
  assert.equal(depuisDemarrage(maintenant + 5000, maintenant), 0, 'une horloge en avance ne rend pas une duree negative');
  assert.equal(depuisDemarrage(null, maintenant), null);
  assert.equal(depuisDemarrage('hier', maintenant), null);
  assert.equal(dureeLisible(duree), '12 j 6 h');
  assert.equal(dureeLisible(6 * 3600 + 12 * 60), '6 h 12 min');
  assert.equal(dureeLisible(12 * 60 + 30), '12 min');
  assert.equal(dureeLisible(null), null);
});

test('la duree d’un capteur, quelle que soit sa forme', () => {
  const maintenant = Date.UTC(2026, 8, 17, 12, 0, 0);
  assert.equal(dureeCapteur('5 days, 03:12', maintenant), '5 j 3 h');
  assert.equal(dureeCapteur('5 Tage, 03:12', maintenant), '5 j 3 h', 'un capteur allemand');
  assert.equal(dureeCapteur('03:12', maintenant), '3 h 12 min');
  assert.equal(dureeCapteur('446400', maintenant), '5 j 4 h', 'des secondes');
  assert.equal(dureeCapteur(new Date(maintenant - 26 * 3600000).toISOString(), maintenant), '1 j 2 h', 'un horodatage de demarrage');
  assert.equal(dureeCapteur('unavailable', maintenant), null);
  assert.equal(dureeCapteur(null, maintenant), null);
});

test('les capteurs freres : le swap, la memoire en octets, les debits de l’interface branchee', () => {
  // Glances en francais, tel qu'une vraie installation le publie.
  const S = {
    // Les leurres D'ABORD : le premier trouve gagne, ils ne doivent pas l'etre.
    'number.hote_swap_limite': e(50, { unit_of_measurement: '%' }),
    'sensor.hote_containers_memory_used': e(900, { unit_of_measurement: 'MiB' }),
    'sensor.hote_utilisation_de_l_espace_d_echange': e(4, { unit_of_measurement: '%' }),
    'sensor.hote_espace_d_echange_utilise': e(0.1, { unit_of_measurement: 'GiB', device_class: 'data_size' }),
    'sensor.hote_espace_d_echange_libre': e(1.9, { unit_of_measurement: 'GiB', device_class: 'data_size' }),
    'sensor.hote_memoire_utilisee': e(2540, { unit_of_measurement: 'MiB' }),
    'sensor.hote_memoire_libre': e(5652, { unit_of_measurement: 'MiB' }),
    'sensor.hote_utilisation_de_la_memoire': e(31, { unit_of_measurement: '%' }),
    'sensor.hote_enp1s0_rx': e(4.2, { unit_of_measurement: 'Mbit/s', device_class: 'data_rate' }),
    'sensor.hote_enp1s0_tx': e(1.1, { unit_of_measurement: 'Mbit/s', device_class: 'data_rate' }),
    'sensor.hote_wlp2s0_rx': e(0, { unit_of_measurement: 'Mbit/s', device_class: 'data_rate' }),
    'sensor.hote_wlp2s0_tx': e(0, { unit_of_measurement: 'Mbit/s', device_class: 'data_rate' }),
    'sensor.hote_docker0_rx': e(9, { unit_of_measurement: 'Mbit/s', device_class: 'data_rate' }),
    'sensor.hote_docker0_tx': e(9, { unit_of_measurement: 'Mbit/s', device_class: 'data_rate' }),
    'sensor.hote_veth00420ac_rx': e(9, { unit_of_measurement: 'Mbit/s', device_class: 'data_rate' }),
    'sensor.hote_veth00420ac_tx': e(9, { unit_of_measurement: 'Mbit/s', device_class: 'data_rate' }),
    'binary_sensor.hote_swap': e('on'),
  };
  assert.deepEqual(capteursHote(Object.keys(S), S), {
    swapPct: 'sensor.hote_utilisation_de_l_espace_d_echange', swapUsed: 'sensor.hote_espace_d_echange_utilise', swapFree: 'sensor.hote_espace_d_echange_libre',
    memUsed: 'sensor.hote_memoire_utilisee', memFree: 'sensor.hote_memoire_libre',
    netIn: 'sensor.hote_enp1s0_rx', netOut: 'sensor.hote_enp1s0_tx',
  }, 'le filaire avant le Wi-Fi, jamais Docker ; la memoire des conteneurs n’est pas celle de la machine');
  // System Monitor en anglais, puis en francais.
  const A = {
    'sensor.system_monitor_swap_use_percent': e(4, { unit_of_measurement: '%' }),
    'sensor.system_monitor_swap_use': e(82, { unit_of_measurement: 'MiB' }),
    'sensor.system_monitor_swap_free': e(1966, { unit_of_measurement: 'MiB' }),
    'sensor.system_monitor_memory_use': e(2540, { unit_of_measurement: 'MiB' }),
    'sensor.system_monitor_memory_free': e(5652, { unit_of_measurement: 'MiB' }),
    'sensor.system_monitor_network_throughput_in_eth0': e(4.2, { unit_of_measurement: 'MB/s', device_class: 'data_rate' }),
    'sensor.system_monitor_network_throughput_out_eth0': e(1.1, { unit_of_measurement: 'MB/s', device_class: 'data_rate' }),
    'sensor.system_monitor_network_throughput_in_lo': e(7, { unit_of_measurement: 'MB/s', device_class: 'data_rate' }),
    'sensor.system_monitor_network_throughput_out_lo': e(7, { unit_of_measurement: 'MB/s', device_class: 'data_rate' }),
  };
  const a = capteursHote(Object.keys(A), A);
  assert.equal(a.swapPct, 'sensor.system_monitor_swap_use_percent');
  assert.equal(a.swapUsed, 'sensor.system_monitor_swap_use');
  assert.equal(a.swapFree, 'sensor.system_monitor_swap_free');
  assert.equal(a.memUsed, 'sensor.system_monitor_memory_use');
  assert.equal(a.memFree, 'sensor.system_monitor_memory_free');
  assert.equal(a.netIn, 'sensor.system_monitor_network_throughput_in_eth0');
  assert.equal(a.netOut, 'sensor.system_monitor_network_throughput_out_eth0');
  const F = {
    'sensor.system_monitor_debit_du_reseau_entrant_via_enp1s0': e(1, { unit_of_measurement: 'MB/s', device_class: 'data_rate' }),
    'sensor.system_monitor_debit_du_reseau_sortant_via_enp1s0': e(2, { unit_of_measurement: 'MB/s', device_class: 'data_rate' }),
  };
  assert.deepEqual(capteursHote(Object.keys(F), F), { netIn: 'sensor.system_monitor_debit_du_reseau_entrant_via_enp1s0', netOut: 'sensor.system_monitor_debit_du_reseau_sortant_via_enp1s0' });
  // Une entite desactivee n'a pas d'etat : elle ne se ramasse pas.
  assert.deepEqual(capteursHote(['sensor.system_monitor_swap_use_percent'], {}), {});
  assert.deepEqual(capteursHote(null, S), {});
  // Un seul sens ne fait pas une interface.
  assert.deepEqual(capteursHote(['sensor.hote_enp1s0_rx'], S), {});
  // Docker n'est JAMAIS l'interface de la machine, meme quand il ne reste que le Wi-Fi.
  assert.deepEqual(capteursHote(['sensor.hote_docker0_rx', 'sensor.hote_docker0_tx', 'sensor.hote_wlp2s0_rx', 'sensor.hote_wlp2s0_tx'], S), { netIn: 'sensor.hote_wlp2s0_rx', netOut: 'sensor.hote_wlp2s0_tx' });
  assert.deepEqual(capteursHote(['sensor.system_monitor_network_throughput_in_lo', 'sensor.system_monitor_network_throughput_out_lo'], A), {}, 'ni la boucle locale');
  assert.equal(interfaceDe('sensor.hote_enp1s0_rx'), 'enp1s0');
  assert.equal(interfaceDe('sensor.system_monitor_network_throughput_in_eth0'), 'eth0');
});

test('la table PRIME sur les freres, et le ramassage ne se refait pas a chaque rendu', () => {
  assert.ok(conf.includes('const avecFreres = (table) => ({ ...table, host: { ...freresDeLHote(table.host || {}), ...(table.host || {}) } });'), 'un capteur choisi a la main n’est jamais remplace');
  assert.ok(conf.includes('if (_freres.index === LOGGIA_INDEX && _freres.cle === cle) return _freres.extra;'), 'une fois par index et par capteur de reference');
  assert.ok(conf.includes('if (!S || !refs.some(ref => S[ref])) return {};'), 'rien n’est retenu tant que les etats ne sont pas la');
  assert.ok(conf.includes("if (cfg && typeof cfg === 'object') return avecFreres({ ...SYS_VIDE(), ...cfg });") && conf.includes('return avecFreres(out);'), 'la table de l’utilisateur comme celle de la decouverte');
  assert.ok(app.includes("systeme: [...sysKeys(), ...cfgKeys('system'), 'update.'],"), 'la vue relit aussi les mises a jour');
});

test('une tuile par mesure CONNUE, dans l’ordre de la maquette, a ses couleurs', () => {
  const tout = tuilesMesures({ cpu: 18, cpuMoyenne: 19.4, memPct: 31, memUtilise: 2540 * MIO, memTotal: 8192 * MIO, temp: 52,
    disquePct: 45.6, disqueUtilise: 58.4 * GIO, disqueTotal: 128 * GIO, swapPct: 4, swapUtilise: 82 * MIO, swapTotal: 2048 * MIO });
  assert.deepEqual(tout.map(t => t.cle), ['cpu', 'memoire', 'temperature', 'disque', 'swap']);
  assert.deepEqual(tout.map(t => t.valeur), ['18 %', '31 %', '52 °C', '46 %', '4 %']);
  assert.deepEqual(tout.map(t => t.sous), ['moy. 19 % sur 1 h', '2,5 Go / 8 Go', 'alerte à 80 °C', '58 Go / 128 Go', '0,1 Go / 2 Go']);
  assert.deepEqual(tout.map(t => t.couleur), ['var(--o-accent-soft)', 'var(--o-purple)', 'var(--o-warn2)', 'var(--o-ok)', 'var(--o-cyan)']);
  assert.deepEqual(tout.map(t => t.rgb), ['var(--o-accent-rgb)', 'var(--o-purple-rgb)', 'var(--o-warn2-rgb)', 'var(--o-ok-rgb)', 'var(--o-cyan-rgb)']);
  assert.deepEqual(tout.map(t => t.court), ['CPU', 'RAM', 'Temp.', 'Disque', 'Swap'], 'le titre court du telephone');
  assert.ok(tout.every(t => t.niveau === 'ok'));
  assert.deepEqual(tuilesMesures({}), [], 'sans capteur, aucune tuile — pas de tirets');
  assert.deepEqual(tuilesMesures({ cpu: 12 }).map(t => [t.cle, t.sous]), [['cpu', null]], 'ni coeurs ni frequence : Home Assistant ne les publie pas');
  assert.equal(tuilesMesures({ memUtilise: 6 * GIO, memTotal: 8 * GIO })[0].valeur, '75 %', 'sans capteur de pourcentage, le rapport');
  assert.equal(tuilesMesures({ disqueUtilise: 64 * GIO, disqueTotal: 128 * GIO })[0].valeur, '50 %');
  assert.equal(tuilesMesures({ swapUtilise: 1 * GIO, swapTotal: 4 * GIO })[0].valeur, '25 %');
  assert.deepEqual(tuilesMesures({ memPct: 93, temp: 74, swapPct: 100, cpu: 140 }).map(t => [t.cle, t.niveau, t.pct]),
    [['cpu', 'bad', 100], ['memoire', 'bad', 93], ['temperature', 'warn', 74], ['swap', 'bad', 100]], 'les niveaux, et une jauge qui ne deborde pas');
  assert.deepEqual(tuilesMesures({ cpu: 75, memPct: 75, temp: 75, disquePct: 75, swapPct: 75 }).map(t => t.niveau), ['warn', 'ok', 'warn', 'ok', 'warn'], 'a chaque mesure SES seuils : 75 % de memoire ou de disque n’alarment personne');
});

test('la charge minute par minute : une minute sans point reprend la derniere valeur connue', () => {
  const fin = 1000 * 60000;
  const debut = fin - 60 * 60000;
  const pts = [
    { t: debut - 5 * 60000, v: 10 },          // avant la fenetre : la valeur d'entree
    { t: debut + 2 * 60000 + 1000, v: 20 },   // minute 2
    { t: debut + 2 * 60000 + 30000, v: 40 },  // minute 2 encore : la moyenne
    { t: debut + 10 * 60000, v: 30 },         // minute 10
    { t: fin, v: 50 },                        // l'instant du releve : derniere barre
    { t: fin + 60000, v: 99 },                // apres : ignore
  ];
  const v = seaux(pts, fin);
  assert.equal(v.length, 60);
  assert.deepEqual([v[0], v[1]], [10, 10], 'la valeur d’avant la fenetre se prolonge');
  assert.equal(v[2], 30, 'la moyenne des points de la minute');
  assert.equal(v[3], 40, 'puis la DERNIERE valeur, pas la moyenne');
  assert.equal(v[9], 40);
  assert.equal(v[10], 30);
  assert.equal(v[58], 30);
  assert.equal(v[59], 50);
  const sans = seaux([{ t: debut + 30 * 60000, v: 7 }], fin);
  assert.equal(sans[29], null, 'avant le premier point il n’y a rien a prolonger');
  assert.equal(sans[30], 7);
  assert.deepEqual(seaux(null, fin).filter(x => x != null), []);
  assert.deepEqual(seaux([{ t: debut + 60000, v: NaN }], fin).filter(x => x != null), [], 'un point illisible ne compte pas');
  assert.deepEqual(seaux([{ t: debut + 5 * 60000, v: 9 }, { t: debut + 60000, v: 3 }], fin).slice(1, 6), [3, 3, 3, 3, 9], 'l’ordre des points n’importe pas');
  assert.deepEqual(seaux([{ t: 500, v: 1 }, { t: 1500, v: 2 }], 2000, 2, 1000), [1, 2], 'le nombre de barres et leur pas se reglent');
  // Dans le desordre : la valeur qui se prolonge est la plus TARDIVE de la minute, pas la derniere lue.
  const desordre = seaux([{ t: debut + 2 * 60000 + 30000, v: 40 }, { t: debut + 2 * 60000 + 1000, v: 20 }, { t: debut - 60000, v: 5 }, { t: debut - 9 * 60000, v: 1 }], fin);
  assert.deepEqual([desordre[0], desordre[2], desordre[3]], [5, 30, 40]);
  assert.deepEqual(resumeSerie([null, 10, 20, 30]), { dernier: 30, moyenne: 20, pic: 30 });
  assert.deepEqual(resumeSerie([40, 10]), { dernier: 10, moyenne: 25, pic: 40 });
  assert.equal(resumeSerie([null, null]), null);
  assert.equal(resumeSerie(null), null);
});

test('les versions : les entites de mise a jour font foi, le Superviseur supplee, Loggia ferme la liste', () => {
  const S = {
    // Le leurre d'abord : meme titre, mais ce n'est pas une entite de mise a jour.
    'sensor.home_assistant_core': e('on', { title: 'Home Assistant Core', installed_version: '0' }),
    'update.coeur_mise_a_jour': e('on', { title: 'Home Assistant Core', installed_version: '2026.3.4', latest_version: '2026.4.0' }),
    'update.superviseur_mise_a_jour': e('off', { title: 'Home Assistant Supervisor', installed_version: '2026.03.2', latest_version: '2026.03.2' }),
    'update.ha_os': e('off', { title: 'Home Assistant Operating System', installed_version: '16.2', latest_version: '16.2' }),
    'update.zigbee2mqtt_mise_a_jour': e('on', { title: 'Zigbee2MQTT', installed_version: '2.1.3', latest_version: '2.1.4' }),
  };
  assert.ok(!/'update\.[a-z_]+'/.test(pur), 'aucun identifiant en dur : il change avec la langue de l’installation');
  assert.deepEqual(lignesVersions({ S, versionLoggia: '3.38.0' }), [
    { cle: 'core', nom: 'Home Assistant Core', version: '2026.3.4', etat: 'dispo', cible: '2026.4.0' },
    { cle: 'supervisor', nom: 'Superviseur', version: '2026.03.2', etat: 'ajour', cible: null },
    { cle: 'os', nom: 'Système d’exploitation', version: '16.2', etat: 'ajour', cible: null },
    { cle: 'interface', nom: 'Interface', version: '3.38.0', etat: null, cible: null },
  ], 'l’entite se retrouve par son TITRE, quel que soit son identifiant ; un module n’est pas une version ; Loggia sans entite : la version, sans pastille');
  const avecLoggia = lignesVersions({ S: { 'update.loggia_update': e('on', { installed_version: '3.37.0', latest_version: '3.38.0' }) }, versionLoggia: '3.37.0' });
  assert.deepEqual(avecLoggia, [{ cle: 'interface', nom: 'Interface', version: '3.37.0', etat: 'dispo', cible: '3.38.0' }]);
  assert.deepEqual(lignesVersions({ S: {}, core: { version: '2026.3.4', version_latest: '2026.4.0', update_available: true }, os: { version: '16.2', update_available: false } }), [
    { cle: 'core', nom: 'Home Assistant Core', version: '2026.3.4', etat: 'dispo', cible: '2026.4.0' },
    { cle: 'os', nom: 'Système d’exploitation', version: '16.2', etat: 'ajour', cible: null },
  ], 'sans entite, ce que le Superviseur repond');
  assert.deepEqual(lignesVersions({ S: {}, versionCore: '2026.3.4' }), [{ cle: 'core', nom: 'Home Assistant Core', version: '2026.3.4', etat: null, cible: null }], 'sans Superviseur : la version du coeur, sans pastille');
  assert.deepEqual(lignesVersions({ S: { 'update.coeur': e('unavailable', { title: 'Home Assistant Core', installed_version: '2026.3.4' }) } }), [], 'une entite indisponible ne dit rien');
  assert.deepEqual(lignesVersions({}), []);
});

test('la derniere sauvegarde : la plus recente, et l’on dit si elle est complete', () => {
  const b = derniereSauvegarde([
    { date: '2026-09-12T03:00:00+00:00', type: 'full', size: 1800 },
    { date: '2026-09-17T03:00:00+00:00', type: 'partial', size_bytes: 500 * MIO },
    { date: 'illisible', type: 'full', size: 1 },
  ]);
  assert.deepEqual(b, { t: Date.parse('2026-09-17T03:00:00+00:00'), octets: 500 * MIO, complete: false }, 'pas la derniere complete : elle daterait de cinq jours');
  assert.deepEqual(derniereSauvegarde([{ date: '2026-09-17T03:00:00+00:00', type: 'full', size: 1945.6 }]), { t: Date.parse('2026-09-17T03:00:00+00:00'), octets: 1945.6 * MIO, complete: true }, 'le Superviseur compte en Mio');
  assert.equal(derniereSauvegarde([]), null);
  assert.equal(derniereSauvegarde(null), null);
  const maintenant = new Date(2026, 8, 17, 12, 0).getTime();
  assert.equal(momentLisible(new Date(2026, 8, 17, 3, 0).getTime(), maintenant), 'aujourd’hui, 03:00');
  assert.equal(momentLisible(new Date(2026, 8, 16, 23, 30).getTime(), maintenant), 'hier, 23:30');
  assert.equal(momentLisible(new Date(2026, 8, 14, 3, 0).getTime(), maintenant), '14 sept., 03:00');
  assert.equal(momentLisible(NaN, maintenant), null);
});

test('les modules : ceux qui tournent d’abord, puis l’alphabet ; les mesures des seuls demarres', () => {
  const addons = [
    { slug: 'c', name: 'Studio Code Server', version: '5.19.0', state: 'stopped', icon: true },
    { slug: 'a', name: 'Zigbee2MQTT', version: '2.1.3', version_latest: '2.1.3', update_available: false, state: 'started', icon: true },
    { slug: 'b', name: 'ESPHome', version: '2026.3.1', version_latest: '2026.3.2', update_available: true, state: 'started' },
    { slug: 'd', name: 'Cassé', version: '1', state: 'error' },
    { name: 'sans identifiant' },
  ];
  const stats = { a: { cpu_percent: 5.2, memory_usage: 412 * MIO, memory_limit: 8192 * MIO, memory_percent: 5 }, b: { cpu_percent: 1.8, memory_usage: 264 * MIO, memory_limit: 8192 * MIO }, c: { cpu_percent: 50, memory_usage: 1 } };
  const m = modulesComplementaires(addons, stats);
  assert.deepEqual(m.liste.map(x => x.nom), ['ESPHome', 'Zigbee2MQTT', 'Cassé', 'Studio Code Server']);
  assert.deepEqual([m.enCours, m.total], [2, 4]);
  assert.deepEqual(m.liste[1], { slug: 'a', nom: 'Zigbee2MQTT', version: '2.1.3', cible: null, demarre: true, erreur: false, icone: true, cpu: 5.2, ram: 412 * MIO, ramPct: 5 });
  assert.equal(m.liste[0].cible, '2026.3.2');
  assert.equal(m.liste[0].icone, false);
  assert.equal(Math.round(m.liste[0].ramPct * 100) / 100, 3.22, 'sans pourcentage publie, l’usage sur la limite');
  assert.deepEqual([m.liste[3].cpu, m.liste[3].ram, m.liste[3].demarre], [null, null, false], 'un module arrete n’a rien a mesurer');
  assert.equal(m.liste[2].erreur, true);
  assert.deepEqual(modulesComplementaires(null, null), { liste: [], enCours: 0, total: 0 });
  assert.deepEqual(modulesComplementaires(addons, null).liste.map(x => x.cpu), [null, null, null, null], 'les mesures arrivent apres la liste');
});

test('le reseau et le stockage : ce qui est su, avec son unite', () => {
  assert.deepEqual(interfaceReseau({ interfaces: [
    { interface: 'wlan0', type: 'wireless', primary: false, connected: true, ipv4: { address: ['192.0.2.30/24'] } },
    { interface: 'eth0', type: 'ethernet', primary: true, connected: true, ipv4: { address: ['192.0.2.20/24'] } },
  ] }), { ip: '192.0.2.20', nom: 'eth0', type: 'Ethernet' });
  assert.deepEqual(interfaceReseau({ interfaces: [{ interface: 'wlan0', type: 'wireless', connected: true, ipv4: { address: ['198.51.100.4/24'] } }] }), { ip: '198.51.100.4', nom: 'wlan0', type: 'Wi-Fi' }, 'sans interface principale, la premiere branchee');
  assert.equal(interfaceReseau({ interfaces: [{ interface: 'eth0', primary: true, ipv4: { address: [] } }] }), null);
  assert.equal(interfaceReseau(null), null);
  assert.equal(debitLisible(e(4.23, { unit_of_measurement: 'Mbit/s' })), '4,2 Mbit/s');
  assert.equal(debitLisible(e(118.6, { unit_of_measurement: 'MB/s' })), '119 MB/s');
  assert.equal(debitLisible(e('unavailable', { unit_of_measurement: 'MB/s' })), null);
  assert.equal(debitLisible(undefined), null);
  assert.deepEqual(baseDeDonnees({ estimated_db_size: '1433.60 MiB', database_engine: 'mysql', database_version: '11.4.2-MariaDB' }), { octets: 1433.6 * MIO, moteur: 'MariaDB' });
  assert.deepEqual(baseDeDonnees({ estimated_db_size: '512.00 MiB', database_engine: 'sqlite', database_version: '3.45.1' }), { octets: 512 * MIO, moteur: 'SQLite' });
  assert.deepEqual(baseDeDonnees({ database_engine: 'mysql', database_version: '8.0.36' }), { octets: null, moteur: 'MySQL' });
  assert.deepEqual(baseDeDonnees({ database_engine: 'postgresql' }), { octets: null, moteur: 'PostgreSQL' });
  assert.equal(baseDeDonnees({}), null);
  assert.equal(baseDeDonnees(null), null);
  assert.equal(etatCloud({ logged_in: true, cloud: 'connected' }), 'connecte');
  assert.equal(etatCloud({ logged_in: true, cloud: 'connecting' }), 'connexion');
  assert.equal(etatCloud({ logged_in: true, cloud: 'disconnected' }), 'deconnecte');
  assert.equal(etatCloud({ logged_in: false, cloud: 'disconnected' }), null, 'sans compte, pas de ligne');
  assert.equal(etatCloud(null), null);
});

test('le journal : deux sources, un seul fil de 24 h, le plus recent d’abord', () => {
  const maintenant = Date.UTC(2026, 8, 17, 12, 0, 0);
  const s = (min) => (maintenant - min * 60000) / 1000;
  const iso = (min) => new Date(maintenant - min * 60000).toISOString();
  const j = journalSysteme({ maintenant,
    erreurs: [
      { name: 'homeassistant.components.mqtt.client', message: ['Connexion perdue' + NL + 'trace'], level: 'WARNING', timestamp: s(95), count: 1 },
      { name: 'custom_components.loggia.store', message: 'Ecriture refusee', level: 'ERROR', timestamp: s(340), count: 3 },
      { name: 'homeassistant.core', message: ['Trop vieux'], level: 'ERROR', timestamp: s(25 * 60), count: 1 },
      { name: 'homeassistant.loader', message: ['Pour information'], level: 'INFO', timestamp: s(400), count: 1 },
    ],
    logbook: [
      { when: iso(10), entity_id: 'update.home_assistant_core_update', name: 'Home Assistant Core Update', state: 'on' },
      { when: iso(20), entity_id: 'update.esphome_update', name: 'ESPHome Update', state: 'off' },
      { when: iso(30), entity_id: 'update.piper_update', name: 'Piper Update', state: 'unavailable' },
      { when: iso(35), entity_id: 'binary_sensor.machine', name: 'Machine', state: 'unavailable' },
      { when: iso(40), entity_id: 'binary_sensor.machine', name: 'Machine', state: 'off' },
      { when: iso(50), entity_id: 'binary_sensor.machine', name: 'Machine', state: 'on' },
      { when: iso(26 * 60), entity_id: 'binary_sensor.machine', name: 'Machine', state: 'on' },
    ] });
  assert.equal(j.total, 7);
  assert.deepEqual(j.lignes.map(l => [l.niveau, l.titre, l.detail]), [
    ['info', 'Mise à jour disponible', 'Home Assistant Core Update'],
    ['info', 'Plus de mise à jour en attente', 'ESPHome Update'],
    ['avert', 'Machine hors ligne', 'Machine'],
    ['info', 'Machine en ligne', 'Machine'],
    ['avert', 'mqtt', 'Connexion perdue'],
    ['erreur', 'loggia', 'Ecriture refusee (×3)'],
    ['info', 'loader', 'Pour information'],
  ], 'un etat indisponible n’est pas un evenement ; la premiere ligne du message seulement ; rien au-dela de 24 h');
  const beaucoup = Array.from({ length: 12 }, (_, i) => ({ name: 'a.b', message: ['m'], level: 'ERROR', timestamp: s(i + 1) }));
  const court = journalSysteme({ maintenant, erreurs: beaucoup, max: 3 });
  assert.deepEqual([court.total, court.lignes.length], [12, 3], 'le compte dit tout, la liste s’arrete');
  assert.equal(journalSysteme({ maintenant, erreurs: beaucoup }).lignes.length, 8, 'huit lignes par defaut');
  assert.deepEqual(journalSysteme({ maintenant }), { total: 0, lignes: [] });
  assert.equal(origineJournal('homeassistant.components.rest.data'), 'rest');
  assert.equal(origineJournal('custom_components.loggia'), 'loggia');
  assert.equal(origineJournal('aiohttp.server'), 'server');
  assert.equal(origineJournal(''), null);
});

test('ce qui demande un regard : rare — une mise a jour en attente n’en fait pas partie', () => {
  assert.deepEqual(alertesSysteme({ memPct: 31, disquePct: 46, temp: 52, enLigne: true, modules: [{ slug: 'a', nom: 'Zigbee2MQTT', erreur: false }] }), []);
  const a = alertesSysteme({ memPct: 93.4, memTexte: '7,5 Go / 8 Go', disquePct: 86, temp: 81, enLigne: false, modules: [{ slug: 'z', nom: 'Zigbee2MQTT', erreur: true }] });
  assert.deepEqual(a.map(x => [x.cle, x.niveau]), [['horsligne', 'bad'], ['memoire', 'bad'], ['disque', 'warn'], ['temperature', 'bad'], ['module:z', 'bad']]);
  assert.equal(a[1].texte, 'Mémoire à 93 % (7,5 Go / 8 Go) — le cœur risque un redémarrage forcé.');
  assert.equal(a[2].texte, 'Partition /data à 86 % — prévoir une purge de la base ou des sauvegardes.');
  assert.equal(a[3].texte, 'Processeur à 81 °C — vérifier la ventilation.');
  assert.equal(a[4].texte, 'Zigbee2MQTT est en erreur.');
  assert.equal(alertesSysteme({ memPct: 85 })[0].niveau, 'warn');
  assert.deepEqual(alertesSysteme({ temp: 72 }).map(x => [x.cle, x.niveau]), [['temperature', 'warn']], 'le processeur previent des 70 °C, avant de brider');
  assert.deepEqual(alertesSysteme({ temp: 69, memPct: 84, disquePct: 84 }), []);
  assert.equal(alertesSysteme({ memPct: 86 })[0].texte, 'Mémoire à 86 % — le cœur risque un redémarrage forcé.', 'sans tailles, pas de parenthese');
  assert.deepEqual(alertesSysteme({}), [], 'sans mesure, rien a signaler');
});

test('la vue : le gabarit des cartes de la maison, partage et non recopie', () => {
  /* Il l'etait, recopie — et ce test comparait les deux copies morceau par
   * morceau pour qu'elles ne derivent pas. Le gabarit vit dans `styles.js`
   * depuis le 23/09 (plan M1) : il n'y a plus qu'a verifier que les deux le
   * prennent la, et que chacune garde SA difference, a decouvert. */
  const styles = readFileSync(join(RACINE, 'src', 'styles.js'), 'utf8');
  for (const morceau of ["display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 172, padding: 16, borderRadius: 'var(--o-radius,18px)'", "border: 'none'", "boxShadow: 'var(--o-shadow,0 6px 16px rgba(0,0,0,.26))'", "background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))'"]) {
    assert.ok(styles.includes(morceau), 'le gabarit commun a perdu : ' + morceau);
  }
  assert.ok(app.includes('const RM_CARD = { ...CARTE_MAISON, transition:'), 'l’Accueil ne part plus du gabarit commun');
  assert.ok(vue.includes('const SYS_CARTE = { ...CARTE_MAISON, boxSizing:'), 'la vue ne part plus du gabarit commun');
  assert.ok(styles.includes('export const ICONE_CARTE = { width: 38, height: 38, borderRadius: 14,'), 'la boite d’icone commune');
  assert.ok(vue.includes('const SYS_ICO = (rgb, col) => ({ ...ICONE_CARTE,') && app.includes('const RM_ICO = (bg, col) => ({ ...ICONE_CARTE,'), 'la meme boite d’icone');
  const tuile = vue.slice(vue.indexOf('function TuileMesure('), vue.indexOf('function PanneauCharge('));
  assert.ok(tuile.indexOf('className="sys-mesure-ico"') < tuile.indexOf('className="sys-mesure-val"') && tuile.indexOf('className="sys-mesure-val"') < tuile.indexOf('className="sys-mesure-titre"'), 'l’icone a gauche, le chiffre a droite, le titre DESSOUS');
  assert.ok(tuile.includes('{t.sous || ESPACE}'), 'la ligne de detail est reservee : les titres s’alignent');
  const module = vue.slice(vue.indexOf('function CarteModule('), vue.indexOf('function PanneauReseau('));
  assert.ok(module.indexOf('<Bascule on={m.demarre}') > 0 && module.indexOf('<Bascule on={m.demarre}') < module.indexOf('<div style={SYS_NOM}>{m.nom}</div>'), 'la bascule en haut a droite, le nom sous l’icone');
  assert.ok(!/border: '[^']*solid/.test(vue), 'aucune carte bordee');
});

test('la vue : les lectures passent par une reference vivante, jamais par `hass` en dependance', () => {
  assert.ok(vue.includes('function useHassVivant(hass) {') && vue.includes('useEffect(() => { ref.current = hass; });'));
  assert.ok(!/\}, \[[^\]]*\bhass\b[^\]]*\]\)/.test(vue), 'aucun effet ne depend de l’objet hass');
  for (const deps of ['}, [connecte, tour, hRef]);', '}, [connecte, type, tour, hRef]);', '}, [connecte, hRef]);', '}, [connecte, ids, tour, hRef]);']) assert.ok(vue.includes(deps), deps);
  assert.ok(vue.includes("hRef.current.callWS({ type: 'supervisor/api', endpoint, method: 'get' }).catch(() => null)"), 'un point qui ne repond pas vaut null');
  assert.ok(vue.includes("const POINTS_SUPERVISEUR = ['/host/info', '/os/info', '/core/info', '/supervisor/info', '/addons', '/backups', '/network/info'];"));
  assert.ok(vue.includes("const demarres = (liste || []).filter(a => a && a.state === 'started');") && vue.includes("lire('/addons/' + a.slug + '/stats')"), 'les mesures des seuls modules demarres');
  assert.ok(vue.includes("{ type: 'system_health/info' }") && vue.includes("if (ev.type === 'finish') arreter();"), 'le flux de sante se ferme quand il a fini');
  assert.ok(vue.includes("if (document.visibilityState === 'visible') { setTour(x => x + 1); setReleve(Date.now()); } }, 60000);"), 'un releve par minute, seulement quand la page se regarde');
  assert.ok(!lire('tests', 'dependances.test.mjs').includes("'src/views/systeme.jsx':"), 'la vue n’a plus aucune dependance omise a justifier');
});

test('la vue : rien sans source, et les gestes qui coutent en deux temps', () => {
  assert.ok(vue.includes('{tuiles.length > 0') && vue.includes('{(series.length > 0 || versions.length > 0) && (') && vue.includes('{modules.total > 0 && ('), 'un bloc sans donnee ne se dessine pas');
  assert.ok(vue.includes('{series.length > 0 && <PanneauCharge') && vue.includes('{versions.length > 0 && <PanneauVersions') && vue.includes('{lignesReseau.length > 0 && <PanneauReseau'));
  assert.ok(!vue.includes("'—'") && !vue.includes('Latence'), 'ni tirets de decor, ni latence sans capteur pour la mesurer');
  assert.ok(vue.includes('if (m.demarre && arme !== m.slug) { setArme(m.slug); minuterie.current = setTimeout(() => setArme(null), 4000); return; }'), 'arreter un module : un premier geste arme');
  assert.ok(vue.includes("endpoint: '/addons/' + m.slug + '/' + (m.demarre ? 'stop' : 'start'), method: 'post', timeout: null })"), 'puis le Superviseur agit, sans delai impose');
  assert.ok(vue.includes('if (arme === ac.id) { setArme(null); onAction(ac.domaine, ac.service); close(); return; }') && vue.includes("domaine: 'hassio', service: 'host_shutdown'"), 'l’alimentation garde ses deux temps, dans une feuille');
  assert.ok(!vue.includes('RoomActivityCard') && !vue.includes('Journal de la maison'), 'le journal de la maison a quitte la vue (retour du 17/09)');
  assert.ok(vue.includes('im.onload = () => { if (vivant) setImage(src); };') && vue.includes("const src = '/api/hassio/addons/' + slug + '/icon';"), 'l’icone du module se precharge, la piece de puzzle tient la place');
});

test('les retouches du 17/09 : le graphe a la hauteur des versions, les modules sans cadre, le journal qui defile a cote du reseau', () => {
  // Le graphe : la grille etire les deux panneaux, le cadre des barres absorbe la difference.
  assert.ok(css.includes('.grid-sys-duo { display: grid; gap: 20px; align-items: stretch; grid-template-columns: minmax(0, 1.9fr) minmax(0, 1fr); }'), 'les deux panneaux d’une rangee ont la meme hauteur');
  assert.ok(vue.includes(`<div className="sys-charge" style={{ ...SYS_PANNEAU, display: 'flex', flexDirection: 'column' }}>`) && vue.includes(`<div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>`), 'le panneau de la charge est une colonne qui s’etire');
  assert.ok(vue.includes('<div className="sys-barres-cadre">') && !/className="sys-barres"[^>]*height: 120/.test(vue), 'plus de hauteur figee sur les barres');
  assert.ok(css.includes('.sys-barres-cadre { position: relative; height: 120px; }') && css.includes('.sys-barres { position: absolute; inset: 0; display: flex; align-items: flex-end; gap: 3px; }'), 'les barres se mesurent contre un cadre de taille connue');
  assert.ok(css.includes('@media (min-width: 1101px) {' + NL + '  .sys-charge .sys-barres-cadre { height: auto; flex: 1 1 120px; min-height: 120px; }'), 'cote a cote, le cadre prend la place qui reste ; en une colonne, 120 px');
  // Les modules : des cartes posees sur la page, plus de boite autour.
  const modules = vue.slice(vue.indexOf('{modules.total > 0 && ('), vue.indexOf('<div className="grid-sys-duo">', vue.indexOf('{modules.total > 0 && (')));
  assert.ok(modules.includes('<div className="grid-sys-modules">') && !modules.includes('SYS_PANNEAU') && !modules.includes('EntetePanneau'), 'ni panneau ni en-tete de panneau autour des modules');
  assert.ok(modules.includes(`fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19`) && modules.includes("{tr('{n} en cours sur {t}', { n: modules.enCours, t: modules.total })}"), 'un titre de section, le compte a droite');
  // Le journal et le reseau cote a cote, le journal defile.
  const pied = vue.slice(vue.lastIndexOf('<div className="grid-sys-duo">'));
  assert.ok(pied.indexOf('<PanneauJournal') > 0 && pied.indexOf('<PanneauJournal') < pied.indexOf('<PanneauReseau'), 'le journal a gauche, le reseau a droite');
  assert.ok(vue.includes(`<div className="sys-journal-liste" style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto' }}>`), 'la liste defile, et ne pese rien dans la hauteur de la rangee');
  assert.ok(css.includes('.sys-journal { min-height: 320px; }') && css.includes('.sys-journal-liste { scrollbar-width: thin;'), 'une hauteur minimale, une barre fine');
  assert.ok(vue.includes('logbook, maintenant, max: 60 });'), 'toute la journee se parcourt, pas huit lignes');
});

test('les icones de la vue existent dans la police', () => {
  const noms = new Set();
  for (const m of vue.matchAll(/<Fi i="([a-z0-9-]+)"/g)) noms.add(m[1]);
  for (const m of vue.matchAll(/<Fi i=\{[^}]*\? '([a-z0-9-]+)' : '([a-z0-9-]+)'\}/g)) { noms.add(m[1]); noms.add(m[2]); }
  for (const m of pur.matchAll(/icone: '([a-z0-9-]+)'/g)) noms.add(m[1]);
  for (const attendu of ['refresh', 'power', 'puzzle', 'cloud-check', 'microchip', 'memory', 'thermometer-half', 'hdd', 'exchange']) assert.ok(noms.has(attendu), attendu + ' n’est plus releve');
  for (const n of noms) assert.ok(police.includes('.fi-rr-' + n + ':before'), n + ' n’existe pas dans la police');
});

test('au telephone les mesures restent sur UNE rangee ; les panneaux se rangent en colonne', () => {
  assert.ok(css.includes('.grid-sys-mesures { display: grid; gap: 14px; grid-template-columns: repeat(var(--sys-n, 5), minmax(0, 1fr)); }'), 'autant de colonnes que de mesures connues');
  assert.ok(vue.includes("<div className=\"grid-sys-mesures\" style={{ '--sys-n': tuiles.length }}>"));
  // Le bloc telephone de CETTE vue : le dernier ouvert avant ses regles — pas le
  // dernier du fichier, qu'une autre vue peut poser apres (la vue des robots, ADR 0042).
  const debutTel = css.lastIndexOf('@media (max-width: 560px) {', css.indexOf('.sys-mesure .sys-mesure-tete'));
  const tel = css.slice(debutTel, css.indexOf('/* ──', debutTel) > 0 ? css.indexOf('/* ──', debutTel) : undefined);
  assert.ok(tel.includes('.sys-mesure .sys-mesure-tete { flex-direction: column !important;') && tel.includes('.sys-mesure .sys-mesure-titre, .sys-mesure .sys-mesure-sous { display: none !important; }') && tel.includes('.sys-mesure .sys-mesure-court { display: block !important;'), 'l’icone au-dessus, le titre court');
  assert.ok(!tel.includes('.grid-sys-mesures { grid-template-columns'), 'jamais deux colonnes forcees');
  assert.ok(css.includes('@media (max-width: 1100px) {' + NL + '  .grid-sys-duo { grid-template-columns: minmax(0, 1fr); }'));
});

test('la demonstration repond comme un Superviseur, et l’anglais suit', () => {
  assert.ok(demo.includes("if (msg && msg.type === 'supervisor/api') return superviseurDemo(msg);") && demo.includes("if (msg && msg.type === 'system_log/list') return Promise.resolve(erreursDemo());") && demo.includes("if (msg && msg.type === 'system_health/info') {") && demo.includes("String(chemin).indexOf('logbook/') === 0"));
  assert.ok(demo.includes("'sensor.system_monitor_processor_use': s(18,") && demo.includes("device: 'sysmon'"), 'un appareil, pour que les freres se retrouvent');
  assert.ok(demo.includes("if (m) m.state = geste[2] === 'start' ? 'started' : 'stopped';"), 'la bascule de la demo repond');
});
