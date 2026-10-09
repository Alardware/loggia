/* ── L'agenda du rail : une carte à la place de deux ────────────────────────
 *
 * Étape 5 de la refonte de l'Accueil (ADR 0032). Le rail montrait la bande du
 * mois (une carte) et les prochains événements (une autre). Ici, les règles
 * d'une seule carte : la date, sept jours à partir d'aujourd'hui avec le
 * compte de chacun, et ce qui vient — ou ce qu'un jour choisi contient.
 *
 * Les événements sont ceux de l'API calendriers de Home Assistant :
 *   { summary, start: { dateTime | date }, end: { dateTime | date } }
 * Un rendez-vous a un `dateTime` ; une journée entière, une `date` (sa fin
 * est exclue : « du 17 au 18 » ne touche que le 17). Aucun React ici : tout
 * se teste à la main. */

export const JOURS_AGENDA = 7;

/** La clé d'un jour local : « 2026-8-16 » (mois de 0 à 11, comme la carte
 * calendrier du catalogue). */
export function cleJour(d) {
  return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
}

/** L'inverse de `cleJour` : « 2026-9-17 » → le 17 octobre 2026 à minuit, le mois
 * comptant de 0 comme le veut `Date`. `null` si la clé ne se lit pas. */
export function jourDeCle(k) {
  const p = typeof k === 'string' ? k.split('-') : [];
  if (p.length !== 3) return null;
  const [a, m, j] = p.map(Number);
  if (!Number.isInteger(a) || !Number.isInteger(m) || !Number.isInteger(j)) return null;
  const d = new Date(a, m, j);
  return d.getFullYear() === a && d.getMonth() === m && d.getDate() === j ? d : null;
}

/** Le même jour `n` mois plus loin, ramené au dernier jour du mois quand il n'y
 * existe pas : du 31 mars, un mois en arrière donne le 28 février, et non le
 * 3 mars comme le ferait `setMonth` tout seul. */
export const moisPlus = (d, n) => {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
  x.setDate(Math.min(d.getDate(), new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  return x;
};

/** Le début d'un événement (une journée entière commence à minuit local) ;
 * null quand on ne sait pas le lire. */
export function debutDe(e) {
  const s = e && e.start;
  if (!s) return null;
  const d = new Date(s.dateTime || (s.date ? s.date + 'T00:00:00' : NaN));
  return isNaN(d.getTime()) ? null : d;
}

/** La fin d'un événement ; sans fin lisible, son début (un instant). */
export function finDe(e) {
  const f = e && e.end;
  if (!f) return debutDe(e);
  const d = new Date(f.dateTime || (f.date ? f.date + 'T00:00:00' : NaN));
  return isNaN(d.getTime()) ? debutDe(e) : d;
}

/* Un jour n'a pas toujours vingt-quatre heures (audit du 03/10).
 *
 * Le dimanche du passage à l'heure d'hiver en a vingt-cinq, celui de l'heure
 * d'été vingt-trois. Ajouter `864e5` à un minuit tombait donc, à l'automne, la
 * VEILLE à 23 h : la grille d'octobre 2026 montrait deux fois le 25 et
 * décalait toute la fin du mois d'un jour de semaine ; un rendez-vous le
 * 25 à 23 h 30 n'appartenait à aucun jour. Ces deux fonctions comptent sur le
 * CALENDRIER — `setDate` sait combien d'heures a chaque jour. */

/** Minuit du jour `n` jours après `d` (avant si `n` est négatif). */
export function jourPlus(d, n) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + n);
  return x;
}

/** Combien de jours de calendrier vont de `a` à `b`, heures ignorées :
 * 0 le même jour, 1 le lendemain, -1 la veille. */
export function ecartJours(a, b) {
  return Math.round((jourPlus(b, 0).getTime() - jourPlus(a, 0).getTime()) / 864e5);
}

/** Du jour donné à minuit, sept jours : la plage lue dans les calendriers. */
export function plageSemaine(d, n = JOURS_AGENDA) {
  const debut = jourPlus(d, 0);
  return { debut, fin: jourPlus(debut, n) };
}

/** Les jours de la bande : aujourd'hui puis les suivants, à minuit local. */
export function joursAgenda(d, n = JOURS_AGENDA) {
  const j0 = new Date(d);
  j0.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => { const j = new Date(j0); j.setDate(j0.getDate() + i); return j; });
}

/** Un événement touche-t-il un jour ? Un rendez-vous : son jour de début ;
 * une journée entière (ou plusieurs) : chaque jour du début (inclus) à la
 * fin (exclue). */
export function toucheJour(e, jour) {
  const d = debutDe(e);
  if (!d) return false;
  const j0 = jourPlus(jour, 0);
  const j1 = jourPlus(jour, 1);
  if (e.start && e.start.dateTime) return d >= j0 && d < j1;
  const f = finDe(e);
  return d < j1 && f > j0;
}

/** Un événement TRAVERSE-t-il un jour ? Question différente de `toucheJour`,
 * et les deux sont justes :
 *
 *   — « à quel jour appartient ce rendez-vous ? » Celui de son DÉBUT. Un dîner
 *     de 23 h 30 à 1 h du matin se range au premier jour, et la carte du rail
 *     ne l'annonce pas deux fois. C'est `toucheJour`.
 *   — « quelle part de ce rendez-vous se dessine dans CETTE colonne ? » Une
 *     grille d'heures montre du temps : un poste de nuit de 21 h 30 à 5 h 39
 *     occupe la fin d'un jour ET le début du suivant.
 *
 * Signalé le 08/10 : un poste de nuit se réduisait à un rectangle de 30 px.
 * `toucheJour` ne le rendait qu'au jour de début, et sa fin, ramenée au même
 * jour, tombait AVANT son début. */
export function traverseJour(e, jour) {
  const d = debutDe(e);
  if (!d) return false;
  const j0 = jourPlus(jour, 0);
  const j1 = jourPlus(jour, 1);
  const f = finDe(e);
  // Un instant sans durée touche quand même son jour.
  return d < j1 && (f > j0 || (d >= j0 && d < j1));
}

/** Ce qu'un événement occupe DANS un jour : ses bornes ramenées à cette
 * journée, en heures décimales depuis minuit. Un événement commencé la veille
 * part de 0, un qui finit le lendemain va jusqu'à 24. */
export function bornesDuJour(e, jour) {
  const d = debutDe(e);
  if (!d) return null;
  const j0 = jourPlus(jour, 0);
  const j1 = jourPlus(jour, 1);
  const f = finDe(e);
  const deb = d < j0 ? j0 : d;
  const fin = (f && f > j1) ? j1 : f;
  const h = (x) => (x - j0) / 3600000;
  return { debut: Math.max(0, h(deb)), fin: Math.min(24, fin ? h(fin) : h(deb)) };
}

/** Combien d'événements par jour de la bande : { clé → n }. */
export function comptesParJour(events, jours) {
  const out = {};
  (jours || []).forEach(j => { out[cleJour(j)] = (events || []).filter(e => toucheJour(e, j)).length; });
  return out;
}

/* Un début illisible se range en DERNIER, il ne lève plus (audit du 03/10).
 *
 * `debutDe` rend `null` sur un `start` qu'il ne sait pas lire, et l'ancien
 * comparateur appelait `.getTime()` dessus : un TypeError au milieu d'un tri,
 * levé au rendu de l'agenda — et, faute d'autre barrière, l'écran entier
 * remplacé par la page de secours. `evenementsDuJour` filtrait avant de trier :
 * par chance, pas par construction. `lireCalendriers` évitait carrément le
 * comparateur et rangeait ces entrées au hasard (`NaN` en guise d'ordre).
 * Un seul comparateur pour les deux : ce qui se date d'abord, dans l'ordre ; le
 * reste ensuite, dans son ordre d'arrivée (le tri est stable). */
export function parDebut(x, y) {
  const a = debutDe(x), b = debutDe(y);
  if (a && b) return a.getTime() - b.getTime();
  return (a ? 0 : 1) - (b ? 0 : 1);
}

/** Les événements d'un jour, dans l'ordre. */
export function evenementsDuJour(events, jour) {
  return (events || []).filter(e => toucheJour(e, jour)).sort(parDebut);
}

/* ── Une panne n'est pas un agenda vide (audit du 03/10) ─────────────────────
 *
 * Un redémarrage de Home Assistant, une coupure du Wi-Fi au mauvais moment :
 * chaque GET des calendriers échouait, `useAgenda` posait une liste vide et la
 * tenait jusqu'au sondage suivant — un quart d'heure de « Rien de prévu ce
 * jour-là. », sept zéros dans la bande, et le bandeau de la collecte parti
 * avec. Un calendrier qui RÉPOND vide est vide ; un calendrier qui ne répond
 * pas n'a rien dit. Les deux ne se confondent plus. */

/** Lit chaque calendrier de `ids` sur [debut, fin) par `api` (le `callApi` de
 * Home Assistant). Rend les événements de tous, marqués de leur calendrier
 * sous `_cal` et rangés par début — ou `null` quand AUCUN n'a répondu. Un
 * calendrier qui refuse ne prive pas les autres. */
export async function lireCalendriers(api, ids, debut, fin) {
  const q = '?start=' + encodeURIComponent(debut.toISOString()) + '&end=' + encodeURIComponent(fin.toISOString());
  const tous = [];
  let repondu = 0;
  for (const id of ids || []) {
    try {
      const evs = await api('GET', 'calendars/' + id + q);
      repondu++;
      if (Array.isArray(evs)) evs.forEach(e => { if (e && e.summary && e.start) tous.push({ ...e, _cal: id }); });
    } catch {} // un calendrier qui refuse ne prive pas les autres
  }
  if (!repondu) return null;
  // Un `start` illisible se range en dernier (`parDebut`), et non plus au hasard.
  return tous.sort(parDebut);
}

/** Ce que l'agenda garde quand aucun calendrier n'a répondu : les événements
 * déjà montrés, des calendriers encore lus, qui touchent encore [debut, fin).
 * Un rendez-vous passé pendant la panne s'en va, un agenda décoché aussi, et
 * le mois qu'on quitte ne déborde pas sur celui qu'on ouvre. */
export function garderDansFenetre(events, ids, debut, fin) {
  const cals = new Set(ids || []);
  return (events || []).filter(e => {
    const d = debutDe(e);
    if (!d || !cals.has(e._cal)) return false;
    // Comme Home Assistant : ce qui chevauche la fenêtre, un instant compris.
    return d < fin && (finDe(e) > debut || d >= debut);
  });
}
