/* Le planning de chauffe dans la fiche : les aides pures (chantier Chauffage,
 * plan 2, tâche 8).
 *
 * L'onglet Planning dessine la semaine en sept bandes, et l'Accueil dit le
 * prochain changement. Les deux se calculent dans `src/chauffageplanning.js`,
 * par le calcul de l'écran (`src/chauffage.js`, le jumeau de
 * `chauffage_calcul.py`) : chaque jour a les bandes que le serveur donne à la
 * carte pour aujourd'hui (`_journee`, tests/python/test_chauffage.py) — même
 * bornes, même mode de la maison appliqué, mêmes bandes voisines fondues.
 * Ni React ni Home Assistant : une valeur entre, une valeur sort.
 *
 * Tâche 9 : l'éditeur de la semaine. La semaine type est la copie de celle du
 * serveur (lue dans chauffage_config.py) ; chaque geste rend une NOUVELLE
 * semaine rangée, ou un refus local — une heure prise, un treizième
 * changement, le dernier de la semaine, une heure illisible —, que le serveur
 * aurait opposé ; une semaine adaptée aux modes d'un chauffage n'y chauffe
 * jamais plus.
 *
 * Tâche 10 : les modes que l'APPAREIL a réellement appliqués sur 24 h, lus
 * dans son historique (un fil pilote par son option, un VTherm par son
 * préréglage, un thermostat par sa consigne, sinon « à la main ») ; les
 * températures des modes d'un thermostat, un cran à la fois, l'ordre et les
 * bornes du serveur vérifiés sur place — les trois rangées d'abord sur la
 * grille du demi-degré, comme le serveur (tâche 10 bis C) ; la plage d'un
 * appareil en `heat_cool`.
 *
 * Tâche 10 bis C : − 15 min et + 15 min d'un changement (`heureDecalee`),
 * jamais par-dessus un voisin ni hors de la journée.
 *
 * Tâche 10 bis D, l'Historique de sa maquette (cadre 3d) : la courbe de la
 * pièce échantillonnée en escalier — un trou reste un trou —, l'échelle de
 * `chart()`, la consigne d'un thermostat en escalier, la chauffe d'un
 * thermostat, le temps par mode ; `modesAppliques` sur 1 ou 7 jours, avec les
 * attributs FIXES de l'état vivant (Home Assistant ne les enregistre pas) et
 * l'état vivant en dernier point ; le jumeau de `mode_applicable`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bandesSemaine, prochainDeLaSemaine, changementsDuJour, jourDeLaFin, MAX_CHANGEMENTS_JOUR, SEMAINE_OUVREE, SEMAINE_REPOS, semaineType,
  semainePropre, heureLibre, modePropose, ajouterChangement, retirerChangement, changerHeure, changerMode, copierJour, adapterAuxModes,
  semaineAdaptee, heureDecalee, heureAuMilieu, modesAppliques, TEMPERATURES_DEFAUT, temperaturesDe, temperatureDuMode, pasTemperature, consigneEnUnite,
  plageVoisine, estMuet, modesHvac, modeDeChauffe, PRESETS_VTHERM,
  REPLIS, modeApplicable, modeApplique, PERIODES, echantillons, courbe, chauffeAppliquee, tempsParMode, tempsDeChauffe, placeBande,
  dater, actionDite, bandesAppliquees,
} from '../src/chauffageplanning.js';
import { JOURS, FROID } from '../src/chauffage.js';

// La semaine type du premier allumage (SEMAINE_OUVREE, SEMAINE_REPOS, chauffage_config.py).
const OUVREE = [['06:30', 'confort'], ['08:30', 'eco'], ['18:00', 'confort'], ['22:30', 'eco']];
const REPOS = [['08:00', 'confort'], ['22:30', 'eco']];
const semaine = (ouvree, repos) => Object.fromEntries(JOURS.map(j => [j, (j === 'sam' || j === 'dim' ? repos : ouvree).map(([h, mode]) => ({ h, mode }))]));
const TYPE = semaine(OUVREE, REPOS);
// Le bureau de la démo : hors gel la nuit, et rien le week-end — deux jours qui reprennent le vendredi.
const BUREAU = semaine([['07:30', 'eco'], ['13:30', 'confort'], ['17:30', 'confort_1'], ['19:00', 'eco'], ['22:00', 'hors_gel']], []);
const maison = (mode, o = {}) => ({ mode, vacances_fin: null, absence: 'eco', vacances: 'hors_gel', ...o });
const PLANNING = maison('planning');
const b = (de, a, mode) => ({ de, a, mode });

/* Chaque jour couvre la journée entière, sans trou ni chevauchement. */
function contigue(jour) {
  assert.ok(jour.length > 0);
  assert.equal(jour[0].de, 0);
  assert.equal(jour[jour.length - 1].a, 1440);
  for (let i = 1; i < jour.length; i++) {
    assert.equal(jour[i].de, jour[i - 1].a, 'une bande commence où la précédente finit');
    assert.notEqual(jour[i].mode, jour[i - 1].mode, 'deux bandes voisines du même mode n’en font qu’une');
  }
}

test('la semaine type : sept jours, le lundi comme le serveur le donne à la carte', () => {
  const bandes = bandesSemaine(TYPE, PLANNING);
  assert.equal(bandes.length, 7);
  bandes.forEach(contigue);
  // Le mode de minuit est la fin de la veille (dimanche, 22:30 Éco).
  assert.deepEqual(bandes[0], [b(0, 390, 'eco'), b(390, 510, 'confort'), b(510, 1080, 'eco'), b(1080, 1350, 'confort'), b(1350, 1440, 'eco')]);
  assert.deepEqual(bandes[4], bandes[0], 'le vendredi, la même journée');
  assert.deepEqual(bandes[5], [b(0, 480, 'eco'), b(480, 1350, 'confort'), b(1350, 1440, 'eco')], 'le samedi, le week-end');
  assert.deepEqual(bandes[6], bandes[5]);
});

test('un jour sans changement reprend la fin de la veille, et la semaine boucle', () => {
  const bandes = bandesSemaine(BUREAU, PLANNING);
  bandes.forEach(contigue);
  // Le vendredi finit en Hors-gel à 22:00 : le samedi et le dimanche le gardent tout le jour.
  assert.deepEqual(bandes[5], [b(0, 1440, 'hors_gel')]);
  assert.deepEqual(bandes[6], [b(0, 1440, 'hors_gel')]);
  // Et le lundi commence dans le Hors-gel du dimanche.
  assert.deepEqual(bandes[0], [b(0, 450, 'hors_gel'), b(450, 810, 'eco'), b(810, 1050, 'confort'), b(1050, 1140, 'confort_1'), b(1140, 1320, 'eco'), b(1320, 1440, 'hors_gel')]);
  // Une semaine d'un seul jour : les six autres reprennent sa dernière heure.
  const mercredi = bandesSemaine({ mer: [{ h: '07:00', mode: 'confort' }, { h: '21:00', mode: 'eco' }] }, PLANNING);
  assert.deepEqual(mercredi[0], [b(0, 1440, 'eco')], 'le lundi suit le mercredi d’avant');
  assert.deepEqual(mercredi[2], [b(0, 420, 'eco'), b(420, 1260, 'confort'), b(1260, 1440, 'eco')]);
});

test('Été : tout à l’Arrêt, chaque jour d’une seule bande', () => {
  for (const jour of bandesSemaine(TYPE, maison('ete'))) assert.deepEqual(jour, [b(0, 1440, 'arret')]);
});

test('Absence : jamais plus chaud que l’Éco — les bandes Éco se fondent, le Hors-gel reste', () => {
  for (const jour of bandesSemaine(TYPE, maison('absence'))) assert.deepEqual(jour, [b(0, 1440, 'eco')]);
  // Un planning PLUS froid que l'Absence le reste : elle ne réchauffe jamais (D10).
  const bureau = bandesSemaine(BUREAU, maison('absence'));
  assert.deepEqual(bureau[0], [b(0, 450, 'hors_gel'), b(450, 1320, 'eco'), b(1320, 1440, 'hors_gel')]);
  // Son réglage se suit : une Absence en Hors-gel.
  assert.deepEqual(bandesSemaine(TYPE, maison('absence', { absence: 'hors_gel' }))[0], [b(0, 1440, 'hors_gel')]);
});

test('Vacances : Hors-gel partout, même sur un planning à l’Arrêt', () => {
  for (const jour of bandesSemaine(TYPE, maison('vacances'))) assert.deepEqual(jour, [b(0, 1440, 'hors_gel')]);
  const arret = semaine([['00:00', 'arret']], [['00:00', 'arret']]);
  assert.deepEqual(bandesSemaine(arret, PLANNING)[0], [b(0, 1440, 'arret')], 'témoin : le planning dit Arrêt');
  assert.deepEqual(bandesSemaine(arret, maison('vacances'))[0], [b(0, 1440, 'hors_gel')], 'la garde contre le gel d’un long départ');
});

test('une semaine vide, absente ou abîmée : sept listes vides', () => {
  const vides = [[], [], [], [], [], [], []];
  assert.deepEqual(bandesSemaine(semaine([], []), PLANNING), vides);
  assert.deepEqual(bandesSemaine(null, PLANNING), vides);
  assert.deepEqual(bandesSemaine({ lun: 'x', mar: [{ h: 'midi', mode: 'confort' }], mer: [{ h: '08:00', mode: 'tiede' }] }, PLANNING), vides,
    'une heure illisible ou un mode inconnu ne font pas un changement');
  // Une ligne abîmée au milieu d'un jour lisible est écartée, sans faire tomber le reste.
  const abimee = bandesSemaine({ lun: [null, { h: '08:00', mode: 'confort' }, { h: 'x', mode: 'eco' }, { h: '20:00', mode: 'eco' }] }, PLANNING);
  assert.deepEqual(abimee[0], [b(0, 480, 'eco'), b(480, 1200, 'confort'), b(1200, 1440, 'eco')]);
});

test('le prochain changement : le premier qui change le mode, la maison appliquée', () => {
  const type = bandesSemaine(TYPE, PLANNING);
  assert.deepEqual(prochainDeLaSemaine(type, 0, 600), { jour: 0, minute: 1080, mode: 'confort', dans: 0 }, 'lundi 10:00 → 18:00 Confort');
  // Lundi 23:00 : minuit garde l'Éco, ce n'est pas un changement.
  assert.deepEqual(prochainDeLaSemaine(type, 0, 1380), { jour: 1, minute: 390, mode: 'confort', dans: 1 });
  assert.deepEqual(prochainDeLaSemaine(type, 4, 1380), { jour: 5, minute: 480, mode: 'confort', dans: 1 }, 'vendredi soir → samedi 08:00');
  assert.deepEqual(prochainDeLaSemaine(type, 0, 1080), { jour: 0, minute: 1350, mode: 'eco', dans: 0 }, 'pile à 18:00, le suivant');
  // Le bureau en Absence : le Confort de l'après-midi ne vient pas, le Hors-gel du soir si.
  assert.deepEqual(prochainDeLaSemaine(bandesSemaine(BUREAU, maison('absence')), 0, 600), { jour: 0, minute: 1320, mode: 'hors_gel', dans: 0 });
  // Un seul jour qui change : le même jour de la semaine suivante.
  const lundi = bandesSemaine({ lun: [{ h: '06:30', mode: 'confort' }, { h: '08:00', mode: 'eco' }] }, PLANNING);
  assert.deepEqual(prochainDeLaSemaine(lundi, 0, 600), { jour: 0, minute: 390, mode: 'confort', dans: 7 });
  // Plus rien ne change : l'Été, les Vacances, une semaine vide, un seul mode.
  assert.equal(prochainDeLaSemaine(bandesSemaine(TYPE, maison('ete')), 2, 600), null);
  assert.equal(prochainDeLaSemaine(bandesSemaine(TYPE, maison('vacances')), 2, 600), null);
  assert.equal(prochainDeLaSemaine(bandesSemaine(null, PLANNING), 2, 600), null);
  assert.equal(prochainDeLaSemaine(bandesSemaine(semaine([['07:00', 'eco']], []), PLANNING), 2, 600), null);
  assert.equal(prochainDeLaSemaine(null, 0, 0), null);
});

test('les changements d’un jour, dans l’ordre des heures, l’illisible écarté', () => {
  const s = { lun: [{ h: '22:30', mode: 'eco' }, { h: '6:30', mode: 'confort' }, { h: 'midi', mode: 'eco' }, null, { h: '08:30', mode: 'eco' }] };
  assert.deepEqual(changementsDuJour(s, 0), [
    { h: '6:30', mode: 'confort', minute: 390 }, { h: '08:30', mode: 'eco', minute: 510 }, { h: '22:30', mode: 'eco', minute: 1350 },
  ]);
  assert.deepEqual(changementsDuJour(s, 1), [], 'un jour sans liste');
  assert.deepEqual(changementsDuJour(null, 0), []);
  assert.deepEqual(changementsDuJour(TYPE, 6).map(c => c.h), ['08:00', '22:30'], 'dimanche, le septième jour');
});

/* Relecture de la tâche 8 (11/10) : un dimanche soir, la fiche du bureau
 * disait « jusqu’à 07:30, puis Éco » pour une fin LUNDI matin. Le jour d'une
 * fin se lit, comme son heure, dans la partie MURALE des deux chaînes. */
test('le jour d’une fin vu d’aujourd’hui : la date murale des deux instants, jamais le fuseau du navigateur', () => {
  const DIMANCHE = '2026-10-11T21:00:00+02:00';   // dimanche 11 octobre 2026, 21:00 à la maison
  assert.deepEqual(jourDeLaFin('2026-10-11T22:30:00+02:00', DIMANCHE), { dans: 0, jour: 6 }, 'ce soir');
  assert.deepEqual(jourDeLaFin('2026-10-12T07:30:00+02:00', DIMANCHE), { dans: 1, jour: 0 }, 'demain, lundi');
  assert.deepEqual(jourDeLaFin('2026-10-13T07:30:00+02:00', DIMANCHE), { dans: 2, jour: 1 }, 'mardi');
  // 00:30 et 23:30 d'un même jour à la maison tombent sur deux dates en UTC : la date murale, une seule.
  assert.deepEqual(jourDeLaFin('2026-10-12T23:30:00+02:00', '2026-10-12T00:30:00+02:00'), { dans: 0, jour: 0 });
  // Le changement d'heure du 25 octobre ne déplace aucun jour.
  assert.deepEqual(jourDeLaFin('2026-10-25T06:30:00+01:00', '2026-10-24T22:00:00+02:00'), { dans: 1, jour: 6 });
  assert.deepEqual(jourDeLaFin('2026-10-26T06:30:00+01:00', '2026-10-25T23:00:00+01:00'), { dans: 1, jour: 0 });
  // Sans « maintenant » du serveur : l'instant du navigateur, à sa date locale.
  assert.deepEqual(jourDeLaFin('2026-10-12T07:30:00+02:00', new Date(2026, 9, 11, 21, 0).getTime()), { dans: 1, jour: 0 });
  // Ce qui ne se lit pas : null — l'écran dit alors l'heure seule.
  for (const [fin, ref] of [[null, DIMANCHE], ['demain', DIMANCHE], ['2026-13-01T07:30:00+02:00', DIMANCHE],
    ['2026-10-12T07:30:00+02:00', null], ['2026-10-12T07:30:00+02:00', 'hier'], ['2026-10-12T07:30:00+02:00', NaN]]) {
    assert.equal(jourDeLaFin(fin, ref), null, String(fin) + ' / ' + String(ref));
  }
});

/* ════════════ L'éditeur de la semaine (tâche 9) ════════════ */

const c = (h, mode) => ({ h, mode });
const PY = readFileSync(new URL('../custom_components/loggia/chauffage_config.py', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/* Une constante de la semaine type, lue dans le Python : `NOM = (("06:30", "confort"), …)`. */
function constantePy(nom) {
  const m = new RegExp('^' + nom + ' = \\((.*)\\)$', 'm').exec(PY);
  assert.ok(m, nom + ' introuvable dans chauffage_config.py');
  return [...m[1].matchAll(/\("([^"]+)", "([^"]+)"\)/g)].map(x => [x[1], x[2]]);
}

test('la semaine type : la copie de celle du serveur, une nouvelle à chaque appel', () => {
  assert.deepEqual(SEMAINE_OUVREE.map(x => [...x]), constantePy('SEMAINE_OUVREE'), 'du lundi au vendredi, comme chauffage_config.py');
  assert.deepEqual(SEMAINE_REPOS.map(x => [...x]), constantePy('SEMAINE_REPOS'), 'le week-end, comme chauffage_config.py');
  assert.ok(PY.includes('SEMAINE_REPOS if jour in ("sam", "dim") else SEMAINE_OUVREE'), 'le serveur range le week-end de même');
  assert.deepEqual(semaineType(), TYPE);
  assert.deepEqual(SEMAINE_OUVREE.map(x => [...x]), OUVREE, 'témoin : la semaine de ces tests est la semaine type');
  // Une nouvelle à chaque appel : la retoucher ne touche ni la suivante, ni les constantes.
  const a = semaineType();
  assert.notEqual(a, semaineType());
  a.lun.push(c('12:00', 'eco'));
  a.mar[0].mode = 'arret';
  assert.deepEqual(semaineType(), TYPE);
  assert.ok(Object.isFrozen(SEMAINE_OUVREE) && Object.isFrozen(SEMAINE_OUVREE[0]) && Object.isFrozen(SEMAINE_REPOS[1]));
  // La borne d'un jour est celle du serveur.
  assert.match(PY, /^MAX_CHANGEMENTS_JOUR = 12$/m);
  assert.equal(MAX_CHANGEMENTS_JOUR, 12);
});

test('la semaine propre : les sept jours et rien d’autre, rangés, l’heure au format du serveur', () => {
  assert.deepEqual(semainePropre(null), Object.fromEntries(JOURS.map(j => [j, []])));
  assert.deepEqual(semainePropre(TYPE), TYPE);
  const brute = semainePropre({ lun: [c('22:30', 'eco'), c('6:30', 'confort'), null, c('midi', 'eco')], autre: [c('08:00', 'eco')] });
  assert.deepEqual(Object.keys(brute), JOURS, 'un jour inconnu, le serveur le refuserait');
  assert.deepEqual(brute.lun, [c('06:30', 'confort'), c('22:30', 'eco')]);
});

test('heureLibre : la première heure pleine libre à partir de 08:00, puis depuis minuit', () => {
  assert.equal(heureLibre([]), '08:00');
  assert.equal(heureLibre(null), '08:00');
  assert.equal(heureLibre([c('08:00', 'eco'), c('18:30', 'eco')]), '09:00', 'un changement de 08:00 existe : pas un second');
  assert.equal(heureLibre([c('8:00', 'eco')]), '09:00', '« 8:00 » est la même heure');
  assert.equal(heureLibre([c('08:30', 'eco')]), '08:00', 'une demi-heure ne prend pas l’heure pleine');
  const pleines = (de, n) => Array.from({ length: n }, (_, i) => c(String(de + i).padStart(2, '0') + ':00', 'eco'));
  assert.equal(heureLibre(pleines(8, 16)), '00:00', 'après 23:00, on repart de minuit');
  assert.equal(heureLibre(pleines(0, 24)), null, 'aucune heure pleine libre : rien d’inventé');
  assert.equal(heureLibre([null, c('midi', 'eco')]), '08:00');
});

/* Son choix du 12/10 (« Toucher l’heure ») : « Ajouter un changement » le
 * pose au milieu du plus grand trou de la journée, au quart d'heure — d'où
 * ± 15 min et le champ de l'heure le mènent partout. `heureLibre` ne change
 * pas : elle reste l'heure par défaut d'`ajouterChangement`. */
test('l’heure d’un changement ajouté : le milieu du plus grand trou de la journée, au quart d’heure', () => {
  const jour = (liste) => changementsDuJour({ lun: liste.map(h => c(h, 'eco')) }, 0);
  // La semaine type, un lundi : 06:30, 08:30, 18:00, 22:30 — le plus grand trou va de 08:30 à 18:00.
  assert.equal(heureAuMilieu(changementsDuJour(TYPE, 0)), '13:15');
  assert.equal(heureAuMilieu(changementsDuJour(TYPE, 5)), '15:15', 'le samedi : 08:00 → 22:30');
  // Un jour vide : midi.
  assert.equal(heureAuMilieu([]), '12:00');
  assert.equal(heureAuMilieu(null), '12:00');
  // Un trou en fin de journée : 08:00 → minuit.
  assert.equal(heureAuMilieu(jour(['06:00', '08:00'])), '16:00');
  // En début de journée : minuit → 15:00 ; un changement à minuit ne fait pas de trou avant lui.
  assert.equal(heureAuMilieu(jour(['15:00', '20:00'])), '07:30');
  assert.equal(heureAuMilieu(jour(['00:00', '16:00'])), '08:00');
  // Un jour plein (douze changements, toutes les deux heures) : le premier des plus grands trous.
  assert.equal(heureAuMilieu(jour(Array.from({ length: 12 }, (_, i) => String(i * 2).padStart(2, '0') + ':00'))), '01:00');
  // À égalité, le premier ; arrondi au quart d'heure, jamais sur un voisin.
  assert.equal(heureAuMilieu(jour(['08:00', '16:00'])), '04:00');
  assert.equal(heureAuMilieu(jour(['00:10'])), '12:00', '00:10 → minuit : 12:05, au quart 12:00');
  assert.equal(heureAuMilieu(jour(['23:45'])), '12:00', 'minuit → 23:45 : 11:52,5, au quart 12:00');
  // Plus de place au quart d'heure (un trou plus petit qu'un quart) : null.
  assert.equal(heureAuMilieu(jour(Array.from({ length: 96 }, (_, i) => String(Math.floor(i / 4)).padStart(2, '0') + ':' + String((i % 4) * 15).padStart(2, '0')))), null);
  // `ajouterChangement` prend l'heure qu'on lui donne — rangée, au format du serveur ; prise ou illisible, refusée.
  assert.deepEqual(ajouterChangement(TYPE, 0, 'confort', '13:15').lun, [c('06:30', 'confort'), c('08:30', 'eco'), c('13:15', 'confort'), c('18:00', 'confort'), c('22:30', 'eco')]);
  assert.deepEqual(ajouterChangement(TYPE, 0, 'confort', '8:30'), { refus: 'heure_en_double' });
  assert.deepEqual(ajouterChangement(TYPE, 0, 'confort', 'midi'), { refus: 'heure_illisible' });
  assert.deepEqual(ajouterChangement(TYPE, 0, 'eco').lun[1], c('08:00', 'eco'), 'sans heure, la première heure pleine libre, comme avant');
});

test('le mode d’un changement ajouté : celui qui change quelque chose à cette heure', () => {
  assert.equal(modePropose(TYPE, 0, '07:00', FROID), 'eco', 'lundi 07:00, en plein Confort : l’Éco');
  assert.equal(modePropose(TYPE, 0, '12:00', FROID), 'confort', 'lundi midi, en Éco : le Confort');
  assert.equal(modePropose(null, 0, '08:00', FROID), 'confort', 'une semaine vide : le Confort');
  assert.equal(modePropose(TYPE, 0, '07:00', ['confort', 'hors_gel']), 'hors_gel', 'sans Éco : le mode compris juste en dessous');
  assert.equal(modePropose(TYPE, 0, '12:00', ['hors_gel', 'arret']), 'hors_gel', 'sans Confort : le plus chaud compris');
  assert.equal(modePropose(TYPE, 0, '12:00', ['eco', 'hors_gel', 'arret']), 'hors_gel', 'déjà à l’Éco, son plus chaud : le mode juste en dessous');
  assert.equal(modePropose(TYPE, 0, '12:00', ['eco']), 'eco', 'un seul mode : celui-là');
  assert.equal(modePropose(TYPE, 0, '07:00', []), null);
  assert.equal(modePropose(TYPE, 0, '07:00', null), null);
});

test('ajouter : à la première heure libre, le jour rangé — jamais un treizième', () => {
  const r = ajouterChangement(TYPE, 0, 'eco');
  assert.deepEqual(r.lun, [c('06:30', 'confort'), c('08:00', 'eco'), c('08:30', 'eco'), c('18:00', 'confort'), c('22:30', 'eco')]);
  assert.deepEqual(r.mar, TYPE.mar, 'les autres jours ne bougent pas');
  assert.equal(TYPE.lun.length, 4, 'la semaine reçue n’est pas touchée');
  assert.notEqual(r.lun, TYPE.lun);
  assert.deepEqual(ajouterChangement(BUREAU, 5, 'confort').sam, [c('08:00', 'confort')], 'un jour vide reçoit son premier changement');
  // Douze ce jour-là : refusé sur place, le serveur refuserait le treizième.
  const douze = { ...TYPE, lun: Array.from({ length: 12 }, (_, i) => c(String(i * 2).padStart(2, '0') + ':00', i % 2 ? 'eco' : 'confort')) };
  assert.deepEqual(ajouterChangement(douze, 0, 'eco'), { refus: 'douze' });
  assert.equal(ajouterChangement({ ...douze, lun: douze.lun.slice(1) }, 0, 'eco').lun.length, 12, 'témoin : le douzième passe');
  assert.equal(ajouterChangement(douze, 1, 'eco').mar.length, 5, 'un autre jour, oui');
  // Une semaine abîmée sort propre : sept jours, l'illisible écarté.
  const p = ajouterChangement({ lun: [c('22:30', 'eco'), c('6:30', 'confort'), c('midi', 'eco')], autre: [] }, 0, 'eco');
  assert.deepEqual(Object.keys(p), JOURS);
  assert.deepEqual(p.lun, [c('06:30', 'confort'), c('08:00', 'eco'), c('22:30', 'eco')]);
  assert.deepEqual(ajouterChangement(TYPE, 7, 'eco'), TYPE, 'un jour qui n’existe pas : rien ne change');
});

test('retirer : le changement part — jamais le dernier de la semaine', () => {
  assert.deepEqual(retirerChangement(TYPE, 0, 1).lun, [c('06:30', 'confort'), c('18:00', 'confort'), c('22:30', 'eco')]);
  assert.equal(TYPE.lun.length, 4);
  // Le dernier d'un JOUR part, tant que la semaine en garde un.
  const deux = { lun: [c('07:00', 'confort')], mar: [c('08:00', 'eco')] };
  assert.deepEqual(retirerChangement(deux, 0, 0).lun, []);
  // Le dernier de la SEMAINE, non : le serveur refuse une semaine vide.
  assert.deepEqual(retirerChangement({ mer: [c('07:00', 'confort')] }, 2, 0), { refus: 'derniere' });
  for (const index of [4, -1, 1.5, null]) assert.deepEqual(retirerChangement(TYPE, 0, index), TYPE, 'un index qui ne désigne rien : ' + index);
});

test('l’heure : le jour se range de nouveau ; une heure prise ou illisible ne passe pas', () => {
  const r = changerHeure(TYPE, 0, 1, '19:15');
  assert.deepEqual(r.lun, [c('06:30', 'confort'), c('18:00', 'confort'), c('19:15', 'eco'), c('22:30', 'eco')], 'l’Éco de 08:30 passe après le Confort de 18:00');
  assert.deepEqual(changerHeure(TYPE, 0, 0, '6:45').lun[0], c('06:45', 'confort'), 'au format du serveur');
  assert.deepEqual(changerHeure(TYPE, 0, 1, '18:00'), { refus: 'heure_en_double' });
  assert.deepEqual(changerHeure(TYPE, 0, 1, '08:30'), TYPE, 'sa propre heure n’est pas un doublon');
  for (const h of ['24:00', '12:60', 'midi', '', null, undefined, 830]) assert.deepEqual(changerHeure(TYPE, 0, 1, h), { refus: 'heure_illisible' }, String(h));
  assert.deepEqual(changerHeure(TYPE, 0, 4, '10:00'), TYPE, 'un index qui ne désigne rien');
  assert.equal(TYPE.lun[1].h, '08:30');
});

test('le mode : celui du changement désigné, le reste ne bouge pas', () => {
  assert.deepEqual(changerMode(TYPE, 6, 0, 'confort_1').dim, [c('08:00', 'confort_1'), c('22:30', 'eco')]);
  assert.deepEqual(changerMode(TYPE, 6, 0, 'confort_1').sam, TYPE.sam);
  assert.deepEqual(changerMode(TYPE, 6, 2, 'eco'), TYPE);
  assert.equal(TYPE.dim[0].mode, 'confort');
});

test('copier un jour : en semaine, le week-end, tous les jours — jamais une semaine vide', () => {
  const lundi = [c('07:00', 'confort'), c('21:00', 'eco')];
  const s = { ...TYPE, lun: lundi };
  const r = copierJour(s, 0, [0, 1, 2, 3, 4]);
  for (const j of ['lun', 'mar', 'mer', 'jeu', 'ven']) assert.deepEqual(r[j], lundi, j);
  assert.deepEqual([r.sam, r.dim], [TYPE.sam, TYPE.dim], 'le week-end ne bouge pas');
  r.mar[0].mode = 'arret';
  assert.equal(r.lun[0].mode, 'confort', 'chaque jour a SA copie');
  assert.deepEqual(copierJour(s, 0, [0, 1, 2, 3, 4, 5, 6]).dim, lundi, 'tous les jours');
  assert.deepEqual(copierJour(TYPE, 5, [5, 6]), TYPE, 'le samedi vers le week-end : rien ne change');
  // Un jour vide copié ailleurs, tant que la semaine garde un changement ; partout, non.
  assert.deepEqual(copierJour({ ...TYPE, mer: [] }, 2, [0, 1]).lun, []);
  assert.deepEqual(copierJour({ ...TYPE, mer: [] }, 2, [0, 1, 2, 3, 4, 5, 6]), { refus: 'derniere' });
});

test('adapter aux modes d’un autre chauffage : jamais plus chaud ; à défaut, le plus froid compris', () => {
  // Un jour qui passe par les six modes, du plus froid au plus chaud.
  const tout = FROID.map((m, i) => c(String(6 + i * 2).padStart(2, '0') + ':00', m));
  const VTHERM = ['confort', 'eco', 'hors_gel', 'arret'];
  assert.deepEqual(adapterAuxModes(tout, VTHERM).map(x => x.mode), ['arret', 'hors_gel', 'eco', 'eco', 'eco', 'confort'],
    'Confort −1 et −2 deviennent Éco chez un VTherm, jamais Confort');
  assert.deepEqual(adapterAuxModes([c('23:00', 'arret')], ['confort', 'confort_1', 'confort_2', 'eco', 'hors_gel']), [c('23:00', 'hors_gel')],
    'un thermostat sans Arrêt : rien de plus froid, le plus froid qu’il comprend');
  assert.deepEqual(adapterAuxModes([c('09:00', 'tiede')], VTHERM), [c('09:00', 'arret')], 'un mode inconnu : le plus froid compris');
  assert.deepEqual(adapterAuxModes([{ h: '06:30', mode: 'confort_1', minute: 390 }], VTHERM), [c('06:30', 'eco')], 'l’heure ne bouge pas');
  assert.deepEqual(adapterAuxModes(TYPE.lun, FROID), TYPE.lun, 'tout compris : rien ne change');
  assert.deepEqual(adapterAuxModes(TYPE.lun, []), TYPE.lun, 'sans mode connu, rien à quoi s’adapter');
  assert.deepEqual(adapterAuxModes(null, VTHERM), []);
  // Toutes les combinaisons de modes : un mode compris, le plus proche sans être plus chaud.
  for (let masque = 1; masque < 64; masque++) {
    const modes = FROID.filter((_, i) => masque & (1 << i));
    adapterAuxModes(tout, modes).forEach((x, i) => {
      const avant = FROID.indexOf(tout[i].mode);
      const permis = modes.map(m => FROID.indexOf(m)).filter(k => k <= avant);
      const attendu = permis.length ? FROID[Math.max(...permis)] : modes[0];
      assert.equal(x.mode, attendu, tout[i].mode + ' chez ' + modes.join(','));
    });
  }
});

test('une semaine entière dans les modes d’un chauffage : jour par jour, jamais plus chaud', () => {
  /* ASSERTIONS RETIRÉES (tâche 10 bis C) : les trois de `copierJourChez` — la
   * copie d'un jour vers un autre chauffage s'en va avec le menu « Copier ce
   * jour vers… », et l'aide avec elle. `semaineAdaptee` reste : toute semaine
   * envoyée, et « Créer un planning », passent par elle. */
  const VTHERM = ['confort', 'eco', 'hors_gel', 'arret'];
  const a = semaineAdaptee(BUREAU, VTHERM);
  assert.deepEqual(Object.keys(a), JOURS);
  assert.deepEqual(a.lun, [c('07:30', 'eco'), c('13:30', 'confort'), c('17:30', 'eco'), c('19:00', 'eco'), c('22:00', 'hors_gel')], '17:30 Confort −1 → Éco');
  assert.deepEqual(a.sam, []);
});

test('− 15 min, + 15 min : un quart d’heure, jamais sur un voisin ni hors de la journée (tâche 10 bis C)', () => {
  const lundi = changementsDuJour(TYPE, 0);   // 06:30, 08:30, 18:00, 22:30
  assert.equal(heureDecalee(lundi, 1, -1), '08:15');
  assert.equal(heureDecalee(lundi, 1, 1), '08:45');
  assert.equal(heureDecalee(lundi, 0, -1), '06:15', 'le premier recule vers minuit');
  assert.equal(heureDecalee(lundi, 3, 1), '22:45', 'le dernier avance vers minuit');
  // Un voisin à un quart d'heure : on le toucherait — rien.
  const serre = changementsDuJour({ lun: [c('08:00', 'confort'), c('08:15', 'eco')] }, 0);
  assert.equal(heureDecalee(serre, 0, 1), null);
  assert.equal(heureDecalee(serre, 1, -1), null);
  assert.equal(heureDecalee(serre, 0, -1), '07:45', 'de l’autre côté, la place est libre');
  // Un voisin plus près qu'un quart d'heure : on passerait par-dessus — rien non plus.
  const proche = changementsDuJour({ lun: [c('08:00', 'confort'), c('08:10', 'eco')] }, 0);
  assert.equal(heureDecalee(proche, 0, 1), null);
  assert.equal(heureDecalee(proche, 1, -1), null);
  // Les bords de la journée : 00:00 ne recule pas, 23:45 et 23:50 n'avancent plus ; 00:15 recule à minuit.
  const bords = changementsDuJour({ lun: [c('00:00', 'eco'), c('12:00', 'confort'), c('23:50', 'eco')] }, 0);
  assert.equal(heureDecalee(bords, 0, -1), null);
  assert.equal(heureDecalee(bords, 2, 1), null);
  assert.equal(heureDecalee(changementsDuJour({ lun: [c('23:45', 'eco')] }, 0), 0, 1), null);
  assert.equal(heureDecalee(changementsDuJour({ lun: [c('00:15', 'eco')] }, 0), 0, -1), '00:00');
  // Une heure hors du quart (06:40) se décale d'un quart, sans se ranger sur la grille.
  assert.equal(heureDecalee(changementsDuJour({ lun: [c('06:40', 'eco')] }, 0), 0, 1), '06:55');
  // Ce qui ne désigne rien : null.
  for (const [liste, index, sens] of [[lundi, 4, 1], [lundi, -1, 1], [lundi, 1.5, 1], [lundi, 1, 0], [lundi, 1, NaN], [null, 0, 1], [[], 0, 1]]) {
    assert.equal(heureDecalee(liste, index, sens), null, JSON.stringify([index, sens]));
  }
  // Le changement décalé ne change jamais de place : l'éditeur le garde déplié, et son bouton garde le focus.
  for (let i = 0; i < lundi.length; i++) {
    for (const sens of [-1, 1]) {
      const h = heureDecalee(lundi, i, sens);
      const apres = changementsDuJour(changerHeure(TYPE, 0, i, h), 0);
      assert.equal(apres[i].h, h, i + ' ' + sens);
    }
  }
});

/* ════════════ L'Historique et les Réglages (tâche 10) ════════════ */

const FAMILLES_PY = readFileSync(new URL('../custom_components/loggia/chauffage_familles.py', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// Lundi 12 octobre 2026, 19:00 à la maison (17:00 UTC) : les 24 h partent du dimanche 17:00 UTC.
const MAINTENANT = Date.parse('2026-10-12T19:00:00+02:00');
const DEPUIS = MAINTENANT - 86400000;
// Un instant, `h` heures après « il y a 24 h », écrit comme Home Assistant l'écrit (UTC, microsecondes).
const iso = (h) => new Date(DEPUIS + h * 3600e3).toISOString().replace('Z', '000+00:00');
const OPTIONS = { confort: 'comfort', confort_1: 'comfort_-1', confort_2: 'comfort_-2', eco: 'eco', hors_gel: 'frost_protection', arret: 'off' };
const FIL = { famille: 'fil_pilote', options: OPTIONS, modes: FROID };
const m = (de, a, mode) => ({ de, a, mode });
const aLaMain = (de, a) => ({ de, a, mode: null, main: true });

test('ce que l’appareil dit : un état muet, ses modes hvac, celui qui chauffe, les préréglages d’un VTherm — comme le serveur', () => {
  for (const s of ['unavailable', 'unknown', 'none', '', null, undefined, 'Unavailable']) assert.equal(estMuet(s), true, String(s));
  for (const s of ['off', 'heat', 'eco', 0]) assert.equal(estMuet(s), false, String(s));
  assert.match(FAMILLES_PY, /^MUETS = frozenset\(\{"unavailable", "unknown", "none", ""\}\)$/m, 'les états muets du serveur');
  assert.deepEqual(modesHvac({ hvac_modes: ['off', 'heat', '', null, 3, 'cool'] }), ['off', 'heat', 'cool']);
  assert.deepEqual(modesHvac(null), []);
  assert.equal(modeDeChauffe({ hvac_modes: ['off', 'auto', 'heat_cool'] }), 'heat_cool', 'heat, sinon heat_cool, sinon auto');
  assert.equal(modeDeChauffe({ hvac_modes: ['off', 'cool'] }), null);
  assert.match(FAMILLES_PY, /^CHAUFFE = \("heat", "heat_cool", "auto"\)$/m);
  assert.deepEqual({ ...PRESETS_VTHERM }, { confort: 'comfort', eco: 'eco', hors_gel: 'frost' });
  assert.match(FAMILLES_PY, /^PRESETS_VTHERM = \{"confort": "comfort", "eco": "eco", "hors_gel": "frost"\}$/m);
});

test('modes appliqués, un fil pilote : l’option de son module, lue à l’envers ; un état muet laisse un trou', () => {
  const points = [
    { entity_id: 'select.radiateur_chambre', state: 'eco', last_changed: iso(-30) },   // avant les 24 h : depuis leur début
    { state: 'comfort', last_changed: iso(11.5) },
    { state: 'eco', last_changed: iso(13.5) },
    { state: 'unavailable', last_changed: iso(17) },
    { state: 'comfort_-1', last_changed: iso(18) },
    { state: 'comfort', last_changed: iso(22) },
  ];
  assert.deepEqual(modesAppliques(points, FIL, MAINTENANT),
    [m(0, 690, 'eco'), m(690, 810, 'confort'), m(810, 1020, 'eco'), m(1080, 1320, 'confort_1'), m(1320, 1440, 'confort')]);
  // Deux lectures du même mode font une bande ; une option que le module ne dit pas pour un mode : à la main.
  assert.deepEqual(modesAppliques([{ state: 'eco', last_changed: iso(0) }, { state: 'eco', last_changed: iso(6) }, { state: 'boost', last_changed: iso(12) }], FIL, MAINTENANT),
    [m(0, 720, 'eco'), aLaMain(720, 1440)]);
  // L'instant du navigateur peut être une date.
  assert.deepEqual(modesAppliques([{ state: 'off', last_changed: iso(-1) }], FIL, new Date(MAINTENANT)), [m(0, 1440, 'arret')]);
});

test('modes appliqués, un VTherm : son préréglage ; `off`, l’Arrêt ; un autre préréglage, à la main', () => {
  const V = { famille: 'vtherm', modes: ['confort', 'eco', 'hors_gel', 'arret'] };
  const points = [
    { state: 'heat', attributes: { preset_mode: 'eco' }, last_changed: iso(-50), last_updated: iso(-2) },
    // Un préréglage qui change n'est pas un changement d'ÉTAT : `last_updated` le date, pas `last_changed`.
    { state: 'heat', attributes: { preset_mode: 'comfort' }, last_changed: iso(-50), last_updated: iso(12) },
    { state: 'heat', attributes: { preset_mode: 'boost' }, last_changed: iso(-50), last_updated: iso(14) },
    { state: 'off', attributes: { preset_mode: 'comfort' }, last_changed: iso(16), last_updated: iso(16) },
    { state: 'heat', attributes: { preset_mode: 'frost' }, last_changed: iso(19), last_updated: iso(19) },
  ];
  assert.deepEqual(modesAppliques(points, V, MAINTENANT),
    [m(0, 720, 'eco'), m(720, 840, 'confort'), aLaMain(840, 960), m(960, 1140, 'arret'), m(1140, 1440, 'hors_gel')]);
});

test('modes appliqués, un thermostat : `off`, l’Arrêt ; sa consigne, le mode qui la lui envoie, à 0,25 °C près ; sinon à la main', () => {
  /* ASSERTIONS MODIFIÉES (relecture de la tâche 10, prise à la tâche 10 bis
   * D) : Home Assistant n'ENREGISTRE pas les attributs fixes d'un `climate`
   * (`hvac_modes`, `target_temp_step`, `min_temp`, `max_temp` —
   * `_entity_component_unrecorded_attributes`) ; les points de ce test les
   * portaient, ils les perdent. Ils viennent de l'état VIVANT (`vivant`), daté
   * de « maintenant » : sa bande, de largeur nulle, ne compte pas. Les bandes
   * attendues ne changent pas. */
  const T = { famille: 'thermostat', modes: FROID, temperatures: { confort: 20.5, eco: 17, hors_gel: 7 } };
  // Ce que le recorder garde d'un point : son état et sa consigne.
  const a = (temperature) => ({ temperature });
  const pt = (h, state, attributes) => ({ state, attributes, last_changed: iso(h), last_updated: iso(h) });
  const vivant = (o = {}) => ({ state: 'heat', attributes: { hvac_modes: ['off', 'heat'], target_temp_step: 0.5, min_temp: 5, max_temp: 35, temperature: 20.5, ...o },
    last_changed: iso(24), last_updated: iso(24) });
  const avec = (o) => ({ vivant: vivant(o) });
  const points = [
    pt(-1, 'heat', a(17)),     // Éco
    pt(6, 'heat', a(20.5)),    // Confort
    pt(8, 'heat', a(19.5)),    // Confort −1 : max(20,5 − 1, 17)
    pt(10, 'heat', a(18.5)),   // Confort −2
    pt(12, 'heat', a(20.6)),   // le Confort, à 0,1 près
    pt(14, 'heat', a(21)),     // une consigne posée ailleurs : à la main
    pt(16, 'off', a(21)),      // l'Arrêt
    pt(18, 'heat', a(7)),      // Hors-gel
  ];
  assert.deepEqual(modesAppliques(points, T, MAINTENANT, 'C', avec()), [m(0, 360, 'eco'), m(360, 480, 'confort'), m(480, 600, 'confort_1'),
    m(600, 720, 'confort_2'), m(720, 840, 'confort'), aLaMain(840, 960), m(960, 1080, 'arret'), m(1080, 1440, 'hors_gel')]);
  // Hors de son mode qui chauffe — il refroidit, ou suit son propre programme — : à la main, même à la bonne consigne.
  const reversible = avec({ hvac_modes: ['off', 'heat', 'cool', 'heat_cool'] });
  assert.deepEqual(modesAppliques([pt(0, 'heat', a(20.5))], T, MAINTENANT, 'C', reversible), [m(0, 1440, 'confort')]);
  assert.deepEqual(modesAppliques([pt(0, 'cool', a(20.5))], T, MAINTENANT, 'C', reversible), [aLaMain(0, 1440)]);
  // Sans consigne lisible (une plage `heat_cool`) : à la main.
  assert.deepEqual(modesAppliques([pt(0, 'heat', a(null))], T, MAINTENANT, 'C', avec()), [aLaMain(0, 1440)]);
  // La consigne que le moteur ENVOIE, au pas de l'appareil : un poêle au degré reçoit 21 pour un Confort de 20,5.
  assert.deepEqual(modesAppliques([pt(0, 'heat', a(21))], T, MAINTENANT, 'C', avec({ target_temp_step: 1 })), [m(0, 1440, 'confort')]);
  // En °F : 17 °C font 62,6 °F, envoyés au degré — 63 °F, l'Éco.
  assert.deepEqual(modesAppliques([pt(0, 'heat', a(63))], T, MAINTENANT, 'F', avec({ target_temp_step: undefined, min_temp: 41, max_temp: 95 })), [m(0, 1440, 'eco')]);
  // Deux modes à la même consigne (Confort −2 vaut l'Éco quand ils sont proches) : le mode réglé l'emporte.
  assert.deepEqual(modesAppliques([pt(0, 'heat', a(19))], { ...T, temperatures: { confort: 20, eco: 19, hors_gel: 7 } }, MAINTENANT, 'C', avec()), [m(0, 1440, 'eco')]);
  // Jamais réglé : les températures par défaut (20, 17, 7).
  assert.deepEqual(modesAppliques([pt(0, 'heat', a(20))], { ...T, temperatures: null }, MAINTENANT, 'C', avec()), [m(0, 1440, 'confort')]);
});

/* Relecture de la tâche 10, prise à la tâche 10 bis D (constat IMPORTANT) :
 * les quatre cas d'une vraie maison que les attributs fixes manquants
 * faisaient lire de travers. Chaque fois, le témoin SANS l'état vivant — ce
 * que la fiche lisait — puis la lecture juste. */
test('modes appliqués : les attributs fixes viennent de l’état VIVANT, jamais sa consigne — les quatre cas d’une vraie maison', () => {
  const T = { famille: 'thermostat', modes: FROID, temperatures: { confort: 20.5, eco: 17, hors_gel: 7 } };
  const pt = (h, state, attributes) => ({ state, attributes, last_changed: iso(h), last_updated: iso(h) });
  const vivant = (attributes, state = 'heat') => ({ state, attributes, last_changed: iso(24), last_updated: iso(24) });
  const lire = (points, v, unite = 'C') => modesAppliques(points, T, MAINTENANT, unite, { vivant: v });
  // Une clim en `cool` à la consigne du Confort : elle refroidit, ce n'est pas le Confort.
  const clim = [pt(0, 'cool', { temperature: 20.5 })];
  assert.deepEqual(lire(clim, null), [m(0, 1440, 'confort')], 'témoin : sans ses hvac_modes, le point seul se lisait « Confort »');
  assert.deepEqual(lire(clim, vivant({ hvac_modes: ['off', 'heat', 'cool', 'heat_cool', 'dry'] }, 'cool')), [aLaMain(0, 1440)]);
  // Un thermostat sur son PROPRE programme (`auto`) à 17° : il n'obéit pas au planning, ce n'est pas l'Éco.
  const programme = [pt(0, 'auto', { temperature: 17 })];
  assert.deepEqual(lire(programme, null), [m(0, 1440, 'eco')], 'témoin : « Éco »');
  assert.deepEqual(lire(programme, vivant({ hvac_modes: ['off', 'heat', 'auto'] }, 'auto')), [aLaMain(0, 1440)]);
  // Un poêle au degré : le Confort de 20,5 lui part à 21.
  const poele = [pt(0, 'heat', { temperature: 21 })];
  assert.deepEqual(lire(poele, null), [aLaMain(0, 1440)], 'témoin : « à la main »');
  assert.deepEqual(lire(poele, vivant({ hvac_modes: ['off', 'heat'], target_temp_step: 1 })), [m(0, 1440, 'confort')]);
  // Un Hors-gel sous `min_temp` : 7° lui partent à 10, sa borne.
  const horsGel = [pt(0, 'heat', { temperature: 10 })];
  assert.deepEqual(lire(horsGel, null), [aLaMain(0, 1440)], 'témoin : « à la main »');
  assert.deepEqual(lire(horsGel, vivant({ hvac_modes: ['off', 'heat'], min_temp: 10, max_temp: 30 })), [m(0, 1440, 'hors_gel')]);
  /* Jamais une `temperature` vivante : elle deviendrait la consigne d'un point
   * qui n'en a pas. L'appareil vit en Confort (20,5) ; le point sans consigne
   * reste « à la main ». */
  assert.deepEqual(lire([pt(0, 'heat', {})], vivant({ hvac_modes: ['off', 'heat'], temperature: 20.5, current_temperature: 19 })), [aLaMain(0, 1440)]);
  // Les quatre clés seulement — et celles d'un point l'emportent sur les vivantes.
  assert.deepEqual(lire([pt(0, 'heat', { temperature: 21, target_temp_step: 0.5 })], vivant({ target_temp_step: 1 })), [aLaMain(0, 1440)], 'le pas du point');
});

test('modes appliqués : l’état VIVANT est le dernier point — le recorder écrit par lots, la bande ne reste pas sur l’ancien mode', () => {
  const points = [{ entity_id: 'select.radiateur_chambre', state: 'eco', last_changed: iso(-3) }, { state: 'comfort', last_changed: iso(10) }];
  // La requête partie au changement ne contenait pas l'Éco de 23:00 : sans l'état vivant, le Confort jusqu'à maintenant.
  assert.deepEqual(modesAppliques(points, FIL, MAINTENANT), [m(0, 600, 'eco'), m(600, 1440, 'confort')], 'témoin');
  const vivant = { state: 'eco', attributes: { options: ['comfort', 'eco'] }, last_changed: iso(23), last_updated: iso(23) };
  assert.deepEqual(modesAppliques(points, FIL, MAINTENANT, 'C', { vivant }), [m(0, 600, 'eco'), m(600, 1380, 'confort'), m(1380, 1440, 'eco')]);
  // Un état vivant qui n'a pas bougé depuis avant la période : toute la période (l'historique était vide).
  assert.deepEqual(modesAppliques([], FIL, MAINTENANT, 'C', { vivant: { ...vivant, last_changed: iso(-50), last_updated: iso(-50) } }), [m(0, 1440, 'eco')]);
  // Daté d'après « maintenant » (une horloge en avance) : ramené à maintenant — rien ne déborde.
  assert.deepEqual(modesAppliques(points, FIL, MAINTENANT, 'C', { vivant: { ...vivant, last_updated: iso(30) } }), [m(0, 600, 'eco'), m(600, 1440, 'confort')]);
  // Sans historique lisible, l'état vivant ne suffit pas à inventer la période : rien.
  for (const lu of [null, 'erreur', undefined]) assert.deepEqual(modesAppliques(lu, FIL, MAINTENANT, 'C', { vivant }), [], String(lu));
});

test('modes appliqués : des points dans le DÉSORDRE se rangent par instant', () => {
  const dans = [
    { entity_id: 'select.radiateur_chambre', state: 'eco', last_changed: iso(-30) },
    { state: 'comfort', last_changed: iso(11.5) },
    { state: 'eco', last_changed: iso(13.5) },
    { state: 'comfort_-1', last_changed: iso(18) },
  ];
  const attendu = [m(0, 690, 'eco'), m(690, 810, 'confort'), m(810, 1080, 'eco'), m(1080, 1440, 'confort_1')];
  assert.deepEqual(modesAppliques(dans, FIL, MAINTENANT), attendu, 'témoin : dans l’ordre');
  for (const ordre of [[3, 1, 0, 2], [2, 3, 1, 0], [1, 0, 3, 2]]) {
    assert.deepEqual(modesAppliques(ordre.map(i => dans[i]), FIL, MAINTENANT), attendu, String(ordre));
  }
});

test('modes appliqués sur SEPT jours : une période de 0 à 10 080 minutes', () => {
  const debut7 = MAINTENANT - 7 * 86400000;
  const iso7 = (h) => new Date(debut7 + h * 3600e3).toISOString().replace('Z', '000+00:00');
  const points = [
    { entity_id: 'select.radiateur_chambre', state: 'frost_protection', last_changed: iso7(-10) },   // avant les sept jours
    { state: 'eco', last_changed: iso7(24) },        // un jour après le début
    { state: 'comfort', last_changed: iso7(150) },
    { state: 'off', last_changed: iso7(160) },
  ];
  assert.deepEqual(modesAppliques(points, FIL, MAINTENANT, 'C', { jours: 7 }),
    [m(0, 1440, 'hors_gel'), m(1440, 9000, 'eco'), m(9000, 9600, 'confort'), m(9600, 10080, 'arret')]);
  // Le même historique sur 24 h : ce qui précède la veille est ramené au début.
  assert.deepEqual(modesAppliques(points, FIL, MAINTENANT), [m(0, 360, 'eco'), m(360, 960, 'confort'), m(960, 1440, 'arret')]);
  for (const jours of [0, -1, NaN, 'sept']) assert.deepEqual(modesAppliques(points, FIL, MAINTENANT, 'C', { jours }), [], String(jours));
});

/* ════════════ Le mode qui sera APPLIQUÉ (relecture de la partie B, point d) ════════════ */

const DEMO_JS = readFileSync(new URL('../src/demo.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('le jumeau écran de `mode_applicable` : les replis du serveur, lus dans chauffage_familles.py — et ceux de la démo', () => {
  // La table du serveur, lue dans le fichier : {mode: (replis, …)}.
  const bloc = /^REPLIS = \{([\s\S]*?)\}$/m.exec(FAMILLES_PY);
  assert.ok(bloc, 'REPLIS introuvable dans chauffage_familles.py');
  const py = Object.fromEntries([...bloc[1].matchAll(/"(\w+)": \(([^)]*)\)/g)].map(x => [x[1], [...x[2].matchAll(/"(\w+)"/g)].map(y => y[1])]));
  assert.deepEqual(Object.keys(py).sort(), [...FROID].sort(), 'un repli par mode');
  assert.deepEqual(Object.fromEntries(Object.entries(REPLIS).map(([k, v]) => [k, [...v]])), py, 'l’écran');
  assert.ok(Object.isFrozen(REPLIS) && Object.values(REPLIS).every(Object.isFrozen));
  // La démo garde son jumeau (elle n'importe pas la fiche : le démarrage n'en grossit pas) — tenu égal ici.
  const demo = /^const REPLIS_CHA = \{([^}]*)\};$/m.exec(DEMO_JS);
  assert.ok(demo, 'REPLIS_CHA introuvable dans demo.js');
  const js = Object.fromEntries([...demo[1].matchAll(/(\w+): \[([^\]]*)\]/g)].map(x => [x[1], [...x[2].matchAll(/'(\w+)'/g)].map(y => y[1])]));
  assert.deepEqual(js, py, 'la démo');
  assert.ok(DEMO_JS.includes('const modeApplicableCha = (mode, permis) => (permis.includes(mode) ? mode'), 'la règle de la démo');
  // La règle du serveur : le mode s'il est compris, sinon son premier repli compris, sinon rien.
  const PY_FN = FAMILLES_PY.slice(FAMILLES_PY.indexOf('def mode_applicable('), FAMILLES_PY.indexOf('def temperature_du_mode('));
  assert.ok(PY_FN.includes('if mode in permis:\n        return mode') && PY_FN.includes('for repli in REPLIS.get(mode, ()):') && PY_FN.includes('return None'), PY_FN);
  assert.equal(modeApplicable('eco', ['confort', 'eco', 'arret']), 'eco');
  assert.equal(modeApplicable('eco', ['confort', 'hors_gel', 'arret']), 'hors_gel', 'un module sans Éco : son Hors-gel');
  assert.equal(modeApplicable('arret', ['confort', 'eco', 'hors_gel']), 'hors_gel', 'un thermostat sans `off` : le Hors-gel');
  assert.equal(modeApplicable('arret', ['confort', 'eco']), 'eco');
  assert.equal(modeApplicable('confort_2', ['confort', 'eco']), 'confort', 'un VTherm : Confort −2 devient le Confort');
  assert.equal(modeApplicable('confort_2', ['confort_1', 'confort']), 'confort_1');
  assert.equal(modeApplicable('confort', ['eco', 'arret']), null, 'le Confort ne se replie jamais');
  for (const [mode, permis] of [['tiede', FROID], [null, FROID], ['constructor', FROID], ['eco', null], ['eco', 'eco']]) {
    assert.equal(modeApplicable(mode, permis), null, String(mode) + ' / ' + String(permis));
  }
});

test('le mode APPLIQUÉ d’un chauffage : ses modes (ceux que le serveur lui reconnaît, sa famille comprise) ; sans modes, le mode voulu', () => {
  assert.equal(modeApplique({ modes: ['confort', 'hors_gel', 'arret'] }, 'eco'), 'hors_gel');
  assert.equal(modeApplique({ modes: FROID }, 'eco'), 'eco');
  assert.equal(modeApplique({ modes: ['confort', 'eco', 'hors_gel', 'arret'] }, 'confort_1'), 'confort', 'un VTherm');
  assert.equal(modeApplique({ modes: ['confort', 'eco'] }, 'confort'), 'confort');
  // Sans modes connus (un serveur d'avant, un chauffage sans état) : le mode voulu, comme `applique || mode`.
  for (const modes of [[], null, undefined]) assert.equal(modeApplique({ modes }, 'eco'), 'eco', String(modes));
  assert.equal(modeApplique({ modes: FROID }, null), null);
  assert.equal(modeApplique(null, 'eco'), 'eco');
});

/* ════════════ L'Historique de sa maquette (tâche 10 bis D, cadre 3d) ════════════ */

test('les deux périodes : 24 h au quart d’heure, 7 jours à l’heure', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(PERIODES)), { '24h': { jours: 1, pas: 15 }, '7j': { jours: 7, pas: 60 } });
  assert.ok(Object.isFrozen(PERIODES) && Object.values(PERIODES).every(Object.isFrozen));
});

// Une mesure de la pièce, comme le recorder la rend (au format minimal : l'état seul).
const mesure = (h, state) => ({ state, last_changed: iso(h) });
const lireEtat = (e) => { const n = Number(e.state); return e.state !== '' && Number.isFinite(n) ? n : null; };

test('la courbe en ESCALIER : la dernière valeur connue à chaque quart d’heure — avant la première, ou après l’illisible, un trou', () => {
  const points = [mesure(2, '19.8'), mesure(4.1, '20.4'), mesure(6, 'unavailable'), mesure(7, '21.2')];
  const e = echantillons(points, MAINTENANT, { jours: 1, pas: 15, lire: lireEtat });
  assert.equal(e.length, 97, 'de « il y a 24 h » à « maintenant », bornes comprises');
  assert.equal(e[0].t, DEPUIS);
  assert.equal(e[96].t, MAINTENANT);
  assert.ok(e.every((x, i) => x.t === DEPUIS + i * 15 * 60000), 'un quart d’heure entre deux');
  const v = e.map(x => x.v);
  assert.deepEqual(v.slice(0, 8), Array(8).fill(null), 'avant la première mesure : rien d’inventé');
  assert.deepEqual(v.slice(8, 17), Array(9).fill(19.8), '02:00 → 04:00, jusqu’à 04:06 compris');
  assert.deepEqual(v.slice(17, 24), Array(7).fill(20.4), 'la valeur de 04:06 au quart suivant');
  assert.deepEqual(v.slice(24, 28), Array(4).fill(null), 'un capteur muet : un trou');
  assert.deepEqual(v.slice(28), Array(69).fill(21.2));
  // L'état VIVANT est le dernier point.
  const vivant = { state: '19.46', last_changed: iso(23.9), last_updated: iso(23.9) };
  assert.deepEqual(echantillons(points, MAINTENANT, { lire: lireEtat, vivant }).map(x => x.v).slice(-2), [21.2, 19.46]);
  // Dans le désordre : rangés.
  assert.deepEqual(echantillons([...points].reverse(), MAINTENANT, { lire: lireEtat }).map(x => x.v), v);
  // Une valeur que `lire` ne rend pas en nombre fini : un trou.
  assert.deepEqual(echantillons([mesure(0, '20')], MAINTENANT, { lire: () => Infinity }).map(x => x.v), Array(97).fill(null));
  // Rien à lire : rien.
  for (const o of [{ lire: null }, { lire: lireEtat, pas: 0 }, { lire: lireEtat, jours: 0 }]) assert.deepEqual(echantillons(points, MAINTENANT, o), [], JSON.stringify(o));
  assert.deepEqual(echantillons(points, NaN, { lire: lireEtat }), []);
  assert.equal(echantillons(null, MAINTENANT, { lire: lireEtat }).filter(x => x.v !== null).length, 0, 'sans historique : que des trous');
});

test('la courbe sur 7 jours : un point par heure, 169 en tout', () => {
  const e = echantillons([mesure(-200, '20')], MAINTENANT, { jours: 7, pas: 60, lire: lireEtat });
  assert.equal(e.length, 169);
  assert.equal(e[0].t, MAINTENANT - 7 * 86400000);
  assert.ok(e.every((x, i) => x.t === e[0].t + i * 3600e3 && x.v === 20));
});

test('l’échelle de la maquette (`chart`) : min et max des mesures et des consignes, ± 0,3, arrondis au degré, un écart pair', () => {
  const serie = (...vs) => vs.map((v, i) => ({ t: i, v }));
  // 19,4 → 19,1 → 19 ; 21,2 → 21,5 → 22 ; l'écart (3) devient pair : 23.
  const c = courbe(serie(19.8, 19.4, 21.2, 20.6));
  assert.deepEqual([c.lo, c.hi, c.mn, c.mx], [19, 23, 19.4, 21.2]);
  // Une consigne plus basse élargit l'échelle ; elle ne change ni le min ni le max de la pièce.
  const t = courbe(serie(19.8, 21), serie(17, 20.5));
  assert.deepEqual([t.lo, t.hi, t.mn, t.mx], [16, 22, 19.8, 21]);
  // Une pièce qui ne bouge pas : au milieu d'une échelle de deux degrés.
  const plat = courbe(serie(21, 21, 21));
  assert.deepEqual([plat.lo, plat.hi], [20, 22]);
  assert.equal(plat.ligne, 'M0.0 60.0L200.0 60.0L400.0 60.0');
  // L'arrondi du flottant ne pousse pas d'un degré : 32,3 − 0,3 vaut 31,999 999 999 999 996 en machine, et 32 ici.
  assert.deepEqual([courbe(serie(32.3, 33)).lo, courbe(serie(32.3, 33)).hi], [32, 34]);
  // Moins de deux mesures : pas de courbe.
  for (const s of [serie(), serie(20), serie(null, 20, null), null]) assert.equal(courbe(s), null, JSON.stringify(s));
});

test('la courbe dans son SVG de 400 × 120 : la mesure, son aire — coupées par un trou —, la consigne en escalier, coupée quand il est éteint', () => {
  const serie = (...vs) => vs.map((v, i) => ({ t: i, v }));
  // Cinq points de 0 à 400 ; l'échelle de 19 à 23 : Y(21) = 60, Y(20) = 90, Y(22) = 30.
  const c = courbe(serie(20, 21, null, 22, 21), serie(21, 21, null, 22, 22));
  assert.deepEqual([c.lo, c.hi], [19, 23]);
  assert.equal(c.ligne, 'M0.0 90.0L100.0 60.0M300.0 30.0L400.0 60.0', 'deux morceaux : le trou coupe la ligne');
  assert.equal(c.aire, 'M0.0 90.0L100.0 60.0L100.0 120L0.0 120ZM300.0 30.0L400.0 60.0L400.0 120L300.0 120Z', 'chaque morceau fermé jusqu’en bas');
  // L'escalier : à chaque échantillon, l'horizontale puis la marche ; un trou le coupe.
  assert.equal(c.consigne, 'M0.0 60.0L100.0 60.0L100.0 60.0M300.0 30.0L400.0 30.0L400.0 30.0');
  const marche = courbe(serie(20, 20, 20), serie(20, 21, 21));
  assert.equal(marche.consigne, 'M0.0 90.0L200.0 90.0L200.0 60.0L400.0 60.0L400.0 60.0', 'la marche monte à l’échantillon');
  // Sans consigne (un fil pilote, un VTherm) : rien.
  assert.equal(courbe(serie(20, 21)).consigne, '');
});

test('la chauffe d’un thermostat : LA règle des cartes (`heating`, `preheating`), `off` ne chauffe pas — un état muet ou une action tue, un trou', () => {
  const pt = (h, state, attributes) => ({ state, attributes, last_changed: iso(-30), last_updated: iso(h) });
  const points = [
    pt(-6, 'heat', { hvac_action: 'heating' }),
    pt(6, 'heat', { hvac_action: 'heating' }),
    pt(10, 'heat', { hvac_action: 'idle' }),
    pt(14, 'off', { hvac_action: 'off' }),
    pt(16, 'heat', { hvac_action: 'preheating' }),
    pt(18, 'heat', {}),                 // il ne dit pas ce qu'il fait : on ne sait pas
    pt(20, 'unavailable', {}),
    pt(22, 'off', {}),                  // éteint : il ne chauffe pas, même sans action
  ];
  const b = (de, a, chauffe) => ({ de, a, chauffe });
  assert.deepEqual(chauffeAppliquee(points, MAINTENANT), [b(0, 600, true), b(600, 960, false), b(960, 1080, true), b(1320, 1440, false)]);
  // L'état vivant en dernier ; sur 7 jours, la période entière.
  const vivant = { state: 'heat', attributes: { hvac_action: 'heating' }, last_changed: iso(23), last_updated: iso(23) };
  assert.deepEqual(chauffeAppliquee(points, MAINTENANT, { vivant }).at(-1), b(1380, 1440, true));
  assert.deepEqual(chauffeAppliquee([pt(-6, 'heat', { hvac_action: 'heating' })], MAINTENANT, { jours: 7 }), [b(8280, 10080, true)]);
  for (const lu of [[], null, 'erreur']) assert.deepEqual(chauffeAppliquee(lu, MAINTENANT), [], String(lu));
});

test('le temps passé : par mode, de l’Arrêt au Confort, puis « à la main » ; la chauffe et le reste — un trou ne compte nulle part', () => {
  const bandes = [m(0, 690, 'eco'), m(690, 810, 'confort'), m(810, 1020, 'eco'), m(1080, 1170, 'confort_1'), m(1170, 1215, 'arret'), aLaMain(1320, 1440)];
  assert.deepEqual(tempsParMode(bandes), [{ mode: 'arret', minutes: 45 }, { mode: 'eco', minutes: 900 }, { mode: 'confort_1', minutes: 90 },
    { mode: 'confort', minutes: 120 }, { mode: null, minutes: 120 }]);
  assert.deepEqual(tempsParMode([]), []);
  assert.deepEqual(tempsParMode(null), []);
  const b = (de, a, chauffe) => ({ de, a, chauffe });
  assert.deepEqual(tempsDeChauffe([b(0, 600, true), b(600, 960, false), b(960, 1080, true), b(1320, 1440, false)]), { chauffe: 720, sans: 480 });
  assert.deepEqual(tempsDeChauffe(null), { chauffe: 0, sans: 0 });
});

test('la place d’une bande sur la période : en % au centième — 0,6 % au moins, sans sortir à droite', () => {
  assert.deepEqual(placeBande({ de: 0, a: 690 }, 1), { left: '0.00%', width: '47.92%' });
  assert.deepEqual(placeBande({ de: 1215, a: 1320 }, 1), { left: '84.38%', width: '7.29%' });
  assert.deepEqual(placeBande({ de: 600, a: 602 }, 1), { left: '41.67%', width: '0.60%' }, 'deux minutes : la largeur de la maquette au moins');
  assert.deepEqual(placeBande({ de: 1439, a: 1440 }, 1), { left: '99.40%', width: '0.60%' }, 'au bout : ramenée dans la piste');
  assert.deepEqual(placeBande({ de: 1440, a: 2880 }, 7), { left: '14.29%', width: '14.29%' }, 'sur 7 jours');
});

test('modes appliqués : un historique vide ou illisible, rien à quoi le rapporter — aucune bande inventée', () => {
  for (const points of [[], null, undefined, 'erreur', [null, 'x', { state: 'eco' }, { state: 'eco', last_changed: 'hier' }]]) {
    assert.deepEqual(modesAppliques(points, FIL, MAINTENANT), [], String(points));
  }
  assert.deepEqual(modesAppliques([{ state: 'eco', last_changed: iso(1) }], null, MAINTENANT), []);
  assert.deepEqual(modesAppliques([{ state: 'eco', last_changed: iso(1) }], FIL, NaN), []);
  assert.deepEqual(modesAppliques([{ state: 'unavailable', last_changed: iso(1) }, { state: 'unknown', last_changed: iso(5) }], FIL, MAINTENANT), [], 'tout muet : un trou');
  assert.deepEqual(modesAppliques([{ state: 'heat', last_changed: iso(1) }], { famille: 'autre' }, MAINTENANT), [], 'une famille inconnue');
  // Un instant à venir (une horloge en avance) ne déborde pas de « maintenant ».
  assert.deepEqual(modesAppliques([{ state: 'eco', last_changed: iso(20) }, { state: 'comfort', last_changed: iso(30) }], FIL, MAINTENANT), [m(1200, 1440, 'eco')]);
});

test('les températures des modes : la copie des défauts du serveur ; Confort −1 et −2 jamais sous l’Éco', () => {
  const py = /^TEMPERATURES_DEFAUT = \{"confort": ([\d.]+), "eco": ([\d.]+), "hors_gel": ([\d.]+)\}$/m.exec(FAMILLES_PY);
  assert.ok(py, 'TEMPERATURES_DEFAUT introuvable dans chauffage_familles.py');
  assert.deepEqual({ ...TEMPERATURES_DEFAUT }, { confort: Number(py[1]), eco: Number(py[2]), hors_gel: Number(py[3]) });
  assert.ok(Object.isFrozen(TEMPERATURES_DEFAUT));
  assert.deepEqual(temperaturesDe(null), { confort: 20, eco: 17, hors_gel: 7 });
  assert.deepEqual(temperaturesDe({ confort: 21.5, eco: 'froid', hors_gel: NaN, autre: 3 }), { confort: 21.5, eco: 17, hors_gel: 7 }, 'l’illisible reprend son défaut');
  const t = { confort: 20, eco: 17, hors_gel: 7 };
  assert.deepEqual(['confort', 'confort_1', 'confort_2', 'eco', 'hors_gel', 'arret', 'tiede'].map(x => temperatureDuMode(x, t)), [20, 19, 18, 17, 7, null, null]);
  assert.deepEqual(['confort_1', 'confort_2'].map(x => temperatureDuMode(x, { confort: 20, eco: 19.5, hors_gel: 7 })), [19.5, 19.5], '`temperature_du_mode` : jamais sous l’Éco');
  assert.ok(FAMILLES_PY.includes('return max(t["confort"] - 1, t["eco"])') && FAMILLES_PY.includes('return max(t["confort"] - 2, t["eco"])'));
});

test('un cran sur une température : les trois, au demi-degré, l’ordre et les bornes du serveur vérifiés sur place', () => {
  assert.match(PY, /^TEMPERATURE_MIN = 5\.0$/m);
  assert.match(PY, /^TEMPERATURE_MAX = 30\.0$/m);
  const t = { confort: 20, eco: 17, hors_gel: 7 };
  assert.deepEqual(pasTemperature(t, 'eco', 1), { confort: 20, eco: 17.5, hors_gel: 7 });
  assert.deepEqual(pasTemperature(t, 'confort', -1), { confort: 19.5, eco: 17, hors_gel: 7 });
  assert.deepEqual(pasTemperature(null, 'hors_gel', 1), { confort: 20, eco: 17, hors_gel: 7.5 }, 'jamais réglé : depuis les défauts');
  assert.deepEqual(pasTemperature({ confort: 20.2, eco: 17, hors_gel: 7 }, 'confort', 1), { confort: 20.5, eco: 17, hors_gel: 7 }, 'sur la grille du demi-degré');
  assert.equal(t.eco, 17, 'les températures reçues ne sont pas touchées');
  // L'ordre du serveur : Éco au plus Confort — l'égalité est permise —, Hors-gel strictement sous l'Éco.
  assert.deepEqual(pasTemperature({ confort: 20, eco: 19.5, hors_gel: 7 }, 'eco', 1), { confort: 20, eco: 20, hors_gel: 7 });
  assert.deepEqual(pasTemperature({ confort: 20, eco: 20, hors_gel: 7 }, 'eco', 1), { refus: 'desordre' });
  assert.deepEqual(pasTemperature({ confort: 20, eco: 20, hors_gel: 7 }, 'confort', -1), { refus: 'desordre' });
  assert.deepEqual(pasTemperature({ confort: 20, eco: 7.5, hors_gel: 7 }, 'eco', -1), { refus: 'desordre' });
  assert.deepEqual(pasTemperature({ confort: 20, eco: 7.5, hors_gel: 7 }, 'hors_gel', 1), { refus: 'desordre' });
  // Les bornes : de 5 à 30 °C.
  assert.deepEqual(pasTemperature({ confort: 30, eco: 17, hors_gel: 7 }, 'confort', 1), { refus: 'bornes' });
  assert.deepEqual(pasTemperature({ confort: 20, eco: 17, hors_gel: 5 }, 'hors_gel', -1), { refus: 'bornes' });
  for (const [cle, sens] of [['arret', 1], ['confort_1', 1], ['eco', 0], ['eco', NaN]]) assert.equal(pasTemperature(t, cle, sens), null, cle + ' ' + sens);
});

/* Relecture de la tâche 10, prise à la tâche 10 bis C : le serveur range les
 * TROIS consignes au demi-degré avant de juger leur ordre (`valider_temperatures`,
 * `round(v * 2) / 2`). Un Hors-gel venu d'ailleurs à 16,8 passait la
 * vérification de l'écran (16,8 < 17) et le serveur refusait le patch (17 n'est
 * pas sous 17). */
test('un cran sur une température : les trois d’abord sur la grille du demi-degré, comme le serveur — puis l’ordre', () => {
  const PY_TEMP = PY.slice(PY.indexOf('def valider_temperatures('), PY.indexOf('def valider_chauffage('));
  assert.ok(PY_TEMP.includes('t[cle] = round(float(v) * 2) / 2') && PY_TEMP.indexOf('round(float(v) * 2) / 2') < PY_TEMP.indexOf('_cle_en_desordre(t, brut)'),
    'le serveur arrondit, puis juge l’ordre');
  // 16,8 devient 17 : le Hors-gel rejoint l'Éco — refusé ici, comme là-bas.
  assert.deepEqual(pasTemperature({ confort: 20, eco: 17, hors_gel: 16.8 }, 'confort', 1), { refus: 'desordre' });
  // Rangées, elles partent rangées : l'Éco à 16,8 part à 17, le Hors-gel à 7,2 à 7.
  assert.deepEqual(pasTemperature({ confort: 20, eco: 16.8, hors_gel: 7.2 }, 'confort', 1), { confort: 20.5, eco: 17, hors_gel: 7 });
  // `round` de Python arrondit au pair : 16,25 donne 16, 16,75 donne 17 — l'écran aussi.
  assert.deepEqual(pasTemperature({ confort: 20, eco: 16.25, hors_gel: 7 }, 'confort', 1), { confort: 20.5, eco: 16, hors_gel: 7 });
  assert.deepEqual(pasTemperature({ confort: 20, eco: 16.75, hors_gel: 7 }, 'confort', 1), { confort: 20.5, eco: 17, hors_gel: 7 });
  // Le cran part de la consigne rangée : 20,25 (rangée à 20) monte à 20,5.
  assert.deepEqual(pasTemperature({ confort: 20.25, eco: 17, hors_gel: 7 }, 'confort', 1), { confort: 20.5, eco: 17, hors_gel: 7 });
  // Rien d'autre ne change : des consignes déjà rangées partent telles quelles.
  assert.deepEqual(pasTemperature({ confort: 20, eco: 17, hors_gel: 7 }, 'hors_gel', -1), { confort: 20, eco: 17, hors_gel: 6.5 });
});

test('la consigne qu’un mode envoie à un thermostat : au pas de l’appareil, chaque demi vers le haut, dans ses bornes', () => {
  assert.equal(consigneEnUnite(20.5, { target_temp_step: 1 }, 'C'), 21, 'un poêle au degré');
  assert.equal(consigneEnUnite(20.25, { target_temp_step: 0.5 }, 'C'), 20.5);
  assert.equal(consigneEnUnite(20.2, {}, 'C'), 20, 'sans pas publié : 0,5 °C');
  assert.equal(consigneEnUnite(17, {}, 'F'), 63, '62,6 °F, au degré');
  assert.equal(consigneEnUnite(7, { min_temp: 10 }, 'C'), 10, 'dans ses bornes');
  assert.equal(consigneEnUnite(32, { max_temp: 30 }, 'C'), 30);
  assert.equal(consigneEnUnite(null, {}, 'C'), null);
  assert.ok(FAMILLES_PY.includes('valeur = math.floor(depuis_celsius(celsius, unite) / pas + 0.5) * pas'), 'la règle du serveur');
});

test('la plage d’un appareil en heat_cool : un pas de l’appareil, dans ses bornes, la basse sous la haute', () => {
  const a = { target_temp_step: 0.5, min_temp: 16, max_temp: 30 };
  assert.deepEqual(plageVoisine({ bas: 19, haut: 24 }, 'bas', 1, a, 'C'), { bas: 19.5, haut: 24 });
  assert.deepEqual(plageVoisine({ bas: 19, haut: 24 }, 'haut', -1, a, 'C'), { bas: 19, haut: 23.5 });
  assert.equal(plageVoisine({ bas: 16, haut: 24 }, 'bas', -1, a, 'C'), null, 'à sa borne basse');
  assert.equal(plageVoisine({ bas: 19, haut: 30 }, 'haut', 1, a, 'C'), null, 'à sa borne haute');
  assert.equal(plageVoisine({ bas: 23.5, haut: 24 }, 'bas', 1, a, 'C'), null, 'la basse ne rejoint pas la haute');
  assert.equal(plageVoisine({ bas: 23.5, haut: 24 }, 'haut', -1, a, 'C'), null);
  assert.deepEqual(plageVoisine({ bas: 66, haut: 75 }, 'haut', 1, {}, 'F'), { bas: 66, haut: 76 }, 'en °F, sans pas publié : le degré');
  assert.deepEqual(plageVoisine({ bas: 19.3, haut: 24 }, 'bas', 1, a, 'C'), { bas: 20, haut: 24 }, 'sur la grille du pas');
  for (const [p, bord, sens] of [[null, 'bas', 1], [{ bas: 19, haut: 24 }, 'milieu', 1], [{ bas: 19, haut: 24 }, 'bas', 0]]) {
    assert.equal(plageVoisine(p, bord, sens, a, 'C'), null);
  }
});

/* ════════════ Relecture de la partie D : le poids de l'historique, le prochain changement appliqué ════════════ */

test('un historique DATÉ ET RANGÉ une fois (`dater`) : les mêmes résultats, sans relire un instant — sept jours d’un `climate`, des milliers de lignes', () => {
  // Chaque lecture d'un instant se compte : `dater` les lit une fois ; les calculs qui suivent, plus jamais.
  let lus = 0;
  const pt = (h, state, attributes) => {
    const e = { state, attributes };
    Object.defineProperty(e, 'last_updated', { enumerable: true, get: () => { lus += 1; return iso(h); } });
    return e;
  };
  const points = [pt(18, 'heat', { hvac_action: 'idle', temperature: 20.5, current_temperature: 20.4 }), pt(-6, 'heat', { hvac_action: 'heating', temperature: 17, current_temperature: 18.5 }),
    pt(6, 'off', { hvac_action: 'off', temperature: 17, current_temperature: 19 }), pt(12, 'heat', { temperature: 20.5, current_temperature: 19.2 })];
  const d = dater(points);
  assert.equal(lus, points.length, 'chaque instant lu une fois');
  assert.deepEqual(d.liste.map(x => x.e.state), ['heat', 'off', 'heat', 'heat'], 'rangés par instant');
  const T = { famille: 'thermostat', modes: FROID, temperatures: { confort: 20.5, eco: 17, hors_gel: 7 } };
  const lire = (e) => (e.attributes || {}).current_temperature;
  const avant = lus;
  const calculs = (p) => [modesAppliques(p, T, MAINTENANT), chauffeAppliquee(p, MAINTENANT), echantillons(p, MAINTENANT, { lire }), actionDite(p, MAINTENANT),
    modesAppliques(p, T, MAINTENANT, 'C', { jours: 7 }), echantillons(p, MAINTENANT, { jours: 7, pas: 60, lire })];
  const surDatees = calculs(d);
  assert.equal(lus, avant, 'les calculs sur la liste datée ne relisent aucun instant');
  const surBrutes = calculs(points);
  assert.equal(lus, avant + 6 * points.length, 'témoin : la liste brute relit ses instants à chaque calcul');
  assert.deepEqual(surDatees, surBrutes, 'les mêmes résultats que sur la liste brute');
  // L'état vivant s'y insère à sa place, sans relire les autres.
  const vivant = { state: 'heat', attributes: { hvac_action: 'heating', current_temperature: 19.9 }, last_updated: iso(23) };
  const lusAvant = lus;
  const avec = chauffeAppliquee(d, MAINTENANT, { vivant });
  assert.equal(lus, lusAvant, 'le vivant s’insère sans relire les autres');
  assert.deepEqual(avec, chauffeAppliquee(points, MAINTENANT, { vivant }));
  assert.deepEqual(avec.at(-1), { de: 1380, a: 1440, chauffe: true }, 'à sa place, en dernier');
  // Ni lue ni lisible : null — « pas d'historique » ne s'invente pas en « historique vide ».
  for (const lu of [null, undefined, 'erreur', {}]) assert.equal(dater(lu), null, String(lu));
  assert.deepEqual(dater([]).liste, []);
  for (const f of [() => modesAppliques(dater(null), T, MAINTENANT), () => chauffeAppliquee(dater('erreur'), MAINTENANT)]) assert.deepEqual(f(), []);
});

test('le prochain changement se cherche sur la semaine APPLIQUÉE : les modes passés par le jumeau, les voisines pareilles fondues', () => {
  const SANS_ECO = ['confort', 'confort_1', 'confort_2', 'hors_gel', 'arret'];
  const appliquees = bandesAppliquees(bandesSemaine(BUREAU, PLANNING), { modes: SANS_ECO });
  // Le lundi du bureau : Hors-gel la nuit, l'Éco de 07:30 reçu en Hors-gel — une seule bande jusqu'à 13:30 ; l'Éco de 19:00 et le Hors-gel de 22:00, une seule.
  assert.deepEqual(appliquees[0], [b(0, 810, 'hors_gel'), b(810, 1050, 'confort'), b(1050, 1140, 'confort_1'), b(1140, 1440, 'hors_gel')]);
  // À 20:00, le Hors-gel de 22:00 n'est plus un changement : le prochain est demain 13:30, en Confort.
  assert.deepEqual(prochainDeLaSemaine(appliquees, 0, 1200), { jour: 1, minute: 810, mode: 'confort', dans: 1 });
  // Témoin : sur la semaine voulue, 22:00 — vers le Hors-gel où il est déjà.
  assert.deepEqual(prochainDeLaSemaine(bandesSemaine(BUREAU, PLANNING), 0, 1200), { jour: 0, minute: 1320, mode: 'hors_gel', dans: 0 });
  // Un chauffage qui comprend tout : la semaine telle quelle.
  assert.deepEqual(bandesAppliquees(bandesSemaine(BUREAU, PLANNING), { modes: FROID }), bandesSemaine(BUREAU, PLANNING));
  assert.deepEqual(bandesAppliquees(null, { modes: FROID }), []);
});

test('l’appareil a-t-il dit ce qu’il faisait (`actionDite`) ? Sans un seul `hvac_action` sur la période, son temps de chauffe ne se dit pas', () => {
  const pt = (h, state, attributes = {}) => ({ state, attributes, last_changed: iso(h), last_updated: iso(h) });
  // Un thermostat qui ne publie pas ce qu'il fait : allumé, éteint — la chauffe ne se sait pas.
  const muet = [pt(-2, 'heat'), pt(8, 'off'), pt(14, 'heat')];
  assert.equal(actionDite(muet, MAINTENANT), false);
  assert.deepEqual(tempsDeChauffe(chauffeAppliquee(muet, MAINTENANT)), { chauffe: 0, sans: 360 }, 'témoin : l’Arrêt seul se compterait — « Chauffe 0 min » inventé');
  // Une fois suffit, sur la période.
  assert.equal(actionDite([...muet, pt(20, 'heat', { hvac_action: 'idle' })], MAINTENANT), true);
  assert.equal(actionDite([pt(-30, 'heat', { hvac_action: 'heating' }), pt(-2, 'heat')], MAINTENANT), false, 'avant la période seulement : il ne l’a pas dit sur elle');
  assert.equal(actionDite([pt(-30, 'heat', { hvac_action: 'heating' }), pt(-2, 'heat')], MAINTENANT, { jours: 7 }), true, 'sur 7 jours, si');
  assert.equal(actionDite(null, MAINTENANT), false);
});
