/* ── Une OUVERTURE : sa tuile et sa popup, ce qui se calcule (ADR 0388 ; ses maquettes du 22/11) ─────────────
 *
 * Trois maquettes — « Ouvertures — tuiles », « Ouverture — popup (ouverte, alerte) », « Ouverture — popup (fermée) » — remplacent
 * la carte d'un capteur d'ouverture (porte, fenêtre, garage, ouvrant sans nom) et sa fiche. Ce module ne dessine rien : il dit ce
 * que la tuile et la popup écrivent, à partir des états lus.
 *
 * - LA TUILE : « Ouverte depuis 4 min » et « ouverte à 17:21 » ; « Fermée » et « depuis 09:12 » ; une pile faible remplace l'heure
 *   d'une fermée (« Pile faible : à changer ») ; muette, « Indisponible » et « plus de signal depuis 16:55 ». L'heure vient de
 *   l'historique du jour (`depuisQuand`, journeelue.js), jamais de `last_changed` seul : il vaut l'heure du redémarrage de Home
 *   Assistant (ADR 0031). Sans changement aujourd'hui, l'heure se tait : « Aucune ouverture aujourd'hui », ou, ouverte depuis la
 *   veille, « Ouverte depuis plus de 9 h 12 » — ce qu'on sait, depuis minuit.
 * - LA POPUP : la journée (les ouvertures, le temps ouvert, la dernière, la bande de 0 à 24 h, la liste), les sept derniers jours,
 *   l'alerte quand le délai choisi est passé, et le réglage du rappel (`loggia_ouvertures`, lu par `ouvertures.py`).
 *
 * Le genre suit LA table des binaires (`BIN_ETATS()`, briques.jsx) : une porte, une fenêtre, un garage sont « ouverte(s) » ; un ouvrant
 * sans nom (`opening`) est « ouvert ». Sans JSX : la tuile et la popup, chargées à la demande, le lisent toutes deux.
 */
import { tr, trN, locale } from './i18n.js';
import { dureeMinutes, heureCourte } from './format.js';
import { depuisQuand, minuitDe } from './journeelue.js';

/** La clé du réglage, une table `{ entité: { delai, nuit } }`, écrite par la popup et lue par le serveur (`ouvertures.py`). */
export const CLE_OUVERTURES = 'loggia_ouvertures';
/** Les délais proposés, en minutes : « Jamais », 5, 10, 30 (sa maquette). */
export const DELAIS_OUVERTURE = [0, 5, 10, 30];
/** Le rappel, une fois le délai passé : toutes les 15 minutes (sa maquette ; `ouvertures.py`, `REPRISE_MIN`). */
export const REPRISE_OUVERTURE = 15;
/** La nuit de « Prévenir dès l'ouverture la nuit » : de 22:00 à 07:00 (sa maquette ; `ouvertures.py`, `NUIT`). */
export const NUIT_OUVERTURE = { debut: 22, fin: 7 };

const MINUTE = 60000;
const JOUR = 86400000;

/** Le réglage d'une ouverture, borné : un délai de la liste (0 sinon), et la nuit vraie ou fausse. Rien de choisi : rien ne part. */
export function reglageOuverture(table, id) {
  const r = table && typeof table === 'object' && !Array.isArray(table) ? table[id] : null;
  const d = r ? Number(r.delai) : 0;
  return { delai: DELAIS_OUVERTURE.indexOf(d) >= 0 ? d : 0, nuit: !!(r && r.nuit === true) };
}

/** La table après un geste : le réglage de `id` complété par `patch`, les autres gardés ; un réglage revenu à rien s'efface. */
export function poserReglage(table, id, patch) {
  const base = table && typeof table === 'object' && !Array.isArray(table) ? { ...table } : {};
  const propre = reglageOuverture({ [id]: { ...reglageOuverture(base, id), ...(patch || {}) } }, id);
  if (!propre.delai && !propre.nuit) delete base[id];
  else base[id] = propre;
  return base;
}

/** Le dessin d'une ouverture : la porte pour une porte et un garage, les deux vantaux pour une fenêtre et un ouvrant sans nom. */
export const dessinOuverture = (classe) => (classe === 'door' || classe === 'garage_door' ? 'porte' : 'fenetre');
/** Un ouvrant sans nom (`opening`) est « ouvert » ; une porte, une fenêtre, un garage, « ouverte » (`BIN_ETATS()`). */
export const auMasculin = (classe) => classe === 'opening';
/** Les mots, au genre de l'ouverture : `genre(classe)('Ouverte', 'Ouvert')`. */
const genre = (classe) => (fem, masc) => (auMasculin(classe) ? masc : fem);
const muet = (st) => !st || st.state === 'unavailable' || st.state === 'unknown';

/** Une durée vive, à la seconde : « 45 s », « 12 min 03 s » ; au-delà d'une heure, à la minute (« 1 h 05 »). */
export function dureeVive(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  if (s < 60) return tr('{n} s', { n: s });
  if (s < 3600) return tr('{m} min {s} s', { m: Math.floor(s / 60), s: String(s % 60).padStart(2, '0') });
  return dureeMinutes(Math.floor(s / 60));
}

/** Les états lus, plus l'état VIVANT s'il a changé depuis la lecture : l'enregistreur écrit à intervalles, et la porte qu'on vient
 *  d'ouvrir n'est pas encore dans l'historique — c'est alors `last_changed` qui la date (la règle de `depuisQuand`). */
export function etatsVivants(etats, st, debut) {
  const l = Array.isArray(etats) ? etats.slice() : [];
  if (!st || st.state == null) return l;
  const s = String(st.state);
  if (l.length && l[l.length - 1].s === s) return l;
  const t = Date.parse(st.last_changed);
  if (Number.isFinite(t) && t > (l.length ? l[l.length - 1].t : debut)) l.push({ t, s });
  return l;
}

/** Sans les points muets : un capteur qui se tait puis revient « ouvert » n'a pas été rouvert — le serveur ne le compte pas
 *  non plus (`ouvertures.py`). L'épisode continue à travers le silence, jusqu'à la vraie fermeture. */
const parlants = (etats) => (etats || []).filter(p => p.s !== 'unavailable' && p.s !== 'unknown');

/** Les ouvertures entre `debut` et `fin` : `[{ a, b, enCours }]`, chacune bornée à la fenêtre ; la dernière, encore ouverte, est
 *  « en cours ». */
export function episodes(brut, debut, fin) {
  const out = [];
  const etats = parlants(brut);
  etats.forEach((p, i) => {
    if (p.s !== 'on' || (i > 0 && etats[i - 1].s === 'on')) return;
    let j = i + 1;
    while (j < etats.length && etats[j].s === 'on') j += 1;
    const finEpisode = j < etats.length ? etats[j].t : null;
    const a = Math.max(debut, p.t), b = Math.min(fin, finEpisode == null ? fin : finEpisode);
    if (b >= a && a < fin) out.push({ a, b, enCours: finEpisode == null });
  });
  return out;
}

/** La journée d'une ouverture, de minuit à maintenant : les épisodes, combien, le temps ouvert, l'heure de la dernière ouverture
 *  (celle où elle a COMMENCÉ ; ouverte dès minuit, son heure se tait), la fin de la dernière, maintenant et les bandes (en %). */
export function journeeOuverture(etats, debut, maintenant) {
  const ep = episodes(etats, debut, maintenant);
  const derniere = ep.length ? ep[ep.length - 1] : null;
  // La vraie longueur du jour : 23 ou 25 heures aux changements d'heure.
  const lendemain = new Date(debut);
  lendemain.setDate(lendemain.getDate() + 1);
  const jour = Math.max(1, lendemain.getTime() - debut) || JOUR;
  return {
    episodes: ep, fois: ep.length, total: ep.reduce((s, e) => s + (e.b - e.a), 0),
    derniere: derniere && derniere.a > debut ? derniere.a : null,
    finDerniere: derniere && !derniere.enCours ? derniere.b : null,
    maintenant: Math.max(0, Math.min(100, (maintenant - debut) / jour * 100)),
    bandes: ep.map(e => ({ l: (e.a - debut) / jour * 100, w: (e.b - e.a) / jour * 100 })),
  };
}

/** Les sept derniers jours, du plus ancien à aujourd'hui : `[{ n, debut }]` — combien de fois elle s'est ouverte chaque jour. Le
 *  premier point d'une lecture est l'état au DÉBUT de la lecture, pas une ouverture : ouverte depuis la veille, elle ne compte pas. */
export function semaineOuverture(brut, maintenant, jours = 7) {
  const etats = parlants(brut);
  const out = [];
  const aujourdhui = minuitDe(maintenant);
  for (let k = jours - 1; k >= 0; k -= 1) {
    const d = new Date(aujourdhui);
    d.setDate(d.getDate() - k);
    const f = new Date(d.getTime());
    f.setDate(f.getDate() + 1);
    out.push({ debut: d.getTime(), fin: f.getTime(), n: 0 });
  }
  etats.forEach((p, i) => {
    if (p.s !== 'on' || (i > 0 && etats[i - 1].s === 'on') || p.t <= out[0].debut) return;
    const jour = out.find(j => p.t >= j.debut && p.t < j.fin);
    if (jour) jour.n += 1;
  });
  return out.map(j => ({ n: j.n, debut: j.debut }));
}

/** La lettre d'un jour, dans la langue de l'écran (« L », « M », « D ») : celle du calendrier, jamais une table à nous. */
export const lettreJour = (t) => new Date(t).toLocaleDateString(locale(), { weekday: 'narrow' });

/**
 * Ce que dit la TUILE d'une ouverture. `st` : son état ; `etats` : sa journée lue (`useJournee`) — null tant qu'elle ne l'est pas ;
 * `debut` : minuit ; `faible` : la pile est sous le seuil de la veille ; `maintenant` : ms.
 * Rend `{ ton, etat, sous, ouvert, muet }` — `ton` : 'ouvert' (l'ambre), 'muet' (la panne), null au calme.
 */
export function vueTuileOuverture({ st, etats, debut, faible = false, maintenant = Date.now() }) {
  const g = genre(((st && st.attributes) || {}).device_class);
  if (muet(st)) {
    const t = st ? Date.parse(st.last_changed) : NaN;
    return { ton: 'muet', muet: true, ouvert: false, etat: tr('Indisponible'), sous: Number.isFinite(t) ? tr('plus de signal depuis {h}', { h: heureCourte(t) }) : null };
  }
  const ouvert = String(st.state) === 'on';
  const depuis = etats ? depuisQuand(etats, debut, st) : null;
  if (ouvert) {
    if (depuis != null) {
      return { ton: 'ouvert', ouvert, muet: false, etat: tr(g('Ouverte depuis {d}', 'Ouvert depuis {d}'), { d: dureeMinutes(Math.floor((maintenant - depuis) / MINUTE)) }),
        sous: tr(g('ouverte à {h}', 'ouvert à {h}'), { h: heureCourte(depuis) }) };
    }
    // Lue, et ouverte dès minuit : elle l'est depuis PLUS que la journée — ce qu'on sait. Pas encore lue : le mot seul.
    if (etats && etats.length) {
      return { ton: 'ouvert', ouvert, muet: false, etat: tr(g('Ouverte depuis plus de {d}', 'Ouvert depuis plus de {d}'), { d: dureeMinutes(Math.floor((maintenant - debut) / MINUTE)) }),
        sous: tr(g('ouverte avant minuit', 'ouvert avant minuit')) };
    }
    return { ton: 'ouvert', ouvert, muet: false, etat: tr(g('Ouverte', 'Ouvert')), sous: null };
  }
  const etat = tr(g('Fermée', 'Fermé'));
  if (faible) return { ton: null, ouvert, muet: false, etat, sous: tr('Pile faible : à changer') };
  if (depuis != null) return { ton: null, ouvert, muet: false, etat, sous: tr('depuis {h}', { h: heureCourte(depuis) }) };
  // Sans changement aujourd'hui : les mots de la bande du jour, assez courts pour la carte étroite du téléphone.
  return { ton: null, ouvert, muet: false, etat, sous: etats && etats.length ? tr(g('fermée toute la journée', 'fermé toute la journée')) : null };
}

/**
 * Ce que dit le HAUT de la popup : l'état en grand, « depuis 12 min 03 s » à la seconde quand elle est ouverte, « Ouverte à 17:09 » ;
 * fermée, « depuis 09:12 » et « Fermée depuis 2 h 20 », ou « toute la journée » et « Aucune ouverture aujourd'hui ».
 * `jour` : `journeeOuverture`, ou null tant que rien n'est lu ; `depuis` : l'instant du dernier vrai changement, ou null.
 */
export function vueHautOuverture({ st, jour, depuis, debut, maintenant = Date.now() }) {
  const g = genre(((st && st.attributes) || {}).device_class);
  if (muet(st)) return { ouvert: false, muet: true, etat: tr('Indisponible'), depuis: null, sous: null };
  if (String(st.state) === 'on') {
    if (depuis != null) return { ouvert: true, muet: false, etat: tr(g('Ouverte', 'Ouvert')), depuis: tr('depuis {d}', { d: dureeVive(maintenant - depuis) }), sous: tr(g('Ouverte à {h}', 'Ouvert à {h}'), { h: heureCourte(depuis) }) };
    return { ouvert: true, muet: false, etat: tr(g('Ouverte', 'Ouvert')), depuis: jour ? tr('depuis plus de {d}', { d: dureeMinutes(Math.floor((maintenant - debut) / MINUTE)) }) : null, sous: jour ? tr(g('Ouverte avant minuit', 'Ouvert avant minuit')) : null };
  }
  const etat = tr(g('Fermée', 'Fermé'));
  const fin = jour && jour.finDerniere != null ? jour.finDerniere : depuis;
  if (fin != null) return { ouvert: false, muet: false, etat, depuis: tr('depuis {h}', { h: heureCourte(fin) }), sous: tr(g('Fermée depuis {d}', 'Fermé depuis {d}'), { d: dureeMinutes(Math.floor((maintenant - fin) / MINUTE)) }) };
  return { ouvert: false, muet: false, etat, depuis: jour ? tr('toute la journée') : null, sous: jour ? tr('Aucune ouverture aujourd’hui') : null };
}

/** L'alerte de la popup : ouverte depuis plus que le délai choisi (« Jamais » : jamais). Rend le texte, ou null. */
export function alerteOuverture({ st, depuis, delai, maintenant = Date.now() }) {
  if (muet(st) || String(st.state) !== 'on' || !delai || depuis == null) return null;
  if (maintenant - depuis < delai * MINUTE) return null;
  const g = genre(((st && st.attributes) || {}).device_class);
  return tr(g('Ouverte depuis plus de {n} min. Pensez à la fermer.', 'Ouvert depuis plus de {n} min. Pensez à le fermer.'), { n: delai });
}

/** Les mots qui suivent le genre, pour la popup : la légende de la bande, le titre du rappel. */
export function motsOuverture(classe) {
  const g = genre(classe);
  return {
    ouverte: tr(g('ouverte', 'ouvert')), fermee: tr(g('fermée', 'fermé')),
    prevenir: tr(g('Me prévenir si elle reste ouverte', 'Me prévenir s’il reste ouvert')),
  };
}

/** Une ligne de la liste du jour : « 12:25 → 12:40 » et « 15 min » ; en cours, « 17:09 → maintenant » et « en cours ». */
export function ligneEpisode(e) {
  return {
    plage: heureCourte(e.a) + ' → ' + (e.enCours ? tr('maintenant') : heureCourte(e.b)),
    duree: e.enCours ? tr('en cours') : dureeMinutes(Math.max(0, Math.round((e.b - e.a) / MINUTE))),
    enCours: e.enCours,
  };
}

/** Le total de la semaine : « 46 ouvertures ». */
export const totalSemaine = (jours) => { const n = jours.reduce((s, j) => s + j.n, 0); return trN(n, '{n} ouverture', '{n} ouvertures'); };
