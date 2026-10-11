/* Enregistrer ou retirer une pièce : sa ligne dans la maison ET sa place sur
 * l'Accueil, dans le MÊME lot (audit du 03/10).
 *
 * Les deux n'ont pas les mêmes droits. `loggia_rooms` configure la maison :
 * elle est réservée aux administrateurs. La grille de l'Accueil
 * (`loggia_accueil`) et celle de la vue d'une pièce (`loggia_roomlayout`) ne
 * sont que de l'agencement, ouvert à tous (ADR 0125). La pièce et sa place
 * partaient en DEUX envois. Depuis un compte ordinaire, le premier était
 * refusé et le second passait : la grille commune portait déjà le nouveau nom,
 * ou avait déjà oublié la pièce retirée, alors que la pièce, elle, n'avait pas
 * bougé. Elle perdait sa taille et sa place, pour tout le foyer. Une pièce
 * ajoutée laissait, elle, une taille orpheline, dont hériterait la première
 * pièce venue sous ce nom.
 *
 * Un seul lot suffit : le composant ne coupe jamais un lot. Une clé de la
 * maison envoyée par un compte ordinaire fait refuser le lot ENTIER, avant la
 * moindre écriture (`_set_locked`, store.py). La grille ne change donc qu'avec
 * la pièce — jamais avant, jamais sans. Quand le transport coupe, les deux
 * attendent ensemble au carnet (`enattente.js`), qui les renvoie d'un bloc au
 * démarrage suivant.
 *
 * Attendre la réponse avant d'envoyer la grille ne tenait pas : une pièce
 * restée au carnet n'arrive qu'au chargement suivant — « indéfiniment s'il le
 * faut » (ADR 0109) —, quand plus personne n'est là pour écrire la grille
 * derrière elle. Le même décalage, chez l'administrateur cette fois.
 *
 * Rien ne part d'ici : ces fonctions composent. L'Accueil envoie le tout par
 * `saveAccL`, le passage unique qui empile pour « Défaire », et y reprend sa
 * grille si le lot est refusé.
 */

import { cfgVal, normRooms } from './state.js';

/* Les grilles des vues de pièce, rangées sous le nom de chaque pièce : la clé
 * que App.jsx nomme `ROOM_LAYOUT_KEY`. */
const GRILLES = 'loggia_roomlayout';

/** Une table de grilles lisible, quoi qu'on ait reçu. */
const table = (v) => ((v && typeof v === 'object' && !Array.isArray(v)) ? { ...v } : {});

/* Ces deux transformations s'appliquent à CHAQUE part de profil (11/10).
 *
 * Renommer ou retirer une pièce est commun à la maison — « la seule chose
 * commune à tous, c'est l'ajout, la suppression et la modification d'entités ».
 * Mais la grille de sa vue est un RANGEMENT, propre à chaque profil, et elle la
 * nomme. Transformer la seule part de qui renomme laisserait les autres avec
 * une grille qui pointe une pièce disparue, et leur ferait perdre son rangement
 * sans qu'ils y soient pour rien.
 *
 * `cfgSet` applique donc une valeur-fonction part par part : le nom change
 * partout, chacun garde son rangement. Rendre `null` efface la part — une table
 * vidée ne laisse pas de coquille. */
const renommerGrille = (brut, avant, apres) => {
  const g = table(brut);
  if (g[avant]) { g[apres] = g[avant]; delete g[avant]; }
  return Object.keys(g).length ? g : null;
};
const retirerGrille = (brut, nom) => {
  const g = table(brut);
  delete g[nom];
  return Object.keys(g).length ? g : null;
};

/** Le lot qui enregistre une pièce : `loggia_rooms` entière — la liste
 *  normalisée, jamais une pièce seule, sa ligne remplacée ou ajoutée (nom,
 *  icône, teinte, capteurs sous `haid`) — et, si elle change de nom, la grille
 *  de sa vue, qui la suit. */
export function lotPiece(avant, piece) {
  const liste = normRooms(cfgVal('loggia_rooms', null)).map(r => ({ ...r }));
  const i = avant ? liste.findIndex(r => r.room === avant) : -1;
  const entree = { ...(i >= 0 ? liste[i] : {}), ...piece };
  if (!entree.icon) delete entree.icon;
  if (!entree.teinte) delete entree.teinte;
  if (i >= 0) liste[i] = entree; else liste.push(entree);
  const maj = { loggia_rooms: liste };
  if (avant && avant !== piece.room) maj[GRILLES] = (brut) => renommerGrille(brut, avant, piece.room);
  return maj;
}

/** Le lot qui retire une pièce : sa ligne, et la grille de sa vue. */
export function lotSansPiece(nom) {
  return {
    loggia_rooms: normRooms(cfgVal('loggia_rooms', null)).filter(r => r.room !== nom),
    [GRILLES]: (brut) => retirerGrille(brut, nom),
  };
}

/** La place d'une pièce enregistrée, dans la grille du format en cours : la
 *  taille choisie dans la fiche ; renommée, elle emporte sa CELLULE et son
 *  rang — la carte ne saute pas ailleurs. Ajoutée, elle n'a que sa taille :
 *  `ordrePieces` la range en dernier. La grille reçue n'est pas modifiée. */
export function grilleAvecPiece(grille, avant, nom, compacte) {
  const g = grille || {};
  const renommee = !!avant && avant !== nom;
  const tailles = { ...(g.tailles || {}) };
  if (renommee) delete tailles[avant];
  tailles[nom] = compacte ? 'c' : 's';
  const places = { ...(g.places || {}) };
  if (renommee && places[avant]) { places[nom] = places[avant]; delete places[avant]; }
  return { tailles, places, piecesOrdre: (g.piecesOrdre || []).map(n => n === avant ? nom : n) };
}

/** Une pièce retirée de la grille du format en cours : sa taille, sa cellule
 *  et son rang. */
export function grilleSansPiece(grille, nom) {
  const g = grille || {};
  const { [nom]: _retiree, ...tailles } = g.tailles || {};
  const { [nom]: _place, ...places } = g.places || {};
  return { tailles, places, piecesOrdre: (g.piecesOrdre || []).filter(n => n !== nom) };
}
