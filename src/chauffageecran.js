/* ── Le planning de chauffe à l'écran : les aides pures (chantier Chauffage, plan 2) ──
 *
 * La carte, l'Accueil et la fiche disent les modes avec les mêmes mots, les
 * mêmes couleurs et dans le même ordre ; « En ce moment » ne dit que
 * l'inhabituel (choix 15). Ce module entre dans le paquet de DÉMARRAGE (la
 * carte et l'Accueil) : il reste petit, et n'importe jamais `chauffage.js` —
 * le calcul se charge avec la fiche.
 *
 * Ni React ni Home Assistant : une valeur entre, une valeur sort
 * (tests/chauffageecran.test.mjs). Les mots se lisent à l'APPEL, jamais à
 * l'import : bâtis au chargement, ils garderaient la langue du démarrage.
 */
import { tr, locale } from './i18n.js';
import { nombre } from './format.js';
import { deCelsius } from './unites.js';

/** Du plus froid au plus chaud : l'ordre de − et + sur la carte. Égal à
 * `FROID` du calcul (`chauffage.js`) — un test les tient ensemble. */
export const ORDRE_MODES = ['arret', 'hors_gel', 'eco', 'confort_2', 'confort_1', 'confort'];

/* Les couleurs des modes sont celles de sa maquette « Cartes chauffage »
 * (son objet `P`), choisies le 11/10 : « Orange : chauffe ou confort.
 * Violet : éco. Cyan : hors-gel. Le rouge reste réservé aux alertes. » Les
 * trois Confort prennent l'orange de la chauffe — plein, à .7, à .45 —,
 * l'Arrêt et l'inconnu le gris. Elles se rangent comme ORDRE_MODES, de
 * l'Arrêt au Confort : un mode inconnu a l'index -1, et rien à cet index. Les
 * mots, une fonction appelée au rendu. */
const COULEURS = ['var(--o-text3)', 'var(--o-cyan)', 'var(--o-purple)', 'rgba(var(--o-warn2-rgb),.45)', 'rgba(var(--o-warn2-rgb),.7)', 'var(--o-warn2)'];
// Le lavis d'un mode, le triplet d'un `rgba(…)` : l'orange pour les trois Confort, rien pour l'Arrêt.
const LAVIS_MODES = [null, 'var(--o-cyan-rgb)', 'var(--o-purple-rgb)', 'var(--o-warn2-rgb)', 'var(--o-warn2-rgb)', 'var(--o-warn2-rgb)'];
// L'encre d'un mot écrit en grand : à .45, il ne se lirait plus — l'orange plein pour les trois Confort.
const ENCRES = ['var(--o-text2)', 'var(--o-cyan)', 'var(--o-purple)', 'var(--o-warn2)', 'var(--o-warn2)', 'var(--o-warn2)'];
const rang = (mode) => ORDRE_MODES.indexOf(mode);
// Une tuile d'« En ce moment » est toujours teintée : l'Arrêt y prend le gris.
const GRIS = 'var(--o-text3-rgb)';

/** La couleur d'un mode — un point, une bande : « var(--o-purple) » pour l'Éco,
 * « rgba(var(--o-warn2-rgb),.7) » pour le Confort −1. */
export function couleurMode(mode) {
  return COULEURS[rang(mode)] || 'var(--o-text3)';
}

/** Le lavis d'un mode, pour un `rgba(…, a)` — la plaque d'une carte :
 * « var(--o-warn2-rgb) » pour les trois Confort ; null pour l'Arrêt et
 * l'inconnu, qui n'en ont pas. */
export function rgbMode(mode) {
  return LAVIS_MODES[rang(mode)] || null;
}

/** L'encre d'un mode écrit en grand : l'orange plein pour les trois Confort,
 * la couleur du mode sinon, `--o-text2` pour l'Arrêt et l'inconnu. */
export function encreMode(mode) {
  return ENCRES[rang(mode)] || 'var(--o-text2)';
}

/**
 * La plaque d'un chauffage, `[fond, encre]` : celle de l'icône de sa carte ET
 * celle de l'en-tête de sa fiche (tâche 10 bis B) — une seule règle, ici. La
 * chauffe MESURÉE d'abord (l'orange, même à l'Arrêt), puis le froid (le
 * bleu), un chauffage éteint ou en panne (le gris) ; sinon la teinte du mode
 * d'un fil pilote (son lavis à .16, sa couleur), ou le neutre — un thermostat
 * ne passe pas de mode. La couleur s'applique EN ENTIER : la plaque, le lavis
 * de la carte et le point suivent la même.
 */
export function plaqueMode({ chauffe = false, froid = false, eteint = false, mode = null } = {}) {
  if (chauffe) return ['rgba(var(--o-warn2-rgb),.2)', 'var(--o-warn2)'];
  if (froid) return ['rgba(var(--o-cold-rgb),.2)', 'var(--o-cold)'];
  if (eteint) return ['var(--o-s1)', 'var(--o-text3)'];
  const lavis = rgbMode(mode);
  return lavis ? ['rgba(' + lavis + ',.16)', couleurMode(mode)] : ['var(--o-s1)', 'var(--o-text1)'];
}

/**
 * L'étiquette sous la valeur d'une carte : QUI décide (réserve de la carte,
 * prise à la tâche 10 bis B). Au planning : `'planning'` — le planning, sa
 * propre bande Arrêt comprise, et la maison —, `'manuel'` — une reprise en
 * main, la bascule qui coupe comprise : l'Arrêt ne l'emporte plus, et rien
 * d'autre ne dirait que c'est une reprise —, `'mode'` — une fenêtre ouverte,
 * qui impose son mode. Planning éteint, en « Observer sans agir » ou sans
 * l'état du moteur : `'consigne'` pour ce qui se règle en degrés (`consigne` :
 * un thermostat, une zone décrite à la main), sinon `'mode'` à l'arrêt et
 * `'manuel'` en marche.
 */
export function etiquetteCarte({ consigne = false, auPlanning = false, source = null, eteint = false } = {}) {
  if (auPlanning) return source === 'fenetre' ? 'mode' : source === 'main' ? 'manuel' : 'planning';
  if (consigne) return 'consigne';
  return eteint ? 'mode' : 'manuel';
}

const MOTS_MODES = () => [tr('Arrêt'), tr('Hors-gel'), tr('Éco'), tr('Confort −2'), tr('Confort −1'), tr('Confort')];

/** Le mot d'un mode dans la langue de l'écran, ou null pour un mode inconnu. */
export function motMode(mode) {
  return MOTS_MODES()[ORDRE_MODES.indexOf(mode)] || null;
}

/**
 * Le mode d'un cran plus chaud (`sens` > 0) ou plus froid (< 0), parmi ceux
 * que le chauffage comprend (`modes`) ; null au bout, ou pour un mode inconnu.
 * Un mode connu que le chauffage n'a pas part de SA place dans l'ordre.
 */
export function modeVoisin(modes, mode, sens) {
  const pas = Math.sign(sens);               // 1 ou -1 ; zéro et l'illisible donnent 0 ou NaN : faux
  let i = ORDRE_MODES.indexOf(mode);
  if (i < 0 || !pas || !Array.isArray(modes)) return null;
  // Hors de la liste (-1, 6), plus de mode : on est au bout.
  for (i += pas; ORDRE_MODES[i]; i += pas) {
    if (modes.includes(ORDRE_MODES[i])) return ORDRE_MODES[i];
  }
  return null;
}

/**
 * La consigne qu'un appui sur − / + vise au planning : d'un cran plus chaude
 * (`sens` > 0) ou plus froide, dans l'unité de l'appareil (`attributs` : ceux
 * de son `climate`). Le serveur range toute consigne au pas de l'appareil,
 * chaque demi vers le haut (`consigne_en_unite`) : celui qu'il publie
 * (`target_temp_step`), sinon 1 °F ou 0,5 °C. Un demi-degré de moins sur un
 * appareil au degré — un poêle, un thermostat en °F qui ne publie pas son
 * pas — y redevenait la même consigne : « − » posait une reprise en main pour
 * rien. Un cran vaut donc un pas, un demi-degré au moins, et tombe sur la
 * grille de ce pas. null sans consigne lisible ou sans sens.
 */
/* Le décalage du capteur d'un thermostat (30/10), dans `unite` : ce qu'il lit
 * de plus que la pièce (`decalage`, en °C, que le moteur ajoute à ce qu'il
 * envoie). Au planning, la carte et la fiche disent et règlent la consigne de
 * la PIÈCE : celle de l'appareil, moins lui. 0 sans décalage. */
export function decalageEn(ch, unite) {
  const d = ch && typeof ch.decalage === 'number' && Number.isFinite(ch.decalage) ? ch.decalage : 0;
  return unite === 'F' ? d * 1.8 : d;
}

export function consigneVoisine(consigne, sens, attributs, unite) {
  const s = Math.sign(sens);
  if (typeof consigne !== 'number' || !Number.isFinite(consigne) || !s) return null;
  const publie = Number(attributs && attributs.target_temp_step);
  const pas = Number.isFinite(publie) && publie > 0 ? publie : unite === 'F' ? 1 : 0.5;
  return Math.floor((consigne + s * Math.max(pas, 0.5)) / pas + 0.5) * pas;
}

/** Un module fil pilote ne dit pas s'il chauffe ; son capteur de puissance
 * voisin, si : au-delà de 10 W (choix 8). */
export const SEUIL_CHAUFFE_W = 10;

/**
 * L'état d'un module fil pilote sur sa carte (choix 8) : 'chauffe' quand son
 * capteur de puissance mesure plus de 10 W, 'eteint' à l'Arrêt, sinon
 * 'repos'. La MESURE passe avant l'ordre : un radiateur qui tire du courant
 * à l'Arrêt chauffe quand même — un fil pilote débranché —, et la carte le
 * dit. `watts` : la mesure en watts (`wattsDe`), null sans capteur ou
 * illisible.
 */
export function etatModule(watts, mode) {
  if (typeof watts === 'number' && watts > SEUIL_CHAUFFE_W) return 'chauffe';
  return mode === 'arret' ? 'eteint' : 'repos';
}

/** Le mode que l'option d'un module représente. `options` est la table du
 * serveur, `{mode: option telle que le module l'écrit}` : elle se lit à
 * l'envers. null pour une option qu'elle ne nomme pas. */
export function modeDuModule(options, option) {
  if (!options || typeof options !== 'object' || option == null) return null;
  return ORDRE_MODES.find(m => options[m] === option) || null;
}

// Ce que Home Assistant publie d'un appareil qui ne répond pas (MUETS, chauffage_familles.py).
const MUETS = ['unavailable', 'unknown', 'none', ''];

/** Un état qui ne dit rien de l'appareil : indisponible, inconnu, vide.
 * (`chauffageplanning.js` la réexporte : la fiche la lit là.) */
export function estMuet(etat) {
  return MUETS.includes(String(etat == null ? '' : etat).toLowerCase());
}

/** Un module fil pilote MUET (relecture de la partie A) : son `select` manque
 * ou ne dit rien (`unavailable`, `unknown`) — sa carte le dit comme celle
 * d'un thermostat en panne : « Indisponible », le liseré de panne, rien à
 * toucher. Le select SEUL : l'avis « injoignable » du moteur vient de lui, et
 * n'ajoutait qu'un retard — l'état du moteur se relit toutes les 60 s, et un
 * module revenu restait « Indisponible » jusqu'à une minute (relecture de la
 * dernière passe). */
export function moduleMuet(st) {
  return !st || estMuet(st.state);
}

/**
 * LA règle « chauffe » (relecture de la partie A) : la carte d'un chauffage —
 * son lavis, sa plaque, la couleur de son état — et le compte « · n
 * chauffent » d'Objets la lisent ici, et nulle part ailleurs.
 *  - un appareil muet (`muet`) ne chauffe pas : sa carte dit « Indisponible » ;
 *  - un module fil pilote : son capteur de puissance présent, et plus de
 *    10 W (`watts`, null sans capteur ou illisible) — la mesure, même à
 *    l'Arrêt (choix 8) ;
 *  - un thermostat : en marche (`marche` : son état n'est pas `off`), et
 *    `hvac_action` à `heating` (`action`) — ou `preheating` : préchauffer,
 *    c'est chauffer ;
 *  - une zone décrite à la main : la règle de sa carte — en marche, la pièce
 *    (`mesure`) sous sa consigne (`consigne`), toutes deux lisibles.
 */
export function enChauffe({ famille, muet = false, marche = false, watts = null, action = null, mesure = null, consigne = null } = {}) {
  if (muet) return false;
  if (famille === 'module') return typeof watts === 'number' && watts > SEUIL_CHAUFFE_W;
  if (!marche) return false;
  if (famille === 'thermostat') return action === 'heating' || action === 'preheating';
  return typeof mesure === 'number' && Number.isFinite(mesure) && typeof consigne === 'number' && Number.isFinite(consigne) && mesure < consigne;
}

// Les modes d'une clim qui ne visent pas de température, et ne prennent aucune teinte.
const SANS_CONSIGNE = ['dry', 'fan_only'];

/**
 * « Consigne atteinte » ne se dit que MESURÉ (relecture de la partie A) : la
 * pièce lisible, et proche de la consigne à une marge près — 0,2 °C, soit
 * 0,4 °F (`unite`, comme `uniteTemp` : 'C' ou 'F') :
 *  - au moins à la consigne − la marge pour un appareil qui chauffe (`heat`,
 *    et tout mode inconnu) ;
 *  - au plus à la consigne + la marge pour un appareil qui refroidit (`cool`) ;
 *  - à la marge près, dans les deux sens, en `auto` et en `heat_cool` à
 *    consigne unique : l'appareil y chauffe OU refroidit vers elle — une pièce
 *    à 21° pour 20° ne l'a pas atteinte (relecture de la dernière passe) ;
 *  - jamais pour une clim qui sèche ou ventile : elle ne vise pas de
 *    température.
 * Un `idle` ne suffit pas : une tête thermostatique qui a vu une fenêtre, un
 * poêle en veille, une pompe à chaleur en dégivrage disent `idle` dans une
 * pièce à 16° pour 20°. Un millionième de degré absorbe l'arrondi du flottant
 * (68 − 67,6 vaut 0,400 000 000 000 005 7).
 */
export function consigneAtteinte(mesure, consigne, modeHvac, unite = 'C') {
  const m = mesureLisible(mesure), c = mesureLisible(consigne);
  if (m === null || c === null || SANS_CONSIGNE.includes(modeHvac)) return false;
  const marge = (unite === 'F' ? 0.4 : 0.2) + 1e-6;
  if (modeHvac === 'cool') return m <= c + marge;
  if (modeHvac === 'auto' || modeHvac === 'heat_cool') return Math.abs(m - c) <= marge;
  return m >= c - marge;
}

/** La teinte d'un `climate` hors des cartes 1a — la compacte, les chips : le
 * bleu d'un appareil qui refroidit, sinon l'orange de la chauffe ; AUCUNE pour
 * une clim qui sèche ou ventile (null) — ni l'orange, ni le bleu (relecture de
 * la dernière passe). Le rouge reste aux alertes (« Celles de la maquette »,
 * 11/10). */
export function teinteClimat(st) {
  const a = (st && st.attributes) || {};
  if (st && SANS_CONSIGNE.includes(st.state)) return null;
  return a.hvac_action === 'cooling' || (st && st.state === 'cool') ? 'var(--o-cold)' : 'var(--o-warn2)';
}

/* La partie MURALE d'un instant ISO — « 2026-10-10T23:00:00+02:00 » : le 10
 * octobre 2026, 23:00 —, ou null si elle ne se lit pas. Jamais de conversion
 * de fuseau : la maison dit son heure, quel que soit celui du navigateur. Le
 * motif borne lui-même le mois (01-12), le jour (01-31), l'heure (00-23) et
 * la minute (00-59). */
const ISO = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[T ]([01]\d|2[0-3]):([0-5]\d)/;
function murale(iso) {
  return typeof iso === 'string' ? ISO.exec(iso) : null;
}

/** « 23:00 » pour « 2026-10-10T23:00:00+02:00 » ; null si illisible. */
export function heureMurale(iso) {
  const m = murale(iso);
  return m ? m[4] + ':' + m[5] : null;
}

/* La date murale au format court de la langue (« 20 oct. »), posée et lue
 * dans le MÊME fuseau, celui du navigateur : le jour ne glisse pas. */
function dateMurale(iso) {
  const m = murale(iso);
  return m && new Date(m[1], m[2] - 1, m[3]).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
}

/** La maison hors Planning : `[icône, mode qu'elle impose (sa teinte), mot]`
 * — Absence et Vacances suivent leur réglage, Éco et Hors-gel par défaut ; le
 * mot des Vacances dit leur fin (« Vacances jusqu’au 20 oct. »). null au
 * Planning, ou pour un mode inconnu. « En ce moment », la carte et la barre
 * « Maison » (barremaison.jsx, tâche 11) disent la maison par elle. */
export function regimeMaison(maison) {
  if (maison.mode === 'absence') return ['home', maison.absence || 'eco', tr('Absence')];
  if (maison.mode === 'ete') return ['sun', 'arret', tr('Été')];
  if (maison.mode !== 'vacances') return null;
  const date = dateMurale(maison.vacances_fin);
  return ['umbrella-beach', maison.vacances || 'hors_gel', date ? tr('Vacances jusqu’au {date}', { date }) : tr('Vacances')];
}

/** La barre « Maison » d'Objets › Chauffage sert-elle ? (relecture finale du
 * 12/10) Le moteur connaît un chauffage, ET un planning est allumé
 * (`plannings_allumes`, compté par le serveur avant ses droits) — ou la maison
 * n'est PAS au Planning. Pour qui n'utilise aucun planning, ses modes ne font
 * rien, sauf ramener au Planning une maison restée en Absence, en Vacances ou
 * en Été. */
export function barreMaisonUtile(etat) {
  if (!etat || !Array.isArray(etat.chauffages) || etat.chauffages.length === 0) return false;
  const mode = etat.maison && etat.maison.mode;
  return etat.plannings_allumes === true || (typeof mode === 'string' && mode !== 'planning');
}

/**
 * « En ce moment » ne dit que l'INHABITUEL (choix 15) : les lignes
 * `{ cle, chauffage, entite, icone, rgb, nom, sous }` de `LigneMoment`
 * (App.jsx) — `chauffage`, la clé du chauffage dont la ligne ouvre la fiche
 * (`FicheChauffage`, par sa clé : un chauffage introuvable n'a pas
 * d'entité), null pour la maison, qui mène à Objets › Chauffage.
 *
 *  - la maison hors Planning, d'abord : « Absence », « Vacances jusqu'au
 *    20 oct. », « Été » — et, quand plus aucun planning n'est allumé, « … —
 *    aucun planning allumé » : la maison resterait en Absence sans que rien
 *    ne la ramène, il faut le voir. Le serveur le compte avant le filtre des
 *    droits (`plannings_allumes`) : un compte qui ne voit pas les chauffages
 *    au planning ne le lit pas à tort ; sans lui, ce que l'écran voit ;
 *  - puis, chaque chauffage INTROUVABLE dans Home Assistant (renommé ou
 *    retiré), planning allumé ou non : il a une configuration, et sa fiche
 *    est le seul chemin vers « Supprimer son planning » (spec § 10). Pour un
 *    administrateur seulement (`admin`) : un compte ordinaire n'y aurait
 *    aucun geste ;
 *  - et, pour chaque chauffage au planning ALLUMÉ, une ligne au plus : son
 *    module coupé quand il devrait chauffer (le planning ne peut rien : cela
 *    l'emporte ; à l'Arrêt, un module coupé ne prive de rien), une fenêtre
 *    qui coupe, une reprise en main — son mode, ou sa consigne dans l'unité
 *    de la maison (`unite` : 'C' ou 'F', comme `uniteTemp` ; le serveur parle
 *    en °C), jusqu'à sa fin ou jusqu'à relance. La fin dit son jour quand ce
 *    n'est pas aujourd'hui (« jusqu’à demain 07:30 », « jusqu’à lundi
 *    07:30 ») : lue dans la partie MURALE de son instant, le jour comparé à
 *    `etat.maintenant`, l'horloge de la maison — comme la carte et la fiche
 *    (`finMurale`) ;
 *  - en « Observer sans agir », le moteur n'envoie aucun ordre (tâche 7) :
 *    ni fenêtre, ni reprise, ni module coupé ne se disent — le compte des
 *    zones qui chauffent (App.jsx, `zonesQuiChauffent`) les reprend, comme
 *    planning éteint ; un chauffage introuvable, lui, reste à supprimer.
 * Les lignes suivent l'ordre de l'état, la maison en tête.
 *
 * Le mode dit est celui que le moteur APPLIQUE (`applique`, relecture de la
 * partie B) : l'Arrêt voulu d'un thermostat sans `off` y est son Hors-gel ;
 * sans `applique` (un serveur d'avant), le mode voulu.
 *
 * Quand tout suit le planning, rien.
 */
export function lignesMoment(etat, unite = 'C', { admin = true } = {}) {
  const lignes = [];
  const tous = (etat && Array.isArray(etat.chauffages) ? etat.chauffages : []).filter(c => c && typeof c === 'object');
  const unAllume = etat && typeof etat.plannings_allumes === 'boolean' ? etat.plannings_allumes : tous.some(c => c.planning === true);
  const regime = etat && etat.maison && regimeMaison(etat.maison);
  if (regime) {
    const sous = unAllume ? regime[2] : tr('{mode} — aucun planning allumé', { mode: regime[2] });
    lignes.push({ cle: 'chauffage-maison', chauffage: null, entite: null, icone: regime[0], rgb: rgbMode(regime[1]) || GRIS, nom: tr('Maison'), sous });
  }
  for (const ch of tous) {
    const mode = ch.applique || ch.mode;
    const mot = motMode(mode);
    const avis = Array.isArray(ch.avertissements) ? ch.avertissements : [];
    let ligne;
    if (avis.includes('introuvable')) {
      if (!admin) continue;
      ligne = ['search-alt', GRIS, tr('Introuvable dans Home Assistant : renommé ou retiré ?')];
    } else if (ch.planning !== true || etat.simulation) {
      continue;
    } else if (mode !== 'arret' && avis.includes('module_coupe')) {
      ligne = ['power', 'var(--o-warn-rgb)', tr('Module coupé : le planning ne peut rien')];
    } else if (avis.includes('programme_appareil')) {
      /* Son propre programme (le chrono d'un poêle) commande : chaque ordre serait défait dans la minute, le moteur
       * n'envoie rien tant qu'il est allumé, sauf l'Arrêt (audit du 19/10 ; 30/10). */
      ligne = ['calendar-clock', 'var(--o-warn-rgb)', tr('Son propre programme commande : Loggia attend qu’il s’éteigne')];
    } else if (avis.includes('programme_concurrent')) {
      // Un programme d'ailleurs (Scheduler, Velair, une automatisation) le commande aussi : deux chefs (26/10).
      ligne = ['calendar-clock', 'var(--o-warn-rgb)', tr('Un autre programme le commande aussi : le planning ne commande pas seul')];
    } else if (avis.includes('puissance_fixe')) {
      // Un poêle MCZ en manuel chauffe à puissance fixe : la consigne, donc le planning, ne compte plus (19/10).
      ligne = ['settings-sliders', 'var(--o-warn-rgb)', tr('Mode manuel : le planning n’a pas d’effet')];
    } else if (avis.includes('ordre_defait')) {
      /* Son dernier ordre perdu deux fois (30/10) : ce qu'il fait à la place — sa consigne pour la pièce, dans
       * l'unité de la maison, ou son mode. Il se tait dès qu'un ordre tient. */
      const d = ch.defait && typeof ch.defait === 'object' ? ch.defait : {};
      const motD = motMode(d.mode);
      ligne = ['triangle-warning', 'var(--o-warn-rgb)', Number.isFinite(d.temperature)
        ? tr('Il n’a pas gardé l’ordre de Loggia : il est à {t}', { t: nombre(deCelsius(d.temperature, unite), 1, 0) + ' °' + unite })
        : motD ? tr('Il n’a pas gardé l’ordre de Loggia : il est en {mode}', { mode: motD }) : tr('Il n’a pas gardé l’ordre de Loggia')];
    } else if (ch.source === 'fenetre') {
      ligne = ['window-alt', rgbMode(mode) || GRIS, mot ? tr('Fenêtre ouverte · {mode}', { mode: mot }) : tr('Fenêtre ouverte')];
    } else if (ch.source === 'main') {
      /* Une reprise en température (un thermostat, sans mode) dit sa consigne
       * et prend la teinte du Confort, l'orange de la chauffe ; sans l'une ni
       * l'autre, un tiret. Les phrases restent ENTIÈRES au catalogue. */
      const t = ch.reprise && ch.reprise.temperature;
      const quoi = ch.reprise && ch.reprise.programme === true ? tr('son programme')
        : mot || (Number.isFinite(t) ? nombre(deCelsius(t, unite), 1, 0) + ' °' + unite : '—');
      const f = finMurale(ch.fin, etat.maintenant);
      const mots = f ? { mode: quoi, heure: f.heure, jour: f.jour } : { mode: quoi };
      ligne = ['hand', rgbMode(mot ? mode : 'confort') || GRIS, !f ? tr('À la main · {mode} jusqu’à relance', mots)
        : f.demain ? tr('À la main · {mode} jusqu’à demain {heure}', mots)
          : f.jour ? tr('À la main · {mode} jusqu’à {jour} {heure}', mots) : tr('À la main · {mode} jusqu’à {heure}', mots)];
    } else continue;
    lignes.push({ cle: 'chauffage:' + ch.cle, chauffage: ch.cle, entite: ch.entite || null, icone: ligne[0], rgb: ligne[1], nom: ch.nom || ch.entite || tr('Chauffage'), sous: ligne[2] });
  }
  return lignes;
}

/* ════════════ La carte « 1a » (tâche 10 bis A) ════════════
 *
 * La carte vit dans le paquet de DÉMARRAGE : ce qu'il lui faut pour écrire sa
 * phrase vit ici, jamais dans `chauffageplanning.js` ni dans la fiche,
 * chargées à la demande (choix 4). */

const JOUR_MS = 86400000;
// La date d'une chaîne ISO, bornée comme `ISO` borne son heure.
const DATE_ISO = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])/;

/* Une date en jours depuis le 1er janvier 1970, comptée en UTC pour qu'aucun
 * fuseau ne la déplace : celle qu'une chaîne ISO ÉCRIT (sa partie murale), ou,
 * pour un instant du navigateur (un nombre), sa date locale. null sinon. */
function rangDuJour(x) {
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) return null;
    const d = new Date(x);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / JOUR_MS;
  }
  const m = typeof x === 'string' ? DATE_ISO.exec(x) : null;
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / JOUR_MS : null;
}

/**
 * Le jour d'une fin vu d'aujourd'hui, à l'heure de la maison : `{ dans, jour }`
 * — `dans` compte les jours d'écart (0 aujourd'hui, 1 demain), `jour` est
 * celui de la semaine (0 = lundi), comme pour `prochainDeLaSemaine`. Les deux
 * dates se lisent dans la partie MURALE des chaînes, jamais dans le fuseau du
 * navigateur (choix 5) : un dimanche soir, une fin de lundi 07:30 n'est pas
 * « 07:30 » ce soir. `maintenant` : `etat.maintenant` — à défaut, l'instant du
 * navigateur (un nombre). null si l'une des deux ne se lit pas.
 * (`chauffageplanning.js` la réexporte : la fiche et ses tests la lisent là.)
 */
export function jourDeLaFin(fin, maintenant) {
  const de = rangDuJour(typeof fin === 'string' ? fin : null);
  const ref = rangDuJour(maintenant);
  if (de === null || ref === null) return null;
  return { dans: de - ref, jour: (new Date(de * JOUR_MS).getUTCDay() + 6) % 7 };
}

/** Un jour (0 = lundi) au milieu d'une phrase (« jusqu’à mardi 07:30 ») : son
 * nom tel que la langue l'écrit là — en minuscules en français, capitalisé en
 * allemand. (`nomJour`, robots.js, le capitalise toujours : lui commence une
 * étiquette.) La carte et la fiche le lisent ici. */
export const jourEnPhrase = (j) => new Date(2024, 0, 1 + j).toLocaleDateString(locale(), { weekday: 'long' });

/**
 * La fin d'un créneau ou d'une reprise, lue dans la partie MURALE de son
 * instant : `{ heure, demain, jour }` — `demain` le lendemain, `jour` le nom
 * du jour au-delà, ni l'un ni l'autre aujourd'hui. Le jour se compare à
 * « maintenant » à l'horloge de la maison (`ref`) : un dimanche soir, une fin
 * de lundi 07:30 ne se lit pas « 07:30 », comme si c'était ce soir. La carte
 * et la fiche (tâche 10 bis B) la lisent ici : elles disent « demain » pareil.
 * null si l'heure ne se lit pas.
 */
export function finMurale(iso, ref) {
  const heure = heureMurale(iso);
  if (!heure) return null;
  const j = jourDeLaFin(iso, ref);
  return { heure, demain: !!j && j.dans === 1, jour: j && j.dans > 1 ? jourEnPhrase(j.jour) : null };
}

/* « jusqu’à 22:30 », « jusqu’à demain 07:30 », « jusqu’à lundi 07:30 » : la
 * fin lue par `finMurale` ; null si elle ne se lit pas. */
function jusquA(f) {
  if (!f) return null;
  const mots = { heure: f.heure, jour: f.jour };
  return f.demain ? tr('jusqu’à demain {heure}', mots) : f.jour ? tr('jusqu’à {jour} {heure}', mots) : tr('jusqu’à {heure}', mots);
}

/**
 * L'état d'un chauffage AU PLANNING, en une phrase, sous le nom de sa carte
 * (maquette « Cartes chauffage », cartes 1a). Elle ne redit pas le bas de la
 * carte (son choix du 12/10, « Ne pas répéter le bas ») : l'étiquette sous la
 * valeur dit déjà PLANNING ou MANUEL, la valeur le mode. « Planning · jusqu’à
 * 07… » se coupait à 360 px, et la nuit la fin d'une reprise « jusqu’à demain
 * 07:30 » même sur ordinateur.
 *  - une fenêtre qui coupe : « Fenêtre ouverte » — la valeur dit l'Arrêt ou
 *    l'Éco qu'elle impose ;
 *  - une reprise en main, par SA fin : « jusqu’à 22:30 », « jusqu’à demain
 *    07:30 », « jusqu’à lundi 07:30 », « sans limite » (jusqu'à relance) ;
 *  - la maison hors Planning : son mot — « Absence », « Été », « Vacances
 *    jusqu’au 20 oct. » ;
 *  - sinon le planning, jusqu'à son prochain changement, de même ; « toute la
 *    semaine » quand plus rien ne change.
 * Une fin illisible ne s'invente pas : le mot de l'étiquette, « Manuel »,
 * « Planning ». Le jour se compare à `etat.maintenant`, l'horloge de la
 * maison — à défaut à `t`, l'instant du navigateur. Les phrases restent
 * ENTIÈRES au catalogue : « hasta mañana a las 07:30 » ne se fabrique pas en
 * glissant « mañana » dans « hasta las {heure} ». Le haut de la fiche, où la
 * place ne manque pas, dit le planning en entier (« Planning · jusqu’à 22:30 »,
 * partie B, fichechauffage.jsx).
 */
export function phrasePlanning(ch, etat, t = null) {
  // « Ne rien faire » ne décide jamais (`mode_voulu`, chauffage_calcul.py) : lu quand même, la même phrase.
  if (ch.source === 'fenetre') return tr('Fenêtre ouverte');
  const ref = etat && etat.maintenant ? etat.maintenant : t;
  if (ch.source === 'main') {
    const fin = ch.reprise ? ch.reprise.fin : null;
    return fin == null ? tr('sans limite') : jusquA(finMurale(fin, ref)) || tr('Manuel');
  }
  const regime = ch.source === 'maison' && etat && etat.maison ? regimeMaison(etat.maison) : null;
  if (regime) return regime[2];
  return ch.fin == null ? tr('toute la semaine') : jusquA(finMurale(ch.fin, ref)) || tr('Planning');
}

/** Une mesure lisible — un nombre fini, ou le texte d'un nombre (l'état d'un
 * capteur) —, sinon null : jamais un zéro inventé (ADR 0030). */
export function mesureLisible(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
