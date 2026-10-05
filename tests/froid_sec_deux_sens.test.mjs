// ─────────────────────────────────────────────────────────────────────────────
// « Froid » et « Sec » : deux sens, deux clés (audit du 03/10).
//
// La clé d'un texte EST son français, et ces deux mots en portent deux.
// « Froid » : le mode d'une climatisation, ce qu'on ressent sous 16 °C, un
// capteur de froid, et le blanc de 6 500 K ; « Sec » : le mode qui
// déshumidifie et un air sec. Une clé n'a qu'une traduction : l'allemand, qui
// les avait rendues en modes, écrivait « Kühlen » (refroidir) sur la jauge de
// température et « Trocknen » (sécher) sur celle d'humidité ; l'anglais,
// « Cool » deux paliers de suite.
//
// Les clés nues restent aux MODES — leurs traductions anglaise, allemande et
// néerlandaise en sont, et aucune valeur existante ne se réécrit —, et ne
// servent plus que si Home Assistant ne donne pas le sien. La sensation passe
// par `trSens('Froid · ressenti')`, que le français lit « Froid » (vérifié à
// l'exécution par pieces_confort, qui tourne en français) ; les blancs ont des
// noms de blancs.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const LANGUES = ['en', 'de', 'nl', 'it', 'es', 'pl'];
const CATS = Object.fromEntries(await Promise.all(LANGUES.map(async l =>
  [l, (await import(pathToFileURL(join(RACINE, 'src', 'langues', l + '.js')).href)).default])));

/* L'écran en ALLEMAND, fixé AVANT le premier import : la langue se résout au
 * chargement d'i18n.js, et l'amorce y dépose le catalogue comme dans le
 * navigateur (`window.__loggiaCatalogue`, main.jsx). */
Object.defineProperty(globalThis, 'navigator', { value: { language: 'de-DE' }, configurable: true });
globalThis.window = { __loggiaCatalogue: { code: 'de', cat: CATS.de } };
const { verdictMesure, jaugeMesure } = await import('../src/confort.js');
const { tr, trSens, langue } = await import('../src/i18n.js');

const sources = [];
(function parcourir(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { if (f !== 'langues') parcourir(p); }
    else if (/\.jsx?$/.test(f)) sources.push(readFileSync(p, 'utf8'));
  }
})(join(RACINE, 'src'));
const SRC = sources.join('\n');
const APP = lire('src', 'App.jsx');
const PUR = lire('src', 'confort.js');

test('en allemand, la jauge dit ce qu’on ressent : « Kalt » sous 16 °C, « Trocken » sous 30 %', () => {
  assert.equal(langue(), 'de', 'le test ne tourne pas en allemand');
  assert.equal(verdictMesure('temp', 15.5).t, 'Kalt');
  assert.equal(verdictMesure('hum', 25).t, 'Trocken');
  assert.equal(jaugeMesure('hum', 25).verdict.t, 'Trocken', 'la jauge des cartes lit le même mot');
  assert.equal(trSens('Froid · ressenti'), 'Kalt');
  // Les modes gardent les leurs — quand Home Assistant ne donne pas le sien.
  assert.equal(tr('Froid'), 'Kühlen');
  assert.equal(tr('Sec'), 'Trocknen');
});

test('aucune langue ne dit le même mot sur deux paliers voisins', () => {
  // L'anglais disait « Cool » à 15,5 °C et à 16,5 °C : deux couleurs, un mot.
  const cles = (nom) => {
    const ligne = PUR.split('\n').find(l => l.trimStart().startsWith(nom + ': () => ['));
    assert.ok(ligne, nom + ' : la table des paliers est introuvable');
    return [...ligne.matchAll(/\btr(?:Sens)?\('([^']+)'\)/g)].map(m => m[1]);
  };
  for (const nom of ['temp', 'hum']) {
    assert.equal(cles(nom).length, 9, nom + ' : neuf paliers');
    for (const l of LANGUES) {
      const mots = cles(nom).map(k => CATS[l][k]);
      assert.ok(mots.every(m => typeof m === 'string' && m), `${l} : un palier de ${nom} sans traduction`);
      assert.deepEqual(mots.filter((m, i) => i > 0 && m === mots[i - 1]), [], `${l} : deux paliers voisins de ${nom} disent la même chose`);
    }
  }
});

test('chaque clé lue par trSens porte son sens et existe dans les six catalogues', () => {
  const cles = [...new Set([...SRC.matchAll(/\btrSens\('([^']+)'\)/g)].map(m => m[1]))];
  assert.ok(cles.includes('Froid · ressenti') && cles.includes('Sec · ressenti'), 'la sensation ne passe plus par trSens');
  for (const k of cles) {
    assert.match(k, / · [^·]+$/, `« ${k} » : le sens manque à la clé`);
    for (const l of LANGUES) assert.equal(typeof CATS[l][k], 'string', `${l} : « ${k} » manque`);
  }
  // Là où le mot nu est un mode, le sens ressenti en diffère.
  for (const l of ['en', 'de', 'nl']) assert.notEqual(CATS[l]['Froid · ressenti'], CATS[l]['Froid'], l + ' : Froid');
  for (const l of ['de', 'nl']) assert.notEqual(CATS[l]['Sec · ressenti'], CATS[l]['Sec'], l + ' : Sec');
});

test('le français lit le mot nu, jamais la clé avec son sens', () => {
  assert.ok(lire('src', 'i18n.js').includes("return v || tr(cle.replace(/ · [^·]+$/, ''));"));
});

test('le thermostat lit ses modes chez Home Assistant, comme le fil pilote', () => {
  assert.ok(!APP.includes('MODE_FR'), 'la table de modes sans Home Assistant est revenue');
  const i = APP.indexOf('\nfunction motModeClimat(');
  assert.ok(i > 0, 'motModeClimat introuvable');
  const corps = APP.slice(i, APP.indexOf('\n}', i));
  assert.ok(corps.includes("const ha = trHA('component.climate.entity_component._.state.' + mode);\n  if (ha) return ha;"), 'Home Assistant d’abord');
  assert.ok(APP.includes('nom: motModeClimat(m) }))}'), 'la fiche du thermostat');
  assert.ok(APP.includes('  if (!estClimate(zone)) return mode;\n  return motModeClimat(mode);\n}'), 'le fil pilote');
});

test('la sensation et les blancs ne lisent plus la clé d’un mode', () => {
  assert.ok(PUR.includes("[16, trSens('Froid · ressenti'), ORANGE]"));
  assert.ok(PUR.includes("[30, trSens('Sec · ressenti'), AMBRE]"));
  assert.ok(APP.includes("cold: [trSens('Froid · ressenti'), tr('Normal'), false]"), 'un capteur de froid');
  assert.ok(APP.includes("const WHITE_TEMPS = () => [[tr('Bougie'), 2200, '#ffb46b'], [tr('Blanc chaud'), 2700, '#ffd9a0'], [tr('Blanc neutre'), 4000, '#fff1dd'], [tr('Blanc froid'), 6500, '#eaf2ff']];"),
    'des noms de blancs, tous traduits');
  // `tr('Froid')` et `tr('Sec')` ne servent plus qu'aux modes, une fois chacun.
  const appels = (k) => SRC.split("tr('" + k + "')").length - 1;
  assert.equal(appels('Froid'), 1, 'tr(Froid) sert de nouveau un autre sens que le mode');
  assert.equal(appels('Sec'), 1, 'tr(Sec) sert de nouveau un autre sens que le mode');
});
