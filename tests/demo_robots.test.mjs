/* TEST AJOUTÉ (chantier IoT, tâche 10, 18/10 ; § 10 de la conception) — la démo des robots porte chaque cas de sa maquette, et ce
 * que Loggia dira sans que la maquette le montre :
 *  - l'aspirateur sur la base à 92 %, ses cinq pièces, le filtre à 32 % (l'ambre, et l'alerte de l'Accueil) ; ses passages —
 *    09:30 en semaine (Salon · Cuisine), 18:00 le samedi, 23:00 le dimanche ALLUMÉ, pris dans « Ne pas déranger » (22:00–07:00) ;
 *    son carnet : hier 08:30, Salon · Cuisine, 51 min, 42 m², terminé ; il y a trois jours, 22 min, 19 m², interrompu, « Bloqué sous
 *    le canapé » ; il y a cinq jours 14:02, tout le logement, 94 min, 68 m² ;
 *  - la tondeuse en pleine tonte à 64 % sur « Pelouse arrière », ses lames sous 15 % — le rouge, que la maquette ne montre pas ; son
 *    carnet : 210 m² terminé, 96 m² interrompu, « Pluie détectée » ;
 *  - `?demo&robots=pause` : l'aspirateur en pause, « Salon, Cuisine · 23 m² faits » ;
 *  - le faux serveur : `loggia/robots/lancer` (le robot part, le carnet ouvre le passage avec ses pièces ; la base le ferme), ses
 *    refus, `send_command` (le robot part), `locate` (rien ne change) ; un appareil mort reste mort.
 * L'horloge de la démo est réglée à 18:20, le « maintenant » de la maquette (`maisonRobotsDemo({ quand })`). */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const { maisonRobotsDemo, phaseRobotDemo, designerScriptDemo } = await import('../src/demo.js');
const { buildIndex } = await import('../src/discovery.js');
const R = { ...(await import('../src/robots.js')), ...(await import('../src/robotsfiche.js')) };
const { vueCarnetRobot } = await import('../src/robotsetat.js');
const DEMO = readFileSync(new URL('../src/demo.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const QUAND = new Date(2026, 9, 17, 18, 20).getTime(); // samedi 17/10/2026, 18:20
const ASP = 'vacuum.aspirateur', TOND = 'lawn_mower.tondeuse';
const heure = (s) => new Date(s * 1000).toTimeString().slice(0, 5);
const ilYa = (s) => Math.round((new Date(QUAND).setHours(0, 0, 0, 0) - new Date(s * 1000).setHours(0, 0, 0, 0)) / 86400000);
const noms = (zones) => (zones || []).map(z => z.nom);
/* Les sœurs d'un robot telles que l'écran les lit : l'index de la démo bâti comme l'écran le bâtit (le contrat de la démo des
 * prises), puis `decrireSoeurs`. */
function soeurs(m, id) {
  const r = m.index();
  const ix = buildIndex({ areas: r.areas.map(a => ({ area_id: a.id, name: a.name })), devices: r.devices.map(d => ({ ...d, area_id: d.area })),
    entities: r.entities.map(e => ({ entity_id: e.id, device_id: e.device, area_id: e.area, entity_category: e.category, name: e.name, device_class: e.device_class, platform: e.platform, translation_key: e.key || null })), states: m.states });
  return R.decrireSoeurs(ix, m.states, id);
}

test('l’aspirateur de sa maquette : sur la base à 92 %, ses cinq pièces, le filtre à 32 % — l’ambre, et l’alerte', () => {
  const m = maisonRobotsDemo({ quand: QUAND });
  const a = m.states[ASP];
  assert.deepEqual([a.state, a.attributes.battery_level, Object.keys(a.attributes.rooms).length], ['docked', 92, 5]);
  const usure = R.piecesUsure(soeurs(m, ASP));
  assert.deepEqual(usure.map(p => [p.nom, p.pct, p.niveau]), [['Filtre', 32, 'moyen'], ['Brosse principale', 58, 'bon'], ['Brosse latérale', 81, 'bon'], ['Serpillière', 47, 'bon']]);
  assert.equal(R.alerteEntretien(usure).nom, 'Filtre', 'l’alerte de l’Accueil');
  assert.equal(m.etat().en_cours[ASP], undefined, 'sur la base : pas de passage en cours');
});

test('ses passages : 09:30 en semaine, 18:00 le samedi, 23:00 le dimanche ALLUMÉ — pris dans « Ne pas déranger », le prochain le saute', () => {
  const m = maisonRobotsDemo({ quand: QUAND });
  const e = m.etat();
  /* ASSERTION MODIFIÉE (tranche robots 2, 19/10 ; § 9, R5) : le passage de la semaine vise des ZONES de Home Assistant (`zone`), celui
   * du samedi est un passage d'avant, par segments (le bureau) — les deux formes vivent côte à côte dans le planning. */
  assert.deepEqual(e.config.plannings.filter(p => p.robot === ASP).map(p => [p.heure, p.jours, p.actif, R.resumeZones(p)]),
    [['09:30', [0, 1, 2, 3, 4], true, 'Salon · Cuisine'], ['18:00', [5], true, 'Bureau'], ['23:00', [6], true, 'Tout le logement']]);
  assert.deepEqual(e.config.plannings[0].zones.map(z => [z.id, z.zone, z.segments]), [['zone:salon', 'salon', []], ['zone:cuisine', 'cuisine', []]]);
  assert.deepEqual(e.config.plannings[1].zones, [{ id: 'seg:3', nom: 'Bureau', segments: [3] }]);
  assert.equal(R.dansLaPlage(e.config.robots[ASP].calme, '23:00'), true, 'le conflit de sa maquette');
  const prochain = vueCarnetRobot(e, ASP, QUAND).prochain;
  assert.equal(new Date(prochain.date).toString(), new Date(2026, 9, 19, 9, 30).toString(), 'dimanche 23:00 ne partira pas : lundi 09:30');
});

test('son carnet : hier, il y a trois jours, il y a cinq jours — ce que dit sa maquette', () => {
  const m = maisonRobotsDemo({ quand: QUAND });
  const e = m.etat();
  assert.deepEqual(e.passages.filter(p => p.robot === ASP).map(p => [ilYa(p.debut), heure(p.debut), p.duree_min, p.surface, p.issue, noms(p.zones).join(' · '), p.tout, p.motif]), [
    [1, '08:30', 51, 42, 'termine', 'Salon · Cuisine', false, null],
    [3, '08:30', 22, 19, 'interrompu', 'Salon · Cuisine', false, 'Bloqué sous le canapé'],
    [5, '14:02', 94, 68, 'termine', '', true, null],
  ]);
  assert.ok(e.passages.every((p, i, l) => !i || l[i - 1].fin >= p.fin), 'le plus récent d’abord, comme le serveur');
  // ASSERTION MODIFIÉE (passe bis du 18/10, point 10) : plus de `maintenant`, un champ que l'écran ne lisait pas — comme le serveur.
  assert.equal('maintenant' in e, false);
});

test('la tondeuse en pleine tonte sur « Pelouse arrière » à 64 % ; ses lames sous 15 % : le rouge ; son carnet', () => {
  const m = maisonRobotsDemo({ quand: QUAND });
  const t = m.states[TOND];
  assert.deepEqual([t.state, t.attributes.battery_level], ['mowing', 64]);
  const c = m.etat().en_cours[TOND];
  assert.deepEqual([heure(c.debut), c.phase, noms(c.zones), c.surface], ['16:40', 'travail', ['Pelouse arrière'], 140]);
  const lames = R.piecesUsure(soeurs(m, TOND)).find(p => p.role === 'lames');
  assert.deepEqual([lames.pct, lames.niveau], [13, 'bas'], 'sous 15 % : le rouge que la maquette ne montre pas');
  assert.deepEqual(m.etat().passages.filter(p => p.robot === TOND).map(p => [ilYa(p.debut), heure(p.debut), p.duree_min, p.surface, p.issue, noms(p.zones).join(' · '), p.motif]), [
    [2, '10:00', 72, 210, 'termine', 'Pelouse avant', null],
    [4, '10:00', 40, 96, 'interrompu', 'Pelouse avant', 'Pluie détectée'],
  ]);
});

test('`?demo&robots=pause` : l’aspirateur en pause, « Salon, Cuisine · 23 m² faits »', () => {
  const m = maisonRobotsDemo({ quand: QUAND, variante: 'pause' });
  assert.equal(m.states[ASP].state, 'paused');
  const e = m.etat();
  const c = e.en_cours[ASP];
  assert.deepEqual([c.phase, noms(c.zones), c.surface], ['pause', ['Salon', 'Cuisine'], 23]);
  const carnet = vueCarnetRobot(e, ASP, QUAND);
  assert.equal(R.etatAccueil({ phase: 'pause', pieces: carnet.pieces, tout: carnet.tout, surface: c.surface, maintenant: QUAND }).phrase, 'Salon, Cuisine · 23 m² faits');
  // ASSERTION MODIFIÉE (tranche robots 2, 19/10 ; passe bis du 20/10 : son cas, avant et après) : `pause` est l'une des variantes des
  // robots, lues ensemble dans l'URL.
  assert.ok(DEMO.includes("const VARIANTES_ROBOTS = ['pause', 'sans-association', 'sans-association-rooms', 'exception', 'rooms-vide', 'scripts', 'carte-changee', 'etages', 'scripts-sans-pieces', 'scripts-avec-pieces'];")
    && DEMO.includes("if (VARIANTES_ROBOTS.indexOf(q.get('robots')) >= 0) VARIANTE_ROBOTS = q.get('robots');"), 'la variante se lit dans l’URL');
});

test('le faux serveur : un départ ouvre le passage avec ses pièces, la base le ferme ; `send_command` part, `locate` ne change rien', async () => {
  const m = maisonRobotsDemo({ quand: QUAND });
  const r = await m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [{ id: 'bureau', nom: 'Bureau', segments: [3] }] });
  assert.equal(m.states[ASP].state, 'cleaning');
  assert.deepEqual([noms(r.en_cours[ASP].zones), r.en_cours[ASP].tout, r.en_cours[ASP].source], [['Bureau'], false, 'loggia'], 'l’état rendu est celui de `loggia/robots/etat`');
  m.avancer(20 * 60000);
  m.service('vacuum', 'return_to_base', { entity_id: ASP });
  assert.equal(m.states[ASP].state, 'docked');
  const e = m.etat();
  assert.equal(e.en_cours[ASP], undefined);
  assert.deepEqual([e.passages[0].robot, e.passages[0].issue, e.passages[0].duree_min, noms(e.passages[0].zones)], [ASP, 'termine', 20, ['Bureau']], 'le passage rejoint le carnet');
  // « Tout le logement » : aucune pièce.
  await m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [] });
  assert.equal(m.etat().en_cours[ASP].tout, true);
  // Le geste direct d'une intégration : `send_command` fait partir le robot ; `locate` ne change rien.
  const m2 = maisonRobotsDemo({ quand: QUAND });
  m2.service('vacuum', 'locate', { entity_id: ASP });
  assert.equal(m2.states[ASP].state, 'docked', 'il bipe, c’est tout');
  m2.service('vacuum', 'send_command', { entity_id: ASP, command: 'spot_area', params: { rooms: '1,2', cleanings: 1 } });
  assert.equal(m2.states[ASP].state, 'cleaning');
  assert.deepEqual([noms(m2.etat().en_cours[ASP].zones), m2.etat().en_cours[ASP].source], [[], 'appareil'], 'parti sans Loggia : ses pièces ne se savent pas');
  // Moins d'une minute de travail : un faux départ, que le carnet ne garde pas — comme le serveur.
  const m3 = maisonRobotsDemo({ quand: QUAND });
  await m3.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [] });
  m3.avancer(30000);
  m3.service('vacuum', 'return_to_base', { entity_id: ASP });
  assert.equal(m3.etat().passages.filter(p => p.robot === ASP).length, 3, 'le faux départ ne rejoint pas le carnet');
});

test('les refus du faux serveur, ceux du vrai : déjà en route, muet, une zone qui n’est pas la sienne, des pièces sans segment ; un appareil mort reste mort', async () => {
  const m = maisonRobotsDemo({ quand: QUAND });
  await assert.rejects(m.lancer({ type: 'loggia/robots/lancer', robot: TOND, zones: [] }), { code: 'deja_en_route' });
  m.service('lawn_mower', 'dock', { entity_id: TOND });
  await assert.rejects(m.lancer({ type: 'loggia/robots/lancer', robot: TOND, zones: [{ id: 'switch.aspirateur_detection_tapis', nom: 'Tapis', segments: [] }] }), { code: 'zone_inconnue' });
  await assert.rejects(m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [{ id: 'bureau', nom: 'Bureau', segments: [] }] }), { code: 'pieces_inconnues' });
  m.states[ASP] = { ...m.states[ASP], state: 'unavailable' };
  await assert.rejects(m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [] }), { code: 'robot_injoignable' });
  m.service('vacuum', 'start', { entity_id: ASP });
  assert.equal(m.states[ASP].state, 'unavailable', 'un appareil mort reste mort');
  // Une tondeuse : les aires choisies s'allument, les autres s'éteignent, puis elle tond.
  const r = await m.lancer({ type: 'loggia/robots/lancer', robot: TOND, zones: [{ id: 'switch.tondeuse_zone_pelouse_avant', nom: 'Pelouse avant', segments: [] }] });
  assert.deepEqual(['switch.tondeuse_zone_pelouse_avant', 'switch.tondeuse_zone_pelouse_arriere', 'switch.tondeuse_zone_cote_garage'].map(id => m.states[id].state), ['on', 'off', 'off']);
  assert.deepEqual([m.states[TOND].state, noms(r.en_cours[TOND].zones)], ['mowing', ['Pelouse avant']]);
  // Sans aire choisie (« Démarrer » sur sa carte), elle tond ses aires allumées, que le carnet nomme — comme le serveur.
  m.service('lawn_mower', 'dock', { entity_id: TOND });
  m.avancer(5 * 60000);
  const r2 = await m.lancer({ type: 'loggia/robots/lancer', robot: TOND, zones: [] });
  assert.deepEqual([noms(r2.en_cours[TOND].zones), r2.en_cours[TOND].tout], [['Pelouse avant'], false]);
});

/* TEST AJOUTÉ (passe bis du 18/10, point 2) : le faux serveur suit la règle de « où » du vrai — toutes ses aires visées : « tout le
 * jardin » (`tout`) ; sans zone, ses aires DÉJÀ allumées, sans rien basculer, et « tout le jardin » si ce sont toutes. */
test('point 2 : la démo — toutes ses aires, c’est « tout le jardin » ; sans zone, rien ne bascule', async () => {
  const AIRES = ['switch.tondeuse_zone_pelouse_avant', 'switch.tondeuse_zone_pelouse_arriere', 'switch.tondeuse_zone_cote_garage'];
  const m = maisonRobotsDemo({ quand: QUAND });
  m.service('lawn_mower', 'dock', { entity_id: TOND });
  m.avancer(5 * 60000);
  const r = await m.lancer({ type: 'loggia/robots/lancer', robot: TOND, zones: AIRES.map(id => ({ id, nom: id, segments: [] })) });
  assert.deepEqual([AIRES.map(id => m.states[id].state), r.en_cours[TOND].tout, r.en_cours[TOND].zones.length], [['on', 'on', 'on'], true, 3]);
  // Sans zone : ses aires allumées (une seule ici), et rien ne bascule.
  const m2 = maisonRobotsDemo({ quand: QUAND });
  m2.service('lawn_mower', 'dock', { entity_id: TOND });
  m2.avancer(5 * 60000);
  const avant = AIRES.map(id => m2.states[id].state);
  const r2 = await m2.lancer({ type: 'loggia/robots/lancer', robot: TOND, zones: [] });
  assert.deepEqual([AIRES.map(id => m2.states[id].state), r2.en_cours[TOND].tout, noms(r2.en_cours[TOND].zones)], [avant, false, ['Pelouse arrière']]);
});

test('la phase d’un robot, recopiée dans la démo, est celle de ses cartes ; la démo n’importe pas robots.js', () => {
  for (const [domaine, etats] of [['vacuum', ['cleaning', 'paused', 'returning', 'docked', 'idle', 'error', 'unavailable', 'unknown']], ['lawn_mower', ['mowing', 'paused', 'returning', 'docked', 'error', 'unavailable']]]) {
    for (const e of etats) assert.equal(phaseRobotDemo(e), R.phaseRobot(domaine, e), domaine + ' ' + e);
  }
  // Mesuré le 18/10 : importé par la démo, robots.js sortait du démarrage dans un morceau partagé, chargé avec lui.
  assert.ok(!/from '\.\/robots\.js'/.test(DEMO), 'la démo importe robots.js : le démarrage se coupe en deux');
});

test('la démo de l’écran passe par les mêmes fonctions que ce test', () => {
  /* ASSERTION MODIFIÉE (passe bis du 20/10) : le faux serveur reçoit la description de la maison du magasin de la démo
   * (`lireCfgDemo('loggia_entities')`) — un script désigné dans la roue compte sur-le-champ, comme chez le vrai. */
  assert.ok(DEMO.includes("if (msg && msg.type === 'loggia/robots/lancer') return lancerRobotDemo(states, msg, toucher, lireCfgDemo('loggia_entities'));"), 'le départ');
  assert.ok(DEMO.includes("} else if (domaine === 'lawn_mower' || domaine === 'vacuum') {\n      serviceRobotDemo(states, domaine, service, { ...(data || {}), entity_id: id }, toucher);"), 'les services des robots');
  assert.ok(DEMO.includes("if (msg && msg.type === 'loggia/robots/etat') return Promise.resolve(robotsDemo(states, lireCfgDemo('loggia_entities')));"), 'l’état');
});

/* ── Les pièces sans rien configurer (chantier IoT, tranche robots 2, 19/10 ; § 9 de la conception, ses choix Q1 A, Q2 A, Q3 A) ──
 *
 * TESTS AJOUTÉS : la démo porte chaque cas, et son faux serveur répond comme le vrai — par défaut, l'aspirateur a le bit CLEAN_AREA et
 * cinq zones de Home Assistant associées (`vacuum.clean_area`, le carnet note les zones) ; `sans-association` (le bit, les pièces
 * publiées par `spot_area`, le message à un administrateur) ; `exception` (un Ecovacs sans le bit qui publie `rooms` : la commande de
 * ses scripts, deux passages) ; `rooms-vide` (rien) ; `scripts` (ses interrupteurs et son script gardent la main) ; `carte-changee` ;
 * `etages` (deux cartes, les pièces de l'autre comptées). Le planning porte un passage par zones et un d'avant par segments. */
const CARTE = 'select.aspirateur_carte_active', COMPTEUR = 'number.aspirateur_compteur_de_nettoyage';
const zoneHA = (zone, nom) => ({ id: 'zone:' + zone, nom, segments: [], zone });

test('par défaut : le bit, cinq zones de Home Assistant associées — « Nettoyer 2 pièces » part, le carnet note les zones ; le faux serveur vérifie comme le vrai', async () => {
  const m = maisonRobotsDemo({ quand: QUAND });
  assert.equal(m.states[ASP].attributes.supported_features & 16384, 16384, 'le bit CLEAN_AREA');
  assert.deepEqual([m.states[CARTE].state, m.states[CARTE].attributes.options], ['Maison', ['Maison']], 'une seule carte');
  const p = m.etat().pieces[ASP];
  // ASSERTION MODIFIÉE (passe bis du 20/10, point 11) : plus de `commande`, `passages`, `etage` dans l'état — personne ne les lisait.
  assert.deepEqual([p.source, p.capable, p.association, p.carte_changee, p.script_pieces, p.autres_cartes], ['zones', true, true, false, false, []]);
  assert.deepEqual(p.zones.map(z => [z.id, z.nom, z.segments]), [['zone:cuisine', 'Cuisine', ['m1_2']], ['zone:entree', 'Entrée', ['m1_5']], ['zone:salon', 'Salon', ['m1_1']],
    ['zone:bureau', 'Bureau', ['m1_3']], ['zone:chambre', 'Chambre', ['m1_4']]], 'les zones de la maison de la démo, par étage puis par nom');
  assert.deepEqual(p.segments.map(s => [s.id, s.nom]), [['seg:1', 'Salon'], ['seg:2', 'Cuisine'], ['seg:3', 'Bureau'], ['seg:4', 'Chambre'], ['seg:5', 'Entrée']], 'ce que le robot publie reste lisible');
  const r = await m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [zoneHA('salon', 'Salon'), zoneHA('cuisine', 'Cuisine')] });
  assert.deepEqual([m.states[ASP].state, r.en_cours[ASP].zones, r.en_cours[ASP].tout], ['cleaning', [{ id: 'zone:salon', nom: 'Salon' }, { id: 'zone:cuisine', nom: 'Cuisine' }], false]);
  // La sœur de carte active, telle que l'écran la lit (ASSERTION MODIFIÉE, passe bis du 20/10 : elle ne vérifiait rien).
  const carte = soeurs(m, ASP).find(x => x.id === CARTE);
  assert.deepEqual([carte && carte.cle, carte && carte.etat, carte && carte.attributs.options], ['active_map', 'Maison', ['Maison']]);
  m.avancer(20 * 60000);
  m.service('vacuum', 'return_to_base', { entity_id: ASP });
  await assert.rejects(m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [zoneHA('salon', 'Salon'), zoneHA('cave', 'Cave')] }), { code: 'zone_sans_piece' });
  assert.equal(m.states[ASP].state, 'docked', 'un refus ne commande rien');
  // `vacuum.clean_area` en direct — un serveur sans `lancer` — fait partir le robot aussi.
  const m2 = maisonRobotsDemo({ quand: QUAND });
  m2.service('vacuum', 'clean_area', { entity_id: ASP, cleaning_area_id: ['salon'] });
  assert.equal(m2.states[ASP].state, 'cleaning');
  // Le passage en pause de la variante `pause` nomme les zones par leur identifiant de zone : les puces le retrouvent.
  const m3 = maisonRobotsDemo({ quand: QUAND, variante: 'pause' });
  assert.deepEqual(m3.etat().en_cours[ASP].zones.map(z => z.id), ['zone:salon', 'zone:cuisine']);
});

test('`?demo&robots=sans-association` : le bit, aucune association, rien de publié (un Roborock) — ni puce ni départ par zones, le chemin à un administrateur ; `sans-association-rooms` : les pièces publiées par `spot_area`', async () => {
  const m = maisonRobotsDemo({ quand: QUAND, variante: 'sans-association' });
  const p = m.etat().pieces[ASP];
  assert.deepEqual([p.source, p.capable, p.association, p.zones, p.segments, m.states[ASP].attributes.rooms], ['aucune', true, false, [], [], {}]);
  await assert.rejects(m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [zoneHA('salon', 'Salon')] }), { code: 'association_absente' });
  await assert.rejects(m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [{ id: 'seg:1', nom: 'Salon', segments: [1] }] }), { code: 'pieces_perimees' }, 'une liste que le robot ne publie pas ne part pas');
  assert.deepEqual(R.lignesPieces({ pieces: p, admin: true, nomRobot: 'Aspirateur' }).map(l => l.cle), ['association'], 'la popup dit à un administrateur où associer');
  // Le même, qui publie ses pièces : elles s'offrent par `spot_area`, et un administrateur lit comment les nommer.
  const r = maisonRobotsDemo({ quand: QUAND, variante: 'sans-association-rooms' });
  const q = r.etat().pieces[ASP];
  assert.deepEqual([q.source, q.capable, q.association, q.zones, q.segments.length], ['segments', true, false, [], 5]);
  await assert.rejects(r.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [zoneHA('salon', 'Salon')] }), { code: 'association_absente' });
  const e = await r.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [{ id: 'seg:1', nom: 'Salon', segments: [1] }] });
  assert.deepEqual([r.states[ASP].state, noms(e.en_cours[ASP].zones)], ['cleaning', ['Salon']]);
  assert.deepEqual(R.lignesPieces({ pieces: q, admin: true }).map(l => l.cle), ['nommer']);
});

test('`?demo&robots=exception` : un Ecovacs sans le bit qui publie ses pièces — la commande de ses scripts, deux passages en tête ; `rooms-vide` : rien, et une liste périmée ne part pas', async () => {
  const m = maisonRobotsDemo({ quand: QUAND, variante: 'exception' });
  assert.equal(m.states[ASP].attributes.supported_features & 16384, 0, 'pas le bit : son cas');
  assert.equal(m.states[COMPTEUR].state, '2', 'le compteur de passages de l’appareil');
  const p = m.etat().pieces[ASP];
  assert.deepEqual([p.source, p.capable, p.association, p.zones, p.segments.length], ['segments', false, false, [], 5]);
  // Ce que l'écran enverrait en direct, sur les sœurs de la démo : la commande de ses scripts, « 2,1,2 ».
  const c = R.commandeZones({ plateforme: 'ecovacs', idRobot: ASP, segments: [1, 2], bits: m.states[ASP].attributes.supported_features, versionHa: '2026.10.1',
    publie: R.publieRooms(m.states[ASP]), passages: R.passagesRobot(soeurs(m, ASP)) });
  assert.deepEqual([c.data.command, c.data.params], ['clean_V2', { act: 'start', content: { type: 'freeClean', value: '2,1,2' } }]);
  await assert.rejects(m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [zoneHA('salon', 'Salon')] }), { code: 'pieces_inconnues' }, 'sans le bit, Home Assistant refuse clean_area');
  const r = await m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [{ id: 'seg:1', nom: 'Salon', segments: [1] }] });
  assert.deepEqual([m.states[ASP].state, noms(r.en_cours[ASP].zones)], ['cleaning', ['Salon']]);
  // Un `rooms` vide : ni puce, ni commande — et un segment que le robot ne publie plus ne part pas.
  const v = maisonRobotsDemo({ quand: QUAND, variante: 'rooms-vide' });
  assert.deepEqual([v.states[ASP].attributes.rooms, v.states[COMPTEUR]], [{}, undefined]);
  const q = v.etat().pieces[ASP];
  assert.deepEqual([q.source, q.capable, q.segments, q.zones], ['aucune', false, [], []]);
  await assert.rejects(v.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [{ id: 'seg:1', nom: 'Salon', segments: [1] }] }), { code: 'pieces_perimees' });
  assert.equal(v.states[ASP].state, 'docked');
});

test('`?demo&robots=scripts` : ses interrupteurs et son script gardent la main — la maison de la démo gagne un script et deux interrupteurs, que le faux serveur lance', async () => {
  const m = maisonRobotsDemo({ quand: QUAND, variante: 'scripts' });
  assert.deepEqual(['script.nettoyer_pieces_demo', 'input_boolean.nettoyer_salon_demo', 'input_boolean.nettoyer_cuisine_demo'].map(id => m.states[id] && m.states[id].state), ['off', 'off', 'off']);
  const cfg = m.config().loggia_entities;
  assert.deepEqual(cfg.vacuumScripts, { pieces_selectionnees: 'script.nettoyer_pieces_demo' });
  assert.deepEqual(cfg.vacuumRooms.map(r => [r.id, r.name, r.toggle, r.segments]), [['salon', 'Salon', 'input_boolean.nettoyer_salon_demo', [1]], ['cuisine', 'Cuisine', 'input_boolean.nettoyer_cuisine_demo', [2]]]);
  const p = m.etat().pieces[ASP];
  assert.deepEqual([p.source, p.script_pieces, p.zones.length], ['scripts', true, 5], 'la source le dit ; les zones restent lisibles pour la ligne');
  const r = await m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [{ id: 'salon', nom: 'Salon', segments: [] }], script: 'script.nettoyer_pieces_demo', role: 'pieces_selectionnees' });
  assert.deepEqual([m.states[ASP].state, noms(r.en_cours[ASP].zones), r.en_cours[ASP].libelle], ['cleaning', ['Salon'], 'Nettoyer les pièces choisies']);
  m.service('vacuum', 'return_to_base', { entity_id: ASP });
  await assert.rejects(m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [], script: 'script.autre', role: 'nettoyer_tout' }), { code: 'script_inconnu' });
  // Sa décision du 20/10 : derrière son script des pièces, un départ par les zones de Home Assistant se refuse — rien ne bascule.
  await assert.rejects(m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [zoneHA('salon', 'Salon')] }), { code: 'scripts_gardent_la_main' });
  // La maison par défaut n'a pas de script maison : le faux serveur refuse le sien aussi (la variante vit dans la maison qu'on monte).
  const d = maisonRobotsDemo({ quand: QUAND });
  assert.equal(d.config().loggia_entities.vacuumScripts, undefined);
  await assert.rejects(d.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [], script: 'script.nettoyer_pieces_demo', role: 'pieces_selectionnees' }), { code: 'script_inconnu' });
});

/* TEST AJOUTÉ (passe bis du 20/10 ; sa décision « Mon script garde la main ») : SON cas — `scripts-sans-pieces` (ses cinq scripts par
 * rôle, pas celui des pièces : la source `scripts`, aucune puce, un départ par pièces refusé, « tout » par son `nettoyer_tout`, un geste
 * par script) ; `scripts-avec-pieces` (le script des pièces désigné : ses interrupteurs) ; un rôle désigné dans la roue compte
 * sur-le-champ (la description que le magasin de la démo tient) ; les deux formes mêlées se refusent comme chez le vrai. */
test('`?demo&robots=scripts-sans-pieces` et `scripts-avec-pieces` : son cas, avant et après avoir désigné son script des pièces', async () => {
  const m = maisonRobotsDemo({ quand: QUAND, variante: 'scripts-sans-pieces' });
  assert.equal(m.states[ASP].attributes.supported_features & 16384, 0, 'son robot : pas le bit');
  const cfg = m.config().loggia_entities;
  assert.deepEqual(Object.keys(cfg.vacuumScripts).sort(), ['localiser', 'nettoyer_tout', 'pause', 'reprendre', 'retour_base']);
  assert.ok(Object.values(cfg.vacuumScripts).every(id => m.states[id] && m.states[id].state === 'off'), 'ses cinq scripts existent dans la maison');
  assert.deepEqual(cfg.vacuumRooms.map(r => r.toggle), ['input_boolean.nettoyer_salon_demo', 'input_boolean.nettoyer_cuisine_demo']);
  const p = m.etat().pieces[ASP];
  assert.deepEqual([p.source, p.script_pieces, p.capable, p.segments.length], ['scripts', false, false, 5], 'ses scripts gardent la main ; ses pièces publiées restent lisibles, sans puce');
  await assert.rejects(m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [{ id: 'seg:1', nom: 'Salon', segments: [1] }] }), { code: 'scripts_gardent_la_main' }, 'jamais l’exception derrière ses scripts');
  assert.equal(m.states[ASP].state, 'docked');
  const r = await m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [], script: 'script.aspirateur_nettoyer_tout', role: 'nettoyer_tout' });
  assert.deepEqual([m.states[ASP].state, r.en_cours[ASP].tout, r.en_cours[ASP].libelle], ['cleaning', true, 'Nettoyer tout le logement']);
  const g = await m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [], script: 'script.aspirateur_pause', role: 'pause' });
  assert.equal(m.states[ASP].state, 'paused', 'un geste par script');
  assert.ok(g.en_cours[ASP], 'le passage reste ouvert');
  await assert.rejects(m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [], script: 'script.nettoyer_pieces_demo', role: 'pieces_selectionnees' }), { code: 'script_inconnu' }, 'pas encore désigné');
  // Désigné dans la roue : la description du magasin de la démo le dit au faux serveur, et le script des pièces part.
  const designe = { ...cfg, vacuumScripts: { ...cfg.vacuumScripts, pieces_selectionnees: 'script.nettoyer_pieces_demo' } };
  m.service('vacuum', 'return_to_base', { entity_id: ASP });
  assert.equal(m.etat(designe).pieces[ASP].script_pieces, true);
  const s = await m.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [{ id: 'salon', nom: 'Salon', segments: [] }], script: 'script.nettoyer_pieces_demo', role: 'pieces_selectionnees' }, designe);
  assert.deepEqual([m.states[ASP].state, noms(s.en_cours[ASP].zones)], ['cleaning', ['Salon']]);
  // La variante d'après : le script des pièces est déjà désigné.
  const a = maisonRobotsDemo({ quand: QUAND, variante: 'scripts-avec-pieces' });
  assert.equal(a.config().loggia_entities.vacuumScripts.pieces_selectionnees, 'script.nettoyer_pieces_demo');
  assert.deepEqual([a.etat().pieces[ASP].source, a.etat().pieces[ASP].script_pieces], ['scripts', true]);
  // Les deux formes mêlées dans un départ : `invalid_format`, comme `lire_zones` du vrai.
  const d = maisonRobotsDemo({ quand: QUAND });
  await assert.rejects(d.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [zoneHA('salon', 'Salon'), { id: 'seg:2', nom: 'Cuisine', segments: [2] }] }), { code: 'invalid_format' });
  assert.equal(d.states[ASP].state, 'docked');
  assert.ok(DEMO.includes("'scripts-sans-pieces', 'scripts-avec-pieces'"), 'les deux variantes se lisent dans l’URL');
});

/* TEST AJOUTÉ (passe bis 2 du 20/10, relecture de contrôle) : la roue envoie le RÔLE seul (`loggia/robots/scripts`), et le faux serveur
 * le fond dans la description telle qu'elle est dans son magasin — `fusion_vacuum_scripts` du vrai : rien d'autre ne bouge, un rôle
 * vide est retiré, le dernier emporte `vacuumScripts`, une description illisible refuse ; l'état porte les rôles désignés
 * (`pieces.scripts`), que la roue lit ; un compte ordinaire est refusé (`unauthorized`), comme chez le vrai (`require_admin`). */
test('la roue en démo : le rôle seul, fondu dans la description entière ; l’état dit les rôles désignés', () => {
  const m = maisonRobotsDemo({ quand: QUAND, variante: 'scripts-sans-pieces' });
  const avant = m.config().loggia_entities;
  assert.deepEqual(Object.keys(m.etat().pieces[ASP].scripts).sort(), ['localiser', 'nettoyer_tout', 'pause', 'reprendre', 'retour_base'], 'l’état dit les rôles désignés');
  const apres = m.designer('pieces_selectionnees', 'script.nettoyer_pieces_demo');
  assert.deepEqual(Object.keys(apres).sort(), Object.keys(avant).sort(), 'aucune clé de la description n’a bougé');
  assert.deepEqual({ ...apres, vacuumScripts: null }, { ...avant, vacuumScripts: null }, 'rien d’autre que `vacuumScripts` ne change');
  assert.deepEqual(apres.vacuumScripts, { ...avant.vacuumScripts, pieces_selectionnees: 'script.nettoyer_pieces_demo' });
  assert.deepEqual([m.etat(apres).pieces[ASP].script_pieces, m.etat(apres).pieces[ASP].scripts.pieces_selectionnees], [true, 'script.nettoyer_pieces_demo']);
  const sans = m.designer('localiser', null, apres);
  assert.ok(!('localiser' in sans.vacuumScripts) && sans.vacuumScripts.pause === avant.vacuumScripts.pause, 'un rôle vide est retiré, les autres restent');
  assert.deepEqual(designerScriptDemo({ alarm: 'x', vacuumScripts: { pause: 'script.p' } }, 'pause', null), { alarm: 'x' }, 'le dernier rôle emporte `vacuumScripts`');
  assert.deepEqual(designerScriptDemo(null, 'pause', 'script.p'), { vacuumScripts: { pause: 'script.p' } }, 'une description qui n’existe pas naît du rôle');
  for (const [role, script, entites] of [['danser', 'script.p', {}], ['pause', 'light.p', {}], ['pause', '', {}], ['pause', 'script.p', []], ['pause', 'script.p', 'texte']]) {
    assert.throws(() => designerScriptDemo(entites, role, script), { code: 'invalid_format' }, role + ' ' + script);
  }
  assert.ok(DEMO.includes("msg.type === 'loggia/robots/scripts'") && DEMO.includes("if (ordinaire) return Promise.reject({ code: 'unauthorized'"), 'le faux serveur répond à la commande, et la refuse à un compte ordinaire');
  // La maison par défaut n'a pas de description de scripts : désigner en crée une, et la source devient `scripts` sur-le-champ.
  const d = maisonRobotsDemo({ quand: QUAND });
  const neuve = d.designer('nettoyer_tout', 'script.nettoyer_pieces_demo', d.config().loggia_entities);
  assert.deepEqual(neuve.vacuumScripts, { nettoyer_tout: 'script.nettoyer_pieces_demo' });
});

test('`?demo&robots=carte-changee` : la réparation ouverte, les puces restent ; `etages` : deux cartes, les deux pièces de l’autre comptées, un départ vers elles refusé', async () => {
  const c = maisonRobotsDemo({ quand: QUAND, variante: 'carte-changee' });
  assert.deepEqual([c.etat().pieces[ASP].carte_changee, c.etat().pieces[ASP].zones.length], [true, 5]);
  const e = maisonRobotsDemo({ quand: QUAND, variante: 'etages' });
  assert.deepEqual([e.states[CARTE].state, e.states[CARTE].attributes.options], ['Rez-de-chaussée', ['Rez-de-chaussée', 'Étage']]);
  const p = e.etat().pieces[ASP];
  assert.deepEqual([p.zones.map(z => z.nom), p.autres_cartes, p.autres_zones], [['Cuisine', 'Entrée', 'Salon'], [{ carte: 'Étage', n: 2 }], ['bureau', 'chambre']]);
  await assert.rejects(e.lancer({ type: 'loggia/robots/lancer', robot: ASP, zones: [zoneHA('salon', 'Salon'), zoneHA('chambre', 'Chambre')] }), { code: 'autre_carte' });
  assert.equal(e.states[ASP].state, 'docked');
});

test('la démo de l’écran lit la variante des robots dans l’URL, et dit sa version de Home Assistant', () => {
  assert.ok(DEMO.includes("if (VARIANTES_ROBOTS.indexOf(q.get('robots')) >= 0) VARIANTE_ROBOTS = q.get('robots');"), 'la variante');
  assert.ok(DEMO.includes("config: { latitude: 48.8566, longitude: 2.3522, time_zone: 'Europe/Paris', version: '2026.10.1' },"), 'la version, celle d’un Home Assistant récent');
  assert.ok(!/command:\s*['"]clean_V2/.test(DEMO), 'la démo n’envoie pas la commande brute : elle la nomme seulement (`commande`), et la reconnaît quand l’écran l’envoie');
});
