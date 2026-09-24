/* Le mode edition au clavier (ADR 0068, 22/09).
 *
 * Le kit commun savait deja ; les trois rangements a part et la barre de
 * position d'un media suivent la meme regle : le focus, les fleches, un cran. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const NL = '\n';
const bloc = (debut) => { const i = app.indexOf(debut); assert.ok(i >= 0, debut + ' introuvable'); return app.slice(i, app.indexOf(NL + 'function ', i + 1)); };

test('le kit commun : la carte au focus se deplace aux fleches, Entree ouvre sa fiche', () => {
  const c = bloc('function EditableCard(');
  assert.ok(c.includes("if (e.key === 'ArrowLeft') { e.preventDefault(); ed.move(id, -1); }") && c.includes("else if (e.key === 'ArrowRight') { e.preventDefault(); ed.move(id, 1); }"), 'les fleches');
  assert.ok(c.includes("role=\"button\" tabIndex={0} {...prise}"), 'focalisable');
});

test('les sections de l’Accueil et les tuiles des pieces : focus en edition, fleches, un cran, l’ordre de la souris', () => {
  const d = bloc('function Dashboard(');
  for (const nom of ['deplacerSec', 'clavierSec', 'deplacerPiece', 'clavierPiece']) assert.ok(d.includes('const ' + nom + ' = '), nom);
  assert.ok(d.includes("saveGrille({ [zone]: a });"), 'les sections gardent leur ordre');
  /* Depuis le 23/09 une pièce n'a plus un rang mais une CELLULE : la flèche la
   * déplace d'une case, dans le sens de la flèche — le même geste que le
   * doigt, et le même résultat. */
  assert.ok(d.includes('const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];'), 'les quatre sens');
  assert.ok(d.includes("saveGrille({ places: nettoyer(poser(grille.places, noms, t, id, c, r, piecesCols), noms) });"), 'la meme pose que la souris');
  assert.ok(d.includes("onKeyDown={editMode ? (e) => clavierSec(e, zone, id) : undefined}") && d.includes("onKeyDown={editMode ? (e) => clavierPiece(e, p.name, inner.map(x => x.name)) : undefined}"), 'branche sur les deux enveloppes');
  assert.ok(d.includes("tabIndex={editMode ? 0 : undefined}") && d.includes("tr('Déplacer avec les flèches')"), 'focalisable et nomme, en edition seulement');
  // Un bouton du bandeau garde ses touches : seul l'element lui-meme compte.
  assert.equal((d.match(/if \(e\.target !== e\.currentTarget\) return;/g) || []).length, 2, 'deux gardes, une par rangement');
});

test('les cartes d’une vue personnalisee suivent la meme regle', () => {
  const v = bloc('function CustomView(');
  assert.ok(v.includes('const deplacerCv = ') && v.includes('const clavierCv = ') && v.includes('setEnts(a);'), 'le rangement');
  assert.ok(v.includes("onKeyDown={edit ? (e) => clavierCv(e, x) : undefined}") && v.includes("tabIndex={edit ? 0 : undefined}"), 'branche, en edition seulement');
  assert.ok(v.includes('if (e.target !== e.currentTarget) return;'), 'les boutons de la barre gardent leurs touches');
});

test('l’appui long qui saisit ne selectionne pas le texte ni n’ouvre le menu du telephone', () => {
  // Les trois enveloppes a part, et les deux formes de la carte du kit.
  const n = (app.match(/touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none'/g) || []).length;
  assert.ok(n >= 5, 'cinq enveloppes de glisser sans selection : ' + n);
});

test('le bandeau d’edition dit le geste, selon l’appareil', () => {
  const b = bloc('function BandeauEdition(');
  assert.ok(b.includes("const tactile = useCoarse();") && b.includes("tactile ? tr('Au doigt : maintiens une carte, puis glisse-la.') : tr('Au clavier : Tab jusqu’à une carte, puis les flèches.')"), 'au doigt ou au clavier');
  assert.ok(b.includes("<span style={{ color: 'var(--o-text3)' }}>{geste}</span>"), 'apres le texte de la vue');
  const en = readFileSync(new URL('../src/langues/en.js', import.meta.url), 'utf8');
});

test('la barre de position d’un media est un curseur, par l’aide de la barre de volume ; lecture / pause a un nom', () => {
  assert.ok(app.includes("{...(np.dur ? kbSlider(tr('Position dans le morceau'), pct, chercher) : {})} aria-valuetext={np.dur ? fmtT(showPos) : undefined}"), 'kbSlider, et la valeur lue en temps');
  assert.ok(app.includes("onPointerDown={np.dur ? bar(chercher, pct, 'data-sk') : undefined}"), 'le pointeur passe par le meme chemin');
  assert.ok(app.includes("aria-label={np.playing ? tr('Pause') : tr('Lire')} onClick={() => commander(hass, np.ctl, 'play_pause')}"), 'le bouton dit ce qu’il fait');
  const en = readFileSync(new URL('../src/langues/en.js', import.meta.url), 'utf8');
});
