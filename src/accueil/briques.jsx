/* Les pièces de l’Accueil : la carte d’une pièce, les favoris, les onglets, « En ce moment », le ciel.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { cloneElement, useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { lazyRecharge } from '../recharge.js';
import { cfgSet, getHass } from '../state.js';
import { REDUCE_MOTION, useTilt, nomCarte, Fi, FlipText, Surface, cvEstTpl, cvId, cvKey, cvName } from '../ui.jsx';
import { NOMS_PRISE } from '../prises.js';
import { useOptimiste } from '../optimiste.js';
import { bloquerDefilement, defileurAuto } from '../glisser.js';
import { niveauMax, couleurNiveau, resumeAttention } from '../attention.js';
import { LISERE, sectionTitle } from '../styles.js';
import { Ico } from '../icones.jsx';
import { ambiancePiece } from '../ambiance.js';
import { ecartJours } from '../agenda.js';
import { scenariosAccueil, bordsDefilement } from '../scenarios.js';
import { tr, trN, locale } from '../i18n.js';
import { dec, lavisCarte, SURF_CARTE, useFlash, decMax, lireEpingles } from '../app/noyau.jsx';
import { RM_ICO, RM_CARD, RM_NAME, RM_SUB, RmBascule } from '../cartes/briques.jsx';
import { FicheRangee, useDomainCards } from '../appareils/fiches.jsx';
import { PlugIcon } from '../cartescustom/cartes.jsx';
import { habillagePiece, TEINTES_PIECE, ICONES_PIECE } from '../app/pieces.jsx';
import { useScenarios, CarteScenario } from '../app/scenarios.jsx';
import { BOUTON_COIN, boutonEdition, ChoixIcone, EditableCard } from '../edition/briques.jsx';
import { CV_TYPE_NOMS, cvTypeDe, cvW, cvAvecW, cvRowsDe, cvAvecH, nomCv, CvTyped, FicheCarte, CarteAjoutSheet, ChipsEditSheet } from '../cartescustom/galerie.jsx';

/* Tout module chargé à la demande passe par `lazyRecharge` (recharge.js,
 * audit du 03/10) : un fichier qu'une mise à jour HACS a retiré pendant que
 * la page restait ouverte la recharge une fois, au lieu de faire tomber tout
 * l'écran sur « Loggia n'a pas pu s'afficher ». Le fond météo est un DÉCOR :
 * introuvable même après le rechargement, il ne rend rien. */
const WeatherGL = lazyRecharge(() => import('../wx3d.jsx'), { decor: true });
/* Le plan 3D (chantier Plan 3D) : three.js et le modèle ne se chargent que
 * pour qui choisit « Plan » dans la section Pièces. */
const PlanPieces = lazyRecharge(() => import('../planpieces.jsx'));
/* La feuille de l'agenda : ouverte par la carte du rail, chargée à ce moment-là
 * (chantier Prises, la borne du démarrage). */
const FeuilleAgenda = lazyRecharge(() => import('../feuilleagenda.jsx').then(m => ({ default: m.FeuilleAgenda })));

/* ════════════ Reproduction fidèle de "Loggia Complet.dc.html" (Claude Design) ════════════
   Tokens --o-* dans index.css (dark = :root, light = html.loggia-light). Données démo (phase 1). */

// pseudo-random déterministe (= design : Math.sin) pour particules météo stables
const field = (n, mk) => Array.from({ length: n }, (_, i) => {
  const r = k => { const x = Math.sin((i + 1) * (k * 12.9 + 7.3)) * 43758.5; return x - Math.floor(x); };
  return mk(i, r);
});


// ── Effet météo du bandeau (suit `weather`) ──
function WeatherFx({ weather }) {
  // fondu croisé (opacity) au lieu d'un switch sec ; les couches inactives restent en DOM mais invisibles/inertes
  const show = on => ({ position: 'absolute', inset: 0, opacity: on ? 1 : 0, transition: REDUCE_MOTION ? 'none' : 'opacity 1.1s ease', pointerEvents: 'none', visibility: on ? 'visible' : 'hidden', transitionProperty: 'opacity, visibility', transitionDelay: on ? '0s' : '0s, 1.1s' });
  const sunOn = weather === 'sun' || weather === 'partly';
  const rain = field(22, (i, r) => <span key={i} style={{ position: 'absolute', top: '-14px', left: (r(1) * 100).toFixed(1) + '%', width: 2, height: (9 + r(2) * 8), borderRadius: 4, background: 'linear-gradient(transparent,rgba(196,216,255,.7))', animation: `brain ${(0.5 + r(3) * 0.4).toFixed(2)}s linear ${(-r(4) * 1.3).toFixed(2)}s infinite` }} />);
  const snow = field(20, (i, r) => <span key={i} style={{ position: 'absolute', top: '-10px', left: (r(1) * 100).toFixed(1) + '%', width: (4 + r(2) * 3), height: (4 + r(2) * 3), borderRadius: '50%', background: 'rgba(255,255,255,.9)', animation: `bsnow ${(2.4 + r(3) * 1.8).toFixed(2)}s linear ${(-r(4) * 3).toFixed(2)}s infinite` }} />);
  const leaves = field(10, (i, r) => { const c = ['#c79a52', '#a8b85a', '#d6a55e', '#bfae6b'][Math.floor(r(5) * 4)]; return <span key={i} style={{ position: 'absolute', top: (10 + r(1) * 60).toFixed(0) + 'px', right: (20 + r(6) * 120).toFixed(0) + 'px', left: 'auto', width: (11 + r(2) * 6), height: (11 + r(2) * 6), borderRadius: '2px 7px', background: c, boxShadow: '0 1px 3px rgba(0,0,0,.3)', animation: `bleaf ${(2.4 + r(3) * 1.6).toFixed(2)}s linear ${(-r(4) * 4).toFixed(2)}s infinite` }} />; });
  const stars = field(34, (i, r) => <span key={i} style={{ position: 'absolute', top: (r(1) * 80).toFixed(1) + '%', left: (r(6) * 100).toFixed(1) + '%', width: (1 + r(2) * 2), height: (1 + r(2) * 2), borderRadius: '50%', background: '#fff', animation: r(5) > 0.5 ? `btwk ${(1.8 + r(3) * 2.4).toFixed(2)}s ease-in-out ${(-r(4) * 3).toFixed(2)}s infinite` : 'none' }} />);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(120% 130% at 92% 14%,var(--o-sky),transparent 64%)', WebkitMaskImage: 'linear-gradient(90deg,transparent,#000 44%,#000 90%,transparent),linear-gradient(180deg,transparent,#000 18%,#000 84%,transparent)', WebkitMaskComposite: 'source-in', maskImage: 'linear-gradient(90deg,transparent,#000 44%,#000 90%,transparent),linear-gradient(180deg,transparent,#000 18%,#000 84%,transparent)', maskComposite: 'intersect', opacity: .82 }}>
      <div style={{ ...show(sunOn), top: '-6px', right: '40px', left: 'auto', width: 92, height: 92 }}>
        <div style={{ position: 'absolute', inset: 0, animation: 'bspin 60s linear infinite', background: 'repeating-conic-gradient(rgba(255,228,150,.5) 0deg 3deg,transparent 3deg 26deg)', WebkitMask: 'radial-gradient(circle,transparent 34%,#000 44%,#000 60%,transparent 74%)', mask: 'radial-gradient(circle,transparent 34%,#000 44%,#000 60%,transparent 74%)' }} />
        <div style={{ position: 'absolute', inset: 24, borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%,#fff3c4,#ffcf5a)', boxShadow: '0 0 30px rgba(255,206,90,.6)', animation: 'bsun 5s ease-in-out infinite' }} />
      </div>
      <div style={show(weather !== 'sun' && weather !== 'night')}>
        <svg width="180" height="86" viewBox="0 0 150 80" style={{ position: 'absolute', top: 10, right: 6, opacity: .5, animation: 'bdrift 9s ease-in-out infinite alternate' }}><path fill="rgba(255,255,255,.74)" d="M40 60 a23 23 0 0 1 2 -45 a27 27 0 0 1 50 6 a19 19 0 0 1 -2 39 Z" /></svg>
        <svg width="130" height="68" viewBox="0 0 150 80" style={{ position: 'absolute', top: 54, right: 140, opacity: .4, animation: 'bdrift 12s ease-in-out infinite alternate-reverse' }}><path fill="rgba(255,255,255,.62)" d="M40 60 a23 23 0 0 1 2 -45 a27 27 0 0 1 50 6 a19 19 0 0 1 -2 39 Z" /></svg>
      </div>
      <div style={show(weather === 'rain' || weather === 'storm')}>{rain}</div>
      <div style={show(weather === 'snow')}>{snow}</div>
      <div style={show(weather === 'storm')}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(228,238,255,.5),transparent 60%)', animation: 'bflash 4.5s linear infinite' }} />
        <svg width="44" height="64" viewBox="0 0 40 62" style={{ position: 'absolute', top: 8, right: 120, animation: 'bflash 4.5s linear infinite', filter: 'drop-shadow(0 0 5px rgba(255,244,180,.9))' }}><path fill="none" stroke="#fff8cc" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="M23 1 L15 13 L21 16 L11 28 L18 31 L8 45 L16 47 L9 61" /></svg>
      </div>
      <div style={show(weather === 'wind')}>{leaves}</div>
      <div style={show(weather === 'night')}>{stars}<div style={{ position: 'absolute', top: 8, right: 40, width: 46, height: 46, borderRadius: '50%', background: 'radial-gradient(circle at 36% 34%,#fdfcf3,#cdd6e6 64%,#a6b2c8)', boxShadow: '0 0 20px 5px rgba(206,222,255,.4)' }} /></div>
    </div>
  );
}
// Nombre qui « roule » vers sa valeur (rAF, easeOutCubic). Re-anime à chaque changement de cible.
// <Num v={23.4} d={1} suffix="°" /> : chiffre animé, tabular-nums pour éviter le tremblement de largeur.
function Num({ v, d = 0, prefix = '', suffix = '', fallback = '—', fmt }) {
  // Valeur affichee telle quelle. Les chiffres roulaient de zero vers leur
  // valeur a l'ouverture : joli une fois, penible a chaque chargement, et
  // trompeur quand l'animation ne demarrait pas — la page restait alors sur des
  // zeros qui passaient pour des mesures.
  const a = (typeof v === 'number' && isFinite(v)) ? v : null;
  if (a == null) return <>{fallback}</>;
  const txt = fmt ? fmt(a) : (d > 0 ? dec(a, d) : String(Math.round(a)));
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{prefix}{txt}{suffix}</span>;
}
// ── Animations lot 5 ──
// <Skel w h r> : placeholder shimmer tant que la donnée n'est pas là (remplace les valeurs démo au boot)
function Skel({ w = 60, h = 14, r = 6, style }) {
  return <span className="o-skel" aria-hidden="true" style={{ display: 'inline-block', width: w, height: h, borderRadius: r, verticalAlign: 'middle', ...style }} />;
}

/* La taille d'une tuile piece quand personne ne l'a choisie.
 *
 * Trois appareils, trois reponses. L'ordinateur a la place : tout en
 * standard, la carte complete. Le telephone ne l'a pas : tout en puce. La
 * tablette est entre les deux — une MOSAIQUE sur trois colonnes, les deux
 * coins du haut et le milieu du bas en grand, le reste en puce. Le regard s'y
 * accroche a trois endroits au lieu de balayer six cartes identiques.
 *
 *   [GRANDE][petite][GRANDE]
 *   [petite][GRANDE][petite]
 *
 * Le motif se repete au-dela de six pieces : rangee paire, les bords ;
 * rangee impaire, le centre.
 */
function tailleParDefaut(i, tactile, large) {
  if (!tactile) return 's';
  if (!large) return 'c';
  const col = i % 3;
  return (Math.floor(i / 3) % 2 === 0) ? (col === 1 ? 'c' : 's') : (col === 1 ? 's' : 'c');
}

// Carte de pièce : le liseré du réglage (04/10), comme toutes les cartes.
const card = { background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: LISERE };
function rgbDePiece(p) {
  if (p && p.rgb) return p.rgb;
  const s = String((p && p.bg) || '').trim();
  if (s.slice(0, 5) !== 'rgba(' || s.slice(-1) !== ')') return null;
  const i = s.lastIndexOf(',');
  return i > 5 ? s.slice(5, i) : null;   // « var(--o-accent-rgb) » comme « 96,165,250 »
}
/* La bordure dit l'état de la pièce, comme dans la maquette v2 : ambre si
 * quelque chose cloche (fenêtre ouverte, CO₂ élevé), sinon la teinte de la
 * pièce quand elle est allumée, sinon le gris de tout le monde.
 *
 * L'ambre passe AVANT la teinte : une chambre au repos dont la fenêtre est
 * ouverte doit se voir, et c'est le seul cas où une carte éteinte porte une
 * couleur. La LARGEUR reste celle du réglage « Liserés » — coupe-le, et ces
 * filets se coupent avec les autres. */
function bordPiece(p, on, amb) {
  if (amb && amb.niveau === 'probleme') return 'var(--o-bw,1px) solid rgba(var(--o-warn2-rgb),.42)';
  const rgb = on ? rgbDePiece(p) : null;
  return rgb ? `var(--o-bw,1px) solid rgba(${rgb},.26)` : LISERE;
}
function lavisPiece(p, on) {
  return on ? lavisCarte(rgbDePiece(p)) : SURF_CARTE;
}

// Mini-pilule d'action des tuiles pièces — même gabarit 38×26 r9 que les
// minis des cartes denses.
const MINI_PIECE = { width: 38, height: 26, borderRadius: 10, border: 'none', background: 'var(--o-s1)', color: 'var(--o-text2)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 };
function PieceCard({ p, onOpen, compact = false, chip = false, lights = null, mains = null, attente = false, onToggleLights, covers = null, clim = null, idx = 0, ambiance = null }) {
  // Format compact (PC ≥1180) : compteur = toutes les lumières de la pièce ; interrupteur = `mains`, les lampes du bouton (sans les veilleuses, ADR 0261)
  const tilt = useTilt(4);
  const [flashRef, flash] = useFlash();
  // La mini-courbe 24 h a été retirée (retour 01/09) : la teinte de la pièce
  // et la température suffisent, et l'historique n'est plus interrogé.
  // Optimiste : l'interrupteur bascule tout de suite, puis se réconcilie avec HA au poll suivant.
  // `mains` vide alors que la pièce a des lampes : il ne reste que des veilleuses (ADR 0261) — la tuile est ÉTEINTE, pas
  // « inconnue » ; vide ET sans lampe, on ne sait rien (null : l'optimiste ne se jette pas, voir useOptimiste).
  const realOn = (mains && mains.length) ? mains.some(l => l.on) : (mains && lights && lights.length ? false : null);
  // Le filet des 6 s est celui d'`useOptimiste`, comme partout ailleurs.
  const [ov, setOv] = useOptimiste(realOn);
  /* `attente` (audit du 19/10, B15 — les veilleuses sont épargnées PARTOUT) : la règle Nuit n'est pas encore lue, on ne sait pas
   * quelles lampes épargner. L'interrupteur est dessiné à sa place, grisé et inerte : un appui ne touche aucune lampe, et ne
   * bascule pas l'affichage. La règle lue, il reste là, actif — sauf dans une pièce qui n'a QUE sa veilleuse : `mains` se vide,
   * il n'y a plus rien à commander, le bouton s'en va (ADR 0262, corrigée le 19/10). */
  const doToggle = () => { if (attente) return; flash(p.tc || 'var(--o-accent)'); if (realOn != null) setOv(!(ov != null ? ov : realOn)); onToggleLights && onToggleLights(); };
  const inerte = attente ? { 'aria-disabled': true } : {};
  if (chip) {
    // Pièce COMPACTE, direction « teinte pièce » (choix 31/08) : la couleur de
    // la pièce baigne la carte (son lavis en dégradé), icône NUE sans boîte,
    // switch 44×25 en haut, nom puis « 22,1° · état » en bas (maquette 1b,
    // 03/10). Une rangée de 88 px.
    const n = lights ? lights.filter(l => l.on).length : (p.status.kind === 'active' ? p.status.n : 0);
    // La ligne d'etat (ADR 0029) : un probleme, sinon l'activite, sinon le calme.
    const amb = lights ? ambiancePiece({ lumieres: n, lampes: lights.length, ...(ambiance || {}), co2: p.live && p.live.co2 }) : null;
    const on = ov != null ? ov : (realOn != null ? realOn : n > 0);
    const canToggle = !!(mains && mains.length && onToggleLights);
    const temp = p.live && p.live.temp != null ? decMax(p.live.temp, 1) + '°' : null;
    const etat = amb ? amb.texte : '—';
    return (
      /* Comme la carte standard (plan M7) : pas de `role="button"` autour de
       * l'interrupteur de lumiere, sans quoi il disparait d'un lecteur
       * d'ecran. La correction avait ete posee sur les deux autres gabarits et
       * oubliee ici — repere par l'audit du 23/09. */
      <div className="o-piece o-piecechip"
        style={{ position: 'relative', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 4, padding: '11px 14px', borderRadius: 'var(--o-radius,18px)', overflow: 'hidden',
          background: lavisPiece(p, on),
          border: bordPiece(p, on, amb),
          /* Le fond, le liseré et l'ombre seulement (lot 7 de l'audit du 28/10, V9) : `all` animait aussi la couleur du texte,
           * héritée. Au chargement en thème clair, le nom passait par le blanc du thème sombre — et restait figé là dans un
           * onglet en arrière-plan (1,08:1 mesuré). */
          boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', transition: 'background .25s, border-color .25s, box-shadow .25s' }}>
        <span ref={flashRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 'var(--o-radius,18px)', pointerEvents: 'none' }} />
        {/* Le bouton de surface : il couvre la pastille et passe sous
          * l'interrupteur, qui est positionne et donc peint apres lui. */}
        {/* `o-surface` (lot 13 de l'audit du 03/10) : l'anneau de focus se
          * trace en dedans — la carte rogne ce qui dépasse, il ne se voyait pas. */}
        <button type="button" className="o-surface" onClick={onOpen} aria-label={nomCarte(p.name, temp, amb && amb.texte)}
          style={{ position: 'absolute', inset: 0, border: 'none', background: 'transparent', padding: 0, margin: 0, borderRadius: 'var(--o-radius,18px)', cursor: 'pointer' }} />
        {/* Maquette 1b (03/10) : l'icone et l'interrupteur tiennent la ligne
          * du haut ; le nom et « 20,4° · Tout eteint » ont toute la largeur en
          * bas. Sur une seule ligne, le nom n'avait plus que 24 a 59 px au
          * telephone (« Cuis… », « Sall… ») — audit du 03/10. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 25 }}>
          <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{cloneElement(p.icon, { size: 24 })}</span>
          {canToggle && (
            <span role="switch" aria-checked={on} aria-label={tr('Lumières') + ' ' + p.name} tabIndex={0} {...inerte}
              onClick={e => { e.stopPropagation(); doToggle(); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); doToggle(); } }}
              style={{ width: 44, height: 25, borderRadius: 14, position: 'relative', zIndex: 1, cursor: 'pointer', flexShrink: 0, background: on ? 'linear-gradient(135deg,var(--o-lampe),var(--o-lampe-b))' : 'var(--o-bd1)', transition: 'background .25s', ...(attente ? { cursor: 'default', opacity: .5 } : null) }}>
              <span style={{ position: 'absolute', top: 3, left: on ? 22 : 3, width: 19, height: 19, borderRadius: '50%', background: '#fff', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)', boxShadow: '0 2px 5px rgba(0,0,0,.3)' }} />
            </span>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
          {/* `o-chip-etat` : sous 340 px, cette ligne passe à 11 px et la carte serre ses bords (index.css, lot 7 de l'audit
            * du 28/10, V6) — « 22,8° · Tout est éteint » se coupait à 320 px, il lui manquait 10 px. */}
          <div className="o-chip-etat" style={{ fontSize: 12, fontWeight: 600, color: amb ? amb.couleur : 'var(--o-text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {temp && <><span style={{ color: p.tc, fontWeight: 800 }}>{temp}</span> · </>}{amb && amb.icone ? <Fi i={amb.icone} size={11} style={{ marginRight: 4 }} /> : null}{etat}
          </div>
        </div>
      </div>
    );
  }
  if (compact) {
    const n = lights ? lights.filter(l => l.on).length : (p.status.kind === 'active' ? p.status.n : 0);
    // La ligne d'etat (ADR 0029) : un probleme, sinon l'activite, sinon le calme.
    const amb = lights ? ambiancePiece({ lumieres: n, lampes: lights.length, ...(ambiance || {}), co2: p.live && p.live.co2 }) : null;
    const on = ov != null ? ov : (realOn != null ? realOn : n > 0);
    const canToggle = !!(mains && mains.length && onToggleLights);
    /* Relecture du lot 13 : les deux tuiles RENDUES de l'Accueil se nomment
     * comme les autres cartes, de ce qu'elles affichent — « Salon, 20,4°,
     * Tout est éteint » —, et non plus « Ouvrir la pièce Salon », qui taisait
     * l'état. La température se calcule comme celle de la `chip` ; jamais
     * `etat`, qui vaut « — » sans ambiance. Elles changent de vue : pas
     * d'`aria-haspopup`. */
    const temp = p.live && p.live.temp != null ? decMax(p.live.temp, 1) + '°' : null;
    return (
      /* La carte n'est PLUS un `role="button"` qui englobe tout (23/09, plan
       * M7). Un rôle bouton rend sa descendance présentationnelle : les deux
       * minis d'action et l'interrupteur de lumière, pourtant de vrais
       * contrôles nommés, disparaissaient d'un lecteur d'écran — sept
       * commandes invisibles sur l'Accueil de la démo.
       *
       * À la place : un bouton de SURFACE, frère des contrôles, qui porte le
       * geste « ouvrir la pièce » et se laisse couvrir par eux. Rien ne bouge
       * à l'œil, et la tabulation passe sur quatre choses distinctes. */
      <div ref={tilt.ref} onPointerMove={tilt.onPointerMove} onPointerLeave={tilt.onPointerLeave} onPointerCancel={tilt.onPointerCancel} className={'o-piece o-piecestd o-stag ' + (tilt.className || '')} style={{ ...card, position: 'relative', display: 'flex', flexDirection: 'column', borderRadius: 14, padding: '14px 15px 12px', overflow: 'hidden',
        // Direction « teinte pièce » (choix 31/08) : le lavis de la pièce
        // baigne la surface en permanence, l'icône est nue, la température en
        // héros. Sans halo doré (retour 01/09) : l'interrupteur allumé dit
        // déjà que la pièce est éclairée.
        background: lavisPiece(p, on),
        border: bordPiece(p, on, amb),
        boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.36))',
        transition: 'box-shadow .3s ease, background .3s ease' }}>
        {/* Le bouton de surface : il couvre la carte, passe SOUS les contrôles
          * du pied (positionnés, donc peints après lui) et porte le nom de
          * la carte. `inset: 0` plutôt qu'un `onClick` sur la carte : un bouton
          * réel se tabule, s'annonce et répond à Entrée comme à l'Espace. */}
        <button type="button" className="o-surface" onClick={onOpen} aria-label={nomCarte(p.name, temp, amb && amb.texte)}
          style={{ position: 'absolute', inset: 0, border: 'none', background: 'transparent', padding: 0, margin: 0, borderRadius: 14, cursor: 'pointer' }} />
        {/* calque de flash séparé : ne touche ni au transform du tilt ni au box-shadow de la carte */}
        <span ref={flashRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 14, pointerEvents: 'none' }} />
        {/* En-tête à hauteur RÉSERVÉE (49 = température 26 + 5 + badge 18) :
          * avec ou sans badge d'air, le nom et le pied tombent au même endroit
          * — sinon deux pièces voisines n'ont pas le même rythme (retour
          * 01/09). */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', minHeight: 49 }}>
          <span style={{ display: 'flex', alignItems: 'center', minHeight: 38 }}>{cloneElement(p.icon, { size: 34 })}</span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span style={{ fontSize: 25, fontWeight: 800, color: p.tc, lineHeight: 1 }}>{p.live ? (p.live.temp != null ? <Num v={p.live.temp} d={1} suffix="°" /> : '—') : <Skel w={52} h={22} />}</span>
            {p.live && p.badge && <span style={{ fontSize: 11, fontWeight: 800, color: p.bc, background: p.bbg, padding: '2px 8px', borderRadius: 10 }}>{p.badge}</span>}
          </div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 12 }}>{p.name}</div>
        <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {amb ? <span style={{ color: amb.couleur }}>{amb.icone ? <Fi i={amb.icone} size={11} style={{ marginRight: 4 }} /> : null}<FlipText text={amb.texte} /></span> : <Skel w={92} h={12} />}
          {p.live && p.live.hum != null ? <> · <Num v={p.live.hum} suffix="%" /></> : null}
        </div>
        {/* Pied : minis d'action (volets violet, clim ROUGE — des `button`, le
          * drag d'édition les ignore) à gauche, switch lumière à droite.
          *
          * `marginLeft: auto` sur le switch plutôt que le seul
          * `space-between` : quand la carte est trop étroite, les minis
          * passent en `display: none` et sortent du flux — il ne reste alors
          * qu'un item, que `space-between` colle à GAUCHE. La marge, elle,
          * tient quel que soit le nombre de voisins. */}
        {/* `position: relative` : ce pied est peint APRÈS le bouton de surface,
          * donc au-dessus de lui — ses contrôles reçoivent bien leurs clics. */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 8 }}>
          {(covers || clim) ? <div className="o-piece-minis" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {covers && (
              <button type="button" aria-label={tr('Volets') + ' ' + p.name} title={covers.open ? tr('Fermer les volets') : tr('Ouvrir les volets')}
                onClick={e => { e.stopPropagation(); flash('var(--o-purple)'); covers.onToggle(); }}
                style={{ ...MINI_PIECE, ...(covers.open ? { background: 'rgba(var(--o-purple-rgb),.18)', color: 'var(--o-purple)' } : null), transition: 'background .2s, color .2s' }}>
                <Ico name="blinds" size={14} />
              </button>
            )}
            {clim && (
              <button type="button" aria-label={tr('Chauffage') + ' ' + p.name} title={clim.on ? tr('Éteindre le chauffage') : tr('Allumer le chauffage')}
                onClick={e => { e.stopPropagation(); flash(clim.froid ? 'var(--o-cold)' : 'var(--o-warn2)'); clim.onToggle(); }}
                style={{ ...MINI_PIECE, ...(clim.on ? (clim.froid ? { background: 'rgba(var(--o-cold-rgb),.16)', color: 'var(--o-cold)' } : { background: 'rgba(var(--o-warn2-rgb),.16)', color: 'var(--o-warn2)' }) : null), transition: 'background .2s, color .2s' }}>
                <Ico name={clim.froid ? 'snowflake' : 'flame'} size={14} />
              </button>
            )}
          </div> : <span />}
          {canToggle && (
            /* La zone touchable fait 24 de haut, la pastille en garde 21
              * (audit du 27/09). C'est le premier geste d'une carte de pièce,
              * et il mesurait 38 × 21 — sous les 24 que demande la règle. La
              * marge négative rend les trois pixels empruntés : la rangée ne
              * bouge pas d'un cheveu, et le dessin est le même. */
            <span role="switch" aria-checked={on} aria-label={tr('Lumières') + ' ' + p.name} tabIndex={0} {...inerte}
              onClick={e => { e.stopPropagation(); doToggle(); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); doToggle(); } }}
              style={{ display: 'inline-flex', alignItems: 'center', height: 24, cursor: 'pointer', flexShrink: 0, margin: '-1.5px 0', marginLeft: 'auto', ...(attente ? { cursor: 'default', opacity: .5 } : null) }}>
              <span aria-hidden="true" style={{ display: 'block', width: 38, height: 21, borderRadius: 999, background: on ? 'linear-gradient(135deg,var(--o-lampe),var(--o-lampe-b))' : 'var(--o-s1)', border: 'var(--o-bw,1px) solid ' + (on ? 'transparent' : 'var(--o-bd2)'), transition: 'background .2s' }}>
                <span style={{ display: 'block', position: 'relative', top: 2, left: on ? 18 : 2, width: 15, height: 15, borderRadius: '50%', background: on ? '#fff' : 'var(--o-text3)', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)' }} />
              </span>
            </span>
          )}
        </div>
      </div>
    );
  }
  /* La variante d'origine, sans `compact` ni `chip` (lot 13 de l'audit du
   * 03/10). Plus rien ne la rend — l'Accueil et la bibliothèque passent l'un
   * ou l'autre —, mais elle suit la règle de nom des cartes : sans commande
   * dedans, elle reste un bouton, et son nom est ce qu'elle affiche — la pièce,
   * son état, sa température —, lu dans les MÊMES textes (`statut`). Elle
   * change de vue, elle n'ouvre pas de fiche : pas d'`aria-haspopup`. */
  const statut = p.status.kind === 'active' ? trN(p.status.n, '{n} actif', '{n} actifs') : p.status.kind === 'repos' ? tr('Repos') : p.status.kind === 'ext' ? tr('Extérieur') : null;
  return (
    <div className="o-piece" onClick={onOpen} role="button" tabIndex={0} aria-label={nomCarte(p.name, statut, p.temp)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen && onOpen(); } }} style={{ ...card, borderRadius: 'var(--o-radius,18px)', padding: 20, boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.36))', cursor: onOpen ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ width: p.box, height: p.box, borderRadius: p.rad, background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{p.icon}</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          {p.status.kind === 'active' && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--o-warn)' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--o-warn)', boxShadow: '0 0 7px rgba(var(--o-warn-rgb),.8)' }} />{statut}</span>}
          {p.status.kind === 'repos' && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--o-text3)' }} />{statut}</span>}
          {p.status.kind === 'ext' && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--o-accent-soft)' }}>{statut}</span>}
          {p.badge && <span className="o-piece-badge-top" style={{ fontSize: 11, fontWeight: 700, color: p.bc, background: p.bbg, padding: '3px 9px', borderRadius: 999 }}>{p.badge}</span>}
        </div>
      </div>
      <div className="o-piece-name" style={{ fontSize: 15, fontWeight: 700, marginTop: 15 }}>{p.name}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
        <span className="o-piece-temp" style={{ fontSize: 28, fontWeight: 800, color: p.tc }}>{p.temp}</span>
        <span style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600 }}>💧 {p.hum}</span>
        {p.badge && <span className="o-piece-badge-inline" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: p.bc, background: p.bbg, padding: '3px 9px', borderRadius: 999 }}>{p.badge}</span>}
      </div>
    </div>
  );
}

// Détail média : lecteur complet (ambiance pochette, seek, contrôles, volume) — comme la vue Médias.
/** Ce qu'on garde de l'historique.
 *
 * DEUX plafonds, parce qu'ils ne protegent pas de la meme chose.
 *
 * Dix versions : au-dela on ne restaure plus, on fouille.
 *
 * Et un plafond d'OCTETS, moins evident : chaque version garde une copie
 * entiere de l'agencement, et le serveur refuse toute valeur de plus de 256 Ko
 * (`MAX_VALUE_BYTES`, store.py). Un refus porte sur la requete entiere, sans
 * rien afficher : l'historique semblerait s'enregistrer, puis serait vide au
 * rechargement suivant. On elague donc AVANT d'envoyer.
 *
 * 128 Ko vient d'une mesure, pas d'une intuition. Une maison de demonstration
 * pese 91 octets ; une maison volontairement demesuree — 40 pieces, 25
 * sections, les trois formats distincts — pese 7,6 Ko, soit 77 Ko pour dix
 * versions. Le filet doit laisser passer ce cas-la et n'attraper que
 * l'anormal : au-dessous de 128 Ko il mordrait en usage legitime, au-dela il
 * approcherait le refus serveur. Et quand il mord, ce sont les vieilles
 * versions qui partent, jamais les recentes.
 */
const HISTO_MAX = 10;
const HISTO_OCTETS = 128 * 1024;
function elaguerHisto(liste) {
  let h = liste.slice(0, HISTO_MAX);
  while (h.length > 1) {
    let poids;
    try { poids = new Blob([JSON.stringify(h)]).size; }
    catch { poids = JSON.stringify(h).length * 2; }   // pire cas UTF-16
    if (poids <= HISTO_OCTETS) break;
    h = h.slice(0, -1);
  }
  return h;
}

/* La rangée de l'Accueil : TOUS les scénarios qui s'y montrent, en cartes
 * compactes, sur UNE rangée qui défile — six visibles sur PC et tablette, les
 * autres d'un clic sur les flèches ou d'un glissement ; 150 px par carte sur
 * téléphone (`.grid-qscenes`). Le chemin vers la vue vit dans l'EN-TÊTE
 * (« 9 scénarios → ») : la tuile « Tous les scénarios », posée en bout de
 * rangée, ressemblait à un scénario sans en être un (retour du 17/09). En
 * édition, l'en-tête porte « Gérer les scénarios ». */
function ScenariosAccueil({ hass, edit = false, onNav = null }) {
  const sc = useScenarios(hass);
  const liste = scenariosAccueil(sc.tous);
  const nScenarios = liste.length;
  /* La rangée qu'on attend (lot 14 de l'audit du 03/10). Les scénarios
   * viennent du composant APRÈS le premier dessin : leur rangée poussait les
   * pièces et les caméras de 94 px à chaque chargement. Sa place reste VIDE
   * le temps de la réponse — une réserve, pas une carte — quand ce navigateur
   * l'a vue pleine la dernière fois (une installation sans scénario sur
   * l'Accueil ne réserve rien). L'en-tête attend la réponse, caché :
   * « Tous les scénarios » devenait « 9 scénarios » sous les yeux. */
  const repondu = !!(sc.etat || sc.err);
  const [rangeeVue] = useState(() => { try { return localStorage.getItem('loggia-scnrangee') === '1'; } catch { return false; } });
  const pleine = sc.etat ? (nScenarios ? '1' : '0') : null;
  useEffect(() => { if (pleine) { try { localStorage.setItem('loggia-scnrangee', pleine); } catch { /* stockage refusé : la rangée sautera, comme avant */ } } }, [pleine]);
  // Les flèches : seulement quand la rangée déborde, actives du côté où il
  // reste quelque chose. La mesure suit le défilement et la largeur.
  const rangee = useRef(null);
  const mesure = useRef(null);
  const [bords, setBords] = useState({ avant: false, apres: false });
  // Avant la peinture (lot 14 de l'audit du 03/10) : les flèches naissent avec
  // la rangée, au lieu de pousser le lien de l'en-tête de 64 px une image après.
  useLayoutEffect(() => {
    const el = rangee.current;
    if (!el) return undefined;
    const mesurer = () => setBords(b => { const n = bordsDefilement(el.scrollLeft, el.scrollWidth, el.clientWidth); return n.avant === b.avant && n.apres === b.apres ? b : n; });
    mesure.current = mesurer;
    mesurer();
    el.addEventListener('scroll', mesurer, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(mesurer) : null;
    if (ro) ro.observe(el);
    return () => { mesure.current = null; el.removeEventListener('scroll', mesurer); if (ro) ro.disconnect(); };
  }, [nScenarios]);
  const glisser = (sens) => {
    const el = rangee.current;
    if (!el) return;
    const depart = el.scrollLeft, pas = sens * el.clientWidth * 0.85;
    el.scrollBy({ left: pas, behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
    // Un moteur qui n'anime pas (onglet masque, vue embarquee) laisserait la
    // rangee sur place : sans mouvement au bout d'un instant, on y va d'un coup.
    // Dans tous les cas on relit les bords : l'evenement `scroll` peut tarder.
    setTimeout(() => {
      if (rangee.current !== el) return;
      if (Math.abs(el.scrollLeft - depart) < 2) el.scrollBy({ left: pas, behavior: 'auto' });
      if (mesure.current) mesure.current();
    }, 350);
  };
  const fleche = (active) => ({ width: 26, height: 26, borderRadius: 9, border: 'none', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text1)', cursor: active ? 'pointer' : 'default', opacity: active ? 1 : .35 });
  const compte = trN(nScenarios, '{n} scénario', '{n} scénarios');
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <h2 style={sectionTitle}>{tr('Scénarios')}</h2>
        {edit && onNav
          /* `pointerEvents: auto` : en édition, `Sec` rend le contenu de la
           * section inerte (pointer-events none) pour qu'elle se saisisse ;
           * ce bouton, lui, doit rester cliquable (bug vu le 16/09 sur HA). */
          ? <button data-drag-ui="1" onClick={() => onNav('scenes')} style={{ pointerEvents: 'auto', padding: '6px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(var(--o-accent-rgb),.14)', color: 'var(--o-accent-soft)', fontWeight: 700, fontSize: 12 }}>{tr('Gérer les scénarios')}</button>
          : <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, visibility: repondu ? undefined : 'hidden' }}>
              {(bords.avant || bords.apres) && (<>
                <button type="button" className="o-qscenes-fleche" onClick={() => glisser(-1)} disabled={!bords.avant} aria-label={tr('Scénarios précédents')} title={tr('Scénarios précédents')} style={fleche(bords.avant)}><Fi i="angle-small-left" size={13} /></button>
                <button type="button" className="o-qscenes-fleche" onClick={() => glisser(1)} disabled={!bords.apres} aria-label={tr('Scénarios suivants')} title={tr('Scénarios suivants')} style={fleche(bords.apres)}><Fi i="angle-small-right" size={13} /></button>
              </>)}
              {sc.err && !nScenarios
                ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' }}>{sc.err}</span>
                : onNav
                  /* Le chemin vers la vue : un LIEN dans l'en-tête, pas une carte de plus dans la rangée. */
                  ? <button type="button" onClick={() => onNav('scenes')} aria-label={tr('Tous les scénarios')}
                      /* 44 de haut au doigt (lot 7 de l'audit du 28/10, V5) : la marge négative rend à la ligne les 25 px
                       * qu'elle occupait, le texte ne bouge pas. */
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 44, margin: '-10px 0', padding: '0 2px', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>
                      {nScenarios ? compte : tr('Tous les scénarios')}<Fi i="angle-right" size={10} color="var(--o-text3)" />
                    </button>
                  : <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' }}>{compte}</span>}
            </div>}
      </div>
      {nScenarios > 0 && (
        <div ref={rangee} className="grid-qscenes" inert={edit ? '' : undefined}>
          {/* En édition, la rangée est inerte au clavier aussi : la section ne
            * l'est plus, pour laisser « Gérer les scénarios » joignable
            * (relecture du lot 13 de l'audit du 03/10). */}
          {liste.map(s => <CarteScenario key={s.id} s={s} noms={sc.noms} compacte enCours={sc.enCours === s.id} onLancer={sc.lancer} />)}
        </div>
      )}
      {/* La réserve (voir `rangeeVue`) : rien ne s'y dessine, elle part à la
        * réponse. `overflowX: scroll` lui donne la barre de 4 px de la rangée
        * pleine au téléphone ; au-delà de 820 px, il n'y en a pas.
        * Seulement quand une connexion existe : sans elle, aucune réponse
        * ne viendra, la réserve partait à 4 s et la page remontait de 94 px
        * (relecture du lot 14). Un refus du composant, connexion présente,
        * garde ce court saut : rare, et une bande vide sous « Scénarios
        * indisponibles » serait pire. */}
      {!nScenarios && !repondu && rangeeVue && !!(hass && typeof hass.callWS === 'function') && (
        <div className="grid-qscenes" aria-hidden="true" style={{ overflowX: 'scroll' }}><span style={{ height: 88 }} /></div>
      )}
    </>
  );
}

/* Ecrire ou retirer une piece : `ecrirepiece.js` (audit du 03/10). Sa ligne
 * de `loggia_rooms` et sa place sur l'accueil y forment UN lot, que l'accueil
 * envoie d'un bloc (`saveAccL`) : en deux envois, un compte ordinaire voyait
 * la piece refusee et la grille acceptee. */

/* La carte d'une piece en mode edition (retour user du 15/09 : « les cartes
 * pieces, je n'ai pas Modifier / Supprimer ») : le meme dessin que la carte
 * d'une entite — l'icone et le lavis de la piece, le bouton de taille en coin
 * (une rangee ↔ deux), le nom, « Piece · n capteurs », Modifier et Supprimer.
 * Compacte, elle tient sur une rangee de 88 px : l'icone, le nom et la taille
 * sur une ligne, Modifier et Supprimer serres sur la suivante.
 * Supprimer ecrit la configuration : il demande un second appui. Le glisser
 * reste a l'enveloppe (`debutPiece` ignore les boutons), comme le focus, le
 * nom et les flèches, à la SURFACE qu'elle pose sous la carte (lot 13 de
 * l'audit du 03/10) : les rangées de boutons sont `position: relative`,
 * peintes au-dessus d'elle.
 *
 * `reglable` (03/10) : Modifier et Supprimer ecrivent `loggia_rooms`,
 * reservee aux administrateurs Home Assistant. Pour un compte ordinaire, la
 * carte garde son dessin et son bouton de taille — ranger ses cartes est
 * ouvert a tous —, pas ces deux boutons qu'il ne pourrait jamais
 * enregistrer. */
function CartePieceEdition({ p, compacte, onModifier, onSupprimer, onTaille, reglable = true }) {
  /* Au DOIGT, le conteneur de la carte glisse (`cursor: grab`, un gestionnaire
   * de pointeur sur la cellule). Sans arreter l'evenement ici, il capture le
   * pointeur avant le bouton, et l'appui ne devient jamais un clic : « le
   * bouton pour agrandir ou retrecir fonctionne mal en tactile, comme si la
   * zone qui englobe les cartes prenait le dessus » (01/10).
   *
   * La carte d'Appareils le faisait depuis toujours — `data-drag-ui` + l'arret
   * du `pointerdown` — et celle des pieces ne l'avait jamais eu. D'ou « dans
   * Appareils ça fonctionne correctement ».
   *
   * `data-drag-ui` sert en plus au fantome du glisser : ces boutons en sont
   * retires, pour qu'on ne traine pas une carte avec ses commandes dessus. */
  const stop = (e) => e.stopPropagation();
  const [confirme, setConfirme] = useState(false);
  useEffect(() => { if (!confirme) return undefined; const t = setTimeout(() => setConfirme(false), 4000); return () => clearTimeout(t); }, [confirme]);
  const live = p.live || {};
  const n = [live.tempId, live.humId, live.co2Id].filter(Boolean).length;
  const sous = tr('Pièce') + ' · ' + (n === 0 ? tr('Aucun capteur') : n === 1 ? tr('{n} capteur', { n }) : tr('{n} capteurs', { n }));
  const supprimer = () => { if (confirme) { setConfirme(false); onSupprimer(); } else setConfirme(true); };
  const rouge = confirme ? { background: 'rgba(var(--o-bad-rgb),.16)', borderColor: 'var(--o-bad)' } : {};
  const icone = <span style={RM_ICO('rgba(' + p.rgb + ',.16)', p.col)}>{cloneElement(p.icon, { size: 17 })}</span>;
  /* La même bascule que la carte d'Objets : un nom constant, l'état dans
   * `aria-pressed` (vrai = une rangée). Ici l'état était en plus inversé
   * (`!compacte`) : une pièce en deux rangées s'annonçait « Une rangée,
   * enfoncé » (relecture du lot 13, 04/10). */
  const taille = (
    <button data-drag-ui="1" onPointerDown={stop} onClick={onTaille} aria-pressed={compacte} title={compacte ? tr('Deux rangées') : tr('Une rangée')}
      aria-label={tr('Une rangée') + ' · ' + p.name} style={BOUTON_COIN}><Fi i="resize" size={13} /></button>
  );
  const lavis = lavisCarte(p.rgb);
  if (compacte) {
    const serre = { padding: '4px 6px', fontSize: 11.5 };
    return (
      <div style={{ ...RM_CARD, minHeight: 0, height: '100%', boxSizing: 'border-box', gap: 6, padding: '8px 10px', background: lavis }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...RM_ICO('rgba(' + p.rgb + ',.16)', p.col), width: 32, height: 32, borderRadius: 11 }}>{cloneElement(p.icon, { size: 15 })}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={RM_NAME}>{p.name}</div>
            <div style={{ ...RM_SUB, color: p.col, marginTop: 0 }}>{sous}</div>
          </div>
          {taille}
        </div>
        {reglable && (
          <div style={{ position: 'relative', display: 'flex', gap: 6 }}>
            <button data-drag-ui="1" onPointerDown={stop} onClick={onModifier} aria-label={tr('Modifier') + ' ' + p.name} style={{ ...boutonEdition(false), ...serre }}>{tr('Modifier')}</button>
            <button data-drag-ui="1" onPointerDown={stop} onClick={supprimer} aria-label={(confirme ? tr('Confirmer ?') : tr('Supprimer')) + ' ' + p.name} style={{ ...boutonEdition(true), ...serre, ...rouge }}>{confirme ? tr('Confirmer ?') : tr('Supprimer')}</button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div style={{ ...RM_CARD, height: '100%', boxSizing: 'border-box', background: lavis }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {icone}
        {taille}
      </div>
      {/* PAS DE MARGE SUR LE CORPS (09/10). Le parent est en
        * `space-between` : le corps est deja colle en bas, la marge n'y
        * ajoute rien — sauf quand le contenu remplit la carte, et la elle le
        * pousse DEHORS. « Il y a un souci au niveau de l'organisation,
        * arrange la carte volet que ce soit au meme niveau que l'Echo » :
        * mesure, le corps du volet finissait 12 px sous sa zone quand celui
        * du media tombait pile. */}
      <div>
        <div style={RM_NAME}>{p.name}</div>
        <div style={{ ...RM_SUB, color: p.col }}>{sous}</div>
      </div>
      {reglable && (
        <div style={{ position: 'relative', display: 'flex', gap: 8, marginTop: 12 }}>
          <button data-drag-ui="1" onPointerDown={stop} onClick={onModifier} aria-label={tr('Modifier') + ' ' + p.name} style={boutonEdition(false)}>{tr('Modifier')}</button>
          <button data-drag-ui="1" onPointerDown={stop} onClick={supprimer} aria-label={(confirme ? tr('Confirmer ?') : tr('Supprimer')) + ' ' + p.name} style={{ ...boutonEdition(true), ...rouge }}>{confirme ? tr('Confirmer ?') : tr('Supprimer')}</button>
        </div>
      )}
    </div>
  );
}

/* « Ajouter une piece » / « Modifier la piece » : sa fiche est chargée à la demande (`fichepiece.jsx`, audit du 19/10) — ouverte
 * en édition, par qui configure la maison, elle n'a rien à faire au démarrage. Elle n'importe jamais App.jsx : l'Accueil lui passe
 * l'habillage des pièces et les briques des fiches d'ici (`BRIQUES_PIECE`). */
const FichePiece = lazyRecharge(() => import('../fichepiece.jsx'));
const BRIQUES_PIECE = { habillagePiece, TEINTES_PIECE, ICONES_PIECE, ChoixIcone, FicheRangee, RmBascule };

/** Le jour d'un evenement, dit court : Aujourd'hui, Demain, sinon « mar. 2 ». */
function jourAgenda(e) {
  const d = new Date(e.start.dateTime || (e.start.date + 'T00:00:00'));
  // Des jours de calendrier : le 25 octobre à 23 h 30 est « aujourd'hui » le 25,
  // même si ce dimanche-là compte vingt-cinq heures.
  const diff = ecartJours(new Date(), d);
  const jour = diff === 0 ? tr("Aujourd'hui") : diff === 1 ? tr('Demain')
    : d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric' });
  const heure = e.start.dateTime ? d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : tr('journée');
  return { jour, heure };
}

/* Une ligne « En ce moment » (maquette du 15/09) : la tuile d'icone teintee,
 * le nom, l'etat, et a droite le geste quand il existe (pause, dock, eteindre,
 * stop) ; la ligne elle-meme ouvre la fiche. Meme air que les lignes denses
 * du rail. Sans geste ni fiche, une ligne inerte. */
function LigneMoment({ icone, rgb, nom, sous, onOpen = null, fiche = false, action = null, actionIcone = null, onAction = null }) {
  const ouvre = onOpen ? () => onOpen() : null;
  return (
    /* La ligne n'est PLUS un `role="button"` qui englobe son geste (lot 13 de
     * l'audit du 03/10, ADR 0074). Un rôle bouton rend sa descendance
     * présentationnelle : « Mettre en pause », « Renvoyer au dock » et « Stop »
     * disparaissaient d'un lecteur d'écran (`nested-interactive`). Le geste
     * « ouvrir » passe par le bouton de SURFACE, frère du geste, et son nom est
     * ce que la ligne affiche, nom puis état : « Robot, Nettoyage ». `fiche` :
     * elle ouvre une fiche (le lecteur, le robot, le volet) ; sans, elle mène à
     * une vue. Plus de touche à garder : deux boutons voisins ont chacun la
     * leur, et Entrée sur « Pause » ne peut plus ouvrir la fiche.
     *
     * La classe rend l'enfoncement au press que la ligne tenait de
     * `[role="button"]:active` (index.css) : la surface, transparente, ne le
     * montrerait pas. */
    <div className={ouvre ? 'o-ligne-moment' : undefined}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', cursor: ouvre ? 'pointer' : 'default' }}>
      {ouvre && <Surface onClick={ouvre} label={nomCarte(nom, sous)} popup={fiche} />}
      <span style={{ ...RM_ICO('rgba(' + rgb + ',.16)', 'rgb(' + rgb + ')'), width: 34, height: 34, borderRadius: 11 }}>{icone ? <Ico name={icone} size={15} /> : <PlugIcon size={15} />}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sous}</div>
      </div>
      {/* Le geste, `position: relative` : peint APRÈS la surface, donc
        * au-dessus d'elle, il reçoit son clic. Son nom commence par son mot et
        * nomme l'appareil — « Mettre en pause Lecteur salon », comme « Volets
        * Salon » sur la carte de pièce. */}
      {action && onAction ? (
        <button type="button" aria-label={action + ' ' + nom} title={action} onClick={(e) => { e.stopPropagation(); onAction(); }}
          style={{ position: 'relative', width: 30, height: 30, borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s1)', color: 'var(--o-text1)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><Fi i={actionIcone || 'power'} size={13} /></button>
      ) : ouvre ? <Fi i="angle-right" size={10} color="var(--o-text3)" /> : null}
    </div>
  );
}

/* Deux pages sur mobile et tablette (retour user du 15/09) : « Maison »
 * (securite, favoris, scenes, pieces, cameras) et « En ce moment » (le rail
 * du PC). Glissement au doigt, deux points pour repere ; un seul panneau dans
 * le flux — deux panneaux cote a cote donneraient a la page la hauteur du plus
 * long. L'onglet est retenu pour la session. Le geste ne vaut qu'au doigt
 * (la souris a les onglets), s'efface en edition (le drag des sections tient
 * deja le pointeur), et un `pointercancel` — le navigateur a pris le geste
 * pour faire defiler une rangee — ne change pas d'onglet. */
/* Une rangee qui defile a l'horizontale — scenes rapides, chiffres de la
 * banniere — garde son geste : la page ne se prend pas depuis elle (retour
 * user du 15/09 : « je ne peux plus les slider, la seconde page prend le
 * dessus »). On remonte du point touche jusqu'a la racine du glissement. */
function defileHorizontal(el, racine) {
  for (let n = el; n && n !== racine; n = n.parentElement) {
    const st = window.getComputedStyle(n);
    if ((st.overflowX === 'auto' || st.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 1) return true;
  }
  return false;
}
const ONGLET_CLE = 'loggia-accueil-onglet';
function OngletsAccueil({ maison, moment, edit = false, demande = null, onDemande = null }) {
  const [onglet, setOnglet] = useState(() => { try { return sessionStorage.getItem(ONGLET_CLE) === 'moment' ? 1 : 0; } catch { return 0; } });
  const [dx, setDx] = useState(0); // le decalage du panneau pendant le geste
  const geste = useRef(null);
  const va = useCallback((i) => { setOnglet(i); setDx(0); try { sessionStorage.setItem(ONGLET_CLE, i ? 'moment' : 'maison'); } catch {} }, []);
  // Une demande venue d'ailleurs — la tuile « appareils actifs » de la
  // banniere (ADR 0030) : on va a la page, puis on rend la main.
  useEffect(() => { if (demande != null) { va(demande); if (onDemande) onDemande(); } }, [demande, va, onDemande]);
  const debut = (e) => {
    if (edit || e.pointerType === 'mouse' || defileHorizontal(e.target, e.currentTarget)) return;
    geste.current = { x: e.clientX, y: e.clientY, pris: null };
  };
  const mouv = (e) => {
    const g = geste.current; if (!g) return;
    const ddx = e.clientX - g.x, ddy = e.clientY - g.y;
    if (g.pris == null) {
      if (Math.abs(ddx) < 12 && Math.abs(ddy) < 12) return;
      // Un geste franchement horizontal, sinon c'est un defilement.
      g.pris = Math.abs(ddx) > Math.abs(ddy) * 2;
      if (!g.pris) { geste.current = null; return; }
    }
    // Au bord (pas de page avant la premiere, ni apres la seconde), le panneau resiste.
    g.dx = (onglet === 0 && ddx > 0) || (onglet === 1 && ddx < 0) ? ddx / 4 : ddx;
    setDx(g.dx);
  };
  // La depose lit le decalage dans la ref, pas dans l'etat : un `pointerup`
  // qui suit le dernier `pointermove` avant le rendu verrait encore zero.
  const fin = () => {
    const g = geste.current; geste.current = null;
    if (!g || !g.pris) { setDx(0); return; }
    if (g.dx < -40 && onglet === 0) va(1);
    else if (g.dx > 40 && onglet === 1) va(0);
    else setDx(0);
  };
  const annule = () => { geste.current = null; setDx(0); };
  const onglets = [tr('Maison'), tr('En ce moment')];
  return (
    <div onPointerDown={debut} onPointerMove={mouv} onPointerUp={fin} onPointerCancel={annule} style={{ touchAction: 'pan-y' }}>
      {/* Pas de barre d'onglets (retour user du 15/09 : « j'en veux pas de
        * ca ») : deux points, comme sous l'ancienne glissiere — le doigt
        * glisse, la souris tape le point. */}
      {/* Le point reste un point, sa zone touchable fait 24 (audit du 27/09).
        * Mesurés à 18 × 6 et 6 × 6, ces deux points étaient les plus petites
        * cibles de tout le dashboard — et ils changent de PAGE. La marge
        * verticale négative garde la rangée à sa hauteur, et `gap: 0` pose
        * leurs centres à 24 l'un de l'autre : l'écart exact que demande la
        * règle, et l'espacement visible ne bouge presque pas (8 → 12). */}
      {/* 44 × 44 au doigt (lot 7 de l'audit du 28/10, V5), sans que les points bougent : chaque bouton s'élargit VERS
        * L'EXTÉRIEUR — le premier à gauche, le second à droite —, et son point garde sa case de 24 du côté du voisin.
        * Leurs centres restent à 24 l'un de l'autre. La marge négative garde la rangée à 6 px de haut ; 19 px dessous, pour que
        * la page ne recouvre pas leur bas, et posés au-dessus de la bannière, positionnée, qui recouvrait leur haut (33 px
        * de haut réels, mesurés). */}
      <div className="o-pages-points" style={{ display: 'flex', justifyContent: 'center', gap: 0, marginBottom: 19 }}>
        {onglets.map((lbl, i) => { const on = onglet === i; return (
          <button key={lbl} type="button" aria-label={lbl} aria-pressed={on} title={lbl} onClick={() => va(i)}
            style={{ position: 'relative', zIndex: 1, minWidth: 44, height: 44, margin: '-19px 0', border: 'none', padding: 0, cursor: 'pointer', background: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: i ? 'flex-start' : 'flex-end' }}>
            <span aria-hidden="true" style={{ width: 24, display: 'flex', justifyContent: 'center' }}>
              <span style={{ display: 'block', width: on ? 18 : 6, height: 6, borderRadius: 999, background: on ? 'var(--o-accent-fond)' : 'var(--o-bd1)', transition: 'width .25s, background .25s' }} />
            </span>
          </button>
        ); })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, transform: dx ? 'translateX(' + dx + 'px)' : undefined, transition: dx ? 'none' : 'transform .2s' }}>
        {onglet === 0 ? maison : moment}
      </div>
    </div>
  );
}

/* « A SURVEILLER » (ADR 0028) : la carte qui n'existe que quand quelque
 * chose le merite — dans le rail, avec En ce moment et Rappels (choix de
 * l'utilisateur, 16/09). Une ligne par point, du plus grave au moins grave, chacune
 * vers la vue qui permet d'agir ; six au plus, puis « n autres ». Le lavis
 * et l'icone prennent la couleur du pire point. */
function CarteAttention({ points, onNav = null }) {
  const niveau = niveauMax(points);
  const { col, rgb } = couleurNiveau(niveau);
  const visibles = points.slice(0, 6);
  const reste = points.length - visibles.length;
  return (
    <div style={{ background: `linear-gradient(180deg, rgba(${rgb},.10), transparent 60%), var(--o-surfA)`, border: LISERE, borderRadius: 'var(--o-radius,18px)', padding: '13px 15px', boxShadow: 'var(--o-shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={RM_ICO(`rgba(${rgb},.16)`, col)}><Fi i={niveau === 'danger' ? 'triangle-warning' : 'exclamation'} size={17} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{tr('À surveiller')}</div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: col }}>{resumeAttention(points)}</div>
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        {visibles.map(p => { const c = couleurNiveau(p.niveau); return (
          <LigneMoment key={p.cle} icone={p.icone} rgb={c.rgb} nom={p.titre} sous={p.sous} onOpen={p.vue && onNav ? () => onNav(p.vue) : null} />
        ); })}
        {reste > 0 && <div style={{ paddingTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' }}>{tr('{n} autres', { n: reste })}</div>}
      </div>
    </div>
  );
}

/* Sections personnalisables de l'accueil : identifiants stables (jamais les
 * libellés traduits) et libellés dits au rendu. */
const ACC_MAIN = ['favoris', 'scenes', 'pieces', 'cameras'];
/* Le cote PAR DEFAUT (retour du 19/09, capture a l'appui : « par defaut, avec
 * bien sur A surveiller tout en haut ») : A surveiller, l'heure, la meteo, le
 * CO2, En ce moment, le calendrier. « heure », « calendrier » et « co2 »
 * restent EN OPTION (`WIDGETS_OPTION`, ADR 0041, 0044) — presents d'emblee, la
 * croix les retire ; Rappels et Agenda (que le calendrier reprend) suivent,
 * masques. Cela ne vaut que pour un accueil jamais range : un agencement
 * enregistre reste le sien. */
/* Le widget « calendrier » a quitte cette liste le 02/10 : la carte Agenda
 * disait la meme semaine, en mieux — « retire-la, du coup elle ne sert plus
 * a rien ». */
const ACC_RAIL = ['attention', 'heure', 'meteo', 'co2', 'moment', 'rappels', 'agenda'];
const ACC_AJOUTEES_DEFAUT = ['heure', 'co2'];
/* L'agenda n'est plus masque par defaut : il REMPLACE le calendrier, qui
 * lui s'affichait. Le masquer reviendrait a retirer une carte que tout le
 * monde avait.
 *
 * Les RAPPELS non plus, depuis le 03/10 : la carte portait deux lignes qui ne
 * concernaient pas grand monde (le repas du chat, le ramassage), et c'est pour
 * ca qu'elle se cachait. Elle montre maintenant les listes de taches de Home
 * Assistant, et n'existe PAS chez qui n'en a aucune : elle ne peut plus faire
 * de bruit, donc elle n'a plus a se cacher. Un agencement deja enregistre
 * garde le sien — on ne reecrit l'accueil de personne. */
const ACC_CACHES_DEFAUT = [];
const ACC_NOMS = () => ({ attention: tr('À surveiller'), favoris: tr('Favoris'), scenes: tr('Scénarios'), pieces: tr('Pièces'), cameras: tr('Caméras'), moment: tr('En ce moment'), rappels: tr('Rappels'), agenda: tr('Agenda'), meteo: tr('Météo'), heure: tr('Heure'), co2: 'CO₂' });
/* Les identifiants d'un accueil enregistre avant le 15/09 : la glissiere du
 * heros a disparu (son contenu vit dans « En ce moment »), « En cours » est
 * devenu « En ce moment ». Un identifiant inconnu est simplement ignore. */
const ACC_RENOMME = { etats: 'moment' };

/* FAVORIS de l'accueil : les cartes que le foyer a choisies, posées ICI.
 *
 * Elles se composaient jusqu'au 01/09 par la seule punaise des fiches — pour
 * poser une carte on devait créer une vue bidon, y ajouter l'entité, puis
 * l'épingler. La section s'édite désormais comme une vue : « + » pour ajouter
 * (par entité ou par carte), crayon pour changer le dessin, largeur, retrait,
 * et la saisie pour réordonner. Le format d'une entrée est celui des vues
 * personnalisées — une chaîne nue vaut toujours compacte, donc les épingles
 * déjà posées restent valides. */
function FavorisAccueil({ hass, edit = false }) {
  const dc = useDomainCards(hass);
  const S = (hass && hass.states) || {};
  const [eps, setEps] = useState(lireEpingles);
  useEffect(() => { setEps(lireEpingles()); }, [edit]);
  const poser = (l) => { setEps(l); cfgSet({ loggia_epingles: l.length ? l : null }); };
  const [adding, setAdding] = useState(false);
  const [retype, setRetype] = useState(null);
  // Carte chips dont on compose la rangée.
  const [chipsEdit, setChipsEdit] = useState(null);
  // Une entité disparue ne doit pas laisser un trou : on la saute au rendu,
  // sans la retirer de la configuration (elle peut revenir).
  const liste = eps.filter(x => cvEstTpl(x) || !cvId(x).includes('.') || S[cvId(x)]);
  const vide = !liste.length;

  /* L'ÉDITION, comme partout ailleurs depuis le 06/10 : la carte devient une
   * tuile qu'on clique pour ouvrir sa fiche. Les favoris n'ont jamais eu de
   * glisser-déposer — la rangée défile — donc l'agencement ne sert ici qu'au
   * clic, aux flèches du clavier et aux trois réglages. */
  const [fiche, setFiche] = useState(null);
  const appuiRef = useRef(false);
  const parCle = new Map(eps.map(x => [cvKey(x), x]));
  const de = (cle) => parCle.get(cle);
  const sousCarte = (x) => CV_TYPE_NOMS()[cvTypeDe(x)] || null;
  const majCarte = (x, f) => poser(eps.map(y => (cvKey(y) === cvKey(x) ? f(x) : y)));
  const edFav = {
    dragId: null,
    // Un appui venu d'un bouton n'est pas un appui sur la carte (retour 06/10).
    dragStart: (cle, e) => {
      appuiRef.current = !(e.target.closest && e.target.closest('button:not(.o-surface)'));
    },
    dragMove: () => {},
    dragEnd: () => { const clic = appuiRef.current; appuiRef.current = false; return clic; },
    move: (cle, pas) => {
      const i = eps.findIndex(y => cvKey(y) === cle);
      const j = i + pas;
      if (i < 0 || j < 0 || j >= eps.length) return;
      const a = [...eps];
      const [pris] = a.splice(i, 1);
      a.splice(j, 0, pris);
      poser(a);
    },
    remove: (cle) => poser(eps.filter(y => cvKey(y) !== cle)),
    estLarge: (cle) => cvW(de(cle)) === 2,
    basculerLarge: (cle) => majCarte(de(cle), cvAvecW),
    estCompact: (cle) => cvRowsDe(de(cle)) === 1,
    basculerCompact: (cle) => majCarte(de(cle), cvAvecH),
  };
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 style={sectionTitle}>{tr('Favoris')}</h2>
        {!vide
          ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' }}>{liste.length}</span>
          /* Un tableau de bord qu'on consulte tous les jours ne doit pas
           * consacrer un bloc encadre de 91 px, en pleine zone noble, a dire
           * qu'il n'y a rien. L'invitation tient sur la ligne du titre : on
           * garde la decouvrabilite, on rend la place. */
          : (!edit && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Épinglez un appareil depuis sa fiche')}</span>)}
      </div>
      {vide && !edit
        ? null
        /* Les favoris DÉFILENT (retour 01/09) : ils s'ajoutent sans repousser
         * le reste de l'accueil, et la rangée reste d'un seul tenant. */
        : <div className="o-favrow" style={{ display: 'flex', gap: edit ? 16 : 10, overflowX: 'auto', scrollSnapType: 'x proximity' }}>
            {liste.map(x => {
              const cle = cvKey(x);
              const taille = { width: cvW(x) === 2 ? 466 : 225, height: cvRowsDe(x) === 1 ? 88 : 184 };
              /* EN EDITION, la TUILE partagee : on la clique pour ouvrir sa
               * fiche. La rangee defile, elle n'a pas de glisser — les
               * fleches du clavier rangent les favoris. */
              if (edit) {
                return (
                  <div key={cle} style={{ position: 'relative', flex: '0 0 auto', ...taille, scrollSnapAlign: 'start' }}>
                    <EditableCard ed={edFav} id={cle} nom={nomCv(x, hass)} hass={hass}
                      entite={typeof x === 'string' ? x : (x.id || cle)} sous={sousCarte(x)}
                      onEdit={() => setFiche(x)} />
                  </div>
                );
              }
              return (
                <div key={cle} style={{ position: 'relative', flex: '0 0 auto', ...taille, scrollSnapAlign: 'start' }}>
                  <div className="o-cvfit" style={{ height: '100%' }}>
                    <CvTyped x={x} hass={hass} dc={dc} />
                  </div>
                </div>
              );
            })}
            {edit && (
              <button onClick={() => setAdding(true)} style={{ flex: '0 0 auto', width: 190, height: 88, borderRadius: 'var(--o-radius,18px)', border: '2px dashed rgba(var(--o-accent-rgb),.45)', background: 'rgba(var(--o-accent-rgb),.06)', color: 'var(--o-accent-soft)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
                <span style={{ fontSize: 19, lineHeight: 1 }}>+</span>{tr('Ajouter une carte')}
              </button>
            )}
          </div>}
      {fiche && (
        <FicheCarte x={de(cvKey(fiche)) || fiche} nom={nomCv(de(cvKey(fiche)) || fiche, hass)} sous={sousCarte(de(cvKey(fiche)) || fiche)}
          onTaille={(y) => majCarte(y, cvAvecH)} onLargeur={(y) => majCarte(y, cvAvecW)}
          onChanger={(y) => (cvTypeDe(y) === 'chips' ? setChipsEdit(y) : setRetype(y))}
          onRetirer={(y) => edFav.remove(cvKey(y))} onClose={() => setFiche(null)} />
      )}
      {/* Une carte chips arrive vide : on enchaîne sur son compositeur. */}
      {adding && <CarteAjoutSheet hass={hass} onClose={() => setAdding(false)} onPose={(e) => { poser([...eps, e]); if (cvTypeDe(e) === 'chips') setChipsEdit(e); }} />}
      {retype && <CarteAjoutSheet hass={hass} remplace={retype} onClose={() => setRetype(null)} onPose={(e) => poser(eps.map(y => cvKey(y) === cvKey(retype) ? e : y))} />}
      {chipsEdit && <ChipsEditSheet x={chipsEdit} hass={hass} onClose={() => setChipsEdit(null)}
        onSave={(n) => { setChipsEdit(n); poser(eps.map(y => cvKey(y) === cvKey(chipsEdit) ? n : y)); }} />}
      {dc.sheets}
    </div>
  );
}

/* Ce qui compte comme un appareil EN MARCHE.
 *
 * Chaque domaine dit « actif » a sa maniere : une prise est `on`, un
 * aspirateur `cleaning`, une tondeuse `mowing`. Un robot qui rentre a sa base
 * travaille encore — il n'est pas au repos tant qu'il roule.
 */
const APPAREIL_ACTIF = {
  switch: (e) => e === 'on',
  fan: (e) => e === 'on',
  humidifier: (e) => e === 'on',
  valve: (e) => e === 'open',
  vacuum: (e) => e === 'cleaning' || e === 'returning',
  lawn_mower: (e) => e === 'mowing' || e === 'returning',
};

/* Le fantome d'un glisser : la copie qui suit le pointeur, partout, tant
 * qu'on la tient — le meme dessin que celui des grilles (useLayoutEditor). */
/* LE FANTOME EST LE MOMENT OU LA CARTE EST VRAIMENT PRISE (07/10).
 *
 * Les cinq demarrages de glisser passent par lui — sections et cartes pieces,
 * a la souris comme a l'appui long —, et aucun autre endroit ne sait aussi
 * surement qu'on tient quelque chose. C'est donc ici qu'on coupe le defilement
 * du doigt et qu'on arme celui qui suit le geste (`glisser.js`).
 *
 * Avant ce moment, rien n'est pose : le `touch-action: pan-y` des cartes laisse
 * la page defiler normalement sous le doigt, ce qui est le comportement voulu
 * en mode edition, ou les cartes couvrent l'ecran.
 */
function poserFantome(el, x0, y0) {
  const f = el.cloneNode(true);
  Array.prototype.slice.call(f.querySelectorAll('[data-drag-ui]')).forEach(n => n.remove());
  const r = el.getBoundingClientRect();
  const st = f.style;
  st.position = 'fixed'; st.left = r.left + 'px'; st.top = r.top + 'px';
  st.width = r.width + 'px'; st.height = r.height + 'px'; st.margin = '0';
  st.pointerEvents = 'none'; st.zIndex = '9999'; st.opacity = '.96';
  st.transform = 'scale(1.02)'; st.transition = 'none'; st.outline = 'none';
  st.boxShadow = '0 22px 48px rgba(0,0,0,.55)';
  (el.ownerDocument || document).body.appendChild(f);
  const rendre = bloquerDefilement(el.ownerDocument || document);
  const defileur = defileurAuto(el);
  return {
    suivre: (x, y) => {
      f.style.transform = 'translate(' + (x - x0) + 'px,' + (y - y0) + 'px) scale(1.02)';
      defileur.viser(y);
    },
    lever: () => {
      defileur.arreter();
      rendre();
      try { f.remove(); } catch { /* deja parti */ }
    },
  };
}

// ── Position solaire (type Helios) — géoloc du domicile, calcul NOAA simplifié ──
// Position du domicile : celle que Home Assistant connait. Aucune raison de
// l'ecrire ici, encore moins d'embarquer celle de quelqu'un d'autre.
function homeGeo() {
  const h = getHass();
  const c = h && h.config;
  if (c && typeof c.latitude === 'number' && typeof c.longitude === 'number') return { lat: c.latitude, lng: c.longitude };
  return null;
}
function sunInfo(date = new Date()) {
  const geo = homeGeo();
  if (!geo) return null;   // sans position, pas de course du soleil
  const rad = Math.PI / 180;
  const start = new Date(date.getFullYear(), 0, 0);
  const doy = Math.floor((date - start) / 86400000);
  const B = rad * (360 / 365) * (doy - 81);
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // équation du temps (min)
  const decl = -23.44 * Math.cos(rad * (360 / 365) * (doy + 10));
  const cosH = -Math.tan(rad * geo.lat) * Math.tan(rad * decl);
  const H = Math.acos(Math.min(1, Math.max(-1, cosH))) / rad; // demi-arc diurne (°)
  const tz = -date.getTimezoneOffset() / 60;
  const noon = 12 - geo.lng / 15 + tz - eot / 60;       // midi solaire (h locale)
  const sunrise = noon - H / 15, sunset = noon + H / 15;
  const nowH = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const ha = (nowH - noon) * 15; // angle horaire (°)
  const sinEl = Math.sin(rad * geo.lat) * Math.sin(rad * decl) + Math.cos(rad * geo.lat) * Math.cos(rad * decl) * Math.cos(rad * ha);
  const elevation = Math.asin(Math.min(1, Math.max(-1, sinEl))) / rad;
  const t = Math.min(1, Math.max(0, (nowH - sunrise) / Math.max(0.01, sunset - sunrise))); // 0..1 sur l'arc du jour
  const hm = (h) => { const hh = Math.floor(((h % 24) + 24) % 24); const mm = Math.round((h - Math.floor(h)) * 60); const d = new Date(); d.setHours(hh, mm % 60, 0, 0); return d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); };
  return { sunrise, sunset, noon, elevation, t, day: nowH >= sunrise && nowH <= sunset, sunriseHM: hm(sunrise), sunsetHM: hm(sunset) };
}
// Scène type Helios au-dessus du schéma maison : grand arc du jour (segment parcouru brillant),
// soleil à l'heure réelle + chip irradiance, chips solaire/réseau/maison/appareils, lever/coucher.
// Le lever et le coucher réels (NOAA) pour le ciel de l'Accueil, en heures locales ; sans position
// déclarée, null — le ciel garde alors ceux du handoff (9 octobre).
function cielSoleil() {
  try { const si = sunInfo(); if (si) return { lever: Math.round(si.sunrise * 100) / 100, coucher: Math.round(si.sunset * 100) / 100 }; } catch { /* pas de position */ }
  return { lever: null, coucher: null };
}
function heureLocale() { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }

// Notifications dynamiques dérivées de l'état HA réel (avec temps relatif via last_changed).
/** Le nom d'un cycle en cours (audit du 19/10, point 2) : l'appareil — « Lave-vaisselle » —, ou le nom de la prise quand
 *  deux appareils du même type tournent ensemble. */
function nomDuCycle(c, cycles, S) {
  return cycles.filter(x => x.type === c.type).length > 1 ? cvName(S[c.id], c.id) : NOMS_PRISE()[c.type];
}

export { WeatherGL, PlanPieces, FeuilleAgenda, WeatherFx, Num, Skel, tailleParDefaut, PieceCard, elaguerHisto, ScenariosAccueil, CartePieceEdition, FichePiece, BRIQUES_PIECE, jourAgenda, LigneMoment, OngletsAccueil, CarteAttention, ACC_MAIN, ACC_RAIL, ACC_AJOUTEES_DEFAUT, ACC_CACHES_DEFAUT, ACC_NOMS, ACC_RENOMME, FavorisAccueil, APPAREIL_ACTIF, poserFantome, sunInfo, cielSoleil, heureLocale, nomDuCycle };
