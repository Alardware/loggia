/* Un réglage de règle refusé se DIT, et il NOMME sa clé (audit du 03/10).
 *
 * Les règles de volets s'écrivent par `loggia/volets/config`, gardée — comme
 * ses voisines — par `require_admin` de Home Assistant. Un compte ordinaire
 * reçoit `unauthorized`, « Unauthorized », et rien d'autre.
 *
 * La barre « Mode » de la vue Volets avalait ce refus : son `catch` recopiait
 * l'état sur lui-même. Le bouton choisi restait allumé jusqu'au sondage
 * suivant — quinze secondes —, puis revenait seul, sans un mot ; et les volets
 * se fermaient le soir selon l'ancien mode. Laissé remonter tel quel, le refus
 * n'aurait pas valu mieux : l'écoute globale lit `unauthorized` comme une
 * COMMANDE d'appareil refusée (« Commande non exécutée — Home Assistant a
 * refusé ou n'a pas répondu »), alors que c'est un réglage de la maison qui
 * n'a pas pris. Et un message qui ne nomme rien coûte des jours (ADR 0125).
 *
 * On le redit donc dans la forme que le magasin donne déjà à ce refus
 * (`store.py`, `MaisonReserveeError`) : le code `not_admin`, la clé après les
 * deux-points. Le toast sait la nommer sans rien apprendre de neuf.
 */

/* Refusé, ou en panne ? Ce qu'un enregistrement raté doit dire (audit du 03/10).
 *
 * Trois autorisations du catalogue des profils (`DROITS`, state.js) — Règles,
 * Interrupteurs, Alertes — ouvrent leur section des Paramètres à un profil
 * Famille. Ce qu'on y règle appartient pourtant à la maison, et le COMPOSANT en
 * garde l'écriture aux administrateurs de Home Assistant : `require_admin` sur
 * les commandes des modules (Home Assistant répond `unauthorized`, et rien de
 * plus), `MaisonReserveeError` sur `loggia_alertes` (`not_admin`, la clé nommée
 * — store.py). Le profil n'y change rien : la case se cochait, la section
 * s'ouvrait, et sous un compte Home Assistant ordinaire rien ne s'enregistrait.
 *
 * L'écran le disait mal, ou pas du tout. Les alertes répondaient « le composant
 * ne répond pas » à un refus — on cherchait une panne qui n'existait pas. Les
 * règles affichaient « Unauthorized », en anglais. « Observer sans agir »
 * jetait ses quatre refus et revenait en arrière à la relecture, sans un mot.
 *
 * La frontière ne bouge pas (ADR 0125) : ces réglages commandent la maison. Ce
 * qui change, c'est que le refus se DIT, qu'il NOMME ce qui n'a pas pris, et
 * qu'il ne se confond plus avec une panne. Même partage qu'au carnet des
 * réglages (enattente.js) : un refus porte un `code` — une chaîne, chez le
 * composant comme chez Home Assistant —, une coupure n'en porte pas : la
 * bibliothèque du navigateur rejette alors le message entier, son code rangé
 * sous `error`, ou un simple numéro d'erreur.
 */
import { tr } from './i18n.js';

/** La forme du magasin : la clé suit les deux-points. */
const MOTIF = 'reglages reserves aux administrateurs Home Assistant : ';

/**
 * Le refus à faire remonter, ou `null`.
 *
 * Sans `code`, c'est une coupure de transport — Home Assistant qui redémarre,
 * une reconnexion : rien à annoncer, comme dans `saveCfg`. Un `not_admin` venu
 * du serveur nomme déjà ses clés ; tout autre code passe tel quel.
 */
export function refusNomme(e, cle) {
  if (!e || !e.code) return null;
  if (e.code !== 'unauthorized' || !cle) return e;
  return Object.assign(new Error(MOTIF + cle), { code: 'not_admin' });
}

/* Le canal du toast global (ADR 0046) : un rejet que personne ne reprend. */
const relancer = (err) => { Promise.reject(err); };

/**
 * Écrit un réglage de règle, et rend la réponse — ou `null` s'il n'a pas pris.
 *
 * `annuler` est appelé à TOUT échec, refus ou coupure : l'écran retire tout de
 * suite ce qu'il montrait d'avance, plutôt que de le laisser mentir jusqu'au
 * sondage suivant. Un refus remonte à l'écoute globale en nommant `cle`.
 * `signaler` n'existe que pour les tests : le rejet non repris, qui est le
 * canal du toast, ferait échouer un test de Node.
 */
export function ecrireRegle(hass, type, patch, { cle, annuler, signaler = relancer } = {}) {
  const rien = () => { if (typeof annuler === 'function') annuler(); return null; };
  if (!hass || typeof hass.callWS !== 'function') return Promise.resolve(rien());
  return hass.callWS({ type, patch }).catch((e) => {
    const refus = refusNomme(e, cle);
    if (refus) signaler(refus);
    return rien();
  });
}

// ── Refusé, ou en panne ? (Paramètres, droits des profils) ──────────────
/** Un refus — du composant ou de Home Assistant —, pas une coupure. */
export function estRefus(e) {
  return !!(e && typeof e.code === 'string' && e.code);
}

/** Les clés que le composant nomme après les deux-points de son refus
 *  (« reglages reserves aux administrateurs Home Assistant : loggia_alertes »),
 *  ou '' quand il n'en nomme aucune. */
export function clesRefusees(e) {
  const m = String((e && e.message) || '');
  const i = m.indexOf(':');
  return i < 0 ? '' : m.slice(i + 1).trim();
}

/* Un refus PRÉVISIBLE se dit par son CODE (audit du 03/10).
 *
 * Le composant répondait en français sans accents — « trop de scenarios (24
 * au plus) », « valeur trop volumineuse pour la cle … » —, et l'écran
 * affichait ce texte tel quel, dans les sept langues : la fiche d'un
 * scénario, le planning d'un robot, l'import d'une configuration. Le toast
 * reconnaissait même le passage refusé vers un profil Admin à une expression
 * sur ce français. Chaque refus qu'un geste ordinaire peut provoquer porte
 * désormais un code à lui (`custom_components/loggia/refus.py`) ; son message
 * reste écrit pour le journal de Home Assistant. Ce qu'il NOMME — une clé,
 * une limite — suit les deux-points, comme pour `not_admin` : c'est tout ce
 * qu'on lit du message.
 */
const nombre = (x) => (/^\d+$/.test(x) ? Number(x) : x);
const REFUS = {
  /* Ce qui nomme une CLÉ : celle du composant, sinon celle que l'écran écrivait. */
  not_admin: (k) => (k
    ? tr('« {k} » non enregistré — ce réglage appartient à la maison, et seul un administrateur Home Assistant peut le changer', { k })
    : tr('Réglage non enregistré — il appartient à la maison, et seul un administrateur Home Assistant peut le changer')),
  payload_too_large: (k) => (k
    ? tr('« {k} » non enregistré — trop volumineux', { k })
    : tr('Réglage non enregistré — trop volumineux')),
  code_admin_requis: () => tr('Profil non changé — le code administrateur est requis'),
  /* Ce qui nomme une LIMITE : celle du composant, le seul à la connaître.
   * Sans elle, la phrase aurait un trou à la place du nombre : `null`, et
   * l'appelant retombe sur son dernier recours. */
  trop_de_scenarios: (k, n) => (typeof n === 'number' ? tr('Scénario non enregistré — {n} scénarios personnels au plus', { n }) : null),
  trop_d_actions: (k, n) => (typeof n === 'number' ? tr('Scénario non enregistré — {n} actions au plus', { n }) : null),
  trop_de_plannings: (k, n) => (typeof n === 'number' ? tr('Planning non enregistré — {n} plannings au plus', { n }) : null),
};

/**
 * Ce qu'un refus du composant veut dire, dans la langue de l'écran — ou
 * `null` : une coupure, un code que la table ne connaît pas, ou une limite que
 * le composant n'a pas nommée, que l'appelant dit à sa façon. `quoi` nomme la
 * clé que l'écran écrivait, quand le composant n'en nomme aucune.
 */
export function texteRefus(e, quoi = '') {
  if (!estRefus(e) || !Object.prototype.hasOwnProperty.call(REFUS, e.code)) return null;
  const nomme = clesRefusees(e);
  return REFUS[e.code](nomme || quoi, nombre(nomme));
}

/**
 * La phrase d'un enregistrement raté, dans la langue de l'écran.
 *
 * `quoi` nomme ce qui n'a pas pris quand le serveur ne le dit pas :
 * `require_admin` répond « Unauthorized » sans un mot de la clé, mais l'écran
 * sait laquelle il écrivait. Les clés que le composant nomme passent devant.
 * Les deux phrases du refus sont celles du toast global (App.jsx) : un même
 * refus se dit pareil partout.
 */
export function raisonEchec(e, quoi = '') {
  if (!estRefus(e)) return tr('Enregistrement impossible — le composant ne répond pas.');
  // `unauthorized` est le refus de la maison, sans la clé : la table le lit
  // comme `not_admin`, et nomme celle que l'écran écrivait.
  const lu = texteRefus(e.code === 'unauthorized' ? { code: 'not_admin' } : e, quoi);
  /* Le dernier recours : un code que la table ne connaît pas garde son
   * motif, dans une phrase traduite. */
  return lu || tr('Réglage non enregistré — le composant l’a refusé : {x}', { x: e.message || e.code });
}

/**
 * Le bilan de plusieurs écritures lancées ENSEMBLE : '' si toutes ont pris,
 * sinon la phrase qui nomme celles qui n'ont pas pris.
 *
 * `envois` : des paires [clé écrite, promesse]. Une écriture ratée n'arrête
 * pas les autres — c'était le seul mérite de l'ancien filet, qui jetait chaque
 * rejet —, mais elle n'est plus perdue. Les rejets sont attrapés dans le tick
 * même : aucun ne remonte au toast global en plus du message de la vue.
 */
export async function bilanEcritures(envois) {
  const echecs = (await Promise.all((envois || []).map(([cle, p]) =>
    Promise.resolve(p).then(() => null, (e) => ({ cle, e }))))).filter(Boolean);
  return echecs.length ? raisonEchec(echecs[0].e, echecs.map(x => x.cle).join(', ')) : '';
}
