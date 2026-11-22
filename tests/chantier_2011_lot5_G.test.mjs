// ─────────────────────────────────────────────────────────────────────────────
// Chantier du 20/11, lot 5, lettre G (ADR 0385).
//
//  — A6 : un aspirateur dit ce que fait sa BASE (« Vide le bac », « Lave la serpillière », « Sèche la serpillière ») et ce qu'elle
//    demande (réservoir sale plein, réservoir propre à remplir, sac à vérifier, détergent), ainsi que la pièce où il est et le chemin
//    fait : « Nettoie · Cuisine · 60 % ». Tout se lit dans les entités sœurs, à leur CLÉ DE TRADUCTION — lue dans le code public de
//    Roborock, d'Ecovacs et de Dreame —, jamais à un nom.
//  — A9 : deux positions favorites dans la fiche d'un volet (« Aérer 30 % », « Ombre 60 % »), et la confirmation en deux temps avant
//    d'OUVRIR un portail ou un garage (Gladys X6) : « Confirmer ? » 4 s.
// ─────────────────────────────────────────────────────────────────────────────
process.env.TZ = 'Europe/Paris';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const B = await import('../src/robotsbase.js');
const R = { ...(await import('../src/robots.js')), ...(await import('../src/robotsfiche.js')) };
const V = await import('../src/voletsfiche.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/* Le crochet de confirmation, joué sans navigateur : `react` remplacé par un jeu de crochets minimal (un état par rang), les minuteries
 * et l'horloge par celles de `node:test`. Un « rendu » remet le rang à zéro et relit le crochet. */
const SIM = 'data:text/javascript,' + encodeURIComponent([
  'const sim = globalThis.__simReact = globalThis.__simReact || { i: 0, slots: [] };',
  'export const useState = (init) => { const k = sim.i++; if (!(k in sim.slots)) sim.slots[k] = typeof init === "function" ? init() : init;',
  '  return [sim.slots[k], (v) => { sim.slots[k] = typeof v === "function" ? v(sim.slots[k]) : v; }]; };',
  'export const useRef = (init) => { const k = sim.i++; if (!(k in sim.slots)) sim.slots[k] = { current: init }; return sim.slots[k]; };',
  'export const useEffect = () => {};',
  'export const useCallback = (f) => { sim.i++; return f; };',
].join('\n'));
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.includes('/src/confirmerouvrant.js?sim')) return next(url, ctx);",
  "  const r = await next(url.replace('?sim', ''), ctx);",
  "  return { ...r, source: String(r.source).replace(\"from 'react'\", \"from '" + SIM + "'\") };",
  '}',
].join('\n')));
const C = await import(new URL('../src/confirmerouvrant.js?sim', import.meta.url).href);
const rendre = (st) => { globalThis.__simReact.i = 0; return C.useConfirmerOuverture(st); };
const neuf = () => { globalThis.__simReact.slots = []; };

// Une sœur telle que `decrireSoeurs` la décrit : `{ cle, domaine, etat }` suffisent.
const e = (cle, etat, domaine = 'sensor') => ({ cle, domaine, etat: String(etat) });
const texte = (entrees) => { const b = B.lireBase(entrees); return { activite: b.activite && b.activite.texte, alertes: b.alertes.map(a => a.texte) }; };

/* ════════════ A6 — LA BASE ════════════ */

test('A6 — Roborock : le capteur « status » dit le bac vidé, la serpillière lavée ; le binaire de séchage la dit séchée', () => {
  assert.equal(texte([e('status', 'emptying_the_bin')]).activite, 'Vide le bac');
  assert.equal(texte([e('status', 'washing_the_mop')]).activite, 'Lave la serpillière');
  assert.equal(texte([e('status', 'going_to_wash_the_mop')]).activite, 'Va laver la serpillière');
  assert.equal(texte([e('mop_drying_status', 'on', 'binary_sensor')]).activite, 'Sèche la serpillière');
  assert.equal(texte([e('mop_drying_remaining_time', '1.5')]).activite, 'Sèche la serpillière', 'un temps de séchage restant');
  assert.equal(texte([e('q7_status', 'mop_airdrying')]).activite, 'Sèche la serpillière', 'le Q7 a son propre capteur');
});

test('A6 — Ecovacs : « station_state » ; Dreame : « state », « self_wash_base_status », « auto_empty_status »', () => {
  assert.equal(texte([e('station_state', 'emptying_dustbin')]).activite, 'Vide le bac');
  assert.equal(texte([e('station_state', 'washing_mop')]).activite, 'Lave la serpillière');
  assert.equal(texte([e('station_state', 'drying_mop')]).activite, 'Sèche la serpillière');
  assert.equal(texte([e('state', 'auto_emptying')]).activite, 'Vide le bac');
  assert.equal(texte([e('self_wash_base_status', 'drying')]).activite, 'Sèche la serpillière');
  assert.equal(texte([e('self_wash_base_status', 'clean_add_water')]).activite, 'Lave la serpillière');
  assert.equal(texte([e('auto_empty_status', 'active')]).activite, 'Vide le bac');
});

test('A6 — ce que la base ne fait pas, ou que l’appareil ne dit pas, ne s’affiche pas', () => {
  assert.deepEqual(texte([]), { activite: null, alertes: [] }, 'sans sœur : rien');
  assert.equal(texte([e('status', 'idle')]).activite, null, 'une valeur sans rapport avec la base');
  assert.equal(texte([e('status', 'unavailable'), e('station_state', 'unknown')]).activite, null);
  assert.equal(texte([e('mop_drying_status', 'off', 'binary_sensor')]).activite, null, 'un binaire éteint');
  assert.equal(texte([e('mop_drying_remaining_time', '0')]).activite, null, 'zéro heure restante');
  assert.equal(texte([e('status', 'emptying_the_bin', 'number')]).activite, null, 'un réglage n’est pas un capteur');
  assert.equal(texte([e(null, 'emptying_the_bin')]).activite, null, 'sans clé de traduction : jamais un nom');
  assert.equal(texte([{ cle: 'status', domaine: 'sensor', etat: null }]).activite, null);
  assert.deepEqual(B.lireBase(null), { activite: null, alertes: [] });
});

test('A6 — plusieurs choses à la fois : vider avant laver, laver avant sécher', () => {
  assert.equal(texte([e('status', 'washing_the_mop'), e('mop_drying_status', 'on', 'binary_sensor')]).activite, 'Lave la serpillière');
  assert.equal(texte([e('self_wash_base_status', 'drying'), e('auto_empty_status', 'active')]).activite, 'Vide le bac');
});

test('A6 — les soucis de la base : réservoirs, sac, détergent — dans l’ordre du plus pressant, sans doublon', () => {
  assert.deepEqual(texte([e('dirty_box_full', 'on', 'binary_sensor')]).alertes, ['Réservoir d’eau sale plein']);
  assert.deepEqual(texte([e('clean_box_empty', 'on', 'binary_sensor')]).alertes, ['Réservoir d’eau propre à remplir']);
  assert.deepEqual(texte([e('clean_fluid_empty', 'on', 'binary_sensor')]).alertes, ['Détergent de la base à remplir']);
  assert.deepEqual(texte([e('dock_error', 'waste_water_tank_full')]).alertes, ['Réservoir d’eau sale plein']);
  assert.deepEqual(texte([e('dock_error', 'water_empty')]).alertes, ['Réservoir d’eau propre à remplir']);
  assert.deepEqual(texte([e('dirty_water_tank_status', 'not_installed_or_full')]).alertes, ['Réservoir d’eau sale plein ou absent']);
  assert.deepEqual(texte([e('clean_water_tank_status', 'low_water')]).alertes, ['Réservoir d’eau propre à remplir']);
  assert.deepEqual(texte([e('dust_bag_status', 'check')]).alertes, ['Sac de la base à vérifier']);
  assert.deepEqual(texte([e('detergent_status', 'low_detergent')]).alertes, ['Détergent de la base à remplir']);
  // Deux capteurs qui disent la même chose font UNE ligne ; l'ordre ne suit pas celui de l'arrivée.
  assert.deepEqual(texte([e('detergent_status', 'low_detergent'), e('clean_box_empty', 'on', 'binary_sensor'), e('dock_error', 'water_empty'), e('dirty_box_full', 'on', 'binary_sensor')]).alertes,
    ['Réservoir d’eau sale plein', 'Réservoir d’eau propre à remplir', 'Détergent de la base à remplir']);
  // Un réservoir en ordre, ou un binaire éteint : rien.
  assert.deepEqual(texte([e('dirty_box_full', 'off', 'binary_sensor'), e('dirty_water_tank_status', 'installed'), e('dust_bag_status', 'installed'), e('dock_error', 'ok')]).alertes, []);
});

test('A6 — la pièce en cours et le chemin fait : « current_room », « clean_percent » (Roborock), « cleaning_progress » (Dreame)', () => {
  assert.deepEqual(B.avanceAspirateur([e('current_room', 'Cuisine'), e('clean_percent', '60')]), { piece: 'Cuisine', pct: 60 });
  assert.deepEqual(B.avanceAspirateur([e('current_room', 'Salon'), e('cleaning_progress', 42.4)]), { piece: 'Salon', pct: 42 });
  assert.deepEqual(B.avanceAspirateur([e('current_room', 'Cuisine')]), { piece: 'Cuisine', pct: null });
  assert.deepEqual(B.avanceAspirateur([e('clean_percent', 0)]), { piece: null, pct: 0 }, 'zéro est un chemin fait, pas une absence');
  assert.equal(B.avanceAspirateur([e('current_room', 'unknown'), e('clean_percent', 'unavailable')]), null, 'Roborock vide son capteur de pièce hors nettoyage');
  assert.equal(B.avanceAspirateur([e('clean_percent', 140)]), null, 'hors de 0–100, ce n’est pas un pourcentage');
  assert.equal(B.avanceAspirateur([e('clean_percent', -1)]), null);
  assert.equal(B.avanceAspirateur([e('current_room', 'Cuisine', 'select')]), null, 'seul un capteur');
  assert.equal(B.avanceAspirateur([e(null, 'Cuisine'), e('progress', 40)]), null, 'ni un nom, ni la clé d’une tondeuse');
  assert.equal(B.avanceAspirateur([]), null);
  assert.equal(B.texteAvanceAspirateur({ piece: 'Cuisine', pct: 60 }), 'Cuisine · 60 %');
  assert.equal(B.texteAvanceAspirateur({ piece: null, pct: 0 }), '0 %');
  assert.equal(B.texteAvanceAspirateur({ piece: 'Cuisine', pct: null }), 'Cuisine');
  assert.equal(B.texteAvanceAspirateur(null), null);
});

test('A6 — la phrase de la carte : « Nettoie · Cuisine · 60 % »', () => {
  const ph = (x) => R.phraseRobot({ domaine: 'vacuum', phase: 'travail', ...x }).texte;
  assert.equal(ph({ aspire: { piece: 'Cuisine', pct: 60 } }), 'Nettoie · Cuisine · 60 %');
  assert.equal(ph({ aspire: { piece: 'Cuisine', pct: 60 }, pieces: ['Salon', 'Cuisine'] }), 'Nettoie · Cuisine · 60 %', 'la pièce où il est vaut mieux que la liste du passage');
  assert.equal(ph({ aspire: { piece: null, pct: 60 }, pieces: ['Salon', 'Cuisine'] }), 'Nettoie · Salon, Cuisine · 60 %', 'sans pièce en cours : la liste du passage, puis le chemin');
  assert.equal(ph({ aspire: { piece: null, pct: 60 } }), 'Nettoie · 60 %');
  assert.equal(ph({ aspire: { piece: 'Cuisine', pct: null } }), 'Nettoie · Cuisine');
  assert.equal(ph({ aspire: null, pieces: ['Salon'] }), 'Nettoie · Salon', 'sans rien de neuf : comme avant');
  assert.equal(ph({}), 'Nettoyage en cours');
  assert.equal(R.phraseRobot({ domaine: 'vacuum', phase: 'pause', aspire: { piece: 'Cuisine', pct: 60 } }).texte, 'En pause · Cuisine · 60 %');
  assert.equal(R.phraseRobot({ domaine: 'lawn_mower', phase: 'travail', aspire: { piece: 'Cuisine', pct: 60 } }).texte, 'Tonte en cours', 'une tondeuse n’a pas de pièce');
});

test('A6 — la base sur la carte : ce qu’elle fait, puis ce qu’elle demande, avant le prochain passage', () => {
  const ph = (phase, x) => R.phraseRobot({ domaine: 'vacuum', phase, maintenant: new Date(2026, 10, 21, 8).getTime(), ...x });
  const prochain = { date: new Date(2026, 10, 21, 9, 30).getTime(), planning: {} };
  assert.equal(ph('base', { base: { activite: 'Vide le bac', alerte: null }, prochain }).texte, 'Vide le bac');
  assert.equal(ph('base', { base: { activite: 'Vide le bac', alerte: 'Réservoir d’eau sale plein' } }).texte, 'Vide le bac', 'ce qui se fait passe devant ce qui se demande');
  const a = ph('base', { base: { activite: null, alerte: 'Réservoir d’eau sale plein' }, prochain });
  assert.equal(a.texte, 'Réservoir d’eau sale plein', 'l’alerte passe devant « Passage à … »');
  assert.equal(a.encre, 'var(--o-warn)', 'en ambre : un geste à faire, pas une panne');
  assert.equal(ph('repos', { base: { activite: 'Sèche la serpillière', alerte: null } }).texte, 'Sèche la serpillière');
  assert.equal(ph('retour', { base: { activite: 'Va laver la serpillière', alerte: null } }).texte, 'Va laver la serpillière');
  assert.equal(ph('retour', { base: { activite: null, alerte: 'Réservoir d’eau sale plein' } }).texte, 'Retour à la base', 'au retour, pas d’alerte');
  assert.equal(ph('travail', { base: { activite: 'Vide le bac', alerte: 'Réservoir d’eau sale plein' } }).texte, 'Nettoyage en cours', 'au travail, la base se tait');
  assert.equal(ph('erreur', { base: { activite: 'Vide le bac', alerte: null } }).texte, 'En erreur', 'une erreur reste dite');
  assert.equal(ph('absent', { base: { activite: 'Vide le bac', alerte: null } }).texte, 'Indisponible', 'muet : rien');
  assert.equal(ph('base', { base: { activite: null, alerte: null }, prochain }).texte, 'Passage à 09:30', 'sans rien à dire : comme avant');
  assert.equal(R.phraseRobot({ domaine: 'lawn_mower', phase: 'base', base: { activite: 'Vide le bac', alerte: null } }).texte, 'Sur la base', 'une tondeuse n’a pas de base à vider');
});

test('A6 — la fiche : des lignes d’état, et l’avance de l’aspirateur avec sa barre', () => {
  const soeurs = [{ id: 'sensor.r_piece', domaine: 'sensor', cle: 'current_room', etat: 'Cuisine', attributs: {} }, { id: 'sensor.r_chemin', domaine: 'sensor', cle: 'clean_percent', etat: '60', attributs: {} },
    { id: 'binary_sensor.r_sale', domaine: 'binary_sensor', cle: 'dirty_box_full', etat: 'on', attributs: {} }, { id: 'sensor.r_base', domaine: 'sensor', cle: 'status', etat: 'emptying_the_bin', attributs: {} }];
  assert.deepEqual(R.avanceeRobot(soeurs), { pct: 60, texte: 'Cuisine · 60 %' });
  const l = R.lignesEtat({ domaine: 'vacuum', robot: 'vacuum.r', phase: 'base', soeurs });
  assert.deepEqual(l.map(x => [x.cle, x.texte, x.encre]), [['base', 'Vide le bac', 'var(--o-text2)'], ['base-sale', 'Réservoir d’eau sale plein', 'var(--o-warn)']]);
  assert.ok(l[0].glyphe && l[1].glyphe === 'triangle-warning');
  assert.deepEqual(R.lignesEtat({ domaine: 'lawn_mower', robot: 'lawn_mower.t', phase: 'base', soeurs }), [], 'une tondeuse ne lit pas la base');
  assert.deepEqual(R.lignesEtat({ domaine: 'vacuum', robot: 'vacuum.r', phase: 'base', soeurs: [] }), []);
  // La tondeuse garde ses clés, devant celles de l'aspirateur.
  assert.deepEqual(R.avanceeRobot([{ id: 'sensor.t', domaine: 'sensor', cle: 'progress', etat: '45', attributs: {} }, ...soeurs]), { pct: 45, texte: '45 %' });
});

test('A6 — les sœurs se trouvent par clé de traduction, dans SON appareil, sans masquées ni désactivées', () => {
  const meta = new Map([
    ['vacuum.r', { deviceId: 'D1' }],
    ['sensor.r_base', { deviceId: 'D1', translationKey: 'status' }],
    ['sensor.r_piece', { deviceId: 'D1', translationKey: 'current_room' }],
    ['sensor.r_nom', { deviceId: 'D1', translationKey: null }],
    ['sensor.r_cache', { deviceId: 'D1', translationKey: 'status', hidden: true }],
    ['sensor.r_coupe', { deviceId: 'D1', translationKey: 'clean_percent', disabled: true }],
    ['sensor.autre', { deviceId: 'D2', translationKey: 'status' }],
    ['sensor.batterie', { deviceId: 'D1', translationKey: 'battery' }],
  ]);
  const s = B.soeursBase({ entityMeta: meta }, 'vacuum.r');
  assert.deepEqual(s.map(x => x.id), ['sensor.r_base', 'sensor.r_piece']);
  assert.deepEqual(s.map(x => [x.cle, x.domaine]), [['status', 'sensor'], ['current_room', 'sensor']]);
  assert.deepEqual(B.soeursBase({ entityMeta: new Map([['vacuum.x', {}]]) }, 'vacuum.x'), [], 'sans appareil, rien à deviner');
  assert.deepEqual(B.soeursBase(null, 'vacuum.r'), []);
  assert.deepEqual(B.entreesBase(s, { 'sensor.r_base': { state: 'washing_the_mop' } }), [{ cle: 'status', domaine: 'sensor', etat: 'washing_the_mop' }, { cle: 'current_room', domaine: 'sensor', etat: null }]);
});

test('A6 — le branchement : la carte s’abonne aux sœurs de la base et dit la pièce ; aucun entity_id ni nom en dur', () => {
  const carte = lire('src/cartes/robot.jsx');
  // ASSERTION MODIFIÉE (21/11, ADR 0385) : le démarrage dépassait son budget ; `robotsbase.js` n'est plus importé en tête de la carte,
  // il se charge à la demande (`useBaseRobot`) et seul un aspirateur le demande.
  assert.ok(carte.includes("import('../robotsbase.js')"), 'chargé à la demande');
  assert.ok(!/^import .* from '\.\.\/robotsbase\.js';/m.test(carte), 'plus au démarrage');
  assert.ok(carte.includes("const B = useBaseRobot(actif && domaine === 'vacuum');"), 'un aspirateur seulement');
  assert.ok(carte.includes('const base = B ? B.soeursBase(LOGGIA_INDEX, id) : [];'));
  assert.ok(carte.includes('.concat(base.map(b => b.id))'), 'abonnée aux états de la base');
  assert.ok(carte.includes('aspire: base.length ? B.avanceAspirateur(entrees) : null'));
  assert.ok(carte.includes('alerte: soin.alertes.length ? soin.alertes[0].texte : null'));
  const src = lire('src/robotsbase.js');
  assert.ok(!/['"`](vacuum|sensor|binary_sensor|button|select)\.[a-z_0-9]+['"`]/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'aucun entity_id');
  assert.ok(!/friendly_name|\.nom\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'jamais un nom');
  const fiche = lire('src/robotsfiche.js');
  assert.ok(fiche.includes("import { lireBase, avanceAspirateur, texteAvanceAspirateur } from './robotsbase.js';"));
  assert.ok(fiche.includes("if (domaine === 'vacuum') {\n    const base = lireBase(soeurs);"));
});

test('A6 — les clés sont celles des intégrations (lues dans leur code public le 21/11), pas des devinettes', () => {
  const src = lire('src/robotsbase.js');
  const attendues = ['status', 'q7_status', 'station_state', 'state', 'self_wash_base_status', 'auto_empty_status', 'mop_drying_status', 'mop_drying_remaining_time',
    'dock_error', 'dirty_water_tank_status', 'clean_water_tank_status', 'dust_bag_status', 'detergent_status', 'dirty_box_full', 'clean_box_empty', 'clean_fluid_empty',
    'current_room', 'clean_percent', 'cleaning_progress'];
  attendues.forEach(k => assert.ok(src.includes(k), k));
  // Les valeurs de ces capteurs, telles que les intégrations les nomment.
  ['emptying_the_bin', 'washing_the_mop', 'going_to_wash_the_mop', 'mop_cleaning', 'mop_airdrying', 'emptying_dustbin', 'washing_mop', 'drying_mop', 'auto_emptying',
    'clean_add_water', 'returning_to_wash', 'waste_water_tank_full', 'water_empty', 'not_installed_or_full', 'low_water', 'low_detergent'].forEach(v => assert.ok(src.includes(v), v));
});

/* ════════════ A9 — LES POSITIONS FAVORITES ════════════ */

test('A9 — deux repères de plus, d’un toucher : « Aérer 30 % » et « Ombre 60 % »', () => {
  const f = V.favorisVolet({ place: true, pos: 100 });
  assert.deepEqual(f.map(x => [x.cle, x.valeur, x.mot, x.ici]), [['aerer', 30, 'Aérer 30 %', false], ['ombre', 60, 'Ombre 60 %', false]]);
  assert.deepEqual(V.favorisVolet({ place: false, pos: 30 }), [], 'un volet qui ne sait pas se placer n’en offre pas');
  assert.deepEqual(V.favorisVolet(), []);
});

test('A9 — la puce où il est se choisit, hors course', () => {
  assert.deepEqual(V.favorisVolet({ place: true, pos: 30 }).map(x => x.ici), [true, false]);
  assert.deepEqual(V.favorisVolet({ place: true, pos: 60 }).map(x => x.ici), [false, true]);
  assert.deepEqual(V.favorisVolet({ place: true, pos: 29.6 }).map(x => x.ici), [true, false], 'une position se compare arrondie');
  assert.deepEqual(V.favorisVolet({ place: true, pos: 30, enCourse: true }).map(x => x.ici), [false, false], 'pendant une course, aucune n’est « là »');
  assert.deepEqual(V.favorisVolet({ place: true, pos: null }).map(x => x.ici), [false, false]);
});

test('A9 — la fiche les pose sous la fenêtre, par le même geste que les cinq repères', () => {
  const f = lire('src/fichevolet.jsx');
  assert.ok(f.includes('const favoris = favorisVolet({ place, pos, enCourse });'));
  assert.ok(f.includes('onClick={() => { if (vise(f.valeur)) envoyer(f.valeur); }}'), 'la visée du repère : `vise`, `envoyer`');
  assert.ok(f.includes('...(f.ici ? ALLUME : null)'), 'choisie : le bleu plein et le blanc');
  assert.ok(f.includes('data-favoris'));
  assert.ok(f.includes("const REPERES = () => [[100, tr('Ouvert')], [75, '75 %'], [50, '50 %'], [25, '25 %'], [0, tr('Fermé')]];"), 'les cinq repères restent');
});

/* ════════════ A9 — OUVRIR UN PORTAIL : DEUX TEMPS ════════════ */

const cover = (classe) => ({ state: 'closed', attributes: { device_class: classe, supported_features: 15 } });

test('A9 — seuls un portail et une porte de garage demandent : leur classe, jamais leur nom', () => {
  assert.equal(C.ouvrantSensible(cover('gate')), true);
  assert.equal(C.ouvrantSensible(cover('garage')), true);
  ['shutter', 'blind', 'awning', 'curtain', 'window', 'door', 'damper', undefined].forEach(c => assert.equal(C.ouvrantSensible(cover(c)), false, String(c)));
  assert.equal(C.ouvrantSensible(null), false);
  assert.equal(C.ouvrantSensible({ state: 'closed', attributes: { friendly_name: 'Portail du jardin' } }), false, 'le nom ne compte pas');
  assert.deepEqual([...C.CLASSES_A_CONFIRMER], ['gate', 'garage']);
});

test('A9 — « ouvrir » : open, ou une position plus haute que celle d’où l’on part', () => {
  assert.equal(C.ouvre({ capacite: 'open' }, 0), true);
  assert.equal(C.ouvre({ capacite: 'open_tilt' }, 0), true);
  assert.equal(C.ouvre({ capacite: 'set_position', valeur: 100 }, 0), true);
  assert.equal(C.ouvre({ capacite: 'set_position', valeur: 60 }, 30), true);
  assert.equal(C.ouvre({ capacite: 'set_position', valeur: 30 }, 30), false, 'la même position n’ouvre rien');
  assert.equal(C.ouvre({ capacite: 'set_position', valeur: 0 }, 100), false, 'fermer ne demande rien');
  assert.equal(C.ouvre({ capacite: 'set_position', valeur: 20 }, 50), false);
  assert.equal(C.ouvre({ capacite: 'set_position', valeur: 10 }, null), true, 'position inconnue : on part de zéro');
  assert.equal(C.ouvre({ capacite: 'close' }, 100), false);
  assert.equal(C.ouvre({ capacite: 'stop' }, 50), false);
  assert.equal(C.ouvre(null, 0), false);
});

test('A9 — le verdict : premier toucher, la question ; second toucher du même geste dans les 4 s, l’envoi', () => {
  const g = { capacite: 'open' };
  const un = C.suiteConfirmation(null, g, 0, true, 1000);
  assert.equal(un.action, 'armer');
  assert.deepEqual(un.armee, { cle: 'open:', depuis: 1000 });
  assert.equal(C.suiteConfirmation(un.armee, g, 0, true, 1000 + 3999).action, 'envoyer', 'à 3,999 s : confirmé');
  assert.equal(C.suiteConfirmation(un.armee, g, 0, true, 1000 + 3999).armee, null, 'rien ne reste armé après l’envoi');
  const tard = C.suiteConfirmation(un.armee, g, 0, true, 1000 + 4000);
  assert.equal(tard.action, 'armer', 'à 4 s, la question est tombée : une neuve');
  assert.equal(tard.armee.depuis, 5000);
  assert.equal(C.DELAI_CONFIRMATION_MS, 4000);
});

test('A9 — un autre geste ne confirme pas celui qui est armé', () => {
  const ouvrir = { capacite: 'open' };
  const armee = C.suiteConfirmation(null, ouvrir, 0, true, 0).armee;
  const place = C.suiteConfirmation(armee, { capacite: 'set_position', valeur: 60 }, 0, true, 100);
  assert.equal(place.action, 'armer', 'une position visée est une autre question');
  assert.equal(place.armee.cle, 'set_position:60');
  assert.equal(C.suiteConfirmation(place.armee, { capacite: 'set_position', valeur: 80 }, 0, true, 200).action, 'armer', 'et une autre valeur aussi');
});

test('A9 — fermer, arrêter, un volet : tout part tout de suite, et défait la question', () => {
  const armee = { cle: 'open:', depuis: 0 };
  assert.deepEqual(C.suiteConfirmation(armee, { capacite: 'close' }, 100, true, 10), { action: 'envoyer', armee: null });
  assert.deepEqual(C.suiteConfirmation(armee, { capacite: 'stop' }, 50, true, 10), { action: 'envoyer', armee: null });
  assert.deepEqual(C.suiteConfirmation(null, { capacite: 'open' }, 0, false, 10), { action: 'envoyer', armee: null }, 'un volet : jamais de question');
  assert.deepEqual(C.suiteConfirmation(null, { capacite: 'set_position', valeur: 100 }, 0, false, 10), { action: 'envoyer', armee: null });
});

test('A9 — le crochet : le premier toucher n’envoie rien ; le second, UN envoi ; sans second, la question tombe seule', () => {
  neuf();
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  try {
    const st = cover('gate');
    const envoi = mock.fn();
    let c = rendre(st);
    assert.equal(c.armee, false);
    assert.equal(c.demander({ capacite: 'open' }, 0, envoi), false);
    assert.equal(envoi.mock.callCount(), 0, 'rien n’est parti');
    c = rendre(st);
    assert.equal(c.armee, true, 'la question est posée');
    mock.timers.tick(3999);
    c = rendre(st);
    assert.equal(c.armee, true, 'encore là à 3,999 s');
    c.confirmer();
    assert.equal(envoi.mock.callCount(), 1, 'le second toucher envoie');
    assert.equal(rendre(st).armee, false, 'et la question est défaite');
    // Un second confirmer, sans question, n'envoie rien de plus.
    rendre(st).confirmer();
    assert.equal(envoi.mock.callCount(), 1);
    // Sans second toucher : à 4 s, elle tombe seule, rien n'est parti.
    const envoi2 = mock.fn();
    rendre(st).demander({ capacite: 'open' }, 0, envoi2);
    assert.equal(rendre(st).armee, true);
    const tour = rendre(st).tour;
    mock.timers.tick(4000);
    c = rendre(st);
    assert.equal(c.armee, false, 'tombée au bout de 4 s');
    assert.notEqual(c.tour, tour, 'la glissière se remonte : elle repart de la position réelle');
    assert.equal(envoi2.mock.callCount(), 0, 'sans second toucher, rien ne s’ouvre');
    c.confirmer();
    assert.equal(envoi2.mock.callCount(), 0, 'confirmer après coup n’envoie rien');
  } finally { mock.timers.reset(); }
});

test('A9 — le crochet : un second toucher DU MÊME geste envoie ; une glissière armée se confirme par « Ouvrir » ; fermer défait la question', () => {
  neuf();
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  try {
    const st = cover('garage');
    const envoi = mock.fn();
    rendre(st).demander({ capacite: 'open' }, 0, envoi);
    assert.equal(rendre(st).demander({ capacite: 'open' }, 0, envoi), true, 'le même geste, une seconde fois : il part');
    assert.equal(envoi.mock.callCount(), 1);
    // La glissière arme une position ; confirmer envoie CELLE-LÀ.
    const posee = mock.fn();
    rendre(st).demander({ capacite: 'set_position', valeur: 60 }, 0, posee);
    rendre(st).confirmer();
    assert.equal(posee.mock.callCount(), 1);
    // Fermer pendant la question la défait, et part.
    const ferme = mock.fn(), ouvre = mock.fn();
    rendre(st).demander({ capacite: 'open' }, 0, ouvre);
    assert.equal(rendre(st).armee, true);
    rendre(st).demander({ capacite: 'close' }, 100, ferme);
    assert.equal(ferme.mock.callCount(), 1);
    assert.equal(rendre(st).armee, false);
    rendre(st).confirmer();
    assert.equal(ouvre.mock.callCount(), 0, 'l’ouverture abandonnée ne part pas');
  } finally { mock.timers.reset(); }
});

test('A9 — le crochet : « annuler » défait la question — un autre ordre est parti', () => {
  neuf();
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  try {
    const st = cover('gate');
    const ouvre = mock.fn();
    rendre(st).demander({ capacite: 'open' }, 0, ouvre);
    assert.equal(rendre(st).armee, true);
    rendre(st).annuler();
    assert.equal(rendre(st).armee, false);
    rendre(st).confirmer();
    assert.equal(ouvre.mock.callCount(), 0, 'rien à confirmer');
    mock.timers.tick(4000);
    assert.equal(ouvre.mock.callCount(), 0);
  } finally { mock.timers.reset(); }
});

test('A9 — le crochet : un volet n’est jamais interrogé', () => {
  neuf();
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  try {
    const envoi = mock.fn();
    assert.equal(rendre(cover('shutter')).demander({ capacite: 'open' }, 0, envoi), true);
    assert.equal(envoi.mock.callCount(), 1, 'tout de suite');
    assert.equal(rendre(cover('shutter')).armee, false);
  } finally { mock.timers.reset(); }
});

test('A9 — la carte du garage et la compacte : la phrase dit « Confirmer ? », « Ouvrir » devient une coche, fermer et arrêter partent', () => {
  const v = lire('src/cartes/volet.jsx');
  assert.ok(v.includes("import { useConfirmerOuverture } from '../confirmerouvrant.js';"));
  assert.ok(v.includes('const conf = useConfirmerOuverture(st);'));
  assert.ok(v.includes("const sub = mort ? phraseMuette(st) : arme ? tr('Confirmer ?') :"), 'la phrase');
  assert.ok(v.includes('conf.demander(g, pos, () => envoyer(g, avance))'));
  assert.ok(v.includes('if (arme) conf.confirmer(); else demander(gestes.monter, 100);'), 'le second toucher sur « Ouvrir »');
  assert.ok(v.includes('envoyer(gestes.descendre, 0)') && v.includes('envoyer(gestes.stop, null)'), 'fermer et arrêter partent seuls…');
  assert.ok(v.includes('if (mort || !g) return; conf.annuler();'), '…et défont la question : l’ouverture abandonnée ne part pas');
  assert.ok(v.includes('aria-live="polite">{arme ?'), 'dit au lecteur d’écran');
  assert.ok(v.includes('<RmJauge key={conf.tour}'), 'la glissière revient à la position réelle');
  assert.ok(v.includes("<Fi i={arme ? 'check' : 'angle-up'} size={14} />"));
  assert.ok(v.includes("const RM_CONFIRME = { background: 'var(--o-accent-fond)', color: '#fff' };"), 'une puce choisie : le bleu plein et le blanc');
  assert.ok(!/RoomVoletCard[\s\S]*useConfirmerOuverture/.test(v.slice(v.indexOf('function RoomVoletCard'))), 'la carte d’un volet ne demande rien');
  const c = lire('src/cartescustom/cartes.jsx');
  assert.ok(c.includes("const conf = useConfirmerOuverture(dom === 'cover' ? st : null);"));
  assert.ok(c.includes("const armeCv = dom === 'cover' && conf.armee && !dead;"));
  assert.ok(c.includes("else if (armeCv) stateTxt = tr('Confirmer ?');"));
  assert.ok(c.includes('conf.demander(g, posCv, () => {'));
  assert.equal((c.match(/if \(armeCv\) conf\.confirmer\(\); else bougerCover\(gestesCv\.monter, 100\);/g) || []).length, 1, 'la mini ▲');
  assert.ok(c.includes("(cle === 'monter' && armeCv) ? conf.confirmer()") || c.includes("if (cle === 'monter' && armeCv) conf.confirmer(); else bougerCover(gestesCv[cle], cible);"), 'les trois boutons');
});
