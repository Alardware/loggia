/* Le focus se voit aussi en mode édition (audit du 03/10).
 *
 * Le pointillé des cartes qu'on saisit — carte du kit et intertitre, tuile de
 * pièce de l'Accueil, scénario, carte d'une vue personnalisée — était posé en
 * style EN LIGNE. Un style en ligne bat toute règle de la feuille : celui-ci
 * battait `:focus-visible` (index.css), et au clavier la carte qui avait le
 * focus ressemblait à ses voisines. Le pointillé vit désormais dans une
 * classe, `.o-pointille`, qui a sa propre règle de focus. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const NL = '\n';
const bloc = (debut) => { const i = app.indexOf(debut); assert.ok(i >= 0, debut + ' introuvable'); return app.slice(i, app.indexOf(NL + 'function ', i + 1)); };

test('aucun contour posé en style en ligne : il battrait la règle :focus-visible', () => {
  /* Le fantôme d'un glisser garde son `st.outline = 'none'` : une copie qui
   * suit le pointeur ne reçoit jamais le focus, et ce n'est pas un objet de
   * style React — le motif ne le voit pas. */
  const enLigne = app.match(/\boutline: '|\boutlineOffset:/g) || [];
  assert.deepEqual(enLigne, [], 'un contour en ligne cache de nouveau le focus au clavier');
});

test('la classe du pointillé a sa règle de focus, et la carte saisie son trait plein', () => {
  assert.ok(css.includes(':focus-visible { outline: 2px solid var(--o-accent); outline-offset: 2px; }'), 'la règle générale');
  assert.ok(css.includes('.o-pointille { outline: 1px dashed rgba(var(--o-accent-rgb), var(--o-pointille, .4)); outline-offset: var(--o-pointille-ecart, 3px); }'), 'le pointillé, dosé par chaque carte');
  assert.ok(css.includes('.o-pointille.o-saisie, .o-pointille:focus-visible { outline: 2px solid var(--o-accent); }'), 'le focus et la saisie remplacent le pointillé');
  // La règle de focus doit venir APRÈS la règle générale et rester plus
  // spécifique que `.o-pointille` seule : sinon le pointillé reprend le dessus.
  assert.ok(css.indexOf('.o-pointille:focus-visible') > css.indexOf(':focus-visible { outline: 2px'), 'dans l’ordre de la cascade');
});

test('les cinq cartes qu’on déplace au clavier portent la classe', () => {
  const c = bloc('function EditableCard(');
  assert.ok(c.includes('className="o-pointille" style={{'), 'l’intertitre');
  assert.ok(c.includes("const classes = ['o-pointille',") && (c.match(/className=\{classes\}/g) || []).length === 2, 'la carte du kit, compacte et standard');
  assert.ok(bloc('function Dashboard(').includes("editMode ? 'o-pointille' : '', saisie ? 'o-saisie' : ''"), 'la tuile de pièce de l’Accueil');
  assert.ok(bloc('function ScenariosView(').includes("className={edit ? 'o-pointille' : undefined}"), 'le scénario, en édition');
  assert.ok(bloc('function CarteScenario(').includes('className={className}'), 'que la carte transmet à son bouton');
  /* La vue personnalisee passe par la TUILE depuis le 06/10 : le pointille
   * vient d'elle (`classes`, plus haut), son enveloppe ne garde que le
   * trait plein de la carte saisie. */
  assert.ok(bloc('function CustomView(').includes("saisie ? 'o-saisie' : ''"), 'la carte d’une vue personnalisée');
});
