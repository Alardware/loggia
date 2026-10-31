/* Les aides pures de l'écran du planning de chauffe (chantier Chauffage,
 * plan 2, tâche 4).
 *
 * La carte, l'Accueil et la fiche disent les modes avec les mêmes mots, les
 * mêmes couleurs et le même ordre, et « En ce moment » ne dit que l'inhabituel
 * (choix 15). `src/chauffageecran.js` est dans le paquet de DÉMARRAGE : il
 * n'importe jamais `src/chauffage.js`, le calcul, qui se charge avec la fiche.
 *
 * Langue française et fuseau de Los Angeles fixés AVANT l'import : une heure
 * ou une date lue dans la partie murale d'une chaîne ISO ne doit dépendre ni
 * de la machine ni du fuseau du navigateur — à Los Angeles, le 20 octobre
 * 00:00 de Paris est encore le 19.
 */
process.env.TZ = 'America/Los_Angeles';
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
const {
  ORDRE_MODES, couleurMode, rgbMode, encreMode, motMode, modeVoisin, heureMurale, lignesMoment,
  jourDeLaFin, finMurale, phrasePlanning, mesureLisible, estMuet, moduleMuet, enChauffe, consigneAtteinte, teinteClimat,
  plaqueMode, etiquetteCarte, jourEnPhrase,
} = await import('../src/chauffageecran.js');
const { FROID, MODES } = await import('../src/chauffage.js');

const lire = (chemin) => readFileSync(new URL('../' + chemin, import.meta.url), 'utf8');
const TOUS = ['confort', 'confort_1', 'confort_2', 'eco', 'hors_gel', 'arret'];

test('l’ordre des modes, du plus froid au plus chaud, est celui du calcul', () => {
  assert.deepEqual(ORDRE_MODES, ['arret', 'hors_gel', 'eco', 'confort_2', 'confort_1', 'confort']);
  assert.deepEqual(ORDRE_MODES, FROID, 'la carte et le calcul ne rangent plus les modes pareil');
  assert.deepEqual([...ORDRE_MODES].sort(), [...MODES].sort(), 'un mode manque ou se répète');
});

/* Les couleurs de la maquette « Cartes chauffage » (son objet `P`), choisies
 * le 11/10 — « Celles de la maquette » : « Orange : chauffe ou confort.
 * Violet : éco. Cyan : hors-gel. Le rouge reste réservé aux alertes. » */
test('chaque mode a la couleur de la maquette : l’orange des trois Confort, le violet de l’Éco, le cyan du Hors-gel', () => {
  assert.equal(couleurMode('confort'), 'var(--o-warn2)');
  assert.equal(couleurMode('confort_1'), 'rgba(var(--o-warn2-rgb),.7)');
  assert.equal(couleurMode('confort_2'), 'rgba(var(--o-warn2-rgb),.45)');
  assert.equal(couleurMode('eco'), 'var(--o-purple)');
  assert.equal(couleurMode('hors_gel'), 'var(--o-cyan)');
  assert.equal(couleurMode('arret'), 'var(--o-text3)');
  for (const inconnu of ['turbo', '', null, undefined, 'toString', '__proto__', 3]) {
    assert.equal(couleurMode(inconnu), 'var(--o-text3)', JSON.stringify(inconnu));
  }
  const css = lire('src/index.css');
  for (const m of TOUS) {
    // Un jeton plein, ou le triplet d'un jeton à une opacité : jamais une couleur en dur.
    const nom = /^(?:var\(--o-([a-z0-9]+)\)|rgba\(var\(--o-([a-z0-9]+)-rgb\),\.\d+\))$/.exec(couleurMode(m));
    assert.ok(nom, m + ' : une couleur en dur');
    const jeton = nom[1] ? '--o-' + nom[1] + ':' : '--o-' + nom[2] + '-rgb:';
    assert.ok(css.includes(jeton), m + ' : le jeton ' + jeton + ' n’existe pas');
    assert.ok(!/--o-(bad|orange|cold)\b/.test(couleurMode(m)), m + ' : le rouge reste aux alertes, et l’orange vif comme le bleu du froid quittent les modes');
  }
});

test('le lavis d’un mode, pour une plaque teintée : l’orange des trois Confort, rien pour l’Arrêt', () => {
  for (const m of ['confort', 'confort_1', 'confort_2']) assert.equal(rgbMode(m), 'var(--o-warn2-rgb)', m);
  assert.equal(rgbMode('eco'), 'var(--o-purple-rgb)');
  assert.equal(rgbMode('hors_gel'), 'var(--o-cyan-rgb)');
  for (const rien of ['arret', 'turbo', '', null, undefined, 'toString', '__proto__', 3]) {
    assert.equal(rgbMode(rien), null, JSON.stringify(rien));
  }
  const css = lire('src/index.css');
  for (const m of TOUS.filter(x => x !== 'arret')) assert.ok(css.includes(rgbMode(m).slice(4, -1) + ':'), m + ' : son lavis n’est pas un jeton');
});

test('l’encre d’un mode écrit en grand : l’orange plein des trois Confort, le gris doux de l’Arrêt', () => {
  /* Un mot écrit à .45 ne se lit plus : l'encre garde la teinte pleine (la
   * maquette, `heroInk`) ; l'Arrêt et l'inconnu, `--o-text2`. */
  for (const m of ['confort', 'confort_1', 'confort_2']) assert.equal(encreMode(m), 'var(--o-warn2)', m);
  assert.equal(encreMode('eco'), 'var(--o-purple)');
  assert.equal(encreMode('hors_gel'), 'var(--o-cyan)');
  for (const gris of ['arret', 'turbo', '', null, undefined, '__proto__', 3]) {
    assert.equal(encreMode(gris), 'var(--o-text2)', JSON.stringify(gris));
  }
});

test('chaque mode a son mot ; un mode inconnu n’en a pas', () => {
  assert.equal(motMode('confort'), 'Confort');
  assert.equal(motMode('confort_1'), 'Confort \u22121', 'le moins de « Confort −1 » est U+2212');
  assert.equal(motMode('confort_2'), 'Confort \u22122');
  assert.equal(motMode('eco'), 'Éco');
  assert.equal(motMode('hors_gel'), 'Hors-gel');
  assert.equal(motMode('arret'), 'Arrêt');
  for (const inconnu of ['turbo', '', null, undefined, 'toString', 'constructor', 'Confort']) {
    assert.equal(motMode(inconnu), null, JSON.stringify(inconnu));
  }
});

test('le mode voisin : un cran plus chaud ou plus froid, parmi les modes du chauffage', () => {
  assert.equal(modeVoisin(TOUS, 'arret', 1), 'hors_gel');
  assert.equal(modeVoisin(TOUS, 'eco', 1), 'confort_2');
  assert.equal(modeVoisin(TOUS, 'eco', -1), 'hors_gel');
  assert.equal(modeVoisin(TOUS, 'confort_1', 1), 'confort');
  assert.equal(modeVoisin(TOUS, 'confort', 1), null, 'au bout du chaud');
  assert.equal(modeVoisin(TOUS, 'arret', -1), null, 'au bout du froid');
  // Un module sans Confort −1 ni −2 saute ce qu'il ne comprend pas.
  const quatre = ['confort', 'eco', 'hors_gel', 'arret'];
  assert.equal(modeVoisin(quatre, 'eco', 1), 'confort');
  assert.equal(modeVoisin(quatre, 'confort', -1), 'eco');
  // L'ordre de la liste du chauffage ne compte pas : celui des modes, si.
  assert.equal(modeVoisin(['confort', 'arret', 'eco'], 'arret', 1), 'eco');
  assert.equal(modeVoisin(['confort', 'arret', 'eco'], 'confort', -1), 'eco');
  // Un mode connu que le chauffage ne comprend pas : on part de SA place.
  assert.equal(modeVoisin(['arret', 'eco', 'confort'], 'hors_gel', 1), 'eco');
  assert.equal(modeVoisin(['arret', 'eco', 'confort'], 'hors_gel', -1), 'arret');
  assert.equal(modeVoisin(['arret', 'eco', 'confort'], 'confort_1', 1), 'confort');
  assert.equal(modeVoisin(['arret', 'eco', 'confort'], 'confort_1', -1), 'eco');
  assert.equal(modeVoisin(['eco'], 'confort', 1), null);
  // L'inconnu et l'illisible.
  assert.equal(modeVoisin(TOUS, 'turbo', 1), null, 'un mode inconnu');
  assert.equal(modeVoisin(TOUS, null, 1), null);
  assert.equal(modeVoisin(TOUS, undefined, -1), null);
  assert.equal(modeVoisin([], 'eco', 1), null, 'un chauffage sans mode');
  assert.equal(modeVoisin(null, 'eco', 1), null);
  assert.equal(modeVoisin('confort', 'eco', 1), null, 'une chaîne n’est pas une liste de modes');
  assert.equal(modeVoisin(['turbo', 'boost', 'eco'], 'arret', 1), 'eco', 'ce qui n’est pas un mode est ignoré');
  assert.equal(modeVoisin(TOUS, 'eco', 0), null, 'ni plus chaud ni plus froid');
  assert.equal(modeVoisin(TOUS, 'eco', undefined), null);
  assert.equal(modeVoisin(TOUS, 'eco', NaN), null);
  assert.equal(modeVoisin(TOUS, 'eco', -0), null);
  assert.equal(modeVoisin(TOUS, 'eco', 'plus'), null, 'un sens illisible');
  assert.equal(modeVoisin(TOUS, 'eco', 3), 'confort_2', 'un cran à la fois, quelle que soit la force du geste');
  assert.equal(modeVoisin(TOUS, 'eco', -0.5), 'hors_gel');
});

/* TEST RETIRÉ (relecture de la partie B, point 7) : « suit le planning »
 * (`suitLePlanning`) n'avait plus d'appel — l'étiquette de la carte dit QUI
 * décide par `etiquetteCarte`, tenue plus bas. */
test('`suitLePlanning` est parti : plus personne ne l’appelait', async () => {
  const M = await import('../src/chauffageecran.js');
  assert.equal(M.suitLePlanning, undefined);
});

test('l’heure murale se lit dans la chaîne ISO, sans fuseau', () => {
  assert.equal(heureMurale('2026-10-10T23:00:00+02:00'), '23:00');
  assert.equal(heureMurale('2026-10-10T06:05:00Z'), '06:05', 'la partie murale telle qu’écrite');
  assert.equal(heureMurale('2026-10-10T07:30:59.123456+14:00'), '07:30', 'les secondes ne comptent pas');
  assert.equal(heureMurale('2026-03-29T00:00:00-12:00'), '00:00');
  assert.equal(heureMurale('2026-10-10 21:45:00+01:00'), '21:45', 'le séparateur espace d’ISO');
  // Los Angeles : une conversion vers le fuseau du navigateur aurait dit 14:00.
  assert.equal(heureMurale('2026-10-10T23:00:00+02:00'), '23:00');
  // Les bornes comprises : mois 01 et 12, jours 01, 19, 29, 30 et 31, heures 00, 10, 19, 20 et 23, minutes 00 et 59.
  for (const [iso, heure] of [['2026-01-01T00:59:00Z', '00:59'], ['2026-12-31T23:59:00Z', '23:59'],
    ['2026-02-29T19:09:00Z', '19:09'], ['2026-10-30T20:00:00Z', '20:00'], ['2026-10-19T10:00:00Z', '10:00']]) {
    assert.equal(heureMurale(iso), heure, iso);
  }
  for (const illisible of [null, undefined, '', 'demain', '23:00', '2026-10-10', '2026-10-10T24:00:00+02:00',
    '2026-10-10T23:60:00+02:00', '2026-13-10T10:00:00Z', '2026-00-10T10:00:00Z', '2026-10-32T10:00:00Z',
    '2026-10-00T10:00:00Z', '2026-10-10T9:00:00Z', ' 2026-10-10T09:00:00Z', 1760130000000, {}, []]) {
    assert.equal(heureMurale(illisible), null, JSON.stringify(illisible));
  }
});

/* ── « En ce moment » ─────────────────────────────────────────────────────── */

/* Un chauffage tel que `loggia/chauffage/etat` le rend. */
const ch = (cle, champs) => ({
  cle, entite: 'select.' + cle, nom: 'Radiateur ' + cle, famille: 'fil_pilote', planning: true,
  modes: TOUS, mode: 'confort', source: 'planning', fin: null, puis: null, reprise: null,
  fenetre: 'arret', fenetre_ouverte: false, semaine: null, temperatures: null, avertissements: [],
  jour: null, options: null, ...champs,
});
const etat = (chauffages, maison = {}) => ({
  chauffages, maison: { mode: 'planning', vacances_fin: null, absence: 'eco', vacances: 'hors_gel', ...maison },
  simulation: false, maintenant: '2026-10-10T08:00:00+00:00', minute: [5, 600], demarrage: null, journal: [],
});

test('quand tout suit le planning, rien', () => {
  assert.deepEqual(lignesMoment(etat([ch('salon'), ch('bureau', { mode: 'eco' })])), []);
  assert.deepEqual(lignesMoment(etat([])), [], 'aucun chauffage, maison au Planning');
  for (const vide of [null, undefined, {}, { chauffages: null }, { chauffages: 'x' }, { chauffages: [null, 3, 'x'] }]) {
    assert.deepEqual(lignesMoment(vide), [], JSON.stringify(vide));
  }
});

test('une fenêtre qui coupe : le chauffage et ce qu’elle lui impose', () => {
  const lignes = lignesMoment(etat([ch('chambre', { source: 'fenetre', mode: 'arret', fenetre_ouverte: true })]));
  /* ASSERTION MODIFIÉE (tâche 12) : la ligne porte la clé du chauffage
   * (`chauffage`) — l'Accueil ouvre sa fiche par elle. */
  assert.deepEqual(lignes, [{
    cle: 'chauffage:chambre', chauffage: 'chambre', entite: 'select.chambre', icone: 'window-alt', rgb: 'var(--o-text3-rgb)',
    nom: 'Radiateur chambre', sous: 'Fenêtre ouverte · Arrêt',
  }]);
  const eco = lignesMoment(etat([ch('poele', { source: 'fenetre', mode: 'eco' })]))[0];
  assert.equal(eco.sous, 'Fenêtre ouverte · Éco');
  assert.equal(eco.rgb, 'var(--o-purple-rgb)', 'la tuile prend la couleur du mode imposé');
  assert.equal(lignesMoment(etat([ch('x', { source: 'fenetre', mode: null })]))[0].sous, 'Fenêtre ouverte',
    'sans mode lisible, la fenêtre seule — pas de « · » pendu');
});

test('« En ce moment » dit le mode que le moteur APPLIQUE (`applique`), pas celui qu’il voulait', () => {
  /* Relecture de la partie B, point 3 : un thermostat sans `off`, fenêtre
   * ouverte — le moteur voulait l'Arrêt et lui envoie son Hors-gel. La ligne
   * le dit, à la couleur du Hors-gel ; sans `applique` (un serveur d'avant),
   * le mode voulu, comme avant. */
  const poele = ch('poele', { famille: 'thermostat', modes: ['confort', 'eco', 'hors_gel'], source: 'fenetre', mode: 'arret', applique: 'hors_gel', fenetre_ouverte: true });
  const [l] = lignesMoment(etat([poele]));
  assert.deepEqual([l.sous, l.rgb], ['Fenêtre ouverte · Hors-gel', 'var(--o-cyan-rgb)']);
  const { applique: _sans, ...dAvant } = poele;
  assert.equal(lignesMoment(etat([dAvant]))[0].sous, 'Fenêtre ouverte · Arrêt', 'un serveur sans `applique` : le mode voulu');
  // Une reprise : le mode appliqué aussi.
  const main = ch('bureau', { source: 'main', mode: 'eco', applique: 'hors_gel', fin: '2026-10-10T23:00:00+02:00' });
  assert.equal(lignesMoment(etat([main]))[0].sous, 'À la main · Hors-gel jusqu’à 23:00');
  // Un module coupé qui devrait encore chauffer — l'Arrêt voulu devenu Hors-gel — se dit.
  const coupe = ch('chambre', { avertissements: ['module_coupe'], source: 'planning', mode: 'arret', applique: 'hors_gel' });
  assert.equal(lignesMoment(etat([coupe]))[0].sous, 'Module coupé : le planning ne peut rien');
});

test('une reprise en main : le mode, et jusqu’à quand', () => {
  const [eco] = lignesMoment(etat([ch('bureau', { source: 'main', mode: 'eco', fin: '2026-10-10T23:00:00+02:00',
    reprise: { mode: 'eco', temperature: null, fin: '2026-10-10T23:00:00+02:00', depuis: '2026-10-10T17:00:00+02:00', par: null } })]));
  // ASSERTION MODIFIÉE (tâche 12) : la clé du chauffage, `chauffage`, en plus.
  assert.deepEqual(eco, {
    cle: 'chauffage:bureau', chauffage: 'bureau', entite: 'select.bureau', icone: 'hand', rgb: 'var(--o-purple-rgb)',
    nom: 'Radiateur bureau', sous: 'À la main · Éco jusqu’à 23:00',
  });
  const [relance] = lignesMoment(etat([ch('salon', { source: 'main', mode: 'confort_1', fin: null,
    reprise: { mode: 'confort_1', temperature: null, fin: null } })]));
  assert.equal(relance.sous, 'À la main · Confort \u22121 jusqu’à relance');
  assert.equal(relance.rgb, 'var(--o-warn2-rgb)', 'les trois Confort : le lavis de la chauffe');
  // Une fin illisible vaut « jusqu'à relance », comme pour le serveur.
  assert.equal(lignesMoment(etat([ch('s', { source: 'main', mode: 'eco', fin: 'bientôt' })]))[0].sous,
    'À la main · Éco jusqu’à relance');
});

test('une reprise en température : la consigne à la place du mode, dans l’unité de la maison', () => {
  const poele = ch('poele', { entite: 'climate.poele', nom: 'Poêle', famille: 'thermostat', modes: ['confort', 'eco', 'hors_gel', 'arret'],
    source: 'main', mode: null, fin: '2026-10-10T22:30:00+02:00',
    reprise: { mode: null, temperature: 21.5, fin: '2026-10-10T22:30:00+02:00', depuis: '2026-10-10T18:00:00+02:00', par: 'u-1' } });
  const [c] = lignesMoment(etat([poele]));
  assert.equal(c.sous, 'À la main · 21,5 °C jusqu’à 22:30');
  assert.equal(c.icone, 'hand');
  assert.equal(c.rgb, 'var(--o-warn2-rgb)', 'une consigne posée à la main : la teinte du Confort, l’orange de la chauffe');
  assert.equal(lignesMoment(etat([poele]), 'C')[0].sous, 'À la main · 21,5 °C jusqu’à 22:30');
  assert.equal(lignesMoment(etat([poele]), 'F')[0].sous, 'À la main · 70,7 °F jusqu’à 22:30',
    'le serveur parle en °C ; une maison en Fahrenheit lit des °F');
  const ronde = { ...poele, fin: null, reprise: { ...poele.reprise, temperature: 19, fin: null } };
  assert.equal(lignesMoment(etat([ronde]))[0].sous, 'À la main · 19 °C jusqu’à relance', 'un entier reste entier');
  const rien = { ...poele, reprise: { mode: null, temperature: null, fin: null } };
  assert.equal(lignesMoment(etat([rien]))[0].sous, 'À la main · — jusqu’à 22:30', 'ni mode ni consigne : un tiret, rien d’inventé');
});

test('un module coupé : le planning ne peut rien — et cela l’emporte', () => {
  const coupe = ch('chambre', { avertissements: ['module_coupe'] });
  // ASSERTION MODIFIÉE (tâche 12) : la clé du chauffage, `chauffage`, en plus.
  assert.deepEqual(lignesMoment(etat([coupe])), [{
    cle: 'chauffage:chambre', chauffage: 'chambre', entite: 'select.chambre', icone: 'power', rgb: 'var(--o-warn-rgb)',
    nom: 'Radiateur chambre', sous: 'Module coupé : le planning ne peut rien',
  }]);
  // Une ligne par chauffage : coupé, sa fenêtre ou sa reprise ne s'appliquent pas.
  for (const source of ['fenetre', 'main', 'maison']) {
    const l = lignesMoment(etat([{ ...coupe, source, mode: 'eco', fin: '2026-10-10T23:00:00+02:00' }]));
    assert.equal(l.length, 1, source);
    assert.equal(l[0].sous, 'Module coupé : le planning ne peut rien', source);
  }
  assert.deepEqual(lignesMoment(etat([ch('c', { avertissements: 'module_coupe' })])), [],
    'des avertissements qui ne sont pas une liste ne se lisent pas');
});

test('le programme de l’appareil allumé se dit dans « En ce moment », planning allumé seulement (audit du 19/10)', () => {
  const prog = ch('poele', { avertissements: ['programme_appareil'], programme: 'switch.poele_timer', source: 'main' });
  const [l] = lignesMoment(etat([prog]));
  // ASSERTION MODIFIÉE (30/10) : le moteur n'envoie plus rien tant que son programme commande — la ligne le dit.
  assert.equal(l.sous, 'Son propre programme commande : Loggia attend qu’il s’éteigne');
  assert.equal(l.icone, 'calendar-clock');
  assert.deepEqual(lignesMoment(etat([{ ...prog, planning: false }])), [], 'planning éteint : rien à dire');
});

test('un programme d’ailleurs qui le commande se dit dans « En ce moment », planning allumé seulement (26/10)', () => {
  /* Le radiateur du bureau de la démo, commandé aussi par un planning Scheduler : sa fiche le disait, « En ce moment »
   * restait muet. Le programme de l'appareil, plus précis, passe devant. */
  const bureau = ch('bureau', { avertissements: ['programme_concurrent'], source: 'planning', mode: 'eco',
    concurrents: [{ type: 'scheduler', entite: 'switch.schedule_radiateur_bureau', nom: 'Planning radiateur bureau' }] });
  const [l] = lignesMoment(etat([bureau]));
  assert.equal(l.sous, 'Un autre programme le commande aussi : le planning ne commande pas seul');
  assert.equal(l.icone, 'calendar-clock');
  assert.deepEqual(lignesMoment(etat([{ ...bureau, planning: false }])), [], 'planning éteint : rien à dire');
  const deux = lignesMoment(etat([{ ...bureau, avertissements: ['programme_appareil', 'programme_concurrent'] }]));
  // ASSERTION MODIFIÉE (30/10) : le texte de la ligne du programme de l'appareil a changé, pas son rang.
  assert.equal(deux[0].sous, 'Son propre programme commande : Loggia attend qu’il s’éteigne');
});

test('un ordre que l’appareil n’a pas gardé se dit dans « En ce moment », ce qu’il fait à la place (30/10)', () => {
  const poele = ch('poele', { avertissements: ['ordre_defait'], source: 'planning', mode: 'confort',
    defait: { mode: null, temperature: 19, depuis: '2026-10-30T15:11:00+01:00' } });
  const [l] = lignesMoment(etat([poele]));
  assert.equal(l.sous, 'Il n’a pas gardé l’ordre de Loggia : il est à 19 °C');
  assert.equal(l.icone, 'triangle-warning');
  assert.equal(lignesMoment(etat([poele]), 'F')[0].sous, 'Il n’a pas gardé l’ordre de Loggia : il est à 66,2 °F');
  const radiateur = ch('rad', { avertissements: ['ordre_defait'], source: 'planning', mode: 'confort', defait: { mode: 'eco', temperature: null } });
  assert.equal(lignesMoment(etat([radiateur]))[0].sous, 'Il n’a pas gardé l’ordre de Loggia : il est en Éco');
  assert.equal(lignesMoment(etat([{ ...radiateur, defait: null }]))[0].sous, 'Il n’a pas gardé l’ordre de Loggia');
  assert.deepEqual(lignesMoment(etat([{ ...poele, planning: false }])), [], 'planning éteint : rien à dire');
  // Son programme allumé l'explique mieux : sa ligne passe devant.
  assert.equal(lignesMoment(etat([{ ...poele, avertissements: ['programme_appareil', 'ordre_defait'] }]))[0].sous,
    'Son propre programme commande : Loggia attend qu’il s’éteigne');
});

test('un poêle MCZ en manuel se dit dans « En ce moment », planning allumé seulement (19/10)', () => {
  const manuel = ch('poele', { avertissements: ['puissance_fixe'], source: 'planning', mode: 'eco' });
  const [l] = lignesMoment(etat([manuel]));
  assert.equal(l.sous, 'Mode manuel : le planning n’a pas d’effet');
  assert.equal(l.icone, 'settings-sliders');
  assert.deepEqual(lignesMoment(etat([{ ...manuel, planning: false }])), [], 'planning éteint : rien à dire');
});

test('un thermostat revenu à son programme : « À la main · son programme » (Tado, Netatmo ; 19/10)', () => {
  const fin = '2026-10-10T23:00:00+02:00';
  const prog = ch('salon', { source: 'main', mode: null, fin,
    reprise: { mode: null, temperature: 19, fin, depuis: '2026-10-10T17:00:00+02:00', par: null, programme: true } });
  assert.equal(lignesMoment(etat([prog]))[0].sous, 'À la main · son programme jusqu’à 23:00');
});

test('un module coupé ne se dit que si le chauffage devrait chauffer', () => {
  const coupe = (champs) => ch('chambre', { avertissements: ['module_coupe'], mode: 'arret', ...champs });
  // En Été, ou sur un créneau à l'Arrêt, un module coupé ne prive de rien : rien à dire.
  for (const source of ['maison', 'planning']) {
    assert.deepEqual(lignesMoment(etat([coupe({ source })])), [], source);
  }
  assert.deepEqual(lignesMoment(etat([coupe({ source: 'maison' })], { mode: 'ete' })).map(l => l.sous), ['Été'],
    'l’Été se dit une fois, par la maison');
  // L'Arrêt d'une fenêtre ou d'une main se dit comme sans module coupé.
  assert.equal(lignesMoment(etat([coupe({ source: 'fenetre', fenetre_ouverte: true })]))[0].sous, 'Fenêtre ouverte · Arrêt');
  assert.equal(lignesMoment(etat([coupe({ source: 'main', fin: '2026-10-10T23:00:00+02:00' })]))[0].sous,
    'À la main · Arrêt jusqu’à 23:00');
  // Un mode que l'écran ne lit pas : il pourrait chauffer, on le dit.
  assert.equal(lignesMoment(etat([coupe({ source: 'main', mode: null })]))[0].sous, 'Module coupé : le planning ne peut rien');
});

test('ce que « En ce moment » ne dit pas', () => {
  /* ASSERTION MODIFIÉE (tâche 12, puis sa relecture) : un chauffage
   * INTROUVABLE quitte cette liste, planning allumé ou NON — il a désormais sa
   * ligne (test suivant) : il a une configuration, et sa fiche est le seul
   * chemin vers « Supprimer son planning » (spec § 10). */
  const lignes = lignesMoment(etat([
    ch('eteint-fenetre', { planning: false, source: 'fenetre', mode: 'arret' }),
    ch('eteint-main', { planning: false, source: 'main', mode: 'eco', fin: '2026-10-10T23:00:00+02:00' }),
    ch('eteint-coupe', { planning: false, avertissements: ['module_coupe'] }),
    ch('chaine', { planning: 'true', source: 'fenetre', mode: 'arret' }),
    ch('injoignable', { avertissements: ['injoignable'] }),
    ch('maison', { source: 'maison', mode: 'eco' }),
    ch('planning', { source: 'planning', mode: 'confort' }),
  ]));
  assert.deepEqual(lignes, [], 'un planning éteint, injoignable, la maison ou le planning ne sont pas l’inhabituel');
});

test('un chauffage introuvable, planning allumé ou non : sa ligne, sobre, qui ouvre sa fiche par sa clé — pour un administrateur', () => {
  /* Tâche 12 : renommé ou retiré dans Home Assistant, il n'a plus d'entité ;
   * sa fiche — ouverte par sa CLÉ — est le seul chemin vers « Supprimer son
   * planning ». L'avertissement l'emporte sur tout le reste : le moteur ne
   * peut plus rien lui envoyer, ni fenêtre ni reprise.
   * ASSERTIONS AJOUTÉES (relecture des tâches 11 et 12) : planning éteint, il
   * a sa ligne aussi (il a une configuration, spec § 10) ; et seulement pour
   * un administrateur — un compte ordinaire n'aurait aucun geste dans sa fiche. */
  const perdu = ch('id-perdu', { entite: null, nom: null, avertissements: ['introuvable'] });
  assert.deepEqual(lignesMoment(etat([perdu])), [{
    cle: 'chauffage:id-perdu', chauffage: 'id-perdu', entite: null, icone: 'search-alt', rgb: 'var(--o-text3-rgb)',
    nom: 'Chauffage', sous: 'Introuvable dans Home Assistant : renommé ou retiré ?',
  }]);
  for (const source of ['main', 'fenetre', 'maison']) {
    const l = lignesMoment(etat([{ ...perdu, source, mode: 'eco', fin: '2026-10-10T23:00:00+02:00' }]));
    assert.deepEqual(l.map(x => x.sous), ['Introuvable dans Home Assistant : renommé ou retiré ?'], source);
  }
  // Planning éteint : la même ligne.
  assert.deepEqual(lignesMoment(etat([{ ...perdu, planning: false }])).map(l => l.cle), ['chauffage:id-perdu']);
  // Le nom que le serveur lui garde — l'entité de sa configuration — se dit ; l'icône est celle de l'avertissement de sa fiche.
  assert.equal(lignesMoment(etat([{ ...perdu, nom: 'select.radiateur_grenier_fil_pilote' }]))[0].nom, 'select.radiateur_grenier_fil_pilote');
  assert.ok(lire('src/fichechauffage.jsx').includes("av.includes('introuvable') && ['introuvable', 'search-alt',"), 'la fiche a changé d’icône');
  // Un compte ordinaire : pas cette ligne — les autres restent.
  const melange = etat([perdu, { ...perdu, cle: 'id-perdu-2', planning: false }, ch('bureau', { source: 'main', mode: 'eco', fin: '2026-10-10T23:00:00+02:00' })], { mode: 'absence' });
  assert.deepEqual(lignesMoment(melange, 'C', { admin: false }).map(l => l.cle), ['chauffage-maison', 'chauffage:bureau']);
  assert.deepEqual(lignesMoment(melange, 'C', { admin: true }).map(l => l.cle), ['chauffage-maison', 'chauffage:id-perdu', 'chauffage:id-perdu-2', 'chauffage:bureau']);
  assert.deepEqual(lignesMoment(melange).map(l => l.cle), lignesMoment(melange, 'C', { admin: true }).map(l => l.cle),
    'sans le dire, un administrateur : sur un doute, rien ne se masque (compteOrdinaire)');
});

test('la fin d’une reprise dit son jour : « demain », puis le nom du jour (tâche 12)', () => {
  /* L'état est lu un samedi (`maintenant` : le 10 octobre 2026 à 08:00 UTC,
   * la partie murale de la chaîne). La fin d'une reprise se lit comme sur la
   * carte et la fiche (`finMurale`) : le jour d'après, « demain » ; au-delà,
   * le nom du jour ; aujourd'hui, l'heure seule. Les phrases restent
   * entières au catalogue. */
  const reprise = (fin) => lignesMoment(etat([ch('bureau', { source: 'main', mode: 'eco', fin,
    reprise: { mode: 'eco', temperature: null, fin, depuis: '2026-10-10T07:00:00+02:00', par: null } })]))[0].sous;
  assert.equal(reprise('2026-10-10T23:00:00+02:00'), 'À la main · Éco jusqu’à 23:00');
  assert.equal(reprise('2026-10-11T07:30:00+02:00'), 'À la main · Éco jusqu’à demain 07:30');
  assert.equal(reprise('2026-10-12T07:30:00+02:00'), 'À la main · Éco jusqu’à lundi 07:30');
  // Une consigne de thermostat, de même.
  const poele = ch('poele', { famille: 'thermostat', source: 'main', mode: null, fin: '2026-10-11T06:00:00+02:00',
    reprise: { mode: null, temperature: 21, fin: '2026-10-11T06:00:00+02:00', depuis: '2026-10-10T07:00:00+02:00', par: null } });
  assert.equal(lignesMoment(etat([poele]))[0].sous, 'À la main · 21 °C jusqu’à demain 06:00');
  // Le jour se lit dans la partie MURALE des deux chaînes, jamais dans le fuseau du navigateur (Los Angeles ici).
  const minuit = { ...etat([ch('s', { source: 'main', mode: 'eco', fin: '2026-10-11T00:30:00+02:00' })]), maintenant: '2026-10-10T23:50:00+02:00' };
  assert.equal(lignesMoment(minuit)[0].sous, 'À la main · Éco jusqu’à demain 00:30');
  // Sans « maintenant » lisible (un serveur d'avant), l'heure seule, comme avant.
  const sans = { ...etat([ch('s', { source: 'main', mode: 'eco', fin: '2026-10-12T07:30:00+02:00' })]), maintenant: undefined };
  assert.equal(lignesMoment(sans)[0].sous, 'À la main · Éco jusqu’à 07:30');
  // Les phrases ont leur clé, entières, dans les sept langues.
  const en = lire('src/langues/en.js');
  for (const k of ['À la main · {mode} jusqu’à demain {heure}', 'À la main · {mode} jusqu’à {jour} {heure}']) assert.ok(en.includes("'" + k + "':"), k);
});

test('en « Observer sans agir », aucune ligne par chauffage — sauf l’introuvable ; la maison se dit encore', () => {
  /* Le moteur n'envoie alors aucun ordre (tâche 7) : la fenêtre, la reprise,
   * le module coupé ne seraient que ce qu'il AURAIT fait — l'Accueil compte
   * ces chauffages avec les autres zones (`zonesQuiChauffent`, App.jsx). Un
   * chauffage introuvable reste à supprimer, et la maison garde son mode. */
  const observe = (chauffages, maison) => ({ ...etat(chauffages, maison), simulation: true });
  const tous = [
    ch('f', { source: 'fenetre', mode: 'arret' }),
    ch('m', { source: 'main', mode: 'eco', fin: '2026-10-10T23:00:00+02:00' }),
    ch('k', { avertissements: ['module_coupe'] }),
  ];
  assert.deepEqual(lignesMoment(observe(tous)), []);
  assert.equal(lignesMoment(etat(tous)).length, 3, 'témoin : hors observation, trois lignes');
  assert.deepEqual(lignesMoment(observe([...tous, ch('perdu', { entite: null, avertissements: ['introuvable'] })])).map(l => l.cle), ['chauffage:perdu']);
  assert.deepEqual(lignesMoment(observe(tous, { mode: 'absence' })).map(l => l.sous), ['Absence']);
});

test('la maison hors Planning : une ligne, la sienne', () => {
  /* ASSERTIONS MODIFIÉES (tâche 12) : la ligne de la maison n'ouvre aucune
   * fiche — `chauffage: null` ; l'Accueil la mène à Objets › Chauffage. */
  const tous = [ch('salon', { source: 'maison', mode: 'eco' })];
  assert.deepEqual(lignesMoment(etat(tous, { mode: 'absence' })), [{
    cle: 'chauffage-maison', chauffage: null, entite: null, icone: 'home', rgb: 'var(--o-purple-rgb)', nom: 'Maison', sous: 'Absence',
  }]);
  const [vac] = lignesMoment(etat(tous, { mode: 'vacances', vacances_fin: '2026-10-20T00:00:00+02:00' }));
  assert.deepEqual(vac, {
    cle: 'chauffage-maison', chauffage: null, entite: null, icone: 'umbrella-beach', rgb: 'var(--o-cyan-rgb)', nom: 'Maison',
    sous: 'Vacances jusqu’au 20 oct.',
  }, 'la date murale : à Los Angeles, une conversion aurait dit le 19');
  assert.equal(lignesMoment(etat(tous, { mode: 'vacances', vacances_fin: '2026-12-31T23:30:00-05:00' }))[0].sous,
    'Vacances jusqu’au 31 déc.');
  for (const fin of [null, '', 'lundi', '2026-13-01T00:00:00Z', 42]) {
    assert.equal(lignesMoment(etat(tous, { mode: 'vacances', vacances_fin: fin }))[0].sous, 'Vacances', JSON.stringify(fin));
  }
  assert.deepEqual(lignesMoment(etat(tous, { mode: 'ete' })), [{
    cle: 'chauffage-maison', chauffage: null, entite: null, icone: 'sun', rgb: 'var(--o-text3-rgb)', nom: 'Maison', sous: 'Été',
  }]);
  // Les réglages de la maison donnent la teinte : l'Absence réglée sur Hors-gel.
  assert.equal(lignesMoment(etat(tous, { mode: 'absence', absence: 'hors_gel' }))[0].rgb, 'var(--o-cyan-rgb)');
  assert.equal(lignesMoment(etat(tous, { mode: 'absence', absence: null }))[0].rgb, 'var(--o-purple-rgb)', 'Éco par défaut');
  assert.deepEqual(lignesMoment(etat(tous, { mode: 'planning' })), []);
  assert.deepEqual(lignesMoment(etat(tous, { mode: 'turbo' })), [], 'un mode de maison inconnu ne se dit pas');
  assert.deepEqual(lignesMoment({ chauffages: tous }), [], 'sans maison');
});

test('la date des Vacances ne glisse dans aucun fuseau du navigateur', () => {
  const vac = (fin) => lignesMoment(etat([ch('salon', { source: 'maison', mode: 'eco' })], { mode: 'vacances', vacances_fin: fin }))[0].sous;
  try {
    // UTC+14 : une date posée à l'heure locale puis lue en UTC dirait le 19 ;
    // Los Angeles (en tête du fichier) attrape le mélange inverse.
    process.env.TZ = 'Pacific/Kiritimati';
    assert.equal(vac('2026-10-20T00:00:00+02:00'), 'Vacances jusqu’au 20 oct.');
    assert.equal(vac('2027-01-01T00:00:00+01:00'), 'Vacances jusqu’au 1 janv.');
    process.env.TZ = 'UTC';
    assert.equal(vac('2026-10-20T00:00:00+02:00'), 'Vacances jusqu’au 20 oct.');
  } finally {
    process.env.TZ = 'America/Los_Angeles';
  }
});

test('la maison hors Planning sans aucun planning allumé : il faut le voir', () => {
  const eteints = [ch('salon', { planning: false }), ch('bureau', { planning: false })];
  assert.equal(lignesMoment(etat(eteints, { mode: 'absence' }))[0].sous, 'Absence — aucun planning allumé');
  assert.equal(lignesMoment(etat([], { mode: 'ete' }))[0].sous, 'Été — aucun planning allumé');
  assert.equal(lignesMoment(etat(eteints, { mode: 'vacances', vacances_fin: '2026-10-20T00:00:00+02:00' }))[0].sous,
    'Vacances jusqu’au 20 oct. — aucun planning allumé');
  assert.deepEqual(lignesMoment(etat(eteints, { mode: 'planning' })), [], 'au Planning, rien : il n’y a rien d’inhabituel');
  // Un seul planning allumé suffit à le taire.
  assert.equal(lignesMoment(etat([...eteints, ch('chambre', { source: 'maison', mode: 'eco' })], { mode: 'absence' }))[0].sous, 'Absence');
});

test('« aucun planning allumé » se lit dans l’état du serveur, compté avant les droits', () => {
  /* Un compte restreint ne voit que le salon, planning éteint ; le serveur compte
   * sur toute la configuration (`plannings_allumes`) : un planning tourne. */
  const vus = [ch('salon', { planning: false })];
  const avec = (chauffages, maison, allumes) => ({ ...etat(chauffages, maison), plannings_allumes: allumes });
  assert.equal(lignesMoment(avec(vus, { mode: 'absence' }, true))[0].sous, 'Absence');
  assert.equal(lignesMoment(avec([], { mode: 'ete' }, true))[0].sous, 'Été', 'aucun chauffage visible');
  assert.equal(lignesMoment(avec(vus, { mode: 'absence' }, false))[0].sous, 'Absence — aucun planning allumé');
  assert.deepEqual(lignesMoment(avec(vus, { mode: 'planning' }, false)), [], 'au Planning, rien');
  // Sans la clé, ou illisible (un serveur d'avant) : ce que l'écran voit.
  for (const illisible of [undefined, null, 'true', 1]) {
    assert.equal(lignesMoment(avec(vus, { mode: 'absence' }, illisible))[0].sous, 'Absence — aucun planning allumé', String(illisible));
  }
  assert.equal(lignesMoment(avec([ch('chambre', { source: 'maison', mode: 'eco' })], { mode: 'absence' }, null))[0].sous, 'Absence');
});

test('la maison d’abord, puis chaque chauffage dans l’ordre de l’état', () => {
  const lignes = lignesMoment(etat([
    ch('a', { source: 'main', mode: 'confort', fin: '2026-10-10T21:00:00+02:00' }),
    ch('b', { source: 'planning' }),
    ch('c', { source: 'fenetre', mode: 'arret' }),
  ], { mode: 'absence' }));
  assert.deepEqual(lignes.map(l => l.cle), ['chauffage-maison', 'chauffage:a', 'chauffage:c']);
});

test('chaque ligne a sa forme, ses icônes et ses jetons, et rien d’illisible', () => {
  /* ASSERTIONS MODIFIÉES (tâche 12) : deux chauffages de plus — une reprise
   * qui finit demain, un chauffage introuvable — donc dix lignes et sept
   * clés ; chaque ligne porte aussi `chauffage`, la clé de la fiche qu'elle
   * ouvre (null pour la maison). */
  const lignes = [
    ...lignesMoment(etat([
      ch('f', { source: 'fenetre', mode: 'eco' }),
      ch('m', { source: 'main', mode: 'hors_gel', fin: '2026-10-10T06:30:00+02:00' }),
      ch('t', { source: 'main', mode: null, reprise: { mode: null, temperature: 20 } }),
      ch('k', { avertissements: ['module_coupe'] }),
      ch('n', { source: 'main', mode: 'confort_2', entite: null, nom: null }),
      ch('d', { source: 'main', mode: 'eco', fin: '2026-10-13T07:30:00+02:00' }),
      ch('i', { entite: null, nom: null, avertissements: ['introuvable'] }),
    ], { mode: 'absence' })),
    ...lignesMoment(etat([], { mode: 'vacances', vacances_fin: '2026-11-02T00:00:00+01:00' })),
    ...lignesMoment(etat([], { mode: 'ete' })),
  ];
  assert.equal(lignes.length, 10);
  assert.equal(new Set(lignes.filter(l => l.cle !== 'chauffage-maison').map(l => l.cle)).size, 7, 'une clé par chauffage');
  const police = lire('public/fonts/uicons-regular-rounded.css');
  const css = lire('src/index.css');
  for (const l of lignes) {
    assert.deepEqual(Object.keys(l).sort(), ['chauffage', 'cle', 'entite', 'icone', 'nom', 'rgb', 'sous']);
    assert.equal(l.chauffage, l.cle === 'chauffage-maison' ? null : l.cle.slice('chauffage:'.length), 'la clé de la fiche qu’ouvre la ligne');
    assert.ok(police.includes('.fi-rr-' + l.icone + ':before'), l.icone + ' : une icône que la police ne dessine pas');
    const jeton = /^var\(--o-([a-z0-9]+)-rgb\)$/.exec(l.rgb);
    assert.ok(jeton && css.includes('--o-' + jeton[1] + '-rgb:'), l.rgb + ' : pas un jeton -rgb de Loggia');
    for (const texte of [l.nom, l.sous]) {
      assert.equal(typeof texte, 'string');
      assert.ok(texte.trim(), 'un texte vide');
      assert.ok(!/undefined|null|NaN|\{|\}|confort_|hors_gel|arret|T\d\d:\d\d|\+0\d:00/.test(texte), JSON.stringify(texte));
    }
  }
  assert.equal(lignes.find(l => l.cle === 'chauffage:n').nom, 'Chauffage', 'un chauffage sans nom ni entité se dit « Chauffage »');
  assert.equal(lignes.find(l => l.cle === 'chauffage:n').entite, null);
});

/* ── La carte 1a (tâche 10 bis A) : sa phrase, et ce qu'il lui faut pour l'écrire ── */

test('le jour d’une fin se lit ici : la carte l’écrit sans charger le calcul, la fiche lit la même fonction', async () => {
  /* `jourDeLaFin` vivait dans chauffageplanning.js, chargé avec la fiche ; la
   * carte, dans le paquet de démarrage, ne l'importe pas (choix 4). Elle vit
   * ici, et son ancien fichier la réexporte : ses tests y passent tels quels. */
  const planning = await import('../src/chauffageplanning.js');
  assert.equal(planning.jourDeLaFin, jourDeLaFin, 'deux fonctions : la fiche et la carte compteraient les jours chacune à sa façon');
  const DIMANCHE = '2026-10-11T21:00:00+02:00';
  assert.deepEqual(jourDeLaFin('2026-10-12T07:30:00+02:00', DIMANCHE), { dans: 1, jour: 0 });
  assert.equal(jourDeLaFin('2026-10-12T07:30:00+02:00', null), null);
});

test('la fin d’un créneau ou d’une reprise : son heure murale, « demain », ou le nom du jour', () => {
  const DIMANCHE = '2026-10-11T21:00:00+02:00';   // dimanche 11 octobre 2026, 21:00 à la maison
  assert.deepEqual(finMurale('2026-10-11T22:30:00+02:00', DIMANCHE), { heure: '22:30', demain: false, jour: null }, 'ce soir');
  assert.deepEqual(finMurale('2026-10-12T07:30:00+02:00', DIMANCHE), { heure: '07:30', demain: true, jour: null }, 'demain');
  assert.deepEqual(finMurale('2026-10-13T07:30:00+02:00', DIMANCHE), { heure: '07:30', demain: false, jour: 'mardi' },
    'au-delà, le jour tel qu’on l’écrit au milieu d’une phrase');
  // Los Angeles (en tête du fichier) : une conversion de fuseau aurait dit 22:30 la veille.
  assert.deepEqual(finMurale('2026-10-12T07:30:00+02:00', new Date(2026, 9, 11, 21, 0).getTime()), { heure: '07:30', demain: true, jour: null },
    'sans « maintenant » du serveur, la date du navigateur');
  assert.deepEqual(finMurale('2026-10-13T07:30:00+02:00', null), { heure: '07:30', demain: false, jour: null }, 'sans référence lisible : l’heure seule');
  for (const illisible of [null, undefined, '', 'demain', '2026-10-10T24:00:00+02:00', 42]) {
    assert.equal(finMurale(illisible, DIMANCHE), null, JSON.stringify(illisible));
  }
});

test('un jour au milieu d’une phrase : en minuscules en français — la fiche le lit ici, sans copie (tâche 10 bis B)', () => {
  assert.deepEqual([0, 1, 6].map(jourEnPhrase), ['lundi', 'mardi', 'dimanche']);
  const fiche = lire('src/fichechauffage.jsx');
  assert.ok(!fiche.includes('const jourEnPhrase =') && !fiche.includes('\nfunction finMurale('), 'la fiche garde sa copie');
});

/* La plaque d'un chauffage — l'icône de sa carte, la plaque de l'en-tête de
 * sa fiche (tâche 10 bis B) : UNE règle, qui vit ici, au démarrage. */
test('la plaque : l’orange de la chauffe, le bleu du froid, éteinte au gris ; sinon la teinte du mode, ou le neutre', () => {
  assert.deepEqual(plaqueMode({ chauffe: true, mode: 'eco' }), ['rgba(var(--o-warn2-rgb),.2)', 'var(--o-warn2)'], 'la chauffe l’emporte sur le mode');
  assert.deepEqual(plaqueMode({ chauffe: true, eteint: true }), ['rgba(var(--o-warn2-rgb),.2)', 'var(--o-warn2)'], 'mesurée, même à l’Arrêt');
  assert.deepEqual(plaqueMode({ froid: true }), ['rgba(var(--o-cold-rgb),.2)', 'var(--o-cold)']);
  assert.deepEqual(plaqueMode({ eteint: true, mode: 'eco' }), ['var(--o-s1)', 'var(--o-text3)']);
  assert.deepEqual(plaqueMode({ mode: 'eco' }), ['rgba(var(--o-purple-rgb),.16)', 'var(--o-purple)']);
  assert.deepEqual(plaqueMode({ mode: 'confort_1' }), ['rgba(var(--o-warn2-rgb),.16)', 'rgba(var(--o-warn2-rgb),.7)']);
  assert.deepEqual(plaqueMode({ mode: 'hors_gel' }), ['rgba(var(--o-cyan-rgb),.16)', 'var(--o-cyan)']);
  for (const neutre of [{}, { mode: null }, { mode: 'arret' }, { mode: 'turbo' }, undefined]) {
    assert.deepEqual(plaqueMode(neutre), ['var(--o-s1)', 'var(--o-text1)'], JSON.stringify(neutre));
  }
  // La carte et la fiche la lisent toutes deux : pas de seconde règle.
  const app = MONOLITHE;
  assert.ok(/const plaqueChauffage = \(o\) => \{ const \[fond, encre\] = plaqueMode\(o\); return RM_ICO\(fond, encre\); \};/.test(app), 'la carte a sa propre règle');
  assert.ok(lire('src/fichechauffage.jsx').includes('plaqueMode({'), 'la fiche a sa propre règle');
});

/* L'étiquette sous la valeur d'une carte dit QUI décide (réserve de la carte,
 * prise à la partie B). */
test('l’étiquette d’une carte : PLANNING, MANUEL, MODE au planning ; CONSIGNE, MODE ou MANUEL hors du planning', () => {
  // Au planning : le planning — sa propre bande Arrêt comprise — et la maison.
  assert.equal(etiquetteCarte({ auPlanning: true, source: 'planning' }), 'planning');
  assert.equal(etiquetteCarte({ auPlanning: true, source: 'planning', eteint: true }), 'planning', 'sa propre bande Arrêt');
  assert.equal(etiquetteCarte({ auPlanning: true, source: 'maison', eteint: true }), 'planning', 'l’Été de la maison');
  assert.equal(etiquetteCarte({ consigne: true, auPlanning: true, source: 'planning' }), 'planning', 'un thermostat aussi');
  // Une reprise en main — la bascule qui coupe comprise : l'Arrêt ne l'emporte plus.
  assert.equal(etiquetteCarte({ auPlanning: true, source: 'main' }), 'manuel');
  assert.equal(etiquetteCarte({ auPlanning: true, source: 'main', eteint: true }), 'manuel', 'la bascule qui coupe est une reprise');
  assert.equal(etiquetteCarte({ consigne: true, auPlanning: true, source: 'main', eteint: true }), 'manuel');
  // Une fenêtre ouverte impose son mode.
  assert.equal(etiquetteCarte({ auPlanning: true, source: 'fenetre' }), 'mode');
  assert.equal(etiquetteCarte({ consigne: true, auPlanning: true, source: 'fenetre', eteint: true }), 'mode');
  // Hors du planning — éteint, en observation, ou sans l'état du moteur.
  assert.equal(etiquetteCarte({ consigne: true }), 'consigne', 'un thermostat, une zone décrite à la main');
  assert.equal(etiquetteCarte({ consigne: true, eteint: true }), 'consigne');
  assert.equal(etiquetteCarte({ eteint: true }), 'mode', 'un module à l’arrêt');
  assert.equal(etiquetteCarte({}), 'manuel', 'un module en marche');
  assert.equal(etiquetteCarte(), 'manuel');
});

/* Un chauffage au planning tel que `loggia/chauffage/etat` le rend, et l'état
 * qui le porte : lundi 12 octobre 2026, 10:30 à la maison. */
const auPlanning = (champs) => ({
  cle: 'bureau', entite: 'select.bureau', famille: 'fil_pilote', planning: true, modes: TOUS, mode: 'eco', source: 'planning',
  fin: '2026-10-12T22:30:00+02:00', puis: 'hors_gel', reprise: null, fenetre: 'arret', fenetre_ouverte: false, ...champs,
});
const lundi = (maison = { mode: 'planning' }) => ({ maison, maintenant: '2026-10-12T10:30:00+02:00', minute: [0, 630], simulation: false });
const reprise = (fin, champs = {}) => auPlanning({ source: 'main', mode: 'confort', fin,
  reprise: { mode: 'confort', temperature: null, fin, depuis: '2026-10-12T10:00:00+02:00', par: null }, ...champs });

/* Son choix du 12/10, « Ne pas répéter le bas » : l'état ne redit plus ce que
 * le bas de la carte dit déjà — l'étiquette dit PLANNING ou MANUEL, la valeur
 * le mode. « Planning · jusqu’à 07… » se coupait à 360 px, et la nuit « …
 * jusqu’à demain 07:30 » même sur ordinateur. */

test('au planning, la carte dit jusqu’à quand — l’étiquette dit déjà PLANNING : « jusqu’à 22:30 », demain, un autre jour, toute la semaine', () => {
  assert.equal(phrasePlanning(auPlanning(), lundi()), 'jusqu’à 22:30');
  assert.equal(phrasePlanning(auPlanning({ fin: '2026-10-13T07:30:00+02:00' }), lundi()), 'jusqu’à demain 07:30');
  assert.equal(phrasePlanning(auPlanning({ fin: '2026-10-14T07:30:00+02:00' }), lundi()), 'jusqu’à mercredi 07:30');
  assert.equal(phrasePlanning(auPlanning({ fin: null, puis: null }), lundi()), 'toute la semaine', 'plus rien ne change de la semaine');
  assert.equal(phrasePlanning(auPlanning({ fin: 'bientôt' }), lundi()), 'Planning', 'une fin illisible : aucune heure inventée, le mot de l’étiquette');
  // Sans « maintenant » du serveur : l'horloge du navigateur, à sa date locale.
  const navigateur = new Date(2026, 9, 12, 10, 30).getTime();
  assert.equal(phrasePlanning(auPlanning({ fin: '2026-10-13T07:30:00+02:00' }), { maison: { mode: 'planning' } }, navigateur),
    'jusqu’à demain 07:30');
});

test('une reprise en main se dit par SA fin — l’étiquette dit déjà MANUEL : l’heure, demain, le jour, ou sans limite', () => {
  assert.equal(phrasePlanning(reprise('2026-10-12T22:30:00+02:00'), lundi()), 'jusqu’à 22:30');
  assert.equal(phrasePlanning(reprise('2026-10-13T07:30:00+02:00'), lundi()), 'jusqu’à demain 07:30');
  assert.equal(phrasePlanning(reprise('2026-10-19T07:30:00+02:00'), lundi()), 'jusqu’à lundi 07:30', 'lundi prochain');
  assert.equal(phrasePlanning(reprise(null), lundi()), 'sans limite', 'jusqu’à relance');
  assert.equal(phrasePlanning(reprise('bientôt'), lundi()), 'Manuel', 'une fin illisible : ni heure ni « sans limite » inventées, le mot de l’étiquette');
  // Une reprise en température (un thermostat) se dit de même.
  const poele = reprise('2026-10-12T22:30:00+02:00', { famille: 'thermostat', mode: null });
  poele.reprise = { ...poele.reprise, mode: null, temperature: 21.5 };
  assert.equal(phrasePlanning(poele, lundi()), 'jusqu’à 22:30');
});

test('une fenêtre qui coupe, la maison hors Planning : ce qui décide à la place du planning', () => {
  // « Fenêtre ouverte » suffit : la valeur dit déjà l'Arrêt ou l'Éco qu'elle impose.
  assert.equal(phrasePlanning(auPlanning({ source: 'fenetre', mode: 'arret', fenetre_ouverte: true }), lundi()), 'Fenêtre ouverte');
  assert.equal(phrasePlanning(auPlanning({ source: 'fenetre', mode: 'eco', fenetre: 'eco', fenetre_ouverte: true }), lundi()), 'Fenêtre ouverte',
    'son réglage, l’Éco plutôt que l’Arrêt, se lit dans la valeur');
  // « Ne rien faire » ne décide jamais (mode_voulu, chauffage_calcul.py) : lu quand même, la même phrase.
  assert.equal(phrasePlanning(auPlanning({ source: 'fenetre', fenetre: 'rien' }), lundi()), 'Fenêtre ouverte');
  assert.equal(phrasePlanning(auPlanning({ source: 'maison' }), lundi({ mode: 'absence', absence: 'eco' })), 'Absence');
  assert.equal(phrasePlanning(auPlanning({ source: 'maison', mode: 'arret' }), lundi({ mode: 'ete' })), 'Été');
  assert.equal(phrasePlanning(auPlanning({ source: 'maison', mode: 'hors_gel' }), lundi({ mode: 'vacances', vacances_fin: '2026-10-20T00:00:00+02:00' })),
    'Vacances jusqu’au 20 oct.');
  assert.equal(phrasePlanning(auPlanning({ source: 'maison', mode: 'hors_gel' }), lundi({ mode: 'vacances', vacances_fin: null })), 'Vacances');
  // Une maison illisible ne fait pas taire le planning.
  assert.equal(phrasePlanning(auPlanning({ source: 'maison' }), lundi({ mode: 'turbo' })), 'jusqu’à 22:30');
  assert.equal(phrasePlanning(auPlanning({ source: 'maison' }), { maintenant: '2026-10-12T10:30:00+02:00' }), 'jusqu’à 22:30');
});

test('chaque phrase de la carte est une phrase entière, sans rien d’illisible — et sans redire le bas de la carte', () => {
  const phrases = [
    phrasePlanning(auPlanning(), lundi()), phrasePlanning(auPlanning({ fin: '2026-10-14T07:30:00+02:00' }), lundi()),
    phrasePlanning(auPlanning({ fin: null }), lundi()),
    phrasePlanning(reprise('2026-10-13T07:30:00+02:00'), lundi()), phrasePlanning(reprise(null), lundi()),
    phrasePlanning(auPlanning({ source: 'fenetre', fenetre: 'eco', mode: 'eco' }), lundi()),
    phrasePlanning(auPlanning({ source: 'fenetre', fenetre: 'rien' }), lundi()),
  ];
  for (const p of phrases) {
    assert.equal(typeof p, 'string');
    assert.ok(!/undefined|null|NaN|\{|\}|confort_|hors_gel|arret|T\d\d:\d\d|\+0\d:00/.test(p), JSON.stringify(p));
    // Ni « Planning · », ni « À la main · », ni le mode d'une fenêtre : l'étiquette et la valeur les disent.
    assert.ok(!/ · |Planning|À la main|arrêt|éco/i.test(p), JSON.stringify(p));
  }
});

test('une mesure lisible, ou rien : jamais un zéro inventé', () => {
  assert.equal(mesureLisible(20.9), 20.9);
  assert.equal(mesureLisible('19.2'), 19.2, 'l’état d’un capteur est un texte');
  assert.equal(mesureLisible(0), 0, 'zéro mesuré reste zéro');
  assert.equal(mesureLisible(-3.5), -3.5);
  for (const rien of [null, undefined, '', ' ', 'unavailable', 'unknown', NaN, Infinity, -Infinity, {}, [], true]) {
    assert.equal(mesureLisible(rien), null, JSON.stringify(rien));
  }
});

/* ── Relecture de la partie A ─────────────────────────────────────────────── */

test('un module muet : son select manque ou ne dit rien — le select seul, pas l’avis du moteur', async () => {
  const planning = await import('../src/chauffageplanning.js');
  assert.equal(planning.estMuet, estMuet, 'la fiche et la carte lisent la même règle, réexportée');
  for (const muet of ['unavailable', 'unknown', 'Unavailable', 'none', '', null, undefined]) assert.equal(estMuet(muet), true, JSON.stringify(muet));
  for (const vivant of ['eco', 'off', 'heat', 0]) assert.equal(estMuet(vivant), false, JSON.stringify(vivant));
  assert.equal(moduleMuet(null), true, 'un select qui manque');
  assert.equal(moduleMuet({ state: 'unavailable' }), true);
  assert.equal(moduleMuet({ state: 'unknown' }), true);
  assert.equal(moduleMuet({ state: 'eco' }), false);
  /* Relecture de la dernière passe : l'avis « injoignable » du moteur vient du
   * MÊME select, et n'ajoute qu'un retard — l'état du moteur se relit toutes
   * les 60 s : un module revenu restait « Indisponible » jusqu'à une minute. */
  assert.equal(moduleMuet({ state: 'eco' }, { avertissements: ['injoignable'] }), false, 'le select répond : le module aussi');
  assert.equal(moduleMuet.length, 1, 'moduleMuet ne lit plus que le select');
});

test('LA règle « chauffe », la même pour la carte et pour Objets', () => {
  // Un module : son capteur de puissance présent, et plus de 10 W — la mesure, même à l'Arrêt.
  assert.equal(enChauffe({ famille: 'module', watts: 612 }), true);
  assert.equal(enChauffe({ famille: 'module', watts: 10 }), false, 'plus de 10 W, pas 10');
  assert.equal(enChauffe({ famille: 'module', watts: null }), false, 'sans capteur de puissance, jamais : un module en Éco n’est pas « en chauffe »');
  assert.equal(enChauffe({ famille: 'module', watts: NaN }), false);
  assert.equal(enChauffe({ famille: 'module', watts: 1500, marche: false }), true, 'à l’Arrêt, un radiateur qui tire du courant chauffe');
  assert.equal(enChauffe({ famille: 'module', watts: 1500, muet: true }), false, 'muet, il ne chauffe pas : sa carte dit « Indisponible »');
  // Un thermostat : en marche, et `hvac_action` à `heating` — ou `preheating` : préchauffer, c'est chauffer.
  assert.equal(enChauffe({ famille: 'thermostat', marche: true, action: 'heating' }), true);
  assert.equal(enChauffe({ famille: 'thermostat', marche: true, action: 'preheating' }), true, 'un préchauffage est une chauffe');
  assert.equal(enChauffe({ famille: 'thermostat', marche: false, action: 'preheating' }), false);
  assert.equal(enChauffe({ famille: 'thermostat', marche: false, action: 'heating' }), false, 'éteint, un `heating` resté dans ses attributs ne compte pas');
  assert.equal(enChauffe({ famille: 'thermostat', marche: true, action: 'idle' }), false);
  assert.equal(enChauffe({ famille: 'thermostat', marche: true, action: 'cooling' }), false, 'un climatiseur qui refroidit ne chauffe pas');
  assert.equal(enChauffe({ famille: 'thermostat', marche: true, action: 'heating', muet: true }), false);
  // Une zone décrite à la main : en marche, la pièce sous sa consigne, toutes deux lisibles.
  assert.equal(enChauffe({ famille: 'zone', marche: true, mesure: 18.5, consigne: 19 }), true);
  assert.equal(enChauffe({ famille: 'zone', marche: true, mesure: 19.2, consigne: 19 }), false);
  assert.equal(enChauffe({ famille: 'zone', marche: false, mesure: 15, consigne: 19 }), false);
  for (const [mesure, consigne] of [[null, 19], [18, null], [NaN, 19], ['18', 19]]) {
    assert.equal(enChauffe({ famille: 'zone', marche: true, mesure, consigne }), false, 'jamais contre une mesure ou une consigne vide : ' + JSON.stringify([mesure, consigne]));
  }
  assert.equal(enChauffe(), false);
});

test('« consigne atteinte » se mesure : la pièce lisible, et proche de la consigne', () => {
  // En chauffe : au moins la consigne − 0,2°.
  assert.equal(consigneAtteinte(19.8, 20, 'heat'), true);
  assert.equal(consigneAtteinte(21, 20, 'heat'), true, 'au-dessus, elle est atteinte');
  assert.equal(consigneAtteinte(19.7, 20, 'heat'), false);
  assert.equal(consigneAtteinte(16, 20, 'heat'), false, 'un `idle` à 16° pour 20° : une fenêtre, une veille, un dégivrage — rien d’atteint');
  // En froid : au plus la consigne + 0,2°.
  assert.equal(consigneAtteinte(23.2, 23, 'cool'), true);
  assert.equal(consigneAtteinte(22, 23, 'cool'), true);
  assert.equal(consigneAtteinte(23.4, 23, 'cool'), false);
  /* ASSERTION MODIFIÉE (relecture de la dernière passe) : « Les autres modes se
   * lisent comme la chauffe » disait atteinte une pièce en `auto` à 21° pour
   * 20°. En `auto` et en `heat_cool` à consigne unique, l'appareil chauffe OU
   * refroidit vers elle : atteinte à 0,2° près, dans les deux sens. */
  assert.equal(consigneAtteinte(20, 20, 'auto'), true);
  assert.equal(consigneAtteinte(20.2, 20, 'auto'), true);
  assert.equal(consigneAtteinte(19.8, 20, 'heat_cool'), true);
  assert.equal(consigneAtteinte(21, 20, 'auto'), false, 'un degré au-dessus : l’ancien choix la disait atteinte');
  assert.equal(consigneAtteinte(19.7, 20, 'heat_cool'), false);
  assert.equal(consigneAtteinte(20.3, 20, 'heat_cool'), false);
  // Un appareil qui sèche ou ventile ne vise pas de température : jamais « atteinte ».
  assert.equal(consigneAtteinte(20, 20, 'dry'), false);
  assert.equal(consigneAtteinte(20, 20, 'fan_only'), false);
  // En Fahrenheit, la marge vaut 0,4 °F ; en Celsius, 0,2 °C, l'unité par défaut.
  assert.equal(consigneAtteinte(67.6, 68, 'heat', 'F'), true);
  assert.equal(consigneAtteinte(67.5, 68, 'heat', 'F'), false);
  assert.equal(consigneAtteinte(68.4, 68, 'cool', 'F'), true);
  assert.equal(consigneAtteinte(68.5, 68, 'cool', 'F'), false);
  assert.equal(consigneAtteinte(67.6, 68, 'auto', 'F'), true, 'à 0,4 °F près, sans que l’arrondi du flottant ne l’écarte');
  assert.equal(consigneAtteinte(68.5, 68, 'auto', 'F'), false);
  assert.equal(consigneAtteinte(19.7, 20, 'heat', 'C'), false);
  // Sans mesure ni consigne lisibles : rien.
  for (const [m, c] of [[null, 20], [undefined, 20], ['unavailable', 20], [20, null], [NaN, 20]]) {
    assert.equal(consigneAtteinte(m, c, 'heat'), false, JSON.stringify([m, c]));
  }
  assert.equal(consigneAtteinte('19.9', '20', 'heat'), true, 'les textes d’un capteur se lisent');
});

test('la teinte d’un climat hors des cartes 1a : l’orange de la chauffe, le bleu du froid — jamais le rouge', () => {
  assert.equal(teinteClimat({ state: 'heat', attributes: { hvac_action: 'heating' } }), 'var(--o-warn2)');
  assert.equal(teinteClimat({ state: 'heat', attributes: { hvac_action: 'preheating' } }), 'var(--o-warn2)');
  assert.equal(teinteClimat({ state: 'heat', attributes: { hvac_action: 'idle' } }), 'var(--o-warn2)');
  assert.equal(teinteClimat({ state: 'cool', attributes: {} }), 'var(--o-cold)');
  assert.equal(teinteClimat({ state: 'heat_cool', attributes: { hvac_action: 'cooling' } }), 'var(--o-cold)');
  assert.equal(teinteClimat(null), 'var(--o-warn2)');
  // Une clim qui sèche ou ventile ne prend AUCUNE teinte : ni l'orange, ni le bleu.
  assert.equal(teinteClimat({ state: 'dry', attributes: { hvac_action: 'drying' } }), null);
  assert.equal(teinteClimat({ state: 'fan_only', attributes: { hvac_action: 'fan' } }), null);
});

test('le module reste pur, petit, et hors du calcul', () => {
  const src = lire('src/chauffageecran.js');
  assert.ok(!/from 'react'|callService|callWS|hass\./.test(src), 'ni React ni Home Assistant');
  assert.ok(!/from '\.\/chauffage\.js'/.test(src), 'le calcul entrerait dans le paquet de démarrage');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/.test(src), 'une couleur en dur');
  assert.ok(!/['"`](select|climate|switch)\.[a-z0-9_]{3,}['"`]/.test(src), 'une entité en dur');
});
