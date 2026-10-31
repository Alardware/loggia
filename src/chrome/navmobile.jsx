/* La barre de navigation du téléphone (`MobileNav`).
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, useEffect, useRef, useLayoutEffect, Fragment } from 'react';
import { useLoggia } from '../runtime.js';
import { isViewAvailable } from '../views.js';
import { readViewsCfg, HIDDEN_VIEWS, Fi } from '../ui.jsx';
import { Ico } from '../icones.jsx';
import { trCourt, tr } from '../i18n.js';
import { BoutonAssistant } from './entete.jsx';

/* Ce que la barre du bas PEUT porter, parmi les vues principales.
 *
 * Des libellés COURTS, propres à la barre (03/10) : traduits, plusieurs ne
 * tenaient pas dans leur case (« Dispositivos », « Dispositivi »). Le polonais
 * n'en a PAS : sa traduction est relue par un Polonais, et ses mots restent
 * les siens — c'est la taille du texte qui s'ajuste. */
const BARRE_VUES = () => [
  { id: 'accueil', label: trCourt('Accueil · court'), icon: 'home' },
  { id: 'pieces', label: tr('Pièces'), icon: 'door-open' },
  { id: 'scenes', label: trCourt('Scénarios · court'), icon: 'sparkles' },
  { id: 'objets', label: trCourt('Objets · court'), icon: 'apps' },
  { id: 'energie', label: tr('Énergie'), icon: 'bolt' },
  { id: 'securite', label: trCourt('Sécurité · court'), icon: 'shield-check' },
];
/* Cinq cases au plus. Au-delà, la SOMME des libellés ne tient plus dans la
 * largeur, et le corps a déjà touché son plancher (voir plus bas, 11 → 9,5 px).
 * Le reste des vues vit dans « Menu », qui est juste à côté. */
const BARRE_MAX = 5;

function MobileNav({ view, onNav, onMenu, menuOuvert = false, onAssistant = null, onDictee = null, hass = null, assistantAttendu = false, vuesAutorisees = null }) {
  const { views: avail } = useLoggia();
  // Le safe-area du bas est géré par le dashboard (card_mod padding-bottom) → l'iframe s'arrête au-dessus du home indicator.
  /* La barre SUIT LE MENU (10/10) — « la nav barre mobile, actuellement elle
   * n'est pas personnalisable ». Elle portait cinq entrées écrites en dur :
   * masquer Objets dans le menu ne l'en retirait pas, remettre Climatisation
   * ne l'y mettait pas.
   *
   * Même règle que la barre latérale, à la lettre : les droits du profil, les
   * masquées retirées, les secondaires remises admises, l'ordre choisi. */
  const [viewsCfg, setViewsCfg] = useState(readViewsCfg);
  useEffect(() => {
    const f = () => setViewsCfg(readViewsCfg());
    window.addEventListener('loggia-views-changed', f);
    return () => window.removeEventListener('loggia-views-changed', f);
  }, []);
  const permis = (vid) => !vuesAutorisees || vid === 'accueil' || vuesAutorisees.has(vid);
  const rang = (vid) => { const i = (viewsCfg.order || []).indexOf(vid); return i < 0 ? 999 : i; };
  const vues = BARRE_VUES();
  const accueil = vues.filter(it => it.id === 'accueil');
  /* Accueil garde sa place en tête : c'est le point de départ, et la barre
   * latérale le tient aussi hors du rangement. */
  const rangees = [
    ...vues.filter(it => it.id !== 'accueil' && !viewsCfg.hidden.has(it.id)),
    ...HIDDEN_VIEWS().filter(h => viewsCfg.shown.has(h.vid)).map(h => ({ id: h.vid, label: h.label, icon: h.icon })),
  ].sort((a, b) => rang(a.id) - rang(b.id));
  const items = [...accueil, ...rangees]
    .filter(it => permis(it.id) && isViewAvailable(avail, it.id))
    .slice(0, BARRE_MAX);
  /* Une case ne rétrécit jamais sous son libellé (rien n'est coupé, rien ne
   * déborde chez la voisine) : `minWidth: 'auto'` défait le `* { min-width: 0 }`
   * global, qui forçait six cases égales quoi qu'elles portent. C'est alors la
   * SOMME des libellés qui doit tenir, et le corps s'y AJUSTE, mesuré : de 11
   * à 9,5 px. Le français (330 px à 11 px) descend à 10,5 px à 320 px ; le
   * polonais, aux mots entiers (« Bezpieczeństwo »), à 9,6 px à 360 px. Sous
   * 9,5 px, plus lisible : les libellés courts gardent leur largeur, les longs
   * se partagent le reste à parts égales (`cap`) et se coupent (« … ») au
   * lieu de chevaucher — le polonais à 320 px. */
  /* `marge` (lot 7 de l'audit du 28/10, V1) : la marge de chaque case, de part et d'autre du libellé. À 320 px, le français
   * tenait à 11 px avec 4 px entre deux libellés et « Accueil » à 2 px du bord. Sous 360 px, elle passe à 3 px (6 px entre deux
   * mots) et le bouton de l'assistant rend 8 px (index.css, `.o-nav-assist`) : le corps cède un demi-point, le polonais garde
   * ses mots entiers. */
  const [corps, setCorps] = useState({ px: 11, cap: null, marge: 2 });
  const cell = (on) => ({ position: 'relative', flex: corps.cap ? '1 1 auto' : 1, minWidth: corps.cap ? 0 : 'auto', ...(corps.cap ? { maxWidth: corps.cap } : {}), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '9px ' + corps.marge + 'px 7px', background: 'none', border: 'none', cursor: 'pointer', color: on ? 'var(--o-accent-soft)' : 'var(--o-text2)', fontSize: corps.px, fontWeight: 700, WebkitTapHighlightColor: 'transparent' });
  const libelle = { whiteSpace: 'nowrap', ...(corps.cap ? { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' } : {}) };
  /* Sa hauteur RÉELLE, mesurée, pour que les feuilles du bas s'arrêtent
   * au-dessus d'elle : elle varie avec la zone sûre et la taille du texte,
   * une valeur écrite en dur mentirait sur un appareil ou l'autre. */
  const navRef = useRef(null);
  const textes = items.map(it => it.label).join('|');
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;
    const ajuster = () => {
      // Cachée (ordinateur), elle ne mesure rien : on garde le dernier corps.
      if (!nav.clientWidth) return;
      const libelles = [...nav.querySelectorAll('[data-libelle]')];
      if (!libelles.length) return;
      // Largeurs NATURELLES à 11 px : le texte grandit en proportion du corps.
      const f = parseFloat(getComputedStyle(libelles[0]).fontSize) || 11;
      /* `scrollWidth` est arrondi à l'entier INFÉRIEUR : sur six libellés, jusqu'à 5 px de trop peu — à 320 px, « Menu »
       * sortait d'1 px de l'écran (lot 7). La largeur exacte du texte, quand il n'est pas coupé. */
      const naturels = libelles.map(el => Math.max(el.scrollWidth, el.getBoundingClientRect().width) * 11 / f);
      const naturel = naturels.reduce((s, w) => s + w, 0);
      let autres = 0;
      for (const c of nav.children) if (!c.querySelector('[data-libelle]')) autres += c.getBoundingClientRect().width;
      // Deux marges par case, et 2 px pour l'arrondi des mesures.
      const marge = nav.clientWidth <= 360 ? 3 : 2;
      const place = nav.clientWidth - autres - 2 * marge * libelles.length - 2;
      const px = Math.max(9.5, Math.min(11, Math.floor(110 * place / naturel) / 10));
      let cap = null;
      if (naturel * px / 11 > place) {
        // Les courts d'abord, entiers ; ce qui reste se partage entre les longs.
        const tri = naturels.map(w => w * px / 11).sort((a, b) => a - b);
        let reste = place;
        for (let i = 0; i < tri.length; i++) {
          const part = reste / (tri.length - i);
          if (tri[i] > part) { cap = Math.floor(part) + 2 * marge; break; }
          reste -= tri[i];
        }
      }
      setCorps(c => (c.px === px && c.cap === cap && c.marge === marge ? c : { px, cap, marge }));
    };
    ajuster();
    let ro = null;
    try { ro = new ResizeObserver(ajuster); ro.observe(nav); } catch { /* sans ResizeObserver : le redimensionnement suffit */ }
    window.addEventListener('resize', ajuster);
    // La police arrive APRÈS le premier rendu : mesurés avec celle de repli,
    // les mots polonais « tenaient » à 11 px, puis débordaient.
    const polices = document.fonts;
    if (polices) { polices.ready.then(ajuster).catch(() => {}); polices.addEventListener('loadingdone', ajuster); }
    return () => { window.removeEventListener('resize', ajuster); if (ro) ro.disconnect(); if (polices) polices.removeEventListener('loadingdone', ajuster); };
  }, [textes]);
  useEffect(() => {
    const el = navRef.current;
    const poser = () => { try { document.documentElement.style.setProperty('--o-navh', Math.round(el ? el.getBoundingClientRect().height : 0) + 'px'); } catch {} };
    poser();
    let ro = null;
    try { ro = new ResizeObserver(poser); if (el) ro.observe(el); } catch {}
    window.addEventListener('resize', poser);
    return () => { window.removeEventListener('resize', poser); if (ro) ro.disconnect(); try { document.documentElement.style.setProperty('--o-navh', '0px'); } catch {} };
  }, []);
  /* Ce que la barre MONTRE, elle le DIT aussi (audit du 03/10). La vue
   * ouverte n'était qu'une couleur et un trait d'accent, que la barre
   * latérale disait déjà par `aria-current="page"` (plan M7) ; celle-ci,
   * rien. Le <nav> porte un nom, « Vues » : la clé existe dans les six
   * catalogues, aucune traduction neuve, le polonais reste tel que relu.
   * « Menu » dit enfin si le tiroir qu'il ouvre est ouvert. */
  return (
    <nav ref={navRef} className="loggia-mobilenav" aria-label={tr('Vues')} style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, alignItems: 'stretch', background: 'var(--o-header)', borderTop: 'var(--o-bw,1px) solid var(--o-bd1)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', paddingBottom: 'calc(var(--o-safe-bottom, 0px) + 6px)', boxShadow: '0 -8px 24px rgba(0,0,0,.22)' }}>
      {/* Luna prend le MILIEU, pas un bout.
        * C'est le seul geste de la barre qui ne soit pas une navigation : on
        * ne va pas quelque part, on adresse la parole a quelqu'un. Le mettre
        * au bout, entre deux vues, l'aurait fait passer pour une sixieme vue.
        * Au centre, sous le pouce, il se distingue de lui-meme. */}
      {items.map((it, i) => { const on = view === it.id; return (
        <Fragment key={it.id}>
        {/* Avec de quoi dicter : sans `onDictee` ni `hass`, le maintien ferait
          * paraitre l'orbe sans rien ecouter -- c'etait le cas jusqu'a la 3.54. */}
        {onAssistant && i === Math.ceil(items.length / 2) && <BoutonAssistant onAssistant={onAssistant} onDictee={onDictee} hass={hass} />}
        {/* Sa place au milieu, le temps de la première réponse (lot 14 de
          * l'audit du 03/10) : les vues de la barre glissaient à son arrivée. */}
        {!onAssistant && assistantAttendu && i === Math.ceil(items.length / 2) && <span aria-hidden="true" className="o-nav-assist" style={{ flex: '0 0 auto', width: 62 }} />}
        <button onClick={() => onNav(it.id)} aria-current={on ? 'page' : undefined} style={cell(on)}>
          {on && <span style={{ position: 'absolute', top: 0, width: 28, height: 3, borderRadius: '0 0 3px 3px', background: 'var(--o-accent-fond)' }} />}
          <Fi i={it.icon} size={20} color={on ? 'var(--o-accent)' : 'var(--o-text2)'} />
          <span data-libelle="" style={libelle}>{it.label}</span>
        </button>
        </Fragment>
      ); })}
      <button onClick={onMenu} aria-expanded={menuOuvert} style={cell(false)}>
        <Ico name="menu-burger" size={20} color="var(--o-text2)" />
        <span data-libelle="" style={libelle}>{tr('Menu')}</span>
      </button>
    </nav>
  );
}

export { MobileNav };
