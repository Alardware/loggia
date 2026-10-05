/* ── Les étages de la maison ────────────────────────────────────────────────
 *
 * Home Assistant tient un registre d'étages : chaque zone peut appartenir à
 * l'un d'eux, qui porte un nom et un NIVEAU (−1 pour le sous-sol, 0 pour le
 * rez-de-chaussée, 1 pour le premier…).
 *
 * Loggia lisait déjà tout cela — `discovery.py` interroge le registre,
 * `discovery.js` le normalise, et l'index porte le `floor` de chaque zone —
 * mais aucune vue ne s'en servait : l'information traversait le système et
 * mourait à l'arrivée.
 *
 * Elle sert ici à FILTRER les pièces de l'Accueil, et non à les regrouper : la
 * grille des pièces porte un placement libre, des tailles par carte et un
 * glisser-déposer, tous rangés par format d'écran. La découper en sections
 * aurait défait cet agencement ; masquer les pièces d'un autre étage le laisse
 * entier.
 *
 * Une maison de plain-pied n'a aucun étage déclaré — c'est le cas le plus
 * courant. Sans étage, ces fonctions rendent des listes vides et l'en-tête ne
 * montre rien : pas de source, pas d'affichage.
 *
 * Aucun React ici : tout se teste à la main.
 */
import { comparerTextes } from './i18n.js';

/** Les étages connus, du plus bas au plus haut. */
export function etagesDe(index) {
  const l = (index && Array.isArray(index.floors)) ? index.floors : [];
  return l
    .filter(f => f && f.id)
    .map(f => ({ id: f.id, nom: (f.name || f.id), niveau: Number.isFinite(f.level) ? f.level : null }))
    /* Par NIVEAU, pas par nom : le sous-sol (−1) vient avant le
     * rez-de-chaussée (0), qui vient avant l'étage (1). Un étage sans niveau
     * déclaré passe en dernier plutôt que de se glisser au hasard. */
    .sort((a, b) => {
      if (a.niveau == null && b.niveau == null) return comparerTextes(a.nom, b.nom);
      if (a.niveau == null) return 1;
      if (b.niveau == null) return -1;
      return a.niveau - b.niveau || comparerTextes(a.nom, b.nom);
    });
}

/** L'identifiant de l'étage d'une pièce, par son NOM, ou `null`. */
export function etageDuNom(index, nom) {
  const zones = (index && Array.isArray(index.areaList)) ? index.areaList : [];
  const n = String(nom || '').trim();
  if (!n) return null;
  const z = zones.find(a => a && String(a.name || '').trim() === n);
  return (z && z.floor) || null;
}

/**
 * Les étages qui portent VRAIMENT une des pièces montrées, avec leur compte.
 *
 * On ne propose pas de filtrer sur un étage vide : un bouton qui ne montre
 * rien n'est pas un choix. Et un seul étage habité ne vaut pas un filtre —
 * « Tous » et lui diraient la même chose.
 */
export function etagesDesPieces(index, noms) {
  const l = Array.isArray(noms) ? noms : [];
  const compte = new Map();
  let sansEtage = 0;
  for (const nom of l) {
    const e = etageDuNom(index, nom);
    if (e) compte.set(e, (compte.get(e) || 0) + 1);
    else sansEtage += 1;
  }
  const out = etagesDe(index).filter(e => compte.has(e.id)).map(e => ({ ...e, n: compte.get(e.id) }));
  return { etages: out, sansEtage, utile: out.length >= 2 };
}

/**
 * Les pièces d'un étage, dans l'ordre qu'on leur a donné.
 *
 * `null` (ou un étage inconnu) rend la liste entière : c'est le choix
 * « Tous ». Les pièces SANS étage déclaré restent toujours visibles — elles
 * n'appartiennent à aucun filtre, et les cacher reviendrait à les perdre.
 */
export function piecesDeLEtage(index, noms, etageId) {
  const l = Array.isArray(noms) ? noms : [];
  if (!etageId) return l;
  return l.filter(nom => {
    const e = etageDuNom(index, nom);
    return !e || e === etageId;
  });
}
