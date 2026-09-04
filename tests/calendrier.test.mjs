// ─────────────────────────────────────────────────────────────────────────────
// Le calendrier : la carte, et le mois qu'elle ouvre.
//
// `useAgenda` sert désormais deux besoins qui n'ont pas la même faim : le rail
// veut sept jours et huit événements, la feuille veut six semaines entières.
// Un seul hook, un paramètre — et le piège qui va avec : élargir la fenêtre
// pour la feuille l'élargirait aussi pour le rail, qui se mettrait à charger
// un mois pour afficher trois lignes.
//
// L'autre règle est celle des agendas : rien de coché signifie TOUS. Une
// maison qui n'a jamais ouvert ce réglage doit voir son calendrier, pas un
// mois vide — et il ne doit pas être possible de tout décocher.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

/** Le corps d'une fonction nommée, jusqu'à la suivante. */
function corps(entete) {
  const i = src.indexOf(entete);
  assert.notEqual(i, -1, `${entete} introuvable`);
  const fin = src.indexOf('\nfunction ', i + entete.length);
  assert.notEqual(fin, -1, `fin de ${entete} introuvable`);
  return src.slice(i, fin);
}

test('sans plage, l’agenda garde la fenêtre du rail', () => {
  const c = corps('function useAgenda(');
  // Les deux valeurs par défaut du rail. Les perdre ferait charger un mois
  // entier à une carte qui montre trois lignes.
  assert.match(c, /plage \? plage\.debut :/, 'la fenêtre par défaut a disparu');
  assert.match(c, /plage \? plage\.fin : new Date\(debut\.getTime\(\) \+ 7 \* 864e5\)/,
    'les sept jours du rail ont changé');
  assert.match(c, /plage \? tous : tous\.slice\(0, 8\)/,
    'le plafond de huit événements ne s’applique plus au rail seul');
});

test('changer de mois relit les événements', () => {
  const c = corps('function useAgenda(');
  const i = c.lastIndexOf('}, [');
  const deps = c.slice(i, c.indexOf(']);', i));
  // Sans les bornes dans les dépendances, la grille changerait de mois en
  // gardant les événements du précédent : des anneaux sur les mauvais jours.
  assert.match(deps, /plage \? plage\.debut\.getTime\(\)/, 'le début de plage n’est pas suivi');
  assert.match(deps, /plage \? plage\.fin\.getTime\(\)/, 'la fin de plage n’est pas suivie');
});

test('aucun agenda coché veut dire tous', () => {
  const c = corps('function FeuilleCalendrier(');
  // `choisis` vaut null tant que rien n'a été choisi ; `actifs` doit alors
  // retomber sur la liste complète, sinon le mois s'afficherait vide.
  assert.match(c, /\(choisis \|\| tousCals\)/, 'le repli sur tous les agendas a disparu');
  assert.match(c, /return l\.length \? l : tousCals;/,
    'une liste vide ne retombe plus sur tous les agendas');
  // Et l'on ne peut pas tout décocher : le dernier touché reste.
  assert.match(c, /const val = suiv\.length \? suiv : \[k\];/,
    'il redevient possible de tout décocher');
});

test('la grille tient six semaines, quel que soit le mois', () => {
  const c = corps('function FeuilleCalendrier(');
  // 42 cases : un mois qui commence un dimanche en occupe six. Une grille
  // qui change de hauteur ferait sauter la liste qui est dessous.
  assert.match(c, /length: 42/, 'la grille n’a plus six semaines fixes');
  assert.match(c, /42 \* 864e5/, 'la plage lue ne couvre plus la grille entière');
});

test('la carte du rail ouvre le mois', () => {
  const c = corps('function CvCalendrier(');
  assert.match(c, /role=\{onOpen \? 'button' : undefined\}/,
    'la carte n’annonce plus qu’elle est cliquable');
  // Au clavier aussi : une carte qui ne répond qu'à la souris exclut la
  // navigation au Tab.
  assert.match(c, /onKeyDown=/, 'la carte ne s’ouvre plus au clavier');
  // Le routage : un agenda n'a ni état ni commande, il ne doit pas tomber
  // sur la fiche d'entité universelle.
  assert.match(src, /if \(d === 'calendar'\) \{ setCalPop\(id\); return; \}/,
    'le calendrier ne route plus vers sa feuille');
});
