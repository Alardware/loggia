/* L'en-tête d'Objets › Prises (chantier Prises, § 3.4 ; ADR 0193).
 *
 * À la place du compte des appareils : « 3 allumées · 150 W en ce moment »,
 * puis « · 1 indisponible » s'il y a des prises muettes, au pluriel de chaque
 * langue. La puissance est la somme de celles que les cartes montrent ; sans
 * aucune qui se lise, elle se tait. L'en-tête est un module à part, chargé à
 * la première ouverture du filtre ; il reçoit un `hass` VIVANT d'un petit
 * composant d'App.jsx, qui s'abonne aux prises visibles (relecture finale, A2 :
 * « 150 W » vivait grâce à une ligne des clés bruyantes qui ne surveillait rien).
 * Au téléphone, le compte tient sur UNE ligne : « en ce moment » s'efface, la
 * puissance seule reste, la rangée ne saute plus (A8). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
register('./jsx-hooks.mjs', import.meta.url);
const E = await import(new URL('../src/enteteprises.jsx', import.meta.url).href);
const P = await import('../src/prises.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = MONOLITHE, CSS = lire('src/index.css');

const st = (id, state, a = {}) => [id, { entity_id: id, state, attributes: a }];
const W = (id, w, unite = 'W') => st(id, String(w), { device_class: 'power', unit_of_measurement: unite });
const S = Object.fromEntries([
  st('switch.nas', 'on'), W('sensor.nas_power', 4),
  st('switch.pc', 'on'), W('sensor.pc_power', 0.146, 'kW'),
  st('switch.lv', 'off'), W('sensor.lv_power', 0),
  st('switch.sejour', 'on'),
  st('switch.poele', 'unavailable'), W('sensor.poele_power', 1200),
]);
const PRISES = [{ id: 'switch.nas', puissance: 'sensor.nas_power' }, { id: 'switch.pc', puissance: 'sensor.pc_power' },
  { id: 'switch.lv', puissance: 'sensor.lv_power' }, { id: 'switch.sejour', puissance: null }, { id: 'switch.poele', puissance: 'sensor.poele_power' }];
const html = (p) => renderToStaticMarkup(createElement(E.default, { hass: { states: S }, titre: 'Prises', prises: p }));
// Ce que lit l'œil — sans le balisage — quand rien n'est masqué : le texte entier, « en ce moment » compris.
const texte = (h) => { let t = h, p; do { p = t; t = t.replace(/<[^>]+>/g, ''); } while (t !== p); return t; };

test('le compte : les allumées, la puissance de celles qui la disent (en watts), les muettes à part', () => {
  assert.deepEqual(E.comptePrises(PRISES, S), { allumees: 3, watts: 150, muettes: 1 });
  assert.deepEqual(E.comptePrises(PRISES.slice(2, 4), S), { allumees: 1, watts: null, muettes: 0 }, 'une prise allumée sans mesure : aucune puissance inventée');
  assert.deepEqual(E.comptePrises([], S), { allumees: 0, watts: null, muettes: 0 });
});

test('l’en-tête : « 3 allumées · 150 W en ce moment · 1 indisponible » ; sans muette ni mesure, ce qui reste', () => {
  const tout = html(PRISES);
  assert.ok(tout.includes('>Prises</h2>'), 'le titre du filtre');
  assert.ok(texte(tout).includes('3 allumées · 150 W en ce moment · 1 indisponible'));
  assert.ok(texte(html(PRISES.slice(0, 2))).includes('2 allumées · 150 W en ce moment') && !texte(html(PRISES.slice(0, 2))).includes('indisponible'), 'sans muette, pas de « 0 indisponible »');
  assert.ok(html(PRISES.slice(2, 4)).includes('>1 allumée<'), 'sans mesure, pas de puissance');
});

/* ── A2 : « 150 W » vit ───────────────────────────────────────────────────────
 * Ni Objets ni les pièces ne surveillent `sensor.` : sans abonnement à elle, la
 * puissance restait figée jusqu'au prochain changement d'un `switch.`. La ligne
 * des clés bruyantes de l'écran ne surveillait rien (une clé bruyante ne compte
 * que surveillée) : elle est partie. Le test qui la gardait aussi. Ce qui prouve
 * l'abonnement, désormais : les clés qu'on donne à `useHass` — bascules ET
 * capteurs, ceux-ci bruyants —, un composant qui les lui donne, et le rendu qui
 * suit le hass vivant, joué dans tests/prises_gestes.test.mjs. */
test('A2 : l’en-tête s’abonne aux bascules et aux capteurs des prises VISIBLES — ceux-ci en clés bruyantes', () => {
  assert.ok(APP.includes("const EntetePrises = lazyRecharge(() => import('./enteteprises.jsx'));"), 'le démarrage n’a pas de place à lui donner');
  assert.ok(APP.includes("const prisesVues = actuel === 'prises' ? visibles.filter(o => o.id && String(o.id).indexOf('switch.') === 0).map(o => ({ id: o.id, ...priseDe(S, o.id) })).filter(p => p.prise) : [];"));
  assert.ok(APP.includes('<EntetePrisesVive hass={hass} titre={titreFiltre} prises={prisesVues} />') && !APP.includes('<EntetePrises hass={hass}'), 'l’en-tête reçoit le hass vivant, pas celui de l’écran');
  const vive = APP.slice(APP.indexOf('function EntetePrisesVive('), APP.indexOf('\n}\n', APP.indexOf('function EntetePrisesVive(')));
  assert.ok(vive.includes('const { cles, bruyantes } = clesDesPrises(prises);') && vive.includes('const vivant = useHass(cles, bruyantes);') && vive.includes('hass={vivant || hass}'));
  // Les clés : les bascules des prises visibles ET leurs capteurs ; les capteurs seuls sont bruyants, une fois chacun.
  assert.deepEqual(P.clesDesPrises(PRISES), {
    cles: ['switch.nas', 'switch.pc', 'switch.lv', 'switch.sejour', 'switch.poele', 'sensor.nas_power', 'sensor.pc_power', 'sensor.lv_power', 'sensor.poele_power'],
    bruyantes: ['sensor.nas_power', 'sensor.pc_power', 'sensor.lv_power', 'sensor.poele_power'] });
  assert.deepEqual(P.clesDesPrises([{ id: 'switch.a', puissance: 'sensor.p' }, { id: 'switch.b', puissance: 'sensor.p' }]).bruyantes, ['sensor.p'], 'deux sorties d’un même compteur : une clé');
  assert.deepEqual(P.clesDesPrises([]), { cles: [], bruyantes: [] }, 'aucune prise visible : rien à surveiller');
  assert.deepEqual(P.clesDesPrises(null), { cles: [], bruyantes: [] });
  // La ligne qui ne surveillait rien n'est pas revenue, ni la fonction qui la nourrissait.
  assert.ok(!APP.includes('puissancesDesPrises'), 'une clé bruyante qui n’est pas surveillée ne fait rien');
});

/* ── A8 : le compte tient sur UNE ligne ───────────────────────────────────────
 * À la ligne, il faisait 35 px de haut contre 19 pour son repli de chargement, et
 * la grille bougeait de 16 px quand « 167 W » devenait « 4 W ». Au téléphone,
 * « en ce moment » s'efface (la puissance seule suffit) comme « n en mouvement »
 * dans l'en-tête des volets ; les chiffres sont tabulaires ; à 320 px en allemand
 * ou en polonais, ce qui ne tient pas se coupe en « … ». */
test('A8 : la puissance s’écrit entre ses mots, qui s’effacent au téléphone ; la rangée et le compte portent leurs classes', () => {
  const tout = html(PRISES);
  assert.ok(tout.startsWith('<div class="o-prises-entete"><h2 '), 'la rangée porte la classe que le repli de chargement porte aussi');
  assert.ok(tout.includes('<span class="o-prises-compte" style="font-size:12px;font-weight:600;color:var(--o-text3)">3 allumées · '), 'le compte, dans sa classe');
  assert.ok(tout.includes('<span class="o-prises-moment"></span>150 W<span class="o-prises-moment"> en ce moment</span> · 1 indisponible</span>'),
    'les mots autour de la puissance dans leur propre <span> ; la puissance, elle, reste en dehors');
  assert.ok(!html(PRISES.slice(2, 4)).includes('o-prises-moment'), 'sans puissance, rien d’effaçable');
});

test('A8 : « {w} en ce moment » met la puissance une fois, dans chaque langue — la phrase se coupe autour d’elle', async () => {
  for (const code of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const cat = (await import('../src/langues/' + code + '.js')).default;
    const t = cat['{w} en ce moment'];
    assert.equal(typeof t, 'string', code + ' : la traduction manque');
    assert.equal(t.split('{w}').length, 2, code + ' : « {w} » doit y figurer une fois — l’en-tête coupe la phrase autour de la puissance');
  }
});

test('A8 : le téléphone — 760 px et moins — efface « en ce moment » ; le compte ne passe jamais à la ligne, chiffres tabulaires, « … » au besoin', () => {
  /* ASSERTION MODIFIÉE (19/10) : la rangée était alignée sur la ligne de base, sans hauteur — le titre des Prises montait
   * de 11 px au-dessus de celui des Lumières. Elle a désormais les 40 px et le titre centré des autres en-têtes
   * (tests/objets_titres_alignes.test.mjs). */
  assert.ok(CSS.includes('.o-prises-entete { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 40px; }'));
  assert.ok(CSS.includes('.o-prises-compte { flex: 1 1 0; min-width: 0; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }'),
    'une ligne, tronquée par « … » plutôt que de faire sauter la grille ; les chiffres ont tous la même largeur');
  assert.ok(CSS.includes('@media (max-width: 760px) {\n  .o-prises-moment { display: none; }\n}'), 'au téléphone, les mots s’effacent — le seuil de l’en-tête des volets');
  assert.ok(CSS.includes('@media (max-width: 760px) {\n  .o-volets-mouvement { display: none; }'), 'et c’est bien le seuil de l’en-tête des volets');
});

test('A8 : le repli de chargement a la même rangée que l’en-tête — mêmes classes, même police — donc la même hauteur', () => {
  const d = APP.indexOf("actuel === 'prises' ? (");
  const bloc = APP.slice(d, APP.indexOf('</Suspense>', d));
  const repli = bloc.slice(bloc.indexOf('fallback={'), bloc.indexOf('}>\n', bloc.indexOf('fallback={')) + 1);
  assert.ok(repli.includes('<div className="o-prises-entete">') && repli.includes('{titreFiltre}</h2>'), 'la rangée et le titre');
  assert.ok(repli.includes('<span className="o-prises-compte" aria-hidden="true" style={{ fontSize: 12, fontWeight: 600 }}>{\'\\u00a0\'}</span>'),
    'un compte VIDE à la même police : une ligne de la même hauteur, sans rien dire');
  // Le titre du repli est celui de l'en-tête, à la lettre près.
  const style = "style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' }}";
  assert.ok(repli.includes(style));
  assert.ok(lire('src/enteteprises.jsx').includes('<h2 ' + style), 'le titre de l’en-tête');
});
