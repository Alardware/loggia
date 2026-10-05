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
 *
 * Audit du 03/10, trois corrections — seule une écriture PERDUE se garde, et
 * indéfiniment s'il le faut (ADR 0109) :
 *
 * - UN CARNET PAR COMPTE. Il était unique pour le navigateur. Un réglage de la
 *   maison tenté depuis un compte ordinaire — `loggia_users`, ou
 *   `loggia_rooms = []` — attendait le démarrage suivant, et repartait sous le
 *   compte qui ouvrait alors la page : un administrateur sur la même tablette,
 *   et il passait sous SES droits. Chaque écriture se range sous l'id du
 *   compte Home Assistant qui l'a tentée, et ne repart que sous lui.
 * - L'EMPREINTE. Ce qu'il renvoyait des jours plus tard remplaçait la clé
 *   ENTIÈRE, même si un autre écran avait rangé depuis : un téléphone rouvert
 *   effaçait l'ordre fait sur l'ordinateur, la carte ajoutée, la disposition
 *   de la tablette, sans un mot. Chaque entrée retient l'empreinte de ce que
 *   le serveur tenait quand elle s'est ouverte, et celles de nos propres
 *   envois restés sans réponse ; au renvoi, si le serveur tient autre chose,
 *   un autre écran a rangé depuis — c'est lui qui a raison, l'entrée se raye.
 * - CLÉ PAR CLÉ. Le composant refuse un lot ENTIER dès qu'une seule clé de la
 *   maison y figure, et le renvoi rayait alors tout le carnet : sur un compte
 *   ordinaire, une clé réservée emportait l'agencement perdu à côté d'elle,
 *   exactement ce que le carnet devait sauver (ADR 0125 l'ouvre à tous).
 */

const CLE = 'loggia_enattente';

/** L'id du compte Home Assistant de cette session, ou `null`. */
export function compteDe(hass) {
  const id = hass && hass.user && hass.user.id;
  return (typeof id === 'string' && id) ? id : null;
}

/* Le stockage : `{ comptes: { <id du compte>: { <clé>: { v, n, e?, p? } } } }`,
 * sous la MÊME clé qu'avant — l'export, l'import et les clés propres à
 * l'appareil la connaissent déjà. Un carnet d'avant le 03/10 rangeait les clés
 * à la racine, sans dire qui les avait écrites : il se lit vide, pour la
 * raison même du changement, et la première écriture le remplace. */

/** Tous les carnets, compte par compte — ou `{}` : une valeur abîmée ne bloque rien. */
function lireTout() {
  if (typeof window === 'undefined') return {};
  try {
    const v = window.localStorage.getItem(CLE);
    const m = v ? JSON.parse(v) : null;
    const c = (m && typeof m === 'object' && !Array.isArray(m)) ? m.comptes : null;
    return (c && typeof c === 'object' && !Array.isArray(c)) ? c : {};
  } catch { return {}; }
}

/** Le carnet d'UN compte, ou `{}`. */
function lire(compte) {
  const tout = lireTout();
  const m = Object.prototype.hasOwnProperty.call(tout, compte) ? tout[compte] : null;
  return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
}

/** Range le carnet d'un compte ; un carnet vide s'efface, et le stockage aussi
 *  quand plus aucun compte n'attend rien. */
function ecrire(compte, m) {
  if (typeof window === 'undefined') return;
  const tout = lireTout();
  if (m && Object.keys(m).length) tout[compte] = m;
  else delete tout[compte];
  try {
    if (!Object.keys(tout).length) window.localStorage.removeItem(CLE);
    else window.localStorage.setItem(CLE, JSON.stringify({ comptes: tout }));
  } catch { /* stockage plein ou refusé : on perd le filet, pas le réglage */ }
}

/* Forme canonique d'une valeur, telle que JSON la transporte mais les clés des
 * objets triées : un agencement relu du serveur et le même gardé ici doivent
 * se reconnaître, quel que soit l'ordre où leurs clés ont été posées. L'ordre
 * d'une LISTE, lui, compte : c'est l'agencement. */
function canonique(v) {
  if (v === undefined || v === null) return 'null';
  if (typeof v.toJSON === 'function') return canonique(v.toJSON());
  if (Array.isArray(v)) return '[' + v.map((x) => canonique(x)).join(',') + ']';
  if (typeof v === 'object') {
    return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort()
      .map((k) => JSON.stringify(k) + ':' + canonique(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

/**
 * Empreinte d'une valeur de configuration (audit du 03/10).
 *
 * Absente et `null` se valent : pour le composant, `null` efface. Courte —
 * longueur et FNV-1a sur 32 bits — parce que le carnet vit dans le stockage
 * de l'appareil et n'a pas à y loger une seconde copie de chaque agencement.
 * Deux valeurs de même longueur ont une chance sur quatre milliards de se
 * confondre : un risque qui ne vaut pas cette copie.
 */
export function empreinte(v) {
  const s = canonique(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return s.length.toString(36) + '.' + (h >>> 0).toString(36);
}

/* Combien de nos propres envois sans réponse une entrée se rappelle. */
const MEMOIRE = 16;

/* Les empreintes de NOS envois restés sans réponse, celui d'`avant` compris
 * (audit du 03/10). Un envoi sans réponse a pu arriver quand même — Home
 * Assistant qui redémarre juste après l'avoir rangé. Le serveur qui le tient
 * n'a donc pas « bougé depuis » : c'est nous qu'il montre, et la valeur
 * suivante doit repartir. Sans cette mémoire, un redémarrage pendant qu'on
 * range perdait de nouveau la dernière carte — le cas même du 28/09. */
function nosEnvois(avant) {
  const x = empreinte(avant.v);
  const p = Array.isArray(avant.p) ? avant.p.filter((y) => typeof y === 'string' && y !== x) : [];
  return [...p, x].slice(-MEMOIRE);
}

/**
 * Inscrit un lot AVANT de l'envoyer, et rend ses marques.
 *
 * `n` compte les écritures de chaque clé. Il sert à une seule chose : au
 * retour d'un envoi lent, ne pas rayer une valeur écrite entre-temps.
 *
 * `compte` est l'id du compte Home Assistant qui écrit (`compteDe`). Sans
 * lui, rien ne s'inscrit : personne ne saurait sous quels droits le rejouer.
 *
 * `serveur` est la configuration que cet écran tient du composant — `null`
 * tant qu'il n'a pas répondu. L'empreinte `e` de ce qu'il tenait se prend à
 * l'OUVERTURE de l'entrée. Une clé déjà au carnet garde la sienne : ce que
 * l'écran montre est alors notre propre envoi, encore en route — qui rejoint
 * `p`, nos envois sans réponse. Sauf si l'écran a relu entre-temps une AUTRE
 * valeur (ADR 0067) : un autre écran a rangé, et l'on range par-dessus en le
 * voyant — `e` devient ce qu'il voit. Sans serveur connu, pas d'empreinte : la
 * valeur repartira sans condition, comme avant.
 */
export function poserEnAttente(patch, compte, serveur = null) {
  if (!compte || !patch || typeof patch !== 'object') return {};
  const m = lire(compte);
  const marques = {};
  const connu = !!serveur && typeof serveur === 'object';
  Object.keys(patch).forEach((k) => {
    if (k === CLE) return;
    const avant = (m[k] && typeof m[k] === 'object') ? m[k] : null;
    const n = (((avant && avant.n) | 0) || 0) + 1;
    const entree = { v: patch[k] === undefined ? null : patch[k], n };
    const vu = connu ? empreinte(serveur[k]) : null;
    if (avant && (!vu || vu === empreinte(avant.v))) {
      if (typeof avant.e === 'string') { entree.e = avant.e; entree.p = nosEnvois(avant); }
    } else if (vu) {
      entree.e = vu;
      if (avant) entree.p = nosEnvois(avant);
    }
    m[k] = entree;
    marques[k] = n;
  });
  ecrire(compte, m);
  return marques;
}

/**
 * Raye ce qui n'a plus à attendre : arrivé, ou REFUSÉ (le refus se dit
 * ailleurs — `saveCfg`, le toast global).
 *
 * Une clé réécrite pendant l'aller-retour porte un `n` plus grand : elle reste
 * au carnet, sinon la dernière valeur serait celle qui se perdrait.
 */
export function purgerEnAttente(marques, compte) {
  if (!compte || !marques || !Object.keys(marques).length) return;
  const m = lire(compte);
  let change = false;
  Object.keys(marques).forEach((k) => {
    if (m[k] && m[k].n === marques[k]) { delete m[k]; change = true; }
  });
  if (change) ecrire(compte, m);
}

/** Ce qui attend pour ce compte, sous la forme d'un lot prêt à envoyer — ou `null`. */
export function enAttente(compte) {
  if (!compte) return null;
  const m = lire(compte);
  const cles = Object.keys(m);
  if (!cles.length) return null;
  const patch = {};
  cles.forEach((k) => { patch[k] = (m[k] && 'v' in m[k]) ? m[k].v : null; });
  return patch;
}

/**
 * Renvoie au composant ce qui n'était jamais arrivé.
 *
 * Seul part le carnet du compte connecté (`compte`, sinon celui de `hass`) :
 * ce qu'un autre compte a laissé sur cet appareil attend son auteur, et ne
 * passe jamais sous d'autres droits que les siens.
 *
 * Le serveur a pu bouger depuis. `serveur` est la configuration qu'on vient
 * de lire. Une entrée qu'il tient déjà était arrivée, seule la réponse s'est
 * perdue : rayée sans rien renvoyer. Une entrée dont il ne tient ni
 * l'empreinte `e`, ni l'un de nos envois sans réponse `p`, a été dépassée — un
 * autre écran a rangé entre-temps — et sa valeur, qui porte la clé entière,
 * écraserait ce rangement : rayée aussi, en le disant au journal. Sans
 * `serveur`, ou sans empreinte (entrée d'avant ce correctif), tout repart.
 *
 * Puis UNE CLÉ PAR ENVOI. Deux échecs à ne pas confondre : un REFUS porte un
 * `code` — une clé de la maison sous un compte ordinaire, par exemple — et se
 * retenterait en vain : cette clé seule est rayée, les autres partent. Une
 * COUPURE n'en porte pas : on s'arrête, la suite échouerait pareil, et le
 * carnet garde ce qui n'est pas parti. Ce qui arrive est rayé aussitôt : une
 * page fermée en plein renvoi ne le renverra pas une seconde fois. Le message
 * d'erreur nomme bien les clés, mais c'est un texte pour les humains : le lire
 * serait parier sur sa forme.
 */
export async function renvoyerEnAttente(hass, compte = null, serveur = null) {
  const id = compte || compteDe(hass);
  if (!id || !hass || typeof hass.callWS !== 'function') return { cles: [] };
  const m = lire(id);
  if (!Object.keys(m).length) return { cles: [] };
  const connu = !!serveur && typeof serveur === 'object';
  const patch = {};
  const marques = {};
  const depassees = [];
  let raye = false;
  Object.keys(m).forEach((k) => {
    const x = m[k];
    if (!x || typeof x !== 'object') { delete m[k]; raye = true; return; }
    const v = 'v' in x ? x.v : null;
    if (connu) {
      const la = empreinte(serveur[k]);
      const arrivee = la === empreinte(v);
      const depassee = !arrivee && typeof x.e === 'string' && la !== x.e
        && !(Array.isArray(x.p) && x.p.includes(la));
      if (arrivee || depassee) {
        if (depassee) depassees.push(k);
        delete m[k]; raye = true; return;
      }
    }
    patch[k] = v;
    marques[k] = x.n;
  });
  if (raye) ecrire(id, m);
  if (depassees.length) console.info('Loggia : reglage(s) en attente abandonne(s), un autre ecran a range depuis', depassees);
  const cles = [];
  const refusees = [];
  let refus = null;
  let erreur = null;
  for (const k of Object.keys(patch)) {
    try {
      await hass.callWS({ type: 'loggia/config/set', config: { [k]: patch[k] } });
      cles.push(k);
    } catch (e) {
      if (!(e && e.code)) { erreur = e; break; }
      refusees.push(k);
      if (!refus) refus = e;
    }
    purgerEnAttente({ [k]: marques[k] }, id);
  }
  if (refusees.length) console.warn('Loggia : reglage(s) refuse(s) au renvoi, abandonnes', refusees, refus);
  const r = { cles, depassees };
  if (refus) { r.refus = refus; r.refusees = refusees; }
  if (erreur) r.erreur = erreur;
  return r;
}
