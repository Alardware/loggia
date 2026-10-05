// ─────────────────────────────────────────────────────────────────────────────
// Les onglets de la fiche d'un robot : le motif ARIA entier (audit du 03/10).
//
// Les boutons portaient `role="tab"` et rien d'autre. Un lecteur d'écran
// annonçait donc une barre d'onglets — où l'on circule aux flèches — et les
// flèches ne faisaient rien ; chaque onglet restait un arrêt de Tab, et aucun
// ne désignait le panneau qu'il ouvre. Un rôle qui promet un comportement
// absent trompe davantage que pas de rôle du tout.
//
// La logique du clavier vit dans choix.js et se vérifie ici à sec ; le
// branchement se relit dans la source. Le dessin (bleu plein sur l'onglet
// choisi) ne bouge pas : tests/parametres_maquettes.test.mjs le garde.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ongletVoisin } from '../src/choix.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const ROBOT = lire('src', 'ficherobot.jsx');

/** Les sources JSX du produit, lues comme tests/clavier.test.mjs les lit :
 *  `src/` et `src/views/`, pas les copies de travail ignorées par git. */
function sources() {
  const out = [];
  for (const [dossier, sous] of [[join(RACINE, 'src'), 'src'], [join(RACINE, 'src', 'views'), 'src/views']]) {
    for (const f of readdirSync(dossier)) {
      if (f.endsWith('.jsx')) out.push([sous + '/' + f, readFileSync(join(dossier, f), 'utf8')]);
    }
  }
  return out;
}

test('le clavier d’une barre d’onglets : les flèches bouclent, Début et Fin vont aux bouts', () => {
  assert.equal(ongletVoisin(5, 0, 'ArrowRight'), 1);
  assert.equal(ongletVoisin(5, 4, 'ArrowRight'), 0, '→ sur le dernier revient au premier');
  assert.equal(ongletVoisin(5, 2, 'ArrowLeft'), 1);
  assert.equal(ongletVoisin(5, 0, 'ArrowLeft'), 4, '← sur le premier va au dernier');
  assert.equal(ongletVoisin(5, 3, 'Home'), 0);
  assert.equal(ongletVoisin(5, 1, 'End'), 4);
  // Les autres touches gardent leur rôle : Tab sort de la barre, Entrée et
  // Espace cliquent l'onglet, haut et bas font défiler la feuille.
  for (const t of ['Tab', 'Enter', ' ', 'ArrowUp', 'ArrowDown', 'Escape']) assert.equal(ongletVoisin(5, 2, t), -1, t + ' ne regarde pas la barre');
  assert.equal(ongletVoisin(0, 0, 'ArrowRight'), -1, 'sans onglet, rien à viser');
  assert.equal(ongletVoisin(undefined, 0, 'End'), -1);
  assert.equal(ongletVoisin(3, -1, 'ArrowRight'), 1, 'un rang perdu repart du premier');
  assert.equal(ongletVoisin(1, 0, 'ArrowLeft'), 0, 'un onglet seul reste où il est');
});

test('les onglets du robot : un seul arrêt de Tab, les flèches, un panneau désigné', () => {
  assert.ok(ROBOT.includes("import { ongletVoisin } from './choix.js';"), 'le clavier commun des barres d’onglets');
  assert.ok(ROBOT.includes('<div role="tablist" aria-label={robot.nom} className="rb-onglets"'), 'la barre a perdu son nom');
  assert.ok(ROBOT.includes("<button key={id} id={idOnglets + '-t-' + id} type=\"button\" role=\"tab\" aria-selected={actuel === id}"), 'chaque onglet a son identifiant');
  assert.ok(ROBOT.includes("aria-controls={actuel === id ? idOnglets + '-p-' + id : undefined} tabIndex={actuel === id ? 0 : -1}"),
    'l’onglet actif désigne son panneau, et lui seul est un arrêt de Tab');
  assert.ok(ROBOT.includes('onClick={() => setOnglet(id)} onKeyDown={(e) => allerOnglet(e, i)} className="rb-onglet"'), 'les flèches ne répondent plus');
  // Les flèches déplacent le focus ET ouvrent l'onglet.
  const d = ROBOT.indexOf('const allerOnglet = (e, i) => {');
  assert.ok(d > 0, 'le clavier des onglets a disparu');
  const corps = ROBOT.slice(d, ROBOT.indexOf('\n  };', d));
  assert.ok(corps.includes('const j = ongletVoisin(onglets.length, i, e.key);') && corps.includes('e.preventDefault();'));
  const f = corps.indexOf('voisin.focus()');
  assert.ok(f > 0 && f < corps.indexOf('setOnglet(onglets[j][0]);'), 'le focus ne suit plus l’onglet ouvert');
  // Le panneau, nommé par son onglet, enveloppe les cinq onglets — pas la page des réglages.
  const p = ROBOT.indexOf("<div role={avecOnglets ? 'tabpanel' : undefined} id={idOnglets + '-p-' + actuel} aria-labelledby={avecOnglets ? idOnglets + '-t-' + actuel : undefined}>");
  assert.ok(p > 0, 'plus de panneau désigné');
  const fin = ROBOT.indexOf("{actuel === 'reglages' && <PageReglages", p);
  assert.ok(fin > p, 'la page des réglages est entrée dans le panneau');
  for (const o of ['OngletAccueil', 'OngletZones', 'OngletPlanning', 'OngletHistorique', 'OngletEntretien']) {
    const k = ROBOT.indexOf('<' + o + ' ', p);
    assert.ok(k > p && k < fin, o + ' est sorti du panneau');
  }
  // Le hook des identifiants passe AVANT le retour anticipé : un hook ne se saute jamais.
  const h = ROBOT.indexOf('const idOnglets = useId();');
  assert.ok(h > 0 && h < ROBOT.indexOf('if (!idRobot || !robot.st) {'), 'useId appelé sous condition');
});

test('aucun rôle « tab » sans le comportement qu’il promet', () => {
  const fautes = [];
  for (const [nom, src] of sources()) {
    for (let i = src.indexOf('role="tab"'); i >= 0; i = src.indexOf('role="tab"', i + 1)) {
      // La balise ouvrante, écrite sur plusieurs lignes : de son `<` au `>` qui clôt une ligne.
      const balise = src.slice(src.lastIndexOf('<', i), src.indexOf('>\n', i) + 1);
      for (const attr of [' id=', 'aria-selected=', 'aria-controls=', 'tabIndex=', 'onKeyDown=']) {
        if (!balise.includes(attr)) fautes.push(nom + ' : un onglet sans ' + attr.trim());
      }
    }
    if (src.includes('role="tab"') && !(src.includes('role="tablist"') && src.includes('tabpanel') && src.includes('aria-labelledby='))) {
      fautes.push(nom + ' : des onglets sans barre ou sans panneau nommé');
    }
  }
  assert.deepEqual(fautes, [], 'un rôle « tab » promet les flèches et un panneau : sans eux, il trompe le lecteur d’écran');
});
