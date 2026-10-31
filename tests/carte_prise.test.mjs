/* La carte d'une prise, rendue (chantier Prises, § 3.1, 3.2 ; ADR 0193).
 *
 * Sous `?carteprise`, App.jsx exporte en plus la carte d'une prise et la carte
 * générique — le fichier n'est pas touché (le crochet de
 * tests/carte_volet.test.mjs). L'index de Loggia porte les appareils des
 * prises (la règle des prises les lit), l'état du serveur est posé dans le
 * cache partagé (prisesetat.js), les mesures du jour lues d'un serveur doublé.
 * Les heures sont celles d'aujourd'hui, à Paris : la phrase dit l'heure du
 * navigateur. Ce qui est garanti ici :
 *  - allumée : la plaque et le lavis de son appareil, la phrase du § 4, la
 *    puissance en grand (W, ou kW et deux décimales), « Aujourd'hui », ses
 *    kWh et la courbe du jour ; la surface annonce le nom, la phrase, la
 *    puissance ;
 *  - protégée : le cadenas « Protégée » ; la bascule demande avant de couper ;
 *  - coupée : la plaque grise, ni chiffre ni lavis, le pied reste ;
 *  - muette : le liseré de panne, la phrase en rouge, la bascule inerte, le
 *    glyphe de l'appareil toujours là ;
 *  - sans mesure : ni chiffre ni pied ;
 *  - la fabrique : la carte d'une PRISE ; un switch qui ne mesure pas garde la
 *    carte générique, qui ne connaît plus les prises ;
 *  - la compacte (tâche 8) garde sa disposition et prend la phrase, la
 *    puissance et le glyphe ; protégée, sa bascule ouvre la fiche.
 * PASSE TÉLÉPHONE (tâche 5 ; T10, T11, T17, ADR 0202) : la carte est au gabarit
 * de la grille commune (`o-gabarit`). Ce qui change de place s'écrit deux fois,
 * la feuille n'en montre qu'une : la puissance (en bas pour la carte large, en
 * haut pour l'étroite), la bascule (en haut ; dans la ligne de commandes), le
 * cadenas (en haut ; la pastille) et la phrase quand elle a une forme courte.
 * Un rendu sans feuille voit les deux : chaque test vise la sienne. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { area, device, entity, state, states, ctxOf } from './fixtures.mjs';
// ASSERTION MODIFIÉE (passe téléphone, corrections bis 2, point 1) : la demande d'une carte se joue sur la VRAIE carte (le test « défaire la demande »).
import { monter, horlogeFausse, documentFaux } from './crochets.mjs';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
// ASSERTION MODIFIÉE (passe téléphone, corrections bis 2, point 1) : `defaireDemande` n'a plus besoin de s'exporter — le test la joue par la carte.
const NOMS = ['RoomPriseCard', 'RoomGenericCard', 'CvCard'];
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?carteprise')) return next(url, ctx);",
  '  const r = await next(url.slice(0, -11), ctx);',
  "  return { ...r, source: String(r.source) + ';export { " + NOMS.join(', ') + " };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?carteprise', import.meta.url).href);
const E = await import('../src/prisesetat.js');
const { Surface } = await import('../src/ui.jsx');   // le bouton que la carte pose sur elle-même, pour s'ouvrir : le test « défaire la demande » le cherche dans l'arbre
const APP = MONOLITHE.replace(/\r\n/g, '\n');

// Aujourd'hui à hh:mm, à l'heure de la maison ; et dix jours plus tôt, que la phrase écrit en date.
const a = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const DIX_JOURS = new Date(Date.now() - 10 * 86400000);
const NAS = 'switch.prise_nas_zephyr', PC = 'switch.prise_pc_bureau_atlas', LV = 'switch.prise_lave_vaisselle', NUE = 'switch.prise_sejour';

/* Trois prises Zigbee qui mesurent (puissance, énergie, et leur verrou enfant,
 * un switch de configuration), une prise de classe `outlet` sans capteur, et
 * un switch sans appareil qui ne mesure pas. La classe vit au registre : c'est
 * là que la règle la lit, comme le serveur. */
// ASSERTION MODIFIÉE (passe téléphone, corrections bis, point 2) : `nas` (le NAS, protégé, peut être coupé) et `pcDepuis` (le PC peut l'être depuis un autre jour) —
// les deux cas de la forme courte (T17) que la maison ne posait pas. Sans eux, rien ne change.
function maison({ pc = 'on', pcW = 146, lvW = 1, nas = 'on', pcDepuis = null } = {}) {
  const classe = (id, dev, c) => ({ ...entity(id, { device: dev }), device_class: c });
  const prise = (id, dev) => [entity('switch.' + id, { device: dev }), classe('sensor.' + id + '_power', dev, 'power'),
    classe('sensor.' + id + '_energy', dev, 'energy'), entity('switch.' + id + '_child_lock', { device: dev, category: 'config' })];
  const etats = (id, nom, st, w, depuis) => [
    [ 'switch.' + id, { entity_id: 'switch.' + id, state: st, last_changed: depuis, attributes: { friendly_name: nom } } ],
    state('sensor.' + id + '_power', String(w), { friendly_name: nom + ' Power', device_class: 'power', unit_of_measurement: 'W' }),
    state('sensor.' + id + '_energy', '212.6', { friendly_name: nom + ' Energy', device_class: 'energy', unit_of_measurement: 'kWh' }),
    state('switch.' + id + '_child_lock', 'off', { friendly_name: nom + ' Child lock' }),
  ];
  return {
    areas: [area('bureau', 'Bureau'), area('cuisine', 'Cuisine'), area('salon', 'Salon')],
    devices: ['d_nas', 'd_pc', 'd_lv'].map((d, i) => device(d, ['Prise NAS (Zephyr)', 'Prise PC Bureau (Atlas)', 'Prise lave-vaisselle'][i], i < 2 ? 'bureau' : 'cuisine',
      { manufacturer: 'Tuya', model: 'Smart plug (with power monitoring)' })).concat([device('d_sejour', 'Prise séjour', 'salon', { manufacturer: 'Netatmo', model: 'Smart plug' })]),
    entities: [...prise('prise_nas_zephyr', 'd_nas'), ...prise('prise_pc_bureau_atlas', 'd_pc'), ...prise('prise_lave_vaisselle', 'd_lv'),
      classe(NUE, 'd_sejour', 'outlet'), entity('switch.radiateur_salon', { area: 'salon' })],
    floors: [],
    states: states(
      ...etats('prise_nas_zephyr', 'Prise NAS (Zephyr)', nas, 4, DIX_JOURS.toISOString()),
      ...etats('prise_pc_bureau_atlas', 'Prise PC Bureau (Atlas)', pc, pcW, pcDepuis || (pc === 'off' ? a(20, 40) : pc === 'unavailable' ? a(14, 20) : a(8, 50))),
      ...etats('prise_lave_vaisselle', 'Prise lave-vaisselle', 'on', lvW, a(13, 40)),
      [NUE, { entity_id: NUE, state: 'on', last_changed: a(7, 5), attributes: { friendly_name: 'Prise séjour', device_class: 'outlet' } }],
      state('switch.radiateur_salon', 'on', { friendly_name: 'Radiateur salon' }),
    ),
    energyPrefs: null,
  };
}
const ETAT = { maintenant: a(20, 40), notifier: true,
  config: { protegees: [NAS], types: {}, prevenir: { [LV]: true } },
  prises: {
    [NAS]: { type: 'nas', impose: false, protegee: true, prevenir: false, cycle: null, cycles: [] },
    [PC]: { type: 'pc', impose: false, protegee: false, prevenir: false, cycle: null, cycles: [] },
    [LV]: { type: 'lv', impose: false, protegee: false, prevenir: true, cycle: null, cycles: [{ debut: a(13, 40), fin: a(16, 14), kwh: 1.08 }] },
    [NUE]: { type: 'prise', impose: false, protegee: false, prevenir: false, cycle: null, cycles: [] },
  } };

/* La maison posée dans l'index de Loggia, l'état du serveur dans son cache, et
 * les mesures du jour lues pour le PC — un serveur doublé, une horloge qui ne
 * tourne que sur demande. `attente` : le serveur ne répond pas encore (le
 * chargement) — avec `etat: null`, la protection d'une prise reste INCONNUE. */
async function poser(fx, { etat = ETAT, mesures = null, attente = false } = {}) {
  setLoggiaState({ index: ctxOf(fx, {}).index, ent: {}, cfg: {}, resolved: null });
  const appels = [];
  const horloge = { repeter: () => 0, arreter: () => {}, plusTard: (f) => { appels.push(f); return appels.length; }, annuler: () => {}, maintenant: () => Date.now() };
  E.reglerPrisesEtat({ hass: { callWS: () => (attente ? new Promise(() => {}) : Promise.resolve(mesures || {})) }, horloge });
  E.poserEtatPrises(etat);
  E.poserMinuteurs({ minuteurs: {}, maintenant: Date.now() / 1000 });
  if (mesures) {
    E.suivreMesures(Object.keys(mesures));
    appels.forEach(f => f());
    await new Promise(r => setImmediate(r));
  }
}
const carte = (fx, id) => renderToStaticMarkup(createElement(F.RoomPriseCard, { id, hass: { states: fx.states, callService: () => Promise.resolve() }, onOpen: () => {} }));
const surface = (html) => (/<button[^>]*class="o-surface"[^>]*aria-label="([^"]*)"/.exec(html) || /aria-label="([^"]*)"[^>]*class="o-surface"/.exec(html) || [])[1];

// La journée du PC : deux moyennes sur 5 minutes (08:00 et 09:00), et ce que son compteur a compté.
function journeePc() {
  const minuit = new Date(); minuit.setHours(0, 0, 0, 0);
  const t = (h) => minuit.getTime() + h * 3600000;
  return {
    'sensor.prise_pc_bureau_atlas_power': [{ start: t(8), end: t(8) + 300000, mean: 120 }, { start: t(9), end: t(9) + 300000, mean: 160 }],
    'sensor.prise_pc_bureau_atlas_energy': [{ start: t(8), end: t(8) + 300000, change: 0.25 }, { start: t(9), end: t(9) + 300000, change: 0.17 }],
  };
}

test('allumée : la plaque et le lavis de son appareil, la phrase, la puissance, le jour et sa courbe', async () => {
  const fx = maison();
  await poser(fx, { mesures: journeePc() });
  const html = carte(fx, PC);
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : la carte porte la grille commune (`o-gabarit`), son conteneur ; `data-chiffre` est parti avec la seule règle qui le lisait.
  assert.ok(html.startsWith('<div class="o-rmcard o-gabarit" data-prise=""'), 'la carte de la maison, sa requête de conteneur');
  assert.equal(surface(html), 'Prise PC Bureau (Atlas), En marche depuis 08:50, 146 W', 'la surface : le nom, la phrase, la puissance');
  assert.ok(html.includes('background:rgba(var(--o-piece-ambre-rgb),.18);color:var(--o-piece-ambre)'), 'la plaque ambre du PC');
  assert.ok(html.includes('linear-gradient(180deg,rgba(var(--o-piece-ambre-rgb),'), 'le lavis de son appareil');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : la puissance du bas ne s'écrit que pour la carte large (`o-seul-large`).
  assert.ok(/class="o-prise-chiffre o-seul-large"[^>]*><span[^>]*font-size:25px[^>]*>146<\/span><span[^>]*font-size:15px[^>]*>W<\/span>/.test(html), '« 146 » en 25 px, « W » en 15');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : la copie du pied est partie ; la carte étroite écrit la puissance EN HAUT (`ChiffreHaut`, T6).
  assert.ok(/class="o-gab-chiffre o-seul-etroit"[^>]*--o-em:2\.334"><span[^>]*>146<\/span><span[^>]*>W<\/span>/.test(html) && !html.includes('o-prise-chiffre-pied'), 'et sa copie du haut, pour la carte étroite');
  assert.ok(html.includes('>En marche depuis 08:50<') && html.includes('color:var(--o-text2)'), 'la phrase du § 4');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : « Aujourd’hui » n'a plus de classe — la règle qui le taisait au pied d'une carte étroite est partie.
  assert.ok(html.includes('<span>Aujourd’hui</span>') && html.includes('>0,42 kWh<'), '« Aujourd’hui » et ce que son compteur a compté');
  assert.ok(html.includes('class="o-prise-courbe"') && html.includes('viewBox="0 0 240 36"'), 'la courbe du jour');
  assert.ok(/<path d="M[\d.]+ 9 L[\d.]+ 0 L240 3\.[12]" /.test(html), 'deux moyennes (120 W, 160 W au sommet), puis la puissance du moment, à droite');
  assert.ok(html.includes('fill:rgba(var(--o-piece-ambre-rgb),.22)') && html.includes('stroke:var(--o-piece-ambre);stroke-width:1.5'), 'l’aire et la ligne de la teinte');
  assert.ok(!html.includes('aria-label="Protégée"'), 'pas de cadenas sans protection');
  assert.ok(/role="switch" aria-checked="true"[^>]*aria-label="Éteindre Prise PC Bureau \(Atlas\)"/.test(html), 'la bascule rose');
});

test('point 17 (passe 9 bis A, sa demande) : la puissance est en bas, à droite du nom ET de la phrase — la disposition de la carte d’une lumière et de celle d’un volet', async () => {
  const fx = maison();
  await poser(fx, { mesures: journeePc() });
  const html = carte(fx, PC);
  const debut = html.indexOf('<div style="display:flex;align-items:flex-end;gap:10px;margin-top:var(--o-milieu-haut, 14px)">');
  assert.ok(debut >= 0, 'la rangée du milieu : alignée par le BAS, 14 px sous la plaque, comme celle d’un volet — ' + html.slice(html.indexOf('o-prise-nom') - 160, html.indexOf('o-prise-nom') + 60));
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : le pied ne s'écrit que pour la carte large (`o-seul-large`).
  const rangee = html.slice(debut, html.indexOf('<div class="o-prise-pied o-seul-large"'));
  // À gauche, la colonne du nom puis de la phrase ; à droite, la puissance — dans la même rangée.
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : le nom et la phrase portent les classes de la grille commune (`o-gab-nom`, `o-gab-phrase`).
  assert.ok(/^<div style="[^"]*"><div style="flex:1;min-width:0"><div class="o-gab-nom"[^>]*>Prise PC Bureau \(Atlas\)<\/div><div class="o-gab-phrase"[^>]*>En marche depuis 08:50<\/div><\/div><span aria-hidden="true" class="o-prise-chiffre o-seul-large"/.test(rangee),
    'le nom et la phrase dans UNE colonne, la puissance après elle : ' + rangee.slice(0, 420));
  // Elle ne remonte plus de 7 px : le bas de la puissance est le bas de la phrase.
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : sa classe porte aussi `o-seul-large`.
  assert.ok(!/class="o-prise-chiffre[^"]*"[^>]*margin-top/.test(html), 'la puissance rendue ne porte aucune marge');
  assert.ok(!APP.includes('marginTop: -7'), 'plus aucune carte de la maison ne remonte son chiffre dans l’air du dessus');
  /* ASSERTION MODIFIÉE (passe téléphone, tâche 5) : la variante du pied est partie (`ChiffrePrise pied`, `o-prise-chiffre-pied`, `--o-pied-chiffre`) ;
   * la carte étroite écrit la puissance en haut (`ChiffreHaut`), dans la rangée de la plaque, avant la rangée du milieu. */
  assert.ok(!APP.includes('o-prise-chiffre-pied') && !APP.includes('--o-pied-chiffre') && !APP.includes('ChiffrePrise w={v.watts} pied'), 'plus de chiffre au pied');
  assert.ok(html.indexOf('class="o-gab-chiffre o-seul-etroit"') < debut && html.indexOf('class="o-prise-chiffre o-seul-large"') < html.indexOf('class="o-prise-pied o-seul-large"'), 'l’une en haut, l’autre à droite du nom');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : `display: flex` s'écrit en ligne — la feuille ne le pose plus, elle tait la puissance d'une carte étroite.
  assert.ok(APP.includes("style={{ display: 'flex', flexShrink: 0, alignItems: 'baseline', gap: 3, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap', color: 'var(--o-text)' }}>"), 'ChiffrePrise : sans marginTop');
  // Sans mesure ni puissance (coupée), la rangée ne garde que sa colonne.
  const coupee = maison({ pc: 'off' });
  await poser(coupee);
  const sans = carte(coupee, PC);
  const r2 = sans.slice(sans.indexOf('<div style="display:flex;align-items:flex-end;gap:10px;margin-top:var(--o-milieu-haut, 14px)">'));
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : `o-gab-nom`, et la puissance tue partout.
  assert.ok(r2.startsWith('<div style="display:flex;align-items:flex-end;gap:10px;margin-top:var(--o-milieu-haut, 14px)"><div style="flex:1;min-width:0"><div class="o-gab-nom"') && !sans.includes('o-prise-chiffre') && !sans.includes('o-gab-chiffre'), 'coupée : la colonne seule');
});

test('au-delà de 1 000 W : « 1,95 » et « kW » ; un cycle en cours dit son début', async () => {
  const fx = maison({ lvW: 1950 });
  await poser(fx, { etat: { ...ETAT, prises: { ...ETAT.prises, [LV]: { ...ETAT.prises[LV], cycle: { debut: a(13, 40) }, cycles: [] } } } });
  const html = carte(fx, LV);
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : la puissance du bas porte `o-seul-large` ; celle du haut dit sa largeur, « 1,95 kW » rétrécit à 320 px.
  assert.ok(/class="o-prise-chiffre o-seul-large"[^>]*><span[^>]*>1,95<\/span><span[^>]*>kW<\/span>/.test(html));
  assert.ok(/class="o-gab-chiffre o-seul-etroit"[^>]*--o-em:2\.928"><span[^>]*>1,95<\/span><span[^>]*>kW<\/span>/.test(html), 'en haut de la carte étroite, sa largeur en em');
  assert.ok(html.includes('>En marche depuis 13:40<'));
  assert.ok(html.includes('rgba(var(--o-cyan-rgb),.18);color:var(--o-cyan)'), 'le lave-vaisselle en cyan (P12)');
});

test('électroménager, cycle fini, moins de 2 W : « Terminé à 16:14 · 1,08 kWh », sans lavis à 1 W… mais actif', async () => {
  const fx = maison({ lvW: 0.5 });
  await poser(fx);
  const html = carte(fx, LV);
  assert.ok(html.includes('>Terminé à 16:14 · 1,08\u00A0kWh<'), 'le nombre et son unité ne se séparent pas en bout de ligne (F7)');
  assert.ok(!html.includes('linear-gradient(180deg,rgba(var(--o-cyan-rgb),'), 'sous 1 W, la prise ne travaille pas : pas de lavis');
  assert.ok(html.includes('rgba(var(--o-cyan-rgb),.18)'), 'la plaque reste teintée : allumée et vivante');
});

test('protégée : le cadenas « Protégée », et la bascule demande avant de couper (P5)', async () => {
  const fx = maison();
  await poser(fx);
  const html = carte(fx, NAS);
  assert.ok(/<span role="img" aria-label="Protégée" title="Protégée"[^>]*><i[^>]*fi-rr-lock/.test(html), 'le cadenas, 12 px, nommé');
  assert.ok(html.indexOf('aria-label="Protégée"') < html.indexOf('role="switch"'), 'à gauche de la bascule');
  assert.ok(html.includes('>En marche depuis le ' + DIX_JOURS.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + '<'), 'allumée depuis un autre jour : sa date');
  assert.ok(html.includes('>4<') && html.includes('>W<'));
  // La demande : la question à la place de la phrase, Annuler et Couper à la place du pied, 6 s au plus.
  // La garde (A3) : protégée, OU protection pas encore lue — tests/prises_gestes.test.mjs joue les deux.
  assert.ok(APP.includes('const toucher = () => { if (v.on && v.garde) setDemande(true); else v.commander(!v.on); };'));
  // Une seule valeur pour la carte, la compacte et la fiche : elle vit dans prises.js (démarrage), la fiche n'importe jamais App.jsx.
  assert.ok(readFileSync(new URL('../src/prises.js', import.meta.url), 'utf8').includes('export const DEMANDE_PRISE_MS = 6000;'));
  assert.ok(/import \{[^}]*\bDEMANDE_PRISE_MS\b[^}]*\} from '\.\/prises\.js';/.test(APP) && !APP.includes('const DEMANDE_PRISE_MS'));
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : la classe de la grille commune ; la carte étroite ne demande plus sur place (T10), la question n'y passe plus sur deux lignes.
  assert.ok(APP.includes("? <div className=\"o-gab-phrase\" style={{ ...RM_SUB, fontSize: 12.5, fontWeight: 700, color: 'var(--o-text1)' }}>{tr('Couper la prise ?')}</div>"),
    'la question prend la place de la phrase');
  assert.ok(APP.includes('<div role="group" aria-label={tr(\'Couper la prise ?\')} data-demande="" style={{ display: \'flex\', gap: 8, marginTop: \'auto\', paddingTop: 10 }}>'));
  assert.ok(APP.includes("aria-label={tr('Couper') + ' ' + v.nom} title={tr('Couper')} onClick={(e) => { e.stopPropagation(); defaireDemande(racine.current, setDemande); v.commander(false); }}"));
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : leurs glyphes sont partis avec la demande d'une carte étroite (`o-prise-ico`, `o-prise-mot`).
  assert.ok(APP.includes("className=\"o-rmbtn\" style={{ ...RM_PRISE_BTN, color: 'var(--o-bad)' }}>{tr('Couper')}</button>") && !APP.includes('o-prise-ico') && !APP.includes('o-prise-mot'),
    '« Couper » en rouge : son mot');
  // Le focus : sur Annuler à l'ouverture ; rendu à la bascule AVANT que les boutons ne partent.
  assert.ok(APP.includes("const annuler = el && el.querySelector('[data-annuler]');") && APP.includes('if (annuler) annuler.focus();'));
  /* ASSERTION MODIFIÉE (passe téléphone, corrections bis 2, point 1) : le focus revient à la bascule VISIBLE — la carte écrit la sienne deux fois
   * (`o-seul-large`, `o-seul-etroit`) et la feuille en cache une, mais pendant la demande il ne reste que la large, cachée sur une carte devenue
   * étroite — et, à défaut, à la SURFACE de la carte (`.o-surface`, le bouton de `Surface`, ui.jsx) : jamais à une bascule cachée, jamais sur la page.
   * Le test « défaire la demande » plus bas joue la VRAIE carte. */
  assert.ok(APP.includes('if (pied && pied.contains(document.activeElement)) {')
    && APP.includes("const bascule = [...el.querySelectorAll('[role=\"switch\"]')].find(n => n.getClientRects().length);")
    && APP.includes("const cible = bascule || el.querySelector('.o-surface');"));
  assert.ok(readFileSync(new URL('../src/ui.jsx', import.meta.url), 'utf8').includes('<button type="button" className="o-surface"'), 'la surface se retrouve à sa classe');
});

test('coupée : « Coupée depuis 20:40 », la plaque grise, ni chiffre ni lavis ; le pied reste', async () => {
  const fx = maison({ pc: 'off' });
  await poser(fx);
  const html = carte(fx, PC);
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : la grille commune ; plus de `data-chiffre`, ni avec ni sans puissance.
  assert.ok(html.startsWith('<div class="o-rmcard o-gabarit" data-prise="" style='), 'la carte au gabarit');
  assert.ok(html.includes('>Coupée depuis 20:40<'));
  assert.ok(html.includes('background:var(--o-s1);color:var(--o-text2)'), 'la plaque grise, lisible');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : ni le chiffre du bas ni celui du haut.
  assert.ok(!html.includes('o-prise-chiffre') && !html.includes('o-gab-chiffre') && !html.includes('linear-gradient(180deg,rgba(var(--o-piece-ambre-rgb),'));
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : « Aujourd’hui » n'a plus de classe ; le pied de la carte large reste.
  assert.ok(html.includes('<span>Aujourd’hui</span>') && html.includes('class="o-prise-courbe"'), 'le jour et sa courbe restent');
  assert.equal(surface(html), 'Prise PC Bureau (Atlas), Coupée depuis 20:40');
});

test('muette : le liseré de panne, la phrase en rouge, la bascule inerte, l’appareil toujours reconnu', async () => {
  const fx = maison({ pc: 'unavailable' });
  await poser(fx, { mesures: journeePc() });
  const html = carte(fx, PC);
  // ASSERTION MODIFIÉE (passe téléphone, tâche 5) : la grille commune, avant le liseré de panne.
  assert.ok(html.startsWith('<div class="o-rmcard o-gabarit o-panne" data-prise=""'));
  assert.ok(html.includes('>Indisponible depuis 14:20<') && html.includes('color:var(--o-bad)'));
  assert.ok(/role="switch" aria-checked="false" aria-disabled="true"[^>]*style="[^"]*cursor:default;opacity:0.4/.test(html), 'la bascule reste, inerte');
  assert.ok(html.includes('background:var(--o-s1);color:var(--o-text3)'), 'la plaque grise éteinte');
  assert.ok(html.includes('<svg') && !html.includes('fi-rr-bolt'), 'le glyphe de l’ordinateur, pas un éclair générique');
  assert.ok(html.includes('fill:var(--o-s2)') && html.includes('stroke:var(--o-text3);stroke-width:1.5'), 'sa journée jusqu’au silence, en gris comme sa plaque');
  assert.ok(!html.includes('stroke:var(--o-piece-ambre)'), 'la couleur de ce qui vit');
});

test('sans mesure (une classe `outlet`, aucun capteur) : ni chiffre ni pied', async () => {
  const fx = maison();
  await poser(fx);
  const html = carte(fx, NUE);
  assert.ok(html.includes('>Allumée depuis 07:05<'));
  assert.ok(!html.includes('o-prise-pied') && !html.includes('o-prise-chiffre'));
  assert.ok(html.includes('rgba(var(--o-accent-soft-rgb),.18)'), 'une prise ordinaire, la teinte de la maison');
});

/* ── La carte étroite (passe téléphone, tâche 5 ; T10, T11, T17) ──────────────
 * Sous 188 px de contenu, la feuille montre l'écriture étroite (`o-seul-etroit`) :
 * sa ligne de commandes est le dernier enfant de la carte. */
const ligneEtroite = (html) => html.slice(html.indexOf('<div class="o-seul-etroit"'));

test('T10 : la ligne de commandes de la carte étroite — la bascule à gauche, les kWh du jour à droite, « Aujourd’hui » dessous ; deux bascules dans le DOM, une par écriture', async () => {
  const fx = maison();
  await poser(fx, { mesures: journeePc() });
  const html = carte(fx, PC);
  const ligne = ligneEtroite(html);
  assert.ok(ligne.startsWith('<div class="o-seul-etroit" style="display:flex;align-items:center;gap:8px;margin-top:auto;padding-top:var(--o-pied-haut, 14px);min-height:calc(var(--o-pied-haut, 14px) + 44px);--o-reserve:54px">'),
    'collée au pied, 44 px sous ses 9 px d’air ; les kWh ont ce que laisse la bascule (46 px et 8 d’écart)');
  assert.ok(/^<div[^>]*><span role="switch" aria-checked="true" tabindex="0" aria-label="Éteindre Prise PC Bureau \(Atlas\)"/.test(ligne), 'la bascule à gauche, nommée comme celle du haut');
  assert.ok(ligne.includes('<span class="o-gab-valeur" data-kwh=""') && ligne.includes('<span class="o-vh">Aujourd’hui </span>0,42\u00A0kWh</span>'),
    'les kWh du jour, le nombre collé à son unité ; le lecteur entend « Aujourd’hui 0,42 kWh »');
  assert.ok(ligne.includes('<div aria-hidden="true" class="o-gab-etiquette"') && ligne.includes('>Aujourd’hui</div>'), '« Aujourd’hui » dessous, caché au lecteur : la valeur l’a déjà dit');
  assert.equal((html.match(/role="switch"/g) || []).length, 2, 'deux bascules dans le DOM…');
  assert.ok(html.includes('<span class="o-seul-large" role="switch"'), '…celle du haut pour la carte large seule');
  assert.ok(html.indexOf('class="o-prise-courbe"') > html.indexOf('class="o-prise-pied o-seul-large"') && html.indexOf('class="o-prise-courbe"') < html.indexOf('<div class="o-seul-etroit"'),
    'la courbe et le pied restent à la carte large (T3)');
  // Muette : la bascule de la ligne reste dessinée, inerte, comme celle du haut.
  const muette = maison({ pc: 'unavailable' });
  await poser(muette, { mesures: journeePc() });
  assert.ok(/^<div[^>]*><span role="switch" aria-checked="false" aria-disabled="true"[^>]*cursor:default;opacity:0.4/.test(ligneEtroite(carte(muette, PC))), 'muette : inerte');
  // Sans mesure (une classe `outlet`, aucun capteur), la bascule seule.
  const nue = ligneEtroite(carte(fx, NUE));
  assert.ok(nue.includes('role="switch"') && !nue.includes('o-gab-valeur'), 'sans mesure : la bascule seule');
});

test('T11 : la prise protégée étroite — une pastille, le cadenas et « Protégée », sans interrupteur ; un appui descend à la surface', async () => {
  const fx = maison();
  await poser(fx);
  const html = carte(fx, NAS);
  const ligne = ligneEtroite(html);
  assert.ok(ligne.startsWith('<div class="o-seul-etroit" data-pastille=""'), 'la ligne d’une prise protégée : les kWh y ont une place à eux (index.css)');
  assert.ok(/^<div[^>]*><span role="img" aria-label="Protégée" title="Protégée" class="o-gab-pastille" style="[^"]*height:26px;padding:0 7px;border-radius:9px;background:var\(--o-s1\);color:var\(--o-text2\)/.test(ligne),
    'la pastille : 26 px de haut, rayon 9, le gris doux ; nommée en permanence, le mot en bulle');
  assert.ok(/<i aria-hidden="true" class="fi fi-rr-lock" style="font-size:12px/.test(ligne) && ligne.includes('<span aria-hidden="true" class="o-gab-pastille-mot"'),
    'le cadenas de 12 px ; le mot caché au lecteur, qui peut s’effacer sans que le nom se perde');
  assert.ok(!ligne.includes('role="switch"'), 'pas d’interrupteur, même coupée : on la rallume dans la fiche');
  assert.equal((html.match(/role="switch"/g) || []).length, 1, 'une seule bascule dans le DOM : celle de la carte large');
  assert.ok(ligne.includes('<span class="o-vh">Aujourd’hui </span>—</span>'), 'à côté, les kWh du jour : « — » sans relevé');
  // Ni bouton ni positionnée : l'appui descend à la surface, qui ouvre la fiche, là où vit la demande en deux appuis.
  const i = APP.indexOf('className="o-gab-pastille"');
  const pastille = APP.slice(APP.lastIndexOf('<span', i), APP.indexOf('</span></span>', i));
  assert.ok(i > 0 && !/onClick|position|tabIndex|role="switch"/.test(pastille), pastille);
});

test('T17 : la forme courte de la carte étroite — « Depuis le … » quand la pastille ou la bascule dit déjà l’état ; à l’heure, une seule phrase', async () => {
  const fx = maison();
  await poser(fx);
  const nas = carte(fx, NAS);
  const date = DIX_JOURS.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  assert.ok(nas.includes('<div class="o-gab-phrase o-seul-large"') && nas.includes('>En marche depuis le ' + date + '<'), 'la carte large garde sa phrase');
  assert.ok(new RegExp('<div class="o-gab-phrase o-seul-etroit" style="[^"]*--o-n:' + ('Depuis le ' + date).length + '">Depuis le ' + date + '<').test(nas), 'la carte étroite, la forme courte, et sa longueur pour sa taille');
  assert.equal(surface(nas), 'Prise NAS (Zephyr), En marche depuis le ' + date + ', 4 W', 'la surface dit la phrase entière');
  // À l'heure, la phrase est la même pour les deux cartes : une seule écriture.
  await poser(fx, { mesures: journeePc() });
  assert.equal((carte(fx, PC).match(/class="o-gab-phrase/g) || []).length, 1, 'une phrase à l’heure ne s’écrit qu’une fois');
});

/* TEST AJOUTÉ (passe téléphone, corrections bis, point 2) : T17, la règle entière. La forme courte ne vaut que si l'état se VOIT déjà — sans
 * protection (la bascule le dit) ou allumée (la plaque teintée, la puissance). Une prise protégée COUPÉE depuis dix jours affichait « Depuis le
 * 5 oct. » et la pastille « Protégée » : nulle part elle ne disait « Coupée », seul le gris de la plaque le laissait deviner. */
test('T17 : la forme courte ne vaut que si l’état se voit — protégée et COUPÉE, « Coupée depuis le … » reste entière ; protégée et allumée, « Depuis le … »', async () => {
  const date = DIX_JOURS.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  // Les phrases d'une carte, chacune avec sa classe : aucune de `o-seul-*` = une seule écriture, pour la carte large comme pour l'étroite.
  const phrases = (html) => [...html.matchAll(/<div class="(o-gab-phrase(?: o-seul-(?:large|etroit))?)"[^>]*>([^<]*)</g)].map(m => [m[1], m[2]]);

  // protégée, coupée, un autre jour : la phrase ENTIÈRE, écrite une fois — la forme courte n'existe pas.
  const coupee = maison({ nas: 'off' });
  await poser(coupee);
  const nasCoupee = carte(coupee, NAS);
  assert.deepEqual(phrases(nasCoupee), [['o-gab-phrase', 'Coupée depuis le ' + date]], 'protégée, coupée, un autre jour : « Coupée depuis le … », en entier, pour les deux cartes');
  assert.ok(!nasCoupee.includes('>Depuis le '), 'jamais « Depuis le … » : la pastille « Protégée » ne dit pas qu’elle est coupée');
  assert.ok(ligneEtroite(nasCoupee).startsWith('<div class="o-seul-etroit" data-pastille=""') && !ligneEtroite(nasCoupee).includes('role="switch"'), 'c’est bien la pastille, sans interrupteur, qui tient la place de la bascule');
  assert.equal(surface(nasCoupee), 'Prise NAS (Zephyr), Coupée depuis le ' + date, 'la surface dit la même phrase');

  // protégée, allumée, un autre jour : la forme courte — la plaque teintée et la puissance disent « allumée ».
  const allumee = maison();
  await poser(allumee);
  assert.deepEqual(phrases(carte(allumee, NAS)), [['o-gab-phrase o-seul-large', 'En marche depuis le ' + date], ['o-gab-phrase o-seul-etroit', 'Depuis le ' + date]],
    'protégée, allumée, un autre jour : la carte large garde sa phrase, la carte étroite la forme courte');

  // Le contraste : sans protection, coupée depuis un autre jour, la bascule dit l'état — la forme courte vaut.
  const libre = maison({ pc: 'off', pcDepuis: DIX_JOURS.toISOString() });
  await poser(libre);
  const pcCoupe = carte(libre, PC);
  assert.deepEqual(phrases(pcCoupe), [['o-gab-phrase o-seul-large', 'Coupée depuis le ' + date], ['o-gab-phrase o-seul-etroit', 'Depuis le ' + date]],
    'sans protection, coupée, un autre jour : « Depuis le … » sur la carte étroite, où la bascule dit déjà « coupée »');
  assert.ok(/role="switch" aria-checked="false"/.test(ligneEtroite(pcCoupe)), 'et la bascule de la ligne étroite est bien là, décochée');
});

/* TEST REMPLACÉ (passe téléphone, corrections bis 2, point 1) : `defaireDemande`, jouée sur la VRAIE carte.
 *
 * Le test d'avant (bis, point 4) posait deux bascules — l'une cachée, l'autre visible — que la carte n'a JAMAIS ensemble pendant une demande : la demande
 * prend la place du pied, la ligne de commandes étroite n'est pas rendue, et il ne reste que la bascule de la carte large. Sur une carte devenue étroite
 * pendant les 6 s, la feuille la cache (`display: none` : aucun rectangle, aucun focus) : le focus visait un nœud caché et retombait sur la page.
 * Ici la carte est montée (tests/crochets.mjs) et la demande ouverte par sa bascule. Le « DOM » que `defaireDemande` interroge est TIRÉ DE L'ARBRE RENDU à
 * chaque question : ce que l'arbre ne porte pas n'y existe pas. Il se conduit comme le navigateur — le focus ne va qu'à ce qui se voit, et retombe sur la
 * page quand le nœud qui l'avait part avec la demande — et refuse toute question que la carte ne lui pose pas aujourd'hui. */
const PAGE = { nom: 'page' };   // `<body>`
const AILLEURS = { nom: 'ailleurs' };   // un autre champ de la page
function domDeLaCarte(m, mise) {
  const noeud = (nom, visible = () => true) => ({ nom, getClientRects: () => (visible() ? [{ width: 46, height: 26 }] : []),
    focus() { if (visible()) globalThis.document.activeElement = this; } });
  // La bascule du haut est celle de la carte large : la feuille la cache quand la carte devient étroite (`mise.etroite`).
  const large = noeud('large', () => !mise.etroite), etroite = noeud('etroite'), annuler = noeud('annuler'), surface = noeud('surface');
  const pied = { nom: 'pied', contains: (n) => n === annuler };
  const porte = (pred) => m.trouver(e => e.props && pred(e)).length > 0;
  const bascules = () => m.trouver(e => e.props && typeof e.props.onToggle === 'function').map(e => (e.props.className === 'o-seul-large' ? large : etroite));
  const inconnu = (s) => { throw new Error('la carte ne connaît pas « ' + s + ' » : ce que defaireDemande lui demande a changé'); };
  const dom = {
    querySelector(s) {
      if (s === '[data-demande]') return porte(e => e.props['data-demande'] !== undefined) ? pied : null;
      if (s === '[data-annuler]') return porte(e => e.props['data-annuler'] !== undefined) ? annuler : null;
      if (s === '.o-surface') return porte(e => e.type === Surface) ? surface : null;
      return inconnu(s);
    },
    querySelectorAll(s) { return s === '[role="switch"]' ? bascules() : inconnu(s); },
    // Le nœud de la carte qui avait le focus est parti avec la demande (Annuler) : le navigateur le rend à la page.
    retombe() {
      const actif = globalThis.document.activeElement;
      const presents = [...bascules(), ...(dom.querySelector('.o-surface') ? [surface] : []), ...(dom.querySelector('[data-annuler]') ? [annuler] : [])];
      if ([large, etroite, annuler, surface].includes(actif) && !presents.includes(actif)) globalThis.document.activeElement = PAGE;
    },
  };
  return dom;
}
/* La carte du NAS montée, prête à demander : sa protection n'est pas encore lue (A3), la prise est gardée, et sa bascule du haut pose la question.
 * `fin()` rend les minuteurs et le `document`. */
async function carteQuiDemande({ onOpen = () => {}, etroite = false } = {}) {
  const fx = maison();
  await poser(fx, { etat: null, attente: true });
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  const m = monter(F.RoomPriseCard, { id: NAS, hass: { states: fx.states, callService: () => Promise.resolve() }, onOpen });
  const mise = { etroite };
  const dom = domDeLaCarte(m, mise);
  m.arbre.ref.current = dom;
  globalThis.document.activeElement = PAGE;
  return { m, h, mise, dom, actif: () => globalThis.document.activeElement,
    bascule: (qui) => m.trouver(e => e.props && typeof e.props.onToggle === 'function' && (e.props.className === 'o-seul-large') === (qui === 'large'))[0],
    annuler: () => m.trouver(e => e.props && e.props['data-annuler'] !== undefined)[0],
    fin: () => { m.demonter(); h.restaurer(); d.restaurer(); } };
}

test('défaire la demande, sur la vraie carte — pendant la demande seule la bascule du haut existe ; cachée (la carte devient étroite), le focus va à la SURFACE, jamais sur la page', async () => {
  const noms = (l) => l.map(n => n.nom);
  for (const [devenue, geste] of [[false, '6 s'], [false, 'Annuler'], [true, '6 s'], [true, 'Annuler']]) {
    const quand = (devenue ? 'carte devenue étroite pendant la demande' : 'carte large') + ', ' + geste + ' : ';
    const c = await carteQuiDemande();
    try {
      assert.deepEqual(noms(c.dom.querySelectorAll('[role="switch"]')), ['large', 'etroite'], quand + 'avant la demande, la carte écrit deux bascules : celle du haut, celle de la ligne de commandes');
      c.m.appuyer(c.bascule('large'), 'onToggle');
      assert.ok(c.dom.querySelector('[data-demande]'), quand + 'la question est posée');
      assert.equal(c.actif().nom, 'annuler', quand + 'Annuler prend le focus');
      // PENDANT la demande : la ligne de commandes étroite n'est pas rendue — la bascule du haut est seule, et la surface de la carte est là.
      assert.deepEqual(noms(c.dom.querySelectorAll('[role="switch"]')), ['large'], quand + 'pendant la demande : une seule bascule, celle du haut');
      assert.equal(c.dom.querySelector('.o-surface').nom, 'surface', quand + 'et la surface de la carte');
      c.mise.etroite = devenue;   // la carte devient étroite avant la fin des 6 s : la feuille cache la bascule du haut (aucun rectangle)
      if (geste === 'Annuler') c.m.appuyer(c.annuler()); else { c.h.avancer(6000); c.m.effets(); }
      c.dom.retombe();
      assert.equal(c.dom.querySelector('[data-demande]'), null, quand + 'la demande est défaite');
      assert.equal(c.actif().nom, devenue ? 'surface' : 'large', quand + 'le focus reste dans la carte : ' + (devenue ? 'à sa surface, la bascule du haut étant cachée' : 'à la bascule du haut'));
    } finally { c.fin(); }
  }
  // Le focus n'était plus dans la demande (la souris a cliqué ailleurs) : il ne bouge pas quand la demande se défait.
  const ailleurs = await carteQuiDemande();
  try {
    ailleurs.m.appuyer(ailleurs.bascule('large'), 'onToggle');
    globalThis.document.activeElement = AILLEURS;
    ailleurs.h.avancer(6000); ailleurs.m.effets(); ailleurs.dom.retombe();
    assert.equal(ailleurs.dom.querySelector('[data-demande]'), null, 'ailleurs : la demande est défaite');
    assert.equal(ailleurs.actif(), AILLEURS, 'le focus ailleurs reste ailleurs');
  } finally { ailleurs.fin(); }
  // Une carte qu'on n'ouvre pas (`onOpen` absent) n'a pas de surface. Étroite, elle demande sur place par la bascule de sa ligne de commandes — et la perd avec la
  // ligne : plus rien à qui rendre le focus. Rien ne casse, et la demande se défait.
  const nue = await carteQuiDemande({ onOpen: null, etroite: true });
  try {
    nue.m.appuyer(nue.bascule('etroite'), 'onToggle');
    assert.ok(nue.dom.querySelector('[data-demande]') && nue.dom.querySelector('.o-surface') === null, 'sans onOpen : la question sur place, et pas de surface');
    nue.m.appuyer(nue.annuler());
    nue.dom.retombe();
    assert.equal(nue.dom.querySelector('[data-demande]'), null, 'sans surface non plus : la demande se défait, sans erreur');
  } finally { nue.fin(); }
});

test('la fabrique : la carte d’une PRISE ; la carte générique ne connaît plus les prises', () => {
  assert.ok(APP.includes("              : (d === 'switch' && priseDe(S, k).prise) ? <RoomPriseCard id={id} hass={hass} onOpen={ouvrir} titre={label} />\n              : ROOM_GENERIQUES.indexOf(d) >= 0 ? <RoomGenericCard"));
  const debut = APP.indexOf('function RoomGenericCard(');
  const generique = APP.slice(debut, APP.indexOf('\n}\n', debut));
  for (const mot of ['priseDe', 'carteDePrise', 'priseVive', 'TYPES_PRISE', 'fmtW', 'o-prise-']) assert.ok(!generique.includes(mot), 'la carte générique lit encore ' + mot);
  const html = renderToStaticMarkup(createElement(F.RoomGenericCard, { id: 'switch.radiateur_salon', hass: { states: maison().states, callService: () => {} }, onOpen: () => {} }));
  assert.ok(html.includes('>Allumée<'), 'un switch qui ne mesure pas : « Allumée », comme avant');
});

const compacte = (fx, id) => renderToStaticMarkup(createElement(F.CvCard, { id, hass: { states: fx.states, callService: () => Promise.resolve() }, onOpen: () => {}, dense: true }));

test('la compacte (§ 3.3) : sa disposition, la phrase, la puissance, le glyphe et la teinte de l’appareil', async () => {
  const fx = maison();
  await poser(fx);
  const html = compacte(fx, PC);
  assert.ok(html.startsWith('<div class="o-piece o-cvdense o-cvcarte"'), 'la compacte de la maison, telle quelle');
  assert.equal(surface(html), 'Prise PC Bureau (Atlas), En marche depuis 08:50', 'la surface : le nom et la phrase, comme toute compacte (lot 13)');
  assert.ok(html.includes('>En marche depuis 08:50<') && html.includes('color:var(--o-text2)'), 'la phrase du § 4 en sous-titre');
  assert.ok(/<span class="o-cvpuissance" style="[^"]*">146 W<\/span><span role="switch" aria-checked="true"/.test(html), 'la puissance, juste avant la bascule, lue après la surface');
  assert.ok(html.includes('class="o-cvpastille" style="background:rgba(var(--o-piece-ambre-rgb),.16);color:var(--o-piece-ambre)"'), 'la pastille ambre du PC');
  assert.ok(html.includes('linear-gradient(180deg,rgba(var(--o-piece-ambre-rgb),'), 'le lavis de son appareil');
  assert.ok(APP.includes("const vp = useVuePrise(hass, id, label, dom === 'switch' && !cvEstLumiere(id) && priseDe(hass && hass.states, id).prise, { jour: false });"),
    'la compacte ne lit pas la journée : ni courbe ni kWh à dessiner');
});

test('la compacte : coupée, la plaque grise et pas de puissance ; muette, la phrase en rouge et pas de bascule', async () => {
  const coupee = maison({ pc: 'off' });
  await poser(coupee);
  const c = compacte(coupee, PC);
  assert.ok(c.includes('>Coupée depuis 20:40<') && c.includes('class="o-cvpastille" style="background:var(--o-s1);color:var(--o-text3)"'));
  assert.ok(!c.includes('o-cvpuissance') && c.includes('role="switch" aria-checked="false"'));
  const muette = maison({ pc: 'unavailable' });
  await poser(muette);
  const m = compacte(muette, PC);
  assert.ok(m.includes('>Indisponible depuis 14:20<') && m.includes('color:var(--o-bad)'));
  assert.ok(!m.includes('role="switch"') && !m.includes('o-cvpuissance'), 'muette : ni bascule ni puissance, comme toute compacte en panne');
});

test('la compacte : protégée et allumée, la bascule ouvre la fiche (P5) ; ailleurs, le geste d’abord', async () => {
  const fx = maison();
  await poser(fx);
  assert.ok(compacte(fx, NAS).includes('role="switch" aria-checked="true"'), 'la bascule est là');
  // Allumée et gardée : la fiche, si elle existe ; sinon la compacte demande sur place, deux appuis (A4, tests/prises_gestes.test.mjs).
  assert.ok(APP.includes("    const geste = appuiBascule({ on: vp.on, garde: vp.garde, ouvrable: !!onOpen, enDemande });\n    if (geste === 'fiche') onOpen(id);\n    else if (geste === 'demander') setDemande(true);\n    else { setDemande(false); vp.commander(!vp.on); }"));
  assert.ok(APP.includes("onClick={(e) => { e.stopPropagation(); basculerCompacte(); }}"), 'au doigt');
  assert.ok(APP.includes("if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculerCompacte(); }"), 'au clavier');
  // Un switch qui ne mesure pas garde la compacte d'avant.
  const autre = compacte(fx, 'switch.radiateur_salon');
  assert.ok(autre.includes('>Allumé<') && !autre.includes('o-cvpuissance'));
});
