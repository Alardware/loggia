/* La fiche d'un volet, rendue (chantier Volets, § 3.5 à 3.8 ; ADR 0069).
 *
 * On REND la fiche (React côté serveur) sur un état de `loggia/volets/etat` à
 * la forme du § 6.1 — sans serveur, sans Home Assistant. Un rendu statique ne
 * clique pas et ne lance pas d'effet : ce que font les gestes se lit dans les
 * patchs (tests/voletsfiche.test.mjs) ; ici, ce que la fiche MONTRE :
 *  - l'en-tête (plaque, « pièce · type ») et ses onglets au motif ARIA ;
 *  - l'Accueil : le grand chiffre, la phrase, les repères, la fenêtre qui se
 *    glisse (ou pas : sans SET_POSITION, ou muet), ses rangées ;
 *  - le Planning : le choix du volet, la note, la semaine, ses heures à lui,
 *    la façade, la porte, le mode — en lecture seule pour un compte ordinaire ;
 *  - l'Historique : la période, et « Chargement… » avant la réponse.
 * Les gestes, eux, se JOUENT (tâche 12 bis, à la fin) : le module compilé tel
 * quel, ses crochets doublés — le modèle de tests/fichechauffage.test.mjs —, et
 * l'on compte ce qui part : les ordres au volet, les patchs, le focus.
 * La file des écritures, elle, se rejoue sur la VRAIE fiche et le vrai magasin
 * des volets (tests/crochets.mjs), seul le serveur doublé : une relecture qui
 * échoue n'écrit rien (relecture finale des prises, B6, tout à la fin). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import { monter, horlogeFausse, documentFaux, texteDe } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const Fiche = (await import(new URL('../src/fichevolet.jsx', import.meta.url).href)).default;

const MAINTENANT = Date.parse('2026-10-12T15:00:00+02:00');
const ISO = '2026-10-12T13:00:00.000Z';
const st = (id, state, attributes) => ({ entity_id: id, state, attributes, last_updated: ISO, last_changed: ISO });
const VOLET = (id, nom, state, pos, o = {}) => st(id, state, { friendly_name: nom, device_class: 'shutter', supported_features: 15, ...(pos == null ? {} : { current_position: pos }), ...o });
const maison = ({ admin = true, states = [] } = {}) => ({
  states: Object.fromEntries([
    VOLET('cover.volet_cuisine', 'Volet cuisine', 'open', 60),
    VOLET('cover.volet_salon', 'Volet salon', 'open', 100),
    VOLET('cover.volet_chambre', 'Volet chambre', 'closed', 0),
    st('binary_sensor.baie_vitree', 'on', { friendly_name: 'Baie vitrée', device_class: 'door' }),
    ...states,
  ].map(s => [s.entity_id, s])),
  config: { time_zone: 'Europe/Paris' }, user: { is_admin: admin },
  callApi: () => new Promise(() => {}), callWS: () => new Promise(() => {}),
});
const mvt = (sens, heure, decalage = 30) => ({ sens, heure, source: sens === 'ouverture' ? 'lever' : 'coucher', decalage });
const vol = (o = {}) => ({ regle: 'comme', a_venir: [], protection: null, abri: false, attente: null, porte: null, orientation: null, manoeuvre: null, ...o });
const ETAT = {
  maintenant: '2026-10-12T15:00:00+02:00',
  soleil_jours: [0, 1, 2, 3, 4, 5, 6].map(i => ({ date: '2026-10-1' + (2 + i), lever: '2026-10-1' + (2 + i) + 'T07:4' + Math.min(9, 7 + i) + ':00+02:00', coucher: '2026-10-1' + (2 + i) + 'T20:2' + (4 - Math.min(4, i)) + ':00+02:00' })),
  config: {
    planning: { actif: true, mode: 'auto', ouverture: { decalage: 30 }, fermeture: { decalage: 30 }, jours: [0, 1, 2, 3, 4, 5, 6],
      volets: { 'cover.volet_chambre': { perso: true, ouverture: 30, fermeture: null, jours_ouverture: [0, 1, 2, 3, 4] } } },
    soleil: { actif: true, temp_entite: 'sensor.temperature_exterieure', volets: { 'cover.volet_salon': { orientation: 225, ouverture: 90 } } },
    baies: { actif: true, volets: { 'cover.volet_salon': 'binary_sensor.baie_vitree' } },
  },
  volets: {
    'cover.volet_cuisine': vol({ a_venir: [mvt('fermeture', '2026-10-12T20:54:00+02:00')] }),
    'cover.volet_salon': vol({ orientation: 225, porte: { entite: 'binary_sensor.baie_vitree', etat: 'ouverte' }, a_venir: [mvt('fermeture', '2026-10-12T20:54:00+02:00')] }),
    'cover.volet_chambre': vol({ regle: 'perso', a_venir: [mvt('ouverture', '2026-10-13T08:17:00+02:00')] }),
  },
};
const rendre = (props) => renderToStaticMarkup(createElement(Fiche, { hass: maison(), etat: ETAT, maintenant: MAINTENANT, piece: 'Cuisine', id: 'cover.volet_cuisine', onFiche: () => {}, ...props }));
const attr = (html, nom, motif) => (new RegExp('<[^>]*' + nom + '="([^"]*)"[^>]*' + (motif || '')).exec(html) || [])[1];

test('l’en-tête : la plaque, « pièce · type », l’onglet Accueil au motif ARIA', () => {
  const html = rendre();
  assert.ok(html.includes('Volet cuisine'));
  assert.ok(html.includes('Cuisine · volet roulant'));
  assert.ok(/role="tab" aria-selected="true"[^>]*>.*?Accueil/.test(html));
  assert.ok(html.includes('role="tabpanel"'));
  assert.ok(html.includes('data-plaque=""') && html.includes('rgba(var(--o-purple-rgb),.16)'), 'ouvert : la plaque violette de la carte');
});

test('l’Accueil : le grand chiffre, la phrase longue, les repères, la fenêtre qui se glisse', () => {
  const html = rendre();
  assert.ok(/<span style="font-size:48px[^"]*">60<\/span>/.test(html));
  assert.ok(html.includes('Fermeture à 20:54 · coucher du soleil +30 min'));
  for (const nom of ['Ouvert', 'Ouvrir à 75 %', 'Ouvrir à 50 %', 'Ouvrir à 25 %', 'Fermé']) assert.ok(html.includes('aria-label="' + nom + '"'), nom);
  assert.ok(html.includes('role="slider"') && html.includes('aria-label="Position du volet"') && html.includes('aria-valuenow="60"') && html.includes('aria-orientation="vertical"'));
  assert.ok(html.includes('data-tablier=""') && html.includes('height:40%'), 'le tablier couvre 40 %');
  for (const nom of ['Ouvrir Volet cuisine', 'Stop Volet cuisine', 'Fermer Volet cuisine']) assert.ok(html.includes('aria-label="' + nom + '"'), nom);
  // Les rangées : Prochain mouvement, L'appareil — pas de porte devant la cuisine.
  assert.ok(html.includes('data-rangee="prochain"') && html.includes('>20:54<'));
  assert.ok(!html.includes('data-rangee="porte"'));
  assert.ok(html.includes('data-rangee="appareil"'));
});

test('la baie vitrée ouverte devant le salon : la rangée le dit, et ce que fera la fermeture', () => {
  const html = rendre({ id: 'cover.volet_salon', piece: 'Salon' });
  assert.ok(html.includes('Baie vitrée · ouverte') && html.includes('color:var(--o-warn)'));
  assert.ok(html.includes('Si elle l’est encore à 20:54, la fermeture attendra.'));
});

test('la colonne des repères se règle sur son mot le plus long : « Geschlossen » ne sort pas de la fiche', () => {
  // Mesuré dans la démo (13/10) : la colonne avait 64 px fixes, et « Geschlossen » en sortait
  // de 13 px vers la marge de la feuille. Une cale invisible, dans le flux, porte le mot le
  // plus long des repères : la colonne prend sa largeur, la fenêtre cède le reste.
  const html = rendre();
  const cale = /<span aria-hidden="true" data-cale-reperes=""[^>]*style="([^"]*)"[^>]*>([^<]*)</.exec(html);
  assert.ok(cale, 'la colonne des repères porte sa cale');
  assert.equal(cale[2], 'Ouvert', 'la cale porte le mot le plus long des repères');
  assert.ok(cale[1].includes('visibility:hidden') && cale[1].includes('height:0'), 'invisible, sans hauteur');
  assert.ok(/min-width:64px;height:176px/.test(html), 'la colonne garde au moins ses 64 px');
});

test('un volet qui ne sait pas se placer ne se glisse pas : Ouvert et Fermé seulement', () => {
  const hass = maison({ states: [VOLET('cover.volet_cuisine', 'Volet cuisine', 'open', null, { supported_features: 3 })] });
  const html = rendre({ hass });
  assert.ok(!html.includes('role="slider"'));
  assert.ok(html.includes('aria-label="Ouvert"') && html.includes('aria-label="Fermé"') && !html.includes('Ouvrir à 75 %'));
});

test('muet : « Indisponible », le liseré de panne, ni fenêtre ni bouton', () => {
  const hass = maison({ states: [st('cover.volet_cuisine', 'unavailable', { friendly_name: 'Volet cuisine', device_class: 'shutter', supported_features: 15 })] });
  const html = rendre({ hass });
  assert.ok(html.includes('Indisponible') && html.includes('o-panne'));
  assert.ok(!html.includes('role="slider"'));
  /* ASSERTION MODIFIÉE (tâche 12 bis, relecture des tâches 6 à 12, point 5) : Monter est inerte par
   * `aria-disabled` — il garde le focus —, plus par `disabled`. */
  assert.ok(/aria-label="Ouvrir Volet cuisine"[^>]*aria-disabled="true"/.test(html) || /aria-disabled="true"[^>]*aria-label="Ouvrir Volet cuisine"/.test(html));
});

/* TITRE MODIFIÉ (relecture des tâches 6 à 12, point 8) : il promettait que « Prochain mouvement » mène au
 * Planning, et ne regardait que la forme de la rangée. Il en reste ce qu'il voit ; le geste, lui, est
 * JOUÉ à la fin du fichier (« Prochain mouvement mène au Planning, Dernier mouvement à l’Historique »). */
test('le Planning a son onglet ; « Prochain mouvement » est un bouton', () => {
  const html = rendre();
  assert.ok(/role="tab"[^>]*>.*?<span>Planning<\/span>/.test(html));
  assert.ok(/<button[^>]*data-rangee="prochain"/.test(html), 'la rangée est un bouton');
});

test('le Planning : son choix, la note, la semaine, ses heures à lui et ses jours', () => {
  const html = rendre({ id: 'cover.volet_chambre', piece: 'Chambre', ongletDepart: 'planning' });
  assert.ok(/aria-pressed="true"[^>]*>Heures à lui</.test(html));
  assert.ok(html.includes('Ses propres heures et ses propres jours, réglés plus bas.'));
  assert.ok(html.includes('Aujourd’hui : lever 07:47, coucher 20:24'));
  assert.equal((html.match(/data-jour="/g) || []).length, 7);
  assert.ok(html.includes('data-sens="ouverture"') && html.includes('data-sens="fermeture"'));
  assert.ok(html.includes('+30 min'), 'son ouverture +30 min');
  assert.ok(html.includes('aria-label="Ouverture : Quinze minutes plus tôt"'));
  assert.equal((html.match(/aria-label="Samedi"/g) || []).length, 2, 'une puce par jour et par sens');
  assert.ok(html.includes('Aucune façade') && html.includes('Auto lever/coucher'));
});

test('le Planning du salon : sa façade, sa porte ; un compte ordinaire lit tout et n’écrit rien', () => {
  const html = rendre({ id: 'cover.volet_salon', piece: 'Salon', ongletDepart: 'planning' });
  assert.ok(html.includes('Façade sud-ouest') && html.includes('Baie vitrée'));
  assert.ok(html.includes('aria-haspopup="listbox"'), 'les rangées ouvrent une liste de choix, jamais un <select>');
  const lu = renderToStaticMarkup(createElement(Fiche, { hass: maison({ admin: false }), etat: ETAT, maintenant: MAINTENANT, id: 'cover.volet_salon', piece: 'Salon', ongletDepart: 'planning' }));
  assert.ok(!lu.includes('aria-haspopup="listbox"'), 'plus de liste à ouvrir');
  assert.ok((lu.match(/aria-disabled="true"/g) || []).length >= 6, 'les choix sont inertes');
  assert.ok(lu.includes('Façade sud-ouest'), 'tout se lit');
});

test('l’Historique : 24 h ou 7 jours, et « Chargement… » avant la réponse', () => {
  const html = rendre({ ongletDepart: 'historique' });
  assert.ok(/aria-pressed="true"[^>]*>24 h</.test(html));
  assert.ok(html.includes('Chargement…'));
  assert.ok(html.includes('Manœuvres'));
});

/* TITRE MODIFIÉ (relecture des tâches 6 à 12, point 8) : « mène à l’Historique » se JOUE désormais à la fin
 * du fichier ; ici, l'ordre des onglets et la forme de la rangée. */
test('trois onglets, dans l’ordre ; « Dernier mouvement » est un bouton', () => {
  const html = rendre();
  assert.deepEqual([...html.matchAll(/role="tab"[^>]*>.*?<span>([^<]+)<\/span>/g)].map(m => m[1]), ['Accueil', 'Planning', 'Historique']);
  assert.ok(/<button[^>]*data-rangee="dernier"/.test(html));
});

/* ════════════ Tâche 12 bis : les finitions des relectures (13/10), les gestes joués ════════════ */

const lire = (chemin) => readFileSync(new URL('../' + chemin, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const SOURCE = lire('src/fichevolet.jsx');
const CSS = lire('src/index.css');
const { vueVolet } = await import('../src/voletecran.js');
const { fusionConfig } = await import('../src/voletsfiche.js');

/* Le module compilé tel quel, chaque import pris dans son vrai module, sauf ce que le test double :
 * ses composants se JOUENT sans React (le modèle de tests/fichechauffage.test.mjs). */
async function compilable(chemin) {
  const texte = lire('src/' + chemin);
  const portee = {};
  for (const [, noms, spec] of texte.matchAll(/^import \{([\s\S]*?)\} from '([^']+)';$/gm)) {
    const m = spec === 'react' ? await import('react') : await import(new URL('../src/' + spec.slice(2), import.meta.url).href);
    noms.split(',').map(x => x.trim()).filter(Boolean).forEach(n => { portee[n] = m[n]; });
  }
  const code = transformSync(texte.replace(/^import [\s\S]*?';$/gm, '').replace(/^export (default )?(function|const) /gm, '$2 '),
    { loader: 'jsx', jsx: 'transform', jsxFactory: '__h', jsxFragment: '__Frag' }).code;
  return (doubles, rendu) => {
    const p = { ...portee, ...doubles };
    const noms = Object.keys(p);
    return new Function('__h', '__Frag', ...noms, code + '\nreturn ' + rendu + ';')(createElement, Fragment, ...noms.map(n => p[n]));
  };
}
const FICHE = await compilable('fichevolet.jsx');

/* Les éléments de l'arbre qui répondent à `t` (sans déplier les composants). */
function chercher(el, t, acc = []) {
  if (!el || typeof el !== 'object') return acc;
  if (Array.isArray(el)) { el.forEach(x => chercher(x, t, acc)); return acc; }
  if (t(el)) acc.push(el);
  if (el.props && typeof el.props.children !== 'function') chercher(el.props.children, t, acc);
  return acc;
}
const evt = (o = {}) => ({ preventDefault() {}, stopPropagation() {}, ...o });

/* La fenêtre JOUÉE : ses références et ses effets survivent d'un rendu à l'autre (un effet repasse quand
 * ses dépendances changent), `glisse` — l'état de l'Accueil — est tenu ici, les minuteries vont à la
 * main. `premier` : l'arbre d'un rendu avant ses effets. */
function jouerFenetre(depart = {}) {
  const refs = [], effets = [], minuteries = new Map();
  let num = 0, rangRef = 0, rangEffet = 0, glisse = depart.glisse != null ? depart.glisse : null;
  const vises = [], envois = [];
  const { Fenetre } = FICHE({
    useRef: (v) => { const k = rangRef++; if (!(k in refs)) refs[k] = { current: v }; return refs[k]; },
    useEffect: (f, deps) => {
      const k = rangEffet++; const a = effets[k];
      if (!a || !deps || deps.length !== a.deps.length || deps.some((d, i) => !Object.is(d, a.deps[i]))) effets[k] = { f, deps: deps || [], nettoie: a ? a.nettoie : null, neuf: true };
    },
    setTimeout: (f, ms) => { num += 1; minuteries.set(num, { f, ms }); return num; },
    clearTimeout: (id) => { minuteries.delete(id); },
  }, '{ Fenetre }');
  const props = { pos: 60, cible: null, place: true, muet: false, ...depart };
  delete props.glisse;
  const onGlisse = (v) => { vises.push(v); glisse = v; };
  const onEnvoyer = (v) => { envois.push(v); };
  let arbre = null, premier = null;
  const rendre = () => {
    for (let tour = 0; tour < 4; tour++) {
      const avant = glisse;
      rangRef = 0; rangEffet = 0;
      arbre = Fenetre({ ...props, glisse, onGlisse, onEnvoyer });
      if (tour === 0) premier = arbre;
      effets.forEach(e => { if (e.neuf) { if (e.nettoie) e.nettoie(); const r = e.f(); e.nettoie = typeof r === 'function' ? r : null; e.neuf = false; } });
      if (Object.is(avant, glisse)) break;
    }
  };
  rendre();
  const doigt = { getBoundingClientRect: () => ({ top: 0, height: 100 }), setPointerCapture() {} };
  return {
    vises, envois, minuteries,
    get arbre() { return arbre; }, get premier() { return premier; }, get glisse() { return glisse; },
    touche(key) { arbre.props.onKeyDown(evt({ key })); rendre(); },
    relache(key) { if (arbre.props.onKeyUp) arbre.props.onKeyUp(evt({ key })); rendre(); },
    attendre(ms) { for (const [id, m] of [...minuteries]) if (m.ms <= ms) { minuteries.delete(id); m.f(); } rendre(); },
    pointeur(quoi, y) { const h = arbre.props['onPointer' + quoi]; if (h) h(evt({ clientY: y, pointerId: 1, currentTarget: doigt })); rendre(); },
    regler(o) { Object.assign(props, o); rendre(); },
  };
}
const tirets = (arbre) => { const c = chercher(arbre, el => el.props && el.props['data-cible'] === '')[0]; return c ? c.props.style.top : null; };

test('relecture des tâches 6 à 12, point 1 — le clavier de la fenêtre : le pas part de la CIBLE, un seul ordre à la fin de la rafale', () => {
  // À 60 %, quatre flèches vers le bas, vite : la cible suit (55, 50, 45, 40), rien ne part encore.
  const f = jouerFenetre({ pos: 60 });
  for (let i = 0; i < 4; i++) f.touche('ArrowDown');
  assert.deepEqual(f.envois, [], 'rien ne part pendant la rafale (avant : 55, 55, 55, 55)');
  assert.deepEqual(f.vises, [55, 50, 45, 40], 'chaque appui part de la cible, pas de la position dessinée');
  assert.equal(tirets(f.arbre), '60%', 'la cible en tirets suit');
  assert.equal(f.arbre.props['aria-valuenow'], 40, 'le curseur dit la valeur visée');
  f.relache('ArrowDown');
  assert.deepEqual(f.envois, [40], 'touche relâchée : UN ordre, vers 40');
  assert.deepEqual([f.glisse, tirets(f.arbre), f.minuteries.size], [null, null, 0]);
  // Une flèche TENUE (la répétition du clavier) : un seul ordre, au relâché.
  const tenue = jouerFenetre({ pos: 60 });
  for (let i = 0; i < 30; i++) tenue.touche('ArrowUp');
  tenue.relache('ArrowUp');
  assert.deepEqual(tenue.envois, [100]);
  // Sans relâché (le focus est parti) : 500 ms sans touche finissent la rafale.
  const sans = jouerFenetre({ pos: 60 });
  sans.touche('ArrowUp'); sans.touche('PageUp');
  sans.attendre(499);
  assert.deepEqual(sans.envois, [], '499 ms : la rafale court encore');
  sans.attendre(500);
  assert.deepEqual(sans.envois, [75]);
  // En pleine course vers 0 (dessinée à 42 %), le pas part de la cible de la course.
  const course = jouerFenetre({ pos: 42, cible: 0 });
  course.touche('ArrowUp'); course.relache('ArrowUp');
  assert.deepEqual(course.envois, [5]);
  // Revenue d'où elle partait, la rafale n'envoie rien ; Fin vise le bout.
  const retour = jouerFenetre({ pos: 60 });
  retour.touche('ArrowUp'); retour.touche('ArrowDown'); retour.relache('ArrowDown');
  assert.deepEqual(retour.envois, []);
  const fin = jouerFenetre({ pos: 60 });
  fin.touche('End'); fin.relache('End');
  assert.deepEqual(fin.envois, [100]);
  // Deux touches dans la même tâche, avant tout rendu : la seconde part de la première (mesuré dans la démo).
  const vite = jouerFenetre({ pos: 60 });
  const arbre = vite.arbre;
  arbre.props.onKeyDown(evt({ key: 'ArrowUp' })); arbre.props.onKeyDown(evt({ key: 'ArrowUp' }));
  vite.relache('ArrowUp');
  assert.deepEqual(vite.envois, [70]);
});

test('relecture des tâches 6 à 12, point 3 — muet en plein glisser : rien ne reste collé', () => {
  const f = jouerFenetre({ pos: 60 });
  f.pointeur('Down', 60);
  assert.equal(f.glisse, 40, 'le doigt vise 40 %');
  f.regler({ muet: true });                      // le volet devient injoignable, le doigt toujours posé
  assert.equal(typeof f.premier.props.onPointerUp, 'function', 'les gestionnaires restent tant qu’un geste est en cours');
  assert.equal(f.glisse, null, '« Relâchez pour aller à 40 % » ne reste pas collé');
  f.pointeur('Up', 60);
  assert.deepEqual(f.envois, [], 'muet : rien ne part');
  // Le survol d'une souris sans bouton n'est pas un glisser : il ne vise rien.
  const survol = jouerFenetre({ pos: 60 });
  survol.touche('ArrowUp');
  survol.pointeur('Move', 10);
  assert.equal(survol.glisse, 65);
  // Une rafale du clavier s'éteint aussi, sans ordre.
  const k = jouerFenetre({ pos: 60 });
  k.touche('ArrowUp');
  k.regler({ muet: true });
  k.attendre(500);
  assert.deepEqual([k.glisse, k.envois, k.minuteries.size], [null, [], 0]);
});

/* L'Accueil JOUÉ : ses crochets doublés (rien en vol, aucun historique lu), et ce qui part relevé. */
function jouerAccueil({ hass = maison(), id = 'cover.volet_cuisine', etat = ETAT, t = MAINTENANT } = {}) {
  const ordres = [], onglets = [];
  const { OngletAccueil } = FICHE({
    useState: (v) => [typeof v === 'function' ? v() : v, () => {}], useRef: (v) => ({ current: v }), useEffect: () => {},
    commander: (h, x, capacite, valeur) => { ordres.push([capacite, x, valeur]); return true; },
    lancerCourse: () => {}, arreterCourse: () => {},
  }, '{ OngletAccueil }');
  const st = hass.states[id];
  const v = (etat.volets || {})[id] || null;
  const course = { pos: null, enCourse: false, sens: null, cible: null };
  const vue = vueVolet({ st, course, v, etat });
  const arbre = OngletAccueil({ hass, id, st, v, etat, vue, course, onOnglet: (o) => onglets.push(o), onFiche: () => {}, t });
  const bouton = (nom) => chercher(arbre, el => el.type === 'button' && el.props['aria-label'] === nom)[0];
  const rangee = (nom) => chercher(arbre, el => el.props && el.props['data-rangee'] === nom)[0];
  return { arbre, ordres, onglets, bouton, rangee };
}

test('relecture des tâches 6 à 12, point 5 — Monter et Descendre de la fiche gardent le focus : aria-disabled, l’appui ignoré', () => {
  const ouvert = jouerAccueil({ hass: maison({ states: [VOLET('cover.volet_cuisine', 'Volet cuisine', 'open', 100)] }) });
  const monter = ouvert.bouton('Ouvrir Volet cuisine');
  assert.equal(monter.props['aria-disabled'], true, 'inerte, il le dit');
  assert.equal(monter.props.disabled, undefined, 'jamais disabled : le focus tomberait sur la page à l’arrivée d’une course');
  monter.props.onClick(evt());
  assert.deepEqual(ouvert.ordres, [], 'l’appui sur un bouton inerte ne part pas');
  ouvert.bouton('Fermer Volet cuisine').props.onClick(evt());
  assert.deepEqual(ouvert.ordres, [['close', 'cover.volet_cuisine', undefined]]);
  const ferme = jouerAccueil({ hass: maison({ states: [VOLET('cover.volet_cuisine', 'Volet cuisine', 'closed', 0)] }) });
  const descendre = ferme.bouton('Fermer Volet cuisine');
  assert.deepEqual([descendre.props['aria-disabled'], descendre.props.disabled], [true, undefined]);
  descendre.props.onClick(evt());
  assert.deepEqual(ferme.ordres, []);
});

test('relecture des tâches 6 à 12, point 8 — « Prochain mouvement » mène au Planning, « Dernier mouvement » à l’Historique (joué)', () => {
  const j = jouerAccueil();
  j.rangee('prochain').props.onClick(evt());
  j.rangee('dernier').props.onClick(evt());
  assert.deepEqual(j.onglets, ['planning', 'historique']);
});

test('relecture du 13/10 (tâche 10) — « Porte devant » suit le mouvement UTILE : à 02:19, le salon ouvert saute l’ouverture de 08:17 ; sa fermeture de 20:54 attendra', () => {
  const NUIT = '2026-10-12T02:19:00+02:00';
  const salon = (a_venir) => ({ ...ETAT, maintenant: NUIT, volets: { ...ETAT.volets, 'cover.volet_salon': vol({ orientation: 225, porte: { entite: 'binary_sensor.baie_vitree', etat: 'ouverte' }, a_venir }) } });
  const aVenir = [mvt('ouverture', '2026-10-12T08:17:00+02:00'), mvt('fermeture', '2026-10-12T20:54:00+02:00')];
  const html = rendre({ id: 'cover.volet_salon', piece: 'Salon', etat: salon(aVenir), maintenant: Date.parse(NUIT) });
  assert.ok(html.includes('Si elle l’est encore à 20:54, la fermeture attendra.'), 'la fermeture de ce soir, pas l’ouverture sautée');
  // Le mouvement utile est une fermeture de DEMAIN : la phrase générale (« à Demain 20:52 » ne se lirait pas).
  const demain = rendre({ id: 'cover.volet_salon', piece: 'Salon', etat: salon([mvt('ouverture', '2026-10-12T08:17:00+02:00'), mvt('fermeture', '2026-10-13T20:52:00+02:00')]), maintenant: Date.parse(NUIT) });
  assert.ok(demain.includes('Le volet ne ferme pas sur une porte ouverte.'));
  // Fermé, une fermeture n'est pas utile : la phrase générale.
  const ferme = rendre({ id: 'cover.volet_salon', piece: 'Salon', etat: salon([mvt('fermeture', '2026-10-12T20:54:00+02:00')]), maintenant: Date.parse(NUIT),
    hass: maison({ states: [VOLET('cover.volet_salon', 'Volet salon', 'closed', 0)] }) });
  assert.ok(ferme.includes('Le volet ne ferme pas sur une porte ouverte.'));
});

/* Le Planning JOUÉ : `err` est l'état posé d'avance (le refus), `file` la file de la fiche, doublée. */
function jouerPlanning({ ordinaire = false, err = null, id = 'cover.volet_salon', etat = ETAT, hass = maison() } = {}) {
  const poses = [], avances = [], files = [], ecrits = [];
  let rang = 0;
  const { OngletPlanning, Choix } = FICHE({
    useState: (v) => { const k = rang++; return [k === 0 && err !== null ? err : (typeof v === 'function' ? v() : v), (x) => poses.push([k, x])]; },
    useRef: (v) => ({ current: v }), useEffect: () => {},
    useOptimiste: () => [null, (x) => avances.push(x)],
    ecrireRegle: (h, type, patch) => { ecrits.push([type, patch]); return Promise.resolve({ config: fusionConfig(etat.config, patch) }); },
  }, '{ OngletPlanning, Choix }');
  const file = (fabriquer, envoyer) => { files.push({ fabriquer, envoyer }); return Promise.resolve(null); };
  const arbre = OngletPlanning({ hass, id, etat, ordinaire, file });
  const rangee = (titre) => chercher(arbre, el => el.props && el.props.titre === titre)[0];
  const choix = chercher(arbre, el => el.type === Choix && el.props.nom === 'Lever et coucher du soleil')[0];
  return { arbre, poses, avances, files, ecrits, rangee, choix };
}

test('relecture des tâches 6 à 12, point 2 — un réglage passe par la file de la fiche : montré d’avance, son patch bâti à l’écriture sur la configuration relue, et ne portant que SON volet', async () => {
  const j = jouerPlanning({ id: 'cover.volet_cuisine' });
  j.choix.props.onChoisir('jamais');
  assert.equal(j.ecrits.length, 0, 'rien ne part en direct');
  assert.equal(j.files.length, 1, 'une écriture remise à la file');
  assert.deepEqual(j.avances[0].planning.volets['cover.volet_cuisine'], { exclu: true }, 'montré d’avance, sur ce qui est affiché');
  // Un autre appareil vient d'écrire : la file a relu, le patch se bâtit sur SA configuration.
  const relue = { ...ETAT.config, planning: { ...ETAT.config.planning, volets: { ...ETAT.config.planning.volets, 'cover.autre': { exclu: true } } } };
  const patch = j.files[0].fabriquer(relue);
  // ASSERTION MODIFIÉE (25/10, fusion volet par volet) : le patch ne porte plus la table entière (autre, chambre,
  // cuisine) mais la cuisine seule ; le serveur fusionne volet par volet (`_poser_patch`, miroir `fusionConfig`).
  assert.deepEqual(patch, { planning: { volets: { 'cover.volet_cuisine': { exclu: true } } } }, 'le patch ne porte que le volet de la fiche');
  // ASSERTION MODIFIÉE (25/10, fusion volet par volet) : ce que l'autre appareil a écrit n'est plus gardé par le
  // contenu du patch, mais par la fusion : posé sur la configuration relue, il garde « cover.autre » et la chambre.
  assert.deepEqual(Object.keys(fusionConfig(relue, patch).planning.volets).sort(), ['cover.autre', 'cover.volet_chambre', 'cover.volet_cuisine'],
    'fusionné sur la configuration relue, rien d’autre n’est effacé');
  await j.files[0].envoyer(patch);
  assert.deepEqual(j.ecrits, [['loggia/volets/config', patch]], 'un patch, une écriture');
});

test('relecture des tâches 6 à 12, point 6 — un refus se dit sous la rangée touchée, pas en tête de l’onglet', () => {
  const { arbre } = jouerPlanning({ err: { ou: 'facade', texte: 'Refusé.' } });
  const alertes = chercher(arbre, el => el.props && el.props.role === 'alert');
  assert.equal(alertes.length, 1);
  assert.equal(alertes[0].props.children, 'Refusé.');
  const regles = chercher(arbre, el => el.props && el.props['data-panneau'] === 'regles')[0];
  const enfants = [].concat(regles.props.children).filter(Boolean);
  const i = enfants.indexOf(alertes[0]);
  assert.ok(i > 0 && enfants[i - 1].props.titre === 'Protection solaire', 'juste sous la rangée de la façade');
  // Le choix « Comme les autres · Heures à lui · Jamais » : sous lui, dans son panneau.
  const soleil = jouerPlanning({ err: { ou: 'regle', texte: 'Non.' } });
  const panneau = chercher(soleil.arbre, el => el.props && el.props['data-panneau'] === 'soleil')[0];
  assert.equal(chercher(panneau, el => el.props && el.props.role === 'alert').length, 1);
  // Un compte ordinaire : l'appui sur une rangée inerte dit le refus SOUS elle.
  const lu = jouerPlanning({ ordinaire: true });
  lu.rangee('Porte devant').props.surInerte();
  const [[rang, refus]] = lu.poses;
  assert.equal(rang, 0);
  assert.equal(refus.ou, 'porte');
  assert.ok(refus.texte.includes('loggia_volets'), 'le refus nomme la clé');
  assert.equal(lu.files.length, 0, 'rien n’est remis à la file');
});

test('relecture du 13/10 (tâche 11) — le Planning à 360 px : − valeur + passent sous le titre plutôt que sous la sous-ligne ; les valeurs vont à la ligne (seul un nom d’entité finit en « … ») ; la colonne des heures prend sa place ; l’échelle ne se touche plus', () => {
  const html = rendre({ id: 'cover.volet_chambre', piece: 'Chambre', ongletDepart: 'planning' });
  const sens = /<div data-sens="ouverture"[^>]*><div style="([^"]*)"><span style="([^"]*)">/.exec(html);
  assert.ok(sens && sens[1].includes('flex-wrap:wrap') && sens[2].includes('flex:1 1 90px') && sens[2].includes('min-width:min-content'), sens && sens.slice(1).join(' | '));
  assert.ok(html.includes('grid-template-columns:minmax(30px, max-content) minmax(0, 1fr) minmax(92px, max-content)'), 'la colonne des heures tient « Zostaje zamknięta »');
  // L'échelle : chaque heure centrée sur son repère ; les quarts (6 h, 18 h) se retirent quand la piste est étroite.
  const echelle = /<span aria-hidden="true" class="o-volet-echelle"[^>]*>(.*?)<\/span><span><\/span><\/div>/.exec(html);
  assert.ok(echelle, 'l’échelle a sa classe');
  assert.deepEqual([...echelle[1].matchAll(/data-repere="(\w+)"/g)].map(m => m[1]), ['bout', 'quart', 'milieu', 'quart', 'bout']);
  assert.equal((echelle[1].match(/transform:translateX\(-50%\)/g) || []).length, 5, 'centrées sur leur repère');
  assert.ok(!/data-long/.test(echelle[0]), 'en français, les heures sont courtes');
  assert.ok(CSS.includes('.o-volet-echelle { container-type: inline-size; }'));
  assert.ok(CSS.includes('@container (width < 120px) { .o-volet-echelle > [data-repere="quart"] { display: none; } }'));
  assert.ok(CSS.includes('@container (width < 210px) { .o-volet-echelle[data-long] > [data-repere="quart"] { display: none; } }'));
  assert.ok(CSS.includes('@container (width < 110px) { .o-volet-echelle[data-long] > [data-repere="milieu"] { display: none; } }'));
  // Les rangées › : façade et mode passent à la ligne ; la porte, un nom de Home Assistant, peut finir en « … ».
  const salon = rendre({ id: 'cover.volet_salon', piece: 'Salon', ongletDepart: 'planning' });
  const valeur = (mot) => (new RegExp('<span style="([^"]*)">' + mot + '</span>').exec(salon) || [])[1] || '';
  assert.ok(valeur('Façade sud-ouest').includes('white-space:normal') && !valeur('Façade sud-ouest').includes('ellipsis'));
  assert.ok(valeur('Auto lever/coucher').includes('white-space:normal'));
  assert.ok(valeur('Baie vitrée').includes('text-overflow:ellipsis'), 'un nom d’entité peut finir en « … »');
});

test('relecture du 13/10 (tâche 12) — l’Historique au téléphone : la pastille passe sous le texte, le motif garde sa largeur ; « Fermé » ne sort plus de la courbe', () => {
  const { LigneManoeuvre } = FICHE({}, '{ LigneManoeuvre }');
  const m = { t: Date.parse('2026-10-12T13:05:00+02:00'), pos: 30, quoi: 'Mis à 30 %', motif: 'Soleil sur la façade ouest, 26° dehors', qui: { mot: 'Protection solaire', sous: 'protection solaire', glyphe: 'sun' } };
  const html = renderToStaticMarkup(createElement(LigneManoeuvre, { m, t: MAINTENANT, fuseau: 'Europe/Paris' }));
  assert.ok(html.startsWith('<div class="o-volet-manoeuvre" data-manoeuvre=""'), html.slice(0, 80));
  assert.ok(/<span data-qui="sun"/.test(html) && html.includes('Protection solaire'));
  assert.ok(CSS.includes('.o-volet-manoeuvre { display: grid; grid-template-columns: 84px minmax(0, 1fr) auto; align-items: center; column-gap: 12px; }'));
  const MOBILE = '@media (max-width: 760px) {\n  .o-volet-manoeuvre { grid-template-columns: 84px minmax(0, 1fr); row-gap: 6px; }\n  .o-volet-manoeuvre > [data-qui] { grid-column: 2; justify-self: start; max-width: 100%; white-space: normal; }\n}';
  assert.ok(CSS.includes(MOBILE), 'au téléphone, la pastille passe sous le texte');
  // La courbe : la colonne de ses étiquettes prend la largeur du mot le plus long (« Geschlossen »).
  assert.ok(SOURCE.includes("gridTemplateColumns: 'minmax(38px, max-content) minmax(0, 1fr)'"));
  assert.ok(!SOURCE.includes('paddingLeft: 44'), 'plus de colonne de 38 px où « Geschlossen » débordait');
});

/* ════════════ Relecture finale des prises (14/10) : la file d'écriture, rejouée sur la vraie fiche (B6) ════════════
 *
 * La relecture finale de la fiche des prises a trouvé ce défaut dans le code qu'elles partagent avec les volets. La file
 * (`fileEcritures`) bâtit le patch sur `reference || {}` ; or les patchs d'un volet envoient des tables ENTIÈRES
 * (`planning.volets`, `soleil.volets`, `baies.volets`), que le serveur remplaçait d'un bloc jusqu'au 25/10 (il fusionne désormais volet par volet). Une relecture ratée sur un
 * cache vide envoyait donc la façade d'UN volet seule — et effaçait celle de tous les autres ; sur un cache de 15 s,
 * elle ignorait ce qu'un autre appareil venait d'écrire.
 *
 * Ici : la vraie fiche (`Fiche`), sa vraie file, le vrai magasin des volets (voletsetat.js) ; seul le serveur est
 * doublé, et il range les patchs comme le vrai (volet par volet, `null` retire, depuis le 25/10). Le harnais ne dessine pas un composant
 * enfant : l'onglet Planning se monte à part, avec les props — dont la file — que la fiche lui passe. */
const E = await import('../src/voletsetat.js');
const attendre = () => new Promise(r => setImmediate(r));
const copie = (x) => JSON.parse(JSON.stringify(x));
const echoue = () => Promise.reject({ code: 'unknown_command' });
const SALON = { orientation: 225, ouverture: 90 };      // la façade du salon, dans ETAT
const AUTRE = { orientation: 90, ouverture: 90 };       // celle qu'un AUTRE appareil vient de poser
const CUISINE = (deg) => ({ orientation: deg, ouverture: 90 });
const facades = (volets) => ({ ...ETAT.config, soleil: { ...ETAT.config.soleil, volets } });
const etatAvec = (volets) => ({ ...copie(ETAT), config: copie(facades(volets)) });
const PANNE = 'Enregistrement impossible — le composant ne répond pas.';

async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  try { return await fn(); } finally { E.reglerVoletsEtat(); h.restaurer(); d.restaurer(); }
}

/* Le serveur : il note chaque message, rend l'état de `w.config` (ce que les autres appareils ont écrit s'y lit) et
 * range les patchs comme le vrai. Le magasin des volets est branché dessus. */
function monde() {
  const w = { messages: [], config: copie(ETAT.config) };
  w.reponses = {
    'loggia/volets/etat': () => Promise.resolve({ ...copie(ETAT), config: copie(w.config) }),
    'loggia/volets/config': (msg) => { w.config = fusionConfig(w.config, copie(msg.patch)); return Promise.resolve({ config: copie(w.config) }); },
  };
  const callWS = (msg) => { w.messages.push(msg); const f = w.reponses[msg.type]; return f ? f(msg) : Promise.reject({ code: 'unknown_command', message: msg.type }); };
  w.hass = { ...maison(), callWS };
  E.reglerVoletsEtat({ hass: { callWS }, horloge: { repeter: () => 0, arreter: () => {}, plusTard: () => 0, annuler: () => {} } });
  w.de = (type) => w.messages.filter(x => x.type === type);
  w.ecritures = () => w.de('loggia/volets/config').map(x => x.patch);
  return w;
}

/* La fiche de `id` sur son Planning. La coquille (App.jsx, `FicheVolet`) s'abonne à l'état des volets, en `rapide`,
 * tant que la fiche est ouverte : le test fait de même. */
function ouvrirPlanning(w, id) {
  E.abonnerVolets({ rapide: true });
  const fiche = monter(Fiche, { hass: w.hass, id, etat: ETAT, maintenant: MAINTENANT, piece: 'Cuisine', ongletDepart: 'planning' });
  const onglet = fiche.trouver(e => e.props && typeof e.props.file === 'function' && e.props.ordinaire !== undefined)[0];
  assert.ok(onglet, 'la fiche passe sa file au Planning');
  return monter(onglet.type, onglet.props);
}
const rangee = (p, titre) => p.trouver(e => e.props && e.props.titre === titre)[0];
const alertes = (p) => p.trouver(e => e.props && e.props.role === 'alert').map(e => texteDe(e));
// L'alerte posée juste SOUS une rangée du panneau des règles, ou null.
function sous(p, titre) {
  const enfants = [].concat(p.trouver(e => e.props && e.props['data-panneau'] === 'regles')[0].props.children).filter(Boolean);
  const suivant = enfants[enfants.findIndex(x => x.props && x.props.titre === titre) + 1];
  return suivant && suivant.props && suivant.props.role === 'alert' ? texteDe(suivant) : null;
}
// Le geste : la rangée « Protection solaire » reçoit le degré, comme la liste de choix le lui donne.
const choisirFacade = (p, deg) => { rangee(p, 'Protection solaire').props.onChoix(String(deg)); p.effets(); };
const facadeDite = (p) => rangee(p, 'Protection solaire').props.valeur;

test('relecture finale des prises (B6) — une relecture qui ÉCHOUE sur un cache VIDE n’écrit RIEN : la façade d’un volet ne part pas seule, l’avance s’annule, la rangée touchée dit l’échec', () => dans(async () => {
  const w = monde();
  w.reponses['loggia/volets/etat'] = echoue;
  const p = ouvrirPlanning(w, 'cover.volet_cuisine');
  await attendre();
  assert.deepEqual([E.lireEtatVolets().etat, E.lireEtatVolets().erreur], [null, true], 'rien n’a jamais été lu');
  assert.equal(facadeDite(p), 'Aucune façade');
  choisirFacade(p, 180);
  assert.equal(facadeDite(p), 'Façade sud', 'l’avance se montre aussitôt');
  await attendre(); await attendre(); p.rendre();
  assert.deepEqual(w.ecritures(), [], 'AUCUNE écriture : bâtie sur `{}`, le patch perdrait ce que la cuisine avait déjà (son ouverture)');
  assert.equal(sous(p, 'Protection solaire'), PANNE, 'la rangée touchée le dit, sous elle');
  assert.deepEqual(alertes(p), [PANNE]);
  assert.equal(facadeDite(p), 'Aucune façade', 'et l’avance est annulée : la cuisine n’a pas de façade');
}));

test('relecture finale des prises (B6) — une relecture qui ÉCHOUE sur un cache VIEUX n’écrit rien non plus ; le serveur revenu, l’appui suivant écrit sur la relecture', () => dans(async () => {
  const w = monde();
  const p = ouvrirPlanning(w, 'cover.volet_cuisine');
  await attendre();                                            // la coquille a lu l'état : le cache est plein
  assert.equal(E.lireEtatVolets().erreur, false);
  // Entre-temps, un autre appareil a posé la façade d'un autre volet : le serveur le sait, le cache non — et la relecture de la file ne revient plus.
  w.config = facades({ 'cover.volet_salon': SALON, 'cover.autre': AUTRE });
  w.reponses['loggia/volets/etat'] = () => Promise.reject(new Error('coupure'));
  choisirFacade(p, 180);
  await attendre(); await attendre(); p.rendre();
  assert.deepEqual(w.ecritures(), [], 'pas d’écriture bâtie sur le cache : le patch reposerait sur un réglage périmé de ce volet');
  assert.equal(E.lireEtatVolets().erreur, true, 'le magasin publie l’erreur de cette lecture');
  assert.equal(sous(p, 'Protection solaire'), PANNE);
  assert.equal(facadeDite(p), 'Aucune façade', 'l’avance est annulée');
  // Le serveur revient : l'appui suivant écrit, sur la configuration relue.
  w.reponses['loggia/volets/etat'] = () => Promise.resolve({ ...copie(ETAT), config: copie(w.config) });
  choisirFacade(p, 90);
  await attendre(); await attendre(); p.rendre();
  // ASSERTION MODIFIÉE (25/10, fusion volet par volet) : le patch ne porte que la cuisine (avant : la table entière,
  // salon et autre compris) ; c'est la fusion du serveur qui garde la façade posée ailleurs — vérifiée juste après.
  assert.deepEqual(w.ecritures(), [{ soleil: { volets: { 'cover.volet_cuisine': CUISINE(90) } } }],
    'une seule écriture, et elle ne porte que le volet de la fiche');
  // ASSERTION MODIFIÉE (25/10, fusion volet par volet) : la garantie « la façade posée ailleurs n'est pas effacée »
  // se lit désormais sur l'état du faux serveur après l'écriture, plus dans le patch.
  assert.deepEqual(w.config.soleil.volets, { 'cover.volet_salon': SALON, 'cover.autre': AUTRE, 'cover.volet_cuisine': CUISINE(90) },
    'au serveur, la façade posée ailleurs est gardée');
  assert.equal(sous(p, 'Protection solaire'), null, 'et l’échec s’efface avec le geste qui réussit');
}));

test('relecture finale des prises (B6) — une réponse DÉPASSÉE par une plus fraîche n’est pas une panne : le cache, le plus frais, sert de base', () => dans(async () => {
  let repondre;
  const w = monde();
  const p = ouvrirPlanning(w, 'cover.volet_cuisine');
  await attendre();
  // La relecture de la file part, mais sa réponse tarde ; une écriture plus fraîche a posé l'état entre-temps.
  w.reponses['loggia/volets/etat'] = () => new Promise((ok) => { repondre = ok; });
  choisirFacade(p, 180);
  await attendre();
  assert.equal(typeof repondre, 'function', 'la relecture de la file est partie');
  // DONNÉE AJOUTÉE (25/10, fusion volet par volet) : le patch ne porte plus que la cuisine, donc la base ne s'y lit plus
  // par les autres volets ; elle s'y lit par l'ouverture d'avant de la cuisine (`patchFacade` la reprend) : 70 dans
  // le cache frais, rien dans la vieille réponse (qui donnerait 90).
  const cuisineFraiche = { orientation: 45, ouverture: 70 };
  E.poserEtatVolets(etatAvec({ 'cover.volet_salon': SALON, 'cover.autre': AUTRE, 'cover.volet_cuisine': cuisineFraiche }));   // plus frais que la lecture en vol
  repondre(etatAvec({}));                                                                 // la vieille réponse arrive : ignorée, sans erreur
  await attendre(); await attendre(); p.rendre();
  assert.equal(E.lireEtatVolets().erreur, false, 'aucune erreur publiée');
  // ASSERTION MODIFIÉE (25/10, fusion volet par volet) : le patch ne porte que la cuisine ; qu'il soit bâti sur le cache
  // le plus frais se prouve par l'ouverture de 70 reprise de ce cache (la vieille réponse aurait donné 90).
  assert.deepEqual(w.ecritures(), [{ soleil: { volets: { 'cover.volet_cuisine': { orientation: 180, ouverture: 70 } } } }],
    'le cache le plus frais est la base — pas la vieille réponse (qui aurait donné une ouverture de 90)');
  // ASSERTION MODIFIÉE (25/10, fusion volet par volet) : au serveur, la fusion garde la façade du salon qu'il avait.
  assert.deepEqual(w.config.soleil.volets, { 'cover.volet_salon': SALON, 'cover.volet_cuisine': { orientation: 180, ouverture: 70 } },
    'la fusion du serveur n’efface pas le salon');
  assert.deepEqual(alertes(p), []);
}));

test('relecture finale des prises (B6) — une réponse FRAÎCHE fait la base du patch : il ne porte que la cuisine, et la fusion du serveur garde ce qu’un autre appareil vient d’écrire', () => dans(async () => {
  const w = monde();
  const p = ouvrirPlanning(w, 'cover.volet_cuisine');
  await attendre();
  // DONNÉE AJOUTÉE (25/10, fusion volet par volet) : l'autre appareil a aussi posé une façade à la cuisine, ouverture 70 ;
  // le patch ne portant plus les autres volets, c'est cette ouverture reprise qui prouve que la relecture fait la base.
  const cuisineAilleurs = { orientation: 90, ouverture: 70 };
  w.config = facades({ 'cover.volet_salon': SALON, 'cover.autre': AUTRE, 'cover.volet_cuisine': cuisineAilleurs });   // un autre appareil : le serveur le sait, le cache de la fiche non
  choisirFacade(p, 180);
  await attendre(); await attendre(); p.rendre();
  const cuisine = { orientation: 180, ouverture: 70 };
  const fusionnee = { 'cover.volet_salon': SALON, 'cover.autre': AUTRE, 'cover.volet_cuisine': cuisine };
  // ASSERTION MODIFIÉE (25/10, fusion volet par volet) : le patch ne porte que la cuisine (avant : la table entière) ;
  // l'ouverture de 70 vient de la relecture fraîche (le cache, qui ignore la cuisine, aurait donné 90).
  assert.deepEqual(w.ecritures(), [{ soleil: { volets: { 'cover.volet_cuisine': cuisine } } }], 'le patch ne porte que le volet de la fiche, bâti sur la relecture');
  // ASSERTION MODIFIÉE (25/10, fusion volet par volet) : « la façade posée ailleurs n'est pas effacée » se vérifie
  // désormais sur l'état du faux serveur, fusionné volet par volet.
  assert.deepEqual(w.config.soleil.volets, fusionnee, 'au serveur, la façade posée ailleurs n’est pas effacée');
  assert.deepEqual(alertes(p), []);
  assert.deepEqual(E.lireEtatVolets().etat.config.soleil.volets, fusionnee, 'et la réponse du serveur remplace le cache');
}));

test('relecture finale des prises (B6) — deux écritures de suite : la relecture qui échoue emporte la première, la seconde se relit et passe', () => dans(async () => {
  const w = monde();
  const p = ouvrirPlanning(w, 'cover.volet_cuisine');
  await attendre();
  w.messages.length = 0;
  let n = 0;
  w.reponses['loggia/volets/etat'] = () => (++n === 1 ? Promise.reject(new Error('coupure')) : Promise.resolve({ ...copie(ETAT), config: copie(w.config) }));
  choisirFacade(p, 180);
  choisirFacade(p, 90);
  await attendre(); await attendre(); await attendre(); p.rendre();
  assert.deepEqual(w.messages.map(x => x.type), ['loggia/volets/etat', 'loggia/volets/etat', 'loggia/volets/config', 'loggia/volets/etat'],
    'une relecture par écriture : l’échec de la première ne ferme pas la file — la seconde relit, écrit, et l’état se relit');
  // ASSERTION MODIFIÉE (25/10, fusion volet par volet) : la seconde n'envoie que la cuisine (avant : la table entière,
  // salon compris) ; le salon reste au serveur par la fusion, vérifiée sur son état.
  assert.deepEqual(w.ecritures(), [{ soleil: { volets: { 'cover.volet_cuisine': CUISINE(90) } } }], 'la seconde écrit, et seulement le volet de la fiche');
  assert.deepEqual(w.config.soleil.volets, { 'cover.volet_salon': SALON, 'cover.volet_cuisine': CUISINE(90) }, 'au serveur, le salon est gardé');
}));
