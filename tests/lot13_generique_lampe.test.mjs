// Lot 13 de l'audit du 03/10 — la carte générique d'une pièce (prise,
// capteur, serrure, caméra, sirène, vanne…) et la carte de lampe ne sont
// plus des boutons qui en contiennent d'autres (ADR 0074).
//
// Mesuré dans la démonstration avant le correctif : sur Objets, six lampes
// (un `button` autour d'un interrupteur et d'une glissière) et six cartes
// génériques (un rôle bouton autour d'une bascule ou de « Voir le flux »)
// sortaient en `nested-interactive` ; un lecteur d'écran n'y voyait plus les
// commandes. Et chaque carte se nommait « Ouvrir Porte d'entrée » : le nom
// taisait l'état affiché (WCAG 2.5.3).
//
// App.jsx n'exporte pas ces cartes : elles se lisent comme texte. Le motif
// lui-même (`Surface`, `nomCarte`) se rend, depuis ui.jsx.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composant, rendre } from './rendu.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);

/** Le corps d'une fonction de premier niveau d'App.jsx. */
function fonction(nom) {
  const d = app.indexOf(NL + 'function ' + nom + '(');
  assert.ok(d >= 0, nom + ' introuvable');
  const f = app.indexOf(NL + '}' + NL, d);
  return app.slice(d, f + 2);
}

/** Le texte sans ses commentaires en bloc. */
function sansCommentaires(s) {
  let out = '', k = 0;
  for (let d = s.indexOf('/*'); d >= 0; d = s.indexOf('/*', k)) {
    const f = s.indexOf('*/', d);
    if (f < 0) break;
    out += s.slice(k, d);
    k = f + 2;
  }
  return out + s.slice(k);
}

/** La balise ouvrante qui commence en `d` : accolades, chaînes et
 *  commentaires sautés — l'apostrophe d'un « c'est » en commentaire
 *  ouvrirait sinon une chaîne. */
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

/** Ce que contient l'élément ouvert en `d`, jusqu'à SA fermante. */
function contenu(s, d) {
  const ouvrante = balise(s, d);
  const nom = ouvrante.slice(1).split(/[ >/]/)[0].trim();
  if (ouvrante.endsWith('/>')) return '';
  const re = new RegExp('<(/?)' + nom + '(?=[ >/' + NL + '])', 'g');
  re.lastIndex = d + ouvrante.length;
  let prof = 1;
  for (let m; (m = re.exec(s)); ) {
    if (m[1]) { if (--prof === 0) return s.slice(d + ouvrante.length, m.index); continue; }
    if (!balise(s, m.index).endsWith('/>')) prof++;
  }
  return null;
}

const BOUTON = ['<button ', '<button>', '<button' + NL];
const COMMANDES = ['<RmBascule', '<RmJauge', ...BOUTON, 'role="switch"', 'role="slider"', 'role="checkbox"', '...kbSlider('];

/** Où s'ouvre tout ce qui est bouton : un `button`, ou un rôle bouton, même conditionnel. */
function boutons(f) {
  const out = [];
  for (let i = f.indexOf('<button'); i >= 0; i = f.indexOf('<button', i + 1)) {
    if (BOUTON.some(b => f.startsWith(b, i))) out.push(i);
  }
  for (let i = f.indexOf('role='); i >= 0; i = f.indexOf('role=', i + 1)) {
    const v = f.slice(i, i + 80);
    if (v.startsWith('role="button"') || (v.startsWith('role={') && v.slice(0, v.indexOf('}')).includes("'button'"))) out.push(f.lastIndexOf('<', i));
  }
  return out;
}

test('aucun bouton de ces deux cartes ne contient de commande (nested-interactive)', () => {
  for (const nom of ['RoomGenericCard', 'RoomLightCard']) {
    const f = fonction(nom);
    for (const d of boutons(f)) {
      const c = contenu(f, d);
      assert.notEqual(c, null, nom + ' : fermante introuvable — le lecteur du test ne suit plus le code');
      const dedans = sansCommentaires(c);
      assert.ok(!COMMANDES.some(m => dedans.includes(m)), nom + ' : un bouton contient encore une commande — ' + balise(f, d).slice(0, 90));
    }
  }
});

test('la carte générique : une racine sans rôle, et la surface en premier enfant', () => {
  const f = fonction('RoomGenericCard');
  const d = f.indexOf("<div className={'o-rmcard' + (mort ? ' o-panne' : '')}");
  assert.ok(d >= 0, 'la racine de la carte a changé de forme');
  const racine = balise(f, d);
  for (const attr of ['role=', 'tabIndex=', 'aria-label=', 'onClick=', 'onKeyDown=']) {
    assert.ok(!racine.includes(attr), 'la racine porte encore ' + attr);
  }
  assert.ok(racine.includes("position: 'relative'"), 'la surface se pose sur une racine positionnée');
  // Premier enfant : le bouton de surface, nommé de ce que la carte affiche.
  const apres = f.slice(d + racine.length).trimStart();
  assert.ok(apres.startsWith('{ouvrable && <Surface onClick={() => onOpen(id)} label={nomCarte(nom, valeur, subLu || sub)} />}'),
    'la surface n’est plus le premier enfant, ou son nom n’est plus « nom, état affiché »');
  assert.ok(!f.includes("tr('Ouvrir') + ' ' + nom"), '« Ouvrir Porte d’entrée » : le nom tait l’état');
});

test('la carte générique : son nom est le texte affiché, la mesure d’un capteur comprise', () => {
  const f = fonction('RoomGenericCard');
  // Les mêmes variables que l'écran : `nom`, `sub`, et la mesure en grand.
  assert.ok(f.includes('<div style={RM_NAME}>{nom}</div>') && f.includes('<div style={{ ...RM_SUB, color: couleur }}>{sub}</div>'), 'le nom et l’état affichés');
  assert.ok(f.includes('{mesure.v}{mesure.u ? <span'), 'la mesure affichée en grand');
  assert.ok(f.includes("const valeur = mesure ? mesure.v + (mesure.u ? ' ' + mesure.u : '') : null;"), 'la mesure entre dans le nom, telle qu’affichée');
  // Relecture du lot 13 : le verdict entre dans le nom tel que la table
  // l'écrit, « Bon » — en capitales, une synthèse vocale épelle un mot court
  // (« B-O-N »). L'écran, lui, garde ses capitales.
  assert.ok(f.includes("subLu = libMesure + ' · ' + jauge.verdict.t;") && !/subLu = [^;]*toLocaleUpperCase/.test(f), 'le nom lit le verdict en capitales');
  assert.ok(f.includes("sub = libMesure + ' · ' + jauge.verdict.t.toLocaleUpperCase(locale());"), 'l’écran a perdu ses capitales');
});

test('la carte générique : le décor laisse filer le clic, les commandes passent dessus', () => {
  const f = fonction('RoomGenericCard');
  // La plaque est positionnée (animation) : sans `none`, elle prendrait le clic.
  assert.ok(f.includes("allume ? icoTexte : 'var(--o-text3)'), position: 'relative', pointerEvents: 'none' }}>"), 'la plaque prend le clic');
  // Le texte passe devant le filigrane d'un ouvrant ; il laisse filer le clic,
  // jauges comprises. Sauf celui d'une caméra, qui porte « Voir le flux ».
  assert.ok(f.includes("const voirFlux = dom === 'camera' && !mort;"));
  assert.ok(f.includes("<div style={voirFlux ? { marginTop: 14 } : { marginTop: 14, position: 'relative', pointerEvents: 'none' }}>"), 'le texte prend le clic');
  // « Voir le flux » : positionné (au-dessus de la surface), nommé de son
  // texte puis de l'appareil, et il garde son arrêt de propagation.
  const v = f.slice(f.indexOf('{voirFlux && ('));
  const bouton = balise(v, v.indexOf('<button'));
  assert.ok(bouton.includes("aria-label={tr('Voir le flux') + ' ' + nom}"), '« Voir le flux » ne nomme pas la caméra');
  assert.ok(bouton.includes('aria-haspopup="dialog"') && bouton.includes('e.stopPropagation()'));
  assert.ok(bouton.includes("position: 'relative' }}"), '« Voir le flux » passe sous la surface');
  // En édition, la grille rend la carte inerte par un `none` hérité : un
  // `auto` posé dessous le percerait.
  assert.ok(!sansCommentaires(f).includes("pointerEvents: 'auto'"), 'un `auto` perce l’inertie du mode édition');
});

test('la lampe : un div au dessin du bouton, sa bascule et sa glissière hors de tout bouton', () => {
  const f = fonction('RoomLightCard');
  assert.ok(!BOUTON.some(b => f.includes(b)), 'la lampe est encore un button');
  const d = f.indexOf("<div ref={flashRef} className={'o-light-card o-rmcard o-cvdense' + (mort ? ' o-panne' : '')}");
  assert.ok(d >= 0, 'la racine garde ses classes et le halo du geste');
  const racine = balise(f, d);
  for (const attr of ['role=', 'tabIndex=', 'aria-label=', 'onClick=', 'onKeyDown=']) {
    assert.ok(!racine.includes(attr), 'la racine porte encore ' + attr);
  }
  // Le dessin du bouton d'avant : texte à gauche, interligne du contrôle ; le
  // liseré du réglage « Liserés » depuis le 04/10.
  for (const s of ["position: 'relative'", "textAlign: 'left'", "lineHeight: 'normal'", "border: LISERE", "overflow: 'hidden'"]) {
    assert.ok(racine.includes(s), 'la racine a perdu ' + s);
  }
  const apres = f.slice(d + racine.length).trimStart();
  assert.ok(apres.startsWith('{ouvre && <Surface onClick={ouvre} label={nomCarte(nom, sub)} />}'), 'la surface, premier enfant, nommée « nom, état affiché »');
  assert.ok(f.includes("<div style={{ ...RM_SUB, color: on ? 'var(--o-warn)' : 'var(--o-text3)' }}>{sub}</div>"), 'l’état du nom est celui de l’écran');
  // Le geste d'avant, sans rien perdre : la fiche de la lampe, sinon l'appareil.
  assert.ok(f.includes('const ouvre = (adjustable && onOpen) ? () => onOpen({ id, name: a.friendly_name || id, on, bri, color, rgb, ct, dimmable, lc: st && st.last_changed })'));
  assert.ok(f.includes(': onFiche ? () => onFiche(id) : null;'));
  assert.ok(f.includes('<RmBascule on={on} nom={nom} onToggle={toggle} />') && f.includes("label={tr('Luminosité') + ' ' + nom}"), 'les commandes nomment la lampe');
});

test('ce qui lit .o-light-card la trouve toujours', () => {
  assert.ok(css.includes('.o-light-card:active'), 'l’enfoncement au doigt de la lampe');
  assert.ok(app.includes(`.o-light-card,.o-scene-room,[role="switch"],[role="button"]'`), 'le retour haptique');
});

test('une carte de pièce qui s’ouvre s’enfonce toujours sous le doigt', () => {
  // `[role="button"]:active` le faisait ; la racine n'a plus de rôle.
  assert.ok(css.includes('.o-rmcard:has(> .o-surface):active { transform: scale(.955); }'), 'l’enfoncement de la carte a disparu');
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce) { .o-rmcard:has(> .o-surface):active { transform: none; } }'), 'le mouvement réduit le coupe');
  // La surface est un `button` : `button:active` la rétrécirait une seconde
  // fois dans la carte qui se rétrécit, et un appui près du bord n'ouvrirait
  // plus rien.
  assert.ok(css.includes('.o-surface:active { transform: none; }'), 'la surface rétrécit deux fois sous le doigt');
});

test('le motif rendu : « Porte d’entrée, Verrouillée », un bouton qui annonce sa fiche', async () => {
  const Surface = await composant('ui.jsx', 'Surface');
  const nomCarte = await composant('ui.jsx', 'nomCarte');
  assert.equal(nomCarte('Porte d’entrée', 'Verrouillée'), 'Porte d’entrée, Verrouillée');
  assert.equal(nomCarte('Salon CO2', '612 ppm', 'Qualité d’air · Excellent'), 'Salon CO2, 612 ppm, Qualité d’air · Excellent');
  assert.equal(nomCarte('Plafonnier', null, '60 % de luminosité'), 'Plafonnier, 60 % de luminosité', 'une mesure absente tombe');
  const html = rendre(Surface, { onClick: () => {}, label: nomCarte('Porte d’entrée', 'Verrouillée') });
  assert.ok(html.startsWith('<button type="button" class="o-surface" aria-label="Porte d’entrée, Verrouillée" aria-haspopup="dialog"'), html);
});
