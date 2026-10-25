// La fiche météo (sa maquette « Cartes météo », cadre 1b, 20/10) : rendue par
// React, sans navigateur — ce que l'écran montre, pas la forme du code.
//  - l'en-tête : la ville, la source et l'heure de mise à jour, l'épingle ;
//  - le panneau du haut : le chiffre, le ciel, « Ressenti · Max · Min », la
//    phrase et son conseil ; la bande de vigilance quand elle est orange ;
//  - les heures (huit, la pluie dessous), la semaine en barres (sept), les
//    tuiles (seulement celles que l'entité donne), les risques, la vigilance
//    par phénomène, « L'appareil » ;
//  - sans prévision : ni phrase, ni heures, ni semaine, ni risques ;
//  - muette : « Indisponible », rien d'inventé.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.TZ = 'Europe/Paris';
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const { composant, rendre } = await import('./rendu.mjs');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const iso = (t) => new Date(t).toISOString();
const maintenant = new Date(2026, 9, 20, 14, 40).getTime();
const heure = (h, j = 20) => iso(new Date(2026, 9, j, h, 0).getTime());
const minuit = (j) => iso(new Date(2026, 9, j, 0, 0).getTime());

const horaires = [
  { datetime: heure(15), condition: 'cloudy', temperature: 19, precipitation_probability: 30 },
  { datetime: heure(16), condition: 'rainy', temperature: 18, precipitation_probability: 70, precipitation: 2.1 },
  { datetime: heure(17), condition: 'rainy', temperature: 17, precipitation_probability: 90, precipitation: 2.5 },
  { datetime: heure(18), condition: 'rainy', temperature: 16, precipitation_probability: 80, precipitation: 1.4 },
  { datetime: heure(19), condition: 'cloudy', temperature: 15, precipitation_probability: 40 },
  { datetime: heure(20), condition: 'partlycloudy', temperature: 14, precipitation_probability: 10 },
  { datetime: heure(21), condition: 'partlycloudy', temperature: 13, precipitation_probability: 0 },
  { datetime: heure(22), condition: 'clear-night', temperature: 12, precipitation_probability: 0 },
];
const journaliers = [
  { datetime: minuit(20), condition: 'rainy', temperature: 20, templow: 11, precipitation: 6, precipitation_probability: 90 },
  { datetime: minuit(21), condition: 'partlycloudy', temperature: 18, templow: 9, precipitation_probability: 20 },
  { datetime: minuit(22), condition: 'rainy', temperature: 17, templow: 12, precipitation_probability: 80 },
  { datetime: minuit(23), condition: 'partlycloudy', temperature: 16, templow: 9, precipitation_probability: 30 },
  { datetime: minuit(24), condition: 'cloudy', temperature: 15, templow: 8, precipitation_probability: 20 },
  { datetime: minuit(25), condition: 'sunny', temperature: 15, templow: 6, precipitation_probability: 0 },
  { datetime: minuit(26), condition: 'partlycloudy', temperature: 16, templow: 7, precipitation_probability: 10 },
];
const meteo = (etat = {}) => ({
  entity_id: 'weather.maison', state: 'cloudy', last_updated: iso(maintenant - 5 * 60000),
  attributes: { friendly_name: 'Météo-France forecast for city Sainte-Solange', attribution: 'Data provided by Météo-France', temperature: 19.4, apparent_temperature: 18, humidity: 78,
    wind_speed: 14, wind_speed_unit: 'km/h', wind_bearing: 225, uv_index: 1, cloud_coverage: 90, precipitation_unit: 'mm', supported_features: 3 },
  ...etat,
});
const soleil = { entity_id: 'sun.sun', state: 'above_horizon', attributes: { next_setting: heure(19), next_rising: heure(8, 21) } };
/* Un `hass` branché : l'abonnement livre tout de suite les prévisions demandées. */
const branche = (states, { horaire = horaires, journalier = journaliers } = {}) => ({
  states, connection: { subscribeMessage: (cb, msg) => { cb({ type: msg.forecast_type, forecast: msg.forecast_type === 'hourly' ? horaire : journalier }); return Promise.resolve(() => {}); } },
});
const texte = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('la fiche : la ville, la source, le chiffre, le ciel, le ressenti et les extrêmes', async () => {
  const Fiche = await composant('fichemeteo.jsx');
  const html = rendre(Fiche, { id: 'weather.maison', hass: branche({ 'weather.maison': meteo(), 'sun.sun': soleil }), maintenant });
  const t = texte(html);
  assert.ok(t.includes('Sainte-Solange') && !t.includes('forecast for'), 'le nom de la ville, pas celui de l’entité');
  assert.ok(t.includes('Météo-France · mis à jour à 14:35'), 'la source et l’heure, sous le nom');
  assert.ok(t.includes('19,4°') && t.includes('Nuageux'), 'le chiffre et le ciel');
  assert.ok(!html.includes('Commandes'), 'la liste « Commandes », qui n’en contenait aucune, est partie');
});

test('sans prévision livrée : ni phrase, ni heures, ni semaine, ni risques — et les tuiles de l’entité seule', async () => {
  const Fiche = await composant('fichemeteo.jsx');
  // Un rendu statique n'exécute pas les effets : les prévisions ne sont jamais livrées ici.
  const html = rendre(Fiche, { id: 'weather.maison', hass: branche({ 'weather.maison': meteo(), 'sun.sun': soleil }), maintenant });
  const t = texte(html);
  assert.ok(t.includes('Ressenti 18°'), 'le ressenti vient de l’entité');
  assert.ok(!t.includes('Max') && !t.includes('Prochaines heures') && !t.includes('7 jours') && !t.includes('Risques') && !t.includes('Pluie vers'), 'rien d’inventé sans prévision');
  for (const tuile of ['Vent', '14 km/h', 'Du sud-ouest · léger', 'Humidité', '78 %', 'UV', 'Faible', 'Nuages', '90 %', 'Couvert', 'Soleil', '19:00', 'Coucher · lever à 08:00']) assert.ok(t.includes(tuile), tuile + ' manque');
  assert.ok(!t.includes('Pluie aujourd’hui'), 'la pluie du jour vient de la prévision quotidienne : absente sans elle');
  assert.ok(html.includes('transform:rotate(45deg)'), 'la flèche du vent pointe là où il va (225 + 180)');
});

test('la vigilance : chaque phénomène et son niveau ; orange, la bande et la phrase', async () => {
  const Fiche = await composant('fichemeteo.jsx');
  const vig = { entity_id: 'sensor.paris_weather_alert', state: 'Orange', attributes: { friendly_name: 'Vigilance Météo-France', attribution: 'Data provided by Météo-France', 'Vent violent': 'Orange', 'Orages': 'Vert', 'Pluie-inondation': 'Vert' } };
  const html = rendre(Fiche, { id: 'weather.maison', hass: branche({ 'weather.maison': meteo(), 'sun.sun': soleil, 'sensor.paris_weather_alert': vig }), maintenant });
  const t = texte(html);
  assert.ok(t.includes('Vigilance orange · Vent violent'), 'la bande de vigilance, qui prend la phrase');
  assert.ok(t.includes('Vigilance') && t.includes('Vent violent Orange') && t.includes('Orages Vert') && t.includes('Pluie-inondation Vert'), 'le tableau par phénomène, l’orange en tête');
  assert.ok(html.includes('var(--o-warn2-rgb)'), 'le panneau du haut se teinte à l’orange');
  // Jaune : dans le tableau, pas en bande.
  const jaune = rendre(Fiche, { id: 'weather.maison', hass: branche({ 'weather.maison': meteo(), 'sun.sun': soleil, 'sensor.paris_weather_alert': { ...vig, state: 'Jaune', attributes: { ...vig.attributes, 'Vent violent': 'Jaune' } } }), maintenant });
  assert.ok(texte(jaune).includes('Vent violent Jaune') && !texte(jaune).includes('Vigilance jaune · Vent violent'), 'le jaune se lit dans le tableau, sans bande');
});

test('muette : « Indisponible », le tiret, rien d’inventé ; sans capteur de vigilance, pas de tableau', async () => {
  const Fiche = await composant('fichemeteo.jsx');
  const html = rendre(Fiche, { id: 'weather.maison', hass: branche({ 'weather.maison': meteo({ state: 'unavailable' }), 'sun.sun': soleil }), maintenant });
  const t = texte(html);
  assert.ok(t.includes('Indisponible') && html.includes('class="o-panne"'), 'la panne se dit, et le panneau respire');
  assert.ok(t.includes('—') && !t.includes('Nuageux'), 'ni chiffre ni ciel inventés');
  assert.ok(!t.includes('Vigilance'), 'sans capteur, pas de tableau de vigilance');
});

test('« L’appareil » ouvre la fiche universelle ; sans ouverture, pas de ligne', async () => {
  const Fiche = await composant('fichemeteo.jsx');
  const avec = rendre(Fiche, { id: 'weather.maison', hass: branche({ 'weather.maison': meteo(), 'sun.sun': soleil }), maintenant, onFiche: () => {} });
  assert.ok(texte(avec).includes('L’appareil') && texte(avec).includes('Toutes ses entités, l’épingle'));
  const sans = rendre(Fiche, { id: 'weather.maison', hass: branche({ 'weather.maison': meteo(), 'sun.sun': soleil }), maintenant });
  assert.ok(!texte(sans).includes('L’appareil'));
});

test('la fiche se charge à la demande, et n’importe jamais App.jsx', () => {
  const app = lire('src', 'App.jsx');
  const fiche = lire('src', 'fichemeteo.jsx');
  assert.ok(app.includes("const FicheMeteoContenu = lazyRecharge(() => import('./fichemeteo.jsx'));"), 'la fiche entre dans le démarrage : le boot grossit');
  assert.ok(!/from ['"]\.\/App\.jsx['"]/.test(fiche), 'un morceau à la demande qui importe App.jsx l’emporte avec lui');
  assert.ok(app.includes("if (d === 'weather') setMeteoPop(id);"), 'une entité météo ouvre encore la fiche universelle');
  assert.ok(app.includes('{meteoPop && <FicheMeteo id={meteoPop} hass={hass} onClose={() => setMeteoPop(null)} />}'), 'la coquille n’est pas rendue');
  assert.ok(app.includes('<FicheMeteoContenu id={id} hass={H} onFiche={setFiche} epingle={<BoutonEpingle id={id} />} />'), 'la coquille passe le hass vivant, l’épingle et l’ouverture de la fiche universelle');
});
