/* La borne haute de la barre (chantier Mode enfant, tâche 4 ; E7, E15 ; § 6.1) : `RmJauge` reçoit `plafond` — la zone hachurée
 * du plafond à 100, le trait de 2 px, le cadenas au milieu de la zone quand le plafond est à 80 % ou moins, `aria-valuemax` au
 * plafond, et le GESTE borné : ni le doigt ni le clavier ne dépassent. Et `pas`, le pas du geste (5 dans la feuille des réglages).
 * Ses autres emplois — un volet, une lumière, un volume sans profil — ne changent pas : sans `plafond`, rien de tout cela n'est
 * dessiné. `RmJauge` vit dans App.jsx, qui n'exporte que l'application : sous `?jauge_plafond`, un crochet de chargement lui
 * ajoute un export. */
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
  "  if (!url.endsWith('/src/App.jsx?jauge_plafond')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?jauge_plafond'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { RmJauge };' };",
  '}',
].join('\n')));
const { RmJauge } = await import(new URL('../src/App.jsx?jauge_plafond', import.meta.url).href);

const rendre = (props) => renderToStaticMarkup(createElement(RmJauge, { label: 'Volume Echo Dot', onCommit: () => {}, couleur: 'var(--o-accent)', ...props }));
// ASSERTION MODIFIÉE (passe bis du 17/10, point 14) : la zone porte la classe `o-jauge-plafond` — le motif hachuré vit dans la feuille (index.css), pas en ligne.
const zone = (html) => (html.match(/data-plafond="true" class="o-jauge-plafond" style="([^"]*)"/) || [])[1];
const trait = (html) => (html.match(/data-trait="true" style="([^"]*)"/) || [])[1];
const lire = (html, attribut) => (html.match(new RegExp(attribut + '="([^"]*)"')) || [])[1];
const cadenas = (html) => /fi fi-rr-lock/.test(html);

test('E15, § 6.1 : avec un plafond à 40, la zone hachurée de 40 à 100, le trait de 2 px, le cadenas, `aria-valuemax` au plafond ; le remplissage reste à la valeur', () => {
  const html = rendre({ v: 30, plafond: 40 });
  assert.ok(zone(html), 'la zone hachurée');
  assert.ok(zone(html).includes('left:calc((100% - 26px) * 0.4 + 6px)') && zone(html).includes('right:0'), 'du plafond à la fin de la piste : ' + zone(html));
  // ASSERTION MODIFIÉE (passe bis du 17/10, point 14) : le motif de la maquette, dans les jetons du thème, vit dans la feuille sous la classe de la zone.
  assert.ok(!zone(html).includes('repeating-linear-gradient'), 'le motif a quitté le style en ligne : ' + zone(html));
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.ok(css.includes('.o-jauge-plafond { background: repeating-linear-gradient(135deg, color-mix(in oklab, var(--o-text3) 32%, transparent) 0 3px, transparent 3px 8px); }'), 'le motif de la maquette, dans les jetons du thème, dans index.css');
  assert.ok(trait(html).includes('width:2px') && trait(html).includes('left:calc((100% - 26px) * 0.4 + 6px)') && trait(html).includes('background:var(--o-text3)'), 'le trait de 2 px au plafond : ' + trait(html));
  assert.ok(cadenas(html), 'le cadenas, à 80 % ou moins');
  assert.equal(lire(html, 'aria-valuemax'), '40');
  assert.equal(lire(html, 'aria-valuenow'), '30');
  assert.ok(html.includes('data-fill="true" style="position:absolute;left:0;top:0;bottom:0;width:calc((100% - 26px) * 0.3)'), 'le remplissage, à la valeur');
  // Un volume que le serveur n'a pas encore ramené : la valeur se dessine telle qu'elle est lue, au-delà du plafond.
  assert.ok(rendre({ v: 70, plafond: 40 }).includes('width:calc((100% - 26px) * 0.7)'), 'la carte ne ment pas : 70 se dessine à 70, la maison ramène');
});

test('§ 6.1 : le cadenas disparaît au-dessus de 80 % ; à 100, ni zone ni trait ; sans plafond, rien de tout cela (ses autres emplois ne changent pas)', () => {
  const haut = rendre({ v: 30, plafond: 90 });
  assert.ok(zone(haut) && trait(haut), 'à 90, la zone et le trait');
  assert.ok(!cadenas(haut), 'à 90, pas de cadenas : la zone est trop étroite pour lui');
  assert.equal(lire(haut, 'aria-valuemax'), '90');
  const plein = rendre({ v: 30, plafond: 100 });
  assert.ok(!zone(plein) && !trait(plein) && !cadenas(plein), 'un plafond à 100 n’en est pas un');
  assert.equal(lire(plein, 'aria-valuemax'), '100');
  const sans = rendre({ v: 30 });
  assert.ok(!zone(sans) && !trait(sans) && !cadenas(sans) && !sans.includes('data-plafond'), 'sans plafond : la barre d’avant');
  assert.equal(lire(sans, 'aria-valuemax'), '100');
  const volet = rendre({ v: 100, couleur: 'var(--o-purple)', label: 'Position Volet' });
  assert.ok(volet.includes('width:calc((100% - 26px) * 1)') && !volet.includes('data-plafond'));
  const lampe = rendre({ v: 45, min: 1, eteinte: false, zone: 44 });
  assert.ok(lampe.includes('aria-valuemin="1"') && lampe.includes('aria-valuemax="100"') && !lampe.includes('data-plafond'));
});

test('E7 : le clavier ne dépasse pas le plafond — Fin va au plafond, la flèche s’arrête dessus ; le pas du geste (`pas`) arrondit', () => {
  const envoyes = [];
  const touche = (props, key) => monter(RmJauge, { label: 'Volume', couleur: 'x', onCommit: (n) => envoyes.push(n), ...props }).arbre.props.onKeyDown({ key, preventDefault() {}, stopPropagation() {} });
  touche({ v: 30, plafond: 40 }, 'End');
  touche({ v: 38, plafond: 40 }, 'ArrowRight');
  touche({ v: 30, plafond: 40 }, 'PageUp');
  touche({ v: 30 }, 'End');
  assert.deepEqual(envoyes, [40, 40, 40, 100], 'Fin : le plafond ; 38 + 5 : 40 ; 30 + 10 : 40 ; sans plafond, 100');
  envoyes.length = 0;
  touche({ v: 40, min: 10, pas: 5 }, 'ArrowLeft');
  touche({ v: 12, min: 10, pas: 5 }, 'ArrowLeft');
  touche({ v: 40, min: 10, pas: 5 }, 'Home');
  assert.deepEqual(envoyes, [35, 10, 10], 'le pas de 5 (la feuille des réglages), borné au minimum de 10');
});

test('E7 : le doigt ne dépasse pas le plafond — un geste à 95 % de la piste relâche au plafond ; sans plafond, à 95 ; avec `pas`, arrondi au pas', () => {
  const glisser = (props, clientX, largeur = 226) => {
    const envoyes = [];
    const m = monter(RmJauge, { label: 'Volume', couleur: 'x', onCommit: (n) => envoyes.push(n), ...props });
    const el = { querySelector: () => null, getBoundingClientRect: () => ({ left: 0, width: largeur }), classList: { add() {}, remove() {} }, setPointerCapture() {}, onpointermove: null, onpointerup: null, onpointercancel: null };
    m.arbre.props.onPointerDown({ stopPropagation() {}, preventDefault() {}, currentTarget: el, clientX, pointerId: 1 });
    el.onpointerup();
    return envoyes;
  };
  // (226 − 26) px de piste utile : 190 px font 95 %, 100 px font 50 %, 103 px font 51,5 → 52.
  assert.deepEqual(glisser({ v: 30, plafond: 40 }, 190), [40], 'au-delà du plafond, le geste s’arrête dessus');
  assert.deepEqual(glisser({ v: 30 }, 190), [95], 'sans plafond, le geste d’avant');
  assert.deepEqual(glisser({ v: 30, plafond: 40 }, 60), [30], 'sous le plafond, la valeur du doigt');
  assert.deepEqual(glisser({ v: 30, plafond: 60, pas: 5 }, 103), [50], 'le pas de 5 arrondit 52 à 50');
  assert.deepEqual(glisser({ v: 30, min: 10, pas: 5 }, 4), [10], 'le minimum tient');
  // Le geste d'un doigt sur la zone hachurée s'arrête lui aussi au plafond (`touchAction: pan-y` : un geste vertical reste celui de la page).
  const html = rendre({ v: 30, plafond: 40, zone: 44 });
  assert.ok(html.includes('touch-action:pan-y'), 'pan-y, jamais none (revue du 14/10, R1)');
});

/* TEST AJOUTÉ (passe bis 2 du 17/10, point 1 ; « quand je règle le volume, le pourcentage ne suit pas comme sur la maquette ») : `onGlisse`.
 * Le chiffre qui accompagne la barre suit le doigt : la valeur sous le doigt — au pas, jamais au-delà du plafond —, une fois par valeur,
 * puis `null` quand le doigt s'en va. Elle ne commande rien : l'ordre part UNE fois, par `onCommit`, au relâcher, et AVANT le `null` (le
 * chiffre ne repasse jamais par l'ancienne valeur). Sans elle, la barre est celle d'avant. */
test('passe bis 2, point 1 : `onGlisse` suit le doigt — la valeur bornée, une fois par valeur, `null` quand il s’en va ; l’ordre part une fois, au relâcher, AVANT le `null`', () => {
  const journal = [];
  const poser = (props, clientX = 100) => {
    journal.length = 0;
    const m = monter(RmJauge, { label: 'Volume', couleur: 'x', onCommit: (n) => journal.push('commit ' + n), onGlisse: (n) => journal.push('glisse ' + n), ...props });
    const el = { querySelector: () => null, getBoundingClientRect: () => ({ left: 0, width: 226 }), classList: { add() {}, remove() {} }, setPointerCapture() {}, onpointermove: null, onpointerup: null, onpointercancel: null };
    m.arbre.props.onPointerDown({ stopPropagation() {}, preventDefault() {}, currentTarget: el, clientX, pointerId: 1 });
    return el;
  };
  // (226 − 26) px de piste utile : 100 px font 50 %, 120 px font 60 %, 121 px font 60,5 → 61, 190 px font 95 %.
  const el = poser({ v: 30 });
  assert.deepEqual(journal, ['glisse 50'], 'posé sur la barre : la valeur sous le doigt, tout de suite');
  el.onpointermove({ clientX: 100 });
  assert.deepEqual(journal, ['glisse 50'], 'le doigt ne bouge pas : rien de plus (une fois par valeur)');
  el.onpointermove({ clientX: 120 }); el.onpointermove({ clientX: 121 }); el.onpointermove({ clientX: 190 });
  assert.deepEqual(journal, ['glisse 50', 'glisse 60', 'glisse 61', 'glisse 95'], 'chaque valeur nouvelle, dans l’ordre, et aucun ordre n’est parti');
  el.onpointerup();
  assert.deepEqual(journal.slice(4), ['commit 95', 'glisse null'], 'au relâcher : l’ordre d’abord, puis le doigt s’en va');
  // Le plafond : la valeur annoncée ne le dépasse jamais, quel que soit le doigt.
  const e2 = poser({ v: 30, plafond: 40 });
  e2.onpointermove({ clientX: 190 }); e2.onpointermove({ clientX: 225 }); e2.onpointermove({ clientX: 60 });
  e2.onpointerup();
  assert.deepEqual(journal, ['glisse 40', 'glisse 30', 'commit 30', 'glisse null'], 'à 50 %, 95 % et 100 % de la piste : 40, une seule fois');
  assert.ok(journal.every(x => !/glisse (4[1-9]|[5-9]\d|100)$/.test(x)), 'jamais au-delà du plafond');
  // Le pas du geste (5 dans la feuille des réglages) : les valeurs annoncées sont celles qui seraient posées.
  const e3 = poser({ v: 30, min: 10, pas: 5 }, 103);
  e3.onpointermove({ clientX: 105 }); e3.onpointermove({ clientX: 4 });
  e3.onpointerup();
  assert.deepEqual(journal, ['glisse 50', 'glisse 55', 'glisse 10', 'commit 10', 'glisse null'], 'le pas de 5, le minimum de 10');
  // Le doigt qui s'en va sans relâcher (`pointercancel`, un geste vertical : la page défile) : le chiffre revient, aucun ordre ne part.
  const e4 = poser({ v: 30 });
  e4.onpointermove({ clientX: 120 });
  e4.onpointercancel();
  assert.deepEqual(journal, ['glisse 50', 'glisse 60', 'glisse null'], 'annulé : `null`, et pas de `commit`');
  // Un ordre qui échoue ne laisse pas le chiffre accroché au doigt.
  const e5 = poser({ v: 30, onCommit: () => { throw new Error('refusé'); } });
  assert.throws(() => e5.onpointerup(), /refusé/);
  assert.deepEqual(journal, ['glisse 50', 'glisse null']);
  // Inerte, la barre n'est qu'un dessin ; sans `onGlisse`, la barre d'avant.
  const e6 = poser({ v: 30, actif: false });
  assert.equal(e6.onpointerup, null);
  assert.deepEqual(journal, []);
  const seul = [];
  const m = monter(RmJauge, { v: 30, label: 'Volume', couleur: 'x', onCommit: (n) => seul.push(n) });
  const e7 = { querySelector: () => null, getBoundingClientRect: () => ({ left: 0, width: 226 }), classList: { add() {}, remove() {} }, setPointerCapture() {}, onpointermove: null, onpointerup: null, onpointercancel: null };
  m.arbre.props.onPointerDown({ stopPropagation() {}, preventDefault() {}, currentTarget: e7, clientX: 100, pointerId: 1 });
  e7.onpointerup();
  assert.deepEqual(seul, [50], 'sans `onGlisse` : le geste d’avant');
  assert.ok(rendre({ v: 30, plafond: 40, zone: 44, onGlisse() {} }).includes('touch-action:pan-y'), 'pan-y, jamais none : un geste vertical reste celui de la page');
});

/* TEST AJOUTÉ (passe bis 3 du 17/10, point 1 ; sa demande, « quand je regle le volume, le pourcentage ne suis pas comme sur la maquette ») :
 * pas de chiffre fantôme. Une barre qui s'en va sous le doigt — le pied d'une Echo devenue indisponible — ne reçoit jamais le relâcher (il
 * tombe sur un élément détaché) : `onGlisse(null)` ne partait pas, et l'appelant gardait la valeur du doigt. Démontée, elle lâche le doigt ;
 * devenue inerte (une lampe qui tombe en panne), aussi, et elle reprend le dessin de MAINTENANT. Aucun ordre ne part, et un relâcher qui
 * arriverait ensuite ne commande rien. */
test('passe bis 3, point 1 : démontée ou devenue inerte sous le doigt, la barre le lâche — `onGlisse(null)`, aucun ordre, plus aucun écouteur', () => {
  const journal = [];
  const cible = () => {
    const fill = { style: {} }, knob = { style: {} };
    return { fill, knob, querySelector: (s) => (s === '[data-fill]' ? fill : s === '[data-knob]' ? knob : null), getBoundingClientRect: () => ({ left: 0, width: 226 }),
      classList: { add() {}, remove() {} }, setPointerCapture() {}, onpointermove: null, onpointerup: null, onpointercancel: null };
  };
  // (226 − 26) px de piste utile : 100 px font 50 %, 160 px font 80 %.
  const poser = (props) => {
    journal.length = 0;
    const m = monter(RmJauge, { label: 'Volume', couleur: 'x', onCommit: (n) => journal.push('commit ' + n), onGlisse: (n) => journal.push('glisse ' + n), ...props });
    const el = cible();
    m.arbre.props.onPointerDown({ stopPropagation() {}, preventDefault() {}, currentTarget: el, clientX: 100, pointerId: 1 });
    el.onpointermove({ clientX: 160 });
    return { m, el };
  };
  // Démontée sous le doigt (la carte retire son pied) : le doigt est lâché, rien ne part, plus aucun écouteur.
  const a = poser({ v: 35 });
  assert.deepEqual(journal, ['glisse 50', 'glisse 80']);
  a.m.demonter();
  assert.deepEqual(journal, ['glisse 50', 'glisse 80', 'glisse null'], 'démontée : le doigt est lâché, et aucun ordre ne part');
  assert.deepEqual([a.el.onpointerup, a.el.onpointermove, a.el.onpointercancel], [null, null, null], 'un relâcher tombé ensuite ne commanderait rien');
  // Un geste mené au bout ne laisse rien à lâcher : démontée ensuite, la barre se tait.
  const b = poser({ v: 35 });
  b.el.onpointerup();
  b.m.demonter();
  assert.deepEqual(journal, ['glisse 50', 'glisse 80', 'commit 80', 'glisse null'], 'relâchée puis démontée : un seul ordre, un seul `null`');
  // Devenue inerte sous le doigt (une lampe tombée en panne) : lâché, sans ordre, au dessin de maintenant — éteinte, le repère à 45.
  const c = poser({ v: 45, min: 1, eteinte: false, zone: 44 });
  assert.equal(c.el.fill.style.width, 'calc((100% - 26px) * 0.8)', 'le doigt peint la barre');
  c.m.proprietes({ actif: false, eteinte: true });
  assert.deepEqual(journal, ['glisse 50', 'glisse 80', 'glisse null'], 'inerte : lâché, sans ordre');
  assert.deepEqual([c.el.fill.style.width, c.el.knob.style.left, c.el.knob.style.opacity], ['0px', 'calc((100% - 26px) * 0.45 + 6px)', '1'], 'le dessin de MAINTENANT, pas celui du geste');
  assert.deepEqual([c.el.onpointerup, c.el.onpointermove, c.el.onpointercancel], [null, null, null]);
  c.m.demonter();
  assert.equal(journal.length, 3, 'démontée ensuite : plus rien à lâcher');
  // Sans `onGlisse` (la barre d'un volet) : la même sûreté, rien ne part.
  const envoyes = [];
  const volet = monter(RmJauge, { v: 100, label: 'Position Volet', couleur: 'x', onCommit: (n) => envoyes.push(n) });
  const ev = cible();
  volet.arbre.props.onPointerDown({ stopPropagation() {}, preventDefault() {}, currentTarget: ev, clientX: 100, pointerId: 1 });
  volet.demonter();
  assert.deepEqual([envoyes, ev.onpointerup], [[], null], 'un volet démonté sous le doigt ne bouge pas');
});
