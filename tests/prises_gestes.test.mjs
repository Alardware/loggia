/* Les gestes sur les prises, et ce qui les tient vivantes (chantier Prises,
 * relecture finale « Tâche 12 bis — A », 14/10).
 *
 * Ces tests JOUENT les composants (tests/crochets.mjs) : on appuie sur la
 * bascule, on lit la question qui paraît, on laisse passer six secondes ou on
 * appuie sur Échap, on bouge un capteur et on attend le tic. Sous `?gestes`,
 * App.jsx exporte en plus ce qu'il faut jouer — le fichier n'est pas touché
 * (le crochet de tests/carte_prise.test.mjs). Ce qui est garanti :
 *  - A1 la recherche (Ctrl+K) ne coupe pas d'un appui une prise gardée, ne
 *    bascule jamais l'appairage Zigbee, et y mène par la mémoire de session ;
 *  - A2 la carte, la compacte et l'en-tête d'Objets › Prises lisent un `hass`
 *    VIVANT et se redessinent seuls quand le capteur bouge, à 10 W près ; une
 *    compacte qui n'est pas une prise ne pose aucun intervalle ;
 *  - A3 une protection pas encore lue se traite comme une protection : la carte
 *    demande, sans cadenas ; la carte d'une prise que l'index ne connaît pas
 *    encore ouvre la fiche quand l'état déjà lu la dit protégée ;
 *  - A4 la compacte sans fiche et le gros interrupteur demandent sur place :
 *    deux appuis, Échap ou 6 s défont la demande ; avec une fiche, la compacte
 *    l'ouvre ; une bascule ne reste jamais sans effet ;
 *  - A5 « Ajouter une carte » range les prises sous Prises ;
 *  - B10 (« Tâche 12 bis — B ») la recherche ne fait pas sonner une sirène d'un
 *    appui : un switch de sirène mène à Sécurité, où elle vit (P1) ;
 *  - F2 (« Tâche 14 bis ») tant que l'index n'est pas lu, la règle commune des
 *    switch qu'il ne classe pas (`gardeDeSwitch`) garde le NAS : la compacte, le
 *    gros interrupteur, la recherche et la carte générique demandent — ou ouvrent
 *    la fiche, jamais `RoomSwitchSheet` — quand l'état des prises le nomme ou n'a
 *    pas encore répondu ; une erreur sans état, ou l'index lu, ne gardent rien ;
 *  - F3 la ligne d'un switch épinglé (`LigneEntite`) passe par la même garde ;
 *  - F4 la question tombe quand la prise n'est plus allumée : rallumée dans les
 *    6 s, elle ne revient pas — la carte, la compacte, le gros interrupteur, la ligne ;
 *  - F5 le gros interrupteur et la recherche envoient `turn_on` / `turn_off`,
 *    d'après l'état affiché, jamais `toggle` ; un cache que personne ne suit
 *    vaut une protection inconnue pour la recherche. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

import { area, device, entity, state, states, ctxOf } from './fixtures.mjs';
import { monter, horlogeFausse, documentFaux, texteDe } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
const NOMS = ['RoomPriseCard', 'RoomGenericCard', 'CvCard', 'CvBigToggle', 'LigneEntite', 'EntetePrisesVive', 'appareilsRecherche', 'filtresEntite', 'useHass',
  'useDomainCards', 'FichePrise', 'RoomSwitchSheet', 'deriveNotifs'];
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?gestes')) return next(url, ctx);",
  '  const r = await next(url.slice(0, -7), ctx);',
  "  return { ...r, source: String(r.source) + ';export { " + NOMS.join(', ') + " };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?gestes', import.meta.url).href);
const E = await import('../src/prisesetat.js');
const { comptePrises } = await import('../src/enteteprises.jsx');
const FICHE = (await import('../src/ficheprise.jsx')).default;
const attendre = () => new Promise(r => setImmediate(r));

const NAS = 'switch.prise_nas_zephyr', PC = 'switch.prise_pc_bureau_atlas', RAD = 'switch.radiateur_salon', PONT = 'switch.zigbee2mqtt_bridge_permit_join';
const SIRENE = 'switch.alarme_sirene_siren_on';
// Une multiprise de deux sorties, de classe `outlet` : chacune est une prise. La sortie 2 est celle qu'on épingle (F3).
const SORTIE_1 = 'switch.multiprise_sortie_1', SORTIE_2 = 'switch.multiprise_sortie_2';
const PC_W = 'sensor.prise_pc_bureau_atlas_power';
const a = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };

/* Trois prises qui mesurent (le NAS et le PC, et leur verrou enfant), un switch qui ne mesure pas, le pont de
 * Zigbee2MQTT. Le registre les range ; les états sont ceux que le test fait bouger. */
function maison() {
  const classe = (id, dev, c) => ({ ...entity(id, { device: dev }), device_class: c });
  const prise = (id, dev) => [entity('switch.' + id, { device: dev }), classe('sensor.' + id + '_power', dev, 'power'), classe('sensor.' + id + '_energy', dev, 'energy')];
  const etats = (id, nom, st, w) => [
    ['switch.' + id, { entity_id: 'switch.' + id, state: st, last_changed: a(8, 50), last_updated: a(8, 50), attributes: { friendly_name: nom } }],
    state('sensor.' + id + '_power', String(w), { friendly_name: nom + ' Power', device_class: 'power', unit_of_measurement: 'W' }),
    state('sensor.' + id + '_energy', '212.6', { friendly_name: nom + ' Energy', device_class: 'energy', unit_of_measurement: 'kWh' }),
  ];
  return {
    areas: [area('bureau', 'Bureau'), area('salon', 'Salon')],
    devices: [device('d_nas', 'Prise NAS (Zephyr)', 'bureau', { manufacturer: 'Tuya', model: 'Smart plug' }), device('d_pc', 'Prise PC Bureau (Atlas)', 'bureau', { manufacturer: 'Tuya', model: 'Smart plug' }),
      device('d_pont', 'Bridge', null, { manufacturer: 'Zigbee2MQTT', model: 'Bridge' }), device('d_multi', 'Multiprise bureau', 'bureau', { manufacturer: 'Tuya', model: 'Power strip' })],
    entities: [...prise('prise_nas_zephyr', 'd_nas'), ...prise('prise_pc_bureau_atlas', 'd_pc'), entity(RAD, { area: 'salon' }), entity(PONT, { device: 'd_pont' }), entity(SIRENE, { area: 'salon' }),
      classe(SORTIE_1, 'd_multi', 'outlet'), classe(SORTIE_2, 'd_multi', 'outlet')],
    floors: [],
    states: states(...etats('prise_nas_zephyr', 'Prise NAS (Zephyr)', 'on', 4), ...etats('prise_pc_bureau_atlas', 'Prise PC Bureau (Atlas)', 'on', 146),
      state(RAD, 'on', { friendly_name: 'Radiateur salon' }), state(PONT, 'off', { friendly_name: 'Zigbee2MQTT Bridge Permit join' }),
      state(SIRENE, 'off', { friendly_name: 'Alarme sirène Siren on' }), state(SORTIE_1, 'off', { friendly_name: 'Multiprise sortie 1' }), state(SORTIE_2, 'on', { friendly_name: 'Multiprise sortie 2' })),
    energyPrefs: null,
  };
}
const ENTREE = { type: 'prise', impose: false, protegee: false, prevenir: false, cycle: null, cycles: [] };
const etatServeur = (protegees = [NAS]) => ({ maintenant: a(20, 40), notifier: true, config: { protegees, types: {}, prevenir: {} },
  prises: { [NAS]: { ...ENTREE, type: 'nas', protegee: protegees.includes(NAS) }, [PC]: { ...ENTREE, type: 'pc', protegee: protegees.includes(PC) } } });

/* La maison dans l'index de Loggia, le serveur doublé (aucune horloge qui tourne), et un `hass` dont chaque lecture
 * est un OBJET NEUF, comme celui de Home Assistant : `vivant()` rend l'état du moment, `appels` les services appelés.
 * `appelWS` : la réponse du serveur à l'état des prises (par défaut, il ne répond jamais — le chargement ; un rejet est
 * « un serveur d'avant la mise à jour ») ; `sondages()` : les périodes des sondages que les magasins ont posés — leur
 * horloge est doublée, l'horloge des tests (`horlogeFausse`) ne les voit pas. */
function poser(fx, { etat = etatServeur(), index = true, appelWS = () => new Promise(() => {}) } = {}) {
  setLoggiaState({ index: index ? ctxOf(fx, {}).index : null, ent: {}, cfg: {}, resolved: null });
  const sondes = new Map();
  let suite = 0;
  const horloge = { repeter: (f, ms) => { sondes.set(++suite, ms); return suite; }, arreter: (n) => { sondes.delete(n); }, plusTard: () => 0, annuler: () => {}, maintenant: () => Date.now() };
  E.reglerPrisesEtat({ hass: { callWS: appelWS }, horloge });
  if (etat) E.poserEtatPrises(etat);
  E.poserMinuteurs({ minuteurs: {}, maintenant: Date.now() / 1000 });
  const appels = [];
  const courants = Object.fromEntries(Object.entries(fx.states).map(([k, v]) => [k, { ...v }]));
  const instantane = () => ({ states: Object.fromEntries(Object.entries(courants).map(([k, v]) => [k, { ...v }])),
    callService: (d, s, data, cible) => { appels.push(d + '.' + s + ' ' + ((cible && cible.entity_id) || (data && data.entity_id) || '')); return Promise.resolve(); } });
  return { appels, courants, vivant: instantane, hass: instantane, sondages: () => [...sondes.values()].sort((a, b) => a - b),
    change: (id, etat, attrs = {}) => { courants[id] = { ...courants[id], state: String(etat), last_updated: new Date().toISOString(), ...attrs }; } };
}
const couper = (m) => m.appels.filter(x => /turn_off|toggle/.test(x));

/* L'environnement d'un test : minuteurs et `document` doublés, rendus à la fin. */
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  try { return await fn({ h, d }); } finally { h.restaurer(); d.restaurer(); }
}
const interrupteur = (m) => m.trouver(e => e.props && typeof e.props.onToggle === 'function')[0];
const roleSwitch = (m) => m.trouver(e => e.props && e.props.role === 'switch')[0];
const surface = (m) => (m.trouver(e => e.props && typeof e.props.label === 'string' && e.props.onClick)[0] || { props: {} }).props.label;

// ── A3 : la carte d'une prise ────────────────────────────────────────────────

test('A3 : la protection n’est pas encore lue — la carte demande avant de couper, et ne met pas de cadenas', () => dans(() => {
  const fx = maison(); const w = poser(fx, { etat: null });
  const m = monter(F.RoomPriseCard, { id: NAS, hass: w.hass(), onOpen: () => {} });
  assert.equal(m.trouver(e => e.props && e.props['aria-label'] === 'Protégée').length, 0, 'pas de cadenas : la protection est INCONNUE, on ne l’affirme pas');
  m.appuyer(interrupteur(m), 'onToggle');
  assert.ok(m.texte().includes('Couper la prise ?'), 'un appui : la question, à la place de la phrase');
  assert.deepEqual(couper(w), [], 'rien n’est coupé');
  m.appuyer(m.trouver(e => e.props && e.props['data-annuler'] !== undefined)[0]);
  assert.ok(!m.texte().includes('Couper la prise ?') && m.texte().includes('En marche depuis'), 'Annuler défait la demande');
  m.appuyer(interrupteur(m), 'onToggle');
  m.appuyer(m.trouver(e => e.props && e.props['aria-label'] === 'Couper Prise NAS (Zephyr)')[0]);
  assert.equal(couper(w).length, 1, 'le second geste, « Couper », coupe');
}));

test('point 17 : la demande de confirmation tient dans la nouvelle disposition — la question dans la même colonne que le nom, la puissance se tait, Annuler et Couper au pied', () => dans(() => {
  const fx = maison(); const w = poser(fx);
  const m = monter(F.RoomPriseCard, { id: NAS, hass: w.hass(), onOpen: () => {} });
  const enfants = (e) => [].concat(e && e.props ? e.props.children : []).filter(x => x && typeof x === 'object');
  const rangee = () => m.trouver(e => e.props && e.props.style && e.props.style.alignItems === 'flex-end' && enfants(e).some(c => c.props && c.props.style && c.props.style.flex === 1))[0];
  const classes = (r) => enfants(enfants(r)[0]).map(e => e.props.className);
  let r = rangee();
  assert.deepEqual([r.props.style.display, r.props.style.gap, r.props.style.marginTop], ['flex', 10, 'var(--o-milieu-haut, 14px)']);
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : le nom et la phrase portent les classes de la grille commune.
  assert.deepEqual(classes(r), ['o-gab-nom', 'o-gab-phrase'], 'le nom, puis la phrase, dans une seule colonne');
  assert.equal(enfants(r)[1].type.name, 'ChiffrePrise', 'la puissance à droite : le NAS tire 4 W');
  assert.equal(m.trouver(e => e.props && e.props['data-demande'] !== undefined).length, 0, 'pas de demande');
  m.appuyer(interrupteur(m), 'onToggle');
  r = rangee();
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : les classes de la grille commune.
  assert.deepEqual(classes(r), ['o-gab-nom', 'o-gab-phrase'], 'la question prend la place de la phrase, dans la même colonne');
  assert.equal(enfants(enfants(r)[0])[1].props.children, 'Couper la prise ?');
  assert.equal(enfants(r).length, 1, 'la puissance se tait pendant la demande : la colonne a toute la largeur');
  assert.equal(m.trouver(e => e.props && e.props['data-demande'] !== undefined).length, 1, 'Annuler et Couper, au pied');
  assert.deepEqual(m.trouver(e => e.props && e.props['data-demande'] !== undefined)[0].props.style, { display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 10 });
  m.appuyer(m.trouver(e => e.props && e.props['data-annuler'] !== undefined)[0]);
  assert.equal(enfants(rangee()).length, 2, 'Annuler : la puissance revient');
  assert.deepEqual(couper(w), [], 'rien n’est coupé');
}));

test('A3 : protection connue — le cadenas paraît pour une prise protégée, qui demande ; une prise libre se coupe d’un appui', () => dans(() => {
  const fx = maison(); const w = poser(fx);
  const nas = monter(F.RoomPriseCard, { id: NAS, hass: w.hass(), onOpen: () => {} });
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : deux écritures — le cadenas du haut (carte large), la pastille de la ligne (carte étroite).
  assert.equal(nas.trouver(e => e.props && e.props['aria-label'] === 'Protégée').length, 2, 'protégée et lue : le cadenas');
  nas.appuyer(interrupteur(nas), 'onToggle');
  assert.ok(nas.texte().includes('Couper la prise ?') && couper(w).length === 0);
  const pc = monter(F.RoomPriseCard, { id: PC, hass: w.hass(), onOpen: () => {} });
  assert.equal(pc.trouver(e => e.props && e.props['aria-label'] === 'Protégée').length, 0);
  pc.appuyer(interrupteur(pc), 'onToggle');
  assert.equal(couper(w).length, 1, 'lue et libre : un appui coupe, sans question');
  assert.ok(!pc.texte().includes('Couper la prise ?'));
}));

// ── T10 (passe téléphone, tâche 5) : la bascule de la carte étroite ──────────
// La carte écrit deux bascules — celle du haut pour la carte large (`o-seul-large`), celle de la ligne de commandes pour l'étroite ; la feuille n'en montre qu'une.
const basculeEtroite = (m) => m.trouver(e => e.props && typeof e.props.onToggle === 'function' && e.props.className !== 'o-seul-large')[0];

test('T10 : la bascule de la carte étroite — gardée, elle ouvre la fiche et ne demande pas sur place ; libre, elle coupe d’un appui', () => dans(() => {
  const ouvertes = [];
  // La protection n'est pas encore lue : la prise est gardée (A3).
  const w = poser(maison(), { etat: null });
  const nas = monter(F.RoomPriseCard, { id: NAS, hass: w.hass(), onOpen: (x) => ouvertes.push(x) });
  assert.equal(nas.trouver(e => e.props && typeof e.props.onToggle === 'function').length, 2, 'deux bascules : celle du haut, celle de la ligne');
  nas.appuyer(basculeEtroite(nas), 'onToggle');
  assert.deepEqual(ouvertes, [NAS], 'gardée : la fiche s’ouvre — c’est elle qui demande (`appuiBascule` → « fiche »)');
  assert.ok(!nas.texte().includes('Couper la prise ?') && nas.trouver(e => e.props && e.props['data-demande'] !== undefined).length === 0, 'la carte étroite ne demande pas sur place');
  assert.deepEqual(couper(w), [], 'rien n’est coupé');
  // Lue et libre : un appui coupe, d'après l'état affiché.
  const w2 = poser(maison());
  const pc = monter(F.RoomPriseCard, { id: PC, hass: w2.hass(), onOpen: (x) => ouvertes.push(x) });
  pc.appuyer(basculeEtroite(pc), 'onToggle');
  assert.deepEqual(couper(w2), ['switch.turn_off ' + PC], 'un appui, et elle est coupée — jamais `toggle`');
  assert.deepEqual(ouvertes, [NAS], 'sans ouvrir la fiche');
  // Protégée et lue : la ligne n'a pas d'interrupteur, mais la pastille — sans geste à elle : l'appui descend à la surface (T11).
  const w3 = poser(maison());
  const protegee = monter(F.RoomPriseCard, { id: NAS, hass: w3.hass(), onOpen: (x) => ouvertes.push(x) });
  assert.equal(protegee.trouver(e => e.props && typeof e.props.onToggle === 'function').length, 1, 'protégée : la bascule du haut seule');
  assert.equal(protegee.trouver(e => e.props && e.props.className === 'o-gab-pastille' && !e.props.onClick).length, 1, 'la pastille, sans geste à elle');
}));

// ── A3 : la carte d'une prise que l'index ne connaît pas encore ───────────────

test('A3 + F2 : avant l’index, la carte générique d’un switch ouvre la fiche si l’état des prises le nomme — ou n’a pas encore répondu — et qu’il est allumé ; sinon elle coupe', () => dans(async () => {
  const ouvertes = [];
  // `patienter` : laisser la réponse du serveur — ici un rejet — arriver, puis redessiner la carte qui la lit.
  const jouer = async (o, id = NAS, patienter = false) => {
    const fx = maison(); const w = poser(fx, { ...o, index: false });
    const m = monter(F.RoomGenericCard, { id, hass: w.hass(), onOpen: (x) => ouvertes.push(x) });
    if (patienter) { await attendre(); m.rendre(); }
    m.appuyer(interrupteur(m), 'onToggle');
    return { m, w };
  };
  // L'index n'est pas là : `priseDe` ne dit rien, la carte est celle d'un switch. (a) L'état lu nomme le NAS.
  let r = await jouer({ etat: etatServeur([NAS]) });
  assert.deepEqual(ouvertes, [NAS], 'la fiche s’ouvre');
  assert.deepEqual(couper(r.w), [], 'la carte ne coupe pas');
  // Un autre switch, que la liste ne nomme pas, l'état étant lu : le geste d'abord — explicite, d'après l'état affiché.
  ouvertes.length = 0;
  r = await jouer({ etat: etatServeur([NAS]) }, PC);
  assert.deepEqual(ouvertes, [], 'pas protégée : pas de fiche');
  assert.deepEqual(r.w.appels, ['switch.turn_off ' + PC], 'elle coupe');
  // (b) Ni index ni état, et aucune erreur : c'est le chargement. Dans le doute, la fiche s'ouvre (elle demande) ; la carte ne coupe pas d'un appui.
  ouvertes.length = 0;
  r = await jouer({ etat: null });
  assert.deepEqual(ouvertes, [NAS], 'le chargement : la fiche');
  assert.deepEqual(couper(r.w), [], 'et rien n’est coupé');
  // Le serveur répond qu'il ne sait pas (un composant d'avant la mise à jour) : une erreur sans état ne garde PAS un switch que l'index ne connaît pas.
  ouvertes.length = 0;
  r = await jouer({ etat: null, appelWS: () => Promise.reject({ code: 'unknown_command' }) }, NAS, true);
  assert.deepEqual([E.lireEtatPrises().etat, E.lireEtatPrises().erreur], [null, true], 'rien lu, une erreur');
  assert.deepEqual(ouvertes, [], 'pas de fiche');
  assert.deepEqual(r.w.appels, ['switch.turn_off ' + NAS], 'un serveur trop vieux ne gêne pas indéfiniment : la carte coupe');
  // Éteinte, elle s'allume : jamais gardée.
  ouvertes.length = 0;
  const fx = maison(); const w = poser(fx, { etat: etatServeur([NAS]), index: false });
  w.change(NAS, 'off');
  const m = monter(F.RoomGenericCard, { id: NAS, hass: w.hass(), onOpen: (x) => ouvertes.push(x) });
  m.appuyer(interrupteur(m), 'onToggle');
  assert.deepEqual(ouvertes, []);
  assert.equal(w.appels.filter(x => /turn_on/.test(x)).length, 1, 'allumer ne demande jamais');
}));

test('F2 : l’index lu, un switch qu’il ne classe pas n’est pas une prise — la carte générique le coupe d’un appui, même sans état, et ne s’abonne à rien', () => dans(async () => {
  for (const o of [{ etat: null }, { etat: etatServeur([NAS]) }]) {
    const fx = maison(); const w = poser(fx, o);
    const ouvertes = [];
    const m = monter(F.RoomGenericCard, { id: RAD, hass: w.hass(), onOpen: (x) => ouvertes.push(x) });
    m.appuyer(interrupteur(m), 'onToggle');
    assert.deepEqual(ouvertes, []);
    assert.deepEqual(w.appels, ['switch.turn_off ' + RAD], 'un radiateur sur switch : le geste d’abord');
    assert.equal(E.abonnesPrises(), 0, 'et aucun abonné à l’état des prises');
  }
}));

/* La feuille que `ouvrir` choisit, jouée : `useDomainCards` rend ses feuilles comme enfants, on y cherche `FichePrise` et `RoomSwitchSheet`. */
const Feuilles = ({ hass }) => { const dc = F.useDomainCards(hass); return { type: 'feuilles', props: { dc, children: dc.sheets } }; };
const feuilles = (m) => ({ fiche: m.trouver(e => e.type === F.FichePrise), simple: m.trouver(e => e.type === F.RoomSwitchSheet) });
const ouvrirPar = (dc) => (id) => { dc.arbre.props.dc.ouvrir(id); dc.rendre(); };
const sansPrise = { prise: false, puissance: null, energie: null };      // ce que la coquille passe à la fiche d'un switch que l'index ne classe pas
const demandeDe = (m) => m.trouver(e => e.props && e.props['data-demande'] !== undefined)[0] || null;
const bouton = (m, texte) => m.trouver(e => e.type === 'button' && texteDe(e) === texte)[0];
const Bascule = () => null;

test('F2 : la carte générique du NAS, que `protegees` nomme, ouvre FichePrise — jamais RoomSwitchSheet, qui coupe sans demander — et la fiche demande', () => dans(async () => {
  const fx = maison(); const w = poser(fx, { etat: etatServeur([NAS]), index: false });
  const hass = w.hass();
  const dc = monter(Feuilles, { hass });
  const carte = monter(F.RoomGenericCard, { id: NAS, hass, onOpen: ouvrirPar(dc) });
  carte.appuyer(interrupteur(carte), 'onToggle');
  assert.deepEqual(couper(w), [], 'la carte ne coupe pas');
  assert.deepEqual([feuilles(dc).fiche.length, feuilles(dc).simple.length], [1, 0], 'la fiche d’une prise, non la feuille d’un switch ordinaire');
  assert.equal(feuilles(dc).fiche[0].props.id, NAS);
  // La fiche, jouée comme la coquille la monte : sa bascule demande (A3, B1) — la demande est vérifiée, pas seulement l'ouverture.
  const fiche = monter(FICHE, { hass, id: NAS, prise: sansPrise, piece: 'Bureau', bascule: Bascule, onFiche: () => {} });
  fiche.appuyer(interrupteur(fiche), 'onToggle');
  assert.ok(demandeDe(fiche), 'la fiche pose la question');
  assert.ok(fiche.texte().includes('Prise NAS (Zephyr) est allumée.') && fiche.texte().includes('Couper quand même'), fiche.texte());
  assert.deepEqual(couper(w), [], 'rien n’est coupé');
  fiche.appuyer(bouton(fiche, 'Couper quand même'));
  assert.equal(couper(w).length, 1, '« Couper quand même » coupe');
}));

test('F2 : un switch ordinaire garde sa feuille — l’état lu ne le nomme pas, ou l’index est lu — ; au chargement, la fiche s’ouvre, et la feuille ne change pas quand la réponse arrive', () => dans(async () => {
  // L'état est lu et ne nomme pas le radiateur : sa feuille d'avant.
  let fx = maison(); let w = poser(fx, { etat: etatServeur([NAS]), index: false });
  let dc = monter(Feuilles, { hass: w.hass() });
  dc.arbre.props.dc.ouvrir(RAD); dc.rendre();
  assert.deepEqual([feuilles(dc).fiche.length, feuilles(dc).simple.length], [0, 1]);
  // L'index lu, rien lu : un radiateur n'est pas une prise.
  fx = maison(); w = poser(fx, { etat: null });
  dc = monter(Feuilles, { hass: w.hass() });
  dc.arbre.props.dc.ouvrir(RAD); dc.rendre();
  assert.deepEqual([feuilles(dc).fiche.length, feuilles(dc).simple.length], [0, 1]);
  // Une prise que l'index connaît : sa fiche, quoi que dise l'état.
  fx = maison(); w = poser(fx, { etat: etatServeur([]) });
  dc = monter(Feuilles, { hass: w.hass() });
  dc.arbre.props.dc.ouvrir(PC); dc.rendre();
  assert.deepEqual([feuilles(dc).fiche.length, feuilles(dc).simple.length], [1, 0]);
  // Le chargement (ni index ni état) : la fiche. Le choix est fait à l'ouverture et TIENT — l'état répond « libre », la feuille ne se change pas sous les doigts.
  fx = maison(); w = poser(fx, { etat: null, index: false });
  dc = monter(Feuilles, { hass: w.hass() });
  dc.arbre.props.dc.ouvrir(PC); dc.rendre();
  assert.deepEqual([feuilles(dc).fiche.length, feuilles(dc).simple.length], [1, 0], 'le chargement : la fiche');
  E.poserEtatPrises(etatServeur([NAS])); dc.rendre();
  assert.deepEqual([feuilles(dc).fiche.length, feuilles(dc).simple.length], [1, 0], 'la réponse arrive, le PC n’est pas protégé : la feuille reste la fiche');
}));

// ── A4 : la compacte ─────────────────────────────────────────────────────────

test('A4 : la compacte d’une prise gardée OUVRE la fiche quand elle en a une — le geste de la conception', () => dans(() => {
  const fx = maison(); const w = poser(fx); const ouvertes = [];
  const m = monter(F.CvCard, { id: NAS, hass: w.hass(), dense: true, onOpen: (x) => ouvertes.push(x) });
  m.appuyer(roleSwitch(m));
  assert.deepEqual(ouvertes, [NAS]);
  assert.deepEqual(couper(w), [], 'elle ne coupe pas');
  assert.ok(!m.texte().includes('Couper la prise ?'), 'et ne demande pas sur place : la fiche s’en charge');
}));

test('A4 : sans fiche à ouvrir, la compacte demande sur place — la phrase, le nom de la bascule — et le second appui coupe', () => dans(({ h }) => {
  const fx = maison(); const w = poser(fx);
  const m = monter(F.CvCard, { id: NAS, hass: w.hass(), dense: true, onOpen: null });
  assert.ok(m.texte().includes('En marche depuis'), 'avant : la phrase d’état');
  assert.equal(roleSwitch(m).props['aria-label'], 'Éteindre Prise NAS (Zephyr)');
  m.appuyer(roleSwitch(m));
  assert.ok(m.texte().includes('Couper la prise ?') && !m.texte().includes('En marche depuis'), 'un appui : la phrase devient la question');
  assert.equal(roleSwitch(m).props['aria-label'], 'Couper Prise NAS (Zephyr)', 'et la bascule dit ce que le prochain appui fera');
  assert.deepEqual(couper(w), [], 'rien n’est coupé');
  m.appuyer(roleSwitch(m));
  assert.equal(couper(w).length, 1, 'le second appui coupe');
  h.avancer(7000);
  assert.ok(!m.texte().includes('Couper la prise ?'), 'la demande est partie avec le geste');
}));

test('A4 : la demande de la compacte se défait seule au bout de 6 s, et par Échap — pas avant', () => dans(({ h, d }) => {
  const fx = maison(); const w = poser(fx);
  const m = monter(F.CvCard, { id: NAS, hass: w.hass(), dense: true, onOpen: null });
  m.appuyer(roleSwitch(m));
  assert.ok(m.texte().includes('Couper la prise ?'));
  assert.equal(d.ecouteurs('keydown'), 1, 'Échap est écouté tant que la question est posée');
  h.avancer(5999); m.effets();
  assert.ok(m.texte().includes('Couper la prise ?'), 'à 5,999 s : elle tient encore');
  h.avancer(1); m.effets();
  assert.ok(!m.texte().includes('Couper la prise ?') && m.texte().includes('En marche depuis'), 'à 6 s : défaite');
  assert.equal(d.ecouteurs('keydown'), 0, 'et Échap n’est plus écouté');
  m.appuyer(roleSwitch(m));
  d.emettre('keydown', { key: 'a' }); m.effets();
  assert.ok(m.texte().includes('Couper la prise ?'), 'une autre touche ne défait rien');
  d.emettre('keydown', { key: 'Escape' }); m.effets();
  assert.ok(!m.texte().includes('Couper la prise ?'), 'Échap la défait');
  assert.deepEqual(couper(w), []);
}));

test('A4 : la compacte d’une prise libre se coupe d’un appui ; une prise coupée s’allume d’un appui, protégée ou non', () => dans(() => {
  const fx = maison(); const w = poser(fx);
  const libre = monter(F.CvCard, { id: PC, hass: w.hass(), dense: true, onOpen: null });
  libre.appuyer(roleSwitch(libre));
  assert.equal(couper(w).length, 1, 'libre : un appui coupe');
  assert.ok(!libre.texte().includes('Couper la prise ?'));
  w.change(NAS, 'off');
  const eteinte = monter(F.CvCard, { id: NAS, hass: w.hass(), dense: true, onOpen: null });
  eteinte.appuyer(roleSwitch(eteinte));
  assert.equal(w.appels.filter(x => /turn_on/.test(x)).length, 1, 'allumer ne demande jamais');
}));

test('A3 + A4 : la compacte sans protection lue demande aussi — dans le doute, on demande', () => dans(() => {
  const fx = maison(); const w = poser(fx, { etat: null });
  const m = monter(F.CvCard, { id: PC, hass: w.hass(), dense: true, onOpen: null });
  m.appuyer(roleSwitch(m));
  assert.ok(m.texte().includes('Couper la prise ?'));
  assert.deepEqual(couper(w), []);
  const avecFiche = []; const n = monter(F.CvCard, { id: PC, hass: w.hass(), dense: true, onOpen: (x) => avecFiche.push(x) });
  n.appuyer(roleSwitch(n));
  assert.deepEqual(avecFiche, [PC], 'avec une fiche : elle s’ouvre');
}));

test('A4 : une compacte qui n’est pas une prise garde son geste, et ne s’abonne à rien — ni aux magasins des prises, ni à l’horloge', () => dans(({ h }) => {
  const fx = maison(); const w = poser(fx);
  const m = monter(F.CvCard, { id: RAD, hass: w.hass(), dense: true, onOpen: null });
  m.appuyer(roleSwitch(m));
  assert.equal(couper(w).length, 1, 'un switch qui ne mesure pas : le geste d’abord');
  assert.ok(!m.texte().includes('Couper la prise ?'));
  // L'horloge des magasins est doublée (`poser`) : `h.intervalles()` ne voit PAS leurs sondages. On compte donc leurs abonnés, et les sondages qu'ils ont posés.
  assert.equal(E.abonnesPrises(), 0, 'aucun abonné à l’état des prises');
  assert.deepEqual(w.sondages(), [], 'aucun sondage posé par les magasins');
  assert.equal(h.intervalles().length, 0, 'aucun intervalle de relevé : une compacte qui n’est pas une prise ne paie rien (A2)');
  // La contre-épreuve : la compacte d'une VRAIE prise s'abonne — les assertions ci-dessus ne passent pas par vacuité.
  const prise = monter(F.CvCard, { id: PC, hass: w.hass(), dense: true, onOpen: null });
  assert.equal(E.abonnesPrises(), 1, 'une prise s’abonne');
  assert.deepEqual(w.sondages(), [60000, 60000], 'l’état des prises et les minuteurs, toutes les 60 s');
  prise.demonter(); m.demonter();
  assert.equal(E.abonnesPrises(), 0, 'démontées, elles se désabonnent');
  assert.deepEqual(w.sondages(), [], 'et les sondages s’arrêtent');
}));

// ── F2 : la compacte d'un switch que l'index ne classe pas encore ─────────────

test('F2 : avant l’index, la compacte du NAS, que l’état des prises nomme, ouvre la fiche — ou demande sur place, deux appuis, sans fiche — et ne coupe pas d’un appui', () => dans(() => {
  const fx = maison(); const w = poser(fx, { etat: etatServeur([NAS]), index: false });
  const ouvertes = [];
  const avec = monter(F.CvCard, { id: NAS, hass: w.hass(), dense: true, onOpen: (x) => ouvertes.push(x) });
  avec.appuyer(roleSwitch(avec));
  assert.deepEqual(ouvertes, [NAS], 'avec une fiche à ouvrir : elle s’ouvre, et c’est elle qui demande');
  assert.deepEqual(couper(w), [], 'la compacte ne coupe pas');
  assert.ok(!avec.texte().includes('Couper la prise ?'));
  const sans = monter(F.CvCard, { id: NAS, hass: w.hass(), dense: true, onOpen: null });
  assert.ok(sans.texte().includes('Allumé'), 'l’index n’est pas là : c’est la compacte d’un switch ordinaire');
  assert.equal(roleSwitch(sans).props['aria-label'], 'Éteindre Prise NAS (Zephyr)');
  sans.appuyer(roleSwitch(sans));
  assert.ok(sans.texte().includes('Couper la prise ?') && !sans.texte().includes('Allumé'), 'un appui : l’état devient la question');
  assert.equal(roleSwitch(sans).props['aria-label'], 'Couper Prise NAS (Zephyr)', 'et la bascule dit ce que le prochain appui fera');
  assert.deepEqual(couper(w), [], 'rien n’est coupé');
  sans.appuyer(roleSwitch(sans));
  assert.deepEqual(w.appels, ['switch.turn_off ' + NAS], 'le second appui coupe — l’ordre est explicite');
}));

test('F2 : avant l’index, la compacte demande tant que l’état n’a pas répondu — la réponse tranche —, et une erreur sans état ne garde rien', () => dans(async () => {
  // (b) Le chargement : ni index, ni état, aucune erreur.
  let fx = maison(); let w = poser(fx, { etat: null, index: false });
  let m = monter(F.CvCard, { id: PC, hass: w.hass(), dense: true, onOpen: null });
  assert.equal(E.abonnesPrises(), 1, 'la compacte suit l’état le temps que l’index arrive : la réponse tranchera');
  m.appuyer(roleSwitch(m));
  assert.ok(m.texte().includes('Couper la prise ?'), 'dans le doute, on demande');
  assert.deepEqual(couper(w), []);
  // La réponse arrive : le PC n'y est pas protégé. La compacte ne demande plus, et la question posée tombe avec elle.
  E.poserEtatPrises(etatServeur([NAS])); m.rendre();
  m.appuyer(roleSwitch(m));
  assert.deepEqual(w.appels, ['switch.turn_off ' + PC], 'état lu, PC libre : un appui coupe');
  // Un serveur d'avant la mise à jour : la lecture échoue, aucun état. On ne garde pas un switch que l'index ne connaît pas.
  fx = maison(); w = poser(fx, { etat: null, index: false, appelWS: () => Promise.reject({ code: 'unknown_command' }) });
  m = monter(F.CvCard, { id: PC, hass: w.hass(), dense: true, onOpen: null });
  await attendre(); m.rendre();
  assert.deepEqual([E.lireEtatPrises().etat, E.lireEtatPrises().erreur], [null, true]);
  m.appuyer(roleSwitch(m));
  assert.deepEqual(w.appels, ['switch.turn_off ' + PC], 'une erreur sans état : le geste d’abord, un serveur trop vieux ne gêne pas indéfiniment');
  assert.ok(!m.texte().includes('Couper la prise ?'));
}));

test('F2 : l’index lu, un switch qu’il ne classe pas n’est pas une prise — la compacte le coupe d’un appui, même sans état', () => dans(() => {
  const fx = maison(); const w = poser(fx, { etat: null });
  const m = monter(F.CvCard, { id: RAD, hass: w.hass(), dense: true, onOpen: null });
  m.appuyer(roleSwitch(m));
  assert.deepEqual(w.appels, ['switch.turn_off ' + RAD]);
  assert.ok(!m.texte().includes('Couper la prise ?'));
}));

// ── F4 : la question tombe avec la prise allumée ─────────────────────────────

test('F4 : la question de la compacte tombe quand la prise est coupée — rallumée dans les 6 s, elle ne revient pas, et l’appui suivant ne coupe pas', () => dans(({ h }) => {
  const fx = maison(); const w = poser(fx);
  const m = monter(F.CvCard, { id: NAS, hass: w.hass(), dense: true, onOpen: null });
  m.appuyer(roleSwitch(m));
  assert.ok(m.texte().includes('Couper la prise ?'));
  // Coupée ailleurs (l'application HA), puis rallumée par une automatisation : tout cela dans les 6 s.
  w.change(NAS, 'off'); m.proprietes({ hass: w.hass() });
  assert.ok(!m.texte().includes('Couper la prise ?'), 'coupée : la question n’a plus d’objet');
  h.avancer(2000);
  w.change(NAS, 'on'); m.proprietes({ hass: w.hass() });
  assert.ok(!m.texte().includes('Couper la prise ?'), 'rallumée : la question ne revient pas de nulle part');
  assert.equal(roleSwitch(m).props['aria-label'], 'Éteindre Prise NAS (Zephyr)', 'la bascule redit son geste d’avant');
  m.appuyer(roleSwitch(m));
  assert.deepEqual(couper(w), [], 'l’appui suivant n’est pas pris pour le second : il pose la question');
  assert.ok(m.texte().includes('Couper la prise ?'));
  m.appuyer(roleSwitch(m));
  assert.equal(couper(w).length, 1, 'et le suivant coupe, comme il se doit');
}));

test('F4 : la question de la carte tombe de même — coupée ailleurs puis rallumée dans les 6 s, « Couper la prise ? » ne revient pas', () => dans(({ h, d }) => {
  const fx = maison(); const w = poser(fx);
  d.suivre(() => w.vivant());
  const m = monter(F.RoomPriseCard, { id: NAS, hass: w.hass(), onOpen: () => {} });
  m.appuyer(interrupteur(m), 'onToggle');
  assert.ok(m.texte().includes('Couper la prise ?'));
  w.change(NAS, 'off'); h.intervalles()[0].f(); m.effets();
  assert.ok(!m.texte().includes('Couper la prise ?'), 'coupée ailleurs');
  h.avancer(2000);
  w.change(NAS, 'on'); h.intervalles()[0].f(); m.effets();
  assert.ok(!m.texte().includes('Couper la prise ?'), 'rallumée : la question ne revient pas');
  assert.equal(m.trouver(e => e.props && e.props['data-demande'] !== undefined).length, 0, 'ni ses boutons Annuler et Couper');
  m.appuyer(interrupteur(m), 'onToggle');
  assert.deepEqual(couper(w), [], 'un appui pose la question, il ne coupe pas');
  assert.ok(m.texte().includes('Couper la prise ?'));
}));

// ── A4 : le gros interrupteur ────────────────────────────────────────────────

test('A4 : le gros interrupteur d’une prise protégée demande — texte, nom du bouton — et le second appui coupe', () => dans(({ h, d }) => {
  const fx = maison(); const w = poser(fx);
  const m = monter(F.CvBigToggle, { id: NAS, hass: w.hass() });
  const bouton = () => m.arbre;
  assert.equal(bouton().type, 'button');
  assert.equal(bouton().props['aria-label'], undefined, 'avant : le nom est son contenu');
  assert.ok(m.texte().includes('Allumé'));
  m.appuyer(bouton());
  assert.ok(m.texte().includes('Couper la prise ?') && !m.texte().includes('Allumé'), 'un appui : le texte d’état dit la question');
  assert.equal(bouton().props['aria-label'], 'Couper Prise NAS (Zephyr)', 'le nom accessible dit le geste');
  assert.deepEqual(couper(w), [], 'rien n’est coupé');
  assert.equal(m.trouver(e => e.type === 'button').length, 1, 'pas de bouton dans le bouton');
  m.appuyer(bouton());
  assert.equal(couper(w).length, 1, 'le second appui coupe');
  assert.deepEqual(w.appels, ['switch.turn_off ' + NAS], 'l’ordre est explicite, d’après l’état affiché (F5)');
  // Échap, et six secondes.
  m.appuyer(bouton());
  assert.ok(m.texte().includes('Couper la prise ?'));
  d.emettre('keydown', { key: 'Escape' }); m.effets();
  assert.ok(!m.texte().includes('Couper la prise ?') && bouton().props['aria-label'] === undefined, 'Échap défait la demande');
  m.appuyer(bouton());
  h.avancer(5999); m.effets();
  assert.ok(m.texte().includes('Couper la prise ?'), 'à 5,999 s : elle tient');
  h.avancer(1); m.effets();
  assert.ok(!m.texte().includes('Couper la prise ?'), 'à 6 s : défaite');
  assert.equal(couper(w).length, 1, 'et rien de plus n’a été coupé');
}));

test('A4 : le gros interrupteur d’une prise libre, d’une lampe ou d’un switch qui ne mesure pas se bascule d’un appui', () => dans(() => {
  const fx = maison(); const w = poser(fx);
  for (const id of [PC, RAD]) {
    const m = monter(F.CvBigToggle, { id, hass: w.hass() });
    m.appuyer(m.arbre);
    assert.ok(!m.texte().includes('Couper la prise ?'), id);
  }
  assert.equal(w.appels.length, 2, 'les deux ont basculé');
  // Sans état lu, une prise demande : dans le doute.
  const x = poser(maison(), { etat: null });
  const m = monter(F.CvBigToggle, { id: PC, hass: x.hass() });
  m.appuyer(m.arbre);
  assert.ok(m.texte().includes('Couper la prise ?') && x.appels.length === 0);
}));

test('F2 : avant l’index, le gros interrupteur du NAS demande — l’état le nomme, ou n’a pas répondu — ; une erreur sans état, ou l’index lu, ne gardent rien', () => dans(async () => {
  // (a) L'état des prises nomme le NAS : deux appuis, comme une prise reconnue.
  let w = poser(maison(), { etat: etatServeur([NAS]), index: false });
  let m = monter(F.CvBigToggle, { id: NAS, hass: w.hass() });
  m.appuyer(m.arbre);
  assert.ok(m.texte().includes('Couper la prise ?') && m.arbre.props['aria-label'] === 'Couper Prise NAS (Zephyr)');
  assert.deepEqual(couper(w), [], 'le premier appui ne coupe pas');
  m.appuyer(m.arbre);
  assert.deepEqual(w.appels, ['switch.turn_off ' + NAS], 'le second coupe');
  // (b) Le chargement, ni état ni erreur : le PC demande aussi — et le gros interrupteur suit l'état, le temps que la réponse arrive.
  w = poser(maison(), { etat: null, index: false });
  m = monter(F.CvBigToggle, { id: PC, hass: w.hass() });
  assert.equal(E.abonnesPrises(), 1);
  m.appuyer(m.arbre);
  assert.ok(m.texte().includes('Couper la prise ?') && w.appels.length === 0);
  // Un état lu qui ne nomme pas le PC : la réponse tranche.
  E.poserEtatPrises(etatServeur([NAS])); m.rendre();
  m.appuyer(m.arbre);
  assert.deepEqual(w.appels, ['switch.turn_off ' + PC], 'état lu, PC libre : un appui coupe');
  // Un serveur d'avant la mise à jour : une erreur sans état ne garde pas un switch que l'index ne connaît pas.
  w = poser(maison(), { etat: null, index: false, appelWS: () => Promise.reject({ code: 'unknown_command' }) });
  m = monter(F.CvBigToggle, { id: PC, hass: w.hass() });
  await attendre(); m.rendre();
  m.appuyer(m.arbre);
  assert.deepEqual(w.appels, ['switch.turn_off ' + PC]);
  // L'index lu, aucun état : un radiateur sur switch n'est pas une prise, et ne s'abonne à rien.
  w = poser(maison(), { etat: null });
  m = monter(F.CvBigToggle, { id: RAD, hass: w.hass() });
  m.appuyer(m.arbre);
  assert.deepEqual(w.appels, ['switch.turn_off ' + RAD]);
  assert.equal(E.abonnesPrises(), 0);
}));

test('F4 : la question du gros interrupteur tombe quand la prise est coupée — rallumée dans les 6 s, elle ne revient pas, et l’appui suivant ne coupe pas', () => dans(({ h }) => {
  const fx = maison(); const w = poser(fx);
  const m = monter(F.CvBigToggle, { id: NAS, hass: w.hass() });
  m.appuyer(m.arbre);
  assert.ok(m.texte().includes('Couper la prise ?'));
  w.change(NAS, 'off'); m.proprietes({ hass: w.hass() });
  assert.ok(!m.texte().includes('Couper la prise ?') && m.texte().includes('Éteint'), 'coupée ailleurs');
  h.avancer(2000);
  w.change(NAS, 'on'); m.proprietes({ hass: w.hass() });
  assert.ok(!m.texte().includes('Couper la prise ?') && m.texte().includes('Allumé'), 'rallumée : la question ne revient pas');
  assert.equal(m.arbre.props['aria-label'], undefined, 'le nom accessible non plus');
  m.appuyer(m.arbre);
  assert.deepEqual(couper(w), [], 'l’appui suivant pose la question : il ne coupe pas');
  assert.ok(m.texte().includes('Couper la prise ?'));
}));

test('F5 : le gros interrupteur envoie un ordre EXPLICITE, d’après l’état affiché — une prise protégée rallumée juste avant l’appui n’est pas coupée par un `toggle`', () => dans(() => {
  // Le NAS est affiché « Éteint » (coupé il y a un instant) ; entre-temps une automatisation l'a rallumé, le relevé n'a pas suivi. Un appui = « allumer »,
  // et `toggle` aurait inversé l'état RÉEL : le NAS, allumé, aurait été coupé SANS question. `turn_on` sur une prise allumée ne fait rien.
  const fx = maison(); const w = poser(fx);
  w.change(NAS, 'off');
  const m = monter(F.CvBigToggle, { id: NAS, hass: w.hass() });
  assert.ok(m.texte().includes('Éteint'));
  m.appuyer(m.arbre);
  assert.deepEqual(w.appels, ['switch.turn_on ' + NAS], 'allumer, explicitement');
  // Et un switch ordinaire : l'ordre est le même, d'après ce qu'il montre.
  const l = poser(maison(), { etat: etatServeur([]) });
  const radiateur = monter(F.CvBigToggle, { id: RAD, hass: l.hass() });
  radiateur.appuyer(radiateur.arbre);
  assert.deepEqual(l.appels, ['switch.turn_off ' + RAD]);
}));

// ── A2 : des cartes vivantes ─────────────────────────────────────────────────

test('A2 : la carte lit le hass VIVANT, pas celui de son parent, et se redessine seule quand son capteur bouge — à 10 W près', () => dans(({ h, d }) => {
  const fx = maison(); const w = poser(fx);
  const parent = w.hass();                                  // le parent a lu « 146 W » ; l'état de la maison, lui, vit
  d.suivre(() => w.vivant());
  w.change(PC_W, '230');
  const m = monter(F.RoomPriseCard, { id: PC, hass: parent, onOpen: () => {} });
  assert.match(surface(m), /230 W$/, 'le hass vivant : 230, pas les 146 du parent');
  // Un intervalle, celui de la carte ; le capteur monte, le tic passe, la carte se redessine seule.
  assert.equal(h.intervalles().length, 1, 'la carte surveille : un intervalle');
  const avant = m.rendus;
  w.change(PC_W, '231.5');                                  // même tranche de 10 W (230) : rien à redessiner
  h.intervalles()[0].f(); m.effets();
  assert.equal(m.rendus, avant, 'à 10 W près : pas de nouveau rendu');
  assert.match(surface(m), /230 W$/);
  w.change(PC_W, '260');
  h.intervalles()[0].f(); m.effets();
  assert.ok(m.rendus > avant, 'une autre tranche : la carte se redessine');
  assert.match(surface(m), /260 W$/, '« 260 W » sans que le parent ait bougé');
}));

test('A2 : sa bascule aussi est surveillée — une carte redessinée par son parent ne lit pas un relevé où la bascule n’a pas bougé', () => dans(({ h, d }) => {
  const fx = maison(); const w = poser(fx);
  d.suivre(() => w.vivant());
  const m = monter(F.RoomPriseCard, { id: PC, hass: w.hass(), onOpen: () => {} });
  assert.match(surface(m), /En marche depuis 08:50/);
  w.change(PC, 'off', { last_changed: a(20, 40) });         // quelqu'un coupe la prise ailleurs (l'application HA)
  h.intervalles()[0].f(); m.effets();
  assert.match(surface(m), /Coupée depuis 20:40/, 'la bascule est une clé : la carte se redessine, seule');
  assert.ok(!m.texte().includes('146'), 'et ne montre plus de puissance');
}));

test('A2 : la compacte d’une prise vit de même ; celle d’un appareil qui n’est pas une prise ne pose aucun intervalle', () => dans(({ h, d }) => {
  const fx = maison(); const w = poser(fx);
  d.suivre(() => w.vivant());
  const stale = w.hass();
  w.change(PC_W, '230');
  const prise = monter(F.CvCard, { id: PC, hass: stale, dense: true, onOpen: () => {} });
  assert.match(prise.texte(), /230 W/, 'la compacte lit le hass vivant');
  assert.equal(h.intervalles().filter(i => i.ms === 2000).length, 1, 'une prise : son intervalle de 2 s');
  const autre = monter(F.CvCard, { id: RAD, hass: stale, dense: true, onOpen: () => {} });
  assert.equal(h.intervalles().filter(i => i.ms === 2000).length, 1, 'un switch qui ne mesure pas : toujours un seul — le sien n’en pose pas');
  assert.ok(autre.texte().includes('Allumé'));
  autre.demonter();
  prise.demonter();
  assert.equal(h.intervalles().length, 0, 'démontées, elles ne laissent rien tourner');
}));

test('A2 : l’en-tête d’Objets › Prises reçoit un hass vivant et se redessine quand une puissance bouge', () => dans(({ h, d }) => {
  const fx = maison(); const w = poser(fx);
  d.suivre(() => w.vivant());
  const prises = [{ id: NAS, puissance: 'sensor.prise_nas_zephyr_power' }, { id: PC, puissance: PC_W }];
  const m = monter(F.EntetePrisesVive, { hass: w.hass(), titre: 'Prises', prises });
  const watts = () => comptePrises(m.arbre.props.prises, m.arbre.props.hass.states).watts;
  assert.equal(watts(), 150, '4 W et 146 W');
  assert.equal(h.intervalles().length, 1, 'un abonnement, pour toutes les prises visibles');
  w.change(PC_W, '246');
  h.intervalles()[0].f(); m.effets();
  assert.equal(watts(), 250, '« 250 W en ce moment », sans que l’écran entier bouge');
  const sans = monter(F.EntetePrisesVive, { hass: w.hass(), titre: 'Prises', prises: [] });
  assert.equal(h.intervalles().length, 1, 'aucune prise visible : rien de plus à surveiller');
  sans.demonter(); m.demonter();
}));

/* `useHass` lui-même, par une sonde : un composant qui rend ce que le crochet lui rend. */
const Sonde = ({ cles, bruyantes = null }) => ({ type: 'sonde', props: { children: null, hass: F.useHass(cles, bruyantes) } });

test('A2 : sans clé à surveiller, useHass ne pose ni relevé ni intervalle, et rend le hass du moment — lu au rendu', () => dans(({ h, d }) => {
  let n = 0;
  d.suivre(() => ({ states: {}, numero: ++n }));
  const m = monter(Sonde, { cles: [] });
  assert.equal(h.intervalles().length, 0, 'aucun intervalle de 2 s pour rien');
  const premier = m.arbre.props.hass.numero;
  m.rendre();
  assert.ok(m.arbre.props.hass.numero > premier, 'chaque rendu lit le relevé du moment : aucun tic ne tient une copie à jour');
  // Des valeurs qui ne sont pas des clés — vides, nulles, des nombres — ne surveillent rien non plus (05/10, suite du point 10b).
  const faux = monter(Sonde, { cles: ['', null, 5, undefined] });
  assert.equal(h.intervalles().length, 0, 'une configuration abîmée ne pose pas d’intervalle, et ne lève rien');
  assert.ok(faux.arbre.props.hass.numero > 0);
}));

test('A2 : avec des clés, useHass surveille — un intervalle de 2 s, la signature arrondie à 10 W pour une clé bruyante — et suit les clés qui arrivent', () => dans(({ h, d }) => {
  const S = { 'switch.x': { state: 'on', last_updated: 't0' }, 'sensor.x_power': { state: '146', last_updated: 't0', attributes: { unit_of_measurement: 'W', device_class: 'power' } } };
  let n = 0;
  d.suivre(() => ({ states: JSON.parse(JSON.stringify(S)), connected: true, numero: ++n }));
  const m = monter(Sonde, { cles: ['switch.x', 'sensor.x_power'], bruyantes: ['sensor.x_power'] });
  assert.deepEqual(h.intervalles().map(i => i.ms), [2000]);
  const avant = m.rendus;
  S['sensor.x_power'].state = '148'; S['sensor.x_power'].last_updated = 't1';    // même tranche de 10 W (150) : rien
  h.intervalles()[0].f(); m.effets();
  assert.equal(m.rendus, avant, 'une clé bruyante : à 10 W près, `last_updated` ne compte pas');
  m.rendre();                                                                     // le parent redessine la carte pour une autre raison
  assert.equal(m.arbre.props.hass.states['sensor.x_power'].state, '148', 'mais le relevé que rend le crochet, lui, est tenu à jour à chaque tic : le rendu suivant le lit');
  S['switch.x'].state = 'off'; S['switch.x'].last_updated = 't2';                 // une bascule : toute valeur compte
  h.intervalles()[0].f(); m.effets();
  assert.ok(m.rendus > avant, 'une bascule qui change redessine');
  assert.equal(m.arbre.props.hass.states['switch.x'].state, 'off');
  // Des clés qui arrivent plus tard (l'index de la découverte, un capteur retrouvé) relancent l'effet : un intervalle, jamais deux.
  const tard = monter(Sonde, { cles: [] });
  assert.equal(h.intervalles().length, 1);
  tard.proprietes({ cles: ['switch.x'] });
  assert.equal(h.intervalles().length, 2, 'la liste n’est plus vide : elle se surveille');
  tard.proprietes({ cles: ['switch.x', 'sensor.x_power'] });
  assert.equal(h.intervalles().length, 2, 'un autre jeu de clés remplace l’intervalle, il ne s’ajoute pas');
  tard.proprietes({ cles: [] });
  assert.equal(h.intervalles().length, 1, 'redevenue vide : l’intervalle s’arrête');
  tard.demonter(); m.demonter();
  assert.equal(h.intervalles().length, 0);
}));

// ── A1 : la recherche ────────────────────────────────────────────────────────

/* `suivi` : une carte de prise est montée quelque part, le cache de l'état des prises est relu — il compte. Sans elle, personne ne le relit (F5). */
function chercher(texte, { etat = etatServeur(), droits = ['inter'], modifier = null, suivi = true, index = true } = {}) {
  const fx = maison(); const w = poser(fx, { etat, index });
  if (suivi) E.abonnerPrises();
  if (modifier) modifier(w);
  const nav = [], fermees = [];
  const memoire = new Map();
  globalThis.sessionStorage = { setItem: (k, v) => { memoire.set(k, v); }, getItem: (k) => (memoire.has(k) ? memoire.get(k) : null) };
  const sansAccent = texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const resultats = F.appareilsRecherche(sansAccent, w.hass(), { onNav: (v) => nav.push(v), droits });
  return { resultats, nav, memoire, w, valider: (r) => r.act(() => fermees.push(1)), fermees };
}

test('A1 : une prise PROTÉGÉE et allumée ne se coupe pas d’un appui sur Entrée — elle mène à Objets, sur le filtre Prises', () => {
  const c = chercher('nas');
  assert.equal(c.resultats.length, 1);
  const r = c.resultats[0];
  assert.equal(r.run, false, 'plus de « Basculer »');
  c.valider(r);
  assert.deepEqual(c.w.appels, [], 'rien n’est coupé');
  assert.deepEqual(c.nav, ['objets']);
  assert.equal(c.memoire.get('loggia-objets-filtre'), 'prises', 'le filtre Prises, par la mémoire de session d’Objets');
  assert.equal(c.fermees.length, 1, 'la recherche se ferme');
});

test('A1 : une protection pas encore lue vaut une protection — la recherche ne coupe pas non plus', () => {
  const c = chercher('pc bureau', { etat: null });
  assert.equal(c.resultats[0].run, false);
  c.valider(c.resultats[0]);
  assert.deepEqual(c.w.appels, []);
  assert.deepEqual(c.nav, ['objets']);
});

test('A1 : une prise libre se bascule comme avant ; allumer une prise coupée reste direct, protégée ou non', () => {
  const libre = chercher('pc bureau');
  assert.equal(libre.resultats[0].run, true);
  assert.equal(libre.resultats[0].runLabel, 'Basculer');
  libre.valider(libre.resultats[0]);
  assert.deepEqual(libre.w.appels, ['switch.turn_off ' + PC], 'l’ordre est explicite, d’après l’état affiché (F5)');
  assert.deepEqual(libre.nav, []);
  const eteinte = chercher('nas', { modifier: (w) => w.change(NAS, 'off') });
  assert.equal(eteinte.resultats[0].run, true, 'coupée, même protégée : le geste d’allumer est direct');
  eteinte.valider(eteinte.resultats[0]);
  assert.deepEqual(eteinte.w.appels, ['switch.turn_on ' + NAS]);
  const radiateur = chercher('radiateur');
  radiateur.valider(radiateur.resultats[0]);
  assert.deepEqual(radiateur.w.appels, ['switch.turn_off ' + RAD], 'un switch qui ne mesure pas : le geste d’abord');
});

// ── F5 : la recherche ne s'abonne à rien — ce qu'elle lit peut être vieux ─────

test('F5 : un cache que PERSONNE ne suit vaut une protection inconnue — Entrée mène à Objets, même pour une prise libre ; suivi, le cache compte', () => {
  // Aucune carte de prise n'est montée : personne ne relit `loggia/prises/etat`, le cache est celui de la dernière fois — il peut dater de la veille.
  const seul = chercher('pc bureau', { suivi: false });
  assert.equal(E.abonnesPrises(), 0);
  assert.equal(seul.resultats[0].run, false, 'plus de « Basculer »');
  seul.valider(seul.resultats[0]);
  assert.deepEqual(seul.w.appels, [], 'rien n’est coupé');
  assert.deepEqual(seul.nav, ['objets']);
  assert.equal(seul.memoire.get('loggia-objets-filtre'), 'prises', 'où sa carte s’abonne, lit l’état, et demande');
  // Le même PC avec une carte de prise montée : le cache est relu, il dit « libre ».
  const suivi = chercher('pc bureau', { suivi: true });
  assert.equal(E.abonnesPrises(), 1);
  assert.equal(suivi.resultats[0].run, true);
  // Éteinte, une prise s'allume sans question, suivie ou non ; un switch ordinaire (l'index lu) n'attend aucun cache.
  const eteinte = chercher('pc bureau', { suivi: false, modifier: (w) => w.change(PC, 'off') });
  assert.equal(eteinte.resultats[0].run, true);
  eteinte.valider(eteinte.resultats[0]);
  assert.deepEqual(eteinte.w.appels, ['switch.turn_on ' + PC]);
  const radiateur = chercher('radiateur', { suivi: false });
  assert.equal(radiateur.resultats[0].run, true);
  assert.equal(chercher('nas', { suivi: false }).resultats[0].run, false, 'le NAS, protégé dans le cache même : on ne se fie pas à un cache que personne ne relit');
});

test('F5 : la recherche envoie un ordre EXPLICITE, d’après l’état qu’elle affiche — une prise protégée rallumée juste avant Entrée n’est pas coupée par un `toggle`', () => {
  // Le NAS est affiché « éteint » (coupé il y a un instant) : Entrée l'ALLUME, sans question. Rallumé entre-temps par une automatisation, `toggle` l'aurait coupé.
  const c = chercher('nas', { modifier: (w) => w.change(NAS, 'off') });
  assert.equal(c.resultats[0].run, true, 'affichée éteinte : le geste d’allumer est direct');
  c.w.change(NAS, 'on');                                   // rallumée par une automatisation avant Entrée
  c.valider(c.resultats[0]);
  assert.deepEqual(c.w.appels, ['switch.turn_on ' + NAS], '« allumer », explicitement : sur une prise déjà allumée, cela ne coupe rien');
  // Et l'inverse : affichée allumée, coupée ailleurs avant Entrée — l'ordre reste « couper », il ne la rallume pas.
  const libre = chercher('pc bureau');
  libre.w.change(PC, 'off');
  libre.valider(libre.resultats[0]);
  assert.deepEqual(libre.w.appels, ['switch.turn_off ' + PC]);
});

// ── F2 : la recherche avant l'index ───────────────────────────────────────────

test('F2 : avant l’index, la recherche ne coupe pas le NAS d’un appui — l’état le nomme, ou n’a pas répondu — ; une erreur sans état, ou l’index lu, ne gardent rien', async () => {
  // (a) L'état des prises, suivi, nomme le NAS : Entrée mène à Objets, qui s'affichera quand l'index sera là.
  const a = chercher('nas', { index: false });
  assert.equal(a.resultats[0].run, false);
  a.valider(a.resultats[0]);
  assert.deepEqual(a.w.appels, []);
  assert.deepEqual(a.nav, ['objets']);
  // Il n'est pas protégé pour autant dans l'état lu : le PC, switch ordinaire à ce stade, se bascule.
  const pcLu = chercher('pc bureau', { index: false });
  assert.equal(pcLu.resultats[0].run, true, 'état lu, PC non nommé');
  // (b) Le chargement : ni état, ni erreur, ni index.
  const b = chercher('pc bureau', { index: false, etat: null });
  assert.equal(b.resultats[0].run, false);
  b.valider(b.resultats[0]);
  assert.deepEqual(b.w.appels, []);
  assert.deepEqual(b.nav, ['objets']);
  // Une erreur sans état (un composant d'avant la mise à jour) : un switch que l'index ne connaît pas n'est pas gardé.
  const w = poser(maison(), { etat: null, index: false, appelWS: () => Promise.reject({ code: 'unknown_command' }) });
  E.abonnerPrises();
  await attendre();
  assert.deepEqual([E.lireEtatPrises().etat, E.lireEtatPrises().erreur], [null, true]);
  const r = F.appareilsRecherche('pc bureau', w.hass(), { onNav: () => {}, droits: [] });
  assert.equal(r[0].run, true, 'un serveur trop vieux ne gêne pas indéfiniment');
  // L'index lu, aucun état : un radiateur sur switch n'est pas une prise.
  assert.equal(chercher('radiateur', { etat: null }).resultats[0].run, true);
});

test('A1 : le switch du pont Zigbee2MQTT ne se bascule JAMAIS d’ici — il mène à Paramètres › Interrupteurs', () => {
  const c = chercher('zigbee');
  assert.equal(c.resultats.length, 1);
  assert.equal(c.resultats[0].run, false);
  c.valider(c.resultats[0]);
  assert.deepEqual(c.w.appels, [], 'l’appairage ne s’ouvre pas d’un appui : il en demande deux (§ 9)');
  assert.deepEqual(c.nav, ['parametres']);
  assert.equal(c.memoire.get('loggia-par-section'), 'inter', 'la section Interrupteurs, par la mémoire des Paramètres');
  // Allumé, de même.
  const allume = chercher('zigbee', { modifier: (w) => w.change(PONT, 'on') });
  allume.valider(allume.resultats[0]);
  assert.deepEqual(allume.w.appels, []);
  // Sans le droit d'ouvrir Interrupteurs, il ne se propose pas : une section interdite se tairait de même.
  const sansDroit = chercher('zigbee', { droits: ['vues'] });
  assert.deepEqual(sansDroit.resultats, [], 'ni bascule, ni page vide');
});

test('B10 : une SIRÈNE (un switch) ne se bascule JAMAIS d’ici — Entrée mène à Sécurité, où elle vit', () => {
  const c = chercher('sirene');
  assert.equal(c.resultats.length, 1);
  assert.equal(c.resultats[0].sub, SIRENE);
  assert.equal(c.resultats[0].run, false, 'plus de « Basculer »');
  c.valider(c.resultats[0]);
  assert.deepEqual(c.w.appels, [], 'la sirène ne sonne pas');
  assert.deepEqual(c.nav, ['securite']);
  assert.equal(c.fermees.length, 1, 'la recherche se ferme');
  // Déjà sonnante, de même : un appui ne la coupe pas non plus — elle se coupe dans Sécurité.
  const allumee = chercher('sirene', { modifier: (w) => w.change(SIRENE, 'on') });
  assert.equal(allumee.resultats[0].run, false);
  allumee.valider(allumee.resultats[0]);
  assert.deepEqual(allumee.w.appels, []);
  assert.deepEqual(allumee.nav, ['securite']);
  // Sécurité n'est pas une section des Paramètres : aucun droit n'y est demandé, la sirène se propose à tous.
  const sansDroit = chercher('sirene', { droits: [] });
  assert.equal(sansDroit.resultats.length, 1);
  assert.equal(sansDroit.resultats[0].run, false);
  // Et les autres switch gardent leur geste : une prise libre se bascule encore.
  const libre = chercher('pc bureau');
  libre.valider(libre.resultats[0]);
  assert.deepEqual(libre.w.appels, ['switch.turn_off ' + PC]);
});

// ── F3 : la ligne d'un switch épinglé ────────────────────────────────────────

const ligne = (id, hass) => monter(F.LigneEntite, { id, hass, nom: 'Sortie' });

test('F3 : la ligne épinglée d’une prise protégée — la sortie 2 d’une multiprise — demande avant de couper : la question à la place du nom, deux appuis', () => dans(({ h, d }) => {
  const fx = maison(); const w = poser(fx, { etat: etatServeur([SORTIE_2]) });
  const m = ligne(SORTIE_2, w.hass());
  assert.ok(m.texte().includes('Sortie') && !m.texte().includes('Couper la prise ?'));
  assert.equal(roleSwitch(m).props['aria-label'], 'Sortie');
  m.appuyer(roleSwitch(m));
  assert.ok(m.texte().includes('Couper la prise ?') && !m.texte().includes('Sortie'), 'un appui : la question prend la place du nom');
  assert.equal(roleSwitch(m).props['aria-label'], 'Couper Sortie', 'et la bascule dit ce que le prochain appui fera');
  assert.deepEqual(couper(w), [], 'rien n’est coupé');
  m.appuyer(roleSwitch(m));
  assert.deepEqual(w.appels, ['switch.turn_off ' + SORTIE_2], 'le second appui coupe — l’ordre est explicite');
  // Six secondes, et Échap, défont la question.
  const n = ligne(SORTIE_2, w.hass());
  n.appuyer(roleSwitch(n));
  h.avancer(5999); n.effets();
  assert.ok(n.texte().includes('Couper la prise ?'), 'à 5,999 s : elle tient');
  h.avancer(1); n.effets();
  assert.ok(!n.texte().includes('Couper la prise ?') && n.texte().includes('Sortie'), 'à 6 s : défaite');
  n.appuyer(roleSwitch(n));
  d.emettre('keydown', { key: 'Escape' }); n.effets();
  assert.ok(!n.texte().includes('Couper la prise ?'), 'Échap la défait');
  assert.equal(couper(w).length, 1, 'et rien de plus n’a été coupé');
}));

test('F3 : la ligne d’une prise libre, d’une prise coupée ou d’un switch ordinaire se bascule d’un appui — et ne s’abonne à rien si ce n’est pas une prise', () => dans(() => {
  const fx = maison(); const w = poser(fx, { etat: etatServeur([NAS]) });
  const libre = ligne(PC, w.hass());
  libre.appuyer(roleSwitch(libre));
  assert.deepEqual(w.appels, ['switch.turn_off ' + PC], 'libre : un appui coupe, sans question');
  assert.ok(!libre.texte().includes('Couper la prise ?'));
  const eteinte = ligne(SORTIE_1, w.hass());
  eteinte.appuyer(roleSwitch(eteinte));
  assert.deepEqual(w.appels.slice(1), ['switch.turn_on ' + SORTIE_1], 'coupée : elle s’allume sans question');
  libre.demonter(); eteinte.demonter();
  const x = poser(maison(), { etat: etatServeur([NAS]) });
  const radiateur = ligne(RAD, x.hass());
  radiateur.appuyer(roleSwitch(radiateur));
  assert.deepEqual(x.appels, ['switch.turn_off ' + RAD], 'un switch qui ne mesure pas : le geste d’abord');
  assert.equal(E.abonnesPrises(), 0, 'et il ne suit pas l’état des prises');
  // Sans état lu, une prise reconnue demande : dans le doute.
  const y = poser(maison(), { etat: null });
  const inconnue = ligne(PC, y.hass());
  inconnue.appuyer(roleSwitch(inconnue));
  assert.ok(inconnue.texte().includes('Couper la prise ?') && y.appels.length === 0);
}));

test('F4 : la question de la ligne tombe quand la prise est coupée — rallumée dans les 6 s, elle ne revient pas, et l’appui suivant ne coupe pas', () => dans(({ h }) => {
  const fx = maison(); const w = poser(fx, { etat: etatServeur([SORTIE_2]) });
  const m = ligne(SORTIE_2, w.hass());
  m.appuyer(roleSwitch(m));
  assert.ok(m.texte().includes('Couper la prise ?'));
  w.change(SORTIE_2, 'off'); m.proprietes({ hass: w.hass() });
  assert.ok(!m.texte().includes('Couper la prise ?'), 'coupée ailleurs');
  h.avancer(2000);
  w.change(SORTIE_2, 'on'); m.proprietes({ hass: w.hass() });
  assert.ok(!m.texte().includes('Couper la prise ?') && m.texte().includes('Sortie'), 'rallumée : la question ne revient pas');
  m.appuyer(roleSwitch(m));
  assert.deepEqual(couper(w), [], 'l’appui suivant pose la question : il ne coupe pas');
  assert.ok(m.texte().includes('Couper la prise ?'));
}));

// ── A5 : « Ajouter une carte » ───────────────────────────────────────────────

test('A5 : le composeur range les prises sous Prises, comme Objets — les autres switch sous IoT', () => {
  const fx = maison(); const w = poser(fx);
  const S = w.hass().states;
  assert.deepEqual(F.filtresEntite(S, NAS), ['prises'], 'le NAS');
  assert.deepEqual(F.filtresEntite(S, PC), ['prises'], 'le PC');
  assert.deepEqual(F.filtresEntite(S, RAD), ['iot'], 'un switch qui ne mesure pas');
  assert.deepEqual(F.filtresEntite(S, PONT), ['iot'], 'le pont, qui n’a pas de carte, reste sous IoT s’il est ajouté à la main');
  assert.deepEqual(F.filtresEntite(S, 'light.salon'), ['lumieres']);
  assert.deepEqual(F.filtresEntite(S, 'sensor.prise_pc_bureau_atlas_power'), ['capteurs']);
  // Sans index (le chargement), rien ne mesure : tout switch est de l'IoT — la règle d'Objets, pas une autre.
  const nu = poser(maison(), { index: false });
  assert.deepEqual(F.filtresEntite(nu.hass().states, NAS), ['iot']);
});

// ── Audit de l'écran des prises (19/10) ─────────────────────────────────────

const APP_SRC = (await import('node:fs')).readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const corpsDe = (debut) => { const i = APP_SRC.indexOf(debut); return APP_SRC.slice(i, APP_SRC.indexOf('\n}\n', i)); };

test('audit, point 3 : une prise `unknown` ne se commande ni du gros interrupteur, ni de sa ligne épinglée, ni de la recherche', () => dans(() => {
  const fx = maison(); const w = poser(fx);
  w.change(PC, 'unknown');
  const gros = monter(F.CvBigToggle, { id: PC, hass: w.hass() });
  assert.equal(gros.arbre.props.disabled, true, 'le gros interrupteur est inerte');
  assert.ok(gros.texte().includes('Indisponible'));
  const l = ligne(PC, w.hass());
  assert.equal(roleSwitch(l), undefined, 'la ligne n’a plus de bascule');
  assert.equal(l.trouver(e => e.type && e.type.name === 'FicheIndispo').length, 1, 'elle dit « Indisponible »');
  assert.deepEqual(w.appels, [], 'rien n’est parti');
  assert.equal(chercher('pc bureau', { modifier: (x) => x.change(PC, 'unknown') }).resultats.length, 0, 'la recherche ne propose pas une prise muette');
}));

test('audit, point 12 : Entrée sur une prise gardée ouvre SA fiche par-dessus la vue — sans fiche à ouvrir, Objets › Prises comme avant', () => {
  const fx = maison(); const w = poser(fx);
  E.abonnerPrises();
  const ouvertes = [], fermees = [];
  const r = F.appareilsRecherche('nas', w.hass(), { onNav: () => assert.fail('pas de navigation'), droits: [], onFiche: (id) => ouvertes.push(id) });
  assert.equal(r[0].run, false);
  r[0].act(() => fermees.push(1));
  assert.deepEqual([ouvertes, fermees.length, w.appels], [[NAS], 1, []], 'la fiche, qui demande ; rien n’est coupé');
  const hote = APP_SRC.slice(APP_SRC.indexOf('const [fichePrise, setFichePrise] = useState(null);'));
  assert.ok(hote.includes('onFiche={setFichePrise} />}') && hote.includes('{fichePrise && <FichePrise id={fichePrise} hass={getHass()} onClose={() => setFichePrise(null)} />}'));
});

test('audit, point 13 : « Couper la prise ? » s’annonce — une région polie, montée AVANT la question, sur la carte, la compacte et le gros interrupteur', () => dans(() => {
  const fx = maison(); const w = poser(fx);
  const vive = (m) => m.trouver(e => e.props && e.props['aria-live'] === 'polite');
  const carte = monter(F.RoomPriseCard, { id: NAS, hass: w.hass(), onOpen: () => {} });
  assert.equal(vive(carte).length, 1);
  assert.equal(texteDe(vive(carte)[0]), '', 'vide avant');
  carte.appuyer(interrupteur(carte), 'onToggle');
  assert.equal(texteDe(vive(carte)[0]), 'Couper la prise ?');
  const gros = monter(F.CvBigToggle, { id: NAS, hass: w.hass() });
  gros.appuyer(gros.arbre);
  assert.equal(texteDe(vive(gros)[0]), 'Couper la prise ?');
  const compacte = corpsDe('\nfunction CvCard(');
  assert.ok(compacte.includes("<span className=\"o-vh\" aria-live=\"polite\">{enDemande ? tr('Couper la prise ?') : ''}</span>"), 'la compacte');
}));

test('audit, point 9 : Échap défait la demande de la carte large — à la capture, arrêté', () => dans(({ d }) => {
  const fx = maison(); const w = poser(fx);
  const m = monter(F.RoomPriseCard, { id: NAS, hass: w.hass(), onOpen: () => {} });
  m.arbre.ref.current = { querySelector: () => null };
  m.appuyer(interrupteur(m), 'onToggle');
  assert.ok(m.trouver(e => e.props && e.props['data-demande'] !== undefined).length);
  let arrete = 0;
  d.emettre('keydown', { key: 'Escape', stopPropagation: () => { arrete += 1; } }); m.effets();
  assert.equal(m.trouver(e => e.props && e.props['data-demande'] !== undefined).length, 0, 'la question est défaite');
  assert.equal(arrete, 1, 'l’événement s’arrête : une feuille autour ne se ferme pas');
  assert.deepEqual(couper(w), []);
}));

test('audit, point 2 : les notifications disent les cycles que le serveur suit ; sans eux, l’ancien capteur', () => {
  const S = { 'switch.lv': { entity_id: 'switch.lv', state: 'on', attributes: { friendly_name: 'Prise lave-vaisselle' } } };
  const n = F.deriveNotifs({ states: S }, [{ id: 'switch.lv', type: 'lv', debut: '2026-10-13T20:10:00+02:00' }]);
  const c = n.filter(x => x.k.indexOf('cycle:') === 0);
  assert.deepEqual(c.map(x => [x.k, x.t, x.m]), [['cycle:switch.lv:2026-10-13T20:10:00+02:00', 'Lave-vaisselle', 'Cycle en cours']]);
  assert.ok(!n.some(x => x.k === 'lv:cycle'), 'l’ancien seuil se tait');
  assert.deepEqual(F.deriveNotifs({ states: S }, []).filter(x => /cycle/.test(x.k)), [], 'suivi, au repos : rien');
  const accueil = APP_SRC.slice(APP_SRC.indexOf('function Dashboard('), APP_SRC.indexOf('const nEnCours = momentRows.length;'));
  assert.ok(accueil.includes('if (cyclesPrises) cyclesPrises.forEach(') && accueil.includes('else if (mLv && mLv.active'), '« En ce moment » : le serveur d’abord, l’ancien chemin en repli');
  assert.ok(APP_SRC.includes('cyclesPrises={cyclesPrises} />}') && APP_SRC.includes('const lecturePrises = useLecturePrises(!!hass);'), 'App les lit une fois, et les passe à l’Accueil');
  assert.ok(!APP_SRC.includes("+ 'min'; };"), 'la durée « 1h05min », non traduite, est partie');
});

test('audit, point 4 : le bouton lumières d’une pièce ne coupe pas un switch gardé qu’on y a désigné', () => {
  const b = APP_SRC.slice(APP_SRC.indexOf('  const toggleRoomLights = (name) => {'), APP_SRC.indexOf('  // ── Volets et clim par pièce'));
  assert.ok(b.includes("gardeDeSwitch(lecture, l.id, { reconnue: priseDe(S, l.id).prise, indexLu: indexLu() })"));
  assert.ok(b.includes("const ids = (svc === 'turn_off' ? libres : ms).map(l => l.id);"));
});

test('audit : un minuteur refusé sur un appareil éteint se dit ; la rangée générique ne propose pas « +30 min » à un appareil éteint', async () => {
  const { texteRefus } = await import('../src/refus.js');
  assert.equal(texteRefus({ code: 'minuteur_deja_eteint', message: 'appareil deja eteint : switch.x' }), 'L’appareil est déjà éteint.');
  // ASSERTION MODIFIÉE (audit des prises, 19/10) : la rangée du minuteur vit dans ficheswitch.jsx, chargée à la demande.
  const SW = (await import('node:fs')).readFileSync(new URL('../src/ficheswitch.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const d = SW.indexOf('\nexport function RangeeMinuteur(');
  assert.ok(d >= 0, 'la rangée existe');
  const r = SW.slice(d, SW.indexOf('\n}\n', d));
  assert.ok(r.includes("const eteint = !!st && (st.state === 'off' || st.state === 'standby');") && r.includes('{!mort && !eteint && <FicheBouton icone="clock"'));
});
