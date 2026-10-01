/**
 * Les touches d'une télécommande, d'une intégration à l'autre.
 *
 * Il n'existe AUCUNE touche générique dans Home Assistant. Cinq vocabulaires
 * disjoints se partagent le même service `remote.send_command`, et « la flèche
 * du haut » s'y écrit de cinq façons :
 *
 *   pyatv (Apple TV)      `up`         minuscules, noms de la bibliothèque
 *   Android TV en ADB     `UP`         majuscules, table `KEYS`
 *   Android TV officiel   `DPAD_UP`    keycodes Android sans le préfixe
 *   Roku                  `up`         noms ECP, minuscules
 *   Samsung               `KEY_UP`     codes Tizen
 *
 * Et LG n'a pas d'entité `remote` du tout : ses touches passent par un service
 * à lui, `webostv.button`, appelé sur le lecteur.
 *
 * On ne peut donc pas s'en sortir par une règle. On nomme les GESTES_TV — ce que
 * la personne veut faire —, et chaque intégration dit comment elle l'écrit. Un
 * geste qu'une intégration ne connaît pas vaut `null` : le bouton ne s'affiche
 * pas, plutôt que d'envoyer une touche qui n'existe pas.
 *
 * Ce module est PUR : ni JSX, ni appel de service, aucune lecture d'état.
 */

/** Les gestes, dans l'ordre où une télécommande les présente. */
export const GESTES_TV = [
  'haut', 'bas', 'gauche', 'droite', 'ok',
  'retour', 'accueil', 'menu', 'info',
  'lecture', 'precedent', 'suivant',
  'vol_moins', 'vol_plus', 'muet',
];

/* Une table par intégration. Les valeurs viennent des bibliothèques
 * elles-mêmes, pas d'une supposition : `pyatv.interface.RemoteControl`,
 * `androidtv.constants.KEYS`, les keycodes Android, les noms ECP de Roku, les
 * codes Tizen. Un `null` veut dire « cette télécommande ne sait pas faire ». */
export const TOUCHES_TV = {
  apple_tv: {
    haut: 'up', bas: 'down', gauche: 'left', droite: 'right', ok: 'select',
    retour: 'menu', accueil: 'home', menu: 'top_menu', info: null,
    lecture: 'play_pause', precedent: 'skip_backward', suivant: 'skip_forward',
    vol_moins: 'volume_down', vol_plus: 'volume_up', muet: null,
  },
  androidtv: {
    haut: 'UP', bas: 'DOWN', gauche: 'LEFT', droite: 'RIGHT', ok: 'CENTER',
    retour: 'BACK', accueil: 'HOME', menu: 'MENU', info: null,
    lecture: 'RESUME', precedent: 'REWIND', suivant: 'FAST_FORWARD',
    vol_moins: 'VOLUME_DOWN', vol_plus: 'VOLUME_UP', muet: 'MUTE',
  },
  androidtv_remote: {
    haut: 'DPAD_UP', bas: 'DPAD_DOWN', gauche: 'DPAD_LEFT', droite: 'DPAD_RIGHT', ok: 'DPAD_CENTER',
    retour: 'BACK', accueil: 'HOME', menu: 'MENU', info: 'INFO',
    lecture: 'MEDIA_PLAY_PAUSE', precedent: 'MEDIA_PREVIOUS', suivant: 'MEDIA_NEXT',
    vol_moins: 'VOLUME_DOWN', vol_plus: 'VOLUME_UP', muet: 'MUTE',
  },
  roku: {
    haut: 'up', bas: 'down', gauche: 'left', droite: 'right', ok: 'select',
    retour: 'back', accueil: 'home', menu: null, info: 'info',
    lecture: 'play', precedent: 'reverse', suivant: 'forward',
    vol_moins: 'volume_down', vol_plus: 'volume_up', muet: 'volume_mute',
  },
  samsungtv: {
    haut: 'KEY_UP', bas: 'KEY_DOWN', gauche: 'KEY_LEFT', droite: 'KEY_RIGHT', ok: 'KEY_ENTER',
    retour: 'KEY_RETURN', accueil: 'KEY_HOME', menu: 'KEY_MENU', info: 'KEY_INFO',
    lecture: 'KEY_PLAY', precedent: null, suivant: null,
    vol_moins: 'KEY_VOLDOWN', vol_plus: 'KEY_VOLUP', muet: 'KEY_MUTE',
  },
  /* LG : mêmes gestes, mais le service n'est pas le même — voir `appelPourTouche`. */
  webostv: {
    haut: 'UP', bas: 'DOWN', gauche: 'LEFT', droite: 'RIGHT', ok: 'ENTER',
    retour: 'BACK', accueil: 'HOME', menu: 'MENU', info: 'INFO',
    lecture: 'PLAY', precedent: 'REWIND', suivant: 'FASTFORWARD',
    vol_moins: null, vol_plus: null, muet: null,
  },
};

/**
 * L'intégration dont vient cette entité, d'après le registre.
 *
 * DEUX sources, et il faut les deux. L'appareil d'abord, parce que c'est lui
 * qui porte l'intégration quand il existe. La PLATEFORME de l'entité ensuite,
 * parce que beaucoup d'entités n'ont aucun appareil au registre — `discovery.js`
 * le disait déjà : « 21 appareils de l'installation d'essai n'ont aucune
 * intégration dans le registre, mais leurs entités, elles, en ont une. »
 *
 * Ne regarder que l'appareil, c'était ne rien voir chez celui qui a justement
 * ce cas : ses Echo n'avaient pas de champ « Dire à Alexa », alors que la démo
 * le montrait très bien (01/10).
 */
export function integrationDe(id, index) {
  const meta = index && index.entityMeta ? index.entityMeta.get(id) : null;
  if (!meta) return null;
  const dev = meta.deviceId;
  const appareil = dev && index.deviceMeta ? index.deviceMeta.get(dev) : null;
  return (appareil && appareil.integration) || meta.platform || null;
}

/**
 * De quoi dessiner une télécommande, ou `null` s'il n'y a rien à dessiner.
 *
 *   `integration`  — celle qui décide du vocabulaire ;
 *   `gestes`       — ceux que cette télécommande sait faire, dans l'ordre ;
 *   `parLeLecteur` — vrai chez LG, qui n'a pas d'entité `remote`.
 *
 * `telecommande` est l'entité `remote.*` trouvée par ailleurs (`applis.js`).
 * Elle peut manquer : c'est justement le cas de LG.
 */
export function telecommandePour(integration, telecommande) {
  const table = TOUCHES_TV[integration];
  if (!table) return null;
  const parLeLecteur = integration === 'webostv';
  if (!parLeLecteur && !telecommande) return null;
  const gestes = GESTES_TV.filter(g => table[g]);
  if (!gestes.length) return null;
  return { integration, gestes, parLeLecteur };
}

/**
 * L'appel à faire pour une touche — ou `null`, et alors on n'envoie rien.
 *
 * Deux chemins, parce que Home Assistant n'en offre pas un seul :
 *   — `remote.send_command`, pour tout le monde sauf LG ;
 *   — `webostv.button` sur le LECTEUR, pour LG, qui n'a pas d'entité `remote`.
 */
export function appelPourTouche(integration, geste, cibles) {
  const table = TOUCHES_TV[integration];
  const touche = table && table[geste];
  if (!touche || !cibles) return null;
  if (integration === 'webostv') {
    if (!cibles.lecteur) return null;
    return { domaine: 'webostv', service: 'button', data: { entity_id: cibles.lecteur, button: touche } };
  }
  if (!cibles.telecommande) return null;
  return { domaine: 'remote', service: 'send_command', data: { entity_id: cibles.telecommande, command: touche } };
}
