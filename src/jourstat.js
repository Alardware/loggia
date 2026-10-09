/* ── Ce qu'un compteur a compté AUJOURD'HUI ───────────────────────────────────
 *
 * LE TABLEAU DE BORD ÉNERGIE DE HOME ASSISTANT NE DÉSIGNE PAS DES COMPTEURS
 * JOURNALIERS. Il désigne l'INDEX du compteur — celui du Linky, du Shelly, du
 * P1 —, un nombre qui ne fait que monter depuis le premier jour, et c'est lui
 * qui calcule les différences pour ses graphes.
 *
 * L'aperçu de la vue Énergie lisait cet index tel quel et l'annonçait comme la
 * consommation du jour. Sur l'installation qui a servi à l'écrire, cela ne se
 * voyait pas : sa fiche désigne des `utility_meter` journaliers, remis à zéro
 * chaque nuit. Chez quiconque n'a jamais ouvert la fiche — donc chez qui Loggia
 * déduit tout du tableau de bord natif —, le grand chiffre aurait annoncé
 * « 12 450 kWh aujourd'hui » (audit du 07/10).
 *
 * DEUX SORTES DE COMPTEURS, DEUX LECTURES :
 *
 *   1. Un compteur JOURNALIER dit lui-même quand il s'est remis à zéro
 *      (`last_reset`). Si c'est aujourd'hui, son état EST le total du jour :
 *      on le lit directement, sans rien demander à personne.
 *   2. Tous les autres sont des index. Leur total du jour est la DIFFÉRENCE
 *      entre maintenant et minuit, que le `recorder` tient déjà : une seule
 *      ligne de statistiques (`change` sur la journée) la donne.
 *
 * Et quand ni l'un ni l'autre ne répond, on ne rend rien. Un tiret vaut mieux
 * qu'un index pris pour une journée.
 *
 * POURQUOI PAS `stats.js` ? Il fait ce travail, mais il découpe la période en
 * cases heure par heure pour les graphes, et il reste volontairement HORS du
 * chargement initial (`tests/lot14_chargement.test.mjs`) : l'historique et le
 * calendrier ne se chargent qu'à l'ouverture de la vue. L'aperçu, lui, est la
 * première chose qu'on voit, et il ne veut qu'un total.
 */
import { useEffect, useRef, useState } from 'react';

/** Minuit, dans le fuseau de la maison — pas en temps universel. */
export function minuitLocal(maintenant = Date.now()) {
  const d = new Date(maintenant);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/* Deux minutes de battement : un compteur remis à zéro par une automatisation
 * un peu en avance sur minuit reste un compteur du jour. */
const BATTEMENT = 120000;

/**
 * Un compteur qui s'est remis à zéro AUJOURD'HUI : son état est le total du
 * jour, et il n'y a rien à calculer.
 *
 * Un compteur mensuel ou annuel dit aussi son dernier reset ; le premier jour
 * du mois ou de l'année, il tombe dans le même cas — et il a raison, son total
 * est bien celui de la journée en cours.
 */
export function compteurDuJour(etat, maintenant = Date.now()) {
  const lr = etat && etat.attributes && etat.attributes.last_reset;
  if (!lr) return false;
  const t = Date.parse(lr);
  if (!isFinite(t)) return false;
  return t >= minuitLocal(maintenant) - BATTEMENT && t <= maintenant + BATTEMENT;
}

/** La requête, isolée pour qu'un test puisse la lire sans WebSocket. */
export function requeteJour(ids, maintenant = Date.now()) {
  return {
    type: 'recorder/statistics_during_period',
    start_time: new Date(minuitLocal(maintenant)).toISOString(),
    statistic_ids: ids,
    period: 'day',
    types: ['change'],
  };
}

/** Ce que la réponse porte : une somme par identifiant, les muets absents. */
export function totauxRelus(res, ids) {
  const out = {};
  (ids || []).forEach(id => {
    const lignes = res && res[id];
    if (!Array.isArray(lignes)) return;
    let s = null;
    lignes.forEach(l => {
      const v = l && l.change;
      if (typeof v === 'number' && isFinite(v)) s = (s || 0) + v;
    });
    if (s != null) out[id] = s;
  });
  return out;
}

/**
 * Les totaux du jour des compteurs qu'on ne peut pas lire directement.
 *
 * `hass.callWS`, comme partout ailleurs dans Loggia : `connection` n'existe
 * pas sur le faux `hass` de la démonstration.
 */
export function useTotauxJour(hass, ids, tour = 0) {
  const [totaux, setTotaux] = useState({});
  const cle = (ids || []).filter(Boolean).join('|');
  const parle = hass && typeof hass.callWS === 'function' ? 1 : 0;
  const vivantHass = useRef(hass);
  vivantHass.current = hass;
  useEffect(() => {
    let vivant = true;
    const h = vivantHass.current;
    if (!parle || !cle) { setTotaux({}); return undefined; }
    const liste = cle.split('|');
    h.callWS(requeteJour(liste))
      .then(res => { if (vivant) setTotaux(totauxRelus(res, liste)); })
      /* Pas de `recorder`, ou pas le droit de le lire : on ne rend rien, et
       * l'appelant n'affiche pas de chiffre plutôt qu'un faux. */
      .catch(() => { if (vivant) setTotaux({}); });
    return () => { vivant = false; };
  }, [parle, cle, tour]);
  return totaux;
}
