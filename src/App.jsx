import { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext, cloneElement, lazy, Suspense } from 'react';
// Les deux fonds animes tirent three.js : 448 Ko a analyser, pour un decor. En
// import direct, ce cout etait paye a CHAQUE ouverture, meme par quelqu'un qui
// a coupe les effets. En differe, il n'est paye que si le fond s'affiche.
// La table des conditions, elle, est de la donnee pure et reste immediate.
import { WX_PRESETS } from './wxpresets.js';
const WeatherGL = lazy(() => import('./wx3d.jsx'));
// Vue chargee a la demande : personne n'atterrit sur Meteo en ouvrant le
// dashboard, son code n'a donc pas a etre analyse au demarrage.
const MeteoContent = lazy(() => import('./views/meteo.jsx'));
// Parametres : 1300 lignes ou l'on n'arrive que volontairement. Le formulaire
// d'entites vient du meme morceau — il ne s'ouvre qu'en mode edition.
const ParametresContent = lazy(() => import('./views/parametres.jsx').then(m => ({ default: m.ParametresContent })));
const ViewEntSheet = lazy(() => import('./views/parametres.jsx').then(m => ({ default: m.ViewEntSheet })));
import { useDiscovery, report as discoveryReport, DISCOVERY_VERSION, buildIndex as discoveryBuildIndex, capabilities as discoveryCapabilities, pickSibling } from './discovery.js';
import { planAction as actionsPlan, availableActions as actionsAvailable,
  planAction, runPlan } from './actions.js';
import { entityCaps } from './capabilities.js';
import { mergedProfile as profileOf, profiles as profileTable } from './profiles.js';
import { deviceCard, presentableDevices, presentationSummary } from './present.js';
import { healthReport, healthText } from './health.js';
import { probe as configProbe, reportLive as configReportLive, migrateFromLocalStorage, completerDepuisLocal, collectLocal, createConfig, CONFIG_VERSION } from './config.js';
import { resolveAll, report as resolveReport } from './resolve.js';
import { LoggiaContext, buildRuntime, useLoggia, useEntities } from './runtime.js';
import { isViewAvailable, viewReason } from './views.js';
import { REDUCE_MOTION, Fi, Anim, useTilt, editBtn, ViewEditBar,
  HIDDEN_VIEWS, readViewsCfg, writeViewsCfg, cl_hexRgb, HX_TOKENS, userBg, userImg, personPicture,
  EnRow, EnVal, EnGauge, LOOK_DEF, CV_ICONS, cvInp, cvName, cvEstTpl, cvKey, cvId, TplForm, lireFondPhoto, USER_COLORS,
  FlipText, Gauge, BottomSheet, onPaintReady, PAINT_READY,
  EntPicker, CV_DOM_ICON, cvDomain } from './ui.jsx';
import { WX_ICON, WX_ICOLOR, WeatherIco, haWeatherMode, haWeatherLabel, weatherEntity } from './wxutil.jsx';
// Carte du robot rendue cliquable : chargee a la demande, elle n'interesse
// que la vue Aspirateur et embarque son analyse d'image.
const VacPlan = lazy(() => import('./vacplan.jsx'));
import { LOGGIA_INDEX, LOGGIA_ENT, LOGGIA_RESOLVED, LOGGIA_CFG, setLoggiaState, readLS, cfgVal, cfgSet, getHass, loggiaEnt, estPersonnelle, feederScript, ENT_ALIAS,
  enHaids, medCompanion, medPlayers, normRooms, secAlarm, switchLightsCfg,
  exportLoggiaConfig, importLoggiaConfig, LOGGIA_SYNC_KEYS,
  discoveredRooms, medResolved, MED_COLORS, vacRooms, vacSensors, vacOption } from './state.js';
// L'accueil de premiere installation ne sert qu'une fois : son code n'a pas a
// peser dans le bundle de chaque ouverture.
const Onboarding = lazy(() => import('./Onboarding.jsx'));
import { VACUUM_STATE_FR, fmtDuration, fmtArea } from './resolve.js';
import energyHomeImg from './assets/energy/home.webp';
import energySolarImg from './assets/energy/solar.webp';
import energyEvImg from './assets/energy/ev-car-home.webp';
import energyBatImg from './assets/energy/battery.webp';
import { tr, trHA, preparerLangue, locale } from './i18n.js';

// Contexte barre du haut : expose les actions globales (sidebar, thème, édition, nav) au Header partagé.
const HeaderCtx = createContext(null);

/* ════════════ Reproduction fidèle de "Loggia Complet.dc.html" (Claude Design) ════════════
   Tokens --o-* dans index.css (dark = :root, light = html.loggia-light). Données démo (phase 1). */

// pseudo-random déterministe (= design : Math.sin) pour particules météo stables
const field = (n, mk) => Array.from({ length: n }, (_, i) => {
  const r = k => { const x = Math.sin((i + 1) * (k * 12.9 + 7.3)) * 43758.5; return x - Math.floor(x); };
  return mk(i, r);
});

// ── Canvas flux énergétique (hexagones qui dérivent solaire→maison→réseau) ──
function FluxCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    let raf, stopped = false, ctx, W, H, parts;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const spawn = (x) => {
      const h = H || 88, r = Math.random();
      const size = r < 0.7 ? 2.4 + Math.random() * 2 : r < 0.92 ? 4.4 + Math.random() * 2 : 6.4 + Math.random() * 2.6;
      return { x, y: h / 2 + (Math.random() - 0.5) * h * 0.34, size, speed: (0.45 + Math.random() * 1.05) * (size / 5 + 0.6), op: 0.22 + Math.random() * 0.55, jig: (Math.random() - 0.5) * 0.45 };
    };
    const color = (t) => (t < 0.36 ? '255,209,102' : t < 0.6 ? '110,168,255' : '52,211,153');
    const hex = (x, y, rr, fill) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); const px = x + rr * Math.cos(a), py = y + rr * Math.sin(a); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
    const init = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth || 760, h = c.clientHeight || 88;
      c.width = w * dpr; c.height = h * dpr;
      ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
      W = w; H = h;
      const N = Math.max(60, Math.round(w / 8));
      parts = Array.from({ length: N }, () => spawn(Math.random() * w));
    };
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        const col = color(p.x / W);
        hex(p.x, p.y, p.size, 'rgba(' + col + ',' + p.op + ')');
        hex(p.x, p.y, p.size * 0.5, 'rgba(255,255,255,' + (p.op * 0.35) + ')');
      }
    };
    const loop = () => {
      if (stopped) return;
      raf = requestAnimationFrame(loop);
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.x += p.speed; p.y += p.jig;
        if (p.y < H * 0.34 || p.y > H * 0.66) p.jig *= -1;
        if (p.x > W + 12) Object.assign(p, spawn(-12));
        const col = color(p.x / W);
        hex(p.x, p.y, p.size, 'rgba(' + col + ',' + p.op + ')');
        hex(p.x, p.y, p.size * 0.5, 'rgba(255,255,255,' + (p.op * 0.35) + ')');
      }
    };
    init();
    if (reduce) draw(); else loop();
    const onResize = () => { cancelAnimationFrame(raf); init(); if (reduce) draw(); else loop(); };
    window.addEventListener('resize', onResize);
    // Pause hors viewport : la boucle rAF (~190 hexagones/frame) ne tourne que si le canvas est visible.
    let visible = true;
    const io = ('IntersectionObserver' in window) ? new IntersectionObserver(entries => {
      const v = !!(entries[0] && entries[0].isIntersecting);
      if (v === visible) return;
      visible = v;
      cancelAnimationFrame(raf);
      if (v && !reduce && !stopped) loop();
    }, { threshold: 0.01 }) : null;
    if (io) io.observe(c);
    return () => { stopped = true; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); if (io) io.disconnect(); };
  }, []);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', WebkitMaskImage: 'radial-gradient(120% 78% at 50% 50%,#000 52%,transparent 100%),linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)', WebkitMaskComposite: 'source-in', maskImage: 'radial-gradient(120% 78% at 50% 50%,#000 52%,transparent 100%),linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)', maskComposite: 'intersect' }} />;
}

// ── Effet météo du bandeau (suit `weather`) ──
function WeatherFx({ weather }) {
  // fondu croisé (opacity) au lieu d'un switch sec ; les couches inactives restent en DOM mais invisibles/inertes
  const show = on => ({ position: 'absolute', inset: 0, opacity: on ? 1 : 0, transition: REDUCE_MOTION ? 'none' : 'opacity 1.1s ease', pointerEvents: 'none', visibility: on ? 'visible' : 'hidden', transitionProperty: 'opacity, visibility', transitionDelay: on ? '0s' : '0s, 1.1s' });
  const sunOn = weather === 'sun' || weather === 'partly';
  const rain = field(22, (i, r) => <span key={i} style={{ position: 'absolute', top: '-14px', left: (r(1) * 100).toFixed(1) + '%', width: 2, height: (9 + r(2) * 8), borderRadius: 2, background: 'linear-gradient(transparent,rgba(196,216,255,.7))', animation: `brain ${(0.5 + r(3) * 0.4).toFixed(2)}s linear ${(-r(4) * 1.3).toFixed(2)}s infinite` }} />);
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

// Adresse du serveur telle que le navigateur la voit : rien a configurer, et
// rien qui vienne de l'installation de quelqu'un d'autre.
function haHost() {
  try { return ((window.top || window).location || {}).host || 'Home Assistant'; } catch (e) { return 'Home Assistant'; }
}
const ic = (fill, inner) => <svg width="18" height="18" viewBox="0 0 24 24" fill={fill}>{inner}</svg>;

const NAV = [
  { group: 'MAISON', items: [
    { label: 'Accueil', active: true, svg: <Fi i="home" color="var(--o-accent)" /> },
    { label: 'Pièces', svg: <Fi i="door-open" color="#ff8a4c" /> },
    { label: 'Scènes', svg: <Fi i="sparkles" color="var(--o-purple)" /> },
    { label: 'Objets', svg: <Fi i="apps" color="var(--o-cyan)" /> },
    { label: 'Énergie', svg: <Fi i="bolt" color="var(--o-ok)" /> },
    { label: 'Sécurité', svg: <Fi i="shield-check" color="var(--o-ok)" /> },
  ] },
  { group: 'SYSTÈME', reglages: true, items: [
    { label: 'Système', svg: <Fi i="microchip" color="var(--o-text2)" /> },
    { label: 'Paramètres', svg: <Fi i="settings-sliders" color="var(--o-text2)" /> },
  ] },
];
/* Le groupe des reglages se reconnait a un DRAPEAU, pas a son titre.
 *
 * Il etait repere par `g.group === NAV_REGLAGES`, une comparaison de texte. Des
 * que le titre est passe par la traduction, elle a echoue : en anglais, le
 * groupe Systeme remontait au-dessus des vues secondaires au lieu de rester en
 * bas — l'ordre du menu changeait avec la langue. Un drapeau ne se traduit pas. */

const LABEL_VIEW = { 'Accueil': 'accueil', 'Pièces': 'pieces', 'Lumières': 'lumieres', 'Scènes': 'scenes', 'Climat': 'climat', 'Volets': 'volets', 'Énergie': 'energie', 'Aspirateur': 'aspirateur', 'Croquettes': 'croquettes', 'Médias': 'medias', 'Objets': 'objets', 'Sécurité': 'securite', 'Caméras': 'cameras', 'Système': 'systeme', 'Paramètres': 'parametres' };
const BUILT = new Set(['accueil', 'pieces', 'lumieres', 'scenes', 'climat', 'volets', 'energie', 'aspirateur', 'croquettes', 'medias', 'meteo', 'objets', 'securite', 'systeme', 'parametres']);

function Sidebar({ view, onNav, open = true, customViews = [], ha = null, vuesAutorisees = null }) {
  // Permissions par profil : `null` = tout (admins et profils sans restriction).
  const permis = (vid) => !vuesAutorisees || vid === 'accueil' || vid === 'parametres' || vuesAutorisees.has(vid);
  // Une vue que l'installation ne peut pas remplir ne figure pas dans le menu.
  const { views: avail } = useLoggia();
  const [viewsCfg, setViewsCfg] = useState(readViewsCfg);
  // Vues remises au menu depuis Parametres : ce ne sont pas des vues
  // principales, elles ont donc leur propre section plutot que d'etre
  // melangees a MAISON, ou rien ne les distinguait.
  const secondaires = HIDDEN_VIEWS().filter(h => permis(h.vid) && viewsCfg.shown.has(h.vid) && isViewAvailable(avail, h.vid));
  useEffect(() => { const f = () => setViewsCfg(readViewsCfg()); window.addEventListener('loggia-views-changed', f); return () => window.removeEventListener('loggia-views-changed', f); }, []);
  // Pill de sélection unique qui GLISSE vers l'item actif (au lieu de réapparaître)
  const navRef = useRef(null);
  const [pill, setPill] = useState(null);
  useEffect(() => {
    const root = navRef.current; if (!root) return;
    const el = root.querySelector('.o-nav-item[data-active="1"]');
    if (!el) { setPill(null); return; }
    const r = el.getBoundingClientRect(), R = root.getBoundingClientRect();
    setPill({ top: r.top - R.top + root.scrollTop, h: r.height });
  }, [view, open, customViews.length]);
  // Un groupe de la nav. Rendu deux fois, a deux endroits differents de la
  // liste : les vues d'abord, les reglages tout en bas.
  // L'ordre choisi dans Paramètres → Vues (les vues absentes de la liste
  // gardent leur place d'origine — le tri est stable).
  const iOrdre = (vid) => { const i = (viewsCfg.order || []).indexOf(vid); return i < 0 ? 999 : i; };
  const groupeNav = (g) => (
    <div key={g.group}>
      <div className="o-side-text" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: 'var(--o-text3)', padding: g.group === 'MAISON' ? '8px 8px 5px' : '12px 8px 5px' }}>{tr(g.group)}</div>
      {g.items.filter(it => permis(LABEL_VIEW[it.label]) && !viewsCfg.hidden.has(LABEL_VIEW[it.label]) && isViewAvailable(avail, LABEL_VIEW[it.label]))
        .sort(g.reglages ? () => 0 : (a, b) => iOrdre(LABEL_VIEW[a.label]) - iOrdre(LABEL_VIEW[b.label]))
        .map(it => {
        const vid = LABEL_VIEW[it.label];
        const active = vid === view || (vid === 'pieces' && view.indexOf('room:') === 0);
        const built = BUILT.has(vid);
        return (
          <div key={it.label} className="o-nav-item" aria-label={tr(it.label)} data-active={active ? '1' : undefined} role="button" tabIndex={built ? 0 : -1} onClick={built ? () => onNav(vid) : undefined} onKeyDown={built ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNav(vid); } } : undefined} style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '9px 8px 9px 13px', borderRadius: 10, fontSize: 13.5, cursor: built ? 'pointer' : 'default', transition: 'color .25s, font-weight .25s', ...(active ? { fontWeight: 700 } : { color: 'var(--o-text1)', fontWeight: 600 }) }}>
            {it.svg}<span className="o-side-text">{tr(it.label)}</span>
          </div>
        );
      })}
    </div>
  );
  return (
    <aside ref={navRef} className={'loggia-aside ' + (open ? 'is-open' : 'is-closed')} style={{ width: 264, flexShrink: 0, position: 'sticky', top: 0, alignSelf: 'flex-start', height: '100vh', overflowY: 'auto', background: 'linear-gradient(180deg,var(--o-side1),var(--o-side2))', borderRight: 'var(--o-bw,1px) solid var(--o-bd3)', padding: 'calc(18px + var(--o-safe-top,0px)) 12px 18px', display: 'flex', flexDirection: 'column' }}>
      {pill && <div aria-hidden="true" className="o-navpill" style={{ position: 'absolute', left: 12, right: 12, top: 0, height: pill.h, transform: `translateY(${pill.top}px)`, borderRadius: 10, background: 'rgba(var(--o-accent-rgb),.14)', pointerEvents: 'none', zIndex: 0 }}><span style={{ position: 'absolute', left: 0, top: 9, bottom: 9, width: 3, borderRadius: 3, background: 'var(--o-accent)' }} /></div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 8px 14px' }}>
        {/* Le logo du projet. C'etait un « O » sur un degrade — le O d'Orion,
            reste apres le renommage. Servi depuis le meme dossier que le reste
            du frontend, donc sans requete vers l'exterieur. */}
        <img src="./logo.png" alt="" width={38} height={38} style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'block' }} />
        <div className="o-side-text" style={{ lineHeight: 1.15 }}><div style={{ fontSize: 15, fontWeight: 800 }}>Loggia</div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: ha && !ha.online ? 'var(--o-bad)' : 'var(--o-ok)' }}>{ha ? (ha.online ? ha.devCount + ' ' + tr('APPAREILS EN LIGNE') : tr('HORS LIGNE')) : tr('CONNEXION…')}</div></div>
      </div>
      {/* Les vues passent avant les reglages : « Système » et « Paramètres »
          ferment la liste, comme tout ce qui ne sert pas au quotidien. */}
      {NAV.filter(g => !g.reglages).map(groupeNav)}
      {secondaires.length > 0 && (
        <div>
          <div className="o-side-text" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: 'var(--o-text3)', padding: '12px 8px 5px' }}>{tr('VUES SECONDAIRES')}</div>
          {secondaires.map(h => {
            const active = h.vid === view;
            return (
              <div key={h.vid} className="o-nav-item" aria-label={tr(h.label)} data-active={active ? '1' : undefined} role="button" tabIndex={0} onClick={() => onNav(h.vid)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNav(h.vid); } }} style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '9px 8px 9px 13px', borderRadius: 10, fontSize: 13.5, cursor: 'pointer', transition: 'color .25s, font-weight .25s', ...(active ? { fontWeight: 700 } : { color: 'var(--o-text1)', fontWeight: 600 }) }}>
                <Fi i={h.icon} color={h.c} /><span className="o-side-text">{h.label}</span>
              </div>
            );
          })}
        </div>
      )}
      {customViews.filter(cv => permis('cv:' + cv.id)).length > 0 && (
        <div>
          <div className="o-side-text" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: 'var(--o-text3)', padding: '12px 8px 5px' }}>MES VUES</div>
          {customViews.filter(cv => permis('cv:' + cv.id)).map(cv => {
            const vid = 'cv:' + cv.id;
            const active = vid === view;
            return (
              <div key={cv.id} className="o-nav-item" aria-label={cv.name} data-active={active ? '1' : undefined} role="button" tabIndex={0} onClick={() => onNav(vid)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNav(vid); } }} style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '9px 8px 9px 13px', borderRadius: 10, fontSize: 13.5, cursor: 'pointer', transition: 'color .25s', ...(active ? { fontWeight: 700 } : { color: 'var(--o-text1)', fontWeight: 600 }) }}>
                <Fi i={cv.icon || 'sparkles'} color="var(--o-accent-soft)" /><span className="o-side-text">{cv.name}</span>
              </div>
            );
          })}
        </div>
      )}
      {NAV.filter(g => g.reglages).map(groupeNav)}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', paddingTop: 14, borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 11, background: `rgba(${ha ? ha.alarmRgb : '140,152,180'},.1)`, border: `1px solid rgba(${ha ? ha.alarmRgb : '140,152,180'},.22)` }}><svg width="16" height="16" viewBox="0 0 24 24" fill={`rgb(${ha ? ha.alarmRgb : '140,152,180'})`}><path d="M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5z" /></svg><span className="o-side-text" style={{ fontSize: 12.5, fontWeight: 700, color: `rgb(${ha ? ha.alarmRgb : '140,152,180'})` }}><FlipText text={ha ? ha.alarmTxt : 'Alarme · …'} /></span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 4px 0' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: ha && !ha.online ? 'var(--o-bad)' : 'var(--o-ok)', boxShadow: ha && !ha.online ? '0 0 7px var(--o-bad)' : '0 0 7px var(--o-ok)', animation: ha && !ha.online ? 'pulse 1.2s infinite' : 'none' }} /><div className="o-side-text" style={{ lineHeight: 1.2 }}><div style={{ fontSize: 12, fontWeight: 700, color: ha && !ha.online ? 'var(--o-bad)' : undefined }}>{ha && !ha.online ? tr('Home Assistant · Hors ligne') : tr('Home Assistant · En ligne')}</div><div style={{ fontSize: 10, color: 'var(--o-text3)', fontWeight: 600 }}>{haHost()}</div></div></div>
      </div>
    </aside>
  );
}

/* ── Recherche globale (⌘K / Ctrl+K / clic barre) : pièces, vues (natives + custom), scènes rapides ── */
const srNorm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); // insensible accents/casse
const IS_MAC = (() => { try { return srNorm(navigator.platform || '').indexOf('mac') >= 0 || /iphone|ipad/.test(srNorm(navigator.platform || '')); } catch (e) { return false; } })();
// Nombre qui « roule » vers sa valeur (rAF, easeOutCubic). Re-anime à chaque changement de cible.
// <Num v={23.4} d={1} suffix="°" /> : chiffre animé, tabular-nums pour éviter le tremblement de largeur.
function Num({ v, d = 0, prefix = '', suffix = '', fallback = '—', fmt }) {
  // Valeur affichee telle quelle. Les chiffres roulaient de zero vers leur
  // valeur a l'ouverture : joli une fois, penible a chaque chargement, et
  // trompeur quand l'animation ne demarrait pas — la page restait alors sur des
  // zeros qui passaient pour des mesures.
  const a = (typeof v === 'number' && isFinite(v)) ? v : null;
  if (a == null) return <>{fallback}</>;
  const txt = fmt ? fmt(a) : (d > 0 ? a.toFixed(d).replace('.', ',') : String(Math.round(a)));
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{prefix}{txt}{suffix}</span>;
}
const FINE_POINTER = (() => { try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (e) { return false; } })();
function kbSlider(label, value, commit, { min = 0, max = 100, step = 5, unit = '%' } = {}) {
  return {
    role: 'slider', tabIndex: 0, 'aria-label': label,
    'aria-valuemin': min, 'aria-valuemax': max,
    'aria-valuenow': value == null ? undefined : Math.round(value * 10) / 10,
    'aria-valuetext': value == null ? undefined : (Math.round(value * 10) / 10) + (unit ? ' ' + unit : ''),
    onKeyDown: (e) => {
      let d;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') d = step;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') d = -step;
      else if (e.key === 'PageUp') d = step * 2;
      else if (e.key === 'PageDown') d = -step * 2;
      else if (e.key === 'Home') { e.preventDefault(); e.stopPropagation(); commit(min); return; }
      else if (e.key === 'End') { e.preventDefault(); e.stopPropagation(); commit(max); return; }
      else return;
      e.preventDefault(); e.stopPropagation();
      const cur = value == null ? min : value;
      commit(Math.max(min, Math.min(max, Math.round((cur + d) / step) * step)));
    },
  };
}
// ── Animations lot 6 ──
// fxTap(e) : ripple au point de clic + pop bref sur le bouton courant (feedback scènes)
function fxTap(e) {
  if (REDUCE_MOTION) return;
  const el = e.currentTarget; if (!el) return;
  try {
    const r = el.getBoundingClientRect();
    const rip = document.createElement('span');
    rip.className = 'o-ripple';
    const sz = Math.max(r.width, r.height) * 1.7;
    rip.style.cssText = `width:${sz}px;height:${sz}px;left:${(e.clientX || r.left + r.width / 2) - r.left - sz / 2}px;top:${(e.clientY || r.top + r.height / 2) - r.top - sz / 2}px`;
    el.appendChild(rip); setTimeout(() => { try { el.removeChild(rip); } catch (x) {} }, 650);
    el.classList.remove('o-scenefx'); void el.offsetWidth; el.classList.add('o-scenefx');
  } catch (x) {}
}
// ── Animations lot 5 ──
// <Skel w h r> : placeholder shimmer tant que la donnée n'est pas là (remplace les valeurs démo au boot)
function Skel({ w = 60, h = 14, r = 6, style }) {
  return <span className="o-skel" aria-hidden="true" style={{ display: 'inline-block', width: w, height: h, borderRadius: r, verticalAlign: 'middle', ...style }} />;
}
// Arc SVG qui se dessine à l'arrivée : dashoffset part de la circonférence puis file vers la cible
function useDrawArc(target, circ) {
  const [off, setOff] = useState(REDUCE_MOTION ? target : circ);
  useEffect(() => { let alive = true, id = 0; onPaintReady(() => { if (alive) id = requestAnimationFrame(() => setOff(target)); }); return () => { alive = false; cancelAnimationFrame(id); }; }, [target, circ]);
  return off;
}
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
// <ActionBtn onClick style>label</ActionBtn> : ripple au clic + « ✓ » 900 ms qui remplace le label (commande envoyée)
function ActionBtn({ onClick, style, children, doneLabel = '✓ Envoyé' }) {
  const [done, setDone] = useState(false);
  const ref = useRef(null), tRef = useRef(0);
  useEffect(() => () => clearTimeout(tRef.current), []);
  const handle = (e) => {
    e.stopPropagation();
    const el = ref.current;
    if (el && !REDUCE_MOTION) {
      const r = el.getBoundingClientRect();
      const rip = document.createElement('span');
      rip.className = 'o-ripple';
      const sz = Math.max(r.width, r.height) * 1.6;
      rip.style.cssText = `width:${sz}px;height:${sz}px;left:${(e.clientX || r.left + r.width / 2) - r.left - sz / 2}px;top:${(e.clientY || r.top + r.height / 2) - r.top - sz / 2}px`;
      el.appendChild(rip); setTimeout(() => { try { el.removeChild(rip); } catch (x) {} }, 650);
    }
    if (onClick) onClick(e);
    setDone(true); clearTimeout(tRef.current); tRef.current = setTimeout(() => setDone(false), 900);
  };
  return (
    <button ref={ref} onClick={handle} className="o-actbtn" style={{ position: 'relative', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', ...style }}>
      <span style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom', transition: 'opacity .18s, transform .18s', opacity: done ? 0 : 1, transform: done ? 'translateY(-6px)' : 'none' }}>{children}</span>
      {done && <span className="o-actbtn-done" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--o-ok)', fontWeight: 800 }}>{doneLabel}</span>}
    </button>
  );
}
// <Shiny on>texte</Shiny> : sweep lumineux discret (background-clip:text) sur un badge ACTIF uniquement.
function Shiny({ on = true, children, style }) {
  if (!on || REDUCE_MOTION) return <span style={style}>{children}</span>;
  return <span className="o-shiny" style={style}>{children}</span>;
}
// Cascade retiree le 21/08 (demande user) : plus aucun delai d'entree. Conserve pour les ~200 appels existants.
const stag = () => undefined;
// relance les animations CSS en pause une fois le 1er paint atteint (cartes montées avant l'affichage de l'iframe)
onPaintReady(() => { try { document.querySelectorAll('.o-stag, .o-draw, .o-fadein').forEach(el => { el.style.animationPlayState = 'running'; }); } catch (e) {} });

function useWide(bp) {
  const [w, setW] = useState(() => { try { return window.matchMedia('(min-width:' + bp + 'px)').matches; } catch (e) { return false; } });
  useEffect(() => {
    let mq; try { mq = window.matchMedia('(min-width:' + bp + 'px)'); } catch (e) { return; }
    const on = () => setW(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on); };
  }, [bp]);
  return w;
}
function SearchSheet({ onClose, onNav, customViews = [], rooms = [], isAdmin = false }) {
  const { views: avail } = useLoggia();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef(null);
  const nq = srNorm(q.trim());
  const match = (label) => !nq || srNorm(label).indexOf(nq) >= 0;
  const results = [];
  rooms.forEach(r => { if (!match(r)) return; const p = PIECES.find(x => x.name === r); results.push({ group: tr('Pièces'), label: r, icon: p ? p.icon : <Fi i="home" color="var(--o-accent)" size={20} />, act: (close) => { onNav('room:' + r); close(); } }); });
  NAV.forEach(g => g.items.forEach(it => { const vid = LABEL_VIEW[it.label]; if (BUILT.has(vid) && isViewAvailable(avail, vid) && match(it.label)) results.push({ group: tr('Vues'), label: tr(it.label), icon: it.svg, act: (close) => { onNav(vid); close(); } }); }));
  HIDDEN_VIEWS().forEach(h => { if (isViewAvailable(avail, h.vid) && match(h.label)) results.push({ group: tr('Vues'), label: tr(h.label), icon: <Fi i={h.icon} color={h.c} />, act: (close) => { onNav(h.vid); close(); } }); });
  customViews.forEach(cv => { if (match(cv.name)) results.push({ group: tr('Vues'), label: cv.name, icon: <Fi i={cv.icon || 'sparkles'} color="var(--o-accent-soft)" />, act: (close) => { onNav('cv:' + cv.id); close(); } }); });
  quickScenes().forEach(s => { if (!match(s.name)) return; results.push({ group: tr('Scènes'), label: s.name, sub: s.sub, icon: <Fi i={s.icon} color="var(--o-purple)" />, run: true, act: (close) => { try { const h = getHass(); if (h && h.callService) h.callService(s.haid.indexOf('scene.') === 0 ? 'scene' : 'script', 'turn_on', { entity_id: s.haid }); } catch (e) {} close(); } }); });
  // Appareils : par nom, dès deux caractères tapés — le déluge n'aide personne.
  // Les togglables se basculent sur place ; les autres mènent à leur vue.
  if (nq.length >= 2) {
    const h = getHass();
    const S = (h && h.states) || {};
    const DOMS = { light: 'bulb', switch: 'bolt', climate: 'thermometer-half', cover: 'blinds', media_player: 'tv-music', vacuum: 'broom', fan: 'wind' };
    const VUE_DOM = { climate: 'climat', cover: 'volets', media_player: 'medias', vacuum: 'aspirateur' };
    let n = 0;
    for (const id in S) {
      if (n >= 8) break;
      const dom = id.split('.')[0];
      if (!DOMS[dom]) continue;
      const st = S[id];
      if (!st || st.state === 'unavailable') continue;
      const nom = (st.attributes && st.attributes.friendly_name) || id;
      if (!match(nom)) continue;
      n++;
      const togglable = dom === 'light' || dom === 'switch' || dom === 'fan';
      results.push({
        group: tr('Appareils'), label: nom, sub: id, run: togglable, runLabel: tr('Basculer'),
        icon: <Fi i={DOMS[dom]} color="var(--o-cyan)" />,
        act: (close) => {
          if (togglable) { try { h.callService('homeassistant', 'toggle', { entity_id: id }); } catch (e) {} }
          else if (VUE_DOM[dom]) onNav(VUE_DOM[dom]);
          close();
        },
      });
    }
  }
  // Réglages : chaque section des Paramètres se trouve par son nom — la
  // mémoire de session `loggia-par-section` fait atterrir au bon endroit.
  if (isAdmin) {
    [['users', tr('Utilisateurs')], ['apparence', tr('Apparence')], ['entites', tr('Entités')], ['vues', tr('Vues')], ['auto', tr('Automatisations')], ['alertes', tr('Alertes')], ['maj', tr('Mises à jour')], ['connexion', tr('Connexion HA')], ['about', tr('À propos')]].forEach(([id, label]) => {
      if (!match(label)) return;
      results.push({ group: tr('Réglages'), label, icon: <Fi i="settings" color="var(--o-text2)" />, act: (close) => { try { sessionStorage.setItem('loggia-par-section', id); } catch (e) {} onNav('parametres'); close(); } });
    });
  }
  const selIdx = results.length ? Math.min(sel, results.length - 1) : -1;
  useEffect(() => { setSel(0); }, [nq]);
  useEffect(() => { try { const el = listRef.current && listRef.current.querySelector('[data-sel="1"]'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); } catch (e) {} }, [selIdx]);
  let lastGroup = null;
  return (
    <BottomSheet onClose={onClose}>
      {(close) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 12, padding: '11px 14px', marginBottom: 12 }}>
            <Ico name="search" size={16} color="var(--o-text2)" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Pièce, vue, scène…')} aria-label="Rechercher"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSel(i => Math.min(i + 1, results.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(i => Math.max(i - 1, 0)); }
                else if (e.key === 'Enter') { e.preventDefault(); if (selIdx >= 0) results[selIdx].act(close); }
                else if (e.key === 'Escape') { e.preventDefault(); close(); }
              }}
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: 'var(--o-text)', fontSize: 15, fontWeight: 500, fontFamily: 'var(--o-font)' }} />
            {q && <span role="button" tabIndex={0} aria-label="Effacer" onClick={() => setQ('')} onKeyDown={(e) => { if (e.key === 'Enter') setQ(''); }} style={{ cursor: 'pointer', display: 'inline-flex', padding: 12, margin: -12 }}><Fi i="cross-circle" size={16} color="var(--o-text3)" /></span>}
          </div>
          <div ref={listRef} style={{ maxHeight: '52vh', overflowY: 'auto', margin: '0 -8px', padding: '0 8px' }}>
            {!results.length && <div style={{ padding: '26px 8px', textAlign: 'center', fontSize: 13.5, fontWeight: 600, color: 'var(--o-text3)' }}>Aucun résultat pour « {q} »</div>}
            {results.map((r, i) => {
              const head = r.group !== lastGroup; lastGroup = r.group;
              return (
                <div key={r.group + ':' + r.label}>
                  {head && <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em', color: 'var(--o-text3)', textTransform: 'uppercase', padding: '10px 8px 5px' }}>{r.group}</div>}
                  <div data-sel={i === selIdx ? '1' : undefined} role="button" tabIndex={0}
                    onClick={() => r.act(close)} onMouseEnter={() => setSel(i)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); r.act(close); } }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', borderRadius: 12, cursor: 'pointer', background: i === selIdx ? 'rgba(var(--o-accent-rgb),.14)' : 'transparent' }}>
                    <span style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--o-s1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{r.icon}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</div>
                      {r.sub && <div style={{ fontSize: 12, color: 'var(--o-text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</div>}
                    </div>
                    {r.run
                      ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-accent-soft)', background: 'rgba(var(--o-accent-rgb),.14)', borderRadius: 999, padding: '3px 10px', flexShrink: 0 }}>{r.runLabel || tr('Exécuter')}</span>
                      : <Fi i="angle-right" size={13} color="var(--o-text3)" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function Header() {
  const ctx = useContext(HeaderCtx) || {};
  const { light, onToggleTheme, onToggleNav, onNav, editMode, onToggleEdit, users = [], userIdx = 0, onSwitchUser, isAdmin = false, notifs = [], customViews = [], rooms = [] } = ctx;
  const cur = users[userIdx] || { name: 'Administrateur', role: 'Admin', grad: 'linear-gradient(135deg,#ffb347,#f87171)' };
  const curBg = userBg(cur);
  const hbtn = { width: 42, height: 42, borderRadius: '50%', background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--o-text1)', cursor: 'pointer', flexShrink: 0 };
  const editBtn = editMode ? { ...hbtn, background: 'rgba(var(--o-accent-rgb),.18)', borderColor: 'rgba(var(--o-accent-rgb),.45)', color: 'var(--o-accent-soft)' } : hbtn;
  const menu = { position: 'absolute', top: 'calc(100% + 8px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd1)', borderRadius: 14, boxShadow: '0 18px 44px rgba(0,0,0,.45)', backdropFilter: 'blur(14px)', zIndex: 60, overflow: 'hidden' };
  const mItem = { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'transparent', border: 'none', color: 'var(--o-text1)', cursor: 'pointer', fontSize: 13, fontWeight: 600, textAlign: 'left' };
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // ⌘K (mac) / Ctrl+K : ouvre/ferme la recherche globale
  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setSearchOpen(o => !o); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Appui long sur le chip lumières (voir plus bas) : minuteur + drapeau pour
  // que le clic qui SUIT un appui long ne navigue pas en plus d'avoir éteint.
  const chipTimer = useRef(0);
  const chipLong = useRef(false);
  useEffect(() => () => clearTimeout(chipTimer.current), []);
  /* Vu = PERSISTÉ (par appareil) : l'ancien état React s'évaporait à chaque
   * rechargement et le point rouge revenait pour des notifications déjà lues.
   * On retient la signature du contenu lu ; ouvrir le panneau marque tout vu. */
  const [vuSig, setVuSig] = useState(() => { try { return localStorage.getItem('loggia-notifsvues') || ''; } catch (e) { return ''; } });
  const [bellRing, setBellRing] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const iv = setInterval(() => setClock(new Date()), 30000); return () => clearInterval(iv); }, []);
  const capit = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const dateStr = capit(clock.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }));
  const timeStr = clock.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const hasNotif = notifs.length > 0;
  // Signature du contenu (hors temps relatif) : compare au « vu » persisté.
  const nsig = notifs.map(n => '' + n[1] + n[2]).join('|');
  const nonVues = hasNotif && nsig !== vuSig;
  const marquerVues = () => { setVuSig(nsig); try { localStorage.setItem('loggia-notifsvues', nsig); } catch (e) {} };
  const nsigPrev = useRef(nsig);
  useEffect(() => {
    // La cloche ne tinte que pour du contenu jamais lu — pas pour une signature
    // qui bouge sur des notifications déjà vues.
    if (nsig && nsig !== nsigPrev.current && nsig !== vuSig) { setBellRing(true); const t = setTimeout(() => setBellRing(false), 900); nsigPrev.current = nsig; return () => clearTimeout(t); }
    nsigPrev.current = nsig;
  }, [nsig]);
  useEffect(() => {
    if (!notifOpen && !userOpen) return;
    const close = (e) => { if (!(e.target.closest && e.target.closest('[data-hdr-menu]'))) { setNotifOpen(false); setUserOpen(false); } };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [notifOpen, userOpen]);
  // Auto-hide barre (porté de V1) : masquée en défilant vers le bas, réapparaît en remontant.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = 0;
    const onScroll = () => {
      const y = window.scrollY || (document.documentElement && document.documentElement.scrollTop) || 0;
      if (y < 24) setHidden(false);
      else if (y > last + 8) setHidden(true);
      else if (y < last - 8) setHidden(false);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <>
    {/* hors du <header> : son transform (auto-hide) ferait de lui le containing block du position:fixed du sheet */}
    {searchOpen && <SearchSheet onClose={() => setSearchOpen(false)} onNav={onNav} customViews={customViews} rooms={rooms} isAdmin={isAdmin} />}
    <header className="loggia-hdr" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 'calc(14px + var(--o-safe-top,0px)) 28px 14px', borderBottom: '1px solid var(--o-s1)', position: 'sticky', top: 0, background: 'var(--o-header)', backdropFilter: 'blur(12px)', zIndex: 40, transform: hidden ? 'translateY(-100%)' : 'translateY(0)', transition: 'transform .3s ease', willChange: 'transform' }}>
      <button onClick={onToggleNav} title={tr('Afficher / masquer le menu')} style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--o-text1)', cursor: 'pointer', flexShrink: 0 }}><Ico name="menu-burger" size={20} /></button>
      <div className="o-hdr-search" role="button" tabIndex={0} aria-label="Rechercher (Ctrl+K)" onClick={() => setSearchOpen(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSearchOpen(true); } }} style={{ flex: 1, maxWidth: 420, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 12, padding: '10px 14px', cursor: 'pointer' }}>
        <Ico name="search" size={16} color="var(--o-text2)" />
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--o-text2)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr('Rechercher une pièce, une scène…')}</span>
        <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', background: 'var(--o-bd2)', border: '1px solid var(--o-bd2)', borderRadius: 6, padding: '2px 7px' }}>{IS_MAC ? '⌘K' : 'Ctrl K'}</span>
      </div>
      <div style={{ flex: 1 }} />
      {/* Chip « n allumées » : l'état lumineux de la maison, d'un regard, où
          qu'on soit. Un appui LONG éteint tout — le geste du départ, sans
          chercher la scène. Le clic court navigue, comme avant. */}
      {ctx.lightsOn > 0 && (
        <button className="o-hdr-lights"
          onPointerDown={() => { chipLong.current = false; clearTimeout(chipTimer.current); chipTimer.current = setTimeout(() => {
            chipLong.current = true;
            try {
              const h = getHass(); if (!h || !h.callService) return;
              const S = h.states || {};
              const ids = Object.keys(S).filter(id => (id.indexOf('light.') === 0 || switchLights().indexOf(id) >= 0) && S[id] && S[id].state === 'on');
              if (ids.length) h.callService('homeassistant', 'turn_off', { entity_id: ids });
            } catch (e) { /* le poll dira l'état réel */ }
          }, 650); }}
          onPointerUp={() => clearTimeout(chipTimer.current)}
          onPointerLeave={() => clearTimeout(chipTimer.current)}
          onPointerCancel={() => clearTimeout(chipTimer.current)}
          onClick={() => { if (chipLong.current) { chipLong.current = false; return; } onNav && onNav('lumieres'); }}
          title={tr('Voir les lumières — appui long : tout éteindre')}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 999, cursor: 'pointer', flexShrink: 0, background: 'rgba(var(--o-gold-rgb),.13)', border: '1px solid rgba(var(--o-gold-rgb),.32)', color: 'var(--o-warn)', fontSize: 12.5, fontWeight: 800 }}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--o-warn)', boxShadow: '0 0 8px var(--o-warn)' }} />
          <FlipText text={ctx.lightsOn > 1 ? tr('{n} allumées', { n: ctx.lightsOn }) : tr('{n} allumée', { n: ctx.lightsOn })} />
        </button>
      )}
      <div className="o-hdr-date" style={{ textAlign: 'right', lineHeight: 1.15 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{dateStr}</div><div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600 }}><FlipText text={timeStr} /></div></div>
      <div className="o-hdr-div" style={{ width: 1, height: 30, background: 'var(--o-bd1)' }} />
      <div data-hdr-menu style={{ display: 'flex', alignItems: 'center', gap: 9, position: 'relative' }}>
        {isAdmin && <button onClick={onToggleEdit} title={editMode ? 'Quitter le mode édition' : tr('Mode édition')} style={editBtn}><Ico name="edit" size={17} /></button>}
        <button onClick={onToggleTheme} title={tr('Changer de thème')} style={hbtn}><Ico name="brightness" size={18} /></button>
        <button onClick={() => { setNotifOpen(o => { const n = !o; if (n) marquerVues(); return n; }); setUserOpen(false); }} title="Notifications" style={{ ...hbtn, position: 'relative' }}><span className={bellRing && !REDUCE_MOTION ? 'o-bellring' : undefined} style={{ display: 'inline-flex' }}><Ico name="bell" size={18} /></span>{nonVues && <span className="o-livedot" style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: '50%', background: '#f87171', border: '2px solid var(--o-bg2)' }} />}</button>
        <button onClick={() => { setUserOpen(o => !o); setNotifOpen(false); }} title="Profil" style={{ width: 44, height: 44, borderRadius: '50%', marginLeft: 4, background: curBg, border: '2px solid rgba(255,255,255,.15)', cursor: 'pointer', flexShrink: 0 }} />
        {notifOpen && (
          <div style={{ ...menu, right: 52, width: 'min(304px, calc(100vw - 32px))' }}>
            <div style={{ padding: '12px 14px', borderBottom: 'var(--o-bw,1px) solid var(--o-bd3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontWeight: 700, fontSize: 14 }}>Notifications</span><span onClick={marquerVues} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); marquerVues(); } }} style={{ fontSize: 12, color: 'var(--o-accent-soft)', cursor: 'pointer', fontWeight: 600 }}>Tout lire</span></div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {hasNotif ? notifs.map((n, i) => (
                <div key={i} style={{ display: 'flex', gap: 11, padding: '11px 14px', borderBottom: 'var(--o-bw,1px) solid var(--o-bd3)' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: n[0], marginTop: 5, flexShrink: 0 }} /><div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{n[1]}</div><div style={{ fontSize: 12, color: 'var(--o-text2)' }}>{n[2]}</div>{n[3] && <div style={{ fontSize: 11, color: 'var(--o-text3)', marginTop: 2 }}>{n[3]}</div>}</div></div>
              )) : <div style={{ padding: '22px 14px', textAlign: 'center', fontSize: 13, color: 'var(--o-text3)', fontWeight: 600 }}>Aucune notification</div>}
            </div>
          </div>
        )}
        {userOpen && (
          <div style={{ ...menu, right: 0, width: 252 }}>
            <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 11, borderBottom: 'var(--o-bw,1px) solid var(--o-bd3)' }}><span style={{ width: 40, height: 40, borderRadius: '50%', background: curBg, flexShrink: 0 }} /><div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{cur.name}</div><div style={{ fontSize: 12, color: 'var(--o-text2)' }}>{cur.role} · Maison</div></div></div>
            <div style={{ padding: '8px 12px 4px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--o-text3)' }}>CHANGER DE PROFIL</div>
            <div style={{ padding: '0 6px 6px' }}>
              {users.map((u, i) => (
                <button key={i} onClick={() => { onSwitchUser && onSwitchUser(i); setUserOpen(false); }} style={{ ...mItem, gap: 11, background: i === userIdx ? 'var(--o-s1)' : 'transparent' }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: userBg(u), flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{u.name}</span><span style={{ display: 'block', fontSize: 11, color: 'var(--o-text2)', fontWeight: 600 }}>{u.role}</span></span>
                  {i === userIdx && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--o-ok)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                </button>
              ))}
            </div>
            <div style={{ padding: 6, borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
              <button onClick={() => { onNav && onNav('parametres'); setUserOpen(false); }} style={mItem}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>{tr('Paramètres')}</button>
            </div>
          </div>
        )}
      </div>
    </header>
    </>
  );
}

const sectionTitle = { fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' };
const card = { background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)' };

// "couleur CSS (hex/rgb) → 'r,g,b'" pour alimenter les tokens rgba(var(--o-accent-rgb),...)
function cssToRgb(c) {
  c = (c || '').trim();
  if (c[0] === '#') { let h = c.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; const n = parseInt(h, 16); return isNaN(n) ? '' : `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; }
  const m = c.match(/(\d+)[ ,]+(\d+)[ ,]+(\d+)/); return m ? `${m[1]},${m[2]},${m[3]}` : '';
}

const THEME_KEYS = ['--o-bg', '--o-bggrad', '--o-bg2', '--o-side1', '--o-side2', '--o-surfA', '--o-surfB', '--o-header', '--o-text', '--o-text1', '--o-text2', '--o-text3', '--o-bd1', '--o-bd2', '--o-bd3', '--o-s1', '--o-s2', '--o-s3', '--o-s4', '--o-s5', '--o-well', '--o-well2', '--o-well0', '--o-accent', '--o-accent-rgb', '--o-accent-soft', '--o-accent-soft-rgb', '--o-shadow', '--o-bw', '--o-font',
  // tokens fins des presets (Atrium) — purgés au changement de thème comme les autres
  '--o-ok', '--o-ok-rgb', '--o-warn2', '--o-warn2-rgb', '--o-bad', '--o-bad-rgb', '--o-shadow-hover'];
// Thèmes natifs Loggia (créés pour Loggia, adaptés des thèmes HA fournis). Chaque preset a une variante claire + sombre,
// pilotée par le Mode d'affichage. Forme = entrée de applyVars (bg/surface/text/accent/radius/shadow/border/font/bggrad).
const LOGGIA_PRESETS = {
  neumorphix: {
    light: { bg: '#e8eaf0', surface: '#eef0f6', surfaceElevated: '#f3f5fb', text: '#2c2f3a', muted: '#606470', border: 'rgba(120,130,160,.14)', accent: '#6c7ae0', accentText: '#5563cc', radius: '20px', borderWidth: '0px', shadow: '6px 6px 14px #d3d6e1, -6px -6px 14px #ffffff', bggrad: 'linear-gradient(160deg,#edeff5,#e3e6ef)', font: "'Manrope', -apple-system, sans-serif" },
    dark: { bg: '#1e2128', surface: '#262b35', surfaceElevated: '#2c323e', text: '#e2e8f0', muted: '#94a3b8', border: 'rgba(255,255,255,.05)', accent: '#5de0d8', radius: '20px', borderWidth: '0px', shadow: '5px 5px 12px #13161c, -5px -5px 12px #2d3340', bggrad: 'linear-gradient(160deg,#21252e,#171a20)', font: "'Manrope', -apple-system, sans-serif" },
  },
  google: {
    light: { bg: '#f6f8fc', surface: '#ffffff', surfaceElevated: '#ffffff', text: '#202124', muted: '#5f6368', border: '#e7e9ee', accent: '#1a73e8', radius: '12px', borderWidth: '1px', shadow: '0 1px 3px rgba(60,64,67,.15), 0 1px 2px rgba(60,64,67,.1)', bggrad: '', font: "'Google Sans','Roboto',-apple-system,sans-serif" },
    dark: { bg: '#171717', surface: '#202124', surfaceElevated: '#26282c', text: '#f2f2f2', muted: '#a6a6a6', border: '#2c2d31', accent: '#8ab4f8', radius: '12px', borderWidth: '1px', shadow: '0 1px 3px rgba(0,0,0,.5)', bggrad: '', font: "'Google Sans','Roboto',-apple-system,sans-serif" },
  },
  ios: {
    light: { bg: '#e5e5ea', surface: '#fbfbfd', surfaceElevated: '#ffffff', text: '#1c1c1e', muted: '#6c6c70', border: 'rgba(60,60,67,.1)', accent: '#ff9409', accentText: '#b35c00', radius: '22px', borderWidth: '0px', shadow: '0 10px 30px rgba(0,0,0,.08)', bggrad: 'linear-gradient(165deg,#eef0f5,#e1e4ed)', font: "-apple-system,'SF Pro Display','Segoe UI',sans-serif" },
    dark: { bg: '#0d0d10', surface: '#1c1c1e', surfaceElevated: '#262629', text: '#ffffff', muted: '#aeaeb2', border: 'rgba(255,255,255,.08)', accent: '#ff9f09', radius: '22px', borderWidth: '0px', shadow: '0 10px 30px rgba(0,0,0,.5)', bggrad: 'linear-gradient(165deg,#1a1a20,#09090c)', font: "-apple-system,'SF Pro Display','Segoe UI',sans-serif" },
  },
  // Frosted Glass : surfaces TRANSLUCIDES (le flou backdrop est appliqué en CSS via html.loggia-frosted) sur un fond dégradé.
  frosted: {
    light: { bg: '#e6e8f5', surface: 'rgba(255,255,255,.55)', surfaceElevated: 'rgba(255,255,255,.72)', text: '#15183a', muted: '#54597e', border: 'rgba(255,255,255,.55)', accent: '#6a74d3', accentText: '#4e57b0', radius: '18px', borderWidth: '1px', shadow: '0 14px 30px rgba(40,40,90,.14)', bggrad: 'linear-gradient(120deg,#f4e9f1 0%,#e3e9f8 45%,#bcc8f0 100%)', font: "-apple-system,'Segoe UI',Roboto,sans-serif" },
    dark: { bg: '#0d111c', surface: 'rgba(34,38,58,.42)', surfaceElevated: 'rgba(44,49,72,.55)', text: '#eaebf2', muted: '#a6abc6', border: 'rgba(234,235,238,.14)', accent: '#8f97de', radius: '18px', borderWidth: '1px', shadow: '0 14px 30px rgba(0,0,0,.38)', bggrad: 'radial-gradient(ellipse 95% 75% at 55% 32%,#283050 0%,#141b2d 55%,#0b0f1a 100%)', font: "-apple-system,'Segoe UI',Roboto,sans-serif" },
  },
  // ── Thèmes éditeur VS Code (palettes officielles ; variante claire = pendant light officiel) ──
  onedark: {
    dark: { bg: '#21252b', surface: '#282c34', surfaceElevated: '#2f343e', text: '#abb2bf', muted: '#7f848e', border: 'rgba(255,255,255,.06)', accent: '#61afef', radius: '18px', borderWidth: '1px', shadow: '0 12px 30px rgba(0,0,0,.4)', bggrad: 'linear-gradient(170deg,#23272e,#1d2025)', font: "'Manrope', -apple-system, sans-serif" },
    light: { bg: '#eaeaeb', surface: '#fafafa', surfaceElevated: '#ffffff', text: '#383a42', muted: '#696c77', border: 'rgba(56,58,66,.13)', accent: '#4078f2', accentText: '#2f5cc4', radius: '18px', borderWidth: '1px', shadow: '0 10px 24px rgba(56,58,66,.10)', bggrad: '', font: "'Manrope', -apple-system, sans-serif" },
  },
  dracula: {
    dark: { bg: '#21222c', surface: '#282a36', surfaceElevated: '#343746', text: '#f8f8f2', muted: '#8a94c0', border: 'rgba(189,147,249,.14)', accent: '#bd93f9', radius: '18px', borderWidth: '1px', shadow: '0 12px 30px rgba(0,0,0,.42)', bggrad: 'radial-gradient(ellipse 90% 70% at 50% 0%,#2b2d3d 0%,#1e1f29 60%)', font: "'Manrope', -apple-system, sans-serif" },
    light: { bg: '#f3efe0', surface: '#fffbeb', surfaceElevated: '#ffffff', text: '#1f1f1f', muted: '#635d97', border: 'rgba(100,74,201,.16)', accent: '#644ac9', accentText: '#4f39a8', radius: '18px', borderWidth: '1px', shadow: '0 10px 24px rgba(100,74,201,.10)', bggrad: '', font: "'Manrope', -apple-system, sans-serif" },
  },
  github: {
    dark: { bg: '#0d1117', surface: '#161b22', surfaceElevated: '#1c2129', text: '#e6edf3', muted: '#8b949e', border: '#30363d', accent: '#58a6ff', radius: '14px', borderWidth: '1px', shadow: '0 8px 24px rgba(0,0,0,.4)', bggrad: '', font: "'Manrope', -apple-system, sans-serif" },
    light: { bg: '#f6f8fa', surface: '#ffffff', surfaceElevated: '#ffffff', text: '#1f2328', muted: '#656d76', border: '#d0d7de', accent: '#0969da', accentText: '#0969da', radius: '14px', borderWidth: '1px', shadow: '0 6px 18px rgba(31,35,40,.08)', bggrad: '', font: "'Manrope', -apple-system, sans-serif" },
  },
  tokyo: {
    dark: { bg: '#16161e', surface: '#1a1b26', surfaceElevated: '#1f2335', text: '#c0caf5', muted: '#7982a9', border: 'rgba(122,162,247,.11)', accent: '#7aa2f7', radius: '18px', borderWidth: '1px', shadow: '0 12px 30px rgba(0,0,0,.45)', bggrad: 'radial-gradient(ellipse 95% 70% at 50% 0%,#1e2030 0%,#131420 60%)', font: "'Manrope', -apple-system, sans-serif" },
    light: { bg: '#d5d6db', surface: '#e6e7ed', surfaceElevated: '#f2f2f7', text: '#343b58', muted: '#5a607d', border: 'rgba(52,59,88,.15)', accent: '#2e7de9', accentText: '#1f5bb8', radius: '18px', borderWidth: '1px', shadow: '0 10px 24px rgba(52,59,88,.10)', bggrad: '', font: "'Manrope', -apple-system, sans-serif" },
  },
  material: {
    dark: { bg: '#1e282d', surface: '#263238', surfaceElevated: '#2e3c43', text: '#eeffff', muted: '#7d97a5', border: 'rgba(255,255,255,.06)', accent: '#80cbc4', radius: '20px', borderWidth: '0px', shadow: '0 12px 30px rgba(0,0,0,.4)', bggrad: 'linear-gradient(165deg,#243036,#1b2429)', font: "'Manrope', -apple-system, sans-serif" },
    light: { bg: '#eceff1', surface: '#fafafa', surfaceElevated: '#ffffff', text: '#37474f', muted: '#607d8b', border: 'rgba(55,71,79,.12)', accent: '#00897b', accentText: '#00695c', radius: '20px', borderWidth: '0px', shadow: '0 10px 24px rgba(55,71,79,.10)', bggrad: '', font: "'Manrope', -apple-system, sans-serif" },
  },
  nightowl: {
    dark: { bg: '#01111d', surface: '#011627', surfaceElevated: '#0b2942', text: '#d6deeb', muted: '#7e97b3', border: 'rgba(95,126,151,.22)', accent: '#82aaff', radius: '18px', borderWidth: '1px', shadow: '0 12px 32px rgba(0,0,0,.5)', bggrad: 'radial-gradient(ellipse 95% 70% at 50% 0%,#04203a 0%,#010f1a 60%)', font: "'Manrope', -apple-system, sans-serif" },
    light: { bg: '#f0f0f0', surface: '#fbfbfb', surfaceElevated: '#ffffff', text: '#403f53', muted: '#676688', border: 'rgba(64,63,83,.14)', accent: '#0c969b', accentText: '#0a7c80', radius: '18px', borderWidth: '1px', shadow: '0 10px 24px rgba(64,63,83,.10)', bggrad: '', font: "'Manrope', -apple-system, sans-serif" },
  },
  // ── Paires de couleurs (réf. envoyée par le user) : Charcoal × Soft Lavender, Plum Wine × Blush Pink ──
  lavande: {
    dark: { bg: '#232326', surface: '#2b2b2f', surfaceElevated: '#333338', text: '#ece9f4', muted: '#a8a3bd', border: 'rgba(214,205,234,.12)', accent: '#c3b5e6', accentText: '#d6cdea', radius: '20px', borderWidth: '1px', shadow: '0 4px 10px rgba(0,0,0,.24), 0 16px 32px rgba(0,0,0,.2)', bggrad: 'linear-gradient(170deg,#27272b,#1d1d20)', font: "'Manrope', -apple-system, sans-serif" },
    light: { bg: '#e9e4f3', surface: '#f7f5fb', surfaceElevated: '#ffffff', text: '#2b2b30', muted: '#6d6785', border: 'rgba(43,43,48,.12)', accent: '#7b68b8', accentText: '#5f4da0', radius: '20px', borderWidth: '1px', shadow: '0 2px 6px rgba(43,43,48,.06), 0 12px 28px rgba(43,43,48,.10)', bggrad: 'linear-gradient(165deg,#efeaf7,#e2dcf0)', font: "'Manrope', -apple-system, sans-serif" },
  },
  plum: {
    dark: { bg: '#22101a', surface: '#341624', surfaceElevated: '#421c2e', text: '#f6e7ec', muted: '#c39aa9', border: 'rgba(242,198,207,.14)', accent: '#eda4b6', accentText: '#f2c6cf', radius: '20px', borderWidth: '1px', shadow: '0 4px 10px rgba(0,0,0,.26), 0 16px 32px rgba(0,0,0,.22)', bggrad: 'radial-gradient(ellipse 95% 70% at 50% 0%,#3d1628 0%,#1c0d15 60%)', font: "'Manrope', -apple-system, sans-serif" },
    light: { bg: '#f6e3e8', surface: '#fdf5f7', surfaceElevated: '#ffffff', text: '#3c1526', muted: '#8d5a6c', border: 'rgba(90,30,58,.14)', accent: '#a03d5e', accentText: '#832c4a', radius: '20px', borderWidth: '1px', shadow: '0 2px 6px rgba(90,30,58,.06), 0 12px 28px rgba(90,30,58,.10)', bggrad: 'linear-gradient(165deg,#f9ebef,#f2dae1)', font: "'Manrope', -apple-system, sans-serif" },
  },
  // ── Atrium : le thème du tableau de bord maison. Sa signature n'est pas sa
  //    couleur — elle est proche de celle d'Loggia — mais son traitement : aucune
  //    ombre, des surfaces opaques, et un filet d'un pixel qui porte seul la
  //    structure. Le fond descend au quasi-noir neutre pour que les cartes se
  //    détachent par leur clarté, et non par une ombre portée.
  atrium: {
    dark: {
      bg: '#07090d', surface: '#0b0f15', surfaceElevated: '#111620', text: '#e9eef5', muted: '#a8b2c1',
      border: 'rgba(255,255,255,.065)', accent: '#5b8cff', accentText: '#8fb0ff',
      radius: '16px', borderWidth: '1px', shadow: 'none', bggrad: '', font: "'Manrope', -apple-system, sans-serif",
      fine: {
        // carte = dégradé c1 → c2 + filet 1px ; aucune ombre au repos
        '--o-surfA': '#111620', '--o-surfB': '#0b0f15',
        '--o-bg2': '#0a0d12', '--o-side1': '#0a0d12', '--o-side2': '#07090d',
        '--o-header': 'rgba(8,10,14,.88)',
        '--o-well': '#0d1117', '--o-well0': '#111620', '--o-well2': '#07090d',
        // 7 niveaux de texte du handoff → 4 tokens Loggia (t1 · t2 · t3 · t6)
        '--o-text': '#e9eef5', '--o-text1': '#cfd7e2', '--o-text2': '#a8b2c1', '--o-text3': '#5c6675',
        // traits (hair) — jamais confondus avec les remplissages
        '--o-bd1': 'rgba(255,255,255,.1)', '--o-bd2': 'rgba(255,255,255,.065)', '--o-bd3': 'rgba(255,255,255,.045)',
        // remplissages neutres (s1 → s4)
        '--o-s1': 'rgba(255,255,255,.07)', '--o-s2': 'rgba(255,255,255,.045)', '--o-s3': 'rgba(255,255,255,.03)',
        '--o-s4': 'rgba(255,255,255,.02)', '--o-s5': 'rgba(255,255,255,.02)',
        // sémantique : le texte change entre les thèmes, pas les points/jauges
        '--o-ok': '#5ee089', '--o-ok-rgb': '34,197,94', '--o-warn2': '#f7bd5c', '--o-warn2-rgb': '245,165,36',
        '--o-bad': '#f79c92', '--o-bad-rgb': '240,104,90',
        '--o-shadow-hover': '0 16px 34px rgba(0,0,0,.45)',
      },
    },
    light: {
      bg: '#f2f4f7', surface: '#ffffff', surfaceElevated: '#ffffff', text: '#101828', muted: '#475467',
      border: 'rgba(16,24,40,.1)', accent: '#5b8cff', accentText: '#1d55c9',
      radius: '16px', borderWidth: '1px', shadow: 'none', bggrad: '', font: "'Manrope', -apple-system, sans-serif",
      fine: {
        // en clair, c1 = c2 = blanc : la carte est plate, c'est le filet qui la détache
        '--o-surfA': '#ffffff', '--o-surfB': '#ffffff',
        '--o-bg2': '#ffffff', '--o-side1': '#ffffff', '--o-side2': '#ffffff',
        '--o-header': 'rgba(246,247,249,.9)',
        '--o-well': '#ffffff', '--o-well0': '#ffffff', '--o-well2': '#f2f4f7',
        '--o-text': '#101828', '--o-text1': '#26303f', '--o-text2': '#475467', '--o-text3': '#8a93a1',
        '--o-bd1': 'rgba(16,24,40,.14)', '--o-bd2': 'rgba(16,24,40,.1)', '--o-bd3': 'rgba(16,24,40,.07)',
        '--o-s1': 'rgba(16,24,40,.07)', '--o-s2': 'rgba(16,24,40,.05)', '--o-s3': 'rgba(16,24,40,.035)',
        '--o-s4': 'rgba(16,24,40,.022)', '--o-s5': 'rgba(16,24,40,.022)',
        '--o-ok': '#15803d', '--o-ok-rgb': '34,197,94', '--o-warn2': '#b45309', '--o-warn2-rgb': '245,165,36',
        '--o-bad': '#b42318', '--o-bad-rgb': '240,104,90',
        '--o-shadow-hover': '0 16px 34px rgba(16,24,40,.12)',
      },
    },
  },
};
function lum(c) {
  c = (c || '').trim(); let r, g, b;
  if (c[0] === '#') { let h = c.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; const n = parseInt(h, 16); if (isNaN(n)) return 1; r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
  else { const m = c.match(/(\d+)[ ,]+(\d+)[ ,]+(\d+)/); if (!m) return 1; r = +m[1]; g = +m[2]; b = +m[3]; }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
function applyVars(root, v) {
  const set = (k, val) => { if (val) root.style.setProperty(k, val); };
  set('--o-bg', v.bg); set('--o-bg2', v.bg); set('--o-side2', v.bg); set('--o-well2', v.bg);
  set('--o-surfA', v.surfaceElevated || v.surface); set('--o-surfB', v.surface); set('--o-header', v.surface); set('--o-side1', v.surfaceElevated || v.surface); set('--o-well', v.surface); set('--o-well0', v.surfaceElevated || v.surface);
  set('--o-text', v.text); set('--o-text1', v.text); set('--o-text2', v.muted); set('--o-text3', v.muted);
  set('--o-bd1', v.border); set('--o-bd2', v.border); set('--o-bd3', v.border);
  set('--o-s1', v.border); set('--o-s2', v.border); set('--o-s3', v.border); set('--o-s4', v.border); set('--o-s5', v.border);
  if (v.accent) { set('--o-accent', v.accent); const rgb = cssToRgb(v.accent); if (rgb) set('--o-accent-rgb', rgb); const at = v.accentText || v.accent; set('--o-accent-soft', at); const rgbS = cssToRgb(at); if (rgbS) set('--o-accent-soft-rgb', rgbS); }
  set('--o-radius', v.radius); set('--o-shadow', v.shadow); set('--o-bw', v.borderWidth); set('--o-font', v.font); set('--o-bggrad', v.bggrad);
  // Tokens fins d'un preset (7 niveaux de texte, traits ≠ remplissages, sémantique) :
  // appliqués en dernier, ils affinent le mapping grossier ci-dessus sans le remplacer.
  if (v.fine) Object.keys(v.fine).forEach(k => set(k, v.fine[k]));
}
// "Suivre HA" : lit le thème ACTIF de HA (nom via selectedTheme/default) puis sa définition
// Lit les valeurs RÉSOLUES du thème HA appliqué sur le parent (comme la V1 : C5).
// Marche pour tous les thèmes HACS (var() + tokens maison résolus par le navigateur).
function readComputedHaTheme(hass) {
  try {
    const top = window.top || window;
    const d = top.document;
    const els = [];
    if (d.documentElement) els.push(d.documentElement);
    const he = d.querySelector('home-assistant'); if (he) els.push(he);
    const hr = he && he.shadowRoot && he.shadowRoot.querySelector('home-assistant-main'); if (hr) els.push(hr);
    if (d.body) els.push(d.body);
    for (const el of els) {
      const t = top.getComputedStyle(el), r = l => (t.getPropertyValue(l) || '').trim();
      const bg = r('--lovelace-background') || r('--primary-background-color');
      if (!bg) continue;
      const dark = (hass && hass.themes && typeof hass.themes.darkMode === 'boolean') ? hass.themes.darkMode : lum(bg) < 0.5;
      return {
        dark, bg,
        accent: r('--primary-color'),
        surface: r('--ha-card-background') || r('--card-background-color'),
        surfaceElevated: r('--card-background-color') || r('--ha-card-background'),
        text: r('--primary-text-color'),
        muted: r('--secondary-text-color'),
        border: r('--ha-card-border-color') || r('--divider-color'),
        radius: r('--ha-card-border-radius'),
        shadow: r('--ha-card-box-shadow'),
        borderWidth: r('--ha-card-border-width'),
        font: r('--primary-font-family') || r('--mdc-typography-font-family') || r('--paper-font-body1_-_font-family'),
      };
    }
  } catch (e) {}
  return null;
}
/* Safe mode « sans thème » : posé par l'écran d'erreur (boot.jsx), consommé
 * ici — il ne vaut que pour UN chargement et ne touche pas à la configuration.
 * Un preset ou un look corrompu ne doit pas condamner le dashboard. */
const SAFE_NOLOOK = (() => {
  try { if (sessionStorage.getItem('loggia_safe_nolook')) { sessionStorage.removeItem('loggia_safe_nolook'); return true; } } catch (e) { /* rien */ }
  return false;
})();

function readLook() {
  if (SAFE_NOLOOK) return { ...LOOK_DEF };
  try {
    const L = { ...LOOK_DEF, ...(JSON.parse(window.localStorage.getItem('loggia_look') || 'null') || {}) };
    if (L.fond !== 'photo') L.fond = 'aucun'; // les degrades retires retombent sur « aucun »
    return L;
  } catch (e) { return { ...LOOK_DEF }; }
}

/* Teinte d'état : les cartes qui montrent un appareil ACTIF (lampe allumée,
 * volet ouvert, radiateur qui chauffe) lavent leur surface de leur couleur.
 * Le réglage module l'intensité de ce lavis. « Douce » = le rendu historique
 * (les ampoules l'avaient déjà, en dur) ; « Sans » rend les cartes neutres ;
 * « Pleine » double la présence de la couleur, façon GlassHome.
 *
 * `LAVIS` est un facteur module-level et non un état React : il est LU au
 * rendu (jamais à l'import), et changer le réglage redessine tout l'arbre. */
const TEINTES = { sans: 0, discrete: .6, douce: 1, pleine: 1.9 };
let LAVIS = 1;
/** Alpha de lavis bornée : base × facteur du réglage, plafonnée à .85. */
const lav = (base) => Math.min(.85, Math.round(base * LAVIS * 1000) / 1000);

/* Fond d'écran : « aucun » ou la photo de l'utilisateur (voir lireFondPhoto).
 * Les dégradés Minuit / Abysse / Ardoise ont vécu du 28 au 29/08/2026 —
 * retirés à la demande de l'utilisateur, la photo les rendait superflus. Une
 * ancienne valeur enregistrée retombe sur « aucun ». */
function applyLook(root, L, frostedPreset, light) {
  // Intensité du lavis de teinte, lue par les cartes au rendu (voir TEINTES).
  LAVIS = TEINTES[L.tint] != null ? TEINTES[L.tint] : 1;
  /* Un seul matériau depuis le 29/08 (décision user) : le translucide de
   * l'accueil, partout. Le réglage Opaque/Verre a disparu de l'Apparence ;
   * `L.glass` reste dans les configs enregistrées mais n'est plus lu. */
  const verre = true;
  root.classList.toggle('loggia-frosted', verre);
  /* « Verre » ne posait qu'un `backdrop-filter`. Or un flou d'arriere-plan ne se
   * voit qu'a travers ce qui est translucide : les surfaces sont a 90 %
   * d'opacite, certains themes les donnent carrement opaques, et l'effet
   * n'apparaissait pas. D'ou l'impression que le reglage ne faisait rien selon
   * le theme choisi.
   *
   * On ouvre donc la surface elle-meme. En JS et non en CSS : les presets posent
   * ces tokens EN INLINE sur la racine, et une regle de classe ne bat pas un
   * style inline — c'est ecrit dans index.css, et c'est pourquoi la premiere
   * tentative ne pouvait pas fonctionner.
   *
   * On garde une base solide : sous 55 % d'opacite, le texte des cartes passe
   * sous le seuil de contraste sur un fond clair. */
  ['--o-surfA', '--o-surfB'].forEach(token => {
    root.style.removeProperty(token);
    if (!verre) return;
    const rgb = cssToRgb(getComputedStyle(root).getPropertyValue(token).trim());
    if (rgb) root.style.setProperty(token, 'rgba(' + rgb + ',.62)');
  });
  root.classList.toggle('loggia-contrast', !!L.contrast);
  if (L.contrast) {
    const cs = getComputedStyle(root);
    const towardText = (token, part) => {
      const a = cssToRgb(cs.getPropertyValue('--o-text').trim());
      const b = cssToRgb(cs.getPropertyValue(token).trim());
      if (!a || !b) return;
      const A = a.split(','), B = b.split(',');
      root.style.setProperty(token, 'rgb(' + [0, 1, 2].map(i => Math.round(+A[i] * part + +B[i] * (1 - part))).join(',') + ')');
    };
    towardText('--o-text2', .55); towardText('--o-text3', .42); towardText('--o-bd3', .22);
  }
  if (L.radius === 'net') root.style.setProperty('--o-radius', '7px');
  else if (L.radius === 'rond') root.style.setProperty('--o-radius', '26px');
  if (!L.shadow) { root.style.setProperty('--o-shadow', 'none'); root.style.setProperty('--o-shadow-hover', 'none'); }
  if (!L.hairline) root.style.setProperty('--o-bw', '0px');
  if (L.accent) {
    const rgb = cssToRgb(L.accent);
    root.style.setProperty('--o-accent', L.accent); root.style.setProperty('--o-accent-soft', L.accent);
    if (rgb) { root.style.setProperty('--o-accent-rgb', rgb); root.style.setProperty('--o-accent-soft-rgb', rgb); }
  }
}

function applyTheme(opts, hass) {
  const root = document.documentElement;
  THEME_KEYS.forEach(k => root.style.removeProperty(k)); root.style.removeProperty('--o-radius'); root.style.removeProperty('--o-bggrad'); root.style.removeProperty('--o-shadow-hover');
  root.classList.remove('loggia-frosted');
  const L = opts.look || readLook();
  // Suivre HA : miroir du thème actif de HA (valeurs résolues sur le parent).
  if (opts.haTheme === 'FOLLOW') {
    const v = readComputedHaTheme(hass);
    if (v) { applyVars(root, v); root.classList.toggle('loggia-light', !v.dark); applyLook(root, L, false, !v.dark); return !!v.dark; }
    // computed pas prêt → base en attendant (l'effet poll réessaie)
  }
  const light = opts.mode === 'light';
  root.classList.toggle('loggia-light', light);
  // Preset Loggia ('' = défaut → tokens CSS de base, aucune surcharge). Sinon applique la variante claire/sombre.
  const preset = LOGGIA_PRESETS[opts.loggiaTheme];
  if (preset) { const v = preset[light ? 'light' : 'dark']; if (v) applyVars(root, v); }
  applyLook(root, L, opts.loggiaTheme === 'frosted', light); // 'frosted' active aussi le flou backdrop des cartes
  return !light;
}

/**
 * Les icones de Home Assistant, traduites vers la police du dashboard.
 *
 * Une zone de Home Assistant porte l'icone que l'utilisateur lui a choisie,
 * sous la forme « mdi:sofa ». Le dashboard, lui, dessine avec UICons. Cette
 * table fait le pont : elle permet de NOMMER SES PIECES COMME ON VEUT, puisque
 * l'icone ne se deduit plus des mots du nom.
 *
 * Chaque cible a ete verifiee contre les TROIS sources que `Ico` consulte, et
 * dans cet ordre : `CUSTOM_SVG` (des dessins maison, dont `couch`, `teddy-bear`
 * et `bed-alt`), `FI_MAP` (des alias), puis la police REGULAR — `fi-rr-`, et
 * non `fi-sr-`. Chercher un nom dans le seul CSS de la police solide fait
 * conclure a tort qu'il n'existe pas.
 */
const MDI_VERS_UICON = {
  sofa: 'couch', 'sofa-outline': 'couch', 'seat-outline': 'couch', 'sofa-single': 'couch',
  'silverware-fork-knife': 'utensils', 'countertop': 'utensils', stove: 'utensils',
  'fridge': 'utensils', 'coffee': 'coffee', 'food': 'restaurant',
  bed: 'bed-alt', 'bed-king': 'bed-alt', 'bed-queen': 'bed-alt', 'sleep': 'bed-alt',
  'teddy-bear': 'teddy-bear', 'baby-carriage': 'baby-carriage', 'baby': 'baby-carriage',
  'shower-head': 'hot-tub', shower: 'hot-tub', bathtub: 'hot-tub', 'toilet': 'hot-tub',
  desk: 'briefcase', 'desktop-tower-monitor': 'computer', 'laptop': 'computer',
  monitor: 'computer', briefcase: 'briefcase',
  tree: 'tree', flower: 'flower-tulip', 'flower-outline': 'flower-tulip',
  'grass': 'leaf', leaf: 'leaf', 'weather-sunny': 'sun',
  garage: 'garage', 'garage-variant': 'garage', car: 'car',
  'home-outline': 'home', home: 'home', 'door': 'door-open', 'door-open': 'door-open',
  'lan': 'network-cloud', 'router-network': 'network-cloud', 'wifi': 'network-cloud',
  'shield-home': 'shield-check', 'shield': 'shield-check', 'cctv': 'shield-check',
  'flash': 'bolt', 'lightning-bolt': 'bolt', 'transmission-tower': 'bolt',
  orbit: 'settings-sliders', cog: 'settings-sliders', 'tools': 'settings-sliders',
  'bookshelf': 'book', book: 'book',
};

/** « mdi:teddy-bear » → « teddy-bear », si la police sait le dessiner. */
function uiconDeMdi(mdi) {
  if (!mdi || typeof mdi !== 'string') return null;
  const cle = mdi.replace(/^mdi:/, '').trim();
  return MDI_VERS_UICON[cle] || null;
}

const PIECES = [
  { name: 'Séjour', bg: 'rgba(var(--o-accent-rgb),.16)', box: 44, rad: 13, icon: <Ico name="couch" color="var(--o-accent)" size={22} />, status: { kind: 'active', n: 2 }, temp: '18.1°', tc: 'var(--o-accent-soft)', hum: '63%', badge: '412 ppm', bc: 'var(--o-ok)', bbg: 'rgba(52,211,153,.14)' },
  { name: 'Cuisine', bg: 'rgba(255,157,60,.16)', box: 44, rad: 13, icon: <Ico name="utensils" color="#ff9d3c" size={22} />, status: { kind: 'active', n: 1 }, temp: '22.0°', tc: '#ff9d3c', hum: '53%', badge: '486 ppm', bc: 'var(--o-ok)', bbg: 'rgba(52,211,153,.14)' },
  { name: 'Chambre', bg: 'rgba(167,139,250,.16)', box: 44, rad: 13, icon: <Ico name="bed-alt" color="var(--o-purple)" size={22} />, status: { kind: 'repos' }, temp: '18.1°', tc: 'var(--o-purple)', hum: '60%', badge: '529 ppm', bc: 'var(--o-warn)', bbg: 'rgba(var(--o-warn-rgb),.14)' },
  { name: 'Chambre enfant', bg: 'rgba(244,114,182,.16)', box: 44, rad: 13, icon: <Ico name="teddy-bear" color="#f472b6" size={22} />, status: { kind: 'repos' }, temp: '18.1°', tc: '#f472b6', hum: '61%', badge: '641 ppm', bc: 'var(--o-warn2)', bbg: 'rgba(var(--o-warn2-rgb),.14)' },
  { name: 'Bureau', bg: 'rgba(255,157,60,.16)', box: 44, rad: 13, icon: <Ico name="briefcase" color="#ff9d3c" size={22} />, status: { kind: 'repos' }, temp: '17.8°', tc: '#ff9d3c', hum: '64%', badge: '712 ppm', bc: 'var(--o-warn2)', bbg: 'rgba(var(--o-warn2-rgb),.14)' },
  { name: 'Salle de bain', bg: 'rgba(84,200,240,.16)', box: 44, rad: 13, icon: <Ico name="hot-tub" color="var(--o-cyan)" size={22} />, status: { kind: 'repos' }, temp: '15.5°', tc: 'var(--o-cyan)', hum: '80%', badge: '498 ppm', bc: 'var(--o-ok)', bbg: 'rgba(52,211,153,.14)' },
  { name: 'Extérieur', bg: 'rgba(52,211,153,.16)', box: 36, rad: 11, icon: <Ico name="tree" color="var(--o-ok)" size={22} />, status: { kind: 'ext' }, temp: '6.2°', tc: 'var(--o-accent-soft)', hum: '84%', badge: 'Vent 12', bc: 'var(--o-text2)', bbg: 'var(--o-bd3)' },
];

function PieceCard({ p, onOpen, compact = false, lights = null, mains = null, onToggleLights, idx = 0 }) {
  // Format compact (PC ≥1180) : compteur = luminaires non-« Ampoule » ; interrupteur = plafonnier(s) SEULS
  const tilt = useTilt(4);
  const [flashRef, flash] = useFlash();
  /* Mini-courbe de température : la journée de la pièce d'un coup d'œil.
   * Le cache 5 min du hook évite de mitrailler l'API à chaque navigation. */
  const ptsTemp = useHistorique24(getHass(), (compact && p.live && p.live.tempId) || null);
  let cheminTemp = '';
  if (ptsTemp && ptsTemp.length > 1) {
    const t0 = ptsTemp[0].t, t1 = ptsTemp[ptsTemp.length - 1].t || t0 + 1;
    const vmin = Math.min(...ptsTemp.map(q => q.v)), vmax = Math.max(...ptsTemp.map(q => q.v));
    const spread = (vmax - vmin) || 1;
    cheminTemp = ptsTemp.map((q, i2) => (i2 ? 'L' : 'M') + (((q.t - t0) / (t1 - t0 || 1)) * 100).toFixed(1) + ' ' + (vmax === vmin ? 8 : 14 - ((q.v - vmin) / spread) * 12).toFixed(1)).join(' ');
  }
  // Optimiste : l'interrupteur bascule tout de suite, puis se réconcilie avec HA au poll suivant
  const realOn = (mains && mains.length) ? mains.some(l => l.on) : null;
  const [ov, setOv] = useState(null);
  useEffect(() => { setOv(null); }, [realOn]);
  // Filet 6 s : si HA ne confirme pas (commande rejetée), retour à l'état réel
  const ovRevertRef = useRef(0);
  useEffect(() => () => clearTimeout(ovRevertRef.current), []);
  const doToggle = () => { flash(p.tc || 'var(--o-accent)'); if (realOn != null) { setOv(!(ov != null ? ov : realOn)); clearTimeout(ovRevertRef.current); ovRevertRef.current = setTimeout(() => setOv(null), 6000); } onToggleLights && onToggleLights(); };
  if (compact) {
    const n = lights ? lights.filter(l => l.on).length : (p.status.kind === 'active' ? p.status.n : 0);
    const on = realOn != null ? (ov != null ? ov : realOn) : n > 0;
    const canToggle = !!(mains && mains.length && onToggleLights);
    return (
      <div ref={tilt.ref} onPointerMove={tilt.onPointerMove} onPointerLeave={tilt.onPointerLeave} onPointerCancel={tilt.onPointerCancel} className={'o-piece o-stag o-hov ' + (tilt.className || '')} onClick={onOpen} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen && onOpen(); } }} style={{ ...card, position: 'relative', borderRadius: 15, padding: '14px 15px 12px',
        // Halo d'une pièce éclairée. Les cartes de luminaires en ont un, pas
        // celles de l'accueil : d'un coup d'œil, on ne voyait pas quelles pièces
        // étaient allumées, alors que c'est ce qu'on y cherche. Même teinte que
        // l'interrupteur allumé, et l'ombre habituelle reste dessous pour ne pas
        // aplatir la carte.
        boxShadow: on
          ? '0 0 0 1px rgba(var(--o-gold-rgb),.34), 0 0 20px 2px rgba(var(--o-gold-rgb),.18), var(--o-shadow,0 14px 36px rgba(0,0,0,.36))'
          : 'var(--o-shadow,0 14px 36px rgba(0,0,0,.36))',
        // Teinte d'état : au halo s'ajoute un lavis doré sur la surface même.
        ...(on && LAVIS ? { background: `linear-gradient(160deg,rgba(var(--o-gold-rgb),${lav(.13)}),rgba(var(--o-gold-rgb),0) 62%), linear-gradient(180deg,var(--o-surfA),var(--o-surfB))` } : null),
        transition: 'box-shadow .3s ease, background .3s ease',
        cursor: 'pointer', ...stag(idx) }}>
        {/* calque de flash séparé : ne touche ni au transform du tilt ni au box-shadow de la carte */}
        <span ref={flashRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 15, pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{p.icon}</div>
          {canToggle && (
            <span role="switch" aria-checked={on} aria-label={'Lumières ' + p.name} tabIndex={0}
              onClick={e => { e.stopPropagation(); doToggle(); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); doToggle(); } }}
              style={{ width: 38, height: 21, borderRadius: 999, cursor: 'pointer', flexShrink: 0, background: on ? 'linear-gradient(135deg,#ffce73,#f59e0b)' : 'var(--o-s1)', border: 'var(--o-bw,1px) solid ' + (on ? 'transparent' : 'var(--o-bd2)'), transition: 'background .2s' }}>
              <span style={{ display: 'block', position: 'relative', top: 2, left: on ? 18 : 2, width: 15, height: 15, borderRadius: '50%', background: on ? '#fff' : 'var(--o-text3)', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)' }} />
            </span>
          )}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{p.name}</div>
        <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, margin: '2px 0 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lights ? <FlipText text={n > 0 ? (n > 1 ? tr('{n} lampes allumées', { n }) : tr('{n} lampe allumée', { n })) : tr('Tout éteint')} /> : <Skel w={92} h={12} />}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--o-text2)', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', paddingTop: 9 }}>
          <span style={{ color: p.tc, fontSize: 15.5, fontWeight: 800 }}>{p.live ? (p.live.temp != null ? <Num v={p.live.temp} d={1} suffix="°" /> : '—') : <Skel w={40} h={15} />}</span>· {p.live ? (p.live.hum != null ? <Num v={p.live.hum} suffix="%" /> : '—') : <Skel w={28} h={12} />}
          {p.live && p.badge && <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, color: p.bc, background: p.bbg, padding: '2px 8px', borderRadius: 999 }}>{p.badge}</span>}
        </div>
        {cheminTemp && (
          <svg viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block', width: '100%', height: 14, marginTop: 6, opacity: .5 }}>
            <path d={cheminTemp} fill="none" stroke={p.tc || 'var(--o-accent)'} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </div>
    );
  }
  return (
    <div className="o-piece" onClick={onOpen} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen && onOpen(); } }} style={{ ...card, borderRadius: 'var(--o-radius,20px)', padding: 20, boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.36))', cursor: onOpen ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ width: p.box, height: p.box, borderRadius: p.rad, background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{p.icon}</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7 }}>
          {p.status.kind === 'active' && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--o-warn)' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--o-warn)', boxShadow: '0 0 7px rgba(var(--o-warn-rgb),.8)' }} />{p.status.n > 1 ? tr('{n} actifs', { n: p.status.n }) : tr('{n} actif', { n: p.status.n })}</span>}
          {p.status.kind === 'repos' && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--o-text3)' }} />Repos</span>}
          {p.status.kind === 'ext' && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--o-accent-soft)' }}>{tr('Extérieur')}</span>}
          {p.badge && <span className="o-piece-badge-top" style={{ fontSize: 11, fontWeight: 700, color: p.bc, background: p.bbg, padding: '3px 9px', borderRadius: 999 }}>{p.badge}</span>}
        </div>
      </div>
      <div className="o-piece-name" style={{ fontSize: 17, fontWeight: 700, marginTop: 15 }}>{p.name}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
        <span className="o-piece-temp" style={{ fontSize: 28, fontWeight: 800, color: p.tc }}>{p.temp}</span>
        <span style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600 }}>💧 {p.hum}</span>
        {p.badge && <span className="o-piece-badge-inline" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: p.bc, background: p.bbg, padding: '3px 9px', borderRadius: 999 }}>{p.badge}</span>}
      </div>
    </div>
  );
}

// ════════════ POPUP CONFORT PIÈCE (temp / humidité / CO2 + barres dégradées + courbe 24h) ════════════
// Échelles de confort : min/max de la barre, dégradé traffic-light, ticks chiffrés, verdict(valeur).
const COMFORT = {
  temp: {
    key: 'temp', label: tr('Température'), ico: 'thermometer-half', min: 14, max: 30,
    grad: 'linear-gradient(90deg,#ef4444 0%,#f59e0b 11%,#fbbf24 19%,#34d399 33%,#34d399 62%,#fbbf24 75%,#f59e0b 87%,#ef4444 100%)',
    ticks: ['15°', '19°', '24°', '29°'], tickV: [15, 19, 24, 29],
    verdict: v => v < 16 ? { t: 'Trop froid', c: 'var(--o-cold)' } : v < 18 ? { t: 'Frais', c: 'var(--o-accent-soft)' } : v <= 24 ? { t: 'Idéal', c: 'var(--o-ok)' } : v <= 26 ? { t: 'Un peu chaud', c: 'var(--o-warn)' } : v <= 28 ? { t: 'Trop chaud', c: 'var(--o-warn2)' } : { t: 'Très chaud', c: 'var(--o-bad)' },
  },
  hum: {
    key: 'hum', label: tr('Humidité'), ico: 'humidity', min: 20, max: 80,
    grad: 'linear-gradient(90deg,#ef4444 0%,#f59e0b 12%,#fbbf24 22%,#34d399 33%,#34d399 67%,#fbbf24 78%,#f59e0b 88%,#ef4444 100%)',
    ticks: ['30%', '40%', '50%', '60%', '70%'], tickV: [30, 40, 50, 60, 70],
    verdict: v => v < 30 ? { t: 'Trop sec', c: 'var(--o-warn2)' } : v < 40 ? { t: 'Correct', c: 'var(--o-warn)' } : v <= 60 ? { t: 'Bon', c: 'var(--o-ok)' } : v <= 70 ? { t: 'Humide', c: 'var(--o-warn)' } : { t: 'Trop humide', c: 'var(--o-bad)' },
  },
  co2: {
    key: 'co2', label: "Qualité de l'air", ico: 'leaf', min: 400, max: 1600,
    grad: 'linear-gradient(90deg,#34d399 0%,#34d399 33%,#fbbf24 58%,#f59e0b 83%,#ef4444 100%)',
    ticks: ['600', '900', '1200', '1400'], tickV: [600, 900, 1200, 1400],
    verdict: v => v < 800 ? { t: 'Excellent', c: 'var(--o-ok)' } : v < 1000 ? { t: 'Bon', c: 'var(--o-ok)' } : v < 1200 ? { t: 'Moyen', c: 'var(--o-warn)' } : v < 1400 ? { t: 'Élevé', c: 'var(--o-warn2)' } : { t: 'Confiné', c: 'var(--o-bad)' },
  },
};
const cf_pct = (v, m) => Math.max(0, Math.min(100, (v - m.min) / (m.max - m.min) * 100));
const cf_big = (v, m) => m.key === 'temp' ? v.toFixed(1).replace('.', ',') + ' °C' : m.key === 'hum' ? Math.round(v) + ' %' : Math.round(v) + ' ppm';
const cf_tag = (v, m) => m.key === 'temp' ? Math.round(v) + '°C' : m.key === 'hum' ? Math.round(v) + '%' : Math.round(v) + ' ppm';
// Sévérité par couleur de verdict (tokens theme-aware). Trop froid (--o-cold, <16°) = rank 2 → jamais « Sain ».
const cf_rank = { 'var(--o-ok)': 0, 'var(--o-accent-soft)': 1, 'var(--o-cold)': 2, 'var(--o-warn)': 2, 'var(--o-warn2)': 3, 'var(--o-bad)': 4 };

// Barre dégradée + bulle marqueur sur la valeur + ticks (reproduit l'appli air-quality de référence).
function ComfortBar({ m, value }) {
  const pct = cf_pct(value, m);
  return (
    <div>
      <div style={{ position: 'relative', height: 24 }}>
        <div style={{ position: 'absolute', left: `clamp(28px, ${pct}%, calc(100% - 28px))`, bottom: 0, transform: 'translateX(-50%)', transition: 'left .55s cubic-bezier(.23,1,.32,1)', willChange: 'left' }}>
          <span style={{ position: 'relative', display: 'block', background: 'var(--o-text)', color: 'var(--o-bg)', fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 7, whiteSpace: 'nowrap' }}>
            {cf_tag(value, m)}
            <span style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '4px solid var(--o-text)' }} />
          </span>
        </div>
      </div>
      <div style={{ height: 13, borderRadius: 7, background: m.grad, marginTop: 3 }} />
      <div style={{ position: 'relative', height: 15, marginTop: 5 }}>
        {m.ticks.map((t, i) => (
          <span key={t} style={{ position: 'absolute', left: cf_pct(m.tickV[i], m) + '%', transform: 'translateX(-50%)', fontSize: 10.5, fontWeight: 600, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

// Sparkline 24h (SVG, auto-échelle, trait + aire). points = tableau de nombres.
function Sparkline({ points, color }) {
  if (!points || points.length < 2) return null;
  const W = 300, H = 46, pad = 3;
  const lo = Math.min(...points), hi = Math.max(...points), span = (hi - lo) || 1;
  const xs = points.map((_, i) => pad + i / (points.length - 1) * (W - 2 * pad));
  const ys = points.map(v => pad + (1 - (v - lo) / span) * (H - 2 * pad));
  const line = xs.map((x, i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + ys[i].toFixed(1)).join(' ');
  const area = line + ' L' + xs[xs.length - 1].toFixed(1) + ' ' + H + ' L' + xs[0].toFixed(1) + ' ' + H + ' Z';
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none" style={{ width: '100%', height: 46, display: 'block' }}>
      <path className="o-fadein" style={{ animationDelay: '.5s', animationPlayState: PAINT_READY ? 'running' : 'paused' }} d={area} fill={color} opacity=".13" />
      <path className="o-draw" pathLength="1" style={{ animationPlayState: PAINT_READY ? 'running' : 'paused' }} d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}


function RoomComfortModal({ piece, hass, onClose }) {
  const live = piece.live || null;
  const parseNum = (s) => { if (s == null) return null; const n = parseFloat(String(s).replace(',', '.')); return isNaN(n) ? null : n; };
  const vals = {
    temp: live && live.temp != null ? live.temp : parseNum(piece.temp),
    hum: live && live.hum != null ? live.hum : parseNum(piece.hum),
    co2: live && live.co2 != null ? live.co2 : parseNum(piece.badge),
  };
  const ids = { temp: live && live.tempId, hum: live && live.humId, co2: live && live.co2Id };
  const metrics = [COMFORT.temp, COMFORT.hum, COMFORT.co2].filter(m => vals[m.key] != null);
  const verdicts = metrics.map(m => ({ m, vd: m.verdict(vals[m.key]) }));
  const worst = verdicts.reduce((a, b) => (cf_rank[b.vd.c] || 0) > (cf_rank[a.vd.c] || 0) ? b : a, verdicts[0]);
  const overall = !verdicts.length ? { t: '—', c: 'var(--o-text2)' }
    : (cf_rank[worst.vd.c] >= 3 ? { t: tr('À surveiller'), c: 'var(--o-warn2)' } : cf_rank[worst.vd.c] === 2 ? { t: 'Acceptable', c: 'var(--o-warn)' } : { t: 'Sain', c: 'var(--o-ok)' });
  const advice = !verdicts.length ? 'Aucune donnée capteur pour cette pièce.'
    : (cf_rank[worst.vd.c] <= 1 ? 'Conditions idéales dans cette pièce.'
      : worst.m.key === 'co2' ? "Niveau de CO2 élevé, pensez à aérer la pièce."
        : worst.m.key === 'temp' ? (vals.temp > 24 ? 'Il fait chaud, pensez à ventiler ou rafraîchir.' : 'Il fait frais, un peu de chauffage ?')
          : (vals.hum > 60 ? 'Air humide, aérez pour assainir.' : 'Air un peu sec, pensez à humidifier.'));

  const [hist, setHist] = useState({});
  const [histState, setHistState] = useState('loading');
  useEffect(() => {
    let alive = true;
    const list = metrics.map(m => ({ k: m.key, id: ids[m.key] })).filter(x => x.id);
    if (!hass || !hass.callApi || !list.length) { setHistState('none'); return; }
    const start = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    Promise.all(list.map(x =>
      hass.callApi('GET', 'history/period/' + start + '?filter_entity_id=' + encodeURIComponent(x.id) + '&minimal_response&no_attributes')
        .then(res => ({ k: x.k, arr: (res && res[0]) ? res[0] : [] }))
        .catch(() => ({ k: x.k, arr: [] }))
    )).then(results => {
      if (!alive) return;
      const map = {};
      results.forEach(r => { const pts = r.arr.map(s => parseFloat(s.state)).filter(v => !isNaN(v)); if (pts.length >= 2) map[r.k] = pts; });
      setHist(map);
      setHistState(Object.keys(map).length ? 'done' : 'none');
    }).catch(() => { if (alive) setHistState('error'); });
    return () => { alive = false; };
  }, [piece.name]);

  return (
    <BottomSheet onClose={onClose}>
      {close => (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={close} aria-label={tr('Fermer')} title={tr('Fermer')} style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--o-s1)', border: 'none', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: piece.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{piece.icon}</span>
          <span style={{ flex: 1, fontSize: 19, fontWeight: 700, color: 'var(--o-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{piece.name}</span>
        </div>
        <div style={{ textAlign: 'center', margin: '16px 0 2px' }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: overall.c, letterSpacing: '-.01em' }}>{overall.t}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6, lineHeight: 1.45, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>{advice}</div>
        </div>
        {!metrics.length
          ? <div style={{ padding: '28px 0 10px', textAlign: 'center', fontSize: 13, color: 'var(--o-text3)', fontWeight: 600 }}>{tr('Pas de capteur configuré pour cette pièce.')}</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
              {metrics.map(m => { const v = vals[m.key], vd = m.verdict(v); return (
                <div key={m.key} style={{ background: 'var(--o-s3)', border: 'var(--o-bw,1px) solid var(--o-bd3)', borderRadius: 16, padding: '15px 16px 13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 16 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hx(vd.c, .16), color: vd.c }}><Fi i={m.ico} size={16} /></span>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--o-text)' }}>{m.label}</span>
                    <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--o-text)' }}>{cf_big(v, m)}</span>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: vd.c, marginTop: 1 }}>{vd.t}</span>
                    </span>
                  </div>
                  <ComfortBar m={m} value={v} />
                  <div style={{ marginTop: 14 }}>
                    {histState === 'loading'
                      ? <div style={{ height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, color: 'var(--o-text3)', fontWeight: 600 }}>Chargement de l'historique…</div>
                      : hist[m.key]
                        ? <><Sparkline points={hist[m.key]} color={vd.c} /><div style={{ fontSize: 10.5, color: 'var(--o-text3)', fontWeight: 600, marginTop: 3 }}>24 dernières heures</div></>
                        : <div style={{ height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--o-text3)', fontWeight: 600 }}>Historique indisponible</div>}
                  </div>
                </div>
              ); })}
            </div>}
      </>)}
    </BottomSheet>
  );
}

// Conseils météo pour la tuile Extérieur (pas de "verdict à surveiller" — on ne contrôle pas le dehors).
function outdoorTips(mode, temp, wind, isNight, rainProb) {
  const T = [];
  if (mode === 'rain') T.push(['raindrops', 'var(--o-cyan)', 'Pluie prévue, prends un parapluie']);
  else if (rainProb != null && rainProb >= 50) T.push(['raindrops', 'var(--o-cyan)', 'Risque de pluie (' + rainProb + ' %), parapluie conseillé']);
  if (mode === 'storm') T.push(['bolt', 'var(--o-purple)', 'Orage, limite les sorties']);
  if (mode === 'snow') T.push(['snowflake', '#bcd6f0', 'Neige, prudence sur la route']);
  if (temp != null) {
    if (temp <= 2) T.push(['snowflake', '#60a5fa', 'Risque de gel, couvre-toi bien']);
    else if (temp < 10) T.push(['thermometer-half', '#38bdf8', 'Frais dehors, prends une veste']);
    else if (temp >= 30) T.push(['humidity', '#ff8a4c', 'Forte chaleur, pense à t’hydrater']);
    else if (temp >= 25) T.push(['sun', '#ffce73', 'Il fait chaud, vêtements légers conseillés']);
  }
  if ((mode === 'sun' || mode === 'partly') && !isNight && temp != null && temp >= 22) T.push(['sun', 'var(--o-gold)', 'Grand soleil, crème solaire et lunettes']);
  if (wind != null && wind >= 30) T.push(['wind', '#9fb4d6', 'Vent fort (' + Math.round(wind) + ' km/h), sois prudent']);
  if (isNight) T.push(['moon-stars', '#aeb9e0', 'Nuit tombée, pense à l’éclairage extérieur']);
  if (!T.length) T.push(['sun', '#34d399', 'Conditions agréables, profite du dehors']);
  return T;
}

function OutdoorModal({ piece, hass, mode, label, weatherTemp, sunset, onClose }) {
  const live = piece.live || null;
  const parseNum = (s) => { if (s == null) return null; const n = parseFloat(String(s).replace(',', '.')); return isNaN(n) ? null : n; };
  const temp = live && live.temp != null ? live.temp : (weatherTemp != null ? weatherTemp : parseNum(piece.temp));
  const hum = live && live.hum != null ? live.hum : parseNum(piece.hum);
  const wId = weatherEntity(hass);
  const wa = (wId && hass && hass.states && hass.states[wId] && hass.states[wId].attributes) || {};
  const wind = wa.wind_speed != null ? wa.wind_speed : null;
  // L'attribut weather.forecast n'existe plus (HA ≥2024.3) → prévision via le service get_forecasts.
  const [rainProb, setRainProb] = useState(null);
  useEffect(() => {
    let alive = true;
    // wId est null tant que la découverte n'a pas répondu : on rejoue l'appel
    // quand l'entité météo est connue, d'où sa présence dans les dépendances.
    if (!hass || !hass.callWS || !wId) return;
    hass.callWS({ type: 'call_service', domain: 'weather', service: 'get_forecasts', target: { entity_id: wId }, service_data: { type: 'hourly' }, return_response: true })
      .then(r => {
        if (!alive) return;
        const resp = r && (r.response || r); const ent = resp && resp[wId];
        const fc = ent && Array.isArray(ent.forecast) && ent.forecast.length ? ent.forecast[0] : null;
        if (fc && fc.precipitation_probability != null) setRainProb(Math.round(fc.precipitation_probability));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [piece.name, wId]);
  const isNight = mode === 'night';
  const tips = outdoorTips(mode, temp, wind, isNight, rainProb);

  const [pts, setPts] = useState(null);
  const [hs, setHs] = useState('loading');
  useEffect(() => {
    let alive = true; const id = live && live.tempId;
    if (!hass || !hass.callApi || !id) { setHs('none'); return; }
    const start = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    hass.callApi('GET', 'history/period/' + start + '?filter_entity_id=' + encodeURIComponent(id) + '&minimal_response&no_attributes')
      .then(res => { if (!alive) return; const arr = (res && res[0]) ? res[0] : []; const p = arr.map(s => parseFloat(s.state)).filter(v => !isNaN(v)); if (p.length >= 2) { setPts(p); setHs('done'); } else setHs('none'); })
      .catch(() => { if (alive) setHs('error'); });
    return () => { alive = false; };
  }, [piece.name]);

  const chip = (ico, val) => val == null ? null : (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--o-s3)', border: 'var(--o-bw,1px) solid var(--o-bd3)', borderRadius: 12, padding: '9px 13px' }}>
      <Fi i={ico} size={15} color="var(--o-text2)" /><span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--o-text)' }}>{val}</span>
    </div>
  );
  const hd = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)' };

  return (
    <BottomSheet onClose={onClose}>
      {close => (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={close} aria-label={tr('Fermer')} title={tr('Fermer')} style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--o-s1)', border: 'none', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: piece.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{piece.icon}</span>
          <span style={{ flex: 1, fontSize: 19, fontWeight: 700, color: 'var(--o-text)' }}>{tr('Extérieur')}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '8px 0 2px' }}>
          <WeatherIco wx={mode || 'clouds'} size={64} />
          <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-.02em', marginTop: 4, color: 'var(--o-text)' }}>{temp != null ? Math.round(temp) : '—'}<span style={{ fontSize: 22, fontWeight: 600, opacity: .8 }}>°C</span></div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--o-text2)' }}>{label || '—'}</div>
        </div>
        <div style={{ display: 'flex', gap: 9, justifyContent: 'center', flexWrap: 'wrap', margin: '14px 0 4px' }}>
          {chip('humidity', hum != null ? Math.round(hum) + ' %' : null)}
          {chip('wind', wind != null ? Math.round(wind) + ' km/h' : null)}
          {chip('sunset', sunset ? 'Coucher ' + sunset : null)}
        </div>
        <div style={{ ...hd, margin: '18px 0 10px' }}>RECOMMANDATIONS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {tips.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--o-s3)', border: 'var(--o-bw,1px) solid var(--o-bd3)', borderRadius: 14, padding: '13px 15px' }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hx(t[1], .16), color: t[1] }}><Fi i={t[0]} size={16} /></span>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--o-text)', lineHeight: 1.35 }}>{t[2]}</span>
            </div>
          ))}
        </div>
        {hs === 'done' && pts && (
          <div style={{ marginTop: 20 }}>
            <div style={{ ...hd, marginBottom: 8 }}>{tr('TEMPÉRATURE · 24 H')}</div>
            <Sparkline points={pts} color="var(--o-accent-soft)" />
          </div>
        )}
      </>)}
    </BottomSheet>
  );
}

/* ════════════ VUE PIÈCE (navigable depuis l'Accueil) ════════════
   Rassemble les appareils d'une pièce en matchant le nom de la pièce dans l'entity_id / friendly_name.
   Une pièce plus spécifique gagne : « Chambre enfant » n'atterrit pas dans « Chambre ». */
const rmNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Cartes masquées par l'utilisateur (croix en mode édition), persistées.
const roomHidden = () => { const v = readLS('loggia_roomhidden', []); return Array.isArray(v) ? v : []; };

/**
 * Agencement d'une piece : ce que l'utilisateur a retire, ajoute, reordonne.
 *
 * La decouverte propose, l'utilisateur dispose. Sans agencement enregistre, une
 * piece affiche exactement ce que la decouverte a trouve — c'est le cas d'une
 * installation neuve, et cela doit le rester apres une remise a zero.
 */
// Agencements, indexes par perimetre. Les pieces en ont un par nom de piece,
// la vue Objets un seul — meme forme, meme code.
function layoutsOf(cfgKey) {
  const v = cfgVal(cfgKey, null);
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}
function layoutOf(cfgKey, scope) {
  const l = layoutsOf(cfgKey)[scope];
  return (l && typeof l === 'object') ? l : {};
}
function setLayout(cfgKey, scope, patch) {
  const all = { ...layoutsOf(cfgKey) };
  const cur = { ...(all[scope] || {}) };
  Object.keys(patch).forEach(k => { if (patch[k] == null) delete cur[k]; else cur[k] = patch[k]; });
  if (!Object.keys(cur).length) delete all[scope];
  else all[scope] = cur;
  cfgSet({ [cfgKey]: Object.keys(all).length ? all : null });
  return all;
}

const ROOM_LAYOUT_KEY = 'loggia_roomlayout';
const roomLayoutOf = (roomName) => layoutOf(ROOM_LAYOUT_KEY, roomName);
const setRoomLayout = (roomName, patch) => setLayout(ROOM_LAYOUT_KEY, roomName, patch);

/** Nom choisi pour un element dans ce perimetre, ou null. */
function labelIn(layout, id) {
  const v = layout && layout.labels && layout.labels[id];
  return (typeof v === 'string' && v.trim()) ? v : null;
}
const roomLabelOf = (roomName, id) => labelIn(roomLayoutOf(roomName), id);

/** Applique un agencement a la liste proposee par la decouverte. */
function applyLayout(L, derived) {
  const removed = L.removed || [];
  const ids = derived.filter(id => removed.indexOf(id) < 0);
  (L.added || []).forEach(id => { if (removed.indexOf(id) < 0 && ids.indexOf(id) < 0) ids.push(id); });
  const order = L.order || [];
  if (!order.length) return ids;
  // Ce qui n'a pas de rang connu passe apres, sans changer d'ordre entre eux :
  // un appareil apparu depuis ne vient pas se glisser au milieu.
  const rang = (id) => { const i = order.indexOf(id); return i < 0 ? order.length + ids.indexOf(id) : i; };
  return ids.slice().sort((a, b) => rang(a) - rang(b));
}
const applyRoomLayout = (roomName, derived) => applyLayout(roomLayoutOf(roomName), derived);
// Les appareils d'une pièce viennent des CONFIGS d'Loggia (lumières découvertes, zones climat, volets, médias) :
// ça écarte d'office le bruit HA (LED d'équipement, *_announcement, communications, prises techniques…).
/** Ce que la decouverte propose pour une piece, avant tout agencement. */
function roomEntitiesBrutes(hass, roomName) {
  if (!hass || !hass.states) return [];
  const target = rmNorm(roomName);
  const hidden = roomHidden();
  const out = [];
  // 1) éclairages — ordre voulu : plafonnier, lampadaire, puis ampoules/rubans (comme la vue Lumières)
  const LT_ORDER = { plafonnier: 0, lampadaire: 1, ampoule: 2, veilleuse: 3 };
  try {
    discoverLights(hass).filter(l => rmNorm(l.room) === target)
      .sort((a, b) => (LT_ORDER[lightType(a)] - LT_ORDER[lightType(b)]) || a.name.localeCompare(b.name))
      .forEach(l => out.push(l.id));
  } catch (e) {}
  // 2) chauffage : toutes les zones de la pièce — poêle (climate.*) ET radiateurs fil pilote (switch + input_*),
  //    ces derniers référencés par « zone:<id> » car ils n'ont pas d'entité climate unique.
  climateZones(hass && hass.states).filter(z => rmNorm(z.room) === target).forEach(z => {
    if (estClimate(z) && z.haid && hass.states[z.haid]) out.push(z.haid);
    else if (hass.states[z.haid] || hass.states[z.tempCible]) out.push('zone:' + z.id);
  });
  // 3) volets (mappés par leur nom de config, ex. « Volet Séjour » → cover.volet_salon)
  voletCovers(hass.states).filter(c => rmNorm(c.name).indexOf(target) >= 0 && hass.states[c.haid]).forEach(c => out.push(c.haid));
  // 4) médias (lecteurs configurés dont le nom porte la pièce)
  medPlayers().filter(p => rmNorm(p.name).indexOf(target) >= 0 && hass.states[p.haid]).forEach(p => out.push(p.haid));
  return out.filter((id, i) => out.indexOf(id) === i && hidden.indexOf(id) < 0);
}

// Facade pour les appelants qui veulent la liste telle qu'elle s'affiche. La
// vue Piece, elle, passe par l'editeur : il applique l'agencement lui-meme, et
// le faire deux fois donnerait un ordre incoherent.
const roomEntities = (hass, roomName) => applyRoomLayout(roomName, roomEntitiesBrutes(hass, roomName));

/* Cartes de la vue Pièce — style Loggia, format de la maquette : tuiles de même hauteur,
   une seule grille, actions au pied de carte. Autonomes : pilotent une entité par son id. */
const RM_CARD = { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 172, padding: 16, borderRadius: 'var(--o-radius,20px)', background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', boxShadow: 'var(--o-shadow,0 6px 16px rgba(0,0,0,.26))', transition: 'all .3s' };
const RM_ICO = (bg, col) => ({ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, color: col });
const RM_BTN = { flex: 1, padding: '9px 6px', borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 12, cursor: 'pointer' };
const RM_NAME = { fontSize: 14.5, fontWeight: 700, color: 'var(--o-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const RM_SUB = { fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

function RoomLightCard({ id, hass, onOpen, label = null }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const modes = a.supported_color_modes || [];
  const rgb = modes.some(m => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].indexOf(m) >= 0);
  const ct = modes.indexOf('color_temp') >= 0;
  const dimmable = rgb || ct || modes.indexOf('brightness') >= 0 || a.brightness != null;
  const isSwitch = id.indexOf('switch.') === 0;
  const realOn = st ? st.state === 'on' : false;
  const [ov, setOv] = useState(null);
  useEffect(() => { setOv(null); }, [realOn]);
  const on = ov != null ? ov : realOn;
  const bri = a.brightness != null ? Math.round(a.brightness / 255 * 100) : 100;
  const color = a.rgb_color ? '#' + a.rgb_color.map(v => v.toString(16).padStart(2, '0')).join('') : null;
  // Une prise n'est pas une lumière : pas d'or ni d'ampoule pour un switch hors interrupteurs-lumières.
  const prise = isSwitch && !cvEstLumiere(id);
  const mort = !st || st.state === 'unavailable';
  const accent = prise ? 'var(--o-accent)' : (rgb && color) ? color : '#FFCC44';
  const ltype = lightType({ id, name: (a.friendly_name || id), rgb, ct });
  const adjustable = !isSwitch && dimmable;
  const [flashRef, flash] = useFlash();
  // Filet : si HA n'a pas confirmé sous 6 s (commande rejetée), retour à l'état réel au lieu de rester désynchronisé
  const ovRevertRef = useRef(0);
  useEffect(() => () => clearTimeout(ovRevertRef.current), []);
  const toggle = (e) => { e.stopPropagation(); flash(accent); setOv(!on); clearTimeout(ovRevertRef.current); ovRevertRef.current = setTimeout(() => setOv(null), 6000); try { if (hass && hass.callService) hass.callService('homeassistant', on ? 'turn_off' : 'turn_on', { entity_id: id }); } catch (er) {} };
  return (
    <button ref={flashRef} className={'o-light-card o-rmcard' + (mort ? ' o-panne' : '')} onClick={() => { if (adjustable && onOpen) onOpen({ id, name: a.friendly_name || id, on, bri, color, rgb, ct, dimmable, lc: st && st.last_changed }); }}
      style={{ ...RM_CARD, alignItems: 'stretch', textAlign: 'left', width: '100%', cursor: adjustable ? 'pointer' : 'default', overflow: 'hidden',
        // Le lavis est une COUCHE posée sur la surface, jamais la surface elle-même :
        // sinon le bas de carte restait un alpha .22 sur le fond de page — faux-transparent
        // en mode opaque, et un rendu différent d'un matériau à l'autre (retour user 29/08).
        background: on && LAVIS ? `linear-gradient(180deg,transparent 28%,${hx(accent, lav(.22))}), linear-gradient(180deg,var(--o-surfA),var(--o-surfB))` : 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))',
        border: on && LAVIS ? `1px solid ${hx(accent, lav(.3))}` : 'var(--o-bw,1px) solid var(--o-bd2)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={{ ...RM_ICO(on ? hx(accent, .3) : 'var(--o-s1)', on ? accent : 'var(--o-text3)'), boxShadow: on ? `0 0 ${Math.round(6 + bri * 0.22)}px ${Math.round(bri * 0.05)}px ${hx(accent, 0.18 + bri * 0.004)}` : 'none', transition: 'box-shadow .6s ease' }}>{prise ? <PlugIcon size={19} /> : <LightIcon type={ltype} size={19} />}</span>
        <span role="switch" aria-checked={on} tabIndex={0} aria-label={(on ? 'Éteindre ' : 'Allumer ') + (label || a.friendly_name || id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }} onClick={toggle} style={{ width: 46, height: 26, borderRadius: 13, background: on ? '#FF2D78' : 'rgba(150,162,184,.2)', position: 'relative', cursor: 'pointer', flexShrink: 0, display: 'inline-block', transition: 'background .25s' }}><span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,.35)', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)' }} /></span>
      </div>
      <div>
        <div style={RM_NAME}>{label || a.friendly_name || id}</div>
        <div style={{ ...RM_SUB, color: on ? (prise ? 'var(--o-accent-soft)' : 'var(--o-warn)') : 'var(--o-text3)' }}>{on ? (adjustable ? tr('{n} % de luminosité', { n: bri }) : tr('Allumé')) : tr('Éteint')}</div>
        {adjustable && <div style={{ height: 3, borderRadius: 2, background: 'var(--o-bd1)', marginTop: 10, overflow: 'hidden' }}><div style={{ height: '100%', width: (on ? bri : 0) + '%', background: accent, borderRadius: 2, transition: 'width .3s' }} /></div>}
      </div>
    </button>
  );
}

function RoomCoverCard({ id, hass, onOpen, titre = null }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const realPos = a.current_position != null ? Math.round(a.current_position) : (st && st.state === 'open' ? 100 : 0);
  const [ov, setOv] = useState(null);
  useEffect(() => { setOv(null); }, [realPos]);
  const pos = ov != null ? ov : realPos;
  const call = (svc, data) => { try { if (hass && hass.callService) hass.callService('cover', svc, { entity_id: id, ...(data || {}) }); } catch (e) {} };
  const label = pos === 0 ? tr('Fermé') : pos === 100 ? tr('Ouvert') : tr('Ouvert à {n} %', { n: pos });
  const mort = !st || st.state === 'unavailable';
  const drag = (e) => {
    e.preventDefault();
    const el = e.currentTarget, fill = el.querySelector('[data-fill]'), kn = el.querySelector('[data-knob]'), r = el.getBoundingClientRect();
    const calc = x => Math.max(0, Math.min(100, Math.round((x - r.left) / r.width * 100)));
    let v = calc(e.clientX);
    const paint = () => { if (fill) { fill.style.transition = 'none'; fill.style.width = v + '%'; } if (kn) { kn.style.transition = 'none'; kn.style.left = `calc(${v}% - 8px)`; } };
    paint(); el.classList.add('o-sliding'); try { el.setPointerCapture(e.pointerId); } catch (er) {}
    el.onpointermove = ev => { v = calc(ev.clientX); paint(); };
    const end = () => { el.classList.remove('o-sliding'); el.onpointermove = null; el.onpointerup = null; el.onpointercancel = null; if (fill) fill.style.transition = ''; if (kn) kn.style.transition = ''; };
    el.onpointerup = () => { end(); setOv(v); commander(hass, id, 'set_position', v); };
    el.onpointercancel = () => { end(); if (fill) fill.style.width = pos + '%'; };
  };
  return (
    <div className={'o-rmcard' + (mort ? ' o-panne' : '')} role="button" tabIndex={onOpen ? 0 : -1} aria-label={'Ouvrir ' + (titre || a.friendly_name || id)} onKeyDown={(e) => { if (onOpen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(id); } }} onClick={() => onOpen && onOpen(id)} style={{ ...RM_CARD, cursor: onOpen ? 'pointer' : 'default',
      // Teinte d'état : volet ouvert = lavis VIOLET, gradué par la position — le bleu accent restait trop proche des autres cartes.
      ...(pos > 0 && LAVIS ? {
        background: `linear-gradient(180deg,transparent 28%,rgba(var(--o-purple-rgb),${lav(.10 + pos * .0012)})), linear-gradient(180deg,var(--o-surfA),var(--o-surfB))`,
        border: `1px solid rgba(var(--o-purple-rgb),${lav(.26)})`,
      } : null) }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={{ ...RM_ICO(pos > 0 ? 'rgba(var(--o-purple-rgb),.16)' : 'var(--o-s1)', pos > 0 ? 'var(--o-purple)' : 'var(--o-text3)'), position: 'relative', overflow: 'hidden' }}>
          {/* store qui descend dans le chip : hauteur = part fermée, suit la position en douceur */}
          <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: (100 - pos) + '%', background: 'linear-gradient(180deg,rgba(var(--o-purple-rgb),.34),rgba(var(--o-purple-rgb),.14))', transition: REDUCE_MOTION ? 'none' : 'height .7s cubic-bezier(.22,.61,.36,1)', pointerEvents: 'none' }} />
          <Ico name="blinds" size={18} /></span>
        <span style={{ fontSize: 15, fontWeight: 800, color: pos === 0 ? 'var(--o-text3)' : 'var(--o-text)' }}>{pos}%</span>
      </div>
      <div>
        <div style={RM_NAME}>{titre || a.friendly_name || id}</div>
        <div style={RM_SUB}>{label}</div>
        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => { e.stopPropagation(); drag(e); }} {...kbSlider('Position ' + (a.friendly_name || id), pos, (nv) => { setOv(nv); commander(hass, id, 'set_position', nv); })} style={{ padding: '10px 0 12px', cursor: 'pointer', touchAction: 'none' }}>
          <div style={{ position: 'relative', height: 6, borderRadius: 4, background: 'var(--o-bd1)' }}>
            <div data-fill style={{ position: 'absolute', inset: '0 auto 0 0', width: pos + '%', background: 'linear-gradient(90deg,var(--o-purple),rgba(var(--o-purple-rgb),.6))', borderRadius: 4, transition: 'width .25s' }} />
            <span data-knob style={{ position: 'absolute', top: '50%', left: `calc(${pos}% - 8px)`, transform: 'translateY(-50%)', width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,.4)', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)' }} />
          </div>
        </div>
        {/* Les mêmes trois gestes que la carte compacte : ouvrir, stop, fermer — le slider règle le reste. */}
        <div style={{ display: 'flex', gap: 7 }}>
          <button aria-label={tr('Ouvrir')} title={tr('Ouvrir')} onClick={(e) => { e.stopPropagation(); setOv(100); commander(hass, id, 'open'); }} className="o-rmbtn" style={{ ...RM_BTN, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i="angle-up" size={14} /></button>
          <button aria-label={tr('Stop')} title={tr('Stop')} onClick={(e) => { e.stopPropagation(); call('stop_cover'); }} className="o-rmbtn" style={{ ...RM_BTN, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i="square" size={12} /></button>
          <button aria-label={tr('Fermer')} title={tr('Fermer')} onClick={(e) => { e.stopPropagation(); setOv(0); commander(hass, id, 'close'); }} className="o-rmbtn" style={{ ...RM_BTN, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i="angle-down" size={14} /></button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Le pont vers le moteur d'actions.
//
// `hass` porte a la fois les etats et la liste des services : de quoi bâtir le
// contexte que le moteur attend, partout ou une vue a deja `hass` sous la main.
// ─────────────────────────────────────────────────────────────────────────────

/** Le contexte du moteur d'actions, depuis le pont Home Assistant. */
function actionCtx(h) {
  const hs = h || getHass();
  return { states: (hs && hs.states) || {}, services: (hs && hs.services) || null };
}

/**
 * L'entite accepte-t-elle cette capacite ?
 *
 * Sert a ne PAS dessiner un bouton inerte. Home Assistant refuse explicitement
 * un service qu'une entite ne declare pas — « does not support action » — donc
 * un bouton de pause sur une enceinte qui n'a pas le bit PAUSE ne fait rien
 * d'autre que promettre. Mieux vaut ne rien montrer que montrer un mensonge.
 *
 * On interroge la CAPACITE seule, sans valeur : une commande a liste comme le
 * choix d'un mode serait refusee faute de valeur d'essai, alors qu'elle est
 * bien offerte.
 */
function peut(hass, id, capability) {
  if (!id) return false;
  const ctx = actionCtx(hass);
  return entityCaps(id, ctx.states[id], ctx.services).can.has(capability);
}

/**
 * Commande une entite par sa CAPACITE, et rend la valeur reellement envoyee.
 *
 * Elle peut differer de celle demandee : les bornes appartiennent a l'entite,
 * et une consigne de 34° passe sur une climatisation qui monte a 35 mais serait
 * ramenee a 24 sur un plancher chauffant. L'interface affiche donc ce qui a ete
 * envoye, jamais ce qui a ete demande.
 *
 * Rend `null` si l'entite ne declare pas la capacite — la vue ne doit alors
 * afficher aucun changement, puisqu'il n'y en aura pas.
 */
function commander(hass, id, capability, value, champ) {
  const ctx = actionCtx(hass);
  const p = planAction(id, capability, value, ctx);
  if (!p.ok) return null;
  /* `runPlan` attrape le rejet pour pouvoir en donner la raison — et l'echec
   * s'arretait la. L'ecoute globale des rejets, seul canal d'erreur visible du
   * dashboard, ne voyait donc jamais passer une commande refusee : le toast
   * « Commande non executee » ne pouvait pas se declencher pour les cinquante et
   * quelques appels qui passent par ici.
   *
   * Le mensonge durait : une carte de volet peint la position demandee, puis
   * attend que l'etat reel bouge pour se recaler. Refusee, la commande ne fait
   * bouger personne, et la carte reste sur une position que rien n'a atteinte.
   *
   * On relance donc le rejet, sans le traiter, pour que l'ecoute s'en saisisse.
   * `code` le fait passer le filtre de l'ecouteur. */
  runPlan(hass, p).then((r) => {
    if (r && r.ok) return;
    const motif = (r && r.reason) ? String(r.reason) : 'service';
    Promise.reject(Object.assign(new Error(motif), { code: 'service_error' }));
  });
  return champ ? p.data[champ] : (p.data || {});
}

// Thermostat compact (maquette) : badge de mode, grande consigne, actuel, − / +.
// Bornes de REPLI seulement : une entite qui publie les siennes fait foi, et
// c'est `planAction` qui les applique. Elles ne servent qu'a dessiner une jauge
// avant meme d'avoir lu l'entite.
const RM_TMIN = 5, RM_TMAX = 30;
function RoomClimateCard({ id, hass, onOpen, label = null }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const realTarget = a.temperature != null ? a.temperature : 20;
  const [ov, setOv] = useState(null);
  useEffect(() => { setOv(null); }, [realTarget, st && st.state]);
  const target = ov != null ? ov : realTarget;
  const cur = a.current_temperature;
  const mode = st ? st.state : 'off';
  const off = mode === 'off';
  const heating = a.hvac_action === 'heating';
  const mort = !st || st.state === 'unavailable';
  const MODE_FR = { off: tr('ARRÊT'), heat: tr('CONFORT'), cool: tr('FROID'), auto: 'AUTO', heat_cool: 'AUTO', dry: tr('SEC'), fan_only: tr('VENTIL') };
  const all = a.hvac_modes || ['off', 'heat'];
  const call = (svc, data) => { try { if (hass && hass.callService) hass.callService('climate', svc, { entity_id: id, ...(data || {}) }); } catch (e) {} };
  // Les bornes viennent de l'entite, pas d'une constante : la climatisation de
  // l'installation d'essai monte a 35, la ou le code plafonnait a 30. Le pas
  // aussi lui appartient. On affiche ce qui a ete envoye, pas ce qui a ete
  // demande — sinon la consigne affichee mentirait des qu'elle est bornee.
  const setT = (d) => { const v = commander(hass, id, 'set_temperature', target + d, 'temperature'); if (v != null) setOv(v); };
  const nextMode = () => { const i = all.indexOf(mode); commander(hass, id, 'set_hvac_mode', all[(i + 1) % all.length]); };
  return (
    <div className={'o-rmcard' + (mort ? ' o-panne' : '')} role="button" tabIndex={onOpen ? 0 : -1} aria-label={'Ouvrir ' + (label || a.friendly_name || id)} onKeyDown={(e) => { if (onOpen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(id); } }} onClick={() => onOpen && onOpen(id)} style={{ ...RM_CARD, cursor: onOpen ? 'pointer' : 'default',
      // Teinte d'état : la carte rougeoie pendant la chauffe, pas au simple mode.
      ...(heating && LAVIS ? {
        background: `linear-gradient(180deg,transparent 28%,rgba(var(--o-warn2-rgb),${lav(.16)})), linear-gradient(180deg,var(--o-surfA),var(--o-surfB))`,
        border: `1px solid rgba(var(--o-warn2-rgb),${lav(.28)})`,
      } : null) }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={RM_ICO(off ? 'var(--o-s1)' : 'rgba(var(--o-warn2-rgb),.16)', off ? 'var(--o-text3)' : heating ? 'var(--o-warn2)' : '#ff8a4c')}><Fi i="thermometer-half" size={17} /></span>
        <button onClick={(e) => { e.stopPropagation(); nextMode(); }} title="Changer de mode" style={{ padding: '5px 11px', borderRadius: 999, fontSize: 10, fontWeight: 800, letterSpacing: '.05em', cursor: 'pointer', border: 'var(--o-bw,1px) solid ' + (off ? 'var(--o-bd2)' : 'rgba(var(--o-warn2-rgb),.3)'), background: off ? 'var(--o-s1)' : 'rgba(var(--o-warn2-rgb),.14)', color: off ? 'var(--o-text3)' : 'var(--o-warn2)' }}>{tr(MODE_FR[mode]) || String(mode).toUpperCase()}</button>
      </div>
      <div>
        <div className="o-rmbig" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', color: off ? 'var(--o-text3)' : 'var(--o-text)', lineHeight: 1.1 }}>{target}<span style={{ fontSize: 20 }}>°</span></div>
        <div style={RM_SUB}>{label || a.friendly_name || id}{cur != null ? ' · ' + tr('actuel {n}°', { n: cur }) : ''}</div>
        <div style={{ display: 'flex', gap: 7, marginTop: 11 }}>
          <button onClick={(e) => { e.stopPropagation(); setT(-0.5); }} className="o-rmbtn" style={{ ...RM_BTN, fontSize: 17, padding: '7px 6px' }}>−</button>
          <button onClick={(e) => { e.stopPropagation(); setT(0.5); }} className="o-rmbtn" style={{ ...RM_BTN, fontSize: 17, padding: '7px 6px' }}>+</button>
        </div>
      </div>
    </div>
  );
}

// Radiateur fil pilote (chambres) : consigne = input_number, mode = input_select, auto = input_boolean.
/* Les modes d'un radiateur fil pilote sont LUS SUR SON ENTITE.
 *
 * Ils etaient ecrits en dur — « Confort », « Eco », « Hors-Gel », « Arret » —
 * c'est-a-dire les options de l'`input_select` d'UNE installation. Chez
 * quelqu'un qui aurait nomme les siennes « Comfort » ou « Frost », le bouton
 * envoyait une option inexistante : Home Assistant refusait, sans rien dire.
 *
 * `attributes.options` porte la liste reelle. On l'envoie telle quelle. */
function pilotOptions(S, modeEnt) {
  const st = S && modeEnt && S[modeEnt];
  const o = st && st.attributes && st.attributes.options;
  return Array.isArray(o) ? o.filter(x => typeof x === 'string' && x) : [];
}

/** Les modes d'une zone, quelle que soit sa famille.
 *
 * Un vrai thermostat porte ses modes dans `hvac_modes` — c'est l'equivalent
 * standard des options d'un `input_select`. Les avoir oublies avait vide la
 * barre de modes du poele : il ne restait plus que la consigne. */
function zoneModes(S, zone) {
  if (!zone) return [];
  if (estClimate(zone)) {
    const st = S && S[zone.haid];
    const m = st && st.attributes && st.attributes.hvac_modes;
    return Array.isArray(m) ? m.filter(x => typeof x === 'string' && x) : [];
  }
  return pilotOptions(S, zone.modeEnt);
}

/** Un `climate` se pilote par ses modes HVAC ; le reste par son `input_select`. */
function estClimate(zone) {
  return !!zone && (zone.type === 'thermostat' || zone.type === 'stove'
    || String(zone.haid || '').indexOf('climate.') === 0);
}

/** Le mot affiche pour un mode. Home Assistant traduit les modes HVAC dans
 * toutes ses langues ; les options d'un `input_select` sont deja des mots
 * choisis par l'utilisateur, on ne les touche pas. */
function zoneModeLabel(zone, mode) {
  if (!estClimate(zone)) return mode;
  return trHA('component.climate.entity_component._.state.' + mode) || mode;
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
function RoomPilotCard({ zone, hass, onOpen, titre = null }) {
  const S = (hass && hass.states) || null;
  const z = readZone(S, zone);
  const [ov, setOv] = useState(null);
  useEffect(() => { setOv(null); }, [z.target, z.mode]);
  const target = ov != null ? ov : (z.target != null ? z.target : 19);
  const off = z.mode === 'off';
  const heating = !off && z.current != null && z.current < target;
  const call = (d, s, data) => { try { if (hass && hass.callService) hass.callService(d, s, data || {}); } catch (e) {} };
  const setT = (d) => { const v = Math.max(5, Math.min(30, Math.round((target + d) * 2) / 2)); setOv(v); call('input_number', 'set_value', { entity_id: zone.tempCible, value: v }); };
  const options = zoneModes(S, zone);
  const nextMode = () => {
    if (!options.length) return;
    const i = options.indexOf(z.modeBrut);
    const suivant = options[(i + 1) % options.length];
    if (estClimate(zone)) commander(hass, zone.haid, 'set_hvac_mode', suivant);
    else call('input_select', 'select_option', { entity_id: zone.modeEnt, option: suivant });
  };
  const label = String(zoneModeLabel(zone, z.modeBrut || options[0] || '')).toUpperCase();
  return (
    <div className="o-rmcard" role="button" tabIndex={onOpen ? 0 : -1} aria-label={'Ouvrir ' + (titre || zone.name)} onKeyDown={(e) => { if (onOpen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(zone.id); } }} onClick={() => onOpen && onOpen(zone.id)} style={{ ...RM_CARD, cursor: onOpen ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={RM_ICO(off ? 'var(--o-s1)' : 'rgba(var(--o-warn2-rgb),.16)', off ? 'var(--o-text3)' : heating ? 'var(--o-warn2)' : '#ff8a4c')}><Fi i="thermometer-half" size={17} /></span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {z.auto && <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: 9.5, fontWeight: 800, background: 'rgba(var(--o-accent-rgb),.14)', color: 'var(--o-accent-soft)' }}>AUTO</span>}
          <button onClick={(e) => { e.stopPropagation(); nextMode(); }} title="Changer de mode" style={{ padding: '5px 11px', borderRadius: 999, fontSize: 10, fontWeight: 800, letterSpacing: '.05em', cursor: 'pointer', border: 'var(--o-bw,1px) solid ' + (off ? 'var(--o-bd2)' : 'rgba(var(--o-warn2-rgb),.3)'), background: off ? 'var(--o-s1)' : 'rgba(var(--o-warn2-rgb),.14)', color: off ? 'var(--o-text3)' : 'var(--o-warn2)' }}>{label}</button>
        </div>
      </div>
      <div>
        <div className="o-rmbig" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', color: off ? 'var(--o-text3)' : 'var(--o-text)', lineHeight: 1.1 }}>{target}<span style={{ fontSize: 20 }}>°</span></div>
        <div style={RM_SUB}>{titre || zone.name}{z.current != null ? ' · ' + tr('actuel {n}°', { n: z.current }) : ''}</div>
        <div style={{ display: 'flex', gap: 7, marginTop: 11 }}>
          <button onClick={(e) => { e.stopPropagation(); setT(-0.5); }} className="o-rmbtn" style={{ ...RM_BTN, fontSize: 17, padding: '7px 6px' }}>−</button>
          <button onClick={(e) => { e.stopPropagation(); setT(0.5); }} className="o-rmbtn" style={{ ...RM_BTN, fontSize: 17, padding: '7px 6px' }}>+</button>
        </div>
      </div>
    </div>
  );
}

function RoomPilotSheet({ zone, hass, onClose }) {
  const S = (hass && hass.states) || null;
  const z = readZone(S, zone);
  const [ov, setOv] = useState(null);
  useEffect(() => { setOv(null); }, [z.target, z.mode, z.auto]);
  const target = ov != null ? ov : (z.target != null ? z.target : 19);
  const off = z.mode === 'off';
  const heating = !off && z.current != null && z.current < target;
  const call = (d, s, data) => { try { if (hass && hass.callService) hass.callService(d, s, data || {}); } catch (e) {} };
  const setT = (d) => { const v = Math.max(5, Math.min(30, Math.round((target + d) * 2) / 2)); setOv(v); call('input_number', 'set_value', { entity_id: zone.tempCible, value: v }); };
  // La température vécue : le capteur de la zone s'il existe (état numérique, requête légère),
  // sinon l'attribut current_temperature du climate.
  const ptsTemp = useHistorique24(hass, zone.tempSensor || (estClimate(zone) ? zone.haid : null), zone.tempSensor ? null : 'current_temperature');
  const pct = Math.max(0, Math.min(1, (target - RM_TMIN) / (RM_TMAX - RM_TMIN)));
  const R = 54, ARC = 2 * Math.PI * R * 0.75;
  const col = off ? 'var(--o-text3)' : 'var(--o-warn)';
  return (
    <BottomSheet onClose={onClose}>
      {close => (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={close} aria-label={tr('Fermer')} title={tr('Fermer')} style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--o-s1)', border: 'none', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 800, letterSpacing: '.06em', color: 'var(--o-text2)' }}><Fi i="thermometer-half" size={13} color="#ff8a4c" />{zone.name.toUpperCase()}</span>
          {zone.autoEnt && <span onClick={() => call('input_boolean', z.auto ? 'turn_off' : 'turn_on', { entity_id: zone.autoEnt })} role="switch" tabIndex={0} aria-label={(z.auto ? 'Désactiver' : 'Activer') + ' la programmation automatique'} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); call('input_boolean', z.auto ? 'turn_off' : 'turn_on', { entity_id: zone.autoEnt }); } }} aria-checked={!!z.auto} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><span style={{ fontSize: 12, fontWeight: 700, color: z.auto ? 'var(--o-accent-soft)' : 'var(--o-text3)' }}>Auto</span><span style={{ width: 42, height: 24, borderRadius: 12, background: z.auto ? 'var(--o-accent)' : 'var(--o-bd1)', position: 'relative', transition: 'background .25s' }}><span style={{ position: 'absolute', top: 3, left: z.auto ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)' }} /></span></span>}
        </div>
        <div style={{ position: 'relative', width: 230, height: 230, margin: '10px auto 0' }}>
          <svg width="230" height="230" viewBox="0 0 130 130" style={{ position: 'absolute', inset: 0, transform: 'rotate(135deg)' }}>
            <circle cx="65" cy="65" r={R} fill="none" stroke="var(--o-bd1)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${ARC} 999`} />
            <circle cx="65" cy="65" r={R} fill="none" stroke={col} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${ARC * pct} 999`} style={{ transition: 'stroke-dasharray .35s' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: '-.02em', color: off ? 'var(--o-text3)' : 'var(--o-text)', lineHeight: 1 }}>{target.toFixed(1)}<span style={{ fontSize: 26 }}>°</span></div>
            {z.current != null && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', marginTop: 5 }}>actuel {z.current}°</div>}
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', marginTop: 6, color: off ? 'var(--o-text3)' : heating ? 'var(--o-warn2)' : 'var(--o-warn)' }}>{off ? 'ÉTEINT' : heating ? 'CHAUFFE' : tr('AU REPOS')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, margin: '10px 0 18px' }}>
          <button onClick={() => setT(-0.5)} style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 22, fontWeight: 700, cursor: 'pointer' }}>−</button>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', textAlign: 'center', lineHeight: 1.35 }}>± par<br />pas de 0,5°</span>
          <button onClick={() => setT(0.5)} style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 22, fontWeight: 700, cursor: 'pointer' }}>+</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {zoneModes(S, zone).map((opt) => { const on = z.modeBrut === opt; return (
            <button key={opt} onClick={() => { if (estClimate(zone)) commander(hass, zone.haid, 'set_hvac_mode', opt); else call('input_select', 'select_option', { entity_id: zone.modeEnt, option: opt }); }} style={{ flex: 1, padding: '12px 8px', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 12.5, border: 'var(--o-bw,1px) solid ' + (on ? 'rgba(var(--o-warn2-rgb),.5)' : 'var(--o-bd2)'), background: on ? 'rgba(var(--o-warn2-rgb),.16)' : 'var(--o-s1)', color: on ? 'var(--o-warn2)' : 'var(--o-text1)' }}>{zoneModeLabel(zone, opt)}</button>
          ); })}
        </div>
        {/* Préréglage du thermostat (Turbo, Comfort, Overnight…) : le sélecteur
          * de la fiche native — les noms viennent de l'entité. */}
        {estClimate(zone) && (() => { const at = (S && S[zone.haid] && S[zone.haid].attributes) || {}; return Array.isArray(at.preset_modes) && at.preset_modes.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
            <MenuDeroulant icone="settings-sliders" etiquette={tr('Préréglage')} valeur={at.preset_mode && at.preset_mode !== 'unknown' ? at.preset_mode : null}
              options={at.preset_modes.slice(0, 10)} surChoix={(p) => commander(hass, zone.haid, 'set_preset_mode', p)} />
          </div>
        ); })()}
        {(zone.tempSensor || estClimate(zone)) && (<>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', margin: '18px 0 9px' }}>{tr('TEMPÉRATURE · 24 H')}</div>
          <Courbe24 points={ptsTemp} couleur="#ff8a4c" unite="°" />
        </>)}
      </>)}
    </BottomSheet>
  );
}

// Lecture d'un media_player (+ fusion compagnon Music Assistant), utilisable hors de la vue Médias.
function mpRead1(S, id) {
  const e = S && S[id]; if (!e) return { state: 'off', on: false, ctl: id };
  const a = e.attributes || {}; const playing = e.state === 'playing';
  let pos = a.media_position;
  if (pos != null && playing && a.media_position_updated_at) { const dt = (Date.now() - Date.parse(a.media_position_updated_at)) / 1000; if (dt > 0) pos += dt; }
  if (pos != null && a.media_duration) pos = Math.min(pos, a.media_duration);
  return { state: e.state, on: e.state !== 'off' && e.state !== 'unavailable' && e.state != null && e.state !== 'standby', playing, title: a.media_title, artist: a.media_artist || a.media_album_artist, album: a.media_album_name, art: a.entity_picture_local || a.entity_picture, pos, dur: a.media_duration, vol: a.volume_level != null ? Math.round(a.volume_level * 100) : 0, hasVol: a.volume_level != null, muted: !!a.is_volume_muted, shuffle: !!a.shuffle, repeat: a.repeat || 'off', source: a.app_name || a.source, mtype: a.media_content_type, ctl: id };
}
function mpRead(S, id) {
  const p = medPlayers().find(x => x.haid === id);
  const nat = mpRead1(S, id);
  if (!p || !p.ma) return nat;
  const ma = mpRead1(S, p.ma);
  const maActive = (ma.title || ma.art) && (ma.playing || (ma.state === 'paused' && !nat.playing));
  if (!maActive) return nat;
  return { ...nat, playing: ma.playing || nat.playing, on: true, title: ma.title || nat.title, artist: ma.artist || nat.artist, album: ma.album || nat.album, art: ma.art || nat.art, pos: ma.pos != null ? ma.pos : nat.pos, dur: ma.dur != null ? ma.dur : nat.dur, shuffle: ma.shuffle, repeat: ma.repeat, source: ma.source || nat.source || 'Music Assistant', ctl: p.ma };
}

// Détail média : lecteur complet (ambiance pochette, seek, contrôles, volume) — comme la vue Médias.
function RoomMediaSheet({ id, hass, onClose }) {
  const S = (hass && hass.states) || null;
  const np = mpRead(S, id);
  const [, tick] = useState(0);
  useEffect(() => { if (!np.playing) return; const iv = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(iv); }, [np.playing]);
  const [artErr, setArtErr] = useState(null);
  useEffect(() => { if (!artErr) return; const t = setTimeout(() => setArtErr(null), 8000); return () => clearTimeout(t); }, [artErr]);
  const artOk = np.art && np.art !== artErr;
  const [acc, setAcc] = useState(null);
  useEffect(() => { let alive = true; if (!artOk) { setAcc(null); return; } extractNpAccent(np.art).then(v => { if (alive) setAcc(v); }); return () => { alive = false; }; }, [np.art, artOk]);
  const accR = acc ? acc.join(',') : null;
  const A = accR ? `rgb(${accR})` : 'var(--o-accent)';
  const AA = (al) => accR ? `rgba(${accR},${al})` : `rgba(var(--o-accent-rgb),${al})`;
  const ALight = acc ? `rgb(${acc.map(v => Math.round(v + (255 - v) * .28)).join(',')})` : 'var(--o-accent-soft)';
  const onArt = !!artOk;
  const tMain = onArt ? '#fff' : 'var(--o-text)', tSub = onArt ? 'rgba(255,255,255,.75)' : 'var(--o-text2)', tDim = onArt ? 'rgba(255,255,255,.55)' : 'var(--o-text3)';
  const call = (svc, data) => { try { if (hass && hass.callService) hass.callService('media_player', svc, data || {}); } catch (e) {} };
  const [volOv, setVolOv] = useState(null);
  useEffect(() => { setVolOv(null); }, [np.vol]);
  const vol = volOv != null ? volOv : np.vol;
  const [seekOv, setSeekOv] = useState(null);
  const seekT = useRef(null);
  useEffect(() => () => clearTimeout(seekT.current), []);
  const showPos = seekOv != null ? seekOv : np.pos;
  const pct = (showPos != null && np.dur) ? Math.min(100, showPos / np.dur * 100) : 0;
  const fmtT = (s) => { if (s == null || isNaN(s)) return '0:00'; const m = Math.floor(s / 60), ss = Math.floor(s % 60); return m + ':' + (ss < 10 ? '0' : '') + ss; };
  const glass = (size, rad) => ({ width: size, height: size, borderRadius: rad, flexShrink: 0, border: onArt ? '1px solid rgba(255,255,255,.14)' : 'var(--o-bw,1px) solid var(--o-bd1)', cursor: 'pointer', color: onArt ? '#fff' : 'var(--o-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: onArt ? 'linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.06))' : 'var(--o-s1)', backdropFilter: 'blur(14px) saturate(1.38)', WebkitBackdropFilter: 'blur(14px) saturate(1.38)', boxShadow: '0 12px 26px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.08)', position: 'relative' });
  const bar = (dragEnd, cur, dataAttr) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const el = e.currentTarget, fill = el.querySelector('[' + dataAttr + ']'), r = el.getBoundingClientRect();
    const calc = x => Math.max(0, Math.min(100, (x - r.left) / r.width * 100));
    let v = calc(e.clientX);
    const paint = () => { if (fill) { fill.style.transition = 'none'; fill.style.width = v + '%'; } };
    paint(); el.classList.add('o-sliding'); try { el.setPointerCapture(e.pointerId); } catch (er) {}
    el.onpointermove = ev => { v = calc(ev.clientX); paint(); };
    const end = () => { el.classList.remove('o-sliding'); el.onpointermove = null; el.onpointerup = null; el.onpointercancel = null; if (fill) fill.style.transition = ''; };
    el.onpointerup = () => { end(); dragEnd(v); };
    el.onpointercancel = () => { end(); if (fill) fill.style.width = cur + '%'; };
  };
  return (
    <BottomSheet onClose={onClose}>
      {close => (<>
        <div style={{ position: 'relative', margin: '-10px -22px 0', borderRadius: '20px 20px 0 0', overflow: 'hidden' }}>
          {onArt && <>
            <img src={np.art} alt="" aria-hidden onError={() => setArtErr(np.art)} style={{ position: 'absolute', inset: -30, width: 'calc(100% + 60px)', height: 'calc(100% + 60px)', objectFit: 'cover', filter: 'blur(30px) saturate(1.08)', transform: 'scale(1.08)', opacity: .9 }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(9,12,19,.2), rgba(9,12,19,.8) 45%, rgba(9,12,19,.95))' }} />
            <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 85%, ${AA(.22)}, transparent 36%)`, mixBlendMode: 'screen' }} />
          </>}
          <div style={{ position: 'relative', padding: '14px 22px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <button onClick={close} aria-label={tr('Fermer')} title={tr('Fermer')} style={{ width: 44, height: 44, borderRadius: '50%', background: onArt ? 'rgba(255,255,255,.16)' : 'var(--o-s1)', border: 'none', color: tMain, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: tSub, letterSpacing: '.03em' }}>{(medPlayers().find(p => p.haid === id) || {}).name || id}</span>
              {np.source && <span style={{ padding: '3px 10px', borderRadius: 999, background: 'rgba(255,255,255,.94)', color: '#15181f', fontSize: 10.5, fontWeight: 800 }}>{np.source}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0, borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(135deg,var(--o-purple),var(--o-accent) 65%,var(--o-ok))', boxShadow: '0 14px 32px rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {artOk && <img src={np.art} alt="" onError={() => setArtErr(np.art)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                {!artOk && <Fi i={/^(video|tvshow|movie|episode|channel)$/.test(np.mtype || '') ? 'tv-music' : 'music'} size={30} color="rgba(255,255,255,.92)" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 800, color: tMain, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{np.title || (np.playing ? tr('En lecture') : np.on ? tr('En pause') : tr('Rien en lecture'))}</div>
                <div style={{ fontSize: 13, color: tSub, fontWeight: 600, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[np.artist, np.album].filter(Boolean).join(' · ') || '—'}</div>
              </div>
            </div>
            {/* progression */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 14 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: tDim, minWidth: 32 }}>{fmtT(showPos)}</span>
              <div onPointerDown={np.dur ? bar((v) => { const secs = v / 100 * np.dur; setSeekOv(secs); commander(hass, np.ctl, 'seek', Math.round(secs)); clearTimeout(seekT.current); seekT.current = setTimeout(() => setSeekOv(null), 3000); }, pct, 'data-sk') : undefined} style={{ flex: 1, padding: '10px 0', cursor: np.dur ? 'pointer' : 'default', touchAction: 'none' }}>
                <div style={{ height: 8, borderRadius: 999, background: onArt ? 'rgba(255,255,255,.18)' : 'var(--o-bd1)', overflow: 'hidden' }}><div data-sk style={{ height: '100%', width: pct + '%', background: `linear-gradient(90deg, ${A}, ${ALight})`, borderRadius: 999, transition: 'width .5s linear' }} /></div>
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: tDim, minWidth: 32, textAlign: 'right' }}>{fmtT(np.dur)}</span>
            </div>
            {/* contrôles */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11, marginTop: 4 }}>
              <button onClick={() => commander(hass, np.ctl, 'set_shuffle', !np.shuffle)} title={tr('Aléatoire')} style={{ ...glass(40, 14), color: np.shuffle ? (acc ? ALight : 'var(--o-accent-soft)') : (onArt ? '#fff' : 'var(--o-text1)') }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg></button>
              <button onClick={() => commander(hass, np.ctl, 'previous_track')} style={glass(50, 17)}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 20L9 12l10-8zM7 4v16H5V4z" /></svg></button>
              <button onClick={() => commander(hass, np.ctl, 'play_pause')} style={{ ...glass(76, '50%'), background: onArt ? 'linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,.07))' : 'var(--o-s1)' }}>
                {np.playing && <span aria-hidden style={{ position: 'absolute', inset: -6, borderRadius: 'inherit', border: '1px solid rgba(255,255,255,.22)', animation: 'np-pulse 2.4s ease-out infinite', pointerEvents: 'none' }} />}
                {np.playing ? <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg> : <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 3 }}><path d="M7 5l12 7-12 7z" /></svg>}
              </button>
              <button onClick={() => commander(hass, np.ctl, 'next_track')} style={glass(50, 17)}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4l10 8-10 8zM17 4h2v16h-2z" /></svg></button>
              <button onClick={() => { const o = ['off', 'all', 'one'], i = o.indexOf(np.repeat); commander(hass, np.ctl, 'set_repeat', o[(i + 1) % 3]); }} title={tr('Répéter')} style={{ ...glass(40, 14), color: np.repeat !== 'off' ? (acc ? ALight : 'var(--o-accent-soft)') : (onArt ? '#fff' : 'var(--o-text1)') }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" /></svg>{np.repeat === 'one' && <span style={{ position: 'absolute', top: 3, right: 6, fontSize: 8.5, fontWeight: 800 }}>1</span>}</button>
            </div>
            {/* volume */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: tSub, minWidth: 38 }}>{vol}%</span>
              <div onPointerDown={bar((v) => { setVolOv(Math.round(v)); commander(hass, id, 'set_volume', v / 100); }, vol, 'data-vol')} {...kbSlider('Volume', vol, (nv) => { setVolOv(Math.round(nv)); commander(hass, id, 'set_volume', nv / 100); })} style={{ flex: 1, padding: '11px 0', cursor: 'pointer', touchAction: 'none' }}>
                <div style={{ position: 'relative', height: 8, borderRadius: 999, background: onArt ? 'rgba(255,255,255,.18)' : 'var(--o-bd1)' }}>
                  <div data-vol style={{ position: 'absolute', inset: '0 auto 0 0', width: vol + '%', background: `linear-gradient(90deg, ${A}, ${ALight})`, borderRadius: 999, transition: 'width .1s' }} />
                  <span style={{ position: 'absolute', top: '50%', left: `calc(${vol}% - 7px)`, transform: 'translateY(-50%)', width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,.4)', transition: 'left .1s' }} />
                </div>
              </div>
              <button onClick={() => commander(hass, id, 'mute', !np.muted)} title={tr('Couper le son')} style={{ ...glass(38, 13), ...(np.muted ? { background: 'rgba(239,68,68,.3)', border: '1px solid rgba(239,68,68,.5)', color: '#fff' } : {}) }}><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M11 5L6 9H2v6h4l5 4z" />{np.muted ? <path d="M22 9l-6 6M16 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />}</svg></button>
            </div>
          </div>
        </div>
      </>)}
    </BottomSheet>
  );
}

// Média compact (maquette) : icône, play/pause, titre, volume.
function RoomMediaCard({ id, hass, onOpen, label = null }) {
  const S = (hass && hass.states) || null;
  const np = mpRead(S, id); // fusion compagnon Music Assistant (titre/pochette) comme la vue Médias
  const a = (S && S[id] && S[id].attributes) || {};
  const call = (svc, data, ent) => { try { if (hass && hass.callService) hass.callService('media_player', svc, { entity_id: ent || id, ...(data || {}) }); } catch (e) {} };
  const sub = [np.artist, np.album].filter(Boolean).join(' · ');
  const vol = np.hasVol ? np.vol : null;
  // Filigrane appareil (comme la vue Objets) : Apple TV ou Echo selon le lecteur configuré
  const mp = medPlayers().find(x => x.haid === id);
  const artKey = (mp ? mp.id : '') + ' ' + id;
  const art = /echo/i.test(artKey) ? DEVICE_ART.echo : /apple|atv|tv/i.test(artKey) ? DEVICE_ART.appletv : null;
  const mort = !S || !S[id] || S[id].state === 'unavailable';
  return (
    <div className={'o-rmcard' + (mort ? ' o-panne' : '')} role="button" tabIndex={onOpen ? 0 : -1} aria-label={'Ouvrir ' + (label || (a && a.friendly_name) || id)} onKeyDown={(e) => { if (onOpen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(id); } }} onClick={() => onOpen && onOpen(id)} style={{ ...RM_CARD, position: 'relative', overflow: 'hidden', cursor: onOpen ? 'pointer' : 'default',
      // Teinte d'état : un lecteur EN LECTURE lave sa surface d'accent, comme la
      // lumière de son or — l'activité se voit avant de lire le titre.
      ...(np.playing && LAVIS ? {
        background: `linear-gradient(180deg,transparent 28%,rgba(var(--o-accent-rgb),${lav(.14)})), linear-gradient(180deg,var(--o-surfA),var(--o-surfB))`,
        border: `1px solid rgba(var(--o-accent-rgb),${lav(.26)})`,
      } : null) }}>
      {art && <div aria-hidden="true" style={{ position: 'absolute', right: 6, bottom: -6, width: 96, height: 96, backgroundImage: `url("${art}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center bottom', opacity: 0.13, pointerEvents: 'none' }} />}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={RM_ICO(np.on ? 'rgba(167,139,250,.16)' : 'var(--o-s1)', np.on ? 'var(--o-purple)' : 'var(--o-text3)')}>
          {np.art ? <img src={np.art} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <Fi i="tv-music" size={17} />}
        </span>
        <button aria-label={np.playing ? tr('Mettre en pause') : tr('Lecture')} onClick={(e) => { e.stopPropagation(); call('media_play_pause', null, np.ctl); }} style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i={np.playing ? 'pause' : 'play'} size={13} /></button>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={RM_NAME}>{label || a.friendly_name || id}</div>
        <div style={RM_SUB}>{np.title ? (np.title + (sub ? ' · ' + sub : '')) : (np.on ? tr('En pause') : tr('Éteint'))}</div>
        {vol != null && <>
          <div style={{ height: 3, borderRadius: 2, background: 'var(--o-bd1)', marginTop: 10, overflow: 'hidden' }}><div style={{ height: '100%', width: vol + '%', background: 'var(--o-purple)', borderRadius: 2, transition: 'width .3s' }} /></div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', marginTop: 5 }}>Volume {vol}%</div>
        </>}
      </div>
    </div>
  );
}

// Détail volet : visuel + rail + boutons, mode auto global, et programmation nocturne (chambre uniquement).
function RoomCoverSheet({ id, hass, onClose }) {
  const S = (hass && hass.states) || null;
  const st = S ? S[id] : null;
  const a = (st && st.attributes) || {};
  const realPos = a.current_position != null ? Math.round(a.current_position) : (st && st.state === 'open' ? 100 : 0);
  const [ov, setOv] = useState(null);
  useEffect(() => { setOv(null); }, [realPos]);
  const pos = ov != null ? ov : realPos;
  const call = (d, s, data) => { try { if (hass && hass.callService) hass.callService(d, s, data || {}); } catch (e) {} };
  const cov = (svc, data) => call('cover', svc, { entity_id: id, ...(data || {}) });
  // Pas d'entite de mode : pas de mode. Supposer « Manuel » — un mot francais,
  // compare plus loin par `schedActive` — declarait le planning inactif en
  // permanence chez qui n'a pas cette entite.
  const mode = (S && S[voletMode()] && S[voletMode()].state) || null;
  const dayOn = (h) => !!(S && S[h] && S[h].state === 'on');
  const nights = voletDays().filter(d => dayOn(d.haid)).length;
  const sunA = S && S['sun.sun'] && S['sun.sun'].attributes ? S['sun.sun'].attributes : {};
  const fmtT = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const drag = (e) => {
    e.preventDefault();
    const el = e.currentTarget, fill = el.querySelector('[data-fill]'), r = el.getBoundingClientRect();
    const calc = x => Math.max(0, Math.min(100, Math.round((x - r.left) / r.width * 100)));
    let v = calc(e.clientX);
    const paint = () => { if (fill) { fill.style.transition = 'none'; fill.style.width = v + '%'; } };
    paint(); el.classList.add('o-sliding'); try { el.setPointerCapture(e.pointerId); } catch (er) {}
    el.onpointermove = ev => { v = calc(ev.clientX); paint(); };
    const end = () => { el.classList.remove('o-sliding'); el.onpointermove = null; el.onpointerup = null; el.onpointercancel = null; if (fill) fill.style.transition = ''; };
    el.onpointerup = () => { end(); setOv(v); cov('set_cover_position', { position: v }); };
    el.onpointercancel = () => { end(); if (fill) fill.style.width = pos + '%'; };
  };
  const bigBtn = (act, col) => ({ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 13, borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 13, border: '1px solid ' + (act ? hx(col, .35) : 'var(--o-bd1)'), background: act ? hx(col, .14) : 'var(--o-s1)', color: act ? col : 'var(--o-text1)' });
  return (
    <BottomSheet onClose={onClose}>
      {close => (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={close} aria-label={tr('Fermer')} title={tr('Fermer')} style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--o-s1)', border: 'none', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          <span style={{ flex: 1, fontSize: 19, fontWeight: 700 }}>{a.friendly_name || id}</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: pos === 0 ? 'var(--o-text3)' : 'var(--o-purple)' }}>{pos}%</span>
        </div>
        {/* visuel du volet + rail */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', margin: '18px 0 6px' }}>
          <div style={{ position: 'relative', width: 76, height: 106, flexShrink: 0, borderRadius: 11, overflow: 'hidden', background: 'linear-gradient(180deg,#1c2740,#141b2c)', border: '1px solid rgba(255,255,255,.1)', boxShadow: 'inset 0 2px 8px rgba(0,0,0,.4)' }}>
            <div style={{ position: 'absolute', inset: '0 0 auto 0', background: 'repeating-linear-gradient(180deg,rgba(130,150,190,.6) 0 5px,rgba(95,115,160,.85) 5px 8px)', borderRadius: '10px 10px 3px 3px', boxShadow: '0 3px 8px rgba(0,0,0,.3)', transition: 'height .35s', height: (100 - pos) + '%' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text2)' }}>{pos === 0 ? tr('Fermé') : pos === 100 ? tr('Ouvert') : tr('Ouvert à {n} %', { n: pos })}</div>
            <div onPointerDown={drag} style={{ padding: '14px 0', cursor: 'pointer', touchAction: 'none' }}>
              <div style={{ position: 'relative', height: 34, borderRadius: 11, background: 'var(--o-s1)', overflow: 'hidden' }}>
                <div data-fill style={{ position: 'absolute', inset: '0 auto 0 0', width: pos + '%', background: 'linear-gradient(90deg,var(--o-purple),rgba(var(--o-purple-rgb),.6))', borderRadius: 11, transition: 'width .25s' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setOv(100); cov('open_cover'); }} style={bigBtn(pos === 100, 'var(--o-ok)')}><Fi i="angle-up" size={15} />{tr('Ouvrir')}</button>
              <button onClick={() => cov('stop_cover')} style={bigBtn(false, 'var(--o-text1)')}><Fi i="square" size={12} />{tr('Stop')}</button>
              <button onClick={() => { setOv(0); cov('close_cover'); }} style={bigBtn(pos === 0, 'var(--o-purple)')}><Fi i="angle-down" size={15} />{tr('Fermer')}</button>
            </div>
          </div>
        </div>
        {/* mode automatique (global aux volets) */}
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', margin: '16px 0 9px' }}>MODE AUTOMATIQUE</div>
        {/* Trois colonnes : les trois modes tiennent d'un regard, sans faire
            descendre le reste de la feuille sous la ligne de flottaison. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
          {voletModes(S).map(m => {
            const on = mode === m.id;
            return (
              <button key={m.id} className="o-volet-mode" onClick={() => call('input_select', 'select_option', { entity_id: voletMode(), option: m.id })} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 7, padding: '13px 8px', borderRadius: 13, cursor: 'pointer', textAlign: 'center', border: '1px solid ' + (on ? hx(m.color, .4) : 'var(--o-bd3)'), background: on ? hx(m.color, .13) : 'var(--o-s2)', color: on ? m.color : 'var(--o-text1)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Ico name={m.icon} size={17} />
                  {on && <Fi i="check" size={13} />}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.15 }}>{m.label}</span>
                <span style={{ fontSize: 10.5, opacity: .75, fontWeight: 600, lineHeight: 1.3 }}>{m.desc}</span>
              </button>
            );
          })}
        </div>
        {/* programmation nocturne — chambre uniquement */}
      </>)}
    </BottomSheet>
  );
}

// Détail thermostat (maquette) : grand dial, consigne, actuel, état, − / +, modes.
function RoomClimateSheet({ id, hass, onClose }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const realTarget = a.temperature != null ? a.temperature : 20;
  const [ov, setOv] = useState(null);
  useEffect(() => { setOv(null); }, [realTarget, st && st.state]);
  const target = ov != null ? ov : realTarget;
  const cur = a.current_temperature;
  const mode = st ? st.state : 'off';
  const off = mode === 'off';
  const heating = a.hvac_action === 'heating';
  const MODE_FR = { off: tr('Arrêt'), heat: tr('Confort'), cool: tr('Froid'), auto: 'Auto', heat_cool: 'Auto', dry: tr('Sec'), fan_only: tr('Ventil') };
  const all = a.hvac_modes || ['off', 'heat'];
  const call = (svc, data) => { try { if (hass && hass.callService) hass.callService('climate', svc, { entity_id: id, ...(data || {}) }); } catch (e) {} };
  // Les bornes viennent de l'entite, pas d'une constante : la climatisation de
  // l'installation d'essai monte a 35, la ou le code plafonnait a 30. Le pas
  // aussi lui appartient. On affiche ce qui a ete envoye, pas ce qui a ete
  // demande — sinon la consigne affichee mentirait des qu'elle est bornee.
  const setT = (d) => { const v = commander(hass, id, 'set_temperature', target + d, 'temperature'); if (v != null) setOv(v); };
  const ptsTemp = useHistorique24(hass, id, 'current_temperature');
  const pct = Math.max(0, Math.min(1, (target - RM_TMIN) / (RM_TMAX - RM_TMIN)));
  const R = 54, ARC = 2 * Math.PI * R * 0.75; // arc 270°
  const col = off ? 'var(--o-text3)' : 'var(--o-warn)';
  return (
    <BottomSheet onClose={onClose}>
      {close => (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={close} aria-label={tr('Fermer')} title={tr('Fermer')} style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--o-s1)', border: 'none', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 800, letterSpacing: '.06em', color: 'var(--o-text2)' }}><Fi i="thermometer-half" size={13} color="#ff8a4c" />{(a.friendly_name || id).toUpperCase()}</span>
        </div>
        <div style={{ position: 'relative', width: 230, height: 230, margin: '10px auto 0' }}>
          <svg width="230" height="230" viewBox="0 0 130 130" style={{ position: 'absolute', inset: 0, transform: 'rotate(135deg)' }}>
            <circle cx="65" cy="65" r={R} fill="none" stroke="var(--o-bd1)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${ARC} 999`} />
            <circle cx="65" cy="65" r={R} fill="none" stroke={col} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${ARC * pct} 999`} style={{ transition: 'stroke-dasharray .35s' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: '-.02em', color: off ? 'var(--o-text3)' : 'var(--o-text)', lineHeight: 1 }}>{target.toFixed(1)}<span style={{ fontSize: 26 }}>°</span></div>
            {cur != null && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', marginTop: 5 }}>actuel {cur}°</div>}
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', marginTop: 6, color: off ? 'var(--o-text3)' : heating ? 'var(--o-warn2)' : 'var(--o-warn)' }}>{off ? 'ÉTEINT' : heating ? 'CHAUFFE' : tr('AU REPOS')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, margin: '10px 0 18px' }}>
          <button onClick={() => setT(-0.5)} style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 22, fontWeight: 700, cursor: 'pointer' }}>−</button>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', textAlign: 'center', lineHeight: 1.35 }}>± par<br />pas de 0,5°</span>
          <button onClick={() => setT(0.5)} style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 22, fontWeight: 700, cursor: 'pointer' }}>+</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {all.map(m => { const on = mode === m; return (
            <button key={m} onClick={() => commander(hass, id, 'set_hvac_mode', m)} style={{ flex: 1, padding: '12px 8px', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 13, border: 'var(--o-bw,1px) solid ' + (on ? 'transparent' : 'var(--o-bd2)'), background: on ? 'var(--o-text)' : 'var(--o-s1)', color: on ? 'var(--o-bg)' : 'var(--o-text1)' }}>{tr(MODE_FR[m]) || m}</button>
          ); })}
        </div>
        {/* Préréglage du thermostat : le sélecteur de la fiche native. */}
        {Array.isArray(a.preset_modes) && a.preset_modes.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
            <MenuDeroulant icone="settings-sliders" etiquette={tr('Préréglage')} valeur={a.preset_mode && a.preset_mode !== 'unknown' ? a.preset_mode : null}
              options={a.preset_modes.slice(0, 10)} surChoix={(p) => commander(hass, id, 'set_preset_mode', p)} />
          </div>
        )}
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', margin: '18px 0 9px' }}>{tr('TEMPÉRATURE · 24 H')}</div>
        <Courbe24 points={ptsTemp} couleur="#ff8a4c" unite="°" />
      </>)}
    </BottomSheet>
  );
}

// Réglage d'une lumière depuis la vue Pièce : bottom sheet + fader vertical (peinture DOM, commit au relâcher).
function RoomLightSheet({ light, hass, onClose }) {
  const st = hass && hass.states ? hass.states[light.id] : null;
  const a = (st && st.attributes) || {};
  const realOn = st ? st.state === 'on' : light.on;
  const realBri = a.brightness != null ? Math.round(a.brightness / 255 * 100) : light.bri;
  const [on, setOn] = useState(realOn);
  const [bri, setBri] = useState(realBri);
  const dragRef = useRef(false);
  useEffect(() => { if (!dragRef.current) { setOn(realOn); setBri(realBri); } }, [realOn, realBri]);
  const color = a.rgb_color ? '#' + a.rgb_color.map(v => v.toString(16).padStart(2, '0')).join('') : light.color;
  const acc = (light.rgb && color) ? color : '#ffce73';
  const call = (svc, data) => { try { if (hass && hass.callService) hass.callService('light', svc, { entity_id: light.id, ...(data || {}) }); } catch (e) {} };
  const toggle = () => { const v = !on; setOn(v); try { hass.callService('homeassistant', v ? 'turn_on' : 'turn_off', { entity_id: light.id }); } catch (e) {} };
  const shown = on ? bri : 0;
  const dragVert = (e) => {
    e.preventDefault();
    const el = e.currentTarget, fill = el.querySelector('[data-fill]'), handle = el.querySelector('[data-handle]'), big = document.getElementById('o-roombri');
    const r = el.getBoundingClientRect();
    const calc = y => Math.max(1, Math.min(100, Math.round((1 - (y - r.top) / r.height) * 100)));
    let v = calc(e.clientY); dragRef.current = true;
    if (fill) fill.style.transition = 'none'; if (handle) handle.style.transition = 'none';
    const paint = () => { if (fill) { fill.style.height = v + '%'; fill.style.opacity = '1'; } if (handle) { handle.style.bottom = `calc(${v}% - 26px)`; handle.style.opacity = '1'; } if (big) big.textContent = String(v); };
    paint(); el.classList.add('o-sliding'); try { el.setPointerCapture(e.pointerId); } catch (er) {}
    el.onpointermove = ev => { v = calc(ev.clientY); paint(); };
    const end = () => { el.classList.remove('o-sliding'); el.onpointermove = null; el.onpointerup = null; el.onpointercancel = null; if (fill) fill.style.transition = ''; if (handle) handle.style.transition = ''; dragRef.current = false; };
    el.onpointerup = () => { end(); setBri(v); setOn(true); commander(hass, light.id, 'set_brightness', v); };
    el.onpointercancel = () => { end(); setBri(realBri); };
  };
  return (
    <BottomSheet onClose={onClose}>
      {close => (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={close} aria-label={tr('Fermer')} title={tr('Fermer')} style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--o-s1)', border: 'none', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          <span style={{ flex: 1, fontSize: 19, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{light.name}</span>
          <span role="switch" aria-checked={on} tabIndex={0} aria-label={(on ? 'Éteindre ' : 'Allumer ') + (light.name || light.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }} onClick={toggle} style={{ width: 48, height: 27, borderRadius: 14, background: on ? '#FF2D78' : 'rgba(150,162,184,.2)', position: 'relative', cursor: 'pointer', flexShrink: 0, display: 'inline-block', transition: 'background .25s' }}><span style={{ position: 'absolute', top: 3, left: on ? 24 : 3, width: 21, height: 21, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,.35)', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)' }} /></span>
        </div>
        <div style={{ textAlign: 'center', margin: '18px 0 16px' }}>
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: '-.01em' }}><span id="o-roombri">{shown}</span> <span style={{ fontSize: 24, fontWeight: 500, opacity: .85 }}>%</span></div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--o-text2)', marginTop: 4 }}>{relTime(st && st.last_changed) || (on ? tr('Allumé') : tr('Éteint'))}</div>
        </div>
        {light.dimmable !== false && (
          <div onPointerDown={dragVert} {...kbSlider('Luminosité ' + light.name, shown, (nv) => { setBri(nv); setOn(true); commander(hass, light.id, 'set_brightness', nv); })} style={{ position: 'relative', width: 148, height: 300, margin: '0 auto', borderRadius: 'var(--o-radius,26px)', overflow: 'hidden', cursor: 'grab', touchAction: 'none', background: 'var(--o-s1)' }}>
            <div data-fill style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: shown + '%', background: `linear-gradient(0deg,${acc},${hx(acc, .78)})`, opacity: on ? 1 : .3, transition: 'height .12s' }} />
            <div data-handle style={{ position: 'absolute', left: 0, right: 0, bottom: `calc(${shown}% - 26px)`, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', opacity: on ? 1 : 0, transition: 'bottom .12s,opacity .2s' }}><span style={{ width: 40, height: 4, borderRadius: 3, background: 'rgba(255,255,255,.95)' }} /></div>
          </div>
        )}
        {on && light.rgb && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, maxWidth: 280, margin: '22px auto 0' }}>
            {LIGHT_PALETTE.map(c => { const sel = (color || '').toLowerCase() === c.toLowerCase(); return <button key={c} onClick={() => { const n = parseInt(c.slice(1), 16); commander(hass, light.id, 'set_color', [(n >> 16) & 255, (n >> 8) & 255, n & 255]); }} style={{ width: 52, height: 52, borderRadius: '50%', cursor: 'pointer', background: c, justifySelf: 'center', padding: 0, border: sel ? '3px solid #fff' : '3px solid transparent', boxShadow: sel ? `0 0 0 2px ${c}` : 'inset 0 0 0 1px rgba(0,0,0,.15)', transition: 'all .15s' }} />; })}
          </div>
        )}
        {on && light.ct && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, maxWidth: 280, margin: '22px auto 0' }}>
            {WHITE_TEMPS().map(([n, k, c]) => <button key={k} title={n + ' · ' + k + 'K'} onClick={() => commander(hass, light.id, 'set_color_temp', k)} style={{ width: 52, height: 52, borderRadius: '50%', cursor: 'pointer', background: c, justifySelf: 'center', padding: 0, border: '3px solid transparent', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)', transition: 'all .15s' }} />)}
          </div>
        )}
      </>)}
    </BottomSheet>
  );
}

// Barre de navigation entre pièces (maquette Claude Design 21/08) : icône, nom et
// température de chaque pièce ; la pièce courante est encadrée en accent.
function RoomNav({ room, onNav, hass }) {
  const wrapRef = useRef(null);
  const S = (hass && hass.states) || {};
  // Meme habillage que les cartes de l'accueil. Cette barre exigeait une
  // egalite EXACTE avec la table des pieces : « Chambre Liam » n'y figurant
  // pas, elle retombait sur une maison, la ou la carte montrait un lit. La
  // meme piece portait deux icones selon l'endroit.
  const zones = (LOGGIA_INDEX && LOGGIA_INDEX.areaList) || [];
  const list = normRooms(cfgVal('loggia_rooms', null)).map(r => {
    const st = r.haid && r.haid.temp ? S[r.haid.temp] : null;
    const v = st ? parseFloat(st.state) : NaN;
    // L'icone de la zone Home Assistant, retrouvee par le nom ou par le
    // capteur que la piece utilise deja — comme pour les cartes.
    const ix = LOGGIA_INDEX;
    const zone = zones.find(z => rmNorm(z.name) === rmNorm(r.room))
      || (ix && ix.areaOf && r.haid ? zones.find(z => z.id === [r.haid.temp, r.haid.humidity]
          .filter(Boolean).map(ix.areaOf).find(Boolean)) : null);
    const p = habillagePiece(r.room, zone && zone.icon);
    return { name: r.room, temp: isNaN(v) ? null : v, icon: p.icon, col: couleurDePiece(modeleDePiece(r.room)) };
  });
  useEffect(() => {
    const w = wrapRef.current; if (!w) return;
    const el = w.querySelector('[data-room-active="1"]');
    if (!el) return;
    /* Defiler la BARRE, jamais la page.
     *
     * `scrollIntoView` fait defiler TOUS les ancetres scrollables, y compris
     * le document — et `block: 'nearest'` n'y change rien des que l'element
     * sort du champ. Cette barre etant en haut de la vue, tout redeclenchement
     * de l'effet ramenait l'utilisateur en haut de page. Or il se redeclenche
     * a chaque changement de configuration, `rooms` etant reconstruit.
     *
     * On pose donc `scrollLeft` a la main : la barre bouge, la page reste. */
    const cible = el.offsetLeft - (w.clientWidth - el.offsetWidth) / 2;
    try { w.scrollTo({ left: Math.max(0, cible), behavior: REDUCE_MOTION ? 'auto' : 'smooth' }); }
    catch (e) { w.scrollLeft = Math.max(0, cible); }
  }, [room]);
  return (
    <div ref={wrapRef} className="o-room-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, minWidth: 0 }}>
      {list.map(r => {
        const on = r.name === room;
        return (
          <button key={r.name} data-room-active={on ? '1' : undefined} onClick={() => onNav('room:' + r.name)} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .18s, border-color .18s', border: 'var(--o-bw,1px) solid ' + (on ? 'rgba(var(--o-accent-rgb),.5)' : 'var(--o-bd2)'), background: on ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: on ? 'var(--o-accent-soft)' : 'var(--o-text1)' }}>
            {r.icon ? <span style={{ display: 'flex', width: 15, height: 15, alignItems: 'center', justifyContent: 'center' }}>{cloneElement(r.icon, { size: 15, color: on ? r.col : 'var(--o-text3)' })}</span> : <Fi i="home" size={14} color={on ? r.col : 'var(--o-text3)'} />}
            <span style={{ fontSize: 12.5, fontWeight: on ? 800 : 700 }}>{r.name}</span>
            {r.temp != null && <span style={{ fontSize: 11.5, fontWeight: 600, color: on ? 'var(--o-accent-soft)' : 'var(--o-text3)' }}>{r.temp.toFixed(1).replace('.', ',')}°</span>}
          </button>
        );
      })}
    </div>
  );
}

function RoomChips({ rooms, room, onNav }) {
  const wrapRef = useRef(null);
  const [pill, setPill] = useState(null);
  useEffect(() => {
    const w = wrapRef.current; if (!w) return;
    const el = w.querySelector('[data-room-active="1"]');
    if (!el) { setPill(null); return; }
    setPill({ x: el.offsetLeft, w: el.offsetWidth, h: el.offsetHeight });
    /* Defiler la BARRE, jamais la page.
     *
     * `scrollIntoView` fait defiler TOUS les ancetres scrollables, y compris
     * le document — et `block: 'nearest'` n'y change rien des que l'element
     * sort du champ. Cette barre etant en haut de la vue, tout redeclenchement
     * de l'effet ramenait l'utilisateur en haut de page. Or il se redeclenche
     * a chaque changement de configuration, `rooms` etant reconstruit.
     *
     * On pose donc `scrollLeft` a la main : la barre bouge, la page reste. */
    const cible = el.offsetLeft - (w.clientWidth - el.offsetWidth) / 2;
    try { w.scrollTo({ left: Math.max(0, cible), behavior: REDUCE_MOTION ? 'auto' : 'smooth' }); }
    catch (e) { w.scrollLeft = Math.max(0, cible); }
  }, [room, rooms.join('|')]);
  return (
    <div ref={wrapRef} className="o-room-scroll" style={{ position: 'relative', display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
      {pill && <span aria-hidden="true" className="o-roompill" style={{ position: 'absolute', top: 0, left: 0, width: pill.w, height: pill.h, transform: `translateX(${pill.x}px)`, borderRadius: 999, background: 'var(--o-accent)', pointerEvents: 'none' }} />}
      {rooms.map(r => (
        <button key={r} data-room-active={r === room ? '1' : undefined} onClick={() => onNav('room:' + r)} style={{ position: 'relative', zIndex: 1, padding: '9px 17px', borderRadius: 999, border: r === room ? '1px solid transparent' : 'var(--o-bw,1px) solid var(--o-bd1)', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: r === room ? 'transparent' : 'var(--o-s2)', color: r === room ? '#fff' : 'var(--o-text1)', flexShrink: 0, whiteSpace: 'nowrap', transition: 'color .25s' }}>{r}</button>
      ))}
    </div>
  );
}

/**
 * Editeur d'agencement — commun aux vues ordonnables (pieces, objets).
 *
 * `derived` est ce que la decouverte propose ; le hook rend `ids`, la liste
 * telle que l'utilisateur l'a arrangee, et les gestes pour la modifier.
 *
 * Le glisser-deposer suit le patron eprouve : une copie flottante suit le
 * pointeur, la grille ne bouge pas, et rien n'est enregistre avant le depot.
 */
function useLayoutEditor(cfgKey, scope, derived) {
  const [rev, setRev] = useState(0);
  const gridRef = useRef(null);
  const dragRef = useRef(null);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(-1);

  const sig = derived.join('|');
  const layout = layoutOf(cfgKey, scope);
  const ids = useMemo(() => applyLayout(layoutOf(cfgKey, scope), derived), [cfgKey, scope, sig, rev]);
  const edits = (layout.removed || []).length + (layout.added || []).length
    + ((layout.order || []).length ? 1 : 0) + Object.keys(layout.labels || {}).length
    + (layout.larges || []).length + Object.keys(layout.types || {}).length;

  const vide = (a) => (a && a.length) ? a : null;
  const write = (patch) => { setLayout(cfgKey, scope, patch); setRev(v => v + 1); };

  // Retirer : on inscrit dans `removed`. Un element ajoute a la main quitte
  // simplement `added` — inutile de le retenir deux fois.
  const remove = (id) => {
    const etaitAjoute = (layout.added || []).indexOf(id) >= 0;
    write({
      added: vide((layout.added || []).filter(x => x !== id)),
      removed: etaitAjoute ? vide(layout.removed) : vide([...(layout.removed || []).filter(x => x !== id), id]),
      order: vide((layout.order || []).filter(x => x !== id)),
    });
  };

  // Ajouter, ou retirer si deja present : la feuille de selection est une bascule.
  const toggle = (id) => {
    if (ids.indexOf(id) >= 0) { remove(id); return; }
    // Un identifiant ne peut se trouver dans `removed` que s'il etait propose :
    // lever le retrait suffit alors, sans rien ajouter.
    const etaitRetire = (layout.removed || []).indexOf(id) >= 0;
    write(etaitRetire
      ? { removed: vide((layout.removed || []).filter(x => x !== id)) }
      : { added: vide([...(layout.added || []), id]) });
  };

  // Deplacer au clavier. On enregistre l'ordre COMPLET : un ordre partiel se
  // reinterprete mal des qu'un element apparait ou disparait.
  const move = (id, delta) => {
    const list = ids.slice();
    const i = list.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    list.splice(j, 0, list.splice(i, 1)[0]);
    write({ order: list });
  };

  /**
   * Changer l'entite d'une carte, et son nom, en UNE seule ecriture.
   *
   * L'identifiant d'une carte EST son entite : en changer veut donc dire la
   * remplacer partout, position et libelle compris. Retirer puis rajouter
   * perdrait les deux, et deux `write` successifs liraient le meme `layout`
   * perime — le second effacerait le premier.
   */
  const replace = (id, neuf, nom) => {
    const cible = (neuf && neuf !== id) ? neuf : id;
    const labels = { ...(layout.labels || {}) };
    const propre = String(nom == null ? (labels[id] || '') : nom).trim();
    delete labels[id];
    if (propre) labels[cible] = propre; else delete labels[cible];
    const patchLabels = Object.keys(labels).length ? labels : null;
    if (cible === id) { write({ labels: patchLabels }); return; }

    // L'ancien ne doit pas revenir par la decouverte ; le nouveau ne doit pas
    // rester barre s'il en venait.
    let added = (layout.added || []).filter(x => x !== id && x !== cible);
    if (derived.indexOf(cible) < 0) added = [...added, cible];
    let removed = (layout.removed || []).filter(x => x !== id && x !== cible);
    if (derived.indexOf(id) >= 0) removed = [...removed, id];
    // L'ordre garde la place de la carte. S'il etait vide, on fige l'ordre
    // affiche : sans lui la carte remplacee sauterait en fin de grille.
    const base = (layout.order || []).length ? layout.order : ids;
    write({ added: vide(added), removed: vide(removed), order: vide(base.map(x => (x === id ? cible : x))), labels: patchLabels });
  };
  const rename = (id, nom) => replace(id, id, nom);

  const reset = () => write({ removed: null, added: null, order: null, labels: null, larges: null, types: null });
  const labelOf = (id) => labelIn(layout, id);
  /* Largeur d'une carte : double = deux emplacements côte à côte, sur toutes
   * les vues à grille. Rangée dans le layout, comme l'ordre et les libellés. */
  const estLarge = (id) => (layout.larges || []).indexOf(id) >= 0;
  const basculerLarge = (id) => {
    const l = layout.larges || [];
    write({ larges: vide(l.indexOf(id) >= 0 ? l.filter(x => x !== id) : [...l, id]) });
  };
  /* TYPE de carte choisi pour une entité (catalogue des vues custom : jauge,
   * graphique, grand chiffre…) — même personnalisation sur les vues intégrées.
   * Absent = le rendu par défaut de la vue. */
  const typeOf = (id) => (layout.types || {})[id] || null;
  const setType = (id, t) => {
    const types = { ...(layout.types || {}) };
    if (t) types[id] = t; else delete types[id];
    write({ types: Object.keys(types).length ? types : null });
  };

  // Les positions de la grille sont mesurees une fois : elle ne bouge pas
  // pendant le geste, ces reperes restent donc justes sans remesurer.
  const dragStart = (id, e) => {
    const grid = gridRef.current;
    const hote = e.currentTarget && e.currentTarget.parentNode;
    if (!grid || !hote) return;
    const doc = hote.ownerDocument || document;
    // On repere les cases par leur identifiant, pas par leur rang : des titres
    // de section coupent la liste en plusieurs grilles, et le rang dans le DOM
    // ne correspondrait plus au rang dans la liste.
    const cases = Array.prototype.slice.call(grid.querySelectorAll('[data-id]')).map(el => {
      const b = el.getBoundingClientRect();
      return { id: el.getAttribute('data-id'), cx: b.left + b.width / 2, cy: b.top + b.height / 2 };
    });

    dragRef.current = { id, cases, hote, doc, fantome: null, x0: e.clientX, y0: e.clientY, cible: ids.indexOf(id), parti: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {}
    e.preventDefault();
    e.stopPropagation();
  };

  const dragMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.parti) {
      // En deca du seuil, l'intention est de cliquer, pas de deplacer.
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      d.parti = true;
      // La copie qui suivra le pointeur. On retire ses commandes : un fantome
      // ne se clique pas, et un « × » flottant sous le curseur prete a
      // confusion.
      d.fantome = d.hote.cloneNode(true);
      Array.prototype.slice.call(d.fantome.querySelectorAll('[data-drag-ui]')).forEach(n => n.remove());
      const r = d.hote.getBoundingClientRect();
      const st = d.fantome.style;
      st.position = 'fixed'; st.left = r.left + 'px'; st.top = r.top + 'px';
      st.width = r.width + 'px'; st.height = r.height + 'px'; st.margin = '0';
      st.pointerEvents = 'none'; st.zIndex = '9999'; st.opacity = '.85';
      st.transform = 'scale(1.02)'; st.transition = 'none';
      st.boxShadow = '0 18px 44px rgba(0,0,0,.5)';
      d.doc.body.appendChild(d.fantome);
      setDragId(d.id);
      setDragOver(ids.indexOf(d.id));
    }
    // Ecriture directe du style : un rendu React a chaque mouvement saccaderait.
    d.fantome.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.02)';
    let proche = null, dist = Infinity;
    d.cases.forEach(c => {
      const dd = (e.clientX - c.cx) * (e.clientX - c.cx) + (e.clientY - c.cy) * (e.clientY - c.cy);
      if (dd < dist) { dist = dd; proche = c.id; }
    });
    const best = proche == null ? -1 : ids.indexOf(proche);
    if (best >= 0 && best !== d.cible) { d.cible = best; setDragOver(best); }
  };

  /** Rend true si le geste etait un appui bref — donc un clic, non un deplacement. */
  const dragEnd = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragId(null);
    setDragOver(-1);
    if (!d) return false;
    if (!d.parti) return true;
    try { if (d.fantome) d.fantome.remove(); } catch (x) {}
    const from = ids.indexOf(d.id);
    // Repose a sa place : rien a enregistrer, on ne salit pas la configuration.
    if (from < 0 || d.cible < 0 || d.cible === from) return false;
    const order = ids.slice();
    order.splice(d.cible, 0, order.splice(from, 1)[0]);
    write({ order });
    return false;
  };

  return { ids, edits, layout, gridRef, dragId, dragOver, dragStart, dragMove, dragEnd, remove, toggle, move, rename, replace, reset, labelOf, estLarge, basculerLarge, typeOf, setType };
}

/**
 * Fiche d'une carte : ce qu'on peut en changer sans quitter la vue.
 *
 * `id` peut designer une carte native (`obj:…`), un intertitre (`sect:…`) ou
 * une entite. Le nom est toujours modifiable ; l'entite ne l'est pas — en
 * changer reviendrait a changer de carte, ce que le retrait et l'ajout font
 * deja, plus clairement.
 */
function CardEditSheet({ ed, id, nom, origine, hass, onClose }) {
  const [val, setVal] = useState(ed.labelOf(id) || '');
  const estSection = id.indexOf('sect:') === 0;
  // Un poste de consommation s'appelle `dev:<entity_id>` : le prefixe cachait
  // l'entite au test, et la fiche ne proposait alors que le nom.
  const prefixe = id.indexOf('dev:') === 0 ? 'dev:' : '';
  const brut = prefixe ? id.slice(prefixe.length) : id;
  const estEntite = brut.indexOf('.') > 0 && brut.indexOf(':') < 0;
  const S = (hass && hass.states) || {};
  const [ent, setEnt] = useState(estEntite ? brut : '');
  const dom = estEntite ? brut.slice(0, brut.indexOf('.')) : '';
  const dlId = 'o-cardent-' + (dom || 'x');
  // Meme domaine seulement : un poste de puissance n'a rien a faire sur une
  // lampe, et la liste complete est illisible.
  const options = useMemo(
    () => (estEntite ? Object.keys(S).filter(k => k.indexOf(dom + '.') === 0).sort() : []),
    [dom, estEntite, Object.keys(S).length]);
  const cible = estEntite && String(ent).trim() ? prefixe + String(ent).trim() : id;
  const etat = S[cible.indexOf(':') >= 0 ? cible.slice(cible.indexOf(':') + 1) : cible];

  const valider = (close) => { ed.replace(id, cible, val); close(); };
  const champ = { width: '100%', boxSizing: 'border-box', padding: '10px 13px', borderRadius: 11, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 13.5, fontWeight: 600 };
  const etiquette = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', margin: '14px 2px 7px' };

  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <div style={{ padding: '4px 2px 8px' }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{estSection ? 'Intertitre' : nom}</div>
          <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, marginTop: 3 }}>
            {estSection
              ? 'Sépare les cartes en catégories. Il n’apparaît que s’il a des cartes en dessous.'
              : 'Ce nom ne vaut que pour cette vue ; Home Assistant n’est pas modifié.'}
          </div>

          <div style={etiquette}>NOM</div>
          <input value={val} onChange={(e) => setVal(e.target.value)} placeholder={origine || nom}
            onKeyDown={(e) => { if (e.key === 'Enter') valider(close); }} style={champ} autoFocus />
          {!estSection && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', margin: '6px 2px 0' }}>
            Laisse vide pour revenir à « {origine || nom} ».
          </div>}

          {estEntite && (
            <>
              <div style={etiquette}>{tr('ENTITÉ')}</div>
              <datalist id={dlId}>{options.map(k => <option key={k} value={k} />)}</datalist>
              <input value={ent} onChange={(e) => setEnt(e.target.value)} list={dlId} spellCheck={false}
                placeholder={dom + '.…'} onKeyDown={(e) => { if (e.key === 'Enter') valider(close); }} style={champ} />
              <div style={{ fontSize: 11.5, fontWeight: 600, color: etat ? 'var(--o-text3)' : 'var(--o-warn2)', margin: '6px 2px 0' }}>
                {etat ? 'État actuel : ' + etat.state : 'Home Assistant ne connaît pas cette entité.'}
              </div>
            </>
          )}

          {(estEntite || id.indexOf('zone:') === 0) && ed.typeOf && (
            <>
              <div style={etiquette}>{tr('CARTE')}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(() => { const noms = CV_TYPE_NOMS(); const choix = ed.typeOf(id); return [[null, tr('Auto')], ...cvTypesPour(brut).map(t => [t, noms[t] || t])].map(([t, lbl2]) => { const on = choix === t; return (
                  <button key={String(t)} aria-pressed={on} onClick={() => ed.setType(id, t)}
                    style={{ padding: '7px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: '1px solid ' + (on ? 'var(--o-accent)' : 'var(--o-bd1)'), background: on ? 'rgba(var(--o-accent-rgb),.16)' : 'var(--o-s2)', color: on ? 'var(--o-accent-soft)' : 'var(--o-text1)' }}>{lbl2}</button>
                ); }); })()}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', margin: '6px 2px 0' }}>{tr('« Auto » : le rendu habituel de cette vue.')}</div>
            </>
          )}
          {!estSection && ed.estLarge && (
            <>
              <div style={etiquette}>{tr('LARGEUR')}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[[false, tr('Simple')], [true, tr('Double')]].map(([lg, lbl2]) => { const on = ed.estLarge(id) === lg; return (
                  <button key={lbl2} aria-pressed={on} onClick={() => { if (!on) ed.basculerLarge(id); }}
                    style={{ flex: 1, padding: '10px 8px', borderRadius: 11, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, border: 'var(--o-bw,1px) solid ' + (on ? 'var(--o-accent)' : 'var(--o-bd2)'), background: on ? 'rgba(var(--o-accent-rgb),.16)' : 'var(--o-s1)', color: on ? 'var(--o-accent-soft)' : 'var(--o-text1)' }}>{lbl2}</button>
                ); })}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', margin: '6px 2px 0' }}>{tr('Double : la carte prend deux emplacements côte à côte.')}</div>
            </>
          )}
          <div style={{ display: 'flex', gap: 9, marginTop: 20, flexWrap: 'wrap' }}>
            <button onClick={() => valider(close)} style={{ flex: 1, minWidth: 130, padding: '11px 0', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, background: 'var(--o-accent)', color: '#06121f' }}>Enregistrer</button>
            <button onClick={() => { ed.remove(id); close(); }} style={{ padding: '11px 16px', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'rgba(var(--o-bad-rgb),.14)', border: '1px solid rgba(var(--o-bad-rgb),.4)', color: 'var(--o-bad)' }}>Retirer</button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

/**
 * Enveloppe d'une carte en mode edition : voile de saisie, bouton de retrait,
 * et le retour visuel du glissement.
 *
 * Le voile capte le geste ET neutralise les commandes de la carte. En mode
 * edition on range ses cartes, on ne pilote pas ses appareils : les deux gestes
 * ne doivent pas se disputer le meme pointeur.
 */
/** `plat` : un intertitre ne fait que ~35 px de haut — un « × » debordant de
 *  9 px y mord sur l'element du dessus. On le rentre alors dans le cadre. */
function EditableCard({ ed, id, nom, onEdit, plat = false, children }) {
  const saisie = ed.dragId === id;
  const visee = !!ed.dragId && ed.dragOver === ed.ids.indexOf(id) && !saisie;
  return (
    <div data-id={id} className={ed.estLarge && ed.estLarge(id) ? 'o-cvw2' : undefined} style={{
      position: 'relative', borderRadius: 'var(--o-radius,20px)',
      outline: visee ? '2px dashed var(--o-accent)' : '1px dashed rgba(var(--o-accent-rgb),.45)',
      outlineOffset: 3,
      opacity: saisie ? .3 : 1,
      transition: REDUCE_MOTION ? 'none' : 'opacity .16s, outline-color .16s',
    }}>
      {children}
      <div
        data-drag-ui="1" role="button" tabIndex={0}
        onPointerDown={(e) => ed.dragStart(id, e)}
        onPointerMove={ed.dragMove}
        onPointerUp={() => { const clic = ed.dragEnd(); if (clic && onEdit) onEdit(id); }}
        onPointerCancel={ed.dragEnd}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); ed.move(id, -1); }
          else if (e.key === 'ArrowRight') { e.preventDefault(); ed.move(id, 1); }
          else if ((e.key === 'Enter' || e.key === ' ') && onEdit) { e.preventDefault(); onEdit(id); }
        }}
        title={tr('Cliquer pour modifier · glisser pour déplacer (flèches ← →)')}
        aria-label={'Modifier ou déplacer ' + (nom || id)}
        style={{ position: 'absolute', inset: 0, zIndex: 2, borderRadius: 'var(--o-radius,20px)', touchAction: 'none', cursor: saisie ? 'grabbing' : 'grab' }} />
      <button data-drag-ui="1" onClick={() => ed.remove(id)} title="Retirer" aria-label={'Retirer ' + (nom || id)}
        style={{ position: 'absolute', ...(plat ? { top: '50%', right: 7, transform: 'translateY(-50%)' } : { top: -9, right: -9 }), zIndex: 3, width: 26, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--o-bad)', color: '#fff', fontSize: 15, fontWeight: 800, lineHeight: 1, boxShadow: '0 3px 10px rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>×</button>
      {!plat && ed.basculerLarge && (
        <button data-drag-ui="1" onClick={() => ed.basculerLarge(id)} title={ed.estLarge(id) ? tr('Largeur simple') : tr('Largeur double')} aria-pressed={ed.estLarge(id)}
          style={{ position: 'absolute', bottom: -9, right: -9, zIndex: 3, width: 26, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer', background: ed.estLarge(id) ? 'var(--o-accent)' : 'var(--o-surfA)', color: ed.estLarge(id) ? '#fff' : 'var(--o-text1)', boxShadow: '0 3px 10px rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><Fi i="arrows-h" size={11} /></button>
      )}
    </div>
  );
}

// Domaines proposables dans une piece. Le reste — automatisations, mises a
// jour, entites de diagnostic — n'a rien a faire sur une carte d'ambiance.
const ROOM_ADD_DOMAINS = ['light', 'switch', 'cover', 'climate', 'media_player', 'fan',
  'lock', 'vacuum', 'sensor', 'binary_sensor', 'humidifier', 'water_heater', 'number', 'input_boolean'];

/**
 * Feuille d'ajout d'appareils a une piece.
 *
 * `present` : ce que la piece affiche deja. `onToggle(id)` ajoute ou retire.
 * La feuille reste ouverte : on compose sa piece d'un coup, pas entite par
 * entite avec un aller-retour a chaque fois.
 */
/**
 * Feuille d'ajout, commune aux vues.
 *
 * `room` nomme une zone Home Assistant dont on propose les entites d'emblee ;
 * sans elle, seule la recherche opere — c'est le cas des vues par domaine.
 * `domaines` restreint ce qu'on peut ajouter : proposer un radiateur dans la
 * vue Lumieres n'aurait pas de sens.
 */
function RoomAddSheet({ room = null, hass, present = [], onToggle, onClose, domaines = ROOM_ADD_DOMAINS, entete = null }) {
  const [q, setQ] = useState('');
  const S = (hass && hass.states) || {};
  const nom = (id) => (S[id] && S[id].attributes && S[id].attributes.friendly_name) || id;
  const domaineOk = (id) => domaines.indexOf(id.slice(0, id.indexOf('.'))) >= 0;

  // Entites de la zone Home Assistant homonyme : le plus souvent, la reponse.
  const zoneIds = useMemo(() => {
    const ix = LOGGIA_INDEX;
    if (!ix || !ix.areaList) return [];
    const cible = String(room).toLowerCase();
    const a = ix.areaList.find(x => String(x.name).toLowerCase() === cible);
    return (a && room) ? (a.entities || []).filter(domaineOk) : [];
  }, [room, domaines.join('|')]);

  const tous = useMemo(() => Object.keys(S).filter(domaineOk).sort(), [Object.keys(S).length, domaines.join('|')]);

  const terme = q.trim().toLowerCase();
  const trouves = terme
    ? tous.filter(id => id.toLowerCase().indexOf(terme) >= 0 || String(nom(id)).toLowerCase().indexOf(terme) >= 0).slice(0, 60)
    : [];

  const Ligne = ({ id }) => {
    const on = present.indexOf(id) >= 0;
    return (
      <div role="checkbox" aria-checked={on} tabIndex={0} onClick={() => onToggle(id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(id); } }}
        style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 11, cursor: 'pointer', border: '1px solid ' + (on ? 'rgba(var(--o-accent-rgb),.4)' : 'var(--o-bd3)'), background: on ? 'rgba(var(--o-accent-rgb),.11)' : 'var(--o-s2)' }}>
        <span style={{ width: 19, height: 19, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--o-accent)' : 'transparent', border: on ? 'none' : '1.5px solid var(--o-bd1)' }}>
          {on && <Fi i="check" size={10} color="#06121f" />}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nom(id)}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{id}</div>
        </div>
      </div>
    );
  };

  const titre = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', margin: '14px 2px 8px' };

  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <div style={{ padding: '4px 2px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{entete || ('Ajouter à ' + room)}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' }}>{present.length > 1 ? tr('{n} appareils', { n: present.length }) : tr('{n} appareil', { n: present.length })}</div>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, marginBottom: 12 }}>
            Coche pour ajouter, décoche pour retirer. Les modifications s'appliquent tout de suite.
          </div>

          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Rechercher une entité…')}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 13px', borderRadius: 11, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 13, fontWeight: 600 }} />

          {!terme && zoneIds.length > 0 && (
            <>
              <div style={titre}>DANS LA ZONE « {String(room).toUpperCase()} » ({zoneIds.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {zoneIds.map(id => <Ligne key={id} id={id} />)}
              </div>
            </>
          )}
          {!terme && !zoneIds.length && (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', margin: '14px 2px 0', lineHeight: 1.5 }}>
              Aucune zone Home Assistant ne porte ce nom. Utilise la recherche ci-dessus — ou range tes appareils dans une zone, ils apparaîtront ici d'eux-mêmes.
            </div>
          )}
          {terme && (
            <>
              <div style={titre}>{trouves.length ? trouves.length + ' RÉSULTAT' + (trouves.length > 1 ? 'S' : '') : 'AUCUN RÉSULTAT'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {trouves.map(id => <Ligne key={id} id={id} />)}
              </div>
            </>
          )}

          <button onClick={close} style={{ marginTop: 18, width: '100%', padding: '11px 0', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, background: 'var(--o-accent)', color: '#06121f' }}>{tr('Terminé')}</button>
        </div>
      )}
    </BottomSheet>
  );
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

/** Une entité quelconque, rendue par son domaine — le legо de la fiche.
 * `surEpingle` (fiche seulement) affiche la punaise : épingler remonte la
 * ligne en tête de fiche ET l'invite sur la carte de l'appareil. */
function LigneEntite({ id, hass, nom = null, surEpingle = null, epingle = false }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const dom = String(id).split('.')[0];
  const label = nom || (a.friendly_name || id).replace(/^[^:]*: ?/, '');
  const call = (d, s, data) => { try { if (hass && hass.callService) hass.callService(d, s, { entity_id: id, ...(data || {}) }); } catch (e) {} };
  const mort = !st || st.state === 'unavailable';
  /* Optimisme : l'écran répond au doigt, Home Assistant confirme après.
   * Sans lui, chaque clic attend l'aller-retour Zigbee PUIS le poll — mou.
   * `opt` tient une FENÊTRE FIXE (pas « jusqu'au premier changement d'état ») :
   * Zigbee2MQTT rejoue parfois l'ancienne valeur après la confirmation, et
   * suivre ce rapport retardé faisait clignoter 1 → 2 → 1 à l'écran. */
  const [opt, setOpt] = useState(null);
  const commitRef = useRef(null);
  const filetRef = useRef(null);
  useEffect(() => () => { clearTimeout(commitRef.current); clearTimeout(filetRef.current); }, []);
  const poserOpt = (v) => { setOpt(v); clearTimeout(filetRef.current); filetRef.current = setTimeout(() => setOpt(null), 4000); };
  let controle = null, wrap = false;
  if (dom === 'switch' || dom === 'input_boolean' || dom === 'siren') {
    const on = opt != null ? opt === 'on' : (!!st && st.state === 'on');
    const basculer = () => { poserOpt(on ? 'off' : 'on'); call('homeassistant', 'toggle'); };
    controle = <span role="switch" aria-checked={on} tabIndex={0} aria-label={label} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculer(); } }} onClick={basculer} style={{ width: 42, height: 24, borderRadius: 12, background: on ? 'var(--o-accent)' : 'var(--o-bd1)', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background .25s' }}><span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .3s cubic-bezier(.34,1.56,.64,1)' }} /></span>;
  } else if (dom === 'number' || dom === 'input_number') {
    const v = opt != null ? +opt : (st ? parseFloat(st.state) : NaN);
    const pas = a.step != null ? +a.step : 1;
    const borne = (x) => Math.min(a.max != null ? +a.max : Infinity, Math.max(a.min != null ? +a.min : -Infinity, x));
    // Des clics rapprochés ne partent qu'une fois : la valeur bouge à l'écran,
    // l'appel de service attend 450 ms de calme — comme les sliders au pointerup.
    const poser = (x) => {
      const nv = Math.round(borne(x) * 100) / 100;
      poserOpt(nv);
      clearTimeout(commitRef.current);
      commitRef.current = setTimeout(() => call(dom, 'set_value', { value: nv }), 450);
    };
    const btn = { width: 30, height: 30, borderRadius: 9, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s1)', color: 'var(--o-text)', fontWeight: 800, fontSize: 15, cursor: 'pointer', flexShrink: 0 };
    controle = (<>
      <button style={btn} aria-label={'− ' + label} onClick={() => !isNaN(v) && poser(v - pas)}>−</button>
      <span style={{ minWidth: 44, textAlign: 'center', fontSize: 13.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{isNaN(v) ? '—' : Math.round(v * 100) / 100}{a.unit_of_measurement ? ' ' + a.unit_of_measurement : ''}</span>
      <button style={btn} aria-label={'+ ' + label} onClick={() => !isNaN(v) && poser(v + pas)}>+</button>
    </>);
  } else if (dom === 'select' || dom === 'input_select') {
    const opts = Array.isArray(a.options) ? a.options : [];
    const cur = opt != null ? opt : (st ? st.state : null);
    wrap = true;
    controle = (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '70%' }}>
        {opts.slice(0, 8).map(o => { const on = cur === o; return (
          <button key={o} onClick={() => { poserOpt(o); call(dom, 'select_option', { option: o }); }} aria-pressed={on}
            style={{ padding: '5px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, border: '1px solid ' + (on ? 'var(--o-accent)' : 'var(--o-bd1)'), background: on ? 'rgba(var(--o-accent-rgb),.16)' : 'var(--o-s2)', color: on ? 'var(--o-accent-soft)' : 'var(--o-text1)' }}>{o}</button>
        ); })}
      </div>
    );
  } else if (dom === 'button' || dom === 'input_button' || dom === 'scene' || dom === 'script') {
    const svc = dom === 'scene' || dom === 'script' ? [dom, 'turn_on'] : [dom, 'press'];
    controle = <button onClick={() => call(svc[0], svc[1])} style={{ padding: '7px 13px', borderRadius: 10, background: 'rgba(var(--o-accent-rgb),.14)', border: 'none', color: 'var(--o-accent-soft)', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>{tr('Exécuter')}</button>;
  } else if (dom === 'binary_sensor') {
    const on = !!st && st.state === 'on';
    const grave = ['smoke', 'gas', 'moisture', 'problem', 'safety', 'carbon_monoxide'].indexOf(a.device_class) >= 0;
    controle = <span style={{ fontSize: 12.5, fontWeight: 800, color: on ? (grave ? 'var(--o-bad)' : 'var(--o-warn)') : 'var(--o-text3)' }}>{on ? tr('Détecté') : 'RAS'}</span>;
  } else {
    // sensor et le reste : la valeur, lisible. Une valeur VIDE ou inconnue ne
    // mérite pas sa ligne — le vide n'informe personne.
    const brut = st ? st.state : null;
    if (brut === '' || brut === 'unknown' || brut == null) return null;
    const n = parseFloat(brut);
    const rel = /^\d{4}-\d\d-\d\dT/.test(String(brut)) ? relTime(brut) : null;
    const bat = a.device_class === 'battery' && !isNaN(n);
    controle = (
      <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: bat ? (n < 20 ? 'var(--o-bad)' : n < 50 ? 'var(--o-warn)' : 'var(--o-ok)') : 'var(--o-text)' }}>
        {mort ? '—' : rel || (isNaN(n) ? String(brut) : Math.round(n * 100) / 100)}{!rel && a.unit_of_measurement ? ' ' + a.unit_of_measurement : ''}
      </span>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', opacity: mort ? .5 : 1, flexWrap: wrap ? 'wrap' : 'nowrap' }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {controle}
      {surEpingle && (
        <button onClick={() => surEpingle(id)} title={epingle ? tr('Désépingler') : tr('Épingler sur la carte')} aria-pressed={epingle}
          style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: epingle ? 'rgba(var(--o-accent-rgb),.18)' : 'transparent', color: epingle ? 'var(--o-accent-soft)' : 'var(--o-text3)', opacity: epingle ? 1 : .55 }}>
          <Fi i="thumbtack" size={12} />
        </button>
      )}
    </div>
  );
}

/* ── ÉPINGLES : la curation par l'usage ──────────────────────────────────────
 * Le schéma générique montre tout au même niveau ; l'épingle laisse le foyer
 * dire ce qui compte. Une entité épinglée remonte en tête de fiche ET s'invite
 * sur la carte de son appareil. Partagé maison via la configuration (cfgSet). */
const lireEpingles = () => { const v = cfgVal('loggia_epingles', null); return Array.isArray(v) ? v : []; };
function Epingles({ pourId, hass, max = 3, avecAncre = false }) {
  const { index } = useLoggia();
  const S = (hass && hass.states) || {};
  const eps = lireEpingles();
  if (!eps.length || !index || !index.entityMeta) return null;
  const meta = index.entityMeta.get(pourId);
  const devId = meta && meta.deviceId;
  if (!devId) return null;
  // `avecAncre` : les cartes machines (Objets) ont une ancre arbitraire — elle
  // aussi peut être épinglée ; une CvCard, elle, montre déjà son entité.
  const liste = eps.filter(eid => (avecAncre || eid !== pourId) && (index.entityMeta.get(eid) || {}).deviceId === devId && S[eid]).slice(0, max);
  if (!liste.length) return null;
  // La carte parente s'ouvre au clic : les épingles agissent SANS ouvrir.
  return (
    <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} style={{ marginTop: 10 }}>
      {liste.map(eid => <LigneEntite key={eid} id={eid} hass={hass} nom={(index.entityMeta.get(eid) || {}).name || undefined} />)}
    </div>
  );
}

function FicheAppareil({ id, hass, onClose }) {
  const { index } = useLoggia();
  const dc = useDomainCards(hass);
  const [diagOuvert, setDiagOuvert] = useState(false);
  // Épingles : état local pour un retour visuel immédiat, cfgSet pour la maison.
  const [eps, setEps] = useState(lireEpingles);
  const basculer = (eid) => {
    const suiv = eps.indexOf(eid) >= 0 ? eps.filter(x => x !== eid) : eps.concat(eid);
    setEps(suiv);
    cfgSet({ loggia_epingles: suiv.length ? suiv : null });
  };
  const S = (hass && hass.states) || {};
  const meta = index && index.entityMeta ? index.entityMeta.get(id) : null;
  const devId = meta && meta.deviceId;
  // Toutes les entités vivantes du même appareil ; sans registre, l'entité seule.
  const soeurs = [];
  if (devId && index && index.entityMeta) {
    index.entityMeta.forEach((m, eid) => {
      if (m.deviceId === devId && S[eid] && !m.hidden && !m.disabled && eid.indexOf('update.') !== 0 && eid.indexOf('device_tracker.') !== 0) soeurs.push({ id: eid, m });
    });
  }
  if (!soeurs.length) soeurs.push({ id, m: meta || {} });
  // La fiche vit à son rythme : le poll de la vue derrière ne connaît pas ces
  // entités-là — sans cet abonnement, un stepper resterait figé après le clic.
  const hassLive = useHass(soeurs.map(x => x.id));
  const H = hassLive || hass;
  const domDe = (e) => String(e).split('.')[0];
  const nomCourt = (x) => (x.m && x.m.name) || ((S[x.id] && S[x.id].attributes && S[x.id].attributes.friendly_name) || x.id);
  const nomApp = (meta && meta.device) || cvName(S[id], id);
  const dm = devId && index && index.deviceMeta ? index.deviceMeta.get(devId) : null;
  // Les pilotables en tête — l'entité tapée d'abord ; le reste par catégorie du registre.
  const pilotables = soeurs.filter(x => FICHE_PILOTABLES.indexOf(domDe(x.id)) >= 0 && !x.m.category)
    .sort((a, b) => (a.id === id ? -1 : 0) - (b.id === id ? -1 : 0));
  const restantes = soeurs.filter(x => pilotables.indexOf(x) < 0);
  // Les épinglées quittent leur section : elles vivent en tête, pas en double.
  const epinglees = restantes.filter(x => eps.indexOf(x.id) >= 0);
  const libres = restantes.filter(x => eps.indexOf(x.id) < 0);
  const principal = libres.filter(x => !x.m.category);
  const config = libres.filter(x => x.m.category === 'config');
  const diag = libres.filter(x => x.m.category === 'diagnostic');
  const triNom = (a, b) => String(nomCourt(a)).localeCompare(String(nomCourt(b)), 'fr');
  // Chaque section se replie d'un tap sur son titre. REPLIÉES par défaut :
  // la fiche s'ouvre sur l'essentiel (état, actions, épingles), le détail se
  // déplie à la demande. Les épingles, choisies par le foyer, restent visibles.
  const [replies, setReplies] = useState({});
  const section = (titre2, liste, defOuvert = false) => {
    if (!liste.length) return false;
    const ouvert = replies[titre2] != null ? replies[titre2] : defOuvert;
    return (
      <>
        <button onClick={() => setReplies(r => ({ ...r, [titre2]: !ouvert }))} aria-expanded={ouvert}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: 0, margin: '16px 0 2px', cursor: 'pointer' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)' }}>{titre2 + (ouvert ? '' : ' · ' + liste.length)}</span>
          <Fi i={ouvert ? 'angle-up' : 'angle-down'} size={11} color="var(--o-text3)" />
        </button>
        {ouvert && liste.sort(triNom).map(x => <LigneEntite key={x.id} id={x.id} hass={H} nom={nomCourt(x)} surEpingle={basculer} epingle={eps.indexOf(x.id) >= 0} />)}
      </>
    );
  };
  return (
    <BottomSheet onClose={onClose}>
      {close => (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={close} aria-label={tr('Fermer')} title={tr('Fermer')} style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--o-s1)', border: 'none', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nomApp}</div>
            {dm && (dm.manufacturer || dm.model) && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[dm.manufacturer, dm.model].filter(Boolean).join(' · ')}</div>}
          </div>
        </div>
        {pilotables.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {pilotables.slice(0, 3).map(x => <CvCard key={x.id} id={x.id} hass={H} onOpen={x.id !== id ? dc.ouvrir : null} />)}
          </div>
        )}
        {section(tr('ÉPINGLES'), epinglees, true)}
        {section(tr('COMMANDES'), principal)}
        {section(tr('RÉGLAGES'), config)}
        {diag.length > 0 && (
          <>
            <button onClick={() => setDiagOuvert(o => !o)} style={{ marginTop: 16, padding: '8px 13px', borderRadius: 10, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd3)', color: 'var(--o-text2)', fontWeight: 700, fontSize: 12, cursor: 'pointer', alignSelf: 'flex-start' }}>
              {(diagOuvert ? tr('Masquer') : tr('Afficher')) + ' ' + tr('{n} diagnostics', { n: diag.length })}
            </button>
            {diagOuvert && diag.sort(triNom).map(x => <LigneEntite key={x.id} id={x.id} hass={H} nom={nomCourt(x)} surEpingle={basculer} />)}
          </>
        )}
        {dc.sheets}
      </>)}
    </BottomSheet>
  );
}

/* ── Historique 24 h ─────────────────────────────────────────────────────────
 * Le GET history/period, partagé entre la carte graphique et les fiches.
 * `attribut` : pour un climat, la température vécue est un ATTRIBUT
 * (current_temperature) — la requête part alors sans minimal_response ni
 * no_attributes, plus lourde, réservée à une fiche ouverte. */
/* Cache module : plusieurs cartes demandent le même historique (les pièces de
 * l'accueil, une fiche rouverte) — cinq minutes de mémoire évitent de refaire
 * le même GET à chaque navigation. */
const HISTO_CACHE = new Map();
function useHistorique24(hass, id, attribut = null) {
  const cle = id ? id + '|' + (attribut || '') : null;
  const enCache = cle && HISTO_CACHE.get(cle);
  const [points, setPoints] = useState(enCache && Date.now() - enCache.t < 5 * 60000 ? enCache.serie : null);
  const api = hass && hass.callApi ? 1 : 0;
  useEffect(() => {
    if (!api || !id) return;
    let mort = false;
    const frais = HISTO_CACHE.get(cle);
    if (frais && Date.now() - frais.t < 5 * 60000) setPoints(frais.serie);
    const lire = () => {
      const debut = new Date(Date.now() - 24 * 3600e3).toISOString();
      const q = 'history/period/' + debut + '?filter_entity_id=' + encodeURIComponent(id) + (attribut ? '' : '&minimal_response&no_attributes');
      hass.callApi('GET', q)
        .then(r => {
          if (mort) return;
          const brut = Array.isArray(r) && r[0] ? r[0] : [];
          const serie = brut
            .map(p => ({ t: new Date(p.last_changed || p.last_updated || 0).getTime(), v: parseFloat(attribut ? (p.attributes ? p.attributes[attribut] : NaN) : p.state) }))
            .filter(p => !isNaN(p.v));
          HISTO_CACHE.set(cle, { t: Date.now(), serie });
          setPoints(serie);
        }).catch(() => { if (!mort) setPoints([]); });
    };
    if (!frais || Date.now() - frais.t >= 5 * 60000) lire();
    const iv = setInterval(lire, 5 * 60000);
    return () => { mort = true; clearInterval(iv); };
  }, [api, id, attribut]);
  return points;
}

/* La courbe d'une fiche : le filigrane de la carte graphique, en plus grand,
 * avec ses bornes et son axe du temps. */
function Courbe24({ points, couleur = 'var(--o-accent)', unite = '' }) {
  let chemin = '', aire = '', vmin = null, vmax = null;
  if (points && points.length > 1) {
    const t0 = points[0].t, t1 = points[points.length - 1].t || t0 + 1;
    vmin = Math.min(...points.map(p => p.v)); vmax = Math.max(...points.map(p => p.v));
    const plat = vmax === vmin; // une valeur constante se trace au milieu, pas collée en bas
    const spread = (vmax - vmin) || 1;
    const X = (t) => ((t - t0) / (t1 - t0 || 1)) * 100;
    const Y = (v) => plat ? 21 : 36 - ((v - vmin) / spread) * 30;
    chemin = points.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' ');
    aire = chemin + ' L 100 40 L 0 40 Z';
  }
  const fmt = (x) => Math.round(x * 10) / 10;
  return (
    <div>
      <div style={{ position: 'relative', height: 110, borderRadius: 12, background: 'var(--o-s1)', overflow: 'hidden' }}>
        {chemin ? (
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <path d={aire} fill={hx(couleur, .12)} />
            <path d={chemin} fill="none" stroke={couleur} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>
            {points === null ? tr('Chargement…') : tr("Pas d'historique sur 24 h")}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 10.5, fontWeight: 600, color: 'var(--o-text3)' }}>
        <span>{tr('il y a 24 h')}</span>
        {vmin != null && <span style={{ fontWeight: 700, color: 'var(--o-text2)' }}>{tr('min {a} · max {b}', { a: fmt(vmin) + unite, b: fmt(vmax) + unite })}</span>}
        <span>{tr('maintenant')}</span>
      </div>
    </div>
  );
}

/* Fiche d'un capteur : la valeur en grand et sa journée. */
function SensorSheet({ id, hass, onClose }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const points = useHistorique24(hass, id);
  const n = st ? parseFloat(st.state) : NaN;
  const unite = a.unit_of_measurement || '';
  return (
    <BottomSheet onClose={onClose}>
      {close => (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={close} aria-label={tr('Fermer')} title={tr('Fermer')} style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--o-s1)', border: 'none', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          <span style={{ flex: 1, fontSize: 19, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cvName(st, id)}</span>
        </div>
        <div style={{ textAlign: 'center', margin: '16px 0 18px' }}>
          <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{isNaN(n) ? (st ? st.state : '—') : Math.round(n * 10) / 10}</span>
          {unite && <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--o-text2)', marginLeft: 6 }}>{unite}</span>}
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', margin: '0 0 9px' }}>{tr('DERNIÈRES 24 H')}</div>
        <Courbe24 points={points} unite={unite} />
      </>)}
    </BottomSheet>
  );
}

function useDomainCards(hass) {
  const S = (hass && hass.states) || {};
  const [lightPop, setLightPop] = useState(null);
  const [climPop, setClimPop] = useState(null);
  const [pilotPop, setPilotPop] = useState(null);
  const [coverPop, setCoverPop] = useState(null);
  const [mediaPop, setMediaPop] = useState(null);
  const [sensPop, setSensPop] = useState(null);
  const [appPop, setAppPop] = useState(null);
  // La fiche du domaine, depuis n'importe quelle carte — la compacte ouvre la
  // même popup que la riche. Tout ce qui n'a pas de fiche dédiée reçoit la
  // FICHE APPAREIL UNIVERSELLE : l'appareil entier, rendu par le registre.
  const ouvrir = (id) => {
    const d = String(id).split('.')[0];
    const st = S[id]; const a = (st && st.attributes) || {};
    if (d === 'light') {
      const modes = a.supported_color_modes || [];
      const rgb = modes.some(m => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].indexOf(m) >= 0);
      const ct = modes.indexOf('color_temp') >= 0;
      const dimmable = rgb || ct || modes.indexOf('brightness') >= 0 || a.brightness != null;
      if (!dimmable) { setAppPop(id); return; } // rien à régler sur la lampe : l'appareil, alors
      const color = a.rgb_color ? '#' + a.rgb_color.map(v => v.toString(16).padStart(2, '0')).join('') : null;
      setLightPop({ id, name: a.friendly_name || id, on: !!st && st.state === 'on', bri: a.brightness != null ? Math.round(a.brightness / 255 * 100) : 100, color, rgb, ct, dimmable, lc: st && st.last_changed });
    } else if (d === 'climate') setClimPop(id);
    else if (d === 'cover') setCoverPop(id);
    else if (d === 'media_player') setMediaPop(id);
    else if (d === 'sensor') setSensPop(id);
    else setAppPop(id);
  };
  const card = (id, label = null, zone = null) => {
    const d = String(id).split('.')[0];
    return zone ? <RoomPilotCard zone={zone} hass={hass} onOpen={setPilotPop} titre={label} />
      : (d === 'light' || d === 'switch') ? <RoomLightCard id={id} hass={hass} onOpen={setLightPop} label={label} />
        : d === 'cover' ? <RoomCoverCard id={id} hass={hass} onOpen={setCoverPop} titre={label} />
          : d === 'climate' ? <RoomClimateCard id={id} hass={hass} onOpen={setClimPop} label={label} />
            : d === 'media_player' ? <RoomMediaCard id={id} hass={hass} onOpen={setMediaPop} label={label} />
              : <CvCard id={id} hass={hass} label={label} onOpen={ouvrir} />;
  };
  const sheets = (
    <>
      {lightPop && <RoomLightSheet light={lightPop} hass={hass} onClose={() => setLightPop(null)} />}
      {climPop && <RoomClimateSheet id={climPop} hass={hass} onClose={() => setClimPop(null)} />}
      {pilotPop && (() => { const z = climateZones(S).find(x => x.id === pilotPop); return z ? <RoomPilotSheet zone={z} hass={hass} onClose={() => setPilotPop(null)} /> : null; })()}
      {coverPop && <RoomCoverSheet id={coverPop} hass={hass} onClose={() => setCoverPop(null)} />}
      {mediaPop && <RoomMediaSheet id={mediaPop} hass={hass} onClose={() => setMediaPop(null)} />}
      {sensPop && <SensorSheet id={sensPop} hass={hass} onClose={() => setSensPop(null)} />}
      {appPop && <FicheAppareil id={appPop} hass={hass} onClose={() => setAppPop(null)} />}
    </>
  );
  const fermer = () => { setLightPop(null); setClimPop(null); setPilotPop(null); setCoverPop(null); setMediaPop(null); setSensPop(null); setAppPop(null); };
  return { card, sheets, fermer, ouvrir };
}

/* ── Journal d'activite d'une piece ──────────────────────────────────────────
 * Le logbook de Home Assistant, restreint aux entites de la piece.
 * `logbook/event_stream` est une SOUSCRIPTION : un premier paquet livre les
 * dernieres 24 h, puis HA pousse chaque evenement nouveau — aucun poll, meme
 * regime que les cartes template. Le logbook ecarte deja de lui-meme les
 * capteurs continus (temperatures…) : ce qui arrive est un CHANGEMENT digne
 * d'etre raconte. Idee reprise de GlassHome. */
function useRoomLogbook(hass, ids) {
  // `ids = null` : le journal de TOUTE la maison — le logbook écarte déjà de
  // lui-même les capteurs continus, ce qui arrive mérite d'être raconté.
  const [events, setEvents] = useState([]);
  const conn = hass && hass.connection;
  const sig = ids ? ids.join('|') : '*';
  useEffect(() => {
    setEvents([]);
    if (!conn || (ids && !ids.length)) return;
    let unsub = null, mort = false;
    const debut = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    conn.subscribeMessage((msg) => {
      if (mort || !msg || !Array.isArray(msg.events) || !msg.events.length) return;
      setEvents(prev => {
        const tous = [...prev, ...msg.events.filter(e => e && e.entity_id && e.state !== 'unknown' && e.state !== 'unavailable')];
        tous.sort((a, b) => (b.when || 0) - (a.when || 0));
        return tous.slice(0, 30);
      });
    }, { type: 'logbook/event_stream', start_time: debut, ...(ids ? { entity_ids: ids } : {}) })
      .then(u => { if (mort) { try { u(); } catch (e) {} } else unsub = u; })
      .catch(() => {}); // logbook absent ou refuse : la carte ne s'affiche pas, c'est tout
    return () => { mort = true; if (unsub) { try { unsub(); } catch (e) {} } };
  }, [conn, sig]);
  return events;
}

/** L'etat d'un evenement du journal, dit en un mot. */
function etatJournal(id, st, S) {
  const dom = id.slice(0, id.indexOf('.'));
  const a = (S && S[id] && S[id].attributes) || {};
  if (['light', 'switch', 'fan', 'input_boolean', 'humidifier'].indexOf(dom) >= 0) return st === 'on' ? tr('Allumé') : tr('Éteint');
  if (dom === 'cover') return st === 'open' ? tr('Ouvert') : st === 'closed' ? tr('Fermé') : st === 'opening' ? tr('Ouverture…') : st === 'closing' ? tr('Fermeture…') : st;
  if (dom === 'lock') return st === 'locked' ? tr('Verrouillée') : st === 'unlocked' ? tr('Déverrouillée') : st;
  if (dom === 'media_player') return st === 'playing' ? tr('Lecture') : st === 'paused' ? tr('En pause') : st === 'off' ? tr('Éteint') : st === 'on' ? tr('Allumé') : tr('Inactif');
  if (dom === 'binary_sensor') {
    const porte = ['door', 'window', 'garage_door', 'opening'].indexOf(a.device_class) >= 0;
    return st === 'on' ? (porte ? tr('Ouvert') : tr('Détecté')) : (porte ? tr('Fermé') : 'RAS');
  }
  if (dom === 'climate') return st === 'off' ? tr('Éteint') : st === 'heat' ? tr('CONFORT') : st;
  if (dom === 'vacuum') return st === 'cleaning' ? tr('Nettoyage') : st === 'docked' ? tr('À la base') : st === 'returning' ? tr('Retour base') : st === 'paused' ? tr('En pause') : st;
  if (dom === 'person') return st === 'home' ? tr('Présent') : 'Absent';
  return st + (a.unit_of_measurement ? ' ' + a.unit_of_measurement : '');
}

/* Regroupe les répétitions CONSÉCUTIVES d'une même entité : un lecteur qui
 * change de titre toutes les trois minutes noyait le journal — une ligne
 * portée « ×n », datée du dernier événement, raconte la même chose. */
function grouperJournal(events, cle = (e) => e.entity_id) {
  const out = [];
  for (const e of events) {
    const d = out[out.length - 1];
    if (d && cle(d) != null && cle(d) === cle(e)) { d.n = (d.n || 1) + 1; continue; }
    out.push({ ...e, n: 1 });
  }
  return out;
}

function RoomActivityCard({ hass, ids, titre = null, sous = null, max = 8 }) {
  const events = grouperJournal(useRoomLogbook(hass, ids));
  if (!events.length) return null;
  const S = (hass && hass.states) || {};
  const heure = (when) => { const ms = when < 1e12 ? when * 1000 : when; const d = new Date(ms); return d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); };
  const actif = (e) => ['on', 'open', 'unlocked', 'playing', 'heat', 'cleaning', 'home'].indexOf(e.state) >= 0;
  return (
    <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '20px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{titre || tr('Activité')}</div>
      <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, margin: '3px 0 10px' }}>{sous || tr('Les dernières 24 heures, en direct')}</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {events.slice(0, max).map((e, i) => (
          <div key={(e.when || 0) + '|' + e.entity_id + '|' + i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none' }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: actif(e) ? 'var(--o-warn)' : 'var(--o-text3)', boxShadow: actif(e) ? '0 0 7px var(--o-warn)' : 'none' }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name || (S[e.entity_id] && S[e.entity_id].attributes && S[e.entity_id].attributes.friendly_name) || e.entity_id}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: actif(e) ? 'var(--o-warn)' : 'var(--o-text2)', whiteSpace: 'nowrap' }}>{e.state != null ? etatJournal(e.entity_id, e.state, S) : (e.message || '')}{e.n > 1 ? ' ·×' + e.n : ''}</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', flexShrink: 0, minWidth: 38, textAlign: 'right' }}>{heure(e.when)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoomView({ room, rooms = [], piece, hass, onNav, edit = false }) {
  const [hidden, setHidden] = useState(roomHidden);
  const [addSheet, setAddSheet] = useState(false);
  // Carte dont la fiche est ouverte, ou null.
  const [cardEdit, setCardEdit] = useState(null);

  // Ce que la decouverte propose pour cette piece, avant agencement.
  const derived = useMemo(
    () => roomEntitiesBrutes(hass, room).filter(id => hidden.indexOf(id) < 0),
    [hass, room, hidden.join('|')]
  );
  // Meme editeur que la vue Objets : retrait, ajout, ordre, intertitres.
  const ed = useLayoutEditor(ROOM_LAYOUT_KEY, room, derived);
  const ents = ed.ids;
  const addSection = () => ed.toggle('sect:' + Date.now().toString(36));

  const S0 = (hass && hass.states) || {};
  const origineDe = (k) => k.indexOf('sect:') === 0 ? 'Section'
    : k.indexOf('zone:') === 0 ? k.slice(5)
      : ((S0[k] && S0[k].attributes && S0[k].attributes.friendly_name) || k);
  const nomDe = (k) => ed.labelOf(k) || origineDe(k);

  // Decoupage en sections : un intertitre ouvre un bloc.
  const blocs = [];
  ents.forEach(k => {
    if (k.indexOf('sect:') === 0) blocs.push({ titre: k, cartes: [] });
    else {
      if (!blocs.length) blocs.push({ titre: null, cartes: [] });
      blocs[blocs.length - 1].cartes.push(k);
    }
  });
  const [comfort, setComfort] = useState(false);
  const dc = useDomainCards(hass);
  useEffect(() => { setComfort(false); dc.fermer(); }, [room]);
  // `loggia_roomhidden` n'est plus écrit — le retrait passe par l'agencement de
  // la pièce. On continue de le LIRE : une configuration antérieure garde ses
  // cartes masquées, et « Tout réafficher » sert à s'en débarrasser.
  const unhideAll = () => { try { localStorage.removeItem('loggia_roomhidden'); } catch (e) {} setHidden([]); };
  const live = piece && piece.live;
  const onOpenComfort = () => setComfort(true);
  // ── Réglages rapides + carte Ambiance (maquette Claude Design « Loggia Vues », 21/08) ──
  const [panel, setPanel] = useState(() => { try { return localStorage.getItem('loggia-roompanel') !== '0'; } catch (e) { return true; } });
  const togglePanel = () => setPanel(v => { const nv = !v; try { localStorage.setItem('loggia-roompanel', nv ? '1' : '0'); } catch (e) {} return nv; });
  const S = (hass && hass.states) || {};
  const dom = (id) => id.slice(0, id.indexOf('.'));
  const call = (d, svc, data) => { try { if (hass && hass.callService) hass.callService(d, svc, data); } catch (e) {} };
  const lightIds = ents.filter(id => dom(id) === 'light');
  const switchIds = ents.filter(id => dom(id) === 'switch');
  const coverIds = ents.filter(id => dom(id) === 'cover');
  const mediaIds = ents.filter(id => dom(id) === 'media_player');
  const climIds = ents.filter(id => dom(id) === 'climate');
  const lightsOn = lightIds.filter(id => S[id] && S[id].state === 'on');
  const rgbIds = lightIds.filter(id => { const m = S[id] && S[id].attributes && S[id].attributes.supported_color_modes; return Array.isArray(m) && m.some(x => ['rgb', 'rgbw', 'rgbww', 'hs', 'xy'].indexOf(x) >= 0); });
  // luminosité du groupe = moyenne des lumières allumées (optimiste au clic)
  const briReal = lightsOn.length ? Math.round(lightsOn.reduce((a, id) => a + ((S[id].attributes || {}).brightness || 0) / 2.55, 0) / lightsOn.length) : 0;
  const [briOv, setBriOv] = useState(null);
  const briRef = useRef(null);
  useEffect(() => () => clearTimeout(briRef.current), []);
  useEffect(() => { setBriOv(null); }, [room]);
  const bri = briOv != null ? briOv : briReal;
  const setGroupBri = (nv) => {
    const v = Math.max(0, Math.min(100, nv));
    setBriOv(v); clearTimeout(briRef.current); briRef.current = setTimeout(() => setBriOv(null), 6000);
    if (!lightIds.length) return;
    if (v === 0) call('light', 'turn_off', { entity_id: lightIds });
    else call('light', 'turn_on', { entity_id: lightsOn.length ? lightsOn : lightIds, brightness_pct: v });
  };
  const setGroupColor = (hex) => { if (!rgbIds.length) return; const n = parseInt(hex.slice(1), 16); call('light', 'turn_on', { entity_id: rgbIds, rgb_color: [(n >> 16) & 255, (n >> 8) & 255, n & 255] }); };
  // volet : ouvert si au moins un cover l'est
  const coverOpen = coverIds.some(id => { const st = S[id]; if (!st) return false; const pos = (st.attributes || {}).current_position; return pos != null ? pos > 5 : st.state === 'open'; });
  const [covOv, setCovOv] = useState(null);
  const covRef = useRef(null);
  useEffect(() => () => clearTimeout(covRef.current), []);
  useEffect(() => { setCovOv(null); }, [room]);
  const covOn = covOv != null ? covOv : coverOpen;
  const toggleCovers = () => { const nv = !covOn; setCovOv(nv); clearTimeout(covRef.current); covRef.current = setTimeout(() => setCovOv(null), 8000); call('cover', nv ? 'open_cover' : 'close_cover', { entity_id: coverIds }); };
  const coverPct = (() => { const ps = coverIds.map(id => (S[id] && (S[id].attributes || {}).current_position)).filter(v => v != null); return ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : null; })();
  // média en cours
  const mediaAct = mediaIds.map(id => S[id]).find(st => st && ['playing', 'paused'].indexOf(st.state) >= 0);
  const mediaTitle = mediaAct ? ((mediaAct.attributes || {}).media_title || (mediaAct.attributes || {}).app_name || tr('En lecture')) : null;
  const mediaSub = mediaAct ? (((mediaAct.attributes || {}).friendly_name || '').replace(room, '').trim() || tr('Lecteur')) + ' · ' + (mediaAct.state === 'playing' ? tr('en lecture') : tr('en pause')) : null;
  // chauffage actif dans la pièce → badge de la carte
  const heatOn = climIds.map(id => S[id]).find(st => st && st.state !== 'off' && st.state !== 'unavailable')
    || switchIds.map(id => S[id]).find(st => st && st.state === 'on' && /po[eê]le|chauff|radiateur|granul/i.test((st.attributes || {}).friendly_name || ''));
  // dernier changement dans la pièce
  const lastChange = (() => {
    let best = 0;
    ents.forEach(id => { const st = S[id]; if (!st) return; const t = Date.parse(st.last_changed || st.last_updated || 0); if (t > best) best = t; });
    if (!best) return null;
    const m = (Date.now() - best) / 60000;
    if (m < 1) return "à l'instant";
    if (m < 60) return 'il y a ' + Math.round(m) + ' min';
    if (m < 1440) return 'il y a ' + Math.round(m / 60) + ' h';
    return 'il y a ' + Math.round(m / 1440) + ' j';
  })();
  // Ligne dense de la carte Ambiance (patron validé : libellé + description à gauche, valeur à droite)
  const AmbRow = ({ label, desc, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 190px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 11.5, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>{children}</div>
    </div>
  );
  const AmbVal = ({ v, col }) => <span style={{ fontSize: 15, fontWeight: 800, color: col || 'var(--o-text)', whiteSpace: 'nowrap' }}><FlipText live text={String(v)} /></span>;
  const AmbGauge = ({ v, pct, col }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <AmbVal v={v} col={col} />
      <Gauge pct={pct} color={col} h={3} style={{ width: 160 }} />
    </div>
  );
  const metric = (label, val, ico, col) => val == null ? null : (
    <div style={{ minWidth: 92, padding: '10px 14px', borderRadius: 14, background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: 'var(--o-text3)' }}><Fi i={ico} size={11} color={col} />{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, marginTop: 3 }}>{val}</div>
    </div>
  );
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* titre + navigation entre pièces + pastille de confort, sur une même ligne */}
        <div className="o-room-head" style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flexShrink: 0 }}>
            <h1 style={{ margin: 0, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{room}</h1>
            <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>
              {lightsOn.length
                ? (lightsOn.length > 1
                  ? tr('{n} lampes allumées', { n: lightsOn.length })
                  : tr('{n} lampe allumée', { n: lightsOn.length }))
                : tr('Tout est éteint')}
              {live && live.temp != null ? ' · ' + live.temp.toFixed(1).replace('.', ',') + ' °C' : ''}
              {live && live.hum != null ? ' · ' + Math.round(live.hum) + ' % HR' : ''}
              {live && live.co2 != null ? ' · ' + Math.round(live.co2) + ' ppm' : ''}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}><RoomNav room={room} onNav={onNav} hass={hass} /></div>
        </div>

        {/* réglages rapides de la pièce : luminosité du groupe, couleur, volet */}
        {(lightIds.length > 0 || coverIds.length > 0) && (
          <div className="o-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,20px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
            {lightIds.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 6px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{tr('Luminosité')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }} {...kbSlider('Luminosité de ' + room, bri, setGroupBri, { min: 0, max: 100, step: 5 })}>
                  <button onClick={() => setGroupBri(bri - 5)} aria-label="Baisser" style={{ width: 22, height: 22, borderRadius: 7, border: 'none', cursor: 'pointer', background: 'var(--o-s1)', color: 'var(--o-text1)', fontSize: 13, fontWeight: 600 }}>−</button>
                  <span style={{ minWidth: 44, textAlign: 'center', fontSize: 12.5, fontWeight: 800, color: bri > 0 ? 'var(--o-warn)' : 'var(--o-text3)' }}>{bri} %</span>
                  <button onClick={() => setGroupBri(bri + 5)} aria-label="Monter" style={{ width: 22, height: 22, borderRadius: 7, border: 'none', cursor: 'pointer', background: 'var(--o-s1)', color: 'var(--o-text1)', fontSize: 13, fontWeight: 600 }}>+</button>
                </div>
              </div>
            )}
            {rgbIds.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{tr('Couleur')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {LIGHT_PALETTE.map(c => <button key={c} onClick={() => setGroupColor(c)} title={tr('Appliquer {c}', { c })} aria-label={tr('Couleur {c}', { c })} style={{ width: 18, height: 18, borderRadius: 6, cursor: 'pointer', background: c, border: '2px solid transparent', padding: 0 }} />)}
                </div>
              </div>
            )}
            {coverIds.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)' }}>{coverIds.length > 1 ? tr('Volets') : tr('Volet')}</span>
                  {coverPct != null && <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--o-text3)' }}>{covOn ? coverPct + ' %' : 'fermé'}</span>}
                </span>
                <span onClick={toggleCovers} role="switch" aria-checked={covOn} aria-label={'Volets ' + room} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCovers(); } }} style={{ position: 'relative', width: 38, height: 21, flexShrink: 0, borderRadius: 11, cursor: 'pointer', background: covOn ? 'var(--o-accent)' : 'var(--o-s4)', border: covOn ? 'none' : 'var(--o-bw,1px) solid var(--o-bd1)', transition: 'background .2s' }}><span style={{ position: 'absolute', top: 2, left: covOn ? 19 : 2, width: 17, height: 17, borderRadius: '50%', background: '#fff', transition: 'left .2s cubic-bezier(.4,1.3,.5,1)' }} /></span>
              </div>
            )}
            <span style={{ flex: 1 }} />
            <button onClick={togglePanel} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, border: panel ? 'var(--o-bw,1px) solid rgba(var(--o-accent-rgb),.44)' : 'var(--o-bw,1px) solid var(--o-bd1)', background: panel ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: panel ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}><Fi i="sliders-v" size={13} /><span className="o-barlabel">{panel ? tr('Masquer les réglages') : tr('Réglages de la vue')}</span></button>
          </div>
        )}

        {/* carte Ambiance : mesures et état de la pièce (repliable par le bouton du bandeau) */}
        {panel && (live || mediaAct || coverIds.length > 0) && (
          <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '20px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Ambiance</div>
              {(() => {
                const tag = heatOn
                  ? { t: /po[eê]le|granul/i.test((heatOn.attributes || {}).friendly_name || '') ? 'POÊLE ACTIF' : 'CHAUFFAGE ACTIF', c: 'var(--o-warn2)', soft: 'rgba(var(--o-warn2-rgb),.14)' }
                  : lightsOn.length ? { t: lightsOn.length > 1 ? tr('{n} LAMPES ALLUMÉES', { n: lightsOn.length }) : tr('{n} LAMPE ALLUMÉE', { n: lightsOn.length }), c: 'var(--o-warn)', soft: 'rgba(var(--o-warn-rgb),.14)' }
                    : null;
                return tag ? <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, background: tag.soft, color: tag.c, fontSize: 11, fontWeight: 800, flexShrink: 0, whiteSpace: 'nowrap' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.c }} />{tag.t}</span> : null;
              })()}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, margin: '3px 0 8px' }}>{ents.length > 1 ? tr('{n} appareils dans cette pièce', { n: ents.length }) : tr('{n} appareil dans cette pièce', { n: ents.length })}{lastChange ? ' · dernier changement ' + lastChange : ''}</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Capteur declare mais muet : on le signale au lieu de masquer la
                  ligne. Sans cela, une integration en panne — un jeton cloud
                  expire, par exemple — ressemble a une piece sans capteur. */}
              {live && live.temp == null && live.tempId && (
                <AmbRow label={tr('Température')} desc={'Capteur ' + room + ' — aucune valeur reçue'}>
                  <AmbVal v="indisponible" col="var(--o-warn2)" />
                </AmbRow>
              )}
              {live && live.hum == null && live.humId && (
                <AmbRow label={tr('Humidité')} desc={tr('Le capteur ne répond pas')}>
                  <AmbVal v="indisponible" col="var(--o-warn2)" />
                </AmbRow>
              )}
              {live && live.temp != null && (
                <AmbRow label={tr('Température')} desc={'Capteur ' + room + (heatOn && (heatOn.attributes || {}).temperature != null ? ' · cible ' + Math.round(heatOn.attributes.temperature) + ' °C' : '')}>
                  <AmbVal v={live.temp.toFixed(1).replace('.', ',') + ' °C'} col={live.temp < 17 ? 'var(--o-cold)' : live.temp > 26 ? 'var(--o-warn2)' : 'var(--o-text)'} />
                </AmbRow>
              )}
              {live && live.hum != null && (
                <AmbRow label={tr('Humidité')} desc="Confortable entre 40 et 60 %">
                  <AmbGauge v={Math.round(live.hum) + ' %'} pct={Math.min(100, live.hum)} col={live.hum < 30 || live.hum > 65 ? 'var(--o-warn2)' : 'var(--o-ok)'} />
                </AmbRow>
              )}
              {live && live.co2 != null && (
                <AmbRow label="CO₂" desc={tr('Aérer au-delà de 1 000 ppm')}>
                  <AmbGauge v={Math.round(live.co2) + ' ppm'} pct={Math.min(100, live.co2 / 2000 * 100)} col={live.co2 > 1000 ? 'var(--o-bad)' : live.co2 > 800 ? 'var(--o-warn2)' : 'var(--o-ok)'} />
                </AmbRow>
              )}
              {coverIds.length > 0 && (
                <AmbRow label={coverIds.length > 1 ? tr('Volets') : tr('Volet')} desc={coverPct != null ? (covOn ? 'Ouvert à ' + coverPct + ' %' : tr('Fermé')) + ' · ' + (coverIds.length > 1 ? tr('{n} volets', { n: coverIds.length }) : tr('{n} volet', { n: coverIds.length })) : (covOn ? tr('Ouvert') : tr('Fermé'))}>
                  <AmbVal v={covOn ? (coverPct != null ? coverPct + ' %' : tr('Ouvert')) : tr('Fermé')} col={covOn ? 'var(--o-accent-soft)' : 'var(--o-text3)'} />
                </AmbRow>
              )}
              {mediaAct && (
                <AmbRow label={tr('Média')} desc={mediaSub}>
                  <AmbVal v={mediaTitle} col="var(--o-accent-soft)" />
                </AmbRow>
              )}
              {live && (live.temp != null || live.hum != null || live.co2 != null) && (
                <AmbRow label="Historique du confort" desc={tr('Courbes sur 24 h : température, humidité et CO₂')}>
                  <button onClick={onOpenComfort} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd1)', color: 'var(--o-text1)' }}><Fi i="chart-line-up" size={13} />{tr('Ouvrir')}</button>
                </AmbRow>
              )}
            </div>
          </div>
        )}

        {ents.length > 0 && <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{tr('Appareils de la pièce')}</div>}
        {/* appareils de la pièce — mêmes cartes que les vues dédiées */}
        {ents.length
          ? <div ref={ed.gridRef} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {blocs.map((bloc, bi) => (
              // Hors édition, un intertitre sans carte ne s'affiche pas.
              (!edit && bloc.titre && !bloc.cartes.length) ? null : (
              <div key={bloc.titre || 'b' + bi} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {bloc.titre && (edit
                  ? <EditableCard plat ed={ed} id={bloc.titre} nom={nomDe(bloc.titre)} onEdit={setCardEdit}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>
                        <Fi i="apps" size={16} color="var(--o-ok)" />{nomDe(bloc.titre)}
                      </div>
                    </EditableCard>
                  : <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>
                      <Fi i="apps" size={16} color="var(--o-ok)" />{nomDe(bloc.titre)}
                    </div>)}
                <div className="grid-roomdev" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(232px,1fr))', gap: 14 }}>
              {bloc.cartes.map(id => {
                const zone = id.indexOf('zone:') === 0 ? climateZones(S).find(z => z.id === id.slice(5)) : null;
                const lbl = roomLabelOf(room, id);
                // Type choisi dans la fiche d'édition : la carte du catalogue
                // remplace le rendu par défaut de la vue. Une ZONE climat en
                // compacte = la ligne de son thermostat (± inline).
                const card = (!zone && ed.typeOf(id)) ? <CvTyped x={{ t: ed.typeOf(id), id }} hass={hass} dc={dc} />
                  : (zone && ed.typeOf(id) === 'compacte' && estClimate(zone)) ? <CvCard id={zone.haid} hass={hass} label={lbl || zone.name} onOpen={dc.ouvrir} dense />
                    : dc.card(id, lbl, zone);
                if (!edit) return <Anim key={id} i={ents.indexOf(id)} className={ed.estLarge(id) ? 'o-cvw2' : ''}>{card}</Anim>;
                return <EditableCard key={id} ed={ed} id={id} nom={nomDe(id)} onEdit={setCardEdit}>{card}</EditableCard>;
              })}
                </div>
              </div>)
            ))}
            </div>
          : <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13.5, color: 'var(--o-text3)', fontWeight: 600 }}>{tr('Aucun appareil détecté pour cette pièce.')}<br /><span style={{ fontSize: 12 }}>Loggia regroupe les entités dont le nom contient « {room} ».</span></div>}
        {edit && (() => {
          const btn = (accent) => ({ padding: '7px 12px', borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0,
            background: accent ? 'var(--o-accent)' : 'var(--o-s1)', color: accent ? '#06121f' : 'var(--o-text1)',
            border: accent ? 'none' : 'var(--o-bw,1px) solid var(--o-bd2)' });
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: 14, flexWrap: 'wrap', background: 'rgba(var(--o-accent-rgb),.12)', border: '1px dashed rgba(var(--o-accent-rgb),.45)' }}>
              <Fi i="pencil" size={14} color="var(--o-accent-soft)" />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', flex: 1, minWidth: 200 }}>
                Mode édition : clique une carte pour la modifier, glisse-la pour la déplacer.
                {ed.edits ? ' Cette pièce est personnalisée.' : ' Cette pièce suit la détection automatique.'}
              </span>
              <button onClick={() => setAddSheet(true)} style={btn(true)}>{tr('Ajouter un appareil')}</button>
              <button onClick={addSection} style={btn(false)}>{tr('Ajouter un titre')}</button>
              {ed.edits > 0 && <button onClick={ed.reset} style={btn(false)}>{tr("Rétablir l'automatique")}</button>}
              {hidden.length > 0 && <button onClick={unhideAll} style={btn(false)}>{tr('Tout réafficher')}</button>}
            </div>
          );
        })()}
        {/* Journal de la pièce : sous les appareils, hors mode édition. */}
        {!edit && <RoomActivityCard hass={hass} ids={ents.filter(k => k.indexOf('sect:') !== 0 && k.indexOf('zone:') !== 0)} />}
        {/* Les fiches des cartes (lumière, volet, climat…) : dc.card pose
          * l'état, dc.sheets MONTE la fiche — sans lui, taper une carte ne
          * faisait rien (« popup inactif », retour du 30/08). */}
        {dc.sheets}
        {addSheet && <RoomAddSheet room={room} hass={hass} present={ents} onToggle={ed.toggle} onClose={() => setAddSheet(false)} />}
        {cardEdit && <CardEditSheet ed={ed} id={cardEdit} nom={nomDe(cardEdit)} origine={origineDe(cardEdit)} hass={hass} onClose={() => setCardEdit(null)} />}
        {comfort && piece && <RoomComfortModal piece={piece} hass={hass} onClose={() => setComfort(false)} />}
      </div>
    </main>
  );
}

/* ════════════ SCÈNES RAPIDES (Accueil) — scripts/scènes HA, configurables ════════════ */
const quickScenes = () => {
  const raw = cfgVal('loggia_quickscenes', null);
  // Sans choix explicite : les scènes que Home Assistant déclare, au plus six.
  if (!Array.isArray(raw) || !raw.length) {
    const S = (getHass() || {}).states || {};
    return Object.keys(S).filter(id => id.indexOf('scene.') === 0).slice(0, 6).map(id => ({
      name: (S[id].attributes && S[id].attributes.friendly_name) || id.slice(6).replace(/_/g, ' '),
      sub: '', icon: 'sparkles', haid: id,
    }));
  }
  return raw.filter(s => s && s.haid).map(s => ({ name: s.name || s.haid.split('.')[1].replace(/_/g, ' '), sub: s.sub || '', icon: s.icon || 'sparkles', haid: s.haid }));
};
const qsKeys = () => quickScenes().map(s => s.haid);
function QuickScenes({ hass }) {
  const [flash, setFlash] = useState(null); // retour visuel immédiat (les scripts n'ont pas d'état stable)
  const fRef = useRef(null);
  useEffect(() => () => clearTimeout(fRef.current), []);
  const run = (s) => {
    setFlash(s.haid); clearTimeout(fRef.current); fRef.current = setTimeout(() => setFlash(null), 2500);
    try { if (hass && hass.callService) hass.callService(s.haid.indexOf('scene.') === 0 ? 'scene' : 'script', 'turn_on', { entity_id: s.haid }); } catch (e) {}
  };
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={sectionTitle}>{tr('Scènes rapides')}</div>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' }}>{quickScenes().length} raccourcis</span>
      </div>
      <div className="grid-qscenes" style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12 }}>
        {quickScenes().map(s => {
          const st = hass && hass.states ? hass.states[s.haid] : null;
          const running = flash === s.haid || (st && st.state === 'on' && s.haid.indexOf('script.') === 0);
          const dead = hass && hass.states && !st;
          return (
            <button key={s.haid} onClick={(e) => { fxTap(e); run(s); }} className="o-scene-room" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, padding: '14px 15px 15px', borderRadius: 'var(--o-radius,18px)', cursor: 'pointer', textAlign: 'left', transition: 'all .25s', opacity: dead ? .45 : 1, background: running ? 'var(--o-accent)' : 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid ' + (running ? 'transparent' : 'var(--o-bd2)'), boxShadow: running ? '0 10px 26px rgba(var(--o-accent-rgb),.4)' : 'var(--o-shadow,0 6px 16px rgba(0,0,0,.26))' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <Fi i={s.icon} size={18} color={running ? '#fff' : 'var(--o-text1)'} />
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: running ? '#fff' : 'var(--o-bd1)', transition: 'background .25s' }} />
              </div>
              <div style={{ minWidth: 0, width: '100%' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: running ? '#fff' : 'var(--o-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 2, color: running ? 'rgba(255,255,255,.85)' : 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dead ? 'Entité absente' : s.sub}</div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* Une FONCTION, pas une table.
 *
 * Evaluee a l'import, cette liste figeait ses libelles dans la langue du
 * demarrage. C'est ce qui obligeait a recharger la page apres un changement de
 * langue. Appelee au rendu, elle se dit dans la langue du moment. */
const CAMERAS = () => [
  { label: tr('Entrée'), tag: 'LIVE · ENTRÉE', grad: 'linear-gradient(180deg,#6ba8d8 0%,#9cc4e0 42%,#7a8a5c 60%,#56683f 100%)', glow: 'radial-gradient(120% 80% at 50% 18%,rgba(255,255,255,.18),transparent 55%)', sub: <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffce73" strokeWidth="2.4" strokeLinecap="round"><path d="M13 2L3 14h7l-1 8 11-13h-7z" /></svg>Mouvement il y a 3 min</> },
  { label: tr('Façade'), tag: 'LIVE · FAÇADE', grad: 'linear-gradient(180deg,#5e94c4 0%,#86b06f 38%,#6f7e4a 62%,#4a5a36 100%)', glow: 'radial-gradient(120% 80% at 60% 22%,rgba(255,255,255,.16),transparent 55%)', sub: <><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--o-ok)' }} />{tr('RAS · véhicule présent')}</> },
];

// ── Snapshot proxy authentifié (repli) ──
function HaImage({ hass, haid, refreshMs = 2000, kind = 'camera', fit = 'cover' }) {
  const [src, setSrc] = useState(null);
  const token = hass && hass.auth && hass.auth.data ? hass.auth.data.access_token : null;
  useEffect(() => {
    if (!haid || !token) { setSrc(null); return; }
    let alive = true, last = null, tour = 0;
    const endpoint = kind === 'image' ? 'image_proxy' : 'camera_proxy';
    const fetchSnap = async () => {
      /* Chaque appel porte son numero. Sur une camera lente, la reponse d'un
       * tour ancien arrivait apres une plus recente et remontait une image
       * perimee a l'ecran ; les vignettes semblaient reculer dans le temps. */
      const mien = ++tour;
      try {
        const res = await fetch(`/api/${endpoint}/${haid}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        if (!alive || mien !== tour) return;
        const url = URL.createObjectURL(blob);
        if (last) URL.revokeObjectURL(last);
        last = url; setSrc(url);
      } catch (e) { /* garde le fond en repli */ }
    };
    fetchSnap();
    const id = setInterval(fetchSnap, refreshMs);
    return () => { alive = false; clearInterval(id); if (last) URL.revokeObjectURL(last); };
  }, [haid, token, refreshMs, kind]);
  if (!src) return null;
  return <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit }} />;
}

/**
 * Les serveurs ICE, demandes a Home Assistant.
 *
 * Un `stun:stun.l.google.com` etait ecrit ici en dur. Sur le reseau local cela
 * ne se voyait pas : les deux extremites sont sur le meme reseau, les candidats
 * « host » suffisent et aucun serveur n'est consulte. Depuis l'exterieur, en
 * revanche, il faut traverser deux NAT — et un STUN ne sert qu'a decouvrir sa
 * propre adresse publique, il ne relaie rien. Sans TURN la negociation
 * echouait, la camera restait noire, et l'interface de Home Assistant affichait
 * pourtant le flux : elle, elle demande sa configuration.
 *
 * `camera/webrtc/get_client_config` repond ce que l'installation a de mieux —
 * chez l'auteur, les STUN de Home Assistant et de Cloudflare, et surtout deux
 * TURN avec identifiants, dont un joignable en TLS sur le port 443.
 *
 * Le tableau vide est un repli volontaire : une version de Home Assistant qui
 * ignore cette commande n'a pas de WebRTC non plus, et sur un reseau local on
 * se connecte tres bien sans aucun serveur. Coder un service public en dur
 * serait doublement fautif — le projet s'interdit toute ressource externe, et
 * cela reviendrait a annoncer l'adresse publique de l'utilisateur a un tiers
 * qu'il n'a pas choisi.
 */
async function iceServers(conn, haid) {
  if (!conn) return [];
  try {
    const r = await conn.sendMessagePromise({ type: 'camera/webrtc/get_client_config', entity_id: haid });
    const s = r && r.configuration && r.configuration.iceServers;
    return Array.isArray(s) ? s : [];
  } catch (e) {
    return [];
  }
}

// ── Lecteur caméra LIVE (porté de V1) : WebRTC → HLS natif → MJPEG signé → snapshot ──
function CamLive({ hass, haid, online = true }) {
  const vidRef = useRef(null);
  const imgRef = useRef(null);
  const [mode, setMode] = useState('loading'); // loading | video | mjpeg | snap | off
  const token = hass && hass.auth && hass.auth.data ? hass.auth.data.access_token : null;
  const conn = hass && hass.connection ? hass.connection : null;
  useEffect(() => {
    let cancelled = false, cleanupRtc = null;
    setMode('loading');
    if (!online || !token || !conn) { setMode('off'); return; }
    /* Un flux qui a réussi à se connecter peut mourir en route — la 5G
     * capricieuse gèle la vidéo sans la fermer, et l'image figée a l'air d'un
     * direct. Sans nouvelle frame décodée pendant trois relevés (9 s), on
     * abandonne le direct pour le repli : mieux vaut un instantané de 2 s
     * qu'un faux direct. */
    let gelIv = null;
    const armerGel = () => {
      clearInterval(gelIv);
      let vues = -1, immobiles = 0;
      gelIv = setInterval(() => {
        const v = vidRef.current;
        if (cancelled || !v) return;
        const n = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality().totalVideoFrames
          : (v.webkitDecodedFrameCount != null ? v.webkitDecodedFrameCount : null);
        if (n == null) { clearInterval(gelIv); return; } // pas de compteur : impossible de juger
        if (n === vues) {
          immobiles += 1;
          if (immobiles >= 3) {
            clearInterval(gelIv);
            if (cleanupRtc) { try { cleanupRtc(); } catch (e) {} cleanupRtc = null; }
            startMjpeg();
          }
        } else { vues = n; immobiles = 0; }
      }, 3000);
    };
    const startMjpeg = async () => {
      if (cancelled) return;
      clearInterval(gelIv); // le direct est abandonné : plus rien à surveiller
      try {
        const r = await conn.sendMessagePromise({ type: 'auth/sign_path', path: `/api/camera_proxy_stream/${haid}`, expires: 3600 });
        if (cancelled) return;
        if (r && r.path && imgRef.current) { imgRef.current.onerror = () => { if (!cancelled) setMode('snap'); }; imgRef.current.src = r.path; setMode('mjpeg'); }
        else setMode('snap');
      } catch { setMode('snap'); }
    };
    const startHls = async () => {
      if (cancelled) return;
      const v = vidRef.current;
      const nativeHls = v && v.canPlayType && v.canPlayType('application/vnd.apple.mpegurl');
      if (nativeHls) {
        try {
          const res = await conn.sendMessagePromise({ type: 'camera/stream', entity_id: haid, format: 'hls' });
          if (cancelled) return;
          if (res && res.url && vidRef.current) { vidRef.current.srcObject = null; vidRef.current.onerror = () => { if (!cancelled) startMjpeg(); }; vidRef.current.src = res.url; setMode('video'); armerGel(); vidRef.current.play && vidRef.current.play().catch(() => {}); return; }
        } catch { /* HLS indispo → MJPEG */ }
      }
      startMjpeg();
    };
    const startRtc = async () => {
      if (typeof RTCPeerConnection === 'undefined') return false;
      let sessionId = null, gotTrack = false, unsub = null;
      /* La configuration ICE arrive du serveur : entre la demande et la reponse,
       * le composant peut avoir ete demonte. Sans cette garde, le nettoyage
       * passait alors que `cleanupRtc` valait encore `null`, puis l'execution
       * reprenait ici et ouvrait une connexion que plus personne ne fermait.
       * Changer de vue rapidement accumulait sessions et sockets. */
      const glacons = await iceServers(conn, haid);
      if (cancelled) return false;
      const pc = new RTCPeerConnection({ iceServers: glacons });
      cleanupRtc = () => { try { unsub && unsub(); } catch {} try { pc.close(); } catch {} };
      if (cancelled) { cleanupRtc(); cleanupRtc = null; return false; }
      try { pc.addTransceiver('video', { direction: 'recvonly' }); pc.addTransceiver('audio', { direction: 'recvonly' }); } catch {}
      pc.addEventListener('track', (e) => { if (cancelled) return; gotTrack = true; if (vidRef.current && e.streams && e.streams[0]) { vidRef.current.srcObject = e.streams[0]; setMode('video'); armerGel(); vidRef.current.play && vidRef.current.play().catch(() => {}); } });
      pc.addEventListener('icecandidate', (e) => { if (cancelled || !sessionId || !e.candidate) return; conn.sendMessagePromise({ type: 'camera/webrtc/candidate', entity_id: haid, session_id: sessionId, candidate: { candidate: e.candidate.candidate, sdpMLineIndex: e.candidate.sdpMLineIndex, sdpMid: e.candidate.sdpMid } }).catch(() => {}); });
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        unsub = await conn.subscribeMessage((msg) => {
          if (cancelled || !msg) return;
          if (msg.type === 'session') sessionId = msg.session_id;
          else if (msg.type === 'answer') pc.setRemoteDescription({ type: 'answer', sdp: msg.answer }).catch(() => {});
          else if (msg.type === 'candidate' && msg.candidate) { try { pc.addIceCandidate(new RTCIceCandidate(typeof msg.candidate === 'string' ? { candidate: msg.candidate, sdpMLineIndex: 0 } : msg.candidate)); } catch {} }
        }, { type: 'camera/webrtc/offer', entity_id: haid, offer: pc.localDescription.sdp });
      } catch (e) { cleanupRtc(); cleanupRtc = null; return false; }
      /* Quatre secondes suffisent en direct, sur le reseau local. Passer par un
       * relais TURN en demande davantage : allocation aupres du relais, puis
       * chaque paquet fait un detour. On accorde donc jusqu'a douze secondes,
       * mais seulement tant qu'ICE progresse — un etat `failed` ou `closed`
       * rend la main tout de suite, sans faire attendre le repli. */
      return await new Promise((resolve) => {
        const debut = Date.now();
        const fini = (v) => { clearInterval(iv); resolve(v); };
        const iv = setInterval(() => {
          if (gotTrack) return fini(true);
          if (cancelled) return fini(false);
          const et = pc.iceConnectionState;
          if (et === 'failed' || et === 'closed') return fini(false);
          const ecoule = Date.now() - debut;
          const encours = et === 'new' || et === 'checking';
          if (ecoule > (encours ? 12000 : 4000)) return fini(false);
        }, 150);
      });
    };
    (async () => { const ok = await startRtc(); if (cancelled) return; if (!ok) { if (cleanupRtc) { try { cleanupRtc(); } catch {} cleanupRtc = null; } await startHls(); } })();
    // Captures : dans le nettoyage, `ref.current` peut avoir change.
    const vidCapture = vidRef.current;
    const imgCapture = imgRef.current;
    return () => { cancelled = true; clearInterval(gelIv); if (cleanupRtc) { try { cleanupRtc(); } catch {} } const v = vidCapture; if (v) { try { v.pause(); } catch {} try { v.srcObject = null; } catch {} v.removeAttribute('src'); try { v.load(); } catch {} } const im = imgCapture; if (im) { im.onerror = null; im.removeAttribute('src'); } };
  }, [haid, online, token, conn]);
  const cover = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };
  if (mode === 'off') return null; // repli sur le fond gradient de la tuile
  return (
    <>
      <video ref={vidRef} autoPlay muted playsInline style={{ ...cover, display: mode === 'video' ? 'block' : 'none' }} />
      <img ref={imgRef} alt="" style={{ ...cover, display: mode === 'mjpeg' ? 'block' : 'none' }} />
      {mode === 'snap' && <HaImage hass={hass} haid={haid} refreshMs={2000} kind="camera" />}
    </>
  );
}

function CameraTile({ c }) {
  const live = !!(c.haid && c.hass);
  const t = new Date(), hhmm = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
  const ctrl = { width: 36, height: 36, borderRadius: 11, background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' };
  return (
    <div style={{ position: 'relative', borderRadius: 'var(--o-radius,20px)', overflow: 'hidden', aspectRatio: '16/9', background: c.grad, border: 'var(--o-bw,1px) solid var(--o-bd1)', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.4))' }}>
      {live && <CamLive hass={c.hass} haid={c.haid} online={c.online} />}
      {!live && <div style={{ position: 'absolute', inset: 0, background: c.glow }} />}
      <div className="o-livebadge" style={{ position: 'absolute', top: 13, left: 13, display: 'flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 999, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: '#fff' }}><span className="o-livedot" style={{ width: 7, height: 7, borderRadius: '50%', background: '#f87171' }} />{c.tag}</div>
      <div style={{ position: 'absolute', top: 13, right: 14, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.85)', textShadow: '0 1px 4px rgba(0,0,0,.5)' }}>{hhmm}</div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '30px 16px 14px', background: 'linear-gradient(to top,rgba(0,0,0,.72),transparent)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div><div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{c.label}</div><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.82)' }}>{c.sub}</div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={ctrl}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" /></svg></span>
          <span style={ctrl}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5zM1 5h15v14H1z" /></svg></span>
        </div>
      </div>
    </div>
  );
}

const stateCard = { ...card, borderRadius: 15, padding: '11px 14px', boxShadow: 'var(--o-shadow,0 8px 20px rgba(0,0,0,.26))' };

/* ════════════ VUE OBJETS — hub des appareils connectés (réf. « Objets connectés ») ════════════ */
// Illustrations filigrane des appareils médias (même style flat que PLANT_ART, ancrées à droite).
const VIEW_ART = {
  solar: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cellipse cx='100' cy='172' rx='52' ry='7' fill='%23101828' opacity='0.6'/%3E%3Cg transform='rotate(-10 100 110)'%3E%3Crect x='30' y='70' width='140' height='84' rx='8' fill='%23232f42' stroke='%233a4a63' stroke-width='4'/%3E%3Cg fill='%23253750'%3E%3Crect x='40' y='80' width='28' height='30' rx='3'/%3E%3Crect x='72' y='80' width='28' height='30' rx='3'/%3E%3Crect x='104' y='80' width='28' height='30' rx='3'/%3E%3Crect x='136' y='80' width='24' height='30' rx='3'/%3E%3Crect x='40' y='114' width='28' height='30' rx='3'/%3E%3Crect x='72' y='114' width='28' height='30' rx='3'/%3E%3Crect x='104' y='114' width='28' height='30' rx='3'/%3E%3Crect x='136' y='114' width='24' height='30' rx='3'/%3E%3C/g%3E%3Crect x='104' y='80' width='28' height='30' rx='3' fill='%23ffd166' opacity='0.35'/%3E%3C/g%3E%3Crect x='92' y='152' width='10' height='24' fill='%232c3b54'/%3E%3Ccircle cx='160' cy='42' r='13' fill='%23ffd166' opacity='0.85'/%3E%3Cg stroke='%23ffd166' stroke-width='3' stroke-linecap='round' opacity='0.7'%3E%3Cline x1='160' y1='18' x2='160' y2='26'/%3E%3Cline x1='182' y1='42' x2='190' y2='42'/%3E%3Cline x1='176' y1='26' x2='181' y2='21'/%3E%3Cline x1='176' y1='58' x2='181' y2='63'/%3E%3C/g%3E%3C/svg%3E",
  pylon: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cg stroke='%233a4a63' stroke-width='5' stroke-linecap='round' fill='none'%3E%3Cline x1='72' y1='182' x2='94' y2='44'/%3E%3Cline x1='128' y1='182' x2='106' y2='44'/%3E%3Cline x1='80' y1='132' x2='120' y2='132'/%3E%3Cline x1='80' y1='132' x2='116' y2='96'/%3E%3Cline x1='120' y1='132' x2='84' y2='96'/%3E%3Cline x1='84' y1='96' x2='116' y2='96'/%3E%3Cline x1='94' y1='44' x2='106' y2='44'/%3E%3C/g%3E%3Crect x='46' y='62' width='108' height='9' rx='4' fill='%23232f42' stroke='%233a4a63' stroke-width='3'/%3E%3Crect x='62' y='94' width='76' height='8' rx='4' fill='%23232f42' stroke='%233a4a63' stroke-width='3'/%3E%3Cg fill='%2334d399'%3E%3Ccircle cx='52' cy='76' r='4'/%3E%3Ccircle cx='148' cy='76' r='4'/%3E%3Ccircle cx='68' cy='106' r='4'/%3E%3Ccircle cx='132' cy='106' r='4'/%3E%3C/g%3E%3Cg stroke='%2334d399' stroke-width='2.5' fill='none' opacity='0.5'%3E%3Cpath d='M6 96 Q30 108 52 80'/%3E%3Cpath d='M148 80 Q170 108 194 96'/%3E%3C/g%3E%3C/svg%3E",
  meter: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cellipse cx='100' cy='168' rx='46' ry='7' fill='%23101828' opacity='0.6'/%3E%3Crect x='56' y='44' width='88' height='112' rx='12' fill='%23232f42' stroke='%233a4a63' stroke-width='4'/%3E%3Crect x='68' y='58' width='64' height='26' rx='5' fill='%23101828'/%3E%3Cpath d='M72 74 L84 66 L94 76 L106 62 L118 70 L128 64' stroke='%2360a5fa' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3Ccircle cx='100' cy='120' r='19' fill='%23243349' stroke='%233a4a63' stroke-width='3'/%3E%3Cline x1='100' y1='120' x2='111' y2='108' stroke='%2360a5fa' stroke-width='4' stroke-linecap='round'/%3E%3Ccircle cx='100' cy='120' r='3.5' fill='%2360a5fa'/%3E%3Cpath d='M100 156 L100 184' stroke='%233a4a63' stroke-width='5' stroke-linecap='round'/%3E%3C/svg%3E",
  piggy: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cellipse cx='100' cy='172' rx='56' ry='7' fill='%23101828' opacity='0.6'/%3E%3Cellipse cx='98' cy='120' rx='58' ry='42' fill='%23232f42' stroke='%233a4a63' stroke-width='4'/%3E%3Cellipse cx='152' cy='118' rx='13' ry='11' fill='%23243349' stroke='%233a4a63' stroke-width='3'/%3E%3Ccircle cx='149' cy='115' r='2.5' fill='%23101828'/%3E%3Ccircle cx='156' cy='115' r='2.5' fill='%23101828'/%3E%3Cpath d='M64 88 L54 72 L76 78 Z' fill='%23232f42' stroke='%233a4a63' stroke-width='3'/%3E%3Ccircle cx='78' cy='108' r='4' fill='%23101828'/%3E%3Crect x='66' y='154' width='12' height='16' rx='4' fill='%232c3b54'/%3E%3Crect x='118' y='154' width='12' height='16' rx='4' fill='%232c3b54'/%3E%3Crect x='84' y='80' width='30' height='7' rx='3.5' fill='%23101828'/%3E%3Ccircle cx='99' cy='46' r='15' fill='%23243349' stroke='%23a78bfa' stroke-width='3'/%3E%3Cpath d='M104 39 A9 9 0 1 0 104 53 M88 43 L99 43 M88 49 L99 49' stroke='%23a78bfa' stroke-width='2.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E",
  leafart: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M100 38 C152 66 160 128 100 170 C40 128 48 66 100 38 Z' fill='%23232f42' stroke='%233a4a63' stroke-width='4'/%3E%3Cpath d='M100 54 L100 168' stroke='%2334d399' stroke-width='3' stroke-linecap='round' opacity='0.8'/%3E%3Cg stroke='%2334d399' stroke-width='2.5' stroke-linecap='round' fill='none' opacity='0.55'%3E%3Cpath d='M100 78 L74 96'/%3E%3Cpath d='M100 78 L126 96'/%3E%3Cpath d='M100 106 L70 126'/%3E%3Cpath d='M100 106 L130 126'/%3E%3Cpath d='M100 134 L78 150'/%3E%3Cpath d='M100 134 L122 150'/%3E%3C/g%3E%3C/svg%3E",
  pc: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cellipse cx='100' cy='170' rx='58' ry='7' fill='%23101828' opacity='0.6'/%3E%3Crect x='140' y='48' width='34' height='116' rx='6' fill='%23232f42' stroke='%233a4a63' stroke-width='4'/%3E%3Cline x1='148' y1='60' x2='166' y2='60' stroke='%233a4a63' stroke-width='3'/%3E%3Cline x1='148' y1='70' x2='166' y2='70' stroke='%233a4a63' stroke-width='3'/%3E%3Crect x='146' y='84' width='4' height='64' rx='2' fill='%2354c8f0' opacity='0.8'/%3E%3Ccircle cx='164' cy='152' r='3' fill='%2354c8f0'/%3E%3Crect x='26' y='58' width='104' height='68' rx='7' fill='%23232f42' stroke='%233a4a63' stroke-width='4'/%3E%3Crect x='34' y='66' width='88' height='52' rx='3' fill='%23101828'/%3E%3Cpath d='M42 108 L58 88 L72 100 L88 78 L104 94 L114 86' stroke='%2354c8f0' stroke-width='3' fill='none' stroke-linecap='round' opacity='0.85'/%3E%3Crect x='68' y='126' width='20' height='10' fill='%232c3b54'/%3E%3Crect x='54' y='136' width='48' height='7' rx='3.5' fill='%232c3b54'/%3E%3C/svg%3E",
  nas: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cellipse cx='100' cy='168' rx='48' ry='7' fill='%23101828' opacity='0.6'/%3E%3Crect x='54' y='46' width='92' height='116' rx='10' fill='%23232f42' stroke='%233a4a63' stroke-width='4'/%3E%3Crect x='64' y='60' width='72' height='22' rx='4' fill='%23101828'/%3E%3Cline x1='120' y1='66' x2='120' y2='76' stroke='%233a4a63' stroke-width='3'/%3E%3Crect x='64' y='88' width='72' height='22' rx='4' fill='%23101828'/%3E%3Cline x1='120' y1='94' x2='120' y2='104' stroke='%233a4a63' stroke-width='3'/%3E%3Ccircle cx='72' cy='128' r='3.5' fill='%23a78bfa'/%3E%3Ccircle cx='84' cy='128' r='3.5' fill='%23a78bfa' opacity='0.5'/%3E%3Crect x='64' y='140' width='40' height='6' rx='3' fill='%232c3b54'/%3E%3C/svg%3E",
  radiator: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cellipse cx='100' cy='170' rx='56' ry='7' fill='%23101828' opacity='0.6'/%3E%3Cg fill='%23232f42' stroke='%233a4a63' stroke-width='3.5'%3E%3Crect x='44' y='76' width='17' height='84' rx='8'/%3E%3Crect x='67' y='76' width='17' height='84' rx='8'/%3E%3Crect x='90' y='76' width='17' height='84' rx='8'/%3E%3Crect x='113' y='76' width='17' height='84' rx='8'/%3E%3Crect x='136' y='76' width='17' height='84' rx='8'/%3E%3C/g%3E%3Crect x='40' y='88' width='118' height='7' rx='3.5' fill='%232c3b54'/%3E%3Ccircle cx='160' cy='72' r='7' fill='%23243349' stroke='%23ff8a4c' stroke-width='3'/%3E%3Cg stroke='%23ff8a4c' stroke-width='3' fill='none' stroke-linecap='round' opacity='0.6'%3E%3Cpath d='M70 58 Q74 48 70 38'/%3E%3Cpath d='M100 58 Q104 48 100 38'/%3E%3Cpath d='M130 58 Q134 48 130 38'/%3E%3C/g%3E%3C/svg%3E",
  dishwasher: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cellipse cx='100' cy='170' rx='54' ry='7' fill='%23101828' opacity='0.6'/%3E%3Crect x='50' y='42' width='100' height='124' rx='10' fill='%23232f42' stroke='%233a4a63' stroke-width='4'/%3E%3Crect x='50' y='42' width='100' height='24' rx='10' fill='%23243349'/%3E%3Ccircle cx='66' cy='54' r='4' fill='%233a4a63'/%3E%3Ccircle cx='80' cy='54' r='4' fill='%233a4a63'/%3E%3Crect x='118' y='50' width='22' height='8' rx='4' fill='%236ea8ff' opacity='0.7'/%3E%3Ccircle cx='100' cy='120' r='30' fill='%23101828' stroke='%233a4a63' stroke-width='4'/%3E%3Ccircle cx='100' cy='120' r='18' fill='%236ea8ff' opacity='0.25'/%3E%3Cpath d='M88 116 Q100 132 112 116' stroke='%236ea8ff' stroke-width='3' fill='none' stroke-linecap='round' opacity='0.8'/%3E%3C/svg%3E",
  camera: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M168 30 L168 64' stroke='%233a4a63' stroke-width='8' stroke-linecap='round'/%3E%3Cpath d='M168 62 L140 78' stroke='%233a4a63' stroke-width='7' stroke-linecap='round'/%3E%3Cg transform='rotate(-12 100 100)'%3E%3Crect x='44' y='78' width='104' height='46' rx='16' fill='%23232f42' stroke='%233a4a63' stroke-width='4'/%3E%3Ccircle cx='66' cy='101' r='16' fill='%23101828' stroke='%234f8cff' stroke-width='3'/%3E%3Ccircle cx='66' cy='101' r='6' fill='%234f8cff' opacity='0.85'/%3E%3Ccircle cx='134' cy='90' r='3' fill='%23f87171'/%3E%3C/g%3E%3Cg stroke='%234f8cff' stroke-width='2.5' fill='none' opacity='0.45'%3E%3Cpath d='M38 130 Q30 142 34 158'/%3E%3Cpath d='M52 138 Q46 148 49 160'/%3E%3C/g%3E%3C/svg%3E",
  motion: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='54' y='58' width='88' height='88' rx='18' fill='%23232f42' stroke='%233a4a63' stroke-width='4'/%3E%3Ccircle cx='98' cy='102' r='25' fill='%23101828' stroke='%233a4a63' stroke-width='3'/%3E%3Ccircle cx='98' cy='102' r='9' fill='%23a78bfa' opacity='0.8'/%3E%3Cg stroke='%23a78bfa' stroke-width='3' fill='none' stroke-linecap='round'%3E%3Cpath d='M138 62 A56 56 0 0 1 154 96' opacity='0.7'/%3E%3Cpath d='M150 46 A76 76 0 0 1 172 92' opacity='0.45'/%3E%3Cpath d='M162 30 A96 96 0 0 1 190 88' opacity='0.25'/%3E%3C/g%3E%3Ccircle cx='98' cy='160' r='3.5' fill='%23a78bfa' opacity='0.6'/%3E%3C/svg%3E",
  shield: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M100 34 L156 56 L156 102 C156 140 132 162 100 174 C68 162 44 140 44 102 L44 56 Z' fill='%23232f42' stroke='%233a4a63' stroke-width='5'/%3E%3Cpath d='M100 34 L100 174' stroke='%232c3b54' stroke-width='2'/%3E%3Cpath d='M74 104 L93 123 L128 84' stroke='%2334d399' stroke-width='8' fill='none' stroke-linecap='round' stroke-linejoin='round' opacity='0.85'/%3E%3C/svg%3E",
  people: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cellipse cx='100' cy='172' rx='58' ry='7' fill='%23101828' opacity='0.6'/%3E%3Ccircle cx='72' cy='82' r='19' fill='%23243349'/%3E%3Cpath d='M42 158 C42 124 54 108 72 108 C90 108 102 124 102 158 Z' fill='%23243349'/%3E%3Ccircle cx='126' cy='90' r='22' fill='%23232f42' stroke='%23ff8a4c' stroke-width='3'/%3E%3Cpath d='M92 168 C92 130 106 112 126 112 C146 112 160 130 160 168 Z' fill='%23232f42' stroke='%23ff8a4c' stroke-width='3'/%3E%3C/svg%3E",
};
const VIEW_ART_SYS = {
  cpuart: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cg stroke='%233a4a63' stroke-width='4' stroke-linecap='round'%3E%3Cline x1='62' y1='36' x2='62' y2='54'/%3E%3Cline x1='88' y1='36' x2='88' y2='54'/%3E%3Cline x1='114' y1='36' x2='114' y2='54'/%3E%3Cline x1='140' y1='36' x2='140' y2='54'/%3E%3Cline x1='62' y1='146' x2='62' y2='164'/%3E%3Cline x1='88' y1='146' x2='88' y2='164'/%3E%3Cline x1='114' y1='146' x2='114' y2='164'/%3E%3Cline x1='140' y1='146' x2='140' y2='164'/%3E%3Cline x1='36' y1='68' x2='54' y2='68'/%3E%3Cline x1='36' y1='94' x2='54' y2='94'/%3E%3Cline x1='36' y1='120' x2='54' y2='120'/%3E%3Cline x1='146' y1='68' x2='164' y2='68'/%3E%3Cline x1='146' y1='94' x2='164' y2='94'/%3E%3Cline x1='146' y1='120' x2='164' y2='120'/%3E%3C/g%3E%3Crect x='54' y='54' width='94' height='92' rx='12' fill='%23232f42' stroke='%233a4a63' stroke-width='4'/%3E%3Crect x='76' y='76' width='50' height='48' rx='7' fill='%23101828' stroke='%234f8cff' stroke-width='3'/%3E%3Ccircle cx='101' cy='100' r='7' fill='%234f8cff' opacity='0.8'/%3E%3C/svg%3E",
  ramart: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cg transform='rotate(-8 100 100)'%3E%3Crect x='26' y='74' width='148' height='46' rx='7' fill='%23232f42' stroke='%233a4a63' stroke-width='4'/%3E%3Cg fill='%23243349'%3E%3Crect x='36' y='84' width='20' height='18' rx='3'/%3E%3Crect x='62' y='84' width='20' height='18' rx='3'/%3E%3Crect x='88' y='84' width='20' height='18' rx='3'/%3E%3Crect x='114' y='84' width='20' height='18' rx='3'/%3E%3Crect x='140' y='84' width='20' height='18' rx='3'/%3E%3C/g%3E%3Crect x='88' y='84' width='20' height='18' rx='3' fill='%23ffb347' opacity='0.4'/%3E%3Cg fill='%233a4a63'%3E%3Crect x='34' y='114' width='9' height='8'/%3E%3Crect x='49' y='114' width='9' height='8'/%3E%3Crect x='64' y='114' width='9' height='8'/%3E%3Crect x='79' y='114' width='9' height='8'/%3E%3Crect x='94' y='114' width='9' height='8'/%3E%3Crect x='109' y='114' width='9' height='8'/%3E%3Crect x='124' y='114' width='9' height='8'/%3E%3Crect x='139' y='114' width='9' height='8'/%3E%3Crect x='154' y='114' width='9' height='8'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E",
  diskart: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cellipse cx='100' cy='168' rx='52' ry='7' fill='%23101828' opacity='0.6'/%3E%3Crect x='42' y='44' width='116' height='118' rx='10' fill='%23232f42' stroke='%233a4a63' stroke-width='4'/%3E%3Ccircle cx='92' cy='96' r='34' fill='%23101828' stroke='%233a4a63' stroke-width='3'/%3E%3Ccircle cx='92' cy='96' r='20' fill='none' stroke='%232c3b54' stroke-width='2'/%3E%3Ccircle cx='92' cy='96' r='6' fill='%2334d399' opacity='0.8'/%3E%3Cpath d='M118 128 L138 100 L146 104 L128 132 Z' fill='%23243349' stroke='%233a4a63' stroke-width='2.5'/%3E%3Ccircle cx='142' cy='60' r='4' fill='%2334d399' opacity='0.7'/%3E%3C/svg%3E",
  serverart: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cellipse cx='100' cy='170' rx='56' ry='7' fill='%23101828' opacity='0.6'/%3E%3Crect x='44' y='52' width='112' height='50' rx='9' fill='%23232f42' stroke='%233a4a63' stroke-width='4'/%3E%3Crect x='44' y='110' width='112' height='50' rx='9' fill='%23232f42' stroke='%233a4a63' stroke-width='4'/%3E%3Cg fill='%23101828'%3E%3Crect x='56' y='66' width='52' height='9' rx='4'/%3E%3Crect x='56' y='81' width='52' height='9' rx='4'/%3E%3Crect x='56' y='124' width='52' height='9' rx='4'/%3E%3Crect x='56' y='139' width='52' height='9' rx='4'/%3E%3C/g%3E%3Ccircle cx='134' cy='77' r='4' fill='%2334d399'/%3E%3Ccircle cx='146' cy='77' r='4' fill='%2334d399' opacity='0.45'/%3E%3Ccircle cx='134' cy='135' r='4' fill='%2334d399'/%3E%3Ccircle cx='146' cy='135' r='4' fill='%23f87171' opacity='0.7'/%3E%3C/svg%3E",
  routerart: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cellipse cx='100' cy='166' rx='58' ry='7' fill='%23101828' opacity='0.6'/%3E%3Cpath d='M64 96 L64 52' stroke='%233a4a63' stroke-width='6' stroke-linecap='round'/%3E%3Cpath d='M136 96 L136 52' stroke='%233a4a63' stroke-width='6' stroke-linecap='round'/%3E%3Ccircle cx='64' cy='48' r='5' fill='%23243349' stroke='%233a4a63' stroke-width='2'/%3E%3Ccircle cx='136' cy='48' r='5' fill='%23243349' stroke='%233a4a63' stroke-width='2'/%3E%3Crect x='38' y='104' width='124' height='44' rx='12' fill='%23232f42' stroke='%233a4a63' stroke-width='4'/%3E%3Ccircle cx='60' cy='126' r='4.5' fill='%2354c8f0'/%3E%3Ccircle cx='78' cy='126' r='4.5' fill='%2354c8f0' opacity='0.5'/%3E%3Ccircle cx='96' cy='126' r='4.5' fill='%2334d399' opacity='0.7'/%3E%3Cg stroke='%2354c8f0' stroke-width='3' fill='none' stroke-linecap='round'%3E%3Cpath d='M86 40 A22 22 0 0 1 114 40' opacity='0.55'/%3E%3Cpath d='M79 28 A34 34 0 0 1 121 28' opacity='0.3'/%3E%3C/g%3E%3C/svg%3E",
};
Object.assign(VIEW_ART, VIEW_ART_SYS);
const DEVICE_ART = {
  appletv: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='28' y='42' width='144' height='88' rx='9' fill='%231c2636' stroke='%233a4a63' stroke-width='4'/%3E%3Crect x='37' y='51' width='126' height='70' rx='4' fill='%23243349'/%3E%3Cpath d='M91 71 L116 86 L91 101 Z' fill='%2354c8f0' opacity='0.85'/%3E%3Crect x='90' y='130' width='20' height='8' rx='3' fill='%233a4a63'/%3E%3Crect x='62' y='138' width='76' height='6' rx='3' fill='%233a4a63'/%3E%3Crect x='70' y='156' width='60' height='15' rx='6' fill='%232a3850'/%3E%3Ccircle cx='122' cy='163' r='3' fill='%2354c8f0' opacity='0.8'/%3E%3Crect x='146' y='150' width='11' height='32' rx='5' fill='%232a3850'/%3E%3Ccircle cx='151.5' cy='158' r='2.5' fill='%233a4a63'/%3E%3C/svg%3E",
  echo: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cellipse cx='100' cy='168' rx='44' ry='7' fill='%23101828' opacity='0.6'/%3E%3Crect x='63' y='52' width='74' height='114' rx='18' fill='%23232f42'/%3E%3Cellipse cx='100' cy='56' rx='37' ry='11' fill='%232c3b54'/%3E%3Cellipse cx='100' cy='56' rx='37' ry='11' fill='none' stroke='%2322d3ee' stroke-width='3.5' opacity='0.85'/%3E%3Crect x='72' y='80' width='56' height='4' rx='2' fill='%2331415c' opacity='0.9'/%3E%3Crect x='72' y='92' width='56' height='4' rx='2' fill='%2331415c'/%3E%3Crect x='72' y='104' width='56' height='4' rx='2' fill='%2331415c'/%3E%3Crect x='72' y='116' width='56' height='4' rx='2' fill='%2331415c'/%3E%3Crect x='72' y='128' width='56' height='4' rx='2' fill='%2331415c'/%3E%3Crect x='72' y='140' width='56' height='4' rx='2' fill='%2331415c'/%3E%3C/svg%3E",
  vacuum: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='100' cy='100' r='72' fill='%23232f42' stroke='%235a6b8f' stroke-width='6'/%3E%3Ccircle cx='100' cy='100' r='50' fill='%232a3852' stroke='%23455878' stroke-width='3'/%3E%3Ccircle cx='100' cy='74' r='14' fill='%23101828' stroke='%235a6b8f' stroke-width='4'/%3E%3Ccircle cx='100' cy='74' r='5' fill='%2334d399'/%3E%3Cpath d='M38 132 A 72 72 0 0 0 162 132' fill='none' stroke='%235a6b8f' stroke-width='6' opacity='0.9'/%3E%3Cpath d='M72 118 A 40 40 0 0 0 128 118' fill='none' stroke='%23455878' stroke-width='4' opacity='0.9'/%3E%3Ccircle cx='100' cy='100' r='7' fill='%23455878'/%3E%3C/svg%3E",
  mower: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M24 172 L32 146 L40 172 Z' fill='%2334d399' opacity='0.7'/%3E%3Cpath d='M166 172 L174 144 L182 172 Z' fill='%2334d399' opacity='0.55'/%3E%3Crect x='36' y='74' width='128' height='62' rx='26' fill='%23232f42' stroke='%235a6b8f' stroke-width='6'/%3E%3Cellipse cx='86' cy='76' rx='46' ry='15' fill='%23324263' stroke='%23455878' stroke-width='3'/%3E%3Ccircle cx='64' cy='140' r='23' fill='%23101828' stroke='%235a6b8f' stroke-width='6'/%3E%3Ccircle cx='64' cy='140' r='9' fill='%232f3f5c'/%3E%3Ccircle cx='142' cy='146' r='16' fill='%23101828' stroke='%235a6b8f' stroke-width='5'/%3E%3Ccircle cx='142' cy='146' r='6' fill='%232f3f5c'/%3E%3Ccircle cx='148' cy='94' r='6' fill='%23a3e635'/%3E%3C/svg%3E",
  feeder: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='58' y='28' width='84' height='124' rx='19' fill='%23232f42' stroke='%235a6b8f' stroke-width='6'/%3E%3Crect x='72' y='44' width='56' height='58' rx='11' fill='%23101828' stroke='%23455878' stroke-width='3'/%3E%3Cg fill='%23ffce73'%3E%3Ccircle cx='84' cy='92' r='5.5'/%3E%3Ccircle cx='98' cy='88' r='5.5'/%3E%3Ccircle cx='113' cy='93' r='5.5'/%3E%3Ccircle cx='90' cy='79' r='5.5'/%3E%3Ccircle cx='106' cy='76' r='5.5'/%3E%3C/g%3E%3Ccircle cx='100' cy='124' r='8' fill='%232f3f5c' stroke='%235a6b8f' stroke-width='3.5'/%3E%3Cpath d='M124 150 q 34 0 34 16 q 0 12 -28 12 L 114 178 Z' fill='%232a3852' stroke='%235a6b8f' stroke-width='5'/%3E%3Cg fill='%23ffce73'%3E%3Ccircle cx='140' cy='163' r='4'/%3E%3Ccircle cx='150' cy='167' r='4'/%3E%3C/g%3E%3C/svg%3E",
};
function ObjSheet({ title, img, accent = 'var(--o-accent)', rows = [], actions = [], onClose }) {
  return (
    <BottomSheet onClose={onClose}>
      {(close) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            {img && <img src={img} alt="" style={{ width: 46, height: 46, borderRadius: 13, objectFit: 'contain', background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }} />}
            <div style={{ fontSize: 17, fontWeight: 800 }}>{title}</div>
          </div>
          <div style={{ background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd3)', borderRadius: 14, padding: '4px 14px', marginBottom: 14 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: i < rows.length - 1 ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)' }}>{r[0]}</span>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: r[2] || 'var(--o-text)', textAlign: 'right' }}>{r[1]}</span>
              </div>
            ))}
          </div>
          {actions.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: actions.length > 1 ? '1fr 1fr' : '1fr', gap: 10 }}>
              {actions.map((a, i) => (
                <button key={i} onClick={() => { if (a.run) a.run(); close(); }} style={{ padding: '13px 10px', borderRadius: 13, border: a.primary ? 'none' : 'var(--o-bw,1px) solid var(--o-bd1)', cursor: 'pointer', fontWeight: 800, fontSize: 13, background: a.primary ? accent : 'var(--o-s2)', color: a.primary ? '#fff' : 'var(--o-text1)' }}>{a.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
function ObjCard({ icon, iconBg, name, sub, status, statusColor, barLabel, barPct, barColor, barText, barLiquid, toggleOn, onToggle, actionLabel, onAction, onOpen, art, idx = 0, iconActive = false, extra = null }) {
  const tilt = useTilt(4);
  return (
    <div ref={tilt.ref} onPointerMove={tilt.onPointerMove} onPointerLeave={tilt.onPointerLeave} onPointerCancel={tilt.onPointerCancel} className={'o-piece o-stag o-hov ' + (tilt.className || '')} role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen && onOpen(); } }} style={{ ...card, position: 'relative', overflow: 'hidden', borderRadius: 16, padding: '12px 14px', boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', cursor: 'pointer', display: 'flex', flexDirection: 'column', ...stag(idx) }}>
      {/* filigrane appareil — ancré au bord droit (jamais en %, cf. plantes) */}
      {art && <div aria-hidden="true" style={{ position: 'absolute', right: 8, bottom: -6, width: 104, height: 104, backgroundImage: `url("${art}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center bottom', opacity: 0.3, pointerEvents: 'none' }} />}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{''}<span style={{ display: 'inline-flex', animation: iconActive && !REDUCE_MOTION ? 'm-wiggle 2s ease-in-out infinite' : 'none' }}>{icon}</span></div>
        {onToggle && (
          <span role="switch" aria-checked={!!toggleOn} aria-label={'Alimentation ' + name} tabIndex={0}
            onClick={e => { e.stopPropagation(); onToggle(); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggle(); } }}
            style={{ width: 38, height: 21, borderRadius: 999, cursor: 'pointer', flexShrink: 0, background: toggleOn ? 'linear-gradient(135deg,#ffce73,#f59e0b)' : 'var(--o-s1)', border: 'var(--o-bw,1px) solid ' + (toggleOn ? 'transparent' : 'var(--o-bd2)'), transition: 'background .2s' }}>
            <span style={{ display: 'block', position: 'relative', top: 2, left: toggleOn ? 18 : 2, width: 15, height: 15, borderRadius: '50%', background: toggleOn ? '#fff' : 'var(--o-text3)', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)' }} />
          </span>
        )}
      </div>
      <div style={{ position: 'relative', fontSize: 14.5, fontWeight: 800 }}>{name}</div>
      <div style={{ position: 'relative', fontSize: 11.5, color: 'var(--o-text3)', fontWeight: 600, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
      <div style={{ position: 'relative', fontSize: 12, color: statusColor || 'var(--o-text2)', fontWeight: 700, marginTop: 5, minHeight: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><FlipText live text={String(status == null ? '' : status)} /></div>
      {barPct != null && (
        <div style={{ position: 'relative', marginTop: 7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)', marginBottom: 5 }}><span>{barLabel}</span><span style={{ color: 'var(--o-text1)' }}>{barText}</span></div>
          <Gauge pct={barPct} color={barColor || 'var(--o-ok)'} liquid={!!barLiquid} />
        </div>
      )}
      {extra && <div style={{ position: 'relative' }}>{extra}</div>}
      <div style={{ position: 'relative', marginTop: 'auto' }}>
        {actionLabel && (
          <ActionBtn onClick={() => { if (onAction) onAction(); }} style={{ marginTop: 9, width: '100%', padding: '8px 10px', borderRadius: 11, border: 'var(--o-bw,1px) solid var(--o-bd1)', cursor: 'pointer', fontWeight: 700, fontSize: 12.5, background: 'var(--o-s2)', color: 'var(--o-text1)' }}>{actionLabel}</ActionBtn>
        )}
      </div>
    </div>
  );
}
// Carte capteur plante (vue Objets) — extraite pour pouvoir utiliser useTilt (hook) par carte.
function PlantObjCard({ pl, pi, v, batCol, fmtV, onOpen }) {
  const tilt = useTilt(4);
  return (
    <div ref={tilt.ref} onPointerMove={tilt.onPointerMove} onPointerLeave={tilt.onPointerLeave} onPointerCancel={tilt.onPointerCancel} className={'o-piece o-stag ' + (tilt.className || '')} role="button" tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      style={{ ...card, position: 'relative', overflow: 'hidden', borderRadius: 16, padding: '16px 17px', boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', cursor: 'pointer', border: pl.hum != null && pl.hum < 15 ? '1px solid rgba(var(--o-warn2-rgb),.55)' : undefined, ...stag(pi, 120) }}>
      {/* filigrane illustration — bas de carte, ancré à droite (réf. user) */}
      {pl.img && PLANT_ART[pl.img] && <div aria-hidden="true" style={{ position: 'absolute', right: 10, bottom: -14, width: 150, height: 150, backgroundImage: `url("${PLANT_ART[pl.img]}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center bottom', opacity: 0.15, pointerEvents: 'none' }} />}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pl.name}</div>
          {pl.room && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', marginTop: 2 }}>{pl.room}</div>}
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: batCol(pl.bat), flexShrink: 0, marginTop: 2 }}><Fi i="battery-full" size={12} color={batCol(pl.bat)} />{pl.bat != null ? Math.round(pl.bat) + ' %' : '—'}</span>
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: v.c, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}><Num v={pl.hum} suffix="%" /></span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('humidité du sol')}</span>
      </div>
      <Gauge pct={pl.hum || 0} color={v.c} h={6} style={{ position: 'relative', margin: '11px 0 9px' }} />
      <div style={{ position: 'relative', fontSize: 12, fontWeight: 700, color: v.c, borderBottom: 'var(--o-bw,1px) solid var(--o-bd3)', paddingBottom: 12, marginBottom: 11 }}><FlipText text={v.t} /></div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, fontWeight: 600, color: 'var(--o-text2)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Fi i="sun" size={12} color="var(--o-text3)" />{fmtV(pl.lux, ' lx')}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Fi i="raindrops" size={12} color="var(--o-text3)" />{fmtV(pl.cond, ' µS')}</span>
      </div>
    </div>
  );
}
const OBJ_LAYOUT_KEY = 'loggia_objlayout';

function ObjetsView({ hass, onNav, edit = false }) {
  const S = (hass && hass.states) || null;
  const num = (id, d = null) => { const e = S && S[id]; if (!e) return d; const n = parseFloat(e.state); return isNaN(n) ? d : n; };
  const stTxt = (id) => { const e = S && S[id]; return (e && e.state != null && e.state !== 'unknown' && e.state !== 'unavailable') ? e.state : null; };
  const isOn = (id) => { const e = S && S[id]; return !!(e && e.state === 'on'); };
  const call = (d, s, data) => { try { if (hass && hass.callService) hass.callService(d, s, data || {}); } catch (e) {} };
  const [sheet, setSheet] = useState(null);
  const batCol = (b) => b == null ? 'var(--o-text3)' : b > 40 ? 'var(--o-ok)' : b > 15 ? '#ffb347' : '#f87171';

  // Aspirateur : identifiants pris dans la configuration utilisateur, jamais
  // dans le code : elles viennent de la configuration ou de la découverte.
  const { resolved: objRes } = useLoggia();
  const objVac = useEntities('vacuum', null) || {};
  // Le script maison s'il est configuré (il fait souvent plus que le service),
  // sinon le service standard du domaine `vacuum`, disponible partout.
  const objVacRun = (key, svc) => {
    const sc = (loggiaEnt('vacuumScripts', null) || {})[key];
    if (sc && S && S[sc]) call('script', 'turn_on', { entity_id: sc });
    else if (objVacMain) call('vacuum', svc, { entity_id: objVacMain });
  };
  const rvac = (objRes && objRes.vacuum && objRes.vacuum.available) ? objRes.vacuum : null;
  const vacRaw = rvac ? rvac.state : null;
  // L'entité `vacuum` elle-même : celle que la résolution a retenue, sinon la
  // première trouvée. C'est elle qui reçoit les services standard.
  const objVacMain = (rvac && rvac.main) || (S ? (Object.keys(S).find(id => id.indexOf('vacuum.') === 0) || null) : null);
  const vacCleaning = vacRaw ? vacRaw === 'cleaning' : isOn(objVac.cleaning);
  const vacEtat = stTxt(objVac.etat) || (vacRaw && tr(VACUUM_STATE_FR[vacRaw])) || (S ? tr('Inactif') : tr('Sur base'));
  const vacBatRaw = (rvac && rvac.batteryLevel != null) ? rvac.batteryLevel : num(objVac.battery || (rvac && rvac.battery));
  const vacBat = S ? vacBatRaw : 62;
  const vacSurf = stTxt(objVac.surface) || fmtArea(stTxt(rvac && rvac.area_cleaned)) || '—';
  const vacDuree = stTxt(objVac.duree) || fmtDuration(stTxt(rvac && rvac.duration)) || '—';
  const vacMaint = stTxt(objVac.maintenance) || 'OK';
  const lubaId = mowerId(S);
  const lubaSt = (lubaId && S && S[lubaId] && S[lubaId].state) || 'docked';
  const lubaBat = S ? num(mowerSensor(S, 'battery')) : 88;
  const lubaProg = num(mowerSensor(S, 'progress'), 0) || 0;
  const lubaMow = lubaSt === 'mowing';
  const lubaTxt = lubaMow ? ('Tonte · ' + Math.round(lubaProg) + '%') : lubaSt === 'returning' ? tr('Retour base') : lubaSt === 'paused' ? tr('En pause') : lubaSt === 'error' ? tr('Erreur') : 'Station de charge';
  const croqPct = S ? Math.max(0, Math.min(100, Math.round((num(croqHaids().reservoir, 0) || 0) / croqMax(S) * 100))) : 74;
  const nowMin = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
  const mealMin = (t) => { const p = t.split(':'); return (+p[0]) * 60 + (+p[1]); };
  const nextMeal = croqMeals().filter(m => !S || !S[m.auto] || S[m.auto].state === 'on').filter(m => mealMin(m.time) > nowMin).sort((a, b) => mealMin(a.time) - mealMin(b.time))[0];
  const plants = plantsCfg().map(p => ({
    // `base` sert de cle : sans lui, toutes les plantes en partagent une seule.
    base: p.base, name: p.name || p.base, img: p.img || null, room: plantPiece(S, p.base, p.room),
    hum: S ? num(plantCapteur(S, p.base, 'moisture')) : (p.img === 'dracaena' ? 12 : 41),
    cond: S ? num(plantCapteur(S, p.base, 'conductivity', 'µS/cm')) : 500,
    lux: S ? num(plantCapteur(S, p.base, 'illuminance', 'lx')) : 1000,
    temp: S ? num(plantCapteur(S, p.base, 'temperature')) : 22,
    bat: S ? num(plantCapteur(S, p.base, 'battery', '%')) : 80,
  }));
  const plantsDry = plants.filter(p => p.hum != null && p.hum < 15).length;
  const medias = medPlayers().map(p => ({ p, np: mpRead(S || {}, p.haid) }));

  // Ce que la vue propose, dans son ordre naturel. Une carte native n'y entre
  // que si son appareil existe.
  const derived = [
    ...(objVacMain ? ['obj:vacuum'] : []),
    ...(lubaId ? ['obj:mower'] : []),
    ...((croqHaids().reservoir || croqHaids().portionWeight) ? ['obj:feeder'] : []),
    ...medias.map(({ p }) => 'media:' + p.haid),
    // Les plantes gardent leur intertitre : c'est ce qui les distingue du reste.
    ...(plants.length ? ['sect:plantes', ...plants.map(pl => 'plant:' + pl.base)] : []),
  ];
  const ed = useLayoutEditor(OBJ_LAYOUT_KEY, 'objets', derived);
  const dc = useDomainCards(hass); // cartes typées du catalogue sur les ajouts libres
  const [objAdd, setObjAdd] = useState(false);
  // Carte dont la fiche est ouverte, ou null.
  const [cardEdit, setCardEdit] = useState(null);
  // Libelle affiche d'un element : le nom choisi, sinon celui de la carte.
  const plantDe = (k) => plants.find(pl => 'plant:' + pl.base === k) || null;
  const nomDe = (k) => ed.labelOf(k) || (
    k === 'obj:vacuum' ? 'Aspirateur robot'
      : k === 'obj:mower' ? 'Robot tondeuse'
        : k === 'obj:feeder' ? 'Distributeur'
          : k === 'sect:plantes' ? 'Capteurs de plantes'
            : k.indexOf('sect:') === 0 ? 'Section'
              : k.indexOf('media:') === 0 ? ((medias.find(m => 'media:' + m.p.haid === k) || { p: {} }).p.name || k.slice(6))
                : k.indexOf('plant:') === 0 ? ((plantDe(k) || {}).name || k.slice(6))
                  : ((S && S[k] && S[k].attributes && S[k].attributes.friendly_name) || k));
  // Ajouter un intertitre : il se pose en fin de liste, puis se renomme et se
  // deplace comme n'importe quelle carte.
  const addSection = () => ed.toggle('sect:' + Date.now().toString(36));
  // Nom d'origine, sans le renommage : ce a quoi un champ vide ramene.
  const origineDe = (k) => k === 'obj:vacuum' ? 'Aspirateur robot'
    : k === 'obj:mower' ? 'Robot tondeuse'
      : k === 'obj:feeder' ? 'Distributeur'
        : k === 'sect:plantes' ? 'Capteurs de plantes'
          : k.indexOf('sect:') === 0 ? 'Section'
            : k.indexOf('media:') === 0 ? ((medias.find(m => 'media:' + m.p.haid === k) || { p: {} }).p.name || k.slice(6))
              : k.indexOf('plant:') === 0 ? ((plantDe(k) || {}).name || k.slice(6))
                : ((S && S[k] && S[k].attributes && S[k].attributes.friendly_name) || k);

  // Decoupage de la liste : un intertitre ouvre un bloc, les cartes s'y
  // accumulent jusqu'au suivant. Le premier bloc n'a pas de titre.
  const blocs = [];
  ed.ids.forEach(k => {
    if (k.indexOf('sect:') === 0) blocs.push({ titre: k, cartes: [] });
    else {
      if (!blocs.length) blocs.push({ titre: null, cartes: [] });
      blocs[blocs.length - 1].cartes.push(k);
    }
  });
  // Bandeau + carte de synthèse repliables (patron Atrium, 21/08)
  const [panel, setPanel] = useState(() => { try { return localStorage.getItem('loggia-objpanel') !== '0'; } catch (e) { return true; } });
  const togglePanel = () => setPanel(v => { const nv = !v; try { localStorage.setItem('loggia-objpanel', nv ? '1' : '0'); } catch (e) {} return nv; });
  const actifs = (vacCleaning ? 1 : 0) + (lubaMow ? 1 : 0) + (nextMeal ? 1 : 0) + medias.filter(x => x.np.on).length;
  const total = 3 + medias.length;
  const plantVerdict = (hum) => hum == null ? { t: '—', c: 'var(--o-text3)' } : hum < 15 ? { t: 'Sol sec · à arroser', c: 'var(--o-warn2)' } : hum > 60 ? { t: 'Sol très humide', c: 'var(--o-cold)' } : { t: 'Humidité correcte', c: 'var(--o-ok)' };
  const fmtV = (v, u) => v == null ? '—' : Math.round(v) + u;

  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="o-obj-head" style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{tr('Objets connectés')}</h1>
          <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>Aspirateur, tondeuse, lave-vaisselle, distributeur, plantes</div>
          </div>
          <span style={{ flex: 1 }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: actifs ? 'rgba(var(--o-ok-rgb),.14)' : 'var(--o-s2)', color: actifs ? 'var(--o-ok)' : 'var(--o-text2)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: actifs ? 'var(--o-ok)' : 'var(--o-text3)' }} />{actifs ? tr('{n} EN ACTIVITÉ', { n: actifs }) : tr('RIEN EN COURS')}</span>
        </div>

        {/* réglages rapides : robots */}
        <div className="o-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,20px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>Aspirateur</span>
            <button onClick={() => { if (rvac) call('vacuum', vacCleaning ? 'return_to_base' : 'start', { entity_id: rvac.main }); }} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, background: vacCleaning ? 'rgba(var(--o-accent-rgb),.18)' : 'transparent', color: vacCleaning ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}>{vacCleaning ? 'Renvoyer à la base' : 'Nettoyer'}</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>Tondeuse</span>
            <button onClick={() => call('lawn_mower', lubaMow ? 'dock' : 'start_mowing', { entity_id: lubaId })} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, background: lubaMow ? 'rgba(var(--o-accent-rgb),.18)' : 'transparent', color: lubaMow ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}>{lubaMow ? 'Rentrer' : 'Tondre'}</button>
          </div>
          <span style={{ flex: 1 }} />
          <button onClick={togglePanel} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, border: panel ? 'var(--o-bw,1px) solid rgba(var(--o-accent-rgb),.44)' : 'var(--o-bw,1px) solid var(--o-bd1)', background: panel ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: panel ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}><Fi i="sliders-v" size={13} /><span className="o-barlabel">{panel ? tr('Masquer les réglages') : tr('Réglages de la vue')}</span></button>
        </div>

        {panel && (
          <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '20px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Appareils autonomes</div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap', fontSize: 11, fontWeight: 800, background: (vacCleaning || lubaMow) ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: (vacCleaning || lubaMow) ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: (vacCleaning || lubaMow) ? 'var(--o-accent)' : 'var(--o-text3)' }} />{(vacCleaning || lubaMow) ? 'EN COURS' : 'RIEN EN COURS'}</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, margin: '3px 0 8px' }}>Robots, distributeur et plantes suivis en continu</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <EnRow label={((objVacMain && S && S[objVacMain] && S[objVacMain].attributes && S[objVacMain].attributes.friendly_name) || tr('Aspirateur'))} desc={vacEtat + (vacBat != null ? ' · batterie ' + Math.round(vacBat) + ' %' : '')}>
                <EnVal v={vacCleaning ? 'En nettoyage' : tr('Sur la base')} col={vacCleaning ? 'var(--o-accent-soft)' : 'var(--o-text3)'} />
              </EnRow>
              <EnRow label={((lubaId && S && S[lubaId] && S[lubaId].attributes && S[lubaId].attributes.friendly_name) || tr('Tondeuse'))} desc={lubaTxt + (lubaBat != null ? ' · batterie ' + Math.round(lubaBat) + ' %' : '')}>
                <EnVal v={lubaMow ? Math.round(lubaProg) + ' %' : tr('Sur la base')} col={lubaMow ? 'var(--o-ok)' : 'var(--o-text3)'} />
              </EnRow>
              <EnRow label={tr('Croquettes')} desc={nextMeal ? 'Prochain repas ' + nextMeal.time + ' · ' + nextMeal.g + ' g' : 'Plus de repas programme aujourd’hui'}>
                <EnGauge v={croqPct + ' %'} pct={croqPct} col={croqPct < 20 ? 'var(--o-bad)' : croqPct < 40 ? 'var(--o-warn2)' : 'var(--o-ok)'} />
              </EnRow>
              {plants.length > 0 && (
                <EnRow label="Plantes" desc={plantsDry ? (plantsDry > 1 ? tr('{n} plantes sous le seuil d’humidité', { n: plantsDry }) : tr('{n} plante sous le seuil d’humidité', { n: plantsDry })) : 'Toutes au-dessus du seuil d’humidite'}>
                  <EnVal v={plants.length + (plants.length > 1 ? ' suivies' : ' suivie')} col={plantsDry ? 'var(--o-warn2)' : 'var(--o-ok)'} />
                </EnRow>
              )}
            </div>
          </div>
        )}

        <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{tr('État des appareils')}</div>

        <div ref={ed.gridRef} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {blocs.map((bloc, bi) => (
          // Hors édition, un intertitre sans carte ne s'affiche pas.
          (!edit && bloc.titre && !bloc.cartes.length) ? null : (
          <div key={bloc.titre || 'b' + bi} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bloc.titre && (edit
              ? <EditableCard plat ed={ed} id={bloc.titre} nom={nomDe(bloc.titre)} onEdit={setCardEdit}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>
                    <Fi i={bloc.titre === 'sect:plantes' ? 'seedling' : 'apps'} size={16} color="var(--o-ok)" />{nomDe(bloc.titre)}
                  </div>
                </EditableCard>
              : <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>
                    <Fi i={bloc.titre === 'sect:plantes' ? 'seedling' : 'apps'} size={16} color="var(--o-ok)" />{nomDe(bloc.titre)}
                  </div>
                  {bloc.titre === 'sect:plantes' && plantsDry > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-warn2)' }}>{plantsDry} sous le seuil d'humidité</span>}
                </div>)}
            <div className="grid-objets" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(225px,1fr))', gap: 14 }}>
          {bloc.cartes.map((k) => {
            const i = ed.ids.indexOf(k);
            // Le sous-titre vient de l'entité : chacun voit le nom de SON
            // appareil, pas celui d'une installation particulière.
            const nomHA = (id) => (id && S && S[id] && S[id].attributes && S[id].attributes.friendly_name) || '';
            const med = k.indexOf('media:') === 0 ? medias.find(m => 'media:' + m.p.haid === k) : null;
            let carte;
            if (k === 'obj:vacuum') {
              carte = <ObjCard idx={i} icon={<Ico name="vacuum" size={19} color="var(--o-ok)" />} iconBg="rgba(52,211,153,.16)" art={DEVICE_ART.vacuum}
                name={nomDe(k)} iconActive={vacCleaning} sub={nomHA(objVacMain)} status={vacEtat} statusColor={vacCleaning ? 'var(--o-accent-soft)' : 'var(--o-text2)'}
                barLabel="Batterie" barPct={vacBat} barColor={batCol(vacBat)} barText={vacBat != null ? Math.round(vacBat) + '%' : '—'}
                actionLabel={vacCleaning ? tr('Renvoyer au dock') : tr('Démarrer le nettoyage')}
                onAction={() => objVacRun(vacCleaning ? 'retour_base' : 'nettoyer_tout', vacCleaning ? 'return_to_base' : 'start')}
                onOpen={() => setSheet({ type: 'vac' })}
                extra={objVacMain ? <Epingles pourId={objVacMain} hass={hass} avecAncre /> : null} />;
            } else if (k === 'obj:mower') {
              carte = <ObjCard idx={i} icon={<Ico name="mower" size={19} color="#a3e635" />} iconBg="rgba(163,230,53,.14)" art={DEVICE_ART.mower}
                name={nomDe(k)} iconActive={lubaMow} sub={nomHA(lubaId)} status={lubaTxt} statusColor={lubaMow ? 'var(--o-ok)' : 'var(--o-text2)'}
                barLabel="Batterie" barPct={lubaBat} barColor={batCol(lubaBat)} barText={lubaBat != null ? Math.round(lubaBat) + '%' : '—'}
                actionLabel={lubaMow ? 'Renvoyer à la base' : 'Lancer la tonte'}
                onAction={() => call('lawn_mower', lubaMow ? 'dock' : 'start_mowing', { entity_id: lubaId })}
                onOpen={() => setSheet({ type: 'luba' })}
                extra={lubaId ? <Epingles pourId={lubaId} hass={hass} avecAncre /> : null} />;
            } else if (k === 'obj:feeder') {
              /* Le « distribuer » vient de l'APPAREIL : un feeder Zigbee
               * standard expose un select `feed` dont l'option START lance une
               * distribution de serving_size portions — celles que le stepper
               * règle. Le script maison, qui force sa propre valeur, ne reste
               * qu'en repli pour les distributeurs sans ce select. */
              const ff = (() => {
                const fid = Object.keys(S).find(x => x.indexOf('select.') === 0 && /feed$/.test(x)
                  && S[x].attributes && Array.isArray(S[x].attributes.options)
                  && S[x].attributes.options.some(o => /^(start|feed)$/i.test(o)));
                return fid ? { id: fid, opt: S[fid].attributes.options.find(o => /^(start|feed)$/i.test(o)) } : null;
              })();
              const sc = ff ? null : feederScript(hass, loggiaEnt('feeder', null));
              carte = <ObjCard idx={i} icon={<Fi i="paw" size={17} color="#ffce73" />} iconBg="rgba(255,206,115,.14)" art={DEVICE_ART.feeder}
                name={nomDe(k)} sub={nomHA(croqHaids().reservoir)} status={nextMeal ? ('Prochaine ration ' + nextMeal.time) : 'Programme terminé'} statusColor="var(--o-text2)"
                barLabel={tr('Réservoir')} barPct={croqPct} barColor={croqPct < 25 ? '#f87171' : '#ffce73'} barText={croqPct + '%'} barLiquid
                actionLabel={(ff || sc) ? 'Distribuer une ration' : null}
                onAction={() => { if (ff) call('select', 'select_option', { entity_id: ff.id, option: ff.opt }); else if (sc) call('script', 'turn_on', { entity_id: sc }); }}
                onOpen={() => setSheet({ type: 'croq' })}
                extra={(() => { const fid = (loggiaEnt('feeder', null) || {}).haid || (S ? Object.keys(S).find(x => x.indexOf('number.') === 0 && /serving_size$/.test(x)) : null); return fid ? <Epingles pourId={fid} hass={hass} avecAncre /> : null; })()} />;
            } else if (med) {
              const { p, np } = med;
              carte = <ObjCard idx={i}
                icon={<Fi i={/echo|speaker|enceinte/i.test(p.id + p.haid) ? 'speaker' : 'screen'} size={17} color={p.c} />} iconBg={hx(p.c, 0.15)}
                art={/echo|speaker|enceinte/i.test(p.id + p.haid) ? DEVICE_ART.echo : /apple|atv|tv/i.test(p.id + p.haid) ? DEVICE_ART.appletv : null}
                name={nomDe(k)} sub={p.haid.replace('media_player.', '')}
                status={np.playing ? (np.title || tr('Lecture en cours')) : np.on ? tr('En veille') : tr('Éteint')}
                statusColor={np.playing ? 'var(--o-accent-soft)' : 'var(--o-text3)'}
                toggleOn={!!np.on} onToggle={() => call('media_player', np.on ? 'turn_off' : 'turn_on', { entity_id: p.haid })}
                actionLabel={np.playing ? 'Pause' : null}
                onAction={() => commander(hass, np.ctl || p.haid, 'pause')}
                onOpen={() => setSheet({ type: 'media', id: p.haid })} />;
            } else if (k.indexOf('plant:') === 0) {
              const pl = plantDe(k);
              carte = pl ? <PlantObjCard pl={{ ...pl, name: nomDe(k) }} pi={i} v={plantVerdict(pl.hum)} batCol={batCol} fmtV={fmtV} onOpen={() => setSheet({ type: 'plant', pl })} /> : null;
            } else {
              // Ajout libre : la carte du catalogue si un type est choisi,
              // sinon la générique — même personnalisation que les vues custom.
              carte = ed.typeOf(k)
                ? <CvTyped x={{ t: ed.typeOf(k), id: k }} hass={hass} dc={dc} />
                : <CvCard id={k} hass={hass} label={ed.labelOf(k)} onOpen={dc.ouvrir} />;
            }
            if (!edit) return <div key={k} className={ed.estLarge(k) ? 'o-cvw2' : undefined}>{carte}</div>;
            return <EditableCard key={k} ed={ed} id={k} nom={nomDe(k)} onEdit={setCardEdit}>{carte}</EditableCard>;
          })}
            </div>
          </div>)
        ))}
        </div>
        {edit && (() => {
          const btn = (accent) => ({ padding: '7px 12px', borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0,
            background: accent ? 'var(--o-accent)' : 'var(--o-s1)', color: accent ? '#06121f' : 'var(--o-text1)',
            border: accent ? 'none' : 'var(--o-bw,1px) solid var(--o-bd2)' });
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: 14, flexWrap: 'wrap', background: 'rgba(var(--o-accent-rgb),.12)', border: '1px dashed rgba(var(--o-accent-rgb),.45)' }}>
              <Fi i="pencil" size={14} color="var(--o-accent-soft)" />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', flex: 1, minWidth: 200 }}>
                Mode édition : clique une carte pour la modifier, glisse-la pour la déplacer.
                {ed.edits ? ' Cette vue est personnalisée.' : ' Cette vue suit la détection automatique.'}
              </span>
              <button onClick={() => setObjAdd(true)} style={btn(true)}>{tr('Ajouter un appareil')}</button>
              <button onClick={addSection} style={btn(false)}>{tr('Ajouter un titre')}</button>
              {ed.edits > 0 && <button onClick={ed.reset} style={btn(false)}>{tr("Rétablir l'automatique")}</button>}
            </div>
          );
        })()}
        {objAdd && <RoomAddSheet room={tr('Objets')} hass={hass} present={ed.ids} onToggle={ed.toggle} onClose={() => setObjAdd(false)} />}
        {cardEdit && <CardEditSheet ed={ed} id={cardEdit} nom={nomDe(cardEdit)} origine={origineDe(cardEdit)} hass={hass} onClose={() => setCardEdit(null)} />}
        {/* dc.card/dc.ouvrir sans dc.sheets = fiches muettes (piège vécu). */}
        {dc.sheets}


        {sheet && sheet.type === 'media' && <RoomMediaSheet id={sheet.id} hass={hass} onClose={() => setSheet(null)} />}
        {/* Les machines ouvrent la FICHE APPAREIL UNIVERSELLE quand l'entité HA
            existe — commandes, réglages, diagnostics, tout ce que l'appareil
            expose. L'ancienne fiche maison reste le filet sans entité. */}
        {sheet && sheet.type === 'vac' && (objVacMain
          ? <FicheAppareil id={objVacMain} hass={hass} onClose={() => setSheet(null)} />
          : <ObjSheet title="Aspirateur robot" accent="var(--o-ok)"
              rows={[[tr('État'), vacEtat], ['Batterie', vacBat != null ? Math.round(vacBat) + ' %' : '—', batCol(vacBat)], ['Surface nettoyée', vacSurf], ['Durée', vacDuree], ['Entretien', vacMaint]]}
              actions={[{ label: vacCleaning ? tr('Renvoyer au dock') : 'Démarrer', primary: true, run: () => objVacRun(vacCleaning ? 'retour_base' : 'nettoyer_tout', vacCleaning ? 'return_to_base' : 'start') }]}
              onClose={() => setSheet(null)} />)}
        {sheet && sheet.type === 'luba' && (lubaId
          ? <FicheAppareil id={lubaId} hass={hass} onClose={() => setSheet(null)} />
          : <ObjSheet title="Robot tondeuse" accent="#a3e635"
              rows={[[tr('État'), lubaTxt], ['Batterie', lubaBat != null ? Math.round(lubaBat) + ' %' : '—', batCol(lubaBat)], ['Progression', Math.round(lubaProg) + ' %'], ['Charge', isOn(mowerSensor(S, 'charging')) ? 'En charge' : '—']]}
              actions={[]}
              onClose={() => setSheet(null)} />)}
        {sheet && sheet.type === 'croq' && (() => {
          /* L'entité du distributeur : celle que la configuration désigne, sinon
           * le suffixe STANDARD des feeders Zigbee (`serving_size`) — un motif
           * de la classe d'appareil, pas un identifiant d'une installation. */
          const croqFicheId = (loggiaEnt('feeder', null) || {}).haid
            || (S ? Object.keys(S).find(id => id.indexOf('number.') === 0 && /serving_size$/.test(id)) : null);
          return croqFicheId
            ? <FicheAppareil id={croqFicheId} hass={hass} onClose={() => setSheet(null)} />
            : <ObjSheet title="Distributeur de croquettes" accent="#f59e0b"
                rows={[[tr('Réservoir'), croqPct + ' %', croqPct < 25 ? '#f87171' : 'var(--o-text)'], ['Prochaine ration', nextMeal ? (nextMeal.time + ' · ' + nextMeal.g + ' g') : '—'], ['Distribué aujourd\'hui', (num(croqHaids().distribuees, 0) || 0) + ' g']]}
                actions={((loggiaEnt('feeder', null) || {}).script) ? [{ label: 'Distribuer 1 ration', primary: true, run: () => call('script', 'turn_on', { entity_id: (loggiaEnt('feeder', null) || {}).script }) }] : []}
                onClose={() => setSheet(null)} />;
        })()}
        {sheet && sheet.type === 'plant' && (() => { const pl = sheet.pl; const v = plantVerdict(pl.hum); return <ObjSheet title={pl.name} img={pl.img && PLANT_ART[pl.img]} accent="var(--o-ok)"
          rows={[['Humidité du sol', pl.hum != null ? Math.round(pl.hum) + ' %' : '—', v.c], ['Verdict', v.t, v.c], ['Éclairement', fmtV(pl.lux, ' lx')], ['Conductivité (engrais)', fmtV(pl.cond, ' µS/cm')], [tr('Température'), pl.temp != null ? pl.temp.toFixed(1) + ' °C' : '—'], ['Pile capteur', pl.bat != null ? Math.round(pl.bat) + ' %' : '—', batCol(pl.bat)]]}
          onClose={() => setSheet(null)} />; })()}
      </div>
    </main>
  );
}

// ── Carte machine animée (aspirateur, tondeuse, lave-vaisselle, poubelles), inspirée des button-card V1 ──
const M_ANIM = { wiggle: 'm-wiggle 2s ease-in-out infinite', charge: 'm-charge 2s ease-in-out infinite', shake: 'm-shake 2.2s ease-in-out infinite', bounce: 'm-bounce 2s ease-in-out infinite' };
// SVG custom (Flaticon premium fournis par l'utilisateur, single-path 24×24 fill)
const CUSTOM_SVG = {
  vacuum: 'm24,12c0,6.617-5.383,12-12,12S0,18.617,0,12c0-2.9,1.035-5.563,2.754-7.64L.101,1.707,1.515.293l2.644,2.644c.851-.737,1.809-1.351,2.841-1.829v8.892c0,2.757,2.243,5,5,5s5-2.243,5-5V1.103c.993.459,1.916,1.044,2.741,1.743L22.485.101l1.414,1.414-2.745,2.745c1.771,2.092,2.845,4.791,2.845,7.74Zm-15-5.974c.838-.635,1.87-1.026,3-1.026s2.162.391,3,1.026V.389c-.96-.249-1.963-.389-3-.389s-2.04.141-3,.391v5.634Zm0,3.974c0,1.654,1.346,3,3,3s3-1.346,3-3-1.346-3-3-3-3,1.346-3,3Z',
  dishwasher: 'm15.61 21.985c.873-1.241 1.39-2.976 1.39-4.985s-.517-3.744-1.39-4.985c1.908.082 3.39 2.235 3.39 4.985s-1.482 4.902-3.39 4.985zm-7.61.015c-1.71 0-3-2.149-3-5s1.29-5 3-5 3 2.149 3 5-1.29 5-3 5zm1-5c0-1.936-.751-3-1-3s-1 1.064-1 3 .751 3 1 3 1-1.064 1-3zm.5-13.5c-.828 0-1.5.672-1.5 1.5s.672 1.5 1.5 1.5 1.5-.672 1.5-1.5-.672-1.5-1.5-1.5zm5 0c-.828 0-1.5.672-1.5 1.5s.672 1.5 1.5 1.5 1.5-.672 1.5-1.5-.672-1.5-1.5-1.5zm7.5 1.5v14c0 2.757-2.243 5-5 5h-10c-2.757 0-5-2.243-5-5v-14c0-2.757 2.243-5 5-5h10c2.757 0 5 2.243 5 5zm-2 5h-16v9c0 1.654 1.346 3 3 3h10c1.654 0 3-1.346 3-3zm0-5c0-1.654-1.346-3-3-3h-10c-1.654 0-3 1.346-3 3v3h16zm-5 12c0-2.75-1.482-4.902-3.39-4.985.873 1.241 1.39 2.975 1.39 4.985s-.517 3.744-1.39 4.985c1.908-.082 3.39-2.235 3.39-4.985z',
  couch: 'm2,8v-1c0-3.314,2.686-6,6-6h8c3.314,0,6,2.686,6,6v1c-2.209,0-4,1.791-4,4v3H6v-3c0-2.209-1.791-4-4-4Zm19.664,2.027c-.983.16-1.664,1.083-1.664,2.08v3.893c0,.552-.448,1-1,1H5c-.552,0-1-.448-1-1v-3.893c0-.996-.681-1.92-1.664-2.08-1.253-.204-2.336.758-2.336,1.973v4c0,1.636.786,3.088,2,4v2c0,.552.448,1,1,1s1-.448,1-1v-1.1c.323.066.658.1,1,.1h14c.342,0,.677-.034,1-.1v1.1c0,.552.448,1,1,1s1-.448,1-1v-2c1.214-.912,2-2.364,2-4v-4c0-1.215-1.083-2.176-2.336-1.973Z',
  'solar-panel': 'm23.899,16.232l-.862-3.256c-.464-1.753-2.055-2.977-3.867-2.977H4.83c-1.813,0-3.403,1.224-3.867,2.977l-.862,3.256c-.24.907-.05,1.854.523,2.598.572.743,1.438,1.17,2.377,1.17h7.999v2h-4c-.552,0-1,.447-1,1s.448,1,1,1h10c.553,0,1-.447,1-1s-.447-1-1-1h-4v-2h7.999c.938,0,1.805-.427,2.378-1.17.572-.744.763-1.69.522-2.598Zm-2.796-2.744l.135.512h-4.558l-.143-2h2.632c.906,0,1.701.612,1.934,1.488Zm-12.065,4.512l.143-2h5.638l.143,2h-5.924Zm.286-4l.143-2h5.067l.143,2h-5.352Zm-4.495-2h2.632l-.143,2H2.761l.135-.512c.231-.876,1.027-1.488,1.933-1.488Zm-2.621,5.61c-.191-.248-.254-.563-.174-.866l.197-.744h4.944l-.143,2H3.001c-.312,0-.602-.143-.792-.39Zm19.583,0c-.191.248-.48.391-.793.391h-4.033l-.143-2h4.945l.197.744c.08.303.017.618-.174.865ZM4,7c0-.553.448-1,1-1h2.101c.188-.923.64-1.745,1.261-2.408l-1.351-2.04c-.305-.46-.179-1.08.281-1.386.459-.305,1.08-.18,1.386.282l1.318,1.99c.616-.272,1.289-.438,2.004-.438s1.389.166,2.006.439l1.328-1.993c.306-.459.925-.583,1.387-.277.459.306.584.927.277,1.387l-1.359,2.039c.62.662,1.072,1.484,1.26,2.406h2.101c.553,0,1,.447,1,1s-.447,1-1,1h-3c-.553,0-1-.447-1-1,0-1.654-1.346-3-3-3s-3,1.346-3,3c0,.553-.448,1-1,1h-3c-.552,0-1-.447-1-1Z',
  'house-energy': 'M21.576,5.327L15.077,.941c-1.869-1.262-4.284-1.261-6.153,0L2.423,5.327C.906,6.352,0,8.056,0,9.886v8.614c0,3.032,2.467,5.5,5.5,5.5h13c3.033,0,5.5-2.468,5.5-5.5V9.886c0-1.83-.906-3.534-2.424-4.559Zm-.576,13.173c0,1.379-1.122,2.5-2.5,2.5h-3.42l1.853-5.372c.275-.797-.317-1.628-1.16-1.628h-2.87l1.369-4.497c.228-.748-.332-1.503-1.114-1.503-.392,0-.758,.197-.973,.525l-4.952,7.361c-.592,.91,.061,2.114,1.147,2.114h2.755l-1.152,3H5.5c-1.378,0-2.5-1.121-2.5-2.5V9.886c0-.832,.412-1.606,1.102-2.072L10.602,3.428c.425-.287,.911-.43,1.398-.43s.974,.143,1.398,.43l6.5,4.386c.69,.466,1.102,1.24,1.102,2.072v8.614Z',
  'utility-pole': 'm13,4h8.5c1.379,0,2.5-1.122,2.5-2.5v-.5c0-.552-.447-1-1-1s-1,.448-1,1v.5c0,.276-.225.5-.5.5h-1.5v-1c0-.552-.447-1-1-1s-1,.448-1,1v1h-5v-1c0-.552-.448-1-1-1s-1,.448-1,1v1h-5v-1c0-.552-.448-1-1-1s-1,.448-1,1v1h-1.5c-.276,0-.5-.224-.5-.5v-.5c0-.552-.448-1-1-1S0,.448,0,1v.5c0,1.378,1.122,2.5,2.5,2.5h8.5v4h-5v-1c0-.552-.448-1-1-1s-1,.448-1,1v1h-1.5c-.276,0-.5-.224-.5-.5v-.5c0-.552-.448-1-1-1s-1,.448-1,1v.5c0,1.378,1.122,2.5,2.5,2.5h2.086l6.414,6.414v6.586c0,.552.448,1,1,1s1-.448,1-1v-6.586l6.414-6.414h2.086c1.379,0,2.5-1.122,2.5-2.5v-.5c0-.552-.447-1-1-1s-1,.448-1,1v.5c0,.276-.225.5-.5.5h-1.5v-1c0-.552-.447-1-1-1s-1,.448-1,1v1h-5v-4Zm-5.586,6h3.586v3.586l-3.586-3.586Zm9.172,0l-3.586,3.586v-3.586h3.586Z',
  'teddy-bear': 'm6.172,5.189c-.112.42-.172.859-.172,1.311,0,3.038,2.686,5.5,6,5.5s6-2.462,6-5.5c0-.461-.062-.908-.179-1.336.145-.07.297-.193.463-.381,1.05-1.195.933-3.015-.262-4.066-1.195-1.05-3.015-.933-4.066.262-.081.092-.147.179-.2.261-.556-.156-1.145-.24-1.756-.24-.616,0-1.21.085-1.769.243-.067-.123-.169-.256-.313-.399-1.125-1.125-2.949-1.125-4.074,0-1.125,1.125-1.125,2.949,0,4.074.117.117.225.206.328.271Zm5.828,1.811c.828,0,1.5.448,1.5,1s-.672,1-1.5,1-1.5-.448-1.5-1,.672-1,1.5-1Zm-5.629,12.286s1.571,2.095,1.571,4.714h-1.562c-1.978,0-3.841-.932-5.028-2.514l-.775-1.033c-.822-1.096-.782-2.686.226-3.612,1.16-1.066,2.953-.878,3.875.351l1.693,2.095Zm17.053,1.165l-.776,1.035c-1.187,1.583-3.05,2.514-5.028,2.514h-1.583c0-3.667,1.531-4.897,1.531-4.897l1.755-1.912c.922-1.229,2.716-1.416,3.876-.35,1.008.926,1.047,2.515.226,3.609Zm-9.388,3.549h-4.093c0-3.194-1.77-5.646-2.016-5.971l-1.648-2.039c-.782-1.042-1.975-1.708-3.272-1.828-.149-.014-.297-.019-.445-.018l-2.036-2.953c-.868-1.157-.633-2.799.524-3.667.909-.682,2.117-.683,3.014-.091.491,3.697,3.864,6.567,7.938,6.567s7.447-2.87,7.938-6.567c.897-.592,2.105-.59,3.014.091,1.157.868,1.392,2.51.524,3.667l-2.036,2.953c-.148,0-.297.006-.445.02-1.26.115-2.422.747-3.204,1.737l-1.631,1.778c-.583.544-2.124,2.355-2.124,6.321Z',
  'bed-alt': 'M0,12V6C0,3.243,2.243,1,5,1h14c2.757,0,5,2.243,5,5v6h-3v-1c0-2.206-1.794-4-4-4h-2c-1.2,0-2.266,.542-3,1.382-.734-.84-1.8-1.382-3-1.382h-2c-2.206,0-4,1.794-4,4v1H0Zm9-3h-2c-1.103,0-2,.897-2,2v1h6v-1c0-1.103-.897-2-2-2Zm10,2c0-1.103-.897-2-2-2h-2c-1.103,0-2,.897-2,2v1h6v-1ZM0,14v6c0,.553,.448,1,1,1s1-.447,1-1v-2H22v2c0,.553,.447,1,1,1s1-.447,1-1v-6H0Z',
};
// Mappe les clés "machine" vers les noms Flaticon (pour celles dispo en webfont)
const FI_MAP = { mower: 'tractor', trash: 'trash', 'trash-full': 'trash-clock', battery: 'battery-full', 'battery-charging': 'battery-bolt', timer: 'clock' };
// Icône universelle : SVG custom si dispo, sinon glyphe Flaticon UICons.
function Ico({ name, size = 20, color = 'currentColor', style }) {
  if (CUSTOM_SVG[name]) return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" style={style}><path d={CUSTOM_SVG[name]} fill={color} /></svg>;
  return <i aria-hidden="true" className={'fi fi-rr-' + (FI_MAP[name] || name)} style={{ fontSize: size, color, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...style }} />;
}
function MachineCard({ m, small = false }) {
  if (!m) return null;
  const anim = m.anim ? M_ANIM[m.anim] : null;
  const box = small ? 32 : 40;
  return (
    <div style={{ ...stateCard, padding: small ? '8px 10px' : '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: small ? 9 : 11 }}>
        <div style={{ position: 'relative', width: box, height: box, flexShrink: 0 }}>
          {m.active && <div style={{ position: 'absolute', inset: -4, borderRadius: 14, background: m.color, animation: 'm-pulse 2.4s ease-in-out infinite' }} />}
          <div style={{ position: 'absolute', inset: 0, borderRadius: small ? 10 : 12, background: hx(m.color, 0.13), display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {m.spin && <div style={{ position: 'absolute', inset: 4, border: `2px dashed ${hx(m.color, 0.3)}`, borderRadius: '50%', animation: 'spin 3s linear infinite' }} />}
            <Ico name={m.iconKey} size={small ? 16 : 20} color={m.color} style={{ position: 'relative', zIndex: 1, animation: anim || 'none' }} />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: small ? 12.5 : 13.5, fontWeight: 700 }}>{m.label}</span>
            <span style={{ padding: '1px 7px', borderRadius: 7, fontSize: 9.5, fontWeight: 700, background: hx(m.color, 0.18), color: m.color }}><Shiny on={!!m.active}>{m.phase}</Shiny></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: small ? 2 : 3, fontSize: small ? 12 : 13.5, fontWeight: 700 }}>
            {m.valueIcon && <Ico name={m.valueIcon} size={13} color={m.barColor || m.color} />}<span>{m.valueText}</span>
            {m.extra && <span style={{ fontSize: 10, color: 'var(--o-text3)', fontWeight: 600, marginLeft: 2 }}>{m.extra}</span>}
          </div>
          {m.bar != null && (
            <div style={{ height: 4, borderRadius: 3, background: 'var(--o-bd1)', overflow: 'hidden', marginTop: 6 }}><div style={{ height: '100%', width: m.bar + '%', background: m.barColor || m.color, borderRadius: 3, transition: 'width 1s ease' }} /></div>
          )}
          {m.dotsTotal && (
            <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
              {Array.from({ length: m.dotsTotal }, (_, i) => <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < m.dotsFilled ? m.color : 'var(--o-bd1)', opacity: i < m.dotsFilled ? 1 : 0.5 }} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Fond adaptatif de la bannière selon la météo : teinte colorée par-dessus la surface du thème (reste lisible en clair ET sombre).
const WX_BG = {
  sun: 'linear-gradient(150deg, rgba(56,150,255,.42), rgba(130,205,255,.14) 55%, var(--o-surfB))',
  partly: 'linear-gradient(150deg, rgba(86,150,210,.32), rgba(150,175,205,.12) 60%, var(--o-surfB))',
  clouds: 'linear-gradient(150deg, rgba(140,160,190,.24), var(--o-surfB))',
  wind: 'linear-gradient(150deg, rgba(150,170,195,.22), var(--o-surfB))',
  rain: 'linear-gradient(150deg, rgba(70,105,150,.40), rgba(90,120,160,.12) 60%, var(--o-surfB))',
  snow: 'linear-gradient(150deg, rgba(195,215,240,.36), var(--o-surfB))',
  storm: 'linear-gradient(150deg, rgba(118,98,185,.38), rgba(70,60,110,.14) 60%, var(--o-surfB))',
  night: 'linear-gradient(150deg, rgba(44,66,130,.42), rgba(20,30,60,.15) 60%, var(--o-surfB))',
};
/* Mini-scene animee de la vignette meteo (accueil) : la condition se VOIT —
 * pluie qui tombe, etoiles, halo de soleil, eclair — dans la vignette meme,
 * derriere le chiffre. Une poignee de spans en transform/opacity, rien
 * d'autre ; l'interrupteur « Effets meteo animes » et prefers-reduced-motion
 * la coupent net. Idee reprise du Weather Showcase de GlassHome. */
function WxMini({ wx, on }) {
  if (!on || REDUCE_MOTION) return null;
  const S = { position: 'absolute', pointerEvents: 'none' };
  const gouttes = (n, couleur, epais) => Array.from({ length: n }, (_, i) => (
    <span key={i} style={{ ...S, top: -6, left: (8 + i * 23) % 140, width: epais, height: 9, borderRadius: 2, background: couleur, animation: `o-wxm-fall ${1.1 + (i % 3) * .35}s linear ${i * .28}s infinite` }} />
  ));
  let scene = null;
  if (wx === 'rain') scene = gouttes(6, 'rgba(160,200,255,.75)', 1.5);
  else if (wx === 'storm') scene = (<>
    {gouttes(4, 'rgba(180,170,255,.7)', 1.5)}
    <span style={{ ...S, inset: 0, background: 'radial-gradient(80% 90% at 60% 0%, rgba(210,200,255,.9), rgba(210,200,255,0) 70%)', animation: 'o-wxm-flash 5.2s linear infinite' }} />
  </>);
  else if (wx === 'snow') scene = Array.from({ length: 6 }, (_, i) => (
    <span key={i} style={{ ...S, top: -6, left: (12 + i * 22) % 140, width: 3.5, height: 3.5, borderRadius: '50%', background: 'rgba(240,248,255,.9)', animation: `o-wxm-snow ${2.6 + (i % 3) * .7}s linear ${i * .5}s infinite` }} />
  ));
  else if (wx === 'sun') scene = <span style={{ ...S, top: -14, left: -10, width: 66, height: 66, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,205,100,.55), rgba(255,205,100,0) 68%)', animation: 'o-wxm-glow 3.6s ease-in-out infinite' }} />;
  else if (wx === 'night') scene = Array.from({ length: 5 }, (_, i) => (
    <span key={i} style={{ ...S, top: 5 + (i * 13) % 34, left: (10 + i * 31) % 145, width: 2.5, height: 2.5, borderRadius: '50%', background: '#dfe9ff', boxShadow: '0 0 5px rgba(200,220,255,.9)', animation: `o-wxm-twinkle ${2 + (i % 3) * .8}s ease-in-out ${i * .55}s infinite` }} />
  ));
  else if (wx === 'wind') scene = Array.from({ length: 3 }, (_, i) => (
    <span key={i} style={{ ...S, top: 12 + i * 15, left: 0, width: 26, height: 1.5, borderRadius: 2, background: 'rgba(190,210,235,.6)', animation: `o-wxm-wind ${2.2 + i * .5}s linear ${i * .7}s infinite` }} />
  ));
  else if (wx === 'partly' || wx === 'clouds') scene = Array.from({ length: 2 }, (_, i) => (
    <span key={i} style={{ ...S, top: 8 + i * 22, left: -20, width: 34, height: 11, borderRadius: 8, background: `rgba(200,215,235,${.18 - i * .06})`, filter: 'blur(1.5px)', animation: `o-wxm-drift ${17 + i * 8}s linear ${-i * 9}s infinite` }} />
  ));
  if (!scene) return null;
  return <span aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 14 }}>{scene}</span>;
}

/* Mode ambiant : l'ecran de veille de la tablette murale. Apres un delai sans
 * toucher, le dashboard s'efface derriere l'essentiel — l'heure en grand, la
 * meteo animee, la temperature interieure, et seulement ce qui merite l'oeil
 * (lumieres allumees, alarme, alertes surete). Un toucher le retire, on
 * retrouve l'ecran ou on l'avait laisse : c'est le MEME dashboard qui se met
 * en veille, pas un second a entretenir. Toujours sombre, quel que soit le
 * theme : c'est une veille. Idee reprise des dashboards ambiants de Madelena. */
function AmbientOverlay({ wx, wxFx, weatherTemp, weatherLabel, inTemp, lightsOn, notifs, ast = null }) {
  // Tant que la veille recouvre l'écran, les fonds GPU (wx3d, ciel 3D) rendent
  // pour personne : la classe leur dit de souffler — batterie de la tablette.
  useEffect(() => {
    document.documentElement.classList.add('loggia-ambient-on');
    return () => document.documentElement.classList.remove('loggia-ambient-on');
  }, []);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const iv = setInterval(() => setClock(new Date()), 10000); return () => clearInterval(iv); }, []);
  /* Anti burn-in : le bloc entier derive de quelques pixels chaque minute — un
   * OLED garde la trace d'une horloge immobile. La derive est lente (6 s) pour
   * ne pas se voir ; en reduced-motion elle saute sans transition, le burn-in
   * ne negocie pas. */
  const [decal, setDecal] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const bouge = () => setDecal({ x: Math.round((Math.random() - 0.5) * 48), y: Math.round((Math.random() - 0.5) * 32) });
    const iv = setInterval(bouge, 60000);
    return () => clearInterval(iv);
  }, []);
  // La nuit, la veille baisse encore d'un ton : personne ne la regarde, et une
  // chambre n'a pas besoin d'une lanterne.
  const nuit = clock.getHours() >= 23 || clock.getHours() < 6;
  /* Économiseur d'écran : un diaporama des images des MÉDIAS LOCAUX de Home
   * Assistant (le dossier media) — jamais un service externe, le projet se
   * l'interdit. Sans image trouvée, la veille classique reste. */
  const photosOn = (() => { try { return localStorage.getItem('loggia-ambphotos') === '1'; } catch (e) { return false; } })();
  const [photos, setPhotos] = useState([]);
  const [photoIdx, setPhotoIdx] = useState(0);
  useEffect(() => {
    if (!photosOn) return;
    let mort = false;
    (async () => {
      try {
        const h = getHass(); if (!h || !h.callWS) return;
        const images = [];
        const parcourir = async (id, prof) => {
          if (mort || images.length >= 60 || prof > 2) return;
          // try PAR SOURCE : une intégration qui refuse le browse (Netatmo…)
          // ne doit pas emporter les images déjà trouvées ailleurs.
          let r = null;
          try { r = await h.callWS({ type: 'media_source/browse_media', ...(id ? { media_content_id: id } : {}) }); } catch (e) { return; }
          for (const c of (r && r.children) || []) {
            if (mort || images.length >= 60) return;
            if (c.media_class === 'image' && c.media_content_id) images.push(c.media_content_id);
            else if (c.can_expand) await parcourir(c.media_content_id, prof + 1);
          }
        };
        await parcourir(null, 0);
        if (mort || !images.length) return;
        const urls = [];
        for (const mid of images.slice(0, 40)) {
          if (mort) return;
          try { const rr = await h.callWS({ type: 'media_source/resolve_media', media_content_id: mid }); if (rr && rr.url) urls.push(rr.url); } catch (e) { /* image illisible */ }
        }
        // Mélange : ne pas revoir toujours les mêmes premières photos.
        for (let i = urls.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t2 = urls[i]; urls[i] = urls[j]; urls[j] = t2; }
        if (!mort && urls.length) setPhotos(urls);
      } catch (e) { /* pas de médias : la veille classique */ }
    })();
    return () => { mort = true; };
  }, [photosOn]);
  useEffect(() => {
    if (photos.length < 2) return;
    const iv = setInterval(() => setPhotoIdx(i => (i + 1) % photos.length), 30000);
    return () => clearInterval(iv);
  }, [photos.length]);
  /* Détection de mouvement : la caméra de la TABLETTE réveille l'écran quand
   * quelqu'un passe. Tout est local — les frames ne quittent jamais l'appareil,
   * rien n'est enregistré. getUserMedia exige un contexte sécurisé : en HTTP
   * local la fonction s'éteint d'elle-même, le toucher réveille toujours. */
  const motionOn = (() => { try { return localStorage.getItem('loggia-ambmotion') === '1'; } catch (e) { return false; } })();
  useEffect(() => {
    if (!motionOn) return;
    let flux = null, iv = 0, mort = false, avant = null;
    const video = document.createElement('video'); video.muted = true; video.playsInline = true;
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 24;
    const ctx2 = canvas.getContext('2d', { willReadFrequently: true });
    (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
        flux = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
        if (mort) { flux.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = flux; await video.play();
        iv = setInterval(() => {
          try {
            ctx2.drawImage(video, 0, 0, 32, 24);
            const d = ctx2.getImageData(0, 0, 32, 24).data;
            if (avant) {
              let diff = 0;
              for (let i = 0; i < d.length; i += 16) { if (Math.abs(d[i] - avant[i]) > 26) diff++; }
              // ~192 points échantillonnés : une vingtaine qui bougent = une présence, pas du bruit de capteur.
              if (diff > 18) { try { window.dispatchEvent(new PointerEvent('pointerdown')); } catch (e) { window.dispatchEvent(new Event('pointerdown')); } }
            }
            avant = new Uint8ClampedArray(d);
          } catch (e) { /* frame illisible */ }
        }, 900);
      } catch (e) { /* permission refusée : le toucher réveille */ }
    })();
    return () => { mort = true; clearInterval(iv); try { if (flux) flux.getTracks().forEach(t => t.stop()); } catch (e) {} try { video.srcObject = null; } catch (e) {} };
  }, [motionOn]);
  // Scène lancée depuis la veille : retour visuel bref, sans réveiller l'écran.
  const [scFlash, setScFlash] = useState(null);
  const scRef = useRef(0);
  useEffect(() => () => clearTimeout(scRef.current), []);
  const lancerScene = (s) => {
    setScFlash(s.haid); clearTimeout(scRef.current); scRef.current = setTimeout(() => setScFlash(null), 1600);
    try { const h = getHass(); if (h && h.callService) h.callService(s.haid.indexOf('scene.') === 0 ? 'scene' : 'script', 'turn_on', { entity_id: s.haid }); } catch (e) { /* le poll dira */ }
  };
  const hm = clock.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const capit = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const dateStr = capit(clock.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }));
  const rouges = (notifs || []).filter(n => n && n[0] === '#f87171').slice(0, 3);
  const chip = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 999, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)', fontSize: 14.5, fontWeight: 700, color: '#aeb9cc' };
  const pt = (c) => <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: c, boxShadow: '0 0 8px ' + c }} />;
  return (
    <div role="button" aria-label={tr('Toucher pour réveiller')} style={{ position: 'fixed', inset: 0, zIndex: 500, background: '#05070b', color: '#e8edf5', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', animation: REDUCE_MOTION ? 'none' : 'o-ambient-in 1s ease', userSelect: 'none' }}>
    {/* Diaporama : la photo courante en fondu, la suivante préchargée invisible,
        un voile pour que l'horloge reste lisible — plus opaque la nuit. */}
    {photos.length > 0 && (
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {photos.map((u, i) => (i === photoIdx || i === (photoIdx + 1) % photos.length)
          ? <img key={u} src={u} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: i === photoIdx ? 1 : 0, transition: REDUCE_MOTION ? 'none' : 'opacity 2.5s ease' }} />
          : null)}
        <div style={{ position: 'absolute', inset: 0, background: nuit ? 'rgba(5,7,11,.74)' : 'rgba(5,7,11,.48)' }} />
      </div>
    )}
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transform: `translate(${decal.x}px, ${decal.y}px)`, opacity: nuit ? .55 : 1, transition: REDUCE_MOTION ? 'opacity 2s ease' : 'transform 6s ease, opacity 2s ease' }}>
      <div style={{ fontSize: 'clamp(72px, 17vw, 170px)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{hm}</div>
      <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 'clamp(17px, 2.6vw, 24px)', color: '#8b95a7' }}>{dateStr}</div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 22px', borderRadius: 18, background: 'rgba(255,255,255,.035)', marginTop: 18, overflow: 'hidden' }}>
        <WxMini wx={wx} on={wxFx} />
        <WeatherIco wx={wx} size={46} />
        <div style={{ position: 'relative', lineHeight: 1.15 }}>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{weatherTemp != null ? Math.round(weatherTemp) : '—'}°</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#8b95a7' }}>{weatherLabel || ''}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 16, maxWidth: '84vw' }}>
        {inTemp != null && <span style={chip}>{pt('#54c8f0')}{inTemp.toFixed(1).replace('.', ',')} °C {tr('intérieur')}</span>}
        {lightsOn > 0 && <span style={{ ...chip, color: '#ffce73' }}>{pt('#ffce73')}{lightsOn > 1 ? tr('{n} allumées', { n: lightsOn }) : tr('{n} allumée', { n: lightsOn })}</span>}
        {ast != null && <span style={{ ...chip, color: ast === 'triggered' ? '#f87171' : ast === 'disarmed' ? '#34d399' : '#ffb347' }}>{pt(ast === 'triggered' ? '#f87171' : ast === 'disarmed' ? '#34d399' : '#ffb347')}{ast === 'triggered' ? tr('Alarme') : ast === 'disarmed' ? tr('Alarme désarmée') : 'Alarme armée'}</span>}
      </div>
      {rouges.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 14, alignItems: 'center' }}>
          {rouges.map((n, i) => <span key={i} style={{ ...chip, color: '#f87171', borderColor: 'rgba(248,113,113,.3)', background: 'rgba(248,113,113,.08)' }}>{pt('#f87171')}{n[1]} · {n[2]}</span>)}
        </div>
      )}
      {/* Scènes rapides SANS réveiller : le pointeur est stoppé avant d'atteindre
          la fenêtre (le réveil écoute là) — le geste du soir se fait depuis la
          veille, l'écran reste en veille. */}
      {quickScenes().length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '84vw' }}>
          {quickScenes().slice(0, 4).map(s => (
            <button key={s.haid}
              onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); lancerScene(s); }}
              style={{ ...chip, cursor: 'pointer', fontSize: 12.5, padding: '8px 14px', transition: 'background .3s, border-color .3s',
                background: scFlash === s.haid ? 'rgba(var(--o-accent-rgb),.28)' : 'rgba(255,255,255,.05)',
                border: '1px solid ' + (scFlash === s.haid ? 'rgba(var(--o-accent-rgb),.55)' : 'rgba(255,255,255,.09)') }}>
              <Fi i={s.icon} size={13} />{s.name}
            </button>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}

/**
 * Presentation des vues metier : en-tete, carte a lignes denses.
 *
 * Patron Atrium, exige par le user : un titre, une accroche, une pastille
 * d'etat, puis des lignes « libelle / contexte / valeur ». Jamais d'onglets
 * sur une vue metier.
 */
function ViewHead({ titre, sous, badge, rgb = '52,211,153' }) {
  return (
    <div className="o-obj-head" style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{titre}</h1>
        {sous && <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>{sous}</div>}
      </div>
      <span style={{ flex: 1 }} />
      {badge && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
          background: `rgba(${rgb},.14)`, color: `rgb(${rgb})` }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: `rgb(${rgb})` }} />{String(badge).toUpperCase()}
        </span>
      )}
    </div>
  );
}
/** Barre de reglages rapides, exactement celle de Securite. */
function ViewBar({ children, panel, onPanel }) {
  return (
    <div className="o-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,20px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
      {children}
      <span style={{ flex: 1 }} />
      {onPanel && (
        <button onClick={onPanel} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, border: panel ? 'var(--o-bw,1px) solid rgba(var(--o-accent-rgb),.44)' : 'var(--o-bw,1px) solid var(--o-bd1)', background: panel ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: panel ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}>
          <Fi i="sliders-v" size={13} /><span className="o-barlabel">{panel ? tr('Masquer les réglages') : tr('Réglages de la vue')}</span>
        </button>
      )}
    </div>
  );
}
/** Groupe etiquete de la barre : « Position  [− 65 % +] ». */
function BarGroup({ label, sous, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{label}</div>
        {sous && <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>{sous}</div>}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{children}</div>
    </div>
  );
}
const barBtn = (actif) => ({ padding: '5px 11px', borderRadius: 8, border: actif ? '1px solid rgba(var(--o-accent-rgb),.5)' : '1px solid var(--o-bd1)', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
  background: actif ? 'rgba(var(--o-accent-rgb),.18)' : 'transparent', color: actif ? 'var(--o-accent-soft)' : 'var(--o-text2)' });
/**
 * Jauge des cartes de confort : degrade fixe, curseur a la position lue. Une
 * barre de remplissage ne dit pas la meme chose — ici c'est un placement sur
 * une echelle, pas un pourcentage atteint.
 */
function JaugeGrad({ pct, grad }) {
  const x = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ position: 'relative', width: 190, height: 8, borderRadius: 6, background: grad, flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: '50%', left: x + '%', transform: 'translate(-50%,-50%)', width: 15, height: 15, borderRadius: '50%',
        background: '#fff', border: '2.5px solid rgba(10,14,22,.9)', boxShadow: '0 2px 7px rgba(0,0,0,.55)' }} />
    </div>
  );
}
/** Une ligne dense. `part` dessine une jauge, `barre` en impose une autre. */
function PresLigne({ titre, sous, valeur, couleur, part, barre }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', flexWrap: 'wrap', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
      <div style={{ flex: '1 1 190px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{titre}</div>
        {sous && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{sous}</div>}
      </div>
      {barre}
      {barre == null && part != null && (
        <div style={{ width: 128, height: 4, borderRadius: 3, background: 'var(--o-s2)', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ width: Math.max(0, Math.min(100, part)) + '%', height: '100%', background: couleur || 'var(--o-accent)' }} />
        </div>
      )}
      <div style={{ fontSize: 15, fontWeight: 800, color: couleur || 'var(--o-text1)', whiteSpace: 'nowrap' }}>{valeur}</div>
    </div>
  );
}
/** Carte de presentation. Rend `null` sans ligne : une carte vide n'apprend rien. */
function PresCard({ titre, lead, badge, rgb = '52,211,153', style, children }) {
  // Pas d'import React par defaut dans ce fichier : on aplatit a la main. Les
  // tableaux imbriques viennent des `.map()` des appelants.
  const lignes = (Array.isArray(children) ? children : [children]).flat(Infinity).filter(Boolean);
  if (!lignes.length) return null;
  return (
    <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '20px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, minWidth: 0 }}>{titre}</div>
        {badge && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '4px 11px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
            background: `rgba(${rgb},.14)`, color: `rgb(${rgb})` }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: `rgb(${rgb})` }} />{String(badge).toUpperCase()}
          </span>
        )}
      </div>
      {lead && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text3)', marginTop: 3, marginBottom: 5 }}>{lead}</div>}
      {lignes}
    </div>
  );
}


/**
 * Habillage d'une piece : icone, couleur, teinte de fond.
 *
 * Trois sources, dans l'ordre : l'icone que Home Assistant porte sur la ZONE,
 * puis la table des pieces connues, puis une reconnaissance par mots. Un nom
 * inconnu recoit un habillage neutre plutot que d'etre ignore.
 *
 * Cette fonction vit au niveau du module parce que DEUX vues en ont besoin —
 * les cartes de l'accueil et la barre de navigation entre pieces. Chacune
 * avait sa propre regle : la carte reconnaissait « Chambre Liam » par le mot
 * « chambre », la barre exigeait une egalite exacte et retombait sur une
 * maison. La meme piece portait donc deux icones selon l'endroit.
 */
const PARENTE = [
  // La chambre d'enfant passe avant la chambre, sans quoi elle ne serait
  // jamais atteinte. Meme vocabulaire que `LIGHT_ROOM`, qui range deja les
  // luminaires ainsi.
  [/enfant|kid|child|bebe|bébé|nursery/, 'Chambre enfant'],
  [/chambre|bedroom/, 'Chambre'],
  [/sejour|séjour|salon|living/, 'Séjour'],
  [/cuisine|kitchen/, 'Cuisine'],
  [/bureau|office|atelier/, 'Bureau'],
  [/sdb|bain|douche|bathroom|salle d ?'?eau/, 'Salle de bain'],
  [/exter|extér|jardin|terrasse|balcon|outdoor/, 'Extérieur'],
];

/** Le modele de piece le plus proche d'un nom, ou null. */
function modeleDePiece(nom) {
  const exact = PIECES.find(x => x.name === nom);
  if (exact) return exact;
  const parent = PARENTE.find(([re]) => re.test(String(nom).toLowerCase()));
  return (parent && PIECES.find(x => x.name === parent[1])) || null;
}

/**
 * La couleur d'une piece.
 *
 * Elle se lit sur l'icone du modele, PAS sur `tc` : pour le Sejour et
 * l'Exterieur les deux different — un arbre vert devenait bleu clair.
 */
function couleurDePiece(modele) {
  return (modele && modele.icon && modele.icon.props && modele.icon.props.color)
    || (modele && modele.tc) || 'var(--o-accent)';
}

function habillagePiece(nom, mdi) {
  const modele = modeleDePiece(nom);
  const glyphe = uiconDeMdi(mdi);
  if (glyphe) {
    return {
      ...(modele || { box: 44, rad: 13, status: { kind: 'repos' } }),
      name: nom,
      bg: (modele && modele.bg) || 'rgba(var(--o-accent-rgb),.16)',
      icon: <Ico name={glyphe} color={couleurDePiece(modele)} size={22} />,
    };
  }
  if (modele) return { ...modele, name: nom };
  return {
    name: nom, bg: 'rgba(var(--o-accent-rgb),.16)', box: 44, rad: 13,
    icon: <Ico name="home" color="var(--o-accent)" size={22} />,
    status: { kind: 'repos' },
  };
}

/* ── Agenda de l'accueil ──────────────────────────────────────────────────────
 * Les prochains evenements de TOUS les `calendar.*`, fusionnes. Zero
 * configuration : pas de calendrier chez vous, pas de carte. Les evenements ne
 * se poussent pas : l'API calendrier de HA est un GET — on relit au montage,
 * puis toutes les quinze minutes, et quand un calendrier apparait ou disparait. */
function useAgenda(hass, seulement = null) {
  const [events, setEvents] = useState([]);
  const S = hass && hass.states;
  const ids = useMemo(() => (seulement && seulement.length) ? seulement : (S ? Object.keys(S).filter(id => id.indexOf('calendar.') === 0) : []), [S, seulement ? seulement.join('|') : '']);
  const sig = ids.join('|');
  const api = hass && hass.callApi ? hass.callApi.bind(hass) : null;
  useEffect(() => {
    if (!api || !sig) { setEvents([]); return; }
    let mort = false;
    const lire = async () => {
      const debut = new Date(); debut.setSeconds(0, 0);
      const fin = new Date(debut.getTime() + 7 * 864e5);
      const q = '?start=' + encodeURIComponent(debut.toISOString()) + '&end=' + encodeURIComponent(fin.toISOString());
      const tous = [];
      for (const id of sig.split('|')) {
        try {
          const evs = await api('GET', 'calendars/' + id + q);
          if (Array.isArray(evs)) evs.forEach(e => { if (e && e.summary && e.start) tous.push({ ...e, _cal: id }); });
        } catch (e) {} // un calendrier qui refuse ne prive pas les autres
      }
      if (mort) return;
      const quand = (e) => new Date(e.start.dateTime || (e.start.date + 'T00:00:00')).getTime();
      tous.sort((x, y) => quand(x) - quand(y));
      setEvents(tous.slice(0, 8));
    };
    lire();
    const iv = setInterval(lire, 15 * 60000);
    return () => { mort = true; clearInterval(iv); };
  }, [api ? 1 : 0, sig]);
  return events;
}

/** Le jour d'un evenement, dit court : Aujourd'hui, Demain, sinon « mar. 2 ». */
function jourAgenda(e) {
  const d = new Date(e.start.dateTime || (e.start.date + 'T00:00:00'));
  const j0 = new Date(); j0.setHours(0, 0, 0, 0);
  const diff = Math.floor((d.getTime() - j0.getTime()) / 864e5);
  const jour = diff === 0 ? tr("Aujourd'hui") : diff === 1 ? tr('Demain')
    : d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric' });
  const heure = e.start.dateTime ? d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : tr('journée');
  return { jour, heure };
}

/* Sections personnalisables de l'accueil : identifiants stables (jamais les
 * libellés traduits) et libellés dits au rendu. */
const ACC_MAIN = ['scenes', 'pieces', 'cameras'];
const ACC_RAIL = ['etats', 'rappels', 'agenda'];
const ACC_NOMS = () => ({ scenes: tr('Scènes rapides'), pieces: tr('Pièces'), cameras: tr('Caméras'), etats: tr('En cours'), rappels: tr('Rappels'), agenda: tr('Agenda') });

function Dashboard({ editMode = false, onEnt, onToggleEdit, weatherMode = null, weatherRaw = null, wxFx = true, weatherTemp = null, weatherLabel = null, accueil = null, userName = 'Administrateur', onOpenRoom, onOpenMeteo }) {
  const [override, setOverride] = useState(null);
  const agenda = useAgenda(accueil && accueil.hass);
  /* ── L'accueil se compose : ordre et visibilité des sections ───────────────
   * En mode édition, chaque section se SAISIT et se glisse sur une autre de sa
   * colonne pour prendre sa place, et la croix la masque — elle réapparaît
   * grisée en édition, avec un bouton pour la rétablir. Ordre et masques dans
   * `loggia_accueil`, par appareil. Une section inconnue de la sauvegarde
   * (ajoutée par une version future) se range à la fin, jamais perdue. */
  const [accL, setAccL] = useState(() => {
    const v = readLS('loggia_accueil', null) || {};
    return { main: Array.isArray(v.main) ? v.main : null, rail: Array.isArray(v.rail) ? v.rail : null, caches: Array.isArray(v.caches) ? v.caches : [] };
  });
  const saveAccL = (n) => { setAccL(n); try { localStorage.setItem('loggia_accueil', JSON.stringify(n)); } catch (e) {} };
  const ordreDe = (zone) => {
    const base = zone === 'main' ? ACC_MAIN : ACC_RAIL;
    const sauve = (accL[zone] || []).filter(s => base.indexOf(s) >= 0);
    return [...sauve, ...base.filter(s => sauve.indexOf(s) < 0)];
  };
  const [secDrag, setSecDrag] = useState(null); // { zone, id, ordre }
  const debutSec = (e, zone, id) => {
    if (!editMode) return;
    if (e.target.closest && e.target.closest('button, [role="switch"], input')) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (er) {}
    setSecDrag({ zone, id, ordre: ordreDe(zone) });
  };
  const mouvSec = (e) => {
    if (!secDrag) return;
    const sous = document.elementFromPoint(e.clientX, e.clientY);
    const cible = sous && sous.closest ? sous.closest('[data-sec]') : null;
    if (!cible) return;
    const idCible = cible.getAttribute('data-sec');
    if (idCible === secDrag.id || cible.getAttribute('data-zone') !== secDrag.zone) return;
    const a = [...secDrag.ordre];
    const de = a.indexOf(secDrag.id), vers = a.indexOf(idCible);
    if (de < 0 || vers < 0) return;
    a.splice(de, 1); a.splice(vers, 0, secDrag.id);
    setSecDrag({ ...secDrag, ordre: a });
  };
  const finSec = () => {
    if (secDrag) saveAccL({ ...accL, [secDrag.zone]: secDrag.ordre });
    setSecDrag(null);
  };
  const cacheSec = (id) => saveAccL({ ...accL, caches: [...accL.caches, id] });
  const montreSec = (id) => saveAccL({ ...accL, caches: accL.caches.filter(x => x !== id) });
  /** Enveloppe d'une section : drag + masque en édition, rien sinon. */
  const Sec = (zone, id, contenu) => {
    const cache = accL.caches.indexOf(id) >= 0;
    if (cache && !editMode) return null;
    const saisie = secDrag && secDrag.id === id;
    return (
      <div key={id} data-sec={id} data-zone={zone}
        onPointerDown={editMode ? (e) => debutSec(e, zone, id) : undefined}
        onPointerMove={editMode ? mouvSec : undefined}
        onPointerUp={editMode ? finSec : undefined}
        onPointerCancel={editMode ? finSec : undefined}
        style={{ position: 'relative', minWidth: 0,
          opacity: saisie ? .55 : cache ? .4 : 1, transition: 'opacity .15s',
          ...(editMode ? { outline: saisie ? '2px solid var(--o-accent)' : '1px dashed rgba(var(--o-accent-rgb),.4)', outlineOffset: 4, borderRadius: 14, cursor: 'grab', touchAction: 'none' } : {}) }}>
        {cache
          ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderRadius: 14, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--o-text3)' }}>{ACC_NOMS()[id]} · {tr('masquée')}</span>
              <button onClick={() => montreSec(id)} style={{ padding: '6px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'rgba(var(--o-accent-rgb),.14)', color: 'var(--o-accent-soft)', fontWeight: 700, fontSize: 12 }}>{tr('Réafficher')}</button>
            </div>
          : <>
              <div style={{ pointerEvents: editMode ? 'none' : 'auto' }}>{contenu}</div>
              {editMode && <button onClick={() => cacheSec(id)} title={tr('Masquer')} style={{ position: 'absolute', top: -10, right: -10, width: 26, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-bad)', color: '#fff', boxShadow: '0 3px 10px rgba(0,0,0,.35)', fontSize: 12, fontWeight: 800, padding: 0 }}>×</button>}
            </>}
      </div>
    );
  };
  const [roomPop, setRoomPop] = useState(null);
  const wx = (editMode && override) ? override : (weatherMode || 'clouds'); // suit l'entité météo, sauf override en mode édition
  // Fond GLSL : état HA brut prioritaire ; les overrides du mode édition sont mappés vers un preset proche
  const WX3D_FROM_MODE = { sun: 'sunny', partly: 'partlycloudy', clouds: 'cloudy', wind: 'windy', rain: 'rainy', snow: 'snowy', storm: 'lightning-rainy', night: 'clear-night' };
  const cond3d = (editMode && override) ? (WX3D_FROM_MODE[override] || 'partlycloudy')
    : (weatherRaw && WX_PRESETS[weatherRaw] ? weatherRaw : (WX3D_FROM_MODE[weatherMode] || 'partlycloudy'));
  const [wxHour, setWxHour] = useState(wxHourEq);
  useEffect(() => { const iv = setInterval(() => setWxHour(wxHourEq()), 60000); return () => clearInterval(iv); }, []);
  const modes = [['sun', '☀️', 'Soleil'], ['partly', '⛅', 'Éclaircies'], ['clouds', '☁️', 'Nuageux'], ['wind', '🌬️', tr('Vent')], ['rain', '🌧️', tr('Pluie')], ['snow', '❄️', 'Neige'], ['storm', '⛈️', 'Orage'], ['night', '🌙', 'Nuit']];
  const a = accueil; // données live (null → démo)
  // Les pièces affichées sont CELLES DE LA CONFIGURATION.
  //
  // La liste partait de `PIECES`, sept noms écrits dans le code : une pièce
  // nommée autrement — « Véranda », « Atelier » — n'apparaissait nulle part, et
  // l'accueil restait vide chez qui ne reprend pas ces noms-là. `PIECES` ne
  // fournit plus qu'un habillage : icône, couleur, teinte de fond. Un nom
  // inconnu reçoit un habillage neutre plutôt que d'être ignoré.
  // Reconnaissance par mots, quand le nom ne tombe pas juste. « Chambre Liam »,
  // « Ma cuisine », « Bathroom » doivent garder leur icône : n'exiger qu'une
  // égalité exacte rendait toute pièce nommée librement anonyme. Même
  // vocabulaire que `LIGHT_ROOM`, qui range déjà les luminaires ainsi — la
  // règle de la chambre d'enfant passe avant celle de la chambre, sans quoi
  // elle ne serait jamais atteinte.
  // Sans données live, on montre les pièces d'exemple : c'est l'écran d'avant
  // la première connexion, pas une installation vide.
  const noms = (a && a.rooms && a.rooms.length) ? a.rooms.map(r => r.name) : PIECES.map(p => p.name);
  const pieces = noms.map(nom => {
    const r = a && a.rooms && a.rooms.find(x => x.name === nom);
    const p = habillagePiece(nom, r && r.icon);
    if (!r) return (a && a.rooms && a.rooms.length) ? { ...p, live: { temp: null, hum: null, co2: null } } : p; // pièce sans capteurs → tirets ; pas de hass → démo
    const out = { ...p };
    out.temp = r.temp != null ? r.temp.toFixed(1) + '°' : '—';
    out.hum = r.hum != null ? Math.round(r.hum) + '%' : '—';
    if (r.co2 != null) { const s = co2Style(r.co2); out.badge = Math.round(r.co2) + ' ppm'; out.bc = s.bc; out.bbg = s.bbg; }
    else out.badge = null;
    out.live = r; // valeurs brutes + entity ids → popup confort
    return out;
  });
  const extPiece = pieces.find(p => p.status && p.status.kind === 'ext'); // Extérieur → ouvert via la chip météo
  const avatars = (a && a.people) ? a.people.map(p => ({ img: p.img, title: `${p.name} · ${p.home ? tr('Présent') : 'Absent'}`, dim: !p.home })) : [{ grad: 'linear-gradient(135deg,#f472b6,var(--o-purple))' }, { grad: 'linear-gradient(135deg,var(--o-accent),var(--o-ok))' }, { grad: 'linear-gradient(135deg,#ffb347,#f87171)' }];
  // HA absent → vitrine de demo ; HA present sans camera → aucune camera, pas d'exemple
  const cams = (a && (!a.cams || !a.cams.length)) ? [] : (a && a.cams && a.cams.length) ? a.cams.map((cam, i) => ({ label: cam.name, tag: 'LIVE · ' + (cam.name || '').toUpperCase(), grad: CAMERAS()[i % CAMERAS().length].grad, glow: CAMERAS()[i % CAMERAS().length].glow, sub: (<><span style={{ width: 7, height: 7, borderRadius: '50%', background: cam.online ? 'var(--o-ok)' : '#f87171' }} />{cam.online ? 'Direct' : 'Hors ligne'}</>), haid: cam.haid, online: cam.online, hass: a.hass })) : CAMERAS();
  const _dWallE = { label: tr('Aspirateur'), iconKey: 'vacuum', phase: tr('Sur base'), color: 'var(--o-ok)', active: false, valueIcon: 'battery', valueText: '100%', bar: 100, barColor: 'var(--o-ok)' };
  const _dLuba = { label: tr('Tondeuse'), iconKey: 'mower', phase: tr('Sur base'), color: 'var(--o-ok)', active: false, valueIcon: 'battery', valueText: '100%', bar: 100, barColor: 'var(--o-ok)' };
  const _dLv = { label: tr('Lave-vaisselle'), iconKey: 'dishwasher', phase: tr('Éteint'), color: '#94a3b8', active: false, valueIcon: 'timer', valueText: '--:--', bar: null };
  const _dPb = { label: tr('Poubelles'), iconKey: 'trash', phase: tr('Dans {j}j', { j: 2 }), color: '#fbbf24', active: false, valueText: 'Mer. 16 Juin', dotsFilled: 12, dotsTotal: 14 };
  const M = (a && a.machines) || {};
  const mWallE = M.wallE || (a ? null : _dWallE), mLuba = M.luba || (a ? null : _dLuba);
  const mLv = M.lv || (a ? null : _dLv), mPb = M.poubelles || (a ? null : _dPb);
  const metricDiv = { flexShrink: 0, width: 1, background: 'var(--o-bd2)', margin: '4px 4px' };
  // ── Layout PC (≥1180) : rail « En cours / Rappels » accolé à la zone Pièces+Caméras ──
  const wide = useWide(1180);
  const wideXL = useWide(1440); // tablette paysage (1180-1439) : rail plus étroit, cartes pièces prioritaires
  const dashHass = a && a.hass;
  // lumières par pièce (compteur + interrupteur des cartes compactes) — une seule passe par render.
  // On ignore les entités dont le NOM AFFICHÉ commence/contient « Ampoule » (membres individuels
  // des luminaires) : seul le nom compte, pas l'entity_id (ex. le lampadaire peut avoir un id
  // type light.ampoule_* mais un nom « Lampadaire » → il doit rester compté et piloté).
  // Signature etroite : on ne recalcule que si un luminaire a REELLEMENT change
  // d'etat, pas a chaque nouvelle reference de `hass`.
  const lightsSig = useMemo(() => {
    const S = (dashHass && dashHass.states) || null;
    if (!S) return '';
    let out = '';
    for (const id in S) {
      if (id.charCodeAt(0) === 108 && id.indexOf('light.') === 0) {
        const e = S[id];
        out += id + e.state + ((e.attributes && e.attributes.brightness) || '') + '|';
      }
    }
    return out;
  }, [dashHass]);
  const roomLightMap = useMemo(() => {
    if (!dashHass) return null;
    try {
      const m = {};
      // Aucune lumiere n'est ecartee sur son nom : ce filtre retirait celles
      // dont le nom contient « ampoule », soit plus de la moitie du parc.
      for (const l of discoverLights(dashHass, a && a.index)) {
        const k = rmNorm(l.room); (m[k] || (m[k] = [])).push(l);
      }
      return m;
    } catch (e) { return null; }
    // L'index doit figurer parmi les dependances : il arrive APRES le premier
    // rendu, et sans lui la piece d'une lumiere se deduit encore de son nom.
  }, [lightsSig, a && a.index]);
  const roomLightsOf = (name) => {
    if (!roomLightMap) return null;
    // La zone Home Assistant fait foi quand la piece en a une : c'est ainsi
    // qu'une piece nommee « Chambre Enfant » retrouve les lumieres de sa zone,
    // quel que soit le nom de celle-ci.
    const r = a && a.rooms && a.rooms.find(x => (x.name || x.room) === name);
    const zone = r && r.area && a.index && a.index.areaById && a.index.areaById.get(r.area);
    if (zone && zone.name) {
      const parZone = roomLightMap[rmNorm(zone.name)];
      if (parZone && parZone.length) return parZone;
    }
    return roomLightMap[rmNorm(name)] || [];
  };
  // L'INTERRUPTEUR de la carte ne pilote QUE le(s) plafonnier(s) de la pièce (règle user).
  // Le compteur « X lampes allumées », lui, compte tous les luminaires non-« Ampoule ».
  /**
   * Une entite designee a la main, mise a la forme d'une lumiere.
   *
   * L'applique du jardin est souvent un `switch` sans zone : la decouverte ne
   * la classe dans aucune piece, et elle ne serait donc jamais commandable
   * depuis une carte. Des lors que l'utilisateur l'a DESIGNEE, on la prend
   * telle quelle.
   */
  const entiteBrute = (id) => {
    const st = dashHass && dashHass.states && dashHass.states[id];
    if (!st) return null;
    const at = st.attributes || {};
    const on = st.state === 'on';
    return {
      id, domain: id.split('.')[0], name: at.friendly_name || id.split('.')[1].replace(/_/g, ' '),
      on, bri: on ? 100 : 0, dimmable: false, rgb: false, ct: false, color: null,
    };
  };

  /**
   * Les lumieres qu'un appui sur la carte allume ou eteint.
   *
   * Par defaut toutes celles de la piece — ce filtre ne retenait auparavant que
   * celles dont le nom contenait « plafonnier », une convention d'une seule
   * installation : ailleurs, aucune lumiere ne porte ce mot et le bouton
   * disparaissait de toutes les cartes.
   *
   * L'utilisateur peut en designer un sous-ensemble dans Parametres → Entites,
   * colonne « Lampes du bouton » : allumer la piece entiere n'est pas toujours
   * ce qu'on veut d'un appui rapide. Le COMPTAGE, lui, continue de porter sur
   * toutes les lumieres — « 4 lampes allumees » doit rester vrai.
   */
  const roomMainsOf = (name) => {
    const toutes = roomLightsOf(name);
    const r = a && a.rooms && a.rooms.find(x => (x.name || x.room) === name);
    const choisies = (r && r.lights) || [];
    // Les entites designees passent AVANT : une piece peut n'avoir aucune
    // lumiere decouverte et pourtant en commander une. C'est le cas de
    // l'exterieur, dont l'applique est un `switch` sans zone — le seul chemin
    // qui l'atteigne est celui que l'utilisateur a indique lui-meme.
    if (!choisies.length) return toutes;
    const parId = new Map((toutes || []).map(l => [l.id, l]));
    const retenues = choisies.map(id => parId.get(id) || entiteBrute(id)).filter(Boolean);
    // Un choix qui ne correspond a rien (entite renommee, retiree) ne doit pas
    // faire disparaitre le bouton : on retombe sur la piece entiere.
    return retenues.length ? retenues : toutes;
  };
  const toggleRoomLights = (name) => {
    const ms = roomMainsOf(name);
    if (!ms || !ms.length || !dashHass || !dashHass.callService) return;
    const svc = ms.some(l => l.on) ? 'turn_off' : 'turn_on';
    try { dashHass.callService('homeassistant', svc, { entity_id: ms.map(l => l.id) }); } catch (e) {}
  };

  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <Header />
      {!REDUCE_MOTION && wxFx && (
        <div className="o-wx3d" aria-hidden="true">
          <Suspense fallback={null}><WeatherGL condition={cond3d} hourEq={wxHour} /></Suspense>
          <div className="o-wx3d-veil" />
        </div>)}
      <div className="loggia-content" style={{ position: 'relative', zIndex: 1, padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 26 }}>
        {editMode && onEnt && <ViewEditBar texte="Mode édition : personnalise la bannière, et choisis les pièces, capteurs d’énergie, personnes et caméras." onEnt={onEnt} />}

        {/* BANNER */}
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--o-radius,22px)', padding: '22px 8px' }}>
          {REDUCE_MOTION && <WeatherFx weather={wx} />}
          {editMode && (
          <div style={{ position: 'absolute', bottom: 14, right: 18, display: 'flex', gap: 5, zIndex: 3 }}>
            {modes.map(([id, emoji, title]) => (
              <button key={id} onClick={() => setOverride(id)} title={title} style={{ width: 26, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1, background: wx === id ? 'var(--o-bd1)' : 'transparent', filter: wx === id ? 'none' : 'grayscale(.6) opacity(.6)', transition: 'all .2s' }}>{emoji}</button>
            ))}
          </div>
          )}
          <div className="o-banner-row" style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'nowrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Bon après-midi')}</span>
              <span className="o-greet-name" style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 34, fontWeight: 500, lineHeight: 1 }}>{userName}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', marginTop: 8 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--o-ok)', boxShadow: '0 0 8px var(--o-ok)', animation: 'pulse 2.4s infinite' }} />Maison · Calme · {a ? (a.inTemp != null ? a.inTemp.toFixed(1) + '°C' : '—') : <Skel w={44} h={12} />}</span>
            </div>
            <div className="o-banner-wx" style={{ display: 'flex', flexDirection: 'column-reverse', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
              {/* La vue Météo dit tout ce que cette vignette resume : elle est
                  la destination naturelle. La pièce « Extérieur » reste le
                  repli quand la vue est masquée ou absente. */}
              <div onClick={() => { if (onOpenMeteo) onOpenMeteo(); else if (extPiece) setRoomPop(extPiece.name); }} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (onOpenMeteo) onOpenMeteo(); else if (extPiece) setRoomPop(extPiece.name); } }} title={onOpenMeteo ? 'Ouvrir la vue Météo' : 'Voir la météo extérieure'} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderRadius: 14, background: WX_BG[wx] || WX_BG.clouds, border: 'none', transition: 'background .6s ease', cursor: 'pointer' }}>
                <WxMini wx={wx} on={wxFx} />
                <WeatherIco wx={wx} size={42} />
                <div style={{ position: 'relative', lineHeight: 1.1 }}><div style={{ fontSize: 20, fontWeight: 800 }}>{weatherTemp != null ? Math.round(weatherTemp) : 18}°<span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)' }}>C</span></div><div style={{ fontSize: 11, color: 'var(--o-text2)', fontWeight: 600 }}>{weatherLabel || 'Nuageux'}</div></div>
              </div>
              <div style={{ display: 'flex', gap: 9 }}>
                {avatars.map((u, i) => {
                  const present = !u.dim;
                  return (
                    <span key={i + (present ? '-p' : '-a')} className="o-avatarin" title={u.title} style={{ position: 'relative', width: 38, height: 38, flexShrink: 0, display: 'inline-block' }}>
                      <span style={{ display: 'block', width: '100%', height: '100%', borderRadius: '50%', background: u.img ? `url(${u.img}) center/cover` : u.grad, boxShadow: present ? '0 0 0 2.5px var(--o-ok), 0 0 9px rgba(52,211,153,.5)' : '0 0 0 2px var(--o-bd1)', opacity: present ? 1 : 0.45 }} />
                      <span style={{ position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: '50%', background: present ? 'var(--o-ok)' : 'var(--o-text3)', border: '2.5px solid var(--o-bg2)', boxShadow: present ? '0 0 6px rgba(52,211,153,.7)' : 'none' }} />
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ position: 'relative', display: 'flex', gap: 10, marginTop: 38, overflowX: 'auto', paddingBottom: 4 }}>
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9, padding: '6px 14px 6px 0', whiteSpace: 'nowrap' }}>
              <Ico name="bolt" color="var(--o-ok)" size={17} />
              <div><div style={{ fontSize: 16, fontWeight: 800, color: a && a.metricExport ? a.metricExport.color : 'var(--o-ok)', lineHeight: 1.1 }}>{a && a.metricExport ? <Num v={a.metricExport.raw} prefix={a.metricExport.sign} fmt={fmtWatts} /> : <Skel w={64} h={16} />}</div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.03em', color: 'var(--o-text2)' }}>{a && a.metricExport ? a.metricExport.label: tr('EXPORT RÉSEAU')}</div></div>
            </div>
            <div style={metricDiv} />
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9, padding: '6px 14px 6px 0', whiteSpace: 'nowrap' }}>
              <Ico name="wind" color="var(--o-accent)" size={17} />
              <div><div style={{ fontSize: 16, fontWeight: 800, color: 'var(--o-accent-soft)', lineHeight: 1.1 }}>{a ? (a.maxCo2 != null ? <Num v={a.maxCo2} /> : '—') : <Skel w={40} h={16} />}<span style={{ fontSize: 11, color: 'var(--o-text2)' }}> ppm</span></div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.03em', color: 'var(--o-text2)' }}>{tr('QUALITÉ AIR')} · {a && a.maxCo2 != null ? tr(airLabel(a.maxCo2)) : tr('BON')}</div></div>
            </div>
            <div style={metricDiv} />
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1, padding: '6px 14px 6px 0', whiteSpace: 'nowrap' }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{a ? (a.inTemp != null ? <><Num v={a.inTemp} d={1} />°</> : '—') : <Skel w={42} h={15} />}<span style={{ fontSize: 11, color: 'var(--o-text2)', fontWeight: 600 }}> · {a ? (a.inHum != null ? <><Num v={a.inHum} />%</> : '—') : <Skel w={26} h={11} />}</span></div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.03em', color: 'var(--o-text2)' }}>{tr('INTÉRIEUR · HUMIDITÉ')}</div>
            </div>
            <div style={metricDiv} />
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1, padding: '6px 14px 6px 0', whiteSpace: 'nowrap' }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{a ? <Num v={a.lightsOn} /> : <Skel w={18} h={15} />} <span style={{ fontSize: 11, color: 'var(--o-text2)', fontWeight: 600 }}>/ {a ? a.lightsTotal : <Skel w={14} h={11} />} {tr('prés.')}</span></div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.03em', color: 'var(--o-text2)' }}>{tr('LUMIÈRES ALLUMÉES')}</div>
            </div>
          </div>
        </div>

        {/* SECTIONS PERSONNALISABLES — scènes rapides, pièces, caméras, et le rail.
            PC ≥1180 : rail accolé à droite. Mobile/tablette : empilement. */}
        {(() => {
          const inner = pieces;
          const piecesHeader = (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={sectionTitle}>{tr('Pièces')}</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' }}>{tr('{n} pièces', { n: inner.length })}</span>
            </div>
          );
          const piecesGrid = (
            <div className="grid-pieces" style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(auto-fill,minmax(205px,1fr))' : 'repeat(3,1fr)', gap: wide ? 12 : 16 }}>
              {inner.map((p, i) => <PieceCard key={p.name} p={p} idx={i} compact lights={roomLightsOf(p.name)} mains={roomMainsOf(p.name)} onToggleLights={() => toggleRoomLights(p.name)} onOpen={() => onOpenRoom && onOpenRoom(p.name)} />)}
            </div>
          );
          const camsGrid = (
            <div className="grid-cams" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {cams.map(c => <CameraTile key={c.haid || c.id} c={c} />)}
            </div>
          );
          const repasCard = (sm) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: sm ? 9 : 11, ...stateCard, ...(sm ? { padding: '8px 10px' } : {}) }}>
              <div style={{ width: sm ? 30 : 36, height: sm ? 30 : 36, borderRadius: sm ? 9 : 11, background: 'rgba(255,179,71,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ico name="bowl-rice" color="#ffb347" size={sm ? 17 : 22} /></div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: sm ? 6 : 8, flexWrap: 'wrap' }}><span style={{ fontSize: sm ? 12.5 : 15, fontWeight: 700 }}>{sm ? tr('Repas chat') : 'Prochain repas (chat)'}</span><span style={{ fontSize: sm ? 9.5 : 11, fontWeight: 800, color: 'var(--o-warn2)', background: 'rgba(var(--o-warn2-rgb),.16)', padding: '1px 8px', borderRadius: 999 }}>{a && a.repasIn ? a.repasIn : 'DANS 1H38'}</span></div><div style={{ fontSize: sm ? 11 : 12, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2, whiteSpace: sm ? 'nowrap' : 'normal', overflow: sm ? 'hidden' : 'visible', textOverflow: 'ellipsis' }}>{a && a.repasLabel ? a.repasLabel : 'Collation après-midi · 18g'}</div></div>
              {!sm && <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--o-s1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--o-text2)', flexShrink: 0 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg></span>}
            </div>
          );
          const infoCard = (sm, iconBg, icon, title, sub, statusColor, statusText, pulse) => (
            <div style={{ ...stateCard, ...(sm ? { padding: '8px 10px' } : {}) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: sm ? 9 : 12, marginBottom: sm ? 7 : 12 }}><div style={{ width: sm ? 30 : 34, height: sm ? 30 : 34, borderRadius: sm ? 9 : 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon(sm ? 16 : 20)}</div><div style={{ minWidth: 0 }}><div style={{ fontSize: sm ? 12.5 : 14, fontWeight: 700 }}>{title}</div><div style={{ fontSize: sm ? 11 : 12, color: 'var(--o-text2)', fontWeight: 600 }}>{sub}</div></div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: sm ? 11 : 12, fontWeight: 700, color: statusColor }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, animation: pulse ? 'pulse 2s infinite' : 'none' }} />{statusText}</div>
            </div>
          );
          const voletsCard = (sm) => infoCard(sm, 'rgba(var(--o-accent-rgb),.16)', (s) => <Ico name="blinds" color="var(--o-accent)" size={s} />, tr('Mode volets'), tr('Auto lever/coucher'), 'var(--o-accent)', <>Fermeture à {a && a.sunsetHM ? a.sunsetHM : '21:42'}</>, false);
          const secuCard = (sm) => infoCard(sm, 'rgba(52,211,153,.16)', (s) => <Ico name="shield-check" color="var(--o-ok)" size={s} />, tr('Sécurité'), a ? a.camOnline + '/' + a.camTotal + ' caméras OK' : '3/3 caméras OK', 'var(--o-ok)', a && a.alarmArmed ? tr('Alarme armée') : 'Système opérationnel', true);
          const etatsCards = (sm) => <>{voletsCard(sm)}{mWallE && <MachineCard m={mWallE} small={sm} />}{mLuba && <MachineCard m={mLuba} small={sm} />}{mLv && <MachineCard m={mLv} small={sm} />}{secuCard(sm)}</>;
          const rappelsCards = (sm) => <>{repasCard(sm)}{mPb && <MachineCard m={mPb} small={sm} />}</>;
          // ── Rail en lignes denses : meme vocabulaire que les cartes de synthese des
          // autres vues (libelle + contexte a gauche, valeur alignee a droite, filet entre
          // les lignes). Une entite absente = pas de ligne, jamais une ligne vide.
          const hasEnt = (id) => !!(dashHass && dashHass.states && dashHass.states[id]);
          const railRow = (k, label, desc, val, col) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--o-text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</div>
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 800, flexShrink: 0, color: col || 'var(--o-text)' }}>{val}</span>
            </div>
          );
          const railPanel = (title, sub, tag, tagCol, rows) => rows.length ? (
            <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,16px)', padding: '13px 15px', boxShadow: 'var(--o-shadow)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{title}</span>
                {tag ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap', fontSize: 9.5, fontWeight: 800, background: `rgba(${tagCol},.14)`, color: `rgb(${tagCol})` }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: `rgb(${tagCol})` }} />{tag}</span> : null}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--o-text2)', fontWeight: 600, margin: '2px 0 4px' }}>{sub}</div>
              {rows}
            </div>
          ) : null;
          const OKRGB = '52,211,153', AMBRGB = '251,191,36';
          const etatsRows = [];
          etatsRows.push(railRow('vol', tr('Mode volets'), tr('Auto lever/coucher'), (a && a.sunsetHM) ? a.sunsetHM : '21:42', 'var(--o-accent-soft)'));
          if (mWallE && (!a || hasEnt((loggiaEnt('vacuum', {}) || {}).etat))) etatsRows.push(railRow('we', mWallE.label, mWallE.phase, mWallE.valueText, mWallE.barColor || mWallE.color));
          if (mLuba && (!a || hasEnt(mowerId(a && a.states)))) etatsRows.push(railRow('lu', mLuba.label, mLuba.phase, mLuba.valueText, mLuba.barColor || mLuba.color));
          if (mLv && (!a || hasEnt(notifIds().dishwasher))) etatsRows.push(railRow('lv', mLv.label, mLv.phase, mLv.valueText, mLv.color));
          etatsRows.push(railRow('sec', tr('Sécurité'), (a ? a.camOnline + '/' + a.camTotal : '3/3') + ' ' + tr('caméras en ligne'), (a && a.alarmArmed) ? tr('Armée') : tr('Désarmée'), (a && a.alarmArmed) ? 'var(--o-warn2)' : 'var(--o-ok)'));
          const nActifs = [mWallE, mLuba, mLv].filter(m => m && m.active).length;
          const rappelsRows = [];
          if (!a || (a.repasIn && a.repasLabel)) rappelsRows.push(railRow('rep', tr('Repas chat'), a ? a.repasLabel : 'Collation après-midi · 18g', a ? a.repasIn.replace('DANS ', '').toLowerCase() : '1h38', 'var(--o-warn)'));
          if (mPb) rappelsRows.push(railRow('pb', tr('Poubelles'), mPb.valueText, mPb.phase, mPb.color));
          const railEtats = railPanel(tr('En cours'), tr('Volets, robots et sécurité'), nActifs ? nActifs + ' ' + (nActifs > 1 ? tr('ACTIFS') : tr('ACTIF')) : tr('TOUT AU REPOS'), nActifs ? '79,140,255' : OKRGB, etatsRows);
          const railRappels = railPanel(tr('Rappels'), tr('Repas du chat et ramassage'), null, AMBRGB, rappelsRows);
          // Agenda : les prochains evenements des calendriers HA. Pas de
          // calendrier, ou rien sous sept jours → pas de carte.
          const agendaRows = (agenda || []).slice(0, 5).map((e, i) => {
            const { jour, heure } = jourAgenda(e);
            return railRow('ag' + i, e.summary, jour, heure, 'var(--o-accent-soft)');
          });
          const railAgenda = railPanel(tr('Agenda'), tr('Les 7 prochains jours'), null, AMBRGB, agendaRows);
          const camsHeader = (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={sectionTitle}>{tr('Caméras')}</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' }}>{a ? tr('{n} en ligne', { n: a.camOnline }) : tr('{n} caméras', { n: cams.length })}</span>
            </div>
          );
          // ── Plantes (MiFlora) : humidité du sol = jauge + verdict arrosage ──
          const plantsList = (a && a.plants) || [{ name: 'Schefflera', img: 'schefflera', hum: 41, cond: 520, lux: 1200, temp: 22.4, bat: 88 }, { name: 'Dracaena Marginata', img: 'dracaena', hum: 12, cond: 310, lux: 800, temp: 21.9, bat: 64 }];
          const plantRow = (sm, pl) => {
            const st = pl.hum == null ? { t: '—', c: 'var(--o-text3)' } : pl.hum < 15 ? { t: 'À arroser', c: 'var(--o-warn2)' } : pl.hum > 60 ? { t: 'Très humide', c: 'var(--o-cold)' } : { t: 'OK', c: 'var(--o-ok)' };
            const fmt = (v, u) => v == null ? '—' : Math.round(v) + u;
            return (
              <div key={pl.name} style={{ ...stateCard, ...(sm ? { padding: '8px 10px' } : {}) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: sm ? 10 : 12 }}>
                  {pl.img && PLANT_ART[pl.img]
                    ? <div aria-hidden="true" style={{ width: sm ? 44 : 54, height: sm ? 44 : 54, borderRadius: sm ? 11 : 13, background: 'rgba(52,211,153,.08)', backgroundImage: `url("${PLANT_ART[pl.img]}")`, backgroundSize: '86%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center bottom', flexShrink: 0, border: 'var(--o-bw,1px) solid var(--o-bd3)' }} />
                    : <div style={{ width: sm ? 44 : 54, height: sm ? 44 : 54, borderRadius: sm ? 11 : 13, background: 'rgba(52,211,153,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ico name="leaf" color="var(--o-ok)" size={sm ? 18 : 22} /></div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: sm ? 12.5 : 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pl.name}</span>
                      <span style={{ padding: '1px 7px', borderRadius: 7, fontSize: 9.5, fontWeight: 700, background: hx(st.c, 0.16), color: st.c }}>{st.t}</span>
                      {pl.bat != null && pl.bat < 20 && <span style={{ padding: '1px 7px', borderRadius: 7, fontSize: 9.5, fontWeight: 700, background: 'rgba(var(--o-bad-rgb),.16)', color: 'var(--o-bad)' }}>Pile {Math.round(pl.bat)}%</span>}
                    </div>
                    <div style={{ fontSize: sm ? 10.5 : 11.5, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmt(pl.hum, '% sol')} · {fmt(pl.lux, ' lx')} · {fmt(pl.cond, ' µS')} · {pl.temp != null ? pl.temp.toFixed(1) + '°' : '—'}</div>
                    <div style={{ height: 4, borderRadius: 3, background: 'var(--o-bd1)', overflow: 'hidden', marginTop: 5 }}><div style={{ height: '100%', width: Math.max(0, Math.min(100, pl.hum || 0)) + '%', background: st.c, borderRadius: 3, transition: 'width 1s ease' }} /></div>
                  </div>
                </div>
              </div>
            );
          };
          const plantsCards = (sm) => <>{plantsList.map(pl => plantRow(sm, pl))}</>;
          // Sections nommées : l'ordre vient de `loggia_accueil`, le contenu d'ici.
          // Une section sans rien à montrer (pas de caméra, agenda vide) n'existe
          // pas du tout — ni wrapper, ni place dans l'édition.
          const secsMain = {
            scenes: <QuickScenes hass={dashHass} />,
            pieces: <>{piecesHeader}{piecesGrid}</>,
            cameras: cams.length > 0 ? <>{camsHeader}{camsGrid}</> : null,
          };
          const secsRail = { etats: railEtats, rappels: railRappels, agenda: railAgenda };
          const renduMain = ordreDe('main').map(id => secsMain[id] ? Sec('main', id, secsMain[id]) : null).filter(Boolean);
          const renduRail = ordreDe('rail').map(id => secsRail[id] ? Sec('rail', id, secsRail[id]) : null).filter(Boolean);
          if (!wide) return (
            <>
              {renduMain}
              {renduRail}
            </>
          );
          return (
            <div style={{ display: 'grid', gridTemplateColumns: wideXL ? '1fr 330px' : '1fr 276px', gap: wideXL ? 18 : 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
                {renduMain}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                {renduRail}
              </div>
            </div>
          );
        })()}

      </div>
      {roomPop && (() => {
        // roomPop = nom de pièce → on relit la pièce fraîche à chaque render (la modale suit les polls)
        const pop = pieces.find(x => x.name === roomPop);
        if (!pop) return null;
        return pop.status && pop.status.kind === 'ext'
          ? <OutdoorModal piece={pop} hass={a && a.hass} mode={weatherMode || 'clouds'} label={weatherLabel} weatherTemp={weatherTemp} sunset={a && a.sunsetHM} onClose={() => setRoomPop(null)} />
          : <RoomComfortModal piece={pop} hass={a && a.hass} onClose={() => setRoomPop(null)} />;
      })()}
    </main>
  );
}

/* ════════════ VUE LUMIÈRES (reproduction fidèle de "Loggia Lumières.dc.html") ════════════ */
const L_ROOMS = ['Séjour', 'Cuisine', 'Chambre', 'Chambre enfant', 'Bureau', 'Salle de bain', 'Extérieur'];
const L_PALETTE = ['#ffce73', '#ff6b6b', 'var(--o-accent)', 'var(--o-ok)', 'var(--o-purple)', 'var(--o-cyan)'];
// Formateur puissance UNIQUE (harmonisation 20/08) : virgule FR, kW à 2 décimales, « — » si valeur absente
const fmtWatts = (w) => w == null || isNaN(w) ? '—' : Math.abs(w) >= 1000 ? (w / 1000).toFixed(2).replace('.', ',') + ' kW' : Math.round(w) + ' W';
const hx = (hex, a) => { if (HX_TOKENS[hex]) return `rgba(var(${HX_TOKENS[hex]}),${a})`; if (typeof hex !== 'string' || hex[0] !== '#') return `rgba(140,152,180,${a})`; const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const INITIAL_LIGHTS = [
  { id: 1, room: 'Séjour', name: 'Plafonnier Séjour', on: false, bri: 0 },
  { id: 2, room: 'Séjour', name: 'Lampadaire', on: false, bri: 0 },
  { id: 3, room: 'Séjour', name: 'Ampoule Séjour 1', on: true, bri: 100 },
  { id: 4, room: 'Séjour', name: 'Ampoule Séjour 2', on: true, bri: 100 },
  { id: 5, room: 'Séjour', name: 'Ampoule Séjour 3', on: true, bri: 100 },
  { id: 6, room: 'Séjour', name: 'Salon RGB', on: true, bri: 100, rgb: true, color: '#ff6b6b' },
  { id: 7, room: 'Cuisine', name: 'Plafonnier Cuisine', on: false, bri: 0 },
  { id: 8, room: 'Chambre', name: 'Chevet Gauche', on: false, bri: 0 },
  { id: 9, room: 'Chambre', name: 'Chevet Droit', on: false, bri: 0 },
  { id: 10, room: 'Bureau', name: 'Lampe Bureau', on: true, bri: 60 },
  { id: 11, room: 'Salle de bain', name: 'Miroir LED', on: false, bri: 0 },
  { id: 12, room: 'Extérieur', name: 'Façade Jardin', on: false, bri: 0 },
];

// ── Acces des fonctions pures a la decouverte et a la configuration ──
// App les alimente a chaque rendu ; avant la premiere reponse elles valent
// null / {} et tout retombe sur les replis historiques.


// Fournie par App : envoie un lot de reglages au serveur et rafraichit l'etat.




// Piece d'un luminaire. La zone Home Assistant fait foi ; le decoupage par nom
// ne sert que pour les installations qui n'ont pas range leurs entites.
const LIGHT_ROOM = (id) => {
  const area = LOGGIA_INDEX && LOGGIA_INDEX.areaNameOf ? LOGGIA_INDEX.areaNameOf(id) : null;
  if (area) return area;
  const s = id.toLowerCase();
  if (/enfant|kid|child/.test(s)) return 'Chambre enfant';
  if (/chambre/.test(s)) return 'Chambre';
  if (/sejour|salon|lampadaire|_s\d/.test(s)) return 'Séjour';
  if (/cuisine/.test(s)) return 'Cuisine';
  if (/bureau/.test(s)) return 'Bureau';
  if (/sdb|salle_de_bain|_bain/.test(s)) return 'Salle de bain';
  if (/exter|jardin|facade|terrasse|balcon/.test(s)) return 'Extérieur';
  return 'Autres';
};
const switchLights = () => { const c = loggiaEnt('switchLights', null); return (Array.isArray(c) && c.length) ? c : switchLightsCfg(); };
// Découvre les vraies lumières HA (light.*), groupées par pièce. Exclut LED réseau/caméra (UniFi…). Ajoute les interrupteurs choisis (on/off).
function discoverLights(hass, index) {
  const S = hass.states;
  // La PIECE d'une lumiere est celle que Home Assistant lui donne. Le nom ne
  // sert que de repli, pour les entites qui n'ont pas encore ete rangees dans
  // une zone : deduire la piece des mots de l'identifiant obligeait a nommer
  // ses lumieres selon une convention qui n'existe que sur une installation.
  const pieceDe = (id) => {
    const zone = index && index.areaNameOf ? index.areaNameOf(id) : null;
    return zone || LIGHT_ROOM(id);
  };
  const lights = Object.keys(S).filter(e => e.indexOf('light.') === 0 && !/^light\.(u6|g6|unifi|udm|usw|uap)/.test(e)).map(id => {
    const st = S[id], at = st.attributes || {};
    const on = st.state === 'on';
    const modes = at.supported_color_modes || [];
    const dimmable = modes.some(m => m !== 'onoff');
    const rgbCap = modes.some(m => ['rgb', 'rgbw', 'rgbww', 'hs', 'xy'].indexOf(m) >= 0);
    const ct = modes.indexOf('color_temp') >= 0;
    const bri = (on && at.brightness != null) ? Math.max(1, Math.round(at.brightness / 255 * 100)) : (on ? 100 : 0);
    const rgb = at.rgb_color || null;
    const color = rgb ? ('#' + rgb.map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('')) : null;
    return { id, domain: 'light', name: at.friendly_name || id.replace('light.', '').replace(/_/g, ' '), room: pieceDe(id), on, bri, dimmable, rgb: rgbCap, ct, color, lc: st.last_changed };
  });
  const switches = switchLights().filter(id => S[id]).map(id => {
    const st = S[id], at = st.attributes || {}, on = st.state === 'on';
    return { id, domain: 'switch', name: at.friendly_name || id.replace('switch.', '').replace(/_/g, ' '), room: pieceDe(id), on, bri: on ? 100 : 0, dimmable: false, rgb: false, ct: false, color: null, lc: st.last_changed };
  });
  return [...lights, ...switches];
}
// Pièces mises en avant quand elles existent ; toutes les autres zones trouvées
// viennent ensuite, par ordre alphabétique, « Autres » fermant la marche.
const LIGHT_ROOM_ORDER = ['Séjour', 'Cuisine', 'Chambre', 'Chambre enfant', 'Bureau', 'Salle de bain', 'Extérieur', 'Autres'];
function lightRooms(lights) {
  const present = [];
  lights.forEach(l => { if (l.room && present.indexOf(l.room) < 0) present.push(l.room); });
  // Comparaison insensible à la casse : « Salle de Bain » côté Home Assistant
  // doit retrouver sa place dans l'ordre voulu, pas passer pour une inconnue.
  const last = LIGHT_ROOM_ORDER.length - 1; // « Autres »
  const rank = (r) => LIGHT_ROOM_ORDER.findIndex(k => k.toLowerCase() === String(r).toLowerCase());
  const known = present.filter(r => rank(r) >= 0 && rank(r) < last).sort((a, b) => rank(a) - rank(b));
  const rest = present.filter(r => rank(r) < 0).sort((a, b) => a.localeCompare(b, 'fr'));
  const autres = present.filter(r => rank(r) === last);
  return [...known, ...rest, ...autres];
}
// Type de luminaire d'après le nom/id → icône différenciée.
function lightType(l) {
  const s = ((l.name || '') + ' ' + (l.id || '')).toLowerCase();
  if (/veilleuse|night/.test(s)) return 'veilleuse';
  if (/lampadaire|floor|pied|standing/.test(s)) return 'lampadaire';
  if (/plafonnier|plafond|ceiling|interrupteur|spot|downlight|dome/.test(s)) return 'plafonnier';
  return 'ampoule';
}
// Clés CUSTOM_SVG si fournies (l-plafonnier…), sinon nom Flaticon valide en fallback.
const LIGHT_TYPE_ICON = { plafonnier: 'light-switch-on', ampoule: 'bulb', lampadaire: 'bulb', veilleuse: 'moon' };
// Icônes du design "Light Cards Styles" (ampoule + lune veilleuse).
const BulbIcon = ({ on, color = '#FFCC44', size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M9 21h6M12 3a6 6 0 0 1 4 10.47V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-3.53A6 6 0 0 1 12 3z" fill={color} stroke={color} strokeWidth="0.5" />
    <ellipse cx="12" cy="9" rx="2.5" ry="2" fill={on ? '#FFF4B0' : 'transparent'} opacity="0.7" />
  </svg>
);
const MoonIcon = ({ color = '#FFCC44', size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill={color} stroke={color} strokeWidth="0.5" />
  </svg>
);
// Icônes par type de luminaire (style UICon rempli, repeint via currentColor).
const LIGHT_ICONS = {
  ampoule: ['M12 2.5a6.5 6.5 0 0 0-4 11.6c.5.4.9 1 1 1.6.1.5.5.8 1 .8h2c.5 0 .9-.3 1-.8.1-.6.5-1.2 1-1.6A6.5 6.5 0 0 0 12 2.5z', 'M9.5 18.3h5a.8.8 0 0 1 0 1.6h-5a.8.8 0 0 1 0-1.6z', 'M10.3 21h3.4a.75.75 0 0 1 0 1.5h-3.4a.75.75 0 0 1 0-1.5z'],
  plafonnier: ['M8 2.6h8a1 1 0 0 1 0 2H8a1 1 0 0 1 0-2z', 'M11.2 4.6h1.6v2.4h-1.6z', 'M5 13.5c0-3.9 3.1-6.7 7-6.7s7 2.8 7 6.7c0 .4-.3.7-.7.7H5.7c-.4 0-.7-.3-.7-.7z', 'M10 15.2h4c0 1.1-.9 2-2 2s-2-.9-2-2z'],
  lampadaire: ['M9 3h6c.7 0 1.2.6 1 1.3l-1.2 4c-.13.42-.5.7-.95.7H10.15c-.45 0-.82-.28-.95-.7l-1.2-4C7.8 3.6 8.3 3 9 3z', 'M11.4 9.5h1.2l-.25 9h-.7z', 'M8.5 18.3h7a1 1 0 0 1 0 2h-7a1 1 0 0 1 0-2z'],
  veilleuse: ['M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z'],
};
const LightIcon = ({ type, color = 'currentColor', size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    {(LIGHT_ICONS[type] || LIGHT_ICONS.ampoule).map((d, i) => <path key={i} d={d} />)}
  </svg>
);
const LIGHT_COLORS = [
  { name: 'Chaud', hex: '#FFB347' }, { name: 'Blanc', hex: '#F0F0FF' }, { name: 'Rouge', hex: '#FF4466' },
  { name: 'Vert', hex: '#44DD88' }, { name: 'Bleu', hex: '#4488FF' }, { name: 'Violet', hex: '#AA44FF' }, { name: 'Rose', hex: '#FF44CC' },
];
// Palette popup (design "Light Cards Styles" — 8 teintes, blanc inclus).
const LIGHT_PALETTE = ['#ffce73', '#ff8a4c', '#f472b6', 'var(--o-purple)', 'var(--o-accent)', 'var(--o-cyan)', 'var(--o-ok)', '#ffffff'];
/* Une FONCTION, pas une table.
 *
 * Evaluee a l'import, cette liste figeait ses libelles dans la langue du
 * demarrage. C'est ce qui obligeait a recharger la page apres un changement de
 * langue. Appelee au rendu, elle se dit dans la langue du moment. */
const WHITE_TEMPS = () => [['Bougie', 2200, '#ffb46b'], ['Chaud', 2700, '#ffd9a0'], ['Neutre', 4000, '#fff1dd'], [tr('Froid'), 6500, '#eaf2ff']];
const relTime = (iso) => { if (!iso) return ''; const d = (Date.now() - new Date(iso).getTime()) / 1000; if (d < 60) return "À l'instant"; if (d < 3600) return 'Il y a ' + Math.floor(d / 60) + ' min'; if (d < 86400) return 'Il y a ' + Math.floor(d / 3600) + ' h'; return 'Il y a ' + Math.floor(d / 86400) + ' j'; };

function LumieresContent({ hass, edit = false, onEnt }) {
  // `null` = aucune piece choisie, donc toutes. Un libelle traduit ne peut pas
  // tenir ce role : il change avec la langue.
  const [filter, setFilter] = useState(null);
  const [lights, setLights] = useState(() => hass ? discoverLights(hass) : INITIAL_LIGHTS);
  // useMemo : le scan de hass.states ne doit PAS tourner à chaque render local (drags à 60-120 Hz) — seulement quand hass change (tick 2s).
  const sig = useMemo(() => hass ? Object.keys(hass.states).filter(e => e.indexOf('light.') === 0).map(e => { const s = hass.states[e]; return e + s.state + ((s.attributes && s.attributes.brightness) || '') + ((s.attributes && s.attributes.rgb_color) || ''); }).join('|') + '|' + switchLights().map(id => { const s = hass.states[id]; return id + (s ? s.state : '-'); }).join(',') : '', [hass]);
  // Fenêtre optimiste : les ids « en attente » gardent leur état local ~3s, le temps que HA confirme
  // (sinon le premier poll partiel pendant un « Tout allumer » re-bascule les lumières pas encore confirmées).
  const pendingRef = useRef({});
  const markPending = (ids, on) => { const until = Date.now() + 3000; ids.forEach(id => { pendingRef.current[id] = { on, until }; }); };
  useEffect(() => {
    if (!hass) return;
    if (dragRef.current) return; // pas de resync pendant un drag (le doigt fait foi)
    const now = Date.now(); const pend = pendingRef.current;
    setLights(discoverLights(hass).map(l => {
      const p = pend[l.id]; if (!p) return l;
      if (l.on === p.on || p.until < now) { delete pend[l.id]; return l; }
      return { ...l, on: p.on, bri: p.on ? (l.bri || 100) : l.bri };
    }));
  }, [sig]);
  const call = (svc, data) => { try { if (hass && hass.callService) hass.callService('light', svc, data); } catch (e) {} };
  const setBri = (id, v) => setLights(ls => ls.map(l => l.id === id ? { ...l, bri: v, on: true } : l));
  // homeassistant.turn_on/off gère light ET switch (interrupteurs traités comme lumières).
  const callHa = (svc, data) => { try { if (hass && hass.callService) hass.callService('homeassistant', svc, data); } catch (e) {} };
  const toggle = (l) => { markPending([l.id], !l.on); setLights(ls => ls.map(x => x.id === l.id ? { ...x, on: !x.on, bri: !x.on ? (x.bri || 100) : x.bri } : x)); callHa(l.on ? 'turn_off' : 'turn_on', { entity_id: l.id }); };
  const setAll = (on) => { const ids = lights.map(x => x.id); markPending(ids, on); setLights(ls => ls.map(x => ({ ...x, on, bri: on ? (x.bri || 100) : x.bri }))); if (ids.length) callHa(on ? 'turn_on' : 'turn_off', { entity_id: ids }); };
  const pick = (id, c) => { setLights(ls => ls.map(l => l.id === id ? { ...l, color: c, on: true } : l)); const n = parseInt(c.slice(1), 16); commander(hass, id, 'set_color', [(n >> 16) & 255, (n >> 8) & 255, n & 255]); };
  const [popupId, setPopupId] = useState(null);
  const [popMode, setPopMode] = useState('color');
  const [popClosing, setPopClosing] = useState(false);
  // La fermeture attend la fin de l'anim (o-sheetOut) avant le démontage ; timeout filet si l'anim ne fire pas.
  const closePop = () => { setPopClosing(true); setTimeout(() => { setPopupId(null); setPopClosing(false); }, 420); };
  // Slider vertical (design popup) : haut = 100%, bas = 1%.
  // Pointer capture sur l'élément + peinture DOM directe pendant le drag (zéro re-render par frame),
  // commit HA + setState UNIQUEMENT au relâcher — même mécanique que la réf. iOS. pointercancel = abandon.
  const dragRef = useRef(false);
  const dragVert = (id, e) => {
    e.preventDefault();
    const el = e.currentTarget;
    const fill = el.querySelector('[data-fill]');
    const handle = el.querySelector('[data-handle]');
    const big = document.getElementById('o-bri-big');
    const r = el.getBoundingClientRect();
    const calc = y => Math.max(1, Math.min(100, Math.round((1 - (y - r.top) / r.height) * 100)));
    let v = calc(e.clientY);
    dragRef.current = true;
    if (fill) fill.style.transition = 'none';
    if (handle) handle.style.transition = 'none';
    const paint = () => {
      if (fill) { fill.style.height = v + '%'; fill.style.opacity = '1'; }
      if (handle) { handle.style.bottom = `calc(${v}% - 26px)`; handle.style.opacity = '1'; }
      if (big) big.textContent = String(v);
    };
    paint();
    try { el.setPointerCapture(e.pointerId); } catch (er) {}
    el.onpointermove = ev => { v = calc(ev.clientY); paint(); };
    const end = () => { el.classList.remove('o-sliding'); el.onpointermove = null; el.onpointerup = null; el.onpointercancel = null; if (fill) fill.style.transition = ''; if (handle) handle.style.transition = ''; dragRef.current = false; };
    el.onpointerup = () => { end(); setBri(id, v); commander(hass, id, 'set_brightness', v); };
    el.onpointercancel = () => { end(); setLights(ls => ls.map(x => ({ ...x }))); }; // abandon → re-render resynchronise le visuel
  };
  const openPop = (l) => { setPopupId(l.id); setPopMode(l.rgb ? 'color' : 'white'); };
  const setWhite = (id, k) => { setLights(ls => ls.map(l => l.id === id ? { ...l, color: null, on: true } : l)); commander(hass, id, 'set_color_temp', k); };
  const onCount = lights.filter(l => l.on).length;
  const knob = (on) => ({ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,.35)', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)' });
  const presentRooms = lightRooms(lights);
  // Agencement : la decouverte propose un intertitre par piece, suivi de ses
  // luminaires. Tout se renomme, se deplace, se retire ensuite.
  const derived = useMemo(() => {
    const out = [];
    presentRooms.forEach(r => {
      const ls = lights.filter(l => l.room === r);
      if (!ls.length) return;
      out.push('sect:' + r);
      ls.forEach(l => out.push(l.id));
    });
    return out;
  }, [sig, presentRooms.join('|')]);
  const ed = useLayoutEditor('loggia_lightlayout', 'lumieres', derived);
  const dc = useDomainCards(hass);
  const [cardEdit, setCardEdit] = useState(null);
  const [addSheet, setAddSheet] = useState(false);
  const [panel, setPanel] = useState(() => { try { return localStorage.getItem('loggia-lumpanel') !== '0'; } catch (e) { return true; } });
  const togglePanel = () => setPanel(v => { const nv = !v; try { localStorage.setItem('loggia-lumpanel', nv ? '1' : '0'); } catch (e) {} return nv; });
  const origineDe = (k) => {
    if (k.indexOf('sect:') === 0) return k.slice(5) || tr('Section');
    const st = hass && hass.states && hass.states[k];
    return (st && st.attributes && st.attributes.friendly_name) || k;
  };
  const nomDe = (k) => ed.labelOf(k) || origineDe(k);
  const addSection = () => ed.toggle('sect:' + Date.now().toString(36));
  // Piece d'origine, pour le filtre. Une carte ajoutee a la main n'en a pas :
  // elle reste visible, on ne cache pas ce que l'utilisateur a voulu.
  const pieceDe = (id) => (lights.find(l => l.id === id) || {}).room || null;
  const visible = (k) => edit || filter == null || pieceDe(k) == null || pieceDe(k) === filter;
  const blocs = [];
  ed.ids.forEach(k => {
    if (k.indexOf('sect:') === 0) blocs.push({ titre: k, cartes: [] });
    else {
      if (!blocs.length) blocs.push({ titre: null, cartes: [] });
      blocs[blocs.length - 1].cartes.push(k);
    }
  });

  return (
    <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <ViewHead titre={tr('Lumières')}
        sous={tr('{n} sur {t} allumées', { n: onCount, t: lights.length }) + ' · ' + (presentRooms.length > 1 ? tr('{n} pièces', { n: presentRooms.length }) : tr('{n} pièce', { n: presentRooms.length }))
          + (lights.filter(l => l.rgb).length ? ' · ' + lights.filter(l => l.rgb).length + ' luminaires RGB' : '')}
        badge={onCount ? (onCount > 1 ? tr('{n} allumées', { n: onCount }) : tr('{n} allumée', { n: onCount })) : tr('tout éteint')}
        rgb={onCount ? '255,206,115' : '140,152,180'} />

      <ViewBar panel={panel} onPanel={togglePanel}>
        <BarGroup label={tr('Lumières')} sous={lights.length + ' luminaires'}>
          <button onClick={() => setAll(false)} style={barBtn(false)}>{tr('Tout éteindre')}</button>
          <button onClick={() => setAll(true)} style={barBtn(false)}>{tr('Tout allumer')}</button>
        </BarGroup>
        {presentRooms.length > 1 && (
          <BarGroup label={tr('Pièce')}>
            {[null, ...presentRooms].map(n => (
              <button key={n == null ? '*' : n} onClick={() => setFilter(n)} style={barBtn(n === filter)}>{n == null ? tr('Toutes') : n}</button>
            ))}
          </BarGroup>
        )}
      </ViewBar>


      {panel && <PresCard titre={tr('Contrôle général')} lead="Les réglages s’appliquent à toutes les lumières allumées"
        badge={onCount ? (onCount > 1 ? tr('{n} allumées', { n: onCount }) : tr('{n} allumée', { n: onCount })) : tr('tout éteint')}
        rgb={onCount ? '255,206,115' : '140,152,180'}>
        <PresLigne titre={tr('Luminaires allumés')}
          sous={(() => {
            const p = presentRooms.filter(r => lights.some(l => l.room === r && l.on));
            return p.length ? p.slice(0, 3).join(', ') : 'Aucune pièce éclairée';
          })()}
          valeur={onCount + ' / ' + lights.length} couleur={onCount ? 'var(--o-warn)' : 'var(--o-text3)'}
          part={lights.length ? Math.round(onCount * 100 / lights.length) : 0} />
        {onCount > 0 && (
          <PresLigne titre={tr('Luminosité moyenne')} sous={tr('Sur les luminaires allumés')}
            valeur={Math.round(lights.filter(l => l.on).reduce((a, l) => a + (l.bri || 0), 0) / onCount) + ' %'}
            couleur="var(--o-accent-soft)" />
        )}
      </PresCard>}

      {edit && (
        <ViewEditBar onEnt={onEnt}
          texte={'Mode édition : clique une lumière pour la modifier, glisse-la pour la déplacer.'
            + (ed.edits ? ' Cette vue est personnalisée.' : ' Cette vue suit la détection automatique.')}>
          <button onClick={() => setAddSheet(true)} style={editBtn(true)}>{tr('Ajouter une lumière')}</button>
          <button onClick={addSection} style={editBtn(false)}>{tr('Ajouter un titre')}</button>
          {ed.edits > 0 && <button onClick={ed.reset} style={editBtn(false)}>{tr("Rétablir l'automatique")}</button>}
        </ViewEditBar>
      )}

      <div ref={ed.gridRef} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {blocs.map((bloc, bi) => {
          const cartes = bloc.cartes.filter(visible);
          // Hors édition, une section vide ne s'affiche pas : un titre seul
          // n'apprend rien, et le filtre en laisse souvent derrière lui.
          if (!edit && !cartes.length) return null;
          const allumees = cartes.filter(k => { const l = lights.find(x => x.id === k); return l && l.on; }).length;
          return (
            <div key={bloc.titre || 'b' + bi} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {bloc.titre && (edit
                ? <EditableCard plat ed={ed} id={bloc.titre} nom={nomDe(bloc.titre)} onEdit={setCardEdit}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 12px' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'var(--o-text3)' }}>{String(nomDe(bloc.titre)).toUpperCase()}</span>
                      <span style={{ height: 1, flex: 1, background: 'var(--o-bd3)' }} />
                    </div>
                  </EditableCard>
                : <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '4px 0 0' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'var(--o-text3)' }}>{String(nomDe(bloc.titre)).toUpperCase()}</span>
                    <span style={{ height: 1, flex: 1, background: 'var(--o-bd3)' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' }}>{allumees}/{cartes.length}</span>
                  </div>)}
              <div className="grid-roomdev" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(232px,1fr))', gap: 14 }}>
                {cartes.map(k => {
                  const carte = ed.typeOf(k) ? <CvTyped x={{ t: ed.typeOf(k), id: k }} hass={hass} dc={dc} /> : dc.card(k, ed.labelOf(k));
                  if (!edit) return <Anim key={k} i={ed.ids.indexOf(k)} className={ed.estLarge(k) ? 'o-cvw2' : ''}>{carte}</Anim>;
                  return <EditableCard key={k} ed={ed} id={k} nom={nomDe(k)} onEdit={setCardEdit}>{carte}</EditableCard>;
                })}
              </div>
            </div>
          );
        })}
      </div>
      {dc.sheets}
      {cardEdit && <CardEditSheet ed={ed} id={cardEdit} nom={nomDe(cardEdit)} origine={origineDe(cardEdit)} hass={hass} onClose={() => setCardEdit(null)} />}
      {addSheet && <RoomAddSheet hass={hass} present={ed.ids} onToggle={ed.toggle} entete={tr('Ajouter une lumière')}
        domaines={['light', 'switch']} onClose={() => setAddSheet(false)} />}
      {popupId != null && (() => {
        const pl = lights.find(x => x.id === popupId);
        if (!pl) return null;
        const acc = (pl.rgb && pl.color) ? pl.color : '#ffce73';
        const briBig = pl.on ? pl.bri : 0;
        const segBase = { width: 42, height: 42, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', overflow: 'hidden', transition: 'box-shadow .2s' };
        return (
          <div onClick={closePop} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.32)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', animation: popClosing ? 'o-fadeOut .3s ease forwards' : 'o-fadeIn .25s ease' }}>
            <div onClick={e => e.stopPropagation()}
              onAnimationEnd={(e) => { if (popClosing && e.target === e.currentTarget) { setPopupId(null); setPopClosing(false); } }}
              style={{ position: 'fixed', left: '50%', bottom: 0, transform: 'translate(-50%,0)', width: 'min(480px,100%)', maxHeight: '88vh', overflowY: 'auto', background: 'var(--o-surfA)', borderTop: 'var(--o-bw,1px) solid var(--o-bd1)', borderLeft: 'var(--o-bw,1px) solid var(--o-bd1)', borderRight: 'var(--o-bw,1px) solid var(--o-bd1)', borderRadius: '26px 26px 0 0', padding: '10px 22px calc(24px + var(--o-safe-bottom,0px))', boxShadow: '0 -10px 50px rgba(0,0,0,.35)', animation: popClosing ? 'o-sheetOut .3s cubic-bezier(.32,.72,.25,1) forwards' : 'o-sheetIn .46s cubic-bezier(.22,1.28,.36,1)' }}>
              {/* poignée */}
              <div style={{ width: 38, height: 5, borderRadius: 3, background: 'var(--o-bd1)', margin: '4px auto 14px' }} />
              {/* header : croix + nom + toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={closePop} style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--o-s1)', border: 'none', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
                <span style={{ flex: 1, fontSize: 19, fontWeight: 700, color: 'var(--o-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pl.name}</span>
                <span role="switch" aria-checked={pl.on} tabIndex={0} aria-label={(pl.on ? 'Éteindre ' : 'Allumer ') + pl.name} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(pl); } }} onClick={() => toggle(pl)} style={{ width: 48, height: 27, borderRadius: 14, background: pl.on ? '#FF2D78' : 'rgba(150,162,184,.2)', position: 'relative', cursor: 'pointer', flexShrink: 0, display: 'inline-block', transition: 'background .25s' }}><span style={{ position: 'absolute', top: 3, left: pl.on ? 24 : 3, width: 21, height: 21, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,.35)', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)' }} /></span>
              </div>
              {/* grand % + horodatage */}
              <div style={{ textAlign: 'center', margin: '18px 0 16px' }}>
                <div style={{ fontSize: 34, fontWeight: 600, color: 'var(--o-text)', letterSpacing: '-.01em' }}><span id="o-bri-big">{briBig}</span> <span style={{ fontSize: 24, fontWeight: 500, opacity: .85 }}>%</span></div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--o-text2)', marginTop: 4 }}>{relTime(pl.lc) || (pl.on ? tr('Allumé') : tr('Éteint'))}</div>
              </div>
              {/* slider vertical type fader (peint en DOM direct pendant le drag) */}
              {pl.dimmable !== false && (
                <div onPointerDown={(e) => dragVert(pl.id, e)} {...kbSlider('Luminosité ' + pl.name, pl.bri || 0, (nv) => { setBri(pl.id, nv); commander(hass, pl.id, 'set_brightness', nv); })} style={{ position: 'relative', width: 148, height: 300, margin: '0 auto', borderRadius: 'var(--o-radius,26px)', overflow: 'hidden', cursor: 'grab', touchAction: 'none', background: 'var(--o-s1)' }}>
                  <div data-fill style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: briBig + '%', background: `linear-gradient(0deg,${acc},${hx(acc, .78)})`, opacity: pl.on ? 1 : .3, transition: 'height .12s' }} />
                  <div data-handle style={{ position: 'absolute', left: 0, right: 0, bottom: `calc(${briBig}% - 26px)`, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', opacity: pl.on ? 1 : 0, transition: 'bottom .12s,opacity .2s' }}><span style={{ width: 40, height: 4, borderRadius: 3, background: 'rgba(255,255,255,.95)' }} /></div>
                </div>
              )}
              {/* segment de contrôle : power · luminosité · couleur · temp */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--o-s1)', borderRadius: 999, padding: 6, margin: '22px auto 0', width: 'max-content' }}>
                <button onClick={() => toggle(pl)} style={{ ...segBase, background: 'transparent', color: 'var(--o-text1)' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 3v9M6.5 7a8 8 0 1 0 11 0" /></svg></button>
                <button style={{ ...segBase, background: 'var(--o-accent)', color: '#fff', boxShadow: '0 4px 14px rgba(var(--o-accent-rgb),.5)', cursor: 'default' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5" /><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M18 6l2-2M4 20l2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
                {pl.rgb && <button onClick={() => setPopMode('color')} style={{ ...segBase, background: 'transparent', boxShadow: popMode === 'color' ? '0 0 0 2px var(--o-text)' : 'none' }}><span style={{ width: 22, height: 22, borderRadius: '50%', background: 'conic-gradient(from 0deg,#ff5f57,var(--o-gold),var(--o-ok),var(--o-accent),var(--o-purple),#ff5f57)' }} /></button>}
                {pl.ct && <button onClick={() => setPopMode('white')} style={{ ...segBase, background: 'transparent', boxShadow: popMode === 'white' ? '0 0 0 2px var(--o-text)' : 'none' }}><span style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(90deg,#fff,#ffd27a)' }} /></button>}
              </div>
              {/* palette : 2 rangées de 4 (couleurs ou blancs) */}
              {pl.on && popMode === 'color' && pl.rgb && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, maxWidth: 280, margin: '22px auto 0' }}>
                  {LIGHT_PALETTE.map(c => { const sel = (pl.color || '').toLowerCase() === c.toLowerCase(); return <button key={c} onClick={() => pick(pl.id, c)} style={{ width: 52, height: 52, borderRadius: '50%', cursor: 'pointer', background: c, justifySelf: 'center', padding: 0, border: sel ? '3px solid #fff' : '3px solid transparent', boxShadow: sel ? `0 0 0 2px ${c}` : 'inset 0 0 0 1px rgba(0,0,0,.15)', transition: 'all .15s' }} />; })}
                </div>
              )}
              {pl.on && popMode === 'white' && pl.ct && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, maxWidth: 280, margin: '22px auto 0' }}>
                  {WHITE_TEMPS().map(([n, k, c]) => <button key={k} title={n + ' · ' + k + 'K'} onClick={() => setWhite(pl.id, k)} style={{ width: 52, height: 52, borderRadius: '50%', cursor: 'pointer', background: c, justifySelf: 'center', padding: 0, border: '3px solid transparent', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)', transition: 'all .15s' }} />)}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function LumieresView({ hass, edit = false, onEnt }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <LumieresContent hass={hass} edit={edit} onEnt={onEnt} />
    </main>
  );
}

/* ════════════ VUE SCÈNES — bibliothèque de scènes colorées ════════════ */
// Catalogue de scènes Hue, relevé sur une installation type. Chaque scène :
// 5 RGB + luminosité + uuid (thumbnail).
const HUE_SCENES = {
  classics: { label: 'Classiques', scenes: [
    { name: 'Rest', uuid: 'e03267e7-9914-4f47-97fe-63c0bd317fe7', colors: [[215,134,30],[215,134,30],[215,134,30],[215,134,30],[215,134,30]], brightness: 35 },
    { name: 'Relax', uuid: 'e71b2ef3-1b15-4c4b-b036-4b3d6efe58f8', colors: [[243,179,80],[243,179,80],[243,179,80],[243,179,80],[243,179,80]], brightness: 56 },
    { name: 'Read', uuid: '035b6ecf-414e-4781-abc7-3911556097cb', colors: [[255,242,149],[255,242,149],[255,242,149],[255,242,149],[255,242,149]], brightness: 100 },
    { name: 'Concentrate', uuid: '0cbec4e8-d064-4457-986a-fe6078a63f39', colors: [[255,252,208],[255,252,208],[255,252,208],[255,252,208],[255,252,208]], brightness: 100 },
    { name: 'Energize', uuid: '0eeacfc5-2d81-4035-a23d-4a9bc02af965', colors: [[249,255,255],[249,255,255],[249,255,255],[249,255,255],[249,255,255]], brightness: 100 },
    { name: 'Cool bright', uuid: '6d10a807-7330-46d1-b093-c15520ba72c0', colors: [[255,251,198],[255,251,198],[255,251,198],[255,251,198],[255,251,198]], brightness: 100 },
    { name: 'Bright', uuid: '84ebc26c-9d61-4d25-830c-41ea66f1c325', colors: [[255,240,138],[255,240,138],[255,240,138],[255,240,138],[255,240,138]], brightness: 100 },
    { name: 'Dimmed', uuid: '8f55e62a-e5f8-456a-9e8b-61f314bd4e99', colors: [[175,140,78],[175,140,78],[175,140,78],[175,140,78],[175,140,78]], brightness: 30 },
    { name: 'Nightlight', uuid: 'b6f58e22-677f-4670-8677-3dea4ac60383', colors: [[21,8,0],[21,8,0],[21,8,0],[21,8,0],[21,8,0]], brightness: 0 },
  ] },
  cosy: { label: 'Cosy', scenes: [
    { name: 'Rolling hills', uuid: '49c61bae-d3ec-4df2-89a4-65235705f3a1', colors: [[251,139,50],[230,156,68],[240,149,55],[219,163,96],[224,160,82]], brightness: 45 },
    { name: 'Warm embrace', uuid: '73b2c0b3-b4c5-4307-8873-eb231c83e996', colors: [[254,114,93],[231,138,66],[251,119,77],[239,130,66],[220,147,67]], brightness: 40 },
    { name: 'Dreamy dusk', uuid: 'a127f9ef-0371-48dc-bc79-852e2e5b2cc3', colors: [[242,163,83],[255,150,83],[255,147,184],[255,134,158],[255,134,109]], brightness: 50 },
    { name: 'Honolulu', uuid: '23ab68cc-3a82-4762-b9db-f0d1a483281d', colors: [[255,67,82],[252,113,91],[229,137,46],[197,158,71],[240,126,68]], brightness: 39 },
    { name: 'Savanna sunset', uuid: 'ea580cb0-149e-48e6-a729-2a500edfb924', colors: [[213,199,111],[255,147,75],[255,115,43],[255,171,91],[235,189,82]], brightness: 58 },
    { name: 'Golden pond', uuid: '89c16361-391d-4346-b6d8-ac1eaf4de3dc', colors: [[251,196,45],[255,178,39],[255,173,37],[243,201,68],[249,197,63]], brightness: 64 },
    { name: 'Ruby glow', uuid: '454176dd-7d24-43de-86c4-ee73f8febbec', colors: [[199,155,164],[255,99,142],[230,134,154],[215,145,160],[246,119,151]], brightness: 40 },
    { name: 'Tropical twilight', uuid: 'ffbf7ff8-dc4a-4c56-b157-7a59113be7b7', colors: [[213,156,199],[221,157,111],[254,132,63],[222,116,255],[225,136,255]], brightness: 44 },
  ] },
  party: { label: tr('Ambiance fête'), scenes: [
    { name: 'Miami', uuid: 'd0b4b2d2-570f-4325-9475-098e3e0501f0', colors: [[69,255,255],[255,166,123],[255,188,104],[163,235,255],[255,129,189]], brightness: 75 },
    { name: 'Cancun', uuid: 'c321d848-51a8-4d09-9ad0-5e6b44bc7f2c', colors: [[255,212,60],[255,86,147],[255,109,16],[255,139,190],[255,164,32]], brightness: 79 },
    { name: 'Rio', uuid: '94fc428e-2855-4f67-877e-3d1e1dd95b7d', colors: [[255,223,81],[255,148,180],[255,117,191],[255,150,255],[255,187,102]], brightness: 79 },
    { name: 'Chinatown', uuid: '7581da02-1688-4128-9bb9-b635f3b89999', colors: [[255,168,36],[255,57,60],[255,141,117],[255,66,89],[255,88,98]], brightness: 60 },
    { name: 'Ibiza', uuid: 'eaa0d424-ac66-4247-8342-06d2b128ac31', colors: [[255,134,57],[239,162,64],[255,147,57],[199,185,79],[214,178,61]], brightness: 49 },
    { name: 'Osaka', uuid: '5768805d-27c1-442e-b069-d20443485201', colors: [[243,110,18],[255,65,142],[201,146,51],[254,93,92],[229,117,164]], brightness: 36 },
    { name: 'Tokyo', uuid: 'de7eda64-84bf-4ed6-a4fa-76e0ebdd1968', colors: [[244,153,32],[203,14,255],[79,192,255],[255,49,143],[255,36,255]], brightness: 47 },
    { name: 'Motown', uuid: '7dded6f8-a2aa-4726-b391-21e9a0f76eee', colors: [[72,210,255],[136,143,255],[163,0,255],[52,220,243],[85,202,255]], brightness: 53 },
    { name: 'Fairfax', uuid: 'abfc5768-5c2c-4d61-bd03-2b64660e813f', colors: [[255,58,56],[134,220,255],[255,115,103],[68,231,255],[255,166,161]], brightness: 62 },
  ] },
  romance: { label: 'Romantique', scenes: [
    { name: 'Ruby romance', uuid: '68d97db1-eb52-4c03-8afc-eed5df30c417', colors: [[255,49,88],[249,140,94],[255,86,113],[255,124,85],[248,140,125]], brightness: 45 },
    { name: 'City of love', uuid: '1fde4a1b-2ace-4b3a-a517-f9660fc84536', colors: [[151,0,255],[70,194,255],[108,159,255],[255,135,48],[226,159,42]], brightness: 45 },
    { name: 'Sunset allure', uuid: '68e8b68e-8237-48a6-bf5f-f62258dd2ff3', colors: [[185,149,255],[255,120,73],[201,146,255],[240,136,70],[226,148,61]], brightness: 41 },
    { name: 'Lovebirds', uuid: 'f1f5f209-ffcb-4734-8567-0819a2885214', colors: [[230,137,64],[233,135,27],[212,150,62],[208,153,67],[208,154,33]], brightness: 39 },
    { name: 'Smitten', uuid: 'a65a2815-52fb-4748-8e02-b607f96f70ea', colors: [[255,154,180],[255,153,128],[255,148,143],[255,160,115],[255,163,90]], brightness: 60 },
    { name: 'Glitz and glam', uuid: '2bf0e527-62ac-4203-b8a1-de06b0913fde', colors: [[255,67,243],[255,143,52],[255,134,231],[255,141,188],[253,155,57]], brightness: 50 },
    { name: 'Promise', uuid: '0b8dcd68-9ad0-4722-b23f-5fddb24204ef', colors: [[122,200,255],[255,141,137],[220,159,255],[162,200,141],[241,162,126]], brightness: 50 },
  ] },
  halloween: { label: 'Halloween', scenes: [
    { name: 'Trick or treat', uuid: '8a363ceb-f4c2-4c7f-9cd3-a71a6181b471', colors: [[255,129,77],[136,147,255],[180,149,255],[255,79,255],[255,135,255]], brightness: 55 },
    { name: 'Glowing grins', uuid: '938da1ed-edbc-4cf0-b9ab-bdc3d7d0659f', colors: [[255,57,76],[237,157,61],[255,139,32],[255,108,55],[131,204,49]], brightness: 47 },
    { name: 'Spellbound', uuid: '0d2a6c4f-9c71-4279-950c-05f3f84b6dbd', colors: [[240,165,19],[91,216,113],[236,30,255],[194,152,255],[134,209,72]], brightness: 50 },
    { name: 'Hocus pocus', uuid: '00b65abf-df21-4f15-a379-c1742fb786fb', colors: [[225,21,255],[255,48,137],[235,153,32],[17,212,116],[255,49,0]], brightness: 45 },
    { name: 'Toil and trouble', uuid: '074338f3-f7f3-4402-9f30-46ac70e5a0e6', colors: [[255,49,5],[255,119,30],[245,144,48],[224,20,255],[221,122,255]], brightness: 44 },
    { name: 'Witching hour', uuid: '2ad04284-2f0a-40d9-b2a9-6b929a475fa1', colors: [[247,142,106],[255,128,68],[255,89,23],[152,0,255],[121,172,255]], brightness: 45 },
    { name: 'Pandemonium', uuid: '0cbcc8ed-5474-471c-b3c1-45b4acc555b1', colors: [[190,0,255],[216,161,255],[250,55,255],[206,91,255],[205,154,255]], brightness: 50 },
    { name: 'Phantom', uuid: 'd824598f-0c09-4e67-beb2-972a8d5813e2', colors: [[117,185,192],[229,138,95],[52,191,235],[73,180,255],[206,152,137]], brightness: 40 },
  ] },
  winter: { label: 'Fêtes d\'hiver', scenes: [
    { name: 'Snow sparkle', uuid: '6a794ffd-3564-493d-a9ad-a1abcec8b81c', colors: [[32,197,168],[143,151,255],[143,0,255],[228,139,63],[255,104,26]], brightness: 39 },
    { name: 'Under the tree', uuid: '85b8bc42-c564-4661-b058-f4e5792a6a6c', colors: [[255,57,32],[59,198,125],[9,202,63],[205,157,42],[230,138,95]], brightness: 40 },
    { name: 'Nutcracker', uuid: '33c32d2a-e5ad-4b26-8e6f-07090b4c6487', colors: [[59,189,255],[186,166,74],[217,149,34],[106,148,255],[74,196,139]], brightness: 40 },
    { name: 'Jolly', uuid: '77d10893-7b6f-4586-a77b-694b2b78fd3a', colors: [[203,157,63],[255,108,85],[59,198,125],[76,177,255],[255,99,186]], brightness: 40 },
    { name: 'Golden star', uuid: 'a5a12d6a-430d-4324-9078-cf7a74538b52', colors: [[255,49,39],[209,172,60],[246,147,32],[219,166,53],[255,102,74]], brightness: 46 },
    { name: 'Silent night', uuid: '4760abd5-e5a6-425a-be32-8f37f6e2acfd', colors: [[205,149,95],[204,148,126],[217,141,92],[226,134,86],[206,147,109]], brightness: 38 },
    { name: 'Color burst', uuid: 'e24e9183-747e-4d4e-a950-a746c6291c90', colors: [[232,32,255],[255,39,72],[222,102,80],[133,124,255],[161,148,44]], brightness: 30 },
    { name: 'Crystalline', uuid: '713a3f4d-2fc9-4d5e-80a5-a20a25815197', colors: [[186,140,148],[188,141,119],[103,162,253],[83,163,255],[182,139,189]], brightness: 33 },
    { name: 'Rosy sparkle', uuid: 'cf50bd49-16b1-47fd-a020-b83072595f37', colors: [[218,140,105],[205,147,132],[231,127,131],[236,118,176],[230,116,235]], brightness: 38 },
    { name: 'Festive fun', uuid: '667e4f15-4abf-4c56-8ef4-74fe1df422b8', colors: [[103,132,255],[181,26,255],[254,91,67],[200,16,255],[241,108,65]], brightness: 35 },
  ] },
  misc: { label: 'Divers', scenes: [
    { name: 'SECAM', uuid: 'dbffbd71-7f65-428a-9ac7-0db51057d31a', colors: [[244,0,255],[255,0,27],[255,0,255],[73,221,0],[88,213,208]], brightness: 50 },
    { name: 'CGA', uuid: '9565033d-f2ea-4821-bfba-7dd9b35be20a', colors: [[43,217,211],[255,0,255],[255,0,255],[255,0,255],[255,0,255]], brightness: 50 },
    { name: 'Light Cycles', uuid: '97648e18-758a-4382-99a4-8b657f4bb098', colors: [[255,136,11],[109,207,235],[109,207,235],[109,207,235],[109,207,235]], brightness: 50 },
    { name: 'Valetudo', uuid: '4bc4f958-b4af-46cf-8e67-636161e714f5', colors: [[94,181,255],[0,219,213],[111,215,47],[255,94,40],[214,181,51]], brightness: 50 },
  ] },
};
const HUE_SCENE_IMG_BASE = '/local/hue_scenes/';

// Appliquer une scène colorée demande un script capable de recevoir plusieurs
// couleurs : rien de standard dans Home Assistant. Il est donc désigné dans la
// configuration, et à défaut on n'applique que la luminosité — un geste partiel
// vaut mieux qu'un bouton qui ne fait rien.
function hueScripts() { const c = loggiaEnt('hueScripts', null); return (c && typeof c === 'object') ? c : {}; }
const scriptSvc = (id) => (typeof id === 'string' && id.indexOf('script.') === 0) ? id.slice(7) : null;

// Tondeuse : le domaine `lawn_mower` suffit ; la configuration tranche s'il y
// en a plusieurs. Ses capteurs sont ceux du même appareil.
function mowerId(S) {
  const c = loggiaEnt('mower', null);
  if (c && c.main && (!S || S[c.main])) return c.main;
  return S ? (Object.keys(S).find(id => id.indexOf('lawn_mower.') === 0) || null) : null;
}
function mowerSensor(S, kind) {
  const id = mowerId(S);
  if (!id || !LOGGIA_INDEX) return null;
  const opts = kind === 'battery' ? { domain: 'sensor', deviceClass: 'battery' }
    : kind === 'charging' ? { domain: 'binary_sensor', deviceClass: 'battery_charging' }
      : { domain: 'sensor', match: /(progress|progression)/ };
  return pickSibling(LOGGIA_INDEX, S || {}, id, opts);
}

// Capteurs qui alimentent les notifications. Rien de standard non plus : un
// lave-vaisselle sur prise commandée ou un calendrier de collecte se désignent.
function notifIds() { const c = loggiaEnt('notifications', null); return (c && typeof c === 'object') ? c : {}; }

// Entités de la tondeuse à poller : les siennes, pas celles d'un modèle précis.
function mowerKeys() {
  const S = (getHass() || {}).states || {};
  return [mowerId(S), mowerSensor(S, 'battery'), mowerSensor(S, 'charging'), mowerSensor(S, 'progress')].filter(Boolean);
}

/* Une FONCTION, pas une table.
 *
 * Evaluee a l'import, cette liste figeait ses libelles dans la langue du
 * demarrage. C'est ce qui obligeait a recharger la page apres un changement de
 * langue. Appelee au rendu, elle se dit dans la langue du moment. */
const HUE_ROOMS = () => [
  { id: 'Séjour', label: tr('Séjour'), icon: 'couch' }, { id: 'Chambre', label: 'Chambre', icon: 'bed' },
  { id: 'Chambre enfant', label: 'Enfant', icon: 'teddy-bear' }, { id: 'Toute la maison', label: 'Tout', icon: 'home' },
];
const HUE_CATS = Object.entries(HUE_SCENES).map(([id, c]) => ({ id, label: c.label }));
const rgbHex = (c) => '#' + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
// Lumières réglables en luminosité : le choix de l'utilisateur s'il en a fait
// un, sinon toutes celles que Home Assistant déclare variables.
function dimmableLights(hass) {
  const cfg = loggiaEnt('hue', null);
  const S = (hass && hass.states) || null;
  if (Array.isArray(cfg) && cfg.length) return S ? cfg.filter(id => S[id]) : cfg;
  if (!S) return [];
  return Object.keys(S).filter(id => {
    if (id.indexOf('light.') !== 0) return false;
    const m = (S[id].attributes && S[id].attributes.supported_color_modes) || [];
    return m.some(x => x !== 'onoff');
  });
}
// Aperçu façon app Hue : 5 dégradés radiaux sur fond sombre (fallback si le JPEG manque).
const sceneGradient = (colors) => {
  const pos = ['20% 25%', '78% 22%', '50% 65%', '18% 80%', '85% 78%'];
  const layers = colors.slice(0, 5).map(([r, g, b], i) => `radial-gradient(circle at ${pos[i] || pos[i % 5]}, rgb(${r},${g},${b}) 0%, rgba(${r},${g},${b},0) 55%)`);
  return [...layers, 'linear-gradient(135deg,#1a1f2e,#0d1018)'].join(', ');
};
// Vrai JPEG Hue par-dessus, dégradé RGB en fallback (jamais de carte grise vide).
const sceneBackground = (scene) => { const g = sceneGradient(scene.colors); return scene.uuid ? `url('${HUE_SCENE_IMG_BASE}${scene.uuid}.jpeg') center/cover no-repeat, ${g}` : g; };
const sceneByName = (name) => { for (const c of Object.values(HUE_SCENES)) { const s = c.scenes.find(x => x.name === name); if (s) return s; } return null; };

// Liste déroulante aux couleurs du thème (le menu d'un <select> natif est rendu par
// l'OS : impossible à styler, illisible en thème sombre). Fermeture au clic extérieur
// et à Échap.
function Dropdown({ value, options, onChange, label, width = 150 }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const cur = options.find(o => o.id === value);
  // Position mesuree a l'ouverture puis suivie au scroll/resize.
  useEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const place = () => {
      const el = wrapRef.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const w = Math.max(width, r.width);
      // reste dans l'ecran : on decale si le panneau deborde a droite
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      setPos({ left, top: r.bottom + 6, w });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, width]);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', onDoc, true); document.removeEventListener('keydown', onKey, true); };
  }, [open]);
  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={label}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 700, border: 'none', background: 'rgba(var(--o-accent-rgb),.18)', color: 'var(--o-accent-soft)' }}>
        {cur ? cur.label : '—'}
        <span style={{ display: 'inline-flex', transition: 'transform .18s', transform: open ? 'rotate(180deg)' : 'none' }}><Fi i="angle-small-down" size={13} color="var(--o-accent-soft)" /></span>
      </button>
      {open && pos && (
        <div role="listbox" aria-label={label} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 80, minWidth: pos.w, maxHeight: 'min(50vh, 340px)', overflowY: 'auto', padding: 6, borderRadius: 12, background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd1)', boxShadow: '0 18px 44px rgba(0,0,0,.4)' }}>
          {options.map(o => {
            const on = o.id === value;
            return (
              <button key={o.id} role="option" aria-selected={on} onClick={() => { onChange(o.id); setOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: on ? 700 : 600, background: on ? 'rgba(var(--o-accent-rgb),.16)' : 'transparent', color: on ? 'var(--o-accent-soft)' : 'var(--o-text1)' }}>
                <span style={{ width: 13, display: 'inline-flex', flexShrink: 0 }}>{on ? <Fi i="check" size={12} color="var(--o-accent-soft)" /> : null}</span>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}

function ScenesContent({ hass }) {
  const S = (hass && hass.states) || null;
  const haActive = (S && S[hueScripts().active] && S[hueScripts().active].state) || '';
  const haRoom = (S && S[hueScripts().room] && S[hueScripts().room].state) || tr('Toute la maison');
  // état optimiste : maj instantanée au clic (sinon ça "rame" en attendant le poll HA ~2s)
  const [room, setRoomState] = useState(haRoom);
  const [sel, setSel] = useState(haActive);
  useEffect(() => { setRoomState(haRoom); }, [haRoom]);
  useEffect(() => { setSel(haActive); }, [haActive]);
  const selCat = (Object.entries(HUE_SCENES).find(([, c]) => c.scenes.some(s => s.name === sel)) || [])[0] || null;
  const [cat, setCat] = useState(selCat || 'classics');
  useEffect(() => { if (selCat) setCat(selCat); }, [selCat]);

  const call = (d, s, data) => { try { if (hass && hass.callService) hass.callService(d, s, data || {}); } catch (e) {} };
  // Applique une scène : le script configuré s'il existe, sinon la luminosité
  // seule sur les lampes variables.
  const applyScene = (data) => {
    const svc = scriptSvc(hueScripts().apply);
    if (svc) { call('script', svc, data); return; }
    const ids = dimmableLights(hass);
    if (ids.length && data.brightness_pct != null) call('light', 'turn_on', { entity_id: ids, brightness_pct: data.brightness_pct });
  };
  const pickScene = (sc) => { setSel(sc.name); applyScene({ scene_name: sc.name, color1: sc.colors[0], color2: sc.colors[1], color3: sc.colors[2], color4: sc.colors[3], color5: sc.colors[4], brightness_pct: sc.brightness }); };
  const pickRoom = (r) => { setRoomState(r); const id = hueScripts().room; if (id) call('input_select', 'select_option', { entity_id: id, option: r }); };
  // Deux gestes sans équivalent standard : on garde le script quand il existe,
  // sinon on éteint simplement les lampes concernées.
  const runOrLights = (key, svcFallback) => {
    const svc = scriptSvc(hueScripts()[key]);
    if (svc) { call('script', svc, {}); return; }
    const ids = dimmableLights(hass);
    if (ids.length) call('light', svcFallback, { entity_id: ids });
  };
  const warmWhite = () => { setSel(''); runOrLights('off', 'turn_off'); };
  const allOff = () => { setSel(''); runOrLights('allOff', 'turn_off'); };

  const scenes = HUE_SCENES[cat] ? HUE_SCENES[cat].scenes : [];
  const selScene = sel ? sceneByName(sel) : null;
  const lit = !!selScene;
  const selColor = selScene ? rgbHex(selScene.colors[0]) : '#5f6c87';
  const roomBtn = on => ({ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, padding: 18, borderRadius: 'var(--o-radius,16px)', border: '1px solid ' + (on ? 'rgba(var(--o-accent-rgb),.4)' : 'var(--o-bd2)'), cursor: 'pointer', fontWeight: 700, fontSize: 14, transition: 'all .2s', background: on ? 'rgba(var(--o-accent-rgb),.14)' : 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', color: on ? 'var(--o-accent-soft)' : 'var(--o-text1)', boxShadow: on ? '0 6px 16px rgba(var(--o-accent-rgb),.25)' : 'none' });
  const qaBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 18px', borderRadius: 14, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd1)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 14, cursor: 'pointer' };

  // Luminosité appliquée avec la scène (le script accepte brightness_pct)
  const [briOv, setBriOv] = useState(null);
  const briOfScene = selScene && selScene.brightness != null ? selScene.brightness : 60;
  const bri = briOv != null ? briOv : briOfScene;
  const setBri = (nv) => {
    const v = Math.max(5, Math.min(100, nv));
    setBriOv(v);
    if (selScene) applyScene({ scene_name: selScene.name, color1: selScene.colors[0], color2: selScene.colors[1], color3: selScene.colors[2], color4: selScene.colors[3], color5: selScene.colors[4], brightness_pct: v });
    else { const ids = dimmableLights(hass); if (ids.length) call('light', 'turn_on', { entity_id: ids, brightness_pct: v }); }
  };
  const [panel, setPanel] = useState(() => { try { return localStorage.getItem('loggia-scenepanel') !== '0'; } catch (e) { return true; } });
  const togglePanel = () => setPanel(v => { const nv = !v; try { localStorage.setItem('loggia-scenepanel', nv ? '1' : '0'); } catch (e) {} return nv; });
  const totalScenes = Object.values(HUE_SCENES).reduce((n, c) => n + c.scenes.length, 0);
  const lastApplied = (S && S[hueScripts().active] && S[hueScripts().active].last_changed) || null;
  const lastRel = (() => {
    if (!lastApplied) return null;
    const m = (Date.now() - Date.parse(lastApplied)) / 60000;
    if (isNaN(m)) return null;
    if (m < 1) return "à l'instant";
    if (m < 60) return 'il y a ' + Math.round(m) + ' min';
    if (m < 1440) return 'il y a ' + Math.round(m / 60) + ' h';
    return 'il y a ' + Math.round(m / 1440) + ' j';
  })();
  // Bloc du bandeau : libellé + contrôle, comme la vue Pièce
  const QuickBox = ({ label, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{label}</span>
      {children}
    </div>
  );
  const miniBtn = (on) => ({ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', background: on ? 'rgba(var(--o-accent-rgb),.18)' : 'transparent', color: on ? 'var(--o-accent-soft)' : 'var(--o-text2)' });

  return (
    <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{tr('Scènes')}</h1>
          <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>Bibliothèque Hue · {HUE_CATS.length} collections · {totalScenes} scènes</div>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: lit ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: lit ? 'var(--o-accent-soft)' : 'var(--o-text3)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: lit ? selColor : 'var(--o-text3)' }} />{lit ? sel.toUpperCase() : tr('AUCUNE ACTIVE')}</span>
      </div>

      {/* réglages rapides : direct, pièce, collection, luminosité */}
      <div className="o-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,20px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
        <QuickBox label="Direct">
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={warmWhite} style={miniBtn(false)}>Blanc chaud</button>
            <button onClick={allOff} style={miniBtn(false)}>{tr('Éteindre')}</button>
          </div>
        </QuickBox>
        <QuickBox label={tr('Pièce')}>
          <div style={{ display: 'flex', gap: 4 }}>
            {HUE_ROOMS().map(r => <button key={r.id} onClick={() => pickRoom(r.id)} style={miniBtn(room === r.id)}>{r.label}</button>)}
          </div>
        </QuickBox>
        <QuickBox label="Collection">
          <Dropdown value={cat} options={HUE_CATS} onChange={setCat} label={tr('Collection de scènes')} />
        </QuickBox>
        <QuickBox label={tr('Luminosité')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }} {...kbSlider('Luminosité des scènes', bri, setBri, { min: 5, max: 100, step: 5 })}>
            <button onClick={() => setBri(bri - 5)} aria-label="Baisser" style={{ width: 22, height: 22, borderRadius: 7, border: 'none', cursor: 'pointer', background: 'var(--o-s1)', color: 'var(--o-text1)', fontSize: 13, fontWeight: 600 }}>−</button>
            <span style={{ minWidth: 44, textAlign: 'center', fontSize: 12.5, fontWeight: 800, color: 'var(--o-warn)' }}>{bri} %</span>
            <button onClick={() => setBri(bri + 5)} aria-label="Monter" style={{ width: 22, height: 22, borderRadius: 7, border: 'none', cursor: 'pointer', background: 'var(--o-s1)', color: 'var(--o-text1)', fontSize: 13, fontWeight: 600 }}>+</button>
          </div>
        </QuickBox>
        <span style={{ flex: 1 }} />
        <button onClick={togglePanel} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, border: panel ? 'var(--o-bw,1px) solid rgba(var(--o-accent-rgb),.44)' : 'var(--o-bw,1px) solid var(--o-bd1)', background: panel ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: panel ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}><Fi i="sliders-v" size={13} /><span className="o-barlabel">{panel ? tr('Masquer les réglages') : tr('Réglages de la vue')}</span></button>
      </div>

      {/* carte Appliquer une scène */}
      {panel && (
        <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '20px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{tr('Appliquer une scène')}</div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, background: 'rgba(var(--o-accent-rgb),.14)', color: 'var(--o-accent-soft)', fontSize: 11, fontWeight: 800, flexShrink: 0, whiteSpace: 'nowrap' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--o-accent)' }} />{(HUE_ROOMS().find(r => r.id === room) || { label: room }).label.toUpperCase()}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, margin: '3px 0 8px' }}>{tr("La scène s'applique au groupe de la pièce sélectionnée")}</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 190px', minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{lit ? 'Scène active' : 'Dernière appliquée'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 }}>{room}{lastRel ? ' · ' + lastRel : ''}</div>
              </div>
              <span style={{ fontSize: 15, fontWeight: 800, marginLeft: 'auto', color: lit ? 'var(--o-accent-soft)' : 'var(--o-text3)', whiteSpace: 'nowrap' }}><FlipText live text={sel || tr('Aucune')} /></span>
            </div>
          </div>
        </div>
      )}

      {/* grille des scènes de la collection : l'IMAGE Hue reste la vignette */}
      <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{(HUE_CATS.find(c => c.id === cat) || {}).label}</div>
      <div className="grid-scenecards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(178px,1fr))', gap: 14 }}>
        {scenes.map(sc => {
          const on = sel === sc.name;
          return (
            <button key={sc.name} onClick={() => pickScene(sc)} title={'Appliquer « ' + sc.name + ' »'} style={{ position: 'relative', textAlign: 'left', padding: 0, overflow: 'hidden', cursor: 'pointer', borderRadius: 16, background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid ' + (on ? 'rgba(var(--o-accent-rgb),.55)' : 'var(--o-bd2)'), boxShadow: on ? '0 0 0 1px rgba(var(--o-accent-rgb),.3)' : 'none', transition: 'border-color .2s, box-shadow .2s' }}>
              <span aria-hidden="true" style={{ display: 'block', height: 96, background: sceneBackground(sc) }} />
              <span style={{ display: 'block', padding: '11px 13px 12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: on ? 'var(--o-accent-soft)' : 'var(--o-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.name}</span>
                  {on && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--o-accent)', flexShrink: 0 }} />}
                </span>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', marginTop: 2 }}>Luminosité {sc.brightness} %</span>
                <span style={{ display: 'flex', gap: 3, marginTop: 9 }}>
                  {sc.colors.slice(0, 5).map((c, ci) => <span key={ci} style={{ flex: 1, height: 4, borderRadius: 2, background: rgbHex(c) }} />)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScenesView({ hass }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <ScenesContent hass={hass} />
    </main>
  );
}

/* ════════════ VUE CLIMAT (reproduction fidèle de "Loggia Climat.dc.html") ════════════ */
const CL_TEMPS = [17.2, 16.9, 16.8, 17.0, 17.4, 18.1, 18.8, 19.4, 20.1, 20.7, 21.1, 21.4, 21.3, 21.0, 20.6, 20.2, 19.7, 19.3, 18.9, 18.6, 18.5, 18.4, 18.3, 18.3];
const CL_COL = { confort: '#ff8a4c', eco: 'var(--o-ok)', horsgel: 'var(--o-accent)', off: 'var(--o-text3)' };
// Plage du dial Nest (labels 10°/20°/30°) + palette d'arc fixe (rouge → magenta → violet)
const T_MIN = 10, T_MAX = 30, T_SPAN = T_MAX - T_MIN;
const NEST_GRAD = ['#f2556e', '#c850a0', '#8b6dff'];
const cl_polC = (a, r) => ({ x: 65 + Math.cos(a * Math.PI / 180) * r, y: 65 + Math.sin(a * Math.PI / 180) * r });
const cl_arcC = (a0, a1, r) => { const p0 = cl_polC(a0, r), p1 = cl_polC(a1, r), la = (a1 - a0) > 180 ? 1 : 0; return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${la} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`; };
const cl_rgbAt = (t) => {
  const stops = [[10, [79, 140, 255]], [16, [6, 182, 212]], [20, [52, 211, 153]], [24, [234, 179, 8]], [27, [249, 115, 22]], [30, [239, 68, 68]]];
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) { if (t <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i], f = (t - a) / (b - a); return ca.map((v, k) => Math.round(v + f * (cb[k] - v))); } }
  return stops[stops.length - 1][1];
};

const climateKeys = () => climateZones(null).flatMap(z => [z.haid, z.tempCible, z.modeEnt, z.autoEnt, z.tempSensor].filter(Boolean));
// Zones de chauffage : configuration de l'utilisateur (elle seule sait décrire
// un radiateur fil pilote), sinon les thermostats trouvés par la découverte.
/** Une piece est-elle dehors ?
 *
 * Home Assistant ne le dit nulle part : ni les zones ni les appareils ne portent
 * cette notion. Le nom est le seul indice, et il etait compare au seul mot
 * « Exterieur » — chez un anglophone, son jardin entrait dans la moyenne des
 * temperatures interieures. Le motif couvre les langues de Loggia et les mots
 * les plus courants. */
function estDehors(nom) {
  return /ext[eé]rieur|exterior|outdoor|outside|au[sß]en|jardin|garden|garten|terrasse|terraza|balcon|balkon|patio/i
    .test(String(nom || ''));
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

function climateZones(S) {
  /* Trois sources, dans cet ordre.
   *
   * `loggia_climate` est ce que l'ecran Parametres → Entites enregistre : il
   * doit primer, sinon une saisie resterait sans effet, masquee par une
   * configuration plus ancienne. `loggia_entities.climate` est justement cette
   * configuration heritee, gardee tant que personne n'a touche a l'ecran.
   * La decouverte ferme la marche : elle ne trouve que les `climate.*`. */
  const saisi = cfgVal('loggia_climate', null);
  const c = (Array.isArray(saisi) && saisi.length) ? saisi : loggiaEnt('climate', null);
  if (Array.isArray(c) && c.length) return c.filter(z => z && z.haid && (!S || S[z.haid]));
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.climate;
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

function ClimatContent({ hass, edit = false, onEnt }) {
  const S = (hass && hass.states) || null;
  const derived = climateZones(S).map(z => readZone(S, z));
  const [thermos, setThermos] = useState(derived);
  const [selZone, setSelZone] = useState('poele');
  const [histOpen, setHistOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const sig = derived.map(t => `${t.id}:${t.mode}:${t.target}:${t.current}:${t.auto}`).join('|');
  useEffect(() => { setThermos(derived); }, [sig]);
  const call = (d, s, data) => { try { if (hass && hass.callService) hass.callService(d, s, data || {}); } catch (e) {} };
  const zoneOf = (id) => climateZones(S).find(z => z.id === id);
  const upLocal = (id, patch) => setThermos(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
  const setTargetLocal = (id, v) => upLocal(id, { target: Math.max(5, Math.min(30, Math.round(v * 2) / 2)) });
  const commitTarget = (id, v) => { v = Math.max(5, Math.min(30, Math.round(v * 2) / 2)); upLocal(id, { target: v }); call('input_number', 'set_value', { entity_id: zoneOf(id).tempCible, value: v }); };
  const inc = (id) => { const t = thermos.find(x => x.id === id); commitTarget(id, (t ? t.target : 18) + 0.5); };
  const dec = (id) => { const t = thermos.find(x => x.id === id); commitTarget(id, (t ? t.target : 18) - 0.5); };
  /* `m` est l'OPTION telle que Home Assistant la nomme : elle part sans
   * traduction. Seul le poele, un vrai `climate`, garde ses modes standards. */
  const setMode = (id, m) => { const z = zoneOf(id); upLocal(id, { mode: pilotFamille(m) || m, modeBrut: m }); if (estClimate(z)) commander(hass, z.haid, 'set_hvac_mode', m); else call('input_select', 'select_option', { entity_id: z.modeEnt, option: m }); };
  const setAuto = (id, a) => { const z = zoneOf(id); upLocal(id, { auto: a }); if (z.autoEnt) call('input_boolean', a ? 'turn_on' : 'turn_off', { entity_id: z.autoEnt }); };
  const dragDial = (id, e) => {
    e.preventDefault();
    const dial = e.currentTarget; let last = null;
    const move = ev => {
      const r = dial.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let deg = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
      let a = deg - 135; while (a < 0) a += 360; while (a >= 360) a -= 360;
      const pct = a <= 270 ? a / 270 : (a < 315 ? 1 : 0);
      last = T_MIN + pct * T_SPAN; setTargetLocal(id, last);
    };
    move(e);
    try { dial.setPointerCapture(e.pointerId); } catch (x) {}
    const end = () => { dial.onpointermove = null; dial.onpointerup = null; dial.onpointercancel = null; };
    dial.onpointermove = move;
    dial.onpointerup = () => { end(); if (last != null) commitTarget(id, last); };
    dial.onpointercancel = end;
  };
  // Qualité de l'air (capteurs réels)
  // Ambiance : la piece de la zone selectionnee. Le user veut ces releves « par
  // pieces » ; la premiere piece configuree ne sert plus que de repli.
  const airRoom = (() => {
    const pieces = normRooms(cfgVal('loggia_rooms', null));
    const z = thermos.find(x => x.id === selZone) || thermos[0];
    const cible = z && rmNorm(z.room || z.name || '');
    return (cible && pieces.find(r => rmNorm(r.room || '') === cible))
      || (cible && pieces.find(r => cible.indexOf(rmNorm(r.room || '')) >= 0))
      || pieces[0] || { haid: {} };
  })();
  const airTemp = climNum(S, airRoom.haid && airRoom.haid.temp);
  const airHum = climNum(S, airRoom.haid && airRoom.haid.humidity);
  // CO2 : le plus mauvais des capteurs déclarés — c'est celui-là qui compte.
  const co2 = normRooms(cfgVal('loggia_rooms', null))
    .map(r => climNum(S, r.haid && r.haid.co2) || 0)
    .reduce((a, b) => Math.max(a, b), 0) || null;
  const aqi = co2 == null ? { label: '—', color: '#5f6c87', score: '—', off: 276 }
    : co2 <= 600 ? { label: 'EXCELLENT', color: 'var(--o-ok)', score: 4, off: 0 }
      : co2 <= 800 ? { label: tr('BON'), color: 'var(--o-ok)', score: 3, off: 69 }
        : co2 <= 1200 ? { label: tr('MOYEN'), color: 'var(--o-warn2)', score: 2, off: 138 }
          : { label: 'MAUVAIS', color: '#ff6b6b', score: 1, off: 207 };
  const airTitle = aqi.score === 4 ? 'Air sain dans la maison' : aqi.score === 3 ? 'Air correct' : aqi.score === 2 ? 'Pensez à aérer' : aqi.score === 1 ? 'Aérez la maison' : 'Qualité de l\'air';
  const wEnt = S && S[weatherEntity({ states: S })];
  const outTemp = wEnt && wEnt.attributes && wEnt.attributes.temperature != null ? wEnt.attributes.temperature : null;
  const outLabel = wEnt ? haWeatherLabel(wEnt.state) : null;
  const tPos = airTemp == null ? 0.5 : Math.max(0.04, Math.min(0.96, (airTemp - 15) / 13));
  const tCat = airTemp == null ? { l: '—', c: '#5f6c87' } : airTemp < 19 ? { l: 'Un peu frais', c: 'var(--o-cyan)' } : airTemp <= 23 ? { l: tr('Confort'), c: 'var(--o-ok)' } : { l: 'Chaud', c: '#ff8a4c' };
  const hPos = airHum == null ? 0.5 : Math.max(0.04, Math.min(0.96, (airHum - 20) / 60));
  const hCat = airHum == null ? { l: '—', c: '#5f6c87' } : airHum < 40 ? { l: 'Trop sec', c: '#ffb347' } : airHum <= 60 ? { l: tr('Confort'), c: 'var(--o-ok)' } : { l: tr('À surveiller'), c: '#ffb347' };
  const fmt1 = (v) => v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1);
  const ZONE_LABEL = { poele: 'Séjour', chambre: 'Chambre', enfant: 'Chambre enfant' };
  const bars = CL_TEMPS.map((v, i) => {
    const lo = 16, hi = 22, now = 23;
    const h = Math.max(8, ((v - lo) / (hi - lo)) * 100);
    const cur = i === now;
    return { height: h + '%', background: cur ? 'linear-gradient(180deg,#ffb347,#ff8a4c)' : 'linear-gradient(180deg,rgba(255,138,76,.55),rgba(255,138,76,.16))', boxShadow: cur ? '0 0 10px rgba(255,138,76,.6)' : 'none' };
  });

  // ── Zone sélectionnée → dial Nest ──
  // Deux valeurs distinctes : `zone` dit s'il existe VRAIMENT une zone (elle
  // commande l'affichage), `t` porte un repli neutre pour que les calculs qui
  // suivent ne lisent jamais `undefined`. Sur une liste vide — la decouverte
  // n'a pas encore repondu — la vue entiere plantait.
  const zone = thermos.find(x => x.id === selZone) || thermos[0] || null;
  const t = zone || { id: null, name: '—', mode: 'off', type: '', target: 19, current: null, auto: false };
  const off = t.mode === 'off';
  const isEco = t.mode === 'eco';
  const dis = t.type === 'pilot_wire' && t.auto;            // planning auto → dial verrouillé
  const tClamp = Math.max(T_MIN, Math.min(T_MAX, t.target));
  const pct = off ? 0 : Math.max(0, Math.min(1, (tClamp - T_MIN) / T_SPAN));
  const curA = 135 + pct * 270;
  const knob = cl_polC(curA, 54);
  const heating = !off && t.target > t.current + 0.1;
  const stateLabel = off ? 'ÉTEINT' : heating ? 'CHAUFFE' : (isEco ? 'ÉCO' : tr('CONFORT'));
  const NT = 40;
  const ticks = Array.from({ length: NT + 1 }, (_, i) => { const frac = i / NT, a = 135 + frac * 270; return { a, on: !off && frac <= pct + 0.001, o: cl_polC(a, 57), inn: cl_polC(a, 50) }; });
  const cycleMode = () => {
    if (!CL_OPTIONS.length) return;
    const idx = CL_OPTIONS.indexOf(t.modeBrut);
    setMode(selZone, CL_OPTIONS[(idx + 1) % CL_OPTIONS.length]);
  };
  const tFmt = (v) => (Math.round(v * 2) / 2).toFixed(v % 1 === 0 ? 0 : 1);
  // styles
  const MODE_GRAD = 'linear-gradient(150deg,#8b6dff,#e0457b)';
  const navBtn = (en = true) => ({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1, background: 'none', border: 'none', cursor: en ? 'pointer' : 'default', padding: 0, opacity: en ? 1 : .4 });
  const navCircle = (active, grad) => ({ width: 54, height: 54, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? grad : 'var(--o-surfA)', border: '1px solid ' + (active ? 'transparent' : 'var(--o-bd2)'), boxShadow: active ? '0 8px 20px rgba(124,92,255,.4)' : '0 4px 12px rgba(0,0,0,.16), inset 0 1px 1px var(--o-s1)', color: active ? '#fff' : 'var(--o-text2)', transition: 'all .2s' });
  const navLabel = (active) => ({ fontSize: 11, fontWeight: 700, letterSpacing: '.03em', color: active ? 'var(--o-text)' : 'var(--o-text3)' });
  // Agencement des zones : les zones configurees d'abord, puis les thermostats
  // que Home Assistant expose et qu'aucune zone ne couvre deja.
  const zonesHaids = climateZones(S).map(z => z.haid).filter(Boolean);
  const climDerived = useMemo(() => [
    ...climateZones(S).map(z => 'zone:' + z.id),
    ...Object.keys(S).filter(k => k.indexOf('climate.') === 0 && zonesHaids.indexOf(k) < 0).sort(),
  ], [sig, zonesHaids.join('|'), Object.keys(S).length]);
  const ed = useLayoutEditor('loggia_climlayout', 'climat', climDerived);
  const dc = useDomainCards(hass);
  const [cardEdit, setCardEdit] = useState(null);
  const [addSheet, setAddSheet] = useState(false);
  const zoneDe = (k) => k.indexOf('zone:') === 0 ? climateZones(S).find(z => z.id === k.slice(5)) : null;
  const climOrigine = (k) => {
    if (k.indexOf('sect:') === 0) return k.slice(5) || tr('Section');
    const z = zoneDe(k);
    if (z) return z.name || k.slice(5);
    const st = S && S[k];
    return (st && st.attributes && st.attributes.friendly_name) || k;
  };
  const climNom = (k) => ed.labelOf(k) || climOrigine(k);
  const addSection = () => ed.toggle('sect:' + Date.now().toString(36));
  const [panel, setPanel] = useState(() => { try { return localStorage.getItem('loggia-climpanel') !== '0'; } catch (e) { return true; } });
  const togglePanel = () => setPanel(v => { const nv = !v; try { localStorage.setItem('loggia-climpanel', nv ? '1' : '0'); } catch (e) {} return nv; });
  const climBlocs = [];
  ed.ids.forEach(k => {
    if (k.indexOf('sect:') === 0) climBlocs.push({ titre: k, cartes: [] });
    else {
      if (!climBlocs.length) climBlocs.push({ titre: null, cartes: [] });
      climBlocs[climBlocs.length - 1].cartes.push(k);
    }
  });

  const climCard = { flex: 1, background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,22px)', padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 11, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.15))' };
  const svgHeat = <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 14.5c2.2-2 2.2-3.5 0-5.5s-2.2-3.5 0-5.5" /><path d="M12 14.5c2.2-2 2.2-3.5 0-5.5s-2.2-3.5 0-5.5" /><path d="M17 14.5c2.2-2 2.2-3.5 0-5.5s-2.2-3.5 0-5.5" /></svg>;
  const svgLeaf = (sz) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z" /><path d="M2 21c0-3 1.85-5.4 5.1-6" /></svg>;
  const svgCal = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="3" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></svg>;
  const svgHist = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7.5v5l3.5 2" /></svg>;
  const svgChev = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: devOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><path d="M6 9l6 6 6-6" /></svg>;
  // 4 boutons de mode (confort/éco/hors-gel/off)
  /* La barre de modes suit l'entite, pas une liste ecrite d'avance. Un poele
   * est un vrai `climate` : ses modes restent ceux du domaine. */
  const zoneSel = zoneOf(selZone);
  const CL_OPTIONS = zoneModes(S, zoneSel);
  const CL_TEINTE = { confort: '#ff8a4c', eco: 'var(--o-ok)', horsgel: 'var(--o-accent-soft)', off: 'var(--o-text3)' };
  const modeBtn = (on, c, d) => ({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1, padding: '11px 4px', borderRadius: 13, border: '1px solid ' + (on ? c + '66' : 'var(--o-bd3)'), fontWeight: 700, fontSize: 11.5, cursor: d ? 'default' : 'pointer', transition: 'all .2s', background: on ? hx(c, .16) : 'var(--o-s2)', color: on ? c : 'var(--o-text2)', boxShadow: on ? '0 4px 14px ' + hx(c, .25) : 'none', opacity: d ? .45 : 1 });
  const topBtn = (on, c) => ({ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 10px', borderRadius: 13, border: '1px solid ' + (on ? c + '66' : 'var(--o-bd2)'), background: on ? hx(c, .16) : 'var(--o-surfA)', color: on ? c : 'var(--o-text1)', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all .2s' });

  return (
    <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      {edit && <ViewEditBar onEnt={onEnt} texte={tr('Mode édition : clique une zone pour la modifier, glisse-la pour la déplacer.')} />}
      <ViewHead titre={tr('Climat')}
        sous={(thermos.length > 1 ? tr('{n} zones', { n: thermos.length }) : tr('{n} zone', { n: thermos.length })) + (zone ? ' · ' + t.name + (t.current != null ? ' à ' + String(t.current).replace('.', ',') + ' °C' : '') : '')}
        badge={zone ? (t.mode === 'off' ? tr('à l’arrêt') : tr(t.mode)) : tr('aucune zone')}
        rgb={zone && t.mode === 'confort' ? '255,138,76' : zone && t.mode === 'eco' ? '52,211,153' : '140,152,180'} />

      {zone && (
        <ViewBar panel={panel} onPanel={togglePanel}>
          <BarGroup label="Consigne" sous={t.name}>
            <button onClick={() => dec(t.id)} style={barBtn(false)}>−</button>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: '#ff8a4c', minWidth: 52, textAlign: 'center' }}>{String(t.target).replace('.', ',')} °C</span>
            <button onClick={() => inc(t.id)} style={barBtn(false)}>+</button>
          </BarGroup>
          <BarGroup label={tr('Mode')}>
            {CL_OPTIONS.map(opt => (
              <button key={opt} onClick={() => setMode(t.id, opt)} style={barBtn(t.modeBrut === opt)}>{zoneModeLabel(zone, opt)}</button>
            ))}
          </BarGroup>
          {thermos.length > 1 && (
            <BarGroup label={tr('Zone')}>
              {thermos.map(z => <button key={z.id} onClick={() => setSelZone(z.id)} style={barBtn(z.id === t.id)}>{z.name}</button>)}
            </BarGroup>
          )}
        </ViewBar>
      )}

      {panel && zone && (
        <PresCard titre={t.name} lead={tr('Réglage détaillé en cliquant la carte de la zone')}
          badge={t.mode === 'off' ? tr('à l’arrêt') : tr(t.mode)}
          rgb={t.mode === 'confort' ? '255,138,76' : t.mode === 'eco' ? '52,211,153' : '140,152,180'}>
          {t.current != null && (
            <PresLigne titre="Température actuelle"
              sous={t.target != null ? tr('Écart de') + ' ' + String(Math.round(Math.abs(t.current - t.target) * 10) / 10).replace('.', ',') + ' °C ' + tr('avec la consigne') : tr('Relevé de la zone')}
              valeur={String(t.current).replace('.', ',') + ' °C'} couleur="var(--o-accent-soft)" />
          )}
          {t.target != null && <PresLigne titre="Consigne" sous={tr('Réglable dans la barre ci-dessus')} valeur={String(t.target).replace('.', ',') + ' °C'} couleur="#ff8a4c" />}
          {airTemp != null && (
            <PresLigne titre="Confort thermique" sous={'Idéal entre 20 et 22 °C' + (airRoom.room ? ' · ' + airRoom.room : '')}
              valeur={fmt1(airTemp) + ' °C · ' + tCat.l} couleur={tCat.c}
              barre={<JaugeGrad pct={(airTemp - 15) * 100 / 13} grad="linear-gradient(90deg,var(--o-cyan) 0%,var(--o-ok) 35%,var(--o-ok) 65%,#ff8a4c 100%)" />} />
          )}
          {airHum != null && (
            <PresLigne titre={tr('Humidité')} sous={'Confortable entre 40 et 60 %' + (airRoom.room ? ' · ' + airRoom.room : '')}
              valeur={Math.round(airHum) + ' % · ' + hCat.l} couleur={hCat.c}
              barre={<JaugeGrad pct={(airHum - 20) * 100 / 60} grad="linear-gradient(90deg,#ff8a4c 0%,var(--o-ok) 35%,var(--o-ok) 65%,var(--o-cyan) 100%)" />} />
          )}
          {thermos.length > 1 && (
            <PresLigne titre={tr('Autres zones')} sous={thermos.filter(z => z.id !== t.id).map(z => z.name).join(', ')} valeur={tr('{n} zones', { n: thermos.length })} />
          )}
        </PresCard>
      )}



      {/* Les cartes de confort ci-dessus restent : le user y tient. Les zones
          arrivent apres, ordonnables comme dans une piece. */}
      {edit && (
        <ViewEditBar
          texte={ed.edits ? 'Ces zones sont personnalisées.' : 'Ces zones suivent la détection automatique.'}>
          <button onClick={() => setAddSheet(true)} style={editBtn(true)}>{tr('Ajouter un thermostat')}</button>
          <button onClick={addSection} style={editBtn(false)}>{tr('Ajouter un titre')}</button>
          {ed.edits > 0 && <button onClick={ed.reset} style={editBtn(false)}>{tr("Rétablir l'automatique")}</button>}
        </ViewEditBar>
      )}
      {(edit || ed.ids.length > 0) && (
        <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>Zones</div>
      )}
      <div ref={ed.gridRef} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {climBlocs.map((bloc, bi) => {
          if (!edit && bloc.titre && !bloc.cartes.length) return null;
          return (
            <div key={bloc.titre || 'b' + bi} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {bloc.titre && (edit
                ? <EditableCard plat ed={ed} id={bloc.titre} nom={climNom(bloc.titre)} onEdit={setCardEdit}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 12px' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'var(--o-text3)' }}>{String(climNom(bloc.titre)).toUpperCase()}</span>
                      <span style={{ height: 1, flex: 1, background: 'var(--o-bd3)' }} />
                    </div>
                  </EditableCard>
                : <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '4px 0 0' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'var(--o-text3)' }}>{String(climNom(bloc.titre)).toUpperCase()}</span>
                    <span style={{ height: 1, flex: 1, background: 'var(--o-bd3)' }} />
                  </div>)}
              <div className="grid-roomdev" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(232px,1fr))', gap: 14 }}>
                {bloc.cartes.map(k => {
                  const zk = zoneDe(k);
                  const carte = (!zk && ed.typeOf(k)) ? <CvTyped x={{ t: ed.typeOf(k), id: k }} hass={hass} dc={dc} />
                    : (zk && ed.typeOf(k) === 'compacte' && estClimate(zk)) ? <CvCard id={zk.haid} hass={hass} label={ed.labelOf(k) || zk.name} onOpen={dc.ouvrir} dense />
                      : dc.card(k, ed.labelOf(k), zk);
                  if (!edit) return <Anim key={k} i={ed.ids.indexOf(k)} className={ed.estLarge(k) ? 'o-cvw2' : ''}>{carte}</Anim>;
                  return <EditableCard key={k} ed={ed} id={k} nom={climNom(k)} onEdit={setCardEdit}>{carte}</EditableCard>;
                })}
              </div>
            </div>
          );
        })}
      </div>
      {dc.sheets}
      {cardEdit && <CardEditSheet ed={ed} id={cardEdit} nom={climNom(cardEdit)} origine={climOrigine(cardEdit)} hass={hass} onClose={() => setCardEdit(null)} />}
      {addSheet && <RoomAddSheet hass={hass} present={ed.ids} onToggle={ed.toggle} entete={tr('Ajouter un thermostat')}
        domaines={['climate']} onClose={() => setAddSheet(false)} />}
    </div>
  );
}

function ClimatView({ hass, edit = false, onEnt }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <ClimatContent hass={hass} edit={edit} onEnt={onEnt} />
    </main>
  );
}

/* ════════════ VUE VOLETS (reproduction fidèle de "Loggia Volets.dc.html") ════════════ */
/* Les modes d'automatisme des volets sont LUS SUR L'ENTITE, comme ceux du
 * chauffage. Ils etaient ecrits en dur — « Manuel », « Auto lever/coucher »,
 * « Fermeture nuit » — soit les options de l'`input_select` d'une installation.
 *
 * L'icone et la description restent devinees sur le nom : elles n'ont aucune
 * incidence sur la commande, qui renvoie l'option telle quelle. Un mode non
 * reconnu s'affiche avec une icone neutre et sans sous-titre. */
const VOLET_ALLURE = [
  { motif: /manuel|manual|hand/i, icon: 'hand', color: 'var(--o-text2)', desc: 'Pilotage à la main' },
  { motif: /lever|coucher|soleil|sun|sonne/i, icon: 'sun', color: '#ffce73', desc: 'Suit lever / coucher' },
  { motif: /nuit|night|nacht|noche/i, icon: 'moon', color: 'var(--o-purple)', desc: 'Fermeture au crépuscule' },
];

function voletModes(S) {
  const id = voletMode();
  const st = S && id && S[id];
  const opts = st && st.attributes && st.attributes.options;
  if (!Array.isArray(opts)) return [];
  return opts.filter(o => typeof o === 'string' && o).map(o => {
    const a = VOLET_ALLURE.find(x => x.motif.test(o));
    return { id: o, label: o, desc: a ? tr(a.desc) : '', icon: a ? a.icon : 'sliders', color: a ? a.color : 'var(--o-text2)' };
  });
}
const voletKeys = () => [...voletCovers(null).map(c => c.haid), voletMode(), ...voletDays().map(d => d.haid)].filter(Boolean);
// Volets pilotés : configuration de l'utilisateur, sinon tout le domaine `cover`
// tel que la découverte l'a trouvé — les noms viennent de Home Assistant.
function voletCovers(S) {
  const c = loggiaEnt('covers', null);
  const list = (c && Array.isArray(c.list) && c.list.length) ? c.list : null;
  if (list) return list.filter(x => x && x.haid && (!S || S[x.haid]));
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.covers;
  if (r && r.available) return r.list.map(x => ({ id: x.id, name: x.name, haid: x.id }));
  return [];
}
// Aides propres à une installation (mode d'automatisme, planning des nuits).
// Absentes ⇒ la vue n'affiche pas les réglages correspondants.
function voletMode() { const c = loggiaEnt('covers', null); return (c && c.mode) || null; }
function voletDays() { const c = loggiaEnt('covers', null); return (c && Array.isArray(c.days) && c.days.length) ? c.days : []; }

function VoletsContent({ hass, edit = false, onEnt }) {
  const S = (hass && hass.states) || null;
  const derivedCovers = voletCovers(S).map(c => { const e = S && S[c.haid]; const a = e && e.attributes; const pos = a && a.current_position; return { ...c, pos: pos != null ? pos : (e && e.state === 'open' ? 100 : e && e.state === 'closed' ? 0 : 50) }; });
  const [covers, setCovers] = useState(derivedCovers);
  const csig = derivedCovers.map(c => c.id + ':' + c.pos).join('|');
  useEffect(() => { setCovers(derivedCovers); }, [csig]);
  // Meme raison qu'au volet isole : aucun mode invente.
  const haMode = (S && S[voletMode()] && S[voletMode()].state) || null;
  const [mode, setModeLocal] = useState(haMode);
  useEffect(() => { setModeLocal(haMode); }, [haMode]);
  const dayOn = (haid) => { const e = S && S[haid]; return e ? e.state === 'on' : false; };
  const dsig = voletDays().map(d => dayOn(d.haid) ? 1 : 0).join('');
  const [days, setDays] = useState(() => Object.fromEntries(voletDays().map(d => [d.k, dayOn(d.haid)])));
  useEffect(() => { setDays(Object.fromEntries(voletDays().map(d => [d.k, dayOn(d.haid)]))); }, [dsig]);

  // Agencement : la découverte propose, l'utilisateur dispose.
  const derivedX = useMemo(() => {
    const dejaLa = voletCovers(S).map(c => c.haid).filter(Boolean);
    return [...dejaLa, ...Object.keys(S).filter(k => k.indexOf('cover.') === 0 && dejaLa.indexOf(k) < 0).sort()];
  }, [Object.keys(S).length, csig]);
  const ed = useLayoutEditor('loggia_coverlayout', 'volets', derivedX);
  // La feuille du volet porte la programmation nocturne — la vue n'a pas a la
  // repeter en pleine largeur. Mais elle ne vaut que pour les chambres : le
  // Sejour n'a que le mode automatique.
  const dc = useDomainCards(hass);
  const [cardEdit, setCardEdit] = useState(null);
  const [addSheet, setAddSheet] = useState(false);
  const origineDe = (k) => {
    if (k.indexOf('sect:') === 0) return k.slice(5) || tr('Section');
    const st = hass && hass.states && hass.states[k];
    return (st && st.attributes && st.attributes.friendly_name) || k;
  };
  const nomDe = (k) => ed.labelOf(k) || origineDe(k);
  const addSection = () => ed.toggle('sect:' + Date.now().toString(36));
  const blocs = [];
  ed.ids.forEach(k => {
    if (k.indexOf('sect:') === 0) blocs.push({ titre: k, cartes: [] });
    else {
      if (!blocs.length) blocs.push({ titre: null, cartes: [] });
      blocs[blocs.length - 1].cartes.push(k);
    }
  });

  const [panel, setPanel] = useState(() => { try { return localStorage.getItem('loggia-volpanel') !== '0'; } catch (e) { return true; } });
  const togglePanel = () => setPanel(v => { const nv = !v; try { localStorage.setItem('loggia-volpanel', nv ? '1' : '0'); } catch (e) {} return nv; });
  const call = (d, s, data) => { try { if (hass && hass.callService) hass.callService(d, s, data || {}); } catch (e) {} };
  const haidOf = (id) => (voletCovers(S).find(c => c.id === id) || {}).haid;
  const upCover = (id, pos) => setCovers(cs => cs.map(c => c.id === id ? { ...c, pos: Math.max(0, Math.min(100, Math.round(pos))) } : c));
  const commitPos = (id, pos) => { pos = Math.max(0, Math.min(100, Math.round(pos))); upCover(id, pos); commander(hass, haidOf(id), 'set_position', pos); };
  const coverOpen = (id) => { upCover(id, 100); commander(hass, haidOf(id), 'open'); };
  const coverClose = (id) => { upCover(id, 0); commander(hass, haidOf(id), 'close'); };
  const coverStop = (id) => { commander(hass, haidOf(id), 'stop'); };
  const allOpen = () => { setCovers(cs => cs.map(c => ({ ...c, pos: 100 }))); call('cover', 'open_cover', { entity_id: voletCovers(S).map(c => c.haid) }); };
  const allClose = () => { setCovers(cs => cs.map(c => ({ ...c, pos: 0 }))); call('cover', 'close_cover', { entity_id: voletCovers(S).map(c => c.haid) }); };
  const pickMode = (m) => { setModeLocal(m); call('input_select', 'select_option', { entity_id: voletMode(), option: m }); };
  const toggleDay = (d) => { const on = !days[d.k]; setDays(dd => ({ ...dd, [d.k]: on })); call('input_boolean', on ? 'turn_on' : 'turn_off', { entity_id: d.haid }); };
  const drag = (id, e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const calc = x => Math.max(0, Math.min(100, Math.round((x - rect.left) / rect.width * 100)));
    let v = calc(e.clientX); upCover(id, v);
    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch (x) {}
    const end = () => { el.onpointermove = null; el.onpointerup = null; el.onpointercancel = null; };
    el.onpointermove = ev => { v = calc(ev.clientX); upCover(id, v); };
    el.onpointerup = () => { commitPos(id, v); end(); };
    el.onpointercancel = end;
  };

  const openCount = covers.filter(c => c.pos > 0).length;
  const stateOf = p => p === 0 ? tr('Fermé') : p === 100 ? tr('Ouvert') : 'Entrouvert';
  /* Le planning tourne des que le mode n'est pas le pilotage a la main. Ce
   * mot-la vient de l'installation : « Manuel », « Manual », « Manuell »… on le
   * reconnait au motif, pas a une valeur exacte. */
  const schedActive = !!mode && !/manuel|manual|hand/i.test(mode);
  const activeNights = voletDays().filter(d => days[d.k]).length;
  const sun = S && S['sun.sun'];
  const fmtT = (iso) => { if (!iso) return '—'; try { return new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); } catch (e) { return '—'; } };
  const nextClose = sun && sun.attributes ? fmtT(sun.attributes.next_setting) : '—';
  const nextOpen = sun && sun.attributes ? fmtT(sun.attributes.next_rising) : '—';
  const openBtn = active => ({ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 11, borderRadius: 11, border: '1px solid ' + (active ? 'rgba(52,211,153,.3)' : 'var(--o-bd1)'), cursor: 'pointer', background: active ? 'rgba(52,211,153,.14)' : 'var(--o-s1)', color: active ? 'var(--o-ok)' : 'var(--o-text1)' });
  const closeBtn = active => ({ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 11, borderRadius: 11, border: '1px solid ' + (active ? 'rgba(var(--o-accent-rgb),.3)' : 'var(--o-bd1)'), cursor: 'pointer', background: active ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s1)', color: active ? 'var(--o-accent-soft)' : 'var(--o-text1)' });
  const modeBtn = (on, col) => { const isHex = col.startsWith('#'); const rgb = isHex ? cl_hexRgb(col) : '140,152,180'; return { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', borderRadius: 14, border: '1px solid ' + (on && isHex ? col + '55' : 'var(--o-bd3)'), cursor: 'pointer', transition: 'all .2s', textAlign: 'left', background: on ? `rgba(${rgb},.14)` : 'var(--o-s2)', color: on ? col : 'var(--o-text1)' }; };

  return (
    <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {edit && <ViewEditBar onEnt={onEnt} texte={tr('Mode édition : clique un volet pour le modifier, glisse-le pour le déplacer.')} />}
      <ViewHead titre={tr('Volets')}
        sous={(covers.length > 1 ? tr('{n} volets', { n: covers.length }) : tr('{n} volet', { n: covers.length })) + (mode ? ' · ' + String(mode).toLowerCase() : '')}
        badge={openCount ? (openCount > 1 ? tr('{n} ouverts', { n: openCount }) : tr('{n} ouvert', { n: openCount })) : tr('tous fermés')}
        rgb={openCount ? '52,211,153' : '140,152,180'} />

      <ViewBar panel={panel} onPanel={togglePanel}>
        <BarGroup label={tr('Volets')}>
          <button onClick={allOpen} style={barBtn(false)}>{tr('Ouvrir')}</button>
          <button onClick={() => { const ids = voletCovers(S).map(c => c.haid).filter(Boolean); if (ids.length) call('cover', 'stop_cover', { entity_id: ids }); }} style={barBtn(false)}>{tr('Stop')}</button>
          <button onClick={allClose} style={barBtn(false)}>{tr('Fermer')}</button>
        </BarGroup>
        {voletModes(S).length > 0 && voletMode() && (
          <BarGroup label={tr('Mode')}>
            {voletModes(S).map(m => <button key={m.id} onClick={() => pickMode(m.id)} style={barBtn(mode === m.id)}>{m.label}</button>)}
          </BarGroup>
        )}
      </ViewBar>

      {panel && <PresCard titre="Tous les volets" lead={tr('Vue d’ensemble de la position et du pilotage')}
        badge={openCount > 1 ? tr('{n} ouverts', { n: openCount }) : tr('{n} ouvert', { n: openCount })} rgb="52,211,153">
        <PresLigne titre={tr('Position moyenne')} sous={covers.length > 1 ? tr('{n} volets suivis', { n: covers.length }) : tr('{n} volet suivi', { n: covers.length })}
          valeur={Math.round(covers.reduce((n, c) => n + (c.pos || 0), 0) / Math.max(1, covers.length)) + ' %'}
          part={Math.round(covers.reduce((n, c) => n + (c.pos || 0), 0) / Math.max(1, covers.length))} couleur="var(--o-accent)" />
        {mode && <PresLigne titre={tr('Mode')} sous={(voletModes(S).find(m => m.id === mode) || {}).desc || tr('Pilotage courant')} valeur={mode} couleur="var(--o-accent-soft)" />}
      </PresCard>}


      {edit && (
        <ViewEditBar onEnt={onEnt}
          texte={'Mode édition : clique une carte pour la modifier, glisse-la pour la déplacer.'
            + (ed.edits ? ' Cette vue est personnalisée.' : ' Cette vue suit la détection automatique.')}>
          <button onClick={() => setAddSheet(true)} style={editBtn(true)}>{tr('Ajouter un volet')}</button>
          <button onClick={addSection} style={editBtn(false)}>{tr('Ajouter un titre')}</button>
          {ed.edits > 0 && <button onClick={ed.reset} style={editBtn(false)}>{tr("Rétablir l'automatique")}</button>}
        </ViewEditBar>
      )}
      {(edit || ed.ids.length > 0) && (
        <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{tr('Volet par volet')}</div>
      )}
      <div ref={ed.gridRef} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {blocs.map((bloc, bi) => {
          if (!edit && bloc.titre && !bloc.cartes.length) return null;
          return (
            <div key={bloc.titre || 'b' + bi} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {bloc.titre && (edit
                ? <EditableCard plat ed={ed} id={bloc.titre} nom={nomDe(bloc.titre)} onEdit={setCardEdit}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 12px' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'var(--o-text3)' }}>{String(nomDe(bloc.titre)).toUpperCase()}</span>
                      <span style={{ height: 1, flex: 1, background: 'var(--o-bd3)' }} />
                    </div>
                  </EditableCard>
                : <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '4px 0 0' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'var(--o-text3)' }}>{String(nomDe(bloc.titre)).toUpperCase()}</span>
                    <span style={{ height: 1, flex: 1, background: 'var(--o-bd3)' }} />
                  </div>)}
              <div className="grid-roomdev" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(232px,1fr))', gap: 14 }}>
                {bloc.cartes.map(k => {
                  const carte = ed.typeOf(k) ? <CvTyped x={{ t: ed.typeOf(k), id: k }} hass={hass} dc={dc} /> : dc.card(k, ed.labelOf(k));
                  if (!edit) return <Anim key={k} i={ed.ids.indexOf(k)} className={ed.estLarge(k) ? 'o-cvw2' : ''}>{carte}</Anim>;
                  return <EditableCard key={k} ed={ed} id={k} nom={nomDe(k)} onEdit={setCardEdit}>{carte}</EditableCard>;
                })}
              </div>
            </div>
          );
        })}
      </div>
      {dc.sheets}
      {cardEdit && <CardEditSheet ed={ed} id={cardEdit} nom={nomDe(cardEdit)} origine={origineDe(cardEdit)} hass={hass} onClose={() => setCardEdit(null)} />}
      {addSheet && <RoomAddSheet hass={hass} present={ed.ids} onToggle={ed.toggle} entete={tr('Ajouter un volet')}
        domaines={['cover']} onClose={() => setAddSheet(false)} />}
    </div>
  );
}

function VoletsView({ hass, edit = false, onEnt }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <VoletsContent hass={hass} edit={edit} onEnt={onEnt} />
    </main>
  );
}

/* ── Schéma maison + flux d'énergie animé (porté de Loggia V1) ── */
// Flèche directionnelle colorée (rendue dans <defs>, posée au bout du câble via markerStart/End)
const FluxArrow = ({ id, color }) => (
  <marker id={id} viewBox="0 0 12 12" refX="7" refY="6" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse" overflow="visible">
    <path d="M2.5 2.5 L9 6 L2.5 9.5" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </marker>
);

/* Câble de flux (réf vidéo) : conduit gris + câble énergisé tamisé + charge lumineuse qui circule + flèche au bout */
const FlowCable = ({ d, color, power, reverse, arrow }) => {
  if (!(power > 5)) return null;
  const dur = Math.max(0.7, 3 - Math.min(power, 5000) / 1900);
  return (
    <g>
      {/* conduit gris (statique) */}
      <path d={d} fill="none" stroke="rgba(223,230,247,.16)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {/* câble énergisé, tamisé (cable toujours "allumé") */}
      <path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .34, filter: `drop-shadow(0 0 4px ${color})` }} />
      {/* charge qui circule + flèche directionnelle (départ si import, arrivée sinon) */}
      <path d={d} fill="none" stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="30 90"
        markerStart={arrow && reverse ? `url(#${arrow})` : undefined}
        markerEnd={arrow && !reverse ? `url(#${arrow})` : undefined}
        style={{ filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 2px ${color})`, animation: `loggia-energy-flow ${dur}s linear infinite${reverse ? ' reverse' : ''}`, willChange: 'stroke-dashoffset' }} />
    </g>
  );
};

/**
 * Pastille du schema maison.
 *
 * Celles de l'arc solaire vivent dans un repere 600x250, celui-ci fait 960x720 :
 * a conteneur egal, une meme cote y parait ~2,6 fois plus petite. Le facteur
 * remet les deux familles a la meme taille apparente.
 */
const CHIP_K = 2.6;
const HouseChip = ({ x, y, color, txt, glyph }) => {
  const k = CHIP_K, w = (22 + txt.length * 6.4 + 12) * k;
  return (
    <g transform={`translate(${x - w / 2} ${y - 11 * k})`}>
      <rect width={w} height={22 * k} rx={11 * k} fill="rgba(8,13,22,.9)" stroke={color} strokeWidth={1.6 * k} />
      <g transform={`translate(${13 * k} ${11 * k}) scale(${k})`}>{glyph}</g>
      <text x={(w + 22 * k) / 2 - k} y={15 * k} textAnchor="middle" fontSize={11 * k} fontWeight="800" fill="#eaf0fb" fontFamily="var(--o-font)">{txt}</text>
    </g>
  );
};
// Traces en ligne comme CHIP_ICONS : la police UICons ne s'insere pas dans un <svg>.
const CHIP_BAT = (c) => (
  <g>
    <rect x="-5.5" y="-3.4" width="10" height="6.8" rx="1.8" fill="none" stroke={c} strokeWidth="1.3" />
    <path d="M 5.4 -1.4 L 7 -1.4 L 7 1.4 L 5.4 1.4" fill="none" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M 0.8 -2.2 L -1.6 0.2 L 0.2 0.2 L -0.8 2.2 L 1.6 -0.2 L -0.2 -0.2 Z" fill={c} />
  </g>
);
const CHIP_CAR = (c) => (
  <g>
    <path d="M -6 1 L -6 -0.6 L -4.3 -3.2 L 4.3 -3.2 L 6 -0.6 L 6 1 Z" fill={c} />
    <circle cx="-3.4" cy="2.4" r="1.5" fill={c} />
    <circle cx="3.4" cy="2.4" r="1.5" fill={c} />
  </g>
);

function EnergyHouseSchema({ solarW = 47, homeW = 907, surplusW = 954, evW = 0, evBranche = false, batW = 0, batSoc = null, batPresente = false }) {
  const netGridW = surplusW > 0 ? -surplusW : (homeW - solarW);
  const gridImporting = netGridW > 0, gridExporting = netGridW < 0, gridFlowW = Math.abs(netGridW);
  // Palette calquée sur la vidéo de réf : solaire=jaune, maison=rose, réseau=violet.
  const C = { solar: '#fbbf24', home: '#ec4899', grid: '#a855f7', ev: '#38bdf8', bat: '#4ade80' };
  // Une batterie se charge ET se decharge. Le trace va de la batterie vers le
  // montant : direct = decharge, inverse = charge.
  const batCharge = batW > 0, batFlowW = Math.abs(batW || 0);
  // Pas de signe moins — le user l'a rejete sur l'import reseau, une fleche dit
  // le sens sans laisser croire a une valeur negative.
  const fmtChipW = (v) => (v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + ' kW' : Math.round(v) + ' W');
  const batTxt = (() => {
    const bouts = [];
    if (batSoc != null) bouts.push(batSoc + ' %');
    if (batW != null) bouts.push(batFlowW > 5 ? (batCharge ? '↓ ' : '↑ ') + fmtChipW(batFlowW) : '0 W');
    return bouts.length ? bouts.join(' · ') : '—';
  })();
  const layer = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', userSelect: 'none' };
  return (
    <div className="o-en-house" style={{ position: 'absolute', top: 0, height: '100%', left: '50%', transform: 'translateX(-50%)', aspectRatio: '960 / 720' }}>
      <img src={energyHomeImg} alt="" draggable={false} style={layer} />
      <img src={energySolarImg} alt="" draggable={false} style={layer} />
      {evBranche && <img src={energyEvImg} alt="" draggable={false} style={layer} />}
      {batPresente && <img src={energyBatImg} alt="" draggable={false} style={layer} />}
      <svg viewBox="0 0 960 720" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <FluxArrow id="flux-solar" color={C.solar} />
          <FluxArrow id="flux-home" color={C.home} />
          <FluxArrow id="flux-grid" color={C.grid} />
          <FluxArrow id="flux-ev" color={C.ev} />
          <FluxArrow id="flux-bat" color={C.bat} />
        </defs>
        {solarW > 5 && <FlowCable color={C.solar} power={solarW} arrow="flux-solar" d="M 623 270 L 653 280 L 653 440" />}
        {(homeW > 2 || solarW > 5) && <FlowCable color={C.home} power={Math.max(homeW, 350)} arrow="flux-home" d="M 670 453 L 702 447 L 695 440" />}
        {gridFlowW > 5 && <FlowCable color={C.grid} power={gridFlowW} reverse={gridImporting} arrow="flux-grid" d="M 655 475 L 655 535 L 745 570 L 920 540" />}
        {evBranche && evW > 5 && <FlowCable color={C.ev} power={evW} arrow="flux-ev" d="M 648 477 L 648 532 L 643 538 L 520 560 L 510 560 L 373 508 L 373 462" />}
        {batPresente && <FlowCable color={C.bat} power={batFlowW} reverse={batCharge} arrow="flux-bat" d="M 610 464 L 641 458" />}
        {batPresente && <HouseChip x={585} y={410} color={C.bat} txt={batTxt} glyph={CHIP_BAT(C.bat)} />}
        {evBranche && <HouseChip x={300} y={410} color={C.ev} txt={evW != null ? fmtChipW(evW) : '—'} glyph={CHIP_CAR(C.ev)} />}
      </svg>
    </div>
  );
}

/* ════════════ VUE ÉNERGIE (package energie.yaml v3 + arc solaire type Helios) ════════════ */
const enKeys = () => [...Object.values(enHaids()), ...enDevices(null).flatMap(d => [d.power, d.kwh])].filter(Boolean);
const EN_ART = ['pc', 'nas', 'radiator', 'dishwasher'];
const EN_LOOK = [['briefcase', 'var(--o-cyan)'], ['microchip', 'var(--o-purple)'], ['thermometer-half', '#ff8a4c'], ['utensils', 'var(--o-accent-soft)'], ['bolt', '#f472b6']]; // 'plug' n'existe pas dans la fonte UICons
function enDevices(S) {
  const cfg = loggiaEnt('energyDevices', null);
  if (Array.isArray(cfg) && cfg.length) return cfg.filter(d => d && (!S || S[d.power] || S[d.kwh]));
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.energy;
  const list = (r && r.available && r.devices && r.devices.length) ? r.devices : null;
  if (list) return list.map((d, i) => ({
    name: d.name, power: d.power, kwh: d.kwh, art: EN_ART[i % EN_ART.length],
    icon: EN_LOOK[i % EN_LOOK.length][0], c: EN_LOOK[i % EN_LOOK.length][1],
  }));
  return [];
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
  const hm = (h) => { const hh = Math.floor(((h % 24) + 24) % 24); const mm = Math.round((h - Math.floor(h)) * 60); return String(hh).padStart(2, '0') + ':' + String(mm % 60).padStart(2, '0'); };
  return { sunrise, sunset, noon, elevation, t, day: nowH >= sunrise && nowH <= sunset, sunriseHM: hm(sunrise), sunsetHM: hm(sunset) };
}
// Scène type Helios au-dessus du schéma maison : grand arc du jour (segment parcouru brillant),
// soleil à l'heure réelle + chip irradiance, chips solaire/réseau/maison/appareils, lever/coucher.
// Heure « solaire équivalente » pour le fond météo GLSL : 6-18 = lever→coucher réels (NOAA), nuit mappée 18→30.
function wxHourEq() {
  try {
    const si = sunInfo(); const d = new Date(); const nowH = d.getHours() + d.getMinutes() / 60;
    if (si.day) return 6 + 12 * si.t;
    const nightLen = Math.max(0.1, (24 - si.sunset) + si.sunrise);
    const tn = nowH >= si.sunset ? (nowH - si.sunset) / nightLen : (nowH + 24 - si.sunset) / nightLen;
    return (18 + 12 * Math.min(1, Math.max(0, tn))) % 24;
  } catch (e) { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
}
function SunArc({ solarW = 0, gridW = 0, exportW = 0, homeW = 0, appW = null }) {
  const [, tick] = useState(0);
  useEffect(() => { const iv = setInterval(() => tick(n => n + 1), 60000); return () => clearInterval(iv); }, []);
  const s = sunInfo();
  // Sans position déclarée dans Home Assistant, la course du soleil n'a pas de
  // sens : mieux vaut ne rien dessiner qu'un arc faux.
  if (!s) return null;
  // Bézier quadratique dans un espace 600×250 : lever (70,235) → contrôle (300,-140) → coucher (540,205)
  const P0 = [70, 235], C = [300, -140], P2 = [540, 205];
  const at = (t) => { const mt = 1 - t; return [mt * mt * P0[0] + 2 * mt * t * C[0] + t * t * P2[0], mt * mt * P0[1] + 2 * mt * t * C[1] + t * t * P2[1]]; };
  const t = s.t;
  const [sx, sy] = at(t);
  // sous-courbe 0→t (subdivision de De Casteljau)
  const Ct = [P0[0] + (C[0] - P0[0]) * t, P0[1] + (C[1] - P0[1]) * t];
  const day = s.day;
  const rad = Math.PI / 180;
  const irr = day ? Math.max(0, Math.round(1090 * Math.pow(Math.max(0, Math.sin(s.elevation * rad)), 1.15))) : 0; // irradiance ciel clair estimée
  const fmtKW = (w) => Math.abs(w) >= 995 ? (w / 1000).toFixed(1).replace('.', ',') + ' kW' : Math.round(w) + ' W';
  // Chip SVG façon Helios : icône mini + texte (soleil/panneau/maison/pylône)
  const CHIP_ICONS = {
    sun: (c) => <g stroke={c} strokeWidth="1.2" fill="none"><circle cx="0" cy="0" r="2.6" fill={c} stroke="none" />{[0, 60, 120, 180, 240, 300].map(a => <line key={a} x1={4 * Math.cos(a * rad)} y1={4 * Math.sin(a * rad)} x2={5.8 * Math.cos(a * rad)} y2={5.8 * Math.sin(a * rad)} />)}</g>,
    panel: (c) => <path d="M 1.5 -5.5 L -3.5 0.5 L -0.5 0.5 L -1.5 5.5 L 3.5 -0.5 L 0.5 -0.5 Z" fill={c} />,
    house: (c) => <path d="M -5 0.5 L 0 -4.5 L 5 0.5 L 3.6 0.5 L 3.6 5 L -3.6 5 L -3.6 0.5 Z" fill={c} />,
    pylon: (c) => <g stroke={c} strokeWidth="1.3" fill="none"><path d="M -3.5 5.5 L -1 -5 L 1 -5 L 3.5 5.5" /><line x1="-4.8" y1="-2.6" x2="4.8" y2="-2.6" /><line x1="-2.6" y1="2" x2="2.6" y2="2" /></g>,
  };
  const Chip = ({ x, y, color, txt, icon, live = false }) => {
    const w = 22 + txt.length * 6.4 + 12;
    return (
      <g transform={`translate(${x - w / 2} ${y - 11})`}>
        {live && !REDUCE_MOTION && <rect x="-3" y="-3" width={w + 6} height="28" rx="14" fill="none" stroke={color} strokeWidth="1.4" opacity=".45"><animate attributeName="opacity" values=".45;.08;.45" dur="2.4s" repeatCount="indefinite" /><animate attributeName="x" values="-3;-6;-3" dur="2.4s" repeatCount="indefinite" /><animate attributeName="y" values="-3;-6;-3" dur="2.4s" repeatCount="indefinite" /><animate attributeName="width" values={`${w + 6};${w + 12};${w + 6}`} dur="2.4s" repeatCount="indefinite" /><animate attributeName="height" values="28;34;28" dur="2.4s" repeatCount="indefinite" /></rect>}
        <rect width={w} height="22" rx="11" fill="rgba(8,13,22,.9)" stroke={color} strokeWidth="1.6" />
        <g transform="translate(13 11)">{(CHIP_ICONS[icon] || CHIP_ICONS.sun)(color)}</g>
        <text x={(w + 22) / 2 - 1} y="15" textAnchor="middle" fontSize="11" fontWeight="800" fill="#eaf0fb" fontFamily="var(--o-font)">{txt}</text>
      </g>
    );
  };
  const SunMark = ({ x, y, hm }) => (
    <g className="o-sunmark" opacity=".8">
      <circle cx={x} cy={y} r="3.4" fill="none" stroke="var(--o-gold)" strokeWidth="1.3" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map(a => <line key={a} x1={x + 5.4 * Math.cos(a * rad)} y1={y + 5.4 * Math.sin(a * rad)} x2={x + 7.4 * Math.cos(a * rad)} y2={y + 7.4 * Math.sin(a * rad)} stroke="var(--o-gold)" strokeWidth="1.1" />)}
      <text x={x} y={y + 19} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--o-text3)" fontFamily="var(--o-font)">{hm}</text>
    </g>
  );
  return (
    <svg viewBox="0 0 600 250" preserveAspectRatio="xMidYMid meet" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
      {/* arc complet estompé + segment parcouru brillant (style Helios) */}
      <path d={`M ${P0} Q ${C} ${P2}`} fill="none" stroke="rgba(255,209,102,.18)" strokeWidth="2" strokeDasharray="4 6" />
      {day && <path d={`M ${P0} Q ${Ct} ${sx} ${sy}`} fill="none" stroke="url(#sunGrad)" strokeWidth="3.2" strokeLinecap="round" />}
      <defs>
        <linearGradient id="sunGrad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(255,166,60,.25)" /><stop offset="1" stopColor="var(--o-gold)" />
        </linearGradient>
      </defs>
      <SunMark x={P0[0]} y={P0[1] - 2} hm={s.sunriseHM} />
      <SunMark x={P2[0]} y={P2[1] - 2} hm={s.sunsetHM} />
      {/* soleil / lune */}
      <circle cx={sx} cy={sy} r={day ? 10 : 7} fill={day ? 'var(--o-gold)' : '#aeb9e0'} style={{ filter: day ? 'drop-shadow(0 0 10px rgba(255,209,102,.95))' : 'drop-shadow(0 0 5px rgba(174,185,224,.7))' }} />
      {day && solarW > 5 && <circle cx={sx} cy={sy} r="16" fill="none" stroke="rgba(255,209,102,.35)" strokeWidth="1.6">{!REDUCE_MOTION && <><animate attributeName="r" values="13;20;13" dur="3s" repeatCount="indefinite" /><animate attributeName="opacity" values=".5;.12;.5" dur="3s" repeatCount="indefinite" /></>}</circle>}
      {/* chips façon Helios : soleil=irradiance, panneaux=production, maison=conso, pylône=NET réseau */}
      {day && (() => {
        // La pastille de production est fixe en (352,78) : si celle du soleil tombe dessus,
        // on la remonte, et si elle sort du cadre on la bascule de l'autre côté.
        let cx = Math.min(510, Math.max(90, sx + (sx < 300 ? 70 : -70)));
        let cy = Math.max(22, sy - 4);
        if (Math.abs(cx - 352) < 132 && Math.abs(cy - 78) < 34) {
          if (cy > 44) cy = 40; else cx = cx < 352 ? Math.max(90, cx - 120) : Math.min(510, cx + 120);
        }
        return <Chip icon="sun" x={cx} y={cy} color="var(--o-gold)" txt={irr + ' W/m²'} />;
      })()}
      <Chip icon="panel" x={352} y={78} color="#ffa63c" txt={fmtKW(solarW)} live={solarW > 5} />
      <Chip icon="house" x={352} y={200} color="var(--o-cyan)" txt={fmtKW(homeW)} />
      <Chip icon="pylon" x={478} y={168} color="var(--o-purple)" txt={(exportW > 5 ? '↑ ' : '↓ ') + fmtKW(exportW > 5 ? exportW : gridW)} live={(exportW > 5 ? exportW : gridW) > 5} />
    </svg>
  );
}
// Prévisions de production : pas d'entité dédiée (forecast solaire) → estimation démo.
const EN_FORECAST = [
  { day: 'DEMAIN', kwh: '3,32', col: 'var(--o-gold)', hot: true, wx: 'sun', wc: 'var(--o-gold)' },
  { day: 'DIM', kwh: '2,10', wx: 'cloud-sun', wc: '#9aa6c0' },
  { day: 'LUN', kwh: '1,40', wx: 'clouds', wc: 'var(--o-cyan)' },
  { day: 'MAR', kwh: '3,80', col: 'var(--o-gold)', hot: true, wx: 'sun', wc: 'var(--o-gold)' },
];


const EN_LAYOUT_KEY = 'loggia_enlayout';

function EnergieContent({ hass, edit = false, onEnt }) {
  const [range, setRange] = useState('jour');
  const S = (hass && hass.states) || null;
  const num = (id, def = 0) => { const e = S && S[id]; if (!e || e.state == null || e.state === 'unknown' || e.state === 'unavailable') return def; const n = parseFloat(e.state); return isNaN(n) ? def : n; };
  const avail = (id) => { const e = S && S[id]; return !!(e && e.state != null && e.state !== 'unknown' && e.state !== 'unavailable' && !isNaN(parseFloat(e.state))); };
  // Package énergie v3 prioritaire, repli sur les capteurs bruts si absent
  const EN = enHaids();
  // Vehicule electrique : sa puissance de charge suffit a tout piloter — le
  // calque du garage, le flux le long du cable, et la valeur affichee.
  // Ce qui decide de l'affichage, c'est que le ROLE soit renseigne — pas que sa
  // valeur soit lisible a l'instant. Une borne de recharge repasse a
  // `unavailable` des qu'on debranche : lier les deux faisait disparaitre le
  // calque, le cable et la pastille d'un bloc, par intermittence.
  const evBranche = !!EN.evNow;
  const evW = avail(EN.evNow) ? Math.max(0, Math.round(num(EN.evNow))) : null;
  const batPresente = !!(EN.batNow || EN.batSoc);
  const batW = avail(EN.batNow) ? Math.round(num(EN.batNow)) : null;
  const batSoc = avail(EN.batSoc) ? Math.round(num(EN.batSoc)) : null;

  // Postes de consommation : la liste proposee, puis l'agencement.
  const postes = enDevices((hass && hass.states) || null);
  const derived = postes.map(d => 'dev:' + d.power).filter(k => k !== 'dev:undefined');
  const ed = useLayoutEditor(EN_LAYOUT_KEY, 'energie', derived);
  const [enAdd, setEnAdd] = useState(false);
  const [cardEdit, setCardEdit] = useState(null);
  // Un poste ajoute a la main n'a qu'une entite : on lui donne l'habillage par
  // defaut, l'important etant sa puissance.
  const posteDe = (k) => {
    const id = k.indexOf('dev:') === 0 ? k.slice(4) : k;
    const connu = postes.find(d => d.power === id);
    const st = (hass && hass.states && hass.states[id]) || null;
    const base = connu || {
      name: (st && st.attributes && st.attributes.friendly_name) || id,
      power: id, kwh: null, art: null, icon: 'bolt', c: 'var(--o-accent-soft)',
    };
    return { ...base, name: ed.labelOf(k) || base.name };
  };
  const posteOrigine = (k) => {
    const id = k.indexOf('dev:') === 0 ? k.slice(4) : k;
    const connu = postes.find(d => d.power === id);
    if (connu) return connu.name;
    const st = (hass && hass.states && hass.states[id]) || null;
    return (st && st.attributes && st.attributes.friendly_name) || id;
  };
  const solarAvail = avail(EN.solarNow) || avail(EN.solarOutput);
  const consoAvail = avail(EN.gridNow) || avail(EN.consoNow);
  const surplusAvail = avail(EN.injectionNow) || avail(EN.surplusNow);
  // consoNow = flux NET du compteur (négatif = export) — source unique du temps réel
  // réseau (cf. CONTEXTE de packages/energie.yaml). On dérive import/export du net BRUT en priorité :
  // aucune dépendance à la fraîcheur des templates du package.
  const solarW = Math.round(avail(EN.solarNow) ? num(EN.solarNow) : num(EN.solarOutput));
  const netRaw = avail(EN.consoNow) ? Math.round(num(EN.consoNow)) : null;
  const gridDrawW = netRaw != null ? Math.max(0, netRaw) : Math.round(avail(EN.gridNow) ? num(EN.gridNow) : 0);
  const surplusW = netRaw != null ? Math.max(0, -netRaw) : Math.round(avail(EN.injectionNow) ? num(EN.injectionNow) : Math.max(0, num(EN.surplusNow)));
  const consoW = avail(EN.consoMaison) ? Math.round(num(EN.consoMaison)) : Math.max(0, gridDrawW + solarW - surplusW);
  const exporting = surplusW > 5;
  const importW = Math.max(0, gridDrawW);
  const gridNetW = exporting ? surplusW : importW;
  // Bilans / coûts du package
  const prodJour = avail(EN.prodJour) ? num(EN.prodJour) : null;
  const autosuff = avail(EN.autosuffJour) ? Math.round(num(EN.autosuffJour)) : null;
  const tauxAutoconso = avail(EN.tauxAutoconso) ? Math.round(num(EN.tauxAutoconso)) : null;
  const coutJour = avail(EN.coutJour) ? num(EN.coutJour) : null;
  const coutMois = avail(EN.coutMois) ? num(EN.coutMois) : null;
  const ecoJour = avail(EN.ecoJour) ? num(EN.ecoJour) : null;
  const tarifTxt = (() => { const e = S && S[EN.tarif]; return (e && (e.state === 'HP' || e.state === 'HC')) ? e.state : null; })();
  const prixActuel = avail(EN.prixActuel) ? num(EN.prixActuel) : null;
  const aboPct = avail(EN.aboPct) ? Math.round(num(EN.aboPct)) : null;
  const hcToday = avail(EN.consoJourHc) ? num(EN.consoJourHc) : num(EN.consoHcToday);
  const hpToday = avail(EN.consoJourHp) ? num(EN.consoJourHp) : num(EN.consoHpToday);
  const totalToday = avail(EN.consoJour) ? num(EN.consoJour) : ((hcToday + hpToday) || num(EN.consoReseauToday));
  const hcPct = totalToday > 0 ? Math.round(hcToday / totalToday * 100) : 0;
  const hpPct = totalToday > 0 ? Math.round(hpToday / totalToday * 100) : 0;
  const hcActive = (() => { const e = S && S[EN.hcActive]; return e ? e.state === 'on' : false; })();
  const hcPrice = num(EN.hcPrice, 0), hpPrice = num(EN.hpPrice, 0);
  const hcCost = hcToday * hcPrice, hpCost = hpToday * hpPrice;
  const bill = (() => { const e = S && S[EN.bill]; if (!e) return null; const n = parseFloat(e.state); return isNaN(n) ? null : n; })();
  const solarActive = solarW > 5;
  const eur = (v) => v == null ? '—' : v.toFixed(2).replace('.', ',') + ' €';
  const fmtW = fmtWatts;
  const maxBar = Math.max(solarW, gridNetW, surplusW, 1500);
  const tiles = [
    { label: 'Solaire', tag: prodJour != null ? prodJour.toFixed(1).replace('.', ',') + ' kWh jour' : (solarActive ? tr('ACTIF') : 'INACTIF'), tagCol: solarActive ? 'var(--o-ok)' : 'var(--o-text3)', val: fmtW(solarW), num: solarW, fmt: fmtW, valCol: 'var(--o-gold)', col: 'var(--o-gold)', bar: Math.min(100, solarW / maxBar * 100) + '%', bd: 'rgba(255,209,102,.18)', icon: 'sun', ic: 'var(--o-gold)', art: VIEW_ART.solar },
    { label: tr('Réseau'), tag: (exporting ? 'VENTE' : 'ACHAT') + (tarifTxt ? ' · ' + tarifTxt + (prixActuel != null ? ' ' + prixActuel.toFixed(4).replace('.', ',') + '€' : '') : ''), tagCol: exporting ? 'var(--o-ok)' : '#f87171', val: fmtW(gridNetW), num: gridNetW, fmt: fmtW, valCol: exporting ? 'var(--o-ok)' : '#f87171', col: exporting ? 'var(--o-ok)' : '#f87171', bar: Math.min(100, gridNetW / maxBar * 100) + '%', bd: exporting ? 'rgba(52,211,153,.18)' : 'rgba(248,113,113,.18)', icon: 'bolt', ic: exporting ? 'var(--o-ok)' : '#f87171', art: VIEW_ART.pylon },
    autosuff != null
      ? { label: 'Autosuffisance', tag: tauxAutoconso != null ? 'AUTO. ' + tauxAutoconso + '%' : 'JOUR', tagCol: 'var(--o-ok)', val: autosuff + ' %', num: autosuff, unit: ' %', valCol: 'var(--o-ok)', col: 'var(--o-ok)', bar: Math.min(100, autosuff) + '%', bd: 'rgba(52,211,153,.18)', icon: 'leaf', ic: 'var(--o-ok)', art: VIEW_ART.leafart }
      : { label: 'Injection', tag: surplusW > 5 ? 'VENTE' : '—', tagCol: 'var(--o-ok)', val: fmtW(surplusW), valCol: 'var(--o-accent)', col: 'var(--o-accent)', bar: Math.min(100, surplusW / maxBar * 100) + '%', bd: 'rgba(var(--o-accent-rgb),.18)', icon: 'chart-line-up', ic: 'var(--o-accent)', art: VIEW_ART.meter },
    coutJour != null
      ? { label: tr('Coût'), tag: coutMois != null ? eur(coutMois) + ' MOIS' : 'JOUR', tagCol: 'var(--o-text2)', val: eur(coutJour), num: coutJour, d: 2, unit: ' €', valCol: 'var(--o-purple)', col: 'var(--o-purple)', bar: Math.min(100, coutJour / 5 * 100) + '%', bd: 'rgba(167,139,250,.18)', icon: 'piggy-bank', ic: 'var(--o-purple)', art: VIEW_ART.piggy }
      : { label: 'Facture', tag: 'MOIS', tagCol: 'var(--o-text2)', val: eur(bill), valCol: 'var(--o-purple)', col: 'var(--o-purple)', bar: '60%', bd: 'rgba(167,139,250,.18)', icon: 'piggy-bank', ic: 'var(--o-purple)', art: VIEW_ART.piggy },
  ];
  // Bandeau de réglages repliable (patron Atrium) — ne masque QUE la carte de bilan.
  const [panel, setPanel] = useState(() => { try { return localStorage.getItem('loggia-enpanel') !== '0'; } catch (e) { return true; } });
  const togglePanel = () => setPanel(v => { const nv = !v; try { localStorage.setItem('loggia-enpanel', nv ? '1' : '0'); } catch (e) {} return nv; });
  const RANGES = [['jour', 'Jour'], ['semaine', 'Semaine'], ['mois', 'Mois']];
  const kwhFmt = (v) => v == null ? '—' : v.toFixed(1).replace('.', ',') + ' kWh';
  const impToday = avail(EN.consoReseauToday) ? num(EN.consoReseauToday) : (totalToday || null);
  const expToday = avail(EN.injectionJour) ? num(EN.injectionJour) : null;
  const hpArc = Math.round(251 * hpPct / 100);
  const hpOff = useDrawArc(251 - hpArc, 251); // arc HP qui se dessine depuis 0
  const seg = on => ({ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, background: on ? 'var(--o-accent)' : 'transparent', color: on ? '#fff' : 'var(--o-text2)' });
  const card = { background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.36))' };

  return (
    <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div className="o-en-head" style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{tr('Énergie')}</h1>
        <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>{tr('Consommation') + ' ' + fmtW(consoW) + ' · ' + tr('production solaire') + ' ' + fmtW(solarW) + ' · ' + tr('réseau') + ' ' + fmtW(gridNetW)}</div>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: exporting ? 'rgba(var(--o-ok-rgb),.14)' : 'var(--o-s2)', color: exporting ? 'var(--o-ok)' : 'var(--o-text2)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: exporting ? 'var(--o-ok)' : 'var(--o-text3)' }} />{exporting ? tr('SURPLUS') + ' ' + fmtW(surplusW) : tr('PAS DE SURPLUS')}</span>
      </div>

      <div className="grid-ehero" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 18, alignItems: 'stretch' }}>
        <Anim i={0}><div style={{ position: 'relative', overflow: 'hidden', height: '100%', background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: 24, boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.4))' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
            <div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text2)' }}>{tr('Maison · Temps réel')}</div><div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 24, fontWeight: 500, marginTop: 2 }}>{solarActive ? tr('Production solaire active') : tr('Consommation réseau')}</div></div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 999, border: '1px solid ' + (solarActive ? 'rgba(52,211,153,.3)' : 'var(--o-bd2)'), color: solarActive ? 'var(--o-ok)' : 'var(--o-text3)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: solarActive ? 'var(--o-ok)' : 'var(--o-text3)', animation: solarActive ? 'pulse 2s infinite' : 'none' }} /><Shiny on={solarActive}>{solarActive ? 'Solaire actif' : 'Solaire inactif'}</Shiny></span>
          </div>
          <div className="o-en-well" style={{ position: 'relative', borderRadius: 'var(--o-radius,16px)', overflow: 'hidden', background: 'radial-gradient(120% 90% at 50% 30%,var(--o-well0),var(--o-well2))', border: 'var(--o-bw,1px) solid var(--o-bd3)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}>
            {/* Scène type Helios : arc du jour (géoloc domicile), soleil + irradiance, chips de flux */}
            <div className="o-en-scene" style={{ position: 'relative', width: '100%', aspectRatio: '600 / 250', margin: '0 auto' }}>
              <EnergyHouseSchema solarW={solarW} homeW={consoW} surplusW={surplusW} evW={evW} evBranche={evBranche} batW={batW} batSoc={batSoc} batPresente={batPresente} />
              <SunArc solarW={solarW} gridW={importW} exportW={surplusW} homeW={consoW} appW={avail(EN.appTotal) ? Math.round(num(EN.appTotal)) : null} />
            </div>
          </div>
          <div className="o-en-kpis" style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--o-accent-soft)' }}>{consoAvail ? <Num v={consoW} suffix=" W" /> : '—'}</div><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--o-accent)' }} />Conso maison</div></div>
            <div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--o-gold)' }}>{solarAvail ? <Num v={solarW} suffix=" W" /> : '—'}</div><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--o-gold)' }} />Production</div></div>
            {ecoJour != null && <div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--o-ok)' }}><Num v={ecoJour} d={2} suffix=" €" /></div><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--o-ok)' }} />{tr('Économie du jour')}</div></div>}
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}><div style={{ fontSize: 24, fontWeight: 800, color: exporting ? 'var(--o-ok)' : '#f87171' }}>{(surplusAvail || consoAvail) ? <Num v={exporting ? surplusW : importW} suffix=" W" /> : '—'}</div><div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 }}><FlipText text={exporting ? '↑ ' + tr('Vente réseau') : '↓ ' + tr('Achat réseau')} /></div></div>
          </div>
        </div></Anim>

      </div>

      {/* réglages rapides : période d'analyse et tarif courant */}
      <div className="o-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,20px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{tr('Période')}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {RANGES.map(([id, lb]) => <button key={id} onClick={() => setRange(id)} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, background: range === id ? 'rgba(var(--o-accent-rgb),.18)' : 'transparent', color: range === id ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}>{lb}</button>)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>Tarif</span>
          <span style={{ fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', color: (tarifTxt === 'HC' || hcActive) ? 'var(--o-ok)' : 'var(--o-warn2)' }}>{(tarifTxt === 'HC' || hcActive) ? 'Heures creuses' : 'Heures pleines'}{prixActuel != null ? ' · ' + prixActuel.toFixed(4).replace('.', ',') + ' €' : ''}</span>
        </div>
        <span style={{ flex: 1 }} />
        <button onClick={togglePanel} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, border: panel ? 'var(--o-bw,1px) solid rgba(var(--o-accent-rgb),.44)' : 'var(--o-bw,1px) solid var(--o-bd1)', background: panel ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: panel ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}><Fi i="sliders-v" size={13} /><span className="o-barlabel">{panel ? tr('Masquer les réglages') : tr('Réglages de la vue')}</span></button>
      </div>

      {/* Bilan instantané : les chiffres du moment, en lignes denses */}
      {panel && (
        <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '20px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{tr('Bilan instantané')}</div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap', fontSize: 11, fontWeight: 800, background: (tarifTxt === 'HC' || hcActive) ? 'rgba(var(--o-ok-rgb),.14)' : 'rgba(var(--o-warn2-rgb),.14)', color: (tarifTxt === 'HC' || hcActive) ? 'var(--o-ok)' : 'var(--o-warn2)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: (tarifTxt === 'HC' || hcActive) ? 'var(--o-ok)' : 'var(--o-warn2)' }} />{(tarifTxt === 'HC' || hcActive) ? 'TARIF CREUX' : 'TARIF PLEIN'}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, margin: '3px 0 8px' }}>{tr("Relevé temps réel du compteur et de l'onduleur")}{aboPct != null ? ' · ' + tr('{n} % du 7 kVA souscrit', { n: aboPct }) : ''}</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <EnRow label={tr('Consommation')} desc={tr('Compteur électrique · temps réel')}>
              <EnVal v={consoAvail ? fmtW(consoW) : '—'} col="var(--o-text)" />
            </EnRow>
            <EnRow label="Production solaire" desc={solarActive ? 'Onduleur · en production' : 'Onduleur · nuit ou capteur indisponible'}>
              <EnVal v={solarAvail ? fmtW(solarW) : '—'} col={solarActive ? 'var(--o-gold)' : 'var(--o-text3)'} />
            </EnRow>
            {(tauxAutoconso != null || autosuff != null) && (
              <EnRow label={tr('Autoconsommation')} desc={tr('Part de la production consommée sur place')}>
                <EnGauge v={(tauxAutoconso != null ? tauxAutoconso : autosuff) + ' %'} pct={tauxAutoconso != null ? tauxAutoconso : autosuff} col={(tauxAutoconso != null ? tauxAutoconso : autosuff) > 0 ? 'var(--o-ok)' : 'var(--o-text3)'} />
              </EnRow>
            )}
            <EnRow label={tr('Réseau')} desc={exporting ? tr('Injection vers le réseau') : tr('Soutirage depuis le réseau')}>
              <EnVal v={fmtW(gridNetW)} col={exporting ? 'var(--o-ok)' : 'var(--o-bad)'} />
            </EnRow>
            <EnRow label={tr("Aujourd'hui")} desc={(impToday != null ? tr('Importé') + ' ' + kwhFmt(impToday) : tr('Import inconnu')) + (expToday != null ? ' · exporté ' + kwhFmt(expToday) : '')}>
              <EnVal v={impToday != null ? kwhFmt(impToday) : '—'} col="var(--o-accent-soft)" />
            </EnRow>
            <EnRow label={tr('Coût estimé')} desc={coutMois != null ? tr('Mois en cours') + ' : ' + eur(coutMois) : tr('Journée en cours')}>
              <EnVal v={eur(coutJour != null ? coutJour : (hcCost + hpCost))} col="var(--o-warn)" />
            </EnRow>
            {ecoJour != null && (
              <EnRow label={tr('Économie solaire')} desc={tr('Estimation du jour, production autoconsommée')}>
                <EnVal v={eur(ecoJour)} col="var(--o-ok)" />
              </EnRow>
            )}
          </div>
        </div>
      )}

      <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>Postes de consommation</div>
        {edit && (
          <ViewEditBar onEnt={onEnt} entLabel="Entités du schéma"
            texte={'Mode édition : clique un poste pour le modifier, glisse-le pour le déplacer.'
              + (ed.edits ? ' Ces postes sont personnalisés.' : ' Ces postes suivent la détection automatique.')}>
            <button onClick={() => setEnAdd(true)} style={editBtn(true)}>{tr('Ajouter un poste')}</button>
            {ed.edits > 0 && <button onClick={ed.reset} style={editBtn(false)}>{tr("Rétablir l'automatique")}</button>}
          </ViewEditBar>
        )}
        <div ref={ed.gridRef} className="grid-edevices" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
          {ed.ids.map((k) => { const d = posteDe(k); const di = ed.ids.indexOf(k); const w = Math.round(num(d.power)); const kwh = avail(d.kwh) ? num(d.kwh) : null; const on = w > 5;
            const carte = (
            <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 16, padding: '14px 15px' }}>
              {d.art && VIEW_ART[d.art] && <div aria-hidden="true" style={{ position: 'absolute', right: 6, bottom: -6, width: 92, height: 92, backgroundImage: `url("${VIEW_ART[d.art]}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center bottom', opacity: 0.16, pointerEvents: 'none' }} />}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                <div style={{ width: 34, height: 34, borderRadius: 11, background: hx(d.c, 0.14), display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i={d.icon} size={15} color={d.c} /></div>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: on ? 'var(--o-ok)' : 'var(--o-text3)', animation: on ? 'pulse 2s infinite' : 'none' }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
              <div style={{ fontSize: 17, fontWeight: 800, marginTop: 3, color: on ? d.c : 'var(--o-text3)' }}>{avail(d.power) ? <Num v={w} fmt={fmtW} /> : '—'}</div>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--o-text3)', marginTop: 2 }}>{kwh != null ? kwh.toFixed(2).replace('.', ',') + ' kWh jour' : '—'}</div>
            </div>);
            if (!edit) return <Anim key={k} i={di} base={160} className={ed.estLarge(k) ? 'o-cvw2' : ''}>{carte}</Anim>;
            return <EditableCard key={k} ed={ed} id={k} nom={d.name} onEdit={setCardEdit}>{carte}</EditableCard>;
          })}
        </div>
        {enAdd && <RoomAddSheet room="Postes de consommation" hass={hass} present={ed.ids.map(k => k.indexOf('dev:') === 0 ? k.slice(4) : k)} onToggle={(id) => ed.toggle('dev:' + id)} onClose={() => setEnAdd(false)} />}
        {cardEdit && <CardEditSheet ed={ed} id={cardEdit} nom={posteDe(cardEdit).name} origine={posteOrigine(cardEdit)} hass={hass} onClose={() => setCardEdit(null)} />}

    </div>
  );
}

function EnergieView({ hass, edit = false, onEnt }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <EnergieContent hass={hass} edit={edit} onEnt={onEnt} />
    </main>
  );
}

/* ════════════ VUE ASPIRATEUR (reproduction fidèle de "Loggia Aspirateur.dc.html") ════════════ */
const VAC_KEYS = [];   // le poll vient de vacKeys() : préfixe de domaine + entités résolues
// Consommables : la plupart des aspirateurs n'exposent pas d'entité d'usure → valeurs indicatives.

function AspirateurContent({ hass }) {
  const S = (hass && hass.states) || null;
  const stTxt = (id) => { const e = S && S[id]; return (e && e.state != null && e.state !== 'unknown' && e.state !== 'unavailable') ? e.state : null; };
  const num = (id, def = null) => { const e = S && S[id]; if (!e) return def; const n = parseFloat(e.state); return isNaN(n) ? def : n; };

  // ── Resolution (etape 3) : plus aucun entity_id impose ──
  // `legacy(id)` ne rend l'identifiant que si l'entite existe REELLEMENT chez
  // l'utilisateur courant. C'est ce qui permet de garder l'affichage d'origine
  // ici sans imposer ces entites a qui ne les a pas.
  const { resolved } = useLoggia();
  const vac = (resolved && resolved.vacuum && resolved.vacuum.available) ? resolved.vacuum : null;
  // Identifiants maison : configuration utilisateur (loggia_entities.vacuum),
  // repli sur la constante le temps de la transition.
  const entVac = useEntities('vacuum', null) || {};
  const entRooms = useEntities('vacuumRooms', null) || [];
  const legacy = (id) => (id && S && S[id]) ? id : null;
  const idBat = (vac && vac.battery) || legacy(entVac.battery);
  const idSurf = (vac && vac.area_cleaned) || legacy(entVac.surface);
  const idDur = (vac && vac.duration) || legacy(entVac.duree);
  const idMap = (vac && vac.map) || legacy(entVac.map);
  // Camera de surveillance du passage, optionnelle : le robot n'en fournit pas.
  const idCam = legacy(entVac.camera);
  // L'entite vacuum elle-meme : c'est elle qui publie la liste des pieces.
  const idVac = (vac && vac.main) || legacy(entVac.main) || legacy(entVac.vacuum);
  // Valeur numerique d'un capteur, ou null s'il ne repond pas.
  const sNum = (id) => { const t = stTxt(id); const n = parseFloat(t); return isNaN(n) ? null : n; };
  // Entites du robot reconnues toutes seules (usure, mode, debit d'eau...).
  // La configuration reste prioritaire : qui a designe une entite garde la
  // sienne, la decouverte ne sert qu'a remplir les roles laisses vides.
  const auto = vacSensors(hass, idVac);
  const role = (cle) => legacy(entVac[cle]) || auto[cle] || null;
  // Usure des consommables. Une ligne n'apparait que si son capteur existe ET
  // repond — pas de pourcentage invente.
  const CONSOMMABLES = [
    { cle: 'brushMain', nom: 'Brosse principale', desc: tr('Usure · à remplacer sous 20 %'), col: 'var(--o-ok)' },
    { cle: 'brushSide', nom: tr('Brosse latérale'), desc: tr('Usure · à remplacer sous 20 %'), col: 'var(--o-ok)' },
    { cle: 'mop', nom: tr('Serpillière'), desc: tr('Usure du tampon · à remplacer sous 20 %'), col: 'var(--o-cyan)' },
    { cle: 'filter', nom: 'Filtre HEPA', desc: tr('Usure · à changer sous 20 %'), col: '#ffb347' },
    { cle: 'care', nom: 'Entretien de l’appareil', desc: tr('Usure · révision sous 20 %'), col: 'var(--o-purple)' },
  ].map(c => {
    const id = role(c.cle);
    const v = id ? sNum(id) : null;
    return { ...c, id, v };
  }).filter(c => c.id);
  const idMaint = legacy(entVac.maintenance);

  // L'etat vient de l'entite `vacuum` (garanti partout) ; le capteur maison,
  // deja traduit, reste prioritaire chez qui le possede.
  const raw = vac ? vac.state : null;
  const idEtat = legacy(entVac.etat);
  const etat = (idEtat && stTxt(idEtat)) || (raw && tr(VACUUM_STATE_FR[raw])) || tr("À la station d'accueil");
  const cleaning = raw ? raw === 'cleaning' : stTxt(entVac.cleaning) === 'on';
  const paused = raw ? raw === 'paused' : /pause/i.test(etat);
  // batterie : attribut de l'entite d'abord, capteur ensuite
  const batteryRaw = (vac && vac.batteryLevel != null) ? vac.batteryLevel : num(idBat, null); // indispo → « — », jamais un faux 100 %
  const battery = batteryRaw != null ? Math.round(batteryRaw) : null;
  const surfRaw = num(idSurf, null);
  const surface = surfRaw != null ? String(Math.round(surfRaw)) : null;
  const duree = fmtDuration(stTxt(idDur));
  const maint = (idMaint && stTxt(idMaint)) || 'OK';
  const sOn = (id) => stTxt(id) === 'on';
  // Pieces reelles du robot, rattachees aux zones configurees (couleur, icone,
  // interrupteur). La liste des boutons et les zones cliquables du plan sortent
  // toutes deux d'ICI : un clic sur la carte fait donc exactement ce que fait
  // le bouton correspondant.
  const rooms = vacRooms(hass, idVac, entRooms);
  const ssig = rooms.map(r => sOn(r.toggle) ? 1 : 0).join('') + '|' + rooms.map(r => r.id).join(',');
  const [sel, setSel] = useState(() => Object.fromEntries(rooms.map(r => [r.id, sOn(r.toggle)])));
  // `ssig` resume l'etat des interrupteurs ET la liste des pieces : se caler
  // dessus evite de resynchroniser a chaque rendu, `rooms` etant reconstruit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setSel(Object.fromEntries(rooms.map(r => [r.id, sOn(r.toggle)]))); }, [ssig]);
  const call = (d, s, data) => { try { if (hass && hass.callService) hass.callService(d, s, data || {}); } catch (e) {} };
  const runScript = (id) => call('script', 'turn_on', { entity_id: id });
  // Un script maison fait souvent plus que le service standard (selection de
  // pieces, sequence). On le garde donc quand il existe, et on retombe sinon
  // sur le service du domaine `vacuum`, disponible chez tout le monde.
  const vacScript = (k) => { const c = loggiaEnt('vacuumScripts', null); return (c && c[k]) || null; };
  const runOr = (scriptId, svc) => {
    if (S && S[scriptId]) runScript(scriptId);
    else if (vac) call('vacuum', svc, { entity_id: vac.main });
  };
  // Une piece que le robot connait mais qu'aucun interrupteur ne pilote reste
  // affichee ; la basculer n'aurait rien a envoyer, on s'abstient plutot que
  // d'appeler le service a vide.
  const toggleRoom = (r) => {
    if (!r || !r.toggle) return;
    const on = !sel[r.id];
    setSel(s => ({ ...s, [r.id]: on }));
    call('input_boolean', on ? 'turn_on' : 'turn_off', { entity_id: r.toggle });
  };
  const picked = rooms.filter(r => sel[r.id]);
  const mainAction = () => paused ? runOr(vacScript('reprendre'), 'start') : cleaning ? runOr(vacScript('pause'), 'pause') : runOr(vacScript('nettoyer_tout'), 'start');
  const mainLabel = paused ? tr('Reprendre') : cleaning ? tr('Mettre en pause') : tr('Démarrer le nettoyage');
  const onBlue = cleaning && !paused;
  const batColor = battery == null ? 'var(--o-text3)' : battery > 40 ? 'var(--o-ok)' : battery > 15 ? '#ffb347' : '#f87171';
  const onBase = raw ? raw === 'docked' : stTxt(entVac.onBase) === 'on';
  // Bandeau + carte de synthese repliables (patron Atrium)
  const [panel, setPanel] = useState(() => { try { return localStorage.getItem('loggia-vacpanel') !== '0'; } catch (e) { return true; } });
  const togglePanel = () => setPanel(v => { const nv = !v; try { localStorage.setItem('loggia-vacpanel', nv ? '1' : '0'); } catch (e) {} return nv; });
  const stateTag = onBlue ? tr('NETTOYAGE EN COURS') : paused ? tr('EN PAUSE') : onBase ? tr('SUR LA BASE') : tr('AU REPOS');
  const stateCol = onBlue ? 'var(--o-accent)' : paused ? '#ffb347' : 'var(--o-ok)';
  const stateRgb = onBlue ? 'var(--o-accent-rgb)' : paused ? '255,179,71' : 'var(--o-ok-rgb)';
  const barBtn = { padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', background: 'var(--o-s1)', color: 'var(--o-text1)' };
  // Ligne dense : libelle + description a gauche, valeur a droite
  const VacRow = ({ label, desc, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 190px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 11.5, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>{children}</div>
    </div>
  );
  // Unite publiee par l'entite : jamais devinee, sinon un total d'heures
  // s'afficherait en minutes chez le voisin.
  const unite = (id) => { const e = S && S[id]; return (e && e.attributes && e.attributes.unit_of_measurement) || ''; };
  const valUnite = (id) => { const v = sNum(id); return v == null ? null : (Math.round(v * 10) / 10) + (unite(id) ? ' ' + unite(id) : ''); };
  // « hier 14:20 » : le jour en clair tant qu'il est proche, la date au-dela.
  const quand = (iso) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const n = new Date();
    const jour = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const dj = Math.round((jour(d) - jour(n)) / 86400000);
    const h = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
    return (dj === 0 ? "aujourd’hui " : dj === -1 ? 'hier ' : d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) + ' ') + h;
  };
  // Ligne de reglage a choix : les options viennent de l'entite, on n'en
  // invente aucune. Absente ou vide, la ligne ne s'affiche pas.
  const SelRow = ({ id, label, desc }) => {
    const e = (S && S[id]) || null;
    const opts = (e && e.attributes && e.attributes.options) || [];
    if (!e || !opts.length) return null;
    return (
      <VacRow label={label} desc={desc}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {opts.map(o => {
            const on = o === e.state;
            return (
              <button key={o} onClick={() => call('select', 'select_option', { entity_id: id, option: o })} aria-pressed={on}
                style={{ padding: '6px 11px', borderRadius: 9, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                  border: '1px solid ' + (on ? 'rgba(var(--o-accent-rgb),.5)' : 'var(--o-bd2)'),
                  background: on ? 'rgba(var(--o-accent-rgb),.16)' : 'var(--o-s2)',
                  color: on ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}>
                {vacOption(o)}
              </button>
            );
          })}
        </div>
      </VacRow>
    );
  };
  // Serpilliere posee ou retiree, et erreur en cours : deux informations que le
  // robot publie et que la vue passait sous silence.
  const mopPose = auto.mopOn ? stTxt(auto.mopOn) : null;
  const modeTxt = auto.workMode && stTxt(auto.workMode) ? vacOption(stTxt(auto.workMode)) : null;
  const erreur = auto.error ? stTxt(auto.error) : null;
  const enPanne = erreur && !/^(no_error|ok|none|aucun)/i.test(erreur);
  const derniere = auto.lastTask ? quand(stTxt(auto.lastTask)) : null;
  const sousTitre = [(vac && vac.name) || tr('Aspirateur robot'), (vac && vac.area) || null, modeTxt,
    mopPose == null ? null : (mopPose === 'on' ? 'serpillière fixée' : 'serpillière retirée')].filter(Boolean).join(' · ');

  return (
    <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div className="o-obj-head" style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>Aspirateur</h1>
          <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>{etat} · {tr('batterie')} {battery != null ? battery + ' %' : '—'}{surface ? ' · ' + surface + ' m² aujourd’hui' : ''}{picked.length ? ' · ' + (picked.length > 1 ? tr('{n} zones ciblées', { n: picked.length }) : tr('{n} zone ciblée', { n: picked.length })) : ''}</div>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: `rgba(${stateRgb},.14)`, color: stateCol }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: stateCol, animation: onBlue ? 'pulse 1.4s infinite' : 'none' }} />{stateTag}</span>
      </div>

      {/* réglages rapides : marche/arrêt, retour à la base, localisation */}
      <div className="o-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,20px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>Robot</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={mainAction} style={{ ...barBtn, background: onBlue ? 'rgba(var(--o-accent-rgb),.18)' : 'rgba(var(--o-ok-rgb),.18)', color: onBlue ? 'var(--o-accent-soft)' : 'var(--o-ok)' }}>{mainLabel}</button>
            <button onClick={() => runOr(vacScript('retour_base'), 'return_to_base')} style={barBtn}>Base</button>
            <button onClick={() => runOr(vacScript('localiser'), 'locate')} style={barBtn}>Localiser</button>
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <button onClick={togglePanel} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, border: panel ? 'var(--o-bw,1px) solid rgba(var(--o-accent-rgb),.44)' : 'var(--o-bw,1px) solid var(--o-bd1)', background: panel ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: panel ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}><Fi i="sliders-v" size={13} /><span className="o-barlabel">{panel ? tr('Masquer les réglages') : tr('Réglages de la vue')}</span></button>
      </div>

      {panel && <Anim i={0}><div style={{ background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: 24, boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Nettoyage</div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap', fontSize: 11, fontWeight: 800, background: maint === 'OK' ? 'rgba(var(--o-ok-rgb),.14)' : 'rgba(255,179,71,.16)', color: maint === 'OK' ? 'var(--o-ok)' : '#ffb347' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: maint === 'OK' ? 'var(--o-ok)' : '#ffb347' }} />{maint === 'OK' ? 'ENTRETIEN À JOUR' : 'ENTRETIEN REQUIS'}</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, margin: '3px 0 8px' }}>{sousTitre}</div>
        <div className="o-optlist" style={{ display: 'flex', flexDirection: 'column' }}>
          <VacRow label={tr('État')} desc={etat}>
            <span style={{ fontSize: 15, fontWeight: 800, color: stateCol }}><FlipText live text={onBlue ? tr('En cours') : paused ? tr('En pause') : onBase ? tr('Sur la base') : tr('Au repos')} /></span>
          </VacRow>
          <VacRow label="Batterie" desc={battery == null ? 'Capteur indisponible' : battery > 40 ? 'Autonomie confortable' : battery > 15 ? tr('À surveiller') : 'Recharge nécessaire'}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: batColor }}><FlipText live text={battery != null ? battery + ' %' : '—'} /></span>
              <Gauge pct={battery || 0} color={batColor} h={3} style={{ width: 160 }} />
            </div>
          </VacRow>
          <SelRow id={auto.workMode} label="Mode de travail" desc={tr('Ce que le robot fait pendant son passage')} />
          <SelRow id={auto.waterFlow} label={tr('Débit d’eau')} desc={tr('Quantité d’eau envoyée à la serpillière')} />
          {mopPose != null && (
            <VacRow label={tr('Serpillière')} desc={mopPose === 'on' ? 'Module posé sur le robot' : 'Module retiré — aspiration seule'}>
              <span style={{ fontSize: 15, fontWeight: 800, color: mopPose === 'on' ? 'var(--o-cyan)' : 'var(--o-text3)' }}>{mopPose === 'on' ? 'Fixée' : 'Retirée'}</span>
            </VacRow>
          )}
          {CONSOMMABLES.map(c => (
            <VacRow key={c.cle} label={c.nom} desc={c.v == null ? 'Capteur indisponible' : c.desc}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: c.v == null ? 'var(--o-text3)' : c.v < 20 ? 'var(--o-bad)' : c.col }}>
                  {c.v == null ? '—' : Math.round(c.v) + ' %'}
                </span>
                {c.v != null && <Gauge pct={Math.max(0, Math.min(100, c.v))} color={c.v < 20 ? 'var(--o-bad)' : c.col} h={3} style={{ width: 160 }} />}
              </div>
            </VacRow>
          ))}
          <VacRow label="Session du jour" desc={tr('Surface parcourue et durée du dernier passage')}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{(surface != null ? surface + ' m²' : '—') + ' · ' + (duree || '—')}</span>
          </VacRow>
          {derniere && (
            <VacRow label="Dernier passage" desc={picked.length ? picked.map(r => r.name).join(', ') : 'Passage complet'}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>{derniere}</span>
            </VacRow>
          )}
          {(auto.areaTotal || auto.count || auto.durTotal) && (
            <VacRow label={tr('Depuis la mise en service')} desc={tr('Totaux tenus par le robot')}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>
                {[valUnite(auto.areaTotal), auto.count && sNum(auto.count) != null ? sNum(auto.count) + ' passages' : null, valUnite(auto.durTotal)].filter(Boolean).join(' · ') || '—'}
              </span>
            </VacRow>
          )}
          {enPanne && (
            <VacRow label={tr('Erreur')} desc={tr('Signalée par le robot')}>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--o-bad)' }}>{vacOption(erreur)}</span>
            </VacRow>
          )}
          <VacRow label={tr('Zones ciblées')} desc={picked.length ? picked.map(r => r.name).join(' · ') : 'Aucune zone sélectionnée — le robot nettoie tout'}>
            <span style={{ fontSize: 15, fontWeight: 800, color: picked.length ? 'var(--o-accent-soft)' : 'var(--o-text3)' }}>{picked.length ? picked.length + ' / ' + rooms.length : 'toutes'}</span>
          </VacRow>
        </div>
      </div></Anim>}

      <div style={{ background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,22px)', padding: 18, boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.36))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{tr('Carte du logement')}</div><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-accent-soft)', background: 'rgba(var(--o-accent-rgb),.14)', padding: '4px 11px', borderRadius: 999 }}>Live · 10s</span></div>
        <Suspense fallback={<div style={{ aspectRatio: '16/10', borderRadius: 'var(--o-radius,16px)', background: 'var(--o-well2)' }} />}>
          <VacPlan hass={hass} haid={idMap} zones={rooms} selection={sel} onToggle={toggleRoom} />
        </Suspense>
      </div>


      <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{tr('Nettoyage ciblé')}</div>
      <div className="grid-vac-map" style={{ display: 'grid', gridTemplateColumns: idCam ? 'minmax(0,1.3fr) minmax(260px,1fr)' : '1fr', gap: 18, alignItems: 'start' }}>
        <div style={{ background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,22px)', padding: 20, boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.36))' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{tr('Zones à nettoyer')}</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)' }}>
              {picked.length ? (picked.length > 1 ? tr('{n} pièces sélectionnées', { n: picked.length }) : tr('{n} pièce sélectionnée', { n: picked.length })) : tr('passage complet')}
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, marginBottom: 16 }}>{tr('Sur la carte ou dans la liste — laisse vide pour un passage complet')}</div>
          <div className="grid-vac-rooms" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
            {rooms.map(r => {
              const on = !!sel[r.id];
              const sans = !r.toggle;
              return (
                <button key={r.id} onClick={() => toggleRoom(r)} aria-pressed={on} disabled={sans}
                  title={sans ? 'Aucun interrupteur ne pilote cette pièce' : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 14px', borderRadius: 13,
                    border: '1px solid ' + (on ? r.color + '66' : 'var(--o-bd2)'), cursor: sans ? 'default' : 'pointer',
                    fontWeight: 700, fontSize: 13, textAlign: 'left', transition: 'all .2s', opacity: sans ? .5 : 1,
                    background: on ? `rgba(${cl_hexRgb(r.color)},.14)` : 'var(--o-s2)',
                    color: on ? r.color : 'var(--o-text2)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, flexShrink: 0, background: on ? r.color : 'var(--o-text3)' }} />
                  {r.name}
                </button>
              );
            })}
          </div>
          <button onClick={() => { const sc = vacScript('pieces_selectionnees'); if (picked.length && sc) runScript(sc); }} style={{ width: '100%', marginTop: 14, padding: 13, borderRadius: 13, border: 'none', cursor: picked.length ? 'pointer' : 'default', fontWeight: 800, fontSize: 13.5, transition: 'all .2s', background: picked.length ? 'var(--o-accent)' : 'var(--o-s1)', color: picked.length ? '#fff' : 'var(--o-text3)', boxShadow: picked.length ? '0 8px 20px rgba(var(--o-accent-rgb),.35)' : 'none' }}>{picked.length ? (picked.length > 1 ? tr('Nettoyer {n} pièces', { n: picked.length }) : tr('Nettoyer {n} pièce', { n: picked.length })) : tr('Sélectionne des pièces')}</button>
        </div>
        {idCam && (
          <div style={{ background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{tr('Caméra')}</div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: 'rgba(var(--o-ok-rgb),.14)', color: 'var(--o-ok)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--o-ok)' }} />EN DIRECT
              </span>
            </div>
            <div style={{ position: 'relative', borderRadius: 'var(--o-radius,16px)', overflow: 'hidden', aspectRatio: '16/10', background: 'var(--o-well2)' }}>
              <CamLive hass={hass} haid={idCam} />
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', marginTop: 10, lineHeight: 1.5 }}>
              Suit le passage du robot. Choisis la caméra dans Paramètres → Entités.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Vue atteinte alors que l'installation n'a pas de quoi la remplir.
const VIEW_TITLES = {
  pieces: tr('Pièces'), scenes: tr('Scènes'), objets: tr('Objets'), energie: tr('Énergie'),
  securite: tr('Sécurité'), systeme: tr('Système'), lumieres: tr('Lumières'), climat: tr('Climat'),
  volets: tr('Volets'), aspirateur: tr('Aspirateur'), croquettes: tr('Croquettes'), medias: tr('Médias'),
};
function ViewEmpty({ vid, reason, onNav }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontWeight: 400, fontSize: 36, margin: 0, letterSpacing: '-.01em' }}>{VIEW_TITLES[vid] || tr('Vue')}</h1>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', marginTop: 4 }}>{tr('rien à afficher pour cette installation')}</div>
        </div>
        <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,16px)', padding: '26px 24px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14, boxShadow: 'var(--o-shadow)' }}>
          <span style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--o-s1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Fi i="search-alt" size={19} color="var(--o-text3)" />
          </span>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 700 }}>Cette vue reste vide</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', marginTop: 5, maxWidth: 520, lineHeight: 1.5 }}>
              {reason || 'aucune entité correspondante trouvée'}.
              {' '}Ajoute les appareils concernés dans Home Assistant, ou désigne les entités à utiliser dans Paramètres → Entités. La vue réapparaîtra d'elle-même.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <button onClick={() => onNav('accueil')} style={{ padding: '9px 15px', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: 'rgba(var(--o-accent-rgb),.16)', color: 'var(--o-accent-soft)' }}>{tr("Retour à l'accueil")}</button>
            <button onClick={() => onNav('parametres')} style={{ padding: '9px 15px', borderRadius: 11, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text2)' }}>{tr('Ouvrir les paramètres')}</button>
          </div>
        </div>
      </div>
    </main>
  );
}

function AspirateurView({ hass }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <AspirateurContent hass={hass} />
    </main>
  );
}

/* ════════════ VUE CROQUETTES (reproduction fidèle de "Loggia Croquettes.dc.html") ════════════ */
const CROQ_WEEK = [54, 72, 66, 78, 60, 90, 66];
const CROQ_WD = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
/* La capacite du reservoir etait ecrite ici : 1 500 g, celle d'un distributeur
 * precis. Un modele de 3 kg aurait affiche « 100 % » a moitie plein.
 *
 * L'aide qui porte le niveau declare son propre maximum — c'est elle qui sait. */
const CROQ_MAX_DEFAUT = 1500;
function croqMax(S) {
  const id = croqHaids().reservoir;
  const e = S && id && S[id];
  const m = e && e.attributes && Number(e.attributes.max);
  return (m > 0) ? m : CROQ_MAX_DEFAUT;
}
const croqKeys = () => [...Object.values(croqHaids()), ...croqMeals().map(m => m.auto)].filter(Boolean);
// Distributeur : purement configuré. Un distributeur de croquettes piloté par
// automations n'a pas d'équivalent standard dans Home Assistant, il n'y a donc
// rien à découvrir — sans configuration, la vue se déclare hors ligne.
function croqHaids() { const c = loggiaEnt('feeder', null); return (c && c.haids) || {}; }
function croqMeals() { const c = loggiaEnt('feeder', null); return (c && Array.isArray(c.meals) && c.meals.length) ? c.meals : []; }
// Bulles qui montent dans le réservoir (animation discrète).
const CROQ_BUBBLES = [
  { l: '26%', z: 5, d: '0s', s: '3.4s' }, { l: '54%', z: 4, d: '1.1s', s: '4s' },
  { l: '68%', z: 5, d: '2.2s', s: '3.7s' }, { l: '40%', z: 3, d: '1.6s', s: '4.3s' },
];

function CroquettesContent({ hass }) {
  const S = (hass && hass.states) || null;
  const num = (id, def = 0) => { const e = S && S[id]; if (!e || e.state == null || e.state === 'unknown' || e.state === 'unavailable') return def; const n = parseFloat(e.state); return isNaN(n) ? def : n; };
  const reservoirOk = (() => { const e = S && S[croqHaids().reservoir]; return !!(e && e.state != null && e.state !== 'unknown' && e.state !== 'unavailable'); })();
  const reservoirG = reservoirOk ? Math.round(num(croqHaids().reservoir, 0)) : null;
  const distribuees = Math.round(num(croqHaids().distribuees, 0));
  const portionW = num(croqHaids().portionWeight, 6);
  const autoOn = (id) => { const e = S && S[id]; return e ? e.state === 'on' : true; };
  const msig = croqMeals().map(m => autoOn(m.auto) ? 1 : 0).join('');
  const [meals, setMeals] = useState(() => croqMeals().map(m => ({ ...m, on: autoOn(m.auto) })));
  useEffect(() => { setMeals(croqMeals().map(m => ({ ...m, on: autoOn(m.auto) }))); }, [msig]);
  const [portion, setPortion] = useState(1);
  const [levelLocal, setLevelLocal] = useState(null);
  useEffect(() => { setLevelLocal(null); }, [reservoirG]); // toute variation confirmée du capteur reprend la main sur l'optimiste
  const level = levelLocal != null ? levelLocal : (reservoirG == null ? 0 : Math.max(0, Math.min(100, Math.round(reservoirG / croqMax(S) * 100))));
  const shownG = levelLocal != null ? croqMax(S) : reservoirG;
  const call = (d, s, data) => { try { if (hass && hass.callService) hass.callService(d, s, data || {}); } catch (e) {} };
  // Distribuer demande un script propre a l'installation : rien de standard.
  // Sans lui, le geste ne fait rien plutot que d'appeler un script absent.
  const dispense = (n) => { const sc = (loggiaEnt('feeder', null) || {}).script; if (sc) call('script', 'turn_on', { entity_id: sc, variables: { portions: n } }); };
  const refill = () => { setLevelLocal(100); call('input_number', 'set_value', { entity_id: croqHaids().reservoir, value: croqMax(S) }); };
  const toggleMeal = (m) => { setMeals(ms => ms.map(x => x.id === m.id ? { ...x, on: !x.on } : x)); call('automation', m.on ? 'turn_off' : 'turn_on', { entity_id: m.auto }); };
  const onCount = meals.filter(m => m.on).length;
  const dayG = meals.filter(m => m.on).reduce((s, m) => s + m.g, 0);
  const nowMin = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
  const mealMin = (t) => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; };
  const upcoming = meals.filter(m => m.on && mealMin(m.time) > nowMin).sort((a, b) => mealMin(a.time) - mealMin(b.time))[0];
  // ── Patron Atrium (21/08) : bandeau de réglages + carte Distributeur + repas du jour ──
  const [panel, setPanel] = useState(() => { try { return localStorage.getItem('loggia-croqpanel') !== '0'; } catch (e) { return true; } });
  const togglePanel = () => setPanel(v => { const nv = !v; try { localStorage.setItem('loggia-croqpanel', nv ? '1' : '0'); } catch (e) {} return nv; });
  // Ration = poids d'une portion du distributeur (entité number, réglable)
  const setPortionWeight = (nv) => {
    const v = Math.max(2, Math.min(30, nv));
    call('number', 'set_value', { entity_id: croqHaids().portionWeight, value: v });
  };
  // Repas passés / à venir dans la journée
  const done = meals.filter(m => m.on && mealMin(m.time) <= nowMin);
  const doneG = done.reduce((t, m) => t + m.g, 0);
  const remaining = meals.filter(m => m.on && mealMin(m.time) > nowMin);
  const relTo = (t) => {
    const dm = mealMin(t) - nowMin;
    if (dm <= 0) return 'passé';
    const h = Math.floor(dm / 60), mn = dm % 60;
    return 'dans ' + (h ? h + ' h ' + String(mn).padStart(2, '0') : mn + ' min');
  };
  // Autonomie estimée : réservoir restant / ration quotidienne programmée
  const autonomy = (reservoirG != null && dayG > 0) ? Math.floor(reservoirG / dayG) : null;
  const online = !!(reservoirOk || (S && S[croqHaids().portionWeight]));

  return (
    <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>Croquettes</h1>
          <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>
            {upcoming ? 'Prochain repas ' + relTo(upcoming.time) : 'Plus de repas aujourd’hui'}
            {reservoirG != null ? ' · réservoir à ' + level + ' %' : ''}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: remaining.length ? 'rgba(var(--o-warn2-rgb),.14)' : 'var(--o-s2)', color: remaining.length ? 'var(--o-warn2)' : 'var(--o-text2)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: remaining.length ? 'var(--o-warn2)' : 'var(--o-text3)' }} />{remaining.length ? remaining.length + ' REPAS RESTANT' + (remaining.length > 1 ? 'S' : '') : 'JOURNÉE TERMINÉE'}</span>
      </div>

      {/* réglages rapides : distribution manuelle, ration, remplissage */}
      <div className="o-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,20px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)' }}>Distribuer</span>
            <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--o-text3)' }}>hors programme</span>
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3].map(n => (
              <button key={n} onClick={() => dispense(n)} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', background: 'var(--o-s1)', color: 'var(--o-text1)' }}>{Math.round(n * portionW)} g</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>Ration</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }} {...kbSlider('Poids d’une portion', portionW, setPortionWeight, { min: 2, max: 30, step: 1, unit: 'g' })}>
            <button onClick={() => setPortionWeight(portionW - 1)} aria-label="Baisser" style={{ width: 22, height: 22, borderRadius: 7, border: 'none', cursor: 'pointer', background: 'var(--o-s1)', color: 'var(--o-text1)', fontSize: 13, fontWeight: 600 }}>−</button>
            <span style={{ minWidth: 40, textAlign: 'center', fontSize: 12.5, fontWeight: 800, color: 'var(--o-warn)' }}>{Math.round(portionW)} g</span>
            <button onClick={() => setPortionWeight(portionW + 1)} aria-label="Monter" style={{ width: 22, height: 22, borderRadius: 7, border: 'none', cursor: 'pointer', background: 'var(--o-s1)', color: 'var(--o-text1)', fontSize: 13, fontWeight: 600 }}>+</button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{tr('Réservoir')}</span>
          <button onClick={refill} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', background: 'var(--o-s1)', color: 'var(--o-text1)' }}>Marquer rempli</button>
        </div>
        <span style={{ flex: 1 }} />
        <button onClick={togglePanel} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, border: panel ? 'var(--o-bw,1px) solid rgba(var(--o-accent-rgb),.44)' : 'var(--o-bw,1px) solid var(--o-bd1)', background: panel ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: panel ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}><Fi i="sliders-v" size={13} /><span className="o-barlabel">{panel ? tr('Masquer les réglages') : tr('Réglages de la vue')}</span></button>
      </div>

      {/* carte Distributeur */}
      {panel && (
        <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '20px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Distributeur</div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap', fontSize: 11, fontWeight: 800, background: online ? 'rgba(var(--o-ok-rgb),.14)' : 'var(--o-s2)', color: online ? 'var(--o-ok)' : 'var(--o-text2)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: online ? 'var(--o-ok)' : 'var(--o-text3)' }} />{online ? 'EN LIGNE' : tr('HORS LIGNE')}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, margin: '3px 0 8px' }}>{upcoming ? upcoming.label + ' à ' + upcoming.time + ' · ' + upcoming.g + ' g' : 'Programme terminé'} · {onCount} repas par jour</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <EnRow label={tr('Réservoir')} desc={autonomy != null ? (autonomy > 1 ? tr('Environ {n} jours d’autonomie', { n: autonomy }) : tr('Environ {n} jour d’autonomie', { n: autonomy })) : 'Niveau estimé, remis à 100 % au remplissage'}>
              <EnGauge v={reservoirG != null ? level + ' %' : '—'} pct={level} col={level < 20 ? 'var(--o-bad)' : level < 40 ? 'var(--o-warn2)' : 'var(--o-ok)'} />
            </EnRow>
            <EnRow label="Distribué aujourd'hui" desc={done.length + ' repas sur ' + onCount + (distribuees ? ' · compteur ' + distribuees + ' g' : '')}>
              <EnVal v={doneG + ' g'} col="var(--o-text)" />
            </EnRow>
            <EnRow label="Prochain repas" desc={upcoming ? upcoming.label: tr('Aucun repas restant aujourd’hui')}>
              <EnVal v={upcoming ? relTo(upcoming.time) : '—'} col={upcoming ? 'var(--o-warn2)' : 'var(--o-text3)'} />
            </EnRow>
            <EnRow label="Ration quotidienne" desc={'Somme des ' + onCount + ' repas activés'}>
              <EnVal v={dayG + ' g'} col="var(--o-accent-soft)" />
            </EnRow>
          </div>
        </div>
      )}

      {/* Repas du jour : une carte par repas, cliquable pour activer/désactiver */}
      <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>Repas du jour</div>
      <div className="grid-croqmeals" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(178px,1fr))', gap: 12 }}>
        {meals.map(m => {
          const passed = mealMin(m.time) <= nowMin;
          const next = upcoming && upcoming.id === m.id;
          return (
            <button key={m.id} onClick={() => toggleMeal(m)} title={(m.on ? 'Désactiver' : 'Activer') + ' « ' + m.label + ' »'}
              style={{ textAlign: 'left', cursor: 'pointer', padding: '13px 15px', borderRadius: 16, background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid ' + (next ? 'rgba(var(--o-warn2-rgb),.5)' : 'var(--o-bd2)'), opacity: m.on ? 1 : .55, transition: 'border-color .2s, opacity .2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: m.on ? (next ? 'rgba(var(--o-warn2-rgb),.16)' : 'rgba(var(--o-ok-rgb),.14)') : 'var(--o-s1)' }}><Ico name="paw" size={15} color={m.on ? (next ? 'var(--o-warn2)' : 'var(--o-ok)') : 'var(--o-text3)'} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800 }}>{m.time}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--o-text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</div>
                </div>
                {next && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--o-warn2)', flexShrink: 0 }} />}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 10 }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: !m.on ? 'var(--o-text3)' : passed ? 'var(--o-ok)' : next ? 'var(--o-warn2)' : 'var(--o-text)' }}>{m.g} g</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--o-text3)' }}>{!m.on ? tr('désactivé') : passed ? tr('distribué') : next ? relTo(m.time) : tr('programmé')}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CroquettesView({ hass }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <CroquettesContent hass={hass} />
    </main>
  );
}

/* ════════════ VUE MÉDIAS (reproduction fidèle de "Loggia Médias.dc.html") ════════════ */
// Vrais media_player (Apple TV + Echos Alexa + Soundbar).
// ── Accent dynamique tiré de la pochette (algo de la carte HOMEii Flow : canvas 40×40,
//    moyenne pondérée par saturation + lumière recentrée .4-.58, saturation min .48) ──
const NP_ACCENT_CACHE = new Map();
function npRgbToHsl([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4); h /= 6; } return [h, s, l]; }
function npHslToRgb([h, s, l]) { if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; } const q = l < .5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; const f = t => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(v * 255)); }
function extractNpAccent(url) {
  if (NP_ACCENT_CACHE.has(url)) return Promise.resolve(NP_ACCENT_CACHE.get(url));
  const p = new Promise(resolve => {
    try {
      const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = c.height = 40;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, 40, 40);
          const { data } = ctx.getImageData(0, 0, 40, 40);
          let acc = [0, 0, 0], w = 0;
          for (let i = 0; i < data.length; i += 16) {
            const a = (data[i + 3] || 0) / 255; if (a < .08) continue;
            const rgb = [data[i], data[i + 1], data[i + 2]];
            const [h, s, l] = npRgbToHsl(rgb);
            const bl = 1 - Math.abs(l - .52);
            const wt = a * (.2 + s * 1.9 + bl * .85);
            const tuned = npHslToRgb([h, Math.max(s, .48), Math.min(Math.max(l, .4), .58)]);
            acc = acc.map((e, j) => e + tuned[j] * wt); w += wt;
          }
          resolve(w ? acc.map(e => Math.max(0, Math.min(255, Math.round(e / w)))) : null);
        } catch (e) { resolve(null); } // canvas tainted (CORS) → pas d'accent, fallback thème
      };
      img.onerror = () => resolve(null);
      img.src = url;
    } catch (e) { resolve(null); }
  });
  NP_ACCENT_CACHE.set(url, p); p.then(v => NP_ACCENT_CACHE.set(url, v));
  return p;
}

const medKeys = () => medPlayers().flatMap(p => [p.haid, p.ma]).filter(Boolean);
const MED_LOGOS = {
  netflix: () => (
    <g transform="translate(-9,-11)">
      <rect x="0" y="0" width="5.4" height="22" fill="#fff" />
      <rect x="12.6" y="0" width="5.4" height="22" fill="#fff" />
      <path d="M0 0 L5.4 0 L18 22 L12.6 22 Z" fill="#fff" opacity=".62" />
    </g>
  ),
  disney: () => (
    <g fill="#fff">
      <text x="-1" y="6" textAnchor="middle" fontSize="19" fontWeight="800" fontStyle="italic" fontFamily="Georgia,serif">D</text>
      <path d="M8 -4 L11.4 -4 L11.4 -0.6 L14.8 -0.6 L14.8 2.8 L11.4 2.8 L11.4 6.2 L8 6.2 L8 2.8 L4.6 2.8 L4.6 -0.6 L8 -0.6 Z" />
    </g>
  ),
  primevideo: () => (
    <g>
      <path d="M-13 4 Q0 13 13 4" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M9 2.2 L14 3.4 L12.4 8" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <text x="0" y="-2" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff" fontFamily="var(--o-font)">prime</text>
    </g>
  ),
  appletv: () => (
    <g fill="#fff">
      <text x="-3" y="6" textAnchor="middle" fontSize="17" fontWeight="700" fontFamily="var(--o-font)">tv</text>
      <path d="M8 -3 L10.6 -3 L10.6 -0.4 L13.2 -0.4 L13.2 2.2 L10.6 2.2 L10.6 4.8 L8 4.8 L8 2.2 L5.4 2.2 L5.4 -0.4 L8 -0.4 Z" />
    </g>
  ),
  youtube: () => (
    <g>
      <rect x="-15" y="-10.5" width="30" height="21" rx="6.5" fill="#fff" />
      <path d="M-4 -5.4 L7 0 L-4 5.4 Z" fill="#ff0000" />
    </g>
  ),
  plex: () => (
    <path d="M-7 -11 L1 -11 L9 0 L1 11 L-7 11 L1 0 Z" fill="#1c1c1e" />
  ),
  spotify: () => (
    <g>
      <circle cx="0" cy="0" r="14" fill="#fff" />
      <g fill="none" stroke="#1db954" strokeLinecap="round">
        <path d="M-8 -5.4 Q0 -8.6 8.6 -4.2" strokeWidth="3" />
        <path d="M-6.6 0.4 Q0 -2.2 7 1.4" strokeWidth="2.6" />
        <path d="M-5.4 5.6 Q0 3.6 5.6 6.4" strokeWidth="2.2" />
      </g>
    </g>
  ),
};
const MED_APPS = [
  { id: 'plex', name: 'Plex', glyph: '›', bg: '#e5a00d' },
  { id: 'netflix', name: 'Netflix', glyph: 'N', bg: '#e50914' },
  { id: 'disney', name: 'Disney+', glyph: 'D+', bg: '#0c3b8c' },
  { id: 'primevideo', name: 'Prime Video', glyph: '▶', bg: '#00a8e1' },
  { id: 'youtube', name: 'YouTube', glyph: '▶', bg: '#ff0000' },
  { id: 'spotify', name: 'Spotify', glyph: 'S', bg: '#1db954' },
  { id: 'appletv', name: 'Apple TV+', glyph: 'tv+', bg: '#1c1c1e' },
];
const MED_INITIAL_SPK = [
  { id: 'atv', name: 'Apple TV', vol: 0, muted: true },
  { id: 'atv-s', name: 'Apple TV Séjour', vol: 0, muted: true },
  { id: 'echo-sejour', name: 'Echo Séjour', vol: 30, color: 'var(--o-purple)' },
  { id: 'enceinte-chambre', name: 'Enceinte Chambre', vol: 0, muted: true },
  { id: 'enceinte-bureau', name: 'Enceinte Bureau', vol: 0, muted: true },
  { id: 'enceinte-salon', name: 'Enceinte Salon', vol: 30, color: 'var(--o-purple)' },
  { id: 'echo-enfant', name: 'Enceinte · Chambre enfant', vol: 16, color: 'var(--o-cyan)' },
];

/**
 * Televiseur (ou box) plutot qu'enceinte ?
 *
 * `device_class` ne suffit pas : plusieurs integrations, dont Apple TV,
 * declarent `speaker` sur un appareil qui pilote pourtant un ecran. On
 * interroge donc les CAPACITES avant de croire l'etiquette ; le nom ne sert
 * qu'en dernier recours.
 */
function medEstTv(hass, haid) {
  const st = (hass && hass.states && hass.states[haid]) || null;
  const att = (st && st.attributes) || {};
  if (att.device_class === 'tv') return true;
  // Une box ou un televiseur expose presque toujours une entite `remote`.
  if (medRemoteOf(hass, haid)) return true;
  // SELECT_SOURCE (2048) : choisir une entree est le propre d'un appareil a
  // ecran. Les enceintes ne l'exposent quasiment jamais.
  if ((+att.supported_features || 0) & 2048) return true;
  // Une liste de sources applicatives trahit un lecteur video.
  if (Array.isArray(att.source_list) && att.source_list.length > 1) return true;
  if (att.device_class === 'speaker') return false;
  return /(\btv\b|télé|televiseur|chromecast|google\s*tv|apple\s*tv|shield|firestick|\bbox\b)/i.test(String(att.friendly_name || haid));
}
/** Entite `remote.*` du meme appareil, reperee par suffixe d'identifiant. */
function medRemoteOf(hass, haid) {
  const S = (hass && hass.states) || {};
  if (!haid) return null;
  const suffixe = haid.slice(haid.indexOf('.') + 1);
  return S['remote.' + suffixe] ? 'remote.' + suffixe : null;
}

/**
 * Panneau telecommande. Rend toujours quelque chose : les touches, ou la
 * raison pour laquelle il n'y en a pas.
 */
function MedRemote({ hass, sel, tvs, onPick }) {
  const haid = sel && sel.haid;
  const estTv = haid ? medEstTv(hass, haid) : false;
  const rid = haid ? medRemoteOf(hass, haid) : null;
  const att = (hass && hass.states && hass.states[haid] && hass.states[haid].attributes) || {};
  const call = (dom, svc, data) => { try { if (hass && hass.callService) hass.callService(dom, svc, data || {}); } catch (e) {} };
  const cmd = (c) => { if (rid) call('remote', 'send_command', { entity_id: rid, command: c }); };
  const mp = (svc) => call('media_player', svc, { entity_id: haid });

  const carte = { background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '18px 20px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' };
  const touche = (extra) => ({ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '11px 0', borderRadius: 12, cursor: rid ? 'pointer' : 'not-allowed', opacity: rid ? 1 : .4, fontSize: 11, fontWeight: 700, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text2)', ...extra });
  const rond = { position: 'absolute', width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--o-text2)', cursor: rid ? 'pointer' : 'not-allowed', opacity: rid ? 1 : .4, fontSize: 15, fontWeight: 700 };
  const petit = { position: 'static', width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'transparent', fontSize: 14, fontWeight: 700, color: 'var(--o-text2)' };

  const entete = (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{tr('Télécommande')}</div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {sel ? sel.name : '—'}{att.source ? ' · ' + att.source : ''}
      </div>
    </div>
  );

  if (!sel || !estTv) {
    return (
      <div style={carte}>
        {entete}
        <div style={{ textAlign: 'center', padding: '18px 6px 6px' }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, margin: '0 auto 14px', background: 'var(--o-s2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Fi i="volume" size={19} color="var(--o-accent-soft)" />
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{sel ? sel.name + ' est une enceinte' : 'Aucun lecteur sélectionné'}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', margin: '7px 0 16px', lineHeight: 1.5 }}>
            La télécommande n’apparaît que pour les téléviseurs. Choisis-en un pour la retrouver.
          </div>
          {tvs.length > 0 && (
            <button onClick={() => onPick(tvs[0].id)} style={{ padding: '9px 16px', borderRadius: 11, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: 'rgba(var(--o-accent-rgb),.16)', border: '1px solid rgba(var(--o-accent-rgb),.45)', color: 'var(--o-accent-soft)' }}>
              Passer sur {tvs[0].name}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={carte}>
      {entete}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
        <button onClick={() => mp('turn_off')} style={touche({ cursor: 'pointer', opacity: 1, color: 'var(--o-bad)', border: '1px solid rgba(var(--o-bad-rgb),.4)' })}><Fi i="power" size={15} color="var(--o-bad)" />Veille</button>
        <button onClick={() => cmd('HOME')} style={touche()}><Fi i="home" size={15} />Accueil</button>
        <button onClick={() => cmd('INPUT')} style={touche()}><Fi i="exchange" size={15} />Sources</button>
      </div>

      <div style={{ position: 'relative', width: 172, height: 172, margin: '16px auto', borderRadius: '50%', background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button onClick={() => cmd('DPAD_UP')} style={{ ...rond, top: 6, left: '50%', transform: 'translateX(-50%)' }}>∧</button>
        <button onClick={() => cmd('DPAD_DOWN')} style={{ ...rond, bottom: 6, left: '50%', transform: 'translateX(-50%)' }}>∨</button>
        <button onClick={() => cmd('DPAD_LEFT')} style={{ ...rond, left: 6, top: '50%', transform: 'translateY(-50%)' }}>‹</button>
        <button onClick={() => cmd('DPAD_RIGHT')} style={{ ...rond, right: 6, top: '50%', transform: 'translateY(-50%)' }}>›</button>
        <button onClick={() => cmd('DPAD_CENTER')} style={{ width: 64, height: 64, borderRadius: '50%', cursor: rid ? 'pointer' : 'not-allowed', opacity: rid ? 1 : .4, fontSize: 13.5, fontWeight: 800, background: 'rgba(var(--o-accent-rgb),.16)', border: '1px solid rgba(var(--o-accent-rgb),.45)', color: 'var(--o-accent-soft)' }}>OK</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
        <button onClick={() => cmd('BACK')} style={touche()}><Fi i="arrow-left" size={15} />Retour</button>
        <button onClick={() => cmd('MENU')} style={touche()}><Fi i="menu-burger" size={15} />Menu</button>
        <button onClick={() => cmd('GUIDE')} style={touche()}><Fi i="list" size={15} />Guide</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 9 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '7px 10px', borderRadius: 12, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
          <button onClick={() => mp('volume_down')} style={{ ...petit, cursor: 'pointer' }}>−</button>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--o-accent-soft)', letterSpacing: '.06em' }}>VOLUME</span>
          <button onClick={() => mp('volume_up')} style={{ ...petit, cursor: 'pointer' }}>+</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '7px 10px', borderRadius: 12, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
          <button onClick={() => cmd('CHANNEL_DOWN')} style={{ ...petit, cursor: rid ? 'pointer' : 'not-allowed', opacity: rid ? 1 : .4 }}>−</button>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--o-text3)', letterSpacing: '.06em' }}>{tr('CHAÎNE')}</span>
          <button onClick={() => cmd('CHANNEL_UP')} style={{ ...petit, cursor: rid ? 'pointer' : 'not-allowed', opacity: rid ? 1 : .4 }}>+</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 9, marginTop: 9 }}>
        {peut(hass, haid, 'mute') && (
          <button onClick={() => commander(hass, haid, 'mute', true)} style={touche({ cursor: 'pointer', opacity: 1 })}><Fi i="volume-slash" size={14} /></button>)}
        {peut(hass, haid, 'previous_track') && (
          <button onClick={() => commander(hass, haid, 'previous_track')} style={touche({ cursor: 'pointer', opacity: 1 })}><Fi i="rewind" size={14} /></button>)}
        {peut(hass, haid, 'play_pause') && (
          <button onClick={() => commander(hass, haid, 'play_pause')} style={touche({ cursor: 'pointer', opacity: 1, background: 'rgba(var(--o-accent-rgb),.16)', border: '1px solid rgba(var(--o-accent-rgb),.45)', color: 'var(--o-accent-soft)' })}><Fi i="play" size={14} color="var(--o-accent-soft)" /></button>)}
        {peut(hass, haid, 'next_track') && (
          <button onClick={() => commander(hass, haid, 'next_track')} style={touche({ cursor: 'pointer', opacity: 1 })}><Fi i="forward" size={14} /></button>)}
      </div>

      {!rid && (
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', marginTop: 12, lineHeight: 1.5 }}>
          Aucune entité <b>remote</b> pour ce lecteur : seules les commandes de lecture et de volume répondent.
        </div>
      )}
    </div>
  );
}

function MediasContent({ hass, edit = false, onEnt }) {
  // Une seule evaluation par rendu. Chaque appel relit la configuration et
  // realloue ses tableaux ; il y en avait quinze, rejoues chaque seconde par le
  // tick de progression tant qu'un media joue. Pas de useMemo : la valeur doit
  // rester fraiche a chaque rendu, c'est la repetition qu'on supprime.
  const lecteurs = medPlayers();
  const S = (hass && hass.states) || null;
  // media_position est un instantané HA : en lecture on l'extrapole avec media_position_updated_at.
  const rd1 = (id) => { const e = S && S[id]; if (!e) return { state: 'off', on: false, ctl: id }; const a = e.attributes || {}; const playing = e.state === 'playing'; let pos = a.media_position; if (pos != null && playing && a.media_position_updated_at) { const dt = (Date.now() - Date.parse(a.media_position_updated_at)) / 1000; if (dt > 0) pos += dt; } if (pos != null && a.media_duration) pos = Math.min(pos, a.media_duration); return { state: e.state, on: e.state !== 'off' && e.state !== 'unavailable' && e.state != null && e.state !== 'standby', playing, title: a.media_title, artist: a.media_artist || a.media_album_artist, album: a.media_album_name, art: a.entity_picture_local || a.entity_picture, pos, dur: a.media_duration, vol: a.volume_level != null ? Math.round(a.volume_level * 100) : 0, hasVol: a.volume_level != null, muted: !!a.is_volume_muted, shuffle: !!a.shuffle, repeat: a.repeat || 'off', source: a.app_name || a.source, mtype: a.media_content_type, ctl: id }; };
  // Fusion Music Assistant : si le compagnon MA a du contenu, il fournit métas + transport (ctl) ;
  // le volume reste sur l'entité native (le vrai volume de l'enceinte).
  const rd = (p) => {
    // Aucun lecteur : on rend un etat neutre plutot que de lire `p.haid` sur
    // `undefined`. La vue est atteignable avant que la decouverte reponde.
    if (!p) return rd1(null);
    const id = typeof p === 'string' ? p : p.haid;
    const maId = typeof p === 'string' ? null : p.ma;
    const nat = rd1(id);
    if (!maId) return nat;
    const ma = rd1(maId);
    // Le compagnon MA ne gagne QUE s'il joue, ou s'il est en pause pendant que le natif ne joue rien —
    // sinon une vieille musique MA en pause masquerait la TV en cours sur l'Apple TV.
    const maActive = (ma.title || ma.art) && (ma.playing || (ma.state === 'paused' && !nat.playing));
    if (!maActive) return nat;
    return { ...nat, playing: ma.playing || nat.playing, on: true, title: ma.title || nat.title, artist: ma.artist || nat.artist, album: ma.album || nat.album, art: ma.art || nat.art, pos: ma.pos != null ? ma.pos : nat.pos, dur: ma.dur != null ? ma.dur : nat.dur, shuffle: ma.shuffle, repeat: ma.repeat, source: ma.source || nat.source || 'Music Assistant', ctl: maId };
  };
  // tick 1 s local pour faire avancer la progression pendant la lecture (vue montée uniquement)
  const [, medTick] = useState(0);
  // Agencement : les lecteurs configurés d'abord, puis ceux que Home Assistant
  // expose et que la configuration ne nomme pas.
  const derivedMed = useMemo(() => {
    const dejaLa = lecteurs.map(p => p.haid).filter(Boolean);
    return [...dejaLa, ...Object.keys(S).filter(k => k.indexOf('media_player.') === 0 && dejaLa.indexOf(k) < 0).sort()];
  }, [Object.keys(S).length]);
  const ed = useLayoutEditor('loggia_medlayout', 'medias', derivedMed);
  const dc = useDomainCards(hass);
  const [cardEdit, setCardEdit] = useState(null);
  const [addSheet, setAddSheet] = useState(false);
  const origineDe = (k) => {
    if (k.indexOf('sect:') === 0) return k.slice(5) || tr('Section');
    const p = lecteurs.find(x => x.haid === k);
    if (p && p.name) return p.name;
    const st = S && S[k];
    return (st && st.attributes && st.attributes.friendly_name) || k;
  };
  const nomDe = (k) => ed.labelOf(k) || origineDe(k);
  const addSection = () => ed.toggle('sect:' + Date.now().toString(36));
  const blocs = [];
  ed.ids.forEach(k => {
    if (k.indexOf('sect:') === 0) blocs.push({ titre: k, cartes: [] });
    else {
      if (!blocs.length) blocs.push({ titre: null, cartes: [] });
      blocs[blocs.length - 1].cartes.push(k);
    }
  });

  const anyPlaying = lecteurs.some(p => [p.haid, p.ma].filter(Boolean).some(id => { const e = S && S[id]; return e && e.state === 'playing'; }));
  useEffect(() => { if (!anyPlaying) return; const iv = setInterval(() => medTick(n => n + 1), 1000); return () => clearInterval(iv); }, [anyPlaying]);
  const playingP = lecteurs.find(p => rd(p).playing);
  const [device, setDevice] = useState(null);
  const selId = device || (playingP ? playingP.id : 'echo_salon');
  const sel = lecteurs.find(p => p.id === selId) || lecteurs[0] || null;
  const np = rd(sel);
  const selEstTv = !!(sel && medEstTv(hass, sel.haid));
  const [panel, setPanel] = useState(() => { try { return localStorage.getItem('loggia-medpanel') !== '0'; } catch (e) { return true; } });
  const togglePanel = () => setPanel(v => { const nv = !v; try { localStorage.setItem('loggia-medpanel', nv ? '1' : '0'); } catch (e) {} return nv; });
  const derivedVols = Object.fromEntries(lecteurs.map(p => { const st = rd1(p.haid); return [p.id, st.hasVol ? st.vol : 0]; }));
  const vsig = lecteurs.map(p => derivedVols[p.id]).join(',');
  const [vols, setVols] = useState(derivedVols);
  useEffect(() => { setVols(derivedVols); }, [vsig]);
  const call = (svc, data) => { try { if (hass && hass.callService) hass.callService('media_player', svc, data || {}); } catch (e) {} };
  const drag = (p, e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const calc = x => Math.max(0, Math.min(100, Math.round((x - rect.left) / rect.width * 100)));
    let v = calc(e.clientX); setVols(o => ({ ...o, [p.id]: v }));
    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch (x) {}
    const end = () => { el.onpointermove = null; el.onpointerup = null; el.onpointercancel = null; };
    el.onpointermove = ev => { v = calc(ev.clientX); setVols(o => ({ ...o, [p.id]: v })); };
    el.onpointerup = () => { commander(hass, p.haid, 'set_volume', v / 100); end(); };
    el.onpointercancel = end;
  };
  const playPause = () => commander(hass, np.ctl, 'play_pause');
  /**
   * Monter ou baisser le volume d'un cran.
   *
   * `volume_up` et `volume_set` sont deux bits distincts : huit lecteurs de
   * l'installation d'essai acceptent un volume absolu sans accepter les crans.
   * Plutot que de retirer les boutons, on calcule le pas nous-memes.
   */
  const volPas = (delta) => {
    const id = sel && sel.haid;
    if (peut(hass, id, delta > 0 ? 'volume_up' : 'volume_down')) {
      commander(hass, id, delta > 0 ? 'volume_up' : 'volume_down');
    } else {
      commander(hass, id, 'set_volume', ((np.vol || 0) + delta) / 100);
    }
  };
  const next = () => commander(hass, np.ctl, 'next_track');
  const prev = () => commander(hass, np.ctl, 'previous_track');
  const muteAll = () => { setVols(o => Object.fromEntries(lecteurs.map(p => [p.id, 0]))); lecteurs.forEach(p => commander(hass, p.haid, 'set_volume', 0)); };
  const fmtT = (s) => { if (s == null || isNaN(s)) return '0:00'; const m = Math.floor(s / 60), ss = Math.floor(s % 60); return m + ':' + (ss < 10 ? '0' : '') + ss; };
  const progPct = (np.pos != null && np.dur) ? Math.min(100, np.pos / np.dur * 100) : 0;
  const playTitle = np.title || (np.playing ? tr('En lecture') : np.on ? tr('En pause') : tr('Rien en lecture'));
  const playSub = [np.artist, np.album].filter(Boolean).join(' · ') || (np.on ? sel.name : '—');
  const eqBar = (delay) => ({ width: 3, background: 'var(--o-purple)', borderRadius: 2, height: '100%', transformOrigin: 'bottom', animation: `eq .8s ease-in-out infinite ${delay}`, animationPlayState: np.playing ? 'running' : 'paused' });
  const setShuffle = () => commander(hass, np.ctl, 'set_shuffle', !np.shuffle);
  const cycleRepeat = () => { const o = ['off', 'all', 'one'], i = o.indexOf(np.repeat); commander(hass, np.ctl, 'set_repeat', o[(i + 1) % 3]); };
  // Seek sur la barre de progression (pointer capture + peinture DOM directe, commit media_seek au relâcher).
  // seekOv = override optimiste le temps que HA confirme la nouvelle position.
  const [seekOv, setSeekOv] = useState(null);
  const seekTimer = useRef(null);
  useEffect(() => () => clearTimeout(seekTimer.current), []);
  const seekDrag = (e) => {
    if (!np.dur) return;
    e.preventDefault();
    const el = e.currentTarget;
    const fill = el.querySelector('[data-seekfill]');
    const r = el.getBoundingClientRect();
    const calc = x => Math.max(0, Math.min(100, (x - r.left) / r.width * 100));
    let v = calc(e.clientX);
    const paint = () => { if (fill) { fill.style.transition = 'none'; fill.style.width = v + '%'; } };
    paint();
    try { el.setPointerCapture(e.pointerId); } catch (er) {}
    el.onpointermove = ev => { v = calc(ev.clientX); paint(); };
    const end = () => { el.classList.remove('o-sliding'); el.onpointermove = null; el.onpointerup = null; el.onpointercancel = null; if (fill) fill.style.transition = ''; };
    el.onpointerup = () => { end(); const secs = v / 100 * np.dur; setSeekOv(secs); commander(hass, np.ctl, 'seek', Math.round(secs)); clearTimeout(seekTimer.current); seekTimer.current = setTimeout(() => setSeekOv(null), 3000); };
    el.onpointercancel = () => { end(); if (fill) fill.style.width = progPct + '%'; };
  };
  const showPos = seekOv != null ? seekOv : np.pos;
  const showPct = (showPos != null && np.dur) ? Math.min(100, showPos / np.dur * 100) : 0;
  // Artwork en erreur : on mémorise l'URL fautive (state) au lieu de cacher l'<img> en dur —
  // sinon display:none survivait aux changements de piste et l'image ne revenait jamais.
  // Et comme l'URL proxy Apple TV peut rester IDENTIQUE avec un token redevenu valide,
  // on retente automatiquement au bout de 8 s au lieu de bloquer l'URL pour toujours.
  const [artErr, setArtErr] = useState(null);
  useEffect(() => {
    if (!artErr) return;
    const t = setTimeout(() => setArtErr(null), 8000);
    return () => clearTimeout(t);
  }, [artErr]);
  const artOk = np.art && np.art !== artErr;
  const onArt = !!artOk; // artwork présent → textes blancs sur l'ambiance floutée (assombrie, lisible dans les deux modes)
  // Accent dynamique extrait de la pochette (comme la carte d'origine) → barre, badge, glow.
  const [npAccent, setNpAccent] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!artOk) { setNpAccent(null); return; }
    extractNpAccent(np.art).then(v => { if (alive) setNpAccent(v); });
    return () => { alive = false; };
  }, [np.art, artOk]);
  const accR = npAccent ? npAccent.join(',') : null;
  const acc = accR ? `rgb(${accR})` : 'var(--o-accent)';
  const accA = (al) => accR ? `rgba(${accR},${al})` : `rgba(var(--o-accent-rgb),${al})`;
  const accLight = npAccent ? `rgb(${npAccent.map(v => Math.round(v + (255 - v) * .28)).join(',')})` : 'var(--o-accent-soft)';
  // Boutons "verre" de la carte d'origine : squircle, dégradé blanc translucide, blur, liseré haut.
  const glass = (size, rad) => ({ width: size, height: size, borderRadius: rad, flexShrink: 0, border: onArt ? '1px solid rgba(255,255,255,.14)' : 'var(--o-bw,1px) solid var(--o-bd1)', cursor: 'pointer', color: onArt ? '#fff' : 'var(--o-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: onArt ? 'linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.06))' : 'var(--o-s1)', backdropFilter: 'blur(14px) saturate(1.38)', WebkitBackdropFilter: 'blur(14px) saturate(1.38)', boxShadow: '0 12px 26px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.08)', position: 'relative' });
  const mutedSel = np.hasVol && vols[sel.id] === 0;
  const tMain = onArt ? '#fff' : 'var(--o-text)';
  const tSub = onArt ? 'rgba(255,255,255,.75)' : 'var(--o-text2)';
  const tDim = onArt ? 'rgba(255,255,255,.55)' : 'var(--o-text3)';

  return (
    <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <ViewHead titre={tr('Médias')}
        sous={(lecteurs.length > 1 ? tr('{n} lecteurs', { n: lecteurs.length }) : tr('{n} lecteur', { n: lecteurs.length }))
          + (sel ? ' · ' + sel.name + ' ' + (np.playing ? tr('en lecture') : tr('au repos')) : '')}
        badge={np.playing ? tr('en lecture') : tr('au repos')} rgb={np.playing ? '52,211,153' : '140,152,180'} />

      <ViewBar panel={panel} onPanel={togglePanel}>
        <BarGroup label={tr('Lecture')} sous={sel ? sel.name : null}>
          {peut(hass, sel && sel.haid, 'previous_track') && (
            <button onClick={() => commander(hass, sel && sel.haid, 'previous_track')} style={barBtn(false)}>{tr('Précédent')}</button>)}
          {peut(hass, sel && sel.haid, 'play_pause') && (
            <button onClick={() => commander(hass, sel && sel.haid, 'play_pause')} style={barBtn(np.playing)}>{np.playing ? 'Pause' : tr('Lecture')}</button>)}
          {peut(hass, sel && sel.haid, 'next_track') && (
            <button onClick={() => commander(hass, sel && sel.haid, 'next_track')} style={barBtn(false)}>Suivant</button>)}
        </BarGroup>
        {(peut(hass, sel && sel.haid, 'volume_up') || peut(hass, sel && sel.haid, 'set_volume')) && (
          <BarGroup label="Volume" sous={sel ? sel.name : null}>
            <button onClick={() => volPas(-5)} style={barBtn(false)}>−</button>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--o-accent-soft)', minWidth: 44, textAlign: 'center' }}>{Math.round(np.vol)} %</span>
            <button onClick={() => volPas(5)} style={barBtn(false)}>+</button>
          </BarGroup>
        )}
        {sel && S[sel.haid] && S[sel.haid].attributes && S[sel.haid].attributes.shuffle != null && (
          <BarGroup label={tr('Aléatoire')}>
            <button onClick={() => commander(hass, sel.haid, 'set_shuffle', !S[sel.haid].attributes.shuffle)}
              style={barBtn(!!S[sel.haid].attributes.shuffle)}>{S[sel.haid].attributes.shuffle ? 'Activé' : 'Désactivé'}</button>
          </BarGroup>
        )}
      </ViewBar>




      {panel && (() => {
        const att = (sel && S && S[sel.haid] && S[sel.haid].attributes) || {};
        const source = att.source || att.app_name || null;
        const autres = lecteurs.filter(x => !sel || x.id !== sel.id);
        const repos = autres.filter(x => !rd(x).playing).length;
        return (
          <PresCard titre={(sel && sel.name) || tr('Lecteurs')}
            lead={(np.playing ? tr('Lecture en cours') : tr('Au repos')) + (np.hasVol ? ' · ' + tr('volume {n} %', { n: Math.round(np.vol) }) : '')}
            badge={np.playing ? tr('en lecture') : tr('au repos')} rgb={np.playing ? '52,211,153' : '140,152,180'}>
            <PresLigne titre="Progression"
              sous={np.title ? (np.artist ? np.title + ' · ' + np.artist : np.title) : tr('Aucun média en cours sur ce lecteur')}
              valeur={np.title ? (np.playing ? tr('en lecture') : 'en pause') : '—'}
              couleur={np.title ? 'var(--o-accent-soft)' : 'var(--o-text3)'} />
            <PresLigne titre="Source" sous={source ? 'Entrée active du lecteur' : 'Aucune source active'}
              valeur={source || '—'} couleur={source ? 'var(--o-gold)' : 'var(--o-text3)'} />
            <PresLigne titre={tr('Autres lecteurs')}
              sous={autres.map(x => x.name || x.id).slice(0, 3).join(', ') || tr('Aucun autre lecteur')}
              valeur={autres.length ? tr('{n} au repos sur {t}', { n: repos, t: autres.length }) : '—'} />
          </PresCard>
        );
      })()}

      {/* « Lancer sur » et la telecommande, cote a cote. */}
      <div className="grid-medlaunch" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(260px,1fr)', gap: 18, alignItems: 'start' }}>
        <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '16px 18px 14px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{tr('Lancer sur')}</span>
            {lecteurs.map(x => (
              <button key={x.id} onClick={() => setDevice(x.id)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                background: sel && x.id === sel.id ? 'rgba(var(--o-accent-rgb),.16)' : 'var(--o-s2)',
                border: sel && x.id === sel.id ? '1px solid rgba(var(--o-accent-rgb),.5)' : 'var(--o-bw,1px) solid var(--o-bd2)',
                color: sel && x.id === sel.id ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}>
                <Fi i={medEstTv(hass, x.haid) ? 'screen' : 'volume'} size={13} />{x.name}
              </button>
            ))}
          </div>
        <div className="grid-apps" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 14 }}>
          {MED_APPS.map(a => (
            <button key={a.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '18px 10px', borderRadius: 'var(--o-radius,18px)', background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', cursor: 'pointer', transition: 'all .2s' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="-16 -16 32 32" width="32" height="32" aria-hidden="true">{(MED_LOGOS[a.id] || MED_LOGOS.plex)()}</svg>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{a.name}</span>
            </button>
          ))}
        </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14, padding: '10px 12px', borderRadius: 12, background: 'var(--o-s2)', fontSize: 11.5, fontWeight: 600, color: 'var(--o-text2)' }}>
            <Fi i={selEstTv ? 'screen' : 'volume'} size={13} color="var(--o-accent-soft)" />
            {sel
              ? (selEstTv
                ? tr('Le service s’ouvre sur {nom} et la télécommande passe dessus.', { nom: sel.name })
                : sel.name + ' est une enceinte : seules les applications audio peuvent y être envoyées.')
              : 'Choisis un lecteur pour y envoyer un service.'}
          </div>
        </div>
        <MedRemote hass={hass} sel={sel} tvs={lecteurs.filter(x => medEstTv(hass, x.haid))} onPick={setDevice} />
      </div>

      {edit && (
        <ViewEditBar onEnt={onEnt}
          texte={'Mode édition : clique un lecteur pour le modifier, glisse-le pour le déplacer.'
            + (ed.edits ? ' Cette vue est personnalisée.' : ' Cette vue suit la détection automatique.')}>
          <button onClick={() => setAddSheet(true)} style={editBtn(true)}>{tr('Ajouter un lecteur')}</button>
          <button onClick={addSection} style={editBtn(false)}>{tr('Ajouter un titre')}</button>
          {ed.edits > 0 && <button onClick={ed.reset} style={editBtn(false)}>{tr("Rétablir l'automatique")}</button>}
        </ViewEditBar>
      )}
      {(edit || ed.ids.length > 0) && (
        <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{tr('Lecteurs')}</div>
      )}
      <div ref={ed.gridRef} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {blocs.map((bloc, bi) => {
          if (!edit && bloc.titre && !bloc.cartes.length) return null;
          return (
            <div key={bloc.titre || 'b' + bi} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {bloc.titre && (edit
                ? <EditableCard plat ed={ed} id={bloc.titre} nom={nomDe(bloc.titre)} onEdit={setCardEdit}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 12px' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'var(--o-text3)' }}>{String(nomDe(bloc.titre)).toUpperCase()}</span>
                      <span style={{ height: 1, flex: 1, background: 'var(--o-bd3)' }} />
                    </div>
                  </EditableCard>
                : <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '4px 0 0' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'var(--o-text3)' }}>{String(nomDe(bloc.titre)).toUpperCase()}</span>
                    <span style={{ height: 1, flex: 1, background: 'var(--o-bd3)' }} />
                  </div>)}
              <div className="grid-roomdev" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(232px,1fr))', gap: 14 }}>
                {bloc.cartes.map(k => {
                  const carte = ed.typeOf(k) ? <CvTyped x={{ t: ed.typeOf(k), id: k }} hass={hass} dc={dc} /> : dc.card(k, ed.labelOf(k));
                  if (!edit) return <Anim key={k} i={ed.ids.indexOf(k)} className={ed.estLarge(k) ? 'o-cvw2' : ''}>{carte}</Anim>;
                  return <EditableCard key={k} ed={ed} id={k} nom={nomDe(k)} onEdit={setCardEdit}>{carte}</EditableCard>;
                })}
              </div>
            </div>
          );
        })}
      </div>
      {dc.sheets}
      {cardEdit && <CardEditSheet ed={ed} id={cardEdit} nom={nomDe(cardEdit)} origine={origineDe(cardEdit)} hass={hass} onClose={() => setCardEdit(null)} />}
      {addSheet && <RoomAddSheet hass={hass} present={ed.ids} onToggle={ed.toggle} entete={tr('Ajouter un lecteur')}
        domaines={['media_player']} onClose={() => setAddSheet(false)} />}
    </div>
  );
}

function MediasView({ hass, edit = false, onEnt }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <MediasContent hass={hass} edit={edit} onEnt={onEnt} />
    </main>
  );
}

/* ════════════ VUE SÉCURITÉ (design fidèle "Loggia Sécurité.dc.html", câblé HA réel) ════════════ */
const secBaseKeys = () => {
  const cams = loggiaEnt('cameras', null);
  const gens = peopleList();
  return [secAlarm(),
    ...(Array.isArray(cams) ? cams.flatMap(c => [c.haid, c.motion, c.person, c.vehicle, c.sonnette, c.colis]) : []),
    ...gens.map(x => x.haid)].filter(Boolean);
};
// Les etats qui valent « quelque chose se passe » : ceux d'un binary_sensor,
// plus `home` pour une personne. Partages entre la lecture du direct et le
// comptage de l'historique, qui doivent s'accorder.
const ACTIFS = ['on', 'true', 'True', 'detected', 'Detected', 'home'];

/**
 * Detections par heure sur les 24 dernieres heures, comptees dans l'historique
 * de Home Assistant.
 *
 * Ces 24 valeurs etaient auparavant ecrites en dur — un « profil illustratif »
 * affiche sous la legende « Detections camera par heure ». Le graphique
 * montrait donc la meme journee inventee a tout le monde, et personne ne
 * pouvait le deviner.
 *
 * Seules les transitions vers l'etat actif comptent : une presence qui dure une
 * heure est un evenement, pas soixante. `null` tant que la reponse n'est pas la,
 * ou si l'historique n'est pas accessible — la ligne disparait alors, plutot que
 * de montrer une journee vide qu'on prendrait pour du calme.
 */
function useCamHist(hass, ids) {
  const [data, setData] = useState(null);
  const cle = ids.filter(Boolean).join('|');
  useEffect(() => {
    let vivant = true;
    if (!hass || !hass.callApi || !cle) { setData(null); return undefined; }
    const debut = new Date(Date.now() - 24 * 3600 * 1000);
    hass.callApi('GET', 'history/period/' + debut.toISOString()
      + '?filter_entity_id=' + encodeURIComponent(cle.split('|').join(','))
      + '&minimal_response&no_attributes')
      .then(res => {
        if (!vivant) return;
        if (!Array.isArray(res)) { setData(null); return; }
        const actif = e => ACTIFS.indexOf(String(e && e.state)) >= 0;
        // Case 23 = heure courante ; case 0 = la meme heure hier.
        const heures = new Array(24).fill(0);
        const base = debut.getTime();
        res.forEach(serie => {
          if (!Array.isArray(serie)) return;
          let precedent = false;
          serie.forEach(e => {
            const maintenant = actif(e);
            if (maintenant && !precedent) {
              const t = new Date(e.last_changed || e.last_updated || 0).getTime();
              const i = Math.floor((t - base) / 3600000);
              if (i >= 0 && i < 24) heures[i]++;
            }
            precedent = maintenant;
          });
        });
        setData(heures);
      })
      .catch(() => { if (vivant) setData(null); });
    return () => { vivant = false; };
  }, [hass ? 1 : 0, cle]);
  return data;
}

function SecuriteContent({ hass, edit = false, onEnt }) {
  const S = (hass && hass.states) || {};
  const isOn = id => { const s = id && S[id]; return !!(s && ACTIFS.indexOf(s.state) >= 0); };
  // ── Sources : configuration utilisateur d'abord, découverte ensuite ──
  const { resolved } = useLoggia();
  const alarmCfg = useEntities('alarm', null);
  const rAlarm = (resolved && resolved.alarm && resolved.alarm.available) ? resolved.alarm : null;
  const rCams = (resolved && resolved.cameras && resolved.cameras.available) ? resolved.cameras.list : [];
  const alarmId = (alarmCfg && S[alarmCfg]) ? alarmCfg : (secAlarm() && S[secAlarm()]) ? secAlarm() : (rAlarm ? rAlarm.main : null);
  // Une seule source : la résolution, qui prend déjà la liste de l'utilisateur
  // quand il en a une, et la complète par les détecteurs du même appareil.
  const camList = rCams.map(c => ({
    haid: c.haid || c.id, label: c.label || c.name,
    motion: c.motion, person: c.person, vehicle: c.vehicle, sonnette: c.sonnette, colis: c.colis,
    preset: c.preset,
  })).filter(c => c && c.haid);
  // Même source que l'accueil : une personne ne peut pas exister ici et pas là.
  const secPeople = peopleList().filter(p => p && p.haid);
  // ── Alarme : état réel + optimiste ──
  const alarmRaw = (alarmId && S[alarmId]) ? S[alarmId].state : null;
  const rawMode = alarmRaw == null ? 'unknown'
    : (alarmRaw === 'armed_away' || alarmRaw === 'armed_vacation') ? 'away'
      : alarmRaw === 'armed_home' ? 'home'
        : alarmRaw === 'armed_night' ? 'night'
          : alarmRaw === 'triggered' ? 'triggered' : 'off';
  const [alarm, setAlarm] = useState(rawMode);
  useEffect(() => { setAlarm(rawMode); }, [rawMode]);
  const arming = alarmRaw === 'arming' || alarmRaw === 'pending';
  // Optimiste avec filet : si HA n'a pas confirmé sous 6s (appel rejeté, code requis…), on revient à l'état réel.
  const alarmRevertRef = useRef(null);
  useEffect(() => () => clearTimeout(alarmRevertRef.current), []);
  const callAlarm = (svc, mode) => {
    setAlarm(mode);
    try { if (hass && hass.callService && alarmId) hass.callService('alarm_control_panel', svc, { entity_id: alarmId }); } catch (e) {}
    clearTimeout(alarmRevertRef.current);
    alarmRevertRef.current = setTimeout(() => { const cur = getHass(); const st = (cur && cur.states && alarmId && cur.states[alarmId]) ? cur.states[alarmId].state : null; const m = (st === 'armed_away' || st === 'armed_vacation') ? 'away' : st === 'armed_home' ? 'home' : st === 'armed_night' ? 'night' : st === 'triggered' ? 'triggered' : (st === 'arming' || st === 'pending') ? mode : 'off'; setAlarm(m); }, 6000);
  };
  const triggered = alarm === 'triggered';

  // ── Caméras : live + détections ──
  const cams = camList.map((c, ci) => {
    const s = S[c.haid];
    const online = s ? (s.state !== 'unavailable' && s.state !== 'unknown') : false;
    const person = isOn(c.person), vehicle = isOn(c.vehicle), motion = isOn(c.motion), sonnette = isOn(c.sonnette), colis = isOn(c.colis);
    const active = person || vehicle || motion || sonnette || colis;
    let subTxt = tr('RAS'), dot = 'var(--o-ok)';
    if (sonnette) { subTxt = tr('Sonnette'); dot = '#f87171'; }
    else if (person) { subTxt = tr('Personne détectée'); dot = '#ffb347'; }
    else if (vehicle) { subTxt = tr('Véhicule présent'); dot = '#ffb347'; }
    else if (colis) { subTxt = tr('Colis livré'); dot = 'var(--o-accent)'; }
    else if (motion) { subTxt = tr('Mouvement'); dot = '#ffb347'; }
    const preset = CAMERAS()[(c.preset != null ? c.preset : ci) % CAMERAS().length];
    return {
      haid: c.haid, hass, online, label: c.label || '', active,
      tag: online ? 'LIVE · ' + String(c.label || '').toUpperCase() : tr('HORS LIGNE'),
      grad: preset.grad, glow: preset.glow,
      sub: (<><span style={{ width: 7, height: 7, borderRadius: '50%', background: online ? dot : '#f87171' }} />{online ? subTxt : tr('Hors ligne')}</>),
    };
  });
  const camOnline = cams.filter(c => c.online).length, camTotal = cams.length;
  const camPct = camTotal ? Math.round(camOnline / camTotal * 100) : 0;
  const anyMotion = cams.some(c => c.online && c.active);

  // ── Présence ──
  const people = secPeople.map(p => ({ name: p.name, home: isOn(p.haid) }));
  const homeCount = people.filter(p => p.home).length;

  // ── État global ──
  const unknownState = alarm === 'unknown';
  const heroTitle = unknownState ? tr('État inconnu') : triggered ? tr('Alarme déclenchée') : anyMotion ? tr('Mouvement détecté') : tr('Tout est calme');
  const statusCol = unknownState ? [140, 152, 180] : triggered ? [248, 113, 113] : alarm !== 'off' ? [255, 179, 71] : [52, 211, 153];
  const statusTxt = unknownState ? tr('CONNEXION ?') : triggered ? tr('ALERTE') : alarm === 'away' ? tr('ARMÉE · ABSENT') : alarm === 'home' ? tr('ARMÉE · PRÉSENT') : alarm === 'night' ? tr('ARMÉE · NUIT') : tr('SURVEILLÉE');

  // Toutes les entites de detection des cameras : c'est leur historique qui
  // remplit le graphique d'activite.
  const detecteurs = camList.flatMap(c => [c.motion, c.person, c.vehicle, c.sonnette, c.colis]).filter(Boolean);
  const activite = useCamHist(hass, detecteurs);
  const maxC = Math.max(...(activite || [0]), 1);
  const cs = a => `rgb(${a.join(',')})`;
  const ca = (a, al) => `rgba(${a.join(',')},${al})`;
  // Bouton d'armement compact (ligne dense)
  const armBtn = (active, rgb) => ({ padding: '7px 13px', borderRadius: 9, border: '1px solid ' + (active ? ca(rgb, .5) : 'var(--o-bd1)'), cursor: 'pointer', fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap', transition: 'all .2s', background: active ? ca(rgb, .16) : 'var(--o-s2)', color: active ? cs(rgb) : 'var(--o-text1)' });
  // Ligne au patron Apparence : libellé + description à gauche, contrôle/valeur à droite
  const SecRow = ({ label, desc, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 190px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 11.5, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>{children}</div>
    </div>
  );
  // Bandeau + carte de synthese repliables (patron Atrium)
  const [panel, setPanel] = useState(() => { try { return localStorage.getItem('loggia-secpanel') !== '0'; } catch (e) { return true; } });
  const togglePanel = () => setPanel(v => { const nv = !v; try { localStorage.setItem('loggia-secpanel', nv ? '1' : '0'); } catch (e) {} return nv; });
  // Bitmask AlarmControlPanelEntityFeature de HA : ARM_HOME=1, ARM_AWAY=2, ARM_NIGHT=4.
  // On n'affiche « Nuit » que si le panneau la gere — sinon l'appel serait rejete.
  const alarmFeat = (alarmId && S[alarmId] && S[alarmId].attributes && +S[alarmId].attributes.supported_features) || 0;
  const canNight = !!(alarmFeat & 4);
  const alarmWord = arming ? tr('activation en cours') : triggered ? tr('déclenchée') : alarm === 'unknown' ? tr('état inconnu')
    : alarm === 'away' ? tr('armée · absent') : alarm === 'home' ? tr('armée · présent') : alarm === 'night' ? tr('armée · nuit') : tr('désarmée');
  const alarmShort = arming ? tr('activation…') : triggered ? tr('déclenchée') : alarm === 'unknown' ? tr('inconnue')
    : alarm === 'away' ? tr('absent') : alarm === 'home' ? tr('présent') : alarm === 'night' ? tr('nuit') : tr('prête');
  const alarmDesc = arming ? tr('Activation en cours…') : triggered ? tr('Intrusion détectée — vérifier immédiatement') : alarm === 'unknown' ? tr('État inconnu — connexion à vérifier') : alarm === 'off' ? tr('Prête · tous les capteurs au repos') : alarm === 'away' ? tr('Surveillance totale active') : alarm === 'night' ? tr('Mode nuit — périmètre et zones de repos') : tr('Périmètre surveillé');
  const presentNames = people.filter(p => p.home).map(p => p.name).join(', ');

  return (
    <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      {edit && <ViewEditBar texte={tr('Mode édition : choisis le panneau d’alarme et les caméras de cette vue.')} onEnt={onEnt} />}
      <div className="o-obj-head" style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{tr('Sécurité')}</h1>
          <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>{camOnline > 1 ? tr('{n} caméras en ligne', { n: camOnline }) : tr('{n} caméra en ligne', { n: camOnline })} · {homeCount > 1 ? tr('{n} présents sur {t}', { n: homeCount, t: people.length }) : tr('{n} présent sur {t}', { n: homeCount, t: people.length })} · {tr('alarme {etat}', { etat: alarmWord })}</div>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: ca(statusCol, .14), color: cs(statusCol) }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: cs(statusCol), animation: triggered ? 'pulse 1.2s infinite' : 'none' }} />{heroTitle.toUpperCase()}</span>
      </div>

      {/* réglages rapides : armement + mode nuit */}
      <div className="o-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,20px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{tr('Alarme')} <span style={{ color: 'var(--o-text3)' }}>{alarmShort}</span></span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => callAlarm('alarm_disarm', 'off')} style={armBtn(alarm === 'off', [52, 211, 153])}>{tr('Désarmer')}</button>
            <button onClick={() => callAlarm('alarm_arm_away', 'away')} style={armBtn(alarm === 'away', [248, 113, 113])}>{tr('Absent')}</button>
            <button onClick={() => callAlarm('alarm_arm_home', 'home')} style={armBtn(alarm === 'home', [255, 179, 71])}>{tr('Présent')}</button>
          </div>
        </div>
        {canNight && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{tr('Nuit')}</span>
            <span onClick={() => callAlarm(alarm === 'night' ? 'alarm_disarm' : 'alarm_arm_night', alarm === 'night' ? 'off' : 'night')} role="switch" aria-checked={alarm === 'night'} aria-label={tr('Mode nuit')} tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); callAlarm(alarm === 'night' ? 'alarm_disarm' : 'alarm_arm_night', alarm === 'night' ? 'off' : 'night'); } }}
              style={{ position: 'relative', width: 38, height: 21, flexShrink: 0, borderRadius: 11, cursor: 'pointer', background: alarm === 'night' ? 'var(--o-accent)' : 'var(--o-s4)', border: alarm === 'night' ? 'none' : 'var(--o-bw,1px) solid var(--o-bd1)', transition: 'background .2s' }}>
              <span style={{ position: 'absolute', top: 2, left: alarm === 'night' ? 19 : 2, width: 17, height: 17, borderRadius: '50%', background: '#fff', transition: 'left .2s cubic-bezier(.4,1.3,.5,1)' }} />
            </span>
          </div>
        )}
        <span style={{ flex: 1 }} />
        <button onClick={togglePanel} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, border: panel ? 'var(--o-bw,1px) solid rgba(var(--o-accent-rgb),.44)' : 'var(--o-bw,1px) solid var(--o-bd1)', background: panel ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: panel ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}><Fi i="sliders-v" size={13} /><span className="o-barlabel">{panel ? tr('Masquer les réglages') : tr('Réglages de la vue')}</span></button>
      </div>

      {panel && <Anim i={0}><div style={{ background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: 24, boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{tr('Surveillance')}</div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, background: ca(statusCol, .14), color: cs(statusCol), fontSize: 11, fontWeight: 800, flexShrink: 0 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: cs(statusCol), animation: triggered ? 'pulse 1.2s infinite' : 'pulse 2.4s infinite' }} /><FlipText text={statusTxt} /></span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, margin: '3px 0 8px' }}>{heroTitle} · {camOnline}/{camTotal} {camTotal > 1 ? tr('caméras') : tr('caméra')} · {homeCount ? (homeCount > 1 ? tr('{n} présents', { n: homeCount }) : tr('{n} présent', { n: homeCount })) : tr('personne à la maison')}</div>
        <div className="o-optlist" style={{ display: 'flex', flexDirection: 'column' }}>
          <SecRow label={tr('Alarme')} desc={alarmDesc}>
            <span style={{ fontSize: 15, fontWeight: 800, color: cs(statusCol) }}><FlipText live text={alarmShort} /></span>
          </SecRow>
          <SecRow label={tr('Caméras')} desc={cams.map(c => c.label).join(' · ') || tr('Aucune caméra configurée')}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: camOnline === camTotal ? 'var(--o-text)' : '#ffb347' }}><FlipText live text={camOnline + '/' + camTotal + ' ' + tr('en ligne')} /></span>
              <Gauge pct={camPct} color={camOnline === camTotal ? 'var(--o-ok)' : '#ffb347'} h={3} style={{ width: 160 }} />
            </div>
          </SecRow>
          <SecRow label={tr('Mouvement')} desc={anyMotion ? tr('Détection en cours sur une caméra') : tr('Toutes les zones sont calmes')}>
            <span style={{ fontSize: 15, fontWeight: 800, color: anyMotion ? '#ffb347' : 'var(--o-text)' }}><FlipText live text={anyMotion ? tr('Détecté') : tr('Aucun')} /></span>
          </SecRow>
          <SecRow label={tr('Présence')} desc={homeCount ? tr(homeCount > 1 ? '{noms} sont à la maison' : '{noms} est à la maison', { noms: presentNames }) : tr('Personne à la maison')}>
            <span style={{ fontSize: 15, fontWeight: 800 }}><FlipText live text={homeCount ? (homeCount > 1 ? tr('{n} présents', { n: homeCount }) : tr('{n} présent', { n: homeCount })) : tr('Personne')} /></span>
          </SecRow>
          {activite && (
            <SecRow label={tr('Activité · 24 h')} desc={tr('Détections caméra par heure, heure courante en vert')}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, width: 210, height: 34 }}>
                {activite.map((c, h) => {
                  const cur = h === 23;
                  const quand = new Date(Date.now() - (23 - h) * 3600000);
                  return <div key={h} title={String(quand.getHours()).padStart(2, '0') + 'h · ' + c} style={{ flex: 1, height: (c === 0 ? 12 : 26 + (c / maxC) * 74) + '%', minHeight: 3, borderRadius: 2, background: c === 0 ? 'var(--o-bd3)' : (cur ? 'var(--o-ok)' : (c >= 4 ? '#ffb347' : 'rgba(52,211,153,.55)')) }} />;
                })}
              </div>
            </SecRow>
          )}
        </div>
      </div></Anim>}

      <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{tr('Caméras en direct')}</div>
      <div className="grid-sec-cams" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {cams.map((c, i) => <Anim key={c.haid || c.id} i={i} base={140}><CameraTile c={c} /></Anim>)}
      </div>
    </div>
  );
}

function MeteoView({ hass, edit = false, onEnt, wxFx = true }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <Suspense fallback={<div className="loggia-content" style={{ padding: '26px 28px 56px' }} />}>
        <MeteoContent hass={hass} edit={edit} onEnt={onEnt} wxFx={wxFx} />
      </Suspense>
    </main>
  );
}

function SecuriteView({ hass, edit = false, onEnt }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <SecuriteContent hass={hass} edit={edit} onEnt={onEnt} />
    </main>
  );
}

/* ════════════ VUE SYSTÈME (reproduction fidèle de "Loggia Système.dc.html") ════════════ */
// Logos officiels des machines (source : dashboardicons.com / homarr-labs).
// Inlines en data-URI : le projet interdit tout appel CDN.
const BRAND_ICONS = {
  haos: "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 xml:space=%22preserve%22 viewBox=%220 0 512 512%22%3E%3Cpath d=%22M512 473.3c0 17.6-14.4 32-32 32H32c-17.6 0-32-14.4-32-32v-192c0-17.6 10.2-42.2 22.6-54.6L233.4 16c12.4-12.4 32.8-12.4 45.2 0l210.8 210.8c12.4 12.4 22.6 37 22.6 54.6z%22 style=%22fill:%23f2f4f9%22/%3E%3Cpath d=%22M489.4 226.7 278.6 16c-12.4-12.4-32.8-12.4-45.2 0L22.6 226.7C10.2 239.1 0 263.7 0 281.3v192c0 17.6 14.4 32 32 32h196.8l-86.7-86.7c-4.5 1.5-9.2 2.4-14.2 2.4-24.1 0-43.7-19.6-43.7-43.7s19.6-43.7 43.7-43.7 43.7 19.6 43.7 43.7c0 5-.9 9.7-2.4 14.2l67.5 67.5V211.8c-14.5-7.1-24.5-22-24.5-39.2 0-24.1 19.6-43.7 43.7-43.7s43.7 19.6 43.7 43.7c0 17.2-10 32.1-24.5 39.2v173.4l67.1-67.1c-1.3-4.2-2-8.6-2-13.2 0-24.1 19.6-43.7 43.7-43.7s43.7 19.6 43.7 43.7-19.6 43.7-43.7 43.7c-5.3 0-10.4-1-15.1-2.8l-93.7 93.7v65.9H480c17.6 0 32-14.4 32-32v-192c0-17.6-10.2-42.2-22.6-54.7%22 style=%22fill:%2318bcf2%22/%3E%3C/svg%3E",
  unraid: "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 xml:space=%22preserve%22 viewBox=%220 108.3 512 295.4%22%3E%3ClinearGradient id=%22a%22 x1=%2291.058%22 x2=%22420.942%22 y1=%2293.45%22 y2=%22423.333%22 gradientTransform=%22matrix(1 0 0 -1 0 514.2)%22 gradientUnits=%22userSpaceOnUse%22%3E%3Cstop offset=%220%22 style=%22stop-color:%23e32929%22/%3E%3Cstop offset=%221%22 style=%22stop-color:%23ff8d30%22/%3E%3C/linearGradient%3E%3Cpath d=%22M243.3 181.9h24.9v147.8h-24.9zM24.9 329.7H0V181.9h24.9zm96.8 17.6h24.9v56.4h-24.9zM60.6 284h24.9v91.3H60.6zm121.7 0h24.9v91.3h-24.9zm304.8-102.1H512v147.8h-24.9zm-96.8-17.2h-24.9v-56.4h24.9zm61.1 62.9h-24.9v-91h24.9zm-122.1 0h-24.9v-91h24.9z%22 style=%22fill:url(%23a)%22/%3E%3C/svg%3E",
  unifi: "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1024 1024%22%3E%3Ccircle cx=%22512%22 cy=%22512%22 r=%22512%22 style=%22fill:%230559c9%22/%3E%3Cpath d=%22M588.6 385q0-31.49 20.72-58.54t107.68-27V518l-9.91 31.93a213 213 0 0 1-18.92 43.69 144.8 144.8 0 0 1-26.58 33.49 136.6 136.6 0 0 1-34.46 23.29A175.8 175.8 0 0 1 585 663.93a217.5 217.5 0 0 0 3.61-38.58zM384 324.2h25.69V349H384zm25.69 37.69h25.71v24.85h-25.67zM384 393.38h25.7v24.85H384zm-25.67 37.27H384v25.27h-25.64zM307 298.92h25.67v25.28H307zm128.4 326.43q0 32.37 11.94 56.33t26.37 39.91q14.4 16 26.35 23.74l11.94 7.75q-48.19 0-86.27-13.52t-64.44-37.7a163.2 163.2 0 0 1-40.32-57q-14-32.84-14-71V368.11h25.67V505.6h25.7v-24.83H384v55.43h25.69v-93.13h25.71zm94.6 51.89q35.6 1.32 65.34-5.33a163.2 163.2 0 0 0 53.38-22 148.9 148.9 0 0 0 40.78-39.48q17.12-24.15 27.48-57.87v21.34q0 36.37-12.39 67.64a159.6 159.6 0 0 1-36.28 55q-23.87 23.74-58.12 38.37t-77.92 17.29l-15.33-8q-1.79-1.32-29.73-23.29t-38.3-66.3a151.8 151.8 0 0 0 35.38 15.3q20.05 6 45.71 7.33M358.36 349.47h25.24v24.85h-25.24z%22 style=%22fill:%23fff%22/%3E%3C/svg%3E",
};
const sysKeys = () => Object.values(sysSensors()).flatMap(o => Object.values(o || {})).filter(Boolean);
const SYS_SLOTS = ['host', 'nebula', 'ucg'];
// Trois emplacements de machine, remplis par la configuration, sinon par ce que
// la découverte a trouvé, sinon par les constantes. Un emplacement sans machine
// reste vide : la vue affiche alors « — » partout et la carte se dit hors ligne.
/* Les trois emplacements existent TOUJOURS, meme vides.
 *
 * On renvoyait `{}` quand rien n'etait connu, et `SYS.host.cpu` levait alors
 * une exception qui emportait la vue entiere. Le defaut ne se voyait pas tant
 * qu'on ouvrait forcement sur l'Accueil : le temps d'atteindre Systeme, la
 * decouverte avait repondu. Depuis que la vue courante survit au rechargement,
 * on peut arriver ici avant elle — et l'ecran d'erreur remplacait le dashboard.
 *
 * Un emplacement vide se lit tres bien : chaque valeur vaut alors `undefined`,
 * `num()` rend `null`, et la carte affiche des tirets en se disant hors ligne.
 * C'est exactement ce que le commentaire de `SYS_SLOTS` promet. */
const SYS_VIDE = () => ({ host: {}, nebula: {}, ucg: {} });

function sysSensors() {
  const cfg = loggiaEnt('system', null);
  if (cfg && typeof cfg === 'object') return { ...SYS_VIDE(), ...cfg };
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.system;
  if (r && r.available && r.hosts.length) {
    const out = SYS_VIDE();
    SYS_SLOTS.forEach((k, i) => {
      const h = r.hosts[i];
      out[k] = h ? { cpu: h.cpu, memPct: h.memPct, mem: h.memPct, disk: h.disk, temp: h.temp, uptime: h.uptime, online: h.online, clients: h.clients } : {};
    });
    return out;
  }
  return SYS_VIDE();
}
// Nom affiché de chaque emplacement : celui de l'appareil Home Assistant quand
// c'est la découverte qui a rempli l'emplacement, sinon le libellé historique.
// Libellés d'attente : ils ne s'affichent que le temps de la découverte, ou
// pour un emplacement resté vide.
const SYS_NAMES_DEF = { host: 'Machine 1', nebula: 'Machine 2', ucg: 'Machine 3' };
function sysNames() {
  const cfg = loggiaEnt('sysNames', null);
  const out = { ...SYS_NAMES_DEF, ...(cfg && typeof cfg === 'object' ? cfg : {}) };
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.system;
  if (r && r.available && r.hosts.length && !loggiaEnt('system', null)) {
    SYS_SLOTS.forEach((k, i) => { if (r.hosts[i]) out[k] = r.hosts[i].name; });
  }
  return out;
}
/* Duree de fonctionnement, quelle que soit la forme sous laquelle l'integration
 * la publie : « 5 days, 03:12 », un nombre de secondes, ou un horodatage de
 * demarrage.
 *
 * Le mot du jour se lit dans plusieurs langues — un capteur allemand ecrit
 * « Tag », un espagnol « dia ». Auparavant seuls `day` et `jour` etaient
 * reconnus : ailleurs, la duree tombait dans le dernier cas et s'affichait
 * telle quelle, brute. Et les unites de sortie passent par le catalogue : le
 * « j » de jour n'est un jour qu'en francais. */
const UPT_JOUR = /(\d+)\s*(?:days?|jours?|tage?|d[ií]as?|giorni?|dias?)/i;
function fmtUptime(raw) {
  if (raw == null || raw === '' || raw === 'unknown' || raw === 'unavailable') return '—';
  const s = String(raw);
  const jh = (d, h) => (d > 0 ? tr('{n} j', { n: d }) + ' ' + tr('{n} h', { n: String(h).padStart(2, '0') }) : tr('{n} h', { n: h }));
  const dm = s.match(UPT_JOUR), tm = s.match(/(\d+):(\d+)/);
  if (dm || tm) return jh(dm ? +dm[1] : 0, tm ? +tm[1] : 0);
  if (/^\s*[\d.]+\s*$/.test(s)) { const n = parseFloat(s); if (!isNaN(n) && n > 600) return jh(Math.floor(n / 86400), Math.floor((n % 86400) / 3600)); }
  const t = Date.parse(s); if (!isNaN(t)) { let sec = (Date.now() - t) / 1000; if (sec < 0) sec = 0; return jh(Math.floor(sec / 86400), Math.floor((sec % 86400) / 3600)); }
  return s;
}
/* Bases machines (icones + identite ; donnees dynamiques calculees dans
 * SystemeContent).
 *
 * Une fonction, et non une table : un `tr()` au niveau d'un module s'evalue a
 * l'import. Cela fonctionne — `resoudreTot()` fixe la langue avant tout import
 * et le selecteur recharge la page — mais l'evaluer au rendu ne depend d'aucune
 * de ces deux conditions. */
const sysMachines = () => [
  { key: 'host', name: tr('Serveur Home Assistant'), sub: tr('Hôte principal'), iconBg: 'rgba(52,211,153,.16)', iconCol: 'var(--o-ok)', icon: <Fi i="home" size={16} />, barCol: 'var(--o-ok)', art: 'serverart' },
  { key: 'nebula', name: tr('Deuxième machine'), sub: tr('Serveur de stockage'), iconBg: 'rgba(255,179,71,.16)', iconCol: '#ffb347', icon: <Fi i="database" size={16} />, barCol: '#ffb347', art: 'nas' },
  { key: 'ucg', name: tr('Troisième machine'), sub: tr('Passerelle réseau'), iconBg: 'rgba(var(--o-accent-rgb),.16)', iconCol: 'var(--o-accent-soft)', icon: <Fi i="wifi" size={16} />, barCol: 'var(--o-accent)', art: 'routerart' },
];

// History HA pour la vue Système : points {t,v} par entité, période en heures, refresh manuel.
function useSysHist(hass, ids, hours, refreshKey) {
  const [data, setData] = useState({});
  const key = ids.filter(Boolean).join('|');
  useEffect(() => {
    let alive = true;
    if (!hass || !hass.callApi || !key) { setData({}); return undefined; }
    const start = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    Promise.all(key.split('|').map(id =>
      hass.callApi('GET', 'history/period/' + start + '?filter_entity_id=' + encodeURIComponent(id) + '&minimal_response&no_attributes')
        .then(res => ({ id, arr: (res && res[0]) || [] })).catch(() => ({ id, arr: [] }))
    )).then(rs => {
      if (!alive) return;
      const m = {};
      rs.forEach(r => { const pts = r.arr.map(x => ({ t: new Date(x.last_changed || x.last_updated || 0).getTime(), v: parseFloat(x.state) })).filter(pt => !isNaN(pt.v)); if (pts.length >= 2) m[r.id] = pts; });
      setData(m);
    });
    return () => { alive = false; };
  }, [hass ? 1 : 0, key, hours, refreshKey]);
  return data;
}
// Jauge circulaire (design Claude Design) : arc 288°, couleur auto selon le niveau.
function SysRing({ pct, label, warn = 70, bad = 86 }) {
  const v = pct == null ? null : Math.max(0, Math.min(100, Math.round(pct)));
  const col = v == null ? 'var(--o-bd1)' : v >= bad ? '#f87171' : v >= warn ? '#ffb347' : 'var(--o-ok)';
  const C = 2 * Math.PI * 24;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0 }}>
      <div style={{ position: 'relative', width: 62, height: 62 }}>
        <svg width="62" height="62" viewBox="0 0 62 62" style={{ transform: 'rotate(126deg)' }}>
          <circle cx="31" cy="31" r="24" fill="none" stroke="var(--o-s1)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${C * 0.8} ${C}`} />
          {v != null && <circle cx="31" cy="31" r="24" fill="none" stroke={col} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${C * 0.8 * v / 100} ${C}`} style={{ transition: 'stroke-dasharray .8s cubic-bezier(.22,.61,.36,1), stroke .3s' }} />}
        </svg>
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, fontWeight: 800, color: v == null ? 'var(--o-text3)' : col }}>{v == null ? '—' : v + '%'}</span>
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.09em', color: 'var(--o-text3)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}
// Aire + ligne sur points d'historique {t,v}, echelle automatique.
//
// Une serie inventee servait autrefois de repli quand l'historique manquait :
// la courbe s'affichait sous le libelle « Releve Home Assistant » sans que rien
// ne distingue le vrai du decor. Faute d'historique, on le dit maintenant.
function SysArea({ pts, color, fill, h = 64 }) {
  const data = pts && pts.length >= 2 ? pts : null;
  if (!data) return <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('historique indisponible')}</div>;
  const vals = data.map(pt => pt.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const W = 240;
  const xs = vals.map((v, i) => [(i / (vals.length - 1)) * W, h - 4 - ((v - min) / span) * (h - 12)]);
  const line = 'M ' + xs.map(([x, y]) => x.toFixed(1) + ' ' + y.toFixed(1)).join(' L ');
  return (
    <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block' }}>
      <path d={`${line} L ${W} ${h} L 0 ${h} Z`} fill={fill} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function SystemeContent({ hass }) {
  const S = (hass && hass.states) || {};
  const num = id => { const s = S[id]; if (!s) return null; const v = parseFloat(s.state); return isNaN(v) ? null : v; };
  const unitOf = id => { const s = S[id]; return (s && s.attributes && s.attributes.unit_of_measurement) || ''; };
  const onl = id => { const s = S[id]; return s ? ['on', 'home', 'online', 'connected'].indexOf(String(s.state).toLowerCase()) >= 0 : false; };
  const has = id => !!S[id];
  const stateRaw = id => S[id] ? S[id].state : null;
  const [armed, setArmed] = useState(null);
  const armRef = useRef(null);
  const power = (id, domain, service) => {
    if (armed === id) { try { if (hass && hass.callService) hass.callService(domain, service, {}); } catch (e) {} setArmed(null); if (armRef.current) clearTimeout(armRef.current); }
    else { setArmed(id); if (armRef.current) clearTimeout(armRef.current); armRef.current = setTimeout(() => setArmed(null), 4000); }
  };
  useEffect(() => () => { if (armRef.current) clearTimeout(armRef.current); }, []);
  const pct = v => v == null ? null : Math.max(0, Math.min(100, Math.round(v)));
  const fmtPct = v => v == null ? '—' : pct(v) + '%';
  // Hote principal (Glances ou System Monitor)
  const SYS = sysSensors();
  const SYSN = sysNames();
  const hCpu = num(SYS.host.cpu) != null ? num(SYS.host.cpu) : num(SYS.host.cpuAlt);
  const hTemp = num(SYS.host.temp);
  const hUsed = num(SYS.host.memUsed), hFree = num(SYS.host.memFree);
  // % mémoire : capteur Glances, sinon System Monitor. Le rapport utilisée/(utilisée+libre)
  // n'est utilisé qu'en tout dernier recours car il ignore le cache et surestime fortement.
  const hMemPct = num(SYS.host.memPct) != null ? Math.round(num(SYS.host.memPct))
    : num(SYS.host.memPctAlt) != null ? Math.round(num(SYS.host.memPctAlt))
      : ((hUsed != null && hFree != null && (hUsed + hFree) > 0) ? Math.round(hUsed / (hUsed + hFree) * 100) : null);
  // L'unite vient du capteur ; sans capteur il n'y a pas de valeur a habiller,
  // et un repli « Go » francais s'afficherait a cote de chiffres anglais.
  const hMemUnit = unitOf(SYS.host.memUsed) || '';
  const hDisk = num(SYS.host.disk) != null ? num(SYS.host.disk) : num(SYS.host.diskAlt);
  const hUp = fmtUptime(stateRaw(SYS.host.uptime));
  const hOnline = onl(SYS.host.online) || has(SYS.host.cpu);
  // Unraid Nebula
  const nCpu = num(SYS.nebula.cpu), nTemp = num(SYS.nebula.temp), nDisk = num(SYS.nebula.disk);
  const nMem = num(SYS.nebula.memPct);
  const nUp = fmtUptime(stateRaw(SYS.nebula.uptime));
  const nOnline = onl(SYS.nebula.online) || has(SYS.nebula.cpu);
  // UniFi UCG Max
  const uCpu = num(SYS.ucg.cpu), uMem = num(SYS.ucg.mem), uTemp = num(SYS.ucg.temp), uClients = num(SYS.ucg.clients);
  const uUp = fmtUptime(stateRaw(SYS.ucg.uptime));
  const uOnline = has(SYS.ucg.cpu) || uClients != null;

  // Les noms viennent de l'appareil trouvé (ou de la configuration) ; seule
  // l'identité visuelle — icône, couleur — reste écrite ici.
  const machines = sysMachines().map(m => ({ ...m, name: sysNames()[m.key] || m.name })).map(m => {
    if (m.key === 'host') return { ...m, online: hOnline, l: tr('En service') + ' ' + hUp, r: `CPU ${fmtPct(hCpu)} · RAM ${fmtPct(hMemPct)}`, bar: (hMemPct || 0) + '%' };
    if (m.key === 'nebula') return { ...m, online: nOnline, l: `CPU ${fmtPct(nCpu)}`, r: nTemp != null ? `${Math.round(nTemp)}°C · ${nUp}` : `Uptime ${nUp}`, bar: (nCpu || 0) + '%' };
    return { ...m, online: uOnline, l: uClients != null ? tr('{n} clients', { n: uClients }) : tr('Réseau'), r: `CPU ${fmtPct(uCpu)} · ${uTemp != null ? Math.round(uTemp) + '°C' : uUp}`, bar: (uMem || 0) + '%' };
  });
  const machinesOnline = machines.filter(m => m.online).length;
  const allOnline = machinesOnline === machines.length;
  const loads = [hCpu, hMemPct, hDisk, uCpu, uMem].filter(v => v != null);
  const health = loads.length ? Math.max(0, Math.round(100 - Math.max(...loads))) : (allOnline ? 100 : 50);
  const statusCol = allOnline ? [52, 211, 153] : [255, 179, 71];
  const cs = a => `rgb(${a.join(',')})`, ca = (a, al) => `rgba(${a.join(',')},${al})`;
  const horsLigne = machines.length - machinesOnline;
  const heroTitle = allOnline ? tr('Tous les systèmes opérationnels')
    : horsLigne > 1 ? tr('{n} systèmes hors ligne', { n: horsLigne }) : tr('{n} système hors ligne', { n: horsLigne });
  // ── v6 (design Claude Design 21/08) : période, refresh, machine détaillée, history réel, journal ──
  const [period, setPeriod] = useState(1); // heures : 1 | 24 | 168
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastFetch, setLastFetch] = useState(() => new Date());
  const doRefresh = () => { setRefreshKey(k => k + 1); setLastFetch(new Date()); };
  const [detail, setDetail] = useState('host');
  const HIST_IDS = [SYS.host.cpu, SYS.host.memUsed, SYS.nebula.cpu, SYS.ucg.cpu, SYS.ucg.mem];
  const hist = useSysHist(hass, HIST_IDS, period, refreshKey);
  const perLbl = period === 1 ? tr('{n} h', { n: 1 }) : period === 24 ? tr('{n} h', { n: 24 }) : tr('{n} j', { n: 7 });
  // Alertes calculées sur les seuils réels
  const alerts = [];
  if (hMemPct != null && hMemPct >= 85) alerts.push({ key: 'hmem', m: sysNames().host, target: 'host', sev: hMemPct >= 92 ? 'bad' : 'warn', txt: tr('Mémoire à {n} %', { n: hMemPct }) + (hUsed != null && hFree != null ? ` (${Math.round(hUsed)} / ${Math.round(hUsed + hFree)} ${hMemUnit})` : '') + ' ' + tr('— le cœur risque un redémarrage forcé.') });
  if (hDisk != null && hDisk >= 85) alerts.push({ key: 'hdisk', m: sysNames().host, target: 'host', sev: hDisk >= 92 ? 'bad' : 'warn', txt: tr('Partition /data à {n} % — prévoir une purge de la base ou des sauvegardes.', { n: Math.round(hDisk) }) });
  if ((uCpu != null && uCpu >= 85) || (uMem != null && uMem >= 85)) alerts.push({ key: 'ucg', m: sysNames().ucg, target: 'ucg', sev: 'warn', txt: tr('Processeur à {c} et mémoire à {m} — débit du LAN encore nominal.', { c: fmtPct(uCpu), m: fmtPct(uMem) }) });
  if ((nCpu != null && nCpu >= 85) || (nMem != null && nMem >= 85)) alerts.push({ key: 'ncpu', m: sysNames().nebula, target: 'nebula', sev: 'warn', txt: tr('Processeur à {c} et mémoire à {m} — vérifier les conteneurs actifs.', { c: fmtPct(nCpu), m: fmtPct(nMem) }) });
  machines.forEach(m => { if (!m.online) alerts.push({ key: 'off' + m.key, m: m.name, target: m.key, sev: 'bad', txt: tr('Machine hors ligne — dernier état inconnu.') }); });
  // Journal : logbook HA sur les entités système suivies (24 h), meilleur effort
  const [logbook, setLogbook] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!hass || !hass.callApi) { setLogbook(null); return undefined; }
    const ids = [...HIST_IDS, SYS.host.online, SYS.nebula.online, ...Object.keys((hass.states || {})).filter(id => id.indexOf('update.') === 0)].filter(Boolean);
    const start = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    hass.callApi('GET', 'logbook/' + start + '?entity=' + encodeURIComponent(ids.slice(0, 30).join(',')))
      .then(res => { if (alive) setLogbook(Array.isArray(res) ? res.slice(-8).reverse() : null); })
      .catch(() => { if (alive) setLogbook(null); });
    return () => { alive = false; };
  }, [hass ? 1 : 0, refreshKey]);

  // ── Patron Atrium (22/08) : bandeau Alimentation + carte machine detaillee + cartes facon Objets ──
  const [panel, setPanel] = useState(() => { try { return localStorage.getItem('loggia-syspanel') !== '0'; } catch (e) { return true; } });
  const togglePanel = () => setPanel(v => { const nv = !v; try { localStorage.setItem('loggia-syspanel', nv ? '1' : '0'); } catch (e) {} return nv; });
  const relFetch = (() => { const sec = Math.round((Date.now() - lastFetch.getTime()) / 1000); if (sec < 60) return tr('il y a {n} s', { n: sec }); const mn = Math.round(sec / 60); return mn < 60 ? tr('il y a {n} min', { n: mn }) : tr('il y a {n} h', { n: Math.round(mn / 60) }); })();
  const lvlCol = (v, warn = 70, bad = 86) => v == null ? 'var(--o-text3)' : v >= bad ? 'var(--o-bad)' : v >= warn ? 'var(--o-warn2)' : 'var(--o-ok)';
  const MACH = [
    { key: 'host', logo: BRAND_ICONS.haos, name: SYSN.host, sub: 'Home Assistant OS' + (hUp && hUp !== '—' ? ' · ' + hUp : ''), online: hOnline,
      ico: 'home', icoBg: 'rgba(3,169,244,.14)', icoCol: 'var(--o-accent-soft)',
      barLabel: tr('Mémoire'), barPct: hMemPct, barText: hMemPct != null ? hMemPct + ' %' : '—',
      status: hMemPct != null && hMemPct >= 85 ? tr('Mémoire élevée') + ' · ' + hMemPct + ' %' : tr('Fonctionnement normal'),
      rows: [
        [tr('Processeur'), tr('Charge moyenne du CPU'), hCpu != null ? Math.round(hCpu) + ' %' : '—', hCpu, 85],
        [tr('Mémoire'), hUsed != null && hFree != null ? Math.round(hUsed) + ' / ' + Math.round(hUsed + hFree) + ' ' + hMemUnit : tr('RAM utilisée'), hMemPct != null ? hMemPct + ' %' : '—', hMemPct, 85],
        [tr('Disque /data'), tr('Partition de données'), hDisk != null ? Math.round(hDisk) + ' %' : '—', hDisk, 85],
        [tr('Température CPU'), tr("Seuil d'alerte à 75 °C"), hTemp != null ? Math.round(hTemp) + ' °C' : '—', null, null, hTemp],
      ],
      spark: hist[SYS.host.memUsed], sparkLbl: tr('mémoire'), level: hMemPct },
    { key: 'nebula', logo: BRAND_ICONS.unraid, name: SYSN.nebula, sub: tr('Serveur de stockage') + (nUp && nUp !== '—' ? ' · ' + nUp : ''), online: nOnline,
      ico: 'database', icoBg: 'rgba(227,41,41,.14)', icoCol: '#ffb347',
      barLabel: nMem != null ? tr('Mémoire') : tr('Processeur'), barPct: nMem != null ? nMem : nCpu, barText: (nMem != null ? Math.round(nMem) : nCpu != null ? Math.round(nCpu) : null) != null ? Math.round(nMem != null ? nMem : nCpu) + ' %' : '—',
      status: Math.max(nCpu || 0, nMem || 0) >= 85 ? tr('Ressources sous tension') : tr('Fonctionnement normal'),
      rows: [
        [tr('Processeur'), tr('Charge CPU'), nCpu != null ? Math.round(nCpu) + ' %' : '—', nCpu, 85],
        [tr('Mémoire'), tr('RAM du serveur'), nMem != null ? Math.round(nMem) + ' %' : '—', nMem, 85],
        [tr('Température CPU'), tr("Seuil d'alerte à 75 °C"), nTemp != null ? Math.round(nTemp) + ' °C' : '—', null, null, nTemp],
        [tr('Stockage'), tr('Grappe de disques'), nDisk != null ? Math.round(nDisk) + ' %' : tr('non exposée'), nDisk, 85],
      ],
      spark: hist[SYS.nebula.cpu], sparkLbl: tr('charge'), level: Math.max(nCpu || 0, nMem || 0) },
    { key: 'ucg', logo: BRAND_ICONS.unifi, name: SYSN.ucg, sub: tr('Passerelle réseau') + (uUp && uUp !== '—' ? ' · ' + uUp : ''), online: uOnline,
      ico: 'wifi', icoBg: 'rgba(5,89,201,.16)', icoCol: 'var(--o-cyan)',
      barLabel: tr('Mémoire'), barPct: uMem, barText: uMem != null ? Math.round(uMem) + ' %' : '—',
      status: (uCpu != null && uCpu >= 85) || (uMem != null && uMem >= 85) ? tr('Ressources sous tension') : tr('Fonctionnement normal'),
      rows: [
        [tr('Processeur'), tr('Charge CPU'), uCpu != null ? Math.round(uCpu) + ' %' : '—', uCpu, 85],
        [tr('Mémoire'), tr('RAM de la passerelle'), uMem != null ? Math.round(uMem) + ' %' : '—', uMem, 85],
        [tr('Clients réseau'), tr('Appareils connectés'), uClients != null ? Math.round(uClients) : tr('non exposés'), null, null],
        [tr('Température'), tr("Seuil d'alerte à 75 °C"), uTemp != null ? Math.round(uTemp) + ' °C' : tr('non exposée'), null, null, uTemp],
      ],
      spark: hist[SYS.ucg.cpu], sparkLbl: tr('processeur'), level: Math.max(uCpu || 0, uMem || 0) },
  ];
  const sel = MACH.find(m => m.key === detail) || MACH[0];
  const powerActions = [
    { id: 'ha', label: tr('Redémarrer HA'), desc: tr('Relance le cœur sans toucher à la machine · ~40 s'), col: '255,179,71', run: () => power('ha', 'homeassistant', 'restart') },
    { id: 'reboot', label: tr('Redémarrer'), desc: tr('Redémarrage complet de la machine · 2 à 3 min hors ligne'), col: '255,179,71', run: () => power('reboot', 'hassio', 'host_reboot') },
    { id: 'shutdown', label: tr('Éteindre'), desc: tr('Arrêt complet · rallumage physique requis'), col: '248,113,113', run: () => power('shutdown', 'hassio', 'host_shutdown') },
  ];

  return (
    <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{tr('Système')}</h1>
          <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>{machinesOnline > 1 ? tr('{n} machines en ligne', { n: machinesOnline }) : tr('{n} machine en ligne', { n: machinesOnline })} · {tr('relevé')} {relFetch}</div>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: alerts.length ? 'rgba(var(--o-warn2-rgb),.14)' : 'rgba(var(--o-ok-rgb),.14)', color: alerts.length ? 'var(--o-warn2)' : 'var(--o-ok)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: alerts.length ? 'var(--o-warn2)' : 'var(--o-ok)' }} />{alerts.length ? tr('{n} À SURVEILLER', { n: alerts.length }) : tr('TOUT VA BIEN')}</span>
      </div>

      {/* reglages rapides : alimentation (2 temps), periode d'historique, rafraichir */}
      <div className="o-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,20px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{tr('Alimentation')}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {powerActions.map(ac => (
              <button key={ac.id} onClick={ac.run} title={ac.desc} style={{ padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', border: armed === ac.id ? '1px solid rgba(' + ac.col + ',.65)' : (ac.id === 'shutdown' ? '1px solid rgba(' + ac.col + ',.3)' : 'none'), background: armed === ac.id ? 'rgba(' + ac.col + ',.24)' : (ac.id === 'shutdown' ? 'rgba(' + ac.col + ',.08)' : 'var(--o-s1)'), color: (ac.id === 'shutdown' || armed === ac.id) ? 'rgb(' + ac.col + ')' : 'var(--o-text1)' }}>{armed === ac.id ? tr('Confirmer ?') : ac.label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{tr('Historique')}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[[1, tr('{n} h', { n: 1 })], [24, tr('{n} h', { n: 24 })], [168, tr('{n} j', { n: 7 })]].map(([h, lb]) => (
              <button key={h} onClick={() => { setPeriod(h); setLastFetch(new Date()); }} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, background: period === h ? 'rgba(var(--o-accent-rgb),.18)' : 'transparent', color: period === h ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}>{lb}</button>
            ))}
          </div>
        </div>
        <button onClick={doRefresh} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 10, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd1)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}><Fi i="refresh" size={13} />{tr('Rafraîchir')}</button>
        <span style={{ flex: 1 }} />
        <button onClick={togglePanel} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, border: panel ? 'var(--o-bw,1px) solid rgba(var(--o-accent-rgb),.44)' : 'var(--o-bw,1px) solid var(--o-bd1)', background: panel ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: panel ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}><Fi i="sliders-v" size={13} /><span className="o-barlabel">{panel ? tr('Masquer les réglages') : tr('Réglages de la vue')}</span></button>
      </div>

      {panel && (
        <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '20px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{sel.name}</div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap', fontSize: 11, fontWeight: 800, background: sel.level != null && sel.level >= 70 ? 'rgba(var(--o-warn2-rgb),.14)' : 'rgba(var(--o-ok-rgb),.14)', color: sel.level != null && sel.level >= 70 ? 'var(--o-warn2)' : 'var(--o-ok)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: sel.level != null && sel.level >= 70 ? 'var(--o-warn2)' : 'var(--o-ok)' }} />{sel.barLabel.toUpperCase()} {sel.barText}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, margin: '3px 0 8px' }}>{sel.sub}{sel.level != null && sel.level >= 85 ? ' · ' + tr('le cœur risque un redémarrage forcé') : ''}</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sel.rows.map(([lb, desc, val, pct, warn, degres]) => (
              <EnRow key={lb} label={lb} desc={desc}>
                {pct != null
                  ? <EnGauge v={val} pct={pct} col={lvlCol(pct, warn || 70)} />
                  : <EnVal v={val} col={degres != null && degres >= 75 ? 'var(--o-warn2)' : 'var(--o-text)'} />}
              </EnRow>
            ))}
            <EnRow label={sel.sparkLbl.charAt(0).toUpperCase() + sel.sparkLbl.slice(1) + ' · ' + perLbl} desc={tr('Relevé Home Assistant sur la période choisie')}>
              <div style={{ width: 210 }}><SysArea pts={sel.spark} color={lvlCol(sel.level)} fill={sel.level != null && sel.level >= 70 ? 'rgba(248,113,113,.09)' : 'rgba(var(--o-ok-rgb),.08)'} h={34} /></div>
            </EnRow>
          </div>
        </div>
      )}

      <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{tr('Machines')}</div>
      <div className="grid-objets" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(225px,1fr))', gap: 14 }}>
        {MACH.map((m, mi) => (
          <ObjCard key={m.key} idx={mi}
            // Pas de `iconActive` : il fait fretiller l'icone sans fin, et une
            // machine allumee l'est en permanence. L'animation est reservee a
            // ce qui est reellement en action ; ici l'etat se lit deja dans la
            // ligne de statut, en couleur.
            icon={m.logo ? <img src={m.logo} alt="" draggable={false} style={{ width: 28, height: 24, objectFit: 'contain' }} /> : <Fi i={m.ico} size={19} color={m.icoCol} />} iconBg={m.icoBg}
            name={m.name} sub={m.sub}
            status={m.online ? m.status : tr('Hors ligne')}
            statusColor={!m.online ? 'var(--o-bad)' : (m.level != null && m.level >= 85 ? 'var(--o-warn2)' : 'var(--o-ok)')}
            barLabel={m.barLabel} barPct={m.barPct} barColor={lvlCol(m.barPct)} barText={m.barText}
            actionLabel={detail === m.key ? tr('Détail affiché') : tr('Voir le détail')}
            onAction={() => { setDetail(m.key); setPanel(true); }}
          />
        ))}
      </div>

      <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{tr('Journal système')}</div>
      <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '18px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
        {logbook && logbook.length
          ? <div className="o-optlist" style={{ display: 'flex', flexDirection: 'column' }}>
              {logbook.map((e, li) => {
                const dt = new Date(e.when || e.last_changed || 0);
                const hm = isNaN(dt.getTime()) ? '' : String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
                return (
                  <div key={li} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginTop: 1 }}>{hm}</span>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--o-ok)', flexShrink: 0, marginTop: 5 }} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>{e.name || e.entity_id}{e.message ? ' ' + e.message : e.state ? ' → ' + e.state : ''}</div>
                  </div>
                );
              })}
            </div>
          : <div style={{ padding: '6px 0', fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{logbook === null ? tr('Journal indisponible sur cet accès.') : tr('Aucun événement système sur 24 h.')}</div>}
      </div>
      {/* Le journal de TOUTE la maison — le pendant global du journal système
          ci-dessus, poussé en direct par le logbook. */}
      <RoomActivityCard hass={hass} ids={null} max={14} titre={tr('Journal de la maison')} sous={tr('Tout ce qui a bougé, pièces confondues — 24 h, en direct')} />
    </div>
  );
}

function SystemeView({ hass }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <SystemeContent hass={hass} />
    </main>
  );
}

/* ════════════ VUE PARAMÈTRES (reproduction fidèle de "Loggia Paramètres.dc.html") ════════════ */
/* Une FONCTION, pas une table.
 *
 * Evaluee a l'import, cette liste figeait ses libelles dans la langue du
 * demarrage. C'est ce qui obligeait a recharger la page apres un changement de
 * langue. Appelee au rendu, elle se dit dans la langue du moment. */
const PAR_NAV = () => [
  { grp: 'Compte', items: [['users', tr('Utilisateurs'), 'users']] },
  { grp: 'Application', items: [['apparence', tr('Apparence'), 'palette'], ['connexion', tr('Connexion HA'), 'link'], ['auto', tr('Automatisations'), 'bolt'], ['maj', tr('Mises à jour'), 'refresh']] },
  { grp: 'Dashboard', items: [['vues', tr('Vues'), 'layout-fluid'], ['entites', tr('Entités'), 'list']] },
  { grp: tr('Système'), items: [['about', tr('À propos'), 'info']] },
];
/* Carte template d'une vue custom : le Jinja est evalue par Home Assistant,
 * jamais ici. `render_template` est une SOUSCRIPTION : HA re-evalue et pousse
 * une nouvelle valeur des qu'une entite referencee change — le direct est
 * gratuit, aucun poll. `report_errors` transforme un template invalide en
 * message d'erreur au lieu d'une souscription silencieusement morte. */
function CvTemplateCard({ def, hass }) {
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);
  const conn = hass && hass.connection;
  useEffect(() => {
    setOut(null); setErr(null);
    if (!conn || !def.src) return;
    let unsub = null, mort = false;
    conn.subscribeMessage((msg) => {
      if (mort || !msg) return;
      if (msg.error) { setErr(String(msg.error)); return; }
      setErr(null);
      setOut(msg.result != null ? String(msg.result) : '');
    }, { type: 'render_template', template: def.src, report_errors: true })
      .then(u => { if (mort) { try { u(); } catch (e) {} } else unsub = u; })
      .catch(e => { if (!mort) setErr(String((e && e.message) || e)); });
    return () => { mort = true; if (unsub) { try { unsub(); } catch (e) {} } };
  }, [conn, def.src]);
  const attente = out == null && !err;
  return (
    <div className="o-piece" style={{ background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,18px)', padding: 16, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text3)' }}><Fi i="brackets-curly" size={16} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{def.name || 'Template'}</div>
          {err
            ? <div style={{ fontSize: 11.5, fontWeight: 600, color: '#f87171', marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 96, overflow: 'auto' }}>{err}</div>
            : <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 132, overflowY: 'auto', lineHeight: 1.45, opacity: attente ? .45 : 1 }}>{attente ? '…' : (out === '' ? '—' : out)}</div>}
        </div>
      </div>
    </div>
  );
}

const FAN_FR = () => ({ quiet: tr('Silencieux'), normal: 'Normal', max: 'Max', max_plus: 'Max+', standard: 'Normal', strong: tr('Fort') });
/* Sélecteur compact façon fiche native : un bouton qui dit la valeur courante,
 * un menu dépoli qui liste les autres. Partagé : vitesse d'aspiration,
 * préréglages de thermostat — partout où des chips feraient brouillon. */
function MenuDeroulant({ icone = null, etiquette, valeur, options, surChoix, rendre = (v) => v }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOuvert(o => !o)} aria-haspopup="listbox" aria-expanded={ouvert}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 13px', borderRadius: 12, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', cursor: 'pointer', textAlign: 'left' }}>
        {icone && <Fi i={icone} size={14} color="var(--o-text2)" />}
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--o-text3)' }}>{etiquette}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{valeur != null ? rendre(valeur) : '—'}</span>
        </span>
      </button>
      {ouvert && (
        <div role="listbox" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', zIndex: 30, minWidth: 158, padding: 6, borderRadius: 13, background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', border: 'var(--o-bw,1px) solid var(--o-bd2)', boxShadow: '0 12px 30px rgba(0,0,0,.45)' }}>
          {options.map(v => { const act = valeur === v; return (
            <button key={v} role="option" aria-selected={act} onClick={() => { surChoix(v); setOuvert(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', background: act ? 'rgba(var(--o-accent-rgb),.16)' : 'transparent', color: act ? 'var(--o-accent-soft)' : 'var(--o-text1)' }}>{rendre(v)}</button>
          ); })}
        </div>
      )}
    </div>
  );
}
/* `dense` : la COMPACTE — une seule ligne (icône, nom, état) et le contrôle
 * primaire à droite, JAMAIS de rangée de contrôles dessous. La pleine, elle,
 * est la STANDARD : mêmes en-têtes, les contrôles du domaine en dessous. */
function CvCard({ id, hass, label = null, onOpen = null, dense = false }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const call = (d, s, data) => { try { if (hass && hass.callService) hass.callService(d, s, { entity_id: id, ...(data || {}) }); } catch (e) {} };
  const dom = cvDomain(id);
  const ico = dom === 'switch' ? (cvEstLumiere(id) ? 'bulb' : null) : CV_DOM_ICON[dom] || 'bolt'; // null = prise, SVG maison
  const name = label || cvName(st, id);
  const s = st ? st.state : null;
  const a = (st && st.attributes) || {};
  const dead = !st || s === 'unavailable' || s === 'unknown';
  const on = !dead && (dom === 'cover' ? (s === 'open' || s === 'opening') : dom === 'lock' ? s === 'unlocked' : dom === 'media_player' ? s === 'playing' : dom === 'climate' ? s !== 'off' : dom === 'vacuum' ? (s === 'cleaning' || s === 'returning') : dom === 'lawn_mower' ? (s === 'mowing' || s === 'returning') : dom === 'valve' ? s === 'open' : s === 'on');
  // Chaque domaine garde sa teinte des vues intégrées : lumière = sa couleur RGB ou l'or,
  // climat = le rouge de la vue Climatisation — l'accent bleu pour le reste.
  const rgbHex = dom === 'light' && a.rgb_color ? '#' + a.rgb_color.map(v => v.toString(16).padStart(2, '0')).join('') : null;
  const teinte = cvEstLumiere(id) ? (rgbHex || '#FFCC44') : dom === 'climate' ? 'var(--o-warn2)' : dom === 'cover' ? 'var(--o-purple)' : null;
  const teinteTxt = rgbHex || (cvEstLumiere(id) ? 'var(--o-warn)' : dom === 'climate' ? 'var(--o-warn2)' : dom === 'cover' ? 'var(--o-purple)' : 'var(--o-accent-soft)');
  const acc = on ? 'var(--o-accent)' : 'var(--o-text3)';
  const togglable = ['light', 'switch', 'input_boolean', 'fan', 'humidifier', 'siren'].indexOf(dom) >= 0;
  // Cliquable comme la carte riche : la fiche du domaine s'ouvre (lumière réglable seulement — un simple toggle n'a pas de fiche).
  const modes = a.supported_color_modes || [];
  const reglable = dom !== 'light' || modes.length > 1 || a.brightness != null || modes.indexOf('brightness') >= 0 || modes.some(m => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'color_temp'].indexOf(m) >= 0);
  // Presque tout s'ouvre : les domaines à fiche dédiée, et tout appareil du
  // registre via la fiche universelle. Seuls les capteurs texte restent muets.
  const ouvrable = !dead && !!onOpen && ((dom === 'sensor' && !isNaN(parseFloat(s)))
    || ['light', 'climate', 'cover', 'media_player', 'vacuum', 'lawn_mower', 'fan', 'lock', 'switch', 'humidifier', 'valve', 'water_heater', 'siren', 'binary_sensor', 'input_boolean'].indexOf(dom) >= 0);
  const runnable = { scene: ['scene', 'turn_on', 'Activer'], script: ['script', 'turn_on', tr('Exécuter')], button: ['button', 'press', 'Appuyer'], input_button: ['input_button', 'press', 'Appuyer'], automation: ['automation', 'trigger', tr('Exécuter')] }[dom];
  let stateTxt;
  if (dead) stateTxt = tr('Indisponible');
  else if (dom === 'light') stateTxt = on ? (tr('Allumé') + (a.brightness ? ' · ' + Math.round(a.brightness / 255 * 100) + '%' : '')) : tr('Éteint');
  else if (togglable) stateTxt = on ? tr('Allumé') : tr('Éteint');
  else if (dom === 'climate') stateTxt = (a.current_temperature != null ? a.current_temperature + '°' : '—') + (a.temperature != null ? ' → ' + a.temperature + '°' : '') + (s !== 'off' ? '' : ' · Éteint');
  else if (dom === 'cover') stateTxt = s === 'opening' ? 'Ouverture…' : s === 'closing' ? 'Fermeture…' : on ? (tr('Ouvert') + (a.current_position != null && a.current_position < 100 ? ' · ' + a.current_position + '%' : '')) : tr('Fermé');
  else if (dom === 'lock') stateTxt = s === 'locked' ? 'Verrouillée' : s === 'unlocked' ? 'Déverrouillée' : s;
  else if (dom === 'media_player') stateTxt = s === 'playing' ? (a.media_title || tr('Lecture')) : s === 'paused' ? tr('En pause') : s === 'off' ? tr('Éteint') : tr('Inactif');
  else if (dom === 'binary_sensor') stateTxt = s === 'on' ? tr('Détecté') : 'RAS';
  else if (dom === 'vacuum' || dom === 'lawn_mower') stateTxt = ({ docked: tr('Sur la base'), cleaning: tr('Nettoyage'), mowing: tr('Tonte'), returning: tr('Retour à la base'), paused: tr('En pause'), idle: tr('Inactif'), error: tr('Erreur') })[s] || String(s);
  else if (dom === 'valve') stateTxt = s === 'open' ? tr('Ouvert') : s === 'closed' ? tr('Fermé') : String(s);
  else if (dom === 'person') stateTxt = s === 'home' ? tr('Présent') : 'Absent';
  else if (dom === 'sensor') stateTxt = (isNaN(parseFloat(s)) ? s : parseFloat(s)) + (a.unit_of_measurement ? ' ' + a.unit_of_measurement : '');
  else if (runnable || /^\d{4}-\d\d-\d\dT/.test(String(s))) stateTxt = relTime(s) || '—'; // scene/script/button : état = date de dernière exécution
  else stateTxt = String(s);
  return (
    <div className={'o-piece' + (dead ? ' o-panne' : '')} role={ouvrable ? 'button' : undefined} tabIndex={ouvrable ? 0 : -1} aria-label={ouvrable ? 'Ouvrir ' + name : undefined}
      onClick={ouvrable ? () => onOpen(id) : undefined}
      onKeyDown={ouvrable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(id); } } : undefined}
      style={{ position: 'relative', background: on ? `linear-gradient(180deg,${hx(teinte || 'var(--o-accent)', .12)},transparent), linear-gradient(180deg,var(--o-surfA),var(--o-surfB))` : 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid ' + (on ? (teinte ? hx(teinte, .3) : 'rgba(var(--o-accent-rgb),.3)') : 'var(--o-bd2)'), borderRadius: 'var(--o-radius,18px)', padding: dense ? '12px 14px' : 16, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', opacity: dead ? .55 : 1, cursor: ouvrable ? 'pointer' : 'default', transition: 'all .25s', ...(dense ? { height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center' } : {}) }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: dense ? 9 : 11 }}>
        <span style={{ width: dense ? 34 : 40, height: dense ? 34 : 40, borderRadius: dense ? 10 : 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? (teinte ? hx(teinte, .16) : 'rgba(var(--o-accent-rgb),.16)') : 'var(--o-s1)', color: on ? (teinte || 'var(--o-accent-soft)') : 'var(--o-text3)' }}>{ico ? <Fi i={ico} size={dense ? 15 : 17} /> : <PlugIcon size={dense ? 15 : 17} />}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: on ? (teinte ? teinteTxt : 'var(--o-accent-soft)') : 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stateTxt}</div>
        </div>
        {togglable && !dead && <span role="switch" aria-checked={on} tabIndex={0} aria-label={(on ? 'Éteindre ' : 'Allumer ') + name} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); call('homeassistant', on ? 'turn_off' : 'turn_on'); } }} onClick={(e) => { e.stopPropagation(); call('homeassistant', on ? 'turn_off' : 'turn_on'); }} style={{ width: 44, height: 25, borderRadius: 13, background: on ? 'var(--o-accent)' : 'var(--o-bd1)', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background .25s' }}><span style={{ position: 'absolute', top: 3, left: on ? 22 : 3, width: 19, height: 19, borderRadius: '50%', background: '#fff', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)', boxShadow: '0 2px 5px rgba(0,0,0,.3)' }} /></span>}
        {runnable && !dead && <button onClick={(e) => { e.stopPropagation(); call(runnable[0], runnable[1]); }} style={{ padding: '7px 12px', borderRadius: 10, background: 'rgba(var(--o-accent-rgb),.14)', border: 'none', color: 'var(--o-accent-soft)', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>{runnable[2]}</button>}
        {dom === 'lock' && !dead && <button onClick={(e) => { e.stopPropagation(); call('lock', s === 'locked' ? 'unlock' : 'lock'); }} style={{ padding: '7px 12px', borderRadius: 10, background: s === 'locked' ? 'rgba(var(--o-ok-rgb),.14)' : 'rgba(var(--o-warn2-rgb),.16)', border: 'none', color: s === 'locked' ? 'var(--o-ok)' : 'var(--o-warn2)', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>{s === 'locked' ? 'Déverrouiller' : 'Verrouiller'}</button>}
        {/* Compacte : le contrôle PRIMAIRE du domaine reste sur la ligne —
          * discret, pour laisser le nom respirer. */}
        {dense && !dead && (() => {
          const mini = { width: 26, height: 26, borderRadius: 8, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s1)', color: 'var(--o-text1)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, padding: 0 };
          if (dom === 'climate') return (<>
            <button style={mini} aria-label={'− ' + name} onClick={(e) => { e.stopPropagation(); if (a.temperature != null) commander(hass, id, 'set_temperature', a.temperature - .5); }}>−</button>
            <button style={mini} aria-label={'+ ' + name} onClick={(e) => { e.stopPropagation(); if (a.temperature != null) commander(hass, id, 'set_temperature', a.temperature + .5); }}>+</button>
          </>);
          if (dom === 'cover') return (<>
            <button style={mini} aria-label={tr('Ouvrir') + ' ' + name} onClick={(e) => { e.stopPropagation(); call('cover', 'open_cover'); }}><Fi i="angle-up" size={13} /></button>
            <button style={mini} aria-label={tr('Fermer') + ' ' + name} onClick={(e) => { e.stopPropagation(); call('cover', 'close_cover'); }}><Fi i="angle-down" size={13} /></button>
          </>);
          if (dom === 'vacuum' || dom === 'lawn_mower') return (
            <button style={mini} title={on ? tr('Renvoyer au dock') : (dom === 'vacuum' ? tr('Démarrer le nettoyage') : tr('Lancer la tonte'))} onClick={(e) => { e.stopPropagation(); call(dom, on ? (dom === 'vacuum' ? 'return_to_base' : 'dock') : (dom === 'vacuum' ? 'start' : 'start_mowing')); }}><Fi i={on ? 'home' : 'play'} size={12} /></button>
          );
          if (dom === 'media_player' && s !== 'off') return (
            <button style={mini} aria-label={s === 'playing' ? 'Pause' : tr('Lecture')} onClick={(e) => { e.stopPropagation(); commander(hass, id, 'play_pause'); }}><Fi i={s === 'playing' ? 'pause' : 'play'} size={12} /></button>
          );
          return null;
        })()}
      </div>
      {/* Machines : l'illustration en filigrane latéral — la carte standard
        * garde la taille standard, l'illustration ne pousse rien. */}
      {!dense && (dom === 'vacuum' || dom === 'lawn_mower') && !dead && (
        <div aria-hidden="true" style={{ position: 'absolute', right: 12, top: 10, width: 78, height: 78, backgroundImage: `url("${dom === 'vacuum' ? DEVICE_ART.vacuum : DEVICE_ART.mower}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', opacity: 0.3, pointerEvents: 'none' }} />
      )}
      {/* Standard lumière : la luminosité en dessous — commit au relâcher. */}
      {!dense && dom === 'light' && !dead && (a.brightness != null || (a.supported_color_modes || []).indexOf('brightness') >= 0) && (
        <div className="o-cvrange" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <Fi i="bulb" size={13} color="var(--o-text3)" />
          <input type="range" min="1" max="100" key={on ? Math.round((a.brightness || 0) / 255 * 100) : 0}
            defaultValue={on ? Math.round((a.brightness || 0) / 255 * 100) : 0} aria-label={tr('{n} % de luminosité', { n: '' })}
            onPointerUp={(e) => call('light', 'turn_on', { brightness_pct: +e.target.value })}
            onKeyUp={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') call('light', 'turn_on', { brightness_pct: +e.target.value }); }}
            style={{ flex: 1, minWidth: 0 }} />
        </div>
      )}
      {!dense && dom === 'climate' && !dead && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <button onClick={(e) => { e.stopPropagation(); if (a.temperature != null) commander(hass, id, 'set_temperature', a.temperature - .5); }} style={{ flex: 1, padding: 8, borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>−</button>
          <span style={{ fontSize: 15, fontWeight: 800, minWidth: 52, textAlign: 'center' }}>{a.temperature != null ? a.temperature + '°' : '—'}</span>
          <button onClick={(e) => { e.stopPropagation(); if (a.temperature != null) commander(hass, id, 'set_temperature', a.temperature + .5); }} style={{ flex: 1, padding: 8, borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>+</button>
        </div>
      )}
      {!dense && dom === 'cover' && !dead && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {[['open_cover', 'angle-up'], ['stop_cover', 'square'], ['close_cover', 'angle-down']].map(([svc, gi]) => (
            <button key={svc} onClick={(e) => { e.stopPropagation(); call('cover', svc); }} style={{ flex: 1, padding: 9, borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i={gi} size={14} /></button>
          ))}
        </div>
      )}
      {!dense && dom === 'media_player' && !dead && s !== 'off' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={(e) => { e.stopPropagation(); commander(hass, id, 'play_pause'); }} style={{ flex: 1, padding: 9, borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontWeight: 700, fontSize: 12 }}><Fi i={s === 'playing' ? 'pause' : 'play'} size={13} />{s === 'playing' ? 'Pause' : tr('Lecture')}</button>
        </div>
      )}
      {/* Machines : les MÊMES contrôles que la fiche native Home Assistant,
        * dérivés de supported_features — aucun script, aucune configuration. */}
      {!dense && (dom === 'vacuum' || dom === 'lawn_mower') && !dead && (() => {
        const f = a.supported_features || 0;
        const btns = [];
        if (dom === 'vacuum') {
          const enCours = s === 'cleaning';
          if (enCours ? (f & 4) : (f & 8192)) btns.push([enCours ? 'pause' : 'play', enCours ? 'pause' : 'start', enCours ? tr('Pause') : tr('Démarrer le nettoyage')]);
          if ((f & 8) && (s === 'cleaning' || s === 'returning' || s === 'paused')) btns.push(['stop', 'stop', 'Stop']);
          if (f & 16) btns.push(['home', 'return_to_base', tr('Renvoyer au dock')]);
          if (f & 512) btns.push(['marker', 'locate', tr('Localiser')]);
        } else {
          const enCours = s === 'mowing';
          if (enCours ? (f & 2) : (f & 1)) btns.push([enCours ? 'pause' : 'play', enCours ? 'pause' : 'start_mowing', enCours ? tr('Pause') : tr('Lancer la tonte')]);
          if (f & 4) btns.push(['home', 'dock', tr('Renvoyer au dock')]);
        }
        return btns.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {btns.map(([gi, svc, lbl]) => (
              <button key={svc} title={lbl} aria-label={lbl} onClick={(e) => { e.stopPropagation(); call(dom, svc); }} style={{ flex: 1, padding: 9, borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i={gi} size={14} /></button>
            ))}
          </div>
        );
      })()}
      {!dense && dom === 'vacuum' && !dead && Array.isArray(a.fan_speed_list) && a.fan_speed_list.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
          <MenuDeroulant icone="wind" etiquette={tr('Vitesse')} valeur={a.fan_speed} options={a.fan_speed_list}
            rendre={(v) => FAN_FR()[v] || v} surChoix={(v) => call('vacuum', 'set_fan_speed', { fan_speed: v })} />
        </div>
      )}
      {!dense && dom === 'valve' && !dead && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={(e) => { e.stopPropagation(); call('valve', on ? 'close_valve' : 'open_valve'); }} style={{ flex: 1, padding: 9, borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>{on ? tr('Fermer') : tr('Ouvrir')}</button>
        </div>
      )}
      {!dense && <Epingles pourId={id} hass={hass} />}
    </div>
  );
}

/* ════════════ CATALOGUE DE CARTES des vues custom ════════════
 * Le TYPE se choisit à l'ajout — jamais par un geste implicite : quand une
 * entité admet plusieurs cartes, le sheet d'ajout les propose. Chaque entrée
 * typée de `cv.ents` s'écrit { t, id } ; la chaîne nue reste la compacte. */

const CV_CADRE = { background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,18px)', padding: 16, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' };

/* Un switch n'est une lumière que s'il est déclaré interrupteur-lumière ;
 * sinon c'est une prise ou un appareil : icône prise, teinte accent — pas l'or. */
const cvEstLumiere = (id) => String(id).indexOf('light.') === 0 || (String(id).indexOf('switch.') === 0 && switchLights().indexOf(id) >= 0);
// La fonte UICons n'a pas de prise : SVG maison, comme BulbIcon.
const PlugIcon = ({ size = 19 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 2v6M15 2v6" />
    <path d="M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8z" />
    <path d="M12 17v5" />
  </svg>
);

/** Les cartes qui vont à une entité, la première étant proposée en premier.
 * Partout : COMPACTE (une ligne, contrôle primaire, rien dessous) et STANDARD
 * (les contrôles du domaine en dessous) — puis les spécialisées du domaine. */
function cvTypesPour(id) {
  const d = String(id).split('.')[0];
  if (d === 'light' || d === 'switch' || d === 'fan') return ['compacte', 'riche', 'gros', 'journal'];
  if (d === 'cover' || d === 'climate' || d === 'media_player' || d === 'vacuum' || d === 'lawn_mower' || d === 'valve' || d === 'humidifier' || d === 'lock' || d === 'siren' || d === 'water_heater') return ['compacte', 'riche', 'journal'];
  if (d === 'scene' || d === 'script' || d === 'button' || d === 'input_button' || d === 'automation') return ['compacte', 'riche'];
  if (d === 'sensor') return ['compacte', 'chiffre', 'jauge', 'graph', 'journal'];
  if (d === 'binary_sensor') return ['compacte', 'chiffre', 'journal'];
  if (d === 'person') return ['compacte', 'personne', 'journal'];
  if (d === 'weather') return ['compacte', 'meteo'];
  if (d === 'calendar') return ['agenda', 'compacte'];
  if (d === 'alarm_control_panel') return ['compacte', 'alarme', 'riche'];
  return ['compacte', 'riche'];
}
const CV_TYPE_NOMS = () => ({ compacte: tr('Compacte'), riche: tr('Standard'), gros: tr('Gros interrupteur'), chiffre: tr('Grand chiffre'), jauge: tr('Jauge'), graph: tr('Graphique 24 h'), journal: tr('Journal'), personne: tr('Présence'), meteo: tr('Météo'), agenda: tr('Agenda'), alarme: tr('Alarme'), horloge: tr('Horloge') });

/* Horloge : l'heure de la maison, sans entité — la carte se suffit. */
function CvClock() {
  const [, tic] = useState(0);
  useEffect(() => { const iv = setInterval(() => tic(n => n + 1), 15000); return () => clearInterval(iv); }, []);
  const d = new Date();
  const h = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  const jour = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div style={{ ...CV_CADRE, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{h}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6, textTransform: 'capitalize' }}>{jour}</div>
    </div>
  );
}

/* Grand chiffre : la valeur en très grand, l'unité, le nom. Un binaire dit son
 * état en toutes lettres ; la richesse d'un capteur, c'est sa lisibilité. */
function CvBigSensor({ id, hass }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const dom = String(id).split('.')[0];
  const brut = st ? st.state : null;
  const mort = !st || brut === 'unavailable' || brut === 'unknown';
  let valeur, unite = '';
  if (mort) valeur = '—';
  else if (dom === 'binary_sensor') {
    const porte = ['door', 'window', 'garage_door', 'opening'].indexOf(a.device_class) >= 0;
    valeur = brut === 'on' ? (porte ? tr('Ouvert') : tr('Détecté')) : (porte ? tr('Fermé') : 'RAS');
  } else {
    const n = parseFloat(brut);
    valeur = isNaN(n) ? brut : (Math.round(n * 10) / 10).toLocaleString(locale());
    unite = a.unit_of_measurement || '';
  }
  return (
    <div className={'o-piece' + (mort ? ' o-panne' : '')} style={{ ...CV_CADRE, height: '100%', minHeight: 150, opacity: mort ? .55 : 1 }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text3)' }}><Fi i={CV_DOM_ICON[cvDomain(id)] || 'bolt'} size={17} /></span>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
        <div style={{ fontSize: 'clamp(32px, 3vw + 12px, 54px)', fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>
          {valeur}{unite && <span style={{ fontSize: '.42em', fontWeight: 700, color: 'var(--o-text2)', marginLeft: 6 }}>{unite}</span>}
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cvName(st, id)}</div>
    </div>
  );
}

/* Jauge : un arc de cercle. Le pourcentage vient de l'unité « % », sinon des
 * bornes min/max de l'entité — des °C entre min_temp et max_temp se jaugent
 * aussi bien qu'une batterie. */
function CvGauge({ id, hass }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const n = st ? parseFloat(st.state) : NaN;
  const mort = !st || isNaN(n);
  const min = a.min != null ? +a.min : (a.min_temp != null ? +a.min_temp : 0);
  const max = a.max != null ? +a.max : (a.max_temp != null ? +a.max_temp : (a.unit_of_measurement === '%' ? 100 : 100));
  const pct = mort ? 0 : Math.max(0, Math.min(1, (n - min) / (max - min || 1)));
  const basse = a.device_class === 'battery' && n < 20;
  const col = basse ? 'var(--o-bad)' : 'var(--o-accent)';
  // Arc de 240° : de 150° à 390°, rayon 44, épaisseur 9.
  const arc = (p) => {
    const a0 = (150 * Math.PI) / 180, a1 = ((150 + 240 * p) * Math.PI) / 180;
    const x0 = 60 + 44 * Math.cos(a0), y0 = 60 + 44 * Math.sin(a0);
    const x1 = 60 + 44 * Math.cos(a1), y1 = 60 + 44 * Math.sin(a1);
    return `M ${x0} ${y0} A 44 44 0 ${240 * p > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  return (
    <div className={'o-piece' + (mort ? ' o-panne' : '')} style={{ ...CV_CADRE, height: '100%', minHeight: 150, alignItems: 'center', opacity: mort ? .55 : 1 }}>
      <div style={{ position: 'relative', width: 120, height: 104, flexShrink: 0 }}>
        <svg width="120" height="120" viewBox="0 0 120 120" style={{ position: 'absolute', top: -4 }}>
          <path d={arc(1)} fill="none" stroke="var(--o-s1)" strokeWidth="9" strokeLinecap="round" />
          {!mort && pct > 0.005 && <path d={arc(pct)} fill="none" stroke={col} strokeWidth="9" strokeLinecap="round" style={{ transition: 'stroke .3s' }} />}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 6 }}>
          <span style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{mort ? '—' : Math.round(n * 10) / 10}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)' }}>{a.unit_of_measurement || ''}</span>
        </div>
      </div>
      <div style={{ marginTop: 'auto', width: '100%', textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cvName(st, id)}</div>
    </div>
  );
}

/* Gros interrupteur : toute la carte est le bouton — pensée pour la tablette
 * murale, où viser un petit toggle est une corvée. */
function CvBigToggle({ id, hass }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const on = !!st && st.state === 'on';
  const mort = !st || st.state === 'unavailable';
  // L'or est réservé aux lumières ; une prise ou un appareil s'allume à l'accent, icône prise.
  const lum = cvEstLumiere(id);
  const rgbTok = lum ? 'var(--o-gold-rgb)' : 'var(--o-accent-rgb)';
  const txtCol = lum ? 'var(--o-warn)' : 'var(--o-accent-soft)';
  const toggle = () => { try { if (hass && hass.callService) hass.callService('homeassistant', 'toggle', { entity_id: id }); } catch (e) {} };
  return (
    <button className={'o-piece' + (mort ? ' o-panne' : '')} onClick={toggle} disabled={mort}
      style={{ ...CV_CADRE, height: '100%', minHeight: 150, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 12, cursor: mort ? 'default' : 'pointer', opacity: mort ? .55 : 1, transition: 'all .25s',
        ...(on ? { background: `linear-gradient(160deg,rgba(${rgbTok},${lav(.22)}),transparent 62%), linear-gradient(180deg,var(--o-surfA),var(--o-surfB))`, border: `1px solid rgba(${rgbTok},${lav(.35)})` } : {}) }}>
      <span style={{ width: 62, height: 62, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? `rgba(${rgbTok},.2)` : 'var(--o-s1)', color: on ? txtCol : 'var(--o-text3)', boxShadow: on ? `0 0 22px rgba(${rgbTok},.4)` : 'none', transition: 'all .25s' }}>
        {String(id).indexOf('switch.') === 0 && !lum ? <PlugIcon size={26} /> : <Fi i="power" size={26} />}
      </span>
      <span style={{ fontSize: 14.5, fontWeight: 800 }}>{cvName(st, id)}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: on ? txtCol : 'var(--o-text3)' }}>{mort ? tr('Indisponible') : on ? tr('Allumé') : tr('Éteint')}</span>
    </button>
  );
}

/* Présence : la personne, son état, depuis quand. */
function CvPerson({ id, hass }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const nom = cvName(st, id);
  const home = !!st && st.state === 'home';
  const img = a.entity_picture || null;
  return (
    <div className="o-piece" style={{ ...CV_CADRE, height: '100%', minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <span style={{ position: 'relative', width: 58, height: 58, flexShrink: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', borderRadius: '50%', background: img ? `url("${img}") center/cover` : 'var(--o-s1)', color: 'var(--o-text2)', fontSize: 22, fontWeight: 800, boxShadow: home ? '0 0 0 2.5px var(--o-ok), 0 0 12px rgba(52,211,153,.5)' : '0 0 0 2px var(--o-bd1)', opacity: home ? 1 : .55 }}>{!img && nom.charAt(0).toUpperCase()}</span>
        <span style={{ position: 'absolute', right: -1, bottom: -1, width: 14, height: 14, borderRadius: '50%', background: home ? 'var(--o-ok)' : 'var(--o-text3)', border: '2.5px solid var(--o-surfA)' }} />
      </span>
      <span style={{ fontSize: 14.5, fontWeight: 800 }}>{nom}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: home ? 'var(--o-ok)' : 'var(--o-text3)' }}>{home ? tr('Présent') : 'Absent'}{st && st.last_changed ? ' · ' + relTime(st.last_changed).toLowerCase() : ''}</span>
    </div>
  );
}

/* Météo : la vignette animée de l'accueil, en carte. */
function CvWeather({ id, hass }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const S = (hass && hass.states) || {};
  const nuit = S['sun.sun'] ? S['sun.sun'].state === 'below_horizon' : false;
  const wx = st ? haWeatherMode(st.state, nuit) : 'clouds';
  return (
    <div className="o-piece" style={{ ...CV_CADRE, height: '100%', minHeight: 150, position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <WxMini wx={wx} on={true} />
      <WeatherIco wx={wx} size={52} />
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 800 }}>{a.temperature != null ? Math.round(a.temperature) : '—'}°</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)' }}>{st ? haWeatherLabel(st.state) : ''}</div>
      </div>
    </div>
  );
}

/* Agenda : les prochains événements d'UN calendrier. */
function CvAgenda({ id, hass }) {
  const events = useAgenda(hass, useMemo(() => [id], [id]));
  const st = hass && hass.states ? hass.states[id] : null;
  return (
    <div className="o-piece" style={{ ...CV_CADRE, height: '100%', overflow: 'hidden' }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>{cvName(st, id)}</div>
      <div style={{ fontSize: 10.5, color: 'var(--o-text2)', fontWeight: 600, marginBottom: 4 }}>{tr('Les 7 prochains jours')}</div>
      {events.length === 0 && <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, padding: '10px 0' }}>{tr('Rien de prévu')}</div>}
      {events.slice(0, 3).map((e, i) => {
        const { jour, heure } = jourAgenda(e);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.summary}</div>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--o-text2)' }}>{jour}</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, flexShrink: 0, color: 'var(--o-accent-soft)' }}>{heure}</span>
          </div>
        );
      })}
    </div>
  );
}

/* Alarme : l'état et les trois gestes. Le désarmement passe par le service ;
 * si le panneau exige un code, Home Assistant refusera — comme partout. */
function CvAlarm({ id, hass }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const s = st ? st.state : null;
  const call = (svc) => { try { if (hass && hass.callService) hass.callService('alarm_control_panel', svc, { entity_id: id }); } catch (e) {} };
  const [txt, col] = s === 'disarmed' ? [tr('Désarmée'), 'var(--o-ok)']
    : s === 'triggered' ? [tr('ALERTE'), 'var(--o-bad)']
      : (s === 'arming' || s === 'pending') ? [tr('Activation en cours…'), 'var(--o-warn2)']
        : s ? [tr('Armée'), 'var(--o-warn2)'] : ['—', 'var(--o-text3)'];
  const btn = { flex: 1, padding: '9px 6px', borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s1)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' };
  return (
    <div className="o-piece" style={{ ...CV_CADRE, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hx(col, .16), color: col }}><Fi i="shield-check" size={17} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cvName(st, id)}</div>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: col }}>{txt}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
        <button style={btn} onClick={() => call('alarm_arm_away')}>{tr('Absent')}</button>
        <button style={btn} onClick={() => call('alarm_arm_home')}>{tr('Présent')}</button>
        <button style={{ ...btn, background: 'rgba(52,211,153,.12)', color: 'var(--o-ok)', borderColor: 'rgba(52,211,153,.3)' }} onClick={() => call('alarm_disarm')}>{tr('Désarmer')}</button>
      </div>
    </div>
  );
}

/* Journal : les dernières entrées du logbook pour CETTE entité. */
function CvJournal({ id, hass }) {
  // Journal d'UNE entité : ne fusionner que les états identiques qui se
  // répètent — fusionner par entité viderait la carte de son sujet.
  const events = grouperJournal(useRoomLogbook(hass, useMemo(() => [id], [id])), (e) => (e.entity_id || '') + '|' + (e.state != null ? e.state : e.message));
  const S = (hass && hass.states) || {};
  const st = S[id];
  const heure = (when) => { const ms = when < 1e12 ? when * 1000 : when; return new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); };
  return (
    <div className="o-piece" style={{ ...CV_CADRE, height: '100%', overflow: 'hidden' }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cvName(st, id)}</div>
      <div style={{ fontSize: 10.5, color: 'var(--o-text2)', fontWeight: 600, marginBottom: 4 }}>{tr('Journal')}</div>
      {events.length === 0 && <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, padding: '10px 0' }}>{tr('Rien à raconter')}</div>}
      {events.slice(0, 3).map((e, i) => (
        <div key={(e.when || 0) + '|' + i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--o-text1)' }}>{e.state != null ? etatJournal(id, e.state, S) : (e.message || '')}{e.n > 1 ? ' ·×' + e.n : ''}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text3)' }}>{heure(e.when)}</span>
        </div>
      ))}
    </div>
  );
}

/* Graphique 24 h : l'historique du capteur en filigrane, la valeur en clair.
 * L'API historique de HA est un GET (pattern des autres lectures d'historique
 * du fichier) : relecture au montage puis toutes les cinq minutes. */
function CvHistory({ id, hass }) {
  const points = useHistorique24(hass, id);
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const mort = !st || st.state === 'unavailable';
  const cur = st ? parseFloat(st.state) : NaN;
  let chemin = '', aire = '', vmin = null, vmax = null;
  if (points && points.length > 1) {
    const t0 = points[0].t, t1 = points[points.length - 1].t || t0 + 1;
    vmin = Math.min(...points.map(p => p.v)); vmax = Math.max(...points.map(p => p.v));
    const spread = (vmax - vmin) || 1;
    const X = (t) => ((t - t0) / (t1 - t0 || 1)) * 100;
    const Y = (v) => 34 - ((v - vmin) / spread) * 28;
    chemin = points.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' ');
    aire = chemin + ` L 100 40 L 0 40 Z`;
  }
  return (
    <div className={'o-piece' + (mort ? ' o-panne' : '')} style={{ ...CV_CADRE, height: '100%', minHeight: 150, position: 'relative', overflow: 'hidden', opacity: mort ? .55 : 1 }}>
      {chemin && (
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: '58%' }}>
          <path d={aire} fill="rgba(var(--o-accent-rgb),.10)" />
          <path d={chemin} fill="none" stroke="var(--o-accent)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <div style={{ position: 'relative', fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cvName(st, id)}</div>
      <div style={{ position: 'relative', fontSize: 26, fontWeight: 800, marginTop: 2 }}>{isNaN(cur) ? '—' : Math.round(cur * 10) / 10}<span style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text2)', marginLeft: 4 }}>{a.unit_of_measurement || ''}</span></div>
      <div style={{ position: 'relative', marginTop: 'auto', fontSize: 10.5, fontWeight: 600, color: 'var(--o-text3)' }}>
        {points === null ? tr('Chargement…') : points.length < 2 ? tr("Pas d'historique sur 24 h") : (tr('min {a} · max {b}', { a: Math.round(vmin * 10) / 10, b: Math.round(vmax * 10) / 10 }))}
      </div>
    </div>
  );
}

/** La carte d'une entrée de vue custom, selon sa forme et son type. */
function CvTyped({ x, hass, dc }) {
  if (cvEstTpl(x)) return <CvTemplateCard def={x} hass={hass} />;
  // La chaîne nue EST la compacte : une ligne, le contrôle primaire, rien dessous.
  if (typeof x === 'string') return <CvCard id={x} hass={hass} onOpen={dc.ouvrir} dense />;
  const { t, id } = x;
  // Les cartes capteur ouvrent la fiche 24 h au clic — elles n'ont aucun contrôle interne à protéger.
  const ouvre = (comp) => String(id).split('.')[0] === 'sensor'
    ? <div role="button" tabIndex={0} aria-label={'Ouvrir ' + id} onClick={() => dc.ouvrir(id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dc.ouvrir(id); } }} style={{ height: '100%', cursor: 'pointer' }}>{comp}</div>
    : comp;
  if (t === 'compacte') return <CvCard id={id} hass={hass} onOpen={dc.ouvrir} dense />;
  // La STANDARD : la carte riche des vues intégrées quand le domaine en a une
  // (volet à curseur, lumière au lavis, thermostat à consigne…) — la carte
  // générique pleine pour le reste (machines, prises…).
  if (t === 'riche') return dc.card(id);
  if (t === 'horloge') return <CvClock />;
  if (t === 'chiffre') return ouvre(<CvBigSensor id={id} hass={hass} />);
  if (t === 'jauge') return ouvre(<CvGauge id={id} hass={hass} />);
  if (t === 'graph') return ouvre(<CvHistory id={id} hass={hass} />);
  if (t === 'gros') return <CvBigToggle id={id} hass={hass} />;
  if (t === 'personne') return <CvPerson id={id} hass={hass} />;
  if (t === 'meteo') return <CvWeather id={id} hass={hass} />;
  if (t === 'agenda') return <CvAgenda id={id} hass={hass} />;
  if (t === 'alarme') return <CvAlarm id={id} hass={hass} />;
  if (t === 'journal') return <CvJournal id={id} hass={hass} />;
  return <CvCard id={id} hass={hass} onOpen={dc.ouvrir} />;
}

function CustomView({ cv, hass, edit = false, onSave }) {
  // Mode édition en place : la CARTE ENTIÈRE se saisit et se déplace (ses
  // contrôles sont inertes pendant l'édition), le COIN bas-droit s'étire pour
  // choisir le format, la croix retire. Tuile « + Ajouter une carte »,
  // renommage inline.
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  // Carte template en cours d'édition (crayon en mode édition) — TplForm prérempli, l'id survit.
  const [tplEdit, setTplEdit] = useState(null);
  const [nameDraft, setNameDraft] = useState(cv.name);
  useEffect(() => { setNameDraft(cv.name); setRenaming(false); setAdding(false); setTplEdit(null); }, [cv.id, edit]);
  const setEnts = (ents) => onSave && onSave({ ...cv, ents });
  const dc = useDomainCards(hass);
  // Choix du TYPE à l'ajout : l'entité cliquée dont on attend le choix.
  const [pickCarte, setPickCarte] = useState(null);
  /* ── Déplacement : saisir la carte ─────────────────────────────────────────
   * Pointer capture sur le wrapper ; au mouvement, la carte sous le doigt
   * (elementFromPoint → wrapper [data-cvk]) désigne la place d'insertion. La
   * liste se réordonne EN DIRECT dans un état local — le doigt voit ce qu'il
   * fait — et l'enregistrement n'a lieu qu'au relâcher, comme les sliders. */
  const [dragCle, setDragCle] = useState(null);
  const [ordreDrag, setOrdreDrag] = useState(null);
  const grilleRef = useRef(null);
  const debutDrag = (e, x) => {
    if (!edit) return;
    if (e.target.closest && e.target.closest('button')) return; // ×, coin
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (er) {}
    setDragCle(cvKey(x));
    setOrdreDrag([...cv.ents]);
  };
  const mouvDrag = (e) => {
    if (dragCle == null || !ordreDrag) return;
    const sous = document.elementFromPoint(e.clientX, e.clientY);
    const cible = sous && sous.closest ? sous.closest('[data-cvk]') : null;
    if (!cible) return;
    const cleCible = cible.getAttribute('data-cvk');
    if (cleCible === dragCle) return;
    const de = ordreDrag.findIndex(x => cvKey(x) === dragCle);
    const vers = ordreDrag.findIndex(x => cvKey(x) === cleCible);
    if (de < 0 || vers < 0) return;
    const a = [...ordreDrag];
    const [pris] = a.splice(de, 1);
    a.splice(vers, 0, pris);
    setOrdreDrag(a);
  };
  const finDrag = () => {
    if (dragCle != null && ordreDrag) setEnts(ordreDrag);
    setDragCle(null); setOrdreDrag(null);
  };
  const liste = ordreDrag || cv.ents;
  const editBtn = { width: 26, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-surfA)', color: 'var(--o-text1)', boxShadow: '0 3px 10px rgba(0,0,0,.35)', fontSize: 12, fontWeight: 800, padding: 0 };
  /* Largeur d'une carte : 1 (défaut) ou 2 emplacements côte à côte. Portée par
   * l'entrée typée (`w: 2`) ; une chaîne nue élargie devient sa forme typée. */
  const cvW = (x) => (x && typeof x === 'object' && x.w === 2) ? 2 : 1;
  /* Hauteur en RANGÉES de la grille dense : une compacte tient sur une, une
   * standard sur deux — deux compactes s'empilent donc à côté d'une standard. */
  /* DEUX tailles, pas trois : compacte (1 rangée) ou standard (2 rangées).
   * Toute carte non compacte DOIT tenir dans la standard — le graphique, le
   * journal et les machines se compriment plutôt que de déborder. */
  const CV_ROWS = { compacte: 1, horloge: 1, personne: 2, riche: 2, gros: 2, jauge: 2, chiffre: 2, meteo: 2, alarme: 2, tpl: 2, graph: 2, agenda: 2, journal: 2 };
  const cvRowsDe = (x) => {
    if (typeof x === 'string') return 1;
    const d = String(x.id || '').split('.')[0];
    if (x.t === 'riche') {
      if (['climate', 'cover', 'media_player', 'valve', 'light', 'vacuum', 'lawn_mower'].indexOf(d) >= 0) return 2;
      return 1;
    }
    return CV_ROWS[x.t] || 2;
  };
  const basculerW = (x) => {
    const suiv = typeof x === 'string'
      ? { t: 'compacte', id: x, w: 2 }
      : (x.w === 2 ? (({ w, ...reste }) => reste)(x) : { ...x, w: 2 });
    setEnts(cv.ents.map(y => cvKey(y) === cvKey(x) ? suiv : y));
  };
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {edit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderRadius: 14, background: 'rgba(var(--o-accent-rgb),.12)', border: '1px dashed rgba(var(--o-accent-rgb),.45)' }}>
            <Fi i="pencil" size={14} color="var(--o-accent-soft)" />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-accent-soft)' }}>{tr('Mode édition')}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', flex: 1 }}>{tr('Prends une carte pour la déplacer, retire (×) ou ajoute.')}</span>
          </div>
        )}
        <div>
          {edit && renaming
            ? <div style={{ display: 'flex', gap: 10, alignItems: 'center', maxWidth: 420 }}>
                <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} autoFocus style={cvInp} />
                <button onClick={() => { const n = nameDraft.trim(); if (n) onSave && onSave({ ...cv, name: n }); setRenaming(false); }} style={{ padding: '11px 16px', borderRadius: 11, background: 'var(--o-accent)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>OK</button>
              </div>
            : <h1 onClick={edit ? () => setRenaming(true) : undefined} style={{ margin: 0, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 36, fontWeight: 500, cursor: edit ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 12 }}>{cv.name}{edit && <Fi i="pencil" size={16} color="var(--o-text3)" />}</h1>}
          <div style={{ fontSize: 14, color: 'var(--o-text2)', fontWeight: 600, marginTop: 4 }}>{cv.ents.length > 1 ? tr('{n} entités', { n: cv.ents.length }) : tr('{n} entité', { n: cv.ents.length })}</div>
        </div>
        {/* Grille DENSE : chaque carte déclare sa hauteur en rangées (.grid-custom
          * pose l'auto-flow dense et l'unité de rangée) — les trous se comblent. */}
        <div ref={grilleRef} className="grid-custom" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 14 }}>
          {liste.map((x) => {
            const saisie = dragCle === cvKey(x);
            return (
            <div key={cvKey(x)} data-cvk={cvKey(x)} className={cvW(x) === 2 ? 'o-cvw2' : undefined}
              onPointerDown={edit ? (e) => debutDrag(e, x) : undefined}
              onPointerMove={edit ? mouvDrag : undefined}
              onPointerUp={edit ? finDrag : undefined}
              onPointerCancel={edit ? finDrag : undefined}
              style={{ position: 'relative', minWidth: 0, gridRow: 'span ' + cvRowsDe(x),
              opacity: saisie ? .55 : 1, transform: saisie ? 'scale(.97)' : 'none', transition: 'opacity .15s, transform .15s',
              ...(edit ? { outline: saisie ? '2px solid var(--o-accent)' : '1px dashed rgba(var(--o-accent-rgb),.5)', outlineOffset: 3, borderRadius: 'var(--o-radius,18px)', cursor: 'grab', touchAction: 'none' } : {}) }}>
              {/* En édition, la carte est INERTE : la saisir la déplace, ses contrôles ne s'actionnent pas. */}
              <div className="o-cvfit" style={{ height: '100%', pointerEvents: edit ? 'none' : 'auto' }}>
                <CvTyped x={x} hass={hass} dc={dc} />
              </div>
              {edit && (
                <>
                  <button onClick={() => setEnts(cv.ents.filter(y => cvKey(y) !== cvKey(x)))} title={tr('Retirer')} style={{ ...editBtn, position: 'absolute', top: -9, right: -9, background: 'var(--o-bad)', color: '#fff' }}>×</button>
                  <button onClick={() => basculerW(x)} title={cvW(x) === 2 ? tr('Largeur simple') : tr('Largeur double')} aria-pressed={cvW(x) === 2}
                    style={{ ...editBtn, position: 'absolute', bottom: -9, right: -9, ...(cvW(x) === 2 ? { background: 'var(--o-accent)', color: '#fff' } : {}) }}><Fi i="arrows-h" size={11} /></button>
                  {cvEstTpl(x) && <button onClick={() => setTplEdit(x)} title={tr('Modifier')} style={{ ...editBtn, position: 'absolute', top: -9, right: 24 }}><Fi i="pencil" size={11} /></button>}
                </>
              )}
            </div>
            );
          })}
          {edit && (
            <button onClick={() => setAdding(true)} style={{ minHeight: 88, borderRadius: 'var(--o-radius,18px)', border: '2px dashed rgba(var(--o-accent-rgb),.45)', background: 'rgba(var(--o-accent-rgb),.06)', color: 'var(--o-accent-soft)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7, fontWeight: 700, fontSize: 13 }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>Ajouter une carte
            </button>
          )}
        </div>
        {!edit && !cv.ents.length && <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13.5, color: 'var(--o-text3)', fontWeight: 600 }}>{tr('Vue vide — active le crayon (en haut) pour ajouter des cartes.')}</div>}
        {dc.sheets}
        {tplEdit && (
          <BottomSheet onClose={() => setTplEdit(null)}>
            {close => (<>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{tr('Modifier la carte template')}</div>
              <TplForm hass={hass} initial={tplEdit} onAdd={(t) => { setEnts(cv.ents.map(y => cvKey(y) === cvKey(tplEdit) ? t : y)); close(); }} />
            </>)}
          </BottomSheet>
        )}
        {adding && (
          <BottomSheet onClose={() => setAdding(false)}>
            {close => (<>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <button onClick={close} aria-label={tr('Fermer')} title={tr('Fermer')} style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--o-s1)', border: 'none', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
                <span style={{ fontSize: 18, fontWeight: 700 }}>{tr('Ajouter une carte')}</span>
              </div>
              {pickCarte ? (() => {
                /* Le type se choisit ICI, à l'ajout — jamais par un geste
                 * implicite. La compacte reste le premier choix. */
                const noms = CV_TYPE_NOMS();
                const st = hass && hass.states ? hass.states[pickCarte] : null;
                return (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{tr('Quelle carte pour {nom} ?', { nom: cvName(st, pickCarte) })}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {cvTypesPour(pickCarte).map(t => (
                        <button key={t} onClick={() => { setEnts([...cv.ents, t === 'compacte' ? pickCarte : { t, id: pickCarte }]); setPickCarte(null); }}
                          style={{ padding: '10px 15px', borderRadius: 11, cursor: 'pointer', fontWeight: 700, fontSize: 12.5, background: t === 'compacte' ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', border: '1px solid ' + (t === 'compacte' ? 'var(--o-accent)' : 'var(--o-bd1)'), color: t === 'compacte' ? 'var(--o-accent-soft)' : 'var(--o-text1)' }}>{noms[t]}</button>
                      ))}
                    </div>
                    <button onClick={() => setPickCarte(null)} style={{ marginTop: 12, padding: '8px 14px', borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s1)', color: 'var(--o-text2)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{tr('Annuler')}</button>
                  </div>
                );
              })() : (<>
              <EntPicker hass={hass} exclude={[]} onPick={(id) => { if (cvTypesPour(id).length > 1) setPickCarte(id); else setEnts([...cv.ents, id]); }} autoFocus />
              <div style={{ fontSize: 11.5, color: 'var(--o-text3)', fontWeight: 600, marginTop: 10 }}>{tr('Choisis une entité, puis la carte qui lui va.')}</div>
              <button onClick={() => { setEnts([...cv.ents, { t: 'horloge', id: 'horloge:' + Date.now() }]); close(); }}
                style={{ marginTop: 14, padding: '9px 14px', borderRadius: 11, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s1)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Fi i="clock" size={13} />{tr('Ajouter une horloge')}
              </button>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', letterSpacing: '.04em', margin: '18px 0 8px' }}>{tr('OU UNE CARTE TEMPLATE')}</div>
              <TplForm hass={hass} onAdd={(t) => setEnts([...cv.ents, t])} />
              </>)}
            </>)}
          </BottomSheet>
        )}
      </div>
    </main>
  );
}



function ParametresView({ themeMode, loggiaTheme, haTheme, onMode, onPickTheme, onFollowHa, navbar, onToggleNavbar, wxFx, onToggleWxFx, ambient = 0, onAmbient, ambPlage = 'toujours', onAmbPlage, cielEtoile, onToggleCiel, navMargin, navAuto, onNavOffset, onNavOffsetReset, onNavSet, onTopSet, look = LOOK_DEF, onLook, topMargin, topAuto, onTopOffset, onTopOffsetReset, hass, users, userIdx, isAdmin, onAddUser, onUpdateUser, onDeleteUser, customViews, onSaveCustomViews }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <Suspense fallback={<div className="loggia-content" style={{ padding: '26px 28px 56px' }} />}>
      <ParametresContent onNavSet={onNavSet} onTopSet={onTopSet} look={look} onLook={onLook} wxFx={wxFx} onToggleWxFx={onToggleWxFx} ambient={ambient} onAmbient={onAmbient} ambPlage={ambPlage} onAmbPlage={onAmbPlage} themeMode={themeMode} loggiaTheme={loggiaTheme} haTheme={haTheme} onMode={onMode} onPickTheme={onPickTheme} onFollowHa={onFollowHa} navbar={navbar} onToggleNavbar={onToggleNavbar} navMargin={navMargin} navAuto={navAuto} onNavOffset={onNavOffset} onNavOffsetReset={onNavOffsetReset} topMargin={topMargin} topAuto={topAuto} onTopOffset={onTopOffset} onTopOffsetReset={onTopOffsetReset} hass={hass} users={users} userIdx={userIdx} isAdmin={isAdmin} onAddUser={onAddUser} onUpdateUser={onUpdateUser} onDeleteUser={onDeleteUser} customViews={customViews} onSaveCustomViews={onSaveCustomViews} />
      </Suspense>
    </main>
  );
}

/* ════════════ Pont Home Assistant (phase 2) ════════════
   Accède au hass du frontend HA parent (iframe same-origin /local/). null en standalone (démo). */
// Intervalle du pont hass (Parametres > Connexion). Lu UNE fois au chargement :
// changer la valeur passe par « Enregistrer », qui recharge la page.
const HASS_POLL_MS = (() => {
  try { const c = JSON.parse(window.localStorage.getItem('loggia_haCfg') || 'null'); const n = c && +c.pollMs; return (n >= 1000 && n <= 60000) ? n : 2000; } catch (e) { return 2000; }
})();
const sigHash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
// noisyKeys : capteurs de puissance (W) au jitter continu → signature = valeur arrondie à 10 W,
// SANS last_updated (sinon re-render de toute l'app à chaque tick de 2 s).
function useHass(keys, noisyKeys) {
  const [, force] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const noisy = noisyKeys && noisyKeys.length ? {} : null;
    if (noisy) for (const k of noisyKeys) noisy[k] = 1;
    const prefixes = keys.filter(k => k.charAt(k.length - 1) === '.'); // clés-préfixes (ex: 'automation.')
    const plain = keys.filter(k => k.charAt(k.length - 1) !== '.');
    let prev = '';
    const tick = () => { try {
      const hass = getHass();
      ref.current = hass;
      let sig = 'none';
      if (hass && hass.states) {
        const parts = plain.map(k => {
          const s = hass.states[k];
          if (!s) return k + ':-';
          if (noisy && noisy[k]) { const n = parseFloat(s.state); return k + ':' + (isNaN(n) ? s.state : Math.round(n / 10) * 10); }
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
  }, [keys.join(','), noisyKeys ? noisyKeys.join(',') : '']);
  return ref.current;
}

/* ════════════ Config entités (localStorage V1, partagé même origine) ════════════
   localStorage primaire ; IDs réels connus en fallback si la clé est absente/vide. */
const PLANT_ART = {
  schefflera: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M75 170 L80 145 L120 145 L125 170 Z' fill='%238B6914' opacity='0.8'/%3E%3Crect x='72' y='140' width='56' height='8' rx='3' fill='%23A0782C' opacity='0.8'/%3E%3Cpath d='M100 140 Q98 120 100 100 Q102 80 98 60' stroke='%232D5016' stroke-width='4' fill='none' stroke-linecap='round'/%3E%3Cpath d='M100 110 Q85 100 70 95' stroke='%232D5016' stroke-width='2.5' fill='none' stroke-linecap='round'/%3E%3Cpath d='M100 110 Q115 98 135 95' stroke='%232D5016' stroke-width='2.5' fill='none' stroke-linecap='round'/%3E%3Cpath d='M100 90 Q80 75 60 68' stroke='%232D5016' stroke-width='2.5' fill='none' stroke-linecap='round'/%3E%3Cpath d='M100 90 Q120 73 145 68' stroke='%232D5016' stroke-width='2.5' fill='none' stroke-linecap='round'/%3E%3Cpath d='M98 70 Q78 55 55 42' stroke='%232D5016' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3Cpath d='M98 70 Q118 52 140 42' stroke='%232D5016' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3Cellipse cx='58' cy='90' rx='18' ry='8' transform='rotate(-35 58 90)' fill='%23228B22'/%3E%3Cellipse cx='50' cy='95' rx='16' ry='7' transform='rotate(-55 50 95)' fill='%231E7A1E'/%3E%3Cellipse cx='65' cy='85' rx='15' ry='7' transform='rotate(-15 65 85)' fill='%2326A326'/%3E%3Cellipse cx='48' cy='88' rx='14' ry='6' transform='rotate(-70 48 88)' fill='%231B6B1B'/%3E%3Cellipse cx='62' cy='98' rx='13' ry='6' transform='rotate(-25 62 98)' fill='%232EBD2E'/%3E%3Cellipse cx='142' cy='90' rx='18' ry='8' transform='rotate(35 142 90)' fill='%23228B22'/%3E%3Cellipse cx='150' cy='95' rx='16' ry='7' transform='rotate(55 150 95)' fill='%231E7A1E'/%3E%3Cellipse cx='135' cy='85' rx='15' ry='7' transform='rotate(15 135 85)' fill='%2326A326'/%3E%3Cellipse cx='152' cy='88' rx='14' ry='6' transform='rotate(70 152 88)' fill='%231B6B1B'/%3E%3Cellipse cx='138' cy='98' rx='13' ry='6' transform='rotate(25 138 98)' fill='%232EBD2E'/%3E%3Cellipse cx='48' cy='63' rx='17' ry='7' transform='rotate(-40 48 63)' fill='%23228B22'/%3E%3Cellipse cx='40' cy='68' rx='15' ry='6' transform='rotate(-60 40 68)' fill='%231E7A1E'/%3E%3Cellipse cx='55' cy='58' rx='14' ry='6' transform='rotate(-20 55 58)' fill='%232EBD2E'/%3E%3Cellipse cx='38' cy='60' rx='13' ry='5' transform='rotate(-75 38 60)' fill='%231B6B1B'/%3E%3Cellipse cx='152' cy='63' rx='17' ry='7' transform='rotate(40 152 63)' fill='%23228B22'/%3E%3Cellipse cx='160' cy='68' rx='15' ry='6' transform='rotate(60 160 68)' fill='%231E7A1E'/%3E%3Cellipse cx='145' cy='58' rx='14' ry='6' transform='rotate(20 145 58)' fill='%232EBD2E'/%3E%3Cellipse cx='162' cy='60' rx='13' ry='5' transform='rotate(75 162 60)' fill='%231B6B1B'/%3E%3Cellipse cx='43' cy='37' rx='16' ry='7' transform='rotate(-45 43 37)' fill='%23228B22'/%3E%3Cellipse cx='36' cy='42' rx='14' ry='6' transform='rotate(-65 36 42)' fill='%231E7A1E'/%3E%3Cellipse cx='50' cy='32' rx='13' ry='5' transform='rotate(-25 50 32)' fill='%232EBD2E'/%3E%3Cellipse cx='147' cy='37' rx='16' ry='7' transform='rotate(45 147 37)' fill='%23228B22'/%3E%3Cellipse cx='154' cy='42' rx='14' ry='6' transform='rotate(65 154 42)' fill='%231E7A1E'/%3E%3Cellipse cx='140' cy='32' rx='13' ry='5' transform='rotate(25 140 32)' fill='%232EBD2E'/%3E%3Cellipse cx='90' cy='50' rx='15' ry='7' transform='rotate(-30 90 50)' fill='%2326A326'/%3E%3Cellipse cx='108' cy='50' rx='15' ry='7' transform='rotate(30 108 50)' fill='%2326A326'/%3E%3Cellipse cx='98' cy='45' rx='12' ry='6' transform='rotate(-5 98 45)' fill='%232EBD2E'/%3E%3C/svg%3E",
  dracaena: "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M75 185 L80 155 L120 155 L125 185 Z' fill='%238B6914' opacity='0.8'/%3E%3Crect x='72' y='150' width='56' height='8' rx='3' fill='%23A0782C' opacity='0.8'/%3E%3Cpath d='M100 150 Q97 130 95 110 Q93 90 96 70 Q98 50 100 35' stroke='%235C3A1E' stroke-width='5' fill='none' stroke-linecap='round'/%3E%3Cpath d='M97 100 Q88 85 82 65 Q80 55 82 45' stroke='%235C3A1E' stroke-width='3.5' fill='none' stroke-linecap='round'/%3E%3Cellipse cx='98' cy='120' rx='4' ry='1.5' fill='%234A2E16' opacity='0.5'/%3E%3Cellipse cx='96' cy='105' rx='3.5' ry='1.5' fill='%234A2E16' opacity='0.5'/%3E%3Cellipse cx='95' cy='88' rx='3' ry='1.2' fill='%234A2E16' opacity='0.4'/%3E%3Cpath d='M100 35 Q105 15 110 5' stroke='%231B8C1B' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3Cpath d='M100 35 Q95 12 88 3' stroke='%23228B22' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3Cpath d='M100 35 Q108 18 118 10' stroke='%2326A326' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3Cpath d='M100 35 Q90 15 80 8' stroke='%231E7A1E' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3Cpath d='M100 38 Q115 32 135 35 Q150 38 162 45' stroke='%23228B22' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3Cpath d='M100 36 Q118 28 140 28 Q155 30 168 38' stroke='%231E7A1E' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3Cpath d='M100 40 Q112 38 130 42 Q145 48 155 55' stroke='%232EBD2E' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3Cpath d='M100 37 Q120 25 148 22 Q160 24 172 32' stroke='%231B6B1B' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3Cpath d='M100 38 Q85 32 65 35 Q50 38 38 45' stroke='%23228B22' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3Cpath d='M100 36 Q82 28 60 28 Q45 30 32 38' stroke='%231E7A1E' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3Cpath d='M100 40 Q88 38 70 42 Q55 48 45 55' stroke='%232EBD2E' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3Cpath d='M100 37 Q80 25 52 22 Q40 24 28 32' stroke='%231B6B1B' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3Cpath d='M82 45 Q75 28 65 18' stroke='%23228B22' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3Cpath d='M82 45 Q88 30 92 18' stroke='%231E7A1E' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3Cpath d='M82 45 Q70 35 55 32 Q42 33 30 40' stroke='%2326A326' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3Cpath d='M82 45 Q68 38 50 38 Q38 40 25 48' stroke='%231B6B1B' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3Cpath d='M82 45 Q90 35 100 30 Q112 28 125 32' stroke='%232EBD2E' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3Cpath d='M82 47 Q72 42 58 45 Q48 50 40 58' stroke='%231E7A1E' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3Cpath d='M100 35 Q105 15 110 5' stroke='%238B1A1A' stroke-width='0.5' fill='none' opacity='0.3'/%3E%3Cpath d='M100 38 Q115 32 135 35 Q150 38 162 45' stroke='%238B1A1A' stroke-width='0.5' fill='none' opacity='0.3'/%3E%3Cpath d='M100 38 Q85 32 65 35 Q50 38 38 45' stroke='%238B1A1A' stroke-width='0.5' fill='none' opacity='0.3'/%3E%3C/svg%3E",
};
// Les capteurs de plante (humidité, conductivité, luminosité) n'ont pas de
// regroupement standard : sans configuration, il n'y a rien à montrer.
const plantsCfg = () => { const raw = cfgVal('loggia_plants', null); return (Array.isArray(raw) && raw.length) ? raw.filter(p => p && p.base) : []; };
/* Les entites a suivre : celles que `plantCapteur` retiendra, pas une liste de
 * suffixes ecrite d'avance. */
const plantKeys = () => {
  const S = (getHass() || {}).states || null;
  if (!S) return [];
  return plantsCfg().flatMap(p => [
    plantCapteur(S, p.base, 'moisture'),
    plantCapteur(S, p.base, 'conductivity', 'µS/cm'),
    plantCapteur(S, p.base, 'illuminance', 'lx'),
    plantCapteur(S, p.base, 'temperature'),
    plantCapteur(S, p.base, 'battery', '%'),
  ].filter(Boolean));
};
// Configurable (Paramètres → Entités) : {name, haid} → la photo vient de
// la personne Home Assistant correspondante.
// Personnes suivies : choix de l'utilisateur, sinon celles que Home Assistant
// déclare (domaine `person`), sinon la liste d'origine. Évalué à l'appel et non
// au chargement du module — la découverte répond plus tard.
// Source UNIQUE des personnes suivies. Deux clés les décrivaient — héritées de
// deux constantes qui divergeaient déjà — d'où quatre avatars pour trois
// personnes. Ici : le choix de l'utilisateur, sinon la découverte, et rien
// d'autre. Les entités disparues sont écartées.
function peopleList() {
  const S = (getHass() || {}).states || null;
  const raw = cfgVal('loggia_people', null);
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.people;
  const list = (Array.isArray(raw) && raw.length) ? raw.filter(p => p && p.haid && (!S || S[p.haid]))
    : (r && r.available && r.list.length) ? r.list
      : [];
  return list.map(p => ({
    name: p.name || p.haid.replace('person.', ''),
    haid: p.haid,
    // La photo du profil Home Assistant d'abord : c'est celle que l'utilisateur
    // a choisie, et elle n'a pas à être recopiée dans le dashboard.
    img: personPicture(S, p.haid) || null,
  }));
}
/* Une FONCTION, pas une table.
 *
 * Evaluee a l'import, cette liste figeait ses libelles dans la langue du
 * demarrage. C'est ce qui obligeait a recharger la page apres un changement de
 * langue. Appelee au rendu, elle se dit dans la langue du moment. */
const FIRST_USER = () => [{ name: 'Administrateur', role: 'Admin', sub: tr('Profil par défaut'), c: 'var(--o-accent)' }];
/**
 * Image d'un profil : l'avatar choisi dans Loggia d'abord, sinon la photo du
 * profil Home Assistant.
 *
 * Le rapprochement passe par le compte (`user_id` de l'entite `person`), et
 * seulement a defaut par le nom : c'est le meme principe que `matchHaUser`.
 */
/** Cle de rendu stable : les profils n'ont pas d'identifiant propre. */
const withUserKeys = (a) => a.map((u, i) => (u._k ? u : { ...u, _k: 'u' + i + '_' + Math.random().toString(36).slice(2, 6) }));
/** Empreinte de la liste, pour comparer sans se soucier des cles de rendu. */
const usersSig = (a) => JSON.stringify((a || []).map(u => [u.name, u.role, u.sub, u.c, u.grad, u.avatar, u.haId]));

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
/* Une FONCTION, pas une table.
 *
 * Evaluee a l'import, cette liste figeait ses libelles dans la langue du
 * demarrage. C'est ce qui obligeait a recharger la page apres un changement de
 * langue. Appelee au rendu, elle se dit dans la langue du moment. */
const VAC_STATE_FR = () => ({ docked: 'À la base', cleaning: tr('Nettoyage'), returning: tr('Retour base'), paused: tr('En pause'), idle: tr('En veille'), error: tr('Erreur') });
function airLabel(co2) { return co2 == null || co2 < 800 ? tr('BON') : co2 < 1200 ? tr('MOYEN') : tr('ÉLEVÉ'); }
function co2Style(co2) { return co2 < 600 ? { bc: 'var(--o-ok)', bbg: 'rgba(var(--o-ok-rgb),.14)' } : co2 < 900 ? { bc: 'var(--o-warn)', bbg: 'rgba(var(--o-warn-rgb),.14)' } : { bc: 'var(--o-warn2)', bbg: 'rgba(var(--o-warn2-rgb),.14)' }; }
// Dérive les données live de l'Accueil depuis hass + config. null si pas de hass (→ démo).
// `resolved` vient de la resolution (App) : cette fonction n'a pas de hooks,
// on lui passe donc ce qu'elle ne peut pas aller chercher elle-meme.
function deriveAccueil(hass, cfg, resolved) {
  if (!hass || !hass.states) return null;
  const S = hass.states;
  const num = (id, d = null) => { const s = id && S[id]; if (!s || s.state == null || s.state === 'unknown' || s.state === 'unavailable') return d; const n = parseFloat(s.state); return isNaN(n) ? d : n; };
  const fmtW = fmtWatts;
  const E = cfg.energy || {};
  // ⚠️ E.consoNow = flux NET du compteur : positif = import, négatif = export.
  //    Quand E.surplusNow n'existe pas, l'export vient de la partie négative du net.
  const solarW = num(E.solarOutput), netW = num(E.consoNow), surplusRaw = num(E.surplusNow);
  const exp = (surplusRaw != null && surplusRaw > 5) ? surplusRaw : (netW != null ? Math.max(0, -netW) : null);
  const exporting = exp != null && exp > 5;
  const importW = netW != null ? Math.max(0, netW) : null;
  const gridVal = exporting ? exp : importW;
  // Conso maison estimée = net + prod connue (sera exacte quand l'onduleur toit sera intégré)
  const consoW = (netW != null) ? Math.max(0, netW + (solarW || 0)) : null;
  const autoPct = (consoW != null && consoW > 0) ? Math.min(100, Math.round((solarW || 0) / consoW * 100)) : ((solarW || 0) > 0 ? 100 : 0);
  const rooms = (cfg.rooms || []).map(r => ({ name: r.room, area: r.area || null, icon: r.icon || null, lights: (r.haid && r.haid.lights) || [], temp: num(r.haid && r.haid.temp), hum: num(r.haid && r.haid.humidity), co2: num(r.haid && r.haid.co2), tempId: r.haid && r.haid.temp, humId: r.haid && r.haid.humidity, co2Id: r.haid && r.haid.co2 }));
  const indoor = rooms.filter(r => !estDehors(r.name));
  const avg = arr => { const x = arr.filter(v => v != null); return x.length ? x.reduce((s, v) => s + v, 0) / x.length : null; };
  const inTemp = avg(indoor.map(r => r.temp)), inHum = avg(indoor.map(r => r.hum));
  const co2vals = rooms.map(r => r.co2).filter(v => v != null);
  const maxCo2 = co2vals.length ? Math.max(...co2vals) : null;
  let lightIds = (cfg.lights || []).map(l => l.haid).filter(Boolean);
  if (!lightIds.length) lightIds = Object.keys(S).filter(e => e.indexOf('light.') === 0);
  const lightsOn = lightIds.filter(id => S[id] && S[id].state === 'on').length;
  const people = peopleList().map(p => ({ name: p.name, img: p.img, home: !!(S[p.haid] && S[p.haid].state === 'home') }));
  const cams = (cfg.cams || []).map(c => ({ name: c.name, haid: c.haid, online: (S[c.haid] ? S[c.haid].state !== 'unavailable' : c.online !== false) }));
  // États À-venir — aspirateur : état de l'entité `vacuum`, complété par les
  // capteurs configurés (texte déjà traduit, batterie).
  const rVac = (resolved && resolved.vacuum && resolved.vacuum.available) ? resolved.vacuum : null;
  const eVac = (cfg && cfg.entities && cfg.entities.vacuum) || {};
  const vacRaw = rVac ? rVac.state : null;
  const vacEtatS = eVac.etat ? S[eVac.etat] : null;
  const vacEtat = (vacEtatS && vacEtatS.state && vacEtatS.state !== 'unknown' && vacEtatS.state !== 'unavailable') ? vacEtatS.state : null;
  const vacCleaning = vacRaw ? vacRaw === 'cleaning' : !!(eVac.cleaning && S[eVac.cleaning] && S[eVac.cleaning].state === 'on');
  const vacOnBase = vacRaw ? vacRaw === 'docked' : !!(eVac.onBase && S[eVac.onBase] && S[eVac.onBase].state === 'on');
  const vacLabel = vacEtat || (vacRaw ? (VACUUM_STATE_FR[vacRaw] || vacRaw) : null);
  const vacBattery = (rVac && rVac.batteryLevel != null) ? rVac.batteryLevel : num(eVac.battery || (rVac && rVac.battery), null);
  const alarmId = (secAlarm() && S[secAlarm()]) ? secAlarm()
    : ((resolved && resolved.alarm && resolved.alarm.available) ? resolved.alarm.main : null);
  const alarmS = alarmId ? S[alarmId] : null;
  const alarmArmed = !!(alarmS && typeof alarmS.state === 'string' && alarmS.state.indexOf('armed') === 0);
  const camOnline = cams.filter(c => c.online).length, camTotal = cams.length;
  const ssA = S['sun.sun'] && S['sun.sun'].attributes ? S['sun.sun'].attributes.next_setting : null;
  let sunsetHM = null; if (ssA) { const d = new Date(ssA); if (!isNaN(d.getTime())) sunsetHM = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  // Prochain repas = automations du distributeur configuré, repas désactivés exclus.
  const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
  let nm = null, nd = Infinity;
  for (const m of croqMeals()) {
    const autoS = S[m.auto]; if (autoS && autoS.state !== 'on') continue; // repas désactivé (entité absente = on par défaut)
    const p = m.time.split(':'); let d = (+p[0] * 60 + +p[1]) - nowM; if (d < 0) d += 1440; if (d < nd) { nd = d; nm = m; }
  }
  const repasIn = nm ? `DANS ${Math.floor(nd / 60)}H${String(nd % 60).padStart(2, '0')}` : null;
  const repasLabel = nm ? `${nm.label} · ${nm.g}g` : null;
  // ── Machines À venir ──
  const machines = {};
  { const low = (vacEtat || '').toLowerCase(); const bat = vacBattery; // null si capteur indispo → « — », pas un faux 0 %
    const paused = /pause/.test(low);
    const returning = /retour/.test(low);
    const charging = (vacOnBase || /charge/.test(low)) && bat != null && bat < 100;
    let phase, color, anim = null, spin = false;
    if (vacCleaning && !paused) { phase = tr('Nettoyage'); color = '#60a5fa'; anim = 'wiggle'; spin = true; }
    else if (paused) { phase = tr('En pause'); color = '#fb923c'; }
    else if (returning) { phase = tr('Retour base'); color = 'var(--o-purple)'; }
    else if (/erreur|error/.test(low)) { phase = tr('Erreur'); color = '#ef4444'; }
    else if (vacOnBase || /station|base|accueil|charge/.test(low)) { if (bat != null && bat < 100) { phase = 'En charge'; color = '#fbbf24'; anim = 'charge'; } else { phase = tr('Sur base'); color = 'var(--o-ok)'; } }
    else { phase = vacEtat || tr('Inactif'); color = '#94a3b8'; }
    const batColor = bat == null ? 'var(--o-text3)' : bat < 20 ? '#ef4444' : bat < 50 ? '#fbbf24' : 'var(--o-ok)';
    machines.wallE = { label: (rVac && rVac.name) || tr('Aspirateur'), iconKey: 'vacuum', phase, color, active: (vacCleaning && !paused) || returning, anim, spin, valueIcon: charging ? 'battery-charging' : 'battery', valueText: bat != null ? Math.round(bat) + '%' : '—', bar: bat, barColor: batColor };
  }
  { const mid = mowerId(S); const lm = mid ? S[mid] : null; const st = lm ? lm.state : 'unknown';
    const bat = num(mowerSensor(S, 'battery'), null);
    const chgS = S[mowerSensor(S, 'charging')]; const chg = !!(chgS && ['on', 'true', 'True', 'Oui'].indexOf(chgS.state) >= 0);
    const prog = num(mowerSensor(S, 'progress'), 0) || 0;
    let phase, color, anim = null, spin = false;
    if (st === 'mowing') { phase = 'Tonte'; color = 'var(--o-ok)'; anim = 'wiggle'; spin = true; }
    else if (st === 'returning') { phase = tr('Retour base'); color = 'var(--o-purple)'; }
    else if (st === 'docked') { if (chg) { phase = 'En charge'; color = '#fbbf24'; anim = 'charge'; } else { phase = tr('Sur base'); color = 'var(--o-ok)'; } }
    else if (st === 'paused') { phase = tr('En pause'); color = '#fb923c'; }
    else if (st === 'error') { phase = tr('Erreur'); color = '#ef4444'; }
    else { phase = tr('Inactif'); color = '#94a3b8'; }
    const mowing = st === 'mowing'; const batColor = bat < 20 ? '#ef4444' : bat < 50 ? '#fbbf24' : 'var(--o-ok)';
    machines.luba = { label: 'Luba', iconKey: 'mower', phase, color, active: st === 'mowing' || st === 'returning', anim, spin, valueIcon: chg ? 'battery-charging' : 'battery', valueText: Math.round(bat) + '%', bar: mowing ? prog : bat, barColor: mowing ? color : batColor, extra: mowing ? ('Tonte ' + Math.round(prog) + '%') : null };
  }
  { const power = num(notifIds().dishwasher, 0) || 0; const active = power > 100;
    let phase, color, anim = null, spin = false;
    if (!active) { phase = tr('Éteint'); color = '#94a3b8'; }
    else if (power > 1500) { phase = tr('Lavage'); color = '#60a5fa'; spin = true; }
    else if (power > 500) { phase = tr('Rinçage'); color = 'var(--o-ok)'; spin = true; }
    else if (power > 200) { phase = tr('Séchage'); color = '#fbbf24'; anim = 'charge'; }
    else { phase = tr('En cours'); color = '#60a5fa'; spin = true; }
    const totalMin = 80; const idt = S[notifIds().dishwasherStart];
    const ts = (idt && idt.attributes && idt.attributes.timestamp) ? idt.attributes.timestamp : 0;
    const nowD = new Date(); const todayStart = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate()).getTime() / 1000;
    const elapsedMin = Math.max(0, Math.floor((nowD.getTime() / 1000 - (todayStart + ts)) / 60));
    const validProg = ts > 0 && elapsedMin <= totalMin * 2; // timestamp plausible (sinon barre/temps faux au changement de jour ou si entité absente)
    const remain = Math.max(0, totalMin - elapsedMin); const prog = Math.min(100, Math.round(elapsedMin / totalMin * 100));
    const fmtT = (mn) => { const h = Math.floor(mn / 60), mm = mn % 60; return (h > 0 ? h + 'h' : '') + (mm < 10 && h > 0 ? '0' : '') + mm + 'min'; };
    machines.lv = { label: tr('Lave-vaisselle'), iconKey: 'dishwasher', phase, color, active, anim, spin, valueIcon: 'timer', valueText: active ? (validProg ? fmtT(elapsedMin) : tr('En cours')) : '--:--', bar: (active && validProg) ? prog : null, barColor: color, extra: active ? (validProg ? ('~' + fmtT(remain) + ' · ' + Math.round(power) + 'W') : (Math.round(power) + 'W')) : null };
  }
  { const pbE = S[notifIds().bins];
    if (pbE) {
      const at = pbE.attributes || {}; const jours = parseInt(at.jours_restants) || 0;
      const today = at.est_aujourd_hui === true || at.est_aujourd_hui === 'True';
      const demain = at.est_demain === true || at.est_demain === 'True';
      let phase, color;
      if (today) { phase = "Aujourd'hui !"; color = '#ef4444'; }
      else if (demain) { phase = 'Demain soir'; color = '#fb923c'; }
      else if (jours <= 3) { phase = tr('Dans {j}j', { j: jours }); color = '#fbbf24'; }
      else { phase = tr('Dans {j}j', { j: jours }); color = 'var(--o-ok)'; }
      const dateDisp = at.decale_samedi ? ('Sam. ' + (at.date_formatee || '')) : (((at.jour_semaine || '') + ' ' + (at.date_formatee || '')).trim());
      const mainText = today ? tr('Sortir les poubelles !') : demain ? tr('Préparer ce soir') : (dateDisp || tr('Prochain ramassage'));
      machines.poubelles = { label: tr('Poubelles'), iconKey: today ? 'trash-full' : 'trash', phase, color, active: today || demain, anim: today ? 'shake' : (jours <= 3 ? 'bounce' : null), valueText: mainText, dotsFilled: Math.max(0, 14 - jours), dotsTotal: 14 };
    }
  }
  // Plantes (MiFlora) : null si capteur indispo → la ligne affiche « — »
  const plants = plantsCfg().map(p => ({
    name: p.name || p.base, img: p.img || null,
    hum: num(plantCapteur(S, p.base, 'moisture')), cond: num(plantCapteur(S, p.base, 'conductivity', 'µS/cm')),
    lux: num(plantCapteur(S, p.base, 'illuminance', 'lx')), temp: num(plantCapteur(S, p.base, 'temperature')),
    bat: num(plantCapteur(S, p.base, 'battery', '%')),
  }));
  return {
    flux: { solar: fmtW(solarW), home: fmtW(consoW), grid: (exporting ? '↑ ' : '↓ ') + fmtW(gridVal), exporting },
    autoPct,
    metricExport: { sign: exporting ? '↑ ' : '↓ ', val: fmtW(exporting ? exp : importW), raw: (exporting ? exp : importW) || 0, label: exporting ? tr('EXPORT RÉSEAU') : tr('IMPORT RÉSEAU'), color: exporting ? 'var(--o-ok)' : '#ffb347' },
    rooms, inTemp, inHum, maxCo2, lightsOn, lightsTotal: lightIds.length,
    people, cams, hass,
    vacLabel, vacBattery, alarmArmed, camOnline, camTotal, sunsetHM, repasIn, repasLabel, machines, plants,
  };
}

// Modal code admin (4 chiffres) — gate le basculement vers un profil Admin (comme V1, clé loggia_admin_pin, défaut 0000).
function PinModal({ expected, onClose, onSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const timers = useRef([]);
  const partiDuVoile = useRef(false);
  const boiteRef = useRef(null);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  // Focus dans la boite a l'ouverture, rendu a l'element d'origine ensuite —
  // sans quoi le clavier reste derriere la modale.
  useEffect(() => {
    const avant = document.activeElement;
    const t = setTimeout(() => { try { const el = boiteRef.current; if (el) (el.querySelector('button, [tabindex="0"]') || el).focus({ preventScroll: true }); } catch (e) {} }, 40);
    return () => { clearTimeout(t); try { if (avant && avant.focus) avant.focus({ preventScroll: true }); } catch (e) {} };
  }, []);
  const padBtn = { height: 52, borderRadius: 14, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 20, fontWeight: 600, cursor: 'pointer' };
  const add = (d) => {
    setError(false);
    setPin(p => {
      if (p.length >= 4) return p;
      const np = p + d;
      if (np.length === 4) timers.current.push(setTimeout(() => {
        if (np === String(expected || '0000')) onSuccess();
        else { setError(true); timers.current.push(setTimeout(() => { setPin(''); setError(false); }, 650)); }
      }, 110));
      return np;
    });
  };
  return (
    <div onPointerDown={(e) => { partiDuVoile.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && partiDuVoile.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.62)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div ref={boiteRef} role="dialog" aria-modal="true" aria-label="Code administrateur" tabIndex={-1}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
        onClick={e => e.stopPropagation()} style={{ width: 296, maxHeight: '92vh', overflowY: 'auto', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd1)', borderRadius: 'var(--o-radius,22px)', padding: 24, boxShadow: '0 30px 70px rgba(0,0,0,.6)', animation: error ? 'm-shake .45s' : 'none' }}>
        <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 700 }}>Code administrateur</div>
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--o-text2)', marginTop: 4 }}>{tr('Requis pour ce profil')}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 13, margin: '22px 0' }}>{[0, 1, 2, 3].map(i => <span key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < pin.length ? (error ? '#ef4444' : 'var(--o-accent-soft)') : 'transparent', border: `1px solid ${error ? '#ef4444' : 'var(--o-bd2)'}`, transition: 'background .15s' }} />)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <button key={n} onClick={() => add(String(n))} style={padBtn}>{n}</button>)}
          <span />
          <button onClick={() => add('0')} style={padBtn}>0</button>
          <button onClick={() => setPin(p => p.slice(0, -1))} style={{ ...padBtn, fontSize: 17 }}>⌫</button>
        </div>
      </div>
    </div>
  );
}

// Barre de navigation du bas — mobile uniquement (masquée en CSS au-dessus de 820px), activable/désactivable.
function MobileNav({ view, onNav, onMenu }) {
  const { views: avail } = useLoggia();
  // Le safe-area du bas est géré par le dashboard (card_mod padding-bottom) → l'iframe s'arrête au-dessus du home indicator.
  // Alignée sur la sidebar épurée — sans Pièces (accessibles via cartes Accueil), avec Énergie + Sécurité (demande user).
  const items = [
    { id: 'accueil', label: tr('Accueil'), icon: 'home' },
    { id: 'scenes', label: tr('Scènes'), icon: 'sparkles' },
    { id: 'objets', label: tr('Objets'), icon: 'apps' },
    { id: 'energie', label: tr('Énergie'), icon: 'bolt' },
    { id: 'securite', label: tr('Sécurité'), icon: 'shield-check' },
  ].filter(it => isViewAvailable(avail, it.id));
  const cell = (on) => ({ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '9px 4px 7px', background: 'none', border: 'none', cursor: 'pointer', color: on ? 'var(--o-accent-soft)' : 'var(--o-text2)', fontSize: 10.5, fontWeight: 700, WebkitTapHighlightColor: 'transparent' });
  return (
    <nav className="loggia-mobilenav" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, alignItems: 'stretch', background: 'var(--o-header)', borderTop: 'var(--o-bw,1px) solid var(--o-bd1)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', paddingBottom: 'calc(var(--o-safe-bottom, 0px) + 6px)', boxShadow: '0 -8px 24px rgba(0,0,0,.22)' }}>
      {items.map(it => { const on = view === it.id; return (
        <button key={it.id} onClick={() => onNav(it.id)} style={cell(on)}>
          {on && <span style={{ position: 'absolute', top: 0, width: 28, height: 3, borderRadius: '0 0 3px 3px', background: 'var(--o-accent)' }} />}
          <Fi i={it.icon} size={20} color={on ? 'var(--o-accent)' : 'var(--o-text2)'} />
          <span>{it.label}</span>
        </button>
      ); })}
      <button onClick={onMenu} style={cell(false)}>
        <Ico name="menu-burger" size={20} color="var(--o-text2)" />
        <span>Menu</span>
      </button>
    </nav>
  );
}

// Notifications dynamiques dérivées de l'état HA réel (avec temps relatif via last_changed).
function deriveNotifs(hass) {
  const S = hass && hass.states; if (!S) return [];
  const out = [], now = Date.now();
  const rel = (id) => { try { const e = S[id]; const t = e && (e.last_changed || e.last_updated); if (!t) return ''; const m = (now - new Date(t).getTime()) / 60000; if (m < 1) return tr("à l'instant"); if (m < 60) return tr('Il y a {n} min', { n: Math.round(m) }); if (m < 1440) return tr('Il y a {n} h', { n: Math.round(m / 60) }); return tr('Il y a {n} j', { n: Math.round(m / 1440) }); } catch (e) { return ''; } };
  const stOf = (id) => (S[id] && S[id].state) || null;
  const numOf = (id) => { const v = parseFloat(stOf(id)); return isNaN(v) ? null : v; };
  for (const id in S) { if (id.indexOf('alarm_control_panel.') === 0 && S[id].state === 'triggered') { out.push(['#f87171', tr('Alarme'), tr('Intrusion détectée'), rel(id)]); break; } }
  /* Alertes sûreté, sans aucune configuration : tout binary_sensor dont la
   * device_class désigne un danger passe en tête de liste dès qu'il est `on`.
   * La device_class est un standard HA, multilingue par nature — c'est elle
   * qui porte le sens, jamais le nom de l'entité. Une notification PAR
   * capteur : deux fuites = deux lignes, on ne résume pas un danger.
   *
   * Deux exclusions, constatées sur l'installation réelle avant d'écrire :
   * — `moisture` sur un binaire veut dire fuite d'eau, MAIS les plantes de la
   *   vue Plantes publient des binaires `<base>_besoin_eau` de cette classe :
   *   une dracaena assoiffée n'est pas un dégât des eaux. Tout binaire dont
   *   l'id commence par la base d'une plante configurée est écarté.
   * — `safety` sert aussi à MeteoAlarm, qui reste `on` des jours entiers en
   *   vigilance jaune. Ce n'est pas un danger domestique : il devient une
   *   notification de vigilance à part, ambre, portant l'événement réel
   *   (« Vigilance jaune orages ») — rouge seulement en Severe/Extreme. */
  const SURETE = {
    smoke: ['Fumée', 'Fumée détectée'],
    carbon_monoxide: ['Monoxyde de carbone', 'CO détecté'],
    gas: ['Gaz', 'Gaz détecté'],
    moisture: ["Fuite d'eau", 'Fuite détectée'],
    safety: ['Sécurité', 'Alerte de sécurité'],
    tamper: ['Sabotage', 'Boîtier ouvert ou déplacé'],
  };
  const basesPlantes = plantsCfg().map(p => p.base).filter(Boolean);
  const estPlante = (id) => basesPlantes.some(b => id.indexOf(b) === 0 && (id.length === b.length || id.charAt(b.length) === '_'));
  const surete = [];
  for (const id in S) {
    if (id.indexOf('binary_sensor.') !== 0) continue;
    const e = S[id]; if (!e || e.state !== 'on') continue;
    const a = e.attributes || {};
    const duo = SURETE[a.device_class];
    if (!duo) continue;
    const nom = a.friendly_name || id;
    if (a.device_class === 'safety' && (a.awareness_level != null || /meteoalarm/i.test(id) || /meteoalarm/i.test(a.attribution || ''))) {
      const grave = a.severity === 'Severe' || a.severity === 'Extreme';
      out.push([grave ? '#f87171' : '#ffb347', tr('Vigilance météo'), a.event || a.headline || tr('Alerte météo en cours'), rel(id)]);
      continue;
    }
    if (a.device_class === 'moisture' && estPlante(id)) continue;
    surete.push(['#f87171', tr(duo[0]), tr(duo[1]) + ' · ' + nom, rel(id)]);
  }
  out.unshift(...surete.slice(0, 4)); // les dangers d'abord, avant même l'alarme
  const mid = mowerId(S), mchg = mowerSensor(S, 'charging');
  const mow = mid ? stOf(mid) : null;
  if (mow === 'returning') out.push(['var(--o-accent-soft)', tr('Tondeuse'), tr('Retour à la base'), rel(mid)]);
  else if (mchg && stOf(mchg) === 'on') out.push(['var(--o-ok)', tr('Tondeuse'), tr('En charge'), rel(mchg)]);
  const surId = enHaids().surplusNow || enHaids().injectionJour;
  const sur = surId ? numOf(surId) : null;
  if (sur != null && sur > 100) out.push(['var(--o-accent-soft)', tr('Énergie'), tr('Surplus solaire — export réseau'), rel(surId)]);
  const lv = numOf(notifIds().dishwasher);
  if (lv != null && lv > 100) out.push(['var(--o-accent)', tr('Lave-vaisselle'), tr('Cycle en cours'), rel(notifIds().dishwasher)]);
  const bins = stOf(notifIds().bins);
  if (bins && bins !== 'unknown' && bins !== 'unavailable') out.push(['#ffb347', tr('Poubelles'), tr('Prochain ramassage : {d}', { d: bins }), rel(notifIds().bins)]);
  return out.slice(0, 8);
}

export default function App() {
  // ── Decouverte de l'installation (etape 1 du passage en dashboard generique) ──
  // Lit les registres HA et en deduit les capacites. AUCUNE vue ne s'en sert
  // encore : c'est le socle. Verification sur une install reelle, en console :
  //   loggiaDiscovery.report()
  const discovery = useDiscovery(getHass());
  // Configuration serveur (etape 2) : alimente le contexte des vues.
  const [serverCfg, setServerCfg] = useState({});
  // Le composant a-t-il repondu ? Distingue « pas de configuration » de
  // « configuration vide », que rien ne separait jusqu'ici.
  const [serverOk, setServerOk] = useState(false);
  // Les fonctions pures du fichier — et les vues chargees a la demande — lisent
  // cet etat : on le tient a jour ici, pendant le rendu, pour qu'il soit juste
  // des le meme tour.
  setLoggiaState({
    index: discovery.index || null,
    ent: (serverCfg && serverCfg.loggia_entities) || {},
    cfg: serverCfg || {},
    // Tant que le composant n'a pas repondu, le stockage local reste la seule
    // source. Des qu'il repond, c'est lui qui fait foi.
    server: serverOk,
  });
  // La langue se resout ICI, apres `setLoggiaState` : « suivre Home Assistant »
  // lit le compte HA, et le choix explicite vit dans la configuration qu'on vient
  // de poser. Resolue pendant le rendu, elle est juste des le meme tour pour tous
  // les `t()` en dessous.
  preparerLangue(getHass());
  // Les mots de Home Assistant arrivent apres coup quand la langue choisie n'est
  // pas celle du compte : ce compteur force un rendu de plus a leur arrivee.
  const [, setLangueVersion] = useState(0);
  useEffect(() => {
    const f = () => setLangueVersion(v => v + 1);
    window.addEventListener('loggia-langue-prete', f);
    // Choix explicite d'une langue : plus de rechargement, un redessin suffit.
    // `preparerLangue` sera rappele au rendu suivant et relira la configuration.
    window.addEventListener('loggia-langue-changee', f);
    return () => {
      window.removeEventListener('loggia-langue-prete', f);
      window.removeEventListener('loggia-langue-changee', f);
    };
  }, []);
  /* Resolution memoisee : le parcours des entites ne doit pas tourner a chaque
   * rendu. Mais il LIT `hass.states`, et n'en dependait pas : une entite
   * devenue `unavailable`, supprimee ou revenue laissait la resolution — donc
   * la disponibilite des vues — figee sur l'etat du premier rendu.
   *
   * La signature ne retient que ce qui compte ici : quelles entites existent et
   * lesquelles repondent. Elle ignore les valeurs, qui changent sans arret et
   * relanceraient le calcul pour rien.
   *
   * `getHass()` et non `hass` : la variable locale n'est declaree que 270 lignes
   * plus bas, parce que les cles a surveiller dependent justement du runtime
   * calcule ici. La lire d'en haut tombait dans sa zone morte et le dashboard
   * ne s'affichait plus du tout.
   *
   * Deux comptes suffisent : combien d'entites existent, combien repondent. Un
   * echange exact dans la meme synchronisation — une entite part, une autre
   * arrive — passerait inapercu jusqu'au changement suivant ; trier ou hacher
   * les cles a chaque rendu couterait plus cher que ce cas ne le merite. */
  const sigEntites = (() => {
    const S = (getHass() || {}).states;
    if (!S) return '';
    const cles = Object.keys(S);
    let vivantes = 0;
    for (let i = 0; i < cles.length; i++) {
      const e = S[cles[i]];
      if (e && e.state !== 'unavailable' && e.state !== 'unknown') vivantes++;
    }
    return cles.length + ':' + vivantes;
  })();
  const loggiaRuntime = useMemo(
    () => buildRuntime({ discovery, userCfg: serverCfg, states: (getHass() || {}).states || {} }),
    [discovery.ready, discovery.caps, serverCfg, sigEntites]
  );
  setLoggiaState({ resolved: loggiaRuntime.resolved || null });
  // Ecriture d'un reglage : serveur si le composant repond, localStorage sinon.
  // L'etat local est mis a jour tout de suite, sans attendre l'aller-retour.
  const saveCfg = useCallback((patch) => {
    setServerCfg(c => {
      const n = { ...c };
      Object.keys(patch).forEach(k => { if (patch[k] == null) delete n[k]; else n[k] = patch[k]; });
      return n;
    });
    const local = () => {
      try {
        Object.keys(patch).forEach(k => {
          if (patch[k] == null) localStorage.removeItem(k);
          else localStorage.setItem(k, JSON.stringify(patch[k]));
        });
      } catch (e) {}
    };
    const h = getHass();
    if (h && h.callWS) h.callWS({ type: 'loggia/config/set', config: patch }).catch(local);
    else local();
  }, []);
  // Confié APRÈS sa déclaration : plus haut, `saveCfg` serait encore en zone
  // morte temporelle et le rendu entier échouerait.
  setLoggiaState({ save: saveCfg });
  useEffect(() => {
    try {
      window.loggiaDiscovery = {
        version: DISCOVERY_VERSION,
        get ready() { return discovery.ready; },
        get caps() { return discovery.caps; },
        get index() { return discovery.index; },
        get devices() { return discovery.devices; },
        get abilities() { return discovery.abilities; },
        get knowledge() { return discovery.knowledge; },
        // Les pieces telles que la configuration et les zones les donnent :
        // sans elles, impossible de voir ou l'appariement piece/zone echoue.
        get rooms() { try { return cfgRef.current; } catch (e) { return null; } },
        get health() { return discovery.health; },
        healthText: () => { const t = healthText(discovery.health); console.log(t); return t; },
        get errors() { return discovery.errors; },
        refresh: discovery.refresh,
        report: () => { const t = discoveryReport(discovery); console.log(t); return t; },
        // Le contexte que le moteur d'actions attend, prêt à l'emploi.
        get ctx() {
          const h = getHass();
          return { states: (h && h.states) || {}, services: discovery.index && discovery.index.services };
        },
        // fonctions pures : utilisables sur des installations fictives
        buildIndex: discoveryBuildIndex,
        capabilities: discoveryCapabilities,
        planAction: actionsPlan,
        availableActions: actionsAvailable,
        profileOf,
        profileTable,
        deviceCard,
        healthReport,
        presentableDevices,
        presentationSummary,
      };
    } catch (e) {}
  }, [discovery.ready, discovery.caps]);

  // ── Configuration par utilisateur (etape 2) ──
  // Sonde le composant `loggia` et expose de quoi verifier / migrer a la main.
  // Rien n'est consomme par les vues : les reglages continuent de passer par le
  // localStorage tant que l'etape 3 n'a pas bascule les appels.
  useEffect(() => {
    let alive = true;
    let minuteur = null;
    // Combien de fois insister avant d'abandonner, et a quel rythme. Une seule
    // tentative ne suffit pas : dans l'application mobile, l'iframe demarre
    // pendant que Home Assistant construit encore son arbre, et `getHass()`
    // rend alors null. Sans nouvelle tentative, la configuration du serveur
    // n'arrivait JAMAIS sur ces appareils — le dashboard retombait sur le
    // stockage local et la decouverte brute, d'ou des cameras, des lecteurs et
    // des profils differents de ceux du PC.
    const ATTENTES = [200, 400, 800, 1500, 2500, 4000, 6000];
    let essai = 0;

    const reessayer = () => {
      if (essai >= ATTENTES.length) return;
      minuteur = setTimeout(sonder, ATTENTES[essai++]);
    };

    const sonder = () => {
      if (!alive) return;
      const h = getHass();
      if (!h) { reessayer(); return; }
      configProbe(h).then(state => {
        if (!alive) return;
        // Le composant peut n'etre pas encore pret alors que `hass` l'est : on
        // retente aussi dans ce cas, sinon un demarrage de Home Assistant
        // laisserait l'appareil en mode local jusqu'au rechargement suivant.
        if (!state.available) { reessayer(); return; }
        appliquer(h, state);
      });
    };

    const appliquer = (h, state) => {
      setServerOk(!!state.available);
      setServerCfg(state.available ? (state.config || {}) : {});
      // Un reglage fait avant l'arrivee du composant n'existe que dans ce
      // navigateur. On le confie au serveur pour que les autres appareils le
      // voient — depuis un compte administrateur seulement, car lui seul ecrit
      // dans la partie commune. Rien n'est ecrase : le serveur garde toujours
      // sa version quand il en a une.
      if (state.available && state.user && state.user.is_admin) {
        completerDepuisLocal(h, state.config || {}, estPersonnelle)
          .then(r => {
            if (!alive || !r.cles.length) return;
            console.info('Loggia : %d reglage(s) locaux confies au serveur', r.cles.length, r.cles);
            return configProbe(h).then(frais => { if (alive && frais.available) setServerCfg(frais.config || {}); });
          })
          .catch(() => { /* le serveur refuse : on reste sur ce qu'on a */ });
      }
      try {
        window.loggiaConfig = {
          version: CONFIG_VERSION,
          state,
          local: collectLocal,
          access: createConfig({ hass: h, serverConfig: state.available ? state.config : null, user: state.user }),
          report: () => configReportLive(h).then(t => { console.log(t); return t; }),
        // Rejoue l'ecran de premier lancement (verification, demonstration).
        resetOnboarding: async () => {
          try { localStorage.removeItem('loggia_onboarded'); } catch (e) {}
          await h.callWS({ type: 'loggia/config/set', config: { loggia_onboarded: null } });
          console.log('Premier lancement rearme — rechargez la page.');
        },
        // Adoption : recopie les constantes en dur dans la configuration
        // utilisateur (cle loggia_entities), pour pouvoir les retirer du code.
        // Resolution : ce que la decouverte deduit de l'installation.
        resolve: async () => {
          const st = await configProbe(h);
          const d = window.loggiaDiscovery;
          const ctx = { index: d && d.index, caps: d && d.caps, states: (h && h.states) || {}, userCfg: st.config || {} };
          const r = resolveAll(ctx);
          console.log(resolveReport(r));
          return r;
        },
          migrate: (dryRun = true, overwrite = false) =>
            migrateFromLocalStorage(h, { dryRun, overwrite }).then(r => { console.log(r); return r; }),
        };
      } catch (e) {}
    };

    sonder();
    return () => { alive = false; if (minuteur) clearTimeout(minuteur); };
  }, []);

  const [themeMode, setThemeMode] = useState('dark'); // base Loggia : clair/foncé
  const [loggiaTheme, setLoggiaTheme] = useState('');     // '' = défaut Loggia ; sinon preset natif (neumorphix/google/ios)
  const [haTheme, setHaTheme] = useState('');           // '' = base Loggia ; 'FOLLOW' = suit HA ; sinon nom de thème HA
  const [lightMode, setLightMode] = useState(false);
  /* La vue courante survit au rechargement.
   *
   * Plusieurs reglages doivent recharger la page pour prendre effet — la langue,
   * les entites, la connexion. On repartait alors de l'accueil, et il fallait
   * retrouver son chemin a chaque changement. La vue est donc notee, puis
   * relue au demarrage.
   *
   * `sessionStorage` et non `localStorage` : l'endroit ou l'on se trouve
   * appartient a cet onglet et a ce moment. Un onglet neuf, ou Loggia rouvert
   * le lendemain, doit s'ouvrir sur l'accueil — pas sur la vue Croquettes
   * quittee l'avant-veille. */
  /* La vue memorisee est reprise DES LE PREMIER RENDU.
   *
   * Elle l'etait auparavant une fois les donnees arrivees, ce qui faisait
   * apparaitre l'accueil une seconde avant de basculer : un detour visible, et
   * genant quand on venait justement de regler quelque chose ailleurs.
   *
   * Ce detour existait pour une raison : Lumieres, Climat, Ouverture et Medias
   * lisent leur configuration sans verifier qu'elle existe, et se brisent si on
   * les monte avant la decouverte. La garde est donc descendue d'un cran — plus
   * bas, le rendu attend que les donnees soient la avant de monter la vue, et
   * montre en attendant une surface vide plutot que l'accueil. */
  const [view, setView] = useState(() => {
    try { return window.sessionStorage.getItem('loggia-vue') || 'accueil'; } catch (e) { return 'accueil'; }
  });
  useEffect(() => {
    try { window.sessionStorage.setItem('loggia-vue', view); } catch (e) { /* stockage indisponible */ }
  }, [view]);
  /* Et la position dans la page.
   *
   * On la note en continu plutot qu'au moment de recharger : `location.reload()`
   * est appele depuis une dizaine d'endroits, et il aurait fallu penser a chacun
   * — y compris ceux a venir. `pagehide` ne suffit pas non plus, iOS ne le
   * declenche pas toujours.
   *
   * La restauration attend deux images : la premiere pose la vue, la seconde la
   * remplit. Sauter a la position avant que le contenu existe ne menerait nulle
   * part. */
  useEffect(() => {
    const cle = 'loggia-defilement';
    let t = 0;
    const noter = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        try { window.sessionStorage.setItem(cle, String(document.documentElement.scrollTop || 0)); } catch (e) {}
      }, 150);
    };
    window.addEventListener('scroll', noter, { passive: true });
    const y = (() => { try { return +window.sessionStorage.getItem(cle) || 0; } catch (e) { return 0; } })();
    if (y > 0) requestAnimationFrame(() => requestAnimationFrame(() => {
      try { window.scrollTo({ top: y, behavior: 'auto' }); } catch (e) {}
    }));
    return () => { clearTimeout(t); window.removeEventListener('scroll', noter); };
  }, []);
  // Vues personnalisées (créées dans Paramètres → Vues, admin) — live, persistées.
  const [customViews, setCustomViews] = useState(() => {
    // Filet de l'écran d'erreur : « Repartir sans les vues custom » pose ce
    // drapeau puis recharge. Il est CONSOMMÉ ici — il ne protège que ce
    // chargement-ci, et la configuration n'est pas touchée : si la vue fautive
    // replante au retour, l'écran d'erreur revient et on peut recommencer.
    try { if (sessionStorage.getItem('loggia_safe_nocv')) { sessionStorage.removeItem('loggia_safe_nocv'); return []; } } catch (e) {}
    const v = readLS('loggia_customviews', []); return Array.isArray(v) ? v.filter(x => x && x.id && x.name) : [];
  });
  const saveCustomViews = (list) => { try { localStorage.setItem('loggia_customviews', JSON.stringify(list)); } catch (e) {} setCustomViews(list); };
  const [editMode, setEditMode] = useState(false);
  // L'édition est réservée aux admins : si le profil actif n'est plus admin, on coupe le mode édition.
  // (le bouton crayon du Header est déjà admin-only ; ceci couvre le switch de profil pendant l'édition)
  // Recalculé quand la configuration serveur ou la découverte change. Figer
  // cette table au premier rendu la remplirait avec ce qui est disponible à cet
  // instant — c'est-à-dire presque rien : les pièces perdraient leurs capteurs.
  const cfg = useMemo(() => {
    const e = cfgVal('loggia_energyHaids', null);
    const cm = cfgVal('loggia_cameras', null);
    return {
      energy: { ...enHaids(), ...(e && typeof e === 'object' ? e : {}) },
      // Chaque piece recoit l'icone de la zone Home Assistant qui porte le
      // meme nom. C'est ce qui rend le nom LIBRE : renommer une piece ne
      // change plus son icone, puisque celle-ci vient de Home Assistant.
      rooms: (() => {
        const zones = (loggiaRuntime.index && loggiaRuntime.index.areaList) || [];
        const parNom = new Map(zones.map(z => [rmNorm(z.name), z]));
        const ix = loggiaRuntime.index;
        return normRooms(cfgVal('loggia_rooms', null)).map(r => {
          // Le nom d'abord, puis la zone du capteur que la piece utilise deja.
          // Une piece peut porter un autre nom que sa zone — c'est le droit de
          // l'utilisateur — et ses capteurs, eux, la designent sans ambiguite.
          let z = parNom.get(rmNorm(r.name || r.room));
          if (!z && ix && ix.areaOf && r.haid) {
            const parCapteur = [r.haid.temp, r.haid.humidity, r.haid.co2]
              .filter(Boolean).map(ix.areaOf).find(Boolean);
            if (parCapteur) z = zones.find(x => x.id === parCapteur);
          }
          return z ? { ...r, icon: z.icon || null, area: z.id } : r;
        });
      })(),
      lights: cfgVal('loggia_lights', []) || [],
      cams: (Array.isArray(cm) && cm.length) ? cm : [],
      entities: (serverCfg && serverCfg.loggia_entities) || {},
    };
  }, [serverCfg, loggiaRuntime.ready]);
  const cfgRef = useRef(null); cfgRef.current = cfg.rooms;
  // Clés de poll issues de la configuration utilisateur : chez un tiers les
  // constantes du code ne correspondent a rien, seuls comptent le prefixe de
  // domaine et les entites que la decouverte a resolues.
  const cfgKeys = (domain) => {
    const e = serverCfg && serverCfg.loggia_entities && serverCfg.loggia_entities[domain];
    return e ? (JSON.stringify(e).match(/[a-z_]+\.[a-z0-9_]+/g) || []) : [];
  };
  const rv = (loggiaRuntime.resolved && loggiaRuntime.resolved.vacuum) || null;
  // Les entites reconnues d'apres le nom du robot (usure, mode, debit d'eau,
  // derniere tache) doivent etre interrogees, sinon la vue les affiche figees.
  // `getHass()` plutot que `hass` : celui-ci se construit A PARTIR de ces cles.
  const vacMain = (rv && rv.main) || cfgKeys('vacuum').find(k => k.indexOf('vacuum.') === 0) || null;
  const vacKeys = ['vacuum.', ...VAC_KEYS, ...cfgKeys('vacuum'), ...cfgKeys('vacuumRooms'),
    ...Object.values(vacSensors(getHass(), vacMain)),
    ...(rv ? [rv.battery, rv.area_cleaned, rv.duration, rv.status] : [])].filter(Boolean);
  const rc = (loggiaRuntime.resolved && loggiaRuntime.resolved.cameras) || null;
  const secKeys = ((rc && rc.list) || []).flatMap(c => [c.id, c.motion, c.person, c.vehicle, c.sonnette, c.colis]).filter(Boolean);
  // Poll par vue : GLOBAL (météo/sun/présence + sources des notifications, visibles partout)
  // + les clés de la vue affichée seulement → évite un re-render de toute l'app à chaque tick
  // dès qu'un capteur d'une AUTRE vue bouge. L'Accueil (deriveAccueil) reste le plus large.
  const GLOBAL_KEYS = ['weather.', 'sun.sun', ...peopleList().map(p => p.haid),
    secAlarm(), 'alarm_control_panel.', 'person.',
    ...cfgKeys('alarm'), ...cfgKeys('cameras'), ...cfgKeys('people'),
    'lawn_mower.', notifIds().dishwasher, notifIds().bins, cfg.energy.surplusNow].filter(Boolean);
  const lightKeys = [...Object.values(hueScripts()), ...dimmableLights(getHass()), ...switchLights(), 'switch.', ...cfgKeys('hue'), ...(cfg.lights || []).map(l => l.haid)].filter(Boolean);
  const accueilKeys = [...enKeys(), ...vacKeys, ...croqKeys(), ...plantKeys(), 'light.', ...switchLights(),
    ...mowerKeys(), notifIds().dishwasherStart,
    cfg.energy.consoNow, cfg.energy.solarOutput,
    ...(cfg.rooms || []).flatMap(r => [r.haid && r.haid.temp, r.haid && r.haid.humidity, r.haid && r.haid.co2]),
    ...lightKeys, ...(cfg.cams || []).map(c => c.haid)];
  const VIEW_HAKEYS = {
    accueil: accueilKeys, lumieres: lightKeys, scenes: lightKeys,
    climat: [...climateKeys(), 'climate.', ...cfgKeys('climate')],
    volets: [...voletKeys(), 'cover.', ...cfgKeys('covers')],
    energie: [...enKeys(), cfg.energy.consoNow, cfg.energy.solarOutput],
    aspirateur: vacKeys, croquettes: croqKeys(), medias: medKeys(),
    objets: [...vacKeys, 'lawn_mower.', ...mowerKeys(), ...croqKeys(), ...medKeys(), ...plantKeys()],
    securite: [...secBaseKeys(), 'camera.', ...secKeys, ...(cfg.cams || []).map(c => c.haid)],
    systeme: [...sysKeys(), ...cfgKeys('system')],
    parametres: ['automation.', 'update.'], // clés-préfixes : automations + mises à jour (onglets admin)
  };
  const activeCv = view.indexOf('cv:') === 0 ? customViews.find(c => 'cv:' + c.id === view) : null;
  // Nav « Pièces » = ouvre la 1re pièce configurée (les chips de RoomView naviguent ensuite entre pièces)
  const activeRoom = view.indexOf('room:') === 0 ? view.slice(5) : view === 'pieces' ? ((cfg.rooms || []).map(r => r.room).filter(r => !estDehors(r))[0] || null) : null;
  // Vue pièce : on poll le domaine des appareils pilotables + les capteurs de la pièce (clés-préfixes).
  const roomKeys = activeRoom ? ['light.', 'switch.', 'cover.', 'climate.', 'media_player.', 'fan.', 'lock.', ...climateKeys(), ...(cfg.rooms || []).flatMap(r => [r.haid && r.haid.temp, r.haid && r.haid.humidity, r.haid && r.haid.co2])] : [];
  // Les cartes d'une vue custom suivent leur entity_id — y compris les cartes
  // TYPÉES ({ t, id }), sans quoi une jauge ou un gros interrupteur ne se
  // redessinait jamais. Seuls les templates restent dehors : leur souscription
  // `render_template` pousse toute seule.
  // Les épingles vivent sur les cartes de n'importe quelle vue : sans les
  // interroger, une valeur épinglée resterait figée jusqu'à un tick fortuit.
  const haKeys = [...GLOBAL_KEYS, ...lireEpingles(), ...(activeCv ? activeCv.ents.map(x => cvId(x)) : activeRoom ? roomKeys : (VIEW_HAKEYS[view] || [])), ...(view === 'accueil' ? qsKeys() : [])].filter(Boolean);
  // Capteurs de puissance au jitter continu : signature arrondie à 10 W → pas de re-render global à chaque tick.
  // Un capteur de puissance jitter en continu chez N'IMPORTE QUI : c'est sa
  // `device_class` qui le dit, pas son nom. Cette liste portait un identifiant
  // d'entite ecrit en dur, qui n'existait que sur une seule installation.
  const noisyDiscovered = (() => {
    const st = (getHass() || {}).states || {};
    return ((discovery.caps && discovery.caps.energySensors) || [])
      .filter(id => st[id] && st[id].attributes && st[id].attributes.device_class === 'power');
  })();
  const noisyKeys = [cfg.energy.consoNow, cfg.energy.surplusNow, cfg.energy.solarOutput,
    ...noisyDiscovered,
    ...(() => { const E = enHaids(); return [E.consoMaison, E.gridNow, E.solarNow, E.injectionNow, E.appTotal]; })(),
    ...enDevices(null).map(d => d.power)].filter(Boolean);
  const hass = useHass(haKeys, noisyKeys);
  // Vue courante devenue impossible a remplir (appareil retire, configuration
  // importee d'une autre installation, lien direct) : on explique au lieu
  // d'afficher des tirets. Vues personnalisees et pieces ne passent pas par la.
  const viewBlocked = (activeCv || activeRoom) ? null : viewReason(loggiaRuntime.views, view);
  // Perte de connexion : affichée seulement après avoir été connecté au moins une fois (pas de faux positif au boot/preview)
  const wasConnectedRef = useRef(false);
  const nowOk = !!(hass && hass.states && (hass.connected === undefined || hass.connected));
  if (nowOk) wasConnectedRef.current = true;
  const haLost = wasConnectedRef.current && !nowOk;
  /* Échec de commande → écoute globale + toast.
   *
   * Deux sources aboutissent ici. Les appels directs à `callService`, dont la
   * promesse rejetée n'est reprise nulle part. Et le moteur d'actions, qui lui
   * attrape le rejet pour en donner la raison : `commander()` le relance donc à
   * vide, sinon la moitié des commandes du dashboard échouerait sans un mot. */
  const [toast, setToast] = useState(null);
  const toastTRef = useRef(0);
  useEffect(() => {
    const h = (ev) => {
      const r = ev && ev.reason;
      const msg = r ? String((r.message || r.error || r.code || r)) : '';
      if (!/service|entity|not_found|unauthorized|timeout|connection/i.test(msg) && !(r && r.code)) return;
      ev.preventDefault();
      setToast('Commande non exécutée — Home Assistant a refusé ou n’a pas répondu');
      clearTimeout(toastTRef.current); toastTRef.current = setTimeout(() => setToast(null), 4000);
    };
    window.addEventListener('unhandledrejection', h);
    let topW = null; try { if (window.top && window.top !== window) { topW = window.top; topW.addEventListener('unhandledrejection', h); } } catch (e) {}
    return () => { window.removeEventListener('unhandledrejection', h); try { if (topW) topW.removeEventListener('unhandledrejection', h); } catch (e) {} clearTimeout(toastTRef.current); };
  }, []);
  const wEnt = (hass && hass.states) ? hass.states[weatherEntity(hass)] : null;
  const isNight = (hass && hass.states && hass.states['sun.sun'] && hass.states['sun.sun'].state === 'below_horizon') || (wEnt && wEnt.state === 'clear-night');
  const weatherMode = wEnt ? haWeatherMode(wEnt.state, isNight) : null;
  const weatherRaw = wEnt ? String(wEnt.state) : null; // état HA brut pour le fond GLSL (presets = états HA)
  const weatherTemp = wEnt && wEnt.attributes ? wEnt.attributes.temperature : null;
  const weatherLabel = wEnt ? haWeatherLabel(wEnt.state) : null;
  let accueil = null; // Dashboard + vue Pièce (capteurs de la pièce) — pas calculé ailleurs
  if (view === 'accueil' || activeRoom) { try { accueil = deriveAccueil(hass, cfg, loggiaRuntime.resolved); if (accueil) accueil.index = loggiaRuntime.index; } catch (e) { console.error('deriveAccueil', e); accueil = null; } }
  let notifs; try { notifs = deriveNotifs(hass); } catch (e) { console.error('deriveNotifs', e); notifs = []; }
  useEffect(() => {
    try {
      const m = localStorage.getItem('loggia-mode'); if (m === 'light' || m === 'dark') setThemeMode(m);
      // Safe mode « sans thème » : preset et suivi HA restent aux défauts pour ce chargement.
      if (!SAFE_NOLOOK) {
        const t = localStorage.getItem('loggia-theme'); if (t != null) setLoggiaTheme(t);
        const h = localStorage.getItem('loggia-ha'); if (h != null) setHaTheme(h);
      }
    } catch (e) {}
  }, []);
  const [look, setLook] = useState(readLook);
  const onLook = (patch) => setLook(l => { const n = { ...l, ...patch }; try { localStorage.setItem('loggia_look', JSON.stringify(n)); } catch (e) {} return n; });
  useEffect(() => {
    const run = () => setLightMode(!applyTheme({ mode: themeMode, loggiaTheme, haTheme, look }, getHass()));
    run();
    // En safe mode, ne RIEN réécrire : les défauts affichés écraseraient le thème enregistré.
    if (!SAFE_NOLOOK) { try { localStorage.setItem('loggia-mode', themeMode); localStorage.setItem('loggia-theme', loggiaTheme); localStorage.setItem('loggia-ha', haTheme); } catch (e) {} }
    // Suivre HA : hass.themes peut charger après coup / l'actif peut changer → on réapplique en boucle
    if (haTheme === 'FOLLOW') { const iv = setInterval(run, 1500); return () => clearInterval(iv); }
  }, [themeMode, loggiaTheme, haTheme, look]);
  // Bascule Nabu Casa automatique. Garde-fous, tous obligatoires :
  //   1. l'interrupteur est armé et une URL distante est renseignée ;
  //   2. on tourne DANS l'iframe Home Assistant (hors HA, hass est nul par construction —
  //      sans ce test, ouvrir le fichier en direct redirigerait vers Nabu Casa) ;
  //   3. l'origine courante n'est pas déjà l'URL distante ;
  //   4. hass est toujours absent après 2 s ;
  //   5. une seule bascule par session (sessionStorage), pour ne jamais boucler.
  useEffect(() => {
    let cfg = null;
    try { cfg = JSON.parse(localStorage.getItem('loggia_haCfg') || 'null'); } catch (e) { return undefined; }
    if (!cfg || !cfg.fallback || !cfg.remote) return undefined;
    if (window.top === window) return undefined;
    let origin; try { origin = (window.top && window.top.location.origin) || window.location.origin; } catch (e) { origin = window.location.origin; }
    if (origin === cfg.remote.replace(/\/+$/, '') || /nabu\.casa/.test(origin)) return undefined;
    try { if (sessionStorage.getItem('loggia-fellback') === '1') return undefined; } catch (e) { return undefined; }
    const t = setTimeout(() => {
      if (getHass()) return; // Home Assistant a repondu : rien a faire
      try { sessionStorage.setItem('loggia-fellback', '1'); } catch (e) {}
      try { (window.top || window).location.href = cfg.remote; } catch (e) { window.location.href = cfg.remote; }
    }, 2000);
    return () => clearTimeout(t);
  }, []);
  const onMode = (m) => { setThemeMode(m); setHaTheme(''); };
  const onPickTheme = (id) => { setLoggiaTheme(id); setHaTheme(''); };
  const onFollowHa = () => setHaTheme(h => h === 'FOLLOW' ? '' : 'FOLLOW');
  const toggle = () => { setHaTheme(''); setThemeMode(m => m === 'light' ? 'dark' : 'light'); }; // bouton flottant = bascule clair/foncé Loggia
  const [navOpen, setNavOpen] = useState(() => { try { return (typeof window !== 'undefined' ? window.innerWidth : 1000) > 820; } catch (e) { return true; } });
  /* Le menu mobile se fermait au clic sur le voile, mais rien au clavier :
   * qui l'ouvre sans souris y restait enferme. Trois autres panneaux geraient
   * deja Echap, celui-ci avait ete oublie. */
  useEffect(() => {
    if (!navOpen) return undefined;
    const surTouche = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setNavOpen(false); } };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [navOpen]);
  const [navbar, setNavbar] = useState(() => { try { return localStorage.getItem('loggia-navbar') !== '0'; } catch (e) { return true; } }); // barre du bas mobile (défaut activée)
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
  // Aperçu de la fiche appareil universelle : ?fiche=<entity_id> — lu aussi sur
  // l'URL du PANNEAU (le parent de l'iframe), la page directe n'ayant pas de
  // session. Outil d'essai : la fiche s'ouvrira depuis les cartes ensuite.
  const [ficheDemo, setFicheDemo] = useState(() => {
    try {
      const ici = new URLSearchParams(window.location.search).get('fiche');
      if (ici) return ici;
      if (window.top !== window) return new URLSearchParams(window.top.location.search).get('fiche') || null;
    } catch (e) { /* cross-origin improbable : même hôte */ }
    return null;
  });
  const [ambient, setAmbient] = useState(() => { try { return parseInt(localStorage.getItem('loggia-ambient') || '0', 10) || 0; } catch (e) { return 0; } });
  const onAmbient = (min) => { setAmbient(min); try { localStorage.setItem('loggia-ambient', String(min)); } catch (e) {} };
  // Plage de la veille : « toujours », « nuit » (21 h – 8 h) ou « jour » — trois
  // choix nets plutôt que deux champs d'heure. Par appareil, comme le délai.
  const [ambPlage, setAmbPlage] = useState(() => { try { return localStorage.getItem('loggia-ambientplage') || 'toujours'; } catch (e) { return 'toujours'; } });
  const onAmbPlage = (v) => { setAmbPlage(v); try { localStorage.setItem('loggia-ambientplage', v); } catch (e) {} };
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
  // Fonds animés de l'Accueil : effets météo (défaut activés) et ciel étoilé en remplacement de « nuit claire » (défaut activé)
  const [wxFx, setWxFx] = useState(() => { try { return localStorage.getItem('loggia-wxfx') !== '0'; } catch (e) { return true; } });
  const onToggleWxFx = () => setWxFx(v => { const nv = !v; try { localStorage.setItem('loggia-wxfx', nv ? '1' : '0'); } catch (e) {} return nv; });
  const onToggleNavbar = () => setNavbar(v => { const nv = !v; try { localStorage.setItem('loggia-navbar', nv ? '1' : '0'); } catch (e) {} return nv; });
  // Safe-area iPhone : env() = 0 dans l'iframe → on mesure la vraie valeur sur le document TOP (qui a viewport-fit=cover).
  const [safeAuto, setSafeAuto] = useState(0);
  const [safeTopAuto, setSafeTopAuto] = useState(0);
  // Réglages manuels de secours (px) : null = auto (sonde). Persistés par appareil.
  const [navOffset, setNavOffset] = useState(() => { try { const v = localStorage.getItem('loggia-navoffset'); return (v == null || v === '') ? null : Math.max(0, parseInt(v) || 0); } catch (e) { return null; } });
  const [topOffset, setTopOffset] = useState(() => { try { const v = localStorage.getItem('loggia-topoffset'); return (v == null || v === '') ? null : Math.max(0, parseInt(v) || 0); } catch (e) { return null; } });
  useEffect(() => {
    const measure = () => {
      try {
        const td = (window.top || window).document;
        const probe = (css) => { const p = td.createElement('div'); p.style.cssText = 'position:fixed;left:0;width:0;opacity:0;pointer-events:none;z-index:-1;' + css; td.documentElement.appendChild(p); void p.offsetHeight; const h = Math.round(p.getBoundingClientRect().height || p.offsetHeight || 0); td.documentElement.removeChild(p); return h > 0 ? h : 0; };
        setSafeAuto(probe('bottom:0;height:env(safe-area-inset-bottom,0px)'));
        setSafeTopAuto(probe('top:0;height:env(safe-area-inset-top,0px)'));
      } catch (e) {}
    };
    measure();
    const t1 = setTimeout(measure, 400), t2 = setTimeout(measure, 1200);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('resize', measure); window.removeEventListener('orientationchange', measure); };
  }, []);
  const safeEff = navOffset != null ? navOffset : safeAuto; // valeur appliquée (manuel prioritaire)
  const safeTopEff = topOffset != null ? topOffset : safeTopAuto;
  useEffect(() => { try { document.documentElement.style.setProperty('--o-safe-bottom', safeEff + 'px'); document.documentElement.style.setProperty('--o-safe-top', safeTopEff + 'px'); } catch (e) {} }, [safeEff, safeTopEff]);
  const onNavOffset = (d) => setNavOffset(v => { const base = v != null ? v : safeAuto; const nv = Math.max(0, Math.min(100, base + d)); try { localStorage.setItem('loggia-navoffset', String(nv)); } catch (e) {} return nv; });
  const onNavSet = (px) => setNavOffset(() => { const nv = Math.max(0, Math.min(100, Math.round(px))); try { localStorage.setItem('loggia-navoffset', String(nv)); } catch (e) {} return nv; });
  const onNavOffsetReset = () => { setNavOffset(null); try { localStorage.removeItem('loggia-navoffset'); } catch (e) {} };
  const onTopOffset = (d) => setTopOffset(v => { const base = v != null ? v : safeTopAuto; const nv = Math.max(0, Math.min(100, base + d)); try { localStorage.setItem('loggia-topoffset', String(nv)); } catch (e) {} return nv; });
  const onTopSet = (px) => setTopOffset(() => { const nv = Math.max(0, Math.min(100, Math.round(px))); try { localStorage.setItem('loggia-topoffset', String(nv)); } catch (e) {} return nv; });
  const onTopOffsetReset = () => { setTopOffset(null); try { localStorage.removeItem('loggia-topoffset'); } catch (e) {} };
  const [users, setUsers] = useState(() => { const withK = withUserKeys; try { const s = localStorage.getItem('loggia_users'); if (s) { const a = JSON.parse(s); if (Array.isArray(a) && a.length) return withK(a); } } catch (e) {} return withK(FIRST_USER()); });
  // `cfgSet` ecrit le serveur ET le localStorage. Avec le seul localStorage,
  // les profils restaient prisonniers de l'appareil qui les avait crees.
  const persistUsers = (a) => { try { cfgSet({ loggia_users: a }); } catch (e) {} setUsers(a); };
  const [userIdx, setUserIdx] = useState(() => { try { const v = parseInt(localStorage.getItem('loggia_active_user'), 10); return (v >= 0 && v < users.length) ? v : 0; } catch (e) { return 0; } });
  // La configuration serveur arrive APRES le premier rendu. Sans cette
  // resynchronisation, `users` resterait celui du localStorage de l'appareil,
  // et les profils crees ailleurs n'apparaitraient jamais.
  const usersPousses = useRef(false);
  useEffect(() => {
    const distant = serverCfg && serverCfg.loggia_users;
    if (Array.isArray(distant) && distant.length) {
      usersPousses.current = true;
      if (usersSig(distant) !== usersSig(users)) setUsers(withUserKeys(distant));
      return;
    }
    // Le serveur ne connait aucun profil : on lui envoie ceux d'ici, une fois.
    // Sans cela, une liste creee avant la synchronisation resterait locale.
    // On se garde bien de pousser la liste par defaut : un appareil vierge
    // ecraserait alors les vrais profils.
    const parDefaut = users.length === 1 && !users[0].haId && users[0].name === 'Administrateur';
    if (!usersPousses.current && users.length && !parDefaut) {
      usersPousses.current = true;
      cfgSet({ loggia_users: users });
    }
  }, [serverCfg, users]);

  const [pinTarget, setPinTarget] = useState(null);
  // Chip « n allumées » du header : compte les luminaires HA à l'état on.
  const lightsOn = useMemo(() => {
    const S = hass && hass.states; if (!S) return 0;
    let n = 0; for (const id in S) { if (id.indexOf('light.') === 0 && S[id] && S[id].state === 'on') n++; }
    return n;
  }, [hass]);
  const adminPin = (() => { try { return localStorage.getItem('loggia_admin_pin') || '0000'; } catch (e) { return '0000'; } })();
  const applyUser = (i) => { try { localStorage.setItem('loggia_active_user', String(i)); const u = users[i]; if (u && u.name) { const m = JSON.parse(localStorage.getItem('loggia-lastseen') || '{}'); m[u.name] = Date.now(); localStorage.setItem('loggia-lastseen', JSON.stringify(m)); } } catch (e) {} setUserIdx(i); };
  const switchUser = (i) => { if (i === userIdx) return; if (users[i] && users[i].role === 'Admin') setPinTarget(i); else applyUser(i); };
  const isAdmin = !!(users[userIdx] && users[userIdx].role === 'Admin');
  /* Permissions par profil : le set des vues autorisées du profil actif, ou
   * null = toutes (admins, et profils sans restriction — le défaut). */
  const vuesAutorisees = (!isAdmin && users[userIdx] && Array.isArray(users[userIdx].vues) && users[userIdx].vues.length)
    ? new Set(users[userIdx].vues) : null;
  // Une vue interdite atteinte autrement (restauration, lien) retombe sur l'accueil.
  useEffect(() => {
    if (!vuesAutorisees) return;
    const base = view.indexOf('room:') === 0 ? 'pieces' : view;
    if (base !== 'accueil' && base !== 'parametres' && !vuesAutorisees.has(base)) setView('accueil');
  }, [view, vuesAutorisees ? [...vuesAutorisees].join('|') : '']);
  useEffect(() => { if (!isAdmin) setEditMode(false); }, [isAdmin]);
  // Édition en place des vues intégrées : sheet « Entités de cette vue » (crayon actif + vue configurable).
  const [entSheet, setEntSheet] = useState(false);
  useEffect(() => { setEntSheet(false); }, [view, editMode]);
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
    if (hu.id && users[i].haId !== hu.id) persistUsers(users.map((u, j) => j === i ? { ...u, haId: hu.id } : u));
    applyUser(i);
  }, [hass, users]);
  // Retour haptique léger au tap sur un élément interactif (Android ; iOS web n'expose pas vibrate → seul le rebond visuel s'affiche).
  // Vibre au pointerup si le doigt n'a presque pas bougé — poser le doigt pour scroller ne doit PAS vibrer.
  useEffect(() => {
    const sel = 'button,.o-nav-item,.o-piece,.o-light-card,.o-scene-room,.o-volet-mode,[role="switch"],[role="button"]';
    let start = null;
    const onDown = (e) => { try { start = (e.target && e.target.closest && e.target.closest(sel)) ? { x: e.clientX, y: e.clientY } : null; } catch (er) { start = null; } };
    const onUp = (e) => { try { if (start && navigator.vibrate && Math.abs(e.clientX - start.x) < 10 && Math.abs(e.clientY - start.y) < 10) navigator.vibrate(8); } catch (er) {} start = null; };
    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointerup', onUp, { passive: true });
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('pointerup', onUp); };
  }, []);

  // Premier lancement : montre une seule fois, et seulement quand la decouverte
  // a repondu — sinon il annoncerait « 0 entite trouvee ».
  const onboarded = serverCfg.loggia_onboarded != null || readLS('loggia_onboarded', null) != null;
  const showOnboarding = !onboarded && loggiaRuntime.ready;
  const closeOnboarding = (patch) => saveCfg({ ...(patch || {}), loggia_onboarded: CONFIG_VERSION });

  return (
    <LoggiaContext.Provider value={loggiaRuntime}>
    {showOnboarding && <Suspense fallback={null}><Onboarding runtime={loggiaRuntime} onDone={closeOnboarding} onSkip={() => closeOnboarding(null)} /></Suspense>}
    <HeaderCtx.Provider value={{ light: lightMode, onToggleTheme: toggle, onToggleNav: () => setNavOpen(o => !o), onNav: setView, editMode, onToggleEdit: () => setEditMode(e => !e), users, userIdx, onSwitchUser: switchUser, isAdmin, notifs, customViews, rooms: (cfg.rooms || []).map(r => r.room).filter(r => !estDehors(r)), lightsOn }}>
    <div className={navbar ? 'o-navbar-on' : undefined} style={{ display: 'flex', minHeight: '100vh', background: fondPhotoActif ? 'transparent' : 'var(--o-bggrad, var(--o-bg))', fontFamily: 'var(--o-font)', color: 'var(--o-text)',
      // isolate : notre propre contexte d'empilement. Sans lui, le z-index
      // négatif du calque photo l'envoie sous le fond OPAQUE de tout wrapper
      // qu'une extension glisse entre body et #root — photo invisible, vécu.
      isolation: 'isolate' }}>
      {/* Fond photo : un calque FIXE derrière tout (z-index négatif) — pas de
          background-attachment: fixed, que Safari iOS ne sait pas peindre. Le
          voile assombrit (ou éclaircit, en mode clair) pour que le texte des
          cartes reste lisible sur n'importe quelle photo. */}
      {fondPhotoActif && (
        <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none',
          background: (lightMode ? 'linear-gradient(rgba(240,244,250,.6),rgba(240,244,250,.6)), ' : 'linear-gradient(rgba(5,7,11,.55),rgba(5,7,11,.55)), ')
            + `url("${fondPhotoActif}") center center / cover no-repeat var(--o-bg)` }} />
      )}
      {ficheDemo && <FicheAppareil id={ficheDemo} hass={hass} onClose={() => setFicheDemo(null)} />}
      {idle && ambient > 0 && plageOk && <AmbientOverlay wx={weatherMode || 'clouds'} wxFx={wxFx} weatherTemp={weatherTemp} weatherLabel={weatherLabel} inTemp={accueil ? accueil.inTemp : null} lightsOn={lightsOn} notifs={notifs}
        ast={(() => { const S = (hass && hass.states) || {}; const rAl = (loggiaRuntime.resolved && loggiaRuntime.resolved.alarm && loggiaRuntime.resolved.alarm.available) ? loggiaRuntime.resolved.alarm.main : null; const aid = (secAlarm() && S[secAlarm()]) ? secAlarm() : rAl; return (aid && S[aid]) ? S[aid].state : null; })()} />}
      {haLost && <div role="alert" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 400, background: 'rgba(239,68,68,.94)', color: '#fff', fontSize: 12.5, fontWeight: 700, textAlign: 'center', padding: '7px 14px calc(7px + var(--o-safe-top,0px))' }}>{tr('Connexion Home Assistant perdue — les données affichées peuvent être obsolètes')}</div>}
      {toast && <div role="status" style={{ position: 'fixed', left: '50%', bottom: 'calc(24px + var(--o-safe-bottom,0px))', transform: 'translateX(-50%)', zIndex: 400, background: 'var(--o-surfA)', color: 'var(--o-bad)', border: '1px solid rgba(var(--o-bad-rgb),.4)', borderRadius: 12, padding: '10px 16px', fontSize: 12.5, fontWeight: 700, boxShadow: 'var(--o-shadow,0 10px 30px rgba(0,0,0,.4))' }}>{toast}</div>}
      <Sidebar view={view} vuesAutorisees={vuesAutorisees} onNav={(v) => { setView(v); try { if ((window.innerWidth || 0) <= 820) setNavOpen(false); } catch (e) {} }} open={navOpen} customViews={customViews} ha={(() => {
        const ok = !!(hass && hass.states && (hass.connected === undefined || hass.connected));
        let devCount = 0;
        if (ok) { const doms = ['light.', 'switch.', 'media_player.', 'camera.', 'climate.', 'cover.', 'vacuum.', 'lawn_mower.']; for (const id in hass.states) { if (doms.some(d => id.indexOf(d) === 0) && hass.states[id] && hass.states[id].state !== 'unavailable') devCount++; } }
        const rAl = (loggiaRuntime.resolved && loggiaRuntime.resolved.alarm && loggiaRuntime.resolved.alarm.available) ? loggiaRuntime.resolved.alarm.main : null;
        const aid = (secAlarm() && ok && hass.states[secAlarm()]) ? secAlarm() : rAl;
        const ast = (ok && aid && hass.states[aid]) ? hass.states[aid].state : null;
        const al = ast == null ? { t: 'Alarme · état inconnu', c: '140,152,180' }
          : ast === 'disarmed' ? { t: tr('Alarme désarmée'), c: '52,211,153' }
            : ast === 'triggered' ? { t: 'ALARME DÉCLENCHÉE', c: '248,113,113' }
              : (ast === 'arming' || ast === 'pending') ? { t: 'Alarme · activation…', c: '255,179,71' }
                : { t: ast === 'armed_away' || ast === 'armed_vacation' ? 'Alarme armée · Absent' : 'Alarme armée · Présent', c: '255,179,71' };
        return { online: ok, devCount, alarmTxt: al.t, alarmRgb: al.c };
      })()} />
      {navOpen && <div className="loggia-backdrop" onClick={() => setNavOpen(false)} />}
      {pinTarget != null && <PinModal expected={adminPin} onClose={() => setPinTarget(null)} onSuccess={() => { applyUser(pinTarget); setPinTarget(null); }} />}
      <div key={view} className="o-view" style={{ display: 'flex', flex: 1, minWidth: 0 }}>
      {/* Tant que la decouverte n'a pas repondu, on ne monte aucune vue autre que
          l'accueil : plusieurs lisent leur configuration sans verifier qu'elle
          existe. Une surface vide le temps d'un instant, pas l'accueil — sinon
          l'on verrait la page changer deux fois sous ses yeux. */}
      {(!loggiaRuntime.ready && view !== 'accueil') ? <main className="loggia-main" style={{ flex: 1, minWidth: 0 }} />
        : viewBlocked ? <ViewEmpty vid={view} reason={viewBlocked} onNav={setView} />
        : view === 'lumieres' ? <LumieresView hass={hass} edit={editMode && isAdmin} onEnt={editMode && isAdmin ? () => setEntSheet(true) : null} /> : view === 'scenes' ? <ScenesView hass={hass} /> : view === 'climat' ? <ClimatView hass={hass} edit={editMode && isAdmin} /> : view === 'volets' ? <VoletsView hass={hass} edit={editMode && isAdmin} /> : view === 'energie' ? <EnergieView hass={hass} edit={editMode && isAdmin} onEnt={() => setEntSheet(true)} /> : view === 'aspirateur' ? <AspirateurView hass={hass} /> : view === 'croquettes' ? <CroquettesView hass={hass} /> : view === 'medias' ? <MediasView hass={hass} edit={editMode && isAdmin} onEnt={editMode && isAdmin ? () => setEntSheet(true) : null} /> : view === 'meteo' ? <MeteoView hass={hass} edit={editMode && isAdmin} onEnt={editMode && isAdmin ? () => setEntSheet(true) : null} wxFx={wxFx} /> : view === 'objets' ? <ObjetsView hass={hass} onNav={setView} edit={editMode && isAdmin} /> : view === 'securite' ? <SecuriteView hass={hass} edit={editMode && isAdmin} onEnt={editMode && isAdmin ? () => setEntSheet(true) : null} /> : view === 'systeme' ? <SystemeView hass={hass} /> : view === 'parametres' ? <ParametresView themeMode={themeMode} loggiaTheme={loggiaTheme} haTheme={haTheme} onMode={onMode} onPickTheme={onPickTheme} onFollowHa={onFollowHa} navbar={navbar} onToggleNavbar={onToggleNavbar} wxFx={wxFx} onToggleWxFx={onToggleWxFx} ambient={ambient} onAmbient={onAmbient} ambPlage={ambPlage} onAmbPlage={onAmbPlage} navMargin={safeEff} navAuto={navOffset == null} onNavOffset={onNavOffset} onNavOffsetReset={onNavOffsetReset} onNavSet={onNavSet} onTopSet={onTopSet} look={look} onLook={onLook} topMargin={safeTopEff} topAuto={topOffset == null} onTopOffset={onTopOffset} onTopOffsetReset={onTopOffsetReset} hass={hass} users={users} userIdx={userIdx} isAdmin={isAdmin} onAddUser={addUser} onUpdateUser={updateUser} onDeleteUser={deleteUser} customViews={customViews} onSaveCustomViews={saveCustomViews} /> : activeCv ? <CustomView cv={activeCv} hass={hass} edit={editMode && isAdmin} onSave={(cv2) => saveCustomViews(customViews.map(x => x.id === cv2.id ? cv2 : x))} /> : activeRoom ? <RoomView room={activeRoom} rooms={(cfg.rooms || []).map(r => r.room).filter(r => !estDehors(r))} piece={(() => { const base = PIECES.find(p => p.name === activeRoom) || { name: activeRoom, bg: 'rgba(var(--o-accent-rgb),.16)', icon: <Fi i="home" color="var(--o-accent)" size={22} /> }; const lv = accueil && accueil.rooms ? accueil.rooms.find(r => r.name === activeRoom) : null; return { ...base, name: activeRoom, live: lv, temp: lv && lv.temp != null ? lv.temp.toFixed(1) + '°' : base.temp, hum: lv && lv.hum != null ? Math.round(lv.hum) + '%' : base.hum, badge: lv && lv.co2 != null ? Math.round(lv.co2) + ' ppm' : null }; })()} hass={hass} onNav={setView} edit={editMode && isAdmin} /> : <Dashboard editMode={editMode} onEnt={isAdmin ? () => setEntSheet(true) : null} weatherMode={weatherMode} weatherRaw={weatherRaw} wxFx={wxFx} weatherTemp={weatherTemp} weatherLabel={weatherLabel} accueil={accueil} userName={(users[userIdx] || {}).name || ''} onOpenRoom={(name) => setView('room:' + name)} onOpenMeteo={() => setView('meteo')} />}
      </div>
      {navbar && <MobileNav view={view} onNav={(v) => { setView(v); try { if ((window.innerWidth || 0) <= 820) setNavOpen(false); } catch (e) {} }} onMenu={() => setNavOpen(o => !o)} />}
      {entSheet && editMode && isAdmin && <Suspense fallback={null}><ViewEntSheet view={view} hass={hass} onClose={() => setEntSheet(false)} /></Suspense>}
    </div>
    </HeaderCtx.Provider>
    </LoggiaContext.Provider>
  );
}
