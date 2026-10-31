/* L’Accueil (`Dashboard`), ses hooks et ses deux sous-composants (étape d).
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, useMemo, useRef, useEffect, useCallback, Suspense } from 'react';
import { formatEcran, vuePiecesDe, poserVuePieces, grilleDuFormat, poserGrille, sansPart } from '../disposition.js';
import { cfgVal, cfgSet, cfgRecue, appareilPropre, LOGGIA_RESOLVED, compteOrdinaire, plateformeDe, medPlayers, LOGGIA_INDEX, secAlarm, switchLights, ficheAppareil, enHaids } from '../state.js';
import { CIEL_HA, CIEL_SOMBRES } from '../wxpresets.js';
import { enPanne, gestesCover } from '../outils.js';
import { uniteTemp } from '../unites.js';
import { phraseRobot, phaseRobot } from '../robots.js';
import { useEtatRobots, vueCarnetRobot } from '../robotsetat.js';
import { commanderService } from '../actions.js';
import { grilleAvecPiece, lotPiece, grilleSansPiece, lotSansPiece } from '../ecrirepiece.js';
import { etagesDesPieces, piecesDeLEtage } from '../etages.js';
import { PAINT_READY, onPaintReady, useEtatServeur, REDUCE_MOTION, nomCarte, Fi, Surface, Barriere, editBtn } from '../ui.jsx';
import { weatherEntity } from '../wxutil.jsx';
import { CarteMeteo } from '../cartemeteo.jsx';
import { HorlogeRail, Co2Rail } from '../widgetsrail.jsx';
import { bornesRail } from '../railcolonne.js';
import { CarteAgenda } from '../agendarail.jsx';
import { useRelecture, useTodos, BandeauCollecte, CarteRappels, marquerFait, ajouterTache } from '../rappelsrail.jsx';
import { listesTodo } from '../todos.js';
import { sourceCollecte, prochaineCollecte, jourIso, sortiPour } from '../collecte.js';
import { seuilCo2, pireCapteur, actionAerer, ventilationVeille, voletsDeLaZone } from '../air.js';
import { TYPES_PRISE, dureePrise } from '../prises.js';
import { lireEtatPrises, gardeDeSwitch } from '../prisesetat.js';
import { veilleusesLues, estEpargnee } from '../lumieres.js';
import { lireLecteur, nomLecteur, phraseLecteur, compteLecteurs } from '../lecteur.js';
import { WIDGETS_OPTION, prochainSoleil, styleDe, STYLES_WIDGETS, NOMS_STYLES } from '../horloge.js';
import { useDerniersEvenements } from '../historique.jsx';
import { poserCamDispo, camSerre, colonnesCam } from '../camdispo.js';
import { colonnesPour, cellulePointee, nettoyer, poser, disposer, hauteur as hauteurCarte, premiereLibre } from '../placement.js';
import { pointsAttention, couleurNiveau, niveauMax, animationNiveau, resumeAttention, tuileAlarme } from '../attention.js';
import { sectionTitle, CARTE_RAIL } from '../styles.js';
import { fmtWatts, nombre } from '../format.js';
import { plantsCfg, notifIds } from '../lectures.js';
import { useEtatChauffage } from '../chauffageetat.js';
import { coverFerme } from '../voletecran.js';
import { useSensCourses, ordreEtArret } from '../voletcourse.js';
import { lignesMoment } from '../chauffageecran.js';
import { Ico } from '../icones.jsx';
import { ambiancesParPiece } from '../ambiance.js';
import { detecteursDe, reduireDerniers, evenementCamera } from '../evenement.js';
import { plageSemaine } from '../agenda.js';
import { tr, trN, nomProfil, locale } from '../i18n.js';
import { useAgenda, masqueDe, rmNorm, cvEstLumiere, priseDe, indexLu, climateZones, estClimate, dec, Segment } from '../app/noyau.jsx';
import { envoyerGeste } from '../cartes/volet.jsx';
import { modesClimat } from '../cartes/chauffage.jsx';
import { useDomainCards, FicheChauffage } from '../appareils/fiches.jsx';
import { tuileCamera, CAMERAS, CameraTile, ouvrantsDe } from '../cartescustom/cartes.jsx';
import { useWide, useCoarse } from '../app/ecran.jsx';
import { discoverLights, voletCovers } from '../app/decouverte.jsx';
import { FeuilleHistorique } from '../edition/coquilles.jsx';
import { PIECES, habillagePiece } from '../app/pieces.jsx';
import { CarteAjout, BandeauEdition } from '../edition/briques.jsx';
import { Header } from '../chrome/entete.jsx';
import { OutdoorModal, RoomComfortModal } from '../vues/piece.jsx';
import { zonesQuiChauffent } from '../vues/objets.jsx';
import { voletsCommandables } from '../vues/volets.jsx';
import { motCo2, zoneCo2, ChoixCamDispo, EDIT_BTN } from '../cartescustom/galerie.jsx';
import { motPresence } from '../presence.js';
import { ACC_CACHES_DEFAUT, ACC_AJOUTEES_DEFAUT, elaguerHisto, ACC_MAIN, ACC_RAIL, ACC_RENOMME, poserFantome, tailleParDefaut, cielSoleil, heureLocale, APPAREIL_ACTIF, LigneMoment, nomDuCycle, WeatherFx, Num, Skel, CartePieceEdition, PieceCard, FavorisAccueil, ScenariosAccueil, PlanPieces, CarteAttention, OngletsAccueil, ACC_NOMS, WeatherGL, FeuilleAgenda, FichePiece, BRIQUES_PIECE } from './briques.jsx';

/* L’agenda de l’Accueil : la plage demandée, le jour choisi, la feuille ouverte.
 * Sorti de `Dashboard` tel quel (lot 5 de l’audit du 28/10, étape d ; ADR 0283) : ses entrées et ses sorties sont nommées. */
function useAgendaAccueil({ accueil }) {
  // L'agenda du rail (ADR 0032) : d'aujourd'hui minuit a sept jours, TOUS les
  // evenements — la bande des jours compte chacun d'eux, la liste ne montre
  // que ce qui vient. `jourAuj` change a minuit, et la plage avec lui.
  const jourAuj = new Date().toDateString();
  /* Sept jours pour la carte du rail — c'est tout ce qu'elle montre. La
   * feuille, elle, peut en demander plus : sa vue Mois a besoin du mois, sinon
   * ses cases sortent vides. Elle rend la plage courte en se refermant. */
  const [plageDemandee, setPlageDemandee] = useState(null);
  const plageCourte = useMemo(() => plageSemaine(new Date(jourAuj)), [jourAuj]);
  const plageAgenda = plageDemandee || plageCourte;
  const agenda = useAgenda(accueil && accueil.hass, null, plageAgenda);
  const [jourChoisi, setJourChoisi] = useState(null); // la cle du jour choisi dans la bande, ou null
  const [agendaOuvert, setAgendaOuvert] = useState(false);
  return { setPlageDemandee, agenda, jourChoisi, setJourChoisi, agendaOuvert, setAgendaOuvert };
}

/* Les rappels et la collecte des déchets de l’Accueil.
 * Sorti de `Dashboard` tel quel (lot 5 de l’audit du 28/10, étape d ; ADR 0283) : ses entrées et ses sorties sont nommées. */
function useRappelsAccueil({ accueil, agenda }) {
  /* ── Les rappels et la collecte (maquettes du 03/10) ───────────────────────
   *
   * Les RAPPELS sont les listes de taches de Home Assistant (`todo.*`). Leur
   * contenu ne se pousse pas : l'entite ne porte que le NOMBRE a faire, et le
   * detail s'obtient par service. `relireTodos` force une relecture apres
   * chaque coche — sinon le geste semblerait avoir echoue.
   *
   * La COLLECTE (chantier G2, D2 ; ADR 0301) se lit d'un CALENDRIER reconnu
   * a sa plateforme (Waste Collection Schedule, Afvalbeheer) ou a son nom dans
   * les sept langues, sinon des CAPTEURS qui portent un jour de passage — la
   * regle de `collecte.js`, celle du composant. Le choix de Parametres ›
   * Veilles (`loggia_veilles.collecte.source`) ne fait que corriger. Sans
   * source, pas de bandeau. */
  const [tickTodos, relireTodos] = useRelecture();
  const taches = useTodos(accueil && accueil.hass, tickTodos);
  const etatsRappels = (accueil && accueil.hass && accueil.hass.states) || null;
  const choisie = ((cfgVal('loggia_veilles', null) || {}).collecte || {}).source || '';
  const source = useMemo(() => sourceCollecte(etatsRappels || {}, plateformeDe, choisie), [etatsRappels, choisie]);
  /* Le premier jour qui porte un bac. Le bandeau ne se montre que la veille ou
   * le jour meme — il decide, pas nous. */
  const prochaine = useMemo(() => prochaineCollecte({ ...source, evenements: agenda, etats: etatsRappels || {} }),
    [source, agenda, etatsRappels]);
  /* « C'est sorti » vit dans la partie COMMUNE (`loggia_collecte`), au serveur,
   * avec le bouton de la notification : tous les ecrans se taisent ensemble,
   * et rien ne se perd au rechargement. Il se retient par DATE : le lendemain,
   * le bandeau revient de lui-meme pour la collecte suivante. */
  const cleCollecte = prochaine ? jourIso(prochaine.date) : '';
  const bandeauCollecte = prochaine ? (
    <BandeauCollecte prochain={prochaine} sorti={sortiPour(cfgVal('loggia_collecte', null), prochaine)}
      onSorti={(v) => marquerSorti(accueil && accueil.hass, cleCollecte, v)} />
  ) : null;
  return { relireTodos, taches, bandeauCollecte };
}

/* « C'est sorti » depuis le bandeau : `loggia/collecte/sorti`, ouvert a tout
 * compte, au meme endroit que le bouton de la notification. La reponse est la
 * partie commune telle que le serveur la garde ; le signal de la configuration
 * la porte aux autres ecrans. Un composant pas encore redemarre ne connait pas
 * la commande : le geste vaut alors pour cet ecran, jusqu'au rechargement. */
function marquerSorti(hass, cle, sorti) {
  if (!cle) return Promise.resolve(false);
  const ici = () => {
    const avant = cfgVal('loggia_collecte', null) || {};
    cfgRecue('loggia_collecte', { ...avant, sorti: sorti ? cle : (avant.sorti === cle ? '' : (avant.sorti || '')) });
    return true;
  };
  if (!hass || typeof hass.callWS !== 'function') return Promise.resolve(ici());
  return hass.callWS({ type: 'loggia/collecte/sorti', date: cle, sorti: !!sorti })
    .then((r) => { if (r && typeof r === 'object') cfgRecue('loggia_collecte', r); return true; })
    .catch((e) => ((e && e.code === 'unknown_command') ? ici() : false));
}

/* L’agencement de l’Accueil (`loggia_accueil`) : sa lecture et son écriture, la grille propre au format d’écran,
 * défaire / refaire (⌘Z compris) et l’historique des séances d’édition. Un seul hook : défaire et l’historique écrivent dans la pile.
 * Sorti de `Dashboard` tel quel (lot 5 de l’audit du 28/10, étape d ; ADR 0283) : ses entrées et ses sorties sont nommées. */
function useAgencementAccueil({ editMode, planActif }) {
  /* ── L'accueil se compose : ordre et visibilité des sections ───────────────
   * En mode édition, chaque section se SAISIT et se glisse sur une autre de sa
   * colonne pour prendre sa place, et la croix la masque — elle réapparaît
   * grisée en édition, avec un bouton pour la rétablir. Ordre et masques dans
   * `loggia_accueil`, par appareil. Une section inconnue de la sauvegarde
   * (ajoutée par une version future) se range à la fin, jamais perdue. */
  const [accL, setAccL] = useState(() => {
    const v = cfgVal('loggia_accueil', null) || {};
    // piecesOrdre et tailles font partie de la sauvegarde : les oublier ici
    // rendait l'ordre et la taille des cartes pièces perdus à chaque
    // rechargement, alors que saveAccL les écrivait bien.
    return { main: Array.isArray(v.main) ? v.main : null, rail: Array.isArray(v.rail) ? v.rail : null, caches: Array.isArray(v.caches) ? v.caches : [...ACC_CACHES_DEFAUT],
      piecesOrdre: Array.isArray(v.piecesOrdre) ? v.piecesOrdre : [], tailles: (v.tailles && typeof v.tailles === 'object') ? v.tailles : {},
      /* La CELLULE de chaque carte pièce — colonne et rangée (23/09). L'ordre
       * ci-dessus reste : il sert de repli tant qu'une carte n'a pas été
       * posée à la main, et il donne sa taille par défaut. */
      places: (v.places && typeof v.places === 'object') ? v.places : {},
      /* Les widgets en option du rail (ADR 0041) : ceux qu'on a ajoutes et
       * leur style. Les villes du calendrier « mois » sont parties avec lui
       * (decision 0132) : une vieille cle `villes` reste en base, inerte. */
      ajoutees: Array.isArray(v.ajoutees) ? v.ajoutees : [...ACC_AJOUTEES_DEFAUT], styles: (v.styles && typeof v.styles === 'object') ? v.styles : {},
      /* Les grilles des autres formats. Les cles ci-dessus restent celles de
       * l'ORDINATEUR : une installation existante retrouve donc son accueil
       * tel qu'elle l'a laisse, et ne decouvre `formats` que le jour ou
       * quelqu'un edite depuis une tablette ou un telephone. */
      formats: (v.formats && typeof v.formats === 'object') ? v.formats : {} };
  });
  /* Le dashboard suit la MAISON, pas le navigateur : l'agencement part au
   * composant. En localStorage, il changeait d'un appareil a l'autre — et meme
   * d'un reseau a l'autre, l'acces distant n'ayant pas la meme origine que
   * l'acces local (retour 03/09). */
  /* Annuler / refaire.
   *
   * `saveAccL` est le passage UNIQUE de tout ce qui se modifie en edition —
   * ordre des sections, masquages, ordre des pieces, tailles. Une pile posee
   * ici les couvre donc toutes, sans avoir a decrire chaque geste.
   *
   * On empile des ETATS, pas des gestes : revenir en arriere est alors une
   * simple reaffectation, et aucun geste n'a besoin de savoir s'inverser.
   * Vingt pas suffisent — au-dela, personne ne se souvient de ce qu'il
   * annule, et chaque etat garde une copie de l'agencement.
   */
  const [passe, setPasse] = useState([]);
  const [futur, setFutur] = useState([]);
  /* `avec` : ce qui doit partir DANS LE MEME LOT que la grille — la piece
   * qu'on enregistre ou qu'on retire (audit du 03/10, `ecrirepiece.js`). Le
   * composant prend un lot en entier ou le refuse en entier : la grille ne
   * bouge jamais sans elle.
   *
   * Refusee, la grille revient aussi A L'ECRAN. `saveCfg` rend aux reglages
   * communs leur valeur d'avant ; `accL`, etat propre a l'accueil, se reprend
   * ici. Restee affichee, le geste suivant — une carte deplacee, acceptee,
   * elle — l'aurait reecrite dans le commun avec la piece refusee : le meme
   * defaut, un geste plus tard. Sauf si l'on a deja rebouge entre-temps : on
   * ne defait pas ce qu'on n'a pas fait. */
  const saveAccL = (n, avec) => {
    setPasse(p => [...p.slice(-19), accL]);
    setFutur([]);           // une nouvelle action coupe la branche refaite
    setAccL(n);
    const avant = accL;
    cfgSet({ loggia_accueil: n, ...avec }).then((pris) => {
      if (pris !== false) return;
      setAccL(cur => (cur === n ? avant : cur));
      setPasse(p => (p[p.length - 1] === avant ? p.slice(0, -1) : p));
    });
  };
  /* Le format est lu des ici : la grille qui suit en depend, et une `const`
   * n'existe pas avant sa ligne. */
  const wide = useWide(1180);
  const tactile = useCoarse();
  /* Une grille PAR FORMAT, sur la meme maison.
   *
   * Un telephone n'a pas les moyens d'un ecran large : le meme ordre de
   * sections y descend trop bas, et les cameras passent avant ce qu'on ouvre
   * vraiment. Chaque format garde donc son agencement.
   *
   * Cote SERVEUR malgre tout — l'agencement suit la maison, pas le navigateur
   * (voir plus haut). Deux tablettes voient la meme grille tablette ; c'est le
   * TYPE d'appareil qui separe, jamais l'appareil lui-meme.
   *
   * L'ordinateur ecrit dans les cles historiques, les autres dans `formats`.
   * Un format sans grille propre suit celle de l'ordinateur : on ne duplique
   * rien d'avance, sinon la moindre retouche sur grand ecran laisserait le
   * telephone fige sur un vieil etat sans que personne ne le voie.
   */
  const formatGrille = formatEcran(tactile, wide);
  /* Les pieces en CARTES ou en PLAN (30/09, retenu le 01/10). Le plan n'existe
   * pas encore : le bouton est la, la place est prise, et on le dit franchement
   * plutot que de dessiner un faux.
   *
   * Le choix se GARDE desormais, par type d'ecran et dans la maison : « un
   * reglage pourrait etre bien pour afficher de preference soit les pieces soit
   * le plan par defaut ». Pas de reglage en double dans Parametres — la bascule
   * de l'Accueil EST le reglage, elle se souvient. */
  const [vuePiecesCfg, setVuePiecesCfg] = useState(() => cfgVal('loggia_vuepieces', null));
  /* L'etage regarde, ou null pour « Tous ». En memoire seulement : c'est un
   * filtre de consultation, pas un reglage — on le rouvre a plat. */
  const [etageChoisi, setEtageChoisi] = useState(null);
  /* L'option « Plan 3D de la maison » (Apparence → Affichage, 20/10) :
   * coupee, le choix enregistre ne compte plus et les pieces restent en
   * cartes — il revient tel quel quand on la rallume. */
  const vuePieces = planActif ? vuePiecesDe(vuePiecesCfg, formatGrille) : 'cartes';
  const setVuePieces = (id) => {
    const n = poserVuePieces(vuePiecesCfg, formatGrille, id);
    setVuePiecesCfg(n);
    cfgSet({ loggia_vuepieces: n });
  };
  /* Un écran qui range SA mise en page a aussi sa grille (ADR 0222). */
  const appareilAcc = appareilPropre();
  const grillePropre = appareilAcc ? !!(accL.appareils || {})[appareilAcc] : (formatGrille !== 'pc' && !!(accL.formats || {})[formatGrille]);
  /* Clé par clé (ADR 0221) : ce que ce format a rangé l'emporte, le reste suit
   * l'ordinateur. Retailler une tuile au téléphone ne fige plus ses sections. */
  const grille = grilleDuFormat(accL, formatGrille, appareilAcc);
  // `avec` suit la grille dans le meme envoi (voir `saveAccL`).
  const saveGrille = (g, avec) => saveAccL(poserGrille(accL, formatGrille, g, appareilAcc), avec);
  /* COMBIEN DE VIGNETTES DE CAMERA PAR LIGNE (20/09) : le meme raisonnement que la grille
   * — par type d'ecran, dans la maison (`loggia_camdispo`), pas dans le
   * navigateur. La vue Securite lit la meme cle : deux endroits, un reglage. */
  const [camDispo, setCamDispo] = useState(() => cfgVal('loggia_camdispo', null));
  const poserCam = (id) => {
    const n = poserCamDispo(camDispo, formatGrille, id);
    setCamDispo(n);
    cfgSet({ loggia_camdispo: n });
  };
  /* Repartir de l'ordinateur : on SUPPRIME la surcharge plutot que d'y recopier
   * la grille de bureau. Recopiee, elle cesserait de suivre au premier
   * changement suivant. */
  const suivrePc = () => {
    // Un appareil nommé revient d'abord à son type d'écran.
    if (appareilAcc) { saveAccL({ ...accL, ...sansPart(accL, formatGrille, appareilAcc) }); return; }
    const f = { ...(accL.formats || {}) };
    delete f[formatGrille];
    saveAccL({ ...accL, formats: f });
  };
  /* L'historique persiste, et suit la MAISON : `loggia_histo` s'ecrit sans
   * tiret, donc `est_personnelle` le classe en commun — comme l'agencement
   * qu'il archive. Restaurer depuis le telephone doit valoir pour tous. */
  const [histo, setHisto] = useState(() => {
    const v = cfgVal('loggia_histo', null);
    return Array.isArray(v) ? v.filter(x => x && x.ts && x.grille) : [];
  });
  const [histoOuvert, setHistoOuvert] = useState(false);
  /* L'etat au moment ou l'on entre en edition. Une ref, pas un state : le
   * relire ne doit rien redessiner, et il ne sert qu'a la sortie. */
  const avantSeance = useRef(null);
  useEffect(() => {
    if (editMode) { avantSeance.current = accL; return; }
    const av = avantSeance.current;
    avantSeance.current = null;
    if (!av) return;
    // Une seance blanche ne merite pas une version.
    if (JSON.stringify(av) === JSON.stringify(accL)) return;
    setHisto(h => {
      const suiv = elaguerHisto([{ ts: Date.now(), grille: av }, ...h]);
      cfgSet({ loggia_histo: suiv });
      return suiv;
    });
    /* `accL` est lu en fermeture SANS figurer dans les dependances, et c'est
     * voulu : l'effet ne doit se declencher qu'aux transitions du mode edition.
     * Le callback etant recree a chaque rendu, il capture bien la valeur du
     * rendu ou la transition a lieu.
     *
     * L'ecrire ici parce que le lint le signale, et qu'un futur refactor qui
     * memoiserait ce callback romprait la capture sans que rien ne le voie. */
  }, [editMode]);   // eslint-disable-line react-hooks/exhaustive-deps
  const restaurer = (e) => { if (e && e.grille) saveAccL(e.grille); };
  const oublierHisto = () => { setHisto([]); cfgSet({ loggia_histo: [] }); };
  /* Les effets de bord vivent DEHORS de l'updater.
   *
   * Ils etaient dedans : `setPasse(p => { setFutur(...); setAccL(...); cfgSet(...) })`.
   * React se reserve le droit de rappeler un updater — c'est meme ce que fait
   * StrictMode, deliberement, pour debusquer ce cas. Chaque double appel aurait
   * empile `accL` deux fois dans `futur` et envoye deux fois l'enregistrement.
   *
   * Le dashboard ne monte pas en StrictMode aujourd'hui, donc rien ne casse ;
   * mais c'est la ligne qu'on ajoute un jour pour deboguer autre chose, et
   * l'annulation se mettrait alors a corrompre sa propre pile. Lire l'etat
   * directement suffit : ces deux gestes viennent d'un clic, jamais d'une
   * rafale ou deux appels se marcheraient dessus. */
  const annuler = () => {
    if (!passe.length) return;
    const avant = passe[passe.length - 1];
    setPasse(p => p.slice(0, -1));
    setFutur(f => [...f, accL]);
    setAccL(avant);
    cfgSet({ loggia_accueil: avant });
  };
  const refaire = () => {
    if (!futur.length) return;
    const apres = futur[futur.length - 1];
    setFutur(f => f.slice(0, -1));
    setPasse(p => [...p, accL]);
    setAccL(apres);
    cfgSet({ loggia_accueil: apres });
  };
  /* Quitter l'edition oublie l'historique : rouvrir le mode le lendemain et
   * pouvoir defaire un geste qu'on ne voit plus a l'ecran serait une trappe,
   * pas un filet. */
  useEffect(() => { if (!editMode) { setPasse([]); setFutur([]); } }, [editMode]);
  /* Ctrl+Z, Ctrl+Maj+Z — mais jamais dans un champ de saisie : on y volerait
   * l'annulation du texte que la personne est en train de taper. */
  /* Les deux gestes dans une référence VIVANTE (audit du 27/09). `annuler` et
   * `refaire` se referment sur `passe`, `futur` et `accL` : ils changent
   * d'identité à chaque rendu, donc les nommer en dépendances reposerait
   * l'écoute aussi souvent que de n'en déclarer aucune — ce que faisait
   * l'effet ci-dessous, sur `window`, à chaque tic de `useHass`. Le détour est
   * celui que le projet emploie déjà ailleurs (`systeme.jsx`, `wx3d.jsx`). */
  const gestesZ = useRef({ annuler, refaire });
  useEffect(() => { gestesZ.current = { annuler, refaire }; });
  useEffect(() => {
    if (!editMode) return undefined;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const t = e.target;
      const dansUnChamp = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (dansUnChamp) return;
      e.preventDefault();
      const { annuler: defaire, refaire: rejouer } = gestesZ.current;
      if (e.shiftKey) rejouer(); else defaire();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editMode]);
  return { passe, futur, wide, tactile, formatGrille, etageChoisi, setEtageChoisi, vuePieces, setVuePieces, appareilAcc, grillePropre, grille, saveGrille, camDispo, poserCam, suivrePc, histo, histoOuvert, setHistoOuvert, restaurer, oublierHisto, annuler, refaire };
}

/* Le glisser-déposer des SECTIONS de l’Accueil, au pointeur et au clavier ; les montrer, les cacher, leur style.
 * Sorti de `Dashboard` tel quel (lot 5 de l’audit du 28/10, étape d ; ADR 0283) : ses entrées et ses sorties sont nommées. */
function useGlisserSections({ editMode, grille, saveGrille }) {
  const ordreDe = (zone) => {
    const base = zone === 'main' ? ACC_MAIN : ACC_RAIL;
    const sauve = (grille[zone] || []).map(s => ACC_RENOMME[s] || s).filter(s => base.indexOf(s) >= 0);
    const manquants = base.filter(s => sauve.indexOf(s) < 0);
    // Une section nee apres l'enregistrement de l'accueil se place en tete
    // quand c'est sa place : Securite (v3.24) dans la colonne, « A surveiller »
    // dans le rail (v3.29, deplacee la le 16/09 a la demande de l'utilisateur),
    // puis la meteo (v3.39, ADR 0038) : demandee « sur le cote », elle ne doit
    // pas naitre tout en bas d'un rail deja range.
    if (sauve.length) {
      const tete = (zone === 'main' ? [] : ['attention', 'meteo']).filter(s => manquants.indexOf(s) >= 0);
      if (tete.length) return [...tete, ...sauve, ...manquants.filter(s => tete.indexOf(s) < 0)];
    }
    return [...sauve, ...manquants];
  };
  const [secDrag, setSecDrag] = useState(null); // { zone, id, ordre }
  // Au doigt : appui court (200 ms, vibration) avant de saisir une section ;
  // puis la section SUIT le pointeur, comme une carte de grille.
  const secTimer = useRef(null);
  const secDebut = useRef(null);
  const secFantome = useRef(null);
  /* À la souris, l'appui RETENU en attendant cinq pixels de mouvement (19/10) :
   * saisie dès l'appui, un clic qui manquait le ⤢ d'une carte de quelques
   * pixels emportait le panneau entier — « la fenêtre Pièces prend le dessus ».
   * Le seuil est celui d'Appareils (`useLayoutEditor`). */
  const secSouris = useRef(null);
  const debutSec = (e, zone, id) => {
    if (!editMode) return;
    /* `:not(.o-surface)` (lot 13 de l'audit du 03/10) : la surface de la
     * section EST la section — l'appui sur elle la saisit, comme avant sur la
     * section elle-même. Les autres boutons gardent leur clic. */
    if (e.target.closest && e.target.closest('button:not(.o-surface), [role="switch"], input')) return;
    /* La grille des cartes appartient aux CARTES (19/10) : les 8 px entre deux
     * cartes, une case vide, « Ajouter une pièce » saisissaient la section au
     * lieu de laisser la main aux cartes. Le panneau se prend par son en-tête
     * et son cadre. */
    if (e.target.closest && e.target.closest('[data-cartes]')) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    const hote = e.currentTarget;
    if (e.pointerType === 'touch') {
      secDebut.current = { x: e.clientX, y: e.clientY, zone, id };
      clearTimeout(secTimer.current);
      secTimer.current = setTimeout(() => {
        if (!secDebut.current) return;
        try { if (navigator.vibrate) navigator.vibrate(35); } catch {}
        secFantome.current = poserFantome(hote, secDebut.current.x, secDebut.current.y);
        setSecDrag({ zone: secDebut.current.zone, id: secDebut.current.id, ordre: ordreDe(secDebut.current.zone) });
      }, 200);
      return;
    }
    e.preventDefault();
    secSouris.current = { hote, x: e.clientX, y: e.clientY, zone, id };
  };
  const mouvSec = (e) => {
    let d = secDrag;
    const s = secSouris.current;
    if (!d && s) {
      // En deçà du seuil, l'intention est de cliquer, pas de déplacer.
      if (Math.abs(e.clientX - s.x) < 5 && Math.abs(e.clientY - s.y) < 5) return;
      secSouris.current = null;
      secFantome.current = poserFantome(s.hote, s.x, s.y);
      // La cible se lit DÈS ce mouvement : un geste vif n'en envoie parfois qu'un avant le lâcher.
      d = { zone: s.zone, id: s.id, ordre: ordreDe(s.zone) };
    }
    if (!d && secDebut.current) {
      if (Math.abs(e.clientX - secDebut.current.x) > 10 || Math.abs(e.clientY - secDebut.current.y) > 10) {
        clearTimeout(secTimer.current); secDebut.current = null;
      }
      return;
    }
    if (!d) return;
    if (secFantome.current) secFantome.current.suivre(e.clientX, e.clientY);
    const sous = document.elementFromPoint(e.clientX, e.clientY);
    const cible = sous && sous.closest ? sous.closest('[data-sec]') : null;
    const idCible = cible ? cible.getAttribute('data-sec') : null;
    /* Depuis l'ordre ENREGISTRÉ, qui ne bouge pas pendant le geste (19/10) :
     * rejoué sur l'ordre déjà échangé, chaque mouvement au-dessus de la même
     * section défaisait le précédent, et le lâcher tombait selon la parité. */
    const a = [...ordreDe(d.zone)];
    const de = a.indexOf(d.id), vers = idCible ? a.indexOf(idCible) : -1;
    if (!cible || idCible === d.id || cible.getAttribute('data-zone') !== d.zone || de < 0 || vers < 0) {
      if (d !== secDrag) setSecDrag(d);
      return;
    }
    a.splice(de, 1); a.splice(vers, 0, d.id);
    setSecDrag({ ...d, ordre: a });
  };
  const finSec = () => {
    clearTimeout(secTimer.current); secDebut.current = null;
    secSouris.current = null;
    if (secFantome.current) { secFantome.current.lever(); secFantome.current = null; }
    if (secDrag) saveGrille({ [secDrag.zone]: secDrag.ordre });
    setSecDrag(null);
  };
  /* Au clavier (ADR 0068) : en edition la section prend le focus, et les
   * fleches la deplacent d'un cran dans sa zone. Seulement quand c'est ELLE
   * qui a le focus — un bouton de son bandeau garde ses touches. */
  const deplacerSec = (zone, id, delta) => {
    const a = [...ordreDe(zone)];
    const i = a.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= a.length) return;
    a.splice(j, 0, a.splice(i, 1)[0]);
    saveGrille({ [zone]: a });
  };
  const clavierSec = (e, zone, id) => {
    if (e.target !== e.currentTarget) return;
    const d = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key];
    if (!d) return;
    e.preventDefault();
    deplacerSec(zone, id, d);
  };
  /* Un widget EN OPTION (l'heure, le calendrier — ADR 0041) ne se montre que si
   * on l'a AJOUTE : sa croix le retire de `ajoutees`, elle ne le « masque » pas,
   * et un vieux masquage de l'ancienne section « calendrier » ne le concerne pas. */
  const estOption = (id) => WIDGETS_OPTION.indexOf(id) >= 0;
  const cacheSec = (id) => estOption(id)
    ? saveGrille({ ajoutees: (grille.ajoutees || []).filter(x => x !== id) })
    : saveGrille({ caches: [...grille.caches, id] });
  const montreSec = (id) => estOption(id)
    ? saveGrille({ ajoutees: [...(grille.ajoutees || []).filter(x => x !== id), id] })
    : saveGrille({ caches: grille.caches.filter(x => (ACC_RENOMME[x] || x) !== id) });
  const choisirStyle = (id, style) => saveGrille({ styles: { ...(grille.styles || {}), [id]: style } });
  return { ordreDe, secDrag, debutSec, mouvSec, finSec, clavierSec, estOption, cacheSec, montreSec, choisirStyle };
}

/* Le glisser-déposer des PIÈCES de l’Accueil, leur taille et leur grille.
 * Sorti de `Dashboard` tel quel (lot 5 de l’audit du 28/10, étape d ; ADR 0283) : ses entrées et ses sorties sont nommées. */
function useGlisserPieces({ editMode, grille, saveGrille, tactile, wide }) {
  // Drag d'une CARTE pièce (dans la section) : même mécanique que les sections
  // — souris directe, appui long au doigt — mais l'ordre est le sien
  // (accL.piecesOrdre). stopPropagation : sinon la section se saisit avec.
  const [pieceDrag, setPieceDrag] = useState(null); // { id, noms, c, r } — la cellule visée
  /* La grille des pièces : c'est NOUS qui décidons du nombre de colonnes, et la
   * grille le reçoit (`repeat(n, minmax(0,1fr))`). Le lire sur le style calculé
   * se mordait la queue — une carte posée hors du modèle y ajoutait une colonne
   * implicite, comptée à la lecture suivante (voir placement.js). */
  const piecesGrille = useRef(null);
  const piecesObs = useRef(null);
  const mesurerPieces = useRef(null);
  const etroitPieces = !useWide(641); // le téléphone : deux colonnes, comme partout
  const [piecesCols, setPiecesCols] = useState(() => (etroitPieces ? 2 : 3));
  /* La mesure dans une référence vivante : l'observateur se pose UNE fois, et
   * doit lire les réglages du jour — pas ceux du montage. Changer de format
   * (téléphone, mosaïque) remesure sans le reposer. */
  useEffect(() => {
    mesurerPieces.current = () => {
      const el = piecesGrille.current;
      if (!el) return;
      try { setPiecesCols(colonnesPour(el.getBoundingClientRect().width, etroitPieces, tactile && wide)); } catch { /* grille partie */ }
    };
    if (piecesGrille.current) mesurerPieces.current();
  }, [etroitPieces, tactile, wide]);
  /* La grille se pose elle-même (audit du 27/09). L'effet qui tenait
   * l'observateur n'avait AUCUN tableau de dépendances : `Dashboard` se rend à
   * chaque tic de `useHass` — plusieurs fois par minute dans une vraie maison
   * —, et il détruisait puis rebâtissait un `ResizeObserver` en forçant un
   * calcul de mise en page synchrone, à ce rythme-là.
   *
   * Déclarer des dépendances n'aurait pas suffi : la grille vit dans une
   * SECTION de l'Accueil, elle arrive donc parfois après le premier rendu — on
   * glisse jusqu'à sa page, on active la section. L'effet sans dépendances
   * rattrapait ce cas par accident, en se relançant sans fin. Une `ref` de
   * rappel le fait exprès : React l'appelle quand le nœud arrive, et de
   * nouveau avec `null` quand il part. Mémoïsée à vide, sans quoi React la
   * rappellerait à chaque rendu — le défaut qu'on vient de retirer. */
  const poserGrillePieces = useCallback((el) => {
    if (piecesObs.current) { piecesObs.current.disconnect(); piecesObs.current = null; }
    piecesGrille.current = el;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const lire = () => { if (mesurerPieces.current) mesurerPieces.current(); };
    lire();
    piecesObs.current = new ResizeObserver(lire);
    piecesObs.current.observe(el);
  }, []);
  /* La taille RÉSOLUE de chaque pièce : le choix explicite s'il existe, sinon
   * celle que l'ordre donne par défaut. Le placement en a besoin — une carte
   * standard occupe deux rangées. */
  const taillesDe = (noms) => {
    const ordre = ordrePieces(noms);
    const out = {};
    ordre.forEach((nom, i) => {
      const choisi = (grille.tailles || {})[nom];
      out[nom] = (choisi === 's' || choisi === 'c') ? choisi : tailleParDefaut(i, tactile, wide);
    });
    return out;
  };
  const pieceTimer = useRef(null);
  const pieceDebut = useRef(null);
  const pieceFantome = useRef(null);
  // À la souris, l'appui retenu jusqu'à cinq pixels (19/10) — voir `secSouris`.
  const pieceSouris = useRef(null);
  const ordrePieces =(noms) => { const sauve = (grille.piecesOrdre || []).filter(n => noms.indexOf(n) >= 0); return [...sauve, ...noms.filter(n => sauve.indexOf(n) < 0)]; };
  const debutPiece = (e, id, noms) => {
    if (!editMode) return;
    // La surface de la tuile EST la tuile (lot 13) : son appui la saisit.
    if (e.target.closest && e.target.closest('button:not(.o-surface), [role="switch"], input')) return;
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    const hote = e.currentTarget;
    if (e.pointerType === 'touch') {
      pieceDebut.current = { x: e.clientX, y: e.clientY, id, noms };
      clearTimeout(pieceTimer.current);
      pieceTimer.current = setTimeout(() => {
        if (!pieceDebut.current) return;
        try { if (navigator.vibrate) navigator.vibrate(35); } catch {}
        pieceFantome.current = poserFantome(hote, pieceDebut.current.x, pieceDebut.current.y);
        setPieceDrag({ id: pieceDebut.current.id, noms: pieceDebut.current.noms, c: 0, r: 0 });
      }, 200);
      return;
    }
    e.preventDefault();
    pieceSouris.current = { hote, x: e.clientX, y: e.clientY, id, noms };
  };
  const mouvPiece = (e) => {
    let d = pieceDrag;
    const s = pieceSouris.current;
    if (!d && s) {
      // En deçà du seuil, l'intention est de cliquer, pas de déplacer.
      if (Math.abs(e.clientX - s.x) < 5 && Math.abs(e.clientY - s.y) < 5) return;
      pieceSouris.current = null;
      pieceFantome.current = poserFantome(s.hote, s.x, s.y);
      // La case se vise DÈS ce mouvement : un geste vif n'en envoie parfois qu'un avant le lâcher.
      d = { id: s.id, noms: s.noms, c: 0, r: 0 };
    }
    if (!d && pieceDebut.current) {
      if (Math.abs(e.clientX - pieceDebut.current.x) > 10 || Math.abs(e.clientY - pieceDebut.current.y) > 10) {
        clearTimeout(pieceTimer.current); pieceDebut.current = null;
      }
      return;
    }
    if (!d) return;
    if (pieceFantome.current) pieceFantome.current.suivre(e.clientX, e.clientY);
    /* On vise une CELLULE, et rien ne bouge sous le doigt : la grille reste
     * telle quelle, seule la case visée s'allume. L'échange, s'il y en a un,
     * se fait au lâcher. */
    const el = piecesGrille.current;
    const { c, r } = el ? cellulePointee(e.clientX, e.clientY, el.getBoundingClientRect(), piecesCols) : d;
    if (d === pieceDrag && d.c === c && d.r === r) return;
    setPieceDrag({ ...d, c, r });
  };
  const finPiece = () => {
    clearTimeout(pieceTimer.current); pieceDebut.current = null;
    pieceSouris.current = null;
    if (pieceFantome.current) { pieceFantome.current.lever(); pieceFantome.current = null; }
    if (pieceDrag && pieceDrag.c) {
      const noms = pieceDrag.noms;
      saveGrille({ places: nettoyer(poser(grille.places, noms, taillesDe(noms), pieceDrag.id, pieceDrag.c, pieceDrag.r, piecesCols), noms) });
    }
    setPieceDrag(null);
  };
  /* Au clavier (ADR 0068) : la tuile a le focus en edition, les fleches la
   * deplacent d'un cran — les boutons de sa carte d'edition gardent leurs touches. */
  /* Au clavier, une flèche déplace la carte d'UNE CELLULE, dans le sens de la
   * flèche — pas d'un rang dans une liste. Même geste que le doigt, même
   * résultat : la case visée se libère, ou les deux cartes s'échangent. */
  const deplacerPiece = (id, noms, dc, dr) => {
    const t = taillesDe(noms);
    const ou = disposer(ordrePieces(noms), t, grille.places, piecesCols)[id];
    if (!ou) return;
    const c = ou.c + dc, r = ou.r + dr;
    if (c < 1 || c > piecesCols || r < 1) return;
    saveGrille({ places: nettoyer(poser(grille.places, noms, t, id, c, r, piecesCols), noms) });
  };
  const clavierPiece = (e, id, noms) => {
    if (e.target !== e.currentTarget) return;
    const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (!d) return;
    e.preventDefault();
    deplacerPiece(id, noms, d[0], d[1]);
  };
  /* La fiche d'une piece ecrit la configuration (`lotPiece`) ; la taille et
   * l'ordre vivent dans la grille de l'accueil, ici. Renommer les emporte ;
   * retirer les efface. Une piece ajoutee prend la taille choisie et se range
   * en dernier (`ordrePieces` complete l'ordre sauve).
   *
   * Les deux partent dans UN lot (audit du 03/10) : en deux envois, un compte
   * ordinaire voyait la piece refusee et la grille acceptee — la carte perdait
   * sa taille et sa place pour tout le foyer. Voir `ecrirepiece.js`. */
  const enregistrerPieceIci = (avant, piece, compacte) => {
    saveGrille(grilleAvecPiece(grille, avant, piece.room, compacte), lotPiece(avant, piece));
  };
  const retirerPiece = (nom) => {
    saveGrille(grilleSansPiece(grille, nom), lotSansPiece(nom));
  };
  return { pieceDrag, etroitPieces, piecesCols, poserGrillePieces, taillesDe, ordrePieces, debutPiece, mouvPiece, finPiece, clavierPiece, enregistrerPieceIci, retirerPiece };
}

/* Le ciel de l’Accueil : la météo affichée, le décor, l’heure du soleil.
 * Sorti de `Dashboard` tel quel (lot 5 de l’audit du 28/10, étape d ; ADR 0283) : ses entrées et ses sorties sont nommées. */
function useCielAccueil({ editMode, override, weatherMode, weatherRaw }) {
  const wx = (editMode && override) ? override : (weatherMode || 'clouds'); // suit l'entité météo, sauf override en mode édition
  // Fond GLSL : état HA brut prioritaire ; les overrides du mode édition sont mappés vers un preset proche
  const WX3D_FROM_MODE = { sun: 'sunny', partly: 'partlycloudy', clouds: 'cloudy', wind: 'windy', rain: 'rainy', snow: 'snowy', storm: 'lightning-rainy', night: 'clear-night' };
  /* Vrai une fois la première peinture passée : le décor météo s'y accroche. */
  const [fondPret, setFondPret] = useState(PAINT_READY);
  useEffect(() => {
    let vivant = true;
    onPaintReady(() => { if (vivant) setFondPret(true); });
    return () => { vivant = false; };
  }, []);
  const cond3d = (editMode && override) ? (WX3D_FROM_MODE[override] || 'partlycloudy')
    : (weatherRaw && CIEL_HA[weatherRaw] ? weatherRaw : (WX3D_FROM_MODE[weatherMode] || 'partlycloudy'));
  /* L'heure du ciel, et ce qu'il en fait (handoff « Loggia themes redesign »).
   * Le ciel suit l'horloge entre le VRAI lever et le VRAI coucher. Comme dans
   * la maquette, « nuit claire » de jour force la nuit et « ensoleillé » de
   * nuit force le jour (une valeur choisie à la main en édition) — aux mêmes
   * places dans l'arc que ses 22 h 30 et 14 h d'un 9 octobre. Ciel sombre
   * (nuit, orage, averse, grêle) : en thème clair, le texte posé dessus passe
   * au blanc. */
  const [soleil, setSoleil] = useState(cielSoleil);
  const [heureCiel, setHeureCiel] = useState(heureLocale);
  useEffect(() => { const iv = setInterval(() => { setSoleil(cielSoleil()); setHeureCiel(heureLocale()); }, 60000); return () => clearInterval(iv); }, []);
  const lev = soleil.lever ?? 8.1, cou = soleil.coucher ?? 19.35;
  const deJour = heureCiel >= lev && heureCiel <= cou;
  const heureForcee = cond3d === 'clear-night' && deJour ? (cou + 3.15) % 24
    : cond3d === 'sunny' && !deJour ? lev + (14 - 8.1) / (19.35 - 8.1) * (cou - lev) : null;
  const arcCiel = ((heureForcee ?? heureCiel) - lev) / (cou - lev);
  const cielSombre = (arcCiel >= 0 && arcCiel <= 1 ? Math.sin(Math.PI * arcCiel) * 0.62 : -0.1) < 0.07 || CIEL_SOMBRES.includes(cond3d);
  const modes = [['sun', '☀️', tr('Soleil')], ['partly', '⛅', tr('Éclaircies')], ['clouds', '☁️', tr('Nuageux')], ['wind', '🌬️', tr('Vent')], ['rain', '🌧️', tr('Pluie')], ['snow', '❄️', tr('Neige')], ['storm', '⛈️', tr('Orage')], ['night', '🌙', tr('Nuit')]];
  return { wx, fondPret, cond3d, soleil, heureForcee, cielSombre, modes };
}

/* Les caméras de l’Accueil et leur dernier événement (ADR 0031).
 * Sorti de `Dashboard` tel quel (lot 5 de l’audit du 28/10, étape d ; ADR 0283) : ses entrées et ses sorties sont nommées. */
function useCamerasAccueil({ a }) {
  /* DERNIER EVENEMENT DES TUILES CAMERA (ADR 0031) : les detecteurs que la
   * resolution connait par camera, et le journal de Home Assistant pour leur
   * dernier declenchement — jamais `last_changed`, qui vaut « redemarrage »
   * apres un restart. Sans detecteur ni journal : « Direct », rien d'invente. */
  const camsResolues = (LOGGIA_RESOLVED && LOGGIA_RESOLVED.cameras && LOGGIA_RESOLVED.cameras.list) || [];
  const derniersCams = useDerniersEvenements(a && a.hass, camsResolues.flatMap(c => detecteursDe(c).map(d => d.id)), reduireDerniers);
  const evenementDe = (haid) => {
    const rc = haid ? camsResolues.find(c => (c.haid || c.id) === haid) : null;
    return rc ? evenementCamera(rc, (a && a.hass && a.hass.states) || {}, derniersCams) : null;
  };
  // HA absent → vitrine de demo ; HA present sans camera → aucune camera, pas d'exemple
  const cams = (a && (!a.cams || !a.cams.length)) ? [] : (a && a.cams && a.cams.length) ? a.cams.map((cam, i) => tuileCamera({ ...cam, evenement: evenementDe(cam.haid) }, i, a.hass)) : CAMERAS();
  return { cams };
}

/* « À surveiller » (ADR 0028) : les points, leur couleur, la ligne sous le prénom.
 * Sorti de `Dashboard` tel quel (lot 5 de l’audit du 28/10, étape d ; ADR 0283) : ses entrées et ses sorties sont nommées. */
function useAttentionAccueil({ a, dashHass, sante, sectionMasquee }) {
  /* Ce qu'un compte Home Assistant ordinaire ne pourrait jamais enregistrer,
   * il ne le voit pas (03/10) : ajouter, modifier ou retirer une PIECE ecrit
   * `loggia_rooms`. Sa taille, son ordre et sa place lui restent — c'est de
   * l'agencement. */
  const ordinaire = compteOrdinaire(dashHass);
  /* A SURVEILLER (ADR 0028) : ce qui merite l'attention, en tete de l'accueil
   * — et rien du tout quand tout va bien. Les etats de la maison, les cameras,
   * le CO2 des pieces, le diagnostic (`sante`, recalcule par App), plus deux
   * lectures du serveur toutes les 30 s : les veilles (piles, CO2) et les
   * fenetres (chauffage coupe). Sans serveur, la carte s'en tient aux etats. */
  const veillesEtat = useEtatServeur(dashHass, 'loggia/veilles/etat', 30000, '').etat;
  const fenetresEtat = useEtatServeur(dashHass, 'loggia/fenetres/etat', 30000, '').etat;
  const etatsAcc = (dashHass && dashHass.states) || {};
  const camsInfo = (a && a.cams && a.cams.length) ? a.cams.map(c => ({ nom: c.name, online: c.online })) : [];
  const points = pointsAttention({
    S: etatsAcc, cams: camsInfo,
    // `haid` : le capteur CO2 de la piece, pour qu'une veille sur ce meme
    // capteur ne redise pas le point de la piece.
    pieces: (a && a.rooms) ? a.rooms.map(r => ({ nom: r.name, co2: r.co2, haid: r.co2Id || null, seuil: r.co2Seuil })) : [],
    sante, veilles: veillesEtat, fenetres: fenetresEtat,
    plantes: plantsCfg().map(p => p.base).filter(Boolean),
    // Un `moisture` calculé n'est pas une fuite (ADR 0022, 16/10) : la plateforme, lue dans l'index ; un groupe, une entité masquée n'y comptent pas (M14).
    plateforme: plateformeDe, masque: masqueDe,
    // La couleur Tempo du lendemain (chantier G3, E4) : « Demain : jour rouge », seulement s'il l'est.
    tempoDemain: enHaids().tempoDemain || null,
  });
  const couleurAcc = points.length ? couleurNiveau(niveauMax(points)).col : 'var(--o-ok)';
  /* La ligne sous le prénom suit la section « À surveiller » (ticket #34). */
  const attentionLigne = points.length > 0 && !sectionMasquee('attention');
  return { ordinaire, veillesEtat, etatsAcc, points, couleurAcc, attentionLigne };
}

/* Le rail de l’Accueil : la page demandée au téléphone, la colonne qui défile seule sur grand écran.
 * Sorti de `Dashboard` tel quel (lot 5 de l’audit du 28/10, étape d ; ADR 0283) : ses entrées et ses sorties sont nommées. */
function useRailAccueil({ a, wide }) {
  /* TUILES CLIQUABLES (ADR 0030) : chaque chiffre de la banniere mene la ou
   * l'on agit — l'energie, la piece la plus chargee en CO2, la securite, les
   * lumieres, les medias, et « En ce moment » pour les appareils actifs (le
   * rail sur PC, la seconde page sur telephone : `pageDemandee`). */
  const [pageDemandee, setPageDemandee] = useState(null);
  const pieceCo2Max = (() => {
    const rs = ((a && a.rooms) || []).filter(r => r.co2 != null);
    if (!rs.length) return null;
    return rs.reduce((m, r) => (r.co2 > m.co2 ? r : m), rs[0]).name;
  })();
  /* La colonne du rail défile seule (04/10, demande de l'utilisateur) : la
   * cellule de la grille ne compte plus dans la hauteur de la page, la colonne
   * colle sous l'en-tête et se borne à la fenêtre (index.css, `.o-rail-cell`).
   * Ses deux bornes, la grille encore en dessous du bord et la fin du contenu
   * principal, s'écrivent en variables CSS sur la cellule (`bornesRail`, dans
   * railcolonne.js). AUCUN état React : le défilement ne refait jamais le
   * rendu de l'Accueil, une image au plus par trame, et rien ne s'écrit au
   * milieu de la page, où les deux valeurs ne changent pas. Une `ref` de
   * rappel mémoïsée à vide, comme `poserGrillePieces` : React l'appelle quand
   * la cellule arrive (passage en grand écran) et avec `null` quand elle part.
   * Le ResizeObserver suit la cellule (le contenu principal qui grandit) et le
   * corps (ce qui grandit AU-DESSUS de la grille la déplace sans la
   * redimensionner) ; `resize` couvre les tailles émulées. */
  const railFin = useRef(null);
  const poserRail = useCallback((el) => {
    if (railFin.current) { railFin.current(); railFin.current = null; }
    if (!el) return;
    let raf = 0;
    let prec = {};
    const lire = () => {
      raf = 0;
      const b = bornesRail(el.getBoundingClientRect(), window.innerHeight);
      if (b.depart !== prec.depart) el.style.setProperty('--o-rail-depart', b.depart + 'px');
      if (b.fin !== prec.fin) el.style.setProperty('--o-rail-fin', b.fin + 'px');
      prec = b;
    };
    const demander = () => { if (!raf) raf = requestAnimationFrame(lire); };
    lire();
    window.addEventListener('scroll', demander, { passive: true });
    window.addEventListener('resize', demander);
    let ro = null;
    try { ro = new ResizeObserver(demander); ro.observe(el); ro.observe(document.body); } catch { /* sans ResizeObserver : défilement et redimensionnement suffisent */ }
    railFin.current = () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', demander); window.removeEventListener('resize', demander); if (ro) ro.disconnect(); };
  }, []);
  const voirMoment = () => {
    if (wide) {
      const el = document.querySelector('[data-sec="moment"]');
      /* La colonne qui défile (04/10) : on la fait défiler ELLE, pas la page —
       * `scrollIntoView` emmenait aussi la fenêtre. Elle tient toujours à
       * l'écran : si elle ne défile pas, la section est déjà sous les yeux.
       * `offsetTop` se lit dans la colonne (sticky, donc positionnée) ; moins
       * son rembourrage du haut, la section prend la place de la première
       * carte. En édition, la colonne est dans le flux : le repli d'avant. */
      const col = el && el.closest('.o-rail-col');
      if (col && getComputedStyle(col).overflowY !== 'visible') {
        if (col.scrollHeight > col.clientHeight + 1) col.scrollTo({ top: Math.max(0, el.offsetTop - 6), behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
        return;
      }
      // Mouvement reduit (audit du 03/10) : on saute au panneau sans glisser
      // quand le systeme le demande ; le glissement ecrit en dur l'ignorait.
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: REDUCE_MOTION ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    setPageDemandee(1);
  };
  return { pageDemandee, setPageDemandee, pieceCo2Max, poserRail, voirMoment };
}

/* Les lumières, les volets et le climat des pièces de l’Accueil.
 * Sorti de `Dashboard` tel quel (lot 5 de l’audit du 28/10, étape d ; ADR 0283) : ses entrées et ses sorties sont nommées. */
function useLumieresAccueil({ a, dashHass, lightsSig, noms }) {
  /* Les veilleuses de la règle Nuit (L2, ADR 0261), relues chaque minute : la tuile d'une pièce ne les allume ni ne les
   * éteint, et son état ne les compte pas — une veilleuse seule allumée, la tuile est éteinte. Tant qu'elles ne sont pas
   * lues (null), on ne sait pas quoi épargner : l'interrupteur de la tuile reste dessiné mais inerte, et un appui ne commande
   * rien (audit du 19/10, B15 — comme « Tout éteindre », `veilleusesLues` ; le module Nuit absent lève l'attente). */
  const { etat: nuitEtat, codeErr: nuitCode } = useEtatServeur(dashHass, 'loggia/nuit/etat', 60000);
  const veilleuses = veilleusesLues(nuitEtat, nuitCode);
  const indexA = a && a.index;
  const roomLightMap = useMemo(() => {
    if (!dashHass) return null;
    try {
      const m = {};
      // Aucune lumiere n'est ecartee sur son nom : ce filtre retirait celles
      // dont le nom contient « ampoule », soit plus de la moitie du parc.
      for (const l of discoverLights(dashHass, a && a.index)) {
        const k = rmNorm(l.room); (m[k] || (m[k] = [])).push(l);
      }
      return m;
    } catch { return null; }
    // L'index doit figurer parmi les dependances : il arrive APRES le premier
    // rendu, et sans lui la piece d'une lumiere se deduit encore de son nom.
  }, [lightsSig, indexA]);
  const roomLightsOf = (name) => {
    if (!roomLightMap) return null;
    // La zone Home Assistant fait foi quand la piece en a une : c'est ainsi
    // qu'une piece nommee « Chambre Enfant » retrouve les lumieres de sa zone,
    // quel que soit le nom de celle-ci.
    const r = a && a.rooms && a.rooms.find(x => (x.name || x.room) === name);
    const zone = r && r.area && a.index && a.index.areaById && a.index.areaById.get(r.area);
    if (zone && zone.name) {
      const parZone = roomLightMap[rmNorm(zone.name)];
      if (parZone && parZone.length) return parZone;
    }
    return roomLightMap[rmNorm(name)] || [];
  };
  /**
   * Une entite designee a la main, mise a la forme d'une lumiere.
   *
   * L'applique du jardin est souvent un `switch` sans zone : la decouverte ne
   * la classe dans aucune piece, et elle ne serait donc jamais commandable
   * depuis une carte. Des lors que l'utilisateur l'a DESIGNEE, on la prend
   * telle quelle.
   */
  const entiteBrute = (id) => {
    const st = dashHass && dashHass.states && dashHass.states[id];
    if (!st) return null;
    const at = st.attributes || {};
    const on = st.state === 'on';
    return {
      id, domain: id.split('.')[0], name: at.friendly_name || id.split('.')[1].replace(/_/g, ' '),
      on, bri: on ? 100 : 0, dimmable: false, rgb: false, ct: false, color: null,
    };
  };

  /**
   * Les lumieres qu'un appui sur la carte allume ou eteint.
   *
   * Par defaut toutes celles de la piece — ce filtre ne retenait auparavant que
   * celles dont le nom contenait « plafonnier », une convention d'une seule
   * installation : ailleurs, aucune lumiere ne porte ce mot et le bouton
   * disparaissait de toutes les cartes.
   *
   * L'utilisateur peut en designer un sous-ensemble dans Parametres → Entites,
   * colonne « Lampes du bouton » : allumer la piece entiere n'est pas toujours
   * ce qu'on veut d'un appui rapide. Le COMPTAGE, lui, continue de porter sur
   * toutes les lumieres — « 4 lampes allumees » doit rester vrai.
   *
   * Les veilleuses de la règle Nuit, et les groupes qui en contiennent une, en
   * sont retirées (L2, ADR 0261) : ni allumées ni éteintes par la tuile, et son
   * état ne les lit pas. Une pièce qui n'a QUE sa veilleuse rend `[]` — pas de
   * bouton, et la tuile est éteinte (`PieceCard`).
   */
  const roomMainsOf = (name) => {
    const toutes = roomLightsOf(name);
    const r = a && a.rooms && a.rooms.find(x => (x.name || x.room) === name);
    const choisies = (r && r.lights) || [];
    const S = (dashHass && dashHass.states) || {};
    const sansVeilleuses = (liste) => (liste ? liste.filter(l => !estEpargnee(l.id, S, veilleuses)) : liste);
    // Les entites designees passent AVANT : une piece peut n'avoir aucune
    // lumiere decouverte et pourtant en commander une. C'est le cas de
    // l'exterieur, dont l'applique est un `switch` sans zone — le seul chemin
    // qui l'atteigne est celui que l'utilisateur a indique lui-meme.
    if (!choisies.length) return sansVeilleuses(toutes);
    const parId = new Map((toutes || []).map(l => [l.id, l]));
    const retenues = choisies.map(id => parId.get(id) || entiteBrute(id)).filter(Boolean);
    // Un choix qui ne correspond a rien (entite renommee, retiree) ne doit pas
    // faire disparaitre le bouton : on retombe sur la piece entiere.
    return sansVeilleuses(retenues.length ? retenues : toutes);
  };
  /* Le bouton lumières d'une pièce ne coupe pas, d'un appui, un switch GARDÉ qu'on y aurait désigné — une prise protégée,
   * ou dont la protection n'est pas lue (`gardeDeSwitch`, la règle de tous les chemins ; audit du 19/10, point 4) : il reste
   * allumé, les autres lampes s'éteignent. Le sens du bouton se décide sur les AUTRES : sinon le NAS allumé le tiendrait
   * sur « éteindre », et le bouton ne ferait plus rien. Pas de question ici : sa carte, sa fiche demandent. */
  const toggleRoomLights = (name) => {
    // Les veilleuses pas encore lues : on ne sait pas quoi épargner, rien ne part (B15).
    if (veilleuses == null) return;
    const ms = roomMainsOf(name);
    if (!ms || !ms.length || !dashHass || !dashHass.callService) return;
    const S = dashHass.states || {};
    // L'état des prises, que l'application suit tant que la maison est là (point 2) : pas de cache que personne ne relirait.
    const lecture = lireEtatPrises();
    const gardee = (l) => String(l.id).indexOf('switch.') === 0 && !cvEstLumiere(l.id) && gardeDeSwitch(lecture, l.id, { reconnue: priseDe(S, l.id).prise, indexLu: indexLu() });
    const libres = ms.filter(l => !gardee(l));
    const svc = (libres.length ? libres : ms).some(l => l.on) ? 'turn_off' : 'turn_on';
    const ids = (svc === 'turn_off' ? libres : ms).map(l => l.id);
    if (!ids.length) return;
    commanderService(dashHass, ids, 'homeassistant', svc, { entity_id: ids });
  };
  // ── Volets et clim par pièce : les minis des tuiles ──────────────────────
  // Agir sans ouvrir la pièce. Double chemin de rattachement, comme les
  // lumières : la ZONE HA de la pièce (byArea) d'abord, le nom ensuite —
  // voletCovers et climateZones savent déjà d'où viennent leurs entités
  // (config ou découverte). Le fil pilote (zones sans entité climate) n'a pas
  // de bascule sûre en un geste : seules les entités climate réelles ont un
  // mini.
  const roomExtras = useMemo(() => {
    const S = dashHass && dashHass.states;
    if (!S) return null;
    const m = {};
    try {
      // Le bouton de la pièce ne commande que ses VOLETS (audit du 19/10) : pas le portail de l'Entrée.
      const covs = voletsCommandables(S).filter(c => S[c.haid]);
      const zones = climateZones(S).filter(z => estClimate(z) && z.haid && S[z.haid]);
      for (const nom of noms) {
        const target = rmNorm(nom);
        const r = a && a.rooms && a.rooms.find(x => (x.name || x.room) === nom);
        const parZone = (r && r.area && a.index && a.index.byArea && a.index.byArea.get(r.area)) || [];
        const covers = covs.filter(c => parZone.indexOf(c.haid) >= 0 || rmNorm(c.name).indexOf(target) >= 0).map(c => c.haid);
        const zc = zones.find(z => parZone.indexOf(z.haid) >= 0 || rmNorm(z.room || '') === target || rmNorm(z.name || '').indexOf(target) >= 0);
        m[target] = { covers, clim: zc ? zc.haid : null };
      }
    } catch { return null; }
    return m;
  }, [dashHass, a]);
  const roomCoversInfo = (name) => {
    const ex = roomExtras && roomExtras[rmNorm(name)];
    if (!ex || !ex.covers.length) return null;
    const S = dashHass.states;
    // Meme verdict que la carte : un volet qui bute a 1 % est ferme, et la
    // pastille de la piece doit proposer « Ouvrir », pas « Fermer ».
    const open = ex.covers.some(id => {
      const st = S[id];
      if (!st) return false;
      if (st.state === 'opening') return true;
      const p = st.attributes && st.attributes.current_position;
      return !coverFerme(st, p != null ? Math.round(p) : (st.state === 'open' ? 100 : 0));
    });
    return { open, onToggle: () => { commanderService(dashHass, ex.covers, 'cover', open ? 'close_cover' : 'open_cover', { entity_id: ex.covers }); } };
  };
  // ── Héros contextuel : « ce qui compte maintenant » ──────────────────────
  // TOUS les candidats, par intérêt : les lecteurs qui jouent (les plus
  // récents d'abord), puis les thermostats actifs (ceux qui chauffent ou
  // refroidissent avant les autres). Aucun → la section n'existe pas du tout.
  // Plusieurs → glissière à la page, points sous la carte (HeroSlider).
  const dc = useDomainCards(dashHass);
  const roomClimInfo = (name) => {
    const ex = roomExtras && roomExtras[rmNorm(name)];
    if (!ex || !ex.clim) return null;
    const st = dashHass.states[ex.clim];
    if (!st || st.state === 'unavailable') return null;
    const on = st.state !== 'off';
    const froid = st.state === 'cool' || ((st.attributes || {}).hvac_action === 'cooling');
    return { on, froid, onToggle: () => {
      // Rallumer : le premier mode que l'entité connaît, le chauffage d'abord.
      const modes = modesClimat(st.attributes, []);
      const cible = on ? 'off' : (['heat', 'auto', 'heat_cool', 'cool'].find(mo => modes.indexOf(mo) >= 0) || 'heat');
      commanderService(dashHass, ex.clim, 'climate', 'set_hvac_mode', { entity_id: ex.clim, hvac_mode: cible });
    } };
  };
  return { veilleuses, roomLightsOf, roomMainsOf, toggleRoomLights, roomCoversInfo, dc, roomClimInfo };
}

/* « En ce moment » : les appareils actifs de la maison.
 * Sorti de `Dashboard` tel quel (lot 5 de l’audit du 28/10, étape d ; ADR 0283) : ses entrées et ses sorties sont nommées. */
function useMomentAccueil({ a, cyclesPrises, dashHass, dc, mLv, onNav, ordinaire }) {
  /* EN CE MOMENT (maquette du 15/09, reduit a l'ESSENTIEL le 16/09 — ADR
   * 0035 : « je m'en fiche des prises ») : un lecteur en lecture, un
   * aspirateur ou une tondeuse au travail, le lave-vaisselle en cours, le
   * planning de chauffe quand il sort de l'ordinaire, les zones qui
   * chauffent, un volet EN MOUVEMENT. Ni prise, ni ventilateur, ni volet a
   * mi-course. Calcule ici, avant le rendu : la banniere en porte le compte.
   * Huit lignes au plus, le reste est dans Objets. */
  const S0 = (dashHass && dashHass.states) || {};
  /* `cyclesPrises` : les cycles d'électroménager que le serveur suit (P3 ; audit du 19/10, point 2), lus par App — la
   * définition de la carte et de la fiche, plus les seuils de l'Accueil (« > 100 W »), qui disaient « en cours » un séchage
   * que le serveur tenait pour fini, ou l'inverse. Tant que le module des prises ne répond pas, ou qu'il ne suit aucune
   * prise d'électroménager (`null`), l'ancien chemin reste : le capteur de Paramètres › Notifications. */
  const aEnt = (id) => !!(dashHass && dashHass.states && dashHass.states[id]);
  const commande = (id, dom, svc, data) => commanderService(dashHass, id, dom, svc, { entity_id: id, ...(data || {}) });
  /* Le planning de chauffe (plan 2 du chantier Chauffage, tâche 12 ; choix
   * 15) : l'état du moteur, relu toutes les 60 s tant que l'Accueil est
   * monté ; ses lignes (`lignesMoment`) ne disent que l'inhabituel. Un
   * chauffage ouvre SA fiche, par sa clé — un chauffage introuvable n'a pas
   * d'entité ; la maison mène à Objets › Chauffage, le filtre posé. */
  const { etat: etatCh } = useEtatChauffage();
  const [ficheCh, setFicheCh] = useState(null);
  /* Les robots au travail (chantier IoT, I34) : leur ligne écrit la phrase de leur carte, avec les pièces que le carnet du serveur
   * sait (robotsetat.js) — l'état ne se lit que tant qu'un robot travaille. */
  const robotAuTravail = Object.keys(S0).some(id => (id.indexOf('vacuum.') === 0 || id.indexOf('lawn_mower.') === 0)
    && APPAREIL_ACTIF[id.slice(0, id.indexOf('.'))](S0[id] && S0[id].state));
  const { etat: etatRobots } = useEtatRobots(robotAuTravail);
  /* Les volets qui bougent À L'ÉCRAN (19/10) : chez lui, Home Assistant ne dit jamais `opening` / `closing` — la ligne ne voyait
   * pas le volet que sa carte disait « En fermeture ». Le sens de leur course jouée (voletcourse.js), relu à chaque changement. */
  const coversMoment = voletCovers(S0);
  const sensJoue = useSensCourses(coversMoment.map(c => c.haid), S0);
  const momentRows = [];
  try {
    /* Un lecteur en lecture (chantier Médias, M16) : lu avec son jumeau (M14), sa ligne est la phrase de sa carte (M6), et
     * « Mettre en pause » envoie `media_pause` à l'entité qui commande — jamais `media_play_pause` (M13). */
    medPlayers().forEach(m => {
      const id = m.haid; if (!S0[id] && !(m.ma && S0[m.ma])) return;
      const l = lireLecteur(S0, m); if (l.indispo || !l.playing) return;
      momentRows.push(<LigneMoment key={id} icone="music-alt" rgb="var(--o-rose-rgb)" nom={nomLecteur(S0, m)} sous={phraseLecteur(l).texte}
        onOpen={() => dc.ouvrir(id)} fiche action={tr('Mettre en pause')} actionIcone="pause" onAction={() => commande(l.ctl, 'media_player', 'media_pause')} />);
    });
    const meta = (a && a.index && a.index.entityMeta) || null;
    Object.keys(S0).forEach(id => {
      const e = S0[id]; if (!e) return;
      const dom = id.slice(0, id.indexOf('.'));
      // Les MACHINES seulement : une prise ou un ventilateur en marche n'est pas un evenement.
      if (dom !== 'vacuum' && dom !== 'lawn_mower') return;
      const test = APPAREIL_ACTIF[dom]; if (!test || !test(e.state)) return;
      const mt = meta ? meta.get(id) : null; if (mt && (mt.category || mt.hidden)) return;
      const nom = (e.attributes || {}).friendly_name || id;
      // La phrase de sa carte (I34) : « Nettoie · Salon, Cuisine », « Tonte en cours », « Retour à la base ».
      const c = vueCarnetRobot(etatRobots, id, Date.now());
      const sous = phraseRobot({ domaine: dom, phase: phaseRobot(dom, e.state), erreur: c.erreur, pieces: c.pieces, tout: c.tout, libelle: c.libelle }).texte;
      const geste = dom === 'vacuum' ? [tr('Renvoyer au dock'), 'home', () => commande(id, 'vacuum', 'return_to_base')]
        : [tr('Renvoyer au dock'), 'home', () => commande(id, 'lawn_mower', 'dock')];
      momentRows.push(<LigneMoment key={id} icone={dom === 'vacuum' ? 'vacuum' : 'mower'} rgb="var(--o-accent-rgb)" nom={nom} sous={sous} onOpen={() => dc.ouvrir(id)} fiche action={geste[0]} actionIcone={geste[1]} onAction={geste[2]} />);
    });
    if (cyclesPrises) cyclesPrises.forEach(c => {
      const tp = TYPES_PRISE[c.type] || TYPES_PRISE.prise;
      const min = (Date.now() - Date.parse(c.debut)) / 60000;
      momentRows.push(<LigneMoment key={'cycle:' + c.id} icone={tp.ico} rgb={tp.rgb} nom={nomDuCycle(c, cyclesPrises, S0)}
        sous={[tr('Cycle en cours'), isFinite(min) ? dureePrise(min) : null].filter(Boolean).join(' · ')} onOpen={() => dc.ouvrir(c.id)} fiche />);
    });
    else if (mLv && mLv.active && (!a || aEnt(notifIds().dishwasher))) momentRows.push(<LigneMoment key="lv" icone="dishwasher" rgb="var(--o-accent-rgb)" nom={mLv.label} sous={[mLv.phase, mLv.valueText].filter(Boolean).join(' · ')} onOpen={onNav ? () => onNav('objets') : null} />);
    lignesMoment(etatCh, uniteTemp(null, dashHass), { admin: !ordinaire }).forEach(l => momentRows.push(<LigneMoment key={l.cle} icone={l.icone} rgb={l.rgb} nom={l.nom} sous={l.sous}
      onOpen={l.chauffage ? () => setFicheCh(l.chauffage) : onNav ? () => onNav('climat') : null} fiche={!!l.chauffage} />));
    // Les zones qui chauffent VRAIMENT, sans celles que le planning de chauffe commande (`zonesQuiChauffent`).
    const chauffe = zonesQuiChauffent(S0, etatCh);
    if (chauffe.length) momentRows.push(<LigneMoment key="clim" icone="flame" rgb="var(--o-warn2-rgb)" nom={trN(chauffe.length, '{n} zone chauffe', '{n} zones chauffent')} sous={chauffe.map(z => z.name).join(' · ')} onOpen={onNav ? () => onNav('climat') : null} />);
    coversMoment.forEach(c => {
      const e = S0[c.haid]; if (!e || enPanne(c.haid, e)) return;
      // Un volet EN MOUVEMENT seulement — que Home Assistant le dise ou que sa course se joue : à mi-course, il ne se passe rien.
      const sens = e.state === 'opening' ? 'ouverture' : e.state === 'closing' ? 'fermeture' : sensJoue[c.haid] || null;
      if (!sens) return;
      // Stop s'il le sait (`gestesCover`) : l'ordre, et la course figée là où elle est — qu'un refus oublie (19/10).
      const stop = gestesCover(e).stop;
      momentRows.push(<LigneMoment key={c.haid} icone="blinds" rgb="var(--o-purple-rgb)" nom={c.name || (e.attributes || {}).friendly_name || c.haid}
        sous={sens === 'ouverture' ? tr('Ouverture…') : tr('Fermeture…')} fiche onOpen={() => dc.ouvrir(c.haid)}
        {...(stop ? { action: tr('Stop'), actionIcone: 'stop', onAction: () => ordreEtArret(c.haid, e, envoyerGeste(dashHass, c.haid, stop)) } : null)} />);
    });
  } catch {}
  const nEnCours = momentRows.length;
  return { ficheCh, setFicheCh, momentRows, nEnCours };
}

/* La bannière de l’Accueil : le bonjour, la ligne sous le prénom, les tuiles cliquables, le choix du ciel en édition.
 * Sorti de `Dashboard` tel quel (lot 5 de l’audit du 28/10, étape d ; ADR 0283) : ses entrées et ses sorties sont nommées. */
function BanniereAccueil({ a, actifsStat, alarmeTuile, attentionLigne, avatars, couleurAcc, editMode, faits, metricDiv, modes, nEnCours, onNav, onOpenRoom, ouvStat, pieceCo2Max, points, salut, setOverride, userName, voirMoment, wx, wxFx }) {
  return (
        <div className="o-banniere" style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--o-radius,18px)', padding: '0 8px 14px' }}>
          {/* Le décor SVG remplaçait le ciel quand le mouvement est réduit. Le ciel
            * du 17/10 s'en charge lui-même (une image fixe) : le décor ne reste
            * que là où le ciel n'est pas monté — effets météo coupés. */}
          {REDUCE_MOTION && !wxFx && <WeatherFx weather={wx} />}
          {editMode && (
          <div style={{ position: 'absolute', bottom: 14, right: 18, display: 'flex', gap: 4, zIndex: 3 }}>
            {modes.map(([id, emoji, title]) => (
              <button key={id} onClick={() => setOverride(id)} title={title} style={{ width: 26, height: 26, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1, background: wx === id ? 'var(--o-bd1)' : 'transparent', filter: wx === id ? 'none' : 'grayscale(.6) opacity(.6)', transition: 'all .2s' }}>{emoji}</button>
            ))}
          </div>
          )}
          <div className="o-banner-row" style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
              {/* Le titre de la page, pour qui ne la voit pas : toutes les
                * vues en ont un, l'Accueil n'en avait pas — son en-tête dit
                * bonjour, pas où l'on est. Hors flux (`.o-vh`), rien ne bouge. */}
              <h1 className="o-vh">{tr('Accueil')}</h1>
              <span className="o-greet-hi" style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)' }}>{salut}</span>
              {/* Les avatars SUR la ligne du nom, a droite, sur tous les
                * ecrans (retour user du 15/09 : « ils sont en dessous du
                * texte au lieu d'etre alignes avec le nom »). La vignette
                * meteo a disparu avec la vue Meteo : le fond de la banniere
                * dit deja le temps, la piece Exterieur le detaille. */}
              <div className="o-greet-ligne" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span className="o-greet-name" style={{ fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 28, fontWeight: 500, lineHeight: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nomProfil(userName)}</span>
                {/* Leur hauteur, réservée tant que la découverte n'a pas répondu (lot 14
                  * de l'audit du 03/10) : les personnes en viennent, et la ligne
                  * grandissait de 6 px à leur arrivée, poussant toute la page.
                  * `a.index` reste nul jusque-là. */}
                <div className="o-avatars" style={{ display: 'flex', gap: 8, flexShrink: 0, minHeight: a && !a.index ? 34 : undefined }}>
                  {avatars.map((u, i) => {
                    const present = !u.dim;
                    return (
                      <span key={i + (present ? '-p' : '-a')} className="o-avatarin" title={u.title} style={{ position: 'relative', width: 34, height: 34, flexShrink: 0, display: 'inline-block' }}>
                        <span style={{ display: 'block', width: '100%', height: '100%', borderRadius: '50%', background: u.img ? `url(${u.img}) center/cover` : u.grad, boxShadow: present ? '0 0 0 2.5px var(--o-ok), 0 0 9px rgba(var(--o-ok-rgb),.5)' : '0 0 0 2px var(--o-bd1)', opacity: present ? 1 : 0.45 }} />
                        <span style={{ position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: '50%', background: present ? 'var(--o-ok)' : 'var(--o-text3)', border: '2.5px solid var(--o-bg2)', boxShadow: present ? '0 0 6px rgba(var(--o-ok-rgb),.7)' : 'none' }} />
                      </span>
                    );
                  })}
                </div>
              </div>
              {/* Ticket #34, sa réponse « B » (18/10) : sous le prénom, les points
                * à surveiller ne paraissent que s'il y en a ET que la section
                * « À surveiller » n'est pas masquée. Jamais de « Tout va bien » :
                * il avait déjà refusé un « Tout va bien » permanent sur l'Accueil,
                * et masquer la carte ne masquait qu'elle. */}
              {/* Le resume est un ITEM a lui seul, pas un noeud texte nu.
                * Nu, il devenait un item flex anonyme : trop long, il basculait
                * en entier sous la pastille au lieu de s'enrouler a cote
                * d'elle — un flex ne coupe pas un item, il le renvoie a la
                * ligne. La pastille s'aligne donc sur la PREMIERE ligne, et le
                * texte garde sa colonne. */}
              <span className="o-greet-facts" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', marginTop: 4 }}>{attentionLigne && <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 5, background: couleurAcc, boxShadow: '0 0 8px ' + couleurAcc, animation: animationNiveau(niveauMax(points)) }} />}<span style={{ flex: 1, minWidth: 0 }}>{[...(attentionLigne ? [resumeAttention(points)] : []), ...faits.txt].join(' · ')}{a && a.inTemp != null ? ` · ${dec(a.inTemp, 1)} °${a.inTempUnite}` : ''}</span></span>
          </div>
          {(() => {
            /* Une metrique a zero ne dit rien : « 0 / 4 ouvrants ouverts »
              * occupe une place et ne demande aucune action. La banniere ne
              * montre donc que ce qui se passe, et les separateurs se posent
              * ENTRE ce qui reste — pas a des places reservees d'avance.
              *
              * Pendant le chargement, l'export et l'air gardent leur squelette :
              * sans eux la banniere naitrait vide, puis sauterait. */
            /* Des BOUTONS, pas des cases : chaque chiffre mene la ou l'on agit
              * (ADR 0030). Meme dessin qu'avant, le survol en plus. */
            const clics = {
              al: () => onNav && onNav('securite'),
              ex: () => onNav && onNav('energie'),
              air: () => { if (pieceCo2Max && onOpenRoom) onOpenRoom(pieceCo2Max); else if (onNav) onNav('objets'); },
              ouv: () => onNav && onNav('securite'),
              lum: () => onNav && onNav('lumieres'),
              med: () => onNav && onNav('medias'),
              app: voirMoment,
            };
            const libelles = { al: tr('Voir la sécurité'), ex: tr('Voir l’énergie'), air: tr('Voir la pièce la plus chargée'), ouv: tr('Voir la sécurité'), lum: tr('Voir les lumières'), med: tr('Voir les médias'), app: tr('Voir ce qui tourne') };
            /* Le NOM d'une tuile (lot 13 de l'audit du 03/10) : ce qu'elle
              * AFFICHE, valeur puis libellé, et la destination au bout —
              * « Désarmée, ALARME, Voir la sécurité ». La destination seule
              * taisait l'état (« Voir l’énergie » pour « ↑ 460 W EXPORT
              * RÉSEAU »), et qui pilote à la voix nomme ce qu'il VOIT (WCAG
              * 2.5.3). Les morceaux reprennent les expressions du dessin
              * ci-dessous, `Num` compris (`String(Math.round(v))`, ou son
              * `fmt`) ; un squelette n'a pas de texte, il ne dit rien. */
            const vus = {
              al: alarmeTuile ? [alarmeTuile.texte, tr('ALARME')] : [],
              ex: [a && a.metricConso ? fmtWatts(a.metricConso.raw) : null, tr('Conso maison')],
              air: [a && a.maxCo2 != null ? String(Math.round(a.maxCo2)) + ' ppm' : null, tr('QUALITÉ AIR') + (a && a.maxCo2 != null ? ' · ' + motCo2(a.maxCo2) : '')],
              ouv: [ouvStat.ouverts + ' / ' + ouvStat.total, trN(ouvStat.ouverts, 'OUVRANT OUVERT', 'OUVRANTS OUVERTS')],
              lum: a ? [a.lightsOn + ' / ' + a.lightsTotal + ' ' + tr('prés.'), trN(a.lightsOn, 'LUMIÈRE ALLUMÉE', 'LUMIÈRES ALLUMÉES')] : [],
              med: [actifsStat.medias + ' / ' + actifsStat.mediasTotal, trN(actifsStat.medias, 'MÉDIA EN LECTURE', 'MÉDIAS EN LECTURE')],
              app: [String(nEnCours), tr('EN CE MOMENT')],
            };
            /* Lu, un libellé tout en capitales (« QUALITÉ AIR », la clé même
              * du dessin) passe en casse de phrase : une synthèse vocale épelle
              * volontiers un mot court en capitales (« B-O-N »). La valeur
              * (« ↑ 460 W », « 2 / 6 prés. ») ne bouge pas. */
            const enPhrase = (s) => (typeof s === 'string' && s === s.toUpperCase() && /\p{Lu}{2}/u.test(s) ? s.charAt(0) + s.slice(1).toLowerCase() : s);
            Object.keys(libelles).forEach(k => { libelles[k] = nomCarte(...vus[k].map(enPhrase), libelles[k]); });
            const tuile = (extra) => ({ flexShrink: 0, background: 'none', border: 'none', color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer', borderRadius: 10, padding: '4px 14px 4px 0', whiteSpace: 'nowrap', ...extra });
            const cases = [];
            /* L'ALARME d'abord (retour user du 16/09, ADR 0035) : son etat et
              * son mode, d'un tap vers la vue Securite. */
            if (alarmeTuile) cases.push(
              <button type="button" key="al" className="o-tuile-hero o-tuile-alarme" onClick={clics.al} aria-label={libelles.al} style={tuile({ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px 6px 10px', '--al-rgb': alarmeTuile.rgb })}>
                <Fi i={alarmeTuile.icone} color={alarmeTuile.couleur} size={17} />
                <div><div style={{ fontSize: 15, fontWeight: 800, color: alarmeTuile.couleur, lineHeight: 1.1 }}>{alarmeTuile.texte}</div><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.03em', color: 'var(--o-text2)' }}>{tr('ALARME')}</div></div>
              </button>);
            if (!a || a.metricConso) cases.push(
              <button type="button" key="ex" className="o-tuile-hero" onClick={clics.ex} aria-label={libelles.ex} style={tuile({ display: 'flex', alignItems: 'center', gap: 8 })}>
                <Ico name="bolt" color="var(--o-accent)" size={17} />
                <div><div style={{ fontSize: 15, fontWeight: 800, color: a && a.metricConso ? a.metricConso.color : 'var(--o-accent-soft)', lineHeight: 1.1 }}>{a && a.metricConso ? <Num v={a.metricConso.raw} fmt={fmtWatts} /> : <Skel w={64} h={16} />}</div><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.03em', color: 'var(--o-text2)', textTransform: 'uppercase' }}>{tr('Conso maison')}</div></div>
              </button>);
            if (!a || a.maxCo2 != null) cases.push(
              <button type="button" key="air" className="o-tuile-hero" onClick={clics.air} aria-label={libelles.air} style={tuile({ display: 'flex', alignItems: 'center', gap: 8 })}>
                <Ico name="wind" color="var(--o-accent)" size={17} />
                <div><div style={{ fontSize: 15, fontWeight: 800, color: a && zoneCo2(a.maxCo2) && !zoneCo2(a.maxCo2).bon ? zoneCo2(a.maxCo2).c : 'var(--o-accent-soft)', lineHeight: 1.1 }}>{a ? (a.maxCo2 != null ? <Num v={a.maxCo2} /> : '—') : <Skel w={40} h={16} />}<span style={{ fontSize: 11, color: 'var(--o-text2)' }}> ppm</span></div><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.03em', color: 'var(--o-text2)' }}>{tr('QUALITÉ AIR')}{a && a.maxCo2 != null ? ' · ' + motCo2(a.maxCo2) : ''}</div></div>
              </button>);
            /* Les OUVRANTS ont pris la place de la température (retour
              * 01/09) : la chaleur de la maison se lit sur chaque tuile pièce,
              * une fenêtre restée ouverte ne se lit nulle part. */
            if (ouvStat.ouverts > 0) cases.push(
              <button type="button" key="ouv" className="o-tuile-hero" onClick={clics.ouv} aria-label={libelles.ouv} style={tuile({ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 })}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--o-purple)' }}><Num v={ouvStat.ouverts} /> <span style={{ fontSize: 11, color: 'var(--o-text2)', fontWeight: 600 }}>/ {ouvStat.total}</span></div><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.03em', color: 'var(--o-text2)' }}>{trN(ouvStat.ouverts, 'OUVRANT OUVERT', 'OUVRANTS OUVERTS')}</div>
              </button>);
            if (a && a.lightsOn > 0) cases.push(
              <button type="button" key="lum" className="o-tuile-hero" onClick={clics.lum} aria-label={libelles.lum} style={tuile({ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 })}>
                <div style={{ fontSize: 15, fontWeight: 800 }}><Num v={a.lightsOn} /> <span style={{ fontSize: 11, color: 'var(--o-text2)', fontWeight: 600 }}>/ {a.lightsTotal} {tr('prés.')}</span></div><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.03em', color: 'var(--o-text2)' }}>{trN(a.lightsOn, 'LUMIÈRE ALLUMÉE', 'LUMIÈRES ALLUMÉES')}</div>
              </button>);
            if (actifsStat.medias > 0) cases.push(
              <button type="button" key="med" className="o-tuile-hero" onClick={clics.med} aria-label={libelles.med} style={tuile({ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 })}>
                <div style={{ fontSize: 15, fontWeight: 800 }}><Num v={actifsStat.medias} /> <span style={{ fontSize: 11, color: 'var(--o-text2)', fontWeight: 600 }}>/ {actifsStat.mediasTotal}</span></div><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.03em', color: 'var(--o-text2)' }}>{trN(actifsStat.medias, 'MÉDIA EN LECTURE', 'MÉDIAS EN LECTURE')}</div>
              </button>);
            /* Ce qui tourne VRAIMENT (ADR 0035) : le meme compte que le panneau
              * « En ce moment » — plus les prises. */
            if (nEnCours > 0) cases.push(
              <button type="button" key="app" className="o-tuile-hero" onClick={clics.app} aria-label={libelles.app} style={tuile({ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 })}>
                <div style={{ fontSize: 15, fontWeight: 800 }}><Num v={nEnCours} /></div><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.03em', color: 'var(--o-text2)' }}>{tr('EN CE MOMENT')}</div>
              </button>);
            if (!cases.length) return null;
            return (
              <div className="o-banner-metrics" style={{ position: 'relative', display: 'flex', gap: 10, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
                {cases.map((c, i) => (i ? [<div key={'d' + i} style={metricDiv} />, c] : c))}
              </div>
            );
          })()}
        </div>
  );
}

/* Les sections personnalisables de l’Accueil : scènes rapides, pièces, caméras, et le rail. Ce bloc était une fonction appelée sur place dans le rendu ; il en garde le corps.
 * Sorti de `Dashboard` tel quel (lot 5 de l’audit du 28/10, étape d ; ADR 0283) : ses entrées et ses sorties sont nommées. */
function SectionsAccueil({ Sec, a, agenda, ambianceDe, bandeauCollecte, camDispo, cams, clavierPiece, dashHass, dc, debutPiece, editMode, etageChoisi, etatsAcc, etroitPieces, finPiece, formatGrille, grille, jourChoisi, momentRows, mouvPiece, nEnCours, onNav, onOpenRoom, ordinaire, ordreDe, ordrePieces, pageDemandee, pieceDrag, pieces, piecesCols, planActif, points, poserCam, poserGrillePieces, poserRail, relireTodos, retirerPiece, roomClimInfo, roomCoversInfo, roomLightsOf, roomMainsOf, saveGrille, setAgendaOuvert, setEtageChoisi, setJourChoisi, setPageDemandee, setPieceSheet, setVuePieces, taches, taillesDe, toggleRoomLights, veillesEtat, veilleuses, vuePieces, wide, wideXL }) {
          const inner = pieces;
          /* LES ETAGES (05/10). Home Assistant tient un registre d'etages et
            * Loggia le lisait deja sans jamais s'en servir. Il FILTRE les pieces
            * plutot que de les regrouper : leur grille porte un placement libre,
            * des tailles par carte et un glisser-deposer, ranges par format
            * d'ecran — la decouper en sections aurait defait tout cela.
            *
            * Rien ne s'affiche sans DEUX etages habites : dans une maison de
            * plain-pied, ou quand toutes les pieces sont au meme niveau, le
            * filtre ne retirerait rien. */
          const infosEtages = etagesDesPieces(LOGGIA_INDEX, inner.map(p => p.name));
          const piecesVues = infosEtages.utile
            ? inner.filter(p => piecesDeLEtage(LOGGIA_INDEX, [p.name], etageChoisi).length)
            : inner;
          /* Les puces d'etage tiennent dans l'en-tete sur grand ecran. Au
            * TELEPHONE (25/10, « je te demande qu'ils soient alignes avec
            * Pieces ») : UNE ligne — chaque etage par son nom court (−1, 0, 1),
            * le nom entier en title, le compte s'efface, « Cartes / Plan » en
            * icones seules. */
          const etagesPuces = infosEtages.utile ? (
            /* 44 de haut au doigt (lot 7 de l'audit du 28/10, V5) : le BOUTON est la zone, 44 px dont la marge négative rend
             * 14 à la rangée ; la pastille dessinée, 30 px, est son contenu, à l'identique. Le puits ne rogne plus rien
             * (`overflow` visible) : il rognait la zone à 36. La largeur reste celle du dessin, « −1, 0, 1 » sur une ligne. */
            <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 12, background: 'var(--o-well)', flexShrink: etroitPieces ? 1 : 0, minWidth: 0 }}>
              {[{ id: null, nom: tr('Tous'), court: tr('Tous') }, ...infosEtages.etages].map(e => {
                const on = etageChoisi === e.id;
                return (
                  <button key={e.id || 'tous'} type="button" onClick={() => setEtageChoisi(e.id)} aria-pressed={on} aria-label={e.nom} title={e.nom}
                    style={{ height: 44, margin: '-7px 0', padding: 0, border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 700,
                      display: 'flex', alignItems: 'center', minWidth: 0, flex: etroitPieces ? '0 1 auto' : '0 0 auto' }}>
                    <span style={{ display: 'block', height: 30, lineHeight: '30px', padding: etroitPieces ? '0 9px' : '0 12px', borderRadius: 10, whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                      background: on ? 'var(--o-accent-fond)' : 'transparent', color: on ? '#fff' : 'var(--o-text1)' }}>{etroitPieces ? e.court : e.nom}</span>
                  </button>
                );
              })}
            </div>
          ) : null;
          /* « Cartes / Plan » (20/10) : l'icone du plan est un plan au sol, pas
           * une maison de plus. Au telephone, quand il y a des etages, le
           * segment passe en icones seules sur la ligne du titre. */
          const serre = etroitPieces && !!etagesPuces;
          const segmentPlan = (compact) => (
            <Segment value={vuePieces} onChange={setVuePieces} label={tr('Affichage des pièces')} compact={compact}
              options={[{ id: 'cartes', label: tr('Cartes'), ico: 'apps' }, { id: 'plan', label: tr('Plan'), ico: 'floor-plan' }]} />
          );
          const piecesHeader = (
            /* Plus d'air sous CET en-tete que sous les autres (30/09) : le
               segment le rend plus haut, et la premiere carte venait presque
               le toucher — « la c'est presque colle ». */
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <h2 style={sectionTitle}>{tr('Pièces')}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: serre ? 6 : 10, minWidth: 0 }}>
                  {!serre && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>{tr('{n} pièces', { n: piecesVues.length })}</span>}
                  {etagesPuces}
                  {planActif && segmentPlan(serre)}
                </div>
              </div>
            </div>
          );
          /* OÙ chaque carte se pose (23/09) : une cellule, colonne et rangée,
           * calculée par `placement.js` d'après ce que l'utilisateur a posé.
           * Un trou voulu reste vide — c'est tout l'objet du changement. */
          const piecesNoms = ordrePieces(piecesVues.map(p => p.name));
          const piecesTailles = taillesDe(piecesVues.map(p => p.name));
          /* Un filtre d'etage REALIGNE les cartes. Les positions enregistrees
           * valent pour la maison ENTIERE : appliquees a un sous-ensemble,
           * elles laissaient les trous des pieces masquees — « les cartes
           * doivent se realigner automatiquement ». Sans filtre, l'agencement
           * reprend tous ses droits, trous voulus compris. */
          const piecesOu = disposer(piecesNoms, piecesTailles, etageChoisi ? {} : grille.places, piecesCols);
          /* La première case libre APRÈS tout le monde : la tuile « Ajouter
           * une pièce » s'y met, et jamais dans un trou qu'on a voulu vide. */
          const piecesPrises = new Set();
          piecesNoms.forEach(nom => {
            for (let k = 0; k < hauteurCarte(piecesTailles[nom]); k += 1) piecesPrises.add(piecesOu[nom].c + ':' + (piecesOu[nom].r + k));
          });
          // « Après tout le monde » se compte depuis la rangée de la carte la
          // plus basse : la tuile s'y range à côté, ou dessous — jamais dans le
          // trou laissé plus haut (vérifié en démonstration le 23/09).
          const piecesBas = piecesNoms.reduce((m, nom) => Math.max(m, piecesOu[nom].r), 1);
          const piecesApres = premiereLibre(piecesPrises, piecesCols, 1, 400, piecesBas);
          const piecesGrid = (
            // Deux densités comme partout : compacte = une rangée de 88 px
            // (défaut), standard = deux rangées. Choix par pièce en édition
            // (coin bas-droit), persisté avec l'agencement de l'accueil.
            /* La mosaique de la tablette compte les colonnes : sans les fixer
              * a trois, `auto-fill` en donnerait quatre ou cinq et les grandes
              * tuiles tomberaient n'importe ou. */
            <div ref={poserGrillePieces} data-cartes="1" className="grid-chips" style={{ display: 'grid', gridTemplateColumns: 'repeat(' + piecesCols + ',minmax(0,1fr))', gap: 8 }}>
              {ordrePieces(piecesVues.map(p => p.name)).map(n => piecesVues.find(p => p.name === n)).filter(Boolean).map((p, i) => {
                /* Un choix explicite (bouton de taille en edition) prime sur
                  * tout : il vaut pour l'appareil qui l'a fait comme pour les
                  * autres. Sans choix, l'appareil decide. */
                const t = piecesTailles[p.name];
                const saisie = pieceDrag && pieceDrag.id === p.name;
                const cell = piecesOu[p.name] || { c: 1, r: 1 };
                return (
                  /* Même geste que les sections : en édition la tuile se saisit
                   * au pointeur ; le focus, le nom et les flèches sont à sa
                   * surface. */
                  <div key={p.name} data-piece={p.name} className={[t === 'c' ? 'o-chiprow1' : '', editMode ? 'o-pointille' : '', saisie ? 'o-saisie' : ''].filter(Boolean).join(' ') || undefined}
                    onPointerDown={editMode ? (e) => debutPiece(e, p.name, inner.map(x => x.name)) : undefined}
                    onPointerMove={editMode ? mouvPiece : undefined}
                    onPointerUp={editMode ? finPiece : undefined}
                    onPointerCancel={editMode ? finPiece : undefined}
                    /* Mosaique tablette : la COLONNE est imposee, la rangee
                      * non.
                      *
                      * `.grid-chips` coule sur des rangees de 88 px — une
                      * standard en occupe deux, une puce une seule. Sans
                      * colonne imposee, les tuiles se bousculent et la
                      * mosaique part en escalier. Avec la rangee imposee EN
                      * PLUS, chaque colonne s'aligne sur la plus haute et
                      * laisse un trou sous les puces.
                      *
                      * La colonne seule donne les deux : l'ordre voulu, et
                      * chaque tuile qui monte aussi haut que sa colonne le
                      * permet — la grande du milieu vient donc combler le vide
                      * laisse par la puce au-dessus d'elle. */
                    style={{ position: 'relative', minWidth: 0, opacity: saisie ? .35 : 1, transition: 'opacity .15s',
                      gridColumn: cell.c, gridRow: cell.r + ' / span ' + hauteurCarte(t),
                      /* Le pointillé, et le trait plein de la tuile saisie,
                        * passent par les classes `o-pointille` et `o-saisie`
                        * (index.css) : en ligne, ils battaient `:focus-visible`
                        * et la tuile au focus ne se voyait plus au clavier
                        * (audit du 03/10). */
                      ...(editMode ? { '--o-pointille-ecart': '2px', borderRadius: 14, cursor: 'grab', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } : {}) }}>
                    {/* La SURFACE de la tuile en édition (lot 13 de l'audit du
                      * 03/10) : le focus, le nom et les flèches, que portait
                      * l'enveloppe en `role="button"` — un rôle qui taisait la
                      * taille, Modifier et Supprimer de sa carte. */}
                    {editMode && <Surface popup={false} label={nomCarte(p.name, tr('Déplacer avec les flèches'))}
                      onKeyDown={(e) => clavierPiece(e, p.name, inner.map(x => x.name))} style={{ cursor: 'inherit' }} />}
                    {/* En édition, la carte d'édition — le même dessin que
                      * partout (retour user du 15/09) : taille en coin,
                      * Modifier, Supprimer. Sinon la tuile vivante. */}
                    {editMode ? (
                      <CartePieceEdition p={p} compacte={t === 'c'} onModifier={() => setPieceSheet({ nom: p.name, compacte: t === 'c' })} onSupprimer={() => retirerPiece(p.name)}
                        onTaille={() => saveGrille({ tailles: { ...(grille.tailles || {}), [p.name]: t === 'c' ? 's' : 'c' } })} reglable={!ordinaire} />
                    ) : (
                      <div style={{ height: '100%' }}>
                        <PieceCard p={p} idx={i} compact chip={t === 'c'} lights={roomLightsOf(p.name)} mains={roomMainsOf(p.name)} attente={veilleuses == null} onToggleLights={() => toggleRoomLights(p.name)} covers={roomCoversInfo(p.name)} clim={roomClimInfo(p.name)} ambiance={ambianceDe(p.name)} onOpen={() => onOpenRoom && onOpenRoom(p.name)} />
                      </div>
                    )}
                  </div>
                );
              })}
              {/* La case visée pendant qu'on déplace : elle se montre, rien
                * d'autre ne bouge. Au lâcher, la carte s'y pose. */}
              {editMode && pieceDrag && pieceDrag.c > 0 && (
                <div aria-hidden="true" style={{ gridColumn: pieceDrag.c, gridRow: pieceDrag.r + ' / span ' + hauteurCarte(piecesTailles[pieceDrag.id]),
                  borderRadius: 14, border: '2px dashed var(--o-accent)', background: 'rgba(var(--o-accent-rgb),.12)', pointerEvents: 'none' }} />
              )}
              {editMode && !ordinaire && (
                <div style={{ gridColumn: piecesApres.c, gridRow: piecesApres.r + ' / span 1', minWidth: 0 }}>
                  <CarteAjout onClick={() => setPieceSheet({ nom: '', compacte: false })} label={tr('Ajouter une pièce')} />
                </div>
              )}
            </div>
          );
          const camsGrid = (
            <div className={'grid-cams' + (camSerre(colonnesCam(camDispo, formatGrille), formatGrille) ? ' o-cams-serre' : '')} style={{ display: 'grid', gridTemplateColumns: `repeat(${colonnesCam(camDispo, formatGrille)},minmax(0,1fr))`, gap: 16 }}>
              {cams.map(c => <CameraTile key={c.cle} c={c} />)}
            </div>
          );
          // ── Rail en lignes denses : meme vocabulaire que les cartes de synthese des
          // autres vues (libelle + contexte a gauche, valeur alignee a droite, filet entre
          // les lignes). Une entite absente = pas de ligne, jamais une ligne vide.
          /* `vue` (nouvel accueil) : la ligne devient un RÉSUMÉ cliquable — tap
           * → la vue du domaine, chevron pour le dire. Sans vue, ligne inerte. */
          const railRow = (k, label, desc, val, col, vue = null) => {
            const clic = vue && onNav ? () => onNav(vue) : null;
            return (
              /* Role, tabulation, clic et touche tiennent tous a `clic` :
               * ensemble ou pas du tout. La regle lit les attributs un par un
               * et ne suit pas le ternaire.
               *
               * Le nom aussi (lot 13 de l'audit du 03/10) : ce que la ligne
               * affiche, par `nomCarte` comme toute carte — « 3 autres, Tout
               * est dans Objets ». Elle ne porte aucune commande : elle garde
               * son rôle, et mène à une vue (pas d'`aria-haspopup`). */
              /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex */
              <div key={k} role={clic ? 'button' : undefined} tabIndex={clic ? 0 : undefined} aria-label={clic ? nomCarte(label, desc, val) : undefined}
                onClick={clic || undefined} onKeyDown={clic ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clic(); } } : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', cursor: clic ? 'pointer' : 'default' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, flexShrink: 0, color: col || 'var(--o-text)' }}>{val}</span>
                {clic && <Fi i="angle-right" size={10} color="var(--o-text3)" />}
              </div>
            );
          };
          const railPanel = (title, sub, tag, tagCol, rows) => rows.length ? (
            <div style={{ ...CARTE_RAIL, padding: '13px 15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{title}</span>
                {tag ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap', fontSize: 10, fontWeight: 800, background: `rgba(${tagCol},.14)`, color: `rgb(${tagCol})` }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: `rgb(${tagCol})` }} />{tag}</span> : null}
              </div>
              <div style={{ fontSize: 11, color: 'var(--o-text2)', fontWeight: 600, margin: '2px 0 4px' }}>{sub}</div>
              {rows}
            </div>
          ) : null;
          const OKRGB = 'var(--o-ok-rgb)';
          const momentVisibles = nEnCours > 8
            ? [...momentRows.slice(0, 8), railRow('plus', tr('{n} autres', { n: nEnCours - 8 }), tr('Tout est dans Objets'), '', 'var(--o-text3)', 'objets')]
            : momentRows;
          const railMoment = railPanel(tr('En ce moment'), tr('Lecture, machines, chauffage, volets en mouvement'),
            nEnCours ? (nEnCours > 1 ? tr('{n} EN COURS', { n: nEnCours }) : tr('1 EN COURS')) : tr('RIEN EN COURS'), nEnCours ? 'var(--o-accent-soft-rgb)' : OKRGB,
            nEnCours ? momentVisibles : [<div key="rien" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text2)', padding: '6px 0 2px' }}>{tr('Rien ne tourne pour le moment.')}</div>]);
          /* AGENDA : une carte a la place de deux (ADR 0032). La date du jour,
            * la bande des sept prochains jours — un point par evenement, un jour
            * se choisit — puis ce qui vient (cinq lignes), ou le jour choisi en
            * entier. Sans entite `calendar`, la carte n'existe pas ; sans
            * evenement, elle le dit. Le dessin de la bande est celui du mini-mois
            * du catalogue : la pastille du jour, les points sous le chiffre. */
          const calRailId = (() => {
            const S = (dashHass && dashHass.states) || null;
            if (!S) return null;
            return Object.keys(S).find(x => x.indexOf('calendar.') === 0 && S[x] && S[x].state !== 'unavailable') || null;
          })();
          const maintenantAg = new Date();
          /* Le prochain lever ou coucher, s'il y a un `sun.sun`. Rien sans
           * source : pas de soleil declare, pas de pastille. */
          const solAg = prochainSoleil(etatsAcc && etatsAcc['sun.sun'], maintenantAg);
          const leverAg = solAg
            ? (solAg.type === 'lever' ? tr('Lever') : tr('Coucher')) + ' '
              + solAg.date.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
            : null;
          /* RAPPELS (maquette du 03/10) : les listes de taches de Home
            * Assistant — `todo.*`. Les categories sont celles de CHACUN, avec
            * le nom que HA leur donne ; pas de liste chez vous, pas de carte. */
          const railRappels = taches.length || listesTodo(etatsAcc || {}).length ? (
            <CarteRappels hass={dashHass} taches={taches}
              onFait={(t) => marquerFait(dashHass, t).then(relireTodos)}
              onAjouter={(l, titre, quand) => ajouterTache(dashHass, l, titre, quand).then(ok => { relireTodos(); return ok; })} />
          ) : null;
          /* La carte unique de l'agenda (maquette du 02/10). Deux cartes
           * disaient la meme semaine sans jamais la montrer ensemble : le
           * calendrier dessinait les jours sans leurs evenements, l'agenda
           * listait les evenements sans leurs jours. Voir `agendarail.jsx`. */
          /* Le bandeau de collecte se pose AU-DESSUS de l'agenda, le jour ou
            * il faut sortir les bacs et la veille au soir. Une carte complete
            * avait d'abord ete faite, avec sa propre bande de sept jours :
            * « ca fait dupliquer le calendrier » — celle de l'agenda suffit, et
            * les collectes y figurent deja puisqu'elles viennent d'un
            * calendrier. */
          const railAgenda = calRailId ? (
            <>
              {bandeauCollecte}
              <CarteAgenda hass={dashHass} evenements={agenda || []} jourChoisi={jourChoisi}
                onChoisirJour={(k) => setJourChoisi(k === jourChoisi ? null : k)}
                onOuvrir={() => setAgendaOuvert(true)} lever={leverAg} />
            </>
          ) : null;
          const camsHeader = (
            /* Même air que sous l'en-tête des Pièces (30/09) : un menu rend la
               ligne plus haute qu'un simple titre, et la première tuile venait
               la toucher. */
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h2 style={sectionTitle}>{tr('Caméras')}</h2>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' }}>{a ? tr('{n} en ligne', { n: a.camOnline }) : tr('{n} caméras', { n: cams.length })}</span>
              {/* Le reglage d'affichage la ou l'on regarde les cameras — pas
                * enterre dans les Parametres (20/09). Une seule camera : rien
                * a disposer. */}
              {cams.length > 1 && <ChoixCamDispo valeur={camDispo} format={formatGrille} onChoisir={poserCam} />}
            </div>
          );
          // Sections nommées : l'ordre vient de `loggia_accueil`, le contenu d'ici.
          // Une section sans rien à montrer (pas de caméra, agenda vide) n'existe
          // pas du tout — ni wrapper, ni place dans l'édition.
          const secsMain = {
            // Les favoris s'éditent EUX-MÊMES (leurs cartes ont leur barre
            // d'outils) : la section reste donc vivante en mode édition.
            favoris: <FavorisAccueil hass={dashHass} edit={editMode} />,
            scenes: <ScenariosAccueil hass={dashHass} edit={editMode} onNav={onNav} />,
            /* Le plan 3D (chantier Plan 3D) : le modèle importé par un
             * administrateur, celui de l'étage choisi. Toucher une pièce ouvre
             * la pièce comme sa carte ; une lampe ou un volet, sa fiche. */
            pieces: <>{piecesHeader}{vuePieces === 'plan' ? (
              <Barriere ou="vue">
                <Suspense fallback={<div style={{ minHeight: etroitPieces ? 320 : 420 }} />}>
                  <PlanPieces hass={dashHass} pieces={piecesVues} etage={infosEtages.utile ? etageChoisi : null}
                    etages={infosEtages.utile ? infosEtages.etages : []}
                    zones={((LOGGIA_INDEX && LOGGIA_INDEX.areaList) || []).map(z => ({ id: z.id, name: z.name }))}
                    edition={editMode} admin={!ordinaire} etroit={etroitPieces}
                    onPiece={(n) => { if (onOpenRoom) onOpenRoom(n); }} onEntite={(id) => dc.ouvrir(id)} />
                </Suspense>
              </Barriere>
            ) : piecesGrid}</>,
            cameras: cams.length > 0 ? <>{camsHeader}{camsGrid}</> : null,
          };
          // « A surveiller » en tete du rail — sur le cote avec En ce moment et
          // Rappels (retour user du 16/09 ; seconde page sur telephone, la
          // banniere garde le compte) ; rien quand tout va bien, pas meme en edition.
          // La meteo (ADR 0038) : seulement si une entite `weather` repond — sans
          // elle la section n'existe pas, ni sa poignee en edition.
          const meteoRailId = (() => {
            const id = weatherEntity(dashHass);
            const st = id && dashHass && dashHass.states ? dashHass.states[id] : null;
            return st && st.state !== 'unavailable' && st.state !== 'unknown' ? id : null;
          })();
          // Le CO2 (ADR 0044) : la piece la plus chargee ; le seuil et la
          // ventilation viennent de la veille du serveur, les volets de la zone
          // du capteur. Sans capteur, pas de section — meme en option.
          /* Chaque piece apporte SON seuil s'il est regle (ADR 0044) ; le
           * classement se fait alors sur l'ecart au seuil, pas sur les ppm.
           * Sans reglage, tout le monde partage celui de la maison et le
           * resultat est celui d'avant. */
          const co2Maison = seuilCo2(veillesEtat);
          const co2Pire = pireCapteur((a && a.rooms) ? a.rooms.filter(r => r.co2Id).map(r => ({ id: r.co2Id, piece: r.name, valeur: r.co2, seuil: r.co2Seuil })) : [], co2Maison);
          const co2Action = co2Pire ? actionAerer({ ventilation: ventilationVeille(veillesEtat, etatsAcc), volets: voletsDeLaZone(LOGGIA_INDEX, etatsAcc, co2Pire.id) }) : null;
          const aerer = (act) => commanderService(dashHass, act.ids, act.domaine, act.service, { entity_id: act.ids });
          const secsRail = {
            attention: points.length ? <CarteAttention points={points} onNav={onNav} /> : null,
            meteo: meteoRailId ? <CarteMeteo hass={dashHass} onOpen={dc.ouvrir} /> : null,
            moment: railMoment, rappels: railRappels, agenda: railAgenda,
            // En option (ADR 0041) : `Sec` ne les monte que si on les a ajoutes.
            heure: <HorlogeRail style={styleDe(grille.styles, 'heure')} hass={dashHass} />,
            co2: co2Pire ? <Co2Rail hass={dashHass} capteur={co2Pire} seuil={co2Pire.seuil} action={co2Action} onAgir={aerer} /> : null,
          };
          const renduMain = ordreDe('main').map(id => secsMain[id] ? Sec('main', id, secsMain[id]) : null).filter(Boolean);
          const renduRail = ordreDe('rail').map(id => secsRail[id] ? Sec('rail', id, secsRail[id]) : null).filter(Boolean);
          // Mobile et tablette : deux onglets, « Maison » et « En ce moment ».
          if (!wide) return <OngletsAccueil maison={renduMain} moment={renduRail} edit={editMode} demande={pageDemandee} onDemande={() => setPageDemandee(null)} />;
          return (
            <div className="o-acc-grid" style={{ display: 'grid', gridTemplateColumns: wideXL ? '1fr 330px' : '1fr 276px', gap: wideXL ? 18 : 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                {renduMain}
              </div>
              {/* Le rail : une CELLULE qui ne compte pas dans la hauteur de la
                * rangée, et dedans la COLONNE collante qui défile seule
                * (04/10). La page s'arrête avec le contenu principal. En
                * édition, `o-rail-edit` rend la colonne au flux : glisser,
                * flèches, × et « Ajouter » comme avant. */}
              <div ref={poserRail} className={'o-rail-cell' + (editMode ? ' o-rail-edit' : '')}>
                <div className="o-rail-col" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                  {renduRail}
                </div>
              </div>
            </div>
          );
}

function Dashboard({ planActif = true, editMode = false, onEnt, onToggleEdit, sante = null, weatherMode = null, weatherRaw = null, wxFx = true, weatherTemp = null, weatherLabel = null, accueil = null, userName = 'Administrateur', onOpenRoom, onNav = null, cyclesPrises = null }) {
  const [override, setOverride] = useState(null);
  const { setPlageDemandee, agenda, jourChoisi, setJourChoisi, agendaOuvert, setAgendaOuvert } = useAgendaAccueil({ accueil });

  const { relireTodos, taches, bandeauCollecte } = useRappelsAccueil({ accueil, agenda });
  const { passe, futur, wide, tactile, formatGrille, etageChoisi, setEtageChoisi, vuePieces, setVuePieces, appareilAcc, grillePropre, grille, saveGrille, camDispo, poserCam, suivrePc, histo, histoOuvert, setHistoOuvert, restaurer, oublierHisto, annuler, refaire } = useAgencementAccueil({ editMode, planActif });
  const { ordreDe, secDrag, debutSec, mouvSec, finSec, clavierSec, estOption, cacheSec, montreSec, choisirStyle } = useGlisserSections({ editMode, grille, saveGrille });
  const { pieceDrag, etroitPieces, piecesCols, poserGrillePieces, taillesDe, ordrePieces, debutPiece, mouvPiece, finPiece, clavierPiece, enregistrerPieceIci, retirerPiece } = useGlisserPieces({ editMode, grille, saveGrille, tactile, wide });
  /** Une section de l'Accueil est-elle masquée ? Une option du rail l'est tant
   *  qu'on ne l'a pas ajoutée, une section tant qu'on ne l'a pas remise. */
  const sectionMasquee = (id) => (estOption(id) ? (grille.ajoutees || []).indexOf(id) < 0 : (grille.caches || []).map(s => ACC_RENOMME[s] || s).indexOf(id) >= 0);
  /** Enveloppe d'une section : drag + masque en édition, rien sinon. */
  const Sec = (zone, id, contenu) => {
    const cache = sectionMasquee(id);
    if (cache && !editMode) return null;
    const saisie = secDrag && secDrag.id === id;
    return (
      /* En édition, la section se saisit au pointeur ; le focus, le nom et
       * les flèches sont à sa SURFACE, son premier enfant. Hors édition, ni
       * surface ni gestionnaire. */
      <div key={id} data-sec={id} data-zone={zone}
        onPointerDown={editMode ? (e) => debutSec(e, zone, id) : undefined}
        onPointerMove={editMode ? mouvSec : undefined}
        onPointerUp={editMode ? finSec : undefined}
        onPointerCancel={editMode ? finSec : undefined}
        style={{ position: 'relative', minWidth: 0,
          opacity: saisie ? .55 : cache ? .4 : 1, transition: 'opacity .15s',
          /* En édition, le cadre est DANS le flux (padding) au lieu de flotter
           * autour : des boutons hors-boîte mordaient la section voisine et le
           * compteur de l'en-tête (retour 01/09). */
          /* L'appui long qui saisit ne doit pas selectionner le texte ni
           * ouvrir le menu du telephone (retour 22/09). */
          ...(editMode ? { border: saisie ? '2px solid var(--o-accent)' : '1px dashed rgba(var(--o-accent-rgb),.4)', padding: saisie ? '9px 11px' : '10px 12px', borderRadius: 18, cursor: 'grab', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', opacity: saisie ? .35 : 1 } : {}) }}>
        {/* La SURFACE (ADR 0074 ; lot 13 de l'audit du 03/10). En édition, la
          * section était elle-même un `role="button"` : ce rôle taisait le ×
          * qui la masque, ses puces de style, les cartes des pièces et des
          * favoris — onze sections `nested-interactive` sur l'Accueil de la
          * démo. La surface prend le focus, le nom et les flèches, et passe
          * SOUS tout ce qui suit, posé dans des conteneurs `position:
          * relative` : ils reçoivent leurs clics, la section son geste. */}
        {editMode && <Surface popup={false} label={nomCarte(ACC_NOMS()[id] || id, cache ? (estOption(id) ? tr('en option') : tr('masquée')) : null, tr('Déplacer avec les flèches'))}
          onKeyDown={(e) => clavierSec(e, zone, id)} style={{ cursor: 'inherit' }} />}
        {cache
          ? <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderRadius: 14, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--o-text3)' }}>{ACC_NOMS()[id]} · {estOption(id) ? tr('en option') : tr('masquée')}</span>
              <button onClick={() => montreSec(id)} aria-label={(estOption(id) ? tr('Ajouter') : tr('Réafficher')) + ' ' + (ACC_NOMS()[id] || id)} style={{ padding: '6px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(var(--o-accent-rgb),.14)', color: 'var(--o-accent-soft)', fontWeight: 700, fontSize: 12 }}>{estOption(id) ? tr('Ajouter') : tr('Réafficher')}</button>
            </div>
          : <>
              {/* Bandeau d'outils de la section, EN FLUX au-dessus d'elle :
                * poignée, nom, masquage — rien ne recouvre plus le contenu. */}
              {editMode && (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Fi i="menu-burger" size={12} color="var(--o-text3)" />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ACC_NOMS()[id] || id}</span>
                  <button data-drag-ui="1" onPointerDown={(e) => e.stopPropagation()} className="o-tapzone" onClick={() => cacheSec(id)} title={estOption(id) ? tr('Retirer') : tr('Masquer')} aria-label={(estOption(id) ? tr('Retirer') : tr('Masquer')) + ' ' + (ACC_NOMS()[id] || id)} style={{ ...EDIT_BTN, background: 'var(--o-bad)', color: '#fff' }}>×</button>
                </div>
              )}
              {/* Le STYLE d'un widget, sur sa propre ligne : a cote du nom il le
                * tronquait dans un rail de 276 px. Le contenu etant inerte en
                * edition, c'est ici que le choix se fait. */}
              {editMode && STYLES_WIDGETS[id] && (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  {STYLES_WIDGETS[id].map(st => { const on = styleDe(grille.styles, id) === st; return (
                    <button key={st} onClick={() => choisirStyle(id, st)} aria-pressed={on} style={{ padding: '6px 11px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, flexShrink: 0, background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)' }}>{NOMS_STYLES()[st]}</button>); })}
                </div>
              )}
              {/* Contenu inerte en édition — SAUF les sections qui portent
                * leur propre édition par carte (pièces, favoris). */}
              {/* En édition, AU-DESSUS de la surface (`position: relative`) : ce
                * qui reste vivant — « Gérer les scénarios », le segment des
                * pièces, « Ajouter une pièce », les favoris — garde ses clics ;
                * le reste, inerte, laisse passer l'appui jusqu'à la section. */}
              {/* Inerte au clavier et au lecteur d'écran aussi (relecture du lot 13
                * de l'audit du 03/10) : `pointer-events` ne retire ni le focus
                * ni l'arbre d'accessibilité — Tab menait à « Lancer Soirée »,
                * Entrée le lançait en pleine édition. Les scénarios s'en
                * écartent pour garder « Gérer les scénarios » joignable : leur
                * rangée seule est inerte (ScenariosAccueil). */}
              <div inert={editMode && id !== 'pieces' && id !== 'favoris' && id !== 'scenes' ? '' : undefined} style={{ ...(editMode ? { position: 'relative' } : {}), pointerEvents: editMode && id !== 'pieces' && id !== 'favoris' ? 'none' : 'auto' }}>{contenu}</div>
            </>}
      </div>
    );
  };
  const [roomPop, setRoomPop] = useState(null);
  const [pieceSheet, setPieceSheet] = useState(null); // { nom: '' (ajout) | 'Nom', compacte } ou null
  const { wx, fondPret, cond3d, soleil, heureForcee, cielSombre, modes } = useCielAccueil({ editMode, override, weatherMode, weatherRaw });
  const a = accueil; // données live (null → démo)
  // Les pièces affichées sont CELLES DE LA CONFIGURATION.
  //
  // La liste partait de `PIECES`, sept noms écrits dans le code : une pièce
  // nommée autrement — « Véranda », « Atelier » — n'apparaissait nulle part, et
  // l'accueil restait vide chez qui ne reprend pas ces noms-là. `PIECES` ne
  // fournit plus qu'un habillage : icône, couleur, teinte de fond. Un nom
  // inconnu reçoit un habillage neutre plutôt que d'être ignoré.
  // Reconnaissance par mots, quand le nom ne tombe pas juste. « Chambre Lino »,
  // « Ma cuisine », « Bathroom » doivent garder leur icône : n'exiger qu'une
  // égalité exacte rendait toute pièce nommée librement anonyme. Même
  // vocabulaire que `LIGHT_ROOM`, qui range déjà les luminaires ainsi — la
  // règle de la chambre d'enfant passe avant celle de la chambre, sans quoi
  // elle ne serait jamais atteinte.
  // Sans données live, on montre les pièces d'exemple : c'est l'écran d'avant
  // la première connexion, pas une installation vide.
  const noms = (a && a.rooms && a.rooms.length) ? a.rooms.map(r => r.name) : PIECES.map(p => p.name);
  const pieces = noms.map(nom => {
    const r = a && a.rooms && a.rooms.find(x => x.name === nom);
    const p = habillagePiece(nom, r && r.icon);
    // Une pièce sans capteurs : des tirets, pas les valeurs de vitrine que
    // l'habillage transporte depuis le modèle (audit du 03/10). Sans hass → démo.
    if (!r) return (a && a.rooms && a.rooms.length) ? { ...p, temp: '—', hum: '—', badge: null, live: { temp: null, hum: null, co2: null } } : p;
    const out = { ...p };
    out.temp = r.temp != null ? dec(r.temp, 1) + '°' : '—';
    out.hum = r.hum != null ? Math.round(r.hum) + '%' : '—';
    const z = zoneCo2(r.co2);
    if (r.co2 != null) { out.badge = nombre(r.co2, 0) + '\u00a0ppm'; out.bc = z && !z.bon ? z.c : 'var(--o-text2)'; out.bbg = z && !z.bon ? 'rgba(' + z.rgb + ',.14)' : 'var(--o-s1)'; }
    else out.badge = null;
    out.live = r; // valeurs brutes + entity ids → popup confort
    return out;
  });
  // Le mot de chacun (G1-D8) : sa zone telle quelle, « Inconnu » quand son traceur se tait — plus « Absent » pour tout le reste.
  const avatars = (a && a.people) ? a.people.map(p => ({ img: p.img, title: `${p.name} · ${motPresence({ state: p.etat })}`, dim: !p.home })) : [{ grad: 'linear-gradient(135deg,var(--o-rose),var(--o-purple))' }, { grad: 'linear-gradient(135deg,var(--o-accent),var(--o-ok))' }, { grad: 'linear-gradient(135deg,var(--o-lampe-b),var(--o-bad))' }];
  // ── Salutation contextuelle ──────────────────────────────────────────────
  // L'heure donne le bonjour ; la maison donne les faits — lumières allumées,
  // ouvrants ouverts, état de l'alarme. Sans HA, des faits d'exemple gardent
  // la vitrine vivante. L'horloge météo re-rend déjà chaque minute : l'heure
  // lue ici reste juste sans minuterie propre.
  const heure = new Date().getHours();
  const salut = heure < 5 ? tr('Bonne nuit') : heure < 12 ? tr('Bonjour') : heure < 18 ? tr('Bon après-midi') : heure < 23 ? tr('Bonsoir') : tr('Bonne nuit');
  const faits = useMemo(() => {
    const hs = a && a.hass;
    const S = hs && hs.states;
    if (!S) return { txt: [tr('{n} lumières allumées', { n: 2 }), tr('{n} ouvrant ouvert', { n: 1 })], alerte: false };
    const out = [];
    let alerte = false;
    let lum = 0;
    try { for (const l of discoverLights(hs, a && a.index)) if (l.on) lum++; } catch {}
    out.push(lum === 0 ? tr('Tout est éteint') : lum === 1 ? tr('{n} lumière allumée', { n: 1 }) : tr('{n} lumières allumées', { n: lum }));
    const ouv = ouvrantsDe(S).filter(o => o.on).length;
    if (ouv > 0) out.push(ouv === 1 ? tr('{n} ouvrant ouvert', { n: 1 }) : tr('{n} ouvrants ouverts', { n: ouv }));
    // L'alarme a sa tuile dans la banniere (ADR 0035) : la phrase ne la
    // repete plus ; seule une alarme declenchee reste une alerte.
    const cfgAl = secAlarm();
    const al = (cfgAl && S[cfgAl] && S[cfgAl].state !== 'unavailable') ? cfgAl
      : Object.keys(S).find(x => x.indexOf('alarm_control_panel.') === 0 && S[x] && S[x].state !== 'unavailable');
    if (al && S[al].state === 'triggered') alerte = true;
    return { txt: out, alerte };
  }, [a]);
  const { cams } = useCamerasAccueil({ a });
  const _dLv = { label: tr('Lave-vaisselle'), iconKey: 'dishwasher', phase: tr('Éteint'), color: 'var(--o-text3)', active: false, valueIcon: 'timer', valueText: '--:--', bar: null };
  const M = (a && a.machines) || {};
  /* `machines.poubelles` existe toujours — « En ce moment » s'en sert —, mais
   * l'Accueil ne le lit plus ici : la collecte a sa propre carte (03/10). */
  const mLv = M.lv || (a ? null : _dLv);
  const metricDiv = { flexShrink: 0, width: 1, background: 'var(--o-bd2)', margin: '4px 4px' };
  // ── Layout PC (≥1180) : rail « En cours / Rappels » accolé à la zone Pièces+Caméras ──
  const wideXL = useWide(1440); // tablette paysage (1180-1439) : rail plus étroit, cartes pièces prioritaires
  const dashHass = a && a.hass;
  const { ordinaire, veillesEtat, etatsAcc, points, couleurAcc, attentionLigne } = useAttentionAccueil({ a, dashHass, sante, sectionMasquee });
  const { pageDemandee, setPageDemandee, pieceCo2Max, poserRail, voirMoment } = useRailAccueil({ a, wide });
  /* L'AMBIANCE de chaque piece (ADR 0029) : une passe sur les etats — lecteurs
   * en lecture, chauffage qui chauffe, portes et fenetres ouvertes — rangee
   * par zone, pour la ligne d'etat des cartes pieces. La piece se cherche par
   * sa zone Home Assistant d'abord, par son nom sinon (comme ses lumieres). */
  const ambiances = ambiancesParPiece(etatsAcc, (a && a.index && a.index.areaNameOf) || null, rmNorm);
  const ambianceDe = (nom) => {
    const r = a && a.rooms && a.rooms.find(x => (x.name || x.room) === nom);
    const zone = r && r.area && a.index && a.index.areaById && a.index.areaById.get(r.area);
    return (zone && zone.name && ambiances[rmNorm(zone.name)]) || ambiances[rmNorm(nom)] || null;
  };
  // Le panneau d'alarme du rail : celui de la configuration d'abord.
  const alarmRailId = (() => {
    const S = (dashHass && dashHass.states) || null;
    if (!S) return null;
    const c = secAlarm();
    if (c && S[c]) return c;
    return Object.keys(S).find(x => x.indexOf('alarm_control_panel.') === 0 && S[x] && S[x].state !== 'unavailable') || null;
  })();
  // La tuile ALARME de la banniere (ADR 0035) : l'etat et le mode, d'un tap
  // vers la vue Securite — a la place du grand panneau. Sans panneau, rien.
  const alarmeTuile = tuileAlarme(alarmRailId && dashHass && dashHass.states ? dashHass.states[alarmRailId] : null);
  // Ouvrants de la maison, pour la bannière : combien sont ouverts sur combien.
  const ouvStat = useMemo(() => {
    const S = (dashHass && dashHass.states) || null;
    if (!S) return { ouverts: 0, total: 0 };
    try { const l = ouvrantsDe(S); return { ouverts: l.filter(o => o.on).length, total: l.length }; } catch { return { ouverts: 0, total: 0 }; }
  }, [dashHass]);
  /* Medias en lecture et appareils en marche, pour la banniere.
   *
   * Les entites de CONFIGURATION et de DIAGNOSTIC sont ecartees : la LED d'une
   * camera et le redemarrage d'un routeur sont des interrupteurs comme les
   * autres pour Home Assistant, mais personne ne dirait qu'un appareil
   * « tourne » parce que sa diode est allumee. Les interrupteurs designes
   * comme des lampes le sont aussi — ils sont deja comptes en lumieres.
   */
  const actifsStat = useMemo(() => {
    const vide = { medias: 0, mediasTotal: 0, appareils: 0, appareilsTotal: 0 };
    const S = (dashHass && dashHass.states) || null;
    if (!S) return vide;
    try {
      const meta = (a && a.index && a.index.entityMeta) || null;
      const lampes = new Set(switchLights());
      const out = { ...vide };
      /* Les lecteurs (chantier Médias, M16) : ceux de la maison (M1 B — ni la jumelle d'une Echo, ni Spotify, ni la sonnette), lus
       * avec leur jumeau (M14) ; un lecteur indisponible ne compte pas, comme un appareil muet. */
      const lecteurs = compteLecteurs(S, medPlayers());
      out.medias = lecteurs.enLecture; out.mediasTotal = lecteurs.vivants;
      for (const id in S) {
        const e = S[id];
        if (!e || e.state === 'unavailable' || e.state === 'unknown') continue;
        const p = id.indexOf('.');
        const dom = p > 0 ? id.slice(0, p) : '';
        if (dom === 'media_player') continue;
        const test = APPAREIL_ACTIF[dom];
        if (!test || lampes.has(id)) continue;
        const m = meta ? meta.get(id) : null;
        if (m && (m.category || m.hidden)) continue;
        out.appareilsTotal++;
        if (test(e.state)) out.appareils++;
      }
      return out;
    } catch { return vide; }
  }, [dashHass, a]);
  // lumières par pièce (compteur + interrupteur des cartes compactes) — une seule passe par render.
  // Signature etroite : on ne recalcule que si un luminaire a REELLEMENT change
  // d'etat, pas a chaque nouvelle reference de `hass`. Les switch déclarés
  // lumière la signent aussi (ADR 0261) : sans eux, la tuile ne se rafraîchissait pas.
  const lightsSig = useMemo(() => {
    const S = (dashHass && dashHass.states) || null;
    if (!S) return '';
    let out = '';
    for (const id in S) {
      if (id.charCodeAt(0) === 108 && id.indexOf('light.') === 0) {
        const e = S[id];
        out += id + e.state + ((e.attributes && e.attributes.brightness) || '') + '|';
      }
    }
    for (const id of switchLights()) { const e = S[id]; if (e) out += id + e.state + '|'; }
    return out;
  }, [dashHass]);
  const { veilleuses, roomLightsOf, roomMainsOf, toggleRoomLights, roomCoversInfo, dc, roomClimInfo } = useLumieresAccueil({ a, dashHass, lightsSig, noms });

  const { ficheCh, setFicheCh, momentRows, nEnCours } = useMomentAccueil({ a, cyclesPrises, dashHass, dc, mLv, onNav, ordinaire });
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <Header />
      {/* Deux régions vivantes, et elles sont TOUJOURS montées.
        *
        * L'état de l'alarme et la carte « À surveiller » changent tout seuls —
        * la maison s'arme, un détecteur se tait, une fuite arrive. À l'écran
        * ça se voit ; pour qui n'a pas le focus dessus, ça ne se disait pas.
        *
        * Le piège est là : un lecteur d'écran n'annonce le contenu d'une
        * région que s'il CHANGE, et une région qui apparaît déjà remplie ne
        * dit rien. Les poser DANS la carte n'aurait donc rien annoncé au
        * moment qui compte — celui où la carte apparaît. Elles vivent donc
        * ici, vides tant qu'il n'y a rien, et c'est leur texte qui change.
        *
        * Deux régions plutôt qu'une : sinon l'arrivée d'un point d'attention
        * ferait répéter l'état de l'alarme, et réciproquement.
        *
        * Le libellé et sa valeur passent par UN gabarit (audit du 03/10).
        * Collés en dur par une espace et deux-points, ils imposaient la
        * typographie française aux six autres langues : un lecteur d'écran
        * anglais disait « Alarm : Armed ». « {a} : {b} » s'écrit « {a}: {b} »
        * dans leurs catalogues. */}
      <div className="o-vh" role="status">{alarmeTuile ? tr('{a} : {b}', { a: tr('Alarme'), b: alarmeTuile.texte }) : ''}</div>
      <div className="o-vh" role="status">{attentionLigne ? tr('{a} : {b}', { a: tr('À surveiller'), b: resumeAttention(points) }) : ''}</div>
      {/* Le fond météo attend que le tableau de bord soit peint.
        *
        * `WeatherGL` est chargé à la demande — mais il était monté dès le
        * premier rendu, ce qui déclenchait aussitôt son import : 448 ko de
        * Three.js à l'époque (le ciel du handoff du 17/10 s'en passe), en
        * concurrence avec le contenu que l'on est venu lire. La paresse ne
        * servait donc à rien ici : elle décalait le téléchargement de quelques
        * millisecondes, pas d'une peinture.
        *
        * `onPaintReady` attend deux images puis rend la main — le même signal
        * dont les jauges se servent pour ne pas s'animer avant d'être vues. Le
        * décor arrive après le contenu, ce qui est sa place.
        *
        * Mouvement réduit : le ciel reste, immobile (le handoff : « l'image
        * reste, le temps s'arrête ») — c'est lui qui s'en charge. */}
      {wxFx && fondPret && (
        <div className={'o-wx3d' + (cielSombre ? ' o-wx3d-sombre' : '')} aria-hidden="true">
          <Suspense fallback={null}><WeatherGL condition={cond3d} heure={heureForcee} lever={soleil.lever} coucher={soleil.coucher} sombre={cielSombre} /></Suspense>
          <div className="o-wx3d-veil" />
        </div>)}
      <div className="loggia-content" style={{ position: 'relative', zIndex: 1, padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {editMode && (
          <BandeauEdition extra={<>
            {/* Desactives plutot que masques : leur place ne bouge pas, et
              * l'on voit qu'il n'y a rien a annuler. */}
            <button onClick={annuler} disabled={!passe.length} aria-label={tr('Défaire')} title={tr('Défaire') + ' (' + tr('Ctrl+Z') + ')'}
              style={{ ...editBtn(false), display: 'flex', alignItems: 'center', gap: 6, opacity: passe.length ? 1 : .45, cursor: passe.length ? 'pointer' : 'default' }}>
              <Fi i="undo" size={12} />{tr('Défaire')}
            </button>
            <button onClick={refaire} disabled={!futur.length} aria-label={tr('Refaire')} title={tr('Refaire') + ' (' + tr('Ctrl+Maj+Z') + ')'}
              style={{ ...editBtn(false), display: 'flex', alignItems: 'center', gap: 6, opacity: futur.length ? 1 : .45, cursor: futur.length ? 'pointer' : 'default' }}>
              <Fi i="redo" size={12} />{tr('Refaire')}
            </button>
            {/* Dire QUEL agencement on modifie : sans cela, on croit toucher
              * celui de tous les ecrans. */}
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.04em', padding: '5px 10px', borderRadius: 999,
              background: 'rgba(var(--o-accent-rgb),.16)', color: 'var(--o-text1)', whiteSpace: 'nowrap' }}>
              {appareilAcc ? String(ficheAppareil().nom || '').toUpperCase() : formatGrille === 'pc' ? tr('ORDINATEUR') : formatGrille === 'tablette' ? tr('TABLETTE') : tr('TÉLÉPHONE')}
            </span>
            {grillePropre && (
              <button onClick={suivrePc} style={editBtn(false)} title={tr('Cet écran retrouve l’agencement de l’ordinateur.')}>
                {tr('Suivre l’ordinateur')}
              </button>
            )}
            <button onClick={() => setHistoOuvert(true)} style={{ ...editBtn(false), display: 'flex', alignItems: 'center', gap: 6 }}
              title={tr('Retrouver un agencement précédent')}>
              <Fi i="time-past" size={12} />{tr('Historique')}{histo.length ? ' · ' + histo.length : ''}
            </button>
          </>} onEnt={onEnt} />
        )}

        {/* BANNER. Pas de rembourrage EN HAUT (10/10) : son contenu tombait 14 px
          * plus bas que le titre des autres vues, qui n ont que celui de la
          * page. « Remonte Pieces au meme niveau que les autres vues, et fais
          * de meme pour l accueil. » Le bas garde le sien. */}
        <BanniereAccueil a={a} actifsStat={actifsStat} alarmeTuile={alarmeTuile} attentionLigne={attentionLigne} avatars={avatars} couleurAcc={couleurAcc} editMode={editMode} faits={faits} metricDiv={metricDiv} modes={modes} nEnCours={nEnCours} onNav={onNav} onOpenRoom={onOpenRoom} ouvStat={ouvStat} pieceCo2Max={pieceCo2Max} points={points} salut={salut} setOverride={setOverride} userName={userName} voirMoment={voirMoment} wx={wx} wxFx={wxFx} />

        {/* Les favoris sont une SECTION comme les autres depuis le 01/09 :
            déplaçable, masquable, et éditable en place (voir secsMain). */}

        {/* SECTIONS PERSONNALISABLES — scènes rapides, pièces, caméras, et le rail.
            PC ≥1180 : rail accolé à droite. Mobile/tablette : empilement. */}
        <SectionsAccueil Sec={Sec} a={a} agenda={agenda} ambianceDe={ambianceDe} bandeauCollecte={bandeauCollecte} camDispo={camDispo} cams={cams} clavierPiece={clavierPiece} dashHass={dashHass} dc={dc} debutPiece={debutPiece} editMode={editMode} etageChoisi={etageChoisi} etatsAcc={etatsAcc} etroitPieces={etroitPieces} finPiece={finPiece} formatGrille={formatGrille} grille={grille} jourChoisi={jourChoisi} momentRows={momentRows} mouvPiece={mouvPiece} nEnCours={nEnCours} onNav={onNav} onOpenRoom={onOpenRoom} ordinaire={ordinaire} ordreDe={ordreDe} ordrePieces={ordrePieces} pageDemandee={pageDemandee} pieceDrag={pieceDrag} pieces={pieces} piecesCols={piecesCols} planActif={planActif} points={points} poserCam={poserCam} poserGrillePieces={poserGrillePieces} poserRail={poserRail} relireTodos={relireTodos} retirerPiece={retirerPiece} roomClimInfo={roomClimInfo} roomCoversInfo={roomCoversInfo} roomLightsOf={roomLightsOf} roomMainsOf={roomMainsOf} saveGrille={saveGrille} setAgendaOuvert={setAgendaOuvert} setEtageChoisi={setEtageChoisi} setJourChoisi={setJourChoisi} setPageDemandee={setPageDemandee} setPieceSheet={setPieceSheet} setVuePieces={setVuePieces} taches={taches} taillesDe={taillesDe} toggleRoomLights={toggleRoomLights} veillesEtat={veillesEtat} veilleuses={veilleuses} vuePieces={vuePieces} wide={wide} wideXL={wideXL} />

      </div>
      {roomPop && (() => {
        // roomPop = nom de pièce → on relit la pièce fraîche à chaque render (la modale suit les polls)
        const pop = pieces.find(x => x.name === roomPop);
        if (!pop) return null;
        return pop.status && pop.status.kind === 'ext'
          ? <OutdoorModal piece={pop} hass={a && a.hass} mode={weatherMode || 'clouds'} label={weatherLabel} weatherTemp={weatherTemp} sunset={a && a.sunsetHM} onClose={() => setRoomPop(null)} />
          : <RoomComfortModal piece={pop} hass={a && a.hass} onClose={() => setRoomPop(null)} />;
      })()}
      {/* Fiches des cartes du catalogue (héros « En ce moment »). */}
      {dc.sheets}
      {/* La fiche d'un chauffage d'« En ce moment », ouverte par sa clé (tâche 12 du chantier Chauffage). */}
      {ficheCh && <FicheChauffage cle={ficheCh} hass={dashHass} onClose={() => setFicheCh(null)} />}
      {histoOuvert && <FeuilleHistorique entrees={histo} onRestaurer={restaurer} onOublier={oublierHisto} onClose={() => setHistoOuvert(false)} />}
      {agendaOuvert && (
        /* `large` decide de la MAQUETTE : deux colonnes sur ordinateur (1b),
         * une feuille sur telephone (2b). Quatre maquettes avaient ete
         * fournies ; un premier essai n'avait repris que le mobile. */
        <Suspense fallback={null}><FeuilleAgenda hass={accueil && accueil.hass} evenements={agenda || []} jourChoisi={jourChoisi}
          onChoisirJour={setJourChoisi} onClose={() => { setAgendaOuvert(false); setPlageDemandee(null); }}
          large={wide} onPlage={setPlageDemandee} /></Suspense>
      )}
      {pieceSheet && <Suspense fallback={null}><FichePiece key={pieceSheet.nom} nom={pieceSheet.nom} compacte={pieceSheet.compacte} hass={dashHass} onEnregistrer={enregistrerPieceIci} onSupprimer={retirerPiece} onClose={() => setPieceSheet(null)} briques={BRIQUES_PIECE} /></Suspense>}
    </main>
  );
}

export { Dashboard };
