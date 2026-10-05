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

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8').replace(/\r\n/g, '\n');
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
  assert.ok(APP.includes("import { consigneClimat, plageClimat, pasConsigne } from './consigne.js';"), 'App ne lit plus la consigne par la fonction testée');
  assert.equal(compter(APP, 'a.temperature != null ? a.temperature : 20'), 0, 'le thermostat invente de nouveau 20');
  assert.equal(compter(APP, 'deCelsius(19, uT)'), 0, 'le fil pilote invente de nouveau 19');
  assert.equal(compter(APP, 'const realTarget = consigneClimat(a);'), 2, 'carte et fiche du thermostat ne lisent plus par la même porte');
});

test('sans consigne lisible, rien ne part et les boutons sont inertes', () => {
  for (const nom of ['RoomClimateCard', 'RoomClimateSheet']) {
    const f = corps(nom);
    assert.ok(f.includes('const reglable = target != null;'), nom + ' : rien ne dit plus si la consigne se règle');
    assert.ok(f.includes("const setT = (d) => { if (!reglable) return; const v = commander(hass, id, 'set_temperature', target + d, 'temperature');"),
      nom + ' : le « + » enverrait une consigne inventée');
    assert.equal(compter(f, 'disabled={!reglable}'), 2, nom + ' : les boutons ± restent actifs sans consigne');
  }
  for (const nom of ['RoomPilotCard', 'RoomPilotSheet']) {
    const f = corps(nom);
    assert.ok(f.includes('const target = ov != null ? ov : (z.target != null ? z.target : null);'), nom + ' : la consigne retombe sur un défaut');
    // Sans entité de consigne, l'appel partait vers personne.
    assert.ok(f.includes('const reglable = target != null && !!zone.tempCible;'), nom + ' : un appel partirait sans entité de consigne');
    assert.ok(f.includes('pasConsigne(target, d, ') && f.includes('if (v == null || !reglable) return;'), nom + ' : le « + » enverrait une consigne inventée');
    assert.equal(compter(f, 'disabled={!reglable}'), 2, nom + ' : les boutons ± restent actifs sans consigne');
    assert.ok(f.includes('z.current != null && target != null && z.current < target'), nom + ' : « Chauffe » se déciderait contre une consigne vide');
  }
});

test('« — » à la place du chiffre, comme la compacte ; la plage se lit dans la fiche', () => {
  assert.equal(compter(APP, "const consigne = target != null ? decMax(Number(target), 1) + ' °' + uT : '—';"), 2);
  const fiche = corps('RoomClimateSheet');
  assert.ok(fiche.includes("{reglable ? fmt(target) : '—'}"), 'la fiche du thermostat affiche un chiffre inventé');
  assert.ok(fiche.includes("reglable ? tr('consigne {t} °{u}'"), 'l’en-tête de la fiche annonce une consigne vide');
  assert.ok(fiche.includes('const plage = realTarget == null ? plageClimat(a) : null;'), 'la plage se montrerait à côté d’une consigne unique');
  assert.ok(fiche.includes("tr('Plage {bas} – {haut}, réglée dans Home Assistant', { bas: fmt(plage.bas), haut: fmt(plage.haut) })"), 'la plage d’un heat_cool a disparu de la fiche');
  const cadran = corps('RoomPilotSheet');
  assert.ok(cadran.includes('{target != null ? <>{dec(target, 1)}'), 'le cadran du fil pilote formaterait une consigne vide');
  assert.ok(cadran.includes('const pct = target == null ? 0 :'), 'l’arc du cadran se calculerait sur du vide');
});
