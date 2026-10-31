/* La fiche d'une lumière (chantier Lumières, § 3.5 à 3.8, § 3.10 ; L7 à L10).
 *
 * On la JOUE (tests/crochets.mjs) telle que la coquille d'App.jsx la monte : la
 * vue de sa carte (`useVueLumiere`), la bascule et la barre de la maison. Sous
 * `?fiche_lumiere`, App.jsx les exporte — le fichier n'est pas touché. Ce qui
 * est garanti :
 *  - le panneau du haut : le grand pourcentage, ou le mot ; la phrase longue ; la
 *    barre de 1 à 100 %, le repère gris éteinte au dernier niveau du carnet ;
 *  - Couleur : les puces Blancs / Couleurs ouvertes sur le mode du moment, les
 *    curseurs et les blancs et couleurs nommés ; choisir allume la lampe, par
 *    `color_temp_kelvin` ou `hs_color` [teinte, 100] ;
 *  - le minuteur des prises, tel quel ; L'appareil ;
 *  - muette : rien n'y commande plus. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { monter, horlogeFausse, documentFaux, texteDe } from './crochets.mjs';
import { teinteDe } from './jetons_loggia.mjs';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?fiche_lumiere')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?fiche_lumiere'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { useVueLumiere, RmBascule, RmJauge };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?fiche_lumiere', import.meta.url).href);
const C = (await import(new URL('../src/fichelumiere.jsx', import.meta.url).href)).default;
// Le curseur peint de la fiche, joué seul (B11) : il n'est pas exporté, on le retrouve dans l'arbre d'une fiche montée.
const C_CURSEUR = (() => { const w = { states: {} }; return null; })();
const L = await import('../src/lumieresetat.js');
const P = await import('../src/prisesetat.js');
const LU = await import('../src/lumieres.js');
const { lireCouleur } = await import('../src/contraste.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = MONOLITHE;

const NBSP = '\u00a0';
const FINE = '\u202f';   // le séparateur des milliers en français (Intl)
const aujourdhui = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };
const iso = (h, m) => new Date(aujourdhui(h, m)).toISOString();
// L'heure d'un instant telle que l'écran l'écrit : un minuteur se pose APRÈS maintenant, quelle que soit l'heure du test.
const hm = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const lampe = (id, state, attributes, depuis) => ({ entity_id: id, state, last_changed: depuis, last_updated: depuis, attributes });
function maison() {
  return {
    'light.ampoule_chambre': lampe('light.ampoule_chambre', 'on', { friendly_name: 'Ampoule Chambre', supported_color_modes: ['color_temp'], color_mode: 'color_temp', color_temp_kelvin: 2700,
      min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500, brightness: 115 }, iso(20, 10)),
    'light.chambre': lampe('light.chambre', 'off', { friendly_name: 'Plafonnier Chambre', supported_color_modes: ['brightness'] }, iso(7, 50)),
    'light.veilleuse': lampe('light.veilleuse', 'on', { friendly_name: 'Veilleuse Chambre Lino', supported_color_modes: ['color_temp', 'xy'], color_mode: 'xy', hs_color: [275, 100],
      rgb_color: [149, 0, 255], min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6535, brightness: 38 }, iso(20, 30)),
    'switch.applique': lampe('switch.applique', 'on', { friendly_name: 'Applique Extérieur' }, iso(20, 24)),
    'light.morte': lampe('light.morte', 'unavailable', { friendly_name: 'Lampe morte', supported_color_modes: ['color_temp', 'hs'] }, iso(14, 20)),
    // Éteinte, des blancs et des couleurs, et le carnet n'a rien noté d'elle : aucun dernier niveau connu.
    'light.eteinte': lampe('light.eteinte', 'off', { friendly_name: 'Lampe éteinte', supported_color_modes: ['color_temp', 'xy'], min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6535 }, iso(7, 50)),
  };
}

/* La maison doublée : un `hass` neuf à chaque lecture ; le carnet et les minuteurs posés ; les services et les commandes, notés. */
function poser({ minuteurs = {}, ws = null } = {}) {
  setLoggiaState({ index: null, ent: { switchLights: ['switch.applique'] }, cfg: {}, resolved: null });
  L.reglerLumieresEtat({ hass: { callWS: () => new Promise(() => {}) }, horloge: { repeter: () => 0, arreter() {}, plusTard: () => 0, annuler() {}, maintenant: () => Date.now() } });
  L.poserEtatLumieres({ lumieres: { 'light.chambre': { dernier: { bri: 80, mode: 'brightness', kelvin: null, hs: null } } } });
  P.poserMinuteurs({ minuteurs, maintenant: Date.now() / 1000 });
  const appels = [], commandes = [];
  const etats = maison();
  const hass = { states: etats,
    callService: (d, s, data, cible) => { appels.push([d + '.' + s, (cible && cible.entity_id) || (data && data.entity_id), ...Object.entries(data || {}).filter(([k]) => k !== 'entity_id').map(([k, v]) => k + '=' + v)].join(' ')); return Promise.resolve(); },
    callWS: (msg) => { commandes.push(msg); return ws ? ws(msg) : new Promise(() => {}); } };
  return { appels, commandes, hass };
}
// La fiche telle que la coquille la monte : la vue de la carte, la bascule et la barre de la maison.
const Fiche = ({ hass, id, piece = 'Chambre', onFiche = () => {} }) => C({ id, vue: F.useVueLumiere(hass, id), piece, bascule: F.RmBascule, jauge: F.RmJauge, onFiche, glyphe: null, epingle: null });
async function dans(fn, { clair = false } = {}) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  globalThis.document.documentElement = { classList: { contains: (c) => clair && c === 'loggia-light' } };
  try { return await fn({ h, d }); } finally { h.restaurer(); d.restaurer(); }
}
const element = (m, nom) => m.trouver(e => e.type && e.type.name === nom);
const bouton = (m, texte) => m.trouver(e => e.type === 'button' && (texteDe(e) === texte || e.props['aria-label'] === texte))[0];

test('§ 3.6 : allumée en blanc — « 45 % », la phrase longue et sa couleur, la barre de 1 à 100 %, la bascule', () => dans(() => {
  const fin = Math.floor(Date.now() / 1000) + 3600;
  const w = poser({ minuteurs: { 'light.ampoule_chambre': { fin, duree: 60 } } });
  const m = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  const t = m.texte();
  assert.ok(t.includes('45%'), 'le grand chiffre, et « % » à part');
  assert.ok(t.includes('S’éteint à ' + hm(fin * 1000) + ' · blanc doux'), 'la phrase de la carte, puis le nom de sa couleur');
  assert.ok(t.includes('1' + NBSP + '%') && t.includes('100' + NBSP + '%'), 'les bornes de la barre');
  const [entete] = element(m, 'EnteteFiche');
  assert.equal(entete.props.sousNom, 'Chambre · blanc réglable');
  assert.deepEqual([entete.props.plaque.fond, entete.props.nom], ['rgba(255,169,87,.22)', 'Ampoule Chambre'], 'la plaque dans le blanc de l’ampoule');
  const [jauge] = element(m, 'RmJauge');
  assert.deepEqual([jauge.props.v, jauge.props.min, jauge.props.eteinte, jauge.props.zone, jauge.props.piste], [45, 1, false, 52, 32]);
  jauge.props.onCommit(60);
  const [bascule] = element(m, 'RmBascule');
  bascule.props.onToggle();
  assert.deepEqual(w.appels, ['light.turn_on light.ampoule_chambre brightness_pct=60', 'light.turn_off light.ampoule_chambre'], 'la barre règle, la bascule éteint — jamais `toggle`');
}));

test('§ 3.6 : éteinte — « Éteinte », « Depuis 07:50 · se rallumera à 80 % », le repère gris ; glisser l’allume', () => dans(() => {
  const w = poser();
  const m = monter(Fiche, { hass: w.hass, id: 'light.chambre' });
  const t = m.texte();
  assert.ok(t.includes('Éteinte') && t.includes('Depuis 07:50 · se rallumera à 80' + NBSP + '%'));
  assert.ok(!t.includes('Couleur'), 'un variateur n’a pas de palette');
  const [jauge] = element(m, 'RmJauge');
  assert.deepEqual([jauge.props.v, jauge.props.eteinte], [80, true], 'le repère gris au dernier niveau du carnet');
  jauge.props.onCommit(30);
  assert.deepEqual(w.appels, ['light.turn_on light.chambre brightness_pct=30'], 'L7 : glisser sur une lampe éteinte l’allume à ce niveau');
  m.rendre();
  assert.ok(m.texte().startsWith('30%'), 'le geste se voit tout de suite : allumée, à 30 %');
}));

test('§ 3.7 : les blancs — l’étiquette du moment, le curseur entre les bornes de l’ampoule, les quatre blancs ; choisir allume', () => dans(() => {
  const w = poser();
  const m = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  assert.ok(m.texte().includes('Douce · 2' + FINE + '700' + NBSP + 'K'), 'le réglage du moment, à droite du titre ; le nombre et son unité ne se séparent pas');
  assert.equal(m.trouver(e => e.type === 'button' && e.props['aria-pressed'] !== undefined && /Blancs|Couleurs/.test(texteDe(e))).length, 0, 'des blancs seulement : pas de puces');
  const [curseur] = element(m, 'CurseurPeint');
  assert.deepEqual([curseur.props.label, curseur.props.min, curseur.props.max, curseur.props.valeur], ['Température du blanc', 2200, 6500, 2700]);
  const blancs = ['Chaude', 'Douce', 'Neutre', 'Froide'].map(n => bouton(m, n));
  assert.deepEqual(blancs.map(b => b.props['aria-pressed']), [false, true, false, false], 'le blanc du moment est cerclé');
  assert.ok(blancs.every(b => /^#[0-9a-f]{6}$/.test(b.props.style.color)), 'l’encre de chaque blanc est calculée, jamais écrite en dur');
  assert.ok(blancs.every(b => b.props.className === 'o-lumiere-blanc'), 'au téléphone, le mot se resserre (index.css)');
  assert.ok(lire('src/index.css').includes('@container (width < 300px) {\n  .o-lumiere-blancs-grille { gap: 4px !important; }\n  .o-lumiere-blanc { font-size: 11px !important; font-weight: 700 !important; padding: 0 !important; }\n}'),
    'une rangée à toute largeur : « Neutralna » tient à 320 px');
  m.appuyer(bouton(m, 'Froide'));
  curseur.props.onCommit(3500);
  assert.deepEqual(w.appels, ['light.turn_on light.ampoule_chambre color_temp_kelvin=6500', 'light.turn_on light.ampoule_chambre color_temp_kelvin=3500']);
}));

test('§ 3.7 : blancs ET couleurs — les puces ouvrent sur le mode du moment ; la couleur choisie part en `hs_color` [teinte, 100] et allume', () => dans(() => {
  const w = poser();
  const m = monter(Fiche, { hass: w.hass, id: 'light.veilleuse' });
  assert.ok(m.texte().includes('Allumée depuis 20:30 · violet') && m.texte().includes('Violet'), 'la phrase et l’étiquette disent la couleur');
  assert.deepEqual(['Blancs', 'Couleurs'].map(n => bouton(m, n).props['aria-pressed']), [false, true], 'ouvertes sur les couleurs');
  const [blancs, couleurs] = m.trouver(e => e.props && e.props.style && e.props.style.gridArea === '1 / 1');
  assert.deepEqual([blancs.props['aria-hidden'], couleurs.props['aria-hidden']], [true, false], 'les deux palettes dans la même case, une seule visible');
  const violet = bouton(m, 'Violet');
  assert.equal(violet.props['aria-pressed'], true);
  m.appuyer(bouton(m, 'Bleu'));
  const teinte = element(m, 'CurseurPeint').find(c => c.props.label === 'Teinte');
  assert.equal(teinte.props.valeur, 275);
  teinte.props.onCommit(200);
  assert.deepEqual(w.appels, ['light.turn_on light.veilleuse hs_color=215,100', 'light.turn_on light.veilleuse hs_color=200,100']);
  m.appuyer(bouton(m, 'Blancs'));
  assert.deepEqual(['Blancs', 'Couleurs'].map(n => bouton(m, n).props['aria-pressed']), [true, false], 'les puces choisissent le mode montré');
}));

test('§ 3.8 : le minuteur des prises — éteinte, inerte ; allumée, quatre durées ; qui tourne, + 15 min, + 1 h, Annuler ; une demande à la fois', () => dans(async () => {
  let repondre = null;
  const w = poser({ ws: () => new Promise((ok) => { repondre = ok; }) });
  const eteinte = monter(Fiche, { hass: w.hass, id: 'light.chambre' });
  assert.ok(eteinte.texte().includes('Disponible une fois la lumière allumée.'));
  assert.ok(['15 min', '30 min', '1 h', '2 h'].every(d => bouton(eteinte, d)), 'les quatre durées');
  const allumee = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  assert.ok(allumee.texte().includes('Éteint la lumière au bout du temps choisi.'));
  const trente = allumee.trouver(e => e.type === 'button' && texteDe(e) === '30 min')[0];
  allumee.appuyer(trente);
  allumee.appuyer(allumee.trouver(e => e.type === 'button' && texteDe(e) === '30 min')[0]);
  // ASSERTION MODIFIÉE (chantier Lumières, tâche 9) : la fiche lit aussi son journal ; seuls les appels du minuteur comptent ici.
  assert.deepEqual(w.commandes.filter(c => c.type.startsWith('loggia/minuteurs/')), [{ type: 'loggia/minuteurs/poser', entity_id: 'light.ampoule_chambre', minutes: 30 }],
    'le serveur AJOUTE : un seul appel en vol');
  const fin = Math.floor(Date.now() / 1000) + 1800;
  repondre({ minuteurs: { 'light.ampoule_chambre': { fin, duree: 30 } } });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  allumee.rendre();
  assert.ok(allumee.texte().includes('S’éteint à ' + hm(fin * 1000) + ' · dans') && allumee.texte().includes('Annuler'), 'le minuteur qui tourne');
  assert.equal(eteinte.trouver(e => e.type === 'button' && e.props['aria-disabled'] === true).length, 4, 'éteinte, les puces restent inertes');
}));

test('audit du 19/10 : un minuteur échu, pas encore relu, ne dit pas « dans 0 min » ; un refus du serveur se dit en clair', () => dans(async () => {
  const echu = Math.floor(Date.now() / 1000) - 5;
  const w = poser({ minuteurs: { 'light.ampoule_chambre': { fin: echu, duree: 30 } }, ws: () => Promise.reject({ code: 'minuteur_deja_eteint', message: 'appareil deja eteint : light.ampoule_chambre' }) });
  const m = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  assert.ok(!m.texte().includes('dans 0') && !m.texte().includes('S’éteint à'), 'échu : plus de minuteur qui tourne');
  assert.ok(m.texte().includes('Éteint la lumière au bout du temps choisi.') && !m.texte().includes('Annuler'), 'les durées reviennent');
  m.appuyer(m.trouver(e => e.type === 'button' && texteDe(e) === '30 min')[0]);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  m.rendre();
  assert.ok(m.texte().includes('L’appareil est déjà éteint.'), 'le refus nommé du serveur, traduit (refus.js)');
}));

test('L11 : un switch-lumière — « Allumée », tout ou rien, ni barre ni palette ; L’appareil ouvre la fiche universelle', () => dans(() => {
  const w = poser();
  let ouverte = null;
  const m = monter(Fiche, { hass: w.hass, id: 'switch.applique', piece: 'Entrée', onFiche: (id) => { ouverte = id; } });
  assert.ok(m.texte().includes('Allumée') && !m.texte().includes('Couleur'));
  assert.equal(element(m, 'RmJauge').length, 0);
  assert.equal(element(m, 'EnteteFiche')[0].props.sousNom, 'Entrée · tout ou rien');
  element(m, 'RmBascule')[0].props.onToggle();
  assert.deepEqual(w.appels, ['switch.turn_off switch.applique'], 'par `homeassistant`, que le moteur d’actions envoie au switch');
  m.appuyer(m.trouver(e => e.type === 'button' && texteDe(e).startsWith('L’appareil'))[0]);
  assert.equal(ouverte, 'switch.applique');
}));

test('muette : « Indisponible », le liseré sur le panneau de l’appareil ; ni bascule, ni barre, ni palette, ni minuteur', () => dans(() => {
  const w = poser();
  const m = monter(Fiche, { hass: w.hass, id: 'light.morte' });
  const t = m.texte();
  assert.ok(t.includes('Indisponible') && t.includes('Indisponible depuis 14:20'));
  assert.equal(m.trouver(e => e.props && e.props.className === 'o-panne').length, 1, 'un liseré');
  assert.equal(element(m, 'RmBascule').length, 0);
  /* ASSERTION MODIFIÉE (chantier Lumières, 9 bis B, point 15) : le test exigeait au contraire une barre DESSINÉE (`actif: false`, « un
   * dessin ») — avec ses « 1 % » et « 100 % ». Or la règle du lot 16 de l'audit, que la fiche redit dans son code, est qu'une lampe
   * muette ne commande plus rien : ni bascule, ni barre, ni palette, ni minuteur. La barre n'est plus dessinée du tout. */
  assert.equal(element(m, 'RmJauge').length, 0, 'muette : pas de barre, même inerte');
  assert.ok(!t.includes('1' + NBSP + '%') && !t.includes('100' + NBSP + '%'), 'ni ses bornes, « 1 % » et « 100 % »');
  assert.ok(!t.includes('Couleur') && !t.includes('Minuteur'));
}));

test('L8 : la coquille — une feuille sans onglets, la vue de la carte ; toute lumière ouvre SA fiche, tout ou rien et switch-lumière compris', () => {
  const i = APP.indexOf('\nfunction FicheLumiere(');
  const coquille = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.ok(coquille.includes('function FicheLumiere({ id, hass, onClose }) {') && coquille.includes('const vue = useVueLumiere(hass, id);'));
  assert.ok(coquille.includes('<BottomSheet onClose={onClose}>') && coquille.includes('<FicheLumiereContent id={id} vue={vue} piece={zoneDe(id)} onFiche={setFiche} bascule={RmBascule} jauge={RmJauge}'));
  assert.ok(APP.includes("if (d === 'light' || (d === 'switch' && cvEstLumiere(id))) setLightPop(id);"), 'plus de détour par la fiche de l’appareil pour une lampe sans variateur');
  assert.ok(APP.includes('{lightPop && <FicheLumiere id={lightPop} hass={hass} onClose={() => setLightPop(null)} />}'));
  assert.ok(!APP.includes('BRIQUES_LUMIERE'), 'la feuille d’avant et ses briques sont parties');
});

test('§ 11 : le compte ordinaire — le minuteur refusé le dit sous sa rangée, et les puces reprennent la main', () => dans(async () => {
  const w = poser({ ws: (msg) => (msg.type === 'loggia/minuteurs/poser' ? Promise.reject({ code: 'unauthorized' }) : new Promise(() => {})) });
  const m = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  m.appuyer(m.trouver(e => e.type === 'button' && texteDe(e) === '30 min')[0]);
  for (let i = 0; i < 6; i++) await Promise.resolve();
  m.rendre();
  assert.ok(m.texte().includes('Ce compte ne pilote pas cet appareil.'), 'le refus, en clair');
  assert.equal(m.trouver(e => e.props && e.props.role === 'alert').length, 1, 'sous la rangée du minuteur');
  assert.equal(m.trouver(e => e.type === 'button' && e.props['aria-disabled'] === true).length, 0, 'les puces reprennent la main');
}));

/* ── Passe de finition 9 bis A ─────────────────────────────────────────────────── */

const html = (el) => renderToStaticMarkup(createElement(el.type, el.props));
const attribut = (h, a) => (h.match(new RegExp(a + '="([^"]*)"')) || [])[1];
const curseur = (m, label) => element(m, 'CurseurPeint').find(c => c.props.label === label);

test('points 4 et 16 : les trois curseurs de la fiche portent `aria-valuenow` — la barre, le blanc, la teinte — et disent « Éteinte » d’une lampe éteinte', () => dans(() => {
  const w = poser();
  // Éteinte, avec un dernier niveau au carnet (80 %) : la barre le dit, éteinte.
  const connue = monter(Fiche, { hass: w.hass, id: 'light.chambre' });
  const barre = html(element(connue, 'RmJauge')[0]);
  assert.deepEqual([attribut(barre, 'aria-valuenow'), attribut(barre, 'aria-valuetext')], ['80', 'Éteinte · 80 %']);
  // Éteinte, sans niveau connu : le minimum, et « Éteinte » — les trois curseurs.
  const inconnue = monter(Fiche, { hass: w.hass, id: 'light.eteinte' });
  const sans = html(element(inconnue, 'RmJauge')[0]);
  assert.deepEqual([attribut(sans, 'aria-valuenow'), attribut(sans, 'aria-valuetext')], ['1', 'Éteinte'], 'la barre');
  const blanc = html(curseur(inconnue, 'Température du blanc'));
  assert.deepEqual([attribut(blanc, 'aria-valuemin'), attribut(blanc, 'aria-valuenow'), attribut(blanc, 'aria-valuetext')], ['2000', '2000', 'Éteinte'], 'le blanc : le minimum de l’ampoule');
  const teinte = html(curseur(inconnue, 'Teinte'));
  assert.deepEqual([attribut(teinte, 'aria-valuenow'), attribut(teinte, 'aria-valuetext')], ['0', 'Éteinte'], 'la teinte');
}));

test('points 4 et 16 : allumée dans l’AUTRE mode, le curseur du mode inactif porte quand même sa valeur — le minimum — ; celui du mode actif, la sienne', () => dans(() => {
  const w = poser();
  const veilleuse = monter(Fiche, { hass: w.hass, id: 'light.veilleuse' });   // en couleur (275°), des blancs de 2 000 à 6 535 K
  const blanc = html(curseur(veilleuse, 'Température du blanc'));
  assert.equal(attribut(blanc, 'aria-valuenow'), '2000', 'le blanc, que la lampe ne règle pas : le minimum, jamais un curseur sans valeur');
  assert.equal(attribut(blanc, 'aria-valuetext'), undefined, 'allumée : rien d’une lampe éteinte');
  const teinte = html(curseur(veilleuse, 'Teinte'));
  assert.deepEqual([attribut(teinte, 'aria-valuenow'), attribut(teinte, 'aria-valuetext')], ['275', '275 °']);
  const reglee = html(curseur(monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' }), 'Température du blanc'));   // en blanc doux, 2 700 K
  assert.equal(attribut(reglee, 'aria-valuenow'), '2700');
  assert.match(attribut(reglee, 'aria-valuetext'), /^2\D700 K$/, 'sa valeur, avec son unité');
}));

test('point 9 : la plaque de la fiche porte l’ampoule, quel que soit le nom de la lampe — la coquille la passe, l’icône choisie devant', () => {
  const i = APP.indexOf('\nfunction FicheLumiere(');
  const coquille = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.ok(coquille.includes('glyphe={<GlypheCarte id={id} size={18}><Fi i="bulb" size={18} /></GlypheCarte>}'), 'la glyphe de la plaque : l’ampoule, sous l’icône choisie');
  assert.ok(!coquille.includes('LightIcon') && !coquille.includes('vue.type'), 'plus de dessin par type de luminaire');
  // Sans glyphe passé (ce test, ou une coquille qui l’oublierait), la plaque retombe sur la même ampoule.
  return dans(() => {
    const w = poser();
    for (const id of ['light.veilleuse', 'light.chambre', 'switch.applique']) {
      const [entete] = element(monter(Fiche, { hass: w.hass, id }), 'EnteteFiche');
      assert.equal(entete.props.plaque.icone, 'bulb', id + ' : l’ampoule par défaut de la plaque');
    }
  });
});

test('point 1 : la fiche d’une ampoule « Froide » en thème clair — une encre brune sur la plaque, la barre peinte depuis elle ; la plaque prend le blanc de 4 000 K, qui se voit', () => dans(() => {
  const w = poser();
  w.hass.states['light.ampoule_chambre'] = lampe('light.ampoule_chambre', 'on', { friendly_name: 'Ampoule Chambre', supported_color_modes: ['color_temp'], color_mode: 'color_temp', color_temp_kelvin: 6500,
    min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500, brightness: 255 }, iso(20, 10));
  const m = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  const [entete] = element(m, 'EnteteFiche');
  const { encre, fond } = entete.props.plaque;
  const h = teinteDe(lireCouleur(encre));
  assert.ok(h >= 20 && h <= 45, 'l’encre ' + encre + ' est à ' + h + '° : un brun orangé, pas le magenta (#d2008c) d’avant');
  /* ASSERTION MODIFIÉE (chantier Lumières, 11 bis, R7) : la plaque gardait le blanc froid vrai (255,249,253), qui ne se voyait pas sur un fond clair. En thème clair
   * elle prend le blanc de l’encre, plafonné à 4 000 K (255,209,163) — comme la carte. */
  assert.equal(fond, 'rgba(255,209,163,.22)', 'la plaque prend le blanc de 4 000 K : elle se voit');
  const [jauge] = element(m, 'RmJauge');
  assert.equal(jauge.props.couleur, encre, 'le repère a la même encre');
  assert.equal(jauge.props.grade, LU.couleursLumiere(lireCouleur(encre).slice(0, 3)).degrade, 'en thème clair, la barre se peint depuis l’encre gardée — la teinte vraie, presque blanche, ne se verrait pas');
}, { clair: true }));

/* ── Passe de finition 9 bis B ─────────────────────────────────────────────────── */

test('point 15 : choisir un blanc ou une couleur sur une lampe ÉTEINTE l’allume — « Allumée » tout de suite (le geste d’abord), puis l’ordre part', () => dans(() => {
  // Le test « les blancs… choisir allume » plus haut ne joue que des lampes déjà allumées : il ne prouve pas l'allumage.
  const w = poser();
  const m = monter(Fiche, { hass: w.hass, id: 'light.eteinte' });
  assert.ok(m.texte().startsWith('Éteinte') && !m.texte().includes('Allumée'), 'éteinte au départ : le mot « Éteinte » en grand');
  m.appuyer(bouton(m, 'Froide'));
  assert.deepEqual(w.appels, ['light.turn_on light.eteinte color_temp_kelvin=6500'], 'l’ordre d’un blanc allume la lampe');
  assert.match(m.texte(), /Allumée depuis \d\d:\d\d/, 'le geste d’abord : « Allumée », avant que la lampe ne réponde');
  assert.ok(!m.texte().startsWith('Éteinte'), 'plus « Éteinte »');
  // Une couleur de même : la palette des couleurs est dans l'arbre, ouverte ou non.
  const c = monter(Fiche, { hass: w.hass, id: 'light.eteinte' });
  c.appuyer(bouton(c, 'Bleu'));
  assert.deepEqual(w.appels.slice(1), ['light.turn_on light.eteinte hs_color=215,100'], 'une couleur allume aussi : `hs_color` [teinte, 100]');
  assert.match(c.texte(), /Allumée depuis \d\d:\d\d/);
  // Le curseur au relâcher : allumée, de même.
  const k = monter(Fiche, { hass: w.hass, id: 'light.eteinte' });
  element(k, 'CurseurPeint').find(x => x.props.label === 'Température du blanc').props.onCommit(3500);
  k.rendre();
  assert.match(k.texte(), /Allumée depuis \d\d:\d\d/);
  assert.deepEqual(w.appels.slice(2), ['light.turn_on light.eteinte color_temp_kelvin=3500']);
}));

test('point 15 : une lampe muette ne dessine plus sa barre — le code le dit (`v.variable && !v.muette`), et une lampe vivante garde la sienne', () => dans(() => {
  const FICHE = lire('src/fichelumiere.jsx');
  assert.ok(FICHE.includes('{v.variable && !v.muette && Jauge && ('), 'la condition de la barre');
  const w = poser();
  assert.equal(element(monter(Fiche, { hass: w.hass, id: 'light.morte' }), 'RmJauge').length, 0, 'muette : pas de barre');
  assert.equal(element(monter(Fiche, { hass: w.hass, id: 'light.chambre' }), 'RmJauge').length, 1, 'éteinte mais vivante : sa barre, son repère gris');
}));

/* ── Passe de finition 11 bis ──────────────────────────────────────────────────── */

test('11 bis, R1 : les curseurs de la fiche laissent la page défiler (`touch-action: pan-y`) — le doigt posé pour faire défiler n’allume ni ne règle rien ; la barre de la fiche de même', () => dans(() => {
  const w = poser();
  const m = monter(Fiche, { hass: w.hass, id: 'light.veilleuse' });   // des blancs ET des couleurs : les deux curseurs
  for (const label of ['Température du blanc', 'Teinte']) {
    const h = html(curseur(m, label));
    assert.match(h, /touch-action:pan-y/, label + ' : le défilement vertical reste à la page');
    assert.ok(!h.includes('touch-action:none'), label + ' : plus de `touch-action: none`');
  }
  assert.match(html(element(m, 'RmJauge')[0]), /touch-action:pan-y/, 'la barre de la fiche (zone de 52 px) aussi');
  assert.ok(!lire('src/fichelumiere.jsx').includes("touchAction: 'none'"), 'plus aucun `none` dans la fiche');
}));

test('11 bis, R1 : un doigt posé sur un curseur de la fiche, puis repris par la page (`pointercancel`), n’envoie AUCUN ordre — le repère revient ; levé en place, il commande, une fois', () => dans(() => {
  const w = poser();
  const m = monter(Fiche, { hass: w.hass, id: 'light.veilleuse' });
  for (const label of ['Température du blanc', 'Teinte']) {
    const c = curseur(m, label);
    const envoyes = [];
    const j = monter(c.type, { ...c.props, onCommit: (n) => envoyes.push(n) });
    const rep = { style: {} };
    const el = { getBoundingClientRect: () => ({ left: 100, width: 200 }), querySelector: (s) => (s === '[data-repere]' ? rep : null), setPointerCapture() {} };
    const doigt = (x) => ({ currentTarget: el, clientX: x, pointerId: 1, preventDefault() {} });
    j.arbre.props.onPointerDown(doigt(150));
    el.onpointermove({ clientX: 152 });
    el.onpointercancel();
    assert.deepEqual(envoyes, [], label + ' : la page a repris le geste, rien ne part');
    assert.deepEqual([el.onpointerup, el.onpointermove, el.onpointercancel], [null, null, null], label + ' : plus aucun écouteur');
    assert.equal(rep.style.opacity, c.props.valeur == null ? '0' : '1', label + ' : le repère retrouve sa visibilité d’avant');
    // Le contraire : levé en place, le doigt commande.
    j.arbre.props.onPointerDown(doigt(150));
    el.onpointerup();
    assert.equal(envoyes.length, 1, label + ' : un geste mené au bout commande, une fois');
  }
}));

test('11 bis, R2 : le journal se relit sur l’état RÉEL de la lampe (`last_updated`), non sur le geste d’abord — « Réglée à 60 % » n’arrive plus une minute en retard', () => dans(({ h }) => {
  const w = poser();
  const lectures = () => w.commandes.filter(c => c.type === 'loggia/lumieres/journal' && c.entity_id === 'light.ampoule_chambre').length;
  const m = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  assert.equal(lectures(), 1, 'à l’ouverture de la fiche : une lecture du carnet');
  // Un réglage depuis la barre : le geste d'abord montre 60 %, mais la lampe n'a pas répondu — le serveur n'a rien noté encore.
  element(m, 'RmJauge')[0].props.onCommit(60);
  m.rendre();
  assert.ok(m.texte().startsWith('60%'), 'le geste d’abord : 60 %, tout de suite');
  assert.equal(lectures(), 1, 'le geste d’abord ne fait pas relire : lire maintenant rendrait le carnet d’avant, et le suivant viendrait une minute plus tard');
  // ASSERTION MODIFIÉE (seconde tranche des lumières, B9) : un réglage ne relit qu'au plus toutes les 10 s — la lecture de l'ouverture
  // date de moins de 10 s, on laisse passer sa garde (le cas d'un palier pendant la garde est joué plus bas).
  h.avancer(10000);
  // La lampe répond : son état réel porte un nouveau `last_updated` — le serveur a noté le réglage. La fiche relit aussitôt.
  const reel = w.hass.states['light.ampoule_chambre'];
  const apres = { ...reel, last_updated: new Date(Date.now() + 2000).toISOString(), attributes: { ...reel.attributes, brightness: 153 } };
  m.proprietes({ hass: { ...w.hass, states: { ...w.hass.states, 'light.ampoule_chambre': apres } } });
  assert.equal(lectures(), 2, 'l’état réel a changé : le journal est relu tout de suite — « Réglée à 60 % » paraît');
  // Rien de nouveau dans l'état réel, rien à relire : un nouveau rendu ne relit pas.
  m.rendre();
  assert.equal(lectures(), 2, 'un état qui ne bouge pas ne fait pas relire');
  // Une lampe qui change sans geste de la fiche (un interrupteur mural) : même chose, la fiche suit la réalité.
  const mur = { ...apres, last_updated: new Date(Date.now() + 9000).toISOString(), state: 'off', last_changed: new Date(Date.now() + 9000).toISOString(), attributes: { ...apres.attributes, brightness: null } };
  m.proprietes({ hass: { ...w.hass, states: { ...w.hass.states, 'light.ampoule_chambre': mur } } });
  assert.equal(lectures(), 3, 'un changement venu d’ailleurs relit aussi — tout de suite : la lampe s’est éteinte');
  // La clé est l'état réel, et la fiche le dit.
  const FICHE = lire('src/fichelumiere.jsx');
  // ASSERTION MODIFIÉE (B9) : l'état on/off et le `last_updated` sont deux clés — l'un relit tout de suite, l'autre au plus toutes les 10 s.
  assert.ok(FICHE.includes("useJournalLumiere(H, id, minuit, reel ? reel.state : '', cleJournal)"), 'le journal lit sa clé dans l’état réel, calculée juste au-dessus');
  assert.ok(!FICHE.includes("(v.depuis || '') + '|' + (v.bri || '')"), 'plus la clé du geste d’abord (`depuis` et `bri` optimistes)');
}));

test('11 bis, R7 : la plaque de la fiche d’une ampoule froide — le blanc de 4 000 K en thème clair, la teinte vraie en thème sombre', async () => {
  const froide = (clair) => dans(() => {
    const w = poser();
    w.hass.states['light.ampoule_chambre'] = lampe('light.ampoule_chambre', 'on', { friendly_name: 'Ampoule Chambre', supported_color_modes: ['color_temp'], color_mode: 'color_temp', color_temp_kelvin: 6500,
      min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500, brightness: 255 }, iso(20, 10));
    return element(monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' }), 'EnteteFiche')[0].props.plaque.fond;
  }, { clair });
  assert.equal(await froide(true), 'rgba(255,209,163,.22)', 'thème clair : la plaque se voit');
  assert.equal(await froide(false), 'rgba(255,249,253,.22)', 'thème sombre : la teinte vraie, comme avant');
});

/* R10 : le bord droit du minuteur. La rangée du minuteur prenait le `RANGEE` des lignes à chevron — 14 px à droite, 18 à gauche — : ses puces, et
 * « Annuler » à leur bout, finissaient 4 px plus à droite que tout le contenu des autres panneaux (le haut, Couleur, Aujourd'hui : 18 px de chaque côté).
 * Mesuré dans la démo, à 1440 et 360 px : « Annuler » à 15 px du bord du panneau (14 + le liseré), le reste à 19. */
test('11 bis, R10 : la rangée du minuteur est à 18 px de chaque côté, comme le contenu des autres panneaux — « Annuler » n’avance plus de 4 px', () => dans(() => {
  const FICHE = lire('src/fichelumiere.jsx');
  const rembourrage = (style) => {
    const p = String(style.padding).trim().split(/\s+/).map(x => parseFloat(x));
    return { haut: p[0], droite: p.length > 1 ? p[1] : p[0], bas: p.length > 2 ? p[2] : p[0], gauche: p.length > 3 ? p[3] : p.length > 1 ? p[1] : p[0] };
  };
  const w = poser({ minuteurs: { 'light.ampoule_chambre': { fin: Math.floor(Date.now() / 1000) + 1800, duree: 30 } } });
  const m = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  // Les panneaux qui portent leur rembourrage : le haut et Couleur (Aujourd'hui est un composant à part, 14 px 18 px) — 18 px de chaque côté.
  const panneaux = m.trouver(e => e.props && e.props.style && e.props.style.background === 'var(--o-s3)' && e.props.style.padding !== undefined);
  assert.ok(panneaux.length >= 2, 'le haut et Couleur portent leur rembourrage : ' + panneaux.length);
  for (const p of panneaux) { const r = rembourrage(p.props.style); assert.equal(r.droite, r.gauche, 'un panneau est symétrique : ' + p.props.style.padding); assert.equal(r.droite, 18); }
  // La rangée du minuteur — le panneau, sans rembourrage, qui la porte — : 18 de chaque côté, comme eux.
  const rangee = m.trouver(e => e.props && e.props.style && e.props.style.flexDirection === 'column' && e.props.style.alignItems === 'stretch' && e.props.style.gap === 12)[0];
  assert.ok(rangee, 'la rangée du minuteur');
  const r = rembourrage(rangee.props.style);
  assert.deepEqual([r.gauche, r.droite], [18, 18], 'le bord droit de « Annuler » est celui des autres panneaux : ' + rangee.props.style.padding);
  assert.ok(texteDe(rangee).includes('Annuler'), 'c’est bien la rangée de « Annuler »');
  // La rangée de « L’appareil » garde son chevron à 14 px du bord : un chevron n'est pas du contenu aligné.
  const appareil = m.trouver(e => e.type === 'button' && texteDe(e).startsWith('L’appareil'))[0];
  assert.equal(rembourrage(appareil.props.style).droite, 14, 'le chevron reste à 14 px');
  // ASSERTION MODIFIÉE (seconde tranche des lumières, B4) : la rangée du minuteur passe sous celle de l'effet, avec son filet.
  assert.ok(FICHE.includes("{ ...RANGEE, padding: '12px 18px', flexDirection: 'column', alignItems: 'stretch', borderTop: filet(effets ? 1 : 0) }"), 'le code le dit : la rangée du minuteur se rembourre elle-même');
}));

/* TEST AJOUTÉ (passe bis 3 du 17/10, point 3 ; sa demande pour le volume — « quand je regle le volume, le pourcentage ne suis pas comme sur
 * la maquette » — vaut pour la luminosité). Le grand pourcentage de la fiche suit le doigt sur la barre de 52 px, comme le chiffre de la
 * carte : la vue de la lampe garde la valeur sous le doigt (`RmJauge`, `onGlisse`). UN `turn_on` au relâcher. Éteinte, « Éteinte » laisse
 * la place au chiffre dès le glisser ; rien ne part avant le relâcher, et un geste annulé la laisse éteinte. */
test('passe bis 3, point 3 : le grand pourcentage de la fiche suit le doigt — allumée comme éteinte ; UN `turn_on` au relâcher ; annulé, rien', () => dans(() => {
  const sousLeDoigt = (jauge, x) => {
    const barre = monter(F.RmJauge, jauge.props);
    const el = { querySelector: () => null, getBoundingClientRect: () => ({ left: 0, width: 226 }), classList: { add() {}, remove() {} }, setPointerCapture() {}, onpointermove: null, onpointerup: null, onpointercancel: null };
    barre.arbre.props.onPointerDown({ stopPropagation() {}, preventDefault() {}, currentTarget: el, clientX: x, pointerId: 1 });
    return el;
  };
  const w = poser();
  const m = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  assert.ok(m.texte().startsWith('45%'));
  const [jauge] = element(m, 'RmJauge');
  assert.equal(typeof jauge.props.onGlisse, 'function', 'la barre de la fiche annonce le doigt');
  const el = sousLeDoigt(jauge, 100);
  m.rendre();
  assert.ok(m.texte().startsWith('50%'), 'posé sur la barre : le grand pourcentage suit');
  el.onpointermove({ clientX: 180 });
  m.rendre();
  assert.ok(m.texte().startsWith('90%'), 'il suit le doigt, à 90');
  assert.equal(element(m, 'RmJauge')[0].props.v, 90);
  assert.deepEqual(w.appels, [], 'rien ne part pendant le glisser');
  el.onpointerup();
  m.rendre();
  assert.deepEqual(w.appels, ['light.turn_on light.ampoule_chambre brightness_pct=90'], 'UN seul ordre, au relâcher');
  assert.ok(m.texte().startsWith('90%'), 'le geste d’abord : la valeur posée reste');
  // Éteinte : « Éteinte », puis le chiffre dès le glisser ; rien avant le relâcher.
  const w2 = poser();
  const e = monter(Fiche, { hass: w2.hass, id: 'light.chambre' });
  assert.ok(e.texte().startsWith('Éteinte'));
  const el2 = sousLeDoigt(element(e, 'RmJauge')[0], 60);
  e.rendre();
  assert.ok(e.texte().startsWith('30%'), 'sous le doigt, le chiffre — la lampe n’est pas encore allumée');
  assert.deepEqual(w2.appels, []);
  el2.onpointerup();
  e.rendre();
  assert.deepEqual(w2.appels, ['light.turn_on light.chambre brightness_pct=30'], 'L7 : le relâcher l’allume, une fois');
  assert.ok(e.texte().startsWith('30%'));
  // Annulé (la fiche défile sous le doigt) : « Éteinte » revient, rien ne part.
  const w3 = poser();
  const a = monter(Fiche, { hass: w3.hass, id: 'light.chambre' });
  const el3 = sousLeDoigt(element(a, 'RmJauge')[0], 60);
  a.rendre();
  el3.onpointercancel();
  a.rendre();
  assert.ok(a.texte().startsWith('Éteinte'), a.texte().slice(0, 40));
  assert.deepEqual(w3.appels, []);
}));

/* ── Audit du 19/10, seconde tranche ───────────────────────────────────────── */

// Une carte minimale : la vue de la lampe, lue par un second composant — comme la carte derrière la fiche ouverte.
const Carte = ({ hass, id }) => { const v = F.useVueLumiere(hass, id); return createElement('span', null, v.phrase.texte + '|' + (v.bri == null ? '' : v.bri)); };

test('B2 : la carte et la fiche tiennent la MÊME avance — la bascule de la fiche se voit sur la carte, et le doigt sur la barre de la fiche aussi', () => dans(() => {
  const w = poser();
  const fiche = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  const carte = monter(Carte, { hass: w.hass, id: 'light.ampoule_chambre' });
  assert.ok(carte.texte().startsWith('Allumée depuis 20:10|45'));
  element(fiche, 'RmBascule')[0].props.onToggle();
  carte.rendre();
  assert.ok(carte.texte().startsWith('Éteinte|'), 'la fiche éteint : la carte le dit tout de suite — ' + carte.texte());
  assert.deepEqual(w.appels, ['light.turn_off light.ampoule_chambre']);
  // Le doigt sur la barre de la fiche : le chiffre de la carte suit, sans ordre.
  const w2 = poser();
  const f2 = monter(Fiche, { hass: w2.hass, id: 'light.ampoule_chambre' });
  const c2 = monter(Carte, { hass: w2.hass, id: 'light.ampoule_chambre' });
  element(f2, 'RmJauge')[0].props.onGlisse(70);
  c2.rendre();
  assert.ok(c2.texte().endsWith('|70'), 'sous le doigt : 70 sur la carte');
  assert.deepEqual(w2.appels, []);
  element(f2, 'RmJauge')[0].props.onCommit(70);
  element(f2, 'RmJauge')[0].props.onGlisse(null);
  c2.rendre();
  assert.ok(c2.texte().endsWith('|70'), 'relâché : le geste d’abord garde 70');
  assert.deepEqual(w2.appels, ['light.turn_on light.ampoule_chambre brightness_pct=70']);
}));

test('B13 : la fiche d’une lampe ÉTEINTE s’ouvre sur le mode que le carnet connaît — les couleurs si elle était en couleur', () => dans(() => {
  const w = poser();
  L.poserEtatLumieres({ lumieres: { 'light.eteinte': { dernier: { bri: 60, mode: 'xy', kelvin: null, hs: [275, 100] } } } });
  const m = monter(Fiche, { hass: w.hass, id: 'light.eteinte' });
  assert.deepEqual(['Blancs', 'Couleurs'].map(n => bouton(m, n).props['aria-pressed']), [false, true], 'ouverte sur les couleurs');
  L.poserEtatLumieres({ lumieres: { 'light.eteinte': { dernier: { bri: 60, mode: 'color_temp', kelvin: 2700, hs: null } } } });
  const m2 = monter(Fiche, { hass: w.hass, id: 'light.eteinte' });
  assert.deepEqual(['Blancs', 'Couleurs'].map(n => bouton(m2, n).props['aria-pressed']), [true, false], 'un blanc : les blancs');
  L.poserEtatLumieres({ lumieres: {} });
  const m3 = monter(Fiche, { hass: w.hass, id: 'light.eteinte' });
  assert.deepEqual(['Blancs', 'Couleurs'].map(n => bouton(m3, n).props['aria-pressed']), [true, false], 'sans carnet : les blancs, comme avant');
}));

/* TEST AJOUTÉ (audit du 19/10, seconde tranche ; B9) : la fiche d'une veilleuse ouverte pendant ses cinq minutes de fondu relisait son
 * journal — trois appels — à chaque palier de luminosité. Un réglage (`last_updated` seul) relit au plus toutes les 10 s : le premier
 * palier d'une garde se relit à sa fin ; un changement d'état on/off, lui, relit tout de suite. */
test('B9 : pendant un fondu, le journal se relit au plus toutes les 10 s — les paliers se coalescent ; s’éteindre relit tout de suite', () => dans(({ h }) => {
  const w = poser();
  const lectures = () => w.commandes.filter(c => c.type === 'loggia/lumieres/journal').length;
  const m = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  assert.equal(lectures(), 1);
  const base = Date.parse(w.hass.states['light.ampoule_chambre'].last_updated);
  const palier = (b, ms, state = 'on') => {
    const reel = w.hass.states['light.ampoule_chambre'];
    const apres = { ...reel, state, last_updated: new Date(base + ms).toISOString(), attributes: { ...reel.attributes, brightness: b } };
    m.proprietes({ hass: { ...w.hass, states: { ...w.hass.states, 'light.ampoule_chambre': apres } } });
  };
  palier(100, 1000); palier(90, 2000); palier(80, 3000);
  assert.equal(lectures(), 1, 'trois paliers dans les 10 s de la lecture d’ouverture : aucune relecture encore');
  h.avancer(10000);
  assert.equal(lectures(), 2, 'la garde passée : UNE relecture pour les paliers arrivés pendant elle');
  palier(70, 12000);
  assert.equal(lectures(), 2, 'un palier dans la garde suivante attend');
  h.avancer(10000);
  assert.equal(lectures(), 3);
  h.avancer(10000);
  assert.equal(lectures(), 3, 'rien de nouveau : rien à relire');
  palier(null, 31000, 'off');
  assert.equal(lectures(), 4, 'la lampe s’éteint : tout de suite, garde ou pas');
  m.demonter();
}));

/* TEST AJOUTÉ (audit du 19/10, seconde tranche ; B4, sa décision : oui aux effets). Une lampe qui publie `effect_list` a une rangée
 * « Effet » : une liste de choix (`ListeChoix`, la règle des menus) des effets tels que l'intégration les nomme — jamais traduits —,
 * « Aucun » quand la liste nomme l'arrêt. Choisir part par le moteur (`set_effect` : `light.turn_on` avec `effect`), et allume une
 * lampe éteinte. La phrase du haut nomme l'effet en cours. La carte, elle, ne change pas (sa phrase n'a pas la place). */
test('B4 : la rangée « Effet » — la liste des effets, « Aucun » reconnu ; choisir envoie `effect` et allume ; la phrase nomme l’effet en cours', () => dans(() => {
  const w = poser();
  const reel = w.hass.states['light.ampoule_chambre'];
  w.hass.states['light.ampoule_chambre'] = { ...reel, attributes: { ...reel.attributes, supported_features: 4, effect_list: ['Candle', 'Fireplace', 'off'], effect: 'Candle' } };
  const m = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  const [liste] = element(m, 'ListeChoix');
  assert.ok(liste, 'une liste de choix, jamais un <select>');
  assert.deepEqual(liste.props.options, [{ id: 'off', label: 'Aucun' }, { id: 'Candle', label: 'Candle' }, { id: 'Fireplace', label: 'Fireplace' }], '« off » devient « Aucun », en tête ; les autres gardent leur nom');
  assert.equal(liste.props.value, 'Candle');
  assert.equal(liste.props.nom, 'Effet : Candle');
  assert.ok(m.texte().includes('S’éteint à') === false && m.texte().includes('Allumée depuis 20:10 · blanc doux · effet Candle'), 'la phrase du haut nomme l’effet — ' + m.texte());
  liste.props.onChange('Fireplace');
  assert.deepEqual(w.appels, ['light.turn_on light.ampoule_chambre effect=Fireplace'], 'par le moteur : `light.turn_on` avec `effect`');
  liste.props.onChange('off');
  assert.deepEqual(w.appels[1], 'light.turn_on light.ampoule_chambre effect=off', '« Aucun » envoie le nom que la liste donne à l’arrêt');
  // Sans « aucun » dans la liste : on ne l'offre pas ; un variateur sans effet n'a pas de rangée.
  const w2 = poser();
  const r2 = w2.hass.states['light.chambre'];
  w2.hass.states['light.chambre'] = { ...r2, attributes: { ...r2.attributes, supported_features: 4, effect_list: ['Blink', 'Breathe'] } };
  const m2 = monter(Fiche, { hass: w2.hass, id: 'light.chambre' });
  const [l2] = element(m2, 'ListeChoix');
  assert.deepEqual(l2.props.options.map(o => o.id), ['Blink', 'Breathe']);
  assert.equal(l2.props.value, '', 'aucun effet en cours, et pas d’entrée « Aucun » : rien de choisi');
  // La liste est un enfant (non rendu par le harnais) : ce que son bouton montre se lit dans ce qu'elle dessine.
  assert.equal(texteDe(l2.props.children(null, false)), 'EffetAucun', 'la rangée dit « Aucun »');
  assert.equal(texteDe(liste.props.children(null, false)), 'EffetCandle');
  l2.props.onChange('Blink');
  assert.deepEqual(w2.appels, ['light.turn_on light.chambre effect=Blink'], 'choisir un effet sur une lampe ÉTEINTE l’allume');
  m2.rendre();
  assert.ok(m2.texte().startsWith('Allumée') || /^\d+%/.test(m2.texte()), 'le geste d’abord : allumée tout de suite — ' + m2.texte().slice(0, 40));
  const m3 = monter(Fiche, { hass: poser().hass, id: 'light.chambre' });
  assert.equal(element(m3, 'ListeChoix').length, 0, 'sans `effect_list`, pas de rangée');
  // Muette : rien.
  const w4 = poser();
  const r4 = w4.hass.states['light.morte'];
  w4.hass.states['light.morte'] = { ...r4, attributes: { ...r4.attributes, effect_list: ['Candle'] } };
  assert.equal(element(monter(Fiche, { hass: w4.hass, id: 'light.morte' }), 'ListeChoix').length, 0, 'muette : aucune commande');
}));

/* TEST AJOUTÉ (seconde tranche ; B1, B6). Un pastel réglé ailleurs (`hs [30, 12]`) n'est pas « orange » : l'étiquette dit « Blanc »,
 * aucune puce n'est cerclée, la phrase dit « blanc ». Un ruban `hs + white` a une puce « Blanc » dans sa palette des couleurs :
 * elle envoie `white` avec son niveau, par le moteur ; en mode `white`, elle est pressée et aucune couleur ne l'est. */
test('B1, B6 : un pastel est « Blanc », sans puce cerclée ; la puce « Blanc » d’un ruban `hs + white` revient au blanc par `white`', () => dans(() => {
  const w = poser();
  const reel = w.hass.states['light.veilleuse'];
  w.hass.states['light.veilleuse'] = { ...reel, attributes: { ...reel.attributes, hs_color: [30, 12], rgb_color: [255, 240, 224] } };
  const m = monter(Fiche, { hass: w.hass, id: 'light.veilleuse' });
  assert.ok(m.texte().includes('Allumée depuis 20:30 · blanc'), 'la phrase : « blanc », pas « orange » — ' + m.texte());
  assert.ok(!m.texte().includes('Orange'), 'l’étiquette ne dit pas Orange');
  const puces = m.trouver(e => e.type === 'button' && e.props.title && e.props['aria-pressed'] !== undefined);
  assert.equal(puces.length, 6);
  assert.ok(puces.every(b => b.props['aria-pressed'] === false), 'aucune couleur cerclée');
  assert.deepEqual(['Blancs', 'Couleurs'].map(n => bouton(m, n).props['aria-pressed']), [false, true], 'la palette des couleurs reste la sienne');
  // Le ruban `hs + white`, en couleur : la puce « Blanc » envoie `white` avec sa luminosité (0-255), par le moteur.
  const w2 = poser();
  w2.hass.states['light.ruban'] = lampe('light.ruban', 'on', { friendly_name: 'Ruban', supported_color_modes: ['hs', 'white'], color_mode: 'hs', hs_color: [275, 100], rgb_color: [149, 0, 255], brightness: 128 }, iso(20, 30));
  const m2 = monter(Fiche, { hass: w2.hass, id: 'light.ruban' });
  const blanc = bouton(m2, 'Blanc');
  assert.ok(blanc && blanc.props['aria-pressed'] === false, 'la puce « Blanc », pas pressée en couleur');
  assert.equal(m2.trouver(e => e.type === 'button' && /Blancs|Couleurs/.test(texteDe(e))).length, 0, 'sans `color_temp` : pas de puces Blancs / Couleurs');
  m2.appuyer(blanc);
  assert.deepEqual(w2.appels, ['light.turn_on light.ruban white=128'], '`white` porte la luminosité de la lampe');
  // En mode `white` : « Blanc » pressée, aucune couleur cerclée, l'étiquette dit Blanc.
  const w3 = poser();
  w3.hass.states['light.ruban'] = lampe('light.ruban', 'on', { friendly_name: 'Ruban', supported_color_modes: ['hs', 'white'], color_mode: 'white', brightness: 200 }, iso(20, 30));
  const m3 = monter(Fiche, { hass: w3.hass, id: 'light.ruban' });
  assert.equal(bouton(m3, 'Blanc').props['aria-pressed'], true);
  assert.ok(m3.texte().includes('Allumée depuis 20:30 · blanc'));
  assert.ok(m3.trouver(e => e.type === 'button' && e.props.title && e.props['aria-pressed']).length === 0, 'aucune couleur cerclée en mode `white`');
  // Éteinte, sans niveau connu : plein — jamais 0, qui éteindrait.
  const w4 = poser();
  w4.hass.states['light.ruban'] = lampe('light.ruban', 'off', { friendly_name: 'Ruban', supported_color_modes: ['hs', 'white'] }, iso(7, 50));
  const m4 = monter(Fiche, { hass: w4.hass, id: 'light.ruban' });
  m4.appuyer(bouton(m4, 'Blanc'));
  assert.deepEqual(w4.appels, ['light.turn_on light.ruban white=255']);
}));

/* TEST AJOUTÉ (seconde tranche ; B6, B7). Une `rgbww` sans `color_temp` montre ses blancs, aux bornes de sa maquette ; un ancien
 * Home Assistant en mireds donne son blanc et ses bornes en kelvins. */
test('B6, B7 : une rgbww sans `color_temp` a ses blancs ; un blanc en mireds se lit — « Douce · 2 703 K », les bornes de 2 000 à 6 536 K', () => dans(() => {
  const w = poser();
  w.hass.states['light.rgbww'] = lampe('light.rgbww', 'on', { friendly_name: 'Ruban rgbww', supported_color_modes: ['rgbww'], color_mode: 'rgbww', hs_color: [30, 100], rgb_color: [255, 128, 0], brightness: 200 }, iso(20, 30));
  const m = monter(Fiche, { hass: w.hass, id: 'light.rgbww' });
  assert.deepEqual(['Blancs', 'Couleurs'].map(n => bouton(m, n).props['aria-pressed']), [false, true]);
  const curseurs = element(m, 'CurseurPeint');
  assert.deepEqual([curseurs[0].props.min, curseurs[0].props.max], [2200, 6500], 'les bornes de sa maquette');
  m.appuyer(bouton(m, 'Douce'));
  assert.deepEqual(w.appels, ['light.turn_on light.rgbww color_temp_kelvin=2700'], 'Home Assistant convertit `color_temp_kelvin` pour une rgbww');
  const w2 = poser();
  w2.hass.states['light.ancienne'] = lampe('light.ancienne', 'on', { friendly_name: 'Ancienne', supported_color_modes: ['color_temp'], color_mode: 'color_temp', color_temp: 370, min_mireds: 153, max_mireds: 500, brightness: 200 }, iso(20, 30));
  const m2 = monter(Fiche, { hass: w2.hass, id: 'light.ancienne' });
  assert.ok(m2.texte().includes('Douce · 2' + FINE + '703' + NBSP + 'K'), 'le réglage en mireds, dit en kelvins — ' + m2.texte());
  const [c2] = element(m2, 'CurseurPeint');
  assert.deepEqual([c2.props.min, c2.props.max, c2.props.valeur], [2000, 6536, 2703]);
}));

/* TEST AJOUTÉ (seconde tranche ; B11). Une flèche tenue sur un curseur de la fiche — le blanc, la teinte — ne commande plus à chaque
 * répétition : le repère suit la touche, et UN ordre part au relâcher, ou 500 ms après la dernière touche. La barre de la fiche
 * passe aussi `rafale` à la jauge. */
test('B11 : une flèche tenue sur un curseur de la fiche — le repère suit, UN ordre au relâcher ; la barre de la fiche est en rafale', () => dans(({ h }) => {
  const w = poser();
  const m = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  const [curseur] = element(m, 'CurseurPeint');
  // Le curseur peint n'est pas exporté : son élément dans l'arbre porte le composant (`type`), on le joue avec ses props.
  const c = monter(curseur.type, curseur.props);
  const rep = { style: {} };
  const el = { querySelector: (q) => (q === '[data-repere]' ? rep : null) };
  const touche = (key) => c.arbre.props.onKeyDown({ key, preventDefault() {}, stopPropagation() {}, currentTarget: el });
  touche('ArrowRight'); touche('ArrowRight'); touche('ArrowRight');
  assert.deepEqual(w.appels, [], 'trois répétitions : rien ne part');
  assert.equal(el.__visee, 2850, 'la visée avance de trois pas depuis 2 700 K');
  assert.equal(rep.style.opacity, '1', 'le repère suit la touche');
  c.arbre.props.onKeyUp({ currentTarget: el });
  assert.deepEqual(w.appels, ['light.turn_on light.ampoule_chambre color_temp_kelvin=2850'], 'UN ordre, au relâcher');
  // Sans relâcher (la touche reste enfoncée, puis le focus part) : 500 ms après la dernière touche.
  touche('ArrowLeft');
  h.avancer(499);
  assert.equal(w.appels.length, 1);
  h.avancer(1);
  assert.equal(w.appels.length, 2);
  assert.equal(element(m, 'RmJauge')[0].props.rafale, true, 'la barre de la fiche est en rafale');
}));


/* TEST AJOUTÉ (retouches du 19/10, R1). La rangée « Effet » ne paraît que si la lampe ANNONCE la fonction effet — le bit 4 de
 * `supported_features`, la règle même de `planAction` (`set_effect`, capabilities.js) : avec `effect_list` mais sans le bit, le
 * moteur refusait l'ordre (« Commande non exécutée », aucun appel) et la rangée mentait. */
test('R1 : la rangée « Effet » ne paraît que si la lampe annonce la fonction effet (`supported_features & 4`, la règle de `planAction`)', () => dans(() => {
  const w = poser();
  const reel = w.hass.states['light.ampoule_chambre'];
  const avec = (features) => { w.hass.states['light.ampoule_chambre'] = { ...reel, attributes: { ...reel.attributes, ...(features == null ? {} : { supported_features: features }), effect_list: ['Candle', 'off'], effect: 'off' } }; };
  avec(null);
  const m = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  assert.equal(element(m, 'ListeChoix').length, 0, 'sans `supported_features`, pas de rangée : l’ordre serait refusé');
  m.demonter();
  avec(40);
  const m2 = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  assert.equal(element(m2, 'ListeChoix').length, 0, 'flash + transition (40) ne suffisent pas');
  m2.demonter();
  avec(44);
  const m3 = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  assert.equal(element(m3, 'ListeChoix').length, 1, 'le bit 4 dans 44 : la rangée');
  m3.demonter();
}));

/* TEST AJOUTÉ (retouches du 19/10, R2). `ListeChoix` appelle `onChange` même sur la valeur déjà choisie : la fiche, elle, ne
 * renvoie pas un ordre pour rien — l'effet déjà en cours, ou « Aucun » quand aucun effet ne tourne. Et ÉTEINTE, une lampe n'a
 * aucun effet en cours : « Aucun » est sa valeur, le choisir n'envoie rien et ne l'allume jamais ; un effet, lui, l'allume (B4). */
test('R2 : l’effet déjà en cours ou « Aucun » sans effet n’envoient rien ; « Aucun » sur une lampe éteinte ne l’allume jamais', () => dans(() => {
  const w = poser();
  const reel = w.hass.states['light.ampoule_chambre'];
  w.hass.states['light.ampoule_chambre'] = { ...reel, attributes: { ...reel.attributes, supported_features: 4, effect_list: ['Candle', 'off'], effect: 'Candle' } };
  const m = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  const [liste] = element(m, 'ListeChoix');
  liste.props.onChange('Candle');
  assert.deepEqual(w.appels, [], 'l’effet déjà en cours : rien ne part');
  liste.props.onChange('off');
  assert.deepEqual(w.appels, ['light.turn_on light.ampoule_chambre effect=off'], 'allumée avec un effet, « Aucun » l’arrête');
  m.demonter();
  // Allumée sans effet : « Aucun » est la valeur du moment, rien ne part.
  const w2 = poser();
  w2.hass.states['light.ampoule_chambre'] = { ...reel, attributes: { ...reel.attributes, supported_features: 4, effect_list: ['Candle', 'off'], effect: 'off' } };
  const m2 = monter(Fiche, { hass: w2.hass, id: 'light.ampoule_chambre' });
  const [l2] = element(m2, 'ListeChoix');
  assert.equal(l2.props.value, 'off');
  l2.props.onChange('off');
  assert.deepEqual(w2.appels, [], '« Aucun » quand aucun effet ne tourne : rien');
  m2.demonter();
  // Éteinte, avec un `effect` que l'intégration a laissé : aucun effet ne tourne — « Aucun » est la valeur, et ne l'allume pas.
  const w3 = poser();
  const r3 = w3.hass.states['light.chambre'];
  w3.hass.states['light.chambre'] = { ...r3, attributes: { ...r3.attributes, supported_features: 4, effect_list: ['Blink', 'None'], effect: 'Blink' } };
  const m3 = monter(Fiche, { hass: w3.hass, id: 'light.chambre' });
  const [l3] = element(m3, 'ListeChoix');
  assert.equal(l3.props.value, 'None', 'éteinte : « Aucun », quoi que dise encore `effect`');
  assert.equal(texteDe(l3.props.children(null, false)), 'EffetAucun');
  l3.props.onChange('None');
  assert.deepEqual(w3.appels, [], '« Aucun » sur une lampe éteinte : rien');
  m3.rendre();
  assert.ok(!m3.texte().startsWith('Allumée') && !/^\d+%/.test(m3.texte()), 'et elle ne s’avance pas allumée — ' + m3.texte().slice(0, 30));
  l3.props.onChange('Blink');
  assert.deepEqual(w3.appels, ['light.turn_on light.chambre effect=Blink'], 'un effet, lui, l’allume (B4)');
  m3.demonter();
}));

/* Le minuteur se DÉCOMPTE (sa demande du 20/10) : tant qu'il tourne, la fiche bat la seconde — un seul battement, qui cesse
 * avec lui. Le temps des tests est factice : on compte les battements posés, pas les secondes. */
test('le décompte du minuteur : la fiche bat la seconde tant qu’il tourne, et s’arrête avec lui', () => dans(async ({ h }) => {
  const fin = Math.floor(Date.now() / 1000) + 872;
  const w = poser({ minuteurs: { 'light.ampoule_chambre': { fin, duree: 15 } } });
  const m = monter(Fiche, { hass: w.hass, id: 'light.ampoule_chambre' });
  assert.ok(m.texte().includes('S’éteint à ' + hm(fin * 1000) + ' · dans 14' + NBSP + 'min' + NBSP), 'à la seconde : « dans 14 min 32 s » (ou 31, le temps du test)');
  assert.equal(h.intervalles().filter(i => i.ms === 1000).length, 1, 'un battement par seconde, un seul');
  // Le minuteur annulé (le relevé l'apprend) : plus de battement.
  P.poserMinuteurs({ minuteurs: {}, maintenant: Date.now() / 1000 });
  m.rendre();
  assert.ok(!m.texte().includes('S’éteint à'), 'plus de minuteur');
  assert.equal(h.intervalles().filter(i => i.ms === 1000).length, 0, 'la seconde ne bat plus pour rien');
  // Une lampe sans minuteur n'a jamais battu.
  const sans = monter(Fiche, { hass: w.hass, id: 'light.veilleuse' });
  assert.ok(sans.texte().includes('Éteint la lumière au bout du temps choisi.'));
  assert.equal(h.intervalles().filter(i => i.ms === 1000).length, 0);
}));
