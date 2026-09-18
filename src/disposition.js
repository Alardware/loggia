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

/** L'agencement tel que CE format le voit : le contenu commun, et sa
 *  disposition à lui — celle de l'ordinateur s'il n'en a pas. */
export function vueFormat(L, format) {
  const l = L || {};
  const propre = format !== 'pc' && l.formats && l.formats[format];
  if (!propre) return l;
  const v = { ...l };
  CLES_DISPOSITION.forEach(k => {
    if (Array.isArray(propre[k]) && propre[k].length) v[k] = propre[k];
    else delete v[k];
  });
  return v;
}

/** Une écriture de l'éditeur, rangée à sa place : le contenu partout, la
 *  disposition dans ce format. La première retouche d'un format part de ce
 *  qu'il montrait, c'est-à-dire de la disposition de l'ordinateur. Une valeur
 *  `null` efface, comme dans `setLayout`. */
export function patchFormat(L, format, patch) {
  if (format === 'pc') return patch;
  const contenu = {};
  const dispo = {};
  Object.keys(patch || {}).forEach(k => { (CLES_DISPOSITION.indexOf(k) >= 0 ? dispo : contenu)[k] = patch[k]; });
  if (!Object.keys(dispo).length) return contenu;
  const base = vueFormat(L, format);
  const f = {};
  CLES_DISPOSITION.forEach(k => {
    const v = k in dispo ? dispo[k] : base[k];
    if (Array.isArray(v) && v.length) f[k] = v;
  });
  return { ...contenu, formats: { ...((L && L.formats) || {}), [format]: f } };
}

/** Remplacer une carte par une autre lui garde sa place et sa taille sur
 *  TOUS les formats : l'identifiant change partout où il figurait. */
export function echangerPartout(L, id, cible) {
  const l = L || {};
  const ech = (a) => a.map(x => (x === id ? cible : x));
  const out = {};
  CLES_DISPOSITION.forEach(k => { if (Array.isArray(l[k])) out[k] = ech(l[k]); });
  if (l.formats && typeof l.formats === 'object') {
    out.formats = {};
    Object.keys(l.formats).forEach(f => {
      const d = l.formats[f] || {};
      const n = {};
      Object.keys(d).forEach(k => { n[k] = Array.isArray(d[k]) ? ech(d[k]) : d[k]; });
      out.formats[f] = n;
    });
  }
  return out;
}
