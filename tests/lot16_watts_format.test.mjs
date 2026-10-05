/* Des watts et une fraîcheur, écrits comme on les lit (lot 16, 05/10).
 *
 * `fmtWatts` choisissait l'unité AVANT d'arrondir : une puissance autour du
 * kilowatt passait de « 1 000 W » (999,6 arrondi) à « 1,00 kW » (1000) d'une
 * mise à jour à l'autre — sur l'Accueil, la tuile EXPORT RÉSEAU lit un
 * onduleur tel qu'il publie. Il écrivait aussi « -0 W » (un onduleur qui
 * publie -0,4 W la nuit), quand `nombre()` efface ce « -0 » exprès, et lisait
 * '' comme « 0 W » et l'infini comme « ∞ kW » là où `nombre()` dit « — ».
 *
 * `relTime` n'avait AUCUN test de comportement : carte_presence et historique
 * ne cherchent que son nom. Une date à venir a son propre fichier
 * (lot16_heure_future) : rien ici ne l'épingle.
 *
 * La langue est FIXÉE avant le premier import (règle de la CI) : `i18n.js` la
 * résout à l'import, d'après `navigator.language`. L'anglais se demande
 * ensuite par `preparerLangue`, comme nombres_langue — son test vient en
 * dernier.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { fmtWatts, relTime } = await import('../src/format.js');
const { langue, preparerLangue } = await import('../src/i18n.js');

/* Intl sépare les milliers par une espace fine insécable en français. */
const sansEspaces = (s) => s.replace(/[\s\u00a0\u202f]/g, ' ');

/* `Date.now` figé le temps d'un appel : relTime compte depuis lui. */
const MAINTENANT = Date.UTC(2026, 9, 5, 12, 0, 0);
function aFige(fn) {
  const avant = Date.now;
  Date.now = () => MAINTENANT;
  try { return fn(); } finally { Date.now = avant; }
}
const ilYA = (s) => new Date(MAINTENANT - s * 1000).toISOString();

test('fmtWatts en français : l’unité se choisit APRÈS l’arrondi', () => {
  assert.equal(langue(), 'fr');
  assert.equal(fmtWatts(999), '999 W');
  assert.equal(fmtWatts(999.4), '999 W', 'arrondi en dessous : on reste en watts');
  assert.equal(sansEspaces(fmtWatts(999.5)), '1,00 kW', 'arrondi à 1000 : c’est un kilowatt, pas « 1 000 W »');
  assert.equal(sansEspaces(fmtWatts(999.6)), '1,00 kW', 'la même puissance ne s’écrit pas de deux façons');
  assert.equal(sansEspaces(fmtWatts('999.6')), '1,00 kW', 'un état de Home Assistant arrive en chaîne');
  assert.equal(fmtWatts(1000), '1,00 kW', 'au seuil exact, rien ne change');
  assert.equal(fmtWatts(1240), '1,24 kW');
  assert.equal(fmtWatts(15000), '15,00 kW');
  assert.match(fmtWatts(-1500), /^[-−]1,50 kW$/, 'un export garde son signe');
  assert.match(fmtWatts(-999.6), /^[-−]1,00 kW$/);
  assert.equal(fmtWatts(0), '0 W');
  assert.equal(fmtWatts(460), '460 W', 'la tuile de l’Accueil (lot13) ne bouge pas');
});

test('fmtWatts : jamais « -0 W », « — » pour ce qui ne se lit pas', () => {
  assert.equal(fmtWatts(-0.4), '0 W', 'un onduleur à -0,4 W la nuit');
  assert.equal(fmtWatts(-0.5), '0 W');
  assert.match(fmtWatts(-0.6), /^[-−]1 W$/);
  for (const rien of ['', null, undefined, NaN, Infinity, -Infinity, 'indisponible']) assert.equal(fmtWatts(rien), '—', String(rien));
  assert.equal(fmtWatts('640'), '640 W', 'un état de Home Assistant arrive en chaîne');
});

test('relTime en français : « À l’instant », minutes, heures, jours', () => {
  aFige(() => {
    assert.equal(relTime(ilYA(30)), 'À l\'instant');
    assert.equal(relTime(ilYA(3 * 60)), 'Il y a 3 min');
    assert.equal(relTime(ilYA(2 * 3600)), 'Il y a 2 h');
    assert.equal(relTime(ilYA(5 * 86400)), 'Il y a 5 j');
    assert.equal(relTime(ilYA(59 * 60 + 59)), 'Il y a 59 min', 'l’approximation tronque');
  });
  for (const rien of ['pas une date', '', null, undefined]) assert.equal(relTime(rien), '', String(rien));
});

test('format.js : chaque doc au-dessus de SA fonction', () => {
  /* Le bloc « Depuis quand, en gros… » était resté au-dessus de celui de
   * minutesDepuisHeure (audit du 03/10) : relTime n'avait plus de doc, et
   * deux JSDoc se suivaient. */
  const s = readFileSync(new URL('../src/format.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  /* `ok` et non `match` : en échec, `match` recopierait tout le fichier. */
  assert.ok(/\/\*\* Depuis quand, en gros(?:[^*]|\*(?!\/))*\*\/\nexport function relTime\(/.test(s), 'la doc de relTime n’est pas collée à relTime');
  assert.ok(!/\*\/\n\/\*\*/.test(s), 'deux JSDoc se suivent sans fonction entre eux');
});

test('fmtWatts et relTime en anglais : le point, et les mots de la langue', async () => {
  await import('../src/langues/en.js');
  for (let i = 0; i < 100 && langue() !== 'en'; i++) {
    preparerLangue({ language: 'en' });
    await new Promise(r => setTimeout(r, 10));
  }
  assert.equal(langue(), 'en', 'le catalogue anglais ne s’est pas chargé');
  assert.equal(fmtWatts(999.4), '999 W');
  assert.equal(fmtWatts(999.6), '1.00 kW');
  assert.equal(fmtWatts(1240), '1.24 kW');
  assert.match(fmtWatts(-1500), /^[-−]1\.50 kW$/);
  assert.equal(fmtWatts(-0.4), '0 W');
  assert.equal(fmtWatts(''), '—');
  aFige(() => {
    assert.equal(relTime(ilYA(30)), 'Just now');
    assert.equal(relTime(ilYA(3 * 60)), '3 min ago');
    assert.equal(relTime(ilYA(2 * 3600)), '2 h ago');
    assert.equal(relTime(ilYA(5 * 86400)), '5 d ago');
  });
});
