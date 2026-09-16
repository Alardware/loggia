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

/** Du jour donné à minuit, sept jours : la plage lue dans les calendriers. */
export function plageSemaine(d, n = JOURS_AGENDA) {
  const debut = new Date(d);
  debut.setHours(0, 0, 0, 0);
  return { debut, fin: new Date(debut.getTime() + n * 864e5) };
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
  const j0 = new Date(jour);
  j0.setHours(0, 0, 0, 0);
  const j1 = new Date(j0.getTime() + 864e5);
  if (e.start && e.start.dateTime) return d >= j0 && d < j1;
  const f = finDe(e);
  return d < j1 && f > j0;
}

/** Combien d'événements par jour de la bande : { clé → n }. */
export function comptesParJour(events, jours) {
  const out = {};
  (jours || []).forEach(j => { out[cleJour(j)] = (events || []).filter(e => toucheJour(e, j)).length; });
  return out;
}

const parDebut = (x, y) => debutDe(x).getTime() - debutDe(y).getTime();

/** Ce qui vient : les événements pas encore finis, du plus proche au plus
 * lointain — un rendez-vous commencé y est encore, un rendez-vous fini non. */
export function evenementsAVenir(events, maintenant) {
  const now = maintenant instanceof Date ? maintenant.getTime() : Number(maintenant);
  return (events || []).filter(e => { const f = finDe(e); return !!f && f.getTime() > now; }).sort(parDebut);
}

/** Les événements d'un jour, dans l'ordre. */
export function evenementsDuJour(events, jour) {
  return (events || []).filter(e => toucheJour(e, jour)).sort(parDebut);
}
