/* La carte ÉTROITE d'une mesure (chantier Capteurs, tâche 4 bis ; la passe téléphone, ADR 0202).
 *
 * Sous 188 px de contenu — le téléphone —, la carte d'une mesure prend la grille commune des cartes étroites
 * (`o-gabarit`, index.css) : en haut, la plaque, et à droite le chiffre (`ChiffreHaut`) et sa famille ; le nom en
 * entier, deux lignes au plus, passé à la ligne entre deux mots ; la phrase, sous sa forme courte ; la barre des zones à
 * la place de la ligne de commandes. Ce qui change de place s'écrit deux fois, et la feuille n'en montre qu'une.
 *
 * Ce qui est garanti ici, la carte JOUÉE (tests/crochets.mjs ; sous `?carte_mesure_etroite`, App.jsx exporte la carte
 * et ses morceaux) et la feuille lue :
 *  - la carte est le conteneur de la grille commune ; le chiffre du haut et sa famille ne s'écrivent qu'étroits, le
 *    chiffre du bas que large : un seul de chaque à l'écran ;
 *  - le nom et la phrase prennent les règles de la grille ; une température qui dit l'humidité de son appareil a sa
 *    forme courte, « Idéal », sur la carte étroite ;
 *  - les chiffres sous la barre passent en 9,5 px, et ceux qui se toucheraient sur la carte la plus serrée se taisent
 *    sous 120 px de contenu ;
 *  - le budget : 184 px, un nom de deux lignes compris ; le chiffre du haut d'une mesure tient entre la plaque et le
 *    bord, de 22 à 16 px. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { monter, horlogeFausse, documentFaux } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?carte_mesure_etroite')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?carte_mesure_etroite'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { RoomMesureCard, BarreMesure, ChiffreMesure, reperesSerres, emChiffre };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?carte_mesure_etroite', import.meta.url).href);
const { barreMesure } = await import('../src/confort.js');
const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const NBSP = '\u00a0';
const mille = (n) => n.toLocaleString('fr-FR');
const capteur = (id, state, attributes) => ({ entity_id: id, state: String(state), last_changed: '2026-10-15T20:00:00+02:00', last_updated: '2026-10-15T20:39:00+02:00', attributes });
function maison() {
  return {
    'sensor.chambre_co2': capteur('sensor.chambre_co2', 1659, { friendly_name: 'CO₂ Chambre', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }),
    'sensor.sejour_temperature': capteur('sensor.sejour_temperature', 21.4, { friendly_name: 'Séjour', device_class: 'temperature', unit_of_measurement: '°C' }),
    'sensor.sejour_humidite': capteur('sensor.sejour_humidite', 52, { friendly_name: 'Séjour humidité', device_class: 'humidity', unit_of_measurement: '%' }),
    'sensor.sejour_cov': capteur('sensor.sejour_cov', 182, { friendly_name: 'Séjour COV', device_class: 'volatile_organic_compounds' }),
    'sensor.morte': capteur('sensor.morte', 'unavailable', { friendly_name: 'CO₂ mort', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }),
  };
}
/* L'appareil du séjour porte la température ET l'hygromètre : sa carte large dit l'humidité, sa carte étroite non.
 * FIXTURE MODIFIÉE (passe 1 quater, 16/10 ; C17) : une mesure n'est jugée que dans une pièce de Loggia — le séjour en est une, son appareil y a sa zone. */
const INDEX = { entityMeta: new Map([['sensor.sejour_temperature', { deviceId: 'thermo_sejour' }], ['sensor.sejour_humidite', { deviceId: 'thermo_sejour' }]]), deviceMeta: new Map(), areaList: [],
  areaNameOf: (id) => (String(id).indexOf('sensor.sejour_') === 0 ? 'Séjour' : null) };
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  setLoggiaState({ index: INDEX, ent: {}, cfg: { loggia_rooms: [{ room: 'Séjour' }] }, resolved: null });
  try { return await fn(); } finally { h.restaurer(); d.restaurer(); setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const carte = (id) => monter(F.RoomMesureCard, { id, hass: { states: maison(), config: { unit_system: { temperature: '°C' } } }, onOpen: () => {} });
const tous = (m, nom) => m.trouver(e => e.type && e.type.name === nom);
const avecClasse = (m, c) => m.trouver(e => e.props && typeof e.props.className === 'string' && e.props.className.split(' ').includes(c));

test('la carte est le conteneur de la grille commune ; le chiffre du haut et sa famille s’écrivent étroits, le chiffre du bas large — un seul de chaque', () => dans(() => {
  const m = carte('sensor.sejour_temperature');
  assert.ok(m.arbre.props.className.split(' ').includes('o-gabarit'), 'la grille commune');
  const haut = m.trouver(e => e.props && e.props.className === 'o-seul-etroit');
  assert.equal(haut.length, 1, 'une écriture étroite pour le chiffre et sa famille');
  const [chiffre, famille] = haut[0].props.children;
  assert.equal(chiffre.type.name, 'ChiffreHaut');
  assert.deepEqual([chiffre.props.v, chiffre.props.u], ['21,4', '°C'], 'le chiffre de la carte large, son unité');
  assert.deepEqual([famille.props.className, famille.props.children, famille.props['aria-hidden']], ['o-gab-etiquette', 'Température', 'true'], 'la famille, sous le chiffre ; la surface la dit déjà');
  assert.deepEqual([famille.props.style['--o-n'], famille.props.style['--o-reserve']], [11, '46px'], 'sa longueur, et la place que laisse la plaque (38 + 8 px)');
  assert.equal(tous(m, 'ChiffreMesure').length, 1);
  assert.equal(monter(F.ChiffreMesure, { chiffre: '21,4', unite: '°C', famille: 'Température' }).arbre.props.className, 'o-mesure-chiffre o-seul-large', 'le chiffre du bas : la carte large seule');
  // ASSERTION MODIFIÉE (correction bis, point 8) : le CO₂ écrit sa famille, comme les autres — dans Objets, sa carte porte le nom de sa pièce (C13). Une mesure muette n'a pas de chiffre du tout.
  // ASSERTION MODIFIÉE (correction bis 2, point 1) : sous son nom de Home Assistant, « CO₂ Chambre », elle se tait — le nom la dit déjà ; sous celui de sa pièce, elle s'écrit.
  const co2 = carte('sensor.chambre_co2');
  assert.deepEqual([tous(co2, 'ChiffreHaut')[0].props.v, tous(co2, 'ChiffreHaut')[0].props.u, avecClasse(co2, 'o-gab-etiquette').map(e => e.props.children)], [mille(1659), 'ppm', []]);
  const piece = monter(F.RoomMesureCard, { id: 'sensor.chambre_co2', hass: { states: maison(), config: { unit_system: { temperature: '°C' } } }, onOpen: () => {}, label: 'Chambre' });
  assert.deepEqual(avecClasse(piece, 'o-gab-etiquette').map(e => e.props.children), ['CO₂'], 'sous le nom de sa pièce');
  assert.equal(tous(carte('sensor.sejour_cov'), 'ChiffreHaut')[0].props.u, null, 'un indice, sans unité');
  assert.equal(avecClasse(carte('sensor.sejour_cov'), 'o-gab-etiquette')[0].props.children, 'Indice COV', 'sa famille le dit');
  const morte = carte('sensor.morte');
  assert.deepEqual([tous(morte, 'ChiffreHaut').length, tous(morte, 'ChiffreMesure').length], [0, 0]);
}));

test('le nom et la phrase prennent les règles de la grille ; une température dit l’humidité de son appareil sur la carte large, pas sur la carte étroite', () => dans(() => {
  const m = carte('sensor.sejour_temperature');
  assert.equal(avecClasse(m, 'o-mesure-nom')[0].props.className, 'o-mesure-nom o-gab-nom', 'le nom : 14 px, deux lignes au plus, entre deux mots');
  /* ASSERTIONS MODIFIÉES (correction bis, point 6) : la phrase de la carte LARGE vit dans son cadre (`o-mesure-phrases`, la carte large seule), où elle
   * rétrécit puis prend sa forme de repli ; la carte étroite écrit TOUJOURS la sienne à part, aux règles de la grille commune — sa forme courte s'il y en
   * a une, sinon la phrase entière. */
  const [longue] = avecClasse(m, 'o-mesure-phrase'), [courte] = avecClasse(m, 'o-mesure-phrase-courte');
  assert.ok(avecClasse(m, 'o-mesure-phrases')[0].props.className.split(' ').includes('o-seul-large'), 'la phrase large, dans son cadre');
  assert.deepEqual([longue.props.className, longue.props.children], ['o-mesure-phrase', 'Idéal · 52' + NBSP + '% d’humidité']);
  assert.deepEqual([courte.props.className, courte.props.children, courte.props.style['--o-n']], ['o-mesure-phrase-courte o-gab-phrase o-seul-etroit', 'Idéal', 5]);
  assert.equal(longue.props.style.color, courte.props.style.color, 'la même encre');
  assert.ok(tous(m, 'Surface')[0].props.label.endsWith('Idéal · 52 % d’humidité'), 'la surface dit la phrase entière : la forme courte y est contenue');
  // Sans forme courte, la carte étroite écrit la phrase entière, aux règles de la grille.
  const co2 = carte('sensor.chambre_co2');
  const etroite = avecClasse(co2, 'o-mesure-phrase-courte');
  assert.deepEqual(etroite.map(e => [e.props.className, e.props.children, e.props.style['--o-n']]), [['o-mesure-phrase-courte o-gab-phrase o-seul-etroit', 'Confiné · aérez', 'Confiné · aérez'.length]]);
}));

test('les chiffres sous la barre : 9,5 px sur une carte étroite ; ceux qui se toucheraient sur la carte la plus serrée (104 px) se taisent sous 120 px de contenu', () => {
  const gardes = (cle, v, u) => { const b = barreMesure(cle, v, u); const s = F.reperesSerres(b.reperes); return b.reperes.map((r, k) => (s[k] ? '(' + r.t + ')' : r.t)); };
  assert.deepEqual(gardes('co2', 1659), ['900', mille(1150), mille(1400), '(' + mille(1600) + ')'], 'le CO₂ tait « 1 600 »');
  assert.deepEqual(gardes('temp', 21.4, 'C'), ['15', '(17)', '23', '26', '29'], 'une température tait « 17 »');
  assert.deepEqual(gardes('temp', 21.4, 'F'), ['59', '(63)', '73', '79', '84'], 'en °F, « 63 »');
  assert.deepEqual(gardes('hum', 52), ['15', '30', '40', '50', '60', '70', '(80)'], 'une humidité tait « 80 »');
  for (const [cle, v, u] of [['bruit', 34], ['lux', 120], ['pm25', 8], ['cov', 182], ['vent', 9, 'km/h']]) assert.ok(!gardes(cle, v, u).some(t => t[0] === '('), cle + ' : tous ses chiffres tiennent');
  // TEST AJOUTÉ (passe 1 ter, 16/10 ; C15 révisé) : les barres du dehors gardent tous leurs chiffres, en °C comme en °F.
  const dehors = (cle, v, u) => { const b = barreMesure(cle, v, u, true); const s = F.reperesSerres(b.reperes); return b.reperes.map((r, k) => (s[k] ? '(' + r.t + ')' : r.t)); };
  assert.deepEqual([dehors('temp', 5, 'C'), dehors('temp', 5, 'F'), dehors('hum', 81, '%')], [['0', '10', '17', '25', '32'], ['32', '50', '63', '77', '90'], ['30', '70', '85']]);
  const b = monter(F.BarreMesure, { barre: barreMesure('co2', 1659) });
  assert.deepEqual(b.trouver(e => e.props && e.props.style && e.props.style.transform === 'translateX(-50%)').map(e => [e.props.children, e.props['data-serre']]),
    [['900', undefined], [mille(1150), undefined], [mille(1400), undefined], [mille(1600), '']], 'la carte pose `data-serre`, la feuille le lit');
  assert.ok(CSS.includes('@container (width < 188px) {\n  .o-mesure-nom { --o-nom-ligne: 16px; }\n  .o-mesure-reperes { font-size: 9.5px !important; }\n}'), 'sur une carte étroite : le nom sur des lignes de 16 px, les chiffres en 9,5 px');
  assert.ok(CSS.includes('@container (width < 120px) { .o-mesure-reperes > [data-serre] { display: none; } }'), 'sous 120 px de contenu, les chiffres serrés se taisent');
  // Le bloc vient APRÈS la grille commune : ses règles étroites ne la touchent pas (tests/chiffre_carte_etroite.test.mjs lit la première).
  assert.ok(CSS.indexOf('.o-mesure-reperes { font-size: 9.5px') > CSS.indexOf('.o-gabarit { container-type: inline-size; }'));
});

/* Les chiffres du haut d'une mesure, mesurés dans la démo (Manrope, 16/10) : le nombre en 22 px / 800 (−0,02 em), l'unité
 * en 12 px / 700 à 3 px. `[valeur, unité, largeur en px]`. */
const CHIFFRES = [['1 659', 'ppm', 85.4], ['538', 'ppm', 68.2], ['21,4', '°C', 63.4], ['70,5', '°F', 60.8], ['120', 'lx', 52.6], ['1 400', 'lx', 69.8],
  ['34', 'dB', 44.4], ['8', 'µg/m³', 51.7], ['182', null, 39.6], ['12', 'km/h', 59.4], ['47', '%', 40.2]];
// Le contenu d'une carte au téléphone : Objets, une pièce, une vue personnelle, à 390, 360 et 320 px (ADR 0202).
const VUES = { Objets: [142, 127, 107], Pièces: [148, 133, 113], 'vue perso': [139, 124, 104] };

test('le chiffre du haut d’une mesure : sa largeur en em (`emChiffre`) majore la mesure ; il tient entre la plaque et le bord, de 22 à 16 px', () => {
  for (const [ecrit, u, mesure] of CHIFFRES) {
    const v = ecrit.replace(' ', '\u202f');
    const em = F.emChiffre(v, u);
    const estime = em * 22 + (u ? 3 : 0);
    assert.ok(estime >= mesure - 0.3 && estime - mesure < 1, ecrit + ' ' + (u || '') + ' : ' + estime.toFixed(1) + ' px estimés pour ' + mesure + ' mesurés');
    for (const [vue, contenus] of Object.entries(VUES)) {
      for (const contenu of contenus) {
        const taille = Math.min(22, Math.max(16, (contenu - 49) / em));
        const rendu = (mesure - (u ? 3 : 0)) * taille / 22 + (u ? 3 : 0);
        // Le CO₂ à quatre chiffres, en 16 px, prend 2 px de l'air devant la plaque à 320 px (5 dans une vue personnelle) : jamais la plaque.
        const air = ecrit === '1 659' ? 3 : 8;
        assert.ok(contenu - rendu - 38 >= air - 0.3, vue + ', ' + contenu + ' px : « ' + ecrit + ' » en ' + taille.toFixed(1) + ' px laisse ' + (contenu - rendu - 38).toFixed(1) + ' px d’air');
      }
    }
  }
});

test('le budget de la carte étroite : 184 px, un nom de deux lignes compris', () => {
  // La ligne du haut : la plaque (38) — ou le chiffre (4 + 22) et sa famille (3 + 10) ; l'air (10) ; le nom (2 × 16) ; la phrase (2 + 15) ;
  // l'air (9) ; la barre (16), l'écart (4) et ses chiffres (14). Ce que la grille commune donne à une ligne de commandes (44), la barre en prend 34.
  const haut = Math.max(38, 4 + 22 + 3 + 10);
  assert.ok(haut + 10 + 2 * 16 + 2 + 15 + 9 + (16 + 4 + 14) <= 150, 'le contenu d’une carte de 184 px');
});
