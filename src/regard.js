/* La page est-elle regardée ? (lot 14 de l'audit du 03/10)
 *
 * Les flux caméra restaient ouverts sous l'écran de veille et dans un onglet
 * caché : toute la nuit, chaque caméra gardait sa session WebRTC, HLS ou MJPEG
 * — chez le navigateur comme chez Home Assistant et go2rtc —, ou sa vignette
 * se retéléchargeait toutes les deux secondes. La veille est posée PAR-DESSUS
 * l'Accueil sans le démonter : rien en dessous ne savait que personne ne le
 * voyait plus.
 *
 * Regardée = l'onglet n'est pas caché (`visibilityState`) ET la veille ne
 * recouvre pas la page (`loggia-ambient-on` sur la racine, que pose
 * ecranveille.jsx et que wx3d lit déjà). La classe fait foi ; l'événement
 * `loggia-veille`, que la veille émet en la posant et en la retirant, ne fait
 * que prévenir — comme `visibilitychange` pour l'onglet.
 *
 * Pur (ni React ni Home Assistant), comme `releve.js` : un test le fait
 * tourner avec un document et une horloge tenus à la main. */

export const CLASSE_VEILLE = 'loggia-ambient-on';
export const EVENEMENT_VEILLE = 'loggia-veille';

/* Trente secondes avant de couper un direct.
 *
 * Au retour, le direct se renégocie : nouvelle configuration ICE, nouvelle
 * offre, nouvelle piste (camera.jsx, `startRtc`) — quelques secondes, et
 * jusqu'à 12 par un relais TURN avant que le repli ne prenne la main. (Ces
 * 4 et 12 s sont des plafonds, pas une durée mesurée sur une vraie caméra :
 * la démo n'en a pas.)
 * Couper au premier coup d'œil ailleurs — une notification, un autre
 * onglet, une autre appli le temps d'une réponse — ferait payer ce délai à
 * chaque retour. Pendant la grâce rien n'est coupé : un retour rapide
 * retrouve son image sans rien renégocier. Au-delà, l'absence est assez
 * longue pour que quelques secondes au retour coûtent moins qu'une nuit de
 * décodage, et qu'une session qui passe par un relais TURN — donc par le
 * forfait du téléphone — reste ouverte pour personne.
 *
 * Plutôt garder que le dire : un texte « reconnexion » serait un changement
 * visible de la tuile, et le lot 14 n'en fait aucun ; pendant la reprise, la
 * tuile montre ce qu'elle montre déjà au premier chargement.
 *
 * Limite : une page que le système GÈLE (application passée en arrière-plan
 * sur un téléphone) n'a plus de minuteurs, l'échéance attend le dégel et le
 * retour l'annule. La session est alors ce que le système en a fait, comme
 * avant ce lot ; morte, le guet du gel de `CamLive` passe au repli en 9 s. */
export const GRACE_DIRECT = 30000;

/** Vrai quand quelqu'un peut voir la page. Hors navigateur : vrai, il n'y a
 * rien à couper. */
export function pageRegardee(doc = globalThis.document) {
  if (!doc) return true;
  if (doc.visibilityState === 'hidden') return false;
  const racine = doc.documentElement;
  return !(racine && racine.classList && racine.classList.contains(CLASSE_VEILLE));
}

/** La veille vient de poser ou de retirer sa classe : prévenir qui écoute. */
export function annoncerVeille(doc = globalThis.document) {
  try { doc.dispatchEvent(new Event(EVENEMENT_VEILLE)); } catch { /* hors navigateur */ }
}

/** Suivre le regard : `surChange(regardee)` part une fois à l'abonnement (le
 * rendu a pu précéder un changement), puis à chaque bascule réelle. La perte
 * attend `grace` ms et s'annule si la page redevient visible entre-temps ; le
 * retour est immédiat. Rend la fonction qui débranche tout — un effet la rend
 * telle quelle. `horloge` ne se remplace que dans un test. */
export function suivreRegard(surChange, { grace = 0, doc = globalThis.document, horloge = globalThis } = {}) {
  if (!doc || typeof doc.addEventListener !== 'function') return () => {};
  let regardee = pageRegardee(doc);
  let attente = null;
  const annuler = () => {
    if (attente != null) horloge.clearTimeout(attente);
    attente = null;
  };
  const basculer = (v) => {
    if (v === regardee) return;
    regardee = v;
    surChange(v);
  };
  const relire = () => {
    if (pageRegardee(doc)) { annuler(); basculer(true); return; }
    if (!regardee || attente != null) return;
    if (!(grace > 0)) { basculer(false); return; }
    // La classe fait foi à l'échéance : un retour dont l'événement s'est perdu ne coupe rien.
    attente = horloge.setTimeout(() => { attente = null; if (!pageRegardee(doc)) basculer(false); }, grace);
  };
  doc.addEventListener('visibilitychange', relire);
  doc.addEventListener(EVENEMENT_VEILLE, relire);
  surChange(regardee);
  return () => {
    annuler();
    doc.removeEventListener('visibilitychange', relire);
    doc.removeEventListener(EVENEMENT_VEILLE, relire);
  };
}
