// ─────────────────────────────────────────────────────────────────────────────
// Plus de vue Croquettes : les repas s'activent dans la fiche du distributeur
// (04/10).
//
// L'utilisateur : « pas de vue croquette aucun intérêt, il n'y a plus de vue
// spéciale pour un appareil, c'est la carte plus sa popup c'est tout ». La vue
// n'avait plus d'entrée de menu depuis le 30/08 : on ne l'atteignait que par
// son adresse (`?vue=croquettes`, un onglet qui l'avait mémorisée). Mais elle
// était le SEUL endroit où l'on activait ou coupait un repas — la fiche ne
// faisait que les compter. Supprimer la vue sans rien déplacer aurait retiré
// le geste.
//
// Ce test tient les trois moitiés : la vue est partie de partout (routes,
// tables, disponibilité, styles), une vue « croquettes » mémorisée retombe sur
// l'Accueil, et la fiche montre une ligne par repas avec son interrupteur, qui
// bascule l'entité du repas et affiche tout de suite ce qu'on a demandé. La
// fiche est RENDUE (esbuild, comme lot13_accueil_tuiles_moment) : on lit le
// HTML, pas le JSX.
//
// 05/10 (ADR 0155) : la fiche devient une feuille à onglets sur le modèle du
// robot (fichedistributeur.jsx), et l'ancienne liste de Paramètres n'est plus
// un planning. Les mêmes garanties portent désormais sur les AUTOMATISATIONS
// qui commandent le distributeur — une ligne chacune, son interrupteur, la
// demande en vol par entité, la réserve comptée sur les seules allumées — et
// la coquille d'App.jsx ne garde que la feuille, l'abonnement et l'épingle.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement, Fragment, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import { composant } from './rendu.mjs';

// La langue AVANT les imports : i18n et les dates la lisent au chargement.
if (typeof globalThis.navigator === 'undefined') Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('src', 'App.jsx');
const CSS = lire('src', 'index.css');
const VUES = lire('src', 'views.js');
const SRC_FICHE = lire('src', 'fichedistributeur.jsx');

const Fi = await composant('ui.jsx', 'Fi');
const BasculeUi = await composant('ui.jsx', 'Bascule');
const { tr, trN } = await import(new URL('../src/i18n.js', import.meta.url));
const { useDemandes, demandeCle } = await import(new URL('../src/optimiste.js', import.meta.url));
const { viewAvailability, VIEW_IDS } = await import(new URL('../src/views.js', import.meta.url));

/** Un morceau d'App.jsx, de `debut` jusqu'à `fin` compris. */
function morceau(debut, fin, dans = APP) {
  const d = dans.indexOf(debut);
  assert.ok(d >= 0, '« ' + debut + ' » introuvable');
  const f = dans.indexOf(fin, d);
  assert.ok(f >= 0, '« ' + fin.trim() + ' » introuvable après « ' + debut + ' »');
  return dans.slice(d, f + fin.length);
}
/** Ce morceau, compilé puis exécuté ; `portee` lui donne ce qu'il lit autour de lui. */
// Des noms de fabrique qu'aucun module n'emploie : fichedistributeur.jsx a son propre `h`.
function evaluer(code, portee, rendu) {
  const js = transformSync(code, { loader: 'jsx', jsx: 'transform', jsxFactory: '__h', jsxFragment: '__Frag' }).code;
  const noms = Object.keys(portee);
  return new Function('__h', '__Frag', ...noms, js + '\nreturn ' + rendu + ';')(createElement, Fragment, ...noms.map(n => portee[n]));
}

test('la vue Croquettes est partie de partout', () => {
  assert.ok(!APP.includes('function CroquettesView(') && !APP.includes('function CroquettesContent('), 'la vue est encore là');
  assert.ok(!APP.includes("view === 'croquettes'"), 'sa route est encore là');
  assert.ok(!/'Croquettes': 'croquettes'/.test(APP), 'LABEL_VIEW la connaît encore');
  for (const [debut, fin] of [['const BUILT = new Set(', ']);'], ['const VUES_RENDUES = new Set(', ']);'],
    ['const VIEW_TITLES = {', '\n};'], ['const VIEW_HAKEYS = {', '\n  };']]) {
    const t = morceau(debut, fin);
    assert.ok(!t.includes('croquettes'), debut + ' la connaît encore');
  }
  assert.ok(!VIEW_IDS.includes('croquettes'), 'views.js la compte encore parmi les vues');
  assert.ok(!VUES.includes('out.croquettes'), 'views.js calcule encore sa disponibilité');
  const r = viewAvailability({ ready: true, caps: { has: {}, views: {} }, states: { 'input_number.bac': { state: '700' } },
    userCfg: { loggia_feeder: { haids: { reservoir: 'input_number.bac' } } } });
  assert.equal(r.croquettes, undefined, 'un distributeur configuré fait encore apparaître une vue à lui');
  assert.equal(r.objets.ok, true, 'le distributeur ouvre Objets, où vivent sa carte et sa fiche');
  assert.ok(!CSS.includes('grid-croqmeals') && !CSS.includes('croq-bubble') && !CSS.includes('croq-ring'), 'les styles de la vue sont restés');
  assert.ok(!lire('src', 'Onboarding.jsx').includes('croquettes:'), 'le premier lancement la liste encore');
});

test('« Distribuer » garde une seule portion : les boutons 2 et 3 portions sont partis avec la vue', () => {
  assert.ok(!APP.includes('[1, 2, 3].map(n =>') && !APP.includes('variables: { portions'), 'la distribution de plusieurs portions est restée');
  // La carte : UNE portion, la commande de l'appareil désigné (ADR 0155).
  const dc = morceau('  const distributeur = () => {', '\n  };\n');
  assert.ok(dc.includes('const envoi = vis ? envoiDistribuer(lu.commande, 1) : null;'), 'la carte lance une portion, par la commande de l’appareil');
  assert.ok(!dc.includes("Object.keys(S).find(x => x.indexOf('select.') === 0") && !APP.includes('feederScript('), 'la carte prend encore le premier select feed de la maison, ou un script deviné');
  // La fiche : un seul « Distribuer » ; plusieurs portions SEULEMENT pas à pas, pour une commande qui écrit une quantité.
  const debut = SRC_FICHE.indexOf('function OngletAccueil(');
  const fiche = SRC_FICHE.slice(debut, SRC_FICHE.indexOf('\n}\n', debut));
  assert.equal((fiche.match(/<button type="button" onClick=\{distribuer\}/g) || []).length, 1, 'un seul bouton « Distribuer » dans la fiche');
  assert.ok(fiche.includes('envoiDistribuer(c, c.quantite ? n : 1)'), 'une pression = une ration, sauf commande qui écrit une quantité');
});

test('une vue « croquettes » mémorisée, ou ?vue=croquettes, retombe sur l’Accueil', () => {
  const vueRendue = evaluer(morceau('const VUES_RENDUES = new Set(', "v.indexOf('cv:') === 0);"), {}, 'vueRendue');
  assert.equal(vueRendue('croquettes'), false, 'la vue mémorisée serait encore rendue');
  assert.equal(vueRendue('objets'), true);
  assert.equal(vueRendue('room:Salon'), true);
  // L'amorce pose `?vue=…` dans la session telle quelle : c'est la lecture
  // de la vue au premier rendu qui doit refuser une vue partie.
  assert.match(lire('src', 'main.jsx'), /sessionStorage\.setItem\('loggia-vue', vu\)/);
  const init = morceau('const [view, setView] = useState(() => {', '\n  });');
  const corps = init.slice(init.indexOf('{', init.indexOf('=>')) + 1, init.lastIndexOf('}'));
  const lireVue = (memo) => new Function('window', 'vueRendue', corps)({ sessionStorage: { getItem: () => memo } }, vueRendue);
  assert.equal(lireVue('croquettes'), 'accueil', 'un onglet qui avait mémorisé la vue s’ouvrirait sur un écran vide');
  assert.equal(lireVue('energie'), 'energie', 'une vue qui existe reste où elle était');
});

/* La fiche, RENDUE : fichedistributeur.jsx compilé tel quel, chaque nom qu'il
 * importe pris dans son vrai module — sauf trois doublures qui OBSERVENT :
 * l'interrupteur (pour l'actionner), le service (pour voir ce qui part) et,
 * au besoin, la table des demandes en vol. */
const PORTEE_FICHE = {};
for (const [, noms, spec] of SRC_FICHE.matchAll(/^import \{([\s\S]*?)\} from '([^']+)';$/gm)) {
  const m = spec === 'react' ? await import('react') : await import(new URL('../src/' + spec.slice(2), import.meta.url).href);
  noms.split(',').map(x => x.trim()).filter(Boolean).forEach(n => { const [a, b] = n.split(/\s+as\s+/); PORTEE_FICHE[b || a] = m[a]; });
}
const CODE_FICHE = SRC_FICHE.replace(/^import [\s\S]*?';$/gm, '').replace(/^export default function /m, 'function ').replace(/^export (function|const) /gm, '$1 ');

const QUAND = '2026-10-04T06:00:00.000Z';
const st = (id, state, attributes = {}, quand = QUAND) => ({ entity_id: id, state, last_changed: quand, attributes });
const ETATS = {
  'select.distributeur_feed': st('select.distributeur_feed', 'STOP', { options: ['STOP', 'START'] }),
  'number.distributeur_portion': st('number.distributeur_portion', '45', { min: 5, max: 100, step: 5, unit_of_measurement: 'g' }),
  'input_number.croquettes_reservoir': st('input_number.croquettes_reservoir', '760', { max: 1500, unit_of_measurement: 'g' }),
  'automation.croquettes_matin_et_soir': st('automation.croquettes_matin_et_soir', 'on', { friendly_name: 'Croquettes matin et soir' }),
  'automation.croquettes_du_midi': st('automation.croquettes_du_midi', 'off', { friendly_name: 'Croquettes du midi' }),
};
const CFG = { haid: 'select.distributeur_feed', haids: { reservoir: 'input_number.croquettes_reservoir', portionWeight: 'number.distributeur_portion' } };
const FIXTURE = JSON.parse(lire('tests', 'fixtures', 'distributeurs.json'));
const ETAT = () => JSON.parse(JSON.stringify(FIXTURE.contrat.etat_exemple));

function fiche({ states = ETATS, demandes = null, onglet = 'planning', etat = ETAT() } = {}) {
  const appels = [], interrupteurs = [], demandees = [];
  const portee = {
    ...PORTEE_FICHE,
    // Le filet réel, ou une table de demandes posée par le test et un `demander` qui note.
    useDemandes: demandes ? () => [demandes, (...a) => demandees.push(a)] : () => { const [ov, d] = useDemandes(); return [ov, (...a) => { demandees.push(a); d(...a); }]; },
    Bascule: (p) => { interrupteurs.push(p); return createElement(BasculeUi, p); },
    commanderService: (...a) => { appels.push(a); return Promise.resolve(); },
  };
  const Fiche = evaluer(CODE_FICHE, portee, 'FicheDistributeurContent');
  const html = renderToStaticMarkup(createElement(Fiche, { hass: { states, user: { is_admin: true } }, index: { entityMeta: new Map(), deviceMeta: new Map() },
    cfg: CFG, etat, ongletDepart: onglet, maintenant: Date.parse('2026-10-05T08:00:00Z') }));
  return { html, appels, interrupteurs, demandees };
}
const switches = (html) => [...html.matchAll(/<button type="button" role="switch" aria-checked="(true|false)" aria-label="([^"]*)"/g)].map(m => [m[2], m[1] === 'true']);
const MATIN = 'automation.croquettes_matin_et_soir', MIDI = 'automation.croquettes_du_midi';

test('la fiche liste chaque automatisation qui distribue : nom, heures, et son interrupteur', () => {
  const { html } = fiche();
  assert.ok(html.includes('Vos automatisations'), 'l’en-tête de la liste');
  for (const t of ['Croquettes matin et soir', '07:30 · 19:00', 'Croquettes du midi', '12:30']) assert.ok(html.includes(t), t);
  assert.deepEqual(switches(html), [['Croquettes matin et soir', true], ['Croquettes du midi', false]],
    'un interrupteur par automatisation dont l’entité existe, qui dit son état et la nomme');
  // Une automatisation tombée : pas d'interrupteur qui ne ferait rien.
  const tombee = fiche({ states: { ...ETATS, [MIDI]: st(MIDI, 'unavailable') } }).html;
  assert.deepEqual(switches(tombee), [['Croquettes matin et soir', true]]);
  assert.ok(tombee.includes('Indisponible'), 'une entité tombée se dit');
  assert.match(html, /role="switch" aria-checked="true"[^>]*background:var\(--o-accent-fond\)/, 'actif = bleu plein');
  // La coquille n'a plus de liste de repas à elle : l'ancienne liste n'est plus un planning.
  assert.ok(!APP.includes('function prochaineRation(') && !APP.includes('croqMeals'), 'App.jsx lit encore l’ancienne liste comme un planning');
});

test('basculer une automatisation commande SON entité, et pose la demande', () => {
  const { interrupteurs, appels, demandees } = fiche();
  interrupteurs[0].cb();
  interrupteurs[1].cb();
  assert.deepEqual(appels.map(a => a.slice(1)), [
    [MATIN, 'homeassistant', 'turn_off', { entity_id: MATIN }],
    [MIDI, 'homeassistant', 'turn_on', { entity_id: MIDI }],
  ], '`homeassistant.turn_on/off`, comme avant : le service du domaine `automation` échoue sur un input_boolean associé');
  assert.deepEqual(demandees, [
    [MATIN, false, ETATS[MATIN], true],
    [MIDI, true, ETATS[MIDI], false],
  ], 'une demande par automatisation, avec l’état de son entité au moment de l’appui');
});

test('l’interrupteur montre tout de suite ce qu’on a demandé, puis la réponse de HA', () => {
  const demandes = { [MATIN]: demandeCle(false, ETATS[MATIN], undefined, true) };
  // En vol : HA n'a pas encore répondu, la ligne montre la demande.
  assert.deepEqual(switches(fiche({ demandes }).html)[0], ['Croquettes matin et soir', false], 'l’appui ne se voit pas avant la réponse');
  // HA répond (son last_changed bouge) : c'est lui qui a raison, même s'il a refusé.
  const refus = { ...ETATS, [MATIN]: st(MATIN, 'on', {}, '2026-10-04T06:00:01.000Z') };
  assert.deepEqual(switches(fiche({ states: refus, demandes }).html)[0], ['Croquettes matin et soir', true], 'un refus de HA resterait masqué');
  // La réponse d'une AUTRE automatisation ne jette pas cette demande.
  const autre = { ...ETATS, [MIDI]: st(MIDI, 'on', {}, '2026-10-04T06:00:01.000Z') };
  assert.deepEqual(switches(fiche({ states: autre, demandes }).html), [['Croquettes matin et soir', false], ['Croquettes du midi', true]],
    'la réponse du midi a rendu au matin son état d’avant');
});

/* Relecture du 04/10, toujours vraie le 05/10. L'estimation du bac divisait
 * par TOUS les repas : coupés depuis cette même fiche, ils comptaient encore —
 * « Environ 8 jours de réserve » au-dessus de « 0 actifs ». */
test('les jours de réserve ne comptent que les repas allumés, et suivent l’interrupteur', () => {
  // 760 g ; matin et soir (45 g chacun) allumés, le midi coupé : 90 g par jour.
  assert.ok(fiche({ onglet: 'accueil' }).html.includes('Environ 8 jours de réserve'), 'un repas coupé pèse dans la réserve : 760 g et deux repas de 45 g font 8 jours');
  // Le midi rallumé (HA a répondu) : il compte, cinq jours sur sept.
  const midi = fiche({ onglet: 'accueil', states: { ...ETATS, [MIDI]: st(MIDI, 'on', {}, '2026-10-04T06:00:01.000Z') } }).html;
  assert.ok(!midi.includes('Environ 8 jours de réserve') && midi.includes('jours de réserve'), 'un repas rallumé ne pèse pas');
  // Matin et soir coupé à l'instant, HA n'a pas répondu : plus aucun repas qui pèse.
  const demandes = { [MATIN]: demandeCle(false, ETATS[MATIN], undefined, true) };
  const html = fiche({ onglet: 'accueil', demandes }).html;
  assert.ok(html.includes('Ce qu’il reste dans le bac') && !html.includes('jours de réserve'), 'l’estimation ne suit pas l’interrupteur');
  // La fabrique ne divise pas : elle passe le bac, la fiche divise.
  assert.ok(!APP.includes('joursDeReserve('), 'la fabrique divise encore par tous les repas');
});

test('la coquille : la feuille à onglets, l’abonnement aux sœurs ET aux automatisations, l’épingle d’une entité', () => {
  const f = morceau('function FicheDistributeur(', '\n}\n');
  assert.ok(f.includes('<BottomSheet onClose={onClose} onglets>'), 'une feuille à onglets, à hauteur fixe');
  assert.ok(f.includes('const hassLive = useHass([...croqKeys(), ...lu.soeurs.map(x => x.id), ...autos]);'),
    'sans cet abonnement, une bascule d’automatisation resterait figée (régression du 01/10)');
  assert.ok(f.includes('<FicheDistributeurContent hass={H} etat={etat} erreur={erreur} cfg={conf} onFiche={setFiche} onEtat={poserEtatDistributeur}'), 'le contenu reçoit l’état du serveur et le rend au cache après une écriture');
  assert.ok(f.includes('epingle={ficheId ? <BoutonEpingle id={ficheId} /> : null}'), 'l’épingle est celle d’une ENTITÉ');
  assert.ok(APP.includes('{feederPop && <FicheDistributeur hass={hass} onClose={() => setFeederPop(false)} />}'), 'la fabrique ouvre la coquille, sans rien lui calculer');
});

/* Contradicteur du 05/10 (ADR 0155). La CARTE n'était épinglée que par du
 * texte : on exécute ici la vraie fabrique `distributeur()` d'App.jsx, avec les
 * vrais lecteurs de distributeur.js, sur un appareil Zigbee2MQTT et un
 * réservoir en aide `input_number` — la maison de l'utilisateur. */
test('la carte : « Distribuer » par l’appareil, le liseré, « Rempli », le prochain repas et un compteur remis à zéro', async () => {
  const D = await import(new URL('../src/distributeur.js', import.meta.url));
  const { locale } = await import(new URL('../src/i18n.js', import.meta.url));
  const FEED = 'select.distributeur_feed', NET = 'binary_sensor.distributeur_online', RES = 'input_number.croquettes_reservoir', CPT = 'sensor.croquettes_du_jour';
  const index = { entityMeta: new Map([
    [FEED, { deviceId: 'dev1', platform: 'mqtt' }],
    [NET, { deviceId: 'dev1', platform: 'mqtt' }],
    [CPT, { deviceId: 'dev1', platform: 'mqtt' }],
  ]) };
  const aujourdhui = new Date(); aujourdhui.setHours(9, 15, 0, 0);
  const minuit = new Date(); minuit.setHours(0, 0, 5, 0);
  const vivants = {
    [FEED]: st(FEED, 'STOP', { options: ['STOP', 'START'] }),
    [NET]: st(NET, 'on', { device_class: 'connectivity' }),
    [RES]: st(RES, '760', { max: 1500, unit_of_measurement: 'g' }),
    [CPT]: st(CPT, '45', { unit_of_measurement: 'g' }, aujourdhui.toISOString()),
  };
  // Midi, heure locale : le prochain repas des automatisations allumées est 19:00.
  const midi = new Date(); midi.setHours(12, 0, 0, 0);
  const etatSrv = ETAT(); etatSrv.automatisations.forEach(a => { a.dernier = null; });
  const carte = (states, cfg = { haid: FEED, haids: { reservoir: RES, distribuees: CPT } }) => {
    const appels = [];
    const code = morceau('const heureDe = (iso) => {', '\n};\n') + morceau('  const numDe = ', '\n') + morceau('  const muet = ', '\n')
      + morceau('  const distributeur = () => {', '\n  };\n');
    const d = evaluer(code, {
      S: states, tr, locale, LOGGIA_INDEX: index, loggiaEnt: () => cfg, croqHaids: () => cfg.haids || {}, croqMax: () => 1500,
      lireDistributeur: D.lireDistributeur, niveauDuBac: D.niveauDuBac, envoiDistribuer: D.envoiDistribuer, dernierRepas: D.dernierRepas,
      prochainRepas: (e, _t, o) => D.prochainRepas(e, midi.getTime(), o), lireEtatDistributeur: () => ({ etat: etatSrv, erreur: false }),
      appel: (...a) => appels.push(a),
    }, 'distributeur()');
    return { d, appels };
  };
  // Vivant : une portion par le select de L'APPAREIL, le bac, le dernier repas du compteur.
  const { d, appels } = carte(vivants);
  assert.equal(d.mort, false, 'témoin : vivant');
  assert.equal(typeof d.feed, 'function', 'témoin : Distribuer');
  d.feed();
  assert.deepEqual(appels, [['select', 'select_option', { entity_id: FEED, option: 'START' }]], 'Distribuer = START sur le select de l’appareil');
  assert.equal(typeof d.onRempli, 'function', 'témoin : Rempli sur une aide vivante');
  assert.ok(d.sous.startsWith('Réservoir 51 % · dernier repas '), d.sous);
  // Un select feed `unknown` est son état normal sous Zigbee2MQTT : ni liseré, ni bouton perdu.
  const inconnu = carte({ ...vivants, [FEED]: st(FEED, 'unknown', { options: ['STOP', 'START'] }) }).d;
  assert.ok(inconnu.mort === false && typeof inconnu.feed === 'function', 'un select `unknown` passe pour mort');
  // La commande muette : liseré, et plus de bouton qui ne ferait rien — le réservoir est pourtant vivant.
  const muette = carte({ ...vivants, [FEED]: st(FEED, 'unavailable', { options: ['STOP', 'START'] }) }).d;
  assert.ok(muette.mort === true && muette.feed === null, 'commande muette : liseré et pas de « Distribuer »');
  // L'appareil hors ligne : pareil.
  const coupe = carte({ ...vivants, [NET]: st(NET, 'off', { device_class: 'connectivity' }) }).d;
  assert.ok(coupe.mort === true && coupe.feed === null, 'appareil hors ligne : liseré et pas de « Distribuer »');
  // Le réservoir muet : liseré, ni « Réservoir … % » ni « Rempli » — mais la vis répond, « Distribuer » reste.
  const bac = carte({ ...vivants, [RES]: st(RES, 'unavailable') }).d;
  assert.ok(bac.mort === true && typeof bac.feed === 'function' && bac.onRempli === null, 'réservoir muet');
  assert.ok(!bac.sous.includes('Réservoir'), 'un réservoir muet ne dit pas « Réservoir 0 % » : ' + bac.sous);
  // Sans réservoir (un Petlibro) : aucun pourcentage inventé.
  const sans = carte(vivants, { haid: FEED, haids: { distribuees: CPT } }).d;
  assert.ok(sans.pct === null && !sans.sous.includes('%') && sans.onRempli === null, 'sans réservoir : ' + sans.sous);
  // Le compteur du jour remis à zéro à minuit n'a rien distribué : pas de « dernier repas 00:00 »,
  // la carte dit le prochain repas, celui des automatisations allumées (le midi est coupé).
  const zero = carte({ ...vivants, [CPT]: st(CPT, '0', { unit_of_measurement: 'g' }, minuit.toISOString()) }).d;
  assert.equal(zero.dernier, null, 'un compteur à zéro donne « dernier repas » à minuit');
  assert.ok(zero.sous.endsWith('prochaine ration 19:00'), zero.sous);
  assert.equal(d.alerte, null, 'témoin : aucune anomalie active, aucune alerte');
});

/* Relecture « écran » du 05/10 : un Petlibro n'a pas de réservoir en % — rien
 * ne passait au rouge sur la carte, et « Bac presque vide » ne se lisait qu'en
 * ouvrant la fiche. La carte porte maintenant le mot de la fiche, en tête. */
test('la carte d’un Petlibro dit « Bac presque vide » en tête, comme la fiche', async () => {
  const D = await import(new URL('../src/distributeur.js', import.meta.url));
  const { locale } = await import(new URL('../src/i18n.js', import.meta.url));
  const BTN = 'button.granary_manual_feed', BAS = 'binary_sensor.granary_food_low', BLOC = 'binary_sensor.granary_food_dispenser_state';
  const index = { entityMeta: new Map([
    [BTN, { deviceId: 'dev_petlibro', platform: 'petlibro', translationKey: 'manual_feed' }],
    [BAS, { deviceId: 'dev_petlibro', platform: 'petlibro', translationKey: 'food_low' }],
    [BLOC, { deviceId: 'dev_petlibro', platform: 'petlibro', translationKey: 'food_dispenser_state' }],
  ]) };
  const cfg = { appareil: 'dev_petlibro', haid: BTN, haids: {} };
  const carte = (states) => {
    const code = morceau('const heureDe = (iso) => {', '\n};\n') + morceau('  const numDe = ', '\n') + morceau('  const muet = ', '\n')
      + morceau('  const distributeur = () => {', '\n  };\n');
    return evaluer(code, {
      S: states, tr, locale, LOGGIA_INDEX: index, loggiaEnt: () => cfg, croqHaids: () => cfg.haids, croqMax: () => 1500,
      lireDistributeur: D.lireDistributeur, niveauDuBac: D.niveauDuBac, envoiDistribuer: D.envoiDistribuer, dernierRepas: D.dernierRepas,
      prochainRepas: () => null, lireEtatDistributeur: () => ({ etat: null, erreur: false }), appel: () => {},
    }, 'distributeur()');
  };
  const vivants = { [BTN]: st(BTN, 'unknown'), [BAS]: st(BAS, 'off'), [BLOC]: st(BLOC, 'off') };
  assert.equal(carte(vivants).alerte, null, 'témoin : bac plein, rien à signaler');
  const bas = carte({ ...vivants, [BAS]: st(BAS, 'on') });
  assert.equal(bas.pct, null, 'un Petlibro n’a pas de réservoir en % : rien ne passait au rouge');
  assert.equal(bas.alerte, 'Bac presque vide');
  assert.ok(bas.sous.startsWith('Bac presque vide'), bas.sous);
  assert.equal(typeof bas.feed, 'function', 'un bac presque vide distribue encore : « Distribuer » reste');
  assert.equal(carte({ ...vivants, [BLOC]: st(BLOC, 'on') }).alerte, 'Distribution bloquée');
  // Le mot vient de la LECTURE de l'appareil (`lireDistributeur(…).alerte`), le même que la fiche.
  assert.equal(bas.alerte, D.lireDistributeur(index, { ...vivants, [BAS]: st(BAS, 'on') }, cfg).alerte.mot);
});

/* Relecture du 04/10. Sept mots n'étaient lus que par la vue partie ; ils
 * restaient traduits six fois. `tout_tr_traduit` ne pouvait pas les voir :
 * il cherche la clé comme SOUS-CHAÎNE, et chacun vit dans un texte plus long
 * (« Aucun repas programmé », « Baisser la consigne », `prochaineRation`…).
 * Ici on cherche la clé ENTRE GUILLEMETS, comme un appel ou une table l'écrit. */
test('les mots de la vue partie ont quitté les six catalogues, ceux qui servent encore y restent', async () => {
  const sources = (d) => readdirSync(d, { withFileTypes: true }).flatMap(f => f.isDirectory()
    ? (f.name === 'langues' ? [] : sources(join(d, f.name)))
    : /\.(js|jsx)$/.test(f.name) ? [readFileSync(join(d, f.name), 'utf8')] : []);
  const SRC = sources(join(RACINE, 'src')).join('\n');
  const cite = (k) => ["'" + k + "'", '"' + k + '"', '`' + k + '`'].some(q => SRC.includes(q));
  const cats = {};
  for (const l of ['en', 'de', 'nl', 'it', 'es', 'pl']) cats[l] = (await import(new URL('../src/langues/' + l + '.js', import.meta.url))).default;
  // 05/10 (ADR 0155) : « dans {h} h {m} » et « dans {n} min » partent avec `repasIn`, que rien n'affichait.
  for (const k of ['passé', 'distribué', 'désactivé', 'programmé', 'hors programme', 'Ration', 'Baisser', 'dans {h} h {m}', 'dans {n} min']) {
    assert.ok(!cite(k), '« ' + k + ' » est de nouveau appelé : sa clé doit revenir aux catalogues');
    for (const [l, c] of Object.entries(cats)) assert.ok(!Object.hasOwn(c, k), '« ' + k + ' » reste dans ' + l + '.js, et plus rien ne l’appelle');
  }
  for (const k of ['Monter']) {
    assert.ok(cite(k), '« ' + k + ' » n’est plus appelé : à retirer aussi');
    for (const [l, c] of Object.entries(cats)) assert.ok(Object.hasOwn(c, k), '« ' + k + ' » a quitté ' + l + '.js alors qu’on l’appelle encore');
  }
});
