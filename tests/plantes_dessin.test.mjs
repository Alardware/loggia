/* La carte d'une plante montre son espèce (ADR 0391) : son dessin en filigrane, sa photo dans la plaque.
 *
 * Ce qui est garanti ici :
 *  - la bibliothèque : chaque dessin de `PLANT_ART` est un fichier de `public/plantes/`, au format des deux premiers (viewBox 200,
 *    rien d'extérieur, rien qui s'exécute), et chaque dessin que la table des genres nomme existe ;
 *  - le genre choisit le dessin (`dessinEspece`) : un hybride se lit par son genre, quelques espèces ont le leur, un genre inconnu
 *    prend le dessin neutre ; la fiche d'Open Plantbook le porte (`especeDeOpb`), et la ligne gardée ne le relit que s'il est un mot ;
 *  - la carte : le dessin écrit dans la configuration (`img`) passe d'abord, puis celui de l'espèce ; la photo de l'espèce dans la
 *    plaque, large, étroite et compacte, la feuille sinon — et quand la photo ne charge pas ; une adresse douteuse ne s'affiche pas ;
 *  - la table des genres ne part pas au démarrage : elle vit avec la fiche (`especes.js`). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { monter } from './crochets.mjs';
import { especeValide } from '../src/plantes.js';
import { especeDeOpb, dessinEspece } from '../src/especes.js';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const { RoomPlantCard } = await import('../src/cartes/plante.jsx');
const { PLANT_ART } = await import('../src/app/noyau.jsx');
const { plantbookDemo } = await import('../src/demo.js');
const RACINE = new URL('../', import.meta.url);
const SRC = (f) => readFileSync(new URL('src/' + f, RACINE), 'utf8');

/* ── La bibliothèque ─────────────────────────────────────────────────────────────────────────────────────────────────── */

test('chaque dessin est un fichier de public/plantes, au format des deux premiers, sans rien d’extérieur ni d’exécutable', () => {
  const cles = Object.keys(PLANT_ART);
  assert.equal(cles.length, 20, 'les deux dessins d’avant et les dix-huit de l’ADR 0391');
  for (const k of ['schefflera', 'dracaena', 'monstera', 'orchidee', 'plante']) assert.ok(cles.includes(k), k);
  for (const k of cles) {
    assert.equal(PLANT_ART[k], './plantes/' + k + '.svg', 'une adresse relative à la page, comme les polices (C34)');
    const f = new URL('public/plantes/' + k + '.svg', RACINE);
    assert.ok(existsSync(f), k + '.svg manque : la carte montrerait un filigrane vide');
    const svg = readFileSync(f, 'utf8');
    assert.ok(svg.startsWith("<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'>") && svg.endsWith('</svg>\n'), k + ' : le format des deux premiers');
    assert.ok(!/<script|<foreignObject|\son[a-z]+=|href=['"](?!#)|url\((?!#)|data:/i.test(svg), k + ' : rien d’extérieur ni d’exécutable');
    assert.ok(statSync(f).size < 24000, k + ' : un dessin reste léger');
  }
});

test('la table des genres ne nomme que des dessins qui existent', () => {
  const src = SRC('especes.js');
  const bloc = src.slice(src.indexOf('const GENRES_DESSIN = {'), src.indexOf('};', src.indexOf('const GENRES_DESSIN = {')));
  const cles = [...bloc.matchAll(/^ {2}([a-z]+): '/gm)].map(m => m[1]);
  assert.ok(cles.length >= 19, 'une famille par dessin');
  const especes = src.slice(src.indexOf('const ESPECES_DESSIN = {'), src.indexOf('};', src.indexOf('const ESPECES_DESSIN = {')));
  const cibles = [...especes.matchAll(/': '([a-z]+)'/g)].map(m => m[1]);
  for (const k of cles.concat(cibles, ['plante'])) assert.ok(PLANT_ART[k], k + ' : la table nomme un dessin absent');
  const genres = [...bloc.matchAll(/'([a-z ]+)'/g)].flatMap(m => m[1].split(' '));
  assert.equal(new Set(genres).size, genres.length, 'un genre n’a qu’un dessin');
});

/* ── Le genre choisit le dessin ──────────────────────────────────────────────────────────────────────────────────────── */

test('le genre de l’espèce choisit son dessin ; un genre inconnu prend le dessin neutre', () => {
  assert.equal(dessinEspece('monstera deliciosa'), 'monstera');
  assert.equal(dessinEspece('Ficus  Lyrata'), 'ficus', 'les majuscules et les espaces ne comptent pas');
  assert.equal(dessinEspece('dracaena marginata'), 'dracaena');
  assert.equal(dessinEspece('schefflera actinophylla'), 'schefflera');
  assert.equal(dessinEspece('phalaenopsis'), 'orchidee', 'un genre seul');
  assert.equal(dessinEspece("echeveria 'perle von nurnberg'"), 'succulente', 'un cultivar');
  assert.equal(dessinEspece('x graptoveria'), 'succulente', 'un hybride se lit par son genre');
  assert.equal(dessinEspece('epipremnum aureum'), 'pothos');
  assert.equal(dessinEspece('ocimum basilicum'), 'aromatique');
  assert.equal(dessinEspece('dracaena trifasciata'), 'sansevieria', 'la langue-de-belle-mère, rangée chez les dracaena, garde son dessin');
  assert.equal(dessinEspece('philodendron bipinnatifidum'), 'monstera');
  assert.equal(dessinEspece('tillandsia cyanea'), 'plante', 'un genre sans dessin : le dessin neutre, jamais un dessin faux');
  for (const x of ['', null, undefined, 42]) assert.equal(dessinEspece(x), 'plante');
});

test('la fiche d’Open Plantbook porte le dessin ; la ligne gardée ne le relit que s’il est un mot', () => {
  const e = especeDeOpb({ pid: 'monstera deliciosa', display_pid: 'Monstera deliciosa', image_url: 'https://exemple.invalid/m.jpg', min_soil_moist: 15, max_soil_moist: 60 });
  assert.equal(e.dessin, 'monstera');
  assert.equal(especeValide(e).dessin, 'monstera', 'relue telle quelle');
  assert.equal(especeValide({ pid: 'x' }).dessin, null, 'une espèce gardée avant le dessin n’en a pas');
  for (const d of ['../x', 'Monstera', 'a', 'monstera.svg', 'x'.repeat(21), 3]) assert.equal(especeValide({ pid: 'x', dessin: d }).dessin, null, String(d));
});

/* ── La carte ────────────────────────────────────────────────────────────────────────────────────────────────────────── */

const BASE = { base: 'sensor.monstera', name: 'Monstera', mort: false, muetDepuis: null, img: null, hum: 42, lux: 2400, temp: 21.5, cond: 900, uniteTemp: 'C', bat: 88,
  ids: { hum: 'sensor.monstera_sol' } };
const ESPECE = { pid: 'monstera deliciosa', nom: 'Monstera deliciosa', image: 'https://exemple.invalid/m.jpg', dessin: 'monstera', plages: {} };
const html = (pl, props = {}) => renderToStaticMarkup(createElement(RoomPlantCard, { pl, nom: 'Monstera', onOpen: () => {}, ...props }));
const filigrane = (c) => (c.match(/url\(&quot;\.\/plantes\/([a-z]+)\.svg&quot;\)/) || [])[1] || null;

test('la carte : le dessin de son espèce en filigrane, sa photo dans la plaque', () => {
  const c = html({ ...BASE, espece: ESPECE });
  assert.equal(filigrane(c), 'monstera');
  assert.ok(c.includes('opacity:0.14'), 'le filigrane d’avant, à 0,14');
  assert.ok(c.includes('bottom:-10px') && c.includes('clip-path:inset(0 0 10px 0)'), 'il se coupe au bord de la carte : une carte muette (`.o-panne`, sans coupe) ne le laisse pas dépasser dessous');
  assert.ok(c.includes('src="https://exemple.invalid/m.jpg"') && c.includes('referrerPolicy="no-referrer"') && c.includes('alt=""'), 'la photo, sans référent, muette pour le lecteur d’écran');
  assert.ok(c.includes('overflow:hidden;background:rgba(var(--o-ok-rgb),.14)'), 'la plaque garde sa taille et son vert ; la photo s’y loge');
  const feuilles = (x) => (x.match(/fi-rr-leaf/g) || []).length;
  assert.equal(feuilles(c), feuilles(html({ ...BASE, espece: null })) - 1, 'la photo prend la place de la feuille de la plaque (l’engrais garde la sienne)');
  assert.ok(c.includes('aria-label="Monstera, 42 %, Humidité correcte"'), 'ce que la carte dit ne change pas');
});

test('le dessin écrit dans la configuration passe avant celui de l’espèce ; sans rien, ni dessin ni photo', () => {
  assert.equal(filigrane(html({ ...BASE, img: 'schefflera', espece: ESPECE })), 'schefflera', 'un choix fait exprès');
  assert.equal(filigrane(html({ ...BASE, img: 'inconnu', espece: ESPECE })), 'monstera', 'un dessin écrit qui n’existe pas laisse passer celui de l’espèce');
  assert.equal(filigrane(html({ ...BASE, espece: { ...ESPECE, dessin: null } })), null, 'une espèce sans dessin : pas de filigrane');
  const nue = html({ ...BASE, espece: null });
  assert.equal(filigrane(nue), null);
  assert.ok(!nue.includes('<img') && nue.indexOf('fi-rr-leaf') < nue.indexOf('o-gab-nom'), 'une plante sans espèce garde la feuille dans sa plaque');
  assert.ok(!html({ ...BASE, espece: { ...ESPECE, image: 'javascript:alert(1)' } }).includes('<img'), 'une adresse douteuse ne s’affiche pas');
  assert.ok(html({ ...BASE, espece: { pid: null, nom: 'Monstera', image: '/api/image/plante.jpg' } }).includes('src="/api/image/plante.jpg"'), 'l’image de Plant Monitor aussi');
});

test('la compacte porte la photo dans sa petite plaque, sans filigrane', () => {
  const c = html({ ...BASE, espece: ESPECE }, { chip: true });
  assert.ok(c.includes('class="o-piece o-cvdense"') && c.includes('class="o-cvico"'));
  assert.ok(c.includes('src="https://exemple.invalid/m.jpg"'), 'la photo');
  assert.equal(filigrane(c), null, 'la compacte n’a pas de filigrane, comme avant');
});

test('une photo qui ne charge pas rend la feuille', () => {
  const m = monter(RoomPlantCard, { pl: { ...BASE, espece: ESPECE }, nom: 'Monstera', onOpen: () => {} });
  const [img] = m.trouver(e => e.type === 'img');
  assert.ok(img, 'la photo d’abord');
  m.appuyer(img, 'onError');
  assert.equal(m.trouver(e => e.type === 'img').length, 0, 'la feuille revient');
  m.proprietes({ pl: { ...BASE, espece: { ...ESPECE, image: 'https://exemple.invalid/autre.jpg' } } });
  assert.equal(m.trouver(e => e.type === 'img').length, 1, 'une autre photo se tente de nouveau');
  m.demonter();
});

/* ── Le démarrage, la démo ───────────────────────────────────────────────────────────────────────────────────────────── */

test('la table des genres reste avec la fiche : la carte, au démarrage, ne lit que le dessin gardé', () => {
  assert.ok(!SRC('cartes/plante.jsx').includes('especes.js') && !SRC('plantes.js').includes('GENRES_DESSIN') && !SRC('app/noyau.jsx').includes('GENRES_DESSIN'));
  assert.ok(SRC('cartes/plante.jsx').includes('const art = PLANT_ART[pl.img] || (pl.espece && PLANT_ART[pl.espece.dessin]) || null;'));
});

test('la démo : le Dracaena a son espèce, et chaque espèce de la démo a le dessin de son genre pour photo', () => {
  const demo = SRC('demo.js');
  assert.ok(demo.includes("{ base: 'sensor.dracaena_marginata', decouverte: true, espece: { pid: 'dracaena marginata'") && demo.includes("dessin: 'dracaena'"));
  for (const pid of ['dracaena marginata', 'schefflera arboricola', 'ocimum basilicum', 'ficus lyrata', 'monstera deliciosa']) {
    const e = plantbookDemo('get', { species: pid });
    assert.equal(e.image_url, './plantes/' + dessinEspece(pid) + '.svg', pid);
    assert.equal(especeDeOpb(e).dessin, dessinEspece(pid));
  }
});
