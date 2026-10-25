/* La carte d'un lecteur (chantier Médias, tâche 4 ; sa maquette « Cartes médias », cadre 1a ; M2 A, M5 à M8, M10, M11, M13, M14).
 *
 * Ces tests JOUENT la carte (tests/crochets.mjs) : on la monte sur un `hass`, on lit ce qu'elle dessine — la plaque, la phrase,
 * la puce, la barre que reçoit `RmJauge` —, on appuie, on glisse. Sous `?carte_media`, App.jsx exporte la carte et sa vue — le
 * fichier n'est pas touché. Ce qui est garanti :
 *  - M6, M8 : la pochette dans la plaque, « {titre} · {artiste} », le lavis de la pochette (le rose de la maison hors navigateur :
 *    pochette.js ne lit pas d'image ici) de 0,20 à 0,03 en lecture, 0,08 en pause, rien autrement ; la surface dit le nom, la
 *    phrase, le volume ;
 *  - M2 A, M11 : au pied, UNE puce lecture/pause et la barre de volume en accent, « Volume 30 % » dessus ; la puce ABSENTE s'il n'y a
 *    rien à reprendre — « Rien en lecture » n'a que son volume (passe bis 2, 17/10) ; la progression seulement avec une durée ;
 *  - M13 : `media_pause` si le lecteur joue, `media_play` sinon — sur la jumelle qui commande (M14) ; `volume_set` au relâcher, sur
 *    l'entité du volume, `volume_mute {false}` d'abord si le son était coupé ; `turn_on` / `turn_off` selon l'état affiché, jamais
 *    `toggle` ; le geste d'abord ;
 *  - M10 : l'interrupteur si les deux bits existent et que l'appareil n'est pas une Echo ; la source (`app_name`) à sa place ;
 *  - M7 : éteinte (la plaque grise, pas de pied), indisponible (`o-panne`, la phrase rouge, ni bascule ni pied) ;
 *  - M9 : une annonce en vol s'écrit sur la carte visée ;
 *  - M14 : la carte s'abonne à son entité et à son jumeau ; l'identifiant du jumeau ouvre la même carte. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';

import { monter, horlogeFausse, documentFaux } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?carte_media')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?carte_media'.length), ctx);",
  // ASSERTION MODIFIÉE (passe bis du 17/10, point 14) : les aides du mode enfant passent par UN `lazy` d'App.jsx (`CarteEnfant quoi=…`) — exporté pour le reconnaître à son identité.
  // `RmJauge` (passe bis 2 du 17/10, point 1) : la VRAIE barre se monte avec les props que la carte lui passe, pour glisser dessus.
  "  return { ...r, source: String(r.source) + ';export { RoomMediaCard, useVueLecteur, CvCard, CarteEnfant, RmJauge };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?carte_media', import.meta.url).href);
const CE = await import(new URL('../src/carteenfant.jsx', import.meta.url).href);
const E = await import('../src/lecteuretat.js');
const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const NBSP = String.fromCharCode(160);
const iso = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const st = (id, state, attributes, depuis = iso(18, 5)) => ({ entity_id: id, state, last_changed: depuis, last_updated: depuis, attributes });
const OFF = 'media_player.chambre_echo_dot', HACS = 'media_player.echo_dot_chambre', TV = 'media_player.tv_salon', ATV = 'media_player.apple_tv_chambre', CUISINE = 'media_player.echo_cuisine', BUREAU = 'media_player.bureau_echo_dot', SHOW = 'media_player.echo_show';
const ART = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E';
function maison() {
  return {
    [OFF]: st(OFF, 'playing', { friendly_name: 'Echo Dot - Chambre', supported_features: 5644, volume_level: .3, device_class: 'speaker' }),
    [HACS]: st(HACS, 'playing', { friendly_name: 'Echo Dot Chambre', supported_features: 318399, volume_level: .3, media_title: 'Bin K’uchul Xibalba', media_artist: 'Metal_Chaos', media_duration: 256, media_position: 91, media_position_updated_at: new Date().toISOString(), entity_picture: ART, app_name: 'Amazon Music' }),
    [TV]: st(TV, 'playing', { friendly_name: 'TV du salon', supported_features: 450487, device_class: 'tv', volume_level: .4, app_name: 'Netflix', media_title: 'Stranger Things', media_artist: 'S4 - E1', media_duration: 4672, media_position: 1591, media_position_updated_at: new Date().toISOString() }),
    [ATV]: st(ATV, 'off', { friendly_name: 'Apple TV Chambre', supported_features: 450487, device_class: 'tv', source_list: ['Netflix', 'Arte'] }),
    [CUISINE]: st(CUISINE, 'idle', { friendly_name: 'Echo de la cuisine', supported_features: 318399, volume_level: .35 }),
    [BUREAU]: st(BUREAU, 'unavailable', { friendly_name: 'Echo Dot - Bureau', supported_features: 5644 }, iso(14, 20)),
    [SHOW]: st(SHOW, 'paused', { friendly_name: 'Echo Show Salon', supported_features: 318399, volume_level: .25, media_title: 'France Inter', media_artist: 'Radio', media_content_type: 'channel', app_name: 'TuneIn' }),
  };
}
const LISTE = [
  { id: OFF, haid: OFF, name: 'Echo Dot - Chambre', area: 'Chambre', ma: HACS, alexa: true, modele: 'Echo Dot', annonce: 'notify.chambre_echo_dot_annoncer', annonceHacs: HACS },
  { id: TV, haid: TV, name: 'TV du salon', area: 'Salon', ma: null, alexa: false, modele: 'Boîtier TV', annonce: null, annonceHacs: null },
  { id: ATV, haid: ATV, name: 'Apple TV Chambre', area: 'Chambre', ma: null, alexa: false, modele: 'Apple TV 4K', annonce: null, annonceHacs: null },
  { id: CUISINE, haid: CUISINE, name: 'Echo de la cuisine', area: 'Cuisine', ma: null, alexa: true, modele: 'Echo', annonce: null, annonceHacs: CUISINE },
  { id: BUREAU, haid: BUREAU, name: 'Echo Dot - Bureau', area: 'Bureau', ma: null, alexa: true, modele: 'Echo Dot', annonce: null, annonceHacs: null },
  { id: SHOW, haid: SHOW, name: 'Echo Show Salon', area: 'Salon', ma: null, alexa: true, modele: 'Echo Show', annonce: null, annonceHacs: SHOW },
];
/* La maison doublée : un `hass` dont chaque lecture est un objet neuf, les lecteurs appariés, les services appelés notés. */
function poser(retouche = null) {
  const courants = maison();
  if (retouche) retouche(courants);
  setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: { media: { available: true, source: 'decouverte', list: LISTE } } });
  E.reglerLecteurs();
  const appels = [];
  const hass = () => ({ states: Object.fromEntries(Object.entries(courants).map(([k, v]) => [k, { ...v }])),
    callService: (d, s, data, cible) => { appels.push([d + '.' + s, (cible && cible.entity_id) || (data && data.entity_id), ...Object.entries(data || {}).filter(([k]) => k !== 'entity_id').map(([k, v]) => k + '=' + v)].join(' ')); return Promise.resolve(); } });
  return { appels, courants, hass };
}
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  globalThis.document.documentElement = { classList: { contains: () => false } };
  try { return await fn({ h, d }); } finally { h.restaurer(); d.restaurer(); }
}
const de = (m, nom) => m.trouver(e => e.type && e.type.name === nom)[0];
/* Les aides du mode enfant sont à la demande (carteenfant.jsx ; passe bis du 17/10, point 14) : la carte monte UN `lazy` (`CarteEnfant`), la
 * pièce nommée par `quoi`, que le harnais ne rend pas — on le reconnaît à son identité (App.jsx l'exporte sous `?carte_media`) et à `quoi`,
 * et on monte la VRAIE pièce avec les props reçues (`quoi` compris : chaque pièce l'ignore). */
const QUOI = { PastilleEnfant: 'pastille', GlypheHaut: 'glyphe', PiedTemps: 'pied', RevientPuce: 'revient' };
const lazyDe = (m, nom) => m.trouver(e => e.type === F.CarteEnfant && e.props.quoi === QUOI[nom])[0];
const monterLazy = (m, nom) => { const el = lazyDe(m, nom); assert.ok(el, nom + ' manque sur la carte'); return monter(CE[nom], el.props); };
const classe = (m, c) => m.trouver(e => e.props && typeof e.props.className === 'string' && e.props.className.split(' ').indexOf(c) >= 0)[0];
const attribut = (m, a) => m.trouver(e => e.props && e.props[a] === '')[0];
const phrase = (m) => classe(m, 'o-gab-phrase');
const plaque = (m) => m.trouver(e => e.props && e.props.style && e.props.style.width === 38)[0];
const img = (m) => m.trouver(e => e.type === 'img')[0];
const carte = (w, id) => monter(F.RoomMediaCard, { id, hass: w.hass(), onOpen: () => {} });

test('M6, M8 : en lecture — la pochette dans la plaque, le titre et l’artiste, le lavis de la pochette, la surface qui dit tout', () => dans(() => {
  const w = poser();
  const m = carte(w, OFF);
  assert.equal(img(m).props.src, ART, 'la pochette, dans la plaque');
  assert.equal(plaque(m).props.style.overflow, 'hidden');
  assert.deepEqual([phrase(m).props.children, phrase(m).props.style.color, phrase(m).props.style['--o-n']], ['Bin K’uchul Xibalba · Metal_Chaos', 'var(--o-text1)', 33], 'la phrase de M6, dans son encre, sa longueur posée pour la carte étroite');
  assert.equal(classe(m, 'o-gab-nom').props.children, 'Echo Dot - Chambre');
  // Hors navigateur, la pochette ne se lit pas : le rose de la maison, de 0,20 en haut à 0,03 en bas (M8).
  assert.ok(m.arbre.props.style.background.startsWith('linear-gradient(180deg,rgba(var(--o-rose-rgb),0.2),rgba(var(--o-rose-rgb),0.03) 72%)'), m.arbre.props.style.background);
  assert.ok(m.arbre.props.className.split(' ').indexOf('o-gabarit') >= 0 && m.arbre.props.className.indexOf('o-panne') < 0, 'la grille commune, pas de panne');
  // Le nom lu : `nomCarte` ramène l'insécable à une espace — un lecteur d'écran ne le dit pas autrement.
  assert.equal(de(m, 'Surface').props.label, 'Echo Dot - Chambre, Bin K’uchul Xibalba · Metal_Chaos, Volume 30 %', 'la surface dit le nom, la phrase et le volume (ADR 0074)');
  // Le pied : la puce, « Volume 30 % », la barre en accent, piste 24, 6 px sous le mot.
  const puce = de(m, 'PuceLecture');
  assert.deepEqual([puce.props.v.playing, puce.props.v.reprenable, puce.props.v.nom], [true, true, 'Echo Dot - Chambre']);
  assert.equal(attribut(m, 'data-volume').props.children, 'Volume 30' + NBSP + '%');
  assert.equal(attribut(m, 'data-volume').props.style.color, 'var(--o-accent-soft)');
  // La barre de la carte LARGE : celle qui n'a pas de zone de 44 (l'étroite a la sienne, tâche 5).
  const j = m.trouver(e => e.type && e.type.name === 'RmJauge' && e.props.zone == null)[0].props;
  assert.deepEqual([j.v, j.couleur, j.eteinte, j.marge, j.label, j.zone], [30, 'var(--o-accent)', false, 6, 'Volume Echo Dot - Chambre', undefined]);
  assert.ok(j.grade.startsWith('linear-gradient(90deg,color-mix(in oklab, var(--o-accent) 55%, #fff),var(--o-accent))'), 'de l’accent éclairci à l’accent (§ 6.1)');
  assert.equal(de(m, 'RmBascule'), undefined, 'une Echo ne s’éteint pas : pas d’interrupteur (M10)');
  assert.equal(de(m, 'ProgressionLecteur').props.l.dur, 256, 'une durée : la progression');
  assert.equal(de(m, 'ProgressionLecteur').props.playing, true);
}));

test('M13, M14 : la puce envoie `media_pause` sur la jumelle qui commande, puis `media_play` — jamais `media_play_pause` ; le geste d’abord', () => dans(() => {
  const w = poser();
  const m = carte(w, OFF);
  de(m, 'PuceLecture').props.v.lecture();
  m.rendre();
  assert.deepEqual(w.appels, ['media_player.media_pause ' + HACS], 'la jumelle HACS a les bits : c’est elle qui reçoit l’ordre');
  assert.equal(phrase(m).props.children, 'En pause · Bin K’uchul Xibalba · Metal_Chaos', 'le geste d’abord');
  assert.equal(de(m, 'PuceLecture').props.v.playing, false);
  de(m, 'PuceLecture').props.v.lecture();
  m.rendre();
  assert.deepEqual(w.appels.slice(1), ['media_player.media_play ' + HACS]);
  assert.equal(phrase(m).props.children, 'Bin K’uchul Xibalba · Metal_Chaos');
  assert.ok(!w.appels.some(x => /play_pause|toggle/.test(x)));
}));

test('M13 : la barre envoie `volume_set` au relâcher, sur l’entité du volume ; coupé, `volume_mute` faux d’abord ; le geste d’abord, « Muet » en retrait', () => dans(() => {
  const w = poser();
  const m = carte(w, OFF);
  de(m, 'RmJauge').props.onCommit(45);
  m.rendre();
  assert.deepEqual(w.appels, ['media_player.volume_set ' + HACS + ' volume_level=0.45']);
  assert.equal(attribut(m, 'data-volume').props.children, 'Volume 45' + NBSP + '%', 'le geste d’abord');
  assert.equal(de(m, 'Surface').props.label, 'Echo Dot - Chambre, Bin K’uchul Xibalba · Metal_Chaos, Volume 45 %');
  // Le son coupé : « Muet », le remplissage parti, le repère gris ; glisser rend le son d'abord.
  const w2 = poser((c) => { c[HACS].attributes.is_volume_muted = true; });
  const m2 = carte(w2, OFF);
  assert.deepEqual([attribut(m2, 'data-volume').props.children, attribut(m2, 'data-volume').props.style.color], ['Muet', 'var(--o-text2)']);
  const j = de(m2, 'RmJauge').props;
  assert.deepEqual([j.v, j.couleur, j.grade], [30, 'var(--o-text3)', 'transparent']);
  j.onCommit(50);
  assert.deepEqual(w2.appels, ['media_player.volume_mute ' + HACS + ' is_volume_muted=false', 'media_player.volume_set ' + HACS + ' volume_level=0.5']);
}));

test('M10 : l’interrupteur s’il sert — la TV l’a, en haut à droite, avec sa source ; `turn_off` / `turn_on` selon l’état affiché, jamais `toggle`', () => dans(() => {
  const w = poser();
  const tv = carte(w, TV);
  assert.equal(attribut(tv, 'data-source').props.children, 'Netflix', '`app_name` seulement : la source à la place de l’interrupteur d’une Echo');
  assert.equal(attribut(tv, 'data-source').props.className, 'o-seul-large');
  assert.equal(phrase(tv).props.children, 'Stranger Things · S4 - E1', 'une série : ce que le lecteur met dans l’artiste');
  const b = de(tv, 'RmBascule');
  assert.deepEqual([b.props.on, b.props.className, b.props.nom], [true, 'o-seul-large', 'TV du salon']);
  tv.appuyer(b, 'onToggle');
  assert.deepEqual(w.appels, ['media_player.turn_off ' + TV]);
  assert.equal(phrase(tv).props.children, 'Éteinte', 'le geste d’abord');
  assert.equal(de(tv, 'PuceLecture'), undefined, 'éteinte, plus de pied');
  // L'Apple TV éteinte : la plaque grise, « Éteinte », pas de pied, la bascule en haut ; allumer envoie `turn_on`.
  const atv = carte(w, ATV);
  assert.deepEqual([phrase(atv).props.children, phrase(atv).props.style.color], ['Éteinte', 'var(--o-text2)']);
  assert.deepEqual([plaque(atv).props.style.background, plaque(atv).props.style.color], ['var(--o-s1)', 'var(--o-text3)']);
  assert.ok(!atv.arbre.props.style.background.includes('rgba('), 'aucun lavis');
  assert.equal(de(atv, 'PuceLecture'), undefined);
  assert.equal(de(atv, 'RmJauge'), undefined);
  assert.equal(de(atv, 'ProgressionLecteur'), undefined);
  assert.equal(attribut(atv, 'data-source'), undefined, 'éteinte, aucune source');
  assert.equal(de(atv, 'RmBascule').props.on, false);
  atv.appuyer(de(atv, 'RmBascule'), 'onToggle');
  assert.deepEqual(w.appels.slice(1), ['media_player.turn_on ' + ATV]);
  assert.equal(phrase(atv).props.children, 'Rien en lecture', 'allumée par le geste, sans titre');
  assert.ok(!w.appels.some(x => /toggle/.test(x)));
}));

test('M7, M11 : rien en lecture — pas de puce, la barre reste ; indisponible — le liseré, la phrase rouge, ni bascule ni pied', () => dans(() => {
  const w = poser();
  const cuisine = carte(w, CUISINE);
  assert.deepEqual([phrase(cuisine).props.children, phrase(cuisine).props.style.color], ['Rien en lecture', 'var(--o-text2)']);
  /* ASSERTION MODIFIÉE (passe bis 2, 17/10 ; M11) : la puce était dessinée inerte (`reprenable` faux, `aria-disabled`, 0,4) ; rien
   * d'inerte à l'écran — « Rien en lecture » n'a pas de puce, le volume reste, et le pied large tient par sa seule zone du volume. */
  assert.equal(de(cuisine, 'PuceLecture'), undefined, 'rien à reprendre : pas de puce');
  assert.equal(cuisine.trouver(e => e.type === 'button' && /^(Lire|Mettre en pause) /.test(e.props['aria-label'] || '')).length, 0, 'aucun bouton de lecture, large ou étroit');
  assert.equal(attribut(cuisine, 'data-volume').props.children, 'Volume 35' + NBSP + '%', 'le volume, lui, reste au pied');
  assert.equal(de(cuisine, 'RmJauge').props.v, 35);
  assert.deepEqual([plaque(cuisine).props.style.background, plaque(cuisine).props.style.color], ['var(--o-s1)', 'var(--o-text1)']);
  assert.equal(img(cuisine), undefined, 'pas de pochette : le glyphe');
  assert.equal(de(cuisine, 'ProgressionLecteur'), undefined);
  const bureau = carte(w, BUREAU);
  assert.ok(bureau.arbre.props.className.split(' ').indexOf('o-panne') >= 0, 'le liseré qui respire (ADR 0048)');
  assert.deepEqual([phrase(bureau).props.children, phrase(bureau).props.style.color], ['Indisponible depuis 14:20', 'var(--o-bad)']);
  assert.deepEqual([de(bureau, 'RmBascule'), de(bureau, 'PuceLecture'), de(bureau, 'RmJauge'), de(bureau, 'ProgressionLecteur')], [undefined, undefined, undefined, undefined], 'aucune commande vers une entité morte');
  assert.equal(de(bureau, 'Surface').props.label, 'Echo Dot - Bureau, Indisponible depuis 14:20');
  assert.deepEqual([plaque(bureau).props.style.background, plaque(bureau).props.style.color], ['var(--o-s1)', 'var(--o-text3)']);
}));

test('M8, § 5 : en pause, le lavis à 0,08 et « En pause · {station} » ; une radio sans durée n’a pas de progression', () => dans(() => {
  const w = poser();
  const show = carte(w, SHOW);
  assert.deepEqual([phrase(show).props.children, phrase(show).props.style.color], ['En pause · France Inter', 'var(--o-text2)']);
  assert.ok(show.arbre.props.style.background.startsWith('linear-gradient(180deg,rgba(var(--o-rose-rgb),0.08),rgba(var(--o-rose-rgb),0.03) 72%)'), show.arbre.props.style.background);
  assert.equal(de(show, 'ProgressionLecteur'), undefined, 'sans durée, pas de progression');
  assert.equal(plaque(show).props.style.background, 'rgba(var(--o-rose-rgb),.18)', 'la plaque teintée, sans pochette : le glyphe sur la teinte');
  assert.equal(de(show, 'PuceLecture').props.v.playing, false);
  assert.equal(attribut(show, 'data-source').props.children, 'TuneIn');
}));

test('M9 : une annonce en vol s’écrit sur la carte visée, dans l’encre de l’accent, et la carte se redessine', () => dans(() => {
  const w = poser();
  const m = carte(w, OFF);
  E.annoncer([OFF], 'À table !', Date.now());
  m.rendre();
  assert.deepEqual([phrase(m).props.children, phrase(m).props.style.color], ['Annonce : « À table ! »', 'var(--o-accent-soft)']);
  assert.equal(de(m, 'Surface').props.label, 'Echo Dot - Chambre, Annonce : « À table ! », Volume 30 %');
  const autre = carte(w, CUISINE);
  assert.equal(phrase(autre).props.children, 'Rien en lecture', 'une carte non visée ne dit rien');
}));

test('M14 : la carte s’abonne à son entité et à son jumeau ; l’identifiant du jumeau ouvre la même carte ; un lecteur inconnu de l’appariement est lu seul', () => dans(() => {
  assert.ok(APP.includes('const vivant = useHass(lecteur ? [lecteur.haid, lecteur.ma].filter(Boolean) : []);'), 'la carte s’abonne à SES deux entités, jamais au domaine');
  const w = poser();
  const Temoin = ({ id, hass }) => { const v = F.useVueLecteur(hass, id); return createElement('i', { 'data-id': v.id, 'data-nom': v.nom, 'data-ctl': v.l.ctl }); };
  const parJumeau = monter(Temoin, { id: HACS, hass: w.hass() });
  assert.deepEqual([parJumeau.arbre.props['data-id'], parJumeau.arbre.props['data-nom'], parJumeau.arbre.props['data-ctl']], [OFF, 'Echo Dot - Chambre', HACS], 'la jumelle HACS épinglée ouvre la carte de l’officielle');
  const seul = monter(Temoin, { id: 'media_player.biblio', hass: { states: { 'media_player.biblio': st('media_player.biblio', 'playing', { friendly_name: 'Enceinte bureau', media_title: 'Clair de Lune', volume_level: .4, supported_features: 20925 }) } } });
  assert.deepEqual([seul.arbre.props['data-id'], seul.arbre.props['data-nom'], seul.arbre.props['data-ctl']], ['media_player.biblio', 'Enceinte bureau', 'media_player.biblio'], 'la Bibliothèque des cartes : lu seul');
  const inactif = monter(({ hass }) => { const v = F.useVueLecteur(hass, OFF, null, false); return createElement('i', { 'data-rien': v === null ? 'oui' : 'non' }); }, { hass: w.hass() });
  assert.equal(inactif.arbre.props['data-rien'], 'oui', '`actif` faux : rien ne se rend');
}));

test('le gabarit : la puce de 44 au pied positionnée, la progression de 3 px, la source et la bascule à la carte large seule', () => {
  assert.ok(APP.includes("const RM_MEDIA_PUCE = { ...RM_BTN, flex: 'none', width: 44, height: 44, padding: 0, borderRadius: 12, border: 'none'"), 'la puce de sa maquette : 44 × 44, arrondi 12, sans bordure, positionnée');
  assert.ok(APP.includes("style={{ position: 'relative', height: 3, marginTop: 8, borderRadius: 2, background: 'var(--o-s1)', overflow: 'hidden', flexShrink: 0 }}"), 'la progression : 3 px, 8 px dessus');
  const i = APP.indexOf('\nfunction RoomMediaCard(');
  const carteSrc = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.ok(carteSrc.includes('className="o-seul-large" data-source=""') && carteSrc.includes('<RmBascule className="o-seul-large"') && carteSrc.includes('<div className="o-seul-large" style={{ display: \'flex\', alignItems: \'flex-end\', gap: 8, marginTop: \'auto\', paddingTop: \'var(--o-pied-haut, 8px)\' }}>'),
    'la source, la bascule et le pied s’écrivent pour la carte large (ADR 0202) ; l’étroite a les siens (tâche 5)');
  assert.ok(carteSrc.includes("marginTop: 'var(--o-milieu-haut, 10px)'"), '10 px sous la plaque, 8 pour le pied : le budget de 146 (§ 6.1)');
  assert.ok(!carteSrc.includes('marginTop: 14 }}>'), 'aucune marge fixe ne pousse le corps dehors (ADR 0179)');
});

/* ── La carte ÉTROITE (tâche 5 ; § 6.2, la grille commune 1c, ADR 0202) et la COMPACTE (M17) ──────────────────────────────────── */

const etroite = (m) => attribut(m, 'data-commandes');

test('§ 6.2 : la carte étroite — le volume en chiffre en haut, le nom entier, UNE ligne de commandes de 44 px : la puce et la barre', () => dans(() => {
  const w = poser();
  const m = carte(w, OFF);
  const chiffre = de(m, 'ChiffreHaut');
  assert.deepEqual([chiffre.props.v, chiffre.props.u, chiffre.props.lu], [30, '%', undefined], 'le volume, caché au lecteur d’écran (`lu` au défaut) : la barre le dit');
  assert.equal(classe(m, 'o-gab-nom').props.className, 'o-gab-nom', 'le nom en entier (deux lignes, la feuille)');
  const ligne = etroite(m);
  assert.deepEqual([ligne.props.className, ligne.props.style.marginTop, ligne.props.style.minHeight], ['o-seul-etroit', 'auto', 'calc(var(--o-pied-haut, 9px) + 44px)'], 'collée au pied, 44 px');
  assert.equal(m.trouver(e => e.type && e.type.name === 'PuceLecture').length, 2, 'la puce s’écrit deux fois : la carte large et l’étroite — la feuille n’en montre qu’une');
  const jauges = m.trouver(e => e.type && e.type.name === 'RmJauge').map(e => e.props);
  // La ligne étroite s'écrit AVANT le pied large (les deux « marginTop: auto » se partagent le bas ; une seule paraît, index.css).
  assert.deepEqual(jauges.map(j => [j.zone, j.marge]), [[44, 0], [undefined, 6]], 'l’étroite dans une zone de 44 px, le reste de la ligne ; la barre large sous son mot');
  jauges[0].onCommit(60);
  assert.deepEqual(w.appels, ['media_player.volume_set ' + HACS + ' volume_level=0.6'], 'la barre étroite commande comme la large');
  // Le son coupé : « Muet » en chiffre — et la barre le dit au lecteur d'écran (`etat`, passe bis : elle disait « 30 % » quand la carte écrivait « Muet »).
  const w2 = poser((c) => { c[HACS].attributes.is_volume_muted = true; });
  const m2 = carte(w2, OFF);
  assert.deepEqual([de(m2, 'ChiffreHaut').props.v, de(m2, 'ChiffreHaut').props.u], ['Muet', undefined], 'muet : le mot, sans unité');
  assert.deepEqual(m2.trouver(e => e.type && e.type.name === 'RmJauge').map(j => j.props.etat), ['Muet', 'Muet'], 'les deux barres disent « Muet »');
  assert.deepEqual(jauges.map(j => j.etat), [null, null], 'le son rendu : la valeur seule');
}));

test('passe bis : la progression est à la carte large seule (`o-seul-large`) — le budget de 150 px de la carte étroite ne la loge pas sous un nom de deux lignes', () => dans(() => {
  const w = poser();
  const m = carte(w, OFF);
  const el = de(m, 'ProgressionLecteur');
  assert.ok(el, 'en lecture avec une durée : la progression');
  // Le harnais ne rend pas les enfants : la progression se monte avec les props que la carte lui passe.
  const progression = attribut(monter(el.type, el.props), 'data-progression');
  assert.equal(progression.props.className, 'o-seul-large');
  assert.equal(progression.props.style.height, 3);
  // La source du gabarit : la ligne étroite n'a que la puce et la barre ; la progression ne s'y écrit pas.
  const i = APP.indexOf('\nfunction ProgressionLecteur(');
  assert.ok(APP.slice(i, APP.indexOf('\n}\n', i)).includes('<div className="o-seul-large" aria-hidden="true" data-progression=""'));
}));

test('passe bis, § 5 : une TV inactive (`idle`) dans le menu d’une appli dit « Rien en lecture » — pas « En pause · Netflix » ; l’appli reste à sa place de source, pas de puce, pas de lavis', () => dans(() => {
  const w = poser((c) => {
    c[TV].state = 'idle';
    for (const k of ['media_title', 'media_artist', 'media_duration', 'media_position', 'media_position_updated_at']) delete c[TV].attributes[k];
  });
  const m = carte(w, TV);
  assert.equal(phrase(m).props.children, 'Rien en lecture');
  assert.equal(attribut(m, 'data-source').props.children, 'Netflix', 'la source (M10), elle, reste');
  /* ASSERTION MODIFIÉE (passe bis 2, 17/10 ; M11) : la puce inerte (`reprenable` faux) n'est plus dessinée du tout ; « ni en pause, ni
   * en lecture » se lit à la phrase et au lavis absent, le volume reste. */
  assert.equal(de(m, 'PuceLecture'), undefined, 'rien à reprendre : pas de puce');
  assert.deepEqual([de(m, 'RmJauge').props.v, attribut(m, 'data-volume').props.children], [40, 'Volume 40' + NBSP + '%'], 'le volume reste');
  assert.ok(!String(m.arbre.props.style.background).includes('rgba('), 'ni en lecture ni en pause : pas de lavis, la surface des cartes');
  assert.equal(de(m, 'ProgressionLecteur'), undefined, 'pas de progression');
  // `on` (une TV allumée hors lecture, LG) : la même chose.
  const w2 = poser((c) => { c[TV].state = 'on'; delete c[TV].attributes.media_title; delete c[TV].attributes.media_artist; });
  assert.equal(phrase(carte(w2, TV)).props.children, 'Rien en lecture');
}));

test('§ 6.2, M10 : éteinte, la ligne porte UNE puce « Allumer » (`turn_on`) ; indisponible, rien ; la bascule et la source restent à la carte large', () => dans(() => {
  const w = poser();
  const atv = carte(w, ATV);
  assert.equal(de(atv, 'ChiffreHaut'), undefined, 'éteinte : pas de chiffre');
  const ligne = etroite(atv);
  const allumer = atv.trouver(e => e.type === 'button' && e.props['aria-label'] === 'Allumer Apple TV Chambre')[0];
  assert.ok(ligne && allumer, 'la puce « Allumer », avec son mot');
  // `o-puce-lecteur` : la vue Pièce au téléphone serre les `o-rmbtn` (index.css) ; les puces d'un lecteur gardent leur rembourrage (passe bis).
  assert.equal(allumer.props.className, 'o-rmbtn o-puce-lecteur');
  assert.equal(allumer.props.title, 'Allumer');
  atv.appuyer(allumer);
  assert.deepEqual(w.appels, ['media_player.turn_on ' + ATV]);
  assert.equal(phrase(atv).props.children, 'Rien en lecture', 'le geste d’abord');
  assert.equal(de(atv, 'RmBascule').props.className, 'o-seul-large', 'la bascule, à la carte large seule');
  /* ASSERTION MODIFIÉE (passe bis du 17/10, marquée à la passe bis 2 ; M7, M14) : indisponible, la carte étroite ne dessine plus rien
   * vers une entité morte — ni ligne de commandes, ni chiffre en haut —, comme la carte large (un jumeau mort ne commande pas). */
  const bureau = carte(w, BUREAU);
  assert.equal(etroite(bureau), undefined, 'indisponible : aucune ligne de commandes');
  assert.equal(de(bureau, 'ChiffreHaut'), undefined);
  /* ASSERTION MODIFIÉE (passe bis 2, 17/10 ; M11) : une Echo « Rien en lecture » gardait sur sa ligne une puce « Lire » inerte ; rien
   * d'inerte à l'écran — la ligne garde sa barre seule, dans sa zone de 44 px, et le chiffre en haut. */
  const cuisine = carte(w, CUISINE);
  const ligneCuisine = etroite(cuisine);
  assert.ok(ligneCuisine && de(cuisine, 'ChiffreHaut').props.v === 35);
  assert.equal(cuisine.trouver(e => e.type && e.type.name === 'PuceLecture').length, 0, 'rien à reprendre : aucune puce, ni large ni étroite');
  assert.deepEqual(cuisine.trouver(e => e.type && e.type.name === 'RmJauge').map(j => [j.props.zone, j.props.v]), [[44, 35], [undefined, 35]], 'les deux barres restent, l’étroite dans sa zone de 44');
  assert.equal(ligneCuisine.props.style.minHeight, 'calc(var(--o-pied-haut, 9px) + 44px)', 'la ligne tient ses 44 px sans la puce');
}));

test('M17, M13 : la compacte garde sa disposition — la phrase, la pochette dans la plaque, la teinte — et sa seule commande est explicite', () => dans(() => {
  const w = poser();
  const m = monter(F.CvCard, { id: OFF, hass: w.hass(), onOpen: () => {}, dense: true });
  assert.ok(m.texte().includes('Bin K’uchul Xibalba · Metal_Chaos'), 'la phrase de M6');
  assert.equal(img(m).props.src, ART, 'la pochette dans la plaque');
  const pastille = m.trouver(e => e.props && e.props.className === 'o-cvpastille')[0];
  assert.deepEqual([pastille.props.style.background, pastille.props.style.overflow], ['rgba(var(--o-rose-rgb),.16)', 'hidden']);
  assert.ok(m.arbre.props.style.background.startsWith('linear-gradient(180deg,rgba(var(--o-rose-rgb),0.16),rgba(var(--o-rose-rgb),0.03) 72%)'), 'le lavis de la pochette, 0,16 sur une compacte : ' + m.arbre.props.style.background);
  const mini = m.trouver(e => e.type === 'button' && e.props['aria-label'] === 'Pause Echo Dot - Chambre')[0];
  assert.ok(mini, 'le mini lecture / pause, nommé de l’appareil');
  m.appuyer(mini);
  assert.deepEqual(w.appels, ['media_player.media_pause ' + HACS], 'explicite, sur la jumelle qui commande');
  assert.ok(m.texte().includes('En pause · Bin K’uchul Xibalba · Metal_Chaos'), 'le geste d’abord');
  assert.ok(!w.appels.some(x => /play_pause/.test(x)));
  /* ASSERTION MODIFIÉE (passe bis 2, 17/10 ; M11, M17) : le mini était dessiné inerte (`aria-disabled`, 0,4) ; rien d'inerte à l'écran —
   * « Rien en lecture » n'a pas de mini, sur la compacte comme sur la standard ; éteinte : pas de mini ; indisponible : « Indisponible
   * depuis », aucune commande. */
  const cuisine = monter(F.CvCard, { id: CUISINE, hass: w.hass(), onOpen: () => {}, dense: true });
  assert.deepEqual([cuisine.trouver(e => e.type === 'button' && /^(Lire|Pause) /.test(e.props['aria-label'] || '')).length, cuisine.texte().includes('Rien en lecture')], [0, true], 'rien à reprendre : pas de mini');
  const cuisineStandard = monter(F.CvCard, { id: CUISINE, hass: w.hass(), onOpen: () => {}, dense: false });
  assert.equal(cuisineStandard.trouver(e => e.type === 'button' && /^(Lecture|Pause) /.test(e.props['aria-label'] || '')).length, 0, 'la standard non plus');
  const atv = monter(F.CvCard, { id: ATV, hass: w.hass(), onOpen: () => {}, dense: true });
  assert.equal(atv.trouver(e => e.type === 'button' && /Lire|Pause/.test(e.props['aria-label'] || '')).length, 0, 'éteinte : pas de mini');
  assert.ok(atv.texte().includes('Éteinte'));
  const bureau = monter(F.CvCard, { id: BUREAU, hass: w.hass(), onOpen: () => {}, dense: true });
  assert.ok(bureau.texte().includes('Indisponible depuis 14:20') && bureau.arbre.props.className.indexOf('o-panne') >= 0);
  assert.equal(bureau.trouver(e => e.type === 'button' && e.props['aria-label'] && e.props['aria-label'].indexOf('Bureau') >= 0).length, 0, 'aucune commande vers une entité morte');
  /* La standard (non compacte) : le même geste explicite, en toutes lettres.
   * ASSERTION MODIFIÉE (passe bis du 17/10, marquée à la passe bis 2 ; M13, M14) : le service de la standard est explicite —
   * `media_pause` quand le lecteur joue — et vise la jumelle qui commande (`ctl`), non l'entité de la carte, là où la carte d'avant
   * basculait à l'aveugle (`media_play_pause`) sur l'entité affichée. */
  const standard = monter(F.CvCard, { id: OFF, hass: w.hass(), onOpen: () => {}, dense: false });
  const bouton = standard.trouver(e => e.type === 'button' && e.props['aria-label'] === 'Pause Echo Dot - Chambre')[0];
  standard.appuyer(bouton);
  assert.deepEqual(w.appels.slice(1), ['media_player.media_pause ' + HACS]);
}));

/* ── Le mode enfant sur la carte (chantier Mode enfant, tâche 4 ; E15 à E17 ; § 6.1, § 6.2) ────────────────────────────────────
 *
 * La maison a un profil (`loggia_enfant`, la chambre), et le serveur — doublé, muet — a déjà dit ce qu'il fait de chaque lecteur
 * (`loggia/enfant/etat`, enfantetat.js). Ce qui est garanti : la pastille « Mode enfant » à la place de la source, « Limites
 * levées » quand le parent les a levées ; la barre d'une enceinte reçoit le plafond (la zone hachurée, le cadenas) et le geste ne le
 * dépasse pas — « Limité à 40 % » quatre secondes ; le pied d'un écran à budget est celui du TEMPS, même éteint ; bloqué (coucher,
 * temps écoulé) : la plaque grise avec la lune ou le sablier, pas de lavis, la phrase du blocage, et au téléphone « Revient à 07:30 »
 * à la place d'« Allumer » ; le chiffre de la carte étroite est le temps qui reste, la lune ou le sablier ; la compacte prend le
 * glyphe seul ; sans profil, rien ne change et rien ne s'abonne. */

const EN = await import('../src/enfantetat.js');
const PROFIL_CFG = { profils: { chambre: { nom: 'Lino', zone: 'chambre', actif: true, ajouts: [ATV], ecrans: null, volume_max: 40, coucher_max: 20, budget: { semaine: 90, weekend: 90 }, heures: { semaine: ['07:30', '20:30'], weekend: ['08:30', '21:00'] }, dormir: true, voix: true, phrases_dormir: ['joue du bruit blanc', 'joue de la musique pour dormir'] } }, simulation: { actif: false } };
const VUE = (sur = {}) => ({ profil: 'chambre', nom: 'Lino', actif: true, leve_jusqua: null, plafond: 40, bloque: null, reprise: '07:30', ecran: null, dormir: null, demande: null, ...sur });
const ECRAN = { budget_min: 90, utilise_s: 3300, bonus_min: 0, reste_s: 2100 };
const tvAllumee = (c) => { c[ATV] = st(ATV, 'playing', { friendly_name: 'Apple TV Chambre', supported_features: 450487, device_class: 'tv', app_name: 'Disney+', volume_level: .3, media_title: 'Bluey', media_duration: 420, media_position: 100, media_position_updated_at: new Date().toISOString() }); };
function poserEnfant(lecteurs, retouche = null) {
  const w = poser(retouche);
  setLoggiaState({ index: null, ent: {}, cfg: { loggia_enfant: PROFIL_CFG }, resolved: { media: { available: true, source: 'decouverte', list: LISTE } } });
  EN.reglerEnfantEtat({ hass: { callWS: () => new Promise(() => {}) } });
  EN.poserEtatEnfant({ maintenant: Date.now() / 1000, demarre: true, simulation: false, recu: Date.now(),
    profils: { chambre: { nom: 'Lino', zone: 'chambre', actif: true, leve_jusqua: null, demande: null, appareils: [], voix: true, dormir: true } }, lecteurs });
  return w;
}
const glyphe = (m, i) => m.trouver(e => e.type && e.type.name === 'Fi' && e.props.i === i)[0];
const fini = () => { EN.reglerEnfantEtat({}); setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: {} }); };

test('E15, § 6.1 : une enceinte sous profil — la pastille « Mode enfant » à la place de la source, « Volume 30 % · max 40 % », le plafond sur les deux barres ; le geste ne dépasse pas : « Limité à 40 % » quatre secondes', () => dans(({ h }) => {
  const w = poserEnfant({ [OFF]: VUE(), [HACS]: VUE() });
  const m = carte(w, OFF);
  // ASSERTION MODIFIÉE (passe bis du 17/10, point 14) : la pastille est un `lazy` (carteenfant.jsx), reconnu à son identité et monté avec ses props.
  const pastille = lazyDe(m, 'PastilleEnfant');
  // Le harnais ne rend pas les enfants : la pastille se monte avec les props que la carte lui passe.
  assert.deepEqual([pastille.props.className, pastille.props.levee, monter(CE.PastilleEnfant, pastille.props).texte().includes('Mode enfant')], ['o-seul-large', false, true], 'la pastille, à la carte large, le mot écrit');
  assert.ok(glyphe(monter(CE.PastilleEnfant, pastille.props), 'child-head'), 'le glyphe de sa maquette');
  assert.equal(attribut(m, 'data-source'), undefined, 'la pastille prend la place de la source');
  assert.deepEqual([attribut(m, 'data-volume').props.children, attribut(m, 'data-volume').props.style.color], ['Volume 30' + NBSP + '% · max 40' + NBSP + '%', 'var(--o-text2)']);
  assert.deepEqual(m.trouver(e => e.type && e.type.name === 'RmJauge').map(j => [j.props.zone, j.props.plafond]), [[44, 40], [undefined, 40]], 'le plafond sur la barre étroite et la large');
  // ASSERTION AJOUTÉE (passe bis du 17/10, point 9) : les deux barres disent le plafond au lecteur d'écran (`etat` → `aria-valuetext`) ; coupé, « Muet » d'abord.
  assert.deepEqual(m.trouver(e => e.type && e.type.name === 'RmJauge').map(j => j.props.etat), ['max 40' + NBSP + '%', 'max 40' + NBSP + '%']);
  const mm = carte(poserEnfant({ [OFF]: VUE(), [HACS]: VUE() }, (c) => { c[HACS].attributes.is_volume_muted = true; }), OFF);
  assert.deepEqual(mm.trouver(e => e.type && e.type.name === 'RmJauge').map(j => j.props.etat), ['Muet · max 40' + NBSP + '%', 'Muet · max 40' + NBSP + '%']);
  assert.equal(de(m, 'Surface').props.label, 'Echo Dot - Chambre, Bin K’uchul Xibalba · Metal_Chaos, Volume 30 % · max 40 %, Mode enfant', 'la surface dit le plafond et le profil');
  // Le geste au-delà du plafond : `volume_set` AU PLAFOND (jamais plus haut), et « Limité à 40 % » en accent doux, quatre secondes.
  de(m, 'RmJauge').props.onCommit(70);
  m.rendre();
  assert.deepEqual(w.appels, ['media_player.volume_set ' + HACS + ' volume_level=0.4'], 'le plafond, pas 70');
  assert.deepEqual([attribut(m, 'data-volume').props.children, attribut(m, 'data-volume').props.style.color], ['Limité à 40' + NBSP + '%', 'var(--o-accent-soft)']);
  h.avancer(4100);
  m.rendre();
  /* ASSERTION MODIFIÉE (18/10) : à quatre secondes, « Limité » s'en va ; le volume posé — le plafond, 40 — tient le filet du volume (sept
   * secondes : la réponse de la jumelle et un relevé du pont, son retour du 18/10). Puis la carte redit ce que la maison dit — ici la
   * doublure, restée à 30 ; chez lui, le 40 que la maison a posé. */
  assert.equal(attribut(m, 'data-volume').props.children, 'Volume 40' + NBSP + '% · max 40' + NBSP + '%', 'quatre secondes plus tard, le mot du volume, plus « Limité »');
  h.avancer(3000);
  m.rendre();
  assert.equal(attribut(m, 'data-volume').props.children, 'Volume 30' + NBSP + '% · max 40' + NBSP + '%', 'le filet tombé, ce que la maison dit');
  // Sous le plafond, le geste d'avant.
  de(m, 'RmJauge').props.onCommit(25);
  m.rendre();
  assert.equal(w.appels.at(-1), 'media_player.volume_set ' + HACS + ' volume_level=0.25');
  assert.equal(attribut(m, 'data-volume').props.children, 'Volume 25' + NBSP + '% · max 40' + NBSP + '%');
  // La plaque et le lavis ne changent pas : en lecture, la pochette et sa teinte.
  assert.equal(img(m).props.src, ART);
  assert.ok(m.arbre.props.style.background.startsWith('linear-gradient(180deg,rgba(var(--o-rose-rgb),0.2)'));
  fini();
}));

test('E15, § 6.1 : un écran à budget — le pied du TEMPS à la place du volume (« Temps d’écran », « 35 min restantes », la barre de 8 px, « 55 min utilisées », « sur 1 h 30 ») ; la barre de volume reste à la carte étroite, hachurée ; le chiffre en haut est le temps', () => dans(() => {
  const w = poserEnfant({ [ATV]: VUE({ ecran: ECRAN }) }, tvAllumee);
  const m = carte(w, ATV);
  assert.equal(phrase(m).props.children, 'Bluey', 'en lecture, la phrase ne change pas');
  assert.ok(lazyDe(m, 'PastilleEnfant'), 'la pastille');
  // ASSERTION MODIFIÉE (passe bis du 17/10, point 14) : le pied est un `lazy` ; il reçoit le mot du reste tout fait (`texte`), que la carte
  // calcule aussi pour sa surface — plus `reprise`.
  const pied = lazyDe(m, 'PiedTemps');
  assert.deepEqual([pied.props.budget, pied.props.bloque, pied.props.texte], [{ total_s: 5400, utilise_s: 3300, reste_s: 2100, bonus_min: 0 }, null, '35 min restantes']);
  // Le harnais ne rend pas les enfants : le pied se monte avec les props que la carte lui passe.
  const p = monter(CE.PiedTemps, pied.props);
  assert.deepEqual([attribut(p, 'data-reste').props.children, attribut(p, 'data-reste').props.style.color], ['35 min restantes', 'var(--o-text1)']);
  assert.ok(p.texte().includes('Temps d’écran') && p.texte().includes('55 min utilisées') && p.texte().includes('sur 1 h 30'), p.texte());
  assert.deepEqual([attribut(p, 'data-utilise').props.style.width, attribut(p, 'data-utilise').props.style.background], ['61%', 'var(--o-accent)'], '55 min sur 1 h 30 : 61 %');
  assert.equal(p.trouver(e => e.props && e.props.style && e.props.style.height === 8).length, 1, 'la barre de 8 px');
  assert.equal(attribut(m, 'data-volume'), undefined, 'le volume quitte le pied large : il reste dans la popup');
  assert.deepEqual(m.trouver(e => e.type && e.type.name === 'RmJauge').map(j => [j.props.zone, j.props.plafond, j.props.v]), [[44, 40, 30]], 'la barre étroite seule, hachurée au plafond');
  assert.equal(m.trouver(e => e.type && e.type.name === 'PuceLecture').length, 2, 'la puce lecture/pause reste, large et étroite');
  assert.deepEqual([de(m, 'ChiffreHaut').props.v, de(m, 'ChiffreHaut').props.u], [35, 'min'], 'le chiffre de la carte étroite : le temps qui reste');
  assert.equal(de(m, 'Surface').props.label, 'Apple TV Chambre, Bluey, 35 min restantes, Mode enfant');
  // Plus d'une heure : « 1 h 25 », sans unité à part.
  const w2 = poserEnfant({ [ATV]: VUE({ ecran: { ...ECRAN, bonus_min: 15, reste_s: 5100, utilise_s: 1200 } }) }, tvAllumee);
  const m2 = carte(w2, ATV);
  assert.deepEqual([de(m2, 'ChiffreHaut').props.v, de(m2, 'ChiffreHaut').props.u], ['1 h 25', undefined]);
  assert.equal(monterLazy(m2, 'PiedTemps').texte().includes('sur 1 h 45'), true, 'le total compte les 15 min accordées');
  fini();
}));

/* TEST AJOUTÉ (passe bis du 17/10, point 14) : les aides du mode enfant ne pèsent plus sur le boot. La pastille, le glyphe du haut, le pied
 * du temps et la puce « Revient à » vivent dans carteenfant.jsx, chargé par `lazyRecharge` et monté dans un `Suspense` au repli NEUTRE :
 * rien de visible — la plaque de 38 px tient la ligne —, ou la hauteur du pied réservée (49 px) ; le module n'importe jamais App.jsx. */
test('passe bis, point 14 : les aides du mode enfant sont à la demande (carteenfant.jsx), UN import derrière le rechargement, dans un Suspense au repli nul', () => {
  // ASSERTION MODIFIÉE (passe bis 2 du 17/10, point 4) : `{ decor: true }` — un morceau introuvable après le rechargement unique ne rend rien (tests/recharge.test.mjs).
  assert.ok(APP.includes("const CarteEnfant = lazyRecharge(() => import('./carteenfant.jsx'), { decor: true });"), 'les aides ne sont plus chargées à la demande, en un import, en décor');
  assert.equal((APP.match(/import\('\.\/carteenfant\.jsx'\)/g) || []).length, 1, 'un seul import : quatre coûteraient quatre préchargements dans le boot');
  for (const nom of ['PastilleEnfant', 'GlypheHaut', 'PiedTemps', 'RevientPuce']) {
    assert.ok(typeof CE[nom] === 'function', nom + ' manque à carteenfant.jsx');
    assert.ok(!APP.includes(`\nfunction ${nom}(`), nom + ' est revenu dans App.jsx : le boot le porte');
  }
  // Le répartiteur : la pièce par son nom, rien pour un nom inconnu.
  assert.equal(CE.default({ quoi: 'pastille', levee: true }).type, CE.PastilleEnfant);
  assert.deepEqual(CE.default({ quoi: 'pied', budget: 1, texte: 'x' }).props, { budget: 1, texte: 'x' }, 'le reste des props, sans `quoi`');
  assert.equal(CE.default({ quoi: 'ailleurs' }), null);
  const carteSrc = APP.slice(APP.indexOf('\nfunction RoomMediaCard('), APP.indexOf('\n}\n', APP.indexOf('\nfunction RoomMediaCard(')));
  assert.ok(carteSrc.includes('<Suspense fallback={null}><CarteEnfant quoi="pastille" className="o-seul-large" levee={v.levee} /></Suspense>'), 'la pastille, sans repli visible');
  assert.ok(carteSrc.includes('<Suspense fallback={null}><CarteEnfant quoi="glyphe" i={bloque === \'coucher\' ? \'moon\' : \'hourglass-end\'} em={emChiffre(\'00\')} /></Suspense>'), 'le glyphe du haut, sans repli visible');
  assert.ok(carteSrc.includes('<Suspense fallback={null}><CarteEnfant quoi="revient" bloque={bloque} reprise={v.reprise} style={RM_MEDIA_PUCE} /></Suspense>'), 'la puce « Revient à », sans repli visible');
  assert.ok(carteSrc.includes('<Suspense fallback={null}><CarteEnfant quoi="pied" budget={temps} bloque={bloque} texte={texteTemps} /></Suspense>'), 'le pied du temps, sans repli visible : il est collé au bas d’une carte de 184 px, rien ne saute');
  assert.ok(APP.includes('<Suspense fallback={null}><CarteEnfant quoi="pastille" petite levee={vd.levee} /></Suspense>'), 'la compacte aussi');
  const src = readFileSync(new URL('../src/carteenfant.jsx', import.meta.url), 'utf8');
  assert.ok(!/from '\.\/App\.jsx'/.test(src), 'carteenfant.jsx n’importe jamais App.jsx');
  // Et le motif hachuré du plafond vit dans la feuille, plus en ligne dans `RmJauge`.
  assert.ok(APP.includes('data-plafond className="o-jauge-plafond"') && !APP.includes('repeating-linear-gradient(135deg,color-mix(in oklab, var(--o-text3) 32%'), 'la hachure du plafond a quitté le boot pour index.css');
  assert.ok(readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').includes('.o-jauge-plafond { background: repeating-linear-gradient(135deg, color-mix(in oklab, var(--o-text3) 32%, transparent) 0 3px, transparent 3px 8px); }'));
});

test('E15, E16 : un écran bloqué (temps écoulé), éteint — la phrase du blocage, la plaque grise au sablier, pas de lavis, le pied « Écoulé » en gris, et au téléphone « Revient à 07:30 » à la place d’« Allumer » ; une demande en attente le dit', () => dans(() => {
  const w = poserEnfant({ [ATV]: VUE({ bloque: 'temps', ecran: { ...ECRAN, utilise_s: 5400, reste_s: 0 } }) });
  const m = carte(w, ATV);
  assert.deepEqual([phrase(m).props.children, phrase(m).props.style.color], ['Temps écoulé · demain 07:30', 'var(--o-text2)']);
  assert.ok(glyphe(m, 'hourglass-end'), 'le sablier dans la plaque');
  assert.deepEqual([plaque(m).props.style.background, plaque(m).props.style.color], ['var(--o-s1)', 'var(--o-text3)'], 'la plaque grise');
  assert.ok(!String(m.arbre.props.style.background).includes('rgba('), 'aucun lavis');
  const pied = lazyDe(m, 'PiedTemps');
  assert.equal(pied.props.bloque, 'temps');
  const p = monter(CE.PiedTemps, pied.props);
  assert.deepEqual([attribut(p, 'data-reste').props.children, attribut(p, 'data-reste').props.style.color, attribut(p, 'data-utilise').props.style.background], ['Écoulé', 'var(--o-text2)', 'var(--o-text3)'], 'écoulé, en gris');
  assert.equal(m.trouver(e => e.type === 'button' && /^Allumer /.test(e.props['aria-label'] || '')).length, 0, 'pas d’« Allumer » : la maison le déferait (E16)');
  // ASSERTION MODIFIÉE (passe bis du 17/10, points 3 et 14) : la puce « Revient à » est un `lazy` (carteenfant.jsx) sur la ligne étroite ; montée,
  // elle porte les DEUX écritures — la phrase entière, et l'heure seule pour une carte serrée (index.css, sous 140 px de contenu).
  const puceRevient = lazyDe(m, 'RevientPuce');
  assert.ok(puceRevient && etroite(m), 'la ligne étroite porte « Revient à 07:30 », inerte');
  assert.deepEqual([puceRevient.props.bloque, puceRevient.props.reprise, puceRevient.props.style.height, puceRevient.props.style.borderRadius], ['temps', '07:30', 44, 12], 'le dessin de la puce de 44 (RM_MEDIA_PUCE), passé par la carte');
  const revient = monter(CE.RevientPuce, puceRevient.props);
  assert.ok(attribut(revient, 'data-revient') && revient.texte().includes('Revient à 07:30'));
  assert.deepEqual([classe(revient, 'o-revient-long').props.children, classe(revient, 'o-revient-court').props.children, classe(revient, 'o-revient-court').props['aria-hidden']], ['Revient à 07:30', '07:30', 'true'], 'la forme courte, cachée au lecteur d’écran : la longue le dit déjà');
  assert.equal(attribut(revient, 'data-revient').props.style.padding, '0 10px', 'le rembourrage réduit de la ligne étroite');
  assert.equal(revient.trouver(e => e.type === 'button').length, 0, 'inerte : aucun bouton');
  assert.equal(lazyDe(m, 'GlypheHaut').props.i, 'hourglass-end', 'le chiffre de la carte étroite : le sablier');
  assert.equal(de(m, 'ChiffreHaut'), undefined);
  /* ASSERTION MODIFIÉE (passe bis 2 du 17/10, point 2) : la bascule de la carte large RESTAIT (« un parent peut allumer, la maison éteindra à
   * nouveau »). Bloqué, l'écran n'a plus d'interrupteur : allumé par lui, il serait rééteint vingt secondes plus tard — un bouton tendu que la
   * maison défait. La carte étroite dit « Revient à 07:30 » (ci-dessus), la phrase dit pourquoi ; le parent qui veut l'écran lève les limites. */
  assert.equal(de(m, 'RmBascule'), undefined, 'bloquée, éteinte : plus d’interrupteur à la carte large');
  assert.equal(de(m, 'PuceLecture'), undefined, 'éteinte : rien à reprendre');
  assert.equal(w.appels.length, 0);
  // Une demande en attente : la phrase le dit.
  const w2 = poserEnfant({ [ATV]: VUE({ bloque: 'temps', ecran: { ...ECRAN, utilise_s: 5400, reste_s: 0 }, demande: { appareil: ATV, quand: Date.now() / 1000, reponse: null } }) });
  assert.equal(phrase(carte(w2, ATV)).props.children, 'Temps écoulé · demande envoyée');
  fini();
}));

test('E15, E16, E10 : une Echo au coucher — « Coucher · revient à 07:30 », la plaque à la lune, le plafond à 20 (« max 20 % ») ; en lecture, « Coucher · {titre} » ; le chiffre étroit est la lune', () => dans(() => {
  const w = poserEnfant({ [OFF]: VUE({ bloque: 'coucher', plafond: 20 }), [HACS]: VUE({ bloque: 'coucher', plafond: 20 }) }, (c) => { c[OFF].state = 'idle'; c[HACS].state = 'idle'; });
  const m = carte(w, OFF);
  assert.deepEqual([phrase(m).props.children, phrase(m).props.style.color], ['Coucher · revient à 07:30', 'var(--o-text2)']);
  assert.ok(glyphe(m, 'moon'), 'la lune dans la plaque');
  assert.equal(img(m), undefined, 'pas de pochette');
  assert.equal(lazyDe(m, 'GlypheHaut').props.i, 'moon');
  assert.equal(attribut(m, 'data-volume').props.children, 'Volume 30' + NBSP + '% · max 20' + NBSP + '%', 'le plafond du coucher');
  assert.deepEqual(m.trouver(e => e.type && e.type.name === 'RmJauge').map(j => j.props.plafond), [20, 20]);
  de(m, 'RmJauge').props.onCommit(50);
  assert.equal(w.appels.at(-1), 'media_player.volume_set ' + HACS + ' volume_level=0.2', 'le geste s’arrête à 20');
  // En lecture au coucher : ce qui joue, la lune reste.
  const w2 = poserEnfant({ [OFF]: VUE({ bloque: 'coucher', plafond: 20 }), [HACS]: VUE({ bloque: 'coucher', plafond: 20 }) });
  const m2 = carte(w2, OFF);
  assert.equal(phrase(m2).props.children, 'Coucher · Bin K’uchul Xibalba · Metal_Chaos');
  assert.ok(glyphe(m2, 'moon') && !img(m2), 'la lune, pas la pochette');
  assert.ok(!String(m2.arbre.props.style.background).includes('rgba('), 'bloquée : pas de lavis, même en lecture');
  fini();
}));

test('E14 : les limites levées — la pastille « Limites levées » en accent doux, plus de plafond, le geste libre ; un profil désactivé — ni pastille ni plafond, la source revient', () => dans(() => {
  const leve = Math.round(Date.now() / 1000) + 1800;
  const w = poserEnfant({ [OFF]: VUE({ actif: true, leve_jusqua: leve, plafond: null }), [HACS]: VUE({ actif: true, leve_jusqua: leve, plafond: null }) });
  const m = carte(w, OFF);
  const pastille = lazyDe(m, 'PastilleEnfant');
  const p = monter(CE.PastilleEnfant, pastille.props);
  assert.deepEqual([pastille.props.levee, p.texte().includes('Limites levées'), p.texte().includes('Mode enfant')], [true, true, false]);
  assert.deepEqual([p.arbre.props['data-enfant'], p.arbre.props.style.color, glyphe(p, 'unlock') != null], ['levee', 'var(--o-accent-soft)', true]);
  assert.deepEqual(m.trouver(e => e.type && e.type.name === 'RmJauge').map(j => j.props.plafond), [null, null], 'aucune borne');
  assert.deepEqual(m.trouver(e => e.type && e.type.name === 'RmJauge').map(j => j.props.etat), [null, null], 'rien à dire de plus au lecteur d’écran (point 9)');
  assert.equal(attribut(m, 'data-volume').props.children, 'Volume 30' + NBSP + '%');
  de(m, 'RmJauge').props.onCommit(70);
  assert.deepEqual(w.appels, ['media_player.volume_set ' + HACS + ' volume_level=0.7'], 'le geste libre');
  // Désactivé (E14 : rien n'agit, tout se voit dans la popup) : la carte est celle d'avant.
  // ASSERTION MODIFIÉE (passe bis du 17/10, point 11) : désactivé, un écran à budget n'a plus de pied du temps non plus — le volume revient au pied.
  const w2 = poserEnfant({ [TV]: VUE({ actif: false, plafond: null, ecran: ECRAN }) });
  const tv = carte(w2, TV);
  assert.equal(lazyDe(tv, 'PastilleEnfant'), undefined, 'un profil désactivé n’a pas de pastille (§ 6.3)');
  assert.equal(attribut(tv, 'data-source').props.children, 'Netflix', 'la source revient');
  assert.deepEqual(tv.trouver(e => e.type && e.type.name === 'RmJauge').map(j => j.props.plafond), [null, null]);
  assert.equal(lazyDe(tv, 'PiedTemps'), undefined, 'désactivé : ni « Temps d’écran » ni « Écoulé » (§ 6.3)');
  assert.equal(attribut(tv, 'data-volume').props.children, 'Volume 40' + NBSP + '%', 'le volume reprend le pied');
  assert.equal(de(tv, 'Surface').props.label, 'TV du salon, Stranger Things · S4 - E1, Volume 40 %', 'la surface ne dit plus le temps ni le profil');
  // Levées : de même, le temps d'écran ne se dessine pas — les limites ne tiennent pas.
  const w3 = poserEnfant({ [ATV]: VUE({ leve_jusqua: leve, plafond: null, ecran: ECRAN }) }, tvAllumee);
  const atv = carte(w3, ATV);
  assert.ok(lazyDe(atv, 'PastilleEnfant').props.levee && lazyDe(atv, 'PiedTemps') === undefined && attribut(atv, 'data-volume'), 'levées : la pastille, le volume au pied, pas de temps');
  fini();
}));

test('E21 : sans profil dans la maison, la vue ne connaît pas de mode enfant et la carte ne s’abonne pas ; E17 : la compacte prend le glyphe seul', () => dans(() => {
  const w = poser();
  const Temoin = ({ id, hass }) => { const v = F.useVueLecteur(hass, id); return createElement('i', { 'data-enfant': v.enfant === null ? 'aucun' : 'oui', 'data-plafond': String(v.plafond), 'data-pastille': String(v.pastille) }); };
  const t = monter(Temoin, { id: OFF, hass: w.hass() });
  assert.deepEqual([t.arbre.props['data-enfant'], t.arbre.props['data-plafond'], t.arbre.props['data-pastille']], ['aucun', 'null', 'false']);
  assert.ok(APP.includes('const enfantActif = actif && !!lecteur && maisonAvecEnfant();') && APP.includes('useEtatEnfant(enfantActif)'), 'la carte ne demande l’état du mode enfant que si la maison a un profil');
  // La compacte : le glyphe `child-head` seul, la phrase du blocage ; levées, `unlock`.
  const w2 = poserEnfant({ [OFF]: VUE({ bloque: 'coucher', plafond: 20 }), [HACS]: VUE({ bloque: 'coucher', plafond: 20 }) }, (c) => { c[OFF].state = 'idle'; c[HACS].state = 'idle'; });
  const c = monter(F.CvCard, { id: OFF, hass: w2.hass(), onOpen: () => {}, dense: true });
  const petite = lazyDe(c, 'PastilleEnfant');
  assert.deepEqual([petite.props.petite, petite.props.levee], [true, false]);
  const pm = monter(CE.PastilleEnfant, petite.props);
  assert.ok(glyphe(pm, 'child-head') && !pm.texte().includes('Mode enfant'), 'le glyphe seul, pas le mot');
  assert.ok(c.texte().includes('Coucher · revient à 07:30'), 'la phrase du blocage');
  const w3 = poserEnfant({ [OFF]: VUE({ leve_jusqua: Math.round(Date.now() / 1000) + 600, plafond: null }) });
  assert.equal(lazyDe(monter(F.CvCard, { id: OFF, hass: w3.hass(), onOpen: () => {}, dense: true }), 'PastilleEnfant').props.levee, true);
  fini();
}));

/* ── La passe bis 2 du 17/10 (chantier Mode enfant) : le chiffre suit le doigt, l'écran bloqué n'a plus d'interrupteur ───────────── */

/* TEST AJOUTÉ (passe bis 2 du 17/10, point 1). Sa capture : sur « Echo Dot Bureau », la barre suit le doigt mais « Volume 50 % » reste figé
 * jusqu'au relâcher et à la réponse de l'Echo ; sa maquette fait suivre le chiffre en direct. La barre de la maison (`RmJauge`) peint à la main
 * et ne disait rien du doigt à personne : elle annonce maintenant la valeur sous le doigt (`onGlisse`), et la vue du lecteur la garde dans un
 * état que la carte dessine — le mot « Volume {n} % », le chiffre de la carte étroite, la surface. L'ordre, lui, ne part qu'au relâcher. */
const barreSousLeDoigt = (props, x, largeur = 226) => {
  // Le harnais ne rend pas les enfants : la VRAIE barre se monte avec les props que la carte lui passe, et un doigt se pose à `x`.
  const barre = monter(F.RmJauge, props);
  const el = { querySelector: () => null, getBoundingClientRect: () => ({ left: 0, width: largeur }), classList: { add() {}, remove() {} }, setPointerCapture() {}, onpointermove: null, onpointerup: null, onpointercancel: null };
  barre.arbre.props.onPointerDown({ stopPropagation() {}, preventDefault() {}, currentTarget: el, clientX: x, pointerId: 1 });
  return el;
};
const barreLarge = (m) => m.trouver(e => e.type && e.type.name === 'RmJauge' && e.props.zone == null)[0].props;
const barreEtroite = (m) => m.trouver(e => e.type && e.type.name === 'RmJauge' && e.props.zone === 44)[0].props;
const motVolume = (m) => attribut(m, 'data-volume').props.children;

test('passe bis 2, point 1 : le chiffre du volume suit le doigt — le mot de la carte large, le chiffre de la carte étroite, la surface ; l’ordre ne part qu’au relâcher, une seule fois, sans repasser par l’ancienne valeur', () => dans(({ h }) => {
  const w = poser();
  const m = carte(w, OFF);
  assert.equal(motVolume(m), 'Volume 30' + NBSP + '%');
  assert.ok(m.trouver(e => e.type && e.type.name === 'RmJauge').every(j => typeof j.props.onGlisse === 'function'), 'les deux barres, large et étroite, annoncent le doigt');
  // Le doigt se pose à 100 px sur 226 : 50 % de la piste utile.
  const el = barreSousLeDoigt(barreLarge(m), 100);
  m.rendre();
  assert.equal(motVolume(m), 'Volume 50' + NBSP + '%', 'posé sur la barre : le mot suit');
  assert.equal(de(m, 'ChiffreHaut').props.v, 50, 'et le chiffre de la carte étroite');
  assert.equal(de(m, 'ChiffreHaut').props.u, '%');
  assert.ok(de(m, 'Surface').props.label.includes('Volume 50 %'), 'et ce que la surface dit au lecteur d’écran');
  assert.deepEqual(w.appels, [], 'rien ne part pendant le glisser');
  for (const [x, attendu] of [[130, 65], [160, 80], [40, 20]]) {
    el.onpointermove({ clientX: x });
    m.rendre();
    assert.equal(motVolume(m), 'Volume ' + attendu + NBSP + '%', 'le mot suit le doigt, à ' + attendu);
    assert.equal(de(m, 'ChiffreHaut').props.v, attendu);
    assert.deepEqual(w.appels, [], 'toujours rien : l’ordre part au relâcher, jamais à chaque pas');
  }
  assert.deepEqual([barreLarge(m).v, barreEtroite(m).v], [20, 20], 'la barre reçoit la valeur du doigt : tout se tient');
  el.onpointerup();
  m.rendre();
  assert.deepEqual(w.appels, ['media_player.volume_set ' + HACS + ' volume_level=0.2'], 'UN seul `volume_set`, au relâcher');
  assert.equal(motVolume(m), 'Volume 20' + NBSP + '%', 'le geste d’abord : le chiffre garde la valeur posée, il ne repasse pas par 30');
  assert.equal(de(m, 'ChiffreHaut').props.v, 20);
  // ASSERTION MODIFIÉE (18/10) : la maison ne répond pas (la doublure reste à 30) — le filet du volume (sept secondes : la réponse de la
  // jumelle et un relevé du pont) redit ce que la maison dit ; à 4,1 s, il tient encore.
  h.avancer(4100);
  m.rendre();
  assert.equal(motVolume(m), 'Volume 20' + NBSP + '%');
  h.avancer(3000);
  m.rendre();
  assert.equal(motVolume(m), 'Volume 30' + NBSP + '%');
  // Un doigt qui s'en va sans relâcher (la page défile : `pointercancel`) : le chiffre revient, rien ne part.
  const e2 = barreSousLeDoigt(barreLarge(m), 150);
  m.rendre();
  assert.equal(motVolume(m), 'Volume 75' + NBSP + '%');
  e2.onpointercancel();
  m.rendre();
  assert.equal(motVolume(m), 'Volume 30' + NBSP + '%', 'annulé : la valeur de la maison');
  assert.equal(w.appels.length, 1, 'aucun ordre de plus');
}));

test('passe bis 2, point 1 : sous un plafond, le chiffre suit le doigt SANS le dépasser — « Volume 40 % · max 40 % » à 95 % de la piste ; relâché, le seul `volume_set` est au plafond, sans « Limité à »', () => dans(() => {
  const w = poserEnfant({ [OFF]: VUE(), [HACS]: VUE() });
  const m = carte(w, OFF);
  const el = barreSousLeDoigt(barreLarge(m), 40);
  m.rendre();
  assert.equal(motVolume(m), 'Volume 20' + NBSP + '% · max 40' + NBSP + '%');
  for (const x of [100, 190, 225]) {
    el.onpointermove({ clientX: x });
    m.rendre();
    assert.equal(motVolume(m), 'Volume 40' + NBSP + '% · max 40' + NBSP + '%', 'à ' + x + ' px, la barre empêche : la valeur montrée ne dépasse pas le plafond');
    assert.equal(de(m, 'ChiffreHaut').props.v, 40);
    assert.equal(barreLarge(m).plafond, 40);
  }
  assert.deepEqual(w.appels, []);
  el.onpointerup();
  m.rendre();
  assert.deepEqual(w.appels, ['media_player.volume_set ' + HACS + ' volume_level=0.4'], 'au plafond, jamais plus haut');
  assert.equal(motVolume(m), 'Volume 40' + NBSP + '% · max 40' + NBSP + '%', 'la barre a borné le geste : ce n’est pas une butée, pas de « Limité à 40 % »');
  assert.equal(barreLarge(m).etat, 'max 40' + NBSP + '%');
  fini();
}));

test('passe bis 2, point 1 : un son coupé — tirer la barre le rend : le chiffre suit le doigt au lieu de « Muet », `volume_mute` faux puis `volume_set` au relâcher, et la carte ne redit pas « Muet » en attendant la réponse', () => dans(({ h }) => {
  const w = poser((c) => { c[HACS].attributes.is_volume_muted = true; });
  const m = carte(w, OFF);
  assert.deepEqual([motVolume(m), de(m, 'ChiffreHaut').props.v, barreLarge(m).couleur], ['Muet', 'Muet', 'var(--o-text3)']);
  const el = barreSousLeDoigt(barreLarge(m), 100);
  m.rendre();
  assert.deepEqual([motVolume(m), de(m, 'ChiffreHaut').props.v, barreLarge(m).couleur, barreLarge(m).etat], ['Volume 50' + NBSP + '%', 50, 'var(--o-accent)', null], 'le geste va rendre le son : le chiffre et la barre le disent déjà');
  assert.deepEqual(w.appels, []);
  el.onpointerup();
  m.rendre();
  assert.deepEqual(w.appels, ['media_player.volume_mute ' + HACS + ' is_volume_muted=false', 'media_player.volume_set ' + HACS + ' volume_level=0.5']);
  assert.deepEqual([motVolume(m), de(m, 'ChiffreHaut').props.v], ['Volume 50' + NBSP + '%', 50], 'le geste d’abord : pas de « Muet » entre le relâcher et la réponse');
  /* ASSERTION MODIFIÉE (18/10, son retour : la barre « revient en arrière avant de se mettre là où je l'ai réglé ») : le filet du volume et du
   * muet couvre la réponse de la jumelle ET un relevé du pont — sept secondes, plus quatre. La maison ne répond pas (la doublure reste muette) :
   * à 4,1 s, la carte attend encore ; à 7,1 s, elle redit ce que la maison dit. */
  h.avancer(4100);
  m.rendre();
  assert.equal(motVolume(m), 'Volume 50' + NBSP + '%');
  h.avancer(3000);
  m.rendre();
  assert.equal(motVolume(m), 'Muet');
}));

/* TEST AJOUTÉ (18/10, son retour : « quand je règle le volume il revient aussi en arrière avant de se mettre là où je l'ai réglé ; dans
 * l'intégration Alexa ou Alexa Media Player de HACS le volume se règle bien, donc ça vient de Loggia »). Une Echo se règle par sa jumelle
 * HACS (`alexa_media`, celle qui a le plus de gestes), qui met 1,9 à 2,8 s à rapporter le volume — mesuré dans son historique, l'officielle
 * 0,6 s —, et le pont ne le voit qu'au relevé suivant (`HASS_POLL_MS`, 2 s) : la réponse arrive jusqu'à 4,8 s après le relâcher. Le filet
 * tombait à 4 s : la barre revenait à l'ancien volume, puis sautait au nouveau au relevé d'après. Reproduit en démo, la réponse retenue
 * 2,8 s : 28 → 38, « 28 » à 4,0 s, « 38 » à 4,7 s. Le filet couvre désormais cinq secondes de réponse et un relevé ; une réponse, quelle
 * qu'elle soit — la maison qui ramène au plafond —, le lève aussitôt. */
test('18/10 : une Echo lente — relâché à 20, la jumelle répond après 4 s : la carte garde 20 sans repasser par 30, puis lit la réponse ; sans réponse, le filet tombe à 7 s (5 s de réponse et un relevé de 2 s) ; une autre réponse le lève aussitôt', () => dans(({ h }) => {
  const w = poser();
  const m = carte(w, OFF);
  barreLarge(m).onCommit(20);
  m.rendre();
  assert.deepEqual(w.appels, ['media_player.volume_set ' + HACS + ' volume_level=0.2']);
  h.avancer(4500);
  m.rendre();
  assert.deepEqual([motVolume(m), barreLarge(m).v, barreEtroite(m).v, de(m, 'ChiffreHaut').props.v], ['Volume 20' + NBSP + '%', 20, 20, 20], 'à 4,5 s, la jumelle n’a pas encore répondu : la carte garde 20, elle ne repasse pas par 30');
  // La jumelle répond enfin (les deux entités de l'Echo, comme chez lui) : la carte lit 20.
  w.courants[HACS].attributes.volume_level = .2; w.courants[OFF].attributes.volume_level = .2;
  m.proprietes({ hass: w.hass() });
  assert.deepEqual([motVolume(m), barreLarge(m).v], ['Volume 20' + NBSP + '%', 20]);
  // Sans réponse du tout, le filet tombe quand même : à 6,9 s il tient, à 7,1 s la carte redit ce que la maison dit.
  const w2 = poser();
  const m2 = carte(w2, OFF);
  barreLarge(m2).onCommit(20);
  m2.rendre();
  h.avancer(6900);
  m2.rendre();
  assert.equal(motVolume(m2), 'Volume 20' + NBSP + '%', 'à 6,9 s, il tient encore');
  h.avancer(200);
  m2.rendre();
  assert.equal(motVolume(m2), 'Volume 30' + NBSP + '%', 'à 7,1 s, ce que la maison dit');
  // Une AUTRE réponse — la maison qui ramène, une autre main — lève le filet aussitôt : rien ne la cache.
  const w3 = poser();
  const m3 = carte(w3, OFF);
  barreLarge(m3).onCommit(20);
  m3.rendre();
  h.avancer(1000);
  w3.courants[HACS].attributes.volume_level = .35;
  m3.proprietes({ hass: w3.hass() });
  assert.equal(motVolume(m3), 'Volume 35' + NBSP + '%', 'la maison a parlé : sa valeur, tout de suite');
  // Le filet se dit dans le source : cinq secondes de réponse, un relevé du pont.
  assert.ok(APP.includes('const filetVolume = 5000 + HASS_POLL_MS;') && APP.includes('useOptimiste(l ? l.vol : null, filetVolume)') && APP.includes('useOptimiste(l ? l.muted : null, filetVolume)'), 'le volume et le muet, sur le même filet');
}));

/* TEST AJOUTÉ (passe bis 2 du 17/10, point 2). La bascule de la carte large restait sur un écran bloqué (« un parent peut allumer, la maison
 * éteindra à nouveau ») : l'enfant allume, la maison rééteint vingt secondes plus tard — un bouton tendu que la maison défait. Bloqué, l'écran
 * n'a plus d'interrupteur, allumé ou non ; la carte étroite et la popup disent déjà « Revient à {h} ». */
test('passe bis 2, point 2 : un écran bloqué n’offre plus d’interrupteur à la carte large — temps écoulé ou coucher, éteint ou allumé (la grâce) ; dans ses heures, limites levées ou profil éteint, il est là', () => dans(() => {
  const ecoule = { bloque: 'temps', ecran: { ...ECRAN, utilise_s: 5400, reste_s: 0 } };
  const bascule = (lecteurs, retouche = null) => de(carte(poserEnfant(lecteurs, retouche), ATV), 'RmBascule');
  assert.equal(bascule({ [ATV]: VUE(ecoule) }), undefined, 'temps écoulé, éteinte');
  assert.equal(bascule({ [ATV]: VUE(ecoule) }, tvAllumee), undefined, 'temps écoulé, allumée (les vingt secondes de grâce) : l’interrupteur ne reparaît pas');
  assert.equal(bascule({ [ATV]: VUE({ bloque: 'coucher', plafond: 20 }) }), undefined, 'au coucher, éteinte');
  assert.equal(bascule({ [ATV]: VUE({ bloque: 'coucher', plafond: 20 }) }, tvAllumee), undefined, 'au coucher, allumée');
  // Dans ses heures, avec du budget : l'interrupteur est là, `turn_on` explicite.
  const w = poserEnfant({ [ATV]: VUE({ ecran: ECRAN }) });
  const m = carte(w, ATV);
  const b = de(m, 'RmBascule');
  assert.deepEqual([b.props.on, b.props.className], [false, 'o-seul-large'], 'dans ses heures, la bascule de la carte large');
  m.appuyer(b, 'onToggle');
  assert.deepEqual(w.appels, ['media_player.turn_on ' + ATV]);
  // Les limites levées, ou le profil éteint : la carte est celle d'avant — la bascule revient, même si le serveur parlait encore de blocage.
  const leve = Math.round(Date.now() / 1000) + 1800;
  assert.ok(bascule({ [ATV]: VUE({ ...ecoule, leve_jusqua: leve, plafond: null }) }), 'limites levées');
  assert.ok(bascule({ [ATV]: VUE({ ...ecoule, actif: false, plafond: null }) }), 'profil désactivé');
  // Sans profil dans la maison, rien ne change.
  fini();
  assert.ok(de(carte(poser(), ATV), 'RmBascule'), 'sans profil : la bascule d’avant');
  fini();
}));

/* ── La passe bis 3 du 17/10 (chantier Mode enfant) : pas de chiffre fantôme ─────────────────────────────────────────────────── */

/* TEST AJOUTÉ (passe bis 3 du 17/10, point 1 ; sa demande, « quand je regle le volume, le pourcentage ne suis pas comme sur la maquette »).
 * La valeur sous le doigt n'expirait pas : sur une Echo, un geste à 80 % pendant que l'Echo devient indisponible, puis revient à 35 % — la
 * carte gardait « Volume 80 % » (aria 80), et « Muet » ne pouvait plus reparaître. Deux gardes, jouées ici chacune SEULE : la vue du lecteur
 * oublie la valeur glissée dès que le lecteur n'est plus vivant (la barre, ici, n'a rien dit) ; la barre qui s'en va lâche le doigt (une Echo
 * vivante qui perd son volume : la vue n'a aucune raison d'oublier, c'est la barre qui le dit en partant). Aucun ordre ne part. */
test('passe bis 3, point 1 : pas de chiffre fantôme — un geste à 80 % sur une Echo qui devient indisponible ; revenue à 35 %, « Muet » reparaît, puis « Volume 35 % » ; aucun ordre ne part', () => dans(() => {
  const w = poser();
  const m = carte(w, CUISINE);
  assert.equal(motVolume(m), 'Volume 35' + NBSP + '%');
  // Le doigt se pose sur la barre, puis glisse à 80 % (160 px sur 226).
  const el = barreSousLeDoigt(barreLarge(m), 100);
  el.onpointermove({ clientX: 160 });
  m.rendre();
  assert.deepEqual([motVolume(m), de(m, 'ChiffreHaut').props.v, barreLarge(m).v], ['Volume 80' + NBSP + '%', 80, 80], 'le chiffre suit le doigt');
  // L'Echo tombe : indisponible, la carte retire son pied — la barre n'a pas pu dire que le doigt s'en allait.
  w.courants[CUISINE] = { ...w.courants[CUISINE], state: 'unavailable' };
  m.proprietes({ hass: w.hass() });
  assert.deepEqual([de(m, 'RmJauge'), attribut(m, 'data-volume')], [undefined, undefined], 'indisponible : ni barre ni volume');
  // Elle revient à 35 %, le son coupé : sa vérité, pas le geste d'avant.
  w.courants[CUISINE] = { ...w.courants[CUISINE], state: 'idle', attributes: { ...w.courants[CUISINE].attributes, volume_level: .35, is_volume_muted: true } };
  m.proprietes({ hass: w.hass() });
  assert.deepEqual([motVolume(m), de(m, 'ChiffreHaut').props.v, barreLarge(m).v, barreLarge(m).etat], ['Muet', 'Muet', 35, 'Muet'], '« Muet » reparaît, la barre dit 35 (aria 35), plus 80');
  w.courants[CUISINE] = { ...w.courants[CUISINE], attributes: { ...w.courants[CUISINE].attributes, is_volume_muted: false } };
  m.proprietes({ hass: w.hass() });
  assert.deepEqual([motVolume(m), de(m, 'ChiffreHaut').props.v], ['Volume 35' + NBSP + '%', 35]);
  assert.ok(de(m, 'Surface').props.label.endsWith('Volume 35 %'), 'la surface aussi : ' + de(m, 'Surface').props.label);
  assert.deepEqual(w.appels, [], 'aucun ordre n’est parti : le geste n’a jamais été relâché');
  // L'autre garde : l'Echo reste vivante mais perd son volume (`volume_level` absent : pas de barre) pendant le geste ; la barre démontée lâche le doigt.
  const w2 = poser();
  const m2 = carte(w2, CUISINE);
  const barre = monter(F.RmJauge, barreLarge(m2));
  const el2 = { querySelector: () => null, getBoundingClientRect: () => ({ left: 0, width: 226 }), classList: { add() {}, remove() {} }, setPointerCapture() {}, onpointermove: null, onpointerup: null, onpointercancel: null };
  barre.arbre.props.onPointerDown({ stopPropagation() {}, preventDefault() {}, currentTarget: el2, clientX: 160, pointerId: 1 });
  m2.rendre();
  assert.equal(motVolume(m2), 'Volume 80' + NBSP + '%');
  const sansVolume = { ...w2.courants[CUISINE].attributes };
  delete sansVolume.volume_level;
  w2.courants[CUISINE] = { ...w2.courants[CUISINE], attributes: sansVolume };
  m2.proprietes({ hass: w2.hass() });
  assert.equal(de(m2, 'RmJauge'), undefined, 'sans volume : plus de barre');
  barre.demonter();   // ce que React fait de la barre qui n'est plus dessinée
  assert.equal(el2.onpointerup, null, 'le relâcher qui tomberait ensuite ne commande rien');
  w2.courants[CUISINE] = { ...w2.courants[CUISINE], attributes: { ...sansVolume, volume_level: .35 } };
  m2.proprietes({ hass: w2.hass() });
  assert.deepEqual([motVolume(m2), barreLarge(m2).v], ['Volume 35' + NBSP + '%', 35], 'le volume revenu est celui de l’Echo');
  assert.deepEqual(w2.appels, []);
}));
