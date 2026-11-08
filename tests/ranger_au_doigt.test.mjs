// ─────────────────────────────────────────────────────────────────────────────
// Ranger ses pièces et ses favoris au doigt, sur l'Accueil, hors édition (05/11, étape 5 du rapport sur l'usage ;
// son choix « Oui, appui long »).
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DASHBOARD } from './monolithe.mjs'; // l'Accueil en entier (ADR 0283)
import { APPUI_LONG_MS, avalerProchainClic } from '../src/glisser.js';

const BRIQUES = readFileSync(new URL('../src/accueil/briques.jsx', import.meta.url), 'utf8');

test('l’appui long dure une demi-seconde : un doigt qui hésite avant de défiler ne saisit rien', () => {
  assert.equal(APPUI_LONG_MS, 500);
});

test('le clic qui suit un glisser est avalé une fois, à la capture, et l’écoute part d’elle-même', async () => {
  const ecoutes = [];
  const doc = {
    addEventListener: (type, f, capture) => ecoutes.push({ type, f, capture }),
    removeEventListener: (type, f) => { const i = ecoutes.findIndex(e => e.type === type && e.f === f); if (i >= 0) ecoutes.splice(i, 1); },
  };
  avalerProchainClic(doc);
  assert.deepEqual(ecoutes.map(e => [e.type, e.capture]), [['click', true]], 'à la capture : avant la tuile');
  const faits = [];
  ecoutes[0].f({ stopPropagation: () => faits.push('stop'), preventDefault: () => faits.push('defaut') });
  assert.deepEqual(faits, ['stop', 'defaut'], 'la tuile rangée ne s’ouvre pas');
  assert.equal(ecoutes.length, 0, 'une fois seulement : le clic suivant passe');
  avalerProchainClic(doc);
  await new Promise(r => setTimeout(r, 500));
  assert.equal(ecoutes.length, 0, 'sans clic, l’écoute part seule');
  avalerProchainClic(null);
});

test('les pièces : hors édition, le doigt seul, après une demi-seconde ; la souris et le toucher court ouvrent la pièce', () => {
  // ASSERTION MODIFIÉE (05/11, « sur PC ça ne marche pas du tout ») : la souris range aussi hors édition, par le même appui long.
  assert.ok(DASHBOARD.includes('if (libre && e.button > 0) return;') && DASHBOARD.includes("if (e.pointerType === 'touch' || libre) {"), 'le doigt et la souris, par un appui long');
  assert.ok(DASHBOARD.includes('}, libre ? APPUI_LONG_MS : 200);'), 'une demi-seconde hors édition, 200 ms en édition');
  assert.ok(DASHBOARD.includes('if (libre) { try { hote.setPointerCapture(doigt); }'), 'le doigt capturé à la saisie seulement : le toucher court ouvre toujours la pièce');
  assert.ok(DASHBOARD.includes("onPointerDown={(e) => debutPiece(e, p.name, inner.map(x => x.name))}"), 'le geste est branché hors édition aussi');
  assert.ok(DASHBOARD.includes('if (!editMode) avalerProchainClic();'), 'la tuile rangée ne s’ouvre pas au lâcher');
  assert.ok(DASHBOARD.includes('{pieceDrag && pieceDrag.c > 0 && ('), 'la case visée se montre hors édition aussi');
});

test('partout où l’on range en édition, un appui long range hors édition — doigt ou souris (« va au bout », 05/11)', async () => {
  const lire = (f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
  const VUES = {
    'vues/objets.jsx': ['<div ref={ed.gridRef} {...ranger} className="grid-objets grid-dense"', '<div key={o.cle} data-id={o.cle}'],
    'vues/piece.jsx': ['<div ref={ed.gridRef} {...ranger} style=', '<Anim key={id} id={id}'],
    'views/energie.jsx': ['<div ref={ed.gridRef} {...ranger} className="grid-edevices"', '<Anim key={k} id={k}'],
    'views/securite.jsx': ['<div ref={ed.gridRef} {...ranger} id=', '<Anim key={k} id={k}'],
    'views/voletsplan.jsx': ['<div ref={ed.gridRef} {...ranger} style=', '<Anim key={k} id={k}'],
    'vues/scenarios.jsx': ['<div {...ranger} className="grid-scenarios"', 'onLancer={sc.lancer} dataId={s.id} sansDernier={edit}'],
    'cartescustom/vue.jsx': ['<div ref={grilleRef} {...ranger} className="grid-custom"', "attribut: 'data-cvk'"],
    'accueil/briques.jsx': ['<div {...rangerFav} className="o-favrow"', '<div ref={rangee} {...ranger} className="grid-qscenes"'],
  };
  for (const [f, attendus] of Object.entries(VUES)) {
    const s = lire(f);
    assert.ok(/useRangerLibre\(\{ (attribut: 'data-cvk', )?actif: !edit, /.test(s), f + ' : hors édition seulement');
    for (const a of attendus) assert.ok(s.includes(a), f + ' : ' + a);
  }
  for (const f of ['vues/objets.jsx', 'vues/piece.jsx', 'views/energie.jsx', 'views/securite.jsx', 'views/voletsplan.jsx']) {
    assert.ok(lire(f).includes('onRanger: (cle, cible) => ed.move(cle, ed.ids.indexOf(cible) - ed.ids.indexOf(cle))'), f + ' : l’ordre des flèches de l’édition');
  }
  assert.ok(lire('app/scenarios.jsx').includes('data-id={dataId || undefined}'), 'la carte d’un scénario porte sa clé');
  assert.ok(lire('ui.jsx').includes('data-id={id || undefined}'), '`Anim` porte la clé de sa carte');
  const css = lire('index.css');
  assert.ok(css.includes('[data-rangeable] { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }'));
  assert.ok(css.includes('[data-range="prise"]') && css.includes('[data-range="visee"]'), 'la prise s’efface, la place visée s’allume');
  const g = lire('glisser.js');
  assert.ok(g.includes("if (commande && commande !== carte && carte.contains(commande) && !commande.classList.contains('o-surface')) return;"),
    'une commande de la carte ne saisit rien — la carte elle-même ou sa surface, si');
  assert.ok(g.includes('}, APPUI_LONG_MS);') && g.includes('avalerProchainClic(g.carte.ownerDocument);'));
});
