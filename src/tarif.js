/* ── Le tarif de l'électricité ──────────────────────────────────────────────
 *
 * Home Assistant ne publie nulle part « les heures creuses sont de 2 h à 7 h
 * et de 13 h à 16 h » : les intégrations de compteur donnent un capteur
 * BINAIRE, vrai quand on y est. Les créneaux se retrouvent donc dans son
 * HISTORIQUE — c'est la seule source honnête, et elle a l'avantage de dire ce
 * qui s'est vraiment passé plutôt que ce qu'un contrat promettait.
 *
 * Tout est pur ici : la vue apporte les états, ce module en fait des plages et
 * choisit le prix du moment.
 */

/** Vrai quand un état de Home Assistant veut dire « en cours ». */
const actif = (s) => s === 'on' || s === 'true' || s === true;

/** Lisible ? Un `unknown`/`unavailable` ne dit ni oui ni non. */
const lisible = (s) => s != null && s !== 'unknown' && s !== 'unavailable';

/**
 * Les plages où un capteur binaire était vrai, entre deux instants.
 *
 * `etats` est ce que rend `history/period` : une suite de changements, le
 * premier portant l'état au début de la fenêtre. Une plage ouverte à la fin de
 * la fenêtre se ferme SUR la fenêtre, pas sur l'instant du dernier changement —
 * sinon la dernière barre s'arrêterait net au milieu de la journée.
 *
 * Les trous (`unavailable`) coupent la plage : on ne comble pas un silence.
 */
export function plagesVraies(etats, debut, fin) {
  const liste = (Array.isArray(etats) ? etats : [])
    .map(e => ({
      t: new Date((e && (e.last_changed || e.last_updated)) || 0).getTime(),
      s: e && e.state,
    }))
    .filter(e => isFinite(e.t) && e.t > 0)
    .sort((a, b) => a.t - b.t);
  const plages = [];
  let ouvert = null;
  for (const e of liste) {
    if (e.t >= fin) break;
    const t = Math.max(debut, e.t);
    if (lisible(e.s) && actif(e.s)) {
      if (ouvert == null) ouvert = t;
    } else if (ouvert != null) {
      if (t > ouvert) plages.push({ debut: ouvert, fin: t });
      ouvert = null;
    }
  }
  if (ouvert != null && fin > ouvert) plages.push({ debut: ouvert, fin });
  return plages;
}

/**
 * Les plages ramenées en pourcentages de la fenêtre : ce que la barre dessine.
 *
 * Une plage très courte garde quand même un filet visible — sinon un créneau
 * de quelques minutes disparaîtrait de la barre alors qu'il a bien eu lieu.
 */
export function barreTarif(plages, debut, fin) {
  const duree = fin - debut;
  if (!(duree > 0)) return [];
  return (plages || [])
    .map(p => ({
      gauche: Math.max(0, Math.min(100, ((p.debut - debut) / duree) * 100)),
      largeur: Math.max(0.4, Math.min(100, ((p.fin - p.debut) / duree) * 100)),
    }))
    .filter(p => p.gauche < 100);
}

/**
 * Le prix du moment, et lequel des deux il est.
 *
 * `hc` et `hp` sont des nombres ou `null`. `enHc` vient du capteur binaire ;
 * `null` quand l'installation n'en a pas — on ne devine pas l'heure creuse à
 * partir de l'horloge, les contrats n'ont pas tous les mêmes créneaux.
 *
 * Sans capteur binaire mais avec UN seul prix, ce prix est le prix : un contrat
 * à tarif unique n'a pas de créneau à connaître.
 */
export function prixDuMoment({ hc = null, hp = null, enHc = null } = {}) {
  const n = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const a = n(hc), b = n(hp);
  if (a == null && b == null) return { valeur: null, enHc: null, unique: false };
  if (a == null || b == null) return { valeur: a != null ? a : b, enHc: null, unique: true };
  if (enHc == null) return { valeur: null, enHc: null, unique: false };
  return { valeur: enHc ? a : b, enHc: !!enHc, unique: false };
}

/**
 * LE PRIX EN COURS QUAND LE CONTRAT EN A PLUS DE DEUX — Tempo et assimilés.
 *
 * Tempo a six tarifs : bleu, blanc, rouge, chacun en heures creuses et en
 * heures pleines. Le code prenait le moins cher pour « creuses » et le plus
 * cher pour « pleines » — juste à deux tarifs, où c'est la définition même du
 * tarif réduit, FAUX à six : il annonçait le bleu creuses ou le rouge pleines,
 * jamais les quatre autres.
 *
 * On ne devine pas la couleur du jour, et on ne lit pas les noms des entités.
 * On observe : parmi les compteurs déclarés, UN SEUL TOURNE — celui du tarif
 * en cours. Les autres sont figés depuis des heures ou des jours. Le plus
 * récemment bougé donne donc le prix du moment, et cela vaut pour n'importe
 * quel contrat à N tarifs, nommé ou non, connu de Loggia ou pas.
 *
 * `connexions` : `[{ prix, instant, lisible }]`, une par connexion déclarée —
 * le prix du kWh, l'instant du dernier mouvement de son compteur (en
 * millisecondes), et si ce compteur se lit. Un compteur muet ne vote pas : son
 * `last_changed` dirait l'instant où il est devenu muet, pas une consommation.
 */
export function prixEnCours(connexions) {
  const vivantes = (connexions || []).filter(c => c && c.lisible
    && typeof c.prix === 'number' && isFinite(c.prix)
    && typeof c.instant === 'number' && isFinite(c.instant));
  if (!vivantes.length) return null;
  let tete = vivantes[0];
  for (const c of vivantes) if (c.instant > tete.instant) tete = c;
  return tete.prix;
}

/**
 * Le prochain changement de tarif, d'après les plages du jour.
 *
 * Rend `{ versHc, instant }`, ou `null` quand rien ne permet de le dire : la
 * dernière plage de la journée ne renseigne pas sur demain, et promettre une
 * heure de bascule qu'on ne connaît pas serait pire que se taire.
 */
export function prochainTarif(plages, maintenant, enHc = null) {
  if (!Array.isArray(plages) || !plages.length || enHc == null) return null;
  if (enHc) {
    const ici = plages.find(p => maintenant >= p.debut && maintenant < p.fin);
    return ici ? { versHc: false, instant: ici.fin } : null;
  }
  const suivante = plages.find(p => p.debut > maintenant);
  return suivante ? { versHc: true, instant: suivante.debut } : null;
}
