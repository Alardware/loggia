// ─────────────────────────────────────────────────────────────────────────────
// Les piles et batteries dans la vue Énergie (retour du 19/09).
//
// « Dans Énergie, à la suite des postes de consommation, on pourrait ajouter
// les nouveaux capteurs de batterie, non ? » — les cartes à cinq barres de la
// v3.57.0, toutes au même endroit, la plus basse d'abord. Voir l'ADR 0057.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pilesMaison } from '../src/piles.js';
import { enHaids, setLoggiaState } from '../src/state.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('src', 'App.jsx');
const e = (state, attributes = {}) => ({ state: String(state), attributes });
const pile = (state, nom) => e(state, { device_class: 'battery', unit_of_measurement: '%', friendly_name: nom });

test('les piles : la classe battery, la plus basse d’abord, les muettes à la fin', () => {
  const S = {
    'sensor.detecteur_fumee_pile': pile(64, 'Détecteur fumée'),
    'sensor.porte_pile': pile(9, 'Porte d’entrée'),
    'sensor.telecommande_pile': pile('unavailable', 'Télécommande'),
    'sensor.telephone_batterie': pile(64, 'Téléphone'),
    'sensor.fenetre_pile': pile('30.5', 'Fenêtre'),
    'sensor.cachee_pile': pile(5, 'Cachée'),
    'sensor.desactivee_pile': pile(3, 'Désactivée'),
    'sensor.salon_temperature': e(21, { device_class: 'temperature' }),
    'binary_sensor.pile_faible': e('on', { device_class: 'battery' }),
    'sensor.pile_texte': e('low', { device_class: 'battery' }),
  };
  // Le registre : une entité masquée, une désactivée — et une de diagnostic,
  // la catégorie de presque toutes les piles Zigbee, qui reste. Le téléphone
  // (l'application Home Assistant, `mobile_app`) sort : « retire les
  // téléphones de la liste des piles » (19/09).
  const meta = (id) => ({ 'sensor.cachee_pile': { hidden: true }, 'sensor.desactivee_pile': { disabled: true }, 'sensor.fenetre_pile': { category: 'diagnostic' }, 'sensor.telephone_batterie': { platform: 'mobile_app' }, 'sensor.detecteur_fumee_pile': { platform: 'mqtt' } })[id] || {};
  assert.deepEqual(pilesMaison(S, meta), [
    { id: 'sensor.porte_pile', niveau: 9 },
    { id: 'sensor.fenetre_pile', niveau: 30.5 },
    { id: 'sensor.detecteur_fumee_pile', niveau: 64 },
    { id: 'sensor.telecommande_pile', niveau: null },
  ]);
  // Égalité de niveau : l'ordre des noms.
  assert.deepEqual(pilesMaison({ 'sensor.b': pile(50, 'Bureau'), 'sensor.a': pile(50, 'Atelier') }).map(p => p.id), ['sensor.a', 'sensor.b']);
  assert.deepEqual(pilesMaison(null), []);
  assert.deepEqual(pilesMaison({ 'sensor.x': pile(50, 'X') }), [{ id: 'sensor.x', niveau: 50 }], 'sans registre, tout compte');
});

test('piles.js est pur : ni React, ni Home Assistant', () => {
  /* Audit du 03/10 : les noms de même charge se rangent dans la langue de
   * l'écran, par `comparerTextes`. C'est la SEULE dépendance permise, comme
   * pour attention.js — épinglée à l'identique, rien d'autre ne passe. */
  const imports = lire('src', 'piles.js').match(/^import .*$/gm) || [];
  assert.deepEqual(imports, ["import { comparerTextes } from './i18n.js';"]);
});

test('la vue Énergie : les piles ont leur onglet, avec la carte standard et la grille des Objets', () => {
  /* Elles suivaient les postes jusqu'au 06/10. La vue s'est allongée —
   * historique sur quatre périodes, tarif, calendrier des douze mois — et
   * personne ne descend aussi loin pour apprendre qu'une télécommande est à
   * plat : elles passent dans leur propre onglet, avec le compte de celles à
   * surveiller sur le bouton. Le reste ne change pas : même carte à cinq
   * barres (ADR 0057), même grille que les Objets, pas de cadre autour. */
  assert.ok(APP.includes("import { pilesMaison } from './piles.js';"));
  const i = APP.indexOf('\nfunction EnergieContent(');
  const vue = APP.slice(i, APP.indexOf('\nfunction ', i + 1));
  assert.ok(vue.includes('const piles = pilesMaison(S, (id) => (LOGGIA_INDEX && LOGGIA_INDEX.entityMeta && LOGGIA_INDEX.entityMeta.get(id)) || {});'), 'les piles, filtrées par le registre');
  assert.ok(vue.includes("{onglEn === 'piles' && piles.length > 0 && ("), 'sans pile, ni onglet ni section');
  assert.ok(vue.includes('{piles.length > 0 && ('), 'l’onglet lui-même n’apparaît que s’il y a des piles');
  assert.ok(vue.includes('<div className="o-piles grid-objets grid-dense"'), 'la grille des Objets : 176 × 184 au téléphone');
  assert.ok(vue.includes('{pilesVues.map((p, i) => <Anim key={p.id} i={i} base={200}>{dc.card(p.id)}</Anim>)}') && vue.includes('{dc.sheets}'), 'la carte standard, et sa fiche au toucher');
  // Le badge et le filtre comptent la MÊME chose, au même seuil : une pile
  // faible ou muette. Deux comptes différents sur le même écran mentiraient.
  assert.ok(vue.includes('const pilesSurveiller = piles.filter(p => p.niveau == null || p.niveau <= 35).length;'), 'le compte à surveiller');
  assert.ok(vue.includes("const pilesVues = pilesFiltre === 'surveiller' ? piles.filter(p => p.niveau == null || p.niveau <= 35) : piles;"), 'le filtre, au même seuil');
  assert.ok(lire('src', 'langues', 'en.js').includes("'Piles et batteries': 'Batteries',"));
});

/* Le cas « le graphique de puissances ne dessine pas plus de points qu'il n'a
 * de pixels » vivait ici. La refonte du 06/10 a retire la carte « Sources de
 * puissance » — absente de la maquette, remplacee par l'historique
 * feuilletable —, et avec elle `sousEchantillonner` et `EnPuissances`. Le
 * sous-echantillonnage n'a plus de courbe a alleger : le cas part avec eux.
 */

test('un capteur retiré de la fiche Énergie ne revient pas par la détection automatique (02/10)', () => {
  /* « J'ai retiré les entités mais sur le schéma elles sont toujours
   * présentes. » La fiche enregistre les SIX clés à chaque sauvegarde, y
   * compris celles qu'on vide (`''`). */
  setLoggiaState({
    resolved: { energy: { available: true, haids: {
      consoNow: 'sensor.demo_conso', solarOutput: 'sensor.demo_solaire', surplusNow: 'sensor.demo_surplus',
    } } },
    cfg: { loggia_energyHaids: {
      consoNow: 'sensor.compteur_conso_reel', solarOutput: '', surplusNow: '',
    } },
  });
  try {
    const EN = enHaids();
    assert.equal(EN.consoNow, 'sensor.compteur_conso_reel', 'la clé enregistrée fait foi');
    assert.ok(!EN.solarOutput, 'la production solaire retirée ne doit pas revenir de la détection automatique');
    assert.ok(!EN.surplusNow, 'le surplus retiré ne doit pas revenir non plus');
  } finally {
    setLoggiaState({ resolved: null, cfg: {} });
  }
});

test('le tableau de bord Énergie NATIF de Home Assistant ne complète plus une fiche déjà enregistrée (02/10, suite)', () => {
  /* Premier correctif incomplet : « toujours aucun changement ». La vraie
   * fuite ne passait pas par une clé vidée mais par une clé que la fiche ne
   * gère même pas. `resolve.js` nomme ses capteurs auto-détectés
   * différemment (`solarNow`, `gridNow`…) de ceux de la fiche
   * (`solarOutput`, `consoNow`…) : un `if (cfg[k])` clé par clé ne pouvait
   * JAMAIS éteindre `solarNow`, puisque cette clé n'existe nulle part dans
   * `cfg`. Elle survivait donc dans `out`, et `solarW` la préfère à
   * `solarOutput` — d'où un toit solaire actif malgré une fiche vide.
   * La fiche fait donc foi pour la FAMILLE entière du capteur qu'elle touche
   * — `solarOutput` et `solarNow` sont le même toit, `consoNow` et `gridNow`
   * le même compteur.
   *
   * RÈGLE RÉVISÉE LE 07/10 (« tout doit être opérationnel ») : elle ne fait
   * plus foi sur TOUT le domaine. L'écran Paramètres n'expose que six champs
   * de puissance, et les enregistrer coupait les compteurs, les coûts, le gaz,
   * l'eau et les appareils que le tableau de bord déclarait. Ce que ce test
   * protège reste entier : un capteur du schéma retiré ne revient pas sous un
   * autre nom. Ce qui change : le reste du tableau survit. */
  setLoggiaState({
    resolved: { energy: { available: true, source: 'tableau de bord Energie', haids: {
      consoJour: 'sensor.ha_conso_jour', prodJour: 'sensor.ha_prod_jour',
      gridNow: 'sensor.ha_grid_power', solarNow: 'sensor.ha_solar_power',
    } } },
    cfg: { loggia_energyHaids: {
      consoNow: 'sensor.compteur_conso_reel', solarOutput: '', surplusNow: '',
      evNow: '', batNow: '', batSoc: '',
    } },
  });
  try {
    const EN = enHaids();
    assert.equal(EN.consoNow, 'sensor.compteur_conso_reel');
    assert.ok(!EN.solarNow, 'le capteur solaire du tableau de bord natif ne doit plus filtrer sous un autre nom');
    assert.ok(!EN.gridNow, 'le capteur réseau du tableau de bord natif ne doit plus filtrer sous un autre nom');
    // Ce que la fiche ne gère PAS continue de venir du tableau de bord.
    assert.equal(EN.consoJour, 'sensor.ha_conso_jour', 'le compteur du tableau se perd avec la fiche');
    assert.equal(EN.prodJour, 'sensor.ha_prod_jour', 'la production du tableau se perd avec la fiche');
  } finally {
    setLoggiaState({ resolved: null, cfg: {} });
  }
});

test('sans fiche enregistrée, la détection automatique du tableau de bord natif reste proposée', () => {
  /* Le confort « zéro réglage » doit rester intact pour qui n'a jamais
   * ouvert la fiche Énergie : c'est le SEUL cas où le repli joue. */
  setLoggiaState({
    resolved: { energy: { available: true, haids: { solarNow: 'sensor.demo_solar' } } },
    cfg: {},
  });
  try {
    const EN = enHaids();
    assert.equal(EN.solarNow, 'sensor.demo_solar');
  } finally {
    setLoggiaState({ resolved: null, cfg: {} });
  }
});

test('la trajectoire du soleil est partie, et ne revient pas (08/10)', () => {
  /* « Retire la trajectoire du soleil aussi. » Le composant `SunArc` dessinait
   * une courbe du lever au coucher, le rond du soleil a l'heure reelle, son
   * halo, et deux reperes d'horaires. Tout cela encerclait la maison et lui
   * prenait les deux tiers du cadre : 180 x 135 px sur un ecran de 375.
   *
   * Ce test remplace deux tests du 02/10 qui protegeaient des defauts de cet
   * arc — la pastille d'irradiance qui se superposait aux badges fixes, et le
   * rond qui se posait la nuit sur le repere de lever. Les deux defauts sont
   * devenus impossibles : il n'y a plus ni rond, ni repere, ni arc. */
  const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  for (const trace of ['function SunArc(', '<SunArc', 'SunMark', 'sunGrad', 'o-sunmark']) {
    assert.ok(!src.includes(trace), `l\u2019arc du soleil est revenu : ${trace}`);
  }
  // Les pastilles, elles, restent : c'est tout ce qui avait de la valeur la-dedans.
  const f = src.slice(src.indexOf('function PastillesEnergie('), src.indexOf('\nconst EN_LAYOUT_KEY'));
  for (const icone of ['sun', 'panel', 'house', 'pylon']) {
    assert.ok(f.includes(`<Chip icon="${icone}"`), `la pastille ${icone} a disparu avec l\u2019arc`);
  }
  /* L'irradiance suivait le soleil le long de la courbe, avec tout un calcul
   * d'evitement. Sans courbe il n'y a plus rien a suivre : une place fixe, et
   * plus personne a rencontrer. */
  assert.ok(f.includes('<Chip icon="sun" x={250} y={48}'), 'l’irradiance s’est remise a flotter');
  assert.ok(!f.includes('const FIXES = ['), 'le calcul d’evitement traine encore, sans rien a eviter');
});

test('sans position declaree, les pastilles de la maison restent (08/10)', () => {
  /* Le composant rendait `null` des que Home Assistant n'avait pas de
   * latitude — ce qui se tenait quand il ne dessinait qu'un arc solaire. Sans
   * arc, ce renvoi emportait aussi la consommation de la maison et le sens du
   * reseau, qui n'ont rien a voir avec le soleil : chez quelqu'un qui n'a pas
   * declare sa position, le schema perdait ses chiffres. */
  const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const f = src.slice(src.indexOf('function PastillesEnergie('), src.indexOf('\nconst EN_LAYOUT_KEY'));
  assert.ok(!/if \(!s\) return null;/.test(f), 'le composant redevient muet sans position declaree');
  assert.ok(f.includes('const day = !!(s && s.day);'), 'le jour ne se lit plus prudemment');
  // Seule l'irradiance depend du soleil.
  assert.ok(/\{day && <Chip icon="sun"/.test(f), 'l’irradiance s’affiche meme la nuit');
});

test('la scene TIENT SON RAPPORT, et le cadre colle au dessin (08/10)', () => {
  /* « Sur mobile, la maison est trop petite », puis « c'est encore un peu
   * petit ». Le cadre faisait 600 de large parce que l'arc en occupait le
   * pourtour ; la maison n'en prenait que le tiers central — 180 x 135 px sur
   * un ecran de 375. Premier resserrage : 225 x 169. Second : 276 x 207.
   *
   * Ce qui coutait les derniers dix pour cent, c'etait la SYMETRIE du cadre :
   * elle reservait a gauche autant de vide que la pastille du reseau en
   * demandait a droite. Elle n'etait qu'un MOYEN. Le vrai invariant est que la
   * scene TIENNE SON RAPPORT : un SVG en `meet` ne se recentre que dans un
   * conteneur d'un autre rapport que le sien, et c'est la seule chose qui
   * faisait glisser les pastilles par rapport au dessin. Le plafond de la
   * scene passe donc de la HAUTEUR a la LARGEUR — meme hauteur maximale, mais
   * le rapport ne se rompt plus jamais, et le cadre peut coller au dessin.
   *
   * Mesure apres : bords du dessin et du repere confondus (34 et 310 sur un
   * telephone, 0 px d'ecart ; idem sur un ordinateur). */
  const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const m = src.match(/const SCENE = \{ x0: ([^,]+), w: ([^,]+), h: (\d+), mx: ([\d.]+), mw: ([\d.]+) \};/);
  assert.ok(m, 'la table SCENE a disparu : les nombres sont repartis se semer dans le code');
  // A gauche, le cadre commence au bord du dessin : rien n'y depasse.
  assert.equal(m[1], '133.33', 'le cadre ne colle plus au bord gauche du dessin');
  assert.equal(m[1], m[4], 'le cadre et le dessin ne commencent plus au meme endroit');
  /* A droite, une seule pastille depasse, et la largeur s'en DEDUIT : si on la
   * deplace, le cadre suit tout seul. Un nombre ecrit en dur la laisserait
   * sortir du cadre sans que rien ne le dise. */
  assert.ok(m[2].includes('CHIP_RESEAU_X'),
    'la largeur ne se deduit plus de la pastille la plus a droite : un nombre en dur la laissera deborder');

  /* `width` + `height` + `aspect-ratio` donnes ensemble font IGNORER le
   * rapport : la maison est sortie etiree a 664 x 340 au lieu de 453 x 340. */
  const maison = src.slice(src.indexOf('<div className="o-en-house"'), src.indexOf('<img src={energyHomeImg}'));
  assert.ok(maison.includes("height: '100%'") && maison.includes("aspectRatio: '960 / 720'"),
    'la maison ne tient plus sa taille de sa hauteur et de son rapport');
  assert.ok(!/width:/.test(maison), 'une largeur imposee revient ecraser le rapport de la maison');
  assert.ok(maison.includes('left: 0'), 'la maison n’est plus posee sur le bord gauche du cadre');

  const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
  /* LE PLAFOND EST UNE LARGEUR. Un `max-height` sur la scene rompt son rapport
   * des qu'il mord, et toutes les pastilles glissent. */
  assert.ok(css.includes('.o-en-scene { max-width: calc(340px * var(--o-scene-ratio, 1.5)); }'),
    'le plafond de la scene est redevenu une hauteur : le rapport se rompra');
  assert.ok(!/\.o-en-scene \{[^}]*max-height: 3/.test(css), 'un plafond de hauteur est revenu sur la scene');
  assert.ok(src.includes("'--o-scene-ratio': SCENE_RATIO"), 'le rapport n’arrive plus jusqu’a la feuille de style');

  /* La feuille de style n'a plus rien a rattraper : tout ce bloc existait pour
   * recoller a la main l'echelle que l'arc imposait. */
  for (const vieux of ['55.56%', 'scale(1.18)', '600 / 420', 'o-sunmark']) {
    assert.ok(!css.includes(vieux), `le rattrapage mobile est revenu : ${vieux}`);
  }
  /* LES RETRAITS COMPTENT, et pas qu'au telephone.
   *
   * Sur 375 px d'ecran : la page en prend 28, la carte 48, le puits 22 — il ne
   * restait que 275 px de scene. Le puits deborde donc du retrait de la carte
   * (c'est une illustration, pas un texte) et son propre retrait tombe a 4 : il
   * s'arrete a 5 px du bord de la carte, il n'y a plus rien a prendre.
   *
   * « Et sur tablette pareil » : elle gardait les retraits ET un plafond plus
   * bas que l'ordinateur (290 contre 340). Mesure a 834, le dessin tenait dans
   * 387 x 290 pour un puits de 456 x 639. Les deux sautent. */
  assert.ok(css.includes('.o-en-well { overflow: hidden; margin-left: -20px; margin-right: -20px; padding: 4px; }'),
    'le puits a repris les retraits de la carte : la maison redevient petite');
  assert.ok(css.includes('@media (max-width: 1180px) { .o-en-well { margin-left: -16px; margin-right: -16px; } }'),
    'la tablette a repris les retraits de la carte');
  assert.ok(!/max-width: calc\(290px/.test(css),
    'le plafond bas de la tablette est revenu : le dessin y reste petit pour rien');
});

test('en mode clair, la maison du schema n’est plus un bloc noir (08/10)', () => {
  /* « La maison est trop foncee en mode clair. » Les quatre calques sont des
   * images anthracite sur fond transparent, dessinees pour le theme sombre :
   * sur le puits clair (#eee) elles faisaient un bloc noir au milieu d'une
   * carte claire. Mesure : toit a 59 de luminance pour un puits a 238.
   *
   * La valeur est MESUREE, pas choisie : brightness(2.1) porte le toit a 124
   * et le mur a 168 — 44 points d'ecart, donc le relief tient, contre 25 avec
   * une baisse de contraste qui aplatissait le volume. */
  const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
  assert.ok(css.includes('html.loggia-light .o-en-house img { filter: brightness(2.1) saturate(.85); }'),
    'la maison du schema Energie repasse en bloc noir sur le theme clair');
  // Les images SEULES : le SVG des flux garde ses couleurs.
  assert.ok(!/html\.loggia-light \.o-en-house \{ filter/.test(css),
    'le filtre deborde sur les flux, qui ont deja leurs couleurs');
});

test('sans capteur de production, les panneaux solaires ne s’affichent plus sur le toit (02/10)', () => {
  /* « J'ai les panneaux avec la production alors qu'il n'y a pas d'entité. »
   * `energySolarImg` se dessinait SANS CONDITION, contrairement au véhicule
   * (`evBranche &&`) et à la batterie (`batPresente &&`) qui suivent déjà
   * cette règle. Le dessin du toit et le chip « 0 W » des pastilles suivent
   * maintenant `solarPresente`, alimenté par `solarAvail` (capteur configuré,
   * pas seulement production non nulle) — le même signal qui pilote déjà
   * « Solaire actif / inactif » dans l'en-tête. */
  const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const maison = src.slice(src.indexOf('function EnergyHouseSchema('), src.indexOf('\n}', src.indexOf('function EnergyHouseSchema(')));
  assert.ok(maison.includes('solarPresente = true'), 'solarPresente a disparu de la signature (ou son défaut, qui garde la démo intacte)');
  assert.ok(maison.includes('{solarPresente && <img src={energySolarImg}'), 'les panneaux redessinent sans vérifier solarPresente');

  const arc = src.slice(src.indexOf('function PastillesEnergie('), src.indexOf('\nconst EN_LAYOUT_KEY'));
  assert.ok(arc.includes('solarPresente = true'), 'PastillesEnergie a perdu le paramètre solarPresente');
  assert.ok(/\{solarPresente &&[^}]*<Chip icon="panel"/.test(arc),
    'le chip de production ne vérifie plus solarPresente : un « 0 W » resterait affiché sans toit');

  /* Les deux composants reçoivent `solarAvail`. On ne fige PAS la ligne
   * entière : d'autres propriétés s'y ajoutent (le format d'écran, décision
   * 0131), et un test qui recopie un appel JSX au caractère près se casse à
   * chaque ajout sans rien protéger de plus. */
  for (const nom of ['EnergyHouseSchema', 'PastillesEnergie']) {
    const i = src.indexOf('<' + nom + ' ');
    assert.notEqual(i, -1, `l’appel de ${nom} est introuvable`);
    const appel = src.slice(i, src.indexOf('/>', i));
    assert.ok(appel.includes('solarPresente={solarAvail}'), `${nom} ne reçoit plus solarAvail`);
  }
});

test('une épingle s’écrit sur ce que la maison a, pas sur ce qu’un écran croyait', () => {
  /* Quatre ecrans posaient la punaise, chacun avec sa copie de la liste prise
   * a l'ouverture : deux fiches ouvertes, et la seconde ecrivait sa liste
   * d'avant par-dessus. Et la fiche appareil LISAIT avec `indexOf` alors
   * qu'elle ECRIVAIT en comparant l'entite — une epingle au format `{t, id}`
   * s'y affichait absente, et le clic pour l'epingler la retirait. */
  const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const f = src.slice(src.indexOf('function basculerEpingle('), src.indexOf('\n}', src.indexOf('function basculerEpingle(')));
  assert.ok(f.includes('const eps = lireEpingles();'), 'la bascule n’relit plus la maison avant d’ecrire');
  assert.ok(f.includes('eps.some(x => cvId(x) === id)'), 'la comparaison ne passe plus par l’entite');
  // Les deux bascules y passent, et plus personne ne recalcule dans son coin.
  assert.ok(src.includes('const tap = () => setEps(basculerEpingle(id));'), 'la punaise des fiches de domaine a repris sa logique propre');
  assert.ok(src.includes('const basculer = (eid) => setEps(basculerEpingle(eid));'), 'la fiche appareil aussi');
  assert.ok(!/eps\.indexOf\(/.test(src), 'une lecture d’epingle compare encore l’entree entiere, pas l’entite');
});
