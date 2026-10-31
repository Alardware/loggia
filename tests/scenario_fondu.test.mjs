/* Fondu et blanc dans les scénarios (chantier G5, ADR 0304), à l'écran.
 *
 * Chaque action « lumières » prend un fondu FACULTATIF (Aucun · 3 s · 10 s · 1 min · 3 min) et, pour un allumage, un blanc
 * FACULTATIF (Aucun · Chaude · Neutre · Froide) : des puces, jamais un `<select>`, choisies en bleu plein. Elles n'apparaissent
 * que si une lampe visée sait le faire — le serveur le dit par portée (`lampes` de `loggia/scenarios/etat`). La fiche
 * enregistre ce qu'on a choisi, rien d'autre ; un scénario d'avant reste tel quel. On JOUE la fiche (tests/crochets.mjs). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

import { monter, parcourir, texteDe } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const FS = await import(new URL('../src/fichescenario.jsx', import.meta.url).href);
const { versEnregistrement } = await import('../src/scenarios.js');

const BRIQUES = { ChoixIcone: () => null, FicheRangee: () => null, RmBascule: () => null, boutonEdition: () => ({}), BOUTON_PETIT: {} };
const REVEIL = { id: 'reveil', integre: true, nom: null, icone: 'sunrise', teinte: 'ambre', lien: null, piece: null, accueil: true, masque: false, modifie: false,
  piece_effective: null, actions: [{ famille: 'volets', geste: 'ouvrir', portee: 'maison' }, { famille: 'lumieres', geste: 'allumer', portee: 'maison', valeur: 30, si: 'nuit', fondu: 180 }] };
const PARTOUT = { maison: { fondu: true, blanc: true }, vie: { fondu: true, blanc: true }, pieces: { Salon: { fondu: true, blanc: true }, Chambre: { fondu: false, blanc: false } } };

function fiche(props) {
  const envois = [];
  const m = monter(FS.default, { scenario: REVEIL, pieces: ['Chambre', 'Salon'], liens: [], onEnregistrer: (p) => { envois.push(p); return Promise.resolve(); },
    onClose: () => {}, briques: BRIQUES, ...props });
  const contenu = () => m.arbre.props.children(() => {});
  const boutons = () => { const out = []; parcourir(contenu(), e => { if (e.type === 'button') out.push(e); }); return out; };
  const puce = (texte, n = 0) => boutons().filter(b => texteDe(b) === texte)[n];
  const presser = (b) => { b.props.onClick({ stopPropagation() {}, preventDefault() {} }); m.rendre(); };
  return { m, envois, contenu, puce, presser, texte: () => texteDe(contenu()) };
}

test('les puces du fondu et du blanc : sous l’action lumières, le fondu choisi en bleu plein', () => {
  const f = fiche({ lampes: PARTOUT });
  assert.ok(f.texte().includes('Fondu') && f.texte().includes('Blanc'), f.texte());
  const trois = f.puce('3 min');
  assert.equal(trois.props['aria-pressed'], true, 'le Réveil monte en 3 min');
  assert.equal(trois.props.style.background, 'var(--o-accent-fond)');
  assert.equal(trois.props.style.color, '#fff');
  for (const t of ['Aucun', '3 s', '10 s', '1 min', '3 min']) assert.ok(f.puce(t), 'la puce « ' + t + ' »');
  for (const t of ['Chaude', 'Neutre', 'Froide']) assert.ok(f.puce(t), 'la puce « ' + t + ' »');
});

test('choisir un fondu et un blanc les enregistre ; « Aucun » les retire', async () => {
  const f = fiche({ lampes: PARTOUT });
  f.presser(f.puce('10 s'));
  f.presser(f.puce('Neutre'));
  f.presser(f.puce('Enregistrer'));
  await Promise.resolve();
  const lum = f.envois[0].enregistrer.actions.find(a => a.famille === 'lumieres');
  assert.deepEqual(lum, { famille: 'lumieres', geste: 'allumer', portee: 'maison', valeur: 30, si: 'nuit', fondu: 10, blanc: 4000 });
  const g = fiche({ lampes: PARTOUT });
  g.presser(g.puce('Aucun', 0));
  g.presser(g.puce('Enregistrer'));
  await Promise.resolve();
  assert.ok(!('fondu' in g.envois[0].enregistrer.actions[1]), 'plus de fondu');
});

test('les puces n’apparaissent que si une lampe visée sait le faire', () => {
  // Un serveur d'avant ne dit rien : pas de puce.
  assert.ok(!fiche({ lampes: null, scenario: { ...REVEIL, actions: [{ famille: 'lumieres', geste: 'allumer', portee: 'maison' }] } }).texte().includes('Fondu'));
  // La chambre n'a qu'un variateur : ni fondu ni blanc.
  const chambre = fiche({ lampes: PARTOUT, scenario: { ...REVEIL, actions: [{ famille: 'lumieres', geste: 'allumer', portee: 'piece', piece: 'Chambre' }] } });
  assert.ok(!chambre.texte().includes('Fondu') && !chambre.texte().includes('Blanc'), chambre.texte());
  // Une extinction prend un fondu, jamais un blanc.
  const nuit = fiche({ lampes: PARTOUT, scenario: { ...REVEIL, actions: [{ famille: 'lumieres', geste: 'eteindre', portee: 'maison', fondu: 10 }] } });
  assert.ok(nuit.texte().includes('Fondu') && !nuit.puce('Neutre'), nuit.texte());
  // Un fondu déjà réglé reste visible pour qu'on puisse le retirer, même si la lampe est partie.
  const partie = fiche({ lampes: { maison: { fondu: false, blanc: false }, vie: {}, pieces: {} } });
  assert.equal(partie.puce('3 min').props['aria-pressed'], true);
});

test('ce que la fiche enregistre : le fondu et le blanc des lumières, rien ailleurs, rien de vide', () => {
  const doc = versEnregistrement({ nom: 'X', actions: [
    { famille: 'lumieres', geste: 'allumer', portee: 'maison', fondu: 60, blanc: 6500 },
    { famille: 'lumieres', geste: 'eteindre', portee: 'maison', fondu: 3, blanc: 2200 },
    { famille: 'lumieres', geste: 'allumer', portee: 'maison', fondu: null, blanc: 0 },
    { famille: 'volets', geste: 'fermer', portee: 'maison', fondu: 10 },
  ] });
  assert.deepEqual(doc.actions, [
    { famille: 'lumieres', geste: 'allumer', portee: 'maison', fondu: 60, blanc: 6500 },
    { famille: 'lumieres', geste: 'eteindre', portee: 'maison', fondu: 3 },
    { famille: 'lumieres', geste: 'allumer', portee: 'maison' },
    { famille: 'volets', geste: 'fermer', portee: 'maison' },
  ]);
});

test('la démo dit ce que ses lampes savent faire, et porte les fondus des scénarios de Loggia', async () => {
  const D = await import('../src/demo.js');
  const m = D.maisonLumieresDemo();
  const scn = m.scenarios();
  const lum = (id) => scn.find(s => s.id === id).actions.find(a => a.famille === 'lumieres');
  assert.equal(lum('nuit').fondu, 10);
  assert.equal(lum('tout_eteindre').fondu, undefined);
  const etat = m.etatScenarios();
  assert.deepEqual(etat.lampes.maison, { fondu: true, blanc: true });
  assert.equal(etat.lampes.pieces[Object.keys(etat.lampes.pieces).find(p => /chambre/i.test(p))].fondu, true, 'le ruban de la chambre sait fondre');
});

/* TEST AJOUTÉ (31/10, G5, sa règle « Puces choisies en bleu plein », SANS EXCEPTION) : toute puce choisie de la fiche d'un
 * scénario — teinte, nature, gestes, portées, moments, fondu, blanc — est en `--o-accent-fond`, texte blanc ; la teinte du
 * scénario n'est plus jamais le fond d'une puce, elle reste en petit repère (le point de chaque puce de teinte). */
test('toutes les puces choisies de la fiche sont en bleu plein ; la teinte reste un point', () => {
  const f = fiche({ lampes: PARTOUT });
  const choisies = [];
  parcourir(f.contenu(), e => { if (e.type === 'button' && e.props['aria-pressed'] === true) choisies.push(e); });
  assert.ok(choisies.length >= 9, 'teinte, nature, deux gestes, deux portées, deux moments, fondu, blanc : ' + choisies.length);
  for (const b of choisies) {
    assert.equal(b.props.style.background, 'var(--o-accent-fond)', texteDe(b) + ' : fond');
    assert.equal(b.props.style.color, '#fff', texteDe(b) + ' : texte');
  }
  const ambre = choisies.find(b => texteDe(b) === 'Ambre');
  const point = []; parcourir(ambre, e => { if (e.type === 'span' && e.props['aria-hidden'] === 'true') point.push(e); });
  assert.equal(point[0].props.style.background, 'var(--o-piece-ambre)', 'la teinte, en petit repère');
  // Pas choisie : le fond de la fiche, jamais la teinte du scénario.
  const libre = f.puce('Pièces de vie');
  assert.equal(libre.props['aria-pressed'], false);
  assert.equal(libre.props.style.background, 'var(--o-s1)');
});
