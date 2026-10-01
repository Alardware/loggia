/* Les touches d'une télécommande (30/09).
 *
 * Aucune touche n'est générique dans Home Assistant : cinq vocabulaires
 * disjoints se partagent le même service. « La flèche du haut » s'écrit `up`,
 * `UP`, `DPAD_UP` ou `KEY_UP` selon l'intégration — et chez LG elle ne passe
 * même pas par `remote.send_command`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GESTES_TV, TOUCHES_TV, integrationDe, telecommandePour, appelPourTouche } from '../src/telecommande.js';

const index = {
  entityMeta: new Map([['media_player.tv', { deviceId: 'dev-1' }], ['remote.tv', { deviceId: 'dev-1' }]]),
  deviceMeta: new Map([['dev-1', { integration: 'apple_tv' }]]),
};

test('l’intégration se lit dans le registre, par l’appareil', () => {
  assert.equal(integrationDe('media_player.tv', index), 'apple_tv');
  assert.equal(integrationDe('media_player.inconnu', index), null);
  assert.equal(integrationDe('media_player.tv', {}), null, 'sans registre, on ne devine pas');
});

test('la même flèche s’écrit de cinq façons', () => {
  assert.equal(TOUCHES_TV.apple_tv.haut, 'up');
  assert.equal(TOUCHES_TV.androidtv.haut, 'UP');
  assert.equal(TOUCHES_TV.androidtv_remote.haut, 'DPAD_UP');
  assert.equal(TOUCHES_TV.roku.haut, 'up');
  assert.equal(TOUCHES_TV.samsungtv.haut, 'KEY_UP');
  /* QUATRE écritures pour cinq intégrations : Apple TV et Roku disent tous
   * deux `select`, les trois autres disent chacun autre chose. C'est
   * exactement pourquoi une table par intégration est nécessaire — la
   * coïncidence entre deux d'entre elles n'est pas une règle, et compter
   * dessus casserait au premier appareil qui manque. */
  const ecrites = new Set(['apple_tv', 'androidtv', 'androidtv_remote', 'roku', 'samsungtv'].map(i => TOUCHES_TV[i].ok));
  assert.equal(ecrites.size, 4, 'les écritures de « OK » ne sont plus celles des bibliothèques');
  assert.equal(TOUCHES_TV.apple_tv.ok, TOUCHES_TV.roku.ok, 'la coïncidence entre pyatv et Roku a disparu');
});

test('un geste inconnu d’une télécommande ne s’affiche pas', () => {
  /* Samsung ne sait pas passer à la piste suivante, Roku n'a pas de menu,
   * Apple TV n'a ni info ni coupure du son. On ne dessine pas le bouton
   * plutôt que d'envoyer une touche qui n'existe pas. */
  const t = telecommandePour('samsungtv', 'remote.tv');
  assert.ok(t.gestes.indexOf('suivant') < 0 && t.gestes.indexOf('precedent') < 0);
  assert.ok(t.gestes.indexOf('haut') >= 0 && t.gestes.indexOf('muet') >= 0);
  assert.ok(telecommandePour('roku', 'remote.tv').gestes.indexOf('menu') < 0);
  assert.ok(telecommandePour('apple_tv', 'remote.tv').gestes.indexOf('info') < 0);
  assert.equal(appelPourTouche('samsungtv', 'suivant', { telecommande: 'remote.tv' }), null);
});

test('l’appel part vers la TÉLÉCOMMANDE, pas vers le lecteur', () => {
  assert.deepEqual(appelPourTouche('apple_tv', 'ok', { telecommande: 'remote.tv', lecteur: 'media_player.tv' }),
    { domaine: 'remote', service: 'send_command', data: { entity_id: 'remote.tv', command: 'select' } });
  assert.deepEqual(appelPourTouche('androidtv_remote', 'retour', { telecommande: 'remote.tv' }),
    { domaine: 'remote', service: 'send_command', data: { entity_id: 'remote.tv', command: 'BACK' } });
  assert.equal(appelPourTouche('apple_tv', 'ok', { lecteur: 'media_player.tv' }), null, 'sans télécommande, rien ne part');
});

test('LG n’a pas de télécommande : ses touches passent par le LECTEUR', () => {
  /* `webostv` n'expose aucune entité `remote` — vérifié dans ses `PLATFORMS`.
   * Ses touches passent par un service à lui, appelé sur le media_player. */
  const t = telecommandePour('webostv', null);
  assert.ok(t, 'LG doit avoir une télécommande MÊME sans entité remote');
  assert.equal(t.parLeLecteur, true);
  assert.deepEqual(appelPourTouche('webostv', 'accueil', { lecteur: 'media_player.tv' }),
    { domaine: 'webostv', service: 'button', data: { entity_id: 'media_player.tv', button: 'HOME' } });
  assert.equal(appelPourTouche('webostv', 'accueil', { telecommande: 'remote.tv' }), null, 'sans lecteur, rien ne part');
});

test('ce qu’on ne connaît pas ne montre pas de télécommande', () => {
  assert.equal(telecommandePour('cast', 'remote.x'), null, 'un Chromecast n’a pas de télécommande');
  assert.equal(telecommandePour(null, 'remote.x'), null);
  assert.equal(telecommandePour('apple_tv', null), null, 'sans entité remote, rien à dessiner');
  assert.equal(appelPourTouche('cast', 'haut', { telecommande: 'remote.x' }), null);
  assert.equal(appelPourTouche('apple_tv', 'invente', { telecommande: 'remote.x' }), null);
});

test('chaque table ne parle que des gestes déclarés', () => {
  // Un geste écrit dans une table mais absent de `GESTES_TV` ne serait jamais
  // dessiné : le filet attrape la faute de frappe.
  for (const [nom, table] of Object.entries(TOUCHES_TV)) {
    for (const g of Object.keys(table)) {
      assert.ok(GESTES_TV.indexOf(g) >= 0, nom + ' : le geste « ' + g + ' » n’est pas dans GESTES_TV');
    }
    for (const g of GESTES_TV) {
      assert.ok(g in table, nom + ' : le geste « ' + g + ' » n’est pas tranché — il faut un nom ou `null`');
    }
  }
});

test('une entité sans appareil garde son intégration', () => {
  /* « La différence entre ce que toi tu crois qu'il y a, et moi qui n'ai
   * rien » (01/10). Ses Echo n'avaient pas de champ « Dire à Alexa » alors que
   * la démo le montrait : ils n'ont pas d'APPAREIL au registre, et
   * `integrationDe` ne regardait que l'appareil.
   *
   * `discovery.js` le disait pourtant déjà, au-dessus de `platform` : « 21
   * appareils de l'installation d'essai n'ont aucune intégration dans le
   * registre, mais leurs entités, elles, en ont une. » */
  const index = {
    entityMeta: new Map([
      ['media_player.sejour_echo_salon', { deviceId: null, platform: 'alexa_media' }],
      ['media_player.tv', { deviceId: 'dev-1', platform: 'cast' }],
      ['media_player.orphelin', { deviceId: 'dev-absent', platform: null }],
    ]),
    deviceMeta: new Map([['dev-1', { integration: 'apple_tv' }]]),
  };
  // Sans appareil : la plateforme de l'entite fait foi.
  assert.equal(integrationDe('media_player.sejour_echo_salon', index), 'alexa_media');
  // Avec un appareil : c'est LUI qui decide, meme si la plateforme dit autre
  // chose — une Apple TV passe par `cast` pour certaines de ses entites.
  assert.equal(integrationDe('media_player.tv', index), 'apple_tv');
  // Et quand rien ne sait, on ne devine pas.
  assert.equal(integrationDe('media_player.orphelin', index), null);
  assert.equal(integrationDe('media_player.inconnue', index), null);
  assert.equal(integrationDe('media_player.tv', null), null);
});
