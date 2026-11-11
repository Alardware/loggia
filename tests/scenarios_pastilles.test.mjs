/* Les scénarios de l'Accueil en pastilles (ADR 0343) : la capture du 11/11, à la lettre — l'icône dans la couleur
 * du texte, le nom sur une ligne, 44 px de haut. La vue Scénarios garde ses cartes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const scn = lire('src/app/scenarios.jsx');
const acc = lire('src/accueil/briques.jsx');
const vue = lire('src/vues/scenarios.jsx');
const css = lire('src/index.css');
const debut = scn.indexOf('function PastilleScenario(');
const corps = scn.slice(debut, scn.indexOf('\n}\n', debut));

test('la pastille : l’icône et le nom sur une ligne, 44 px pour le doigt, ronde, avec le liseré du thème', () => {
  assert.ok(debut > 0 && /export \{[^}]*PastilleScenario/.test(scn));
  assert.ok(corps.includes("display: 'inline-flex', alignItems: 'center', gap: 9, height: 44,"));
  assert.ok(corps.includes('borderRadius: 999, border: LISERE,'));
  assert.ok(corps.includes("whiteSpace: 'nowrap'"), 'un nom ne passe jamais à la ligne');
  assert.ok(corps.includes("aria-label={tr('Lancer {x}', { x: nom })}"), 'le lecteur d’écran entend ce que fait l’appui');
});

test('comme la capture : l’icône dans la couleur du texte ; seul ce qui tourne prend sa teinte', () => {
  assert.ok(corps.includes("<Ico name={s.icone || 'sparkles'} size={16} color={enCours ? t.col : 'var(--o-text)'} />"));
  assert.ok(corps.includes("background: enCours ? lavisCarte(t.rgb, .26) : 'var(--o-s1)'"));
  assert.ok(corps.includes("title={enCours ? tr('En cours') : undefined}"));
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(\d/i.test(corps), 'aucune couleur écrite en dur');
  assert.ok(!corps.includes('libelleDernier'), 'le dernier lancement reste à la vue Scénarios');
});

test('l’Accueil pose des pastilles ; la vue Scénarios garde ses cartes', () => {
  assert.ok(acc.includes('{liste.map(s => <PastilleScenario key={s.id} s={s} enCours={sc.enCours === s.id} onLancer={sc.lancer} dataId={s.id} />)}'));
  assert.ok(!acc.includes('<CarteScenario key={s.id}'), 'plus de carte de 88 dans la rangée');
  assert.ok(vue.includes('<CarteScenario s={s} noms={sc.noms}'), 'la vue garde la carte de 184');
  assert.ok(acc.includes("<span style={{ height: 44 }} /></div>"), 'la réserve a la hauteur d’une pastille');
});

test('la rangée : chaque pastille à sa largeur, au téléphone comme sur PC, et elle défile', () => {
  const tel = css.slice(css.indexOf('/* Scènes rapides : rangée qui défile'), css.indexOf('/* Vue Pièce'));
  assert.ok(tel.includes('gap: 8px !important;') && tel.includes('.grid-qscenes > button { flex: 0 0 auto; scroll-snap-align: start; }'));
  const pc = css.slice(css.indexOf("/* ── Les scenarios de l'Accueil : UNE rangee qui defile"));
  assert.ok(pc.includes('display: flex; gap: 8px;') && pc.includes('overflow-x: auto;'));
  assert.ok(!css.includes('flex: 0 0 150px') && !css.includes('max(116px'), 'plus de largeur de carte');
});
