/* La colonne du rail de l'Accueil : ses deux bornes dans la fenêtre (04/10).
 *
 * Sur ordinateur et sur tablette en paysage, le rail de widgets se tenait à
 * droite en pleine hauteur, et la grille étirait le contenu principal jusqu'à
 * lui : avec peu ou pas de caméras, une grande bande à droite et du vide à
 * gauche (1 121 px de vide sans caméra, à 1440 × 900). Choix de l'utilisateur :
 * « la colonne qui défile simplement, tous les widgets restant dépliés ». La
 * colonne colle sous l'en-tête et défile seule ; la page s'arrête avec le
 * contenu principal (index.css, `.o-rail-cell`).
 *
 * Une hauteur calculée sur la seule fenêtre ne vaut que pour la colonne DÉJÀ
 * collée. Page en haut, la grille commence 200 à 280 px plus bas : le bas de
 * la colonne sortait de l'écran (ou passait sous la barre de la tablette), et
 * l'on faisait défiler une colonne dont le dernier widget ne se montrait
 * jamais (contre-étude du 04/10, mesuré). En fin de page, le sticky la
 * poussait vers le haut et rognait la première carte de 26 à 34 px. D'où deux
 * bornes, écrites en variables CSS sur la cellule :
 *   - `depart` : où la grille commence dans la fenêtre, tant qu'elle est en
 *     dessous du bord (0 une fois passée au-dessus) ;
 *   - `fin` : où la cellule finit, dès qu'elle approche (`SANS_FIN` sinon —
 *     au milieu de la page, rien ne change, donc rien ne s'écrit).
 * `AIR_HAUT` est le rembourrage du haut de la colonne (la place des ombres) :
 * la cellule est remontée d'autant par sa marge négative. */
export const AIR_HAUT = 6;
export const SANS_FIN = 100000;

export function bornesRail(rect, vh) {
  if (!rect) return { depart: 0, fin: SANS_FIN };
  const top = Number(rect.top);
  const bottom = Number(rect.bottom);
  const haut = Number(vh) > 0 ? Number(vh) : 0;
  const depart = Number.isFinite(top) && top > 0 ? Math.round(top + AIR_HAUT) : 0;
  const fin = Number.isFinite(bottom) && haut > 0 && bottom < 2 * haut ? Math.round(bottom) : SANS_FIN;
  return { depart, fin };
}
