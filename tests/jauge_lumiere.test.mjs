/* La barre d'une lumière (chantier Lumières, L7, § 3.1, § 3.6) : `RmJauge`,
 * « votre modèle de barre », avec quatre réglages de plus — `min`, `eteinte`,
 * `zone`, `piste` — sans rien changer à ses autres emplois (un volet, un volume).
 *
 * `RmJauge` vit dans App.jsx, qui n'exporte que l'application : sous
 * `?jauge_lumiere`, un crochet de chargement lui ajoute un export. On la REND
 * (react-dom/server) pour son dessin, et on la JOUE (tests/crochets.mjs) pour
 * le geste : un doigt posé, glissé, levé. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { monter } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?jauge_lumiere')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?jauge_lumiere'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { RmJauge };' };",
  '}',
].join('\n')));
const { RmJauge } = await import(new URL('../src/App.jsx?jauge_lumiere', import.meta.url).href);
const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const rendre = (props) => renderToStaticMarkup(createElement(RmJauge, { label: 'Luminosité Lampe', onCommit: () => {}, couleur: 'rgb(255,169,87)', ...props }));
const largeur = (html) => (html.match(/data-fill="true" style="[^"]*width:([^;"]*)/) || [])[1];
const repere = (html) => (html.match(/data-knob="true" style="([^"]*)"/) || [])[1] || '';
const point = (html) => /border-radius:50%;background:var\(--o-text3\)/.test(html);

test('ses autres emplois ne changent pas : la jauge d’un volet, à 0 % comme à 100 %', () => {
  const volet = rendre({ v: 100, couleur: 'var(--o-purple)', grade: 'linear-gradient(90deg,rgba(var(--o-purple-rgb),.75),var(--o-purple))', label: 'Position Volet' });
  assert.equal(largeur(volet), 'calc((100% - 26px) * 1)');
  assert.ok(point(volet), 'à 100 %, le point de la fin reste : ce n’est pas une lampe');
  assert.ok(volet.includes('aria-valuemin="0"') && volet.includes('height:24px;border-radius:12px') && !volet.includes('height:44px'), 'ni zone ni minimum');
  assert.equal(largeur(rendre({ v: 0 })), 'calc((100% - 26px) * 0)');
});

test('L7 : allumée, le dégradé de sa teinte et le repère à la valeur ; le point de la fin sous 95 % seulement', () => {
  const allumee = rendre({ v: 45, min: 1, eteinte: false, zone: 44, grade: 'linear-gradient(90deg,rgb(255,208,163),rgb(255,169,87))' });
  assert.equal(largeur(allumee), 'calc((100% - 26px) * 0.45)');
  assert.ok(allumee.includes('background:linear-gradient(90deg,rgb(255,208,163),rgb(255,169,87))'), 'le remplissage est le dégradé de la teinte');
  assert.ok(repere(allumee).includes('background:rgb(255,169,87)') && repere(allumee).includes('left:calc((100% - 26px) * 0.45 + 6px)'), 'le repère, dans la teinte, à la valeur');
  assert.ok(point(allumee), 'sous 95 %, le point de la fin');
  assert.ok(!point(rendre({ v: 97, min: 1, eteinte: false })), 'à 95 % et plus, il s’efface');
  assert.ok(allumee.includes('role="slider"') && allumee.includes('aria-valuemin="1"') && allumee.includes('aria-valuemax="100"') && allumee.includes('aria-label="Luminosité Lampe"'));
  assert.ok(allumee.includes('display:flex;align-items:center;height:44px') && allumee.includes('height:24px;border-radius:12px'), 'une zone de 44 px, la piste de 24 au milieu');
  assert.equal(largeur(rendre({ v: 0, min: 1, eteinte: false })), 'calc((100% - 26px) * 0.01)', 'jamais sous 1 % : on éteint par la bascule');
});

test('L7 : éteinte, pas de remplissage, le repère gris au dernier niveau ; sans niveau connu, pas de repère', () => {
  const memoire = rendre({ v: 80, min: 1, eteinte: true });
  assert.equal(largeur(memoire), '0');
  assert.ok(repere(memoire).includes('background:var(--o-text3)') && repere(memoire).includes('left:calc((100% - 26px) * 0.8 + 6px)'));
  assert.ok(memoire.includes('aria-valuenow="80"'));
  const sans = rendre({ v: null, min: 1, eteinte: true });
  assert.ok(repere(sans).includes('opacity:0'), 'aucun niveau connu : le repère ne se montre pas');
  /* ASSERTION MODIFIÉE (chantier Lumières, 9 bis A, points 4 et 16) : la barre ne disait pas sa valeur sans niveau connu, et ARIA 1.2 exige
   * `aria-valuenow` d'un `role="slider"`. Elle le pose toujours — le minimum faute de niveau — et `aria-valuetext` dit l'état : « Éteinte ». */
  assert.ok(sans.includes('aria-valuenow="1"') && sans.includes('aria-valuetext="Éteinte"'), 'sans niveau : le minimum, et « Éteinte » : ' + sans.slice(0, 260));
});

test('points 4 et 16 : une barre éteinte dit son état au lecteur d’écran — « Éteinte · 80 % » ; allumée, « 45 % » ; la valeur est toujours posée', () => {
  const lire = (html, attribut) => (html.match(new RegExp(attribut + '="([^"]*)"')) || [])[1];
  assert.equal(lire(rendre({ v: 80, min: 1, eteinte: true }), 'aria-valuetext'), 'Éteinte · 80 %', 'éteinte, le dernier niveau connu — pas « 80 % » seul, qui l’annoncerait allumée');
  assert.equal(lire(rendre({ v: 80, min: 1, eteinte: true }), 'aria-valuenow'), '80');
  assert.equal(lire(rendre({ v: null, min: 1, eteinte: true }), 'aria-valuetext'), 'Éteinte', 'niveau inconnu : l’état seul');
  assert.equal(lire(rendre({ v: null, min: 1, eteinte: true }), 'aria-valuenow'), '1', 'et la valeur, le minimum (ARIA 1.2)');
  assert.equal(lire(rendre({ v: 45, min: 1, eteinte: false }), 'aria-valuetext'), '45 %', 'allumée : sa valeur, rien de plus');
  assert.equal(lire(rendre({ v: 45, min: 1, eteinte: false }), 'aria-valuenow'), '45');
  // Les autres emplois (un volet, un volume) : ni état, ni valeur de repli — leur sortie est celle d’avant.
  const volet = rendre({ v: 100, couleur: 'var(--o-purple)', label: 'Position Volet' });
  assert.equal(lire(volet, 'aria-valuetext'), '100 %');
  assert.equal(lire(volet, 'aria-valuenow'), '100');
  assert.equal(lire(rendre({ v: 0 }), 'aria-valuenow'), '0');
  assert.ok(!rendre({ v: 0 }).includes('Éteinte'), 'un volet fermé n’est pas « éteint »');
  assert.equal(rendre({ v: 40, eteinte: true, actif: false }).includes('role="slider"'), false, 'inactive, la barre n’est qu’un dessin : aucun rôle, donc aucune valeur à dire');
});

test('points 4 et 16 : `kbSlider` — `aria-valuenow` toujours posé (la valeur, sinon le minimum), l’état en `aria-valuetext` ; ses autres emplois ne changent pas', async () => {
  const { kbSlider } = await import('../src/ui.jsx');
  const sans = (o) => { const { onKeyDown, ...reste } = o; return reste; };
  // Les emplois d’avant (volume, position d’un morceau, scènes, volets, thermostats) : une valeur connue, pas d’état — la sortie est inchangée.
  assert.deepEqual(sans(kbSlider('Volume', 40, () => {})), { role: 'slider', tabIndex: 0, 'aria-label': 'Volume', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 40, 'aria-valuetext': '40 %' });
  assert.deepEqual(sans(kbSlider('Luminosité des scènes', 12.5, () => {}, { min: 5, max: 100, step: 5 })), { role: 'slider', tabIndex: 0, 'aria-label': 'Luminosité des scènes', 'aria-valuemin': 5, 'aria-valuemax': 100, 'aria-valuenow': 12.5, 'aria-valuetext': '12,5 %' });
  assert.deepEqual(sans(kbSlider('Teinte', 275, () => {}, { min: 0, max: 360, step: 5, unit: '°' })), { role: 'slider', tabIndex: 0, 'aria-label': 'Teinte', 'aria-valuemin': 0, 'aria-valuemax': 360, 'aria-valuenow': 275, 'aria-valuetext': '275 °' });
  assert.equal(kbSlider('x', 0, () => {})['aria-valuenow'], 0, 'zéro est une valeur');
  // Sans valeur : le minimum, jamais un attribut absent — et l’état, seul.
  assert.equal(kbSlider('x', null, () => {}, { min: 1 })['aria-valuenow'], 1);
  assert.equal(kbSlider('x', undefined, () => {}, { min: 2000, max: 6500, unit: 'K' })['aria-valuenow'], 2000);
  assert.equal(kbSlider('x', null, () => {}, { min: 1 })['aria-valuetext'], undefined, 'sans état, rien à dire de plus que le minimum');
  assert.equal(kbSlider('x', null, () => {}, { min: 1, etat: 'Éteinte' })['aria-valuetext'], 'Éteinte');
  assert.equal(kbSlider('x', 80, () => {}, { min: 1, etat: 'Éteinte' })['aria-valuetext'], 'Éteinte · 80 %');
  // Le clavier ne change pas : une valeur inconnue part du minimum.
  const envoyes = [];
  kbSlider('x', null, (n) => envoyes.push(n), { min: 1, step: 5 }).onKeyDown({ key: 'ArrowRight', preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(envoyes, [5], 'flèche droite depuis le minimum : 1 + 5 arrondi au pas');
});

test('§ 3.6 : dans la fiche, une zone de 52 px, une piste de 32, un repère de 4 px, un point de 5', () => {
  const fiche = rendre({ v: 60, min: 1, eteinte: false, zone: 52, piste: 32, marge: 8 });
  assert.ok(fiche.includes('height:52px') && fiche.includes('height:32px;border-radius:16px'));
  assert.ok(repere(fiche).includes('top:7px;bottom:7px;width:4px'));
  assert.ok(fiche.includes('top:13.5px;width:5px;height:5px'));
});

/* Un élément du DOM, en petit : sa boîte, ses classes, la capture du doigt, et les deux enfants que la jauge peint. */
function cible(largeurPx = 226) {
  const fill = { style: {} }, knob = { style: {} };
  const el = { fill, knob, classes: new Set(), getBoundingClientRect: () => ({ left: 100, width: largeurPx }), setPointerCapture() {},
    classList: { add: (c) => el.classes.add(c), remove: (c) => el.classes.delete(c) },
    querySelector: (s) => (s === '[data-fill]' ? fill : s === '[data-knob]' ? knob : null) };
  return el;
}
const evt = (el, clientX) => ({ currentTarget: el, clientX, pointerId: 1, stopPropagation() {}, preventDefault() {} });

test('L7 : glisser sur une lampe éteinte l’allume au niveau visé — au relâcher, pas avant ; jamais sous 1 %', () => {
  const envoyes = [];
  const m = monter(RmJauge, { v: 80, min: 1, eteinte: true, zone: 44, couleur: 'var(--o-lampe)', label: 'Luminosité Lampe', onCommit: (n) => envoyes.push(n) });
  const el = cible();
  m.arbre.props.onPointerDown(evt(el, 100 + 60));
  assert.equal(el.fill.style.width, 'calc((100% - 26px) * 0.3)', 'le remplissage paraît sous le doigt');
  assert.equal(el.knob.style.opacity, '1');
  el.onpointermove(evt(el, 100 + 120));
  assert.deepEqual(envoyes, [], 'rien ne part pendant le geste');
  el.onpointerup();
  assert.deepEqual(envoyes, [60], 'au relâcher, UNE commande : 60 %');
  m.arbre.props.onPointerDown(evt(el, 100 - 50));
  el.onpointerup();
  assert.deepEqual(envoyes, [60, 1], 'tout à gauche : 1 %, pas 0');
});

test('le doigt qui s’en va (`pointercancel`) rend la jauge telle qu’elle était, éteinte comprise', () => {
  const envoyes = [];
  const m = monter(RmJauge, { v: null, min: 1, eteinte: true, couleur: 'var(--o-lampe)', onCommit: (n) => envoyes.push(n) });
  const el = cible();
  m.arbre.props.onPointerDown(evt(el, 150));
  el.onpointercancel();
  assert.deepEqual([el.fill.style.width, el.knob.style.opacity, envoyes], ['0px', '0', []]);
});

test('la jauge garde sa hauteur d’avant et son dessin ; sa raison est écrite', () => {
  const j = APP.indexOf('function RmJauge(');
  const jauge = APP.slice(j, APP.indexOf('\n}', j));
  /* ASSERTION MODIFIÉE (chantier Mode enfant, tâche 4 ; E7, E15) : la jauge gagne deux réglages de plus, `plafond` (la borne haute du
   * mode enfant, null : aucune) et `pas` (le pas du geste, 1) — sans eux, rien ne change : ni minimum, ni lampe, ni zone, 24 px. */
  assert.ok(jauge.includes("min = 0, eteinte = null, zone = 0, piste = 24, plafond = null, pas = 1 }) {"), 'sans réglage, ni minimum, ni lampe, ni zone, ni plafond, 24 px');
  // Seconde tranche des lumières, B11 : un réglage de plus, `rafale` (le clavier différé des lumières), à côté d'`onGlisse` — sans lui, rien ne change.
  assert.ok(jauge.includes("onGlisse = null, rafale = false,"), 'la rafale est un réglage de la jauge, faux par défaut');
  assert.ok(APP.includes('Une LUMIÈRE (chantier Lumières, L7) y passe quatre réglages de plus'));
});

/* ── Passe de finition 11 bis, R1 : faire défiler au téléphone n'allume jamais une lampe ──────────────
 *
 * La barre portait `touch-action: none` : le doigt posé dessus pour FAIRE DÉFILER la page ne la faisait
 * pas défiler — le navigateur ne cédait rien —, et au relâcher `light.turn_on brightness_pct=<x>` partait.
 * Le défaut existait sur 24 px ; il pèse plus sur 44 px dans la carte et 52 dans la fiche, et les barres d'un
 * volet et du volume ont la même. Avec `pan-y`, un geste vertical est celui de la page : le navigateur
 * l'annule (`pointercancel`), et la jauge, qui rend alors son dessin d'avant, n'envoie rien. */
const touchAction = (html) => (html.match(/touch-action:([a-z-]+)/) || [])[1];

test('11 bis, R1 : la barre laisse la page défiler — `touch-action: pan-y` pour TOUS ses emplois, la zone de 44 px, celle de 52 de la fiche, un volet, un volume, et inerte', () => {
  const emplois = {
    'carte de lumière (zone 44)': { v: 45, min: 1, eteinte: false, zone: 44 },
    'carte de lumière éteinte (zone 44)': { v: 80, min: 1, eteinte: true, zone: 44 },
    'fiche (zone 52, piste 32)': { v: 60, min: 1, eteinte: false, zone: 52, piste: 32, marge: 0 },
    'volet (sans zone)': { v: 100, couleur: 'var(--o-purple)', label: 'Position Volet' },
    'volume (sans zone)': { v: 35, couleur: 'var(--o-rose)', label: 'Volume Salon' },
    'inerte (une lampe muette, un dessin)': { v: 40, min: 1, eteinte: false, zone: 44, actif: false },
  };
  for (const [nom, props] of Object.entries(emplois)) {
    const html = rendre(props);
    assert.equal(touchAction(html), 'pan-y', nom + ' : le défilement vertical reste à la page — ' + html.slice(0, 200));
    assert.ok(!html.includes('touch-action:none'), nom + ' : plus de `touch-action: none`, qui avalait le geste de défilement');
  }
  // Une seule règle pour tous : elle se lit dans le code, avec sa raison.
  const j = APP.indexOf('function RmJauge(');
  const corps = APP.slice(j, APP.indexOf('\n}', j));
  assert.ok(corps.includes("touchAction: 'pan-y'") && !corps.includes("touchAction: 'none'"), 'RmJauge : `pan-y`, jamais `none`');
});

test('11 bis, R1 : un geste vertical annulé (`pointercancel`) n’envoie AUCUN ordre — une lampe allumée comme éteinte, un volet — et la barre se rend telle qu’elle était', () => {
  const envoyes = [];
  const cas = [
    ['allumée à 45 %', { v: 45, min: 1, eteinte: false, zone: 44 }, 'calc((100% - 26px) * 0.45)', '1'],
    ['éteinte, repère gris à 80 %', { v: 80, min: 1, eteinte: true, zone: 44 }, '0px', '1'],
    ['éteinte, niveau inconnu', { v: null, min: 1, eteinte: true, zone: 44 }, '0px', '0'],
    ['un volet à 100 %', { v: 100, couleur: 'var(--o-purple)' }, 'calc((100% - 26px) * 1)', '1'],
  ];
  for (const [nom, props, largeurAvant, opaciteAvant] of cas) {
    const m = monter(RmJauge, { couleur: 'var(--o-lampe)', label: 'Luminosité Lampe', onCommit: (n) => envoyes.push(n), ...props });
    const el = cible();
    m.arbre.props.onPointerDown(evt(el, 100 + 20));          // le pouce se pose sur la barre…
    el.onpointermove(evt(el, 100 + 21));                       // …et la page commence à défiler : un souffle de côté
    el.onpointercancel();                                      // le navigateur reprend le geste : `pointercancel`
    assert.deepEqual(envoyes, [], nom + ' : rien ne part');
    assert.equal(el.fill.style.width, largeurAvant, nom + ' : le remplissage retrouve son niveau d’avant');
    assert.equal(el.knob.style.opacity, opaciteAvant, nom + ' : et le repère sa visibilité');
    assert.deepEqual([el.onpointerup, el.onpointermove, el.onpointercancel], [null, null, null], nom + ' : plus aucun écouteur — un `pointerup` qui arriverait après ne commanderait rien');
    assert.ok(!el.classes.has('o-sliding'), nom + ' : la barre ne reste pas « en train de glisser »');
  }
  // Le contraire, pour que le test ait des dents : un doigt qui reste et se lève, lui, commande — une fois.
  const m = monter(RmJauge, { v: 45, min: 1, eteinte: false, zone: 44, couleur: 'var(--o-lampe)', onCommit: (n) => envoyes.push(n) });
  const el = cible();
  m.arbre.props.onPointerDown(evt(el, 100 + 60));
  el.onpointerup();
  assert.deepEqual(envoyes, [30], 'un geste mené au bout envoie son niveau, une fois : (160 − 100) / (226 − 26) = 30 %');
});
