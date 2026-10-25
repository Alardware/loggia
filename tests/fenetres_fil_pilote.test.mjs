// ─────────────────────────────────────────────────────────────────────────────
// La règle des fenêtres, à l'écran : un module fil pilote est un chauffage,
// pas une prise (chantier Chauffage, plan 2, tâche 14 ; choix 17).
//
// Un module fil pilote — un NodOn SIN-4-FP-21 sous zigbee2mqtt — porte deux
// entités sur le MÊME appareil : le `select` qui donne l'ordre (Confort, Éco,
// Hors-gel, Arrêt…) et le `switch` qui l'alimente. Le réglage de la règle
// (Paramètres › Règles › Chauffage) proposait les `switch` et cochait d'office
// ceux dont le nom évoque un radiateur : l'interrupteur du module passait le
// motif. Coupé, le module n'entend plus aucun ordre. Le serveur coupe déjà par
// le `select` (plan 1, ADR 0178, `fenetres.py` : `_chauffages`) ; l'écran le
// dit maintenant :
//  - le `select` d'un module (la famille `fil_pilote`, que le serveur pose
//    dans l'index) est un chauffage proposé, coché d'office comme un
//    thermostat, et nommé par son appareil, comme sa carte ;
//  - l'interrupteur d'un module n'est plus proposé (`interrupteurDeModule`) ;
//  - une configuration ancienne qui coche l'interrupteur se montre sur le
//    `select`, et s'écrit ainsi à la prochaine modification de la pièce ;
//  - un radiateur sur simple prise reste proposé comme avant ;
//  - un chauffage de la configuration qui n'a plus d'état — renommé, retiré —
//    se montre dans sa pièce, « introuvable », avec un geste pour le retirer :
//    la règle range ses chauffages par `entity_id`, et la pièce perdait sa
//    protection en silence.
//
// Le réglage se JOUE : `fenetres.jsx` compilé tel quel, chaque import pris
// dans son vrai module, ses crochets doublés (le modèle de
// tests/fichechauffage.test.mjs) — un rendu statique ne clique pas. Ce que
// font les gestes se lit dans les messages `loggia/fenetres/config` qu'ils
// envoient.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';

// La langue AVANT les imports de src/ : i18n la lit au chargement.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);

const { area, device, entity, state, states, indexOf } = await import('./fixtures.mjs');
const { interrupteurDeModule } = await import('../src/resolve.js');
const { buildIndex, registresDuComposant } = await import('../src/discovery.js');
const { maisonChauffageDemo } = await import('../src/demo.js');
const { piecesCandidates, chauffagesRelus, pucesChauffages, selectDuModule } =
  await import(new URL('../src/views/fenetres.jsx', import.meta.url).href);

// Les ordres du NodOn, tels que zigbee2mqtt les publie.
const NODON = ['comfort', 'eco', 'frost_protection', 'off', 'comfort_-1', 'comfort_-2'];
const MODULE = 'select.radiateur_chambre_pilot_wire_mode';   // l'ordre du module
const INTER = 'switch.radiateur_chambre';                     // son alimentation
const FEN_CH = 'binary_sensor.fenetre_chambre';
const CHEVET = 'switch.prise_chevet';            // une prise — sa `device_class` le dit — que rien n'annonce comme un radiateur
const FEN_SE = 'binary_sensor.fenetre_sejour';
const CONVECTEUR = 'switch.convecteur_sejour';   // un convecteur sur une simple prise
const THERMOSTAT = 'climate.sejour';
const DISPARU = 'switch.radiateur_entree';       // à la configuration, plus dans Home Assistant
const COUPER = 'Couper le chauffage dans cette pièce';
const INTROUVABLE = 'Introuvable dans Home Assistant : renommé ou retiré ?';
const CONFIG = 'loggia/fenetres/config';

/**
 * Deux pièces à fenêtre. La chambre : un module fil pilote (son `select`, son
 * interrupteur, sa puissance, sur l'appareil « Radiateur Chambre ») et une
 * prise de chevet. Le séjour : un convecteur sur une simple prise, et un
 * thermostat. Les noms sont ceux de zigbee2mqtt : l'appareil porte celui que
 * l'utilisateur lui a donné, son `select` celui de l'exposition en plus.
 * `famille: null` : un index sans le composant (les registres de Home
 * Assistant seuls) — rien n'y dit que le `select` est un module.
 */
function maison({ famille = 'fil_pilote' } = {}) {
  return {
    areas: [area('chambre', 'Chambre'), area('sejour', 'Séjour')],
    devices: [
      device('d_module', 'Radiateur Chambre', 'chambre'),
      device('d_chevet', 'Prise chevet', 'chambre'),
      device('d_prise', 'Prise du convecteur', 'sejour'),
      device('d_therm', 'Thermostat séjour', 'sejour'),
    ],
    entities: [
      { ...entity(MODULE, { device: 'd_module' }), famille },
      entity(INTER, { device: 'd_module' }),
      entity('sensor.radiateur_chambre_power', { device: 'd_module' }),
      entity(FEN_CH, { area: 'chambre' }),
      entity(CHEVET, { device: 'd_chevet' }),
      entity(FEN_SE, { area: 'sejour' }),
      entity(CONVECTEUR, { device: 'd_prise' }),
      { ...entity(THERMOSTAT, { device: 'd_therm' }), famille: famille && 'thermostat' },
    ],
    floors: [],
    states: states(
      state(MODULE, 'comfort', { friendly_name: 'Radiateur Chambre Pilot wire mode', options: NODON }),
      state(INTER, 'on', { friendly_name: 'Radiateur Chambre' }),
      state('sensor.radiateur_chambre_power', '612', { device_class: 'power', unit_of_measurement: 'W' }),
      state(FEN_CH, 'off', { friendly_name: 'Fenêtre chambre', device_class: 'window' }),
      // Une prise, comme Home Assistant la décrit : sans quoi, depuis le tri
      // du 12/10, elle attendrait sous « Autres interrupteurs ».
      state(CHEVET, 'off', { friendly_name: 'Prise chevet', device_class: 'outlet' }),
      state(FEN_SE, 'off', { friendly_name: 'Fenêtre séjour', device_class: 'window' }),
      state(CONVECTEUR, 'on', { friendly_name: 'Convecteur séjour' }),
      state(THERMOSTAT, 'heat', { friendly_name: 'Thermostat séjour' }),
    ),
    energyPrefs: null,
  };
}

/* `fenetres.jsx` compilé tel quel, chaque import pris dans son vrai module —
 * `puce as pucePartagee` compris —, sauf ce que le test double. */
async function compilable(chemin) {
  const url = new URL('../src/' + chemin, import.meta.url);
  const texte = readFileSync(url, 'utf8').replace(/\r\n/g, '\n');
  const portee = {};
  for (const [, noms, spec] of texte.matchAll(/^import \{([\s\S]*?)\} from '([^']+)';$/gm)) {
    const m = spec === 'react' ? await import('react') : await import(new URL(spec, url).href);
    for (const n of noms.split(',').map(x => x.trim()).filter(Boolean)) {
      const [nom, alias] = n.split(/\s+as\s+/);
      assert.ok(nom in m, chemin + ' importe « ' + nom + ' » de ' + spec + ', qui ne l’exporte pas');
      portee[alias || nom] = m[nom];
    }
  }
  const code = transformSync(texte.replace(/^import [\s\S]*?';$/gm, '').replace(/^export (default )?(function|const) /gm, '$2 '),
    { loader: 'jsx', jsx: 'transform', jsxFactory: '__h', jsxFragment: '__Frag' }).code;
  return (doubles, rendu) => {
    const p = { ...portee, ...doubles };
    const noms = Object.keys(p);
    return new Function('__h', '__Frag', ...noms, code + '\nreturn ' + rendu + ';')(createElement, Fragment, ...noms.map(n => p[n]));
  };
}
const FENETRES = await compilable('views/fenetres.jsx');

/* Le réglage joué, déplié, sur la configuration `config` déjà lue
 * (`loggia/fenetres/etat`) ; `envoyes` reçoit ce que les gestes envoient.
 * Ses `useState` sont tenus comme React les tient, par l'ordre de leurs
 * appels : un geste qui en change un — déplier les autres interrupteurs — se
 * voit au rendu suivant, `rendre()`, comme ce qu'une puce a écrit. `carte`
 * lit le dernier rendu. */
function joue({ fx = maison(), index = indexOf(fx), S = fx.states, config }) {
  const envoyes = [];
  let etat = { config, coupes: {}, en_attente: [] };
  const hass = { states: S, callWS: (m) => { envoyes.push(m); return Promise.resolve({ config: etat.config }); } };
  const cases = [];
  let rang = 0;
  const useState = (init) => {
    const i = rang++;
    if (!(i in cases)) cases[i] = typeof init === 'function' ? init() : init;
    return [cases[i], (v) => { cases[i] = typeof v === 'function' ? v(cases[i]) : v; }];
  };
  const F = FENETRES({
    LOGGIA_INDEX: index,
    useMemo: (f) => f(),
    useState,
    usePli: () => [false, () => {}],
    useEtatServeur: () => ({
      etat, setEtat: (f) => { etat = typeof f === 'function' ? f(etat) : f; }, err: '', setErr: () => {}, vivant: { current: false },
    }),
  }, '{ FenetresReglages }');
  let arbre = null;
  const rendre = () => { rang = 0; arbre = F.FenetresReglages({ hass, cardSt: {} }); return arbre; };
  rendre();
  return { rendre, envoyes, carte: (nom) => carteDe(arbre, nom), pieces: (nom) => envoyes.map(m => m.patch.pieces[nom]) };
}

/* Les éléments de l'arbre qui répondent à `test` (sans déplier les composants). */
function chercher(el, test, acc = []) {
  if (!el || typeof el !== 'object') return acc;
  if (Array.isArray(el)) { el.forEach(x => chercher(x, test, acc)); return acc; }
  if (test(el)) acc.push(el);
  if (el.props) chercher(el.props.children, test, acc);
  return acc;
}
function carteDe(arbre, nom) {
  const c = chercher(arbre, el => el.key === nom)[0];
  assert.ok(c, 'pas de carte pour la pièce « ' + nom + ' »');
  return c;
}
/* Les puces d'une carte, dans l'ordre de l'écran : [entity_id, appuyée ?]. */
const pucesDe = (carte) => chercher(carte, el => el.type === 'button' && el.key != null).map(b => [b.key, b.props['aria-pressed']]);
const puceDe = (carte, id) => {
  const b = chercher(carte, el => el.type === 'button' && el.key === id)[0];
  assert.ok(b, 'pas de puce pour ' + id);
  return b;
};
const bascule = (carte) => {
  const b = chercher(carte, el => el.props && el.props.nom === COUPER)[0];
  assert.ok(b, 'pas d’interrupteur pour la pièce');
  return b;
};
const html = (el) => renderToStaticMarkup(el);
const ancienne = () => ({ actif: true, delai: 3, pieces: { Chambre: { actif: true, ouvrants: [FEN_CH], chauffages: [INTER] } } });

/* ════════════ Les chauffages proposés ════════════ */

test('un module fil pilote : son select est un chauffage proposé, son interrupteur ne l’est plus', () => {
  const fx = maison();
  const index = indexOf(fx);
  assert.equal(interrupteurDeModule(index, INTER), true, 'témoin : l’interrupteur du module se reconnaît');
  const [chambre, sejour] = piecesCandidates(index, fx.states);
  assert.deepEqual(chambre, { nom: 'Chambre', ouvrants: [FEN_CH], chauffages: [MODULE, CHEVET], autres: [] },
    'le select du module et la prise de chevet — jamais l’interrupteur qui alimente le module');
  assert.deepEqual(sejour, { nom: 'Séjour', ouvrants: [FEN_SE], chauffages: [CONVECTEUR, THERMOSTAT], autres: [] });
  // Sans le composant, l'index ne dit pas la famille : rien ne distingue le
  // module d'une prise, et la pièce se propose comme avant.
  const sans = maison({ famille: null });
  assert.deepEqual(piecesCandidates(indexOf(sans), sans.states)[0].chauffages, [INTER, CHEVET]);
  assert.deepEqual(piecesCandidates(null, fx.states), [], 'avant la découverte, aucune pièce');
});

test('activer la pièce coche d’office le module, comme un thermostat ; la prise de chevet attend qu’on la choisisse', () => {
  const j = joue({ config: { actif: true, delai: 3, pieces: {} } });
  bascule(j.carte('Chambre')).props.cb();
  assert.deepEqual(j.envoyes, [{ type: CONFIG, patch: { pieces: { Chambre: { actif: true, ouvrants: [FEN_CH], chauffages: [MODULE] } } } }]);
});

test('la pièce réglée montre le module sous le nom de son appareil, coché ; l’interrupteur n’a pas de puce', () => {
  const j = joue({ config: { actif: true, delai: 3, pieces: { Chambre: { actif: true, ouvrants: [FEN_CH], chauffages: [MODULE] } } } });
  const chambre = j.carte('Chambre');
  assert.deepEqual(pucesDe(chambre), [[FEN_CH, true], [MODULE, true], [CHEVET, false]]);
  assert.equal(puceDe(chambre, MODULE).props.children, 'Radiateur Chambre', 'le nom de son appareil, comme sa carte et sa fiche');
  const h = html(chambre);
  assert.ok(!h.includes('Pilot wire mode'), 'pas le nom de l’exposition');
  assert.ok(h.includes('aria-pressed="true"'), 'le choix se dit');
  assert.ok(!h.includes(INTROUVABLE), 'rien d’introuvable');
  assert.ok(!h.includes('<select'), 'jamais une liste native');
});

/* ════════════ Une configuration ancienne ════════════ */

test('l’interrupteur d’un module se relit sur son select — le reste tel quel, sans doublon', () => {
  const index = indexOf(maison());
  assert.equal(selectDuModule(index, INTER), MODULE, 'le pendant de select_du_module (chauffage.py)');
  assert.equal(selectDuModule(index, CHEVET), null, 'une prise dont l’appareil n’a pas de module');
  assert.equal(selectDuModule(index, MODULE), null, 'le select lui-même');
  assert.equal(selectDuModule(null, INTER), null, 'sans index, rien');
  assert.deepEqual(chauffagesRelus(index, [INTER]), [MODULE]);
  assert.deepEqual(chauffagesRelus(index, [INTER, MODULE, CHEVET]), [MODULE, CHEVET], 'l’interrupteur et son select ne font qu’un');
  assert.deepEqual(chauffagesRelus(index, [CONVECTEUR, DISPARU, THERMOSTAT]), [CONVECTEUR, DISPARU, THERMOSTAT], 'le reste tel quel');
  assert.deepEqual(chauffagesRelus(index, undefined), []);
  assert.deepEqual(chauffagesRelus(index, [INTER, 42, null]), [MODULE], 'ce qui n’est pas un identifiant est écarté, comme au serveur');
  const sans = maison({ famille: null });
  assert.deepEqual(chauffagesRelus(indexOf(sans), [INTER]), [INTER], 'sans famille dans l’index, l’interrupteur reste ce qu’il est');
});

test('une configuration ancienne qui coche l’interrupteur du module se montre sur son select, coché', () => {
  const j = joue({ config: ancienne() });
  const chambre = j.carte('Chambre');
  assert.deepEqual(pucesDe(chambre), [[FEN_CH, true], [MODULE, true], [CHEVET, false]], 'le select coché, l’interrupteur sans puce');
  const h = html(chambre);
  assert.ok(!h.includes(INTER) && !h.includes(INTROUVABLE), 'l’interrupteur n’est pas montré « introuvable » : il est relu sur son select');
  assert.ok(!h.includes('Rien à couper'), 'la pièce a bien quelque chose à couper');
  assert.deepEqual(j.envoyes, [], 'lire n’écrit rien');
});

test('…et s’écrit sur son select à la prochaine modification de la pièce, quelle qu’elle soit', () => {
  const ecrit = (geste, config = ancienne()) => { const j = joue({ config }); geste(j.carte('Chambre')); return j.pieces('Chambre'); };
  assert.deepEqual(ecrit(c => puceDe(c, FEN_CH).props.onClick()), [{ ouvrants: [], chauffages: [MODULE] }], 'un ouvrant retiré');
  assert.deepEqual(ecrit(c => puceDe(c, CHEVET).props.onClick()), [{ chauffages: [MODULE, CHEVET] }], 'une prise ajoutée');
  assert.deepEqual(ecrit(c => puceDe(c, MODULE).props.onClick()), [{ chauffages: [] }], 'le module décoché');
  assert.deepEqual(ecrit(c => bascule(c).props.cb()), [{ actif: false, chauffages: [MODULE] }], 'la pièce coupée');
  // Rallumée plus tard, une pièce coupée garde ses chauffages — relus.
  const coupee = { actif: true, delai: 3, pieces: { Chambre: { actif: false, ouvrants: [FEN_CH], chauffages: [INTER, CHEVET] } } };
  assert.deepEqual(ecrit(c => bascule(c).props.cb(), coupee), [{ actif: true, ouvrants: [FEN_CH], chauffages: [MODULE, CHEVET] }]);
  // Déjà sous sa forme nouvelle, une configuration n'est pas réécrite.
  const neuve = { actif: true, delai: 3, pieces: { Chambre: { actif: true, ouvrants: [FEN_CH], chauffages: [MODULE] } } };
  assert.deepEqual(ecrit(c => puceDe(c, FEN_CH).props.onClick(), neuve), [{ ouvrants: [] }]);
});

/* ════════════ Un radiateur sur simple prise ════════════ */

test('un radiateur sur simple prise reste proposé, coché d’office si son nom l’annonce — comme avant', () => {
  const fx = maison();
  assert.equal(interrupteurDeModule(indexOf(fx), CONVECTEUR), false, 'témoin : son appareil ne porte pas de module');
  const j = joue({ fx, config: { actif: true, delai: 3, pieces: {} } });
  bascule(j.carte('Séjour')).props.cb();
  assert.deepEqual(j.pieces('Séjour'), [{ actif: true, ouvrants: [FEN_SE], chauffages: [CONVECTEUR, THERMOSTAT] }],
    'le convecteur par son nom, le thermostat par son domaine');
  const regle = joue({ fx, config: { actif: true, delai: 3, pieces: { 'Séjour': { actif: true, ouvrants: [FEN_SE], chauffages: [CONVECTEUR] } } } });
  const sejour = regle.carte('Séjour');
  assert.deepEqual(pucesDe(sejour), [[FEN_SE, true], [CONVECTEUR, true], [THERMOSTAT, false]]);
  assert.equal(puceDe(sejour, CONVECTEUR).props.children, 'Convecteur séjour', 'une prise garde son nom');
  puceDe(sejour, FEN_SE).props.onClick();
  assert.deepEqual(regle.pieces('Séjour'), [{ ouvrants: [] }], 'une prise n’a rien à relire : rien de plus n’est écrit');
});

/* ════════════ Un chauffage renommé ou retiré ════════════ */

test('un chauffage de la configuration sans état se montre « introuvable » dans sa pièce, et se retire d’un geste', () => {
  const fx = maison();
  const config = { actif: true, delai: 3, pieces: {
    Chambre: { actif: true, ouvrants: [FEN_CH], chauffages: [MODULE] },
    'Séjour': { actif: true, ouvrants: [FEN_SE], chauffages: [THERMOSTAT, DISPARU] },
  } };
  const j = joue({ fx, config });
  const sejour = j.carte('Séjour');
  assert.deepEqual(pucesDe(sejour), [[FEN_SE, true], [CONVECTEUR, false], [THERMOSTAT, true]], 'il n’est pas une puce parmi les autres');
  const h = html(sejour);
  assert.equal(h.split(INTROUVABLE).length - 1, 1, 'dit une fois, dans sa pièce');
  assert.ok(h.includes(DISPARU), 'nommé par son identifiant : il n’a plus d’autre nom');
  const retirer = chercher(sejour, el => el.type === 'button' && el.props['aria-label'] === 'Retirer ' + DISPARU);
  assert.equal(retirer.length, 1, 'un geste pour le retirer, nommé');
  assert.equal(retirer[0].props.title, 'Retirer');
  assert.equal(retirer[0].props.type, 'button');
  assert.ok(!html(j.carte('Chambre')).includes(INTROUVABLE), 'la chambre n’a rien perdu : rien n’y est dit');
  retirer[0].props.onClick();
  assert.deepEqual(j.envoyes, [{ type: CONFIG, patch: { pieces: { 'Séjour': { chauffages: [THERMOSTAT] } } } }], 'retiré de la pièce, et d’elle seule');
  // La même lecture, en fonction pure : ses chauffages possibles, puis ce que la configuration coche hors d'eux.
  const [, piece] = piecesCandidates(indexOf(fx), fx.states);
  assert.deepEqual(pucesChauffages(fx.states, piece, [THERMOSTAT, DISPARU]), [
    { id: CONVECTEUR, coche: false, introuvable: false },
    { id: THERMOSTAT, coche: true, introuvable: false },
    { id: DISPARU, coche: true, introuvable: true },
  ]);
});

test('un chauffage coché hors de la zone de sa pièce s’y montre coché, et se décoche', () => {
  // La prise de chevet est rangée dans la chambre ; la configuration du séjour
  // la coupe aussi (rangée au séjour quand on l'a cochée) : elle se voit là
  // où elle agit, au lieu d'agir en silence.
  const j = joue({ config: { actif: true, delai: 3, pieces: { 'Séjour': { actif: true, ouvrants: [FEN_SE], chauffages: [THERMOSTAT, CHEVET] } } } });
  const sejour = j.carte('Séjour');
  assert.deepEqual(pucesDe(sejour), [[FEN_SE, true], [CONVECTEUR, false], [THERMOSTAT, true], [CHEVET, true]]);
  assert.ok(!html(sejour).includes(INTROUVABLE), 'elle a un état : elle n’est pas introuvable');
  puceDe(sejour, CHEVET).props.onClick();
  assert.deepEqual(j.pieces('Séjour'), [{ chauffages: [THERMOSTAT] }]);
});

/* ════════════ La démo ════════════ */

test('la démo : la chambre coche encore l’interrupteur de son module — elle se montre sur son select', async () => {
  const DEMO = readFileSync(new URL('../src/demo.js', import.meta.url), 'utf8');
  assert.ok(DEMO.includes("pieces: { [lieu('Chambre')]: { actif: true, ouvrants: ['binary_sensor.fenetre_chambre'], chauffages: ['switch.radiateur_chambre'] } },"),
    'témoin : la règle des fenêtres de la démo coche l’interrupteur du module de la chambre — le cas de cette tâche');
  const m = maisonChauffageDemo();
  const index = buildIndex({ ...(await registresDuComposant({ callWS: async () => ({ index: m.index }) })), states: m.states });
  const config = { actif: true, delai: 3, reprise: 0, pieces: { Chambre: { actif: true, ouvrants: ['binary_sensor.fenetre_chambre'], chauffages: ['switch.radiateur_chambre'] } } };
  const j = joue({ index, S: m.states, config });
  const chambre = j.carte('Chambre');
  assert.deepEqual(pucesDe(chambre), [['binary_sensor.fenetre_chambre', true], ['select.radiateur_chambre_fil_pilote', true]],
    'le select du module, coché ; l’interrupteur n’a plus de puce');
  assert.ok(!html(chambre).includes(INTROUVABLE));
  // Le salon garde son radiateur sur simple prise, à côté du poêle.
  const salon = piecesCandidates(index, m.states).find(p => p.nom === 'Salon');
  assert.deepEqual(salon.chauffages.slice().sort(), ['climate.poele', 'switch.radiateur_salon']);
});

/* ════════════ Le tri : ce qui chauffe d'abord (12/10) ════════════
 *
 * Son séjour proposait « 14 chauffages possibles » ; seul le poêle chauffe.
 * Tout `switch` passait pour un chauffage : les interrupteurs du poêle, les
 * réglages d'un robot et d'un interrupteur mural (LED, mode), ceux d'un Echo.
 * Son choix, « Faire le tri » :
 *  - d'abord ce qui chauffe vraisemblablement : un thermostat, un module fil
 *    pilote, une prise (sa `device_class` le dit), un interrupteur dont le nom
 *    annonce un radiateur ;
 *  - jamais le réglage ni le diagnostic d'un appareil (`entity_category`), ni
 *    une entité masquée — sauf déjà cochés : on doit pouvoir les décocher ;
 *  - le reste derrière « Autres interrupteurs (n) », replié, sans rien perdre ;
 *  - l'en-tête de la pièce ne compte que ce qui chauffe vraisemblablement ;
 *  - le cochage d'office ne change pas.
 */

const FEN_SEJOUR = ['binary_sensor.fenetre_sejour', 'binary_sensor.baie_sejour'];
const POELE = 'climate.poele';
const POELE_MARCHE = 'switch.poele_start_stop';
const POELE_MINUTEUR = 'switch.poele_timer';
const LED_NUIT = 'switch.interrupteur_sejour_led_in_dark';
const ECHO = ['ne_pas_deranger', 'melanger', 'repeter', 'annonces', 'communications'].map(x => 'switch.echo_sejour_' + x);
const NE_PAS_DERANGER = ECHO[0];
const FEN_SDB = 'binary_sensor.fenetre_salle_de_bain';
const PRISE_SDB = 'switch.prise_salle_de_bain';                // une prise : sa `device_class` le dit
const RADIATEUR_SDB = 'switch.radiateur_salle_de_bain';        // un interrupteur dont le nom dit le radiateur
const VERROU_SDB = 'switch.radiateur_salle_de_bain_verrou';    // son nom dit « radiateur », sa catégorie le dément
const DIAG_SDB = 'switch.radiateur_salle_de_bain_diagnostic';
const MASQUE_SDB = 'switch.seche_serviette';                   // masqué dans Home Assistant
const FEN_BUREAU = 'binary_sensor.fenetre_bureau';
const ENCEINTE = 'switch.enceinte_bureau_ne_pas_deranger';

/**
 * Chez lui. Le séjour tel qu'il l'a décrit : deux ouvrants, le poêle, deux
 * interrupteurs du poêle, deux réglages du robot, trois de l'interrupteur
 * mural, cinq interrupteurs de l'Echo. La salle de bain : une prise, un
 * radiateur sur interrupteur, le verrouillage enfant et le diagnostic de ce
 * radiateur, un sèche-serviette masqué. Le bureau : une enceinte, rien qui
 * chauffe.
 */
function chezLui() {
  return {
    areas: [area('sejour', 'Séjour'), area('sdb', 'Salle de bain'), area('bureau', 'Bureau')],
    devices: [
      device('d_poele', 'Poêle', 'sejour'),
      device('d_robot', 'Robot', 'sejour'),
      device('d_mural', 'Interrupteur Séjour', 'sejour'),
      device('d_echo', 'Echo Séjour', 'sejour'),
      device('d_prise_sdb', 'Prise salle de bain', 'sdb'),
      device('d_radiateur_sdb', 'Radiateur salle de bain', 'sdb'),
      device('d_enceinte', 'Enceinte bureau', 'bureau'),
    ],
    entities: [
      entity(FEN_SEJOUR[0], { area: 'sejour' }),
      entity(FEN_SEJOUR[1], { area: 'sejour' }),
      { ...entity(POELE, { device: 'd_poele' }), famille: 'thermostat' },
      entity(POELE_MARCHE, { device: 'd_poele' }),
      entity(POELE_MINUTEUR, { device: 'd_poele' }),
      entity('switch.robot_mode_avance', { device: 'd_robot', category: 'config' }),
      entity('switch.robot_preference_de_nettoyage', { device: 'd_robot', category: 'config' }),
      entity('switch.interrupteur_sejour_device_mode', { device: 'd_mural', category: 'config' }),
      entity(LED_NUIT, { device: 'd_mural', category: 'config' }),
      entity('switch.interrupteur_sejour_led_if_on', { device: 'd_mural', category: 'config' }),
      ...ECHO.map(id => entity(id, { device: 'd_echo' })),
      entity(FEN_SDB, { area: 'sdb' }),
      entity(PRISE_SDB, { device: 'd_prise_sdb' }),
      entity(RADIATEUR_SDB, { device: 'd_radiateur_sdb' }),
      entity(VERROU_SDB, { device: 'd_radiateur_sdb', category: 'config' }),
      entity(DIAG_SDB, { device: 'd_radiateur_sdb', category: 'diagnostic' }),
      entity(MASQUE_SDB, { area: 'sdb', hidden: true }),
      entity(FEN_BUREAU, { area: 'bureau' }),
      entity(ENCEINTE, { device: 'd_enceinte' }),
    ],
    floors: [],
    states: states(
      state(FEN_SEJOUR[0], 'off', { friendly_name: 'Fenêtre séjour', device_class: 'window' }),
      state(FEN_SEJOUR[1], 'off', { friendly_name: 'Baie vitrée', device_class: 'door' }),
      state(POELE, 'heat', { friendly_name: 'Poêle', hvac_modes: ['off', 'heat'], temperature: 21 }),
      state(POELE_MARCHE, 'on', { friendly_name: 'Poêle Start / Stop' }),
      state(POELE_MINUTEUR, 'off', { friendly_name: 'Poêle Timer' }),
      state('switch.robot_mode_avance', 'off', { friendly_name: 'Robot Mode avancé' }),
      state('switch.robot_preference_de_nettoyage', 'on', { friendly_name: 'Robot Préférence de nettoyage' }),
      state('switch.interrupteur_sejour_device_mode', 'off', { friendly_name: 'Interrupteur Séjour Device mode' }),
      state(LED_NUIT, 'on', { friendly_name: 'Interrupteur Séjour Led in dark' }),
      state('switch.interrupteur_sejour_led_if_on', 'off', { friendly_name: 'Interrupteur Séjour Led if on' }),
      state(ECHO[0], 'off', { friendly_name: 'Ne pas déranger' }),
      state(ECHO[1], 'off', { friendly_name: 'Mélanger' }),
      state(ECHO[2], 'off', { friendly_name: 'Répéter' }),
      state(ECHO[3], 'on', { friendly_name: 'Annonces' }),
      state(ECHO[4], 'on', { friendly_name: 'Communications' }),
      state(FEN_SDB, 'off', { friendly_name: 'Fenêtre salle de bain', device_class: 'window' }),
      state(PRISE_SDB, 'off', { friendly_name: 'Prise salle de bain', device_class: 'outlet' }),
      state(RADIATEUR_SDB, 'off', { friendly_name: 'Radiateur salle de bain' }),
      state(VERROU_SDB, 'off', { friendly_name: 'Radiateur salle de bain Verrouillage enfant' }),
      state(DIAG_SDB, 'off', { friendly_name: 'Radiateur salle de bain Diagnostic' }),
      state(MASQUE_SDB, 'off', { friendly_name: 'Sèche-serviette' }),
      state(FEN_BUREAU, 'off', { friendly_name: 'Fenêtre bureau', device_class: 'window' }),
      state(ENCEINTE, 'off', { friendly_name: 'Enceinte bureau Ne pas déranger' }),
    ),
    energyPrefs: null,
  };
}

const pieceDe = (fx, nom) => piecesCandidates(indexOf(fx), fx.states).find(p => p.nom === nom);
/* Le bouton qui plie les autres interrupteurs d'une carte : le seul qui dise un état déplié. */
const plis = (carte) => chercher(carte, el => el.type === 'button' && el.props['aria-expanded'] !== undefined);
const reglee = (nom, ouvrants, chauffages) => ({ actif: true, delai: 3, pieces: { [nom]: { actif: true, ouvrants, chauffages } } });

test('son séjour : le poêle seul chauffe vraisemblablement ; ses interrupteurs et ceux de l’Echo attendent à part ; les réglages, nulle part', () => {
  assert.deepEqual(pieceDe(chezLui(), 'Séjour'), {
    nom: 'Séjour', ouvrants: FEN_SEJOUR, chauffages: [POELE], autres: [POELE_MARCHE, POELE_MINUTEUR, ...ECHO],
  }, 'ni le mode avancé du robot ni les LED de l’interrupteur mural : des réglages');
  // Le cochage d'office ne change pas : le poêle, par son domaine.
  const j = joue({ fx: chezLui(), config: { actif: true, delai: 3, pieces: {} } });
  bascule(j.carte('Séjour')).props.cb();
  assert.deepEqual(j.pieces('Séjour'), [{ actif: true, ouvrants: FEN_SEJOUR, chauffages: [POELE] }]);
});

test('une prise, que sa device_class dit, et un interrupteur nommé « Radiateur salle de bain » sont probables ; un réglage, un diagnostic, une entité masquée ne sont nulle part', () => {
  assert.deepEqual(pieceDe(chezLui(), 'Salle de bain'), {
    nom: 'Salle de bain', ouvrants: [FEN_SDB], chauffages: [PRISE_SDB, RADIATEUR_SDB], autres: [],
  }, 'le verrouillage enfant a beau dire « radiateur » : c’est un réglage ; le diagnostic non plus ; le sèche-serviette masqué non plus');
  // Coché d'office comme avant : le radiateur par son nom ; la prise attend
  // qu'on la choisisse. Le verrouillage enfant, qui l'était par son nom, ne
  // l'est plus : la fenêtre ouverte l'aurait coupé.
  const j = joue({ fx: chezLui(), config: { actif: true, delai: 3, pieces: {} } });
  bascule(j.carte('Salle de bain')).props.cb();
  assert.deepEqual(j.pieces('Salle de bain'), [{ actif: true, ouvrants: [FEN_SDB], chauffages: [RADIATEUR_SDB] }]);
  const k = joue({ fx: chezLui(), config: reglee('Salle de bain', [FEN_SDB], [RADIATEUR_SDB]) });
  assert.deepEqual(pucesDe(k.carte('Salle de bain')), [[FEN_SDB, true], [PRISE_SDB, false], [RADIATEUR_SDB, true]]);
});

test('le thermostat et le select d’un module fil pilote restent probables — le select même rangé parmi les réglages : le serveur l’a reconnu', () => {
  const fx = maison();
  // Une intégration peut ranger la liste des ordres d'un module parmi les
  // réglages de l'appareil. C'est pourtant elle qui chauffe, et le serveur
  // l'a reconnue (`chauffage_familles.py`) : la catégorie ne l'écarte pas.
  fx.entities = fx.entities.map(e => (e.entity_id === MODULE ? { ...e, entity_category: 'config' } : e));
  const [chambre, sejour] = piecesCandidates(indexOf(fx), fx.states);
  assert.deepEqual(chambre.chauffages, [MODULE, CHEVET]);
  assert.deepEqual(sejour.chauffages, [CONVECTEUR, THERMOSTAT]);
  const j = joue({ fx, config: { actif: true, delai: 3, pieces: {} } });
  bascule(j.carte('Chambre')).props.cb();
  assert.deepEqual(j.pieces('Chambre'), [{ actif: true, ouvrants: [FEN_CH], chauffages: [MODULE] }], 'coché d’office, comme un thermostat');
});

test('l’en-tête de la pièce ne compte que ce qui chauffe vraisemblablement', () => {
  const j = joue({ fx: chezLui(), config: { actif: true, delai: 3, pieces: {} } });
  // Le texte entier de la ligne, balises comprises : « 1 chauffage possible »
  // est aussi le début de « 1 chauffage possibles ».
  assert.ok(html(j.carte('Séjour')).includes('>2 ouvrants · 1 chauffage possible</div>'), 'le poêle seul');
  assert.ok(html(j.carte('Salle de bain')).includes('>1 ouvrant · 2 chauffages possibles</div>'), 'la prise et le radiateur');
  // Zéro se compte au pluriel, comme tout compte (`trN`) : en polonais, la
  // forme « many », pas le singulier d'un appareil.
  assert.ok(html(j.carte('Bureau')).includes('>1 ouvrant · 0 chauffages possibles</div>'), 'l’enceinte n’en est pas un');
});

test('les autres interrupteurs attendent derrière un bouton replié, qui dit leur nombre et son état ; déplié, leurs puces habituelles', () => {
  const j = joue({ fx: chezLui(), config: reglee('Séjour', FEN_SEJOUR, [POELE]) });
  const avant = j.carte('Séjour');
  assert.equal(plis(avant).length, 1, 'un bouton, sous ce qui chauffe');
  const [b] = plis(avant);
  assert.equal(b.props.type, 'button');
  assert.equal(b.props['aria-expanded'], false, 'replié d’abord');
  assert.equal(b.props['aria-controls'], undefined, 'replié, la région n’est pas montée : pas de référence pendante');
  assert.ok(html(b).includes('Autres interrupteurs (7)'), 'les deux du poêle, les cinq de l’Echo');
  assert.deepEqual(pucesDe(avant), [[FEN_SEJOUR[0], true], [FEN_SEJOUR[1], true], [POELE, true]], 'repliés, ils ne se montrent pas');
  b.props.onClick();
  assert.deepEqual(j.envoyes, [], 'déplier n’écrit rien');
  j.rendre();
  const apres = j.carte('Séjour');
  const [d] = plis(apres);
  assert.equal(d.props['aria-expanded'], true);
  assert.equal(chercher(apres, el => el.props && el.props.id === d.props['aria-controls']).length, 1, 'aria-controls désigne la région dépliée');
  assert.deepEqual(pucesDe(apres), [[FEN_SEJOUR[0], true], [FEN_SEJOUR[1], true], [POELE, true],
    [POELE_MARCHE, false], [POELE_MINUTEUR, false], ...ECHO.map(id => [id, false])], 'leurs puces habituelles, décochées, sans rien perdre');
  assert.equal(puceDe(apres, NE_PAS_DERANGER).props.children, 'Ne pas déranger');
  assert.equal(puceDe(apres, NE_PAS_DERANGER).props.type, 'button');
  d.props.onClick();
  j.rendre();
  assert.equal(plis(j.carte('Séjour'))[0].props['aria-expanded'], false, 'et se replie');
});

test('un autre interrupteur se coche comme les autres : il rejoint ce qui est coupé, et le pli reste ouvert le temps de l’écran', () => {
  const j = joue({ fx: chezLui(), config: reglee('Séjour', FEN_SEJOUR, [POELE]) });
  plis(j.carte('Séjour'))[0].props.onClick();
  j.rendre();
  puceDe(j.carte('Séjour'), NE_PAS_DERANGER).props.onClick();
  assert.deepEqual(j.pieces('Séjour'), [{ chauffages: [POELE, NE_PAS_DERANGER] }], 'écrit comme toute puce');
  j.rendre();
  const sejour = j.carte('Séjour');
  assert.deepEqual(pucesDe(sejour), [[FEN_SEJOUR[0], true], [FEN_SEJOUR[1], true], [POELE, true], [NE_PAS_DERANGER, true],
    [POELE_MARCHE, false], [POELE_MINUTEUR, false], ...ECHO.slice(1).map(id => [id, false])],
  'coché, il se montre avec ce qui est coupé — il se verra même replié');
  const [b] = plis(sejour);
  assert.equal(b.props['aria-expanded'], true, 'le pli n’a pas bougé');
  assert.ok(html(b).includes('Autres interrupteurs (6)'));
  // Décoché, il retourne parmi les autres.
  puceDe(sejour, NE_PAS_DERANGER).props.onClick();
  j.rendre();
  assert.ok(html(plis(j.carte('Séjour'))[0]).includes('Autres interrupteurs (7)'));
});

test('une pièce sans autre interrupteur n’a pas ce bouton ; une pièce où rien ne chauffe vraisemblablement le dit, et garde le sien', () => {
  const sdb = joue({ fx: chezLui(), config: reglee('Salle de bain', [FEN_SDB], [RADIATEUR_SDB]) });
  assert.deepEqual(plis(sdb.carte('Salle de bain')), []);
  const config = { actif: true, delai: 3, pieces: {
    Chambre: { actif: true, ouvrants: [FEN_CH], chauffages: [MODULE] },
    'Séjour': { actif: true, ouvrants: [FEN_SE], chauffages: [THERMOSTAT] },
  } };
  const m = joue({ config });
  assert.deepEqual(plis(m.carte('Chambre')), [], 'la maison du module non plus');
  assert.deepEqual(plis(m.carte('Séjour')), []);
  const bureau = joue({ fx: chezLui(), config: reglee('Bureau', [FEN_BUREAU], []) }).carte('Bureau');
  const h = html(bureau);
  assert.ok(h.includes('Aucun thermostat ni prise dans cette zone.'));
  assert.ok(h.includes('Autre interrupteur (1)'), 'au singulier');
  // ASSERTION MODIFIÉE (19/10) : le vouvoiement.
  assert.ok(h.includes('Rien à couper : choisissez au moins un appareil.'));
});

test('un réglage déjà coché reste visible, coché, et se décoche — une entité masquée de même', () => {
  const j = joue({ fx: chezLui(), config: reglee('Séjour', FEN_SEJOUR, [POELE, LED_NUIT]) });
  const sejour = j.carte('Séjour');
  assert.deepEqual(pucesDe(sejour), [[FEN_SEJOUR[0], true], [FEN_SEJOUR[1], true], [POELE, true], [LED_NUIT, true]],
    'avec ce qui est coupé, pas sous le pli');
  assert.equal(puceDe(sejour, LED_NUIT).props.children, 'Interrupteur Séjour Led in dark');
  assert.ok(!html(sejour).includes(INTROUVABLE), 'il a un état : il n’est pas introuvable');
  assert.ok(html(plis(sejour)[0]).includes('Autres interrupteurs (7)'), 'il ne compte pas parmi les autres');
  puceDe(sejour, LED_NUIT).props.onClick();
  assert.deepEqual(j.envoyes, [{ type: CONFIG, patch: { pieces: { 'Séjour': { chauffages: [POELE] } } } }], 'décoché, et rien d’autre');
  j.rendre();
  plis(j.carte('Séjour'))[0].props.onClick();
  j.rendre();
  assert.ok(!pucesDe(j.carte('Séjour')).some(([id]) => id === LED_NUIT), 'décoché, il ne se propose plus, même déplié');
  const k = joue({ fx: chezLui(), config: reglee('Salle de bain', [FEN_SDB], [MASQUE_SDB]) });
  assert.deepEqual(pucesDe(k.carte('Salle de bain')), [[FEN_SDB, true], [PRISE_SDB, false], [RADIATEUR_SDB, false], [MASQUE_SDB, true]]);
  puceDe(k.carte('Salle de bain'), MASQUE_SDB).props.onClick();
  assert.deepEqual(k.pieces('Salle de bain'), [{ chauffages: [] }]);
});
