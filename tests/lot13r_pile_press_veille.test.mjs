/* Relecture du lot 13 de l'audit du 03/10 (04/10) : trois gestes que la
 * surface (`Surface`, ui.jsx) avait recouverts ou coupés.
 *
 *   - le repère de pile d'un capteur : la surface passait au-dessus de lui,
 *     et sa bulle « Pile 80 % » ne s'affichait plus au survol ;
 *   - l'intertitre qu'on saisit en édition : sans `role="button"`, il avait
 *     perdu la transition des boutons — l'enfoncement tombait d'un coup ;
 *   - la veille : l'horloge, la météo et le diaporama recouvraient la
 *     surface, et l'écoute haptique de l'App ne trouvait plus de bouton sous
 *     le doigt — plus de vibration au réveil. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composant, rendre } from './rendu.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const app = lire('src', 'App.jsx');
const css = lire('src', 'index.css');
const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);

/** Le corps d'une fonction de premier niveau d'App.jsx. */
function fonction(nom) {
  const d = app.indexOf(NL + 'function ' + nom + '(');
  assert.ok(d >= 0, nom + ' introuvable');
  return app.slice(d, app.indexOf(NL + '}' + NL, d) + 2);
}

/** La balise ouvrante qui commence en `d` : accolades, chaînes et
 *  commentaires sautés. */
function balise(s, d) {
  let p = 0;
  for (let k = d; k < s.length; k++) {
    const c = s[k];
    if (c === '/' && s[k + 1] === '/') { k = s.indexOf(NL, k); continue; }
    if (c === '/' && s[k + 1] === '*') { k = s.indexOf('*/', k) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { for (k++; k < s.length && s[k] !== c; k++) if (s[k] === BS) k++; continue; }
    if (c === '{') p++;
    else if (c === '}') p--;
    else if (c === '>' && p === 0) return s.slice(d, k + 1);
  }
  return s.slice(d);
}

test('le repère de pile passe au-dessus de la surface : sa bulle s’affiche, son clic ouvre la fiche', () => {
  const p = fonction('PileRepere');
  const span = balise(p, p.indexOf('<span'));
  assert.ok(span.includes("title={tr('Pile') + ' ' + n + ' %'}"), 'la bulle « Pile N % »');
  // Non positionné, il est peint SOUS la surface (absolue) : c'est elle qui
  // prend le survol, et elle n'a pas de bulle.
  assert.ok(span.includes("position: 'relative'"), 'la surface recouvre le repère : sa bulle ne s’affiche plus');
  // Au-dessus d'elle, il prend aussi le clic : il le relaie vers la fiche.
  assert.ok(span.includes('onClick={onOuvrir || undefined}'), 'le repère devient un coin mort de la carte');
  assert.ok(!span.includes('pointerEvents'), '`none` perdrait la bulle ; `auto` percerait l’inertie du mode édition');
  assert.ok(fonction('RoomGenericCard').includes('<PileRepere n={pile} onOuvrir={ouvrable ? () => onOpen(id) : null} />'),
    'la carte lui passe le geste de sa surface, et rien quand elle ne s’ouvre pas');
});

test('l’intertitre qu’on saisit s’enfonce avec le rebond des boutons, sauf en mouvement réduit', () => {
  assert.ok(css.includes('.o-pointille { transition: transform .16s cubic-bezier(.34, 1.45, .56, 1); }'), 'la transition des boutons, que `[role="button"]` lui donnait');
  assert.ok(/@media \(prefers-reduced-motion: reduce\) \{\s*\.o-pointille:active, \[data-sec\]:has\(> \.o-surface\):active \{ transform: none; \}\s*\.o-pointille \{ transition: none; \}\s*\}/.test(css), 'le mouvement réduit coupe aussi la transition');
  assert.ok(css.indexOf('.o-pointille { transition: transform') < css.indexOf('.o-pointille { transition: none; }'), 'la règle du mouvement réduit vient après, et l’emporte');
  // La racine plate d'EditableCard n'a pas de transition en ligne : la classe s'applique.
  const d = app.indexOf('className="o-pointille" style={{');
  assert.ok(d >= 0, 'la racine plate a changé de forme');
  const style = app.slice(d, app.indexOf('}}>', d));
  assert.ok(!style.includes('transition'), 'une transition en ligne masquerait celle de la classe');
});

/* Chaque balise ouvrante du HTML statique, avec sa valeur EFFECTIVE de
 * `pointer-events` (héritée) et si elle est dans une scène. */
const VIDES = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function pointeurs(html) {
  const pile = [], out = [];
  for (const [, ferme, nom, attrs, auto] of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    if (ferme) { pile.pop(); continue; }
    const parent = pile[pile.length - 1] || { pe: 'auto', scene: false };
    const style = (attrs.match(/style="([^"]*)"/) || [])[1] || '';
    const pe = (style.match(/pointer-events:\s*([a-z]+)/) || [])[1] || parent.pe;
    const scene = parent.scene || (nom === 'button' && !attrs.includes('o-surface'));
    out.push({ nom, attrs, pe, scene });
    if (!auto && !VIDES.has(nom)) pile.push({ pe, scene });
  }
  return out;
}

test('la veille : tout toucher hors des scènes atteint la surface, les scènes restent vivantes', async () => {
  const AmbientOverlay = await composant('ecranveille.jsx', 'AmbientOverlay');
  const html = rendre(AmbientOverlay, {
    wx: 'clouds', wxFx: false, weatherTemp: 12, weatherLabel: 'Nuageux', inTemp: 20.5, lightsOn: 2,
    notifs: [{ k: 'n1', c: 'var(--o-bad)', t: 'Fuite', m: 'Cuisine' }],
    ast: 'disarmed', scenes: [{ id: 'soir', nom: 'Soirée', icone: 'moon' }, { id: 'nuit', nom: 'Nuit' }], onScene: () => {},
  });
  const els = pointeurs(html);
  const i = els.findIndex(e => e.attrs.includes('class="o-surface"'));
  assert.ok(i > 0 && els[i].pe === 'auto', 'la surface reçoit le toucher');
  const horloge = els.find(e => e.attrs.includes('font-size:clamp(72px, 17vw, 170px)'));
  assert.ok(horloge, 'l’horloge a changé de forme');
  assert.equal(horloge.pe, 'none', 'l’horloge recouvre la surface : l’appui ne vise plus de bouton, rien ne vibre');
  // Après la surface, seul ce qui est dans une scène prend le pointeur.
  const prises = els.slice(i + 1).filter(e => e.pe !== 'none' && !e.scene);
  assert.deepEqual(prises.map(e => '<' + e.nom + e.attrs.slice(0, 80)), [], 'un élément de la veille recouvre encore la surface');
  const scenes = els.filter(e => e.nom === 'button' && !e.attrs.includes('o-surface'));
  assert.equal(scenes.length, 2);
  for (const s of scenes) assert.equal(s.pe, 'auto', 'une scène ne se lance plus');
  // Le diaporama n'apparaît qu'après le chargement des photos : il se lit au source.
  assert.ok(lire('src', 'ecranveille.jsx').includes(`<div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>`),
    'le diaporama recouvre la surface entière');
});
