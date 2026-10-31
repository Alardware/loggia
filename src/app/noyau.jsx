/* Le socle des cartes et des fiches : le pont Home Assistant (`useHass`), les nombres, le lavis, les prises, les capteurs et les plantes lus par la découverte.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useRef, useState, useMemo, useEffect } from 'react';
import { LOGGIA_INDEX, normRooms, cfgVal, iconesCfg, cfgSet, loggiaEnt, LOGGIA_RESOLVED, getHass, switchLights } from '../state.js';
import { sansAccents } from '../outils.js';
import { LAVIS, lav } from '../theme.js';
import { wattsDe } from '../unites.js';
import { interrupteurDeModule, modulesHorsSaisie } from '../resolve.js';
import { REDUCE_MOTION, cvName, cvId, HX_TOKENS } from '../ui.jsx';
import { compteursMaison, estPrise, estPontZigbee } from '../prises.js';
import { useEtatPrises, gardeDeSwitch } from '../prisesetat.js';
import { plantesMaison } from '../plantes.js';
import { filtresObjet } from '../objets.js';
import { estSirene } from '../attention.js';
import { nombre } from '../format.js';
import { croqHaids, plantsCfg } from '../lectures.js';
import { trouverDistributeur, lireDistributeur, TABLES as TABLES_DISTRIBUTEUR } from '../distributeur.js';
import { Ico } from '../icones.jsx';
import { lireCalendriers, garderDansFenetre } from '../agenda.js';
import { comparerTextes, tr, locale } from '../i18n.js';

// Le mode clair, lu sur la racine : les couleurs d'appareils s'y assombrissent.
const estClair = () => typeof document !== 'undefined' && document.documentElement.classList.contains('loggia-light');
// Decimales a la francaise partout : un Americain ou un Polonais lisait un
// nombre ecrit dans une convention qui n'est pas la sienne. `nombre`
// (format.js) choisit la virgule ou le point selon la langue active : UNE
// fonction pour tout l'ecran, testee (tests/nombres_langue). Les `toFixed` et
// les arrondis faits a la main qui restaient posaient encore le point en
// francais (audit du 03/10).
const dec = (n, d) => nombre(n, d);
// Meme chose, sans forcer les decimales a zero : 21 reste « 21 », pas « 21,0 ».
const decMax = (n, d) => nombre(n, d, 0);
// ── Animations lot 4 ──
// useFlash() : déclenche un halo bref sur une carte (retour visuel après une action) via classe CSS .o-flash
function useFlash() {
  const ref = useRef(null);
  const flash = (color) => {
    const el = ref.current; if (!el || REDUCE_MOTION) return;
    if (color) el.style.setProperty('--o-flash', color);
    el.classList.remove('o-flash'); void el.offsetWidth; el.classList.add('o-flash');
  };
  return [ref, flash];
}

/* Les teintes qui identifient une piece.
 *
 * `tc` — la couleur du releve de temperature — pointait sur `--o-warn2`
 * pour la Cuisine et le Bureau. C'est la couleur d'AVERTISSEMENT : elle ne
 * disait rien de ces deux pieces, seulement que leur teinte d'origine etait
 * un orange proche. Elle suit maintenant la teinte de la piece, comme les
 * autres — une cuisine n'est pas une alerte.
 *
 * Elles ne decorent pas : elles permettent de reconnaitre une carte sans la
 * lire. C'est pourquoi elles ne suivaient AUCUN theme — et c'est aussi
 * pourquoi elles doivent pouvoir en suivre un, quand ce theme n'a qu'une
 * teinte. Chacune passe donc par un jeton, dont le defaut est exactement la
 * couleur d'avant : sans surcharge, rien ne bouge.
 *
 * Trois valeurs etaient ecrites en dur A COTE de leur jeton — le lavis de la
 * Chambre restait violet quand son icone suivait `--o-purple`, celui de la
 * Salle de bain bleu clair quand l'icone suivait `--o-cyan`. Invisible tant
 * qu'aucun theme ne les deplacait ; voyant des le premier qui le fait. */
/* Le lavis d'une carte de piece, au degrade de la maquette v2 : la teinte
 * descend du HAUT et ne s'eteint pas tout a fait (5 % a 72 %), au lieu de
 * traverser en biais et de disparaitre a 62 %. La carte en sort franchement
 * teintee au lieu de delavee — c'etait le plus gros ecart a l'oeil entre la
 * maquette et le rendu.
 *
 * La teinte ne parait QUE sur une piece allumee. Elle baignait la surface en
 * permanence depuis le 31/08 ; sur ses captures, Bureau, Entree et Salle de
 * bain etaient colores alors qu'ils affichent « tout est eteint ». La maquette
 * les laisse gris, et la couleur redevient un signal.
 *
 * `p.rgb` manque sur les modeles ecrits en dur et sur ceux de la demo, qui ne
 * portent qu'un `bg` deja compose : le « r,g,b » s'y relit, sans quoi la demo
 * perdrait toutes ses couleurs. */
const SURF_CARTE = 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))';
/* LE lavis d'une carte teintee, pour toute la maison (theme v2).
 *
 * `teinte` est soit un « r,g,b » (ou un `var(--o-…-rgb)`), soit une fonction
 * qui rend une couleur a partir d'une alpha — les cartes qui partent d'un hex
 * passent leur `hx`. Sans teinte, SURF_CARTE : c'est la carte au repos, que la
 * maquette laisse grise. */
function lavisCarte(teinte, base = .2, bas = base / 4) {
  if (!teinte || !LAVIS) return SURF_CARTE;
  const f = typeof teinte === 'function' ? teinte : (a) => `rgba(${teinte},${a})`;
  return `linear-gradient(180deg,${f(lav(base))},${f(lav(bas))} 72%), ${SURF_CARTE}`;
}

/* ════════════ VUE PIÈCE (navigable depuis l'Accueil) ════════════
   Rassemble les appareils d'une pièce en matchant le nom de la pièce dans l'entity_id / friendly_name.
   Une pièce plus spécifique gagne : « Chambre enfant » n'atterrit pas dans « Chambre ». */
const rmNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/* ── Qu'est-ce qu'une prise (chantier Prises, P1, § 6.4) ──────────────────────
 *
 * La règle vit dans prises.js (`estPrise`, le jumeau du serveur) ; ici, ce
 * qu'elle lit : l'entité, son appareil et ses sœurs, d'après l'index de Loggia
 * et les états. Les sœurs d'un appareil se rangent une fois par index — sans
 * cela, chaque switch de la maison parcourait tout le registre à chaque rendu.
 * Le nom d'une entité : celui de son état, sinon celui du registre. */
const SOEURS_PAR_INDEX = new WeakMap();
function soeursDe(id) {
  const t = LOGGIA_INDEX && LOGGIA_INDEX.entityMeta;
  const m = t && t.get(id);
  if (!m || !m.deviceId) return [];
  let parAppareil = SOEURS_PAR_INDEX.get(t);
  if (!parAppareil) {
    parAppareil = new Map();
    t.forEach((x, e) => { if (!x || !x.deviceId) return; const l = parAppareil.get(x.deviceId); if (l) l.push(e); else parAppareil.set(x.deviceId, [e]); });
    SOEURS_PAR_INDEX.set(t, parAppareil);
  }
  return (parAppareil.get(m.deviceId) || []).filter(e => e !== id);
}
/** L'appareil d'une entité, tel que la règle le lit : son fabricant, son modèle et son nom (dont les mots ne départagent pas
 *  deux sorties, `estPrise`), ou `null`. */
function appareilDe(id) {
  const m = LOGGIA_INDEX && LOGGIA_INDEX.entityMeta && LOGGIA_INDEX.entityMeta.get(id);
  const dev = m && m.deviceId && LOGGIA_INDEX.deviceMeta ? LOGGIA_INDEX.deviceMeta.get(m.deviceId) : null;
  return dev ? { fabricant: dev.manufacturer, modele: dev.model, nom: dev.name } : null;
}
/* Les compteurs de la maison (`compteursMaison`, prises.js ; décision du 19/10) : ceux que le tableau de bord Énergie
 * déclare sources. Calculés UNE fois par préférences lues (`poserCompteursMaison`, à chaque runtime), pas à chaque switch. */
let PREFS_MAISON = null, COMPTEURS_MAISON = null;
function poserCompteursMaison(prefs) {
  if (prefs === PREFS_MAISON) return;
  PREFS_MAISON = prefs;
  COMPTEURS_MAISON = prefs ? new Set(compteursMaison(prefs)) : null;
}
/* Les entrées de la règle, comme les lit le jumeau du serveur (plan 1, « Les
 * entrées, côté écran ») : la classe du REGISTRE — l'attribut de l'état pour
 * une entité hors registre —, sa catégorie, et le nom affiché, sinon celui du
 * registre, sinon rien. */
function lirePrise(S, id) {
  const t = LOGGIA_INDEX && LOGGIA_INDEX.entityMeta;
  const decrire = (e) => {
    const m = t && t.get(e);
    const a = (S[e] && S[e].attributes) || {};
    return { entity_id: e, device_class: (m ? m.deviceClass : a.device_class) || null, entity_category: (m && m.category) || null, nom: a.friendly_name || (m && m.name) || '' };
  };
  return { entite: decrire(id), appareil: appareilDe(id), soeurs: soeursDe(id).map(decrire) };
}
/** `{ prise, puissance, energie }` d'une entité : seul un switch peut être une prise. */
function priseDe(S, id) {
  if (String(id).indexOf('switch.') !== 0) return { prise: false, puissance: null, energie: null };
  return estPrise({ ...lirePrise(S || {}, id), lumiere: cvEstLumiere(id), filPilote: interrupteurDeModule(LOGGIA_INDEX, id), sirene: estSirene(id, (S || {})[id]), compteurs: COMPTEURS_MAISON });
}
/** L'index de la découverte est-il lu ? Tant qu'il ne l'est pas, `priseDe` ne reconnaît AUCUNE prise (ni appareil, ni sœurs, ni capteur) :
 *  un switch dont on ne sait pas encore s'il en est une. */
const indexLu = () => !!(LOGGIA_INDEX && LOGGIA_INDEX.entityMeta);
/**
 * Ce que couper à la main un `switch.` doit DEMANDER, et s'il est une prise (relecture finale, F2, F3) : la règle de
 * `gardeDeSwitch` (prisesetat.js), avec ce que l'écran sait ici — l'index (`priseDe`) et l'état des prises. L'état se
 * SUIT tant que la garde en dépend : une prise reconnue, ou un switch que l'index ne connaît pas encore (le
 * chargement, que l'état aura bientôt tranché) ; un switch ordinaire ne s'abonne à rien. `actif` faux : ni garde ni
 * abonnement — la compacte d'une prise a déjà la sienne (`useVuePrise`). Rend `{ prise, garde }`.
 */
function useGardeSwitch(S, id, actif = true) {
  const sw = actif && String(id).indexOf('switch.') === 0 && !cvEstLumiere(id);
  const prise = sw && priseDe(S, id).prise;
  const lu = indexLu();
  const lecture = useEtatPrises(sw && (prise || !lu));
  return { prise, garde: sw && gardeDeSwitch(lecture, id, { reconnue: prise, indexLu: lu }) };
}
/** Les filtres d'Objets d'une ENTITÉ, tels que « Ajouter une carte » les range (relecture finale, A5) :
 *  comme Objets, avec la règle des prises — sans elle, le NAS, le PC et le lave-vaisselle passaient
 *  sous IoT, et la puce « Prises » disparaissait du composeur. */
function filtresEntite(S, id) {
  const dom = String(id).slice(0, String(id).indexOf('.'));
  const classe = ((S[id] && S[id].attributes) || {}).device_class || '';
  return filtresObjet({ domaine: dom, estLumiere: cvEstLumiere(id), estPrise: dom === 'switch' && !cvEstLumiere(id) && priseDe(S, id).prise, classe });
}
/** Un switch qui n'a de carte ni dans Objets ni dans une pièce : le pont de Zigbee2MQTT ('pont' :
 *  Paramètres › Interrupteurs), une sirène ('sirene' : Sécurité) — sinon `null`. */
function ecartDe(S, id) {
  if (String(id).indexOf('switch.') !== 0) return null;
  if (estPontZigbee(appareilDe(id))) return 'pont';
  return estSirene(id, (S || {})[id]) ? 'sirene' : null;
}
/** Les switch écartés de la maison, ceux que montrerait Objets : `[{ id, nom, ou }]`, le pont d'abord. */
function switchsEcartes(S) {
  const meta = (id) => (LOGGIA_INDEX && LOGGIA_INDEX.entityMeta && LOGGIA_INDEX.entityMeta.get(id)) || {};
  return Object.keys(S || {}).filter(id => id.indexOf('switch.') === 0 && !meta(id).hidden && !meta(id).disabled && !meta(id).category)
    .map(id => ({ id, nom: cvName(S[id], id), ou: ecartDe(S, id) })).filter(e => e.ou)
    .sort((a, b) => (a.ou === b.ou ? comparerTextes(a.nom, b.nom) : a.ou === 'pont' ? -1 : 1));
}
/** « Plus ici : Zigbee2MQTT Bridge Permit join (Paramètres › Interrupteurs) et Alarme sirène Siren on (Sécurité). » */
function noteEcartes(ecartes) {
  const morceaux = ecartes.map(e => tr(e.ou === 'pont' ? '{nom} (Paramètres › Interrupteurs)' : '{nom} (Sécurité)', { nom: e.nom }));
  let liste = morceaux.join(', ');
  try { liste = new Intl.ListFormat(locale(), { type: 'conjunction' }).format(morceaux); } catch { /* Safari 14.0 : la virgule */ }
  return tr('Plus ici : {liste}.', { liste });
}
/* La pièce de Loggia d'une entité (C17, 16/10) : celle que sa zone Home Assistant désigne — par son nom, comme la vue d'une pièce
 * (`roomEntitiesBrutes`) ; '' sans zone du tout ; null dans une zone que Loggia ne compte pas parmi ses pièces (« network »). */
function pieceLoggiaDe(id) {
  const z = LOGGIA_INDEX && typeof LOGGIA_INDEX.areaNameOf === 'function' ? LOGGIA_INDEX.areaNameOf(id) : null;
  if (!z) return '';
  const p = normRooms(cfgVal('loggia_rooms', null)).find(r => rmNorm(r.room) === rmNorm(z));
  return p ? p.room : null;
}
const NOMS_GROUPES = () => ({ ouvertures: tr('Ouvertures'), securite: tr('Sécurité'), presence: tr('Présence'), piles: tr('Piles') });

/** Un `climate` se pilote par ses modes HVAC ; le reste par son `input_select`. */
function estClimate(zone) {
  return !!zone && (zone.type === 'thermostat' || zone.type === 'stove'
    || String(zone.haid || '').indexOf('climate.') === 0);
}

/* La FAMILLE d'un mode, devinee sur son nom, pour choisir une couleur et une
 * icone. Jamais pour commander : un mode non reconnu reste pilotable, il sort
 * seulement dans la teinte neutre. */
function pilotFamille(option) {
  const s = String(option || '').toLowerCase();
  if (/arr[eê]t|^off$|aus|apagado|spento|uit/.test(s)) return 'off';
  if (/hors.?gel|frost|antihielo|antigelo/.test(s)) return 'horsgel';
  if (/[ée]co/.test(s)) return 'eco';
  if (/confort|comfort|komfort/.test(s)) return 'confort';
  return null;
}
/** Le glyphe choisi pour cette entité, ou `null` — rien n'est deviné ici. */
function iconeChoisie(id) {
  const v = iconesCfg()[id];
  if (typeof v === 'string' && v) return v;
  // Depuis le style PLEIN (29/09), une entree peut etre un objet `{ n, s }`.
  return (v && typeof v === 'object' && typeof v.n === 'string' && v.n) ? v.n : null;
}

/* UN segment, pas deux boutons (captures du 29/09).
 *
 * Deux boutons cote a cote, chacun avec son liseré et un écart entre eux, se
 * lisent comme deux réglages. Un segment, c'est UN rail — un seul bord, un seul
 * fond — et la moitié choisie posée dedans, en accent plein. C'est la forme des
 * captures, pour « Trait / Plein » comme pour « Simple / Double ».
 *
 * `grandir` : le segment prend toute la largeur, comme celui de LARGEUR. */
/* Un groupe de puces exclusives. Le fond est le PUITS : un groupe segmenté est
 * un rail creusé dans lequel la pastille choisie glisse, et le bleu plein
 * (`--o-accent-fond`) y ressort. Même fond pour tous les groupes de Loggia —
 * ils portaient trois gris différents avant le thème v2. */
/* `compact` (20/10) : les icones seules, le mot en aria-label et en title —
 * au telephone, « Cartes / Plan » partage sa ligne avec les etages. */
function Segment({ value, options, onChange, grandir = false, label = null, compact = false }) {
  return (
    <div role="group" aria-label={label || undefined}
      style={{ display: grandir ? 'flex' : 'inline-flex', width: grandir ? '100%' : undefined, boxSizing: 'border-box', padding: 3, gap: 3, borderRadius: 12, background: 'var(--o-well)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
      {options.map(o => { const on = o.id === value; return (
        <button key={String(o.id)} aria-pressed={on} aria-label={compact ? o.label : undefined} title={compact ? o.label : undefined} onClick={() => { if (!on) onChange(o.id); }}
          style={{ flex: grandir ? 1 : undefined, height: grandir ? 38 : 30, padding: compact ? '0 11px' : '0 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: grandir ? 13 : 12.5, fontWeight: 700, background: on ? 'var(--o-accent-fond)' : 'transparent', color: on ? '#fff' : 'var(--o-text2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {o.ico ? <Ico name={o.ico} size={compact ? 15 : 13} /> : null}{compact ? null : o.label}</button>
      ); })}
    </div>
  );
}

/* Le nom d'une cle, quelle qu'elle soit : « Distributeur », le nom de la
 * plante, celui de la zone fil pilote, sinon le nom de l'entite. */
function nomDeCle(S, k) {
  const s = String(k || '');
  if (s === 'obj:feeder') return tr('Distributeur');
  if (s === 'obj:borne') return tr('Borne de recharge');
  if (s.indexOf('plant:') === 0) { const p = plantesDeLaMaison(S).find(x => x.base === s.slice(6)); return (p && p.nom) || s.slice(6); }
  if (s.indexOf('groupe:') === 0) return NOMS_GROUPES()[s.slice(7)] || s.slice(7);
  if (s.indexOf('zone:') === 0) { const z = climateZones(S || {}).find(x => x.id === s.slice(5)); return z ? (z.name || z.room || z.id) : s.slice(5); }
  return cvName(S && S[s], s);
}

/**
 * Cartes par domaine, et leurs feuilles de detail.
 *
 * Le user veut dans Lumieres et Climat exactement les cartes d'une piece. Une
 * seule definition, un seul comportement, un seul endroit a corriger — et les
 * feuilles voyagent avec, sinon chaque vue redeclarerait les cinq etats.
 *
 */
/* ── FICHE APPAREIL UNIVERSELLE ──────────────────────────────────────────────
 * Une seule fiche pour n'importe quel appareil, chez n'importe qui. Rien n'est
 * écrit pour un modèle précis : les entités SŒURS du même appareil (registre)
 * se rendent par leur domaine — number = stepper, select = chips, switch =
 * interrupteur, button = bouton, sensor = ligne de valeur. Les entités de
 * catégorie `config` forment le bloc Réglages, les `diagnostic` se replient.
 * Les domaines pilotables (lumière, climat, volet…) gardent leur carte riche
 * en tête : c'est CvCard qui sait déjà les piloter. */
const FICHE_PILOTABLES = ['climate', 'vacuum', 'lawn_mower', 'light', 'cover', 'media_player', 'alarm_control_panel', 'lock', 'fan', 'switch', 'valve', 'humidifier', 'water_heater'];

/* ── ÉPINGLES : la curation par l'usage ──────────────────────────────────────
 * Le schéma générique montre tout au même niveau ; l'épingle laisse le foyer
 * dire ce qui compte. Une entité épinglée remonte en tête de fiche ET s'invite
 * sur la carte de son appareil. Partagé maison via la configuration (cfgSet). */
const lireEpingles = () => { const v = cfgVal('loggia_epingles', null); return Array.isArray(v) ? v : []; };
/* Épingler ou désépingler — en RELISANT la maison au moment d'écrire.
 *
 * Trois écrans posaient la punaise, chacun avec sa copie de la liste prise à
 * l'ouverture. Deux fiches ouvertes, une épingle ajoutée dans l'une : la
 * seconde écrivait ensuite sa liste d'avant, et l'épingle disparaissait sans
 * un mot. L'état local reste, pour que la punaise réponde tout de suite ; mais
 * ce qui part vers la maison se calcule sur ce que la maison a, pas sur ce
 * qu'un écran croyait avoir.
 *
 * Un favori peut être une chaîne (carte compacte) ou une entrée typée
 * `{t, id}` depuis que la section s'édite : on compare donc l'ENTITÉ, jamais
 * l'entrée. */
function basculerEpingle(id) {
  const eps = lireEpingles();
  const suiv = eps.some(x => cvId(x) === id) ? eps.filter(x => cvId(x) !== id) : eps.concat(id);
  cfgSet({ loggia_epingles: suiv.length ? suiv : null });
  return suiv;
}

/* Le distributeur existe dès qu'un champ de Paramètres désigne quelque chose
 * (ADR 0155, 05/10) : le réservoir ou la portion comme avant, et désormais son
 * APPAREIL, sa commande (`haid`) ou son script — un Petlibro n'a pas de
 * réservoir en grammes (« adapté à tous », ADR 0133). La même règle fait
 * exister sa carte dans Objets et dans la bibliothèque du composeur. */
function distributeurConfigure() {
  const c = loggiaEnt('feeder', null);
  const id = (v) => typeof v === 'string' && v.trim().indexOf('.') > 0;
  if (c && typeof c === 'object') {
    const croq = croqHaids();
    if (!!(croq.reservoir || croq.portionWeight) || id(c.haid) || id(c.script) || (typeof c.appareil === 'string' && c.appareil.trim() !== '')) return true;
  }
  /* RIEN DE DESIGNE, MAIS UN APPAREIL QUI EN EST UN (07/10). Le distributeur
   * etait le dernier a n'exister que par sa fiche : une maison dont Home
   * Assistant connait le distributeur n'en voyait aucune trace tant qu'on
   * n'avait pas nomme une entite a la main. */
  return !!trouverDistributeur(LOGGIA_INDEX);
}

/* ── Agenda de l'accueil ──────────────────────────────────────────────────────
 * Les prochains evenements de TOUS les `calendar.*`, fusionnes. Zero
 * configuration : pas de calendrier chez vous, pas de carte. Les evenements ne
 * se poussent pas : l'API calendrier de HA est un GET — on relit au montage,
 * puis toutes les quinze minutes, et quand un calendrier apparait ou disparait. */
/* `plage` : { debut, fin } pour lire un mois entier au lieu des sept jours
 * qui suffisent au rail. Sans elle, rien ne change — les appelants d'origine
 * gardent leur fenetre et leur plafond de huit evenements. */
/* `tick` : un compteur que l'appelant incremente pour forcer une relecture.
 *
 * Sans lui, un rendez-vous cree depuis le dashboard n'apparaissait qu'au
 * sondage suivant — un quart d'heure plus tard. On venait de l'ecrire et il
 * n'etait pas la : le geste semblait avoir echoue. */
function useAgenda(hass, seulement = null, plage = null, tick = 0) {
  const [events, setEvents] = useState([]);
  const S = hass && hass.states;
  const seulementSig = seulement ? seulement.join('|') : '';
  const ids = useMemo(() => (seulement && seulement.length) ? seulement : (S ? Object.keys(S).filter(id => id.indexOf('calendar.') === 0) : []), [S, seulementSig]);
  const sig = ids.join('|');
  const api = hass && hass.callApi ? hass.callApi.bind(hass) : null;
  const apiPret = api ? 1 : 0;
  const plageDebutMs = plage ? plage.debut.getTime() : 0;
  const plageFinMs = plage ? plage.fin.getTime() : 0;
  useEffect(() => {
    if (!api || !sig) { setEvents([]); return; }
    let mort = false;
    /* Une panne garde l'agenda, et se relit vite (audit du 03/10). Un
     * redémarrage de HA ou un Wi-Fi coupé au mauvais moment faisait échouer
     * chaque GET : la liste retombait vide et la carte disait « Rien de prévu »
     * un quart d'heure durant. Quand AUCUN calendrier n'a répondu
     * (`lireCalendriers` rend `null`), on garde ce qui était montré — tant que
     * c'est encore dans la fenêtre — et l'on relit trente secondes plus tard ;
     * un calendrier qui répond vide, lui, reste vide. Dix essais au plus, cinq
     * minutes : un agenda seul et cassé pour de bon ne se relit pas deux fois
     * par minute toute la journée, le sondage du quart d'heure reprend
     * ensuite. Un rafraîchissement d'AFFICHAGE, rien n'est commandé chez HA :
     * un minuteur d'onglet suffit, un seul à la fois, annulé au démontage. */
    let reessai = null, essais = 0;
    const lire = async () => {
      clearTimeout(reessai);
      const debut = plage ? plage.debut : (() => { const d = new Date(); d.setSeconds(0, 0); return d; })();
      // Sept jours de CALENDRIER : à l'automne, sept fois 24 h s'arrêtent une heure trop tôt.
      const fin = plage ? plage.fin : (() => { const f = new Date(debut); f.setDate(f.getDate() + 7); return f; })();
      const liste = sig.split('|');
      const tous = await lireCalendriers(api, liste, debut, fin);
      if (mort) return;
      if (tous === null) {
        // Même liste, même objet : pas de nouveau rendu tant que rien n'est sorti de la fenêtre.
        setEvents(avant => { const g = garderDansFenetre(avant, liste, debut, fin); return g.length === avant.length ? avant : g; });
        // Le sondage parti pendant un réessai échoue aussi : un seul minuteur reste en attente.
        clearTimeout(reessai);
        if (essais++ < 10) reessai = setTimeout(lire, 30 * 1000);
        return;
      }
      essais = 0;
      setEvents(plage ? tous : tous.slice(0, 8));
    };
    lire();
    const iv = setInterval(lire, 15 * 60000);
    return () => { mort = true; clearInterval(iv); clearTimeout(reessai); };
  }, [apiPret, sig, plageDebutMs, plageFinMs, tick]);
  return events;
}

// Formateur puissance UNIQUE (harmonisation 20/08) : virgule FR, kW à 2 décimales, « — » si valeur absente
const hx = (hex, a) => { if (HX_TOKENS[hex]) return `rgba(var(${HX_TOKENS[hex]}),${a})`; if (typeof hex !== 'string' || hex[0] !== '#') return `rgba(var(--o-text3-rgb),${a})`; const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
// Zones de chauffage : configuration de l'utilisateur (elle seule sait décrire
// un radiateur sur des aides), complétée des modules fil pilote découverts ;
// sans elle, les thermostats et les modules trouvés par la découverte.
/** Une piece est-elle dehors ?
 *
 * Home Assistant ne le dit nulle part : ni les zones ni les appareils ne portent
 * cette notion. Le nom est le seul indice, et il etait compare au seul mot
 * « Exterieur » — chez un anglophone, son jardin entrait dans la moyenne des
 * temperatures interieures. Le motif couvre les langues de Loggia et les mots
 * les plus courants.
 * Les SEPT langues, sans accents (chantier Capteurs, C15 : dehors, la table ne
 * juge que le vent et les particules) : « Tuin », « Giardino », « Jardín »,
 * « Ogród », « Terrace », « Taras », « Buiten » ou « Na zewnątrz » passaient pour
 * des pièces — le vocabulaire de `PARENTE`, et les mots du dehors des langues
 * qui n'en avaient pas. */
/* Élargie le 19/10 (audit, M15 ; décision D5 — deviner d'abord) : la cour, le potager, la piscine, l'allée, le porche, le carport, dans
 * les sept langues (« Backyard », « Hof », « Oprit », « Cortile », « Huerto », « Podwórko »…). Un mot COURT ne vaut qu'entier : « cour »
 * n'est pas « couloir ». Un jardin d'hiver, une véranda, une piscine couverte se chauffent : ils restent dedans. Le réglage « Pièce du
 * dehors » de la fiche d'une pièce l'emporte toujours (`dehors`, `loggia_rooms`). « Couvert » ne rentre que la piscine : une terrasse,
 * un balcon couverts restent dehors (relecture du lot 3). */
const DEHORS_MOTS = /exterieur|exterior|outdoor|outside|au[sß]en|draus|jardin|garden|garten|tuin|giardino|ogrod|terras|terrac|terraz|taras|balcon|balkon|patio|esterno|buiten|zewnatrz|dehors|yard|porch|driveway|carport|potager|pelouse|lawn|einfahrt|oprit|cortile|vialetto|huerto|piscin|podwor|podjazd|innenhof|hinterhof/;
const DEHORS_ENTIERS = /(^|[^a-z])(cour|deck|pool|hof|orto|allee|porche|portico)([^a-z]|$)/;
const DEDANS_MOTS = /hiver|winter|inverno|invierno|zimow|veranda|piscin\S* couvert|indoor|innenraum|binnen|interno|interior|cote jardin|vue jardin/;
const DEHORS_CHOISIS = new WeakMap();
function estDehors(nom) {
  const brut = cfgVal('loggia_rooms', null);
  let choix = brut && typeof brut === 'object' ? DEHORS_CHOISIS.get(brut) : null;
  if (brut && typeof brut === 'object' && !choix) {
    choix = new Map((Array.isArray(brut) ? brut : []).filter(r => r && typeof r === 'object' && typeof r.dehors === 'boolean' && r.room).map(r => [rmNorm(r.room), r.dehors]));
    DEHORS_CHOISIS.set(brut, choix);
  }
  const k = rmNorm(nom);
  if (choix && choix.has(k)) return choix.get(k);
  const t = sansAccents(nom);
  return (DEHORS_MOTS.test(t) || DEHORS_ENTIERS.test(t)) && !DEDANS_MOTS.test(t);
}

/** Le capteur d'une plante, reconnu a sa CLASSE plutot qu'a son nom.
 *
 * Les identifiants etaient composes en collant des suffixes francais au prefixe
 * de la plante — `_humidite`, `_conductivite`, `_eclairement`, `_batterie`. Sur
 * une installation qui ne nomme pas ses capteurs ainsi, la vue ne trouvait
 * strictement rien : ni humidite, ni lumiere, ni batterie.
 *
 * Home Assistant classe ces capteurs, et ces classes ne changent pas d'une
 * langue a l'autre. `moisture` designe l'humidite du SOL — a ne pas confondre
 * avec `humidity`, celle de l'air, qu'une plante ne mesure pas.
 *
 * L'unite sert de second recours : toutes les integrations ne renseignent pas
 * `device_class`, mais des µS/cm ne sont jamais autre chose qu'une conductivite.
 */
function plantCapteur(S, base, classe, unite) {
  if (!S || !base) return null;
  const debut = String(base);
  const candidats = Object.keys(S).filter(k => {
    if (k.indexOf(debut) !== 0) return false;
    const reste = k.slice(debut.length);
    return reste === '' || reste.charAt(0) === '_';
  });
  const parClasse = candidats.find(k => {
    const a = S[k].attributes;
    return a && a.device_class === classe;
  });
  if (parClasse) return parClasse;
  if (!unite) return null;
  return candidats.find(k => {
    const a = S[k].attributes;
    return a && a.unit_of_measurement === unite;
  }) || null;
}

/**
 * La piece d'une plante.
 *
 * Une saisie explicite prime : c'est un choix, pas une deduction.
 *
 * A defaut, la zone Home Assistant du capteur — mais SEULEMENT si elle est une
 * piece que Loggia connait. Un capteur de plante est un boitier Bluetooth, et
 * ces boitiers finissent souvent ranges dans une zone d'appareils : sur
 * l'installation de reference, les six capteurs sont dans « Technique » alors
 * que les plantes sont au Sejour. Afficher « Technique » sous un Dracaena est
 * plus faux que de ne rien afficher. La zone n'est donc retenue que quand elle
 * designe un lieu de vie, et elle arrive alors dans la langue de l'utilisateur.
 *
 * Quand personne ne sait, on ne repond pas et la ligne disparait. « Interieur »
 * etait un mot invente, en francais, affiche sous une plante posee dehors
 * aussi bien que dedans.
 */
function plantPiece(S, base, saisie) {
  if (saisie) return saisie;
  const ix = LOGGIA_INDEX;
  if (!ix || !ix.areaNameOf) return null;
  const pieces = normRooms(cfgVal('loggia_rooms', null)).map(r => rmNorm(r.room));
  if (!pieces.length) return null;
  const classes = ['moisture', 'temperature', 'conductivity', 'illuminance', 'battery'];
  for (let i = 0; i < classes.length; i++) {
    const id = plantCapteur(S, base, classes[i]);
    const nom = id ? ix.areaNameOf(id) : null;
    if (nom && pieces.indexOf(rmNorm(nom)) >= 0) return nom;
  }
  return null;
}

/* Ce que l'index sait d'une entité, pour les groupes et les plantes (chantier Capteurs, étapes 2 et 3 ; groupes.js, plantes.js) :
 * son registre ; si son appareil est PHYSIQUE — un appareil du registre qui n'est pas un service (C14) ; ses sœurs ; sa pièce
 * de Loggia (C17 : '' hors d'une pièce de Loggia) ; le nom de son appareil. */
/* Une entité masquée ou désactivée (l'index) : l'Accueil ne la compte pas, comme Objets (audit du 19/10, M14). */
const masqueDe = (id) => { const m = LOGGIA_INDEX && LOGGIA_INDEX.entityMeta && LOGGIA_INDEX.entityMeta.get(id); return !!m && (m.hidden || m.disabled); };
function ctxCapteurs() {
  const em = LOGGIA_INDEX && LOGGIA_INDEX.entityMeta, dm = LOGGIA_INDEX && LOGGIA_INDEX.deviceMeta;
  return {
    meta: (id) => (em && em.get(id)) || {},
    physique: (d) => { const x = d && dm ? dm.get(d) : null; return !!x && x.entryType !== 'service'; },
    soeurs: soeursDe,
    piece: (id) => pieceLoggiaDe(id) || '',
    appareil: (id) => { const m = em && em.get(id); return (m && m.device) || null; },
  };
}
/* Les plantes de la maison (C29) : celles qui se découvrent, complétées par `loggia_plants`, puis les bases configurées sans
 * appareil connu — une liste, que lisent Objets, la fabrique, le composeur, `nomDeCle` et les clés suivies. Lue une fois par relevé
 * de la maison, par index, par configuration et par langue, comme les membres des groupes et les piles (`MEMBRES_LUS`, `PILES_LUES`) :
 * `plantKeys()` la demandait à chaque rendu de l'App, de chaque carte de plante et de `jugerObjet`, et triait tout `S` à chaque fois
 * (passe bis du 17/10, point 6). */
let PLANTES_LUES = null;
function plantesDeLaMaison(S) {
  // `plantsCfg()` rend un tableau neuf à chaque appel : c'est son CONTENU (quelques lignes) qui fait la clé, pas son identité.
  const cfg = plantsCfg(), cle = JSON.stringify(cfg) + '|' + locale();
  if (!PLANTES_LUES || PLANTES_LUES.S !== S || PLANTES_LUES.ix !== LOGGIA_INDEX || PLANTES_LUES.cle !== cle) {
    PLANTES_LUES = { S, ix: LOGGIA_INDEX, cle, p: plantesMaison(S || {}, ctxCapteurs(), cfg, comparerTextes) };
  }
  return PLANTES_LUES.p;
}
/** Les capteurs d'une plante : ceux de son appareil, sinon ceux de sa base (une plante configurée sans appareil connu). */
function capteursPlante(S, p) {
  return p.capteurs || { hum: plantCapteur(S, p.base, 'moisture'), cond: plantCapteur(S, p.base, 'conductivity', 'µS/cm'), lux: plantCapteur(S, p.base, 'illuminance', 'lx'),
    temp: plantCapteur(S, p.base, 'temperature'), bat: plantCapteur(S, p.base, 'battery', '%') };
}

function climateZones(S) {
  /* Trois sources, dans cet ordre.
   *
   * `loggia_climate` est ce que l'ecran Parametres → Entites enregistre : il
   * doit primer, sinon une saisie resterait sans effet, masquee par une
   * configuration plus ancienne. `loggia_entities.climate` est justement cette
   * configuration heritee, gardee tant que personne n'a touche a l'ecran.
   * La decouverte ferme la marche : les `climate.*` et les modules fil pilote.
   *
   * Une saisie ne masque plus les modules (plan 2 du chantier Chauffage,
   * choix 3) : ceux qu'elle ne decrit pas la completent. La resolution les
   * range apres `loggia_climate` ; on les reprend ici apres la saisie lue,
   * l'heritee comprise, que la resolution ne connait pas. */
  const saisi = cfgVal('loggia_climate', null);
  const c = (Array.isArray(saisi) && saisi.length) ? saisi : loggiaEnt('climate', null);
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.climate;
  if (Array.isArray(c) && c.length) return c.concat(modulesHorsSaisie(c, r && r.list)).filter(z => z && z.haid && (!S || S[z.haid]));
  if (r && r.available) return r.list;
  return [];
}
const climNum = (S, id) => { const e = S && id && S[id]; if (!e || e.state == null || e.state === 'unknown' || e.state === 'unavailable') return null; const n = parseFloat(e.state); return isNaN(n) ? null : n; };
// Lit l'état live d'une zone depuis HA (température, cible, mode, auto).
const readZone = (S, z) => {
  const out = { ...z };
  const cur = climNum(S, z.tempSensor); if (cur != null) out.current = Math.round(cur * 10) / 10;
  const tgt = climNum(S, z.tempCible); if (tgt != null) out.target = Math.round(tgt * 2) / 2;
  if (estClimate(z)) {
    const st = S && S[z.haid];
    if (st) {
      out.modeBrut = st.state;
      out.mode = st.state === 'off' ? 'off' : (st.state === 'heat' || st.state === 'auto' || st.state === 'heat_cool') ? 'confort' : out.mode;
      const a = st.attributes || {};
      if (cur == null && a.current_temperature != null) out.current = a.current_temperature;
      if (tgt == null && a.temperature != null) out.target = Math.round(a.temperature * 2) / 2;
    }
  } else {
    const me = S && S[z.modeEnt];
    if (me && me.state) {
      // `modeBrut` est l'option a renvoyer telle quelle ; `mode` n'est que sa
      // famille, pour la couleur.
      out.modeBrut = me.state;
      out.mode = pilotFamille(me.state) || me.state;
    }
    const ae = S && S[z.autoEnt]; if (ae) out.auto = ae.state === 'on';
  }
  return out;
};

/* Ce que la carte du distributeur lit, pour le poll des vues (ADR 0155, 05/10) :
 * les entités désignées (réservoir, portion, compteur, commande, script), puis
 * celles de l'appareil qui changent la carte — sa commande (« Distribuer »,
 * le liseré), sa connectivité, « en cours » (Objets.actif), ses compteurs et
 * son capteur du dernier repas (le dernier repas), son capteur du prochain (la
 * prochaine ration) ; et (étape 2 du chantier IoT, 19/10) ses anomalies — la
 * phrase passe à l'ambre — et sa portion, avec son poids — « Distribuer 12 g ».
 * Les automatisations n'y entrent PAS : la fiche les surveille elle-même,
 * l'Accueil n'a pas à les sonder. La capacité du bac est celle que l'aide
 * déclare (`carteDistributeur`), à défaut 1 500 g.
 * La connectivité se reconnaît par la règle d'`enLigne` (TABLES), pas une
 * copie : la clé `online` d'une intégration en majuscules lui échappait, et le
 * liseré n'arrivait qu'au tic suivant d'une autre entité (contradicteur, 05/10). */
const croqKeys = () => {
  const conf = loggiaEnt('feeder', null);
  const c = conf && typeof conf === 'object' ? conf : {};
  const base = [...Object.values(croqHaids()), c.haid, c.script];
  if (!distributeurConfigure()) return base.filter(x => typeof x === 'string' && x !== '');
  const lu = lireDistributeur(LOGGIA_INDEX, (getHass() || {}).states || {}, conf);
  const connectivite = lu.soeurs.filter(x => x.domaine === 'binary_sensor' && (x.classe === 'connectivity' || TABLES_DISTRIBUTEUR.CLES_CONNECTIVITE.indexOf(String(x.cle || '').toLowerCase()) >= 0)).map(x => x.id);
  return [...base, lu.commande && lu.commande.entity_id, lu.enCours, lu.prochainCapteur, lu.historique.dernier, ...lu.historique.compteurs, ...connectivite,
    ...lu.anomalies.map(x => x.entity_id), lu.portion && lu.portion.entity_id, lu.poidsPortion && lu.poidsPortion.entity_id]
    .filter((x, i, t) => typeof x === 'string' && x !== '' && t.indexOf(x) === i);
};

/* Un switch n'est une lumière que s'il est déclaré interrupteur-lumière ;
 * sinon c'est une prise ou un appareil : icône prise, teinte accent — pas l'or. */
const cvEstLumiere = (id) => String(id).indexOf('light.') === 0 || (String(id).indexOf('switch.') === 0 && switchLights().indexOf(id) >= 0);

/* ════════════ Pont Home Assistant (phase 2) ════════════
   Accède au hass du frontend HA parent (iframe same-origin /local/). null en standalone (démo). */
// Intervalle du pont hass (Parametres > Connexion). Lu UNE fois au chargement :
// changer la valeur passe par « Enregistrer », qui recharge la page.
const HASS_POLL_MS = (() => {
  try { const c = JSON.parse(window.localStorage.getItem('loggia_haCfg') || 'null'); const n = c && +c.pollMs; return (n >= 1000 && n <= 60000) ? n : 2000; } catch { return 2000; }
})();
const sigHash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
// noisyKeys : capteurs de puissance (W) au jitter continu → signature = valeur arrondie à 10 W,
// SANS last_updated (sinon re-render de toute l'app à chaque tick de 2 s).
function useHass(keys, noisyKeys) {
  const [, force] = useState(0);
  const ref = useRef(null);
  /* Lu DÈS le premier rendu (lot 14 de l'audit du 03/10). La référence ne se
   * remplissait qu'au premier tic, dans l'effet, donc APRÈS le premier dessin :
   * l'écran naissait sans `hass` alors que Home Assistant l'avait déjà —
   * « HORS LIGNE », les pièces d'exemple et leurs squelettes, puis le rail qui
   * se remplissait et toute la page qui sautait (0,24 des 0,27 de CLS mesurés
   * sur la démo à 1440 px). Tant que `hass` manque, chaque rendu le
   * redemande ; le tic garde la main. */
  if (ref.current === null) ref.current = getHass();
  const keysSig = keys.join(',');
  const noisySig = noisyKeys ? noisyKeys.join(',') : '';
  useEffect(() => {
    /* Seules les chaînes non vides sont des clés (05/10, suite du point 10b) :
     * un nombre, un objet ou `null` venu d'une configuration abîmée (import
     * retouché, ancienne version) levait ici, dans un effet — React démontait
     * alors TOUT l'écran, Paramètres compris, d'où l'on répare. Une garde ici
     * plutôt qu'une par source : les clés viennent d'une trentaine de lecteurs. */
    const cles = keys.filter(k => typeof k === 'string' && k !== '');
    /* Aucune clé à suivre — la compacte d'un appareil qui n'est pas une prise,
     * une fiche sans capteur — : ni relevé immédiat, ni intervalle de 2 s pour
     * rien (relecture finale, A2). Une clé qui arrive plus tard relance l'effet. */
    if (!cles.length) return undefined;
    const noisy = noisyKeys && noisyKeys.length ? {} : null;
    if (noisy) for (const k of noisyKeys) noisy[k] = 1;
    const prefixes = cles.filter(k => k.charAt(k.length - 1) === '.'); // clés-préfixes (ex: 'automation.')
    const plain = cles.filter(k => k.charAt(k.length - 1) !== '.');
    let prev = '';
    const tick = () => { try {
      const hass = getHass();
      ref.current = hass;
      let sig = 'none';
      if (hass && hass.states) {
        const parts = plain.map(k => {
          const s = hass.states[k];
          if (!s) return k + ':-';
          // En watts (audit du 03/10) : arrondi à 10 tel quel, un capteur en kW
          // (2,75) restait « 0 » sous 5 kW, et l'écran ne se redessinait plus.
          if (noisy && noisy[k]) { const n = wattsDe(s); return k + ':' + (n == null ? s.state : Math.round(n / 10) * 10); }
          // last_updated bouge aussi sur mise à jour d'attributs seuls (brightness, media_title, température météo…)
          return k + ':' + s.state + (s.last_updated || '');
        });
        if (prefixes.length) { // un seul passage sur hass.states pour tous les préfixes
          let acc = 0;
          for (const id in hass.states) {
            for (let i = 0; i < prefixes.length; i++) {
              if (id.indexOf(prefixes[i]) === 0) { const s = hass.states[id]; acc = (acc + sigHash(id + s.state + (s.last_updated || ''))) | 0; break; }
            }
          }
          parts.push('#' + acc);
        }
        sig = (hass.connected === false ? 'OFF|' : 'ON|') + parts.join('|');
      }
      if (sig !== prev) { prev = sig; force(n => n + 1); }
    } catch (e) { console.error('useHass tick', e); } };
    tick();
    const iv = setInterval(tick, HASS_POLL_MS);
    return () => clearInterval(iv);
  }, [keysSig, noisySig]);
  /* Sans clé, aucun tic ne tient `ref` à jour : le relevé du moment, lu au rendu
   * — un appelant qui peut passer une liste vide garde un `hass` frais. */
  return keys.some(k => typeof k === 'string' && k !== '') ? ref.current : getHass();
}

/* ════════════ Config entités (localStorage V1, partagé même origine) ════════════
   localStorage primaire ; IDs réels connus en fallback si la clé est absente/vide. */
/* Les dessins des plantes (chantier Capteurs, étapes 2 et 3, C34) : deux fichiers de public/plantes, recopiés à côté de la page
 * comme les polices — la carte n’en garde que l’adresse. En adresses data:, ils pesaient 6 778 octets au démarrage. */
const PLANT_ART = { schefflera: './plantes/schefflera.svg', dracaena: './plantes/dracaena.svg' };

export { estClair, dec, decMax, useFlash, SURF_CARTE, lavisCarte, rmNorm, soeursDe, poserCompteursMaison, priseDe, indexLu, useGardeSwitch, filtresEntite, ecartDe, switchsEcartes, noteEcartes, pieceLoggiaDe, NOMS_GROUPES, estClimate, pilotFamille, iconeChoisie, Segment, nomDeCle, FICHE_PILOTABLES, lireEpingles, basculerEpingle, distributeurConfigure, useAgenda, hx, estDehors, plantCapteur, plantPiece, masqueDe, ctxCapteurs, plantesDeLaMaison, capteursPlante, climateZones, readZone, croqKeys, cvEstLumiere, HASS_POLL_MS, useHass, PLANT_ART };
