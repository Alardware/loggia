/* Une date se lit comme une date PARTOUT (lot 16, suite « dates partout »,
 * 05/10).
 *
 * La suite « horodatages » a donné à la tuile (`CvCard`) et à la pastille
 * (`chipTexte`) une seule règle, `texteDate` : un horodatage passe par
 * `relTime` (passé relatif, futur en heure absolue), une date seule par Intl
 * à minuit LOCAL, une heure seule telle quelle. Elle nommait ce qui restait,
 * mesuré dans la démo : le même `parseFloat` qui lit l'année ou l'heure.
 *
 * 1. La carte STANDARD d'un capteur (`RoomGenericCard`, `o-rmcard`) :
 *    « 2 026 | Passage facteur | Mesure ».
 * 2. Le « Grand chiffre » (`CvBigSensor`) : « 2 026 » en 54 px.
 * 3. La FICHE (`LigneEntite`) : seul l'ISO avec T passait par `relTime` — une
 *    date seule y devenait « 2 026 », une heure « 07:30 » un « 7 ».
 * Et, trouvé par le même grep : le « Graphique 24 h » (`CvHistory`), proposé
 * pour tout capteur — « 2 026 » en grand, et une courbe d'années.
 *
 * Toutes ces cartes s'ouvraient sur la fiche 24 h (`SensorSheet`) : l'année
 * en 44 px au-dessus d'une courbe d'années. Un capteur daté n'a pas de courbe
 * à montrer : `ouvrir` l'envoie à son APPAREIL (`FicheAppareil`) — comme une
 * lampe sans réglage —, qui le met en tête, en tuile qui dit sa date, au lieu
 * de le laisser dans une section repliée.
 *
 * Un état « AAAA-MM-JJ HH:MM:SS » (l'espace au lieu du T : `input_datetime`,
 * capteur gabarit) est une date ISO comme l'autre.
 *
 * Une vraie mesure ne change pas : les témoins rendent un capteur de
 * température dans chaque carte, et l'ouvrent sur sa courbe.
 *
 * On REND les cartes (React côté serveur, ADR 0069) : un crochet de
 * chargement ajoute à App.jsx, pour CE test seul, l'export des composants
 * sous `?l16dp` — le fichier n'est pas touché. La langue est fixée avant le
 * premier import (règle de la CI), le fuseau aussi, et `Date.now` est figé le
 * temps d'un rendu. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

process.env.TZ = 'Europe/Paris';
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

const EXPOSE = 'data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?l16dp')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -6), ctx);",
  "  return { ...r, source: String(r.source) + ';export { RoomGenericCard as __RoomGenericCard, CvBigSensor as __CvBigSensor, LigneEntite as __LigneEntite, CvHistory as __CvHistory, useDomainCards as __useDomainCards, SensorSheet as __SensorSheet, FicheAppareil as __FicheAppareil };' };",
  '}',
].join('\n'));
register('./jsx-hooks.mjs', import.meta.url);
register(EXPOSE);
const App = await import(new URL('../src/App.jsx?l16dp', import.meta.url).href);
const { relTime } = await import('../src/format.js');
const COMPOSANTS = {
  standard: App.__RoomGenericCard,
  chiffre: App.__CvBigSensor,
  fiche: App.__LigneEntite,
  graphique: App.__CvHistory,
};

/* Lundi 5 octobre 2026, 14 h à Paris. */
const MAINTENANT = Date.UTC(2026, 9, 5, 12, 0, 0);
function aFige(fn) {
  const avant = Date.now;
  Date.now = () => MAINTENANT;
  try { return fn(); } finally { Date.now = avant; }
}
const iso = (s) => new Date(MAINTENANT + s * 1000).toISOString();
const PASSE = iso(-2 * 3600), FUTUR = iso(3 * 3600), LOIN = iso(120 * 86400);

const etat = (id, state, attributes = {}) => ({ entity_id: id, state, last_changed: PASSE, attributes: { friendly_name: 'Essai', ...attributes } });
/* Le HTML rendu, sans les `<!-- -->` que React glisse entre deux textes. */
const rendre = (genre, st) => aFige(() => renderToStaticMarkup(createElement(COMPOSANTS[genre], {
  id: st.entity_id, hass: { states: { [st.entity_id]: st }, callService: () => {} }, onOpen: () => {}, onClose: () => {},
}))).replace(/<!-- -->/g, '');
/* Le texte affiché, sans balises : `>Il y a 2 h<`, pas une valeur d'attribut. */
const montre = (html, mot) => html.includes('>' + mot + '<');
/* Ce que `parseFloat` en faisait : l'année (« 2 026 », espace fine ou non),
 * l'heure (« 7 », « 7,00 »). */
const ANNEE = />2[\s  ]?02[67]</;
const HEURE_LUE = />7(,\d+)?</;
/* Une date seule, dite par Intl — comparée à Intl et non à une chaîne CLDR. */
const jour = (a, m, j, annee) => new Date(a, m - 1, j).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(annee ? { year: 'numeric' } : {}) });

const CAS = () => [
  ['horodatage passé', etat('sensor.facteur', PASSE, { device_class: 'timestamp' }), 'Il y a 2 h'],
  ['horodatage futur', etat('sensor.reveil', FUTUR, { device_class: 'timestamp' }), aFige(() => relTime(FUTUR))],
  ['horodatage lointain', etat('sensor.certificat', LOIN, { device_class: 'timestamp' }), aFige(() => relTime(LOIN))],
  ['état ISO sans device_class', etat('sensor.maj', PASSE), 'Il y a 2 h'],
  // 12 h à Paris, deux heures avant MAINTENANT : l'espace vaut le T, et
  // l'heure sans fuseau est locale.
  ['état ISO à espace', etat('sensor.gabarit', '2026-10-05 12:00:00'), 'Il y a 2 h'],
  ['date seule', etat('sensor.vidange', '2026-10-12', { device_class: 'date' }), jour(2026, 10, 12)],
  ['date d’une autre année', etat('sensor.passeport', '2027-01-15', { device_class: 'date' }), jour(2027, 1, 15, true)],
  ['heure seule', etat('sensor.lever', '07:30'), '07:30'],
];

/* Ce que `ouvrir` (useDomainCards) monte pour une entité : les composants des
 * feuilles ouvertes. Le banc appelle `ouvrir` pendant son premier rendu — une
 * mise à jour de son propre état, que React rejoue aussitôt. */
function feuillesOuvertes(st) {
  let sheets = null;
  function Banc() {
    const dc = App.__useDomainCards({ states: { [st.entity_id]: st }, callService: () => {} });
    const [fait, setFait] = useState(false);
    if (!fait) { setFait(true); dc.ouvrir(st.entity_id); }
    sheets = dc.sheets;
    return null;
  }
  aFige(() => renderToStaticMarkup(createElement(Banc)));
  const types = [];
  const voir = (n) => {
    if (Array.isArray(n)) n.forEach(voir);
    else if (n && typeof n === 'object' && n.type) { if (typeof n.type === 'function') types.push(n.type); else voir(n.props && n.props.children); }
  };
  voir(sheets);
  return types;
}

test('témoin : les dates attendues sont celles de `relTime` et d’Intl', () => {
  assert.equal(aFige(() => relTime(PASSE)), 'Il y a 2 h');
  assert.match(aFige(() => relTime(FUTUR)), /^17:00$/);
  assert.match(aFige(() => relTime(LOIN)), /2027/, 'un futur d’une autre année dit son année');
});

for (const genre of Object.keys(COMPOSANTS)) {
  test(genre + ' : un capteur daté dit sa date, jamais l’année ni l’heure lues par parseFloat', () => {
    for (const [nom, st, attendu] of CAS()) {
      const html = rendre(genre, st);
      assert.ok(!ANNEE.test(html), genre + ', ' + nom + ' : « 2 026 », l’année lue par parseFloat');
      assert.ok(!HEURE_LUE.test(html), genre + ', ' + nom + ' : « 7 », l’heure lue par parseFloat');
      assert.ok(montre(html, attendu), genre + ', ' + nom + ' : doit dire « ' + attendu + ' »');
    }
  });
}

test('carte standard : une date n’est pas une mesure — ni coin chiffré ni « Mesure »', () => {
  for (const [nom, st, attendu] of CAS()) {
    const html = rendre('standard', st);
    assert.ok(!montre(html, 'Mesure'), nom + ' : « Mesure » sous une date');
    // La surface nomme la carte de ce qu'elle affiche : le nom, puis la date.
    assert.ok(html.includes('aria-label="Essai, ' + attendu + '"'), nom + ' : la surface dit « Essai, ' + attendu + ' »');
  }
});

test('graphique : pas de courbe d’années ni d’historique à charger sous une date', () => {
  for (const [nom, st, attendu] of CAS()) {
    const html = rendre('graphique', st);
    assert.ok(!html.includes('Chargement'), nom + ' : pas d’historique à charger');
    assert.ok(html.includes('aria-label="Essai, ' + attendu + '"'), nom + ' : le graphique se nomme de sa date');
  }
  // Une courbe fournie (la bibliothèque passe `demoPoints`) ne se trace pas
  // non plus : ce serait l'année, plate, sur 24 h.
  const pts = [{ t: MAINTENANT - 3600e3, v: 2026 }, { t: MAINTENANT, v: 2026 }];
  const st = CAS()[0][1];
  const html = aFige(() => renderToStaticMarkup(createElement(App.__CvHistory, { id: st.entity_id, hass: { states: { [st.entity_id]: st } }, demoPoints: pts })));
  assert.ok(!/<path/.test(html) && !/max/.test(html), 'pas de tracé ni de min/max');
});

test('un capteur daté ouvre son APPAREIL, pas la fiche 24 h à courbe', () => {
  for (const [nom, st] of CAS()) {
    const t = feuillesOuvertes(st);
    assert.ok(!t.includes(App.__SensorSheet), nom + ' : la fiche 24 h écrirait l’année au-dessus d’une courbe d’années');
    assert.ok(t.includes(App.__FicheAppareil), nom + ' : la fiche de son appareil');
  }
});

test('la fiche de l’appareil montre le capteur tapé en tête, avec sa date — pas replié', () => {
  for (const [nom, st, attendu] of CAS()) {
    const html = aFige(() => renderToStaticMarkup(createElement(App.__FicheAppareil, { id: st.entity_id, hass: { states: { [st.entity_id]: st }, callService: () => {} }, onClose: () => {} }))).replace(/<!-- -->/g, '');
    assert.ok(montre(html, attendu), nom + ' : la fiche dit « ' + attendu + ' »');
    assert.ok(!ANNEE.test(html) && !HEURE_LUE.test(html), nom + ' : ni l’année ni l’heure lues par parseFloat');
  }
});

test('la date seule tombe le 12 à New York aussi (minuit local)', () => {
  process.env.TZ = 'America/New_York';
  try {
    for (const genre of Object.keys(COMPOSANTS)) {
      assert.ok(montre(rendre(genre, etat('sensor.vidange', '2026-10-12', { device_class: 'date' })), jour(2026, 10, 12)), genre + ' : le 12, pas le 11');
    }
  } finally { process.env.TZ = 'Europe/Paris'; }
});

test('témoin : une vraie mesure reste une mesure, partout', () => {
  const t = etat('sensor.salon_t', '21.46', { unit_of_measurement: '°C', device_class: 'temperature' });
  assert.ok(montre(rendre('standard', t), '21,5'), 'standard');
  assert.ok(montre(rendre('chiffre', t), '21,5'), 'grand chiffre');
  assert.ok(rendre('fiche', t).includes('>21,46 °C<'), 'fiche');
  const g = rendre('graphique', t);
  assert.ok(montre(g, '21,5') && g.includes('Chargement'), 'graphique : la valeur et son historique');
  const f = feuillesOuvertes(t);
  assert.ok(f.includes(App.__SensorSheet) && !f.includes(App.__FicheAppareil), 'une mesure s’ouvre sur sa courbe');
  // Un texte qui n'est pas une date reste écrit tel quel (le graphique, lui,
  // dit « — » d'un texte, avant comme après), et s'ouvre comme avant.
  const txt = etat('sensor.cycle', 'Rinçage');
  for (const genre of ['standard', 'chiffre', 'fiche']) {
    assert.ok(rendre(genre, txt).includes('Rinçage'), genre + ' : un texte reste un texte');
  }
  assert.ok(feuillesOuvertes(txt).includes(App.__SensorSheet), 'un texte s’ouvre comme avant');
  // Un nombre qui ressemble à une année reste un nombre, et une mesure en
  // heures (« 7.5 ») aussi.
  const n = etat('sensor.compteur', '2026', { unit_of_measurement: 'L' });
  assert.ok(/>2[\s  ]?026 L</.test(rendre('fiche', n)), 'fiche : 2026 L reste un nombre');
  assert.ok(/>2[\s  ]?026</.test(rendre('chiffre', n)), 'grand chiffre : 2026 reste un nombre');
  const h = etat('sensor.duree', '7.5', { unit_of_measurement: 'h' });
  assert.ok(rendre('fiche', h).includes('>7,5 h<'), 'fiche : 7,5 h reste une durée');
});
