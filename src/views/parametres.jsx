/**
 * Vue Parametres et son formulaire d'entites, charges a la demande.
 *
 * 1300 lignes que personne n'analyse en ouvrant le dashboard : on n'arrive ici
 * que volontairement. Le module ne remonte jamais vers App.jsx — un cycle
 * ramenerait le monolithe entier dans ce morceau et annulerait le decoupage.
 */
import { useState, useEffect, useRef, useMemo, useId, useCallback } from 'react';
import { puce } from '../styles.js';
import { AppareilsReglages } from './appareils.jsx';
import { appareilsConnus, ficheAppareil } from '../state.js';
import { evenementsPorte, sonnetteEnGrand, CLE_SONNETTE_GRAND } from '../evenement.js';
import {
  Fi, LOOK_DEF, HIDDEN_VIEWS, readViewsCfg, writeViewsCfg, cl_hexRgb, userBg, userImg, ListeChoix, ChampSuggere, CroixFeuille, NomFeuille, alerter
} from '../ui.jsx';
import {
  cfgVal, cfgSet, getHass, loggiaEnt, LOGGIA_CFG, LOGGIA_RESOLVED, LOGGIA_INDEX, enHaids, plateformeDe, voisinsDe, medCompanion,
  medPlayers, normRooms, secAlarm, switchLightsCfg, ctxLumieres,
  exportConfigComplete, lireConfigImport, importConfigComplete, resetLoggiaComplet, cheminPanneau, lirePageAccueil,
  definirPageAccueil, DROITS, DROITS_ADMIN_HA, compteOrdinaire
} from '../state.js';
import { conversationsDe, entiteChoisie, choixAssistant } from '../assistant.js';
import { fuiteCalculee, pluieDeRobot } from '../attention.js';
import {
  CV_ICONS, cvInp, cvName, cvEstTpl, cvKey, TplForm, USER_COLORS, BottomSheet, EntPicker, FOND_PHOTO_CLE,
  lireFondPhoto, compresserImage
} from '../ui.jsx';
import { useLoggia } from '../runtime.js';
import { lumieresDe } from '../lumieres.js';
import { commanderService } from '../actions.js';
import { viewReason } from '../views.js';
import { detecterCapteursPieces } from '../resolve.js';
import { autoFamille, FAMILLES_AUTO } from '../autos.js';
import { sansAccents } from '../outils.js';
// La recherche des réglages (07/11, usage étape 12).
import { REGLAGE_PAR_ID, optionsReglages, sectionDe, trouverRangee, montrerRangee } from '../reglagesindex.js';
import { filtrerChoix } from '../choix.js';
import { croqAncienneListe, plantsCfg } from '../lectures.js';
import { soeursDistributeur, commandeDistribuer, lireDistributeur, niveauDuBac } from '../distributeur.js';
import { mesurePortion, scriptsCandidats } from '../distributeurfiche.js';
import { envoyerFond, retirerFond } from '../fondphoto.js';
import { BoutonConfirme } from '../fichecommune.jsx';
import { reposerFocus } from '../focus.js';
import { useWide, useCoarse } from '../app/ecran.jsx';
import { useDemandes, enVol } from '../optimiste.js';
import { InterrupteursSection, gestesRegles, appareilsVisibles } from './interrupteurs.jsx';
import { VoletsReglages } from './volets.jsx';
import { FenetresReglages } from './fenetres.jsx';
import { PresenceReglages } from './presence.jsx';
import { NuitReglages } from './nuit.jsx';
import { VeillesReglages } from './veilles.jsx';
import { JournalReglages } from './journal.jsx';
import { FriseJour } from './reglesjour.jsx';
import { VersionsPrecedentes } from './versions.jsx';
import { weatherEntity } from '../wxutil.jsx';
import { lireQualiteCiel, ecrireQualiteCiel, niveauCielIci } from '../wxpresets.js';
import { CLE_VERRE, lireVerre, verreMesure, poserVerre } from '../verre.js';
import { CLE_NUIT, CLE_ASSOMBRIR, lireNuit, poserNuit, suivreNuit, soleilCouche } from '../nuitecran.js';
import { coursSoleil } from '../soleilcalc.js';
import { tr, trN, locale, choixLangue, languesDisponibles, nomProfil, comparerTextes } from '../i18n.js';
import { raisonEchec, bilanEcritures, texteRefus } from '../refus.js';
import { telechargerDiagnostics } from '../diagnostics.js';
import { commanderChauffage } from '../chauffageetat.js';
import { poserEtatEnfant } from '../enfantetat.js';
import { uniteTemp, wattsDe } from '../unites.js';
import { CarteTel, LignesTel, LigneTel, ChoixTel, BasculeTel, btnTel, lienTel, pasTel } from './partel.jsx';
import { Panneau, Ligne, Pastille, GrilleCartes, CarteGens, CAPITALES, MONO, FILET, btnPrimaire, btnSecondaire, btnDiscret, btnDanger } from './parcommun.jsx';
import { useTailleTexte } from '../tailletexte.js';

/* « Verre des cartes » : l'écriture, ici et pas dans verre.js — le démarrage
 * n'a besoin que de lire (ADR 0284). La classe suit sur-le-champ. Exportée
 * pour tests/verre_leger.test.mjs. */
export function ecrireVerre(q) {
  try { if (q === 'plein' || q === 'leger') localStorage.setItem(CLE_VERRE, q); else localStorage.removeItem(CLE_VERRE); } catch { /* stockage indisponible */ }
  poserVerre();
}

/* « Nuit de l'écran » (ADR 0287) : l'écriture ici aussi, le démarrage ne fait
 * que lire. Le défaut n'est pas écrit : Non et Moyen effacent leur clé.
 * Exportées pour tests/nuit_ecran.test.mjs. */
/** L'intensité : 'peu', 'moyen' (le défaut) ou 'beaucoup'. */
export const lireAssombrir = () => { let q = null; try { q = localStorage.getItem(CLE_ASSOMBRIR); } catch { /* stockage indisponible */ } return q === 'peu' || q === 'beaucoup' ? q : 'moyen'; };
export function ecrireNuit(q) {
  try { if (q === 'soleil') localStorage.setItem(CLE_NUIT, q); else localStorage.removeItem(CLE_NUIT); } catch { /* stockage indisponible */ }
  suivreNuit();
}
export function ecrireAssombrir(q) {
  try { if (q === 'peu' || q === 'beaucoup') localStorage.setItem(CLE_ASSOMBRIR, q); else localStorage.removeItem(CLE_ASSOMBRIR); } catch { /* stockage indisponible */ }
  poserNuit();
}
/** Ce que la ligne dit : l'heure du prochain coucher (ou du lever, s'il fait
 *  déjà nuit), lue sur `sun.sun`, sinon calculée ; sans soleil connu, 21 h–7 h. */
export function descNuit(nuit, hass, date = new Date()) {
  if (nuit !== 'soleil') return tr('Assombrit cet écran la nuit, pour ne pas éclairer la pièce');
  const fmt = (d) => d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const hm = (h) => { const d = new Date(date); d.setHours(0, Math.round(h * 60), 0, 0); return fmt(d); };
  const nuitNow = soleilCouche(hass, date);
  const sol = hass && hass.states && hass.states['sun.sun'];
  const iso = sol && sol.attributes && Date.parse(nuitNow ? sol.attributes.next_rising : sol.attributes.next_setting);
  const c = coursSoleil(hass, date);
  const h = iso > 0 ? fmt(new Date(iso)) : c ? hm(nuitNow ? c.lever : c.coucher) : null;
  if (h) return nuitNow ? tr('Du coucher au lever du soleil · cette nuit jusqu’à {h}', { h }) : tr('Du coucher au lever du soleil · ce soir dès {h}', { h });
  return sol ? tr('Du coucher au lever du soleil') : tr('Sans soleil connu : de {debut} à {fin}', { debut: hm(21), fin: hm(7) });
}

/* ── Les briques d'affichage, au niveau du module ────────────────────────────
 *
 * Elles vivaient DANS le composant. Un composant defini dans un autre est
 * recree a chaque rendu : React voit un type different au meme endroit, et
 * remonte tout le sous-arbre. L'ancien noeud est jete, un neuf prend sa place.
 *
 * Sur un bouton cela ne se voit pas. Sur un champ de saisie, c'est fatal : a
 * chaque lettre tapee le champ est detruit, le focus tombe sur le document, et
 * il faut recliquer pour la lettre suivante. Pire, `onBlur` ne part jamais —
 * un noeud retire du document ne perd pas le focus, il l'emporte —, donc ce que
 * l'on tape n'est jamais enregistre. C'est ce qui rendait le nom de
 * l'assistant impossible a saisir, et le remettait a vide au rechargement.
 *
 * Definies ici, leur identite ne change plus : React reconnait le meme type,
 * garde le meme noeud, et le champ garde son focus.
 */

const Tgl = ({ on, cb, label, off = false }) => (
  <span onClick={off ? undefined : cb} role="switch" aria-checked={!!on} aria-label={label} tabIndex={off ? -1 : 0} onKeyDown={(e) => { if (!off && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); cb(); } }}
    style={{ width: 46, height: 26, borderRadius: 14, background: on ? 'var(--o-accent-fond)' : 'var(--o-bd1)', position: 'relative', cursor: off ? 'not-allowed' : 'pointer', opacity: off ? .45 : 1, flexShrink: 0, transition: 'background .25s', display: 'inline-block' }}>
    <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: on ? '#fff' : 'var(--o-text3)', transition: 'left .32s cubic-bezier(.34,1.56,.64,1), background .25s', boxShadow: '0 2px 5px rgba(0,0,0,.3)' }} />
  </span>
);

// Carte et ligne de reglages : les briques communes (parcommun.jsx, maquettes
// du 18/09). Les noms restent, pour les sections qui les appellent deja.

const OptRow = ({ title, desc, children, retrait = false, eteint = false, ici = false }) => (
  <Ligne titre={title} desc={desc} retrait={retrait} eteint={eteint} ici={ici}>{children}</Ligne>
);

// Segment : 2 a 3 choix mutuellement exclusifs, sur une piste unique.
/* `wrap` : une liste dont on ne connait pas la longueur — les entites d'une
 * maison — se replie au lieu de deborder de l'ecran d'un telephone. */
/* `label` nomme le groupe, et chaque option dit si elle est choisie (audit
 * du 03/10). Le choix ne se voyait qu'en bleu plein : un lecteur d'ecran
 * lisait « Auto, bouton », « Clair, bouton »… sans dire lequel etait pris, ni
 * de quoi il s'agissait. Meme contrat que `Segment` (App.jsx) : un groupe
 * nomme, `aria-pressed` sur chaque option. Chaque appel donne son nom — le
 * plus souvent le titre de la ligne qui l'entoure. Le bleu plein ne change pas. */
const Seg = ({ value, opts, onPick, label, disabled = false, wrap = false }) => (
  <div role="group" aria-label={label} className="o-seg" style={{ display: 'flex', flexWrap: wrap ? 'wrap' : 'nowrap', gap: 4, padding: 3, borderRadius: 12, background: 'var(--o-well)', border: 'var(--o-bw,1px) solid var(--o-bd3)', opacity: disabled ? .5 : 1 }}>
    {opts.map(([v, lb]) => (
      <button key={String(v)} aria-pressed={value === v} disabled={disabled} onClick={() => onPick(v)} style={{ padding: '6px 13px', borderRadius: 10, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', background: value === v ? 'var(--o-accent-fond)' : 'transparent', color: value === v ? '#fff' : 'var(--o-text2)', boxShadow: 'none', fontFamily: 'inherit' }}>{lb}</button>
    ))}
  </div>
);

const stepBtn = { width: 30, height: 30, borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd1)', background: 'var(--o-s2)', color: 'var(--o-text1)', fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
// Marge : un pas a pas. « auto » = valeur calculee, non figee.
const MarginRow = ({ label, px, auto, onStep }) => (
  <Ligne retrait titre={label}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 3, borderRadius: 10, background: 'var(--o-s2)', flexShrink: 0 }}>
      <button onClick={() => onStep(-2)} style={stepBtn} aria-label={tr('Réduire') + ' ' + label}>−</button>
      <span style={{ minWidth: 70, textAlign: 'center', fontWeight: 800, fontSize: 12, fontFamily: 'ui-monospace,monospace', color: auto ? 'var(--o-text3)' : 'var(--o-text)' }}>{auto ? tr('Auto') : Math.round(px) + ' px'}</span>
      <button onClick={() => onStep(2)} style={stepBtn} aria-label={tr('Augmenter') + ' ' + label}>+</button>
    </div>
  </Ligne>
);

/* Les marges de l'ecran : un reglage de secours, replie par defaut — « auto »
 * convient presque partout, et un panneau ouvert invitait a y toucher. */
function MargesAvancees({ navbar, navMargin, navAuto, onNavOffset, topMargin, topAuto, onTopOffset, onReset }) {
  const [ouvert, setOuvert] = useState(false);
  const auto = navAuto && topAuto;
  return (
    <>
      <Ligne ici titre={tr('Marges de l’écran')} desc={ouvert ? tr('Auto lit la zone sûre : encoche, barre d’état.') : tr('« Auto » convient presque toujours.')}>
        <button type="button" onClick={() => setOuvert(o => !o)} aria-expanded={ouvert} aria-label={ouvert ? tr('Replier') : tr('Déplier')}
          style={{ width: 34, height: 34, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', border: 'none', color: 'var(--o-text2)', cursor: 'pointer' }}>
          <Fi i={ouvert ? 'angle-small-up' : 'angle-small-down'} size={15} />
        </button>
      </Ligne>
      {ouvert && (<>
        <MarginRow label={tr('En haut')} px={topMargin} auto={topAuto} onStep={onTopOffset} />
        {navbar && <MarginRow label={tr('En bas')} px={navMargin} auto={navAuto} onStep={onNavOffset} />}
        {/* Une marge réglée à la main ne revient pas seule à « Auto » : le geste reste. */}
        {!auto && <Ligne retrait><button onClick={onReset} style={btnDiscret}>{tr('Rétablir « auto »')}</button></Ligne>}
      </>)}
    </>
  );
}

const fleche = { width: 26, height: 26, borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 };
const Row = ({ icon, c, name, sub, on, locked, fixe = false, onT, onUp, onDown }) => (
  <div className="o-optrow" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 22px', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
    <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)' }}><Fi i={icon} size={15} color={on ? (c || 'var(--o-text2)') : 'var(--o-text3)'} /></span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: on ? 'var(--o-text)' : 'var(--o-text3)' }}>{name}</div>
      <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600 }}>{sub}</div>
    </div>
    {fixe
      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', flexShrink: 0 }}><Fi i="thumbtack" size={12} color="var(--o-text3)" />{tr('toujours visible')}</span>
      : <>
        <button onClick={onUp || undefined} disabled={!onUp} title={tr('Monter')} aria-label={tr('Monter') + ' ' + name} style={{ ...fleche, opacity: onUp ? 1 : .35, cursor: onUp ? 'pointer' : 'default' }}><Fi i="angle-up" size={12} /></button>
        <button onClick={onDown || undefined} disabled={!onDown} title={tr('Descendre')} aria-label={tr('Descendre') + ' ' + name} style={{ ...fleche, opacity: onDown ? 1 : .35, cursor: onDown ? 'pointer' : 'default' }}><Fi i="angle-down" size={12} /></button>
        {locked
          ? <span style={{ width: 46, textAlign: 'center', flexShrink: 0 }}><Fi i="lock" size={13} color="var(--o-text3)" /></span>
          : <Tgl on={on} cb={onT} label={name} />}
      </>}
  </div>
);


/**
 * Ce que l'installation est REELLEMENT.
 *
 * La carte affichait « v3.0 » et « A JOUR » ecrits en dur : deux affirmations
 * qui ne venaient d'aucune source et se sont retrouvees fausses des la
 * publication de la 2.1.0.
 *
 * La version se lit dans le manifeste du composant qui tourne — c'est lui que
 * HACS remplace. L'etat de mise a jour, lui, ne peut pas se deviner sans
 * interroger GitHub, ce que ce dashboard s'interdit (aucune ressource
 * externe) : quand HACS suit l'integration, il cree une entite `update` qui
 * porte deja la reponse. Sans elle, on n'affirme rien.
 */
function installationReelle() {
  const version = (LOGGIA_INDEX && LOGGIA_INDEX.componentVersion) || null;
  const S = (getHass() || {}).states || {};
  const suivi = Object.keys(S).find(id => id.startsWith('update.')
    && /loggia/i.test(id + ' ' + ((S[id].attributes && S[id].attributes.friendly_name) || '')));
  const st = suivi ? S[suivi] : null;
  const at = (st && st.attributes) || {};
  return {
    version: version ? 'v' + version : null,
    // `on` = une version plus recente existe. Sans entite de suivi, `null` :
    // on ne sait pas, et le dire vaut mieux que de rassurer a tort.
    aJour: st ? (st.state === 'off' ? true : (st.state === 'on' ? false : null)) : null,
    disponible: at.latest_version || null,
    suiviPar: suivi ? 'HACS' : null,
  };
}

// Cartes du sélecteur de thème Loggia ('' = défaut). cols = [accent, fond, accent2] pour l'aperçu.
/* Une FONCTION, pas une table.
 *
 * Evaluee a l'import, cette liste figeait ses libelles dans la langue du
 * demarrage. C'est ce qui obligeait a recharger la page apres un changement de
 * langue. Appelee au rendu, elle se dit dans la langue du moment. */
const PRESET_META = () => [
  { id: '', name: 'Loggia', desc: tr('Thème par défaut'), cols: ['#4f8cff', '#0b101b', '#6ea8ff'] },
  { id: 'neumorphix', name: 'Neumorphix', desc: 'Doux, en relief', cols: ['#6c7ae0', '#1e2128', '#5de0d8'] },
  { id: 'google', name: 'Google', desc: tr('Material épuré'), cols: ['#1a73e8', '#171717', '#8ab4f8'] },
  { id: 'ios', name: 'iOS', desc: 'Apple, arrondi', cols: ['#ff9409', '#0d0d10', '#ff9f09'] },
  { id: 'frosted', name: 'Frosted Glass', desc: tr('Verre dépoli, flou'), cols: ['#6a74d3', '#1a2540', '#bcc8f0'] },
  { id: 'onedark', name: 'One Dark Pro', desc: "L'esprit Atom", cols: ['#61afef', '#282c34', '#98c379'] },
  { id: 'dracula', name: 'Dracula', desc: 'Violet vampirique', cols: ['#bd93f9', '#282a36', '#ff79c6'] },
  { id: 'github', name: 'GitHub Dark', desc: tr('Sobre, façon GitHub'), cols: ['#58a6ff', '#0d1117', '#3fb950'] },
  { id: 'tokyo', name: 'Tokyo Night', desc: tr('Néon nocturne'), cols: ['#7aa2f7', '#1a1b26', '#bb9af7'] },
  { id: 'material', name: 'Material Theme', desc: tr('Océan Material'), cols: ['#80cbc4', '#263238', '#82aaff'] },
  { id: 'nightowl', name: 'Night Owl', desc: 'Nuit profonde', cols: ['#82aaff', '#011627', '#c792ea'] },
  { id: 'lavande', name: 'Lavande', desc: 'Charcoal, lavande douce', cols: ['#c3b5e6', '#2b2b2f', '#d6cdea'] },
  { id: 'plum', name: 'Plum Wine', desc: tr('Prune, rose poudré'), cols: ['#eda4b6', '#341624', '#f2c6cf'] },
  { id: 'atrium', name: 'Atrium', desc: tr('A plat, sans ombre'), cols: ['#5b8cff', '#050609', '#2dd4bf'] },
  { id: 'projekt', name: 'The Projekt', desc: tr('Nuit bleue, lumière froide'), cols: ['#3ca2d9', '#020d12', '#bee8ff'] },
  { id: 'saphir', name: 'Saphir', desc: tr('Bleu roi sur nuit profonde'), cols: ['#24428f', '#02060a', '#63a7d4'] },
  { id: 'acier', name: 'Acier', desc: tr('Gris bleutés, sobre'), cols: ['#4e6a83', '#10161c', '#b7c6d3'] },
  { id: 'givre', name: 'Givre', desc: tr("Bleus d'hiver, lumineux"), cols: ['#4d79a8', '#223a5e', '#d0e1f2'] },
];
// Luminance 0..1 d'une couleur (hex/rgb) → choix sombre/clair

// Nav latérale des Paramètres, groupée façon Atrium (réf. user 20/08) : { grp, items: [id, label, glyphe UICons] }


/* ════════════ ALERTES SÛRETÉ → TÉLÉPHONE (admin) ════════════
 * L'écoute vit dans le COMPOSANT serveur (alertes.py) : le dashboard peut être
 * fermé, l'alerte part quand même. Ici on ne fait que régler et tester. La
 * configuration s'écrit dans la partie commune du store (clé loggia_alertes). */
const ALERTES_DEF = () => ({ actif: false, service: '', categories: { fumee: true, gaz: true, co: true, fuite: true, alarme: true, portes: false }, cooldown_min: 5,
  // Les heures calmes : entre ces heures, rien ne sonne. Le socle des règles
  // les lit (regles.py) ; seul le danger passe quand même.
  calme: { actif: false, debut: '22:00', fin: '07:00' },
  // La moitié « action » de §18 : sur un danger, la maison réagit (ADR 0022).
  actions: { actif: true, lumieres: true, volets: true, vanne: { actif: true, entite: '' } } });
/* Les familles de capteurs et les classes qui les font reconnaitre : les
 * memes que le composant (alertes.py, BINAIRES). */
/* La même table que le composant (`alertes.py`), sinon l'écran compterait des
 * détecteurs qui n'alertent plus. `safety` en est sorti le 06/10 : il ne dit
 * pas DE QUOI il s'agit, et Meteoalarm s'en sert pour une alerte météo — une
 * alerte vent a ouvert une chambre et allumé la maison. */
const ALERTES_CLASSES = { fumee: ['smoke'], gaz: ['gas'], co: ['carbon_monoxide'], fuite: ['moisture'] };
/* Les catégories qui font RÉAGIR la maison (alertes.py : LUMIERES, VOLETS, VANNE) : les décocher coupe aussi la réaction (audit du
 * 19/10, M22). L'ouverture sous alarme armée ne fait que prévenir. */
const REAGISSENT = ['fumee', 'gaz', 'co', 'fuite', 'alarme'];

/** Les détecteurs d'une famille, reconnus à leur classe — comme le composant (audit du 19/10, M1 : une seule règle « plante ou
 *  fuite »). Un `moisture` n'est pas une fuite quand un modèle ou un groupe le calcule (`fuiteCalculee`, ADR 0022), ni quand il est
 *  le besoin d'eau d'une plante : son identifiant commence par la base d'une plante de `loggia_plants`, suivie de rien ou d'un « _ »
 *  — la règle d'`estPlante` (attention.js) et du serveur (`alertes._est_plante`) ; ni la pluie d'un robot (`pluieDeRobot`, ADR
 *  0305). `ctx` : `plateforme(id)` (l'index), `voisins(id)` (les domaines de son appareil), `plantes` (les bases). L'écran ne
 *  compte pas un détecteur qui n'alerte pas. */
export function detecteursAlertes(S, classes, ctx = {}) {
  const etats = S && typeof S === 'object' ? S : {};
  const plateforme = typeof ctx.plateforme === 'function' ? ctx.plateforme : () => null;
  const voisins = typeof ctx.voisins === 'function' ? ctx.voisins : () => [];
  const bases = (Array.isArray(ctx.plantes) ? ctx.plantes : []).filter(b => typeof b === 'string' && b);
  const estPlante = (id) => bases.some(b => id.indexOf(b) === 0 && (id.length === b.length || id.charAt(b.length) === '_'));
  return Object.keys(etats).filter(id => {
    if (id.indexOf('binary_sensor.') !== 0) return false;
    const dc = ((etats[id] || {}).attributes || {}).device_class;
    if (classes.indexOf(dc) < 0) return false;
    return !(dc === 'moisture' && (fuiteCalculee(plateforme(id)) || estPlante(id) || pluieDeRobot(voisins(id))));
  });
}

/** Le nom d'un telephone. L'app compagnon nomme son service d'apres
 *  l'appareil (`mobile_app_<appareil>`), et son traceur porte le meme nom. */
function nomTelephone(hass, service) {
  const slug = String(service || '').replace(/^mobile_app_/, '');
  const st = hass && hass.states && hass.states['device_tracker.' + slug];
  const nom = st && st.attributes && st.attributes.friendly_name;
  if (nom) return nom;
  const t = slug.replace(/_/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/** Un choix qui se lit comme la maquette — un nom, l'identifiant dessous.
 *  Il portait un vrai <select> posé invisible par-dessus ; sa liste, dessinée
 *  par le système, s'ouvrait blanche sous Windows (retour du 18/09). Il ouvre
 *  maintenant celle de Loggia (`ListeChoix`), au clavier comme au doigt. */
function ChoixEntite({ icone, nom, ident, label, value, onChange, options }) {
  return (
    <ListeChoix label={label} value={value} onChange={onChange} options={options}
      style={{ gap: 12, minWidth: 0, width: 268, maxWidth: '100%', padding: '9px 14px', borderRadius: 14, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)' }}>
      {(courant, ouvert) => (
        <>
          <Fi i={icone} size={15} color="var(--o-text2)" />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: 'var(--o-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nom}</span>
            <span style={{ display: 'block', ...MONO, fontSize: 11, color: 'var(--o-text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{ident}</span>
          </span>
          <span style={{ display: 'inline-flex', transition: 'transform .18s', transform: ouvert ? 'rotate(180deg)' : 'none' }}><Fi i="angle-small-down" size={14} color="var(--o-text3)" /></span>
        </>
      )}
    </ListeChoix>
  );
}

/* ════════════ QUI REÇOIT QUOI (chantier G2 ; ADR 0301) ════════════
 * Le composant suit chaque personne jusqu'à son téléphone (destinataires.py) :
 * son compte, ses traceurs, l'appareil de l'application compagnon, le service
 * `notify.mobile_app_*` vérifié. Ici on le LIT — « Camille : Téléphone de
 * Camille » —, et on CORRIGE : choisir le service d'une personne, ou retirer
 * un appareil d'un PUBLIC — le mode enfant, les notifications ordinaires. La
 * SÛRETÉ ne se retire jamais : elle part à tout le monde, et au repli
 * (relecture du 30/10, point 1). Les corrections vivent dans
 * `loggia_alertes.personnes` et s'appliquent ici tout de suite, comme le
 * composant les applique. Administrateurs seulement : la commande le refuse
 * aux autres, et le panneau se tait alors. */
const EXCLUABLES = ['admins', 'presents'];
const exclusDe = (c) => {
  const e = c && c.exclus;
  /* La première forme, une liste, vaut pour les deux publics (destinataires.corrections_de). */
  if (Array.isArray(e)) return { admins: e.slice(), presents: e.slice() };
  const d = e && typeof e === 'object' ? e : {};
  return { admins: Array.isArray(d.admins) ? d.admins : [], presents: Array.isArray(d.presents) ? d.presents : [] };
};

function QuiRecoit({ hass, cfg, save, services, tel = false, actif = true }) {
  const h = hass && typeof hass.callWS === 'function' ? hass : null;
  const connecte = !!h;
  /* Lu une fois par connexion : `hass` change à chaque état de la maison, et
   * la liste des personnes ne se relit pas à chaque lampe allumée. */
  const hRef = useRef(h);
  hRef.current = h;
  const [etat, setEtat] = useState(null);
  const [refus, setRefus] = useState('');
  const [ouvert, setOuvert] = useState(null);
  useEffect(() => {
    const ws = hRef.current;
    if (!ws) return undefined;
    let vivant = true;
    ws.callWS({ type: 'loggia/notifications/destinataires' })
      .then(r => { if (vivant) setEtat(r && Array.isArray(r.personnes) ? r : { personnes: [] }); })
      .catch(e => { if (vivant) setRefus((e && e.code) || 'panne'); });
    return () => { vivant = false; };
  }, [connecte]);
  if (refus === 'unknown_command') {
    return (
      <Panneau titre={tr('Qui reçoit quoi')} niveau="alerte">
        <div style={{ padding: '0 22px 18px', fontSize: 12.5, fontWeight: 700, color: 'var(--o-warn)' }}>{tr('Redémarrez Home Assistant pour voir qui reçoit quoi.')}</div>
      </Panneau>
    );
  }
  if (!etat) return null;
  const corr = cfg.personnes && typeof cfg.personnes === 'object' ? cfg.personnes : {};
  const poser = (person, patch) => save({ personnes: { ...corr, [person]: { ...(corr[person] || {}), ...patch } } });
  const nomService = (s) => nomTelephone(hass, s) || s;
  /* Les trois publics que le composant connaît (destinataires) : la sûreté,
   * qui ne s'exclut jamais ; le mode enfant, pour les administrateurs ; les
   * machines, la collecte et les veilles, pour les personnes à la maison. La
   * maquette dessinait cinq familles que Loggia ne distingue pas. */
  const PUBLICS = [['surete', tr('Sûreté'), 'lock', 'bad'], ['admins', tr('Mode enfant'), 'child-head', 'cyan'], ['presents', tr('Machines, collecte, veilles'), 'bell', 'warn']];
  const fiche = (p) => {
          const c = corr[p.person] || {};
          const exclus = exclusDe(c);
          const choisi = typeof c.service === 'string' ? c.service : '';
          const decouverts = Array.isArray(p.appareils) ? p.appareils : [];
          /* Ce qui reçoit : le service choisi s'il existe encore, sinon les appareils trouvés (destinataires.personnes). */
          const absent = !!choisi && (services.length ? services.indexOf(choisi) < 0 : !!p.service_absent);
          // L'identifiant du service sous le nom : calculé ici, pas écrit dans le rendu.
          const base = (choisi && !absent ? [{ service: choisi, nom: nomService(choisi) }] : decouverts)
            .map(a => ({ ...a, ident: 'notify.' + a.service }));
          const pourEnfant = base.filter(a => exclus.admins.indexOf(a.service) < 0);
          const svcs = choisi && services.indexOf(choisi) < 0 ? [choisi, ...services] : services;
          const basculer = (pub, service) => {
            const l = exclus[pub];
            poser(p.person, { exclus: { ...exclus, [pub]: l.indexOf(service) < 0 ? [...l, service] : l.filter(x => x !== service) } });
          };
    return { c, exclus, choisi, absent, base, pourEnfant, svcs, basculer };
  };
  /* Une case = un public pour TOUS les téléphones de la personne ; le détail,
   * téléphone par téléphone, reste dans sa feuille. */
  const caseDe = (p, pub) => {
    const { exclus, base } = fiche(p);
    if (pub === 'surete') return { on: base.length > 0, verrou: true };
    if (pub === 'admins' && !p.admin) return null;
    const on = base.length > 0 && base.every(a => exclus[pub].indexOf(a.service) < 0);
    return { on, go: base.length ? () => {
      const l = exclus[pub];
      const ids = base.map(a => a.service);
      poser(p.person, { exclus: { ...exclus, [pub]: on ? [...new Set([...l, ...ids])] : l.filter(x => ids.indexOf(x) < 0) } });
    } : null };
  };
  const telsDe = (p) => { const { base } = fiche(p); return base.length ? base.map(a => a.nom).join(', ') : tr('Aucun téléphone suivi'); };
  const feuille = ouvert && etat.personnes.find(x => x.person === ouvert);
  const detailFeuille = feuille && (() => {
    const p = feuille;
    const { exclus, choisi, absent, base, pourEnfant, svcs, basculer } = fiche(p);
    return (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 800 }}>{p.nom}</span>
                <Pastille capitales niveau={p.present ? 'ok' : 'neutre'}>{p.present ? tr('À la maison') : tr('Absent')}</Pastille>
                {p.admin && <Pastille capitales niveau="accent">{tr('Administrateur')}</Pastille>}
                <span style={{ marginLeft: 'auto' }}>
                  <ListeChoix label={tr('Service de {nom}', { nom: p.nom })} value={choisi} onChange={v => poser(p.person, { service: v })}
                    options={[{ id: '', label: tr('Automatique') }, ...svcs.map(x => ({ id: x, label: nomService(x), sub: 'notify.' + x }))]}
                    style={{ padding: '6px 12px', borderRadius: 10, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 12, fontWeight: 700, maxWidth: 220 }} />
                </span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: base.length ? 'var(--o-text2)' : 'var(--o-text3)', marginTop: 3 }}>
                {base.length ? base.map(a => a.nom).join(', ') : tr('Aucun téléphone trouvé')}
              </div>
              {absent && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-warn)', marginTop: 3 }}>{tr('Le service choisi n’existe plus : ses téléphones trouvés prennent le relais.')}</div>}
              {/* Un administrateur sur plusieurs appareils (relecture du 30/10, point 2) : une tablette d'enfant ou un écran mural ouverts
                * sous son compte recevraient les demandes de l'enfant, boutons compris. On le DIT ; on ne devine pas lequel. */}
              {p.admin && pourEnfant.length > 1 && (
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-warn)', marginTop: 4, lineHeight: 1.45 }}>
                  {tr('{nom} reçoit les demandes du mode enfant sur plusieurs appareils : {appareils}. Si l’un d’eux est la tablette d’un enfant ou un écran mural, retirez-lui « Mode enfant ».', { nom: p.nom, appareils: pourEnfant.map(a => a.nom).join(', ') })}
                </div>
              )}
              {base.map(a => (
                <div key={a.service} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                  <Fi i="mobile-button" size={13} color="var(--o-text2)" />
                  <span style={{ flex: '1 1 140px', minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nom}</span>
                    <span style={{ display: 'block', ...MONO, fontSize: 11, color: 'var(--o-text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.ident}</span>
                  </span>
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {/* La sûreté : toujours, et le dire — la puce ne se décoche pas. */}
                    <button type="button" disabled aria-pressed="true" title={tr('La sûreté ne s’exclut jamais')}
                      style={{ ...puce(true), cursor: 'default', opacity: .75 }}>{tr('Sûreté')}</button>
                    {EXCLUABLES.filter(pub => pub !== 'admins' || p.admin).map(pub => {
                      const on = exclus[pub].indexOf(a.service) < 0;
                      const nom = pub === 'admins' ? tr('Mode enfant') : tr('Machines, collecte, veilles');
                      return (
                        <button key={pub} type="button" aria-pressed={on} onClick={() => basculer(pub, a.service)}
                          aria-label={tr('{public} sur {appareil}', { public: nom, appareil: a.nom })} style={puce(on)}>{nom}</button>
                      );
                    })}
                  </span>
                </div>
              ))}
            </div>

    );
  })();
  const repli = cfg.service ? tr('Repli : {service} — toujours pour la sûreté ; pour le reste, quand personne n’est trouvé ou qu’un envoi échoue.', { service: 'notify.' + cfg.service }) : tr('Aucun repli : sans téléphone trouvé, rien ne part.');
  const sheet = feuille && <BottomSheet onClose={() => setOuvert(null)} title={feuille.nom}>{detailFeuille}</BottomSheet>;

  if (tel) return (
    <>
      <CarteTel titre={tr('Qui reçoit quoi')} desc={tr('Chaque personne de Home Assistant, suivie jusqu’à son téléphone — rien à régler ; ici, on corrige.')}>
        <LignesTel>
          {etat.personnes.map((p) => {
            const { base } = fiche(p);
            return (
              <LigneTel key={p.person} ava={(p.nom || '?').charAt(0).toUpperCase()} avaFond="linear-gradient(140deg,var(--o-accent),var(--o-purple))" titre={p.nom} desc={telsDe(p)} eteint={!base.length}>
                {base.length > 0 && PUBLICS.map(([pub, nom]) => {
                  const k = caseDe(p, pub);
                  if (!k) return null;
                  return (
                    <button key={pub} type="button" aria-pressed={k.on} disabled={!k.go} onClick={k.go || undefined} title={k.verrou ? tr('La sûreté ne s’exclut jamais') : nom}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 9, border: 'none', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', cursor: k.go ? 'pointer' : 'default', background: k.on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: k.on ? '#fff' : 'var(--o-text1)', transition: 'background .2s' }}>
                      {k.verrou && <Fi i="lock" size={10} />}{nom}
                    </button>
                  );
                })}
                <button type="button" onClick={() => setOuvert(p.person)} style={lienTel}>{tr('Corriger')}<Fi i="angle-small-right" size={13} /></button>
              </LigneTel>
            );
          })}
        </LignesTel>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text2)' }}>{repli}</div>
      </CarteTel>
      {sheet}
    </>
  );

  const grille = 'minmax(170px,1fr) repeat(3,96px)';
  return (
    <Panneau titre={tr('Qui reçoit quoi')} desc={tr('Chaque personne est suivie jusqu’à son téléphone. Une case, un public d’alertes.')}
      pied={<span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)' }}>{repli}</span>}>
      <div role="table" aria-label={tr('Qui reçoit quoi')} style={{ padding: '4px 22px 20px', overflowX: 'auto', opacity: actif ? 1 : .45, transition: 'opacity .2s' }}>
        <div role="row" style={{ display: 'grid', gridTemplateColumns: grille, alignItems: 'end', gap: 8, paddingBottom: 6, minWidth: 460 }}>
          <span role="columnheader" aria-label={tr('Personne')} />
          {PUBLICS.map(([pub, nom, ico, teinte]) => (
            <span key={pub} role="columnheader" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, ...CAPITALES, fontSize: 9.5, textAlign: 'center', lineHeight: 1.25 }}>
              <Fi i={ico} size={13} color={'var(--o-' + teinte + ')'} />{nom}
            </span>
          ))}
        </div>
        {etat.personnes.map((p) => {
          const { base } = fiche(p);
          return (
            <div key={p.person} role="row" style={{ display: 'grid', gridTemplateColumns: grille, alignItems: 'center', gap: 8, padding: '6px 0', minWidth: 460 }}>
              {/* Le nom ouvre le détail : le service choisi, téléphone par téléphone. */}
              <button type="button" role="rowheader" onClick={() => setOuvert(p.person)} title={tr('Corriger')}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 0, background: 'none', border: 'none', color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer', minWidth: 0, opacity: base.length ? 1 : .5 }}>
                <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(140deg,var(--o-accent),var(--o-purple))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{(p.nom || '?').charAt(0).toUpperCase()}</span>
                <span style={{ minWidth: 0, lineHeight: 1.25 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 800 }}>{p.nom}</span>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{telsDe(p)}</span>
                </span>
              </button>
              {PUBLICS.map(([pub, nom]) => {
                const k = caseDe(p, pub);
                return (
                  <span key={pub} role="cell" style={{ display: 'flex', justifyContent: 'center' }}>
                    {k && (
                      <button type="button" role="checkbox" aria-checked={k.on} aria-label={tr('{public} pour {nom}', { public: nom, nom: p.nom })} disabled={!k.go} onClick={k.go || undefined}
                        title={k.verrou ? tr('La sûreté ne s’exclut jamais') : nom}
                        style={{ width: 48, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: k.go ? 'pointer' : 'default', transition: 'background .2s', background: k.on ? 'var(--o-accent-fond)' : 'transparent', border: k.on ? 'none' : '1.5px solid var(--o-bd1)', color: k.on ? '#fff' : 'var(--o-text3)' }}>
                        {(k.on || k.verrou) && <Fi i={k.verrou ? 'lock' : 'check'} size={11} />}
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
      {sheet}
    </Panneau>
  );
}

function AlertesTele({ hass, tel = false, tailleTitre = 34 }) {
  const h = hass && typeof hass.callWS === 'function' ? hass : null;
  const [cfg, setCfg] = useState(null);
  const [services, setServices] = useState([]);
  const [msg, setMsg] = useState('');
  // Le refus d'une écriture, à part du message de l'essai : il se dit en haut, près des bascules (relecture du 03/11).
  const [refus, setRefus] = useState('');
  // La demonstration n'a pas de composant : ses reglages vivent dans sa
  // configuration locale, et rien ne part.
  const [local, setLocal] = useState(false);
  const connecte = !!h;
  const complet = (c0) => {
    const d = ALERTES_DEF(); const c = c0 || {};
    return { ...d, ...c, categories: { ...d.categories, ...(c.categories || {}) }, calme: { ...d.calme, ...(c.calme || {}) },
      actions: { ...d.actions, ...(c.actions || {}), vanne: { ...d.actions.vanne, ...((c.actions || {}).vanne || {}) } } };
  };
  useEffect(() => {
    if (!h) { setCfg(ALERTES_DEF()); return; }
    h.callWS({ type: 'loggia/config/get' }).then(r => setCfg(complet(r && r.config && r.config.loggia_alertes))).catch(() => {
      if (typeof window !== 'undefined' && window.__loggiaDemo) { setLocal(true); setCfg(complet(cfgVal('loggia_alertes', null))); return; }
      // Lecture ratee : on ne montre PAS les valeurs par defaut — un reglage
      // touche ensuite aurait ecrase la vraie configuration de surete (audit 18/09).
      setCfg(null);
      setMsg(tr('Réglages de sûreté indisponibles pour le moment — rien n’a été chargé, ne modifie rien ici avant de réessayer.'));
    });
    // La liste des cibles possibles : les services notify de l'installation.
    h.callWS({ type: 'get_services' }).then(r => {
      const n = (r && r.notify) || {};
      setServices(Object.keys(n).filter(x => ['notify', 'persistent_notification', 'send_message'].indexOf(x) < 0).sort());
    }).catch(() => {});
  }, [connecte]);
  const save = (patch) => {
    if (!cfg) return;
    const n = { ...cfg, ...patch };
    setCfg(n); setMsg(''); setRefus('');
    if (local) { cfgSet({ loggia_alertes: n }); return; }
    /* Un refus n'est pas une panne (audit du 03/10). `loggia_alertes` est un
     * réglage de la maison : sous un compte Home Assistant ordinaire, le
     * composant le refuse (`not_admin`, la clé nommée — store.py), même quand
     * le profil a reçu « Alertes ». L'écran disait « le composant ne répond
     * pas » et envoyait chercher une panne. Sur un échec, la bascule revient
     * aussi à la valeur d'avant — sauf si un réglage plus récent l'a déjà
     * remplacée. */
    /* « Fermer en cas de fuite » se règle dans la popup de la vanne, par sa commande étroite (chantier IoT, étape 3 ; I29) : la
     * configuration lue à l'ouverture de Paramètres peut être périmée depuis. C'est le SERVEUR qui la garde — `loggia/config/set`
     * reprend `actions.vanne.actif` du disque, sous le verrou du magasin (store.py, passe bis, point 6). La relecture que l'étape 3
     * faisait ici avant d'écrire est partie : elle ne ramenait plus la bascule après un refus (point 5), et deux réglages rapides
     * relisaient la même configuration — le second effaçait le premier. */
    if (h) h.callWS({ type: 'loggia/config/set', config: { loggia_alertes: n } })
      .catch((e) => { setRefus(raisonEchec(e, 'loggia_alertes')); setCfg(c => (c === n ? cfg : c)); });
  };
  /* Le téléphone choisi ici ne sert pas qu'aux alertes de sûreté : la fin d'un cycle d'électroménager, les veilles (batterie, heures creuses…)
   * l'utilisent AUSSI, sûreté coupée (`prevenir`, regles.py, ne lit que `service`). L'essai marche donc dès qu'un téléphone est choisi — « pour la prise
   * lave vaisselle, j'ai testé, je ne reçois pas de notification quand c'est terminer malgrer le reglage activé » (retour du 15/10) : il restait grisé
   * sûreté coupée, et rien ne permettait de vérifier que le téléphone recevait. Sûreté coupée, le titre n'en parle pas : « Loggia », celui des autres
   * notifications du serveur. */
  const test = () => {
    if (!cfg.service) { setMsg(tr('Choisissez d’abord un téléphone.')); return; }
    if (local) { setMsg(tr('Démonstration : rien ne part vers un vrai téléphone.')); return; }
    Promise.resolve().then(() => hass.callService('notify', cfg.service, { title: cfg.actif ? tr('Loggia — sûreté') : tr('Loggia'), message: tr('Notification de test — tout est en place.') }))
      .then(() => setMsg(tr('Test envoyé — regardez votre téléphone.')))
      .catch(() => setMsg(tr('Envoi impossible — Home Assistant a refusé ce service.')));
  };
  if (!cfg) {
    return (
      <Panneau niveau={msg ? 'alerte' : null}>
        <div style={{ padding: '18px 22px', fontSize: 13, fontWeight: 700, color: msg ? 'var(--o-warn)' : 'var(--o-text3)' }}>{msg || tr('Chargement…')}</div>
      </Panneau>
    );
  }
  const S = (hass && hass.states) || {};
  // Les detecteurs de chaque famille, reconnus a leur classe — comme le composant ; ni un `moisture` qu'un modèle ou un groupe calcule
  // (ADR 0022, 16/10), ni le besoin d'eau d'une plante (audit du 19/10, M1) : l'écran ne compte pas un détecteur qui n'alerte pas.
  const plantes = plantsCfg().map(p => p.base).filter(Boolean);
  const capteurs = (classes) => detecteursAlertes(S, classes, { plateforme: plateformeDe, voisins: voisinsDe, plantes });
  const decompte = (ids, humidite = false) => {
    if (!ids.length) return tr('Aucun détecteur pour l’instant');
    const n = ids.length;
    const base = humidite
      ? trN(n, '{n} détecteur d’humidité', '{n} détecteurs d’humidité')
      : trN(n, '{n} détecteur', '{n} détecteurs');
    const piece = n === 1 && LOGGIA_INDEX && typeof LOGGIA_INDEX.areaNameOf === 'function' ? LOGGIA_INDEX.areaNameOf(ids[0]) : null;
    return piece ? base + ' · ' + piece : base;
  };
  const CATS = [
    ['fumee', tr('Fumée'), 'fire-flame-curved', 'bad', decompte(capteurs(ALERTES_CLASSES.fumee))],
    ['gaz', tr('Gaz'), 'wind', 'orange', decompte(capteurs(ALERTES_CLASSES.gaz))],
    ['co', tr('Monoxyde de carbone'), 'temperature-high', 'warn', decompte(capteurs(ALERTES_CLASSES.co))],
    ['fuite', tr("Fuite d'eau"), 'water', 'cold', decompte(capteurs(ALERTES_CLASSES.fuite), true)],
    ['alarme', tr('Alarme déclenchée'), 'bell', 'bad', tr('Toujours envoyée, sans délai anti-rafale')],
    ['portes', tr('Ouverture sous alarme armée'), 'door-closed', null, tr('{p} · {s}', { p: tr('Portes, fenêtres et garage'), s: tr('Sabotage') })],
  ];
  // Les vannes possibles : une `valve`, ou une prise commandee sur l'arrivee d'eau.
  const vannes = Object.keys(S).filter(id => id.indexOf('valve.') === 0).sort();
  const prises = Object.keys(S).filter(id => id.indexOf('switch.') === 0).sort();
  // Sans choix, le composant les ferme TOUTES (alertes.py, `_vannes` ; I30) : l'écran dit lesquelles.
  const vannesEau = vannes.filter(id => (S[id].attributes || {}).device_class === 'water');
  const nomDe = (id) => (S[id] && S[id].attributes && S[id].attributes.friendly_name) || id;
  const vanneAuto = vannesEau.length > 1 ? tr('toutes les vannes d’eau') : vannesEau.length ? nomDe(vannesEau[0]) : null;
  // Par nom affiché, pas par identifiant : la liste se lit comme elle s'écrit.
  const parNom = (ids) => ids.slice().sort((a, b) => comparerTextes(nomDe(a), nomDe(b)));
  const vanne = cfg.actions.vanne.entite || '';
  const svcs = cfg.service && services.indexOf(cfg.service) < 0 ? [cfg.service, ...services] : services;
  const actOff = !cfg.actions.actif;
  /* La frise du calme (maquette v3) : la plage sur 24 h, l'heure qu'il est. */
  const enHeures = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? (+m[1]) + (+m[2]) / 60 : null; };
  const de = enHeures(cfg.calme.debut), a = enHeures(cfg.calme.fin);
  const pct = (x) => (x / 24 * 100).toFixed(2) + '%';
  const plages = de == null || a == null ? [] : de > a ? [[de, 24], [0, a]] : [[de, a]];
  const maintenant = (() => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; })();
  const frise = (
    <div aria-hidden="true" style={{ position: 'relative', height: 46, margin: '2px 22px 8px' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 10, height: 4, borderRadius: 2, background: 'var(--o-s1)' }} />
      {plages.map(([x, y], i) => <div key={i} style={{ position: 'absolute', top: 10, height: 4, borderRadius: 2, left: pct(x), width: pct(y - x), background: 'rgba(var(--o-purple-rgb),.55)' }} />)}
      <div style={{ position: 'absolute', top: 2, height: 20, width: 2, borderRadius: 1, left: pct(maintenant), background: 'var(--o-accent)' }} />
      {[0, 6, 12, 18, 24].map(x => <span key={x} style={{ position: 'absolute', top: 28, left: pct(x), transform: x === 24 ? 'translateX(-100%)' : x ? 'translateX(-50%)' : 'none', fontSize: 9.5, fontWeight: 700, color: 'var(--o-text3)' }}>{tr('{n} h', { n: x })}</span>)}
    </div>
  );
  const styleHeure = { ...cvInp, width: tel ? 108 : 112, padding: tel ? '8px 11px' : '9px 12px', fontSize: tel ? 12 : 13 };
  const heureDebut = <input aria-label={tr('Début des heures calmes')} type="time" value={cfg.calme.debut || ''} onChange={e => save({ calme: { ...cfg.calme, debut: e.target.value } })} style={styleHeure} />;
  const heureFin = <input aria-label={tr('Fin des heures calmes')} type="time" value={cfg.calme.fin || ''} onChange={e => save({ calme: { ...cfg.calme, fin: e.target.value } })} style={styleHeure} />;
  const choixService = (
    <ChoixEntite icone="mobile-button" label={tr('Téléphone de secours')} value={cfg.service || ''} onChange={v => save({ service: v })}
      nom={cfg.service ? nomTelephone(hass, cfg.service) : tr('Aucun téléphone')} ident={cfg.service ? 'notify.' + cfg.service : tr('à choisir')}
      options={[{ id: '', label: tr('Aucun téléphone') }, ...svcs.map(x => ({ id: x, label: nomTelephone(hass, x), sub: 'notify.' + x }))]} />
  );
  const choixVanne = (
    <ChoixEntite icone="water" label={tr('Entité de la vanne d’eau')} value={vanne} onChange={v => save({ actions: { ...cfg.actions, vanne: { ...cfg.actions.vanne, entite: v } } })}
      nom={vanne ? nomDe(vanne) : vanneAuto || tr('Aucune vanne d’eau')} ident={vanne || (vannesEau.length ? vannesEau.join(', ') + ' · ' + tr('auto') : tr('rien à couper'))}
      options={[
        { id: '', label: tr('Automatique') + (vanneAuto ? ' — ' + vanneAuto : ''), sub: vannesEau.join(', ') || null },
        ...parNom(vannes).map(x => ({ id: x, label: nomDe(x), sub: x, groupe: tr('Vannes') })),
        // Tout `switch.*` : une prise, mais aussi un interrupteur — le groupe le dit.
        ...parNom(prises).map(x => ({ id: x, label: nomDe(x), sub: x, groupe: tr('Prises et interrupteurs') })),
      ]} />
  );
  /* Une famille sans détecteur s'éteint (maquette v3) ; l'alarme et les
   * ouvertures n'ont pas de détecteur à compter. */
  const sansDetecteur = (k, d) => ['alarme', 'portes'].indexOf(k) < 0 && d === tr('Aucun détecteur pour l’instant');
  // « Fermer en cas de fuite » se règle dans la popup de la vanne (I29) : ici, sa valeur.
  const etatVanne = <span style={{ fontSize: tel ? 12 : 13, fontWeight: 800, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{cfg.actions.vanne.actif ? tr('Activé') : tr('Désactivé')}</span>;

  /* ── Le téléphone (maquette v4) ── */
  if (tel) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {refus && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderRadius: 14, background: 'rgba(var(--o-bad-rgb),.10)', border: '1px solid rgba(var(--o-bad-rgb),.45)', color: 'var(--o-bad)', fontSize: 12.5, fontWeight: 700, lineHeight: 1.45 }}>
          <Fi i="triangle-warning" size={15} color="var(--o-bad)" /><span>{refus}</span>
        </div>
      )}
      <CarteTel gap={14}>
        <LigneTel ico="portrait" titre={tr('Téléphone')} desc={cfg.service ? 'notify.' + cfg.service : tr('Aucun téléphone')} mono>{choixService}</LigneTel>
        <LigneTel ico="moon" titre={tr('Heures calmes')} desc={tr('Une notification ordinaire arrive sans sonner. Rien n’est différé.')}>
          <span style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' }}>{cfg.calme.actif ? (cfg.calme.debut || '—') + ' → ' + (cfg.calme.fin || '—') : tr('Coupées')}</span>
        </LigneTel>
        <div style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(var(--o-bad-rgb),.1)', border: '1px solid rgba(var(--o-bad-rgb),.28)' }}>
          <Fi i="shield-exclamation" size={16} color="var(--o-bad)" />
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text1)', lineHeight: 1.5 }}>{tr('{a} : {b}', { a: tr('Critique'), b: tr('fumée, gaz, monoxyde, fuite, alarme. Passe toujours, par-dessus le mode silencieux du téléphone et les heures calmes.') })}</div>
        </div>
      </CarteTel>
      <CarteTel titre={tr('Livraison')}>
        <LignesTel>
          <LigneTel titre={tr('Alertes actives')} desc={cfg.actif ? tr('Poussées sur le téléphone, par l’app compagnon.') : tr('Coupées. La maison réagit quand même aux dangers.')}>
            <span style={pasTel(cfg.actif ? 'ok' : 'warn')}>{cfg.actif ? tr('Actives') : tr('Coupées')}</span>
            <BasculeTel on={!!cfg.actif} cb={() => save({ actif: !cfg.actif })} nom={tr('Activer les alertes')} />
          </LigneTel>
          <LigneTel titre={tr('Heures calmes')} desc={tr('Rien ne sonne pendant ces heures ; seul le danger passe.')}>
            <BasculeTel on={!!cfg.calme.actif} cb={() => save({ calme: { ...cfg.calme, actif: !cfg.calme.actif } })} nom={tr('Heures calmes')} />
          </LigneTel>
          <LigneTel retrait eteint={!cfg.calme.actif} titre={tr('De … à')} desc={tr('La plage peut traverser minuit.')}>
            {heureDebut}<span style={{ color: 'var(--o-text3)' }}>→</span>{heureFin}
          </LigneTel>
          <LigneTel titre={tr('Envoyer un essai')} desc={msg || (cfg.service ? tr('Il part sur {tel}.', { tel: nomTelephone(hass, cfg.service) }) : tr('Choisissez d’abord un téléphone.'))}>
            <button type="button" onClick={test} disabled={!cfg.service} style={{ ...btnTel, opacity: cfg.service ? 1 : .45, cursor: cfg.service ? 'pointer' : 'not-allowed' }}><Fi i="bell" size={11} />{tr('Envoyer')}</button>
          </LigneTel>
        </LignesTel>
      </CarteTel>
      {!cfg.actif && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderRadius: 14, background: 'rgba(var(--o-warn-rgb),.10)', border: '1px solid rgba(var(--o-warn-rgb),.45)', color: 'var(--o-warn)', fontSize: 12.5, fontWeight: 700, lineHeight: 1.45 }}>
          <Fi i="triangle-warning" size={15} color="var(--o-warn)" />
          {/* Couper les alertes de surete ne coupe NI la maison, qui reagit
            * toujours aux dangers (alertes.py, _reagir), NI le telephone : il
            * recoit encore les autres alertes de Loggia, la fin d'un cycle par
            * exemple (regles.prevenir ne lit que le telephone, jamais `actif`). */}
          <span>{tr('Les alertes de sûreté sont coupées : les réglages ci-dessous restent enregistrés, mais ne préviennent de rien. Le téléphone choisi reçoit quand même les autres alertes de Loggia, comme la fin d’un cycle.')}{cfg.actions.actif ? ' ' + tr('La maison réagit quand même aux dangers.') : ''}</span>
        </div>
      )}
      <QuiRecoit hass={hass} cfg={cfg} save={save} services={services} tel actif={!!cfg.actif} />
      <CarteTel titre={tr('Ce qui alerte')} desc={tr('Une famille de capteurs par ligne — reconnue par sa classe, rien à désigner à la main.')}>
        <LignesTel>
          {CATS.map(([k, t, icone, teinte, d]) => (
            <LigneTel key={k} ico={icone} icoCouleur={teinte ? 'var(--o-' + teinte + ')' : 'var(--o-text2)'} titre={t} desc={d} eteint={!cfg.actif || sansDetecteur(k, d)}>
              <BasculeTel on={!!cfg.categories[k]} cb={() => save({ categories: { ...cfg.categories, [k]: !cfg.categories[k] } })} nom={t} />
            </LigneTel>
          ))}
        </LignesTel>
      </CarteTel>
      <CarteTel titre={tr('La maison réagit')} desc={tr('Sur un danger, sans attendre personne — puis tout revient comme avant, sauf la vanne.')}>
        <LignesTel>
          <LigneTel titre={tr('Activer')}><BasculeTel on={!!cfg.actions.actif} cb={() => save({ actions: { ...cfg.actions, actif: !cfg.actions.actif } })} nom={tr('La maison réagit')} /></LigneTel>
          <LigneTel eteint={actOff} ico="bulb" icoCouleur="var(--o-lampe)" titre={tr('Lumières à 100 %')} desc={tr('Fumée, monoxyde, alarme — pas le gaz : un relais qui claque est une étincelle.')}>
            <BasculeTel on={!!cfg.actions.lumieres} cb={() => save({ actions: { ...cfg.actions, lumieres: !cfg.actions.lumieres } })} nom={tr('Lumières à 100 %')} />
          </LigneTel>
          <LigneTel eteint={actOff} ico="blinds-open" icoCouleur="var(--o-purple)" titre={tr('Volets remontés')} desc={tr('Fumée, monoxyde, gaz — les issues, et l’accès des secours.')}>
            <BasculeTel on={!!cfg.actions.volets} cb={() => save({ actions: { ...cfg.actions, volets: !cfg.actions.volets } })} nom={tr('Volets remontés')} />
          </LigneTel>
          <LigneTel eteint={actOff} ico="water" icoCouleur="var(--o-cyan)" titre={tr('Fermer en cas de fuite')} desc={tr('Se règle dans la popup de la vanne d’eau.')}>{etatVanne}</LigneTel>
          <LigneTel retrait eteint={actOff || !cfg.actions.vanne.actif} titre={tr('Quelle vanne')} desc={tr('Vide : toutes les vannes d’eau que Home Assistant connaît. Une prise commandée vaut aussi.')}>{choixVanne}</LigneTel>
        </LignesTel>
      </CarteTel>
    </div>
  );

  /* ── L'ordinateur et la tablette (maquette v3) ── */
  return (
    <>
      {/* L'en-tête de la section, avec sa bascule à droite : « Actives ». */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: `calc(${tailleTitre}px * var(--o-texte, 1))`, fontWeight: 500 }}>{tr('Alertes')}</h1>
          <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 4 }}>{cfg.actif ? tr('Ce que la maison vous dit, et à qui. La sûreté passe toujours.') : tr('Coupées. La maison réagit quand même aux dangers.')}</div>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: cfg.actif ? 'var(--o-ok)' : 'var(--o-warn)' }}>{cfg.actif ? tr('Actives') : tr('Coupées')}</span>
          <Tgl on={!!cfg.actif} cb={() => save({ actif: !cfg.actif })} label={tr('Activer les alertes')} />
        </span>
      </div>
      {refus && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderRadius: 14, background: 'rgba(var(--o-bad-rgb),.10)', border: '1px solid rgba(var(--o-bad-rgb),.45)', color: 'var(--o-bad)', fontSize: 12.5, fontWeight: 700, lineHeight: 1.45 }}>
          <Fi i="triangle-warning" size={15} color="var(--o-bad)" /><span>{refus}</span>
        </div>
      )}

      {!cfg.actif && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderRadius: 14, background: 'rgba(var(--o-warn-rgb),.10)', border: '1px solid rgba(var(--o-warn-rgb),.45)', color: 'var(--o-warn)', fontSize: 12.5, fontWeight: 700, lineHeight: 1.45 }}>
          <Fi i="triangle-warning" size={15} color="var(--o-warn)" />
          {/* Couper les alertes de surete ne coupe NI la maison, qui reagit
            * toujours aux dangers (alertes.py, _reagir), NI le telephone : il
            * recoit encore les autres alertes de Loggia, la fin d'un cycle par
            * exemple (regles.prevenir ne lit que le telephone, jamais `actif`). */}
          <span>{tr('Les alertes de sûreté sont coupées : les réglages ci-dessous restent enregistrés, mais ne préviennent de rien. Le téléphone choisi reçoit quand même les autres alertes de Loggia, comme la fin d’un cycle.')}{cfg.actions.actif ? ' ' + tr('La maison réagit quand même aux dangers.') : ''}</span>
        </div>
      )}

      {/* Qui reçoit quoi (ADR 0301) : les téléphones de chaque personne, découverts ; le téléphone de secours n'est plus qu'un repli. */}
      <QuiRecoit hass={hass} cfg={cfg} save={save} services={services} actif={!!cfg.actif} />

      {/* Entre ces heures, les notifications arrivent en silence — on les lit
        * au réveil. Une seule chose passe quand même, et par-dessus le mode
        * silencieux du téléphone : le danger. Fumée, gaz, CO, fuite, alarme. */}
      <Panneau titre={tr('Le calme')} desc={tr('Pendant ces heures, rien ne sonne ; seul le danger passe.')}
        droite={<Tgl on={!!cfg.calme.actif} cb={() => save({ calme: { ...cfg.calme, actif: !cfg.calme.actif } })} label={tr('Heures calmes')} />}>
        {cfg.calme.actif && (<>
          {frise}
          <Ligne titre={tr('De')} desc={tr('La plage peut traverser minuit.')}>
            {heureDebut}
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text3)' }}>{tr('à')}</span>
            {heureFin}
          </Ligne>
        </>)}
      </Panneau>

      <Panneau titre={tr('Ce qui alerte')} desc={tr('Reconnu par sa classe dans Home Assistant : rien à désigner.')}
        pied={<span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Anti-rafale : {n} min par capteur, sauf l’alarme.', { n: cfg.cooldown_min || 5 })}</span>}>
        <div style={{ opacity: cfg.actif ? 1 : .5, transition: 'opacity .2s' }}>
        {CATS.map(([k, t, icone, teinte, d]) => (
          <Ligne key={k} ico={icone} icoFond={teinte ? 'rgba(var(--o-' + teinte + '-rgb),.12)' : 'var(--o-s1)'} icoCouleur={teinte ? 'var(--o-' + teinte + ')' : 'var(--o-text2)'}
            titre={t} desc={REAGISSENT.indexOf(k) >= 0 ? d + ' · ' + tr('Décochée : ni alerte, ni réaction de la maison.') : d} eteint={sansDetecteur(k, d)}>
            {/* Décocher coupe AUSSI la réaction de la maison (audit du 19/10, M22). */}
            <Tgl on={!!cfg.categories[k]} cb={() => save({ categories: { ...cfg.categories, [k]: !cfg.categories[k] } })} label={t} />
          </Ligne>
        ))}
        </div>
      </Panneau>

      {/* La moitié « action » de §18 : sur un danger, la maison réagit
        * d'elle-même — en tête de l'échelle, tenu tant que le danger dure,
        * puis rendu à l'état d'avant. La vanne, elle, reste coupée : une
        * fuite s'inspecte avant de rouvrir (ADR 0022). */}
      <Panneau titre={tr('Sur un danger, la maison agit')} desc={tr('Sans attendre personne. Puis tout revient comme avant, sauf la vanne.')}
        droite={<Tgl on={!!cfg.actions.actif} cb={() => save({ actions: { ...cfg.actions, actif: !cfg.actions.actif } })} label={tr('La maison réagit')} />}>
        <Ligne eteint={actOff} ico="bulb" icoFond="rgba(var(--o-lampe-rgb),.16)" icoCouleur="var(--o-lampe)" titre={tr('Toutes les lumières à 100 %')} desc={tr('Fumée, monoxyde, alarme. Pas le gaz : un relais qui claque est une étincelle.')}>
          <Tgl on={!!cfg.actions.lumieres} cb={() => save({ actions: { ...cfg.actions, lumieres: !cfg.actions.lumieres } })} label={tr('Lumières à 100 %')} />
        </Ligne>
        <Ligne eteint={actOff} ico="blinds-open" icoFond="rgba(var(--o-purple-rgb),.16)" icoCouleur="var(--o-purple)" titre={tr('Les volets remontent')} desc={tr('Pour les issues, et l’accès des secours.')}>
          <Tgl on={!!cfg.actions.volets} cb={() => save({ actions: { ...cfg.actions, volets: !cfg.actions.volets } })} label={tr('Volets remontés')} />
        </Ligne>
        {/* « Fermer en cas de fuite » (chantier IoT, étape 3 ; I29) : la bascule a DÉMÉNAGÉ dans la popup de la vanne — un réglage ne se
          * double pas. Ici, la vanne choisie et la valeur de la bascule. */}
        <Ligne eteint={actOff} ico="water" icoFond="rgba(var(--o-cyan-rgb),.16)" icoCouleur="var(--o-cyan)" titre={tr('L’eau se coupe sur une fuite')} desc={tr('Elle se rouvre à la main, jamais seule. La bascule vit dans la popup de la vanne.')}>
          {choixVanne}{etatVanne}
        </Ligne>
      </Panneau>

      <Panneau titre={tr('Où ça part')}>
        <Ligne ico="mobile-button" titre={tr('Téléphone de secours')} desc={tr('Reçoit la sûreté, et ce qu’aucun téléphone n’a pu recevoir.')} style={{ borderTop: 'none' }}>{choixService}</Ligne>
        <Ligne ico="bell" titre={tr('Un essai')} desc={msg || tr('Sur le téléphone de secours, pour vérifier qu’il reçoit bien.')}>
          <button onClick={test} disabled={!cfg.service} style={{ ...btnSecondaire, opacity: cfg.service ? 1 : .45, cursor: cfg.service ? 'pointer' : 'not-allowed' }}>{tr('Envoyer')}</button>
        </Ligne>
      </Panneau>
    </>
  );
}


/* ════════════ VUES PERSONNALISÉES : cartes génériques par domaine + éditeur (admin) ════════════ */

// Éditeur du code administrateur : défini par `loggia/pin/definir`, jamais lu (18/09).
// Aperçu vivant du thème (Paramètres → Apparence) : il rend avec les CSS vars COURANTES,
// donc il suit chaque clic de thème/mode sans plomberie. Valeurs réelles si hass est là.
/* L'aperçu de l'Apparence, en bande au-dessus des réglages (maquette v3,
 * 02/11) : la salutation, l'accent, et trois cartes de la maison. La première
 * porte le lavis d'une carte allumée, pour que « Teinte d'état » se voie.
 * Collante sur l'ordinateur seulement (`collante`) : sur une tablette, elle
 * mangerait la moitié de l'écran en défilant. */
/* Les couleurs d'accent et les deux collections de thèmes : une seule liste,
 * pour l'ordinateur et le téléphone. */
const ACCENTS = [['', 'Du thème'], ['#2dd4bf', 'Cyan'], ['#a78bfa', 'Violet'], ['#f5a524', 'Ambre'], ['#f87171', 'Rouge']];
const NATIFS = ['', 'projekt', 'saphir', 'acier', 'givre', 'atrium', 'ios', 'google', 'neumorphix'];
const COMMU = ['frosted', 'onedark', 'dracula', 'github', 'tokyo', 'nightowl', 'plum', 'material', 'lavande'];

function ParPreview({ themeMode, loggiaTheme = '', hass, userName = '', look = LOOK_DEF, collante = false, cartesSeules = false }) {
  // Les rayons suivent le reglage « Arrondi », pour montrer ce que donnent Net / Doux / Rond.
  const RAD = look.radius === 'net' ? [6, 4] : look.radius === 'rond' ? [24, 18] : [18, 13];
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const iv = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(iv); }, []);
  const S = (hass && hass.states) || {};
  const rooms = normRooms(cfgVal('loggia_rooms', null));
  const t0 = rooms[0] && rooms[0].haid && rooms[0].haid.temp ? S[rooms[0].haid.temp] : null;
  const uTPrev = uniteTemp(t0 ? t0.attributes : null, hass);
  const temp = t0 && !isNaN(parseFloat(t0.state)) ? parseFloat(t0.state).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' °' + uTPrev : '—';
  // Le compte d'Objets › Lumières (L11), celui de l'Accueil : la LED d'une borne Wi-Fi n'est pas une lumière de la maison.
  const lightsOn = lumieresDe(S, ctxLumieres()).filter(id => S[id] && S[id].state === 'on').length;
  const en = { ...enHaids(), ...(cfgVal('loggia_energyHaids', null) || {}) };
  // En watts, quelle que soit l'unité du compteur (audit du 03/10) : 2,75 kW
  // donnait « 3 W » dans l'aperçu. `null` sans valeur : « — », pas « 0 W ».
  const cw = en.consoNow && S[en.consoNow] ? wattsDe(S[en.consoNow]) : null;
  // Arrondi AVANT l'unité (05/10), comme l'arc solaire : 994,6 W s'écrivait
  // « 995 W » quand 995 donne « 1,0 kW » — `cw` arrive brut de `wattsDe`.
  const conso = cw != null ? (Math.round(Math.abs(cw)) >= 995 ? (Math.abs(cw) / 1000).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kW' : Math.round(Math.abs(cw)) + ' W') : '—';
  const h = now.getHours();
  // Les memes mots que l'Accueil, traduits — l'apercu montrait « Bonjour,
  // Administrateur » en francais au milieu de l'italien (retour du 23/09).
  const greet = h < 6 ? tr('Bonne nuit') : h < 12 ? tr('Bonjour') : h < 18 ? tr('Bon après-midi') : tr('Bonsoir');
  /* La ligne sous l'aperçu, dans la langue de l'écran (audit du 03/10) :
   * « Thème « … » · mode foncé. » était écrit en clair autour de deux
   * expressions, là où le filet des nœuds de texte ne regarde pas. Une phrase
   * par mode, pour que chaque langue accorde son adjectif. */
  const nomTheme = (PRESET_META().find(x => x.id === (loggiaTheme || '')) || PRESET_META()[0]).name;
  const ligneTheme = themeMode === 'light'
    ? tr('Thème « {nom} » · mode clair.', { nom: nomTheme })
    : tr('Thème « {nom} » · mode foncé.', { nom: nomTheme });
  // Le lavis d'une carte allumee, a la force choisie dans « Teinte d'état ».
  const force = { sans: 0, discrete: .1, douce: .2, pleine: .32 }[look.tint || 'douce'] ?? .2;
  const lave = (rgb) => force ? 'linear-gradient(180deg,rgba(var(' + rgb + '),' + force + '),rgba(var(' + rgb + '),' + (force / 4) + ') 72%),linear-gradient(180deg,var(--o-surfA),var(--o-surfB))' : 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))';
  const carte = (ico, nom, etat, c, rgb, allumee) => (
    <div key={nom} style={{ flex: '0 1 150px', minWidth: cartesSeules ? 0 : 118, padding: cartesSeules ? 12 : '11px 12px', borderRadius: cartesSeules ? 16 : RAD[1], background: allumee ? lave(rgb) : 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid ' + (allumee && force ? 'rgba(var(' + rgb + '),.26)' : 'var(--o-bd2)'), boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', display: 'flex', flexDirection: cartesSeules ? 'row' : 'column', alignItems: cartesSeules ? 'center' : 'stretch', gap: cartesSeules ? 10 : 12, minHeight: 0 }}>
      <span style={{ width: 28, height: 28, borderRadius: 9, background: 'rgba(var(' + rgb + '),.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i={ico} size={13} color={c} /></span>
      <span style={{ lineHeight: 1.25, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</span>
        <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--o-text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{etat}</span>
      </span>
    </div>
  );
  if (cartesSeules) return (
    <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,200px))', gap: 10, marginTop: 12 }}>
      {carte('bulb', tr('Lumières'), trN(lightsOn, '{n} allumée', '{n} allumées'), 'var(--o-lampe)', '--o-lampe-rgb', true)}
      {carte('temperature-high', rooms[0] ? rooms[0].room : tr('Pièce'), temp, 'var(--o-orange)', '--o-orange-rgb', false)}
    </div>
  );
  return (
    <div className="o-par-preview" role="img" aria-label={tr('Aperçu') + ' · ' + ligneTheme}
      style={{ position: collante ? 'sticky' : 'relative', top: collante ? 'calc(var(--o-safe-top,0px) + 12px)' : 'auto', zIndex: collante ? 6 : 'auto', overflow: 'hidden', borderRadius: RAD[0], background: 'var(--o-bg)', border: 'var(--o-bw,1px) solid var(--o-bd1)', boxShadow: '0 18px 40px -24px rgba(0,0,0,.6)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'var(--o-bggrad)', opacity: .55, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 0 }}>
        <div style={{ ...CAPITALES, fontSize: 10, color: 'var(--o-text2)' }}>{tr('Aperçu')} · {nomTheme} · {themeMode === 'light' ? tr('Clair') : themeMode === 'auto' ? tr('Auto') : tr('Foncé')}</div>
        <div style={{ fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontWeight: 500, fontSize: 23, lineHeight: 1.15, marginTop: 4 }}>{greet}{userName ? ', ' + nomProfil(userName) : ''}</div>
        <div style={{ display: 'inline-flex', marginTop: 10, padding: '7px 12px', borderRadius: RAD[1] / 1.6, background: 'var(--o-accent-fond)', color: '#fff', fontSize: 11.5, fontWeight: 800 }}>{tr('Accent')}</div>
      </div>
      {carte('bulb', tr('Lumières'), trN(lightsOn, '{n} allumée', '{n} allumées'), 'var(--o-lampe)', '--o-lampe-rgb', true)}
      {carte('temperature-high', rooms[0] ? rooms[0].room : tr('Pièce'), temp, 'var(--o-orange)', '--o-orange-rgb', false)}
      {carte('bolt', tr('Consommation'), conso, 'var(--o-ok)', '--o-ok-rgb', false)}
    </div>
  );
}

/**
 * Propose un fichier au telechargement.
 *
 * Le presse-papier ne suffit pas pour une configuration complete : elle peut
 * peser plusieurs dizaines de kilo-octets, et surtout on veut pouvoir la garder.
 */
function telechargerConfig(texte, base) {
  try {
    const jour = new Date().toISOString().slice(0, 10);
    const blob = new Blob([texte], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = base + '-' + jour + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch { return false; }
}

/* Un fichier qui n'a pas pu etre propose au telechargement n'est pas une
 * sauvegarde : l'operation qui l'attendait s'arrete. */
const PAS_DE_FICHIER = 'telechargement';

function ResetLoggiaBtn() {
  const [arm, setArm] = useState(false);
  useEffect(() => { if (!arm) return undefined; const t = setTimeout(() => setArm(false), 4000); return () => clearTimeout(t); }, [arm]);
  // 'sauvegarde', puis 'raz' : le bouton dit ce qui se passe VRAIMENT.
  const [etape, setEtape] = useState(null);
  const enCours = etape != null;
  /**
   * Remise a zero REELLE : la configuration du serveur comprise.
   *
   * L'ancienne version ne vidait que le stockage de ce navigateur. La
   * configuration etant partagee entre appareils depuis, tout redescendait du
   * serveur au rechargement : le bouton promettait une remise a zero qu'il ne
   * faisait pas.
   *
   * Une sauvegarde part AVANT, automatiquement. L'operation ne se rattrape pas
   * autrement, et personne ne pense a exporter avant d'effacer.
   */
  const doReset = async () => {
    setEtape('sauvegarde');
    try {
      const j = await exportConfigComplete();
      if (!telechargerConfig(j, 'loggia-avant-remise-a-zero')) throw new Error(PAS_DE_FICHIER);
    } catch {
      // Sans sauvegarde, pas de remise a zero : l'operation ne se rattrape
      // pas, et un fichier vide aurait l'air d'une sauvegarde (audit 18/09).
      setEtape(null); setArm(false);
      alerter({ titre: tr('Réinitialiser Loggia'), texte: tr('Sauvegarde impossible : la remise à zéro est annulée. Réessayez quand Home Assistant répond.') });
      return;
    }
    setEtape('raz');
    try { await resetLoggiaComplet(); } catch {
      setEtape(null); setArm(false);
      alerter({ titre: tr('Réinitialiser Loggia'), texte: tr('Remise à zéro incomplète : Home Assistant a refusé ou n’a pas répondu. La configuration de la maison est inchangée.') });
      return;
    }
    window.location.reload();
  };
  return <button disabled={enCours} onClick={() => { if (arm) doReset(); else setArm(true); }} style={{ ...btnDanger, flexShrink: 0, background: arm ? 'var(--o-bad)' : 'transparent', color: arm ? '#fff' : 'var(--o-bad)', transition: 'background .2s, color .2s' }}>{etape === 'raz' ? tr('Remise à zéro…') : enCours ? tr('Sauvegarde…') : arm ? tr('Confirmer ?') : tr('Remettre à zéro…')}</button>;
}

/* Ce qu'un echec veut dire, dans la langue de l'ecran.
 *
 * Un refus de Home Assistant porte un code et son message ; une connexion
 * perdue, le message de la bibliotheque (`{ error: { code, message } }`).
 * Tout le reste — un fichier non propose, une page sans composant, la
 * demonstration — se dit par une phrase traduite : jamais le texte interne
 * d'une `Error`, souvent ecrit en francais, qui s'affichait tel quel au
 * visiteur anglais de la demonstration (relecture du lot 1, audit du 03/10). */
const motifEchec = (err) => {
  if (err && err.message === PAS_DE_FICHIER) return tr('le fichier n’a pas pu être proposé au téléchargement.');
  /* Un refus PRÉVISIBLE du composant — trop volumineux, une clé de la maison,
   * le code administrateur — se dit par son code (refus.js, audit du 03/10) :
   * « valeur trop volumineuse pour la cle … » sortait en français sans
   * accents. Le motif reste le dernier recours. */
  if (err && typeof err.code === 'string' && err.message) return texteRefus(err) || err.message;
  if (err && err.error && err.error.message) return err.error.message;
  return tr('Home Assistant n’a pas répondu.');
};

const LECTURE_IMPOSSIBLE = {
  illisible: () => tr('ce fichier n’est pas un JSON lisible. Rien n’a été modifié.'),
  pas_loggia: () => tr('ce fichier n’est pas une configuration Loggia. Rien n’a été modifié.'),
  vide: () => tr('ce fichier ne contient aucun réglage à restaurer. Rien n’a été modifié.'),
};

/**
 * Importer une configuration : lire, montrer, sauvegarder, puis remplacer.
 *
 * L'import partait des que le fichier etait choisi — pas de confirmation, pas
 * de sauvegarde, alors qu'il remplace la configuration de TOUTE la maison. La
 * remise a zero, elle, faisait deja les deux (audit 18/09). Le geste est
 * maintenant le meme (audit du 03/10) :
 *
 * 1. le fichier est LU sans rien ecrire, et refuse s'il n'est pas une
 *    configuration Loggia ;
 * 2. son resume s'affiche — date, pieces, profils — et le bouton passe au
 *    rouge : un second appui confirme, sinon tout retombe au bout de 15 s ;
 * 3. la configuration actuelle est telechargee d'abord, et sans elle l'import
 *    n'a pas lieu ;
 * 4. puis UN SEUL envoi au composant, qui accepte tout ou rien.
 */
function ImportConfigBtn() {
  const [lu, setLu] = useState(null);
  // 'sauvegarde', puis 'import' : le bouton dit ce qui se passe VRAIMENT.
  const [etape, setEtape] = useState(null);
  const enCours = etape != null;
  const fichier = useRef(null);
  useEffect(() => { if (!lu || enCours) return undefined; const t = setTimeout(() => setLu(null), 15000); return () => clearTimeout(t); }, [lu, enCours]);

  const choisir = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { setLu(lireConfigImport(await f.text())); } catch (err) {
      setLu(null);
      const motif = err && LECTURE_IMPOSSIBLE[err.code];
      alerter({ titre: tr('Import'), texte: tr('Import impossible : ') + (motif ? motif() : motifEchec(err)) });
    }
  };

  const importer = async () => {
    setEtape('sauvegarde');
    try {
      const j = await exportConfigComplete();
      if (!telechargerConfig(j, 'loggia-avant-import')) throw new Error(PAS_DE_FICHIER);
    } catch {
      setEtape(null); setLu(null);
      alerter({ titre: tr('Import'), texte: tr('Sauvegarde impossible : l’import est annulé. Réessayez quand Home Assistant répond.') });
      return;
    }
    setEtape('import');
    try { await importConfigComplete(lu); } catch (err) {
      setEtape(null); setLu(null);
      // Un refus de Home Assistant porte un code : rien n'a ete ecrit. Une
      // connexion perdue n'en porte pas — l'envoi a pu passer ou non.
      alerter({ titre: tr('Import'), texte: err && typeof err.code === 'string'
        ? tr('Import refusé par Home Assistant : {x}. La configuration de la maison n’a pas été touchée.', { x: motifEchec(err) })
        : tr('Import interrompu : {x}. Rechargez la page pour voir la configuration en place.', { x: motifEchec(err) }) });
      return;
    }
    window.location.reload();
  };

  const r = lu && lu.resume;
  const date = r && r.exporteLe
    ? tr('Fichier du {d}', { d: new Date(r.exporteLe).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }) })
    : tr('Fichier sans date');
  return (
    <>
      {r && (
        <span role="status" style={{ flex: '1 1 100%', fontSize: 12, fontWeight: 700, color: 'var(--o-text1)' }}>
          {date} · {tr('Pièces : {n}', { n: r.pieces })} · {tr('Profils : {n}', { n: r.profils })} — {tr('la configuration actuelle sera d’abord sauvegardée.')}
        </span>
      )}
      <input ref={fichier} aria-label={tr('Importer un fichier de configuration')} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={choisir} />
      <button disabled={enCours} onClick={() => { if (lu) importer(); else if (fichier.current) fichier.current.click(); }}
        style={lu ? { ...btnDanger, background: 'var(--o-bad)', color: '#fff' } : btnSecondaire}>
        {etape === 'import' ? tr('Import…') : enCours ? tr('Sauvegarde…') : lu ? tr('Remplacer la configuration ?') : tr('Importer')}
      </button>
    </>
  );
}

/* Le pas à pas d'une marge, au téléphone (maquette v4). */
const PasTel = ({ px, auto, onStep, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 3, borderRadius: 10, background: 'var(--o-s1)' }}>
    <button type="button" onClick={() => onStep(-2)} aria-label={tr('Réduire') + ' ' + label} style={{ width: 28, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--o-text1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i="minus-small" size={14} /></button>
    <span style={{ minWidth: 58, textAlign: 'center', fontSize: 12, fontWeight: 800, color: auto ? 'var(--o-text2)' : 'var(--o-text)' }}>{auto ? tr('Auto') : Math.round(px) + ' px'}</span>
    <button type="button" onClick={() => onStep(2)} aria-label={tr('Augmenter') + ' ' + label} style={{ width: 28, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--o-text1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i="plus-small" size={14} /></button>
  </div>
);

/* « Ajouter un profil » au téléphone (maquette v4) : un prénom, et c'est fait.
 * Le profil arrive en Famille, sans autorisation ; il s'ajuste ensuite dans
 * son éditeur, comme tout profil. */
function AjoutProfilTel({ onAjouter }) {
  const [nom, setNom] = useState('');
  const n = nom.trim();
  return (
    <CarteTel chip="user" chipFond="rgba(var(--o-accent-rgb),.16)" chipCouleur="var(--o-accent)" titre={tr('Ajouter un profil')}
      desc={tr('L’utilisateur Home Assistant connecté est reconnu automatiquement ; un profil sans compte sert aux écrans partagés.')}>
      <LignesTel>
        <LigneTel titre={tr('Prénom')}>
          <input aria-label={tr('Prénom')} placeholder={tr('Prénom')} value={nom} maxLength={30} onChange={e => setNom(e.target.value)}
            style={{ width: 170, maxWidth: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 10, border: '1px solid var(--o-bd1)', background: 'var(--o-s2)', color: 'var(--o-text)', font: 'inherit', fontSize: 12, fontWeight: 700 }} />
          <button type="button" disabled={!n} onClick={() => { onAjouter(n); setNom(''); }} style={{ ...btnTel, background: 'var(--o-accent-fond)', color: '#fff', opacity: n ? 1 : .45, cursor: n ? 'pointer' : 'not-allowed' }}>{tr('Ajouter')}</button>
        </LigneTel>
      </LignesTel>
    </CarteTel>
  );
}

/* Le panneau « Accès » des Profils (maquette v3, 02/11) : ce qui protège les
 * réglages de la maison, en trois lignes. Le code se règle dans une feuille.
 *
 * Le code suit la MAISON (03/09) et, depuis le 18/09, il est HACHÉ par le
 * composant : l'écran ne le lit jamais — il sait seulement s'il est défini
 * (`loggia_admin_pin_defini`) — et ne l'écrit que par sa commande, réservée
 * aux administrateurs Home Assistant. Un seul code, partout. */
function AdminPinEditor({ hass, admin = false, users = [], tel = false }) {
  const [defini, setDefini] = useState(() => cfgVal('loggia_admin_pin_defini', false) === true);
  const [ouvert, setOuvert] = useState(false);
  const [np, setNp] = useState('');
  const [cf, setCf] = useState('');
  const [msg, setMsg] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const dg = v => v.replace(/\D/g, '').slice(0, 8);
  const pret = np.length >= 4 && np === cf;
  const fermer = () => { setOuvert(false); setNp(''); setCf(''); setMsg(null); };
  const save = async () => {
    if (np.length < 4) { setMsg({ ok: false, t: tr('Le code fait de 4 à 8 chiffres.') }); return; }
    if (np !== cf) { setMsg({ ok: false, t: tr('Les deux codes ne correspondent pas.') }); return; }
    const h = hass && typeof hass.callWS === 'function' ? hass : null;
    if (!h) { setMsg({ ok: false, t: tr('Home Assistant n’est pas joignable.') }); return; }
    setEnCours(true);
    try {
      await h.callWS({ type: 'loggia/pin/definir', pin: np });
      setDefini(true); setNp(''); setCf(''); setOuvert(false); setMsg({ ok: true, t: tr('Code administrateur mis à jour — le même sur tous les appareils.') });
    } catch (e) {
      setMsg({ ok: false, t: e && e.code === 'unauthorized' ? tr('Réservé aux administrateurs.') : ((e && (e.message || e.code)) || tr('Enregistrement impossible.')) });
    } finally { setEnCours(false); }
  };
  const inp = { width: 170, maxWidth: '100%', padding: '9px 12px', borderRadius: 10, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 15, fontWeight: 700, letterSpacing: '.3em', textAlign: 'center', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' };
  const enfants = users.filter(u => u && u.role === 'Enfant');
  const comptes = users.filter(u => u && u.haId).length;
  const compte = { fontSize: 13, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' };
  const statut = <div role="status" style={msg ? { fontSize: 12, fontWeight: 700, color: msg.ok ? 'var(--o-ok)' : 'var(--o-bad)', padding: tel ? 0 : '0 22px 18px' } : undefined}>{msg ? msg.t : ''}</div>;
  return (
    <>
      {tel ? (
        /* Le téléphone (maquette v4) : une carte, le bouton dessous. */
        <CarteTel chip="key" chipFond={defini ? 'rgba(var(--o-ok-rgb),.16)' : 'rgba(var(--o-warn-rgb),.16)'} chipCouleur={defini ? 'var(--o-ok)' : 'var(--o-warn)'}
          titre={tr('Code administrateur')} desc={defini ? tr('Défini. Haché par l’intégration, jamais renvoyé à un écran.') : tr('Pas encore défini : n’importe quel écran peut passer sur un profil administrateur.')}>
          <div><button type="button" disabled={!admin} onClick={() => setOuvert(true)} style={{ ...btnTel, padding: '9px 14px', fontSize: 12, opacity: admin ? 1 : .45, cursor: admin ? 'pointer' : 'not-allowed' }}>{defini ? tr('Changer le code') : tr('Définir le code')}</button></div>
          {!ouvert && statut}
        </CarteTel>
      ) : (
      <Panneau titre={tr('Accès')} desc={tr('Ce qui protège les réglages de la maison.')}>
        <Ligne ico="key" icoFond={defini ? 'rgba(var(--o-ok-rgb),.16)' : 'rgba(var(--o-warn-rgb),.16)'} icoCouleur={defini ? 'var(--o-ok)' : 'var(--o-warn)'}
          titre={tr('Code administrateur')}
          desc={defini ? tr('Défini. Demandé pour passer un écran sur un profil administrateur ; haché par le composant, le même partout.') : tr('Pas encore défini : n’importe quel écran peut passer sur un profil administrateur.')}>
          <button type="button" disabled={!admin} onClick={() => setOuvert(true)}
            style={{ ...(defini ? btnSecondaire : btnPrimaire), opacity: admin ? 1 : .45, cursor: admin ? 'pointer' : 'not-allowed' }}>{defini ? tr('Changer') : tr('Définir le code')}</button>
        </Ligne>
        <Ligne ico="child-head" icoFond="rgba(var(--o-cyan-rgb),.16)" icoCouleur="var(--o-cyan)" titre={tr('Mode enfant')}
          desc={(enfants.length ? enfants.map(u => u.name).join(', ') + ' · ' : '') + tr('L’écran est tenu par le serveur ; le code de la maison rouvre les réglages du parent.')}>
          <span style={compte}>{trN(enfants.length, '{n} profil', '{n} profils')}</span>
        </Ligne>
        <Ligne ico="user" titre={tr('Compte Home Assistant')} desc={tr('Chaque compte retrouve son profil tout seul. Ici, on ne corrige que les noms et les rôles.')}>
          <span style={compte}>{trN(comptes, '{n} compte', '{n} comptes')}</span>
        </Ligne>
        {/* Le refus se DIT (audit du 03/10, règle de l'ADR 0107) : monté avec son
          * texte, ce `status` ne s'annonçait pas. La région reste montée ;
          * vide, elle ne prend aucune place, et c'est son texte qui change. Un
          * seul nœud à la fois : rien ne se lit deux fois. */}
        {!ouvert && statut}
      </Panneau>
      )}
      {ouvert && (
        <BottomSheet onClose={fermer} title={defini ? tr('Changer le code') : tr('Définir le code')}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', lineHeight: 1.45, marginBottom: 6 }}>{tr('De 4 à 8 chiffres. Haché par le composant, jamais affiché.')}</div>
          <Ligne titre={tr('Le code')} style={{ padding: '14px 0', borderTop: 'none' }}>
            <input aria-label={tr('Nouveau code')} value={np} onChange={e => { setNp(dg(e.target.value)); setMsg(null); }} inputMode="numeric" placeholder="••••" type="password" autoComplete="new-password" style={inp} />
          </Ligne>
          <Ligne titre={tr('Encore une fois')} desc={cf && cf !== np ? tr('Ce n’est pas le même.') : null} descCouleur="var(--o-warn)" style={{ padding: '14px 0' }}>
            <input aria-label={tr('Confirmer le nouveau code')} value={cf} onChange={e => { setCf(dg(e.target.value)); setMsg(null); }} inputMode="numeric" placeholder="••••" type="password" autoComplete="new-password" style={inp} />
          </Ligne>
          <div role="status" style={msg ? { padding: '4px 0 10px', fontSize: 12, fontWeight: 700, color: msg.ok ? 'var(--o-ok)' : 'var(--o-bad)' } : undefined}>{msg ? msg.t : ''}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={save} disabled={enCours || !pret} style={{ ...btnPrimaire, opacity: enCours || !pret ? .5 : 1, cursor: enCours || !pret ? 'not-allowed' : 'pointer' }}>{tr('Enregistrer')}</button>
          </div>
        </BottomSheet>
      )}
    </>
  );
}



// Modale ajout / modification d'un utilisateur (admin uniquement).
function UserEditor({ user, onSave, onDelete, onClose, customViews = [] }) {
  const [name, setName] = useState(user ? user.name : '');
  const [role, setRole] = useState(user ? user.role : 'Famille');
  const [c, setC] = useState(user ? (user.c || USER_COLORS[0]) : USER_COLORS[0]);
  /* Vues autorisées : rien de coché = TOUTES (le défaut, et le comportement
   * historique). La restriction ne concerne que les non-admins — un admin voit
   * tout, c'est son rôle. */
  const [vues, setVues] = useState(() => (user && Array.isArray(user.vues) ? user.vues : []));
  /* Autorisations : rien de coché = AUCUNE, l'inverse des vues juste
   * au-dessus. Une restriction se lève par défaut, un pouvoir se donne. */
  const [droits, setDroits] = useState(() => (user && Array.isArray(user.droits) ? user.droits : []));
  const VUES_CHOIX = [
    ['pieces', tr('Pièces')], ['scenes', tr('Scénarios')], ['objets', tr('Objets')],
    ['energie', tr('Énergie')], ['securite', tr('Sécurité')], ['systeme', tr('Système')],
    ...customViews.map(cv => ['cv:' + cv.id, cv.name]),
  ];
  const basculeVue = (vid) => setVues(v => v.indexOf(vid) >= 0 ? v.filter(x => x !== vid) : [...v, vid]);
  const basculeDroit = (did) => setDroits(d => d.indexOf(did) >= 0 ? d.filter(x => x !== did) : [...d, did]);
  /* Les cases cochées dont le COMPOSANT garde l'écriture (DROITS_ADMIN_HA,
   * state.js) : l'avertissement, plus bas, les nomme. */
  const sousAdminHA = DROITS.filter(([did]) => DROITS_ADMIN_HA.indexOf(did) >= 0 && droits.indexOf(did) >= 0).map(([, lb]) => tr(lb));
  const inp = { width: '100%', padding: '12px 14px', borderRadius: 14, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 14, fontWeight: 600, boxSizing: 'border-box' };
  const save = () => { const n = name.trim(); if (!n) return; onSave({ name: n, role, c, sub: role + ' · ' + n.toLowerCase().replace(/\s+/g, '.'), vues: role === 'Admin' ? [] : vues, droits: role === 'Admin' ? [] : droits }); };
  const roleBtn = (on) => ({ flex: 1, padding: 11, borderRadius: 10, border: '1px solid ' + (on ? 'transparent' : 'var(--o-bd1)'), background: on ? 'var(--o-accent-fond)' : 'var(--o-s2)', color: on ? '#fff' : 'var(--o-text1)', fontWeight: 700, fontSize: 13, cursor: 'pointer' });
  /* Le nom de chaque pastille, dans l'ordre de USER_COLORS (ui.jsx) — lot 13
   * de l'audit du 03/10. Les huit s'annonçaient toutes « Couleur du profil »,
   * et seule une bague montrait laquelle était prise : un lecteur d'écran
   * entendait huit fois la même chose. Le groupe porte « Couleur du profil »,
   * chaque pastille sa couleur, `aria-pressed` celle qui est prise. Les noms
   * des teintes d'accent quand la famille est la même (Turquoise, Violet,
   * Ambre, Rouge) ; seul « Orange » est nouveau. */
  const nomsCouleurs = [tr('Bleu'), tr('Vert'), tr('Violet'), tr('Orange'), tr('Rose'), tr('Turquoise'), tr('Ambre'), tr('Rouge')];
  return (
    /* Une feuille, plus une modale faite main (lot 13 de l'audit du 03/10).
     * Le voile d'avant (`position: fixed`, fermé à la souris) n'était ni un
     * dialogue ni nommé ; Échap ne le fermait pas, et Tab filait derrière lui
     * vers la page restée vivante. `BottomSheet` apporte le rôle, le nom (sa
     * ligne de titre), Échap, le fond inerte, et rend le focus au bouton qui
     * l'a ouverte — après « Supprimer », parti avec sa ligne, au titre de la
     * section (`rendreFocus`, relecture du lot 13). Sa croix remplace
     * « Annuler », qui ne faisait que fermer.
     * L'initiale reste à côté du titre, tue : la feuille s'appelle « Modifier
     * l'utilisateur », pas « G Modifier l'utilisateur ». */
    <BottomSheet onClose={onClose} title={(
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 19, color: '#fff', background: `linear-gradient(135deg,${c},rgba(${cl_hexRgb(c)},.6))` }}>{(name.trim()[0] || '?').toUpperCase()}</span>
        {user ? tr("Modifier l'utilisateur") : tr('Nouvel utilisateur')}
      </span>
    )}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', marginBottom: 6 }}>{tr('NOM')}</div>
      {/* Plus d'`autoFocus` (lot 13 de l'audit du 03/10) : la feuille pose
        * d'elle-même le focus sur son premier champ, ce nom. Un `autoFocus` le
        * prenait AVANT elle ; elle retenait alors ce champ comme l'élément à
        * qui rendre le focus, et le rendait à la fermeture à un champ démonté :
        * le clavier repartait du haut de la page, pas du bouton qui l'avait
        * ouverte. */}
      <input aria-label={tr('Nom')} value={name} onChange={e => setName(e.target.value)} placeholder={tr('Nom')} style={{ ...inp, marginBottom: 16 }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', marginBottom: 6 }}>{tr('RÔLE')}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setRole('Admin')} aria-pressed={role === 'Admin'} style={roleBtn(role === 'Admin')}>{tr('Admin')}</button>
        <button onClick={() => setRole('Famille')} aria-pressed={role === 'Famille'} style={roleBtn(role === 'Famille')}>{tr('Famille')}</button>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', marginBottom: 8 }}>{tr('COULEUR')}</div>
      <div role="group" aria-label={tr('Couleur du profil')} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {USER_COLORS.map((col, k) => <button key={col} aria-label={nomsCouleurs[k]} title={nomsCouleurs[k]} aria-pressed={col === c} onClick={() => setC(col)} style={{ width: 32, height: 32, borderRadius: '50%', border: col === c ? '2px solid var(--o-text)' : '2px solid transparent', background: col, cursor: 'pointer', flexShrink: 0 }} />)}
      </div>
      {role !== 'Admin' && (<>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', marginBottom: 4 }}>{tr('VUES AUTORISÉES')}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', marginBottom: 8 }}>{tr("Rien de coché = tout est visible. L'Accueil et les fiches restent toujours accessibles.")}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {VUES_CHOIX.map(([vid, lb]) => { const on = vues.indexOf(vid) >= 0; return (
            <button key={vid} onClick={() => basculeVue(vid)} aria-pressed={on}
              style={{ padding: '7px 13px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: '1px solid ' + (on ? 'transparent' : 'var(--o-bd1)'), background: on ? 'var(--o-accent-fond)' : 'var(--o-s2)', color: on ? '#fff' : 'var(--o-text1)' }}>{lb}</button>
          ); })}
        </div>
      </>)}
      {role !== 'Admin' && (<>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', marginBottom: 4 }}>{tr('AUTORISATIONS')}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', marginBottom: 8 }}>{tr('Rien de coché = aucune. Ajouter, modifier ou supprimer un profil, et le code admin, restent réservés à un administrateur.')}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {DROITS.map(([did, lb]) => { const on = droits.indexOf(did) >= 0; return (
            <button key={did} onClick={() => basculeDroit(did)} aria-pressed={on}
              style={{ padding: '7px 13px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: '1px solid ' + (on ? 'transparent' : 'var(--o-bd1)'), background: on ? 'var(--o-accent-fond)' : 'var(--o-s2)', color: on ? '#fff' : 'var(--o-text1)' }}>{tr(lb)}</button>
          ); })}
        </div>
        {/* Trois de ces cases ouvrent une section dont le COMPOSANT garde
          * l'écriture (audit du 03/10) : les règles et les interrupteurs
          * passent par des commandes réservées aux administrateurs de Home
          * Assistant, les alertes par `loggia_alertes`, une clé de la maison.
          * Le profil n'y change rien — il n'est pas une frontière de
          * sécurité —, et sous un compte Home Assistant ordinaire la section
          * s'ouvrait pour ne rien enregistrer. On le dit au moment d'accorder. */}
        {sousAdminHA.length > 0 && (
          <div role="note" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '-8px 0 20px', padding: '10px 12px', borderRadius: 12, background: 'rgba(var(--o-warn-rgb),.10)', border: '1px solid rgba(var(--o-warn-rgb),.45)', color: 'var(--o-warn)', fontSize: 12, fontWeight: 700, lineHeight: 1.45 }}>
            <Fi i="triangle-warning" size={14} color="var(--o-warn)" />
            <span>{tr('{liste} : ces réglages appartiennent à la maison, et le composant ne les enregistre que depuis un compte administrateur de Home Assistant. Sous un compte ordinaire, la section s’ouvre, mais rien ne s’y enregistre.', { liste: sousAdminHA.join(', ') })}</span>
          </div>
        )}
      </>)}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onDelete && <button onClick={onDelete} style={{ padding: '11px 15px', borderRadius: 14, background: 'rgba(var(--o-bad-rgb),.12)', border: '1px solid rgba(var(--o-bad-rgb),.4)', color: 'var(--o-bad)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{tr('Supprimer')}</button>}
        <div style={{ flex: 1 }} />
        <button onClick={save} style={{ padding: '11px 18px', borderRadius: 14, background: 'var(--o-accent-fond)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{tr('Enregistrer')}</button>
      </div>
    </BottomSheet>
  );
}

/* Vignette « Photo » du fond d'écran : sans photo, le clic ouvre le sélecteur
 * de fichier ; avec, il active le fond. Les deux petits boutons dessous
 * changent ou retirent l'image. La photo est compressée à l'import (1920 px,
 * JPEG), rangée sur Home Assistant sous le compte connecté, et gardée en copie
 * dans le localStorage (ADR 0289, fondphoto.js). Sa version (`fondV`) part
 * dans l'apparence : les autres écrans du compte la reprennent. */
function FondPhotoBtn({ actif, fondV, onLook }) {
  const [, force] = useState(0);
  const fichierRef = useRef(null);
  const photo = lireFondPhoto();
  const prev = () => { try { window.dispatchEvent(new CustomEvent('loggia-fond-photo')); } catch {} force(v => v + 1); };
  const choisir = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = await compresserImage(f);
      localStorage.setItem(FOND_PHOTO_CLE, data);
      prev();
      // Pas de serveur (démo) ou envoi en échec : la copie locale tient, et
      // l'écran la rangera à sa prochaine ouverture (`fondV` reste absent).
      const v = await envoyerFond(data).catch(() => null);
      onLook({ fond: 'photo', ...(v ? { fondV: v } : {}) });
    } catch (er) {
      alerter({ titre: tr('Photo'), texte: tr("L'image n'a pas pu être utilisée : ") + (er && er.message === 'image trop lourde' ? tr('trop lourde même compressée.') : tr('fichier illisible.')) });
    }
  };
  const seg = (on) => ({ padding: '6px 13px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap', background: on ? 'var(--o-accent-fond)' : 'transparent', color: on ? '#fff' : 'var(--o-text2)' });
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
      <input aria-label={tr('Choisir une image de fond')} ref={fichierRef} type="file" accept="image/*" onChange={choisir} style={{ display: 'none' }} />
      <span style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 12, background: 'var(--o-well)', border: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
        <button onClick={() => onLook({ fond: 'aucun' })} aria-pressed={!actif} style={seg(!actif)}>{tr('Aucun')}</button>
        <button onClick={() => { if (!photo && !fondV) { fichierRef.current && fichierRef.current.click(); return; } onLook({ fond: 'photo' }); }} aria-pressed={actif} style={seg(actif)}>{tr('Photo')}</button>
      </span>
      {photo && (
        <span style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => fichierRef.current && fichierRef.current.click()} style={{ border: 'none', background: 'transparent', color: 'var(--o-text3)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>{tr('changer')}</button>
          <button onClick={() => { try { localStorage.removeItem(FOND_PHOTO_CLE); } catch {} prev(); retirerFond().catch(() => {}); onLook({ ...(actif ? { fond: 'aucun' } : {}), fondV: null }); }} style={{ border: 'none', background: 'transparent', color: 'var(--o-text3)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>{tr('retirer')}</button>
        </span>
      )}
    </span>
  );
}

// Éditeur de vue custom (modal admin) : nom, icône, sélection d'entités avec recherche.
function CvEditor({ cv, hass, onSave, onClose }) {
  const [name, setName] = useState(cv ? cv.name : '');
  const [icon, setIcon] = useState(cv ? cv.icon : 'sparkles');
  const [ents, setEnts] = useState(cv ? [...cv.ents] : []);
  const inp = cvInp;
  const save = () => { const n = name.trim(); if (!n) return; onSave({ id: cv ? cv.id : 'cv_' + Math.random().toString(36).slice(2, 8), name: n, icon, ents }); };
  return (
    /* Une feuille, plus une modale faite main (lot 13 de l'audit du 03/10),
     * pour les raisons de l'éditeur de profil, plus haut : un dialogue nommé
     * par son titre, Échap, le fond inerte, le focus rendu au bouton qui l'a
     * ouverte, et la croix à la place d'« Annuler ». */
    <BottomSheet onClose={onClose} title={cv ? tr('Modifier la vue') : tr('Nouvelle vue')}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', letterSpacing: '.04em', marginBottom: 6 }}>{tr('NOM')}</div>
      <input aria-label={tr('Ma vue')} value={name} onChange={e => setName(e.target.value)} placeholder={tr('Ma vue')} style={inp} />
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', letterSpacing: '.04em', margin: '14px 0 6px' }}>{tr('ICÔNE')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {/* Une grille d'icônes nues : chacune dit son nom et si elle est
          * choisie, sinon c'est « bouton » vingt fois (plan M7). La choisie
          * passe en bleu plein, comme toute puce choisie et comme la grille
          * d'icônes d'une carte (lot 13 de l'audit du 03/10) : son contour bleu
          * sur fond lavé était la dernière exception. */}
        {CV_ICONS.map(ic => { const on = icon === ic; return <button key={ic} aria-label={ic} aria-pressed={on} title={ic} onClick={() => setIcon(ic)} style={{ width: 40, height: 40, borderRadius: 10, border: 'var(--o-bw,1px) solid ' + (on ? 'transparent' : 'var(--o-bd2)'), background: on ? 'var(--o-accent-fond)' : 'var(--o-s2)', color: on ? '#fff' : 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i={ic} size={16} /></button>; })}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', letterSpacing: '.04em', margin: '14px 0 6px' }}>{tr('ENTITÉS ({n})', { n: ents.length })}</div>
      {ents.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {ents.map((x, i) => <span key={cvKey(x)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 10px', borderRadius: 10, background: 'rgba(var(--o-accent-rgb),.12)', border: '1px solid rgba(var(--o-accent-rgb),.25)', fontSize: 12, fontWeight: 700, color: 'var(--o-accent-soft)', maxWidth: '100%' }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cvEstTpl(x) ? '{ } ' + (x.name || tr('Template')) : cvName(hass && hass.states && hass.states[x], x)}</span><span role="button" tabIndex={0} aria-label={tr('Retirer cette entité')} onClick={() => setEnts(prev => prev.filter((_, k) => k !== i))} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEnts(prev => prev.filter((_, k) => k !== i)); } }} style={{ cursor: 'pointer', fontWeight: 800, opacity: .8 }}>×</span></span>)}
      </div>}
      <EntPicker hass={hass} exclude={ents.filter(x => typeof x === 'string')} onPick={(id) => setEnts(prev => prev.indexOf(id) < 0 ? [...prev, id] : prev)} />
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', letterSpacing: '.04em', margin: '14px 0 6px' }}>{tr('OU UNE CARTE TEMPLATE')}</div>
      <TplForm hass={getHass()} onAdd={(t) => setEnts(prev => [...prev, t])} />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button onClick={save} style={{ padding: '11px 20px', borderRadius: 10, background: 'var(--o-accent-fond)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: name.trim() ? 1 : .5 }}>{tr('Enregistrer')}</button>
      </div>
    </BottomSheet>
  );
}

/* ── Onglet Entités : éditeur générique de listes (Paramètres, admin) ──
   cols: [{k, label, ph, domain?, flex?}] — domain propose, sous le champ, les entités de ce domaine (ChampSuggere). */

const entInp = { width: '100%', padding: '9px 11px', borderRadius: 10, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 12, fontWeight: 600, boxSizing: 'border-box', fontFamily: 'inherit' };

function EntSection({ title, desc, cols, rows, onRows, addable = true, check = null, sugg = null }) {
  const set = (i, k, v) => onRows(rows.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const del = (i) => onRows(rows.filter((_, j) => j !== i));
  const add = () => onRows([...rows, { ...Object.fromEntries(cols.map(c => [c.k, ''])), _k: 'r' + Date.now() + Math.random().toString(36).slice(2, 6) }]);
  // clés stables : les lignes chargées depuis localStorage n'ont pas de _k → on le pose une fois
  // Pas d'effet de rattrapage des cles ici : il appelait `onRows`, donc
  // `entSet`, qui leve `entTouched` — et le formulaire cessait alors de se
  // resynchroniser sur la configuration serveur, puis l'ecrasait a
  // l'enregistrement. Les cles sont posees par `readEnt()`, a la lecture.
  // Un filet de separation, pas un cadre : ces sections vivent deja dans la
  // carte des reglages, et deux encadrements imbriques volent de chaque cote
  // une largeur qui manque cruellement sur un telephone.
  return (
    <div style={{ borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', padding: '16px 0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{title}</div>
        {addable && <button onClick={add} style={{ padding: '5px 11px', borderRadius: 10, background: 'rgba(var(--o-accent-rgb),.14)', border: 'none', color: 'var(--o-accent-soft)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{tr('+ Ajouter')}</button>}
      </div>
      {desc && <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginBottom: 10 }}>{desc}</div>}
      <div className="o-enthead" style={{ display: 'flex', gap: 8, padding: '0 2px 5px', fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: 'var(--o-text3)' }}>
        {cols.map(c => <span key={c.k} style={{ flex: c.flex || 1, minWidth: 0 }}>{c.label.toUpperCase()}</span>)}
        {addable && <span style={{ width: 30, flexShrink: 0 }} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r, i) => (
          <div key={r._k || 'i' + i} className="o-entrow" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {cols.map(c => { const v = r[c.k] || ''; const st = check && c.domain && v ? (check(v) ? 'ok' : 'bad') : null; return (
              <span key={c.k} style={{ position: 'relative', flex: c.flex || 1, minWidth: 0, display: 'flex' }}>
                <span className="o-entlabel">{c.label}</span>
                <ChampSuggere label={c.label} value={v} onChange={val => set(i, c.k, val)} placeholder={c.ph || ''} suggestions={c.domain && sugg ? sugg(c.domain) : []} style={{ ...entInp, width: '100%', minWidth: 0, paddingRight: st ? 24 : undefined, border: st === 'bad' ? 'var(--o-bw,1px) solid rgba(var(--o-bad-rgb),.55)' : entInp.border }} />
                {st && <span title={st === 'ok' ? tr('Entité trouvée') : tr('Introuvable dans Home Assistant')} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', width: 7, height: 7, borderRadius: '50%', background: st === 'ok' ? 'var(--o-ok)' : 'var(--o-bad)', pointerEvents: 'none' }} />}
              </span>
            ); })}
            {addable && <button onClick={() => del(i)} title={tr('Retirer')} style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, background: 'rgba(var(--o-bad-rgb),.12)', border: 'none', color: 'var(--o-bad)', cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>×</button>}
          </div>
        ))}
        {!rows.length && <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, padding: '4px 2px' }}>{tr('Vide.')}</div>}
      </div>
    </div>
  );
}

/* Le WiFi et la 5G n'ont pas la meme origine — IP locale d'un cote, Nabu Casa
 * de l'autre — donc pas le meme localStorage : une configuration qui reste
 * dans le navigateur change quand on sort de chez soi. Tout ce qui decrit la
 * MAISON passe donc par le composant, code administrateur et profil actif
 * compris depuis le 03/09. Ne restent locales que les marges d'ecran. */

/* ── Le distributeur dans l'éditeur (ADR 0155, 05/10) ─────────────────────
 * La liste de repas saisie ici a cessé d'être un planning : le planning vient
 * du programme de l'appareil, des automatisations qui le COMMANDENT, ou du
 * planning de Loggia — tous lus dans la fiche du distributeur. Elle perd donc
 * son éditeur (« Repas de la journée »), mais rien ne se perd en silence :
 * « Enregistrer » la RECOPIE telle que le magasin la tient, relue au moment
 * d'écrire, depuis TOUTES les vues (toutes réécrivent `loggia_feeder`) ; le
 * serveur y lit ses `automation.*` comme des indices ; l'encart « Ancienne
 * liste de repas » la montre jusqu'au geste « Oublier l'ancienne liste ». */

const estObjet = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const idEntite = (v) => typeof v === 'string' && v !== '';

/** Un repas de l'ancienne liste qui PORTE quelque chose : une heure, un
 * libellé, un interrupteur ou des grammes (non nuls), sous n'importe quelle
 * forme — un repas abîmé reste. Seuls `null`, un nombre, une liste ou une
 * ligne blanche (un « + Ajouter » resté sans suite, écrit `g: 0`) ne portent
 * rien : ils partaient déjà. */
const porte = (v) => v != null && v !== '' && v !== false;
function ancienRepas(m) {
  return estObjet(m) && ([m.time, m.label, m.auto].some(porte) || (porte(m.g) && Number(m.g) !== 0));
}

/** L'ancienne liste TELLE QUELLE : ses repas sont recopiés sans être réécrits
 * (ni identifiant renuméroté, ni champ « réparé »). */
function ancienneListeBrute(brut) {
  return estObjet(brut) && Array.isArray(brut.meals) ? brut.meals.filter(ancienRepas) : [];
}

/* Les grammes d'un repas de l'ancienne liste, s'il en porte (un nombre > 0,
 * ou son écriture en chaîne) ; `null` sinon — un `g: { n: 3 }` abîmé ne
 * s'invente pas un poids. */
function grammesDe(m) {
  const v = estObjet(m) ? m.g : null;
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** La liste du champ « Script de distribution » : les scripts CANDIDATS
 * (`scriptsCandidats`, d'après leur nom) en tête, sous un mot qui dit ce
 * qu'ils sont — une proposition, jamais un choix (05/10, relecture
 * « données ») ; les autres ensuite, dans leur ordre. */
export function suggestionsScript(suggestions, candidats) {
  const tous = Array.isArray(suggestions) ? suggestions : [];
  const c = new Set(Array.isArray(candidats) ? candidats : []);
  return [
    ...tous.filter(x => c.has(x.id)).map(x => ({ ...x, sub: tr('{id} · peut-être celui qui distribue', { id: x.id }) })),
    ...tous.filter(x => !c.has(x.id)),
  ];
}

/** Les automatisations associées au distributeur (« Associer » de la fiche,
 * « Oublier l'ancienne liste » ici) : des identifiants, sans doublon. */
function associeesDe(brut) {
  return estObjet(brut) && Array.isArray(brut.associees) ? [...new Set(brut.associees.filter(idEntite))] : [];
}

/* Le distributeur tel que l'éditeur le tient : ses quatre champs, `haid`
 * (05/10, relecture du lot 16 — l'entité qu'ouvre la fiche, sans champ ici,
 * qui voyage invisible comme elle est venue) et `appareil` (05/10, ADR 0155 :
 * l'appareil choisi dans la liste ; un Petlibro n'a pas de réservoir en
 * grammes, le désigner par son appareil suffit). */
export function feederEdition(f) {
  const h = (f && f.haids) || {};
  return { reservoir: h.reservoir || '', portionWeight: h.portionWeight || '', distribuees: h.distribuees || '', script: (f && f.script) || '', haid: (f && f.haid) || '',
    appareil: (f && typeof f.appareil === 'string' && f.appareil.trim()) || '' };
}

/* Ce que « Enregistrer » écrit du distributeur. `brut` : `loggia_feeder` relu
 * AU MOMENT d'écrire, d'où viennent l'ancienne liste et les associées — le
 * formulaire ne les porte pas, et un état capturé à l'ouverture de la feuille
 * écraserait un « Associer » fait entre-temps dans la fiche. `null` quand rien
 * n'est désigné : la carte se tait au lieu de montrer un réservoir vide, et
 * `cfgSet` efface la clé. Mais la clé vit tant qu'UN champ désigne quelque
 * chose (05/10, relecture du lot 16 : un distributeur désigné par son script
 * ou son compteur perdait TOUT au premier « Enregistrer » de la Sécurité) —
 * l'appareil, l'ancienne liste et les associées compris (ADR 0155). */
export function feederAEcrire(ent, brut = null) {
  const f = ent.feeder;
  const meals = ancienneListeBrute(brut);
  const associees = associeesDe(brut);
  return (f.distribuees || f.script || f.haid || f.reservoir || f.portionWeight || f.appareil || meals.length || associees.length)
    ? {
      haids: {
        reservoir: f.reservoir || null,
        portionWeight: f.portionWeight || null,
        distribuees: f.distribuees || null,
      },
      ...(f.script ? { script: f.script } : {}),
      ...(f.haid ? { haid: f.haid } : {}),
      ...(f.appareil ? { appareil: f.appareil } : {}),
      meals,
      ...(associees.length ? { associees } : {}),
    }
    : null;
}

/** « Oublier l'ancienne liste » (admin) : la liste se vide, ses repas reliés
 * à une automatisation la laissent ASSOCIÉE au distributeur — la fiche la
 * montre encore, et le serveur la compte toujours parmi ses sources. Le reste
 * de la clé ne bouge pas. Jamais `null` : une liste vidée volontairement reste
 * vide, l'ancienne description de `loggia_entities` ne revient pas. */
export function oublierAncienneListe(brut) {
  const b = estObjet(brut) ? brut : {};
  const relies = ancienneListeBrute(b).map(m => m.auto).filter(a => idEntite(a) && a.indexOf('automation.') === 0);
  return { ...b, meals: [], associees: [...new Set([...associeesDe(b), ...relies])] };
}

/** Les appareils qu'on peut désigner comme distributeur : ceux dont une sœur
 * DISTRIBUE (la règle R1 de `distributeur.js`, la même que le serveur) en
 * tête, puis les autres, par nom. Les entités se rangent par appareil en UNE
 * passe : chercher les sœurs de chaque appareil dans tout l'index coûterait
 * appareils × entités à chaque état de la maison. Et seules les sœurs des
 * domaines qu'elle lit sans configuration (bouton, nombre, texte, liste) se
 * DÉCRIVENT (05/10, contradicteur) : décrire toutes les autres coûtait ~11 ms
 * à chaque état de la maison sur 400 appareils, feuille ouverte — pour la
 * même réponse, `commandeDistribuer(…, null)` ne regardant qu'elles. */
const DOMAINES_COMMANDE = ['button', 'number', 'text', 'select'];
export function appareilsDistributeur(index, states) {
  const meta = index && index.entityMeta;
  if (!meta || typeof meta.forEach !== 'function') return [];
  const parAppareil = new Map();
  const nomVu = new Map();
  meta.forEach((m, id) => {
    if (!m || !m.deviceId || m.disabled) return;
    if (!parAppareil.has(m.deviceId)) parAppareil.set(m.deviceId, new Map());
    if (m.device && !nomVu.has(m.deviceId)) nomVu.set(m.deviceId, m.device);
    if (typeof id === 'string' && DOMAINES_COMMANDE.indexOf(id.slice(0, id.indexOf('.'))) >= 0) parAppareil.get(m.deviceId).set(id, m);
  });
  const infos = (index.deviceMeta && typeof index.deviceMeta.get === 'function') ? index.deviceMeta : new Map();
  const out = [];
  parAppareil.forEach((entites, deviceId) => {
    const d = infos.get(deviceId) || {};
    const commande = entites.size ? commandeDistribuer(soeursDistributeur({ entityMeta: entites }, states || {}, deviceId), states || {}, null) : null;
    const nom = d.name || nomVu.get(deviceId) || deviceId;
    out.push({ id: deviceId, label: String(nom), sub: commande ? commande.entity_id : ([d.manufacturer, d.model].filter(Boolean).join(' · ') || undefined), reconnu: !!commande });
  });
  return out.sort((a, b) => (b.reconnu - a.reconnu) || comparerTextes(a.label, b.label));
}

/* L'encart « Ancienne liste de repas » (05/10, ADR 0155) : seulement quand
 * une ancienne liste existe. Il dit ce qu'elle devient, compte ses repas
 * reliés à une automatisation et ceux qui ne l'étaient pas (un `input_boolean`
 * ne distribuait rien par lui-même), avec leurs heures et leurs libellés. Les
 * repas se lisent par `croqAncienneListe`, alignés sur ceux que « Enregistrer »
 * recopie (`ancienRepas`) : l'encart ne montre rien qui partirait en silence,
 * et ne cache rien qui resterait. « Oublier » est réservé aux administrateurs
 * (ADR 0144) et relit la clé au moment du geste. La phrase dit que les
 * automatisations distribuent toujours (05/10, contradicteur des textes) :
 * « Ils ne servent plus » se lisait « le repas ne part plus ». */
function AncienneListeRepas({ hass }) {
  const [err, setErr] = useState('');
  const [, relire] = useState(0);
  const titreId = useId();
  const brut = loggiaEnt('feeder', null);
  const objets = estObjet(brut) && Array.isArray(brut.meals) ? brut.meals.filter(estObjet) : [];
  const liste = croqAncienneListe().filter((_, i) => ancienRepas(objets[i]));
  if (!liste.length) return null;
  // Les grammes de chaque repas, alignés sur `liste` (le même filtre, dans le même ordre).
  const grammes = objets.filter(ancienRepas).map(grammesDe);
  const S = (hass && hass.states) || {};
  /* Les grammes saisis par repas comptaient les jours de réserve ; ils ne
   * servent plus (05/10, relecture « données ») : la réserve demande le poids
   * d'une portion en grammes. Sans lui, la fiche dit « Ce qu'il reste dans le
   * bac » — l'encart dit pourquoi, au lieu de laisser la donnée partir sans un mot.
   * Seulement si le bac se lit en GRAMMES : avec un réservoir en % (ou sans
   * réservoir), la réserve ne se comptait déjà pas — la phrase dirait une perte
   * qui n'en est pas une (05/10, contradicteur de C3). */
  const lu = lireDistributeur(LOGGIA_INDEX, S, brut);
  const reservoir = estObjet(brut) && estObjet(brut.haids) ? brut.haids.reservoir : null;
  const reserveSansMesure = grammes.some(g => g != null) && niveauDuBac(S, reservoir).grammes != null && !mesurePortion(S, lu.portion, lu.poidsPortion);
  const nomAuto = (id) => (S[id] && S[id].attributes && S[id].attributes.friendly_name) || id;
  const avecGrammes = liste.map((r, i) => ({ ...r, g: grammes[i] }));
  const relies = avecGrammes.filter(r => r.relie);
  const autres = avecGrammes.filter(r => !r.relie);
  // Une heure, un libellé, ses grammes ; à défaut, l'interrupteur du repas : jamais une ligne vide.
  const texte = (r, avecAuto) => [r.heure, r.label, avecAuto && r.auto ? nomAuto(r.auto) : null].filter(Boolean).join(' · ') || r.auto || '—';
  // …et ses grammes à la suite, à part (05/10, relecture « données ») : saisis
  // par repas, ils ne se montraient plus nulle part.
  const poids = (r) => (r.g != null ? ' · ' + r.g.toLocaleString(locale()) + ' g' : null);
  const groupe = (titre, items, avecAuto) => (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--o-text2)' }}>{titre}</div>
      <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map((r, i) => <li key={i} style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{texte(r, avecAuto)}{poids(r) && <span>{poids(r)}</span>}</li>)}
      </ul>
    </div>
  );
  const oublier = () => {
    cfgSet({ loggia_feeder: oublierAncienneListe(cfgVal('loggia_feeder', null) || loggiaEnt('feeder', null)) })
      .then(ok => {
        if (ok === false) { setErr(tr('Réservé aux administrateurs.')); return; }
        setErr(''); relire(n => n + 1);
      })
      .catch(() => setErr(tr('Enregistrement impossible — la configuration n’a pas été appliquée.')));
  };
  return (
    <div role="group" aria-labelledby={titreId} style={{ borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', marginTop: 16, padding: '14px 0 4px' }}>
      <div id={titreId} style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>{tr('Ancienne liste de repas')}</div>
      <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600 }}>{tr('Ces repas venaient d’une liste saisie dans Loggia. Cette liste ne sert plus de planning : la fiche du distributeur lit celui de l’appareil, vos automatisations ou le planning de Loggia. Rien ne change pour vos automatisations : celles qui distribuaient distribuent toujours.')}</div>
      {relies.length > 0 && groupe(trN(relies.length, '{n} repas relié à une automatisation', '{n} repas reliés à une automatisation'), relies, true)}
      {autres.length > 0 && groupe(trN(autres.length, '{n} repas non relié : il ne distribuait rien par lui-même', '{n} repas non reliés : ils ne distribuaient rien par eux-mêmes'), autres, false)}
      {reserveSansMesure && <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginTop: 10 }}>{tr('Les grammes de cette liste ne servent plus : sans poids de portion en grammes, la fiche ne compte plus les jours de réserve.')}</div>}
      {!compteOrdinaire(hass) && (
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
          <BoutonConfirme libelle={tr('Oublier l’ancienne liste')} onConfirme={oublier} />
          {relies.length > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', flex: '1 1 200px', minWidth: 0 }}>{tr('Les automatisations reliées restent associées au distributeur.')}</span>}
        </div>
      )}
      {err && <div role="alert" style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-bad)', marginTop: 8 }}>{err}</div>}
    </div>
  );
}

// Hook partagé : état + persistance de la config d'entités, pour la fiche « Entités de la vue » de chaque page.
// Exporté pour tests/distributeur_migration.test.mjs, qui l'exécute tel quel.
export function useEntConfig(hass) {
  // Cle de rendu stable, posee DES la lecture : sans elle, les lignes se
  // reperaient par leur rang et une suppression deplacait le curseur de saisie.
  const avecCle = (a) => a.map((r, i) => ({ ...r, _k: r._k || 'k' + i + '_' + Math.random().toString(36).slice(2, 6) }));
  // …et retirée à l'écriture (05/10) : `loggia_people` et `loggia_medias`
  // gardaient `_k`, tirée au hasard — du bruit dans la configuration.
  const sansCle = ({ _k, ...r }) => r;
  // Lecture de la configuration courante, telle que le formulaire l'affiche.
  /* Les lignes d'une liste éditée : ses objets, rien d'autre (05/10, suite du
   * point 10b). Un élément `null`, ou une liste qui n'en est pas une, faisait
   * tomber TOUTE la vue Paramètres — la seule d'où l'on répare. Une ligne dont
   * un champ est abîmé reste, pour être corrigée. */
  const lignes = (v) => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object' && !Array.isArray(x)) : []);
  // Un champ en texte, comme le formulaire : un nombre se montre (« 5 », à
  // corriger), un objet se vide — il ne désigne rien et s'affichait
  // « [object Object] ».
  const texte = (v) => (typeof v === 'string' ? v : (typeof v === 'number' && Number.isFinite(v)) ? String(v) : '');
  const readEnt = () => ({
    rooms: avecCle(normRooms(cfgVal('loggia_rooms', null)).map(r => ({ room: r.room || '', icon: r.icon || null, teinte: r.teinte || null, dehors: typeof r.dehors === 'boolean' ? r.dehors : null, temp: (r.haid && r.haid.temp) || '', humidity: (r.haid && r.haid.humidity) || '', co2: (r.haid && r.haid.co2) || '', co2seuil: (r.haid && r.haid.co2seuil) != null ? String(r.haid.co2seuil) : '',
      lights: Array.isArray(r.haid && r.haid.lights) ? r.haid.lights.join(', ') : ((r.haid && r.haid.lights) || '') }))),
    energy: { ...enHaids(), ...(cfgVal('loggia_energyHaids', null) || {}) },
    alarm: secAlarm() || '',
    weather: weatherEntity(getHass()) || '',
    people: avecCle(lignes(cfgVal('loggia_people', null)).map(p => ({ name: p.name || '', haid: p.haid || '' }))),
    switches: avecCle(switchLightsCfg().map(id => ({ haid: id }))),
    cams: avecCle(lignes(cfgVal('loggia_cameras', null)).map(c => ({ name: c.name || '', haid: c.haid || '' }))),
    medias: avecCle(medPlayers().map(m => ({ name: m.name || '', haid: m.haid || '', ma: m.ma || medCompanion(m.haid) || '' }))),
    /* Chauffage : les thermostats `climate.*` se decouvrent seuls, mais un
     * radiateur fil pilote est un `switch` entoure d'aides — seule une
     * configuration peut dire lesquelles. Elle n'avait aucun ecran jusqu'ici. */
    climate: avecCle(lignes(cfgVal('loggia_climate', null) || loggiaEnt('climate', null)).map(z => ({
      /* En texte (05/10, suite du point 10b) : « Enregistrer » fait
       * `z.name.toLowerCase()` et `z.haid.indexOf(...)`. Une zone au nom en
       * nombre ou à l'entité en objet le faisait lever — « Enregistrement
       * impossible » pour TOUTE la configuration, rien ne se réparait. */
      name: texte(z.name), room: texte(z.room), haid: texte(z.haid),
      tempCible: texte(z.tempCible), modeEnt: texte(z.modeEnt),
      autoEnt: texte(z.autoEnt), tempSensor: texte(z.tempSensor),
    }))),
    /* Distributeur de croquettes : pilote par automatisations, sans equivalent
     * standard dans Home Assistant — il n'y a rien a decouvrir, seulement a
     * designer. Or AUCUN ecran ne l'ecrivait : `loggia_feeder` ne sortait que
     * de la demonstration, si bien que la carte et la fiche du distributeur
     * n'apparaissaient jamais sur une vraie installation, pendant que le README
     * promettait cette designation (plan du 22/09, points S1 et M4). */
    feeder: feederEdition(cfgVal('loggia_feeder', null) || loggiaEnt('feeder', null)),
    /* Plus de `repas` (05/10, ADR 0155) : l'ancienne liste n'a plus d'éditeur.
     * « Enregistrer » la recopie depuis le magasin (`feederAEcrire`), et
     * l'encart « Ancienne liste de repas » la lit par `croqAncienneListe`. */
  });
  const [ent, setEnt] = useState(readEnt);
  // La configuration serveur arrive APRES le premier rendu. Sans cette
  // resynchronisation, le formulaire montrerait un etat capture avant sa
  // reponse — et l'enregistrer ecraserait les vrais reglages.
  const [entTouched, setEntTouched] = useState(false);
  const cfgSig = JSON.stringify(LOGGIA_CFG || {});
  useEffect(() => { if (!entTouched) setEnt(readEnt()); }, [cfgSig]);
  const entSet = (k) => (rows) => { setEntTouched(true); setEnt(o => ({ ...o, [k]: rows })); };
  const saveEnt = () => {
    try {
      cfgSet({
        // L'icone et la teinte choisies dans la fiche de l'accueil (v3.23)
        // ne se reglent pas ici, mais ne doivent pas s'y perdre.
        // « Pièce du dehors » (décision D5, audit du 19/10) se règle dans la fiche de la pièce, et ne doit pas se perdre ici.
        loggia_rooms: ent.rooms.filter(r => r.room).map(r => ({ room: r.room, ...(r.icon ? { icon: r.icon } : {}), ...(r.teinte ? { teinte: r.teinte } : {}), ...(typeof r.dehors === 'boolean' ? { dehors: r.dehors } : {}), haid: { temp: r.temp || null, humidity: r.humidity || null, co2: r.co2 || null, co2seuil: (Number(r.co2seuil) > 0 ? Math.round(Number(r.co2seuil)) : null),
          // Vide = toutes les lumieres de la piece. Une liste explicite ne
          // vaut que pour le bouton de la carte, pas pour le comptage.
          lights: String(r.lights || '').split(',').map(s => s.trim()).filter(Boolean) } })),
        loggia_energyHaids: ent.energy,
        loggia_alarm: ent.alarm || '',
        loggia_weather: ent.weather || '',
        loggia_people: ent.people.filter(p => p.haid).map(sansCle),
        loggia_switchlights: ent.switches.map(s => s.haid).filter(Boolean),
        // Un nom par défaut s'écrit dans la langue de qui enregistre : c'est
        // ensuite un nom comme un autre (audit du 03/10).
        loggia_cameras: ent.cams.filter(c => c.haid).map((c, i) => ({ id: 'cam_' + i, name: c.name || tr('Caméra {n}', { n: i + 1 }), online: true, haid: c.haid })),
        loggia_medias: ent.medias.filter(m => m.haid).map(sansCle),
        /* Une zone n'a de sens qu'avec l'entite qu'elle pilote. `id` sert de
         * cle interne : il est derive du nom, faute de mieux, mais reste stable
         * tant que le nom ne bouge pas. */
        loggia_climate: ent.climate.filter(z => z.haid).map((z, i) => ({
          id: (z.name || ('zone' + i)).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || ('zone' + i),
          name: z.name || z.haid, room: z.room || null, haid: z.haid,
          type: z.haid.indexOf('climate.') === 0 ? 'thermostat' : 'pilot_wire',
          tempCible: z.tempCible || null, modeEnt: z.modeEnt || null,
          autoEnt: z.autoEnt || null, hasAuto: !!z.autoEnt,
          tempSensor: z.tempSensor || null,
        })),
        // Toutes les vues réécrivent le distributeur, même sans le montrer :
        // l'ancienne liste et les associées, relues ICI, voyagent avec lui.
        loggia_feeder: feederAEcrire(ent, cfgVal('loggia_feeder', null) || loggiaEnt('feeder', null)),
      });
    } catch { alerter({ titre: tr('Enregistrer et recharger'), texte: tr('Enregistrement impossible — la configuration n’a pas été appliquée.') }); return; }
    // L'écriture serveur part en arrière-plan : on lui laisse le temps d'aboutir
    // avant de recharger, sinon la page relirait l'ancienne valeur.
    setTimeout(() => window.location.reload(), 700);
  };
  const dlists = useMemo(() => {
    const doms = ['sensor', 'person', 'switch', 'camera', 'media_player', 'alarm_control_panel', 'weather',
      'climate', 'input_number', 'input_select', 'input_boolean', 'number', 'script', 'automation'];
    const m = {}; doms.forEach(d => { m[d] = []; });
    if (hass && hass.states) Object.keys(hass.states).forEach(id => { const d = id.slice(0, id.indexOf('.')); if (m[d]) m[d].push(id); });
    Object.keys(m).forEach(d => m[d].sort());
    return m;
  }, [hass]);
  return { ent, setEnt, entSet, saveEnt, dlists };
}



// Sections d'édition des entités — celles de la fiche « Entités de la vue », page par page.
function EntSections({ ent, setEnt, entSet, dlists, only = null, hass = null }) {
  const has = (k) => !only || only.indexOf(k) >= 0;
  const check = hass && hass.states ? (id) => !!hass.states[id] : null;
  // « (optionnel) » se dit dans la langue de l'écran, l'identifiant non (audit
  // du 03/10) : « sensor.… (optionnel) » restait en français partout.
  const facultatif = (x) => tr('{x} (optionnel)', { x });
  // Les suggestions d'un domaine, sous chaque champ : le nom lu, l'identifiant dessous.
  const sugg = (d) => (dlists[d] || []).map(id => ({ id, label: (hass && hass.states && hass.states[id] && hass.states[id].attributes && hass.states[id].attributes.friendly_name) || id, sub: id }));
  // Les appareils du distributeur, relus quand la maison change, et seulement
  // dans une vue qui montre le distributeur.
  const avecDistributeur = has('feeder');
  /* Un champ du distributeur MARQUE le formulaire touché (05/10) : « Oublier
   * l'ancienne liste » change la configuration pendant l'édition, et la
   * resynchronisation de `useEntConfig` effaçait l'appareil choisi (vu dans
   * la démo). Par `entSet`, comme les listes. */
  const majFeeder = (k, val) => entSet('feeder')({ ...ent.feeder, [k]: val });
  const appareils = useMemo(() => (avecDistributeur ? appareilsDistributeur(LOGGIA_INDEX, hass && hass.states) : []), [hass, avecDistributeur]);
  /* « Distribuer » sans commande (05/10, relecture « données ») : avant le
   * 05/10, un script se devinait à son nom ; depuis, seul le script DÉSIGNÉ
   * commande, et celui qui ne l'avait jamais désigné perdait « Distribuer »
   * sans un mot. La phrase le dit, d'après ce que le FORMULAIRE désigne (elle
   * suit la saisie), et nomme les scripts candidats — proposés en tête de la
   * liste du champ, jamais choisis à la place de l'utilisateur. Seulement si un
   * distributeur est décrit : une maison sans distributeur ne lit rien. */
  const etatsMaison = (hass && hass.states) || {};
  const feederForm = avecDistributeur ? feederAEcrire(ent, cfgVal('loggia_feeder', null) || loggiaEnt('feeder', null)) : null;
  const sansCommande = !!feederForm && !lireDistributeur(LOGGIA_INDEX, etatsMaison, feederForm).commande;
  const candidats = avecDistributeur ? scriptsCandidats(etatsMaison) : [];
  const nomsCandidats = candidats.map(id => ((etatsMaison[id].attributes || {}).friendly_name || id) + ' (' + id + ')').join(', ');
  const detecter = () => {
    const r0 = LOGGIA_RESOLVED && LOGGIA_RESOLVED.rooms;
    const r = detecterCapteursPieces(ent.rooms, {
      suggestions: (r0 && r0.suggested) || [], capteurs: dlists.sensor || [],
      vivant: (id) => !!(id && hass && hass.states && hass.states[id]),
    });
    entSet('rooms')(r.rooms);
    /* Des phrases entières (audit du 03/10) : la fin du message était collée
     * en français derrière le compte traduit — « 3 sensors found par le nom ».
     * `trN` : le polonais accorde « czujnik » sur trois formes. */
    alerter({ titre: tr('Détecter automatiquement'), texte: !r.trouves
      ? tr('Aucun capteur supplémentaire trouvé. Rangez vos capteurs dans une zone Home Assistant : la détection s’appuie dessus en premier.')
      : r.parZone
        ? trN(r.trouves, '{n} capteur détecté ({z} par la zone Home Assistant) — vérifiez puis « Enregistrer et recharger ».', '{n} capteurs détectés ({z} par la zone Home Assistant) — vérifiez puis « Enregistrer et recharger ».', { z: r.parZone })
        : trN(r.trouves, '{n} capteur détecté par le nom — vérifiez puis « Enregistrer et recharger ».', '{n} capteurs détectés par le nom — vérifiez puis « Enregistrer et recharger ».') });
  };
  return (
    <>
      {has('rooms') && hass && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button onClick={detecter} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, background: 'rgba(var(--o-ok-rgb),.13)', border: '1px solid rgba(var(--o-ok-rgb),.3)', color: 'var(--o-ok)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}><Fi i="magic-wand" size={13} />{tr('Détecter automatiquement')}</button>
        </div>
      )}
      {has('rooms') && <EntSection sugg={sugg} title={tr('Pièces (Accueil)')} desc={tr("Cartes pièces : capteurs température / humidité / CO2 (CO2 optionnel). « Lampes du bouton » choisit ce que l'interrupteur de la carte allume — vide, il agit sur toutes les lumières de la pièce.")} cols={[{ k: 'room', label: tr('Pièce'), ph: tr('Séjour'), flex: .8 }, { k: 'temp', label: tr('Température'), ph: 'sensor.…', domain: 'sensor' }, { k: 'humidity', label: tr('Humidité'), ph: 'sensor.…', domain: 'sensor' }, { k: 'co2', label: 'CO2', ph: facultatif('sensor.…'), domain: 'sensor' }, { k: 'co2seuil', label: tr('Seuil CO₂'), ph: tr('1400 par défaut'), flex: .55 }, { k: 'lights', label: tr('Lampes du bouton'), ph: tr('toutes (light.a, light.b)'), domain: 'light' }]} rows={ent.rooms} onRows={entSet('rooms')} check={check} />}
      {has('energy') && (
        <div style={{ borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', padding: '16px 0 4px' }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>{tr('Énergie')}</div>
          <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginBottom: 10 }}>{tr("Capteurs de puissance (W) du flux énergétique. Les panneaux solaires, le véhicule et la batterie n'apparaissent sur le schéma que si vous les renseignez.")}</div>
          {/* Deux colonnes : a trois, le champ tronquait les noms d'entites,
              qui depassent souvent trente caracteres. */}
          <div className="grid-par-about" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 8 }}>
            {[['consoNow', tr('Consommation')], ['surplusNow', tr('Surplus')], ['solarOutput', tr('Production solaire')],
              ['evNow', tr('Véhicule · charge')], ['batNow', tr('Batterie · puissance')], ['batSoc', tr('Batterie · niveau')]].map(([k, l]) => (
              <div key={k}><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: 'var(--o-text3)', marginBottom: 4 }}>{l.toUpperCase()}</div><ChampSuggere label={l} value={ent.energy[k] || ''} onChange={val => setEnt(o => ({ ...o, energy: { ...o.energy, [k]: val } }))} placeholder="sensor.…" suggestions={sugg('sensor')} style={entInp} /></div>
            ))}
          </div>
        </div>
      )}
      {has('alarm') && (
        <div style={{ borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', padding: '16px 0 4px' }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>{tr('Alarme')}</div>
          <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginBottom: 10 }}>{tr("Panneau d'alarme (vue Sécurité, bannière, notifications).")}</div>
          <ChampSuggere label={tr('Panneau d’alarme')} value={ent.alarm} onChange={val => setEnt(o => ({ ...o, alarm: val }))} placeholder="alarm_control_panel.…" suggestions={sugg('alarm_control_panel')} style={entInp} />
        </div>
      )}
      {has('weather') && (
        <div style={{ borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', padding: '16px 0 4px' }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>{tr('Météo')}</div>
          <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginBottom: 10 }}>{tr("Entité météo : la carte météo sur le côté de l'Accueil, le fond de la bannière, la veille et les conseils d'extérieur.")}</div>
          <ChampSuggere label={tr('Entité météo')} value={ent.weather} onChange={val => setEnt(o => ({ ...o, weather: val }))} placeholder="weather.…" suggestions={sugg('weather')} style={entInp} />
        </div>
      )}
      {has('people') && <EntSection sugg={sugg} title={tr('Présence')} desc={tr('Personnes affichées sur l’Accueil (avatars).')} cols={[{ k: 'name', label: tr('Prénom'), ph: tr('Prénom'), flex: .7 }, { k: 'haid', label: tr('Entité person'), ph: 'person.…', domain: 'person' }]} rows={ent.people} onRows={entSet('people')} check={check} />}
      {has('switches') && <EntSection sugg={sugg} title={tr('Interrupteurs traités comme lumières')} desc={tr('Entités switch affichées dans la vue Lumières.')} cols={[{ k: 'haid', label: tr('Entité switch'), ph: 'switch.…', domain: 'switch' }]} rows={ent.switches} onRows={entSet('switches')} />}
      {has('cams') && <EntSection sugg={sugg} title={tr('Caméras (Accueil)')} desc={tr("Tuiles caméras de l'Accueil (flux live).")} cols={[{ k: 'name', label: tr('Nom'), ph: tr('Entrée'), flex: .7 }, { k: 'haid', label: tr('Entité camera'), ph: 'camera.…', domain: 'camera' }]} rows={ent.cams} onRows={entSet('cams')} />}
      {has('medias') && <EntSection sugg={sugg} title={tr('Lecteurs médias')} desc={tr("Vue Médias. « Compagnon MA » optionnel : entité Music Assistant qui porte titre/pochette (métadonnées + transport).")} cols={[{ k: 'name', label: tr('Nom'), ph: tr('Echo Salon'), flex: .8 }, { k: 'haid', label: tr('Entité native'), ph: 'media_player.…', domain: 'media_player' }, { k: 'ma', label: tr('Compagnon MA'), ph: facultatif('media_player.…'), domain: 'media_player' }]} rows={ent.medias} onRows={entSet('medias')} />}
      {has('climate') && <EntSection sugg={sugg} title={tr('Chauffage')}
        desc={tr('Un thermostat (climate.…) est trouvé tout seul : rien à saisir. Cette liste sert aux radiateurs fil pilote — un interrupteur entouré de ses aides, que rien ne permet de deviner.')}
        cols={[
          { k: 'name', label: tr('Nom affiché'), ph: tr('Chambre'), flex: .8 },
          { k: 'room', label: tr('Pièce'), ph: tr('Chambre'), flex: .7 },
          { k: 'haid', label: tr('Interrupteur'), ph: 'switch.… / climate.…', flex: 1.1, check: true },
          { k: 'tempCible', label: tr('Consigne'), ph: 'input_number.…', domain: 'input_number', flex: 1.1 },
          { k: 'modeEnt', label: tr('Mode'), ph: 'input_select.…', domain: 'input_select', flex: 1.1 },
          { k: 'autoEnt', label: tr('Auto'), ph: 'input_boolean.…', domain: 'input_boolean', flex: 1.1 },
          { k: 'tempSensor', label: tr('Température'), ph: 'sensor.…', domain: 'sensor', flex: 1.1 },
        ]}
        rows={ent.climate} onRows={entSet('climate')} check={check} />}
      {avecDistributeur && (
        <div style={{ borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', padding: '16px 0 4px' }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>{tr('Distributeur de croquettes')}</div>
          <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginBottom: 10 }}>{tr('Désignez l’appareil, ou le réservoir, la portion et, si besoin, le script qui distribue. Le planning se lit dans la fiche du distributeur.')}</div>
          <div className="grid-par-about" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 8 }}>
            {/* L'appareil (05/10, ADR 0155) : par la liste de Loggia, jamais un
              * <select> natif ; ceux qui savent distribuer en tête. Un appareil
              * qui n'est plus dans l'index reste choisi, sous son identifiant. */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: 'var(--o-text3)', marginBottom: 4 }}>{tr('Appareil').toUpperCase()}</div>
              <ListeChoix label={tr('Appareil')} value={ent.feeder.appareil || ''} onChange={val => majFeeder('appareil', val)}
                options={[{ id: '', label: tr('Aucun') }, ...(ent.feeder.appareil && !appareils.some(a => a.id === ent.feeder.appareil) ? [{ id: ent.feeder.appareil, label: ent.feeder.appareil }] : []), ...appareils]}
                style={{ ...entInp, minHeight: 37 }} />
            </div>
            {[['reservoir', tr('Réservoir'), 'input_number.…', 'input_number'],
              ['portionWeight', tr('Poids d’une portion'), 'number.…', 'number'],
              ['distribuees', tr('Distribué aujourd’hui'), facultatif('sensor.…'), 'sensor'],
              ['script', tr('Script de distribution'), facultatif('script.…'), 'script']].map(([k, l, ph, d]) => (
              <div key={k}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: 'var(--o-text3)', marginBottom: 4 }}>{l.toUpperCase()}</div>
                <ChampSuggere label={l} value={ent.feeder[k] || ''} onChange={val => majFeeder(k, val)} placeholder={ph} suggestions={k === 'script' ? suggestionsScript(sugg(d), candidats) : sugg(d)} style={entInp} />
              </div>
            ))}
          </div>
          {sansCommande && (
            <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginTop: 10 }}>
              {candidats.length
                ? tr('« Distribuer » demande l’appareil, ou le script qui distribue : désignez-le ci-dessus. Proposés d’après leur nom : {s}.', { s: nomsCandidats })
                : tr('« Distribuer » demande l’appareil, ou le script qui distribue : désignez-le ci-dessus.')}
            </div>
          )}
          <AncienneListeRepas hass={hass} />
        </div>
      )}
    </>
  );
}



// Quelles sections d'entités chaque vue intégrée peut éditer en place (crayon → sheet).
/** Une URL de notes de version, ou rien.
 *
 * `release_url` vient de l'entite `update.*`, donc de l'integration qui la
 * publie — pas de Loggia. React ne filtre pas le schema d'un `href` : une
 * integration tierce compromise pourrait y mettre `javascript:...`, et le
 * panneau n'etant pas en iframe isolee (`embed_iframe` vaut False), le clic
 * l'executerait dans l'origine du dashboard, avec l'objet `hass` authentifie
 * sous la main.
 *
 * Deux etapes seraient necessaires — une integration deja compromise, puis
 * un clic d'administrateur sur ce lien precis. Cela reste une porte, et la
 * fermer coute une ligne.
 */
function lienSur(url) {
  const u = String(url || '').trim();
  return /^https?:\/\//i.test(u) ? u : null;
}

/* Les vues du menu principal, hors Accueil — celles qui se masquent une par une
 * dans Paramètres › Vues. Une seule liste : le compteur du sommaire et l'onglet
 * comptaient chacun de leur côté, et le sommaire écrivait « 11 » en dur. */
const VUES_PRINCIPALES = ['pieces', 'scenes', 'objets', 'energie', 'securite', 'systeme'];

export const VIEW_ENT_SECTIONS = {
  accueil: ['rooms', 'weather', 'energy', 'people', 'cams'],
  // Le distributeur se designe dans Objets : c'est la que vivent sa carte et sa
  // fiche. La vue Croquettes, elle, a quitte le menu le 30/08 et le code le
  // 04/10 : ses repas s'activent dans la fiche du distributeur.
  objets: ['switches', 'medias', 'climate', 'feeder'],
  lumieres: ['switches'],
  energie: ['energy'],
  securite: ['alarm', 'cams'],
  medias: ['medias'],
  climat: ['climate'],
};



export function ViewEntSheet({ view, hass, onClose }) {
  const { ent, setEnt, entSet, saveEnt, dlists } = useEntConfig(hass);
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <NomFeuille><span style={{ flex: 1, minWidth: 0, fontSize: 19, fontWeight: 700 }}>{tr('Entités de cette vue')}</span></NomFeuille>
          <CroixFeuille />
        </div>
        <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginBottom: 14 }}>{tr('Autocomplétion en tapant. « Enregistrer » recharge le dashboard pour appliquer.')}</div>
        <EntSections ent={ent} setEnt={setEnt} entSet={entSet} dlists={dlists} only={VIEW_ENT_SECTIONS[view]} hass={hass} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={saveEnt} style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--o-accent-fond)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{tr('Enregistrer et recharger')}</button>
        </div>
      </>)}
    </BottomSheet>
  );
}

/* ── « Observer sans agir » (ADR 0004) ────────────────────────────────────────
 *
 * Chaque module qui commande quelque chose garde son drapeau côté serveur ;
 * l'interrupteur des Règles les lit ensemble et les pose ensemble. Le planning
 * de chauffe en est le cinquième (chantier Chauffage, plan 2, choix 16) : son
 * état rend le drapeau à la RACINE — cette réponse n'a pas de `config` —, sa
 * configuration le prend comme les autres.
 *
 * Un module MUET — sa lecture a échoué : la commande inconnue d'un Home
 * Assistant pas encore redémarré après la mise à jour (`unknown_command`), un
 * moteur absent (`not_available`) — vaut `undefined`. Il ne compte ni dans
 * l'état de l'interrupteur ni pour « tous », et la bascule ne lui écrit rien.
 * Jusqu'ici, un module muet empêchait « tous » d'être vrai, et la bascule
 * l'écrivait quand même : son échec s'affichait en rouge à chaque geste. Quand
 * personne ne répond, l'interrupteur attend, comme avant la première lecture.
 */

/** Les drapeaux lus : `true` ou `false` par module, `undefined` pour un module
 *  muet — ou `null` quand aucun n'a répondu. */
export function lireObservation(h) {
  const lire = (type, f) => h.callWS({ type }).then(r => f((r && r.config) || {})).catch(() => undefined);
  return Promise.all([
    lire('loggia/volets/etat', c => !!(c.simulation && c.simulation.actif)),
    lire('loggia/fenetres/etat', c => !!c.simulation),
    lire('loggia/presence/etat', c => !!(c.simulation && c.simulation.actif)),
    lire('loggia/nuit/etat', c => !!(c.simulation && c.simulation.actif)),
    // Un booléen, à la racine de l'état (`async_etat`, chauffage.py).
    h.callWS({ type: 'loggia/chauffage/etat' }).then(r => !!(r && r.simulation === true)).catch(() => undefined),
    // Le mode enfant (chantier Mode enfant, E11) : le sixième, son drapeau à la racine aussi (`async_etat`, enfant.py).
    h.callWS({ type: 'loggia/enfant/etat' }).then(r => !!(r && r.simulation === true)).catch(() => undefined),
    /* Les veilles (audit du 19/10, H3) : la VMC du CO₂ et la prise des heures creuses partaient même en observation. Leur drapeau
     * vit dans leur configuration, comme celui des volets. La sûreté (alertes.py), elle, n'en a pas : elle agit toujours. */
    lire('loggia/veilles/etat', c => !!(c.simulation && c.simulation.actif)),
  ]).then(([volets, fenetres, presence, nuit, chauffage, enfant, veilles]) => {
    const lus = { volets, fenetres, presence, nuit, chauffage, enfant, veilles };
    return Object.values(lus).some(v => typeof v === 'boolean') ? lus : null;
  });
}

/** Ce que l'interrupteur montre : les modules qui ont répondu (`lus`), ceux
 *  qui observent (`actifs`), et s'ils observent tous. */
export function etatObservation(observe) {
  const lus = observe ? Object.keys(observe).filter(k => typeof observe[k] === 'boolean') : [];
  const actifs = lus.filter(k => observe[k]);
  return { lus, actifs, tous: actifs.length > 0 && actifs.length === lus.length };
}

/** Les écritures d'une bascule vers `cible`, pour `bilanEcritures` : la clé
 *  que le module garde au magasin et sa promesse, pour chaque module LU — un
 *  module muet ne reçoit rien. Le planning de chauffe passe par
 *  `commanderChauffage` : l'état qu'il rend remplace aussitôt celui des cartes
 *  et de la fiche, qui ne proposent plus de reprise en main à un moteur qui
 *  observe (tâche 7), sans attendre leur sondage. */
export function ecrituresObservation(h, lus, cible) {
  const ecrire = {
    volets: ['loggia_volets', () => h.callWS({ type: 'loggia/volets/config', patch: { simulation: { actif: cible } } })],
    fenetres: ['loggia_fenetres', () => h.callWS({ type: 'loggia/fenetres/config', patch: { simulation: cible } })],
    presence: ['loggia_presence', () => h.callWS({ type: 'loggia/presence/config', patch: { simulation: { actif: cible } } })],
    nuit: ['loggia_nuit', () => h.callWS({ type: 'loggia/nuit/config', patch: { simulation: { actif: cible } } })],
    chauffage: ['loggia_chauffage', () => commanderChauffage(h, { type: 'loggia/chauffage/config', patch: { simulation: { actif: cible } } })],
    /* Le mode enfant (chantier Mode enfant, E11) : « Observer sans agir » vaut pour lui aussi — le journal note ce qui serait parti,
     * rien ne part. L'état rendu remplace celui des cartes et de la fiche (`poserEtatEnfant`), sans attendre leur sondage. */
    enfant: ['loggia_enfant', () => h.callWS({ type: 'loggia/enfant/config', patch: { simulation: { actif: cible } } }).then((r) => { if (r && r.etat) poserEtatEnfant(r.etat); return r; })],
    // Les veilles (audit du 19/10, H3) : le patch des volets, sous leur clé.
    veilles: ['loggia_veilles', () => h.callWS({ type: 'loggia/veilles/config', patch: { simulation: { actif: cible } } })],
  };
  return Object.keys(ecrire).filter(k => lus.includes(k)).map(k => [ecrire[k][0], ecrire[k][1]()]);
}

/* Le VRAI logo d'une mise à jour (27/10). « Je veux leur vraie icône, pas des
 * trucs inventés. » D'abord l'image que Home Assistant donne (`entity_picture`) ;
 * si elle manque ou ne charge pas — « Home Assistant Core » restait vide chez
 * lui —, le logo officiel de l'intégration qui publie la mise à jour, là où
 * l'interface de Home Assistant le prend (brands.home-assistant.io, `_/` = image
 * de remplacement si la marque n'en a pas). L'icône du groupe ne vient qu'en
 * dernier, quand aucune des deux ne charge. */
const logoMarque = (domaine) => (domaine && /^[a-z0-9_]+$/.test(domaine) ? 'https://brands.home-assistant.io/_/' + domaine + '/icon.png' : null);
function LogoMaj({ pic, plateforme, icone }) {
  const [ko, setKo] = useState([]);
  const src = [pic, logoMarque(plateforme)].find(u => u && ko.indexOf(u) < 0);
  if (!src) return <Fi i={icone} size={14} />;
  // `onError` n'est pas une interaction : c'est le repli quand l'image ne charge pas.
  // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
  return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={() => setKo(k => [...k, src])} />;
}

export function ParametresContent({ themeMode, loggiaTheme = '', haTheme, onMode, onPickTheme, onFollowHa, navbar = true, onToggleNavbar, wxFx = true, onToggleWxFx, ambient = 0, onAmbient, ambPlage = 'toujours', onAmbPlage, retourAcc = 0, onRetourAcc, navMargin = 0, navAuto = true, onNavOffset, onNavOffsetReset, onNavSet, onTopSet, look = LOOK_DEF, onLook, topMargin = 0, topAuto = true, onTopOffset, onTopOffsetReset, hass, users = [], userIdx = 0, isAdmin: profilAdmin = false, onAddUser, onUpdateUser, onDeleteUser, customViews = [], onSaveCustomViews, onNav = null, droits = [] }) {
  /* La section ouverte survit au rechargement, comme la vue elle-meme.
   *
   * Changer de langue recharge la page : on revenait au sommaire des sections,
   * alors qu'on venait de regler quelque chose dans Apparence. Retrouver la vue
   * Parametres ne suffisait pas — il fallait rouvrir la section a la main.
   *
   * `hub` reste le point de depart d'un onglet neuf : la memoire est propre a
   * la session, et on n'ouvre pas Loggia le lendemain au milieu d'un reglage.
   * Quitter les Parametres pour une autre vue l'efface aussi (08/11, App.jsx) :
   * on y revient par `hub`, au telephone par Apparence. */
  // La taille du texte de CET écran (07/11, étape 10 ; tailletexte.js).
  const [tailleTexte, poserTailleTexte] = useTailleTexte();
  const cransTexte = [['normal', tr('Normale')], ['grand', tr('Grande')]];
  const [tabEtat, setTab] = useState(() => {
    try { return window.sessionStorage.getItem('loggia-par-section') || 'hub'; } catch { return 'hub'; }
  });
  useEffect(() => {
    try { window.sessionStorage.setItem('loggia-par-section', tabEtat); } catch { /* stockage indisponible */ }
  }, [tabEtat]);
  // Le rail des sections : écran large seulement ; plus étroit au doigt (maquette v3).
  const avecRail = useWide(1024);
  const railEtroit = useCoarse();
  /* Au téléphone, pas de sommaire ni de bouton retour (maquette v4) : des
   * onglets en puces, et la page s'ouvre sur Apparence. */
  const tab = !avecRail && tabEtat === 'hub' ? 'apparence' : tabEtat;
  /* Le focus suit la section (audit du 03/10). La tuile du sommaire et le
   * retour « ‹ Paramètres » disparaissent avec l'écran qu'ils quittent : le
   * focus tombait sur <body>, et la tabulation repartait du haut de la page.
   * À l'entrée dans une section, son titre le reçoit ; au retour au sommaire,
   * la tuile d'où l'on venait — on reprend la lecture là où on l'avait
   * laissée, au lieu de recompter les tuiles depuis la première. Même règle
   * que pour les vues (App.jsx) : seulement si le focus est tombé, et jamais
   * au montage — la section retrouvée après un rechargement ne vole rien.
   * La tuile se retrouve en COMPARANT son attribut, sans fabriquer de
   * sélecteur : la section d'où l'on vient peut sortir de la session, et un
   * nom inattendu (une apostrophe, un guillemet) ferait lever querySelector
   * au milieu d'un effet. */
  const racineRef = useRef(null);
  const tabFocus = useRef(tab);
  useEffect(() => {
    const avant = tabFocus.current;
    if (avant === tab) return undefined;
    tabFocus.current = tab;
    return reposerFocus(() => {
      const r = racineRef.current;
      if (!r) return null;
      const tuile = tab === 'hub' ? Array.from(r.querySelectorAll('[data-section]')).find(b => b.getAttribute('data-section') === avant) : null;
      return tuile || r.querySelector('h1');
      // `voir` dans les deux sens : le titre d'une section ouverte depuis le
      // bas du sommaire restait, lui aussi, au-dessus de l'écran.
    }, { voir: true });
  }, [tab]);
  // Une vue que l'installation ne peut pas remplir se montre ici verrouillée,
  // avec son motif : mieux vaut expliquer que faire disparaître sans un mot.
  const { views: availViews } = useLoggia();
  // Loggia est-il la page ouverte au démarrage, sur ce compte ?
  // true = oui · false = non · null = impossible à savoir (page parente
  // inaccessible, ou Home Assistant qui ne répond pas).
  const [accueilDefaut, setAccueilDefaut] = useState(null);
  useEffect(() => {
    let vivant = true;
    const chemin = cheminPanneau();
    if (!chemin) { setAccueilDefaut(null); return undefined; }
    lirePageAccueil(hass).then(actuel => { if (vivant) setAccueilDefaut(actuel === chemin); });
    return () => { vivant = false; };
  }, [hass]);
  const mettreEnAccueil = () => {
    const chemin = cheminPanneau();
    if (!chemin) return;
    definirPageAccueil(hass, chemin).then(ok => setAccueilDefaut(ok ? true : false));
  };
  // Connexion : latence mesurée sur l'API (design Claude Design 21/08)
  const [lat, setLat] = useState(null); // null = pas mesurée, -1 = échec, n = ms
  const [, setLatBusy] = useState(false);
  const ping = () => {
    if (!hass || !hass.callApi) { setLat(-1); return; }
    setLatBusy(true); const t0 = performance.now();
    hass.callApi('GET', 'config').then(() => { setLat(Math.round(performance.now() - t0)); setLatBusy(false); }).catch(() => { setLat(-1); setLatBusy(false); });
  };
  useEffect(() => { if (tab === 'connexion' && lat == null) ping(); }, [tab]);
  const accessOrigin = (() => { try { return (window.top && window.top.location.origin) || window.location.origin; } catch { return window.location.origin; } })();
  const accessKind = /nabu\.casa/.test(accessOrigin) ? 'Nabu Casa' : /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|localhost|127\.)/.test(accessOrigin) ? tr('réseau local') : tr('accès distant');
  // « accès distant » passe par `tr` comme « réseau local » (audit du 03/10) :
  // il s'affichait en français sous « Connexion HA ».
  // Adresses du serveur : locales a cet appareil. Loggia n'ouvre PAS de session par ces URL
  // (il emprunte celle du navigateur) — elles servent au test de joignabilite, au repli
  // Nabu Casa et a l'intervalle de rafraichissement du pont hass.
  /* L'assistant : une entité de conversation, choisie dans la liste de celles
   * que la maison publie.
   *
   * C'était un champ où taper le nom d'un composant. On se trompait d'une
   * lettre, on oubliait d'appuyer sur Entrée, et rien ne le signalait. Le
   * choix s'enregistre maintenant au toucher — et « Aucun » efface la clé au
   * lieu d'écrire une chaîne vide.
   *
   * L'ancienne forme du réglage, un nom de composant, reste affichée tant
   * qu'elle ne correspond à aucune entité : un réglage qui marche ne
   * disparaît pas de l'écran parce que l'écran a changé. */
  const [assistantVu, setAssistantVu] = useState(null);
  const assistantChoix = assistantVu != null ? assistantVu : (entiteChoisie(hass) || choixAssistant());
  const assistantOpts = [['', tr('Aucun')], ...conversationsDe(hass).map((c) => [c.id, c.nom])];
  if (assistantChoix && !assistantOpts.some(([v]) => v === assistantChoix)) assistantOpts.push([assistantChoix, assistantChoix]);
  const choisirAssistant = (v) => {
    setAssistantVu(v);
    cfgSet({ loggia_assistant: v || null });
  };
  const [haDraft, setHaDraft] = useState(() => {
    const c = { ...HA_CFG_DEF, ...(cfgVal('loggia_haCfg', null) || {}) };
    if (!c.local && accessKind === tr('réseau local')) c.local = accessOrigin;
    if (!c.remote && accessKind === 'Nabu Casa') c.remote = accessOrigin;
    return c;
  });
  const [urlTest, setUrlTest] = useState({});
  const [themeTab, setThemeTab] = useState(() => (['', 'atrium', 'ios', 'google', 'neumorphix'].indexOf(loggiaTheme || '') >= 0 ? 'natifs' : 'commu'));
  const writeHaCfg = (c) => { try { localStorage.setItem('loggia_haCfg', JSON.stringify(c)); } catch {} };
  const toggleFallback = () => setHaDraft(d => { const n = { ...d, fallback: !d.fallback }; writeHaCfg(n); return n; });
  const testUrl = (key) => {
    const raw = (haDraft[key] || '').trim().replace(/\/+$/, '');
    const set = (o) => setUrlTest(t => ({ ...t, [key]: { ...o, ts: Date.now() } }));
    if (!raw) { set({ ms: -1, msg: tr('Adresse vide') }); return; }
    if (!/^https?:\/\//.test(raw)) { set({ ms: -1, msg: tr('Doit commencer par http:// ou https://') }); return; }
    setUrlTest(t => ({ ...t, [key]: { busy: true } }));
    if (raw === accessOrigin && hass && hass.callApi) { // acces courant : vrai appel API
      const t0 = performance.now();
      hass.callApi('GET', 'config').then(() => set({ ms: Math.round(performance.now() - t0) })).catch(() => set({ ms: -1, msg: tr('L’API ne répond pas') }));
      return;
    }
    if (window.location.protocol === 'https:' && raw.indexOf('http://') === 0) { set({ ms: -1, msg: tr('Bloqué : page HTTPS, adresse HTTP (contenu mixte)') }); return; }
    const t0 = performance.now();
    const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const to = setTimeout(() => { try { if (ctl) ctl.abort(); } catch {} }, 2500);
    // no-cors : reponse opaque, on ne lit pas le corps — on mesure la JOIGNABILITE.
    fetch(raw + '/manifest.json', { mode: 'no-cors', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(() => { clearTimeout(to); set({ ms: Math.round(performance.now() - t0) }); })
      .catch(() => { clearTimeout(to); set({ ms: -1, msg: tr('Injoignable depuis ce réseau') }); });
  };
  const saveHaCfg = () => { writeHaCfg(haDraft); location.reload(); };
  const resetHaCfg = () => {
    setHaDraft({ ...HA_CFG_DEF, local: accessKind === tr('réseau local') ? accessOrigin : '', remote: accessKind === 'Nabu Casa' ? accessOrigin : '' });
    setUrlTest({});
  };
  const POLL_CHOICES = [[2000, '2 s'], [5000, '5 s'], [10000, '10 s'], [30000, '30 s']];
  // Le resultat d'un test d'adresse, court : « ✓ 18 ms », ou ce qui a manque.
  const resultatTest = (key) => {
    const r = urlTest[key];
    if (!r) return null;
    if (r.busy) return <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>{tr('Test…')}</span>;
    if (r.ms >= 0) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: 'var(--o-ok)', whiteSpace: 'nowrap' }}><Fi i="check" size={12} color="var(--o-ok)" />{r.ms} ms</span>;
    return <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-bad)' }}>{r.msg || tr('Échec')}</span>;
  };
  const [autoQ, setAutoQ] = useState('');
  const [autoFilter, setAutoFilter] = useState('all'); // all | on | off
  const [autoOpen, setAutoOpen] = useState({});
  // Mises à jour : « Tout installer » (confirmation 2 temps) + revérification
  const [updAllConfirm, setUpdAllConfirm] = useState(false);
  // Quand a-t-on demande a Home Assistant de reverifier ? Par appareil : c'est
  // ce navigateur qui a appuye, rien de plus.
  const [majVerifie, setMajVerifie] = useState(() => { try { return Number(localStorage.getItem('loggia-maj-verifie')) || 0; } catch { return 0; } });
  // Utilisateurs : dernière activité par profil (posée par applyUser)
  const lastSeen = (() => { try { return JSON.parse(localStorage.getItem('loggia-lastseen') || '{}'); } catch { return {}; } })();
  const seenRel = (name, isCur) => {
    if (isCur) return tr('actif maintenant');
    const t = lastSeen[name]; if (!t) return '';
    const m = (Date.now() - t) / 60000;
    /* `tr` et non `trN` : la minute, l'heure et le jour s'ecrivent en abrege,
     * et un abrege ne se decline pas — « 2 min », « 5 min ». */
    if (m < 60) return tr('vu il y a {n} min', { n: Math.max(1, Math.round(m)) });
    if (m < 1440) return tr('vu il y a {n} h', { n: Math.round(m / 60) });
    if (m < 2880) return tr('vu hier');
    return tr('vu il y a {n} j', { n: Math.round(m / 1440) });
  };
  const [editing, setEditing] = useState(null); // { i, u } pour éditer, { i:null } pour ajouter
  // Signature des états automation.* : relance la purge des mises à jour (plus bas).
  const autoSig = (hass && hass.states) ? Object.keys(hass.states).filter(e => e.indexOf('automation.') === 0).map(id => id + ':' + hass.states[id].state).join('|') : '';
  /* Automatisations : id → demande (`demandeCle`), par le filet commun (lot 15
   * de l'audit du 03/10). La purge faite main ne retirait une entrée que si HA
   * CONFIRMAIT : une automatisation qu'il refusait de couper restait
   * « coupée » tant qu'on ne quittait pas Paramètres. La réponse se lit par
   * automatisation (`enVol`), sinon la réponse de l'une jetterait la
   * demande encore en vol de l'autre ; et chaque demande a sa propre
   * échéance (`useDemandes`, relecture du lot 15) : basculer d'autres
   * lignes ne prolonge plus un refus. */
  const [autoOv, demanderAuto] = useDemandes();
  const autoCall = (svc, id) => commanderService(hass, id, 'automation', svc, { entity_id: id });
  const [cvEditing, setCvEditing] = useState(null); // null | 'new' | objet vue custom
  // Veille : diaporama photos + réveil caméra — par appareil, lus par AmbientOverlay au montage.
  // Aperçu du nouvel accueil : par appareil, réversible — l'ancien reste le défaut.
  /* « Ciel animé » (handoff du 17/10) : la qualité du ciel de l'Accueil sur
   * CET appareil. « Auto » dit ce que l'appareil a retenu, mesuré par le ciel
   * lui-même (« ici : léger »). */
  const [qualiteCiel, setQualiteCiel] = useState(lireQualiteCiel);
  const choisirQualiteCiel = (q) => { ecrireQualiteCiel(q); setQualiteCiel(q); };
  const ciIci = niveauCielIci();
  const descCiel = qualiteCiel === 'leger' ? tr('30 images par seconde, nuages moins détaillés, moitié moins de pluie')
    : qualiteCiel === 'fixe' ? tr('Une image recalculée toutes les 2 minutes, sans animation')
      : ciIci === 'plein' ? tr('Suit la fluidité de l’appareil · ici : plein')
        : ciIci === 'leger' ? tr('Suit la fluidité de l’appareil · ici : léger')
          : ciIci === 'fixe' ? tr('Suit la fluidité de l’appareil · ici : fixe')
            : tr('Suit la fluidité de l’appareil');
  /* « Verre des cartes » (ADR 0284) : le même verre, au coût de CET appareil.
   * « Auto » suit la mesure du ciel — plein donne Plein, léger ou fixe donnent
   * Léger ; sans mesure en cours, Plein, comme avant. */
  const [verre, setVerre] = useState(lireVerre);
  const choisirVerre = (q) => { ecrireVerre(q); setVerre(q); };
  const veIci = verreMesure();
  const descVerre = verre === 'plein' ? tr('Flou calculé en direct derrière chaque carte')
    : verre === 'leger' ? tr('Fond flouté une seule fois, pour les tablettes anciennes')
      : veIci === 'plein' ? tr('Suit la fluidité de l’appareil · ici : plein')
        : veIci === 'leger' ? tr('Suit la fluidité de l’appareil · ici : léger')
          : tr('Suit la fluidité de l’appareil');
  /* « Nuit de l'écran » (ADR 0287) : sur CET appareil, du coucher au lever. */
  const [nuit, setNuit] = useState(lireNuit);
  const [assombrir, setAssombrir] = useState(lireAssombrir);
  const choisirNuit = (q) => { ecrireNuit(q); setNuit(q); };
  const choisirAssombrir = (q) => { ecrireAssombrir(q); setAssombrir(q); };
  const [ambPhotos, setAmbPhotos] = useState(() => { try { return localStorage.getItem('loggia-ambphotos') === '1'; } catch { return false; } });
  const toggleAmbPhotos = () => setAmbPhotos(v => { const n = !v; try { localStorage.setItem('loggia-ambphotos', n ? '1' : '0'); } catch {} return n; });
  const [ambMotion, setAmbMotion] = useState(() => { try { return localStorage.getItem('loggia-ambmotion') === '1'; } catch { return false; } });
  const toggleAmbMotion = () => setAmbMotion(v => { const n = !v; try { localStorage.setItem('loggia-ambmotion', n ? '1' : '0'); } catch {} return n; });
  // La caméra en grand quand on sonne (ADR 0312) : par écran, décochée par défaut ; proposée seulement s'il y a une sonnette à caméra.
  const [camSonnette, setCamSonnette] = useState(sonnetteEnGrand);
  const toggleCamSonnette = () => setCamSonnette(v => { const n = !v; try { localStorage.setItem(CLE_SONNETTE_GRAND, n ? '1' : '0'); } catch {} return n; });
  const aSonnette = evenementsPorte(LOGGIA_INDEX).some(e => e.genre === 'sonnette' && e.camera);
  // ── Mises à jour (entités update.*) : install avec confirmation 2 temps, skip, progression ──
  const [updConfirm, setUpdConfirm] = useState(null); // id en attente de confirmation
  const [updBusy, setUpdBusy] = useState({}); // id → timestamp : « Installation… » optimiste dès le clic (HA met du temps à passer in_progress)
  const updTimer = useRef(null);
  useEffect(() => () => clearTimeout(updTimer.current), []);
  const updCall = (svc, id) => commanderService(hass, id, 'update', svc, { entity_id: id });
  const askInstall = (u) => {
    if (updConfirm === u.id) { setUpdConfirm(null); clearTimeout(updTimer.current); setUpdBusy(b => ({ ...b, [u.id]: Date.now() })); updCall('install', u.id); return; }
    setUpdConfirm(u.id); clearTimeout(updTimer.current); updTimer.current = setTimeout(() => setUpdConfirm(null), 4000);
  };
  const upsAll = (hass && hass.states) ? Object.keys(hass.states).filter(e => e.indexOf('update.') === 0).map(id => {
    const s = hass.states[id], at = s.attributes || {};
    let prog = at.in_progress === true ? (at.update_percentage != null ? at.update_percentage : true) : (typeof at.in_progress === 'number' ? at.in_progress : false);
    // optimiste : « Installation… » dès le clic, tant que HA n'a pas confirmé (filet 3 min)
    if (prog === false && updBusy[id] && Date.now() - updBusy[id] < 180000 && s.state === 'on') prog = true;
    // « Home Assistant Core Update » : le mot de la fin ne dit rien de plus
    // que la section ou il s'affiche.
    const nom = String(at.friendly_name || at.title || id.replace('update.', '').replace(/_/g, ' ')).replace(/\s+(update|mise à jour)$/i, '');
    return { id, name: nom, avail: s.state === 'on', installed: at.installed_version, latest: at.latest_version, prog, pic: at.entity_picture, plateforme: plateformeDe(id), notes: lienSur(at.release_url) };
  }) : [];
  // purge l'optimiste dès que HA prend le relais (in_progress réel) ou que la MàJ est terminée (state off)
  const connecte = !!hass;
  /* LE COMPTE, PAS SEULEMENT LE PROFIL (03/10). Un profil Admin de Loggia se
   * choisit au code depuis n'importe quel compte, et c'est celui d'une
   * installation neuve. Or ce qu'il garde ici — profils, code administrateur,
   * vues perso, import, remise a zero — ecrit la configuration de la maison,
   * que le composant reserve aux administrateurs Home Assistant. Un compte
   * ordinaire ne voit donc pas ces gestes, meme sous le profil Admin : il ne
   * pourrait jamais les enregistrer. Pour un administrateur, rien ne change.
   * Les sections qu'ouvre un DROIT (Regles, Interrupteurs, Alertes) restent :
   * l'editeur de profil previent en l'accordant, et leur refus se dit
   * (`DROITS_ADMIN_HA`). */
  const ordinaire = compteOrdinaire(hass);
  const isAdmin = profilAdmin && !ordinaire;
  /* Ce que ce profil a le droit d'ouvrir. `droits` arrive deja complet pour
   * un administrateur ; le `isAdmin ||` est la ceinture, pas la bretelle. */
  const aD = (id) => isAdmin || droits.indexOf(id) >= 0;
  // Nommes : un sondage qui ne sert a personne ne doit pas partir, et une
  // expression dans un tableau de dependances cesse d'etre verifiee.
  const peutInter = aD('inter');
  const peutRegles = aD('regles');
  const upsSig = upsAll.map(u => u.id + ':' + u.avail + ':' + String(u.prog)).join('|');
  useEffect(() => {
    const ids = Object.keys(updBusy); if (!ids.length || !hass || !hass.states) return;
    const done = ids.filter(id => { const s = hass.states[id]; if (!s) return true; const at = s.attributes || {}; return s.state !== 'on' || at.in_progress === true || typeof at.in_progress === 'number'; });
    if (done.length) setUpdBusy(b => { const n = { ...b }; done.forEach(id => delete n[id]); return n; });
  }, [autoSig, upsSig]);
  // on n'affiche QUE les mises à jour disponibles ou en cours — celles déjà faites n'encombrent pas la liste
  const ups = upsAll.filter(u => u.avail || u.prog !== false).sort((a, b) => comparerTextes(a.name, b.name));
  const upsAvail = ups.filter(u => u.avail).length;
  const upsTotal = upsAll.length;
  const toggleAuto = (a) => { const s = hass.states[a.id]; demanderAuto(a.id, !a.on, s, s && s.state === 'on'); autoCall(a.on ? 'turn_off' : 'turn_on', a.id); };
  const runAuto = (a) => autoCall('trigger', a.id);
  const depuisMin = (m) => m < 1 ? tr('à l’instant') : m < 60 ? tr('il y a {n} min', { n: Math.round(m) }) : m < 1440 ? tr('il y a {n} h', { n: Math.round(m / 60) }) : tr('il y a {n} j', { n: Math.round(m / 1440) });
  const autoRel = (t) => { try { if (!t) return ''; const ms = new Date(t).getTime(); return Number.isFinite(ms) ? depuisMin((Date.now() - ms) / 60000) : ''; } catch { return ''; } };
  const autos = (hass && hass.states) ? Object.keys(hass.states).filter(e => e.indexOf('automation.') === 0).map(id => { const s = hass.states[id], at = s.attributes || {}; return { id, name: at.friendly_name || id.replace('automation.', '').replace(/_/g, ' '), on: enVol(autoOv, id, s, s.state === 'on'), last: at.last_triggered }; }).sort((a, b) => comparerTextes(a.name, b.name)) : [];

  // Combien de boutons sont deja regles : le chiffre du sommaire. Lu une
  // fois a l'ouverture — la section, elle, sonde en continu quand on y est.
  const [nbInter, setNbInter] = useState(0);
  // Telecommandes et gestes : l'en-tete de la section, tenu a jour par elle.
  const [compteInter, setCompteInter] = useState(null);
  const surCompteInter = (c) => { setCompteInter(c); setNbInter(c.gestes); };
  useEffect(() => {
    const h = hass;
    if (!peutInter || !h || typeof h.callWS !== 'function') return;
    h.callWS({ type: 'loggia/interrupteurs/etat' })
      .then(r => {
        setNbInter(gestesRegles(r && r.affectations));
        setCompteInter({ telecommandes: appareilsVisibles(r && r.appareils, !!(r && r.ecoute && r.ecoute.active)).length, gestes: gestesRegles(r && r.affectations) });
      })
      .catch(() => { /* composant trop ancien, ou ecoute absente */ });
  }, [connecte, peutInter]);

  // Combien de regles tournent, volets et chauffage confondus : le chiffre du
  // sommaire. Les deux commandes sont demandees ensemble, et l'absence de
  // l'une n'empeche pas de compter l'autre.
  const [nbVolRegles, setNbVolRegles] = useState(0);
  const [ongletRegle, setOngletRegle] = useState('volets');
  /* LA RECHERCHE DES RÉGLAGES (07/11, usage étape 12 ; reglagesindex.js). Un réglage choisi ouvre sa section — et
   * l'onglet des Règles, et « Avancé », quand il y vit —, puis sa rangée se cherche dans le contenu et s'allume. Le
   * contenu se monte au rendu suivant : on la cherche quelques fois, puis on se contente du haut de la section. */
  const [avance, setAvance] = useState(false);
  const [rechercheReglage, setRechercheReglage] = useState('');
  const [cibleReglage, setCibleReglage] = useState(null);
  const contenuRef = useRef(null);
  const allerAuReglage = useCallback((id) => {
    const s = sectionDe(id);
    if (!s) return;
    const e = REGLAGE_PAR_ID[id] || null;
    setTab(s);
    if (e && e.o) setOngletRegle(e.o);
    if (e && e.a) setAvance(true);
    setCibleReglage({ id, n: Date.now() });
  }, []);
  useEffect(() => {
    if (!cibleReglage) return undefined;
    const e = REGLAGE_PAR_ID[cibleReglage.id] || null;
    let essais = 0;
    let t = null;
    const chercher = () => {
      const el = e ? trouverRangee(contenuRef.current, e) : null;
      if (el || !e || essais >= 12) {
        if (el) montrerRangee(el);
        else if (contenuRef.current) { try { contenuRef.current.scrollIntoView({ block: 'start' }); } catch { /* un vieux moteur */ } }
        setCibleReglage(null);
        return;
      }
      essais += 1;
      t = setTimeout(chercher, 120);
    };
    t = setTimeout(chercher, 60);
    return () => clearTimeout(t);
  }, [cibleReglage, tab, ongletRegle, avance]);
  // Ctrl+K y mène d'ailleurs (`demanderReglage`) : à l'ouverture des Paramètres, ou quand ils sont déjà ouverts.
  useEffect(() => {
    const lire = () => {
      let id = null;
      let s = null;
      try {
        id = window.sessionStorage.getItem('loggia-par-reglage');
        window.sessionStorage.removeItem('loggia-par-reglage');
        s = window.sessionStorage.getItem('loggia-par-section');
      } catch { /* stockage indisponible */ }
      if (id) allerAuReglage(id); else if (s && s !== 'hub') setTab(s);
    };
    lire();
    window.addEventListener('loggia-par-reglage', lire);
    return () => window.removeEventListener('loggia-par-reglage', lire);
  }, [allerAuReglage]);
  /* Observer sans agir : UN interrupteur pour les modules qui commandent
   * quelque chose — volets, chauffage, depart, nuit (maquettes du 18/09), et
   * le planning de chauffe (plan 2 du chantier Chauffage). Chaque module garde
   * son propre drapeau cote serveur ; ici on les lit ensemble et on les pose
   * ensemble (`lireObservation`, `ecrituresObservation`). `null` : pas encore
   * lus, ou personne n'a repondu. */
  const [observe, setObserve] = useState(null);
  /* Ce que la dernière bascule n'a pas pu poser, nommé — '' si tout a pris
   * (audit du 03/10). Effacé à la bascule suivante. */
  const [obsRefus, setObsRefus] = useState('');
  const lireObserve = () => {
    const h = hass;
    if (!h || typeof h.callWS !== 'function') return;
    lireObservation(h).then(setObserve);
  };
  useEffect(() => {
    if (tab !== 'regles' || !peutRegles) return undefined;
    lireObserve();
    // Un module change aussi depuis ailleurs : on relit comme ses vues.
    const iv = setInterval(lireObserve, 5000);
    return () => clearInterval(iv);
  }, [tab, connecte, peutRegles]);
  const basculerObserve = async () => {
    const h = hass;
    if (!h || typeof h.callWS !== 'function' || !observe) return;
    // Seuls les modules qui ont répondu basculent : un module muet ne compte
    // pas, et ne reçoit rien (plan 2 du chantier Chauffage, choix 16).
    const { lus, actifs } = etatObservation(observe);
    const cible = !actifs.length;
    setObserve({ ...observe, ...Object.fromEntries(lus.map(k => [k, cible])) });
    setObsRefus('');
    /* Les refus ne s'avalent plus (audit du 03/10). L'ancien filet jetait
     * chaque rejet : sous un compte Home Assistant ordinaire, les commandes
     * des modules sont réservées aux administrateurs (`require_admin`) — même
     * pour un profil qui a reçu « Règles » —, la bascule revenait en arrière à
     * la relecture et rien ne disait pourquoi. `require_admin` ne nomme rien :
     * chaque écriture porte la clé qu'elle touche (`ecrituresObservation`), et
     * le bilan nomme celles qui n'ont pas pris. */
    setObsRefus(await bilanEcritures(ecrituresObservation(h, lus, cible)));
    lireObserve();
  };
  useEffect(() => {
    const h = hass;
    if (!peutRegles || !h || typeof h.callWS !== 'function') return undefined;
    // Cinq reponses en vol : une relance de l'effet ne doit pas laisser les
    // anciennes ecraser le nouveau total (audit 18/09).
    let vivant = true;
    let n = 0;
    const compter = () => { if (vivant) setNbVolRegles(n); };
    h.callWS({ type: 'loggia/volets/etat' })
      .then(r => {
        const c = (r && r.config) || {};
        n += ['planning', 'soleil', 'vent', 'baies'].filter(k => c[k] && c[k].actif).length;
        compter();
      })
      .catch(() => { /* composant trop ancien, ou regles absentes */ });
    h.callWS({ type: 'loggia/fenetres/etat' })
      .then(r => { if (r && r.config && r.config.actif) { n += 1; compter(); } })
      .catch(() => { /* idem */ });
    h.callWS({ type: 'loggia/presence/etat' })
      .then(r => { if (r && r.config && r.config.actif) { n += 1; compter(); } })
      .catch(() => { /* idem */ });
    h.callWS({ type: 'loggia/nuit/etat' })
      .then(r => {
        const c = (r && r.config) || {};
        n += ['veilleuse', 'coucher', 'eclairage'].filter(k => c[k] && c[k].actif).length;
        compter();
      })
      .catch(() => { /* idem */ });
    h.callWS({ type: 'loggia/veilles/etat' })
      .then(r => {
        const c = (r && r.config) || {};
        n += ['co2', 'batterie', 'creuses'].filter(k => c[k] && c[k].actif).length;
        compter();
      })
      .catch(() => { /* idem */ });
    return () => { vivant = false; };
  }, [connecte, peutRegles]);

  // Sections du sommaire : chiffre mis en avant + accroche.
  const SECTIONS = [
    { id: 'users', name: tr('Profils'), ico: 'users', col: 'var(--o-accent-soft)', bg: 'rgba(var(--o-accent-rgb),.14)',
      sub: (users[userIdx] || {}).name ? nomProfil((users[userIdx] || {}).name) + ' · ' + tr(String((users[userIdx] || {}).role || '')).toLowerCase() : tr('Profils locaux et code admin'),
      big: String(users.length), unit: tr('profils du foyer'), admin: false },
    { id: 'apparence', name: tr('Apparence'), ico: 'palette', col: 'var(--o-purple)', bg: 'rgba(var(--o-purple-rgb),.14)',
      sub: tr('Thème, mode, effets'), big: (PRESET_META().find(x => x.id === loggiaTheme) || PRESET_META()[0]).name, unit: tr('{n} thèmes', { n: PRESET_META().length }), admin: false, small: true },
    { id: 'connexion', name: tr('Connexion HA'), long: tr('Connexion à Home Assistant'), ico: 'link', col: 'var(--o-ok)', bg: 'rgba(var(--o-ok-rgb),.14)',
      sub: accessKind, pageSub: tr('Session empruntée au navigateur') + ' · ' + accessKind, big: (lat != null && lat >= 0) ? lat + ' ms' : (hass ? tr('active') : tr('hors ligne')), unit: hass ? tr('session active') : tr('session absente'), admin: false, small: true },
    { id: 'auto', name: tr('Automatisations'), ico: 'bolt', col: 'var(--o-warn)', bg: 'rgba(var(--o-warn-rgb),.14)',
      sub: tr('Gérées dans Home Assistant'), big: String(autos.filter(a => a.on).length), unit: tr('actives sur {n}', { n: autos.length }), admin: true },
    { id: 'alertes', name: tr('Alertes'), ico: 'bell', col: 'var(--o-bad)', bg: 'rgba(var(--o-bad-rgb),.14)',
      sub: tr('Sûreté poussée sur téléphone'), big: tr('notify'), unit: tr('via app compagnon'), admin: true, small: true },
    { id: 'maj', name: tr('Mises à jour'), ico: 'refresh', col: 'var(--o-warn2)', bg: 'rgba(var(--o-warn2-rgb),.14)',
      sub: upsAvail ? tr('Firmwares et modules') : tr('Tout est à jour'), big: String(upsAvail || 0), unit: upsAvail ? tr('en attente') : tr('à jour'), admin: true, dot: upsAvail > 0 },
    { id: 'inter', name: tr('Interrupteurs'), ico: 'apps', col: 'var(--o-purple)', bg: 'rgba(var(--o-purple-rgb),.14)',
      sub: tr('Boutons sans fil Zigbee'), big: String(nbInter), unit: nbInter ? tr('réglés') : tr('à régler'), admin: true },
    { id: 'regles', name: tr('Règles'), ico: 'bolt', col: 'var(--o-cyan)', bg: 'rgba(var(--o-cyan-rgb),.14)',
      sub: tr('Ce que Loggia fait tout seul'), big: String(nbVolRegles), unit: nbVolRegles ? tr('règles actives') : tr('à régler'), admin: true },
    { id: 'vues', name: tr('Vues'), ico: 'layout-fluid', col: 'var(--o-cyan)', bg: 'rgba(var(--o-cyan-rgb),.14)',
      // Compté, plus écrit en dur : « 11 + les vues perso » était juste le jour
      // où on l'a tapé, et se serait démenti à la vue suivante (plan, M4).
      sub: tr('Menu latéral et vues perso'), big: String(1 + VUES_PRINCIPALES.length + HIDDEN_VIEWS().length + customViews.length), unit: tr('vues disponibles'), admin: true },
    /* Les écrans de la maison, et la mise en page de celui-ci (ADR 0222) :
     * ouverte à tous — chacun règle SON écran. */
    { id: 'appareils', name: tr('Appareils'), ico: 'screen', col: 'var(--o-accent-soft)', bg: 'rgba(var(--o-accent-rgb),.14)',
      sub: tr('Cet écran et sa mise en page'), big: String(Math.max(1, Object.keys(appareilsConnus()).length)), unit: tr('écrans connus'), admin: false, small: true },
    { id: 'about', name: tr('À propos'), ico: 'info', col: 'var(--o-text2)', bg: 'var(--o-s1)',
      sub: tr('React + Vite · servi par l’intégration'),
      big: (LOGGIA_INDEX && LOGGIA_INDEX.componentVersion) ? 'v' + LOGGIA_INDEX.componentVersion : '—',
      unit: tr('version installée'), admin: false, small: true },
  ].filter(x => !x.admin || aD(x.id));
  // Interrupteur du bandeau (Tgl n'existe que dans la portée d'Apparence)
  const curSection = SECTIONS.find(x => x.id === tab);
  /* Le champ « Rechercher un réglage » : les menus de la maison (`ChampSuggere`), les réglages groupés par section,
   * ceux des seules sections que ce profil ouvre. Choisir y mène ; le champ se vide et rend le focus. */
  const optionsRecherche = optionsReglages(SECTIONS.map(x => x.id));
  const champReglage = (style) => (
    <div style={{ position: 'relative', minWidth: 0, ...style }}>
      <span aria-hidden="true" style={{ position: 'absolute', left: 12, top: 19, transform: 'translateY(-50%)', display: 'inline-flex', pointerEvents: 'none' }}><Fi i="search" size={13} color="var(--o-text3)" /></span>
      <ChampSuggere value={rechercheReglage} label={tr('Rechercher un réglage')} placeholder={tr('Rechercher un réglage')} suggestions={optionsRecherche}
        onChange={(v) => {
          if (!sectionDe(v)) { setRechercheReglage(v); return; }
          setRechercheReglage('');
          try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch { /* rien */ }
          allerAuReglage(v);
        }}
        style={{ width: '100%', boxSizing: 'border-box', height: 38, padding: '0 12px 0 32px', borderRadius: 11, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s1)', color: 'var(--o-text)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }} />
      {rechercheReglage.trim() && !filtrerChoix(optionsRecherche, rechercheReglage).length && (
        <div role="status" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', marginTop: 6, padding: '0 4px' }}>{tr('Aucun résultat pour « {q} »', { q: rechercheReglage.trim() })}</div>
      )}
    </div>
  );
  /* L'en-tete d'une section : ce qu'elle compte, et ses actions a droite
   * (maquettes du 18/09). Chaque section le dit a sa facon ; par defaut, sa
   * phrase du sommaire. */
  const enTete = (() => {
    if (tab === 'users') return {
      sous: tr('Ceux qui vivent ici. Un profil suit la personne, sur tous ses écrans.'),
      droite: null,
    };
    if (tab === 'appareils') return { sous: tr('Chaque écran garde son rangement ; le contenu, lui, se synchronise.'), droite: null };
    if (tab === 'apparence') return { sous: tr('Pour vous, sur ce type d’écran. Tout s’applique tout de suite.'), droite: null };
    if (tab === 'inter') {
      const c = compteInter;
      const t = c ? trN(c.telecommandes, '{n} télécommande', '{n} télécommandes') : null;
      const g = c ? trN(c.gestes, '{n} geste réglé', '{n} gestes réglés') : null;
      return { sous: tr('Boutons sans fil Zigbee') + (c ? ' · ' + t + ', ' + g : ''), droite: null };
    }
    if (tab === 'alertes') return { sous: tr('Ce que le téléphone doit apprendre, même dashboard fermé'), droite: null };
    if (tab === 'auto') return {
      sous: tr('Écrites et gérées dans Home Assistant') + (autos.length ? ' · ' + tr('{a} actives sur {n}', { a: autos.filter(a => a.on).length, n: autos.length }) : ''),
      // La demo n'a pas de Home Assistant derriere elle : pas de lien vers nulle part.
      droite: window.__loggiaDemo ? null : <a href={accessOrigin + '/config/automation/dashboard'} target="_top" rel="noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: 'var(--o-accent-soft)', textDecoration: 'none' }}>{tr('Ouvrir dans Home Assistant')}<Fi i="arrow-right" size={12} color="var(--o-accent-soft)" /></a>,
    };
    if (tab === 'maj') {
      const verifier = () => {
        if (hass && hass.callService && upsAll.length) hass.callService('homeassistant', 'update_entity', { entity_id: upsAll.map(u => u.id) });
        const t = Date.now();
        try { localStorage.setItem('loggia-maj-verifie', String(t)); } catch { /* stockage indisponible */ }
        setMajVerifie(t);
      };
      const toutInstaller = () => {
        if (!updAllConfirm) { setUpdAllConfirm(true); setTimeout(() => setUpdAllConfirm(false), 4000); return; }
        setUpdAllConfirm(false);
        ups.filter(u => u.avail && u.prog === false).forEach(u => { setUpdBusy(b => ({ ...b, [u.id]: Date.now() })); updCall('install', u.id); });
      };
      return {
        sous: (upsAvail ? tr('{n} en attente', { n: upsAvail }) : tr('Tout est à jour')) + (majVerifie ? ' · ' + tr('vérifié {quand}', { quand: depuisMin((Date.now() - majVerifie) / 60000) }) : ''),
        droite: <>
          <button onClick={verifier} style={btnSecondaire}><Fi i="refresh" size={13} />{tr('Vérifier')}</button>
          {upsAvail > 1 && <button onClick={toutInstaller} style={{ ...btnPrimaire, background: updAllConfirm ? 'var(--o-warn2)' : btnPrimaire.background }}>{updAllConfirm ? tr('Confirmer ?') : tr('Tout installer ({n})', { n: upsAvail })}</button>}
        </>,
      };
    }
    if (tab === 'connexion') return {
      sous: tr('Session empruntée au navigateur · accès local et distant'),
      // Mesuree a l'ouverture de la section : un appel a l'API, pas une supposition.
      droite: !hass ? <Pastille niveau="danger" point>{tr('Session absente')}</Pastille>
        : lat === -1 ? <Pastille niveau="danger" point>{tr('Home Assistant ne répond pas')}</Pastille>
          : lat == null ? <Pastille point>{tr('Vérification…')}</Pastille>
            : <Pastille niveau="ok" point>{tr('Session active')}</Pastille>,
    };
    if (tab === 'about') {
      const inst = installationReelle();
      // Sans entite de suivi, aucune pastille : mieux vaut ne rien dire que
      // d'annoncer « a jour » sans l'avoir verifie.
      const droite = inst.aJour === null ? null : inst.aJour
        ? <Pastille niveau="ok" point>{tr('À jour')}</Pastille>
        : <Pastille niveau="alerte" point>{inst.disponible ? tr('v{v} disponible', { v: String(inst.disponible).replace(/^v/, '') }) : tr('Mise à jour disponible')}</Pastille>;
      return { sous: tr('Tableau de bord domotique auto-hébergé pour Home Assistant'), droite };
    }
    if (tab === 'regles') {
      // Douze regles : volets 4, chauffage 1, depart 1, nuit 3, veilles 3.
      const total = 12;
      const { actifs } = etatObservation(observe);
      return {
        sous: tr('Ce que la maison fait seule') + ' · ' + (nbVolRegles > 1 ? tr('{a} règles actives sur {t}', { a: nbVolRegles, t: total }) : tr('{a} règle active sur {t}', { a: nbVolRegles, t: total })),
        droite: <>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{tr('Observer sans agir')}</span>
          <Tgl on={actifs.length > 0} cb={basculerObserve} off={!observe} label={tr('Observer sans agir')} />
        </>,
      };
    }
    if (tab === 'vues') {
      const c = readViewsCfg();
      const principales = VUES_PRINCIPALES;
      const vues = 1 + principales.filter(v => !viewReason(availViews, v) && !c.hidden.has(v)).length
        + HIDDEN_VIEWS().filter(h => !viewReason(availViews, h.vid) && c.shown.has(h.vid)).length + customViews.length;
      const total = 1 + principales.length + HIDDEN_VIEWS().length + customViews.length;
      return {
        sous: tr('Menu latéral et vues perso') + ' · ' + tr('{v} visibles, {m} masquées', { v: vues, m: total - vues }),
        droite: <>
          {onNav && <button onClick={() => onNav('biblio')} style={btnSecondaire}>{tr('Bibliothèque de cartes')}</button>}
          {!ordinaire && <button onClick={() => setCvEditing('new')} style={btnPrimaire}>{tr('Créer une vue')}</button>}
        </>,
      };
    }
    return { sous: curSection ? (curSection.pageSub || curSection.sub) : '', droite: null };
  })();
  // Bandeau d'une section : volontairement LEGER (1 a 2 groupes) — entasser dix reglages

  /* Le rail et la vue d'ensemble (maquette « Loggia Prototype v3 », 02/11).
   * Sur un écran large, les sections vivent dans un rail à gauche, rangées en
   * trois groupes ; le sommaire n'est plus une grille de tuiles mais ce qui
   * mérite un œil, puis une ligne par section. Au téléphone, rien ne change. */
  /* Le menu des langues, le même à l'ordinateur et au téléphone : seul son
   * déclencheur change d'habit. */
  const menuLangue = (style) => (
      <ListeChoix label={tr('Langue')} value={choixLangue()}
        options={languesDisponibles(hass).map(l => ({
          id: l.code,
          label: l.code === 'auto' ? tr('Suivre Home Assistant') : l.nom,
          sub: l.enFrancais ? tr(l.enFrancais) : undefined,
        }))}
        style={style}
        onChange={v => {
          /* Pas de rechargement : les listes sont des fonctions, elles
           * se disent dans la langue du moment, un redessin suffit. */
          cfgSet({ 'loggia-langue': v });
          // La racine ecoute : elle rappelle `preparerLangue` puis redessine.
          try { window.dispatchEvent(new CustomEvent('loggia-langue-changee')); } catch {}
          /* SAUF en démonstration (23/09) : la maison factice nomme ses
           * pièces au démarrage, et les renommer à chaud demanderait de
           * la rebâtir entière — ces noms sont aussi des clés. On
           * recharge donc avec la langue dans l'URL. Le magasin mémoire
           * repart à neuf à chaque chargement de toute façon, et le lien
           * devient partageable. Une vraie installation, elle, tient ses
           * noms de Home Assistant : rien à recharger. */
          if (typeof window !== 'undefined' && window.__loggiaDemo) {
            try {
              /* La vue courante survit au rechargement par
               * `sessionStorage`. Si c'est une PIÈCE, son nom vient de
               * changer : gardée telle quelle, elle rouvrirait une
               * pièce qui n'existe plus, vide et intitulée dans
               * l'ancienne langue. On revient à l'Accueil. */
              const vue = window.sessionStorage.getItem('loggia-vue') || '';
              if (vue.indexOf('room:') === 0) window.sessionStorage.setItem('loggia-vue', 'accueil');
            } catch { /* rien */ }
            try {
              const u = new URL(window.location.href);
              if (v === 'auto') u.searchParams.delete('lang');
              else u.searchParams.set('lang', v);
              window.location.replace(u.toString());
            } catch { /* rien : le redessin a déjà eu lieu */ }
          }
        }} />
  );
  const GROUPES_PAR = [
    ['moi', tr('Pour moi'), ['users', 'apparence']],
    ['maison', tr('La maison'), ['regles', 'alertes', 'inter', 'auto']],
    ['systeme', tr('Le système'), ['connexion', 'maj', 'appareils', 'vues', 'about']],
  ].map(([id, l, ids]) => ({ id, l, secs: ids.map(s => SECTIONS.find(x => x.id === s)).filter(Boolean) })).filter(g => g.secs.length);
  const NOM_RAIL = { regles: tr('Règles'), vues: tr('Menu'), appareils: tr('Écrans'), connexion: tr('Connexion') };
  const resumeSection = (sec) => (sec.small ? sec.big : sec.big + ' ' + sec.unit) + ' · ' + sec.sub;
  const prenom = nomProfil((users[userIdx] || {}).name || '');
  /* « À regarder » : seulement ce que cette page sait VRAIMENT, et que l'on
   * règle depuis elle. Rien à regarder, pas de panneau. */
  const aRegarder = [
    isAdmin && upsAvail > 0 && { ico: 'refresh', k: 'warn2', titre: trN(upsAvail, '{n} mise à jour en attente', '{n} mises à jour en attente'), desc: tr('Firmwares et modules'), vers: 'maj', bouton: tr('Voir') },
    isAdmin && cfgVal('loggia_admin_pin_defini', false) !== true && { ico: 'key', k: 'warn', titre: tr('Le code administrateur n’est pas défini'), desc: tr('Il se règle dans Profils.'), vers: 'users', bouton: tr('Le définir') },
    !hass && { ico: 'link', k: 'bad', titre: tr('Session Home Assistant absente'), desc: tr('Les réglages ne peuvent pas être enregistrés.'), vers: 'connexion', bouton: tr('Voir') },
  ].filter(Boolean);
  const ligneSection = (sec, premier) => (
    <button key={sec.id} data-section={sec.id} onClick={() => setTab(sec.id)} style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', padding: '14px 22px', border: 'none', borderTop: premier ? 'none' : FILET, background: 'transparent', color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
      <span style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: sec.bg }}><Fi i={sec.ico} size={15} color={sec.col} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{sec.long || sec.name}</span>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, lineHeight: 1.45, marginTop: 2, color: 'var(--o-text2)' }}>{resumeSection(sec)}</span>
      </span>
      {sec.id === 'maj' && upsAvail > 0 && <Pastille niveau="alerte" capitales>{String(upsAvail)}</Pastille>}
      <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)' }}><Fi i="angle-small-right" size={13} color="var(--o-text1)" /></span>
    </button>
  );
  const railItem = (id, l, ico, col) => {
    const on = tab === id;
    const badge = id === 'maj' && upsAvail > 0 ? String(upsAvail) : '';
    return (
      <button key={id} onClick={() => setTab(id)} aria-current={on ? 'page' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '9px 10px', borderRadius: 11, border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: on ? 800 : 600, textAlign: 'left', background: on ? 'var(--o-accent-fond)' : 'transparent', color: on ? '#fff' : 'var(--o-text1)', transition: 'background .2s, color .2s' }}>
        <Fi i={ico} size={14} color={on ? '#fff' : col} />
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l}</span>
        {badge && <span style={{ minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box', borderRadius: 9, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'rgba(255,255,255,.25)' : 'rgba(var(--o-warn2-rgb),.2)', color: on ? '#fff' : 'var(--o-warn2)' }}>{badge}</span>}
      </button>
    );
  };

  return (
    <div ref={racineRef} className="loggia-content" style={{ padding: '26px 28px 56px', display: 'grid', gridTemplateColumns: avecRail ? '210px minmax(0,1fr)' : 'minmax(0,1fr)', gap: 28, alignItems: 'start' }}>
      {avecRail && (
        <nav aria-label={tr('Sections des paramètres')} style={{ position: 'sticky', top: 'calc(var(--o-safe-top, 0px) + 18px)', display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 2 }}>
          {champReglage({ marginBottom: 10 })}
          {railItem('hub', tr('Vue d’ensemble'), 'apps', 'var(--o-text2)')}
          {GROUPES_PAR.map(g => (
            <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ ...CAPITALES, fontSize: 10, letterSpacing: '.1em', padding: '16px 10px 6px' }}>{g.l}</div>
              {g.secs.map(sec => railItem(sec.id, NOM_RAIL[sec.id] || sec.name, sec.ico, sec.col))}
            </div>
          ))}
          {!isAdmin && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '12px 10px 0', fontSize: 11, fontWeight: 700, lineHeight: 1.4, color: 'var(--o-text3)' }}>
              <span style={{ marginTop: 2, display: 'inline-flex' }}><Fi i="lock" size={11} color="var(--o-text3)" /></span>
              <span>{tr('La maison et le système se règlent depuis un profil administrateur.')}</span>
            </div>
          )}
        </nav>
      )}
      <div ref={contenuRef} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {tab === 'hub' && avecRail ? (
        <>
          <div style={{ minWidth: 0, paddingBottom: 6 }}>
            <h1 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: railEtroit ? 32 : 34, fontWeight: 500, lineHeight: 1.1, letterSpacing: '-.01em' }}>{tr('Paramètres')}</h1>
            <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 4 }}>
              {aRegarder.length
                ? trN(aRegarder.length, 'Bonjour {nom}. Tout tourne ; une chose mérite un œil.', 'Bonjour {nom}. Tout tourne ; {n} choses méritent un œil.', { nom: prenom })
                : tr('Bonjour {nom}. Tout tourne, rien ne demande votre attention.', { nom: prenom })}
            </div>
          </div>
          {aRegarder.length > 0 && (
            <Panneau titre={tr('À regarder')}>
              {aRegarder.map(a => (
                <div key={a.vers + a.ico} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 22px', borderTop: FILET, flexWrap: 'wrap' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--o-' + a.k + '-rgb),.16)' }}><Fi i={a.ico} size={15} color={'var(--o-' + a.k + ')'} /></span>
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.titre}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.45, marginTop: 2, color: 'var(--o-text2)' }}>{a.desc}</div>
                  </div>
                  <button onClick={() => setTab(a.vers)} style={{ ...btnDiscret, marginLeft: 'auto' }}>{a.bouton}</button>
                </div>
              ))}
            </Panneau>
          )}
          {!isAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 14, background: 'rgba(var(--o-accent-rgb),.1)', border: '1px solid rgba(var(--o-accent-rgb),.32)' }}>
              <span style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--o-accent-rgb),.18)' }}><Fi i="lock" size={13} color="var(--o-accent-soft)" /></span>
              <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>{tr('Cet écran est sur le profil de {nom} : la maison et le système se règlent depuis un profil administrateur.', { nom: prenom })}</span>
            </div>
          )}
          {GROUPES_PAR.map(g => (
            <Panneau key={g.id} titre={g.l}>
              {g.secs.map(sec => <div key={sec.id} style={{ borderTop: FILET }}>{ligneSection(sec, true)}</div>)}
            </Panneau>
          ))}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            {/* Avec le rail, plus de retour : le sommaire reste à un geste, à gauche. */}
            {/* Au téléphone (maquette v4) : le titre de la page, le profil, puis
              * les sections en puces qui défilent — plus de sommaire ni de
              * retour. L'onglet ouvert passe à l'accent, comme le rail. */}
            {!avecRail && (
              <div>
                <h1 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 30, fontWeight: 500, lineHeight: 1.1, letterSpacing: '-.01em' }}>{tr('Paramètres')}</h1>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', marginTop: 4 }}>{tr('Profil de {nom} · réglages suivis sur tous ses écrans', { nom: prenom })}</div>
                {champReglage({ marginTop: 14 })}
                <nav aria-label={tr('Sections des paramètres')} style={{ display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none', marginTop: 18 }}>
                  {SECTIONS.map(sec => {
                    const on = tab === sec.id;
                    return (
                      <button key={sec.id} type="button" onClick={() => setTab(sec.id)} aria-current={on ? 'page' : undefined}
                        style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 800 : 600, whiteSpace: 'nowrap', transition: 'background .2s, color .2s', background: on ? 'rgba(var(--o-accent-rgb),.14)' : 'transparent', color: on ? 'var(--o-text)' : 'var(--o-text1)' }}>
                        <Fi i={sec.ico} size={14} color={on ? 'var(--o-accent)' : 'var(--o-text2)'} />{tr(sec.name)}
                        {sec.id === 'maj' && upsAvail > 0 && <span style={{ minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box', borderRadius: 9, background: 'var(--o-warn2)', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{upsAvail}</span>}
                      </button>
                    );
                  })}
                </nav>
                {/* Les sections que la maquette téléphone ne redessine pas gardent leurs actions d'en-tête. */}
                {!['users', 'apparence', 'appareils', 'about', 'regles'].includes(tab) && enTete.droite && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>{enTete.droite}</div>}
              </div>
            )}
            {avecRail && tab !== 'about' && tab !== 'alertes' && <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                <h1 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: railEtroit ? 32 : 34, fontWeight: 500 }}>{curSection ? (NOM_RAIL[curSection.id] || curSection.long || curSection.name) : tr('Paramètres')}</h1>
                <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 4 }}>{enTete.sous}</div>
              </div>
              {enTete.droite && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingBottom: 2 }}>{enTete.droite}</div>}
            </div>}
          </div>

      {editing && isAdmin && <UserEditor user={editing.u} customViews={customViews} onSave={(data) => { if (editing.i == null) onAddUser && onAddUser(data); else onUpdateUser && onUpdateUser(editing.i, data); setEditing(null); }} onDelete={editing.i != null ? () => { onDeleteUser && onDeleteUser(editing.i); setEditing(null); } : null} onClose={() => setEditing(null)} />}

      {tab === 'apparence' && (() => {
        /* Maquette v3 (02/11), ordinateur et tablette : l'aperçu en bande, puis
         * six panneaux — Thème, Couleur, Matière, Mouvement, Écran mural,
         * Langue et démarrage. Chaque réglage garde sa clé : seule sa place
         * et sa phrase changent. */
        const notFollow = haTheme !== 'FOLLOW';
        const ids = themeTab === 'natifs' ? NATIFS : COMMU;
        const themeList = ids.map(id => PRESET_META().find(x => x.id === id)).filter(Boolean);
        const veille = !!ambient;
        const nuitOn = nuit === 'soleil';
        const discret = { fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', whiteSpace: 'nowrap' };
        return avecRail ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <ParPreview themeMode={themeMode} loggiaTheme={loggiaTheme} hass={hass} userName={(users[userIdx] || {}).name || ''} look={look} collante={avecRail && !railEtroit} />

          <Panneau titre={tr('Thème')}
            desc={themeTab === 'natifs' ? tr('Les neuf de Loggia, chacun en clair et en foncé.') : tr('Neuf thèmes partagés par la communauté.')}
            droite={<Seg label={tr('Collection de thèmes')} value={themeTab} opts={[['natifs', tr('Natifs')], ['commu', tr('Communauté')]]} onPick={setThemeTab} />}>
            {/* Chaque thème se montre en petit écran : son fond, sa barre
              * latérale, deux cartes et son accent. Choisi, la carte passe en
              * bleu plein, texte blanc, comme toute puce choisie. */}
            <div className="grid-par-pal" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10, opacity: notFollow ? 1 : .55, transition: 'opacity .25s', padding: '0 22px 20px' }}>
              {themeList.map(p => {
                const on = notFollow && (loggiaTheme || '') === p.id;
                const fond = cl_hexRgb(p.cols[1]).split(',').map(Number);
                const vers = (t) => 'rgb(' + fond.map(v => Math.round(v + (255 - v) * t)).join(',') + ')';
                return (
                  <button key={p.id || 'loggia'} className="o-theme" onClick={() => onPickTheme(p.id)} aria-pressed={on}
                    style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '7px 7px 11px', borderRadius: 15, border: 'none', cursor: 'pointer', textAlign: 'left', minWidth: 0, fontFamily: 'inherit', transition: 'background .2s, color .2s', background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text)' }}>
                    <span className="o-theme-pts" aria-hidden="true" style={{ position: 'relative', display: 'block', height: 64, borderRadius: 10, background: p.cols[1], overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.07)' }}>
                      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '20%', background: vers(.05) }} />
                      <span style={{ position: 'absolute', left: '5%', top: 12, width: '10%', height: 4, borderRadius: 2, background: p.cols[0] }} />
                      <span style={{ position: 'absolute', left: '27%', top: 10, width: '31%', height: 22, borderRadius: 6, background: vers(.11) }} />
                      <span style={{ position: 'absolute', left: '62%', top: 10, width: '31%', height: 22, borderRadius: 6, background: vers(.11) }} />
                      <span className="o-theme-pt" style={{ position: 'absolute', left: '30%', top: 16, width: 8, height: 8, borderRadius: '50%', background: p.cols[2] }} />
                      <span style={{ position: 'absolute', left: '27%', top: 39, width: '24%', height: 14, borderRadius: 5, background: p.cols[0] }} />
                    </span>
                    <span className="o-theme-tete" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px', minWidth: 0 }}>
                      <span className="o-theme-nom" style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                      {on && <span className="o-theme-ok" style={{ flexShrink: 0, display: 'inline-flex' }}><Fi i="check" size={11} color="#fff" /></span>}
                    </span>
                    <span className="o-theme-desc" style={{ display: 'block', padding: '0 4px', fontSize: 11, fontWeight: 600, color: on ? 'rgba(255,255,255,.82)' : 'var(--o-text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr(p.desc)}</span>
                  </button>
                );
              })}
            </div>
            {/* « Auto » suit le clair ou le foncé de l'APPAREIL (App.jsx) : la
              * maquette disait « de 07:00 à 19:00 », ce que Loggia ne fait pas. */}
            <OptRow title={tr('Clair ou foncé')} desc={notFollow ? tr('Auto suit le clair ou le foncé de l’appareil.') : tr('Suit Home Assistant.')} eteint={!notFollow}>
              <Seg label={tr('Mode')} value={themeMode} opts={[['auto', tr('Auto')], ['dark', tr('Foncé')], ['light', tr('Clair')]]} onPick={onMode} disabled={!notFollow} />
            </OptRow>
            <OptRow title={tr('Suivre Home Assistant')} desc={tr('Calque le thème actif de Home Assistant, et son mode.')}>
              <Tgl on={haTheme === 'FOLLOW'} cb={onFollowHa} label={tr('Suivre le thème Home Assistant')} />
            </OptRow>
            {/* La taille du texte (07/11, étape 10) : cet écran seulement — le texte grandit, la disposition reste. */}
            <OptRow ici title={tr('Taille du texte')} desc={tr('Le texte grandit, la disposition ne bouge pas ; sur cet écran seulement.')}>
              <Seg label={tr('Taille du texte')} value={tailleTexte} opts={cransTexte} onPick={poserTailleTexte} />
            </OptRow>
          </Panneau>

          <Panneau titre={tr('Couleur')}>
            <OptRow title={tr('Accent')} desc={tr('Les éléments actifs, les jauges, les liens.')}>
              {/* Le nom de la teinte se traduit ICI et non dans `ACCENTS`, que les
                * tests relisent comme une donnée (audit du 03/10). */}
              <div role="group" aria-label={tr('Accent')} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {ACCENTS.map(([c, lb]) => {
                  const on = (look.accent || '') === c;
                  const nomTeinte = tr(lb);
                  return (
                    <button key={c || 'auto'} onClick={() => onLook({ accent: c })} title={nomTeinte} aria-label={nomTeinte} aria-pressed={on}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 11px 6px 8px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)' }}>
                      <span aria-hidden="true" style={{ width: 13, height: 13, borderRadius: '50%', flexShrink: 0, background: c || 'var(--o-accent-theme, var(--o-accent))', boxShadow: on ? '0 0 0 2px rgba(255,255,255,.9)' : 'none' }} />
                      {nomTeinte}
                    </button>
                  );
                })}
              </div>
            </OptRow>
            <OptRow title={tr('Teinte des cartes actives')} desc={tr('Une lampe allumée lave sa carte de sa couleur. Voyez l’aperçu.')}>
              <Seg label={tr('Teinte des cartes actives')} value={look.tint || 'douce'}
                opts={[['sans', tr('Sans')], ['discrete', tr('Discrète')], ['douce', tr('Douce')], ['pleine', tr('Pleine')]]}
                onPick={v => onLook({ tint: v })} />
            </OptRow>
          </Panneau>

          {/* La matière n'est plus un choix : un seul matériau — le translucide de
              l'accueil — partout (décision user 29/08). Le verre, lui, se règle. */}
          <Panneau titre={tr('Matière')} droite={<span style={discret}>{tr('Sans coût pour l’écran')}</span>}>
            <OptRow title={tr('Arrondi')}>
              <Seg label={tr('Arrondi')} value={look.radius || 'doux'} opts={[['net', tr('Net')], ['doux', tr('Doux')], ['rond', tr('Rond')]]} onPick={v => onLook({ radius: v })} />
            </OptRow>
            <OptRow title={tr('Ombres')} desc={tr('Détachent les cartes du fond.')}>
              <Tgl on={!!look.shadow} cb={() => onLook({ shadow: !look.shadow })} label={tr('Ombres portées')} />
            </OptRow>
            <OptRow title={tr('Liserés')} desc={tr('Un trait d’un pixel autour des cartes.')}>
              <Tgl on={!!look.hairline} cb={() => onLook({ hairline: !look.hairline })} label={tr('Liserés')} />
            </OptRow>
            <OptRow ici title={tr('Verre')} desc={descVerre}>
              <Seg label={tr('Verre des cartes')} value={verre}
                opts={[['auto', tr('Auto')], ['plein', tr('Plein')], ['leger', tr('Léger')]]}
                onPick={choisirVerre} />
            </OptRow>
            <OptRow title={tr("Fond d'écran")} desc={tr('Une photo à vous, sous les cartes.')}>
              <FondPhotoBtn actif={(look.fond || 'aucun') === 'photo'} fondV={look.fondV} onLook={onLook} />
            </OptRow>
          </Panneau>

          <Panneau ici titre={tr('Mouvement')} droite={<span style={discret}>{tr('Demande un peu de puissance')}</span>}>
            <OptRow title={tr('Ciel animé')} desc={tr('Les nuages derrière la bannière d’accueil.')}>
              <Tgl on={!!wxFx} cb={onToggleWxFx} label={tr('Effets météo animés')} />
            </OptRow>
            <OptRow retrait eteint={!wxFx} title={tr('Fluidité')} desc={descCiel}>
              <Seg label={tr('Ciel animé')} value={qualiteCiel}
                opts={[['auto', tr('Auto')], ['leger', tr('Léger')], ['fixe', tr('Fixe')]]}
                onPick={choisirQualiteCiel} />
            </OptRow>
          </Panneau>

          <Panneau ici titre={tr('Écran mural')} desc={tr('Pour une tablette fixée au mur, qui reste allumée.')}>
            <OptRow title={tr('Écran de veille')} desc={tr('Après ce délai sans toucher : l’heure et la météo.')}>
              <Seg label={tr('Écran de veille')} value={String(ambient || 0)}
                opts={[['0', tr('Off')], ['1', '1 min'], ['2', '2 min'], ['5', '5 min'], ['10', '10 min']]}
                onPick={v => onAmbient && onAmbient(parseInt(v, 10) || 0)} />
              {/* « Voir » ouvre la veille tout de suite (useReglagesEcran écoute) ;
                * un geste la referme, comme d'habitude. */}
              {veille && <button type="button" onClick={() => { try { window.dispatchEvent(new CustomEvent('loggia-veille-voir')); } catch { /* rien */ } }} style={btnSecondaire}><Fi i="eye" size={13} />{tr('Voir')}</button>}
            </OptRow>
            {/* Trois réglages de la veille : grisés tant qu'elle est coupée,
              * sans être verrouillés — on peut les préparer avant. */}
            <OptRow retrait eteint={!veille} title={tr('Quand')} desc={tr("La nuit, la veille baisse d'un ton et l'horloge dérive pour ménager l'écran.")}>
              <Seg label={tr('Plage horaire')} value={ambPlage}
                opts={[['toujours', tr('Toujours')], ['nuit', tr('Nuit')], ['jour', tr('Journée')]]}
                onPick={v => onAmbPlage && onAmbPlage(v)} />
            </OptRow>
            <OptRow retrait eteint={!veille} title={tr('Photos en fond')} desc={tr('Le dossier media, une photo toutes les 30 s.')}>
              <Tgl on={ambPhotos} cb={toggleAmbPhotos} label={tr('Photos en fond')} />
            </OptRow>
            <OptRow retrait eteint={!veille} title={tr('Réveil par la caméra')} desc={tr('Tout reste local. Demande HTTPS et l’autorisation caméra.')}>
              <Tgl on={ambMotion} cb={toggleAmbMotion} label={tr('Réveil par la caméra')} />
            </OptRow>
            <OptRow title={tr('La nuit')} desc={nuitOn ? descNuit(nuit, hass) : tr('L’écran garde sa lumière.')}>
              <Seg label={tr('Nuit de l’écran')} value={nuit}
                opts={[['non', tr('Comme le jour')], ['soleil', tr('Plus sombre')]]}
                onPick={choisirNuit} />
            </OptRow>
            {/* Grisée tant que la nuit est comme le jour, sans être verrouillée : on peut la préparer avant. */}
            <OptRow retrait eteint={!nuitOn} title={tr('De combien')}>
              <Seg label={tr('Assombrir')} value={assombrir}
                opts={[['peu', tr('Un peu')], ['moyen', tr('Moyen')], ['beaucoup', tr('Beaucoup')]]}
                onPick={choisirAssombrir} />
            </OptRow>
            {/* Même famille que la veille — c'est le même écran de couloir —,
              * mais réglage à part, et NON grisé par elle : la veille masque,
              * celui-ci range. On peut vouloir l'un sans l'autre. */}
            <OptRow title={tr('Retour à l’accueil')} desc={tr('Les fenêtres se ferment, l’Accueil revient.')}>
              <Seg label={tr('Retour à l’accueil')} value={String(retourAcc || 0)}
                opts={[['0', tr('Off')], ['1', '1 min'], ['2', '2 min'], ['5', '5 min'], ['10', '10 min'], ['30', '30 min']]}
                onPick={v => onRetourAcc && onRetourAcc(parseInt(v, 10) || 0)} />
            </OptRow>
            {aSonnette && (
            <OptRow title={tr('Sonnette')} desc={tr('Quand on sonne, la caméra s’ouvre en grand 60 s.')}>
              <Tgl on={camSonnette} cb={toggleCamSonnette} label={tr('Caméra en grand à la sonnette')} />
            </OptRow>
            )}
          </Panneau>

          <Panneau titre={tr('Langue et navigation')}>
            <OptRow title={tr('Langue')} desc={tr('Les noms des pièces viennent de Home Assistant.')}>
              {/* Un menu, pas une rangée de boutons : dès six langues, la rangée
                * débordait (demande du 22/09). Chaque langue se lit dans sa
                * propre langue — c'est ainsi qu'on la reconnaît —, son nom
                * traduit en petit dessous, comme le sélecteur de HA. */}
              {menuLangue({ gap: 12, minWidth: 0, width: 268, maxWidth: '100%', padding: '9px 14px', borderRadius: 14, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)' })}
            </OptRow>
            <OptRow title={tr('Barre du bas')} desc={tr('Les raccourcis, sur tablette et téléphone.')}>
              <Tgl on={!!navbar} cb={onToggleNavbar} label={tr('Barre de navigation mobile')} />
            </OptRow>
          </Panneau>

          {/* « Avancé » (07/11, usage étape 12 ; son choix) : ce qu'on règle une fois — la page de démarrage, le plan 3D,
            * les marges —, replié. La recherche l'ouvre quand elle y mène. */}
          <Panneau titre={tr('Avancé')} desc={tr('Rarement utile : la page de démarrage, le plan 3D, les marges de l’écran.')}
            droite={<button type="button" onClick={() => setAvance(o => !o)} aria-expanded={avance} aria-label={avance ? tr('Replier') : tr('Déplier')}
              style={{ width: 34, height: 34, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', border: 'none', color: 'var(--o-text2)', cursor: 'pointer' }}>
              <Fi i={avance ? 'angle-small-up' : 'angle-small-down'} size={15} />
            </button>}>
            {avance && (<>
              <OptRow title={tr('Ouvrir Loggia au démarrage')}
                desc={accueilDefaut === null
                  ? tr('Réglage indisponible : la page qui affiche Loggia n’a pas pu être identifiée.')
                  : tr('Le sélecteur de Home Assistant ne propose que ses tableaux de bord : ce bouton fait le réglage à sa place.')}>
                {accueilDefaut === true
                  ? <Pastille niveau="ok" icone="check" capitales>{tr('Fait')}</Pastille>
                  : <button onClick={mettreEnAccueil} disabled={accueilDefaut !== false} style={{ ...btnSecondaire, opacity: accueilDefaut === false ? 1 : .5, cursor: accueilDefaut === false ? 'pointer' : 'default' }}>{tr('Le faire')}</button>}
              </OptRow>
              <OptRow title={tr('Plan 3D')} desc={tr('Le bouton « Plan » des pièces, sur l’Accueil.')}>
                <Tgl on={look.plan !== false} cb={() => onLook({ plan: look.plan === false })} label={tr('Plan 3D de la maison')} />
              </OptRow>
              <MargesAvancees navbar={navbar} navMargin={navMargin} navAuto={navAuto} onNavOffset={onNavOffset}
                topMargin={topMargin} topAuto={topAuto} onTopOffset={onTopOffset}
                onReset={() => { onNavOffsetReset && onNavOffsetReset(); onTopOffsetReset && onTopOffsetReset(); }} />
            </>)}
          </Panneau>
        </div>
        ) : (
        /* Le téléphone (maquette v4) : d'autres groupes, les choix posés sous
         * leur titre, les mêmes réglages aux mêmes clés. */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <CarteTel gap={20}>
            <ChoixTel titre={tr('Mode d’affichage')} desc={ficheAppareil().apparence === true ? tr('Son thème et ses couleurs ne changent que sur cet écran.') : tr('Son thème suit celui du profil, sur tous ses écrans.')} label={tr('Mode')}
              value={notFollow ? themeMode : 'ha'}
              opts={[['dark', tr('Sombre')], ['light', tr('Clair')], ['auto', tr('Auto')], ['ha', tr('Suivre Home Assistant')]]}
              onPick={(v) => { if (v === 'ha') { if (notFollow) onFollowHa(); return; } if (!notFollow) onFollowHa(); onMode(v); }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{tr("Couleur d'accent")}</div>
              <div role="group" aria-label={tr("Couleur d'accent")} style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
                {ACCENTS.map(([c, lb]) => {
                  const on = (look.accent || '') === c;
                  const teinte = c || 'var(--o-accent-theme, var(--o-accent))';
                  return (
                    <button key={c || 'auto'} type="button" onClick={() => onLook({ accent: c })} aria-pressed={on}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', padding: 2, fontFamily: 'inherit' }}>
                      <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: '50%', background: teinte, boxShadow: on ? '0 0 0 2px var(--o-bg), 0 0 0 4px ' + teinte : 'none', transition: 'box-shadow .2s' }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)' }}>{tr(lb)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <ChoixTel titre={tr("Teinte d'état")} desc={tr('Les cartes d’un appareil actif se lavent de sa couleur.')} value={look.tint || 'douce'}
                opts={[['sans', tr('Sans')], ['discrete', tr('Discrète')], ['douce', tr('Douce')], ['pleine', tr('Pleine')]]}
                onPick={v => onLook({ tint: v })} />
              <ParPreview themeMode={themeMode} loggiaTheme={loggiaTheme} hass={hass} look={look} cartesSeules />
            </div>
            <LignesTel>
              <LigneTel titre={tr('Liserés')} desc={tr('Un filet d’un pixel autour des cartes')}><BasculeTel on={!!look.hairline} cb={() => onLook({ hairline: !look.hairline })} nom={tr('Liserés')} /></LigneTel>
              <LigneTel titre={tr('Ombres portées')} desc={tr('Le relief des cartes')}><BasculeTel on={!!look.shadow} cb={() => onLook({ shadow: !look.shadow })} nom={tr('Ombres portées')} /></LigneTel>
              <LigneTel ici titre={tr('Ciel animé')} desc={tr('Les nuages de l’Accueil bougent lentement')}><BasculeTel on={!!wxFx} cb={onToggleWxFx} nom={tr('Effets météo animés')} /></LigneTel>
            </LignesTel>
          </CarteTel>

          <CarteTel titre={tr('Thème')} desc={tr('Neuf thèmes natifs et neuf de la communauté, chacun en clair et en foncé.')} gap={20}>
            <ChoixTel titre={tr('Collection')} label={tr('Collection de thèmes')} value={themeTab} opts={[['natifs', tr('Natifs')], ['commu', tr('Communauté')]]} onPick={setThemeTab} />
            {(() => {
              const courant = PRESET_META().find(x => x.id === (loggiaTheme || '')) || PRESET_META()[0];
              return (
                <ChoixTel titre={themeTab === 'natifs' ? tr('Thèmes natifs') : tr('Thèmes de la communauté')} desc={courant.name + ' · ' + tr(courant.desc)}
                  value={notFollow ? (loggiaTheme || '') : null} opts={themeList.map(p => [p.id, p.name])} onPick={onPickTheme} />
              );
            })()}
          </CarteTel>

          <CarteTel titre={tr('Affichage')}>
            <LignesTel>
              <LigneTel titre={tr('Suivre Home Assistant')} desc={tr('Calque le thème actif de Home Assistant.')}><BasculeTel on={haTheme === 'FOLLOW'} cb={onFollowHa} nom={tr('Suivre le thème Home Assistant')} /></LigneTel>
              <LigneTel titre={tr('Langue')} desc={tr('Les noms de pièces et d’appareils viennent de Home Assistant.')}>
                {menuLangue({ gap: 3, minWidth: 0, maxWidth: '100%', padding: '4px 0', background: 'none', border: 'none', color: 'var(--o-accent-soft)', fontSize: 12, fontWeight: 800 })}
              </LigneTel>
              <LigneTel ici titre={tr('Barre de navigation')} desc={tr('Accès rapide en bas de l’écran, sur tablette et téléphone.')}><BasculeTel on={!!navbar} cb={onToggleNavbar} nom={tr('Barre de navigation mobile')} /></LigneTel>
            </LignesTel>
          </CarteTel>

          {/* La taille du texte (07/11, étape 10) : cet écran seulement. */}
          <CarteTel ici titre={tr('Taille du texte')} desc={tr('Le texte grandit, la disposition ne bouge pas ; sur cet écran seulement.')}>
            <ChoixTel titre={tr('Taille')} label={tr('Taille du texte')} value={tailleTexte} opts={cransTexte} onPick={poserTailleTexte} />
          </CarteTel>

          <CarteTel ici titre={tr('Effets')} desc={tr('Coût GPU modéré.')} gap={20}>
            <ChoixTel titre={tr('Ciel animé')} desc={wxFx ? descCiel : tr('Le ciel animé est coupé plus haut.')} value={qualiteCiel} eteint={!wxFx}
              opts={[['auto', tr('Auto')], ['leger', tr('Léger')], ['fixe', tr('Fixe')]]} onPick={choisirQualiteCiel} />
            <ChoixTel titre={tr('Verre des cartes')} desc={descVerre} value={verre} opts={[['auto', tr('Auto')], ['plein', tr('Plein')], ['leger', tr('Léger')]]} onPick={choisirVerre} />
            <ChoixTel titre={tr('Nuit de l’écran')} desc={descNuit(nuit, hass)} value={nuit} opts={[['non', tr('Non')], ['soleil', tr('Soleil')]]} onPick={choisirNuit} />
            <ChoixTel titre={tr('Assombrir')} desc={tr('Un voile sur tout l’écran ; la photo de fond baisse aussi')} value={assombrir} eteint={!nuitOn}
              opts={[['peu', tr('Un peu')], ['moyen', tr('Moyen')], ['beaucoup', tr('Beaucoup')]]} onPick={choisirAssombrir} />
          </CarteTel>

          <CarteTel ici titre={tr('Écran de veille')} desc={tr('Pour une tablette murale : après ce délai sans toucher, heure et météo.')} gap={20}>
            <ChoixTel titre={tr('Délai')} label={tr('Écran de veille')} value={String(ambient || 0)}
              opts={[['0', tr('Off')], ['1', '1 min'], ['2', '2 min'], ['5', '5 min'], ['10', '10 min']]} onPick={v => onAmbient && onAmbient(parseInt(v, 10) || 0)} />
            <ChoixTel titre={tr('Plage horaire')} desc={tr("La nuit, la veille baisse d'un ton et l'horloge dérive pour ménager l'écran.")} value={ambPlage} eteint={!veille}
              opts={[['toujours', tr('Toujours')], ['nuit', tr('Nuit')], ['jour', tr('Journée')]]} onPick={v => onAmbPlage && onAmbPlage(v)} />
            <LignesTel>
              <LigneTel titre={tr('Photos en fond')} desc={tr('Diaporama du dossier media, une photo toutes les 30 s, jamais un service externe.')} eteint={!veille}><BasculeTel on={ambPhotos} cb={toggleAmbPhotos} nom={tr('Photos en fond')} /></LigneTel>
              <LigneTel titre={tr('Réveil par la caméra')} desc={tr("Tout reste local. Nécessite un accès HTTPS et l'autorisation caméra.")} eteint={!veille}><BasculeTel on={ambMotion} cb={toggleAmbMotion} nom={tr('Réveil par la caméra')} /></LigneTel>
              <LigneTel titre={tr('Voir l’écran de veille')} desc={tr('Tel qu’il s’affichera sur cet écran.')}>
                <button type="button" disabled={!veille} onClick={() => { try { window.dispatchEvent(new CustomEvent('loggia-veille-voir')); } catch { /* rien */ } }} style={{ ...btnTel, opacity: veille ? 1 : .45 }}><Fi i="eye" size={11} />{tr('Voir')}</button>
              </LigneTel>
            </LignesTel>
          </CarteTel>

          <CarteTel ici titre={aSonnette ? tr('Retour et sonnette') : tr('Retour à l’accueil')} gap={20}>
            <ChoixTel titre={aSonnette ? tr('Retour à l’accueil') : tr('Délai')} desc={tr('Après ce délai sans toucher, les fenêtres se ferment et Loggia revient à l’accueil.')} value={String(retourAcc || 0)} label={tr('Retour à l’accueil')}
              opts={[['0', tr('Off')], ['1', '1 min'], ['2', '2 min'], ['5', '5 min'], ['10', '10 min'], ['30', '30 min']]} onPick={v => onRetourAcc && onRetourAcc(parseInt(v, 10) || 0)} />
            {aSonnette && (
              <LignesTel>
                <LigneTel titre={tr('Caméra en grand à la sonnette')} desc={tr('Sur cet écran, quand on sonne, la caméra de la sonnette s’ouvre en grand pendant 60 s.')}><BasculeTel on={camSonnette} cb={toggleCamSonnette} nom={tr('Caméra en grand à la sonnette')} /></LigneTel>
              </LignesTel>
            )}
          </CarteTel>

          <CarteTel titre={tr('Matière & formes')} desc={tr('Aucun coût GPU.')} gap={20}>
            <ChoixTel titre={tr('Arrondi')} desc={tr('Rayon des cartes, des champs et des boutons.')} value={look.radius || 'doux'} opts={[['net', tr('Net')], ['doux', tr('Doux')], ['rond', tr('Rond')]]} onPick={v => onLook({ radius: v })} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{tr("Fond d'écran")}</div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{tr('Votre photo sous les cartes.')}</div>
              <div style={{ display: 'flex', marginTop: 10 }}><FondPhotoBtn actif={(look.fond || 'aucun') === 'photo'} fondV={look.fondV} onLook={onLook} /></div>
            </div>
          </CarteTel>

          {/* « Avancé » (07/11, usage étape 12 ; son choix) : la page de démarrage, le plan 3D et les marges, repliés —
            * les mêmes que sur l'ordinateur. Les marges gardent leur marque « Cet écran » ; le reste suit le profil. */}
          <CarteTel style="tirets" titre={tr('Avancé')} desc={tr('Rarement utile : la page de démarrage, le plan 3D, les marges de l’écran.')}>
            <button type="button" onClick={() => setAvance(o => !o)} aria-expanded={avance} style={{ ...btnTel, alignSelf: 'flex-start' }}>
              <Fi i={avance ? 'angle-small-up' : 'angle-small-down'} size={12} />{avance ? tr('Replier') : tr('Afficher')}
            </button>
            {avance && (
              <LignesTel>
                  <LigneTel titre={tr('Plan 3D de la maison')} desc={tr('Le bouton « Plan » de la section Pièces de l’Accueil. Coupé, les pièces restent en cartes.')}><BasculeTel on={look.plan !== false} cb={() => onLook({ plan: look.plan === false })} nom={tr('Plan 3D de la maison')} /></LigneTel>
                  <LigneTel titre={tr("Page d'accueil")}
                    desc={accueilDefaut === true ? tr('Home Assistant ouvre Loggia au démarrage, sur ce compte.')
                      : accueilDefaut === null ? tr('Réglage indisponible : la page qui affiche Loggia n’a pas pu être identifiée.')
                        : tr('Home Assistant ouvre un autre écran au démarrage : ce bouton fait le réglage à sa place.')}>
                    {accueilDefaut === true
                      ? <span style={pasTel('ok')}>{tr('Fait')}</span>
                      : <button type="button" onClick={mettreEnAccueil} disabled={accueilDefaut !== false} style={{ ...btnTel, opacity: accueilDefaut === false ? 1 : .45 }}>{tr('Ouvrir Loggia au démarrage')}</button>}
                  </LigneTel>
                  <LigneTel ici titre={tr('Marge du haut')} desc={tr('Auto lit la zone sûre de l’écran : encoche, barre d’état.')}><PasTel px={topMargin} auto={topAuto} onStep={onTopOffset} label={tr('Marge du haut')} /></LigneTel>
                  {navbar && <LigneTel ici titre={tr('Marge du bas')} desc={tr('Sous la barre de navigation.')}><PasTel px={navMargin} auto={navAuto} onStep={onNavOffset} label={tr('Marge du bas')} /></LigneTel>}
                  {!(navAuto && topAuto) && <LigneTel><button type="button" onClick={() => { onNavOffsetReset && onNavOffsetReset(); onTopOffsetReset && onTopOffsetReset(); }} style={btnTel}>{tr('Rétablir « auto »')}</button></LigneTel>}
              </LignesTel>
            )}
          </CarteTel>
        </div>
        );
      })()}

      {tab === 'connexion' && (
        <Panneau titre={tr('Adresses du serveur')} desc={tr('Loggia n’a pas de compte : il emprunte la session Home Assistant ouverte dans ce navigateur.')}
          pied={<>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', flex: '1 1 220px' }}>{tr('Enregistrer recharge Loggia avec ces réglages.')}</span>
            <button onClick={resetHaCfg} style={btnSecondaire}>{tr('Rétablir')}</button>
            <button onClick={saveHaCfg} style={btnPrimaire}>{tr('Enregistrer')}</button>
          </>}>
          {[['local', tr('URL locale'), 'http://homeassistant.local:8123'],
            ['remote', tr('URL distante · Nabu Casa'), 'https://xxxx.ui.nabu.casa']].map(([k, lb, ph]) => (
            <div key={k} className="o-optrow" style={{ padding: '14px 22px', borderTop: FILET }}>
              <div style={{ ...CAPITALES, marginBottom: 8 }}>{lb}</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <input aria-label={lb} value={haDraft[k] || ''} onChange={e => setHaDraft(d => ({ ...d, [k]: e.target.value }))} placeholder={ph} spellCheck={false} autoComplete="off"
                  style={{ ...entInp, ...MONO, flex: '1 1 260px', width: 'auto', minWidth: 0, padding: '10px 14px', borderRadius: 12, fontSize: 12.5, fontWeight: 500 }} />
                <button onClick={() => testUrl(k)} style={btnSecondaire}>{tr('Tester')}</button>
                {resultatTest(k)}
              </div>
            </div>
          ))}
          <Ligne titre={tr('Bascule automatique')} desc={tr('Passer par Nabu Casa quand Home Assistant ne répond pas sous 2 s.')}>
            <Tgl on={!!haDraft.fallback} cb={toggleFallback} label={tr('Bascule automatique')} />
          </Ligne>
          <Ligne titre={tr('Intervalle de rafraîchissement')} desc={tr('Plus court = plus de requêtes vers Home Assistant.')}>
            <Seg label={tr('Intervalle de rafraîchissement')} value={haDraft.pollMs || 2000} opts={POLL_CHOICES} onPick={(ms) => setHaDraft(d => ({ ...d, pollMs: ms }))} />
          </Ligne>
          {/* L'assistant : une entite de conversation. Son nom vit ici et non
            * dans le code — un assistant porte souvent un prenom, et le code de
            * Loggia est public. Le choix ecrit `loggia_assistant`, reservee aux
            * administrateurs Home Assistant : un compte ordinaire ne le voit
            * pas (03/10). */}
          {!ordinaire && (
            <Ligne titre={tr('Assistant vocal')} desc={tr('L’entité de conversation qui répond à l’orbe, en haut de l’écran et dans la barre du bas.')}>
              <Seg label={tr('Assistant vocal')} value={assistantChoix} opts={assistantOpts} onPick={choisirAssistant} wrap />
            </Ligne>
          )}
        </Panneau>
      )}

      {tab === 'users' && !avecRail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Maquette v4 : la liste des profils, le code, les rôles, et l'ajout. */}
          <CarteTel titre={tr('Profils')} gap={6}>
            <LignesTel>
              {users.map((u, i) => {
                const role = u.role === 'Admin' ? tr('Administrateur') : tr(u.role || 'Famille');
                return (
                  <LigneTel key={u._k || 'u' + i} ava={userImg(u) ? '' : (u.name || '?').charAt(0).toUpperCase()} avaFond={userImg(u) ? userBg(u) : (u.c || 'var(--o-ok)')}
                    titre={u.name} desc={i === userIdx ? tr('{role} · ce compte', { role }) : role}
                    onClick={isAdmin ? () => setEditing({ i, u }) : null} label={tr('Modifier ce profil') + ' · ' + u.name} />
                );
              })}
            </LignesTel>
          </CarteTel>
          <AdminPinEditor hass={hass} admin={isAdmin} users={users} tel />
          <CarteTel titre={tr('Rôles')} desc={tr('Ce que chaque profil peut régler.')}>
            <LignesTel>
              <LigneTel ico="shield-check" icoCouleur="var(--o-warn)" titre={tr('Administrateur')} desc={tr('Tout se règle, sections réservées comprises : automatisations, alertes, mises à jour, interrupteurs, règles et vues.')} />
              <LigneTel ico="users" icoCouleur="var(--o-ok)" titre={tr('Famille')} desc={tr('Commande la maison ; les réglages réservés restent fermés.')} />
              <LigneTel ico="child-head" icoCouleur="var(--o-cyan)" titre={tr('Enfant')} desc={tr('Un écran tenu par le serveur, dans sa pièce. Le code de la maison rouvre les réglages du parent.')} />
            </LignesTel>
          </CarteTel>
          {isAdmin && <AjoutProfilTel onAjouter={(nom) => onAddUser && onAddUser({ name: nom, role: 'Famille', c: USER_COLORS[users.length % USER_COLORS.length], sub: 'Famille · ' + nom.toLowerCase().replace(/\s+/g, '.'), vues: [], droits: [] })} />}
        </div>
      )}
      {tab === 'users' && avecRail && (<>
        {/* Les gens du foyer en cartes, à nu (maquette v3, 02/11) : la carte
          * entière ouvre l'éditeur pour un administrateur, et « Ajouter » est
          * la dernière carte — plus de bouton en double dans l'en-tête. */}
        <GrilleCartes label={tr('Profils')}>
          {users.map((u, i) => {
            const moi = i === userIdx;
            const vu = seenRel(u.name, moi);
            /* Le rôle est une VALEUR gardée telle quelle (« Admin », « Famille ») :
             * il se traduit à l'affichage, comme dans le menu des profils (audit du 03/10). */
            return (
              <CarteGens key={u._k || 'u' + i} haut={avecRail ? 176 : 150} ava={userImg(u) ? '' : (u.name || '?').charAt(0).toUpperCase()} avaFond={userImg(u) ? userBg(u) : (u.c || 'var(--o-ok)')}
                nom={u.name} sous={u.role === 'Admin' ? tr('Administrateur') : tr(u.role || 'Famille')} vu={vu || null} actif={moi} etiquette={moi ? tr('Cet écran') : null}
                onClick={isAdmin ? () => setEditing({ i, u }) : null} label={isAdmin ? tr('Modifier ce profil') + ' · ' + u.name : undefined} />
            );
          })}
          {isAdmin && <CarteGens ajout haut={avecRail ? 176 : 150} ico="plus-small" nom={tr('Ajouter')} sous={tr('Une personne du foyer')} onClick={() => setEditing({ i: null })} label={tr('Ajouter un profil')} />}
        </GrilleCartes>
        <AdminPinEditor hass={hass} admin={isAdmin} users={users} />
      </>)}

      {tab === 'vues' && aD('vues') && (() => {
        const PRINCIPALES = [
          ['pieces', tr('Pièces'), 'door-open', tr('toutes les pièces'), 'var(--o-orange)'],
          ['scenes', tr('Scénarios'), 'sparkles', tr('scénarios de la maison'), 'var(--o-purple)'],
          ['objets', tr('Objets'), 'apps', tr('appareils par familles'), 'var(--o-cyan)'],
          ['energie', tr('Énergie'), 'bolt', tr('production et consommation'), 'var(--o-ok)'],
          ['securite', tr('Sécurité'), 'shield-check', tr('alarme et caméras'), 'var(--o-ok)'],
          ['systeme', tr('Système'), 'microchip', tr('machines et maintenance'), 'var(--o-text2)'],
        ];
        // Une vue masquee garde sa description : c'est ce qu'on lit pour
        // decider de la remettre, « masquée » ne disait rien.
        // Chaque vue secondaire dit ce qu'elle porte : sans sa ligne ici, elle
        // s'affiche nue au milieu de voisines qui se presentent (24/09, S2).
        const DESC_SECONDAIRE = { lumieres: tr('éclairages de la maison'), climat: tr('chauffage et clim'), volets: tr('modes et planning'), medias: tr('enceintes et écrans'), biblio: tr('catalogue des cartes') };
        const cfg = readViewsCfg();
        const bump = () => setAutoOpen(o => ({ ...o }));
        const toggleMain = (vid) => { const c = readViewsCfg(); if (c.hidden.has(vid)) c.hidden.delete(vid); else c.hidden.add(vid); writeViewsCfg(c); bump(); };
        const toggleExtra = (vid) => { const c = readViewsCfg(); if (c.shown.has(vid)) c.shown.delete(vid); else c.shown.add(vid); writeViewsCfg(c); bump(); };
        // Un seul ordre enregistre, deux groupes : chacun se reordonne dans le
        // sien — le menu lateral range les vues secondaires a part.
        const iOrdre = (vid) => { const i = (cfg.order || []).indexOf(vid); return i < 0 ? 999 : i; };
        const principales = [...PRINCIPALES].sort((a, b) => iOrdre(a[0]) - iOrdre(b[0]));
        const secondaires = HIDDEN_VIEWS().sort((a, b) => iOrdre(a.vid) - iOrdre(b.vid));
        const idsP = principales.map(v => v[0]);
        const idsS = secondaires.map(h => h.vid);
        const echanger = (ids, vid, dir) => { const n = ids.slice(); const i = n.indexOf(vid), j = i + dir; if (i < 0 || j < 0 || j >= n.length) return null; const t = n[i]; n[i] = n[j]; n[j] = t; return n; };
        const ecrireOrdre = (ids) => { const c = readViewsCfg(); c.order = ids; writeViewsCfg(c); bump(); };
        const deplacerP = (vid, dir) => { const n = echanger(idsP, vid, dir); if (n) ecrireOrdre(['accueil', ...n, ...idsS]); };
        const deplacerS = (vid, dir) => { const n = echanger(idsS, vid, dir); if (n) ecrireOrdre(['accueil', ...idsP, ...n]); };
        return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panneau titre={tr('Vues intégrées')} desc={tr('Masquez celles que vous n’utilisez pas, réordonnez les autres. La barre mobile garde ses raccourcis.')}
            droite={<span style={CAPITALES}>{tr('Visibilité du menu latéral')}</span>}>
            <Row icon="home" c="var(--o-accent)" name={tr('Accueil')} sub={tr('vue principale')} on fixe />
            {principales.map(([vid, name, icon, sub, c], idx) => { const why = viewReason(availViews, vid); return (
              <Row key={vid} icon={icon} c={c} name={name} sub={why ? tr(why) : sub} locked={!!why} on={!why && !cfg.hidden.has(vid)} onT={() => toggleMain(vid)}
                onUp={idx > 0 ? () => deplacerP(vid, -1) : null} onDown={idx < principales.length - 1 ? () => deplacerP(vid, 1) : null} />
            ); })}
            {secondaires.map((h, idx) => { const why = viewReason(availViews, h.vid); return (
              <Row key={h.vid} icon={h.icon} c={h.c} name={h.label} sub={why ? tr(why) : (DESC_SECONDAIRE[h.vid] || '')} locked={!!why} on={!why && cfg.shown.has(h.vid)} onT={() => toggleExtra(h.vid)}
                onUp={idx > 0 ? () => deplacerS(h.vid, -1) : null} onDown={idx < secondaires.length - 1 ? () => deplacerS(h.vid, 1) : null} />
            ); })}
          </Panneau>
          {customViews.length > 0 && (
            <Panneau titre={tr('Mes vues')} desc={tr('Vos vues, avec vos entités — elles apparaissent dans le menu latéral.')}>
              {customViews.map(cv => (
                <div key={cv.id} className="o-optrow" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 22px', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--o-accent-rgb),.14)', color: 'var(--o-accent-soft)' }}><Fi i={cv.icon || 'sparkles'} size={15} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 700 }}>{cv.name}</div><div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600 }}>{trN(cv.ents.length, '{n} entité', '{n} entités')}</div></div>
                  {/* `loggia_customviews` est reservee (03/10) : un compte
                    * ordinaire voit ses vues, sans les gestes qui les reecrivent. */}
                  {!ordinaire && (<>
                    <button onClick={() => setCvEditing(cv)} title={tr('Modifier')} aria-label={tr('Modifier') + ' ' + cv.name} style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i="pencil" size={13} /></button>
                    <button onClick={() => onSaveCustomViews(customViews.filter(x => x.id !== cv.id))} title={tr('Supprimer')} aria-label={tr('Supprimer') + ' ' + cv.name} style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(var(--o-bad-rgb),.12)', border: 'none', color: 'var(--o-bad)', cursor: 'pointer', fontSize: 15, fontWeight: 800 }}>×</button>
                  </>)}
                </div>
              ))}
            </Panneau>
          )}
        </div>
        );
      })()}
      {cvEditing && isAdmin && <CvEditor cv={cvEditing === 'new' ? null : cvEditing} hass={hass} onClose={() => setCvEditing(null)} onSave={(cv) => { onSaveCustomViews(cvEditing === 'new' ? [...customViews, cv] : customViews.map(x => x.id === cv.id ? cv : x)); setCvEditing(null); }} />}

      {tab === 'auto' && aD('auto') && (() => {
        const q = sansAccents(autoQ.trim());
        const filtered = autos.filter(a => (!q || sansAccents(a.name).indexOf(q) >= 0) && (autoFilter === 'all' || (autoFilter === 'on') === a.on));
        // Le classement vit dans `autos.js`, avec ses tests : le premier mot du
        // nom faisait deux familles pour « Lumière » et « Lumières » (retour 02/09).
        const groups = [];
        filtered.forEach(a => { const g = autoFamille(a.name); let e = groups.find(x => x.g === g); if (!e) { e = { g, items: [] }; groups.push(e); } e.items.push(a); });
        /* La famille se dit dans la langue de l'écran (audit du 03/10) ; un mot
         * repris du NOM de l'automatisation vient de Home Assistant et reste
         * tel quel. Le tri suit ce qu'on lit. */
        const nomFam = (g) => (FAMILLES_AUTO.indexOf(g) >= 0 ? tr(g) : g);
        groups.sort((x, y) => comparerTextes(nomFam(x.g), nomFam(y.g)));
        const line = (a) => (
          <div key={a.id} className="o-optrow" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 22px 10px 51px', borderTop: FILET }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: a.on ? 'var(--o-text)' : 'var(--o-text2)' }}>{a.name}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{a.on ? tr('active') : tr('inactive')}{a.last ? ' · ' + tr('dernière exécution {quand}', { quand: autoRel(a.last) }) : ''}</div>
            </div>
            <button onClick={() => runAuto(a)} title={tr('Exécuter maintenant')} style={btnDiscret}><Fi i="play" size={11} />{tr('Exécuter')}</button>
            <Tgl on={a.on} cb={() => toggleAuto(a)} label={a.name} />
          </div>
        );
        return (
        <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: 14, borderRadius: 'var(--o-radius,18px)', background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
          <div style={{ flex: '1 1 240px', position: 'relative', minWidth: 0 }}>
            <Fi i="search" size={14} color="var(--o-text3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input aria-label={tr('Filtrer par nom…')} value={autoQ} onChange={e => setAutoQ(e.target.value)} placeholder={tr('Filtrer par nom…')} spellCheck={false}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px 10px 38px', borderRadius: 12, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s2)', color: 'var(--o-text)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }} />
          </div>
          <Seg label={tr('Filtrer par état')} value={autoFilter} opts={[['all', tr('Toutes')], ['on', tr('Actives')], ['off', tr('Inactives')]]} onPick={setAutoFilter} />
        </div>
        <Panneau>
          {!groups.length && <div style={{ padding: '24px 22px', textAlign: 'center', fontSize: 13, color: 'var(--o-text3)', fontWeight: 600 }}>{autos.length ? tr('Aucune automatisation ne correspond au filtre.') : tr('Aucune automatisation détectée.')}</div>}
          {groups.map((gr, gi) => {
            const isOpen = !!autoOpen[gr.g] || !!q;
            const nOn = gr.items.filter(a => a.on).length;
            return (
              <div key={gr.g}>
                <button onClick={() => setAutoOpen(o => ({ ...o, [gr.g]: !o[gr.g] }))} aria-expanded={isOpen}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '13px 22px', background: 'none', border: 'none', borderTop: gi ? FILET : 'none', color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                  <span style={{ display: 'inline-flex', transition: 'transform .22s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0)' }}><Fi i="angle-small-right" size={15} color="var(--o-text3)" /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>{nomFam(gr.g)}</span>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', marginTop: 2 }}>{trN(gr.items.length, '{n} automatisation', '{n} automatisations')}</span>
                  </span>
                  <Pastille niveau={nOn ? 'ok' : 'neutre'}>{nOn === gr.items.length ? trN(nOn, '{n} active', '{n} actives') : tr('{a} sur {n}', { a: nOn, n: gr.items.length })}</Pastille>
                </button>
                {isOpen && gr.items.map(line)}
              </div>
            );
          })}
        </Panneau>
        </>
        );
      })()}

      {tab === 'alertes' && aD('alertes') && <AlertesTele hass={hass} tel={!avecRail} tailleTitre={railEtroit ? 32 : 34} />}
      {tab === 'inter' && aD('inter') && <InterrupteursSection hass={hass} onCompte={surCompteInter} />}
      {tab === 'regles' && aD('regles') && (() => {
        const noms = { volets: tr('Volets'), fenetres: tr('Chauffage'), presence: tr('Départ et retour'), nuit: tr('La nuit'),
          // Le moteur du chauffage : « Chauffage » nomme déjà la règle des fenêtres (plan 2, choix 16).
          chauffage: tr('Planning de chauffe'),
          // Le mode enfant (chantier Mode enfant, E11) : le plafond qui ramène, la coupure, la pause au coucher.
          enfant: tr('Mode enfant'),
          // Les veilles (audit du 19/10, H3) : la ventilation du CO₂, les heures creuses, et leur téléphone.
          veilles: tr('Veilles') };
        // « Tous » : tous ceux qui ont répondu — un module muet ne compte pas.
        const { actifs, tous } = etatObservation(observe);
        // Des regles qui n'agissent plus : un etat d'attention (ADR 0047).
        const texte = !observe ? tr('Lecture…')
          : !actifs.length ? tr('Les règles agissent normalement.')
            : tous ? tr('Les règles automatiques notent ce qu’elles feraient ; minuteurs et boutons agissent toujours.')
              : tr('En observation : {liste}', { liste: actifs.map(k => noms[k]).join(', ') });
        /* Un module = un panneau à sa teinte, ses règles en lignes (maquette v3, 03/11). La teinte passe
         * par `--o-regle-teinte`, que lit la puce de chaque `RegleEntete`. */
        const MODULES = [['volets', 'purple', VoletsReglages], ['fenetres', 'orange', FenetresReglages], ['presence', 'ok', PresenceReglages],
          ['nuit', 'cyan', NuitReglages], ['veilles', 'warn', VeillesReglages]];
        const mod = MODULES.find(m => m[0] === ongletRegle);
        const Module = mod && mod[2];
        return (<>
          {/* Au téléphone (maquette v4), « Observer sans agir » a sa pastille ; ailleurs, il est dans l'en-tête. */}
          {!avecRail && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 12, background: 'var(--o-s1)', alignSelf: 'flex-start', maxWidth: '100%', boxSizing: 'border-box' }}>
              <span style={{ lineHeight: 1.25, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800 }}>{tr('Observer sans agir')}</span>
                <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: actifs.length ? 'var(--o-warn)' : 'var(--o-text2)' }}>{texte}</span>
              </span>
              <BasculeTel on={actifs.length > 0} cb={basculerObserve} off={!observe} nom={tr('Observer sans agir')} />
            </div>
          )}
          {/* En observation, la page le dit sous l'en-tête — et ce qui agit malgré tout : la sûreté (audit du 19/10,
            * ADR 0250), les minuteurs et les boutons. */}
          {actifs.length > 0 && (
            <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 14, background: 'rgba(var(--o-warn-rgb),.1)', border: '1px solid rgba(var(--o-warn-rgb),.32)', fontSize: 12.5, fontWeight: 700, lineHeight: 1.45 }}>
              <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--o-warn-rgb),.18)' }}><Fi i="eye" size={13} color="var(--o-warn)" /></span>
              <span>{tous ? tr('Observer sans agir : les règles notent ce qu’elles feraient. La sûreté, les minuteurs et les boutons agissent toujours.') : texte + ' · ' + tr('sauf la sûreté')}</span>
            </div>
          )}
          {/* Ce que la dernière bascule d'« Observer sans agir » n'a pas pu poser
            * (audit du 03/10). Sous la barre, pour ne pas la déformer. `alert`
            * se dit à sa CRÉATION (WAI-ARIA 1.2, comme le toast d'App.jsx) : le
            * bandeau n'est monté qu'avec son texte, et `setObsRefus('')` le
            * démonte avant chaque bascule — un même refus se redit. */}
          {obsRefus && (
            <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: 14, background: 'rgba(var(--o-bad-rgb),.10)', border: '1px solid rgba(var(--o-bad-rgb),.45)', color: 'var(--o-bad)', fontSize: 12.5, fontWeight: 700, lineHeight: 1.45 }}>
              <Fi i="triangle-warning" size={15} color="var(--o-bad)" />
              <span>{obsRefus}</span>
            </div>
          )}
          {/* La journée, passée et à venir : sur un écran large seulement — la maquette du téléphone ne la montre pas. */}
          {avecRail && <FriseJour hass={hass} />}
          <div className="o-onglets" style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 12, background: 'var(--o-well)', overflowX: 'auto', scrollbarWidth: 'none', width: 'fit-content', maxWidth: '100%', boxSizing: 'border-box' }}>
            {[['volets', tr('Volets')], ['fenetres', tr('Chauffage')], ['presence', tr('Départ et retour')], ['nuit', tr('La nuit')], ['veilles', tr('Veilles')], ['journal', tr('Journal')]].map(([id, nom]) => {
              const on = ongletRegle === id;
              // Choisi = bleu plein, texte blanc (sa règle des puces).
              return <button key={id} type="button" onClick={() => setOngletRegle(id)} aria-pressed={on}
                style={{ flex: 'none', padding: '7px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', transition: 'background .2s', background: on ? 'var(--o-accent-fond)' : 'transparent', color: on ? '#fff' : 'var(--o-text2)' }}>{nom}</button>;
            })}
          </div>
          {Module ? (
            <div style={{ '--o-regle-teinte': 'var(--o-' + mod[1] + ')' }}>
              <Panneau titre={noms[mod[0]]} desc={tr('Touchez une règle pour la régler.')}>
                <Module hass={hass} cardSt={{ padding: '14px 22px', borderTop: FILET }} />
              </Panneau>
            </div>
          ) : <JournalReglages hass={hass} tel={!avecRail} />}
        </>);
      })()}
      {tab === 'maj' && aD('maj') && (() => {
        /* Le groupe d'une mise a jour : l'integration qui la publie — les
         * firmwares Zigbee ensemble, les modules HACS ensemble. */
        const groupe = (u) => {
          const meta = LOGGIA_INDEX && LOGGIA_INDEX.entityMeta && typeof LOGGIA_INDEX.entityMeta.get === 'function' ? LOGGIA_INDEX.entityMeta.get(u.id) : null;
          const p = (meta && meta.platform) || '';
          if (p === 'mqtt') return { g: tr('Firmwares · Zigbee2MQTT'), icone: 'terminal', rang: 0 };
          if (p === 'zha') return { g: tr('Firmwares · ZHA'), icone: 'terminal', rang: 1 };
          if (p === 'hacs') return { g: tr('Modules · HACS'), icone: 'apps', rang: 2 };
          if (p === 'esphome') return { g: 'ESPHome', icone: 'microchip', rang: 3 };
          if (p === 'hassio' || /^update\.home_assistant_/.test(u.id)) return { g: 'Home Assistant', icone: 'home', rang: 4 };
          return { g: tr('Autres'), icone: 'download', rang: 5 };
        };
        const groupes = [];
        ups.forEach(u => { const { g, icone, rang } = groupe(u); let e = groupes.find(x => x.g === g); if (!e) { e = { g, icone, rang, items: [] }; groupes.push(e); } e.items.push(u); });
        groupes.sort((a, b) => a.rang - b.rang);
        const btnIgnorer = { padding: '8px 14px', borderRadius: 11, background: 'transparent', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text2)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' };
        const btnInstaller = (arme) => ({ padding: '8px 15px', borderRadius: 11, cursor: 'pointer', flexShrink: 0, fontSize: 12.5, fontWeight: 800, fontFamily: 'inherit', transition: 'background .2s',
          background: arme ? 'var(--o-warn2)' : 'rgba(var(--o-accent-rgb),.14)', border: '1px solid ' + (arme ? 'var(--o-warn2)' : 'rgba(var(--o-accent-rgb),.5)'), color: arme ? '#fff' : 'var(--o-accent-soft)' });
        return (
        <Panneau>
          {ups.length === 0
            ? <div style={{ padding: '28px 22px 24px', textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--o-ok-rgb),.14)' }}><Fi i="check" size={22} color="var(--o-ok)" /></div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--o-ok)' }}>{tr('Tout est à jour')}</div>
                <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginTop: 3 }}>{trN(upsTotal, '{n} module suivi', '{n} modules suivis')}</div>
              </div>
            : groupes.map((gr, gi) => (
              <div key={gr.g}>
                <div style={{ ...CAPITALES, padding: '16px 22px 12px', borderTop: gi ? FILET : 'none' }}>{gr.g}</div>
                {gr.items.map(u => (
                  <div key={u.id} className="o-optrow" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 22px', borderTop: FILET }}>
                    <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--o-s1)', color: 'var(--o-text2)' }}>
                      <LogoMaj pic={u.pic} plateforme={u.plateforme} icone={gr.icone} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                      <div style={{ ...MONO, fontSize: 11.5, color: 'var(--o-text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.prog !== false
                          ? <span style={{ color: 'var(--o-accent-soft)' }}>{tr('Installation…')}{typeof u.prog === 'number' ? ' ' + Math.round(u.prog) + ' %' : ''}</span>
                          : u.avail ? (u.installed || '?') + ' → ' + (u.latest || '?') : tr('À jour') + ' · ' + (u.installed || '—')}
                      </div>
                    </div>
                    {u.avail && u.prog === false && <>
                      {u.notes && <a href={u.notes} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--o-accent-soft)', textDecoration: 'none', padding: '0 6px', flexShrink: 0 }}>{tr('Notes')}</a>}
                      <button onClick={() => updCall('skip', u.id)} title={tr('Ignorer cette version')} style={btnIgnorer}>{tr('Ignorer')}</button>
                      <button onClick={() => askInstall(u)} style={btnInstaller(updConfirm === u.id)}>{updConfirm === u.id ? tr('Confirmer ?') : tr('Installer')}</button>
                    </>}
                    {u.prog !== false && <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--o-bd1)', borderTopColor: 'var(--o-accent)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
                  </div>
                ))}
              </div>
            ))}
        </Panneau>
        );
      })()}

      {tab === 'appareils' && <AppareilsReglages peutOublier={isAdmin} profil={prenom} role={(users[userIdx] || {}).role} tel={!avecRail} profils={users.map(u => nomProfil(u.name || ''))} />}
      {tab === 'about' && (() => {
        const cacheKb = (() => { try { let n = 0; for (let k = 0; k < localStorage.length; k++) { const key = localStorage.key(k); n += (localStorage.getItem(key) || '').length + key.length; } return Math.round(n / 1024 * 10) / 10; } catch { return null; } })();
        const inst = installationReelle();
        /* « À jour » ou « vX disponible », à côté de la version (revenu le 03/11 : la maquette v3 l'avait perdu, et un compte
         * ordinaire, sans la section Mises à jour, ne voyait plus rien). Sans entité de suivi, rien : mieux vaut se taire
         * que d'annoncer « à jour » sans l'avoir vérifié. */
        const etatVersion = inst.aJour === null ? null : inst.aJour
          ? <Pastille niveau="ok" point>{tr('À jour')}</Pastille>
          : <Pastille niveau="alerte" point>{inst.disponible ? tr('v{v} disponible', { v: String(inst.disponible).replace(/^v/, '') }) : tr('Mise à jour disponible')}</Pastille>;
        const nombre = (v) => Number(v).toLocaleString(locale(), { maximumFractionDigits: 1 });
        /* Sauvegarder la configuration COMPLETE : celle du serveur, partagee
         * entre tous les appareils, et non le seul navigateur. Un serveur muet
         * le dit, au lieu d'un bouton qui ne fait rien. */
        const exporter = async () => {
          try {
            const j = await exportConfigComplete();
            if (!telechargerConfig(j, 'loggia-config')) throw new Error(PAS_DE_FICHIER);
          } catch (err) { alerter({ titre: tr('Exporter'), texte: tr('Export impossible : ') + motifEchec(err) }); }
        };
        /* Les diagnostics (ADR 0325) : le fichier à joindre à un ticket. Home Assistant ne le sert qu'à un
         * administrateur ; la démonstration n'a pas de composant. */
        const peutDiag = isAdmin && !!hass && typeof hass.callWS === 'function' && !(typeof window !== 'undefined' && window.__loggiaDemo);
        const telechargerDiag = () => telechargerDiagnostics(hass)
          .catch((err) => alerter({ titre: tr('Diagnostics'), texte: tr('Téléchargement impossible : ') + motifEchec(err) }));
        // Des noms propres, qui ne se traduisent pas.
        const POLICES = 'Manrope · Newsreader', DEPOT = 'github.com/Alardware/loggia';
        const valeur = { ...MONO, fontSize: 13, fontWeight: 700, color: 'var(--o-text)', whiteSpace: 'nowrap' };
        const texte = { fontSize: 13.5, fontWeight: 800, color: 'var(--o-text1)', whiteSpace: 'nowrap' };
        /* Liens du projet : navigation volontaire au clic — rien n'est charge
         * depuis GitHub tant qu'on ne tape pas. */
        const ouvrir = (url, nom) => (
          <a href={url} target="_blank" rel="noopener noreferrer" aria-label={nom}
            style={{ width: 34, height: 34, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text2)' }}>
            <Fi i="arrow-up-right-from-square" size={13} />
          </a>
        );
        return avecRail ? (
        <>
          {/* Maquette v3 (02/11) : le nom et la version en grand, à la place du
            * titre de la section ; puis Installation, Revenir en arrière, les
            * liens et la remise à zéro. */}
          <div style={{ maxWidth: '60ch' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              {avecRail
                ? <h1 style={{ margin: 0, fontSize: 40, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1 }}>Loggia</h1>
                : <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1 }}>Loggia</span>}
              {inst.version && <span style={{ fontSize: 14, fontWeight: 800 }}>{inst.version}</span>}
              {etatVersion}
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: 'var(--o-text2)', marginTop: 8 }}>{tr('Un tableau de bord pour Home Assistant, servi par sa propre intégration. Rien ne sort de chez vous.')}</div>
          </div>

          {/* Toujours affichée : l'installation N'EST PAS un réglage, c'est la
            * réponse à « quelle version ai-je ? » (retour 02/09). */}
          <Panneau titre={tr('Installation')}
            pied={<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginLeft: 'auto' }}>
              {/* Sauvegarder la configuration COMPLETE : celle du serveur,
                  partagee entre tous les appareils, et non le seul navigateur.
                  Un serveur muet le dit, au lieu d'un bouton qui ne fait rien. */}
              <button onClick={exporter} style={btnSecondaire}><Fi i="download" size={13} />{tr('Exporter la configuration')}</button>
              {/* L'import reste un geste d'administrateur : il remplace la
                  configuration de toute la maison. */}
              {isAdmin && <ImportConfigBtn />}
            </div>}>
            {hass && hass.config && hass.config.version && <Ligne titre="Home Assistant"><span style={valeur}>{hass.config.version}</span></Ligne>}
            <Ligne titre={tr('Socle')} desc={tr('Construit et servi depuis Home Assistant')}><span style={texte}>React + Vite</span></Ligne>
            <Ligne titre={tr('Typographie')} desc={tr('Auto-hébergée, sans CDN')}><span style={texte}>{POLICES}</span></Ligne>
            <Ligne titre={tr('Cache de cet écran')} desc={tr('Les états et les réglages gardés ici')}>
              <span style={valeur}>{cacheKb != null ? (cacheKb >= 1024 ? nombre(cacheKb / 1024) + ' ' + tr('Mo') : nombre(cacheKb) + ' ' + tr('Ko')) : '—'}</span>
            </Ligne>
          </Panneau>

          {/* Les copies que le composant garde avant les écritures (ADR 0285) :
            * en remettre une remplace la configuration de toute la maison,
            * comme l'import — les mêmes comptes, la même garde. */}
          {isAdmin && <VersionsPrecedentes hass={hass} motif={motifEchec} alerter={alerter} />}

          <Panneau>
            <Ligne ico="code-branch" titre={tr('Le code')} desc={<span style={MONO}>{DEPOT}</span>} style={{ borderTop: 'none' }}>
              {ouvrir('https://github.com/Alardware/loggia', tr('Le code'))}
            </Ligne>
            <Ligne ico="exclamation" titre={tr('Signaler un problème')}>
              {ouvrir('https://github.com/Alardware/loggia/issues', tr('Signaler un problème'))}
            </Ligne>
            {peutDiag && <Ligne ico="download" titre={tr('Diagnostics')} desc={tr('À joindre à un ticket : la forme de votre configuration, sans aucun nom ni adresse.')}>
              <button type="button" onClick={telechargerDiag} style={btnSecondaire}>{tr('Télécharger')}</button>
            </Ligne>}
          </Panneau>

          {/* La remise a zero vide la configuration de la MAISON — vues,
            * profils, regles, scenarios — et non ce seul appareil. */}
          {isAdmin && (
            <Panneau niveau="danger" titre={tr('Tout remettre à zéro')} desc={tr('Pour toute la maison — une sauvegarde part d’abord. Les automatisations Home Assistant ne sont pas touchées.')}
              droite={<ResetLoggiaBtn />} />
          )}

          {/* SA regle (18/09) : la pastille Ko-fi garde son dessin et reste en bas,
            * sous la zone rouge — elle prime sur la maquette, qui la rangeait parmi les liens. */}
          <PastilleKofi />
        </>
        ) : (
        /* Le téléphone (maquette v4) : le nom et la version dans une carte,
         * les sauvegardes, l'installation, le projet, la remise à zéro. La
         * pastille Ko-fi reste seule, en bas, sous la zone rouge (sa règle). */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 18, borderRadius: 20, background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
            <img src="./logo.png" alt="" width={46} height={46} style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, display: 'block' }} />
            <div style={{ lineHeight: 1.35, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Loggia{inst.version ? ' ' + inst.version : ''}</div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text2)' }}>{(hass && hass.config && hass.config.version ? 'Home Assistant ' + hass.config.version + ' · ' : '') + tr('rien ne sort de chez vous')}</div>
              {etatVersion && <div style={{ marginTop: 6 }}>{etatVersion}</div>}
            </div>
          </div>
          {isAdmin && <VersionsPrecedentes hass={hass} motif={motifEchec} alerter={alerter} tel />}
          <CarteTel titre={tr('Installation')}>
            <LignesTel>
              {hass && hass.config && hass.config.version && <LigneTel titre="Home Assistant"><span style={valeur}>{hass.config.version}</span></LigneTel>}
              <LigneTel titre={tr('Socle technique')} desc={tr('Construit et servi depuis Home Assistant')}><span style={texte}>React + Vite</span></LigneTel>
              <LigneTel titre={tr('Typographie')} desc={tr('Auto-hébergée, sans CDN')}><span style={texte}>{POLICES}</span></LigneTel>
              <LigneTel titre={tr('Cache local')} desc={tr('États des entités et réglages de cet appareil')}>
                <span style={valeur}>{cacheKb != null ? (cacheKb >= 1024 ? nombre(cacheKb / 1024) + ' ' + tr('Mo') : nombre(cacheKb) + ' ' + tr('Ko')) : '—'}</span>
              </LigneTel>
              <LigneTel titre={tr('Configuration')} desc={tr('Vues, profils, règles et apparence, dans un fichier.')}>
                <button type="button" onClick={exporter} style={btnTel}><Fi i="download" size={11} />{tr('Exporter')}</button>
                {isAdmin && <ImportConfigBtn />}
              </LigneTel>
            </LignesTel>
          </CarteTel>
          <CarteTel titre={tr('Le projet')}>
            <LignesTel>
              <LigneTel ico="code-branch" titre={tr('Code source')} desc={DEPOT} mono>
                <a href="https://github.com/Alardware/loggia" target="_blank" rel="noopener noreferrer" style={lienTel}>{tr('Ouvrir')}<Fi i="angle-small-right" size={13} /></a>
              </LigneTel>
              <LigneTel ico="exclamation" titre={tr('Signaler un problème')}>
                <a href="https://github.com/Alardware/loggia/issues" target="_blank" rel="noopener noreferrer" style={lienTel}>{tr('Ouvrir')}<Fi i="angle-small-right" size={13} /></a>
              </LigneTel>
              {peutDiag && <LigneTel ico="download" titre={tr('Diagnostics')} desc={tr('À joindre à un ticket : la forme de votre configuration, sans aucun nom ni adresse.')}>
                <button type="button" onClick={telechargerDiag} style={btnTel}>{tr('Télécharger')}</button>
              </LigneTel>}
            </LignesTel>
          </CarteTel>
          {isAdmin && (
            <CarteTel style="danger" chip="trash" chipFond="rgba(var(--o-bad-rgb),.16)" chipCouleur="var(--o-bad)" titre={tr('Tout remettre à zéro')} desc={tr('Pour toute la maison, une sauvegarde part d’abord.')}>
              <LignesTel>
                <LigneTel titre={tr('Remettre Loggia comme au premier jour')}><ResetLoggiaBtn /></LigneTel>
              </LignesTel>
            </CarteTel>
          )}
          <PastilleKofi />
        </div>
        );
      })()}
        </div>
      )}
      </div>
    </div>
  );
}

/* La pastille Ko-fi d'« À propos », à l'ordinateur comme au téléphone. Rien
 * n'est charge depuis ko-fi.com tant qu'on ne tape pas : la tasse est dessinee
 * ici plutot que servie par leur CDN. Elle garde son dessin (sa regle). */
function PastilleKofi() {
  return (
    <a href="https://ko-fi.com/alardware" target="_blank" rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignSelf: 'center', alignItems: 'center', gap: 10, padding: '13px 26px', borderRadius: 999, background: '#72a4f2', color: '#152744', fontSize: 14, fontWeight: 800, textDecoration: 'none', boxShadow: '0 10px 26px rgba(114,164,242,.26)' }}>
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M3 6.6h13v6.6a6.5 6.5 0 0 1-13 0z" fill="#fff" />
        <path d="M16.4 8.2h1.9a2.9 2.9 0 0 1 0 5.8h-1.9" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <path d="M9.5 16.5C6.4 14.3 5.1 13 5.1 11.6A2.4 2.4 0 0 1 9.5 10.6 2.4 2.4 0 0 1 13.9 11.6C13.9 13 12.6 14.3 9.5 16.5Z" fill="#ff5f5f" />
      </svg>
      {tr('Me soutenir sur Ko-fi')}
    </a>
  );
}

const HA_CFG_DEF = { local: '', remote: '', pollMs: 2000, fallback: true };

// Hash 32 bits additif par entité — remplace la concat de grosses strings pour les clés-préfixes.
