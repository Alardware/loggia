/* L'en-tête d'Objets › Multimédia (chantier Médias, tâche 8 ; § 6.4 ; M14, M15).
 *
 * « 2 en lecture sur 4 », ou « Rien en lecture », au pluriel de chaque langue ; pas de puce d'action — la maquette n'en a pas. Un
 * lecteur se lit avec son jumeau : la paire de l'Echo Dot compte une fois, et c'est la jumelle HACS qui dit qu'elle joue ; un
 * lecteur indisponible compte dans le total seulement. Un module à part, chargé à la première ouverture du filtre, qui reçoit un
 * `hass` VIVANT d'App.jsx (`EnteteMediasVive`, abonné aux lecteurs visibles et à leurs jumeaux). On le REND (react-dom/server). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
register('./jsx-hooks.mjs', import.meta.url);
const E = await import(new URL('../src/entetemedias.jsx', import.meta.url).href);
const { setLoggiaState } = await import('../src/state.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = MONOLITHE, CSS = lire('src/index.css');

const OFF = 'media_player.chambre_echo_dot', HACS = 'media_player.echo_dot_chambre', TV = 'media_player.tv_salon', ATV = 'media_player.apple_tv_chambre', BUREAU = 'media_player.bureau_echo_dot';
const st = (id, state, attributes = {}) => [id, { entity_id: id, state, last_changed: '2026-10-17T18:00:00.000Z', last_updated: '2026-10-17T18:00:00.000Z', attributes }];
// L'officielle de l'Echo Dot ne sait ni lecture ni pause (5644) et dit « idle » ; sa jumelle HACS joue.
const S = Object.fromEntries([st(OFF, 'idle', { supported_features: 5644, volume_level: .3 }), st(HACS, 'playing', { supported_features: 318399, media_title: 'Clair de Lune' }),
  st(TV, 'playing', { supported_features: 450487, device_class: 'tv', media_title: 'Un film' }), st(ATV, 'off', { supported_features: 450487, device_class: 'tv' }), st(BUREAU, 'unavailable', { supported_features: 5644 })]);
const LISTE = [
  { id: OFF, haid: OFF, name: 'Echo Dot - Chambre', ma: HACS, alexa: true },
  { id: TV, haid: TV, name: 'TV du salon', ma: null, alexa: false },
  { id: ATV, haid: ATV, name: 'Apple TV Chambre', ma: null, alexa: false },
  { id: BUREAU, haid: BUREAU, name: 'Echo Dot - Bureau', ma: null, alexa: true },
];
const IDS = LISTE.map(p => p.haid);
const poser = () => setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: { media: { available: true, source: 'decouverte', list: LISTE } } });
const html = (ids = IDS, etats = S) => renderToStaticMarkup(createElement(E.default, { hass: { states: etats }, titre: 'Multimédia', ids }));

test('M14, M15 : le compte — un lecteur se lit avec son jumeau (la paire compte une fois, et joue par sa jumelle) ; indisponible, il compte dans le total seulement', () => {
  poser();
  assert.deepEqual(E.compteMedias(IDS, S), { enLecture: 2, total: 4 }, 'l’Echo Dot (par sa jumelle HACS) et la TV ; l’Apple TV éteinte et l’Echo du bureau indisponible comptent dans le total');
  assert.deepEqual(E.compteMedias([ATV, BUREAU], S), { enLecture: 0, total: 2 });
  assert.deepEqual(E.compteMedias([], S), { enLecture: 0, total: 0 });
  // Sans la liste des lecteurs (un identifiant inconnu), l'entité seule se lit.
  assert.deepEqual(E.compteMedias([HACS], S), { enLecture: 1, total: 1 });
});

test('M15 : « 2 en lecture sur 4 », « Rien en lecture » — le titre en italique, le compte sur une ligne, aucune puce', () => {
  poser();
  const h = html();
  assert.ok(h.includes('<h2') && h.includes('>Multimédia</h2>'), 'le titre du filtre');
  assert.ok(h.includes('class="o-medias-compte"') && h.includes('>2 en lecture sur 4</span>'), 'le compte, dans sa classe');
  assert.ok(!h.includes('<button'), 'aucune puce d’action : la maquette n’en a pas');
  const rien = html(IDS, { ...S, [HACS]: { ...S[HACS], state: 'paused' }, [TV]: { ...S[TV], state: 'idle' } });
  assert.ok(rien.includes('>Rien en lecture</span>'), 'rien ne joue : la phrase de M6, pas « 0 en lecture »');
  assert.ok(html([ATV], S).includes('>Rien en lecture</span>'));
});

test('la rangée : la hauteur des autres en-têtes, le compte sur UNE ligne (index.css)', () => {
  assert.ok(CSS.includes('.o-medias-entete { display: flex; align-items: center; gap: 12px; min-height: 40px; }'));
  assert.ok(CSS.includes('.o-medias-entete > h2 { flex: none; }'));
  assert.ok(CSS.includes('.o-medias-compte { flex: 1 1 0; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }'));
});

test('App.jsx : le module à la demande, l’en-tête vivant abonné aux lecteurs ET à leurs jumeaux, sous le filtre Multimédia avec son repli et sa barrière', () => {
  assert.ok(APP.includes("const EnteteMedias = lazyRecharge(() => import('./entetemedias.jsx'));"), 'chargé à la demande');
  const i = APP.indexOf('\nfunction EnteteMediasVive(');
  assert.ok(i > 0, 'l’en-tête vivant a disparu');
  const vive = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.ok(vive.includes("const vivant = useHass(ids.flatMap(id => { const p = lecteurs.find(x => x.haid === id); return p && p.ma ? [id, p.ma] : [id]; }));"), 'abonné aux lecteurs visibles et à leurs jumeaux (M14)');
  assert.ok(vive.includes('<EnteteMedias hass={vivant || hass} titre={titre} ids={ids} />'));
  assert.ok(APP.includes("const idsMedias = actuel === 'multimedia' ? visibles.filter(o => o.id).map(o => o.id) : [];"), 'les lecteurs visibles sous le filtre');
  const j = APP.indexOf("        ) : actuel === 'multimedia' ? (");
  assert.ok(j > 0, 'l’en-tête n’est plus monté sous le filtre Multimédia');
  const branche = APP.slice(j, APP.indexOf("        ) : enSections ? (", j));
  assert.ok(branche.includes('<Barriere repli={<div className="o-medias-entete">') && branche.includes('<Suspense fallback={<div className="o-medias-entete">')
    && branche.includes('<EnteteMediasVive hass={hass} titre={titreFiltre} ids={idsMedias} />'), 'la barrière locale, le repli aux mêmes classes, l’en-tête vivant');
  assert.ok(branche.includes("<span className=\"o-medias-compte\" aria-hidden=\"true\" style={{ fontSize: 12, fontWeight: 600 }}>{'\\u00a0'}</span>"), 'le compte vide du repli tient la hauteur : rien ne saute');
});
