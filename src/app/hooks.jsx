/* Les hooks d’`App()` (étape e) : la connexion, le toast, la météo, l’Accueil, le journal, les réglages de l’écran, l’assistant, les comptes, l’accueil des débutants.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useRef, useState, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';
import { fondre, marquerLues } from '../journal.js';
import { poserApparence, apparence, readLS, compteOrdinaire } from '../state.js';
import { SAFE_NOLOOK } from '../theme.js';
import { healthReport } from '../health.js';
import { CONFIG_VERSION } from '../config.js';
import { texteRefus, estRefus } from '../refus.js';
import { viewReason } from '../views.js';
import { lireFondPhoto, FERMER_TOUT } from '../ui.jsx';
import { synchroniserFond } from '../fondphoto.js';
import { weatherEntity, haWeatherMode, haWeatherLabel } from '../wxutil.jsx';
import { useLecturePrises, cyclesElectromenager } from '../prisesetat.js';
import { useAssistant } from '../assistant.js';
import { tr } from '../i18n.js';
import { HASS_POLL_MS, priseDe } from './noyau.jsx';
import { useSeuilPile } from '../cartes/groupe.jsx';
import { deriveAccueil, deriveNotifs } from './derive.jsx';

/** Empreinte de la liste, pour comparer sans se soucier des cles de rendu. */

// Détection auto du profil Loggia d'après l'utilisateur HA connecté (selon l'appareil/login).
// 1) correspondance par nom (insensible casse), 2) sinon 1er Admin si le compte HA est admin. -1 = aucun.
/**
 * Profil Loggia correspondant au compte Home Assistant connecte.
 *
 * L'identifiant du compte fait foi : deux personnes peuvent porter le meme
 * prenom, et un profil renomme ne doit pas se detacher de son compte. Le nom
 * ne sert qu'a etablir le lien la premiere fois ; `haId` le fige ensuite.
 *
 * Rend -1 plutot qu'un profil approchant : se connecter sous un compte donne
 * et se retrouver sur un autre profil est pire que de rester sur place.
 */
const matchHaUser = (haUser, list) => {
  if (!haUser || !Array.isArray(list) || !list.length) return -1;
  const id = haUser.id || null;
  // Meme garde que le rapprochement par nom : un profil Admin n'est pris que
  // si le compte Home Assistant l'est aussi. Sans cela, le code administrateur
  // se contournait en se rattachant a un profil Admin.
  if (id) { const i = list.findIndex(u => u.haId === id); if (i >= 0 && (list[i].role !== 'Admin' || haUser.is_admin)) return i; }
  const n = (haUser.name || '').trim().toLowerCase();
  if (n) {
    const i = list.findIndex(u => (u.name || '').trim().toLowerCase() === n);
    // Un profil Admin n'est pris que si le compte HA l'est aussi : sinon le
    // rapprochement par nom contournerait le code administrateur.
    if (i >= 0 && (list[i].role !== 'Admin' || haUser.is_admin)) return i;
  }
  return -1;
};

function useConnexionApp({ activeCv, activeRoom, hass, loggiaRuntime, view }) {
  /* Le seuil de la veille des piles (§ 19.8), relu ICI avec les veilles du serveur, une fois pour tout l'écran : la carte Piles, la
   * section Plantes et piles, la popup, « En ce moment » et les points d'attention jugent la même pile de la même façon, quelle que
   * soit la vue ouverte en premier (passe bis du 17/10, point 2). */
  const seuilPile = useSeuilPile(hass);
  /* L'état des prises, suivi tant que la maison est là (audit du 19/10, point 2) : les notifications disent les cycles que le
   * serveur suit, sur toutes les vues — un cache que personne ne relirait garderait un cycle fini « en cours ». Le magasin ne
   * republie qu'un changement (point 6) : ce sondage de 60 s ne redessine rien quand rien ne bouge. */
  const lecturePrises = useLecturePrises(!!hass);
  // Vue courante devenue impossible a remplir (appareil retire, configuration
  // importee d'une autre installation, lien direct) : on explique au lieu
  // d'afficher des tirets. Vues personnalisees et pieces ne passent pas par la.
  const viewBlocked = (activeCv || activeRoom) ? null : viewReason(loggiaRuntime.views, view);
  // Perte de connexion : affichée seulement après avoir été connecté au moins une fois (pas de faux positif au boot/preview)
  const wasConnectedRef = useRef(false);
  const nowOk = !!(hass && hass.states && (hass.connected === undefined || hass.connected));
  if (nowOk) wasConnectedRef.current = true;
  const haLost = wasConnectedRef.current && !nowOk;
  /* « CONNEXION… », pas « HORS LIGNE » en rouge, tant que le pont n'a pas fait
   * un tic (lot 14 de l'audit du 03/10) : sans `hass` au premier rendu —
   * l'application mobile le pose parfois après —, la barre latérale criait à
   * la panne avant le moindre échec. Passé ce délai, la panne se dit. Déjà
   * connecté au montage : rien à attendre, pas de minuteur ni de rendu de plus. */
  const [patienceHa, setPatienceHa] = useState(true);
  useEffect(() => { if (wasConnectedRef.current) return undefined; const t = setTimeout(() => setPatienceHa(false), HASS_POLL_MS); return () => clearTimeout(t); }, []);
  return { seuilPile, lecturePrises, viewBlocked, wasConnectedRef, haLost, patienceHa };
}

function useToastApp() {
  /* Échec de commande → écoute globale + toast.
   *
   * Deux sources aboutissent ici. Les appels directs à `callService`, dont la
   * promesse rejetée n'est reprise nulle part. Et le moteur d'actions, qui lui
   * attrape le rejet pour en donner la raison : `commander()` le relance donc à
   * vide, sinon la moitié des commandes du dashboard échouerait sans un mot. */
  const [toast, setToast] = useState(null);
  const toastTRef = useRef(0);
  // Le dernier message montre : le meme refus ne se redit pas.
  const dernierToast = useRef(null);
  useEffect(() => {
    const h = (ev) => {
      const r = ev && ev.reason;
      /* Seules les erreurs du PROTOCOLE de Home Assistant (audit de
       * consolidation du 28/10, M11) : `{ code, message }`, le code une chaîne
       * — ce que renvoie le WebSocket, et ce que Loggia lève sous la même forme
       * (`service_error`, `eau_seule`). Le filtre d'avant prenait tout `code`
       * vrai et tout message qui contenait « entity » ou « timeout » : une
       * `AbortError` (code numérique) ou une erreur de programme passait pour
       * un refus de Home Assistant. */
      if (!estRefus(r)) return;
      ev.preventDefault();
      // Un reglage de la maison refuse n'est pas une panne : c'est une regle.
      // Le message generique laissait croire a un incident, et l'on cherchait
      // du cote de Home Assistant une explication qui etait ici.
      /* DEUX refus de droits depuis l'ADR 0080 : un réglage de la maison, et
       * le passage vers un profil Admin sans le code. Le message unique disait
       * « seul un administrateur Home Assistant peut le changer » — faux pour
       * le second, où le code suffit. Les deux partageaient `not_admin`, et
       * l'écran les départageait par une expression sur le motif FRANÇAIS du
       * composant ; le passage refusé porte son code à lui depuis l'audit du
       * 03/10. */
      const codeAdmin = r && r.code === 'code_admin_requis';
      /* Le serveur NOMME les reglages refuses (« reglages reserves aux
       * administrateurs Home Assistant : loggia_rooms ») ; le message les
       * jetait. On ne pouvait ni savoir ce qui n'avait pas pris, ni le dire —
       * d'ou un avertissement qu'on subit sans pouvoir agir (01/10). */
      const cles = (String((r && r.message) || '').split(':')[1] || '').trim();
      const texte = codeAdmin
        ? tr('Profil non changé — le code administrateur est requis')
        : r && r.code === 'not_admin'
          ? (cles
            ? tr('« {k} » non enregistré — ce réglage appartient à la maison, et seul un administrateur Home Assistant peut le changer', { k: cles })
            : tr('Réglage non enregistré — il appartient à la maison, et seul un administrateur Home Assistant peut le changer'))
          /* Un rangement refusé : déjà dans la langue de l'écran, et nommé
           * (`rangerScenarios`, audit du 03/10). */
          : r && r.code === 'scenarios_ordre' ? String(r.message)
          : r && r.code === 'scenario_incomplet' ? String(r.message)
          /* Un autre refus prévisible du composant — trop volumineux, une
           * limite atteinte — se dit par son code, dans la langue de l'écran
           * (refus.js, audit du 03/10). */
          : texteRefus(r) || tr('Commande non exécutée — Home Assistant a refusé ou n’a pas répondu');
      /* LE MEME refus ne se redit pas. Une ecriture refusee peut partir
       * plusieurs fois — plusieurs cartes, plusieurs cles — et le bandeau
       * revenait autant de fois, sans rien apprendre de plus. */
      if (texte === dernierToast.current) return;
      dernierToast.current = texte;
      setToast(texte);
      clearTimeout(toastTRef.current);
      toastTRef.current = setTimeout(() => { setToast(null); dernierToast.current = null; }, 5000);
    };
    // Cette fenêtre seulement : le panneau n'est pas une iframe, et écouter la
    // fenêtre parente aurait affiché ici les rejets de Home Assistant même
    // (audit 18/09).
    window.addEventListener('unhandledrejection', h);
    return () => { window.removeEventListener('unhandledrejection', h); clearTimeout(toastTRef.current); };
  }, []);
  return { toast };
}

function useMeteoApp({ hass }) {
  const wEnt = (hass && hass.states) ? hass.states[weatherEntity(hass)] : null;
  const isNight = (hass && hass.states && hass.states['sun.sun'] && hass.states['sun.sun'].state === 'below_horizon') || (wEnt && wEnt.state === 'clear-night');
  const weatherMode = wEnt ? haWeatherMode(wEnt.state, isNight) : null;
  const weatherRaw = wEnt ? String(wEnt.state) : null; // état HA brut pour le fond GLSL (presets = états HA)
  const weatherTemp = wEnt && wEnt.attributes ? wEnt.attributes.temperature : null;
  const weatherLabel = wEnt ? haWeatherLabel(wEnt.state) : null;
  return { weatherMode, weatherRaw, weatherTemp, weatherLabel };
}

function useAccueilApp({ activeRoom, cfg, hass, lecturePrises, loggiaRuntime, seuilPile, view }) {
  /* Les deux dérivations de l'Accueil, MÉMOÏSÉES (audit du 27/09).
   *
   * `deriveAccueil` balaie les pièces, les lumières, le chauffage, les volets,
   * les plantes, les machines, l'alarme, les caméras et les médias — cent
   * trente lignes. Elle était appelée DANS le rendu, comme `deriveNotifs`.
   *
   * Ce n'est pas le changement d'état qui coûtait : quand la maison bouge,
   * refaire le calcul est juste. C'est tout le RESTE. Mesuré sur la
   * démonstration, `hass` identique d'un bout à l'autre : un aller-retour en
   * mode édition provoquait QUATRE recalculs complets des deux dérivations et
   * du balayage d'entités de la barre latérale. Rien n'avait changé dans la
   * maison.
   *
   * `cfg` et `loggiaRuntime` sont déjà mémoïsés : les dépendances sont donc
   * complètes, et la règle `exhaustive-deps` n'a rien à redire — l'inventaire
   * de `tests/dependances.test.mjs` ne bouge pas d'une ligne. */
  const accueil = useMemo(() => {
    // Dashboard + vue Pièce (capteurs de la pièce) — pas calculé ailleurs
    if (view !== 'accueil' && !activeRoom) return null;
    try {
      const a = deriveAccueil(hass, cfg, loggiaRuntime.resolved);
      if (a) a.index = loggiaRuntime.index;
      return a;
    } catch (e) { console.error('deriveAccueil', e); return null; }
  }, [view, activeRoom, hass, cfg, loggiaRuntime.resolved, loggiaRuntime.index]);
  /* Ce que l'instant présent justifie. À lui seul, ce n'est pas une
   * notification : c'est un état. Le journal en fait un événement. */
  /* `deriveNotifs` juge les piles au seuil retenu par `attention.js` : le mémo se refait aussi quand ce seuil change, sans attendre
   * le prochain relevé (relecture de la passe bis du 17/10). */
  // Les cycles que le serveur suit, pour les notifications et « En ce moment » (point 2) : `null`, l'ancien chemin.
  const cyclesPrises = useMemo(() => cyclesElectromenager(lecturePrises.etat, (id) => !!priseDe((hass && hass.states) || {}, id).puissance),
    [hass, lecturePrises.etat]);
  const vivantes = useMemo(() => {
    try { return deriveNotifs(hass, cyclesPrises); } catch (e) { console.error('deriveNotifs', e); return []; }
  }, [hass, seuilPile, cyclesPrises]);   // eslint-disable-line react-hooks/exhaustive-deps
  return { accueil, cyclesPrises, vivantes };
}

function useJournalApp({ hass, vivantes }) {
  /* LES NOTIFICATIONS PERSISTANTES DE HOME ASSISTANT (01/10).
   *
   * C'est le canal prévu pour cela : intégrations en échec, appareils
   * découverts, messages de scripts, redémarrage requis. Loggia ne les
   * regardait pas — d'où « il n'y a rien ou presque qui remonte ici ».
   *
   * On s'ABONNE, on ne sonde pas : le serveur envoie l'état courant à
   * l'abonnement, puis chaque ajout et chaque retrait. */
  const [persistantes, setPersistantes] = useState([]);
  const conn = hass && hass.connection;
  useEffect(() => {
    if (!conn || typeof conn.subscribeMessage !== 'function') return undefined;
    let vivant = true, desabonner = null;
    const table = new Map();
    const poser = () => setPersistantes([...table.values()].map(x => ({
      k: 'ha:' + (x.notification_id || x.title || ''),
      c: 'var(--o-accent-soft)',
      // Un nom propre ne se traduit pas ; sans titre, l'identifiant dit au
      // moins de quoi il s'agit.
      t: x.title || x.notification_id || '',
      m: x.message || '',
    })));
    conn.subscribeMessage((msg) => {
      if (!vivant || !msg) return;
      const liste = msg.notifications || {};
      // « current » est l'état COMPLET du serveur, renvoyé à chaque
      // (ré)abonnement : une notification retirée pendant une coupure restait
      // affichée pour toujours (audit du 03/10).
      if (msg.type === 'current') table.clear();
      if (msg.type === 'removed') { for (const id in liste) table.delete(id); }
      else { for (const id in liste) table.set(id, liste[id]); }
      poser();
    }, { type: 'persistent_notification/subscribe' })
      .then(u => { if (!vivant) { try { u(); } catch { /* deja parti */ } } else desabonner = u; })
      .catch(() => { /* serveur ancien : on s'en passe, le reste tient */ });
    return () => { vivant = false; if (desabonner) { try { desabonner(); } catch { /* deja parti */ } } };
  }, [conn]);

  /* LA MÉMOIRE. Un événement entre une fois, reste après la fin de ce qui l'a
   * causé, et se marque lu. Dans le NAVIGATEUR : « lu » est propre à celui qui
   * regarde, et marquer lu chez soi ne doit pas éteindre l'alerte sur la
   * tablette du couloir. */
  const [journal, setJournal] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem('loggia_journal') || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  const rangerJournal = useCallback((suite) => {
    try { localStorage.setItem('loggia_journal', JSON.stringify(suite)); } catch { /* stockage plein : on perd la memoire, pas l'alerte */ }
    return suite;
  }, []);
  useEffect(() => {
    setJournal(j => { const n = fondre(j, [...vivantes, ...persistantes], Date.now()); return n === j ? j : rangerJournal(n); });
  }, [vivantes, persistantes, rangerJournal]);
  const notifs = journal;
  const lireNotifs = useCallback(() => {
    setJournal(j => { const n = marquerLues(j); return n === j ? j : rangerJournal(n); });
  }, [rangerJournal]);
  return { notifs, lireNotifs };
}

function useReglagesEcran({ haTheme, look, setHaTheme, setLoggiaTheme, setThemeMode, setView, view }) {
  /* Un GESTE écrit l'apparence (ADR 0223) ; le démarrage, jamais — sinon le
   * premier écran allumé imposerait son thème à tous ceux du profil. */
  const onMode = (m) => { setThemeMode(m); setHaTheme(''); if (!SAFE_NOLOOK) poserApparence({ mode: m, ha: '' }); };
  const onPickTheme = (id) => { setLoggiaTheme(id); setHaTheme(''); if (!SAFE_NOLOOK) poserApparence({ theme: id, ha: '' }); };
  const onFollowHa = () => { const n = haTheme === 'FOLLOW' ? '' : 'FOLLOW'; setHaTheme(n); if (!SAFE_NOLOOK) poserApparence({ ha: n }); };
  const toggle = () => { setHaTheme(''); setThemeMode(m => m === 'light' ? 'dark' : 'light'); }; // bouton flottant = bascule clair/foncé Loggia
  const [navOpen, setNavOpen] = useState(() => { try { return (typeof window !== 'undefined' ? window.innerWidth : 1000) > 820; } catch { return true; } });
  /* Interface TACTILE — téléphone ET tablette, portrait comme paysage : la
   * classe `loggia-tactile` masque le bandeau du haut, met la sidebar en
   * tiroir et affiche la barre du bas. Le type d'appareil (pointer: coarse)
   * décide, jamais la largeur.
   *
   * Le drapeau est aussi tenu en état (24/09) : le tiroir doit SAVOIR qu'il
   * est seul à porter le profil et la cloche, et ne pas les rendre du tout
   * sur ordinateur, où elles vivent en haut à droite. */
  const [tactile, setTactile] = useState(false);
  /* AVANT le premier dessin (lot 14 de l'audit du 03/10) : posée par un
   * `useEffect`, la classe arrivait après — au doigt, la page naissait avec
   * le bandeau du haut et, sur tablette, la barre latérale ouverte, puis
   * sautait de 73 px vers le haut ou de 264 px vers la gauche (CLS 0,23 sur
   * la démo, tablette tactile 1180 × 820). */
  useLayoutEffect(() => {
    const actif = (() => { try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
    try { document.documentElement.classList.toggle('loggia-tactile', actif); } catch {}
    setTactile(actif);
    if (actif) setNavOpen(false); // la sidebar devient un tiroir : fermée d'office
  }, [view]);
  /* Le menu mobile se fermait au clic sur le voile, mais rien au clavier :
   * qui l'ouvre sans souris y restait enferme. Trois autres panneaux geraient
   * deja Echap, celui-ci avait ete oublie. */
  useEffect(() => {
    if (!navOpen) return undefined;
    const surTouche = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setNavOpen(false); } };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [navOpen]);
  const [navbar, setNavbar] = useState(() => { try { return localStorage.getItem('loggia-navbar') !== '0'; } catch { return true; } }); // barre du bas mobile (défaut activée)
  // Mode ambiant : minutes d'inactivité avant l'écran de veille, 0 = coupé.
  // Par APPAREIL (localStorage, hors sync) : on l'active sur la tablette
  // murale, pas sur le poste de travail.
  // Fond photo : la dataURL vit dans un cache module (lireFondPhoto) ; ce
  // compteur force le re-rendu quand les Paramètres la changent.
  const [, setFondV] = useState(0);
  useEffect(() => {
    const f = () => setFondV(v => v + 1);
    window.addEventListener('loggia-fond-photo', f);
    return () => window.removeEventListener('loggia-fond-photo', f);
  }, []);
  const fondPhotoActif = look.fond === 'photo' ? lireFondPhoto() : null;
  /* La photo suit le compte (ADR 0289) : à l'ouverture, et chaque fois qu'un
   * autre écran annonce une nouvelle version, on reprend celle du serveur. */
  useEffect(() => {
    if (look.fond !== 'photo' || SAFE_NOLOOK) return;
    synchroniserFond(look.fondV, (v) => poserApparence({ look: { ...(apparence().look || {}), fondV: v } }));
  }, [look.fond, look.fondV]);
  // Aperçu de la fiche appareil universelle : ?fiche=<entity_id> — lu aussi sur
  // l'URL du PANNEAU (le parent de l'iframe), la page directe n'ayant pas de
  // session. Outil d'essai : la fiche s'ouvrira depuis les cartes ensuite.
  const [ficheDemo, setFicheDemo] = useState(() => {
    try {
      const ici = new URLSearchParams(window.location.search).get('fiche');
      if (ici) return ici;
      if (window.top !== window) return new URLSearchParams(window.top.location.search).get('fiche') || null;
    } catch { /* cross-origin improbable : même hôte */ }
    return null;
  });
  const [ambient, setAmbient] = useState(() => { try { return parseInt(localStorage.getItem('loggia-ambient') || '0', 10) || 0; } catch { return 0; } });
  const onAmbient = (min) => { setAmbient(min); try { localStorage.setItem('loggia-ambient', String(min)); } catch {} };
  // Plage de la veille : « toujours », « nuit » (21 h – 8 h) ou « jour » — trois
  // choix nets plutôt que deux champs d'heure. Par appareil, comme le délai.
  const [ambPlage, setAmbPlage] = useState(() => { try { return localStorage.getItem('loggia-ambientplage') || 'toujours'; } catch { return 'toujours'; } });
  const onAmbPlage = (v) => { setAmbPlage(v); try { localStorage.setItem('loggia-ambientplage', v); } catch {} };
  const hNow = new Date().getHours();
  const enNuit = hNow >= 21 || hNow < 8;
  const plageOk = ambPlage === 'toujours' || (ambPlage === 'nuit' ? enNuit : !enNuit);
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!ambient) { setIdle(false); return; }
    let t = 0;
    const arme = () => { clearTimeout(t); t = setTimeout(() => setIdle(true), ambient * 60000); };
    // Un geste quelconque réveille ET réarme. L'overlay couvre tout l'écran :
    // le toucher de réveil ne peut rien actionner en dessous.
    const reveil = () => { setIdle(false); arme(); };
    const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    evs.forEach(e => window.addEventListener(e, reveil, { passive: true }));
    arme();
    return () => { clearTimeout(t); evs.forEach(e => window.removeEventListener(e, reveil)); };
  }, [ambient]);
  /* ── Le retour à l'accueil après inactivité (05/10) ────────────────────────
   *
   * Sur une tablette murale, une fiche laissée ouverte y reste jusqu'au
   * prochain passage. Passé le délai, les feuilles se ferment et la vue revient
   * à l'Accueil. COUPÉ par défaut : personne ne doit voir son écran bouger tout
   * seul sans l'avoir demandé.
   *
   * Par APPAREIL, comme la veille : la tablette du couloir et le téléphone
   * qu'on garde en main n'ont pas le même besoin.
   *
   * Ce minuteur vit dans l'onglet, et c'est sa place : il ne s'agit pas d'une
   * action différée sur la maison — celles-là vivent dans le composant —, mais
   * du comportement d'un écran. */
  const [retourAcc, setRetourAcc] = useState(() => { try { return parseInt(localStorage.getItem('loggia-retour') || '0', 10) || 0; } catch { return 0; } });
  const onRetourAcc = (min) => { setRetourAcc(min); try { localStorage.setItem('loggia-retour', String(min)); } catch {} };
  /* Une référence vivante : le geste change à chaque rendu (il ferme la vue
   * courante), et le mettre dans les dépendances relancerait le minuteur sans
   * arrêt — il ne sonnerait jamais. */
  const retourRef = useRef(null);
  retourRef.current = () => {
    /* Une saisie en cours ne se fait pas couper sous les doigts : on laisse le
     * délai repartir plutôt que de fermer un formulaire à moitié rempli. */
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
    window.dispatchEvent(new Event(FERMER_TOUT));
    setView('accueil');
  };
  useEffect(() => {
    if (!retourAcc) return undefined;
    let t = 0;
    const sonne = () => { retourRef.current(); arme(); };
    const arme = () => { clearTimeout(t); t = setTimeout(sonne, retourAcc * 60000); };
    /* Ce qui compte comme activité : un geste de l'utilisateur. Un changement
     * d'état de la maison n'en est PAS un — sinon le délai ne s'écoulerait
     * jamais dans une maison vivante. */
    const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    evs.forEach(e => window.addEventListener(e, arme, { passive: true }));
    arme();
    return () => { clearTimeout(t); evs.forEach(e => window.removeEventListener(e, arme)); };
  }, [retourAcc]);

  // Fonds animés de l'Accueil : effets météo (défaut activés) et ciel étoilé en remplacement de « nuit claire » (défaut activé)
  const [wxFx, setWxFx] = useState(() => { try { return localStorage.getItem('loggia-wxfx') !== '0'; } catch { return true; } });
  const onToggleWxFx = () => setWxFx(v => { const nv = !v; try { localStorage.setItem('loggia-wxfx', nv ? '1' : '0'); } catch {} return nv; });
  const onToggleNavbar = () => setNavbar(v => { const nv = !v; try { localStorage.setItem('loggia-navbar', nv ? '1' : '0'); } catch {} return nv; });
  // Safe-area iPhone : env() = 0 dans l'iframe → on mesure la vraie valeur sur le document TOP (qui a viewport-fit=cover).
  const [safeAuto, setSafeAuto] = useState(0);
  const [safeTopAuto, setSafeTopAuto] = useState(0);
  // Réglages manuels de secours (px) : null = auto (sonde). Persistés par appareil.
  const [navOffset, setNavOffset] = useState(() => { try { const v = localStorage.getItem('loggia-navoffset'); return (v == null || v === '') ? null : Math.max(0, parseInt(v) || 0); } catch { return null; } });
  const [topOffset, setTopOffset] = useState(() => { try { const v = localStorage.getItem('loggia-topoffset'); return (v == null || v === '') ? null : Math.max(0, parseInt(v) || 0); } catch { return null; } });
  useEffect(() => {
    const measure = () => {
      try {
        const td = (window.top || window).document;
        const probe = (css) => { const p = td.createElement('div'); p.style.cssText = 'position:fixed;left:0;width:0;opacity:0;pointer-events:none;z-index:-1;' + css; td.documentElement.appendChild(p); void p.offsetHeight; const h = Math.round(p.getBoundingClientRect().height || p.offsetHeight || 0); td.documentElement.removeChild(p); return h > 0 ? h : 0; };
        setSafeAuto(probe('bottom:0;height:env(safe-area-inset-bottom,0px)'));
        setSafeTopAuto(probe('top:0;height:env(safe-area-inset-top,0px)'));
      } catch {}
    };
    measure();
    const t1 = setTimeout(measure, 400), t2 = setTimeout(measure, 1200);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('resize', measure); window.removeEventListener('orientationchange', measure); };
  }, []);
  const safeEff = navOffset != null ? navOffset : safeAuto; // valeur appliquée (manuel prioritaire)
  const safeTopEff = topOffset != null ? topOffset : safeTopAuto;
  useEffect(() => { try { document.documentElement.style.setProperty('--o-safe-bottom', safeEff + 'px'); document.documentElement.style.setProperty('--o-safe-top', safeTopEff + 'px'); } catch {} }, [safeEff, safeTopEff]);
  const onNavOffset = (d) => setNavOffset(v => { const base = v != null ? v : safeAuto; const nv = Math.max(0, Math.min(100, base + d)); try { localStorage.setItem('loggia-navoffset', String(nv)); } catch {} return nv; });
  const onNavSet = (px) => setNavOffset(() => { const nv = Math.max(0, Math.min(100, Math.round(px))); try { localStorage.setItem('loggia-navoffset', String(nv)); } catch {} return nv; });
  const onNavOffsetReset = () => { setNavOffset(null); try { localStorage.removeItem('loggia-navoffset'); } catch {} };
  const onTopOffset = (d) => setTopOffset(v => { const base = v != null ? v : safeTopAuto; const nv = Math.max(0, Math.min(100, base + d)); try { localStorage.setItem('loggia-topoffset', String(nv)); } catch {} return nv; });
  const onTopSet = (px) => setTopOffset(() => { const nv = Math.max(0, Math.min(100, Math.round(px))); try { localStorage.setItem('loggia-topoffset', String(nv)); } catch {} return nv; });
  const onTopOffsetReset = () => { setTopOffset(null); try { localStorage.removeItem('loggia-topoffset'); } catch {} };
  return { onMode, onPickTheme, onFollowHa, toggle, navOpen, setNavOpen, tactile, navbar, fondPhotoActif, ficheDemo, setFicheDemo, ambient, onAmbient, ambPlage, onAmbPlage, plageOk, idle, retourAcc, onRetourAcc, wxFx, onToggleWxFx, onToggleNavbar, navOffset, topOffset, safeEff, safeTopEff, onNavOffset, onNavSet, onNavOffsetReset, onTopOffset, onTopSet, onTopOffsetReset };
}

function useAssistantApp({ editMode, hass, view }) {
  // Édition en place des vues intégrées : sheet « Entités de cette vue » (crayon actif + vue configurable).
  const [entSheet, setEntSheet] = useState(false);
  /* L'assistant : le bouton n'apparait que si un nom est regle ET que le
   * composant repond. Une popup qui s'ouvre sur « indisponible » ne vaut pas
   * mieux qu'un bouton absent. */
  const { cle: assistantNs, attente: assistantAttendu } = useAssistant(hass);
  const [assistantOuvert, setAssistantOuvert] = useState(false);
  /* Ce qui a ete dicte au bouton, en attendant que la conversation s'ouvre.
   * L'appui long ecoute AVANT que la popup existe : la phrase doit donc
   * l'attendre quelque part, et partir des qu'elle est la. */
  const [questionVocale, setQuestionVocale] = useState('');
  const poserQuestion = (dit) => { setQuestionVocale(dit); setAssistantOuvert(true); };
  useEffect(() => { setEntSheet(false); }, [view, editMode]);
  return { entSheet, setEntSheet, assistantNs, assistantAttendu, assistantOuvert, setAssistantOuvert, questionVocale, setQuestionVocale, poserQuestion };
}

function useComptesApp({ applyUser, haAdmin, hass, persistUsers, userIdx, users }) {
  const addUser = (data) => persistUsers([...users, { ...data, _k: 'u' + Date.now() }]);
  const updateUser = (i, data) => persistUsers(users.map((u, j) => j === i ? { ...u, ...data } : u));
  const deleteUser = (i) => { if (users[i] && users[i].role === 'Admin' && users.filter(u => u.role === 'Admin').length <= 1) return; const a = users.filter((_, j) => j !== i); persistUsers(a); if (i === userIdx) applyUser(0); else if (i < userIdx) applyUser(userIdx - 1); };
  // Auto-détection : au 1er chargement, sélectionne le profil Loggia correspondant à l'utilisateur HA connecté
  // (selon l'appareil/login). Ne s'exécute qu'une fois → un switch manuel dans Loggia reste prioritaire ensuite.
  const autoUserRef = useRef(false);
  useEffect(() => {
    if (autoUserRef.current) return;
    const hu = hass && hass.user;
    // Tant que les profils ne sont pas charges, il n'y a rien a rapprocher :
    // lever le drapeau ici figerait l'appareil sur le premier profil venu.
    if (!hu || !users.length) return;
    const i = matchHaUser(hu, users);
    if (i < 0) return;
    autoUserRef.current = true;
    // Premiere reconnaissance par le nom : on grave le lien, les fois
    // suivantes passeront par l'identifiant.
    // Le lien profil <-> compte est une ecriture de MAISON. Depuis un compte
    // ordinaire elle partait autrefois dans une section privee, ou elle
    // masquait ensuite toute la liste des profils : c'est ce qui figeait
    // une tablette sur des roles perimes. Le serveur la refuse maintenant ;
    // on ne la tente donc que depuis un compte qui a le droit de l'ecrire.
    // Le lien profil <-> compte s'enregistre au SERVEUR désormais, pour tout
    // compte (`loggia/profils/moi`, ADR 0276) : réécrire ici la liste entière
    // pouvait effacer un profil qu'il venait de créer.
    /* Le COMPTE fait foi (19/10, ADR 0220 corrigée) : « quand je me connecte,
     * ça me met sur Administrateur au lieu de Guillaume — ça doit suivre le
     * profil avec lequel on est connecté à Home Assistant ». Le 17/10, la
     * reconnaissance avait été réservée aux écrans neufs : un écran déjà
     * connu restait sur sa fiche. Un compte relié à un profil ouvre désormais
     * ce profil à CHAQUE ouverture, comme Home Assistant ; seul un compte
     * relié à aucun profil (la tablette familiale) garde le choix de l'écran. */
    /* La reconnaissance ne PROUVE pas le code (24/09). Depuis l'ADR 0080, le
     * composant refuse d'ecrire `loggia_active_user` vers un profil Admin sans
     * laissez-passer : tenter ici aurait fait apparaitre un refus au demarrage,
     * sans que personne ait rien demande. Un compte administrateur Home
     * Assistant, lui, n'a rien a prouver. Un repli refuse, il n'elargit pas
     * (ADR 0079) : on reste sur le profil en cours, et la bascule se fait a la
     * main, par le code. */
    if (!haAdmin && String(users[i].role || '').toLowerCase() === 'admin') return;
    applyUser(i);
  }, [hass, users, haAdmin]);
  // Retour haptique léger au tap sur un élément interactif (Android ; iOS web n'expose pas vibrate → seul le rebond visuel s'affiche).
  // Vibre au pointerup si le doigt n'a presque pas bougé — poser le doigt pour scroller ne doit PAS vibrer.
  useEffect(() => {
    const sel = 'button,.o-nav-item,.o-piece,.o-light-card,.o-scene-room,[role="switch"],[role="button"]';
    let start = null;
    const onDown = (e) => { try { start = (e.target && e.target.closest && e.target.closest(sel)) ? { x: e.clientX, y: e.clientY } : null; } catch { start = null; } };
    const onUp = (e) => { try { if (start && navigator.vibrate && Math.abs(e.clientX - start.x) < 10 && Math.abs(e.clientY - start.y) < 10) navigator.vibrate(8); } catch {} start = null; };
    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointerup', onUp, { passive: true });
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('pointerup', onUp); };
  }, []);
  return { addUser, updateUser, deleteUser };
}

function useOnboardingApp({ discovery, hass, loggiaRuntime, saveCfg, serverCfg, view }) {
  // Premier lancement : montre une seule fois, et seulement quand la decouverte
  // a repondu — sinon il annoncerait « 0 entite trouvee ».
  /* Le diagnostic (health.js) en DIRECT pour la carte « A surveiller » :
   * celui de la decouverte est un instantane du demarrage — une passerelle
   * revenue en ligne y resterait hors service. Recalcule a chaque sondage,
   * mais sur l'Accueil seulement. Place ici, apres `view`, `hass` et
   * `discovery` : plus haut, le memo lisait une constante avant sa
   * declaration — ecran d'erreur, vu en demo. */
  const santeAccueil = useMemo(
    () => (view === 'accueil' && discovery.devices && discovery.index) ? healthReport(discovery.devices, { states: (hass && hass.states) || {}, meta: discovery.index.entityMeta }) : null,
    [view, discovery.devices, discovery.index, hass]
  );
  const onboarded = serverCfg.loggia_onboarded != null || readLS('loggia_onboarded', null) != null;
  /* Le premier lancement n'ecrit que la configuration de la maison — les
   * pieces, l'alarme, la meteo, et sa propre marque (03/10). Un compte Home
   * Assistant ordinaire n'en garderait rien : il ne le voit pas, et attend
   * qu'un administrateur l'ait fait. */
  const showOnboarding = !onboarded && loggiaRuntime.ready && !compteOrdinaire(hass);
  const closeOnboarding = (patch) => saveCfg({ ...(patch || {}), loggia_onboarded: CONFIG_VERSION });
  return { santeAccueil, showOnboarding, closeOnboarding };
}

export { matchHaUser, useConnexionApp, useToastApp, useMeteoApp, useAccueilApp, useJournalApp, useReglagesEcran, useAssistantApp, useComptesApp, useOnboardingApp };
