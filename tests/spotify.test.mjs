/* Spotify dans les Médias (ADR 0344) : les playlists du compte et celles ajoutées par lien, l'enceinte d'une Echo, et où la
 * rangée se montre. La règle du lien est la même au serveur (spotify.py) et à l'écran (spotify.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uriSpotify, comptesSpotify, lirePlaylists, dossierPlaylists, playlistsDuDossier, playlistAjoutee, ajouterPlaylist, retirerPlaylist, rangeePlaylists, enceintePour, enceinteParDefaut, MAX_AJOUTEES, playlistsMontrees, basculerCachee, cacherToutes } from '../src/spotify.js';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const URI = 'spotify:playlist:0SlqjJVYUJSNpMjVfYmr7X';

test('le lien, l’URI, l’identifiant de l’arbre : une seule URI', () => {
  assert.equal(uriSpotify('https://open.spotify.com/playlist/0SlqjJVYUJSNpMjVfYmr7X?si=zuvn-8KBRB2eYgjDdVpiyQ'), URI);
  assert.equal(uriSpotify('  https://open.spotify.com/intl-fr/playlist/37i9dQZF1DX2jdUWwSgTho '), 'spotify:playlist:37i9dQZF1DX2jdUWwSgTho');
  assert.equal(uriSpotify(URI), URI);
  assert.equal(uriSpotify('spotify://0123abcd/' + URI), URI);
  assert.equal(uriSpotify('https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy'), 'spotify:album:4aawyAB9vmqN3uQ7FjRGTy');
  for (const rien of ['', null, undefined, 'bonjour', 'https://open.spotify.com/track/0SlqjJVYUJSNpMjVfYmr7X', 'spotify:playlist:court']) assert.equal(uriSpotify(rien), null);
});

test('la même règle au serveur et à l’écran', () => {
  const py = lire('custom_components/loggia/spotify.py');
  assert.ok(py.includes('_URI = re.compile(r"spotify:(playlist|album):([A-Za-z0-9]{10,40})")'));
  assert.ok(py.includes('_LIEN = re.compile(r"open\\.spotify\\.com/(?:[a-z-]+/)?(playlist|album)/([A-Za-z0-9]{10,40})")'));
});

test('les comptes : l’intégration officielle seule, et rien sans index', () => {
  const index = { entityMeta: new Map([['media_player.spotify_b', { platform: 'spotify' }], ['media_player.spotify_a', { deviceId: 'd1' }], ['media_player.echo', { platform: 'alexa_media' }]]), deviceMeta: new Map([['d1', { integration: 'spotify' }]]) };
  const etats = { 'media_player.spotify_b': {}, 'media_player.spotify_a': {}, 'media_player.echo': {}, 'sensor.spotify': {} };
  assert.deepEqual(comptesSpotify(etats, index), ['media_player.spotify_a', 'media_player.spotify_b']);
  assert.deepEqual(comptesSpotify(etats, null), []);
});

test('l’arbre : le dossier des playlists, avec ou sans préfixe, et ses playlists seules, sans doublon', () => {
  assert.equal(dossierPlaylists({ children: [{ title: 'Artists', media_content_id: 'current_user_followed_artists' }, { title: 'Playlists', media_content_id: 'spotify://e1/current_user_playlists' }] }).title, 'Playlists');
  assert.equal(dossierPlaylists({ children: [{ title: 'Playlists', media_content_id: 'current_user_playlists' }] }).title, 'Playlists');
  assert.equal(dossierPlaylists({ children: [] }), null);
  assert.equal(dossierPlaylists(null), null);
  const d = playlistsDuDossier({ children: [
    { title: ' Ma playlist ', media_content_id: 'spotify://e1/' + URI, can_play: true, thumbnail: 'https://i.scdn.co/image/ab67' },
    { title: 'Doublon', media_content_id: URI, can_play: true },
    { title: 'Dossier', media_content_id: 'spotify://e1/current_user_playlists', can_play: false },
    { title: 'Image embarquée', media_content_id: 'spotify:playlist:1dXkQc3mOvD0nJpSk2Lb4M', can_play: true, thumbnail: 'data:image/png;base64,AAAA' },
    { title: '', media_content_id: 'spotify:playlist:4aQqG0r9Xg2wS7LpT1nVbE', can_play: true },
  ] });
  assert.deepEqual(d, [{ t: 'Ma playlist', i: URI, v: 'https://i.scdn.co/image/ab67', d: true }, { t: 'Image embarquée', i: 'spotify:playlist:1dXkQc3mOvD0nJpSk2Lb4M', v: null, d: true }]);
});

test('ajouter par lien : un lien lisible ET un nom ; la plus récente devant, sans doublon, vingt-quatre au plus', () => {
  assert.equal(playlistAjoutee('https://open.spotify.com/playlist/37i9dQZF1DX2jdUWwSgTho?si=x', '  '), null);
  assert.equal(playlistAjoutee('https://open.spotify.com/track/37i9dQZF1DX2jdUWwSgTho', 'Titre'), null);
  const p = playlistAjoutee('https://open.spotify.com/playlist/37i9dQZF1DX2jdUWwSgTho?si=x', ' Top Hits Kids ');
  assert.deepEqual(p, { t: 'Top Hits Kids', i: 'spotify:playlist:37i9dQZF1DX2jdUWwSgTho' });
  let l = ajouterPlaylist([], p);
  l = ajouterPlaylist(l, { t: 'Autre nom', i: p.i });
  assert.deepEqual(l, [{ t: 'Autre nom', i: p.i }], 'une même URI garde le dernier nom');
  assert.deepEqual(retirerPlaylist(l, p.i), []);
  let grande = [];
  for (let n = 0; n < 40; n++) grande = ajouterPlaylist(grande, { t: 'P' + n, i: 'spotify:playlist:' + String(n).padStart(12, 'a') });
  assert.equal(grande.length, MAX_AJOUTEES);
  assert.equal(grande[0].t, 'P39');
});

test('la rangée : celles du compte, puis celles ajoutées qui n’y sont pas', () => {
  const lues = [{ t: 'Ma playlist', i: URI, v: null, d: true }];
  const r = rangeePlaylists(lues, [{ t: 'Copie', i: URI }, { t: 'Top Hits Kids', i: 'spotify:playlist:37i9dQZF1DX2jdUWwSgTho' }, { t: 'Abîmée', i: 'bonjour' }, null]);
  assert.deepEqual(r.map(p => [p.t, p.d]), [['Ma playlist', true], ['Top Hits Kids', false]]);
  assert.deepEqual(rangeePlaylists(null, null), []);
});

test('l’enceinte d’une Echo : les mêmes mots, et une seule candidate', () => {
  const sources = ['Echo - Salon', 'Echo Dot - Bureau', 'Partout', 'Web Player (Chrome)'];
  assert.equal(enceintePour(['Echo Salon'], sources), 'Echo - Salon');
  assert.equal(enceintePour(['Echo Dot Bureau'], sources), 'Echo Dot - Bureau');
  assert.equal(enceintePour(['Echo Show Salon'], sources), null, 'rien au jugé');
  assert.equal(enceintePour(['Inconnue', 'Partout'], sources), 'Partout', 'un autre de ses noms sert');
  assert.equal(enceintePour(['Echo Salon'], ['Echo - Salon', 'Echo Salon']), null, 'deux candidates : aucune');
  assert.equal(enceintePour([], sources), null);
});

test('l’enceinte proposée : la retenue si Spotify la voit, sinon celle qui joue, sinon la première', () => {
  const s = ['Echo - Salon', 'Partout'];
  assert.equal(enceinteParDefaut('Partout', 'Echo - Salon', s), 'Partout');
  assert.equal(enceinteParDefaut('Disparue', 'Echo - Salon', s), 'Echo - Salon');
  assert.equal(enceinteParDefaut(null, null, s), 'Echo - Salon');
  assert.equal(enceinteParDefaut('Partout', null, []), null);
});

test('où elle se montre : Objets › Multimédia, et la fiche d’une Echo', () => {
  const o = lire('src/vues/objets.jsx');
  assert.ok(o.includes("const RangeeSpotify = lazyRecharge(() => import('../spotifymedias.jsx'));"));
  // ASSERTION MODIFIÉE (11/11, ADR 0345) : la rangée sait qu'on est en édition, pour y poser ses coches.
  assert.ok(o.includes("{actuel === 'multimedia' && <Barriere repli={null}><Suspense fallback={null}><RangeeSpotify hass={hass} edit={edit} /></Suspense></Barriere>}"));
  const f = lire('src/fichemedia.jsx');
  assert.ok(f.includes('{vivante && !v.bloque && lecteur.alexa && <PanneauSpotify hass={v.hass} noms={nomsSpotify} />}'));
  assert.ok(f.indexOf('<PanneauSpotify') < f.indexOf('<PanneauMinuteur v={v}'), 'avant le minuteur');
});

test('la rangée et la fiche : le serveur lance, un menu de la maison, les flèches à la souris, aucune couleur en dur', () => {
  const m = lire('src/spotifymedias.jsx');
  // ASSERTION MODIFIÉE (11/11, ADR 0346) : les playlists se lisent par `lirePlaylists` (spotify.js), plus par l'arbre du lecteur ici.
  assert.ok(m.includes("type: 'loggia/spotify/jouer'") && m.includes('await lirePlaylists(h, compte)') && !m.includes("type: 'media_player/browse_media'"));
  assert.ok(m.includes('<ListeChoix label={tr(\'Écouter sur\')}') && !/<select/.test(m), 'un menu de la maison, jamais un <select>');
  assert.ok(m.includes('className="o-qscenes-fleche"'), 'les flèches des scénarios, cachées au doigt');
  assert.ok(m.includes("if (rangee.current === el && Math.abs(el.scrollLeft - depart) < 2) el.scrollBy({ left: pas, behavior: 'auto' });"), 'un moteur qui n’anime pas ne laisse pas la rangée sur place');
  assert.ok(m.includes('{admin && <button type="button" className="o-spotify-ajout"'), 'ajouter par lien : un administrateur');
  assert.ok(!/rgba?\(\d|#[0-9a-f]{3,8}\b/i.test(m.replace(/#fff\b/g, '')), 'aucune couleur en dur, hors le blanc sur l’accent');
  const css = lire('src/index.css');
  assert.ok(css.includes('.o-spotify-sortie { order: 3; flex: 1 0 100%; }'), 'au téléphone, « Écouter sur » prend sa ligne');
  assert.ok(css.includes('@media (max-width: 560px), (pointer: coarse) { .o-spotify-sortie button { min-height: 44px; } }'), 'le menu à 44 px au doigt');
  assert.ok(!/\.o-spotify-rangee \{[^}]*scroll-snap/.test(css), 'sans aimantation : la flèche ne ramène pas la rangée au début');
});

test('les refus du serveur se disent en une phrase', () => {
  const r = lire('src/refus.js');
  for (const code of ['spotify_compte_absent', 'spotify_lien', 'spotify_enceinte_absente', 'spotify_refus']) {
    assert.ok(r.includes('  ' + code + ': () => tr('), code);
    assert.ok(lire('custom_components/loggia/spotify.py').includes('"' + code + '"'), code + ' au serveur');
  }
});

test('choisir les playlists affichées : on range les cachées, la clé s’efface quand tout se montre (ADR 0345)', () => {
  const KIDS = 'spotify:playlist:37i9dQZF1DX2jdUWwSgTho';
  const l = rangeePlaylists([{ t: 'Ma playlist', i: URI, v: null, d: true }], [{ t: 'Top Hits Kids', i: KIDS }]);
  assert.deepEqual(playlistsMontrees(l, null).map(p => p.t), ['Ma playlist', 'Top Hits Kids'], 'rien de caché : tout se montre');
  assert.deepEqual(playlistsMontrees(l, [URI]).map(p => p.t), ['Top Hits Kids']);
  assert.equal(playlistsMontrees(l, 'bonjour').length, 2, 'une valeur abîmée ne cache rien');
  assert.deepEqual(basculerCachee(null, URI), [URI]);
  assert.equal(basculerCachee([URI], URI), null, 'plus rien de caché : la clé s’efface');
  assert.deepEqual(basculerCachee([URI, 7, '', 'bonjour'], KIDS), [URI, KIDS], 'les valeurs abîmées tombent');
  assert.deepEqual(basculerCachee([URI], 'bonjour'), [URI], 'une URI illisible ne touche à rien');
  assert.deepEqual(cacherToutes(l), [URI, KIDS]);
  assert.equal(cacherToutes([]), null);
  const beaucoup = Array.from({ length: 205 }, (_, k) => 'spotify:playlist:' + String(k).padStart(22, 'A'));
  assert.equal(beaucoup.reduce((c, i) => basculerCachee(c, i), null).length, 200, '200 au plus');
});

test('la coche suit le profil, et un compte ordinaire peut la poser', () => {
  assert.ok(lire('src/state.js').includes("  'loggia_spotify_cachees',\n"), 'dans PAR_PROFIL');
  assert.ok(lire('custom_components/loggia/store.py').includes('        "loggia_spotify_cachees",\n'), 'dans AGENCEMENT : ouverte à tous');
  const m = lire('src/spotifymedias.jsx');
  assert.ok(m.includes("const CLE_CACHEES = 'loggia_spotify_cachees';"));
  assert.ok(m.includes('aria-pressed={choix ? choix.montree : undefined}'), 'une bascule, pour le lecteur d’écran');
  assert.ok(m.includes('if (edit) garderCachees(basculerCachee(sp.cachees, p.i)); else lancer(p, enceinte);'), 'en édition, une pochette se coche : elle ne lance rien');
  assert.ok(m.includes('{!edit && sp.sources.length > 0 && ('), '« Écouter sur » s’efface en édition');
  assert.ok(m.includes('{sp.montrees.map(p => ('), 'la fiche d’une Echo ne montre que les cochées');
  assert.ok(m.includes("background: 'var(--o-accent-fond)', color: '#fff' }"), 'cochée : bleu plein, comme une puce choisie');
});

test('les playlists se lisent par le composant, que Spotify joue ou non ; l’arbre du lecteur avant le redémarrage (ADR 0346)', async () => {
  const URI_F = 'spotify:playlist:6mHqR2Zt8KcYw3fNvJ0pLd';
  const dossier = { title: 'Playlists', children: [{ title: 'Footing', media_content_id: 'spotify://01jentree/' + URI_F, can_play: true, thumbnail: 'https://i.scdn.co/image/ab67616d' }] };
  const vus = [];
  const composant = { callWS: (m) => { vus.push(m); return Promise.resolve(dossier); } };
  assert.deepEqual(await lirePlaylists(composant, 'media_player.spotify_maison'), [{ t: 'Footing', i: URI_F, v: 'https://i.scdn.co/image/ab67616d', d: true }]);
  assert.deepEqual(vus, [{ type: 'loggia/spotify/playlists', entity_id: 'media_player.spotify_maison' }], 'une seule demande, au composant');
  // Un composant pas encore redémarré ne connaît pas la commande : l'arbre du lecteur, comme avant.
  const avant = { callWS: (m) => (m.type === 'loggia/spotify/playlists' ? Promise.reject({ code: 'unknown_command', message: 'Unknown command.' })
    : Promise.resolve(m.media_content_id ? dossier : { children: [{ media_content_id: 'current_user_playlists', media_content_type: 'spotify://current_user_playlists' }] })) };
  assert.equal((await lirePlaylists(avant, 'media_player.spotify_maison'))[0].i, URI_F);
  // Tout autre refus remonte : l'écran dit « Spotify ne répond pas. ».
  await assert.rejects(lirePlaylists({ callWS: () => Promise.reject({ code: 'home_assistant_error', message: 'spotify_refus' }) }, 'media_player.spotify_maison'));
});

test('la démo fait comme Home Assistant : à l’arrêt, le lecteur Spotify ne se parcourt pas ; le composant, si', () => {
  const demo = lire('src/demo.js');
  assert.ok(demo.includes("return Promise.reject({ code: 'not_supported', message: 'Player does not support browsing media' });"));
  assert.ok(demo.includes("if (msg && msg.type === 'loggia/spotify/playlists') {"));
  assert.ok(lire('src/spotifymedias.jsx').includes('liste: await lirePlaylists(h, compte)'), 'la rangée et la fiche lisent par le composant');
  assert.ok(lire('custom_components/loggia/spotify.py').includes('from homeassistant.components import spotify as integration'), 'l’intégration se parcourt toujours');
});
