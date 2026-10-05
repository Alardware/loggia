// ─────────────────────────────────────────────────────────────────────────────
// L'échec d'une commande se DIT (audit du 03/10).
//
// Le toast « Commande non exécutée » n'était monté qu'une fois son texte
// connu, sous un `role="status"`. Or une région vivante qui apparaît déjà
// remplie ne dit rien — c'est la règle de l'ADR 0107, écrite pour l'alarme et
// « À surveiller ». Le refus se voyait, il ne s'entendait pas : celui qui
// attendait l'effet de son geste croyait la commande partie. Même défaut sur
// le message de la carte Alarme et sur la réponse du code administrateur.
//
// Et montée en permanence, la région se serait tue dans une fiche : une
// feuille ouverte rend la page INERTE (`inerterAutour`), et une région inerte
// n'est plus dans l'arbre d'accessibilité.
//
// Ces tests relisent les sources, comme leurs voisins.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const app = lire('src', 'App.jsx');
const ui = lire('src', 'ui.jsx');
const par = lire('src', 'views', 'parametres.jsx');
const NL = String.fromCharCode(10);
const corps = (s, debut) => { const d = s.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); return s.slice(d, s.indexOf(NL + '}', d)); };

const REGION = `<div className="o-vh" role="alert" data-annonce="">{toast || ''}</div>`;

test('la région du toast d’échec est toujours montée : c’est son texte qui change', () => {
  assert.ok(app.includes(REGION), 'la région d’échec n’est plus montée sans condition');
  assert.ok(!/\{toast && <div role=/.test(app), 'le toast redevient une région montée avec son texte : il ne se dit pas');
  // Le toast reste pour l'œil, juste après sa région, et ne se lit pas deux fois.
  const r = app.indexOf(REGION);
  const t = app.indexOf('{toast && <div aria-hidden="true" style={{');
  assert.ok(t > r && t - r < 200, 'le toast visible n’est plus caché aux lecteurs d’écran, ou s’est éloigné de sa région');
  assert.ok(app.includes('toastTRef.current = setTimeout(() => { setToast(null); dernierToast.current = null; }, 5000);'), 'les 5 s d’affichage');
});

test('une feuille ouverte ne rend pas la région d’annonce inerte', () => {
  const c = corps(ui, 'export function inerterAutour(noeud)');
  assert.ok(c.includes("frere.hasAttribute('data-annonce')"),
    'une fiche ouverte rend de nouveau la région muette — et c’est d’une fiche que partent bien des commandes');
  assert.ok(c.includes("frere.hasAttribute('inert')"), 'un frère déjà inerte doit rester épargné');
});

test('le message de la carte Alarme se dit aussi', () => {
  const c = corps(app, 'function CvAlarm(');
  const iRegion = c.indexOf(`<div className="o-vh" role="status">{message && message.texte ? message.texte : ''}</div>`);
  const iBoite = c.indexOf('{message && message.texte && (');
  assert.ok(iRegion > 0 && iBoite > iRegion, 'la région du message n’est plus montée sans condition');
  assert.ok(c.slice(iBoite, iBoite + 80).includes('<div aria-hidden="true"'), 'l’encadré se lirait une seconde fois');
});

test('la réponse du code administrateur se dit aussi', () => {
  const c = corps(par, 'function AdminPinEditor(');
  assert.ok(!c.includes('{msg && <div role="status"'), 'le refus du code redevient une région montée avec son texte : il ne se dit pas');
  assert.ok(c.includes('<div role="status" style={msg ? {') && c.includes("{msg ? msg.t : ''}</div>"),
    'la région de la réponse n’est plus montée sans condition');
});

test('aucune région polie d’App.jsx n’est montée avec son texte', () => {
  /* `alert` est l'exception, et c'est pour cela qu'elle n'est pas comptée :
   * à la CRÉATION d'une alerte, le navigateur lève un événement système que
   * les lecteurs d'écran écoutent (WAI-ARIA 1.2). Rien de tel pour `status`
   * ni pour `aria-live="polite"` : montés remplis, ils se taisent. */
  const lignes = app.split(NL);
  const fautifs = [];
  lignes.forEach((l, i) => {
    if (!/role="status"|aria-live="polite"/.test(l)) return;
    const avant = (lignes[i - 1] || '').trim();
    if (/&&\s*<[^>]*(role="status"|aria-live="polite")/.test(l) || /(&&|\?)\s*\($/.test(avant)) fautifs.push('App.jsx:' + (i + 1));
  });
  assert.deepEqual(fautifs, [], 'une région polie montée par une condition ne dit rien à son apparition (ADR 0107)');
});
