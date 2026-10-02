/* ── Les rappels du rail : les listes de tâches de Home Assistant ───────────
 *
 * Maquette du 03/10 : « Rappels · 4 à faire aujourd'hui », trois onglets
 * — Aujourd'hui · Demain · Plus tard —, et des lignes qui portent une pastille
 * de couleur, un titre, sa catégorie et son heure. En retard : l'heure passe
 * au rouge et dit « En retard ».
 *
 * CE QUE C'EST, ET CE QUE CE N'EST PAS. Un rappel se COCHE ; un rendez-vous
 * d'agenda, non. Un rappel dont l'heure est passée est EN RETARD ; un
 * rendez-vous passé est simplement passé. C'est donc le domaine `todo` de Home
 * Assistant, et non `calendar` : chaque liste y est une entité `todo.…`, et ses
 * tâches se lisent par le service `todo.get_items`.
 *
 * ADAPTÉ À TOUS, PAS À UNE SEULE MAISON. Les catégories ne sont pas écrites
 * ici : ce sont les listes que CHACUN possède, avec le nom que Home Assistant
 * leur donne — « Maison », « Santé », « Boodschappen », ce qu'on veut. Leur
 * couleur se calcule à partir de leur identifiant, pour qu'une même liste
 * garde la sienne d'un rechargement à l'autre. Pas de liste chez vous : pas de
 * carte, comme l'agenda.
 *
 * Une tâche telle que Home Assistant la rend :
 *   { uid, summary, status: 'needs_action' | 'completed',
 *     due: '2026-10-03' ou '2026-10-03T18:00:00', description }
 * `due` seul en date = une tâche de la journée, sans heure. Aucun React ici :
 * tout se teste à la main.
 */

/** Les entités de listes de tâches, par ordre alphabétique de leur nom. */
export function listesTodo(states) {
  const S = states || {};
  const l = Object.keys(S)
    .filter(id => id.indexOf('todo.') === 0)
    .map(id => ({ id, nom: (((S[id] || {}).attributes || {}).friendly_name || id.slice(5)).trim() }))
    .sort((x, y) => x.nom.localeCompare(y.nom));
  /* La couleur SERT a distinguer : a six listes ou moins, chacune a la sienne
   * — le hachage, lui, pouvait en donner deux pareilles. Au-dela il reprend la
   * main : il faut bien que deux listes partagent, autant que ce soit stable. */
  return l.map((x, i) => ({ ...x, rgb: l.length <= TEINTES.length ? TEINTES[i] : teinteListe(x.id) }));
}

/* Six teintes, prises à l'identifiant : la même liste garde sa couleur, et
 * deux maisons différentes n'ont pas à s'entendre sur un code. */
const TEINTES = ['79,140,255', '142,110,255', '46,196,136', '236,98,140', '255,166,60', '64,196,214'];

/** La teinte d'une liste, stable pour un identifiant donné. */
export function teinteListe(id) {
  const s = String(id || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TEINTES[h % TEINTES.length];
}

/**
 * L'échéance d'une tâche, ou `null` quand elle n'en a pas.
 * `avecHeure` dit si l'heure a été donnée : « 18:00 » s'affiche, une date
 * seule dit « toute la journée » et n'est jamais en retard avant son lendemain.
 */
export function echeanceDe(item) {
  const brut = item && typeof item.due === 'string' ? item.due.trim() : '';
  if (!brut) return null;
  /* Home Assistant accepte « 2026-10-03 19:30:00 » comme « 2026-10-03T19:30:00 »
   * et rend tantot l'un, tantot l'autre selon l'integration : on normalise,
   * sinon la forme a espace passait pour une date SANS heure et la tache
   * tombait dans « Plus tard » au lieu d'aujourd'hui. */
  const d = brut.replace(' ', 'T');
  const avecHeure = d.indexOf('T') > 0;
  const t = new Date(avecHeure ? d : d + 'T00:00:00');
  if (isNaN(t.getTime())) return null;
  return { date: t, avecHeure };
}

const minuit = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ecartJours = (a, b) => Math.round((minuit(a).getTime() - minuit(b).getTime()) / 864e5);

/**
 * Une tâche prête à montrer : son titre, sa liste, sa teinte, son échéance, et
 * dans quel onglet elle tombe.
 *
 * `quand` vaut 'retard', 'aujourdhui', 'demain', 'plustard' ou 'sansdate'.
 * Une tâche sans heure n'est en retard qu'une fois SON JOUR passé : « arroser
 * les plantes » posé pour aujourd'hui ne doit pas rougir dès minuit une.
 */
export function lireTodo(item, liste, maintenant) {
  const e = echeanceDe(item);
  const now = maintenant instanceof Date ? maintenant : new Date(maintenant);
  const d = e ? ecartJours(e.date, now) : 0;
  const quand = !e ? 'sansdate'
    : (e.avecHeure ? e.date.getTime() < now.getTime() : d < 0) ? 'retard'
      : d <= 0 ? 'aujourdhui' : d === 1 ? 'demain' : 'plustard';
  return {
    cle: (liste ? liste.id : '') + '|' + ((item && (item.uid || item.summary)) || ''),
    uid: (item && item.uid) || null,
    titre: ((item && item.summary) || '').trim(),
    listeId: liste ? liste.id : null,
    categorie: liste ? liste.nom : '',
    rgb: liste ? liste.rgb : TEINTES[0],
    echeance: e ? e.date : null,
    avecHeure: !!(e && e.avecHeure),
    quand,
    fait: !!(item && item.status === 'completed'),
  };
}

/** Les onglets de la maquette, dans leur ordre. */
export const ONGLETS_RAPPELS = ['aujourdhui', 'demain', 'plustard'];

/**
 * Les tâches rangées par onglet. Celles qui sont EN RETARD rejoignent
 * « Aujourd'hui », en tête : elles attendent qu'on s'en occupe maintenant, et
 * un onglet « En retard » qui n'existerait que les mauvais jours ferait danser
 * la barre. Celles qui n'ont pas de date vont dans « Plus tard » — elles ne
 * sont ni pour aujourd'hui ni en retard. Les tâches faites ne comptent pas.
 */
export function rangerTodos(taches, maintenant) {
  const out = { aujourdhui: [], demain: [], plustard: [] };
  const rang = { retard: 0, aujourdhui: 1, demain: 0, plustard: 0, sansdate: 1 };
  for (const t of (taches || [])) {
    if (!t || t.fait || !t.titre) continue;
    const cible = (t.quand === 'retard' || t.quand === 'aujourdhui') ? 'aujourdhui'
      : t.quand === 'demain' ? 'demain' : 'plustard';
    out[cible].push(t);
  }
  const quandMs = (t) => (t.echeance ? t.echeance.getTime() : Infinity);
  for (const k of ONGLETS_RAPPELS) {
    out[k].sort((x, y) => (rang[x.quand] - rang[y.quand]) || (quandMs(x) - quandMs(y)) || x.titre.localeCompare(y.titre));
  }
  return out;
}

/* Les droits d'une liste, lus dans `supported_features` (TodoListEntityFeature
 * de Home Assistant). Une liste en lecture seule — un abonnement partagé, par
 * exemple — ne doit montrer ni « + », ni case à cocher, ni suppression : le
 * geste partirait et reviendrait refusé, sans un mot. */
const CREER = 1, SUPPRIMER = 2, MODIFIER = 4, DATE = 16, HEURE = 32;
const aDroit = (etat, bit) => ((((etat || {}).attributes || {}).supported_features || 0) & bit) === bit;

export const peutCreer = (etat) => aDroit(etat, CREER);
export const peutSupprimer = (etat) => aDroit(etat, SUPPRIMER);
/** Cocher une tâche, c'est la MODIFIER : son statut passe à `completed`. */
export const peutCocher = (etat) => aDroit(etat, MODIFIER);
export const peutDater = (etat) => aDroit(etat, DATE);
export const peutHeurer = (etat) => aDroit(etat, HEURE);
