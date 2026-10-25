/* ── Ce que l'écran lit des prises, une fois pour tout l'écran (chantier Prises, § 6.1, 7) ──
 *
 * Trois lectures, partagées par les cartes, les compactes, l'en-tête d'Objets
 * › Prises et la fiche :
 *  - `loggia/prises/etat` (§ 6.1) : le type retenu, la protection, l'alerte,
 *    le cycle en cours et ceux des sept derniers jours ;
 *  - `loggia/minuteurs/etat` : le minuteur de chaque prise (ligne 3 du § 4) ;
 *  - les MESURES du jour (§ 7, P8) : les moyennes sur 5 minutes de la
 *    puissance de chaque prise montée, et ce que son compteur d'énergie a
 *    compté, de minuit à maintenant — UNE lecture
 *    `recorder/statistics_during_period` pour toutes, groupée quand plusieurs
 *    cartes se montent ensemble, relue toutes les 5 minutes.
 * Chacune vit dans un magasin compté par abonnés, le modèle de voletsetat.js :
 * rien ne part sans abonné ; 60 s pour les cartes, 15 s fiche ouverte
 * (`rapide`) ; un serveur muet garde ce qu'on savait et le dit (`erreur`) ;
 * une réponse plus vieille ne recouvre ni une plus fraîche, ni ce qu'une
 * écriture a posé. voletsetat.js et chauffageetat.js ne changent pas : ils
 * vivent chez lui, en essai. Pas de React hormis les crochets : la mécanique
 * se teste à sec (tests/prisesetat.test.mjs), source et horloge doublées.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { getHass } from './state.js';
import { minuitLocal, totauxRelus } from './jourstat.js';

// Pas encore de `hass` (l'application mobile le pose parfois après le premier
// rendu) : on réessaie vite, une fois à la fois.
const ATTENTE_HASS_MS = 2000;
// Les cartes qui se montent au même rendu partagent une lecture des mesures.
const GROUPE_MS = 50;
const HORLOGE = {
  repeter: (f, ms) => setInterval(f, ms), arreter: (t) => clearInterval(t),
  plusTard: (f, ms) => setTimeout(f, ms), annuler: (t) => clearTimeout(t), maintenant: () => Date.now(),
};
let source = () => getHass();
let horloge = HORLOGE;

/** Un magasin : `lire(hass)` rend la réponse (ou sa promesse) ; `lent` et `rapide`, ses périodes.
 *  Exporté pour le carnet des lumières (lumieresetat.js, chantier Lumières, § 7) : la même mécanique,
 *  la même source et la même horloge.
 *  `empreinte(etat)` (facultative) : ce qui compte d'une réponse. Une réponse de même empreinte que
 *  celle qu'on tient garde l'objet d'avant et ne réveille personne (audit du 19/10, point 6). */
export function magasin(lire, lent, rapide, empreinte = null) {
  let instant = Object.freeze({ etat: null, erreur: false });
  const ecouteurs = new Set();
  let abonnes = 0, rapides = 0, minuteur = null, periode = 0, relance = null, tour = 0, publie = 0, trace = null;
  const publier = (suite) => {
    let etat = suite.etat;
    if (empreinte && etat && instant.etat && etat !== instant.etat) {
      const e = empreinte(etat);
      if (trace == null) trace = empreinte(instant.etat);
      if (e === trace) etat = instant.etat; else trace = e;
    } else if (etat !== instant.etat) trace = null;
    if (etat === instant.etat && suite.erreur === instant.erreur) return;
    instant = Object.freeze({ etat, erreur: suite.erreur });
    ecouteurs.forEach(f => { try { f(); } catch { /* un écouteur tombé n'arrête pas les autres */ } });
  };
  const m = {
    lire: () => instant,
    /** Combien de composants suivent ce magasin en ce moment — 0 : personne ne le relit. */
    suivis: () => abonnes,
    poser(etat) {
      if (!etat || typeof etat !== 'object') return;
      publie = tour + 1;
      publier({ etat, erreur: false });
    },
    ecouter(f) { ecouteurs.add(f); return () => { ecouteurs.delete(f); }; },
    rafraichir() {
      if (abonnes <= 0) return Promise.resolve(null);
      const h = source();
      if (!h || typeof h.callWS !== 'function') {
        if (relance == null) relance = horloge.plusTard(() => { relance = null; m.rafraichir(); }, ATTENTE_HASS_MS);
        return Promise.resolve(null);
      }
      const n = ++tour;
      const recu = (r) => {
        if (n < publie) return null;
        publie = n;
        const lu = !!r && typeof r === 'object';
        publier({ etat: lu ? r : instant.etat, erreur: !lu });
        return lu ? r : null;
      };
      let p;
      try { p = Promise.resolve(lire(h)); } catch (e) { p = Promise.reject(e); }
      return p.then(recu, () => recu(null));
    },
    cadence() {
      const voulue = abonnes > 0 ? (rapides > 0 ? rapide : lent) : 0;
      if (voulue === periode) return;
      if (minuteur != null) { horloge.arreter(minuteur); minuteur = null; }
      if (!voulue && relance != null) { horloge.annuler(relance); relance = null; }
      periode = voulue;
      if (voulue) minuteur = horloge.repeter(m.rafraichir, voulue);
    },
    /* Un abonné de plus ; le premier, et le premier rapide, relisent aussitôt — sauf `lire: false`. */
    abonner({ rapide: r = false, lire: lit = true } = {}) {
      abonnes += 1;
      if (r) rapides += 1;
      const relire = lit && (abonnes === 1 || (r && rapides === 1));
      m.cadence();
      if (relire) m.rafraichir();
      let fait = false;
      return () => {
        if (fait) return;
        fait = true;
        abonnes -= 1;
        if (r) rapides -= 1;
        m.cadence();
      };
    },
    remettre() {
      if (minuteur != null) horloge.arreter(minuteur);
      if (relance != null) horloge.annuler(relance);
      minuteur = null; relance = null; periode = 0; abonnes = 0; rapides = 0; tour = 0; publie = 0; trace = null;
      instant = Object.freeze({ etat: null, erreur: false });
      ecouteurs.clear();
    },
  };
  return m;
}

/* Ce qui compte d'une réponse de l'état ou des minuteurs : tout, sauf `maintenant` — l'horloge du serveur, neuve à
 * chaque relevé, que personne ne lit ici. Sans elle, deux relevés identiques se ressemblent au caractère près. */
function sansHeure(r) {
  return JSON.stringify(r, function (k, v) { return k === 'maintenant' && this === r ? undefined : v; });
}
const ETAT = magasin((h) => h.callWS({ type: 'loggia/prises/etat' }), 60000, 15000, sansHeure);
const MINUTEURS = magasin((h) => h.callWS({ type: 'loggia/minuteurs/etat' }), 60000, 15000, sansHeure);
/* Les capteurs suivis, comptés : une carte ajoute les siens en se montant. */
const SUIVIS = new Map();
let groupe = null;
const MESURES = magasin((h) => {
  const debut = minuitLocal(horloge.maintenant());
  const ids = [...SUIVIS.keys()].sort();
  if (!ids.length) return { debut, ids, stats: {} };
  return Promise.resolve(h.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(debut).toISOString(), statistic_ids: ids,
    period: '5minute', types: ['mean', 'change'], units: { power: 'W', energy: 'kWh' } }))
    .then(stats => ({ debut, ids, stats: stats && typeof stats === 'object' ? stats : {} }));
}, 300000, 300000);

/** Suivre des capteurs : une relecture des mesures si l'un est neuf, groupée avec les cartes du même rendu. Rend la fonction qui cesse. */
export function suivreMesures(ids) {
  let neuf = false;
  ids.forEach(id => { const n = SUIVIS.get(id) || 0; if (!n) neuf = true; SUIVIS.set(id, n + 1); });
  const fin = MESURES.abonner({ lire: false });
  if (neuf && groupe == null) groupe = horloge.plusTard(() => { groupe = null; MESURES.rafraichir(); }, GROUPE_MS);
  return () => {
    fin();
    ids.forEach(id => { const n = (SUIVIS.get(id) || 1) - 1; if (n > 0) SUIVIS.set(id, n); else SUIVIS.delete(id); });
  };
}

/** `{ etat, erreur }` de `loggia/prises/etat` — le même objet tant que rien ne change. */
export const lireEtatPrises = () => ETAT.lire();
/** Un état plus frais (rendu par une écriture) remplace le cache ; de même pour les minuteurs. */
export const poserEtatPrises = (etat) => ETAT.poser(etat);
export const poserMinuteurs = (etat) => MINUTEURS.poser(etat);
/** Relire l'état des prises maintenant (sans abonné, rien ne part) : la promesse de sa réponse, ou null. */
export const rafraichirPrises = () => ETAT.rafraichir();
/**
 * Combien de composants suivent l'état des prises en ce moment : une carte, une compacte, la
 * fiche, l'en-tête d'Objets › Prises. À 0, PERSONNE ne le relit — ce que `lireEtatPrises` rend
 * est celui de la dernière fois, qui peut avoir des heures (relecture finale, F5) ; la recherche
 * (Ctrl+K), qui ne s'abonne à rien, le tient alors pour inconnu.
 */
export const abonnesPrises = () => ETAT.suivis();

/* Les minuteurs seuls (`loggia/minuteurs/etat`), pour les lumières (chantier Lumières, § 7) : le même magasin
 * que celui des prises — une lecture pour tout l'écran. `abonnerMinuteurs` rend la fonction qui désabonne. */
export const abonnerMinuteurs = ({ rapide = false } = {}) => MINUTEURS.abonner({ rapide });
export const lireMinuteurs = () => MINUTEURS.lire();
export const ecouterMinuteurs = (f) => MINUTEURS.ecouter(f);
/* Une relecture des minuteurs demandée hors sondage (une lampe qui change d'état, lumieresetat.js) ; celles d'un même tour
 * n'en font qu'une. Sans abonné, le magasin ne lit rien. */
let relectureMinuteurs = null;
export function relireMinuteurs() {
  if (!relectureMinuteurs) relectureMinuteurs = Promise.resolve().then(() => { relectureMinuteurs = null; return MINUTEURS.rafraichir(); });
  return relectureMinuteurs;
}

/** Un abonné de plus à l'état des prises et des minuteurs — une carte, ou la fiche (`rapide`). Rend la fonction qui désabonne. */
export function abonnerPrises({ rapide = false } = {}) {
  const a = ETAT.abonner({ rapide }), b = MINUTEURS.abonner({ rapide });
  return () => { a(); b(); };
}

/** `{ etat, erreur }` de l'état des prises SEUL, sans les minuteurs — l'Accueil et les notifications, qui n'en
 *  lisent que les cycles (audit du 19/10, point 2). `actif` faux : rien ne s'abonne, le cache se lit tel quel. */
export function useLecturePrises(actif = true) {
  useEffect(() => (actif ? ETAT.abonner() : undefined), [actif]);
  return useSyncExternalStore(ETAT.ecouter, ETAT.lire, ETAT.lire);
}

/** `{ etat, minuteurs, erreur }`. `actif` faux : rien ne s'abonne, le cache se lit tel quel ; `rapide` : la fiche. */
export function useEtatPrises(actif = true, { rapide = false } = {}) {
  useEffect(() => (actif ? abonnerPrises({ rapide }) : undefined), [actif, rapide]);
  const e = useSyncExternalStore(ETAT.ecouter, ETAT.lire, ETAT.lire);
  const m = useSyncExternalStore(MINUTEURS.ecouter, MINUTEURS.lire, MINUTEURS.lire);
  return { etat: e.etat, minuteurs: m.etat, erreur: e.erreur };
}

/** La journée d'une prise (`mesuresDe`), ses capteurs suivis tant que le composant vit. */
export function useMesuresPrise(puissance, energie, actif = true) {
  const cle = (puissance || '') + '|' + (energie || '');
  useEffect(() => {
    const ids = actif ? cle.split('|').filter(Boolean) : [];
    return ids.length ? suivreMesures(ids) : undefined;
  }, [actif, cle]);
  const m = useSyncExternalStore(MESURES.ecouter, MESURES.lire, MESURES.lire);
  return mesuresDe(m.etat, puissance, energie, horloge.maintenant());
}

/** L'entrée d'une prise dans l'état (§ 6.1), ou null — un serveur d'avant n'a pas `prises`. */
export function prisesDe(etat, id) {
  const t = etat && etat.prises;
  return (id && t && typeof t === 'object' && t[id] && typeof t[id] === 'object') ? t[id] : null;
}

/**
 * La garde d'une prise (P5), d'après l'état du serveur :
 *  - `protegee` : ce que le serveur DIT — son entrée dans `prises`, ou son nom
 *    dans la liste `config.protegees`. Le cadenas ne s'affiche que pour elle ;
 *  - `inconnu` : aucune lecture n'a réussi (`etat` nul : le chargement, un échec,
 *    un serveur d'avant la mise à jour). Une fois une lecture réussie, le
 *    magasin garde l'état même si les suivantes échouent : la prise n'est plus
 *    « inconnue » ;
 *  - `garde` : ce que couper à la main doit DEMANDER — protégée, OU protection
 *    inconnue. Dans le doute, on demande : mieux vaut un appui de trop que le
 *    NAS coupé d'un seul.
 */
export function gardeDePrise(etat, id) {
  const lu = !!etat && typeof etat === 'object';
  const liste = lu && etat.config && Array.isArray(etat.config.protegees) ? etat.config.protegees : [];
  const e = prisesDe(etat, id);
  const protegee = lu && (!!(e && e.protegee) || (!!id && liste.includes(id)));
  return { protegee, inconnu: !lu, garde: protegee || !lu };
}

/**
 * Ce que couper à la main un `switch.` doit DEMANDER — la règle UNIQUE de tous les chemins qui
 * ne passent pas par la carte d'une prise : la compacte, le gros interrupteur, la recherche
 * (Ctrl+K), la carte générique, la ligne d'une épingle, le choix de la feuille à ouvrir
 * (relecture finale, F2, F3).
 *
 * Tant que l'index de la découverte n'est pas lu — quelques secondes sur une grosse
 * installation —, `priseDe` (App.jsx) ne reconnaît AUCUNE prise : le NAS s'affiche en switch
 * ordinaire, et chacun de ces chemins le coupait d'un appui. D'où :
 *  - `lecture` : `{ etat, erreur }`, ce que rendent `lireEtatPrises` et `useEtatPrises` ;
 *  - `reconnue` : l'index classe ce switch parmi les prises — la garde de la prise (A3),
 *    `gardeDePrise` : protégée, OU protection inconnue. Elle ne change pas ;
 *  - sinon, pour un switch que l'index ne classe pas (encore), on demande si
 *    (a) la liste `protegees` d'un état CONNU le nomme, ou
 *    (b) `indexLu` est faux et l'état des prises n'a encore reçu AUCUNE réponse, et aucune
 *        erreur : c'est le chargement.
 *    Une erreur sans état ne garde PAS un switch que l'index ne connaît pas : un serveur trop
 *    vieux pour répondre ne doit pas gêner indéfiniment. Et (b) cesse avec l'attente : l'index
 *    lu, un switch qu'il ne classe pas n'est pas une prise, rien à demander de plus (`indexLu`
 *    vaut faux par défaut — dans le doute, on demande).
 */
export function gardeDeSwitch(lecture, id, { reconnue = false, indexLu = false } = {}) {
  const { etat = null, erreur = false } = lecture || {};
  const g = gardeDePrise(etat, id);
  if (reconnue) return g.garde;
  return g.protegee || (!indexLu && g.inconnu && !erreur);
}

/** La fin du minuteur d'une entité, en millisecondes, ou null. `maintenant` (facultatif) : une fin déjà passée — le
 *  serveur ne l'a pas encore retirée, le sondage ne le sait qu'au tour suivant — vaut null : « dans 0 min » ne se
 *  dit pas (audit du 19/10, point 5). */
export function finMinuteur(etat, id, maintenant = null) {
  const m = etat && etat.minuteurs && etat.minuteurs[id];
  const fin = m ? Number(m.fin) * 1000 : NaN;
  return fin > 0 && (maintenant == null || fin > maintenant) ? fin : null;
}

/**
 * Un battement par seconde tant que `actif` : la fiche redessine son décompte
 * (sa demande du 20/10). Rien sans minuteur, rien quand l'appelant fixe l'heure
 * (les tests) — et le battement cesse avec le minuteur.
 */
export function useHorloge(actif, ms = 1000) {
  const [, battre] = useState(0);
  useEffect(() => {
    if (!actif) return undefined;
    const t = setInterval(() => battre((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [actif, ms]);
}

/* L'électroménager dont le serveur repère les cycles (P3) — `ELECTROMENAGER` de prises.js, que ce module n'importe pas
 * (il se teste à sec, sans les mots ni la langue). tests/prisesetat.test.mjs vérifie que les deux disent la même chose. */
export const CYCLES_SUIVIS = ['lv', 'll', 'sl'];

/**
 * Les cycles d'électroménager EN COURS que le serveur suit (P3) : `[{ id, type, debut }]`, triés par entité, pour
 * l'Accueil — « En ce moment » et ses notifications (audit du 19/10, point 2). `null` quand il ne dit rien : rien
 * de lu (le module ne répond pas, un serveur d'avant), ou aucune prise lave-vaisselle, lave-linge, sèche-linge qu'il
 * suive — l'appelant garde alors son ancien chemin. Suivie : `suivi` vrai ; sans le champ (un serveur d'avant), la
 * prise qui MESURE (`mesure(id)` : elle a un capteur de puissance).
 */
export function cyclesElectromenager(etat, mesure = () => false) {
  const t = etat && etat.prises;
  if (!t || typeof t !== 'object') return null;
  const suivies = Object.keys(t).filter(id => {
    const e = t[id];
    return !!e && CYCLES_SUIVIS.includes(e.type) && (e.suivi === true || (e.suivi == null && !!mesure(id)));
  }).sort();
  if (!suivies.length) return null;
  return suivies.filter(id => t[id].cycle && t[id].cycle.debut).map(id => ({ id, type: t[id].type, debut: t[id].cycle.debut }));
}

/**
 * La journée d'une prise dans les mesures lues : `points`, la courbe de sa
 * puissance (`[{ t, w }]`, une moyenne par 5 minutes ; null tant qu'elle n'est
 * pas lue ; [] sans statistiques — un capteur sans `state_class`) ; `kwh`, ce
 * que son compteur a compté depuis minuit, sinon la courbe intégrée
 * (`estime`) ; null si rien ne le dit.
 *
 * Deux garde-fous (relecture des tâches 1 à 6, point 4) :
 *  - le compteur ne fait foi que si une ligne porte une somme (`change`
 *    numérique), comme `totauxRelus` : un capteur `state_class: measurement`
 *    n'en porte pas, et sa « somme » de zéro disait « 0,00 kWh » alors que la
 *    courbe, elle, comptait ;
 *  - une lecture dont le `debut` n'est pas le minuit d'AUJOURD'HUI — minuit est
 *    passé, la relecture n'est pas encore revenue — est celle de la veille : elle
 *    ne dit rien d'aujourd'hui, la journée vaut « pas encore lue ».
 * `maintenant` : l'instant d'aujourd'hui (les tests le fixent).
 */
export function mesuresDe(mesures, puissance, energie, maintenant = Date.now()) {
  const duJour = !!mesures && mesures.debut === minuitLocal(maintenant);
  const lu = (id) => !!(duJour && id && Array.isArray(mesures.ids) && mesures.ids.includes(id));
  const lignes = (id) => (lu(id) && Array.isArray(mesures.stats[id]) ? mesures.stats[id] : []);
  const debut = (x) => (typeof x.start === 'number' ? x.start : Date.parse(x.start));
  const points = !puissance ? [] : !lu(puissance) ? null
    : lignes(puissance).filter(x => x && typeof x.mean === 'number').map(x => ({ t: debut(x), w: x.mean }));
  const somme = energie ? totauxRelus({ [energie]: lignes(energie) }, [energie])[energie] : undefined;
  if (somme != null) return { points, kwh: somme, estime: false };
  if (points && points.length) return { points, kwh: points.reduce((s, p) => s + p.w, 0) * 5 / 60 / 1000, estime: true };
  return { points, kwh: null, estime: false };
}

/** Pour les tests : la source de `hass` et l'horloge doublées, les trois caches vidés. */
export function reglerPrisesEtat({ hass = undefined, horloge: h = undefined } = {}) {
  [ETAT, MINUTEURS, MESURES].forEach(m => m.remettre());
  if (groupe != null) horloge.annuler(groupe);
  groupe = null;
  SUIVIS.clear();
  source = hass === undefined ? () => getHass() : () => hass;
  horloge = h ? { ...HORLOGE, ...h } : HORLOGE;
}
