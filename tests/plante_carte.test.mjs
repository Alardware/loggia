/* La carte et la fiche d'une plante (chantier Capteurs, étapes 2 et 3, tâche 10 ; C29 à C31, C34, § 7, § 19.9).
 *
 * Ce qui est garanti ici :
 *  - la vue (plantes.js, pur) : muette, « Indisponible depuis {quand} » en rouge ; ce qui presse, deux au plus, avec les mots
 *    d'aujourd'hui, en ambre ; sinon le mot du sol, en neutre ; sans sol, « Mesure absente » ; jamais « Tout lui convient » ; les
 *    repères restent ceux de `verdictsPlante` (C30) ;
 *  - les conseils (C31) : une phrase par mesure qui presse, « L'arrosage peut attendre. » si le sol va bien et qu'autre chose presse ;
 *  - la barre : la plage idéale et le repère, la lumière sur une échelle logarithmique ; le dernier relevé d'une plante muette ;
 *  - la carte (C30) : la plaque feuille sur le vert de la plante, le nom, la phrase, le sol en chiffre et « SOL » dessous, la grille
 *    de quatre valeurs — l'ambre sur ce qui presse seulement —, le dessin en filigrane (un fichier, C34), le lavis ambre seulement
 *    quand quelque chose presse — plus de lavis vert ; la carte étroite : la grille commune, le sol en haut ; la compacte ; muette, le
 *    liseré ;
 *  - la fiche (C31), à la demande : l'en-tête sans épingle, le sol en 48 px, la phrase et les conseils, quatre mesures avec leur barre et
 *    « Idéal : {a} à {b} {u} », la pile, le dernier signal, L'appareil ; muette, les statistiques lues UNE fois, « Dernier relevé … »
 *    et « Changez la pile. » seulement si la pile était faible ;
 *  - la coquille garde la feuille et pose la frontière Suspense dedans ; les mots d'avant ont quitté App.jsx ;
 *  - les sections : une plante qui presse ou qui se tait est à regarder ; l'enveloppe s'abonne à ses capteurs.
 * `RoomPlantCard`, `FichePlante`, `lirePlante` et `jugerObjet` vivent dans App.jsx : sous `?plante`, un crochet de chargement leur
 * ajoute un export. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { indexOf } from './fixtures.mjs';
import { monter } from './crochets.mjs';
import { maisonPlantes } from './maison_capteurs.mjs';
import { vuePlante, conseilsPlante, barrePlante, dernierReleve, quandPlante } from '../src/plantes.js';
import { PLAGES_PLANTE, verdictsPlante } from '../src/objets.js';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?plante')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?plante'.length), ctx);",
  // Passe bis (17/10, point 6) : `plantesDeLaMaison`, pour tenir son cache.
  "  return { ...r, source: String(r.source) + ';export { RoomPlantCard, FichePlante, lirePlante, jugerObjet, objetsDeLaMaison, plantesDeLaMaison };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?plante', import.meta.url).href);
const FP = await import('../src/ficheplante.jsx');
const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

const MIN = 60000;
const DRACAENA = { base: 'sensor.dracaena', name: 'Dracaena Marginata', mort: false, muetDepuis: null, img: 'dracaena', room: 'Séjour', hum: 28, lux: 84, temp: 19.5, cond: 784, uniteTemp: 'C', bat: 100,
  ids: { hum: 'sensor.dracaena_sol', lux: 'sensor.dracaena_lumiere', temp: 'sensor.dracaena_temperature', cond: 'sensor.dracaena_conductivite', bat: 'sensor.dracaena_pile' } };
const calme = { ...DRACAENA, hum: 40, lux: 1000, temp: 21, cond: 600 };
const quand = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

test('C30 : la vue d’une plante — muette en rouge, ce qui presse en ambre (deux au plus), le sol en neutre ; jamais « Tout lui convient »', () => {
  const v = vuePlante(DRACAENA, { quand });
  assert.deepEqual([v.phrase, v.ton, v.sol, v.chiffre, v.regarder, v.jugee, v.muette], ['Lumière faible', 'warn', 28, '28\u00a0%', true, true, false]);
  assert.deepEqual(v.mesures.map(m => [m.cle, m.valeur, m.presse]), [['hum', '28\u00a0%', false], ['lux', '84\u00a0lx', true], ['temp', '19,5\u00a0°C', false], ['cond', '784\u00a0µS/cm', false]], 'l’ambre sur ce qui presse seulement ; l’engrais reste neutre');
  assert.equal(vuePlante({ ...DRACAENA, hum: 10 }).phrase, 'À arroser · Lumière faible', 'ce qui presse d’abord, les mots d’aujourd’hui');
  assert.equal(vuePlante({ ...DRACAENA, hum: 10, temp: 5 }).phrase, 'À arroser · Lumière faible', 'deux au plus');
  const bon = vuePlante(calme);
  assert.deepEqual([bon.phrase, bon.ton, bon.regarder, bon.jugee], ['Humidité correcte', null, false, true]);
  assert.deepEqual([vuePlante({ ...calme, hum: 80 }).phrase, vuePlante({ ...calme, hum: 80 }).ton], ['Sol très humide', null], 'un sol très humide reste neutre sur la carte');
  assert.deepEqual([vuePlante({ ...calme, hum: null }).phrase, vuePlante({ ...calme, hum: null }).regarder, vuePlante({ ...calme, hum: null }).jugee, vuePlante({ ...calme, hum: null }).chiffre], ['Mesure absente', false, false, '—']);
  const t = Date.UTC(2026, 9, 10, 12, 5);
  const muette = vuePlante({ ...DRACAENA, mort: true, muetDepuis: t }, { quand });
  assert.deepEqual([muette.phrase, muette.ton, muette.regarder, muette.jugee, muette.sol, muette.mesures.map(m => m.valeur)], ['Indisponible depuis ' + quand(t), 'bad', true, true, null, [null, null, null, null]]);
  assert.equal(vuePlante({ ...DRACAENA, mort: true }).phrase, 'Indisponible', 'sans heure connue');
  for (const x of [v, bon, muette]) assert.ok(!JSON.stringify(x).includes('Tout lui convient') && !JSON.stringify(x).includes('Tout va bien'));
  // Les repères ne bougent pas (C30) : la seule table.
  assert.deepEqual(PLAGES_PLANTE, { hum: [15, 70], temp: [10, 32], lux: [500, 20000], cond: [350, 2000] });
  assert.deepEqual(verdictsPlante({ hum: 14, temp: 33, lux: 499, cond: 2001 }), { hum: 'sec', temp: 'chaud', lux: 'faible', cond: 'trop', presse: ['arroser', 'lumiere', 'temperature'] });
});

test('C31 : les conseils — une phrase par mesure qui presse, dans l’unité du capteur ; « L’arrosage peut attendre. » si le sol va bien et qu’autre chose presse', () => {
  assert.deepEqual(conseilsPlante(DRACAENA), ['Rapprochez-la d’une fenêtre : 84 lx reçus, il lui en faut au moins 500.', 'L’arrosage peut attendre.']);
  assert.deepEqual(conseilsPlante({ ...DRACAENA, hum: 10, temp: 5 }), ['Arrosez-la : le sol est à 10 %, il lui en faut au moins 15 %.', 'Rapprochez-la d’une fenêtre : 84 lx reçus, il lui en faut au moins 500.', 'Mettez-la au chaud : 5 °C, elle demande au moins 10 °C.']);
  assert.deepEqual(conseilsPlante({ ...calme, temp: 35 }), ['Éloignez-la de la chaleur : 35 °C, au-delà de 32 °C.', 'L’arrosage peut attendre.']);
  assert.deepEqual(conseilsPlante({ ...calme, temp: 35, uniteTemp: 'F' }, { deCelsius: (c) => Math.round(c * 9 / 5 + 32) }), ['Éloignez-la de la chaleur : 95 °F, au-delà de 90 °F.', 'L’arrosage peut attendre.'], 'en Fahrenheit, les repères se convertissent');
  assert.deepEqual(conseilsPlante(calme), [], 'au calme, rien');
  assert.deepEqual(conseilsPlante({ ...calme, hum: 80, lux: 84 }), ['Rapprochez-la d’une fenêtre : 84 lx reçus, il lui en faut au moins 500.'], 'un sol très humide : l’arrosage n’attend pas « bien »');
});

test('la barre d’une mesure, la lumière sur une échelle logarithmique ; le dernier relevé d’une plante muette ; « sam. 14:05 »', () => {
  assert.deepEqual(barrePlante('hum', 28), { plage: [15, 70], pos: 28 });
  assert.deepEqual(barrePlante('temp', 20), { plage: [25, 80], pos: 50 });
  const lux = barrePlante('lux', 84);
  assert.deepEqual(lux.plage, [54, 86], '500 à 20 000 lx sur cinq décades');
  assert.ok(lux.pos > 38 && lux.pos < 39, '84 lx : ' + lux.pos);
  assert.deepEqual([barrePlante('lux', 0).pos, barrePlante('cond', 5000).pos, barrePlante('hum', null).pos], [0, 100, null], 'borné, et rien sans valeur');
  const r = { 'sensor.sol': [{ start: 1, end: 2, mean: 30 }, { start: 2, end: 3, mean: 12.4 }], 'sensor.pile': [{ start: 1, end: 2, mean: 6 }, { start: 2, end: 3, mean: 4 }] };
  assert.deepEqual(dernierReleve(r, 'sensor.sol', 'sensor.pile'), { quand: 3, sol: 12, pile: 4 });
  assert.deepEqual(dernierReleve(r, 'sensor.sol', null), { quand: 3, sol: 12, pile: null });
  assert.equal(dernierReleve({}, 'sensor.sol', 'sensor.pile'), null, 'sans relevé, rien n’est deviné');
  const t = new Date(2026, 9, 15, 20, 40).getTime();
  assert.equal(quandPlante(t - 2 * 3600000, t, 'fr-FR'), '18:40', 'aujourd’hui : l’heure');
  assert.equal(quandPlante(new Date(2026, 9, 10, 14, 5).getTime(), t, 'fr-FR'), 'sam. 14:05', 'un autre jour : son nom');
});

const html = (props) => renderToStaticMarkup(createElement(F.RoomPlantCard, { nom: 'Dracaena Marginata', onOpen: () => {}, ...props }));

test('C30, C34 : la carte large — la feuille sur le vert, la phrase, le sol et « SOL », la grille, le dessin en fichier ; le lavis ambre seulement quand ça presse', () => {
  const c = html({ pl: DRACAENA });
  assert.ok(c.includes('class="o-rmcard o-gabarit"') && c.includes('data-plante=""') && c.includes('role="button"') && c.includes('aria-haspopup="dialog"'), 'la grille commune, un bouton sans commande');
  assert.ok(c.includes('aria-label="Dracaena Marginata, 28 %, Lumière faible"'), 'ce que la carte affiche : le nom, le sol, la phrase');
  assert.ok(c.includes('background:rgba(var(--o-ok-rgb),.14);color:var(--o-ok)') && c.includes('fi-rr-leaf'), 'la plaque : la feuille sur le vert de la plante — son identité, pas un verdict');
  assert.ok(c.includes('>Lumière faible<') && c.includes('>28\u00a0%<') && c.includes('>Sol<'), 'la phrase, le sol en chiffre, « SOL » dessous');
  assert.ok(c.includes('>84\u00a0lx<') && c.includes('>19,5\u00a0°C<') && c.includes('>784\u00a0µS/cm<'), 'la grille des quatre valeurs');
  assert.ok(c.includes('url(&quot;./plantes/dracaena.svg&quot;)') && c.includes('opacity:0.14'), 'le dessin choisi, un fichier (C34), en filigrane');
  assert.ok(c.includes('linear-gradient(180deg,rgba(var(--o-warn-rgb),0.1)'), 'le lavis ambre : quelque chose presse');
  assert.ok(!c.includes('--o-ok-rgb),0.') && !c.includes('--o-ok-rgb),.2'), 'plus de lavis vert');
  const bon = html({ pl: calme });
  assert.ok(!bon.includes('linear-gradient(180deg,rgba(') && bon.includes('>Humidité correcte<') && !bon.includes('color:var(--o-warn)'), 'au calme : neutre, sans lavis ni ambre');
  // La grille : l'ambre sur la lumière seule ; le sol en haut (ChiffreHaut) pour la carte étroite, le chiffre large à part.
  const grille = c.slice(c.indexOf('data-grille=""'));
  assert.equal((grille.match(/color:var\(--o-warn\)/g) || []).length, 2, 'la lumière faible : son glyphe et sa valeur en ambre, rien d’autre');
  assert.ok(c.includes('class="o-gab-chiffre o-seul-etroit"') && c.includes('class="o-seul-large" data-grille=""'), 'le chiffre du haut sur la carte étroite ; la grille sur la carte large seulement');
  const muette = html({ pl: { ...DRACAENA, mort: true, muetDepuis: Date.now() - 50 * MIN } });
  assert.ok(muette.includes('o-rmcard o-gabarit o-panne') && muette.includes('color:var(--o-bad)') && muette.includes('>Indisponible depuis '), 'muette : le liseré, la phrase en rouge');
  const compacte = html({ pl: DRACAENA, chip: true });
  assert.ok(compacte.includes("class=\"o-piece o-cvdense\"") && compacte.includes('>Lumière faible<') && compacte.includes('>28\u00a0%<') && !compacte.includes('data-grille'), 'la compacte : la plaque, le nom, la phrase, le sol à droite');
  assert.ok(!APP.includes('const MOTS_PLANTE = ') && !APP.includes('function verdictCartePlante('), 'les mots d’avant ont quitté App.jsx');
});

test('C31 : la fiche — sans épingle, le sol en 48 px, la phrase, les conseils, quatre mesures avec leur barre et leur plage, la pile, le dernier signal, L’appareil', () => {
  const S = Object.fromEntries(Object.values(DRACAENA.ids).map(id => [id, { entity_id: id, state: '1', last_updated: '2026-10-16T09:00:00Z', attributes: {} }]));
  const fiches = [];
  const m = monter(FP.default, { pl: DRACAENA, hass: { states: S }, onFiche: (id) => fiches.push(id) });
  const entete = m.trouver(e => e.props && e.props.sousNom !== undefined)[0];
  assert.deepEqual([entete.props.nom, entete.props.sousNom, entete.props.epingle, entete.props.plaque.icone], ['Dracaena Marginata', 'Séjour · capteur de plante', undefined, 'leaf']);
  const texte = m.texte();
  assert.ok(texte.includes('28% de sol') && texte.includes('Lumière faible') && texte.includes('Rapprochez-la d’une fenêtre : 84 lx reçus, il lui en faut au moins 500.') && texte.includes('L’arrosage peut attendre.'), texte.slice(0, 300));
  const gros = m.trouver(e => e.props && e.props.style && e.props.style.fontSize === 48)[0];
  assert.equal(gros.props.children, '28');
  const mesures = m.trouver(e => e.props && e.props['data-mesure']).map(e => e.props['data-mesure']);
  assert.deepEqual(mesures, ['hum', 'lux', 'temp', 'cond']);
  assert.ok(texte.includes('Idéal : 15 à 70 %') && texte.includes('Idéal : 500 à 20\u202f000 lx') && texte.includes('Idéal : 10 à 32 °C') && texte.includes('Idéal : 350 à 2\u202f000 µS/cm'));
  assert.equal(m.trouver(e => e.props && e.props['data-repere'] !== undefined).length, 4, 'un repère par mesure');
  assert.equal(m.trouver(e => e.props && e.props['data-plage'] !== undefined).length, 4, 'la plage idéale, en vert à 0,28');
  assert.ok(texte.includes('Pile du capteur') && texte.includes('100\u00a0%') && texte.includes('Dernier signal') && texte.includes('L’appareil'));
  m.appuyer(m.trouver(e => e.type === 'button')[0]);
  assert.deepEqual(fiches, ['sensor.dracaena_sol'], 'L’appareil ouvre la fiche universelle, par le capteur de sol');
  assert.equal(m.trouver(e => e.props && e.props['data-releve'] !== undefined).length, 0, 'vivante : pas de dernier relevé');
});

test('§ 7.3 : muette — les statistiques lues UNE fois (l’heure, dix jours, le sol et la pile), « Dernier relevé … : sol à 12 % », « Changez la pile. » seulement si elle était faible', async () => {
  const t = new Date(2026, 9, 15, 20, 40).getTime();
  const samedi = new Date(2026, 9, 10, 14, 0).getTime();
  const demandes = [];
  const reponse = (pile) => ({ 'sensor.dracaena_sol': [{ start: samedi - 3600e3, end: samedi, mean: 12.3 }], 'sensor.dracaena_pile': [{ start: samedi - 3600e3, end: samedi, mean: pile }] });
  const monte = async (pile) => {
    const hass = { states: {}, callWS: (msg) => { demandes.push(msg); return Promise.resolve(reponse(pile)); } };
    const m = monter(FP.default, { pl: { ...DRACAENA, mort: true, muetDepuis: samedi, hum: null, lux: null, temp: null, cond: null, bat: null }, hass, maintenant: t });
    await new Promise(r => setTimeout(r, 0));
    m.rendre();
    return m;
  };
  const m = await monte(4);
  assert.equal(demandes.length, 1, 'une lecture, à l’ouverture');
  assert.deepEqual([demandes[0].type, demandes[0].period, demandes[0].types, demandes[0].statistic_ids], ['recorder/statistics_during_period', 'hour', ['mean'], ['sensor.dracaena_sol', 'sensor.dracaena_pile']]);
  assert.ok(Date.parse(demandes[0].start_time) < Date.now() - 9.9 * 86400000, 'dix jours');
  const texte = m.texte();
  assert.ok(texte.includes('Indisponible depuis sam. 14:00') && texte.includes('Dernier relevé sam. 14:00 : sol à 12 % Changez la pile.'), texte);
  assert.ok(texte.includes('—% de sol') || texte.includes('—'), 'le sol : « — »');
  assert.equal(m.trouver(e => e.props && e.props.className === 'o-panne').length, 1, 'le liseré sur le panneau de l’état');
  assert.equal(m.trouver(e => e.props && e.props['data-repere'] !== undefined).length, 0, 'aucun repère : rien n’est deviné');
  const m2 = await monte(60);
  assert.ok(m2.texte().includes('Dernier relevé sam. 14:00 : sol à 12 % Le capteur ne répond plus.'), 'la pile tenait : le capteur ne répond plus');
  // Vivante : aucune statistique n'est demandée.
  const avant = demandes.length;
  monter(FP.default, { pl: DRACAENA, hass: { states: {}, callWS: (msg) => { demandes.push(msg); return Promise.resolve({}); } } });
  await new Promise(r => setTimeout(r, 0));
  assert.equal(demandes.length, avant, 'les statistiques ne se lisent que muette');
});

/* TEST AJOUTÉ (passe bis du 17/10, point 3) : une plante muette SANS statistique — une sonde à plat depuis plus de dix jours, un sol sans
 * `state_class` — ne « charge » pas sans fin. « Pas encore lu » et « lu, rien trouvé » se distinguent : « Chargement… » avant la réponse,
 * « Aucun relevé récent » après une réponse vide. Rien n'est deviné : ni heure, ni « Changez la pile. ». */
test('passe bis, point 3 : muette sans relevé — « Chargement… » avant la réponse, « Aucun relevé récent » après, jamais « Chargement… » sans fin', async () => {
  const t = new Date(2026, 9, 15, 20, 40).getTime();
  const samedi = new Date(2026, 9, 1, 14, 0).getTime();
  const muette = { ...DRACAENA, mort: true, muetDepuis: samedi, hum: null, lux: null, temp: null, cond: null, bat: null };
  for (const reponse of [{}, { 'sensor.dracaena_pile': [{ start: samedi - 3600e3, end: samedi, mean: 4 }] }, { 'sensor.dracaena_sol': [] }]) {
    let repondre = null;
    const hass = { states: {}, callWS: () => new Promise((ok) => { repondre = ok; }) };
    const m = monter(FP.default, { pl: muette, hass, maintenant: t });
    assert.ok(m.texte().includes('Chargement…'), 'avant la réponse : « Chargement… »');
    repondre(reponse);
    await new Promise(r => setTimeout(r, 0));
    m.rendre();
    const texte = m.texte();
    assert.ok(texte.includes('Aucun relevé récent') && !texte.includes('Chargement…') && !texte.includes('Dernier relevé') && !texte.includes('Changez la pile.'), texte);
    assert.equal(m.trouver(e => e.props && e.props['data-releve'] !== undefined).length, 1, 'la ligne du relevé, qui dit qu’il n’y en a pas');
    m.demonter();
  }
});

/* TEST AJOUTÉ (passe bis du 17/10, point 6) : `plantesDeLaMaison` se lit une fois par relevé de la maison, par index et par configuration, comme les
 * membres des groupes et les piles — `plantKeys()` la demandait à chaque rendu de l'App, de chaque carte de plante et de `jugerObjet`, et triait
 * tout `S` à chaque fois. */
test('passe bis, point 6 : les plantes de la maison, lues une fois par relevé — le même relevé rend la même liste, un autre relevé ou une autre configuration la relit', () => avec((S, fx) => {
  const a = F.plantesDeLaMaison(S);
  assert.equal(F.plantesDeLaMaison(S), a, 'le même relevé : la même liste, sans retrier la maison');
  assert.deepEqual(a.map(p => p.base), ['sensor.ficus', 'sensor.capteur_plante_7f3e', 'sensor.orchidee']);
  const S2 = { ...S };
  const b = F.plantesDeLaMaison(S2);
  assert.notEqual(b, a, 'un autre relevé : relue');
  assert.deepEqual(b.map(p => p.base), a.map(p => p.base));
  // La configuration qui complète (`loggia_plants`) change, le relevé non : relue quand même, sans attendre le relevé suivant.
  setLoggiaState({ index: indexOf(fx), ent: {}, cfg: { loggia_rooms: PIECES, loggia_plants: [{ base: 'sensor.basilic', name: 'Basilic', room: 'Bureau' }] }, resolved: null });
  const c = F.plantesDeLaMaison(S2);
  assert.notEqual(c, b, 'la configuration a changé : relue');
  assert.ok(c.some(p => p.base === 'sensor.basilic'), 'la plante configurée entre dans la liste');
  assert.equal(F.plantesDeLaMaison(S2), c, 'et se garde à son tour');
}));

/* La maison des plantes (maison_capteurs.mjs) : le Ficus découvert dans « Technique », qui manque de lumière ; le capteur « Monstera »
 * au bureau, sol à 12 % ; l'Orchidée au séjour. */
const PIECES = [{ room: 'Bureau' }, { room: 'Séjour' }];
function avec(f, etats = null) {
  const fx = maisonPlantes();
  const S = etats ? etats(fx.states) : fx.states;
  setLoggiaState({ index: indexOf(fx), ent: {}, cfg: { loggia_rooms: PIECES, loggia_plants: [] }, resolved: null });
  try { return f(S, fx); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}

test('C29, C33 : la plante lue dans la maison, ses capteurs ; la section la juge — à regarder si elle presse ou se tait ; l’enveloppe s’abonne à ses capteurs', () => avec((S) => {
  const ficus = F.lirePlante({ states: S }, 'sensor.ficus');
  assert.deepEqual([ficus.name, ficus.room, ficus.hum, ficus.lux, ficus.temp, ficus.cond, ficus.bat, ficus.mort, ficus.ids.hum], ['Ficus', null, 28, 84, 19.5, 784, 100, false, 'sensor.ficus_moisture'], '« Technique » n’est pas une pièce : rien sous le Ficus');
  const objets = F.objetsDeLaMaison({ states: S }, [], new Set());
  const plantes = objets.filter(o => o.type === 'plant');
  assert.deepEqual(plantes.map(o => [o.cle, o.capteurs.length]), [['plant:sensor.ficus', 5], ['plant:sensor.capteur_plante_7f3e', 3], ['plant:sensor.orchidee', 2]], 'chaque plante connaît ses capteurs : l’enveloppe s’y abonne');
  const juger = (cle, etats = S) => F.jugerObjet({ states: etats }, plantes.find(o => o.cle === cle));
  assert.deepEqual([juger('plant:sensor.ficus'), juger('plant:sensor.capteur_plante_7f3e'), juger('plant:sensor.orchidee')], ['regarder', 'regarder', 'bonne'], 'le Ficus manque de lumière, le Monstera a soif, l’Orchidée va bien');
  const muet = { ...S, 'sensor.orchidee_sol': { ...S['sensor.orchidee_sol'], state: 'unavailable' } };
  assert.equal(juger('plant:sensor.orchidee', muet), 'regarder', 'une plante qui se tait est à regarder');
  assert.equal(F.lirePlante({ states: muet }, 'sensor.orchidee').mort, true);
  const v = APP.indexOf('\nfunction SectionsCapteursVive(');
  assert.ok(APP.slice(v, APP.indexOf('\n}\n', v)).includes("...objets.filter(o => o.type === 'plant').flatMap(o => o.capteurs || [])"), 'les capteurs des plantes, en direct');
}));

test('la coquille garde la feuille et pose la frontière Suspense DEDANS ; le contenu, à la demande, lit la plante vivante ; L’appareil par-dessus', () => {
  assert.ok(APP.includes("const FichePlanteContent = lazyRecharge(() => import('./ficheplante.jsx'));"));
  const i = APP.indexOf('\nfunction FichePlante(');
  const coquille = APP.slice(i, APP.indexOf('\n}\n', i));
  const [feuille, frontiere, contenu] = ['<BottomSheet onClose={onClose}>', '<Suspense fallback={<div style={{ minHeight: 260 }} />}>', '<FichePlanteContent pl={vive} hass={H} onFiche={setFiche} />'].map(x => coquille.indexOf(x));
  assert.ok(feuille >= 0 && frontiere > feuille && contenu > frontiere, 'la feuille, puis la frontière, puis le contenu');
  assert.ok(coquille.includes('const H = hassQuiConnait(useHass(ids), hass, ids[0]);') && coquille.includes('{fiche && <FicheAppareil id={fiche} hass={H} onClose={() => setFiche(null)} />}'));
  const d = APP.indexOf('\nfunction useDomainCards(');
  const dc = APP.slice(d, APP.indexOf('\n}\n', d));
  assert.ok(dc.includes('<RoomPlantCard chip={chip} pl={pl} nom={label || pl.name} onOpen={() => setPlantPop(pl)} />') && dc.includes('{plantPop && <FichePlante pl={plantPop} hass={hass} onClose={() => setPlantPop(null)} />}'));
  assert.ok(!readFileSync(new URL('../src/ficheplante.jsx', import.meta.url), 'utf8').includes('BottomSheet'), 'le module ne repose pas la feuille');
});
