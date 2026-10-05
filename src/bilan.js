/* Le bilan d'énergie de la journée : ce qui se lit, jamais un zéro inventé
 * (audit du 03/10).
 *
 * La vue Énergie lisait ses compteurs par un `num()` qui rend 0 quand
 * l'entité se tait. La consommation du jour n'était donc JAMAIS absente : un
 * Linky indisponible valait 0 kWh, le garde-fou `totalToday == null` de
 * l'autosuffisance ne jouait jamais, et 6,2 kWh produits affichaient
 * « 100 % » — une maison autonome parce que son compteur ne répond plus.
 * L'en-tête disait de même « Consommation 0 W » au-dessus de chiffres qui,
 * eux, affichaient « — ».
 *
 * La règle est celle de l'ADR 0030 : une valeur absente s'affiche « — », et
 * ce qui n'a pas de source n'apparaît pas. Ici `null` veut dire « illisible »
 * et traverse les calculs tel quel ; un zéro LU, lui, reste un zéro — une
 * maison qui n'a rien acheté au réseau de la journée est bien à 100 %.
 *
 * Ni React ni Home Assistant : des nombres entrent, un nombre ou une phrase
 * sort, et `tests/bilan_energie.test.mjs` les vérifie à sec.
 */
import { tr } from './i18n.js';
import { fmtWatts } from './format.js';

/** Un nombre utilisable, ou null : une chaîne, NaN ou l'infini ne se lisent pas. */
const lu = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** La consommation réseau du jour, en kWh.
 *
 * Le compteur du jour s'il se lit, même à zéro ; sinon heures creuses +
 * heures pleines, dès que l'un des deux index se lit ; sinon le total réseau.
 * Deux comportements de l'ancien calcul restent : un index muet compte pour
 * rien dans la somme, et une somme NULLE cède au total réseau quand il se
 * lit. Ce qui change : quand AUCUN compteur ne répond, le total est `null`,
 * et c'est ce null — pas un 0 — qui éteint les cadrans. */
export function consoJourKwh({ jour = null, hc = null, hp = null, reseau = null, hcMuet = false, hpMuet = false } = {}) {
  if (lu(jour) != null) return jour;
  /* Un index CONFIGURÉ qui se tait (relecture du 03/10) : heures creuses à
   * 2 kWh et heures pleines muettes faisaient une journée de 2 kWh au lieu de
   * 10, et l'autosuffisance gonflait d'autant. Une moitié muette ne s'ajoute
   * pas : le total réseau, s'il se lit, sinon rien. */
  if (hcMuet || hpMuet) return lu(reseau);
  const hchp = lu(hc) != null || lu(hp) != null ? (lu(hc) || 0) + (lu(hp) || 0) : null;
  if (hchp != null && (hchp > 0 || lu(reseau) == null)) return hchp;
  return lu(reseau);
}

/** L'autosuffisance du jour, en % : la part de la consommation couverte par
 * le solaire. Ce que la maison produit MOINS ce qu'elle renvoie au réseau,
 * rapporté à tout ce qu'elle a consommé. Une injection illisible compte pour
 * rien, comme avant : tout le solaire est alors réputé consommé.
 *
 * `null` dès que la production OU la consommation manque, et pour une
 * journée vide — un taux sur zéro kWh ne dit rien. */
export function autosuffisance(prod, conso, injection = null, injectionMuette = false) {
  /* Une injection CONFIGURÉE mais muette ne vaut pas zéro (relecture du
   * 03/10) : tout le solaire passait pour consommé — 67 % au lieu de 37. */
  if (injectionMuette) return null;
  if (lu(prod) == null || lu(conso) == null) return null;
  const solaireConsomme = Math.max(0, prod - (lu(injection) || 0));
  const total = conso + solaireConsomme;
  return total > 0 ? Math.round(solaireConsomme / total * 100) : null;
}

/** La ligne sous le titre de la vue Énergie : la consommation, la production
 * solaire, le réseau — chacun SEULEMENT s'il se lit, en watts. La phrase
 * garde sa majuscule quand son premier terme manque ; rien de lisible rend
 * une chaîne vide, et l'appelant n'affiche alors pas de ligne. */
export function resumeEnergie({ conso = null, solaire = null, reseau = null } = {}) {
  const s = [
    lu(conso) != null && tr('Consommation') + ' ' + fmtWatts(conso),
    lu(solaire) != null && tr('production solaire') + ' ' + fmtWatts(solaire),
    lu(reseau) != null && tr('réseau') + ' ' + fmtWatts(reseau),
  ].filter(Boolean).join(' · ');
  return s && s.charAt(0).toUpperCase() + s.slice(1);
}
