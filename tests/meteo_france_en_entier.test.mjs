/* Météo-France en entier (01/11, ADR 0309 ; lot 5 du rapport Gladys : D14, W1, W2).
 *
 *  - D14 / W2 : la prévision horaire de Météo-France n'a pas de `precipitation_probability`. Le cadre Risques écrivait
 *    « Pluie 0 % · Neige 0 % » sous l'averse. Sans valeur connue, la case ne s'affiche plus ; les probabilités se lisent dans les
 *    capteurs `rain_chance`, `snow_chance`, `freeze_chance` de la même ville — reconnus par le composant à leur identifiant
 *    stable, rattachés par l'appareil.
 *  - W1 : la pluie dans l'heure, lue dans `next_rain` et son attribut `1_hour_forecast` : « Pluie dans 20 min, pendant 25 min
 *    environ », dans la phrase du widget et de la fiche. Rien quand il ne pleut pas dans l'heure.
 *  - La démo porte le cas. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Paris';
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const { composant, rendre } = await import('./rendu.mjs');
const { capteursMeteo, pluieDansLheure, phraseMeteo } = await import('../src/meteo.js');
const { risquesMeteo } = await import('../src/meteofiche.js');
const { setLoggiaState } = await import('../src/state.js');
const { registresDuComposant, buildIndex } = await import('../src/discovery.js');
const { maisonMesuresDemo, capteursMeteoFranceDemo, METEO_FRANCE_DEMO } = await import('../src/demo.js');

const MIN = 60000;
const REF = Date.UTC(2026, 10, 1, 13, 30);
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', '+00:00');
const TRANCHES = [0, 5, 10, 15, 20, 25, 35, 45, 55];
/* Le capteur `next_rain` tel que l'intégration le publie (forme relevée dans l'historique d'une installation) : les neuf tranches
 * de « 0 min » à « 55 min », la description en français de Météo-France ; l'état, l'heure de la première tranche pluvieuse. */
const pluieHeure = (desc, debut = null, ref = REF) => ({
  state: debut == null ? 'unknown' : iso(ref + debut * MIN),
  attributes: { forecast_time_ref: iso(ref), '1_hour_forecast': Object.fromEntries(TRANCHES.map(m => [m + ' min', desc(m)])), device_class: 'timestamp' },
});
const entre = (a, b, mot = 'Pluie faible', sec = 'Temps sec') => (m) => (m >= a && m < b ? mot : sec);

test('W1 : une averse dans 20 minutes, pour 25 minutes — sa fin est la première tranche sèche', () => {
  const r = pluieDansLheure(pluieHeure(entre(20, 45), 20), REF);
  assert.deepEqual(r, { texte: 'Pluie dans 20 min, pendant 25 min environ', dans: 20, duree: 25 });
  assert.equal(pluieDansLheure(pluieHeure(entre(20, 45), 20), REF + 3 * MIN).texte, 'Pluie dans 15 min, pendant 25 min environ', 'les minutes au pas de 5 de la prévision');
});

test('W1 : rien quand il ne pleut pas dans l’heure, ni sur une prévision périmée ou une averse passée', () => {
  assert.equal(pluieDansLheure(pluieHeure(() => 'Temps sec', null), REF), null, 'l’état est vide sans pluie dans l’heure');
  assert.equal(pluieDansLheure(pluieHeure(entre(20, 99), 20), REF + 61 * MIN), null, 'prévision de plus d’une heure : on ne dit plus « en cours »');
  assert.equal(pluieDansLheure(pluieHeure(entre(0, 15), 0), REF + 16 * MIN), null, 'l’averse est finie');
  assert.equal(pluieDansLheure(pluieHeure(() => 'Temps sec', 20), REF), null, 'l’état dit pluie, la tranche dit sec : on ne tranche pas');
  assert.equal(pluieDansLheure({ state: iso(REF), attributes: {} }, REF), null, 'sans tranches');
  assert.equal(pluieDansLheure(null, REF), null);
});

test('W1 : une pluie jusqu’au bout de l’heure n’a pas de durée ; une pluie en cours dit ce qui reste', () => {
  assert.equal(pluieDansLheure(pluieHeure(entre(20, 99), 20), REF).texte, 'Pluie dans 20 min', 'on ne sait pas quand elle s’arrête');
  assert.equal(pluieDansLheure(pluieHeure(entre(0, 15), 0), REF + 2 * MIN).texte, 'Pluie encore 15 min environ');
  assert.equal(pluieDansLheure(pluieHeure(entre(0, 99), 0), REF + 2 * MIN).texte, 'Pluie en cours');
});

test('W1 : la tranche sèche se reconnaît aussi par les tranches d’avant le début, quelle que soit la langue', () => {
  assert.equal(pluieDansLheure(pluieHeure(entre(10, 25, 'Light rain', 'Dry'), 10), REF).texte, 'Pluie dans 10 min, pendant 15 min environ');
  assert.equal(pluieDansLheure(pluieHeure(entre(0, 25, 'Light rain', 'Dry'), 0), REF).texte, 'Pluie en cours', 'sans tranche sèche connue : pas de durée inventée');
});

test('les capteurs de Météo-France se rattachent par l’appareil de la ville, jamais par le nom', () => {
  const meta = { 'weather.ville': { deviceId: 'ville' }, 'sensor.ville_rain_chance': { deviceId: 'ville', meteo: 'pluie' },
    'sensor.ville_next_rain': { deviceId: 'ville', meteo: 'pluie_heure' }, 'sensor.autre_snow_chance': { deviceId: 'autre', meteo: 'neige' },
    'sensor.ville_freeze_chance': { deviceId: 'ville' }, 'binary_sensor.ville_gel': { deviceId: 'ville', meteo: 'gel' },
    'weather.libre': { platform: 'meteo_france' }, 'sensor.libre_rain_chance': { meteo: 'pluie' } };
  const S = Object.fromEntries(Object.keys(meta).map(id => [id, { state: '0' }]));
  const lu = (id) => meta[id] || null;
  assert.deepEqual(capteursMeteo(S, 'weather.ville', lu), { pluie: 'sensor.ville_rain_chance', neige: null, gel: null, pluie_heure: 'sensor.ville_next_rain' });
  assert.deepEqual(capteursMeteo(S, 'weather.sans_appareil', lu), { pluie: null, neige: null, gel: null, pluie_heure: null }, 'une météo inconnue de l’index');
  assert.deepEqual(capteursMeteo(S, 'weather.libre', lu), { pluie: null, neige: null, gel: null, pluie_heure: null }, 'une météo sans appareil ne prend la pluie de personne');
  assert.deepEqual(capteursMeteo(S, 'weather.ville', null), { pluie: null, neige: null, gel: null, pluie_heure: null });
});

test('la phrase : la pluie dans l’heure prend le texte ; le conseil reste celui des heures qui viennent', () => {
  const maintenant = REF;
  const heure = (h, condition) => ({ datetime: iso(maintenant + h * 3600000), condition, temperature: 12 });
  const proche = pluieDansLheure(pluieHeure(entre(20, 45), 20), maintenant);
  const avecPluie = phraseMeteo({ heures: [heure(0.5, 'rainy'), heure(1.5, 'cloudy')], maintenant, proche });
  assert.equal(avecPluie.texte, 'Pluie dans 20 min, pendant 25 min environ');
  assert.equal(avecPluie.ton, 'cold');
  assert.match(avecPluie.conseil, /^Rentrez le linge avant/);
  const jour = (j, condition) => ({ datetime: iso(maintenant + j * 86400000), condition, temperature: 14 });
  const sansProche = phraseMeteo({ heures: [heure(1, 'sunny'), heure(2, 'sunny')], jours: [jour(0, 'sunny'), jour(1, 'rainy')], maintenant });
  assert.equal(sansProche.texte, 'Sec jusqu’à demain');
  const sec = phraseMeteo({ heures: [heure(1, 'sunny'), heure(2, 'sunny')], jours: [jour(0, 'sunny'), jour(1, 'rainy')], maintenant, proche });
  assert.deepEqual(sec, { texte: 'Pluie dans 20 min, pendant 25 min environ', conseil: null, ton: 'cold' }, 'les heures sont sèches : pas le conseil d’un autre jour');
  assert.deepEqual(Object.keys(phraseMeteo({ heures: [heure(0.5, 'rainy')], maintenant })), ['texte', 'conseil', 'ton'], 'sans pluie proche, la phrase d’avant, rien de plus');
});

test('D14 : avec la prévision de Météo-France, sans probabilité, ni « Pluie 0 % » ni « Neige 0 % » — le gel reste, par la température', () => {
  const H = [1, 2, 3].map(h => ({ datetime: iso(REF + h * 3600000), condition: 'rainy', temperature: 4, precipitation: 1.2 }));
  assert.deepEqual(risquesMeteo(H, REF), [{ cle: 'gel', titre: 'Gel', valeur: 0 }]);
  assert.deepEqual(risquesMeteo(H.map(({ temperature, ...x }) => x), REF), [], 'ni probabilité ni température : rien');
});

test('W2 : les capteurs de Météo-France passent avant la déduction ; un capteur muet ne vaut rien', () => {
  const H = [1, 2].map(h => ({ datetime: iso(REF + h * 3600000), condition: 'rainy', temperature: -1 }));
  assert.deepEqual(risquesMeteo(H, REF, { pluie: '40', neige: '0', gel: '10' }),
    [{ cle: 'pluie', titre: 'Pluie', valeur: 40 }, { cle: 'neige', titre: 'Neige', valeur: 0 }, { cle: 'gel', titre: 'Gel', valeur: 10 }], 'le gel du capteur, pas la part des heures');
  assert.deepEqual(risquesMeteo(H, REF, { pluie: 'unknown', neige: null, gel: 'unavailable' }), [{ cle: 'gel', titre: 'Gel', valeur: 100 }]);
  const avecProba = [{ datetime: iso(REF + 3600000), condition: 'rainy', precipitation_probability: 70, temperature: 8 }];
  assert.deepEqual(risquesMeteo(avecProba, REF, { pluie: '30' }).map(r => r.valeur), [30, 0, 0], 'le capteur l’emporte sur la prévision');
});

/* La fiche rendue, avec l'index du composant : la phrase et les risques de Météo-France. */
const meteo = { entity_id: 'weather.ville', state: 'cloudy', last_updated: iso(REF), attributes: { friendly_name: 'Météo-France forecast for city Ville', temperature: 9, supported_features: 3 } };
const texte = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/\s+/g, ' ');
const branche = (S) => ({ states: S, connection: { subscribeMessage: () => Promise.resolve(() => {}) } });
const META = new Map([['weather.ville', { deviceId: 'ville', platform: 'meteo_france' }], ['sensor.ville_rain_chance', { deviceId: 'ville', meteo: 'pluie' }],
  ['sensor.ville_snow_chance', { deviceId: 'ville', meteo: 'neige' }], ['sensor.ville_next_rain', { deviceId: 'ville', meteo: 'pluie_heure' }]]);
const ETATS = { 'weather.ville': meteo, 'sensor.ville_rain_chance': { state: '40', attributes: {} }, 'sensor.ville_snow_chance': { state: '0', attributes: {} },
  'sensor.ville_next_rain': pluieHeure(entre(20, 45), 20) };

test('la fiche : « Pluie dans 20 min » et les risques des capteurs ; sans index, ni phrase de pluie ni « 0 % »', async () => {
  const Fiche = await composant('fichemeteo.jsx');
  setLoggiaState({ index: { entityMeta: META } });
  try {
    const t = texte(rendre(Fiche, { id: 'weather.ville', hass: branche(ETATS), maintenant: REF }));
    assert.ok(t.includes('Pluie dans 20 min, pendant 25 min environ'), t);
    assert.ok(t.includes('Risques') && t.includes('40 % Pluie') && t.includes('0 % Neige'), 'les deux cases des capteurs');
    assert.ok(!t.includes('% Gel'), 'pas de capteur de gel, pas de prévision : pas de case');
  } finally { setLoggiaState({ index: null }); }
  const sans = texte(rendre(Fiche, { id: 'weather.ville', hass: branche(ETATS), maintenant: REF }));
  assert.ok(!sans.includes('Pluie dans') && !sans.includes('Risques'), 'sans index, rien n’est rattaché : rien ne s’invente');
});

test('le widget de l’Accueil dit la pluie dans l’heure', async () => {
  const Carte = await composant('cartemeteo.jsx', 'CarteMeteo');
  const reel = Date.now;
  Date.now = () => REF;
  setLoggiaState({ index: { entityMeta: META } });
  try {
    assert.ok(texte(rendre(Carte, { hass: branche(ETATS), onOpen: () => {} })).includes('Pluie dans 20 min, pendant 25 min environ'));
  } finally { setLoggiaState({ index: null }); Date.now = reel; }
});

test('la démo porte le cas : une météo Météo-France, ses capteurs sur l’appareil de la ville, leur rôle dans l’index', async () => {
  const m = maisonMesuresDemo();
  const idx = m.index();
  const reg = await registresDuComposant({ callWS: async () => ({ index: idx }) });
  const { entityMeta } = buildIndex({ ...reg, states: m.states });
  const lu = (id) => entityMeta.get(id) || null;
  assert.equal(lu('weather.maison').platform, 'meteo_france');
  const cm = capteursMeteo(m.states, 'weather.maison', lu);
  assert.deepEqual(cm, { pluie: 'sensor.meteo_maison_rain_chance', neige: 'sensor.meteo_maison_snow_chance', gel: 'sensor.meteo_maison_freeze_chance', pluie_heure: 'sensor.meteo_maison_next_rain' });
  assert.equal(idx.devices.find(d => d.id === lu(cm.pluie).deviceId).entry_type, 'service', 'un service : il n’entre pas dans Objets');
  assert.deepEqual(Object.values(METEO_FRANCE_DEMO).sort(), ['gel', 'neige', 'pluie', 'pluie_heure']);
  const ref = Math.floor(REF / 300000) * 300000;
  assert.equal(pluieDansLheure(capteursMeteoFranceDemo(REF)['sensor.meteo_maison_next_rain'], ref).texte, 'Pluie dans 20 min, pendant 25 min environ');
});

test('les mots nouveaux sont dans les sept langues', async () => {
  const { CHARGEURS } = await import('../src/langues/index.js');
  const cles = ['Pluie dans {n} min, pendant {d} min environ', 'Pluie dans {n} min', 'Pluie encore {d} min environ'];
  for (const code of Object.keys(CHARGEURS)) {
    const cat = (await CHARGEURS[code]()).default;
    assert.deepEqual(cles.filter(k => !(k in cat)), [], code);
  }
});
