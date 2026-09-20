/* La disposition des caméras : combien par ligne.
 *
 * Retour du 20/09 : « moi j'en ai 2 mais d'autres en ont peut-être plus, on
 * pourrait ajouter un réglage d'affichage comme ceux-ci ». Jusqu'ici les deux
 * endroits qui montrent des caméras — la section Caméras de l'Accueil et
 * « Caméras en direct » de la vue Sécurité — tenaient deux colonnes en dur, et
 * une seule au téléphone. Deux caméras y tiennent bien ; six y font six
 * vignettes hautes qu'il faut dérouler.
 *
 * Le choix suit le TYPE d'écran, comme le reste des dispositions (ADR 0053) :
 * trois caméras par ligne sur l'ordinateur n'ont pas de sens sur un téléphone.
 * Il vit dans la configuration de la maison (`loggia_camdispo`), pas dans le
 * navigateur : c'est un réglage de la maison, pas de l'appareil.
 */

/** Les dispositions proposées, « automatique » en tête. */
export const CAM_DISPOS = ['auto', '1', '2', '3', '4'];

/** Ce que « Automatique » a toujours fait : deux par ligne sur grand écran,
 *  une seule au téléphone. Sans réglage, rien ne bouge. */
export const CAM_AUTO = { pc: 2, tablette: 2, mobile: 1 };

/** Le nombre maximal de colonnes qu'un format accepte : un téléphone ne montre
 *  pas quatre caméras de front, même demandé depuis l'ordinateur — une
 *  vignette de 80 px de large ne montre rien. */
export const CAM_MAX = { pc: 4, tablette: 3, mobile: 2 };

/** Le choix enregistré pour ce format. La valeur est un objet
 *  `{ pc, tablette, mobile }` ; tout le reste vaut « automatique ». */
export function camDispoDe(v, format) {
  const o = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  const id = o[format];
  return CAM_DISPOS.indexOf(id) > 0 ? id : 'auto';
}

/** Le choix rangé à sa place. `auto` efface l'entrée : une configuration ne
 *  garde que ce qui s'écarte du comportement par défaut, et un objet vide
 *  s'efface à son tour. */
export function poserCamDispo(v, format, id) {
  const o = { ...((v && typeof v === 'object' && !Array.isArray(v)) ? v : {}) };
  if (CAM_DISPOS.indexOf(id) > 0) o[format] = id; else delete o[format];
  return Object.keys(o).length ? o : null;
}

/** Les colonnes à poser dans la grille, choix et format confondus. Toujours au
 *  moins une, jamais plus que ce que le format supporte. */
export function colonnesCam(v, format) {
  const auto = CAM_AUTO[format] || 2;
  const id = camDispoDe(v, format);
  const n = id === 'auto' ? auto : parseInt(id, 10);
  return Math.max(1, Math.min(n, CAM_MAX[format] || 4));
}

/** Une vignette est-elle SERRÉE ? Deux caméras de front sur un téléphone, ou
 *  trois n'importe où : le nom et sa sous-ligne se chevauchaient, et l'heure
 *  mordait sur le badge « LIVE ». Le pied de la tuile se resserre alors
 *  (classe `o-cams-serre`), au lieu de deborder. */
export function camSerre(cols, format) {
  return cols >= 3 || (cols >= 2 && format === 'mobile');
}

/** Les dispositions qu'un format peut offrir : au-delà de son maximum, une
 *  option ne montrerait que des timbres-poste. */
export function camDisposDe(format) {
  const max = CAM_MAX[format] || 4;
  return CAM_DISPOS.filter(id => id === 'auto' || parseInt(id, 10) <= max);
}
