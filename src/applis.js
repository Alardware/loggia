/**
 * Les applications d'un appareil de streaming, et comment en lancer une.
 *
 * Il n'y a PAS de règle unique. Home Assistant expose les applications d'une
 * TV connectée de trois façons selon l'intégration, et la « solution évidente »
 * rate justement l'appareil le plus courant :
 *
 *   1. `source_list` + `media_player.select_source`, quand le lecteur annonce
 *      le bit 2048. Couvre Apple TV, Android TV en ADB, Fire TV, Roku, LG et
 *      Samsung — six familles sur huit.
 *
 *   2. `activity_list` + `remote.turn_on`, sur l'entité `remote.*` du MÊME
 *      appareil, quand elle annonce le bit 4. C'est le seul chemin pour
 *      `androidtv_remote` — l'intégration officielle Android TV et Google TV,
 *      qui n'a NI `source_list` NI `select_source`. Sans cette branche, un
 *      Android TV ne montrerait aucune application.
 *
 *   3. Un Chromecast pur n'expose rien du tout : ni liste, ni sélection. Rien
 *      à faire, et on ne prétend pas le contraire.
 *
 * Ce module est PUR : il lit des états et un index, il ne rend pas de JSX et
 * n'appelle aucun service. Il ne devine rien non plus — une liste absente est
 * une liste absente, pas une liste vide qu'on remplirait au jugé.
 */

/** Les bits qui nous concernent. `media_player` d'un côté, `remote` de l'autre. */
export const FEAT_SOURCE = 2048;        // MediaPlayerEntityFeature.SELECT_SOURCE
export const FEAT_ACTIVITE = 4;         // RemoteEntityFeature.ACTIVITY

const attrs = (etat) => (etat && etat.attributes) || {};
const bits = (etat) => Number(attrs(etat).supported_features) || 0;
const aplati = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * Cette liste de sources désigne-t-elle des SORTIES plutôt que des applications ?
 *
 * Le piège vient de ce que le même attribut et le même bit servent à deux
 * choses opposées. Une Apple TV met ses applications dans `source_list` ;
 * Spotify y met les enceintes où envoyer le son — « Echo - Salon », « Echo Dot
 * - Bureau », « Partout ». Traitée comme des applications, une grille
 * proposerait donc de « lancer » une enceinte.
 *
 * Rien dans Home Assistant ne distingue les deux. Mais une liste de sorties
 * porte les noms d'autres lecteurs de la maison, et une liste d'applications
 * non : c'est ce qu'on regarde. La moitié suffit — une liste de sorties
 * contient souvent un « Partout » qui n'est le nom de personne.
 */
export function estListeDeSorties(liste, etats) {
  const l = Array.isArray(liste) ? liste.filter(x => typeof x === 'string') : [];
  if (!l.length) return false;
  const noms = new Set();
  for (const [id, e] of Object.entries(etats || {})) {
    if (id.indexOf('media_player.') !== 0) continue;
    const n = aplati(attrs(e).friendly_name);
    if (n) noms.add(n);
  }
  if (!noms.size) return false;
  let vus = 0;
  for (const s of l) if (noms.has(aplati(s))) vus += 1;
  return vus * 2 >= l.length;
}

/** L'entité `remote.*` du même appareil, s'il y en a une. */
export function telecommandeDe(id, etats, index) {
  const meta = index && index.entityMeta ? index.entityMeta.get(id) : null;
  const dev = meta && meta.deviceId;
  if (!dev) return null;
  for (const [autre, m] of index.entityMeta) {
    if (autre.indexOf('remote.') !== 0 || !m || m.deviceId !== dev) continue;
    if (etats && etats[autre]) return autre;
  }
  return null;
}

/**
 * Ce qu'on peut lancer sur cet appareil.
 *
 * Rend `null` quand il n'y a rien à proposer — c'est le cas d'un Chromecast,
 * et celui d'une enceinte. Sinon :
 *
 *   `mode`     — `source` ou `activite`, c'est-à-dire par quel service lancer ;
 *   `cible`    — l'entité à commander : le lecteur, ou sa télécommande ;
 *   `liste`    — les noms, tels que l'appareil les écrit ;
 *   `courante` — celle qui tourne, ou `null`.
 *
 * ATTENTION à `courante`. Home Assistant vide TOUS les attributs d'état dès
 * que l'entité passe à `off` : plus d'`app_name`, plus de `source`. La liste,
 * elle, est une capacité et survit. Un appareil éteint montre donc encore ses
 * applications, sans qu'aucune soit soulignée — c'est voulu, pas un oubli.
 */
export function applisDe(id, etats, index) {
  const etat = etats && etats[id];
  if (!etat) return null;
  const a = attrs(etat);

  // 1. La liste du lecteur lui-même.
  const liste = Array.isArray(a.source_list) ? a.source_list.filter(x => typeof x === 'string' && x) : [];
  if ((bits(etat) & FEAT_SOURCE) && liste.length && !estListeDeSorties(liste, etats)) {
    /* `app_name` d'abord, `source` ensuite : Apple TV ne renseigne JAMAIS
     * `source`, et Android TV en ADB renseigne les deux. `app_id` ne sert pas
     * ici — c'est un identifiant de paquet, il ne figure pas dans la liste. */
    const courante = a.app_name || a.source || null;
    return { mode: 'source', cible: id, liste, courante: liste.indexOf(courante) >= 0 ? courante : null };
  }

  // 2. La télécommande du même appareil — le seul chemin d'Android TV.
  const tel = telecommandeDe(id, etats, index);
  const etatTel = tel ? etats[tel] : null;
  const acts = etatTel && Array.isArray(attrs(etatTel).activity_list)
    ? attrs(etatTel).activity_list.filter(x => typeof x === 'string' && x) : [];
  if (etatTel && (bits(etatTel) & FEAT_ACTIVITE) && acts.length) {
    const courante = attrs(etatTel).current_activity || null;
    return { mode: 'activite', cible: tel, liste: acts, courante: acts.indexOf(courante) >= 0 ? courante : null };
  }

  return null;
}

/**
 * L'appel à faire pour lancer une application.
 *
 * Rend `null` si quelque chose ne va pas, plutôt que d'envoyer au hasard. Deux
 * refus comptent :
 *
 *   — un nom qui ne vient PAS de la liste. `select_source` compare des chaînes
 *     strictes, et chaque intégration échoue à sa façon : LG lève une erreur,
 *     Roku ne fait rien en silence, et Android TV en ADB prend la chaîne pour
 *     un nom de paquet et tente de le lancer ;
 *   — un nom commençant par `!`. Sur Android TV en ADB, ce préfixe ARRÊTE
 *     l'application au lieu de la lancer. Aucun nom de la liste n'en porte,
 *     mais rien ne doit pouvoir en fabriquer un.
 */
export function appelPourLancer(choix, nom) {
  if (!choix || typeof nom !== 'string' || !nom || nom.charAt(0) === '!') return null;
  if (choix.liste.indexOf(nom) < 0) return null;
  if (choix.mode === 'source') {
    return { domaine: 'media_player', service: 'select_source', data: { entity_id: choix.cible, source: nom } };
  }
  if (choix.mode === 'activite') {
    return { domaine: 'remote', service: 'turn_on', data: { entity_id: choix.cible, activity: nom } };
  }
  return null;
}

/**
 * Celle qu'on SOULIGNE dans la grille.
 *
 * « Disney+ reste sélectionné même si j'ai changé et cliqué sur Netflix avec
 * l'app lancée » (30/09). Ce n'est pas un état oublié de notre côté : sur une
 * Apple TV, `app_name` suit le LECTEUR, pas l'application ouverte. Elle
 * continue d'annoncer la dernière qui a joué quelque chose, parfois longtemps
 * après qu'on en a ouvert une autre.
 *
 * On souligne donc celle que l'utilisateur vient de lancer DEPUIS Loggia, tant
 * que l'appareil n'a rien annoncé de neuf. Dès qu'il change d'avis — parce
 * qu'on a pris la télécommande, ou qu'il a fini par se mettre à jour —, c'est
 * lui qui fait autorité et notre souvenir s'efface.
 *
 * Pas de minuteur, donc : ce n'est pas un état optimiste qui doit expirer, mais
 * un départage entre deux sources dont l'une est en retard. Un délai le
 * ramènerait à la MAUVAISE valeur au bout de quelques secondes.
 */
export function appliCourante(choix, lancee) {
  if (!choix) return null;
  const memoire = lancee && typeof lancee.nom === 'string' ? lancee.nom : null;
  if (memoire && choix.liste.indexOf(memoire) >= 0 && choix.courante === lancee.avant) return memoire;
  return choix.courante;
}
