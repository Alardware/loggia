// ─────────────────────────────────────────────────────────────────────────────
// Une consigne illisible ne s'invente pas (audit du 03/10, constat
// « consigne_inventee »).
//
// En `heat_cool`, Home Assistant met `temperature` à null et porte la consigne
// en deux bornes ; bien des intégrations font de même à l'arrêt, et un
// `input_number` indisponible ne dit rien non plus. La carte du thermostat
// affichait alors 20 °C, celle du fil pilote 19, et le « + » ENVOYAIT 20,5 ou
// 19,5 : une consigne que personne n'avait choisie. La compacte, elle, disait
// déjà « — ».
//
// Les fonctions pures se vérifient par import réel ; le câblage des quatre
// écrans (deux cartes, deux fiches) par lecture du source.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { consigneClimat, plageClimat, pasConsigne } from '../src/consigne.js';

import { MONOLITHE, importsDe } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = MONOLITHE.replace(/\r\n/g, '\n');
const compter = (s, motif) => s.split(motif).length - 1;
const corps = (nom) => {
  const i = APP.indexOf('function ' + nom + '(');
  assert.ok(i > 0, nom + ' a disparu');
  return APP.slice(i, APP.indexOf('\n}\n', i));
};

test('une consigne absente reste absente', () => {
  // Le cas du signalement : un thermostat en heat_cool.
  assert.equal(consigneClimat({ temperature: null, target_temp_low: 19, target_temp_high: 24 }), null);
  assert.equal(consigneClimat({}), null);
  assert.equal(consigneClimat(null), null);
  assert.equal(consigneClimat({ temperature: 'unknown' }), null);
  assert.equal(consigneClimat({ temperature: '' }), null);
  // Une vraie consigne passe telle quelle, zéro compris : c'est une valeur.
  assert.equal(consigneClimat({ temperature: 21.5 }), 21.5);
  assert.equal(consigneClimat({ temperature: 0 }), 0);
  assert.equal(consigneClimat({ temperature: '19' }), 19);
  // Aucune conversion : l'unité de l'installation est déjà appliquée (ADR 0128).
  assert.equal(consigneClimat({ temperature: 70, temperature_unit: '°F' }), 70);
});

test('la plage se lit entière, ou pas du tout', () => {
  assert.deepEqual(plageClimat({ temperature: null, target_temp_low: 19, target_temp_high: 24 }), { bas: 19, haut: 24 });
  assert.equal(plageClimat({ target_temp_low: 19 }), null);
  assert.equal(plageClimat({ target_temp_high: 24 }), null);
  assert.equal(plageClimat({ temperature: 21 }), null);
  assert.equal(plageClimat(null), null);
});

test('un appui sur ± ne fabrique jamais une consigne', () => {
  // L'ancien fil pilote faisait 19 + 0,5 sur du vide, et l'envoyait.
  assert.equal(pasConsigne(null, 0.5, 5, 30), null);
  assert.equal(pasConsigne(undefined, -0.5, 5, 30), null);
  assert.equal(pasConsigne(NaN, 0.5, 5, 30), null);
  assert.equal(pasConsigne('19', 0.5, 5, 30), null, 'une chaîne ferait « 190.5 »');
  // Avec une consigne, le geste d'avant est intact : demi-degré, bornes.
  assert.equal(pasConsigne(19, 0.5, 5, 30), 19.5);
  assert.equal(pasConsigne(19.3, 0, 5, 30), 19.5);
  assert.equal(pasConsigne(30, 0.5, 5, 30), 30);
  assert.equal(pasConsigne(5, -0.5, 5, 30), 5);
  // Bornes de repli reconverties en Fahrenheit (41–86) : la valeur reste dans l'unité réelle.
  assert.equal(pasConsigne(86, 0.5, 41, 86), 86);
  assert.equal(pasConsigne(68, 0.5, 41, 86), 68.5);
});

test('plus aucun écran ne retombe sur 20 ou sur 19', () => {
  // ASSERTION MODIFIÉE (ADR 0283) : les cartes sorties d'App.jsx importent elles-mêmes ce qu'elles lisent ; la ligne recopiée se lit par ses noms (`importsDe`).
  assert.ok(['consigneClimat', 'plageClimat', 'pasConsigne'].every(n => importsDe(APP, './consigne.js').has(n)), 'App ne lit plus la consigne par la fonction testée');
  assert.equal(compter(APP, 'a.temperature != null ? a.temperature : 20'), 0, 'le thermostat invente de nouveau 20');
  assert.equal(compter(APP, 'deCelsius(19, uT)'), 0, 'le fil pilote invente de nouveau 19');
  assert.equal(compter(APP, 'const realTarget = consigneClimat(a);'), 2, 'carte et fiche du thermostat ne lisent plus par la même porte');
});

test('sans consigne lisible, rien ne part et les boutons sont inertes', async () => {
  for (const nom of ['RoomClimateCard', 'RoomClimateSheet']) {
    const f = corps(nom);
    assert.ok(f.includes('const reglable = target != null;'), nom + ' : rien ne dit plus si la consigne se règle');
    // ASSERTION MODIFIÉE (audit du 19/10) : un vrai cran du pas de l'appareil, plus ± 0,5 arrondi.
    assert.ok(f.includes("const setT = (d) => { if (!reglable) return; const v = commander(hass, id, 'set_temperature', consigneVoisine(target, d, a, uT) ?? target + d, 'temperature');"),
      nom + ' : le « + » enverrait une consigne inventée');
    assert.equal(compter(f, 'disabled={!reglable}'), 2, nom + ' : les boutons ± restent actifs sans consigne');
  }
  for (const nom of ['RoomPilotCard', 'RoomPilotSheet']) {
    const f = corps(nom);
    assert.ok(f.includes('const target = ov != null ? ov : (z.target != null ? z.target : null);'), nom + ' : la consigne retombe sur un défaut');
    // Sans entité de consigne, l'appel partait vers personne.
    assert.ok(f.includes('const reglable = target != null && !!zone.tempCible;'), nom + ' : un appel partirait sans entité de consigne');
    assert.ok(f.includes('pasConsigne(target, d, ') && f.includes('if (v == null || !reglable) return;'), nom + ' : le « + » enverrait une consigne inventée');
  }
  assert.ok(corps('RoomPilotSheet').includes('z.current != null && target != null && z.current < target'), 'RoomPilotSheet : « Chauffe » se déciderait contre une consigne vide');
  /* La carte suit LA règle « chauffe » des cartes et d'Objets (`enChauffe`,
   * relecture de la partie A) : une zone décrite chauffe en marche, sa pièce
   * sous sa consigne — toutes deux lisibles, jamais contre une consigne vide.
   * ASSERTION MODIFIÉE (relecture de la dernière passe) : la carte et le
   * compte d'Objets la lisent par UNE aide, `chauffeDeZone` — la carte lui
   * passe sa consigne, avance comprise. */
  assert.ok(corps('RoomPilotCard').includes('chauffeDeZone(S, zone, z, { marche, consigne: target })'), 'RoomPilotCard : « Chauffe » ne suit plus la consigne affichée');
  assert.ok(corps('chauffeDeZone').includes("enChauffe({ famille: 'zone', muet: muette, marche, mesure: z.current, consigne })"), 'chauffeDeZone : « Chauffe » ne suit plus la règle partagée');
  const { enChauffe } = await import('../src/chauffageecran.js');
  assert.equal(enChauffe({ famille: 'zone', marche: true, mesure: 18, consigne: null }), false, '« Chauffe » se déciderait contre une consigne vide');
  assert.equal(enChauffe({ famille: 'zone', marche: true, mesure: null, consigne: 19 }), false);
  assert.equal(compter(corps('RoomPilotSheet'), 'disabled={!reglable}'), 2, 'RoomPilotSheet : les boutons ± restent actifs sans consigne');
  /* La carte départage − et + depuis qu'un module fil pilote découvert y
   * passe d'un mode à l'autre (plan 2 du chantier Chauffage, tâche 7) : au
   * bout de ses modes, un seul des deux s'éteint. Une zone décrite à la main
   * garde la règle de sa consigne, pour les deux. */
  const carte = corps('RoomPilotCard');
  assert.ok(carte.includes('const baisse = estModule ? ordonnable(moins) : reglable, monte = estModule ? ordonnable(plus) : reglable;'),
    'RoomPilotCard : les boutons ± d’une zone décrite à la main ne suivent plus sa consigne');
  assert.equal(compter(carte, 'disabled={!baisse}'), 1, 'RoomPilotCard : « − » reste actif sans consigne');
  assert.equal(compter(carte, 'disabled={!monte}'), 1, 'RoomPilotCard : « + » reste actif sans consigne');
});

test('« — » à la place du chiffre, comme la compacte ; la plage se lit dans la fiche', () => {
  // Les cartes 1a (tâche 10 bis A) l'écrivent à une décimale, suivie de « ° » : « 20,0° ».
  // ASSERTION MODIFIÉE (30/10) : la carte du thermostat retire, au planning, le décalage de son capteur (`- dec`).
  assert.equal(compter(APP, "const consigne = target != null ? nombre(Number(target), 1) + '°' : '—';")
    + compter(APP, "const consigne = target != null ? nombre(Number(target) - dec, 1) + '°' : '—';"), 2);
  const fiche = corps('RoomClimateSheet');
  assert.ok(fiche.includes("{reglable ? fmt(target) : '—'}"), 'la fiche du thermostat affiche un chiffre inventé');
  assert.ok(fiche.includes("reglable ? tr('consigne {t} °{u}'"), 'l’en-tête de la fiche annonce une consigne vide');
  assert.ok(fiche.includes('const plage = realTarget == null ? plageClimat(a) : null;'), 'la plage se montrerait à côté d’une consigne unique');
  assert.ok(fiche.includes("tr('Plage {bas} – {haut}, réglée dans Home Assistant', { bas: fmt(plage.bas), haut: fmt(plage.haut) })"), 'la plage d’un heat_cool a disparu de la fiche');
  const cadran = corps('RoomPilotSheet');
  assert.ok(cadran.includes('{target != null ? <>{dec(target, 1)}'), 'le cadran du fil pilote formaterait une consigne vide');
  assert.ok(cadran.includes('const pct = target == null ? 0 :'), 'l’arc du cadran se calculerait sur du vide');
});
