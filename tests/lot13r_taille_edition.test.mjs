/* Le bouton de taille d'une carte en édition (relecture du lot 13, 04/10).
 *
 * Le lot 13 a retiré le `role="button"` qui englobait la carte d'Objets
 * (EditableCard) et la tuile de pièce de l'Accueil (CartePieceEdition), et
 * réglé la bascule de largeur des vues personnalisées — pas leur bouton de
 * taille, en coin. Son nom suivait son état, et `aria-pressed` le
 * contredisait : une carte d'une rangée
 * s'annonçait « Deux rangées · Plafonnier, enfoncé », une pièce en deux
 * rangées « Une rangée · Salon, enfoncé » — les deux boutons, en plus,
 * inversés l'un de l'autre. Le motif est celui de la largeur des vues
 * personnalisées (tests/lot13_vues_perso) : UN nom, l'état dans
 * `aria-pressed`, l'infobulle garde le geste. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const NL = '\n';
const bloc = (debut) => { const i = app.indexOf(debut); assert.ok(i >= 0, debut + ' introuvable'); return app.slice(i, app.indexOf(NL + 'function ', i + 1)); };
// La balise du bouton de taille : du `<button` qui précède l'icône `resize` jusqu'à elle.
const bouton = (c) => { const f = c.indexOf('<Fi i="resize" size={13} />'); assert.ok(f >= 0, 'bouton de taille introuvable'); return c.slice(c.lastIndexOf('<button', f), f); };

test('la carte d’Objets : la bascule de taille garde un nom, et « enfoncé » veut dire une rangée', () => {
  const c = bloc('function EditableCard(');
  assert.ok(c.includes("compact ? 'o-cvrow1' : ''"), '`compact` vrai, c’est la carte d’une rangée');
  const b = bouton(c);
  assert.ok(b.includes('aria-pressed={compact}'), 'enfoncé = une rangée');
  assert.ok(b.includes("aria-label={tr('Une rangée') + ' · ' + (nom || id)}"), 'une carte d’une rangée s’annonce « Deux rangées, enfoncé »');
  assert.ok(!/aria-label=\{\(?compact \?/.test(b), 'le nom suit encore l’état que dit aria-pressed');
  assert.ok(b.includes("title={compact ? tr('Deux rangées') : tr('Une rangée')}"), 'l’infobulle garde le geste à venir');
});

test('la tuile de pièce de l’Accueil : la même bascule, dans le même sens', () => {
  assert.ok(bloc('function Dashboard(').includes("<CartePieceEdition p={p} compacte={t === 'c'}"), '`compacte` vrai, c’est la tuile d’une rangée');
  const b = bouton(bloc('function CartePieceEdition('));
  assert.ok(b.includes('aria-pressed={compacte}') && !b.includes('aria-pressed={!compacte}'), 'l’état est inversé par rapport à la carte d’Objets');
  assert.ok(b.includes("aria-label={tr('Une rangée') + ' · ' + p.name}"), 'une pièce en deux rangées s’annonce « Une rangée, enfoncé »');
  assert.ok(!/aria-label=\{\(?compacte \?/.test(b), 'le nom suit encore l’état que dit aria-pressed');
  assert.ok(b.includes("title={compacte ? tr('Deux rangées') : tr('Une rangée')}"), 'l’infobulle garde le geste à venir');
});
