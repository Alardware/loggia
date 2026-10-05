// ─────────────────────────────────────────────────────────────────────────────
// La fiche du distributeur, finitions de l'intégration (ADR 0155, 05/10).
//
// Ce que la relecture de l'intégration a trouvé après les dix tranches, et
// que rien ne tenait :
//  - la CARTE prenait l'heure où le compteur du jour était TOMBÉ pour son
//    « dernier repas » : `unavailable` donne `null`, qui passait le `!== 0`.
//    Vu dans `?demo&distributeur=horsligne` : « dernier repas 12:01 » sur la
//    carte, « Dernier repas Auj. 07:30 » dans la fiche ;
//  - deux refus du serveur (`trop_de_repas`, `ajout_refuse`) n'avaient pas
//    de phrase : la fiche affichait « le composant l'a refusé : ajout de repas
//    refuse : source », en français sans accents, dans les sept langues ;
//  - la taille de la portion se réglait sur l'Accueil par un compte ordinaire
//    et se lisait seulement dans Réglages ; « Remplacé » lui était masqué.
//    Ce sont des commandes de l'APPAREIL, qu'un compte Home Assistant
//    ordinaire peut appeler : l'ADR 0144 ne masque que ce qu'il ne pourra
//    jamais ENREGISTRER — ici, le planning de Loggia et « Associer » ;
//  - la coquille doit suivre en direct les automatisations reconnues, même
//    quand la réponse du serveur les fait connaître APRÈS l'ouverture.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';

// La langue AVANT les imports : i18n et les dates la lisent au chargement.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('src', 'App.jsx');

const { tr, locale } = await import(new URL('../src/i18n.js', import.meta.url));
const D = await import(new URL('../src/distributeur.js', import.meta.url));
const { buildIndex } = await import(new URL('../src/discovery.js', import.meta.url));
const { maisonDistributeurDemo } = await import(new URL('../src/demo.js', import.meta.url));
const { texteRefus, raisonEchec } = await import(new URL('../src/refus.js', import.meta.url));
const Fiche = (await import(new URL('../src/fichedistributeur.jsx', import.meta.url).href)).default;

/** Un morceau d'App.jsx, de `debut` jusqu'à `fin` compris. */
function morceau(debut, fin, dans = APP) {
  const d = dans.indexOf(debut);
  assert.ok(d >= 0, '« ' + debut + ' » introuvable');
  const f = dans.indexOf(fin, d);
  assert.ok(f >= 0, '« ' + fin.trim() + ' » introuvable après « ' + debut + ' »');
  return dans.slice(d, f + fin.length);
}
/** Ce morceau, compilé puis exécuté ; `portee` lui donne ce qu'il lit autour de lui. */
function evaluer(code, portee, rendu) {
  const js = transformSync(code, { loader: 'jsx', jsx: 'transform', jsxFactory: '__h', jsxFragment: '__Frag' }).code;
  const noms = Object.keys(portee);
  return new Function('__h', '__Frag', ...noms, js + '\nreturn ' + rendu + ';')(createElement, Fragment, ...noms.map(n => portee[n]));
}

/* La VRAIE fabrique `distributeur()` d'App.jsx, avec les vrais lecteurs de
 * distributeur.js, sur une maison donnée. */
function carte({ states, index, cfg, etat }) {
  const code = morceau('const heureDe = (iso) => {', '\n};\n') + morceau('  const numDe = ', '\n') + morceau('  const muet = ', '\n')
    + morceau('  const distributeur = () => {', '\n  };\n');
  return evaluer(code, {
    S: states, tr, locale, LOGGIA_INDEX: index, loggiaEnt: () => cfg, croqHaids: () => cfg.haids || {}, croqMax: () => 1500,
    lireDistributeur: D.lireDistributeur, niveauDuBac: D.niveauDuBac, envoiDistribuer: D.envoiDistribuer, dernierRepas: D.dernierRepas,
    prochainRepas: D.prochainRepas, lireEtatDistributeur: () => ({ etat, erreur: false }), appel: () => {},
  }, 'distributeur()');
}
const heureCarte = (iso) => evaluer(morceau('const heureDe = (iso) => {', '\n};\n'), { locale }, 'heureDe')(iso);

/* ════════════ 1. Le « dernier repas » de la carte ════════════ */

test('la carte : un compteur qui ne dit rien ne donne pas « dernier repas » à l’heure où il est tombé (démo horsligne)', () => {
  const m = maisonDistributeurDemo('horsligne');
  const index = buildIndex({ ...m.index, states: m.states });
  const etat = m.etat();
  const cpt = m.feeder.haids.distribuees;
  assert.equal(m.states[cpt].state, 'unavailable', 'témoin : la variante horsligne a son compteur muet');
  const d = carte({ states: m.states, index, cfg: m.feeder, etat });
  assert.notEqual(d.dernier, heureCarte(m.states[cpt].last_changed),
    'la carte prend l’heure où le compteur est tombé pour le dernier repas : ' + d.sous);
  // La carte dit ce que dit la fiche : le dernier repas que l'appareil ou les automatisations connaissent.
  const lu = D.lireDistributeur(index, m.states, m.feeder);
  const dr = D.dernierRepas(lu, m.states, etat);
  assert.equal(d.dernier, dr ? heureCarte(new Date(dr.t).toISOString()) : null, 'la carte et la fiche ne disent plus deux heures');
  assert.equal(d.mort, true, 'témoin : hors ligne, le liseré');
});

test('la carte : `unknown` et `unavailable` ne sont pas des repas ; un compteur qui compte, si', () => {
  const FEED = 'select.distributeur_feed', CPT = 'sensor.croquettes_du_jour';
  const index = { entityMeta: new Map([[FEED, { deviceId: 'dev1', platform: 'mqtt' }], [CPT, { deviceId: 'dev1', platform: 'mqtt' }]]) };
  const tombe = new Date(); tombe.setHours(12, 1, 0, 0);
  const st = (id, state, attributes = {}) => ({ entity_id: id, state, last_changed: tombe.toISOString(), attributes });
  const cfg = { haid: FEED, haids: { distribuees: CPT } };
  const etat = JSON.parse(lire('tests', 'fixtures', 'distributeurs.json')).contrat.etat_exemple;
  etat.automatisations.forEach(a => { a.dernier = null; });
  const avec = (v) => carte({ states: { [FEED]: st(FEED, 'STOP', { options: ['STOP', 'START'] }), [CPT]: st(CPT, v, { unit_of_measurement: 'g' }) }, index, cfg, etat });
  assert.equal(avec('45').dernier, heureCarte(tombe.toISOString()), 'témoin : 45 g distribués, le dernier repas est l’heure du compteur');
  for (const muet of ['unavailable', 'unknown', '']) {
    const d = avec(muet);
    assert.equal(d.dernier, null, '« ' + muet + ' » : « dernier repas » à l’heure de la chute (' + d.sous + ')');
    assert.ok(!d.sous.includes('dernier repas'), d.sous);
  }
});

/* ════════════ 2. Les refus du planning de Loggia ════════════ */

test('les deux refus du planning de Loggia se disent dans la langue de l’écran', () => {
  const refus = (code, message) => ({ code, message });
  // `RefusNomme("trop_de_repas", "trop de repas, au plus", MAX_REPAS)` : la limite après les deux-points.
  assert.equal(texteRefus(refus('trop_de_repas', 'trop de repas, au plus : 12')), 'Planning non enregistré — 12 repas au plus');
  assert.equal(raisonEchec(refus('trop_de_repas', 'trop de repas, au plus : 12')), 'Planning non enregistré — 12 repas au plus');
  // `RefusNomme("ajout_refuse", "ajout de repas refuse", refus)` : la RAISON après les deux-points.
  assert.equal(raisonEchec(refus('ajout_refuse', 'ajout de repas refuse : commande')),
    'Repas non ajouté — Loggia ne sait pas commander ce distributeur');
  assert.equal(raisonEchec(refus('ajout_refuse', 'ajout de repas refuse : source')),
    'Repas non ajouté — l’appareil ou vos automatisations programment déjà les repas');
  // Les deux raisons sont celles du serveur, mot pour mot.
  const py = lire('custom_components', 'loggia', 'distributeurs.py');
  assert.match(py, /^REFUS_SOURCE = "source"$/m);
  assert.match(py, /^REFUS_COMMANDE = "commande"$/m);
  assert.ok(py.includes('raise RefusNomme("ajout_refuse", "ajout de repas refuse", refus)'), 'la raison n’est plus ce qui suit les deux-points');
  // La fiche passe ses refus par cette table, pas par le motif brut.
  assert.ok(lire('src', 'fichedistributeur.jsx').includes('estRefus(e) ? raisonEchec(e)'), 'la fiche affiche de nouveau le motif du serveur');
});

/* ════════════ 3. Ce qu'un compte ordinaire commande ════════════ */

const QUAND = '2026-10-05T06:00:00Z';
const MAINTENANT = Date.parse('2026-10-05T08:00:00Z');
const stF = (id, state, attributes = {}) => ({ entity_id: id, state, last_changed: QUAND, last_updated: QUAND, attributes });
function maison(admin, ents, etats) {
  const entityMeta = new Map(ents.map(([id, platform, cle]) => [id, { deviceId: 'dev1', platform, translationKey: cle, device: 'Distributeur cuisine' }]));
  const deviceMeta = new Map([['dev1', { id: 'dev1', name: 'Distributeur cuisine', manufacturer: 'Aqara', model: 'ZNCWWSQ01LM' }]]);
  return { index: { entityMeta, deviceMeta }, hass: { states: Object.fromEntries(etats.map(s => [s.entity_id, s])), user: { is_admin: admin }, callService: () => { throw new Error('rien ne doit partir'); } } };
}
const AQARA = (admin) => maison(admin,
  [['select.distributeur_feed', 'mqtt', null], ['number.distributeur_portion', 'mqtt', null]],
  [stF('select.distributeur_feed', 'STOP', { friendly_name: 'Distribuer', options: ['STOP', 'START'] }),
    stF('number.distributeur_portion', '45', { friendly_name: 'Portion', min: 5, max: 100, step: 5, unit_of_measurement: 'g' })]);
const PETLIBRO = (admin) => maison(admin,
  [['button.granary_manual_feed', 'petlibro', 'manual_feed'], ['sensor.granary_remaining_desiccant', 'petlibro', 'remaining_desiccant'], ['button.granary_desiccant_reset', 'petlibro', 'desiccant_reset']],
  [stF('button.granary_manual_feed', 'unknown'), stF('sensor.granary_remaining_desiccant', '12', { unit_of_measurement: 'd' }), stF('button.granary_desiccant_reset', 'unknown')]);
const ETAT_LOGGIA = () => {
  const etat = JSON.parse(lire('tests', 'fixtures', 'distributeurs.json')).contrat.etat_exemple;
  etat.automatisations = [];
  etat.sources.automatisations = { presente: false, active: false };
  etat.peutPlanifier = true;
  etat.planning = { appareil: 'dev1', repas: [{ id: 'r1', heure: '08:00', jours: [0, 1, 2, 3, 4, 5, 6], portions: 1, actif: true }] };
  return etat;
};
const rendre = (m, cfg, ongletDepart, etat = ETAT_LOGGIA()) => renderToStaticMarkup(createElement(Fiche, { hass: m.hass, index: m.index, cfg, etat, maintenant: MAINTENANT, ongletDepart }));
const CFG_AQARA = { haids: { portionWeight: 'number.distributeur_portion' }, haid: 'select.distributeur_feed' };
// Le pas à pas de la portion : « Moins », la valeur, « Plus ».
// Il se nomme par ce qu'il règle (« Taille de la portion : Moins », 05/10).
const regle = (html) => /aria-label="[^"]*Moins"/.test(html) && /aria-label="[^"]*Plus"/.test(html) && html.includes('45 g');

test('un compte ordinaire règle la portion dans Réglages comme sur l’Accueil, et « Remplacé » est à lui aussi', () => {
  const ordinaire = AQARA(false);
  assert.ok(regle(rendre(ordinaire, CFG_AQARA, 'accueil')), 'témoin : l’Accueil laisse régler la portion à un compte ordinaire');
  assert.ok(regle(rendre(ordinaire, CFG_AQARA, 'reglages')), 'Réglages ne montre plus qu’en lecture ce que l’Accueil laisse régler');
  assert.ok(regle(rendre(AQARA(true), CFG_AQARA, 'reglages')), 'témoin : l’administrateur la règle');
  // « Remplacé » : un `button.press` de l'appareil, comme « Distribuer ».
  const ent = rendre(PETLIBRO(false), { appareil: 'dev1' }, 'entretien');
  assert.ok(ent.includes('12 jours restants') && ent.includes('Remplacé'), 'un compte ordinaire ne remet plus le consommable à neuf');
});

test('ce qu’un compte ordinaire ne peut pas ENREGISTRER reste masqué : le planning de Loggia, « Associer »', () => {
  const ord = rendre(AQARA(false), CFG_AQARA, 'planning');
  assert.ok(ord.includes('>08:00<'), 'le repas se lit');
  for (const geste of ['type="time"', 'Supprimer', 'Ajouter un repas', 'role="switch"', 'Associer une automatisation']) {
    assert.ok(!ord.includes(geste), 'compte ordinaire : « ' + geste + ' » est revenu');
  }
  const adm = rendre(AQARA(true), CFG_AQARA, 'planning');
  assert.ok(adm.includes('type="time"') && adm.includes('Ajouter un repas'), 'témoin : l’administrateur règle le planning');
});

/* ════════════ 4. La coquille suit les automatisations reconnues ════════════ */

/* `useHass` d'App.jsx, joué avec des crochets factices qui respectent les
 * dépendances de l'effet : c'est le changement de la LISTE de clés (la réponse
 * du serveur arrive après l'ouverture) qui doit ré-abonner. */
function useHassJoue(hass) {
  const etat = { force: 0, deps: null, tick: null };
  const useEffect = (fn, deps) => {
    if (etat.deps && deps.length === etat.deps.length && deps.every((d, i) => d === etat.deps[i])) return;
    etat.deps = deps;
    fn();
  };
  const useHass = evaluer(morceau('function useHass(', '\n}\n'), {
    useState: () => [0, () => { etat.force++; }], useRef: (() => { const r = { current: null }; return () => r; })(), useEffect,
    getHass: () => hass, HASS_POLL_MS: 2000, wattsDe: () => null, sigHash: (s) => s.length,
    setInterval: (fn) => { etat.tick = fn; return 1; }, clearInterval: () => {}, console,
  }, 'useHass');
  return { useHass, etat };
}

test('la coquille : une automatisation reconnue APRÈS l’ouverture se suit en direct', () => {
  const AUTO = 'automation.croquettes_matin_et_soir';
  const hass = { connected: true, states: { 'select.distributeur_feed': { state: 'STOP', last_updated: 'a' }, [AUTO]: { state: 'on', last_updated: 'a' } } };
  const { useHass, etat } = useHassJoue(hass);
  // Premier rendu : la réponse du serveur n'est pas là, aucune automatisation connue.
  useHass(['select.distributeur_feed']);
  hass.states = { ...hass.states, [AUTO]: { state: 'off', last_updated: 'b' } };
  const avant = etat.force;
  etat.tick();
  assert.equal(etat.force, avant, 'témoin : une automatisation que la coquille ne connaît pas ne redessine rien');
  // La réponse arrive : la liste change, l'effet se ré-abonne, et la bascule suit.
  useHass(['select.distributeur_feed', AUTO]);
  const abonne = etat.force;
  hass.states = { ...hass.states, [AUTO]: { state: 'on', last_updated: 'c' } };
  etat.tick();
  assert.equal(etat.force, abonne + 1, 'la bascule reste figée : la coquille ne suit pas l’automatisation');
  // Et la coquille passe bien les automatisations de la réponse du serveur à `useHass`.
  const f = morceau('function FicheDistributeur(', '\n}\n');
  assert.ok(f.includes("const autos = etat && Array.isArray(etat.automatisations) ? etat.automatisations.map(a => a && a.entity_id).filter(x => typeof x === 'string') : [];"),
    'la coquille ne lit plus les automatisations de la réponse');
  assert.ok(f.includes('useHass([...croqKeys(), ...lu.soeurs.map(x => x.id), ...autos])'), 'la coquille ne s’abonne plus aux automatisations');
  assert.ok(f.includes('<FicheDistributeurContent hass={H}'), 'le contenu ne reçoit plus le hass vivant');
});

/* ════════════ 5. L'écran au téléphone, en clair, au clavier (relecture du 05/10) ════════════ */

const CSS = lire('src', 'index.css');
const COMMUNE = lire('src', 'fichecommune.jsx');
const FICHE = lire('src', 'fichedistributeur.jsx');

/* Le socle commun compilé tel quel, chaque import pris dans son vrai module,
 * sauf ce que le test remplace (`portee`) : la fonction d'un composant se
 * joue alors à la main, sans React, ses crochets doublés. */
const PORTEE_COMMUNE = {};
for (const [, noms, spec] of COMMUNE.matchAll(/^import \{([\s\S]*?)\} from '([^']+)';$/gm)) {
  const m = spec === 'react' ? await import('react') : await import(new URL('../src/' + spec.slice(2), import.meta.url).href);
  noms.split(',').map(x => x.trim()).filter(Boolean).forEach(n => { const [a, b] = n.split(/\s+as\s+/); PORTEE_COMMUNE[b || a] = m[a]; });
}
const CODE_COMMUNE = COMMUNE.replace(/^import [\s\S]*?';$/gm, '').replace(/^export (function|const) /gm, '$1 ');
const commune = (portee) => evaluer(CODE_COMMUNE, { ...PORTEE_COMMUNE, ...portee }, "{ LigneReglage, PasAPas, focaliser: typeof focaliser === 'function' ? focaliser : undefined }");
// Le premier élément de l'arbre dont les props portent `cle`.
function trouver(el, cle) {
  if (!el || typeof el !== 'object') return null;
  if (Array.isArray(el)) { for (const x of el) { const r = trouver(x, cle); if (r) return r; } return null; }
  if (el.props && el.props[cle] !== undefined) return el;
  return el.props ? trouver(el.props.children, cle) : null;
}

test('Réglages : la ligne montre tout de suite ce qu’on vient de demander, et le second appui part de là', () => {
  const appels = [], poses = [];
  // Une demande en vol : l'entité dit encore 60, on a demandé 65.
  const { LigneReglage } = commune({
    useOptimiste: (reel) => [typeof reel === 'number' ? 65 : typeof reel === 'boolean' ? !reel : 'b', (v) => poses.push(v)],
    commanderService: (...a) => { appels.push(a.slice(2)); return Promise.resolve(); },
  });
  const r = { id: 'number.portion', type: 'nombre', nom: 'Portion', valeur: 60, pas: 5, min: 5, max: 100, unite: 'g' };
  const ligne = LigneReglage({ hass: {}, r });
  const pas = trouver(ligne, 'plus');
  assert.ok(pas, 'témoin : le pas à pas');
  assert.equal(pas.props.valeur, '65 g', 'Réglages affiche encore la valeur d’avant la demande');
  pas.props.plus();
  assert.deepEqual(appels.at(-1), ['number', 'set_value', { entity_id: 'number.portion', value: 70 }], 'le second « + » repart de la valeur périmée : un appui sur deux est perdu');
  assert.deepEqual(poses, [70], 'la demande n’est pas posée sur l’état optimiste');
  // La bascule et le choix : le même filet.
  const b = trouver(LigneReglage({ hass: {}, r: { id: 'switch.verrou', type: 'bascule', nom: 'Verrou', actif: false } }), 'cb');
  assert.equal(b.props.on, true, 'la bascule ne montre pas la demande en vol');
  b.props.cb();
  assert.deepEqual(appels.at(-1), ['switch', 'turn_off', { entity_id: 'switch.verrou' }]);
  const c = trouver(LigneReglage({ hass: {}, r: { id: 'select.mode', type: 'choix', nom: 'Mode', valeur: 'a', options: ['a', 'b', 'c'] } }), 'plus');
  c.props.plus();
  assert.deepEqual(appels.at(-1), ['select', 'select_option', { entity_id: 'select.mode', option: 'c' }], 'le choix repart de l’option demandée');
  // Plus de lecture seule pour un compte ordinaire : les réglages de l'APPAREIL sont à tous (ADR 0144).
  assert.ok(!/\bordinaire\b/.test(COMMUNE.slice(COMMUNE.indexOf('export function LigneReglage('), COMMUNE.indexOf('\n}\n', COMMUNE.indexOf('export function LigneReglage(')))), 'LigneReglage propose encore de masquer une commande d’appareil');
  assert.ok(!/\bordinaire\b/.test(COMMUNE.slice(COMMUNE.indexOf('export function PageReglagesAppareil('))), 'PageReglagesAppareil aussi');
});

test('focaliser : le focus va au premier point d’arrivée qui existe, après le rendu', async () => {
  const { focaliser } = commune({});
  const vus = [];
  const avant = globalThis.document;
  globalThis.document = { getElementById: (id) => (id === 'b' || id === 'c' ? { focus: () => vus.push(id) } : null) };
  try {
    focaliser('a', 'b', 'c');
    assert.deepEqual(vus, [], 'pas avant le rendu suivant');
    await new Promise(r => setTimeout(r, 40));
    assert.deepEqual(vus, ['b'], 'le premier identifiant présent, et lui seul');
  } finally {
    if (avant === undefined) delete globalThis.document; else globalThis.document = avant;
  }
});

test('au téléphone, la mise en page cède, pas les mots : libellés, onglets, tuiles, titre, Entretien', () => {
  // Un mot composé allemand ne passe plus SOUS le pas à pas : il se coupe.
  const ligne = COMMUNE.slice(COMMUNE.indexOf('export function LigneReglage('), COMMUNE.indexOf('\n}\n', COMMUNE.indexOf('export function LigneReglage(')));
  assert.ok(/<span style=\{\{ fontSize: 14\.5, fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere', hyphens: 'auto' \}\}>\{r\.nom\}/.test(ligne), '« Fütterungsmodus » passe sous le « − » à 320 px');
  const html = renderToStaticMarkup(createElement(Fiche, { hass: AQARA(true).hass, index: AQARA(true).index, cfg: CFG_AQARA, etat: ETAT_LOGGIA(), maintenant: MAINTENANT, ongletDepart: 'accueil' }));
  assert.ok(/overflow-wrap:anywhere[^"]*">Taille de la portion</.test(html), '« Portionsgröße » passe sous le « − »');
  // Les onglets : un mot plus long que sa part (« Harmonogram ») élargit SON onglet, les autres cèdent.
  assert.ok(CSS.includes('.rb-onglets > .rb-onglet { min-width: min-content; padding-left: 0; padding-right: 0; }'), '« Harmonogram » déborde de sa pastille bleue');
  // Les tuiles : l'heure revient à la ligne au lieu de disparaître (« Heute 19… »).
  const tuile = FICHE.slice(FICHE.indexOf('{tuiles.map(t => ('), FICHE.indexOf('))}', FICHE.indexOf('{tuiles.map(t => (')));
  assert.ok(!tuile.includes("whiteSpace: 'nowrap'"), 'l’heure de la tuile est coupée par une ellipse');
  assert.ok(tuile.includes('WebkitLineClamp: 2'), 'l’origine du repas tient sur deux lignes au plus');
  // Le nom de la fiche : deux lignes, plus une ellipse sur une seule.
  const tete = COMMUNE.slice(COMMUNE.indexOf('export function EnteteFiche('), COMMUNE.indexOf('\n}\n', COMMUNE.indexOf('export function EnteteFiche(')));
  assert.ok(/<NomFeuille><div style=\{\{[^}]*WebkitLineClamp: 2/.test(tete) && !/<NomFeuille><div style=\{\{[^}]*whiteSpace: 'nowrap'/.test(tete), '« Distribute… » à 320 px hors ligne');
  // Entretien : la grille ne dépasse plus un écran de 320 px.
  assert.ok(CSS.includes('.rb-pieces { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: 14px; }'), 'le panneau d’Entretien déborde de 6 px à 320 px');
});

test('en clair et en sombre : lavis du robot, onglets, lettres des barres, horloge, bouton Distribuer', () => {
  // Le lavis `--rb-` prend les gris « sur lavis » (ADR 0063) : « CETTE SEMAINE » était à 3,41:1 en clair.
  assert.ok(CSS.includes('[style*="background: rgba(var(--rb-"], [style*="transparent 28%"]'), 'le lavis du robot et du distributeur n’est pas reconnu');
  // Les onglets non choisis : le gris de texte le plus soutenu (4,24:1 en clair avec --o-text2).
  assert.ok(COMMUNE.includes("color: actuel === id ? '#fff' : 'var(--o-text1)'"), 'onglet inactif en --o-text2');
  // Les lettres des jours sous les barres, et le nom sous « Réglages » : --o-text2 (4,16:1 en --o-text3).
  const barres = COMMUNE.slice(COMMUNE.indexOf('export function BarresSemaine('), COMMUNE.indexOf('\n}\n', COMMUNE.indexOf('export function BarresSemaine(')));
  assert.ok(!barres.includes('--o-text3'), 'les lettres des barres en --o-text3');
  const tete = COMMUNE.slice(COMMUNE.indexOf('export function EnteteFiche('), COMMUNE.indexOf('\n}\n', COMMUNE.indexOf('export function EnteteFiche(')));
  assert.ok(!tete.includes('--o-text3'), 'le nom sous « Réglages » en --o-text3');
  // L'horloge native du champ d'heure : dessinée pour le fond de la fiche.
  assert.ok(CSS.includes('.rb-fiche { color-scheme: dark; }') && CSS.includes('html.loggia-light .rb-fiche { color-scheme: light; }'), 'l’icône d’horloge est noire sur fond sombre');
  // « Distribuer » en clair : l'orange que la garde de contraste a déjà assombri, pas un brun presque noir.
  assert.ok(CSS.includes('html.loggia-light .rb-distributeur { --rb-fond: var(--o-orange); }'), 'le bouton Distribuer passe au brun presque noir en clair');
  assert.ok(!/!important/.test(CSS.slice(CSS.indexOf('/* Le distributeur (ADR 0155'), CSS.indexOf('/* ── La prise dit'))), 'pas de !important');
});

/* ════════════ 6. Contre-relecture de la finition (05/10) ════════════ */

test('« Ajouter un repas » au clavier : le focus ne tombe pas sur <body> quand le bloc change', () => {
  // Depuis l'état vide (sous le programme, ou « Aucun repas programmé »), le premier repas
  // remplace le bloc : le bouton qu'on vient d'activer est démonté. Mesuré dans la démo : BODY.
  const ajouter = FICHE.slice(FICHE.indexOf('const ajouter = () =>'), FICHE.indexOf('\n', FICHE.indexOf('const ajouter = () =>')));
  assert.ok(ajouter.includes("focaliser(idBase + '-ajouter', idBase + '-t-planning')"), '« Ajouter » ne rend pas le focus : il tombe sur <body>');
});

test('cinq onglets au téléphone (le robot) : la barre ne déborde pas en italien', () => {
  // « Panoramica Zone Programma Cronologia Manutenzione » à 320 px : 295 px dans 274.
  // Les corps se réduisent (la règle des rangées au téléphone), les mots restent entiers.
  const m = /@media \(max-width: 359px\) \{\n([\s\S]*?)\n\}/.exec(CSS);
  assert.ok(m, 'aucune règle pour la barre de cinq onglets sur un petit écran');
  assert.ok(m[1].includes('.rb-onglets:has(> .rb-onglet:nth-child(5)) { gap: 2px; padding: 4px; }'), 'la barre garde ses marges pleines');
  assert.ok(m[1].includes('.rb-onglets:has(> .rb-onglet:nth-child(5)) > .rb-onglet { font-size: 9.5px; }'), 'les mots gardent leur corps et sortent de la barre');
  assert.ok(!/!important/.test(m[1]));
});
