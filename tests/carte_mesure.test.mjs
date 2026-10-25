/* La carte d'une mesure (chantier Capteurs, § 3 ; C5, C6, C8, C11).
 *
 * Ces tests JOUENT la carte (tests/crochets.mjs) : on la monte sur un `hass`, on
 * lit ce qu'elle dessine — la plaque, la phrase, le chiffre et sa famille, la
 * barre des zones. Sous `?carte_mesure`, App.jsx exporte la carte et ses
 * morceaux — le fichier n'est pas touché. Ce qui est garanti :
 *  - hors du bon, la couleur de la zone : la plaque, la phrase, un lavis de 0,1
 *    en haut (0,16 pour la dernière zone) ; une zone bonne s'écrit en neutre (C5) ;
 *  - la phrase (C8) ; le chiffre, son unité et sa famille — le CO₂ compris
 *    (correction bis, point 8) ;
 *  - la barre : une bande par zone, la zone où l'on est pleine, le repère, les
 *    chiffres dans l'unité du capteur ;
 *  - une mesure muette le dit en rouge, sans chiffre ni barre ;
 *  - la carte s'abonne à SA mesure, et à l'hygromètre de son appareil ;
 *  - la fabrique des cartes envoie une mesure de la table à cette carte (C6) ;
 *  - le nom passe sur deux lignes au plus, entre deux mots, et la surface dit la
 *    famille avec le chiffre (C13) ;
 *  - dehors, seuls le vent et les particules se jugent ; une pièce du dehors se
 *    reconnaît dans les sept langues (C15) ;
 *  - correction bis : sur la carte large, aucun mot coupé — le chiffre cède, la
 *    phrase rétrécit puis prend sa forme de repli (point 6) ; la Bibliothèque des
 *    cartes garde sa maison fictive (point 7) ; le glyphe de la famille (point 9) ;
 *    un état qui n'est pas un nombre devient la phrase (point 10) ; un vent dans une
 *    unité inconnue n'a pas de zone (point 11) ;
 *  - correction bis 2 : la famille se tait quand le nom affiché la dit déjà
 *    (point 1) ; la colonne du chiffre a un plancher de 14 px, et au-delà le nom
 *    cède (point 4) ;
 *  - C17 (passe 1 quater) : une mesure n'est jugée que dans une pièce de Loggia —
 *    sans zone, ou dans une zone inconnue, sa carte est neutre : le chiffre et sa
 *    famille, ni barre, ni teinte, ni lavis.
 * La carte ÉTROITE — le téléphone — est celle de la tâche 4 bis
 * (tests/carte_mesure_etroite.test.mjs). */
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
  "  if (!url.endsWith('/src/App.jsx?carte_mesure')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?carte_mesure'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { RoomMesureCard, BarreMesure, ChiffreMesure, useDomainCards, estDehors };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?carte_mesure', import.meta.url).href);
const { nomDitFamille } = await import('../src/confort.js');

const NBSP = '\u00a0';
const SURFACE = 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))';
const mille = (n) => n.toLocaleString('fr-FR');
const capteur = (id, state, attributes) => ({ entity_id: id, state: String(state), last_changed: '2026-10-15T20:00:00+02:00', last_updated: '2026-10-15T20:39:00+02:00', attributes });
function maison() {
  return {
    'sensor.chambre_co2': capteur('sensor.chambre_co2', 1659, { friendly_name: 'CO₂ Chambre', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }),
    'sensor.lino_co2': capteur('sensor.lino_co2', 1177, { friendly_name: 'CO₂ Chambre Lino', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }),
    'sensor.sejour_temperature': capteur('sensor.sejour_temperature', 21.4, { friendly_name: 'Séjour', device_class: 'temperature', unit_of_measurement: '°C' }),
    'sensor.sejour_humidite': capteur('sensor.sejour_humidite', 52, { friendly_name: 'Séjour humidité', device_class: 'humidity', unit_of_measurement: '%' }),
    'sensor.bureau_temperature': capteur('sensor.bureau_temperature', 70.5, { friendly_name: 'Bureau', device_class: 'temperature', unit_of_measurement: '°F' }),
    'sensor.sdb_humidite': capteur('sensor.sdb_humidite', 68, { friendly_name: 'Salle de bain', device_class: 'humidity', unit_of_measurement: '%' }),
    'sensor.sejour_lux': capteur('sensor.sejour_lux', 120, { friendly_name: 'Lumière séjour', device_class: 'illuminance', unit_of_measurement: 'lx' }),
    'sensor.morte': capteur('sensor.morte', 'unavailable', { friendly_name: 'CO₂ mort', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }),
    'sensor.pression': capteur('sensor.pression', 1013, { friendly_name: 'Pression', device_class: 'atmospheric_pressure', unit_of_measurement: 'hPa' }),
    // La station du jardin (C15) : 5 °C serait « Trop froid » dans une pièce, 60 km/h est un vent « Fort ».
    'sensor.jardin_temperature': capteur('sensor.jardin_temperature', 5, { friendly_name: 'Jardin température', device_class: 'temperature', unit_of_measurement: '°C' }),
    'sensor.jardin_humidite': capteur('sensor.jardin_humidite', 92, { friendly_name: 'Jardin humidité', device_class: 'humidity', unit_of_measurement: '%' }),
    'sensor.jardin_vent': capteur('sensor.jardin_vent', 60, { friendly_name: 'Jardin vent', device_class: 'wind_speed', unit_of_measurement: 'km/h' }),
    // C17 (passe 1 quater) : un frigo, sans zone ; la sonde d'une carte mère, dans « network », une zone qui n'est pas une pièce.
    'sensor.frigo_temperature': capteur('sensor.frigo_temperature', 4.2, { friendly_name: 'Capteur Frigo', device_class: 'temperature', unit_of_measurement: '°C' }),
    'sensor.unraid_temperature': capteur('sensor.unraid_temperature', 58, { friendly_name: 'Température Core 0', device_class: 'temperature', unit_of_measurement: '°C' }),
  };
}
/* L'appareil du séjour porte la température ET l'hygromètre : la carte de la température dit l'humidité (C8).
 * La station du jardin aussi, dans une zone du dehors (C15).
 * FIXTURE MODIFIÉE (passe 1 quater, 16/10 ; C17) : une mesure n'est jugée que dans une pièce de Loggia — le séjour et le jardin en sont deux, leurs
 * capteurs y ont leur zone. Les autres mesures de cette maison, que le registre ne connaît pas, gardent la table, comme la maison fictive de la
 * Bibliothèque ; le frigo et la carte mère, au registre, sans zone ou dans une zone inconnue, sont neutres. */
const ZONES = { 'sensor.sejour_temperature': 'Séjour', 'sensor.sejour_humidite': 'Séjour', 'sensor.jardin_temperature': 'Jardin', 'sensor.jardin_humidite': 'Jardin',
  'sensor.jardin_vent': 'Jardin', 'sensor.unraid_temperature': 'network' };
const INDEX = { entityMeta: new Map([['sensor.sejour_temperature', { deviceId: 'thermo_sejour' }], ['sensor.sejour_humidite', { deviceId: 'thermo_sejour' }],
  ['sensor.jardin_temperature', { deviceId: 'station' }], ['sensor.jardin_humidite', { deviceId: 'station' }], ['sensor.jardin_vent', { deviceId: 'station' }],
  ['sensor.frigo_temperature', { deviceId: 'frigo' }], ['sensor.unraid_temperature', { deviceId: 'unraid' }]]),
  deviceMeta: new Map(), areaList: [], areaNameOf: (id) => ZONES[id] || null };
const PIECES = [{ room: 'Séjour' }, { room: 'Jardin' }];
function poser(courants = maison()) {
  setLoggiaState({ index: INDEX, ent: {}, cfg: { loggia_rooms: PIECES }, resolved: null });
  return { courants, hass: () => ({ states: Object.fromEntries(Object.entries(courants).map(([k, v]) => [k, { ...v }])), config: { unit_system: { temperature: '°C' } } }) };
}
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  try { return await fn({ h, d }); } finally { h.restaurer(); d.restaurer(); setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const de = (m, nom) => m.trouver(e => e.type && e.type.name === nom)[0];
const classe = (m, c) => m.trouver(e => e.props && typeof e.props.className === 'string' && e.props.className.split(' ').includes(c))[0];
const plaque = (m) => m.trouver(e => e.props && e.props.style && e.props.style.width === 38)[0].props.style;
const carte = (id, w = poser()) => monter(F.RoomMesureCard, { id, hass: w.hass(), onOpen: () => {} });

test('§ 3, C5 : hors du bon, la couleur de la zone — la plaque, la phrase, un lavis de 0,1 ; 0,16 pour la dernière zone', () => dans(() => {
  const confine = carte('sensor.chambre_co2');
  assert.deepEqual([plaque(confine).background, plaque(confine).color], ['rgba(var(--o-bad-rgb),.16)', 'var(--o-bad)']);
  const ph = classe(confine, 'o-mesure-phrase');
  assert.deepEqual([ph.props.children, ph.props.style.color], ['Confiné · aérez', 'var(--o-bad)']);
  assert.ok(confine.arbre.props.style.background.startsWith('linear-gradient(180deg,rgba(var(--o-bad-rgb),0.16),rgba(var(--o-bad-rgb),0.03) 72%)'), 'la dernière zone : 0,16 en haut, 0,03 en bas');
  const moyen = carte('sensor.lino_co2');
  assert.ok(moyen.arbre.props.style.background.startsWith('linear-gradient(180deg,rgba(var(--o-warn-rgb),0.1),rgba(var(--o-warn-rgb),0.03) 72%)'), 'une autre zone : 0,1 en haut');
  assert.equal(classe(moyen, 'o-mesure-phrase').props.children, 'Moyen · aérez');
  assert.equal(classe(carte('sensor.sdb_humidite'), 'o-mesure-phrase').props.children, 'Humide · aérez');
}));

test('C5 : le calme ne crie pas — une zone bonne s’écrit en neutre, sans teinte ni lavis ; aucune lumière n’est une alerte', () => dans(() => {
  const m = carte('sensor.sejour_temperature');
  assert.deepEqual([plaque(m).background, plaque(m).color], ['var(--o-s1)', 'var(--o-text1)']);
  assert.equal(classe(m, 'o-mesure-phrase').props.style.color, 'var(--o-text2)');
  assert.equal(m.arbre.props.style.background, SURFACE, 'la surface de la maison, sans lavis');
  const lux = carte('sensor.sejour_lux');
  assert.equal(lux.arbre.props.style.background, SURFACE);
  assert.deepEqual([classe(lux, 'o-mesure-phrase').props.children, plaque(lux).color], ['Tamisé', 'var(--o-text1)']);
}));

test('C8 : une température dit aussi l’humidité de son appareil ; sans hygromètre, le mot seul', () => dans(() => {
  assert.equal(classe(carte('sensor.sejour_temperature'), 'o-mesure-phrase').props.children, 'Idéal · 52' + NBSP + '% d’humidité');
  assert.equal(classe(carte('sensor.bureau_temperature'), 'o-mesure-phrase').props.children, 'Idéal', 'un capteur sans appareil');
}));

test('§ 3 : le chiffre en grand, son unité, sa famille en petites capitales — le CO₂ compris ; le Fahrenheit dans son unité', () => dans(() => {
  const t = de(carte('sensor.sejour_temperature'), 'ChiffreMesure').props;
  assert.deepEqual([t.chiffre, t.unite, t.famille], ['21,4', '°C', 'Température']);
  /* ASSERTION MODIFIÉE (correction bis, point 8) : la famille du CO₂ s'écrit, comme les autres — dans Objets, la carte porte le nom de sa pièce (C13).
   * ASSERTION MODIFIÉE (correction bis 2, point 1) : sous son nom de Home Assistant, « CO₂ Chambre », elle se tait — le nom la dit déjà ; sous le nom de
   * sa pièce, celui qu'Objets lui donne, elle s'écrit. */
  const c = de(monter(F.RoomMesureCard, { id: 'sensor.chambre_co2', hass: poser().hass(), onOpen: () => {}, label: 'Chambre' }), 'ChiffreMesure').props;
  assert.deepEqual([c.chiffre, c.unite, c.famille], [mille(1659), 'ppm', 'CO₂'], 'la famille du CO₂, sous son chiffre');
  assert.equal(de(carte('sensor.chambre_co2'), 'ChiffreMesure').props.famille, '', 'son nom de Home Assistant la dit déjà');
  const f = de(carte('sensor.bureau_temperature'), 'ChiffreMesure').props;
  assert.deepEqual([f.chiffre, f.unite], ['70,5', '°F'], 'le chiffre de son capteur, dans son unité ; sa zone se lit en Celsius');
  const m = monter(F.ChiffreMesure, { chiffre: '21,4', unite: '°C', famille: 'Température' });
  assert.equal(m.arbre.props['aria-hidden'], 'true', 'la surface le dit déjà');
  /* ASSERTION MODIFIÉE (correction bis, point 6) : c'est le CHIFFRE qui cède, jamais un mot du nom qui se coupe. Sa colonne rétrécit (`flex-shrink`), et sa
   * ligne — large de sa taille estimée, sans jamais dépasser la colonne — est le conteneur qui règle sa taille (index.css, `o-mesure-ligne`).
   * ASSERTION MODIFIÉE (correction bis 2, point 4) : sa colonne a un plancher, le chiffre en 14 px — « 21,4 °C » : 2,849 em × 14, 40 px. */
  assert.deepEqual([m.arbre.props.style.flex, m.arbre.props.style.minWidth], ['0 1 auto', 40], 'la colonne du chiffre cède, jusqu’à son plancher');
  const ligne = classe(m, 'o-mesure-ligne').props.style;
  assert.deepEqual([ligne.width, ligne.maxWidth, ligne['--o-em']], ['72px', '100%', 2.849], '« 21,4 °C » : 25 × 2,1 em, 3 px, et « °C » en 13 px — 71 px mesurés dans la démo');
  assert.ok(classe(m, 'o-mesure-famille') && classe(m, 'o-mesure-unite'), 'l’unité à côté du chiffre, la famille dessous');
}));

test('§ 3 : la barre — une bande par zone, la zone où l’on est en plein, le repère à la valeur, les chiffres dans l’unité du capteur', () => dans(() => {
  const b = de(carte('sensor.chambre_co2'), 'BarreMesure').props.barre;
  assert.deepEqual([b.zones.length, b.i, b.pos], [5, 4, 95.2]);
  const m = monter(F.BarreMesure, { barre: b });
  const bandes = m.trouver(e => e.props && e.props['data-bande'] != null);
  assert.deepEqual(bandes.map(e => e.props.style.background),
    ['rgba(var(--o-cold-rgb),0.28)', 'rgba(var(--o-ok-rgb),0.28)', 'rgba(var(--o-warn-rgb),0.28)', 'rgba(var(--o-warn2-rgb),0.28)', 'rgba(var(--o-bad-rgb),1)']);
  assert.deepEqual(bandes.map(e => e.props.style.flexGrow), b.zones.map(z => z.part), 'chaque bande, sa part de l’échelle');
  const rep = m.trouver(e => e.props && e.props['data-repere'] != null)[0].props.style;
  assert.deepEqual([rep.left, rep.width, rep.height, rep.background], ['95.2%', 4, 16, 'var(--o-text)']);
  assert.equal(m.arbre.props['aria-hidden'], 'true', 'la phrase et le chiffre sont déjà dits : la barre ne se lit pas');
  assert.deepEqual(m.trouver(e => e.props && e.props.style && e.props.style.transform === 'translateX(-50%)').map(e => e.props.children), ['900', mille(1150), mille(1400), mille(1600)]);
  const f = de(carte('sensor.bureau_temperature'), 'BarreMesure').props.barre;
  assert.deepEqual(f.reperes.map(r => r.t), ['59', '63', '73', '79', '84'], 'des °F sous un capteur en °F');
}));

test('muette : « Indisponible » en rouge, le liseré qui respire, ni chiffre ni barre', () => dans(() => {
  const m = carte('sensor.morte');
  const ph = classe(m, 'o-mesure-phrase');
  assert.deepEqual([ph.props.children, ph.props.style.color], ['Indisponible', 'var(--o-bad)']);
  assert.ok(m.arbre.props.className.includes('o-panne'), 'le liseré (ADR 0048)');
  assert.equal(de(m, 'ChiffreMesure'), undefined);
  assert.equal(de(m, 'BarreMesure'), undefined);
  assert.deepEqual([plaque(m).background, plaque(m).color], ['var(--o-s1)', 'var(--o-text3)']);
}));

test('la surface nomme la carte de ce qu’elle affiche : le nom, la famille et le chiffre, la phrase — le CO₂ compris (C13)', () => dans(() => {
  /* ASSERTION MODIFIÉE (correction bis, point 8) : la carte écrit la famille du CO₂ ; la surface la dit avec le chiffre, comme les autres.
   * ASSERTION MODIFIÉE (correction bis 2, point 1) : sauf quand le nom la dit déjà — le lecteur d'écran lisait « CO₂ Chambre, CO₂ 1 659 ppm ». */
  assert.equal(de(carte('sensor.chambre_co2'), 'Surface').props.label, 'CO₂ Chambre, 1 659 ppm, Confiné · aérez');
  assert.equal(de(monter(F.RoomMesureCard, { id: 'sensor.chambre_co2', hass: poser().hass(), onOpen: () => {}, label: 'Chambre' }), 'Surface').props.label,
    'Chambre, CO₂ 1 659 ppm, Confiné · aérez', 'sous le nom de sa pièce, la famille le complète');
  assert.equal(de(carte('sensor.sejour_temperature'), 'Surface').props.label, 'Séjour, Température 21,4 °C, Idéal · 52 % d’humidité', 'dans Objets, la carte porte le nom de sa pièce : la famille le complète');
  assert.equal(de(carte('sensor.morte'), 'Surface').props.label, 'CO₂ mort, Indisponible');
}));

test('C13 : le nom passe sur deux lignes au plus, entre deux mots, et la carte garde ses 184 px', () => dans(() => {
  const nom = classe(carte('sensor.sejour_temperature'), 'o-mesure-nom').props.style;
  assert.deepEqual([nom.fontSize, nom.whiteSpace, nom.overflowWrap, nom.display, nom.WebkitBoxOrient, nom.WebkitLineClamp, nom.lineHeight],
    [15, 'normal', 'normal', '-webkit-box', 'vertical', 2, 'var(--o-nom-ligne, 18px)'], 'deux lignes de 18 px, jamais un mot coupé');
  assert.ok(!/break-word|anywhere/.test(JSON.stringify(nom)), 'aucun mot ne se coupe');
  const barre = de(carte('sensor.chambre_co2'), 'BarreMesure');
  assert.equal(monter(F.BarreMesure, barre.props).arbre.props.style.paddingTop, 'var(--o-pied-haut, 8px)', '8 px d’air au moins au-dessus de la barre');
  // Le budget de la carte large : la plaque, 14 px, deux lignes de nom, la phrase, l'air, la barre et ses chiffres — dans 150 px de contenu.
  assert.ok(38 + 14 + 2 * 18 + 18 + 8 + (16 + 4 + 14) <= 150);
}));

/* ASSERTIONS MODIFIÉES (passe 1 ter, 16/10 ; C15 révisé). Sa phrase : « les capteur exterieur il manque les jauges » — ses cartes du dehors, sans
 * barre, avaient l'air inachevées. Dehors a ses propres zones : la température et l'humidité gardent la barre, le mot de leur zone et ses repères.
 * Mais dehors, rien n'est une alerte : ni teinte, ni lavis, ni encre de couleur — le vent fort non plus, qui teintait la carte. */
test('C15 révisé : dehors, la barre et le mot des zones du dehors ; ni teinte, ni lavis — le vent fort non plus', () => dans(() => {
  const t = carte('sensor.jardin_temperature');
  const b = de(t, 'BarreMesure').props.barre;
  assert.deepEqual([b.zones.map(z => z.t), b.i, b.reperes.map(r => r.t)], [['Gel', 'Froid', 'Frais', 'Doux', 'Chaud', 'Canicule'], 1, ['0', '10', '17', '25', '32']], 'la barre du dehors, à 5 °C');
  assert.deepEqual([plaque(t).background, plaque(t).color], ['var(--o-s1)', 'var(--o-text1)'], 'ni teinte');
  assert.equal(t.arbre.props.style.background, SURFACE, 'ni lavis');
  const ph = classe(t, 'o-mesure-phrase');
  assert.deepEqual([ph.props.children, ph.props.style.color], ['Froid · 92' + NBSP + '% d’humidité', 'var(--o-text2)'], 'le mot de sa zone, en neutre, et l’humidité de son appareil');
  assert.equal(de(t, 'ChiffreMesure').props.chiffre, '5,0', 'le chiffre reste');
  // ASSERTION MODIFIÉE (correction bis 2, point 1) : « Jardin température » dit sa famille — la surface ne la redit pas.
  assert.equal(de(t, 'Surface').props.label, 'Jardin température, 5,0 °C, Froid · 92 % d’humidité');
  const h = carte('sensor.jardin_humidite');
  assert.deepEqual([de(h, 'BarreMesure').props.barre.zones.map(z => z.t), classe(h, 'o-mesure-phrase').props.children], [['Sec', 'Normal', 'Humide', 'Saturé'], 'Saturé'], 'une humidité du dehors : sa barre et son mot');
  assert.deepEqual([plaque(h).color, h.arbre.props.style.background], ['var(--o-text1)', SURFACE], 'saturé, sans alerte');
  const v = carte('sensor.jardin_vent');
  assert.ok(de(v, 'BarreMesure'), 'le vent garde sa barre');
  assert.deepEqual([classe(v, 'o-mesure-phrase').props.children, plaque(v).color, v.arbre.props.style.background], ['Fort', 'var(--o-text1)', SURFACE], 'et sa zone, sans alerte');
}));

test('C15 : une pièce du dehors se reconnaît dans les sept langues, sans accents', () => {
  for (const nom of ['Jardin', 'Garden', 'Garten', 'Tuin', 'Giardino', 'Jardín', 'Ogród', 'Terrasse', 'Terrace', 'Terras', 'Terrazza', 'Terraza', 'Taras', 'Balcón', 'Extérieur', 'Esterno', 'Buiten', 'Na zewnątrz', 'Außen']) {
    assert.ok(F.estDehors(nom), nom);
  }
  for (const nom of ['Salon', 'Chambre', 'Garage', 'Cuisine', 'Bureau', 'Salle de bain', null]) assert.ok(!F.estDehors(nom), String(nom));
});

/* TEST AJOUTÉ (passe 1 quater, 16/10 ; C17) : son « Capteur Frigo », sans zone, aurait été « Trop froid » pour toujours, en rouge ; la sonde d'une carte
 * mère, « Trop chaud ». Hors d'une pièce de Loggia, la carte est NEUTRE : le chiffre et sa famille, ni barre, ni teinte, ni lavis, ni phrase de zone. */
test('C17 : sans zone, ou dans une zone inconnue, la carte est neutre — le chiffre et sa famille, ni barre, ni teinte, ni lavis', () => dans(() => {
  for (const id of ['sensor.frigo_temperature', 'sensor.unraid_temperature']) {
    const m = carte(id);
    assert.equal(de(m, 'BarreMesure'), undefined, id + ' : ni barre');
    assert.deepEqual([plaque(m).background, plaque(m).color, m.arbre.props.style.background], ['var(--o-s1)', 'var(--o-text1)', SURFACE], id + ' : ni teinte, ni lavis');
    assert.equal(classe(m, 'o-mesure-phrase').props.children, '', id + ' : ni phrase de zone');
  }
  const f = carte('sensor.frigo_temperature');
  const c = de(f, 'ChiffreMesure').props;
  assert.deepEqual([c.chiffre, c.unite, c.famille], ['4,2', '°C', 'Température'], '« Capteur Frigo · 4,2 °C · TEMPÉRATURE »');
  assert.equal(de(f, 'Surface').props.label, 'Capteur Frigo, Température 4,2 °C');
  // Témoin : une température dans une pièce de Loggia garde sa barre.
  assert.ok(de(carte('sensor.sejour_temperature'), 'BarreMesure'));
}));

test('la carte s’abonne à SA mesure et à l’hygromètre de son appareil : un relevé changé ailleurs se voit au tic suivant', () => dans(({ h, d }) => {
  const w = poser();
  d.suivre(() => w.hass());
  const m = carte('sensor.sejour_temperature', w);
  assert.deepEqual(h.intervalles().map(x => x.ms), [2000], 'un seul sondage, celui de la carte');
  w.courants['sensor.sejour_humidite'] = { ...w.courants['sensor.sejour_humidite'], state: '55', last_updated: '2026-10-15T20:41:00+02:00' };
  h.avancer(2000);
  m.effets();
  assert.equal(classe(m, 'o-mesure-phrase').props.children, 'Idéal · 55' + NBSP + '% d’humidité');
}));

test('C6 : la fabrique des cartes envoie une mesure de la table à sa carte ; une mesure sans table garde la carte d’avant', () => dans(() => {
  const w = poser();
  let dc = null;
  monter(() => { dc = F.useDomainCards(w.hass()); return null; });
  assert.deepEqual(['sensor.chambre_co2', 'sensor.sejour_temperature', 'sensor.sejour_lux', 'sensor.morte'].map(id => dc.card(id).type.name),
    ['RoomMesureCard', 'RoomMesureCard', 'RoomMesureCard', 'RoomMesureCard']);
  assert.equal(dc.card('sensor.pression').type.name, 'RoomGenericCard', 'la pression n’a pas de zone (hors chantier)');
}));

test('C11 : la ligne « Libellé · VERDICT » et la jauge d’avant sont parties', () => {
  const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(!APP.includes('ligneVerdict') && !APP.includes('\nfunction JaugeMesure(') && !APP.includes('TEINTE_PALIER'));
});

/* TEST AJOUTÉ (correction bis, point 6) : aucun mot coupé au milieu sur la carte LARGE. Mesuré à 1 280 px : « Schlafzim… » en allemand, « przewietrz » en
 * polonais, « Idéal · 47 % d'humid… » en français. La colonne du nom ne descend jamais sous son mot le plus long ; la phrase vit dans son cadre (un
 * conteneur), rétrécit de 12 à 10,5 px d'après sa largeur estimée, puis cède sa place à sa forme de repli, écrite une seconde fois et tue au lecteur
 * d'écran ; la carte étroite garde sa phrase de la grille commune. */
test('correction bis, point 6 : la carte large ne coupe aucun mot — la colonne du nom tient son mot le plus long, la phrase a sa forme de repli', () => dans(() => {
  const t = carte('sensor.sejour_temperature');
  assert.deepEqual(classe(t, 'o-mesure-gauche').props.style, { flex: '1 1 0%', minWidth: 0 });
  const cadre = classe(t, 'o-mesure-phrases');
  assert.ok(cadre.props.className.split(' ').includes('o-seul-large'), 'le cadre de la phrase large');
  const [longue, repli] = cadre.props.children.filter(Boolean).map(e => e.props);
  assert.deepEqual([longue.children, longue['data-longue']], ['Idéal · 52' + NBSP + '% d’humidité', ''], 'la phrase entière, qui s’efface si elle ne tient pas');
  assert.deepEqual([repli.children, repli['data-repli'], repli['aria-hidden']], ['Idéal · 52' + NBSP + '%', '', 'true'], 'sa forme de repli : l’humidité sans son mot, tue au lecteur d’écran');
  assert.ok(longue.style['--o-larg'] > repli.style['--o-larg-repli'] && Math.abs(longue.style['--o-larg'] - 10.51 * 1.03) < 0.3, 'les largeurs estimées, en em (« Idéal · 47 % d’humidité » : 10,51 em mesurés)');
  // Le CO₂ : son repli tait « aérez » ; une phrase sans forme plus courte n'en a pas, et ne s'efface jamais.
  const co2 = classe(carte('sensor.chambre_co2'), 'o-mesure-phrases').props.children.filter(Boolean).map(e => e.props.children);
  assert.deepEqual(co2, ['Confiné · aérez', 'Confiné']);
  const lux = classe(carte('sensor.sejour_lux'), 'o-mesure-phrases').props.children.filter(Boolean);
  assert.deepEqual([lux.length, lux[0].props['data-longue']], [1, undefined], 'sans repli, la phrase reste, quitte à finir en « … »');
  // La carte étroite : la phrase de la grille commune, sa forme courte.
  const etroite = classe(t, 'o-mesure-phrase-courte');
  assert.ok(etroite.props.className.split(' ').includes('o-seul-etroit') && etroite.props.children === 'Idéal');
  // La feuille : la colonne tient son mot le plus long sur une carte large ; la ligne du chiffre et le cadre de la phrase sont des conteneurs.
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  // ASSERTION MODIFIÉE (correction bis 2, point 4) : le `min-content` d'un élément flexible (`auto`), borné par ce que le plancher du chiffre lui laisse.
  assert.ok(css.includes('@container (width >= 188px) { .o-mesure-gauche { min-width: auto !important; max-width: calc(100% - var(--o-plancher, 0px)); } }'));
  assert.ok(css.includes('.o-mesure-ligne > span { font-size: clamp(14px, calc(100cqi / var(--o-em, 4)), 25px); }'));
  assert.ok(css.includes('.o-mesure-phrases > [data-longue] { max-width: max(0px, calc((100cqi - 10.5px * var(--o-larg)) * 100000)); }'));
  assert.ok(css.includes('.o-mesure-phrases > [data-repli] { display: block; max-width: max(0px, calc((10.5px * var(--o-larg) - 100cqi) * 100000));'));
}));

/* TEST AJOUTÉ (correction bis, point 7) : la Bibliothèque des cartes passe une maison FICTIVE. Le relevé vivant passait devant elle, et ne connaît pas
 * ses entités : ses aperçus disaient « Indisponible ». Le relevé vivant ne sert que s'il connaît l'entité. */
test('correction bis, point 7 : une maison fictive que le relevé vivant ne connaît pas garde ses chiffres', () => dans(({ d }) => {
  d.suivre(() => ({ states: {} }));
  const biblio = { states: { 'sensor.biblio_co2': capteur('sensor.biblio_co2', 640, { friendly_name: 'CO₂ séjour', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }) } };
  const m = monter(F.RoomMesureCard, { id: 'sensor.biblio_co2', hass: biblio, onOpen: () => {} });
  // ASSERTIONS MODIFIÉES (correction bis 2, point 1) : « CO₂ séjour » dit sa famille — la surface ne la redit pas.
  assert.equal(de(m, 'Surface').props.label, 'CO₂ séjour, 640 ppm, Excellent', 'et non « Indisponible »');
  // Témoin : une entité que le relevé vivant connaît se lit chez lui.
  d.suivre(() => ({ states: { 'sensor.biblio_co2': capteur('sensor.biblio_co2', 1700, { friendly_name: 'CO₂ séjour', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }) } }));
  const vive = monter(F.RoomMesureCard, { id: 'sensor.biblio_co2', hass: biblio, onOpen: () => {} });
  assert.equal(de(vive, 'Surface').props.label, 'CO₂ séjour, 1 700 ppm, Confiné · aérez', 'le relevé vivant d’abord');
  const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const i = APP.indexOf('\nfunction useVueLumiere(');
  assert.ok(APP.slice(i, APP.indexOf('\n}\n', i)).includes('const H = hassQuiConnait(vivant, hass, id);'), 'les aperçus d’une lumière aussi');
}));

/* TEST AJOUTÉ (correction bis, point 9) : le bruit, le vent et les COV portaient le glyphe générique. Une mesure prend celui de sa famille (confort.js) ;
 * une icône choisie par l'utilisateur l'emporte. */
test('correction bis, point 9 : le glyphe de la famille ; une icône choisie l’emporte', () => dans(() => {
  const S = {
    'sensor.bruit': capteur('sensor.bruit', 34, { device_class: 'sound_pressure', unit_of_measurement: 'dB' }),
    'sensor.vent': capteur('sensor.vent', 12, { device_class: 'wind_speed', unit_of_measurement: 'km/h' }),
    'sensor.cov': capteur('sensor.cov', 120, { device_class: 'volatile_organic_compounds' }),
    'sensor.co2': capteur('sensor.co2', 600, { device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }),
  };
  const glyphe = (id) => monter(F.RoomMesureCard, { id, hass: { states: S }, onOpen: () => {} }).trouver(e => e.type && e.type.name === 'Ico')[0].props.name;
  assert.deepEqual(['sensor.bruit', 'sensor.vent', 'sensor.cov', 'sensor.co2'].map(glyphe), ['volume', 'wind', 'smog', 'wind']);
  setLoggiaState({ index: INDEX, ent: {}, cfg: { loggia_rooms: PIECES, loggia_icones: { 'sensor.bruit': 'bell' } }, resolved: null });
  assert.equal(glyphe('sensor.bruit'), 'bell', 'le choix de l’utilisateur');
}));

/* TEST AJOUTÉ (correction bis, points 10 et 11) : un état qui n'est pas un nombre (« erreur ») ne laissait que le nom ; il devient la phrase, que la
 * surface lit. Un vent dans une unité que la table ne connaît pas (le Beaufort) se lisait en km/h : « 9 », calme, quand c'est une tempête — il est neutre. */
test('correction bis, points 10 et 11 : l’état brut devient la phrase ; une unité inconnue rend la mesure neutre', () => dans(() => {
  const S = {
    'sensor.co2_erreur': capteur('sensor.co2_erreur', 'erreur', { friendly_name: 'CO₂ cave', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }),
    'sensor.vent_bft': capteur('sensor.vent_bft', 9, { friendly_name: 'Vent', device_class: 'wind_speed', unit_of_measurement: 'Bft' }),
  };
  const e = monter(F.RoomMesureCard, { id: 'sensor.co2_erreur', hass: { states: S }, onOpen: () => {} });
  // ASSERTION MODIFIÉE (audit du 19/10, point 13) : un état qui n'est pas un nombre se dit « Valeur illisible » — la fiche garde l'état tel quel.
  assert.equal(classe(e, 'o-mesure-phrase').props.children, 'Valeur illisible');
  assert.equal(de(e, 'Surface').props.label, 'CO₂ cave, Valeur illisible', 'le lecteur d’écran la lit');
  assert.equal(de(e, 'ChiffreMesure'), undefined);
  const v = monter(F.RoomMesureCard, { id: 'sensor.vent_bft', hass: { states: S }, onOpen: () => {} });
  assert.equal(de(v, 'BarreMesure'), undefined, 'ni zone, ni barre');
  assert.deepEqual([de(v, 'ChiffreMesure').props.chiffre, de(v, 'ChiffreMesure').props.unite], ['9', 'Bft'], 'le chiffre, dans son unité');
  assert.deepEqual([plaque(v).background, v.arbre.props.style.background], ['var(--o-s1)', SURFACE], 'ni teinte, ni lavis');
}));

/* TEST AJOUTÉ (correction bis 2, point 1) : « Chambre CO2 », « Chambre Lino CO2 » (Objets) et « Bureau CO2 » (Pièces) écrivaient « CO₂ » sous un nom qui
 * le disait déjà, et le lecteur d'écran le lisait deux fois. La famille se tait quand le NOM AFFICHÉ la contient — sans casse ni accents, « CO2 » valant
 * « CO₂ » —, pour toutes les familles : sur la carte large, la carte étroite et la surface ; la fiche aussi (tests/fiche_mesure.test.mjs). */
test('correction bis 2, point 1 : la famille se tait quand le nom affiché la dit déjà — carte large, carte étroite, surface', () => dans(() => {
  // La règle : sans casse ni accents, les indices ramenés à leurs chiffres, la ponctuation en espace ; un nom composé la porte dans son mot.
  assert.deepEqual([['Chambre CO2', 'CO₂'], ['co₂ du bureau', 'CO₂'], ['Salle de bain température', 'Température'], ['SALLE DE BAIN TEMPERATURE', 'Température'],
    ['Salon PM2.5', 'PM2,5'], ['Schlafzimmertemperatur', 'Temperatur'], ['Łazienka wilgotność', 'Wilgotność']].map(([n, f]) => nomDitFamille(n, f)), [true, true, true, true, true, true, true]);
  assert.deepEqual([['Chambre', 'CO₂'], ['Séjour COV', 'Indice COV'], ['Séjour', 'Température'], [null, 'CO₂'], ['Pression', '']].map(([n, f]) => nomDitFamille(n, f)),
    [false, false, false, false, false], 'un nom qui ne la contient pas, une mesure sans famille');
  const S = {
    'sensor.co2': capteur('sensor.co2', 1659, { friendly_name: 'Chambre CO2', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }),
    'sensor.sdb': capteur('sensor.sdb', 68, { friendly_name: 'Salle de bain humidité', device_class: 'humidity', unit_of_measurement: '%' }),
  };
  const carteDe = (id, label = null) => monter(F.RoomMesureCard, { id, hass: { states: S }, onOpen: () => {}, label });
  for (const [id, surface] of [['sensor.co2', 'Chambre CO2, 1 659 ppm, Confiné · aérez'], ['sensor.sdb', 'Salle de bain humidité, 68 %, Humide · aérez']]) {
    const m = carteDe(id);
    assert.equal(de(m, 'ChiffreMesure').props.famille, '', id + ' : rien sous le chiffre de la carte large');
    assert.equal(classe(m, 'o-gab-etiquette'), undefined, id + ' : rien sous le chiffre de la carte étroite');
    assert.equal(de(m, 'Surface').props.label, surface, id + ' : la surface ne la redit pas');
  }
  // Un nom qui ne la dit pas — celui de sa pièce, ou posé à la main : elle revient, partout.
  const piece = carteDe('sensor.sdb', 'Salle de bain');
  assert.deepEqual([de(piece, 'ChiffreMesure').props.famille, classe(piece, 'o-gab-etiquette').props.children, de(piece, 'Surface').props.label],
    ['Humidité', 'Humidité', 'Salle de bain, Humidité 68 %, Humide · aérez']);
}));

/* TEST AJOUTÉ (correction bis 2, point 4) : à 1 280 px, « Schlafzimmerluftqualität CO2 » menait la colonne du chiffre à 0, et « 1.659 ppm » sortait de la
 * carte. La colonne a un plancher — le chiffre en 14 px, sa plus petite taille — ; au-delà, c'est le nom qui cède : sa colonne ne prend jamais plus que ce
 * que le plancher et l'écart de 10 px lui laissent (`--o-plancher`), et son mot finit en « … ». La famille, plus large que la colonne, prend 8 px de l'écart
 * au plus, puis finit en « … » : elle passait sur la phrase. Vu dans la démo, à 1 440 et 1 280 px, le nom renommé par l'éditeur. */
test('correction bis 2, point 4 : la colonne du chiffre a un plancher de 14 px ; au-delà, le nom cède', () => dans(() => {
  const w = poser();
  const m = monter(F.RoomMesureCard, { id: 'sensor.chambre_co2', hass: w.hass(), onOpen: () => {}, label: 'Schlafzimmerluftqualität CO2' });
  const colonne = monter(F.ChiffreMesure, de(m, 'ChiffreMesure').props);
  const em = classe(colonne, 'o-mesure-ligne').props.style['--o-em'];
  const plancher = colonne.arbre.props.style.minWidth;
  assert.equal(plancher, Math.ceil(em * 14), '« 1 659 ppm » en 14 px');
  // La rangée dit au nom ce que le chiffre lui prend : son plancher et l'écart.
  const rangees = m.trouver(e => e.props && e.props.style && e.props.style['--o-plancher']);
  assert.deepEqual(rangees.map(e => [e.props.style.gap, e.props.style['--o-plancher']]), [[10, (plancher + 10) + 'px']]);
  assert.ok(188 - plancher - 10 >= 100, 'sur la carte large la plus étroite, le nom garde ' + (188 - plancher - 10) + ' px');
  // Muette, sans chiffre : rien à réserver.
  assert.equal(carte('sensor.morte', w).trouver(e => e.props && e.props.style && e.props.style['--o-plancher']).length, 0);
  // La famille ne prend que 8 px de l'écart ; au-delà, « … ».
  const famille = classe(monter(F.ChiffreMesure, { chiffre: '68', unite: '%', famille: 'Luftfeuchte' }), 'o-mesure-famille').props.style;
  assert.deepEqual([famille.maxWidth, famille.overflow, famille.textOverflow], ['calc(100% + 8px)', 'hidden', 'ellipsis']);
  // La feuille : la colonne du nom, bornée par le plancher ; la ligne du chiffre ne descend pas sous 14 px.
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.ok(css.includes('.o-mesure-gauche { min-width: auto !important; max-width: calc(100% - var(--o-plancher, 0px)); }'));
  assert.ok(css.includes('.o-mesure-ligne > span { font-size: clamp(14px, calc(100cqi / var(--o-em, 4)), 25px); }'));
}));
