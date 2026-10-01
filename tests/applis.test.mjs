/* Les applications d'un appareil de streaming (30/09).
 *
 * « Il faudrait que cela fonctionne aussi pour les autres supports de
 * streaming vidéo autre que l'Apple TV, comme Android TV. »
 *
 * Et c'est précisément là que la règle simple casse : `androidtv_remote`,
 * l'intégration officielle d'Android TV et de Google TV, n'a NI `source_list`
 * NI `select_source`. Ses applications vivent sur l'entité `remote.*`. Une
 * implémentation qui ne connaît que `source_list` marche sur l'Apple TV et ne
 * montre rien sur un Android TV.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applisDe, appelPourLancer, appliCourante, estListeDeSorties, telecommandeDe, FEAT_SOURCE, FEAT_ACTIVITE } from '../src/applis.js';

const e = (state, attributes = {}) => ({ state, attributes });
const idx = (paires) => ({ entityMeta: new Map(paires.map(([id, dev]) => [id, { deviceId: dev }])) });

/* Les valeurs sont celles relevées sur une vraie installation, pas des
 * inventions : l'Apple TV annonce 450487, un Echo 5644, Spotify 2048. */
const APPLE_TV = e('playing', {
  friendly_name: 'Apple TV Séjour',
  supported_features: 450487,
  source_list: ['App Store', 'Arcade', 'Crunchyroll', 'Disney+', 'Netflix', 'Free TV', 'YouTube'],
  app_name: 'Free TV',
  app_id: 'net.oqee.appleos',
});

test('une Apple TV : la liste du lecteur, et l’application en cours', () => {
  const etats = { 'media_player.sejour': APPLE_TV };
  const c = applisDe('media_player.sejour', etats, idx([]));
  assert.equal(c.mode, 'source');
  assert.equal(c.cible, 'media_player.sejour');
  assert.equal(c.liste.length, 7);
  assert.equal(c.courante, 'Free TV', 'l’application en cours vient d’`app_name`');
  assert.deepEqual(appelPourLancer(c, 'Netflix'),
    { domaine: 'media_player', service: 'select_source', data: { entity_id: 'media_player.sejour', source: 'Netflix' } });
});

test('un Android TV officiel : rien sur le lecteur, tout sur sa télécommande', () => {
  /* `androidtv_remote` vaut 153529 — PAS de bit 2048, pas de `source_list`.
   * Sans la seconde branche, cet appareil n'aurait aucune application. */
  const etats = {
    'media_player.tv_chambre': e('on', { friendly_name: 'Android TV', supported_features: 153529, app_name: 'Netflix' }),
    'remote.tv_chambre': e('on', {
      friendly_name: 'Android TV',
      supported_features: FEAT_ACTIVITE,
      activity_list: ['Netflix', 'YouTube', 'Molotov'],
      current_activity: 'YouTube',
    }),
  };
  const index = idx([['media_player.tv_chambre', 'dev-1'], ['remote.tv_chambre', 'dev-1']]);
  assert.equal(telecommandeDe('media_player.tv_chambre', etats, index), 'remote.tv_chambre');
  const c = applisDe('media_player.tv_chambre', etats, index);
  assert.equal(c.mode, 'activite');
  assert.equal(c.cible, 'remote.tv_chambre', 'on commande la télécommande, pas le lecteur');
  assert.equal(c.courante, 'YouTube');
  assert.deepEqual(appelPourLancer(c, 'Molotov'),
    { domaine: 'remote', service: 'turn_on', data: { entity_id: 'remote.tv_chambre', activity: 'Molotov' } });
});

test('la télécommande d’un AUTRE appareil ne compte pas', () => {
  const etats = {
    'media_player.tv': e('on', { supported_features: 153529 }),
    'remote.autre_piece': e('on', { supported_features: FEAT_ACTIVITE, activity_list: ['Netflix'] }),
  };
  const index = idx([['media_player.tv', 'dev-1'], ['remote.autre_piece', 'dev-2']]);
  assert.equal(telecommandeDe('media_player.tv', etats, index), null);
  assert.equal(applisDe('media_player.tv', etats, index), null, 'une télécommande voisine ne se fait pas adopter');
});

test('Spotify : `source_list` désigne des ENCEINTES, pas des applications', () => {
  /* Le même attribut et le même bit 2048 servent à deux choses opposées. Sans
   * cette distinction, la grille proposerait de « lancer » un Echo Dot. */
  const etats = {
    'media_player.spotify': e('idle', {
      friendly_name: 'Spotify',
      supported_features: FEAT_SOURCE,
      source_list: ['Echo - Salon', 'Echo Dot - Bureau', 'Partout'],
    }),
    'media_player.echo_salon': e('idle', { friendly_name: 'Echo - Salon', supported_features: 5644 }),
    'media_player.echo_bureau': e('idle', { friendly_name: 'Echo Dot - Bureau', supported_features: 5644 }),
  };
  assert.equal(estListeDeSorties(['Echo - Salon', 'Echo Dot - Bureau', 'Partout'], etats), true);
  assert.equal(estListeDeSorties(APPLE_TV.attributes.source_list, etats), false, 'des applications ne sont pas des enceintes');
  assert.equal(applisDe('media_player.spotify', etats, idx([])), null, 'Spotify ne montre pas une grille d’applications');
});

test('un appareil ÉTEINT garde sa liste, mais plus rien n’est souligné', () => {
  /* Home Assistant vide `state_attributes` dès que l'état vaut `off` : plus
   * d'`app_name`, plus de `source`. `source_list` est une CAPACITÉ, elle
   * survit. La grille reste donc utile — on peut lancer une application sur un
   * appareil éteint, c'est même le cas courant. */
  const etats = { 'media_player.tv': e('off', { supported_features: 450487, source_list: ['Netflix', 'Disney+'] }) };
  const c = applisDe('media_player.tv', etats, idx([]));
  assert.equal(c.mode, 'source');
  assert.equal(c.liste.length, 2);
  assert.equal(c.courante, null, 'rien ne tourne, rien n’est souligné');
});

test('ce qui n’a rien à proposer ne propose rien', () => {
  const index = idx([]);
  // Un Chromecast : ni liste ni selection, quoi qu'il arrive.
  assert.equal(applisDe('media_player.cast', { 'media_player.cast': e('playing', { supported_features: 131968 }) }, index), null);
  // Une enceinte.
  assert.equal(applisDe('media_player.echo', { 'media_player.echo': e('idle', { supported_features: 5644 }) }, index), null);
  // Le bit sans la liste, et la liste sans le bit : ni l'un ni l'autre ne suffit.
  assert.equal(applisDe('media_player.x', { 'media_player.x': e('on', { supported_features: FEAT_SOURCE }) }, index), null);
  assert.equal(applisDe('media_player.y', { 'media_player.y': e('on', { supported_features: 0, source_list: ['Netflix'] }) }, index), null);
  // Une entité absente.
  assert.equal(applisDe('media_player.parti', {}, index), null);
});

test('on ne lance que ce qui vient de la liste', () => {
  const etats = { 'media_player.tv': APPLE_TV };
  const c = applisDe('media_player.tv', etats, idx([]));
  assert.equal(appelPourLancer(c, 'Molotov'), null, 'un nom inventé n’est pas envoyé : select_source compare des chaînes strictes');
  assert.equal(appelPourLancer(c, ''), null);
  assert.equal(appelPourLancer(c, null), null);
  assert.equal(appelPourLancer(null, 'Netflix'), null);
  /* Sur Android TV en ADB, un nom précédé de `!` ARRÊTE l'application au lieu
   * de la lancer. Aucun nom de liste n'en porte, et rien ne doit pouvoir en
   * fabriquer un. */
  const piege = { mode: 'source', cible: 'media_player.tv', liste: ['!Netflix'], courante: null };
  assert.equal(appelPourLancer(piege, '!Netflix'), null, '« ! » arrêterait l’application au lieu de la lancer');
});

test('une application connue montre son dessin, une inconnue ses initiales', async () => {
  /* Le catalogue du 30/09 dessine trente-deux services. Les dessins vivent
   * dans `dessins.js` : `marques.js` ne fait que nommer, il n'en garde pas de
   * copie.
   *
   * Un nom qu'on ne reconnaît pas ne reçoit PAS un dessin approchant : il
   * retombe sur ses initiales, qui ne se trompent jamais de marque. */
  const { marqueDe, STREAMING } = await import('../src/marques.js');
  const { NOMS_DESSINS } = await import('../src/dessins.js');
  assert.equal(NOMS_DESSINS[marqueDe('Netflix')][0], 'Netflix');
  assert.equal(NOMS_DESSINS[marqueDe('Disney+')][0], 'Disney+');
  assert.equal(NOMS_DESSINS[marqueDe('disney plus')][0], 'Disney+', 'la ponctuation et la casse ne comptent pas');
  assert.equal(NOMS_DESSINS[marqueDe('Prime Video')][0], 'Prime Video');
  // Les ecarts connus entre le nom d'une box et celui du service.
  assert.equal(NOMS_DESSINS[marqueDe('Amazon Prime Video')][0], 'Prime Video');
  assert.equal(NOMS_DESSINS[marqueDe('HBO Max')][0], 'Max');
  assert.equal(NOMS_DESSINS[marqueDe('myCanal')][0], 'Canal+');
  // Et rien n'est invente.
  assert.equal(marqueDe('Ma chaine a moi'), null);
  assert.equal(marqueDe(''), null);
  assert.equal(marqueDe(null), null);

  // La famille du catalogue est bien la, et chaque tuile a un nom lisible.
  const s = STREAMING();
  assert.ok(s.length >= 30, 'la famille streaming a maigri : ' + s.length);
  for (const c of s) assert.ok(NOMS_DESSINS[c] && NOMS_DESSINS[c][0], c + ' : pas de nom lisible');
});

test('celle qu’on souligne : l’appareil a du retard, pas nous', () => {
  /* « Disney+ reste sélectionné même si j’ai changé et cliqué sur Netflix avec
   * l’app lancée » (30/09). Sur une Apple TV, `app_name` suit le LECTEUR : il
   * annonce la dernière application qui a JOUÉ, pas celle qui est ouverte. */
  const choix = { mode: 'source', cible: 'media_player.tv', liste: ['Disney+', 'Netflix', 'YouTube'], courante: 'Disney+' };

  // Sans rien lancer, l’appareil fait autorite.
  assert.equal(appliCourante(choix, null), 'Disney+');

  // On lance Netflix : l’appareil dit encore Disney+, on souligne Netflix.
  const lancee = { nom: 'Netflix', avant: 'Disney+' };
  assert.equal(appliCourante(choix, lancee), 'Netflix');

  // L’appareil finit par suivre : meme reponse, sans cas particulier.
  assert.equal(appliCourante({ ...choix, courante: 'Netflix' }, lancee), 'Netflix');

  /* Et s’il annonce autre chose — on a pris la telecommande —, c’est LUI qui a
   * raison : notre souvenir s’efface, sans minuteur. Un delai ramenerait au
   * contraire a la mauvaise valeur au bout de quelques secondes. */
  assert.equal(appliCourante({ ...choix, courante: 'YouTube' }, lancee), 'YouTube');

  // Un souvenir qui ne figure plus dans la liste ne souligne rien.
  assert.equal(appliCourante({ ...choix, liste: ['Disney+', 'YouTube'] }, lancee), 'Disney+');
  assert.equal(appliCourante(null, lancee), null);
  assert.equal(appliCourante({ ...choix, courante: null }, { nom: 'Netflix', avant: null }), 'Netflix');
});
