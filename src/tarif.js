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

/* ── Le prix de chaque heure (chantier Prises, P7) ────────────────────────────
 *
 * « Les euros se comptent heure par heure » (son choix du 13/10) : les kWh
 * d'une heure se paient au prix du tarif qui TOURNAIT cette heure-là — celui
 * dont le compteur a avancé : la règle de l'ADR 0173, heure par heure.
 *
 * `connexions` : `[{ prix, heures }]` — le prix du kWh d'un tarif, et ce que
 * son compteur a compté à chaque heure (`{ [début de l'heure, en ms]: kWh }`,
 * les statistiques horaires de Home Assistant).
 *  - aucun prix : `null` — on n'affiche pas d'euros ;
 *  - un seul prix (ou des prix égaux) : ce prix, à toute heure ;
 *  - plusieurs : à chaque heure, celui des compteurs qui ont avancé, au
 *    prorata de ce qu'ils ont compté ; une heure où aucun n'a bougé garde le
 *    prix de la précédente — avant la première, celui de la suivante. Aucun
 *    compteur n'a bougé de toute la période : `null`, on ne devine pas.
 * Rend `prix(debutDeLHeure)`, ou `null`. */
export function prixParHeure(connexions) {
  const tarifs = (Array.isArray(connexions) ? connexions : []).filter(c => c && typeof c.prix === 'number' && isFinite(c.prix));
  if (!tarifs.length) return null;
  if (new Set(tarifs.map(c => c.prix)).size === 1) return () => tarifs[0].prix;
  const parHeure = new Map();
  for (const c of tarifs) {
    for (const [h, k] of Object.entries(c.heures || {})) {
      const kwh = Number(k);
      if (!(kwh > 0)) continue;
      const e = parHeure.get(Number(h)) || { kwh: 0, euros: 0 };
      e.kwh += kwh;
      e.euros += kwh * c.prix;
      parHeure.set(Number(h), e);
    }
  }
  const connues = [...parHeure].sort((a, b) => a[0] - b[0]).map(([h, e]) => [h, e.euros / e.kwh]);
  if (!connues.length) return null;
  return (debut) => {
    let p = connues[0][1];
    for (const [h, q] of connues) { if (h > debut) break; p = q; }
    return p;
  };
}

/** Ce que coûtent des kWh comptés heure par heure (`[{ debut, kwh }]`), au prix de chaque heure ; `null` sans prix. */
export function coutHoraire(kwhParHeure, connexions) {
  const prix = prixParHeure(connexions);
  if (!prix) return null;
  return (Array.isArray(kwhParHeure) ? kwhParHeure : []).reduce((s, x) => (x && Number(x.kwh) > 0 ? s + Number(x.kwh) * prix(Number(x.debut)) : s), 0);
}

/* ── Le prix qui VARIE, et sa prévision (chantier G3, D4 et E5 ; ADR 0302) ────
 *
 * Un prix spot ou horaire (une bourse de l'électricité, un fournisseur à tarif
 * dynamique) n'est pas un « tarif unique » : c'est le prix du moment. Quand
 * l'entité qui le publie porte aussi sa PRÉVISION en attribut, la carte dit où
 * se trouve le creux.
 *
 * La prévision se reconnaît à sa FORME, jamais au nom de l'intégration : une
 * liste d'objets qui portent chacun un INSTANT (une date avec l'heure) et un
 * NOMBRE. Le début est le plus tôt des instants de l'objet, la fin le plus tard
 * — sinon le début du suivant. Le prix est le nombre dont le nom dit un prix
 * (`per_kwh`, `price`, `value`, `total`…) — ou le seul nombre de l'objet. Les
 * listes de plusieurs attributs (aujourd'hui, demain) se fondent en une.
 *
 * Ce que ces règles ne lisent pas : les intégrations qui ne publient leur
 * prévision que par une ACTION à elles (Nord Pool officielle, Tibber). Leur
 * prix reste « du moment », sans fenêtre.
 */
const INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const CLES_PRIX = ['per_kwh', 'price', 'value', 'total'];
const NOM_PRIX = /price|prix|preis|prezzo|precio|cena|prijs|per_kwh|tarif|cost/i;

/** Un instant lu dans une valeur d'attribut (millisecondes), ou null : une date SANS heure n'en est pas un. */
function instantDe(v) {
  if (typeof v !== 'string' || !INSTANT.test(v)) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** Le nom du champ prix d'un objet de prévision, ou null. */
function champPrix(o) {
  const nombres = Object.keys(o).filter(k => typeof o[k] === 'number' && Number.isFinite(o[k]));
  for (const k of CLES_PRIX) if (nombres.indexOf(k) >= 0) return k;
  const nommes = nombres.filter(k => NOM_PRIX.test(k) && !/spot/i.test(k)).sort();
  if (nommes.length) return nommes[0];
  return nombres.length === 1 ? nombres[0] : null;
}

/** Un point de prévision `{ debut, fin, prix }` (fin `null` si l'objet ne la dit pas), ou null. */
function pointDe(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const instants = Object.keys(o).map(k => instantDe(o[k])).filter(t => t != null);
  const cle = champPrix(o);
  if (!instants.length || !cle) return null;
  const debut = Math.min(...instants), fin = Math.max(...instants);
  return { debut, fin: fin > debut ? fin : null, prix: o[cle] };
}

/**
 * La prévision d'un prix, lue dans les attributs de son entité :
 * `[{ debut, fin, prix }]`, triée, sans doublon. Vide quand rien n'a la forme
 * d'une prévision.
 */
export function lirePrevision(attributs) {
  if (!attributs || typeof attributs !== 'object') return [];
  const parDebut = new Map();
  for (const v of Object.values(attributs)) {
    if (!Array.isArray(v) || v.length < 2) continue;
    const pts = v.map(pointDe);
    if (pts.some(p => p == null)) continue;           // une liste où un objet n'a pas la forme n'en est pas une
    for (const p of pts) if (!parDebut.has(p.debut)) parDebut.set(p.debut, p);
  }
  const liste = [...parDebut.values()].sort((a, b) => a.debut - b.debut);
  // La fin manquante : le début du suivant ; pour le dernier, la durée de son voisin.
  return liste.map((p, i) => {
    if (p.fin != null) return p;
    const suivant = liste[i + 1];
    const precedent = liste[i - 1];
    const pas = suivant ? suivant.debut - p.debut : (precedent ? p.debut - (precedent.debut) : null);
    return pas > 0 ? { ...p, fin: p.debut + pas } : null;
  }).filter(Boolean);
}

/** Le prix varie-t-il ? Sa prévision en a plusieurs, ou sa journée en a connu plusieurs (`[{ state }]`, l'historique). */
export function prixVarie(points, historique) {
  if (new Set((points || []).map(p => p && p.prix).filter(v => typeof v === 'number' && Number.isFinite(v))).size > 1) return true;
  const vus = new Set((Array.isArray(historique) ? historique : [])
    .map(e => parseFloat(e && e.state)).filter(Number.isFinite));
  return vus.size > 1;
}

/**
 * La fenêtre CONTINUE la moins chère à venir, d'au moins `dureeMin` minutes
 * (deux heures par défaut) : `{ debut, fin, prix }` — le prix moyen, pondéré
 * par la durée de chaque tranche —, ou null.
 *
 * L'heure en cours compte (on peut encore s'en servir) ; ce qui est passé, non.
 * Un trou dans la prévision coupe la continuité. À égalité, la plus tôt. Des
 * prix tous égaux ne désignent rien : il n'y a pas de creux.
 */
export function fenetreMoinsChere(points, maintenant, dureeMin = 120) {
  const pts = (Array.isArray(points) ? points : [])
    .filter(p => p && Number.isFinite(p.debut) && Number.isFinite(p.fin) && p.fin > p.debut && typeof p.prix === 'number' && Number.isFinite(p.prix) && p.fin > maintenant)
    .sort((a, b) => a.debut - b.debut);
  if (pts.length < 2 || new Set(pts.map(p => p.prix)).size < 2) return null;
  const voulu = dureeMin * 60e3;
  const JEU = 60e3;
  let meilleur = null;
  for (let i = 0; i < pts.length; i++) {
    let duree = 0, somme = 0, fin = pts[i].debut;
    let j = i;
    for (; j < pts.length && duree < voulu; j++) {
      if (j > i && Math.abs(pts[j].debut - fin) > JEU) break;
      const d = pts[j].fin - pts[j].debut;
      duree += d; somme += pts[j].prix * d; fin = pts[j].fin;
    }
    if (duree < voulu) continue;
    const moyen = somme / duree;
    if (!meilleur || moyen < meilleur.prix - 1e-12) meilleur = { debut: pts[i].debut, fin, prix: moyen };
  }
  return meilleur;
}
