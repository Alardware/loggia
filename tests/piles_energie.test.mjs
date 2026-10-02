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
  assert.doesNotMatch(lire('src', 'piles.js'), /^import /m);
});

test('la vue Énergie : la section suit les postes, avec la carte standard et la grille des Objets', () => {
  assert.ok(APP.includes("import { pilesMaison } from './piles.js';"));
  const i = APP.indexOf('\nfunction EnergieContent(');
  const vue = APP.slice(i, APP.indexOf('\nfunction ', i + 1));
  assert.ok(vue.includes('const piles = pilesMaison(S, (id) => (LOGGIA_INDEX && LOGGIA_INDEX.entityMeta && LOGGIA_INDEX.entityMeta.get(id)) || {});'), 'les piles, filtrées par le registre');
  assert.ok(vue.indexOf("tr('Postes de consommation')") < vue.indexOf("tr('Piles et batteries')"), 'la section vient après les postes');
  assert.ok(vue.includes('{piles.length > 0 && ('), 'sans pile, pas de section');
  assert.ok(vue.includes('<div className="o-piles grid-objets grid-dense"'), 'la grille des Objets : 176 × 184 au téléphone');
  assert.ok(vue.includes('{piles.map((p, i) => <Anim key={p.id} i={i} base={200}>{dc.card(p.id)}</Anim>)}') && vue.includes('{dc.sheets}'), 'la carte standard, et sa fiche au toucher');
  assert.ok(lire('src', 'langues', 'en.js').includes("'Piles et batteries': 'Batteries',"));
});

test('le graphique de puissances ne dessine pas plus de points qu’il n’a de pixels', () => {
  /* Vingt-quatre heures de releves font des milliers de points pour trois
   * cents pixels de large. Deux degats (audit du 29/09) :
   *
   *   — `Math.min(...tous)` passe le tableau EN ARGUMENTS ; au-dela de
   *     quelques dizaines de milliers de points, le navigateur leve une
   *     `RangeError`, et Safari cede le premier ;
   *   — tout le calcul se refaisait a chaque rendu, donc a chaque mouvement
   *     de souris, alors que seuls la ligne verticale et la bulle en dependent.
   *
   * Le sous-echantillonnage garde le plus BAS et le plus HAUT de chaque
   * tranche : prendre un point sur vingt raboterait les pointes de
   * consommation, qui sont ce qu'on vient regarder. */
  const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const f = src.slice(src.indexOf('function sousEchantillonner('), src.indexOf('\nfunction EnPuissances('));
  assert.ok(f.includes('if (pts[k].v < lo.v) lo = pts[k];') && f.includes('if (pts[k].v > hi.v) hi = pts[k];'),
    'le sous-echantillonnage ne garde plus le bas ET le haut : les pics seraient rabotes');
  assert.ok(f.includes('if (out[0] !== pts[0]) out.unshift(pts[0]);'), 'les deux bouts ne sont plus les vrais bouts : l’aire se refermerait de travers');

  const g = src.slice(src.indexOf('function EnPuissances('), src.indexOf('\n/* Consommation par heure'));
  // Les commentaires citent le code d'avant : on ne teste que le code.
  const code = g.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/Math\.(min|max)\([^)]*\.\.\./.test(code),
    'les bornes repassent par un etalement du tableau : RangeError en vue sur Safari');
  assert.ok(code.includes('if (p.t < t0) t0 = p.t;') && code.includes('if (p.v > haut) haut = p.v;'),
    'les bornes ne se calculent plus en une passe');
  assert.ok(g.includes('const g = useMemo(() => {') && g.includes('}, [series, h]);'),
    'le calcul n’est plus memoise : il repart a chaque mouvement de souris');
  assert.ok(g.includes('const pts = sousEchantillonner(s.pts, W);'), 'le trace ne s’allege plus');
  assert.ok(g.includes('v: prochePoint(s.pts, t)'), 'la bulle ne lit plus les points d’origine : on a allege la mesure, pas le trace');
});

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
   * La fiche doit faire foi SEULE dès qu'elle existe, quelle que soit la
   * forme du repli natif — même logique que le véhicule et la batterie, qui
   * n'ont jamais eu ce repli. */
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
    assert.equal(Object.keys(EN).length, 1, 'seule la clé réellement renseignée doit sortir');
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

test('la pastille d’irradiance évite les DEUX badges fixes du schéma solaire, pas un seul (02/10)', () => {
  /* « Le capteur d'énergie du soleil est à l'extérieur de l'arc, ça se
   * superpose avec les autres. » Au lever et au coucher, la pastille suit
   * le soleil au ras du bas du cadre (sy proche de 205-235) : sans
   * plafond, elle descendait jusqu'au badge réseau (pylône, 478×168),
   * jamais vérifié — seul le badge de production (352×78) l'était. */
  const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const f = src.slice(src.indexOf('function SunArc('), src.indexOf('\nconst EN_LAYOUT_KEY'));
  assert.ok(f.includes('let cy = Math.min(150, Math.max(22, sy - 4));'),
    'cy n’est plus plafonné : la pastille peut redescendre jusqu’au bas du cadre');
  assert.ok(f.includes('chevauche(478, 168, 110, 40)'),
    'la pastille ne vérifie plus sa collision avec le badge réseau (pylône)');
  assert.ok(f.includes('chevauche(352, 78, 132, 34)'),
    'la pastille ne vérifie plus sa collision avec le badge de production');
});

test('la nuit, le rond du soleil ne se pose plus sur le repère de lever ou de coucher (02/10)', () => {
  /* `sunInfo().t` n'a de sens qu'ENTRE le lever et le coucher ; hors de cet
   * intervalle il se plafonne à 0 ou 1 (voir `sunInfo`), et le rond du
   * « soleil / lune », jusqu'ici dessiné jour ET nuit, retombait alors
   * exactement sur le `SunMark` du lever ou du coucher — deux ronds collés
   * au même endroit, toute la nuit, chaque nuit. Signalé le 02/10 (capture
   * prise après le coucher) comme « à l'extérieur de l'arc, superposé aux
   * autres ». Le rond ne représente rien de réel la nuit : il disparaît,
   * les deux repères fixes suffisent à montrer lever et coucher. */
  const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const f = src.slice(src.indexOf('function SunArc('), src.indexOf('\nconst EN_LAYOUT_KEY'));
  assert.ok(f.includes("{day && <circle cx={sx} cy={sy} r=\"10\" fill=\"var(--o-gold)\""),
    'le rond du soleil n’est plus réservé au jour : il redessine sur le repère fixe la nuit');
  assert.ok(!/<circle cx=\{sx\} cy=\{sy\} r=\{day \? 10 : 7\}/.test(f),
    'l’ancien rond jour/nuit (couleur et rayon variables) traîne encore dans le code');
});

test('sans capteur de production, les panneaux solaires ne s’affichent plus sur le toit (02/10)', () => {
  /* « J'ai les panneaux avec la production alors qu'il n'y a pas d'entité. »
   * `energySolarImg` se dessinait SANS CONDITION, contrairement au véhicule
   * (`evBranche &&`) et à la batterie (`batPresente &&`) qui suivent déjà
   * cette règle. Le dessin du toit et le chip « 0 W » de `SunArc` suivent
   * maintenant `solarPresente`, alimenté par `solarAvail` (capteur configuré,
   * pas seulement production non nulle) — le même signal qui pilote déjà
   * « Solaire actif / inactif » dans l'en-tête. */
  const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const maison = src.slice(src.indexOf('function EnergyHouseSchema('), src.indexOf('\n}', src.indexOf('function EnergyHouseSchema(')));
  assert.ok(maison.includes('solarPresente = true'), 'solarPresente a disparu de la signature (ou son défaut, qui garde la démo intacte)');
  assert.ok(maison.includes('{solarPresente && <img src={energySolarImg}'), 'les panneaux redessinent sans vérifier solarPresente');

  const arc = src.slice(src.indexOf('function SunArc('), src.indexOf('\nconst EN_LAYOUT_KEY'));
  assert.ok(arc.includes('solarPresente = true'), 'SunArc a perdu le paramètre solarPresente');
  assert.ok(arc.includes('{solarPresente && <Chip icon="panel"'), 'le chip de production ne vérifie plus solarPresente : un « 0 W » resterait affiché sans toit');

  assert.ok(src.includes('<EnergyHouseSchema solarW={solarW} homeW={consoW} surplusW={surplusW} evW={evW} evBranche={evBranche} batW={batW} batSoc={batSoc} batPresente={batPresente} solarPresente={solarAvail} />'),
    'le schéma de la maison ne reçoit plus solarAvail');
  assert.ok(src.includes('<SunArc solarW={solarW} gridW={importW} exportW={surplusW} homeW={consoW} appW={avail(EN.appTotal) ? Math.round(num(EN.appTotal)) : null} solarPresente={solarAvail} />'),
    'l’arc solaire ne reçoit plus solarAvail');
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
