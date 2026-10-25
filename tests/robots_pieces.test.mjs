/* TEST AJOUTÉ (chantier IoT, tranche robots 2, 19/10 ; conception R1 à R11, R7 ; ses choix Q1 A, Q2 A, Q3 A) — ce que la popup
 * d'un robot CALCULE des pièces de Home Assistant, à sec : `robotsfiche.js`, chargé à la demande.
 *
 * Ce qui est garanti :
 *  - la version de Home Assistant (`hass.config.version`) se compare à 2026.3 ; inconnue, elle vaut « récente » ;
 *  - R4 : `commandeZones` envoie une LISTE à `spot_area` sur un Home Assistant récent quand le robot a le bit CLEAN_AREA, une
 *    chaîne avant ; Q2 A : un Ecovacs qui publie `rooms` SANS le bit part par la commande de ses scripts — `clean_V2` / `freeClean`,
 *    le nombre de passages de l'appareil en tête —, l'exception NOMMÉE, bornée ; sans `rooms`, rien ; Roborock, Dreame, Xiaomi ne
 *    changent pas ; `commandeZonesHA` est `vacuum.clean_area` ;
 *  - R6 : les puces de « Où » depuis `etat.pieces` : le nom de la zone de Home Assistant, la couleur d'une pièce configurée du même
 *    nom, sinon la palette des pièces (des jetons, les mêmes que `MED_COLORS` de state.js) dans l'ordre des zones ;
 *  - § 3.1 : les lignes sous (ou à la place de) « Où » — ses scripts qui gardent la main, l'association à faire (le chemin pour un
 *    administrateur, la phrase sobre pour un compte ordinaire), nommer les pièces, la carte refaite, les pièces d'une autre carte ;
 *  - R5 : `zonePlanning` porte `zone` ; R7 : la migration du plan coloré, `seg:` → `zone:` quand une seule zone répond, oubliée sinon ;
 *  - l'exception `clean_V2` ne s'écrit qu'ici côté écran. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const R = await import('../src/robotsfiche.js');
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

const ROBOT = 'vacuum.robot_demo';
const BIT = 16384;
const PIECES = {
  source: 'zones', capable: true, association: true, carte_changee: false, commande: 'clean_area', passages: 1, autres_cartes: [], autres_zones: [],
  zones: [
    { id: 'zone:cuisine', nom: 'Cuisine', zone: 'cuisine', etage: 'rdc', segments: ['m1_2'], noms_segments: ['Cuisine'] },
    { id: 'zone:salon', nom: 'Salon', zone: 'salon', etage: 'rdc', segments: ['m1_1', 'm1_3'], noms_segments: ['Salon', 'Salle à manger'] },
    { id: 'zone:chambre_amis', nom: 'Chambre d’amis', zone: 'chambre_amis', etage: 'haut', segments: ['m1_7'], noms_segments: ['Chambre'] },
  ],
  segments: [{ id: 'seg:1', nom: 'Salon', slug: 'salon', segments: [1] }],
};

test('la version de Home Assistant se compare à 2026.3 ; inconnue, elle est récente', () => {
  assert.equal(R.versionRecente('2026.10.1'), true);
  assert.equal(R.versionRecente('2026.3.0'), true);
  assert.equal(R.versionRecente('2026.2.4'), false);
  assert.equal(R.versionRecente('2025.12.0'), false);
  assert.equal(R.versionRecente(null), true);
  assert.equal(R.versionRecente('x'), true);
});

test('R4 : spot_area en liste sur un Home Assistant récent, en chaîne avant ; Q2 A : l’exception nommée d’un Ecovacs sans le bit', () => {
  const liste = R.commandeZones({ plateforme: 'ecovacs', idRobot: ROBOT, segments: [1, '3'], bits: BIT, versionHa: '2026.10.1' });
  assert.deepEqual(liste, { domaine: 'vacuum', service: 'send_command', data: { entity_id: ROBOT, command: 'spot_area', params: { rooms: [1, 3], cleanings: 1 } } });
  assert.deepEqual(R.commandeZones({ plateforme: 'ecovacs', idRobot: ROBOT, segments: [1, 3], bits: BIT, versionHa: '2026.2.0' }).data.params, { rooms: '1,3', cleanings: 1 }, 'avant 2026.3 : la chaîne');
  assert.deepEqual(R.commandeZones({ plateforme: 'ecovacs', idRobot: ROBOT, segments: [1, 3], bits: 0, versionHa: '2026.2.0' }).data.params, { rooms: '1,3', cleanings: 1 }, 'avant 2026.3, pas de bit possible : la règle d’aujourd’hui');
  const exception = R.commandeZones({ plateforme: 'ecovacs', idRobot: ROBOT, segments: [1, 3], bits: 0, versionHa: '2026.10.1', publie: true, passages: 2 });
  assert.deepEqual(exception, { domaine: 'vacuum', service: 'send_command', data: { entity_id: ROBOT, command: 'clean_V2', params: { act: 'start', content: { type: 'freeClean', value: '2,1,3' } } } }, 'la commande de ses scripts, le nombre de passages en tête');
  assert.equal(R.commandeZones({ plateforme: 'ecovacs', idRobot: ROBOT, segments: [1], bits: 0, versionHa: '2026.10.1', publie: true, passages: 0 }).data.params.content.value, '1,1', 'un compteur illisible vaut un passage');
  assert.equal(R.commandeZones({ plateforme: 'ecovacs', idRobot: ROBOT, segments: [1, 3], bits: 0, versionHa: '2026.10.1', publie: false }), null, 'sans `rooms` publié : jamais une commande devinée');
  assert.equal(R.commandeZones({ plateforme: 'ecovacs', idRobot: ROBOT, segments: [1], bits: BIT, versionHa: null, publie: true }).data.command, 'spot_area', 'avec le bit, la commande de l’intégration ; version inconnue : récente');
  // Les autres intégrations ne changent pas (R1 bornée à ce qui est vérifié).
  assert.deepEqual(R.commandeZones({ plateforme: 'roborock', idRobot: ROBOT, segments: [16, 17], bits: 0 }).data, { entity_id: ROBOT, command: 'app_segment_clean', params: [16, 17] });
  assert.equal(R.commandeZones({ plateforme: 'xiaomi_miio', idRobot: ROBOT, segments: [2] }).service, 'vacuum_clean_segment');
  assert.equal(R.commandeZones({ plateforme: 'inconnue', idRobot: ROBOT, segments: [1], bits: BIT }), null);
  // `vacuum.clean_area` : les zones de Home Assistant.
  assert.deepEqual(R.commandeZonesHA({ idRobot: ROBOT, zones: [{ id: 'zone:cuisine', nom: 'Cuisine', zone: 'cuisine' }, { id: 'zone:salon', zone: 'salon' }] }),
    { domaine: 'vacuum', service: 'clean_area', data: { entity_id: ROBOT, cleaning_area_id: ['cuisine', 'salon'] } });
  assert.equal(R.commandeZonesHA({ idRobot: ROBOT, zones: [] }), null);
  assert.equal(R.commandeZonesHA({ idRobot: null, zones: [{ zone: 'cuisine' }] }), null);
});

test('le compteur de passages de l’appareil, et « rooms » publié', () => {
  const soeur = (id, etat, cle) => ({ id, domaine: id.split('.')[0], objet: id.split('.')[1], cle, etat: String(etat), attributs: {}, texte: cle || '' });
  assert.equal(R.passagesRobot([soeur('number.robot_demo_compteur', 2, 'clean_count')]), 2);
  assert.equal(R.passagesRobot([soeur('number.robot_demo_compteur', 'unavailable', 'clean_count')]), 1);
  assert.equal(R.passagesRobot([soeur('number.robot_demo_autre', 3, null)]), 1, 'un autre nombre n’est pas le compteur');
  assert.equal(R.passagesRobot([]), 1);
  assert.equal(R.publieRooms({ attributes: { rooms: { salon: 1 } } }), true);
  assert.equal(R.publieRooms({ attributes: { rooms: {} } }), false);
  assert.equal(R.publieRooms({ attributes: { rooms: { salon: 'x' } } }), false, 'une valeur qui n’est pas un numéro ne publie rien');
  assert.equal(R.publieRooms(null), false);
});

test('R6 : les puces de « Où » depuis les zones de Home Assistant — le nom de la zone, la couleur d’une pièce configurée du même nom, sinon la palette', () => {
  const rooms = [{ id: 'salon', name: 'Salon', color: 'var(--o-ok)', icon: 'couch', segments: [1] }, { id: 'chambre_amis', name: 'Chambre d’Amis', color: 'var(--o-purple)' }];
  const vue = R.piecesDeLaVue(PIECES, rooms);
  assert.deepEqual(vue.map(z => [z.id, z.nom, z.zone, z.couleur, z.icone, z.segments]), [
    ['zone:cuisine', 'Cuisine', 'cuisine', R.COULEURS_ZONES[0], null, ['m1_2']],
    ['zone:salon', 'Salon', 'salon', 'var(--o-ok)', 'couch', ['m1_1', 'm1_3']],
    ['zone:chambre_amis', 'Chambre d’amis', 'chambre_amis', 'var(--o-purple)', null, ['m1_7']],
  ], 'l’ordre du serveur ; la pièce configurée se reconnaît sans accents ni casse, par son nom ou par la zone');
  assert.deepEqual(vue[1].piece, { zone: 'salon', segments: ['m1_1', 'm1_3'] }, 'ce que le planning garde (R5) et ce que la migration du plan lit (R7)');
  assert.deepEqual(R.piecesDeLaVue(PIECES, []).map(z => z.couleur), [R.COULEURS_ZONES[0], R.COULEURS_ZONES[1], R.COULEURS_ZONES[2]], 'sans pièce configurée, la palette dans l’ordre');
  assert.deepEqual(R.piecesDeLaVue(null, rooms), []);
  assert.deepEqual(R.piecesDeLaVue({ zones: 'x' }, rooms), []);
  // La palette est celle des pièces nouvelles de state.js (I17) : les mêmes jetons, dans le même ordre — un test de source les tient ensemble.
  const state = readFileSync(join(RACINE, 'src', 'state.js'), 'utf8');
  const med = /const MED_COLORS = \[([^\]]*)\]/.exec(state);
  assert.ok(med, 'MED_COLORS introuvable dans state.js');
  assert.deepEqual(R.COULEURS_ZONES, med[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean));
  assert.ok(R.COULEURS_ZONES.every(c => /^var\(--o-/.test(c)), 'des jetons du thème, jamais une couleur en dur');
});

test('§ 3.1 : les lignes de « Où » — ses scripts, l’association à faire, nommer, la carte refaite, une autre carte', () => {
  const cles = (l) => l.map(x => [x.cle, x.encre]);
  // Ses scripts gardent la main (Q1 A), seulement quand une association existe aussi : sinon rien à dire.
  assert.deepEqual(cles(R.lignesPieces({ pieces: PIECES, admin: true, parInterrupteurs: true })), [['scripts', 'var(--o-text2)']]);
  assert.equal(R.lignesPieces({ pieces: PIECES, admin: true, parInterrupteurs: true })[0].texte, 'Vos scripts gardent la main pour les pièces.');
  assert.deepEqual(R.lignesPieces({ pieces: { ...PIECES, zones: [], association: false }, admin: true, parInterrupteurs: true }), []);
  // Le bit, pas d'association : le chemin exact pour un administrateur, la phrase sobre pour un compte ordinaire.
  const sans = { ...PIECES, source: 'aucune', association: false, zones: [], segments: [], commande: null };
  const admin = R.lignesPieces({ pieces: sans, admin: true, nomRobot: 'Robot démo' });
  assert.deepEqual(cles(admin), [['association', 'var(--o-text2)']]);
  assert.equal(admin[0].texte, 'Associez une fois les pièces du robot aux zones de Home Assistant : Paramètres › Appareils et services › Entités › Robot démo › roue › « Associer les segments aux zones ».');
  assert.equal(admin[0].glyphe, 'info');
  assert.equal(R.lignesPieces({ pieces: sans, admin: false, nomRobot: 'Robot démo' })[0].texte, 'Les pièces du robot ne sont pas encore associées aux zones de Home Assistant.');
  // Le bit, pas d'association, et le robot publie ses pièces : elles s'offrent par leur commande ; un administrateur lit comment les nommer.
  const publie = { ...sans, source: 'segments', segments: PIECES.segments, commande: 'spot_area' };
  assert.deepEqual(R.lignesPieces({ pieces: publie, admin: true }).map(l => l.texte), ['Associez les pièces aux zones de Home Assistant pour les nommer comme vos pièces.']);
  assert.deepEqual(R.lignesPieces({ pieces: publie, admin: false }), [], 'un compte ordinaire n’a rien à faire : rien');
  // Sans le bit (son cas) : ni ligne, Home Assistant n'offre rien à associer — avec ou sans `rooms`.
  assert.deepEqual(R.lignesPieces({ pieces: { ...sans, capable: false }, admin: true }), []);
  assert.deepEqual(R.lignesPieces({ pieces: { ...publie, capable: false, commande: 'clean_V2' }, admin: true }), []);
  // La carte refaite : en ambre, pour tout compte ; les pièces d'une autre carte : une ligne par carte, le pluriel de la langue.
  const changee = R.lignesPieces({ pieces: { ...PIECES, carte_changee: true, autres_cartes: [{ carte: 'Étage', n: 3 }, { carte: 'Cave', n: 1 }] }, admin: false });
  assert.deepEqual(cles(changee), [['carte', 'var(--o-warn)'], ['ailleurs', 'var(--o-text2)'], ['ailleurs', 'var(--o-text2)']]);
  assert.deepEqual(changee.map(l => l.texte), ['La carte du robot a changé : refaites l’association dans Home Assistant.',
    '3 pièces sur une autre carte (Étage) — changez de carte dans les réglages du robot.', '1 pièce sur une autre carte (Cave) — changez de carte dans les réglages du robot.']);
  assert.equal(changee[0].glyphe, 'triangle-warning');
  /* ASSERTION MODIFIÉE (passe bis du 20/10, point 8) : avec ses scripts ET une carte refaite, la seule ligne est « scripts » — les
   * puces sont ses interrupteurs, la carte du robot n'y change rien. */
  assert.deepEqual(cles(R.lignesPieces({ pieces: { ...PIECES, carte_changee: true }, admin: true, parInterrupteurs: true })), [['scripts', 'var(--o-text2)']]);
  assert.deepEqual(R.lignesPieces({ pieces: null, admin: true }), [], 'un serveur d’avant cette tranche : rien');
});

test('R5 : une zone de planning porte la zone de Home Assistant ; R7 : la migration du plan coloré', () => {
  const vue = R.piecesDeLaVue(PIECES, []);
  assert.deepEqual(R.zonePlanning(vue[0]), { id: 'zone:cuisine', nom: 'Cuisine', segments: [], zone: 'cuisine' });
  assert.deepEqual(R.zonePlanning({ id: 'seg:1', nom: 'Salon', piece: { segments: [1] } }), { id: 'seg:1', nom: 'Salon', segments: [1] }, 'la forme d’avant, inchangée');
  // La migration : `seg:1` → la zone dont un segment porte le numéro 1 (chez Ecovacs, le suffixe « _1 ») ; `seg:7` → la chambre ;
  // `seg:9` ne répond à rien : il RESTE (ASSERTION MODIFIÉE, passe bis du 20/10, point 6 — un autre étage, un autre aspirateur) ;
  // `seg:2-7` répond à deux zones : oublié — la région redit « ? » ; ce qui est déjà une zone reste.
  const assoc = { aabbcc: 'seg:1', ddeeff: 'seg:7', 112233: 'seg:9', 445566: 'seg:2-7', 778899: 'zone:cuisine' };
  const m = R.migrerAssociationPlan(assoc, vue);
  assert.deepEqual(m, { assoc: { aabbcc: 'zone:salon', ddeeff: 'zone:chambre_amis', 112233: 'seg:9', 778899: 'zone:cuisine' }, change: true });
  assert.deepEqual(R.migrerAssociationPlan({ aabbcc: 'zone:salon' }, vue), { assoc: { aabbcc: 'zone:salon' }, change: false }, 'rien à migrer : rien ne s’écrit');
  // Sans zones de Home Assistant (la source 3, ou un serveur d'avant), les associations `seg:` restent telles quelles.
  const segs = [{ id: 'seg:1', name: 'Salon', segments: [1] }];
  assert.deepEqual(R.migrerAssociationPlan({ aabbcc: 'seg:1' }, segs), { assoc: { aabbcc: 'seg:1' }, change: false });
  assert.deepEqual(R.migrerAssociationPlan(null, vue), { assoc: {}, change: false });
  // Les segments nus (Roborock : l'identifiant sans préfixe) répondent par l'égalité.
  const nus = R.piecesDeLaVue({ ...PIECES, zones: [{ id: 'zone:bureau', nom: 'Bureau', zone: 'bureau', segments: ['16'] }] }, []);
  assert.deepEqual(R.migrerAssociationPlan({ aabbcc: 'seg:16' }, nus).assoc, { aabbcc: 'zone:bureau' });
});

/* ── Passe bis de la tranche robots 2 (20/10) : sa décision « Mon script garde la main », et les relectures ──────────────────────
 *
 * TESTS AJOUTÉS : `publieRooms` ne compte ni `null` ni une chaîne (point 7) ; R6 — la teinte et l'icône CHOISIES d'une pièce de Loggia
 * du même nom (`loggia_rooms[].teinte`, `.icon`, la table `TEINTES_ZONES` tenue par un test de source avec `TEINTES_PIECE`), puis la
 * couleur de `vacuumRooms`, puis la palette ; l'ordre des pièces de Loggia d'abord (§ 3.1) ; les lignes de « Où » avec un script de
 * départ désigné (point 8 : rien d'autre que « scripts », « désigner » ou « interrupteurs ») ; la migration du plan GARDE un `seg:`
 * sans zone (point 6) ; les scripts par rôle de la roue : le script de départ désigné, les suggestions (ceux du robot d'abord). */

test('point 7 : « rooms » publié ne compte que des numéros de pièce — ni null, ni une chaîne, ni un booléen', () => {
  assert.equal(R.publieRooms({ attributes: { rooms: { salon: null } } }), false);
  assert.equal(R.publieRooms({ attributes: { rooms: { salon: '' } } }), false);
  assert.equal(R.publieRooms({ attributes: { rooms: { salon: true } } }), false);
  assert.equal(R.publieRooms({ attributes: { rooms: { salon: '3' } } }), false, 'comme le serveur (`_entiers`) : un entier, pas une chaîne');
  assert.equal(R.publieRooms({ attributes: { rooms: { salon: [null, 2] } } }), true);
});

test('R6 : la teinte et l’icône choisies d’une pièce de Loggia du même nom, puis la couleur configurée, puis la palette ; les pièces de Loggia d’abord', () => {
  const loggia = [{ room: 'Chambre d’Amis', teinte: 'chambre' }, { room: 'Salon', teinte: 'vert', icon: 'couch' }, { room: 'Bureau', teinte: 'ambre' }];
  const rooms = [{ id: 'cuisine', name: 'Cuisine', color: 'var(--o-ok)', icon: 'utensils' }];
  const vue = R.piecesDeLaVue(PIECES, rooms, loggia);
  assert.deepEqual(vue.map(z => [z.id, z.couleur, z.icone]), [
    ['zone:chambre_amis', 'var(--o-piece-chambre)', null],
    ['zone:salon', 'var(--o-piece-vert)', 'couch'],
    ['zone:cuisine', 'var(--o-ok)', 'utensils'],
  ], 'l’ordre des pièces de Loggia (Chambre d’amis, Salon), puis celui du serveur ; la teinte choisie prime, puis la couleur configurée');
  // Une teinte que la table ne connaît pas : la couleur configurée, sinon la palette — jamais une couleur inventée.
  const inconnue = R.piecesDeLaVue(PIECES, [], [{ room: 'Salon', teinte: 'fuchsia' }]);
  assert.deepEqual(inconnue.map(z => [z.id, z.couleur]), [['zone:salon', R.COULEURS_ZONES[0]], ['zone:cuisine', R.COULEURS_ZONES[1]], ['zone:chambre_amis', R.COULEURS_ZONES[2]]]);
  // Sans pièce de Loggia : l'ordre du serveur et la palette, comme avant ; une pièce se reconnaît par son NOM (pas d'`area`).
  assert.deepEqual(R.piecesDeLaVue(PIECES, [], null).map(z => z.id), ['zone:cuisine', 'zone:salon', 'zone:chambre_amis']);
  assert.deepEqual(R.piecesDeLaVue(PIECES, [], [{ room: 'Salon', area: 'cuisine', teinte: 'vert' }]).map(z => [z.id, z.couleur])[0], ['zone:salon', 'var(--o-piece-vert)']);
  assert.equal('etage' in vue[0], false, 'plus d’`etage` : personne ne le lisait (point 11)');
  /* ASSERTION AJOUTÉE (passe bis 2 du 20/10) : une pièce de Loggia se rattache AUSSI par la ZONE de ses capteurs (`haid.temp`,
   * `haid.humidity` → `areaOf` de l'index), comme la barre des pièces (`RoomNav`) : nommée autrement que sa zone, elle garde sa teinte
   * et sa place. Sans index, le nom seul, comme avant. */
  const index = { areaOf: (id) => ({ 'sensor.temp_sejour': 'salon', 'sensor.hum_cuisine': 'cuisine' })[id] || null };
  const renommees = [{ room: 'Séjour', teinte: 'vert', haid: { temp: 'sensor.temp_sejour' } }, { room: 'Pièce à vivre', teinte: 'ambre', haid: { humidity: 'sensor.hum_cuisine' } }];
  assert.deepEqual(R.piecesDeLaVue(PIECES, [], renommees, index).map(z => [z.id, z.couleur]),
    [['zone:salon', 'var(--o-piece-vert)'], ['zone:cuisine', 'var(--o-piece-ambre)'], ['zone:chambre_amis', R.COULEURS_ZONES[2]]], 'rattachées par leurs capteurs, dans l’ordre des pièces de Loggia');
  assert.deepEqual(R.piecesDeLaVue(PIECES, [], renommees).map(z => z.couleur), [R.COULEURS_ZONES[0], R.COULEURS_ZONES[1], R.COULEURS_ZONES[2]], 'sans index : par le nom seul');
  assert.deepEqual(R.piecesDeLaVue(PIECES, [], renommees, { areaOf: 'x' }).map(z => z.couleur), [R.COULEURS_ZONES[0], R.COULEURS_ZONES[1], R.COULEURS_ZONES[2]], 'un index sans `areaOf` : le nom seul');
  // La table des teintes est celle des pièces (`TEINTES_PIECE`, App.jsx) : les mêmes identifiants, les mêmes jetons — tenus ensemble.
  const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const bloc = /const TEINTES_PIECE = \[([\s\S]*?)\n\];/.exec(app);
  assert.ok(bloc, 'TEINTES_PIECE introuvable dans App.jsx');
  const table = Object.fromEntries([...bloc[1].matchAll(/id: '([a-z]+)'[^}]*col: '([^']+)'/g)].map(m => [m[1], m[2]]));
  assert.deepEqual(R.TEINTES_ZONES, table);
});

test('point 8 : avec un script de départ désigné, les lignes de « Où » ne disent que les scripts, le script à désigner ou l’interrupteur qui manque', () => {
  const cles = (l) => l.map(x => x.cle);
  const sans = { ...PIECES, source: 'aucune', association: false, zones: [], segments: [], commande: null };
  // Son cas : `nettoyer_tout` désigné, pas `pieces_selectionnees` — à un administrateur, où le désigner ; à un compte ordinaire, rien.
  const designer = R.lignesPieces({ pieces: sans, admin: true, scriptDepart: true, scriptPieces: false });
  assert.deepEqual(cles(designer), ['designer']);
  assert.equal(designer[0].texte, 'Désignez votre script des pièces sélectionnées dans la roue : les puces de « Où » seront vos interrupteurs.');
  assert.deepEqual(R.lignesPieces({ pieces: sans, admin: false, scriptDepart: true, scriptPieces: false }), []);
  // Le robot publie ses pièces, le bit est là : derrière un script de départ, ni « nommer » ni « Associez une fois… ».
  const publie = { ...sans, capable: true, source: 'segments', segments: PIECES.segments };
  assert.deepEqual(cles(R.lignesPieces({ pieces: publie, admin: true, scriptDepart: true, scriptPieces: false })), ['designer']);
  assert.deepEqual(cles(R.lignesPieces({ pieces: PIECES, admin: true, scriptDepart: true, scriptPieces: false })), ['designer'], 'une association existe : rien ne bascule, on désigne');
  // `pieces_selectionnees` désigné, aucune pièce à interrupteur : la ligne qui le dit, à un administrateur.
  const interrupteurs = R.lignesPieces({ pieces: sans, admin: true, scriptDepart: true, scriptPieces: true, parInterrupteurs: false });
  assert.deepEqual(cles(interrupteurs), ['interrupteurs']);
  assert.equal(interrupteurs[0].texte, 'Votre script des pièces est désigné, mais aucune pièce de la maison n’a d’interrupteur : les puces de « Où » ne peuvent pas être les vôtres.');
  assert.deepEqual(R.lignesPieces({ pieces: sans, admin: false, scriptDepart: true, scriptPieces: true }), []);
  // Les puces sont ses interrupteurs : « scripts » seulement si une association existe — ni « carte », ni « ailleurs » (rien à faire ici).
  const changee = { ...PIECES, carte_changee: true, autres_cartes: [{ carte: 'Étage', n: 2 }] };
  assert.deepEqual(cles(R.lignesPieces({ pieces: changee, admin: true, parInterrupteurs: true })), ['scripts']);
  assert.deepEqual(R.lignesPieces({ pieces: { ...changee, zones: [], association: false }, admin: true, parInterrupteurs: true }), []);
  // Sans script de départ : la règle d'avant, inchangée.
  assert.deepEqual(cles(R.lignesPieces({ pieces: changee, admin: false })), ['carte', 'ailleurs']);
});

test('point 6 : la migration du plan garde un « seg: » qui ne trouve pas de zone, et n’écrit que si quelque chose a changé', () => {
  const vue = R.piecesDeLaVue(PIECES, []);
  const m = R.migrerAssociationPlan({ aabbcc: 'seg:1', ddeeff: 'seg:9', 112233: 'seg:2-7', 445566: 'zone:cuisine' }, vue);
  assert.deepEqual(m, { assoc: { aabbcc: 'zone:salon', ddeeff: 'seg:9', 445566: 'zone:cuisine' }, change: true },
    '`seg:9` (un autre étage, un autre aspirateur) reste ; `seg:2-7`, équivoque, s’oublie');
  assert.deepEqual(R.migrerAssociationPlan({ ddeeff: 'seg:9' }, vue), { assoc: { ddeeff: 'seg:9' }, change: false }, 'rien n’a changé : rien ne s’écrit');
});

test('la roue : le script de départ désigné, et les suggestions — ceux du robot d’abord, « Aucun » en tête', () => {
  const S = {
    'script.robot_partout': { attributes: { friendly_name: 'Robot - Nettoyer partout' } }, 'script.robot_pieces': { attributes: { friendly_name: 'Robot - Pièces choisies' } },
    'script.robot_ou': { attributes: { friendly_name: 'Robot - Où es-tu' } }, 'script.arroser': { attributes: { friendly_name: 'Arroser' } }, 'light.salon': { attributes: {} },
  };
  assert.deepEqual(R.ROLES_SCRIPTS, ['nettoyer_tout', 'pieces_selectionnees', 'pause', 'reprendre', 'retour_base', 'localiser']);
  assert.equal(R.scriptDepartDesigne({ nettoyer_tout: 'script.robot_partout' }, S), 'depart');
  assert.equal(R.scriptDepartDesigne({ nettoyer_tout: 'script.robot_partout', pieces_selectionnees: 'script.robot_pieces' }, S), 'pieces');
  assert.equal(R.scriptDepartDesigne({ pieces_selectionnees: 'script.disparu' }, S), null, 'un script absent de la maison ne garde rien');
  assert.equal(R.scriptDepartDesigne({ pause: 'script.robot_pause' }, S), null, 'un geste n’est pas un départ');
  assert.equal(R.scriptDepartDesigne(null, S), null);
  const options = R.optionsScripts(S, { nettoyer_tout: 'script.robot_partout' });
  assert.deepEqual(options.map(o => [o.id, o.label, o.groupe || null]), [
    ['', 'Aucun', null],
    ['script.robot_partout', 'Robot - Nettoyer partout', 'Scripts du robot'], ['script.robot_ou', 'Robot - Où es-tu', 'Scripts du robot'], ['script.robot_pieces', 'Robot - Pièces choisies', 'Scripts du robot'],
    ['script.arroser', 'Arroser', 'Autres scripts'],
  ], 'le préfixe des scripts déjà désignés (« script.robot_ ») range les siens en tête, par nom ; l’identifiant se lit en petit (`sub`)');
  assert.equal(options[1].sub, 'script.robot_partout');
  assert.deepEqual(R.optionsScripts(S, {}).map(o => o.groupe || null), [null, 'Autres scripts', 'Autres scripts', 'Autres scripts', 'Autres scripts'].slice(0, 5), 'sans script désigné, pas de préfixe : tous « autres »');
  assert.deepEqual(R.libelleRole('pieces_selectionnees'), 'Pièces sélectionnées');
  assert.deepEqual(['nettoyer_tout', 'pause', 'reprendre', 'retour_base', 'localiser'].map(R.libelleRole), ['Nettoyer tout le logement', 'Mettre en pause', 'Reprendre', 'Retour à la base', 'Localiser']);
  /* ASSERTION AJOUTÉE (passe bis 2 du 20/10, sonde S2c) : un script `unavailable` ou `unknown` est un script ABSENT — Home Assistant le
   * saute en silence, rien ne biperait ; la règle du serveur (`_etat_script`), des mêmes mots : il ne garde plus la main. */
  const S2 = { ...S, 'script.robot_partout': { state: 'unavailable', attributes: {} } };
  assert.equal(R.scriptVivant(S, 'script.robot_partout'), true);
  assert.equal(R.scriptVivant(S2, 'script.robot_partout'), false);
  assert.equal(R.scriptVivant({ 'script.x': { state: 'unknown' } }, 'script.x'), false);
  assert.equal(R.scriptVivant(S, 'light.salon'), false, 'pas un script');
  assert.equal(R.scriptVivant(S, null), false);
  assert.equal(R.scriptDepartDesigne({ nettoyer_tout: 'script.robot_partout' }, S2), null, 'indisponible : il ne garde plus la main');
  assert.equal(R.scriptDepartDesigne({ nettoyer_tout: 'script.robot_partout', pieces_selectionnees: 'script.robot_pieces' }, S2), 'pieces');
});

test('l’exception clean_V2 ne s’écrit qu’à un endroit côté écran : robotsfiche.js', () => {
  const sources = (dossier) => readdirSync(dossier).flatMap(f => { const p = join(dossier, f); return statSync(p).isDirectory() ? sources(p) : /\.(js|jsx)$/.test(f) ? [p] : []; });
  const ou = sources(join(RACINE, 'src')).filter(p => !/[\\/]demo\.js$/.test(p) && readFileSync(p, 'utf8').includes('clean_V2')).map(p => p.slice(RACINE.length + 1).replace(/\\/g, '/'));
  assert.deepEqual(ou, ['src/robotsfiche.js']);
});
