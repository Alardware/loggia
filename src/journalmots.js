/* Les mots du serveur, dans la langue de l'ecran (ADR 0070).
 *
 * Le composant ecrit le journal en francais : « couper », « vent 62 km/h »,
 * « 2 sous la main de quelqu'un ». Jusqu'ici l'ecran les affichait tels quels,
 * meme en anglais. Le francais reste ce qui est ecrit (les journaux existants,
 * les logs) ; a cote, quand une ligne porte des variables, le serveur ajoute
 * `g` : pour chaque champ, la liste des PARTIES qui la composent — un gabarit
 * et ses arguments — jointes par « · ».
 *
 *   { motif: "vent 62 km/h", g: { motif: [["vent {v}", { v: "62 km/h" }]] } }
 *
 * Un champ sans `g` est un mot fixe : `tr` le connait par son texte francais,
 * exactement comme le reste de l'interface. Une ligne ancienne, ecrite avant
 * cette version, garde son francais compose — rien ne casse. */
import { tr } from './i18n.js';

const SEPARATEUR = ' · ';

/** Le texte traduit d'un champ (`quoi`, `motif`, `detail`, `regle`) d'une
 * ligne de journal, ou '' s'il est vide. */
export function mot(entree, champ) {
  if (!entree) return '';
  const g = entree.g && entree.g[champ];
  if (Array.isArray(g) && g.length) {
    return g.map(p => (Array.isArray(p) ? tr(p[0], p[1] || undefined) : tr(String(p))))
      .filter(Boolean).join(SEPARATEUR);
  }
  const brut = entree[champ];
  if (brut == null || brut === '') return '';
  /* Le nom d'une regle est un mot du serveur ; « retour » est aussi le bouton
   * « Retour » de l'interface, et sa traduction (« back ») ne dit pas le
   * retour a la maison. Cette regle-la a sa propre cle. */
  if (champ === 'regle' && brut === 'retour') return tr('retour (règle)');
  return tr(String(brut));
}

/** `regle · motif · detail`, traduits, sans les vides. */
export function pourquoi(entree) {
  return ['regle', 'motif', 'detail'].map(c => mot(entree, c)).filter(Boolean).join(SEPARATEUR);
}
