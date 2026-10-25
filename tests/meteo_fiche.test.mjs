// La météo : widget et popup (handoff « Cartes météo », 20/10). Ce que la
// maquette ajoute se calcule ici, à sec, dans meteo.js : le nom de la ville, la
// phrase qui répond, le soleil, la semaine en barres, les tuiles, les risques
// et la vigilance vue du widget. Rien ne s'invente : sans prévision, pas de
// phrase ; sans attribut, pas de tuile.

import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { nomVille, phraseMeteo, soleilMeteo, vigilanceWidget } = await import('../src/meteo.js');
const { semaineMeteo, tuilesMeteo, risquesMeteo, motVent, motNuages, zoneUV } = await import('../src/meteofiche.js');

const iso = (t) => new Date(t).toISOString();
const maintenant = new Date(2026, 9, 20, 14, 40).getTime();
const heure = (h, j = 20) => new Date(2026, 9, j, h, 0).getTime();
const minuit = (j) => iso(new Date(2026, 9, j, 0, 0).getTime());
const soleil = { state: 'above_horizon', attributes: { next_setting: iso(heure(19) + 2 * 60000), next_rising: iso(heure(8, 21) + 12 * 60000) } };

test('le nom de la ville : « Météo-France forecast for city Sainte-Solange » devient « Sainte-Solange »', () => {
  assert.equal(nomVille('Météo-France forecast for city Sainte-Solange'), 'Sainte-Solange');
  assert.equal(nomVille('Forecast for city Paris'), 'Paris');
  assert.equal(nomVille('Météo Sainte-Solange'), 'Météo Sainte-Solange', 'un nom choisi par l’utilisateur reste tel quel');
  assert.equal(nomVille('Maison'), 'Maison');
  assert.equal(nomVille(''), null);
  assert.equal(nomVille(null), null);
});

test('la phrase répond à la question qu’on se pose : la pluie des prochaines heures d’abord', () => {
  const heures = [
    { datetime: iso(heure(15)), condition: 'cloudy', precipitation_probability: 30 },
    { datetime: iso(heure(16)), condition: 'rainy', precipitation_probability: 70, precipitation: 2.1 },
    { datetime: iso(heure(17)), condition: 'rainy', precipitation_probability: 90, precipitation: 2.5 },
    { datetime: iso(heure(18)), condition: 'rainy', precipitation_probability: 80, precipitation: 1.4 },
    { datetime: iso(heure(19)), condition: 'cloudy', precipitation_probability: 40 },
    { datetime: iso(heure(20)), condition: 'partlycloudy', precipitation_probability: 10 },
  ];
  const p = phraseMeteo({ heures, jours: null, maintenant, soleil });
  assert.equal(p.texte, 'Pluie vers 16 h, jusqu’à 19 h');
  assert.equal(p.conseil, 'Rentrez le linge avant 16 h. Environ 6 mm attendus.');
  assert.equal(p.ton, 'cold', 'la pluie teinte en froid');
  // La pluie déjà là : « Pluie jusqu’à … », sans conseil sur le linge.
  const dejaLa = phraseMeteo({ heures, jours: null, maintenant: heure(16) + 20 * 60000, soleil, etat: { state: 'rainy' } });
  assert.equal(dejaLa.texte, 'Pluie jusqu’à 19 h');
  assert.equal(dejaLa.conseil, 'Environ 4 mm encore attendus.');
});

test('sans pluie dans les heures, le premier jour de pluie de la semaine : « Sec jusqu’à samedi »', () => {
  const jours = [
    { datetime: minuit(20), condition: 'partlycloudy', precipitation_probability: 10, precipitation: 0 },
    { datetime: minuit(21), condition: 'sunny', precipitation_probability: 0, precipitation: 0 },
    { datetime: minuit(22), condition: 'rainy', precipitation_probability: 80, precipitation: 12 },
    { datetime: minuit(23), condition: 'partlycloudy', precipitation_probability: 30 },
  ];
  const heures = [{ datetime: iso(heure(15)), condition: 'sunny', precipitation_probability: 0 }, { datetime: iso(heure(16)), condition: 'sunny', precipitation_probability: 0 }];
  const p = phraseMeteo({ heures, jours, maintenant, soleil });
  assert.equal(p.texte, 'Sec jusqu’à jeudi', 'le 22 octobre 2026 est un jeudi');
  assert.equal(p.conseil, 'La pluie arrive jeudi, autour de 12 mm.');
  assert.equal(p.ton, null);
  // Demain : « Sec jusqu’à demain ».
  assert.equal(phraseMeteo({ heures, jours: [jours[0], { ...jours[2], datetime: minuit(21) }], maintenant, soleil }).texte, 'Sec jusqu’à demain');
  // Toute la semaine sèche : on le dit, sans conseil.
  const sec = phraseMeteo({ heures, jours: jours.map(j => ({ ...j, precipitation_probability: 5, precipitation: 0, condition: 'sunny' })), maintenant, soleil });
  assert.equal(sec.texte, 'Sec toute la semaine');
  assert.equal(sec.conseil, null);
});

test('la nuit : le minimum au réveil, et le gel s’il menace', () => {
  const nuit = { state: 'below_horizon', attributes: { next_rising: iso(heure(8, 21) + 12 * 60000), next_setting: iso(heure(19, 21)) } };
  const t = new Date(2026, 9, 20, 23, 10).getTime();
  const heures = [
    { datetime: iso(heure(0, 21)), condition: 'clear-night', temperature: 11 },
    { datetime: iso(heure(3, 21)), condition: 'clear-night', temperature: 8 },
    { datetime: iso(heure(6, 21)), condition: 'clear-night', temperature: 6 },
    { datetime: iso(heure(7, 21)), condition: 'clear-night', temperature: 6 },
    { datetime: iso(heure(9, 21)), condition: 'sunny', temperature: 9 },
  ];
  const p = phraseMeteo({ heures, jours: null, maintenant: t, soleil: nuit });
  assert.equal(p.texte, 'Fraîche au réveil : 6° vers 6 h');
  assert.equal(p.conseil, 'Ciel dégagé toute la nuit, sans risque de gel.');
  const gel = phraseMeteo({ heures: heures.map(h => ({ ...h, temperature: h.temperature - 7 })), jours: null, maintenant: t, soleil: nuit });
  assert.equal(gel.texte, 'Gel au réveil : -1° vers 6 h');
  assert.equal(gel.conseil, 'Protégez les plantes sensibles.');
  assert.equal(gel.ton, 'cold');
});

test('sans prévision, pas de phrase', () => {
  assert.equal(phraseMeteo({ heures: null, jours: null, maintenant, soleil }), null);
  assert.equal(phraseMeteo({ heures: [], jours: [], maintenant, soleil }), null);
  assert.equal(phraseMeteo({}), null);
});

test('le soleil : de jour le coucher, de nuit le prochain lever — lu dans sun.sun', () => {
  assert.deepEqual(soleilMeteo(maintenant, soleil), { jour: true, libelle: 'Coucher 19:02', heure: '19:02', autre: '08:12' });
  const t = new Date(2026, 9, 20, 23, 10).getTime();
  const nuit = { state: 'below_horizon', attributes: { next_rising: iso(heure(8, 21) + 13 * 60000), next_setting: iso(heure(19, 21)) } };
  assert.deepEqual(soleilMeteo(t, nuit), { jour: false, libelle: 'Lever 08:13', heure: '08:13', autre: '19:00' });
  assert.equal(soleilMeteo(maintenant, null), null, 'sans sun.sun, rien');
  assert.equal(soleilMeteo(maintenant, { state: 'above_horizon', attributes: {} }), null);
});

test('la semaine : une barre par jour entre son minimum et son maximum, sur l’échelle de la semaine', () => {
  const jours = [
    { datetime: minuit(20), condition: 'partlycloudy', temperature: 24, templow: 11, precipitation_probability: 0 },
    { datetime: minuit(21), condition: 'sunny', temperature: 23, templow: 10, precipitation_probability: 0 },
    { datetime: minuit(22), condition: 'rainy', temperature: 17, templow: 12, precipitation_probability: 80 },
    { datetime: minuit(23), condition: 'partlycloudy', temperature: 16, templow: 9, precipitation_probability: 30 },
    { datetime: minuit(24), condition: 'cloudy', temperature: 15, templow: 8, precipitation_probability: 20 },
    { datetime: minuit(25), condition: 'sunny', temperature: 15, templow: 6, precipitation_probability: 0 },
    { datetime: minuit(26), condition: 'partlycloudy', temperature: 16, templow: 7, precipitation_probability: 10 },
    { datetime: minuit(27), condition: 'sunny', temperature: 18, templow: 8, precipitation_probability: 0 },
  ];
  const s = semaineMeteo(jours, 22.1, maintenant, soleil);
  assert.equal(s.length, 7, 'sept jours, pas huit');
  assert.deepEqual(s.map(j => j.libelle), ['Auj.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.', 'lun.']);
  assert.deepEqual(s[0], { cle: minuit(20), libelle: 'Auj.', mode: 'partly', min: '11°', max: '24°', pluie: null, gauche: 5 / 18, largeur: 13 / 18, maintenant: (22.1 - 6) / 18 }, 'l’échelle va du minimum (6) au maximum (24) de la semaine ; aujourd’hui porte le repère');
  assert.equal(s[2].pluie, '80 %', 'la probabilité dès 20 %');
  assert.equal(s[4].pluie, '20 %');
  assert.equal(s[6].pluie, null, 'sous 20 %, rien');
  assert.equal(s[1].maintenant, null, 'le repère n’est que sur aujourd’hui');
  assert.equal(s[2].mode, 'rain');
  assert.deepEqual(semaineMeteo([jours[0]], 22, maintenant, soleil), [], 'un jour seul ne fait pas une semaine');
  assert.deepEqual(semaineMeteo(null, 22, maintenant, soleil), []);
  const sansMin = semaineMeteo(jours.map(j => ({ ...j, templow: undefined })), 22, maintenant, soleil);
  assert.equal(sansMin.length, 7);
  assert.equal(sansMin[0].min, null, 'sans minimum, la barre n’a pas de gauche à dire');
  assert.equal(sansMin[0].largeur, null);
});

test('les tuiles : vent, humidité, UV, nuages, pluie du jour, soleil — chacune seulement si l’entité la donne', () => {
  const a = { wind_speed: 4, wind_speed_unit: 'km/h', wind_bearing: 45, humidity: 65, uv_index: 3, cloud_coverage: 30, precipitation_unit: 'mm' };
  const jours = [{ datetime: minuit(20), precipitation: 0, precipitation_probability: 0 }];
  const t = tuilesMeteo({ attributs: a, jours, heures: null, maintenant, soleil });
  assert.deepEqual(t.map(x => x.cle), ['vent', 'humidite', 'uv', 'nuages', 'pluie', 'soleil']);
  assert.deepEqual(t[0], { cle: 'vent', titre: 'Vent', valeur: '4 km/h', sous: 'Du nord-est · très léger', fleche: 225 });
  assert.deepEqual(t[1], { cle: 'humidite', titre: 'Humidité', valeur: '65 %', sous: null });
  assert.equal(t[2].valeur, '3');
  assert.equal(t[2].sous, 'Modéré');
  assert.equal(t[2].uv.zone, 1);
  assert.ok(Math.abs(t[2].uv.position - 3.5 / 13) < 1e-9);
  assert.deepEqual(t[3], { cle: 'nuages', titre: 'Nuages', valeur: '30 %', sous: 'Peu nuageux' });
  assert.deepEqual(t[4], { cle: 'pluie', titre: 'Pluie aujourd’hui', valeur: '0 mm', sous: 'Aucune prévue' });
  assert.deepEqual(t[5], { cle: 'soleil', titre: 'Soleil', valeur: '19:02', sous: 'Coucher · lever à 08:12' });
  // La pluie du jour, avec ses heures : « Surtout de 16 h à 19 h ».
  const heures = [
    { datetime: iso(heure(16)), precipitation: 2.1, precipitation_probability: 70 },
    { datetime: iso(heure(17)), precipitation: 2.5, precipitation_probability: 90 },
    { datetime: iso(heure(18)), precipitation: 1.4, precipitation_probability: 80 },
  ];
  const pluie = tuilesMeteo({ attributs: a, jours: [{ datetime: minuit(20), precipitation: 6, precipitation_probability: 70 }], heures, maintenant, soleil }).find(x => x.cle === 'pluie');
  assert.deepEqual(pluie, { cle: 'pluie', titre: 'Pluie aujourd’hui', valeur: '6 mm', sous: 'Surtout de 16 h à 19 h' });
  // Chaque tuile manque seule.
  const peu = tuilesMeteo({ attributs: { humidity: 50 }, jours: null, heures: null, maintenant, soleil: null });
  assert.deepEqual(peu.map(x => x.cle), ['humidite']);
  assert.deepEqual(tuilesMeteo({ attributs: {}, jours: null, heures: null, maintenant, soleil: null }), []);
  // Le vent sans direction : la valeur, sans flèche ni sous-titre de direction.
  const vent = tuilesMeteo({ attributs: { wind_speed: 48 }, jours: null, heures: null, maintenant, soleil: null })[0];
  assert.deepEqual(vent, { cle: 'vent', titre: 'Vent', valeur: '48 km/h', sous: 'assez fort', fleche: null });
});

test('les mots du vent, des nuages et de l’UV', () => {
  assert.deepEqual([3, 10, 25, 45, 55, 70].map(motVent), ['très léger', 'léger', 'modéré', 'assez fort', 'fort', 'très fort']);
  assert.deepEqual([5, 20, 50, 85].map(motNuages), ['Ciel clair', 'Peu nuageux', 'Nuageux', 'Couvert']);
  assert.deepEqual([0, 2, 3, 5, 6, 7, 8, 10, 11].map(zoneUV), [0, 0, 1, 1, 2, 2, 3, 3, 4]);
});

test('les risques : pluie, neige, gel sur les prochaines heures — la plus forte probabilité, le gel par la température', () => {
  const heures = [
    { datetime: iso(heure(15)), condition: 'cloudy', precipitation_probability: 30, temperature: 12 },
    { datetime: iso(heure(16)), condition: 'rainy', precipitation_probability: 70, temperature: 11 },
    { datetime: iso(heure(17)), condition: 'snowy', precipitation_probability: 60, temperature: 1 },
    { datetime: iso(heure(18)), condition: 'cloudy', precipitation_probability: 20, temperature: -1 },
  ];
  assert.deepEqual(risquesMeteo(heures, maintenant), [{ cle: 'pluie', titre: 'Pluie', valeur: 70 }, { cle: 'neige', titre: 'Neige', valeur: 60 }, { cle: 'gel', titre: 'Gel', valeur: 25 }],
    'le gel : la part des heures à 0° ou moins (une sur quatre)');
  assert.deepEqual(risquesMeteo([{ datetime: iso(heure(15)), condition: 'sunny', precipitation_probability: 0, temperature: 20 }], maintenant), [{ cle: 'pluie', titre: 'Pluie', valeur: 0 }, { cle: 'neige', titre: 'Neige', valeur: 0 }, { cle: 'gel', titre: 'Gel', valeur: 0 }]);
  assert.deepEqual(risquesMeteo([{ datetime: iso(heure(15)), condition: 'rainy' }], maintenant), [], 'sans probabilité ni température, rien à dire');
  assert.deepEqual(risquesMeteo(null, maintenant), []);
});

test('la vigilance vue du widget : orange et rouge le teintent et prennent la phrase, le jaune reste dans la popup', () => {
  const S = { 'sensor.x_weather_alert': { state: 'Orange', attributes: { 'Vent violent': 'Orange', 'Orages': 'Vert' } } };
  const v = vigilanceWidget(S, 'sensor.x_weather_alert');
  assert.deepEqual(v, { niveau: 'orange', ton: 'warn2', texte: 'Vigilance orange · Vent violent', widget: true });
  const jaune = vigilanceWidget({ 'sensor.x_weather_alert': { state: 'Jaune', attributes: { 'Orages': 'Jaune' } } }, 'sensor.x_weather_alert');
  assert.deepEqual(jaune, { niveau: 'jaune', ton: 'warn', texte: 'Vigilance jaune · Orages', widget: false }, 'jaune : pas de bruit sur l’Accueil');
  assert.equal(vigilanceWidget({ 'sensor.x_weather_alert': { state: 'Vert', attributes: {} } }, 'sensor.x_weather_alert').widget, false);
  assert.equal(vigilanceWidget(S, null), null, 'sans capteur, rien');
  const rouge = vigilanceWidget({ 'binary_sensor.meteoalarm': { state: 'on', attributes: { device_class: 'safety', attribution: 'MeteoAlarm', severity: 'Severe', event: 'Vent violent' } } }, 'binary_sensor.meteoalarm');
  assert.deepEqual(rouge, { niveau: 'rouge', ton: 'bad', texte: 'Vigilance rouge · Vent violent', widget: true }, 'MeteoAlarm aussi');
});
