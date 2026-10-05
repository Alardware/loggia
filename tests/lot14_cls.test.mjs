// ─────────────────────────────────────────────────────────────────────────────
// Lot 14 de l'audit du 03/10 — la page ne saute plus au chargement (CLS).
//
// Mesures de départ, démo sur le serveur de dev, `PerformanceObserver`
// (`layout-shift`, tamponné) sur les secondes qui suivent un rechargement :
// 0,27 à 1440 × 900, 0,24 à 390 px, 0,36 au téléphone tactile, 0,45 à 0,55 en
// tablette tactile (1180 × 820). Les causes, une à une :
//   - `useHass` rendait null au premier rendu alors que `hass` existait : le
//     rail naissait vide puis se remplissait (0,24 à lui seul) ;
//   - la classe `loggia-tactile` venait d'un `useEffect` : bandeau du haut et
//     barre latérale au premier dessin, retirés une image après ;
//   - la rangée des scénarios, la ligne des avatars, les prévisions de la
//     carte météo et le micro de l'assistant arrivaient après le premier
//     dessin et poussaient ce qui suivait.
// Après : 0,001 à 0,02 selon la situation, polices chargées. Le reste vient
// des polices (constat « polices » du même lot) et de commandes qui PARAISSENT
// à leur place, sans rien pousser.
//
// Le rendu (tests/rendu.mjs, ou un morceau d'App.jsx passé par esbuild) pour
// ce qui se rend ; le texte du source pour le reste. Chaque test échoue sur le
// code d'avant.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement, Fragment, useState, useRef, useEffect } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import { composant, rendre } from './rendu.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const src = lire('src', 'App.jsx');

/** Un morceau d'App.jsx, de `debut` jusqu'à `fin` compris. */
function morceau(debut, fin, dans = src) {
  const d = dans.indexOf(debut);
  assert.ok(d >= 0, '« ' + debut + ' » introuvable');
  const f = dans.indexOf(fin, d);
  assert.ok(f >= 0, '« ' + fin.trim() + ' » introuvable après « ' + debut + ' »');
  return dans.slice(d, f + fin.length);
}

/** Ce morceau, compilé puis exécuté ; `portee` lui donne ce qu'il lit autour de lui. */
function evaluer(code, portee, rendu) {
  const js = transformSync(code, { loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Frag' }).code;
  const noms = Object.keys(portee);
  return new Function('h', 'Frag', ...noms, js + '\nreturn ' + rendu + ';')(createElement, Fragment, ...noms.map(n => portee[n]));
}

test('useHass rend `hass` dès le premier rendu, sans attendre son tic', () => {
  const HASS = { states: { 'light.salon': { state: 'on', last_updated: 't' } }, connected: true };
  const useHass = evaluer(morceau('function useHass(', '\n}'),
    { useState, useRef, useEffect, getHass: () => HASS, HASS_POLL_MS: 2000, wattsDe: () => null, sigHash: () => 0 }, 'useHass');
  function Sonde() { const h = useHass(['light.salon']); return createElement('span', null, h === HASS ? 'avec' : 'sans'); }
  // Un rendu statique ne lance aucun effet : c'est exactement le premier dessin.
  assert.equal(renderToStaticMarkup(createElement(Sonde)), '<span>avec</span>',
    'le premier dessin naît sans hass : HORS LIGNE, pièces d’exemple, puis le rail qui se remplit et la page qui saute');
  const vide = evaluer(morceau('function useHass(', '\n}'),
    { useState, useRef, useEffect, getHass: () => null, HASS_POLL_MS: 2000, wattsDe: () => null, sigHash: () => 0 }, 'useHass');
  function Seule() { return createElement('span', null, vide(['light.salon']) === null ? 'rien' : '?'); }
  assert.equal(renderToStaticMarkup(createElement(Seule)), '<span>rien</span>', 'sans Home Assistant, toujours null');
});

test('la classe tactile se pose AVANT la première peinture', () => {
  const i = src.indexOf("document.documentElement.classList.toggle('loggia-tactile', actif)");
  assert.ok(i > 0, 'la pose de la classe a disparu');
  // Le crochet qui l'enveloppe : le dernier « …Effect(() => { » avant elle.
  const crochet = src.slice(src.lastIndexOf('Effect(() => {', i) - 'useLayout'.length, i);
  assert.match(crochet, /^useLayoutEffect\(\(\) => \{\s*const actif = /,
    'un useEffect : bandeau du haut et barre latérale ouverte au premier dessin, retirés une image après (−73 px, −264 px)');
});

test('la barre latérale dit « CONNEXION… » tant que le pont n’a pas fait un tic, et seulement sans hass au montage', () => {
  assert.ok(src.includes('customViews={customViews} ha={!wasConnectedRef.current && patienceHa ? null : (() => {'),
    'la barre latérale reçoit encore « hors ligne » avant le moindre échec');
  assert.ok(src.includes('useEffect(() => { if (wasConnectedRef.current) return undefined; const t = setTimeout(() => setPatienceHa(false), HASS_POLL_MS); return () => clearTimeout(t); }, []);'),
    'le délai de grâce : un tic du pont, et pas de minuteur quand hass est déjà là');
});

test('« Home Assistant n’est pas joignable » attend un vrai échec', () => {
  const ui = lire('src', 'ui.jsx');
  const corps = morceau('export function useEtatServeur(', '\n}', ui);
  assert.ok(!corps.includes("if (!connecte) { setErr(tr('Home Assistant n’est pas joignable.')); return undefined; }"),
    'le message tombe au premier rendu, puis s’efface à l’arrivée de hass');
  assert.ok(corps.includes("if (!connecte) { const t = setTimeout(() => { if (!getHass()) setErr(tr('Home Assistant n’est pas joignable.')); }, 4000); return () => clearTimeout(t); }"),
    'quatre secondes, deux tics du pont ; un hass venu entre-temps emporte le minuteur');
});

test('la rangée des scénarios garde sa place — vide — jusqu’à la réponse du composant', () => {
  let reponse = { tous: [], etat: null, err: '', noms: {}, enCours: null, lancer: () => {} };
  const memoire = new Map();
  const faux = { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => memoire.set(k, String(v)) };
  const ScenariosAccueil = evaluer(morceau('function ScenariosAccueil(', '\n}'), {
    useScenarios: () => reponse, scenariosAccueil: (t) => t, useRef, useState, useEffect,
    // Un rendu statique ne lance ni l'un ni l'autre ; on évite l'avertissement serveur.
    useLayoutEffect: useEffect, localStorage: faux,
    bordsDefilement: () => ({ avant: false, apres: false }), REDUCE_MOTION: false,
    trN: (n, un, plusieurs) => (n > 1 ? plusieurs : un).replace('{n}', n), tr: (s) => s, sectionTitle: {},
    Fi: () => null, CarteScenario: ({ s }) => createElement('button', { type: 'button' }, s.nom),
  }, 'ScenariosAccueil');
  const CONNECTE = { callWS: () => new Promise(() => {}) };
  const rendu = (hass = CONNECTE) => renderToStaticMarkup(createElement(ScenariosAccueil, { hass, onNav: () => {} }));
  const RESERVE = '<div class="grid-qscenes" aria-hidden="true" style="overflow-x:scroll"><span style="height:88px"></span></div>';

  // Premier passage sur cet appareil : on ne sait rien, rien n'est réservé.
  let html = rendu();
  assert.ok(!html.includes('grid-qscenes'), 'sans indice, une réserve pousserait un Accueil sans scénario');
  assert.ok(html.includes('visibility:hidden'), 'le lien de l’en-tête attend la réponse, caché : il changeait de texte sous les yeux');

  // La rangée était pleine la dernière fois : sa place, vide, le temps de la réponse.
  memoire.set('loggia-scnrangee', '1');
  html = rendu();
  assert.ok(html.includes(RESERVE), 'la rangée arrive après le premier dessin et pousse les pièces et les caméras de 94 px');
  const reserve = html.slice(html.indexOf(RESERVE), html.indexOf(RESERVE) + RESERVE.length);
  assert.ok(!reserve.includes('<button') && !reserve.includes('role='), 'une réserve, pas une fausse carte');
  // Sans connexion, aucune réponse ne viendra : la réserve partait à 4 s et
  // la page remontait de 94 px (relecture du lot 14).
  assert.ok(!rendu({}).includes(RESERVE), 'une réserve sans connexion : elle part à la panne et fait sauter la page');

  // La réponse : la vraie rangée, plus de réserve, l'en-tête visible.
  reponse = { ...reponse, etat: { scenarios: [] }, tous: [{ id: 'a', nom: 'Réveil' }, { id: 'b', nom: 'Nuit' }] };
  html = rendu();
  assert.ok(!html.includes('aria-hidden="true" style="overflow-x:scroll"'), 'la réserve reste après la réponse');
  assert.equal((html.match(/<button type="button">/g) || []).length, 2, 'les deux scénarios');
  assert.ok(!html.includes('visibility:hidden') && html.includes('2 scénarios'), 'l’en-tête et son lien, visibles');

  // Un refus : ni réserve ni silence, le message se lit.
  reponse = { tous: [], etat: null, err: 'Scénarios indisponibles.', noms: {}, enCours: null, lancer: () => {} };
  html = rendu();
  assert.ok(!html.includes('grid-qscenes') && html.includes('Scénarios indisponibles.') && !html.includes('visibility:hidden'));

  // Les flèches se mesurent avant la peinture : elles naissent avec la rangée.
  assert.ok(morceau('function ScenariosAccueil(', '\n}').includes('useLayoutEffect(() => {\n    const el = rangee.current;'),
    'mesurées une image après, les flèches poussaient le lien de 64 px');
});

test('l’indice de la rangée reste sur l’appareil, et la démo le connaît d’avance', async () => {
  const { CLES_APPAREIL, horsSauvegarde } = await import('../src/config.js');
  assert.ok(CLES_APPAREIL.has('loggia-scnrangee'), 'un indice d’affichage partirait dans l’export, puis dans la configuration commune');
  assert.ok(horsSauvegarde('loggia-scnrangee'));
  // Le magasin mémoire de la démo repart vide à chaque chargement : sans
  // l'indice, la démo sauterait à chaque visite.
  assert.ok(lire('src', 'demo.js').includes("    'loggia-scnrangee': 1,\n"), 'la démo ne sait plus que sa rangée est pleine');
});

test('la ligne des avatars garde sa hauteur jusqu’à la découverte', () => {
  const ligne = morceau('<div className="o-greet-ligne"', '{avatars.map(');
  assert.ok(ligne.includes("<div className=\"o-avatars\" style={{ display: 'flex', gap: 8, flexShrink: 0, minHeight: a && !a.index ? 34 : undefined }}>"),
    'les personnes viennent de la découverte : la ligne grandissait de 6 px et poussait toute la page');
});

test('la carte météo garde la place de ses prévisions tant qu’elles n’ont pas répondu', async () => {
  const CarteMeteo = await composant('cartemeteo.jsx', 'CarteMeteo');
  // Quotidiennes (1) et horaires (2) ; un abonnement qui n'a encore rien livré.
  const etat = { entity_id: 'weather.maison', state: 'cloudy', attributes: { friendly_name: 'Maison', temperature: 18, wind_speed: 9, supported_features: 3 } };
  const branche = { states: { 'weather.maison': etat }, connection: { subscribeMessage: () => new Promise(() => {}) } };
  const html = rendre(CarteMeteo, { hass: branche });
  const reserves = html.match(/<div aria-hidden="true" style="[^"]*">/g) || [];
  assert.equal(reserves.length, 2, 'la ligne Max · Min et la rangée des heures : arrivées après le premier dessin, elles poussaient le CO₂ de 105 px');
  assert.ok(reserves.some(r => r.includes('visibility:hidden') && r.includes('margin-top:12px') && r.includes('padding-top:11px')), 'la rangée des heures : même marge, même filet');
  assert.ok(!/Max|Min/.test(html), 'rien d’inventé : la réserve est vide');
  assert.ok(reserves.every(r => !r.includes(' id=')), 'une réserve ne se décrit pas : aucun identifiant, rien à lire');
  // Rien à attendre : pas de connexion, ou une entité sans prévision.
  assert.ok(!rendre(CarteMeteo, { hass: { states: branche.states } }).includes('aria-hidden="true" style'), 'sans connexion, aucune réserve');
  const muette = { ...etat, attributes: { ...etat.attributes, supported_features: 0 } };
  assert.ok(!rendre(CarteMeteo, { hass: { ...branche, states: { 'weather.maison': muette } } }).includes('aria-hidden="true" style'), 'une entité sans prévision ne réserve rien');
  // La source : une première livraison vide, ou un refus, lèvent la réserve.
  const carte = lire('src', 'cartemeteo.jsx');
  assert.ok(carte.includes('setListe(l => (Array.isArray(ev.forecast) ? ev.forecast : l === undefined ? null : l))') && carte.includes('.catch(() => { if (!fini) setListe(null);'),
    'une réserve qui ne part jamais');
});

test('le micro de l’assistant : sa place, le temps de la première réponse', async () => {
  const { setLoggiaState } = await import('../src/state.js');
  const useAssistant = await composant('assistant.js', 'useAssistant');
  let vu = null;
  function Sonde({ hass }) { vu = useAssistant(hass); return null; }
  const enAttente = { states: {}, callWS: () => new Promise(() => {}) };
  try {
    setLoggiaState({ cfg: { loggia_assistant: 'demo' } });
    renderToStaticMarkup(createElement(Sonde, { hass: enAttente }));
    assert.deepEqual(vu, { cle: '', attente: true }, 'le bouton paraissait une image après et poussait la date de 50 px');
    renderToStaticMarkup(createElement(Sonde, { hass: null }));
    assert.deepEqual(vu, { cle: '', attente: false }, 'sans Home Assistant, rien à attendre');
    setLoggiaState({ cfg: {} });
    renderToStaticMarkup(createElement(Sonde, { hass: enAttente }));
    assert.deepEqual(vu, { cle: '', attente: false }, 'sans assistant réglé, aucune place gardée');
  } finally { setLoggiaState({ cfg: {} }); }
  assert.ok(src.includes('const { cle: assistantNs, attente: assistantAttendu } = useAssistant(hass);'));
  assert.ok(src.includes('{!onAssistant && ctx.assistantAttendu && <span className="o-hdr-assist" aria-hidden="true" style={{ width: 42, height: 42, flexShrink: 0 }} />}'),
    'l’en-tête : 42 px, la classe du micro (le tactile la retire comme lui)');
  assert.ok(src.includes("{!onAssistant && assistantAttendu && i === Math.ceil(items.length / 2) && <span aria-hidden=\"true\" style={{ flex: '0 0 62px' }} />}"),
    'la barre du bas : 62 px au milieu, la place du bouton');
  assert.ok(src.includes('menuOuvert={navOpen} assistantAttendu={assistantAttendu} onAssistant='), 'la barre du bas ne reçoit pas l’attente');
});
