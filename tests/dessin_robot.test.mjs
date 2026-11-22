/* TEST AJOUTÉ (22/11, ADR 0389) — le dessin d'un robot dans sa fiche : « pour les robots j'aimerais bien retrouver comme sur
 * Home Assistant le dessin de l'appareil en question animé en activité ».
 *
 * Ce qui compte :
 *  - le dessin suit la PHASE de la fiche (celle de la carte, l'avance d'un geste comprise) : au travail il s'anime, en pause il
 *    se fige au gris, au retour sa base paraît et des chevrons l'y mènent, sur la base il y est posé, en erreur il est de travers
 *    au rouge, muet il s'efface ;
 *  - rien ne prétend ce que l'appareil ne publie pas (règle 46 du guide) : le témoin de charge seulement si sa sœur
 *    `battery_charging` dit qu'il charge, les ondes de « Localiser » pour l'aspirateur seul ;
 *  - il vit dans le panneau de tête de l'Accueil, entre l'état et « Où », sans toucher aux onglets ni à la hauteur fixe de la
 *    feuille, et il part avec la fiche, chargée à la demande — jamais au démarrage ;
 *  - ses couleurs sont des jetons du thème ; « réduire les animations » — du système ou de l'appareil — fige tout. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { monter, horlogeFausse, documentFaux } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?dessin_robot')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?dessin_robot'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { useVueRobot };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?dessin_robot', import.meta.url).href);
const FR = await import(new URL('../src/ficherobot.jsx', import.meta.url).href);
const RE = await import('../src/robotsetat.js');
const { default: DessinRobot, etatDessinRobot } = await import('../src/dessinrobot.jsx');

const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const dessin = (p) => renderToStaticMarkup(createElement(DessinRobot, p));
const compte = (html, classe) => (html.match(new RegExp('class="[^"]*\\b' + classe + '\\b', 'g')) || []).length;
// Le bloc du dessin dans index.css : de son titre à la fin de « réduire les animations ».
const CSS = (() => {
  const t = lire('src/index.css');
  const debut = t.indexOf('/* ── Le dessin d\'un robot dans sa fiche');
  const fin = t.indexOf('html.loggia-calme .rb-dessin .rbd-brin-d');
  assert.ok(debut > 0 && fin > debut, 'le bloc du dessin dans index.css');
  return t.slice(debut, t.indexOf('\n', fin));
})();

/* ════════════ Ce que le dessin montre ════════════ */

test('la phase de la fiche devient l’état du dessin ; une phase inconnue est « à l’arrêt »', () => {
  for (const phase of ['travail', 'pause', 'retour', 'base', 'erreur', 'repos', 'absent']) {
    assert.equal(etatDessinRobot({ domaine: 'vacuum', phase }).etat, phase);
    assert.equal(etatDessinRobot({ domaine: 'lawn_mower', phase }).etat, phase);
  }
  assert.equal(etatDessinRobot({ phase: 'bizarre' }).etat, 'repos');
  assert.equal(etatDessinRobot({ domaine: 'vacuum' }).famille, 'aspirateur');
  assert.equal(etatDessinRobot({ domaine: 'lawn_mower' }).famille, 'tondeuse');
  assert.equal(etatDessinRobot().etat, 'absent', 'rien de lu : muet, comme la fiche');
});

test('l’encre est celle du mot d’état : la teinte au travail, le rouge en erreur, le gris sinon ; ce qui bouge au retour garde la teinte', () => {
  const e = (domaine, phase) => etatDessinRobot({ domaine, phase });
  assert.equal(e('vacuum', 'travail').encre, 'var(--o-accent-soft)');
  assert.equal(e('lawn_mower', 'travail').encre, 'var(--o-ok)');
  assert.equal(e('vacuum', 'erreur').encre, 'var(--o-bad)');
  for (const p of ['pause', 'retour', 'base', 'repos']) assert.equal(e('vacuum', p).encre, 'var(--o-text2)', p);
  assert.equal(e('vacuum', 'absent').encre, 'var(--o-text3)');
  assert.equal(e('lawn_mower', 'retour').accent, 'var(--o-ok)', 'les chevrons du retour, à la teinte');
  assert.equal(e('vacuum', 'pause').accent, 'var(--o-text2)', 'en pause, rien de teinté');
});

test('ce qui bouge : le travail, le retour, l’erreur ; la base seulement si elle charge ; jamais en pause ni à l’arrêt', () => {
  const anime = (phase, o = {}) => etatDessinRobot({ domaine: 'vacuum', phase, ...o }).anime;
  assert.equal(anime('travail'), true);
  assert.equal(anime('retour'), true);
  assert.equal(anime('erreur'), true);
  assert.equal(anime('pause'), false, 'figé en pause');
  assert.equal(anime('repos'), false);
  assert.equal(anime('absent'), false);
  assert.equal(anime('base'), false, 'sur la base sans charge publiée : rien ne respire');
  assert.equal(anime('base', { charge: true }), true);
});

test('règle 46 : le témoin de charge seulement si l’appareil le publie, sur sa base ; les ondes de « Localiser », l’aspirateur seul', () => {
  assert.equal(etatDessinRobot({ phase: 'base' }).charge, false);
  assert.equal(etatDessinRobot({ phase: 'base', charge: true }).charge, true);
  assert.equal(etatDessinRobot({ phase: 'travail', charge: true }).charge, false, 'hors de sa base, pas de témoin');
  assert.equal(etatDessinRobot({ phase: 'base', charge: 'on' }).charge, false, 'seulement un vrai « oui »');
  assert.equal(etatDessinRobot({ domaine: 'vacuum', phase: 'base', bipe: true }).bipe, true);
  assert.equal(etatDessinRobot({ domaine: 'lawn_mower', phase: 'base', bipe: true }).bipe, false, 'une tondeuse n’a pas de « Localiser »');
  assert.equal(etatDessinRobot({ domaine: 'vacuum', phase: 'absent', bipe: true }).bipe, false);
  // Le rendu : pas de témoin allumé ni d'ondes sans elles.
  assert.doesNotMatch(dessin({ domaine: 'vacuum', phase: 'base' }), /data-charge/);
  assert.match(dessin({ domaine: 'vacuum', phase: 'base', charge: true }), /data-charge=""/);
  assert.equal(compte(dessin({ domaine: 'vacuum', phase: 'base' }), 'rbd-onde'), 0);
  assert.equal(compte(dessin({ domaine: 'vacuum', phase: 'base', bipe: true }), 'rbd-onde'), 4);
  assert.equal(compte(dessin({ domaine: 'lawn_mower', phase: 'base', bipe: true }), 'rbd-onde'), 0);
});

/* ════════════ Ce que le dessin dessine ════════════ */

test('l’aspirateur : son sol, ses brosses, sa poussière au travail ; sa base sur la base et au retour, des chevrons au retour', () => {
  const travail = dessin({ domaine: 'vacuum', phase: 'travail' });
  assert.match(travail, /data-dessin="aspirateur"/);
  assert.match(travail, /data-etat="travail"/);
  assert.match(travail, /aria-hidden="true"/, 'décoratif : le mot d’état le dit');
  assert.equal(compte(travail, 'rbd-brosse'), 2);
  assert.ok(compte(travail, 'rbd-poussiere') >= 6, 'la poussière, devant lui');
  assert.equal(compte(travail, 'rbd-station'), 0, 'au travail, pas de base');
  const pause = dessin({ domaine: 'vacuum', phase: 'pause' });
  assert.equal(compte(pause, 'rbd-poussiere'), 0, 'en pause, il n’aspire rien');
  assert.equal(compte(pause, 'rbd-station'), 0);
  assert.equal(compte(dessin({ domaine: 'vacuum', phase: 'base' }), 'rbd-station'), 1);
  const retour = dessin({ domaine: 'vacuum', phase: 'retour' });
  assert.equal(compte(retour, 'rbd-station'), 1);
  assert.equal(compte(retour, 'rbd-chevron'), 2);
  assert.equal(compte(dessin({ domaine: 'vacuum', phase: 'repos' }), 'rbd-station'), 0, 'à l’arrêt hors de sa base : seul');
  const erreur = dessin({ domaine: 'vacuum', phase: 'erreur' });
  assert.equal(compte(erreur, 'rbd-alerte'), 1);
  assert.equal(compte(dessin({ domaine: 'vacuum', phase: 'travail' }), 'rbd-alerte'), 0);
});

test('la tondeuse : ses roues, ses lames, ses touffes et ses brins au travail ; sa borne devant elle, la plaque sur la base seulement', () => {
  const travail = dessin({ domaine: 'lawn_mower', phase: 'travail' });
  assert.match(travail, /data-dessin="tondeuse"/);
  assert.equal(compte(travail, 'rbd-crans'), 2, 'deux grandes roues');
  assert.equal(compte(travail, 'rbd-lame'), 3);
  assert.ok(compte(travail, 'rbd-touffe') >= 6);
  assert.ok(compte(travail, 'rbd-brin-coupe') >= 4);
  assert.equal(compte(travail, 'rbd-brosse'), 0, 'pas de brosses à une tondeuse');
  const pause = dessin({ domaine: 'lawn_mower', phase: 'pause' });
  assert.equal(compte(pause, 'rbd-touffe') + compte(pause, 'rbd-brin-coupe'), 0, 'en pause, elle ne coupe rien');
  const base = dessin({ domaine: 'lawn_mower', phase: 'base' });
  assert.equal(compte(base, 'rbd-station'), 1);
  assert.equal(compte(base, 'rbd-plaque'), 1);
  const retour = dessin({ domaine: 'lawn_mower', phase: 'retour' });
  assert.equal(compte(retour, 'rbd-plaque'), 0, 'au retour, la borne seule, en pointillé');
  assert.equal(compte(retour, 'rbd-chevron'), 2);
});

test('deux fiches ouvertes ne partagent pas la découpe de leur disque', () => {
  const html = renderToStaticMarkup(createElement('div', null, createElement(DessinRobot, { domaine: 'vacuum', phase: 'base' }), createElement(DessinRobot, { domaine: 'lawn_mower', phase: 'base' })));
  const ids = [...html.matchAll(/<clipPath id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
  for (const id of ids) assert.ok(html.includes('url(#' + id + ')'));
});

/* ════════════ Les couleurs et le mouvement ════════════ */

test('les couleurs sont des jetons du thème : rien d’écrit en dur dans le dessin ni dans ses styles', () => {
  const src = sansCommentaires(lire('src/dessinrobot.jsx'));
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  assert.doesNotMatch(sansCommentaires(CSS), /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|color-mix/, 'des opacités, pas de couleur écrite ni de color-mix');
  for (const v of sansCommentaires(CSS).match(/var\(--[\w-]+\)/g)) assert.match(v, /^var\(--(o|rbd)-[\w-]+\)$/, v);
  // La coque est au fond opaque du thème : le sol passe dessous sans se voir à travers.
  assert.match(CSS, /\.rbd-coque \{ fill: var\(--o-well\); stroke: none; \}/);
});

test('« réduire les animations » fige tout — celui du système comme celui de l’appareil — et la scène reste lisible', () => {
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\) \{\n  \.rb-dessin, \.rb-dessin \* \{ animation: none !important; transition: none !important; \}/);
  assert.match(CSS, /html\.loggia-calme \.rb-dessin, html\.loggia-calme \.rb-dessin \* \{ animation: none !important; transition: none !important; \}/);
  // Figée, la poussière se pose devant lui et les brins de part et d'autre, au lieu de disparaître.
  assert.match(CSS, /html\.loggia-calme \.rb-dessin :is\(\.rbd-poussiere, \.rbd-touffe\) \{ transform: translateY\(30px\); \}/);
  assert.match(CSS, /html\.loggia-calme \.rb-dessin \.rbd-brin-g \{ opacity: 1;/);
});

test('la poussière et les touffes s’éteignent en fin de course : celles qui passent à côté de la coque ne sautent pas', () => {
  const k = /@keyframes rbd-approche \{(.*)\}\n/.exec(CSS);
  assert.ok(k, 'la course de la poussière');
  assert.match(k[1], /85% \{ opacity: 1; \} 100% \{ transform: translateY\(80px\); opacity: 0; \}/);
});

test('chaque animation est tenue par son état : rien ne bouge en pause, à l’arrêt ni muet', () => {
  // Une règle par ligne : une règle d'animation écrite sur plusieurs lignes échapperait au contrôle.
  assert.doesNotMatch(sansCommentaires(CSS), /\{\s*\n[^}]*animation: (?!none)/, 'une animation écrite sur plusieurs lignes');
  const regles = sansCommentaires(CSS).split('\n').filter(l => /animation:/.test(l) && !/animation: none/.test(l));
  assert.ok(regles.length >= 12);
  for (const l of regles) {
    // Le témoin seul respire sur une base qui charge ; les ondes ne se dessinent qu'avec « Il bipe ».
    assert.ok(/data-etat="(travail|retour|erreur)"|\[data-charge\] \.rbd-temoin \{|^\.rbd-onde \{/.test(l), 'une animation hors de son état : ' + l);
    assert.doesNotMatch(l, /data-etat="(pause|repos|absent|base)"/, l);
  }
});

/* ════════════ Sa place dans la fiche ════════════ */

const T = new Date(2026, 10, 22, 10, 0).getTime();
const ASP = 'vacuum.aspirateur', TOND = 'lawn_mower.tondeuse', CHARGE = 'binary_sensor.tondeuse_charge';
const st = (id, state, attributes = {}) => ({ entity_id: id, state, last_changed: new Date(T - 600000).toISOString(), last_updated: new Date(T - 600000).toISOString(), attributes });
const META = new Map([
  [ASP, { deviceId: 'd1', device: 'Aspirateur', platform: 'ecovacs' }],
  [TOND, { deviceId: 'd2', device: 'Tondeuse', platform: 'mammotion' }],
  [CHARGE, { deviceId: 'd2', device: 'Tondeuse', platform: 'mammotion' }],
]);
function poser(etats) {
  setLoggiaState({ index: { entityMeta: META, deviceMeta: new Map(), areaList: [], areaNameOf: () => null, services: null }, ent: {}, cfg: {}, resolved: {} });
  const serveur = { callWS: (msg) => (msg.type === 'loggia/robots/etat' ? Promise.reject({ code: 'unknown_command', message: 'Unknown command.' }) : new Promise(() => {})) };
  RE.reglerRobotsEtat({ hass: serveur, signaler: () => {} });
  return () => ({ ...serveur, states: JSON.parse(JSON.stringify(etats)), callApi: () => Promise.resolve([]), callService: () => Promise.resolve() });
}
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  const vraiNow = Date.now;
  h.installer(); d.installer();
  globalThis.document.documentElement = { classList: { contains: () => false } };
  Date.now = () => T;
  try { return await fn(); } finally { Date.now = vraiNow; h.restaurer(); d.restaurer(); setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const attendre = () => new Promise(r => setImmediate(r));
// L'Accueil de la fiche, sur la vue de sa carte — comme tests/fiche_robot_onglets.test.mjs —, et le dessin qu'il porte.
async function dessinDeLAccueil(hass, id) {
  const vue = monter((p) => F.useVueRobot(p.hass, p.id, null, true, { rapide: true }), { hass: hass(), id });
  await attendre();
  vue.rendre();
  const m = monter(FR.default, { hass: hass(), idRobot: id, domaine: id.split('.')[0], vue: vue.arbre, plaque: null, sousNom: null, epingle: null, onFiche: () => {} });
  await attendre();
  m.rendre();
  const accueil = m.trouver(e => e.type && e.type.name === 'OngletAccueil')[0];
  assert.ok(accueil, 'l’Accueil de la fiche');
  const a = monter(accueil.type, accueil.props);
  const d = a.trouver(e => e.type && e.type.name === 'DessinRobot');
  assert.equal(d.length, 1, 'un dessin dans l’Accueil');
  return d[0].props;
}

test('l’Accueil porte le dessin, à la phase de la vue : l’aspirateur sur sa base, puis au travail ; muet, il reste, effacé', () => dans(async () => {
  assert.deepEqual(await dessinDeLAccueil(poser({ [ASP]: st(ASP, 'docked', { battery_level: 92, supported_features: 8828 }) }), ASP),
    { domaine: 'vacuum', phase: 'base', charge: false, bipe: false });
  assert.equal((await dessinDeLAccueil(poser({ [ASP]: st(ASP, 'cleaning', { battery_level: 80, supported_features: 8828 }) }), ASP)).phase, 'travail');
  assert.equal((await dessinDeLAccueil(poser({ [ASP]: st(ASP, 'unavailable') }), ASP)).phase, 'absent');
}));

test('la tondeuse sur sa base : le témoin s’allume quand sa sœur `battery_charging` dit qu’elle charge, pas avant', () => dans(async () => {
  const tond = (charge) => ({ [TOND]: st(TOND, 'docked', { battery_level: 64, supported_features: 7 }), [CHARGE]: st(CHARGE, charge, { device_class: 'battery_charging' }) });
  assert.deepEqual(await dessinDeLAccueil(poser(tond('on')), TOND), { domaine: 'lawn_mower', phase: 'base', charge: true, bipe: false });
  assert.equal((await dessinDeLAccueil(poser(tond('off')), TOND)).charge, false);
}));

test('le dessin se pose dans le panneau de tête, entre l’état et « Où » ; les onglets et la feuille à hauteur fixe ne changent pas', () => {
  const fiche = lire('src/ficherobot.jsx');
  assert.ok(fiche.includes("import DessinRobot from './dessinrobot.jsx';"));
  const accueil = fiche.slice(fiche.indexOf('function OngletAccueil('), fiche.indexOf('/* Une zone choisie'));
  const tete = accueil.indexOf("className={'rb-a-hero'"), ici = accueil.indexOf('<DessinRobot '), ou = accueil.indexOf("{tr('Où')}");
  assert.ok(tete > 0 && ici > tete && ou > ici, 'dans le panneau de tête, avant « Où »');
  assert.match(accueil, /<DessinRobot domaine=\{vue\.domaine\} phase=\{vue\.phase\} charge=\{!!vue\.charge\} bipe=\{!!vue\.bipe\} \/>/);
  assert.equal((fiche.match(/<DessinRobot /g) || []).length, 1, 'l’Accueil seul : ni le Planning, ni l’Historique, ni l’Entretien');
  // La feuille des robots reste une feuille à onglets, à hauteur fixe.
  assert.match(lire('src/appareils/fiches.jsx'), /function FicheRobot\(\{ id, hass, onClose \}\) \{[\s\S]*?<BottomSheet onClose=\{onClose\} onglets>/);
  assert.match(lire('src/index.css'), /\.o-sheet-onglets \{ height: min\(760px, 88vh\); \}/);
});

test('le dessin part avec la fiche, chargée à la demande : le démarrage ne l’importe pas', () => {
  for (const f of ['src/App.jsx', 'src/main.jsx', 'src/appareils/fiches.jsx', 'src/cartes/robot.jsx']) assert.doesNotMatch(lire(f), /dessinrobot/, f);
  assert.match(lire('src/appareils/fiches.jsx'), /import\('\.\.\/ficherobot\.jsx'\)/);
});
