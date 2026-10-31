/* La tuile d'une pièce épargne les veilleuses (ADR 0261 ; A3, L2).
 *
 * `mains` — les lampes du bouton — ne contient plus les veilleuses de la règle
 * Nuit ni les groupes qui en contiennent une (`roomMainsOf`, App.jsx) : un
 * appui ne les allume ni ne les éteint, et l'état de la tuile ne les lit pas.
 * Une pièce qui n'a QUE sa veilleuse, allumée, est une tuile ÉTEINTE, sans
 * bouton. Le COMPTE, lui, dit toutes les lampes. Sous `?tuile_veilleuse`,
 * App.jsx exporte la tuile ; on la JOUE (tests/crochets.mjs). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { monter, horlogeFausse, documentFaux } from './crochets.mjs';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?tuile_veilleuse')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?tuile_veilleuse'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { PieceCard };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?tuile_veilleuse', import.meta.url).href);
const APP = MONOLITHE.replace(/\r\n/g, '\n');

async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });
  try { return await fn(); } finally { h.restaurer(); d.restaurer(); }
}
const { createElement } = await import('react');
const { Fi } = await import(new URL('../src/ui.jsx', import.meta.url).href);
// La teinte de la pièce : son liseré la prend quand la tuile est ALLUMÉE (`bordPiece`), le liseré commun sinon.
const piece = { name: 'Chambre', room: 'Chambre', status: { kind: 'calm', n: 0 }, live: null, tc: 'var(--o-accent)', rgb: '96,165,250', icon: createElement(Fi, { i: 'bed' }) };
const veilleuse = { id: 'light.veilleuse', on: true }, plafonnier = (on) => ({ id: 'light.chambre', on });
const fond = (m) => m.arbre.props.style.border;
const bascule = (m) => m.trouver(e => e.props && e.props.role === 'switch')[0];

for (const [nom, props] of [['compacte', { chip: true }], ['standard', { compact: true }]]) {
  test('A3 (' + nom + ') : la veilleuse seule allumée, la tuile est éteinte et sans bouton ; le compte dit la lampe', () => dans(() => {
    const seule = monter(F.PieceCard, { ...props, p: piece, lights: [veilleuse], mains: [], onToggleLights: () => {}, onOpen: null });
    const eteinte = monter(F.PieceCard, { ...props, p: piece, lights: [plafonnier(false)], mains: [plafonnier(false)], onToggleLights: () => {}, onOpen: null });
    const allumee = monter(F.PieceCard, { ...props, p: piece, lights: [plafonnier(true)], mains: [plafonnier(true)], onToggleLights: () => {}, onOpen: null });
    assert.equal(fond(seule), fond(eteinte), 'le liseré d’une tuile éteinte');
    assert.notEqual(fond(seule), fond(allumee));
    assert.equal(fond(allumee), 'var(--o-bw,1px) solid rgba(96,165,250,.26)', 'allumée, la tuile prend la teinte de sa pièce');
    assert.ok(!bascule(seule), 'rien à basculer : pas de bouton');
    assert.ok(bascule(allumee) && bascule(allumee).props['aria-checked'] === true);
    if (props.chip) assert.ok(seule.texte().includes('1 lumière'), 'le compte dit toutes les lampes, veilleuse comprise : ' + seule.texte());
  }));
}

test('A3 : la veilleuse et le plafonnier allumés, l’appui n’éteint que le plafonnier — la tuile suit le plafonnier', () => dans(() => {
  const appuis = [];
  const m = monter(F.PieceCard, { chip: true, p: piece, lights: [veilleuse, plafonnier(false)], mains: [plafonnier(false)], onToggleLights: () => appuis.push(1), onOpen: null });
  assert.equal(bascule(m).props['aria-checked'], false, 'le plafonnier est éteint : la tuile aussi, la veilleuse ne compte pas');
  m.appuyer(bascule(m));
  assert.deepEqual(appuis, [1]);
  assert.equal(bascule(m).props['aria-checked'], true, 'le geste d’abord');
  m.demonter();
}));

test('A3 : `roomMainsOf` retire les veilleuses, les switch déclarés signent la tuile, la règle Nuit est relue chaque minute', () => {
  const i = APP.indexOf('const roomMainsOf = (name) => {');
  const corps = APP.slice(i, APP.indexOf('\n  };', i));
  assert.ok(corps.includes("const sansVeilleuses = (liste) => (liste ? liste.filter(l => !estEpargnee(l.id, S, veilleuses)) : liste);"), 'une seule règle : `estEpargnee` (lumieres.js)');
  assert.ok(corps.includes('return sansVeilleuses(retenues.length ? retenues : toutes);') && corps.includes('if (!choisies.length) return sansVeilleuses(toutes);'), 'les deux chemins l’appliquent');
  assert.ok(APP.includes("const { etat: nuitEtat, codeErr: nuitCode } = useEtatServeur(dashHass, 'loggia/nuit/etat', 60000);") && APP.includes('const veilleuses = veilleusesLues(nuitEtat, nuitCode);'));
  const j = APP.indexOf('const lightsSig = useMemo(() => {');
  assert.ok(APP.slice(j, APP.indexOf('}, [dashHass]);', j)).includes("for (const id of switchLights()) { const e = S[id]; if (e) out += id + e.state + '|'; }"), 'un switch déclaré lumière qui bouge redessine la tuile');
  assert.ok(!APP.includes('« Ampoule »') && !APP.includes('plafonnier(s) SEULS'), 'les commentaires du filtre retiré sont partis');
});

/* TESTS AJOUTÉS (audit du 19/10, seconde tranche ; B15 — sa décision : les veilleuses sont épargnées PARTOUT). Tant que la règle
 * Nuit n'est pas lue (la première seconde d'un Accueil, ou un composant qui ne répond pas), on ne sait pas quelles lampes épargner :
 * l'interrupteur de la tuile est dessiné à sa place, grisé et inerte — il n'apparaît ni ne disparaît après coup —, et un appui ne
 * touche aucune lampe, ni ne bascule l'affichage. Le module Nuit ABSENT (`not_available`) lève l'attente : rien à épargner. */
for (const [nom, props] of [['compacte', { chip: true }], ['standard', { compact: true }]]) {
  test('B15 (' + nom + ') : veilleuses pas encore lues — l’interrupteur est là, grisé et inerte ; un appui ne fait rien', () => dans(() => {
    const appuis = [];
    const m = monter(F.PieceCard, { ...props, p: piece, lights: [plafonnier(true)], mains: [plafonnier(true)], onToggleLights: () => appuis.push(1), onOpen: null, attente: true });
    const b = bascule(m);
    assert.ok(b, 'le bouton est dessiné à sa place');
    assert.equal(b.props['aria-disabled'], true, 'grisé : il ne répond pas encore');
    assert.equal(b.props['aria-checked'], true, 'il dit l’état vrai');
    m.appuyer(b);
    assert.deepEqual(appuis, [], 'aucun ordre');
    assert.equal(bascule(m).props['aria-checked'], true, 'pas de geste d’abord non plus');
    // La règle lue : le même bouton répond.
    m.proprietes({ attente: false });
    assert.equal(bascule(m).props['aria-disabled'], undefined);
    m.appuyer(bascule(m));
    assert.deepEqual(appuis, [1]);
    m.demonter();
  }));
}

test('B15 : l’Accueil passe l’attente à la tuile (`veilleuses == null`), et `toggleRoomLights` ne commande rien tant que la règle n’est pas lue', () => {
  assert.ok(APP.includes('attente={veilleuses == null}'), 'la tuile sait qu’on attend la règle Nuit');
  const i = APP.indexOf('const toggleRoomLights = (name) => {');
  const corps = APP.slice(i, APP.indexOf('\n  };', i));
  assert.ok(corps.includes('if (veilleuses == null) return;'), 'rien ne part tant que les veilleuses ne sont pas connues : ' + corps);
});

