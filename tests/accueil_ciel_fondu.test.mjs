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

test('le ciel s’efface sur le fond du theme, quel qu’il soit', () => {
  /* Depuis le ciel du handoff du 17/10, le shader se fond LUI-MEME dans la
   * couleur du theme (`uFond`, lu sur `--o-bg`) et finit exactement sur elle :
   * sur un fond uni, pas de masque — il hatait le fondu. */
  const ciel = regle('.o-wx3d');
  const ciel3d = readFileSync(join(RACINE, 'src', 'ciel.js'), 'utf8');
  assert.ok(ciel3d.includes("getPropertyValue('--o-bg')") && ciel3d.includes('uniform vec3 uFond'), 'le ciel ne se fond plus dans la couleur du theme');
  assert.ok(ciel3d.includes('float f=smoothstep(uZone+.14,0.,uv.y)'), 'le shader ne finit plus sur la couleur du fond a sa derniere ligne');
  assert.ok(!ciel.includes('mask-image'), 'sur fond uni, un masque en plus du fondu du shader hate la transition');
  /* Mais la page est peinte de `--o-bggrad` — ou d'une photo : le shader y
   * finirait sur une couleur unie, la marche que l'ADR 0059 a retiree. Pour
   * eux, le masque long revient et rend le vrai fond. */
  const long = css.slice(css.indexOf('html[style*="--o-bggrad"] .o-wx3d, body:has(.o-fond-photo) .o-wx3d {'));
  assert.ok(long.length < css.length, 'les fonds degrades et la photo n’ont plus leur masque long');
  const blocLong = long.slice(0, long.indexOf('}'));
  assert.ok(blocLong.includes('-webkit-mask-image: linear-gradient(180deg, #000 0%, #000 30%,') && blocLong.includes('rgba(0,0,0,.06) 90%, transparent 100%);'), 'le masque long d’ADR 0059, prefixe, qui finit transparent');
  assert.ok(src.includes('<div className="o-fond-photo" aria-hidden="true"'), 'le calque de la photo ne se reconnait plus : le masque long ne s’y appliquerait pas');
  assert.ok(readFileSync(join(RACINE, 'src', 'theme.js'), 'utf8').includes("set('--o-bggrad', v.bggrad)"), 'un theme a degrade ne pose plus `--o-bggrad` sur <html> : le selecteur du masque long ne le verrait pas');
  assert.ok(src.includes("background: fondPhotoActif ? 'transparent' : 'var(--o-bggrad, var(--o-bg))'"), 'la page est peinte du degrade du theme');
  for (const sel of ['.o-wx3d-veil', 'html.loggia-light .o-wx3d-veil']) {
    assert.ok(!regle(sel).includes('var(--o-bg) 100%'), sel + ' ne recouvre plus le bas du ciel d’une couleur opaque');
  }
  // Le ciel plein ecran (`o-sky-full`, `html.loggia-sky`) n'avait plus rien qui
  // l'allume : ses regles sont parties au lot 15 de l'audit du 03/10.
  assert.ok(!css.includes('o-sky-full') && !css.includes('loggia-sky'), 'plus de regle pour un ciel que rien n’allume');
  assert.ok(css.includes('main:has(.o-wx3d) .loggia-hdr { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }'), 'au-dessus du ciel meteo, l’en-tete ne floute toujours pas');
});

test('la barre du haut prend la teinte du theme, aux dosages de la maquette ; le voile ne voile plus', () => {
  const d = css.indexOf('@supports (background: color-mix(in srgb, red 50%, transparent)) {\n  main:has(.o-wx3d) .loggia-hdr');
  assert.ok(d >= 0, 'le bloc color-mix de la barre du haut');
  const bloc = css.slice(d, css.indexOf('\n}', d));
  // « Loggia Vues v2 » : 30 % du fond en sombre, 40 % en clair, 80 % en clair sous un ciel sombre.
  assert.ok(bloc.includes('main:has(.o-wx3d) .loggia-hdr { background: color-mix(in srgb, var(--o-bg) 30%, transparent) !important; }'), 'la barre du haut, en sombre');
  assert.ok(bloc.includes('html.loggia-light main:has(.o-wx3d) .loggia-hdr { background: color-mix(in srgb, var(--o-bg) 40%, transparent) !important; }'), 'en clair');
  assert.ok(bloc.includes('html.loggia-light main:has(.o-wx3d-sombre) .loggia-hdr { background: color-mix(in srgb, var(--o-bg) 80%, transparent) !important; }'), 'en clair, sous un ciel sombre');
  // Sans color-mix, un repli : rien ne casse.
  assert.ok(css.includes('main:has(.o-wx3d) .loggia-hdr { background: rgba(11, 16, 27, .30) !important; }'), 'le repli');
  // Le voile de la maquette : une ombre sous l'en-tete en sombre, rien en clair. Le ciel s'eclaire lui-meme.
  assert.ok(regle('.o-wx3d-veil').includes('linear-gradient(180deg, rgba(0,0,0,.18) 0%, transparent 26%)'), 'le voile sombre de la maquette');
  assert.ok(regle('html.loggia-light .o-wx3d-veil').includes('background: none;'), 'pas de voile en clair');
});

test('theme clair sous un ciel sombre : le texte pose sur le ciel passe au blanc', () => {
  /* Le voile clair d'avant eclaircissait le ciel de nuit, et le texte fonce
   * restait lisible. Le ciel du 17/10 n'en a plus : la nuit, l'orage, l'averse
   * et la grele le rendent sombre en theme clair aussi. */
  assert.ok(src.includes("className={'o-wx3d' + (cielSombre ? ' o-wx3d-sombre' : '')}"), 'le calque ne dit plus quand le ciel est sombre');
  for (const sel of ['.o-greet-hi', '.o-greet-facts', '.o-greet-name', '.o-banner-metrics div']) {
    assert.ok(css.includes('html.loggia-light main:has(.o-wx3d-sombre) ' + sel), sel + ' reste fonce sur un ciel sombre');
  }
  assert.ok(css.includes('html.loggia-light .o-sur-ciel > h2 { color: rgba(255, 255, 255, .92) !important;'), 'les titres de section poses sur le ciel restent fonces');
  const hote = readFileSync(join(RACINE, 'src', 'wx3d.jsx'), 'utf8');
  assert.ok(hote.includes("l.classList.toggle('o-sur-ciel', (r.top + r.bottom) / 2 < lim)"), 'plus rien ne mesure quels titres sont poses sur le ciel');
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
