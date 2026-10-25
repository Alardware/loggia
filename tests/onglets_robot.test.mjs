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
  /* ASSERTION MODIFIÉE (chantier IoT, tâche 8, 18/10 ; I15) : la fiche du robot passe sur le socle commun des fiches
   * (fichecommune.jsx, ADR 0155). Sa barre (`FicheOnglets`) et son panneau (`PanneauOnglet`) sont ceux du distributeur, du
   * chauffage, d'un volet — qui tenaient ce motif du robot : on le relit donc LÀ, puis on vérifie que le robot s'en sert. */
  const COMMUNE = lire('src', 'fichecommune.jsx');
  assert.ok(COMMUNE.includes("import { ongletVoisin } from './choix.js';"), 'le clavier commun des barres d’onglets');
  assert.ok(COMMUNE.includes('<div role="tablist" aria-label={nom} className="rb-onglets"'), 'la barre a perdu son nom');
  assert.ok(COMMUNE.includes("<button key={id} id={idBase + '-t-' + id} type=\"button\" role=\"tab\" aria-selected={actuel === id}"), 'chaque onglet a son identifiant');
  assert.ok(COMMUNE.includes("aria-controls={actuel === id ? idBase + '-p-' + id : undefined} tabIndex={actuel === id ? 0 : -1}"),
    'l’onglet actif désigne son panneau, et lui seul est un arrêt de Tab');
  assert.ok(COMMUNE.includes('onClick={() => onChoisir(id)} onKeyDown={(e) => aller(e, i)} className="rb-onglet"'), 'les flèches ne répondent plus');
  // Les flèches déplacent le focus ET ouvrent l'onglet.
  const d = COMMUNE.indexOf('const aller = (e, i) => {');
  assert.ok(d > 0, 'le clavier des onglets a disparu');
  const corps = COMMUNE.slice(d, COMMUNE.indexOf('\n  };', d));
  assert.ok(corps.includes('const j = ongletVoisin(onglets.length, i, e.key);') && corps.includes('e.preventDefault();'));
  const f = corps.indexOf('voisin.focus()');
  assert.ok(f > 0 && f < corps.indexOf('onChoisir(onglets[j][0]);'), 'le focus ne suit plus l’onglet ouvert');
  assert.ok(COMMUNE.includes("<div role={avecOnglets ? 'tabpanel' : undefined} id={idBase + '-p-' + actuel} aria-labelledby={avecOnglets ? idBase + '-t-' + actuel : undefined}>"), 'plus de panneau désigné');
  // Le robot s'en sert : la barre nommée par lui ; le panneau enveloppe les quatre onglets — pas la page des réglages.
  assert.ok(ROBOT.includes('{avecOnglets && <FicheOnglets idBase={idOnglets} nom={nom} onglets={onglets} actuel={actuel} onChoisir={setOnglet} />}'), 'la barre commune');
  const p = ROBOT.indexOf('<PanneauOnglet idBase={idOnglets} actuel={actuel} avecOnglets={avecOnglets}>');
  assert.ok(p > 0, 'plus de panneau désigné');
  const fin = ROBOT.indexOf('</PanneauOnglet>', p);
  for (const o of ['OngletAccueil', 'OngletPlanning', 'OngletHistorique', 'OngletEntretien']) {
    const k = ROBOT.indexOf('<' + o + ' ', p);
    assert.ok(k > p && k < fin, o + ' est sorti du panneau');
  }
  assert.ok(ROBOT.indexOf('<PageReglagesAppareil ', fin) > fin, 'la page des réglages est entrée dans le panneau');
  // Le hook des identifiants passe AVANT le retour anticipé : un hook ne se saute jamais.
  const h = ROBOT.indexOf('const idOnglets = useId();');
  assert.ok(h > 0 && h < ROBOT.indexOf('if (!idRobot || !st) {'), 'useId appelé sous condition');
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
