/* L’en-tête de chaque vue (`Header`) : la recherche, les profils, les notifications, le bouton de l’assistant.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { createContext, useState, useRef, useEffect, useContext, useLayoutEffect, Suspense } from 'react';
import { lazyRecharge } from '../recharge.js';
import { nonLues as journalNonLues } from '../journal.js';
import { getHass } from '../state.js';
import { sansAccents, enPanne } from '../outils.js';
import { commander, surVanne } from '../actions.js';
import { useLoggia } from '../runtime.js';
import { isViewAvailable } from '../views.js';
import { Fi, REDUCE_MOTION, HIDDEN_VIEWS, BottomSheet, NomFeuille, CroixFeuille, userBg, FlipText } from '../ui.jsx';
import { abonnesPrises, lireEtatPrises, gardeDeSwitch } from '../prisesetat.js';
import { LISERE } from '../styles.js';
import { Ico } from '../icones.jsx';
import { nomScenario, resumeScenario, teinteScenario } from '../scenarios.js';
import { tr, locale, trN, nomProfil } from '../i18n.js';
import { ecartDe, cvEstLumiere, priseDe, indexLu } from '../app/noyau.jsx';
import { FichePrise } from '../appareils/fiches.jsx';
import { PIECES } from '../app/pieces.jsx';
import { scenarios, nomsLiens, lancerScenario } from '../app/scenarios.jsx';

/* L'orbe seule, pour la miniature de l'appui long. Meme module que celui de
 * la popup : le paquet n'est telecharge qu'une fois, quel que soit celui des
 * deux qui le demande en premier. */
// Un décor, comme le fond météo : introuvable même après le rechargement,
// elle ne rend rien.
const OrbeMini = lazyRecharge(() => import('../orbe.jsx'), { decor: true });


// Contexte barre du haut : expose les actions globales (sidebar, thème, édition, nav) au Header partagé.
const HeaderCtx = createContext(null);

const NAV = [
  { group: 'MAISON', items: [
    { label: 'Accueil', active: true, svg: <Fi i="home" color="var(--o-accent)" /> },
    { label: 'Pièces', svg: <Fi i="door-open" color="var(--o-orange)" /> },
    { label: 'Scénarios', svg: <Fi i="sparkles" color="var(--o-purple)" /> },
    { label: 'Objets', svg: <Fi i="apps" color="var(--o-cyan)" /> },
    { label: 'Énergie', svg: <Fi i="bolt" color="var(--o-ok)" /> },
    { label: 'Sécurité', svg: <Fi i="shield-check" color="var(--o-ok)" /> },
  ] },
  { group: 'SYSTÈME', reglages: true, items: [
    { label: 'Système', svg: <Fi i="microchip" color="var(--o-text2)" /> },
    { label: 'Paramètres', svg: <Fi i="settings-sliders" color="var(--o-text2)" /> },
  ] },
];

/* Le libellé d'une entrée de menu → l'identifiant de sa vue. « Caméras » en est
 * parti le 23/09 (plan, M4) : la vue n'a jamais existé — les caméras vivent sur
 * l'Accueil et dans Sécurité. La table promettait une route que la recherche
 * filtrait déjà (`BUILT` ne la connaît pas), donc silencieusement inerte.
 * « Croquettes » la suit le 04/10 : « il n'y a plus de vue spéciale pour un
 * appareil, c'est la carte plus sa popup » — ses repas s'activent dans la
 * fiche du distributeur (FicheDistributeur). */
const LABEL_VIEW = { 'Accueil': 'accueil', 'Pièces': 'pieces', 'Lumières': 'lumieres', 'Scénarios': 'scenes', 'Climat': 'climat', 'Volets': 'volets', 'Énergie': 'energie', 'Médias': 'medias', 'Objets': 'objets', 'Sécurité': 'securite', 'Système': 'systeme', 'Paramètres': 'parametres' };
const BUILT = new Set(['accueil', 'pieces', 'lumieres', 'scenes', 'climat', 'volets', 'energie', 'medias', 'objets', 'securite', 'systeme', 'parametres']);

/* ── Recherche globale (⌘K / Ctrl+K / clic barre) : pièces, vues (natives + custom), scènes rapides ── */
const IS_MAC = (() => { try { return sansAccents(navigator.platform || '').indexOf('mac') >= 0 || /iphone|ipad/.test(sansAccents(navigator.platform || '')); } catch { return false; } })();
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
    el.appendChild(rip); setTimeout(() => { try { el.removeChild(rip); } catch {} }, 650);
    el.classList.remove('o-scenefx'); void el.offsetWidth; el.classList.add('o-scenefx');
  } catch {}
}

/* Les appareils que la recherche (Ctrl+K) propose pour `nq` — le texte tapé,
 * sans accents, dès deux caractères : par nom, huit au plus. Une lampe, un
 * ventilateur, une prise libre se basculent sur place ; les autres mènent à
 * leur vue.
 *
 * Mais Entrée est UN appui : il ne coupe pas ce qui en demande deux
 * (relecture finale, point A1). Une PRISE allumée dont la protection est vraie
 * — ou pas encore lue : dans le doute, on demande, comme sa carte — mène à
 * Objets, sur le filtre Prises, où sa carte demande. Le switch du pont de
 * Zigbee2MQTT (« Permit join ») ne se bascule JAMAIS d'ici : l'appairage ouvert
 * laisse n'importe quel appareil rejoindre le réseau, l'ouvrir demande deux
 * appuis (§ 9) — il mène à Paramètres › Interrupteurs, sans le droit de
 * l'ouvrir il ne se propose pas, comme toute section interdite. Les deux
 * arrivent par une mémoire de session lue à l'arrivée, comme les résultats
 * « Réglages ». Une SIRÈNE (un switch qu'`estSirene` reconnaît) ne vit que dans
 * Sécurité (P1) : Entrée ne la fait pas sonner, elle mène à cette vue (relecture
 * finale, B10). L'état des prises se lit dans le cache, sans s'y abonner :
 * rien ne part au serveur pour une recherche. Mais personne ne relit ce cache
 * quand aucune carte de prise n'est montée : sans abonné (`abonnesPrises`), il
 * vaut une protection INCONNUE — et la prise allumée mène à Objets, où sa carte
 * s'abonne et demande (F5). Et jamais de `toggle` : l'ordre est explicite
 * (`turn_on`, `turn_off`), d'après l'état que la recherche affiche — un
 * `toggle` inverse l'état RÉEL, et coupait une prise rallumée entre-temps.
 * Un switch que l'index ne classe pas encore suit la même règle que partout
 * (`gardeDeSwitch`, F2). `h` : le `hass` ; `onNav` : la navigation. */
/* `onFiche(id)` (audit du 19/10, point 12) : une prise gardée ouvre SA fiche, qui demande, par-dessus la vue — sans lui,
 * Objets › Prises, où sa carte demande. */
function appareilsRecherche(nq, h, { onNav, droits = [], onFiche = null }) {
  const S = (h && h.states) || {};
  const lecture = abonnesPrises() > 0 ? lireEtatPrises() : { etat: null, erreur: false };
  const DOMS = { light: 'bulb', switch: 'bolt', climate: 'thermometer-half', cover: 'blinds', media_player: 'tv-music', vacuum: 'broom', lawn_mower: 'tractor', fan: 'wind' };
  // Un robot n'a pas de vue : sa carte, dans Objets, ouvre sa fiche.
  const VUE_DOM = { climate: 'climat', cover: 'volets', media_player: 'medias', vacuum: 'objets', lawn_mower: 'objets' };
  const mene = (cle, valeur, vue) => (close) => { try { sessionStorage.setItem(cle, valeur); } catch { /* stockage indisponible */ } onNav(vue); close(); };
  const out = [];
  for (const id in S) {
    if (out.length >= 8) break;
    const dom = id.split('.')[0];
    if (!DOMS[dom]) continue;
    const st = S[id];
    // Muet — absent, `unavailable` ou `unknown` (`enPanne`, la règle des cartes ; audit du 19/10, point 3) : rien à basculer d'ici.
    if (enPanne(id, st)) continue;
    const nom = (st.attributes && st.attributes.friendly_name) || id;
    if (sansAccents(nom).indexOf(nq) < 0) continue;
    const ecart = dom === 'switch' ? ecartDe(S, id) : null;
    const pont = ecart === 'pont';
    // Une sirène (P1) ne vit que dans Sécurité : Entrée ne la fait pas sonner d'un appui, elle mène à sa vue.
    const sirene = ecart === 'sirene';
    if (pont && droits.indexOf('inter') < 0) continue;
    const allumee = st.state === 'on';
    const garde = dom === 'switch' && !pont && !sirene && allumee && !cvEstLumiere(id) && gardeDeSwitch(lecture, id, { reconnue: priseDe(S, id).prise, indexLu: indexLu() });
    const togglable = !pont && !sirene && !garde && (dom === 'light' || dom === 'switch' || dom === 'fan');
    out.push({
      group: tr('Appareils'), label: nom, sub: id, run: togglable, runLabel: tr('Basculer'),
      icon: <Fi i={DOMS[dom]} color="var(--o-cyan)" />,
      act: pont ? mene('loggia-par-section', 'inter', 'parametres') : sirene ? (close) => { onNav('securite'); close(); } : garde ? (onFiche ? (close) => { onFiche(id); close(); } : mene('loggia-objets-filtre', 'prises', 'objets'))
        : (close) => {
          if (togglable) { commander(h, id, allumee ? 'turn_off' : 'turn_on'); }
          else if (VUE_DOM[dom]) onNav(VUE_DOM[dom]);
          close();
        },
    });
  }
  return out;
}

function SearchSheet({ onClose, onNav, customViews = [], rooms = [], droits = [], onFiche = null }) {
  const { views: avail } = useLoggia();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef(null);
  const nq = sansAccents(q.trim());
  const match = (label) => !nq || sansAccents(label).indexOf(nq) >= 0;
  const results = [];
  rooms.forEach(r => { if (!match(r)) return; const p = PIECES.find(x => x.name === r); results.push({ group: tr('Pièces'), label: r, icon: p ? p.icon : <Fi i="home" color="var(--o-accent)" size={20} />, act: (close) => { onNav('room:' + r); close(); } }); });
  NAV.forEach(g => g.items.forEach(it => { const vid = LABEL_VIEW[it.label]; if (BUILT.has(vid) && isViewAvailable(avail, vid) && match(it.label)) results.push({ group: tr('Vues'), label: tr(it.label), icon: it.svg, act: (close) => { onNav(vid); close(); } }); }));
  HIDDEN_VIEWS().forEach(h => { if (isViewAvailable(avail, h.vid) && match(h.label)) results.push({ group: tr('Vues'), label: tr(h.label), icon: <Fi i={h.icon} color={h.c} />, act: (close) => { onNav(h.vid); close(); } }); });
  customViews.forEach(cv => { if (match(cv.name)) results.push({ group: tr('Vues'), label: cv.name, icon: <Fi i={cv.icon || 'sparkles'} color="var(--o-accent-soft)" />, act: (close) => { onNav('cv:' + cv.id); close(); } }); });
  scenarios().forEach(s => { const nom = nomScenario(s); if (!match(nom)) return; results.push({ group: tr('Scénarios'), label: nom, sub: resumeScenario(s, nomsLiens()), icon: <Ico name={s.icone || 'sparkles'} color={teinteScenario(s).col} />, run: true, act: (close) => { lancerScenario(getHass(), s.id); close(); } }); });
  // Appareils : par nom, dès deux caractères tapés — le déluge n'aide personne (`appareilsRecherche`).
  if (nq.length >= 2) results.push(...appareilsRecherche(nq, getHass(), { onNav, droits, onFiche }));
  // Réglages : chaque section des Paramètres se trouve par son nom — la
  // mémoire de session `loggia-par-section` fait atterrir au bon endroit.
  /* Une section qu'on n'a pas le droit d'ouvrir ne se propose pas : la
   * trouver pour tomber sur une page vide serait pire que ne pas la trouver.
   * Les quatre sections sans droit associé — profils, apparence, connexion,
   * à propos — s'ouvrent à tout le monde depuis les Paramètres. Elles ne se
   * cherchaient pourtant que sous un profil administrateur : la recherche
   * cachait ce que la page montrait. */
  {
    [['users', tr('Utilisateurs'), null], ['apparence', tr('Apparence'), null], ['vues', tr('Vues'), 'vues'], ['auto', tr('Automatisations'), 'auto'], ['alertes', tr('Alertes'), 'alertes'], ['maj', tr('Mises à jour'), 'maj'], ['connexion', tr('Connexion HA'), null], ['about', tr('À propos'), null]].forEach(([id, label, droit]) => {
      if (droit && droits.indexOf(droit) < 0) return;
      if (!match(label)) return;
      results.push({ group: tr('Réglages'), label, icon: <Fi i="settings" color="var(--o-text2)" />, act: (close) => { try { sessionStorage.setItem('loggia-par-section', id); } catch {} onNav('parametres'); close(); } });
    });
  }
  const selIdx = results.length ? Math.min(sel, results.length - 1) : -1;
  useEffect(() => { setSel(0); }, [nq]);
  useEffect(() => { try { const el = listRef.current && listRef.current.querySelector('[data-sel="1"]'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); } catch {} }, [selIdx]);
  let lastGroup = null;
  return (
    <BottomSheet onClose={onClose}>
      {(close) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          {/* La recherche n'a pas de titre à l'écran : son champ porte le mot, mais
            * une feuille nommée par un champ annoncerait ce qu'on y tape. Le nom
            * vit dans un élément CACHÉ, que `aria-labelledby` lit quand même
            * (audit du 03/10). */}
          <NomFeuille><span hidden>{tr('Rechercher')}</span></NomFeuille>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--o-s1)', border: LISERE, borderRadius: 14, padding: '11px 14px' }}>
            <Ico name="search" size={16} color="var(--o-text2)" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Pièce, vue, scène…')} aria-label={tr('Rechercher')}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSel(i => Math.min(i + 1, results.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(i => Math.max(i - 1, 0)); }
                else if (e.key === 'Enter') { e.preventDefault(); if (selIdx >= 0) results[selIdx].act(close); }
                else if (e.key === 'Escape') { e.preventDefault(); close(); }
              }}
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: 'var(--o-text)', fontSize: 15, fontWeight: 500, fontFamily: 'var(--o-font)' }} />
            {q && <span role="button" tabIndex={0} aria-label={tr('Effacer')} onClick={() => setQ('')} onKeyDown={(e) => { if (e.key === 'Enter') setQ(''); }} style={{ cursor: 'pointer', display: 'inline-flex', padding: 12, margin: -12 }}><Fi i="cross-circle" size={16} color="var(--o-text3)" /></span>}
          </div>
          <CroixFeuille />
          </div>
          <div ref={listRef} style={{ maxHeight: '52vh', overflowY: 'auto', margin: '0 -8px', padding: '0 8px' }}>
            {!results.length && <div style={{ padding: '26px 8px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Aucun résultat pour « {q} »', { q })}</div>}
            {results.map((r, i) => {
              const head = r.group !== lastGroup; lastGroup = r.group;
              return (
                <div key={r.group + ':' + r.label}>
                  {head && <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.09em', color: 'var(--o-text3)', textTransform: 'uppercase', padding: '10px 8px 5px' }}>{r.group}</div>}
                  <div data-sel={i === selIdx ? '1' : undefined} role="button" tabIndex={0}
                    onClick={() => r.act(close)} onMouseEnter={() => setSel(i)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); r.act(close); } }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', borderRadius: 14, cursor: 'pointer', background: i === selIdx ? 'rgba(var(--o-accent-rgb),.14)' : 'transparent' }}>
                    <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--o-s1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{r.icon}</span>
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
  const { onToggleTheme, onToggleNav, onNav, editMode, onToggleEdit, users = [], userIdx = 0, onSwitchUser, peutEditer = false, droits = [], notifs = [], onLireNotifs = null, customViews = [], rooms = [], onAssistant = null, onDictee = null, hass: hassCtx = null } = ctx;
  const cur = users[userIdx] || { name: 'Administrateur', role: 'Admin', grad: 'linear-gradient(135deg,var(--o-lampe-b),var(--o-bad))' };
  const curBg = userBg(cur);
  const hbtn = { width: 42, height: 42, borderRadius: '50%', background: 'var(--o-s1)', border: LISERE, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--o-text1)', cursor: 'pointer', flexShrink: 0 };
  /* `border` et non `borderColor` : `hbtn` pose deja le raccourci, et React
   * ne garantit pas l'ordre entre les deux. En quittant l'edition il retirait
   * `borderColor` en laissant `border` — le bouton pouvait garder sa bordure
   * accentuee. */
  const editBtn = editMode ? { ...hbtn, background: 'rgba(var(--o-accent-rgb),.18)', border: 'var(--o-bw,1px) solid rgba(var(--o-accent-rgb),.45)', color: 'var(--o-accent-soft)' } : hbtn;
  const menu = { position: 'absolute', top: 'calc(100% + 8px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd1)', borderRadius: 14, boxShadow: '0 18px 44px rgba(0,0,0,.45)', backdropFilter: 'blur(14px)', zIndex: 60, overflow: 'hidden' };
  const mItem = { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'transparent', border: 'none', color: 'var(--o-text1)', cursor: 'pointer', fontSize: 13, fontWeight: 600, textAlign: 'left' };
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // La fiche d'une prise que la recherche ouvre (point 12) : elle survit à la fermeture de la recherche.
  const [fichePrise, setFichePrise] = useState(null);
  /* La prise désignée comme vanne d'eau qu'un appui voulait rallumer (actions.js ; passe bis de l'étape 3 IoT, point 9) : sa fiche
   * s'ouvre ici — l'en-tête est sur chaque vue —, et la fiche d'une prise-vanne montre la popup de la vanne, sur sa question
   * (ficheprise.jsx : rien de plus au démarrage). Inscrit tant qu'il est monté, retiré en partant (passe bis 2) : un en-tête démonté
   * gardait l'appui, et la popup ne s'ouvrait nulle part — sans en-tête, le toast dit pourquoi (actions.js). */
  useEffect(() => surVanne(setFichePrise), []);
  // ⌘K (mac) / Ctrl+K : ouvre/ferme la recherche globale
  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setSearchOpen(o => !o); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Appui long sur le chip lumières (voir plus bas) : minuteur + drapeau pour
  // que le clic qui SUIT un appui long ne navigue pas en plus d'avoir éteint.
  const chipTimer = useRef(0);
  useEffect(() => () => clearTimeout(chipTimer.current), []);
  /* « Lu » vit désormais DANS le journal, une entrée à la fois (01/10). La
   * signature du contenu ne savait pas distinguer « deux alertes dont une déjà
   * lue » de « deux alertes neuves » : elle changeait, et tout redevenait non
   * lu. */
  const [bellRing, setBellRing] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const iv = setInterval(() => setClock(new Date()), 30000); return () => clearInterval(iv); }, []);
  const capit = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const dateStr = capit(clock.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }));
  const timeStr = clock.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const hasNotif = notifs.length > 0;
  const nbNonVues = journalNonLues(notifs);
  const nonVues = nbNonVues > 0;
  const marquerVues = () => { if (onLireNotifs) onLireNotifs(); };
  const nsig = notifs.filter(n => !n.lu).map(n => n.k).join('|');
  const nsigPrev = useRef(nsig);
  useEffect(() => {
    /* La cloche ne tinte que pour du NEUF. `nsig` ne liste plus que les
     * entrées non lues : marquer tout lu la vide, et rien ne tinte. */
    if (nsig && nsig !== nsigPrev.current) { setBellRing(true); const t = setTimeout(() => setBellRing(false), 900); nsigPrev.current = nsig; return () => clearTimeout(t); }
    nsigPrev.current = nsig;
  }, [nsig]);
  /* Les deux menus de l'en-tête se refermaient au CLIC DEHORS, et à rien
   * d'autre : ouvert au clavier, celui des notifications n'avait aucune sortie
   * au clavier. Échap le referme maintenant, comme toute couche posée par
   * dessus — et rend le focus au bouton qui l'a ouvert, sinon on repart du
   * haut de la page à chaque fermeture. */
  const clocheRef = useRef(null);
  const profilRef = useRef(null);
  useEffect(() => {
    if (!notifOpen && !userOpen) return;
    const close = (e) => { if (!(e.target.closest && e.target.closest('[data-hdr-menu]'))) { setNotifOpen(false); setUserOpen(false); } };
    const echap = (e) => {
      if (e.key !== 'Escape') return;
      // La feuille par-dessus, s'il y en a une, se ferme la premiere.
      e.stopPropagation();
      const bouton = notifOpen ? clocheRef.current : profilRef.current;
      setNotifOpen(false); setUserOpen(false);
      if (bouton && bouton.focus) bouton.focus();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', echap);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', echap); };
  }, [notifOpen, userOpen]);
  // Auto-hide barre (porté de V1) : masquée en défilant vers le bas, réapparaît en remontant.
  const [hidden, setHidden] = useState(false);
  /* L'en-tête publie sa hauteur et son état (04/10) : la colonne du rail de
   * l'Accueil colle 16 px SOUS lui, et remonte à 16 px du bord quand il se
   * masque (index.css, `.o-rail-cell`). Même motif que `--o-navh` de la
   * barre du bas — au montage, par ResizeObserver et au redimensionnement (un
   * ResizeObserver ne tire pas sur une taille émulée). En `useLayoutEffect` :
   * l'en-tête est monté PAR VUE, la mesure doit précéder la première peinture,
   * et le nettoyage la retire au démontage — sinon une vue sans en-tête
   * hériterait de 73 px de vide. Au doigt, l'en-tête est en `display: none` :
   * la mesure vaut 0.
   * En mouvement réduit, l'en-tête ne glisse plus (relecture du 04/10) : la
   * colonne saute d'un coup (index.css), et l'en-tête qui glissait encore
   * 0,3 s recouvrait jusqu'à 58 px de sa première carte pendant 150 ms. */
  const hdrRef = useRef(null);
  useLayoutEffect(() => {
    const el = hdrRef.current;
    const racine = document.documentElement;
    const poser = () => { try { racine.style.setProperty('--o-hdrh', Math.round(el ? el.getBoundingClientRect().height : 0) + 'px'); } catch { /* sans style sur la racine : le repli à 0 */ } };
    poser();
    let ro = null;
    try { ro = new ResizeObserver(poser); if (el) ro.observe(el); } catch { /* sans ResizeObserver : le redimensionnement suffit */ }
    window.addEventListener('resize', poser);
    return () => { window.removeEventListener('resize', poser); if (ro) ro.disconnect(); try { racine.style.removeProperty('--o-hdrh'); } catch { /* rien à retirer */ } };
  }, []);
  useLayoutEffect(() => {
    const racine = document.documentElement;
    racine.classList.toggle('loggia-hdr-cache', hidden);
    return () => racine.classList.remove('loggia-hdr-cache');
  }, [hidden]);
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
    {searchOpen && <SearchSheet onClose={() => setSearchOpen(false)} onNav={onNav} customViews={customViews} rooms={rooms} droits={droits} onFiche={setFichePrise} />}
    {fichePrise && <FichePrise id={fichePrise} hass={getHass()} onClose={() => setFichePrise(null)} />}
    <header ref={hdrRef} className="loggia-hdr" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 'calc(14px + var(--o-safe-top,0px)) 28px 14px', borderBottom: '1px solid var(--o-s1)', position: 'sticky', top: 0, background: 'var(--o-header)', backdropFilter: 'blur(12px)', zIndex: 40, transform: hidden ? 'translateY(-100%)' : 'translateY(0)', transition: REDUCE_MOTION ? 'none' : 'transform .3s ease', willChange: 'transform' }}>
      <button onClick={onToggleNav} title={tr('Afficher / masquer le menu')} style={{ width: 42, height: 42, borderRadius: 14, background: 'var(--o-s1)', border: LISERE, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--o-text1)', cursor: 'pointer', flexShrink: 0 }}><Ico name="menu-burger" size={20} /></button>
      {/* Sa largeur minimale vit dans index.css (`.o-hdr-search`) : elle
        * dépend de la place de l'en-tête, pas de celle de l'écran.
        *
        * Son NOM vient de ce qu'il affiche (lot 13 de l'audit du 03/10) :
        * « Rechercher une pièce, une scène… Ctrl K ». L'étiquette « Rechercher
        * (Ctrl+K) » le remplaçait, et qui le cherche à la voix par les mots
        * affichés ne le trouvait pas (WCAG 2.5.3). Elle reste en infobulle,
        * comme celles des boutons voisins : le raccourci s'y lit encore quand
        * l'en-tête étroit cache sa touche. `aria-keyshortcuts` le donne au
        * lecteur d'écran, `aria-haspopup` dit qu'une feuille s'ouvre. */}
      <div className="o-hdr-search" role="button" tabIndex={0} title={tr('Rechercher (Ctrl+K)')} aria-haspopup="dialog" aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'} onClick={() => setSearchOpen(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSearchOpen(true); } }} style={{ flex: 1, maxWidth: 420, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--o-s1)', border: LISERE, borderRadius: 14, padding: '10px 14px', cursor: 'pointer' }}>
        <Ico name="search" size={16} color="var(--o-text2)" />
        {/* Le court prend le relais quand le long ne tient pas (lot 7 de l'audit du 28/10, V6 ; index.css, `recherche`) : à la
          * tablette, le champ n'avait que 90 px pour 227 — « Recherc… ». Un seul des deux s'affiche, et c'est lui qui fait le nom. */}
        <span className="o-recherche-long" style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--o-text2)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr('Rechercher une pièce, une scène…')}</span>
        <span className="o-recherche-court" style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--o-text2)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr('Rechercher…')}</span>
        <span className="o-hdr-kbd" style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', background: 'var(--o-bd2)', border: '1px solid var(--o-bd2)', borderRadius: 10, padding: '2px 7px' }}>{IS_MAC ? '⌘K' : tr('Ctrl K') /* « Strg K » sur un clavier allemand, comme « Rechercher (Ctrl+K) » (audit du 03/10) */}</span>
      </div>
      <div style={{ flex: 1 }} />
      {/* Chip « n allumées » : l'état lumineux de la maison, d'un regard, où
          qu'on soit. Un appui LONG éteint tout — le geste du départ, sans
          chercher la scène. Le clic court navigue, comme avant. */}
      {/* La pilule « N allumées » a quitté l'en-tête (retour 01/09) : la
          carte Chips et les résumés le disent déjà. */}
      <div className="o-hdr-date" style={{ textAlign: 'right', lineHeight: 1.15 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{dateStr}</div><div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600 }}><FlipText text={timeStr} /></div></div>
      <div className="o-hdr-div" style={{ width: 1, height: 30, background: 'var(--o-bd1)' }} />
      <div data-hdr-menu style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
        {/* Sur un poste fixe il n'y a pas de barre du bas : sans cette entree,
            l'assistant n'existerait tout simplement pas. Elle s'efface des que
            la barre du bas parait — voir `.o-hdr-assist` dans index.css. */}
        {onAssistant && <BoutonAssistant onAssistant={onAssistant} onDictee={onDictee} hass={hassCtx} sens="bas" variante="entete" />}
        {/* Sa place, vide, le temps de la première réponse (lot 14 de l'audit
          * du 03/10) : le micro paraissait une image après, et poussait la
          * date de 50 px. Même classe : au doigt, la règle la retire aussi. */}
        {!onAssistant && ctx.assistantAttendu && <span className="o-hdr-assist" aria-hidden="true" style={{ width: 42, height: 42, flexShrink: 0 }} />}
        {peutEditer && <button onClick={onToggleEdit} title={editMode ? tr('Quitter le mode édition') : tr('Mode édition')} style={editBtn}><Ico name="edit" size={17} /></button>}
        {/* Le mode OÙ L'ON EST (18/10) : le soleil restait dans les deux — « le bouton
          * mode sombre / clair ne change pas d'icône ». `light` est le rendu réel,
          * thème de HA suivi compris. */}
        <button onClick={onToggleTheme} title={tr('Changer de thème')} style={hbtn}><Ico name={ctx.light ? 'sun' : 'moon'} size={18} /></button>
        {/* La cloche annonce ce qu'elle porte (plan M7) : le point rouge des
          * non-lues ne se voit pas d'un lecteur d'écran, et « Notifications »
          * seul ne disait pas s'il y avait quelque chose à lire.
          *
          * Le nombre dit est celui des NON LUES (audit du 03/10) : `notifs`
          * garde aussi les lues depuis que « lu » vit dans le journal (01/10),
          * et la cloche annonçait « 7 non lues » pour deux. Ses deux gabarits
          * vont nus à `trN` : traduits d'abord, sans nombre, un objet de
          * formes polonais serait tranché en « other ». */}
        <button ref={clocheRef} onClick={() => { setNotifOpen(o => { const n = !o; if (n) marquerVues(); return n; }); setUserOpen(false); }}
          aria-label={tr('Notifications') + (nonVues ? ' · ' + trN(nbNonVues, '{n} non lue', '{n} non lues') : '')}
          aria-expanded={notifOpen} title={tr('Notifications')} style={{ ...hbtn, position: 'relative' }}><span className={bellRing && !REDUCE_MOTION ? 'o-bellring' : undefined} style={{ display: 'inline-flex' }}><Ico name="bell" size={18} /></span>{nonVues && <span className="o-livedot" aria-hidden="true" style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: '50%', background: 'var(--o-bad)', border: '2px solid var(--o-bg2)', '--o-point-r': 4 }} />}</button>
        <button ref={profilRef} aria-label={tr('Profil')} aria-expanded={userOpen} onClick={() => { setUserOpen(o => !o); setNotifOpen(false); }} title={tr('Profil')} style={{ width: 44, height: 44, borderRadius: '50%', marginLeft: 4, background: curBg, border: '2px solid rgba(255,255,255,.15)', cursor: 'pointer', flexShrink: 0 }} />
        {notifOpen && (
          <div style={{ ...menu, right: 52, width: 'min(304px, calc(100vw - 32px))' }}>
            <div style={{ padding: '12px 14px', borderBottom: 'var(--o-bw,1px) solid var(--o-bd3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontWeight: 700, fontSize: 14 }}>{tr('Notifications')}</span><span onClick={marquerVues} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); marquerVues(); } }} style={{ fontSize: 12, color: 'var(--o-accent-soft)', cursor: 'pointer', fontWeight: 600 }}>{tr('Tout lire')}</span></div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {hasNotif ? notifs.map((n, i) => (
                <div key={n.k} style={{ display: 'flex', gap: 12, padding: '11px 14px', borderBottom: 'var(--o-bw,1px) solid var(--o-bd3)', opacity: n.lu ? .62 : 1 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: n.c, marginTop: 5, flexShrink: 0 }} /><div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: n.lu ? 600 : 700 }}>{n.t}</div><div style={{ fontSize: 12, color: 'var(--o-text2)' }}>{n.m}</div><div style={{ fontSize: 11, color: 'var(--o-text3)', marginTop: 2 }}>{ilYa(n.ts)}</div></div></div>
              )) : <div style={{ padding: '22px 14px', textAlign: 'center', fontSize: 13, color: 'var(--o-text3)', fontWeight: 600 }}>{tr('Aucune notification')}</div>}
            </div>
          </div>
        )}
        {userOpen && (
          <div style={{ ...menu, right: 0, width: 252 }}>
            <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, borderBottom: 'var(--o-bw,1px) solid var(--o-bd3)' }}><span style={{ width: 40, height: 40, borderRadius: '50%', background: curBg, flexShrink: 0 }} /><div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{nomProfil(cur.name)}</div><div style={{ fontSize: 12, color: 'var(--o-text2)' }}>{tr(cur.role)} · {tr('Maison')}</div></div></div>
            <div style={{ padding: '8px 12px 4px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--o-text3)' }}>{tr('CHANGER DE PROFIL')}</div>
            <div style={{ padding: '0 6px 6px' }}>
              {/* La cle est le NOM, pas le rang : ces lignes sont des boutons,
                  donc focalisables. Ajouter ou retirer un profil pendant que le
                  menu est ouvert deplacait le focus d'une ligne a l'autre, React
                  reutilisant le bouton par sa position (24/09, plan M9). */}
              {users.map((u, i) => (
                <button key={u.name || i} onClick={() => { onSwitchUser && onSwitchUser(i); setUserOpen(false); }} style={{ ...mItem, gap: 12, background: i === userIdx ? 'var(--o-s1)' : 'transparent' }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: userBg(u), flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{nomProfil(u.name)}</span><span style={{ display: 'block', fontSize: 11, color: 'var(--o-text2)', fontWeight: 600 }}>{tr(u.role)}</span></span>
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


// Barre de navigation du bas — mobile uniquement (masquée en CSS au-dessus de 820px), activable/désactivable.
/* Le bouton de l'assistant : deux gestes, un seul bouton.
 *
 * Rond et sorti de son rang, la ou les autres sont carres et alignes : ce
 * n'est pas une vue de plus, c'est quelqu'un a qui parler. La difference de
 * forme dit ce qu'une etiquette aurait mis trois mots a dire.
 *
 * Appui COURT : la conversation ecrite s'ouvre.
 * Appui LONG  : l'orbe parait en miniature au-dessus du bouton et la voix
 *               s'active — le geste du bouton d'accueil d'autrefois.
 *
 * Le seuil et la vibration sont ceux du reste du dashboard : 200 ms, 35 ms de
 * retour tactile, dix pixels de tolerance. Au-dela on defile, on ne maintient
 * pas — sans cette tolerance, tout debut de defilement appellerait la voix.
 *
 * Le clic qui SUIT un appui long ne doit pas ouvrir la conversation en plus.
 * Le navigateur envoie le `click` apres le `pointerup`, et rien dans
 * l'evenement ne dit combien de temps le doigt est reste pose : d'ou le
 * drapeau. Il se relache aussi au clavier, sinon une frappe bien plus tard
 * serait avalee a son tour par un appui long termine depuis longtemps.
 *
 * L'orbe n'est PAS montee tant qu'on n'appuie pas. Un contexte WebGL et
 * quelques dizaines de milliers de particules pour un bouton present sur
 * chaque ecran se paieraient a chaque ouverture du dashboard. Le module part
 * en telechargement des l'appui, pour etre la quand le seuil tombe.
 *
 * La voix elle-meme n'est pas encore branchee. Ce qui vit ici, c'est le geste
 * et son retour visible ; `demarrerVoix` et `arreterVoix` sont les deux points
 * ou l'ecoute viendra se poser, et rien d'autre n'aura a bouger. */
/* Le cadre est plus large que l'orbe : elle varie, et doit pouvoir gonfler
 * sans toucher le bord. Voir la camera dans `orbe.jsx`. */
const ORBE_MINI = 130;

function BoutonAssistant({ onAssistant, onDictee = null, hass = null, sens = 'haut', variante = 'nav' }) {
  const [voix, setVoix] = useState(false);
  const [niveau, setNiveau] = useState(null);
  const minuteur = useRef(null);
  const depart = useRef(null);
  const long = useRef(false);
  const session = useRef(null);
  useEffect(() => () => {
    clearTimeout(minuteur.current);
    if (session.current) { try { session.current.annuler(); } catch { /* deja ferme */ } }
  }, []);

  const demarrerVoix = () => {
    try { if (navigator.vibrate) navigator.vibrate(35); } catch { /* pas de vibreur : le visuel porte seul */ }
    setVoix(true);
    if (!hass || !onDictee) return;      // rien a qui parler : l'orbe seule
    /* Le module d'ecoute est charge a la volee, comme l'orbe : le micro, le
     * contexte audio et le pipeline n'ont rien a faire dans le paquet
     * d'amorcage d'un tableau de bord. */
    import('../voix.js').then(async (voixMod) => {
      if (!voixMod.voixDisponible().ok) return;
      /* Le maintien EST le geste : c'est le seul moment ou le navigateur
       * accepte de debloquer la lecture de la reponse. Elle arrivera bien
       * plus tard, quand il sera trop tard pour demander. */
      voixMod.preparerLecture();
      let s2 = null;
      try {
        s2 = await voixMod.ecouter(hass, { onNiveau: setNiveau });
        // Le doigt peut etre reparti pendant que le micro s'ouvrait.
        if (!long.current) { s2.annuler(); return; }
        session.current = s2;
        const dit = await s2.texte;
        session.current = null;
        if (dit) onDictee(dit);
      } catch {
        if (s2) { try { s2.annuler(); } catch { /* deja ferme */ } }
        session.current = null;
      }
    }).catch(() => { /* module injoignable : l'orbe aura au moins paru */ });
  };
  const arreterVoix = () => {
    setVoix(false);
    setNiveau(null);
    /* On ferme le robinet du son, pas la transcription : Home Assistant rend
     * la phrase apres coup, et c'est elle qui ouvrira la conversation. */
    if (session.current) { try { session.current.arreter(); } catch { /* deja ferme */ } }
  };

  const debut = (e) => {
    long.current = false;
    depart.current = { x: e.clientX, y: e.clientY };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture refusee : le pointerup suffit */ }
    import('../orbe.jsx').catch(() => { /* deja la, ou reseau coupe : le repli s'en charge */ });
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => {
      if (!depart.current) return;
      long.current = true;
      demarrerVoix();
    }, 200);
  };
  const bouge = (e) => {
    if (!depart.current || long.current) return;
    if (Math.abs(e.clientX - depart.current.x) > 10 || Math.abs(e.clientY - depart.current.y) > 10) {
      clearTimeout(minuteur.current);
      depart.current = null;
    }
  };
  const fin = () => {
    clearTimeout(minuteur.current);
    depart.current = null;
    if (long.current) arreterVoix();
  };

  const gestes = {
    onPointerDown: debut, onPointerMove: bouge, onPointerUp: fin, onPointerCancel: fin,
    /* Sans cela, maintenir le bouton SELECTIONNE le texte autour.
     *
     * `mousedown` a pour effet par defaut d'amorcer un glissement de
     * selection dans le document. `user-select: none` sur le bouton empeche
     * de selectionner SON contenu, pas de partir de lui pour surligner ce
     * qu'il y a a cote — la date de l'en-tete, les etiquettes de la barre.
     * Le refuser coupe la selection a la racine, et n'empeche NI le
     * `pointerdown` qui arme l'appui long, NI le `click` qui suit. Seul le
     * focus au clic disparait ; la tabulation le donne toujours. */
    onMouseDown: (e) => e.preventDefault(),
    onContextMenu: (e) => e.preventDefault(),
    onClick: () => { if (long.current) { long.current = false; return; } onAssistant(); },
    onKeyDown: () => { long.current = false; },
  };
  const tenue = { touchAction: 'manipulation', WebkitTouchCallout: 'none', userSelect: 'none' };
  /* Un micro (retour du 18/09, deux captures) : en haut, le bouton rond des
   * voisins de l'en-tete ; en bas, un carre arrondi rose -> violet. */
  const degrade = 'linear-gradient(135deg, var(--o-rose-fond), var(--o-purple-fond))';

  /* Hors du <button> : un bouton n'accepte que du contenu de phrase, et l'orbe
   * pose un <div>. Le cadre positionne les deux l'un par rapport a l'autre. */
  const miniature = voix ? (
    <span aria-hidden="true" style={{
      position: 'absolute', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 60,
      bottom: sens === 'haut' ? '100%' : 'auto', top: sens === 'haut' ? 'auto' : '100%',
      marginBottom: sens === 'haut' ? 14 : 0, marginTop: sens === 'haut' ? 0 : 14,
    }}>
      <Suspense fallback={<span style={{ display: 'block', width: ORBE_MINI, height: ORBE_MINI }} />}>
        <OrbeMini etat="listening" niveau={niveau} taille={ORBE_MINI} />
      </Suspense>
    </span>
  ) : null;

  if (variante === 'entete') {
    return (
      <span className="o-hdr-assist" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <button {...gestes} aria-label={tr('Parler à l’assistant')} title={tr('Parler à l’assistant')}
          style={{ ...tenue, width: 42, height: 42, borderRadius: '50%', padding: 0, cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)',
            boxShadow: voix ? '0 0 0 4px rgba(var(--o-purple-rgb),.35)' : 'none',
            transition: REDUCE_MOTION ? 'none' : 'box-shadow .2s' }}>
          <Fi i="microphone" size={18} />
        </button>
        {miniature}
      </span>
    );
  }
  return (
    <span style={{ position: 'relative', flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>
      <button {...gestes} aria-label={tr('Parler à l’assistant')} className="o-nav-assist"
        style={{ ...tenue, width: 62, border: 'none', background: 'transparent', cursor: 'pointer',
          padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span aria-hidden="true" style={{
          width: 48, height: 48, borderRadius: 15, marginTop: -14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', background: degrade, color: '#fff',
          boxShadow: voix
            ? '0 0 0 5px var(--o-header), 0 0 0 9px rgba(var(--o-purple-rgb),.30), 0 6px 18px rgba(var(--o-purple-rgb),.45)'
            : '0 0 0 5px var(--o-header), 0 6px 18px rgba(var(--o-purple-rgb),.40)',
          transition: REDUCE_MOTION ? 'none' : 'box-shadow .2s',
        }}>
          <Fi i="microphone" size={21} color="#fff" />
        </span>
      </button>
      {miniature}
    </span>
  );
}


/** Depuis quand elle est là. Le journal porte l'heure d'ARRIVÉE : c'est elle
 *  qui compte, pas le dernier soubresaut de l'entité. */
function ilYa(ts) {
  const m = (Date.now() - ts) / 60000;
  if (!isFinite(m) || m < 1) return tr('à l’instant');
  if (m < 60) return tr('Il y a {n} min', { n: Math.round(m) });
  if (m < 1440) return tr('Il y a {n} h', { n: Math.round(m / 60) });
  return tr('Il y a {n} j', { n: Math.round(m / 1440) });
}

export { HeaderCtx, NAV, LABEL_VIEW, BUILT, fxTap, appareilsRecherche, Header, BoutonAssistant, ilYa };
