// ─────────────────────────────────────────────────────────────────────────────
// Une carte qui casse ne prend plus que sa vue (audit du 03/10).
//
// La seule barrière d'erreur était à la racine (`boot.jsx`) : une exception
// levée au rendu par n'importe quelle carte remplaçait TOUT l'écran par la
// page de secours — l'ADR 0111 raconte une vraie `RangeError`, celle du
// graphique d'énergie. Chaque vue a maintenant sa barrière, chaque feuille
// aussi (`Barriere`, ui.jsx) ; et le tri de l'agenda (`parDebut`) range une
// date illisible en dernier au lieu de lever.
//
// Pas de navigateur dans les tests, et le rendu serveur de React ignore les
// barrières par construction : l'erreur d'un enfant le fait lever, point. On
// joue donc le contrat de React à la main — l'enfant lève,
// `getDerivedStateFromError` pose l'état, `componentDidCatch` journalise,
// `render` rend la panne — et cette panne-là, on la rend pour de vrai.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { composant } from './rendu.mjs';
import { parDebut, evenementsDuJour, lireCalendriers } from '../src/agenda.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const Barriere = await composant('ui.jsx', 'Barriere');

/** L'enfant qui casse : l'erreur de l'ADR 0111, à peu de chose près. */
const Casse = () => { throw new RangeError('Maximum call stack size exceeded'); };

/** Ce que React fait d'une erreur de rendu sous une barrière, joué à la main. */
function attraper(props) {
  const b = new Barriere({ ...props, children: createElement(Casse) });
  let err = null;
  try { Casse(); } catch (e) { err = e; }
  Object.assign(b.state, Barriere.getDerivedStateFromError(err));
  b.setState = (maj) => { Object.assign(b.state, typeof maj === 'function' ? maj(b.state) : maj); };
  return { b, err };
}

/** Les boutons d'un arbre d'éléments, dans l'ordre, sans le rendre. */
function boutons(n, out = []) {
  if (Array.isArray(n)) { n.forEach(x => boutons(x, out)); return out; }
  if (!n || typeof n !== 'object' || !n.props) return out;
  if (n.type === 'button') out.push(n);
  boutons(n.props.children, out);
  return out;
}

/** `fn` sans le bruit de `console.error` ; rend ce que la console a reçu. */
function sansBruit(fn) {
  const vus = [];
  const avant = console.error;
  console.error = (...a) => { vus.push(a); };
  try { fn(); } finally { console.error = avant; }
  return vus;
}

test('sans erreur, la barrière rend ses enfants tels quels', () => {
  assert.equal(renderToStaticMarkup(createElement(Barriere, { ou: 'vue' }, createElement('p', null, 'ok'))), '<p>ok</p>',
    'aucune boîte autour d’une vue qui marche');
  assert.ok(Barriere.prototype.isReactComponent, 'une classe React : seules les classes capturent');
  assert.equal(typeof Barriere.getDerivedStateFromError, 'function', 'sans elle, React ne lui confie pas l’erreur');
});

test('sans barrière, l’erreur d’un enfant remonte jusqu’en haut : ce que la racine recevait', () => {
  sansBruit(() => assert.throws(() => renderToStaticMarkup(createElement(Casse)), /Maximum call stack size exceeded/));
});

test('une vue qui casse : la carte de panne à sa place, son en-tête gardé', () => {
  const { b, err } = attraper({ ou: 'vue', entete: createElement('header', { id: 'entete' }) });
  assert.ok(err instanceof RangeError, 'l’enfant a bien levé');
  const html = renderToStaticMarkup(b.render());
  assert.ok(html.includes('<header id="entete"></header>'), 'l’en-tête reste : on navigue encore');
  assert.ok(html.includes('<main class="loggia-main"'), 'la carte prend la place de la vue, dans son <main>');
  assert.ok(html.includes('role="alert"') && html.includes('class="o-panne"'),
    'dite à son apparition, avec le liseré de ce qui ne répond plus (ADR 0048)');
  assert.ok(html.includes('linear-gradient(180deg,var(--o-surfA),var(--o-surfB))'), 'une carte au gabarit de la maison');
  assert.match(html, /<h1[^>]*>Cette vue n’a pas pu s’afficher<\/h1>/, 'un <h1> : le focus d’un changement de vue s’y pose');
  assert.ok(html.includes('Maximum call stack size exceeded'), 'le message de l’erreur, pour la signaler');
});

test('« Réessayer » réarme la barrière ; « Recharger » repart de zéro', () => {
  const { b } = attraper({ ou: 'vue' });
  const [reessayer, recharger] = boutons(b.render());
  assert.deepEqual([reessayer.props.children, recharger.props.children], ['Réessayer', 'Recharger']);
  reessayer.props.onClick();
  assert.equal(b.state.err, null, 'la barrière n’est pas réarmée');
  assert.equal(b.render(), b.props.children, 'réarmée, elle rend de nouveau la vue');
  // Une vue chargée à la demande dont le fichier a disparu (ADR 0072) ne se
  // relit jamais d'elle-même : `lazy` garde son échec. Seul le rechargement.
  let recharges = 0;
  const avant = globalThis.window;
  globalThis.window = { location: { reload: () => { recharges += 1; } } };
  try { recharger.props.onClick(); } finally { if (avant === undefined) delete globalThis.window; else globalThis.window = avant; }
  assert.equal(recharges, 1, '« Recharger » ne recharge pas la page');
});

test('l’erreur part dans la console, avec la phrase de la racine', () => {
  const { b, err } = attraper({ ou: 'vue' });
  const vus = sansBruit(() => b.componentDidCatch(err, { componentStack: '\n    at Casse' }));
  assert.equal(vus.length, 1, 'une erreur, une ligne');
  assert.equal(vus[0][0], 'Loggia : erreur de rendu');
  assert.equal(vus[0][1], err, 'l’erreur elle-même, avec sa pile');
  assert.ok(lire('src', 'boot.jsx').includes("console.error('Loggia : erreur de rendu', err, info);"),
    'la racine dit la même phrase : on n’en cherche qu’une dans la console');
});

test('une feuille qui casse garde son nom et sa croix — une seule, et pas de boîte dans la feuille', () => {
  const nue = renderToStaticMarkup(attraper({ ou: 'feuille' }).b.render());
  assert.ok(nue.includes('Cette fiche n’a pas pu s’afficher') && nue.includes('data-croix'),
    'sans ligne de titre au-dessus, la barrière pose la sienne, croix comprise');
  assert.ok(nue.includes('role="alert"') && !nue.includes('loggia-main'), 'la panne est dite, sans <main> dans une feuille');
  // La feuille est déjà le panneau : une carte dedans serait une boîte dans une boîte.
  assert.ok(!nue.includes('o-panne') && !nue.includes('var(--o-surfB)'), 'une carte est revenue dans la feuille');
  const titree = renderToStaticMarkup(attraper({ ou: 'feuille', titree: true }).b.render());
  assert.ok(titree.includes('Cette fiche n’a pas pu s’afficher'), 'le titre passe dans le contenu');
  assert.ok(!titree.includes('data-croix'), 'la feuille titrée a déjà sa croix : pas une seconde');
});

test('chaque vue et chaque feuille passent par une barrière ; la racine garde la sienne', () => {
  const app = lire('src', 'App.jsx');
  assert.match(app, /import \{[^}]*\bBarriere\b[^}]*\} from '\.\/ui\.jsx';/, 'App n’importe plus la barrière');
  const debut = app.indexOf('<div key={view} ref={vueRef} className="o-view"');
  assert.ok(debut > 0, 'le conteneur de vue a disparu');
  const vue = app.slice(debut, app.indexOf('{navbar && <MobileNav', debut));
  const ouvre = vue.indexOf('<Barriere entete={<Header />}>');
  assert.ok(ouvre > 0 && ouvre < vue.indexOf('viewBlocked ?'), 'la barrière ne couvre plus les vues, ou plus toutes');
  assert.equal(vue.slice(vue.lastIndexOf('</Barriere>')).replace(/\s+/g, ''), '</Barriere></div>',
    'la barrière doit vivre DANS le conteneur `key={view}` : c’est lui qui la réarme au changement de vue');
  const ui = lire('src', 'ui.jsx');
  const feuille = ui.slice(ui.indexOf('export function BottomSheet('));
  const b = feuille.indexOf("<Barriere ou=\"feuille\" titree={!!title}>{typeof children === 'function' ? children(close) : children}</Barriere>");
  assert.ok(b > 0, 'le contenu des feuilles n’est plus sous une barrière');
  assert.ok(feuille.indexOf('<FermerCtx.Provider value={close}>') < b,
    'sous les contextes de la feuille : sa croix sait quoi fermer, son titre la nomme');
  assert.ok(lire('src', 'boot.jsx').includes('<LoggiaErrorBoundary><App /></LoggiaErrorBoundary>'), 'la racine garde son filet : le dernier');
});

// ── L'agenda : un début illisible ne fait plus lever le tri ─────────────────

const iso = (y, m, d, h) => new Date(y, m, d, h).toISOString();
const cafe = { summary: 'Café', start: { dateTime: iso(2026, 9, 5, 8) }, end: { dateTime: iso(2026, 9, 5, 9) } };
const dentiste = { summary: 'Dentiste', start: { dateTime: iso(2026, 9, 5, 9) }, end: { dateTime: iso(2026, 9, 5, 10) } };
const illisible = { summary: 'Illisible', start: { dateTime: 'pas une date' } };
const sansDebut = { summary: 'Sans début' };

test('parDebut ne lève plus : une entrée illisible se range en dernier', () => {
  assert.doesNotThrow(() => parDebut(illisible, cafe), 'un `start` illisible faisait lever le tri — au rendu, donc tout l’écran');
  assert.doesNotThrow(() => parDebut(cafe, sansDebut));
  assert.ok(parDebut(illisible, cafe) > 0 && parDebut(cafe, illisible) < 0, 'l’illisible passe après le lisible');
  assert.equal(parDebut(illisible, sansDebut), 0, 'deux illisibles gardent leur ordre d’arrivée');
  assert.deepEqual([illisible, dentiste, sansDebut, cafe].sort(parDebut).map(e => e.summary),
    ['Café', 'Dentiste', 'Illisible', 'Sans début']);
  assert.deepEqual(evenementsDuJour([illisible, dentiste, cafe], new Date(2026, 9, 5)).map(e => e.summary), ['Café', 'Dentiste'],
    'la liste d’un jour ne change pas : l’illisible n’y entre toujours pas');
});

test('lireCalendriers range avec le même comparateur : l’illisible en dernier, plus au hasard', async () => {
  const l = await lireCalendriers(async () => [illisible, dentiste, cafe], ['calendar.maison'], new Date(2026, 9, 3), new Date(2026, 9, 10));
  assert.deepEqual(l.map(e => e.summary), ['Café', 'Dentiste', 'Illisible']);
  assert.ok(lire('src', 'agenda.js').includes('return tous.sort(parDebut);'), 'un second tri à part ressurgirait : `NaN` y range au hasard');
});
