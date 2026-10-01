/* Les favoris de lecture (30/09).
 *
 * « Qu'en est-il des playlists pour la musique ? »
 *
 * Tout tient au contrat de `browse_media` : un élément qui porte `can_play` se
 * rejoue en RECOPIANT son `media_content_id` et son `media_content_type` dans
 * `play_media`. C'est un identifiant opaque — on ne le reconstruit pas, on ne
 * le devine pas, et il ne vaut que pour l'intégration qui l'a émis.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entreeFavorite, memeFavori, basculerFavori, appelPourJouer, MAX_FAVORIS } from '../src/favlecture.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Une réponse de `media_player/browse_media` telle que Spotify la rend. */
const PLAYLIST = {
  title: 'Jazz du soir',
  media_content_id: 'spotify:playlist:0000000000000000000000',
  media_content_type: 'playlist',
  media_class: 'playlist',
  can_play: true,
  can_expand: false,
  thumbnail: 'https://exemple.invalid/pochette.jpg',
};

test('on ne garde que ce qui se rejoue', () => {
  const f = entreeFavorite(PLAYLIST);
  assert.deepEqual(f, { t: 'Jazz du soir', i: PLAYLIST.media_content_id, c: 'playlist', v: PLAYLIST.thumbnail });

  /* Un DOSSIER n'a pas d'identifiant jouable. Le mettre en favori promettrait
   * une lecture qui n'arriverait jamais : on refuse. */
  assert.equal(entreeFavorite({ ...PLAYLIST, can_play: false, can_expand: true }), null);
  // Et tout ce qui manque au contrat.
  assert.equal(entreeFavorite({ ...PLAYLIST, media_content_id: '' }), null);
  assert.equal(entreeFavorite({ ...PLAYLIST, media_content_type: null }), null);
  assert.equal(entreeFavorite({ ...PLAYLIST, title: '   ' }), null);
  assert.equal(entreeFavorite(null), null);
});

test('une vignette embarquée n’est pas gardée', () => {
  /* Une pochette arrive parfois en `data:image/jpeg;base64,…`, de plusieurs
   * centaines de kilo-octets. Le stockage du navigateur en tient cinq
   * méga-octets pour Loggia ENTIER : on préfère perdre l'image que la place. */
  const grosse = 'data:image/jpeg;base64,' + 'A'.repeat(900);
  assert.equal(entreeFavorite({ ...PLAYLIST, thumbnail: grosse }).v, null);
  assert.equal(entreeFavorite({ ...PLAYLIST, thumbnail: 42 }).v, null);
});

test('mettre en favori, puis l’en retirer', () => {
  const a = entreeFavorite(PLAYLIST);
  const b = entreeFavorite({ ...PLAYLIST, title: 'Réveil', media_content_id: 'spotify:playlist:1111' });

  const un = basculerFavori([], a);
  assert.equal(un.length, 1);
  const deux = basculerFavori(un, b);
  assert.deepEqual(deux.map(x => x.t), ['Réveil', 'Jazz du soir'], 'le dernier passe devant');
  // Le meme identifiant le retire, meme si le titre a change chez le fournisseur.
  assert.deepEqual(basculerFavori(deux, { ...a, t: 'Jazz du soir (2026)' }).map(x => x.t), ['Réveil']);
  assert.equal(memeFavori(a, { ...a, t: 'autre' }), true);
  assert.equal(memeFavori(a, b), false);
  assert.equal(memeFavori(a, null), false);
  // Rien d'abime ne rentre, et une liste absente ne casse pas.
  assert.deepEqual(basculerFavori(null, null), []);
  assert.deepEqual(basculerFavori([a, null], null), [a]);
});

test('la liste est bornée', () => {
  let l = [];
  for (let n = 0; n < MAX_FAVORIS + 5; n++) l = basculerFavori(l, entreeFavorite({ ...PLAYLIST, media_content_id: 'x:' + n }));
  assert.equal(l.length, MAX_FAVORIS);
  assert.equal(l[0].i, 'x:' + (MAX_FAVORIS + 4), 'le plus recent est devant');
});

test('relancer un favori recopie l’identifiant, sans rien reconstruire', () => {
  const f = entreeFavorite(PLAYLIST);
  assert.deepEqual(appelPourJouer(f, 'media_player.salon'), {
    domaine: 'media_player', service: 'play_media',
    data: { entity_id: 'media_player.salon', media_content_id: PLAYLIST.media_content_id, media_content_type: 'playlist' },
  });
  // Plutot `null` qu'une commande a moitie remplie.
  assert.equal(appelPourJouer(f, ''), null);
  assert.equal(appelPourJouer(null, 'media_player.salon'), null);
  assert.equal(appelPourJouer({ t: 'x', i: '', c: 'playlist' }, 'media_player.salon'), null);
  assert.equal(appelPourJouer({ t: 'x', i: 'a', c: null }, 'media_player.salon'), null);
});

test('les favoris se rangent PAR lecteur, et l’écran ne décide de rien', () => {
  /* Le choix qui compte : une URI Spotify ne veut rien dire pour un Plex. Les
   * proposer partout ferait echouer la commande en silence, chez le lecteur. */
  const src = readFileSync(join(RACINE, 'src', 'favlecture.js'), 'utf8');
  assert.match(src, /PAR LECTEUR/, 'la raison du rangement par lecteur a disparu du fichier');

  const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  assert.ok(app.includes("const CLE_FAVLECTURE = 'loggia_favlecture';"), 'la cle de rangement a bouge');
  assert.ok(app.includes('favorisLecture(id)'), 'la fiche ne lit plus les favoris du lecteur');
  // Tout ce qui DECIDE vit dans le module pur : l'ecran ne fabrique pas d'appel.
  assert.ok(app.includes('appelPourJouer('), 'la fiche fabrique son appel au lieu de passer par le module');
});

test('la phrase pour un Echo : le seul chemin, et c’est la sienne', async () => {
  /* Une enceinte Alexa ne sait PAS `browse_media` : rien a parcourir, rien a
   * etoiler. Dans `alexa_media`, `play_media` avec le type `custom` appelle
   * `run_custom(media_id)` — le texte est joue comme s'il avait ete dit. La
   * phrase ENTIERE est donc l'identifiant, et elle se range comme un favori. */
  const { phraseAlexa, estEcho, TYPE_PHRASE } = await import('../src/favlecture.js');
  assert.equal(TYPE_PHRASE, 'custom');

  const p = phraseAlexa('  mets ma playlist du soir  ');
  assert.deepEqual(p, { t: 'mets ma playlist du soir', i: 'mets ma playlist du soir', c: 'custom', v: null });
  // Elle repart telle quelle, sans un mot de plus : c'est SA phrase.
  assert.deepEqual(appelPourJouer(p, 'media_player.echo_salon').data, {
    entity_id: 'media_player.echo_salon', media_content_id: 'mets ma playlist du soir', media_content_type: 'custom',
  });
  // Et elle se garde comme n'importe quel favori.
  assert.deepEqual(basculerFavori([], p).map(x => x.c), ['custom']);

  assert.equal(phraseAlexa('   '), null);
  assert.equal(phraseAlexa(null), null);
  assert.equal(phraseAlexa('a'.repeat(201)), null, 'Alexa n’écouterait que le début');

  /* Un Echo se reconnait a son INTEGRATION. Ni son nom, ni ses capacites : un
   * lecteur peut s'appeler « Echo » sans en etre un, et 5644 est un jeu de bits
   * partage par bien d'autres enceintes. */
  assert.equal(estEcho('alexa_media'), true);
  assert.equal(estEcho('cast'), false);
  assert.equal(estEcho(null), false);
});

test('une enceinte qui apparaît DEUX fois : on vise celle qui sait parler', async () => {
  /* Relevé sur une installation réelle (01/10). Les deux intégrations Alexa
   * cohabitent et créent chacune leur entité pour la MÊME enceinte :
   *
   *   l’officielle (« Alexa Devices ») — préfixe par la pièce, ne sait pas la
   *                                      phrase ;
   *   celle de HACS (`alexa_media`)    — la sait, par `run_custom`.
   *
   * Et elles ne les nomment PAS pareil : « Echo Dot - Bureau » d’un côté,
   * « Echo Bureau » de l’autre. Sur trois enceintes, un seul nom concordait —
   * d’où l’appariement par la fin de l’identifiant. */
  const { cibleAlexa } = await import('../src/favlecture.js');
  const e = (nom) => ({ state: 'idle', attributes: { friendly_name: nom } });
  const etats = {
    'media_player.salon_echo_salon': e('Echo - Salon'),      // officielle
    'media_player.echo_salon': e('Echo Salon'),              // HACS, nom different
    'media_player.bureau_echo_dot_bureau': e('Echo Dot - Bureau'),
    'media_player.echo_dot_bureau': e('Echo Bureau'),
    'media_player.enceinte': e('Enceinte salon'),            // rien a voir
  };
  const meta = (p) => ({ deviceId: null, platform: p });
  const index = {
    entityMeta: new Map([
      ['media_player.salon_echo_salon', meta('alexa_devices')],
      ['media_player.echo_salon', meta('alexa_media')],
      ['media_player.bureau_echo_dot_bureau', meta('alexa_devices')],
      ['media_player.echo_dot_bureau', meta('alexa_media')],
      ['media_player.enceinte', meta('cast')],
    ]),
    deviceMeta: new Map(),
  };
  // L'identifiant de l'officielle FINIT par celui de l'autre : c'est le signe.
  assert.equal(cibleAlexa('media_player.salon_echo_salon', etats, index), 'media_player.echo_salon');
  assert.equal(cibleAlexa('media_player.bureau_echo_dot_bureau', etats, index), 'media_player.echo_dot_bureau');
  // Depuis celle de HACS : c'est elle-meme, sans detour.
  assert.equal(cibleAlexa('media_player.echo_salon', etats, index), 'media_player.echo_salon');
  // Un lecteur qui n'est pas un Echo n'en devient pas un.
  assert.equal(cibleAlexa('media_player.enceinte', etats, index), null);

  /* Les MEMES MOTS suffisent aussi, quand les identifiants ne se repondent
   * pas : « Echo - Salon » et « Echo Salon » portent les memes. */
  const autresIds = {
    'media_player.un': e('Echo - Salon'),
    'media_player.deux': e('Echo Salon'),
  };
  const idx2 = { entityMeta: new Map([
    ['media_player.un', meta('alexa_devices')], ['media_player.deux', meta('alexa_media')]]), deviceMeta: new Map() };
  assert.equal(cibleAlexa('media_player.un', autresIds, idx2), 'media_player.deux');

  /* Mais rien ne se rapproche AU JUGE : une enceinte qui ne partage ni la fin
   * de son identifiant ni ses mots reste seule. Viser la mauvaise ferait parler
   * une autre piece, ce qui est pire que ne rien faire. */
  const loin = { 'media_player.un': e('Echo du salon'), 'media_player.deux': e('Echo de la cuisine') };
  assert.equal(cibleAlexa('media_player.un', loin, idx2), null);
  // Et un homonyme qui ne vient pas d'`alexa_media` ne se fait pas adopter.
  const sansHacs = { entityMeta: new Map([
    ['media_player.un', meta('alexa_devices')], ['media_player.deux', meta('cast')]]), deviceMeta: new Map() };
  assert.equal(cibleAlexa('media_player.un', autresIds, sansHacs), null);
  assert.equal(cibleAlexa('media_player.absente', etats, index), null);
});
