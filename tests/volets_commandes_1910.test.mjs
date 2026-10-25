/* Les commandes des volets et des covers, d'après ce qu'ils ACCEPTENT (19/10,
 * « corrige aussi les points restants » de l'audit des volets).
 *
 * Ce qui est garanti ici :
 *  1. les boutons suivent `supported_features` partout où un cover se commande :
 *     Stop inerte (aria-disabled) sans STOP ; Monter / Descendre par la
 *     position sans OPEN / CLOSE ; un store qui ne fait que s'incliner par ses
 *     lames ; ni glissière ni pourcentage inventé sans SET_POSITION ;
 *  2. un ordre que Home Assistant REFUSE, après coup, oublie sa course ;
 *  3. un Stop venu d'ailleurs (fin d'`opening` / `closing`) termine la course ;
 *  4. « En ce moment » voit les courses jouées, sans couleur en dur ;
 *  5. la vue « modes et planning » lance les courses, ses modes sont inertes
 *     pour un compte ordinaire ;
 *  6. `unknown` est une panne pour l'ancienne carte ; la compacte d'un cover
 *     écrit un entier et le verdict V12 ;
 *  7. Monter / Descendre ne sont inertes que sur une position SÛRE ;
 *  8. la fiche dit « Réglages indisponibles. » quand le serveur se tait ;
 *  9. Stop et les repères de la fiche : aria-disabled, jamais disabled ;
 * 10. la bibliothèque montre un VOLET (sa classe) et un garage ;
 * 11. l'en-tête d'Objets ne dit pas « tous fermés » sans le savoir ;
 * 12. le code mort est parti. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
const SUFFIXE = '?commandes1910';
const NOMS = ['RoomVoletCard', 'RoomCoverCard', 'CvCard'];
const EXPOSE = 'data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx" + SUFFIXE + "')) return next(url, ctx);",
  '  const r = await next(url.slice(0, -' + SUFFIXE.length + '), ctx);',
  "  return { ...r, source: String(r.source) + ';export { " + NOMS.join(', ') + " };' };",
  '}',
].join('\n'));
register('./jsx-hooks.mjs', import.meta.url);
register(EXPOSE);
const F = await import(new URL('../src/App.jsx' + SUFFIXE, import.meta.url).href);
const C = await import('../src/voletcourse.js');
const E = await import('../src/voletsetat.js');
const O = await import('../src/outils.js');
const V = await import('../src/voletecran.js');
const { commander } = await import('../src/actions.js');
const ENTETE = await import(new URL('../src/entetevolets.jsx', import.meta.url).href);
const Fiche = (await import(new URL('../src/fichevolet.jsx', import.meta.url).href)).default;

const lire = (chemin) => readFileSync(new URL('../' + chemin, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('src/App.jsx') + lire('src/views/voletsplan.jsx'); // App.jsx + la vue « modes et planning », chargée à la demande depuis le 19/10 (borne du boot).
const AU_REPOS = { repeter: () => 0, arreterMinuterie: () => {}, plusTard: () => 0, annuler: () => {} };
const T = Date.parse('2026-10-12T15:00:00+02:00');
const ISO = new Date(T - 3600000).toISOString();
const st = (id, state, pos, o = {}) => ({ entity_id: id, state, attributes: { friendly_name: o.nom || 'Volet cuisine', device_class: 'shutter', supported_features: 15,
  ...(pos == null ? {} : { current_position: pos }), ...(o.attributes || {}) }, last_updated: o.quand || ISO, last_changed: o.quand || ISO });
const ID = 'cover.volet_cuisine';
// Une maison qui relève les ordres `[service, entité, données]` ; `refuse` : Home Assistant les rejette.
const hassOrdres = (ordres, sts, { refuse = false } = {}) => ({ states: Object.fromEntries(sts.map(s => [s.entity_id, s])),
  callService: (d, s, data, target) => { ordres.push([s, (target && target.entity_id) || (data && data.entity_id), data]); return refuse ? Promise.reject(new Error('refusé')) : Promise.resolve(); } });
const capter = (Composant, props) => { let arbre = null; const Capte = (p) => (arbre = Composant(p)); renderToStaticMarkup(createElement(Capte, props)); return arbre; };
function chercher(el, t, acc = []) {
  if (!el || typeof el !== 'object') return acc;
  if (Array.isArray(el)) { el.forEach(x => chercher(x, t, acc)); return acc; }
  if (t(el)) acc.push(el);
  if (el.props && typeof el.props.children !== 'function') chercher(el.props.children, t, acc);
  return acc;
}
const element = (arbre, nom) => chercher(arbre, el => el.type === 'button' && el.props['aria-label'] === nom)[0];
const evt = () => ({ preventDefault() {}, stopPropagation() {} });
const bouton = (html, nom) => (new RegExp('<button[^>]*aria-label="' + nom + '"[^>]*>').exec(html) || [''])[0];
const attendre = () => new Promise(r => setTimeout(r, 0));
/* Un refus de Home Assistant finit en rejet NON traité (le toast global le relève : actions.js) ; le temps du test, l'écoute
 * de Node ne voit que les autres. */
async function avalerRefus(f) {
  const avant = process.listeners('unhandledRejection');
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', (e) => { if (!(e && e.code === 'service_error')) avant.forEach(g => g(e)); });
  try { await f(); await attendre(); } finally {
    process.removeAllListeners('unhandledRejection');
    avant.forEach(g => process.on('unhandledRejection', g));
  }
}

/* ════════════ 1. Ce qu'un cover accepte ════════════ */

test('point 1 — `gestesCover` : les bits de supported_features, la position pour Monter / Descendre, les lames d’un store qui s’incline', () => {
  const g = (f, a = {}) => O.gestesCover({ state: 'open', attributes: { supported_features: f, ...a } });
  assert.deepEqual(g(15), { lames: false, placer: 'set_position', stop: { capacite: 'stop', valeur: undefined },
    monter: { capacite: 'open', valeur: undefined }, descendre: { capacite: 'close', valeur: undefined } });
  const position = g(4);
  assert.deepEqual([position.monter, position.descendre, position.stop], [{ capacite: 'set_position', valeur: 100 }, { capacite: 'set_position', valeur: 0 }, null], 'sans OPEN / CLOSE : la position');
  const garage = g(3);
  assert.deepEqual([garage.placer, garage.stop, garage.monter.capacite, garage.descendre.capacite], [null, null, 'open', 'close'], 'un garage : ni position ni Stop');
  const lames = g(16 | 32 | 64 | 128);
  assert.deepEqual([lames.lames, lames.placer, lames.monter.capacite, lames.descendre.capacite, lames.stop.capacite],
    [true, 'set_tilt_position', 'open_tilt', 'close_tilt', 'stop_tilt'], 'un store qui ne fait que s’incliner : ses lames');
  assert.deepEqual([g(128).monter, g(128).descendre], [{ capacite: 'set_tilt_position', valeur: 100 }, { capacite: 'set_tilt_position', valeur: 0 }]);
  assert.deepEqual([g(undefined).monter, g(undefined).stop, g(undefined).placer], [null, null, null], 'sans masque : rien — `commander` refuserait tout');
  // La position publiée : celle des lames seulement pour un store qui ne fait que s'incliner.
  assert.equal(O.positionPubliee({ attributes: { supported_features: 16 | 32 | 128, current_tilt_position: 40 } }), 40);
  assert.equal(O.positionPubliee({ attributes: { supported_features: 15 | 128, current_position: 70, current_tilt_position: 40 } }), 70);
  assert.equal(O.positionPubliee({ attributes: { supported_features: 15, current_tilt_position: 40 } }), null);
});

test('point 1 — la carte d’un volet : Stop inerte sans STOP ; Monter passe par la position sans OPEN ; un store à lames par ses lames', () => {
  C.reglerCourses({ horloge: () => T, ...AU_REPOS });
  E.reglerVoletsEtat({ hass: null });
  const ordres = [];
  const s = st(ID, 'open', 40, { attributes: { supported_features: 4 } });
  const arbre = capter(F.RoomVoletCard, { id: ID, hass: hassOrdres(ordres, [s]), onOpen: () => {} });
  const stop = element(arbre, 'Stop Volet cuisine');
  assert.deepEqual([stop.props['aria-disabled'], stop.props.disabled], [true, undefined], 'Stop inerte, focalisable');
  stop.props.onClick(evt());
  assert.deepEqual(ordres, [], 'aucun stop_cover : Home Assistant l’aurait refusé');
  element(arbre, 'Ouvrir Volet cuisine').props.onClick(evt());
  element(arbre, 'Fermer Volet cuisine').props.onClick(evt());
  assert.deepEqual(ordres.map(o => [o[0], o[2].position]), [['set_cover_position', 100], ['set_cover_position', 0]]);
  // Un store à lames seulement : open_cover_tilt, et la position de ses lames à l'écran.
  C.reglerCourses({ horloge: () => T, ...AU_REPOS });
  ordres.length = 0;
  const lames = { ...st(ID, 'open', null, { attributes: { supported_features: 16 | 32 | 64 | 128, current_tilt_position: 30, device_class: 'blind' } }) };
  const html = renderToStaticMarkup(createElement(F.RoomVoletCard, { id: ID, hass: hassOrdres(ordres, [lames]), onOpen: () => {} }));
  assert.ok(html.includes('aria-label="Volet cuisine, 30 %'), 'la position de ses lames');
  const a2 = capter(F.RoomVoletCard, { id: ID, hass: hassOrdres(ordres, [lames]), onOpen: () => {} });
  element(a2, 'Ouvrir Volet cuisine').props.onClick(evt());
  assert.deepEqual(ordres.map(o => o[0]), ['open_cover_tilt']);
  C.reglerCourses(AU_REPOS);
});

test('point 1 — l’ancienne carte (garage) : ni glissière ni pourcentage sans SET_POSITION, Stop inerte sans STOP ; la compacte suit aussi', () => {
  C.reglerCourses({ horloge: () => T, ...AU_REPOS });
  const ordres = [];
  const garage = st('cover.garage', 'closed', null, { nom: 'Garage', attributes: { device_class: 'garage', supported_features: 3 } });
  const html = renderToStaticMarkup(createElement(F.RoomCoverCard, { id: 'cover.garage', hass: hassOrdres(ordres, [garage]), onOpen: () => {} }));
  assert.ok(!html.includes('role="slider"'), 'pas de glissière');
  assert.ok(!/>\d+ %</.test(html), 'pas de pourcentage inventé');
  assert.ok(bouton(html, 'Stop Garage').includes('aria-disabled="true"') && !/ disabled=""/.test(bouton(html, 'Stop Garage')));
  const arbre = capter(F.RoomCoverCard, { id: 'cover.garage', hass: hassOrdres(ordres, [garage]), onOpen: () => {} });
  element(arbre, 'Stop Garage').props.onClick(evt());
  element(arbre, 'Ouvrir Garage').props.onClick(evt());
  assert.deepEqual(ordres.map(o => o[0]), ['open_cover'], 'Stop ne part pas, Ouvrir oui');
  // Avec la position : la glissière et le chiffre reviennent.
  const volet = st('cover.velux', 'open', 40, { nom: 'Velux', attributes: { device_class: 'window', supported_features: 15 } });
  const avec = renderToStaticMarkup(createElement(F.RoomCoverCard, { id: 'cover.velux', hass: hassOrdres(ordres, [volet]), onOpen: () => {} }));
  assert.ok(avec.includes('role="slider"') && avec.includes('>40 %<'));
  // La compacte et la standard génériques : ▲ ▼ et Stop suivent le masque.
  const compacte = renderToStaticMarkup(createElement(F.CvCard, { id: 'cover.garage', hass: hassOrdres(ordres, [garage]), onOpen: () => {}, dense: false }));
  assert.ok(bouton(compacte, 'Stop Garage').includes('aria-disabled="true"'));
  const seul = st('cover.store', 'open', 40, { nom: 'Store', attributes: { device_class: undefined, supported_features: 4 } });
  const mini = renderToStaticMarkup(createElement(F.CvCard, { id: 'cover.store', hass: hassOrdres(ordres, [seul]), onOpen: () => {}, dense: true }));
  assert.ok(!bouton(mini, 'Ouvrir Store').includes('aria-disabled'), 'la position fait Monter');
  C.reglerCourses(AU_REPOS);
});

/* ════════════ 2. Un refus de Home Assistant oublie la course ════════════ */

test('point 2 — `commander` dit un refus de Home Assistant, après coup (`surEchec`)', () => avalerRefus(async () => {
  const ordres = [];
  const motifs = [];
  const ok = commander(hassOrdres(ordres, [st(ID, 'open', 60)], { refuse: true }), ID, 'close', undefined, null, null, (m) => motifs.push(m));
  assert.ok(ok != null, 'le moteur d’actions l’accepte : la vue avance');
  await attendre();
  assert.deepEqual(motifs, ['refusé']);
}));

test('point 2 — `ordreSuivi` : refusé sur place, rien ne se dessine ; refusé plus tard, la course s’oublie — elle seule', () => {
  const dessins = [], oublis = [];
  assert.equal(C.ordreSuivi(() => null, () => dessins.push('x'), (c) => oublis.push(c)), null);
  assert.deepEqual(dessins, [], 'un refus local ne lance rien');
  let refuser = null;
  C.ordreSuivi((surEchec) => { refuser = surEchec; return {}; }, () => 'course', (c) => oublis.push(c));
  refuser('refusé');
  assert.deepEqual(oublis, ['course']);
  // Le refus arrive AVANT le dessin (une promesse déjà rejetée) : rien ne se dessine.
  C.ordreSuivi((surEchec) => { surEchec('refusé'); return {}; }, () => dessins.push('trop tard'), () => {});
  assert.deepEqual(dessins, []);
  // Le magasin : seule la course refusée s'oublie, un geste plus récent reste.
  let t = T;
  C.reglerCourses({ horloge: () => t, ...AU_REPOS });
  const s = st(ID, 'open', 60);
  const premiere = C.lancerCourse(ID, 0, s);
  t += 1000;
  C.lancerCourse(ID, 100, s);
  C.oublierCourse(ID, premiere);
  assert.equal(C.afficherCourse(ID, s).sens, 'ouverture', 'le geste suivant n’est pas touché');
  C.reglerCourses(AU_REPOS);
});

test('point 2 — la carte : Home Assistant refuse « Fermer », la course s’efface au lieu de jouer 200 s', () => avalerRefus(async () => {
  let t = T;
  C.reglerCourses({ horloge: () => t, ...AU_REPOS });
  E.reglerVoletsEtat({ hass: null });
  const s = st(ID, 'open', 60);
  const ordres = [];
  const arbre = capter(F.RoomVoletCard, { id: ID, hass: hassOrdres(ordres, [s], { refuse: true }), onOpen: () => {} });
  element(arbre, 'Fermer Volet cuisine').props.onClick(evt());
  assert.ok(C.afficherCourse(ID, s).enCourse, 'la course part avec l’ordre');
  await attendre();
  t += 2000;
  assert.equal(C.afficherCourse(ID, s).enCourse, false, 'refusée : plus de course');
  assert.equal(C.afficherCourse(ID, s).pos, 60, 'Home Assistant fait foi');
  // L'en-tête d'Objets : le même oubli, volet par volet.
  const vues = [{ id: 'a', st: st('a', 'open', 60), c: { enCourse: false } }];
  const refus = [];
  const oublies = [];
  ENTETE.commanderTous(vues, 'close', 0, { commanderUn: (id, cap, surEchec) => { refus.push(surEchec); return {}; }, lancer: () => 'c-a', oublier: (id, c) => oublies.push([id, c]) });
  refus[0]('refusé');
  assert.deepEqual(oublies, [['a', 'c-a']]);
  C.reglerCourses(AU_REPOS);
}));

/* ════════════ 3. Un Stop venu d'ailleurs ════════════ */

test('point 3 — `opening` / `closing` qui cesse loin de la cible : la course finit, Home Assistant fait foi', () => {
  const q = (t) => new Date(t).toISOString();
  let e = C.voirHA(null, st(ID, 'open', 80, { quand: q(T) }), T);
  e = C.voirHA(e, st(ID, 'closing', 80, { quand: q(T + 1000) }), T + 1000);
  assert.ok(C.affichage(e, 80, T + 2000).enCourse, 'la course de `closing`');
  e = C.voirHA(e, st(ID, 'closing', 70, { quand: q(T + 3000) }), T + 3000);
  e = C.voirHA(e, st(ID, 'open', 70, { quand: q(T + 4000) }), T + 4000);
  const a = C.affichage(e, 70, T + 5000);
  assert.deepEqual([a.enCourse, a.pos, a.cible], [false, 70, null], 'arrêté à 70 : ni descente jusqu’à 0, ni tenue de 180 s');
  // Sans position publiée entre deux : la même fin.
  let f = C.voirHA(null, st(ID, 'open', 80, { quand: q(T) }), T);
  f = C.voirHA(f, st(ID, 'opening', 80, { quand: q(T + 1000) }), T + 1000);
  f = C.voirHA(f, st(ID, 'open', 80, { quand: q(T + 3000) }), T + 3000);
  assert.equal(C.affichage(f, 80, T + 4000).enCourse, false);
  // Un geste de l'écran pendant que Home Assistant ne dit rien de plus : il court toujours.
  const g = C.geste(C.voirHA(null, st(ID, 'open', 80, { quand: q(T) }), T), 0, 80, T + 500);
  assert.ok(C.affichage(C.voirHA(g, st(ID, 'open', 80, { quand: q(T) }), T + 600), 80, T + 700).enCourse);
});

/* ════════════ 4. « En ce moment » ════════════ */

test('point 4 — « En ce moment » voit les courses jouées (Netatmo ne dit jamais `closing`), Stop les fige ; plus de couleur en dur', () => {
  let t = T;
  C.reglerCourses({ horloge: () => t, ...AU_REPOS });
  const S = { [ID]: st(ID, 'open', 60), 'cover.salon': st('cover.salon', 'open', 100) };
  C.lancerCourse(ID, 0, S[ID]);
  t += 1000;
  let vu = null;
  const Sonde = () => { vu = C.useSensCourses([ID, 'cover.salon'], S); return null; };
  renderToStaticMarkup(createElement(Sonde));
  assert.deepEqual(vu, { [ID]: 'fermeture' });
  C.reglerCourses(AU_REPOS);
  const i = APP.indexOf('coversMoment.forEach(');
  const bloc = APP.slice(i, APP.indexOf('} catch {}', i));
  assert.ok(bloc.includes("sensJoue[c.haid]"), 'la course jouée compte');
  assert.ok(bloc.includes('ordreEtArret(c.haid, e,'), 'Stop fige la course');
  assert.ok(bloc.includes('gestesCover(e).stop'), 'Stop seulement s’il le sait');
  assert.ok(bloc.includes('rgb="var(--o-purple-rgb)"') && !APP.includes('167,139,250'), 'la teinte du thème');
});

/* ════════════ 5. La vue « modes et planning » ════════════ */

test('point 5 — « modes et planning » : Ouvrir / Fermer lancent la course ; les modes de Loggia sont inertes pour un compte ordinaire, et le refus se dit', () => {
  const i = APP.indexOf('function VoletsContent(');
  const v = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.ok(v.includes('ordreEtCourse(id, 100, st, envoi)') && v.includes('ordreEtCourse(id, 0, st, envoi)'));
  assert.ok(v.includes('const ordinaire = compteOrdinaire(hass);'));
  const modes = v.slice(v.indexOf('MODES_LOGGIA().map('), v.indexOf('</BarGroup>', v.indexOf('MODES_LOGGIA().map(')));
  assert.ok(modes.includes('aria-disabled={ordinaire || undefined}') && modes.includes("raisonEchec(Object.assign(new Error('Unauthorized'), { code: 'unauthorized' }), 'loggia_volets')"), modes);
  assert.ok(v.includes('<div role="alert"') && v.includes('{refusMode}'), 'le refus se dit sous la barre');
});

/* ════════════ 6 et 7. Panne, entier, position sûre ════════════ */

test('point 6 — `unknown` est une panne pour l’ancienne carte et l’ancienne fiche ; la compacte d’un cover écrit un entier et le verdict V12', () => {
  C.reglerCourses({ horloge: () => T, ...AU_REPOS });
  const g = st('cover.garage', 'unknown', null, { nom: 'Garage', attributes: { device_class: 'garage', supported_features: 3 } });
  const html = renderToStaticMarkup(createElement(F.RoomCoverCard, { id: 'cover.garage', hass: hassOrdres([], [g]), onOpen: () => {} }));
  assert.ok(html.startsWith('<div class="o-rmcard o-panne"') && html.includes('Indisponible'));
  for (const nom of ['Ouvrir Garage', 'Stop Garage', 'Fermer Garage']) assert.ok(bouton(html, nom).includes('aria-disabled="true"'), nom);
  const fiche = APP.slice(APP.indexOf('function RoomCoverSheet('), APP.indexOf('function RoomClimateSheet('));
  assert.ok(fiche.includes('const mort = enPanne(id, st);'));
  const tuile = (pos) => renderToStaticMarkup(createElement(F.CvCard, { id: 'cover.groupe', hass: hassOrdres([], [st('cover.groupe', 'open', pos, { nom: 'Groupe', attributes: { device_class: undefined } })]), onOpen: () => {}, dense: true }));
  assert.ok(tuile(98.4).includes('aria-label="Groupe, Ouvert"'), 'à 98 % : « Ouvert », sans « · 98% »');
  assert.ok(tuile(37.6).includes('aria-label="Groupe, Ouvert · 38%"'), 'un entier');
  C.reglerCourses(AU_REPOS);
});

test('point 7 — Monter / Descendre inertes sur une position SÛRE seulement : `closed` à 100 % (Netatmo) se dit fermé et se descend ; sans position, un `open` se monte', () => {
  const v = (s) => V.vueVolet({ st: s });
  const bascule = v(st(ID, 'closed', 100));
  assert.deepEqual([bascule.ferme, bascule.pos, bascule.allume, bascule.phrase, bascule.peutDescendre, bascule.peutMonter], [true, 0, false, 'Fermé', true, true],
    '« closed » fait foi : fermé, à 0 — jamais « Fermé · 100 % » —, et Descendre reste offert');
  const sansPosition = v(st(ID, 'open', null, { attributes: { supported_features: 11 } }));
  assert.deepEqual([sansPosition.ouvert, sansPosition.peutMonter, sansPosition.peutDescendre], [true, true, true], 'arrêté à mi-course, il reste `open` : Monter n’est pas inerte');
  assert.equal(v(st(ID, 'open', 100)).peutMonter, false, 'en haut, SÛR : Monter inerte');
  assert.equal(v(st(ID, 'closed', 0)).peutDescendre, false, 'en bas, sûr : Descendre inerte');
  assert.equal(v(st(ID, 'open', 1)).peutDescendre, false, 'sa chambre, qui bute à 1 % : fermée, et sûre');
  assert.deepEqual([v(st(ID, 'open', 50, { attributes: { supported_features: 7 } })).peutArreter, v(st(ID, 'unavailable', null)).peutArreter], [false, false]);
});

/* ════════════ 8 et 9. La fiche ════════════ */

const ETAT = { maintenant: '2026-10-12T15:00:00+02:00', soleil_jours: [], config: { planning: { actif: true, mode: 'auto', jours: [], volets: {} } }, volets: {} };
const maison = (states) => ({ states: Object.fromEntries(states.map(s => [s.entity_id, s])), config: { time_zone: 'Europe/Paris' }, user: { is_admin: true },
  callApi: () => new Promise(() => {}), callWS: () => new Promise(() => {}) });
const fiche = (props) => renderToStaticMarkup(createElement(Fiche, { hass: maison([st(ID, 'open', 60)]), etat: ETAT, maintenant: T, id: ID, onFiche: () => {}, ...props }));

test('point 8 — la fiche : le serveur muet, le Planning dit « Réglages indisponibles. » au lieu de « Chargement… »', () => {
  assert.ok(fiche({ etat: null, erreur: true, ongletDepart: 'planning' }).includes('Réglages indisponibles.'));
  assert.ok(fiche({ etat: null, erreur: false, ongletDepart: 'planning' }).includes('Chargement…'), 'en lecture : « Chargement… »');
  assert.ok(APP.includes('const { etat, erreur } = useEtatVolets(true, { rapide: true });') && APP.includes('etat={etat} erreur={erreur}'), 'la coquille passe `erreur`');
});

test('point 9 — la fiche : Stop et les repères inertes par aria-disabled, jamais disabled ; Stop sans STOP', () => {
  const sansStop = fiche({ hass: maison([st(ID, 'open', 60, { attributes: { supported_features: 7 } })]) });
  assert.ok(bouton(sansStop, 'Stop Volet cuisine').includes('aria-disabled="true"'));
  const muet = fiche({ hass: maison([st(ID, 'unavailable', null)]) });
  assert.ok(!/<button[^>]* disabled=""/.test(muet), 'aucun bouton disabled : le focus ne tombe pas');
  for (const nom of ['Ouvert', 'Fermé', 'Stop Volet cuisine']) assert.ok(bouton(muet, nom).includes('aria-disabled="true"'), nom);
});

/* ════════════ 10, 11 et 12 ════════════ */

test('point 10 — la bibliothèque : un VOLET (sa classe) et un garage', () => {
  assert.ok(APP.includes("'cover.biblio': s('open', { friendly_name: tr('Volet chambre'), current_position: 65, supported_features: 15, device_class: 'shutter' })"));
  assert.ok(APP.includes("'cover.biblio_garage': s('closed', { friendly_name: tr('Garage'), supported_features: 11, device_class: 'garage' })"));
  assert.ok(APP.includes("{dc.card('cover.biblio_garage')}"));
});

test('point 11 — l’en-tête d’Objets : tous muets, pas « tous fermés » ; aucun volet, pas « 0 volets »', () => {
  C.reglerCourses({ horloge: () => T, ...AU_REPOS });
  const rendre = (sts, ids) => renderToStaticMarkup(createElement(ENTETE.default, { hass: hassOrdres([], sts), titre: 'Volets', ids })).replace(/<[^>]+>/g, '');
  const muets = [st('cover.a', 'unavailable', null), st('cover.b', 'unknown', null)];
  assert.ok(rendre(muets, ['cover.a', 'cover.b']).includes('2 volets · 2 indisponibles') && !rendre(muets, ['cover.a', 'cover.b']).includes('tous fermés'));
  const melange = [st('cover.a', 'unavailable', null), st('cover.c', 'closed', 0)];
  assert.ok(rendre(melange, ['cover.a', 'cover.c']).includes('2 volets · 1 indisponible') && !rendre(melange, ['cover.a', 'cover.c']).includes('tous fermés'));
  const vide = rendre([], []);
  assert.ok(!vide.includes('volets') && !vide.includes('tous fermés'), vide);
  C.reglerCourses(AU_REPOS);
});

test('point 12 — le code mort est parti : la règle « restreignent », sa phrase, les commentaires périmés', () => {
  const sources = ['src/voletsfiche.js', 'src/fichevolet.jsx', 'src/App.jsx', 'src/voletcourse.js'].map(lire).join('\n');
  assert.ok(!sources.includes("'restreignent'") && !sources.includes('JOURS_PROPRES'));
  assert.ok(!sources.includes("tr('La maison ne bouge pas ce jour-là')"));
  assert.ok(!APP.includes('programmation nocturne'), 'ni « Détail volet … programmation nocturne », ni la feuille des chambres');
  assert.ok(!lire('src/voletcourse.js').includes("cible : 2 s'il est frais"));
});
