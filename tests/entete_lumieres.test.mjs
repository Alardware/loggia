/* L'en-tête d'Objets › Lumières (chantier Lumières, § 3.4 ; L2, ADR 0199).
 *
 * « 3 allumées sur 6 », ou « Toutes éteintes », au pluriel de chaque langue ;
 * à droite, « Tout éteindre », seulement si une lampe hors veilleuse est
 * allumée. Il éteint les lampes allumées de la famille, sauf les veilleuses de
 * la règle Nuit, par `turn_off` — jamais `toggle` —, et les cartes le montrent
 * tout de suite. Tant que la règle Nuit n'est pas lue, on ne sait pas quelles
 * lampes épargner : la puce attend. Un module à part, chargé à la première
 * ouverture du filtre, qui reçoit un `hass` VIVANT d'App.jsx. On le REND
 * (react-dom/server) et on le JOUE (tests/crochets.mjs). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { monter, horlogeFausse, documentFaux } from './crochets.mjs';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
// ui.jsx arme une image dès son chargement : Node n'a pas `requestAnimationFrame`.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const E = await import(new URL('../src/entetelumieres.jsx', import.meta.url).href);
const L = await import('../src/lumieresetat.js');
const { setLoggiaState } = await import('../src/state.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = MONOLITHE, CSS = lire('src/index.css');

const st = (id, state) => [id, { entity_id: id, state, last_changed: '2026-10-14T18:00:00.000Z', last_updated: '2026-10-14T18:00:00.000Z', attributes: { supported_color_modes: ['brightness'] } }];
const S = Object.fromEntries([st('light.bureau', 'on'), st('light.ampoule', 'on'), st('light.veilleuse', 'on'), st('light.chambre', 'off'), st('light.morte', 'unavailable'), st('switch.applique', 'on')]);
const IDS = ['light.bureau', 'light.ampoule', 'light.veilleuse', 'light.chambre', 'light.morte', 'switch.applique'];
const NUIT = { config: { veilleuse: { actif: true, lampes: ['light.veilleuse'], duree: 60, fondu: 5 } } };
const html = (ids = IDS) => renderToStaticMarkup(createElement(E.default, { hass: { states: S }, titre: 'Lumières', ids }));

function poser(etats = S) {
  setLoggiaState({ index: null, ent: { switchLights: ['switch.applique'] }, cfg: {}, resolved: null });
  L.reglerLumieresEtat({ hass: { callWS: () => new Promise(() => {}) }, horloge: { repeter: () => 0, arreter() {}, plusTard: () => 0, annuler() {}, maintenant: () => Date.now() } });
  const appels = [];
  const hass = { states: JSON.parse(JSON.stringify(etats)), callWS: (m) => Promise.resolve(m.type === 'loggia/nuit/etat' ? NUIT : {}),
    callService: (d, s, data, cible) => { appels.push(d + '.' + s + ' ' + ((cible && cible.entity_id) || (data && data.entity_id))); return Promise.resolve(); } };
  return { appels, hass };
}
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  try { return await fn(d); } finally { h.restaurer(); d.restaurer(); }
}
const attendre = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('le compte : les allumées sur toutes — une muette compte dans le total, jamais parmi les allumées', () => {
  poser();
  assert.deepEqual(E.compteLumieres(IDS, S), { allumees: 4, total: 6 });
  assert.deepEqual(E.compteLumieres(['light.chambre', 'light.morte'], S), { allumees: 0, total: 2 });
  assert.deepEqual(E.compteLumieres([], S), { allumees: 0, total: 0 });
});

test('L2 : « Tout éteindre » épargne les veilleuses de la règle Nuit ; tant qu’elle n’est pas lue, il n’éteint rien', () => {
  poser();
  assert.deepEqual(E.veilleusesDe(NUIT), ['light.veilleuse']);
  assert.deepEqual(E.veilleusesDe({ config: { veilleuse: { lampes: ['light.veilleuse', 3, null] } } }), ['light.veilleuse'], 'une configuration abîmée : les noms seuls');
  assert.deepEqual(E.veilleusesDe({ config: {} }), [], 'une règle Nuit sans veilleuse : rien à épargner');
  assert.equal(E.veilleusesDe(null), null, 'pas encore lue');
  assert.deepEqual(E.aEteindre(IDS, S, ['light.veilleuse']), ['light.bureau', 'light.ampoule', 'switch.applique'], 'ni la veilleuse, ni l’éteinte, ni la muette');
  assert.deepEqual(E.aEteindre(IDS, S, null), [], 'les veilleuses inconnues : on ne risque pas d’en éteindre une');
  assert.deepEqual(E.aEteindre(['light.veilleuse', 'light.chambre'], S, ['light.veilleuse']), [], 'seule une veilleuse est allumée : rien à éteindre');
});

test('L2 : un appui éteint par `turn_off` — jamais `toggle` — et les cartes comme le compte le montrent tout de suite', () => {
  const w = poser();
  const maintenant = Date.parse('2026-10-14T18:40:00.000Z');
  assert.deepEqual(E.toutEteindre(w.hass, ['light.bureau', 'switch.applique'], maintenant), ['light.bureau', 'switch.applique']);
  assert.deepEqual(w.appels, ['light.turn_off light.bureau', 'switch.turn_off switch.applique'], 'un switch-lumière : le moteur d’actions envoie `switch.turn_off`');
  assert.equal(L.avanceDe('light.bureau', w.hass.states['light.bureau'], maintenant + 500), false, 'la carte dit « Éteinte » avant la réponse de la lampe');
  assert.deepEqual(E.compteLumieres(IDS, w.hass.states, maintenant + 500), { allumees: 2, total: 6 }, 'le compte aussi');
  assert.deepEqual(E.compteLumieres(IDS, w.hass.states, maintenant + 7000), { allumees: 4, total: 6 }, 'l’avance expire : la maison a le dernier mot');
});

test('§ 3.4 : « 4 allumées sur 6 », ou « Toutes éteintes » ; la rangée et le compte portent leurs classes ; pas de puce avant la règle Nuit', () => {
  poser();
  const h = html();
  assert.ok(h.startsWith('<div class="o-lumieres-entete"><h2 style="margin:0;font-family:var(--o-serif, Newsreader, serif);font-style:italic;font-size:19px;font-weight:400;color:var(--o-text2)">Lumières</h2>'), 'le titre du filtre');
  assert.ok(h.includes('<span class="o-lumieres-compte" tabindex="-1" style="font-size:12px;font-weight:600;color:var(--o-text3)">4 allumées sur 6</span>'));
  assert.ok(html(['light.bureau']).includes('>1 allumée sur 1<'), 'le singulier');
  assert.ok(html(['light.chambre', 'light.morte']).includes('>Toutes éteintes<'));
  assert.ok(!h.includes('<button'), 'la règle Nuit pas encore lue : pas de puce');
});

test('L2 : la règle Nuit lue, la puce paraît ; un appui éteint tout sauf la veilleuse, et la puce s’en va', () => dans(async () => {
  const w = poser();
  const m = monter(E.default, { hass: w.hass, titre: 'Lumières', ids: IDS });
  assert.equal(m.trouver(e => e.type === 'button').length, 0);
  await attendre();
  m.rendre();
  const puce = m.trouver(e => e.type === 'button')[0];
  assert.ok(puce && puce.props['aria-label'] === 'Tout éteindre' && puce.props.type === 'button');
  assert.ok(m.texte().includes('Tout éteindre'), 'le mot, que le téléphone efface (index.css)');
  m.appuyer(puce);
  assert.deepEqual(w.appels, ['light.turn_off light.bureau', 'light.turn_off light.ampoule', 'switch.turn_off switch.applique']);
  m.rendre();
  assert.ok(m.texte().includes('1 allumée sur 6'), 'la veilleuse seule reste allumée');
  assert.equal(m.trouver(e => e.type === 'button').length, 0, 'plus rien à éteindre : la puce s’en va');
  m.demonter();
}));

test('L2 : la règle Nuit illisible, la puce ne paraît pas — une veilleuse inconnue est gardée', () => dans(async () => {
  const w = poser();
  w.hass.callWS = () => Promise.reject({ code: 'unknown_command' });
  const m = monter(E.default, { hass: w.hass, titre: 'Lumières', ids: IDS });
  await attendre();
  m.rendre();
  assert.equal(m.trouver(e => e.type === 'button').length, 0);
  assert.ok(m.texte().includes('4 allumées sur 6'), 'le compte, lui, se lit');
  m.demonter();
}));

/* A5 (ADR 0261) : le module Nuit absent — `not_available` —, aucune veilleuse ne peut exister : la puce paraît, rien n'est épargné.
 * Toute autre erreur (une commande inconnue, une coupure) : on ne sait pas quelles veilleuses épargner, la puce reste cachée. */
test('A5 : le module Nuit absent (`not_available`), la puce paraît et éteint tout — il n’existe aucune veilleuse à épargner', () => dans(async () => {
  const w = poser();
  w.hass.callWS = () => Promise.reject({ code: 'not_available', message: 'regles de nuit indisponibles' });
  const m = monter(E.default, { hass: w.hass, titre: 'Lumières', ids: IDS });
  await attendre();
  m.rendre();
  const puce = m.trouver(e => e.type === 'button')[0];
  assert.ok(puce && puce.props['aria-label'] === 'Tout éteindre', 'la puce est là');
  m.appuyer(puce);
  assert.deepEqual(w.appels, ['light.turn_off light.bureau', 'light.turn_off light.ampoule', 'light.turn_off light.veilleuse', 'switch.turn_off switch.applique'], 'tout ce qui est allumé, « veilleuse » comprise : ce nom n’est pas une veilleuse de la règle');
  m.demonter();
}));

test('A5 : une coupure sans code, la puce reste cachée — une veilleuse inconnue est gardée', () => dans(async () => {
  const w = poser();
  w.hass.callWS = () => Promise.reject(new Error('coupé'));
  const m = monter(E.default, { hass: w.hass, titre: 'Lumières', ids: IDS });
  await attendre();
  m.rendre();
  assert.equal(m.trouver(e => e.type === 'button').length, 0);
  m.demonter();
}));

test('la puce partie sous le doigt, le focus va au compte — il ne tombe pas sur la page', () => dans(async (d) => {
  const w = poser();
  const m = monter(E.default, { hass: w.hass, titre: 'Lumières', ids: IDS });
  await attendre();
  m.rendre();
  const puce = m.trouver(e => e.type === 'button')[0];
  const compte = m.trouver(e => e.props && e.props.className === 'o-lumieres-compte')[0];
  let focus = 0;
  compte.ref.current = { focus: () => { focus += 1; } };
  const noeud = {};
  puce.ref(noeud);
  globalThis.document.activeElement = noeud;
  puce.ref(null);
  await attendre();
  assert.equal(focus, 1, 'le compte reçoit le focus');
  globalThis.document.activeElement = null;
  puce.ref(noeud);
  puce.ref(null);
  await attendre();
  assert.equal(focus, 1, 'la puce n’avait pas le focus : on ne le déplace pas');
  assert.ok(d, 'le document factice');
  m.demonter();
}));

test('§ 10 : le compte au pluriel de chaque langue — le polonais a ses trois formes', async () => {
  for (const code of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const cat = (await import('../src/langues/' + code + '.js')).default;
    for (const k of ['{n} allumée sur {t}', '{n} allumées sur {t}', 'Toutes éteintes', 'Tout éteindre']) assert.ok(cat[k], code + ' : ' + k);
    for (const k of ['{n} allumée sur {t}', '{n} allumées sur {t}']) {
      const f = cat[k];
      const formes = typeof f === 'string' ? [f] : Object.values(f);
      assert.ok(formes.every(x => x.includes('{n}') && x.includes('{t}')), code + ' : ' + k + ' garde {n} et {t}');
    }
  }
  assert.deepEqual(Object.keys((await import('../src/langues/pl.js')).default['{n} allumées sur {t}']), ['few', 'many', 'other']);
});

test('§ 3.4 : un module à la demande, un hass vivant, un repli de la même hauteur ; au téléphone, la puce garde son icône', () => {
  assert.ok(APP.includes("const EnteteLumieres = lazyRecharge(() => import('./entetelumieres.jsx'));"), 'le démarrage n’a pas de place à lui donner');
  assert.ok(APP.includes("const idsLumieres = actuel === 'lumieres' ? visibles.filter(o => o.id).map(o => o.id) : [];"), 'les lampes visibles sous le filtre');
  assert.ok(APP.includes('<EnteteLumieresVive hass={hass} titre={titreFiltre} ids={idsLumieres} />') && !APP.includes('<EnteteLumieres hass={hass}'), 'l’en-tête reçoit le hass vivant');
  const i = APP.indexOf('function EnteteLumieresVive(');
  const vive = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.ok(vive.includes('const vivant = useHass(ids);') && vive.includes('<EnteteLumieres hass={vivant || hass} titre={titre} ids={ids} />'));
  const d = APP.indexOf("actuel === 'lumieres' ? (");
  const bloc = APP.slice(d, APP.indexOf('</Suspense>', d));
  assert.ok(bloc.includes('fallback={<div className="o-lumieres-entete">') && bloc.includes('{titreFiltre}</h2>'), 'le repli : la rangée et son titre');
  assert.ok(bloc.includes('<span className="o-lumieres-compte" aria-hidden="true" style={{ fontSize: 12, fontWeight: 600 }}>{\'\\u00a0\'}</span>'), 'un compte VIDE à la même police');
  assert.ok(CSS.includes('.o-lumieres-entete { display: flex; align-items: center; gap: 12px; min-height: 40px; }'), '40 px, la hauteur de la puce, qu’elle soit là ou non');
  assert.ok(CSS.includes('.o-lumieres-compte { flex: 1 1 0; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }'), 'UNE ligne');
  assert.ok(CSS.includes('@media (max-width: 560px) { .o-lumieres-tout-mot { display: none; } }'), 'au téléphone, l’icône seule — le seuil des puces des volets');
});

/* ── Passe de finition 9 bis B ─────────────────────────────────────────────────── */

/* Un groupe de lumières de Home Assistant : un `light.*` dont `attributes.entity_id` liste ses membres. */
const groupe = (id, membres, state = 'on') => [id, { ...st(id, state)[1], attributes: { supported_color_modes: ['brightness'], entity_id: membres } }];
const AVEC_GROUPES = { ...S, ...Object.fromEntries([
  groupe('light.groupe_chambre', ['light.ampoule', 'light.veilleuse']),     // contient la veilleuse
  groupe('light.groupe_salon', ['light.bureau', 'light.ampoule']),          // n'en contient pas
  groupe('light.tout', ['light.groupe_chambre', 'light.chambre']),          // un groupe de groupes : la veilleuse est à deux étages
  groupe('light.boucle_a', ['light.boucle_b']), groupe('light.boucle_b', ['light.boucle_a']),   // une configuration en boucle ne fige pas l'écran
]) };
const IDS_GROUPES = [...IDS, 'light.groupe_chambre', 'light.groupe_salon', 'light.tout', 'light.boucle_a', 'light.boucle_b'];

test('point 14 : un groupe de lumières qui contient une veilleuse est écarté de « Tout éteindre » — son `light.turn_off` l’éteindrait aussi (L2)', () => {
  poser();
  const cibles = E.aEteindre(IDS_GROUPES, AVEC_GROUPES, ['light.veilleuse']);
  assert.ok(!cibles.includes('light.groupe_chambre'), 'le groupe qui contient la veilleuse reste allumé');
  assert.ok(!cibles.includes('light.tout'), 'un groupe de groupes aussi : la veilleuse est à deux étages');
  assert.deepEqual(cibles, ['light.bureau', 'light.ampoule', 'switch.applique', 'light.groupe_salon', 'light.boucle_a', 'light.boucle_b'],
    'les lampes, et les groupes sans veilleuse, s’éteignent comme avant ; une boucle ne fige rien');
  assert.deepEqual(E.aEteindre(IDS_GROUPES, AVEC_GROUPES, []), IDS_GROUPES.filter(id => AVEC_GROUPES[id].state === 'on'), 'sans veilleuse déclarée, aucun groupe n’est écarté');
  assert.deepEqual(E.aEteindre(['light.groupe_chambre'], AVEC_GROUPES, ['light.veilleuse']), [], 'seul un groupe de la veilleuse est allumé : rien à éteindre');
  // Le compte ne change pas : un groupe est une lampe pour l'écran, allumée ou non.
  assert.equal(E.compteLumieres(IDS_GROUPES, AVEC_GROUPES).total, IDS_GROUPES.length);
});

test('point 14 : la puce n’envoie jamais `turn_off` à un groupe de la veilleuse — et s’il ne reste que lui, elle ne paraît pas', () => dans(async () => {
  const w = poser(AVEC_GROUPES);
  const m = monter(E.default, { hass: w.hass, titre: 'Lumières', ids: IDS_GROUPES });
  await attendre();
  m.rendre();
  m.appuyer(m.trouver(e => e.type === 'button')[0]);
  assert.ok(w.appels.includes('light.turn_off light.groupe_salon') && w.appels.includes('light.turn_off light.bureau'), 'le groupe sans veilleuse est éteint : ' + w.appels.join(' | '));
  assert.ok(!w.appels.some(a => /groupe_chambre|light\.tout|veilleuse/.test(a)), 'ni le groupe de la veilleuse, ni le groupe de groupes, ni elle : ' + w.appels.join(' | '));
  m.demonter();
  // Il ne reste d'allumé que la veilleuse et le groupe qui la contient : rien à éteindre, donc pas de puce.
  const seul = poser(AVEC_GROUPES);
  const n = monter(E.default, { hass: seul.hass, titre: 'Lumières', ids: ['light.veilleuse', 'light.groupe_chambre', 'light.tout', 'light.chambre'] });
  await attendre();
  n.rendre();
  assert.equal(n.trouver(e => e.type === 'button').length, 0);
  assert.ok(n.texte().includes('3 allumées sur 4'), 'le compte, lui, les compte');
  n.demonter();
}));
