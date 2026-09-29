/* Un réglage qui n'est jamais arrivé au serveur.
 *
 * Retour du 28/09 : « parfois quand j'actualise la page, éventuellement après
 * un redémarrage, j'ai une organisation de cartes grande petite, masquer,
 * démasquer. Et bien ça réinitialise et revient en arrière, je suis obligé de
 * remettre mes cartes comme je les avais mises. »
 *
 * Le chemin du défaut, bout à bout :
 *
 * 1. `saveCfg` envoie le réglage au composant sans attendre la réponse. Si
 *    l'envoi échoue — Home Assistant qui redémarre, une reconnexion, une page
 *    actualisée pendant l'aller-retour — la valeur part dans le stockage de
 *    l'appareil, et personne ne la renvoie jamais.
 * 2. Au chargement suivant, `cfgVal` donne la main au serveur pour tout ce qui
 *    est commun : `if (LOGGIA_SERVER && !estPersonnelle(key)) return fallback;`
 *    — le stockage local n'est même pas consulté.
 * 3. `completerDepuisLocal` ne pousse que les clés ABSENTES du serveur. Un
 *    agencement existe déjà là-bas : la version locale, plus récente, ne
 *    remonte donc jamais.
 *
 * Résultat : l'agencement a l'air enregistré toute la séance, puis revient à
 * celui d'avant au rechargement. Et comme `setLayout` réécrit la clé ENTIÈRE,
 * une seule écriture perdue emporte toutes les pièces et toutes les vues — ce
 * qui donne l'impression d'une remise à zéro, pas d'une carte oubliée.
 *
 * Ce module tient donc un carnet : on inscrit AVANT d'envoyer, on raye au
 * succès, et ce qui reste part au prochain démarrage. Écrire d'abord est ce
 * qui couvre le cas le plus courant — actualiser juste après avoir rangé une
 * carte, sans que la requête ait eu le temps de partir.
 */

const CLE = 'loggia_enattente';

/** Le carnet, ou `{}` — une valeur abîmée ne bloque rien. */
function lire() {
  if (typeof window === 'undefined') return {};
  try {
    const v = window.localStorage.getItem(CLE);
    const m = v ? JSON.parse(v) : null;
    return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
  } catch { return {}; }
}

/** Range le carnet, et l'efface plutôt que de garder un objet vide. */
function ecrire(m) {
  if (typeof window === 'undefined') return;
  try {
    if (!m || !Object.keys(m).length) window.localStorage.removeItem(CLE);
    else window.localStorage.setItem(CLE, JSON.stringify(m));
  } catch { /* stockage plein ou refusé : on perd le filet, pas le réglage */ }
}

/**
 * Inscrit un lot AVANT de l'envoyer, et rend ses marques.
 *
 * `n` compte les écritures de chaque clé. Il sert à une seule chose : au
 * retour d'un envoi lent, ne pas rayer une valeur écrite entre-temps.
 */
export function poserEnAttente(patch) {
  if (!patch || typeof patch !== 'object') return {};
  const m = lire();
  const marques = {};
  Object.keys(patch).forEach((k) => {
    if (k === CLE) return;
    const n = (((m[k] && m[k].n) | 0) || 0) + 1;
    m[k] = { v: patch[k] === undefined ? null : patch[k], n };
    marques[k] = n;
  });
  ecrire(m);
  return marques;
}

/**
 * Raye ce qui est bien arrivé.
 *
 * Une clé réécrite pendant l'aller-retour porte un `n` plus grand : elle reste
 * au carnet, sinon la dernière valeur serait celle qui se perdrait.
 */
export function purgerEnAttente(marques) {
  if (!marques || !Object.keys(marques).length) return;
  const m = lire();
  let change = false;
  Object.keys(marques).forEach((k) => {
    if (m[k] && m[k].n === marques[k]) { delete m[k]; change = true; }
  });
  if (change) ecrire(m);
}

/** Ce qui attend, sous la forme d'un lot prêt à envoyer — ou `null`. */
export function enAttente() {
  const m = lire();
  const cles = Object.keys(m);
  if (!cles.length) return null;
  const patch = {};
  cles.forEach((k) => { patch[k] = (m[k] && 'v' in m[k]) ? m[k].v : null; });
  return patch;
}

/**
 * Renvoie au composant ce qui n'était jamais arrivé.
 *
 * Deux échecs à ne pas confondre. Un transport coupé se retente : le carnet
 * garde tout. Un REFUS applicatif porte un `code` — une clé de la maison
 * écrite depuis un compte ordinaire, par exemple — et se retenterait en vain à
 * chaque ouverture ; on le raye, en le disant au journal.
 */
export async function renvoyerEnAttente(hass) {
  const patch = enAttente();
  if (!patch || !hass || typeof hass.callWS !== 'function') return { cles: [] };
  const m = lire();
  const marques = {};
  Object.keys(patch).forEach((k) => { marques[k] = m[k] && m[k].n; });
  try {
    await hass.callWS({ type: 'loggia/config/set', config: patch });
  } catch (e) {
    if (e && e.code) {
      console.warn('Loggia : reglage(s) refuse(s) au renvoi, abandonnes', Object.keys(patch), e);
      purgerEnAttente(marques);
      return { cles: [], refus: e };
    }
    return { cles: [], erreur: e };
  }
  purgerEnAttente(marques);
  return { cles: Object.keys(patch) };
}
