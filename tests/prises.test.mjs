/* Ce qu'il y a au bout d'une prise (26/09).
 *
 * « Modifie les cartes prises avec celles-ci, et de façon à ce que l'appareil
 * soit bien reconnu pour afficher la bonne carte. »
 *
 * La reconnaissance se joue sur le NOM — Home Assistant ne publie ni marque ni
 * modèle pour une prise commandée. Les pièges sont donc des pièges de mots :
 * « sèche-linge » contient « linge », « lave-vaisselle » contient « lave », et
 * les gens écrivent avec ou sans accents. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TYPES_PRISE, NOMS_PRISE, typeDePrise } from '../src/prises.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

test('les mots se comparent ENTIERS, pas en sous-chaîne', () => {
  // Le piege general : un mot court se cache dans un mot long. Compare en
  // sous-chaine, « telephone » contenait « tele », « boxe » contenait « box »,
  // et « environnement » contiendra « iron » le jour ou un fer arrivera.
  assert.equal(typeDePrise('Telephone salon'), 'prise', 'un téléphone n’est pas une télé');
  assert.equal(typeDePrise('Sac de boxe'), 'prise', 'un sac de boxe n’est pas une box');
  assert.equal(typeDePrise('Environnement bureau'), 'prise');
  // Et le mot entier continue de se reconnaitre, colle a n'importe quel separateur.
  assert.equal(typeDePrise('TV-salon'), 'tv');
  assert.equal(typeDePrise('switch.prise_tv_chambre', null, 'switch.prise_tv_chambre'), 'tv');
  assert.equal(typeDePrise('Prise LV'), 'lv', 'les abréviations n’ont plus besoin d’espaces écrites à la main');
});

test('le polonais se reconnaît comme le français', () => {
  // L'interface parle sept langues depuis la 3.72 ; les noms de prises aussi.
  assert.equal(typeDePrise('Pralka'), 'll');
  assert.equal(typeDePrise('Zmywarka kuchnia'), 'lv');
  assert.equal(typeDePrise('Lodówka'), 'frigo', 'les accents polonais tombent comme les français');
  assert.equal(typeDePrise('Chłodziarka'), 'frigo', 'le « ł » n’a pas de décomposition NFD — il est traité à part');
  assert.equal(typeDePrise('Ekspres do kawy'), 'cafe');
  assert.equal(typeDePrise('Telewizor salon'), 'tv');
  assert.equal(typeDePrise('Grzejnik łazienka'), 'radia');
  assert.equal(typeDePrise('Syrena'), 'siren');
  // Le piege polonais : « suszarka » est aussi un seche-CHEVEUX. Il passe donc
  // en seche-linge, jamais en lave-linge.
  assert.equal(typeDePrise('Suszarka'), 'sl');
});

test('l’appareil se reconnaît à son nom, pièges compris', () => {
  assert.equal(typeDePrise('Prise Lave-vaisselle'), 'lv');
  assert.equal(typeDePrise('Prise lave vaisselle cuisine'), 'lv');
  // Le piege : « seche-linge » contient « linge ».
  assert.equal(typeDePrise('Sèche-linge'), 'sl', 'un sèche-linge n’est pas un lave-linge');
  assert.equal(typeDePrise('Lave-linge buanderie'), 'll');
  assert.equal(typeDePrise('PRISE FRIGO'), 'frigo', 'la casse ne compte pas');
  assert.equal(typeDePrise('Réfrigérateur'), 'frigo');
  assert.equal(typeDePrise('refrigerateur'), 'frigo', 'les accents non plus');
  assert.equal(typeDePrise('Prise NAS'), 'nas');
  assert.equal(typeDePrise('Cafetière cuisine'), 'cafe');
  assert.equal(typeDePrise('Borne de recharge garage'), 've');
  assert.equal(typeDePrise('Box fibre'), 'box');
  assert.equal(typeDePrise('Radiateur bureau'), 'radia');
  assert.equal(typeDePrise('Sirène extérieure'), 'siren');
});

test('ce qu’on ne reconnaît pas reste une prise, et un choix explicite prime', () => {
  assert.equal(typeDePrise('Prise Séjour'), 'prise', 'rien n’est inventé');
  assert.equal(typeDePrise(''), 'prise');
  assert.equal(typeDePrise(null), 'prise');
  assert.equal(typeDePrise('Prise Séjour', 'cafe'), 'cafe', 'le choix passe devant le nom');
  assert.equal(typeDePrise('Prise Séjour', 'inconnu'), 'prise', 'un type qui n’existe pas est ignoré');
});

test('l’identifiant compte quand le nom ne dit rien', () => {
  // Une prise peut s'appeler « Prise 3 » et s'appeler `switch.lave_vaisselle`
  // dessous : c'est le cas signale le 26/09.
  assert.equal(typeDePrise('Prise 3'), 'prise', 'le nom seul ne dit rien');
  assert.equal(typeDePrise('Prise 3', null, 'switch.lave_vaisselle'), 'lv', 'l’identifiant, lui, le dit');
  assert.equal(typeDePrise('Prise cuisine', null, 'switch.seche_linge'), 'sl');
  assert.equal(typeDePrise('Prise LV'), 'lv', 'le sigle, s’il est un mot a lui');
  assert.equal(typeDePrise('Prise salon'), 'prise', 'un sigle noye dans un mot ne compte pas');
});

/* TESTS RETIRÉS (chantier Prises, tâche 7, P10 et P11) : `modePrise`,
 * `motDuMode`, `animationPrise`, `couleurPrise` et `libelleType` sont partis
 * avec la carte d'avant. La phrase d'état du § 4 dit ce que fait l'appareil
 * (plus « En veille », « Chauffe », « Compresseur »), la maquette est
 * immobile, et le type passe dans l'en-tête de la fiche. */
test('P10, P11 : les mots, l’animation et l’étiquette d’avant sont partis', async () => {
  const P = await import('../src/prises.js');
  for (const nom of ['modePrise', 'motDuMode', 'animationPrise', 'couleurPrise', 'libelleType']) assert.equal(P[nom], undefined, nom + ' est revenu');
  for (const [id, t] of Object.entries(TYPES_PRISE)) assert.deepEqual(Object.keys(t).sort(), ['col', 'ico', 'rgb'], id + ' : un mot ou un mouvement à lui');
});

test('la table : des jetons, des glyphes qui existent, et un nom pour chacun', () => {
  const noms = NOMS_PRISE();
  const css = readFileSync(join(RACINE, 'public', 'fonts', 'uicons-regular-rounded.css'), 'utf8');
  const maison = readFileSync(join(RACINE, 'src', 'icones.jsx'), 'utf8');
  const dessins = readFileSync(join(RACINE, 'src', 'dessins.js'), 'utf8');
  for (const [id, t] of Object.entries(TYPES_PRISE)) {
    assert.match(t.col, /^var\(--o-[a-z0-9-]+\)$/, id + ' : une couleur en dur');
    assert.match(t.rgb, /^var\(--o-[a-z0-9-]+-rgb\)$/, id + ' : le rgb doit aller avec la couleur');
    assert.equal(t.rgb, t.col.replace(')', '-rgb)'), id + ' : la couleur et son rgb ne vont pas ensemble');
    /* Trois sources possibles, dans l'ordre ou `Ico` les lit : l'appareil
     * DESSINE (`dessins.js`), le trace maison (`icones.jsx`), le glyphe de la
     * fonte. L'electromenager n'existe dans aucune fonte — d'ou les dessins. */
    if (t.ico) assert.ok(dessins.includes("\n  '" + t.ico + "':") || maison.includes('\n  ' + t.ico + ':') || css.includes('fi-rr-' + t.ico + ':'),
      id + ' : le glyphe ' + t.ico + ' n’existe ni en dessin, ni en trace maison, ni dans la fonte');
    assert.ok(noms[id], id + ' n’a pas de nom traduit');
  }
  assert.equal(TYPES_PRISE.prise.ico, null, 'la prise ordinaire garde le dessin de prise de Loggia');
});

/* ── Chantier Prises (13/10) : ce qu'est une prise, sa phrase, son type écrit ──
 *
 * Les verdicts cas par cas sont ceux de la fixture partagée avec le serveur
 * (tests/prises_parite.test.mjs) ; ici, ce que la règle promet en plus, la
 * phrase d'état du § 4 ligne par ligne, et les mots de l'en-tête de la fiche.
 * À l'heure de Paris : la phrase dit l'heure du navigateur. */
process.env.TZ = 'Europe/Paris';
const P = await import('../src/prises.js');
const { fmtWatts } = await import('../src/format.js');
const T = Date.parse('2026-10-13T20:40:00+02:00');           // mardi 13 octobre, 20:40 à la maison
const ETAT = (state, changement = '2026-10-13T08:50:00+02:00') => ({ state, last_changed: changement, attributes: {} });

test('P12 : le lave-vaisselle passe au cyan de sa maquette ; les autres couleurs correspondaient déjà', () => {
  assert.deepEqual([P.TYPES_PRISE.lv.col, P.TYPES_PRISE.lv.rgb], ['var(--o-cyan)', 'var(--o-cyan-rgb)']);
  assert.deepEqual([P.TYPES_PRISE.nas.col, P.TYPES_PRISE.pc.col, P.TYPES_PRISE.radia.col], ['var(--o-purple)', 'var(--o-piece-ambre)', 'var(--o-warn2)']);
  assert.equal(P.TYPES_PRISE.lv.ico, 'dishwasher', 'les glyphes restent les siens');
});

test('P1 : le pont de Zigbee2MQTT se reconnaît à son appareil, au caractère près, jamais à son nom', () => {
  assert.equal(P.estPontZigbee({ fabricant: 'Zigbee2MQTT', modele: 'Bridge' }), true);
  assert.equal(P.estPontZigbee({ fabricant: 'zigbee2mqtt', modele: 'bridge' }), false, 'au caractère près, comme le serveur');
  assert.equal(P.estPontZigbee({ fabricant: 'Zigbee2MQTT', modele: 'Group' }), false, 'un groupe Zigbee2MQTT n’est pas le pont');
  assert.equal(P.estPontZigbee({ fabricant: 'Zigbee2MQTT', modele: 'Smart plug' }), false, 'un appareil Zigbee ordinaire n’est pas le pont');
  assert.equal(P.estPontZigbee(null), false);
  const pont = { entity_id: 'switch.mon_pont', device_class: null, entity_category: null, nom: 'Permit join' };
  assert.deepEqual(P.estPrise({ entite: pont, appareil: { fabricant: 'Zigbee2MQTT', modele: 'Bridge' }, soeurs: [], }), { prise: false, puissance: null, energie: null });
});

test('P1 : seul un switch peut être une prise ; ce qui n’en est pas une n’a pas de capteur', () => {
  const soeurs = [{ entity_id: 'sensor.x_power', device_class: 'power', entity_category: null, nom: 'X Power' }];
  assert.equal(P.estPrise({ entite: { entity_id: 'light.x', nom: 'X' }, soeurs }).prise, false);
  assert.equal(P.estPrise({ entite: { entity_id: 'input_boolean.x', nom: 'X' }, soeurs }).prise, false);
  assert.deepEqual(P.estPrise({ entite: { entity_id: 'switch.x', nom: 'X' }, soeurs, sirene: true }), { prise: false, puissance: null, energie: null });
  assert.deepEqual(P.estPrise({ entite: { entity_id: 'switch.x', nom: 'X' }, soeurs }), { prise: true, puissance: 'sensor.x_power', energie: null });
  assert.deepEqual(P.estPrise({}), { prise: false, puissance: null, energie: null }, 'rien ne casse sans argument');
});

test('P1 : une multiprise — plusieurs switch sur un appareil — ne donne son compteur commun à AUCUNE sortie (audit du 19/10)', () => {
  const sortie = (n) => ({ entity_id: 'switch.multi_' + n, device_class: null, entity_category: null, nom: 'Multiprise sortie ' + n });
  const soeurs = (nom) => [sortie(2), { entity_id: 'sensor.multi_power', device_class: 'power', entity_category: null, nom }];
  const sans = { prise: true, puissance: null, energie: null };
  assert.deepEqual(P.estPrise({ entite: sortie(1), soeurs: soeurs('Power') }), sans,
    'l’appareil mesure : ses sorties sont des prises (P1), mais la puissance de toute la multiprise n’est à aucune');
  assert.deepEqual(P.estPrise({ entite: sortie(1), soeurs: soeurs('Multiprise puissance') }), sans,
    'le mot de l’appareil, que Home Assistant préfixe partout, ne fait plus gagner le compteur commun');
  assert.deepEqual(P.estPrise({ entite: sortie(1), appareil: { fabricant: 'Tuya', modele: 'Strip', nom: 'Multiprise' }, soeurs: soeurs('Multiprise puissance') }), sans);
  const canal = { entity_id: 'sensor.multi_1_power', device_class: 'power', entity_category: null, nom: 'Multiprise puissance 1' };
  assert.equal(P.estPrise({ entite: sortie(1), soeurs: [...soeurs('Multiprise puissance'), canal] }).puissance, 'sensor.multi_1_power', 'un capteur à elle : le sien');
  assert.equal(P.estPrise({ entite: sortie(2), soeurs: [sortie(1), soeurs('x')[1], canal] }).puissance, null, 'celui de la sortie 1 n’est pas à la 2');
  const verrou = { entity_id: 'switch.cafe_verrou', device_class: null, entity_category: 'config', nom: 'Verrou enfant' };
  assert.equal(P.estPrise({ entite: { entity_id: 'switch.cafe', nom: 'Prise café' }, soeurs: [verrou, { entity_id: 'sensor.p', device_class: 'power', entity_category: null, nom: 'Power' }] }).puissance,
    'sensor.p', 'un switch de configuration ne fait pas une multiprise : le seul compteur reste le sien');
});

test('P1 : un voyant ou un verrou publié SANS catégorie n’est pas une sortie — il va dans IoT (audit du 19/10)', () => {
  const p = { entity_id: 'sensor.athom_plug_power', device_class: 'power', entity_category: null, nom: 'Athom Plug Power' };
  const relais = { entity_id: 'switch.athom_plug_relay', device_class: null, entity_category: null, nom: 'Athom Plug Relay' };
  const led = { entity_id: 'switch.athom_plug_led', device_class: null, entity_category: null, nom: 'Athom Plug LED' };
  assert.deepEqual(P.estPrise({ entite: relais, soeurs: [led, p] }), { prise: true, puissance: 'sensor.athom_plug_power', energie: null });
  assert.equal(P.estPrise({ entite: led, soeurs: [relais, p] }).prise, false);
  assert.equal(P.estPrise({ entite: { entity_id: 'switch.bandeau', nom: 'Bandeau LED' }, soeurs: [p] }).prise, true, 'seule sur son appareil, « LED » reste une prise');
  for (const nom of ['Kindersicherung', 'Blocco bambini', 'Bloqueo infantil', 'Kinderslot', 'Blokada rodzicielska', 'Verrou enfant', 'Voyant', 'Power on behavior']) {
    const r = { entity_id: 'switch.x_reglage', device_class: null, entity_category: null, nom };
    assert.equal(P.estPrise({ entite: r, soeurs: [relais, p] }).prise, false, nom);
  }
  const chambre = { entity_id: 'switch.athom_plug_veilleuse', device_class: null, entity_category: null, nom: 'Athom Plug Veilleuse chambre enfant' };
  assert.equal(P.estPrise({ entite: chambre, soeurs: [relais, p] }).prise, true, 'un enfant n’est pas un verrou');
});

test('P1 : le relais d’un compteur de la maison n’est pas une prise — les préférences énergie le disent (décision du 19/10)', () => {
  const prefs = { energy_sources: [{ type: 'grid', flow_from: [{ stat_energy_from: 'sensor.em_energy' }], flow_to: [] }, { type: 'water', stat_energy_from: 'sensor.eau' }] };
  const compteurs = P.compteursMaison(prefs);
  assert.deepEqual(compteurs, ['sensor.em_energy'], 'l’eau n’est pas un compteur de la maison');
  const relais = { entity_id: 'switch.em_relay', device_class: 'outlet', entity_category: null, nom: 'EM Relay' };
  const soeurs = [{ entity_id: 'sensor.em_power', device_class: 'power', entity_category: null, nom: 'EM Power' }, { entity_id: 'sensor.em_energy', device_class: 'energy', entity_category: null, nom: 'EM Energy' }];
  assert.deepEqual(P.estPrise({ entite: relais, soeurs, compteurs }), { prise: false, puissance: null, energie: null }, 'même outlet');
  assert.equal(P.estPrise({ entite: relais, soeurs }).prise, true, 'sans les préférences, rien ne change');
  assert.equal(P.estPrise({ entite: relais, soeurs, compteurs: P.compteursMaison(null) }).prise, true);
});

test('la sirène se lit aussi à ses mots entiers, ceux du type `siren` (audit du 19/10)', async () => {
  const { estSirene } = await import('../src/attention.js');
  const st = (friendly_name) => ({ attributes: { friendly_name } });
  assert.equal(estSirene('switch.prise_3', st('Alarme sonore garage')), true);
  assert.equal(estSirene('switch.syrena_ogrod', st('Ogród')), true);
  assert.equal(estSirene('switch.x', st('Sirena giardino')), true);
  assert.equal(estSirene('switch.alarme_sirene_siren_on', st('Alarme')), true, 'le cas d’avant tient');
  assert.equal(estSirene('switch.alarme', st('Alarme')), false, 'une alarme seule n’est pas une sirène');
  assert.equal(estSirene('switch.prise_nas', st('Prise NAS')), false);
  // Les mots de attention.js sont ceux du type `siren` de MOTS_PRISE : lus dans les deux textes.
  const lire = (fichier, debut, fin) => {
    const s = readFileSync(join(RACINE, 'src', fichier), 'utf8');
    const i = s.indexOf(debut);
    return [...s.slice(i, s.indexOf(fin, i)).matchAll(/'([^']*)'/g)].map(m => m[1]);
  };
  assert.deepEqual(lire('attention.js', 'const MOTS_SIRENE = [', '];'), lire('prises.js', "['siren', [", ']]').slice(1));
});

test('les mots de l’électroménager en allemand, néerlandais, italien et espagnol ; les faux amis restent des prises (audit du 19/10)', () => {
  const cas = {
    ll: ['Waschmaschine', 'Wasmachine', 'Lavatrice', 'Lavadora'],
    lv: ['Geschirrspüler', 'Spülmaschine', 'Vaatwasser', 'Lavastoviglie', 'Lavavajillas'],
    sl: ['Trockner', 'Wäschetrockner', 'Droger', 'Asciugatrice', 'Secadora'],
    frigo: ['Kühlschrank', 'Gefrierschrank', 'Koelkast', 'Frigorifero', 'Frigorífico'],
    cafe: ['Kaffeemaschine', 'Koffiezetapparaat', 'Macchina del caffè', 'Cafetera'],
    tv: ['Fernseher', 'Televisie', 'Televisore', 'Televisor', 'Vidéoprojecteur'],
    pc: ['Rechner', 'Ordenador'],
    fer: ['Bügeleisen', 'Strijkijzer', 'Ferro da stiro', 'Prise fer'],
    radia: ['Heizlüfter', 'Stufa', 'Radiador', 'Sèche-serviettes', 'Sèche-serviette'],
    prise: ['Hair dryer', 'Sèche-cheveux', 'Suszarka do włosów', 'Recharge vélo', 'Recharge trottinette', 'Projecteur jardin', 'Ventilateur tour', 'Lampe Fer forgé'],
  };
  for (const [type, noms] of Object.entries(cas)) for (const nom of noms) assert.equal(typeDePrise(nom), type, nom);
});

test('§ 3.1 : la puissance en deux morceaux, au format de `fmtWatts` — l’unité choisie après l’arrondi', () => {
  assert.deepEqual(P.puissancePrise(146), { v: '146', u: 'W' });
  assert.deepEqual(P.puissancePrise(1950), { v: '1,95', u: 'kW' }, 'deux décimales en kilowatts, comme la maquette');
  assert.deepEqual(P.puissancePrise(999.6), { v: '1,00', u: 'kW' }, '999,6 W s’arrondit à un kilowatt : il s’écrit en kilowatts');
  assert.deepEqual(P.puissancePrise(999.4), { v: '999', u: 'W' });
  assert.deepEqual(P.puissancePrise(-0.4), { v: '0', u: 'W' }, 'jamais « -0 W »');
  assert.deepEqual(P.puissancePrise(null), { v: '—', u: '' });
});

test('§ 3.1 : la courbe, de `debut` à `fin`, de 0 au plus haut point ; moins de deux points, rien', () => {
  const c = P.cheminsCourbe([{ t: 0, w: 0 }, { t: 50, w: 200 }, { t: 100, w: 100 }], { largeur: 240, hauteur: 36, debut: 0, fin: 100 });
  assert.equal(c.ligne, 'M0 36 L120 0 L240 18');
  assert.equal(c.aire, 'M0 36 L120 0 L240 18 L240 36 L0 36 Z', 'l’aire se referme sur la ligne de base');
  assert.equal(P.cheminsCourbe([{ t: 0, w: 0 }, { t: 100, w: 0 }], { largeur: 240, hauteur: 36, debut: 0, fin: 100 }).ligne, 'M0 36 L240 36', 'une journée à zéro : plate, en bas');
  assert.equal(P.cheminsCourbe([{ t: 0, w: 50 }, { t: 100, w: 50 }], { largeur: 100, hauteur: 10, debut: 0, fin: 100, max: 100 }).ligne, 'M0 5 L100 5', 'un plafond donné');
  assert.equal(P.cheminsCourbe([{ t: -50, w: 10 }, { t: 150, w: 10 }], { largeur: 100, hauteur: 10, debut: 0, fin: 100 }).ligne, 'M0 0 L100 0', 'hors de la journée : au bord');
  assert.equal(P.cheminsCourbe([{ t: 0, w: 4 }], { largeur: 240, hauteur: 36, debut: 0, fin: 100 }), null);
  assert.equal(P.cheminsCourbe([{ t: 0, w: 4 }, { t: NaN, w: 4 }, { t: 1, w: null }], { largeur: 240, hauteur: 36, debut: 0, fin: 100 }), null, 'des points illisibles ne comptent pas');
  assert.equal(P.cheminsCourbe(null, { largeur: 240, hauteur: 36, debut: 0, fin: 100 }), null);
});

test('§ 4 : la première ligne qui s’applique, dans l’ordre du tableau', () => {
  assert.deepEqual(P.ELECTROMENAGER, ['lv', 'll', 'sl'], 'P3 : le cycle se repère pour le lave-vaisselle, le lave-linge et le sèche-linge');
  const L = (o) => P.ligneDePrise({ maintenant: T, ...o }).ligne;
  assert.equal(L({ st: null }), 1, 'une entité absente est muette');
  assert.equal(L({ st: ETAT('unavailable'), minuteur: T + 60000 }), 1);
  assert.equal(L({ st: ETAT('unknown') }), 1);
  assert.equal(L({ st: ETAT('off'), minuteur: T + 60000 }), 2, 'coupée, le minuteur ne compte plus');
  assert.equal(L({ st: ETAT('on'), mesure: true, watts: 146, minuteur: T + 1800000 }), 3);
  // Audit des prises (19/10) : un minuteur échu, pas encore relu, ne dit plus « dans 0 min ».
  assert.equal(L({ st: ETAT('on'), mesure: true, watts: 146, minuteur: T }), 7, 'échu à l’instant : plus de minuteur');
  assert.equal(L({ st: ETAT('on'), mesure: true, watts: 146, minuteur: T - 5000 }), 7, 'échu : plus de minuteur');
  const fini = [{ debut: '2026-10-13T13:40:00+02:00', fin: '2026-10-13T16:14:00+02:00', kwh: 1.08 }];
  assert.equal(L({ st: ETAT('on'), mesure: true, watts: 0.4, type: 'lv', cycles: fini }), 4);
  assert.equal(L({ st: ETAT('on'), mesure: true, watts: 2, type: 'lv', cycles: fini }), 7, 'à 2 W, le cycle n’est plus « terminé »');
  assert.equal(L({ st: ETAT('on'), mesure: true, watts: 0.4, type: 'nas', cycles: fini }), 6, 'seul l’électroménager a un cycle');
  const hier = [{ debut: '2026-10-12T13:40:00+02:00', fin: '2026-10-12T16:14:00+02:00', kwh: 1.1 }];
  assert.equal(L({ st: ETAT('on'), mesure: true, watts: 0.4, type: 'lv', cycles: hier }), 6, 'un cycle d’hier ne dit rien d’aujourd’hui');
  assert.equal(L({ st: ETAT('on'), mesure: true, watts: 1950, type: 'lv', cycle: { debut: '2026-10-13T13:40:00+02:00' } }), 5);
  assert.equal(L({ st: ETAT('on'), mesure: true, watts: 0.9 }), 6);
  assert.equal(L({ st: ETAT('on'), mesure: true, watts: 1 }), 7, '1 W : en marche');
  assert.equal(L({ st: ETAT('on'), mesure: true, watts: null }), 7, 'un capteur muet ne fait pas « À l’arrêt »');
  assert.equal(L({ st: ETAT('on'), mesure: false }), 8);
});

test('§ 4 : un cycle EN COURS l’emporte sur celui du matin — pas de « Terminé à » pendant une pause sous 2 W (relecture, point 3)', () => {
  const matin = [{ debut: '2026-10-13T08:00:00+02:00', fin: '2026-10-13T09:30:00+02:00', kwh: 0.9 }];
  const enCours = { debut: '2026-10-13T13:40:00+02:00' };
  const L = (o) => P.ligneDePrise({ maintenant: T, st: ETAT('on'), mesure: true, type: 'lv', ...o });
  // Le second cycle est commencé, la pompe fait une pause à 0,5 W : la ligne 5, pas la ligne 4.
  assert.deepEqual(L({ watts: 0.5, cycles: matin, cycle: enCours }), { ligne: 5, depuis: enCours.debut });
  assert.equal(P.phrasePrise(L({ watts: 0.5, cycles: matin, cycle: enCours }), { maintenant: T }), 'En marche depuis 13:40');
  // Sans cycle en cours, le cycle du matin dit toujours qu'il est terminé.
  assert.equal(L({ watts: 0.5, cycles: matin }).ligne, 4);
  assert.equal(P.phrasePrise(L({ watts: 0.5, cycles: matin }), { maintenant: T }), 'Terminé à 09:30 · 0,90\u00A0kWh');
  assert.equal(L({ watts: 0.5, cycles: matin, cycle: null }).ligne, 4, 'un cycle nul est « pas de cycle »');
  // Un cycle sans début ne se lit pas : il n'en est pas un, la ligne 4 reste celle d'avant.
  assert.equal(L({ watts: 0.5, cycles: matin, cycle: {} }).ligne, 4);
  // En pleine marche, rien de changé : au-dessus de 2 W, c'était déjà la ligne 5.
  assert.equal(L({ watts: 1950, cycles: matin, cycle: enCours }).ligne, 5);
});

test('P5 : un appui sur la bascule d’une prise — le geste d’abord, la fiche si elle existe, sinon deux appuis ; jamais « rien »', () => {
  const A = P.appuiBascule;
  // L'allumer, ou la couper sans garde : le geste d'abord, fiche ou non.
  for (const ouvrable of [false, true]) for (const enDemande of [false, true]) {
    assert.equal(A({ on: false, garde: true, ouvrable, enDemande }), 'basculer', 'allumer ne demande jamais');
    assert.equal(A({ on: true, garde: false, ouvrable, enDemande }), 'basculer', 'sans garde, on coupe');
  }
  // Allumée et gardée, avec une fiche à ouvrir : la fiche demande (le geste de la conception).
  assert.equal(A({ on: true, garde: true, ouvrable: true }), 'fiche');
  // Sans fiche (la compacte de la fiche de l'appareil, un gros interrupteur) : la carte demande, le second appui coupe.
  assert.equal(A({ on: true, garde: true, ouvrable: false }), 'demander');
  assert.equal(A({ on: true, garde: true, ouvrable: false, enDemande: true }), 'couper');
  // Toutes les combinaisons ont un effet.
  for (const on of [false, true]) for (const garde of [false, true]) for (const ouvrable of [false, true]) for (const enDemande of [false, true]) {
    assert.ok(['basculer', 'fiche', 'demander', 'couper'].includes(A({ on, garde, ouvrable, enDemande })), JSON.stringify({ on, garde, ouvrable, enDemande }));
  }
  assert.equal(A(), 'basculer', 'sans argument : rien de gardé');
});

test('§ 4 : les mots de chaque ligne, courts sur la carte, longs dans la fiche', () => {
  const ph = (o, longue = false) => P.phrasePrise(P.ligneDePrise({ maintenant: T, ...o }), { longue, maintenant: T });
  const muette = { st: ETAT('unavailable', '2026-10-13T14:20:00+02:00') };
  assert.equal(ph(muette), 'Indisponible depuis 14:20');
  assert.equal(ph(muette, true), 'Depuis 14:20 · la prise ne répond plus');
  const coupee = { st: ETAT('off', '2026-10-13T20:40:00+02:00') };
  assert.equal(ph(coupee), 'Coupée depuis 20:40');
  assert.equal(ph(coupee, true), 'Depuis 20:40');
  const minuteur = { st: ETAT('on'), mesure: true, watts: 146, minuteur: Date.parse('2026-10-13T21:10:00+02:00') };
  assert.equal(ph(minuteur), 'Se coupe à 21:10');
  assert.equal(ph(minuteur, true), 'Se coupe à 21:10 · dans 30\u00A0min');
  const lv = { st: ETAT('on'), mesure: true, watts: 0, type: 'lv', cycles: [{ debut: '2026-10-13T13:40:00+02:00', fin: '2026-10-13T16:14:00+02:00', kwh: 1.08 }] };
  assert.equal(ph(lv), 'Terminé à 16:14 · 1,08\u00A0kWh');
  assert.equal(ph(lv, true), 'Terminé à 16:14 · 1,08\u00A0kWh', 'la même');
  assert.equal(ph({ ...lv, cycles: [{ ...lv.cycles[0], kwh: null }] }), 'Terminé à 16:14', 'sans énergie connue, l’heure seule');
  assert.equal(ph({ st: ETAT('on'), mesure: true, watts: 1950, cycle: { debut: '2026-10-13T13:40:00+02:00' } }), 'En marche depuis 13:40');
  assert.equal(ph({ st: ETAT('on'), mesure: true, watts: 0.5 }), 'À l’arrêt');
  assert.equal(ph({ st: ETAT('on'), mesure: true, watts: 146 }), 'En marche depuis 08:50');
  assert.equal(ph({ st: ETAT('on') }), 'Allumée depuis 08:50');
});

test('§ 4 : « depuis » est une heure aujourd’hui, une date avant, l’année au-delà d’un an', () => {
  assert.equal(P.quandPrise('2026-10-13T06:30:00+02:00', T), '06:30');
  assert.equal(P.quandPrise('2026-09-02T09:00:00+02:00', T), 'le 2 sept.');
  assert.equal(P.quandPrise('2025-09-02T09:00:00+02:00', T), 'le 2 sept. 2025');
  assert.equal(P.quandPrise(null, T), '—');
  assert.equal(P.phrasePrise(P.ligneDePrise({ st: ETAT('on', '2026-09-02T09:00:00+02:00'), mesure: true, watts: 4, maintenant: T }), { maintenant: T }), 'En marche depuis le 2 sept.');
});

test('T17 (passe téléphone) : la forme courte de la carte étroite — « Depuis le 2 sept. » quand la bascule ou la pastille dit déjà l’état', () => {
  const ph = (o) => P.phrasePrise(P.ligneDePrise({ maintenant: T, ...o }), { courte: true, maintenant: T });
  const avant = '2026-09-02T09:00:00+02:00';
  // En marche ou coupée depuis un autre jour : la date seule (la clé « Depuis {h} » existe dans les sept langues).
  assert.equal(ph({ st: ETAT('on', avant), mesure: true, watts: 4 }), 'Depuis le 2 sept.');
  assert.equal(ph({ st: ETAT('off', avant) }), 'Depuis le 2 sept.');
  // À l'heure, la phrase reste entière : elle tient à 390 et 360 px.
  assert.equal(ph({ st: ETAT('on'), mesure: true, watts: 146 }), 'En marche depuis 08:50');
  assert.equal(ph({ st: ETAT('off', '2026-10-13T20:40:00+02:00') }), 'Coupée depuis 20:40');
  // La panne, le cycle et une prise sans mesure gardent leur phrase.
  assert.equal(ph({ st: ETAT('unavailable', avant) }), 'Indisponible depuis le 2 sept.');
  assert.equal(ph({ st: ETAT('on', avant), mesure: true, watts: 1950, cycle: { debut: avant } }), 'En marche depuis le 2 sept.');
  assert.equal(ph({ st: ETAT('on', avant) }), 'Allumée depuis le 2 sept.');
  // La fiche (`longue`) passe avant, et sans `courte` rien ne change.
  assert.equal(P.phrasePrise(P.ligneDePrise({ st: ETAT('off', avant), maintenant: T }), { longue: true, courte: true, maintenant: T }), 'Depuis le 2 sept.');
  assert.equal(P.phrasePrise(P.ligneDePrise({ st: ETAT('off', avant), maintenant: T }), { maintenant: T }), 'Coupée depuis le 2 sept.');
});

test('les kilowattheures et les durées de sa maquette', () => {
  assert.equal(P.kwhPrise(1.08), '1,08 kWh');
  assert.equal(P.kwhPrise(12.44), '12,4 kWh', 'une décimale au-delà de 10');
  assert.deepEqual([30, 60, 65, 120].map(P.dureePrise), ['30 min', '1 h', '1 h 05', '2 h']);
});

test('F7 : dans les PHRASES, un nombre et son unité sont liés par une espace insécable — les atomes gardent leur espace ordinaire', () => {
  const NB = '\u00A0';
  // Les atomes (`kwhPrise`, `fmtWatts`, `dureePrise`) ne changent PAS : la tuile d'énergie coupe le chiffre et l'unité sur la dernière espace
  // ordinaire (`lastIndexOf(' ')`) pour écrire l'un en grand et l'autre en petit, et d'autres vues s'en servent.
  const ESPACE = ' ';
  for (const atome of [P.kwhPrise(1.08), P.kwhPrise(212.6), fmtWatts(4), fmtWatts(1950), P.dureePrise(30), P.dureePrise(65)]) {
    assert.ok(atome.includes(ESPACE) && !atome.includes(NB), JSON.stringify(atome));
  }
  assert.deepEqual(P.puissancePrise(146), { v: '146', u: 'W' }, 'la carte coupe encore la puissance sur son espace ordinaire');
  assert.equal(P.insecable('1,08 kWh'), '1,08' + NB + 'kWh');
  assert.equal(P.insecable('1 h 05'), '1' + NB + 'h' + NB + '05', 'toutes les espaces de l’atome');
  assert.equal(P.insecable('4 W'), '4' + NB + 'W');
  assert.equal(P.insecable('—'), '—', 'rien à lier');
  // Les phrases : l'espace du nombre à son unité est insécable, celles d'entre les mots restent ordinaires (elles plient).
  const ph = (o, longue = false) => P.phrasePrise(P.ligneDePrise({ maintenant: T, ...o }), { longue, maintenant: T });
  const lv = { st: ETAT('on'), mesure: true, watts: 0, type: 'lv', cycles: [{ debut: '2026-10-13T13:40:00+02:00', fin: '2026-10-13T16:14:00+02:00', kwh: 1.08 }] };
  assert.equal(ph(lv), 'Terminé à 16:14 · 1,08' + NB + 'kWh');
  assert.ok(!/\d kWh/.test(ph(lv)) && ph(lv).split(ESPACE).length === 5, '« Terminé à 16:14 · 1,08 kWh » : quatre espaces ordinaires, aucune entre « 1,08 » et « kWh »');
  const minuteur = { st: ETAT('on'), mesure: true, watts: 146, minuteur: Date.parse('2026-10-13T21:10:00+02:00') };
  assert.ok(!/\d min/.test(ph(minuteur, true)) && ph(minuteur, true).endsWith('dans 30' + NB + 'min'));
  assert.ok(/\d\u00A0h\u00A005/.test(P.phrasePrise({ ligne: 3, fin: T + 65 * 60000 }, { longue: true, maintenant: T })), 'une durée d’une heure cinq : tout d’un bloc');
});

test('§ 3.5 : le type écrit sous le nom de la fiche', () => {
  assert.deepEqual(['nas', 'pc', 'lv', 'll', 'sl', 'fer', 'frigo', 'cafe', 'radia', 'tv', 'box', 've', 'prise', 'inconnu'].map(P.typeEcrit),
    ['serveur', 'ordinateur', 'électroménager', 'électroménager', 'électroménager', 'électroménager', 'électroménager', 'électroménager',
      'chauffage', 'télévision', 'box internet', 'borne de recharge', 'prise', 'prise']);
});
