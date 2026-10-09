/* ── Les statistiques longue durée de Home Assistant ────────────────────────
 *
 * L'historique d'ÉTATS (`history/period`, que lit `useSysHist`) ne garde que
 * quelques jours : assez pour « les dernières 24 heures », rien de plus. Au-delà,
 * Home Assistant tient des STATISTIQUES — une ligne par heure, par jour ou par
 * mois, gardées sans limite de durée pour toute entité qui déclare un
 * `state_class`. La semaine, le mois, l'année et le calendrier ne peuvent venir
 * que de là ; Loggia ne les lisait pas du tout avant le 06/10.
 *
 * Trois choses à savoir sur ces lignes :
 *
 *  - on demande le type `change` : ce que le compteur a AVANCÉ pendant
 *    l'intervalle. `sum` est son cumul depuis toujours et `state` sa valeur
 *    brute — ni l'un ni l'autre ne s'additionne d'une case à la suivante.
 *  - les bornes sont LOCALES. Un jour commence à minuit chez l'habitant, pas à
 *    minuit UTC : `new Date(a, m, j)` s'en charge, `Date.UTC` non. Le mois de
 *    mars, où une journée ne fait que 23 heures, se découpe quand même en jours
 *    justes parce qu'on avance de case en case par le calendrier.
 *  - une case SANS ligne rend `null`, pas `0`. « Pas encore de données » et
 *    « mesuré à zéro » ne se dessinent pas pareil, et une barre à zéro sur un
 *    mois à venir serait un mensonge (ADR 0030).
 *
 * Tout ce qui précède `useStats` est sans React et sans réseau : ça se teste à
 * sec, et c'est ce que fait `tests/stats_periodes.test.mjs`.
 */
import { useState, useEffect, useRef } from 'react';
import { locale } from './i18n.js';
import { GARDE_SERIE } from './releve.js';
import { cleJour } from './agenda.js';

/**
 * Les périodes et le pas de statistique que chacune demande.
 *
 * `calendrier` n'est pas une période qu'on feuillette : c'est l'année glissante
 * du damier, du premier du mois il y a onze mois à la fin du mois en cours.
 */
export const PAS_STAT = { jour: 'hour', semaine: 'day', mois: 'day', annee: 'month', calendrier: 'day' };

/** De combien de pas en arrière peut-on remonter ? Deux ans de recul suffisent :
 *  au-delà, les statistiques de la plupart des installations sont vides. */
export const RECUL_MAX = { jour: 729, semaine: 103, mois: 23, annee: 1, calendrier: 0 };

/* Le lundi comme premier jour de semaine. `getDay()` rend 0 pour dimanche :
 * en France comme dans la plupart des pays où Loggia parle, la semaine
 * commence le lundi. */
const lundiDe = (d) => {
  const j = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dec = (j.getDay() + 6) % 7;
  j.setDate(j.getDate() - dec);
  return j;
};

/**
 * Les bornes d'une période, en heure LOCALE.
 *
 * `decalage` compte les périodes en arrière : 0 la période en cours, 1 la
 * précédente. `fin` est exclusive — c'est ce qu'attend Home Assistant.
 */
export function bornesStat(periode, decalage = 0, maintenant = Date.now()) {
  const m = new Date(maintenant);
  const d = Math.max(0, Math.round(decalage) || 0);
  if (periode === 'semaine') {
    const debut = lundiDe(m);
    debut.setDate(debut.getDate() - 7 * d);
    const fin = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + 7);
    return { debut, fin, pas: 'day', n: 7 };
  }
  if (periode === 'mois') {
    const debut = new Date(m.getFullYear(), m.getMonth() - d, 1);
    const fin = new Date(debut.getFullYear(), debut.getMonth() + 1, 1);
    const n = Math.round((fin - debut) / 864e5);
    return { debut, fin, pas: 'day', n };
  }
  if (periode === 'annee') {
    const debut = new Date(m.getFullYear() - d, 0, 1);
    const fin = new Date(debut.getFullYear() + 1, 0, 1);
    return { debut, fin, pas: 'month', n: 12 };
  }
  if (periode === 'calendrier') {
    /* Douze mois GLISSANTS, bornés au mois : le damier a une ligne par mois,
     * et la dernière est celle en cours. Le nombre de jours s'obtient par
     * différence de dates, arrondi — l'année contient un ou deux changements
     * d'heure, soit une heure de plus ou de moins qu'un compte exact. */
    const debut = new Date(m.getFullYear(), m.getMonth() - 11, 1);
    const fin = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    return { debut, fin, pas: 'day', n: Math.round((fin - debut) / 864e5) };
  }
  const debut = new Date(m.getFullYear(), m.getMonth(), m.getDate() - d);
  const fin = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + 1);
  return { debut, fin, pas: 'hour', n: 24 };
}

/* L'instant d'une ligne de statistique. Home Assistant rend un nombre de
 * millisecondes depuis les versions récentes, une chaîne ISO avant : les deux
 * se lisent, un reste illisible s'écarte. */
export function instantStat(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') { const t = Date.parse(v); return isNaN(t) ? null : t; }
  return null;
}

/**
 * Les cases d'une période : une par barre à dessiner, avec son libellé court
 * (sous l'axe) et son titre long (dans l'infobulle).
 *
 * On avance de case en case par le CALENDRIER, jamais en ajoutant 24 heures :
 * c'est ce qui fait tomber juste le dimanche du changement d'heure.
 */
export function casesStat(periode, bornes, lang = null) {
  const l = lang || locale();
  const b = bornes || bornesStat(periode);
  const cases = [];
  const jourCourt = (d) => d.toLocaleDateString(l, { weekday: 'short', day: 'numeric' }).replace('.', '');
  const jourLong = (d) => d.toLocaleDateString(l, { weekday: 'long', day: 'numeric', month: 'long' });
  for (let i = 0; i < b.n; i++) {
    let debut, fin, label, titre;
    if (b.pas === 'hour') {
      debut = new Date(b.debut.getFullYear(), b.debut.getMonth(), b.debut.getDate(), i);
      fin = new Date(b.debut.getFullYear(), b.debut.getMonth(), b.debut.getDate(), i + 1);
      label = String(i).padStart(2, '0') + 'h';
      titre = label + ' – ' + String((i + 1) % 24).padStart(2, '0') + 'h';
    } else if (b.pas === 'month') {
      debut = new Date(b.debut.getFullYear(), i, 1);
      fin = new Date(b.debut.getFullYear(), i + 1, 1);
      label = debut.toLocaleDateString(l, { month: 'short' }).replace('.', '');
      titre = debut.toLocaleDateString(l, { month: 'long', year: 'numeric' });
    } else {
      debut = new Date(b.debut.getFullYear(), b.debut.getMonth(), b.debut.getDate() + i);
      fin = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + 1);
      label = (periode === 'mois' || periode === 'calendrier') ? String(debut.getDate()) : jourCourt(debut);
      titre = periode === 'calendrier'
        ? debut.toLocaleDateString(l, { day: 'numeric', month: 'long', year: 'numeric' })
        : jourLong(debut);
    }
    cases.push({ debut: debut.getTime(), fin: fin.getTime(), label, titre });
  }
  return cases;
}

/**
 * Range les lignes d'une entité dans les cases : un tableau de la longueur des
 * cases, `null` là où aucune ligne ne tombe.
 *
 * Plusieurs lignes dans une même case s'ADDITIONNENT — c'est le cas du pas
 * `hour` relu sur une case journalière, ou d'une installation qui garde encore
 * ses lignes de cinq minutes.
 */
export function repartir(lignes, cases, facteur = 1) {
  const out = cases.map(() => null);
  if (!Array.isArray(lignes) || !cases.length) return out;
  for (const ligne of lignes) {
    if (!ligne) continue;
    const t = instantStat(ligne.start);
    const v = typeof ligne.change === 'number' ? ligne.change : parseFloat(ligne.change);
    if (t == null || !isFinite(v)) continue;
    /* Recherche dichotomique : un an de lignes horaires fait 8 760 entrées, et
     * le calendrier en demande douze séries d'un coup. */
    let lo = 0, hi = cases.length - 1, k = -1;
    while (lo <= hi) {
      const mi = (lo + hi) >> 1;
      if (t < cases[mi].debut) hi = mi - 1;
      else if (t >= cases[mi].fin) lo = mi + 1;
      else { k = mi; break; }
    }
    if (k < 0) continue;
    out[k] = (out[k] || 0) + v * facteur;
  }
  return out;
}

/**
 * Ce qu'on écrit au-dessus d'un graphe de période.
 *
 * Rien que des DATES : « Aujourd'hui », « Hier », « Cette semaine » sont des
 * mots, donc de la traduction, donc l'affaire de la vue. Ce module ne sait
 * mettre en forme que ce que le calendrier dit.
 */
export function libellePeriode(periode, recul = 0, maintenant = Date.now(), lang = null) {
  const l = lang || locale();
  const b = bornesStat(periode, recul, maintenant);
  const veille = new Date(b.fin.getTime() - 864e5);
  if (periode === 'annee') return String(b.debut.getFullYear());
  if (periode === 'mois') return b.debut.toLocaleDateString(l, { month: 'long', year: 'numeric' });
  if (periode === 'semaine') {
    /* « 5 – 11 octobre » quand la semaine ne change pas de mois, « 28 sept. –
     * 4 oct. » quand elle l'enjambe : répéter le mois des deux côtés alourdit
     * sans rien dire de plus. */
    const memeMois = b.debut.getMonth() === veille.getMonth();
    const d1 = memeMois
      ? String(b.debut.getDate())
      : b.debut.toLocaleDateString(l, { day: 'numeric', month: 'short' });
    const d2 = veille.toLocaleDateString(l, memeMois ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' });
    return d1 + ' – ' + d2;
  }
  return b.debut.toLocaleDateString(l, { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * Les cases d'une année glissante, rangées en damier : une ligne par mois,
 * trente-et-une colonnes.
 *
 * Les cases qui n'existent pas (le 31 d'un mois de trente jours) sortent avec
 * `hors` — elles restent vides au lieu d'emprunter la couleur d'un voisin. Le
 * jour en cours est marqué pour qu'il porte son liseré.
 */
export function damier(cases, serie, maintenant = Date.now(), lang = null) {
  const l = lang || locale();
  const auj = new Date(maintenant);
  const cleAuj = cleJour(auj);
  const lignes = [];
  const parMois = new Map();
  (cases || []).forEach((c, i) => {
    const d = new Date(c.debut);
    const cle = d.getFullYear() + '-' + d.getMonth();
    if (!parMois.has(cle)) {
      const ligne = {
        label: d.toLocaleDateString(l, { month: 'short', year: '2-digit' }).replace('.', ''),
        jours: Array.from({ length: 31 }, () => ({ valeur: null, titre: '', aujourdhui: false, hors: true, instant: null, aVenir: false })),
      };
      parMois.set(cle, ligne);
      lignes.push(ligne);
    }
    const v = serie && serie[i] != null && isFinite(serie[i]) ? serie[i] : null;
    parMois.get(cle).jours[d.getDate() - 1] = {
      valeur: v,
      titre: c.titre,
      aujourdhui: cleJour(d) === cleAuj,
      hors: false,
      /* L'INSTANT de la case, pour qui veut l'ouvrir : le damier ne porte plus
       * seulement une couleur, il sait de quel jour il parle. Un jour A VENIR
       * du mois en cours existe dans la grille mais n'a rien a montrer : il
       * reste une case morte, comme dans le calendrier du telephone. */
      instant: c.debut,
      aVenir: c.debut > maintenant,
    };
  });
  return lignes;
}

/**
 * L'échelle d'un graphe : un pas rond, et le haut juste au-dessus du plus
 * grand point.
 *
 * Un axe gradué 0 / 0,73 / 1,46 ne se lit pas. On cherche le pas rond le plus
 * proche de « le maximum en quatre lignes » — 1, 2 ou 5 fois une puissance de
 * dix —, puis on monte le plafond au multiple suivant. Un graphe vide garde
 * une échelle debout (0 à 0,5) plutôt que de s'effondrer sur zéro.
 */
export function graduations(max, lignes = 4) {
  const haut0 = Math.max(0.5, isFinite(max) && max > 0 ? max : 0);
  const brut = haut0 / Math.max(1, lignes);
  const p = Math.pow(10, Math.floor(Math.log10(brut || 1)));
  const m = brut / p;
  const pas = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  const haut = Math.ceil(haut0 / pas - 1e-9) * pas;
  const vals = [];
  /* Les valeurs se recalculent par multiplication, pas par additions
   * successives : `0,1 + 0,1 + 0,1` vaut 0,30000000000000004, et l'étiquette
   * de l'axe l'écrivait. */
  for (let i = 0; i * pas <= haut + 1e-9; i++) vals.push(Math.round(i * pas * 1e6) / 1e6);
  return { pas, haut, vals };
}

/**
 * Les SUITES de cases mesurées, chacune par ses indices.
 *
 * Un trou coupe. Sauter les cases vides et relier les deux points de part et
 * d'autre dessinait une diagonale de dix-huit heures entre une mesure de
 * minuit et une de six heures du soir — un relief inventé, sur une
 * installation qui n'a encore que quelques points. Chaque suite fait son
 * propre tracé, et ce qu'on ne sait pas reste blanc (ADR 0030).
 */
export function suitesPleines(valeurs) {
  const out = [];
  let cur = null;
  (Array.isArray(valeurs) ? valeurs : []).forEach((v, i) => {
    if (v == null || !isFinite(v)) { cur = null; return; }
    if (!cur) { cur = []; out.push(cur); }
    cur.push(i);
  });
  return out;
}

/** La somme d'une série, `null` si rien ne s'y lit — jamais 0 par défaut. */
export function sommeStat(serie) {
  if (!Array.isArray(serie)) return null;
  let s = null;
  for (const v of serie) if (v != null && isFinite(v)) s = (s || 0) + v;
  return s;
}

/**
 * Ce qu'on garde d'une lecture ratée.
 *
 * `seriesRelues` (releve.js) ne convient pas ici : elle attend des ÉTATS de
 * Home Assistant (`last_changed`, `state`) et en fait des points de courbe,
 * alors qu'une statistique arrive déjà rangée par case. Le principe reste le
 * même — une série absente mais encore fraîche survit à un hoquet du réseau,
 * plutôt que d'effacer le graphe affiché.
 */
export function statsRelues(avant, lectures, garder = () => true) {
  const m = {};
  for (const r of Array.isArray(lectures) ? lectures : []) {
    if (!r || !r.id) continue;
    if (Array.isArray(r.arr)) m[r.id] = r.arr;
    else if (avant && avant[r.id] && garder(r.id)) m[r.id] = avant[r.id];
  }
  return m;
}

/* La requête, isolée pour qu'un test puisse la lire sans WebSocket. */
export function requeteStat(ids, bornes) {
  return {
    type: 'recorder/statistics_during_period',
    start_time: new Date(bornes.debut).toISOString(),
    end_time: new Date(bornes.fin).toISOString(),
    statistic_ids: ids,
    period: bornes.pas,
    types: ['change'],
  };
}

/**
 * Les statistiques d'une période, pour plusieurs entités à la fois.
 *
 * Rend `{ cases, series, pret }`. Comme les courbes 24 h, une lecture ratée ne
 * vide pas ce qui était affiché : `seriesRelues` garde la précédente une demi-
 * heure (releve.js) — un hoquet du réseau ne doit pas effacer un graphe.
 *
 * `facteurs` ramène chaque série au même repère (kWh, devise) : les
 * statistiques arrivent dans l'unité du capteur, comme l'historique.
 */
export function useStats(hass, ids, periode, decalage = 0, tour = 0, facteurs = null) {
  const [series, setSeries] = useState({});
  const [pret, setPret] = useState(false);
  const lus = useRef({});
  /* Les facteurs passent par une REFERENCE vivante : l'appelant reconstruit
   * l'objet a chaque rendu, et le mettre en dependance de l'effet relancerait
   * la requete sans fin. Les valeurs, elles, ne changent que si l'unite d'un
   * capteur change — ce qui redeclenche de toute facon la lecture. */
  const fact = useRef(facteurs);
  fact.current = facteurs;
  const cle = (ids || []).filter(Boolean).join('|');
  /* `hass.callWS`, comme partout ailleurs dans Loggia : c'est l'API que le
   * panneau de Home Assistant expose, et celle que la demonstration imite.
   * `connection.sendMessagePromise` existe sur une vraie installation mais pas
   * sur le faux `hass` de la demo, et la vue entiere tombait sur son absence. */
  const parle = hass && typeof hass.callWS === 'function' ? 1 : 0;
  const vivantHass = useRef(hass);
  vivantHass.current = hass;
  useEffect(() => {
    let vivant = true;
    const h = vivantHass.current;
    if (!parle || !cle) { setSeries({}); setPret(false); return undefined; }
    const bornes = bornesStat(periode, decalage);
    const liste = cle.split('|');
    const cases = casesStat(periode, bornes);
    setPret(false);
    h.callWS(requeteStat(liste, bornes))
      .then(res => {
        if (!vivant) return;
        const maintenant = Date.now();
        const lectures = liste.map(id => {
          const lignes = (res && res[id]) || null;
          if (Array.isArray(lignes)) lus.current[id] = maintenant;
          const f = fact.current;
          return { id, arr: Array.isArray(lignes) ? repartir(lignes, cases, (f && f[id]) || 1) : null };
        });
        setSeries(avant => statsRelues(avant, lectures, (id) => maintenant - (lus.current[id] || 0) < GARDE_SERIE));
        setPret(true);
      })
      /* Pas de statistiques, pas de `recorder`, ou l'utilisateur n'a pas le
       * droit de les lire : la section ne s'affiche pas, c'est tout. */
      .catch(() => { if (vivant) { setSeries({}); setPret(true); } });
    return () => { vivant = false; };
  }, [parle, cle, periode, decalage, tour]);
  return { cases: casesStat(periode, bornesStat(periode, decalage)), series, pret };
}
