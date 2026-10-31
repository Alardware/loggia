/* La vue Objets : ses filtres, ses en-têtes chargés à la demande, ses objets.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, useEffect, useMemo, Suspense } from 'react';
import { lazyRecharge } from '../recharge.js';
import { LOGGIA_INDEX, medPlayers, loggiaEnt, enBorne } from '../state.js';
import { borneEnCharge } from '../borne.js';
import { enPanne } from '../outils.js';
import { wattsDe } from '../unites.js';
import { interrupteurDeModule } from '../resolve.js';
import { cvId, cvDomain, Fi, Barriere } from '../ui.jsx';
import { clesDesPrises } from '../prises.js';
import { cleMesure } from '../confort.js';
import { vuePiles } from '../piles.js';
import { GROUPES, groupeDeClasse, sonne as sonneMembre, estMuet as muetDeGroupe, nomsMembres, vueSecurite, vueOuvertures } from '../groupes.js';
import { estVigilance, vueVigilance } from '../vigilance.js';
import { vuePlante } from '../plantes.js';
import { filtresObjet, objetActif, trierObjets, pucesObjets, statsObjets, compteObjets } from '../objets.js';
import { lireDistributeur } from '../distributeur.js';
import { chauffageDe, useEtatChauffage } from '../chauffageetat.js';
import { estVolet } from '../voletecran.js';
import { etatModule, enChauffe, estMuet, barreMaisonUtile } from '../chauffageecran.js';
import { Ico } from '../icones.jsx';
import { tr, comparerTextes, trN } from '../i18n.js';
import { lireEpingles, priseDe, pilotFamille, climateZones, estClimate, distributeurConfigure, plantesDeLaMaison, soeursDe, ecartDe, pieceLoggiaDe, cvEstLumiere, rmNorm, plantPiece, capteursPlante, NOMS_GROUPES, useHass, estDehors, ctxCapteurs, switchsEcartes, noteEcartes } from '../app/noyau.jsx';
import { estMesure, nonJugee, mesureJugee, vueMesure } from '../cartes/mesure.jsx';
import { membresDeLaMaison, pilesDeLaMaisonCarte } from '../cartes/groupe.jsx';
import { chauffeDeZone } from '../cartes/chauffage.jsx';
import { heureDe, lirePlante, useDomainCards } from '../appareils/fiches.jsx';
import { PlugIcon } from '../cartescustom/cartes.jsx';
import { discoverLights, voletCovers, ROOM_BIN_CLASSES, ROOM_SENSOR_CLASSES, rangClasse } from '../app/decouverte.jsx';
import { layoutOf, OBJ_LAYOUT_KEY, useLayoutEditor } from '../edition/disposition.jsx';
import { Header } from '../chrome/entete.jsx';
import { BandeauEdition, EditableCard, CarteAjout } from '../edition/briques.jsx';
import { ComposeurCartes, CardEditSheet } from '../edition/coquilles.jsx';

// L'en-tête d'Objets › Volets (chantier Volets, § 3.4) : ni l'Accueil ni une carte ne
// l'affichent — il se charge à la première ouverture du filtre, comme la barre « Maison ».
const EnteteVolets = lazyRecharge(() => import('../entetevolets.jsx'));
// L'en-tête d'Objets › Prises (chantier Prises, § 3.4) : de même, à la première ouverture du filtre.
const EntetePrises = lazyRecharge(() => import('../enteteprises.jsx'));
// L'en-tête d'Objets › Lumières (chantier Lumières, § 3.4) : le compte et « Tout éteindre », à la première ouverture du filtre.
const EnteteLumieres = lazyRecharge(() => import('../entetelumieres.jsx'));
// L'en-tête d'Objets › Multimédia (chantier Médias, tâche 8 ; M15).
const EnteteMedias = lazyRecharge(() => import('../entetemedias.jsx'));
// L'en-tête d'Objets › IoT (chantier IoT, tâche 7 ; I14) : le compte de sa maquette, à la première ouverture du filtre.
const EnteteIot = lazyRecharge(() => import('../enteteiot.jsx'));
// Objets › Capteurs en sections (chantier Capteurs, § 5) : son en-tête et ses sections, à la première ouverture du filtre.
const SectionsCapteurs = lazyRecharge(() => import('../capteurssections.jsx'));
// La barre « Maison » d'Objets › Chauffage (plan 2 du chantier Chauffage,
// tâche 11) : ni l'Accueil ni une carte ne l'affichent — elle se charge à la
// première ouverture du filtre, et le démarrage n'en embarque rien.
const BarreMaison = lazyRecharge(() => import('../barremaison.jsx'));

/* ════════════ VUE OBJETS — tous les appareils, aux cartes de la piece (maquette du 14/09) ════════════ */
/* Une seule vue pour tout ce qui se pilote : les cartes de la Vue Piece, une
 * grille, des filtres. Elle remplace les vues Lumieres, Climat et Medias —
 * leurs routes menent ici, filtre pose — et l'ancienne vue Objets a
 * agencement libre (sections, renommage, cartes libres : parties avec elle).
 * Ce qui range un appareil sous ses filtres, l'ordre de la grille et les
 * chiffres de tete vivent dans objets.js, sans React. */
/* Sept familles (17/09) : « Prises » a part — une prise c'est une prise ;
 * « IoT » = les appareils (robot, tondeuse, distributeur, ventilateur…) ;
 * « Capteurs » recoit la presence et les plantes ; ni « Cameras » ni « Jardin » :
 * leurs appareils restent sous « Tous » et sous leur famille. Le rangement vit
 * dans objets.js. */
const OBJ_FILTRES = () => [
  { id: 'tous', label: tr('Tous'), fi: 'apps' },
  { id: 'favoris', label: tr('Favoris'), fi: 'star' },
  { id: 'lumieres', label: tr('Lumières'), fi: 'bulb' },
  { id: 'volets', label: tr('Volets'), fi: 'blinds' },
  { id: 'chauffage', label: tr('Chauffage'), fi: 'flame' },
  { id: 'prises', label: tr('Prises'), prise: true },
  { id: 'multimedia', label: tr('Multimédia'), fi: 'tv-music' },
  { id: 'iot', label: tr('IoT'), fi: 'microchip' },
  { id: 'capteurs', label: tr('Capteurs'), fi: 'sensor' },
];
// Les domaines qui font une carte, et leur rang dans un meme appareil : la
// commande avant le capteur — une prise mesurante est une carte, pas deux.
const OBJ_DOMAINES = ['light', 'cover', 'climate', 'water_heater', 'media_player', 'vacuum', 'lawn_mower', 'lock', 'camera', 'switch', 'fan', 'humidifier', 'valve', 'siren', 'binary_sensor', 'sensor'];

/* Tout ce que la maison pilote, une entree par carte : les zones de chauffage
 * (le fil pilote n'a pas d'entite unique), les lumieres decouvertes, les volets
 * et lecteurs configures, puis tout le registre — une carte par appareil, sans
 * les entites cachees, desactivees ou de configuration —, le distributeur et
 * les plantes de la configuration. Les memes regles que la Vue Piece. */
/* `epingles` arrive du dehors depuis l'audit du 27/09 : la vue mémoïse cette
 * liste et nous la passe, ce qui rend la dépendance VISIBLE. Lue ici, elle
 * était invisible à `exhaustive-deps` — et la déclarer sans l'employer aurait
 * ajouté un avertissement à un inventaire que le projet garde court exprès. */
function objetsDeLaMaison(hass, ajoutes = [], epinglesDehors = null) {
  const S = (hass && hass.states) || {};
  const meta = (id) => (LOGGIA_INDEX && LOGGIA_INDEX.entityMeta && LOGGIA_INDEX.entityMeta.get(id)) || {};
  const pieceDe = (id) => (LOGGIA_INDEX && typeof LOGGIA_INDEX.areaNameOf === 'function') ? (LOGGIA_INDEX.areaNameOf(id) || null) : null;
  const epingles = epinglesDehors || new Set(lireEpingles().map(x => cvId(x)));
  const out = [];
  const pris = new Set();
  const entree = (cle, o) => {
    if (pris.has(cle)) return;
    pris.add(cle);
    const type = o.type || 'entite';
    const st = o.id ? S[o.id] : null;
    const etat = st ? st.state : null;
    const piece = o.piece || (o.id ? pieceDe(o.id) : null);
    const domaine = o.domaine || (o.id ? cvDomain(o.id) : null);
    out.push({
      cle, id: o.id || null, type, zone: o.zone || null, domaine, piece,
      nom: o.nom || (st && st.attributes && st.attributes.friendly_name) || o.id || cle,
      filtres: filtresObjet({ domaine, type, estLumiere: !!o.estLumiere, estPrise: !!(o.id && domaine === 'switch' && !o.estLumiere && priseDe(S, o.id).prise),
        epingle: !!(o.id && epingles.has(o.id)), classe: (st && st.attributes && st.attributes.device_class) || '' }),
      actif: type === 'entite' ? objetActif({ domaine, etat, attributs: (st && st.attributes) || {} }) : !!o.actif,
      absent: type === 'entite' ? enPanne(o.id, st) : false, // une scène jamais lancée n'est pas absente (05/10)
      // Le nom de sa carte dans Objets, quand il n'est pas celui de Home Assistant : une mesure y porte celui de sa pièce (C13).
      nomCarte: o.nomCarte || null,
      // La vigilance météo (C28) : sa section est Dehors, et la section la juge (`jugerObjet`).
      vigilance: !!o.vigilance,
      // Un groupe de capteurs (C20) : ses membres, ceux qui détectent, ceux qui ne répondent plus — ses chiffres dans Objets.
      membres: o.membres || null, actifsMembres: o.actifsMembres || 0, muetsMembres: o.muetsMembres || 0,
      // Une plante (C29) : ses capteurs — l'enveloppe des sections s'y abonne.
      capteurs: o.capteurs || null,
    });
  };
  // 1) chauffage : les zones, poele ou fil pilote — leurs entites de service sont prises.
  /* Une zone est active quand elle chauffe. Un module fil pilote découvert le
   * MESURE — plus de 10 W, comme sa carte (plan 2 du chantier Chauffage,
   * tâche 7) ; sans capteur de puissance, quand son ordre n'est pas l'Arrêt.
   * La règle des zones décrites à la main, `state === 'on'`, ne voyait jamais
   * un `select`. */
  const zoneActive = (z) => (!z.decouvert ? !!(S[z.haid] && S[z.haid].state === 'on')
    : z.puissance ? etatModule(wattsDe(S[z.puissance]), null) === 'chauffe'
      : !enPanne(z.haid, S[z.haid]) && pilotFamille(S[z.haid].state) !== 'off');
  climateZones(S).forEach(z => {
    if (estClimate(z) && z.haid && S[z.haid]) entree(z.haid, { id: z.haid, domaine: 'climate', piece: z.room || null });
    else if (S[z.haid] || S[z.tempCible]) entree('zone:' + z.id, { type: 'zone', zone: z, domaine: 'climate', nom: z.name || z.room || z.id, piece: z.room || null, actif: zoneActive(z) });
    ['haid', 'tempCible', 'modeEnt', 'autoEnt'].forEach(k => { if (typeof z[k] === 'string') pris.add(z[k]); });
  });
  // 2) lumieres decouvertes : leur piece vient de la configuration des pieces.
  try { discoverLights(hass).forEach(l => { if (l && l.id && S[l.id]) entree(l.id, { id: l.id, nom: l.name, piece: l.room || null, estLumiere: true }); }); } catch { /* decouverte pas prete */ }
  // 3) volets et lecteurs configures : leur nom vient de la configuration.
  voletCovers(S).forEach(c => { if (c && c.haid && S[c.haid]) entree(c.haid, { id: c.haid, nom: c.name }); });
  /* Un appareil, une carte (chantier Médias, M1 B, M14) : la carte d'un lecteur est celle de son entité principale ; sa jumelle
   * (`ma`) est prise avec lui — elle ne fait pas de seconde carte. */
  medPlayers().forEach(p => { if (p && p.haid && S[p.haid]) entree(p.haid, { id: p.haid, nom: p.name }); if (p && p.ma) pris.add(p.ma); });
  // 4) le reste du registre, une carte par appareil — un appareil deja
  //    represente (sa lumiere, son volet, son lecteur) ne revient pas.
  const parAppareil = new Set();
  out.forEach(o => { const a = o.id ? meta(o.id).deviceId : null; if (a) parAppareil.add(a); });
  // L'appareil de la jumelle d'un lecteur (M14) est représenté par la carte de celui-ci : ses autres entités ne reviennent pas.
  medPlayers().forEach(p => { const a = p && p.ma ? meta(p.ma).deviceId : null; if (a) parAppareil.add(a); });
  /* Le distributeur a SA carte (étape 5) : une fois son appareil connu, ses
   * entités ne font pas une seconde carte — un capteur, un verrou, une
   * anomalie de l'appareil (ADR 0155, 05/10). Ses entités désignées non plus. */
  /* Elles sortent des CANDIDATS seulement (05/10, contradicteur) : posées dans
   * `pris`, elles bloquaient aussi l'étape 6 — un voyant du distributeur ajouté
   * À LA MAIN dans l'éditeur n'apparaissait jamais, sans un mot. */
  const feeder = distributeurConfigure() ? lireDistributeur(LOGGIA_INDEX, S, loggiaEnt('feeder', null)) : null;
  const duDistributeur = new Set(feeder ? feeder.soeurs.map(x => x.id) : []);
  if (feeder && feeder.appareil) parAppareil.add(feeder.appareil);
  /* La borne de recharge (chantier G3, E3) : UNE carte pour l'appareil — ni son interrupteur en prise, ni sa puissance en capteur. */
  const borne = enBorne();
  if (borne) parAppareil.add(borne.appareil);
  // Les capteurs d'une plante sont a la plante : ils ne font pas une carte de plus — ceux de sa base, et ceux de son appareil (C29).
  const plantes = plantesDeLaMaison(S);
  const basesPlantes = plantes.map(p => String(p.base));
  const capteursPlantes = new Set(plantes.flatMap(p => (p.capteurs ? Object.values(p.capteurs).filter(Boolean) : [])));
  const dUnePlante = (id) => capteursPlantes.has(id) || basesPlantes.some(b => id === b || id.indexOf(b + '_') === 0);
  /* Les groupes de capteurs binaires (chantier Capteurs, C20, C21) : leurs membres — la classe, un appareil physique, hors catégorie
   * (groupes.js) —, lus une fois ; un sabotage (`tamper`) porté par l'appareil d'un membre se dit sur la ligne de sa porte, pas sur une carte. */
  const membres = membresDeLaMaison(S);
  const membreDUnGroupe = new Set(GROUPES.flatMap(g => membres[g]));
  /* Les MESURES (chantier Capteurs, C6, C7, C14, C16) : une carte par mesure, pas par appareil — le capteur d'une chambre
   * porte le CO₂, le bruit, la température et l'humidité. Une mesure de la table qui n'est ni la sonde d'un thermostat
   * (son appareil porte un `climate`), ni celle d'une plante (son appareil mesure une conductivité) ; les réglages et
   * les diagnostics sont écartés plus bas. Elle entre si elle appartient à un appareil PHYSIQUE — ni absent, ni un
   * service comme la météo (`entry_type: service`, que l'index garde) —, dans une pièce de Loggia comme ailleurs (C16,
   * 16/10) : C14 ne l'exigeait que hors des pièces, et la prévision de Météo-France et l'« Humidité extérieure »
   * calculée entraient sous Dehors, posées dans sa pièce « Extérieur ». Le bandeau de confort d'une pièce, lui, lit
   * toujours une sonde calculée. C17 (16/10) : dans une zone que Loggia ne compte pas parmi ses pièces, elle n'entre pas
   * (`pieceLoggiaDe` : null) — les vingt-cinq sondes de cartes mères de sa zone « network », sa passerelle de « technique » ;
   * sans zone, elle entre, neutre — son frigo. Qui veut les voir déclare la zone comme pièce de Loggia. */
  /* La sonde d'un thermostat : sa TEMPÉRATURE et son HUMIDITÉ seulement (audit du 19/10) — le CO₂ ou les COV d'un Ecobee ont leur carte. */
  const sonde = (id) => soeursDe(id).some(e => (e.indexOf('climate.') === 0 && ['temperature', 'humidity'].indexOf((S[id].attributes || {}).device_class) >= 0)
    || (e.indexOf('sensor.') === 0 && !!S[e] && (S[e].attributes || {}).device_class === 'conductivity'));
  const physique = (id) => { const a = meta(id).deviceId; const dm = a && LOGGIA_INDEX && LOGGIA_INDEX.deviceMeta ? LOGGIA_INDEX.deviceMeta.get(a) : null; return !!dm && dm.entryType !== 'service'; };
  const mesures = [];
  const candidats = [];
  Object.keys(S).forEach(id => {
    if (pris.has(id) || duDistributeur.has(id) || dUnePlante(id)) return;
    const d = cvDomain(id); const rang = OBJ_DOMAINES.indexOf(d); if (rang < 0) return;
    /* Les lecteurs sont ceux de `medPlayers()` (resolve.js : M1 B) — une entité `media_player` qui n'en est pas n'a pas de carte :
     * ni la jumelle d'une Echo, ni Spotify (un appareil de service), ni le haut-parleur d'une sonnette (Sécurité le garde par sa caméra). */
    if (d === 'media_player') return;
    const m = meta(id); if (m.hidden || m.disabled || m.category) return;
    // Un `light.*` que la découverte n'a pas retenu — un groupe dont les membres ont chacun leur carte (ADR 0261) — n'en a pas ici non plus.
    if (d === 'light') return;
    // L'interrupteur d'un module fil pilote : l'appareil est sa zone (étape 1).
    if (d === 'switch' && interrupteurDeModule(LOGGIA_INDEX, id)) return;
    /* Le pont de Zigbee2MQTT vit dans Paramètres › Interrupteurs, une sirène
     * dans Sécurité (chantier Prises, P1) : la note en pied du filtre Prises le dit. */
    if (d === 'switch' && ecartDe(S, id)) return;
    const dc = (S[id].attributes || {}).device_class || '';
    if (d === 'binary_sensor' && ROOM_BIN_CLASSES.indexOf(dc) < 0) return;
    /* Un binaire d'une famille de groupe qui ne peut pas y entrer ne fait pas de carte (C20, C21) : sans appareil — ses « Besoin
     * Eau » de modèle, une porte écrite à la main —, sur un service, ou la vigilance météo, qui a sa carte dans Dehors (C28). */
    // La vigilance météo garde sa carte, dans Dehors (C28, § 19.5) : MeteoAlarm, ou le capteur d'alerte de Météo-France — sans appareil physique (l'exception à C16).
    if (estVigilance(id, S[id], m)) { candidats.push({ id, rang, appareil: m.deviceId || null, vigilance: true }); return; }
    /* Un binaire d'une famille de groupe ne fait plus de carte (C20), qu'il entre dans son groupe ou non — ses « Besoin Eau » de modèle,
     * une porte écrite à la main, un service n'y entrent pas (C21), et n'ont pas de carte non plus. Les groupes le remplacent (étape 5). */
    if (d === 'binary_sensor' && groupeDeClasse(dc)) return;
    if (d === 'binary_sensor' && dc === 'tamper' && soeursDe(id).some(e => membreDUnGroupe.has(e))) return;
    if (d === 'sensor' && estMesure(S[id])) { const p = physique(id) && !sonde(id) ? pieceLoggiaDe(id) : null; if (p != null) mesures.push([id, p]); return; }
    if (d === 'sensor' && ROOM_SENSOR_CLASSES.indexOf(dc) < 0) return;
    /* C16 et C17 pour TOUS les capteurs (audit du 19/10, M8) : un appareil physique, et pas dans une zone que Loggia ne compte pas — un
     * indice de qualité d'air d'un service, la pression de la zone « network » n'entrent plus. */
    if ((d === 'sensor' || d === 'binary_sensor') && (!physique(id) || pieceLoggiaDe(id) == null)) return;
    candidats.push({ id, rang, appareil: m.deviceId || null });
  });
  /* Une carte par appareil : la première de ses classes (`rangClasse`, M9), jamais l'ordre alphabétique. La vigilance météo ne cède
   * jamais sa place, et ne prend celle de personne (M12) : une sœur de son appareil Météo-France ne la fait plus disparaître. */
  candidats.sort((x, y) => x.rang - y.rang || rangClasse(x.id, S) - rangClasse(y.id, S) || comparerTextes(x.id, y.id)).forEach(c => {
    if (c.appareil && !c.vigilance) { if (parAppareil.has(c.appareil)) return; parAppareil.add(c.appareil); }
    entree(c.id, { id: c.id, estLumiere: c.id.indexOf('switch.') === 0 && cvEstLumiere(c.id), vigilance: !!c.vigilance });
  });
  /* Le nom d'une mesure dans Objets (C13) : celui de sa pièce de Loggia (C17) — sa famille, écrite sous le chiffre, dit le
   * reste —, sauf quand deux mesures de la même famille partagent la pièce, ou qu'elle n'en a pas : alors son nom de Home
   * Assistant. */
  const familleDe = (id) => cleMesure((S[id].attributes || {}).device_class, (S[id].attributes || {}).unit_of_measurement);
  const cleNom = ([id, p]) => rmNorm(p) + '|' + familleDe(id);
  const memes = new Map();
  // Une mesure qu'on ne juge pas (un frigo, D5) garde son nom de Home Assistant : la pièce n'est pas son air.
  mesures.forEach(m => { if (nonJugee(S, m[0], familleDe(m[0]))) m[1] = ''; });
  mesures.forEach(m => { if (m[1]) memes.set(cleNom(m), (memes.get(cleNom(m)) || 0) + 1); });
  mesures.sort((x, y) => comparerTextes(x[0], y[0])).forEach(m => entree(m[0], { id: m[0], nomCarte: m[1] && memes.get(cleNom(m)) === 1 ? m[1] : null }));
  // 5) le distributeur et les plantes : la configuration les nomme. « Actif »
  //    au sens d'objets.js — il FAIT quelque chose : une distribution en cours
  //    (le capteur de l'appareil), plus « il reste un repas aujourd'hui ».
  if (feeder) entree('obj:feeder', { type: 'feeder', domaine: 'feeder', nom: tr('Distributeur'), actif: !!feeder.distribue });
  // La borne : sous IoT, « active » quand elle charge ; sa pièce est celle de sa puissance.
  if (borne) { const da = LOGGIA_INDEX && LOGGIA_INDEX.deviceMeta ? LOGGIA_INDEX.deviceMeta.get(borne.appareil) : null; entree('obj:borne', { type: 'borne', domaine: 'borne', nom: (da && da.name) || tr('Borne de recharge'), piece: pieceDe(borne.puissance), actif: borneEnCharge(borne, S) }); }
  // Les plantes (C29) : découvertes ou configurées ; la pièce d'une base sans appareil, celle de ses capteurs.
  plantes.forEach(p => entree('plant:' + p.base, { type: 'plant', domaine: 'plant', nom: p.nom, piece: p.piece || (p.capteurs ? null : plantPiece(S, p.base, null)) || null,
    capteurs: Object.values(capteursPlante(S, p)).filter(Boolean) }));
  // Les groupes (C20) : Ouvertures, Sécurité, Présence, chacun présent s'il a un membre ; un groupe compte ses membres dans les chiffres d'Objets.
  GROUPES.forEach(g => { if (membres[g].length) entree('groupe:' + g, { type: 'groupe', domaine: 'groupe', nom: NOMS_GROUPES()[g], membres: membres[g],
    actifsMembres: membres[g].filter(id => sonneMembre(S, id)).length, muetsMembres: membres[g].filter(id => muetDeGroupe(S[id])).length }); });
  // Les piles (C32) : une carte pour toutes, dans Plantes et piles ; une pile n'est jamais « active », une muette compte parmi les absentes.
  const piles = pilesDeLaMaisonCarte(S);
  if (piles.length) entree('groupe:piles', { type: 'groupe', domaine: 'groupe', nom: NOMS_GROUPES().piles, membres: piles.map(p => p.id), actifsMembres: 0, muetsMembres: piles.filter(p => p.muette).length });
  // 6) ce que l'editeur a ajoute a la main : une entite hors des regles ci-dessus.
  (ajoutes || []).forEach(id => { if (S[id]) entree(id, { id, estLumiere: id.indexOf('switch.') === 0 && cvEstLumiere(id) }); });
  return out;
}

/* Ce qui chauffe parmi des objets d'Objets — l'en-tête du filtre Chauffage,
 * « 5 appareils · 2 chauffent » (maquette « Cartes chauffage », 11/10) —,
 * par LA règle de leurs cartes (`enChauffe`, relecture de la partie A), et
 * non par l'« actif » d'Objets : un module sans capteur de puissance, en Éco,
 * est actif, mais sa carte ne dit pas qu'il chauffe ; un thermostat éteint
 * qui garde un `hvac_action` à `heating` non plus. Une zone se lit par l'aide
 * de sa carte (`chauffeDeZone`), la zone décrite à la main comprise. */
function chauffentParmi(objets, S) {
  return objets.filter(o => {
    if (o.type === 'zone' && o.zone) return chauffeDeZone(S, o.zone).chauffe;
    // Un thermostat : la même panne que sur sa carte (`estMuet` : `unavailable`, `unknown`), la même marche.
    const st = o.id && cvDomain(o.id) === 'climate' ? S[o.id] : null;
    return !!st && enChauffe({ famille: 'thermostat', muet: estMuet(st.state), marche: st.state !== 'off', action: (st.attributes || {}).hvac_action });
  }).length;
}

/* Les zones qui chauffent, pour « En ce moment » sur l'Accueil (plan 2 du
 * chantier Chauffage, tâche 12) : chacune lue comme Objets la lit — un
 * thermostat par l'entité de sa carte, une zone par sa carte — par LA règle
 * des cartes (`chauffentParmi`) : un module à plus de 10 W mesurés, un
 * thermostat qui chauffe vraiment, jamais le froid d'un climatiseur. Moins
 * celles dont le planning de chauffe est ALLUMÉ, hors « Observer sans agir »
 * (`auPlanning` des cartes) : elles ont leurs propres lignes (`lignesMoment`),
 * et rien quand tout suit le planning (choix 15). */
function zonesQuiChauffent(S, etat) {
  return climateZones(S).filter(z => {
    const ch = chauffageDe(etat, z.haid) || chauffageDe(etat, z.modeEnt);
    if (ch && ch.planning && !etat.simulation) return false;
    return chauffentParmi([estClimate(z) && z.haid && S[z.haid] ? { id: z.haid } : { type: 'zone', zone: z }], S) > 0;
  });
}

/* L'en-tête d'Objets › Prises avec un `hass` VIVANT (relecture finale, A2). Le
 * module de l'en-tête, chargé à la demande, ne peut pas importer `useHass` d'ici ;
 * ce petit composant, lui, s'abonne aux bascules et aux capteurs de puissance des
 * prises VISIBLES — ceux-ci en clés bruyantes, à 10 W près — et lui rend le
 * relevé du moment : « 150 W en ce moment » vit, sans que l'écran entier ne se
 * redessine (ADR 0119). `prises` : `[{ id, puissance }]`, comme `comptePrises`. */
function EntetePrisesVive({ hass, titre, prises }) {
  const { cles, bruyantes } = clesDesPrises(prises);
  const vivant = useHass(cles, bruyantes);
  return <EntetePrises hass={vivant || hass} titre={titre} prises={prises} />;
}

/* L'en-tête d'Objets › Lumières avec un `hass` VIVANT (chantier Lumières, § 3.4),
 * sur le modèle de celui des prises : le module, chargé à la demande, ne peut pas
 * importer `useHass` d'ici ; ce petit composant s'abonne aux lampes VISIBLES, et
 * le compte comme « Tout éteindre » suivent chacune d'elles sans que l'écran
 * entier ne se redessine. `ids` : les lampes visibles sous le filtre. */
function EnteteLumieresVive({ hass, titre, ids }) {
  const vivant = useHass(ids);
  return <EnteteLumieres hass={vivant || hass} titre={titre} ids={ids} />;
}

/* L'en-tête d'Objets › Multimédia avec un `hass` VIVANT (chantier Médias, M15), sur le modèle de celui des lumières : il s'abonne
 * aux lecteurs visibles ET à leurs jumeaux (M14) — c'est la jumelle HACS qui dit qu'une Echo joue. */
function EnteteMediasVive({ hass, titre, ids }) {
  const lecteurs = medPlayers();
  const vivant = useHass(ids.flatMap(id => { const p = lecteurs.find(x => x.haid === id); return p && p.ma ? [id, p.ma] : [id]; }));
  return <EnteteMedias hass={vivant || hass} titre={titre} ids={ids} />;
}

/* L'en-tête d'Objets › IoT avec un `hass` VIVANT (chantier IoT, I14), sur le modèle de celui des médias : il s'abonne aux entités
 * visibles — un robot qui part, un ventilateur qu'on allume changent « en marche » sans que l'écran entier ne se redessine.
 * `objets` : `[{ id, domaine }]`, ceux que le filtre montre — le distributeur, sans entité, compte dans le total. */
function EnteteIotVive({ hass, titre, objets }) {
  const vivant = useHass(objets.filter(o => o.id).map(o => o.id));
  return <EnteteIot hass={vivant || hass} titre={titre} objets={objets} />;
}

/* Objets › Capteurs en sections avec un `hass` VIVANT (correction bis du chantier Capteurs, point 1), sur le modèle de
 * l'en-tête des prises : la vue ne surveille pas `sensor.`, et « Air · 3 à regarder » comme « 4 à regarder » restaient ceux
 * de son dernier rendu quand une mesure changeait. Ce petit composant ne s'abonne qu'aux mesures que la table JUGE
 * (`mesureJugee`) : elles seules changent ce qui est à regarder. À chaque relevé, il ne redessine que le DÉCOMPTE — l'en-tête
 * et l'état de chaque section — : les grilles des sections sont mémoïsées dans le module (`GrilleSection`), et chaque carte
 * garde son propre abonnement. Un CO₂ qui change ne redessine que SA carte (correction bis 2, point 2 : 23 cartes avant,
 * mesuré dans la démo). Le module, chargé à la demande, ne peut pas importer `useHass` d'ici. */
function SectionsCapteursVive({ hass, titre, objets, cellule }) {
  const S = (hass && hass.states) || {};
  /* Et à ce que les sections jugent sans la table (chantier Capteurs, étapes 2 et 3) : la vigilance météo, les membres des groupes —
   * sauf ceux de Présence, qu'elle ne juge pas (toujours neutre, § 19.1) : abonnée à eux, chaque mouvement d'une caméra redessinait
   * les en-têtes pour rien (passe bis du 17/10, point 5). Le seuil des piles est celui de la racine (`useSeuilPile`, § 19.8). */
  const vivant = useHass([...objets.filter(o => o.id && ((o.domaine === 'sensor' && mesureJugee(S, o.id)) || o.vigilance)).map(o => o.id),
    ...objets.filter(o => o.type === 'groupe' && o.cle !== 'groupe:presence').flatMap(o => o.membres || []), ...objets.filter(o => o.type === 'plant').flatMap(o => o.capteurs || [])]);
  return <SectionsCapteurs hass={vivant || hass} titre={titre} objets={objets} cellule={cellule} dehors={estDehors} lire={vueMesure} juger={jugerObjet} />;
}
/* Ce qu'une section d'Objets › Capteurs sait dire d'une carte qui n'est pas une mesure (chantier Capteurs, étapes 2 et 3 ; § 6.1) :
 * 'regarder', 'bonne', 'neutre' ou null — `undefined` pour une mesure, que la table juge (capteurssections.jsx). La vigilance
 * météo (C28, § 19.5) : active (jaune ou plus) ou muette, à regarder ; au calme, NEUTRE (décision D3 du 19/10) — ni bonne, ni
 * « Rien à signaler » : Dehors au calme ne dit rien. */
function jugerObjet(hass, o) {
  const S = (hass && hass.states) || {};
  if (o.vigilance) return vueVigilance(S, o.id).regarder ? 'regarder' : 'neutre';
  // Piles (C32, C33) : à regarder dès qu'une pile est à changer ou muette ; sinon jugée bonne — au seuil en vigueur (attention.js).
  if (o.cle === 'groupe:piles') return vuePiles(pilesDeLaMaisonCarte(S)).regarder ? 'regarder' : 'bonne';
  /* Un groupe (C25, précisé au § 19.1) : « à regarder » compte ce qui demande un geste ou signale une panne — un ouvrant ou un détecteur
   * muet, un détecteur qui sonne — jamais une porte qu'on a ouverte ; Présence ne juge pas, comme une pression (neutre). */
  if (o.type === 'groupe') {
    const g = String(o.cle).slice(7);
    if (g === 'presence') return 'neutre';
    const ids = o.membres || [];
    const noms = nomsMembres(ids, S, ctxCapteurs());
    const v = g === 'securite' ? vueSecurite(ids, S, noms) : vueOuvertures(ids, S, noms, heureDe);
    return v.regarder ? 'regarder' : 'bonne';
  }
  /* Une plante (C33) : à regarder si elle presse ou si elle se tait ; jugée bonne sinon ; sans mesure du sol, la section ne sait pas. */
  if (o.type === 'plant') {
    const pl = lirePlante(hass, String(o.cle).slice(6));
    if (!pl) return null;
    const v = vuePlante(pl);
    return v.regarder ? 'regarder' : v.jugee ? 'bonne' : null;
  }
  return undefined;
}

function ObjetsView({ hass, onNav, filtre = null, edit = false, onEnt = null }) {
  const S = (hass && hass.states) || {};
  // Le filtre choisi survit a un aller-retour ; une route (Lumieres, Climat,
  // Medias) l'impose a l'arrivee.
  const [choix, setChoix] = useState(() => { if (filtre) return filtre; try { return window.sessionStorage.getItem('loggia-objets-filtre') || 'tous'; } catch { return 'tous'; } });
  useEffect(() => { if (filtre) setChoix(filtre); }, [filtre]);
  useEffect(() => { try { window.sessionStorage.setItem('loggia-objets-filtre', choix); } catch { /* stockage indisponible */ } }, [choix]);
  // L'agencement : ce que la maison propose, moins les retraits, plus les
  // ajouts, dans l'ordre choisi — le meme editeur que les pieces.
  /* La chaîne d'Objets, MÉMOÏSÉE (audit du 27/09).
   *
   * `objetsDeLaMaison` fait un `Object.keys` complet sur toutes les entités de
   * la maison, puis vient un tri, puis deux passes de comptage. Cette vue sert
   * CINQ entrées de menu — Lumières, Climat, Volets, Médias, Objets — et tout
   * cela repartait à chaque rendu, y compris quand seul un état LOCAL avait
   * bougé : changer de puce de filtre rescannait la maison entière.
   *
   * Les trois entrées sont d'abord STABILISÉES par leur signature. Sans cela,
   * `ajoutes` et `ordrePieces` sont des tableaux neufs à chaque rendu, et
   * mémoïser dessus ne servirait à rien — tout en ajoutant des avertissements
   * à l'inventaire de `tests/dependances.test.mjs`. Ici les dépendances sont
   * complètes et l'inventaire ne bouge pas. */
  const ajoutesSig = (layoutOf(OBJ_LAYOUT_KEY, 'objets').added || []).join('|');
  const ajoutes = useMemo(() => (ajoutesSig ? ajoutesSig.split('|') : []), [ajoutesSig]);
  const ordreSig = ((LOGGIA_INDEX && LOGGIA_INDEX.areaList) || []).map(z => z.name).join('|');
  const ordrePieces = useMemo(() => (ordreSig ? ordreSig.split('|') : []), [ordreSig]);
  /* Les épingles étaient lues DANS `objetsDeLaMaison`, donc invisibles à la
   * règle des dépendances — et pourtant le résultat en dépend. On les lit ici
   * et on les passe : la dépendance devient visible et vérifiable. */
  const epinglesSig = lireEpingles().map(x => cvId(x)).join('|');
  const epingles = useMemo(() => new Set(epinglesSig ? epinglesSig.split('|') : []), [epinglesSig]);
  const tousObjets = useMemo(() => objetsDeLaMaison(hass, ajoutes, epingles), [hass, ajoutes, epingles]);
  // L'ordre propose est deja piece par piece : c'est de LA que part un
  // deplacement — sinon la grille sautait a la premiere prise (bug vecu).
  const derived = useMemo(
    () => trierObjets(tousObjets.filter(o => ajoutes.indexOf(o.cle) < 0), ordrePieces).map(o => o.cle),
    [tousObjets, ajoutes, ordrePieces]);
  const ed = useLayoutEditor(OBJ_LAYOUT_KEY, 'objets', derived);
  const parCle = useMemo(() => new Map(tousObjets.map(o => [o.cle, o])), [tousObjets]);
  const objets = useMemo(() => ed.ids.map(cle => parCle.get(cle)).filter(Boolean), [ed.ids, parCle]);
  const puces = useMemo(() => pucesObjets(objets), [objets]);
  const filtres = OBJ_FILTRES().filter(f => puces.some(p => p.id === f.id));
  const actuel = filtres.some(f => f.id === choix) ? choix : 'tous';
  // L'ordre est celui de l'editeur : le propose (piece par piece), ou celui choisi a la main.
  const visibles = objets.filter(o => actuel === 'tous' || o.filtres.indexOf(actuel) >= 0);
  // Sous le filtre Chauffage, l'en-tête dit aussi ce qui chauffe (maquette du 11/10).
  const chauffent = actuel === 'chauffage' ? chauffentParmi(visibles, S) : 0;
  // Sous le filtre Volets, l'en-tête compte les VOLETS et les commande (chantier Volets, § 3.4).
  const idsVolets = actuel === 'volets' ? visibles.filter(o => o.id && estVolet(S[o.id])).map(o => o.id) : [];
  // Sous le filtre Prises, l'en-tête compte les PRISES visibles et somme leur puissance ; la note en pied nomme les switch écartés (chantier Prises, § 3.4).
  const prisesVues = actuel === 'prises' ? visibles.filter(o => o.id && String(o.id).indexOf('switch.') === 0).map(o => ({ id: o.id, ...priseDe(S, o.id) })).filter(p => p.prise) : [];
  // Sous le filtre Lumières, l'en-tête compte les lampes VISIBLES et n'éteint qu'elles (chantier Lumières, § 3.4).
  const idsLumieres = actuel === 'lumieres' ? visibles.filter(o => o.id).map(o => o.id) : [];
  const idsMedias = actuel === 'multimedia' ? visibles.filter(o => o.id).map(o => o.id) : [];
  const objetsIot = actuel === 'iot' ? visibles.map(o => ({ id: o.id, domaine: o.domaine })) : [];
  const ecartes = actuel === 'prises' ? switchsEcartes(S) : [];
  /* La barre « Maison » du planning de chauffe (plan 2 du chantier Chauffage,
   * tâche 11 ; spec § 9.1) : sous le filtre Chauffage, entre son titre et ses
   * cartes, quand elle sert — un planning allumé, ou la maison hors Planning
   * (`barreMaisonUtile`, relecture finale du 12/10). L'état ne se lit que sous
   * ce filtre ; la barre se charge à la demande, et son repli a sa hauteur
   * (59 px) : rien ne saute. */
  const { etat: etatCh } = useEtatChauffage(actuel === 'chauffage');
  const barreMaison = actuel === 'chauffage' && barreMaisonUtile(etatCh);
  const stats = useMemo(() => statsObjets(objets), [objets]);
  const [addSheet, setAddSheet] = useState(false);
  const [cardEdit, setCardEdit] = useState(null);
  const nomDe = (o) => ed.labelOf(o.cle) || o.nom;
  const scenes = Object.keys(S).filter(k => k.indexOf('scene.') === 0).length;
  const dc = useDomainCards(hass, { onNav });
  // Toute carte vient de la fabrique commune — entite, zone, distributeur,
  // plante — la meme que dans les pieces (composeur du 15/09).
  const carte = (o) => {
    const compacte = ed.estCompact(o.cle);
    if (o.type === 'zone') return dc.card(null, nomDe(o), o.zone);
    // Une carte composée — le distributeur, une plante, un groupe de capteurs (C20) — se nomme par sa clé ; une entité, par son identifiant.
    const cle = (o.type === 'feeder' || o.type === 'plant' || o.type === 'groupe' || o.type === 'borne') ? o.cle : o.id;
    /* Un nom posé à la main l'emporte toujours ; sinon, la carte d'une mesure porte celui de sa pièce (C13) — sa famille
     * est écrite sous son chiffre. La compacte ne l'écrit pas : elle garde son nom de Home Assistant. */
    return compacte ? dc.compact(cle, ed.labelOf(o.cle) || null) : dc.card(cle, ed.labelOf(o.cle) || o.nomCarte || null);
  };
  // La cellule d'une carte, dans la grille ou dans une section de Capteurs : sa largeur et sa compacité, celles de l'éditeur.
  const cellule = (o) => <div key={o.cle} className={((ed.estLarge(o.cle) ? 'o-cvw2 ' : '') + (ed.estCompact(o.cle) ? 'o-cvrow1' : '')) || undefined}>{carte(o)}</div>;
  // Sous le filtre Capteurs, hors édition, la grille se range en sections (chantier Capteurs, § 5) ; l'édition garde la grille, qu'elle range.
  const enSections = actuel === 'capteurs' && !edit;
  const titreFiltre = (OBJ_FILTRES().find(f => f.id === actuel) || {}).label || tr('Tous');
  const tuile = { padding: '18px 20px', borderRadius: 'var(--o-radius,18px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' };
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {edit && <BandeauEdition ed={ed} onAjouter={() => setAddSheet(true)} onEnt={onEnt} />}
        <div>
          {/* Le titre de la PAGE, pas celui du catalogue (plan M7) : ouverte
            * par « Lumières », « Climat » ou « Médias », cette vue s'annonçait
            * « Objets » — un lecteur d'écran lisait donc le mauvais nom, et
            * trois entrées du menu menaient toutes au même titre. */}
          <h1 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{filtre === 'lumieres' ? tr('Lumières') : filtre === 'chauffage' ? tr('Climat') : filtre === 'multimedia' ? tr('Médias') : filtre === 'volets' ? tr('Volets') : tr('Objets')}</h1>
          <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>{tr('{n} appareils répartis dans {p} pièces · {a} actifs', { n: stats.appareils, p: stats.pieces, a: stats.actifs })}</div>
          {/* Les volets ont une chose que les autres familles n'ont pas : des
            * MODES et un planning, qui ne tiennent dans aucune carte. L'entrée
            * du menu ouvre désormais cette vue-ci, filtrée, comme Lumières ou
            * Médias (demande du 26/09) — le reste se rejoint par ce lien, qui
            * est un lien d'en-tête et non une fausse carte dans la grille. */}
          {filtre === 'volets' && onNav && (
            <button onClick={() => onNav('voletsplan')} style={{ marginTop: 9, padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--o-accent-soft)' }}>{tr('modes et planning')} →</button>
          )}
        </div>
        <div className="grid-objstats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
          {[[stats.appareils, tr('appareils reliés'), 'var(--o-text)'], [scenes, tr('scènes'), 'var(--o-purple)'], [stats.absentes, tr('entités absentes'), stats.absentes ? 'var(--o-bad)' : 'var(--o-text)']].map(([v, l, c], i) => (
            <div key={i} style={tuile}>
              <div style={{ fontSize: 28, fontWeight: 800, color: c, lineHeight: 1 }}>{v}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6 }}>{l}</div>
            </div>
          ))}
        </div>
        {/* Les filtres : des puces a l'arrondi 9 (pas de pilules), seulement celles
          * qui ont quelque chose a montrer. Sur UNE ligne : elle defile si elle
          * deborde (retour user du 14/09), mais au telephone elle n'a plus a le
          * faire — le mot s'efface, l'icone reste, les puces se partagent la
          * largeur (17/09) ; le titre juste dessous dit le filtre choisi. */}
        <div className="o-favrow o-objfiltres" style={{ display: 'flex', gap: 8, overflowX: 'auto', flexWrap: 'nowrap' }}>
          {/* Le compte sur chaque puce (ADR 0040, resté « non fait ») : savoir
            * ce qu'une famille porte AVANT de la toucher. Au téléphone les
            * puces n'ont que leur icône et se partagent la largeur sur UNE
            * ligne — le nombre s'efface avec le mot, et `aria-label` le dit à
            * toutes les tailles. */}
          {filtres.map(f => { const on = f.id === actuel;
            // Un groupe de capteurs compte ses membres (chantier Capteurs, C20) : le compte ne baisse pas.
            const n = compteObjets(objets, f.id);
            return (
            <button key={f.id} className="o-objfiltre" onClick={() => setChoix(f.id)} aria-pressed={on} aria-label={f.label + ' · ' + trN(n, '{n} appareil', '{n} appareils')} title={f.label} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, flexShrink: 0, whiteSpace: 'nowrap', padding: '8px 13px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, border: 'var(--o-bw,1px) solid ' + (on ? 'transparent' : 'var(--o-bd2)'), background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)' }}>
              {f.prise ? <PlugIcon size={13} /> : f.ico ? <Ico name={f.ico} size={14} /> : <Fi i={f.fi} size={13} />}<span className="o-objfiltre-mot">{f.label}</span>
              {/* Discret par sa COULEUR, plus par une opacité (lot 15 de
                * l’audit du 03/10) : `.55` tombait à 2,53:1 sur la puce choisie
                * et à 4,35:1 sur les autres. Non choisie, le gris tertiaire du
                * thème, que la garde de contraste tient à 4,5:1 sur les fonds
                * `--o-s1` ; choisie, le blanc de la puce — le fond d'accent est
                * calculé pour lui, aucun blanc atténué n'y tient 4,5:1. */}
              <span className="o-objfiltre-nb" aria-hidden="true" style={{ fontWeight: 800, color: on ? 'inherit' : 'var(--o-text3)' }}>{n}</span>
            </button>); })}
        </div>
        {actuel === 'volets' ? (
          /* Le repli a la hauteur de l'en-tête (40 px) et son titre : rien ne saute. */
          <Suspense fallback={<div style={{ minHeight: 40, display: 'flex', alignItems: 'center' }}><h2 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' }}>{titreFiltre}</h2></div>}>
            <EnteteVolets hass={hass} titre={titreFiltre} ids={idsVolets} />
          </Suspense>
        ) : actuel === 'prises' ? (
          /* Le repli : le titre, dans la même rangée que l'en-tête, et un compte VIDE
           * aux mêmes classes et à la même police — la même hauteur à toute
           * largeur : rien ne saute quand le compte arrive (relecture finale, A8). */
          <Suspense fallback={<div className="o-prises-entete"><h2 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' }}>{titreFiltre}</h2><span className="o-prises-compte" aria-hidden="true" style={{ fontSize: 12, fontWeight: 600 }}>{'\u00a0'}</span></div>}>
            <EntetePrisesVive hass={hass} titre={titreFiltre} prises={prisesVues} />
          </Suspense>
        ) : actuel === 'lumieres' ? (
          /* L'en-tête des lumières (chantier Lumières, § 3.4). Son repli : la rangée, le titre et un compte VIDE, aux
           * mêmes classes — 40 px, la hauteur de la puce : rien ne saute quand l'en-tête arrive. */
          <Suspense fallback={<div className="o-lumieres-entete"><h2 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' }}>{titreFiltre}</h2><span className="o-lumieres-compte" aria-hidden="true" style={{ fontSize: 12, fontWeight: 600 }}>{'\u00a0'}</span></div>}>
            <EnteteLumieresVive hass={hass} titre={titreFiltre} ids={idsLumieres} />
          </Suspense>
        ) : actuel === 'multimedia' ? (
          /* L'en-tête des médias (chantier Médias, M15) : le compte, sans puce — la maquette n'en a pas. Son repli : la rangée, le
           * titre et un compte VIDE, aux mêmes classes — 40 px : rien ne saute quand le compte arrive. Une barrière LOCALE :
           * introuvable, le module rend la place au titre seul, et la vue garde ses cartes. */
          <Barriere repli={<div className="o-medias-entete"><h2 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' }}>{titreFiltre}</h2></div>}>
            <Suspense fallback={<div className="o-medias-entete"><h2 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' }}>{titreFiltre}</h2><span className="o-medias-compte" aria-hidden="true" style={{ fontSize: 12, fontWeight: 600 }}>{'\u00a0'}</span></div>}>
              <EnteteMediasVive hass={hass} titre={titreFiltre} ids={idsMedias} />
            </Suspense>
          </Barriere>
        ) : actuel === 'iot' ? (
          /* L'en-tête de l'IoT (chantier IoT, I14) : le compte de sa maquette, rien à droite. Son repli : la rangée, le titre et un
           * compte VIDE, aux mêmes classes — 40 px : rien ne saute quand le compte arrive. Une barrière LOCALE : introuvable, le
           * module rend la place au titre seul, et la vue garde ses cartes. */
          <Barriere repli={<div className="o-iot-entete"><h2 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' }}>{titreFiltre}</h2></div>}>
            <Suspense fallback={<div className="o-iot-entete"><h2 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' }}>{titreFiltre}</h2><span className="o-iot-compte" aria-hidden="true" style={{ fontSize: 12, fontWeight: 600 }}>{'\u00a0'}</span></div>}>
              <EnteteIotVive hass={hass} titre={titreFiltre} objets={objetsIot} />
            </Suspense>
          </Barriere>
        ) : enSections ? (
          /* L'en-tête et les sections de Capteurs viennent du même module, chargé à la demande. Son repli : le titre et un
           * compte VIDE, à la même police — rien ne saute quand il arrive. Une barrière LOCALE (correction bis, point 4) :
           * introuvable, le module rend la place à la grille ordinaire — la vue garde ses puces, et « Réessayer » ne retombait
           * plus sur le filtre gardé en `sessionStorage`. */
          <Barriere repli={<>
            {/* « cartes », comme l'en-tête de son module (capteurssections.jsx) : un groupe tient plusieurs appareils (audit du 19/10, lot 4). */}
            <div className="o-objets-entete"><h2 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' }}>{titreFiltre}</h2><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{trN(visibles.length, '{n} carte', '{n} cartes')}</span></div>
            <div className="grid-objets grid-dense" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(225px,1fr))', columnGap: 16, rowGap: 8 }}>{visibles.map(cellule)}</div>
          </>}>
            <Suspense fallback={<div className="o-objets-entete"><h2 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' }}>{titreFiltre}</h2><span style={{ fontSize: 12, fontWeight: 600 }}>{'\u00a0'}</span></div>}>
              <SectionsCapteursVive hass={hass} titre={titreFiltre} objets={visibles} cellule={cellule} />
            </Suspense>
          </Barriere>
        ) : (
          /* La rangée commune de 40 px (19/10) : le titre de Tous, de Chauffage… au niveau de celui des Lumières. */
          <div className="o-objets-entete">
            <h2 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' }}>{titreFiltre}</h2>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{trN(visibles.length, '{n} appareil', '{n} appareils')}{chauffent ? ' · ' + trN(chauffent, '{n} chauffe', '{n} chauffent') : null}</span>
          </div>
        )}
        {barreMaison && <Suspense fallback={<div style={{ minHeight: 59 }} />}><BarreMaison hass={hass} etat={etatCh} /></Suspense>}
        {enSections ? null : (visibles.length || edit)
          ? <div ref={ed.gridRef} className="grid-objets grid-dense" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(225px,1fr))', columnGap: 16, rowGap: 8 }}>
              {visibles.map(o => (edit
                ? <EditableCard key={o.cle} ed={ed} id={o.cle} nom={nomDe(o)} onEdit={setCardEdit} hass={hass} />
                : cellule(o)))}
              {edit && <CarteAjout onClick={() => setAddSheet(true)} />}
            </div>
          : <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Rien dans ce filtre.')}</div>}
        {/* La note en pied du filtre Prises (chantier Prises, § 3.4) : ce qui
          * n'y est plus, et où le trouver — avec les noms réels. À 16 px du
          * bas de la grille (l'écart de la page en donne 18), un filet au-dessus. */}
        {actuel === 'prises' && ecartes.length > 0 && (
          <div data-ecartes="" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -2, paddingTop: 14, borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>
            <Fi i="triangle-warning" size={12} /><span>{noteEcartes(ecartes)}</span>
          </div>
        )}
        {/* dc.card sans dc.sheets = fiches muettes (piege vecu). */}
        {dc.sheets}
        {addSheet && <ComposeurCartes dc={dc} hass={hass} present={ed.ids} onToggle={ed.toggle}
          domaines={[...OBJ_DOMAINES, 'input_boolean', 'number', 'select']} onClose={() => setAddSheet(false)} />}
        {cardEdit && <CardEditSheet ed={ed} id={cardEdit} nom={(parCle.get(cardEdit) && nomDe(parCle.get(cardEdit))) || cardEdit} origine={(parCle.get(cardEdit) || {}).nom || cardEdit} hass={hass} onClose={() => setCardEdit(null)} />}
      </div>
    </main>
  );
}

export { OBJ_FILTRES, objetsDeLaMaison, chauffentParmi, zonesQuiChauffent, EntetePrisesVive, SectionsCapteursVive, jugerObjet, ObjetsView };
