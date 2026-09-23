/* Poser une carte où l'on veut, sans que rien d'autre ne bouge (23/09).
 *
 * Retour de l'utilisateur, devant la grille des pièces de l'Accueil : « admettons
 * que sur cette image je veuille placer une pièce sous la salle de bain, je ne
 * peux pas ». C'était vrai : les pièces étaient une LISTE ordonnée, posée par le
 * navigateur en `grid-auto-flow: row dense` — chaque carte tombait dans le
 * premier creux où elle tenait, et un trou n'était jamais un endroit qu'on vise,
 * seulement un reste.
 *
 * Ici une carte a une CELLULE : une colonne, une rangée. Les rangées font 88 px,
 * la hauteur d'une carte compacte ; une standard en occupe deux. Un trou est
 * donc une cellule vide, et il le reste.
 *
 * Ce que ce module garantit :
 *   - déposer sur une cellule libre ne déplace QUE la carte déposée ;
 *   - déposer sur une carte l'échange avec elle, et personne d'autre ne bouge ;
 *   - une place enregistrée pour un écran plus large se rabat sur la dernière
 *     colonne au lieu de disparaître ;
 *   - une pièce sans place — une nouvelle — prend la première cellule libre.
 *
 * Tout y est pur : aucune lecture du DOM, aucun état. L'écran fournit les noms,
 * les tailles et le nombre de colonnes qu'il a vraiment.
 */

/** Hauteur d'une rangée, en pixels — `grid-auto-rows` de `.grid-chips`. */
export const RANGEE = 88;
/** L'écart entre deux cartes, en pixels. */
export const ECART = 8;

/** Une carte compacte occupe une rangée, une standard deux. */
export const hauteur = (taille) => (taille === 'c' ? 1 : 2);

const entier = (v, defaut = 1) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : defaut;
};

const borner = (v, min, max) => Math.max(min, Math.min(max, v));

/** Les rangées qu'il est raisonnable d'offrir : de quoi tout poser, plus deux
 *  de rab pour pouvoir décaler vers le bas. Sans cela, un doigt qui glisse loin
 *  sous la grille créerait une colonne de mille rangées vides. */
export function rangeesMax(noms, tailles, cols) {
  const n = Math.max(1, entier(cols, 1));
  const total = (noms || []).reduce((s, nom) => s + hauteur((tailles || {})[nom]), 0);
  return Math.ceil(total / n) + 2;
}

/** La première cellule libre pour une carte de `h` rangées, en balayant de
 *  gauche à droite puis vers le bas. `depart` permet de ne chercher qu'à partir
 *  d'une rangée : la tuile « Ajouter une pièce » se met APRÈS tout le monde,
 *  elle ne vient pas se loger dans un creux qu'on a voulu vide. */
export function premiereLibre(occupees, cols, h, maxRangees = 400, depart = 1) {
  const n = Math.max(1, entier(cols, 1));
  for (let r = Math.max(1, entier(depart, 1)); r <= maxRangees; r += 1) {
    for (let c = 1; c <= n; c += 1) {
      let libre = true;
      for (let i = 0; i < h; i += 1) if (occupees.has(c + ':' + (r + i))) { libre = false; break; }
      if (libre) return { c, r };
    }
  }
  return { c: 1, r: maxRangees + 1 };
}

/**
 * Où chaque carte se pose VRAIMENT : `{ nom: {c, r} }`.
 *
 * `places` est ce que l'utilisateur a choisi — il peut être vide, incomplet, ou
 * avoir été fait sur un écran plus large. On le respecte autant que possible :
 * une colonne hors champ se rabat sur la dernière, deux cartes au même endroit
 * ne se superposent jamais (la plus haute-gauche garde la place, l'autre
 * descend), et ce qui n'a pas de place prend le premier creux.
 */
export function disposer(noms, tailles, places, cols) {
  const n = Math.max(1, entier(cols, 1));
  const liste = Array.isArray(noms) ? noms : [];
  const t = tailles || {};
  const p = places || {};
  const occupees = new Set();
  const out = {};
  const maxR = Math.max(rangeesMax(liste, t, n), 8) + liste.length * 2;

  const poserLa = (nom, c, r) => {
    const h = hauteur(t[nom]);
    for (let i = 0; i < h; i += 1) occupees.add(c + ':' + (r + i));
    out[nom] = { c, r };
  };

  // Les cartes placées d'abord, de haut en bas puis de gauche à droite : l'ordre
  // décide qui garde sa cellule quand deux se recouvrent.
  const placees = liste.filter(nom => p[nom] && Number.isFinite(Number(p[nom].c)))
    .sort((a, b) => (entier(p[a].r) - entier(p[b].r)) || (entier(p[a].c) - entier(p[b].c)) || (a < b ? -1 : 1));
  for (const nom of placees) {
    const c = borner(entier(p[nom].c), 1, n);
    let r = Math.max(1, entier(p[nom].r));
    const h = hauteur(t[nom]);
    const libre = (rr) => { for (let i = 0; i < h; i += 1) if (occupees.has(c + ':' + (rr + i))) return false; return true; };
    while (!libre(r) && r <= maxR) r += 1;
    poserLa(nom, c, r);
  }
  // Puis les autres, dans l'ordre reçu : une pièce qui vient d'arriver comble le
  // premier creux plutôt que de s'ajouter tout en bas.
  for (const nom of liste) {
    if (out[nom]) continue;
    const { c, r } = premiereLibre(occupees, n, hauteur(t[nom]), maxR);
    poserLa(nom, c, r);
  }
  return out;
}

/**
 * Poser `nom` sur la cellule (c, r). Rend de NOUVELLES places.
 *
 * Cellule libre : seule cette carte bouge. Cellule occupée : les deux
 * s'échangent. Une standard lâchée sur deux compactes en touche deux : la
 * première prend la place libérée, la seconde repart au premier creux — c'est
 * le seul cas où une troisième carte se déplace, et il n'a pas d'autre issue.
 */
export function poser(places, noms, tailles, nom, c, r, cols) {
  const liste = Array.isArray(noms) ? noms : [];
  if (liste.indexOf(nom) < 0) return places || {};
  const n = Math.max(1, entier(cols, 1));
  const t = tailles || {};
  const cible = { c: borner(entier(c), 1, n), r: borner(entier(r), 1, rangeesMax(liste, t, n)) };
  const actuel = disposer(liste, t, places, n);
  const mienne = actuel[nom];
  if (!mienne) return places || {};

  const h = hauteur(t[nom]);
  const miennes = new Set();
  for (let i = 0; i < h; i += 1) miennes.add(cible.c + ':' + (cible.r + i));
  const genees = liste.filter(autre => {
    if (autre === nom) return false;
    const a = actuel[autre];
    const ha = hauteur(t[autre]);
    for (let i = 0; i < ha; i += 1) if (miennes.has(a.c + ':' + (a.r + i))) return true;
    return false;
  }).sort((a, b) => (actuel[a].r - actuel[b].r) || (actuel[a].c - actuel[b].c));

  /* On écrit la place de TOUT LE MONDE, pas seulement de la carte déplacée.
   *
   * Vérifié dans le navigateur le 23/09 : sans cela, les cartes sans place
   * enregistrée — toutes, au premier geste — se recalaient au premier creux, et
   * le trou laissé par la carte qu'on vient de bouger se remplissait aussitôt.
   * Tout bougeait, ce qui est exactement ce qu'il ne fallait pas. Poser une
   * carte fige donc la grille telle qu'elle est à cet instant : chacune garde
   * sa cellule, et un trou reste un trou. */
  const neuf = { ...(places || {}), ...actuel };
  neuf[nom] = cible;
  if (genees.length) {
    neuf[genees[0]] = { c: mienne.c, r: mienne.r };
    // Les suivantes n'ont pas de place évidente : on les rend au premier creux.
    genees.slice(1).forEach(autre => { delete neuf[autre]; });
  }
  return neuf;
}

/** La cellule sous le pointeur. `rect` est celui de la grille. */
export function cellulePointee(x, y, rect, cols, rangee = RANGEE, ecart = ECART) {
  const n = Math.max(1, entier(cols, 1));
  const largeur = (rect.width - ecart * (n - 1)) / n;
  const c = borner(Math.floor((x - rect.left) / Math.max(1, largeur + ecart)) + 1, 1, n);
  const r = Math.max(1, Math.floor((y - rect.top) / (rangee + ecart)) + 1);
  return { c, r };
}

/** La largeur en dessous de laquelle une carte de pièce n'est plus lisible. */
export const LARGEUR_MIN = 210;

/* Le nombre de colonnes se DÉCIDE ici — il ne se lit pas sur le style calculé.
 *
 * Mesuré dans le navigateur le 23/09 : le lire ne marche pas. Une carte posée
 * dans une colonne que le modèle n'a pas en crée une IMPLICITE, que le style
 * calculé liste comme les autres. La lecture suivante comptait donc les
 * colonnes qu'on venait d'inventer, et s'y tenait. La règle qui imposait deux
 * colonnes au téléphone (`!important`) suffisait à lancer la boucle : quatre
 * colonnes lues, deux vraies, et les cartes des deux premières écrasées à zéro
 * pixel de large — deux pièces invisibles.
 *
 * La grille reçoit donc `repeat(n, minmax(0,1fr))` avec le n d'ici : plus
 * aucune colonne implicite ne peut naître. Et la mesure ne se mord pas la
 * queue — toutes les colonnes valant `1fr`, la largeur de la grille ne dépend
 * pas de leur nombre. */
export function colonnesPour(largeur, etroit, mosaique) {
  if (etroit) return 2; // téléphone : deux cartes, la grille commune (176 × 184)
  if (mosaique) return 3; // tablette : la mosaïque tient sur trois colonnes
  return Math.max(1, Math.floor((Math.max(0, entier(largeur, 0)) + ECART) / (LARGEUR_MIN + ECART)));
}

/** Ce qu'on enregistre : les places des pièces qui existent encore. Une pièce
 *  supprimée ne doit pas garder sa cellule en réserve. */
export function nettoyer(places, noms) {
  const liste = Array.isArray(noms) ? noms : [];
  const out = {};
  Object.keys(places || {}).forEach(nom => {
    if (liste.indexOf(nom) >= 0 && places[nom] && Number.isFinite(Number(places[nom].c))) {
      out[nom] = { c: entier(places[nom].c), r: entier(places[nom].r) };
    }
  });
  return out;
}
