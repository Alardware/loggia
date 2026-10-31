/* ── La fiche d'un volet (chantier Volets, § 3.5 à 3.8 ; sa maquette « Cartes
 * volets », cadres 1b à 1e) ───────────────────────────────────────────────────
 *
 * Une feuille à onglets, comme celle du chauffage : Accueil, Planning,
 * Historique. Chargée à la demande (`FicheVolet`, App.jsx), elle n'importe
 * jamais App.jsx : la coquille lui passe l'état des volets, l'épingle, l'icône
 * choisie pour la carte et la pièce. Un appareil = sa carte + sa fiche
 * (ADR 0153) ; le garage et le portail gardent leur feuille d'avant (V3).
 *
 *  - Accueil (1b, 1e) : le grand chiffre et ce qui va se passer, la fenêtre
 *    — on la touche ou on la glisse, au pas de 5 %, ou l'on touche un repère —,
 *    Monter, Stop, Descendre ; puis Prochain mouvement, Porte devant, Dernier
 *    mouvement, L'appareil.
 *  - Planning (1c) : Comme les autres · Heures à lui · Jamais, la semaine
 *    (calculée par le jumeau du serveur, voletsplanning.js : elle suit tout
 *    de suite un réglage), les décalages et les jours, la façade, la porte
 *    devant, le mode de la maison. Un compte ordinaire lit tout et n'écrit
 *    rien (V10, ADR 0144) : un appui dit le refus, qui nomme la clé.
 *  - Historique (1d) : 24 h ou 7 jours, la courbe de position, les manœuvres
 *    et qui les a faites.
 *
 * Ce qui se calcule vit dans voletsfiche.js (chargé avec la fiche) et
 * voletecran.js (le démarrage) ; la course, dans voletcourse.js — la carte et
 * la fiche dessinent la MÊME.
 */
import { useState, useEffect, useRef, useId } from 'react';
import { tr, locale } from './i18n.js';
import { Fi, ListeChoix, kbSlider } from './ui.jsx';
import { compteOrdinaire, LOGGIA_INDEX } from './state.js';
import { commander } from './actions.js';
import { useOptimiste } from './optimiste.js';
import { ecrireRegle, raisonEchec } from './refus.js';
import { heureMurale, jourEnPhrase } from './chauffageecran.js';
import { nomJour } from './robots.js';
import { vueVolet, plaqueVolet, mouvementUtile } from './voletecran.js';
import { useCourseVolet, ordreEtCourse, ordreEtArret } from './voletcourse.js';
import { voletDe, lireEtatVolets, poserEtatVolets, rafraichirVolets } from './voletsetat.js';
import { regleDe, semaine } from './voletsplanning.js';
import {
  sousNomVolet, saitSePlacer, phraseLongue, prochainFiche, porteFiche, joursDuSens, decalageMaison, decalageDit,
  notePlanning, lignesSemaine, lundiDe, patchRegle, patchDecalage, patchJour, patchMode, FACADES, facadeDe, patchFacade, patchPorte,
  fusionConfig, fileEcritures, avertissementSoleil, MODES_MAISON, optionsPortes, PERIODES_VOLET, pointsHistorique, courbeVolet, manoeuvres,
  heureManoeuvre, compteManoeuvres, AVANT_SANS_BASCULE_MS, RAFALE_MS,
} from './voletsfiche.js';
import { EnteteFiche, FicheOnglets, PanneauOnglet, PETITES_CAPITALES, filet, focaliser, JOURS_DERNIERS } from './fichecommune.jsx';
import { LISERE } from './styles.js';
import { PANNEAU, RANGEE, EN_BOUTON, TITRE, SOUS, ALERTE } from './fichekit.js';

// Une liste : le panneau des maquettes (fichekit.js), qui coupe ce qui déborde de ses coins.
const LISTE = { ...PANNEAU, overflow: 'hidden' };
const VALEUR = { fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' };
// Un bouton carré de sa maquette (`ChipButton`) : le gris doux, sans bordure ; inerte à .4.
const CARRE = (l, h, r, peut = true) => ({ width: l, height: h, flexShrink: 0, padding: 0, borderRadius: r, border: 'none', background: 'var(--o-s1)', color: 'var(--o-text1)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, opacity: peut ? 1 : 0.4, cursor: peut ? 'pointer' : 'default' });
const ALLUME = { background: 'var(--o-accent-fond)', color: '#fff' };

/* Vivant tant que l'onglet est monté : une réponse revenue après sa fermeture ne touche plus à son état. */
function useVivant() {
  const vivant = useRef(true);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);
  return vivant;
}

/* Un groupe de choix segmenté, dans le puits (tests/puces_segmentees.test.mjs) :
 * le choisi en bleu plein, texte blanc. `inerte` : il se lit, un appui dit
 * pourquoi rien ne change (`surInerte`). */
function Choix({ nom, options, choisi, onChoisir, hauteur = 36, taille = 12, inerte = false, surInerte = null }) {
  return (
    <div role="group" aria-label={nom} style={{ display: 'grid', gridTemplateColumns: 'repeat(' + options.length + ', minmax(0, 1fr))', gap: 4, padding: 4, borderRadius: 12, background: 'var(--o-well)' }}>
      {options.map(o => {
        const on = o.id === choisi;
        return (
          <button key={o.id} type="button" aria-pressed={on} aria-disabled={inerte || undefined}
            onClick={() => { if (inerte) { if (surInerte) surInerte(); } else if (!on) onChoisir(o.id); }}
            style={{ minHeight: hauteur, padding: '0 6px', borderRadius: 9, border: 'none', fontFamily: 'inherit', fontSize: taille, fontWeight: 700, lineHeight: 1.15,
              cursor: inerte ? 'default' : 'pointer', background: on ? 'var(--o-accent-fond)' : 'transparent', color: on ? '#fff' : 'var(--o-text1)',
              opacity: inerte && !on ? 0.4 : 1, overflowWrap: 'anywhere', hyphens: 'auto' }}>{o.label}</button>
        );
      })}
    </div>
  );
}

/* Le geste qui mène le volet à `cible`, d'après ce qu'il ACCEPTE (`gestesCover`, 19/10) : Monter et Descendre aux deux bouts —
 * par la position s'il ne sait que se placer, par ses lames s'il ne sait que s'incliner —, la position ailleurs ; null : rien. */
const gesteVers = (gestes, cible) => (cible === 100 ? gestes.monter : cible === 0 ? gestes.descendre
  : gestes.placer ? { capacite: gestes.placer, valeur: cible } : null);

/* L'ordre parti (`commander`), avec de quoi apprendre un refus de Home Assistant. */
const envoi = (hass, id, g) => (surEchec) => commander(hass, id, g.capacite, g.valeur, null, null, surEchec);

/* Un ordre au volet, puis sa course : un ordre que le moteur d'actions refuse ne bouge rien, et un refus de Home Assistant,
 * plus tard, oublie la course (`ordreEtCourse`, 19/10) — elle jouait près de 200 s un mouvement que rien ne faisait. */
function bouger(hass, id, st, cible, gestes) {
  const g = gesteVers(gestes, cible);
  if (g) ordreEtCourse(id, cible, st, envoi(hass, id, g));
}

/* Le nom d'une entité de la maison, sinon son identifiant. */
const nomDe = (hass, id) => (id && hass && hass.states && hass.states[id] && hass.states[id].attributes && hass.states[id].attributes.friendly_name) || id || null;

/* ════════════ L'historique : la position sans filtre, et les manœuvres du journal (§ 7) ════════════ */

/**
 * L'historique d'UN volet sur `jours` jours, SANS filtre : avec
 * `significant_changes_only=0` — sans lui, Home Assistant ne garde d'un volet
 * que ses changements d'ÉTAT, et un passage de 60 à 30 % sans changer d'état
 * disparaissait —, avec ses attributs (ni `minimal_response` ni
 * `no_attributes` : la position en est un). La forme REST de la demande que la
 * conception décrit (§ 7) : celle que tout le dépôt et la démo servent déjà.
 * `useHistoriquePeriode` (fichecommune.jsx) garde la sienne. null en lecture,
 * 'erreur' illisible, sinon la liste des états.
 */
function useHistoriqueVolet(hass, id, jours) {
  const [reponse, setReponse] = useState(null);
  const hRef = useRef(hass);
  useEffect(() => { hRef.current = hass; });
  const connecte = !!(hass && typeof hass.callApi === 'function');
  useEffect(() => {
    if (!connecte || !id) { setReponse(null); return undefined; }
    let vivant = true;
    setReponse(null);
    const debut = new Date(Date.now() - jours * 86400000).toISOString();
    const fin = encodeURIComponent(new Date().toISOString());
    hRef.current.callApi('GET', 'history/period/' + debut + '?filter_entity_id=' + encodeURIComponent(id) + '&end_time=' + fin + '&significant_changes_only=0')
      .then(r => { if (vivant) setReponse(Array.isArray(r) && Array.isArray(r[0]) ? r[0] : []); })
      .catch(() => { if (vivant) setReponse('erreur'); });
    return () => { vivant = false; };
  }, [connecte, id, jours]);
  return reponse;
}

/**
 * Les lignes du journal qui ont commandé ce volet depuis `depuis` (secondes),
 * par `loggia/volets/manoeuvres` (§ 6.5) : `{ lignes, couvre_depuis }`. null
 * en lecture ; un serveur d'avant (`unknown_command`) ou une panne : `{ lignes:
 * null }` — et alors aucune pastille : on ne dit pas qui sans le savoir.
 */
function useManoeuvres(hass, id, depuis) {
  const [reponse, setReponse] = useState(null);
  const hRef = useRef(hass);
  useEffect(() => { hRef.current = hass; });
  const connecte = !!(hass && typeof hass.callWS === 'function');
  useEffect(() => {
    if (!connecte || !id) { setReponse({ lignes: null, couvre_depuis: null }); return undefined; }
    let vivant = true;
    hRef.current.callWS({ type: 'loggia/volets/manoeuvres', entity_id: id, depuis })
      .then(r => { if (vivant) setReponse(r && Array.isArray(r.lignes) ? r : { lignes: null, couvre_depuis: null }); })
      .catch(() => { if (vivant) setReponse({ lignes: null, couvre_depuis: null }); });
    return () => { vivant = false; };
  }, [connecte, id, depuis]);
  return reponse;
}

/* Les manœuvres d'une période, lues dans l'historique et le journal. */
function useLesManoeuvres(hass, id, jours, t) {
  const st = hass && hass.states ? hass.states[id] : null;
  const lu = useHistoriqueVolet(hass, id, jours);
  // L'heure de départ du journal, arrondie à la minute : elle ne relance pas la lecture à chaque rendu.
  // Elle couvre la plus large des fenêtres de « qui » (360 s, sans bascule) : sinon le premier groupe de la période ne saurait rien.
  const depuis = Math.floor((t - jours * 86400000 - AVANT_SANS_BASCULE_MS) / 60000) * 60;
  const journal = useManoeuvres(hass, id, depuis);
  const v = voletDe(lireEtatVolets().etat, id);
  const porte = v && v.porte ? v.porte.entite : null;
  if (!Array.isArray(lu)) return { lu, liste: [], points: [] };
  const points = pointsHistorique(lu, st);
  const liste = manoeuvres(points, { id, journal: journal ? journal.lignes : null, couvreDepuis: journal ? journal.couvre_depuis : null,
    debut: t - jours * 86400000, porte, nomPorte: (x) => nomDe(hass, x) });
  return { lu, liste, points };
}

/* ════════════ L'Accueil (1b, 1e) ════════════ */

const REPERES = () => [[100, tr('Ouvert')], [75, '75 %'], [50, '50 %'], [25, '25 %'], [0, tr('Fermé')]];

/* La valeur visée par un doigt sur la fenêtre, au pas de 5 %. */
function valeurDe(e) {
  const r = e.currentTarget.getBoundingClientRect();
  return Math.max(0, Math.min(100, Math.round((1 - (e.clientY - r.top) / Math.max(1, r.height)) * 20) * 5));
}

/* La rafale du clavier, au repos : d'où elle part, la valeur visée, sa minuterie. */
const RAFALE_VIDE = Object.freeze({ depart: null, valeur: null, minuteur: 0 });

/* La fin d'une rafale : la cible en tirets s'efface, et UN ordre part — vers la
 * dernière valeur visée ; aucun si elle revient d'où elle partait. */
function finRafale(rafale, rappels) {
  const { depart, valeur, minuteur } = rafale.current;
  clearTimeout(minuteur);
  rafale.current = RAFALE_VIDE;
  if (valeur == null) return;
  rappels.current.onGlisse(null);
  if (valeur !== depart) rappels.current.onEnvoyer(valeur);
}

/**
 * La fenêtre (§ 3.6) : le tablier part du haut, sur `(100 − p) %`, au moins
 * 5 px, son bord bas de 5 px ; ses lames ; la cible en tirets pendant qu'on
 * glisse ou pendant une course. Toucher ou glisser donne une valeur au pas de
 * 5 % ; relâcher l'envoie. Un volet qui ne sait pas se placer ne se glisse
 * pas : la fenêtre n'est alors qu'un dessin.
 *
 * Au clavier — les touches de `kbSlider`, qui ne change pas pour les autres
 * glissières —, une RAFALE (relecture des tâches 6 à 12, point 1) : chaque
 * touche vise un pas plus loin que la cible en cours — celle du geste, sinon
 * celle de la course, sinon la position —, la cible en tirets et « Relâchez
 * pour aller à n % » la suivent, et un seul ordre part, au relâché ou après
 * 500 ms sans touche. Il en partait un par touche, compté depuis la position
 * DESSINÉE : quatre appuis depuis 60 % envoyaient 55 quatre fois, une flèche
 * tenue 361 ordres en 12 s.
 *
 * Muet en plein geste (point 3), rien ne reste collé : les gestionnaires
 * restent tant qu'un geste court, et le geste se vide. Seul un doigt posé (ou
 * la souris, bouton enfoncé) glisse : un survol ne vise rien.
 */
function Fenetre({ pos, cible, place, muet, glisse, onGlisse, onEnvoyer }) {
  const actif = place && !muet;
  const tirets = glisse != null ? glisse : cible;
  const rafale = useRef(RAFALE_VIDE);
  const tire = useRef(false);
  const rappels = useRef({ onGlisse, onEnvoyer });
  useEffect(() => { rappels.current = { onGlisse, onEnvoyer }; });
  // Démontée en pleine rafale, la fenêtre n'envoie rien.
  useEffect(() => () => clearTimeout(rafale.current.minuteur), []);
  useEffect(() => {
    if (actif) return;
    clearTimeout(rafale.current.minuteur);
    rafale.current = RAFALE_VIDE;
    tire.current = false;
    if (glisse != null) onGlisse(null);
  }, [actif, glisse, onGlisse]);
  const base = glisse != null ? glisse : cible != null ? cible : pos;
  const viser = (v) => {
    const r = rafale.current;
    clearTimeout(r.minuteur);
    rafale.current = { depart: r.valeur == null ? base : r.depart, valeur: v, minuteur: setTimeout(() => finRafale(rafale, rappels), RAFALE_MS) };
    onGlisse(v);
  };
  const oublierRafale = () => { clearTimeout(rafale.current.minuteur); rafale.current = RAFALE_VIDE; };
  const nom = tr('Position du volet');
  /* Le curseur dit la valeur visée pendant un geste ; le pas, lui, part de la
   * cible — celle de la rafale en cours d'abord : deux touches arrivées avant
   * le rendu ne comptent pas pour une. */
  const kb = actif ? { ...kbSlider(nom, glisse != null ? glisse : pos == null ? 0 : Math.round(pos), viser, { step: 5 }),
    onKeyDown: (e) => kbSlider(nom, rafale.current.valeur != null ? rafale.current.valeur : base, viser, { step: 5 }).onKeyDown(e),
    onKeyUp: () => finRafale(rafale, rappels) } : { 'aria-hidden': true };
  const geste = actif || glisse != null;
  return (
    <div {...kb} aria-orientation={actif ? 'vertical' : undefined}
      onPointerDown={actif ? (e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointeur parti */ } oublierRafale(); tire.current = true; onGlisse(valeurDe(e)); } : undefined}
      onPointerMove={geste ? (e) => { if (!tire.current) return; const v = valeurDe(e); if (v !== glisse) onGlisse(v); } : undefined}
      onPointerUp={geste ? () => { if (!tire.current) return; tire.current = false; oublierRafale(); onGlisse(null); if (actif && glisse != null) onEnvoyer(glisse); } : undefined}
      onPointerCancel={geste ? () => { tire.current = false; onGlisse(null); } : undefined}
      style={{ position: 'relative', flex: 1, minWidth: 0, height: 176, borderRadius: 14, overflow: 'hidden', border: LISERE, boxSizing: 'border-box',
        background: 'rgba(var(--o-purple-rgb),.22)', cursor: actif ? 'ns-resize' : 'default', touchAction: 'none', userSelect: 'none', opacity: muet ? 0.4 : 1 }}>
      {pos != null && (
        <div data-tablier="" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: (100 - pos) + '%', minHeight: 5, boxSizing: 'border-box',
          borderBottom: '5px solid var(--o-text3)', background: 'repeating-linear-gradient(180deg,var(--o-well0) 0 10px,var(--o-well) 10px 11px)' }} />
      )}
      {tirets != null && <div data-cible="" style={{ position: 'absolute', left: 8, right: 8, top: (100 - tirets) + '%', borderTop: '2px dashed var(--o-text)' }} />}
    </div>
  );
}

function OngletAccueil({ hass, id, st, v, etat, vue, course, onOnglet, onFiche, t }) {
  const [glisse, setGlisse] = useState(null);
  const place = saitSePlacer(st);
  const fuseau = hass && hass.config ? hass.config.time_zone : null;
  const nomPorte = v && v.porte ? nomDe(hass, v.porte.entite) : null;
  const { pos, muet, enCourse } = vue;
  const ligne = glisse != null ? tr('Relâchez pour aller à {n} %', { n: glisse })
    : phraseLongue(vue.ligne, { pos, ferme: vue.ferme, ouvert: vue.ouvert, etat, nomPorte });
  const encre = glisse != null ? 'var(--o-text1)' : enCourse ? 'var(--o-purple)' : 'var(--o-text2)';
  const envoyer = (cible) => { if (!muet) bouger(hass, id, st, cible, vue.gestes); };
  const arreter = () => { if (vue.peutArreter) ordreEtArret(id, st, envoi(hass, id, vue.gestes.stop)); };
  const reperes = REPERES().filter(([val]) => place || val === 0 || val === 100);
  // Un repère que le volet ne sait pas atteindre est inerte, focalisable (`aria-disabled`, 19/10).
  const vise = (val) => !muet && !!gesteVers(vue.gestes, val);
  // Le repère où se trouve le volet, hors course : le verdict aux deux bouts (V12), la position ailleurs.
  const ici = (val) => !enCourse && pos != null && (val === 0 ? vue.ferme : val === 100 ? vue.ouvert : pos === val);

  const prochain = prochainFiche({ v, etat, ferme: vue.ferme, ouvert: vue.ouvert });
  /* « Porte devant » parle du mouvement UTILE — le choix de « Prochain
   * mouvement » et de la phrase (`mouvementUtile`) — : le salon ouvert saute son
   * ouverture du matin, sa fermeture du soir attendra (relecture du 13/10). */
  const utile = v ? mouvementUtile(v.a_venir, vue.ferme, vue.ouvert) : null;
  const regle = etat && etat.config && etat.config.baies ? !!etat.config.baies.actif : true;
  const porte = v && v.porte ? porteFiche(v.porte, nomPorte, { prochain: utile, regleActive: regle, ref: etat && etat.maintenant }) : null;
  const { lu, liste } = useLesManoeuvres(hass, id, 1, t);
  const dernier = liste[0] || null;
  const valeurDernier = dernier ? heureManoeuvre(dernier.t, t, fuseau) : '—';
  const sousDernier = dernier ? (dernier.qui ? [dernier.quoi, dernier.qui.sous].join(' · ') : dernier.quoi)
    : lu === 'erreur' ? tr('Historique indisponible pour le moment') : null;

  return (
    <div className="rb-accueil" style={{ gap: 12 }}>
      <div data-panneau="volet" style={{ ...PANNEAU, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, fontWeight: 800, lineHeight: 1 }}>
          <span style={{ fontSize: 48, letterSpacing: '-.03em' }}>{pos == null ? '—' : pos}</span>{pos != null && <span style={{ fontSize: 22 }}>%</span>}
        </div>
        <div data-ligne="" style={{ fontSize: 12.5, fontWeight: 600, color: encre, marginTop: 8 }}>{ligne}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 26 }}>
          {/* La colonne se règle sur son mot le plus long (mesuré le 13/10 : « Geschlossen »
            * sortait de 13 px de ses 64 px fixes). Les repères sont posés en absolu et ne
            * comptent pas dans sa largeur : une cale invisible, dans le flux, la porte. */}
          <div style={{ position: 'relative', minWidth: 64, height: 176, flexShrink: 0 }}>
            <span aria-hidden="true" data-cale-reperes="" style={{ display: 'flex', gap: 6, paddingLeft: 6, height: 0, overflow: 'hidden', visibility: 'hidden', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>{reperes.reduce((long, [, mot]) => (mot.length > long.length ? mot : long), '')}<span style={{ width: 8, flexShrink: 0 }} /></span>
            {reperes.map(([val, mot]) => (
              <button key={val} type="button" aria-disabled={vise(val) ? undefined : true} onClick={() => { if (vise(val)) envoyer(val); }}
                aria-label={val === 100 || val === 0 ? mot : tr('Ouvrir à {n} %', { n: val })}
                style={{ position: 'absolute', right: 0, top: (100 - val) + '%', height: 44, marginTop: -22, display: 'flex', alignItems: 'center', gap: 6, padding: '0 0 0 6px',
                  border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', cursor: vise(val) ? 'pointer' : 'default',
                  color: ici(val) ? 'var(--o-text)' : 'var(--o-text3)' }}>
                {mot}<span aria-hidden="true" style={{ width: 8, height: 2, borderRadius: 1, background: 'currentColor' }} />
              </button>
            ))}
          </div>
          <Fenetre pos={pos} cible={enCourse ? course.cible : null} place={place} muet={muet} glisse={glisse} onGlisse={setGlisse} onEnvoyer={envoyer} />
          {/* Monter et Descendre deviennent inertes à l'arrivée d'une course : `aria-disabled`, et
            * l'appui ignoré — `disabled` faisait tomber le focus sur la page (relecture des tâches 6 à 12, point 5).
            * Stop de même, muet ou sans le bit STOP (19/10). */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 64, flexShrink: 0 }}>
            <button type="button" aria-label={tr('Ouvrir') + ' ' + (nomDe(hass, id) || '')} title={tr('Ouvrir')} aria-disabled={vue.peutMonter ? undefined : true}
              onClick={() => { if (vue.peutMonter) envoyer(100); }} style={CARRE(64, 48, 14, vue.peutMonter)}><Fi i="angle-small-up" size={18} /></button>
            <button type="button" aria-label={tr('Stop') + ' ' + (nomDe(hass, id) || '')} title={tr('Stop')} aria-disabled={vue.peutArreter ? undefined : true} onClick={arreter}
              style={{ ...CARRE(64, 48, 14, vue.peutArreter), ...(enCourse && vue.peutArreter ? ALLUME : null) }}><Fi i="square" size={13} /></button>
            <button type="button" aria-label={tr('Fermer') + ' ' + (nomDe(hass, id) || '')} title={tr('Fermer')} aria-disabled={vue.peutDescendre ? undefined : true}
              onClick={() => { if (vue.peutDescendre) envoyer(0); }} style={CARRE(64, 48, 14, vue.peutDescendre)}><Fi i="angle-small-down" size={18} /></button>
          </div>
        </div>
      </div>

      <div data-liste="" style={LISTE}>
        <button type="button" data-rangee="prochain" onClick={() => onOnglet('planning')} style={{ ...RANGEE, ...EN_BOUTON }}>
          <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('Prochain mouvement')}</span>{prochain.sous && <span style={SOUS}>{prochain.sous}</span>}</span>
          <span style={VALEUR}>{prochain.valeur}</span><Fi i="angle-small-right" size={16} color="var(--o-text3)" />
        </button>
        {porte && (
          <div data-rangee="porte" style={{ ...RANGEE, padding: '12px 18px', borderTop: filet(1) }}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('Porte devant')}</span><span style={SOUS}>{porte.sous}</span></span>
            <span style={{ ...VALEUR, color: porte.couleur }}>{porte.valeur}</span>
          </div>
        )}
        <button type="button" data-rangee="dernier" onClick={() => onOnglet('historique')} style={{ ...RANGEE, ...EN_BOUTON, borderTop: filet(1) }}>
          <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('Dernier mouvement')}</span>{sousDernier && <span style={SOUS}>{sousDernier}</span>}</span>
          <span style={VALEUR}>{valeurDernier}</span><Fi i="angle-small-right" size={16} color="var(--o-text3)" />
        </button>
        {onFiche && (
          <button type="button" data-rangee="appareil" onClick={() => onFiche(id)} style={{ ...RANGEE, ...EN_BOUTON, borderTop: filet(1) }}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('L’appareil')}</span><span style={SOUS}>{tr('L’épingle, les commandes et toutes ses entités')}</span></span>
            <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ════════════ Le Planning (1c) ════════════ */

/* Ce qu'un compte ordinaire lit quand il touche un réglage : le refus, qui nomme la clé (V10). */
const refusLecture = () => raisonEchec(Object.assign(new Error('Unauthorized'), { code: 'unauthorized' }), 'loggia_volets');

/* Une rangée › qui ouvre une liste de choix (`ListeChoix`) : la rangée EST le
 * bouton de la liste. Quand la place manque (le téléphone, une langue longue),
 * la valeur passe SOUS le titre au lieu de se couper : seul un nom d'entité
 * (`entite` — la porte, nommée par Home Assistant) peut finir en « … »
 * (relecture du 13/10). */
function RangeeChoix({ titre, sous, valeur, alerte = null, entite = false, options, choisi, onChoix, inerte, surInerte, premiere = false }) {
  const corps = (
    <>
      <span style={{ flex: '1 1 110px', minWidth: 'min-content' }}><span style={TITRE}>{titre}</span><span style={SOUS}>{sous}</span>
        {alerte && <span style={{ ...SOUS, color: 'var(--o-warn)', fontWeight: 700 }}>{alerte}</span>}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto', minWidth: 0, maxWidth: '100%' }}>
        <span style={entite ? { ...VALEUR, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } : { ...VALEUR, whiteSpace: 'normal', textAlign: 'right' }}>{valeur}</span>
        <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
      </span>
    </>
  );
  const rangee = { ...RANGEE, ...EN_BOUTON, borderTop: premiere ? 'none' : filet(1), flexWrap: 'wrap', rowGap: 4 };
  if (inerte) {
    return <button type="button" aria-disabled="true" onClick={surInerte} style={{ ...rangee, cursor: 'default' }}>{corps}</button>;
  }
  return (
    <ListeChoix value={choisi} options={options} onChange={onChoix} label={titre} nom={tr('{a} : {b}', { a: titre, b: valeur })}
      style={{ ...rangee, width: '100%' }}>{() => corps}</ListeChoix>
  );
}

// Un refus sous une rangée › : aligné sur son texte, au-dessus du filet suivant.
const SOUS_RANGEE = { marginTop: 0, padding: '0 14px 12px 18px' };

function OngletPlanning({ hass, id, etat, erreur = false, ordinaire, file }) {
  const vivant = useVivant();
  /* Le refus se dit SOUS la rangée qu'il touche, comme au chauffage : `{ ou, texte }`.
   * En tête d'un onglet qui défile, il se lisait hors de vue (relecture des tâches 6 à 12, point 6). */
  const [err, setErr] = useState(null);
  const config = (etat && etat.config) || null;
  /* L'affichage anticipé : la configuration telle que le geste la laisse,
   * jusqu'à la réponse — la semaine se recalcule aussitôt (le jumeau) ; il
   * expire, et un refus le retire (`useOptimiste`). */
  const signature = config ? JSON.stringify([config.planning, config.soleil, config.baies]) : null;
  const [ovCfg, poserOvCfg] = useOptimiste(signature);
  const cfg = ovCfg || config;
  // Le serveur muet, et rien de lu avant : il le dit, au lieu de « Chargement… » pour toujours (19/10).
  if (!cfg) return <div className="rb-planning"><div style={{ ...SOUS, fontSize: 13 }}>{erreur ? tr('Réglages indisponibles.') : tr('Chargement…')}</div></div>;
  const plan = cfg.planning || {};
  const regle = regleDe(plan, id);
  // Sans heures du soleil (`soleil_jours` vide, § 6.1), la semaine ne se calcule pas : « — ».
  const soleilJours = Array.isArray(etat && etat.soleil_jours) ? etat.soleil_jours : [];
  const inactif = regle === 'jamais' || !plan.actif || plan.mode === 'manuel' || !soleilJours.length;
  const S = (hass && hass.states) || {};

  /* Écrire (relecture des tâches 6 à 12, point 2) : l'avance se montre tout de
   * suite, bâtie sur ce qui est affiché ; le patch, lui, se bâtit au moment
   * d'écrire, dans la file de la fiche (`fileEcritures`) — sur la configuration
   * relue avant la première écriture d'une série, puis sur celle que rend la
   * précédente —, et ses tables partent ENTIÈRES (le serveur remplace
   * l'ancienne, volets.py:1169-1176). Une seule écriture en vol. La réponse
   * remplace le cache, puis l'état se relit : ses mouvements à venir en
   * dépendent. `ou` : la rangée touchée, où se dit un refus.
   *
   * Une relecture qui échoue n'écrit rien (B6, `relireConfig`) : la file rend
   * alors une promesse rejetée — l'avance s'annule, et la rangée touchée dit
   * l'échec. */
  const ecrire = (ou, fabriquer) => {
    if (ordinaire) { setErr({ ou, texte: refusLecture() }); return; }
    const avance = fabriquer(cfg);
    if (!avance) return;
    poserOvCfg(fusionConfig(cfg, avance));
    setErr(null);
    file(fabriquer, (patch) => ecrireRegle(hass, 'loggia/volets/config', patch, { cle: 'loggia_volets', annuler: () => poserOvCfg(null),
      signaler: (e) => { if (vivant.current) setErr({ ou, texte: raisonEchec(e, 'loggia_volets') }); } }))
      .then((r) => {
        const cache = lireEtatVolets().etat;
        if (r && r.config && cache) { poserEtatVolets({ ...cache, config: r.config }); rafraichirVolets(); }
      },
        (x) => { poserOvCfg(null); if (vivant.current) setErr({ ou, texte: raisonEchec(x, 'loggia_volets') }); });
  };
  const lire = (ou) => setErr({ ou, texte: refusLecture() });
  const alerte = (ou, style = null) => (err && err.ou === ou ? <div role="alert" style={{ ...ALERTE, marginTop: 8, ...style }}>{err.texte}</div> : null);
  // L'échelle de la semaine : « 24 godz. » est plus long que « 24 h » — la feuille s'en sert (index.css).
  const echelleLongue = tr('{h} h', { h: 24 }).length > 5;

  /* La semaine, du lundi au dimanche — calculée par le jumeau du serveur. Son
   * lundi est la première date de `soleil_jours` (le contrat du plan 1) ; sans
   * elle, celui de `maintenant`. */
  const maintenant = etat && etat.maintenant;
  const lundi = (soleilJours[0] && soleilJours[0].date) || lundiDe(maintenant);
  const jours = lignesSemaine(lundi ? semaine(plan, id, soleilJours, lundi) : [], inactif);
  const aujourdhui = typeof maintenant === 'string' ? maintenant.slice(0, 10) : null;
  const hm = heureMurale(maintenant);
  const minuteNow = hm ? Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) : null;
  const soleilDuJour = soleilJours.find(j => j && j.date === aujourdhui) || null;
  const lever = soleilDuJour && heureMurale(soleilDuJour.lever), coucher = soleilDuJour && heureMurale(soleilDuJour.coucher);

  const r = (plan.volets || {})[id] || {};
  const sol = cfg.soleil || {};
  const orientation = sol.volets && sol.volets[id] ? sol.volets[id].orientation : null;
  const facade = facadeDe(orientation);
  const capteur = (cfg.baies && cfg.baies.volets && cfg.baies.volets[id]) || '';
  const pieceDe = (x) => (LOGGIA_INDEX && typeof LOGGIA_INDEX.areaNameOf === 'function' ? LOGGIA_INDEX.areaNameOf(x) : null);
  const mode = MODES_MAISON().find(m => m.id === (plan.mode || 'auto')) || MODES_MAISON()[0];

  return (
    <div className="rb-planning" style={{ gap: 12 }}>
      <div data-panneau="soleil" style={{ ...PANNEAU, padding: '16px 18px' }}>
        <span style={TITRE}>{tr('Lever et coucher du soleil')}</span>
        {lever && coucher && <span style={SOUS}>{tr('Aujourd’hui : lever {lever}, coucher {coucher}', { lever, coucher })}</span>}
        <div style={{ marginTop: 12 }}>
          <Choix nom={tr('Lever et coucher du soleil')} choisi={regle} inerte={ordinaire} surInerte={() => lire('regle')}
            options={[{ id: 'comme', label: tr('Comme les autres') }, { id: 'perso', label: tr('Heures à lui') }, { id: 'jamais', label: tr('Jamais') }]}
            onChoisir={(x) => ecrire('regle', (c) => patchRegle(c.planning, id, x))} />
        </div>
        {alerte('regle')}
        <div data-note="" style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', marginTop: 10, lineHeight: 1.45 }}>{notePlanning(plan, regle)}</div>
      </div>

      {/* La colonne des heures prend sa place — « Zostaje zamknięta » ne s'y coupe plus — ; chaque heure
        * de l'échelle se centre sur son repère, et les quarts s'effacent quand la piste est trop étroite
        * pour qu'elles ne se touchent pas (index.css ; relecture du 13/10). */}
      <div data-panneau="semaine" style={{ ...PANNEAU, padding: 12, opacity: inactif ? 0.4 : 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(30px, max-content) minmax(0, 1fr) minmax(92px, max-content)', alignItems: 'center', columnGap: 10, rowGap: 14, padding: '7px 8px' }}>
          {jours.map((j, i) => (
            <div key={j.date} data-jour={i} style={{ display: 'contents' }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: j.date === aujourdhui ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}>{nomJour(i, locale(), 'short')}</span>
              <span aria-hidden="true" style={{ position: 'relative', height: 8, borderRadius: 3, background: 'var(--o-s1)' }}>
                {j.gauche != null && <span style={{ position: 'absolute', top: 0, bottom: 0, left: j.gauche + '%', width: j.largeur + '%', borderRadius: 3, background: 'rgba(var(--o-purple-rgb),.8)' }} />}
                {j.date === aujourdhui && minuteNow != null && (
                  <span data-maintenant="" style={{ position: 'absolute', top: -5, bottom: -5, left: (minuteNow / 1440 * 100) + '%', width: 3, marginLeft: -1.5, borderRadius: 2,
                    background: 'var(--o-text)', boxShadow: '0 0 0 2px var(--o-bg2)' }} />
                )}
              </span>
              <span style={{ textAlign: 'right', fontSize: 11.5, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{j.heures}</span>
            </div>
          ))}
          <span />
          <span aria-hidden="true" className="o-volet-echelle" data-long={echelleLongue || undefined} style={{ position: 'relative', height: 14, fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)' }}>
            {[0, 6, 12, 18, 24].map((h, i) => (
              <span key={h} data-repere={i === 2 ? 'milieu' : i % 2 ? 'quart' : 'bout'} style={{ position: 'absolute', left: (h / 24 * 100) + '%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>{tr('{h} h', { h })}</span>
            ))}
          </span>
          <span />
        </div>
      </div>

      {regle === 'perso' && (
        <div data-panneau="heures" style={LISTE}>
          {['ouverture', 'fermeture'].map((sens, k) => {
            const titre = sens === 'ouverture' ? tr('Ouverture') : tr('Fermeture');
            const valeur = r[sens] != null ? Number(r[sens]) : decalageMaison(plan, sens);
            const moins = !ordinaire && valeur > -120, plus = !ordinaire && valeur < 240;
            const puces = joursDuSens(plan, id, sens);
            return (
              <div key={sens} data-sens={sens} style={{ padding: '12px 14px 14px 18px', borderTop: filet(k) }}>
                {/* Quand la place manque, − valeur + passent SOUS le titre, à droite : la sous-ligne
                  * passe à la ligne au lieu de glisser sous le « − » (relecture du 13/10). */}
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 8 }}>
                  <span style={{ flex: '1 1 90px', minWidth: 'min-content' }}><span style={TITRE}>{titre}</span>
                    <span style={SOUS}>{sens === 'ouverture' ? tr('Par rapport au lever du soleil') : tr('Par rapport au coucher du soleil')}</span></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
                    <button type="button" aria-disabled={moins ? undefined : true} aria-label={tr('{a} : {b}', { a: titre, b: tr('Quinze minutes plus tôt') })}
                      onClick={() => { if (ordinaire) lire(sens); else if (moins) ecrire(sens, (c) => patchDecalage(c.planning, id, sens, -1)); }} style={CARRE(44, 44, 12, moins)}><Fi i="minus-small" size={16} /></button>
                    <span style={{ minWidth: 72, textAlign: 'center', fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap' }}>{decalageDit(valeur)}</span>
                    <button type="button" aria-disabled={plus ? undefined : true} aria-label={tr('{a} : {b}', { a: titre, b: tr('Quinze minutes plus tard') })}
                      onClick={() => { if (ordinaire) lire(sens); else if (plus) ecrire(sens, (c) => patchDecalage(c.planning, id, sens, 1)); }} style={CARRE(44, 44, 12, plus)}><Fi i="plus-small" size={16} /></button>
                  </span>
                </div>
                <div role="group" aria-label={tr('{a} : {b}', { a: titre, b: tr('Les jours') })} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, marginTop: 12 }}>
                  {puces.map(p => (
                    <button key={p.jour} type="button" aria-pressed={p.on} aria-disabled={ordinaire || undefined} aria-label={nomJour(p.jour, locale(), 'long')}
                      title={nomJour(p.jour, locale(), 'long')}
                      onClick={() => { if (ordinaire) lire(sens); else ecrire(sens, (c) => patchJour(c.planning, id, sens, p.jour)); }}
                      style={{ height: 36, borderRadius: 10, border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: ordinaire ? 'default' : 'pointer',
                        background: p.on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: p.on ? '#fff' : 'var(--o-text1)' }}>
                      {nomJour(p.jour, locale(), 'short').slice(0, 2)}
                    </button>
                  ))}
                </div>
                {alerte(sens)}
              </div>
            );
          })}
        </div>
      )}

      <div data-panneau="regles" style={LISTE}>
        {/* Un store banne protège en se DÉPLOYANT (25/10) : la règle le dit, comme elle le fait. */}
        <RangeeChoix premiere titre={tr('Protection solaire')} sous={(S[id] && S[id].attributes && S[id].attributes.device_class) === 'awning' ? tr('Se déploie quand le soleil tape et qu’il fait chaud') : tr('Descend quand le soleil tape et qu’il fait chaud')}
          valeur={facade ? facade.facade : tr('Aucune façade')} alerte={avertissementSoleil(cfg, orientation)}
          options={[{ id: 'aucune', label: tr('Aucune') }, ...FACADES().map(f => ({ id: String(f.deg), label: f.nom }))]}
          choisi={facade ? String(facade.deg) : 'aucune'} inerte={ordinaire} surInerte={() => lire('facade')}
          onChoix={(x) => ecrire('facade', (c) => patchFacade(c, id, x === 'aucune' ? null : Number(x)))} />
        {alerte('facade', SOUS_RANGEE)}
        <RangeeChoix titre={tr('Porte devant')} sous={tr('Ne ferme pas sur une porte ouverte')} entite={!!capteur}
          valeur={capteur ? nomDe(hass, capteur) : tr('Aucune')} options={optionsPortes(S, pieceDe(id), pieceDe)}
          choisi={capteur} inerte={ordinaire} surInerte={() => lire('porte')} onChoix={(x) => ecrire('porte', (c) => patchPorte(c, id, x || null))} />
        {alerte('porte', SOUS_RANGEE)}
        <RangeeChoix titre={tr('Mode de la maison')} sous={tr('Pour tous les volets')} valeur={mode.label}
          options={MODES_MAISON()} choisi={mode.id} inerte={ordinaire} surInerte={() => lire('mode')} onChoix={(x) => ecrire('mode', () => patchMode(x))} />
        {alerte('mode', SOUS_RANGEE)}
      </div>
    </div>
  );
}

/* ════════════ L'Historique (1d) ════════════ */

/* Le jour de la semaine (0 = lundi) d'un instant, à la maison. */
function jourSemaine(t, fuseau) {
  const nom = new Intl.DateTimeFormat('en-US', { timeZone: fuseau || undefined, weekday: 'short' }).format(t);
  return Math.max(0, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(nom));
}

/* Une manœuvre (§ 3.8) : l'heure, ce qu'elle a fait et pourquoi, puis qui. Sa
 * disposition vit dans la feuille (`o-volet-manoeuvre`, index.css) : au
 * téléphone, la pastille passe SOUS le texte — à côté, elle écrasait le motif
 * jusqu'à un mot par ligne, ou le recouvrait en polonais (relecture du 13/10). */
function LigneManoeuvre({ m, t, fuseau }) {
  return (
    <div className="o-volet-manoeuvre" data-manoeuvre="" style={{ padding: '11px 18px', borderTop: filet(1) }}>
      <span style={{ fontSize: 13, fontWeight: 800 }}>{heureManoeuvre(m.t, t, fuseau)}</span>
      <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{m.quoi}</span>
        {m.motif && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', marginTop: 2 }}>{m.motif}</span>}</span>
      {m.qui && (
        <span data-qui={m.qui.glyphe} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 9, background: 'var(--o-s1)', color: 'var(--o-text1)',
          fontSize: 11.5, fontWeight: 800 }}><Fi i={m.qui.glyphe} size={11} />{m.qui.mot}</span>
      )}
    </div>
  );
}

function OngletHistorique({ hass, id, periode, onPeriode, t }) {
  const p = PERIODES_VOLET[periode] ? periode : '24h';
  const jours = PERIODES_VOLET[p];
  const fuseau = hass && hass.config ? hass.config.time_zone : null;
  const { lu, liste, points } = useLesManoeuvres(hass, id, jours, t);
  const debut = t - jours * 86400000;
  const c = Array.isArray(lu) ? courbeVolet(points, debut, t) : null;
  const vide = lu === null ? tr('Chargement…') : lu === 'erreur' ? tr('Historique indisponible pour le moment')
    : p === '7j' ? tr("Pas d'historique sur 7 jours") : tr("Pas d'historique sur 24 h");
  const auj = jourSemaine(t, fuseau);
  const reperes = p === '7j' ? [JOURS_DERNIERS()[auj], jourEnPhrase(jourSemaine(t - 3.5 * 86400000, fuseau)), tr('maintenant')]
    : [tr('il y a {n} h', { n: 24 }), tr('il y a {n} h', { n: 12 }), tr('maintenant')];
  return (
    <div className="rb-histo" style={{ gap: 12 }}>
      <Choix nom={tr('Période')} hauteur={42} taille={12.5} choisi={p} onChoisir={(x) => { if (onPeriode) onPeriode(x); }}
        options={[{ id: '24h', label: tr('{n} h', { n: 24 }) }, { id: '7j', label: tr('7 jours') }]} />
      <div data-panneau="position" style={{ ...PANNEAU, padding: '16px 16px 14px' }}>
        <div style={PETITES_CAPITALES}>{tr('Position')}</div>
        {/* La colonne des étiquettes prend la largeur du mot le plus long — « Geschlossen » sortait
          * de ses 38 px, et du panneau (relecture du 13/10) — ; chacune centrée sur sa ligne. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(38px, max-content) minmax(0, 1fr)', columnGap: 6, marginTop: 14 }}>
          {c ? (<>
            <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', height: 114, margin: '-7px 0',
              fontSize: 10.5, fontWeight: 700, lineHeight: '14px', color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>
              <span>{tr('Ouvert')}</span><span>50 %</span><span>{tr('Fermé')}</span>
            </div>
            <svg aria-hidden="true" viewBox="0 0 400 100" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 100, overflow: 'visible' }}>
              <path d="M0 0.5H400M0 50H400M0 99.5H400" style={{ fill: 'none', stroke: 'var(--o-bd1)', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' }} />
              <path data-aire="" d={c.aire} style={{ fill: 'rgba(var(--o-purple-rgb),.22)' }} />
              <path data-ligne="" d={c.ligne} style={{ fill: 'none', stroke: 'var(--o-purple)', strokeWidth: 2, strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' }} />
            </svg>
            <div style={{ gridColumn: 2, display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, fontWeight: 700, color: 'var(--o-text3)' }}>
              {reperes.map((x, i) => <span key={i}>{x}</span>)}
            </div>
          </>) : <div data-vide="" style={{ gridColumn: 2, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{vide}</div>}
        </div>
      </div>
      <div data-panneau="manoeuvres" style={LISTE}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '14px 18px 8px' }}>
          <div style={PETITES_CAPITALES}>{tr('Manœuvres')}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--o-text2)' }}>{compteManoeuvres(liste.length, p)}</div>
        </div>
        {liste.length === 0 && Array.isArray(lu) && <div style={{ padding: '11px 18px', borderTop: filet(1), fontSize: 12.5, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Aucune manœuvre')}</div>}
        {liste.slice(0, 8).map((m) => <LigneManoeuvre key={m.t} m={m} t={t} fuseau={fuseau} />)}
      </div>
    </div>
  );
}

/* ════════════ La fiche ════════════ */

/* Avant la première écriture d'une série : la configuration du serveur, relue
 * (`loggia/volets/etat`) — relecture des tâches 6 à 12, point 2. Et une relecture
 * qui ÉCHOUE n'écrit RIEN (relecture finale des prises, B6 : le défaut était dans
 * le code qu'elles partagent avec nous). `planning.volets`, `soleil.volets` et
 * `baies.volets` partent ENTIÈRES, le serveur les remplace d'un bloc : bâti sur un
 * cache vide, le patch n'envoyait que le volet touché et effaçait les façades, les
 * portes et les heures de TOUS les autres ; bâti sur un cache de 15 s, il ignorait
 * ce qu'un autre appareil venait d'écrire. Le magasin publie `erreur` pour une
 * lecture ratée : on lève, la file n'envoie rien, la rangée touchée le dit
 * (`ecrire`, OngletPlanning). Une réponse DÉPASSÉE par une plus fraîche
 * (`rafraichirVolets()` rend null sans erreur) est un autre cas : le cache est
 * alors le plus frais, on le garde. */
const relireConfig = () => rafraichirVolets().then((r) => {
  if (r && r.config) return r.config;
  const { etat, erreur } = lireEtatVolets();
  if (!erreur && etat && etat.config) return etat.config;
  throw new Error('loggia/volets/etat : la configuration n’a pas pu être relue');
});

/**
 * `etat` : la réponse de `loggia/volets/etat` (le cache que partagent les
 * cartes) ; `erreur` : le serveur muet ; `epingle` : l'épingle de l'entité, posée par la coquille ;
 * `glyphe(defaut)` : l'icône choisie pour sa carte autour du glyphe par
 * défaut ; `piece` : le nom de sa pièce ; `onFiche(id)` ouvre la fiche
 * universelle de l'appareil. `ongletDepart` et `maintenant` servent aux tests.
 */
export default function FicheVoletContent({ hass, id, etat = null, erreur = false, piece = null, epingle = null, glyphe = null, onFiche = null, ongletDepart = 'accueil', maintenant = null }) {
  // Ce qui relie chaque onglet à son panneau, AVANT tout retour : un crochet ne se saute jamais.
  const idOnglets = useId();
  const [onglet, setOnglet] = useState(ongletDepart);
  const [periode, setPeriode] = useState('24h');
  // Les écritures de la fiche, l'une après l'autre : la file survit au changement d'onglet.
  const [file] = useState(() => fileEcritures(relireConfig));
  const st = id && hass && hass.states ? hass.states[id] || null : null;
  const v = voletDe(etat, id);
  const course = useCourseVolet(id, st, v && v.manoeuvre);
  const vue = vueVolet({ st, course, v, etat });
  const nom = (st && st.attributes && st.attributes.friendly_name) || id || tr('Volet');
  const [fond, encre] = plaqueVolet(vue.allume);
  const plaque = { icone: vue.glyphe, fond, encre };
  if (typeof glyphe === 'function') plaque.glyphe = glyphe(<Fi i={vue.glyphe} size={18} />, vue);
  const onglets = [['accueil', tr('Accueil'), 'home'], ['planning', tr('Planning'), 'calendar-clock'], ['historique', tr('Historique'), 'time-past']];
  const actuel = onglets.some(o => o[0] === onglet) ? onglet : 'accueil';
  // « Prochain mouvement » et « Dernier mouvement » ouvrent un onglet : le focus le suit, jamais sur <body>.
  const versOnglet = (o) => { setOnglet(o); focaliser(idOnglets + '-t-' + o); };
  const t = maintenant == null ? Date.now() : Number(maintenant);
  return (
    <div className="rb-fiche" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <EnteteFiche nom={nom} epingle={epingle} plaque={plaque} sousNom={sousNomVolet(piece, st && st.attributes ? st.attributes.device_class : null)} panne={vue.muet ? tr('Indisponible') : null} />
      <FicheOnglets idBase={idOnglets} nom={nom} onglets={onglets} actuel={actuel} onChoisir={setOnglet} />
      <PanneauOnglet idBase={idOnglets} actuel={actuel} avecOnglets>
        {actuel === 'accueil' && <OngletAccueil hass={hass} id={id} st={st} v={v} etat={etat} vue={vue} course={course} onOnglet={versOnglet} onFiche={onFiche} t={t} />}
        {actuel === 'planning' && <OngletPlanning hass={hass} id={id} etat={etat} erreur={erreur} ordinaire={compteOrdinaire(hass)} file={file} />}
        {actuel === 'historique' && <OngletHistorique hass={hass} id={id} periode={periode} onPeriode={setPeriode} t={t} />}
      </PanneauOnglet>
    </div>
  );
}
