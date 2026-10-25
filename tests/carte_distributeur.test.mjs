/* TEST AJOUTÉ (étape 2 IoT, 19/10 ; sa maquette « Cartes IoT », 1a ; I5, I6, I8, I10, I12, § 6) — la carte du distributeur, large,
 * étroite et compacte.
 *
 * Ces tests JOUENT la carte (tests/crochets.mjs) : on la monte sur un `hass`, on lit ce qu'elle dessine — la plaque, la phrase, le
 * chiffre nommé, sa puce —, on appuie. Sous `?carte_distributeur`, App.jsx exporte la carte et sa compacte — le fichier n'est pas
 * touché. Le serveur (`loggia/distributeurs/etat`) est doublé ; l'heure est celle de la démo, lundi 19/10/2026, 18:20. Ce qui est
 * garanti :
 *  - I5, I6 : la grille commune (`o-gabarit`) ; le chiffre NOMMÉ — le réservoir, « Réservoir » dessous —, en grand dans la rangée
 *    du milieu (carte large) et en haut à droite (carte étroite) ; la surface dit le nom, la phrase et le réservoir ;
 *  - § 6 : la phrase du distributeur, son encre — le gris d'un jour ordinaire, l'ambre sous 15 % ou sur une anomalie, le rouge et le
 *    liseré qui respire d'un appareil muet ;
 *  - I8 : la plaque ambre (`--o-piece-ambre`), sans lavis ; grise quand l'appareil ne répond plus ;
 *  - I10 : UNE puce, « Distribuer 12 g » — `select_option` START, un service explicite —, et plus de « Rempli » sur la carte ;
 *  - la leçon du point 1 de l'étape 1 : deux appuis rapprochés — sur la carte, sur la compacte, de l'une à l'autre — ne font qu'UNE
 *    ration ; la puce reste sur son geste, choisie, sans rien faire, puis revient ;
 *  - I12 : la compacte garde sa disposition et prend la phrase, le réservoir à droite et son mini « Distribuer ». */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

import { monter, horlogeFausse, documentFaux } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?carte_distributeur')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?carte_distributeur'.length), ctx);",
  // ASSERTION MODIFIÉE (étape 2 IoT, tâche 4, 19/10 ; I21) : la coquille de la popup (`FicheDistributeur`) s'exporte aussi, pour sa plaque et sa sous-ligne.
  "  return { ...r, source: String(r.source) + ';export { CarteDistributeur, FicheDistributeur };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?carte_distributeur', import.meta.url).href);
const E = await import('../src/distributeuretat.js');
const { reglerPartage } = await import('../src/optimiste.js');

const T = new Date(2026, 9, 19, 18, 20).getTime();
const a = (j, h, m) => new Date(2026, 9, 19 + j, h, m).getTime();
const iso = (t) => new Date(t).toISOString();
const st = (id, state, attributes = {}, depuis = iso(a(0, 14, 20))) => ({ entity_id: id, state, last_changed: depuis, last_updated: depuis, attributes });

/* La maison type : un distributeur sous Zigbee2MQTT — un `select` START, sa taille de ration (2 portions de 6 g), son compteur du
 * jour, son erreur —, un bac tenu par une aide `input_number` (450 g sur 1 500), deux automatisations de repas (07:30 et 19:00
 * allumée ; 12:30 en semaine, coupée). */
const FEED = 'select.distributeur_feed', TAILLE = 'number.distributeur_serving_size', POIDS = 'number.distributeur_portion_weight';
const GJOUR = 'sensor.distributeur_weight_per_day', ERREUR = 'binary_sensor.distributeur_error', BAC = 'input_number.croquettes_reservoir';
const MATIN = 'automation.croquettes_matin_et_soir', MIDI = 'automation.croquettes_du_midi';
const META = new Map([FEED, TAILLE, POIDS, GJOUR, ERREUR].map(id => [id, { deviceId: 'dev1', platform: 'mqtt', device: 'Distributeur' }]));
const CFG = { haid: FEED, haids: { reservoir: BAC } };
function maison() {
  return {
    [FEED]: st(FEED, 'unknown', { friendly_name: 'Distributeur Feed', options: ['START'] }),
    [TAILLE]: st(TAILLE, '2', { min: 1, max: 10, step: 1 }),
    [POIDS]: st(POIDS, '6', { min: 1, max: 20, step: 1, unit_of_measurement: 'g' }),
    [GJOUR]: st(GJOUR, '24', { unit_of_measurement: 'g' }, iso(a(0, 7, 30))),
    [ERREUR]: st(ERREUR, 'off', { device_class: 'problem' }),
    [BAC]: st(BAC, '450', { min: 0, max: 1500, step: 1, unit_of_measurement: 'g' }),
    [MATIN]: st(MATIN, 'on', { friendly_name: 'Croquettes matin et soir' }),
    [MIDI]: st(MIDI, 'off', { friendly_name: 'Croquettes du midi' }),
  };
}
const auto = (entity_id, nom, etat, heures, jours = null) => ({ entity_id, nom, etat, heures, jours, conditionnel: false, portions: null, declencheurs: heures.map(heure => ({ type: 'heure', heure })), pilotable: true, modifiable: false, indice: null, dernier: null });
const ETAT = () => ({
  source: 'automatisations',
  sources: { programme: { presente: false, active: false }, automatisations: { presente: true, active: true }, loggia: { presente: false, active: false } },
  programme: { source: 'aqara', connu: true, presente: false, active: false, lisible: false, mode: 'manuel', note: 'mode_manuel', repas: [] },
  automatisations: [auto(MATIN, 'Croquettes matin et soir', 'on', ['07:30', '19:00']), auto(MIDI, 'Croquettes du midi', 'off', ['12:30'], [0, 1, 2, 3, 4])],
  planning: { appareil: null, repas: [] }, peutPlanifier: false, commande: { domaine: 'select', quantite: false, min: null, max: null, pas: null },
  journal: [],
});
/* La maison doublée : un `hass` dont chaque lecture est un objet neuf, les services notés ; le serveur de Loggia rend ce que le test
 * pose (`etat`, ou rien : `muet`). */
function poser({ retouche = null, etat = ETAT(), muet = false } = {}) {
  const courants = maison();
  if (retouche) retouche(courants);
  setLoggiaState({ index: { entityMeta: META, deviceMeta: new Map(), areaList: [], areaNameOf: () => null }, ent: { feeder: CFG }, cfg: {}, resolved: {} });
  const appels = [];
  const serveur = { callWS: (msg) => (muet ? Promise.reject({ code: 'unknown_command' }) : Promise.resolve(msg.type === 'loggia/distributeurs/etat' ? JSON.parse(JSON.stringify(etat)) : null)) };
  E.reglerDistributeurEtat({ hass: serveur });
  const hass = () => ({ ...serveur, user: { is_admin: true }, states: Object.fromEntries(Object.entries(courants).map(([k, v]) => [k, { ...v, attributes: { ...v.attributes } }])),
    callService: (d, s, data, cible) => { appels.push([d + '.' + s, (cible && cible.entity_id) || (data && data.entity_id), (data && data.option) || (data && data.value)].filter(x => x != null).join(' ')); return Promise.resolve(); } });
  return { appels, courants, hass };
}
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  const vraiNow = Date.now;
  h.installer(); d.installer();
  globalThis.document.documentElement = { classList: { contains: () => false } };
  Date.now = () => T;
  reglerPartage();
  try { return await fn({ h, d }); } finally { reglerPartage(); Date.now = vraiNow; h.restaurer(); d.restaurer(); setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const attendre = () => new Promise(r => setImmediate(r));
const de = (m, nom) => m.trouver(e => e.type && e.type.name === nom)[0];
const classe = (m, c) => m.trouver(e => e.props && typeof e.props.className === 'string' && e.props.className.split(' ').indexOf(c) >= 0)[0];
const phrase = (m) => classe(m, 'o-gab-phrase');
const plaque = (m) => m.trouver(e => e.props && e.props.style && e.props.style.width === 38)[0];
const boutons = (m) => m.trouver(e => e.type === 'button' && /^Distribuer/.test(e.props['aria-label'] || ''));
/* La carte : `CarteDistributeur` lit sa vue (ses crochets), puis rend `RoomFeederCard`, que le harnais ne rend pas — on la monte à
 * son tour sur ce qu'elle reçoit. `rendre()` relit la vue et redonne ses props à la carte, comme React le ferait. */
async function carte(w, chip = false) {
  const vue = monter(F.CarteDistributeur, { chip, hass: w.hass(), nom: 'Distributeur', onOpen: () => {} });
  await attendre();
  vue.rendre();
  const m = monter(vue.arbre.type, vue.arbre.props);
  m.rendre = () => { vue.rendre(); m.proprietes(vue.arbre.props); };
  return m;
}

test('I5, I6, I8, § 6 : la carte large — la plaque ambre sans lavis, « Repas à 19:00 · ≈ 18 j », le réservoir nommé, la surface qui dit tout', () => dans(async () => {
  const w = poser();
  const m = await carte(w);
  assert.ok(m.arbre.props.className.split(' ').indexOf('o-gabarit') >= 0 && m.arbre.props.className.indexOf('o-panne') < 0, 'la grille commune, pas de panne');
  assert.deepEqual([plaque(m).props.style.background, plaque(m).props.style.color], ['rgba(var(--o-piece-ambre-rgb),.18)', 'var(--o-piece-ambre)'], 'la plaque ambre');
  assert.ok(!String(m.arbre.props.style.background || '').includes('rgba('), 'pas de lavis : la couleur n’alerte pas');
  assert.equal(classe(m, 'o-gab-nom').props.children, 'Distributeur');
  assert.deepEqual([phrase(m).props.children, phrase(m).props.style.color, phrase(m).props.style['--o-n']], ['Repas à 19:00 · ≈ 18 j', 'var(--o-text2)', 22]);
  assert.equal(de(m, 'Surface').props.label, 'Distributeur, Repas à 19:00 · ≈ 18 j, réservoir 30 %', 'la surface dit le nom, la phrase et le réservoir (I6)');
  for (const nom of ['ChiffreNomme', 'ChiffreNommeHaut']) {
    const c = de(m, nom);
    assert.deepEqual([c.props.v, c.props.nom], [30, 'Réservoir'], nom);
  }
  // UNE puce, son mot et ses grammes ; plus de « Rempli » sur la carte (I10 : il vit près du réservoir, dans la popup).
  assert.deepEqual(boutons(m).map(b => [b.props['aria-label'], b.props.title]), [['Distribuer 12 g Distributeur', 'Distribuer 12 g']]);
  assert.equal(m.trouver(e => e.type === 'button' && /Rempli/.test(e.props['aria-label'] || '')).length, 0, '« Rempli » a quitté la carte');
  assert.ok(!m.texte().includes('Rempli'));
  assert.equal(classe(m, 'o-puces-robot').props['data-n'], 1, 'une puce seule garde son mot');
}));

test('I10, point 1 de l’étape 1 : « Distribuer » — START une fois ; deux appuis, de la carte à la compacte, une seule ration ; la puce revient', () => dans(async ({ h }) => {
  const w = poser();
  const m = await carte(w);
  const c = await carte(w, true);
  const puce = boutons(m)[0];
  m.appuyer(puce);
  m.appuyer(puce); // le second appui, au même endroit
  c.appuyer(boutons(c)[0]); // et un troisième, sur la compacte
  await attendre();
  assert.deepEqual(w.appels, ['select.select_option ' + FEED + ' START'], 'une seule ration : START sur le select de l’appareil');
  m.rendre(); c.rendre();
  for (const x of [m, c]) {
    const b = boutons(x)[0];
    assert.deepEqual([b.props['aria-disabled'], b.props.style.background, b.props.style.color], ['true', 'var(--o-accent-fond)', '#fff'], 'en vol : choisie, sans effet');
  }
  h.avancer(2500);
  m.rendre();
  assert.equal(boutons(m)[0].props['aria-disabled'], undefined, 'passé 2,5 s, la puce revient');
  m.appuyer(boutons(m)[0]);
  await attendre();
  assert.equal(w.appels.length, 2, 'et l’on redistribue');
  assert.ok(!w.appels.some(x => /toggle/.test(x)));
}));

/* TEST AJOUTÉ (passe bis de l'étape 2, 19/10 ; point C et G) : la carte et la popup ouvertes ensemble — un appui sur la carte, puis un dans
 * la popup : UN seul appel. Et sur un appareil en nuage qui répond en 3 s, le verrou tient jusqu'à la réponse (sonde A de la relecture
 * qualité : il tombait à 2,5 s, et le second appui servait une seconde ration), puis son filet de 2,5 s. */
test('point C : la carte puis la popup, un seul appel ; un appareil lent garde le verrou jusqu’à sa réponse', () => dans(async ({ h }) => {
  const w = poser();
  const reponses = [];
  // L'appareil en nuage : Home Assistant ne répond que quand le test le dit.
  const lent = () => { const base = w.hass(); return { ...base, callApi: () => Promise.resolve([]), callService: (...a) => { base.callService(...a); return new Promise((ok) => reponses.push(ok)); } }; };
  const m = await carte({ ...w, hass: lent });
  const Fiche = (await import(new URL('../src/fichedistributeur.jsx', import.meta.url).href)).default;
  const index = { entityMeta: META, deviceMeta: new Map() };
  const f = monter(Fiche, { hass: lent(), index, cfg: CFG, etat: ETAT(), maintenant: T, ongletDepart: 'accueil', plaque: null, sousNom: null, epingle: null });
  await attendre(); f.rendre();
  const accueil = () => { const el = de(f, 'OngletAccueil'); return monter(el.type, el.props); };
  const distribuerPopup = (x) => x.trouver(e => e.type === 'button' && e.props.id && String(e.props.id).endsWith('-distribuer'))[0];
  m.appuyer(boutons(m)[0]);
  await attendre();
  const a = accueil();
  a.appuyer(distribuerPopup(a));
  await attendre();
  assert.deepEqual(w.appels, ['select.select_option ' + FEED + ' START'], 'la carte puis la popup : une seule ration');
  assert.equal(distribuerPopup(a).props['aria-disabled'], 'true', 'la popup voit le geste de la carte');
  // 3 s plus tard, l'appareil n'a toujours pas répondu : le verrou tient, la carte ne repart pas.
  h.avancer(3000);
  m.rendre();
  assert.equal(boutons(m)[0].props['aria-disabled'], 'true', 'sans réponse, le verrou tient au-delà de 2,5 s');
  m.appuyer(boutons(m)[0]);
  await attendre();
  assert.equal(w.appels.length, 1, 'une seconde ration serait partie');
  // La réponse vient à 3,5 s : le filet de 2,5 s, puis la puce revient.
  reponses[0](); await attendre(); await attendre();
  h.avancer(2500);
  m.rendre();
  assert.equal(boutons(m)[0].props['aria-disabled'], undefined, 'passé le filet, la puce revient');
  m.appuyer(boutons(m)[0]);
  await attendre();
  assert.equal(w.appels.length, 2, 'et l’on redistribue');
}));

test('§ 6 : l’ambre sous 15 % et sur une anomalie ; l’appareil muet — le liseré, la plaque grise, rien à toucher', () => dans(async () => {
  const bas = await carte(poser({ retouche: (c) => { c[BAC] = st(BAC, '180', { max: 1500, unit_of_measurement: 'g' }); } }));
  assert.deepEqual([phrase(bas).props.children, phrase(bas).props.style.color, de(bas, 'ChiffreNomme').props.v], ['Repas à 19:00 · ≈ 7 j', 'var(--o-warn)', 12]);
  const erreur = await carte(poser({ retouche: (c) => { c[ERREUR] = st(ERREUR, 'on', { device_class: 'problem' }); } }));
  assert.deepEqual([phrase(erreur).props.children, phrase(erreur).props.style.color], ['Problème signalé · Repas à 19:00', 'var(--o-warn)']);
  assert.equal(boutons(erreur).length, 1, 'un appareil qui se plaint distribue encore');
  const muet = await carte(poser({ retouche: (c) => { c[FEED] = st(FEED, 'unavailable', { options: ['START'] }); } }));
  assert.ok(muet.arbre.props.className.split(' ').indexOf('o-panne') >= 0, 'le liseré qui respire');
  assert.deepEqual([phrase(muet).props.children, phrase(muet).props.style.color], ['Indisponible depuis 14:20', 'var(--o-bad)']);
  assert.deepEqual([plaque(muet).props.style.background, plaque(muet).props.style.color], ['var(--o-s1)', 'var(--o-text3)'], 'muet : la plaque grise');
  assert.deepEqual(boutons(muet), [], 'rien à toucher');
  // L'aide du bac muette : le liseré, « Réservoir indisponible », mais la vis répond — « Distribuer » reste.
  const bac = await carte(poser({ retouche: (c) => { c[BAC] = st(BAC, 'unavailable', {}); } }));
  assert.deepEqual([phrase(bac).props.children, boutons(bac).length, de(bac, 'ChiffreNomme')], ['Réservoir indisponible', 1, undefined]);
}));

test('sans serveur, rien ne s’invente : le dernier repas que dit le compteur de l’appareil', () => dans(async () => {
  const m = await carte(poser({ muet: true }));
  assert.equal(phrase(m).props.children, 'Dernier repas à 07:30');
  assert.equal(boutons(m).length, 1, '« Distribuer » ne dépend pas du serveur');
}));

test('I12 : la compacte — la plaque, la phrase, le réservoir à droite, son mini « Distribuer »', () => dans(async () => {
  const w = poser();
  const c = await carte(w, true);
  assert.ok(c.arbre.props.className.split(' ').indexOf('o-cvdense') >= 0, 'la disposition de la maison');
  assert.ok(c.texte().includes('Distributeur') && c.texte().includes('Repas à 19:00 · ≈ 18 j'), c.texte());
  assert.ok(c.texte().includes('30' + String.fromCharCode(160) + '%'), 'le réservoir à droite');
  assert.equal(de(c, 'Surface').props.label, 'Distributeur, Repas à 19:00 · ≈ 18 j, réservoir 30 %');
  assert.deepEqual(boutons(c).map(b => [b.props['aria-label'], b.props.title]), [['Distribuer 12 g Distributeur', 'Distribuer 12 g']]);
  c.appuyer(boutons(c)[0]);
  await attendre();
  assert.deepEqual(w.appels, ['select.select_option ' + FEED + ' START']);
  /* TEST AJOUTÉ (passe bis de l'étape 2, 19/10 ; point G) : la compacte MONTRE le geste en vol, comme la carte large — pas seulement
   * `aria-disabled` : sa mini-puce, déjà à l'accent, change de glyphe (le sablier), et revient avec le verrou. */
  c.rendre();
  const mini = boutons(c)[0];
  assert.equal(mini.props['aria-disabled'], 'true');
  assert.ok(JSON.stringify(mini.props.children).includes('hourglass') && !JSON.stringify(mini.props.children).includes('"paw"'), 'rien ne montre le geste en vol sur la compacte');
  const muet = await carte(poser({ retouche: (x) => { x[FEED] = st(FEED, 'unavailable', { options: ['START'] }); } }), true);
  assert.deepEqual([boutons(muet).length, muet.arbre.props.className.split(' ').indexOf('o-panne') >= 0], [0, true], 'muet : ni mini ni geste, le liseré');
}));

/* TEST AJOUTÉ (étape 2 IoT, tâche 4, 19/10 ; I21) : la coquille de la popup passe à son contenu la plaque de la carte — ambre, grise quand
 * l'appareil ne répond plus — et sa sous-ligne : « Distributeur » sans zone (le cas de sa maison), « Cuisine · distributeur » avec. */
test('I21 : la coquille de la popup — la plaque de la carte, « Distributeur » sans zone, « Cuisine · distributeur » avec', () => dans(async () => {
  const contenu = async (w, zone = null) => {
    if (zone) setLoggiaState({ index: { entityMeta: META, deviceMeta: new Map(), areaList: [{ name: zone, entities: [FEED] }], areaNameOf: () => zone } });
    const m = monter(F.FicheDistributeur, { hass: w.hass(), onClose: () => {} });
    await attendre();
    let fiche = null;
    (function chercher(n) { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(chercher); return; } if (n.props && 'sousNom' in n.props) fiche = n; chercher(n.props && n.props.children); })(m.arbre.props.children());
    return fiche.props;
  };
  const vif = await contenu(poser());
  assert.deepEqual([vif.sousNom, vif.plaque], ['Distributeur', { fond: 'rgba(var(--o-piece-ambre-rgb),.18)', encre: 'var(--o-piece-ambre)', icone: 'paw' }]);
  assert.equal((await contenu(poser(), 'Cuisine')).sousNom, 'Cuisine · distributeur');
  const muet = await contenu(poser({ retouche: (x) => { x[FEED] = st(FEED, 'unavailable', { options: ['START'] }); } }));
  assert.deepEqual([muet.plaque.fond, muet.plaque.encre], ['var(--o-s1)', 'var(--o-text3)'], 'muet : la plaque grise, comme la carte');
}));
