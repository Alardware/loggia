/* ── La fiche d'un chauffage (chantier Chauffage, plan 2, tâches 8 à 10 bis) ──
 *
 * Une feuille à onglets, sur le modèle du distributeur (ADR 0155) : Accueil,
 * Planning, Historique, pour tous — l'onglet Réglages est parti à la tâche
 * 10 bis C, son contenu vit dans le Planning ; un compte ordinaire y lit sans
 * rien enregistrer (ADR 0144). Un appareil = sa carte + sa fiche (ADR 0153) ;
 * elle s'ouvre pour tout chauffage que l'état du moteur connaît, planning
 * allumé ou non (choix 10) — un appareil qui sait refroidir compris
 * (climatisation, pompe à chaleur réversible : le serveur le range parmi les
 * thermostats ; son choix du 11/10).
 *
 * Ce qui se CALCULE vit dans `chauffageplanning.js` (pur, chargé avec la
 * fiche) et `chauffageecran.js` (les mots, les couleurs, l'heure murale, le
 * pas d'une consigne, la plaque) ; les briques, dans `fichecommune.jsx`. La
 * coquille (App.jsx, `FicheChauffage`) passe l'état du moteur, l'épingle, la
 * sonde de la pièce, le nom de la pièce et le capteur de puissance d'un
 * module : chargée à la demande, la fiche n'importe jamais App.jsx.
 *
 * Deux régimes, que l'Accueil ne mélange jamais :
 *  - planning ALLUMÉ : le moteur décide. Les puces des modes, et le − / +
 *    d'un thermostat, posent une REPRISE EN MAIN jusqu'au prochain changement
 *    (spec § 5.4) ; une reprise en cours se dit, sa fin se change, et
 *    « Reprendre le planning » la rend ;
 *  - planning ÉTEINT, ou « Observer sans agir » — le moteur n'envoie alors
 *    AUCUN ordre, une reprise en main pas plus que le reste (spec § 5.5), et
 *    ses gestes n'arriveraient pas à l'appareil : l'Accueil commande
 *    l'appareil comme avant — un fil pilote par son `select`, avec l'option
 *    telle que le module l'écrit ; un VTherm par ses préréglages ; un
 *    thermostat par sa consigne et sa marche, sans puces de modes, et comme
 *    sa fiche d'avant (`RoomClimateSheet`) : les modes de l'appareil s'il
 *    sait autre chose que chauffer, ses préréglages, « Refroidit », sa plage
 *    en `heat_cool`. C'est la condition des cartes (`auPlanning`, App.jsx).
 * L'affichage anticipé passe par `useOptimiste` et se retire au refus ; un
 * refus du moteur se dit sur place (`raisonEchec`, `role="alert"`), celui d'un
 * appareil au toast commun, comme pour toute carte.
 *
 * Tâche 10 : l'Historique dit, sous la courbe de la pièce, les modes que
 * l'appareil a réellement appliqués (choix 13) ; les températures des modes
 * d'un thermostat et la suppression du planning d'un chauffage introuvable se
 * règlent dans le Planning. Toute semaine envoyée part dans les modes du
 * chauffage (`semaineAdaptee`).
 *
 * Tâche 10 bis B, le rendu de sa maquette « Cartes chauffage » (cadres 3b et
 * 3e, son choix du 11/10) : l'en-tête porte la plaque de la carte et « pièce ·
 * type » ; l'Accueil dit en grand le mode — ou, pour un thermostat hors du
 * planning, ce qu'il fait —, dessous ce qui décide, à droite la pièce ; une
 * reprise en cours, ses fins en Puces et « Reprendre le planning · {mode} » ;
 * les modes, une grille de boutons libres ; puis une liste : Prochain
 * changement (vers l'onglet Planning), Fenêtre — son réglage s'y déplie pour
 * un administrateur, il quitte Réglages —, Mode de la maison, L'appareil ; et
 * pour un thermostat, Consigne, En marche, Planning.
 *
 * Tâche 10 bis C, le Planning de sa maquette (cadres 3c et 3f) : en tête
 * « Suivre le planning » ; la semaine en sept rangées qui choisissent le
 * jour ; le jour, « Depuis minuit » et un changement par rangée, qui se déplie
 * pour un administrateur — ± 15 min, ses modes, « Supprimer ce changement » —,
 * « Ajouter un changement », « Copier cette journée sur » ; un thermostat, les
 * températures de ses modes ; jamais réglé, « Pas de planning » et « Créer un
 * planning ». S'en vont, comme la maquette : les pastilles des jours, la
 * saisie de l'heure au clavier, la liste des modes, le ✕ à deux appuis, le
 * menu des copies (vers le week-end, vers un autre chauffage) et le premier
 * allumage d'avant.
 *
 * Tâche 10 bis D, l'Historique de sa maquette (cadre 3d) : « 24 h » ou
 * « 7 jours » ; la courbe de la pièce, que la fiche dessine elle-même — en
 * escalier, un trou reste un trou —, ses repères, la consigne d'un thermostat
 * en tirets ; la bande des modes appliqués, ou de la chauffe d'un thermostat ;
 * le temps par mode, ou de chauffe. S'en vont, comme la maquette : la barre de
 * la carte sous la courbe (`BarrePlanning`), son titre et la légende des modes
 * vus — le panneau du temps les dit, avec leurs durées.
 */
import { useState, useEffect, useRef, useId, useMemo } from 'react';
import { tr, trN, trHA, locale } from './i18n.js';
import { Fi, Bascule } from './ui.jsx';
import { compteOrdinaire } from './state.js';
import { commander, commanderService, planAction, actionCtx } from './actions.js';
import { useOptimiste } from './optimiste.js';
import { raisonEchec, enregistrerRefus } from './refus.js';
import { REFUS_CHAUFFAGE } from './refuschauffage.js';
import { uniteTemp, versCelsius, deCelsius, wattsDe } from './unites.js';
import { consigneClimat, plageClimat } from './consigne.js';
import { nombre } from './format.js';
import { premierJourSemaine } from './horloge.js';
import { ordreJours, nomJour, dureeLisible } from './robots.js';
import { commanderChauffage, refroidit } from './chauffageetat.js';
import {
  ORDRE_MODES, couleurMode, encreMode, motMode, modeDuModule, consigneVoisine, finMurale, jourEnPhrase, plaqueMode, enChauffe,
  consigneAtteinte, mesureLisible, moduleMuet,
} from './chauffageecran.js';
import { ecrireHeure, lireHeure, modePlanning } from './chauffage.js';
import {
  bandesSemaine, prochainDeLaSemaine, changementsDuJour, MAX_CHANGEMENTS_JOUR, semaineType, semainePropre, heureLibre, heureAuMilieu,
  modePropose, ajouterChangement, retirerChangement, changerHeure, changerMode, copierJour, semaineAdaptee, heureDecalee,
  estMuet, PRESETS_VTHERM, modesHvac, modeDeChauffe, modesAppliques, temperaturesDe, temperatureDuMode, pasTemperature, plageVoisine,
  modeApplique, PERIODES, echantillons, courbe, chauffeAppliquee, tempsParMode, tempsDeChauffe, placeBande, dater, actionDite, bandesAppliquees,
} from './chauffageplanning.js';
import {
  PETITES_CAPITALES, filet, BoutonConfirme, ChampHeure, EnteteFiche, FicheOnglets, PanneauOnglet, focaliser, useHistoriquePeriode,
  useHistoriqueClimat, JOURS_DERNIERS,
} from './fichecommune.jsx';
import { LISERE, petitesCapitales } from './styles.js';

/* Les refus de la configuration n'arrivent qu'à la fiche et à la barre
 * « Maison », chargées à la demande : enregistrés à leur chargement — le
 * démarrage ne garde que ceux d'une carte (refuschauffage.js). */
enregistrerRefus(REFUS_CHAUFFAGE);

// Un appareil qui ne répond pas (MUETS, chauffage_familles.py) : rien à commander en direct.
const muet = (st) => !st || estMuet(st.state);
// Les préréglages qu'un VTherm prend de lui-même (PRESETS_AUTOMATIQUES, chauffage.py) :
// sa sécurité (`security` dans ses anciennes versions), son délestage.
const SECURITE_VTHERM = ['safety', 'security'];
const DELESTAGE_VTHERM = 'power';
// La commande de la reprise en main, et de son retour au planning.
const TYPE_MAIN = 'loggia/chauffage/main';
const MOT = { fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', lineHeight: 1.5 };
const ALERTE = { fontSize: 12.5, fontWeight: 700, color: 'var(--o-bad)' };
// Les hachures d'un mode « à la main » dans l'Historique : sa bande, sa part du temps, son point.
const hachures = (c) => 'repeating-linear-gradient(135deg, ' + c + ' 0 5px, color-mix(in srgb, ' + c + ' 55%, transparent) 5px 10px)';

/* Les panneaux de la fiche au dessin de sa maquette (tâche 10 bis B pour
 * l'Accueil, cadres 3b et 3e ; 10 bis C pour le Planning, 3c et 3f) : le gris
 * --o-s3, l'arrondi du thème, sans ombre — et la bordure du réglage
 * « Liserés » (LISERE), qui vaut pour tous les panneaux. Le haut de l'Accueil
 * se rembourre de 18 px ; une liste, sans rembourrage, coupe ce qui déborde de
 * ses coins. */
const PANNEAU_FICHE = { background: 'var(--o-s3)', border: LISERE, borderRadius: 'var(--o-radius,18px)', boxSizing: 'border-box', minWidth: 0 };
const PANNEAU_HAUT = { ...PANNEAU_FICHE, padding: 18 };
const PANNEAU_LISTE = { ...PANNEAU_FICHE, overflow: 'hidden' };
/* Une rangée de la liste, aux rembourrages de la maquette : fixe, 14 px et
 * 18 px ; un bouton d'une ligne, 14 px — 14 à droite, pour son chevron ; une
 * rangée de deux lignes (un sous-titre, ou les − / + de 44 px), 12 px. */
const RANGEE = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, boxSizing: 'border-box', minWidth: 0 };
const RANGEE_FIXE = { ...RANGEE, padding: '14px 18px' };
const RANGEE_DOUBLE = { ...RANGEE, padding: '12px 14px 12px 18px' };
const EN_BOUTON = { width: '100%', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'left' };
const RANGEE_BOUTON = { ...RANGEE, ...EN_BOUTON, padding: '14px 14px 14px 18px' };
const RANGEE_BOUTON_DOUBLE = { ...RANGEE_DOUBLE, ...EN_BOUTON };
const TITRE_RANGEE = { display: 'block', fontSize: 14, fontWeight: 700 };
const SOUS_RANGEE = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 };
const VALEUR_RANGEE = { fontSize: 13, fontWeight: 800 };
// « Reprendre le planning » : un bouton doux, à l'accent, sur toute la largeur — plus le rouge d'avant.
const BOUTON_REPRENDRE = { width: '100%', minHeight: 44, marginTop: 8, padding: '0 12px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 12.5, fontWeight: 700, lineHeight: 1.2, background: 'var(--o-s1)', color: 'var(--o-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 8, textAlign: 'center' };
// Un bouton de la grille des modes : libre, au gris doux ; choisi, le bleu plein et le texte blanc (règle des puces).
const BOUTON_MODE = (on) => ({ minHeight: 44, padding: '0 8px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
  lineHeight: 1.15, background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', gap: 7, textAlign: 'center', overflowWrap: 'anywhere', hyphens: 'auto' });
// − ou + de la rangée « Consigne » : carré de 44 px, arrondi 12, le gris doux, sans bordure ; inerte à .4.
const BOUTON_CARRE = (peut) => ({ width: 44, height: 44, flexShrink: 0, padding: 0, borderRadius: 12, border: 'none', background: 'var(--o-s1)', color: 'var(--o-text1)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: peut ? 1 : 0.4, cursor: peut ? 'pointer' : 'default' });

/* Les modes `hvac` d'un appareil qui sait autre chose que chauffer, dans un
 * ordre stable : chauffer et refroidir d'abord, l'Arrêt en dernier ; un mode
 * que Loggia ne connaît pas, à la fin. */
const ORDRE_HVAC = ['heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only', 'off'];
const enOrdreHvac = (liste) => [...ORDRE_HVAC.filter(m => liste.includes(m)), ...liste.filter(m => !ORDRE_HVAC.includes(m))];
/* Le mot d'un mode `hvac` vient de la coquille (`motHvac`) : celui de la
 * fiche d'avant (`motModeClimat`, App.jsx) — Home Assistant d'abord, sinon
 * Loggia. Sans lui, le mode tel que l'appareil l'écrit. */
const motHvacBrut = (mode) => mode;
/* Le mot d'un préréglage : celui de Home Assistant pour les siens (eco,
 * comfort, away, boost…), sinon tel que l'appareil l'écrit (le `turbo`,
 * l'`overnight` d'un poêle) — la fiche d'avant les montrait tous ainsi. */
const motPreset = (p) => trHA('component.climate.entity_component._.state_attributes.preset_mode.state.' + p) || p;

/* Les fins d'une reprise en main (spec § 9.3, D3) : le prochain changement
 * par défaut — dit par son heure (`quand` : « 22:30 », « demain 07:30 » ;
 * « Changement » quand plus rien ne change) —, sinon 1 h, 2 h, 4 h, ou sans
 * limite, jusqu'à relance : le `fin` de `loggia/chauffage/main`. Une
 * fonction : les mots se lisent au rendu. */
const FINS = (quand) => [
  { id: 'prochain', label: quand || tr('Changement') },
  { id: 60, label: tr('+{h} h', { h: 1 }) },
  { id: 120, label: tr('+{h} h', { h: 2 }) },
  { id: 240, label: tr('+{h} h', { h: 4 }) },
  { id: 'relance', label: tr('Sans limite') },
];

/* ════════════ Les gestes, en messages ════════════ */

/** Une commande `loggia/chauffage/main` pour ce chauffage. */
const messageMain = (ch, quoi) => ({ type: TYPE_MAIN, chauffage: ch.cle, ...quoi });

/**
 * Ce que fait le choix d'un mode dans la fiche. Au planning (`auPlanning` :
 * allumé, et pas en « Observer sans agir »), une reprise en main jusqu'au
 * prochain changement — `{ message }`, la commande du moteur. Sinon l'ordre
 * DIRECT à l'appareil — `{ appels }`, `[domaine, service, données]` dans
 * l'ordre où ils partent : un fil pilote par son `select`, l'option telle que
 * le module l'écrit (`options` de l'état) ; un VTherm par son préréglage,
 * rallumé d'abord s'il est à l'arrêt, ou mis à l'arrêt. Un thermostat n'a pas
 * de modes hors du planning : sa consigne et sa marche. null : rien à envoyer —
 * un mode que le chauffage ne comprend pas, une option que le module n'a pas,
 * un chauffage introuvable (sans entité : le moteur refuserait la reprise).
 */
export function ordreDuMode(ch, mode, st, auPlanning) {
  if (!ch || !Array.isArray(ch.modes) || !ch.modes.includes(mode)) return null;
  const id = ch.entite;
  if (!id) return null;
  if (auPlanning) return { message: messageMain(ch, { mode, fin: 'prochain' }) };
  if (ch.famille === 'fil_pilote') {
    const option = ch.options && ch.options[mode];
    return option ? { appels: [['select', 'select_option', { entity_id: id, option }]] } : null;
  }
  if (ch.famille !== 'vtherm') return null;
  if (mode === 'arret') return { appels: [['climate', 'set_hvac_mode', { entity_id: id, hvac_mode: 'off' }]] };
  const preset = PRESETS_VTHERM[mode];
  if (!preset) return null;
  const chauffe = st && st.state === 'off' ? modeDeChauffe(st.attributes) : null;
  return { appels: [
    ...(chauffe ? [['climate', 'set_hvac_mode', { entity_id: id, hvac_mode: chauffe }]] : []),
    ['climate', 'set_preset_mode', { entity_id: id, preset_mode: preset }],
  ] };
}

/** La reprise en cours, reposée avec une autre fin : le même mode — ou la même
 * consigne, en °C comme le serveur la garde — jusqu'à `fin`. null sans reprise. */
export function messageDeFin(ch, fin) {
  const r = ch && ch.reprise;
  if (!r) return null;
  const quoi = ORDRE_MODES.includes(r.mode) ? { mode: r.mode }
    : typeof r.temperature === 'number' && Number.isFinite(r.temperature) ? { temperature: r.temperature } : null;
  return quoi && messageMain(ch, { ...quoi, fin });
}

/** « Suivre le planning » : la configuration de ce chauffage, son planning allumé ou éteint. */
export function messagePlanning(ch, allume) {
  return { type: 'loggia/chauffage/config', patch: { chauffages: { [ch.cle]: { planning: !!allume } } } };
}

/* ════════════ Ce qui se lit ════════════ */

/* Le mode que l'APPAREIL dit — planning éteint ou en observation : un fil
 * pilote par l'option de son module, un VTherm par son préréglage ; un
 * thermostat n'a que l'Arrêt, sa consigne dit le reste. */
function modeAppareil(ch, st) {
  if (muet(st)) return null;
  if (ch.famille === 'fil_pilote') return modeDuModule(ch.options, st.state);
  if (st.state === 'off') return 'arret';
  if (ch.famille !== 'vtherm') return null;
  const preset = (st.attributes || {}).preset_mode;
  return ORDRE_MODES.find(m => PRESETS_VTHERM[m] === preset) || null;
}

/* Une reprise en cours : celle qui commande, ou celle qu'une fenêtre ouverte
 * couvre — sa fin pas encore passée. */
function repriseEnCours(ch, etat, t) {
  const r = ch.reprise;
  if (!r) return false;
  if (ch.source === 'main' || r.fin == null) return true;
  const fin = Date.parse(r.fin);
  const ref = etat && etat.maintenant ? Date.parse(etat.maintenant) : t;
  return Number.isFinite(fin) && Number.isFinite(ref) && fin > ref;
}

/* La fin qu'une reprise a reçue, relue sur ses deux instants : sans fin,
 * jusqu'à relance ; une, deux ou quatre heures pile après son début, ces
 * durées ; sinon le prochain changement, la fin par défaut (spec § 5.4). */
function finDeLaReprise(r) {
  if (!r) return null;
  if (r.fin == null) return 'relance';
  const ecart = Math.round((Date.parse(r.fin) - Date.parse(r.depuis)) / 60000);
  return [60, 120, 240].includes(ecart) ? ecart : 'prochain';
}

/* La température de la pièce, un nombre : la sonde que la coquille a trouvée
 * — le thermostat se mesure lui-même (`current_temperature`), un module fil
 * pilote par le capteur de sa pièce. Elle s'écrit comme sur la carte, au
 * dixième et un « ° » à part. null sans mesure lisible : jamais un zéro
 * inventé (ADR 0030). */
function mesurePiece(hass, sonde) {
  const st = sonde && hass && hass.states ? hass.states[sonde.id] : null;
  if (!st) return null;
  return mesureLisible(sonde.attribut ? (st.attributes || {})[sonde.attribut] : st.state);
}

/* Une consigne que le serveur garde en °C, dite dans l'unité de la maison. */
const enUnite = (celsius, unite) => nombre(deCelsius(celsius, unite), 1, 0) + ' °' + unite;

/* La date d'un instant ISO, lue dans sa partie MURALE (« 20 oct. »). */
function dateCourte(iso) {
  const m = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) : null;
}

/* Le mode de la maison, dans les mots de la barre « Maison ». */
function motMaison(maison) {
  const m = maison && maison.mode;
  if (m === 'absence') return tr('Absence');
  if (m === 'ete') return tr('Été');
  if (m !== 'vacances') return tr('Planning');
  const date = dateCourte(maison.vacances_fin);
  return date ? tr('Vacances jusqu’au {date}', { date }) : tr('Vacances');
}

/* Le prochain changement dit par son heure — « 22:30 », « demain 07:30 »,
 * « lundi 07:30 » : la puce de la fin d'une reprise, et (sa majuscule en
 * tête) la rangée « Prochain changement ». Le jour s'écrit comme la langue
 * l'écrit au milieu d'une phrase (`jourEnPhrase`, chauffageecran.js — la
 * carte dit « demain » pareil, `finMurale`). Les phrases restent ENTIÈRES au
 * catalogue : « mañana a las 07:30 » ne se fabrique pas en collant deux mots. */
function quandProchain(p) {
  const heure = ecrireHeure(p.minute);
  if (p.dans === 0) return heure;
  return p.dans === 1 ? tr('demain {heure}', { heure }) : tr('{jour} {heure}', { jour: jourEnPhrase(p.jour), heure });
}
// Une valeur en tête de ligne prend sa majuscule : « Demain 07:30 · Hors-gel ».
const capitale = (s) => (s ? s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1) : s);

/* La phrase sous le mode, en haut de l'Accueil (cadre 3b) : ce qui décide,
 * et jusqu'à quand. Au planning : une fenêtre ouverte (« · arrêt
 * automatique », « · éco automatique » — le mode qu'elle impose, tel que
 * l'appareil le REÇOIT, `applique` : un Hors-gel à la place de l'Arrêt se dit
 * « Fenêtre ouverte », sans promettre l'arrêt), la maison hors Planning, une
 * reprise en main par SA fin, sinon le planning jusqu'à son prochain
 * changement — « Planning · toute la semaine » quand plus rien ne change.
 * Plus de « puis {mode} » : la rangée « Prochain changement » le dit. Hors du
 * planning — éteint ou observé — : la fenêtre d'abord, ouverte et l'appareil
 * à l'Arrêt (`eteint`) — la règle des fenêtres l'a coupé (relecture de la
 * partie B), sauf quand elle OBSERVE : le serveur pose le fait « ouverte »
 * même en observation, et elle n'a rien coupé (relecture de la partie D) ;
 * sinon « Éteint » à l'Arrêt, « Manuel · planning désactivé », ou
 * l'observation. La fin se lit dans la partie MURALE de son instant, le jour
 * comparé à « maintenant » à l'horloge de la maison (`finMurale`, `ref`) ;
 * illisible, elle ne s'invente pas. */
function phraseDuHaut(ch, etat, ref, auPlanning, eteint) {
  if (!auPlanning) {
    if (eteint && ch.fenetre_ouverte === true && !(etat && etat.fenetres_observe)) return tr('Fenêtre ouverte · arrêt automatique');
    if (eteint) return tr('Éteint');
    return ch.planning === true ? tr('{a} : {b}', { a: tr('Planning'), b: tr('Observer sans agir') }) : tr('Manuel · planning désactivé');
  }
  if (ch.source === 'fenetre') {
    const recu = ch.applique || ch.mode;
    return recu === 'eco' ? tr('Fenêtre ouverte · éco automatique') : recu === 'arret' ? tr('Fenêtre ouverte · arrêt automatique') : tr('Fenêtre ouverte');
  }
  if (ch.source === 'maison') return tr('{a} : {b}', { a: tr('Maison'), b: motMaison(etat && etat.maison) });
  if (ch.source === 'main') {
    const fin = ch.reprise ? ch.reprise.fin : ch.fin;
    if (fin == null) return tr('À la main jusqu’à relance');
    const f = finMurale(fin, ref);
    if (!f) return tr('À la main');
    const mots = { heure: f.heure, jour: f.jour };
    return f.demain ? tr('À la main jusqu’à demain {heure}', mots) : f.jour ? tr('À la main jusqu’à {jour} {heure}', mots) : tr('À la main jusqu’à {heure}', mots);
  }
  if (ch.fin == null) return tr('Planning · toute la semaine');
  const f = finMurale(ch.fin, ref);
  if (!f) return tr('Planning');
  const mots = { heure: f.heure, jour: f.jour };
  return f.demain ? tr('Planning · jusqu’à demain {heure}', mots) : f.jour ? tr('Planning · jusqu’à {jour} {heure}', mots) : tr('Planning · jusqu’à {heure}', mots);
}

/* « Bureau · fil pilote », « Salon · thermostat » : la ligne sous le nom de
 * l'en-tête (tâche 10 bis B) — la pièce, puis le type. Un VTherm, une
 * climatisation disent « thermostat », comme le serveur les range. Sans pièce
 * connue, le type seul. */
function typeDuChauffage(ch, piece) {
  const filPilote = ch.famille === 'fil_pilote';
  if (!piece) return filPilote ? tr('Fil pilote') : tr('Thermostat');
  return filPilote ? tr('{piece} · fil pilote', { piece }) : tr('{piece} · thermostat', { piece });
}

/* La plaque de l'en-tête (tâche 10 bis B) : celle de la carte, par la même
 * règle (`plaqueMode`, chauffageecran.js) et les mêmes lectures. Un fil
 * pilote : le glyphe `heat` ; sa chauffe MESURÉE par le capteur de puissance
 * que lit sa carte (`puissance`, passé par la coquille : plus de 10 W), même
 * à l'Arrêt ; éteinte à l'Arrêt ou muet ; sinon la teinte de son mode — celui
 * que le moteur applique au planning (`applique`), celui de son module hors
 * du planning. Un `climate` — thermostat, VTherm, climatisation — :
 * `thermometer-half`, sa chauffe (`hvac_action`), son froid, éteinte à
 * l'arrêt ou muet ; jamais de mode. L'icône choisie pour sa carte, la
 * coquille la pose par-dessus (`glyphe`, FicheChauffageContent). */
function plaqueDuChauffage(ch, hass, puissance, simulation) {
  const S = (hass && hass.states) || {};
  const st = ch.entite ? S[ch.entite] || null : null;
  if (ch.famille === 'fil_pilote') {
    const muetModule = moduleMuet(st);
    const mode = ch.planning === true && !simulation ? ch.applique || ch.mode : muetModule ? null : modeDuModule(ch.options, st.state);
    const watts = puissance && S[puissance] ? wattsDe(S[puissance]) : null;
    const [fond, encre] = plaqueMode({ chauffe: enChauffe({ famille: 'module', muet: muetModule, watts }), eteint: muetModule || mode === 'arret', mode });
    return { icone: 'heat', fond, encre };
  }
  const mort = muet(st);
  const a = (st && st.attributes) || {};
  const marche = !mort && st.state !== 'off';
  const [fond, encre] = plaqueMode({ chauffe: enChauffe({ famille: 'thermostat', muet: mort, marche, action: a.hvac_action }),
    froid: marche && a.hvac_action === 'cooling', eteint: !marche });
  return { icone: 'thermometer-half', fond, encre };
}

/* Maintenant à l'horloge de la maison, [jour, minute] : celle du serveur, à
 * défaut celle du navigateur. */
function minuteMurale(etat, t) {
  if (etat && Array.isArray(etat.minute) && etat.minute.length === 2) return etat.minute;
  const d = new Date(t);
  return [(d.getDay() + 6) % 7, d.getHours() * 60 + d.getMinutes()];
}

/* Vivant tant que l'onglet est monté : une réponse revenue après sa fermeture
 * ne touche plus à son état. */
function useVivant() {
  const vivant = useRef(true);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);
  return vivant;
}

/* ════════════ Les briques ════════════ */

/* Le point d'un mode : sa couleur n'est qu'un POINT (règle des puces), jamais
 * la teinte d'une puce ni d'une ligne. Sur le bleu plein, un anneau blanc. */
const Point = ({ mode, anneau = false }) => (
  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: couleurMode(mode), boxShadow: anneau ? '0 0 0 2px #fff' : 'none' }} />
);

/* Un groupe de puces segmenté, dans le puits (tests/puces_segmentees.test.mjs) :
 * la puce choisie en bleu plein, texte blanc ; la couleur d'un mode, s'il en
 * a une (`point`), n'est qu'un point. Nommé par `nom`, ou par le libellé
 * visible qui le précède (`idNom`). Quatre puces se rangent par deux, les
 * autres par trois : « Ochrona przed zamarzaniem » passe à la ligne dans sa
 * puce plutôt que d'en sortir. `options` : `[{ id, label, point?, ident? }]`,
 * `ident` l'identifiant de la puce (le focus y revient). */
function Puces({ nom = null, idNom = null, options, choisi, onChoisir }) {
  const colonnes = options.length === 4 ? 2 : Math.min(3, options.length);
  return (
    <div role="group" aria-label={idNom ? undefined : nom} aria-labelledby={idNom || undefined}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(' + colonnes + ', minmax(0, 1fr))', gap: 4, padding: 4, borderRadius: 12, background: 'var(--o-well)' }}>
      {options.map(o => {
        const on = o.id === choisi;
        return (
          <button key={o.id} id={o.ident} type="button" aria-pressed={on} onClick={() => { if (!on) onChoisir(o.id); }}
            style={{ minHeight: 38, padding: '7px 8px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, lineHeight: 1.15,
              background: on ? 'var(--o-accent-fond)' : 'transparent', color: on ? '#fff' : 'var(--o-text1)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, textAlign: 'center', overflowWrap: 'anywhere', hyphens: 'auto' }}>
            {o.point && <Point mode={o.point} anneau={on} />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

/* Les modes du chauffage (cadre 3b), du plus froid au plus chaud — l'ordre de
 * − et + sur la carte —, 16 px sous ce qui précède : une grille de trois
 * colonnes, écart 8. Ce n'est PAS un groupe segmenté dans sa maquette : des
 * boutons libres au gris doux, hors du puits ; le point du mode puis son mot,
 * 7 px d'écart ; le choisi en bleu plein, texte blanc, son point cerclé de
 * blanc. Chaque bouton garde son identifiant (`{idBase}-mode-{mode}`) : le
 * focus y revient après « Reprendre le planning ». Un mot long passe à la
 * ligne dans son bouton, jamais tronqué (« Ochrona przed zamarzaniem »). */
function GrilleModes({ idBase, modes, choisi, onChoisir }) {
  const liste = ORDRE_MODES.filter(m => modes.includes(m));
  if (!liste.length) return null;
  return (
    <div role="group" aria-label={tr('Mode')} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 16 }}>
      {liste.map(m => {
        const on = m === choisi;
        return (
          <button key={m} id={idBase + '-mode-' + m} type="button" aria-pressed={on} onClick={() => { if (!on) onChoisir(m); }} style={BOUTON_MODE(on)}>
            <Point mode={m} anneau={on} /><span style={{ minWidth: 0 }}>{motMode(m)}</span>
          </button>
        );
      })}
    </div>
  );
}

/* − et + carrés de 44 px de la rangée « Consigne » et des bornes d'une plage
 * (cadre 3e), et des températures des modes dans le Planning (tâche 10 bis C)
 * — le dessin des cartes 1a : glyphes de 16 px, inertes à .4 ; au milieu la
 * valeur, 17 px / 800, 64 px au moins, au gris tertiaire quand l'appareil est
 * éteint. LOCAL à la fiche : `PasAPas`, partagé avec le robot et le
 * distributeur, ne change pas. `nom` : ce qu'il règle, en tête des noms de ses
 * deux boutons (« Consigne : Moins »). Inerte, un bouton reste focalisable
 * (`aria-disabled`, et son clic ne fait rien) : avec `disabled`, celui qui
 * atteignait sa borne sous le doigt laissait tomber le focus sur <body>
 * (relecture de la partie C). */
function PasCarre({ nom, valeur, peutMoins, peutPlus, moins, plus, eteint = false }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <button type="button" aria-disabled={peutMoins ? undefined : true} onClick={() => { if (peutMoins) moins(); }} aria-label={tr('{a} : {b}', { a: nom, b: tr('Moins') })}
        style={BOUTON_CARRE(peutMoins)}>
        <Fi i="minus-small" size={16} />
      </button>
      <span style={{ minWidth: 64, textAlign: 'center', fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap', color: eteint ? 'var(--o-text3)' : 'var(--o-text)' }}>{valeur}</span>
      <button type="button" aria-disabled={peutPlus ? undefined : true} onClick={() => { if (peutPlus) plus(); }} aria-label={tr('{a} : {b}', { a: nom, b: tr('Plus') })}
        style={BOUTON_CARRE(peutPlus)}>
        <Fi i="plus-small" size={16} />
      </button>
    </span>
  );
}

/* Un groupe de puces sous son libellé visible, qui le nomme : les modes et
 * les préréglages d'un appareil, ce que fait une fenêtre ouverte. */
function PucesNommees({ id, libelle, options, choisi, onChoisir }) {
  return (
    <div>
      <div id={id} style={{ ...PETITES_CAPITALES, marginBottom: 8 }}>{libelle}</div>
      <Puces idNom={id} options={options} choisi={choisi} onChoisir={onChoisir} />
    </div>
  );
}

/* Ce qui empêche le planning d'agir, une ligne chacun, sur le modèle du liseré
 * de panne de l'en-tête (`EnteteFiche`, ADR 0048) : un liseré, aucune autre
 * couleur. Introuvable, injoignable, module coupé — et un VTherm qui s'est mis
 * de lui-même en sécurité ou en délestage (son préréglage, lu dans Home
 * Assistant) : il commande seul tant qu'il y est, le moteur attend
 * (chauffage.py). Et le programme de l'APPAREIL allumé (le chrono d'un poêle,
 * `programme`, nommé comme Home Assistant le nomme) : il change les réglages
 * lui-même, le planning n'est pas seul à commander (audit du 19/10). */
function Avertissements({ ch, st, etats = {}, rate = false }) {
  const av = Array.isArray(ch.avertissements) ? ch.avertissements : [];
  const preset = ch.famille === 'vtherm' && st && st.attributes ? st.attributes.preset_mode : null;
  const prog = typeof ch.programme === 'string' && ch.programme ? ch.programme : null;
  const nomProg = prog ? (((etats[prog] || {}).attributes || {}).friendly_name || prog) : '';
  const lignes = [
    // Le moteur a raté son démarrage : il ne commande rien, la fiche commande l'appareil (audit du 19/10).
    rate && ['demarrage', 'triangle-warning', tr('Le planning de chauffe n’a pas démarré : il ne commande rien. Redémarrez Home Assistant.')],
    av.includes('introuvable') && ['introuvable', 'search-alt', tr('Introuvable dans Home Assistant : renommé ou retiré ?')],
    av.includes('injoignable') && ['injoignable', 'wifi-slash', tr('Ce chauffage ne répond plus.')],
    av.includes('module_coupe') && ['module_coupe', 'power', tr('Module coupé : le planning ne peut rien')],
    av.includes('commande_par') && ['commande_par', 'link',
      ch.commande_par ? tr('Commandé par « {nom} » : son planning passe par lui.', { nom: ((etats[ch.commande_par] || {}).attributes || {}).friendly_name || ch.commande_par })
        : tr('Commandé par un autre thermostat : son planning passe par lui.')],
    av.includes('puissance_fixe') && ['puissance_fixe', 'settings-sliders', tr('Mode manuel : il chauffe à puissance fixe, la consigne et le planning n’ont pas d’effet. Repassez-le en Auto dans son application.')],
    av.includes('refroidit') && ['refroidit', 'snowflake', tr('Il refroidit : le planning de chauffe attend qu’il repasse en chauffe.')],
    av.includes('programme_concurrent') && ['programme_concurrent', 'calendar-clock',
      tr('Un autre programme le commande déjà ({noms}) : coupez-le pour que le planning commande seul.',
        { noms: (Array.isArray(ch.concurrents) ? ch.concurrents : []).map(c => '« ' + (c && c.nom) + ' »').join(', ') })],
    av.includes('programme_appareil') && ['programme_appareil', 'calendar-clock',
      tr('Son programme « {nom} » est allumé : il change les réglages lui-même. Coupez-le pour que le planning commande seul.', { nom: nomProg })],
    SECURITE_VTHERM.includes(preset) && ['securite', 'shield-exclamation', tr('Sécurité : la sonde de température ne répond plus, VTherm chauffe seul.')],
    preset === DELESTAGE_VTHERM && ['delestage', 'bolt', tr('Délestage : la maison consomme trop, VTherm suspend la chauffe.')],
  ].filter(Boolean);
  return lignes.map(([cle, icone, texte]) => (
    <div key={cle} className="o-panne" role="status" data-avertissement={cle}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 14, fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>
      <Fi i={icone} size={14} color="var(--o-text2)" /><span style={{ minWidth: 0 }}>{texte}</span>
    </div>
  ));
}

/* ════════════ L'accueil ════════════ */

/**
 * L'Accueil (cadres 3b et 3e de sa maquette, tâche 10 bis B). En haut, le
 * mode en grand — ou ce que fait un thermostat hors du planning —, ce qui
 * décide, la pièce ; une reprise et ses fins ; la grille des modes. À côté
 * d'un appareil qui refroidit, ses modes, ses préréglages et sa plage. Puis la
 * liste. `onOnglet(id)` ouvre un onglet de la fiche (« Prochain changement »,
 * « Planning ») ; `ordinaire` : un compte sans droit sur la configuration de
 * Loggia (ADR 0144) — la fenêtre ne s'y déplie pas.
 */
function OngletAccueil({ idBase, hass, ch, etat, sonde, onFiche, onOnglet = null, ordinaire = false, simulation, minute, t, motHvac = motHvacBrut }) {
  const S = (hass && hass.states) || {};
  const st = ch.entite ? S[ch.entite] || null : null;
  const a = (st && st.attributes) || {};
  const mort = muet(st);
  // Une pompe à chaleur qui refroidit : le moteur attend, la fiche commande l'appareil (audit du 19/10).
  const auPlanning = ch.planning === true && !simulation && !refroidit(ch);
  // Aujourd'hui, à l'horloge de la maison : celle du serveur, à défaut celle du navigateur.
  const ref = etat && etat.maintenant ? etat.maintenant : t;
  const vivant = useVivant();
  const [err, setErr] = useState('');

  /* Le mode : au planning, celui que le moteur applique — tel que l'appareil
   * le REÇOIT (`applique` : un module sans Éco reçoit son Hors-gel ; sans ce
   * champ, un serveur d'avant, le mode voulu) ; sinon, celui que l'appareil
   * dit. La réponse du moteur EST l'état : elle remplace l'avance aussitôt ;
   * un refus la retire. */
  const modeLu = auPlanning ? ch.applique || ch.mode : modeAppareil(ch, st);
  const [ovMode, poserOvMode] = useOptimiste(modeLu);
  const mode = ovMode != null ? ovMode : modeLu;
  /* La consigne d'un thermostat, telle que l'appareil la publie, dans l'unité
   * de la maison (ADR 0128). */
  const uT = uniteTemp(a, hass);
  const consigneLue = ch.famille === 'thermostat' ? consigneClimat(a) : null;
  const [ovT, poserOvT] = useOptimiste(consigneLue);
  const consigne = ovT != null ? ovT : consigneLue;
  /* Son mode `hvac`, hors du planning : sa marche, et le mode choisi d'un
   * appareil qui sait autre chose que chauffer. */
  const etatLu = st ? st.state : null;
  const [ovHvac, poserOvHvac] = useOptimiste(etatLu);
  const hvac = ovHvac != null ? ovHvac : etatLu;
  const marche = !!st && hvac !== 'off';
  // Son préréglage (le `turbo` d'un poêle), et sa plage en `heat_cool` — sans consigne unique.
  const presetLu = a.preset_mode && a.preset_mode !== 'unknown' ? a.preset_mode : null;
  const [ovPreset, poserOvPreset] = useOptimiste(presetLu);
  const preset = ovPreset != null ? ovPreset : presetLu;
  const plageLue = ch.famille === 'thermostat' && consigneLue == null ? plageClimat(a) : null;
  const [ovPlage, poserOvPlage] = useOptimiste(plageLue ? plageLue.bas + '|' + plageLue.haut : null);
  const plage = ovPlage || plageLue;
  /* Ce que fait une fenêtre ouverte — le réglage de l'ancien onglet Réglages,
   * qui se déplie maintenant dans sa rangée (« le réglage de la fenêtre
   * s'ouvre dans sa ligne », cadre 3b) —, montré d'avance ; et la rangée
   * dépliée ou non. */
  const fenetreLue = ch.fenetre || 'arret';
  const [ovF, poserOvF] = useOptimiste(fenetreLue);
  const fenetre = ovF != null ? ovF : fenetreLue;
  const [deplie, setDeplie] = useState(false);

  // Ce que le moteur rend : le nouvel état — ou null, refusé (le refus dit, l'avance retirée).
  const echouer = (annuler) => (e) => { if (annuler) annuler(); if (vivant.current) setErr(raisonEchec(e)); return null; };
  const auMoteur = (message, annuler) => {
    setErr('');
    return commanderChauffage(hass, message).then((nouvel) => nouvel || {}, echouer(annuler));
  };
  const choisir = (m) => {
    const ordre = ordreDuMode(ch, m, st, auPlanning);
    if (!ordre) return;
    if (ordre.message) {
      poserOvMode(m);
      auMoteur(ordre.message, () => poserOvMode(null)).then(ok => { if (ok && vivant.current) poserOvMode(null); });
      return;
    }
    // L'appareil, appel par appel ; un appel refusé se dit au toast commun, comme sur la carte.
    const partis = ordre.appels.map(([domaine, service, data]) => commanderService(hass, ch.entite, domaine, service, data));
    if (partis.every(x => x != null)) poserOvMode(m);
  };
  /* − / + d'un thermostat. Au planning, la consigne visée part en reprise en
   * main, en °C (le serveur ne parle qu'en Celsius) : d'un cran du pas que
   * l'appareil appliquera (`consigneVoisine`), dans ses bornes. Une consigne
   * qui ne bouge pas — une borne — ne pose pas de reprise : le chauffage
   * quitterait son planning pour rien (comme la carte). Hors du planning,
   * l'appareil, comme sa fiche d'avant. */
  const minT = Number(a.min_temp), maxT = Number(a.max_temp);
  const peutBaisser = consigne != null && !(a.min_temp != null && Number.isFinite(minT) && consigne <= minT);
  const peutMonter = consigne != null && !(a.max_temp != null && Number.isFinite(maxT) && consigne >= maxT);
  const regler = (sens) => {
    if (consigne == null || !ch.entite) return;
    if (auPlanning) {
      const vise = consigneVoisine(consigne, sens, a, uT);
      const p = vise != null && planAction(ch.entite, 'set_temperature', vise, actionCtx(hass));
      if (!p || !p.ok || p.data.temperature === consigne) return;
      poserOvT(p.data.temperature);
      auMoteur(messageMain(ch, { temperature: versCelsius(p.data.temperature, uT), fin: 'prochain' }), () => poserOvT(null));
      return;
    }
    // Un vrai cran du pas de l'appareil : ± 0,5 arrondi au degré retombait sur la même consigne (audit du 19/10).
    const v = commander(hass, ch.entite, 'set_temperature', consigneVoisine(consigne, sens, a, uT) ?? consigne + sens * 0.5, 'temperature');
    if (v != null) poserOvT(v);
  };
  // Hors du planning, l'appareil directement, comme sa fiche d'avant : son mode, sa marche, son préréglage.
  const choisirHvac = (m) => { if (commander(hass, ch.entite, 'set_hvac_mode', m) != null) poserOvHvac(m); };
  const basculer = () => choisirHvac(marche ? 'off' : modeDeChauffe(a) || modesHvac(a).find(m => m !== 'off') || 'heat');
  const choisirPreset = (p) => { if (commander(hass, ch.entite, 'set_preset_mode', p) != null) poserOvPreset(p); };
  /* Une borne de la plage, d'un pas de l'appareil : les DEUX partent
   * ensemble, Home Assistant ne prend pas l'une sans l'autre. */
  const reglerPlage = (bord, sens) => {
    const p = plageVoisine(plage, bord, sens, a, uT);
    if (!p || !ch.entite) return;
    commanderService(hass, ch.entite, 'climate', 'set_temperature', { entity_id: ch.entite, target_temp_low: p.bas, target_temp_high: p.haut });
    poserOvPlage(p);
  };

  /* Ce que fait une fenêtre ouverte, réglé : la configuration de Loggia, pour
   * un administrateur — l'avance retirée au refus, et le refus dit. */
  const choisirFenetre = (v) => {
    poserOvF(v);
    setErr('');
    commanderChauffage(hass, messageFenetre(ch, v)).catch((e) => { poserOvF(null); if (vivant.current) setErr(raisonEchec(e)); });
  };

  /* La reprise en cours : son mode — ou sa consigne —, ses fins en puces (le
   * prochain changement dit par son heure, 1, 2, 4 h, sans limite), et
   * « Reprendre le planning · {mode} ». */
  const enReprise = auPlanning && repriseEnCours(ch, etat, t);
  const r = ch.reprise || {};
  const uMaison = uniteTemp(null, hass);
  const consigneReprise = typeof r.temperature === 'number' && Number.isFinite(r.temperature) ? enUnite(r.temperature, uMaison) : null;
  const changerFin = (fin) => { const m = messageDeFin(ch, fin); if (m) auMoteur(m); };
  /* « Reprendre le planning » part avec la reprise : son bouton démonté, le
   * focus tombait sur <body> (règle du 05/10, `focaliser`). Il va au bouton
   * du mode que le planning reprend, dans la grille, lu dans la réponse —
   * sinon à l'onglet. Refusé, le bouton reste, et le focus avec lui. */
  const rendre = () => auMoteur(messageMain(ch, { reprendre: true })).then((nouvel) => {
    if (!nouvel) return;
    const apres = Array.isArray(nouvel.chauffages) ? nouvel.chauffages.find(c => c && c.cle === ch.cle) : null;
    // Le bouton que la grille choisit : celui du mode appliqué.
    const vise = apres ? apres.applique || apres.mode : null;
    focaliser(vise ? idBase + '-mode-' + vise : null, idBase + '-t-accueil');
  });

  /* Les commandes : la grille des modes au planning, ou hors du planning pour
   * ce qui en a (un fil pilote, un VTherm) ; la consigne et la marche d'un
   * thermostat hors du planning, sa consigne seule au planning. Un appareil
   * muet ne se commande pas en direct (ADR 0048). */
  const modesPuces = auPlanning || !mort ? (ch.modes || []).filter(m => ordreDuMode(ch, m, st, auPlanning)) : [];
  const thermostat = ch.famille === 'thermostat';
  /* Hors du planning, un thermostat se commande comme sa fiche d'avant (son
   * choix du 11/10) : les modes d'un appareil qui sait autre chose que
   * chauffer (une climatisation, une pompe à chaleur réversible), ses
   * préréglages, sa plage en `heat_cool` — dans leur panneau, au dessin des
   * autres. Au planning, rien de cela : le planning commande. */
  const libre = thermostat && !auPlanning && !mort;
  const hvacs = libre ? enOrdreHvac(modesHvac(a)) : [];
  const montrerHvac = hvacs.some(m => m !== 'off' && m !== 'heat');
  const presets = libre && Array.isArray(a.preset_modes) ? a.preset_modes.filter(p => typeof p === 'string' && p).slice(0, 8) : [];
  const montrerPlage = libre && !!plage;
  const montrerConsigne = thermostat && (auPlanning || !mort) && !montrerPlage;
  const montrerMarche = libre;

  /* Le haut. Un thermostat hors du planning (cadre 3e) dit en grand ce qu'il
   * FAIT — « Éteint », « Chauffe » à l'orange, « Refroidit » au bleu, « Au
   * repos » — et dessous ce qu'il vise : « Vers 22,0° », « Consigne
   * atteinte » (la règle de mesure de la carte, `consigneAtteinte`), ou que
   * sa consigne est gardée pour le rallumage. Sinon (cadre 3b) — un fil
   * pilote, un VTherm, un thermostat au planning — le mode, à son encre
   * (`encreMode` : les trois Confort à l'orange PLEIN), et la phrase de ce qui
   * décide (`phraseDuHaut`), à l'ambre quand une fenêtre coupe. La fenêtre
   * d'abord, hors du planning aussi : ouverte, l'appareil à l'Arrêt, c'est la
   * règle des fenêtres qui l'a coupé (relecture de la partie B) — sauf quand
   * elle OBSERVE : elle n'a rien coupé, le haut ne le lui attribue pas, et la
   * rangée ne le promet pas (relecture de la partie D). */
  const coupeeParLaRegle = ch.fenetre_ouverte === true && !(etat && etat.fenetres_observe);
  let grand = '—', encre = 'var(--o-text3)', sous = null, encreSous = 'var(--o-text2)', modeGrand = null;
  if (thermostat && !auPlanning) {
    const action = marche ? a.hvac_action : null;
    const chauffe = enChauffe({ famille: 'thermostat', muet: mort, marche, action });
    if (mort) grand = tr('Indisponible');
    else if (!marche && coupeeParLaRegle) {
      grand = tr('Éteint'); encre = 'var(--o-text2)'; sous = tr('Fenêtre ouverte · arrêt automatique'); encreSous = 'var(--o-warn)';
    } else if (!marche) { grand = tr('Éteint'); encre = 'var(--o-text2)'; sous = tr('La consigne est gardée pour le rallumage'); }
    else if (chauffe || action === 'cooling') {
      grand = chauffe ? tr('Chauffe') : tr('Refroidit');
      encre = chauffe ? 'var(--o-warn2)' : 'var(--o-cold)';
      sous = consigne != null ? tr('Vers {t}°', { t: nombre(consigne, 1) }) : null;
    } else {
      grand = tr('Au repos');
      encre = 'var(--o-text)';
      sous = consigne != null && consigneAtteinte(a.current_temperature, consigne, hvac, uT) ? tr('Consigne atteinte') : null;
    }
  } else {
    if (!auPlanning && mort) grand = tr('Indisponible');
    else if (motMode(mode)) { grand = motMode(mode); encre = encreMode(mode); modeGrand = mode; }
    // Un thermostat revenu à SON programme (Tado, Netatmo) : il le suit jusqu'au prochain changement (19/10).
    else if (auPlanning && ch.source === 'main' && r.programme === true) { grand = tr('Son programme'); encre = 'var(--o-text)'; }
    else if (auPlanning && consigneReprise && ch.source === 'main') { grand = consigneReprise; encre = encreMode('confort'); }
    const eteint = !mort && mode === 'arret';
    sous = phraseDuHaut(ch, etat, ref, auPlanning, eteint);
    const parLaFenetre = auPlanning ? ch.source === 'fenetre' : eteint && coupeeParLaRegle;
    encreSous = parLaFenetre ? 'var(--o-warn)' : 'var(--o-text2)';
  }
  const mesure = mesurePiece(hass, sonde);

  /* Le prochain changement du planning, deux fois. La rangée « Prochain
   * changement » le dit, avec sa majuscule et son mode, sur la semaine que la
   * maison laisse (Été, Vacances, Absence appliqués). La puce « prochain »
   * d'une reprise dit l'heure où le SERVEUR la finira : son
   * `prochain_changement`, sur la semaine BRUTE, sans la maison (relecture de
   * la partie B) — en Été, une reprise finit encore au 23:00 de la semaine.
   * Et le mode que le planning a MAINTENANT, que « Reprendre » nomme : la
   * bande de la journée du serveur (`jour`, la maison appliquée) qui couvre
   * cette minute. Les deux modes se disent tels que l'appareil les RECEVRA
   * (`modeApplique`, le jumeau de `mode_applicable` — relecture de la partie
   * B, point d) : l'Éco d'un module qui n'en a pas est son Hors-gel. Le
   * prochain changement se CHERCHE aussi sur la semaine appliquée, ses
   * voisines pareilles fondues (`bandesAppliquees`, relecture de la partie D) :
   * le Hors-gel de 22:00 qui suit une Éco reçue en Hors-gel n'en est pas un. */
  const prochain = auPlanning ? prochainDeLaSemaine(bandesAppliquees(bandesSemaine(ch.semaine, etat && etat.maison), ch), minute[0], minute[1]) : null;
  const finBrute = enReprise ? prochainDeLaSemaine(bandesSemaine(ch.semaine, null), minute[0], minute[1]) : null;
  const quand = prochain ? quandProchain(prochain) : null;
  const quandFin = finBrute ? quandProchain(finBrute) : null;
  const modeProchain = prochain ? prochain.mode : null;
  const bandeMaintenant = Array.isArray(ch.jour) ? ch.jour.find(b => b && b.de <= minute[1] && minute[1] < b.a) : null;
  const repris = bandeMaintenant ? motMode(modeApplique(ch, bandeMaintenant.mode)) : null;

  /* La fenêtre (cadre 3b) : ouverte ou fermée, et ce qu'elle fait à
   * l'ouverture. La rangée ne vient que si la règle des fenêtres SURVEILLE ce
   * chauffage : le serveur dit alors `ouvrant_ouvert` et `fenetre_ouverte`,
   * vrais ou faux ; null sinon — une pièce qu'elle ne suit pas n'a pas de
   * protection à promettre (relecture de la partie B, point 1). « Ouverte » se
   * lit sur l'OUVRANT tel qu'il est (`ouvrant_ouvert`) — une fenêtre qu'on
   * vient d'ouvrir se voit tout de suite, avant le délai de la règle — OU sur
   * le fait de la règle (`fenetre_ouverte`), qui seul fait dire au haut
   * « arrêt automatique » (seconde relecture, point b) : un capteur d'ouvrant
   * muet se lit « fermé » pendant que la règle garde la coupure — « Fermée »
   * au vert sous un haut qui dit l'arrêt se contredisait (relecture de la
   * partie D). Ce qu'elle fait dépend de qui commande (point 2) :
   *  - au planning, le moteur applique son réglage, dit par le mode que CET
   *    appareil recevra (`fenetre_mode` : l'Arrêt d'un thermostat sans `off`
   *    est son Hors-gel ; null, rien ne se passera) — un réglage en vol, par
   *    lui-même : les puces n'offrent que ce qu'il comprend. Il se déplie
   *    dessous pour un administrateur : Arrêt et Éco seulement s'il les
   *    comprend — sinon le moteur appliquerait un repli, et la rangée
   *    mentirait —, ou ne rien faire ; un poêle à granulés gagne à l'Éco (le
   *    conseil : un thermostat qui le comprend, et qui ne refroidit pas). La
   *    puce de l'Arrêt se nomme TOUJOURS de ce que l'appareil recevra (le
   *    jumeau, `modeApplique(ch, 'arret')`), quel que soit le réglage en cours :
   *    « Hors-gel » pour un appareil qui ne s'éteint pas — elle reste là quand
   *    on la quitte, le Hors-gel reste atteignable (point e, relecture de la
   *    partie D) ; si c'est l'Éco, elle se fond dans la puce Éco ;
   *  - hors du planning — éteint, ou le moteur en observation —, c'est la
   *    RÈGLE qui coupe, en lecture : « À l’ouverture : Arrêt » seulement si
   *    elle agira vraiment — pas en « Observer sans agir » (`fenetres_observe`),
   *    pas pour un appareil qui ne comprend pas l'Arrêt (point a) ; sinon rien
   *    n'est promis. */
  const aFenetre = typeof ch.ouvrant_ouvert === 'boolean' || typeof ch.fenetre_ouverte === 'boolean';
  const ouverte = ch.ouvrant_ouvert === true || ch.fenetre_ouverte === true;
  const modes = Array.isArray(ch.modes) ? ch.modes : [];
  const sansArret = !modes.includes('arret');
  const recoitArret = modeApplique(ch, 'arret');
  const choixFenetre = [
    ...(recoitArret && recoitArret !== 'eco' && motMode(recoitArret) ? [{ id: 'arret', label: motMode(recoitArret) }] : []),
    ...(modes.includes('eco') ? [{ id: 'eco', label: tr('Éco') }] : []),
    { id: 'rien', label: tr('Ne rien faire') },
  ];
  const choisiFenetre = fenetre === 'arret' && recoitArret === 'eco' ? 'eco' : fenetre;
  const conseil = thermostat && modes.includes('eco') && !modesHvac(a).some(m => m === 'cool' || m === 'heat_cool');
  const modeOuverture = fenetre === 'rien' ? null : ovF == null && ch.fenetre_mode !== undefined ? ch.fenetre_mode : fenetre;
  const motOuverture = modeOuverture ? motMode(modeOuverture) : null;
  const regleAgira = !(etat && etat.fenetres_observe) && !sansArret;
  const sousFenetre = auPlanning
    ? (motOuverture ? tr('À l’ouverture : {mode}', { mode: motOuverture }) : tr('À l’ouverture : ne rien faire'))
    : regleAgira ? tr('À l’ouverture : {mode}', { mode: motMode('arret') }) : null;
  const fenetreReglable = auPlanning && !ordinaire;

  /* La liste (cadres 3b et 3e), dans cet ordre : la consigne et la marche
   * d'un thermostat, le prochain changement (au planning), la fenêtre, le
   * mode de la maison (au planning), le planning d'un thermostat, l'appareil. */
  const appareil = !!(onFiche && ch.entite);
  const versPlanning = () => { if (onOnglet) onOnglet('planning'); };
  const valeurPlanning = !estSemaine(ch.semaine) ? tr('Aucun') : ch.planning !== true ? tr('Éteint') : simulation ? tr('Observer sans agir') : tr('Actif');
  const cles = [
    montrerConsigne && 'consigne',
    montrerMarche && 'marche',
    prochain && 'prochain',
    aFenetre && 'fenetre',
    auPlanning && 'maison',
    thermostat && 'planning',
    appareil && 'appareil',
  ].filter(Boolean);
  const valeurFenetre = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, fontSize: 13, fontWeight: 800, color: ouverte ? 'var(--o-warn)' : 'var(--o-ok)' }}>
      {ouverte ? tr('Ouverte') : tr('Fermée')}
      {fenetreReglable && <Fi i={deplie ? 'angle-small-up' : 'angle-small-down'} size={16} color="var(--o-text3)" />}
    </span>
  );
  // Le titre de la rangée, et ce qu'elle fait à l'ouverture quand il y a quelque chose à promettre.
  const titreFenetre = (id) => (
    <span style={{ minWidth: 0 }}>
      <span id={id} style={TITRE_RANGEE}>{tr('Fenêtre')}</span>
      {sousFenetre && <span style={SOUS_RANGEE}>{sousFenetre}</span>}
    </span>
  );
  // Une rangée, son filet au-dessus (`f`) : aucun pour la première.
  const rangee = (cle, f) => {
    if (cle === 'consigne') {
      return (
        <div key={cle} data-rangee={cle} style={{ ...RANGEE_DOUBLE, borderTop: f }}>
          <span style={TITRE_RANGEE}>{tr('Consigne')}</span>
          <PasCarre nom={tr('Consigne')} valeur={consigne != null ? nombre(consigne, 1) + '°' : '—'} eteint={!marche}
            peutMoins={peutBaisser} peutPlus={peutMonter} moins={() => regler(-1)} plus={() => regler(1)} />
        </div>
      );
    }
    if (cle === 'marche') {
      return (
        <div key={cle} data-rangee={cle} style={{ ...RANGEE_FIXE, borderTop: f }}>
          <span style={{ minWidth: 0 }}>
            <span style={TITRE_RANGEE}>{tr('En marche')}</span>
            <span style={SOUS_RANGEE}>{tr('Coupe la zone sans toucher à la consigne')}</span>
          </span>
          <Bascule on={marche} nom={tr('En marche')} cb={basculer} />
        </div>
      );
    }
    if (cle === 'prochain') {
      return (
        <button key={cle} type="button" data-rangee={cle} onClick={versPlanning} style={{ ...RANGEE_BOUTON, borderTop: f }}>
          <span style={TITRE_RANGEE}>{tr('Prochain changement')}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0, fontSize: 13, fontWeight: 800, textAlign: 'right' }}>
            <Point mode={modeProchain} />
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{tr('{quand} · {mode}', { quand: capitale(quand), mode: motMode(modeProchain) || '—' })}</span>
            <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
          </span>
        </button>
      );
    }
    if (cle === 'fenetre') {
      /* En lecture : un compte ordinaire — la configuration de Loggia lui est
       * fermée (ADR 0144) —, et hors du planning — le réglage du moteur n'y
       * vaut pas. Sans sous-titre (l'observation), la hauteur d'une rangée
       * d'une ligne. */
      if (!fenetreReglable) {
        return (
          <div key={cle} data-rangee={cle} style={{ ...(sousFenetre ? { ...RANGEE, padding: '12px 18px' } : RANGEE_FIXE), borderTop: f }}>
            {titreFenetre(undefined)}
            {valeurFenetre}
          </div>
        );
      }
      return (
        <div key={cle} data-rangee={cle} style={{ borderTop: f }}>
          <button type="button" aria-expanded={deplie} aria-controls={deplie ? idBase + '-fenetre-reglage' : undefined} onClick={() => setDeplie(v => !v)} style={RANGEE_BOUTON_DOUBLE}>
            {titreFenetre(idBase + '-fenetre')}
            {valeurFenetre}
          </button>
          {deplie && (
            <div id={idBase + '-fenetre-reglage'} style={{ padding: '0 18px 14px' }}>
              <Puces idNom={idBase + '-fenetre'} options={choixFenetre} choisi={choisiFenetre} onChoisir={choisirFenetre} />
              {conseil && <div style={{ ...SOUS_RANGEE, marginTop: 8 }}>{tr('Éco conseillé pour un poêle à granulés : pas d’extinction pour une aération')}</div>}
            </div>
          )}
        </div>
      );
    }
    if (cle === 'maison') {
      return (
        <div key={cle} data-rangee={cle} style={{ ...RANGEE_FIXE, borderTop: f }}>
          <span style={TITRE_RANGEE}>{tr('Mode de la maison')}</span>
          <span style={{ ...VALEUR_RANGEE, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{motMaison(etat && etat.maison)}</span>
        </div>
      );
    }
    if (cle === 'planning') {
      return (
        <button key={cle} type="button" data-rangee={cle} onClick={versPlanning} style={{ ...RANGEE_BOUTON, borderTop: f }}>
          <span style={TITRE_RANGEE}>{tr('Planning')}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: 'var(--o-text2)' }}>
            {valeurPlanning}
            <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
          </span>
        </button>
      );
    }
    /* L'appareil : sa consommation, l'interrupteur d'un module, toutes ses
     * entités — sa carte ne mène plus à la fiche de l'appareil, la fiche du
     * chauffage si. */
    return (
      <button key={cle} type="button" data-rangee={cle} onClick={() => onFiche(ch.entite)} style={{ ...RANGEE_BOUTON_DOUBLE, borderTop: f }}>
        <span style={{ minWidth: 0 }}>
          <span style={TITRE_RANGEE}>{tr('L’appareil')}</span>
          <span style={SOUS_RANGEE}>{tr('L’épingle, les commandes et toutes ses entités')}</span>
        </span>
        <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
      </button>
    );
  };

  return (
    <div className="rb-accueil" style={{ gap: 12 }}>
      <Avertissements ch={ch} st={st} etats={S} rate={!!etat && etat.demarrage === false} />
      {err && <div role="alert" style={ALERTE}>{err}</div>}

      <div data-panneau="haut" style={PANNEAU_HAUT}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            {/* Un mot long passe à la ligne, plus petit — jamais tronqué (« Ochrona przed zamarzaniem »). */}
            <div data-grand="" data-mode={modeGrand || undefined}
              style={{ fontSize: grand.length > 16 ? 22 : 28, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.01em', color: encre, overflowWrap: 'anywhere', hyphens: 'auto' }}>{grand}</div>
            {sous && <div data-sous="" style={{ fontSize: 12.5, fontWeight: 600, color: encreSous, marginTop: 6 }}>{sous}</div>}
          </div>
          {mesure != null && (
            <div data-piece="" style={{ flexShrink: 0, textAlign: 'right' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', fontWeight: 800, lineHeight: 1 }}>
                <span style={{ fontSize: 25, letterSpacing: '-.02em' }}>{nombre(mesure, 1)}</span><span style={{ fontSize: 15, marginTop: 2 }}>°</span>
              </div>
              <div style={{ ...petitesCapitales(10), marginTop: 6 }}>{tr('Pièce')}</div>
            </div>
          )}
        </div>
        {enReprise && (
          <div data-reprise="" style={{ marginTop: 18 }}>
            <div id={idBase + '-fin'} style={PETITES_CAPITALES}>{ORDRE_MODES.includes(r.mode) ? tr('Garder ce mode jusqu’à') : tr('Garder cette consigne jusqu’à')}</div>
            <div style={{ marginTop: 8 }}>
              <Puces idNom={idBase + '-fin'} options={FINS(quandFin)} choisi={finDeLaReprise(ch.reprise)} onChoisir={changerFin} />
            </div>
            <button type="button" onClick={rendre} style={BOUTON_REPRENDRE}>
              <Fi i="rotate-left" size={13} />
              <span>{repris ? tr('Reprendre le planning · {mode}', { mode: repris }) : tr('Reprendre le planning')}</span>
            </button>
          </div>
        )}
        {modesPuces.length > 0 && <GrilleModes idBase={idBase} modes={modesPuces} choisi={mode} onChoisir={choisir} />}
      </div>

      {(montrerHvac || presets.length > 0 || montrerPlage) && (
        <div data-panneau="appareil" style={PANNEAU_HAUT}>
          {montrerHvac && <PucesNommees id={idBase + '-hvac'} libelle={tr('Mode')} options={hvacs.map(m => ({ id: m, label: motHvac(m) }))} choisi={hvac} onChoisir={choisirHvac} />}
          {presets.length > 0 && (
            <div style={{ marginTop: montrerHvac ? 16 : 0 }}>
              <PucesNommees id={idBase + '-preset'} libelle={tr('Préréglage')} options={presets.map(p => ({ id: p, label: motPreset(p) }))} choisi={preset} onChoisir={choisirPreset} />
            </div>
          )}
          {montrerPlage && [['bas', tr('Consigne basse')], ['haut', tr('Consigne haute')]].map(([bord, nom], i) => (
            <div key={bord} data-plage={bord} style={{ ...RANGEE, marginTop: i || montrerHvac || presets.length > 0 ? 12 : 0 }}>
              <span style={TITRE_RANGEE}>{nom}</span>
              <PasCarre nom={nom} valeur={nombre(plage[bord], 1) + '°'}
                peutMoins={!!plageVoisine(plage, bord, -1, a, uT)} peutPlus={!!plageVoisine(plage, bord, 1, a, uT)}
                moins={() => reglerPlage(bord, -1)} plus={() => reglerPlage(bord, 1)} />
            </div>
          ))}
        </div>
      )}

      {cles.length > 0 && <div data-liste="" style={PANNEAU_LISTE}>{cles.map((cle, i) => rangee(cle, filet(i)))}</div>}
    </div>
  );
}

/* ════════════ Le planning ════════════ */

/* Des minutes en pourcentage de la journée. */
const pc = (m) => Math.round(Math.max(0, Math.min(1440, m)) / 1440 * 1e6) / 1e4;

/* Le Planning de sa maquette (tâche 10 bis C, cadres 3c et 3f) : ses rangées
 * et ses boutons aux tailles, graisses, couleurs et écarts de la maquette,
 * tels quels ; ses panneaux, ceux de l'Accueil (`PANNEAU_FICHE`). Un bouton de
 * la maquette (sa « ChipButton ») : arrondi 10, 700, le gris doux sans
 * bordure ; choisi, le bleu plein et le texte blanc. */
// Le filet entre deux rangées d'un panneau (`filet`), pour une rangée qui n'est jamais la première.
const FILET = filet(1);
/* Une rangée de la semaine : le bouton qui choisit son jour, au fond neutre —
 * le jour choisi se dit par la pastille de son nom (son choix du 12/10,
 * « Pastille bleue ») : la bande de la journée reste lisible. */
const RANGEE_JOUR = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: 8, border: 'none', borderRadius: 10, boxSizing: 'border-box',
  background: 'transparent', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit' };
/* Le nom court d'un jour, dans la case de la colonne des noms : choisi, la
 * pastille bleu plein et le texte blanc (la règle des puces) ; sinon sans
 * fond, à l'accent aujourd'hui. Le même rembourrage pour tous : les noms
 * s'alignent, choisis ou non. */
const NOM_JOUR = { padding: '2px 6px', borderRadius: 8, fontSize: 11.5, fontWeight: 800, lineHeight: 1.3, whiteSpace: 'nowrap', gridArea: '1 / 1' };
const nomDuJourStyle = (choisi, aujourdhui) => ({ ...NOM_JOUR, background: choisi ? 'var(--o-accent-fond)' : 'transparent',
  color: choisi ? '#fff' : aujourdhui ? 'var(--o-accent-soft)' : 'var(--o-text2)' });
/* L'heure d'un changement déplié, dans son champ : l'heure de la maquette —
 * 17 px / 800, centrée, sans cadre lourd —, dessinée en BOUTON (tâche 10 bis
 * D) : le fond --o-s1, l'arrondi 10 et les 40 px de haut de « − 15 min » et
 * « + 15 min », ses voisins. Au téléphone, il n'a pas l'horloge qui le trahit
 * sur ordinateur : transparent, il ne se lisait que comme un texte. */
const CHAMP_HEURE_CHANGEMENT = { flex: 1, minWidth: 0, width: '100%', height: 40, boxSizing: 'border-box', padding: '0 4px', border: 'none', borderRadius: 10,
  background: 'var(--o-s1)', color: 'var(--o-text)', fontSize: 17, fontWeight: 800, textAlign: 'center', cursor: 'pointer' };
/* Un changement : son heure en grand, le point et le mode — un bouton qui se
 * déplie pour un administrateur, une rangée lue pour un compte ordinaire. */
const RANGEE_CHANGEMENT = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px 12px 18px', border: 'none', background: 'none', boxSizing: 'border-box',
  color: 'var(--o-text)', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' };
const RANGEE_CHANGEMENT_LUE = { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px' };
const HEURE_CHANGEMENT = { flex: 1, fontSize: 17, fontWeight: 800 };
const MODE_CHANGEMENT = { display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0, fontSize: 13, fontWeight: 800, textAlign: 'right', overflowWrap: 'anywhere' };
// − 15 min, + 15 min : 40 px de haut ; inertes, à .4.
const BOUTON_QUART = (peut) => ({ height: 40, padding: '0 12px', borderRadius: 10, border: 'none', background: 'var(--o-s1)', color: 'var(--o-text1)', fontFamily: 'inherit',
  fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, whiteSpace: 'nowrap', opacity: peut ? 1 : 0.4, cursor: peut ? 'pointer' : 'default' });
// Les modes d'un changement : la grille de l'Accueil, en 40 px, 12 px, écart 6.
const BOUTON_MODE_CHANGEMENT = (on) => ({ ...BOUTON_MODE(on), minHeight: 40, padding: '0 6px', fontSize: 12, gap: 6 });
// « Supprimer ce changement » : sans fond, au rouge — une suppression.
const BOUTON_SUPPRIMER = { alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 0', margin: '-8px 0 -12px', border: 'none',
  background: 'none', color: 'var(--o-bad)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' };
// « Ajouter un changement » : une rangée à l'accent, son filet au-dessus.
const BOUTON_AJOUTER = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '14px 18px', border: 'none', borderTop: FILET, background: 'none', boxSizing: 'border-box',
  color: 'var(--o-accent-soft)', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer', textAlign: 'left' };
/* « Lun – ven », « Toute la semaine » : deux puces de 40 px — le dessin que
 * prend leur `BoutonConfirme` (il garde son fond, son encre et son rouge
 * d'armement). */
const BOUTON_COPIE = { minHeight: 40, padding: '0 12px', borderRadius: 10, fontSize: 12, whiteSpace: 'nowrap' };
// « Créer un planning » : le bleu plein, 44 px.
const BOUTON_CREER = { minHeight: 44, padding: '0 14px', borderRadius: 10, border: 'none', background: 'var(--o-accent-fond)', color: '#fff', fontFamily: 'inherit',
  fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left' };

/* La journée d'un jour (cadre 3c) : une bande de 8 px, ses créneaux à la
 * couleur de leur mode, arrondis 3, chacun 2 px plus court que sa place —
 * sans piste dessous —, et aujourd'hui le trait « maintenant », qui déborde
 * de 5 px en haut et en bas. Un dessin : le bouton du jour la nomme. */
function Piste({ bandes, maintenant }) {
  return (
    <span aria-hidden="true" style={{ position: 'relative', flex: 1, height: 8 }}>
      {bandes.filter(b => b && b.a > b.de).map(b => (
        <span key={b.de} data-bande={b.mode} style={{ position: 'absolute', top: 0, bottom: 0, left: pc(b.de) + '%', width: 'calc(' + pc(b.a - b.de) + '% - 2px)', borderRadius: 3,
          background: couleurMode(b.mode) }} />
      ))}
      {Number.isFinite(maintenant) && (
        <span data-maintenant="" style={{ position: 'absolute', top: -5, bottom: -5, left: pc(maintenant) + '%', width: 3, marginLeft: -1.5, borderRadius: 2,
          background: 'var(--o-text)', boxShadow: '0 0 0 2px var(--o-bg2)' }} />
      )}
    </span>
  );
}

/* La colonne des noms des jours (son choix du 12/10) : aussi large que le plus
 * long des sept, pastille comprise — ils y sont tous, cachés, dans la même
 * case de grille —, sans déborder (« Niedz » en polonais) ; les bandes
 * commencent ainsi au même endroit sur chaque rangée, et les heures dessous.
 * `children` : le nom visible, posé dans la même case. */
function ColonneJours({ ordre, children = null }) {
  return (
    <span style={{ display: 'inline-grid', flexShrink: 0, justifyItems: 'start', alignItems: 'center' }}>
      {ordre.map(k => <span key={k} aria-hidden="true" style={{ ...NOM_JOUR, visibility: 'hidden' }}>{nomJour(k, locale(), 'short')}</span>)}
      {children}
    </span>
  );
}

/* Les repères de la journée sous les sept bandes, alignés sur elles : le
 * rembourrage d'une rangée (8 px), la colonne des noms et leur écart (10). */
function Heures({ ordre }) {
  const reperes = [0, 6, 12, 18, 24];
  return (
    <div aria-hidden="true" data-heures="" style={{ display: 'flex', gap: 10, margin: '6px 8px 0' }}>
      <ColonneJours ordre={ordre} />
      <div style={{ position: 'relative', flex: 1, height: 14, fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)' }}>
        {reperes.map((h, i) => (
          <span key={h} style={{ position: 'absolute', whiteSpace: 'nowrap',
            ...(i === 0 ? { left: 0 } : i === reperes.length - 1 ? { right: 0 } : { left: (h / 24 * 100) + '%', transform: 'translateX(-50%)' }) }}>{tr('{h} h', { h })}</span>
        ))}
      </div>
    </div>
  );
}

/* La semaine (cadre 3c) : sept rangées dans l'ordre de la langue
 * (`premierJourSemaine`), chacune le BOUTON qui choisit son jour — nommée par
 * le jour en entier, « · aujourd’hui » pour le sien, pressée quand c'est le
 * sien —, le nom court du jour choisi en pastille, sa bande dessinée à côté ;
 * dessous, les heures. Planning pas suivi, la semaine à .4 : elle se lit et
 * se règle encore. */
function SemaineDuPlanning({ bandes, ordre, aujourdhui, maintenant, jour, onJour, attenuee }) {
  return (
    <div data-panneau="semaine" style={{ ...PANNEAU_FICHE, marginTop: 12, padding: 12, opacity: attenuee ? 0.4 : 1 }}>
      {ordre.map(j => (
        <button key={j} type="button" data-jour={j} data-aujourdhui={j === aujourdhui ? '' : undefined} aria-pressed={j === jour}
          aria-label={j === aujourdhui ? tr('{jour} · aujourd’hui', { jour: nomJour(j, locale(), 'long') }) : nomJour(j, locale(), 'long')}
          onClick={() => onJour(j)} style={RANGEE_JOUR}>
          <ColonneJours ordre={ordre}><span style={nomDuJourStyle(j === jour, j === aujourdhui)}>{nomJour(j, locale(), 'short')}</span></ColonneJours>
          <Piste bandes={bandes[j] || []} maintenant={j === aujourdhui ? maintenant : null} />
        </button>
      ))}
      <Heures ordre={ordre} />
    </div>
  );
}

/* ════════════ L'éditeur de la semaine (tâches 9 et 10 bis C) ════════════ */

// La configuration de Loggia, écrite d'un seul patch : le serveur n'écrit rien d'un patch refusé.
const messageConfig = (chauffages) => ({ type: 'loggia/chauffage/config', patch: { chauffages } });

/* TOUTE semaine part dans les modes de son chauffage (tâche 10, point 4) :
 * le serveur valide la semaine entière sur ses modes (`valider_semaine`).
 * Une semaine qui garde un mode qu'il ne comprend plus — un préréglage
 * retiré d'un VTherm, une semaine posée avant la relecture de la tâche 9 —
 * se refusait à chaque modification, sans issue ; ce mode devient le plus
 * proche sans être plus chaud (`semaineAdaptee`), à la première modification. */
const dansSesModes = (ch, semaine) => semaineAdaptee(semaine, ch.modes);

/** La semaine de ce chauffage, écrite — chaque modification valide part
 * aussitôt (choix 11), comme « Créer un planning » — dans ses modes, sans
 * toucher à son planning : allumé ou éteint, il le reste. */
export function messageSemaine(ch, semaine) {
  return messageConfig({ [ch.cle]: { semaine: dansSesModes(ch, semaine) } });
}

/* Les jours d'une copie « Copier cette journée sur » (0 = lundi) : du lundi
 * au vendredi, ou toute la semaine. */
const VERS_JOURS = { semaine: [0, 1, 2, 3, 4], tous: [0, 1, 2, 3, 4, 5, 6] };
const estSemaine = (s) => !!s && typeof s === 'object' && !Array.isArray(s);

/**
 * Un geste de l'éditeur, vérifié AVANT de partir (choix 11) :
 *  - `{ message, semaine, ligne }` : la commande de configuration ; la semaine
 *    à montrer d'avance ; la place où le changement ajouté ou déplacé se
 *    range dans son jour ;
 *  - `{ refus }` : la vérification locale l'arrête — 'heure_en_double',
 *    'douze', 'derniere', 'heure_illisible' — et rien ne part ;
 *  - null : rien ne change (la même heure, le même mode, une copie sur
 *    elle-même), ou la ligne ne montre plus le changement qu'elle montrait
 *    (`avant`, son heure au moment du geste : la semaine a bougé entre-temps).
 * `semaine` : celle qu'on montre, l'avance comprise.
 *
 * Les gestes : `{ quoi: 'ajouter', jour }` · `{ quoi: 'retirer', jour, index, avant }` ·
 * `{ quoi: 'heure', jour, index, avant, h }` · `{ quoi: 'mode', jour, index, avant, mode }` ·
 * `{ quoi: 'jours', jour, vers }` (« semaine » : du lundi au vendredi ; « tous »).
 */
export function gesteSemaine(ch, semaine, geste) {
  const g = geste || {};
  const jour = g.jour;
  const avant = semainePropre(semaine);
  const liste = changementsDuJour(semaine, jour);
  if (['retirer', 'heure', 'mode'].includes(g.quoi)) {
    const c = Number.isInteger(g.index) ? liste[g.index] : null;
    if (!c || c.minute !== lireHeure(g.avant)) return null;
  }
  let neuve;
  let place = null;   // l'heure du changement ajouté ou déplacé : sa ligne, ensuite
  if (g.quoi === 'ajouter') {
    // Au milieu du plus grand trou de la journée (son choix du 12/10) ; à défaut, la première heure pleine libre.
    const h = heureAuMilieu(liste) || heureLibre(liste);
    const mode = h === null ? null : modePropose(semaine, jour, h, ch.modes);
    if (h !== null && mode === null) return null;   // aucun mode compris : rien à ajouter
    neuve = ajouterChangement(semaine, jour, mode, h);
    place = h;
  } else if (g.quoi === 'retirer') neuve = retirerChangement(semaine, jour, g.index);
  else if (g.quoi === 'heure') { neuve = changerHeure(semaine, jour, g.index, g.h); place = g.h; }
  else if (g.quoi === 'mode') neuve = changerMode(semaine, jour, g.index, g.mode);
  else if (g.quoi === 'jours') neuve = copierJour(semaine, jour, VERS_JOURS[g.vers]);
  else return null;
  if (neuve.refus) return neuve;
  if (JSON.stringify(neuve) === JSON.stringify(avant)) return null;
  // Celle qui part est celle qu'on montre d'avance : dans les modes du chauffage (les heures, elles, ne bougent pas).
  const envoyee = dansSesModes(ch, neuve);
  const minute = place === null ? null : lireHeure(place);
  const ligne = minute === null ? null : changementsDuJour(envoyee, jour).findIndex(c => c.minute === minute);
  return { message: messageSemaine(ch, envoyee), semaine: envoyee, ligne };
}

/* Ce qu'un refus local dit : la phrase du serveur pour le même refus
 * (refus.js) — qu'elle vienne d'ici ou de lui, elle est la même. */
function motRefus(refus) {
  if (refus === 'douze') return tr('12 changements par jour au plus.');
  if (refus === 'derniere') return tr('Un planning garde au moins un changement.');
  if (refus === 'heure_illisible') return tr('Heure illisible.');
  return tr('Deux changements à la même heure.');
}

/* Le focus, quand la ligne qui l'avait se remonte (un changement qui change
 * de place) : il revient à la ligne du changement — jamais pris à un élément
 * qui l'a déjà. */
function rattraper(id) {
  if (typeof document === 'undefined') return;
  setTimeout(() => {
    const actif = document.activeElement;
    if (actif && actif !== document.body) return;
    const el = document.getElementById(id);
    if (el) el.focus();
  }, 0);
}

/* Ce que garde un chauffage jamais réglé (cadre 3f) : un thermostat, sa
 * consigne telle que l'appareil la publie (« 20,0° ») ; un fil pilote, un
 * VTherm, son mode. Rien de lisible — un appareil muet, un préréglage qui ne
 * dit aucun mode — : la phrase sans valeur, jamais une valeur inventée
 * (ADR 0030). */
function phraseSansPlanning(ch, st) {
  if (ch.famille === 'thermostat') {
    const consigne = muet(st) ? null : consigneClimat(st.attributes);
    if (consigne != null) return tr('Ce chauffage garde sa consigne de {t} jusqu’à ce que vous la changiez.', { t: nombre(consigne, 1) + '°' });
  } else {
    const mot = motMode(modeAppareil(ch, st));
    if (mot) return tr('Ce chauffage garde son mode, {mode}, jusqu’à ce que vous le changiez.', { mode: mot });
  }
  return tr('Ce chauffage garde son réglage jusqu’à ce que vous le changiez.');
}

/* « Pas de planning » (cadre 3f) — un chauffage jamais réglé : planning éteint
 * et aucune semaine. La plaque du calendrier, ce que le chauffage garde, et,
 * pour un administrateur, « Créer un planning » (`onCreer`) — sauf pour un
 * chauffage qui ne comprend aucun mode (`comprend`, la règle d'« Ajouter un
 * changement ») : le serveur refuserait la semaine ; une phrase le dit à la
 * place du bouton. */
function SansPlanning({ idBase, hass, ch, ordinaire, comprend = true, onCreer }) {
  const st = ch.entite && hass && hass.states ? hass.states[ch.entite] || null : null;
  return (
    <div data-panneau="sans-planning" style={{ ...PANNEAU_FICHE, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, padding: '22px 18px' }}>
      <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text2)' }}>
        <Fi i="calendar-clock" size={17} />
      </span>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{tr('Pas de planning')}</div>
      <div style={{ fontSize: 13, color: 'var(--o-text2)', lineHeight: 1.45, textWrap: 'pretty' }}>{phraseSansPlanning(ch, st)}</div>
      {!ordinaire && comprend && (
        <div style={{ marginTop: 4 }}>
          <button type="button" id={idBase + '-creer'} onClick={onCreer} style={BOUTON_CREER}><Fi i="add" size={13} /><span>{tr('Créer un planning')}</span></button>
        </div>
      )}
      {!ordinaire && !comprend && (
        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: 'var(--o-text2)', lineHeight: 1.45 }}>{tr('Ce chauffage ne répond pas : le planning ne peut pas encore le commander.')}</div>
      )}
    </div>
  );
}

/* Un changement du jour (cadre 3c) : son heure, le point et le mode. Pour un
 * administrateur, la rangée est un bouton qui la déplie — une seule à la
 * fois, sur le gris doux :
 *  - « − 15 min » · l'heure · « + 15 min ». Les puces, pour les petits
 *    réglages, sont inertes quand l'heure toucherait un voisin ou sortirait de
 *    la journée (`heureDecalee`) — `aria-disabled`, pas `disabled` : un bouton
 *    qui le devient sous le doigt garde le focus, au lieu de le laisser tomber
 *    sur <body>. Entre elles, le CHAMP de l'heure (son choix du 12/10,
 *    « Toucher l’heure ») : le sélecteur du téléphone, n'importe quelle heure,
 *    qui part à la sortie du champ (`aLaSortie`) — la liste se range, et le
 *    changement déplacé reste déplié ; une heure prise se refuse sur place, et
 *    le champ redit l'heure vraie (`faire` rend false) ;
 *  - la grille des modes du chauffage — s'il en a —, le choisi en bleu plein ;
 *  - « Supprimer ce changement », en UN appui.
 * Le refus local de ce changement se dit dessous. Un compte ordinaire lit la
 * rangée, sans chevron. */
function LigneChangement({ id, i, c, liste, ouverte, edite, modes, refus, onBasculer, faire }) {
  const h = ecrireHeure(c.minute);
  const mode = (
    <span style={MODE_CHANGEMENT}><Point mode={c.mode} /><span style={{ minWidth: 0 }}>{motMode(c.mode) || '—'}</span></span>
  );
  if (!edite) {
    return (
      <div data-changement={h} style={{ ...RANGEE_CHANGEMENT_LUE, borderTop: FILET }}>
        <span style={HEURE_CHANGEMENT}>{h}</span>{mode}
      </div>
    );
  }
  const plusTot = heureDecalee(liste, i, -1);
  const plusTard = heureDecalee(liste, i, 1);
  const decaler = (vers) => { if (vers) faire({ quoi: 'heure', index: i, avant: h, h: vers }); };
  const siens = ORDRE_MODES.filter(m => modes.includes(m));
  return (
    <div data-changement={h} style={{ borderTop: FILET, background: ouverte ? 'var(--o-s1)' : 'transparent' }}>
      <button type="button" id={id} aria-expanded={ouverte} aria-controls={ouverte ? id + '-reglage' : undefined} onClick={onBasculer} style={RANGEE_CHANGEMENT}>
        <span style={HEURE_CHANGEMENT}>{h}</span>{mode}
        <Fi i={ouverte ? 'angle-small-up' : 'angle-small-down'} size={16} color="var(--o-text3)" />
      </button>
      {ouverte && (
        <div id={id + '-reglage'} role="group" aria-label={tr('Changement de {h}', { h })} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '2px 18px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" aria-label={tr('{n} min plus tôt', { n: 15 })} aria-disabled={plusTot ? undefined : true} onClick={() => decaler(plusTot)} style={BOUTON_QUART(!!plusTot)}>
              <Fi i="minus-small" size={14} /><span>{tr('{n} min', { n: 15 })}</span>
            </button>
            <ChampHeure valeur={h} nom={tr('Heure du changement')} aLaSortie style={CHAMP_HEURE_CHANGEMENT}
              onValide={(v) => faire({ quoi: 'heure', index: i, avant: h, h: v })} />
            <button type="button" aria-label={tr('{n} min plus tard', { n: 15 })} aria-disabled={plusTard ? undefined : true} onClick={() => decaler(plusTard)} style={BOUTON_QUART(!!plusTard)}>
              <Fi i="plus-small" size={14} /><span>{tr('{n} min', { n: 15 })}</span>
            </button>
          </div>
          {siens.length > 0 && (
            <div role="group" aria-label={tr('Mode')} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
              {siens.map(m => (
                <button key={m} type="button" aria-pressed={m === c.mode} onClick={() => { if (m !== c.mode) faire({ quoi: 'mode', index: i, avant: h, mode: m }); }}
                  style={BOUTON_MODE_CHANGEMENT(m === c.mode)}>
                  <Point mode={m} anneau={m === c.mode} /><span style={{ minWidth: 0 }}>{motMode(m)}</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => faire({ quoi: 'retirer', index: i, avant: h })} style={BOUTON_SUPPRIMER}>
            <Fi i="trash" size={13} />{tr('Supprimer ce changement')}
          </button>
          {refus && <div role="alert" style={ALERTE}>{refus}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * Le Planning (tâche 10 bis C, cadres 3c et 3f), et ce que portait l'onglet
 * Réglages, parti. Dans l'ordre de sa maquette :
 *  - « Suivre le planning » — la bascule d'un administrateur, avec son
 *    avance et son refus ; un compte ordinaire lit « Activé » ou
 *    « Désactivé » (ADR 0144) ;
 *  - la semaine, sept rangées qui choisissent le jour (`SemaineDuPlanning`),
 *    la maison appliquée ;
 *  - le jour : son titre et son compte, puis ses changements — « Depuis
 *    minuit », le mode de la première bande du jour de la semaine montrée ; un
 *    changement par rangée (`LigneChangement`), « Ajouter un changement »
 *    (caché à douze ; le nouveau s'ouvre déplié et prend le focus), « Copier
 *    cette journée sur » Lun – ven ou Toute la semaine ;
 *  - un thermostat, les températures de ses modes (`TemperaturesDesModes`) ;
 *    un chauffage introuvable, la suppression de son planning.
 * Jamais réglé (planning éteint, aucune semaine) : « Pas de planning » et
 * « Créer un planning » (`SansPlanning`).
 *
 * Un administrateur règle tout, « Observer sans agir » compris : écrire la
 * configuration n'est pas un ordre. Chaque geste est vérifié ici d'abord
 * (`gesteSemaine`), part aussitôt, se montre d'avance (`useOptimiste`) ; un
 * refus local se dit sur place, celui du serveur retire l'avance et se dit
 * sous ce qu'il touche (`raisonEchec`) : `err`, `{ ou, texte }`.
 */
function OngletPlanning({ idBase, hass, ch, etat, minute, ordinaire }) {
  const vivant = useVivant();
  const [jour, setJour] = useState(minute[0]);
  // La rangée dépliée (son index dans le jour), une seule à la fois.
  const [ouvert, setOuvert] = useState(null);
  const [err, setErr] = useState(null);
  // Le refus local, sous la rangée qu'il concerne : { jour, index, texte } — sans index, sous les changements.
  const [local, setLocal] = useState(null);
  // Le planning suivi, et la semaine, montrés d'avance : la réponse du moteur les remplace, un refus les retire.
  const suitLu = ch.planning === true;
  const [ovSuit, poserOvSuit] = useOptimiste(suitLu);
  const semaineLue = estSemaine(ch.semaine) ? ch.semaine : null;
  const [ovSemaine, poserOvSemaine] = useOptimiste(JSON.stringify(semaineLue));
  const allume = ovSuit != null ? ovSuit : suitLu;
  const semaine = ovSemaine || semaineLue;
  const introuvable = Array.isArray(ch.avertissements) && ch.avertissements.includes('introuvable');
  const alerte = (ou) => (err && err.ou === ou ? <div role="alert" style={{ ...ALERTE, marginTop: 8 }}>{err.texte}</div> : null);

  /* « Suivre le planning » : la configuration de ce chauffage, montrée
   * d'avance — l'avance retirée au refus, et le refus dit sous la bascule. */
  const basculer = () => {
    const nv = !allume;
    poserOvSuit(nv);
    setErr(null);
    commanderChauffage(hass, messagePlanning(ch, nv)).catch((e) => { poserOvSuit(null); if (vivant.current) setErr({ ou: 'suivre', texte: raisonEchec(e) }); });
  };
  // Une semaine écrite : vrai si le moteur l'a prise, faux s'il l'a refusée (l'avance retirée, le refus dit).
  const ecrireSemaine = (message, avance) => {
    setErr(null);
    setLocal(null);
    poserOvSemaine(avance);
    return commanderChauffage(hass, message).then(() => true, (e) => {
      poserOvSemaine(null);
      if (vivant.current) setErr({ ou: 'semaine', texte: raisonEchec(e) });
      return false;
    });
  };
  /* Un geste de l'éditeur : false s'il est refusé sur place (le champ de
   * l'heure redit alors l'heure vraie), true s'il part. */
  const faire = (geste) => {
    const g = { ...geste, jour };
    const r = gesteSemaine(ch, semaine, g);
    if (!r) return null;
    if (r.refus) {
      setLocal({ jour, index: Number.isInteger(g.index) ? g.index : null, texte: motRefus(r.refus) });
      return false;
    }
    const parti = ecrireSemaine(r.message, r.semaine);
    /* Le changement ajouté s'ouvre et prend le focus ; refusé par le serveur,
     * la rangée se replie et le focus revient à « Ajouter » (relecture de la
     * partie C) — sinon celle qui prend l'index refusé se dépliait et prenait
     * le focus. Un changement retiré rend le focus à « Ajouter », sinon à
     * l'onglet. Un changement que son heure fait changer de place (le champ :
     * ± 15 min ne passent jamais un voisin) reste déplié à sa nouvelle place et
     * garde le focus ; refusé, il revient, déplié, à l'ancienne. */
    if (g.quoi === 'ajouter') {
      setOuvert(r.ligne);
      focaliser(idBase + '-c-' + r.ligne, idBase + '-ajouter', idBase + '-t-planning');
      parti.then((ok) => { if (!ok) { setOuvert(null); focaliser(idBase + '-ajouter', idBase + '-t-planning'); } });
    } else if (g.quoi === 'retirer') {
      setOuvert(null);
      focaliser(idBase + '-ajouter', idBase + '-t-planning');
    } else if (g.quoi === 'heure' && r.ligne !== g.index) {
      setOuvert(r.ligne);
      rattraper(idBase + '-c-' + r.ligne);
      parti.then((ok) => { if (!ok) { setOuvert(g.index); focaliser(idBase + '-c-' + g.index, idBase + '-t-planning'); } });
    }
    return true;
  };
  /* Le chauffage comprend-il un mode du planning ? Sinon (introuvable, module
   * injoignable), rien ne s'ajoute et rien ne se crée : le serveur refuserait
   * la semaine (« mode confort inconnu »). */
  const comprend = ORDRE_MODES.some(m => (ch.modes || []).includes(m));
  /* « Créer un planning » (cadre 3f) : la semaine type dans les modes du
   * chauffage, SANS allumer le planning — un patch `{ semaine }` seul : on la
   * relit, puis on l'allume par la bascule du haut, qui prend le focus.
   * Refusée, le panneau revient, et le focus à son bouton. */
  const creer = () => {
    if (!comprend) return;
    const type = semaineType();
    ecrireSemaine(messageSemaine(ch, type), dansSesModes(ch, type)).then((ok) => { if (!ok) focaliser(idBase + '-creer', idBase + '-t-planning'); });
    focaliser(idBase + '-suivre', idBase + '-t-planning');
  };
  // Un jour choisi garde le focus sur sa rangée (elle reste montée) ; la rangée dépliée se replie.
  const choisirJour = (j) => { setJour(j); setOuvert(null); setLocal(null); };
  const basculerLigne = (i) => { setOuvert(ouvert === i ? null : i); setLocal(null); };

  const suppression = introuvable && !ordinaire ? <SupprimerSonPlanning hass={hass} ch={ch} /> : null;
  if (!allume && !estSemaine(semaine)) {
    return (
      <div className="rb-planning" style={{ gap: 0 }}>
        <SansPlanning idBase={idBase} hass={hass} ch={ch} ordinaire={ordinaire} comprend={comprend} onCreer={creer} />
        {alerte('semaine')}
        {suppression}
      </div>
    );
  }
  // La semaine montrée garde la maison (Été, Vacances, Absence) ; « Depuis minuit » dit le PLANNING, comme les rangées qu'il précède.
  const bandes = bandesSemaine(semaine, etat && etat.maison);
  const minuit = modePlanning(semaine, jour, 0);
  const liste = changementsDuJour(semaine, jour);
  const peutAjouter = !ordinaire && liste.length < MAX_CHANGEMENTS_JOUR && comprend;
  const refusDe = (i) => (local && local.jour === jour && local.index === i ? local.texte : null);
  const enBas = refusDe(null);
  const nomDuJour = nomJour(jour, locale(), 'long');
  return (
    <div className="rb-planning" style={{ gap: 0 }}>
      <div data-panneau="suivre" style={{ ...PANNEAU_FICHE, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={TITRE_RANGEE}>{tr('Suivre le planning')}</span>
          <span style={SOUS_RANGEE}>{tr('Loggia le commande selon sa semaine, même écran fermé.')}</span>
        </div>
        {ordinaire
          ? <span style={{ ...VALEUR_RANGEE, flexShrink: 0, color: 'var(--o-text2)' }}>{allume ? tr('Activé') : tr('Désactivé')}</span>
          : <Bascule id={idBase + '-suivre'} on={allume} nom={tr('Suivre le planning')} cb={basculer} />}
      </div>
      {alerte('suivre')}

      <SemaineDuPlanning bandes={bandes} ordre={ordreJours(premierJourSemaine(locale()))} aujourdhui={minute[0]} maintenant={minute[1]} jour={jour}
        onJour={choisirJour} attenuee={!allume} />

      <div data-titre-jour="" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{jour === minute[0] ? tr('{jour} · aujourd’hui', { jour: nomDuJour }) : nomDuJour}</div>
        {liste.length > 0 && <div style={{ fontSize: 12, color: 'var(--o-text3)' }}>{trN(liste.length, '{n} changement', '{n} changements')}</div>}
      </div>
      <div data-panneau="changements" style={{ ...PANNEAU_FICHE, marginTop: 10, overflow: 'hidden' }}>
        <div data-rangee="minuit" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px' }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--o-text3)' }}>{tr('Depuis minuit')}</span>
          {minuit && <Point mode={minuit} />}
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--o-text2)' }}>{motMode(minuit) || '—'}</span>
        </div>
        {liste.map((c, i) => (
          <LigneChangement key={jour + ':' + i} id={idBase + '-c-' + i} i={i} c={c} liste={liste} ouverte={ouvert === i} edite={!ordinaire} modes={ch.modes || []}
            refus={refusDe(i)} onBasculer={() => basculerLigne(i)} faire={faire} />
        ))}
        {peutAjouter && (
          <button type="button" id={idBase + '-ajouter'} onClick={() => faire({ quoi: 'ajouter' })} style={BOUTON_AJOUTER}>
            <Fi i="add" size={14} />{tr('Ajouter un changement')}
          </button>
        )}
        {!ordinaire && (
          <div role="group" aria-labelledby={idBase + '-copier'} data-rangee="copier" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '12px 18px', borderTop: FILET }}>
            <span id={idBase + '-copier'} style={{ marginRight: 'auto', fontSize: 12, color: 'var(--o-text3)' }}>{tr('Copier cette journée sur')}</span>
            {/* Jusqu'à six jours écrasés d'un appui, sans retour : DEUX appuis (la règle de la fiche commune). Le nom dit ce qu'elles font, et contient le mot qu'on voit. */}
            <BoutonConfirme libelle={tr('Lun – ven')} nom={tr('{a} : {b}', { a: tr('Copier cette journée sur'), b: tr('Lun – ven') })} style={BOUTON_COPIE}
              onConfirme={() => faire({ quoi: 'jours', vers: 'semaine' })} />
            <BoutonConfirme libelle={tr('Toute la semaine')} nom={tr('{a} : {b}', { a: tr('Copier cette journée sur'), b: tr('Toute la semaine') })} style={BOUTON_COPIE}
              onConfirme={() => faire({ quoi: 'jours', vers: 'tous' })} />
          </div>
        )}
      </div>
      {enBas && <div role="alert" style={{ ...ALERTE, marginTop: 8 }}>{enBas}</div>}
      {alerte('semaine')}

      {ch.famille === 'thermostat' && <TemperaturesDesModes idBase={idBase} hass={hass} ch={ch} ordinaire={ordinaire} />}
      {suppression}
    </div>
  );
}

/* ════════════ L'historique (tâche 10 bis D, cadre 3d) ════════════
 *
 * L'Historique de sa maquette : les tailles, graisses, couleurs, écarts et
 * textes de son script (`chart`, `series`, `fmtDur`), tels quels ; ses
 * panneaux, ceux du reste de la fiche (`PANNEAU_FICHE` : --o-s3, l'arrondi du
 * thème, sans ombre, le liseré du réglage « Liserés »). Ce qui se calcule —
 * l'escalier, l'échelle, les tracés, les bandes, les temps — vit dans
 * `chauffageplanning.js`. */

// L'en-tête d'un panneau : son titre en petites capitales à gauche, sa valeur à droite.
const TETE_HISTO = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 };
const VALEUR_HISTO = { fontSize: 11.5, fontWeight: 700, color: 'var(--o-text2)' };
// Les traits du SVG : leur épaisseur ne s'étire pas avec lui.
const FILETS_COURBE = { fill: 'none', stroke: 'var(--o-bd1)', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' };
const TRAIT_CONSIGNE = { fill: 'none', stroke: 'var(--o-warn2)', strokeWidth: 1.5, strokeDasharray: '4 4', vectorEffect: 'non-scaling-stroke' };
const TRAIT_MESURE = { fill: 'none', stroke: 'var(--o-text1)', strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round', vectorEffect: 'non-scaling-stroke' };
// Ce qui tient la place de la courbe quand il n'y a rien à tracer : le mot de la fiche, à sa hauteur.
const VIDE_HISTO = { height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', ...MOT, fontSize: 13 };
// « À la main » : hachuré, au gris d'un mode inconnu.
const MAIN_HISTO = hachures(couleurMode(null));

/* Le jour d'il y a 84 h — le milieu de sept jours —, à l'horloge de la maison
 * (`minute` : [jour, minute], 0 = lundi). */
function jourDuMilieu(minute) {
  const j = Math.floor((minute[0] * 1440 + minute[1] - 84 * 60) / 1440);
  return ((j % 7) + 7) % 7;
}

/**
 * L'Historique (cadre 3d). En tête, « 24 h » ou « 7 jours » (les Puces de la
 * fiche, dans le puits ; le choix est gardé par la fiche, `periode`) ; puis
 * ses DONNÉES, un enfant gardé par la période (`key`) : changer de période le
 * remonte — ses lectures repartent de rien, « Chargement… » se dit, jamais la
 * journée d'avant sous les mots de 7 jours (relecture de la partie D). Les
 * Puces, elles, restent montées : le focus y reste.
 */
function OngletHistorique({ hass, ch, sonde = null, minute = [0, 0], periode = '24h', onPeriode = null, t }) {
  const p = PERIODES[periode] ? periode : '24h';
  return (
    <div className="rb-histo" style={{ gap: 12 }}>
      <Puces nom={tr('Période')} options={[{ id: '24h', label: tr('{n} h', { n: 24 }) }, { id: '7j', label: tr('7 jours') }]} choisi={p}
        onChoisir={(x) => { if (onPeriode) onPeriode(x); }} />
      <DonneesHistorique key={p} hass={hass} ch={ch} sonde={sonde} minute={minute} periode={p} t={t} />
    </div>
  );
}

// La liste d'une lecture : null tant qu'elle n'est pas lue, ou illisible.
const premiere = (lu) => (Array.isArray(lu) ? lu[0] || [] : null);
// Ce qu'un état vivant apporte au calcul, en clé : un état de Home Assistant change d'identité à chaque mise à jour.
const ATTRIBUTS_VIVANTS = ['hvac_modes', 'target_temp_step', 'min_temp', 'max_temp', 'temperature', 'current_temperature', 'hvac_action', 'preset_mode'];
function cleVivante(st, attributs = ATTRIBUTS_VIVANTS) {
  if (!st || typeof st !== 'object') return '';
  const a = (st.attributes && typeof st.attributes === 'object') ? st.attributes : {};
  return JSON.stringify({ state: st.state, attributes: Object.fromEntries(attributs.filter(k => a[k] !== undefined).map(k => [k, a[k]])),
    last_updated: st.last_updated || st.last_changed || null });
}

/**
 * Ce que l'Historique dessine, d'un seul calcul — appelé par `useMemo`, il ne
 * se refait qu'à une nouvelle réponse, au pas suivant de la courbe (`fin` :
 * « maintenant » arrondi au pas, un quart d'heure ou une heure), ou quand
 * l'état vivant change ; jamais à chaque rendu (relecture de la partie D :
 * 24 à 80 ms par rendu, mesurés sur sept jours d'un poêle). Ses entrées sont
 * des valeurs : les historiques DATÉS une fois par réponse (`dater`), et des
 * clés pour ce qui change d'identité à chaque lecture — l'état vivant de la
 * sonde et de l'appareil, le chauffage du moteur (du JSON).
 */
function calculHistorique({ dateesSonde, dateesAppareil, fin, jours, pas, attribut, vivantSonde, vivantAppareil, chauffage, unite }) {
  const ch = JSON.parse(chauffage);
  const vs = vivantSonde ? JSON.parse(vivantSonde) : null;
  const va = vivantAppareil ? JSON.parse(vivantAppareil) : null;
  const thermostat = ch.famille === 'thermostat';
  const lireMesure = (e) => mesureLisible(attribut ? (e.attributes || {})[attribut] : e.state);
  const lireConsigne = (e) => (estMuet(e.state) || e.state === 'off' ? null : mesureLisible((e.attributes || {}).temperature));
  const mesures = dateesSonde ? echantillons(dateesSonde, fin, { jours, pas, lire: lireMesure, vivant: vs }) : [];
  const consignes = thermostat && dateesAppareil ? echantillons(dateesAppareil, fin, { jours, pas, lire: lireConsigne, vivant: va }) : null;
  const bandes = !dateesAppareil ? null : thermostat ? chauffeAppliquee(dateesAppareil, fin, { vivant: va, jours })
    : modesAppliques(dateesAppareil, ch, fin, unite, { vivant: va, jours });
  // Un thermostat qui n'a jamais dit ce qu'il faisait sur la période n'a pas de temps de chauffe (« Chauffe 0 min » serait inventé).
  const dite = !thermostat || (!!dateesAppareil && actionDite(dateesAppareil, fin, { vivant: va, jours }));
  return { c: courbe(mesures, consignes), bandes, dite };
}

/**
 * Les DONNÉES de l'Historique (cadre 3d), sous les Puces — remontées à chaque
 * période (`key`) :
 *  - la courbe de la PIÈCE, lue sur sa sonde (`sonde`, `{ id, attribut }` :
 *    un thermostat se mesure lui-même — son historique, lu avec ses
 *    attributs, sert alors à tout), échantillonnée en escalier — un quart
 *    d'heure sur 24 h, une heure sur 7 jours (`PERIODES`) — : « Température »
 *    et son min · max, les trois repères, le SVG étiré ; la consigne d'un
 *    THERMOSTAT en tirets, en escalier, coupée quand il est éteint ou sans
 *    consigne ;
 *  - sous elle, la bande : les modes que l'appareil a appliqués (un fil
 *    pilote, un VTherm — l'Arrêt laissé vide, « à la main » hachurée), ou la
 *    chauffe d'un thermostat ; puis le temps, « il y a 24 h · il y a 12 h ·
 *    maintenant » ou « lundi dernier · vendredi · maintenant » ;
 *  - le temps par mode — ou de chauffe, si l'appareil a dit au moins une fois
 *    ce qu'il faisait —, une barre et sa légende.
 * Rien d'inventé : un trou reste un trou ; le chargement, l'échec et le vide
 * se disent avec les mots de la fiche, à la place de la courbe ; l'appareil
 * illisible se dit dans le panneau du temps (sauf quand il est la sonde : la
 * courbe l'a déjà dit). L'état VIVANT de la sonde et de l'appareil est leur
 * dernier point. Sur 24 h, l'appareil se relit quand il change de mode, de
 * préréglage ou de consigne — ce qui a changé entre-temps, fiche ouverte ;
 * sur 7 jours, jamais : des milliers de lignes, et l'état vivant ferme déjà
 * la période.
 */
function DonneesHistorique({ hass, ch, sonde = null, minute = [0, 0], periode = '24h', t }) {
  const p = PERIODES[periode] ? periode : '24h';
  const { jours, pas } = PERIODES[p];
  const S = (hass && hass.states) || {};
  const id = ch.entite || '';
  const climat = id.indexOf('climate.') === 0;
  const st = id ? S[id] || null : null;
  const a = (st && st.attributes) || {};
  const thermostat = ch.famille === 'thermostat';
  // Un thermostat, un VTherm se mesurent eux-mêmes : une seule lecture, celle de l'appareil, avec ses attributs.
  const memeEntite = !!(sonde && climat && sonde.id === id && sonde.attribut);
  const aLire = sonde && !memeEntite ? sonde : null;
  const luSonde = useHistoriquePeriode(hass, { ids: aLire && !aLire.attribut ? [aLire.id] : [], idsAttributs: aLire && aLire.attribut ? [aLire.id] : [], jours });
  const recharge = jours === 1 && st ? [st.state, a.preset_mode, a.temperature].join('|') : '';
  const parServeur = useHistoriqueClimat(hass, ch.cle, jours, recharge, climat && !!(hass && typeof hass.callWS === 'function'));
  const repli = !climat || parServeur === 'repli' || !(hass && typeof hass.callWS === 'function');
  const luLu = useHistoriquePeriode(hass, { ids: id && !climat ? [id] : [], idsAttributs: climat && repli ? [id] : [], jours, cle: recharge });
  const luAppareil = repli ? luLu : parServeur;
  // Datées et rangées UNE fois par réponse.
  const dateesAppareil = useMemo(() => dater(premiere(luAppareil)), [luAppareil]);
  const dateesLues = useMemo(() => dater(premiere(luSonde)), [luSonde]);
  const etatSonde = !sonde ? [] : memeEntite ? luAppareil : luSonde;
  const dateesSonde = !sonde ? null : memeEntite ? dateesAppareil : dateesLues;
  // Le calcul : « maintenant » arrondi au pas de la courbe, et des clés pour ce qui change d'identité.
  const pasMs = pas * 60000;
  const fin = Math.floor(t / pasMs) * pasMs;
  const vivantAppareil = cleVivante(st);
  const vivantSonde = !sonde ? '' : memeEntite ? vivantAppareil : cleVivante(S[sonde.id], sonde.attribut ? [sonde.attribut] : []);
  const chauffage = JSON.stringify({ famille: ch.famille || null, options: ch.options || null, modes: ch.modes || null, temperatures: ch.temperatures || null });
  const unite = uniteTemp(a, hass);
  const attribut = sonde ? sonde.attribut || null : null;
  const { c, bandes, dite } = useMemo(() => calculHistorique({ dateesSonde, dateesAppareil, fin, jours, pas, attribut, vivantSonde, vivantAppareil, chauffage, unite }),
    [dateesSonde, dateesAppareil, fin, jours, pas, attribut, vivantSonde, vivantAppareil, chauffage, unite]);
  const videCourbe = etatSonde === null ? tr('Chargement…') : etatSonde === 'erreur' ? tr('Historique indisponible pour le moment')
    : p === '7j' ? tr("Pas d'historique sur 7 jours") : tr("Pas d'historique sur 24 h");

  /* La bande et le temps : la chauffe d'un thermostat, les modes appliqués
   * des autres. Les parts du temps, de l'Arrêt au Confort puis « à la main » ;
   * pour un thermostat, la chauffe et le reste — s'il l'a dit. */
  const traits = (bandes || []).filter(b => (thermostat ? b.chauffe : b.mode !== 'arret')).map(b => ({
    cle: thermostat ? 'chauffe' : b.main ? 'main' : b.mode, de: b.de,
    fond: thermostat ? 'var(--o-warn2)' : b.main ? MAIN_HISTO : couleurMode(b.mode), ...placeBande(b, jours),
  }));
  const chauffe = thermostat ? tempsDeChauffe(bandes) : null;
  const parts = !dite ? []
    : thermostat ? [{ cle: 'chauffe', mot: tr('Chauffe'), fond: 'var(--o-warn2)', minutes: chauffe.chauffe }, { cle: 'sans', mot: tr('Sans chauffe'), fond: 'var(--o-bd1)', minutes: chauffe.sans }]
      : tempsParMode(bandes).map(x => ({ cle: x.mode || 'main', mot: x.mode ? motMode(x.mode) : tr('À la main'), fond: x.mode ? couleurMode(x.mode) : MAIN_HISTO, minutes: x.minutes }));
  const compte = parts.some(x => x.minutes > 0);
  const echecAppareil = !!id && luAppareil === 'erreur' && !memeEntite;
  const axe = !!c || compte;
  const reperesX = p === '7j'
    ? [JOURS_DERNIERS()[minute[0]] || '', jourEnPhrase(jourDuMilieu(minute)), tr('maintenant')]
    : [tr('il y a {n} h', { n: 24 }), tr('il y a {n} h', { n: 12 }), tr('maintenant')];
  const sur = p === '7j'
    ? (thermostat ? tr('{duree} sur 7 jours', { duree: dureeLisible(chauffe.chauffe) }) : tr('sur 7 jours'))
    : (thermostat ? tr('{duree} sur 24 h', { duree: dureeLisible(chauffe.chauffe) }) : tr('sur 24 h'));

  return (
    <>
      <div data-panneau="courbe" style={{ ...PANNEAU_FICHE, padding: '16px 16px 14px' }}>
        <div style={TETE_HISTO}>
          <div style={PETITES_CAPITALES}>{tr('Température')}</div>
          {c && <div style={VALEUR_HISTO}>{tr('min {a} · max {b}', { a: nombre(c.mn, 1) + '°', b: nombre(c.mx, 1) + '°' })}</div>}
        </div>
        <div style={{ position: 'relative', marginTop: 14, paddingLeft: 34 }}>
          {c ? (<>
            <div aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, height: 120, width: 28, fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)' }}>
              <span style={{ position: 'absolute', right: 0, top: -7 }}>{nombre(c.hi, 0) + '°'}</span>
              <span style={{ position: 'absolute', right: 0, top: 53 }}>{nombre((c.lo + c.hi) / 2, 0) + '°'}</span>
              <span style={{ position: 'absolute', right: 0, top: 113 }}>{nombre(c.lo, 0) + '°'}</span>
            </div>
            <svg aria-hidden="true" viewBox="0 0 400 120" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 120, overflow: 'visible' }}>
              <path d="M0 0.5H400M0 60H400M0 119.5H400" style={FILETS_COURBE} />
              <path d={c.aire} style={{ fill: 'var(--o-s1)' }} />
              {c.consigne && <path data-consigne="" d={c.consigne} style={TRAIT_CONSIGNE} />}
              <path data-mesure="" d={c.ligne} style={TRAIT_MESURE} />
            </svg>
          </>) : <div data-vide="" style={VIDE_HISTO}>{videCourbe}</div>}
          {axe && (<>
            <div aria-hidden="true" data-bande-histo="" style={{ position: 'relative', height: 6, marginTop: 8, borderRadius: 3, background: 'var(--o-s1)' }}>
              {traits.map(x => (
                <span key={x.de} data-trait={x.cle} style={{ position: 'absolute', top: 0, bottom: 0, left: x.left, width: x.width, borderRadius: 3, background: x.fond }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, fontWeight: 700, color: 'var(--o-text3)' }}>
              {reperesX.map((x, i) => <span key={i}>{x}</span>)}
            </div>
          </>)}
        </div>
      </div>
      {(compte || echecAppareil) && (
        <div data-panneau="temps" style={{ ...PANNEAU_FICHE, padding: '16px 18px' }}>
          <div style={TETE_HISTO}>
            <div style={PETITES_CAPITALES}>{thermostat ? tr('Temps de chauffe') : tr('Temps par mode')}</div>
            {compte && <div style={VALEUR_HISTO}>{sur}</div>}
          </div>
          {compte ? (<>
            <div aria-hidden="true" style={{ display: 'flex', gap: 2, height: 10, marginTop: 12, borderRadius: 5, overflow: 'hidden' }}>
              {parts.filter(x => x.minutes > 0).map(x => <span key={x.cle} style={{ flex: x.minutes, background: x.fond }} />)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 18px', marginTop: 14 }}>
              {parts.map(x => (
                <div key={x.cle} data-part={x.cle} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700 }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: x.fond }} />
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--o-text1)', overflowWrap: 'anywhere' }}>{x.mot}</span>
                  <span style={{ fontWeight: 800 }}>{dureeLisible(x.minutes)}</span>
                </div>
              ))}
            </div>
          </>) : <div style={{ ...MOT, marginTop: 12 }}>{tr('Historique indisponible pour le moment')}</div>}
        </div>
      )}
    </>
  );
}

/* ════════════ La configuration d'un chauffage (administrateurs) ════════════
 *
 * Ce que portait l'onglet Réglages, parti à la tâche 10 bis C : « Suivre le
 * planning » vit en tête du Planning, les températures d'un thermostat sous
 * ses changements, la suppression d'un chauffage introuvable en bas ; ce que
 * fait une fenêtre ouverte se règle dans sa rangée de l'Accueil (tâche 10 bis
 * B). Un compte ordinaire lit, sans rien enregistrer (ADR 0144). */

/** Les températures des modes d'un thermostat, en °C — les TROIS ensemble : le serveur juge leur ordre sur le patch entier. */
export function messageTemperatures(ch, t) {
  return messageConfig({ [ch.cle]: { temperatures: { confort: t.confort, eco: t.eco, hors_gel: t.hors_gel } } });
}

/** Ce que fait une fenêtre ouverte de sa pièce : 'arret', 'eco' ou 'rien'. */
export function messageFenetre(ch, reglage) {
  return messageConfig({ [ch.cle]: { fenetre: reglage } });
}

/** Le planning d'un chauffage introuvable, retiré de la configuration (spec § 10). */
export function messageSuppression(ch) {
  return messageConfig({ [ch.cle]: null });
}

// Le titre d'une rangée précédé du point de son mode.
const TITRE_MODE = { ...TITRE_RANGEE, display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0, overflowWrap: 'anywhere' };
// Une température en lecture : dans la colonne des valeurs des − / + (`PasCarre`).
const VALEUR_TEMPERATURE = { minWidth: 64, textAlign: 'center', fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0 };
// Le − et l'écart qui suivent la valeur d'un `PasCarre` : une valeur lue s'aligne sur la sienne.
const SOUS_LES_PAS = 44 + 8;

/**
 * Les températures des modes d'un thermostat, sous ses changements (tâche 10
 * bis C) : Confort, Éco et Hors-gel, un demi-degré à la fois
 * (`pasTemperature`), en − / + carrés de 44 px (`PasCarre`, le dessin de la
 * consigne de l'Accueil). Les trois partent ENSEMBLE — le serveur juge leur
 * ordre sur le patch entier —, gardées en °C, dites dans l'unité de la maison
 * (ADR 0128). L'ordre se vérifie ici d'abord, les trois rangées sur la grille
 * du demi-degré comme le serveur les range : un cran qui le casserait ne part
 * pas, et la phrase du refus du serveur le dit sur place ; les bornes de 5 à
 * 30 °C rendent leur bouton inerte. Confort −1 et −2 s'en déduisent, en
 * lecture. Montrées d'avance (`useOptimiste`), retirées au refus. Un compte
 * ordinaire lit les valeurs.
 */
function TemperaturesDesModes({ idBase, hass, ch, ordinaire }) {
  const vivant = useVivant();
  const [err, setErr] = useState('');
  const [ordre, setOrdre] = useState('');
  // Les températures, en °C : le cran suivant part de celles qu'on montre, l'avance comprise.
  const tLues = temperaturesDe(ch.temperatures);
  const [ovT, poserOvT] = useOptimiste(JSON.stringify(tLues));
  const temps = ovT || tLues;
  const uMaison = uniteTemp(null, hass);
  const modes = Array.isArray(ch.modes) ? ch.modes : [];
  const regler = (cle, sens) => {
    const r = pasTemperature(temps, cle, sens);
    if (!r) return;
    if (r.refus) {
      setOrdre(r.refus === 'desordre' ? tr('Les températures doivent rester dans l’ordre : Hors-gel sous Éco, Éco au plus Confort.') : tr('Température hors bornes : de 5 à 30 °C.'));
      return;
    }
    setOrdre('');
    setErr('');
    poserOvT(r);
    commanderChauffage(hass, messageTemperatures(ch, r)).catch((e) => { poserOvT(null); if (vivant.current) setErr(raisonEchec(e)); });
  };
  // Un cran inerte aux bornes du serveur ; l'ordre, lui, se dit au geste.
  const peut = (cle, sens) => { const r = pasTemperature(temps, cle, sens); return !!r && r.refus !== 'bornes'; };
  const reglees = [['confort', tr('Confort')], ['eco', tr('Éco')], ['hors_gel', tr('Hors-gel')]];
  const id = idBase + '-temperatures';
  return (
    <div style={{ marginTop: 18 }}>
      <div id={id} style={PETITES_CAPITALES}>{tr('Températures des modes')}</div>
      <div role="group" aria-labelledby={id} data-panneau="temperatures" style={{ ...PANNEAU_FICHE, marginTop: 10, overflow: 'hidden' }}>
        {reglees.map(([cle, nom], i) => (
          <div key={cle} data-temperature={cle} style={{ ...RANGEE_DOUBLE, borderTop: filet(i) }}>
            <span style={TITRE_MODE}><Point mode={cle} />{nom}</span>
            {ordinaire
              ? <span style={VALEUR_TEMPERATURE}>{enUnite(temps[cle], uMaison)}</span>
              : <PasCarre nom={nom} valeur={enUnite(temps[cle], uMaison)} peutMoins={peut(cle, -1)} peutPlus={peut(cle, 1)} moins={() => regler(cle, -1)} plus={() => regler(cle, 1)} />}
          </div>
        ))}
        {['confort_1', 'confort_2'].filter(m => modes.includes(m)).map(m => (
          <div key={m} data-deduite={m} style={{ ...RANGEE_DOUBLE, borderTop: FILET }}>
            <span style={{ minWidth: 0 }}>
              <span style={TITRE_MODE}><Point mode={m} />{motMode(m)}</span>
              <span style={SOUS_RANGEE}>{tr('Déduite du Confort, jamais sous l’Éco')}</span>
            </span>
            <span style={ordinaire ? VALEUR_TEMPERATURE : { ...VALEUR_TEMPERATURE, marginRight: SOUS_LES_PAS }}>{enUnite(temperatureDuMode(m, temps), uMaison)}</span>
          </div>
        ))}
      </div>
      {ordre && <div role="alert" style={{ ...ALERTE, marginTop: 8 }}>{ordre}</div>}
      {err && <div role="alert" style={{ ...ALERTE, marginTop: 8 }}>{err}</div>}
    </div>
  );
}

/* La suppression du planning d'un chauffage introuvable dans Home Assistant
 * (spec § 10), en bas du Planning : deux appuis (`BoutonConfirme`). Un
 * administrateur seulement. */
function SupprimerSonPlanning({ hass, ch }) {
  const vivant = useVivant();
  const [err, setErr] = useState('');
  const supprimer = () => {
    setErr('');
    commanderChauffage(hass, messageSuppression(ch)).catch((e) => { if (vivant.current) setErr(raisonEchec(e)); });
  };
  return (
    <div style={{ marginTop: 12 }}>
      <div data-panneau="suppression" style={{ ...PANNEAU_FICHE, ...RANGEE_DOUBLE }}>
        <span style={{ minWidth: 0 }}>
          <span style={TITRE_RANGEE}>{tr('Supprimer son planning')}</span>
          <span style={SOUS_RANGEE}>{tr('Introuvable dans Home Assistant : renommé ou retiré ?')}</span>
        </span>
        <BoutonConfirme libelle={tr('Supprimer')} onConfirme={supprimer} />
      </div>
      {err && <div role="alert" style={{ ...ALERTE, marginTop: 8 }}>{err}</div>}
    </div>
  );
}

/* ════════════ La fiche ════════════ */

/**
 * `ch` : le chauffage, tel que `loggia/chauffage/etat` le décrit ; `etat` : la
 * réponse entière (la maison, l'heure murale, l'observation). `epingle` :
 * l'épingle de l'entité, posée par la coquille ; `sonde` : `{ id, attribut }`,
 * la mesure de la pièce — l'Accueil la lit, l'Historique dessine sa courbe
 * (tâche 10 bis D : la coquille ne passe plus de courbe) ; `onFiche(entite)`
 * ouvre la fiche universelle de l'appareil ; `motHvac(mode)` dit un mode
 * `hvac` (`motModeClimat` de la coquille : la fiche n'importe jamais
 * App.jsx). `piece` : le nom de sa pièce, sous le nom de l'en-tête ;
 * `puissance` : le capteur de puissance d'un module, que sa plaque lit comme
 * celle de sa carte (tâche 10 bis B) ; `glyphe(defaut)` : l'icône choisie
 * pour sa carte, autour du glyphe par défaut (`GlypheCarte` de la coquille,
 * relecture de la partie B). `ongletDepart` et `maintenant` servent aux
 * tests.
 */
export default function FicheChauffageContent({ hass, ch, etat = null, epingle = null, sonde = null, onFiche = null, motHvac = undefined,
  piece = null, puissance = null, glyphe = null, ongletDepart = 'accueil', maintenant = null }) {
  /* Ce qui relie chaque onglet à son panneau (motif ARIA du robot), AVANT tout
   * retour : un crochet ne se saute jamais. La période de l'Historique (24 h
   * ou 7 jours) se garde ici, tant que la fiche est ouverte : l'onglet, lui,
   * se démonte quand on en change. */
  const idOnglets = useId();
  const [onglet, setOnglet] = useState(ongletDepart);
  const [periode, setPeriode] = useState('24h');
  if (!ch) return null;
  const ordinaire = compteOrdinaire(hass);
  // Trois onglets pour tous (tâche 10 bis C, cadres 3b à 3f) : ce que portait Réglages vit dans le Planning.
  const onglets = [
    ['accueil', tr('Accueil'), 'home'],
    ['planning', tr('Planning'), 'calendar-clock'],
    ['historique', tr('Historique'), 'time-past'],
  ];
  const actuel = onglets.some(o => o[0] === onglet) ? onglet : 'accueil';
  const nom = ch.nom || ch.entite || tr('Chauffage');
  const simulation = !!(etat && etat.simulation);
  const t = maintenant == null ? Date.now() : (maintenant instanceof Date ? maintenant.getTime() : Number(maintenant));
  const minute = minuteMurale(etat, t);
  /* « Prochain changement » et « Planning » ouvrent un onglet : leur bouton
   * part avec l'Accueil — le focus va à l'onglet ouvert, pas sur <body>
   * (règle du 05/10, `focaliser`). */
  const versOnglet = (o) => { setOnglet(o); focaliser(idOnglets + '-t-' + o); };
  const plaque = plaqueDuChauffage(ch, hass, puissance, simulation);
  if (typeof glyphe === 'function') plaque.glyphe = glyphe(<Fi i={plaque.icone} size={18} />);
  return (
    <div className="rb-fiche rb-chauffage" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <EnteteFiche nom={nom} epingle={epingle} plaque={plaque} sousNom={typeDuChauffage(ch, piece)} />
      <FicheOnglets idBase={idOnglets} nom={nom} onglets={onglets} actuel={actuel} onChoisir={setOnglet} />
      <PanneauOnglet idBase={idOnglets} actuel={actuel} avecOnglets>
        {actuel === 'accueil' && <OngletAccueil idBase={idOnglets} hass={hass} ch={ch} etat={etat} sonde={sonde} onFiche={onFiche} onOnglet={versOnglet} ordinaire={ordinaire}
          simulation={simulation} minute={minute} t={t} motHvac={motHvac} />}
        {actuel === 'planning' && <OngletPlanning idBase={idOnglets} hass={hass} ch={ch} etat={etat} minute={minute} ordinaire={ordinaire} />}
        {actuel === 'historique' && <OngletHistorique hass={hass} ch={ch} sonde={sonde} minute={minute} periode={periode} onPeriode={setPeriode} t={t} />}
      </PanneauOnglet>
    </div>
  );
}
