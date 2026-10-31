// ─────────────────────────────────────────────────────────────────────────────
// La démo du planning de chauffe (chantier Chauffage, plan 2, tâche 6).
//
// L'écran du planning s'essaie dans `?demo`, jamais sur une vraie maison. La
// démo imite donc le serveur (`custom_components/loggia/chauffage.py`) jusqu'à
// la forme exacte de ses réponses — `loggia/chauffage/etat`, `/main`,
// `/maison`, `/config` —, en mémoire, avec le calcul de l'écran
// (`src/chauffage.js`, le jumeau de `chauffage_calcul.py`).
//
// Ces tests tiennent ce faux moteur : la forme de l'état ; une reprise en main
// qui se voit puis se lève ; l'Été qui met tout à l'Arrêt ; les refus qu'un
// geste ordinaire peut provoquer, avec le code ET le message du serveur (la
// clé après les deux-points, que l'écran lit) ; ce qu'un compte ordinaire ne
// peut pas faire ; l'ordre décidé qui passe dans l'état de l'appareil, pour
// qu'on voie la carte bouger ; le geste fait ailleurs ; l'observation.
//
// L'heure de la maison est figée : lundi 12 octobre 2026, 10:00, à l'heure du
// navigateur — la maison de la démo n'a pas d'autre fuseau.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const { maisonChauffageDemo, climatApresServiceDemo, historiqueDemo } = await import(new URL('../src/demo.js', import.meta.url));
// Le jumeau de la fiche, pour tenir celui de la démo égal (une semaine dans les modes d'un chauffage).
const { semaineAdaptee } = await import(new URL('../src/chauffageplanning.js', import.meta.url));

const LUNDI_10H = new Date(2026, 9, 12, 10, 0, 0);
const a = (jour, h, mi = 0) => new Date(2026, 9, jour, h, mi, 0);
const CHAMBRE = 'select.radiateur_chambre_fil_pilote';
const BUREAU = 'select.radiateur_bureau_fil_pilote';
// Un radiateur que Home Assistant ne connaît plus : sa configuration reste (relecture des tâches 11 et 12).
const GRENIER = 'select.radiateur_grenier_fil_pilote';
const POELE = 'climate.poele';
const CLIM = 'climate.climatisation';
const MODES = ['confort', 'confort_1', 'confort_2', 'eco', 'hors_gel', 'arret'];
// Un instant du serveur : ISO, AVEC son décalage.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
const mural = (iso) => String(iso).slice(0, 16);

const SEMAINE_TYPE = Object.fromEntries(['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map((j) => [j, j === 'sam' || j === 'dim'
  ? [{ h: '08:00', mode: 'confort' }, { h: '22:30', mode: 'eco' }]
  : [{ h: '06:30', mode: 'confort' }, { h: '08:30', mode: 'eco' }, { h: '18:00', mode: 'confort' }, { h: '22:30', mode: 'eco' }]]));
const JOUR_TYPE_LUNDI = [{ de: 0, a: 390, mode: 'eco' }, { de: 390, a: 510, mode: 'confort' }, { de: 510, a: 1080, mode: 'eco' },
  { de: 1080, a: 1350, mode: 'confort' }, { de: 1350, a: 1440, mode: 'eco' }];
const JOUR_BUREAU_LUNDI = [{ de: 0, a: 450, mode: 'hors_gel' }, { de: 450, a: 810, mode: 'eco' }, { de: 810, a: 1050, mode: 'confort' },
  { de: 1050, a: 1140, mode: 'confort_1' }, { de: 1140, a: 1320, mode: 'eco' }, { de: 1320, a: 1440, mode: 'hors_gel' }];
/* Les clés d'un chauffage dans l'état, celles de `_etat_un` (chauffage.py).
 * ASSERTION MODIFIÉE (relecture de la partie B, point 3) : `applique`, le mode
 * que le moteur envoie, et `fenetre_mode`, celui qu'une ouverture appliquerait.
 * ASSERTION MODIFIÉE (relecture du 12/10, point 4) : `ouvrant_ouvert`, l'ouvrant
 * MAINTENANT là où la règle des fenêtres veille.
 * ASSERTION MODIFIÉE (relecture finale du 12/10, point 5) : plus de `main`, la
 * reprise bornée à aujourd'hui — seule la barre de la carte la lisait, et la
 * carte n'a plus de barre (cartes 1a). Les assertions qui la lisaient plus bas
 * la perdent aussi ; la reprise elle-même se lit toujours (`reprise`, `fin`). */
/* ASSERTION MODIFIÉE (26/10) : `programme` et `concurrents`, le programme de l'appareil allumé et ceux d'ailleurs
 * qui le commandent, comme le serveur (tests/demo_chauffage_concurrents.test.mjs). */
// ASSERTION MODIFIÉE (30/10) : `decalage`, celui du capteur d'un thermostat, comme le serveur.
const CLES_CHAUFFAGE = ['applique', 'avertissements', 'cle', 'concurrents', 'decalage', 'entite', 'famille', 'fenetre', 'fenetre_mode', 'fenetre_ouverte', 'fin',
  'jour', 'mode', 'modes', 'nom', 'options', 'ouvrant_ouvert', 'planning', 'programme', 'puis', 'reprise', 'semaine', 'source', 'temperatures'];

const par = (etat, cle) => etat.chauffages.find((c) => c.cle === cle);
const etat = (m) => m.ws({ type: 'loggia/chauffage/etat' });
const semaineVide = () => ({ lun: [], mar: [], mer: [], jeu: [], ven: [], sam: [], dim: [] });
/* ASSERTION MODIFIÉE (26/10) : la démo a deux chefs — le Timer du poêle, un planning Scheduler sur le radiateur du
 * bureau —, et allumer un planning par-dessus se refuse comme sur le serveur. Les essais qui allument le planning du
 * poêle, ou qui lisent les avertissements du bureau, les coupent d'abord, comme on le ferait chez soi
 * (tests/demo_chauffage_concurrents.test.mjs tient les deux chefs). */
const sansProgrammes = (m) => {
  for (const id of ['switch.poele_timer', 'switch.schedule_radiateur_bureau']) m.states[id] = { ...m.states[id], state: 'off' };
  return m;
};

test('l’état a la forme exacte de loggia/chauffage/etat', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  const e = await etat(m);
  /* ASSERTION MODIFIÉE (relecture du 12/10, point 2) : `fenetres_observe`, la
   * règle des fenêtres en « Observer sans agir », à la racine comme `simulation`. */
  /* ASSERTION MODIFIÉE (30/10, G3-E2) : `eau_chaude`, l'option du mode absence des chauffe-eau pendant les Vacances, que le
   * serveur publie à la racine (chauffage.py, `async_etat`) — décochée au départ. */
  assert.deepEqual(Object.keys(e).sort(), ['chauffages', 'demarrage', 'eau_chaude', 'fenetres_observe', 'journal', 'maintenant', 'maison', 'minute',
    'plannings_allumes', 'simulation']);
  assert.deepEqual(e.eau_chaude, { absence: false });
  assert.deepEqual(e.maison, { mode: 'planning', vacances_fin: null, absence: 'eco', vacances: 'hors_gel' });
  assert.equal(e.simulation, false, 'l’observation est coupée au départ');
  assert.equal(e.fenetres_observe, false, 'celle de la règle des fenêtres aussi');
  assert.equal(e.demarrage, true);
  assert.deepEqual(e.minute, [0, 600], 'lundi (0), 10:00');
  assert.match(e.maintenant, ISO);
  assert.equal(mural(e.maintenant), '2026-10-12T10:00');
  /* Les chauffages configurés d'abord, puis ceux que la maison a : le poêle,
   * la climatisation réversible du bureau, et les deux thermostats de la
   * démo, jamais configurés (un `climate` hors registre qui reçoit une
   * consigne est un chauffage pour le serveur). ASSERTION MODIFIÉE (tâche
   * 10 bis B) : la climatisation entre dans la liste, après le poêle — tous
   * deux au registre de la démo, avant les `climate` qui n'y sont pas. */
  /* ASSERTION MODIFIÉE (relecture des tâches 11 et 12) : la configuration de
   * départ garde un radiateur du grenier que Home Assistant ne connaît plus —
   * renommé ou retiré —, configuré, donc listé avec les configurés. */
  assert.deepEqual(e.chauffages.map((c) => c.cle), [CHAMBRE, BUREAU, GRENIER, POELE, CLIM, 'climate.chambre', 'climate.salon']);
  for (const c of e.chauffages) {
    assert.deepEqual(Object.keys(c).sort(), CLES_CHAUFFAGE, c.cle);
    /* ASSERTION MODIFIÉE (même relecture) : la clé est l'entity_id — pour
     * l'introuvable, sans entité, celui que garde sa configuration, qui le nomme. */
    assert.equal(c.cle, c.entite === null ? c.nom : c.entite, 'la démo n’a pas de registre : la clé est l’entity_id');
    assert.ok(typeof c.nom === 'string' && c.nom, c.cle);
    assert.ok(['fil_pilote', 'thermostat'].includes(c.famille), c.cle);
    assert.equal(typeof c.planning, 'boolean');
    // ASSERTION MODIFIÉE (relecture de la partie B, point 1) : null quand la règle des fenêtres ne le surveille pas.
    assert.ok(c.fenetre_ouverte === null || typeof c.fenetre_ouverte === 'boolean', c.cle);
    assert.ok(c.ouvrant_ouvert === null || typeof c.ouvrant_ouvert === 'boolean', c.cle);
    assert.ok(Array.isArray(c.modes) && Array.isArray(c.avertissements));
    assert.ok(['arret', 'eco', 'rien'].includes(c.fenetre));
  }
  // La Chambre : la semaine type, la fenêtre ouverte (la règle des fenêtres de la démo la coche).
  const ch = par(e, CHAMBRE);
  assert.equal(ch.nom, 'Radiateur chambre');
  assert.equal(ch.famille, 'fil_pilote');
  assert.equal(ch.planning, true);
  assert.deepEqual(ch.modes, MODES);
  assert.deepEqual(ch.options, { confort: 'comfort', confort_1: 'comfort_-1', confort_2: 'comfort_-2', eco: 'eco', hors_gel: 'frost_protection', arret: 'off' });
  assert.deepEqual(ch.semaine, SEMAINE_TYPE);
  assert.deepEqual(ch.temperatures, { confort: 20, eco: 17, hors_gel: 7 });
  assert.equal(ch.fenetre, 'arret');
  assert.equal(ch.fenetre_ouverte, true);
  assert.deepEqual([ch.mode, ch.source, ch.fin, ch.puis, ch.reprise], ['arret', 'fenetre', null, null, null]);
  assert.deepEqual(ch.jour, JOUR_TYPE_LUNDI, 'la journée de la carte, la fenêtre n’y entre pas');
  assert.deepEqual(ch.avertissements, []);
  /* Le Bureau : une semaine à lui. ASSERTION MODIFIÉE (relecture de la partie
   * B, point 1) : aucune pièce de la règle des fenêtres de la démo ne compte
   * son radiateur — `fenetre_ouverte` null, plus « fermée ». */
  const bu = par(e, BUREAU);
  assert.deepEqual([bu.mode, bu.source, bu.puis, bu.fenetre_ouverte], ['eco', 'planning', 'confort', null]);
  assert.match(bu.fin, ISO);
  assert.equal(mural(bu.fin), '2026-10-12T13:30', 'jusqu’à 13:30, puis Confort');
  assert.deepEqual(bu.jour, JOUR_BUREAU_LUNDI);
  assert.deepEqual(bu.semaine.sam, [], 'un jour sans changement continue la veille');
  // Le poêle : un thermostat jamais configuré.
  const po = par(e, POELE);
  assert.equal(po.nom, 'Poêle');
  assert.equal(po.famille, 'thermostat');
  assert.equal(po.planning, false);
  assert.deepEqual(po.modes, MODES, 'il sait s’éteindre : Arrêt en est');
  assert.deepEqual([po.mode, po.source, po.fin, po.puis, po.reprise, po.semaine, po.temperatures, po.options, po.jour],
    [null, null, null, null, null, null, null, null, null]);
  assert.equal(po.fenetre, 'arret');
});

test('un module fil pilote se nomme comme son appareil, un thermostat garde son nom affiché', async () => {
  /* Sous Zigbee2MQTT, le `select` d'un module porte le nom de son appareil suivi
   * de celui de l'exposition. Le serveur nomme le chauffage par son APPAREIL
   * (`_nom_appareil`) ; la démo aussi : le nom du registre, dans sa langue. */
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  const renommer = (id, nom) => { m.states[id] = { ...m.states[id], attributes: { ...m.states[id].attributes, friendly_name: nom } }; };
  renommer(CHAMBRE, 'Radiateur chambre Pilot wire mode');
  renommer(POELE, 'Poêle du séjour');
  const e = await etat(m);
  assert.equal(par(e, CHAMBRE).nom, 'Radiateur chambre', 'le nom de l’appareil, pas celui de son select');
  assert.equal(par(e, CHAMBRE).nom, m.index.devices.find((d) => d.id === 'radiateur_chambre').name);
  assert.equal(par(e, BUREAU).nom, 'Radiateur bureau');
  assert.equal(par(e, POELE).nom, 'Poêle du séjour', 'un thermostat garde son nom affiché');
});

test('le décalage d’un thermostat passe dans ce que reçoit l’appareil, comme sur le serveur (30/10)', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  const SALON = 'climate.salon';
  const r = await m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [SALON]: { planning: true, decalage: -1.5 } } } });
  assert.equal(r.config.chauffages[SALON].decalage, -1.5);
  assert.equal(par(r.etat, SALON).decalage, -1.5);
  assert.equal(m.states[SALON].attributes.temperature, 15.5, 'Éco 17 pour la pièce : 15,5 pour l’appareil');
  await assert.rejects(m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [SALON]: { decalage: 6 } } } }),
    (e) => e.code === 'chauffage_decalage_hors_bornes' && /: decalage$/.test(e.message));
  await assert.rejects(m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [CHAMBRE]: { decalage: 1 } } } }), 'un module n’a pas de consigne');
  const zero = await m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [SALON]: { decalage: 0 } } } });
  assert.ok(!('decalage' in zero.config.chauffages[SALON]), '0 : la configuration n’en garde rien');
  assert.equal(par(zero.etat, SALON).decalage, 0);
  assert.equal(m.states[SALON].attributes.temperature, 17);
});

test('l’état dit si un planning tourne, compté sur toute la configuration', async () => {
  const m = sansProgrammes(maisonChauffageDemo({ quand: LUNDI_10H }));
  assert.equal((await etat(m)).plannings_allumes, true, 'la chambre et le bureau');
  const eteints = await m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [CHAMBRE]: { planning: false }, [BUREAU]: { planning: false } } } });
  assert.equal(eteints.etat.plannings_allumes, false);
  const poele = await m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [POELE]: { planning: true } } } });
  assert.equal(poele.etat.plannings_allumes, true);
});

test('l’ordre décidé est dans l’état des appareils', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  await etat(m);
  assert.equal(m.states[CHAMBRE].state, 'off', 'la fenêtre ouverte coupe la chambre, par l’option Arrêt de son module');
  assert.equal(m.states[BUREAU].state, 'eco');
  assert.equal(m.states['sensor.radiateur_chambre_puissance'].state, '0', 'Arrêt : 0 W');
  // Le poêle n'est pas au planning : la démo n'y touche pas.
  assert.equal(m.states[POELE].state, 'heat');
  assert.equal(m.states[POELE].attributes.temperature, 20);
  // Le radiateur du salon reste sur une simple prise.
  assert.equal(m.states['switch.radiateur_salon'].state, 'on');
});

test('le journal du module dit ce qui s’est passé, dans les mots du serveur', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  const e = await etat(m);
  assert.deepEqual(e.journal.map((l) => [l.regle, l.quoi, l.motif, l.cibles[0]]), [
    ['fenetre', 'Arrêt', 'Chambre', CHAMBRE],
    ['planning', 'Éco', 'planning 08:30', CHAMBRE],
    ['planning', 'Éco', 'planning 07:30', BUREAU],
    ['planning', 'Confort', 'planning 06:30', CHAMBRE],
    ['planning', 'Éco', 'planning 22:30', CHAMBRE],
  ]);
  for (const l of e.journal) {
    assert.deepEqual(Object.keys(l).filter((k) => k !== 'g').sort(), ['cibles', 'detail', 'module', 'motif', 'n', 'quoi', 'regle', 'simule', 'ts']);
    assert.equal(l.module, 'chauffage');
    assert.equal(l.simule, false);
  }
  // Le gabarit garde ses parties (ADR 0070) : c'est ce que l'écran traduit.
  assert.deepEqual(e.journal[1].g, { motif: [['planning {heure}', { heure: '08:30' }]] });
  // Le journal de la maison les mêle aux autres modules.
  assert.ok(m.regles().journal.some((l) => l.module === 'chauffage' && l.quoi === 'Arrêt'));
});

test('une reprise en main se voit, puis « reprendre » la lève', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  const e1 = await m.ws({ type: 'loggia/chauffage/main', chauffage: BUREAU, mode: 'confort' });
  const b1 = par(e1, BUREAU);
  assert.deepEqual([b1.source, b1.mode, b1.puis], ['main', 'confort', 'confort']);
  assert.deepEqual(Object.keys(b1.reprise).sort(), ['depuis', 'fin', 'mode', 'par', 'temperature']);
  assert.deepEqual([b1.reprise.mode, b1.reprise.temperature, b1.reprise.par], ['confort', null, 'demo']);
  assert.match(b1.reprise.fin, ISO);
  assert.equal(mural(b1.reprise.fin), '2026-10-12T13:30', 'par défaut, jusqu’au prochain changement');
  assert.equal(mural(b1.reprise.depuis), '2026-10-12T10:00');
  assert.equal(b1.fin, b1.reprise.fin);
  assert.equal(m.states[BUREAU].state, 'comfort', 'la carte bouge : l’option du module');
  assert.deepEqual(e1.journal.slice(0, 2).map((l) => [l.regle, l.quoi, l.motif, l.n, l.detail]), [
    ['main', 'Confort', 'jusqu’à 13:30', 1, ''],
    ['main', 'reprise en main', 'jusqu’à 13:30', 0, 'Démo'],
  ]);
  // Jusqu'à relance : sans fin.
  const e2 = await m.ws({ type: 'loggia/chauffage/main', chauffage: BUREAU, mode: 'hors_gel', fin: 'relance' });
  const b2 = par(e2, BUREAU);
  assert.deepEqual([b2.reprise.fin, b2.fin, b2.puis], [null, null, null]);
  assert.equal(e2.journal[1].motif, 'jusqu’à relance');
  // Une heure.
  const b3 = par(await m.ws({ type: 'loggia/chauffage/main', chauffage: BUREAU, mode: 'confort_2', fin: 60 }), BUREAU);
  assert.equal(mural(b3.reprise.fin), '2026-10-12T11:00');
  // Reprendre le planning.
  const e4 = await m.ws({ type: 'loggia/chauffage/main', chauffage: BUREAU, reprendre: true });
  const b4 = par(e4, BUREAU);
  assert.deepEqual([b4.source, b4.mode, b4.reprise], ['planning', 'eco', null]);
  assert.equal(m.states[BUREAU].state, 'eco');
  assert.deepEqual(e4.journal.slice(0, 2).map((l) => [l.regle, l.quoi, l.motif]), [
    ['planning', 'Éco', 'planning 07:30'],
    ['main', 'reprendre le planning', ''],
  ]);
});

test('la fenêtre ne fait que baisser : une reprise en Confort dans la chambre reste coupée', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  const ch = par(await m.ws({ type: 'loggia/chauffage/main', chauffage: CHAMBRE, mode: 'confort' }), CHAMBRE);
  assert.deepEqual([ch.source, ch.mode], ['fenetre', 'arret']);
  assert.equal(ch.reprise.mode, 'confort', 'la reprise est notée, la fenêtre passe devant');
  assert.equal(m.states[CHAMBRE].state, 'off');
  // « Fenêtre ouverte : Rien » : la chambre suit de nouveau ce qu'on lui demande.
  const e = await m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [CHAMBRE]: { fenetre: 'rien' } } } });
  const ch2 = par(e.etat, CHAMBRE);
  assert.deepEqual([ch2.source, ch2.mode, ch2.fenetre, ch2.fenetre_ouverte], ['main', 'confort', 'rien', true]);
  assert.equal(m.states[CHAMBRE].state, 'comfort');
});

test('l’Été met tout à l’Arrêt', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  const e = await m.ws({ type: 'loggia/chauffage/maison', mode: 'ete' });
  assert.equal(e.maison.mode, 'ete');
  const au = e.chauffages.filter((c) => c.planning);
  assert.deepEqual(au.map((c) => c.cle), [CHAMBRE, BUREAU]);
  for (const c of au) {
    assert.equal(c.mode, 'arret', c.cle);
    assert.deepEqual(c.jour, [{ de: 0, a: 1440, mode: 'arret' }], c.cle);
  }
  assert.equal(par(e, BUREAU).source, 'maison');
  assert.deepEqual([par(e, CHAMBRE).source, par(e, CHAMBRE).fenetre_ouverte], ['maison', true],
    'la fenêtre ouverte de la chambre ne coupe rien de plus : ce n’est pas elle qui parle');
  assert.equal(m.states[BUREAU].state, 'off');
  assert.equal(m.states[CHAMBRE].state, 'off');
  assert.deepEqual([e.journal[0].quoi, e.journal[0].motif], ['Arrêt', 'Été'], 'l’ordre, et pourquoi');
  assert.deepEqual([e.journal[1].regle, e.journal[1].quoi, e.journal[1].detail], ['maison', 'Été', 'Démo']);
  // Absence : pour baisser seulement — les bandes Éco se fondent.
  const e2 = await m.ws({ type: 'loggia/chauffage/maison', mode: 'absence' });
  assert.deepEqual(par(e2, CHAMBRE).jour, [{ de: 0, a: 1440, mode: 'eco' }]);
});

test('Vacances : une date de retour à venir, sinon le refus du serveur ; la date passée, la maison revient au Planning', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  const ILLISIBLE = { code: 'chauffage_date_illisible', message: 'date illisible ou passee : maison.vacances_fin' };
  await assert.rejects(m.ws({ type: 'loggia/chauffage/maison', mode: 'vacances', fin: a(11, 18).toISOString() }), ILLISIBLE);
  await assert.rejects(m.ws({ type: 'loggia/chauffage/maison', mode: 'vacances', fin: 'demain' }), ILLISIBLE);
  await assert.rejects(m.ws({ type: 'loggia/chauffage/maison', mode: 'planning', fin: a(20, 0).toISOString() }), ILLISIBLE,
    'seules les Vacances ont une fin');
  const e = await m.ws({ type: 'loggia/chauffage/maison', mode: 'vacances', fin: a(20, 0).toISOString() });
  assert.equal(e.maison.mode, 'vacances');
  assert.match(e.maison.vacances_fin, ISO);
  assert.equal(mural(e.maison.vacances_fin), '2026-10-20T00:00');
  assert.deepEqual([par(e, BUREAU).mode, par(e, BUREAU).source], ['hors_gel', 'maison']);
  assert.equal(m.states[BUREAU].state, 'frost_protection');
  // Sans date : jusqu'à ce qu'on revienne.
  assert.equal((await m.ws({ type: 'loggia/chauffage/maison', mode: 'vacances' })).maison.vacances_fin, null);
  await m.ws({ type: 'loggia/chauffage/maison', mode: 'vacances', fin: a(20, 0).toISOString() });
  m.regler(a(20, 0, 1));
  const e2 = await etat(m);
  assert.deepEqual(e2.maison, { mode: 'planning', vacances_fin: null, absence: 'eco', vacances: 'hors_gel' });
  assert.ok(e2.journal.some((l) => l.regle === 'maison' && l.quoi === 'Planning' && l.motif === 'fin des vacances'));
});

test('une semaine vide et les autres refus d’un geste ordinaire, avec le code et le message du serveur', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  const config = (chauffage) => m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [BUREAU]: chauffage } } });
  await assert.rejects(config({ semaine: semaineVide() }),
    { code: 'chauffage_semaine_vide', message: 'planning sans aucun changement : semaine' });
  await assert.rejects(config({ semaine: { ...semaineVide(), jeu: [{ h: '07:00', mode: 'eco' }, { h: '07:00', mode: 'confort' }] } }),
    { code: 'chauffage_heure_en_double', message: 'deux changements a la meme heure : jeu[1].h' });
  const treize = Array.from({ length: 13 }, (_, i) => ({ h: String(i + 6).padStart(2, '0') + ':00', mode: i % 2 ? 'eco' : 'confort' }));
  await assert.rejects(config({ semaine: { ...semaineVide(), jeu: treize } }),
    { code: 'chauffage_trop_de_changements', message: 'plus de 12 changements ce jour : jeu' });
  await assert.rejects(config({ temperatures: { eco: 21 } }),
    { code: 'chauffage_temperatures_desordre', message: 'temperatures en desordre (hors_gel < eco <= confort) : temperatures.eco' });
  await assert.rejects(config({ temperatures: { confort: 31 } }),
    { code: 'chauffage_temperature_hors_bornes', message: 'temperature hors bornes (5 a 30 °C) : temperatures.confort' });
  await assert.rejects(config({ semaine: { ...semaineVide(), lun: [{ h: '25:00', mode: 'eco' }] } }),
    { code: 'chauffage_heure_illisible', message: 'heure illisible : lun[0].h' });
  await assert.rejects(m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { 'climate.inconnu': { planning: true } } } }),
    { code: 'chauffage_inconnu', message: 'chauffage inconnu : climate.inconnu' });
  // Un refus n'écrit rien.
  const e = await etat(m);
  assert.deepEqual(par(e, BUREAU).jour, JOUR_BUREAU_LUNDI);
  assert.deepEqual(par(e, BUREAU).temperatures, { confort: 20, eco: 17, hors_gel: 7 });
  // Ce qui est valide passe, trié.
  const r = await config({ semaine: { ...semaineVide(), lun: [{ h: '21:00', mode: 'eco' }, { h: '9:15', mode: 'confort' }] }, temperatures: { eco: 18.3 } });
  assert.deepEqual(r.config.chauffages[BUREAU].semaine.lun, [{ h: '09:15', mode: 'confort' }, { h: '21:00', mode: 'eco' }]);
  assert.equal(r.config.chauffages[BUREAU].temperatures.eco, 18.5, 'au demi-degré');
  assert.deepEqual(par(r.etat, BUREAU).jour, [{ de: 0, a: 555, mode: 'eco' }, { de: 555, a: 1260, mode: 'confort' }, { de: 1260, a: 1440, mode: 'eco' }]);
  assert.equal(m.states[BUREAU].state, 'comfort');
});

test('un compte ordinaire ne peut ni écrire la configuration ni toucher à l’Été', async () => {
  const m = maisonChauffageDemo({ admin: false, quand: LUNDI_10H });
  await assert.rejects(m.ws({ type: 'loggia/chauffage/config', patch: { simulation: { actif: true } } }), { code: 'unauthorized' });
  await assert.rejects(m.ws({ type: 'loggia/chauffage/maison', mode: 'ete' }),
    { code: 'not_admin', message: 'reglages reserves aux administrateurs Home Assistant : maison.ete' });
  // Absence et la reprise en main sont des gestes de tous les jours.
  assert.equal((await m.ws({ type: 'loggia/chauffage/maison', mode: 'absence' })).maison.mode, 'absence');
  assert.equal(par(await m.ws({ type: 'loggia/chauffage/main', chauffage: BUREAU, mode: 'confort' }), BUREAU).source, 'main');
  // L'Été posé par un administrateur : un compte ordinaire n'en sort pas.
  await m.ws({ type: 'loggia/chauffage/maison', mode: 'ete' }, { admin: true });
  await assert.rejects(m.ws({ type: 'loggia/chauffage/maison', mode: 'planning' }), { code: 'not_admin' });
});

test('le poêle s’allume avec la semaine type, et l’ordre passe dans sa consigne', async () => {
  const m = sansProgrammes(maisonChauffageDemo({ quand: LUNDI_10H }));
  const r = await m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [POELE]: { planning: true } } } });
  assert.deepEqual(Object.keys(r).sort(), ['config', 'etat']);
  assert.deepEqual(r.config.chauffages[POELE], { entite: POELE, famille: 'thermostat', planning: true, semaine: SEMAINE_TYPE,
    temperatures: { confort: 20, eco: 17, hors_gel: 7 }, fenetre: 'arret' });
  const po = par(r.etat, POELE);
  assert.deepEqual([po.planning, po.mode, po.source, po.puis, po.options], [true, 'eco', 'planning', 'confort', null]);
  assert.equal(mural(po.fin), '2026-10-12T18:00');
  assert.deepEqual(po.jour, JOUR_TYPE_LUNDI);
  assert.equal(m.states[POELE].state, 'heat');
  assert.equal(m.states[POELE].attributes.temperature, 17, 'la température de l’Éco');
  // Une consigne à la main : en °C, pour un thermostat seulement.
  const p2 = par(await m.ws({ type: 'loggia/chauffage/main', chauffage: POELE, temperature: 21.5 }), POELE);
  assert.deepEqual([p2.source, p2.mode, p2.reprise.temperature], ['main', null, 21.5]);
  assert.equal(m.states[POELE].attributes.temperature, 21.5);
  await assert.rejects(m.ws({ type: 'loggia/chauffage/main', chauffage: BUREAU, temperature: 21 }), { code: 'invalid_format' });
  await assert.rejects(m.ws({ type: 'loggia/chauffage/main', chauffage: POELE, temperature: 35 }),
    { code: 'chauffage_temperature_hors_bornes', message: 'temperature hors bornes (5 a 30 °C) : temperature' });
  // Un planning éteint n'a pas de reprise en main ; un chauffage jamais configuré non plus.
  await m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [POELE]: { planning: false } } } });
  await assert.rejects(m.ws({ type: 'loggia/chauffage/main', chauffage: POELE, mode: 'eco' }),
    { code: 'chauffage_sans_planning', message: 'planning eteint pour ce chauffage : climate.poele' });
  await assert.rejects(m.ws({ type: 'loggia/chauffage/main', chauffage: 'climate.salon', mode: 'eco' }),
    { code: 'chauffage_inconnu', message: 'chauffage inconnu : climate.salon' });
});

test('le temps passe : le changement du planning part à la lecture suivante', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  await etat(m);
  m.regler(a(12, 13, 31));
  const e = await etat(m);
  assert.equal(par(e, BUREAU).mode, 'confort');
  assert.equal(m.states[BUREAU].state, 'comfort');
  assert.equal(m.states['sensor.radiateur_bureau_puissance'].state, '1000', 'il chauffe une partie du temps');
  const l = e.journal[0];
  assert.deepEqual([l.regle, l.quoi, l.motif, l.n, l.cibles, l.simule], ['planning', 'Confort', 'planning 13:30', 1, [BUREAU], false]);
  assert.deepEqual(l.g, { motif: [['planning {heure}', { heure: '13:30' }]] });
  // Une reprise d'une heure finit toute seule.
  await m.ws({ type: 'loggia/chauffage/main', chauffage: BUREAU, mode: 'eco', fin: 60 });
  m.regler(a(12, 14, 32));
  const e2 = await etat(m);
  assert.deepEqual([par(e2, BUREAU).source, par(e2, BUREAU).reprise], ['planning', null]);
  assert.ok(e2.journal.some((x) => x.quoi === 'reprendre le planning' && x.motif === 'fin de la reprise en main'));
});

test('un geste fait ailleurs devient une reprise en main ; une option inconnue est refusée', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  await etat(m);
  await assert.rejects(m.option(BUREAU, 'confort'), { code: 'service_validation_error' });
  assert.equal(m.states[BUREAU].state, 'eco', 'une option que le module ne propose pas ne passe pas');
  await m.option(BUREAU, 'comfort_-2');
  assert.equal(m.states[BUREAU].state, 'comfort_-2', 'l’état prend l’option');
  const b = par(await etat(m), BUREAU);
  assert.deepEqual([b.source, b.mode, b.reprise.mode], ['main', 'confort_2', 'confort_2']);
  assert.equal(mural(b.reprise.fin), '2026-10-12T13:30');
  const e = await etat(m);
  assert.ok(e.journal.some((l) => l.quoi === 'reprise en main' && l.detail === 'geste fait ailleurs'));
  assert.equal(m.states[BUREAU].state, 'comfort_-2', 'le moteur ne défait pas le geste');
});

test('Observer sans agir : le calcul et le journal, aucun ordre', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  await m.ws({ type: 'loggia/chauffage/main', chauffage: BUREAU, mode: 'confort' });
  const r = await m.ws({ type: 'loggia/chauffage/config', patch: { simulation: { actif: true } } });
  assert.equal(r.etat.simulation, true);
  assert.equal(r.config.simulation.actif, true);
  assert.equal(par(r.etat, BUREAU).reprise, null, 'du réel au simulé, les reprises tombent');
  m.regler(a(12, 18, 1));
  const e = await etat(m);
  assert.equal(par(e, BUREAU).mode, 'confort_1', 'le moteur calcule…');
  assert.equal(m.states[BUREAU].state, 'comfort', '… mais ne commande rien');
  const l = e.journal[0];
  assert.deepEqual([l.quoi, l.motif, l.simule], ['Confort −1', 'planning 17:30', true]);
  // Une ligne par décision, pas une par lecture.
  const n = (await etat(m)).journal.filter((x) => x.simule).length;
  assert.equal((await etat(m)).journal.filter((x) => x.simule).length, n);
});

test('un module coupé se dit, et ne consomme plus', async () => {
  const m = sansProgrammes(maisonChauffageDemo({ quand: a(12, 13, 31) }));
  await etat(m);
  assert.equal(m.states['sensor.radiateur_bureau_puissance'].state, '1000');
  m.states['switch.radiateur_bureau'] = { ...m.states['switch.radiateur_bureau'], state: 'off' };
  const e = await etat(m);
  assert.deepEqual(par(e, BUREAU).avertissements, ['module_coupe']);
  assert.equal(m.states['sensor.radiateur_bureau_puissance'].state, '0');
});

test('la commande se refuse comme le schéma de Home Assistant', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  for (const msg of [
    { type: 'loggia/chauffage/main', chauffage: BUREAU, mode: 'chaud' },
    { type: 'loggia/chauffage/main', chauffage: BUREAU, mode: 'eco', fin: 30 },
    { type: 'loggia/chauffage/main', chauffage: BUREAU, mode: 'eco', id_chauffage: BUREAU },
    { type: 'loggia/chauffage/main', chauffage: BUREAU },
    { type: 'loggia/chauffage/maison', mode: 'hiver' },
    { type: 'loggia/chauffage/config', patch: [] },
    { type: 'loggia/chauffage/config', patch: { inconnu: 1 } },
  ]) await assert.rejects(m.ws(msg), { code: 'invalid_format' }, JSON.stringify(msg));
  await assert.rejects(m.ws({ type: 'loggia/chauffage/main', chauffage: BUREAU, mode: 'confort' }).then(() => m.ws({ type: 'loggia/chauffage/inconnue' })),
    (e) => !e.code, 'une commande que le composant n’a pas : rien ne répond');
});

test('l’index de la démo : chaque module est un appareil, sa famille posée par le composant', () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  const ent = (id) => m.index.entities.find((e) => e.id === id);
  for (const [piece, appareil] of [['chambre', 'radiateur_chambre'], ['bureau', 'radiateur_bureau']]) {
    const select = ent('select.radiateur_' + piece + '_fil_pilote');
    assert.equal(select.famille, 'fil_pilote');
    assert.equal(select.device, appareil);
    assert.equal(select.area, piece);
    assert.equal(ent('switch.radiateur_' + piece).device, appareil, 'l’interrupteur du module');
    const puissance = ent('sensor.radiateur_' + piece + '_puissance');
    assert.equal(puissance.device, appareil);
    assert.equal(puissance.device_class, 'power');
    assert.equal(puissance.unit, 'W');
    assert.ok(!('famille' in ent('switch.radiateur_' + piece)), 'pas de champ vide en plus');
    assert.ok(m.index.devices.some((d) => d.id === appareil && d.area === piece));
  }
  assert.deepEqual([ent(POELE).famille, ent(POELE).device, ent(POELE).area], ['thermostat', 'poele', 'salon']);
  const poele = m.states[POELE].attributes;
  assert.deepEqual([poele.hvac_modes, poele.min_temp, poele.max_temp, poele.supported_features & 1],
    [['off', 'heat'], 5, 35, 1]);
  assert.deepEqual(poele.preset_modes, ['turbo', 'manual', 'comfort', 'auto', 'overnight']);
  // Le radiateur du salon : une simple prise, sans module ni famille.
  assert.equal(ent('switch.radiateur_salon').device, null);
  assert.ok(!m.index.entities.some((e) => e.famille === 'fil_pilote' && e.area === 'salon'));
});

test('chaque mot du journal de la démo est un mot que le serveur écrit', async () => {
  /* La démo ne traduit rien : ses lignes passent par le catalogue comme
   * celles du serveur. Un mot qu'il n'écrit pas n'aurait pas de clé. */
  const serveur = readFileSync(join(RACINE, 'custom_components', 'loggia', 'chauffage.py'), 'utf8');
  const ecrit = (mot) => serveur.includes('"' + mot + '"');
  const m = sansProgrammes(maisonChauffageDemo({ quand: LUNDI_10H }));
  await m.ws({ type: 'loggia/chauffage/main', chauffage: BUREAU, mode: 'confort_1' });
  await m.ws({ type: 'loggia/chauffage/main', chauffage: BUREAU, mode: 'hors_gel', fin: 'relance' });
  await m.ws({ type: 'loggia/chauffage/main', chauffage: BUREAU, reprendre: true });
  await m.option(BUREAU, 'comfort');
  await m.ws({ type: 'loggia/chauffage/maison', mode: 'vacances', fin: a(13, 9).toISOString() });
  m.regler(a(13, 9, 1));
  await etat(m);
  await m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [POELE]: { planning: true } } } });
  await m.ws({ type: 'loggia/chauffage/main', chauffage: POELE, temperature: 21 });
  await m.ws({ type: 'loggia/chauffage/maison', mode: 'ete' });
  const lignes = (await etat(m)).journal;
  assert.ok(lignes.length >= 12, 'le scénario a laissé ses lignes');
  const fautes = [];
  for (const l of lignes) {
    if (!['planning', 'main', 'maison', 'fenetre'].includes(l.regle)) fautes.push('regle · ' + l.regle);
    for (const champ of ['quoi', 'motif', 'detail']) {
      // La pièce d'une fenêtre est un nom de la maison, celui de l'utilisateur aussi.
      if ((champ === 'motif' && l.regle === 'fenetre') || (champ === 'detail' && l[champ] === 'Démo')) continue;
      const parties = l.g && l.g[champ];
      if (parties) for (const [gabarit] of parties) { if (!ecrit(gabarit)) fautes.push(champ + ' · ' + gabarit); }
      else if (l[champ] && !ecrit(l[champ])) fautes.push(champ + ' · ' + l[champ]);
    }
  }
  assert.deepEqual(fautes, []);
});

/* Relecture de la tâche 10, prise à la tâche 10 bis B : la démo n'avait aucun
 * appareil qui refroidit — l'Accueil d'une climatisation (ses modes, ses
 * préréglages, « Refroidit », sa plage) ne s'y voyait pas. */
test('une climatisation réversible dans le bureau : un thermostat pour le serveur, jamais configuré, qui refroidit', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  const cl = par(await etat(m), CLIM);
  assert.ok(cl, 'la climatisation n’est pas un chauffage de la démo');
  // ASSERTION MODIFIÉE (relecture de la partie B, point 1) : aucune pièce de la règle ne la compte — null, plus « fermée ».
  assert.deepEqual([cl.famille, cl.planning, cl.semaine, cl.fenetre, cl.fenetre_ouverte], ['thermostat', false, null, 'arret', null]);
  assert.deepEqual(cl.modes, MODES, 'elle sait s’éteindre : Arrêt en est');
  const a = m.states[CLIM].attributes;
  assert.equal(m.states[CLIM].state, 'cool');
  assert.deepEqual([a.hvac_action, a.hvac_modes], ['cooling', ['off', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only']]);
  assert.ok(typeof a.temperature === 'number' && typeof a.current_temperature === 'number' && a.current_temperature > a.temperature, 'elle refroidit vers sa consigne');
  assert.deepEqual(a.preset_modes, ['eco', 'comfort', 'boost']);
  assert.equal(a.supported_features & 1, 1, 'elle reçoit une consigne');
  // Rangée dans le bureau, au registre : la fiche dit « Bureau · thermostat ».
  const ent = m.index.entities.find((e) => e.id === CLIM);
  assert.deepEqual([ent.area, ent.famille], ['bureau', 'thermostat']);
  // Un nom neutre, traduit comme les autres appareils de la démo (tests/demo_noms.test.mjs).
  const demo = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');
  assert.ok(/'Climatisation': \{ en: '[^']+', de: '[^']+', nl: '[^']+', it: '[^']+', es: '[^']+', pl: '[^']+' \}/.test(demo), 'ses six langues');
  /* Ses gestes passent. ASSERTIONS MODIFIÉES (relecture de la partie B, point
   * 9) : le service `climate` de la démo passe par `climatApresServiceDemo`,
   * tenu plus bas — sa plage, et ce qu'elle fait lu sur la pièce. */
  assert.ok(demo.includes('const apres = climatApresServiceDemo(x, states[x], service, data, consignesAvantPlage);')
    && demo.includes('if (apres) toucher(x, apres.etat, apres.attributs);'), 'le service climate de la démo');
});

test('le service climate de la démo : la plage en heat_cool, la consigne rendue à la sortie, ce qu’elle fait lu sur la pièce', () => {
  /* Relecture de la partie B, point 9 : en `heat_cool`, plus de consigne
   * unique (`temperature` à null) mais une plage, 20 / 24 ; la consigne d'avant
   * revient à la sortie. `hvac_action` se lit sur la pièce : `heating` sous la
   * consigne (ou la borne basse) de plus de 0,3°, `cooling` au-dessus de la
   * consigne (ou de la borne haute) de plus de 0,3° en cool, auto ou
   * heat_cool, `idle` sinon ; `drying`, `fan`, `off` pour leurs modes. */
  const gardees = new Map();
  const clim = { state: 'cool', attributes: { current_temperature: 23.5, temperature: 22, hvac_action: 'cooling' } };
  let r = climatApresServiceDemo(CLIM, clim, 'set_hvac_mode', { hvac_mode: 'heat_cool' }, gardees);
  assert.deepEqual(r, { etat: 'heat_cool', attributs: { temperature: null, target_temp_low: 20, target_temp_high: 24, hvac_action: 'idle' } }, '23,5° dans la plage');
  const plage = { state: 'heat_cool', attributes: { ...clim.attributes, ...r.attributs } };
  r = climatApresServiceDemo(CLIM, plage, 'set_temperature', { target_temp_low: 20, target_temp_high: 23 }, gardees);
  assert.deepEqual(r, { etat: null, attributs: { target_temp_low: 20, target_temp_high: 23, hvac_action: 'cooling' } }, 'une borne bouge, l’action se relit');
  r = climatApresServiceDemo(CLIM, plage, 'set_hvac_mode', { hvac_mode: 'cool' }, gardees);
  assert.deepEqual(r, { etat: 'cool', attributs: { temperature: 22, target_temp_low: null, target_temp_high: null, hvac_action: 'cooling' } }, 'la consigne d’avant revient');
  assert.equal(gardees.size, 0, 'rendue, elle n’est plus gardée');
  // Sans consigne gardée (une plage d'origine), le milieu de la plage, au demi-degré.
  assert.equal(climatApresServiceDemo(CLIM, { state: 'heat_cool', attributes: { current_temperature: 21, temperature: null, target_temp_low: 20, target_temp_high: 23 } },
    'set_hvac_mode', { hvac_mode: 'heat' }, new Map()).attributs.temperature, 21.5);
  // Auto à 23,5° pour 22° : elle refroidit — jamais l'orange « Chauffe ».
  const action = (mode, attrs) => climatApresServiceDemo(CLIM, { state: 'cool', attributes: { ...clim.attributes, ...attrs } }, 'set_hvac_mode', { hvac_mode: mode }, new Map()).attributs.hvac_action;
  assert.equal(action('auto'), 'cooling');
  assert.equal(action('heat'), 'idle', 'en chauffe seule, une pièce trop chaude ne se refroidit pas');
  assert.equal(action('heat', { current_temperature: 21.4 }), 'heating');
  assert.equal(action('heat', { current_temperature: 21.8 }), 'idle', 'à 0,3° près, elle se repose');
  assert.equal(action('auto', { current_temperature: 21.4 }), 'heating');
  assert.equal(action('cool', { current_temperature: 22.2 }), 'idle');
  assert.equal(action('cool', { current_temperature: 20 }), 'idle', 'en froid seul, une pièce fraîche ne se chauffe pas');
  assert.deepEqual(['dry', 'fan_only', 'off'].map(m => action(m)), ['drying', 'fan', 'off']);
  assert.equal(action('heat', { current_temperature: null }), 'idle', 'sans mesure, rien d’inventé');
  // Une consigne, un préréglage : l'action se relit ; un service inconnu, rien.
  assert.deepEqual(climatApresServiceDemo(CLIM, clim, 'set_temperature', { temperature: 24 }, gardees), { etat: null, attributs: { temperature: 24, hvac_action: 'idle' } });
  assert.deepEqual(climatApresServiceDemo(CLIM, clim, 'set_preset_mode', { preset_mode: 'eco' }, gardees), { etat: null, attributs: { preset_mode: 'eco', hvac_action: 'cooling' } });
  assert.equal(climatApresServiceDemo(CLIM, clim, 'turn_on', {}, gardees), null);
  assert.equal(climatApresServiceDemo(CLIM, null, 'set_hvac_mode', { hvac_mode: 'heat' }, gardees), null, 'une entité absente');
});

test('la fenêtre ne se dit que là où la règle des fenêtres de la démo veille ; le mode appliqué, et celui d’une ouverture', async () => {
  /* Relecture de la partie B, points 1 et 3 — comme `_etat_un` : la règle de
   * la démo suit la chambre (son interrupteur ramené au select du module) ;
   * ailleurs, `fenetre_ouverte` vaut null. `applique` : le mode que le moteur
   * envoie (`mode_applicable`) ; `fenetre_mode` : celui qu'une ouverture
   * appliquerait, null pour « ne rien faire ». */
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  let e = await etat(m);
  assert.equal(par(e, CHAMBRE).fenetre_ouverte, true);
  for (const cle of [BUREAU, POELE, CLIM, 'climate.chambre', 'climate.salon']) assert.equal(par(e, cle).fenetre_ouverte, null, cle);
  assert.deepEqual([par(e, CHAMBRE).mode, par(e, CHAMBRE).applique, par(e, CHAMBRE).fenetre_mode], ['arret', 'arret', 'arret']);
  // Refermée : surveillée, fermée — le planning reprend.
  m.states['binary_sensor.fenetre_chambre'] = { ...m.states['binary_sensor.fenetre_chambre'], state: 'off' };
  e = await etat(m);
  assert.deepEqual([par(e, CHAMBRE).fenetre_ouverte, par(e, CHAMBRE).mode, par(e, CHAMBRE).applique], [false, 'eco', 'eco']);
  // Jamais configuré : aucun mode en cours ; une ouverture l'arrêterait.
  assert.deepEqual([par(e, POELE).mode, par(e, POELE).applique, par(e, POELE).fenetre_mode], [null, null, 'arret']);
  // Un module qui a perdu son Éco reçoit son Hors-gel : `mode` reste l'Éco voulu.
  m.states[BUREAU] = { ...m.states[BUREAU], attributes: { ...m.states[BUREAU].attributes, options: ['comfort', 'frost_protection', 'off'] } };
  e = await etat(m);
  assert.deepEqual([par(e, BUREAU).mode, par(e, BUREAU).applique], ['eco', 'hors_gel']);
  assert.equal(m.states[BUREAU].state, 'frost_protection', 'et le faux moteur le lui envoie');
  // « Ne rien faire » : pas de mode à l'ouverture.
  const r = await m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [CHAMBRE]: { fenetre: 'rien' } } } });
  assert.equal(par(r.etat, CHAMBRE).fenetre_mode, null);
});

test('l’ouvrant se dit MAINTENANT là où la règle des fenêtres de la démo veille : la chambre a sa fenêtre ouverte', async () => {
  /* Relecture du 12/10, point 4 — comme `_etat_un` : `ouvrant_ouvert` dit
   * l'ouvrant de la pièce suivie tel qu'il est, `fenetre_ouverte` le fait qui
   * coupe. Sur le serveur, le fait attend le délai de la règle et se perd au
   * redémarrage ; la démo n'a pas de délai, les deux disent la même chose. */
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  let e = await etat(m);
  assert.deepEqual([par(e, CHAMBRE).ouvrant_ouvert, par(e, CHAMBRE).fenetre_ouverte], [true, true], 'la fenêtre de la chambre est ouverte');
  for (const cle of [BUREAU, POELE, CLIM, 'climate.chambre', 'climate.salon']) assert.equal(par(e, cle).ouvrant_ouvert, null, cle + ' : la règle ne le surveille pas');
  m.states['binary_sensor.fenetre_chambre'] = { ...m.states['binary_sensor.fenetre_chambre'], state: 'off' };
  e = await etat(m);
  assert.deepEqual([par(e, CHAMBRE).ouvrant_ouvert, par(e, CHAMBRE).fenetre_ouverte], [false, false], 'refermée');
  // Un capteur muet n'est pas « ouvert », comme pour couper.
  m.states['binary_sensor.fenetre_chambre'] = { ...m.states['binary_sensor.fenetre_chambre'], state: 'unavailable' };
  assert.equal(par(await etat(m), CHAMBRE).ouvrant_ouvert, false);
});

test('la règle des fenêtres de la démo en « Observer sans agir » : fenetres_observe, le moteur garde son drapeau', async () => {
  /* Relecture du 12/10, point 2 : hors planning, c'est la règle des fenêtres
   * qui coupe ; en observation, elle ne coupe rien. L'interrupteur des Règles
   * lui pose `simulation` par `loggia/fenetres/config` (parametres.jsx) ; le
   * moteur le publie à la racine de son état. */
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  assert.equal((await etat(m)).fenetres_observe, false);
  try {
    m.fenetres({ simulation: true });
    const e = await etat(m);
    assert.equal(e.fenetres_observe, true, 'la règle observe');
    assert.equal(e.simulation, false, 'le moteur, lui, n’observe pas : deux drapeaux');
    assert.equal(par(e, CHAMBRE).fenetre_ouverte, true, 'elle surveille encore : l’écran le dit, et nuance ce qu’elle promet');
  } finally {
    m.fenetres({ simulation: false });            // une seule règle par onglet : on la rend comme on l'a trouvée
  }
  assert.equal((await etat(m)).fenetres_observe, false);
});

test('un chauffage introuvable : ni mode appliqué ni mode d’ouverture, ce ne serait qu’une supposition', async () => {
  /* Relecture du 12/10, point 3 — comme `_etat_un` : sans état, les modes
   * d'un thermostat se devinaient de sa famille, et un poêle disparu en Été
   * disait recevoir le Hors-gel — le moteur ne lui envoie rien. */
  const m = sansProgrammes(maisonChauffageDemo({ quand: LUNDI_10H }));
  await m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [POELE]: { planning: true } } } });
  await m.ws({ type: 'loggia/chauffage/maison', mode: 'ete' });
  delete m.states[POELE];
  const po = par(await etat(m), POELE);
  assert.deepEqual(po.avertissements, ['introuvable']);
  assert.deepEqual([po.mode, po.applique, po.fenetre_mode], ['arret', null, null], 'le mode voulu reste ; rien n’est appliqué');
  // Témoin : le poêle présent reçoit son Arrêt.
  const n = sansProgrammes(maisonChauffageDemo({ quand: LUNDI_10H }));
  await n.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [POELE]: { planning: true } } } });
  const p2 = par(await n.ws({ type: 'loggia/chauffage/maison', mode: 'ete' }), POELE);
  assert.deepEqual([p2.mode, p2.applique, p2.fenetre_mode], ['arret', 'arret', 'arret']);
});

test('un radiateur introuvable dans la démo : nommé par l’entité de sa configuration, sur sa ligne, et que « Supprimer son planning » retire', async () => {
  /* Relecture des tâches 11 et 12 : la démo garde la configuration d'un
   * radiateur du grenier qu'aucune entité ne porte plus — renommé ou retiré.
   * « En ce moment » le dit à un administrateur, sa fiche s'ouvre sur son
   * Planning, « Supprimer son planning » le retire, et la feuille se ferme. */
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  assert.ok(!(GRENIER in m.states), 'aucune entité de la démo ne porte ce nom');
  const e = await etat(m);
  const g = par(e, GRENIER);
  assert.deepEqual([g.entite, g.nom, g.famille, g.planning, g.avertissements], [null, GRENIER, 'fil_pilote', false, ['introuvable']]);
  assert.deepEqual([g.applique, g.fenetre_mode, g.options, g.jour], [null, null, null, null], 'rien à lui appliquer');
  assert.equal(e.plannings_allumes, true, 'son planning éteint ne change rien au compte');
  assert.ok(!e.journal.some((l) => l.cibles.includes(GRENIER)), 'le moteur ne lui a rien envoyé');
  // La ligne d'« En ce moment », pour un administrateur seulement.
  const { lignesMoment } = await import(new URL('../src/chauffageecran.js', import.meta.url));
  const ligne = lignesMoment(e).find((l) => l.chauffage === GRENIER);
  assert.deepEqual([ligne.nom, ligne.icone, ligne.entite], [GRENIER, 'search-alt', null], 'la ligne de l’introuvable');
  assert.ok(!lignesMoment(e, 'C', { admin: false }).some((l) => l.chauffage === GRENIER));
  // « Supprimer son planning » : la configuration part, l'état ne le liste plus.
  const r = await m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [GRENIER]: null } } });
  assert.ok(!(GRENIER in r.config.chauffages));
  assert.equal(par(r.etat, GRENIER), undefined);
  assert.equal(lignesMoment(r.etat).some((l) => l.chauffage === GRENIER), false);
  // Les noms de la démo restent neutres (`npm run audit`).
  assert.ok(readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8').includes("const GRENIER_CHA = 'select.radiateur_grenier_fil_pilote';"));
});

test('Vacances : le jour seul — minuit à l’heure de la maison, qui reste le même à chaque validation', async () => {
  /* Relecture des tâches 11 et 12 : l'écran envoie le JOUR (« 2026-10-20 »),
   * le serveur en fait minuit à l'heure de la maison (`_minuit_de_la_maison`)
   * — la démo, à celle du navigateur, son seul fuseau. */
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  const ILLISIBLE = { code: 'chauffage_date_illisible', message: 'date illisible ou passee : maison.vacances_fin' };
  for (const validation of [1, 2]) {
    const e = await m.ws({ type: 'loggia/chauffage/maison', mode: 'vacances', fin: '2026-10-20' });
    assert.equal(mural(e.maison.vacances_fin), '2026-10-20T00:00', 'validation ' + validation);
    assert.match(e.maison.vacances_fin, ISO);
  }
  // Aujourd'hui — son minuit est passé —, un jour qui n'existe pas, une date hors des Vacances : refusés.
  await assert.rejects(m.ws({ type: 'loggia/chauffage/maison', mode: 'vacances', fin: '2026-10-12' }), ILLISIBLE);
  await assert.rejects(m.ws({ type: 'loggia/chauffage/maison', mode: 'vacances', fin: '2026-02-31' }), ILLISIBLE);
  await assert.rejects(m.ws({ type: 'loggia/chauffage/maison', mode: 'absence', fin: '2026-10-20' }), ILLISIBLE);
  // Le jour du retour, à minuit de la maison, elle repasse au Planning.
  m.regler(a(20, 0, 1));
  assert.equal((await etat(m)).maison.mode, 'planning');
});

test('un chauffage reconnu reçoit la semaine type dans SES modes, comme chauffage_defaut (adapter_aux_modes)', async () => {
  /* Relecture de la tâche 10 : le jumeau de démo `chauffageDefautCha` donnait
   * la semaine type telle quelle — l'Éco à un module qui n'en a pas, que le
   * serveur ne lui aurait jamais posé (`chauffage_defaut`, chauffage_config.py). */
  const m = sansProgrammes(maisonChauffageDemo({ quand: LUNDI_10H }));
  await m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [BUREAU]: null } } });
  m.states[BUREAU] = { ...m.states[BUREAU], attributes: { ...m.states[BUREAU].attributes, options: ['comfort', 'frost_protection', 'off'] } };
  const r = await m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [BUREAU]: { planning: true } } } });
  const c = r.config.chauffages[BUREAU];
  assert.deepEqual(c.semaine.lun, [{ h: '06:30', mode: 'confort' }, { h: '08:30', mode: 'hors_gel' }, { h: '18:00', mode: 'confort' }, { h: '22:30', mode: 'hors_gel' }],
    'l’Éco devient Hors-gel : le plus proche, jamais plus chaud');
  assert.deepEqual(c.semaine.sam, [{ h: '08:00', mode: 'confort' }, { h: '22:30', mode: 'hors_gel' }]);
  assert.ok(Object.values(c.semaine).flat().every((x) => ['confort', 'hors_gel', 'arret'].includes(x.mode)), 'rien qu’il ne comprenne pas');
  // Témoin : qui comprend tout la reçoit telle quelle (le poêle, plus haut, et ici).
  const p = await m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [POELE]: { planning: true } } } });
  assert.deepEqual(p.config.chauffages[POELE].semaine, SEMAINE_TYPE);
  /* Le jumeau de la démo donne la semaine du jumeau de la fiche
   * (`semaineAdaptee`) : un module sans Éco, sans Confort, ou au seul
   * Confort −1. La démo ne charge pas le module de la fiche — il ferait sortir
   * 33 Ko du boot dans un morceau à part (mesuré à la construction). */
  for (const options of [['comfort', 'frost_protection', 'off'], ['eco', 'frost_protection', 'off'], ['comfort_-1', 'eco'], ['comfort_-1']]) {
    const n = sansProgrammes(maisonChauffageDemo({ quand: LUNDI_10H }));
    await n.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [BUREAU]: null } } });
    n.states[BUREAU] = { ...n.states[BUREAU], attributes: { ...n.states[BUREAU].attributes, options } };
    const permis = par(await etat(n), BUREAU).modes;
    const q = await n.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [BUREAU]: { planning: true } } } });
    assert.deepEqual(q.config.chauffages[BUREAU].semaine, semaineAdaptee(SEMAINE_TYPE, permis), options.join(', '));
  }
  const demo = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');
  assert.ok(!demo.includes("from './chauffageplanning.js'"), 'la démo charge le module de la fiche');
  assert.ok(demo.includes('if (!actuel) actuel = chauffageDefautCha(connu.entite, connu.famille, connu.permis);'), 'les modes du chauffage reconnu');
});

test('le bouchon de callWS passe les quatre commandes au même moteur', () => {
  const demo = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');
  assert.ok(demo.includes('const chauffage = repondreChauffageDemo(msg, contexteChauffage());'), 'le bouchon');
  assert.ok(demo.includes('if (chauffage) return chauffage;'));
  for (const type of ['etat', 'main', 'maison', 'config']) assert.ok(demo.includes("'loggia/chauffage/" + type + "'"), type);
  assert.ok(demo.includes('return choisirOptionChauffageDemo(contexteChauffage(), id, (data || {}).option);'), 'select.select_option');
});

/* ════════════ L'historique de la démo (tâche 10 bis D) ════════════
 *
 * L'Historique de la fiche (cadre 3d) se voit dans la démo : la température
 * d'une pièce doit y être plausible — elle descendait à −0,8° au milieu d'une
 * journée à 21°, le générateur des puissances multipliant sa valeur — et
 * l'historique d'un thermostat a la forme de ce que Home Assistant ENREGISTRE.
 * Une fenêtre lue comme `useHistoriquePeriode` la demande : du début à la fin,
 * l'entité, au format minimal ou avec ses attributs. */
function periodeDemo(id, jours, minimal = true) {
  const fin = Date.now() - 60000;
  const debut = fin - jours * 86400000;
  const chemin = 'history/period/' + new Date(debut).toISOString() + '?filter_entity_id=' + encodeURIComponent(id)
    + '&end_time=' + encodeURIComponent(new Date(fin).toISOString()) + (minimal ? '&minimal_response&no_attributes' : '');
  return { debut, fin, chemin };
}

test('la température d’une pièce, dans la démo : une sinusoïde douce autour de sa valeur — jamais −0,8° au milieu d’une journée à 21°', () => {
  const m = maisonChauffageDemo();
  for (const id of ['sensor.bureau_temperature', 'sensor.chambre_temperature', 'sensor.salon_temperature', 'sensor.salle_de_bain_temperature']) {
    const cur = Number(m.states[id].state);
    for (const jours of [1, 7]) {
      const p = periodeDemo(id, jours);
      const [liste] = historiqueDemo(p.chemin, m.states);
      const v = liste.map(x => Number(x.state));
      const t = liste.map(x => Date.parse(x.last_changed));
      assert.equal(liste.length, jours * 96 + 1, id + ' : un point par quart d’heure, sur ' + jours + ' jour(s)');
      assert.equal(liste[0].entity_id, id);
      assert.deepEqual([t[0], t.at(-1)], [p.debut, p.fin], 'du début de la période à maintenant');
      assert.ok(t.every((x, i) => !i || x - t[i - 1] === 15 * 60000 || i === t.length - 1), 'un quart d’heure entre deux');
      assert.equal(v.at(-1), cur, 'la dernière est la valeur du moment, celle de la carte');
      assert.ok(v.every(x => Number.isFinite(x) && Math.abs(x - cur) <= 1.6 + 1e-9), id + ' : à 1,6 °C au plus de sa valeur — ' + Math.min(...v) + ' … ' + Math.max(...v));
      assert.ok(Math.min(...v) < cur && Math.max(...v) > cur, id + ' : autour de sa valeur, de part et d’autre');
      assert.ok(Math.max(...v) - Math.min(...v) >= 2.5, id + ' : elle varie, de quelques degrés');
      assert.ok(v.every((x, i) => !i || Math.abs(x - v[i - 1]) <= 0.2 + 1e-9), id + ' : doucement');
    }
  }
  // La puissance, le CO₂ et les autres capteurs gardent leur générateur : 49 points sur la période.
  for (const id of ['sensor.salon_co2', 'sensor.salon_humidite', 'sensor.batterie_maison']) {
    assert.ok(m.states[id], id);
    assert.equal(historiqueDemo(periodeDemo(id, 1).chemin, m.states)[0].length, 49, id);
  }
});

/* La même courbe, à TOUTE heure : chaque quart d'heure d'un jour ordinaire et des deux jours
 * de changement d'heure. Le 25/10/2026 (heure d'hiver), la courbe prenait l'heure locale point
 * par point et sautait d'une heure au passage : jusqu'à 0,4 °C d'un quart d'heure au suivant —
 * le test ci-dessus, qui part de `Date.now()`, échouait selon l'heure. Des jours PASSÉS : la
 * démo arrête l'historique à maintenant (26/10/2025 : la même règle d'heure d'hiver). */
test('la température d’une pièce, dans la démo : douce à toute heure, changements d’heure compris', () => {
  const m = maisonChauffageDemo();
  const id = 'sensor.bureau_temperature';
  const cur = Number(m.states[id].state);
  for (const [a, mo, j] of [[2026, 9, 20], [2025, 9, 26], [2026, 2, 29]]) {
    for (let q = 0; q < 96; q++) {
      const fin = new Date(a, mo, j, 0, q * 15, 7).getTime();
      for (const jours of [1, 7]) {
        const debut = fin - jours * 86400000;
        const chemin = 'history/period/' + new Date(debut).toISOString() + '?filter_entity_id=' + encodeURIComponent(id)
          + '&end_time=' + encodeURIComponent(new Date(fin).toISOString()) + '&minimal_response&no_attributes';
        const v = historiqueDemo(chemin, m.states)[0].map(x => Number(x.state));
        const ou = new Date(fin).toString() + ', ' + jours + ' j';
        assert.equal(v.at(-1), cur, ou + ' : la dernière est la valeur du moment');
        assert.ok(v.every((x, i) => !i || Math.abs(x - v[i - 1]) <= 0.2 + 1e-9), ou + ' : doucement');
        assert.ok(v.every(x => Math.abs(x - cur) <= 1.6 + 1e-9), ou + ' : à 1,6 °C au plus');
        assert.ok(Math.max(...v) - Math.min(...v) >= 2.5, ou + ' : elle varie');
      }
    }
  }
});

test('l’historique d’un thermostat de la démo : ce que Home Assistant ENREGISTRE — ni ses attributs fixes ni ses listes —, sa pièce autour de sa valeur, sa consigne, ce qu’il fait', () => {
  const m = maisonChauffageDemo();
  // Ce que Home Assistant n'enregistre pas d'un `climate` (`_entity_component_unrecorded_attributes`).
  const NON_ENREGISTRES = ['hvac_modes', 'fan_modes', 'swing_modes', 'swing_horizontal_modes', 'min_temp', 'max_temp', 'min_humidity', 'max_humidity', 'target_temp_step', 'preset_modes'];
  for (const id of [POELE, CLIM, 'climate.salon']) {
    const st = m.states[id];
    const cur = st.attributes.current_temperature;
    for (const jours of [1, 7]) {
      const [liste] = historiqueDemo(periodeDemo(id, jours, false).chemin, m.states);
      assert.equal(liste[0].entity_id, id);
      assert.ok(liste.length >= jours * 96, id + ' : un point par quart d’heure');
      for (const x of liste) {
        for (const k of NON_ENREGISTRES) assert.ok(!(k in x.attributes), id + ' : ' + k + ' n’est pas enregistré');
        assert.ok(Math.abs(x.attributes.current_temperature - cur) <= 1.6 + 1e-9, id + ' : ' + x.attributes.current_temperature);
        assert.equal(typeof x.attributes.hvac_action, 'string', id + ' : ce qu’il fait');
        assert.ok(x.state === 'off' || typeof x.attributes.temperature === 'number', id + ' : sa consigne');
      }
      const der = liste.at(-1);
      assert.equal(der.state, st.state, 'le dernier point : l’état du moment');
      assert.deepEqual([der.attributes.current_temperature, der.attributes.temperature, der.attributes.hvac_action],
        [cur, st.attributes.temperature, st.attributes.hvac_action]);
      // Ce qu'il fait se LIT sur la pièce, comme après un service (`actionClimatDemo`) : il chauffe sous sa consigne, refroidit au-dessus.
      for (const x of liste.slice(0, -1)) {
        const { current_temperature: piece, temperature: consigne, hvac_action: action } = x.attributes;
        const attendu = x.state === 'off' ? 'off' : x.state === 'heat' && piece < consigne - 0.3 ? 'heating' : x.state === 'cool' && piece > consigne + 0.3 ? 'cooling' : 'idle';
        assert.equal(action, attendu, id + ' ' + x.last_changed);
      }
      /* Il a travaillé — chaque jour, pour ce qui chauffe : la consigne du
       * matin passe au-dessus de la pièce. ASSERTION MODIFIÉE (relecture de la
       * partie D, point 8) : l'exemption du poêle tombe — dans un salon déjà à
       * 21° pour 20, il pouvait n'avoir rien fait de la journée, selon l'heure. */
      assert.ok(liste.some(x => ['heating', 'cooling'].includes(x.attributes.hvac_action)), id + ' : il a travaillé');
      if (st.state === 'heat') {
        // Les matins de la période : un sur 24 h, sept sur 7 jours.
        const chauffe = new Set(liste.filter(x => x.attributes.hvac_action === 'heating').map(x => new Date(x.last_changed).toDateString()));
        assert.ok(chauffe.size >= jours, id + ' : il chauffe chaque jour — ' + chauffe.size + ' jour(s) sur ' + jours);
      }
    }
  }
});
