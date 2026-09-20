// Le ciel se fond dans le theme (19/09, v3.59.1, ADR 0059) : le fond meteo de
// l'Accueil s'efface par un masque sur le VRAI fond de la page, et la rangee
// des scenarios au telephone ne rogne plus d'ombre en rectangle.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const regle = (sel) => { const d = css.indexOf(sel + ' {'); assert.ok(d >= 0, sel + ' introuvable'); return css.slice(d, css.indexOf('}', d) + 1); };

test('le ciel s’efface par un masque : il laisse voir le fond du theme, quel qu’il soit', () => {
  const ciel = regle('.o-wx3d');
  assert.ok(ciel.includes('-webkit-mask-image: linear-gradient(180deg, #000 0%, #000 30%,') && ciel.includes('\n  mask-image: linear-gradient(180deg, #000 0%, #000 30%,'), 'le masque, prefixe pour Safari');
  assert.ok(ciel.includes('rgba(0,0,0,.06) 90%, transparent 100%);'), 'il finit transparent : c’est le fond de la page qu’on voit dessous');
  // Le fond de la page est `--o-bggrad` : un voile qui finit sur `--o-bg`
  // butait sur une marche nette sur les themes a fond degrade.
  assert.ok(src.includes("background: fondPhotoActif ? 'transparent' : 'var(--o-bggrad, var(--o-bg))'"), 'la page est peinte du degrade du theme');
  for (const sel of ['.o-wx3d-veil', 'html.loggia-light .o-wx3d-veil']) {
    assert.ok(!regle(sel).includes('var(--o-bg) 100%'), sel + ' ne recouvre plus le bas du ciel d’une couleur opaque');
  }
  assert.ok(regle('.o-wx3d.o-sky-full').includes('-webkit-mask-image: none; mask-image: none;'), 'le ciel plein ecran, lui, ne s’efface pas');
});

test('le voile et la barre du haut prennent la teinte du theme, pas le bleu nuit de Loggia', () => {
  const d = css.indexOf('@supports (background: color-mix(in srgb, red 50%, transparent)) {\n  .o-wx3d-veil');
  assert.ok(d >= 0, 'le bloc color-mix du voile');
  const bloc = css.slice(d, css.indexOf('\n}', d));
  assert.ok(bloc.includes('.o-wx3d-veil { background: linear-gradient(180deg, color-mix(in srgb, var(--o-bg) 10%, transparent) 0%, color-mix(in srgb, var(--o-bg) 32%, transparent) 46%, color-mix(in srgb, var(--o-bg) 60%, transparent) 100%); }'), 'le voile sombre');
  assert.ok(bloc.includes('html.loggia-light .o-wx3d-veil { background: linear-gradient(180deg, color-mix(in srgb, var(--o-bg) 6%, transparent) 0%,'), 'le voile clair');
  assert.ok(bloc.includes('main:has(.o-wx3d) .loggia-hdr,') && bloc.includes('{ background: color-mix(in srgb, var(--o-bg) 38%, transparent) !important; }'), 'la barre du haut posee sur le ciel');
  // Sans color-mix, le repli garde l'ancienne teinte : rien ne casse.
  assert.ok(regle('.o-wx3d-veil').includes('rgba(11,16,27,.10) 0%'), 'le repli');
});

test('la rangee des scenarios ne rogne plus d’ombre en rectangle, a TOUTES les largeurs', () => {
  const d = css.indexOf('/* Scènes rapides : rangée qui défile (pas d\'empilement)');
  assert.ok(d >= 0, 'la regle du telephone');
  const bloc = css.slice(d, css.indexOf('/* Vue Pièce', d));
  assert.ok(bloc.includes('padding: 4px 4px 6px; margin: -4px -4px 0; scroll-padding-inline: 4px;'), 'de l’air pour l’anneau de focus, sans rien deplacer');
  assert.ok(bloc.includes('.grid-qscenes > button { flex: 0 0 150px; scroll-snap-align: start; }'), 'toujours 150 px par carte');
  /* Une ombre COURTE (ADR 0060), et desormais HORS du media du telephone
   * (20/09) : sur l'ordinateur la rangee defile aussi, et l'ombre longue du
   * theme — 32 px de flou pour 26 px de rembourrage — etait coupee net par
   * `overflow-x: auto`. On voyait « comme s'il y en avait 2, dont une tres
   * cubique ». Sans ombre du tout, la carte se confondait avec la page sur un
   * theme clair (1,01:1) : c'est donc une ombre courte, pas zero. */
  const regle = '.grid-qscenes > button { box-shadow: var(--o-shadow-rangee, 0 1px 2px rgba(0,0,0,.16), 0 3px 8px rgba(0,0,0,.12)) !important; }';
  assert.ok(css.includes(regle), 'une ombre courte, jamais rognée');
  assert.ok(!bloc.includes(regle), 'elle n’est plus enfermee dans le media du telephone');
  assert.ok(css.includes('html.loggia-light .grid-qscenes > button { box-shadow: var(--o-shadow-rangee, 0 1px 2px rgba(16,24,40,.10), 0 3px 8px rgba(16,24,40,.10)) !important; }'), 'sa version claire');
  assert.ok(!css.includes('.grid-qscenes > button { box-shadow: none'), 'plus d’ombre coupée en rectangle');
  // Le PC garde son rembourrage : la rangee laisse la place a l'ombre courte.
  assert.ok(css.includes('padding: 6px 6px 26px; margin: -6px -6px -26px;'), 'le PC inchange');
});
