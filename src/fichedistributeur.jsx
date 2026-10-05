/* ── La fiche du distributeur de croquettes (ADR 0155, 05/10) ────────────────
 *
 * Une feuille à onglets sur le modèle du robot (ADR 0042) : Accueil, Planning,
 * Historique, Entretien, et la roue Réglages dans l'en-tête — une page, pas un
 * onglet. Un appareil = sa carte + sa fiche (ADR 0153).
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
import { Fi, Bascule, Gauge, ListeChoix, cvName } from './ui.jsx';
import { LOGGIA_INDEX, loggiaEnt, cfgVal, cfgSet, compteOrdinaire } from './state.js';
import { commanderService } from './actions.js';
import { premierJourSemaine } from './horloge.js';
import { useOptimiste, useDemandes, enVol } from './optimiste.js';
import { estRefus, raisonEchec } from './refus.js';
import { etiquetteJour, etiquetteProchain, ordreJours, heureValide } from './robots.js';
import {
  lireDistributeur, envoiDistribuer, niveauDuBac, mesurePortion, prochainRepas, dernierRepas, compteDuJour,
  joursDeReserveDistributeur, planningAffiche, libelleHeures, libelleJours, repasDepuisHistorique, resumeSemaineRepas,
} from './distributeur.js';
import {
  PANNEAU, TITRE_SECTION, PETITES_CAPITALES, BOUTON_DOUX, LIGNE, SOUS, filet, BoutonConfirme, PasAPas, PuceJour, ChampHeure,
  BarresSemaine, useHistoriquePeriode, EnteteFiche, FicheOnglets, PanneauOnglet, PageReglagesAppareil, focaliser,
} from './fichecommune.jsx';

const JOURS_HISTORIQUE = 10;      // la purge par défaut de Home Assistant
const VERROU_MS = 2500;           // « Distribuer » : un appui, puis 2,5 s de pause
const PORTIONS_MAX = 20;          // comme `distributeurs.py`
// Douze repas au plus, comme `distributeurs.py` (MAX_REPAS) : au-delà, « Ajouter » ne se
// propose plus — le serveur refuserait (`trop_de_repas`, que refus.js sait dire) (05/10).
const MAX_REPAS = 12;
const MAX_RESERVOIR = 1500;       // le maximum d'un bac en grammes sans maximum déclaré (croqMax)
// Le symbole du gramme, le même dans les sept langues (les grammes de la semaine, toujours rapportés en g).
const GRAMME = 'g';

/* Le mot d'une source de repas (historique, tuiles). `trSens` : « Programmé »
 * et « Manuel » ont aussi un sens de MODE, une autre clé. */
const MOT_SOURCE = {
  loggia: () => tr('Planning de Loggia'),
  automatisation: () => tr('Depuis une automatisation'),
  automatisations: () => tr('Depuis une automatisation'),
  programme: () => trSens('Programmé · source d’un repas'),
  appareil: () => tr('Programme de l’appareil'),
  capteur: () => tr('Programme de l’appareil'),
  manuel: () => trSens('Manuel · source d’un repas'),
  distance: () => tr('À distance'),
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

/* ════════════ L'accueil ════════════ */

function OngletAccueil({ hass, lecture, niveau, reservoirMort, jours, prochain, dernier, aujourdhui, alerte, mort, allerA }) {
  const S = (hass && hass.states) || {};
  const c = lecture.commande;
  // « Distribuer » : absent quand l'appareil ne répond pas (la commande muette
  // ou sa connectivité coupée) ; un réservoir muet, lui, n'empêche pas la vis.
  const peutDistribuer = !!c && !(mort && (mort.raison === 'commande' || mort.raison === 'connectivite'));
  const nMax = c && c.quantite ? Math.max(1, Math.min(PORTIONS_MAX, c.max != null ? Math.floor(c.max / (c.pas > 0 ? c.pas : 1)) : PORTIONS_MAX)) : 1;
  const [n, setN] = useState(1);
  const [verrou, setVerrou] = useState(false);
  useEffect(() => { if (!verrou) return undefined; const t = setTimeout(() => setVerrou(false), VERROU_MS); return () => clearTimeout(t); }, [verrou]);
  const distribuer = () => {
    if (verrou) return;
    const e = envoiDistribuer(c, c.quantite ? n : 1);
    if (!e) return;
    setVerrou(true);
    commanderService(hass, e.data.entity_id, e.domaine, e.service, e.data);
  };
  // La portion : la valeur de l'entité, montrée tout de suite (useOptimiste),
  // et SON unité — un `serving_size` d'Aqara compte des portions, pas des grammes.
  const p = lecture.portion;
  const vReel = p && S[p.entity_id] ? Number(S[p.entity_id].state) : null;
  const reel = vReel != null && Number.isFinite(vReel) ? vReel : null;
  const [ov, poserOv] = useOptimiste(reel);
  const pv = ov != null ? ov : reel;
  const pas = p && p.pas > 0 ? p.pas : 1;
  const poserPortion = (v) => {
    const borne = Math.max(p.min != null ? p.min : -Infinity, Math.min(p.max != null ? p.max : Infinity, Math.round(v * 1000) / 1000));
    poserOv(borne);
    commanderService(hass, p.entity_id, 'number', 'set_value', { entity_id: p.entity_id, value: borne });
  };
  const tuiles = [
    prochain && { nom: tr('Prochain repas'), vers: 'planning', ...prochain },
    dernier && { nom: tr('Dernier repas'), vers: 'historique', ...dernier },
  ].filter(Boolean);
  const descNiveau = niveau.pct == null ? null : jours == null ? tr('Ce qu’il reste dans le bac') : jours > 1 ? tr('Environ {n} jours de réserve', { n: jours }) : tr('Moins de deux jours de réserve');
  return (
    <div className="rb-accueil">
      <div className="rb-a-hero" style={PANNEAU}>
        {(niveau.pct != null || reservoirMort) && (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 14.5, fontWeight: 700 }}>{tr('Réservoir')}</span>
              {reservoirMort
                ? <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--o-text3)' }}>{tr('Indisponible')}</span>
                : <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', color: niveau.pct < 25 ? 'var(--o-bad)' : 'var(--rb-doux)' }}>{niveau.pct}<span style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text2)' }}> %</span></span>}
            </div>
            {!reservoirMort && <Gauge pct={niveau.pct} color={niveau.pct < 25 ? 'var(--o-bad)' : 'var(--rb-doux)'} h={6} style={{ marginTop: 10 }} />}
            {!reservoirMort && descNiveau && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 8 }}>{descNiveau}</div>}
          </div>
        )}
        {aujourdhui && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', marginTop: niveau.pct != null || reservoirMort ? 12 : 0 }}>{aujourdhui}</div>}
        {peutDistribuer && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: niveau.pct != null || reservoirMort || aujourdhui ? 18 : 0, flexWrap: 'wrap' }}>
            {/* Une commande qui ÉCRIT une quantité : des portions, pas à pas — jamais un curseur. */}
            {c.quantite && <PasAPas valeur={trN(n, '{n} portion', '{n} portions')} peutMoins={n > 1} peutPlus={n < nMax}
              moins={() => setN(x => Math.max(1, x - 1))} plus={() => setN(x => Math.min(nMax, x + 1))} />}
            {/* Le verrou de 2,5 s : `aria-disabled`, pas `disabled` — un bouton désactivé perd le
              * focus, qui tombait sur <body> après Entrée ; `distribuer` ignore déjà l'appui (05/10). */}
            <button type="button" onClick={distribuer} aria-disabled={verrou}
              style={{ flex: 1, minWidth: 150, padding: '15px 12px', borderRadius: 14, border: 'none', cursor: verrou ? 'default' : 'pointer', fontSize: 14.5, fontWeight: 800, fontFamily: 'inherit', background: 'var(--rb-fond)', color: '#fff', opacity: verrou ? .55 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Fi i="paw" size={14} color="#fff" />{c.quantite ? trN(n, 'Distribuer {n} portion', 'Distribuer {n} portions') : tr('Distribuer')}
            </button>
          </div>
        )}
      </div>

      {tuiles.length > 0 && (
        <div className="rb-a-tuiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(' + tuiles.length + ', minmax(0, 1fr))', gap: 12 }}>
          {tuiles.map(t => (
            <button key={t.vers} type="button" onClick={() => allerA(t.vers)} style={{ ...PANNEAU, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'inherit' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)' }}>{t.nom}</div>
              {/* L'heure revient à la ligne plutôt que de disparaître (« Heute 19… » à 320 px), et
                * l'origine tient sur deux lignes (« Harmonogram Loggii ») : la mise en page cède (05/10). */}
              <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.01em', marginTop: 5, overflowWrap: 'anywhere', hyphens: 'auto' }}>{t.titre}</div>
              {t.sous && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 3, overflow: 'hidden', overflowWrap: 'anywhere', hyphens: 'auto', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.sous}</div>}
            </button>
          ))}
        </div>
      )}

      {p && pv != null && (
        <div style={{ ...PANNEAU, padding: '4px 0' }}>
          <div style={LIGNE}>
            <span style={{ minWidth: 0 }}>
              {/* Se coupe plutôt que de passer sous le « − » (« Portionsgröße » à 320 px, 05/10). */}
              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, overflowWrap: 'anywhere', hyphens: 'auto' }}>{tr('Taille de la portion')}</span>
            </span>
            <PasAPas nom={tr('Taille de la portion')} valeur={pv.toLocaleString(locale()) + (p.unite ? ' ' + p.unite : '')}
              peutMoins={p.min == null || pv - pas >= p.min} peutPlus={p.max == null || pv + pas <= p.max}
              moins={() => poserPortion(pv - pas)} plus={() => poserPortion(pv + pas)} />
          </div>
        </div>
      )}

      {alerte && (
        <button type="button" className="rb-a-alerte" onClick={() => allerA('entretien')}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 'var(--o-radius,18px)', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'inherit', background: 'rgba(var(--o-warn-rgb),.13)' }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--o-warn-rgb),.2)' }}><Fi i="triangle-warning" size={16} color="var(--o-warn)" /></span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800 }}>{alerte}</span>
          <Fi i="angle-right" size={12} color="var(--o-text2)" />
        </button>
      )}
    </div>
  );
}

/* ════════════ Le planning ════════════ */

/* Un panneau de bloc : son titre, une phrase qui dit d'où il vient, ses lignes. */
const Bloc = ({ titre, sous = null, action = null, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
      <div style={TITRE_SECTION}>{titre}</div>{action}
    </div>
    {sous && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: -4 }}>{sous}</div>}
    {children}
  </div>
);
const LIEN = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 2px', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12.5, fontWeight: 700, color: 'var(--rb-doux)' };
const MOT = { fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', lineHeight: 1.5 };
const AVIS = { padding: '12px 16px', borderRadius: 'var(--o-radius,18px)', fontSize: 13, fontWeight: 700, lineHeight: 1.45, background: 'rgba(var(--o-warn-rgb),.13)', color: 'var(--o-text1)' };

/* Le programme de l'appareil, en lecture : ses créneaux s'il se lit, sinon ce
 * qu'on en sait — et son mode (Aqara), qui se règle dans Réglages. */
function BlocProgramme({ p, premier, versReglages, idMode }) {
  const mode = p.mode === 'programme' ? trSens('Programmé · mode') : p.mode === 'manuel' ? trSens('Manuel · mode') : null;
  const phrase = p.lisible ? null
    : p.note === 'capteur_diagnostic' ? tr('Programme non lisible : activez le capteur de diagnostic de l’appareil.')
      : p.note === 'tenu_par_appareil' && p.mode === 'programme' ? tr('L’appareil peut aussi distribuer selon ses propres créneaux. Passez-le en mode manuel dans Réglages si vous ne vous en servez pas.')
        : p.presente ? tr('Tenu par l’appareil : modifiez-le dans l’application du fabricant.') : null;
  return (
    <Bloc titre={tr('Programme de l’appareil')}>
      {(mode || (p.lisible && (p.repas || []).length > 0)) && (
        <div style={{ ...PANNEAU, padding: '4px 0' }}>
          {mode && (
            <button type="button" id={idMode} onClick={versReglages} style={{ ...LIGNE, width: '100%', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'left' }}>
              <span style={{ fontSize: 14.5, fontWeight: 700 }}>{tr('Mode de distribution')}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800 }}>{mode}<Fi i="angle-right" size={11} color="var(--o-text2)" /></span>
            </button>
          )}
          {p.lisible && (p.repas || []).map((r, i) => (
            // Un créneau éteint : son heure en gris de texte, jamais une opacité sur la ligne — elle
            // estompait « Éteint » lui-même, le mot qui DIT l'état, jusqu'à 2,3:1 (05/10).
            <div key={i + r.heure} style={{ ...LIGNE, borderTop: filet(i || mode) }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 19, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: r.actif ? undefined : 'var(--o-text2)' }}>{r.heure}</span>
                <span style={SOUS}>{[libelleJours(r.jours, premier, locale()), r.portions > 0 ? trN(r.portions, '{n} portion', '{n} portions') : null].filter(Boolean).join(' · ')}</span>
              </span>
              {/* « Éteint », pas « Inactif » : celui-ci est le `idle` de Home Assistant, « Idle » en anglais (05/10). */}
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--o-text2)', flexShrink: 0 }}>{!r.actif ? tr('Éteint') : r.etat_jour === 'dispensed' ? tr('Terminé') : ''}</span>
            </div>
          ))}
        </div>
      )}
      {phrase && <div style={{ ...PANNEAU, ...MOT, fontSize: 13 }}>{phrase}</div>}
    </Bloc>
  );
}

/* « Vos automatisations » : UNE ligne par automatisation, ses heures lues
 * dans son déclencheur, son interrupteur (si le compte la commande), et le
 * lien vers son éditeur (si Home Assistant le laisse modifier). */
function LigneAutomatisation({ a, i, on, mort, premier, basculer, origine, ordinaire, dissocier }) {
  const heures = Array.isArray(a.heures) ? a.heures.filter(heureValide) : [];
  const details = [libelleJours(a.jours, premier, locale()), a.conditionnel ? tr('Selon une condition') : null,
    a.portions > 0 ? trN(a.portions, '{n} portion', '{n} portions') : null].filter(Boolean).join(' · ');
  const indice = a.indice === 'ancienne_liste' ? tr('Reconnue par votre ancienne liste') : a.indice === 'associee' ? tr('Associée à la main') : null;
  return (
    <div className={mort ? 'o-panne' : undefined} style={{ padding: '13px 18px', borderTop: mort ? 'none' : filet(i), ...(mort ? { borderRadius: 14 } : null) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Coupée : en gris de texte, que la garde tient à 4,5:1 — l'opacité .6 la laissait à 3,5:1 (05/10). */}
        <span style={{ flex: 1, minWidth: 0, color: on || mort ? undefined : 'var(--o-text2)' }}>
          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nom}</span>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 800, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{libelleHeures(a)}</span>
          {details && <span style={SOUS}>{details}</span>}
        </span>
        {mort ? <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text3)', flexShrink: 0 }}>{tr('Indisponible')}</span>
          : a.pilotable ? <Bascule on={on} nom={a.nom} cb={basculer} />
            // Sans interrupteur, l'état se DIT : une opacité seule ne se lit pas (05/10).
            : !on ? <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text3)', flexShrink: 0 }}>{tr('Éteinte')}</span> : null}
      </div>
      {heures.length > 1 && <div style={{ ...MOT, marginTop: 6 }}>{trN(heures.length, 'Couper cette automatisation coupe ses {n} repas.', 'Couper cette automatisation coupe ses {n} repas.')}</div>}
      {(indice || (a.modifiable && a.id_config && origine) || (a.indice === 'associee' && !ordinaire)) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
          {indice && <span style={{ ...PETITES_CAPITALES, fontSize: 9.5 }}>{indice}</span>}
          {a.modifiable && a.id_config && origine && (
            <a href={origine + '/config/automation/edit/' + encodeURIComponent(a.id_config)} target="_top" rel="noopener" style={{ ...LIEN, textDecoration: 'none' }}>{tr('Modifier dans Home Assistant')}<Fi i="arrow-right" size={10} color="var(--rb-doux)" /></a>
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
    return <div role={erreur ? 'status' : undefined} style={{ ...PANNEAU, ...MOT, fontSize: 13 }}>{erreur ? tr('Planning indisponible pour l’instant.') : tr('Chargement…')}</div>;
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
      {() => <><Fi i="plus" size={10} color="var(--rb-doux)" />{tr('Associer une automatisation')}</>}
    </ListeChoix>
  ) : null;
  const ajout = vue.peutAjouter && repas.length < MAX_REPAS ? <button type="button" id={idBase + '-ajouter'} onClick={ajouter} style={LIEN}><Fi i="plus" size={10} color="var(--rb-doux)" />{tr('Ajouter un repas')}</button> : null;
  /* Le planning de Loggia se PROPOSE dès que le serveur le permet (`peutPlanifier`) et
   * qu'il n'existe pas encore — même sous le bloc « Programme de l'appareil » : un Aqara
   * en mode manuel montre son mode, et n'obtenait jamais « Ajouter un repas » (05/10). */
  const proposition = vue.peutAjouter && !vue.blocs.loggia && !vue.blocs.automatisations;
  return (
    <div className="rb-planning">
      {err && <div role="alert" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--o-bad)' }}>{err}</div>}
      {vue.deuxSources && <div role="note" style={AVIS}>{tr('Deux sources distribuent : vérifiez qu’un repas ne part pas deux fois.')}</div>}

      {vue.blocs.programme && <BlocProgramme p={etat.programme} premier={premier} versReglages={versReglages} idMode={idBase + '-mode'} />}

      {vue.blocs.automatisations && (
        <Bloc titre={tr('Vos automatisations')} sous={tr('Les automatisations de Home Assistant qui commandent ce distributeur.')}>
          <div style={{ ...PANNEAU, padding: '4px 0' }}>
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
          <div style={{ ...PANNEAU, padding: '4px 0', opacity: vue.pause ? .6 : 1 }}>
            {repas.map((r, i) => (
              <RepasLoggia key={r.id} r={r} i={i} jours={jours} quantite={quantite} ordinaire={ordinaire}
                poser={poserRepas} supprimer={() => supprimer(r.id)} />
            ))}
          </div>
        </Bloc>
      )}

      {/* Les trois états vides : une commande et rien de programmé ; aucune commande. */}
      {vue.vide === 'aucun' && (
        <div style={{ ...PANNEAU, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ ...MOT, fontSize: 13 }}>{tr('Aucun repas programmé.')}</span>{ajout}
        </div>
      )}
      {/* Sous le programme de l'appareil, l'état vide dit QUEL planning est vide. */}
      {vue.blocs.programme && proposition && (
        <Bloc titre={tr('Planning de Loggia')} sous={tr('Loggia distribue à ces heures, même écran fermé.')} action={ajout}>
          <div style={{ ...PANNEAU, ...MOT, fontSize: 13 }}>{tr('Aucun repas programmé.')}</div>
        </Bloc>
      )}
      {vue.vide === 'sans_commande' && <div style={{ ...PANNEAU, ...MOT, fontSize: 13 }}>{tr('Loggia ne sait pas commander ce distributeur : désignez son appareil ou son script de distribution dans Paramètres.')}</div>}
      {vue.miseEnGarde && <div role="note" style={AVIS}>{tr('Si l’application du fabricant programme aussi des repas, coupez-les : sinon l’animal mange deux fois.')}</div>}
      {/* Avec la proposition seulement : sous un planning de Loggia rempli, elle flottait seule (05/10). */}
      {vue.ancienneListe && proposition && <div style={MOT}>{tr('Votre ancienne liste ne distribuait rien par elle-même.')}</div>}
      {!vue.blocs.automatisations && lienAssocier && <div>{lienAssocier}</div>}
    </div>
  );
}

/* ════════════ L'historique ════════════ */

// Exporté pour les tests : un rendu côté serveur ne lance pas l’effet qui lit l’historique.
export function OngletHistorique({ lignes, resume, chargee, erreur, aveugle, maintenant }) {
  if (erreur) return <div role="alert" style={{ ...PANNEAU, ...MOT, fontSize: 13 }}>{tr('Historique indisponible.')}</div>;
  if (!chargee) return <div style={{ ...PANNEAU, ...MOT, fontSize: 13 }}>{tr('Lecture de l’historique…')}</div>;
  const jourLong = (t) => { const e = etiquetteJour(t, maintenant, locale()); return e === tr('Auj.') ? tr('Aujourd’hui') : e === tr('Hier') ? tr('Hier') : new Date(t).toLocaleDateString(locale(), { weekday: 'long' }).replace(/^./, c => c.toUpperCase()); };
  const quantite = (l) => l.quantites.filter(q => q.unite).map(q => q.valeur.toLocaleString(locale(), { maximumFractionDigits: 1 }) + ' ' + q.unite).join(' · ');
  return (
    <div className="rb-histo">
      {/* Rien à lire et rien de vu : pas de « 0 repas » qui passerait pour une semaine à jeun. */}
      {!(aveugle && lignes.length === 0) && <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <div style={{ borderRadius: 'var(--o-radius,18px)', padding: '16px 20px', background: 'rgba(var(--rb-rgb),.14)', display: 'grid', gridTemplateColumns: 'repeat(' + (resume.grammes != null ? 2 : 1) + ', minmax(0, 1fr))', gap: 10 }}>
          <div><div style={PETITES_CAPITALES}>{tr('Cette semaine')}</div><div style={{ fontSize: 21, fontWeight: 800, marginTop: 4 }}>{trN(resume.n, '{n} repas', '{n} repas')}</div></div>
          {resume.grammes != null && <div><div style={PETITES_CAPITALES}>{tr('Croquettes')}</div><div style={{ fontSize: 21, fontWeight: 800, marginTop: 4 }}>{Math.round(resume.grammes).toLocaleString(locale()) + ' ' + GRAMME}</div></div>}
        </div>
        <BarresSemaine jours={resume.jours} nom={tr('Cette semaine')} valeur={(j) => (j.grammes != null ? j.grammes : j.n)} />
      </div>}
      {aveugle && <div style={MOT}>{tr('L’historique ne voit que les repas partis de Home Assistant.')}</div>}
      {/* Aveugle et rien vu : « Aucun repas » affirmerait ce qu'on ne sait pas — l'application
        * du fabricant a pu en servir (05/10, contradicteur). La phrase du dessus suffit. */}
      {!(aveugle && lignes.length === 0) && <div style={{ ...PANNEAU, padding: '4px 0' }}>
        {lignes.length === 0 && <div style={{ padding: '16px 20px', ...MOT, fontSize: 13 }}>{tr('Aucun repas ces derniers jours.')}</div>}
        {lignes.slice(0, 30).map((l, i) => (
          <div key={l.t + '-' + i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 18px', borderTop: filet(i) }}>
            <span style={{ minWidth: 42, height: 42, padding: '0 4px', boxSizing: 'border-box', borderRadius: 12, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 800, background: 'rgba(var(--rb-rgb),.14)', color: 'var(--rb-doux)' }}>{etiquetteJour(l.t, maintenant, locale())}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* La source quand on la sait ; sinon le moment seul, sans inventer d'où il vient. */}
              <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{motSource(l.source) || jourLong(l.t) + ' ' + heureDe(l.t)}</div>
              {motSource(l.source) && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{jourLong(l.t)} {heureDe(l.t)}</div>}
            </div>
            {quantite(l) && <div style={{ fontSize: 14, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{quantite(l)}</div>}
          </div>
        ))}
      </div>}
    </div>
  );
}

/* ════════════ L'entretien ════════════ */

function OngletEntretien({ hass, lecture, onRempli }) {
  const S = (hass && hass.states) || {};
  const soeurs = new Map(lecture.soeurs.map(s => [s.id, s]));
  const presser = (id) => commanderService(hass, id, 'button', 'press', { entity_id: id });
  const motAnomalie = (a) => (a.type === 'bas' ? tr('Bac presque vide') : a.type === 'bloque' ? tr('Distribution bloquée') : ((soeurs.get(a.entity_id) || {}).nom || a.entity_id));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {lecture.consommables.length > 0 && (
        <div className="rb-pieces">
          {lecture.consommables.map(c => {
            const bas = (c.jours != null && c.jours <= 3) || (c.pct != null && c.pct <= 15);
            const couleur = bas ? 'var(--o-bad)' : 'var(--rb-doux)';
            return (
              <div key={c.entity_id} style={PANNEAU}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{MOT_CONSOMMABLE[c.role] ? MOT_CONSOMMABLE[c.role]() : c.role}</div>
                  {c.pct != null && <div style={{ fontSize: 19, fontWeight: 800, color: couleur, fontVariantNumeric: 'tabular-nums' }}>{Math.round(c.pct)} %</div>}
                </div>
                {c.jours != null && <div style={{ fontSize: 12.5, fontWeight: 600, color: bas ? 'var(--o-bad)' : 'var(--o-text2)', marginTop: 3 }}>{trN(Math.round(c.jours), '{n} jour restant', '{n} jours restants')}</div>}
                {c.pct != null && <Gauge pct={Math.max(0, Math.min(100, c.pct))} color={couleur} h={5} style={{ marginTop: 12 }} />}
                {/* « Remplacé » est un `button.press` de l'appareil : ouvert à tous (ADR 0144, 05/10). */}
                {c.reset && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><BoutonConfirme libelle={tr('Remplacé')} onConfirme={() => presser(c.reset)} /></div>}
              </div>
            );
          })}
        </div>
      )}
      {lecture.anomalies.length > 0 && (
        <div style={{ ...PANNEAU, padding: '4px 0', maxWidth: 640 }}>
          {lecture.anomalies.map((a, i) => {
            const m = muette(S[a.entity_id]);
            return (
              <div key={a.entity_id} style={{ ...LIGNE, borderTop: filet(i) }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0, fontSize: 14, fontWeight: 700 }}>
                  {a.actif && <Fi i="triangle-warning" size={14} color="var(--o-warn)" />}{motAnomalie(a)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, flexShrink: 0, color: m ? 'var(--o-text3)' : a.actif ? 'var(--o-warn)' : 'var(--o-text2)' }}>{m ? tr('Indisponible') : a.actif ? tr('Problème') : tr('Normal')}</span>
              </div>
            );
          })}
        </div>
      )}
      {onRempli && (
        <div style={{ ...PANNEAU, padding: '4px 0', maxWidth: 640 }}>
          <div style={LIGNE}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700 }}>{tr('Réservoir rempli')}</span>
              <span style={SOUS}>{tr('Remet le niveau du bac à 100 %.')}</span>
            </span>
            <button type="button" onClick={onRempli} style={BOUTON_DOUX}>{tr('Rempli')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * « Aujourd'hui : {n} repas · {g} g » : le compteur du jour de l'appareil, sinon
 * ce que l'historique en a vu (`lignes`, `null` tant qu'il n'est pas lu) — et
 * seulement s'il VOIT l'appareil (un compteur, un « dernier repas »). Aveugle,
 * il ne compte que les repas partis de Home Assistant : « 1 repas » cacherait
 * ceux de l'application du fabricant (05/10, contradicteur). `null` sinon.
 * Exporté pour les tests : un rendu côté serveur ne lit pas l'historique.
 */
export function texteAujourdhui(compte, lignes, { aveugle = false, maintenant = Date.now() } = {}) {
  const minuit = new Date(maintenant); minuit.setHours(0, 0, 0, 0);
  const duJour = Array.isArray(lignes) && !aveugle ? lignes.filter(l => l.t >= minuit.getTime()) : null;
  const nJour = compte.repas != null ? compte.repas : duJour && (duJour.length || compte.grammes != null) ? duJour.length : null;
  const gJour = compte.grammes != null ? Math.round(compte.grammes) : null;
  return nJour != null && gJour != null ? trN(nJour, 'Aujourd’hui : {n} repas · {g} g', 'Aujourd’hui : {n} repas · {g} g', { g: gJour.toLocaleString(locale()) })
    : nJour != null ? trN(nJour, 'Aujourd’hui : {n} repas', 'Aujourd’hui : {n} repas')
      : gJour != null ? tr('Aujourd’hui : {g} g', { g: gJour.toLocaleString(locale()) }) : null;
}

/* ════════════ La fiche ════════════ */

/**
 * `etat` : la réponse de `loggia/distributeurs/etat` (null tant qu'elle n'est
 * pas là) ; `erreur` : le serveur ne répond pas. `cfg` : `loggia_feeder`.
 * `onEtat(etat)` reçoit une réponse plus fraîche après une écriture — la
 * coquille la range dans son cache. `epingle` : l'épingle de l'ENTITÉ
 * principale, posée par la coquille. `index`, `ongletDepart` et `maintenant`
 * servent aux tests.
 */
export default function FicheDistributeurContent({ hass, etat = null, erreur = false, cfg, onFiche = null, epingle = null, onEtat = null, index, ongletDepart = 'accueil', maintenant = null }) {
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
  const resume = resumeSemaineRepas(lignes, t, premier);

  // Le bac : son niveau, sa réserve en jours sur les seuls repas à heure fixe des sources actives.
  const reservoir = conf && conf.haids ? conf.haids.reservoir : null;
  const stRes = typeof reservoir === 'string' && reservoir ? S[reservoir] : undefined;
  const reservoirMort = typeof reservoir === 'string' && reservoir.indexOf('.') > 0 && muette(stRes);
  const maxRes = stRes && stRes.attributes && Number(stRes.attributes.max) > 0 ? Number(stRes.attributes.max) : MAX_RESERVOIR;
  const niveau = niveauDuBac(S, reservoir, maxRes);
  const mesure = mesurePortion(S, lecture.portion, lecture.poidsPortion);
  const jours = vu ? joursDeReserveDistributeur(niveau.grammes, vu, mesure, { allumee }) : null;
  const onRempli = typeof reservoir === 'string' && reservoir.indexOf('input_number.') === 0 && !reservoirMort
    ? () => commanderService(hass, reservoir, 'input_number', 'set_value', { entity_id: reservoir, value: maxRes }) : null;

  // Les deux tuiles : ce qui vient, ce qui est parti.
  const capteur = lecture.prochainCapteur && S[lecture.prochainCapteur] ? S[lecture.prochainCapteur].state : null;
  const pr = prochainRepas(vu, t, { allumee, capteur });
  // Un repas de Loggia ne porte de portions que si la commande ÉCRIT une quantité : sinon une
  // pression = une ration, et le Planning ne les montre pas — la tuile non plus (05/10).
  const portionsDites = pr && pr.portions > 0 && !(pr.source === 'loggia' && !(vu && vu.commande && vu.commande.quantite));
  const prochain = pr ? { titre: etiquetteProchain(pr.date, t, locale()),
    sous: [pr.nom || motSource(pr.source), portionsDites ? trN(pr.portions, '{n} portion', '{n} portions') : null, pr.conditionnel ? tr('Selon une condition') : null].filter(Boolean).join(' · ') } : null;
  const dr = dernierRepas(lecture, S, vu, t);
  const derniereLigne = lignes.find(l => Math.abs(l.t - (dr ? dr.t : 0)) <= 120000) || null;
  const dernier = dr ? { titre: etiquetteJour(dr.t, t, locale()) + ' ' + heureDe(dr.t),
    sous: derniereLigne ? motSource(derniereLigne.source) : dr.source === 'automatisation' ? motSource('automatisation') : null } : null;
  const aveugle = !hs.compteurs.length && !hs.dernier;
  const aujourdhui = texteAujourdhui(compteDuJour(lecture, S), brut ? lignes : null, { aveugle, maintenant: t });
  // L'alerte de l'Accueil : une anomalie ACTIVE, qui renvoie à Entretien.
  const active = lecture.anomalies.find(a => a.actif) || null;
  const alerte = active ? (active.type === 'bas' ? tr('Bac presque vide') : active.type === 'bloque' ? tr('Distribution bloquée') : ((lecture.soeurs.find(s => s.id === active.entity_id) || {}).nom || active.entity_id)) : null;

  // Le nom : celui de l'appareil, à défaut « Distributeur de croquettes ».
  const appareil = lecture.appareil && idx && idx.deviceMeta && typeof idx.deviceMeta.get === 'function' ? idx.deviceMeta.get(lecture.appareil) : null;
  const nom = (vu && vu.appareil && vu.appareil.nom) || (appareil && appareil.name) || tr('Distributeur de croquettes');
  const fiche = (() => {
    const a = (vu && vu.appareil) || {};
    const modele = [a.fabricant || (appareil && appareil.manufacturer), a.modele || (appareil && appareil.model)].filter(Boolean).join(' ');
    return modele ? [{ cle: 'modele', nom: tr('Modèle'), valeur: modele }] : [];
  })();
  // Le mode de distribution (Aqara) se dit avec les mots du Planning, pas « Manual ».
  const motMode = (r, v) => (lecture.mode && r.id === lecture.mode.id ? motModeDe(v) : null);
  const aReglages = !!lecture.appareil || lecture.reglages.principaux.length > 0 || lecture.reglages.autres.length > 0;
  const ficheId = (conf && typeof conf.haid === 'string' && conf.haid) || (lecture.commande && lecture.commande.entity_id) || (lecture.portion && lecture.portion.entity_id) || null;

  const onglets = [
    ['accueil', tr('Accueil'), 'home'],
    ['planning', tr('Planning'), 'calendar-clock'],
    ['historique', tr('Historique'), 'time-past'],
    ...(lecture.consommables.length || lecture.anomalies.length || onRempli ? [['entretien', tr('Entretien'), 'wrench-simple']] : []),
  ];
  const [onglet, setOnglet] = useState(ongletDepart);
  /* Ce qui relie chaque onglet à son panneau (motif ARIA du robot). */
  const idOnglets = useId();
  const actuel = (onglet === 'reglages' && aReglages) || onglets.some(o => o[0] === onglet) ? onglet : 'accueil';
  const avecOnglets = actuel !== 'reglages' && onglets.length > 1;
  const mort = lecture.enLigne.mort ? lecture.enLigne : null;
  /* Le focus suit chaque changement de vue interne (05/10) : une tuile ou l'alerte ouvre
   * son onglet ET y pose le focus ; Réglages le donne à Retour ; Retour ramène à la vue
   * d'où l'on venait (le Planning, par « Mode de distribution ») et le rend à ce qui avait
   * ouvert la page — la roue, ou la ligne du mode. */
  const retourVers = useRef('accueil');
  const ouvreur = useRef(null);
  const allerA = (id) => { setOnglet(id); focaliser(idOnglets + '-t-' + id); };
  const versReglages = (depuis) => { retourVers.current = actuel; ouvreur.current = depuis; setOnglet('reglages'); focaliser(idOnglets + '-retour'); };
  const retour = () => { const vers = retourVers.current || 'accueil'; setOnglet(vers); focaliser(ouvreur.current, idOnglets + '-t-' + vers); };

  return (
    <div className="rb-fiche rb-distributeur" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <EnteteFiche nom={nom} enReglages={actuel === 'reglages'} reglages={aReglages} onReglages={() => versReglages(idOnglets + '-roue')} idRoue={idOnglets + '-roue'} epingle={epingle}
        panne={mort ? tr('Ce distributeur ne répond plus.') : null} />
      {avecOnglets && <FicheOnglets idBase={idOnglets} nom={nom} onglets={onglets} actuel={actuel} onChoisir={setOnglet} />}
      {actuel !== 'reglages' && (
        <PanneauOnglet idBase={idOnglets} actuel={actuel} avecOnglets={avecOnglets}>
          {actuel === 'accueil' && <OngletAccueil hass={hass} lecture={lecture} niveau={niveau} reservoirMort={reservoirMort} jours={jours} prochain={prochain} dernier={dernier}
            aujourdhui={aujourdhui} alerte={alerte} mort={mort} allerA={allerA} />}
          {actuel === 'planning' && <OngletPlanning hass={hass} etat={vu} erreur={erreur} ordinaire={ordinaire} allumee={allumee} demander={demander} premier={premier}
            versReglages={() => versReglages(idOnglets + '-mode')} ecrire={ecrire} err={err} associer={associer} dissocier={dissocier} enLigneAuto={enLigneAuto} idBase={idOnglets} />}
          {actuel === 'historique' && <OngletHistorique lignes={lignes} resume={resume} chargee={!!brut} erreur={histoErreur} maintenant={t}
            aveugle={aveugle} />}
          {actuel === 'entretien' && <OngletEntretien hass={hass} lecture={lecture} onRempli={onRempli} />}
        </PanneauOnglet>
      )}
      {/* Les réglages de la roue commandent l'APPAREIL (switch, select, number) : pas de
        * `ordinaire` ici, comme la portion de l'Accueil et comme le robot (ADR 0144, 05/10). */}
      {actuel === 'reglages' && <PageReglagesAppareil hass={hass} nom={nom} libelleNom={tr('Nom')} reglages={lecture.reglages} fiche={fiche} motOption={motMode}
        retour={retour} idRetour={idOnglets + '-retour'} onFiche={onFiche && ficheId ? () => onFiche(ficheId) : null} />}
    </div>
  );
}
