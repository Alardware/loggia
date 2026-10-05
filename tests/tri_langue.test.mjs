/* Le tri alphabétique suit la langue de l'ÉCRAN (audit du 03/10).
 *
 * Huit listes triaient sur 'fr' en dur — les pièces, les appareils d'une
 * pièce, les piles, les points d'attention, les machines du Système… — et une
 * vingtaine d'autres appelaient `localeCompare` SANS langue, donc dans celle
 * du NAVIGATEUR. `comparerTextes` (i18n.js) existait et ne servait qu'une fois.
 *
 * En polonais, « Ś » est une lettre à part, rangée après « S » : « Sypialnia »
 * vient avant « Świetlica ». En français, « Świetlica » passait devant — au
 * milieu d'une interface polonaise.
 *
 * `i18n.js` résout sa langue À L'IMPORT, d'après `navigator.language` : elle
 * est fixée avant, d'où les imports dynamiques. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'pl-PL' }, configurable: true });
const { langue, comparerTextes } = await import('../src/i18n.js');
const { devicesByArea } = await import('../src/devices.js');
const { buildIndex } = await import('../src/discovery.js');
const { pilesMaison } = await import('../src/piles.js');
const { listesTodo } = await import('../src/todos.js');
const { trierObjets } = await import('../src/objets.js');

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const NOMS = ['Świetlica', 'Sypialnia', 'Salon'];
const POLONAIS = ['Salon', 'Sypialnia', 'Świetlica'];

test('le décor : l’écran parle polonais, et le polonais range « Ś » après « S »', () => {
  assert.equal(langue(), 'pl');
  assert.deepEqual(NOMS.slice().sort(comparerTextes), POLONAIS);
  // Sans écart entre les deux langues, les tests suivants ne prouveraient rien.
  assert.notDeepEqual(NOMS.slice().sort((a, b) => a.localeCompare(b, 'fr')), POLONAIS);
});

test('ce qui triait en français en dur : les pièces, les appareils d’une pièce, les piles', () => {
  const ix = buildIndex({ areas: NOMS.map((name, i) => ({ area_id: 'z' + i, name })) });
  assert.deepEqual(ix.areaList.map(a => a.name), POLONAIS, 'les pièces');
  const appareils = new Map(NOMS.map((name, i) => ['d' + i, { id: 'd' + i, name, area: 'z' }]));
  assert.deepEqual(devicesByArea(appareils, 'z').map(d => d.name), POLONAIS, 'les appareils d’une pièce');
  const piles = Object.fromEntries(NOMS.map((nom, i) => ['sensor.pile_' + i, { state: '40', attributes: { device_class: 'battery', friendly_name: nom } }]));
  assert.deepEqual(pilesMaison(piles).map(p => piles[p.id].attributes.friendly_name), POLONAIS, 'les piles de même charge');
});

/* Sans langue, `localeCompare` prend celle de la machine — celle de Node, pas
 * la langue fixée plus haut : sur un poste ou un runner qui ne parle pas
 * polonais, l'ancien code rangeait à la française ou à l'anglaise. */
test('ce qui suivait le navigateur suit l’écran : les listes de tâches, la grille des Objets', () => {
  const etats = Object.fromEntries(NOMS.map((nom, i) => ['todo.liste_' + i, { state: '0', attributes: { friendly_name: nom } }]));
  assert.deepEqual(listesTodo(etats).map(l => l.nom), POLONAIS, 'les listes de tâches');
  const objets = NOMS.map(nom => ({ nom, piece: 'P', filtres: [] }));
  assert.deepEqual(trierObjets(objets, ['P']).map(o => o.nom), POLONAIS, 'la grille des Objets');
});

test('un seul localeCompare dans src/ : celui de comparerTextes', () => {
  const fautifs = [];
  const parcourir = (dossier) => readdirSync(dossier, { withFileTypes: true }).forEach(e => {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) { parcourir(chemin); return; }
    if (!/\.(js|jsx|mjs)$/.test(e.name)) return;
    const rel = relative(SRC, chemin).split('\\').join('/');
    if (rel === 'i18n.js') return;
    readFileSync(chemin, 'utf8').split(/\r?\n/).forEach((ligne, i) => {
      if (ligne.includes('.localeCompare(')) fautifs.push(rel + ':' + (i + 1));
    });
  });
  parcourir(SRC);
  assert.deepEqual(fautifs, [], 'trier du texte passe par comparerTextes : une langue écrite en dur, ou aucune, range dans une autre langue que celle de l’écran');
  const i18n = readFileSync(join(SRC, 'i18n.js'), 'utf8');
  assert.ok(i18n.includes("localeCompare(String(b == null ? '' : b), langue())"), 'comparerTextes ne suit plus la langue de l’écran');
});

test('l’horloge de carte parle la langue de l’écran, pas celle du navigateur', () => {
  const app = readFileSync(join(SRC, 'App.jsx'), 'utf8');
  const horloge = app.slice(app.indexOf('function CvClock()'), app.indexOf('function CvBigSensor('));
  assert.ok(horloge.includes("d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })"), 'l’heure');
  assert.ok(horloge.includes("d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })"), 'le jour');
});
