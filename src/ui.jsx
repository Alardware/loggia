/**
 * Primitives d'interface partagees.
 *
 * Extraites de App.jsx pour que les vues chargees a la demande puissent les
 * importer sans reimporter le monolithe — ce qui creerait un cycle et
 * ramenerait tout dans chaque morceau.
 *
 * Le contenu est repris a l'identique : ce module deplace du code, il n'en
 * change pas le comportement.
 */
import { useState, useEffect, useRef, useMemo, useId, Fragment, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { getHass } from './state.js';
import { filtrerChoix, blocsChoix, placerMenu, SEUIL_RECHERCHE } from './choix.js';
import { tr } from './i18n.js';

// Suit un min-width en live (layout PC : rail Accueil ≥ 1180 px)
// ── Animations lot 1 : count-up, stagger d'entrée, jauges qui se remplissent ──
export const REDUCE_MOTION = (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();

// Icône Flaticon UICons (police web chargée dans index.html). i = nom sans préfixe (ex 'home' → fi-rr-home).
export function Fi({ i, size = 18, color, style }) {
  // aria-hidden : les glyphes UICons sont en zone privée Unicode → les lecteurs d'écran liraient des caractères aléatoires
  return <i aria-hidden="true" className={'fi fi-rr-' + i} style={{ fontSize: size, color, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...style }} />;
}

// Tilt : inclinaison ±4° vers le curseur + reflet qui suit. Peinture DOM directe (pas de re-render), commit via
// transition au leave. Désactivé sur tactile et en reduced-motion.
export function useTilt(max = 4) {
  const ref = useRef(null);
  const on = false; // inclinaison 3D au survol retiree le 21/08 (demande user)
  const onMove = (e) => {
    const el = ref.current; if (!el || !on) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transition = 'transform .08s ease-out';
    el.style.transform = `perspective(900px) rotateX(${(-py * max * 2).toFixed(2)}deg) rotateY(${(px * max * 2).toFixed(2)}deg) translateZ(0)`;
    el.classList.add('o-tilting');
  };
  const onLeave = () => {
    const el = ref.current; if (!el) return;
    el.style.transition = 'transform .45s cubic-bezier(.22,.61,.36,1)';
    el.style.transform = '';
    el.classList.remove('o-tilting');
  };
  return on ? { ref, onPointerMove: onMove, onPointerLeave: onLeave, onPointerCancel: onLeave, className: 'o-tilt' } : { ref };
}

// <Anim i base>…</Anim> : enveloppe tilt (pointeur fin) + entrée en cascade, sans toucher au JSX de la carte.
// Conteneur de carte. L'apparition en cascade a été retirée (21/08) : les cartes
// s'affichent immédiatement. i/base sont conservés pour ne pas toucher les ~200 appels.
export function Anim({ i = 0, base = 0, children, style, className = '' }) {
  const tilt = useTilt(4);
  return (
    <div ref={tilt.ref} onPointerMove={tilt.onPointerMove} onPointerLeave={tilt.onPointerLeave} onPointerCancel={tilt.onPointerCancel}
      className={'o-hov ' + (tilt.className || '') + (className ? ' ' + className : '')} style={{ position: 'relative', borderRadius: 'var(--o-radius,18px)', minWidth: 0, ...style }}>
      {children}
    </div>
  );
}

export const HX_TOKENS = { 'var(--o-orange)': '--o-orange-rgb', 'var(--o-rose)': '--o-rose-rgb', 'var(--o-lampe)': '--o-lampe-rgb', 'var(--o-accent)': '--o-accent-rgb', 'var(--o-accent-soft)': '--o-accent-soft-rgb', 'var(--o-ok)': '--o-ok-rgb', 'var(--o-warn)': '--o-warn-rgb', 'var(--o-warn2)': '--o-warn2-rgb', 'var(--o-bad)': '--o-bad-rgb', 'var(--o-cold)': '--o-cold-rgb', 'var(--o-gold)': '--o-gold-rgb', 'var(--o-purple)': '--o-purple-rgb', 'var(--o-cyan)': '--o-cyan-rgb' };

export const cl_hexRgb = (c) => HX_TOKENS[c] ? `var(${HX_TOKENS[c]})` : (typeof c !== 'string' || c[0] !== '#') ? '140,152,180' : `${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)}`;

/* Une FONCTION, pas une table.
 *
 * Evaluee a l'import, cette liste figeait ses libelles dans la langue du
 * demarrage. C'est ce qui obligeait a recharger la page apres un changement de
 * langue. Appelee au rendu, elle se dit dans la langue du moment. */
export const HIDDEN_VIEWS = () => [
  { label: tr('Lumières'), vid: 'lumieres', icon: 'bulb', c: 'var(--o-lampe)' },
  { label: tr('Climat'), vid: 'climat', icon: 'thermometer-half', c: 'var(--o-orange)' },
  /* Volets a quitté la liste le 30/08/2026. Le motif d'alors — « l'Ouverture
   * vit dans la vue Climatisation » — n'a plus cours : `ClimatView` n'existe
   * plus, « Climat » ouvre la vue Objets filtrée sur le chauffage, et les
   * volets ont de nouveau leur vue à eux (`VoletsView`). Elle reste hors de
   * cette liste, mais la route et les cartes d'Objets y mènent. */
  /* Aspirateur et Croquettes ont quitté la liste le 30/08/2026 : la FICHE
   * APPAREIL UNIVERSELLE (tap sur la carte, vue Objets) montre tout ce que
   * l'appareil expose — la vue dédiée ne racontait rien de plus. Les routes
   * restent : un appareil qui a mémorisé cette vue l'affiche encore.
   * Les robots REVIENNENT le 17/09/2026 (ADR 0042) : leur vue raconte
   * désormais ce que la fiche ne dit pas — la semaine, l'historique,
   * l'entretien. Activables dans le menu ; la carte d'un robot y mène. */
  { label: tr('Médias'), vid: 'medias', icon: 'tv-music', c: 'var(--o-purple)' },
  // Bibliothèque de cartes (31/08/2026) : catalogue sur données fictives —
  // activable dans le menu comme les autres vues secondaires, sinon
  // accessible par la recherche et Paramètres → Vues.
  { label: tr('Bibliothèque'), vid: 'biblio', icon: 'apps-add', c: 'var(--o-accent-soft)' },
];

// Vues retirées de la sidebar mais toujours routables (Pièces/Objets les couvrent) — exposées dans la recherche ⌘K.
// Visibilité des vues de la sidebar, pilotée depuis Paramètres → Vues (design Claude Design 21/08).
// hidden = vids masquées parmi les vues principales ; shown = vids réactivées parmi les vues retirées.
export function readViewsCfg() {
  const rd = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  // `order` : l'ordre choisi des vues intégrées dans le menu (vide = ordre d'origine).
  return { hidden: new Set(rd('loggia-hiddenviews')), shown: new Set(rd('loggia-shownviews')), order: rd('loggia-vueordre') };
}

export function writeViewsCfg(cfg) {
  try {
    localStorage.setItem('loggia-hiddenviews', JSON.stringify([...cfg.hidden]));
    localStorage.setItem('loggia-shownviews', JSON.stringify([...cfg.shown]));
    localStorage.setItem('loggia-vueordre', JSON.stringify(cfg.order || []));
  } catch {}
  try { window.dispatchEvent(new Event('loggia-views-changed')); } catch {}
}

// Profils du sélecteur (menu avatar). Administrateur = profil générique par défaut.
// Avatars connus (référencés par clé pour rester sérialisables en localStorage ; les nouveaux users => initiale + couleur).

// `entity_picture` est un chemin absolu servi par Home Assistant. Le dashboard
// tourne sur la même origine : l'image s'affiche telle quelle.
export function personPicture(S, haid) {
  const a = (S && S[haid] && S[haid].attributes) || null;
  return (a && a.entity_picture) || null;
}

export const userImg = (u) => {
  if (!u) return null;
  const S = (getHass() || {}).states || null;
  if (!S) return null;
  const gens = Object.keys(S).filter(k => k.indexOf('person.') === 0);
  const parCompte = u.haId ? gens.find(k => (S[k].attributes || {}).user_id === u.haId) : null;
  if (parCompte) return personPicture(S, parCompte);
  const n = String(u.name || '').trim().toLowerCase();
  if (!n) return null;
  const parNom = gens.find(k => String((S[k].attributes || {}).friendly_name || '').trim().toLowerCase() === n);
  return parNom ? personPicture(S, parNom) : null;
};

export const userBg = (u) => { const im = userImg(u); if (im) return `url(${im}) center/cover`; if (u && u.grad) return u.grad; const c = (u && u.c) || 'var(--o-ok)'; return `linear-gradient(135deg,${c},rgba(${cl_hexRgb(c)},.6))`; };

/**
 * Le bouton des barres d'edition. La barre elle-meme est `BandeauEdition`
 * (App.jsx), la meme dans toutes les vues et toujours en tete du contenu :
 * `ViewEditBar`, qui la doublait dans les Volets et la Securite, est partie
 * le 17/09.
 */
export const editBtn = (accent) => ({ padding: '7px 12px', borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0,
  background: accent ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: accent ? '#06121f' : 'var(--o-text1)',
  border: accent ? 'none' : 'var(--o-bw,1px) solid var(--o-bd2)' });

// opts = { mode:'dark'|'light', loggiaTheme:'' | 'neumorphix' | 'google' | 'ios', haTheme:'' | 'FOLLOW' } → retourne isDark
// Reglages fins de l'utilisateur, appliques PAR-DESSUS le preset (et par-dessus
// « Suivre HA »). Chaque cle ne surcharge que si elle s'ecarte du defaut, pour laisser
// le preset decider du reste : Atrium n'a pas d'ombre, iOS est tres arrondi, etc.
export const LOOK_DEF = { glass: false, radius: 'doux', shadow: true, hairline: true, contrast: false, accent: '', tint: 'douce', fond: 'aucun' };

// Lignes denses de la vue Énergie (même patron que la carte Ambiance des pièces).
export const EnRow = ({ label, desc, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', flexWrap: 'wrap' }}>
    <div style={{ flex: '1 1 190px', minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 }}>{desc}</div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>{children}</div>
  </div>
);

export const EnVal = ({ v, col }) => <span style={{ fontSize: 15, fontWeight: 800, color: col || 'var(--o-text)', whiteSpace: 'nowrap' }}><FlipText live text={String(v)} /></span>;

export const EnGauge = ({ v, pct, col }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
    <EnVal v={v} col={col} />
    <Gauge pct={pct} color={col} h={3} style={{ width: 160 }} />
  </div>
);

export const USER_COLORS = ['#4f8cff', 'var(--o-ok)', 'var(--o-purple)', '#ff8a4c', '#ec4899', '#22d3ee', '#ffb347', '#f87171'];
// Un seul profil au départ, sans nom propre ni liaison à une personne : c'est à
// l'utilisateur d'ajouter les siens dans Paramètres → Utilisateurs.

export const cvName = (st, id) => (st && st.attributes && st.attributes.friendly_name) || id.slice(id.indexOf('.') + 1).replace(/_/g, ' ');

/* ── Fond photo ──────────────────────────────────────────────────────────────
 * L'image de l'utilisateur, compressee a l'import et gardee en dataURL dans le
 * localStorage de l'APPAREIL — jamais envoyee au serveur. Cache module : la
 * chaine pese des centaines de kilo-octets, on ne la relit pas a chaque rendu.
 * L'evenement `loggia-fond-photo` invalide le cache quand on ecrit. */
export const FOND_PHOTO_CLE = 'loggia-fond-photo';
let _fondPhoto;
export function lireFondPhoto() {
  if (_fondPhoto === undefined) {
    try { _fondPhoto = window.localStorage.getItem(FOND_PHOTO_CLE) || null; } catch { _fondPhoto = null; }
  }
  return _fondPhoto;
}
try { window.addEventListener('loggia-fond-photo', () => { _fondPhoto = undefined; }); } catch {}

/**
 * Compresse une image choisie par l'utilisateur : 1920 px de grand cote au
 * plus, JPEG qualite .8. Rend la dataURL, ou lance si le resultat depasse
 * encore ~3,5 Mo — le localStorage n'est pas extensible.
 */
export function compresserImage(fichier) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 1920;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const out = cv.toDataURL('image/jpeg', .8);
      if (out.length > 3.5 * 1024 * 1024) { reject(new Error('image trop lourde')); return; }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')); };
    img.src = url;
  });
}

/* ── Cartes template des vues custom ─────────────────────────────────────────
 * `cv.ents` mele deux formes : l'entity_id nu (une chaine, l'historique) et la
 * carte template `{ t:'tpl', id, name, src }` — `src` est du Jinja, evalue par
 * Home Assistant lui-meme (websocket `render_template`, qui POUSSE chaque
 * nouvelle valeur : rien a rafraichir). Ces deux aides sont le seul endroit
 * qui connaisse la difference ; tout le reste passe par elles. */
export const cvEstTpl = (x) => !!(x && typeof x === 'object' && x.t === 'tpl');
/* Cle unique d'une entree : la chaine elle-meme, l'id genere d'un template, ou
 * `type:id` pour une carte typee — la meme entite peut ainsi vivre deux fois
 * dans une vue sous deux formes (une jauge ET un graphique du meme capteur). */
export const cvKey = (x) => (cvEstTpl(x) ? x.id : (x && typeof x === 'object' && x.t) ? x.t + ':' + x.id : x);
/** L'entity_id d'une entree, quelle que soit sa forme (null pour un template). */
export const cvId = (x) => (typeof x === 'string' ? x : cvEstTpl(x) ? null : x && x.id);

/** Petit formulaire d'ajout d'une carte template (partage entre les deux
 *  editeurs de vues : celui en place et celui des Parametres). */
export function TplForm({ onAdd, hass = null, initial = null }) {
  const [nom, setNom] = useState(initial ? (initial.name || '') : '');
  const [src, setSrc] = useState(initial ? (initial.src || '') : '');
  const ok = src.trim().length > 0;
  /* Aperçu LIVE : le même render_template que la carte, débouncé à la frappe —
   * on voit le résultat (ou l'erreur Jinja) avant d'ajouter, pas après. */
  const [apOut, setApOut] = useState(null);
  const [apErr, setApErr] = useState(null);
  const conn = hass && hass.connection;
  useEffect(() => {
    setApOut(null); setApErr(null);
    const s = src.trim();
    if (!s || !conn) return;
    let unsub = null, mort = false;
    const t = setTimeout(() => {
      conn.subscribeMessage((msg) => {
        if (mort || !msg) return;
        if (msg.error) { setApErr(String(msg.error)); return; }
        setApErr(null); setApOut(msg.result != null ? String(msg.result) : '');
      }, { type: 'render_template', template: s, report_errors: true })
        .then(u => { if (mort) { try { u(); } catch {} } else unsub = u; })
        .catch(e => { if (!mort) setApErr(String((e && e.message) || e)); });
    }, 700);
    return () => { mort = true; clearTimeout(t); if (unsub) { try { unsub(); } catch {} } };
  }, [src, conn]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input aria-label={tr('Titre de la carte (optionnel)')} value={nom} onChange={e => setNom(e.target.value)} placeholder={tr('Titre de la carte (optionnel)')} style={cvInp} />
      <textarea aria-label={tr('Modèle Jinja')}
        value={src} onChange={e => setSrc(e.target.value)} rows={4} spellCheck={false}
        placeholder={"{{ now().strftime('%H:%M') }}"}
        style={{ ...cvInp, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 13, resize: 'vertical', minHeight: 88 }} />
      {ok && conn && (
        <div style={{ padding: '9px 13px', borderRadius: 10, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)' }}>{tr('APERÇU')}</div>
          {apErr
            ? <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-bad)', marginTop: 3, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 72, overflow: 'auto' }}>{apErr}</div>
            : <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 72, overflowY: 'auto', opacity: apOut == null ? .45 : 1 }}>{apOut == null ? '…' : (apOut === '' ? '—' : apOut)}</div>}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--o-text3)', fontWeight: 600 }}>{tr('Jinja, évalué par Home Assistant. La carte se met à jour en direct.')}</span>
        <button disabled={!ok} onClick={() => { if (!ok) return; onAdd({ t: 'tpl', id: initial ? initial.id : 'tpl_' + Math.random().toString(36).slice(2, 8), name: nom.trim(), src: src.trim() }); if (!initial) { setNom(''); setSrc(''); } }}
          style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--o-accent-fond)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: ok ? 'pointer' : 'default', opacity: ok ? 1 : .5, flexShrink: 0 }}>{initial ? tr('Enregistrer') : tr('Ajouter')}</button>
      </div>
    </div>
  );
}

// Carte générique : affichage + action adaptés au domaine de l'entité.

// Recherche + sélection d'entités (réutilisé par l'éditeur de vue et l'ajout de carte en place).
export const cvInp = { width: '100%', padding: '12px 14px', borderRadius: 14, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 14, fontWeight: 600, boxSizing: 'border-box', fontFamily: 'inherit' };

export const CV_ICONS = ['home', 'bulb', 'sparkles', 'thermometer-half', 'blinds', 'bolt', 'tv-music', 'shield-check', 'leaf', 'sun', 'wind', 'users', 'briefcase', 'paw', 'video-camera', 'settings-sliders'];

// Jauge dont la largeur se remplit depuis 0 au montage (puis suit les valeurs).
// Suit un min-width en live (layout PC : rail Accueil ≥ 1180 px)
// ── Animations lot 1 : count-up, stagger d'entrée, jauges qui se remplissent ──
// Au 1er chargement, l'iframe HA n'est peinte qu'après le 1er poll hass : si le count-up démarre avant, le user
// ne voit que la valeur finale. On attend le 1er frame PEINT après que la page soit visible (+ petit délai de sécurité).
export let PAINT_READY = false;
const PAINT_WAITERS = [];
export const onPaintReady = (fn) => { if (PAINT_READY) fn(); else PAINT_WAITERS.push(fn); };
(() => {
  const arm = () => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { PAINT_READY = true; PAINT_WAITERS.splice(0).forEach(f => { try { f(); } catch {} }); }, 600)));
  try { if (document.visibilityState === 'visible') arm(); else document.addEventListener('visibilitychange', function h() { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', h); arm(); } }); } catch { arm(); }
})();

export function Gauge({ pct, color, h = 4, track = 'var(--o-bd1)', style, liquid = false }) {
  const [w, setW] = useState(REDUCE_MOTION ? pct : 0);
  useEffect(() => { let alive = true, id = 0; onPaintReady(() => { if (alive) id = requestAnimationFrame(() => setW(pct)); }); return () => { alive = false; cancelAnimationFrame(id); }; }, [pct]);
  return (
    <div style={{ height: h, borderRadius: h, background: track, overflow: 'hidden', ...style }}>
      <div className={liquid && !REDUCE_MOTION ? 'o-liquid' : undefined} style={{ height: '100%', width: Math.max(0, Math.min(100, w || 0)) + '%', background: color, borderRadius: h, transition: REDUCE_MOTION ? 'none' : 'width .7s cubic-bezier(.22,.61,.36,1)' }} />
    </div>
  );
}
// (Ancienne entree en cascade — neutralisee : stag() ne renvoie plus de delai.)
// ── Animations lot 2 : tilt 3D au survol (pointeur fin) + FlipText (états qui basculent) ──

// FlipText : quand le texte change, l'ancien glisse vers le haut et le nouveau monte du bas (slot machine).
export function FlipText({ text, style, live = false }) {
  const [cur, setCur] = useState(text);
  const [prev, setPrev] = useState(null);
  const [k, setK] = useState(0);
  useEffect(() => {
    if (text === cur) return;
    if (REDUCE_MOTION) { setCur(text); return; }
    setPrev(cur); setCur(text); setK(x => x + 1);
    const t = setTimeout(() => setPrev(null), 380);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <span aria-live={live ? 'polite' : undefined} style={{ position: 'relative', display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', maxWidth: '100%', ...style }}>
      <span key={'c' + k} className={prev != null ? 'o-flip-in' : undefined} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>{cur}</span>
      {prev != null && <span key={'p' + k} className="o-flip-out" aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap' }}>{prev}</span>}
    </span>
  );
}
// Props a11y d'un slider custom : role/aria + pilotage clavier (flèches ±step, PageUp/Down ±2·step, Home/End).
// À étaler sur l'élément qui porte le onPointerDown du drag.

// Bottom sheet réutilisable : monte du bas (courbe drawer iOS), scrim fondu, poignée, fermeture animée.
// children peut être une fonction (close) => JSX pour brancher la croix sur la fermeture ANIMÉE.
/* La croix des feuilles : la même partout, au même endroit (retour du 19/09 :
 * « toutes les popups n'ont pas le même bouton pour fermer ni au même
 * endroit »), puis SUR la ligne d'en-tête, en dernier, à la taille de ses
 * voisins (« pourquoi ils ne sont pas alignés ? et horizontalement ») : 34 px,
 * rayon 10, le fond de l'épingle. Elle ferme la feuille qui la contient. */
const CROIX = <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>;
const FermerCtx = createContext(null);
export function CroixFeuille({ style = null }) {
  const fermer = useContext(FermerCtx);
  return (
    <button type="button" data-croix="" onClick={() => { if (fermer) fermer(); }} aria-label={tr('Fermer')} title={tr('Fermer')}
      style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text1)', ...style }}>{CROIX}</button>
  );
}
/* Une ligne de titre simple : le titre à gauche, la croix à droite. */
export function TitreFeuille({ children, style = null, marge = 0 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: marge }}>
      <div style={{ flex: 1, minWidth: 0, ...style }}>{children}</div>
      <CroixFeuille />
    </div>
  );
}

/* `onglets` : une feuille à onglets garde la même hauteur d'un onglet à
 * l'autre (retour du 19/09 : « là où il faut que ce soit identique, c'est
 * quand une popup a plusieurs onglets ») — voir `.o-sheet-onglets` dans
 * index.css. Les autres suivent leur contenu : une hauteur unique partout
 * n'allait pas. */
export function BottomSheet({ onClose, children, opaque = false, onglets = false, title = null }) {
  const [closing, setClosing] = useState(false);
  // Le filet (si l'animation ne se declenche pas) est ANNULE quand elle se
  // termine : sinon `onClose` partait deux fois a chaque fermeture (audit 18/09).
  const filet = useRef(null);
  const close = () => { if (closing) return; setClosing(true); filet.current = setTimeout(onClose, 420); };
  const sheetRef = useRef(null);
  // Un `click` est emis sur l'ANCETRE COMMUN du mousedown et du mouseup. Une
  // selection de texte commencee dans un champ et relachee dehors le fait donc
  // naitre sur le voile — qui fermait la feuille en pleine saisie. Le
  // stopPropagation de la feuille n'y peut rien : l'evenement n'y passe pas.
  const partiDuVoile = useRef(false);
  // A11y : focus dans la feuille à l'ouverture (Escape marche alors partout), restauré à la fermeture
  useEffect(() => {
    const prev = document.activeElement;
    /* Le premier élément du contenu, pas la croix ; et un champ qui a déjà
     * pris le focus (`autoFocus` de la recherche) le garde. */
    const t = setTimeout(() => { try {
      const el = sheetRef.current; if (!el || el.contains(document.activeElement)) return;
      const cible = [...el.querySelectorAll('button, [tabindex="0"], input, [role="switch"]')].find(n => !n.hasAttribute('data-croix'));
      (cible || el).focus({ preventScroll: true });
    } catch {} }, 60);
    return () => { clearTimeout(t); try { if (prev && prev.focus) prev.focus({ preventScroll: true }); } catch {} };
  }, []);
  // Glisser-fermer iOS : la feuille suit le doigt depuis la poignée ; > 120 px = fermeture, sinon rebond spring.
  const dragClose = (e) => {
    const el = sheetRef.current; if (!el || closing) return;
    e.preventDefault();
    const y0 = e.clientY; let dy = 0;
    const h = e.currentTarget;
    el.style.animation = 'none'; el.style.transition = 'none';
    try { h.setPointerCapture(e.pointerId); } catch {}
    h.onpointermove = (ev) => { dy = Math.max(0, ev.clientY - y0); el.style.transform = `translate(-50%, ${dy}px)`; };
    const up = () => {
      h.onpointermove = null; h.onpointerup = null; h.onpointercancel = null;
      if (dy > 120) { el.style.transition = 'transform .26s cubic-bezier(.32,.72,.25,1)'; el.style.transform = 'translate(-50%, 108%)'; setTimeout(onClose, 250); }
      else { el.style.transition = REDUCE_MOTION ? 'none' : 'transform .45s cubic-bezier(.22,1.28,.36,1)'; el.style.transform = 'translate(-50%, 0)'; }
    };
    h.onpointerup = up; h.onpointercancel = up;
  };
  return (
    /* Les événements POINTEUR s'arrêtent au voile : une feuille ouverte depuis
     * une section en mode édition vit dans le wrapper de cette section, dont
     * le glisser-déposer capturait le pointeur — le clic sur une ligne de la
     * feuille partait alors à la section et l'ajout ne se faisait jamais
     * (retour 01/09). Les gestes internes (poignée, boutons) sont plus bas
     * dans l'arbre : ils continuent de fonctionner. */
    <div role="presentation"
      onPointerDown={(e) => { e.stopPropagation(); partiDuVoile.current = e.target === e.currentTarget; }}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => { if (e.target === e.currentTarget && partiDuVoile.current) close(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.32)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', animation: closing ? 'o-fadeOut .3s ease forwards' : 'o-fadeIn .25s ease' }}>
      {/* Une boite de dialogue qui ecoute le clavier n'est pas une anomalie :
        * Echap la ferme et Tab y boucle, ce que la regle nomme justement
        * comme le motif attendu ailleurs. Elle voit ici un role passif a qui
        * on aurait rajoute des gestes. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div ref={sheetRef} className={'o-sheet' + (opaque ? ' o-sheet-opaque' : '') + (onglets ? ' o-sheet-onglets' : '')} role="dialog" aria-modal="true" tabIndex={-1} onClick={e => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
          // Piège de focus : Tab boucle dans la feuille — derrière, la page vit
          // encore, et le clavier s'y perdait sans le voir.
          if (e.key === 'Tab') {
            const el = sheetRef.current; if (!el) return;
            const focs = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (!focs.length) return;
            const premier = focs[0], dernier = focs[focs.length - 1];
            if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
            else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
          }
        }}
        onAnimationEnd={(e) => { if (closing && e.target === e.currentTarget) { clearTimeout(filet.current); onClose(); } }}
        style={{ position: 'fixed', left: '50%', bottom: 0, transform: 'translate(-50%,0)', width: 'min(480px,100%)', maxHeight: '88vh', overflowY: 'auto', background: opaque ? 'linear-gradient(var(--o-surfA), var(--o-surfA)), var(--o-bg)' : 'var(--o-surfA)', borderTop: 'var(--o-bw,1px) solid var(--o-bd1)', borderLeft: 'var(--o-bw,1px) solid var(--o-bd1)', borderRight: 'var(--o-bw,1px) solid var(--o-bd1)', borderRadius: '26px 26px 0 0', padding: '10px 22px calc(24px + var(--o-safe-bottom,0px))', boxShadow: '0 -10px 50px rgba(0,0,0,.35)', animation: closing ? 'o-sheetOut .3s cubic-bezier(.32,.72,.25,1) forwards' : 'o-sheetIn .46s cubic-bezier(.22,1.28,.36,1)' }}>
        <div onPointerDown={dragClose} style={{ touchAction: 'none', cursor: 'grab', padding: '8px 60px 12px', margin: '-10px auto 2px', width: 'fit-content' }}>
          <div style={{ width: 38, height: 5, borderRadius: 4, background: 'var(--o-bd1)', margin: '0 auto' }} />
        </div>
        {/* La croix vit sur la ligne d'en-tête de chaque feuille (`CroixFeuille`,
          * `TitreFeuille`, `FicheEntete`) ; elle ferme par ce contexte. Une
          * feuille qui ne passe qu'un `title` reçoit la ligne toute faite. */}
        <FermerCtx.Provider value={close}>
          {title ? <TitreFeuille style={{ fontSize: 17, fontWeight: 800 }} marge={12}>{title}</TitreFeuille> : null}
          {typeof children === 'function' ? children(close) : children}
        </FermerCtx.Provider>
      </div>
    </div>
  );
}


// La largeur utile de l'écran : `innerWidth` compte la barre de défilement,
// et le menu venait s'y coller.
const largeurEcran = () => (document.documentElement && document.documentElement.clientWidth) || window.innerWidth;

/* ── Les listes de Loggia : les choix et les suggestions ──────────────────────
 *
 * Le menu d'un <select> natif, comme celui d'une <datalist>, est dessiné par
 * le système : blanc sous Windows, quel que soit le thème, et rien ne le
 * stylise (retour du 18/09, menus des Alertes). Loggia dessine les siens — le
 * menu « Collection » des Scénarios, devenu commun —, TOUS à la même taille
 * (`LARGEUR_MENU` × `HAUTEUR_MENU` : « même largeur et même hauteur »). La
 * logique pure (filtrer, grouper, placer) : `choix.js`.
 *
 * Le panneau est rendu dans <body>, pas à côté de son ancre : un ancêtre flou
 * (`backdrop-filter` de `.o-bar`), transformé ou animé devient le repère d'un
 * `position: fixed`, et le menu tombait alors en bas de page, loin du bouton
 * (retour du 18/09). Dans <body>, le repère est toujours l'écran. Il s'ouvre
 * sous son ancre, au-dessus quand la place manque en bas. */

/* Le panneau suit son ancre : mesuré à l'ouverture, puis au défilement et au
 * redimensionnement. La liste qui défile ne déplace pas son ancre. */
function usePanneau(ouvert, ancreRef, panneauRef) {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!ouvert) { setPos(null); return undefined; }
    const place = (e) => {
      if (e && e.type === 'scroll' && panneauRef.current && panneauRef.current.contains(e.target)) return;
      const el = ancreRef.current; if (!el) return;
      setPos(placerMenu(el.getBoundingClientRect(), largeurEcran(), window.innerHeight));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [ouvert, ancreRef, panneauRef]);
  return pos;
}

// Le cadre : partout la même taille, au-dessus des feuilles (z-index 200).
const cadrePanneau = (pos) => ({ position: 'fixed', left: pos.left, top: pos.dessous ? pos.top : undefined, bottom: pos.dessous ? undefined : pos.bottom, zIndex: 9000, width: pos.w, height: pos.h, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', padding: 6, borderRadius: 14, background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', border: 'var(--o-bw,1px) solid var(--o-bd1)', boxShadow: '0 18px 44px rgba(0,0,0,.4)' });

// La zone qui défile : toute la hauteur que le filtre laisse.
/* `outline: none` assumé, et le seul qui reste (plan M7) : cette zone ne reçoit
 * le focus que par programme (`tabIndex={-1}`), pour que les flèches y marchent.
 * Ce qui doit se voir, c'est l'OPTION visée — elle porte son liseré, et
 * `aria-activedescendant` l'annonce. Un anneau autour de la liste entière
 * désignerait la mauvaise chose. */
const ZONE_LISTE = { flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', outline: 'none' };

/* Les options : groupes en capitales, coche du choix, identifiant en petit
 * dessous. `onPointe` suit la souris ; le liseré de l'option visée ne sert
 * qu'au clavier — à la souris, le survol suffit.
 *
 * `ico`, facultatif, glisse un dessin entre la coche et le libellé : une
 * disposition se reconnaît à sa forme avant de se lire (20/09). */
function OptionsPanneau({ base, options, value, actif, auClavier, onPointe, onChoisir, vide = null }) {
  const ligne = ({ o, i }) => {
    const on = o.id === value;
    const survol = i === actif;
    return (
      <button key={'o:' + o.id} id={base + '-o' + i} type="button" role="option" aria-selected={on} tabIndex={-1}
        onMouseMove={() => onPointe(i)} onClick={() => onChoisir(o)} title={o.sub ? o.label + ' — ' + o.sub : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: o.sub ? '6px 10px' : '8px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: 12, fontWeight: on ? 700 : 600,
          background: on ? 'var(--o-accent-fond)' : survol ? 'var(--o-s2)' : 'transparent', color: on ? '#fff' : 'var(--o-text1)',
          boxShadow: on && survol && auClavier ? 'inset 0 0 0 2px rgba(255,255,255,.45)' : 'none' }}>
        <span style={{ width: 13, display: 'inline-flex', flexShrink: 0 }}>{on ? <Fi i="check" size={12} color="#fff" /> : null}</span>
        {o.ico ? <span style={{ display: 'inline-flex', flexShrink: 0, color: on ? '#fff' : 'var(--o-text2)' }}>{o.ico}</span> : null}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</span>
          {o.sub ? <span style={{ display: 'block', marginTop: 1, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', fontSize: 10.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: on ? 'rgba(255,255,255,.78)' : 'var(--o-text3)' }}>{o.sub}</span> : null}
        </span>
      </button>
    );
  };
  return (
    <>
      {options.length === 0 && vide && <div style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{vide}</div>}
      {blocsChoix(options).map((b, k) => (b.groupe
        ? (
          <div key={'g' + k} role="group" aria-labelledby={base + '-g' + k}>
            <div id={base + '-g' + k} style={{ padding: '8px 10px 4px', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--o-text3)' }}>{b.groupe}</div>
            {b.items.map(ligne)}
          </div>
        )
        : <Fragment key={'g' + k}>{b.items.map(ligne)}</Fragment>))}
    </>
  );
}

/* La liste de choix. Sans `style`, son bouton est la pastille bleu plein des
 * barres d'outils ; avec, il prend celui de l'appelant — un champ de
 * formulaire. `children(courant, ouvert)`, s'il est donné, en dessine
 * l'intérieur. `options` : `{ id, label, sub?, groupe? }` — `sub`, un
 * identifiant, se lit en petit sous le nom ; les options qui se suivent sous
 * un même `groupe` passent sous son intitulé. Au-delà de douze, un champ
 * filtre la liste. Clavier : flèches, Début, Fin, Entrée ; Échap et Tab
 * referment et rendent la main au bouton. */
export function ListeChoix({ value, options, onChange, label, style = null, children = null, recherche = null, vide = '—' }) {
  const [open, setOpen] = useState(false);
  const [filtre, setFiltre] = useState('');
  const [actif, setActif] = useState(-1);
  // Le liseré de l'option visée ne sert qu'au clavier : à la souris, le
  // survol suffit, et le menu reste celui de « Collection ».
  const [auClavier, setAuClavier] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const champRef = useRef(null);
  const listeRef = useRef(null);
  const focalise = useRef(false);
  const base = useId();
  const pos = usePanneau(open, wrapRef, menuRef);
  const liste = Array.isArray(options) ? options : [];
  const cur = liste.find(o => o.id === value) || null;
  const avecRecherche = recherche != null ? !!recherche : liste.length > SEUIL_RECHERCHE;
  const visibles = open ? filtrerChoix(liste, filtre) : liste;
  const vise = actif >= 0 && actif < visibles.length ? base + '-o' + actif : undefined;

  const fermer = (rendre) => {
    setOpen(false); setFiltre(''); setActif(-1);
    if (rendre) { try { if (btnRef.current) btnRef.current.focus({ preventScroll: true }); } catch { /* bouton parti */ } }
  };
  const ouvrir = (clavier) => { setFiltre(''); setAuClavier(!!clavier); setActif(Math.max(0, liste.findIndex(o => o.id === value))); setOpen(true); };
  const choisir = (o) => { if (o) onChange(o.id); fermer(true); };

  // Un appui dehors referme. Échap aussi, et avant la feuille qui contient le
  // choix : écouté en capture sur le document, il ne ferme que le menu.
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && wrapRef.current.contains(e.target)) return;
      // Le menu n'est pas DANS le bouton : un appui dedans n'est pas un appui dehors.
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false); setFiltre(''); setActif(-1);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false); setFiltre(''); setActif(-1);
      try { if (btnRef.current) btnRef.current.focus({ preventScroll: true }); } catch { /* bouton parti */ }
    };
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', onDoc, true); document.removeEventListener('keydown', onKey, true); };
  }, [open]);

  // Le focus, une fois par ouverture : le filtre sur un poste à souris ;
  // ailleurs la liste elle-même, sans faire surgir le clavier du téléphone.
  useEffect(() => {
    if (!open) { focalise.current = false; return; }
    if (!pos || focalise.current) return;
    focalise.current = true;
    let tactile = false;
    try { tactile = window.matchMedia('(pointer: coarse)').matches; } catch { /* sans matchMedia : un poste à souris */ }
    const cible = avecRecherche && !tactile ? champRef.current : listeRef.current;
    try { if (cible) cible.focus({ preventScroll: true }); } catch { /* menu parti */ }
  }, [open, pos, avecRecherche]);

  // L'option visée reste en vue — la choisie aussi, dès l'ouverture.
  const pret = !!pos;
  useEffect(() => {
    if (!open || !pret || actif < 0) return;
    const el = document.getElementById(base + '-o' + actif);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [open, pret, actif, base]);

  const surTouche = (e) => {
    const n = visibles.length;
    const surListe = e.currentTarget === listeRef.current;
    if (e.key === 'ArrowDown') { e.preventDefault(); setAuClavier(true); if (n) setActif(i => (i + 1 >= n ? 0 : i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAuClavier(true); if (n) setActif(i => (i <= 0 ? n - 1 : i - 1)); }
    else if (surListe && (e.key === 'Home' || e.key === 'End')) { e.preventDefault(); setAuClavier(true); if (n) setActif(e.key === 'Home' ? 0 : n - 1); }
    else if (e.key === 'Enter' || (surListe && e.key === ' ')) { e.preventDefault(); if (actif >= 0 && actif < n) choisir(visibles[actif]); }
    // Tab referme et rend la main au bouton : la tabulation repart de lui.
    else if (e.key === 'Tab') fermer(true);
  };

  const pastille = { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, border: 'none', background: 'var(--o-accent-fond)', color: '#fff' };
  const plein = !!(style && style.width === '100%');
  return (
    <span ref={wrapRef} style={{ position: 'relative', display: plein ? 'flex' : 'inline-flex', width: plein ? '100%' : undefined, maxWidth: '100%', minWidth: 0 }}>
      <button ref={btnRef} type="button" onClick={(e) => (open ? fermer(false) : ouvrir(e.detail === 0))}
        onKeyDown={(e) => { if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); ouvrir(true); } }}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? base + '-l' : undefined}
        aria-label={label + (cur ? ' : ' + cur.label : '')}
        style={style ? { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', ...style } : pastille}>
        {children ? children(cur, open) : (
          <>
            <span style={{ flex: style ? 1 : 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cur ? cur.label : vide}</span>
            <span style={{ display: 'inline-flex', flexShrink: 0, transition: 'transform .18s', transform: open ? 'rotate(180deg)' : 'none' }}><Fi i="angle-small-down" size={13} color={style ? 'var(--o-text3)' : '#fff'} /></span>
          </>
        )}
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} style={cadrePanneau(pos)}>
          {avecRecherche && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, margin: '0 0 6px', padding: '7px 10px', borderRadius: 10, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
              <Fi i="search" size={12} color="var(--o-text3)" />
              <input ref={champRef} type="text" value={filtre} onChange={(e) => { setFiltre(e.target.value); setActif(0); }} onKeyDown={surTouche}
                role="combobox" aria-expanded="true" aria-controls={base + '-l'} aria-autocomplete="list" aria-activedescendant={vise}
                aria-label={tr('Rechercher…')} placeholder={tr('Rechercher…')} autoComplete="off" spellCheck={false}
                style={{ flex: 1, minWidth: 0, padding: 0, border: 'none', background: 'transparent', color: 'var(--o-text)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600 }} />
            </span>
          )}
          <div ref={listeRef} id={base + '-l'} role="listbox" tabIndex={-1} aria-label={label} aria-activedescendant={vise} onKeyDown={surTouche} style={ZONE_LISTE}>
            <OptionsPanneau base={base} options={visibles} value={value} actif={actif} auClavier={auClavier}
              onPointe={(i) => { if (actif !== i) setActif(i); if (auClavier) setAuClavier(false); }} onChoisir={choisir} vide={tr('Aucun résultat')} />
          </div>
        </div>
      , document.body)}
    </span>
  );
}

/* Un champ libre et ses suggestions — il remplace la <datalist>, dont la
 * liste native s'ouvrait blanche elle aussi (retour du 18/09 : « fais aussi
 * les suggestions sous le champ »). On tape ce qu'on veut ; le panneau des
 * menus, à leur taille, propose ce qui y ressemble. Rien ne ressemble, ou la
 * valeur est déjà la seule suggestion : pas de panneau. */
export function ChampSuggere({ value, onChange, suggestions, label, id = null, placeholder = '', style = null }) {
  const [open, setOpen] = useState(false);
  const [actif, setActif] = useState(-1);
  const [auClavier, setAuClavier] = useState(false);
  const champRef = useRef(null);
  const menuRef = useRef(null);
  const base = useId();
  const liste = Array.isArray(suggestions) ? suggestions : [];
  const texte = value == null ? '' : String(value);
  const visibles = open ? filtrerChoix(liste, texte) : [];
  const montre = visibles.length > 0 && !(visibles.length === 1 && visibles[0].id === texte);
  const pos = usePanneau(montre, champRef, menuRef);
  const vise = montre && actif >= 0 && actif < visibles.length ? base + '-o' + actif : undefined;
  const fermer = () => { setOpen(false); setActif(-1); };
  const choisir = (o) => { if (o) onChange(o.id); fermer(); };

  // Échap referme la liste, pas la feuille qui contient le champ.
  useEffect(() => {
    if (!montre) return undefined;
    const onKey = (e) => { if (e.key !== 'Escape') return; e.stopPropagation(); setOpen(false); setActif(-1); };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [montre]);

  // La suggestion visée reste en vue.
  useEffect(() => {
    if (!vise) return;
    const el = document.getElementById(vise);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [vise]);

  const surTouche = (e) => {
    const n = visibles.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setAuClavier(true); if (!open) setOpen(true); else if (n) setActif(i => (i + 1 >= n ? 0 : i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAuClavier(true); if (n) setActif(i => (i <= 0 ? n - 1 : i - 1)); }
    else if (e.key === 'Enter' && montre && actif >= 0 && actif < n) { e.preventDefault(); choisir(visibles[actif]); }
    else if (e.key === 'Tab') fermer();
  };
  return (
    <>
      {/* Le champ a TOUJOURS un nom : son `<label htmlFor>` quand on lui donne
        * un `id`, `aria-label` sinon. La règle ne sait pas lire ce « ou ». */}
      {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
      <input ref={champRef} id={id || undefined} value={texte} placeholder={placeholder} spellCheck={false} autoComplete="off"
        role="combobox" aria-expanded={montre} aria-controls={base + '-l'} aria-autocomplete="list" aria-activedescendant={vise}
        aria-label={id ? undefined : label}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActif(-1); }}
        onFocus={() => setOpen(true)} onBlur={fermer} onKeyDown={surTouche} style={style || undefined} />
      {montre && pos && createPortal(
        <div ref={menuRef} style={cadrePanneau(pos)}>
          {/* Un appui dans la liste ne retire pas le focus au champ : la suggestion s'inscrit, on continue de taper. */}
          <div id={base + '-l'} role="listbox" tabIndex={-1} aria-label={label} onMouseDown={(e) => e.preventDefault()} style={ZONE_LISTE}>
            <OptionsPanneau base={base} options={visibles} value={texte} actif={actif} auClavier={auClavier}
              onPointe={(i) => { if (actif !== i) setActif(i); if (auClavier) setAuClavier(false); }} onChoisir={choisir} />
          </div>
        </div>
      , document.body)}
    </>
  );
}

export const CV_DOM_ICON = { light: 'bulb', switch: 'bolt', input_boolean: 'bolt', fan: 'wind', sensor: 'chart-line-up', binary_sensor: 'radar', climate: 'thermometer-half', cover: 'blinds', media_player: 'tv-music', scene: 'sparkles', script: 'play', button: 'power', input_button: 'power', lock: 'shield-check', person: 'users', weather: 'cloud-sun', vacuum: 'broom', camera: 'video-camera', automation: 'bolt' };

export const cvDomain = (id) => id.slice(0, id.indexOf('.'));

export function EntPicker({ hass, exclude = [], onPick, autoFocus = false, domaines = null }) {
  const [q, setQ] = useState('');
  // `hass` est remplace a chaque etat de la maison : trier toutes les entites a
  // ce rythme saccadait la frappe. La liste ne se refait que si les
  // identifiants changent ; le reste se lit par une reference vivante.
  const hRef = useRef(hass);
  hRef.current = hass;
  const ids = hass && hass.states ? Object.keys(hass.states).join('|') : '';
  const all = useMemo(() => {
    const st = (hRef.current && hRef.current.states) || null;
    if (!st) return [];
    return ids.split('|').filter(Boolean).map(id => ({ id, name: cvName(st[id], id), dom: cvDomain(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [ids]);
  const ql = q.trim().toLowerCase();
  /* `domaines` : une carte choisie d'abord (galerie) ne va qu'avec certains
   * domaines — inutile de proposer une lampe à une carte de calendrier. Sans
   * filtre, la recherche exige au moins une lettre ; avec filtre, la liste
   * s'ouvre déjà sur ce qui convient. */
  const dom = (e) => !domaines || domaines.indexOf(e.dom) >= 0;
  const results = (ql || domaines)
    ? all.filter(e => dom(e) && (!ql || e.id.toLowerCase().indexOf(ql) >= 0 || e.name.toLowerCase().indexOf(ql) >= 0) && exclude.indexOf(e.id) < 0).slice(0, 30)
    : [];
  return (
    <>
      <input aria-label={tr('Rechercher une entité (nom ou id)…')} value={q} onChange={e => setQ(e.target.value)} placeholder={tr('Rechercher une entité (nom ou id)…')} spellCheck={false} autoFocus={autoFocus} style={cvInp} />
      {results.length > 0 && (
        <div style={{ maxHeight: 240, overflowY: 'auto', marginTop: 8, border: 'var(--o-bw,1px) solid var(--o-bd3)', borderRadius: 14 }}>
          {results.map(e => (
            <button type="button" key={e.id} onClick={() => onPick(e.id)}
              style={{ width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', background: 'none', border: 0, borderBottom: 'var(--o-bw,1px) solid var(--o-bd3)', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', cursor: 'pointer' }}>
              <span style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text2)' }}><Fi i={CV_DOM_ICON[e.dom] || 'bolt'} size={13} /></span>
              <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span><span style={{ display: 'block', fontSize: 11, color: 'var(--o-text3)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.id}</span></span>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--o-accent-soft)' }}>+</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ── Les regles : un en-tete qui sait se replier ────────────────────────────
 *
 * Une regle activee gardait tout son parametrage a l'ecran. Or on la regle
 * une fois, puis on n'y revient plus : sur Parametres > Regles, cinq familles
 * deployees remplissaient plusieurs ecrans de champs qu'on ne relit jamais.
 *
 * « Activee » et « depliee » deviennent donc deux etats distincts. Le pli ne
 * touche pas au fonctionnement : la regle continue de tourner, on cesse
 * seulement de la regarder.
 *
 * L'en-tete etait ecrit trois fois a l'identique — volets, nuit, veilles. Le
 * poser ici evite d'avoir a lui ajouter le pli trois fois, et d'oublier la
 * quatrieme vue le jour ou elle arrivera.
 */

/** Le pli d'une regle, retenu SUR CET APPAREIL.
 *
 * `loggia-reglespanel` se termine par « panel » : `estPersonnelle` la classe
 * donc d'office parmi les cles qui ne suivent pas la maison. C'est voulu —
 * ce qu'on a replie sur son telephone n'a pas a se replier sur la tablette de
 * quelqu'un d'autre.
 *
 * Une seule cle pour toutes les regles, et non une par regle : le stockage
 * local n'est pas extensible a l'infini, et un objet se relit d'un bloc.
 */
export function usePli(cle) {
  const lire = () => {
    try { return JSON.parse(window.localStorage.getItem('loggia-reglespanel') || '{}') || {}; }
    catch { return {}; }
  };
  const [plie, setPlie] = useState(() => !!lire()[cle]);
  /* L'ecriture reste DEHORS de l'updater : React se reserve le droit de
   * rappeler celui-ci, et un updater doit rester pur. */
  const basculer = () => {
    const n = !plie;
    try {
      const o = lire();
      if (n) o[cle] = 1; else delete o[cle];
      window.localStorage.setItem('loggia-reglespanel', JSON.stringify(o));
    } catch { /* stockage indisponible : le pli ne survivra pas, tant pis */ }
    setPlie(n);
  };
  return [plie, basculer];
}

/** L'en-tete d'une regle : son nom, ce qu'elle fait, son interrupteur.
 *
 * `onPlier` absent, ou regle eteinte, l'en-tete redevient ce qu'il etait : un
 * titre inerte. On ne replie pas ce qui n'affiche rien.
 */
/* ── L'état d'une famille de règles, relu périodiquement ──────────────────────
 *
 * Six vues faisaient exactement cela, à la ligne près : un premier appel, un
 * intervalle, un drapeau « vivant » pour ne pas écrire dans un composant
 * démonté, et `[!!h]` en dépendance.
 *
 * `[!!h]` est voulu. Home Assistant REMPLACE son objet `hass` à chaque
 * changement d'état de la maison : en dépendre relancerait le sondage plusieurs
 * fois par seconde, chaque fois qu'une lampe s'allume. Mais la fermeture gardait
 * alors le `hass` du tout premier rendu, et pour toujours.
 *
 * Rien ne cassait — la connexion, elle, survit à ces remplacements. C'est
 * précisément ce qui rendait le défaut invisible : il ne tenait pas au code
 * écrit ici, mais à une propriété de Home Assistant que personne n'avait notée
 * nulle part, et que rien n'oblige à rester vraie.
 *
 * La référence vivante rend la question sans objet : chaque tour lit le `hass`
 * du moment, et la dépendance redevient un booléen que l'outil sait vérifier.
 */
export function useEtatServeur(hass, type, ms, siErreur) {
  const [etat, setEtat] = useState(null);
  const [err, setErr] = useState('');
  const vivant = useRef(true);
  const hRef = useRef(null);
  const courant = hass && typeof hass.callWS === 'function' ? hass : null;
  /* Sans tableau : à chaque rendu, avant l'effet de sondage déclaré plus bas. */
  useEffect(() => { hRef.current = courant; });
  const connecte = !!courant;

  useEffect(() => {
    vivant.current = true;
    if (!connecte) { setErr(tr('Home Assistant n’est pas joignable.')); return undefined; }
    const lire = () => hRef.current.callWS({ type })
      .then(r => { if (vivant.current) { setEtat(r); setErr(''); } })
      .catch(e => { if (vivant.current) setErr((e && (e.message || e.code)) || siErreur); });
    lire();
    const t = setInterval(lire, ms);
    return () => { vivant.current = false; clearInterval(t); };
  }, [connecte, type, ms, siErreur]);

  return { etat, setEtat, err, setErr, vivant };
}

export function RegleEntete({ nom, desc, on, cb, plie = false, onPlier = null, zone = null, note = null }) {
  // Le titre d'une regle parle comme celui d'un panneau de reglages (maquettes du 18/09).
  const titre = { fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 20, fontWeight: 500, lineHeight: 1.2 };
  const sous = { fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, marginTop: 3, lineHeight: 1.45 };
  const pliable = !!(on && onPlier);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      {/* `aria-expanded` dit l'etat, `aria-controls` dit DE QUOI.
        *
        * Le second n'est pose QUE deplie, et c'est voulu : replier ne masque
        * pas la region, cela la demonte. `aria-controls` designerait alors un
        * identifiant absent du document — une reference pendante, que les
        * verificateurs signalent et qui ne mene nulle part.
        *
        * Le motif canonique garderait la region montee et la cacherait par
        * `hidden`, ce qui tiendrait la relation dans les deux etats. Ce n'est
        * pas ce que fait Loggia : ces panneaux embarquent des champs et des
        * effets, et on ne les laisse pas tourner sous un pli. */}
      <button type="button" onClick={pliable ? onPlier : undefined} disabled={!pliable}
        aria-expanded={pliable ? !plie : undefined}
        aria-controls={pliable && zone && !plie ? zone : undefined}
        style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0,
          color: 'inherit', font: 'inherit', cursor: pliable ? 'pointer' : 'default' }}>
        <div style={{ ...titre, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ minWidth: 0 }}>{nom}</span>
          {pliable && <Fi i={plie ? 'angle-small-down' : 'angle-small-up'} size={13} />}
        </div>
        <div style={sous}>{desc}</div>
        {note && <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--o-warn)', marginTop: 7 }}>{note}</div>}
      </button>
      <Bascule nom={nom} on={!!on} cb={cb} />
    </div>
  );
}

/** L'interrupteur d'une regle.
 *
 * Repris trait pour trait des trois copies locales : memes dimensions, memes
 * variables de couleur. Un composant partage qui change l'apparence en passant
 * n'est pas une extraction, c'est une refonte — et personne ne l'a demandee.
 */
export function Bascule({ on, cb, nom = null }) {
  return (
    <button type="button" onClick={cb} role="switch" aria-checked={!!on} aria-label={nom || undefined}
      style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, padding: 3,
        background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start' }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', background: on ? '#fff' : 'var(--o-text3)' }} />
    </button>
  );
}
