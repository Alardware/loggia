// Resolution : de ce que la decouverte a trouve, aux entites que les vues lisent.
//
// L'ordre est le meme partout, et c'est lui qu'on protege ici :
//   choix explicite de l'utilisateur → decouverte → rien.
// « Rien » compte autant que le reste : une resolution qui invente une entite
// ferait afficher des tirets a la place d'un aveu franc.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveVacuum, resolveAlarm, resolveCameras, resolvePeople, resolveCovers,
  resolveClimate, resolveEnergy, resolveSystem, resolveWeather, resolveRooms,
  resolveMedia, resolveAll, fmtDuration, fmtArea, VACUUM_STATE_FR,
} from '../src/resolve.js';
import {
  emptyHome, simpleHome, threeVacuums, energyHome, systemHome, cameraHome,
  mediaHome, ctxOf, device, entity, state, states, area,
  alexaHome,
} from './fixtures.mjs';
// Qui commande une carte appariée (passe bis 2 : la carte du Sonos ne commande que le Sonos).
import { lireLecteur } from '../src/lecteur.js';

// ── Mise en forme ────────────────────────────────────────────────────────────

test('durees : le capteur natif rend un nombre, la vue affiche un temps', () => {
  assert.equal(fmtDuration('55.0'), '55 min');
  assert.equal(fmtDuration('90'), '1 h 30');
  assert.equal(fmtDuration('120'), '2 h');
  assert.equal(fmtDuration('indisponible'), null);
  assert.equal(fmtDuration(null), null);
});

test('surfaces : l’unite est ajoutee, jamais inventee', () => {
  assert.equal(fmtArea('55'), '55 m²');
  assert.equal(fmtArea('54.6'), '55 m²');
  assert.equal(fmtArea(null), null);
});

test('etats d’aspirateur : traduits, et jamais inventes', () => {
  assert.equal(VACUUM_STATE_FR.docked, 'Sur la base');
  assert.equal(VACUUM_STATE_FR.cleaning, 'Nettoyage');
  assert.equal(VACUUM_STATE_FR.inconnu_de_ha, undefined);
});

// ── Installation vide : tout doit se taire proprement ────────────────────────

test('installation vide : chaque resolveur se declare indisponible avec un motif', () => {
  const r = resolveAll(ctxOf(emptyHome()));
  ['vacuum', 'alarm', 'cameras', 'people', 'covers', 'climate', 'energy', 'system', 'weather'].forEach(k => {
    assert.equal(r[k].available, false, k + ' devrait etre indisponible');
    assert.equal(typeof r[k].reason, 'string', k + ' : motif manquant');
  });
  assert.deepEqual(r.rooms.suggested, []);
});

// ── Aspirateur ───────────────────────────────────────────────────────────────

test('aspirateur : le premier trouve, avec les capteurs de SON appareil', () => {
  const v = resolveVacuum(ctxOf(threeVacuums()));
  assert.equal(v.available, true);
  assert.equal(v.main, 'vacuum.alpha');
  assert.equal(v.battery, 'sensor.alpha_batterie');
  assert.equal(v.area_cleaned, 'sensor.alpha_surface');
  assert.equal(v.duration, 'sensor.alpha_duree');
  assert.equal(v.map, 'image.alpha_carte');
  assert.equal(v.state, 'cleaning');
  assert.equal(v.batteryLevel, 90);
  assert.equal(v.choices.length, 3, 'les trois aspirateurs restent proposables');
});

test('aspirateur : le choix de l’utilisateur l’emporte, capteurs compris', () => {
  const v = resolveVacuum(ctxOf(threeVacuums(), { loggia_vacuum_entity: 'vacuum.gamma' }));
  assert.equal(v.main, 'vacuum.gamma');
  assert.equal(v.battery, 'sensor.gamma_batterie');
  assert.equal(v.batteryLevel, 70);
  assert.ok(v.map.indexOf('alpha') < 0, 'aucun capteur ne doit venir d’un autre appareil');
});

test('aspirateur : une surcharge explicite prime sur la decouverte', () => {
  const v = resolveVacuum(ctxOf(threeVacuums(), { loggia_vacuum: { battery: 'sensor.beta_batterie' } }));
  assert.equal(v.main, 'vacuum.alpha');
  assert.equal(v.battery, 'sensor.beta_batterie', 'la surcharge doit etre respectee telle quelle');
});

test('aspirateur : la mise en forme reste au frontend, pas au capteur', () => {
  const fx = threeVacuums();
  const v = resolveVacuum(ctxOf(fx));
  // Le capteur natif dit « 55 » ; c'est la vue qui en fait « 55 min ».
  assert.equal(fx.states[v.duration].state, '55');
  assert.equal(fmtDuration(fx.states[v.duration].state), '55 min');
  assert.equal(fmtArea(fx.states[v.area_cleaned].state), '40 m²');
});

// ── Securite ─────────────────────────────────────────────────────────────────

test('cameras : un appareil, trois flux, une seule fiche', () => {
  const c = resolveCameras(ctxOf(cameraHome()));
  assert.equal(c.available, true);
  assert.equal(c.list.length, 1, 'les flux secondaires du meme appareil sont ecartes');
  assert.equal(c.list[0].name, 'Caméra entrée');
});

test('cameras : un flux hors service n est pas celui qu on presente', () => {
  // Releve sur une installation reelle : des trois flux d'une camera, le seul
  // « haute definition » etait indisponible pendant que les deux autres
  // enregistraient. Retenir le premier venu affichait donc une image morte.
  const maison = cameraHome();
  maison.states['camera.entree_high'] = {
    entity_id: 'camera.entree_high', state: 'unavailable',
    attributes: { friendly_name: 'Caméra entrée haute définition' },
  };
  const c = resolveCameras(ctxOf(maison));
  assert.equal(c.list.length, 1);
  assert.notEqual(c.list[0].id, 'camera.entree_high', 'un flux muet ne doit pas etre retenu');
  assert.equal(c.list[0].streams.length, 3, 'les autres flux restent accessibles');
});

test('cameras : les detecteurs viennent des binary_sensor du meme appareil', () => {
  const cam = resolveCameras(ctxOf(cameraHome())).list[0];
  assert.equal(cam.motion, 'binary_sensor.entree_motion');
  assert.equal(cam.person, 'binary_sensor.entree_personne_detectee');
  assert.equal(cam.sonnette, 'binary_sensor.entree_sonnette');
  assert.equal(cam.vehicle, null, 'un detecteur absent vaut null, pas un identifiant invente');
  assert.equal(cam.colis, null);
});

test('cameras : la liste de l’utilisateur fait foi, et reçoit ses détecteurs', () => {
  // Le formulaire ne demande qu'un nom et une entité. Sans complément, la
  // caméra choisie arriverait sans détecteurs ni libellé — et la vue
  // l'ignorerait au profit d'une autre source. C'est ce qui se passait.
  const mine = [{ id: 'cam_0', name: 'Mon entrée', online: true, haid: 'camera.entree_high' }];
  const c = resolveCameras(ctxOf(cameraHome(), { loggia_cameras: mine }));
  assert.equal(c.source, 'utilisateur');
  assert.equal(c.list.length, 1);
  const cam = c.list[0];
  assert.equal(cam.haid, 'camera.entree_high');
  assert.equal(cam.label, 'Mon entrée', 'le nom saisi sert aussi de libellé');
  assert.equal(cam.motion, 'binary_sensor.entree_motion');
  assert.equal(cam.sonnette, 'binary_sensor.entree_sonnette');
  assert.equal(cam.vehicle, null, 'un détecteur absent reste null');
});

test('cameras : un détecteur désigné à la main n’est jamais écrasé', () => {
  const mine = [{ haid: 'camera.entree_high', label: 'Entrée', motion: 'binary_sensor.a_moi' }];
  const cam = resolveCameras(ctxOf(cameraHome(), { loggia_cameras: mine })).list[0];
  assert.equal(cam.motion, 'binary_sensor.a_moi');
});

test('cameras : une liste vidée ne ressuscite pas une ancienne configuration', () => {
  const c = resolveCameras(ctxOf(cameraHome(), { loggia_cameras: [] }));
  assert.equal(c.source, 'decouverte');
});

test('alarme : trouvee par domaine, avec ses autres candidats', () => {
  const a = resolveAlarm(ctxOf(cameraHome()));
  assert.equal(a.available, true);
  assert.equal(a.main, 'alarm_control_panel.maison');
  assert.equal(a.choices.length, 1);
});

test('presence : le domaine person suffit, aucune configuration', () => {
  const p = resolvePeople(ctxOf(cameraHome()));
  assert.equal(p.available, true);
  assert.deepEqual(p.list.map(x => x.name).sort(), ['Alex', 'Sam']);
  assert.ok(p.list.every(x => x.haid.indexOf('person.') === 0));
});

// ── Lecteurs multimedia ──────────────────────────────────────────────────────

test('media : une enceinte exposee deux fois n’apparait qu’une, avec son compagnon', () => {
  const m = resolveMedia(ctxOf(mediaHome()));
  assert.equal(m.available, true);
  assert.equal(m.list.length, 2, 'deux appareils, pas trois entites');
  const echo = m.list.find(x => x.haid.indexOf('echo') >= 0);
  assert.equal(echo.ma, 'media_player.sejour_echo_salon', 'le compagnon est l’entite du meme appareil');
  // Le compagnon d'avant est le JUMEAU de M14 (chantier Médias, tâche 2) : la même règle, et ce que la résolution sait de lui.
  assert.deepEqual([echo.haid, echo.alexa, echo.modele, echo.annonce, echo.annonceHacs], ['media_player.echo_salon', false, null, null, null]);
});

test('media : un lecteur seul n’invente pas de compagnon', () => {
  const ampli = resolveMedia(ctxOf(mediaHome())).list.find(x => x.haid === 'media_player.ampli');
  assert.equal(ampli.ma, null);
  assert.equal(ampli.area, 'Bureau');
});

test('media : une configuration ancienne se voit completer son compagnon', () => {
  // Cas reel : le suffixe `_2` ecrit autrefois en dur ne correspond plus a rien.
  const mine = [{ id: 'echo', name: 'Echo', haid: 'media_player.echo_salon', ma: null }];
  const m = resolveMedia(ctxOf(mediaHome(), { loggia_medias: mine }));
  assert.equal(m.source, 'utilisateur');
  assert.equal(m.list[0].ma, 'media_player.sejour_echo_salon');
});

test('media : aucun lecteur, aucune invention', () => {
  const m = resolveMedia(ctxOf(emptyHome()));
  assert.equal(m.available, false);
  assert.match(m.reason, /media_player/);
});

/* ── Un appareil, une carte (chantier Médias, tâche 2 ; M1 B, M9, M10, M14 ; ADR 0208) ──────────────────────────────────────── */

test('M1 B : une Echo exposée deux fois, par deux intégrations — DEUX appareils au registre — fait UNE carte ; l’officielle la garde, la HACS est son jumeau', () => {
  const m = resolveMedia(ctxOf(alexaHome()));
  assert.equal(m.source, 'decouverte');
  const dot = m.list.find(x => x.haid === 'media_player.chambre_lino_echo_dot');
  assert.ok(dot, 'la carte est celle de l’officielle (ses sœurs « Annoncer » et ses capteurs sont à elle)');
  assert.equal(dot.ma, 'media_player.echo_dot_chambre_lino', 'la jumelle HACS, retrouvée par ses mots (les identifiants ne finissent pas pareil ici)');
  assert.ok(!m.list.some(x => x.haid === 'media_player.echo_dot_chambre_lino'), 'la jumelle ne fait pas de seconde carte');
  assert.deepEqual([dot.alexa, dot.modele, dot.annonce, dot.annonceHacs, dot.area, dot.name],
    [true, 'Echo Dot (3rd Gen)', 'notify.chambre_lino_echo_dot_annoncer', 'media_player.echo_dot_chambre_lino', 'Chambre de Lino', 'Echo Dot - Chambre Lino'],
    'une Echo ; le modèle du registre ; la `notify` « Annoncer » de l’officielle ; la jumelle qui sait `notify.alexa_media`');
});

test('M1 B : Spotify (un appareil de service) et le haut-parleur d’une sonnette (l’appareil d’une caméra) n’entrent pas dans Multimédia', () => {
  const m = resolveMedia(ctxOf(alexaHome()));
  assert.deepEqual(m.list.map(x => x.haid).sort(), ['media_player.apple_tv_salon', 'media_player.bureau_echo_dot', 'media_player.chambre_lino_echo_dot', 'media_player.partout'],
    'quatre cartes pour sept entités : l’Echo (deux), Partout, l’Apple TV, l’Echo du bureau seule — ni Spotify, ni la sonnette');
});

test('M9, M10 : ce que chaque lecteur dit à la popup — le groupe et sa `notify`, une Apple TV qui n’est pas une Echo, une officielle seule', () => {
  const m = resolveMedia(ctxOf(alexaHome()));
  const par = (id) => m.list.find(x => x.haid === id);
  const partout = par('media_player.partout');
  assert.deepEqual([partout.alexa, partout.annonce, partout.annonceHacs, partout.ma], [true, 'notify.partout_annoncer', null, null], '« Toute la maison » : la `notify` du groupe, sans jumelle');
  // ASSERTION AJOUTÉE (chantier Médias, tâche 7 ; M9) : le groupe se reconnaît — l'appareil officiel qui sait annoncer et ne porte rien d'autre ; une Echo a ses capteurs.
  assert.deepEqual([partout.groupe, par('media_player.chambre_lino_echo_dot').groupe, par('media_player.bureau_echo_dot').groupe], [true, false, false], 'le groupe, et lui seul');
  const atv = par('media_player.apple_tv_salon');
  assert.deepEqual([atv.alexa, atv.modele, atv.annonce, atv.annonceHacs, atv.ma, atv.area], [false, 'Apple TV 4K', null, null, null, 'Séjour'], 'l’Apple TV garde son interrupteur (M10) ; sa `remote.` n’est pas un jumeau');
  const bureau = par('media_player.bureau_echo_dot');
  assert.deepEqual([bureau.alexa, bureau.ma, bureau.annonce], [true, null, null], 'une officielle seule, sans HACS : une carte réduite — pas de jumelle inventée, pas d’annonce sans `notify`');
});

test('M14 : une configuration `loggia_medias` reste prioritaire, et son jumeau se retrouve — avec ce que la résolution sait de lui', () => {
  const mine = [{ id: 'dot', name: 'Mon Echo', haid: 'media_player.chambre_lino_echo_dot', ma: null }];
  const m = resolveMedia(ctxOf(alexaHome(), { loggia_medias: mine }));
  assert.equal(m.source, 'utilisateur');
  assert.equal(m.list.length, 1);
  assert.deepEqual([m.list[0].name, m.list[0].ma, m.list[0].alexa, m.list[0].annonce, m.list[0].modele], ['Mon Echo', 'media_player.echo_dot_chambre_lino', true, 'notify.chambre_lino_echo_dot_annoncer', 'Echo Dot (3rd Gen)']);
  // Une jumelle HACS choisie à la main garde sa carte telle quelle : la configuration l'emporte (le dernier recours de § 13).
  const hacs = resolveMedia(ctxOf(alexaHome(), { loggia_medias: [{ haid: 'media_player.echo_dot_chambre_lino', name: 'Echo HACS' }] }));
  assert.deepEqual([hacs.list[0].haid, hacs.list[0].ma, hacs.list[0].annonceHacs], ['media_player.echo_dot_chambre_lino', 'media_player.chambre_lino_echo_dot', 'media_player.echo_dot_chambre_lino']);
});

/* ── La paire par l'EMPREINTE, le nom en repli, le doute (passe bis du 17/10 ; § 7.3, ADR 0208) ──────────────────────────────────
 *
 * Le défaut reproduit par la relecture : deux Echo officielles dont les identifiants finissent pareil (`chambre_echo_dot`,
 * `bureau_echo_dot`), plus une jumelle HACS au nom par défaut (« Echo Dot », `echo_dot`) — et la carte de la chambre commandait
 * l'enceinte du bureau. `maisonEcho` la rejoue ; les empreintes sont celles que le serveur poserait (douze caractères hexadécimaux). */
function maisonEcho({ empreintes = {}, nomHacs = 'Echo Dot', idHacs = 'media_player.echo_dot', idChambre = 'media_player.chambre_echo_dot', nomChambre = 'Echo Dot - Chambre', modeles = {}, entitesEnPlus = [], etatsEnPlus = [] } = {}) {
  const modele = (cle, defaut) => (cle in modeles ? modeles[cle] : defaut);
  return {
    areas: [area('chambre', 'Chambre'), area('bureau', 'Bureau')], floors: [], energyPrefs: null,
    devices: [
      device('d_chambre', nomChambre, 'chambre', { manufacturer: 'Amazon', model: modele('chambre', 'Echo Dot'), integration: 'alexa_devices', empreintes: empreintes.chambre || [] }),
      device('d_bureau', 'Echo Dot - Bureau', 'bureau', { manufacturer: 'Amazon', model: modele('bureau', 'Echo Dot'), integration: 'alexa_devices', empreintes: empreintes.bureau || [] }),
      device('d_hacs', nomHacs, null, { manufacturer: 'Amazon', model: modele('hacs', 'Echo Dot (Gen3)'), integration: 'alexa_media', empreintes: empreintes.hacs || [] }),
    ],
    entities: [
      entity(idChambre, { device: 'd_chambre', platform: 'alexa_devices' }),
      entity('notify.chambre_echo_dot_annoncer', { device: 'd_chambre', platform: 'alexa_devices', key: 'announce' }),
      entity('media_player.bureau_echo_dot', { device: 'd_bureau', platform: 'alexa_devices' }),
      entity('notify.bureau_echo_dot_annoncer', { device: 'd_bureau', platform: 'alexa_devices', key: 'announce' }),
      entity(idHacs, { device: 'd_hacs', platform: 'alexa_media' }),
      ...entitesEnPlus,
    ],
    states: states(
      state(idChambre, 'idle', { friendly_name: nomChambre, supported_features: 5644, volume_level: .3 }),
      state('notify.chambre_echo_dot_annoncer', 'unknown', {}),
      state('media_player.bureau_echo_dot', 'idle', { friendly_name: 'Echo Dot - Bureau', supported_features: 5644, volume_level: .3 }),
      state('notify.bureau_echo_dot_annoncer', 'unknown', {}),
      state(idHacs, 'playing', { friendly_name: nomHacs, supported_features: 318399, volume_level: .3, media_title: 'Ruinas' }),
      ...etatsEnPlus,
    ),
  };
}
const cartes = (m) => m.list.map(x => [x.haid, x.ma]).sort();
const E1 = '3f9a1c7e5b2d', E2 = 'a0b1c2d3e4f5';

test('passe bis, le défaut reproduit : deux officielles revendiquent la même jumelle par le nom — aucune ne l’a ; trois cartes, et la chambre ne commande plus le bureau', () => {
  const m = resolveMedia(ctxOf(maisonEcho()));
  assert.deepEqual(cartes(m), [['media_player.bureau_echo_dot', null], ['media_player.chambre_echo_dot', null], ['media_player.echo_dot', null]], 'dans le doute, pas de paire : deux cartes valent mieux qu’une enceinte commandée à la place d’une autre');
});

test('passe bis, M1 B : l’EMPREINTE apparie — l’officielle du bureau et la jumelle « Echo Dot » partagent la leur ; la chambre, sans empreinte commune, reste seule', () => {
  const m = resolveMedia(ctxOf(maisonEcho({ empreintes: { bureau: [E1], hacs: [E1], chambre: [E2] } })));
  assert.deepEqual(cartes(m), [['media_player.bureau_echo_dot', 'media_player.echo_dot'], ['media_player.chambre_echo_dot', null]], 'deux cartes : l’officielle garde la carte, la HACS est son jumeau — par l’empreinte, malgré le nom par défaut');
  const bureau = m.list.find(x => x.haid === 'media_player.bureau_echo_dot');
  assert.deepEqual([bureau.alexa, bureau.annonce, bureau.annonceHacs, bureau.groupe], [true, 'notify.bureau_echo_dot_annoncer', 'media_player.echo_dot', false]);
});

test('passe bis, M1 B : renommée d’un seul côté, la jumelle reste appariée — ni les mots ni les identifiants ne se répondent, l’empreinte si', () => {
  const m = resolveMedia(ctxOf(maisonEcho({ empreintes: { chambre: [E1], hacs: [E1] }, nomHacs: 'Enceinte de Lino', idHacs: 'media_player.enceinte_de_lino' })));
  assert.deepEqual(cartes(m), [['media_player.bureau_echo_dot', null], ['media_player.chambre_echo_dot', 'media_player.enceinte_de_lino']]);
  // Et à l'inverse, sans empreinte, le renommage défait la paire : deux cartes, rien de faux.
  const sans = resolveMedia(ctxOf(maisonEcho({ nomHacs: 'Enceinte de Lino', idHacs: 'media_player.enceinte_de_lino' })));
  assert.deepEqual(cartes(sans), [['media_player.bureau_echo_dot', null], ['media_player.chambre_echo_dot', null], ['media_player.enceinte_de_lino', null]]);
});

test('passe bis : le doute — plusieurs lecteurs partagent une empreinte, ou deux appareils portent chacun la leur sans la partager : pas de paire', () => {
  // Trois appareils, une empreinte : lequel est la jumelle de qui ? Aucun.
  const trois = resolveMedia(ctxOf(maisonEcho({ empreintes: { chambre: [E1], bureau: [E1], hacs: [E1] } })));
  assert.deepEqual(cartes(trois).map(([, ma]) => ma), [null, null, null], 'trois cartes, aucune paire');
  // Les mêmes mots (« Echo Dot Chambre » / « Echo Dot - Chambre »), mais deux empreintes différentes : deux appareils — le nom ne les marie pas.
  const differentes = resolveMedia(ctxOf(maisonEcho({ empreintes: { chambre: [E1], hacs: [E2] }, nomHacs: 'Echo Dot Chambre', idHacs: 'media_player.echo_dot_chambre' })));
  assert.deepEqual(cartes(differentes), [['media_player.bureau_echo_dot', null], ['media_player.chambre_echo_dot', null], ['media_player.echo_dot_chambre', null]]);
  // Une seule porte des empreintes, l'autre aucune (une intégration qui n'en écrit pas) : le nom tranche encore.
  const moitie = resolveMedia(ctxOf(maisonEcho({ empreintes: { chambre: [E1] }, nomHacs: 'Echo Dot Chambre', idHacs: 'media_player.echo_dot_chambre' })));
  assert.deepEqual(cartes(moitie), [['media_player.bureau_echo_dot', null], ['media_player.chambre_echo_dot', 'media_player.echo_dot_chambre']]);
});

test('passe bis : le repli par le nom lit la fin de l’identifiant sur une FRONTIÈRE DE MOT', () => {
  // `salon_techo` finit par `echo` en lettres, pas en mots : pas la jumelle de `media_player.echo`.
  const techo = resolveMedia(ctxOf(maisonEcho({ idChambre: 'media_player.salon_techo', nomChambre: 'Technics du salon', idHacs: 'media_player.echo', nomHacs: 'Echo' })));
  assert.deepEqual(cartes(techo), [['media_player.bureau_echo_dot', null], ['media_player.echo', null], ['media_player.salon_techo', null]]);
  const echo = resolveMedia(ctxOf(maisonEcho({ idChambre: 'media_player.salon_echo', nomChambre: 'Echo - Salon', idHacs: 'media_player.echo', nomHacs: 'Echo' })));
  assert.deepEqual(cartes(echo), [['media_player.bureau_echo_dot', null], ['media_player.salon_echo', 'media_player.echo']]);
});

test('passe bis, M9 : le groupe se reconnaît à son modèle « Speaker Group » (sa connectivité ne le trahit plus) ; une Echo seule n’est plus prise pour un groupe ; sans modèle, sa forme', () => {
  const groupe = (plus = {}) => {
    const fx = maisonEcho(plus);
    fx.devices.push(device('d_partout', 'Partout', null, { manufacturer: 'Amazon', model: 'modelePartout' in plus ? plus.modelePartout : 'Speaker Group', integration: 'alexa_devices' }));
    fx.entities.push(entity('media_player.partout', { device: 'd_partout', platform: 'alexa_devices' }), entity('notify.partout_annoncer', { device: 'd_partout', platform: 'alexa_devices', key: 'announce' }),
      // Son « Partout » porte une connectivité, comme chaque Echo (sa copie du registre) : « ne porte rien d'autre » l'aurait manqué.
      entity('binary_sensor.partout_connectivite', { device: 'd_partout', platform: 'alexa_devices', category: 'diagnostic' }));
    Object.assign(fx.states, states(state('media_player.partout', 'idle', { friendly_name: 'Partout', supported_features: 5644, volume_level: .4 }), state('notify.partout_annoncer', 'unknown', {}), state('binary_sensor.partout_connectivite', 'on', { device_class: 'connectivity' })));
    return resolveMedia(ctxOf(fx));
  };
  const par = (m, id) => m.list.find(x => x.haid === id);
  const m = groupe();
  assert.deepEqual([par(m, 'media_player.partout').groupe, par(m, 'media_player.chambre_echo_dot').groupe, par(m, 'media_player.bureau_echo_dot').groupe], [true, false, false], 'le groupe, et lui seul : à son modèle');
  // Une Echo officielle qui ne porte que son lecteur et sa `notify` « Annoncer » (ses capteurs désactivés) : son modèle dit « Echo Dot » — pas un groupe.
  assert.equal(par(groupe({ modeles: { chambre: 'Echo Dot' } }), 'media_player.chambre_echo_dot').groupe, false);
  // Sans modèle au registre : la forme — il sait annoncer et ne porte rien de ce qu'une Echo physique a.
  assert.equal(par(groupe({ modelePartout: null }), 'media_player.partout').groupe, true, 'sans modèle : sa forme le dit');
  assert.equal(par(groupe({ modeles: { chambre: null } }), 'media_player.chambre_echo_dot').groupe, true, 'sans modèle ni rien d’une Echo (ni « Parler », ni alarme, ni Drop In) : la forme ne sait pas mieux — le modèle, lui, le dirait');
  const avecParler = groupe({ modeles: { chambre: null }, entitesEnPlus: [entity('notify.chambre_echo_dot_parler', { device: 'd_chambre', platform: 'alexa_devices', key: 'speak' })], etatsEnPlus: [state('notify.chambre_echo_dot_parler', 'unknown', {})] });
  assert.equal(par(avecParler, 'media_player.chambre_echo_dot').groupe, false, '« Parler » : une Echo physique');
  // Un modèle qui dit autre chose qu'un groupe l'emporte sur la forme.
  assert.equal(par(groupe({ modelePartout: 'Echo Show' }), 'media_player.partout').groupe, false);
  // Le groupe par la jumelle HACS seule (sans officielle) : son modèle aussi.
  const hacsSeul = maisonEcho({ nomHacs: 'Partout', idHacs: 'media_player.partout_hacs', modeles: { hacs: 'Speaker Group' } });
  assert.equal(par(resolveMedia(ctxOf(hacsSeul)), 'media_player.partout_hacs').groupe, true);
});

/* ── Passe bis 2 du 17/10 (ADR 0208) : la garde du repli par le nom, la réciprocité de l'empreinte, la garde `pris` à la main ──────
 *
 * Le défaut rejoué par la relecture : sans empreintes (Home Assistant pas encore redémarré après l'installation, ou un appareil sans
 * identifiant), un Sonos `media_player.salon` et la jumelle HACS `media_player.echo_salon` ne faisaient qu'une carte — `echo_salon`
 * finit par `_salon` —, l'Echo disparaissait, et la jumelle ayant plus de bits de transport, la carte « Salon » COMMANDAIT L'ECHO. */
function maisonSonos() {
  return {
    areas: [area('salon', 'Salon')], floors: [], energyPrefs: null,
    devices: [
      device('d_sonos', 'Salon', 'salon', { manufacturer: 'Sonos', model: 'One', integration: 'sonos' }),
      device('d_hacs', 'Echo Salon', 'salon', { manufacturer: 'Amazon', model: 'Echo', integration: 'alexa_media' }),
    ],
    entities: [entity('media_player.salon', { device: 'd_sonos', platform: 'sonos' }), entity('media_player.echo_salon', { device: 'd_hacs', platform: 'alexa_media' })],
    states: states(
      state('media_player.salon', 'playing', { friendly_name: 'Salon', supported_features: 981567, volume_level: .2, media_title: 'Clair de lune' }),
      state('media_player.echo_salon', 'idle', { friendly_name: 'Echo Salon', supported_features: 318399, volume_level: .3 }),
    ),
  };
}

test('passe bis 2 : le repli par le nom n’apparie QUE la paire Alexa — un Sonos « Salon » ne prend pas la jumelle HACS « Echo Salon », sa carte ne commande que lui ; l’officielle, elle, la prend toujours', () => {
  const fx = maisonSonos();
  const m = resolveMedia(ctxOf(fx));
  assert.deepEqual(cartes(m), [['media_player.echo_salon', null], ['media_player.salon', null]], 'deux cartes : `echo_salon` finit par `_salon`, mais un Sonos n’est pas une Echo officielle');
  const sonos = lireLecteur(fx.states, m.list.find(x => x.haid === 'media_player.salon'));
  assert.deepEqual([sonos.ctl, sonos.volId, sonos.title, sonos.alexa], ['media_player.salon', 'media_player.salon', 'Clair de lune', false], 'la carte du Sonos ne commande que le Sonos');
  assert.equal(m.list.find(x => x.haid === 'media_player.echo_salon').alexa, true, 'l’Echo garde sa carte, et c’est une Echo');
  // La paire qui doit TOUJOURS s'apparier sans empreintes : l'officielle « Echo - Salon » (`sejour_echo_salon`) et sa jumelle HACS.
  fx.devices.push(device('d_off', 'Echo - Salon', 'salon', { manufacturer: 'Amazon', model: 'Echo', integration: 'alexa_devices' }));
  fx.entities.push(entity('media_player.sejour_echo_salon', { device: 'd_off', platform: 'alexa_devices' }));
  Object.assign(fx.states, states(state('media_player.sejour_echo_salon', 'idle', { friendly_name: 'Echo - Salon', supported_features: 5644, volume_level: .3 })));
  const avec = resolveMedia(ctxOf(fx));
  assert.deepEqual(cartes(avec), [['media_player.salon', null], ['media_player.sejour_echo_salon', 'media_player.echo_salon']], 'l’officielle revendique la jumelle, seule ; le Sonos reste seul');
  const echo = lireLecteur(fx.states, avec.list.find(x => x.haid === 'media_player.sejour_echo_salon'));
  assert.deepEqual([echo.ctl, echo.volId], ['media_player.echo_salon', 'media_player.echo_salon'], 'la jumelle HACS, qui sait le transport, commande l’Echo — et rien d’autre');
});

test('passe bis 2 : la RÉCIPROCITÉ de l’empreinte — A[X], B[X, Y], C[Y] : B a deux partenaires, aucune paire, quel que soit l’ordre de la liste ; deux paires nettes, chacune la sienne', () => {
  // B est la jumelle HACS (la dernière de la liste), puis B est l'officielle de la chambre (la première) : trois cartes dans les deux cas.
  const m1 = resolveMedia(ctxOf(maisonEcho({ empreintes: { chambre: [E1], hacs: [E1, E2], bureau: [E2] } })));
  assert.deepEqual(cartes(m1).map(([, ma]) => ma), [null, null, null], 'la jumelle partage une empreinte avec chacune des deux officielles — avec laquelle ? aucune');
  const m2 = resolveMedia(ctxOf(maisonEcho({ empreintes: { chambre: [E1, E2], hacs: [E1], bureau: [E2] } })));
  assert.deepEqual(cartes(m2).map(([, ma]) => ma), [null, null, null], 'la même maison, l’ambiguë en tête de liste : pas davantage — et le nom par défaut ne rattrape pas le doute');
  // Deux paires nettes dans la même maison, deux jumelles au même nom par défaut : chacune la sienne, par l'empreinte.
  const fx = maisonEcho({ empreintes: { chambre: [E1], hacs: [E1], bureau: [E2] } });
  fx.devices.push(device('d_hacs2', 'Echo Dot', null, { manufacturer: 'Amazon', model: 'Echo Dot (Gen3)', integration: 'alexa_media', empreintes: [E2] }));
  fx.entities.push(entity('media_player.echo_dot_2', { device: 'd_hacs2', platform: 'alexa_media' }));
  Object.assign(fx.states, states(state('media_player.echo_dot_2', 'idle', { friendly_name: 'Echo Dot', supported_features: 318399, volume_level: .3 })));
  assert.deepEqual(cartes(resolveMedia(ctxOf(fx))), [['media_player.bureau_echo_dot', 'media_player.echo_dot_2'], ['media_player.chambre_echo_dot', 'media_player.echo_dot']]);
});

test('passe bis 2 : `loggia_medias` à la main — un jumeau n’est jamais pris deux fois, ni parmi les cartes configurées ; un jumeau écrit reste celui de la configuration', () => {
  // Les deux entités de l'Echo configurées comme deux cartes : chacune reste seule — pas de jumeau qui serait la carte voisine.
  const deux = resolveMedia(ctxOf(alexaHome(), { loggia_medias: [{ haid: 'media_player.chambre_lino_echo_dot', name: 'Officielle' }, { haid: 'media_player.echo_dot_chambre_lino', name: 'HACS' }] }));
  assert.deepEqual(deux.list.map(p => [p.haid, p.ma]), [['media_player.chambre_lino_echo_dot', null], ['media_player.echo_dot_chambre_lino', null]]);
  // Un jumeau explicite est gardé tel quel, et personne d'autre ne le reçoit.
  const explicite = resolveMedia(ctxOf(alexaHome(), { loggia_medias: [{ haid: 'media_player.bureau_echo_dot', name: 'Bureau', ma: 'media_player.echo_dot_chambre_lino' }, { haid: 'media_player.chambre_lino_echo_dot', name: 'Chambre' }] }));
  assert.deepEqual(explicite.list.map(p => [p.haid, p.ma]), [['media_player.bureau_echo_dot', 'media_player.echo_dot_chambre_lino'], ['media_player.chambre_lino_echo_dot', null]], 'la configuration l’emporte ; le jumeau pris ne se retrouve pas une seconde fois');
});

// ── Volets et chauffage ──────────────────────────────────────────────────────

test('volets : tout le domaine cover, nomme par Home Assistant', () => {
  const c = resolveCovers(ctxOf(simpleHome()));
  assert.equal(c.available, true);
  assert.equal(c.list.length, 1);
  assert.equal(c.list[0].id, 'cover.salon');
  assert.equal(c.list[0].name, 'Volet séjour');
});

test('chauffage : le thermostat porte le NOM de sa piece, pas son identifiant', () => {
  const z = resolveClimate(ctxOf(simpleHome())).list[0];
  assert.equal(z.haid, 'climate.chambre');
  assert.equal(z.room, 'Chambre', 'un area_id ne correspondrait a aucune piece configuree');
  assert.equal(z.type, 'thermostat');
  assert.equal(z.hasAuto, false);
});

test('chauffage : le capteur de temperature vient de l’appareil', () => {
  assert.equal(resolveClimate(ctxOf(simpleHome())).list[0].tempSensor, 'sensor.chambre_temperature');
});

test('chauffage : une configuration decrit ce qu’aucune convention ne devine', () => {
  // Un radiateur fil pilote n'est pas un thermostat : switch + consigne + mode.
  const mine = [{ id: 'pilote', haid: 'switch.radiateur', tempCible: 'input_number.consigne', hasAuto: true }];
  const c = resolveClimate(ctxOf(simpleHome(), { loggia_climate: mine }));
  assert.equal(c.source, 'utilisateur');
  assert.deepEqual(c.list, mine);
});

test('chauffage : la saisie reste telle quelle, les modules fil pilote qu’elle ne décrit pas s’y ajoutent', () => {
  /* Règle du 07/10 (une fiche COMPLÈTE la découverte, jamais ne la remplace),
   * appliquée au fil pilote (plan 2 du chantier Chauffage, choix 3). Le
   * serveur reconnaît le module et le dit dans l'index (`famille`) : sans
   * cela, une saisie le rendait invisible pour toujours. */
  const fx = simpleHome();
  fx.devices.push(device('d_module', 'Radiateur', 'chambre'));
  fx.entities.push({ ...entity('select.radiateur_fil_pilote', { device: 'd_module' }), famille: 'fil_pilote' });
  const [id, st] = state('select.radiateur_fil_pilote', 'eco', { friendly_name: 'Radiateur', options: ['comfort', 'eco', 'frost_protection', 'off'] });
  fx.states[id] = st;
  const mine = [{ id: 'pilote', haid: 'switch.radiateur', tempCible: 'input_number.consigne', hasAuto: true }];
  const c = resolveClimate(ctxOf(fx, { loggia_climate: mine }));
  assert.equal(c.source, 'utilisateur');
  assert.equal(c.list[0], mine[0], 'la saisie, telle quelle');
  assert.deepEqual(c.list.map(z => z.id), ['pilote', 'select.radiateur_fil_pilote'], 'puis le module qu’elle ne décrit pas');
  // Le module déjà décrit (son select en mode) : la saisie seule, sans doublon.
  const decrit = [{ ...mine[0], modeEnt: 'select.radiateur_fil_pilote' }];
  assert.deepEqual(resolveClimate(ctxOf(fx, { loggia_climate: decrit })).list, decrit);
});

// ── Energie ──────────────────────────────────────────────────────────────────

test('energie : sans tableau de bord natif, on le dit au lieu de deviner', () => {
  const fx = energyHome();
  fx.energyPrefs = null;
  const e = resolveEnergy(ctxOf(fx));
  assert.equal(e.available, false);
  assert.match(e.reason, /Energie/);
  assert.deepEqual(e.haids, {});
});

test('energie : le tableau de bord natif nomme compteur, injection et solaire', () => {
  const e = resolveEnergy(ctxOf(energyHome()));
  assert.equal(e.available, true);
  assert.equal(e.haids.consoJour, 'sensor.compteur_energie');
  assert.equal(e.haids.coutJour, 'sensor.compteur_cout');
  assert.equal(e.haids.injectionJour, 'sensor.compteur_injection');
  assert.equal(e.haids.prodJour, 'sensor.pv_energie');
});

test('energie : la puissance instantanee vient du meme appareil que la statistique', () => {
  const e = resolveEnergy(ctxOf(energyHome()));
  assert.equal(e.haids.gridNow, 'sensor.compteur_puissance');
  assert.equal(e.haids.solarNow, 'sensor.pv_puissance');
});

test('energie : les appareils suivis viennent des preferences, avec leur puissance', () => {
  const e = resolveEnergy(ctxOf(energyHome()));
  assert.equal(e.devices.length, 1);
  assert.deepEqual(e.devices[0], { name: 'Prise bureau', kwh: 'sensor.prise_energie', power: 'sensor.prise_puissance' });
});

test('energie : une fiche est signalee, mais ne coupe plus la deduction', () => {
  /* Elle court-circuitait TOUT : `resolveEnergy` rendait la fiche seule, sans
   * meme regarder le tableau de bord. Or l'ecran Parametres n'expose que six
   * champs de puissance — nommer sa voiture faisait perdre les compteurs, les
   * couts, les prix, le gaz, l'eau et les appareils mesures (07/10, « tout
   * doit etre operationnel »). La deduction se fait desormais toujours, et
   * c'est `enHaids` (state.js) qui marie les deux. */
  const mine = { consoJour: 'sensor.a_moi' };
  const e = resolveEnergy(ctxOf(energyHome(), { loggia_energy: mine }));
  assert.equal(e.source, 'utilisateur', 'la fiche doit rester signalee comme la source');
  assert.equal(e.haids.consoJour, 'sensor.compteur_energie', 'la deduction continue de lire le tableau');
  assert.equal(e.devices.length, 1, 'les appareils mesures ne doivent plus se perdre');
  assert.ok(Array.isArray(e.prix), 'les prix non plus');
});

/* Le format RECENT du tableau de bord Energie (06/10).
 *
 * Les versions actuelles de Home Assistant ecrivent UNE SOURCE `grid` PAR
 * CONNEXION, `stat_energy_from` pose directement dessus — un contrat heures
 * creuses / heures pleines en donne deux. On ne lisait que `flow_from[0]`,
 * absent de cette forme : ni consommation, ni cout, ni injection ne
 * remontaient. Une vraie installation s'en est apercue.
 */
const grilleRecente = () => {
  const fx = energyHome();
  fx.energyPrefs.energy_sources = [
    { type: 'grid', stat_energy_from: 'sensor.compteur_hc', number_energy_price: 0.1605 },
    {
      type: 'grid',
      stat_energy_from: 'sensor.compteur_hp',
      stat_energy_to: 'sensor.compteur_injection',
      number_energy_price: 0.2092,
      power_config: { stat_rate_from: 'sensor.compteur_puissance', stat_rate_to: 'sensor.compteur_export_w' },
    },
    { type: 'solar', stat_energy_from: 'sensor.pv_energie' },
  ];
  return fx;
};

test('energie : une source par connexion se lit aussi bien que l’ancien groupe', () => {
  const e = resolveEnergy(ctxOf(grilleRecente()));
  assert.equal(e.available, true);
  assert.deepEqual(e.haids.consoJourParts, ['sensor.compteur_hc', 'sensor.compteur_hp'],
    'les DEUX compteurs du contrat, pas seulement le premier');
  assert.equal(e.haids.injectionJour, 'sensor.compteur_injection');
  assert.equal(e.haids.prodJour, 'sensor.pv_energie');
});

test('energie : deux compteurs, aucun ne vaut pour le tout', () => {
  // Elire le premier ferait lire la moitie d'une facture comme si c'etait la
  // facture (ADR 0030). Les parts sont a cote, pour qui sait les additionner.
  const e = resolveEnergy(ctxOf(grilleRecente()));
  assert.equal(e.haids.consoJour, null);
  // Une seule connexion : la part disparait, `consoJour` suffit.
  const un = resolveEnergy(ctxOf(energyHome()));
  assert.equal(un.haids.consoJour, 'sensor.compteur_energie');
  assert.equal(un.haids.consoJourParts, null, 'pas de liste a un seul element');
});

test('energie : la puissance declaree l’emporte sur celle qu’on devine', () => {
  /* `power_config` NOMME la puissance du compteur. La deduire par voisinage
   * marche, mais ce que la configuration dit vaut mieux que ce qu'on infere —
   * et l'export, lui, ne se devinait pas du tout. */
  const e = resolveEnergy(ctxOf(grilleRecente()));
  assert.equal(e.haids.gridNow, 'sensor.compteur_puissance');
  assert.equal(e.haids.injectionNow, 'sensor.compteur_export_w');
  // Sans `power_config`, le voisinage reprend la main, et l'export reste muet.
  const vieux = resolveEnergy(ctxOf(energyHome()));
  assert.equal(vieux.haids.gridNow, 'sensor.compteur_puissance');
  assert.equal(vieux.haids.injectionNow, null);
});

test('energie : le gaz et l’eau viennent du tableau de bord, comme l’electricite', () => {
  /* Ils s'y declarent exactement comme l'electricite — un type de source, un
   * compteur. On ne les lisait pas du tout : les deux tuiles ne pouvaient
   * apparaitre chez personne (07/10). */
  const fx = energyHome();
  fx.energyPrefs.energy_sources.push(
    { type: 'gas', stat_energy_from: 'sensor.compteur_gaz' },
    { type: 'water', stat_energy_from: 'sensor.compteur_eau' },
  );
  const e = resolveEnergy(ctxOf(fx));
  assert.equal(e.haids.gasJour, 'sensor.compteur_gaz');
  assert.equal(e.haids.waterJour, 'sensor.compteur_eau');
  // Une maison sans gaz ni eau n'en invente pas.
  const sans = resolveEnergy(ctxOf(energyHome()));
  assert.equal(sans.haids.gasJour, null);
  assert.equal(sans.haids.waterJour, null);
});

test('energie : le prix du kWh se lit la ou le tableau de bord le declare', () => {
  /* La seule source generique d'un tarif : personne n'a de capteur « prix » par
   * defaut. Un contrat heures creuses / pleines en declare deux, et c'est a la
   * vue de dire lequel court. */
  const e = resolveEnergy(ctxOf(grilleRecente()));
  assert.deepEqual(e.prix.map(p => p.valeur), [0.1605, 0.2092]);
  assert.deepEqual(e.prix.map(p => p.compteur), ['sensor.compteur_hc', 'sensor.compteur_hp']);
  // Un prix PUBLIE PAR UNE ENTITE sort avec son identifiant, valeur a null :
  // c'est la lecture qui la donnera, pas la configuration.
  const fx = energyHome();
  fx.energyPrefs.energy_sources[0].flow_from[0].entity_energy_price = 'sensor.prix_du_kwh';
  const v = resolveEnergy(ctxOf(fx));
  assert.equal(v.prix.length, 1);
  assert.equal(v.prix[0].valeur, null);
  assert.equal(v.prix[0].entite, 'sensor.prix_du_kwh');
  // Sans prix declare, rien : on ne devine pas un tarif.
  assert.deepEqual(resolveEnergy(ctxOf(energyHome())).prix, []);
});

test('energie : un cout par connexion ne se confond pas avec le cout total', () => {
  const fx = grilleRecente();
  fx.energyPrefs.energy_sources[0].stat_cost = 'sensor.cout_hc';
  fx.energyPrefs.energy_sources[1].stat_cost = 'sensor.cout_hp';
  const e = resolveEnergy(ctxOf(fx));
  assert.equal(e.haids.coutJour, null, 'deux couts : aucun n’est LE cout');
  assert.deepEqual(e.haids.coutJourParts, ['sensor.cout_hc', 'sensor.cout_hp']);
});

// ── Systeme ──────────────────────────────────────────────────────────────────

test('systeme : une machine se reconnait a sa charge processeur en pourcentage', () => {
  const s = resolveSystem(ctxOf(systemHome()));
  assert.equal(s.available, true);
  assert.equal(s.hosts.length, 1);
  const h = s.hosts[0];
  assert.equal(h.name, 'Serveur maison');
  assert.equal(h.cpu, 'sensor.processor_use');
  assert.equal(h.memPct, 'sensor.memory_use_percent');
  assert.equal(h.disk, 'sensor.disk_use_percent_data');
  assert.equal(h.temp, 'sensor.processor_temperature');
  assert.equal(h.uptime, 'sensor.last_boot');
  assert.equal(h.online, 'binary_sensor.hote_en_ligne');
});

test('systeme : une maison sans serveur ne fabrique pas de machine', () => {
  const s = resolveSystem(ctxOf(simpleHome()));
  assert.equal(s.available, false);
  assert.deepEqual(s.hosts, []);
});

// ── Meteo et pieces ──────────────────────────────────────────────────────────

test('meteo : aucune entite weather, aucune invention', () => {
  assert.equal(resolveWeather(ctxOf(simpleHome())).available, false);
});

test('pieces : une zone n’est proposee que si elle est habitee', () => {
  const r = resolveRooms(ctxOf(simpleHome()));
  assert.equal(r.source, 'decouverte');
  assert.deepEqual(r.suggested.map(a => a.name).sort(), ['Chambre', 'Séjour']);
  assert.deepEqual(r.technical.map(a => a.name), ['Réseau']);
});

test('pieces : les capteurs d’ambiance de la zone accompagnent la proposition', () => {
  const salon = resolveRooms(ctxOf(simpleHome())).suggested.find(a => a.name === 'Séjour');
  assert.equal(salon.temp, 'sensor.salon_temperature');
  assert.equal(salon.hum, 'sensor.salon_humidite');
  assert.equal(salon.co2, null);
});

test('pieces : un choix explicite fait foi, mais les zones restent proposees', () => {
  // Les propositions ne disparaissent pas : l'ecran de premier lancement doit
  // pouvoir cocher, et une configuration ancienne — de simples noms — y
  // retrouve ses capteurs d'ambiance.
  const mine = [{ room: 'Atelier', haid: { temp: null, humidity: null, co2: null } }];
  const r = resolveRooms(ctxOf(simpleHome(), { loggia_rooms: mine }));
  assert.equal(r.source, 'utilisateur');
  assert.deepEqual(r.rooms, mine);
  assert.deepEqual(r.suggested.map(a => a.name).sort(), ['Chambre', 'Séjour']);
});

test('pieces : sans registre de zones, la configuration survit quand meme', () => {
  const mine = [{ room: 'Atelier', haid: { temp: null, humidity: null, co2: null } }];
  const r = resolveRooms({ index: null, states: {}, userCfg: { loggia_rooms: mine } });
  assert.equal(r.source, 'utilisateur');
  assert.deepEqual(r.rooms, mine);
  assert.deepEqual(r.suggested, []);
});

// ── Vue d'ensemble ───────────────────────────────────────────────────────────

test('resolveAll couvre tous les domaines', () => {
  const r = resolveAll(ctxOf(simpleHome()));
  assert.deepEqual(Object.keys(r).sort(),
    ['alarm', 'cameras', 'climate', 'covers', 'energy', 'media', 'people', 'rooms', 'system', 'vacuum', 'weather']);
});

test('contexte vide ou incomplet : rien ne plante', () => {
  assert.equal(resolveVacuum().available, false);
  assert.equal(resolveAlarm({}).available, false);
  assert.equal(resolveCameras({ caps: {} }).available, false);
  assert.equal(resolveSystem({ states: {} }).available, false);
  assert.equal(resolveEnergy({}).available, false);
});
