/* La carte d'une lumière (chantier Lumières, § 3.1, 3.2, § 4, § 5 ; L3 à L7, L11).
 *
 * Ces tests JOUENT la carte (tests/crochets.mjs) : on la monte sur un `hass`,
 * on lit ce qu'elle dessine — la plaque, la phrase, le pourcentage, la barre
 * que reçoit `RmJauge` —, on appuie sur sa bascule, on glisse sur sa barre.
 * Sous `?carte_lumiere`, App.jsx exporte la carte — le fichier n'est pas
 * touché. Ce qui est garanti :
 *  - la teinte de la VRAIE lumière : un blanc par la table de sa maquette, une
 *    couleur par son `rgb_color`, l'or ailleurs ; le lavis monte avec la
 *    luminosité ; éteinte, la carte se tait ;
 *  - la phrase d'état du § 4 ; le pourcentage une fois, allumée et variable ;
 *  - la barre de 1 à 100 %, le repère gris éteinte au dernier niveau du carnet ;
 *  - les gestes : `turn_on` / `turn_off` d'après l'état affiché, jamais
 *    `toggle` ; glisser sur une lampe éteinte l'allume ; un switch déclaré
 *    lumière passe par `homeassistant` ; « Tout éteindre » se voit tout de suite. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { monter, horlogeFausse, documentFaux } from './crochets.mjs';
import { THEMES, fondGlyphe, fondRepere, teinteDe } from './jetons_loggia.mjs';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?carte_lumiere')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?carte_lumiere'.length), ctx);",
  // ASSERTION MODIFIÉE (passe téléphone, tâche 3) : la plaque-interrupteur de la carte étroite s'exporte aussi, pour être jouée seule.
  // `RmJauge` (passe bis 3 du 17/10, point 3) : la VRAIE barre se monte avec les props que la carte lui passe, pour glisser dessus.
  "  return { ...r, source: String(r.source) + ';export { RoomLightCard, RM_MILIEU, PlaqueBascule, RmJauge };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?carte_lumiere', import.meta.url).href);
const L = await import('../src/lumieresetat.js');
const { lisibleSurLavis, lireCouleur, contraste } = await import('../src/contraste.js');
const P = await import('../src/lumieres.js');

const APP = MONOLITHE.replace(/\r\n/g, '\n');
const aujourdhui = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };
const iso = (h, m) => new Date(aujourdhui(h, m)).toISOString();
const lampe = (id, state, attributes, depuis = iso(18, 5)) => ({ entity_id: id, state, last_changed: depuis, last_updated: depuis, attributes });
function maison() {
  return {
    'light.ampoule_chambre': lampe('light.ampoule_chambre', 'on', { friendly_name: 'Ampoule Chambre', supported_color_modes: ['color_temp'], color_mode: 'color_temp', color_temp_kelvin: 2700, brightness: 115 }, iso(20, 10)),
    'light.bureau': lampe('light.bureau', 'on', { friendly_name: 'Plafonnier Bureau', supported_color_modes: ['brightness'], color_mode: 'brightness', brightness: 255 }),
    'light.chambre': lampe('light.chambre', 'off', { friendly_name: 'Plafonnier Chambre', supported_color_modes: ['brightness'], color_mode: null, brightness: null }, iso(7, 50)),
    'light.veilleuse': lampe('light.veilleuse', 'on', { friendly_name: 'Veilleuse Chambre Lino', supported_color_modes: ['color_temp', 'xy'], color_mode: 'xy', hs_color: [275, 100], rgb_color: [149, 0, 255], brightness: 38 }, iso(20, 30)),
    'switch.applique': lampe('switch.applique', 'on', { friendly_name: 'Applique Extérieur' }, iso(20, 24)),
    'light.morte': lampe('light.morte', 'unavailable', { friendly_name: 'Lampe morte', supported_color_modes: ['brightness'] }, iso(14, 20)),
  };
}

/* La maison doublée : un `hass` dont chaque lecture est un objet neuf, comme celui de Home Assistant ; le carnet et
 * les minuteurs posés ; les services appelés, notés. */
function poser({ carnet = { lumieres: { 'light.chambre': { dernier: { bri: 80, mode: 'brightness' } } } }, minuteurs = {} } = {}) {
  setLoggiaState({ index: null, ent: { switchLights: ['switch.applique'] }, cfg: {}, resolved: null });
  L.reglerLumieresEtat({ hass: { callWS: () => new Promise(() => {}) }, horloge: { repeter: () => 0, arreter() {}, plusTard: () => 0, annuler() {}, maintenant: () => Date.now() } });
  if (carnet) L.poserEtatLumieres(carnet);
  const appels = [];
  const courants = maison();
  const hass = () => ({ states: Object.fromEntries(Object.entries(courants).map(([k, v]) => [k, { ...v }])),
    callService: (d, s, data, cible) => { appels.push([d + '.' + s, (cible && cible.entity_id) || (data && data.entity_id), ...Object.entries(data || {}).filter(([k]) => k !== 'entity_id').map(([k, v]) => k + '=' + v)].join(' ')); return Promise.resolve(); } });
  const { poserMinuteurs } = PRISES;
  poserMinuteurs({ minuteurs, maintenant: Date.now() / 1000 });
  return { appels, courants, hass };
}
const PRISES = await import('../src/prisesetat.js');
/* L'environnement d'un test : minuteurs et `document` doublés — le thème sombre, ou le clair (`estClair` lit la classe `loggia-light` de la racine) —, rendus à la fin. */
async function dans(fn, { clair = false } = {}) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  globalThis.document.documentElement = { classList: { contains: (c) => clair && c === 'loggia-light' } };
  try { return await fn({ h, d }); } finally { h.restaurer(); d.restaurer(); }
}
const de = (m, nom) => m.trouver(e => e.type && e.type.name === nom)[0];
const phrase = (m) => m.trouver(e => e.props && e.props.style && e.props.style.color && typeof e.props.children === 'string' && /depuis|Éteinte|S’éteint|Indisponible/.test(e.props.children))[0];
const plaque = (m) => m.trouver(e => e.props && e.props.style && e.props.style.width === 38)[0].props.style;

test('L6 : un blanc prend la couleur de sa température — la plaque, le lavis qui monte avec la luminosité, le dégradé de la barre', () => dans(() => {
  const fin = Math.floor(Date.now() / 1000) + 3600;
  const w = poser({ minuteurs: { 'light.ampoule_chambre': { fin, duree: 60 } } });
  const m = monter(F.RoomLightCard, { id: 'light.ampoule_chambre', hass: w.hass(), onOpen: () => {} });
  assert.equal(plaque(m).background, 'rgba(255,169,87,.22)');
  /* ASSERTION MODIFIÉE (chantier Lumières, 9 bis A, point 1) : la garde se calculait à 0,22 — le lavis seul, la plaque oubliée — et un rouge ou un bleu saturé restait
   * à 3,4 – 3,8:1. Elle se calcule contre le fond VRAI de la glyphe : la plaque (0,22) posée sur le lavis de la carte (0,22 en haut), soit 1 − 0,78 × 0,78. */
  assert.equal(plaque(m).color, lisibleSurLavis('rgb(255,169,87)', false, 1 - (1 - .22) * (1 - .22)), 'la glyphe : la teinte vraie, rendue lisible sur son fond vrai');
  const fond = m.arbre.props.style.background;
  assert.ok(fond.startsWith('linear-gradient(180deg,rgba(255,169,87,0.143),rgba(255,169,87,0.03) 72%)'), '0,08 + 0,14 × 45 % en haut, 0,03 en bas : ' + fond);
  const j = de(m, 'RmJauge').props;
  assert.deepEqual([j.v, j.min, j.eteinte, j.zone, j.grade, j.couleur], [45, 1, false, 44, 'linear-gradient(90deg,rgb(255,208,163),rgb(255,169,87))', plaque(m).color]);
  assert.equal(de(m, 'ChiffreLumiere').props.bri, 45, 'le pourcentage, une fois, en grand');
  assert.equal(phrase(m).props.children, 'S’éteint à ' + new Date(fin * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), 'un minuteur qui tourne : sa fin (§ 4, ligne 2)');
  assert.equal(de(m, 'Surface').props.label, 'Ampoule Chambre, 45 %, ' + phrase(m).props.children);
}));

test('L6 : une couleur prend son rgb_color ; une lampe qui ne fait que varier garde l’or de la maison', () => dans(() => {
  const w = poser();
  const violet = monter(F.RoomLightCard, { id: 'light.veilleuse', hass: w.hass(), onOpen: () => {} });
  assert.equal(plaque(violet).background, 'rgba(149,0,255,.22)');
  assert.equal(phrase(violet).props.children, 'Allumée depuis 20:30');
  const or = monter(F.RoomLightCard, { id: 'light.bureau', hass: w.hass(), onOpen: () => {} });
  assert.deepEqual([plaque(or).background, plaque(or).color], ['rgba(var(--o-lampe-rgb),.22)', 'var(--o-lampe)']);
  assert.equal(de(or, 'RmJauge').props.grade, 'linear-gradient(90deg,var(--o-lampe),var(--o-lampe-b))');
  assert.ok(or.arbre.props.style.background.startsWith('linear-gradient(180deg,rgba(var(--o-lampe-rgb),0.22),rgba(var(--o-lampe-rgb),0.03) 72%)'));
}));

test('§ 4, L7 : éteinte, la carte se tait — « Éteinte », ni pourcentage ni teinte ; le repère gris au dernier niveau du carnet', () => dans(() => {
  const w = poser();
  const m = monter(F.RoomLightCard, { id: 'light.chambre', hass: w.hass(), onOpen: () => {} });
  assert.equal(phrase(m).props.children, 'Éteinte');
  assert.equal(de(m, 'ChiffreLumiere'), undefined);
  assert.deepEqual([plaque(m).background, plaque(m).color], ['var(--o-s1)', 'var(--o-text2)']);
  assert.ok(!m.arbre.props.style.background.includes('rgba('), 'aucun lavis');
  const j = de(m, 'RmJauge').props;
  assert.deepEqual([j.v, j.eteinte, j.actif], [80, true, true], 'le repère gris à 80 %, et la barre se prend encore');
  const sans = poser({ carnet: null });
  assert.equal(de(monter(F.RoomLightCard, { id: 'light.chambre', hass: sans.hass(), onOpen: () => {} }), 'RmJauge').props.v, null, 'un serveur d’avant : pas de repère');
}));

test('L11 : un switch déclaré lumière garde sa place, sans barre, en or ; une lampe muette le dit en rouge, et sa bascule ne répond plus', () => dans(() => {
  const w = poser();
  const sw = monter(F.RoomLightCard, { id: 'switch.applique', hass: w.hass(), onOpen: () => {} });
  assert.equal(de(sw, 'RmJauge'), undefined, 'tout ou rien : pas de barre');
  assert.equal(de(sw, 'ChiffreLumiere'), undefined);
  assert.equal(plaque(sw).background, 'rgba(var(--o-lampe-rgb),.22)');
  const morte = monter(F.RoomLightCard, { id: 'light.morte', hass: w.hass(), onOpen: () => {} });
  assert.equal(phrase(morte).props.children, 'Indisponible depuis 14:20');
  assert.equal(phrase(morte).props.style.color, 'var(--o-bad)');
  assert.ok(morte.arbre.props.className.includes('o-panne'), 'le liseré qui respire (ADR 0048)');
  assert.equal(de(morte, 'RmBascule').props.inerte, true);
  assert.equal(de(morte, 'RmJauge').props.actif, false);
}));

test('L3 : la bascule allume ou éteint par `turn_on` / `turn_off`, jamais `toggle` ; le geste se voit tout de suite', () => dans(() => {
  const w = poser();
  const m = monter(F.RoomLightCard, { id: 'light.bureau', hass: w.hass(), onOpen: () => {} });
  m.appuyer(de(m, 'RmBascule'), 'onToggle');
  assert.deepEqual(w.appels, ['light.turn_off light.bureau']);
  assert.equal(phrase(m).props.children, 'Éteinte', 'le geste d’abord');
  const sw = monter(F.RoomLightCard, { id: 'switch.applique', hass: w.hass(), onOpen: () => {} });
  sw.appuyer(de(sw, 'RmBascule'), 'onToggle');
  assert.deepEqual(w.appels.slice(1), ['switch.turn_off switch.applique'], 'un switch-lumière, par le service de son domaine');
  assert.ok(!w.appels.some(x => /toggle/.test(x)));
}));

/* ── Passe de finition 11 bis ──────────────────────────────────────────────────── */

test('11 bis, R3 : la bascule d’une lampe ÉTEINTE l’allume par `turn_on` — le test d’au-dessus ne jouait que des lampes allumées, et ne prouvait pas ce sens-là', () => dans(() => {
  const w = poser();
  const eteinte = monter(F.RoomLightCard, { id: 'light.chambre', hass: w.hass(), onOpen: () => {} });
  assert.equal(phrase(eteinte).props.children, 'Éteinte', 'au départ : éteinte');
  assert.equal(de(eteinte, 'RmBascule').props.on, false, 'la bascule est sur « éteinte »');
  eteinte.appuyer(de(eteinte, 'RmBascule'), 'onToggle');
  assert.deepEqual(w.appels, ['light.turn_on light.chambre'], 'éteinte, la bascule ALLUME : `turn_on`, jamais `toggle`, qui couperait sur un état vieux');
  assert.match(phrase(eteinte).props.children, /^Allumée depuis \d\d:\d\d$/, 'le geste d’abord : « Allumée », avant que la lampe ne réponde');
  assert.equal(de(eteinte, 'RmBascule').props.on, true);
  // Un switch déclaré lumière, éteint : par le service de son domaine, lui aussi `turn_on`.
  const w2 = poser();
  w2.courants['switch.applique'] = { ...w2.courants['switch.applique'], state: 'off' };
  const sw = monter(F.RoomLightCard, { id: 'switch.applique', hass: w2.hass(), onOpen: () => {} });
  assert.equal(phrase(sw).props.children, 'Éteinte');
  sw.appuyer(de(sw, 'RmBascule'), 'onToggle');
  assert.deepEqual(w2.appels, ['switch.turn_on switch.applique'], 'un switch-lumière éteint : `turn_on` de son domaine');
  assert.ok(![...w.appels, ...w2.appels].some(x => /toggle/.test(x)));
}));

test('L7 : glisser sur une lampe éteinte l’allume à ce niveau — et la carte le montre tout de suite', () => dans(() => {
  const w = poser();
  const m = monter(F.RoomLightCard, { id: 'light.chambre', hass: w.hass(), onOpen: () => {} });
  de(m, 'RmJauge').props.onCommit(60);
  m.rendre();
  assert.deepEqual(w.appels, ['light.turn_on light.chambre brightness_pct=60']);
  assert.equal(de(m, 'ChiffreLumiere').props.bri, 60);
  assert.match(phrase(m).props.children, /^Allumée depuis \d\d:\d\d$/, '« depuis » prend l’heure du geste');
  assert.equal(de(m, 'RmJauge').props.eteinte, false);
}));

test('« Tout éteindre » : l’avance de l’en-tête se voit sur la carte, jusqu’à ce que la lampe réponde — fût-ce pour la contredire', () => dans(() => {
  const w = poser();
  const S = w.hass().states;
  const m = monter(F.RoomLightCard, { id: 'light.bureau', hass: w.hass(), onOpen: () => {} });
  assert.equal(phrase(m).props.children, 'Allumée depuis 18:05');
  L.avancerLumieres(['light.bureau'], false, S);
  m.rendre();
  assert.equal(phrase(m).props.children, 'Éteinte', 'l’avance : la carte montre tout de suite la lampe éteinte');
  /* ASSERTION MODIFIÉE (chantier Lumières, 9 bis A) : la lampe répondait `off`, comme l’avance, et le test attendait « Éteinte »
   * avant comme après — une avance qui ne finirait jamais passait aussi. Elle répond maintenant `on`, avec un nouveau
   * `last_changed` (une main l’a rallumée) : c’est sa vérité qui doit gagner, « Allumée ». */
  w.courants['light.bureau'] = { ...w.courants['light.bureau'], state: 'on', last_changed: new Date().toISOString() };
  m.proprietes({ hass: w.hass() });
  assert.match(phrase(m).props.children, /^Allumée depuis \d\d:\d\d$/, 'la lampe a répondu : sa vérité, et plus l’avance');
}));

test('la carte s’abonne à SA lampe (A2) : la luminosité changée ailleurs se voit au tic suivant, sans que rien d’autre ne redessine la carte', () => dans(({ h, d }) => {
  const w = poser();
  d.suivre(() => w.hass());
  const m = monter(F.RoomLightCard, { id: 'light.bureau', hass: w.hass(), onOpen: () => {} });
  assert.equal(de(m, 'ChiffreLumiere').props.bri, 100);
  /* ASSERTION MODIFIÉE (chantier Lumières, 9 bis A) : le test relançait `m.rendre()`, qui relit `getHass()` de lui-même — avec
   * `useHass([])` à la place de `useHass([id])`, il passait quand même. Il exige maintenant l’intervalle de 2 s de l’abonnement,
   * et que ce soit son tic, seul, qui redessine la carte. */
  assert.equal(h.intervalles().filter(i => i.ms === 2000).length, 1, 'la carte relève SA lampe toutes les 2 s : `useHass([id])` pose cet intervalle');
  w.courants['light.bureau'] = { ...w.courants['light.bureau'], last_updated: new Date(Date.now() + 1000).toISOString(), attributes: { ...w.courants['light.bureau'].attributes, brightness: 128 } };
  const avant = m.rendus;
  h.avancer(2000);
  m.effets();
  assert.ok(m.rendus > avant, 'le tic a vu la lampe changer et redessiné la carte');
  assert.equal(de(m, 'ChiffreLumiere').props.bri, 50);
}));

// TITRE MODIFIÉ (passe téléphone, tâche 3) : il disait « celle d’un radiateur : le nom en 13 px sur deux lignes au plus » ; la carte étroite d’une lumière est celle de la grille commune (`o-gabarit`), le nom en 14 px.
test('§ 3.2 : la carte étroite — sous 188 px de contenu, celle de la grille commune : le nom en 14 px sur deux lignes au plus, la phrase sur UNE ligne dessous, les airs resserrés', () => {
  const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  /* ASSERTION MODIFIÉE (retours du 15/10) : la phrase passait sur deux lignes — « Allumée depuis 13:0… » taisait l'heure — et le nom tenait sur une ligne en 14 px, à
   * côté d'un pourcentage monté entre la plaque et la bascule. Retour : « le % [est] en haut entre l'icone et le toggle […] alors que les radiateur […] c'est bien placé ».
   * La carte prend la disposition étroite du radiateur : le texte s'efface dans la grille du milieu, le nom en 13 px sur deux lignes au plus, passé à la ligne entre deux
   * mots, la phrase SOUS le nom et le pourcentage, sur toute la largeur, en une ligne — 12 px, puis 11 selon sa longueur, « … » en dernier recours.
   * ASSERTION MODIFIÉE (passe téléphone, tâche 3 ; sa décision du 15/10, « ok pour 1c ») : la carte étroite d'une lumière est celle de la GRILLE COMMUNE (`o-gabarit`) —
   * son bloc de requête est parti. Le nom en 14 px / 600 sur toute la largeur, deux lignes au plus ; la phrase dessous, une ligne, de 12 à 10,5 px ; le pourcentage monte
   * en haut, et la plaque devient l'interrupteur. Les règles de la grille sont tenues dans tests/chiffre_carte_etroite.test.mjs. */
  assert.ok(!CSS.includes('.o-rmcard[data-lumiere] { container-type') && !/\.o-lumiere-(texte|nom|phrase)\b/.test(CSS), 'le bloc étroit de la lumière est parti');
  assert.ok(APP.includes("className={'o-light-card o-rmcard o-gabarit' + (v.muette ? ' o-panne' : '')} data-lumiere=\"\""), 'la carte est le conteneur de la grille commune');
  assert.ok(CSS.includes('  .o-gab-nom { font-size: 14px !important; font-weight: 600 !important; line-height: 16px; white-space: normal !important; overflow-wrap: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }\n'),
    'le nom : 14 px / 600, deux lignes au plus, passé à la ligne entre deux mots — jamais dans un mot');
  /* ASSERTION MODIFIÉE (15/10) : la phrase étroite à 10,5 px. Le plancher était de 11 px ; à 320 px, « Allumée depuis hh:mm » y mesurait 113,3 px — 0,3 px de trop pour
   * les 113 px de contenu d'une carte de pièce, 2,3 pour les 111 d'Objets — et le « … » mangeait les minutes. À 10,5 px elle en prend 108,2. */
  assert.ok(CSS.includes('  .o-gab-phrase { line-height: 15px; font-size: clamp(10.5px, calc(100cqi / (0.58 * var(--o-n, 20))), 12px) !important; }\n'),
    'la phrase : une ligne, sur toute la largeur, de 12 à 10,5 px d’après sa longueur');
  assert.ok(!/\.o-gab-phrase \{[^}]*(-webkit-line-clamp|white-space: normal)/.test(CSS), 'la phrase ne passe pas sur deux lignes : le budget en hauteur n’en a pas la place');
});

/* ── Passe de finition 9 bis A ─────────────────────────────────────────────────── */

const enfants = (e) => [].concat(e && e.props ? e.props.children : []).filter(x => x && typeof x === 'object');
const rendu = (el) => renderToStaticMarkup(createElement(el.type, el.props));

test('point 11 : le pourcentage est en bas, à droite du nom ET de la phrase — une rangée alignée par le bas, et le chiffre ne remonte plus', () => dans(() => {
  const w = poser();
  const m = monter(F.RoomLightCard, { id: 'light.bureau', hass: w.hass(), onOpen: () => {} });
  /* ASSERTION MODIFIÉE (chantier Lumières, 9 bis B, point 18) : la carte écrit maintenant le pourcentage DEUX fois — `haut`, dans la ligne de la
   * plaque, pour une carte étroite, et celui-ci, en bas, pour une carte large ; la feuille n'en montre qu'un (index.css). Le test prenait le
   * premier trouvé, qui est devenu celui du haut : il prend celui du bas, qu'il tient aligné sur la phrase — la disposition large, qui ne change pas.
   * ASSERTION MODIFIÉE (retours du 15/10) : la variante haute est partie — le pourcentage s'écrit UNE fois, là où le radiateur écrit sa température — et la
   * rangée est celle du radiateur (`RM_MILIEU`, une grille : le nom et la phrase à gauche, le pourcentage à droite, aligné par le bas) au lieu d'une rangée
   * `flex` qui lui ressemblait : sur une carte large, le dessin ne change pas (le nom et la phrase à gauche, le pourcentage en bas à droite) ; sur une carte
   * étroite, la grille laisse la phrase passer SOUS le nom et le pourcentage. */
  const chiffre = de(m, 'ChiffreLumiere');
  const rangee = m.trouver(e => enfants(e).includes(chiffre))[0];
  assert.ok(rangee, 'le pourcentage a un parent');
  assert.equal(rangee.props.style, F.RM_MILIEU, 'la rangée du radiateur, la même : un seul objet de style');
  assert.deepEqual([rangee.props.style.display, rangee.props.style.gridTemplateColumns, rangee.props.style.alignItems, rangee.props.style.marginTop],
    ['grid', 'minmax(0, 1fr) auto', 'end', 'var(--o-milieu-haut, 14px)'], 'alignée par le BAS, 14 px sous la plaque (10 sur une carte étroite)');
  const [colonne, droite] = enfants(rangee);
  assert.equal(droite, chiffre, 'le pourcentage est à droite');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 3) : le texte ne s'efface plus dans la grille ; sur une carte étroite, le pourcentage du bas se tait et le texte prend toute la largeur.
  assert.equal(colonne.props.className, undefined, 'le texte, une colonne sans classe : la grille commune ne l’efface pas');
  assert.equal(colonne.props.style.minWidth, 0, 'la colonne du nom et de la phrase prend la place qui reste');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 3) : le nom et la phrase portent les classes de la grille commune.
  assert.deepEqual(enfants(colonne).map(e => e.props.className), ['o-gab-nom', 'o-gab-phrase'], 'le nom, puis la phrase — une seule colonne, que le pourcentage borde');
  // Il ne remonte plus : ni dans le dessin rendu, ni dans le code.
  assert.ok(!/margin-top/.test(rendu(chiffre)), 'le pourcentage rendu ne porte aucune marge : ' + rendu(chiffre));
  const f = APP.indexOf('function ChiffreLumiere(');
  assert.ok(f >= 0 && !APP.slice(f, APP.indexOf('\n}\n', f)).includes('marginTop'), 'ChiffreLumiere n’a plus de marginTop (il valait -7)');
  // Sans pourcentage (éteinte, tout ou rien), la rangée ne garde que la colonne.
  const eteinte = monter(F.RoomLightCard, { id: 'light.chambre', hass: w.hass(), onOpen: () => {} });
  assert.equal(de(eteinte, 'ChiffreLumiere'), undefined);
}));

test('point 9 : toute lumière porte l’ampoule — plafonnier, veilleuse, switch déclaré lumière, quel que soit son nom ; une icône choisie à la main l’emporte', () => dans(() => {
  const w = poser();
  const glyphe = (id) => { const m = monter(F.RoomLightCard, { id, hass: w.hass(), onOpen: () => {} }); return rendu(de(m, 'GlypheCarte')); };
  for (const id of ['light.ampoule_chambre', 'light.bureau', 'light.chambre', 'light.veilleuse', 'switch.applique', 'light.morte']) {
    const h = glyphe(id);
    assert.ok(h.includes('class="fi fi-rr-bulb"') && !h.includes('<svg'), id + ' : l’ampoule au trait (`Fi i="bulb"`), plus un dessin par type — ' + h);
  }
  // Une icône choisie à la main passe devant (`GlypheCarte`, `iconeChoisie`).
  setLoggiaState({ cfg: { loggia_icones: { 'light.bureau': 'star', 'switch.applique': 'star' } } });
  for (const id of ['light.bureau', 'switch.applique']) {
    const h = glyphe(id);
    assert.ok(h.includes('fi-rr-star') && !h.includes('fi-rr-bulb'), id + ' : l’icône choisie l’emporte — ' + h);
  }
  assert.ok(glyphe('light.chambre').includes('fi-rr-bulb'), 'une lampe sans choix garde l’ampoule');
  // Le type ne sert plus qu’à ranger les lampes (`LT_ORDER`) : plus de dessin par type.
  for (const mort of ['LightIcon', 'LIGHT_ICONS', 'LIGHT_TYPE_ICON']) assert.ok(!APP.includes(mort), mort + ' n’a plus d’emploi : il part');
  assert.ok(APP.includes('LT_ORDER[lightType(a)] - LT_ORDER[lightType(b)]'), '`lightType` reste pour l’ORDRE des lampes');
}));

/* L'encre de la glyphe et du repère, mesurée sur la carte jouée : contre le fond VRAI (jetons d'index.css), en thème sombre et clair. */
const CAS_CARTE = [
  ['2 200 K', { color_mode: 'color_temp', color_temp_kelvin: 2200 }], ['2 700 K', { color_mode: 'color_temp', color_temp_kelvin: 2700 }],
  ['4 000 K', { color_mode: 'color_temp', color_temp_kelvin: 4000 }], ['6 500 K', { color_mode: 'color_temp', color_temp_kelvin: 6500 }],
  ['rouge', { color_mode: 'xy', rgb_color: [255, 0, 0] }], ['bleu', { color_mode: 'xy', rgb_color: [0, 0, 255] }],
];
const lampeCouleur = (reglage) => lampe('light.ampoule_chambre', 'on', { friendly_name: 'Ampoule Chambre', supported_color_modes: ['color_temp', 'xy'], brightness: 255, ...reglage }, iso(20, 10));

for (const [nomTheme, clair] of [['sombre', false], ['clair', true]]) {
  test('point 1 (' + nomTheme + ') : la glyphe et le repère de la carte se lisent sur le VRAI fond — au moins 3:1, de 2 200 à 6 500 K et pour une couleur saturée', () => dans(() => {
    const T = THEMES[nomTheme];
    for (const [nom, reglage] of CAS_CARTE) {
      const w = poser();
      w.courants['light.ampoule_chambre'] = lampeCouleur(reglage);
      const m = monter(F.RoomLightCard, { id: 'light.ampoule_chambre', hass: w.hass(), onOpen: () => {} });
      /* ASSERTION MODIFIÉE (chantier Lumières, 11 bis, R7) : le fond de la glyphe est la teinte qui PEINT la carte (`teinteDeCarte`) — la vraie en thème sombre, et
       * en thème clair un blanc plafonné à 4 000 K. Le test prenait toujours la teinte vraie. */
      const vrai = P.teinteDeCarte(reglage, null, clair);
      const encre = lireCouleur(plaque(m).color).slice(0, 3);
      const j = de(m, 'RmJauge').props;
      assert.equal(j.couleur, plaque(m).color, nom + ' : le repère de la barre et la glyphe ont la même encre');
      const glyphe = contraste(encre, fondGlyphe(T, vrai)), repere = contraste(encre, fondRepere(T, vrai));
      assert.ok(glyphe >= 4.2, nomTheme + ', ' + nom + ' : la glyphe ' + plaque(m).color + ' à ' + glyphe.toFixed(2) + ':1 (3:1 au moins ; la garde en tient 4,2 contre le vrai fond)');
      assert.ok(repere >= 3, nomTheme + ', ' + nom + ' : le repère ' + plaque(m).color + ' à ' + repere.toFixed(2) + ':1');
      // La barre : la teinte vraie en thème sombre ; en thème clair, l’encre gardée — le remplissage se voit sur la piste.
      assert.equal(j.grade, clair ? P.couleursLumiere(encre).degrade : P.couleursLumiere(vrai).degrade, nom + ' : le dégradé de la barre');
    }
  }, { clair }));
}

test('point 1 : en thème clair, une ampoule « Froide » garde une encre brune — ni le rouge, ni le magenta des blancs rosés', () => dans(() => {
  for (const k of [5000, 6200, 6500, 6535]) {
    const w = poser();
    w.courants['light.ampoule_chambre'] = lampeCouleur({ color_mode: 'color_temp', color_temp_kelvin: k });
    const m = monter(F.RoomLightCard, { id: 'light.ampoule_chambre', hass: w.hass(), onOpen: () => {} });
    const h = teinteDe(lireCouleur(plaque(m).color));
    assert.ok(h >= 20 && h <= 45, k + ' K : l’encre ' + plaque(m).color + ' est à ' + h + '° (le défaut : #d81400 à 6 200 K, #d2008c à 6 500 K)');
    /* ASSERTION MODIFIÉE (chantier Lumières, 11 bis, R7) : la plaque et le lavis gardaient la teinte vraie — « l’ampoule reste froide à l’œil » —, et un blanc froid
     * (à 6 500 K, 255,249,253) posé à .22 sur la carte claire ne s’y voyait pas : une carte toute blanche, plaque à 1,006:1. En thème clair, ils prennent le blanc de
     * l’encre, plafonné à 4 000 K (`teinteDeCarte`) : un crème qui se voit. */
    assert.equal(plaque(m).background, 'rgba(' + P.teinteDeCarte({ color_mode: 'color_temp', color_temp_kelvin: k }, null, true).join(',') + ',.22)');
  }
}, { clair: true }));

test('point 1 : la vue passe à la garde le lavis RÉGLÉ de la carte — « Pleine » double la teinte, et l’encre en tient compte (le calcul se prouve dans tests/lumieres.test.mjs)', () => dans(() => {
  const w = poser();
  w.courants['light.ampoule_chambre'] = lampeCouleur({ color_mode: 'color_temp', color_temp_kelvin: 2700 });
  const douce = plaque(monter(F.RoomLightCard, { id: 'light.ampoule_chambre', hass: w.hass(), onOpen: () => {} })).color;
  assert.match(douce, /^#[0-9a-f]{6}$/);
  assert.ok(APP.includes('lavis: lav(lavisLumiere(100).haut)'), 'la vue passe le lavis du haut de la carte, fois le réglage « Teinte » du thème (`lav`)');
}));

/* ── Passe de finition 9 bis B ─────────────────────────────────────────────────── */

/* ASSERTION MODIFIÉE (retours du 15/10) : ce test, les trois qui le suivent et leur série tenaient la variante HAUTE du pourcentage — écrit DEUX fois, celui d'une carte étroite
 * monté entre la plaque et la bascule (20 px, puis 12, puis 11 sous la bascule) —, que la feuille de style choisissait par une requête de conteneur. Retour de l'utilisateur,
 * au téléphone : « pourquoi le % et en haut entre l'icone et le toggle, pour le volet de la chambre aussi alors que les radiateur lui c'est bien placé ». La variante est
 * partie, avec son code et sa feuille : le pourcentage s'écrit UNE fois, à la place que la température occupe sur un radiateur — première rangée, deuxième colonne de la
 * grille du milieu —, et une carte étroite prend la disposition étroite du radiateur. Les tests qui suivent tiennent cette disposition (la parité avec le radiateur,
 * mesurée dans la feuille, est dans tests/chiffre_carte_etroite.test.mjs). */
test('point 18 : le pourcentage s’écrit UNE fois, dans la rangée du nom — la ligne du haut ne porte que la plaque et la bascule', () => dans(() => {
  const w = poser();
  const m = monter(F.RoomLightCard, { id: 'light.bureau', hass: w.hass(), onOpen: () => {} });
  const figures = m.trouver(e => e.type && e.type.name === 'ChiffreLumiere');
  assert.deepEqual(figures.map(f => [f.props.haut, f.props.bri]), [[undefined, 100]], 'une seule fois, sans variante haute');
  const entete = m.trouver(e => enfants(e).some(x => x.type && x.type.name === 'RmBascule'))[0];
  /* ASSERTION MODIFIÉE (passe téléphone, tâche 3) : la ligne du haut s'écrit deux fois — la plaque et la bascule de la carte LARGE, la plaque-interrupteur et le
   * pourcentage de la carte ÉTROITE ; la feuille n'en montre qu'une (`o-seul-large`, `o-seul-etroit`). Rien d'autre entre elles. */
  assert.deepEqual(enfants(entete).map(e => (e.type && e.type.name) || e.type), ['span', 'PlaqueBascule', 'RmBascule', 'ChiffreHaut'], 'la plaque, la bascule — rien entre elles');
  assert.deepEqual(enfants(entete).map(e => e.props.className), ['o-seul-large', undefined, 'o-seul-large', undefined], 'la plaque et la bascule de la carte large ; les deux autres portent leur écriture en propre');
  assert.deepEqual([entete.props.style.display, entete.props.style.alignItems, entete.props.style.justifyContent], ['flex', 'flex-start', 'space-between'], 'la plaque à gauche, la bascule à droite');
  assert.equal(m.trouver(e => enfants(e).includes(figures[0]))[0].props.style, F.RM_MILIEU, 'il est dans la rangée du nom et de la phrase (point 11), celle du radiateur');
  // Rien de la variante haute ne reste, ni dans le code ni dans la feuille.
  const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  for (const reste of ['o-lumiere-chiffre-haut', 'o-lumiere-haut', '--o-chiffre-haut', '--o-chiffre-bas', 'grid-template-rows: 26px 12px']) {
    assert.ok(!APP.includes(reste) && !CSS.includes(reste), reste + ' est parti avec la variante haute');
  }
  // Éteinte, ou tout ou rien : aucun pourcentage.
  for (const id of ['light.chambre', 'switch.applique', 'light.morte']) {
    const autre = monter(F.RoomLightCard, { id, hass: w.hass(), onOpen: () => {} });
    assert.equal(autre.trouver(e => e.type && e.type.name === 'ChiffreLumiere').length, 0, id + ' : pas de pourcentage');
  }
}));

test('point 18 : l’écriture du pourcentage — une classe, sa taille et son écart lus dans la feuille, jamais en ligne ; première rangée, deuxième colonne', () => dans(() => {
  const w = poser();
  const m = monter(F.RoomLightCard, { id: 'light.ampoule_chambre', hass: w.hass(), onOpen: () => {} });
  const b = rendu(de(m, 'ChiffreLumiere'));
  // ASSERTION MODIFIÉE (passe téléphone, tâche 3) : le pourcentage du bas ne s'écrit que pour la carte large.
  assert.ok(b.includes('class="o-lumiere-chiffre o-seul-large"'), 'une classe');
  assert.ok(b.includes('grid-column:2;grid-row:1'), 'la place de la température d’un radiateur : première rangée, deuxième colonne de la grille du milieu');
  assert.ok(b.includes('margin-left:var(--o-chiffre-ecart, 10px)'), 'son écart au nom : 10 px, 4 px sur une carte étroite — celui de la température d’un radiateur');
  assert.ok(!/margin-top|margin:/.test(b), 'il ne remonte pas, ni ne descend : sa rangée l’aligne sur le bas du nom et de la phrase');
  /* ASSERTION MODIFIÉE (chantier Lumières, 11 bis, R6) : « en bas : 25 et 15 » s'écrivait en ligne (`font-size:25px`, `font-size:15px`) ; la taille se lit dans la feuille — 25 px par défaut,
   * « % » à 60 % : 15 px —, pour qu'une carte moyenne la réduise à 21 px (index.css).
   * ASSERTION MODIFIÉE (retours du 15/10) : la variable s'appelle `--o-chiffre-taille` — il n'y a plus de « bas » ni de « haut » : une carte étroite y pose 20 px, comme la température d'un radiateur. */
  assert.ok(b.includes('font-size:var(--o-chiffre-taille, 25px)') && b.includes('font-size:calc(var(--o-chiffre-taille, 25px) * .6)'), '25 et 15 par défaut, comme avant : ' + b);
  assert.ok(!/font-size:\d+px/.test(b), 'plus de taille écrite en ligne');
  assert.ok(b.includes('aria-hidden="true"'), 'la surface le dit déjà au lecteur d’écran, une fois');
  assert.equal(de(m, 'Surface').props.label, 'Ampoule Chambre, 45 %, ' + phrase(m).props.children, 'le nom de la carte ne change pas');
}));

test('point 18 : la carte moyenne garde son pourcentage de 21 px — une plage bornée des deux côtés, que la carte étroite (20 px) ne rencontre jamais', () => {
  const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  /* ASSERTION MODIFIÉE (retours du 15/10) : la requête de la carte moyenne était `(width < 200px)` — la carte étroite, dont le pourcentage montait dans la ligne du haut, ne le
   * lisait pas. Il reste maintenant à droite du nom à toute largeur, à 20 px sur une carte étroite : la plage de la carte moyenne devient `(188px <= width < 200px)`, et l'ordre des
   * règles ne décide plus de rien — sinon la carte étroite, plus étroite que 200 px elle aussi, prendrait 21 px au lieu de 20. */
  const m = /@container \((\d+)px <= width < (\d+)px\) \{\n  \.o-lumiere-chiffre \{ --o-chiffre-taille: (\d+)px; \}\n\}/.exec(CSS);
  assert.ok(m, 'la plage de la carte moyenne, bornée des deux côtés');
  const [bas, haut, taille] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // ASSERTION MODIFIÉE (passe téléphone, tâche 3) : le seuil de la carte étroite est celui de la grille commune (`o-gabarit`).
  const seuilEtroit = Number(/\.o-gabarit \{ container-type: inline-size; \}[\s\S]*?@container \(width < (\d+)px\) \{/.exec(CSS)[1]);
  assert.equal(bas, seuilEtroit, 'la carte moyenne commence où la carte étroite finit : aucune largeur n’a deux tailles');
  assert.deepEqual([haut, taille], [200, 21], 'de 188 à 200 px de contenu : 21 px — au-delà, les 25 px ; la limite de l’espagnol est écrite dans la feuille');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 3) : la carte étroite ne pose plus de taille à ce pourcentage — elle le tait (`o-seul-large`), et écrit le sien en haut.
  assert.ok(!CSS.includes('--o-chiffre-taille: 20px') && !CSS.includes('--o-chiffre-ecart: 4px'), 'la carte étroite tait le pourcentage du bas, sans lui donner de taille');
});

test('point 18 : la carte garde ses 184 px — comme le radiateur, 38 + 10 + 32 + 2 + 15 + 9 + 44 = 150 px de contenu ; le pourcentage a une ligne de 1', () => {
  const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const STYLES = readFileSync(new URL('../src/styles.js', import.meta.url), 'utf8');
  /* ASSERTION MODIFIÉE (retours du 15/10) : la grille de la ligne du haut (26 px + 12 px, la hauteur de la plaque) abritait le pourcentage SOUS la bascule d'une carte de 320 px ; elle est
   * partie. Le budget de la carte étroite est celui du radiateur : la plaque (38), l'air (10), le nom sur deux lignes de 16 px, la phrase (2 px d'air et une ligne de 15), l'air du pied (9)
   * et la barre (44) — chaque terme lu dans la feuille, `styles.js` ou le code de la carte. */
  const nombre = (re, texte, quoi) => { const r = re.exec(texte); assert.ok(r, quoi + ' : introuvable'); return Number(r[1]); };
  // ASSERTION MODIFIÉE (passe téléphone, tâche 3) : le budget de la carte étroite se lit dans la grille commune (`o-gabarit`) ; le nom y a 14 px, sur deux lignes de 16.
  const bloc = CSS.slice(CSS.indexOf('.o-gabarit { container-type'));
  const plaque = nombre(/ICONE_CARTE = \{ width: 38, height: (\d+)/, STYLES, 'la plaque');
  const airHaut = nombre(/--o-milieu-haut: (\d+)px/, bloc, 'l’air du milieu');
  const airPied = nombre(/--o-pied-haut: (\d+)px/, bloc, 'l’air du pied');
  const ligneNom = nombre(/\.o-gab-nom \{ font-size: 14px !important; font-weight: 600 !important; line-height: (\d+)px/, CSS, 'la ligne du nom');
  const lignesNom = nombre(/\.o-gab-nom \{[^}]*-webkit-line-clamp: (\d+)/, CSS, 'les lignes du nom');
  const lignePhrase = nombre(/\.o-gab-phrase \{ line-height: (\d+)px/, CSS, 'la ligne de la phrase');
  const airPhrase = nombre(/SOUS_CARTE = \{[^}]*marginTop: (\d+)/, STYLES, 'l’air sous le nom');
  const barre = nombre(/zone=\{(\d+)\} marge=\{0\}/, APP.slice(APP.indexOf('function RoomLightCard(')), 'la barre');
  assert.deepEqual([plaque, airHaut, ligneNom * lignesNom, airPhrase + lignePhrase, airPied, barre], [38, 10, 32, 17, 9, 44]);
  const budget = plaque + airHaut + ligneNom * lignesNom + airPhrase + lignePhrase + airPied + barre;
  assert.equal(budget, 150, 'une carte de 184 px laisse 150 px de contenu, rembourrage (2 × 16) et liseré (2 × 1) ôtés — 154 au téléphone');
  assert.ok(budget <= 184 - 2 * 16 - 2 * 1, 'la carte étroite déborde : ' + budget + ' px pour 150');
  const i = APP.indexOf('function ChiffreLumiere(');
  const corps = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.ok(corps.includes('lineHeight: 1') && !corps.includes('marginTop'), 'ChiffreLumiere : une ligne de 1, sans marge du haut');
});

/* ── Passe de finition 11 bis, R7 : le thème clair et les blancs ───────────────────────────────── */

const peinture = (k, clair, reglage = null) => dans(() => {
  const w = poser();
  w.courants['light.ampoule_chambre'] = lampeCouleur(reglage || { color_mode: 'color_temp', color_temp_kelvin: k });
  const m = monter(F.RoomLightCard, { id: 'light.ampoule_chambre', hass: w.hass(), onOpen: () => {} });
  return { plaque: plaque(m).background, lavis: m.arbre.props.style.background, glyphe: plaque(m).color, barre: de(m, 'RmJauge').props.grade };
}, { clair });

test('11 bis, R7 : en thème clair, la plaque ET le lavis d’un blanc froid prennent le blanc de 4 000 K — la carte se voit allumée ; en thème sombre, rien ne change', async () => {
  const froid = await peinture(6500, true);
  assert.equal(froid.plaque, 'rgba(255,209,163,.22)', 'la plaque : le blanc de 4 000 K, pas le blanc vrai (255,249,253) qui se confondait avec la carte');
  assert.ok(froid.lavis.startsWith('linear-gradient(180deg,rgba(255,209,163,0.22),rgba(255,209,163,0.03) 72%)'), 'le lavis aussi : ' + froid.lavis);
  const sombre = await peinture(6500, false);
  assert.equal(sombre.plaque, 'rgba(255,249,253,.22)', 'en thème sombre : la teinte vraie, comme avant');
  assert.ok(sombre.lavis.startsWith('linear-gradient(180deg,rgba(255,249,253,0.22),rgba(255,249,253,0.03) 72%)'), 'et son lavis : ' + sombre.lavis);
  // Tout blanc de plus de 4 000 K prend le blanc de 4 000 K en thème clair ; un blanc chaud et une couleur ne bougent dans aucun thème.
  for (const k of [4500, 5000, 6200, 6535]) assert.equal((await peinture(k, true)).plaque, 'rgba(255,209,163,.22)', k + ' K, thème clair');
  for (const clair of [true, false]) {
    assert.equal((await peinture(2200, clair)).plaque, 'rgba(255,147,44,.22)', '2 200 K : sa teinte vraie, ' + (clair ? 'clair' : 'sombre'));
    assert.equal((await peinture(2700, clair)).plaque, 'rgba(255,169,87,.22)', '2 700 K : sa teinte vraie, ' + (clair ? 'clair' : 'sombre'));
    assert.equal((await peinture(4000, clair)).plaque, 'rgba(255,209,163,.22)', '4 000 K : lui-même, ' + (clair ? 'clair' : 'sombre'));
    const bleu = await peinture(null, clair, { color_mode: 'xy', rgb_color: [0, 0, 255] });
    assert.equal(bleu.plaque, 'rgba(0,0,255,.22)', 'une couleur n’est pas un blanc : elle ne bouge pas, ' + (clair ? 'clair' : 'sombre'));
    assert.ok(bleu.lavis.startsWith('linear-gradient(180deg,rgba(0,0,255,0.22),rgba(0,0,255,0.03) 72%)'));
  }
  // La barre et l'encre gardent ce que la revue de la passe A leur donne : l'encre brune, la barre peinte depuis elle en thème clair.
  assert.equal(froid.barre, P.couleursLumiere(lireCouleur(froid.glyphe).slice(0, 3)).degrade, 'thème clair : la barre se peint depuis l’encre gardée');
  assert.equal(sombre.barre, P.couleursLumiere([255, 249, 253]).degrade, 'thème sombre : la barre se peint de la teinte vraie, comme avant');
  assert.ok(APP.includes('const teinte = on ? teinteDeCarte(a, dernier, estClair()) : null;'), 'la vue calcule la teinte de la carte par `teinteDeCarte`, selon le thème');
});

test('11 bis, R7 : une lampe froide allumée se distingue de la même lampe éteinte, en thème clair — plaque et lavis mesurés contre la carte neutre', async () => {
  const T = THEMES.clair;
  const froid = await peinture(6500, true);
  const tinte = lireCouleur(froid.plaque).slice(0, 3);   // 255, 209, 163
  const plaqueSurLavis = fondGlyphe(T, tinte);
  assert.ok(contraste(plaqueSurLavis, T.haut) >= 1.1, 'la plaque contre la carte neutre : ' + contraste(plaqueSurLavis, T.haut).toFixed(3) + ':1 (le blanc vrai en donnait 1,006)');
  assert.ok(contraste(fondGlyphe(T, tinte, 0.22), T.haut) > contraste(fondGlyphe(T, [255, 249, 253]), T.haut) * 1.05, 'bien plus qu’avant');
});

/* ── Passe de finition 11 bis, R6 : à 1280 px, la phrase ne se coupe plus ───────────────────────────────────
 *
 * Dans Objets › Lumières à 1280 px — des cartes de 226 px, 192 de contenu —, « Allumée depuis 18:05 » (123,6 px à 12 px / 600) devenait « Allumée depuis 18:… » à côté
 * de « 100 % » : le pourcentage du bas (25 px, « % » en 15 : 61,5 px) et ses 10 px d'air ne lui laissaient que 120,5 px. Une carte MOYENNE — de 188 à 200 px de
 * contenu — prend un pourcentage plus petit (21 px, « % » à 60 % : 52,1 px) ; elle garde la phrase sur une ligne, et le pourcentage en bas, aligné sur elle. Sous
 * 188 px, comme avant, il monte entre la plaque et la bascule et la phrase passe sur deux lignes.
 * ASSERTION MODIFIÉE (retours du 15/10) : sous 188 px, il ne monte plus : il reste à droite du nom, à 20 px — comme la température d'un radiateur —, et la phrase passe
 * dessous, sur une ligne. Les noms `chiffreDuBas` et `tailleBas` disaient « en bas » : ils deviennent `chiffreDeLaCarte` et `tailleDuChiffre`. */
const CSS_L = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// Les phrases d'une lampe allumée, à 12 px / 600 (Manrope), mesurées dans la démo : la plus longue de chaque langue demandée, et « S'éteint à ».
const PHRASES = { fr: [['Allumée depuis 18:05', 123.6], ['S’éteint à 21:10', 90.9]], de: [['An seit 18:05', 75.6], ['Geht um 21:10 aus', 107.8]], pl: [['Włączone od 18:05', 110.5], ['Wyłączy się o 21:10', 114]] };
// Le contenu d'une carte de lumière dans Objets, aux quatre largeurs d'écran : 226, 247,5, 266 et 253,3 px de carte, moins 2 × 16 de rembourrage et 2 × 1 de liseré.
const CONTENUS = { 1280: 226 - 34, 1366: 247.5 - 34, 1440: 266 - 34, 1920: 253.3 - 34 };
const chiffreDeLaCarte = () => dans(() => {
  const w = poser();
  return monter(F.RoomLightCard, { id: 'light.bureau', hass: w.hass(), onOpen: () => {} }).trouver(e => e.type && e.type.name === 'ChiffreLumiere')[0];
});
/** La taille du pourcentage du BAS d'une carte de `contenu` px : 21 sur une carte moyenne, sinon 25 px ; une carte étroite le tait (0) — lue dans la feuille et dans le rendu. */
const tailleDuChiffre = async () => {
  const m = /@container \((\d+)px <= width < (\d+)px\) \{\n  \.o-lumiere-chiffre \{ --o-chiffre-taille: (\d+)px; \}\n\}/.exec(CSS_L);
  assert.ok(m, 'la requête de la carte moyenne : un pourcentage plus petit');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 3) : le seuil est celui de la grille commune, et la carte étroite tait ce pourcentage (`o-seul-large`) — elle écrit le sien en haut.
  const seuilEtroit = Number(/\.o-gabarit \{ container-type: inline-size; \}[\s\S]*?@container \(width < (\d+)px\) \{/.exec(CSS_L)[1]);
  const etroite = rendu(await chiffreDeLaCarte()).includes('o-seul-large') ? 0 : NaN;
  const [seuil, petite] = [Number(m[2]), Number(m[3])];
  const grande = Number(/font-size:var\(--o-chiffre-taille, (\d+)px\)/.exec(rendu(await chiffreDeLaCarte()))[1]);
  return (contenu) => (contenu < seuilEtroit ? etroite : contenu < seuil ? petite : grande);
};
// « 100 % » : trois chiffres de 0,6 em, « % » de 0,9 em à 60 % de la taille, 3 px entre eux — 2,34 em + 3 px (mesuré dans le navigateur, Manrope 800).
const largeurCent = (t) => 3 * 0.6 * t + 3 + 0.6 * t * 0.9;
const AIR = 10;

// TITRE MODIFIÉ (passe téléphone, tâche 3) : il disait « 20 px sur une carte étroite » ; la carte étroite tait ce pourcentage, et écrit le sien en haut (`ChiffreHaut`, 22 px).
test('11 bis, R6 : le pourcentage du bas a deux tailles — 25 px, 21 px sur une carte moyenne (188 à 200 px de contenu) ; une carte étroite le tait ; « % » à 60 %', async () => {
  const h = rendu(await chiffreDeLaCarte());
  /* ASSERTION MODIFIÉE (chantier Lumières, 11 bis, R6) : le pourcentage du bas s'écrivait `font-size:25px` et `font-size:15px`, que la feuille ne pouvait pas changer
   * (un style en ligne bat une requête de conteneur). Il lit la taille de `--o-chiffre-bas` — 25 px par défaut, « % » à 60 % : 15 px, comme avant.
   * ASSERTION MODIFIÉE (retours du 15/10) : `--o-chiffre-bas` devient `--o-chiffre-taille` — le pourcentage n'est plus « en bas » ou « en haut », il est à la place de la température
   * d'un radiateur —, et une carte étroite y pose 20 px au lieu de le cacher. */
  assert.ok(h.includes('font-size:var(--o-chiffre-taille, 25px)') && h.includes('font-size:calc(var(--o-chiffre-taille, 25px) * .6)'), 'la taille se lit dans la feuille : ' + h);
  assert.ok(!/font-size:(25|15)px/.test(h), 'plus de taille écrite en ligne');
  assert.ok(/letter-spacing:-\.02em/.test(h), 'l’approche des chiffres ne bouge pas');
  const taille = await tailleDuChiffre();
  assert.equal(taille(232), 25, 'une carte de 266 px (1440 px) : le pourcentage de toujours');
  assert.equal(taille(200), 25, 'au seuil de la carte moyenne, la grande taille');
  assert.equal(taille(199.5), 21, 'juste en dessous : 21 px');
  assert.equal(taille(192), 21, 'une carte de 226 px (1280 px) : 21 px');
  assert.equal(taille(188), 21);
  // ASSERTION MODIFIÉE (passe téléphone, tâche 3) : sous 188 px de contenu, la carte étroite tait le pourcentage du bas — elle l'écrit en haut, en 22 px (`ChiffreHaut`).
  assert.equal(taille(187.5), 0, 'sous 188 px de contenu, la carte étroite : le pourcentage du bas se tait — ni 20, ni 21, ni 25 px');
});

test('11 bis, R6 : « 100 % » à côté de sa phrase — à 1280, 1366, 1440 et 1920 px, en français, en allemand et en polonais, la phrase tient sur sa ligne, jamais « … »', async () => {
  const taille = await tailleDuChiffre();
  for (const [ecran, contenu] of Object.entries(CONTENUS)) {
    const t = taille(contenu);
    assert.ok(t, ecran + ' px : le pourcentage reste en bas (' + contenu + ' px de contenu)');
    for (const [lang, phrases] of Object.entries(PHRASES)) {
      for (const [phrase, largeur] of phrases) {
        const libre = contenu - AIR - largeurCent(t);
        assert.ok(libre >= largeur + 2, ecran + ' px, ' + lang + ' « ' + phrase + ' » : ' + largeur + ' px de phrase pour ' + libre.toFixed(1) + ' px libres (« 100 % » en ' + t + ' px)');
      }
    }
  }
  // Le défaut mesuré : à 1280 px, la grande taille ne laissait que 120,5 px à une phrase de 123,6 px.
  assert.ok(CONTENUS[1280] - AIR - largeurCent(25) < PHRASES.fr[0][1], '« Allumée depuis 18:05 » ne tenait pas à côté de « 100 % » en 25 px : ' + (CONTENUS[1280] - AIR - largeurCent(25)).toFixed(1) + ' px');
  // Au moins à 1440 px en français : le pourcentage reste en bas, aligné sur la phrase, en grand — sans la petite taille.
  assert.equal(taille(CONTENUS[1440]), 25, 'à 1440 px, le pourcentage du volet : 25 px, en bas');
});

test('11 bis, R6 : tout contenu d’une carte large — de 188 px à 400 — garde sa phrase la plus longue sur une ligne à côté de « 100 % » ; la limite de l’espagnol est écrite', async () => {
  const taille = await tailleDuChiffre();
  const fr = PHRASES.fr[0][1];
  for (let contenu = 188; contenu <= 400; contenu += 0.5) {
    const libre = contenu - AIR - largeurCent(taille(contenu));
    assert.ok(libre >= fr + 2, contenu + ' px de contenu : « Allumée depuis hh:mm » (' + fr + ' px) pour ' + libre.toFixed(1) + ' px libres');
  }
  // La carte la plus étroite de la grille d'Objets : 225 px (`minmax(225px, 1fr)`), 191 de contenu — jamais dans la zone des 188 px.
  assert.ok(225 - 34 >= 188, 'la grille d’Objets ne descend pas sous le seuil de la carte étroite');
  // L'espagnol, plus long (« Encendido desde 18:05 », 134,1 px), demande 196,6 px à 21 px : à 1280 px (192) il se coupe en « … » — hors de la demande (fr, de, pl).
  const es = 134.1;
  assert.ok(CONTENUS[1280] - AIR - largeurCent(21) < es, 'l’espagnol à 1280 px : ' + (CONTENUS[1280] - AIR - largeurCent(21)).toFixed(1) + ' px pour ' + es);
  assert.ok(AIR + largeurCent(21) + es <= 197, 'il faudrait 197 px de contenu');
});

/* ── Passe téléphone, tâche 3 : la carte étroite d'une lumière (sa décision du 15/10, « ok pour 1c » ; ADR 0202, T1, T8, T12) ──────────
 *
 * Sous 188 px de contenu, la plaque d'une lumière EST son interrupteur (`PlaqueBascule`) : un vrai bouton, qui allume ou éteint
 * d'après l'état affiché — `turn_on` / `turn_off`, jamais `toggle` —, et n'ouvre pas la fiche ; toucher ailleurs l'ouvre. Le
 * pourcentage monte en haut à droite (`ChiffreHaut`), la phrase d'une lampe allumée s'écrit à son encre. La carte large ne change
 * pas : sa plaque est un dessin, sa bascule rose reste. */
const plaqueEtroite = (m) => de(m, 'PlaqueBascule');

test('passe téléphone, T12 : sur la carte étroite, la plaque est l’interrupteur — `turn_on` / `turn_off` d’après l’état affiché, jamais `toggle` ; le geste se voit tout de suite', () => dans(() => {
  const w = poser();
  const m = monter(F.RoomLightCard, { id: 'light.bureau', hass: w.hass(), onOpen: () => {} });
  const p = plaqueEtroite(m);
  assert.deepEqual([p.props.on, p.props.nom, p.props.inerte, p.props.fond, p.props.encre], [true, 'Plafonnier Bureau', false, plaque(m).background, plaque(m).color], 'la même plaque que la carte large : sa teinte, son encre');
  m.appuyer(p, 'onToggle');
  assert.deepEqual(w.appels, ['light.turn_off light.bureau'], 'allumée : `turn_off`');
  assert.equal(phrase(m).props.children, 'Éteinte', 'le geste d’abord (`useOptimiste`)');
  assert.equal(plaqueEtroite(m).props.on, false);
  const eteinte = monter(F.RoomLightCard, { id: 'light.chambre', hass: w.hass(), onOpen: () => {} });
  eteinte.appuyer(plaqueEtroite(eteinte), 'onToggle');
  assert.deepEqual(w.appels.slice(1), ['light.turn_on light.chambre'], 'éteinte : `turn_on`');
  assert.match(phrase(eteinte).props.children, /^Allumée depuis \d\d:\d\d$/);
  const sw = monter(F.RoomLightCard, { id: 'switch.applique', hass: w.hass(), onOpen: () => {} });
  sw.appuyer(plaqueEtroite(sw), 'onToggle');
  assert.deepEqual(w.appels.slice(2), ['switch.turn_off switch.applique'], 'un switch déclaré lumière : le service de son domaine');
  assert.ok(!w.appels.some(x => /toggle/.test(x)), 'jamais `toggle`');
  // La plaque et la bascule de la carte large commandent la même chose : une seule fonction, `basculer`.
  assert.equal(de(m, 'RmBascule').props.onToggle, plaqueEtroite(m).props.onToggle);
}));

test('passe téléphone, T12 : la plaque est un vrai bouton — `role="switch"`, nommée comme la bascule, au-dessus de la surface, elle n’ouvre pas la fiche ; muette, inerte sans perdre le focus', () => {
  const ordres = [];
  const bouton = (props) => monter(F.PlaqueBascule, { on: false, nom: 'Plafonnier Chambre', fond: 'var(--o-s1)', encre: 'var(--o-text2)', onToggle: () => ordres.push('bascule'), ...props }).arbre;
  const b = bouton({});
  assert.deepEqual([b.type, b.props.type, b.props.role, b.props['aria-checked'], b.props['aria-label'], b.props['aria-disabled'], b.props.disabled],
    ['button', 'button', 'switch', false, 'Allumer Plafonnier Chambre', undefined, undefined], 'un bouton natif : Entrée et Espace l’activent');
  assert.equal(bouton({ on: true }).props['aria-label'], 'Éteindre Plafonnier Chambre', 'allumée, elle dit le geste qui l’éteint');
  assert.equal(b.props.onKeyDown, undefined, 'pas de `onKeyDown` : le bouton natif suffit, la garde de tests/clavier.test.mjs ne s’applique pas');
  assert.deepEqual([b.props.className, b.props.style.position, b.props.style.width, b.props.style.height, b.props.style.borderRadius, b.props.style.border, b.props.style.padding],
    ['o-gab-plaque o-seul-etroit', 'relative', 38, 38, 14, 'none', 0], 'la plaque de toujours (38 × 38, rayon 14), positionnée : elle passe au-dessus de la surface');
  let arrete = 0;
  b.props.onClick({ stopPropagation: () => { arrete++; } });
  assert.deepEqual([arrete, ordres], [1, ['bascule']], 'un appui commande, et ne remonte pas à la surface : la fiche ne s’ouvre pas');
  const muette = bouton({ inerte: true });
  assert.deepEqual([muette.props['aria-disabled'], muette.props.disabled, muette.props.style.cursor], [true, undefined, 'default'], 'muette : `aria-disabled`, jamais `disabled`, qui ferait tomber le focus');
  /* ASSERTION MODIFIÉE (passe téléphone, corrections bis, point 3) : muette, la plaque se laisse traverser au toucher (`pointerEvents: 'none'`) — il descend à la
   * surface de la carte, qui ouvre la fiche, comme avant que la plaque ne soit un bouton. Elle avalait le toucher (`stopPropagation`) et ne faisait plus rien : sur la
   * carte étroite d'une lampe muette, toucher l'ampoule n'ouvrait plus rien. Vivante, rien ne la traverse : elle commande, et n'ouvre pas la fiche. */
  assert.equal(muette.props.style.pointerEvents, 'none', 'muette : le toucher traverse la plaque jusqu’à la surface, qui ouvre la fiche');
  assert.equal(b.props.style.pointerEvents, undefined, 'vivante : la plaque prend le toucher');
  muette.props.onClick({ stopPropagation: () => { arrete++; } });
  assert.deepEqual([arrete, ordres], [2, ['bascule']], 'muette, Entrée et Espace ne commandent rien — et n’ouvrent pas la fiche non plus : seul le toucher traverse la plaque');
  // Un seul glyphe dedans : la carte ne passe à la plaque que son ampoule (ou l'icône choisie).
  const i = APP.indexOf('<PlaqueBascule on={v.on}');
  const dedans = APP.slice(APP.indexOf('>', APP.indexOf('onToggle={basculer}', i)) + 1, APP.indexOf('</PlaqueBascule>', i)).trim();
  assert.equal(dedans, '<GlypheCarte id={id} size={17}><Fi i="bulb" size={17} /></GlypheCarte>', 'la plaque ne contient que son glyphe : « nested-interactive » tient');
});

test('passe téléphone, T12 : la zone de toucher de la plaque fait 44 × 44, sans l’allongement de ± 12 px des interrupteurs au téléphone', () => {
  const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(CSS.includes(".o-gab-plaque[role=\"switch\"]::after { content: ''; position: absolute; inset: -3px; }"), '38 + 2 × 3 = 44 px, de tous côtés');
  // Le sélecteur bat celui des interrupteurs au téléphone (`[role="switch"]::after`, ± 12 px en hauteur) : une classe de plus, quel que soit l'ordre.
  assert.ok(CSS.includes('[role="switch"]::after {\n    content: \'\';\n    position: absolute;\n    top: -12px;'), 'l’allongement des autres interrupteurs ne change pas');
});

test('passe téléphone, T8 : sur la carte étroite, une lampe allumée écrit sa phrase à son encre — éteinte ou muette, non ; la carte large garde son gris', () => dans(() => {
  const w = poser();
  const allumee = monter(F.RoomLightCard, { id: 'light.ampoule_chambre', hass: w.hass(), onOpen: () => {} });
  const p = phrase(allumee).props;
  assert.equal(p['data-encre'], '', 'la feuille l’écrit à l’encre sur une carte étroite (`.o-gab-phrase[data-encre]`)');
  assert.equal(p.style['--o-encre'], plaque(allumee).color, 'l’encre de la plaque, gardée lisible');
  assert.equal(p.style.color, 'var(--o-text2)', 'la carte large garde son gris : la feuille seule change la couleur, sur la carte étroite');
  assert.equal(p.className, 'o-gab-phrase');
  for (const id of ['light.chambre', 'light.morte']) {
    const autre = phrase(monter(F.RoomLightCard, { id, hass: w.hass(), onOpen: () => {} })).props;
    assert.deepEqual([autre['data-encre'], autre.style['--o-encre']], [undefined, undefined], id + ' : pas d’encre — « Éteinte » au gris, la panne en rouge');
  }
  const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const etroite = CSS.slice(CSS.indexOf('@container (width < 188px) {', CSS.indexOf('.o-gabarit { container-type')));
  assert.ok(etroite.slice(0, etroite.indexOf('\n}\n')).includes('  .o-gab-phrase[data-encre] { color: var(--o-encre) !important; }'), 'la règle vit dans la carte étroite seulement');
}));

test('passe téléphone, T6 : en haut à droite, le pourcentage d’une lampe allumée et variable — rien éteinte, rien pour un switch-lumière', () => dans(() => {
  const w = poser();
  const haut = (id) => monter(F.RoomLightCard, { id, hass: w.hass(), onOpen: () => {} }).trouver(e => e.type && e.type.name === 'ChiffreHaut').map(h => [h.props.v, h.props.u]);
  assert.deepEqual(haut('light.ampoule_chambre'), [[45, '%']]);
  assert.deepEqual(haut('light.bureau'), [[100, '%']]);
  for (const id of ['light.chambre', 'switch.applique', 'light.morte']) assert.deepEqual(haut(id), [], id + ' : pas de chiffre en haut');
}));

/* ── La passe bis 3 du 17/10 (chantier Mode enfant) : le pourcentage d'une lampe suit le doigt ────────────────────────────────── */

/* TEST AJOUTÉ (passe bis 3 du 17/10, point 3 ; sa demande pour le volume — « quand je regle le volume, le pourcentage ne suis pas comme sur
 * la maquette » — vaut pour la luminosité). La barre peignait le doigt à la main, et « 45 % » restait figé jusqu'au relâcher. Elle annonce le
 * doigt (`onGlisse`), la vue de la lampe le garde (`glisse`, `suivre`) : le chiffre de la carte large, celui de la carte étroite et ce que dit
 * la surface suivent ; UN `turn_on` au relâcher, et le geste d'abord garde la valeur posée. Éteinte (L7), le chiffre paraît dès le glisser, la
 * lampe reste dite éteinte, et rien ne part avant le relâcher ; un geste annulé n'allume rien. */
const sousLeDoigt = (props, x) => {
  const barre = monter(F.RmJauge, props);
  const el = { querySelector: () => null, getBoundingClientRect: () => ({ left: 0, width: 226 }), classList: { add() {}, remove() {} }, setPointerCapture() {}, onpointermove: null, onpointerup: null, onpointercancel: null };
  barre.arbre.props.onPointerDown({ stopPropagation() {}, preventDefault() {}, currentTarget: el, clientX: x, pointerId: 1 });
  return el;
};
const chiffres = (m) => [(de(m, 'ChiffreLumiere') || { props: {} }).props.bri, (de(m, 'ChiffreHaut') || { props: {} }).props.v];

test('passe bis 3, point 3 : le pourcentage d’une lampe suit le doigt — la carte large, la carte étroite, la surface ; UN `turn_on` au relâcher ; éteinte, le chiffre paraît dès le glisser et rien ne part avant', () => dans(({ h }) => {
  const w = poser();
  const m = monter(F.RoomLightCard, { id: 'light.ampoule_chambre', hass: w.hass(), onOpen: () => {} });
  assert.deepEqual(chiffres(m), [45, 45]);
  assert.equal(typeof de(m, 'RmJauge').props.onGlisse, 'function', 'la barre annonce le doigt');
  // (226 − 26) px de piste utile : 100 px font 50 %, 160 px 80 %, 40 px 20 %.
  const el = sousLeDoigt(de(m, 'RmJauge').props, 100);
  m.rendre();
  assert.deepEqual(chiffres(m), [50, 50], 'posé sur la barre : les deux chiffres suivent');
  assert.ok(de(m, 'Surface').props.label.includes('50 %'), 'et ce que la surface dit au lecteur d’écran');
  for (const [x, attendu] of [[160, 80], [40, 20]]) {
    el.onpointermove({ clientX: x });
    m.rendre();
    assert.deepEqual(chiffres(m), [attendu, attendu], 'le chiffre suit le doigt, à ' + attendu);
    assert.equal(de(m, 'RmJauge').props.v, attendu, 'la barre reçoit la valeur du doigt');
  }
  assert.deepEqual(w.appels, [], 'rien ne part pendant le glisser');
  el.onpointerup();
  m.rendre();
  assert.deepEqual(w.appels, ['light.turn_on light.ampoule_chambre brightness_pct=20'], 'UN seul ordre, au relâcher');
  assert.deepEqual(chiffres(m), [20, 20], 'le geste d’abord : le chiffre garde la valeur posée, il ne repasse pas par 45');
  // La lampe ne répond pas (la doublure reste à 45 %) : quatre secondes plus tard, la carte redit ce que la maison dit.
  h.avancer(4100);
  m.rendre();
  assert.deepEqual(chiffres(m), [45, 45]);
  // Éteinte, au dernier niveau du carnet (80 %) : le chiffre paraît dès le glisser, la lampe reste dite éteinte, rien ne part.
  const w2 = poser();
  const e = monter(F.RoomLightCard, { id: 'light.chambre', hass: w2.hass(), onOpen: () => {} });
  assert.deepEqual(chiffres(e), [undefined, undefined], 'éteinte : pas de chiffre');
  const el2 = sousLeDoigt(de(e, 'RmJauge').props, 60);
  e.rendre();
  assert.deepEqual(chiffres(e), [30, 30], 'sous le doigt : le chiffre, dès le glisser');
  assert.deepEqual([phrase(e).props.children, de(e, 'RmJauge').props.eteinte, de(e, 'RmJauge').props.v], ['Éteinte', true, 80], 'la lampe reste éteinte, le repère gris à son dernier niveau');
  assert.deepEqual(w2.appels, [], 'rien n’est parti');
  el2.onpointerup();
  e.rendre();
  assert.deepEqual(w2.appels, ['light.turn_on light.chambre brightness_pct=30'], 'L7 : le relâcher l’allume à ce niveau, une fois');
  assert.deepEqual(chiffres(e), [30, 30]);
  assert.match(phrase(e).props.children, /^Allumée depuis \d\d:\d\d$/);
  // Un geste annulé (`pointercancel` : la page défile) n'allume rien, et le chiffre s'en va.
  const w3 = poser();
  const a = monter(F.RoomLightCard, { id: 'light.chambre', hass: w3.hass(), onOpen: () => {} });
  const el3 = sousLeDoigt(de(a, 'RmJauge').props, 60);
  a.rendre();
  assert.deepEqual(chiffres(a), [30, 30]);
  el3.onpointercancel();
  a.rendre();
  assert.deepEqual([chiffres(a), w3.appels, phrase(a).props.children], [[undefined, undefined], [], 'Éteinte'], 'annulé : éteinte, sans chiffre, rien de parti');
}));

/* ── Audit du 19/10, seconde tranche ───────────────────────────────────────── */

test('B3 : deux appuis rapides sur la bascule — l’écho du premier ordre n’efface pas l’avance du second ; la lampe atteint l’état demandé, sa vérité reprend', () => dans(() => {
  const w = poser();
  const m = monter(F.RoomLightCard, { id: 'light.bureau', hass: w.hass(), onOpen: () => {} });
  m.appuyer(de(m, 'RmBascule'), 'onToggle');   // allumée → off
  m.appuyer(de(m, 'RmBascule'), 'onToggle');   // → on, avant toute réponse
  assert.deepEqual(w.appels, ['light.turn_off light.bureau', 'light.turn_on light.bureau']);
  assert.match(phrase(m).props.children, /^Allumée depuis/, 'le second appui se voit');
  // Les réponses de la lampe, APRÈS son dernier changement (la doublure est allumée depuis 18:05, quelle que soit l'heure du test).
  const base = Date.parse(w.courants['light.bureau'].last_changed);
  const repond = (state, ms) => { w.courants['light.bureau'] = { ...w.courants['light.bureau'], state, last_changed: new Date(base + ms).toISOString() }; m.proprietes({ hass: w.hass() }); };
  // L'écho du PREMIER ordre : la lampe dit `off`, son `last_changed` a bougé.
  repond('off', 500);
  assert.match(phrase(m).props.children, /^Allumée depuis/, 'l’écho d’un ordre plus ancien ne fait pas retomber la carte sur « Éteinte »');
  // Puis celui du second : `on`, plus récent — la vérité de la lampe reprend la main, et c'est acquis.
  repond('on', 1500);
  assert.equal(phrase(m).props.children, 'Allumée depuis ' + new Date(base + 1500).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
  assert.equal(de(m, 'RmBascule').props.on, true);
  repond('off', 2500);
  assert.equal(phrase(m).props.children, 'Éteinte', 'un changement venu d’ailleurs, après la réponse, se voit tout de suite');
}));

test('B3 : les paliers d’un fondu ne font pas sauter le chiffre posé — 60 reste 60 pendant que la lampe passe par 48 ; à 60 atteint, la lampe fait foi', () => dans(({ h }) => {
  const w = poser();
  w.courants['light.bureau'] = { ...w.courants['light.bureau'], attributes: { ...w.courants['light.bureau'].attributes, brightness: 102 } };   // 40 %
  const m = monter(F.RoomLightCard, { id: 'light.bureau', hass: w.hass(), onOpen: () => {} });
  assert.equal(de(m, 'ChiffreLumiere').props.bri, 40);
  de(m, 'RmJauge').props.onCommit(60);
  m.rendre();
  assert.equal(de(m, 'ChiffreLumiere').props.bri, 60);
  const base = Date.parse(w.courants['light.bureau'].last_updated);
  const palier = (b, ms) => { w.courants['light.bureau'] = { ...w.courants['light.bureau'], last_updated: new Date(base + ms).toISOString(), attributes: { ...w.courants['light.bureau'].attributes, brightness: b } }; m.proprietes({ hass: w.hass() }); };
  palier(122, 300);   // 48 %
  assert.equal(de(m, 'ChiffreLumiere').props.bri, 60, 'un palier du fondu (48) n’est pas une réponse');
  palier(140, 600);   // 55 %
  assert.equal(de(m, 'ChiffreLumiere').props.bri, 60);
  palier(153, 900);   // 60 % : atteint
  assert.equal(de(m, 'ChiffreLumiere').props.bri, 60);
  palier(128, 1200);  // 50 % : la lampe a répondu, sa vérité reprend
  assert.equal(de(m, 'ChiffreLumiere').props.bri, 50, 'après la réponse, la lampe fait foi');
  // Sans jamais atteindre la valeur (une lampe qui plafonne à 59) : le filet de 4 s.
  de(m, 'RmJauge').props.onCommit(80);
  m.rendre();
  palier(150, 1500);  // 59 %
  assert.equal(de(m, 'ChiffreLumiere').props.bri, 80);
  h.avancer(4100);
  m.rendre();
  assert.equal(de(m, 'ChiffreLumiere').props.bri, 59, 'le filet passé : la maison fait foi');
}));

test('B12 : allumée sans `brightness`, la carte ne dit plus « 100 % » — rien, ou le dernier niveau que le carnet garde', () => dans(() => {
  const w = poser();
  w.courants['light.bureau'] = { ...w.courants['light.bureau'], attributes: { ...w.courants['light.bureau'].attributes, brightness: null } };
  const m = monter(F.RoomLightCard, { id: 'light.bureau', hass: w.hass(), onOpen: () => {} });
  assert.ok(!de(m, 'ChiffreLumiere'), 'aucun chiffre inventé');
  assert.match(phrase(m).props.children, /^Allumée depuis/);
  const w2 = poser({ carnet: { lumieres: { 'light.bureau': { dernier: { bri: 80, mode: 'brightness' } } } } });
  w2.courants['light.bureau'] = { ...w2.courants['light.bureau'], attributes: { ...w2.courants['light.bureau'].attributes, brightness: null } };
  const m2 = monter(F.RoomLightCard, { id: 'light.bureau', hass: w2.hass(), onOpen: () => {} });
  assert.equal(de(m2, 'ChiffreLumiere').props.bri, 80, 'le carnet sait son dernier niveau : il se dit');
}));

test('B10 : la lampe change d’état — les minuteurs se relisent tout de suite, UNE fois pour la carte et la fiche ensemble ; « S’éteint à » ne survit pas à un minuteur annulé', () => dans(async () => {
  const fin = Math.floor(Date.now() / 1000) + 3600;
  const w = poser({ minuteurs: { 'light.bureau': { fin, duree: 60 } } });
  const lectures = [];
  L.reglerLumieresEtat({ hass: { callWS: (msg) => { lectures.push(msg.type); return Promise.resolve(msg.type === 'loggia/minuteurs/etat' ? { minuteurs: {}, maintenant: Date.now() / 1000 } : { lumieres: {} }); } },
    horloge: { repeter: () => 0, arreter() {}, plusTard: () => 0, annuler() {}, maintenant: () => Date.now() } });
  PRISES.poserMinuteurs({ minuteurs: { 'light.bureau': { fin, duree: 60 } }, maintenant: Date.now() / 1000 });
  const m = monter(F.RoomLightCard, { id: 'light.bureau', hass: w.hass(), onOpen: () => {} });
  const m2 = monter(F.RoomLightCard, { id: 'light.bureau', hass: w.hass(), onOpen: () => {} });
  assert.match(phrase(m).props.children, /^S’éteint à/);
  const avant = lectures.filter(t => t === 'loggia/minuteurs/etat').length;
  // Éteinte à la main (le serveur annule le minuteur), puis rallumée dans la minute.
  const base = Date.parse(w.courants['light.bureau'].last_changed);
  const tour = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  w.courants['light.bureau'] = { ...w.courants['light.bureau'], state: 'off', last_changed: new Date(base + 1000).toISOString() };
  m.proprietes({ hass: w.hass() }); m2.proprietes({ hass: w.hass() });
  await tour();
  w.courants['light.bureau'] = { ...w.courants['light.bureau'], state: 'on', last_changed: new Date(base + 2000).toISOString() };
  m.proprietes({ hass: w.hass() }); m2.proprietes({ hass: w.hass() });
  await tour();
  assert.equal(lectures.filter(t => t === 'loggia/minuteurs/etat').length - avant, 2, 'deux changements d’état : deux relectures — les deux cartes n’en font qu’une à chaque fois');
  m.rendre();
  assert.match(phrase(m).props.children, /^Allumée depuis/, 'le magasin relu ne connaît plus le minuteur : plus de « S’éteint à »');
}));

/* TEST AJOUTÉ (audit du 19/10, seconde tranche ; B11). Une flèche tenue sur la barre d'une carte envoyait un `turn_on` par
 * répétition. En rafale (`RmJauge`, `rafale`), la barre et le chiffre suivent la touche et UN ordre part au relâcher ; le doigt
 * s'en va après. Les autres barres — un volet, un volume — ne changent pas : elles n'ont pas `rafale`. */
test('B11 : une flèche tenue sur la barre de la carte — le chiffre suit, UN `turn_on` au relâcher ; une barre sans `rafale` commande à chaque touche', () => dans(({ h }) => {
  const w = poser();
  const m = monter(F.RoomLightCard, { id: 'light.bureau', hass: w.hass(), onOpen: () => {} });
  const jauge = de(m, 'RmJauge');
  assert.equal(jauge.props.rafale, true);
  const barre = monter(F.RmJauge, jauge.props);
  const fill = { style: {} }, kn = { style: {} };
  const el = { querySelector: (q) => (q === '[data-fill]' ? fill : q === '[data-knob]' ? kn : null) };
  const touche = (key) => barre.arbre.props.onKeyDown({ key, preventDefault() {}, stopPropagation() {}, currentTarget: el });
  touche('ArrowDown'); touche('ArrowDown'); touche('ArrowDown'); touche('ArrowDown');
  assert.deepEqual(w.appels, [], 'quatre répétitions : rien ne part');
  m.rendre();
  assert.equal(de(m, 'ChiffreLumiere').props.bri, 80, 'le chiffre suit la touche (100 → 80, par pas de 5)');
  assert.ok(fill.style.width && kn.style.left, 'la barre est peinte sous la touche');
  barre.arbre.props.onKeyUp({ currentTarget: el });
  assert.deepEqual(w.appels, ['light.turn_on light.bureau brightness_pct=80'], 'UN ordre, au relâcher');
  m.rendre();
  assert.equal(de(m, 'ChiffreLumiere').props.bri, 80, 'le geste d’abord garde 80, le doigt est parti');
  // Sans relâcher : 500 ms après la dernière touche — la barre redessinée par la carte, à 80.
  const barre2 = monter(F.RmJauge, de(m, 'RmJauge').props);
  barre2.arbre.props.onKeyDown({ key: 'ArrowUp', preventDefault() {}, stopPropagation() {}, currentTarget: el });
  h.avancer(500);
  assert.deepEqual(w.appels[1], 'light.turn_on light.bureau brightness_pct=85');
  // Une barre sans `rafale` (un volet) : chaque touche commande, comme avant.
  const ordres = [];
  const volet = monter(F.RmJauge, { v: 50, couleur: 'var(--o-purple)', label: 'Volet', onCommit: (n) => ordres.push(n) });
  volet.arbre.props.onKeyDown({ key: 'ArrowRight', preventDefault() {}, stopPropagation() {}, currentTarget: el });
  volet.arbre.props.onKeyDown({ key: 'ArrowRight', preventDefault() {}, stopPropagation() {}, currentTarget: el });
  assert.deepEqual(ordres, [55, 55], 'sans rafale, rien ne change : un ordre par touche, depuis la valeur dessinée');
  assert.equal(volet.arbre.props.onKeyUp, undefined);
}));

