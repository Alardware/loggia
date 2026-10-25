/* TEST AJOUTÉ (chantier IoT, tâche 2, 18/10 ; I7, I9, I18 ; § 6 de la conception) — ce que la carte d'un robot calcule, à sec.
 *
 * La phrase d'état, ligne par ligne, dans l'ordre de la conception : la première qui s'applique gagne, son encre dit si elle
 * alerte (le rouge d'une panne ou d'une erreur, la teinte du robot au travail, le gris sinon) ; les puces de la carte, que la
 * PHASE et les BITS de l'appareil décident — une puce sans bit n'existe pas, et aucune n'envoie `toggle` ; le prochain passage,
 * qui saute ce que « Ne pas déranger » retiendra au serveur (ADR 0043), minuit franchi compris. Le « maintenant » des tests est
 * celui de la maquette : samedi 17/10/2026, 18:20. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// La langue de la machine ne doit pas changer le résultat (garde-fou de la CI).
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const R = await import('../src/robots.js');

const MAINTENANT = new Date(2026, 9, 17, 18, 20).getTime();
const P = (x = {}) => ({ id: 'p1', robot: 'vacuum.r', heure: '09:30', jours: [0, 1, 2, 3, 4], zones: [], actif: true, ...x });
// L'aspirateur de la démo : START, LOCATE, BATTERY, FAN_SPEED, RETURN_HOME, STOP, PAUSE.
const ASP = 8828;

test('I7 : la phrase d’un robot — la première ligne qui s’applique, son encre', () => {
  const ph = (x) => R.phraseRobot({ domaine: 'vacuum', maintenant: MAINTENANT, ...x });
  // 1. Indisponible : depuis quand, la règle des prises et des lumières ; le rouge, et le liseré qui respire.
  assert.deepEqual(ph({ phase: 'absent', depuis: new Date(2026, 9, 17, 14, 20).toISOString() }), { texte: 'Indisponible depuis 14:20', encre: 'var(--o-bad)', panne: true });
  assert.equal(ph({ phase: 'absent', depuis: new Date(2026, 9, 16, 14, 20).toISOString() }).texte, 'Indisponible depuis hier');
  assert.equal(ph({ phase: 'absent' }).texte, 'Indisponible');
  assert.equal(ph({ phase: 'absent', bipe: true }).panne, true, 'un robot muet ne bipe pas');
  // 2. Il bipe : le geste vient d'être fait, il passe avant tout le reste.
  assert.deepEqual(ph({ phase: 'base', bipe: true }), { texte: 'Il bipe : suivez le son', encre: 'var(--o-accent-soft)', panne: false });
  // 3. En erreur : le message de l'appareil, quand il en publie un.
  assert.deepEqual(ph({ phase: 'erreur', erreur: 'Brosse coincée' }), { texte: 'En erreur · Brosse coincée', encre: 'var(--o-bad)', panne: false });
  assert.equal(ph({ phase: 'erreur' }).texte, 'En erreur');
  // 4. Au travail : les pièces que le carnet du serveur sait, dans la teinte du robot.
  assert.deepEqual(ph({ phase: 'travail', pieces: ['Salon', 'Cuisine'] }), { texte: 'Nettoie · Salon, Cuisine', encre: 'var(--o-accent-soft)', panne: false });
  assert.equal(ph({ phase: 'travail', tout: true }).texte, 'Nettoie · tout le logement', 'Loggia a tout lancé');
  assert.equal(ph({ phase: 'travail' }).texte, 'Nettoyage en cours', 'un départ que Loggia n’a pas donné : les pièces ne se savent pas');
  const tond = (x) => R.phraseRobot({ domaine: 'lawn_mower', maintenant: MAINTENANT, ...x });
  assert.deepEqual(tond({ phase: 'travail', pieces: ['Pelouse arrière'] }), { texte: 'Tond · Pelouse arrière', encre: 'var(--o-ok)', panne: false });
  assert.equal(tond({ phase: 'travail', tout: true }).texte, 'Tond · tout le jardin');
  assert.equal(tond({ phase: 'travail' }).texte, 'Tonte en cours');
  // 5. En pause, 6. au retour : le gris.
  assert.deepEqual(ph({ phase: 'pause', pieces: ['Salon', 'Cuisine'] }), { texte: 'En pause · Salon, Cuisine', encre: 'var(--o-text2)', panne: false });
  assert.equal(ph({ phase: 'pause' }).texte, 'En pause');
  assert.deepEqual(ph({ phase: 'retour', pieces: ['Salon'] }), { texte: 'Retour à la base', encre: 'var(--o-text2)', panne: false });
  // 7. Sur la base : le prochain passage qui partira, sinon la base — « en charge » seulement si un capteur le dit.
  assert.equal(ph({ phase: 'base', prochain: { date: new Date(2026, 9, 17, 23, 0) } }).texte, 'Passage à 23:00');
  assert.equal(ph({ phase: 'base', prochain: { date: new Date(2026, 9, 18, 9, 30) } }).texte, 'Passage demain 09:30');
  assert.equal(ph({ phase: 'base', prochain: { date: new Date(2026, 9, 20, 9, 30) } }).texte, 'Passage mardi 09:30');
  assert.deepEqual(ph({ phase: 'base' }), { texte: 'Sur la base', encre: 'var(--o-text2)', panne: false });
  assert.equal(ph({ phase: 'base', charge: true }).texte, 'Sur la base · en charge');
  assert.equal(ph({ phase: 'base', charge: true, prochain: { date: new Date(2026, 9, 18, 9, 30) } }).texte, 'Passage demain 09:30', 'la suite passe avant la charge');
  // 8. Ailleurs, au repos.
  assert.deepEqual(ph({ phase: 'repos' }), { texte: 'À l’arrêt', encre: 'var(--o-text2)', panne: false });
});

test('I9 : les puces de la carte — la phase, puis les bits de l’appareil ; jamais `toggle`', () => {
  const vues = (d, phase, bits) => R.commandesRobot(d, phase, bits).map(c => [c.cle, c.service, c.glyphe, c.choisie]);
  assert.deepEqual(vues('vacuum', 'base', ASP), [['demarrer', 'start', 'play', false], ['localiser', 'locate', 'marker', false]]);
  assert.deepEqual(vues('vacuum', 'travail', ASP), [['pause', 'pause', 'pause', false], ['base', 'return_to_base', 'home', false]]);
  assert.deepEqual(vues('vacuum', 'pause', ASP), [['reprendre', 'start', 'play', false], ['base', 'return_to_base', 'home', false]]);
  assert.deepEqual(vues('vacuum', 'retour', ASP), [['reprendre', 'start', 'play', false], ['base', 'return_to_base', 'home', true]], 'la base, choisie pendant le retour');
  assert.deepEqual(vues('vacuum', 'erreur', ASP), [['base', 'return_to_base', 'home', false]], 'en erreur, la base seule');
  assert.deepEqual(vues('vacuum', 'repos', ASP), [['demarrer', 'start', 'play', false], ['base', 'return_to_base', 'home', false]], 'arrêté hors de sa base : repartir, ou rentrer');
  assert.deepEqual(vues('vacuum', 'absent', ASP), [], 'un robot muet n’a pas de puce');
  // Les bits : sans LOCATE (512), pas de « Localiser » ; sans aucun, rien d'inerte à l'écran.
  assert.deepEqual(vues('vacuum', 'base', ASP - 512), [['demarrer', 'start', 'play', false]]);
  assert.deepEqual(vues('vacuum', 'base', 0), []);
  assert.deepEqual(vues('vacuum', 'base', undefined), []);
  // Une tondeuse : `start_mowing`, `pause`, `dock` — et pas de « Localiser » : Home Assistant n'en a pas pour elle.
  assert.deepEqual(vues('lawn_mower', 'base', 7), [['demarrer', 'start_mowing', 'play', false]]);
  assert.deepEqual(vues('lawn_mower', 'travail', 7), [['pause', 'pause', 'pause', false], ['base', 'dock', 'home', false]]);
  assert.deepEqual(vues('lawn_mower', 'pause', 7), [['reprendre', 'start_mowing', 'play', false], ['base', 'dock', 'home', false]]);
  assert.deepEqual(vues('lawn_mower', 'travail', 1), [], 'sans PAUSE ni DOCK, rien à toucher au travail');
  // Les mots : ceux de la maquette, que la puce seule écrit et que deux puces gardent dans leur nom.
  assert.deepEqual(R.commandesRobot('vacuum', 'base', ASP).map(c => c.mot), ['Démarrer', 'Localiser']);
  assert.deepEqual(R.commandesRobot('vacuum', 'travail', ASP).map(c => c.mot), ['Pause', 'Base']);
  assert.deepEqual(R.commandesRobot('vacuum', 'retour', ASP).map(c => c.mot), ['Reprendre', 'Base']);
  for (const d of ['vacuum', 'lawn_mower']) {
    for (const phase of ['base', 'travail', 'pause', 'retour', 'erreur', 'repos']) {
      assert.ok(R.commandesRobot(d, phase, 0xffff).every(c => c.service !== 'toggle'), d + ' ' + phase + ' : un service explicite');
    }
  }
});

/* TEST AJOUTÉ (passe bis du 18/10, point A) : un passage lancé par un script maison se dit par le NOM du script — « Nettoie ·
 * Nettoyer la buanderie » —, au lieu de « Nettoyage en cours » ; des pièces connues passent devant.
 * ASSERTION MODIFIÉE (passe bis 2 du 18/10, point L) : l'exemple d'avant était le nom d'un script de SON installation ;
 * « Nettoyer la buanderie » n'existe pas chez lui. */
test('point A : le nom d’un script maison dit le passage — au travail, en pause ; les pièces passent devant', () => {
  const ph = (x) => R.phraseRobot({ domaine: 'vacuum', maintenant: MAINTENANT, ...x });
  assert.equal(ph({ phase: 'travail', libelle: 'Nettoyer la buanderie' }).texte, 'Nettoie · Nettoyer la buanderie');
  assert.equal(ph({ phase: 'pause', libelle: 'Nettoyer la buanderie' }).texte, 'En pause · Nettoyer la buanderie');
  assert.equal(ph({ phase: 'travail', pieces: ['Bureau'], libelle: 'Nettoyer les pièces' }).texte, 'Nettoie · Bureau');
  assert.equal(ph({ phase: 'travail' }).texte, 'Nettoyage en cours', 'sans rien : rien d’inventé');
});

/* TEST AJOUTÉ (passe bis du 18/10, point 1) : pendant un geste en vol (robotsetat.js), la puce qui l'a lancé garde sa place et son
 * mot, marquée en cours — elle ne fait plus rien —, et rien n'offre l'inverse sous le doigt : seule « Base » (et « Localiser ») reste
 * permise. Sans geste en vol, la phase seule décide. */
test('point 1 : pendant un geste en vol, la puce qui l’a lancé reste sur lui ; rien n’offre l’inverse', () => {
  const g = (cle, depuis) => ({ cle, depuis });
  const vues = (phase, geste) => R.commandesEnVol('vacuum', phase, ASP, geste).map(c => [c.cle, !!c.enVol, c.choisie]);
  assert.deepEqual(vues('pause', g('pause', 'travail')), [['pause', true, true], ['base', false, false]], '« Pause » reste « Pause » : pas de « Reprendre » sous le doigt');
  assert.deepEqual(vues('travail', g('demarrer', 'base')), [['demarrer', true, true], ['base', false, false]], '« Démarrer » reste « Démarrer » : pas de « Pause » sous le doigt');
  assert.deepEqual(vues('travail', g('reprendre', 'pause')), [['reprendre', true, true], ['base', false, false]]);
  assert.deepEqual(vues('retour', g('base', 'travail')), [['base', true, true]], 'le retour demandé : rien ne repart');
  assert.deepEqual(vues('retour', g('base', 'erreur')), [['base', true, true]]);
  assert.deepEqual(vues('retour', g('base', 'repos')), [['base', true, true]], 'arrêté ailleurs : la base à sa place, rien ne repart');
  assert.deepEqual(vues('pause', null), [['reprendre', false, false], ['base', false, false]], 'sans geste en vol : la phase seule');
  assert.deepEqual(['demarrer', 'reprendre', 'pause', 'base', 'localiser'].map(c => R.gestePermis(c, g('pause', 'travail'))), [false, false, false, true, true]);
  assert.equal(R.gestePermis('base', g('base', 'travail')), false, 'deux appuis sur la base : un seul retour');
  assert.equal(R.gestePermis('reprendre', null), true);
  /* ASSERTION AJOUTÉE (passe bis 2 du 20/10, relecture de contrôle — point 3) : « Localiser » en vol ne retient que lui — le robot bipe,
   * « Démarrer » reste offert (un script gardé le bloquait sept secondes), et un second appui ne rebipe pas. */
  assert.deepEqual(['demarrer', 'reprendre', 'pause', 'base', 'localiser'].map(c => R.gestePermis(c, g('localiser', 'base'))), [true, true, true, true, false]);
  assert.deepEqual(vues('base', g('localiser', 'base')), [['demarrer', false, false], ['localiser', true, true]], 'la puce en vol à sa place ; « Démarrer » libre');
  assert.deepEqual(R.commandesEnVol('lawn_mower', 'pause', 7, g('pause', 'travail')).map(c => [c.cle, c.service, !!c.enVol]), [['pause', 'pause', true], ['base', 'dock', false]], 'une tondeuse aussi');
  assert.deepEqual([R.PHASE_GESTE.demarrer, R.PHASE_GESTE.reprendre, R.PHASE_GESTE.pause, R.PHASE_GESTE.base], ['travail', 'travail', 'pause', 'retour']);
  /* TEST AJOUTÉ (passe bis 2 du 18/10, point H ; la sonde S2) : « Base » pendant le vol d'un départ, le robot encore sur sa base —
   * la puce qui l'a lancé n'est pas une puce de la base : elle se cherche dans la phase qu'il annonce. La carte n'est plus jamais
   * sans puce. */
  assert.deepEqual(vues('retour', g('base', 'base')), [['base', true, true]], 'la base en vol, à sa place : la carte garde une puce');
  assert.deepEqual(R.commandesEnVol('lawn_mower', 'retour', 7, g('base', 'base')).map(c => [c.cle, !!c.enVol]), [['base', true]], 'une tondeuse aussi');
});

/* TEST AJOUTÉ (passe bis 2 du 18/10, point D) : une tondeuse à aires dont aucune n'est allumée ne part pas sans qu'on lui en choisisse
 * une — `start_mowing` ne partirait jamais (le serveur refuse, `aucune_aire`). Sa carte n'offre donc pas « Démarrer » : la ligne garde
 * ce qui reste possible (la base, arrêtée ailleurs), rien d'inerte ; sa phrase le dit, sobrement ; et le prochain passage qu'elle
 * annoncerait est celui qui PARTIRA — un passage sans zone serait retenu. Ses aires : les interrupteurs de SON appareil, ni masqués ni
 * désactivés, la règle du serveur (`aires_de`). */
test('point D : la tondeuse sans aire allumée — ni « Démarrer », la phrase qui le dit, et ses aires lues comme au serveur', () => {
  const vues = (phase, opts) => R.commandesRobot('lawn_mower', phase, 7, opts).map(c => c.cle);
  assert.deepEqual(vues('base', { depart: false }), [], 'sur la base : rien d’autre à offrir');
  assert.deepEqual(vues('repos', { depart: false }), ['base'], 'arrêtée ailleurs : rentrer reste possible');
  assert.deepEqual(vues('pause', { depart: false }), ['reprendre', 'base'], 'reprendre n’est pas un départ');
  assert.deepEqual(vues('base'), ['demarrer'], 'sans l’option, rien ne change');
  assert.deepEqual(R.commandesEnVol('lawn_mower', 'base', 7, null, { depart: false }), []);
  const ph = (x) => R.phraseRobot({ domaine: 'lawn_mower', maintenant: MAINTENANT, ...x });
  assert.deepEqual(ph({ phase: 'base', sansZone: true }), { texte: 'Aucune zone allumée', encre: 'var(--o-text2)', panne: false });
  assert.equal(ph({ phase: 'base', sansZone: true, prochain: { date: new Date(2026, 9, 18, 9, 30) } }).texte, 'Aucune zone allumée', 'ce qui manque d’abord');
  assert.equal(ph({ phase: 'repos', sansZone: true }).texte, 'Aucune zone allumée');
  assert.equal(ph({ phase: 'travail', sansZone: true }).texte, 'Tonte en cours', 'au travail, la phrase du travail');
  // Ses aires, lues comme au serveur : son appareil, la clé `area` ou l'identifiant, ni masquées ni désactivées.
  const meta = new Map([
    ['lawn_mower.t', { deviceId: 'd1' }], ['switch.t_zone_avant', { deviceId: 'd1', translationKey: 'area' }], ['switch.t_pelouse', { deviceId: 'd1', translationKey: 'area' }],
    ['switch.t_area_2', { deviceId: 'd1' }], ['switch.t_pluie', { deviceId: 'd1', translationKey: 'rain_detection' }],
    ['switch.t_zone_cachee', { deviceId: 'd1', translationKey: 'area', hidden: true }], ['switch.t_zone_eteinte', { deviceId: 'd1', translationKey: 'area', disabled: true }],
    ['switch.voisin_zone_1', { deviceId: 'd2', translationKey: 'area' }], ['sensor.t_zone_surface', { deviceId: 'd1', translationKey: 'area' }],
  ]);
  assert.deepEqual(R.airesTondeuse({ entityMeta: meta }, 'lawn_mower.t'), ['switch.t_area_2', 'switch.t_pelouse', 'switch.t_zone_avant']);
  assert.deepEqual([R.airesTondeuse(null, 'lawn_mower.t'), R.airesTondeuse({ entityMeta: meta }, 'lawn_mower.inconnue')], [[], []]);
});

test('I18 : le prochain passage saute ce que « Ne pas déranger » retiendra, minuit franchi compris', () => {
  const nuit = { actif: true, debut: '22:00', fin: '07:00' };
  const de = (plannings, calme) => { const r = R.prochainPassage(plannings, 'vacuum.r', MAINTENANT, calme); return r ? [r.planning.id, r.date.getDate(), r.date.getHours(), r.date.getMinutes()] : null; };
  const plannings = [P({ id: 'nuit', heure: '23:00', jours: [5, 6] }), P({ id: 'aube', heure: '06:45', jours: [6] }), P({ id: 'semaine' })];
  assert.deepEqual(de(plannings), ['nuit', 17, 23, 0], 'sans la plage : ce soir, 23:00');
  assert.deepEqual(de(plannings, nuit), ['semaine', 19, 9, 30], '23:00 et 06:45 tombent dans la plage — ils ne partiront pas — : lundi 09:30');
  assert.deepEqual(de([P({ id: 'pile', heure: '07:00', jours: [6] })], nuit), ['pile', 18, 7, 0], 'la plage finit à 07:00 pile : 07:00 part');
  assert.deepEqual(de(plannings, { ...nuit, actif: false }), ['nuit', 17, 23, 0], 'une plage éteinte ne retient rien');
  assert.equal(de([P({ id: 'seul', heure: '23:00', jours: [6] })], nuit), null, 'le seul passage tombe dans la plage : aucun');
});

test('le passage se dit, les pièces se disent, les bits sont ceux de Home Assistant', () => {
  // « Passage à » aujourd'hui, « demain », puis le nom du jour.
  assert.equal(R.libellePassage(new Date(2026, 9, 17, 23, 0), MAINTENANT), 'Passage à 23:00');
  assert.equal(R.libellePassage(new Date(2026, 9, 18, 9, 30), MAINTENANT), 'Passage demain 09:30');
  assert.equal(R.libellePassage(new Date(2026, 9, 20, 9, 30), MAINTENANT), 'Passage mardi 09:30');
  // Les pièces du carnet ; tout le logement, ou tout le jardin, quand Loggia a tout lancé ; sinon rien d'inventé.
  assert.equal(R.piecesDites('vacuum', ['Salon', 'Cuisine']), 'Salon, Cuisine');
  assert.equal(R.piecesDites('vacuum', [], true), 'tout le logement');
  assert.equal(R.piecesDites('lawn_mower', null, true), 'tout le jardin');
  assert.equal(R.piecesDites('vacuum', []), null);
  // `VacuumEntityFeature` et `LawnMowerEntityFeature`, tels que Home Assistant les numérote.
  assert.deepEqual(R.BITS_ROBOT.vacuum, { pause: 4, base: 16, localiser: 512, demarrer: 8192 });
  assert.deepEqual(R.BITS_ROBOT.lawn_mower, { demarrer: 1, pause: 2, base: 4, localiser: 0 });
});

test('robots.js reste pur : ni React, ni hass, ni identifiant d’entité en dur', () => {
  const src = readFileSync(new URL('../src/robots.js', import.meta.url), 'utf8');
  assert.ok(!/from 'react'|callService|callWS|hass\./.test(src));
  assert.ok(!/['"](vacuum|lawn_mower|sensor|switch|button|binary_sensor)\.[a-z0-9_]+['"]/.test(src), 'un entity_id en dur');
});
