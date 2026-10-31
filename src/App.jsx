import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { lazyRecharge } from './recharge.js';
import { OUTILS_VUES } from './outilsvues.js';
import { formatEcran } from './disposition.js';
import { poserDefautsAccueil } from './contenupartage.js';
import { profilAppareil, retenirProfilAppareil, ficheAppareil, appareilsConnus, adopterAppareil, apparence, poserApparence } from './state.js';
// Les deux fonds animes tirent three.js : 448 Ko a analyser, pour un decor. En
// import direct, ce cout etait paye a CHAQUE ouverture, meme par quelqu'un qui
// a coupe les effets. En differe, il n'est paye que si le fond s'affiche.
// La table des conditions, elle, est de la donnee pure et reste immediate.
import { SAFE_NOLOOK, applyTheme, readLook, signatureHaTheme } from './theme.js';
import { uniteTemp } from './unites.js';
// « Cet écran est-il l'un de ceux-ci ? » (ADR 0222) : rare, chargée à la demande.
const QuestionAppareil = lazyRecharge(() => import('./views/appareils.jsx').then(m => ({ default: m.QuestionAppareil })));
const ViewEntSheet = lazyRecharge(() => import('./views/parametres.jsx').then(m => ({ default: m.ViewEntSheet })));
import { useDiscovery, report as discoveryReport, DISCOVERY_VERSION, buildIndex as discoveryBuildIndex, capabilities as discoveryCapabilities } from './discovery.js';
import {
  planAction as actionsPlan,
  availableActions as actionsAvailable,





} from './actions.js';
import { mergedProfile as profileOf, profiles as profileTable } from './profiles.js';
import { deviceCard, presentableDevices, presentationSummary } from './present.js';
import { healthReport, healthText } from './health.js';
import { probe as configProbe, reportLive as configReportLive, migrateFromLocalStorage, completerDepuisLocal, collectLocal, createConfig, doitRelire, CONFIG_VERSION } from './config.js';
import { compteDe, poserEnAttente, purgerEnAttente, renvoyerEnAttente } from './enattente.js';
import { resolveAll, report as resolveReport } from './resolve.js';
import { LoggiaContext, buildRuntime } from './runtime.js';
import {

  cvId,
  onPaintReady,
  Barriere
} from './ui.jsx';
/* Le formulaire d'un rendez-vous (« + » de la feuille du Calendrier) a suivi la feuille dans feuillecalendrier.jsx (boot, 19/10) :
 * plus rien ici ne l'ouvrait. Le rail a le sien dans feuilleagenda.jsx. */
import { lumieresDe } from './lumieres.js';
import { sysKeys } from './sysconf.js';
import { hueScripts, notifIds } from './lectures.js';
// Le code d'un profil Admin : chargé quand on passe à ce profil (chantier Volets, la borne du démarrage).
const PinModal = lazyRecharge(() => import('./pinmodal.jsx').then(m => ({ default: m.PinModal })));
import { reposerFocus, titreDeVue } from './focus.js';
/* L'écran de veille (chantier Volets, la borne du démarrage) : il ne paraît
 * qu'après un temps sans geste — un décor, chargé à ce moment-là ;
 * introuvable même après le rechargement, il ne rend rien. */
const AmbientOverlay = lazyRecharge(() => import('./ecranveille.jsx').then(m => ({ default: m.AmbientOverlay })), { decor: true });
import { nomScenario, scenariosAccueil } from './scenarios.js';
/* L'assistant : sa popup tire l'orbe, qui tire Three.js. Rien de tout cela
 * ne se telecharge tant qu'on ne lui a pas parle. */
const AssistantSheet = lazyRecharge(() => import('./views/assistant.jsx'));
import {
  LOGGIA_RESOLVED, setLoggiaState, readLS, cfgVal, cfgSet, getHass, loggiaEnt, estPersonnelle,
  enHaids, medPlayers, normRooms, secAlarm, switchLights, ctxLumieres, LOGGIA_CONFIG_KEYS, droitsDe, usersSig,
  vacSensors, compteOrdinaire, dimmableLights
} from './state.js';
// L'accueil de premiere installation ne sert qu'une fois : son code n'a pas a
// peser dans le bundle de chaque ouverture.
const Onboarding = lazyRecharge(() => import('./Onboarding.jsx'));
import { tr, preparerLangue } from './i18n.js';
import { dec, hx, rmNorm, climateZones, lireEpingles, plantesDeLaMaison, capteursPlante, useHass, estDehors, masqueDe, poserCompteursMaison, croqKeys } from './app/noyau.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { readZone } from './app/noyau.jsx';
import { RM_ICO, GlypheCarte } from './cartes/briques.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { BIN_ETATS, PileRepere, PlaqueBascule, RM_MILIEU, RmJauge, emChiffre } from './cartes/briques.jsx';
import { RoomGenericCard } from './cartes/generique.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { BarreMesure, ChiffreMesure, RoomMesureCard, reperesSerres, useVueMesure } from './cartes/mesure.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { CarteGroupe, RoomGroupeCard, RoomPilesCard, RoomVigilanceCard, pucesQuiTiennent } from './cartes/groupe.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { RoomPriseCard } from './cartes/prise.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { RoomLightCard, useVueLumiere } from './cartes/lumiere.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { RoomRobotCard, useVueRobot } from './cartes/robot.jsx';
import { clesDeLaBorne } from './cartes/eauborne.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { RoomCoverCard, RoomVoletCard } from './cartes/volet.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { MOT_MODE, RoomClimateCard, RoomPilotCard, RoomPilotSheet, ValeurEtiquette, motLePlusLong, motLong, reprendreLaMain } from './cartes/chauffage.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { BRIQUES_MEDIA, CarteEnfant, RoomMediaCard, useVueLecteur } from './cartes/media.jsx';
import { useDomainCards, FicheAppareil, adresseDessin } from './appareils/fiches.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { BRIQUES_CAPTEUR, BRIQUES_GROUPE, BRIQUES_SWITCH, CarteDistributeur, FicheBinaire, FicheCapteur, FicheDistributeur, FicheGroupe, FicheMachineHero, FicheMedia, FichePlante, FicheRobot, LigneEntite, RangeePile, RoomClimateSheet, RoomCoverSheet, RoomLockSheet, RoomSwitchSheet } from './appareils/fiches.jsx';
import { ouvrantsDe, CAMERAS, CameraTile, CvAlarm, CvSirene, armCompte, sousCamera, useSeconde } from './cartescustom/cartes.jsx';
import { useCoarse, useWide } from './app/ecran.jsx';
import { useLayoutEditor, ROOM_LAYOUT_KEY, layoutOf } from './edition/disposition.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { filtresEntite } from './app/noyau.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { RoomPlantCard } from './cartes/plante.jsx';
import { BiblioView, CustomView, CardEditSheet, ComposeurCartes } from './edition/coquilles.jsx';
import { habillagePiece, capteurBruitPiece } from './app/pieces.jsx';
import { scenarios, CarteScenario, lancerScenario } from './app/scenarios.jsx';
import { ChoixIcone, EditableCard, BandeauEdition, CarteAjout, DOMAINES_EDITION } from './edition/briques.jsx';
import { Header, HeaderCtx } from './chrome/entete.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { appareilsRecherche } from './chrome/entete.jsx';
import { RoomView } from './vues/piece.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { Sparkline } from './vues/piece.jsx';
import { ObjetsView, OBJ_FILTRES } from './vues/objets.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { EntetePrisesVive, SectionsCapteursVive, chauffentParmi, jugerObjet, objetsDeLaMaison } from './vues/objets.jsx';
import { ScenariosView } from './vues/scenarios.jsx';
import { voletKeys, VoletsView } from './vues/volets.jsx';
import { ViewEmpty, EnergieView, SecuriteView, SystemeView, ParametresView } from './vues/simples.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { ecartDe, nomDeCle, switchsEcartes, noteEcartes } from './app/noyau.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { mesureJugee, vueMesure } from './cartes/mesure.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { chauffeDeZone } from './cartes/chauffage.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { FichePrise, lirePlante } from './appareils/fiches.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { roomEntitiesBrutes } from './app/decouverte.jsx';
import { peopleList, bannerKeys, ChoixCamDispo, CvPresence, CarteAjoutSheet, ChipsEditSheet, CvActivite, CvAir, CvBigSensor, CvCalendrier, CvCamera, CvCarte, CvChip, CvChips, CvClock, CvEnergie, CvHistory, CvOuvrants, CvPerson, CvTyped, CvWeather, FicheCarte, biblioStates, cvAvecH, cvAvecW, cvRowsDe, cvTypeDe, CV_TYPE_NOMS, cvW, nomCv } from './cartescustom/galerie.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { CvBigToggle, chipTexte } from './cartescustom/galerie.jsx';
import { ACC_AJOUTEES_DEFAUT, CarteAttention, Num, sunInfo, PieceCard } from './accueil/briques.jsx';
import { Dashboard } from './accueil/dashboard.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { RmBascule } from './cartes/briques.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { FicheChauffage } from './appareils/fiches.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { cvIcoEntite, CvCard } from './cartescustom/cartes.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { discoverLights } from './app/decouverte.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { RoomComfortModal } from './vues/piece.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { zonesQuiChauffent } from './vues/objets.jsx';
import { Sidebar } from './chrome/barrelaterale.jsx';
import { MobileNav } from './chrome/navmobile.jsx';
import { mowerId, mowerSensor } from './app/derive.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { deriveAccueil, deriveNotifs } from './app/derive.jsx';
import { useConnexionApp, useToastApp, useMeteoApp, useAccueilApp, useJournalApp, useReglagesEcran, matchHaUser, useAssistantApp, useComptesApp, useOnboardingApp } from './app/hooks.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { priseDe } from './app/noyau.jsx';
// eslint-disable-next-line no-unused-vars -- les tests les exportent d’ici (ADR 0282)
import { lireNombre } from './cartes/mesure.jsx';
/* Le groupe des reglages se reconnait a un DRAPEAU, pas a son titre.
 *
 * Il etait repere par `g.group === NAV_REGLAGES`, une comparaison de texte. Des
 * que le titre est passe par la traduction, elle a echoue : en anglais, le
 * groupe Systeme remontait au-dessus des vues secondaires au lieu de rester en
 * bas — l'ordre du menu changeait avec la langue. Un drapeau ne se traduit pas. */

/* Le bandeau rouge de tête — connexion perdue, découverte interrompue.
 *
 * Il portait ses couleurs en dur (`rgba(239,68,68,.94)` et du blanc), hors du
 * thème et hors de la garde de contraste : 3,77:1, sous le seuil, pour le seul
 * message qu'il faut absolument pouvoir lire (plan M7). `--o-bad` est le rouge
 * d'alerte que `contraste.js` protège dans chaque thème, et l'opacité tombe —
 * un bandeau d'alerte n'a aucune raison de laisser voir au travers. */
const BANDEAU_ALERTE = { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 400, background: 'var(--o-bad)', color: '#fff', fontSize: 12, fontWeight: 700, textAlign: 'center', padding: '7px 14px calc(7px + var(--o-safe-top,0px))' };

/* ─────────────────────────────────────────────────────────────────────────────
 * Le filet des etats optimistes, `useOptimiste`, vit dans `optimiste.js`
 * depuis le lot 15 de l'audit du 03/10 : Parametres, charge a part, tenait
 * le sien sans minuteur. Un seul hook, importe partout.
 * ───────────────────────────────────────────────────────────────────────────── */

// <ActionBtn onClick style>label</ActionBtn> : ripple au clic + « ✓ » 900 ms qui remplace le label (commande envoyée)
/* `Shiny` — un balayage lumineux sur un badge actif — est parti le 07/10 :
 * « il y a un effet de balayage dessus enleve le ». La pastille « Solaire
 * actif » etait son dernier lecteur. */
/* La cascade d'entree est partie le 21/08 (demande user). Restait `stag`, une
 * fonction qui rend `undefined` — et son commentaire disait la garder « pour
 * les ~200 appels existants ». Il en restait UN, qui etalait `undefined` dans
 * un style (audit du 27/09). La classe CSS `.o-stag`, elle, sert toujours :
 * c'est par elle qu'`onPaintReady` relance les animations mises en pause. */
// relance les animations CSS en pause une fois le 1er paint atteint (cartes montées avant l'affichage de l'iframe)
onPaintReady(() => { try { document.querySelectorAll('.o-stag, .o-draw, .o-fadein').forEach(el => { el.style.animationPlayState = 'running'; }); } catch {} });
// Les scènes et scripts liés : sondés avec l'Accueil, comme les anciennes scènes rapides.
const qsKeys = () => scenarios().map(s => s.lien).filter(Boolean);
// Le même défaut pour le report des gestes de l'admin à tous les profils (contenupartage.js, 20/10).
poserDefautsAccueil(ACC_AJOUTEES_DEFAUT);

// Capteurs qui alimentent les notifications. Rien de standard non plus : un
// lave-vaisselle sur prise commandée ou un calendrier de collecte se désignent.

// Entités de la tondeuse à poller : les siennes, pas celles d'un modèle précis.
function mowerKeys() {
  const S = (getHass() || {}).states || {};
  return [mowerId(S), mowerSensor(S, 'battery'), mowerSensor(S, 'charging'), mowerSensor(S, 'progress')].filter(Boolean);
}

// Plage du dial Nest (labels 10°/20°/30°) + palette d'arc fixe (rouge → magenta → violet)

/* Les clés d'une zone : ce qu'elle commande, la puissance d'un module découvert
 * (« Chauffe » se lit sur elle) et, sauf `mesures` à faux, son thermomètre —
 * la vue Objets ne suit que ce qu'elle commande. */
const climateKeys = (mesures = true) => climateZones(null).flatMap(z => [z.haid, z.tempCible, z.modeEnt, z.autoEnt, z.puissance, mesures ? z.tempSensor : null].filter(Boolean));

/* ════════════ VUE ÉNERGIE (package energie.yaml v3 + arc solaire type Helios) ════════════ */
/* Les PARTS d'une grandeur (deux onduleurs, deux batteries ; chantier G3, ADR 0302) sont des listes : elles se suivent comme les clés seules. */
const enKeys = () => [...Object.values(enHaids()).flat(), ...enDevices(null).flatMap(d => [d.power, d.kwh])].filter(Boolean);
const EN_ART = ['pc', 'nas', 'radiator', 'dishwasher'];
const EN_LOOK = [['briefcase', 'var(--o-cyan)'], ['microchip', 'var(--o-purple)'], ['thermometer-half', 'var(--o-orange)'], ['utensils', 'var(--o-accent-soft)'], ['bolt', 'var(--o-rose)']]; // 'plug' n'existe pas dans la fonte UICons
function enDevices(S) {
  const cfg = loggiaEnt('energyDevices', null);
  if (Array.isArray(cfg) && cfg.length) return cfg.filter(d => d && (!S || S[d.power] || S[d.kwh]));
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.energy;
  const list = (r && r.available && r.devices && r.devices.length) ? r.devices : null;
  if (list) return list.map((d, i) => ({
    name: d.name, power: d.power, kwh: d.kwh, art: EN_ART[i % EN_ART.length],
    icon: EN_LOOK[i % EN_LOOK.length][0], c: EN_LOOK[i % EN_LOOK.length][1],
  }));
  return [];
}

/* ════════════ VUE ASPIRATEUR (reproduction fidèle de "Loggia Aspirateur.dc.html") ════════════ */
const VAC_KEYS = [];   // le poll vient de vacKeys() : préfixe de domaine + entités résolues
// Consommables : la plupart des aspirateurs n'exposent pas d'entité d'usure → valeurs indicatives.


// Vue atteinte alors que l'installation n'a pas de quoi la remplir.
/* Les identifiants de vue que l'application sait rendre (23/09, plan M5).
 *
 * La vue courante survit dans `sessionStorage`. Un identifiant INCONNU — onglet
 * d'une version anterieure, `?vue=home` tape a la main, lien perime — ne
 * correspondait a aucune branche du rendu et tombait sur le tableau de bord
 * SANS donnees : sept pieces d'exemple avec des releves inventes (18,1 degres,
 * 412 ppm), « Tout va bien », et « Home Assistant n'est pas joignable » alors
 * que la connexion etait la. Reproduit sur la demonstration en ligne.
 *
 * La maison d'exemple garde sa raison d'etre : c'est l'ecran d'AVANT la
 * premiere connexion. Elle ne doit simplement plus servir de repli a une
 * erreur de route. Une vue inconnue revient donc a l'accueil.
 *
 * « croquettes » en est sortie le 04/10 avec sa vue : un onglet qui l'avait
 * memorisee, ou `?vue=croquettes`, retombe ainsi sur l'accueil. */
const VUES_RENDUES = new Set(['accueil', 'parametres', 'pieces', 'scenes', 'objets',
  'energie', 'securite', 'systeme', 'lumieres', 'climat', 'volets', 'voletsplan',
  'medias', 'biblio']);
const vueRendue = (v) => !!v && (VUES_RENDUES.has(v)
  || v.indexOf('room:') === 0 || v.indexOf('cv:') === 0);

/* ════════════ VUE MÉDIAS (reproduction fidèle de "Loggia Médias.dc.html") ════════════ */
// Vrais media_player (Apple TV + Echos Alexa + Soundbar).

const medKeys = () => medPlayers().flatMap(p => [p.haid, p.ma]).filter(Boolean);

/* La vue Medias a disparu le 14/09/2026 : la vue Objets, filtre « Multimedia »,
 * dessine les lecteurs aux cartes de la piece, et leur fiche garde les
 * commandes. La route `medias` y mene. */

/* ════════════ VUE SÉCURITÉ (design fidèle "Loggia Sécurité.dc.html", câblé HA réel) ════════════ */
const secBaseKeys = () => {
  const cams = loggiaEnt('cameras', null);
  const gens = peopleList();
  return [secAlarm(),
    // Même garde que `cfg.cams` (05/10) : ces clés se calculent à chaque rendu.
    ...(Array.isArray(cams) ? cams.filter(c => c && typeof c === 'object').flatMap(c => [c.haid, c.motion, c.person, c.vehicle, c.sonnette, c.colis]) : []),
    ...gens.map(x => x.haid)].filter(Boolean);
};
// Les capteurs de plante (humidité, conductivité, luminosité) n'ont pas de
// regroupement standard : sans configuration, il n'y a rien à montrer.
/* Les entites a suivre : celles que `plantCapteur` retiendra, pas une liste de
 * suffixes ecrite d'avance. */
const plantKeys = () => {
  const S = (getHass() || {}).states || null;
  if (!S) return [];
  // Les plantes découvertes comme les configurées (C29) : les capteurs de leur appareil, sinon ceux de leur base.
  return plantesDeLaMaison(S).flatMap(p => Object.values(capteursPlante(S, p)).filter(Boolean));
};
/* Une FONCTION, pas une table.
 *
 * Evaluee a l'import, cette liste figeait ses libelles dans la langue du
 * demarrage. C'est ce qui obligeait a recharger la page apres un changement de
 * langue. Appelee au rendu, elle se dit dans la langue du moment. */
const FIRST_USER = () => [{ name: 'Administrateur', role: 'Admin', sub: tr('Profil par défaut'), c: 'var(--o-accent)' }];
/**
 * Image d'un profil : l'avatar choisi dans Loggia d'abord, sinon la photo du
 * profil Home Assistant.
 *
 * Le rapprochement passe par le compte (`user_id` de l'entite `person`), et
 * seulement a defaut par le nom : c'est le meme principe que `matchHaUser`.
 */
/** Cle de rendu stable : les profils n'ont pas d'identifiant propre. */
const withUserKeys = (a) => a.map((u, i) => (u._k ? u : { ...u, _k: 'u' + i + '_' + Math.random().toString(36).slice(2, 6) }));

export default function App() {
  // ── Decouverte de l'installation (etape 1 du passage en dashboard generique) ──
  // Lit les registres HA et en deduit les capacites. AUCUNE vue ne s'en sert
  // encore : c'est le socle. Verification sur une install reelle, en console :
  //   loggiaDiscovery.report()
  const discovery = useDiscovery(getHass());
  // Configuration serveur (etape 2) : alimente le contexte des vues.
  const [serverCfg, setServerCfg] = useState({});
  /* ADR 0067 : ce qu'un autre ecran ecrit arrive ici sans rechargement.
   * `relireRef` relit la configuration du serveur ; en edition, la relecture
   * attend la fin (`enAttenteRef`) pour ne pas bousculer un rangement. */
  const editRef = useRef(false);
  const enAttenteRef = useRef(false);
  const relireRef = useRef(null);
  // Le composant a-t-il repondu ? Distingue « pas de configuration » de
  // « configuration vide », que rien ne separait jusqu'ici.
  const [serverOk, setServerOk] = useState(false);
  /* Le passage du LOCAL au SERVEUR, une seule fois (11/10).
   *
   * Huit reglages se lisent au MONTAGE — la grille de l Accueil, le profil,
   * l agenda, l historique, l ordre des scenarios, la disposition des cameras,
   * la vue des pieces, et le menu. A cet instant le composant n a pas encore
   * repondu : `cfgVal` retombe alors sur le stockage du NAVIGATEUR, et ce
   * stockage appartient a UNE adresse.
   *
   * Les donnees, elles, sont bien dans Home Assistant — « HAOS est le serveur
   * qui heberge Loggia, donc les donnees sont enregistrees dans HAOS ; du coup
   * peu importe quel lien on utilise, je devrais avoir la meme chose ». C'est
   * juste : le defaut n'est pas dans le rangement, il est dans la LECTURE.
   *
   * « Si je modifie en interne une disposition ou bien les vues et que je
   * bascule sur le lien externe, je n ai pas la meme chose. » Les deux liens
   * sont deux origines : chacune avait garde sa copie, et rien ne les relisait
   * quand la configuration commune arrivait.
   *
   * Une cle qui change remonte le sous-arbre : tout se relit, cette fois
   * depuis le serveur. Une seule bascule, jamais le retour — une coupure de
   * reseau ne doit pas rejeter l ecran. */
  const [servi, setServi] = useState(false);
  useEffect(() => { if (serverOk) setServi(true); }, [serverOk]);
  /* Le compte Home Assistant de CETTE session est-il administrateur ?
   *
   * Lui seul ecrit la configuration de la maison. Le dashboard doit le
   * savoir pour ne pas TENTER des ecritures automatiques qui seront
   * refusees : la liaison d'un profil a son compte Home Assistant se
   * declenche toute seule au chargement, et elle ferait apparaitre un refus
   * a chaque ouverture.
   *
   * Les gestes qu'un compte ordinaire ne pourrait jamais enregistrer se
   * MASQUENT aussi depuis le 03/10, mais par `compteOrdinaire(hass)` : il lit
   * Home Assistant lui-meme, alors que cet etat reste faux tant que le
   * composant n'a pas repondu — un administrateur verrait ses gestes
   * arriver apres l'ecran. */
  const [haAdmin, setHaAdmin] = useState(false);
  // Les fonctions pures du fichier — et les vues chargees a la demande — lisent
  // cet etat : on le tient a jour ici, pendant le rendu, pour qu'il soit juste
  // des le meme tour.
  setLoggiaState({
    index: discovery.index || null,
    ent: (serverCfg && serverCfg.loggia_entities) || {},
    cfg: serverCfg || {},
    // Tant que le composant n'a pas repondu, le stockage local reste la seule
    // source. Des qu'il repond, c'est lui qui fait foi.
    server: serverOk,
  });
  /* Le menu se relit quand la configuration change (10/10).
   *
   * Les vues masquees et leur ordre viennent maintenant du serveur, et le menu
   * les lit UNE fois au montage (`useState(readViewsCfg)` dans la barre). Sans
   * ce signal, la reponse du composant — ou un changement fait depuis un autre
   * ecran — n'arriverait qu'au prochain rechargement de la page.
   *
   * On reutilise l'evenement que Parametres emet deja ; la signature evite
   * d'en emettre un a chaque rendu. */
  const sigVues = JSON.stringify([
    (serverCfg && serverCfg['loggia-hiddenviews']) || null,
    (serverCfg && serverCfg['loggia-shownviews']) || null,
    (serverCfg && serverCfg['loggia-vueordre']) || null,
  ]);
  useEffect(() => { try { window.dispatchEvent(new Event('loggia-views-changed')); } catch { /* sans navigateur */ } }, [sigVues]);
  // La langue se resout ICI, apres `setLoggiaState` : « suivre Home Assistant »
  // lit le compte HA, et le choix explicite vit dans la configuration qu'on vient
  // de poser. Resolue pendant le rendu, elle est juste des le meme tour pour tous
  // les `t()` en dessous.
  preparerLangue(getHass());
  // Les mots de Home Assistant arrivent apres coup quand la langue choisie n'est
  // pas celle du compte : ce compteur force un rendu de plus a leur arrivee.
  const [, setLangueVersion] = useState(0);
  useEffect(() => {
    const f = () => setLangueVersion(v => v + 1);
    window.addEventListener('loggia-langue-prete', f);
    // Choix explicite d'une langue : plus de rechargement, un redessin suffit.
    // `preparerLangue` sera rappele au rendu suivant et relira la configuration.
    window.addEventListener('loggia-langue-changee', f);
    return () => {
      window.removeEventListener('loggia-langue-prete', f);
      window.removeEventListener('loggia-langue-changee', f);
    };
  }, []);
  /* Resolution memoisee : le parcours des entites ne doit pas tourner a chaque
   * rendu. Mais il LIT `hass.states`, et n'en dependait pas : une entite
   * devenue `unavailable`, supprimee ou revenue laissait la resolution — donc
   * la disponibilite des vues — figee sur l'etat du premier rendu.
   *
   * La signature ne retient que ce qui compte ici : quelles entites existent et
   * lesquelles repondent. Elle ignore les valeurs, qui changent sans arret et
   * relanceraient le calcul pour rien.
   *
   * `getHass()` et non `hass` : la variable locale n'est declaree que 270 lignes
   * plus bas, parce que les cles a surveiller dependent justement du runtime
   * calcule ici. La lire d'en haut tombait dans sa zone morte et le dashboard
   * ne s'affichait plus du tout.
   *
   * Deux comptes suffisent : combien d'entites existent, combien repondent. Un
   * echange exact dans la meme synchronisation — une entite part, une autre
   * arrive — passerait inapercu jusqu'au changement suivant ; trier ou hacher
   * les cles a chaque rendu couterait plus cher que ce cas ne le merite. */
  const sigEntites = (() => {
    const S = (getHass() || {}).states;
    if (!S) return '';
    const cles = Object.keys(S);
    let vivantes = 0;
    for (let i = 0; i < cles.length; i++) {
      const e = S[cles[i]];
      if (e && e.state !== 'unavailable' && e.state !== 'unknown') vivantes++;
    }
    return cles.length + ':' + vivantes;
  })();
  /* Le composant serveur fait foi, mais il n'est pas toujours là : sans
   * composant installé — et en démonstration — la configuration vit dans le
   * stockage de l'appareil. La DISPONIBILITÉ des vues ne lisait que le
   * serveur : une vue configurée en local restait masquée pour toujours, avec
   * le message « le tableau de bord Énergie n'est pas configuré » sous les
   * yeux de quelqu'un qui venait justement de la configurer. */
  const cfgVues = useMemo(() => {
    const local = {};
    LOGGIA_CONFIG_KEYS.forEach(k => { const v = readLS(k, null); if (v != null) local[k] = v; });
    return { ...local, ...(serverCfg || {}) };
  }, [serverCfg, sigEntites]);
  const loggiaRuntime = useMemo(
    () => buildRuntime({ discovery, userCfg: cfgVues, states: (getHass() || {}).states || {} }),
    [discovery.ready, discovery.caps, cfgVues, sigEntites]
  );
  setLoggiaState({ resolved: loggiaRuntime.resolved || null });
  poserCompteursMaison(loggiaRuntime.energyPrefs || null);
  /* Ce que le serveur tient, pour l'empreinte du carnet (audit du 03/10).
   * Une reference et non `serverCfg` : `saveCfg` est fige au premier rendu,
   * il ne verrait que `{}`. `null` tant que le composant n'a pas repondu —
   * une empreinte prise sur rien ferait abandonner au renvoi un reglage que
   * personne n'a depasse. Elle porte aussi nos ecritures optimistes : c'est
   * prevu, `enattente.js` les reconnait comme NOS envois. */
  const cfgServeurRef = useRef(null);
  cfgServeurRef.current = serverOk ? serverCfg : null;
  // Ecriture d'un reglage : serveur si le composant repond, localStorage sinon.
  // L'etat local est mis a jour tout de suite, sans attendre l'aller-retour.
  const saveCfg = useCallback((patch) => {
    /* Au carnet AVANT l'envoi (28/09) : une page actualisee pendant
     * l'aller-retour, ou un serveur qui redemarre, laissait le reglage dans ce
     * seul navigateur — et la valeur du serveur, plus ancienne, revenait au
     * chargement suivant. `enattente.js` le renvoie alors.
     *
     * Avec l'empreinte de ce que le serveur tenait (audit du 03/10) : renvoye
     * des jours plus tard, le reglage ecrasait sinon un rangement fait
     * entre-temps sur un autre ecran.
     *
     * Et sous le compte qui ECRIT (audit du 03/10). Range pour tout le
     * navigateur, un reglage de la maison tente depuis un compte ordinaire
     * attendait le demarrage suivant, et repartait sous le compte qui ouvrait
     * alors la page — un administrateur sur la meme tablette, et
     * `loggia_users` ou `loggia_rooms = []` passaient sous SES droits. */
    const h = getHass();
    const compte = compteDe(h);
    const marques = poserEnAttente(patch, compte, cfgServeurRef.current);
    /* Ce que chaque cle valait AVANT : un refus le remet a l'ecran (audit du
     * 03/10, plus bas). Releve dans la mise a jour elle-meme, qui voit l'etat
     * du moment, et non une copie figee par `useCallback`. */
    const avantEnvoi = {};
    setServerCfg(c => {
      const n = { ...c };
      Object.keys(patch).forEach(k => { avantEnvoi[k] = c[k]; if (patch[k] == null) delete n[k]; else n[k] = patch[k]; });
      return n;
    });
    const local = () => {
      try {
        Object.keys(patch).forEach(k => {
          if (patch[k] == null) localStorage.removeItem(k);
          else localStorage.setItem(k, JSON.stringify(patch[k]));
        });
      } catch {}
    };
    /* L'ISSUE se rend (audit du 03/10), en promesse qui ne rejette jamais :
     * `false` quand le composant REFUSE, `null` quand le transport a coupe (le
     * lot attend au carnet), `true` sinon — sans composant aussi. Qui l'ignore
     * n'a rien a rattraper ; l'accueil la lit pour ne pas garder a l'ecran une
     * grille que le serveur n'a pas prise (`saveAccL`). */
    if (h && h.callWS) {
      return h.callWS({ type: 'loggia/config/set', config: patch }).then(() => purgerEnAttente(marques, compte)).then(() => true).catch((e) => {
        /* Un refus de DROITS ne se copie pas sur l'appareil (audit du 03/10).
         * `completerDepuisLocal`, au passage suivant d'un administrateur,
         * confie au serveur les cles qu'il n'a pas : la valeur refusee a un
         * compte ordinaire — `loggia_users` dans une maison qui n'en a pas
         * encore — y serait partie sous SES droits. Les autres echecs gardent
         * leur repli : serveur absent, coupure, plafond. */
        // Le passage refusé vers un profil Admin aussi : son code à lui depuis
        // l'audit du 03/10 (`code_admin_requis`), le même refus de droits.
        if (!(e && (e.code === 'not_admin' || e.code === 'code_admin_requis'))) local();
        /* Un serveur ABSENT est un cas normal : le repli local suffit, et l'on
         * n'alarme pas qui n'a pas installe le composant.
         *
         * Un serveur qui REFUSE est tout autre chose. L'etat optimiste a deja
         * pose la valeur a l'ecran ; elle y restera toute la seance, puis ne
         * sera plus la au rechargement. Se taire fait mentir l'interface — et
         * c'est ce qui arrive au-dela des plafonds de `store.py`, ou le serveur
         * repond une erreur precise que personne ne lisait.
         *
         * Un refus applicatif porte un `code` ; une deconnexion, non. On relance
         * donc le rejet, que l'ecoute globale plus bas rend visible. */
        if (e && e.code) {
          console.error('Loggia : reglage refuse par le serveur', Object.keys(patch), e);
          /* Refuse, le lot ne laisse rien derriere lui (audit du 03/10).
           *
           * Ni a l'ecran : chaque cle reprend sa valeur d'avant l'envoi, sauf
           * si elle a ete reecrite depuis. Restee la, elle tenait toute la
           * seance — une piece renommee pour rien, et une grille d'accueil
           * refusee qu'un retour sur l'accueil relisait (`accL` nait de
           * `cfgVal`), puis qu'un geste suivant, accepte lui, reecrivait dans
           * le commun. Le toast dit le refus ; l'ecran n'a plus a le contredire.
           *
           * Ni au carnet : il n'y attendait que le prochain demarrage, pour y
           * etre refuse de nouveau — et emporter dans son refus tout ce qui
           * attendait avec lui, le carnet repartant d'un seul lot. Meme regle
           * que `renvoyerEnAttente`. */
          setServerCfg(c => {
            const n = { ...c };
            Object.keys(patch).forEach(k => {
              if (!(k in avantEnvoi) || c[k] !== (patch[k] == null ? undefined : patch[k])) return;
              if (avantEnvoi[k] === undefined) delete n[k]; else n[k] = avantEnvoi[k];
            });
            return n;
          });
          purgerEnAttente(marques, compte);
          Promise.reject(e);
          return false;
        }
        return null;
      });
    }
    local();
    return Promise.resolve(true);
  }, []);
  /* Ce qu'un module du COMPOSANT vient d'ecrire et rend (`cfgRecue`,
   * state.js) : la configuration du mode enfant que rend `loggia/enfant/config`
   * (18/10). Posee dans l'etat telle quelle, sans `config/set` ni carnet :
   * c'est le serveur qui vient de l'ecrire. */
  const recuCfg = useCallback((cle, valeur) => setServerCfg(c => ({ ...c, [cle]: valeur })), []);
  // Confié APRÈS sa déclaration : plus haut, `saveCfg` serait encore en zone
  // morte temporelle et le rendu entier échouerait.
  setLoggiaState({ save: saveCfg, recu: recuCfg });
  useEffect(() => {
    try {
      window.loggiaDiscovery = {
        version: DISCOVERY_VERSION,
        get ready() { return discovery.ready; },
        get caps() { return discovery.caps; },
        get index() { return discovery.index; },
        get devices() { return discovery.devices; },
        get abilities() { return discovery.abilities; },
        get knowledge() { return discovery.knowledge; },
        // Les pieces telles que la configuration et les zones les donnent :
        // sans elles, impossible de voir ou l'appariement piece/zone echoue.
        get rooms() { try { return cfgRef.current; } catch { return null; } },
        get health() { return discovery.health; },
        healthText: () => { const t = healthText(discovery.health); console.log(t); return t; },
        get errors() { return discovery.errors; },
        refresh: discovery.refresh,
        report: () => { const t = discoveryReport(discovery); console.log(t); return t; },
        // Le contexte que le moteur d'actions attend, prêt à l'emploi.
        get ctx() {
          const h = getHass();
          return { states: (h && h.states) || {}, services: discovery.index && discovery.index.services };
        },
        // fonctions pures : utilisables sur des installations fictives
        buildIndex: discoveryBuildIndex,
        capabilities: discoveryCapabilities,
        planAction: actionsPlan,
        availableActions: actionsAvailable,
        profileOf,
        profileTable,
        deviceCard,
        healthReport,
        presentableDevices,
        presentationSummary,
      };
    } catch {}
  }, [discovery.ready, discovery.caps]);

  // ── Configuration par utilisateur (etape 2) ──
  // Sonde le composant `loggia` et expose de quoi verifier / migrer a la main.
  // Rien n'est consomme par les vues : les reglages continuent de passer par le
  // localStorage tant que l'etape 3 n'a pas bascule les appels.
  useEffect(() => {
    let alive = true;
    let minuteur = null;
    let desabonner = null;
    let relance = null;
    // Combien de fois insister avant d'abandonner, et a quel rythme. Une seule
    // tentative ne suffit pas : dans l'application mobile, l'iframe demarre
    // pendant que Home Assistant construit encore son arbre, et `getHass()`
    // rend alors null. Sans nouvelle tentative, la configuration du serveur
    // n'arrivait JAMAIS sur ces appareils — le dashboard retombait sur le
    // stockage local et la decouverte brute, d'ou des cameras, des lecteurs et
    // des profils differents de ceux du PC.
    const ATTENTES = [200, 400, 800, 1500, 2500, 4000, 6000];
    let essai = 0;

    const reessayer = () => {
      if (essai >= ATTENTES.length) return;
      minuteur = setTimeout(sonder, ATTENTES[essai++]);
    };

    const sonder = () => {
      if (!alive) return;
      const h = getHass();
      if (!h) { reessayer(); return; }
      configProbe(h).then(state => {
        if (!alive) return;
        // Le composant peut n'etre pas encore pret alors que `hass` l'est : on
        // retente aussi dans ce cas, sinon un demarrage de Home Assistant
        // laisserait l'appareil en mode local jusqu'au rechargement suivant.
        if (!state.available) { reessayer(); return; }
        appliquer(h, state);
      });
    };

    const appliquer = (h, state) => {
      setServerOk(!!state.available);
      setHaAdmin(!!(state.available && state.user && state.user.is_admin));
      setServerCfg(state.available ? (state.config || {}) : {});
      /* ADR 0067 : un autre ecran ecrit, celui-ci relit. Le serveur ne dit
       * que le compte et les cles ; la relecture passe par `loggia/config/get`,
       * sous les droits de CE compte. Groupee (300 ms) : un rangement ecrit
       * plusieurs fois de suite. En edition, elle attend la fin. Un composant
       * qui ne connait pas le flux (pas encore redemarre) : tout continue
       * comme avant, sans suivi. */
      const monId = (state.user && state.user.id) || null;
      const relire = () => {
        if (editRef.current) { enAttenteRef.current = true; return; }
        clearTimeout(relance);
        relance = setTimeout(() => {
          if (!alive) return;
          configProbe(h).then(frais => { if (alive && frais.available) setServerCfg(frais.config || {}); });
        }, 300);
      };
      relireRef.current = relire;
      if (state.available && h.connection && typeof h.connection.subscribeMessage === 'function') {
        h.connection.subscribeMessage((chg) => { if (alive && doitRelire(chg, { userId: monId })) relire(); }, { type: 'loggia/config/suivre' })
          .then(u => { if (!alive) { try { u(); } catch {} } else desabonner = u; })
          .catch(() => { /* composant ancien : sans suivi, comme avant */ });
      }
      /* Ce qui n'etait jamais arrive part MAINTENANT, avant tout le reste :
       * le carnet porte des valeurs plus recentes que celles du serveur, et
       * c'est la seule occasion de les lui donner. Un refus applicatif y
       * renonce de lui-meme (`enattente.js`), sans retenter a chaque ouverture.
       *
       * Sauf ce qu'un autre ecran a range depuis (audit du 03/10) : le carnet
       * compare a la configuration qu'on vient de lire, et le serveur garde le
       * dernier rangement — renvoyer la valeur du carnet l'aurait ecrase.
       *
       * Et seul part le carnet de CE compte (audit du 03/10) : `monId` est le
       * compte de la connexion, celui dont les droits s'appliqueront. Ce
       * qu'un autre compte a laisse sur l'appareil attend son auteur. */
      renvoyerEnAttente(h, monId, state.available ? state.config : null)
        .then(r => {
          if (!alive || !r.cles.length) return;
          console.info('Loggia : %d reglage(s) renvoyes au serveur', r.cles.length, r.cles);
          return configProbe(h).then(frais => { if (alive && frais.available) setServerCfg(frais.config || {}); });
        })
        .catch(() => { /* le carnet garde tout : on retentera au prochain demarrage */ });
      // Un reglage fait avant l'arrivee du composant n'existe que dans ce
      // navigateur. On le confie au serveur pour que les autres appareils le
      // voient — depuis un compte administrateur seulement, car lui seul ecrit
      // dans la partie commune. Rien n'est ecrase : le serveur garde toujours
      // sa version quand il en a une.
      if (state.available && state.user && state.user.is_admin) {
        completerDepuisLocal(h, state.config || {}, estPersonnelle)
          .then(r => {
            if (!alive || !r.cles.length) return;
            console.info('Loggia : %d reglage(s) locaux confies au serveur', r.cles.length, r.cles);
            return configProbe(h).then(frais => { if (alive && frais.available) setServerCfg(frais.config || {}); });
          })
          .catch(() => { /* le serveur refuse : on reste sur ce qu'on a */ });
      }
      window.loggiaConfig = {
          version: CONFIG_VERSION,
          state,
          local: collectLocal,
          access: createConfig({ hass: h, serverConfig: state.available ? state.config : null, user: state.user }),
          report: () => configReportLive(h).then(t => { console.log(t); return t; }),
        // Rejoue l'ecran de premier lancement (verification, demonstration).
        resetOnboarding: async () => {
          try { localStorage.removeItem('loggia_onboarded'); } catch {}
          await h.callWS({ type: 'loggia/config/set', config: { loggia_onboarded: null } });
          console.log('Premier lancement rearme — rechargez la page.');
        },
        // Adoption : recopie les constantes en dur dans la configuration
        // utilisateur (cle loggia_entities), pour pouvoir les retirer du code.
        // Resolution : ce que la decouverte deduit de l'installation.
        resolve: async () => {
          const st = await configProbe(h);
          const d = window.loggiaDiscovery;
          const ctx = { index: d && d.index, caps: d && d.caps, states: (h && h.states) || {}, userCfg: st.config || {} };
          const r = resolveAll(ctx);
          console.log(resolveReport(r));
          return r;
        },
          migrate: (dryRun = true, overwrite = false) =>
            migrateFromLocalStorage(h, { dryRun, overwrite }).then(r => { console.log(r); return r; }),
        };
    };

    sonder();
    return () => {
      alive = false;
      if (minuteur) clearTimeout(minuteur);
      clearTimeout(relance);
      if (desabonner) { try { desabonner(); } catch {} }
    };
  }, []);

  /* Lecture PARESSEUSE : l'effet d'application réécrit ces clés — les lire
   * dans un effet arrivait APRÈS la première écriture (le défaut écrasait le
   * réglage au double-montage de dev, et par pure chance d'ordre en prod). */
  const [themeMode, setThemeMode] = useState(() => { try { const m = localStorage.getItem('loggia-mode'); return (m === 'light' || m === 'dark' || m === 'auto') ? m : 'dark'; } catch { return 'dark'; } }); // base Loggia : clair/foncé/auto
  const [loggiaTheme, setLoggiaTheme] = useState(() => { if (SAFE_NOLOOK) return ''; try { const t = localStorage.getItem('loggia-theme'); return t != null ? t : ''; } catch { return ''; } });     // '' = défaut Loggia ; sinon preset natif (neumorphix/google/ios)
  const [haTheme, setHaTheme] = useState(() => { if (SAFE_NOLOOK) return ''; try { const h = localStorage.getItem('loggia-ha'); return h != null ? h : ''; } catch { return ''; } });           // '' = base Loggia ; 'FOLLOW' = suit HA ; sinon nom de thème HA
  const [lightMode, setLightMode] = useState(false);
  /* La vue courante survit au rechargement.
   *
   * Plusieurs reglages doivent recharger la page pour prendre effet — la langue,
   * les entites, la connexion. On repartait alors de l'accueil, et il fallait
   * retrouver son chemin a chaque changement. La vue est donc notee, puis
   * relue au demarrage.
   *
   * `sessionStorage` et non `localStorage` : l'endroit ou l'on se trouve
   * appartient a cet onglet et a ce moment. Un onglet neuf, ou Loggia rouvert
   * le lendemain, doit s'ouvrir sur l'accueil — pas sur la vue Energie
   * quittee l'avant-veille. */
  /* La vue memorisee est reprise DES LE PREMIER RENDU.
   *
   * Elle l'etait auparavant une fois les donnees arrivees, ce qui faisait
   * apparaitre l'accueil une seconde avant de basculer : un detour visible, et
   * genant quand on venait justement de regler quelque chose ailleurs.
   *
   * Ce detour existait pour une raison : Lumieres, Climat, Ouverture et Medias
   * lisent leur configuration sans verifier qu'elle existe, et se brisent si on
   * les monte avant la decouverte. La garde est donc descendue d'un cran — plus
   * bas, le rendu attend que les donnees soient la avant de monter la vue, et
   * montre en attendant une surface vide plutot que l'accueil. */
  const [view, setView] = useState(() => {
    try {
      const v = window.sessionStorage.getItem('loggia-vue');
      return vueRendue(v) ? v : 'accueil';
    } catch { return 'accueil'; }
  });
  useEffect(() => {
    try { window.sessionStorage.setItem('loggia-vue', view); } catch { /* stockage indisponible */ }
  }, [view]);
  /* Le focus suit la vue (audit du 03/10).
   *
   * Toute la vue se remonte quand on en change (`key={view}`, plus bas) : le
   * bouton qui venait de servir — « Ouvrir la pièce Salon », un retour, un
   * lien « voir tout » — partait avec elle, et le focus tombait sur <body>.
   * Au clavier, la tabulation suivante repartait du haut de la page ; au
   * lecteur d'écran, rien n'était annoncé. Le titre de la nouvelle vue le
   * reçoit : il s'annonce, et la tabulation repart de lui.
   *
   * Seulement si le focus est TOMBÉ : le menu latéral garde son bouton, qui
   * existe toujours. Pas au premier rendu non plus — on n'arrache pas le focus
   * à une page qui s'ouvre. Et `setView` reste nu : les vues le reçoivent tel
   * quel (`onNav={setView}`), c'est son EFFET qu'on rattrape ici.
   *
   * `voir` : changer de vue ne remonte pas la page. Ouverte depuis le bas de
   * l'Accueil, la pièce gardait le défilement, et son titre — focalisé —
   * restait 300 px au-dessus de l'écran (mesuré en démo). Au CLAVIER seulement
   * (`:focus-visible`), le titre revient à l'écran ; au doigt, rien ne bouge. */
  const vueRef = useRef(null);
  const vueFocus = useRef(view);
  useEffect(() => {
    if (vueFocus.current === view) return undefined;
    vueFocus.current = view;
    return reposerFocus(() => titreDeVue(vueRef.current), { voir: true });
  }, [view]);
  /* Et la position dans la page.
   *
   * On la note en continu plutot qu'au moment de recharger : `location.reload()`
   * est appele depuis une dizaine d'endroits, et il aurait fallu penser a chacun
   * — y compris ceux a venir. `pagehide` ne suffit pas non plus, iOS ne le
   * declenche pas toujours.
   *
   * La restauration attend deux images : la premiere pose la vue, la seconde la
   * remplit. Sauter a la position avant que le contenu existe ne menerait nulle
   * part. */
  useEffect(() => {
    const cle = 'loggia-defilement';
    /* Le navigateur restaure AUSSI la position, et il le fait APRÈS nous : sa
     * valeur (souvent zéro, la page n'étant pas encore remplie au moment du
     * rechargement) écrasait la nôtre. On lui retire la main. */
    try { if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'; } catch {}
    let t = 0;
    const ecrire = () => { try { window.sessionStorage.setItem(cle, String(document.documentElement.scrollTop || 0)); } catch {} };
    const noter = () => { clearTimeout(t); t = setTimeout(ecrire, 150); };
    window.addEventListener('scroll', noter, { passive: true });
    /* Un réglage enregistré recharge la page : la position doit être écrite
     * AVANT le départ, sans attendre les 150 ms du débounce — sinon on
     * revenait en haut (retour 01/09). */
    window.addEventListener('pagehide', ecrire);
    window.addEventListener('beforeunload', ecrire);
    const y = (() => { try { return +window.sessionStorage.getItem(cle) || 0; } catch { return 0; } })();
    /* La page se remplit par morceaux (vues paresseuses, données qui
     * arrivent) : on retente jusqu'à ce qu'elle soit assez haute pour
     * accueillir la position, puis on s'arrête. Deux images ne suffisaient
     * pas toujours. */
    let essais = 0, tid = 0;
    const restaurer = () => {
      if (y <= 0 || essais > 24) return;
      essais++;
      try {
        if (document.documentElement.scrollHeight - window.innerHeight >= y) { window.scrollTo({ top: y, behavior: 'auto' }); return; }
      } catch {}
      tid = setTimeout(restaurer, 60);
    };
    /* `setTimeout` et non `requestAnimationFrame` : un onglet en arrière-plan
     * ne peint pas, ses images ne viennent jamais, et la position n'était
     * alors jamais rendue (retour 01/09). */
    if (y > 0) tid = setTimeout(restaurer, 0);
    return () => {
      clearTimeout(t); clearTimeout(tid);
      window.removeEventListener('scroll', noter);
      window.removeEventListener('pagehide', ecrire);
      window.removeEventListener('beforeunload', ecrire);
    };
  }, []);
  // Vues personnalisées (créées dans Paramètres → Vues, admin) — live, persistées.
  const [customViews, setCustomViews] = useState(() => {
    // Filet de l'écran d'erreur : « Repartir sans les vues custom » pose ce
    // drapeau puis recharge. Il est CONSOMMÉ ici — il ne protège que ce
    // chargement-ci, et la configuration n'est pas touchée : si la vue fautive
    // replante au retour, l'écran d'erreur revient et on peut recommencer.
    try { if (sessionStorage.getItem('loggia_safe_nocv')) { sessionStorage.removeItem('loggia_safe_nocv'); return []; } } catch {}
    const v = readLS('loggia_customviews', []); return Array.isArray(v) ? v.filter(x => x && x.id && x.name) : [];
  });
  /* `loggia_customviews` est de la configuration : une vue perso dit QUELLES
   * entites elle montre. Y ranger ses cartes ecrit donc une cle reservee, et
   * un compte Home Assistant ordinaire n'y entre pas en edition (03/10) —
   * voir `<CustomView … edit=…>` plus bas, et les Parametres. */
  const saveCustomViews = (list) => { cfgSet({ loggia_customviews: list }); setCustomViews(list); };
  const [editMode, setEditMode] = useState(false);
  /* ADR 0067 : une relecture arrivee pendant l'edition se fait a sa sortie. */
  useEffect(() => {
    editRef.current = editMode;
    if (!editMode && enAttenteRef.current && relireRef.current) { enAttenteRef.current = false; relireRef.current(); }
  }, [editMode]);
  /* UN ECRAN QUI SE REVEILLE RELIT (08/10).
   *
   * La resynchronisation de l'ADR 0067 ne tenait qu'a un fil : le message
   * `loggia/config/suivre`. Un onglet endormi ne le recoit pas, et une
   * connexion coupee puis revenue ne rejoue pas ce qu'on a manque — Home
   * Assistant se rabonne, il ne raconte pas le passe.
   *
   * L'ecran gardait donc un cache perime. Et comme un reglage s'ecrit par
   * OBJET ENTIER — la grille de l'Accueil, la disposition d'une vue —, son
   * premier rangement renvoyait cet objet dans son etat d'avant : les widgets
   * reranges ailleurs revenaient, leur ordre aussi, et une carte repassait en
   * compacte. Une tablette murale ouverte en permanence le faisait a chaque
   * fois qu'on la touchait.
   *
   * Trois reveils, le meme geste : l'onglet redevient visible, la fenetre
   * reprend le focus, la connexion repart. `relire` est deja groupee (300 ms)
   * et attend la fin de l'edition : les trois peuvent tomber ensemble. */
  useEffect(() => {
    const relire = () => { if (relireRef.current) relireRef.current(); };
    const auReveil = () => { if (typeof document === 'undefined' || document.visibilityState === 'visible') relire(); };
    try { document.addEventListener('visibilitychange', auReveil); } catch { /* pas de document */ }
    try { window.addEventListener('focus', auReveil); } catch { /* pas de fenetre */ }
    let conn = null;
    try {
      const h = getHass();
      conn = (h && h.connection && typeof h.connection.addEventListener === 'function') ? h.connection : null;
      if (conn) conn.addEventListener('ready', relire);
    } catch { conn = null; }
    return () => {
      try { document.removeEventListener('visibilitychange', auReveil); } catch { /* deja parti */ }
      try { window.removeEventListener('focus', auReveil); } catch { /* deja parti */ }
      try { if (conn) conn.removeEventListener('ready', relire); } catch { /* deja parti */ }
    };
    /* Rejoue a l'arrivee du serveur : au premier rendu la connexion n'existe
     * pas encore, et l'ecouteur de reconnexion se serait pose dans le vide. */
  }, [serverOk]);
  // L'édition est réservée aux admins : si le profil actif n'est plus admin, on coupe le mode édition.
  // (le bouton crayon du Header est déjà admin-only ; ceci couvre le switch de profil pendant l'édition)
  // Recalculé quand la configuration serveur ou la découverte change. Figer
  // cette table au premier rendu la remplirait avec ce qui est disponible à cet
  // instant — c'est-à-dire presque rien : les pièces perdraient leurs capteurs.
  const cfg = useMemo(() => {
    const e = cfgVal('loggia_energyHaids', null);
    const cm = cfgVal('loggia_cameras', null);
    return {
      energy: { ...enHaids(), ...(e && typeof e === 'object' ? e : {}) },
      // Chaque piece recoit l'icone de la zone Home Assistant qui porte le
      // meme nom. C'est ce qui rend le nom LIBRE : renommer une piece ne
      // change plus son icone, puisque celle-ci vient de Home Assistant.
      rooms: (() => {
        const zones = (loggiaRuntime.index && loggiaRuntime.index.areaList) || [];
        const parNom = new Map(zones.map(z => [rmNorm(z.name), z]));
        const ix = loggiaRuntime.index;
        return normRooms(cfgVal('loggia_rooms', null)).map(r => {
          // Le nom d'abord, puis la zone du capteur que la piece utilise deja.
          // Une piece peut porter un autre nom que sa zone — c'est le droit de
          // l'utilisateur — et ses capteurs, eux, la designent sans ambiguite.
          let z = parNom.get(rmNorm(r.name || r.room));
          if (!z && ix && ix.areaOf && r.haid) {
            const parCapteur = [r.haid.temp, r.haid.humidity, r.haid.co2]
              .filter(Boolean).map(ix.areaOf).find(Boolean);
            if (parCapteur) z = zones.find(x => x.id === parCapteur);
          }
          return z ? { ...r, icon: z.icon || null, area: z.id } : r;
        });
      })(),
      // `loggia_lights` voyage dans un import : un élément `null` ou un objet à
      // la place de la liste levait dans les clés des lumières, calculées à
      // chaque rendu — tout l'écran tombait (05/10, suite du point 10b).
      lights: (() => { const l = cfgVal('loggia_lights', []); return Array.isArray(l) ? l.filter(x => x && typeof x === 'object') : []; })(),
      // Une caméra `null` (configuration abîmée) levait `c.haid` dans les clés
      // de l'Accueil, calculées quelle que soit la vue : tout l'écran tombait,
      // Paramètres compris (05/10, suite du point 10b).
      cams: (Array.isArray(cm) && cm.length) ? cm.filter(c => c && typeof c === 'object') : [],
      entities: (serverCfg && serverCfg.loggia_entities) || {},
    };
  }, [serverCfg, loggiaRuntime.ready]);
  const cfgRef = useRef(null); cfgRef.current = cfg.rooms;
  // Clés de poll issues de la configuration utilisateur : chez un tiers les
  // constantes du code ne correspondent a rien, seuls comptent le prefixe de
  // domaine et les entites que la decouverte a resolues.
  const cfgKeys = (domain) => {
    const e = serverCfg && serverCfg.loggia_entities && serverCfg.loggia_entities[domain];
    return e ? (JSON.stringify(e).match(/[a-z_]+\.[a-z0-9_]+/g) || []) : [];
  };
  const rv = (loggiaRuntime.resolved && loggiaRuntime.resolved.vacuum) || null;
  // Les entites reconnues d'apres le nom du robot (usure, mode, debit d'eau,
  // derniere tache) doivent etre interrogees, sinon la vue les affiche figees.
  // `getHass()` plutot que `hass` : celui-ci se construit A PARTIR de ces cles.
  const vacMain = (rv && rv.main) || cfgKeys('vacuum').find(k => k.indexOf('vacuum.') === 0) || null;
  const vacKeys = ['vacuum.', ...VAC_KEYS, ...cfgKeys('vacuum'), ...cfgKeys('vacuumRooms'),
    ...Object.values(vacSensors(getHass(), vacMain)),
    ...(rv ? [rv.battery, rv.area_cleaned, rv.duration, rv.status] : [])].filter(Boolean);
  const rc = (loggiaRuntime.resolved && loggiaRuntime.resolved.cameras) || null;
  const secKeys = ((rc && rc.list) || []).flatMap(c => [c.id, c.motion, c.person, c.vehicle, c.sonnette, c.colis]).filter(Boolean);
  // Poll par vue : GLOBAL (météo/sun/présence + sources des notifications, visibles partout)
  // + les clés de la vue affichée seulement → évite un re-render de toute l'app à chaque tick
  // dès qu'un capteur d'une AUTRE vue bouge. L'Accueil (deriveAccueil) reste le plus large.
  const GLOBAL_KEYS = ['weather.', 'sun.sun', ...peopleList().map(p => p.haid),
    secAlarm(), 'alarm_control_panel.', 'lock.', 'person.',
    ...cfgKeys('alarm'), ...cfgKeys('cameras'), ...cfgKeys('people'),
    'lawn_mower.', notifIds().dishwasher, notifIds().bins, cfg.energy.surplusNow].filter(Boolean);
  const lightKeys = [...Object.values(hueScripts()), ...dimmableLights(getHass()), ...switchLights(), ...cfgKeys('hue'), ...(cfg.lights || []).map(l => l.haid)].filter(Boolean);
  const accueilKeys = [...enKeys(), ...vacKeys, ...croqKeys(), ...plantKeys(), 'light.', ...switchLights(),
    ...mowerKeys(), notifIds().dishwasherStart,
    // « En ce moment » (v3.24) : ce qui tourne, et ses gestes.
    'media_player.', 'climate.', 'cover.', 'vacuum.', 'fan.', 'humidifier.', 'valve.',
    cfg.energy.consoNow, cfg.energy.solarOutput,
    ...(cfg.rooms || []).flatMap(r => [r.haid && r.haid.temp, r.haid && r.haid.humidity, r.haid && r.haid.co2]),
    // Les detecteurs des cameras (ADR 0031) : « en cours » suit le direct.
    ...lightKeys, ...bannerKeys(), ...(cfg.cams || []).map(c => c.haid), ...secKeys];
  const VIEW_HAKEYS = {
    accueil: accueilKeys, lumieres: lightKeys, scenes: lightKeys,
    climat: [...climateKeys(), 'climate.', ...cfgKeys('climate'), ...voletKeys(), 'cover.', ...cfgKeys('covers')],
    volets: [...voletKeys(), 'cover.', ...cfgKeys('covers')],
    energie: [...enKeys(), cfg.energy.consoNow, cfg.energy.solarOutput],
    medias: medKeys(),
    /* La vue Objets montre TOUS les appareils, et elle n'en surveillait que
     * cinq familles. Un interrupteur qu'on bascule ne changeait donc aucune
     * signature : le parent ne se redessinait pas, la carte gardait l'objet
     * `hass` capture avant la commande, et son minuteur de 6 s la redessinait
     * SEULE — avec l'etat d'avant. La bascule revenait a son point de depart
     * six secondes apres l'appui, puis se recalait au premier mouvement d'un
     * aspirateur ou d'une plante (mesure du 01/10 : 6 007 ms, soit le
     * minuteur a la milliseconde pres).
     *
     * On surveille donc les domaines qu'elle COMMANDE, par prefixe. Ceux-la
     * ne bougent que si quelqu'un agit : aucun bavardage. `sensor.` et
     * `binary_sensor.` restent DEHORS — ils jitterent en permanence et
     * redessineraient tout l'ecran toutes les deux secondes, alors qu'une
     * mesure en retard ne ment pas, contrairement a une bascule.
     *
     * Les zones de chauffage : ce qu'elles commandent — le `select` d'un
     * module fil pilote n'a pas de prefixe ici — et la puissance d'un module,
     * cle bruyante (plan 2 du chantier Chauffage, tache 5). */
    objets: [...vacKeys, 'lawn_mower.', ...mowerKeys(), ...croqKeys(), ...medKeys(), ...plantKeys(),
      'light.', 'switch.', 'cover.', 'climate.', 'media_player.', 'fan.', 'lock.',
      'humidifier.', 'valve.', 'siren.', 'water_heater.', 'input_boolean.', ...climateKeys(false)],
    securite: [...secBaseKeys(), 'camera.', 'siren.', 'switch.', ...secKeys, ...(cfg.cams || []).map(c => c.haid)],
    // `update.` : le panneau Versions lit les entités de mise à jour en direct (ADR 0037).
    systeme: [...sysKeys(), ...cfgKeys('system'), 'update.'],
    // clés-préfixes : automations + mises à jour (onglets admin) ; `switch.` pour l'appairage Zigbee
    // d'Interrupteurs (chantier Prises, § 9) — une bascule qui ne suivrait pas son pont.
    parametres: ['automation.', 'update.', 'switch.'],
  };
  const activeCv = view.indexOf('cv:') === 0 ? customViews.find(c => 'cv:' + c.id === view) : null;
  /* Une route `room:` ou `cv:` peut designer ce qui n'existe plus : une piece
   * renommee, une vue personnalisee supprimee ailleurs. Sans garde, l'ecran
   * montre une piece vide au nom d'hier. On attend que la configuration soit
   * LA (sans quoi on renverrait a l'accueil pendant le chargement), puis on y
   * revient. */
  const nomsPieces = (cfg.rooms || []).map(r => r.room);
  const sigRoutes = nomsPieces.join('|') + '#' + customViews.map(c => c.id).join('|');
  useEffect(() => {
    if (view.indexOf('room:') === 0) {
      if (nomsPieces.length && nomsPieces.indexOf(view.slice(5)) < 0) setView('accueil');
      return;
    }
    if (view.indexOf('cv:') === 0 && customViews.length
        && !customViews.some(c => 'cv:' + c.id === view)) setView('accueil');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, sigRoutes]);
  // Nav « Pièces » = ouvre la 1re pièce configurée (les chips de RoomView naviguent ensuite entre pièces)
  const activeRoom = view.indexOf('room:') === 0 ? view.slice(5) : view === 'pieces' ? ((cfg.rooms || []).map(r => r.room).filter(r => !estDehors(r))[0] || null) : null;
  // Vue pièce : on poll le domaine des appareils pilotables + les capteurs de la pièce (clés-préfixes).
  const roomKeys = activeRoom ? ['light.', 'switch.', 'cover.', 'climate.', 'media_player.', 'fan.', 'lock.', ...climateKeys(), ...(cfg.rooms || []).flatMap(r => [r.haid && r.haid.temp, r.haid && r.haid.humidity, r.haid && r.haid.co2]),
    // Le sonometre de la piece ouverte : sa pastille de la barre de confort suit le direct (ADR 0039).
    capteurBruitPiece((getHass() || {}).states, activeRoom)].filter(Boolean) : [];
  // Les cartes d'une vue custom suivent leur entity_id — y compris les cartes
  // TYPÉES ({ t, id }), sans quoi une jauge ou un gros interrupteur ne se
  // redessinait jamais. Seuls les templates restent dehors : leur souscription
  // `render_template` pousse toute seule.
  // Les épingles vivent sur les cartes de n'importe quelle vue : sans les
  // interroger, une valeur épinglée resterait figée jusqu'à un tick fortuit.
  // Les cartes AGRÉGATS (présence, ouvrants, air, énergie) lisent la maison
  // entière : leurs sources entrent au poll par préfixe, sinon elles figent.
  const cvAggKeys = (x) => {
    // Les cartes composees par Loggia, posees dans une piece ou en favori.
    if (x === 'obj:feeder') return croqKeys();
    // La borne de recharge (chantier G3, E3) : ses entités, que sa carte lit.
    if (x === 'obj:borne') return clesDeLaBorne();
    if (typeof x === 'string' && x.indexOf('plant:') === 0) return plantKeys();
    if (typeof x === 'string' && x.indexOf('zone:') === 0) return climateKeys();
    const t = x && x.t;
    if (t === 'presence') return ['person.'];
    if (t === 'ouvrants') return ['binary_sensor.'];
    if (t === 'air') return ['sensor.'];
    if (t === 'activite') return ['binary_sensor.', 'cover.', 'vacuum.', 'lawn_mower.', 'lock.'];
    if (t === 'localisation') return ['person.', 'zone.home', 'device_tracker.'];
    // Les chips lisent toute la maison : sans ces préfixes, la rangée fige.
    if (t === 'chips') return ['light.', 'switch.', 'binary_sensor.', 'alarm_control_panel.', 'person.', 'sensor.'];
    if (t === 'energiemaison') return enKeys();
    return [cvId(x)];
  };
  // Les favoris suivent le même format que les vues : une entrée peut être
  // typée, voire un agrégat — `cvAggKeys` sait en tirer les clés à suivre.
  const haKeys = [...GLOBAL_KEYS, ...lireEpingles().flatMap(cvAggKeys), ...(activeCv ? activeCv.ents.flatMap(cvAggKeys) : activeRoom ? [...roomKeys, ...(layoutOf(ROOM_LAYOUT_KEY, activeRoom).added || []).flatMap(cvAggKeys)] : (VIEW_HAKEYS[view] || [])), ...(view === 'accueil' ? qsKeys() : [])].filter(Boolean);
  // Capteurs de puissance au jitter continu : signature arrondie à 10 W → pas de re-render global à chaque tick.
  // Un capteur de puissance jitter en continu chez N'IMPORTE QUI : c'est sa
  // `device_class` qui le dit, pas son nom. Cette liste portait un identifiant
  // d'entite ecrit en dur, qui n'existait que sur une seule installation.
  const noisyDiscovered = (() => {
    const st = (getHass() || {}).states || {};
    return ((discovery.caps && discovery.caps.energySensors) || [])
      .filter(id => st[id] && st[id].attributes && st[id].attributes.device_class === 'power');
  })();
  const noisyKeys = [cfg.energy.consoNow, cfg.energy.surplusNow, cfg.energy.solarOutput,
    ...noisyDiscovered,
    // La puissance d'un module fil pilote, que la Pièce et Objets suivent.
    ...climateZones(null).map(z => z.puissance),
    // Pas celle des prises : une clé bruyante ne compte que SURVEILLÉE, et ni Objets ni les pièces ne le font de `sensor.`. La carte, la compacte et l'en-tête d'Objets › Prises s'abonnent à la leur (`useVuePrise`, `EntetePrisesVive`, A2).
    ...(() => { const E = enHaids(); return [E.consoMaison, E.gridNow, E.solarNow, E.injectionNow, E.appTotal, E.consoNow, E.evNow, ...['solarNowParts', 'consoNowParts', 'batRateParts'].flatMap(k => (Array.isArray(E[k]) ? E[k] : [])), E.batRate, E.batNow]; })(),
    ...enDevices(null).map(d => d.power)].filter(Boolean);
  const hass = useHass(haKeys, noisyKeys);
  const { seuilPile, lecturePrises, viewBlocked, wasConnectedRef, haLost, patienceHa } = useConnexionApp({ activeCv, activeRoom, hass, loggiaRuntime, view });
  const { toast } = useToastApp();
  const { weatherMode, weatherRaw, weatherTemp, weatherLabel } = useMeteoApp({ hass });
  const { accueil, cyclesPrises, vivantes } = useAccueilApp({ activeRoom, cfg, hass, lecturePrises, loggiaRuntime, seuilPile, view });

  const { notifs, lireNotifs } = useJournalApp({ hass, vivantes });
  /* Le compte d'appareils de la barre latérale — TOUJOURS montée, quelle que
   * soit la vue — bouclait sur TOUTES les entités de la maison à chaque rendu
   * d'`App()`, avec un test sur huit préfixes de domaine. Le coût est
   * proportionnel à la taille de l'installation, et il était payé même quand
   * la vue affichée n'avait rien à voir avec ces domaines. */
  const nbAppareils = useMemo(() => {
    const S = (hass && hass.states) || null;
    if (!S || (hass.connected !== undefined && !hass.connected)) return 0;
    const doms = ['light.', 'switch.', 'media_player.', 'camera.', 'climate.', 'cover.', 'vacuum.', 'lawn_mower.'];
    let n = 0;
    for (const id in S) { if (doms.some(d => id.indexOf(d) === 0) && S[id] && S[id].state !== 'unavailable') n++; }
    return n;
  }, [hass]);
  // (thème/mode/suivi HA lus paresseusement à l'initialisation des states —
  //  les relire ici arrivait après leur première réécriture.)
  const [look, setLook] = useState(readLook);
  // L'apparence suit le profil, ou cet écran s'il a la sienne (ADR 0223).
  const onLook = (patch) => setLook(l => { const n = { ...l, ...patch }; if (!SAFE_NOLOOK) poserApparence({ look: n }); return n; });
  useEffect(() => {
    // « Auto » : le clair/foncé suit l'APPAREIL (prefers-color-scheme) — et le
    // suit en direct quand l'OS bascule au coucher du soleil.
    const modeEff = () => themeMode === 'auto'
      ? ((() => { try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch { return 'dark'; } })())
      : themeMode;
    const run = () => setLightMode(!applyTheme({ mode: modeEff(), loggiaTheme, haTheme, look }, getHass()));
    run();
    // En safe mode, ne RIEN réécrire : les défauts affichés écraseraient le thème enregistré.
    if (!SAFE_NOLOOK) { try { localStorage.setItem('loggia-mode', themeMode); localStorage.setItem('loggia-theme', loggiaTheme); localStorage.setItem('loggia-ha', haTheme); } catch {} }
    let mq = null;
    if (themeMode === 'auto') { try { mq = window.matchMedia('(prefers-color-scheme: light)'); mq.addEventListener('change', run); } catch { mq = null; } }
    /* Suivre HA : `hass.themes` peut charger après coup, et le thème actif
     * changer — on regarde donc en boucle. Mais on ne REECRIT que si la
     * lecture a changé : sans cette garde, la racine était repeinte et la
     * garde de contraste relancée quarante fois par minute pour rien
     * (24/09, plan M9). `dernier` vit dans l'effet : un changement de mode,
     * de thème ou d'apparence le rejoue depuis zéro. */
    if (haTheme === 'FOLLOW') {
      let dernier = signatureHaTheme(getHass());
      const iv = setInterval(() => {
        const sig = signatureHaTheme(getHass());
        if (sig === dernier) return;
        dernier = sig;
        run();
      }, 1500);
      return () => { clearInterval(iv); if (mq) mq.removeEventListener('change', run); };
    }
    return () => { if (mq) mq.removeEventListener('change', run); };
  }, [themeMode, loggiaTheme, haTheme, look]);
  // Bascule Nabu Casa automatique. Garde-fous, tous obligatoires :
  //   1. l'interrupteur est armé et une URL distante est renseignée ;
  //   2. on tourne DANS l'iframe Home Assistant (hors HA, hass est nul par construction —
  //      sans ce test, ouvrir le fichier en direct redirigerait vers Nabu Casa) ;
  //   3. l'origine courante n'est pas déjà l'URL distante ;
  //   4. hass est toujours absent après 2 s ;
  //   5. une seule bascule par session (sessionStorage), pour ne jamais boucler.
  useEffect(() => {
    let cfg = null;
    try { cfg = JSON.parse(localStorage.getItem('loggia_haCfg') || 'null'); } catch { return undefined; }
    if (!cfg || !cfg.fallback || !cfg.remote) return undefined;
    if (window.top === window) return undefined;
    let origin; try { origin = (window.top && window.top.location.origin) || window.location.origin; } catch { origin = window.location.origin; }
    if (origin === cfg.remote.replace(/\/+$/, '') || /nabu\.casa/.test(origin)) return undefined;
    try { if (sessionStorage.getItem('loggia-fellback') === '1') return undefined; } catch { return undefined; }
    const t = setTimeout(() => {
      if (getHass()) return; // Home Assistant a repondu : rien a faire
      try { sessionStorage.setItem('loggia-fellback', '1'); } catch {}
      try { (window.top || window).location.href = cfg.remote; } catch { window.location.href = cfg.remote; }
    }, 2000);
    return () => clearTimeout(t);
  }, []);
  const { onMode, onPickTheme, onFollowHa, toggle, navOpen, setNavOpen, tactile, navbar, fondPhotoActif, ficheDemo, setFicheDemo, ambient, onAmbient, ambPlage, onAmbPlage, plageOk, idle, retourAcc, onRetourAcc, wxFx, onToggleWxFx, onToggleNavbar, navOffset, topOffset, safeEff, safeTopEff, onNavOffset, onNavSet, onNavOffsetReset, onTopOffset, onTopSet, onTopOffsetReset } = useReglagesEcran({ haTheme, look, setHaTheme, setLoggiaTheme, setThemeMode, setView, view });
  const [users, setUsers] = useState(() => { const withK = withUserKeys; try { const s = localStorage.getItem('loggia_users'); if (s) { const a = JSON.parse(s); if (Array.isArray(a) && a.length) return withK(a); } } catch {} return withK(FIRST_USER()); });
  // `cfgSet` ecrit le serveur ET le localStorage. Avec le seul localStorage,
  // les profils restaient prisonniers de l'appareil qui les avait crees.
  const persistUsers = (a) => { try { cfgSet({ loggia_users: a }); } catch {} setUsers(a); };
  const [userIdx, setUserIdx] = useState(() => { try { const v = parseInt(cfgVal('loggia_active_user', null), 10); return (v >= 0 && v < users.length) ? v : 0; } catch { return 0; } });
  /* Le profil appartient a l'ECRAN (ADR 0220). Ce que l'ecran affiche est la
   * seule source : `profilActif()` le rend, et les enfants, rendus apres ce
   * corps, lisent la part du profil dont ils voient le prenom. */
  setLoggiaState({ profil: String(userIdx) });
  /* Quand le composant repond, la fiche de CET appareil fait foi une fois — elle
   * le retrouve au rechargement, ou que l'ordinateur en soit. Ensuite, c'est
   * l'ecran qui l'ecrit, et elle ne suit plus aucun autre ecran. */
  const profilRepris = useRef(false);
  const questionPosee = useRef(false);
  /** Le profil relié au compte Home Assistant connecté, ou -1. Un profil Admin
   *  ne se prend que si le compte est administrateur (ADR 0080). Calculé au
   *  rendu : les effets en dépendent par sa VALEUR, pas par une fonction. */
  const profilDuCompte = (() => {
    const i = matchHaUser(hass && hass.user, users);
    if (i < 0) return -1;
    return (!haAdmin && String(users[i].role || '').toLowerCase() === 'admin') ? -1 : i;
  })();
  /* Un écran SANS fiche, alors que la maison connaît des appareils nommés de
   * son type : son cache a été vidé, ou il passe par une autre adresse. On lui
   * demande une fois s'il est l'un d'eux, avant de lui créer une fiche
   * (ADR 0222). */
  const formatApp = formatEcran(useCoarse(), useWide(1180));
  const [questionAppareil, setQuestionAppareil] = useState(null);
  /* UN COMPTE = SON PROFIL (ADR 0276, ticket #38, 27/10) : « s'il est connecté
   * à Home Assistant avec son compte, ça doit charger son profil, point ».
   * Le serveur relie — ou crée — le profil du compte de la CONNEXION, puis
   * rend son rang : rien ne dépend plus d'un nom identique, ni d'un compte
   * administrateur pour enregistrer le lien. `null` tant qu'il n'a pas
   * répondu ; -1 pour un composant qui ne connaît pas la commande. */
  const [profilServeur, setProfilServeur] = useState(null);
  useEffect(() => {
    if (!serverOk) return undefined;
    const h = getHass();
    if (!h || typeof h.callWS !== 'function') { setProfilServeur(-1); return undefined; }
    let vivant = true;
    h.callWS({ type: 'loggia/profils/moi' }).then((r) => {
      if (!vivant || !r) return;
      if (Array.isArray(r.profils) && r.profils.length) setUsers(cur => (usersSig(r.profils) !== usersSig(cur) ? withUserKeys(r.profils) : cur));
      setProfilServeur(typeof r.index === 'number' ? r.index : -1);
    }).catch(() => { if (vivant) setProfilServeur(-1); });
    return () => { vivant = false; };
  }, [serverOk]);
  useEffect(() => {
    if (!serverOk || !users.length || questionAppareil || profilServeur === null) return;
    if (!profilRepris.current) {
      /* D'abord QUEL ÉCRAN (ADR 0222) : un écran sans fiche, alors que la
       * maison connaît des appareils nommés de son type, demande une fois
       * s'il est l'un d'eux — sinon il perdrait sa mise en page. Le profil se
       * choisit APRÈS sa réponse : l'effet repasse ici quand la question se
       * ferme. */
      if (!questionPosee.current && !Object.keys(ficheAppareil()).length) {
        questionPosee.current = true;
        const candidats = Object.entries(appareilsConnus()).filter(([, f]) => f && f.nom && f.format === formatApp);
        if (candidats.length) { setQuestionAppareil(candidats); return; }
      }
      profilRepris.current = true;
      // Ensuite QUI REGARDE : le profil du compte, relié par le serveur
      // (ADR 0276), sinon rapproché ici ; la fiche de l'écran après.
      const duCompte = (profilServeur >= 0 && profilServeur < users.length) ? profilServeur : profilDuCompte;
      if (duCompte >= 0) { if (duCompte !== userIdx) setUserIdx(duCompte); return; }
      /* Un compte relié à AUCUN profil garde le choix de l'écran, « mais pas
       * en admin » (19/10) : un profil Admin ne se rouvre pas tout seul sur un
       * écran que rien ne rattache à lui — il revient au premier profil qui
       * ne l'est pas, et l'Admin repasse par le code. */
      const p = parseInt(profilAppareil(), 10);
      let cible = (p >= 0 && p < users.length) ? p : userIdx;
      const estAdmin = (j) => String((users[j] || {}).role || '').toLowerCase() === 'admin';
      if (estAdmin(cible)) { const j = users.findIndex((u, k) => !estAdmin(k)); if (j >= 0) cible = j; }
      if (cible !== userIdx) { setUserIdx(cible); return; }
    }
    retenirProfilAppareil(userIdx, formatApp);
  }, [serverOk, userIdx, users, questionAppareil, formatApp, profilDuCompte, profilServeur]);
  /* Reprendre un appareil connu : son identifiant seulement. Le profil se
   * choisit ensuite, quand la question se ferme : celui du compte (ADR 0276),
   * sinon celui de la fiche reprise — sauf un profil Admin, qui passe
   * toujours par le code (ADR 0080). */
  const reprendreAppareil = (id) => {
    adopterAppareil(id);
    setQuestionAppareil(null);
  };
  /* L'apparence se RELIT quand la configuration change : réponse du serveur,
   * autre profil, écran repris, réglage fait sur un autre écran (ADR 0223).
   * Un champ que personne n'a encore posé laisse l'écran tel qu'il était. */
  const apparenceLue = useRef('');
  useEffect(() => {
    if (!serverOk || SAFE_NOLOOK) return;
    const ap = apparence();
    const sig = JSON.stringify(ap);
    if (sig === apparenceLue.current) return;
    apparenceLue.current = sig;
    if (ap.mode === 'light' || ap.mode === 'dark' || ap.mode === 'auto') setThemeMode(ap.mode);
    if (typeof ap.theme === 'string') setLoggiaTheme(ap.theme);
    if (typeof ap.ha === 'string') setHaTheme(ap.ha);
    if (ap.look && typeof ap.look === 'object') setLook(readLook());
  }, [serverOk, serverCfg, userIdx, questionAppareil]);
  // La configuration serveur arrive APRES le premier rendu. Sans cette
  // resynchronisation, `users` resterait celui du localStorage de l'appareil,
  // et les profils crees ailleurs n'apparaitraient jamais.
  const usersPousses = useRef(false);
  useEffect(() => {
    const distant = serverCfg && serverCfg.loggia_users;
    if (Array.isArray(distant) && distant.length) {
      usersPousses.current = true;
      if (usersSig(distant) !== usersSig(users)) setUsers(withUserKeys(distant));
      return;
    }
    // Le serveur ne connait aucun profil : on lui envoie ceux d'ici, une fois.
    // Sans cela, une liste creee avant la synchronisation resterait locale.
    // On se garde bien de pousser la liste par defaut : un appareil vierge
    // ecraserait alors les vrais profils.
    const parDefaut = users.length === 1 && !users[0].haId && users[0].name === 'Administrateur';
    // Depuis un compte ordinaire, le serveur refuse : la tentative ne
    // servirait qu'a afficher une erreur a chaque ouverture.
    if (haAdmin && !usersPousses.current && users.length && !parDefaut) {
      usersPousses.current = true;
      cfgSet({ loggia_users: users });
    }
  }, [serverCfg, users, haAdmin]);

  const [pinTarget, setPinTarget] = useState(null);
  // Chip « n allumées » du header (et de l'écran de veille) : les lumières de la maison à l'état on (L11) — le compte d'Objets › Lumières.
  const lightsOn = useMemo(() => {
    const S = hass && hass.states; if (!S) return 0;
    return lumieresDe(S, ctxLumieres()).filter(id => S[id] && S[id].state === 'on').length;
  }, [hass]);
  const applyUser = (i) => { cfgSet({ loggia_active_user: String(i) }); try { const u = users[i]; if (u && u.name) { const m = JSON.parse(localStorage.getItem('loggia-lastseen') || '{}'); m[u.name] = Date.now(); localStorage.setItem('loggia-lastseen', JSON.stringify(m)); } } catch {} setUserIdx(i); };
  const switchUser = (i) => { if (i === userIdx) return; if (users[i] && users[i].role === 'Admin') setPinTarget(i); else applyUser(i); };
  const isAdmin = !!(users[userIdx] && users[userIdx].role === 'Admin');
  /* Autorisations accordées à ce profil — toutes pour un admin. Séparées de
   * `vues` à dessein : celles-là retirent ce qu'on voit, celles-ci rendent ce
   * qu'on peut faire. */
  const droits = droitsDe(users[userIdx]);
  const peutEditer = droits.indexOf('edition') >= 0;
  /* Permissions par profil : le set des vues autorisées du profil actif, ou
   * null = toutes (admins, et profils sans restriction — le défaut). */
  const vuesAutorisees = (!isAdmin && users[userIdx] && Array.isArray(users[userIdx].vues) && users[userIdx].vues.length)
    ? new Set(users[userIdx].vues) : null;
  // Une vue interdite atteinte autrement (restauration, lien) retombe sur l'accueil.
  const vuesSig = vuesAutorisees ? [...vuesAutorisees].join('|') : '';
  useEffect(() => {
    if (!vuesAutorisees) return;
    const base = view.indexOf('room:') === 0 ? 'pieces' : view;
    if (base !== 'accueil' && base !== 'parametres' && !vuesAutorisees.has(base)) setView('accueil');
  }, [view, vuesSig]);
  // Un droit retiré ferme le mode édition, comme le fait un changement de profil.
  useEffect(() => { if (!peutEditer) setEditMode(false); }, [peutEditer]);
  const { entSheet, setEntSheet, assistantNs, assistantAttendu, assistantOuvert, setAssistantOuvert, questionVocale, setQuestionVocale, poserQuestion } = useAssistantApp({ editMode, hass, view });
  const { addUser, updateUser, deleteUser } = useComptesApp({ applyUser, haAdmin, hass, persistUsers, userIdx, users });

  const { santeAccueil, showOnboarding, closeOnboarding } = useOnboardingApp({ discovery, hass, loggiaRuntime, saveCfg, serverCfg, view });

  return (
    <LoggiaContext.Provider value={loggiaRuntime}>
    {showOnboarding && <Suspense fallback={null}><Onboarding runtime={loggiaRuntime} onDone={closeOnboarding} onSkip={() => closeOnboarding(null)} /></Suspense>}
    <HeaderCtx.Provider value={{ light: lightMode, onToggleTheme: toggle, onToggleNav: () => setNavOpen(o => !o), onNav: setView, editMode, onToggleEdit: () => setEditMode(e => !e), users, userIdx, onSwitchUser: switchUser, peutEditer, droits, notifs, onLireNotifs: lireNotifs, customViews, rooms: (cfg.rooms || []).map(r => r.room).filter(r => !estDehors(r)), lightsOn, onAssistant: assistantNs ? () => setAssistantOuvert(true) : null, onDictee: assistantNs ? poserQuestion : null, assistantAttendu, hass }}>
    <div key={(servi ? 'srv' : 'local') + ':' + userIdx} className={navbar ? 'o-navbar-on' : undefined} style={{ display: 'flex', minHeight: '100vh', background: fondPhotoActif ? 'transparent' : 'var(--o-bggrad, var(--o-bg))', fontFamily: 'var(--o-font)', color: 'var(--o-text)',
      // isolate : notre propre contexte d'empilement. Sans lui, le z-index
      // négatif du calque photo l'envoie sous le fond OPAQUE de tout wrapper
      // qu'une extension glisse entre body et #root — photo invisible, vécu.
      isolation: 'isolate' }}>
      {/* Fond photo : un calque FIXE derrière tout (z-index négatif) — pas de
          background-attachment: fixed, que Safari iOS ne sait pas peindre. Le
          voile assombrit (ou éclaircit, en mode clair) pour que le texte des
          cartes reste lisible sur n'importe quelle photo. */}
      {fondPhotoActif && (
        <div className="o-fond-photo" aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none',
          background: (lightMode ? 'linear-gradient(rgba(240,244,250,.6),rgba(240,244,250,.6)), ' : 'linear-gradient(rgba(5,7,11,.55),rgba(5,7,11,.55)), ')
            + `url("${fondPhotoActif}") center center / cover no-repeat var(--o-bg)` }} />
      )}
      {ficheDemo && <FicheAppareil id={ficheDemo} hass={hass} onClose={() => setFicheDemo(null)} />}
      {idle && ambient > 0 && plageOk && <Suspense fallback={null}><AmbientOverlay scenes={scenariosAccueil(scenarios()).map(s => ({ ...s, nom: nomScenario(s) }))} onScene={(s) => lancerScenario(getHass(), s.id)} wx={weatherMode || 'clouds'} wxFx={wxFx} weatherTemp={weatherTemp} weatherLabel={weatherLabel} inTemp={accueil ? accueil.inTemp : null} uniteTemp={uniteTemp(null, hass)} lightsOn={lightsOn} notifs={notifs}
        ast={(() => { const S = (hass && hass.states) || {}; const rAl = (loggiaRuntime.resolved && loggiaRuntime.resolved.alarm && loggiaRuntime.resolved.alarm.available) ? loggiaRuntime.resolved.alarm.main : null; const aid = (secAlarm() && S[secAlarm()]) ? secAlarm() : rAl; return (aid && S[aid]) ? S[aid].state : null; })()} /></Suspense>}
      {haLost && <div role="alert" style={BANDEAU_ALERTE}>{tr('Connexion Home Assistant perdue — les données affichées peuvent être obsolètes')}</div>}
      {!haLost && discovery.echec && <div role="alert" style={BANDEAU_ALERTE}>{tr('La découverte de la maison a été interrompue — rechargez la page')}</div>}
      {/* L'échec d'une commande se DIT (audit du 03/10).
        *
        * Le toast n'était monté qu'une fois son texte connu, en `status` : une
        * région vivante qui apparaît déjà remplie ne dit rien (ADR 0107). Le
        * refus se voyait, il ne s'entendait pas — et celui qui attendait
        * l'effet de son geste croyait la commande partie. La région est donc
        * TOUJOURS montée, vide et hors de vue tant qu'il n'y a rien ; c'est
        * son texte qui change. Le toast reste pour l'œil, 5 s comme avant,
        * caché aux lecteurs d'écran : le message ne se dit qu'une fois.
        *
        * `alert` et non `status` : c'est la réponse NÉGATIVE à un geste qu'on
        * vient de faire. Poli, le message attendrait la fin de la phrase en
        * cours — et il ne vit que 5 s : il pouvait s'effacer avant d'être dit.
        * Les deux bandeaux au-dessus restent montés avec leur texte : une
        * alerte, elle, se dit à sa CRÉATION (WAI-ARIA 1.2) ; un `status`, non.
        *
        * `data-annonce` : montée en permanence, la région serait marquée
        * inerte à chaque ouverture de feuille (`inerterAutour`, ui.jsx) — et
        * bien des commandes partent d'une fiche. L'ancien toast y échappait
        * par hasard, inséré après coup. Elle reste donc ICI, au premier
        * niveau, sœur des vues : c'est là que la règle la voit. */}
      <div className="o-vh" role="alert" data-annonce="">{toast || ''}</div>
      {toast && <div aria-hidden="true" style={{ position: 'fixed', left: '50%', bottom: 'calc(24px + var(--o-safe-bottom,0px))', transform: 'translateX(-50%)', zIndex: 400, background: 'var(--o-surfA)', color: 'var(--o-bad)', border: '1px solid rgba(var(--o-bad-rgb),.4)', borderRadius: 14, padding: '10px 16px', fontSize: 12, fontWeight: 700, boxShadow: 'var(--o-shadow,0 10px 30px rgba(0,0,0,.4))' }}>{toast}</div>}
      <Sidebar view={view} vuesAutorisees={vuesAutorisees} editMode={editMode} onToggleEdit={peutEditer ? () => setEditMode(e => !e) : null} tactile={tactile} users={users} userIdx={userIdx} onSwitchUser={switchUser} notifs={notifs} onLireNotifs={lireNotifs} onNav={(v) => { setView(v); try { if ((window.innerWidth || 0) <= 820) setNavOpen(false); } catch {} }} open={navOpen} customViews={customViews} ha={!wasConnectedRef.current && patienceHa ? null : (() => {
        const ok = !!(hass && hass.states && (hass.connected === undefined || hass.connected));
        const devCount = nbAppareils;
        const rAl = (loggiaRuntime.resolved && loggiaRuntime.resolved.alarm && loggiaRuntime.resolved.alarm.available) ? loggiaRuntime.resolved.alarm.main : null;
        const aid = (secAlarm() && ok && hass.states[secAlarm()]) ? secAlarm() : rAl;
        const ast = (ok && aid && hass.states[aid]) ? hass.states[aid].state : null;
        const al = ast == null ? { t: tr('Alarme · état inconnu'), c: 'var(--o-text3-rgb)' }
          : ast === 'disarmed' ? { t: tr('Alarme désarmée'), c: 'var(--o-ok-rgb)' }
            : ast === 'triggered' ? { t: tr('ALARME DÉCLENCHÉE'), c: 'var(--o-bad-rgb)' }
              : (ast === 'arming' || ast === 'pending') ? { t: tr('Alarme · activation…'), c: 'var(--o-warn-rgb)' }
                : { t: ast === 'armed_away' || ast === 'armed_vacation' ? tr('Alarme armée · Absent') : tr('Alarme armée · Présent'), c: 'var(--o-warn-rgb)' };
        return { online: ok, devCount, alarmTxt: al.t, alarmRgb: al.c };
      })()} />
      {navOpen && <div className="loggia-backdrop" role="presentation" onClick={() => setNavOpen(false)} />}
      {pinTarget != null && <Suspense fallback={null}><PinModal hass={hass} onClose={() => setPinTarget(null)} onSuccess={() => { applyUser(pinTarget); setPinTarget(null); }} /></Suspense>}
      <div key={view} ref={vueRef} className="o-view" style={{ display: 'flex', flex: 1, minWidth: 0 }}>
      {/* Une barrière par vue (audit du 03/10). La seule vivait à la racine :
          une carte qui levait au rendu remplaçait TOUT l'écran par la page de
          secours. Elle ne prend plus que sa vue — le menu, la barre du bas et
          les bandeaux, montés hors d'ici, restent. Rendue sous `key={view}`,
          elle renaît réarmée à chaque changement de vue ; l'en-tête lui est
          confié pour que la carte de panne le garde (`Barriere`, ui.jsx). */}
      <Barriere entete={<Header />}>
      {/* Tant que la decouverte n'a pas repondu, on ne monte aucune vue autre que
          l'accueil : plusieurs lisent leur configuration sans verifier qu'elle
          existe. Une surface vide le temps d'un instant, pas l'accueil — sinon
          l'on verrait la page changer deux fois sous ses yeux. */}
      {(!loggiaRuntime.ready && view !== 'accueil') ? <main className="loggia-main" style={{ flex: 1, minWidth: 0 }} />
        : viewBlocked ? <ViewEmpty vid={view} reason={viewBlocked} onNav={setView} />
        : view === 'lumieres' ? <ObjetsView hass={hass} onNav={setView} filtre="lumieres" edit={editMode && peutEditer} onEnt={editMode && peutEditer ? () => setEntSheet(true) : null} /> : view === 'scenes' ? <ScenariosView hass={hass} edit={editMode && peutEditer} /> : view === 'climat' ? <ObjetsView hass={hass} onNav={setView} filtre="chauffage" edit={editMode && peutEditer} onEnt={editMode && peutEditer ? () => setEntSheet(true) : null} /> : view === 'volets' ? <ObjetsView hass={hass} onNav={setView} filtre="volets" edit={editMode && peutEditer} onEnt={editMode && peutEditer ? () => setEntSheet(true) : null} /> : view === 'voletsplan' ? <VoletsView hass={hass} edit={editMode && peutEditer} /> : view === 'energie' ? <EnergieView hass={hass} edit={editMode && peutEditer} onEnt={() => setEntSheet(true)} /> : view === 'medias' ? <ObjetsView hass={hass} onNav={setView} filtre="multimedia" edit={editMode && peutEditer} onEnt={editMode && peutEditer ? () => setEntSheet(true) : null} /> : view === 'objets' ? <ObjetsView hass={hass} onNav={setView} edit={editMode && peutEditer} onEnt={editMode && peutEditer ? () => setEntSheet(true) : null} /> : view === 'securite' ? <SecuriteView hass={hass} edit={editMode && peutEditer} onEnt={editMode && peutEditer ? () => setEntSheet(true) : null} onNav={setView} /> : view === 'systeme' ? <SystemeView hass={hass} /> : view === 'biblio' ? <BiblioView /> : view === 'parametres' ? <ParametresView droits={droits} onNav={setView} themeMode={themeMode} loggiaTheme={loggiaTheme} haTheme={haTheme} onMode={onMode} onPickTheme={onPickTheme} onFollowHa={onFollowHa} navbar={navbar} onToggleNavbar={onToggleNavbar} wxFx={wxFx} onToggleWxFx={onToggleWxFx} ambient={ambient} onAmbient={onAmbient} ambPlage={ambPlage} onAmbPlage={onAmbPlage} retourAcc={retourAcc} onRetourAcc={onRetourAcc} navMargin={safeEff} navAuto={navOffset == null} onNavOffset={onNavOffset} onNavOffsetReset={onNavOffsetReset} onNavSet={onNavSet} onTopSet={onTopSet} look={look} onLook={onLook} topMargin={safeTopEff} topAuto={topOffset == null} onTopOffset={onTopOffset} onTopOffsetReset={onTopOffsetReset} hass={hass} users={users} userIdx={userIdx} isAdmin={isAdmin} onAddUser={addUser} onUpdateUser={updateUser} onDeleteUser={deleteUser} customViews={customViews} onSaveCustomViews={saveCustomViews} /> : activeCv ? <CustomView cv={activeCv} hass={hass} edit={editMode && peutEditer && !compteOrdinaire(hass)} onSave={(cv2) => saveCustomViews(customViews.map(x => x.id === cv2.id ? cv2 : x))} /> : activeRoom ? <RoomView room={activeRoom} rooms={(cfg.rooms || []).map(r => r.room).filter(r => !estDehors(r))} piece={(() => { const lv = accueil && accueil.rooms ? accueil.rooms.find(r => r.name === activeRoom) : null; const base = habillagePiece(activeRoom, lv && lv.icon); /* Une mesure absente reste null (audit du 03/10) : `base` porte les valeurs de vitrine du modèle (PIECES, l'écran d'avant la connexion), et la fiche de confort les affichait pour une vraie pièce — « Humidité 60 % » dans une chambre sans hygromètre. */ return { ...base, name: activeRoom, live: lv, temp: lv && lv.temp != null ? dec(lv.temp, 1) + '°' : null, hum: lv && lv.hum != null ? Math.round(lv.hum) + '%' : null, badge: lv && lv.co2 != null ? Math.round(lv.co2) + ' ppm' : null }; })()} hass={hass} onNav={setView} edit={editMode && peutEditer} /> : <Dashboard editMode={editMode} sante={santeAccueil} onEnt={peutEditer ? () => setEntSheet(true) : null} weatherMode={weatherMode} weatherRaw={weatherRaw} wxFx={wxFx} weatherTemp={weatherTemp} weatherLabel={weatherLabel} accueil={accueil} userName={(users[userIdx] || {}).name || ''} onOpenRoom={(name) => setView('room:' + name)} onNav={setView} planActif={look.plan !== false} cyclesPrises={cyclesPrises} />}
      </Barriere>
      </div>
      {navbar && <MobileNav vuesAutorisees={vuesAutorisees} view={view} onNav={(v) => { setView(v); try { if ((window.innerWidth || 0) <= 820) setNavOpen(false); } catch {} }} onMenu={() => setNavOpen(o => !o)} menuOuvert={navOpen} assistantAttendu={assistantAttendu} onAssistant={assistantNs ? () => setAssistantOuvert(true) : null} onDictee={assistantNs ? poserQuestion : null} hass={hass} />}
      {assistantOuvert && assistantNs && <Suspense fallback={null}><AssistantSheet hass={hass} ns={assistantNs} question={questionVocale} onClose={() => { setAssistantOuvert(false); setQuestionVocale(''); }} /></Suspense>}
      {questionAppareil && <Suspense fallback={null}><QuestionAppareil candidats={questionAppareil} onChoisir={reprendreAppareil} onNouveau={() => setQuestionAppareil(null)} /></Suspense>}
      {entSheet && editMode && peutEditer && <Suspense fallback={null}><ViewEntSheet view={view} hass={hass} onClose={() => setEntSheet(false)} /></Suspense>}
    </div>
    </HeaderCtx.Provider>
    </LoggiaContext.Provider>
  );
}

// Ce que les vues chargées à la demande empruntent (outilsvues.js, ADR 0274).
Object.assign(OUTILS_VUES, {
  BandeauEdition, CameraTile, CardEditSheet, CarteAjout, CarteAttention, ChoixCamDispo,
  ComposeurCartes, CvAlarm, CvPresence, CvSirene, EditableCard, GlypheCarte, Num, RM_ICO,
  RoomGenericCard, adresseDessin, armCompte, dec, enDevices, hx, masqueDe, ouvrantsDe, peopleList,
  sousCamera, sunInfo, useCoarse, useDomainCards, useLayoutEditor, useSeconde, useWide,
  cameras: () => CAMERAS(),
});

// Ce que l’édition, chargée à la demande, emprunte (outilsvues.js, ADR 0283).
Object.assign(OUTILS_VUES, {
  BandeauEdition, CarteAjoutSheet, CarteAttention, CarteScenario, ChipsEditSheet, ChoixIcone, CvActivite, CvAir, CvBigSensor,
  CvCalendrier, CvCamera, CvCarte, CvChip, CvChips, CvClock, CvEnergie, CvHistory, CvOuvrants, CvPerson, CvPresence, CvTyped,
  CvWeather, EditableCard, FicheCarte, Header, PieceCard, biblioStates, cvAvecH, cvAvecW, cvRowsDe, cvTypeDe,
  cvTypeNoms: () => CV_TYPE_NOMS(), cvW, domainesEdition: () => DOMAINES_EDITION(), habillagePiece, nomCv,
  objFiltres: () => OBJ_FILTRES(),
});
