/* Objets › Multimédia : un appareil, une carte (chantier Médias, tâche 8 ; M1 B, M14).
 *
 * Les lecteurs d'Objets sont ceux de `medPlayers()` (resolve.js) : la carte d'une Echo exposée deux fois est celle de
 * l'officielle, sa jumelle HACS ne fait pas de seconde carte ; Spotify (un appareil de service) et le haut-parleur d'une
 * sonnette (l'appareil d'une caméra) n'entrent pas. `objetsDeLaMaison` vit dans App.jsx, qui n'exporte que l'application :
 * sous `?objets_medias`, un crochet de chargement lui ajoute un export — le patron de tests/lumieres_objets.test.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

import { alexaHome, ctxOf, entity, state, states } from './fixtures.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });

const SUFFIXE = '?objets_medias';
let chargement = null;
function app() {
  if (!chargement) {
    chargement = (async () => {
      if (typeof globalThis.requestAnimationFrame !== 'function') {
        globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
        globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
      }
      register('./jsx-hooks.mjs', import.meta.url);
      register('data:text/javascript,' + encodeURIComponent([
        'export async function load(url, ctx, next) {',
        `  if (!url.endsWith('/src/App.jsx${SUFFIXE}')) return next(url, ctx);`,
        `  const r = await next(url.slice(0, -${SUFFIXE.length}), ctx);`,
        "  return { ...r, source: String(r.source) + ';export { objetsDeLaMaison };' };",
        '}',
      ].join('\n')));
      const { setLoggiaState } = await import('../src/state.js');
      const { resolveMedia } = await import('../src/resolve.js');
      const mod = await import(new URL('../src/App.jsx' + SUFFIXE, import.meta.url).href);
      return { setLoggiaState, resolveMedia, ...mod };
    })();
  }
  return chargement;
}

async function avecMaison(fx, f) {
  const a = await app();
  const ctx = ctxOf(fx, {});
  a.setLoggiaState({ index: ctx.index, ent: {}, cfg: {}, resolved: { media: a.resolveMedia(ctx) } });
  try {
    return await f(a, ctx);
  } finally {
    a.setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });
  }
}

test('M1 B : Objets › Multimédia — une carte par appareil : l’officielle de l’Echo Dot (sa jumelle HACS prise avec elle), Partout, l’Apple TV, l’Echo du bureau ; ni Spotify, ni la sonnette', async () => {
  const fx = alexaHome();
  await avecMaison(fx, ({ objetsDeLaMaison }) => {
    const objets = objetsDeLaMaison({ states: fx.states }, [], new Set());
    const medias = objets.filter(o => o.filtres.includes('multimedia')).map(o => o.cle).sort();
    assert.deepEqual(medias, ['media_player.apple_tv_salon', 'media_player.bureau_echo_dot', 'media_player.chambre_lino_echo_dot', 'media_player.partout'],
      'quatre cartes pour sept entités `media_player`');
    for (const id of ['media_player.echo_dot_chambre_lino', 'media_player.spotify_demo', 'media_player.sonnette_entree_haut_parleur']) {
      assert.ok(!objets.some(o => o.cle === id || o.id === id), id + ' : ni sous Multimédia, ni ailleurs');
    }
    // La carte porte le nom de la résolution, et elle est active quand l'entité principale joue.
    const dot = objets.find(o => o.cle === 'media_player.chambre_lino_echo_dot');
    assert.deepEqual([dot.nom, dot.actif, dot.absent, dot.piece], ['Echo Dot - Chambre Lino', true, false, 'Chambre de Lino']);
    const bureau = objets.find(o => o.cle === 'media_player.bureau_echo_dot');
    assert.deepEqual([bureau.actif, bureau.absent], [false, true], 'indisponible : absente, inactive');
  });
});

test('M14 : les autres entités de l’appareil de la jumelle ne font pas de carte non plus — l’appareil est représenté par le lecteur', async () => {
  const fx = alexaHome();
  // Un capteur sur l'appareil HACS : pris avec la jumelle, comme le capteur de l'officielle est pris avec sa carte.
  fx.entities.push(entity('sensor.echo_dot_chambre_lino_volume', { device: 'd_dot_hacs', area: 'chambre_lino', platform: 'alexa_media' }));
  Object.assign(fx.states, states(state('sensor.echo_dot_chambre_lino_volume', '30', { friendly_name: 'Echo Dot Chambre Lino Volume', device_class: 'sound_pressure', unit_of_measurement: 'dB' })));
  await avecMaison(fx, ({ objetsDeLaMaison }) => {
    const objets = objetsDeLaMaison({ states: fx.states }, [], new Set());
    assert.ok(!objets.some(o => o.id === 'sensor.echo_dot_chambre_lino_volume'), 'le capteur de la jumelle ne revient pas en carte');
    assert.equal(objets.filter(o => o.filtres.includes('multimedia')).length, 4);
  });
});
