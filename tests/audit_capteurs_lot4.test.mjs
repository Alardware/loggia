/* L'audit des capteurs du 19/10, lot 4 (le dernier) : les FICHES, la vue PRÉSENCE et les petits points d'affichage (ADR 0252).
 *
 * Chaque test rejoue un défaut que les sondes de l'audit (scratchpad, audit-B et audit-D) ont montré sur le code d'avant :
 *  - M17 : la fiche d'un binaire que l'historique ignore disait « fermée toute la journée » sous « Ouverte » ;
 *  - M18 : la fiche de confort ne relisait jamais l'historique, et disait « Pas de capteur configuré » d'un capteur muet ;
 *  - M19 : la carte Présence lisait le journal, la popup l'historique depuis minuit — à 00:30, deux histoires ; « Il y a 300 min » ;
 *  - M20 : la vue Présence avait sa propre bascule, muette pour un lecteur d'écran, et ses champs nombre partaient à chaque frappe ;
 *  - les mots : un même danger sous deux noms, « Vide » et « Libre », « Faible » et « Pile faible », « appareils » puis « cartes » ;
 *  - la couleur d'un capteur muet, la puce de la carte Ouvertures (l'heure du redémarrage), la sonnette, `quandPlante`,
 *    `loggia_roomhidden`, le grand mot allemand, `Sparkline`.
 * `BRIQUES_GROUPE`, `deriveNotifs` et `Sparkline` vivent dans App.jsx : sous `?lot4`, un crochet de chargement leur ajoute un export. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { monter } from './crochets.mjs';
import { maisonGroupes, ctxDe } from './maison_capteurs.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?lot4')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?lot4'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { BRIQUES_GROUPE, deriveNotifs, Sparkline };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?lot4', import.meta.url).href);
const FC = await import('../src/fichecapteur.jsx');
const FG = await import('../src/fichegroupe.jsx');
const CONF = await import('../src/ficheconfort.jsx');
const J = await import('../src/journee.jsx');
const G = await import('../src/groupes.js');
const A = await import('../src/attention.js');
const PL = await import('../src/plantes.js');
const L = await import('../src/lectures.js');
const PRES = await import('../src/views/presence.jsx');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const APP = lire('src/App.jsx');

const PIECES = ['Séjour', 'Chambre', 'Cuisine'];
const T = (h, mn = 0, j = 19) => new Date(2026, 9, j, h, mn).getTime();
const hm = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const attendre = () => new Promise(r => setTimeout(r, 5));
const corpsDe = (m) => m.trouver(e => e.props && e.props.mot !== undefined)[0].props;
// L'état d'une rangée : le dernier `span` à 13 / 800 de chaque bouton.
const etatsDe = (m) => m.trouver(e => e.type === 'span' && e.props && e.props.style && e.props.style.fontSize === 13 && e.props.style.fontWeight === 800);

/* ── M17 ── */
test('M17 : un binaire que l’historique ignore — pas de bande devinée, pas de « fermée toute la journée »', async () => {
  const id = 'binary_sensor.porte';
  const hass = { states: { [id]: { entity_id: id, state: 'on', last_changed: new Date().toISOString(), attributes: { device_class: 'door', friendly_name: 'Porte entrée' } } }, callApi: () => Promise.resolve([]) };
  const briques = { etatsBinaires: () => ({ door: ['Ouverte', 'Fermée', false] }), pileDe: () => null, soeursDe: () => [] };
  const m = monter(FC.RoomBinarySheet, { id, hass, briques });
  await attendre(); m.rendre();
  assert.equal(m.trouver(e => e.type === J.BandeJour).length, 0, 'la bande se tait');
  assert.ok(m.texte().includes('Ouverte'), m.texte());
  assert.ok(!m.texte().includes('Chargement'), 'lu : plus de « Chargement… » — ' + m.texte());
  m.demonter();
});

/* ── M18 ── */
const BRIQ_CONFORT = { Sparkline: function Sparkline() { return null; }, hx: () => 'x' };
test('M18 : la fiche de confort relit l’historique quand un capteur revient, et dit « Indisponible » d’un capteur muet', async () => {
  const appels = [];
  const pts = [{ state: '20' }, { state: '21' }, { state: '22' }];
  const hass = { states: {}, callApi: (_m, url) => { appels.push(url); return Promise.resolve([pts]); } };
  const live = (temp) => ({ temp, hum: null, co2: null, tempId: 'sensor.t', humId: null, co2Id: null });
  const m = monter(CONF.default, { piece: { name: 'Séjour', live: live(null) }, hass, briques: BRIQ_CONFORT });
  await attendre(); m.rendre();
  const muet = m.texte();
  assert.ok(!muet.includes('Pas de capteur configuré') && !muet.includes('Aucune donnée capteur'), 'configuré mais muet — ' + muet);
  assert.ok(muet.includes('Indisponible'), muet);
  assert.ok(muet.includes('Température'), 'son panneau reste, sans chiffre — ' + muet);
  const avant = appels.length;
  m.proprietes({ piece: { name: 'Séjour', live: live(20) }, hass, briques: BRIQ_CONFORT });
  await attendre(); m.rendre();
  assert.equal(appels.length, avant + 1, 'le capteur revenu : une lecture de plus');
  assert.ok(m.trouver(e => e.type === BRIQ_CONFORT.Sparkline).length === 1, 'sa courbe — ' + m.texte());
  m.demonter();
  // Sans aucun capteur : la phrase d'avant, vraie.
  const vide = monter(CONF.default, { piece: { name: 'Cave', live: { temp: null, hum: null, co2: null, tempId: null, humId: null, co2Id: null } }, hass, briques: BRIQ_CONFORT });
  assert.ok(vide.texte().includes('Pas de capteur configuré pour cette pièce.'), vide.texte());
  vide.demonter();
});

test('M18 : les panneaux au liseré et à l’arrondi du thème ; la barre se tait ; le CO₂ s’appelle « CO₂ », glyphe `wind`', () => {
  const src = lire('src/ficheconfort.jsx');
  assert.ok(!src.includes('--o-bd3') && !/borderRadius: 18\b/.test(src), 'plus de liseré ni d’arrondi en dur');
  assert.ok(src.includes('border: LISERE') && src.includes("borderRadius: 'var(--o-radius"), 'LISERE et var(--o-radius)');
  const hass = { states: {}, callApi: () => new Promise(() => {}) };
  const html = renderToStaticMarkup(createElement(CONF.default, { piece: { name: 'Séjour', live: { temp: 21, hum: 45, co2: 900, tempId: null, humId: null, co2Id: null } }, hass, briques: BRIQ_CONFORT }));
  assert.ok(html.includes('>CO₂<') && !html.includes('Qualité de l'), 'le nom de confort.js');
  assert.ok(!html.includes('data-ico="leaf"') && !/fi-[a-z]+-leaf/.test(html), 'plus la feuille');
  assert.equal((html.match(/<div aria-hidden="true"><div style="position:relative;height:24px/g) || []).length, 3, 'les trois barres se taisent');
});

/* ── M19 ── */
const BRIQ = { etatsBinaires: () => F.BRIQUES_GROUPE.etatsBinaires(), pileDe: () => null, soeursDe: () => [] };
test('M19 : à 00:30, la carte et la popup Présence lisent le même journal — et la rangée dit « 5 h », jamais « Il y a 300 min »', () => {
  const id = 'binary_sensor.mvt';
  const S = { [id]: { state: 'off', last_changed: new Date(T(0, 10)).toISOString(), attributes: { device_class: 'motion' } } };
  const noms = new Map([[id, 'Séjour']]);
  const derniers = { [id]: T(23, 50, 18) };
  const maintenant = T(0, 30);
  assert.equal(G.vuePresence([id], S, noms, derniers, maintenant).phrase, 'Mouvement · Séjour · il y a 40 min');
  const journee = { debut: T(0), etats: { [id]: [{ t: T(0), s: 'off' }] } };
  const m = monter(FG.Presence, { ids: [id], S, noms, briques: BRIQ, journee, derniers, maintenant, onMembre: () => {} });
  assert.deepEqual([corpsDe(m).mot, corpsDe(m).phrase], ['Rien depuis 40 min', 'Dernier mouvement à ' + hm(T(23, 50, 18))]);
  m.demonter();
  // Rien dans le journal : les mots de la carte.
  const r = monter(FG.Presence, { ids: [id], S, noms, briques: BRIQ, journee, derniers: {}, maintenant, onMembre: () => {} });
  assert.equal(corpsDe(r).mot, 'Rien depuis plus de 24 h');
  r.demonter();
  // Cinq heures : « 5 h ».
  const c = monter(FG.Presence, { ids: [id], S, noms, briques: BRIQ, journee, derniers: { [id]: T(9) }, maintenant: T(14), onMembre: () => {} });
  assert.ok(c.texte().includes('5 h') && !c.texte().includes('300 min'), c.texte());
  c.demonter();
  // La coquille passe le journal à la popup : la source de la carte.
  const i = APP.indexOf('\nfunction FicheGroupe(');
  const coquille = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.ok(coquille.includes("useDerniersEvenements(H, groupe === 'presence' ? membres : [], reduireDerniers)") && coquille.includes('derniers={derniers}'), 'la popup lit le journal');
});

/* ── M20 ── */
test('M20 : la vue Présence prend la bascule commune, ses puces disent leur état, ses champs nombre partent à la sortie', async () => {
  const src = lire('src/views/presence.jsx');
  assert.ok(!/const Bascule = /.test(src) && /import \{[^}]*\bBascule\b[^}]*\} from '\.\.\/ui\.jsx'/.test(src), 'la bascule de ui.jsx');
  assert.ok(src.includes('aria-pressed={on}') && src.includes("aria-pressed={(alarme.mode || 'away') === id}"), 'les puces Qui compte et le mode d’alarme');
  assert.ok(!src.includes('onChange={e => enregistrer('), 'plus d’envoi à chaque frappe');
  const valides = [];
  const m = monter(PRES.ChampNombre, { valeur: 17, min: 5, max: 25, pas: 0.5, nom: 'Absence', onValide: (n) => valides.push(n) });
  const champ = () => m.trouver(e => e.type === 'input')[0];
  // `appuyer` ne passe pas l'évènement voulu : le geste se joue à la main, puis le rendu.
  const geste = (nom, ev) => { champ().props[nom](ev); m.rendre(); };
  geste('onChange', { target: { value: '1' } });
  geste('onChange', { target: { value: '16' } });
  assert.deepEqual(valides, [], 'rien ne part pendant la frappe');
  geste('onBlur', { target: { value: '16' } });
  assert.deepEqual(valides, [16], 'à la sortie, une fois');
  geste('onChange', { target: { value: '99' } });
  geste('onKeyDown', { key: 'Enter', currentTarget: { value: '99' } });
  assert.deepEqual(valides, [16, 25], 'Entrée, et la borne haute');
  m.proprietes({ valeur: 25, min: 5, max: 25, pas: 0.5, nom: 'Absence', onValide: (n) => valides.push(n) }); m.rendre();
  geste('onChange', { target: { value: '' } });
  geste('onBlur', { target: { value: '' } });
  assert.deepEqual(valides, [16, 25], 'un champ vidé ne vaut jamais 0');
  assert.equal(champ().props.value, '25', 'il redit la valeur d’avant');
  geste('onBlur', { target: { value: '21,5' } });
  assert.deepEqual(valides, [16, 25, 21.5], 'la virgule se lit');
  m.demonter();
});

/* ── Les mots ── */
test('un mot pour une chose : la fiche, la carte et l’Accueil disent le danger avec la même table ; Vide, Pile faible, cartes', () => {
  const e = F.BRIQUES_GROUPE.etatsBinaires();
  for (const c of ['smoke', 'carbon_monoxide', 'gas', 'moisture', 'tamper']) assert.equal(e[c][0], A.motsSurete(c)[1], c);
  assert.deepEqual([e.carbon_monoxide[0], e.tamper[0], e.moisture[0]], ['Monoxyde détecté', 'Boîtier ouvert', 'Fuite détectée']);
  const S = { 'binary_sensor.co': { state: 'on', last_changed: new Date().toISOString(), attributes: { device_class: 'carbon_monoxide', friendly_name: 'CO garage' } } };
  setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });
  assert.ok(F.deriveNotifs({ states: S }).some(n => n.m === 'Monoxyde détecté · CO garage'), 'l’Accueil lit la même table');
  assert.ok(!APP.includes("'CO détecté'") && !APP.includes('Boîtier ouvert ou déplacé'), 'plus de seconde table');
  assert.equal(e.occupancy[1], 'Vide');
  // La popup Présence et la popup Piles prennent les mots de la table.
  const id = 'binary_sensor.radar';
  const m = monter(FG.Presence, { ids: [id], S: { [id]: { state: 'off', attributes: { device_class: 'occupancy' } } }, noms: new Map([[id, 'Bureau']]), briques: BRIQ, journee: null, derniers: {}, maintenant: T(12), onMembre: () => {} });
  assert.ok(m.texte().includes('Vide'), m.texte());
  m.demonter();
  const piles = [{ id: 'binary_sensor.sonnette_pile', nom: 'Sonnette', binaire: true, allume: true, niveau: null, muette: false }, { id: 'binary_sensor.bouton_pile', nom: 'Bouton', binaire: true, allume: false, niveau: null, muette: false }];
  const p = monter(FG.Piles, { piles, S: {}, pieces: new Map(), briques: BRIQ, maintenant: T(12), onMembre: () => {} });
  assert.ok(p.texte().includes('Pile faible') && p.texte().includes('Pile en forme') && !p.texte().includes('Tient'), p.texte());
  p.demonter();
  // L'en-tête d'Objets › Capteurs : « cartes », même avant que son module n'arrive.
  const i = APP.indexOf('enSections ? (');
  assert.ok(APP.slice(i, i + 1600).includes("trN(visibles.length, '{n} carte', '{n} cartes')"), 'le repli dit « cartes »');
});

/* ── La couleur d'un muet ── */
test('un capteur muet : « Indisponible » en rouge, dans sa fiche comme dans les rangées des popups (C26)', () => {
  const fx = maisonGroupes();
  const ctx = ctxDe(fx, PIECES);
  const mg = G.membresGroupes(fx.states, ctx);
  const muet = (ids) => Object.fromEntries(Object.entries(fx.states).map(([id, st]) => [id, id === ids ? { ...st, state: 'unavailable' } : st]));
  const rouge = (m) => etatsDe(m).filter(s => s.props.children === 'Indisponible').map(s => s.props.style.color);
  const o = mg.ouvertures, s = mg.securite, p = mg.presence;
  const S1 = muet(o[0]);
  const m1 = monter(FG.Ouvertures, { ids: o, S: S1, noms: G.nomsMembres(o, S1, ctx), pieces: new Map(), briques: { ...BRIQ, Dessin: () => null }, journee: null, maintenant: T(12), hass: { states: S1 }, onMembre: () => {} });
  assert.deepEqual(rouge(m1), ['var(--o-bad)']); m1.demonter();
  const S2 = muet(s[0]);
  const m2 = monter(FG.Securite, { ids: s, S: S2, noms: G.nomsMembres(s, S2, ctx), briques: BRIQ, journee: null, onMembre: () => {} });
  assert.deepEqual(rouge(m2), ['var(--o-bad)']); m2.demonter();
  const S3 = muet(p[0]);
  const m3 = monter(FG.Presence, { ids: p, S: S3, noms: G.nomsMembres(p, S3, ctx), briques: BRIQ, journee: null, derniers: {}, maintenant: T(12), onMembre: () => {} });
  assert.deepEqual(rouge(m3), ['var(--o-bad)']); m3.demonter();
});

/* ── La carte Ouvertures ── */
test('la puce de la carte Ouvertures donne l’heure du dernier VRAI changement — jamais celle du redémarrage', () => {
  const fx = maisonGroupes();
  const ctx = ctxDe(fx, PIECES);
  const ids = G.membresGroupes(fx.states, ctx).ouvertures;
  const noms = G.nomsMembres(ids, fx.states, ctx);
  const h = (t) => hm(t);
  // L'historique du jour ne la voit pas changer (ouverte depuis hier) : le nom seul.
  assert.equal(G.vueOuvertures(ids, fx.states, noms, h, () => null).puces[0].t, 'Contact baie vitrée');
  assert.equal(G.vueOuvertures(ids, fx.states, noms, h, () => T(8)).puces[0].t, 'Contact baie vitrée · ' + hm(T(8)));
  assert.equal(G.vueOuvertures(ids, fx.states, noms, h).puces[0].t, 'Contact baie vitrée', 'sans source, aucune heure devinée');
  const r = APP.indexOf('\nfunction RoomGroupeCard(');
  const carte = APP.slice(r, APP.indexOf('\n}\n', r));
  assert.ok(carte.includes('useJournee(') && carte.includes('depuisQuand('), 'la carte lit l’historique du jour, comme la popup');
});

/* ── La sonnette (§ 19.3) ── */
test('§ 19.3 : la sonnette — « Quelqu’un à la porte · il y a 3 min », même si sa caméra a vu bouger après', () => {
  const fx = maisonGroupes();
  fx.entities = fx.entities.map(e => (e.entity_id === 'binary_sensor.camera_porte_sonnette' ? { ...e, translation_key: 'doorbell' } : e));
  const ctx = ctxDe(fx, PIECES);
  const ids = G.membresGroupes(fx.states, ctx).presence;
  const noms = G.nomsMembres(ids, fx.states, ctx);
  const t = T(20);
  const min = 60000;
  const on = (id) => ({ ...fx.states, [id]: { ...fx.states[id], state: 'on' } });
  const vue = (S, d) => G.vuePresence(ids, S, noms, d, t, ctx);
  assert.equal(vue(on('binary_sensor.camera_porte_sonnette'), {}).phrase, 'Quelqu’un à la porte · en ce moment');
  const deux = { ...on('binary_sensor.camera_porte_sonnette'), 'binary_sensor.camera_porte_mouvement': { ...fx.states['binary_sensor.camera_porte_mouvement'], state: 'on' } };
  assert.equal(vue(deux, {}).phrase, 'Quelqu’un à la porte · en ce moment', 'la sonnette avant le mouvement de sa caméra');
  const v = vue(fx.states, { 'binary_sensor.camera_porte_sonnette': t - 3 * min, 'binary_sensor.camera_porte_mouvement': t - min });
  assert.deepEqual([v.phrase, v.phraseCourte], ['Quelqu’un à la porte · il y a 3 min', 'À la porte · 3 min']);
  assert.equal(vue(fx.states, { 'binary_sensor.camera_porte_sonnette': t - 3 * min, 'binary_sensor.enceinte_mouvement': t - min }).phrase, 'Mouvement · Séjour · il y a 1 min', 'un mouvement AILLEURS, après, l’emporte');
  // Sans sa clé de traduction, une `occupancy` reste une présence.
  assert.equal(G.vuePresence(ids, on('binary_sensor.camera_porte_sonnette'), noms, {}, t, ctxDe(maisonGroupes(), PIECES)).phrase, 'Quelqu’un · Caméra porte');
  // La popup : « Quelqu’un à la porte ».
  const m = monter(FG.Presence, { ids, S: on('binary_sensor.camera_porte_sonnette'), noms, briques: BRIQ, journee: null, derniers: {}, maintenant: t, ctx, onMembre: () => {} });
  assert.equal(corpsDe(m).mot, 'Quelqu’un à la porte');
  m.demonter();
});

/* ── Les petits points ── */
test('quandPlante : au-delà de six jours, le jour et le mois', () => {
  const t = new Date(2026, 9, 15, 20, 40).getTime();
  assert.equal(PL.quandPlante(new Date(2026, 9, 10, 14, 5).getTime(), t, 'fr-FR'), 'sam. 14:05', 'dans les six jours : son nom');
  const vieux = new Date(2026, 9, 5, 14, 5).getTime();
  assert.equal(PL.quandPlante(vieux, t, 'fr-FR'), new Date(vieux).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
  assert.ok(/5 oct/.test(PL.quandPlante(vieux, t, 'fr-FR')), PL.quandPlante(vieux, t, 'fr-FR'));
  assert.ok(/2025/.test(PL.quandPlante(new Date(2025, 11, 30, 9, 0).getTime(), t, 'fr-FR')), 'une autre année : l’année');
});

test('`loggia_roomhidden` : plus rien ne le lit — « Tout réafficher » remet l’agencement', () => {
  assert.equal(typeof L.roomHidden, 'undefined');
  assert.ok(!APP.includes('roomHidden') && !APP.includes("removeItem('loggia_roomhidden')") && !lire('src/lectures.js').includes('loggia_roomhidden'), 'plus rien ne le lit');
  assert.ok(APP.includes('toutes={() => ed.reset()}'), '« Tout réafficher » : l’agencement');
});

test('le grand mot ne déborde pas : « Sicherheitswarnung » se coupe dans la fiche d’un binaire et le panneau d’un groupe', () => {
  const id = 'binary_sensor.s';
  const fiche = monter(FC.RoomBinarySheet, { id, hass: { states: { [id]: { state: 'on', attributes: { device_class: 'safety' } } } }, briques: { etatsBinaires: () => ({ safety: ['Sicherheitswarnung', 'Normal', true] }), pileDe: () => null, soeursDe: () => [] } }, { effets: false });
  assert.equal(fiche.trouver(e => e.props && e.props.children === 'Sicherheitswarnung')[0].props.style.overflowWrap, 'anywhere');
  const m = monter(FG.Securite, { ids: [id], S: { [id]: { state: 'on', attributes: { device_class: 'safety' } } }, noms: new Map([[id, 'X']]), briques: BRIQ, journee: null, onMembre: () => {} });
  const html = renderToStaticMarkup(m.trouver(e => e.props && e.props.mot !== undefined)[0]);
  assert.ok(/font-size:28px;font-weight:800;line-height:1.15;[^"]*overflow-wrap:anywhere/.test(html), html);
  m.demonter();
});

test('`Sparkline` se tait pour un lecteur d’écran : la phrase et le chiffre la disent', () => {
  const html = renderToStaticMarkup(createElement(F.Sparkline, { points: [1, 2, 3], color: 'red' }));
  assert.ok(html.startsWith('<svg') && html.includes('aria-hidden="true"'), html);
});

/* ── Relecture du lot 4 (scratchpad, revue-lot4 : p1_sonnette.mjs, p3_depuis.mjs) ── */
const JL = await import('../src/journeelue.js');
const { horlogeFausse } = await import('./crochets.mjs');

test('relecture 1 : la lecture qui ne porte pas encore la réouverture — l’heure de `last_changed`, pas celle de la fermeture d’avant', () => {
  const debut = T(0);
  const lus = [{ t: debut, s: 'off' }, { t: T(8), s: 'on' }, { t: T(8, 5), s: 'off' }];
  const st = { state: 'on', last_changed: new Date(T(14)).toISOString(), attributes: { device_class: 'door' } };
  assert.equal(JL.depuisQuand(lus, debut, st), T(14), 'rouverte à 14:00');
  assert.equal(JL.depuisQuand([{ t: debut, s: 'off' }], debut, st), T(14), 'fermée depuis hier, ouverte à 14:00');
  assert.equal(JL.depuisQuand(lus, debut, { ...st, state: 'off', last_changed: new Date(T(8, 5)).toISOString() }), T(8, 5), 'lu et à jour : l’historique');
  const v = G.vueOuvertures(['binary_sensor.porte'], { 'binary_sensor.porte': st }, new Map([['binary_sensor.porte', 'Porte']]), hm, (id) => JL.depuisQuand(lus, debut, st));
  assert.equal(v.puces[0].t, 'Porte · ' + hm(T(14)));
});

test('relecture 2 : rien de lu — la carte et la popup se taisent toutes deux, jamais l’heure du redémarrage', () => {
  const st = { state: 'on', last_changed: new Date(T(0, 48)).toISOString(), attributes: { device_class: 'door' } };
  for (const etats of [null, undefined, []]) assert.equal(JL.depuisQuand(etats, null, st), null, String(etats));
  const r = APP.indexOf('\nfunction RoomGroupeCard(');
  const carte = APP.slice(r, APP.indexOf('\n}\n', r));
  assert.ok(carte.includes('const depuis = (id) => depuisQuand(lu ? lu.etats[id] || null : null, lu && lu.debut, S[id]);'), 'la carte prend la règle de la popup');
  const id = 'binary_sensor.porte';
  const m = monter(FG.Ouvertures, { ids: [id], S: { [id]: st }, noms: new Map([[id, 'Porte']]), pieces: new Map(), briques: { ...BRIQ, Dessin: () => null }, journee: 'erreur', maintenant: T(12), hass: { states: { [id]: st } }, onMembre: () => {} });
  assert.ok(!m.texte().includes(hm(T(0, 48))), m.texte());
  m.demonter();
});

test('relecture 3 : à minuit, la journée se relit — un minuteur fait rendre, et il part au démontage', () => {
  const vrai = Date.now;
  const h = horlogeFausse();
  let maintenant = T(23, 59, 18);
  Date.now = () => maintenant;
  h.installer();
  try {
    const appels = [];
    const hass = { callApi: (_m, url) => { appels.push(url); return new Promise(() => {}); } };
    const Sonde = (p) => { JL.useJournee(p.hass, p.ids); return null; };
    const m = monter(Sonde, { hass, ids: ['binary_sensor.porte'] });
    assert.equal(appels.length, 1);
    assert.equal(h.attentes().length, 1, 'un minuteur pour minuit');
    maintenant = T(0, 0, 19) + 1000;
    h.avancer(61000);
    m.rendre();
    assert.equal(appels.length, 2, 'relue le lendemain');
    assert.ok(appels[1].includes('history/period/' + new Date(T(0, 0, 19)).toISOString()), appels[1]);
    m.demonter();
    assert.equal(h.attentes().length, 0, 'nettoyé au démontage');
  } finally { h.restaurer(); Date.now = vrai; }
});

test('relecture 4 : une présence allumée depuis des heures ne fait pas disparaître la sonnette', () => {
  const now = T(14);
  const meta = { 'binary_sensor.g6_doorbell': { translationKey: 'doorbell', deviceId: 'cam' }, 'binary_sensor.g6_motion': { deviceId: 'cam' }, 'binary_sensor.salon_presence': { deviceId: 'fp2' } };
  const ctx = { meta: (id) => meta[id] || {} };
  const st = (s, dc) => ({ state: s, attributes: { device_class: dc } });
  const noms = new Map([['binary_sensor.g6_doorbell', 'Entrée'], ['binary_sensor.g6_motion', 'Entrée'], ['binary_sensor.salon_presence', 'Salon']]);
  const ids = [...noms.keys()];
  const S = { 'binary_sensor.g6_doorbell': st('off', 'occupancy'), 'binary_sensor.g6_motion': st('off', 'motion'), 'binary_sensor.salon_presence': st('on', 'occupancy') };
  const d = { 'binary_sensor.g6_doorbell': now - 180000, 'binary_sensor.g6_motion': now - 120000, 'binary_sensor.salon_presence': now - 7200000 };
  assert.equal(G.vuePresence(ids, S, noms, d, now, ctx).phrase, 'Quelqu’un à la porte · il y a 3 min');
  // Allumée APRÈS la sonnerie : elle reprend la phrase.
  assert.equal(G.vuePresence(ids, S, noms, { ...d, 'binary_sensor.salon_presence': now - 60000 }, now, ctx).phrase, 'Quelqu’un · Salon');
});

test('relecture 5 : `ChampNombre` n’envoie rien si le texte n’a pas changé — en °F, passer dans le champ n’écrit plus 41', () => {
  const valides = [];
  const m = monter(PRES.ChampNombre, { valeur: 17, min: 41, max: 77, pas: 0.5, nom: 'Absence', onValide: (n) => valides.push(n) });
  const champ = () => m.trouver(e => e.type === 'input')[0];
  champ().props.onBlur({ target: { value: '17' } }); m.rendre();
  champ().props.onKeyDown({ key: 'Enter', currentTarget: { value: ' 17 ' } }); m.rendre();
  assert.deepEqual(valides, [], 'rien ne part');
  champ().props.onBlur({ target: { value: '18' } }); m.rendre();
  assert.deepEqual(valides, [41], 'un texte changé part, borné');
  m.demonter();
});
