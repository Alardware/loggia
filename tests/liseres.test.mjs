// ─────────────────────────────────────────────────────────────────────────────
// « Liserés » borde TOUTES les cartes et tous les panneaux (04/10).
//
// Le réglage de l'Apparence (`look.hairline`) pose `--o-bw` à 0 quand il est
// coupé. Seuls le rail de l'Accueil, les panneaux de Paramètres et de l'Énergie
// lisaient ce jeton : les cartes de la maison (pièces, appareils, scénarios,
// vues perso, Sécurité) et les panneaux de Système et de la fiche du robot
// portaient `border: 'none'` en dur. Mesuré dans la démo, Liserés activé :
// 16 surfaces sur 27 sans trait à l'Accueil, 39 sur 42 dans Objets, 15 sur 15
// dans Système, 56 sur 59 dans la bibliothèque.
//
// Un seul trait, `LISERE` (styles.js), la valeur que le rail portait déjà ;
// `* { box-sizing: border-box }` le prend DANS la carte : 88 et 184 restent
// exacts. Coupé, `--o-bw: 0px` : le dessin d'avant, sans un pixel de plus.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// Un import d'ensemble : un nom manquant échoue en assertion, pas au chargement.
import * as STYLES from '../src/styles.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const { LISERE, CARTE_RAIL, CARTE_MAISON } = STYLES;
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('src', 'App.jsx');
const SYSTEME = lire('src', 'views', 'systeme.jsx');
const ROBOT = lire('src', 'ficherobot.jsx');
// La fiche du distributeur et son socle (ADR 0155, 05/10) : les mêmes panneaux que le robot.
const COMMUNE = lire('src', 'fichecommune.jsx');
const DISTRIBUTEUR = lire('src', 'fichedistributeur.jsx');

/** Le corps d'une fonction de premier niveau d'App.jsx. */
const corps = (nom) => {
  const i = APP.indexOf('\nfunction ' + nom + '(');
  assert.ok(i >= 0, nom + ' a disparu');
  return APP.slice(i + 1, APP.indexOf('\n}\n', i) + 2);
};
/** Une constante d'une ligne. */
const constante = (src, nom) => {
  const i = src.indexOf('const ' + nom + ' = {');
  assert.ok(i >= 0, nom + ' a disparu');
  return src.slice(i, src.indexOf('\n', i));
};

test('un seul trait : le jeton du thème, coupé par « Liserés »', () => {
  assert.equal(LISERE, 'var(--o-bw,1px) solid var(--o-bd2)');
  // Les cartes qui avaient déjà un trait gardent le même.
  assert.equal(CARTE_RAIL.border, LISERE);
  assert.equal(CARTE_MAISON.border, LISERE, 'le gabarit des cartes de la maison est encore sans trait');
  // Coupé, le jeton tombe à 0 — c'est lui seul qui efface tous les traits.
  assert.ok(lire('src', 'theme.js').includes("if (!L.hairline) root.style.setProperty('--o-bw', '0px');"));
  assert.ok(lire('src', 'ui.jsx').includes('hairline: true,'), 'activé par défaut');
  // Le trait se prend dans la carte : sans cette règle, 88 deviendrait 90.
  assert.match(lire('src', 'index.css'), /^\* \{ box-sizing: border-box; \}/m);
});

test('les cartes de la maison et des vues portent le liseré, aucune ne l’efface', () => {
  const racines = {
    // Gabarits partagés.
    card: constante(APP, 'card'),
    CV_CADRE: constante(APP, 'CV_CADRE'),
    // Cartes d'appareil : seule leur racine pose une bordure dans ces corps.
    RoomGenericCard: corps('RoomGenericCard'),
    RoomLightCard: corps('RoomLightCard'),
    RoomFeederCard: corps('RoomFeederCard'),
    RoomPlantCard: corps('RoomPlantCard'),
    RoomCoverCard: corps('RoomCoverCard'),
    RoomClimateCard: corps('RoomClimateCard'),
    RoomPilotCard: corps('RoomPilotCard'),
    RoomMediaCard: corps('RoomMediaCard'),
    CarteScenario: corps('CarteScenario'),
    CarteAttention: corps('CarteAttention'),
    CvCamera: corps('CvCamera'),
    CvCard: corps('CvCard'),
    // La chip (relecture du 04/10) : oubliée, et sans aucun contour sous Atrium.
    CvChip: corps('CvChip'),
    ApplianceCard: corps('ApplianceCard'),
    EditableCard: corps('EditableCard'),
  };
  for (const [nom, src] of Object.entries(racines)) {
    assert.ok(src.includes('border: LISERE'), nom + ' : la carte n’a plus le liseré du réglage');
  }
  // Les deux formes de la pièce (184 et 88).
  const piece = corps('PieceCard');
  assert.ok(piece.includes('style={{ ...card,'), 'la carte de pièce ne part plus du gabarit `card`');
  assert.ok(/className="o-piece o-piecechip"\n\s+style=\{\{[^]*?border: LISERE,/.test(piece), 'la pastille de pièce n’a plus le liseré');
});

test('les panneaux de Système et de la fiche du robot aussi', () => {
  assert.ok(constante(SYSTEME, 'SYS_PANNEAU').includes('border: LISERE'), 'Système : Charge, Versions, Journal, Réseau');
  assert.ok(constante(SYSTEME, 'SYS_CARTE').includes('...CARTE_MAISON'), 'Système : les tuiles partent du gabarit commun');
  assert.ok(constante(ROBOT, 'PANNEAU').includes('border: LISERE'), 'la fiche du robot');
  // Le distributeur : ses panneaux viennent du socle commun, qui porte le trait.
  assert.ok(constante(COMMUNE, 'PANNEAU').includes('border: LISERE'), 'le socle des fiches à onglets');
  assert.ok(/^import \{[^}]*\bPANNEAU\b[^}]*\} from '\.\/fichecommune\.jsx';$/m.test(DISTRIBUTEUR), 'la fiche du distributeur prend le panneau du socle');
  assert.ok(!/const PANNEAU = \{/.test(DISTRIBUTEUR), 'pas de panneau à elle, qui pourrait perdre le trait');
});

test('plus aucune surface de carte avec `border: \'none\'` en dur', () => {
  // Une surface de carte = le dégradé surfA → surfB. Le trait qui suit dans
  // le même objet de style ne doit pas être effacé. Les boutons et puces
  // posés SUR une carte ont leur propre fond : ils ne sont pas concernés.
  const motif = /linear-gradient\(180deg,var\(--o-surfA\),var\(--o-surfB\)\)[`']?,?\s*(?:\n\s*)?border: 'none'/g;
  for (const [f, src] of [['App.jsx', APP], ['systeme.jsx', SYSTEME], ['ficherobot.jsx', ROBOT], ['fichecommune.jsx', COMMUNE], ['fichedistributeur.jsx', DISTRIBUTEUR], ['styles.js', lire('src', 'styles.js')]]) {
    const vus = [...src.matchAll(motif)].map(m => src.slice(0, m.index).split('\n').length);
    assert.deepEqual(vus, [], f + ' : une surface de carte efface encore son liseré, ligne(s) ' + vus.join(', '));
  }
  // Le motif ci-dessus ne voyait la bordure qu'APRÈS le fond : la chip, qui
  // l'écrit avant, lui avait échappé (relecture du 04/10). Chaque
  // `border: 'none'` de src/ est donc lu dans l'objet qui le contient, quel
  // que soit l'ordre de ses clés — `style={{ … }}` comme constante
  // (`const card = { … }`), qu'un balayage des seuls `style={{` manquait.
  const fichiers = [];
  const parcours = (d) => {
    for (const n of readdirSync(join(RACINE, ...d), { withFileTypes: true })) {
      if (n.isDirectory()) { if (n.name !== 'langues') parcours([...d, n.name]); }
      else if (/\.(jsx|js)$/.test(n.name)) fichiers.push([...d, n.name]);
    }
  };
  parcours(['src']);
  const fautifs = [];
  for (const p of fichiers) {
    const src = lire(...p);
    for (const m of src.matchAll(/\bborder: (?:'none'|0|'0')[,\s}]/g)) {
      // L'accolade ouvrante non refermée la plus proche, puis sa fermante.
      let a = m.index, prof = 0;
      for (; a >= 0; a--) {
        if (src[a] === '}') prof++;
        else if (src[a] === '{' && prof-- === 0) break;
      }
      let b = m.index;
      for (prof = 0; b < src.length; b++) {
        if (src[b] === '{') prof++;
        else if (src[b] === '}' && prof-- === 0) break;
      }
      // Une surface de carte : son fond, son ombre, ou un gabarit étalé.
      if (/var\(--o-surfA\)|var\(--o-shadow[,)]|\.\.\.(?:card|CARTE_MAISON|CARTE_RAIL|CV_CADRE|RM_CARD|SYS_PANNEAU|PANNEAU)\b/.test(src.slice(a, b))) fautifs.push(p.slice(1).join('/') + ':' + src.slice(0, m.index).split('\n').length);
    }
  }
  assert.ok(fichiers.length > 20, 'le balayage de src/ ne trouve plus ses fichiers');
  assert.deepEqual(fautifs, [], 'une surface de carte efface encore son liseré');
});
