/* Les relevés qui se répètent (audit du 03/10).
 *
 * Les courbes « Les dernières 24 heures » de l'Énergie étaient lues une fois,
 * au montage de la vue, et plus jamais : `useSysHist(…, 24, 0)`, une clé de
 * relecture figée à zéro. Sur une tablette restée ouverte au mur, elles
 * s'arrêtaient à l'heure où l'on était arrivé sur la page, et rien ne le
 * disait — la légende parlait toujours des « dernières » 24 heures.
 *
 * Deux pièces, pures (ni React ni Home Assistant), pour qu'un test les fasse
 * tourner pour de vrai : le TOUR, qui dit quand relire, et la FUSION, qui dit
 * ce qu'on garde quand une relecture rate.
 */

/** Le tour : `avancer` part toutes les `ms` tant que la page se voit.
 *
 * Même règle que le relevé du Système (`views/systeme.jsx`) : une page cachée
 * ne fait pas de requête. La différence est le RETOUR. Une tablette dont
 * l'écran s'éteint cache sa page ; quand il se rallume, attendre le tour
 * suivant montrerait jusqu'à cinq minutes de courbes périmées. Le tour manqué
 * part donc au retour, une seule fois, et le minuteur repart de là — pas une
 * seconde lecture quelques secondes plus tard.
 *
 * Rend la fonction qui arrête tout : un effet la rend telle quelle, et le
 * démontage coupe le minuteur ET l'écoute. Sans document (un rendu hors
 * navigateur), rien n'est branché et rien ne casse. `horloge` ne se remplace
 * que dans un test. */
export function armerReleve(avancer, ms, doc = globalThis.document, horloge = globalThis) {
  if (!doc || typeof doc.addEventListener !== 'function' || !(ms > 0)) return () => {};
  let minuteur = null;
  let manque = false;
  const tour = () => {
    try { avancer(); } catch { /* un tour qui échoue n'arrête pas les suivants */ }
  };
  const tic = () => {
    if (doc.visibilityState === 'visible') tour();
    else manque = true;
  };
  const armer = () => {
    if (minuteur != null) horloge.clearInterval(minuteur);
    minuteur = horloge.setInterval(tic, ms);
  };
  const retour = () => {
    if (doc.visibilityState !== 'visible' || !manque) return;
    manque = false;
    tour();
    armer();
  };
  armer();
  doc.addEventListener('visibilitychange', retour);
  return () => {
    if (minuteur != null) horloge.clearInterval(minuteur);
    minuteur = null;
    doc.removeEventListener('visibilitychange', retour);
  };
}

/** La fusion : les séries d'historique après une relecture.
 *
 * `lectures` est `[{ id, arr }]`, `arr` la réponse brute de `history/period`
 * pour cette entité — ou `null` quand la requête a raté. Une série relue
 * remplace l'ancienne. Une série dont la lecture a raté garde sa courbe
 * d'avant : relire toutes les cinq minutes ne doit pas vider le panneau (et
 * replier la grille de l'Énergie) pour un raté du réseau. Une série qu'on n'a
 * jamais pu lire reste absente — on n'invente pas de courbe — et une série de
 * moins de deux points n'existe pas : il n'y a rien à tracer.
 *
 * Gardée, mais pas indéfiniment (relecture du 03/10). `garder(id)` dit si la
 * courbe d'avant est encore assez fraîche : sans borne, un historique qui
 * échoue durablement (recorder bloqué, websocket debout) figeait la carte
 * « Les dernières 24 heures » sur l'heure du dernier succès, sans rien qui le
 * signale — le défaut même que la relecture devait corriger. */
export const GARDE_SERIE = 30 * 60 * 1000;

export function seriesRelues(avant, lectures, garder = () => true) {
  const m = {};
  for (const r of Array.isArray(lectures) ? lectures : []) {
    if (!r || !r.id) continue;
    if (!Array.isArray(r.arr)) {
      if (avant && avant[r.id] && garder(r.id)) m[r.id] = avant[r.id];
      continue;
    }
    const pts = r.arr
      .map(x => ({ t: new Date(x.last_changed || x.last_updated || 0).getTime(), v: parseFloat(x.state) }))
      .filter(pt => !isNaN(pt.v));
    if (pts.length >= 2) m[r.id] = pts;
  }
  return m;
}
