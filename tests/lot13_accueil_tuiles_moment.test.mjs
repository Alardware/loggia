// ─────────────────────────────────────────────────────────────────────────────
// Lot 13 de l'audit du 03/10 — l'Accueil : « En ce moment », « À surveiller »,
// les tuiles de la Sécurité et celles de la bannière.
//
// Mesures de départ, axe-core sur la démo : une ligne « En ce moment » était un
// `role="button"` qui contenait son geste — « Mettre en pause », « Renvoyer au
// dock », « Stop ». Un rôle bouton rend sa descendance présentationnelle : le
// geste disparaissait d'un lecteur d'écran (`nested-interactive`). Les tuiles
// de la bannière s'appelaient « Voir la sécurité », « Voir l’énergie » et
// taisaient ce qu'elles affichent, « Désarmée ALARME », « ↑ 460 W EXPORT
// RÉSEAU » (WCAG 2.5.3 : qui pilote à la voix nomme ce qu'il voit).
//
// Ces morceaux ne sont pas exportés d'App.jsx : on les lit, on les passe par
// esbuild (celui de Vite, comme `jsx-hooks.mjs`) et on les REND, avec les vrais
// `Surface`, `nomCarte` et `Fi` de ui.jsx. Le nom se lit sur le HTML produit,
// pas sur le JSX.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import { composant } from './rendu.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const Surface = await composant('ui.jsx', 'Surface');
const nomCarte = await composant('ui.jsx', 'nomCarte');
const Fi = await composant('ui.jsx', 'Fi');
const { fmtWatts } = await import(new URL('../src/format.js', import.meta.url));

/** Un morceau d'App.jsx, de `debut` jusqu'à `fin` compris. */
function morceau(debut, fin, dans = src) {
  const d = dans.indexOf(debut);
  assert.ok(d >= 0, '« ' + debut + ' » introuvable');
  const f = dans.indexOf(fin, d);
  assert.ok(f >= 0, '« ' + fin.trim() + ' » introuvable après « ' + debut + ' »');
  return dans.slice(d, f + fin.length);
}

/** Ce morceau, compilé puis exécuté ; `portee` lui donne ce qu'il lit autour de lui. */
function evaluer(code, portee, rendu) {
  const js = transformSync(code, { loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Frag' }).code;
  const noms = Object.keys(portee);
  return new Function('h', 'Frag', ...noms, js + '\nreturn ' + rendu + ';')(createElement, Fragment, ...noms.map(n => portee[n]));
}

const ENTITES = { '&amp;': '&', '&quot;': '"', '&#x27;': "'", '&lt;': '<', '&gt;': '>' };
/** Les attributs de chaque `<button>` du HTML, dans l'ordre. */
const boutons = (html) => [...html.matchAll(/<button\b([^>]*)>/g)].map(m => Object.fromEntries(
  [...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2].replace(/&(amp|quot|#x27|lt|gt);/g, e => ENTITES[e])])));

const RM_ICO = (bg, col) => ({ background: bg, color: col });
const LigneMoment = evaluer(morceau('function LigneMoment(', '\n}'), { Surface, nomCarte, Fi, RM_ICO, Ico: () => null, PlugIcon: () => null }, 'LigneMoment');

test('une ligne « En ce moment » et son geste : deux boutons voisins, plus de rôle bouton autour', () => {
  const html = renderToStaticMarkup(createElement(LigneMoment, { icone: 'music-alt', rgb: '1,2,3', nom: 'Lecteur salon', sous: 'Titre · Artiste',
    onOpen: () => {}, fiche: true, action: 'Mettre en pause', actionIcone: 'pause', onAction: () => {} }));
  assert.ok(!html.includes('role="button"') && !html.includes('tabindex'), 'la ligne est encore un bouton qui englobe « Mettre en pause » : nested-interactive');
  const [surface, geste, ...reste] = boutons(html);
  assert.equal(reste.length, 0, 'deux boutons, pas plus');
  assert.equal(surface.class, 'o-surface', 'le geste « ouvrir » passe par le bouton de surface');
  assert.equal(surface['aria-label'], 'Lecteur salon, Titre · Artiste', 'la surface dit ce que la ligne affiche, nom puis état');
  assert.equal(surface['aria-haspopup'], 'dialog', 'elle ouvre une fiche, et le dit');
  assert.ok(html.indexOf('</button>') < html.indexOf('aria-label="Mettre en pause'), 'le geste est DANS la surface au lieu d’être son voisin');
  assert.equal(geste['aria-label'], 'Mettre en pause Lecteur salon', 'le nom du geste commence par son mot et nomme l’appareil');
  assert.equal(geste.type, 'button');
  assert.match(geste.style, /position:relative/, 'le geste n’est pas positionné : la surface, peinte après lui, prend son clic');
  assert.match(html, /^<div class="o-ligne-moment" style="position:relative;/, 'la ligne doit être `position: relative` — la surface la couvre — et garder son enfoncement au press');
});

test('une ligne qui mène à une vue ne promet pas de fiche ; une ligne inerte n’a pas de bouton', () => {
  const vers = renderToStaticMarkup(createElement(LigneMoment, { icone: 'flame', rgb: '1,2,3', nom: '2 zones chauffent', sous: 'Séjour · Chambre', onOpen: () => {} }));
  const b = boutons(vers);
  assert.equal(b.length, 1, 'sans geste, un seul bouton : la surface');
  assert.equal(b[0]['aria-label'], '2 zones chauffent, Séjour · Chambre');
  assert.equal(b[0]['aria-haspopup'], undefined, 'une vue n’est pas une fiche : pas d’aria-haspopup');
  assert.ok(vers.includes('fi-rr-angle-right'), 'le chevron reste');
  const inerte = renderToStaticMarkup(createElement(LigneMoment, { icone: 'flame', rgb: '1,2,3', nom: 'Garage ouvert', sous: 'Garage' }));
  assert.equal(boutons(inerte).length, 0, 'une ligne sans destination n’offre rien à activer');
  assert.ok(!inerte.includes('o-ligne-moment'), 'ni d’enfoncement au press');
});

test('les lignes qui ouvrent une fiche le disent, celles qui changent de vue non', () => {
  const d = morceau('function Dashboard(', '\n}');
  const lignes = [...d.matchAll(/momentRows\.push\(<LigneMoment [\s\S]*?\/>\)/g)].map(m => m[0]);
  assert.equal(lignes.length, 5, 'lecteur, robot, lave-vaisselle, chauffage, volet : le lecteur du test ne suit plus le code');
  for (const l of lignes) {
    assert.equal(/ fiche /.test(l), l.includes('onOpen={() => dc.ouvrir('), 'une ligne qui ouvre une fiche sans `fiche`, ou l’inverse : ' + l.slice(0, 90));
  }
  const attention = morceau('function CarteAttention(', '\n}');
  assert.ok(attention.includes('<LigneMoment ') && !/ fiche[ =]/.test(attention), '« À surveiller » mène à des vues, pas à des fiches');
});

test('une tuile de la Sécurité s’appelle comme elle s’affiche', () => {
  const TuilesSecurite = evaluer(morceau('function TuilesSecurite(', '\n}'), { nomCarte, Fi, RM_ICO }, 'TuilesSecurite');
  const html = renderToStaticMarkup(createElement(TuilesSecurite, { onTuile: () => {}, tuiles: [
    { cle: 'portes', nom: 'Portes', icone: 'door-open', valeur: '3/4', libelle: 'fermées', alerte: true, actif: false },
    { cle: 'mouvement', nom: 'Mouvement', icone: 'running', valeur: 'Aucun mouvement', libelle: '', alerte: false, actif: false },
  ] }));
  assert.deepEqual(boutons(html).map(b => b['aria-label']), ['Portes, 3/4 fermées', 'Mouvement, Aucun mouvement'],
    'le nom passe par nomCarte : « Mouvement · Aucun mouvement  » finissait sur une espace');
});

test('« n autres » du rail : son nom est ce qu’elle affiche', () => {
  const morceauRail = morceau('const railRow = (', '\n          };');
  const avec = evaluer(morceauRail, { onNav: () => {}, nomCarte, Fi }, 'railRow');
  const html = renderToStaticMarkup(avec('plus', '3 autres', 'Tout est dans Objets', '', 'var(--o-text3)', 'objets'));
  assert.match(html, /^<div role="button" tabindex="0" aria-label="3 autres, Tout est dans Objets"/, 'la ligne garde son rôle (aucune commande dedans) et prend le nom de ce qu’elle affiche');
  assert.ok(!html.includes('aria-haspopup'), 'elle change de vue, elle n’ouvre pas de fiche');
  const sans = evaluer(morceauRail, { onNav: null, nomCarte, Fi }, 'railRow');
  const inerte = renderToStaticMarkup(sans('plus', '3 autres', 'Tout est dans Objets', '', 'var(--o-text3)', 'objets'));
  assert.ok(!inerte.includes('role=') && !inerte.includes('aria-label'), 'sans destination : ni rôle, ni nom (un aria-label sur un div sans rôle est interdit)');
});

const FIN_NOMS = 'Object.keys(libelles).forEach(k => { libelles[k] = nomCarte(...vus[k].map(enPhrase), libelles[k]); });';
const nomsBanniere = (portee) => evaluer(morceau("const libelles = { al: tr('Voir la sécurité'),", FIN_NOMS),
  { tr: (k) => k, nomCarte, fmtWatts, airLabel: (v) => (v < 1150 ? 'BON' : 'ÉLEVÉ'), ...portee }, 'libelles');

test('une tuile de la bannière dit ce qu’elle affiche, puis où elle mène', () => {
  assert.deepEqual(nomsBanniere({
    alarmeTuile: { texte: 'Désarmée' },
    a: { metricExport: { sign: '↑ ', raw: 460, label: 'EXPORT RÉSEAU' }, maxCo2: 812.4, lightsOn: 3, lightsTotal: 12 },
    ouvStat: { ouverts: 2, total: 7 }, actifsStat: { medias: 1, mediasTotal: 3 }, nEnCours: 4,
  }), {
    // Les libellés en capitales du dessin se lisent en casse de phrase : une
    // synthèse vocale épelle un mot court en capitales (« B-O-N »).
    al: 'Désarmée, Alarme, Voir la sécurité',
    ex: '↑ 460 W, Export réseau, Voir l’énergie',
    air: '812 ppm, Qualité air · bon, Voir la pièce la plus chargée',
    ouv: '2 / 7, Ouvrants ouverts, Voir la sécurité',
    lum: '3 / 12 prés., Lumières allumées, Voir les lumières',
    med: '1 / 3, Média en lecture, Voir les médias',
    app: '4, En ce moment, Voir ce qui tourne',
  });
  // Au chargement, la valeur est un squelette sans texte : le nom n'invente rien.
  const vide = nomsBanniere({ alarmeTuile: null, a: null, ouvStat: { ouverts: 0, total: 0 }, actifsStat: { medias: 0, mediasTotal: 0 }, nEnCours: 0 });
  assert.equal(vide.ex, 'Export réseau, Voir l’énergie');
  assert.equal(vide.air, 'Qualité air · bon, Voir la pièce la plus chargée');
});

test('le nom d’une tuile de la bannière reprend les mots de son dessin', () => {
  // Deux écritures d'un même texte divergent un jour : chaque mot du nom doit
  // être celui que la tuile montre.
  const vus = morceau('const vus = {', '\n            };');
  const cases = morceau('const cases = [];', 'if (!cases.length) return null;');
  const mots = [...vus.matchAll(/tr\('([^']+)'\)/g)].map(m => m[1]);
  assert.ok(mots.length >= 12, 'les libellés du nom ne se lisent plus');
  for (const m of mots) assert.ok(cases.includes("tr('" + m + "')"), '« ' + m + ' » est dans le nom, pas sur la tuile');
  assert.ok(vus.includes('fmtWatts(a.metricExport.raw)') && cases.includes('<Num v={a.metricExport.raw} prefix={a.metricExport.sign} fmt={fmtWatts} />'), 'la puissance s’écrit comme sur la tuile');
  // `airLabel` rend un mot déjà traduit, des deux côtés (05/10, lot 16).
  assert.ok(vus.includes("? airLabel(a.maxCo2) : tr('BON')") && cases.includes("? airLabel(a.maxCo2) : tr('BON')"), 'le palier d’air aussi');
  assert.ok(!vus.includes('tr(airLabel(') && !cases.includes('tr(airLabel('), 'le palier d’air retraduit');
  for (const k of ['al', 'ex', 'air', 'ouv', 'lum', 'med', 'app']) {
    assert.ok(cases.includes('onClick={clics.' + k + '} aria-label={libelles.' + k + '}'), 'la tuile ' + k + ' ne porte plus son nom');
  }
});

test('la ligne s’enfonce encore au press, sauf en mouvement réduit', () => {
  assert.ok(css.includes('.o-ligne-moment:active { transform: scale(.955); }'), 'la ligne a perdu l’enfoncement de `[role="button"]:active`');
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce) { .o-ligne-moment { transition: none; } .o-ligne-moment:active { transform: none; } }'), 'en mouvement réduit, rien ne bouge');
});
