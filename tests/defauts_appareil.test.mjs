/* Les défauts d'appareil (01/11, ADR 0307 ; lot 3 du rapport Gladys : D13, P1).
 *
 * Ce qui est garanti ici :
 *  - « À surveiller » : un binaire `problem` allumé, porté par un APPAREIL, fait un point ambre « Défaut signalé » au nom de
 *    l'appareil (l'alarme du poêle, un disque qui lâche) ; ni un modèle ni un groupe, ni le besoin d'eau d'une plante, ni un binaire
 *    sans appareil ;
 *  - la popup du poêle dit « L'appareil signale un défaut. » tant que son alarme est allumée, et « Réarmer » quand le composant a
 *    reconnu SON bouton de réarmement (`rearmer`) — un seul, joignable ; rien ne part sans le geste ;
 *  - le drapeau `rearmer` du composant arrive jusqu'à l'index de l'écran ;
 *  - Paramètres › Alertes dit que l'ouverture sous alarme couvre aussi le sabotage. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { area, device, entity, state, states, indexOf } from './fixtures.mjs';
import { pointsAttention, ICONES_ATTENTION } from '../src/attention.js';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const Fiche = (await import(new URL('../src/fichechauffage.jsx', import.meta.url).href)).default;
const { setLoggiaState, plateformeDe, voisinsDe, nomAppareilDe, entitesAppareilDe, estRearmement } = await import('../src/state.js');
const { registresDuComposant } = await import('../src/discovery.js');
const SOURCE = readFileSync(new URL('../src/fichechauffage.jsx', import.meta.url), 'utf8');
const PAR = readFileSync(new URL('../src/views/parametres.jsx', import.meta.url), 'utf8');

const POELE = 'climate.poele';
const ALARME = 'binary_sensor.poele_alarm';
const REARMER = 'button.poele_alarm_reset';
const HORLOGE = 'button.poele_set_system_date_time';
const PLANTE = 'binary_sensor.plantes_alerte';
const DISQUE = 'binary_sensor.console_ssd_1';

/* Le poêle (un appareil : thermostat, alarme, deux boutons), la console réseau et son disque, et un modèle « plantes » sans appareil. */
function maison({ alarme = 'on', rearmer = true, bouton = 'unknown' } = {}) {
  const ent = (id, dev, plus = {}) => ({ ...entity(id, { device: dev }), ...plus });
  return {
    areas: [area('salon', 'Salon')],
    devices: [device('poele', 'Poêle', 'salon'), device('console', 'Console réseau', 'salon')],
    entities: [
      ent(POELE, 'poele', { platform: 'maestro_mcz' }),
      ent(ALARME, 'poele', { platform: 'maestro_mcz', device_class: 'problem', entity_category: 'diagnostic' }),
      ent(REARMER, 'poele', { platform: 'maestro_mcz', entity_category: 'diagnostic', rearmer }),
      ent(HORLOGE, 'poele', { platform: 'maestro_mcz', entity_category: 'config' }),
      ent(DISQUE, 'console', { platform: 'unifiprotect', device_class: 'problem', entity_category: 'diagnostic' }),
      ent(PLANTE, null, { platform: 'template', device_class: 'problem' }),
    ],
    floors: [],
    states: states(
      state(POELE, 'heat', { friendly_name: 'Poêle', hvac_modes: ['off', 'heat'], temperature: 20.5, current_temperature: 19.2, min_temp: 5, max_temp: 35, target_temp_step: 0.5, supported_features: 1 }),
      state(ALARME, alarme, { friendly_name: 'Poêle Alarm', device_class: 'problem' }),
      state(REARMER, bouton, { friendly_name: 'Poêle Alarm reset' }),
      state(HORLOGE, 'unknown', { friendly_name: 'Poêle Set system date time' }),
      state(DISQUE, 'on', { friendly_name: 'Console SSD 1', device_class: 'problem' }),
      state(PLANTE, 'on', { friendly_name: 'Plantes alerte', device_class: 'problem' }),
    ),
    energyPrefs: null,
  };
}
const avec = (fx, f) => {
  setLoggiaState({ index: indexOf(fx), ent: {}, cfg: { loggia_plants: [] }, resolved: null });
  try { return f(fx.states); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
};
const ctx = (S) => ({ S, plateforme: plateformeDe, voisins: voisinsDe, nomAppareil: nomAppareilDe });
const defauts = (S, c = ctx(S)) => pointsAttention(c).filter(p => p.cle.indexOf('defaut:') === 0)
  .map(p => [p.haid, p.niveau, p.titre, p.sous, p.vue, p.icone]).sort((a, b) => a[0].localeCompare(b[0]));
const poele = () => ({
  cle: POELE, entite: POELE, nom: 'Poêle', famille: 'thermostat', planning: false, modes: ['confort', 'eco', 'hors_gel', 'arret'],
  mode: null, source: null, fin: null, puis: null, reprise: null, fenetre: 'arret', fenetre_ouverte: false,
  semaine: null, temperatures: null, avertissements: [], options: null, jour: null,
});
const etatMoteur = { chauffages: [], maison: { mode: 'planning', vacances_fin: null, absence: 'eco', vacances: 'hors_gel' }, simulation: false,
  maintenant: '2026-10-12T19:00:00+02:00', minute: [0, 1140], plannings_allumes: true, journal: [] };
const rien = () => { throw new Error('rien ne doit partir'); };
const rendre = (S) => renderToStaticMarkup(createElement(Fiche, {
  hass: { states: S, user: { is_admin: true }, config: { unit_system: { temperature: '°C' } }, callService: rien, callWS: rien },
  ch: poele(), etat: etatMoteur, sonde: null, onFiche: () => {}, maintenant: Date.parse('2026-10-12T19:00:00+02:00'),
}));
const avertissements = (html) => [...html.matchAll(/<div class="o-panne" role="status" data-avertissement="([^"]+)"/g)].map(m => m[1]);

test('« À surveiller » : le défaut d’un appareil, à son nom ; ni le modèle des plantes, ni un binaire sans appareil', () => avec(maison(), (S) => {
  assert.deepEqual(defauts(S), [
    [DISQUE, 'alerte', 'Défaut signalé', 'Console réseau', 'objets', 'triangle-warning'],
    [ALARME, 'alerte', 'Défaut signalé', 'Poêle', 'objets', 'triangle-warning'],
  ].sort((a, b) => a[0].localeCompare(b[0])), 'le poêle et le disque, au nom de leur appareil ; pas le modèle des plantes');
  assert.equal(ICONES_ATTENTION.defaut, 'triangle-warning');
  // Sans voisins (un appelant qui ne les passe pas), aucun point : on ne sait pas qu'il s'agit d'un appareil.
  assert.deepEqual(defauts(S, { S, plateforme: plateformeDe }), []);
}));

test('« À surveiller » : l’alarme éteinte, plus de point', () => avec(maison({ alarme: 'off' }), (S) => {
  assert.deepEqual(defauts(S).map(d => d[0]), [DISQUE]);
}));

test('l’index : les entités de l’appareil, et le bouton de réarmement que le composant a reconnu', () => avec(maison(), () => {
  assert.deepEqual(entitesAppareilDe(POELE), [ALARME, REARMER, HORLOGE, POELE].sort());
  assert.equal(estRearmement(REARMER), true);
  assert.equal(estRearmement(HORLOGE), false);
  assert.equal(nomAppareilDe(ALARME), 'Poêle');
  assert.deepEqual(entitesAppareilDe(PLANTE), []);
}));

test('la popup du poêle : le défaut, et « Réarmer » sur son seul bouton', () => {
  avec(maison(), (S) => {
    const html = rendre(S);
    assert.ok(avertissements(html).includes('defaut'), 'la ligne du défaut');
    assert.ok(html.includes('L’appareil signale un défaut.'));
    assert.match(html, /<button type="button" data-rearmer=""[^>]*>Réarmer<\/button>/, 'le bouton « Réarmer »');
  });
  avec(maison({ alarme: 'off' }), (S) => {
    const html = rendre(S);
    assert.ok(!avertissements(html).includes('defaut') && !html.includes('data-rearmer'), 'sans défaut, rien');
  });
  avec(maison({ rearmer: false }), (S) => {
    const html = rendre(S);
    assert.ok(avertissements(html).includes('defaut') && !html.includes('data-rearmer'), 'un appareil sans bouton reconnu : le défaut seul');
  });
  avec(maison({ bouton: 'unavailable' }), (S) => {
    assert.ok(!rendre(S).includes('data-rearmer'), 'un bouton injoignable ne se propose pas');
  });
  // Le geste : `button.press` sur ce bouton-là, et seulement au clic.
  assert.ok(SOURCE.includes("onClick={() => commanderService(hass, bouton, 'button', 'press', { entity_id: bouton })}>{tr('Réarmer')}</button>"));
});

test('le drapeau `rearmer` du composant arrive jusqu’à l’écran', async () => {
  const reg = await registresDuComposant({ callWS: async () => ({ index: { version: 1,
    areas: [], floors: [], devices: [{ id: 'poele', name: 'Poêle' }],
    entities: [{ id: REARMER, device: 'poele', rearmer: true }, { id: HORLOGE, device: 'poele' }],
  } }) });
  const ents = Object.fromEntries(reg.entities.map(e => [e.entity_id, e.rearmer]));
  assert.deepEqual(ents, { [REARMER]: true, [HORLOGE]: false });
});

test('Paramètres › Alertes : l’ouverture sous alarme couvre aussi le sabotage', () => {
  assert.ok(PAR.includes("['portes', tr('Ouverture sous alarme armée'), 'door-closed', null, tr('{p} · {s}', { p: tr('Portes, fenêtres et garage'), s: tr('Sabotage') })],"));
});
