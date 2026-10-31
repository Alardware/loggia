/* Le bandeau de collecte, rebranché (chantier G2, D2 ; ADR 0301).
 *
 * Il ne reconnaissait son calendrier qu'à des mots français écrits sans
 * accents : rien dans cinq des sept langues de la démo, ni pour « Déchets »,
 * « Poubelles » ou « Ordures ». Les capteurs (`daysTo`, `Days_until`) n'étaient
 * lus par aucun écran. « C'est sorti » vivait dans un `useState` — perdu au
 * rechargement, et chaque écran avait le sien. « avant 20:00 » était une heure
 * inventée.
 *
 * Désormais : la PLATEFORME d'abord (Waste Collection Schedule, Afvalbeheer),
 * puis le nom sans accents dans les sept langues ; les capteurs quand il n'y a
 * pas de calendrier ; « ce soir » tant qu'aucune heure n'est réglée ; et
 * « C'est sorti » rangé au serveur, dans la partie commune, avec le bouton de
 * la notification. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);

const C = await import('../src/collecte.js');
const { BandeauCollecte } = await import('../src/rappelsrail.jsx');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

// Vendredi 30 octobre 2026, 18 h : la veille d'une collecte.
const AUJ = new Date(2026, 9, 30, 18, 0, 0);
const demain = '2026-10-31';
const ev = (cal, summary, date) => ({ _cal: cal, summary, start: { date } });
const cal = (nom) => ({ state: 'off', attributes: { friendly_name: nom } });

/* Les noms du calendrier de la démo, dans ses sept langues : la ligne
 * « 'Collectes': { en: …, de: … } » de src/demo.js, lue telle quelle. */
function nomsDeLaDemo() {
  const ligne = lire('src', 'demo.js').split('\n').find(l => /^\s*'Collectes': \{/.test(l));
  assert.ok(ligne, 'la ligne « Collectes » de la démo a disparu');
  const noms = { fr: 'Collectes' };
  for (const m of ligne.matchAll(/(\w\w): '([^']+)'/g)) noms[m[1]] = m[2];
  assert.deepEqual(Object.keys(noms).sort(), ['de', 'en', 'es', 'fr', 'it', 'nl', 'pl']);
  return noms;
}

test('chaque langue de la démo voit son bandeau', () => {
  for (const [langue, nom] of Object.entries(nomsDeLaDemo())) {
    const S = { 'calendar.collectes': cal(nom), 'calendar.travail': cal('Travail') };
    const source = C.sourceCollecte(S, () => null);
    assert.equal(source.calendrier, 'calendar.collectes', langue + ' : « ' + nom + ' » n’est pas reconnu');
    const p = C.prochaineCollecte({ ...source, evenements: [ev('calendar.collectes', 'Verre', demain), ev('calendar.travail', 'Réunion', demain)], etats: S }, AUJ);
    assert.equal(p.jour, 1, langue);
    const html = renderToStaticMarkup(createElement(BandeauCollecte, { prochain: p, onSorti: () => {} }));
    assert.match(html, /Verre/, langue + ' : le bandeau ne dit pas ce qui passe');
    assert.doesNotMatch(html, /Réunion/, langue + ' : un autre calendrier s’est mêlé à la collecte');
  }
});

test('« Déchets » par son nom, « SIVOM » par sa plateforme', () => {
  const S = { 'calendar.dechets': cal('Déchets'), 'calendar.sivom': cal('SIVOM de la vallée'), 'calendar.travail': cal('Travail') };
  const plateforme = (id) => (id === 'calendar.sivom' ? 'waste_collection_schedule' : 'local_calendar');
  assert.deepEqual(C.sourcesCollecte(S, plateforme).calendriers, ['calendar.sivom', 'calendar.dechets'], 'la plateforme passe devant le nom');
  assert.equal(C.sourceCollecte({ 'calendar.sivom': cal('SIVOM') }, plateforme).calendrier, 'calendar.sivom');
  assert.equal(C.sourceCollecte({ 'calendar.sivom': cal('SIVOM') }, () => null).calendrier, null, 'sans plateforme ni mot, rien');
  for (const nom of ['Poubelles', 'Ordures ménagères', 'Restmüll', 'Ophaling', 'Rifiuti', 'Residuos', 'Basura', 'Wywóz śmieci', 'Abfall'])
    assert.ok(C.nomDeCollecte(nom), nom);
});

test('des mots entiers, et la plateforme avant le nom (relecture du 30/10)', () => {
  for (const nom of ['Familie Müller', 'Tonte des bordures', 'Collectif parents CM2', 'Sortie scolaire', 'Abfahrt Zug'])
    assert.ok(!C.nomDeCollecte(nom), nom + ' n’est pas un ramassage');
  for (const nom of ['Abfallkalender', 'Restmüll', 'Restafval', 'Afvalkalender', 'Biomüll'])
    assert.ok(C.nomDeCollecte(nom), nom);
  /* Contre-relecture du 30/10 : les composés du « Müll ». */
  for (const nom of ['Müllabfuhr', 'Müllkalender', 'Mülltermine', 'Mülltermin', 'Müllabholung', 'Mülltonne', 'Mülltonnen'])
    assert.ok(C.nomDeCollecte(nom), nom);
  assert.deepEqual(C.sourcesCollecte({ 'calendar.mullabfuhr': { state: 'off', attributes: {} } }, () => null).calendriers, ['calendar.mullabfuhr']);
  assert.ok(!C.nomDeCollecte('Familie Müller'), 'Familie Müller reste refusé');
  assert.deepEqual(C.sourcesCollecte({ 'calendar.familie_muller': cal('Familie Müller') }, () => null).calendriers, []);
  /* Des capteurs que leur PLATEFORME désigne passent devant un calendrier trouvé par son nom. */
  const S = { 'calendar.dechets': cal('Déchets'), 'sensor.prochain': { state: '2026-11-02', attributes: { friendly_name: 'Prochain passage' } } };
  const plateforme = (id) => (id === 'sensor.prochain' ? 'afvalbeheer' : null);
  assert.deepEqual(C.sourceCollecte(S, plateforme), { calendrier: null, capteurs: ['sensor.prochain'] });
  assert.deepEqual(C.sourceCollecte(S, () => null), { calendrier: 'calendar.dechets', capteurs: [] });
});

test('une correction de Paramètres passe devant la découverte', () => {
  const S = { 'calendar.collectes': cal('Collectes'), 'calendar.mairie': cal('Mairie') };
  assert.equal(C.sourceCollecte(S, () => null, 'calendar.mairie').calendrier, 'calendar.mairie');
  assert.equal(C.sourceCollecte(S, () => null, 'calendar.disparu').calendrier, 'calendar.collectes', 'une source disparue : la découverte');
});

test('les capteurs quand il n’y a pas de calendrier — Afvalbeheer compris', () => {
  const S = {
    'sensor.afval_gft': { state: '31-10-2026', attributes: { friendly_name: 'GFT', Days_until: 1 } },
    'sensor.afval_papier': { state: '31-10-2026', attributes: { friendly_name: 'Papier', Days_until: 1 } },
    'sensor.afval_rest': { state: '03-11-2026', attributes: { friendly_name: 'Restafval', Days_until: 4 } },
    // Un poids de déchets n'est pas un jour de passage.
    'sensor.dechets_kg': { state: '12', attributes: { friendly_name: 'Déchets triés', unit_of_measurement: 'kg' } },
  };
  const source = C.sourceCollecte(S, () => null);
  assert.deepEqual(source, { calendrier: null, capteurs: ['sensor.afval_gft', 'sensor.afval_papier', 'sensor.afval_rest'] });
  const p = C.prochaineCollecte({ ...source, etats: S }, AUJ);
  assert.equal(p.jour, 1);
  assert.deepEqual(p.types.map(t => t.nom), ['GFT', 'Papier']);
  assert.equal(C.lireCollecte(S['sensor.afval_rest'], AUJ).jours, 4, '`Days_until` d’Afvalbeheer');
  // Un capteur reconnu par sa plateforme, même sans mot dans son nom.
  const W = { 'sensor.prochain': { state: '2026-11-02', attributes: { friendly_name: 'Prochain passage' } } };
  assert.deepEqual(C.sourceCollecte(W, () => 'waste_collection_schedule').capteurs, ['sensor.prochain']);
});

test('« ce soir » tant qu’aucune heure n’est réglée', () => {
  const p = { jour: 1, date: new Date(2026, 9, 31), types: [C.familleCollecte('Verre', 0)] };
  const html = renderToStaticMarkup(createElement(BandeauCollecte, { prochain: p, onSorti: () => {} }));
  assert.match(html, /À sortir ce soir</);
  assert.doesNotMatch(html, /20:00/, 'une heure inventée');
  assert.match(renderToStaticMarkup(createElement(BandeauCollecte, { prochain: p, heureSortie: '21:00' })), /avant 21:00/);
});

test('« C’est sorti » se lit dans la partie commune, pour le jour du ramassage', () => {
  const p = { jour: 1, date: new Date(2026, 9, 31), types: [] };
  assert.equal(C.jourIso(p.date), '2026-10-31');
  assert.equal(C.sortiPour({ sorti: '2026-10-31', rappele: '' }, p), true);
  assert.equal(C.sortiPour({ sorti: '2026-10-24' }, p), false, 'la semaine dernière ne compte pas');
  assert.equal(C.sortiPour(null, p), false);
  assert.equal(C.sortiPour({ sorti: '2026-10-31' }, null), false);
});

test('l’Accueil ne garde plus « sorti » dans un état de l’écran', () => {
  const src = lire('src', 'accueil', 'dashboard.jsx');
  const hook = src.slice(src.indexOf('function useRappelsAccueil('), src.indexOf('function useAgencementAccueil('));
  assert.ok(!/useState\(/.test(hook), 'un useState : chaque écran aurait le sien, perdu au rechargement');
  assert.ok(hook.includes("cfgVal('loggia_collecte'"), 'la partie commune, que tous les écrans relisent');
  assert.ok(src.includes("type: 'loggia/collecte/sorti'"), 'le bouton écrit au serveur, au même endroit que le téléphone');
  assert.ok(!/recogida|dechet\|waste/.test(hook), 'les mots vivent dans collecte.js, une seule liste');
});

test('la démo répond aux deux commandes nouvelles', () => {
  const demo = lire('src', 'demo.js');
  assert.ok(demo.includes("msg.type === 'loggia/collecte/sorti'"));
  assert.ok(demo.includes("msg.type === 'loggia/notifications/destinataires'"));
});
