// ─────────────────────────────────────────────────────────────────────────────
// La qualité de l'air dit une QUALITÉ (lot 16, 05/10 — point 8c de l'audit de
// Luna, tranché par l'utilisateur).
//
// Le palier « Élevé » du CO₂ (1 400 ppm, captures du 19/09) parle du gaz, mais
// il s'affiche sous « Qualité de l'air » : « AIR QUALITY · HIGH », « LUFT-
// QUALITÄT · HOCH », « CALIDAD AIRE · ALTO » se lisaient « bonne qualité », sur
// le palier même où il faut aérer. Dans ce contexte SEULEMENT, il devient un
// mot de qualité : Poor, Schlecht, Slecht, Mala, Scarsa (POOR, SCHLECHT,
// SLECHT, MALA, SCARSA dans le bandeau). « Calidad » et « qualità » sont
// féminins : Buena / Buona, Regular / Media. Le français garde « Élevé ».
//
// Le polonais de Seba882 ne change pas à l'écran : les clés de contexte
// reprennent ses mots tels quels. Les clés nues « Bon », « Moyen », « Élevé »
// restent aux échelles de température et d'humidité et au robot.
//
// La langue se résout au chargement d'i18n.js : chaque langue tourne dans son
// propre processus, avec son catalogue déposé comme le fait l'amorce.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const APP = lire('src', 'App.jsx');
const PUR = lire('src', 'confort.js');

/* Le mot du bandeau tel que l'Accueil le calcule : `airPalier` et `airLabel`,
 * lus dans App.jsx. */
const debut = APP.indexOf('\nfunction airPalier(');
const finLabel = APP.indexOf('\n', APP.indexOf('\nfunction airLabel(') + 1);
assert.ok(debut > 0 && finLabel > debut, 'airPalier / airLabel introuvables');
const AIR = APP.slice(debut, finLabel);

const SONDE = `
const code = process.env.LOGGIA_L;
const url = (p) => new URL(p, process.env.LOGGIA_R).href;
Object.defineProperty(globalThis, 'navigator', { value: { language: code + '-' + code.toUpperCase() }, configurable: true });
globalThis.window = code === 'fr' ? {} : { __loggiaCatalogue: { code, cat: (await import(url('src/langues/' + code + '.js'))).default } };
const { verdictMesure, jaugeMesure } = await import(url('src/confort.js'));
const { tr, langue, locale } = await import(url('src/i18n.js'));
const airLabel = new Function('tr', process.env.LOGGIA_AIR + '\\nreturn airLabel;')(tr);
const carte = (v) => verdictMesure('co2', v).t;
process.stdout.write(JSON.stringify({
  langue: langue(),
  carte: [800, 1000, 1300, 1399, 1400, 1500, 1700].map(carte),
  capitales: jaugeMesure('co2', 1500).verdict.t.toLocaleUpperCase(locale()),
  bandeau: [800, 1000, 1300, 1399, 1400, 1500, 1700].map(airLabel),
  temp: verdictMesure('temp', 17.5).t, hum: verdictMesure('hum', 35).t,
  nus: [tr('Bon'), tr('Moyen'), tr('Élevé')],
}));
`;
const ecran = (code) => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', SONDE], {
    env: { ...process.env, LOGGIA_L: code, LOGGIA_R: pathToFileURL(RACINE + '/').href, LOGGIA_AIR: AIR }, encoding: 'utf8',
  });
  assert.equal(r.status, 0, code + ' : ' + r.stderr);
  const e = JSON.parse(r.stdout);
  assert.equal(e.langue, code, 'la sonde ne tourne pas en ' + code);
  return e;
};
const E = Object.fromEntries(['fr', 'en', 'de', 'nl', 'es', 'it', 'pl'].map(l => [l, ecran(l)]));

/* Les sept écrans, palier par palier : 800 · 1000 · 1300 · 1399 · 1400 · 1500 · 1700 ppm. */
const ATTENDU = {
  fr: { carte: ['Excellent', 'Bon', 'Moyen', 'Moyen', 'Élevé', 'Élevé', 'Confiné'], bandeau: ['BON', 'BON', 'MOYEN', 'MOYEN', 'ÉLEVÉ', 'ÉLEVÉ', 'ÉLEVÉ'], capitales: 'ÉLEVÉ' },
  en: { carte: ['Excellent', 'Good', 'Fair', 'Fair', 'Poor', 'Poor', 'Stuffy'], bandeau: ['GOOD', 'GOOD', 'FAIR', 'FAIR', 'POOR', 'POOR', 'POOR'], capitales: 'POOR' },
  de: { carte: ['Ausgezeichnet', 'Gut', 'Mittel', 'Mittel', 'Schlecht', 'Schlecht', 'Stickig'], bandeau: ['GUT', 'GUT', 'MITTEL', 'MITTEL', 'SCHLECHT', 'SCHLECHT', 'SCHLECHT'], capitales: 'SCHLECHT' },
  nl: { carte: ['Uitstekend', 'Goed', 'Matig', 'Matig', 'Slecht', 'Slecht', 'Bedompt'], bandeau: ['GOED', 'GOED', 'MATIG', 'MATIG', 'SLECHT', 'SLECHT', 'SLECHT'], capitales: 'SLECHT' },
  es: { carte: ['Excelente', 'Buena', 'Regular', 'Regular', 'Mala', 'Mala', 'Cargada'], bandeau: ['BUENA', 'BUENA', 'REGULAR', 'REGULAR', 'MALA', 'MALA', 'MALA'], capitales: 'MALA' },
  it: { carte: ['Eccellente', 'Buona', 'Media', 'Media', 'Scarsa', 'Scarsa', 'Viziata'], bandeau: ['BUONA', 'BUONA', 'MEDIA', 'MEDIA', 'SCARSA', 'SCARSA', 'SCARSA'], capitales: 'SCARSA' },
  // Seba882, inchangé : la carte et le bandeau gardent ses mots.
  pl: { carte: ['Doskonale', 'Dobra', 'Średnia', 'Średnia', 'Wysoki', 'Wysoki', 'Duszno'], bandeau: ['DOBRA', 'DOBRA', 'ŚREDNIA', 'ŚREDNIA', 'WYSOKIE', 'WYSOKIE', 'WYSOKIE'], capitales: 'WYSOKI' },
};

test('à 1 500 ppm, l’air est « Poor », « Schlecht », « Slecht », « Mala », « Scarsa » — plus « High »', () => {
  for (const l of ['en', 'de', 'nl', 'es', 'it']) {
    assert.equal(E[l].carte[5], ATTENDU[l].carte[5], l + ' : le verdict de la carte à 1 500 ppm');
    assert.equal(E[l].bandeau[5], ATTENDU[l].bandeau[5], l + ' : le mot du bandeau à 1 500 ppm');
    assert.equal(E[l].capitales, ATTENDU[l].capitales, l + ' : la carte du capteur, en capitales');
    // Le mot nu « Élevé » (High, Hoch, Hoog, Alto) n'est plus celui de l'air.
    assert.notEqual(E[l].carte[5], E[l].nus[2], l + ' : l’air dit encore « ' + E[l].nus[2] + ' »');
    assert.notEqual(E[l].bandeau[5], E[l].nus[2].toLocaleUpperCase(l), l + ' : le bandeau dit encore « ' + E[l].nus[2] + ' »');
  }
});

test('« calidad » et « qualità » sont féminins : Buena, Buona, Media', () => {
  assert.deepEqual([E.es.carte[1], E.es.carte[2], E.es.bandeau[1], E.es.bandeau[2]], ['Buena', 'Regular', 'BUENA', 'REGULAR']);
  assert.deepEqual([E.it.carte[1], E.it.carte[2], E.it.bandeau[1], E.it.bandeau[2]], ['Buona', 'Media', 'BUONA', 'MEDIA']);
});

test('les sept langues, palier par palier, et le seuil reste à 1 400 ppm', () => {
  for (const [l, a] of Object.entries(ATTENDU)) {
    assert.deepEqual(E[l].carte, a.carte, l + ' : les verdicts des cartes, des jauges et des fiches');
    assert.deepEqual(E[l].bandeau, a.bandeau, l + ' : le mot du bandeau');
    assert.equal(E[l].capitales, a.capitales, l);
  }
});

test('le même palier dit le même mot sur la carte et dans le bandeau', () => {
  // Le polonais garde ses deux mots (« Wysoki » / « WYSOKIE ») : à soumettre à Seba882.
  for (const l of ['fr', 'en', 'de', 'nl', 'es', 'it']) {
    for (const i of [1, 2, 5]) assert.equal(E[l].carte[i].toLocaleUpperCase(l), E[l].bandeau[i], l + ' : palier ' + i);
  }
});

test('le français et le polonais ne changent pas, ni les autres sens de « Bon », « Moyen », « Élevé »', () => {
  assert.deepEqual(E.fr.nus, ['Bon', 'Moyen', 'Élevé']);
  const NUS = { en: ['Good', 'Fair', 'High'], de: ['Gut', 'Mittel', 'Hoch'], nl: ['Goed', 'Matig', 'Hoog'], es: ['Bueno', 'Regular', 'Alto'], it: ['Buono', 'Medio', 'Alto'], pl: ['Dobra', 'Średnia', 'Wysoki'] };
  for (const [l, nus] of Object.entries(NUS)) {
    assert.deepEqual(E[l].nus, nus, l + ' : les clés nues (robot, réglages) ont bougé');
    // Les échelles de température et d'humidité lisent toujours le mot nu.
    assert.equal(E[l].temp, nus[0], l + ' : « Bon » de la température');
    assert.equal(E[l].hum, nus[0], l + ' : « Bon » de l’humidité');
  }
});

test('la table du CO₂ passe par trSens, et le bandeau ne retraduit pas son mot', () => {
  assert.ok(PUR.includes("[1150, trSens('Bon · air'), OK], [1400, trSens('Moyen · air'), AMBRE], [1600, trSens('Élevé · air'), ORANGE]"), 'la table du CO₂');
  for (const nom of ['temp', 'hum']) {
    const ligne = PUR.split('\n').find(l => l.trimStart().startsWith(nom + ': () => ['));
    assert.ok(ligne.includes("tr('Bon')") && !ligne.includes('· air'), nom + ' garde le « Bon » nu');
  }
  // `airLabel` rend un mot déjà traduit : `tr(airLabel(…))` le retraduisait.
  assert.ok(!APP.includes('tr(airLabel('), 'le mot du bandeau repasse par tr');
  assert.equal(APP.split("? airLabel(a.maxCo2) : tr('BON')").length - 1, 2, 'le nom et le dessin de la tuile');
});
