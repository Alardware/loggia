/* Le petit sapin de fin d'année (10/11, ADR 0342) : un clin d'œil, rien de plus.
 *
 * Du 1er novembre au 25 décembre, un sapin dessiné et le compte des jours
 * (« J-45 ») se posent près de la date de l'en-tête, ou du bonjour de
 * l'Accueil au téléphone. Rien ne bouge, rien ne se pose sur les cartes ni sur
 * le ciel — le ciel dit la vraie météo. Ce module ne fait que le calcul, pour
 * se tester sans écran ; le dessin vit dans sapin.jsx. */

/** Les jours qui restent jusqu'au 25 décembre de l'année de `d` (0 le jour même,
 * négatif après). Compté sur les dates seules, en UTC : un passage à l'heure
 * d'hiver ne retire pas un jour. */
export function joursAvantNoel(d = new Date()) {
  const ce = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((Date.UTC(d.getFullYear(), 11, 25) - ce) / 86400000);
}

/** `{ jours }` du 1er novembre au 25 décembre, `null` le reste de l'année. */
export function saisonNoel(d = new Date()) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  if (d.getMonth() < 10) return null;
  const jours = joursAvantNoel(d);
  return jours >= 0 ? { jours } : null;
}
