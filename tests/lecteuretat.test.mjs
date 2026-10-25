/* Ce que les cartes d'un lecteur partagent (chantier Médias, tâche 2 ; M8, M9) : le magasin des annonces en vol, et le crochet
 * de la teinte d'une pochette — joués par le harnais des crochets (tests/crochets.mjs). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';

import { monter, horlogeFausse } from './crochets.mjs';

const E = await import('../src/lecteuretat.js');
const { oublierTeintes } = await import('../src/pochette.js');

test('M9 : une annonce envoyée se lit six secondes sur les lecteurs visés, puis s’efface ; les cartes se redessinent', () => {
  const h = horlogeFausse();
  h.installer();
  try {
    E.reglerLecteurs();
    const t0 = 1_000_000;
    E.annoncer(['media_player.a', 'media_player.b'], '  À table !  ', t0);
    assert.equal(E.annonceDe('media_player.a', t0), 'À table !', 'rognée');
    assert.equal(E.annonceDe('media_player.b', t0 + 5999), 'À table !');
    assert.equal(E.annonceDe('media_player.c', t0), null, 'une carte non visée ne dit rien');
    assert.equal(E.annonceDe('media_player.a', t0 + E.ANNONCE_MS), null, 'six secondes, pas une de plus');
    // Un composant abonné se redessine quand une annonce se pose, et quand elle expire.
    const rendus = [];
    const Temoin = () => { const v = E.useAnnonces(); rendus.push(v); return createElement('span', null, String(v)); };
    const m = monter(Temoin);
    const avant = rendus.length;
    E.annoncer(['media_player.a'], 'On part', Date.now());
    m.rendre();
    assert.ok(rendus.length > avant && rendus.at(-1) !== rendus[0], 'la version a bougé : la carte se redessine');
    // À l'échéance, le magasin se vide de lui-même.
    h.avancer(E.ANNONCE_MS + 100);
    assert.equal(E.annonceDe('media_player.a', Date.now() + E.ANNONCE_MS * 2), null);
    E.annoncer([], 'rien', t0);
    E.annoncer(['media_player.z'], '   ', t0);
    assert.equal(E.annonceDe('media_player.z', t0), null, 'ni sans cible, ni sans texte');
    m.demonter();
  } finally { h.restaurer(); E.reglerLecteurs(); }
});

test('M8 : le crochet de la teinte — le rose de la maison tant que la pochette n’est pas lue, sa teinte ensuite, rien sans pochette', async () => {
  oublierTeintes();
  const Temoin = ({ url, cle }) => createElement('i', { 'data-teinte': E.useTeintePochette(url, cle) || 'aucune' });
  const sans = monter(Temoin, { url: null, cle: null });
  assert.equal(sans.arbre.props['data-teinte'], 'aucune', 'sans pochette, la carte ne se teinte pas');
  // Hors navigateur, la pochette ne se lit pas : le rose de la maison, et il reste.
  const avec = monter(Temoin, { url: '/api/media_player_proxy/x', cle: 'Clair de Lune|Debussy' });
  assert.equal(avec.arbre.props['data-teinte'], 'var(--o-rose-rgb)', 'en attendant la lecture : le rose');
  await new Promise(r => setTimeout(r, 10));
  avec.rendre();
  assert.equal(avec.arbre.props['data-teinte'], 'var(--o-rose-rgb)', 'lue et vide (canvas souillé, pas de navigateur) : le rose');
  avec.proprietes({ url: null, cle: null });
  assert.equal(avec.arbre.props['data-teinte'], 'aucune', 'la pochette partie, la teinte aussi');
  sans.demonter(); avec.demonter();
});

test('passe bis, M8 : la teinte ne clignote pas — une clé déjà lue se rend sans attendre, et la dernière teinte connue reste le temps de lire la suivante', async () => {
  oublierTeintes();
  const { teintePochette, rgbTexte } = await import('../src/pochette.js');
  // Une pochette unie, lue dans le cache par un chargeur de test : sa teinte n'est pas le rose.
  const pixels = new Uint8ClampedArray(40 * 40 * 4);
  for (let i = 0; i < pixels.length; i += 4) { pixels[i] = 30; pixels[i + 1] = 90; pixels[i + 2] = 200; pixels[i + 3] = 255; }
  const bleue = rgbTexte(await teintePochette('/api/media_player_proxy/a?token=1', 'Ruinas|Metal_Chaos', { charger: () => Promise.resolve(pixels) }));
  assert.notEqual(bleue, 'var(--o-rose-rgb)');
  const Temoin = ({ url, cle }) => createElement('i', { 'data-teinte': E.useTeintePochette(url, cle) || 'aucune' });
  const m = monter(Temoin, { url: '/api/media_player_proxy/a?token=2', cle: 'Ruinas|Metal_Chaos' });
  assert.equal(m.arbre.props['data-teinte'], bleue, 'une clé déjà lue : sa teinte dès le premier rendu, jamais le rose');
  // Le morceau suivant, pas encore lu : la teinte d'avant reste — pas le rose.
  m.proprietes({ url: '/api/media_player_proxy/b?token=3', cle: 'Templo|Metal_Chaos' });
  assert.equal(m.arbre.props['data-teinte'], bleue, 'en attendant la lecture : la dernière teinte connue');
  await new Promise(r => setTimeout(r, 10));
  m.rendre();
  assert.equal(m.arbre.props['data-teinte'], 'var(--o-rose-rgb)', 'lue et vide (pas de navigateur) : le rose');
  // Retour au premier : sans attendre.
  m.proprietes({ url: '/api/media_player_proxy/a?token=4', cle: 'Ruinas|Metal_Chaos' });
  assert.equal(m.arbre.props['data-teinte'], bleue);
  m.demonter();
});
