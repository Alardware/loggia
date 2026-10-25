/* La démo porte les médias de sa maquette (chantier Médias, tâche 3 ; § 8).
 *
 * Ce qui est garanti ici, l'horloge de la démo réglée :
 *  - chaque état de la maquette : l'Apple TV éteinte et ses dix-neuf applications, l'Echo Dot de la chambre en lecture (une file
 *    de trois morceaux, 30 %), l'Echo de la cuisine rien en lecture, l'Echo Show du salon en pause sur une radio sans durée,
 *    l'Echo Dot du bureau indisponible depuis 14:05, « Partout » rien en lecture ;
 *  - la PAIRE JUMELLE (M1 B, M14) : l'Echo Dot de la chambre existe deux fois, deux appareils, deux intégrations — l'appariement les
 *    retrouve, l'officielle garde la carte, ses `notify` « Annoncer » et « Parler » sont à elle ; huit cartes dans Multimédia ;
 *  - le faux serveur répond à chaque service de § 7.2, et ne bascule jamais à l'aveugle ; une annonce ne change aucun état ; un
 *    lecteur mort reste mort ; la position avance avec l'heure de la démo ;
 *  - les phrases favorites de la maquette, rangées pour l'Echo de la cuisine ; une phrase qui nomme un titre le lance. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const { maisonMediasDemo, gesteMediaDemo } = await import('../src/demo.js');
const { buildIndex, capabilities } = await import('../src/discovery.js');
const { resolveMedia } = await import('../src/resolve.js');
const { lireLecteur, phraseLecteur } = await import('../src/lecteur.js');
const DEMO = readFileSync(new URL('../src/demo.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const A = (h, m, d = 17) => new Date(2026, 9, d, h, m, 0, 0).getTime();
const heure = (ms) => new Date(ms).toTimeString().slice(0, 5);
const ATV = 'media_player.apple_tv_chambre', OFF = 'media_player.chambre_echo_dot', HACS = 'media_player.echo_dot_chambre', CUISINE = 'media_player.echo_cuisine', SHOW = 'media_player.echo_show', BUREAU = 'media_player.bureau_echo_dot', PARTOUT = 'media_player.partout';

/* L'index de la démo tel que l'écran le bâtit (le contrat de la démo des prises), et l'appariement des lecteurs dessus. */
function lecteurs(m) {
  const r = m.index();
  const ix = buildIndex({ areas: r.areas.map(a => ({ area_id: a.id, name: a.name })), devices: r.devices.map(d => ({ ...d, area_id: d.area, entry_type: d.entry_type })),
    entities: r.entities.map(e => ({ entity_id: e.id, device_id: e.device, area_id: e.area, entity_category: e.category, name: e.name, device_class: e.device_class, platform: e.platform, translation_key: e.key || null })), states: m.states });
  return { ix, liste: resolveMedia({ index: ix, caps: capabilities({ states: m.states, index: ix }), states: m.states }).list };
}

test('§ 8 : chaque état de la maquette, à 20:40', () => {
  const m = maisonMediasDemo({ quand: A(20, 40) });
  const S = m.states;
  assert.deepEqual([S[ATV].state, S[ATV].attributes.device_class, S[ATV].attributes.source_list.length, S['remote.apple_tv_chambre'].state], ['off', 'tv', 19, 'off'], 'l’Apple TV éteinte, ses dix-neuf applis, sa télécommande');
  assert.deepEqual([S[OFF].state, S[OFF].attributes.supported_features, S[OFF].attributes.volume_level], ['playing', 5644, .3], 'l’officielle : les bits de chez lui, 30 %');
  const h = S[HACS].attributes;
  assert.deepEqual([S[HACS].state, h.supported_features, h.media_title, h.media_artist, h.media_duration, h.media_position, h.app_name, heure(Date.parse(h.media_position_updated_at))], ['playing', 318399, 'Bin K’uchul Xibalba', 'Metal_Chaos', 256, 91, 'Amazon Music', '20:40'], 'la jumelle HACS joue le premier morceau de la file, à 1:31');
  assert.ok(h.entity_picture.startsWith('data:image/svg+xml,'), 'une pochette par morceau, de la même origine');
  assert.deepEqual([S[CUISINE].state, S[CUISINE].attributes.supported_features, S[CUISINE].attributes.media_title], ['idle', 318399, undefined], 'l’Echo de la cuisine : la jumelle HACS seule, rien en lecture');
  assert.deepEqual([S[SHOW].state, S[SHOW].attributes.media_title, S[SHOW].attributes.media_duration, S[SHOW].attributes.media_content_type], ['paused', 'France Inter', null, 'channel'], 'l’Echo Show en pause sur une radio sans durée');
  assert.deepEqual([S[BUREAU].state, heure(Date.parse(S[BUREAU].last_changed))], ['unavailable', '14:05'], 'l’Echo Dot du bureau, indisponible depuis 14:05');
  assert.deepEqual([S[PARTOUT].state, S['notify.partout_annoncer'].state, S['notify.chambre_echo_dot_annoncer'] ? 'oui' : 'non', S['sensor.chambre_echo_dot_prochaine_alarme'].attributes.device_class], ['idle', 'unknown', 'oui', 'timestamp'], '« Partout » et les sœurs de l’officielle');
  // Une démo ouverte le matin ramène la panne une heure avant elle, comme les capteurs : jamais dans l'avenir.
  const matin = maisonMediasDemo({ quand: A(9, 0) }).states[BUREAU];
  assert.equal(heure(Date.parse(matin.last_changed)), '08:00');
});

test('M1 B, M14 : la paire jumelle — deux appareils, deux intégrations, UNE carte ; huit cartes dans Multimédia', () => {
  const m = maisonMediasDemo({ quand: A(20, 40) });
  const { ix, liste } = lecteurs(m);
  assert.notEqual(ix.entityMeta.get(OFF).deviceId, ix.entityMeta.get(HACS).deviceId, 'deux appareils au registre, comme chez lui');
  assert.deepEqual([ix.deviceMeta.get(ix.entityMeta.get(OFF).deviceId).integration, ix.deviceMeta.get(ix.entityMeta.get(HACS).deviceId).integration], ['alexa_devices', 'alexa_media']);
  assert.deepEqual(liste.map(x => x.haid).sort(), [ATV, BUREAU, OFF, CUISINE, SHOW, PARTOUT, 'media_player.salon', 'media_player.tv_salon'].sort(), 'huit cartes : la TV et l’Enceinte du salon restent');
  const dot = liste.find(x => x.haid === OFF);
  assert.deepEqual([dot.ma, dot.alexa, dot.annonce, dot.annonceHacs, dot.modele, dot.area], [HACS, true, 'notify.chambre_echo_dot_annoncer', HACS, 'Echo Dot (3e génération)', 'Chambre'], 'l’officielle garde la carte, la HACS commande, « Annoncer » est à l’officielle');
  const cuisine = liste.find(x => x.haid === CUISINE);
  assert.deepEqual([cuisine.ma, cuisine.alexa, cuisine.annonce, cuisine.annonceHacs], [null, true, null, CUISINE], 'sans officielle : l’annonce par le service de la jumelle HACS');
  const partout = liste.find(x => x.haid === PARTOUT);
  assert.deepEqual([partout.annonce, partout.area, partout.groupe, partout.modele], ['notify.partout_annoncer', null, true, 'Speaker Group'], '« Toute la maison » : la `notify` du groupe, sans zone, reconnu à son modèle');
  // Passe bis : la paire se retrouve par l'EMPREINTE, que l'index pose sur les deux appareils (douze caractères hexadécimaux, comme le serveur).
  const empreintes = (id) => ix.deviceMeta.get(ix.entityMeta.get(id).deviceId).empreintes;
  assert.deepEqual(empreintes(OFF), empreintes(HACS), 'la même empreinte sur les deux appareils');
  assert.ok(empreintes(OFF).length === 1 && /^[0-9a-f]{12}$/.test(empreintes(OFF)[0]));
  assert.deepEqual([empreintes(ATV), empreintes(CUISINE), empreintes(PARTOUT)], [[], [], []], 'les autres n’en ont pas : ils sont seuls');
  // Renommée d'un seul côté, la jumelle reste appariée : ce n'est plus le nom qui décide.
  const renommee = maisonMediasDemo({ quand: A(20, 40) });
  renommee.states[HACS].attributes.friendly_name = 'Enceinte de Lino';
  assert.equal(lecteurs(renommee).liste.find(x => x.haid === OFF).ma, HACS);
  // Ce que la carte lit de la paire : en lecture, 30 %, le titre de la HACS, et la jumelle qui commande.
  const l = lireLecteur(m.states, dot);
  assert.deepEqual([l.ctl, l.playing, l.vol, l.title, phraseLecteur(l).texte], [HACS, true, 30, 'Bin K’uchul Xibalba', 'Bin K’uchul Xibalba · Metal_Chaos']);
  // ASSERTION RENDUE INDÉPENDANTE DE L'HORLOGE (passe bis 2 du 17/10) : sans `maintenant`, « depuis 14:05 » devenait « depuis hier » dès minuit — la démo est posée à 20:40 le 17/10.
  assert.equal(phraseLecteur(lireLecteur(m.states, liste.find(x => x.haid === BUREAU)), { maintenant: A(20, 40) }).texte, 'Indisponible depuis 14:05');
});

test('§ 7.2 : le faux serveur répond à chaque service, et ne bascule jamais à l’aveugle', () => {
  const m = maisonMediasDemo({ quand: A(20, 40) });
  const S = m.states;
  // Lecture et pause : deux services ; la position se fige à la pause et repart à la lecture.
  m.geste('media_player', 'media_pause', { entity_id: HACS }, A(20, 40) + 10000);
  assert.deepEqual([S[HACS].state, S[HACS].attributes.media_position], ['paused', 101], 'en pause 10 s plus tard : la position lue, 91 + 10');
  m.geste('media_player', 'media_pause', { entity_id: HACS });
  assert.equal(S[HACS].state, 'paused', 'une pause sur un lecteur en pause ne le relance pas');
  m.geste('media_player', 'media_play', { entity_id: HACS }, A(20, 41));
  assert.deepEqual([S[HACS].state, S[HACS].attributes.media_position, heure(Date.parse(S[HACS].attributes.media_position_updated_at))], ['playing', 101, '20:41']);
  assert.equal(m.position(HACS, A(20, 41) + 20000), 121, 'la position avance avec l’heure de la démo');
  // La file : suivant, précédent, et le tour complet.
  m.geste('media_player', 'media_next_track', { entity_id: HACS });
  assert.deepEqual([S[HACS].attributes.media_title, S[HACS].attributes.media_duration, S[HACS].attributes.media_position], ['Templo de obsidiana', 231, 0]);
  m.geste('media_player', 'media_previous_track', { entity_id: HACS });
  assert.equal(S[HACS].attributes.media_title, 'Bin K’uchul Xibalba');
  m.geste('media_player', 'media_previous_track', { entity_id: HACS });
  assert.equal(S[HACS].attributes.media_title, 'Ruinas', 'la file tourne');
  // Le volume et le muet, avec leurs valeurs.
  m.geste('media_player', 'volume_mute', { entity_id: HACS, is_volume_muted: true });
  assert.equal(S[HACS].attributes.is_volume_muted, true);
  m.geste('media_player', 'volume_set', { entity_id: HACS, volume_level: .45 });
  assert.deepEqual([S[HACS].attributes.volume_level, S[HACS].attributes.is_volume_muted], [.45, false], 'régler le volume rend le son');
  // Aléatoire, répéter, chercher.
  m.geste('media_player', 'shuffle_set', { entity_id: HACS, shuffle: true });
  m.geste('media_player', 'repeat_set', { entity_id: HACS, repeat: 'one' });
  m.geste('media_player', 'media_seek', { entity_id: HACS, seek_position: 120 }, A(20, 42));
  assert.deepEqual([S[HACS].attributes.shuffle, S[HACS].attributes.repeat, S[HACS].attributes.media_position], [true, 'one', 120]);
  assert.deepEqual(gesteMediaDemo(S, 'media_player', 'repeat_set', { entity_id: HACS, repeat: 'jamais' }), [], 'une valeur inconnue ne passe pas');
  // L'Apple TV : allumer la met en « Rien en lecture » ; une appli la réveille et devient sa source ; éteindre efface ce qui jouait.
  m.geste('media_player', 'turn_on', { entity_id: ATV });
  assert.deepEqual([S[ATV].state, S[ATV].attributes.app_name], ['idle', null]);
  m.geste('media_player', 'turn_off', { entity_id: ATV });
  m.geste('media_player', 'select_source', { entity_id: ATV, source: 'Netflix' });
  assert.deepEqual([S[ATV].state, S[ATV].attributes.app_name, S[ATV].attributes.media_title], ['playing', 'Netflix', null], 'une appli allume la TV et devient sa source');
  assert.deepEqual(gesteMediaDemo(S, 'media_player', 'select_source', { entity_id: ATV, source: 'Inconnue' }), [], 'une appli qui n’est pas dans la liste ne lance rien');
  m.geste('media_player', 'turn_off', { entity_id: ATV });
  assert.deepEqual([S[ATV].state, S[ATV].attributes.app_name], ['off', null]);
  assert.deepEqual(gesteMediaDemo(S, 'media_player', 'turn_on', { entity_id: HACS }), [], 'allumer un lecteur allumé ne fait rien');
  // Un lecteur mort reste mort ; une annonce ne change aucun état.
  assert.deepEqual(gesteMediaDemo(S, 'media_player', 'media_play', { entity_id: BUREAU }), []);
  assert.deepEqual(gesteMediaDemo(S, 'notify', 'send_message', { entity_id: 'notify.partout_annoncer', message: 'À table !' }), []);
  assert.deepEqual(gesteMediaDemo(S, 'notify', 'alexa_media', { message: 'À table !', target: [CUISINE], data: { type: 'announce' } }), []);
  assert.equal(S[PARTOUT].state, 'idle');
  // Un favori du navigateur se joue sur place.
  m.geste('media_player', 'play_media', { entity_id: 'media_player.salon', media_content_id: 'demo://radio/fip', media_content_type: 'music' });
  assert.deepEqual([S['media_player.salon'].state, S['media_player.salon'].attributes.media_title, S['media_player.salon'].attributes.media_content_type], ['playing', 'FIP', 'channel']);
});

test('passe bis : la paire jumelle fait miroiter l’état et le volume d’un geste sur ses deux entités — jamais le titre ; une jumelle morte reste morte ; la TV a sa classe, l’Enceinte sa durée', () => {
  const m = maisonMediasDemo({ quand: A(20, 40) });
  const S = m.states;
  // Pause sur la jumelle HACS : l'officielle passe en pause aussi — la carte ne redit plus « En lecture » six secondes plus tard.
  const retouches = m.geste('media_player', 'media_pause', { entity_id: HACS });
  assert.deepEqual(retouches.map(([id, etat]) => [id, etat]), [[HACS, 'paused'], [OFF, 'paused']]);
  assert.deepEqual([S[OFF].state, S[OFF].attributes.media_title], ['paused', undefined], 'l’état, pas le titre : l’officielle n’en porte pas');
  m.geste('media_player', 'media_play', { entity_id: HACS });
  assert.deepEqual([S[HACS].state, S[OFF].state], ['playing', 'playing']);
  // Le volume et le muet se lisent des deux côtés, comme chez lui (une seule enceinte).
  m.geste('media_player', 'volume_set', { entity_id: HACS, volume_level: .55 });
  assert.deepEqual([S[HACS].attributes.volume_level, S[OFF].attributes.volume_level], [.55, .55]);
  m.geste('media_player', 'volume_mute', { entity_id: OFF, is_volume_muted: true });
  assert.deepEqual([S[OFF].attributes.is_volume_muted, S[HACS].attributes.is_volume_muted], [true, true], 'dans l’autre sens aussi');
  // Un geste sur la file ne touche pas l'officielle (aucun état ne change, le titre n'est pas reflété).
  assert.deepEqual(gesteMediaDemo(S, 'media_player', 'shuffle_set', { entity_id: HACS, shuffle: true }).map(([id]) => id), [HACS]);
  // Sans jumelle, rien de plus ; une jumelle morte ne se réveille pas.
  assert.deepEqual(gesteMediaDemo(S, 'media_player', 'volume_set', { entity_id: CUISINE, volume_level: .2 }).map(([id]) => id), [CUISINE]);
  S[OFF] = { ...S[OFF], state: 'unavailable' };
  assert.deepEqual(gesteMediaDemo(S, 'media_player', 'media_pause', { entity_id: HACS }).map(([id]) => id), [HACS], 'l’officielle morte reste morte');
  // La TV du salon porte `device_class: tv` (son glyphe), l'Enceinte du salon une durée et une position (sa progression existe).
  const tv = S['media_player.tv_salon'].attributes, enceinte = S['media_player.salon'].attributes;
  assert.equal(tv.device_class, 'tv');
  assert.deepEqual([enceinte.media_duration, enceinte.media_position, typeof enceinte.media_position_updated_at], [318, 74, 'string']);
});

test('M19, § 8 : les phrases de la maquette — rangées pour l’Echo de la cuisine, et une phrase qui nomme un titre le lance', () => {
  const m = maisonMediasDemo({ quand: A(20, 40) });
  const favoris = m.config().loggia_favlecture;
  assert.deepEqual(favoris[CUISINE].map(f => [f.t, f.i, f.c, f.v]), [['Playlist du soir', 'Playlist du soir', 'custom', null], ['France Inter', 'France Inter', 'custom', null], ['Bruit blanc', 'Bruit blanc', 'custom', null], ['Musique pour dormir', 'Musique pour dormir', 'custom', null]], 'quatre phrases, la phrase entière pour identifiant (favlecture.js)');
  const S = m.states;
  m.geste('media_player', 'play_media', { entity_id: CUISINE, media_content_type: 'custom', media_content_id: 'mets la playlist du soir' });
  assert.deepEqual([S[CUISINE].state, S[CUISINE].attributes.media_title, S[CUISINE].attributes.media_duration], ['playing', 'Playlist du soir', 214], 'la phrase nomme un titre : il joue');
  m.geste('media_player', 'play_media', { entity_id: CUISINE, media_content_type: 'custom', media_content_id: 'France Inter' });
  assert.deepEqual([S[CUISINE].attributes.media_title, S[CUISINE].attributes.media_duration, S[CUISINE].attributes.media_content_type], ['France Inter', null, 'channel'], 'une radio : sans durée');
  assert.deepEqual(gesteMediaDemo(S, 'media_player', 'play_media', { entity_id: CUISINE, media_content_type: 'custom', media_content_id: 'mets du jazz' }), [], 'une autre phrase : l’Echo l’écoute, rien ne se voit');
});

test('les noms et les tables : les lecteurs de la maquette dans six langues ; l’Echo de la cuisine d’avant n’est plus dans les états de base', () => {
  for (const nom of ['Apple TV Chambre', 'Echo Dot - Chambre', 'Echo Dot Chambre', 'Echo Show Salon', 'Echo Dot - Bureau', 'Partout', 'Echo Dot (3e génération)', 'Annoncer', 'Parler', 'Prochaine alarme']) {
    assert.ok(DEMO.includes("'" + nom + "': { en: '"), nom + ' : pas d’entrée dans la table des appareils');
  }
  // Le modèle du groupe est le mot des deux intégrations, « Speaker Group » : il ne se traduit pas — c'est à lui que le groupe se reconnaît (ADR 0209).
  assert.ok(DEMO.includes("partout: [null, 'Partout', 'Speaker Group', 'alexa_devices'") && !DEMO.includes("'Groupe d’enceintes'"), 'le groupe porte le modèle de son registre');
  assert.ok(!DEMO.includes("'media_player.echo_cuisine': s('idle', { friendly_name: 'Echo de la cuisine', supported_features: 5644 })"), 'l’Echo officielle-sans-HACS d’avant est partie : la cuisine a sa jumelle HACS');
  assert.ok(DEMO.includes("} else if (domaine === 'media_player' || domaine === 'notify') {") && !DEMO.includes("domaine === 'media_player' && service === 'media_play_pause'"), 'le faux serveur ne connaît plus que des services explicites');
});
