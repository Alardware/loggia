/* La disposition des cartes suit le TYPE d'écran ; leur contenu suit la maison.
 *
 * Retour du 18/09 : « chaque appareil a sa propre disposition, seul l'ajout ou
 * modification, suppression d'entité, carte se synchronise ». L'Accueil le
 * faisait déjà (une grille par format) ; les vues à cartes — pièces, Objets,
 * volets, énergie, sécurité — partageaient tout : ranger sur le téléphone
 * dérangeait l'ordinateur.
 *
 * Un agencement de vue garde donc deux parts :
 *   - le CONTENU, commun : `added`, `removed`, `labels` (et `types`, ancien) ;
 *   - la DISPOSITION, par format : `order`, `larges`, `compacts`.
 * L'ordinateur écrit sa disposition dans les clés historiques — une
 * installation existante retrouve la sienne telle quelle. La tablette et le
 * téléphone écrivent dans `formats[format]`, et suivent l'ordinateur tant
 * qu'ils n'ont rien rangé eux-mêmes : rien n'est dupliqué d'avance.
 */

/** Ce qui se range par format. Le reste est du contenu, commun. */
export const CLES_DISPOSITION = ['order', 'larges', 'compacts'];

/** Le format d'écran, comme l'Accueil : la souris fait l'ordinateur, le doigt
 *  la tablette sur grand écran et le téléphone ailleurs. */
export function formatEcran(tactile, large) {
  return !tactile ? 'pc' : (large ? 'tablette' : 'mobile');
}

/* ── L'héritage se fait RÉGLAGE PAR RÉGLAGE (ADR 0221, 17/10) ──────────────
 *
 * Ticket #34 : « j'ai les pièces dans un ordre précis sur le navigateur du PC
 * et par ordre alphabétique sur le smartphone ». Un format qui avait rangé UNE
 * chose — une carte passée en compact — cessait d'hériter de TOUT : l'ordre
 * absent de sa part effaçait celui de l'ordinateur, et l'écran retombait sur
 * le tri par nom. Sa première retouche recopiait en outre l'ordre du moment,
 * qui ne suivait plus jamais l'ordinateur.
 *
 * Désormais chaque réglage — l'ordre, les larges, les compactes — s'hérite
 * SEUL. Une part ne porte que ce que ce format a lui-même changé, et :
 *
 *   absent       ce format n'a rien dit : il suit l'ordinateur ;
 *   `[]`         ce format a CHOISI le vide : il s'y tient.
 *
 * Sans cette distinction, vider la dernière compacte du téléphone ferait
 * réhériter celles de l'ordinateur. Revenir à l'ordinateur, c'est RETIRER la
 * part (`sansPart`), jamais y écrire des vides. */

/** La part propre d'un format, ou null — l'ordinateur n'en a pas. Avec un
 *  `appareil`, la part de cet appareil nommé (tranche 3, ADR 0222). */
function partDe(L, format, appareil = null) {
  const f = appareil
    ? (L && L.appareils && L.appareils[appareil])
    : (format !== 'pc' && L && L.formats && L.formats[format]);
  return (f && typeof f === 'object' && !Array.isArray(f)) ? f : null;
}

/** Les réglages de disposition d'une part, posés sur une vue. */
function superposer(v, propre) {
  CLES_DISPOSITION.forEach(k => {
    if (!(k in propre)) return;
    if (Array.isArray(propre[k]) && propre[k].length) v[k] = propre[k];
    else delete v[k];
  });
  return v;
}

/** L'agencement tel que CE format le voit : le contenu commun, et pour chaque
 *  réglage de disposition, le sien s'il l'a posé, sinon celui de l'ordinateur.
 *  Un appareil qui range SA mise en page passe devant son format :
 *  appareil → type d'écran → ordinateur, réglage par réglage. */
export function vueFormat(L, format, appareil = null) {
  const l = L || {};
  const duFormat = partDe(l, format);
  const deLAppareil = appareil ? partDe(l, format, appareil) : null;
  if (!duFormat && !deLAppareil) return l;
  const v = { ...l };
  if (duFormat) superposer(v, duFormat);
  if (deLAppareil) superposer(v, deLAppareil);
  return v;
}

/** Ce niveau a-t-il posé CE réglage lui-même ? L'ordinateur, toujours ; un
 *  appareil nommé, s'il l'a dans sa part. */
export function possede(L, format, k, appareil = null) {
  if (appareil) { const a = partDe(L, format, appareil); return !!a && k in a; }
  if (format === 'pc') return true;
  const propre = partDe(L, format);
  return !!propre && k in propre;
}

/** Une écriture de l'éditeur, rangée à sa place : le contenu partout, la
 *  disposition dans ce format — ou dans cet appareil — et seulement les
 *  réglages qu'elle touche. Hors de l'ordinateur, `null` vaut le vide CHOISI :
 *  l'éditeur écrit `null` quand on retire la dernière carte d'une liste
 *  (`vide`). Sur l'ordinateur, `null` efface, comme dans `setLayout`. */
export function patchFormat(L, format, patch, appareil = null) {
  if (format === 'pc' && !appareil) return patch;
  const contenu = {};
  const dispo = {};
  Object.keys(patch || {}).forEach(k => { (CLES_DISPOSITION.indexOf(k) >= 0 ? dispo : contenu)[k] = patch[k]; });
  if (!Object.keys(dispo).length) return contenu;
  const f = { ...(partDe(L, format, appareil) || {}) };
  Object.keys(dispo).forEach(k => { f[k] = Array.isArray(dispo[k]) ? dispo[k] : []; });
  const table = appareil ? 'appareils' : 'formats';
  return { ...contenu, [table]: { ...((L && L[table]) || {}), [appareil || format]: f } };
}

/** Revenir au niveau du dessus : la part de ce format — ou de cet appareil —
 *  s'en va, et avec elle tout ce qu'il avait rangé. Rend le patch de sa table,
 *  `null` quand il n'y reste rien. Sur l'ordinateur sans appareil, rien. */
export function sansPart(L, format, appareil = null) {
  if ((format === 'pc' && !appareil) || !partDe(L, format, appareil)) return {};
  const table = appareil ? 'appareils' : 'formats';
  const f = { ...L[table] };
  delete f[appareil || format];
  return { [table]: Object.keys(f).length ? f : null };
}

/** La grille de l'Accueil telle que CE format la voit (ADR 0221) : chaque clé
 *  de sa part l'emporte, les autres viennent de l'ordinateur ; un appareil
 *  nommé passe devant son format (ADR 0222). Les grilles déjà recopiées en
 *  entier par l'ancien éditeur restent ce qu'elles étaient. */
export function grilleDuFormat(accL, format, appareil = null) {
  const l = accL || {};
  const duFormat = partDe(l, format);
  const deLAppareil = appareil ? partDe(l, format, appareil) : null;
  if (!duFormat && !deLAppareil) return l;
  const { formats: _f, appareils: _a, ...pc } = l;
  const sans = (p) => { if (!p) return {}; const { formats: _x, appareils: _y, ...r } = p; return r; };
  return { ...pc, ...sans(duFormat), ...sans(deLAppareil) };
}

/** Ce que l'éditeur de l'Accueil range pour un format ou un appareil : sa
 *  part, plus ce qui change — jamais la grille du dessus recopiée. Certains
 *  gestes rendent la grille ENTIÈRE (`grilleAvecPiece`) : une clé qu'ils n'ont
 *  pas touchée garde le même objet, et une clé encore héritée ne passe pas
 *  dans la part. */
export function poserGrille(accL, format, g, appareil = null) {
  const l = accL || {};
  if (format === 'pc' && !appareil) return { ...l, ...g };
  const propre = partDe(l, format, appareil) || {};
  const vue = grilleDuFormat(l, format, appareil);
  const part = { ...propre };
  Object.keys(g || {}).forEach(k => {
    if (k === 'formats' || k === 'appareils') return;
    if (!(k in propre) && g[k] === vue[k]) return;
    part[k] = g[k];
  });
  const table = appareil ? 'appareils' : 'formats';
  return { ...l, [table]: { ...(l[table] || {}), [appareil || format]: part } };
}

/** Remplacer une carte par une autre lui garde sa place et sa taille sur
 *  TOUS les formats : l'identifiant change partout où il figurait. */
export function echangerPartout(L, id, cible) {
  const l = L || {};
  const ech = (a) => a.map(x => (x === id ? cible : x));
  const out = {};
  CLES_DISPOSITION.forEach(k => { if (Array.isArray(l[k])) out[k] = ech(l[k]); });
  // Les formats, et les appareils nommés (ADR 0222) : même échange partout.
  ['formats', 'appareils'].forEach(table => {
    if (!l[table] || typeof l[table] !== 'object') return;
    out[table] = {};
    Object.keys(l[table]).forEach(f => {
      const d = l[table][f] || {};
      const n = {};
      Object.keys(d).forEach(k => { n[k] = Array.isArray(d[k]) ? ech(d[k]) : d[k]; });
      out[table][f] = n;
    });
  });
  return out;
}

/* ── L'ordre des scénarios (ADR 0052, amendement) ──────────────────────────
 * Tenu par le composant pour l'ordinateur ; la tablette et le téléphone ont
 * le leur, dans la configuration de la maison (`loggia_scnordre`). */

/** Trie des éléments `{ id }` selon un ordre enregistré. Ceux qui n'y figurent
 *  pas passent après, dans leur ordre d'arrivée : un scénario créé depuis ne
 *  vient pas se glisser au milieu. */
export function ordonnerSelon(elements, ordre) {
  const l = Array.isArray(elements) ? elements : [];
  if (!Array.isArray(ordre) || !ordre.length) return l;
  const rang = (x, i) => { const r = ordre.indexOf(x && x.id); return r < 0 ? ordre.length + i : r; };
  return l.map((x, i) => [x, rang(x, i)]).sort((a, b) => a[1] - b[1]).map(p => p[0]);
}

/** L'ordre propre d'un format, ou `null` : l'ordinateur suit le composant, et
 *  un format qui n'a rien rangé suit l'ordinateur. */
export function ordreDuFormat(ordres, format) {
  if (format === 'pc' || !ordres || typeof ordres !== 'object') return null;
  const o = ordres[format];
  return Array.isArray(o) && o.length ? o : null;
}

/* ── CARTES ou PLAN sur l'Accueil (01/10) ─────────────────────────────────────
 *
 * « Pour l'accueil un réglage pourrait être bien pour afficher de préférence
 * soit les pièces soit le plan par défaut. »
 *
 * Le choix suit le TYPE d'écran, comme tout ce qui se range ici : un plan a du
 * sens sur un grand écran et beaucoup moins sur un téléphone, où l'on cherche
 * une pièce du pouce. Il vit dans la configuration de la maison, pas dans le
 * navigateur — c'est un réglage de la maison, pas de l'appareil.
 *
 * Il n'y a PAS de réglage en double dans Paramètres : la bascule de l'Accueil
 * est le réglage. Elle se souvient, voilà tout.
 */

/** L'affichage choisi pour ce format — `cartes` tant que rien ne dit l'autre. */
export function vuePiecesDe(v, format) {
  const o = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  return o[format] === 'plan' ? 'plan' : 'cartes';
}

/** Le choix rangé à sa place. Comme pour les caméras, une configuration ne
 *  garde que ce qui s'écarte du défaut, et un objet vide s'efface. */
export function poserVuePieces(v, format, id) {
  const o = { ...((v && typeof v === 'object' && !Array.isArray(v)) ? v : {}) };
  if (id === 'plan') o[format] = 'plan'; else delete o[format];
  return Object.keys(o).length ? o : null;
}
