// Les traceurs d'objets (lot 13 du rapport Gladys, H2 ; ADR 0318).
//
// Un traceur d'objet (un sac, un vélo) est un `device_tracker` d'une intégration de
// traceurs, reconnu à sa PLATEFORME. Sa carte et sa popup disent sa zone, sa batterie,
// son dernier signal et l'état que l'intégration lui donne ; ses capteurs se lisent à
// leur clé, rattachés par son APPAREIL. Rien ne se commande. Ce n'est pas une personne :
// il ne compte jamais dans la présence de la maison. La carte et la popup se chargent
// à la demande ; la démo en porte un.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { monter, horlogeFausse } from './crochets.mjs';
import { device, entity, state, states, ctxOf } from './fixtures.mjs';

// La langue de la machine ne doit pas changer le résultat (garde-fou de la CI).
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);

const { setLoggiaState, estTraceur } = await import('../src/state.js');
const { vueTraceur } = await import('../src/traceur.js');
const Carte = (await import('../src/cartetraceur.jsx')).default;
const Fiche = (await import('../src/fichetraceur.jsx')).FicheTraceurContent;
const { filtresObjet } = await import('../src/objets.js');
const { objetsDeLaMaison } = await import('../src/vues/objets.jsx');
const { resolvePeople } = await import('../src/resolve.js');
const { maisonCapteursDemo } = await import('../src/demo.js');
const { buildIndex } = await import('../src/discovery.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const SAC = 'device_tracker.sac', TEL = 'device_tracker.telephone';
const ilYa = (min) => new Date(Date.now() - min * 60000).toISOString();

/* Une maison : le traceur du sac et ses capteurs (pile, dernier signal, dernière position, état), un téléphone, et la pile d'un
 * AUTRE appareil. `etats` remplace ou ajoute des états ; `sans` retire des entités du registre. */
function maison({ etats = {}, sans = [], plateforme = 'invoxia_biotracker' } = {}) {
  const ents = [
    entity(SAC, { device: 'd_sac', platform: plateforme }),
    entity('sensor.sac_batterie', { device: 'd_sac', platform: plateforme }),
    entity('sensor.sac_dernier_signal', { device: 'd_sac', platform: plateforme, key: 'last_seen', category: 'diagnostic' }),
    entity('sensor.sac_derniere_position', { device: 'd_sac', platform: plateforme, key: 'last_location' }),
    entity('sensor.sac_etat_du_traceur', { device: 'd_sac', platform: plateforme, key: 'tracker_state', category: 'diagnostic' }),
    entity(TEL, { device: 'd_tel', platform: 'mobile_app' }),
    entity('sensor.telephone_batterie', { device: 'd_tel', platform: 'mobile_app' }),
    entity('person.alex', { platform: 'person' }),
  ].filter(e => sans.indexOf(e.entity_id) < 0);
  const S = states(
    state(SAC, 'home', { friendly_name: 'Sac', source_type: 'gps', battery_level: 40, last_location: ilYa(90) }),
    state('sensor.sac_batterie', 72, { friendly_name: 'Sac Batterie', device_class: 'battery', unit_of_measurement: '%' }),
    state('sensor.sac_dernier_signal', ilYa(3 * 24 * 60 + 30), { friendly_name: 'Sac Dernier signal', device_class: 'timestamp' }),
    state('sensor.sac_derniere_position', ilYa(5 * 24 * 60), { friendly_name: 'Sac Dernière position', device_class: 'timestamp' }),
    state('sensor.sac_etat_du_traceur', 'sleep', { friendly_name: 'Sac État du traceur' }),
    state(TEL, 'home', { friendly_name: 'Téléphone', source_type: 'gps' }),
    state('sensor.telephone_batterie', 15, { friendly_name: 'Téléphone Batterie', device_class: 'battery', unit_of_measurement: '%' }),
    state('person.alex', 'home', { friendly_name: 'Alex', device_trackers: [TEL] }),
  );
  Object.keys(etats).forEach(k => { if (etats[k] == null) delete S[k]; else S[k] = { entity_id: k, ...etats[k] }; });
  return { areas: [], devices: [device('d_sac', 'Sac', null, { integration: plateforme }), device('d_tel', 'Téléphone', null, { integration: 'mobile_app' })], entities: ents, floors: [], states: S };
}
function avec(fx, f) {
  const ctx = ctxOf(fx, {});
  setLoggiaState({ index: ctx.index, ent: {}, cfg: {}, resolved: null });
  try { return f(ctx); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const vue = (fx) => avec(fx, (ctx) => vueTraceur({ id: SAC, S: fx.states, index: ctx.index }));

/* ════════════ LA RECONNAISSANCE ════════════ */

test('un traceur d’objet se reconnaît à sa plateforme ; un téléphone, un capteur du traceur n’en sont pas', () => {
  avec(maison(), () => {
    assert.equal(estTraceur(SAC), true);
    assert.equal(estTraceur(TEL), false, 'le téléphone d’une personne (`mobile_app`)');
    assert.equal(estTraceur('sensor.sac_batterie'), false, 'un capteur de son appareil n’est pas le traceur');
  });
  avec(maison({ plateforme: 'invoxia' }), () => assert.equal(estTraceur(SAC), true, 'le nom de l’intégration que l’audit citait'));
  avec(maison({ plateforme: 'unifi' }), () => assert.equal(estTraceur(SAC), false, 'un routeur qui voit un appareil'));
  // Sans index (avant la première réponse du serveur) : rien n'est un traceur d'objet.
  assert.equal(estTraceur(SAC), false);
  for (const f of ['src/traceur.js', 'src/cartetraceur.jsx', 'src/fichetraceur.jsx']) {
    assert.ok(!/'(device_tracker|sensor)\.[a-z]/.test(lire(f)), f + ' : aucun identifiant en dur');
  }
});

/* ════════════ CE QUE DIT LA CARTE ════════════ */

test('sa zone : à la maison, absent, le nom de la zone tel quel, inconnu ; indisponible quand il ne répond plus', () => {
  const zone = (s) => vue(maison({ etats: { [SAC]: { state: s, attributes: { friendly_name: 'Sac' } } } }));
  assert.equal(zone('home').zone, 'À la maison');
  assert.equal(zone('home').encre, 'var(--o-ok)');
  assert.equal(zone('not_home').zone, 'Absent');
  assert.equal(zone('Travail').zone, 'Travail', 'le nom que la maison a donné à sa zone, jamais traduit');
  assert.equal(zone('unknown').zone, 'Inconnu');
  assert.equal(zone('unknown').mort, false, 'un traceur qui ne sait pas où il est répond encore');
  const muet = zone('unavailable');
  assert.equal(muet.mort, true);
  assert.equal(muet.zone, 'Indisponible');
});

test('sa batterie : le capteur `battery` de SON appareil, sinon l’attribut du traceur', () => {
  assert.equal(vue(maison()).pile, 72, 'le capteur de son appareil, pas l’attribut (40), ni la pile du téléphone (15)');
  assert.equal(vue(maison({ sans: ['sensor.sac_batterie'] })).pile, 40, 'sans capteur : `battery_level`');
  assert.equal(vue(maison({ etats: { 'sensor.sac_batterie': { state: 'unavailable', attributes: { device_class: 'battery' } } } })).pile, 40, 'un capteur muet ne vaut pas 0 %');
  assert.equal(vue(maison({ sans: ['sensor.sac_batterie'], etats: { [SAC]: { state: 'home', attributes: {} } } })).pile, null);
});

test('son dernier signal : la clé `last_seen`, puis l’attribut, puis la dernière position, puis le dernier changement', () => {
  const v = vue(maison());
  assert.ok(Math.abs(v.signal - (Date.now() - (3 * 24 * 60 + 30) * 60000)) < 5000, 'le capteur de clé `last_seen`');
  assert.equal(v.quand, 'Signal il y a 3 j');
  const sansSignal = vue(maison({ sans: ['sensor.sac_dernier_signal'] }));
  assert.ok(Math.abs(sansSignal.signal - (Date.now() - 5 * 24 * 60 * 60000)) < 5000, 'sans lui : la dernière position (sa clé)');
  const attr = vue(maison({ sans: ['sensor.sac_dernier_signal', 'sensor.sac_derniere_position'] }));
  assert.ok(Math.abs(attr.signal - (Date.now() - 90 * 60000)) < 5000, 'puis l’attribut `last_location` du traceur');
  const lc = ilYa(26 * 60);
  const rien = vue(maison({ sans: ['sensor.sac_dernier_signal', 'sensor.sac_derniere_position'], etats: { [SAC]: { state: 'home', attributes: {}, last_changed: lc } } }));
  assert.equal(rien.signal, new Date(lc).getTime(), 'en dernier : le dernier changement du traceur');
  assert.equal(rien.quand, 'Signal il y a 1 j');
  const vu = vue(maison({ sans: ['sensor.sac_dernier_signal'], etats: { [SAC]: { state: 'home', attributes: { last_seen: ilYa(10) } } } }));
  assert.ok(Math.abs(vu.signal - (Date.now() - 10 * 60000)) < 5000, 'l’attribut `last_seen` passe avant la dernière position');
});

test('son état : le capteur de clé `tracker_state`, tel que l’intégration l’écrit ; rien sans lui', () => {
  assert.equal(vue(maison()).etat, 'sleep');
  assert.equal(vue(maison({ sans: ['sensor.sac_etat_du_traceur'] })).etat, null);
  assert.equal(vue(maison({ etats: { 'sensor.sac_etat_du_traceur': { state: 'unavailable', attributes: {} } } })).etat, null, 'un capteur muet n’écrit pas « unavailable »');
});

test('la carte : le nom, la zone, le signal, la batterie ; toucher ouvre la popup, rien ne se commande', () => {
  const fx = maison();
  // La carte suit ses capteurs toutes les 2 s : des minuteurs à nous, sinon le test ne finirait pas.
  const h = horlogeFausse();
  h.installer();
  try { avec(fx, () => {
    const ouverts = [];
    const m = monter(Carte, { id: SAC, hass: { states: fx.states }, onOpen: (x) => ouverts.push(x) });
    const t = m.texte();
    assert.match(t, /Sac/);
    assert.match(t, /À la maison/);
    assert.match(t, /Signal il y a 3 j/);
    const surface = m.trouver(e => e.props && typeof e.props.onClick === 'function');
    assert.equal(surface.length, 1, 'un seul geste : ouvrir');
    assert.match(surface[0].props.label, /Sac, À la maison, Signal il y a 3 j · pile 72/);
    m.appuyer(surface[0]);
    assert.deepEqual(ouverts, [SAC]);
    // La compacte : la batterie à droite.
    m.demonter();
    const c = monter(Carte, { id: SAC, hass: { states: fx.states }, chip: true });
    assert.match(c.texte(), /72 %/);
    c.demonter();
  }); } finally { h.restaurer(); }
  for (const f of ['src/traceur.js', 'src/cartetraceur.jsx', 'src/fichetraceur.jsx']) {
    assert.ok(!/callService|commander(Service)?\(|from '\.\/actions\.js'/.test(lire(f)), f + ' : aucune commande');
  }
});

test('la popup : où il est, le dernier signal, la batterie, l’état, et « L’appareil »', () => {
  const fx = maison();
  avec(fx, () => {
    const fiches = [];
    const m = monter(Fiche, { id: SAC, hass: { states: fx.states }, onFiche: (x) => fiches.push(x) });
    const t = m.texte();
    for (const mot of ['Où', 'À la maison', 'Dernier signal', 'Il y a 3 j', 'Batterie', '72 %', 'État du traceur', 'sleep', 'L’appareil']) assert.ok(t.includes(mot), mot);
    m.appuyer(m.trouver(e => e.type === 'button')[0]);
    assert.deepEqual(fiches, [SAC]);
  });
  // Sans capteur d'état : pas de rangée vide.
  const fx2 = maison({ sans: ['sensor.sac_etat_du_traceur'] });
  avec(fx2, () => assert.ok(!monter(Fiche, { id: SAC, hass: { states: fx2.states } }).texte().includes('État du traceur')));
});

/* ════════════ OÙ IL VIT ════════════ */

test('la carte et la popup se chargent à la demande ; le démarrage n’en porte que la reconnaissance', () => {
  assert.ok(lire('src/cartescustom/cartes.jsx').includes("const CarteTraceur = lazyRecharge(() => import('../cartetraceur.jsx'));"));
  assert.ok(lire('src/appareils/fiches.jsx').includes("const FicheTraceur = lazyRecharge(() => import('../fichetraceur.jsx'));"));
  // Aucun module du démarrage n'importe la carte, la popup ou leur lecture.
  const statiques = /from '\.{1,2}\/(traceur\.js|cartetraceur\.jsx|fichetraceur\.jsx)'/;
  for (const f of ['src/cartescustom/cartes.jsx', 'src/appareils/fiches.jsx', 'src/vues/objets.jsx', 'src/state.js', 'src/App.jsx']) {
    assert.ok(!statiques.test(lire(f)), f);
  }
  // La carte générique et la grille passent la main ; la fiche ouvre SA popup.
  assert.ok(lire('src/cartescustom/cartes.jsx').includes('if (estTraceur(id)) return <Suspense fallback={null}><CarteTraceur id={id} hass={hass} nom={label} chip={dense} onOpen={onOpen} /></Suspense>;'));
  const fiches = lire('src/appareils/fiches.jsx');
  assert.ok(fiches.includes('else if (estTraceur(id)) setTraceurPop(id);'));
  assert.ok(fiches.includes('{traceurPop && <Suspense fallback={null}><FicheTraceur id={traceurPop} hass={hass} onClose={() => setTraceurPop(null)} /></Suspense>}'));
});

test('Objets : le traceur fait la carte de son appareil, sous IoT ; le téléphone n’en fait pas', () => {
  assert.deepEqual(filtresObjet({ domaine: 'device_tracker' }), ['iot']);
  const fx = maison();
  const objets = avec(fx, () => objetsDeLaMaison({ states: fx.states }, [], new Set()));
  const ids = objets.map(o => o.id);
  assert.ok(ids.includes(SAC));
  assert.ok(!ids.includes(TEL), 'un téléphone n’est pas un objet de la maison');
  assert.ok(!ids.some(id => id && id.indexOf('sensor.sac_') === 0), 'ses capteurs ne font pas une carte de plus');
  assert.deepEqual(objets.find(o => o.id === SAC).filtres, ['iot']);
});

test('un traceur d’objet n’est pas une personne : il n’entre pas dans la présence de la maison', () => {
  const ctx = ctxOf(maison(), {});
  const gens = resolvePeople(ctx);
  assert.deepEqual(gens.list.map(p => p.haid), ['person.alex'], 'la découverte ne retient que les `person`');
  // Les personnes que la règle de départ suit ne se choisissent que parmi les `person` ; le serveur ne lit jamais un `device_tracker`.
  assert.ok(lire('src/views/presence.jsx').includes("return Object.keys(hass.states).filter(id => id.indexOf('person.') === 0)"));
  assert.ok(!lire('custom_components/loggia/presence.py').includes('device_tracker'));
  assert.ok(!lire('src/traceur.js').includes('person.'), 'la lecture du traceur ne touche pas aux personnes');
});

/* ════════════ LA DÉMO, LES LANGUES ════════════ */

test('la démo porte un traceur d’objet : le vélo, à la maison, sa batterie, son dernier signal', () => {
  const m = maisonCapteursDemo();
  const r = m.index();
  const ix = buildIndex({ areas: r.areas.map(a => ({ area_id: a.id, name: a.name })), devices: r.devices.map(d => ({ ...d, area_id: d.area })),
    entities: r.entities.map(e => ({ entity_id: e.id, device_id: e.device, area_id: e.area, entity_category: e.category, name: e.name, device_class: e.device_class, platform: e.platform, translation_key: e.key || null })), states: m.states });
  const traceurs = Object.keys(m.states).filter(id => id.indexOf('device_tracker.') === 0);
  setLoggiaState({ index: ix, ent: {}, cfg: {}, resolved: null });
  try {
    const objets = traceurs.filter(estTraceur);
    assert.equal(objets.length, 1, 'un traceur d’objet ; le téléphone de la démo n’en est pas un');
    const v = vueTraceur({ id: objets[0], S: m.states, index: ix });
    assert.equal(v.zone, 'À la maison');
    assert.equal(v.pile, 64);
    assert.equal(v.quand, 'Signal il y a 35 min');
  } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
});

test('les deux textes neufs, dans les six autres langues', async () => {
  for (const l of ['en', 'de', 'es', 'it', 'nl', 'pl']) {
    const T = (await import('../src/langues/' + l + '.js')).default;
    for (const k of ['traceur d’objet', 'État du traceur']) assert.ok(typeof T[k] === 'string' && T[k] && T[k] !== k, l + ' : ' + k);
  }
});
