// ─────────────────────────────────────────────────────────────────────────────
// Plus de vue Croquettes : les repas s'activent dans la fiche du distributeur
// (04/10).
//
// L'utilisateur : « pas de vue croquette aucun intérêt, il n'y a plus de vue
// spéciale pour un appareil, c'est la carte plus sa popup c'est tout ». La vue
// n'avait plus d'entrée de menu depuis le 30/08 : on ne l'atteignait que par
// son adresse (`?vue=croquettes`, un onglet qui l'avait mémorisée). Mais elle
// était le SEUL endroit où l'on activait ou coupait un repas — la fiche ne
// faisait que les compter. Supprimer la vue sans rien déplacer aurait retiré
// le geste.
//
// Ce test tient les trois moitiés : la vue est partie de partout (routes,
// tables, disponibilité, styles), une vue « croquettes » mémorisée retombe sur
// l'Accueil, et la fiche montre une ligne par repas avec son interrupteur, qui
// bascule l'entité du repas et affiche tout de suite ce qu'on a demandé. La
// fiche est RENDUE (esbuild, comme lot13_accueil_tuiles_moment) : on lit le
// HTML, pas le JSX.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement, Fragment, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import { composant } from './rendu.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('src', 'App.jsx');
const CSS = lire('src', 'index.css');
const VUES = lire('src', 'views.js');

const Fi = await composant('ui.jsx', 'Fi');
const BasculeUi = await composant('ui.jsx', 'Bascule');
const { tr, trN } = await import(new URL('../src/i18n.js', import.meta.url));
const { useOptimiste, useDemandes, enVol, demandeCle } = await import(new URL('../src/optimiste.js', import.meta.url));
const { viewAvailability, VIEW_IDS } = await import(new URL('../src/views.js', import.meta.url));
const { joursDeReserve } = await import(new URL('../src/objets.js', import.meta.url));

/** Un morceau d'App.jsx, de `debut` jusqu'à `fin` compris. */
function morceau(debut, fin, dans = APP) {
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

test('la vue Croquettes est partie de partout', () => {
  assert.ok(!APP.includes('function CroquettesView(') && !APP.includes('function CroquettesContent('), 'la vue est encore là');
  assert.ok(!APP.includes("view === 'croquettes'"), 'sa route est encore là');
  assert.ok(!/'Croquettes': 'croquettes'/.test(APP), 'LABEL_VIEW la connaît encore');
  for (const [debut, fin] of [['const BUILT = new Set(', ']);'], ['const VUES_RENDUES = new Set(', ']);'],
    ['const VIEW_TITLES = {', '\n};'], ['const VIEW_HAKEYS = {', '\n  };']]) {
    const t = morceau(debut, fin);
    assert.ok(!t.includes('croquettes'), debut + ' la connaît encore');
  }
  assert.ok(!VIEW_IDS.includes('croquettes'), 'views.js la compte encore parmi les vues');
  assert.ok(!VUES.includes('out.croquettes'), 'views.js calcule encore sa disponibilité');
  const r = viewAvailability({ ready: true, caps: { has: {}, views: {} }, states: { 'input_number.bac': { state: '700' } },
    userCfg: { loggia_feeder: { haids: { reservoir: 'input_number.bac' } } } });
  assert.equal(r.croquettes, undefined, 'un distributeur configuré fait encore apparaître une vue à lui');
  assert.equal(r.objets.ok, true, 'le distributeur ouvre Objets, où vivent sa carte et sa fiche');
  assert.ok(!CSS.includes('grid-croqmeals') && !CSS.includes('croq-bubble') && !CSS.includes('croq-ring'), 'les styles de la vue sont restés');
  assert.ok(!lire('src', 'Onboarding.jsx').includes('croquettes:'), 'le premier lancement la liste encore');
});

test('« Distribuer » garde une seule portion : les boutons 2 et 3 portions sont partis avec la vue', () => {
  assert.ok(!APP.includes('[1, 2, 3].map(n =>') && !APP.includes('variables: { portions'), 'la distribution de plusieurs portions est restée');
  const fiche = morceau('function FicheDistributeur(', '\n}\n');
  assert.equal((fiche.match(/\{tr\('Distribuer'\)\}/g) || []).length, 1, 'un seul bouton « Distribuer » dans la fiche');
  assert.ok(fiche.includes('onClick={feed}'), 'il lance la ration de l’appareil, une portion');
});

test('une vue « croquettes » mémorisée, ou ?vue=croquettes, retombe sur l’Accueil', () => {
  const vueRendue = evaluer(morceau('const VUES_RENDUES = new Set(', "v.indexOf('cv:') === 0);"), {}, 'vueRendue');
  assert.equal(vueRendue('croquettes'), false, 'la vue mémorisée serait encore rendue');
  assert.equal(vueRendue('objets'), true);
  assert.equal(vueRendue('room:Salon'), true);
  // L'amorce pose `?vue=…` dans la session telle quelle : c'est la lecture
  // de la vue au premier rendu qui doit refuser une vue partie.
  assert.match(lire('src', 'main.jsx'), /sessionStorage\.setItem\('loggia-vue', vu\)/);
  const init = morceau('const [view, setView] = useState(() => {', '\n  });');
  const corps = init.slice(init.indexOf('{', init.indexOf('=>')) + 1, init.lastIndexOf('}'));
  const lireVue = (memo) => new Function('window', 'vueRendue', corps)({ sessionStorage: { getItem: () => memo } }, vueRendue);
  assert.equal(lireVue('croquettes'), 'accueil', 'un onglet qui avait mémorisé la vue s’ouvrirait sur un écran vide');
  assert.equal(lireVue('energie'), 'energie', 'une vue qui existe reste où elle était');
});

/* La fiche, rendue avec les vraies rangées, la vraie Bascule et le vrai filet. */
const FicheRangee = evaluer(morceau('function FicheRangee(', '\n}'), {}, 'FicheRangee');
const FicheValeur = evaluer(morceau('const FicheValeur = ', ');\n'), {}, 'FicheValeur');
const FicheBouton = evaluer(morceau('const FicheBouton = ', ');\n'), { Fi }, 'FicheBouton');
const CODE_FICHE = morceau('function FicheDistributeur(', '\n}\n');

function fiche({ states, demandes = null, grammes = 760 }) {
  const appels = [], interrupteurs = [], demandees = [];
  const portee = {
    tr, trN, useState, useOptimiste, enVol, joursDeReserve, FicheRangee, FicheValeur, FicheBouton,
    // Le filet réel, ou une table de demandes posée par le test et un `demander` qui note.
    useDemandes: demandes ? () => [demandes, (...a) => demandees.push(a)] : () => { const [ov, d] = useDemandes(); return [ov, (...a) => { demandees.push(a); d(...a); }]; },
    Bascule: (p) => { interrupteurs.push(p); return createElement(BasculeUi, p); },
    BottomSheet: ({ children }) => children(() => {}),
    FicheEntete: ({ titre, sous }) => createElement('header', null, titre + ' — ' + sous),
    FicheAppareil: () => null,
    commanderService: (...a) => { appels.push(a); return Promise.resolve(); },
  };
  const FicheDistributeur = evaluer(CODE_FICHE, portee, 'FicheDistributeur');
  const repas = [
    { id: 'matin', time: '07:30', label: 'Repas du matin', g: 45, auto: 'input_boolean.repas_matin' },
    { id: 'soir', time: '19:00', label: 'Repas du soir', g: 45, auto: 'automation.repas_soir' },
    { id: 'midi', time: '12:00', label: 'Midi', g: 0, auto: 'input_boolean.repas_absent' },
  ];
  const html = renderToStaticMarkup(createElement(FicheDistributeur, { hass: { states }, nom: 'Distributeur', pct: 40, grammes,
    dernier: null, ration: null, repas, portion: null, feed: () => {}, onRempli: null, ficheId: null, onClose: () => {} }));
  return { html, appels, interrupteurs, demandees };
}
const ETATS = {
  'input_boolean.repas_matin': { state: 'on', last_changed: '2026-10-04T06:00:00.000Z' },
  'automation.repas_soir': { state: 'off', last_changed: '2026-10-03T21:00:00.000Z' },
};
const switches = (html) => [...html.matchAll(/<button type="button" role="switch" aria-checked="(true|false)" aria-label="([^"]*)"/g)].map(m => [m[2], m[1] === 'true']);

test('la fiche liste chaque repas : heure, libellé, grammes, et son interrupteur', () => {
  const { html } = fiche({ states: ETATS });
  assert.ok(html.includes('Repas par jour'), 'l’en-tête de la liste');
  assert.ok(html.includes('1 actif'), 'combien de repas sont actifs');
  for (const t of ['07:30', 'Repas du matin · 45 g', '19:00', 'Repas du soir · 45 g', '12:00', '>Midi<']) assert.ok(html.includes(t), t);
  // Paramètres enregistre 0 pour des grammes laissés vides : rien à dire, pas « 0 g ».
  assert.ok(!html.includes('Midi ·'), 'un repas sans grammes affiche « 0 g »');
  assert.deepEqual(switches(html), [['Repas de 07:30', true], ['Repas de 19:00', false]],
    'un interrupteur par repas dont l’entité existe, qui dit son état et nomme son heure');
  assert.ok(html.includes('Indisponible'), 'une entité absente : pas d’interrupteur qui ne ferait rien');
  assert.match(html, /role="switch" aria-checked="true"[^>]*background:var\(--o-accent-fond\)/, 'actif = bleu plein');
});

test('basculer un repas commande SON entité, automatisation ou input_boolean, et pose la demande', () => {
  const { interrupteurs, appels, demandees } = fiche({ states: ETATS });
  interrupteurs[0].cb();
  interrupteurs[1].cb();
  assert.deepEqual(appels.map(a => a.slice(1)), [
    ['input_boolean.repas_matin', 'homeassistant', 'turn_off', { entity_id: 'input_boolean.repas_matin' }],
    ['automation.repas_soir', 'homeassistant', 'turn_on', { entity_id: 'automation.repas_soir' }],
  ], '`homeassistant.turn_on/off` : le service du domaine `automation` échoue sur un input_boolean');
  assert.deepEqual(demandees, [
    ['matin', false, ETATS['input_boolean.repas_matin'], true],
    ['soir', true, ETATS['automation.repas_soir'], false],
  ], 'une demande par repas, avec l’état de son entité au moment de l’appui');
});

test('l’interrupteur montre tout de suite ce qu’on a demandé, puis la réponse de HA', () => {
  const matin = ETATS['input_boolean.repas_matin'];
  const demandes = { matin: demandeCle(false, matin, undefined, true) };
  // En vol : HA n'a pas encore répondu, la ligne montre la demande.
  assert.deepEqual(switches(fiche({ states: ETATS, demandes }).html)[0], ['Repas de 07:30', false], 'l’appui ne se voit pas avant la réponse');
  assert.ok(fiche({ states: ETATS, demandes }).html.includes('0 actif'), 'le compte suit la demande');
  // HA répond (son last_changed bouge) : c'est lui qui a raison, même s'il a refusé.
  const refus = { ...ETATS, 'input_boolean.repas_matin': { state: 'on', last_changed: '2026-10-04T06:00:01.000Z' } };
  assert.deepEqual(switches(fiche({ states: refus, demandes }).html)[0], ['Repas de 07:30', true], 'un refus de HA resterait masqué');
  // La réponse d'un AUTRE repas ne jette pas cette demande.
  const autre = { ...ETATS, 'automation.repas_soir': { state: 'on', last_changed: '2026-10-04T06:00:01.000Z' } };
  assert.deepEqual(switches(fiche({ states: autre, demandes }).html), [['Repas de 07:30', false], ['Repas de 19:00', true]],
    'la réponse du soir a rendu au matin son état d’avant');
});

/* Relecture du 04/10. L'estimation du bac divisait par TOUS les repas de la
 * configuration : coupés depuis cette même fiche, ils comptaient encore —
 * « Environ 8 jours de réserve » au-dessus de « 0 actifs ». */
test('les jours de réserve ne comptent que les repas allumés, et suivent l’interrupteur', () => {
  // 760 g ; matin 45 g allumé, soir 45 g coupé, midi sans grammes : 45 g par jour.
  assert.ok(fiche({ states: ETATS }).html.includes('Environ 16 jours de réserve'), 'un repas coupé pèse encore dans la réserve : 760 g et un seul repas de 45 g font 16 jours, pas 8');
  const deux = { ...ETATS, 'automation.repas_soir': { state: 'on', last_changed: '2026-10-04T06:00:00.000Z' } };
  assert.ok(fiche({ states: deux }).html.includes('Environ 8 jours de réserve'), 'deux repas allumés : 760 / 90');
  // Le matin coupé à l'instant, HA n'a pas répondu : plus aucun repas qui pèse.
  const demandes = { matin: demandeCle(false, ETATS['input_boolean.repas_matin'], undefined, true) };
  const html = fiche({ states: ETATS, demandes }).html;
  assert.ok(html.includes('Ce qu’il reste dans le bac') && !html.includes('jours de réserve'), 'l’estimation ne suit pas l’interrupteur');
  // La fabrique ne divise plus : elle passe le bac, la fiche divise.
  assert.ok(!APP.includes('joursDeReserve(numDe(croq.reservoir'), 'la fabrique divise encore par tous les repas');
  assert.ok(APP.includes('<FicheDistributeur hass={hass} nom={tr(\'Distributeur de croquettes\')} pct={d.pct} grammes={d.grammes}'), 'la fiche ne reçoit pas le bac');
});

/* Relecture du 04/10. Sept mots n'étaient lus que par la vue partie ; ils
 * restaient traduits six fois. `tout_tr_traduit` ne pouvait pas les voir :
 * il cherche la clé comme SOUS-CHAÎNE, et chacun vit dans un texte plus long
 * (« Aucun repas programmé », « Baisser la consigne », `prochaineRation`…).
 * Ici on cherche la clé ENTRE GUILLEMETS, comme un appel ou une table l'écrit. */
test('les mots de la vue partie ont quitté les six catalogues, ceux qui servent encore y restent', async () => {
  const sources = (d) => readdirSync(d, { withFileTypes: true }).flatMap(f => f.isDirectory()
    ? (f.name === 'langues' ? [] : sources(join(d, f.name)))
    : /\.(js|jsx)$/.test(f.name) ? [readFileSync(join(d, f.name), 'utf8')] : []);
  const SRC = sources(join(RACINE, 'src')).join('\n');
  const cite = (k) => ["'" + k + "'", '"' + k + '"', '`' + k + '`'].some(q => SRC.includes(q));
  const cats = {};
  for (const l of ['en', 'de', 'nl', 'it', 'es', 'pl']) cats[l] = (await import(new URL('../src/langues/' + l + '.js', import.meta.url))).default;
  for (const k of ['passé', 'distribué', 'désactivé', 'programmé', 'hors programme', 'Ration', 'Baisser']) {
    assert.ok(!cite(k), '« ' + k + ' » est de nouveau appelé : sa clé doit revenir aux catalogues');
    for (const [l, c] of Object.entries(cats)) assert.ok(!Object.hasOwn(c, k), '« ' + k + ' » reste dans ' + l + '.js, et plus rien ne l’appelle');
  }
  for (const k of ['Monter', 'dans {h} h {m}', 'dans {n} min']) {
    assert.ok(cite(k), '« ' + k + ' » n’est plus appelé : à retirer aussi');
    for (const [l, c] of Object.entries(cats)) assert.ok(Object.hasOwn(c, k), '« ' + k + ' » a quitté ' + l + '.js alors qu’on l’appelle encore');
  }
});
