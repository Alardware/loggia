/* TEST AJOUTÉ (étape 3 IoT, 25/10 ; sa maquette « Cartes IoT », 1a ; I5, I8, I11, I12, I31, I33, § 6) — la carte d'une vanne, large,
 * étroite et compacte (`src/cartevanne.jsx`, chargée à la demande).
 *
 * Ces tests JOUENT la carte (tests/crochets.mjs) : on la monte sur un `hass`, on lit ce qu'elle dessine, on appuie. Lundi
 * 19/10/2026, 18:20. Ce qui est garanti :
 *  - le gabarit des cartes IoT, recopié d'App.jsx pour la place du démarrage, reste celui d'App.jsx (un test de source) ;
 *  - I5 : la grille commune (`o-gabarit`), le nom, la phrase (`phraseVanne`, § 6), UNE puce au pied — pas de chiffre ;
 *  - I8 : la plaque cyan ouverte, rouge et un lavis sur fuite ;
 *  - I11 : « Fermer l'eau » d'un appui, `valve.close_valve` ; « Rouvrir l'eau » après une fuite DEMANDE sur la carte large — « La
 *    fuite est réparée ? » · « Annuler » · « Rouvrir » —, la question se referme seule au bout de 10 s ; la carte étroite ouvre la
 *    popup sur la question ; un détecteur encore mouillé fait demander « Rouvrir quand même ? » ;
 *  - I33 : deux appuis, une commande ; la puce reste sur son geste, choisie, sans rien faire ; « Fermeture… » ;
 *  - I12 : la compacte n'a AUCUNE commande — un appui de travers couperait l'eau de la maison ;
 *  - I31 : une vanne simple (« Fermer » / « Ouvrir ») ; le gaz demande « Ouvrir le gaz ? » ; une prise désignée est la vanne d'eau,
 *    par `switch.turn_off` ;
 *  - rien d'inerte : un appareil muet n'a pas de puce, et son liseré respire. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { monter, horlogeFausse, documentFaux, texteDe } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const { setLoggiaState } = await import('../src/state.js');
const C = await import('../src/cartevanne.jsx');
const EE = await import('../src/eauetat.js');
const { reglerPartage } = await import('../src/optimiste.js');

const T = new Date(2026, 9, 19, 18, 20).getTime();
const a = (h, m) => new Date(2026, 9, 19, h, m).getTime();
const iso = (t) => new Date(t).toISOString();
const st = (id, state, attributes = {}, depuis = a(14, 2)) => ({ entity_id: id, state, last_changed: iso(depuis), last_updated: iso(depuis), attributes });
const VANNE = 'valve.arrivee_eau', EVIER = 'binary_sensor.fuite_sous_evier';

const ETAT = (cause = null) => ({ maintenant: T / 1000, vannes: { [VANNE]: { ferme: !!cause, cause, detecteur: cause === 'fuite' ? EVIER : null, nom: cause === 'fuite' ? 'Sous l’évier' : null, user_id: null, depuis: cause ? a(14, 2) / 1000 : null } },
  detecteurs: {}, journal: [], regle: { actif: true, reagit: true, entite: '', toutes: true, vannes: [VANNE] } });

function poser({ etats = {}, alertes = null, etat = ETAT() } = {}) {
  const courants = {
    [VANNE]: st(VANNE, 'open', { device_class: 'water', friendly_name: 'Arrivée d’eau' }),
    [EVIER]: st(EVIER, 'off', { device_class: 'moisture', friendly_name: 'Sous l’évier' }),
    ...etats,
  };
  setLoggiaState({ index: { entityMeta: new Map(), deviceMeta: new Map(), areaList: [], areaNameOf: () => null }, ent: {}, cfg: alertes ? { loggia_alertes: alertes } : {}, resolved: {} });
  EE.reglerEauEtat({ hass: { callWS: () => Promise.resolve(etat) } });
  EE.poserEtatEau(etat);
  const appels = [];
  const hass = { states: courants, callService: (d, s, data) => { appels.push(d + '.' + s + ' ' + data.entity_id); return Promise.resolve(); } };
  return { appels, courants, hass };
}
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  const vraiNow = Date.now;
  h.installer(); d.installer();
  Date.now = () => T;
  reglerPartage();
  try { return await fn({ h, d }); } finally { reglerPartage(); Date.now = vraiNow; h.restaurer(); d.restaurer(); setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const classe = (m, c) => m.trouver(e => e.props && typeof e.props.className === 'string' && e.props.className.split(' ').indexOf(c) >= 0);
const phrase = (m) => texteDe(classe(m, 'o-gab-phrase')[0]);
const puces = (m) => m.trouver(e => e.type === 'button' && e.props.className && e.props.className.indexOf('o-rmbtn') >= 0);
const plaque = (m) => m.trouver(e => e.props && e.props.style && e.props.style.width === 38)[0];
const carte = (w, props = {}) => monter(C.default, { id: VANNE, hass: w.hass, nom: null, chip: false, onOpen: () => {}, ...props });

test('le gabarit des cartes IoT, recopié d’App.jsx, reste le sien', () => {
  const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  // Les définitions d'App.jsx que la carte recopie : si l'une change, la copie de cartevanne.jsx (`GABARIT`) change avec elle.
  for (const ligne of [
    "const RM_CARD = { ...CARTE_MAISON, transition: 'all .3s' };",
    'const RM_ICO = (bg, col) => ({ ...ICONE_CARTE, background: bg, color: col });',
    "const RM_BTN = { position: 'relative', flex: 1, padding: '9px 6px', borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 12, cursor: 'pointer' };",
    "const RM_MILIEU = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'end', marginTop: 'var(--o-milieu-haut, 14px)' };",
    "const RM_PUCE_ROBOT = { ...RM_BTN, height: 44, padding: '0 8px', borderRadius: 10, border: 'none', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12.5 };",
    "const RM_PUCE_CHOISIE = { background: 'var(--o-accent-fond)', color: '#fff' };",
    "const SURF_CARTE = 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))';",
    '  return `linear-gradient(180deg,${f(lav(base))},${f(lav(bas))} 72%), ${SURF_CARTE}`;',
  ]) assert.ok(APP.includes(ligne), 'App.jsx a changé : ' + ligne);
  const RM_BTN = { position: 'relative', flex: 1, padding: '9px 6px', borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 12, cursor: 'pointer' };
  assert.deepEqual(C.GABARIT.puce, { ...RM_BTN, height: 44, padding: '0 8px', borderRadius: 10, border: 'none', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12.5 });
  assert.deepEqual(C.GABARIT.ico('A', 'B').width, 38);
  assert.equal(C.GABARIT.lavis('var(--o-bad-rgb)', .14, .03), 'linear-gradient(180deg,rgba(var(--o-bad-rgb),0.14),rgba(var(--o-bad-rgb),0.03) 72%), linear-gradient(180deg,var(--o-surfA),var(--o-surfB))');
});

test('I5, I8, I11 : la carte large ouverte — la plaque cyan, « Ouverte · aucune fuite », « Fermer l’eau » d’un appui', () => dans(() => {
  const w = poser();
  const m = carte(w);
  assert.ok(m.arbre.props.className.split(' ').indexOf('o-gabarit') >= 0 && m.arbre.props.className.indexOf('o-panne') < 0);
  assert.deepEqual([plaque(m).props.style.background, plaque(m).props.style.color], ['rgba(var(--o-cyan-rgb),.16)', 'var(--o-cyan)']);
  assert.equal(phrase(m), 'Ouverte · aucune fuite');
  const [p] = puces(m);
  assert.equal(puces(m).length, 1);
  assert.equal(p.props['aria-label'], 'Fermer l’eau Arrivée d’eau');
  assert.equal(p.props.style.color, 'var(--o-bad)', 'l’encre rouge de la maquette');
  const surface = m.trouver(e => e.type && e.type.name === 'Surface')[0];
  assert.equal(surface.props.label, 'Arrivée d’eau, Ouverte · aucune fuite');
  m.appuyer(p);
  // I33 : deux appuis, une commande — la puce reste sur son geste, choisie.
  m.appuyer(puces(m)[0]);
  assert.deepEqual(w.appels, ['valve.close_valve valve.arrivee_eau']);
  assert.equal(phrase(m), 'Fermeture…');
  assert.equal(puces(m)[0].props['aria-disabled'], 'true');
  assert.equal(puces(m)[0].props.style.background, 'var(--o-accent-fond)');
}));

test('I11 : fermée sur fuite — le lavis rouge, la question sur la carte large, refermée seule au bout de 10 s', () => dans(({ h }) => {
  const w = poser({ etats: { [VANNE]: st(VANNE, 'closed', { device_class: 'water', friendly_name: 'Arrivée d’eau' }) }, etat: ETAT('fuite') });
  const m = carte(w);
  assert.equal(phrase(m), 'Fermée · fuite à 14:02');
  assert.equal(m.arbre.props.style.background, C.GABARIT.lavis('var(--o-bad-rgb)', .14, .03), 'le lavis rouge de la fuite');
  assert.deepEqual([plaque(m).props.style.background, plaque(m).props.style.color], ['rgba(var(--o-bad-rgb),.16)', 'var(--o-bad)']);
  // Deux écritures : la large demande sur place, l'étroite ouvre la popup.
  const large = classe(m, 'o-seul-large')[0], etroite = classe(m, 'o-seul-etroit')[0];
  assert.ok(large && etroite);
  const rouvrir = () => m.trouver(e => e.type === 'button' && /^Rouvrir l’eau/.test(e.props['aria-label'] || '') && e.props['data-ecrit'] === 'large')[0];
  m.appuyer(rouvrir());
  assert.equal(phrase(m), 'La fuite est réparée ?');
  assert.deepEqual(puces(m).map(b => texteDe(b)), ['Annuler', 'Rouvrir'], 'sur UNE ligne de 44 px');
  assert.deepEqual(w.appels, [], 'demander n’ouvre rien');
  m.appuyer(puces(m)[0]);
  assert.equal(phrase(m), 'Fermée · fuite à 14:02', '« Annuler » referme la question');
  m.appuyer(rouvrir());
  h.avancer(10000); m.rendre();
  assert.equal(phrase(m), 'Fermée · fuite à 14:02', 'une question laissée se referme au bout de 10 s');
  m.appuyer(rouvrir());
  m.appuyer(puces(m)[1]);
  assert.deepEqual(w.appels, ['valve.open_valve valve.arrivee_eau']);
}));

test('I11 : la carte étroite ne demande pas sur place — elle ouvre la popup sur la question', () => dans(() => {
  const w = poser({ etats: { [VANNE]: st(VANNE, 'closed', { device_class: 'water', friendly_name: 'Arrivée d’eau' }) }, etat: ETAT('fuite') });
  const ouverts = [];
  const m = carte(w, { onOpen: (id) => ouverts.push(id) });
  m.appuyer(m.trouver(e => e.type === 'button' && e.props['data-ecrit'] === 'etroit')[0]);
  assert.deepEqual([ouverts, w.appels], [[VANNE], []]);
  assert.equal(EE.prendreQuestion(VANNE), true, 'la popup trouvera la question');
}));

test('I11 : sans popup à ouvrir (la carte dans la fiche universelle), la question se pose sur place, à toute largeur', () => dans(() => {
  const w = poser({ etats: { [VANNE]: st(VANNE, 'closed', { device_class: 'water', friendly_name: 'Arrivée d’eau' }) }, etat: ETAT('fuite') });
  const m = carte(w, { onOpen: null });
  assert.equal(classe(m, 'o-seul-etroit').length, 0, 'aucune écriture inerte');
  m.appuyer(puces(m)[0]);
  assert.equal(phrase(m), 'La fuite est réparée ?');
  assert.equal(classe(m, 'o-seul-large').length, 0);
}));

test('I27 : un détecteur voit encore de l’eau — « Rouvrir quand même ? », même fermée à la main', () => dans(() => {
  const w = poser({ etats: { [VANNE]: st(VANNE, 'closed', { device_class: 'water', friendly_name: 'Arrivée d’eau' }), [EVIER]: st(EVIER, 'on', { device_class: 'moisture', friendly_name: 'Sous l’évier' }) }, etat: ETAT('personne') });
  /* ASSERTION MODIFIÉE (passe bis, point 4) : avec une popup à ouvrir, la carte large l'ouvre sur cette question (le test
   * « passe bis, point 4 ») ; sur place, seulement sans popup — la carte de l'appareil, dans sa fiche universelle. */
  const m = carte(w, { onOpen: null });
  m.appuyer(m.trouver(e => e.type === 'button' && e.props['data-ecrit'] === 'large')[0]);
  assert.equal(phrase(m), 'Sous l’évier voit encore de l’eau. Rouvrir quand même ?');
  assert.deepEqual(puces(m).map(b => texteDe(b)), ['Annuler', 'Rouvrir quand même']);
}));

/* TESTS AJOUTÉS (passe bis de l'étape 3, 25/10 ; relectures, points 1 à 4). */
test('passe bis, point 1 : la rangée de la question n’est pas une rangée de puces de robot — ses mots restent sous 200 px', () => dans(() => {
  const w = poser({ etats: { [VANNE]: st(VANNE, 'closed', { device_class: 'water', friendly_name: 'Arrivée d’eau' }) }, etat: ETAT('fuite') });
  const m = carte(w);
  m.appuyer(m.trouver(e => e.type === 'button' && e.props['data-ecrit'] === 'large')[0]);
  const rangee = m.trouver(e => e.props && Array.isArray(e.props.children) && e.props.children.some(c => c && c.props && /^Annuler /.test(c.props['aria-label'] || '')))[0];
  assert.ok(rangee, 'la rangée de « Annuler » · « Rouvrir »');
  assert.ok(rangee.props.className.split(' ').indexOf('o-puces-robot') < 0, 'la règle d’index.css cachait le mot des rangées de deux puces de robot sous 200 px : deux boutons vides');
  const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  for (const c of rangee.props.className.split(' ')) assert.ok(!new RegExp('\\.' + c + '[^{]*o-puce-robot-mot').test(CSS), 'aucune règle ne cache ses mots : ' + c);
}));

test('passe bis, point 2 : pendant `closing` (et `opening`), la puce est inerte — un appui ne rouvre rien', () => dans(() => {
  for (const [etat, mot] of [['closing', 'Fermer l’eau'], ['opening', 'Rouvrir l’eau']]) {
    const w = poser({ etats: { [VANNE]: st(VANNE, etat, { device_class: 'water', friendly_name: 'Arrivée d’eau' }) }, etat: ETAT(etat === 'closing' ? 'fuite' : null) });
    const m = carte(w);
    const p = puces(m);
    assert.equal(p.length, 1, etat + ' : une puce, une seule écriture');
    assert.deepEqual([p[0].props['aria-label'], p[0].props['aria-disabled'], p[0].props.style.background], [mot + ' Arrivée d’eau', 'true', 'var(--o-accent-fond)'], etat);
    m.appuyer(p[0]); m.appuyer(puces(m)[0]);
    assert.deepEqual(w.appels, [], etat + ' : rien ne part');
    assert.equal(phrase(m), etat === 'closing' ? 'Fermeture…' : 'Ouverture…', etat + ' : pas de question');
  }
}));

test('passe bis, point 3 : le carnet muet (Home Assistant pas redémarré), une vanne d’eau fermée DEMANDE avant de rouvrir', () => dans(() => {
  const w = poser({ etats: { [VANNE]: st(VANNE, 'closed', { device_class: 'water', friendly_name: 'Arrivée d’eau' }) }, etat: null });
  EE.reglerEauEtat({ hass: { callWS: () => Promise.reject({ code: 'unknown_command' }) } });
  const m = carte(w);
  m.appuyer(m.trouver(e => e.type === 'button' && e.props['data-ecrit'] === 'large')[0]);
  assert.equal(phrase(m), 'Rouvrir l’eau ?');
  assert.deepEqual([puces(m).map(b => texteDe(b)), w.appels], [['Annuler', 'Rouvrir'], []]);
  m.appuyer(puces(m)[1]);
  assert.deepEqual(w.appels, ['valve.open_valve valve.arrivee_eau'], 'la personne décide');
}));

test('passe bis, point 3 : quand la vanne change d’état, la carte relit le carnet aussitôt', () => dans(({ h }) => {
  const w = poser();
  let lus = 0;
  EE.reglerEauEtat({ hass: { callWS: () => { lus += 1; return Promise.resolve(ETAT('fuite')); } } });
  const m = carte(w);
  const avant = lus;
  w.courants[VANNE] = st(VANNE, 'closed', { device_class: 'water', friendly_name: 'Arrivée d’eau' }, a(18, 19));
  h.avancer(2000); m.rendre();
  assert.equal(lus, avant + 1, 'une relecture de `loggia/eau/etat` au changement');
}));

test('passe bis, point 4 : un détecteur encore mouillé — la carte LARGE ouvre la popup sur sa question, trop longue pour sa ligne', () => dans(() => {
  const w = poser({ etats: { [VANNE]: st(VANNE, 'closed', { device_class: 'water', friendly_name: 'Arrivée d’eau' }), [EVIER]: st(EVIER, 'on', { device_class: 'moisture', friendly_name: 'Sous l’évier' }) }, etat: ETAT('fuite') });
  const ouverts = [];
  const m = carte(w, { onOpen: (id) => ouverts.push(id) });
  assert.equal(classe(m, 'o-seul-etroit').length, 0, 'une seule écriture : la large et l’étroite font pareil');
  m.appuyer(puces(m)[0]);
  assert.deepEqual([ouverts, w.appels], [[VANNE], []]);
  assert.equal(EE.prendreQuestion(VANNE), true, 'la popup trouvera la question');
  assert.equal(phrase(m).indexOf('voit encore'), -1, 'la carte ne coupe pas la question');
}));

test('I12 : la compacte — la plaque, le nom, la phrase, et AUCUNE commande', () => dans(() => {
  const w = poser();
  const m = carte(w, { chip: true });
  assert.ok(m.arbre.props.className.indexOf('o-cvdense') >= 0);
  assert.ok(m.texte().indexOf('Ouverte · aucune fuite') >= 0);
  assert.deepEqual(m.trouver(e => e.type === 'button'), [], 'un appui de travers couperait l’eau de la maison');
}));

test('I31 : une vanne simple, le gaz qui demande, une prise désignée', () => dans(() => {
  const w = poser({ etats: { 'valve.arrosage': st('valve.arrosage', 'open', { friendly_name: 'Arrosage' }), 'valve.gaz': st('valve.gaz', 'closed', { device_class: 'gas', friendly_name: 'Gaz' }),
    'switch.prise_arrivee': st('switch.prise_arrivee', 'on', { friendly_name: 'Prise de l’arrivée' }) }, alertes: { actions: { vanne: { actif: true, entite: 'switch.prise_arrivee' } } } });
  const simple = carte(w, { id: 'valve.arrosage' });
  assert.deepEqual([phrase(simple), texteDe(puces(simple)[0])], ['Ouverte', 'Fermer']);
  simple.appuyer(puces(simple)[0]);
  const gaz = carte(w, { id: 'valve.gaz' });
  gaz.appuyer(gaz.trouver(e => e.type === 'button' && e.props['data-ecrit'] === 'large')[0]);
  assert.equal(phrase(gaz), 'Ouvrir le gaz ?');
  assert.deepEqual(puces(gaz).map(b => texteDe(b)), ['Annuler', 'Ouvrir']);
  const prise = carte(w, { id: 'switch.prise_arrivee' });
  assert.equal(phrase(prise), 'Ouverte · aucune fuite');
  prise.appuyer(puces(prise)[0]);
  assert.deepEqual(w.appels, ['valve.close_valve valve.arrosage', 'switch.turn_off switch.prise_arrivee']);
}));

test('rien d’inerte : une vanne muette n’a pas de puce, son liseré respire', () => dans(() => {
  const w = poser({ etats: { [VANNE]: st(VANNE, 'unavailable', { device_class: 'water', friendly_name: 'Arrivée d’eau' }, a(14, 20)) } });
  const m = carte(w);
  assert.ok(m.arbre.props.className.indexOf('o-panne') >= 0);
  assert.equal(phrase(m), 'Indisponible depuis 14:20');
  assert.deepEqual(m.trouver(e => e.type === 'button'), []);
}));
