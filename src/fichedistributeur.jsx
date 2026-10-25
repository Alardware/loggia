/* ── La fiche du distributeur de croquettes (ADR 0155, 05/10 ; étape 2 du chantier IoT, 19/10 — ADR 0216) ──
 *
 * Une feuille à onglets sur le socle commun des fiches (`fichecommune.jsx`) :
 * Accueil, Repas, Historique — et Entretien seulement s'il y a de quoi (I26 :
 * des consommables) —, la roue Réglages dans l'en-tête (I4 A), une page, pas un
 * onglet. Un appareil = sa carte + sa fiche (ADR 0153). L'en-tête prend la
 * plaque de la carte et « {pièce} · distributeur » (I21).
 *
 * L'Accueil est celui de sa maquette « Cartes IoT », 1e (I22, I23) : le
 * réservoir en grand, et « Je l'ai rempli » près de lui, qui DEMANDE — il a
 * quitté la carte, où un appui par erreur remettait le bac à 100 % ; « Servir
 * maintenant », selon la commande de l'appareil, et « Distribuer », le geste
 * PARTAGÉ de la carte (distributeuretat.js : deux appuis, une ration, d'où
 * qu'ils viennent) ; le prochain repas et la journée ; « État du distributeur »
 * seulement quand l'appareil se plaint — jamais « Aucun problème ».
 *
 * Repas et Historique prennent aussi son dessin (I24, I25) : la rangée
 * « Programme de l'appareil » qui dit qui sert, « VOS AUTOMATISATIONS », puis
 * les sept jours GLISSANTS et chaque repas sous son vrai nom — celui de
 * l'automatisation qui l'a servi, jamais « Repas du matin » deviné à l'heure.
 * Les barres de la semaine partent, et l'orange de l'ancienne fiche (I8).
 *
 * Ce qui se CALCULE vit dans `distributeur.js` (pur, testé à sec), les briques
 * communes dans `fichecommune.jsx`. Ce fichier ne fait que dessiner :
 *  - la réponse du serveur (`loggia/distributeurs/etat`) arrive par `etat`,
 *    lue et sondée par la coquille (App.jsx) ; `erreur` dit qu'il est MUET
 *    — Home Assistant pas encore redémarré — et le Planning le dit au lieu de
 *    montrer une liste vide ;
 *  - les entités de l'appareil se lisent dans `hass`, que la coquille garde
 *    vivant (`useHass` sur les sœurs ET les automatisations reconnues) : sans
 *    cet abonnement, une bascule resterait figée (régression du 01/10).
 *
 * Trois règles, toutes du 05/10 :
 *  - le Planning lit ses sources dans l'ordre programme de l'appareil →
 *    automatisations qui COMMANDENT le distributeur → planning de Loggia,
 *    proposé seulement s'il n'y a ni l'un ni l'autre. C'est le SERVEUR qui
 *    tient la règle (`peutPlanifier`, repas retenus au départ) : l'écran la
 *    montre, il ne la refait pas ;
 *  - une heure qu'on ne peut pas déduire ne s'invente pas : « Sans heure
 *    fixe », jamais une heure, et ni le prochain repas ni la réserve ne la
 *    comptent ;
 *  - ce qu'un compte ordinaire ne peut pas enregistrer est MASQUÉ (ADR 0144) :
 *    le planning de Loggia et « Associer », de la CONFIGURATION de Loggia que
 *    le composant garde aux administrateurs. Les commandes de l'APPAREIL —
 *    Distribuer, la taille de la portion, « Remplacé », les réglages de la
 *    roue — restent à tous : un compte Home Assistant ordinaire peut appeler
 *    `number.set_value` ou `button.press`, et l'Accueil laissait déjà régler la
 *    portion que Réglages ne montrait qu'en lecture (05/10).
 */
import { useState, useEffect, useRef, useId } from 'react';
import { tr, trN, trSens, locale, comparerTextes } from './i18n.js';
import { Fi, Bascule, ListeChoix, cvName } from './ui.jsx';
import { LOGGIA_INDEX, loggiaEnt, cfgVal, cfgSet, compteOrdinaire } from './state.js';
import { commanderService } from './actions.js';
import { premierJourSemaine } from './horloge.js';
import { LISERE } from './styles.js';
import { useOptimiste, useDemandes, enVol } from './optimiste.js';
import { estRefus, raisonEchec } from './refus.js';
import { ordreJours, heureValide } from './robots.js';
import { etiquetteJour, etiquetteProchain, phraseEntretien } from './robotsfiche.js';
import { lireDistributeur, envoiDistribuer, niveauDuBac, prochainRepas, grammesRation, estMasse, enGrammes } from './distributeur.js';
import { lancerDistribution, useDistribution } from './distributeuretat.js';
import {
  mesurePortion, compteDuJour, joursDeReserveDistributeur, planningAffiche, libelleHeures, libelleJours, repasDepuisHistorique, septJoursRepas,
  consommablesDistributeur, reglagesDistributeur, selectMode, niveauConsommable,
} from './distributeurfiche.js';
import {
  PANNEAU, PETITES_CAPITALES, LIGNE, SOUS, filet, BoutonConfirme, PasAPas, PuceJour, ChampHeure,
  useHistoriquePeriode, EnteteFiche, FicheOnglets, PanneauOnglet, PageReglagesAppareil, OngletEntretien, focaliser,
} from './fichecommune.jsx';

const JOURS_HISTORIQUE = 10;      // la purge par défaut de Home Assistant
const PORTIONS_MAX = 20;          // comme `distributeurs.py`
// Douze repas au plus, comme `distributeurs.py` (MAX_REPAS) : au-delà, « Ajouter » ne se
// propose plus — le serveur refuserait (`trop_de_repas`, que refus.js sait dire) (05/10).
const MAX_REPAS = 12;
const MAX_RESERVOIR = 1500;       // le maximum d'un bac en grammes sans maximum déclaré (croqMax)

/* Le mot de la source du prochain repas (la tuile), quand l'automatisation n'a pas de nom. Ceux d'un repas PASSÉ — « Repas à la
 * main », « À distance » — sont les titres de l'Historique (`septJoursRepas`, distributeurfiche.js). */
const MOT_SOURCE = {
  loggia: () => tr('Planning de Loggia'),
  automatisations: () => tr('Depuis une automatisation'),
  appareil: () => tr('Programme de l’appareil'),
  capteur: () => tr('Programme de l’appareil'),
};
const motSource = (s) => (MOT_SOURCE[s] ? MOT_SOURCE[s]() : null);
// Le mode d'un Aqara, dans les mots du Planning : « Manual » n'est pas un mot.
const motModeDe = (v) => { const k = String(v).toLowerCase(); return k === 'manual' ? trSens('Manuel · mode') : k === 'schedule' ? trSens('Programmé · mode') : null; };
const MOT_CONSOMMABLE = { deshydratant: () => tr('Déshydratant'), filtre: () => tr('Filtre'), nettoyage: () => tr('Nettoyage') };
const muette = (st) => !st || st.state === 'unavailable';
const heureDe = (t) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
/* L'origine du lien « Modifier dans Home Assistant », comme Paramètres. Rien
 * hors navigateur (les tests), rien dans la démo : elle n'a pas de Home Assistant. */
const origineHA = () => {
  if (typeof window === 'undefined' || window.__loggiaDemo) return null;
  try { return (window.top && window.top.location.origin) || window.location.origin; } catch { return window.location.origin; }
};

/**
 * L'heure d'un repas AJOUTÉ : la première heure pleine libre à partir de
 * 08:00, puis depuis minuit. « Ajouter » posait toujours 08:00 : à côté d'un
 * repas de 08:00, deux lignes identiques, actives tous les jours — deux
 * rations si l'on fermait la fiche sans retoucher l'heure, le serveur
 * n'écartant les doublons que par identifiant (05/10). Douze repas au plus :
 * une heure pleine reste toujours libre.
 */
export function heureLibre(repas) {
  const prises = new Set((Array.isArray(repas) ? repas : []).map(r => r && r.heure));
  for (let i = 0; i < 24; i++) {
    const h = String((8 + i) % 24).padStart(2, '0') + ':00';
    if (!prises.has(h)) return h;
  }
  return '08:00';
}

/* ════════════ L'accueil (sa maquette « Cartes IoT », 1e ; I22, I23 ; § 7.8) ════════════ */

/* Les panneaux de sa maquette (§ 7.5) : `--o-s3`, le liseré, le rayon 18 — le panneau du socle, sans son dégradé ni son ombre. */
const CADRE = { ...PANNEAU, background: 'var(--o-s3)', boxShadow: 'none', borderRadius: 18, padding: '16px 18px' };
// Le cadre d'une tuile : celui d'un panneau ; sa marge (14 × 16, 14 × 12 sous 290 px de tuiles) est celle des tuiles du robot (`rb-a-tuile`).
const CADRE_TUILE = { background: 'var(--o-s3)', border: LISERE, borderRadius: 18, boxSizing: 'border-box', minWidth: 0 };
// Deux lignes au plus, coupées entre deux mots, puis « … » : « Mahlzeiten: 1 · 12 g », « Harmonogram Loggii » au téléphone (05/10).
const DEUX_LIGNES = { overflow: 'hidden', overflowWrap: 'anywhere', hyphens: 'auto', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' };
/* Les puces de sa maquette (`ChipButton`) : 40 px, le rayon 10, le gris doux ; d'accent — « Oui, 100 % », « Distribuer » —, le bleu
 * plein et le blanc. Le pas à pas de « Servir maintenant » : deux puces carrées de 44 px. */
const PUCE = { height: 40, padding: '0 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
  background: 'var(--o-s1)', color: 'var(--o-text1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0 };
const ACCENT = { background: 'var(--o-accent-fond)', color: '#fff' };
const PAS = { ...PUCE, width: 44, height: 44, padding: 0 };
/* Le mot d'une anomalie de l'appareil, en entier : la carte en dit le court (« Problème signalé »). */
const MOT_ANOMALIE = { bas: () => tr('Bac presque vide'), bloque: () => tr('Distribution bloquée'), autre: () => tr('Problème signalé par l’appareil') };
const grammesLisibles = (g) => (Math.round(g * 10) / 10).toLocaleString(locale(), { maximumFractionDigits: 1 });

/* Une tuile de l'Accueil (14 × 16) : son nom 12 / 700 au gris secondaire, la valeur 20 / 800, la ligne 12 / 600 ; elle ouvre un
 * onglet. La valeur et la ligne passent sur deux lignes plutôt que de disparaître : la mise en page cède, pas les mots (05/10). La
 * valeur se resserre aussi, comme celle du robot, sous 340 et 290 px de tuiles (`rb-d-tuile-titre`, index.css) : à 320 px,
 * « Mahlzeiten: 1 · 45 g » se coupait en « Mahlzeite / n: » (vérification dans `?demo`, étape 2 du chantier IoT, tâche 8). */
function Tuile({ nom, titre, sous, onClick }) {
  return (
    <button type="button" className="rb-a-tuile" onClick={onClick} style={{ ...CADRE_TUILE, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'inherit' }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--o-text2)' }}>{nom}</span>
      <span className="rb-d-tuile-titre" style={{ fontWeight: 800, letterSpacing: '-.01em', marginTop: 6, ...DEUX_LIGNES }}>{titre}</span>
      {sous && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2, ...DEUX_LIGNES }}>{sous}</span>}
    </button>
  );
}

/* L'Accueil : le réservoir — « RÉSERVOIR », « 30 % » en 48 / 800, sa réserve, la barre ambre de 8 px — et « Je l'ai rempli », qui
 * DEMANDE (« Remettre le niveau à 100 % ? » · « Annuler » · « Oui, 100 % ») : seulement sur une aide `input_number` vivante (`onRempli`)
 * — un vrai capteur se remplit tout seul. « Servir maintenant » (I23), selon la commande de l'appareil (ADR 0155, R1) : une commande qui
 * ÉCRIT une quantité compte les portions de CE geste ; sinon la taille de ration de l'appareil, s'il en a une, s'écrit aussitôt et vaut
 * pour les rations suivantes ; un bouton sans taille, « Distribuer » seul. « Distribuer » est le geste PARTAGÉ de la carte : deux
 * appuis, d'ici ou d'elle, une ration ; puis « Demande envoyée à 18:20 », et « Servi à 18:21 · 12 g » quand un compteur de l'appareil
 * bouge — dans la minute, sinon la demande seule : rien ne s'invente. Les tuiles, et « État du distributeur » seulement quand
 * l'appareil se plaint (I22). Muet, rien ne se commande ici : pas de « Servir maintenant » du tout, rien d'inerte. */
function OngletAccueil({ hass, lecture, niveau, reservoirMort, phraseReserve, bas, onRempli, prochain, aujourdhui, alertes, mesure, allerA, idRepli = null }) {
  const S = (hass && hass.states) || {};
  const c = lecture.commande;
  // « Distribuer » : absent quand l'appareil ne répond pas (la commande muette ou sa connectivité coupée) ; un réservoir muet, lui, n'empêche pas la vis.
  const peutDistribuer = !!c && !(lecture.enLigne.mort && lecture.enLigne.raison !== 'reservoir');
  /* La question de « Je l'ai rempli ». Au clavier, la puce démontée laissait le focus tomber sur <body> : il va à « Annuler », puis
   * revient à la puce — ou, le bac rempli (elle n'est plus là), à « Distribuer » (vérification dans `?demo`, tâche 8), ou, l'appareil
   * muet (« Distribuer » parti aussi), à l'onglet (`idRepli` ; passe bis, point G). Un bac qui se remplit d'ailleurs pendant la
   * question la referme : elle ne reviendrait pas toute seule plus tard. */
  const [question, setQuestion] = useState(false);
  const idBac = useId();
  const aRemplir = !!onRempli;
  useEffect(() => { if (!aRemplir) setQuestion(false); }, [aRemplir]);
  const demander = () => { setQuestion(true); focaliser(idBac + '-annuler'); };
  const refermer = () => { setQuestion(false); focaliser(idBac + '-rempli', idBac + '-distribuer', idRepli); };
  /* Les portions de CE geste, pour une commande qui écrit une quantité : jamais moins que ce qui part VRAIMENT — `valeurPortions` relève
   * la valeur au minimum de l'entité (min 2 → « 2 portions · 12 g » ; passe bis, point G). */
  const pasC = c && c.pas > 0 ? c.pas : 1;
  const nMin = c && c.quantite ? Math.max(1, Math.ceil((c.min != null ? c.min : 1) / pasC)) : 1;
  const nMax = c && c.quantite ? Math.max(nMin, Math.min(PORTIONS_MAX, c.max != null ? Math.floor(c.max / pasC) : PORTIONS_MAX)) : 1;
  const [n, setN] = useState(nMin);
  // La taille de ration de l'appareil : sa valeur, montrée tout de suite (useOptimiste), et SON unité.
  const p = lecture.portion;
  const vReel = p && S[p.entity_id] ? Number(S[p.entity_id].state) : null;
  const reel = vReel != null && Number.isFinite(vReel) ? vReel : null;
  const [ov, poserOv] = useOptimiste(reel);
  const pv = ov != null ? ov : reel;
  const pasP = p && p.pas > 0 ? p.pas : 1;
  const poserPortion = (v) => {
    const borne = Math.max(p.min != null ? p.min : -Infinity, Math.min(p.max != null ? p.max : Infinity, Math.round(v * 1000) / 1000));
    poserOv(borne);
    commanderService(hass, p.entity_id, 'number', 'set_value', { entity_id: p.entity_id, value: borne });
  };
  const gpp = mesure && mesure.grammesParPortion > 0 ? mesure.grammesParPortion : null;
  const portions = (k) => trN(k, '{n} portion', '{n} portions') + (gpp ? ' · ' + grammesLisibles(k * gpp) + ' g' : '');
  /* Le pas à pas de l'appareil règle une TAILLE de ration — une unité qui n'est pas une masse compte des portions —, jamais une entité
   * de poids (passe bis de l'étape 2, 19/10 ; D1) : sur le number désigné en grammes, il aurait réglé l'étalonnage de l'appareil. */
  const pas = !peutDistribuer ? null
    : c.quantite ? { valeur: portions(n), moins: n > nMin ? () => setN(x => Math.max(nMin, x - 1)) : null, plus: n < nMax ? () => setN(x => Math.min(nMax, x + 1)) : null, appareil: false }
      : p && pv != null && !estMasse(p.unite) ? { valeur: portions(pv),
        moins: p.min == null || pv - pasP >= p.min ? () => poserPortion(pv - pasP) : null, plus: p.max == null || pv + pasP <= p.max ? () => poserPortion(pv + pasP) : null, appareil: true }
        : null;
  /* Le geste : le verrou partagé, puis la commande de l'appareil (`lancerDistribution`, qui tient le verrou jusqu'à la réponse de Home
   * Assistant). La demande retient ce que disaient les compteurs de l'appareil à l'appui ; un compteur qui MONTE dans la minute — une
   * vraie hausse, pas un battement par « unavailable » (passe bis, point G) —, ou un « dernier repas » qui change, dit qu'une ration
   * est tombée — et combien, s'il compte des grammes. Une fois servie, elle le reste. */
  const vol = useDistribution();
  const temoins = [...lecture.historique.compteurs, lecture.historique.dernier].filter(Boolean);
  const valeur = (e) => { const v = e ? Number(e.state) : NaN; return e && e.state !== '' && Number.isFinite(v) ? v : null; };
  const releve = () => Object.fromEntries(temoins.map(id => [id, S[id] ? { v: valeur(S[id]), s: S[id].state } : null]));
  const grammesCompteur = () => {
    for (const id of lecture.historique.compteurs) {
      const e = S[id];
      const u = e && e.attributes ? e.attributes.unit_of_measurement : null;
      const v = valeur(e);
      // Un compteur dans une masse (g, kg, oz… : `estMasse`), en grammes ; sans unité, il compte des portions, pas des grammes.
      if (estMasse(u) && v != null) return enGrammes(v, u);
    }
    return null;
  };
  const [demande, setDemande] = useState(null);
  const distribuer = () => {
    const e = peutDistribuer ? envoiDistribuer(c, c.quantite ? n : 1) : null;
    if (!e || !lancerDistribution(hass, e)) return;
    setDemande({ t: Date.now(), avant: releve(), g: grammesCompteur(), ration: grammesRation(mesure, c, c.quantite ? n : 1), servi: null });
  };
  const aServi = (x) => {
    const av = demande.avant[x], e = S[x];
    if (!e || !av) return false;
    /* Le capteur « dernier repas » : une heure NOUVELLE, postérieure à l'appui. Muet (« unavailable ») à l'appui puis revenu à son
     * ancienne heure, il passait pour un repas — « différent d'avant » ne vaut rien quand avant ne se lisait pas (passe bis 2, 19/10). */
    if (x === lecture.historique.dernier) { const t = Date.parse(e.state); return !isNaN(t) && t > demande.t; }
    const v = valeur(e);
    return v != null && av.v != null && v > av.v;
  };
  const bouge = demande && !demande.servi && Date.now() - demande.t <= 60000 ? temoins.find(aServi) : null;
  const tBouge = bouge ? Date.parse(S[bouge].last_changed) : null;
  const gBouge = bouge ? grammesCompteur() : null;
  useEffect(() => {
    if (tBouge == null) return;
    setDemande(d => (d && !d.servi ? { ...d, servi: { t: tBouge, g: gBouge != null && d.g != null && gBouge > d.g ? gBouge - d.g : d.ration } } : d));
  }, [tBouge, gBouge]);
  const geste = !demande ? null
    : demande.servi ? { texte: demande.servi.g != null ? tr('Servi à {h} · {g} g', { h: heureDe(demande.servi.t), g: grammesLisibles(demande.servi.g) }) : tr('Servi à {h}', { h: heureDe(demande.servi.t) }), encre: 'var(--o-ok)' }
      : { texte: tr('Demande envoyée à {h}', { h: heureDe(demande.t) }), encre: 'var(--o-text2)' };
  return (
    <div className="rb-accueil" style={{ gap: 12 }}>
      {(niveau.pct != null || reservoirMort) && (
        /* L'aide du bac muette : le liseré est ici, sur son panneau — la vis répond, l'en-tête ne crie pas à la panne (passe bis, point G). */
        <div className={reservoirMort ? 'o-panne' : undefined} style={CADRE}>
          {/* Le chiffre et la puce sur une ligne ; trop étroit (« Ich habe nachgefüllt » à 320 px), la puce passe dessous plutôt que
            * d'écraser « 38 % » (tâche 8). */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px 16px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 150px' }}>
              <div style={PETITES_CAPITALES}>{tr('Réservoir')}</div>
              {reservoirMort
                ? <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--o-text3)', marginTop: 8 }}>{tr('Indisponible')}</div>
                : <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, fontWeight: 800, lineHeight: 1, marginTop: 8, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}><span style={{ fontSize: 48, letterSpacing: '-.03em' }}>{niveau.pct}</span><span style={{ fontSize: 22 }}>%</span></div>}
              {!reservoirMort && <div style={{ fontSize: 12.5, fontWeight: 600, color: bas ? 'var(--o-warn)' : 'var(--o-text2)', marginTop: 8 }}>{phraseReserve}</div>}
            </div>
            {onRempli && !question && <button type="button" id={idBac + '-rempli'} onClick={demander} style={PUCE}><Fi i="check" size={12} />{tr('Je l’ai rempli')}</button>}
          </div>
          {!reservoirMort && (
            <div aria-hidden="true" style={{ position: 'relative', height: 8, marginTop: 14, borderRadius: 4, background: 'var(--o-s1)', overflow: 'hidden' }}>
              <span data-barre="" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: niveau.pct + '%', borderRadius: 4, background: 'var(--o-piece-ambre)' }} />
            </div>
          )}
          {/* La question de sa maquette, sous la barre ; son « Annuler » ferme la question, pas la feuille. */}
          {onRempli && question && (
            <div role="group" aria-label={tr('Remettre le niveau à 100 % ?')} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              {/* Trop étroit, les deux puces passent sous la question plutôt que de la réduire à un mot par ligne (tâche 8). */}
              <span style={{ flex: '1 1 140px', minWidth: 0, fontSize: 13, fontWeight: 700 }}>{tr('Remettre le niveau à 100 % ?')}</span>
              <button type="button" id={idBac + '-annuler'} onClick={refermer} style={PUCE}>{tr('Annuler')}</button>
              <button type="button" onClick={() => { onRempli(); refermer(); }} style={{ ...PUCE, ...ACCENT }}>{tr('Oui, 100 %')}</button>
            </div>
          )}
        </div>
      )}

      {peutDistribuer && (
        <div style={CADRE}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{tr('Servir maintenant')}</div>
          {/* − 2 portions · 12 g + et « Distribuer » sur une ligne ; au téléphone, « Distribuer » passe dessous, pleine largeur. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {/* Jamais un curseur pour ce qui distribue : un glissé de trop et la vis tourne. */}
            {/* La valeur revient à la ligne (« 2 Portionen · » / « 12 g ») plutôt que de pousser « + » hors de l'écran à 320 px. */}
            {pas && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: '0 1 auto', minWidth: 0 }}>
                <button type="button" aria-label={tr('Portion plus petite')} title={tr('Portion plus petite')} onClick={pas.moins || undefined} disabled={!pas.moins} style={{ ...PAS, opacity: pas.moins ? 1 : .4 }}><Fi i="minus-small" size={16} /></button>
                <span style={{ minWidth: 64, textAlign: 'center', fontSize: 17, fontWeight: 800, lineHeight: 1.2, overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{pas.valeur}</span>
                <button type="button" aria-label={tr('Portion plus grande')} title={tr('Portion plus grande')} onClick={pas.plus || undefined} disabled={!pas.plus} style={{ ...PAS, opacity: pas.plus ? 1 : .4 }}><Fi i="plus-small" size={16} /></button>
              </span>
            )}
            {/* Le verrou partagé : `aria-disabled`, pas `disabled` — un bouton désactivé perd le focus (05/10). */}
            <button type="button" onClick={distribuer} id={idBac + '-distribuer'} aria-disabled={vol ? 'true' : undefined} style={{ ...PUCE, ...ACCENT, height: 44, flex: '1 1 120px', minWidth: 0, fontSize: 13 }}>
              <Fi i="paw" size={13} />{tr('Distribuer')}
            </button>
          </div>
          {pas && pas.appareil && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 8 }}>{tr('Elle vaut pour les rations suivantes.')}</div>}
          {geste && <div role="status" style={{ fontSize: 12, fontWeight: 700, color: geste.encre, marginTop: 10 }}>{geste.texte}</div>}
        </div>
      )}

      {(prochain || aujourdhui) && (
        <div className="rb-a-tuiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(' + (prochain && aujourdhui ? 2 : 1) + ', minmax(0, 1fr))', gap: 12 }}>
          {prochain && <Tuile nom={tr('Prochain repas')} titre={prochain.titre} sous={prochain.sous} onClick={() => allerA('planning')} />}
          {aujourdhui && <Tuile nom={tr('Aujourd’hui')} titre={aujourdhui.titre} sous={aujourdhui.sous} onClick={() => allerA('historique')} />}
        </div>
      )}

      {/* Seulement quand l'appareil se plaint (I22) : l'ambre à 0,08, son filet à 0,3 — la rangée d'alerte d'un robot. Jamais « Aucun problème ». */}
      {alertes.length > 0 && (
        <div role="status" className="rb-a-alerte" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 18, background: 'rgba(var(--o-warn-rgb),.08)', border: '1px solid rgba(var(--o-warn-rgb),.3)' }}>
          <Fi i="triangle-warning" size={15} color="var(--o-warn)" />
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700 }}>{tr('État du distributeur')}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--o-warn)', textAlign: 'right' }}>{alertes.join(' · ')}</span>
        </div>
      )}
    </div>
  );
}

/* ════════════ Repas (I24 ; sa maquette 1e) ════════════
 *
 * Les règles du serveur ne changent pas (ADR 0155) ; le dessin suit sa maquette : la rangée « Programme de l'appareil », qui dit qui
 * sert et son mode ; « VOS AUTOMATISATIONS » ; « Associer une automatisation », à l'accent. Le planning de Loggia, « Deux sources », la
 * mise en garde et l'ancienne liste restent, sur les mêmes panneaux. */

/* Un bloc : son titre en petites capitales (« VOS AUTOMATISATIONS »), une phrase qui dit d'où il vient, ses lignes. */
const Bloc = ({ titre, sous = null, action = null, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 24 }}>
      <div style={PETITES_CAPITALES}>{titre}</div>{action}
    </div>
    {sous && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: -4 }}>{sous}</div>}
    {children}
  </div>
);
// Un panneau de rangées : celui de sa maquette, ses rangées jusqu'au bord.
const LISTE = { ...CADRE, padding: 0, overflow: 'hidden' };
// Les liens de sa maquette (« Associer une automatisation ») : l'accent doux, 12,5 / 800 — plus l'orange de l'ancienne fiche (I8).
const LIEN = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 2px', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12.5, fontWeight: 800, color: 'var(--o-accent-soft)' };
const MOT = { fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', lineHeight: 1.5 };
const AVIS = { padding: '12px 16px', borderRadius: 'var(--o-radius,18px)', fontSize: 13, fontWeight: 700, lineHeight: 1.45, background: 'rgba(var(--o-warn-rgb),.13)', color: 'var(--o-text1)' };

/* Le programme de l'appareil : UNE rangée — son nom, la phrase qui dit qui sert, et son mode (Aqara : « Manuel › », qui ouvre
 * Réglages) —, puis ses créneaux s'il se lit. Qui sert : « Ce sont vos automatisations qui servent » quand l'appareil est en mode
 * manuel et qu'une automatisation est allumée (`servent`) ; sinon ce qu'on sait de son programme, ou rien. */
function BlocProgramme({ p, premier, versReglages, idMode, servent }) {
  const mode = p.mode === 'programme' ? trSens('Programmé · mode') : p.mode === 'manuel' ? trSens('Manuel · mode') : null;
  const phrase = p.mode === 'manuel' ? (servent ? tr('Ce sont vos automatisations qui servent') : null)
    : p.lisible ? null
      : p.note === 'capteur_diagnostic' ? tr('Programme non lisible : activez le capteur de diagnostic de l’appareil.')
        : p.note === 'tenu_par_appareil' && p.mode === 'programme' ? tr('L’appareil peut aussi distribuer selon ses propres créneaux. Passez-le en mode manuel dans Réglages si vous ne vous en servez pas.')
          : p.presente ? tr('Tenu par l’appareil : modifiez-le dans l’application du fabricant.') : null;
  const corps = (
    <>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{tr('Programme de l’appareil')}</span>
        {phrase && <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2, lineHeight: 1.4 }}>{phrase}</span>}
      </span>
      {mode && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: 'var(--o-text2)', flexShrink: 0 }}>{mode}<Fi i="angle-small-right" size={16} color="var(--o-text3)" /></span>}
    </>
  );
  const rangee = { ...CADRE, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px 12px 16px' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      {mode ? <button type="button" id={idMode} onClick={versReglages} style={{ ...rangee, width: '100%', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'left' }}>{corps}</button>
        : <div style={rangee}>{corps}</div>}
      {p.lisible && (p.repas || []).length > 0 && (
        <div style={LISTE}>
          {p.repas.map((r, i) => (
            // Un créneau éteint : son heure en gris de texte, jamais une opacité sur la ligne — elle
            // estompait « Éteint » lui-même, le mot qui DIT l'état, jusqu'à 2,3:1 (05/10).
            <div key={i + r.heure} style={{ ...LIGNE, padding: '14px 16px', borderTop: filet(i) }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: r.actif ? undefined : 'var(--o-text2)' }}>{r.heure}</span>
                <span style={SOUS}>{[libelleJours(r.jours, premier, locale()), r.portions > 0 ? trN(r.portions, '{n} portion', '{n} portions') : null].filter(Boolean).join(' · ')}</span>
              </span>
              {/* « Éteint », pas « Inactif » : celui-ci est le `idle` de Home Assistant, « Idle » en anglais (05/10). */}
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--o-text2)', flexShrink: 0 }}>{!r.actif ? tr('Éteint') : r.etat_jour === 'dispensed' ? tr('Terminé') : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* « Vos automatisations » : UNE rangée par automatisation — son nom (14 / 700), ses heures lues dans son déclencheur (17 / 800), ses
 * jours (12) —, son interrupteur (si le compte la commande), et le lien vers son éditeur (si Home Assistant le laisse modifier).
 * « Couper cette automatisation coupe ses 2 repas. » seulement quand elle sert : coupée, « couper » ne veut plus rien dire. */
function LigneAutomatisation({ a, i, on, mort, premier, basculer, origine, ordinaire, dissocier }) {
  const heures = Array.isArray(a.heures) ? a.heures.filter(heureValide) : [];
  const details = [libelleJours(a.jours, premier, locale()), a.conditionnel ? tr('Selon une condition') : null,
    a.portions > 0 ? trN(a.portions, '{n} portion', '{n} portions') : null].filter(Boolean).join(' · ');
  const indice = a.indice === 'ancienne_liste' ? tr('Reconnue par votre ancienne liste') : a.indice === 'associee' ? tr('Associée à la main') : null;
  return (
    <div className={mort ? 'o-panne' : undefined} style={{ padding: '14px 16px', borderTop: mort ? 'none' : filet(i), ...(mort ? { borderRadius: 14 } : null) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Coupée : en gris de texte, que la garde tient à 4,5:1 — l'opacité .6 la laissait à 3,5:1 (05/10). */}
        <span style={{ flex: 1, minWidth: 0, color: on || mort ? undefined : 'var(--o-text2)' }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nom}</span>
          <span style={{ display: 'block', fontSize: 17, fontWeight: 800, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{libelleHeures(a)}</span>
          {details && <span style={SOUS}>{details}</span>}
        </span>
        {mort ? <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text3)', flexShrink: 0 }}>{tr('Indisponible')}</span>
          : a.pilotable ? <Bascule on={on} nom={a.nom} cb={basculer} />
            // Sans interrupteur, l'état se DIT : une opacité seule ne se lit pas (05/10).
            : !on ? <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text3)', flexShrink: 0 }}>{tr('Éteinte')}</span> : null}
      </div>
      {on && !mort && heures.length > 1 && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 4 }}>{trN(heures.length, 'Couper cette automatisation coupe ses {n} repas.', 'Couper cette automatisation coupe ses {n} repas.')}</div>}
      {(indice || (a.modifiable && a.id_config && origine) || (a.indice === 'associee' && !ordinaire)) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
          {indice && <span style={{ ...PETITES_CAPITALES, fontSize: 9.5 }}>{indice}</span>}
          {a.modifiable && a.id_config && origine && (
            <a href={origine + '/config/automation/edit/' + encodeURIComponent(a.id_config)} target="_top" rel="noopener" style={{ ...LIEN, textDecoration: 'none' }}>{tr('Modifier dans Home Assistant')}<Fi i="arrow-right" size={10} color="var(--o-accent-soft)" /></a>
          )}
          {a.indice === 'associee' && !ordinaire && <button type="button" onClick={dissocier} style={LIEN}>{tr('Dissocier')}</button>}
        </div>
      )}
    </div>
  );
}

/* Le planning de Loggia : chaque repas se règle sur place. Grisé « En pause »
 * quand une source supérieure distribue — le serveur RETIENT alors chaque
 * départ, et reprend seul. Un compte ordinaire le lit, sans rien régler. */
function RepasLoggia({ r, i, jours, quantite, ordinaire, poser, supprimer }) {
  const heure = r.heure;
  // Un groupe nommé par son heure : « Heure », « Lundi », « Supprimer » de chaque repas disent
  // à quel repas ils appartiennent (05/10). Éteint : l'heure en gris de texte, pas en opacité.
  return (
    <div role="group" aria-label={tr('Repas de {h}', { h: heure })} style={{ padding: '14px 16px', borderTop: filet(i) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          {ordinaire ? <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', color: r.actif ? undefined : 'var(--o-text2)' }}>{heure}</span>
            : <ChampHeure valeur={heure} nom={tr('Heure')} onValide={(v) => poser({ ...r, heure: v })} />}
        </span>
        {quantite && (ordinaire
          ? <span style={{ fontSize: 13.5, fontWeight: 700 }}>{trN(r.portions, '{n} portion', '{n} portions')}</span>
          : <PasAPas valeur={trN(r.portions, '{n} portion', '{n} portions')} peutMoins={r.portions > 1} peutPlus={r.portions < PORTIONS_MAX}
            moins={() => poser({ ...r, portions: r.portions - 1 })} plus={() => poser({ ...r, portions: r.portions + 1 })} />)}
        {!ordinaire ? <Bascule on={!!r.actif} nom={tr('Repas de {h}', { h: heure })} cb={() => poser({ ...r, actif: !r.actif })} />
          : !r.actif ? <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text3)' }}>{tr('Éteint')}</span> : null}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Les pastilles des jours d'un repas éteint, en retrait : du décor, pas un texte qui dit l'état. */}
        {jours.map(j => <PuceJour key={j} j={j} disabled={ordinaire} attenue={!r.actif} on={(r.jours || []).indexOf(j) >= 0}
          onClick={() => poser({ ...r, jours: (r.jours || []).indexOf(j) >= 0 ? r.jours.filter(y => y !== j) : [...(r.jours || []), j].sort() })} />)}
        {!ordinaire && <span style={{ marginLeft: 'auto' }}><BoutonConfirme libelle={tr('Supprimer')} onConfirme={supprimer} /></span>}
      </div>
    </div>
  );
}

function OngletPlanning({ hass, etat, erreur, ordinaire, allumee, demander, premier, versReglages, ecrire, err, associer, dissocier, enLigneAuto, idBase }) {
  const S = (hass && hass.states) || {};
  if (!etat) {
    return <div role={erreur ? 'status' : undefined} style={{ ...CADRE, ...MOT, fontSize: 13 }}>{erreur ? tr('Planning indisponible pour l’instant.') : tr('Chargement…')}</div>;
  }
  const vue = planningAffiche(etat, { ordinaire, allumee });
  const autos = (Array.isArray(etat.automatisations) ? etat.automatisations : []).filter(Boolean);
  const repas = (etat.planning && Array.isArray(etat.planning.repas) ? etat.planning.repas : []).slice().sort((a, b) => (a.heure < b.heure ? -1 : a.heure > b.heure ? 1 : 0));
  const jours = ordreJours(premier);
  const quantite = !!(etat.commande && etat.commande.quantite);
  const origine = origineHA();
  const poserRepas = (r) => ecrire(repas.map(x => (x.id === r.id ? r : x)));
  // Le premier repas remplace l'état vide par le bloc du planning : le bouton activé au clavier
  // est démonté, le focus tombait sur <body> (05/10, contre-relecture). Il va au nouvel
  // « Ajouter un repas », sinon (douze repas) à l'onglet. Même chemin qu'une suppression.
  const ajouter = () => { ecrire([...repas, { id: 'r' + Date.now().toString(36), heure: heureLibre(repas), jours: [0, 1, 2, 3, 4, 5, 6], portions: 1, actif: true }]); focaliser(idBase + '-ajouter', idBase + '-t-planning'); };
  // Un repas supprimé démonte son bouton : le focus va à « Ajouter un repas », sinon à l'onglet.
  const supprimer = (id) => { ecrire(repas.filter(x => x.id !== id)); focaliser(idBase + '-ajouter', idBase + '-t-planning'); };
  const basculer = (a) => {
    const on = allumee(a);
    demander(a.entity_id, !on, S[a.entity_id], (S[a.entity_id] ? S[a.entity_id].state : a.etat) === 'on');
    commanderService(hass, a.entity_id, 'homeassistant', on ? 'turn_off' : 'turn_on', { entity_id: a.entity_id });
  };
  // « Associer une automatisation » : ce que Home Assistant ne référence pas
  // (mqtt.publish vers zigbee2mqtt, cible en gabarit, zone, étiquette).
  const deja = new Set(autos.map(a => a.entity_id));
  const candidates = Object.keys(S).filter(id => id.indexOf('automation.') === 0 && !deja.has(id))
    .map(id => ({ id, label: cvName(S[id], id), sub: id })).sort((a, b) => comparerTextes(a.label, b.label));
  const lienAssocier = !ordinaire && candidates.length > 0 ? (
    <ListeChoix value={null} options={candidates} onChange={associer} label={tr('Associer une automatisation')} nom={tr('Associer une automatisation')} style={LIEN}>
      {() => <><Fi i="add" size={12} color="var(--o-accent-soft)" />{tr('Associer une automatisation')}</>}
    </ListeChoix>
  ) : null;
  const ajout = vue.peutAjouter && repas.length < MAX_REPAS ? <button type="button" id={idBase + '-ajouter'} onClick={ajouter} style={LIEN}><Fi i="add" size={12} color="var(--o-accent-soft)" />{tr('Ajouter un repas')}</button> : null;
  /* Le planning de Loggia se PROPOSE dès que le serveur le permet (`peutPlanifier`) et
   * qu'il n'existe pas encore — même sous le bloc « Programme de l'appareil » : un Aqara
   * en mode manuel montre son mode, et n'obtenait jamais « Ajouter un repas » (05/10). */
  const proposition = vue.peutAjouter && !vue.blocs.loggia && !vue.blocs.automatisations;
  return (
    <div className="rb-planning">
      {err && <div role="alert" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--o-bad)' }}>{err}</div>}
      {vue.deuxSources && <div role="note" style={AVIS}>{tr('Deux sources distribuent : vérifiez qu’un repas ne part pas deux fois.')}</div>}

      {vue.blocs.programme && <BlocProgramme p={etat.programme} premier={premier} versReglages={versReglages} idMode={idBase + '-mode'} servent={autos.some(a => enLigneAuto(a) && allumee(a))} />}

      {vue.blocs.automatisations && (
        <Bloc titre={tr('Vos automatisations')}>
          <div style={LISTE}>
            {autos.map((a, i) => (
              <LigneAutomatisation key={a.entity_id} a={a} i={i} on={allumee(a)} mort={!enLigneAuto(a)} premier={premier} origine={origine} ordinaire={ordinaire}
                basculer={() => basculer(a)} dissocier={() => dissocier(a.entity_id)} />
            ))}
          </div>
          {/* Discret, SOUS la liste : dans l'en-tête du bloc, il passait sur deux lignes au téléphone. */}
          {lienAssocier && <div>{lienAssocier}</div>}
        </Bloc>
      )}

      {vue.blocs.loggia && (
        <Bloc titre={tr('Planning de Loggia')} sous={tr('Loggia distribue à ces heures, même écran fermé.')} action={ajout}>
          {vue.pause && (
            <div role="note" style={AVIS}>{tr('En pause : une autre source distribue déjà.')} {tr('Reprendra seul quand l’autre source s’arrêtera.')}</div>
          )}
          <div style={{ ...LISTE, opacity: vue.pause ? .6 : 1 }}>
            {repas.map((r, i) => (
              <RepasLoggia key={r.id} r={r} i={i} jours={jours} quantite={quantite} ordinaire={ordinaire}
                poser={poserRepas} supprimer={() => supprimer(r.id)} />
            ))}
          </div>
        </Bloc>
      )}

      {/* Les trois états vides : une commande et rien de programmé ; aucune commande. */}
      {vue.vide === 'aucun' && (
        <div style={{ ...CADRE, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ ...MOT, fontSize: 13 }}>{tr('Aucun repas programmé.')}</span>{ajout}
        </div>
      )}
      {/* Sous le programme de l'appareil, l'état vide dit QUEL planning est vide. */}
      {vue.blocs.programme && proposition && (
        <Bloc titre={tr('Planning de Loggia')} sous={tr('Loggia distribue à ces heures, même écran fermé.')} action={ajout}>
          <div style={{ ...CADRE, ...MOT, fontSize: 13 }}>{tr('Aucun repas programmé.')}</div>
        </Bloc>
      )}
      {vue.vide === 'sans_commande' && <div style={{ ...CADRE, ...MOT, fontSize: 13 }}>{tr('Loggia ne sait pas commander ce distributeur : désignez son appareil ou son script de distribution dans Paramètres.')}</div>}
      {vue.miseEnGarde && <div role="note" style={AVIS}>{tr('Si l’application du fabricant programme aussi des repas, coupez-les : sinon l’animal mange deux fois.')}</div>}
      {/* Avec la proposition seulement : sous un planning de Loggia rempli, elle flottait seule (05/10). */}
      {vue.ancienneListe && proposition && <div style={MOT}>{tr('Votre ancienne liste ne distribuait rien par elle-même.')}</div>}
      {!vue.blocs.automatisations && lienAssocier && <div>{lienAssocier}</div>}
    </div>
  );
}

/* ════════════ L'historique ════════════ */

/* L'Historique de sa maquette (I25) : « 7 DERNIERS JOURS » et « 21 repas · 252 g » (20 / 800) ; puis une rangée par repas, dans la
 * feuille qui défile — le jour dans son badge, le titre VRAI (13,5 / 700), le moment (12), la pastille d'origine et les grammes
 * (14 / 800). Les barres de la semaine partent. Au téléphone, la pastille et les grammes passent sous le titre plutôt que de le
 * couper : la mise en page cède, pas les mots. */
const PASTILLE_ORIGINE = { automatisme: () => [tr('Automatisme'), 'magic-wand'], main: () => [tr('À la main'), 'hand'], appareil: () => [tr('Appareil'), 'calendar-clock'] };
const pastilleDe = (o) => (o && PASTILLE_ORIGINE[o] ? PASTILLE_ORIGINE[o]() : null);

// Exporté pour les tests : un rendu côté serveur ne lance pas l’effet qui lit l’historique.
export function OngletHistorique({ semaine, chargee, erreur, aveugle, maintenant }) {
  if (erreur) return <div role="alert" style={{ ...CADRE, ...MOT, fontSize: 13 }}>{tr('Historique indisponible.')}</div>;
  if (!chargee) return <div style={{ ...CADRE, ...MOT, fontSize: 13 }}>{tr('Lecture de l’historique…')}</div>;
  const jourLong = (t) => { const e = etiquetteJour(t, maintenant, locale()); return e === tr('Auj.') ? tr('Aujourd’hui') : e === tr('Hier') ? tr('Hier') : new Date(t).toLocaleDateString(locale(), { weekday: 'long' }).replace(/^./, c => c.toUpperCase()); };
  const quantite = (l) => l.quantites.filter(q => q.unite).map(q => q.valeur.toLocaleString(locale(), { maximumFractionDigits: 1 }) + ' ' + q.unite).join(' · ');
  // Rien à lire et rien de vu : ni « 0 repas » qui passerait pour une semaine à jeun, ni « Aucun repas » — l'application du fabricant
  // a pu en servir (05/10, contradicteur). La phrase suffit.
  const muet = aveugle && semaine.rangees.length === 0;
  return (
    <div className="rb-histo" style={{ gap: 12 }}>
      {!muet && (
        <div style={CADRE}>
          <div style={PETITES_CAPITALES}>{tr('7 derniers jours')}</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
            {semaine.grammes != null ? trN(semaine.n, '{n} repas · {g} g', '{n} repas · {g} g', { g: semaine.grammes.toLocaleString(locale()) }) : trN(semaine.n, '{n} repas', '{n} repas')}
          </div>
        </div>
      )}
      {aveugle && <div style={MOT}>{tr('L’historique ne voit que les repas partis de Home Assistant.')}</div>}
      {!muet && (
        <div style={LISTE}>
          {semaine.rangees.length === 0 && <div style={{ padding: '14px 16px', ...MOT, fontSize: 13 }}>{tr('Aucun repas ces 7 derniers jours.')}</div>}
          {semaine.rangees.map((r, i) => {
            const o = pastilleDe(r.origine);
            const q = quantite(r);
            return (
              <div key={r.cle} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 12px', padding: '12px 16px', borderTop: filet(i) }}>
                <span style={{ minWidth: 44, height: 36, padding: '0 4px', boxSizing: 'border-box', borderRadius: 10, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', fontSize: 11.5, fontWeight: 800, color: 'var(--o-text1)' }}>{etiquetteJour(r.t, maintenant, locale())}</span>
                <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: 'anywhere' }}>{r.titre}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{jourLong(r.t) + ' ' + heureDe(r.t)}</div>
                </div>
                {(o || q) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginLeft: 'auto', flexShrink: 0 }}>
                    {o && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, background: 'var(--o-s1)', color: 'var(--o-text1)', fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' }}><Fi i={o[1]} size={11} />{o[0]}</span>}
                    {q && <span style={{ minWidth: 44, textAlign: 'right', fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{q}</span>}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════ L'entretien (I26 : seulement s'il y a de quoi) ════════════
 *
 * Les consommables de l'appareil — le déshydratant, le filtre d'un Petlibro ou d'un PetKit — sur le modèle du ROBOT (sa règle ; passe bis
 * de l'étape 2, 19/10, point G) : la brique commune (`OngletEntretien`, fichecommune.jsx) — « Remplacé » DEMANDE (« Remettre Déshydratant
 * à 100 % ? », I20), l'ambre sous 35 %, le rouge sous 15 % (en jours : 7 et 3), aucune phrase quand tout va bien. « Remplacé » est un
 * `button.press` de l'appareil : ouvert à tous (ADR 0144, 05/10). « Je l'ai rempli » et les anomalies sont passés à l'Accueil :
 * l'onglet n'existe plus pour le seul réservoir. */

/* Les consommables sur le gabarit des pièces d'usure du robot : le nom, « 12 jours restants » dessous, le pourcentage s'il se sait,
 * le niveau (`niveauConsommable`), et le bouton qui remet à neuf — s'il répond : un bouton `unavailable` (ou absent de `states`) est
 * écarté ici, comme le robot écarte le sien (`piecesUsure`), et « Remplacé » n'est jamais inerte. La brique du serveur
 * (`consommablesDistributeur`) le garde tel quel : la fixture partagée la fige (passe bis 2 de l'étape 2, 19/10). */
const piecesDe = (consommables, S) => consommables.map(c => ({
  id: c.entity_id, role: c.role, nom: MOT_CONSOMMABLE[c.role] ? MOT_CONSOMMABLE[c.role]() : c.role,
  pct: c.pct != null ? Math.round(Math.max(0, Math.min(100, c.pct))) : null,
  texte: c.jours != null ? trN(Math.round(c.jours), '{n} jour restant', '{n} jours restants') : null,
  niveau: niveauConsommable(c), reset: c.reset && !muette(S[c.reset]) ? c.reset : null,
}));

/**
 * La tuile « Aujourd'hui » (I22) : `{ titre, sous }` — « 3 repas · 36 g » et leurs heures (« 07:30 · 12:00 »), « Rien depuis minuit » —,
 * d'après le compteur du jour de l'appareil, sinon ce que l'historique en a vu (`lignes`, `null` tant qu'il n'est pas lu) — et
 * l'historique seulement s'il VOIT l'appareil (un compteur, un « dernier repas ») : aveugle, il ne compterait que les repas partis de Home
 * Assistant — « 1 repas » cacherait ceux de l'application du fabricant (05/10, contradicteur). Sans compteur ni historique qui voie, rien
 * ne se sait : `null`, et la tuile n'est pas là. Exportée pour les tests : un rendu côté serveur ne lit pas l'historique.
 */
export function tuileAujourdhui(compte, lignes, { aveugle = false, maintenant = Date.now() } = {}) {
  const minuit = new Date(maintenant); minuit.setHours(0, 0, 0, 0);
  const duJour = Array.isArray(lignes) && !aveugle ? lignes.filter(l => l.t >= minuit.getTime()).sort((a, b) => a.t - b.t) : null;
  const nJour = compte.repas != null ? compte.repas : duJour ? duJour.length : null;
  const gLignes = duJour && duJour.some(l => l.grammes != null) ? duJour.reduce((s, l) => s + (l.grammes || 0), 0) : null;
  const gJour = compte.grammes != null ? Math.round(compte.grammes) : gLignes != null ? Math.round(gLignes) : null;
  const titre = nJour != null && gJour != null ? trN(nJour, '{n} repas · {g} g', '{n} repas · {g} g', { g: gJour.toLocaleString(locale()) })
    : nJour != null ? trN(nJour, '{n} repas', '{n} repas') : gJour != null ? gJour.toLocaleString(locale()) + ' g' : null;
  if (!titre) return null;
  return { titre, sous: duJour ? (duJour.length ? duJour.map(l => heureDe(l.t)).join(' · ') : tr('Rien depuis minuit')) : null };
}

/* Le prochain repas, dans sa tuile : « 19:00 » aujourd'hui, « Demain 07:30 », « Mer. 07:30 » au-delà. */
const quandRepas = (t, maintenant, loc) => (new Date(t).toDateString() === new Date(maintenant).toDateString() ? heureDe(t) : etiquetteProchain(t, maintenant, loc));

/* ════════════ La fiche ════════════ */

/**
 * `etat` : la réponse de `loggia/distributeurs/etat` (null tant qu'elle n'est
 * pas là) ; `erreur` : le serveur ne répond pas. `cfg` : `loggia_feeder`.
 * `onEtat(etat)` reçoit une réponse plus fraîche après une écriture — la
 * coquille la range dans son cache. `epingle` : l'épingle de l'ENTITÉ
 * principale, posée par la coquille. `index`, `ongletDepart` et `maintenant`
 * servent aux tests.
 */
export default function FicheDistributeurContent({ hass, etat = null, erreur = false, cfg, onFiche = null, epingle = null, onEtat = null, index, ongletDepart = 'accueil', maintenant = null, plaque = null, sousNom = null }) {
  const S = (hass && hass.states) || {};
  const idx = index === undefined ? LOGGIA_INDEX : index;
  const conf = cfg === undefined ? loggiaEnt('feeder', null) : cfg;
  const t = maintenant == null ? Date.now() : (maintenant instanceof Date ? maintenant.getTime() : Number(maintenant));
  const lecture = lireDistributeur(idx, S, conf);
  const ordinaire = compteOrdinaire(hass);
  const premier = premierJourSemaine(locale());
  const h = hass && typeof hass.callWS === 'function' ? hass : null;
  const vivant = useRef(true);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);

  /* Les automatisations : l'état VIVANT de `hass` (la coquille s'y abonne),
   * et la demande en vol d'abord — une demande par ligne, lue sur la réponse
   * de SA propre entité (`useDemandes`). */
  const [demandes, demander] = useDemandes();
  const etatAuto = (a) => (S[a.entity_id] ? S[a.entity_id].state : a.etat);
  const allumee = (a) => enVol(demandes, a.entity_id, S[a.entity_id], etatAuto(a) === 'on');
  const enLigneAuto = (a) => etatAuto(a) !== 'unavailable';

  /* Le planning de Loggia, montré tout de suite, comme le robot ; la réponse
   * du serveur (ou 6 s) le remplace. */
  const sigPlanning = etat && etat.planning ? JSON.stringify(etat.planning) : null;
  const [planOv, poserPlanOv] = useOptimiste(sigPlanning);
  const vu = etat ? (planOv ? { ...etat, planning: planOv } : etat) : null;
  const [err, setErr] = useState('');
  const refus = (e) => (e && (e.code === 'unauthorized' || e.code === 'not_admin') ? tr('Réservé aux administrateurs.') : estRefus(e) ? raisonEchec(e) : tr('Enregistrement impossible.'));
  const ecrire = async (repas) => {
    if (!h || ordinaire) return;
    poserPlanOv({ ...((etat && etat.planning) || {}), repas });
    try {
      const r = await h.callWS({ type: 'loggia/distributeurs/config', patch: { repas } });
      if (!vivant.current) return;
      setErr('');
      if (onEtat && r && r.etat) onEtat(r.etat);
      else if (onEtat && r && r.config && etat) onEtat({ ...etat, planning: r.config });
    } catch (e) {
      if (!vivant.current) return;
      poserPlanOv(null);
      setErr(refus(e));
    }
  };
  /* « Associer » / « Dissocier » : `loggia_feeder.associees`, relu AU MOMENT de
   * l'écriture (toutes les vues réécrivent cette clé), puis la réponse du
   * serveur relue aussitôt pour que la ligne apparaisse. */
  const poserAssociees = (fn) => {
    if (ordinaire) return;
    const brut = cfgVal('loggia_feeder', null) || conf || {};
    const avant = Array.isArray(brut.associees) ? brut.associees.filter(x => typeof x === 'string') : [];
    cfgSet({ loggia_feeder: { ...brut, associees: fn(avant) } }).then(ok => {
      if (!vivant.current) return;
      if (ok === false) { setErr(tr('Réservé aux administrateurs.')); return; }
      setErr('');
      if (h && onEtat) h.callWS({ type: 'loggia/distributeurs/etat', detail: true }).then(r => { if (vivant.current && r) onEtat(r); }).catch(() => {});
    });
  };
  const associer = (id) => poserAssociees(l => [...new Set([...l, id])]);
  const dissocier = (id) => poserAssociees(l => l.filter(x => x !== id));

  /* L'historique : les compteurs, le capteur du dernier repas et les
   * événements au format minimal ; les automatisations RECONNUES avec leurs
   * attributs (leur `last_triggered`). Relu quand le compteur bouge. */
  const autosReconnues = vu && Array.isArray(vu.automatisations) ? vu.automatisations.filter(a => a && !a.indice).map(a => a.entity_id) : [];
  const hs = lecture.historique;
  const idsHisto = [...hs.compteurs, hs.dernier, ...hs.evenements].filter(Boolean);
  const cleHisto = [...hs.compteurs, hs.dernier].filter(Boolean).map(id => (S[id] ? S[id].last_changed : '')).join('|');
  const reponse = useHistoriquePeriode(hass, { ids: idsHisto, idsAttributs: autosReconnues, jours: JOURS_HISTORIQUE, cle: cleHisto });
  const histoErreur = reponse === 'erreur';
  const brut = histoErreur ? null : reponse;
  // Du calcul à plat, à chaque rendu : quelques centaines de points au plus.
  const lignes = brut ? repasDepuisHistorique(brut, {
    compteurs: hs.compteurs, dernier: hs.dernier, evenements: hs.evenements, automatisations: autosReconnues,
    journal: vu && Array.isArray(vu.journal) ? vu.journal : [], states: S, depuis: t - JOURS_HISTORIQUE * 86400000, maintenant: t,
  }) : [];
  // Les sept jours de l'Historique (I25), chaque repas sous son vrai nom : celui de l'automatisation qui l'a servi.
  const nomsAutos = Object.fromEntries((vu && Array.isArray(vu.automatisations) ? vu.automatisations : []).filter(a => a && a.entity_id).map(a => [a.entity_id, a.nom || cvName(S[a.entity_id], a.entity_id)]));
  const semaine = septJoursRepas(lignes, { noms: nomsAutos, maintenant: t });

  // Le bac : son niveau, sa réserve en jours sur les seuls repas à heure fixe des sources actives.
  const reservoir = conf && conf.haids ? conf.haids.reservoir : null;
  const stRes = typeof reservoir === 'string' && reservoir ? S[reservoir] : undefined;
  const reservoirMort = typeof reservoir === 'string' && reservoir.indexOf('.') > 0 && muette(stRes);
  const maxRes = stRes && stRes.attributes && Number(stRes.attributes.max) > 0 ? Number(stRes.attributes.max) : MAX_RESERVOIR;
  /* « Je l'ai rempli » (I22) : le maximum de l'aide, montré tout de suite — le geste d'abord (useOptimiste, 6 s au plus : I33) —, puis
   * ce que l'aide répond. Seulement sur une aide `input_number` vivante : un vrai capteur se remplit tout seul. */
  const [plein, poserPlein] = useOptimiste(stRes ? stRes.state : null);
  const lu = niveauDuBac(S, reservoir, maxRes);
  // Le maximum de l'aide, en grammes pour l'affichage (une aide en kg disait « 2 g » ; passe bis, point G — toute masse se convertit,
  // `enGrammes`, passe bis 2) ; en SON unité pour l'écrire.
  const uRes = stRes && stRes.attributes ? stRes.attributes.unit_of_measurement : null;
  const niveau = plein != null ? { pct: 100, grammes: lu.grammes == null ? null : enGrammes(maxRes, uRes) } : lu;
  const mesure = mesurePortion(S, lecture.portion, lecture.poidsPortion);
  const jours = vu ? joursDeReserveDistributeur(niveau.grammes, vu, mesure, { allumee }) : null;
  // Ni sur un bac déjà plein — à son maximum, ou remis à 100 % à l'instant : la question ne ferait rien (rien d'inerte ; tâche 8).
  const dejaPlein = plein != null || (stRes != null && Number(stRes.state) >= maxRes);
  const onRempli = typeof reservoir === 'string' && reservoir.indexOf('input_number.') === 0 && !reservoirMort && !dejaPlein
    ? () => { poserPlein(true); commanderService(hass, reservoir, 'input_number', 'set_value', { entity_id: reservoir, value: maxRes }); } : null;
  // La réserve sous le chiffre : « ≈ 18 jours de réserve · 450 g » ; sans rythme connu, « Ce qu'il reste dans le bac ».
  // Sous deux jours, « Moins de deux jours de réserve » : le singulier n'existe pas (passe bis, point G).
  const reserve = jours == null ? tr('Ce qu’il reste dans le bac') : jours < 2 ? tr('Moins de deux jours de réserve') : trN(jours, '≈ {n} jours de réserve', '≈ {n} jours de réserve');
  const phraseReserve = niveau.grammes != null ? reserve + ' · ' + Math.round(niveau.grammes).toLocaleString(locale()) + ' g' : reserve;

  /* Les deux tuiles (I22) : « Prochain repas » — l'heure, et le nom de l'automatisation, ou « Planning de Loggia », « Programme de
   * l'appareil » ; rien d'allumé, « Aucun » — et « Aujourd'hui ». « Dernier repas » part : l'Historique le dit. */
  const capteur = lecture.prochainCapteur && S[lecture.prochainCapteur] ? S[lecture.prochainCapteur].state : null;
  const pr = prochainRepas(vu, t, { allumee, capteur });
  // Un repas de Loggia ne porte de portions que si la commande ÉCRIT une quantité : sinon une
  // pression = une ration, et le Planning ne les montre pas — la tuile non plus (05/10).
  const portionsDites = pr && pr.portions > 0 && !(pr.source === 'loggia' && !(vu && vu.commande && vu.commande.quantite));
  const autos = vu && Array.isArray(vu.automatisations) ? vu.automatisations.filter(Boolean) : [];
  // Un programme que l'appareil tient sans le montrer (présent, illisible) : la tuile le nomme, comme la carte — rien ne s'invente, ni
  // « Aucun » ni « Rien de planifié » (passe bis, point E ; ajustement 2).
  const programmeTenu = !!(vu && vu.programme && vu.programme.presente && !vu.programme.lisible);
  const prochain = pr ? { titre: quandRepas(pr.date, t, locale()),
    sous: [pr.nom || motSource(pr.source), portionsDites ? trN(pr.portions, '{n} portion', '{n} portions') : null, pr.conditionnel ? tr('Selon une condition') : null].filter(Boolean).join(' · ') }
    : !vu ? null : programmeTenu ? { titre: tr('Programme de l’appareil'), sous: null }
      : { titre: tr('Aucun'), sous: autos.length ? tr('Aucune automatisation active') : tr('Rien de planifié') };
  const aveugle = !hs.compteurs.length && !hs.dernier;
  const aujourdhui = tuileAujourdhui(compteDuJour(lecture, S, t), brut ? lignes : null, { aveugle, maintenant: t });
  /* « État du distributeur » : les anomalies ACTIVES, en entier — un autre problème sous le nom propre de son entité (« Erreur moteur »,
   * la règle du 05/10), à défaut « Problème signalé par l'appareil » ; jamais deux fois le même mot (passe bis, point G). Aucune, pas
   * de rangée. */
  const nomPropre = (id) => { const s = lecture.soeurs.find(x => x.id === id); return s && s.attributs && s.attributs.friendly_name && s.nom ? s.nom : null; };
  const alertes = [...new Set(lecture.anomalies.filter(a => a.actif).map(a => (a.type === 'autre' ? nomPropre(a.entity_id) || MOT_ANOMALIE.autre() : MOT_ANOMALIE[a.type]())))];

  // Le nom : celui de l'appareil, à défaut « Distributeur de croquettes ».
  const appareil = lecture.appareil && idx && idx.deviceMeta && typeof idx.deviceMeta.get === 'function' ? idx.deviceMeta.get(lecture.appareil) : null;
  const nom = (vu && vu.appareil && vu.appareil.nom) || (appareil && appareil.name) || tr('Distributeur de croquettes');
  const fiche = (() => {
    const a = (vu && vu.appareil) || {};
    const modele = [a.fabricant || (appareil && appareil.manufacturer), a.modele || (appareil && appareil.model)].filter(Boolean).join(' ');
    return modele ? [{ cle: 'modele', nom: tr('Modèle'), valeur: modele }] : [];
  })();
  // Le mode de distribution (Aqara) se dit avec les mots du Planning, pas « Manual ».
  const mode = selectMode(lecture.soeurs);
  const motMode = (r, v) => (mode && r.id === mode.id ? motModeDe(v) : null);
  // Les consommables (Entretien) et les réglages (la roue) : ce que seule la popup lit, calculé ici sur les sœurs (passe bis, 19/10).
  const consommables = consommablesDistributeur(lecture.soeurs);
  const reglages = reglagesDistributeur(lecture.soeurs, lecture.commande);
  const aReglages = !!lecture.appareil || reglages.principaux.length > 0 || reglages.autres.length > 0;
  const ficheId = (conf && typeof conf.haid === 'string' && conf.haid) || (lecture.commande && lecture.commande.entity_id) || (lecture.portion && lecture.portion.entity_id) || null;

  /* Les onglets de sa maquette (I21) : Accueil · Repas · Historique — « Planning » devient « Repas », sous le même identifiant —, et
   * Entretien seulement s'il y a de quoi (I26) : des consommables. « Je l'ai rempli » et les anomalies vivent à l'Accueil. */
  const onglets = [
    ['accueil', tr('Accueil'), 'home'],
    ['planning', tr('Repas'), 'calendar-clock'],
    ['historique', tr('Historique'), 'time-past'],
    ...(consommables.length ? [['entretien', tr('Entretien'), 'wrench-simple']] : []),
  ];
  const [onglet, setOnglet] = useState(ongletDepart);
  /* Ce qui relie chaque onglet à son panneau (motif ARIA du robot). */
  const idOnglets = useId();
  const actuel = (onglet === 'reglages' && aReglages) || onglets.some(o => o[0] === onglet) ? onglet : 'accueil';
  const avecOnglets = actuel !== 'reglages' && onglets.length > 1;
  // L'aide du bac seule muette n'est pas une panne de l'appareil : la vis répond, l'en-tête ne le dit pas (comme la plaque ; passe bis, point G).
  const mort = lecture.enLigne.mort && lecture.enLigne.raison !== 'reservoir' ? lecture.enLigne : null;
  /* Le focus suit chaque changement de vue interne (05/10) : une tuile ou l'alerte ouvre
   * son onglet ET y pose le focus ; Réglages le donne à Retour ; Retour ramène à la vue
   * d'où l'on venait (Repas, par la rangée « Programme de l'appareil » et son mode) et le
   * rend à ce qui avait ouvert la page — la roue, ou cette rangée. */
  const retourVers = useRef('accueil');
  const ouvreur = useRef(null);
  const allerA = (id) => { setOnglet(id); focaliser(idOnglets + '-t-' + id); };
  const versReglages = (depuis) => { retourVers.current = actuel; ouvreur.current = depuis; setOnglet('reglages'); focaliser(idOnglets + '-retour'); };
  const retour = () => { const vers = retourVers.current || 'accueil'; setOnglet(vers); focaliser(ouvreur.current, idOnglets + '-t-' + vers); };

  return (
    <div className="rb-fiche" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* L'en-tête commun (I21) : la plaque de la carte, le nom, « {pièce} · distributeur », l'épingle, la roue (I4 A), UNE croix. */}
      <EnteteFiche nom={nom} enReglages={actuel === 'reglages'} reglages={aReglages} onReglages={() => versReglages(idOnglets + '-roue')} idRoue={idOnglets + '-roue'} epingle={epingle}
        panne={mort ? tr('Ce distributeur ne répond plus.') : null} plaque={plaque} sousNom={sousNom} />
      {avecOnglets && <FicheOnglets idBase={idOnglets} nom={nom} onglets={onglets} actuel={actuel} onChoisir={setOnglet} />}
      {actuel !== 'reglages' && (
        <PanneauOnglet idBase={idOnglets} actuel={actuel} avecOnglets={avecOnglets}>
          {actuel === 'accueil' && <OngletAccueil hass={hass} lecture={lecture} niveau={niveau} reservoirMort={reservoirMort} phraseReserve={phraseReserve} bas={niveau.pct != null && niveau.pct < 15}
            onRempli={onRempli} prochain={prochain} aujourdhui={aujourdhui} alertes={alertes} mesure={mesure} allerA={allerA} idRepli={idOnglets + '-t-accueil'} />}
          {actuel === 'planning' && <OngletPlanning hass={hass} etat={vu} erreur={erreur} ordinaire={ordinaire} allumee={allumee} demander={demander} premier={premier}
            versReglages={() => versReglages(idOnglets + '-mode')} ecrire={ecrire} err={err} associer={associer} dissocier={dissocier} enLigneAuto={enLigneAuto} idBase={idOnglets} />}
          {actuel === 'historique' && <OngletHistorique semaine={semaine} chargee={!!brut} erreur={histoErreur} maintenant={t} aveugle={aveugle} />}
          {actuel === 'entretien' && (() => { const pieces = piecesDe(consommables, S); return <OngletEntretien hass={hass} pieces={pieces} phrase={phraseEntretien(pieces)} />; })()}
        </PanneauOnglet>
      )}
      {/* Les réglages de la roue commandent l'APPAREIL (switch, select, number) : pas de
        * `ordinaire` ici, comme la portion de l'Accueil et comme le robot (ADR 0144, 05/10). */}
      {actuel === 'reglages' && <PageReglagesAppareil hass={hass} nom={nom} libelleNom={tr('Nom')} reglages={reglages} fiche={fiche} motOption={motMode}
        retour={retour} idRetour={idOnglets + '-retour'} onFiche={onFiche && ficheId ? () => onFiche(ficheId) : null} />}
    </div>
  );
}
