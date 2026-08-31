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
import { useState, useEffect, useRef, useMemo } from 'react';
import { getHass } from './state.js';
import { tr } from './i18n.js';

// Suit un min-width en live (layout PC : rail Accueil ≥ 1180 px)
// ── Animations lot 1 : count-up, stagger d'entrée, jauges qui se remplissent ──
export const REDUCE_MOTION = (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();

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
      className={'o-hov ' + (tilt.className || '') + (className ? ' ' + className : '')} style={{ position: 'relative', borderRadius: 'var(--o-radius,20px)', minWidth: 0, ...style }}>
      {children}
    </div>
  );
}

export const HX_TOKENS = { 'var(--o-accent)': '--o-accent-rgb', 'var(--o-accent-soft)': '--o-accent-soft-rgb', 'var(--o-ok)': '--o-ok-rgb', 'var(--o-warn)': '--o-warn-rgb', 'var(--o-warn2)': '--o-warn2-rgb', 'var(--o-bad)': '--o-bad-rgb', 'var(--o-cold)': '--o-cold-rgb', 'var(--o-gold)': '--o-gold-rgb', 'var(--o-purple)': '--o-purple-rgb', 'var(--o-cyan)': '--o-cyan-rgb' };

export const cl_hexRgb = (c) => HX_TOKENS[c] ? `var(${HX_TOKENS[c]})` : (typeof c !== 'string' || c[0] !== '#') ? '140,152,180' : `${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)}`;

/* Une FONCTION, pas une table.
 *
 * Evaluee a l'import, cette liste figeait ses libelles dans la langue du
 * demarrage. C'est ce qui obligeait a recharger la page apres un changement de
 * langue. Appelee au rendu, elle se dit dans la langue du moment. */
export const HIDDEN_VIEWS = () => [
  { label: tr('Lumières'), vid: 'lumieres', icon: 'bulb', c: '#ffce73' },
  { label: tr('Climat'), vid: 'climat', icon: 'thermometer-half', c: '#ff8a4c' },
  /* Volets a quitté la liste le 30/08/2026 : l'Ouverture vit DANS la vue
   * Climatisation (ClimatView rend VoletsContent). La route reste. */
  /* Aspirateur et Croquettes ont quitté la liste le 30/08/2026 : la FICHE
   * APPAREIL UNIVERSELLE (tap sur la carte, vue Objets) montre tout ce que
   * l'appareil expose — la vue dédiée ne racontait rien de plus. Les routes
   * restent : un appareil qui a mémorisé cette vue l'affiche encore. */
  { label: tr('Médias'), vid: 'medias', icon: 'tv-music', c: 'var(--o-purple)' },
  { label: tr('Météo'), vid: 'meteo', icon: 'cloud-sun', c: 'var(--o-cyan)' },
  // Bibliothèque de cartes (31/08/2026) : catalogue sur données fictives —
  // activable dans le menu comme les autres vues secondaires, sinon
  // accessible par la recherche et Paramètres → Vues.
  { label: tr('Bibliothèque'), vid: 'biblio', icon: 'apps-add', c: 'var(--o-accent-soft)' },
];

// Vues retirées de la sidebar mais toujours routables (Pièces/Objets les couvrent) — exposées dans la recherche ⌘K.
// Visibilité des vues de la sidebar, pilotée depuis Paramètres → Vues (design Claude Design 21/08).
// hidden = vids masquées parmi les vues principales ; shown = vids réactivées parmi les vues retirées.
export function readViewsCfg() {
  const rd = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  // `order` : l'ordre choisi des vues intégrées dans le menu (vide = ordre d'origine).
  return { hidden: new Set(rd('loggia-hiddenviews')), shown: new Set(rd('loggia-shownviews')), order: rd('loggia-vueordre') };
}

export function writeViewsCfg(cfg) {
  try {
    localStorage.setItem('loggia-hiddenviews', JSON.stringify([...cfg.hidden]));
    localStorage.setItem('loggia-shownviews', JSON.stringify([...cfg.shown]));
    localStorage.setItem('loggia-vueordre', JSON.stringify(cfg.order || []));
  } catch (e) {}
  try { window.dispatchEvent(new Event('loggia-views-changed')); } catch (e) {}
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
 * Barre du mode edition, commune aux vues.
 *
 * Le pave flottant qui portait « Entites de la vue » faisait doublon des que la
 * vue avait deja une barre, et masquait le bas de l'ecran sur les autres. Une
 * seule barre, en tete du contenu, partout.
 */
export const editBtn = (accent) => ({ padding: '7px 12px', borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0,
  background: accent ? 'var(--o-accent)' : 'var(--o-s1)', color: accent ? '#06121f' : 'var(--o-text1)',
  border: accent ? 'none' : 'var(--o-bw,1px) solid var(--o-bd2)' });

export const ViewEditBar = ({ texte, onEnt, entLabel = 'Entités de la vue', children, style }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: 14, flexWrap: 'wrap', background: 'rgba(var(--o-accent-rgb),.12)', border: '1px dashed rgba(var(--o-accent-rgb),.45)', ...style }}>
    <Fi i="pencil" size={14} color="var(--o-accent-soft)" />
    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', flex: 1, minWidth: 200 }}>{texte}</span>
    {children}
    {onEnt && <button onClick={onEnt} style={editBtn(false)}>{entLabel}</button>}
  </div>
);

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
      <div style={{ fontSize: 11.5, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 }}>{desc}</div>
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
    try { _fondPhoto = window.localStorage.getItem(FOND_PHOTO_CLE) || null; } catch (e) { _fondPhoto = null; }
  }
  return _fondPhoto;
}
try { window.addEventListener('loggia-fond-photo', () => { _fondPhoto = undefined; }); } catch (e) {}

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
        .then(u => { if (mort) { try { u(); } catch (e) {} } else unsub = u; })
        .catch(e => { if (!mort) setApErr(String((e && e.message) || e)); });
    }, 700);
    return () => { mort = true; clearTimeout(t); if (unsub) { try { unsub(); } catch (e) {} } };
  }, [src, conn]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input value={nom} onChange={e => setNom(e.target.value)} placeholder={tr('Titre de la carte (optionnel)')} style={cvInp} />
      <textarea value={src} onChange={e => setSrc(e.target.value)} rows={4} spellCheck={false}
        placeholder={"{{ now().strftime('%H:%M') }}"}
        style={{ ...cvInp, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 13, resize: 'vertical', minHeight: 88 }} />
      {ok && conn && (
        <div style={{ padding: '9px 13px', borderRadius: 10, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)' }}>{tr('APERÇU')}</div>
          {apErr
            ? <div style={{ fontSize: 12, fontWeight: 600, color: '#f87171', marginTop: 3, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 72, overflow: 'auto' }}>{apErr}</div>
            : <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 3, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 72, overflowY: 'auto', opacity: apOut == null ? .45 : 1 }}>{apOut == null ? '…' : (apOut === '' ? '—' : apOut)}</div>}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, fontSize: 11.5, color: 'var(--o-text3)', fontWeight: 600 }}>{tr('Jinja, évalué par Home Assistant. La carte se met à jour en direct.')}</span>
        <button disabled={!ok} onClick={() => { if (!ok) return; onAdd({ t: 'tpl', id: initial ? initial.id : 'tpl_' + Math.random().toString(36).slice(2, 8), name: nom.trim(), src: src.trim() }); if (!initial) { setNom(''); setSrc(''); } }}
          style={{ padding: '10px 18px', borderRadius: 11, background: 'var(--o-accent)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: ok ? 'pointer' : 'default', opacity: ok ? 1 : .5, flexShrink: 0 }}>{initial ? tr('Enregistrer') : tr('Ajouter')}</button>
      </div>
    </div>
  );
}

// Carte générique : affichage + action adaptés au domaine de l'entité.

// Recherche + sélection d'entités (réutilisé par l'éditeur de vue et l'ajout de carte en place).
export const cvInp = { width: '100%', padding: '12px 14px', borderRadius: 12, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 14.5, fontWeight: 600, boxSizing: 'border-box', fontFamily: 'inherit' };

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
  const arm = () => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { PAINT_READY = true; PAINT_WAITERS.splice(0).forEach(f => { try { f(); } catch (e) {} }); }, 600)));
  try { if (document.visibilityState === 'visible') arm(); else document.addEventListener('visibilitychange', function h() { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', h); arm(); } }); } catch (e) { arm(); }
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
export function BottomSheet({ onClose, children }) {
  const [closing, setClosing] = useState(false);
  const close = () => { if (closing) return; setClosing(true); setTimeout(onClose, 420); }; // timeout filet si l'anim ne fire pas
  const sheetRef = useRef(null);
  // Un `click` est emis sur l'ANCETRE COMMUN du mousedown et du mouseup. Une
  // selection de texte commencee dans un champ et relachee dehors le fait donc
  // naitre sur le voile — qui fermait la feuille en pleine saisie. Le
  // stopPropagation de la feuille n'y peut rien : l'evenement n'y passe pas.
  const partiDuVoile = useRef(false);
  // A11y : focus dans la feuille à l'ouverture (Escape marche alors partout), restauré à la fermeture
  useEffect(() => {
    const prev = document.activeElement;
    const t = setTimeout(() => { try { const el = sheetRef.current; if (el) (el.querySelector('button, [tabindex="0"], input, [role="switch"]') || el).focus({ preventScroll: true }); } catch (e) {} }, 60);
    return () => { clearTimeout(t); try { if (prev && prev.focus) prev.focus({ preventScroll: true }); } catch (e) {} };
  }, []);
  // Glisser-fermer iOS : la feuille suit le doigt depuis la poignée ; > 120 px = fermeture, sinon rebond spring.
  const dragClose = (e) => {
    const el = sheetRef.current; if (!el || closing) return;
    e.preventDefault();
    const y0 = e.clientY; let dy = 0;
    const h = e.currentTarget;
    el.style.animation = 'none'; el.style.transition = 'none';
    try { h.setPointerCapture(e.pointerId); } catch (x) {}
    h.onpointermove = (ev) => { dy = Math.max(0, ev.clientY - y0); el.style.transform = `translate(-50%, ${dy}px)`; };
    const up = () => {
      h.onpointermove = null; h.onpointerup = null; h.onpointercancel = null;
      if (dy > 120) { el.style.transition = 'transform .26s cubic-bezier(.32,.72,.25,1)'; el.style.transform = 'translate(-50%, 108%)'; setTimeout(onClose, 250); }
      else { el.style.transition = REDUCE_MOTION ? 'none' : 'transform .45s cubic-bezier(.22,1.28,.36,1)'; el.style.transform = 'translate(-50%, 0)'; }
    };
    h.onpointerup = up; h.onpointercancel = up;
  };
  return (
    <div onPointerDown={(e) => { partiDuVoile.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && partiDuVoile.current) close(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.32)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', animation: closing ? 'o-fadeOut .3s ease forwards' : 'o-fadeIn .25s ease' }}>
      <div ref={sheetRef} role="dialog" aria-modal="true" tabIndex={-1} onClick={e => e.stopPropagation()}
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
        onAnimationEnd={(e) => { if (closing && e.target === e.currentTarget) onClose(); }}
        style={{ position: 'fixed', left: '50%', bottom: 0, transform: 'translate(-50%,0)', width: 'min(480px,100%)', maxHeight: '88vh', overflowY: 'auto', background: 'var(--o-surfA)', borderTop: 'var(--o-bw,1px) solid var(--o-bd1)', borderLeft: 'var(--o-bw,1px) solid var(--o-bd1)', borderRight: 'var(--o-bw,1px) solid var(--o-bd1)', borderRadius: '26px 26px 0 0', padding: '10px 22px calc(24px + var(--o-safe-bottom,0px))', boxShadow: '0 -10px 50px rgba(0,0,0,.35)', animation: closing ? 'o-sheetOut .3s cubic-bezier(.32,.72,.25,1) forwards' : 'o-sheetIn .46s cubic-bezier(.22,1.28,.36,1)' }}>
        <div onPointerDown={dragClose} style={{ touchAction: 'none', cursor: 'grab', padding: '8px 60px 12px', margin: '-10px auto 2px', width: 'fit-content' }}>
          <div style={{ width: 38, height: 5, borderRadius: 3, background: 'var(--o-bd1)', margin: '0 auto' }} />
        </div>
        {typeof children === 'function' ? children(close) : children}
      </div>
    </div>
  );
}


export const CV_DOM_ICON = { light: 'bulb', switch: 'bolt', input_boolean: 'bolt', fan: 'wind', sensor: 'chart-line-up', binary_sensor: 'radar', climate: 'thermometer-half', cover: 'blinds', media_player: 'tv-music', scene: 'sparkles', script: 'play', button: 'power', input_button: 'power', lock: 'shield-check', person: 'users', weather: 'cloud-sun', vacuum: 'broom', camera: 'video-camera', automation: 'bolt' };

export const cvDomain = (id) => id.slice(0, id.indexOf('.'));

export function EntPicker({ hass, exclude = [], onPick, autoFocus = false }) {
  const [q, setQ] = useState('');
  const all = useMemo(() => {
    if (!hass || !hass.states) return [];
    return Object.keys(hass.states).map(id => ({ id, name: cvName(hass.states[id], id), dom: cvDomain(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [hass]);
  const ql = q.trim().toLowerCase();
  const results = ql ? all.filter(e => (e.id.toLowerCase().indexOf(ql) >= 0 || e.name.toLowerCase().indexOf(ql) >= 0) && exclude.indexOf(e.id) < 0).slice(0, 30) : [];
  return (
    <>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={tr('Rechercher une entité (nom ou id)…')} spellCheck={false} autoFocus={autoFocus} style={cvInp} />
      {results.length > 0 && (
        <div style={{ maxHeight: 240, overflowY: 'auto', marginTop: 8, border: 'var(--o-bw,1px) solid var(--o-bd3)', borderRadius: 12 }}>
          {results.map(e => (
            <div key={e.id} onClick={() => onPick(e.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', cursor: 'pointer', borderBottom: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text2)' }}><Fi i={CV_DOM_ICON[e.dom] || 'bolt'} size={13} /></span>
              <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span><span style={{ display: 'block', fontSize: 10.5, color: 'var(--o-text3)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.id}</span></span>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--o-accent-soft)' }}>+</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
