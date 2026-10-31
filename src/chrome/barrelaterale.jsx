/* La barre latérale (`Sidebar`), ses profils et ses notifications au tactile.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, useEffect, useRef } from 'react';
import { nonLues as journalNonLues } from '../journal.js';
import { useLoggia } from '../runtime.js';
import { isViewAvailable } from '../views.js';
import { BottomSheet, TitreFeuille, userBg, Fi, readViewsCfg, HIDDEN_VIEWS, FlipText } from '../ui.jsx';
import { tr, nomProfil, trN } from '../i18n.js';
import { ilYa, LABEL_VIEW, BUILT, NAV } from './entete.jsx';

// Adresse du serveur telle que le navigateur la voit : rien a configurer, et
// rien qui vienne de l'installation de quelqu'un d'autre.
function haHost() {
  // La démo n'a pas de serveur : nommer l'hôte de la page (github.io,
  // localhost) ferait croire à un Home Assistant derrière.
  if (typeof window !== 'undefined' && window.__loggiaDemo) return tr('maison de démonstration');
  try { return ((window.top || window).location || {}).host || 'Home Assistant'; } catch { return 'Home Assistant'; }
}

/* ── Profils et notifications AU TACTILE (24/09) ──────────────────────────
 *
 * Sur un téléphone ou une tablette, `html.loggia-tactile` masque le bandeau du
 * haut (index.css). Or la pastille de profil et la cloche n'y vivaient QUE :
 * changer de profil depuis un mobile était impossible, et Paramètres › Profils
 * ne sait que créer et modifier. La cloche était perdue de la même façon.
 *
 * Les deux reviennent en deux rangées dans le PIED DU TIROIR, au-dessus du
 * séparateur — au même endroit et pour la même raison que « Mode édition »,
 * rapatrié là quand le bandeau a disparu. Le bandeau reste masqué, et sur
 * ordinateur rien ne change : la pastille reste en haut à droite.
 *
 * Basculer vers un profil Admin continue de passer par le code : la feuille
 * appelle `onSwitchUser`, c'est-à-dire `switchUser`, qui ouvre `PinModal`. Le
 * composant le vérifie de son côté depuis l'ADR 0080 — écrire
 * `loggia_active_user` sans laissez-passer se fait refuser. */
function FeuilleProfils({ users, userIdx, onSwitchUser, onGerer, onClose }) {
  return (
    <BottomSheet onClose={onClose}>
      <TitreFeuille marge={12}><span style={{ fontSize: 17, fontWeight: 800 }}>{tr('Changer de profil')}</span></TitreFeuille>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* La clé est le NOM, pas le rang — même raison qu'au bandeau. */}
        {users.map((u, i) => (
          <button key={u.name || i} onClick={() => { if (onSwitchUser) onSwitchUser(i); onClose(); }}
            aria-current={i === userIdx ? 'true' : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 12px', borderRadius: 12, border: 'none', cursor: 'pointer', textAlign: 'left', background: i === userIdx ? 'var(--o-s1)' : 'transparent', color: 'var(--o-text1)' }}>
            <span style={{ width: 34, height: 34, borderRadius: '50%', background: userBg(u), flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{nomProfil(u.name)}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--o-text2)', fontWeight: 600 }}>{tr(u.role || 'Invité')}</span>
            </span>
            {i === userIdx && <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--o-ok)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
          </button>
        ))}
      </div>
      <button onClick={() => { onGerer(); onClose(); }}
        style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', marginTop: 12, padding: '12px 12px 0', border: 'none', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', background: 'transparent', color: 'var(--o-accent)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
        <Fi i="settings" size={14} /><span>{tr('Gérer les profils')}</span>
      </button>
    </BottomSheet>
  );
}

function FeuilleNotifications({ notifs, onClose }) {
  return (
    <BottomSheet onClose={onClose}>
      <TitreFeuille marge={12}><span style={{ fontSize: 17, fontWeight: 800 }}>{tr('Notifications')}</span></TitreFeuille>
      {notifs.length ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {notifs.map((n, i) => (
            <div key={n.k} style={{ display: 'flex', gap: 12, padding: '11px 2px', borderBottom: i < notifs.length - 1 ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none', opacity: n.lu ? .62 : 1 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.c, marginTop: 5, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: n.lu ? 600 : 700 }}>{n.t}</div>
                <div style={{ fontSize: 12, color: 'var(--o-text2)' }}>{n.m}</div>
                <div style={{ fontSize: 11, color: 'var(--o-text3)', marginTop: 2 }}>{ilYa(n.ts)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : <div style={{ padding: '26px 0', textAlign: 'center', fontSize: 13, color: 'var(--o-text3)', fontWeight: 600 }}>{tr('Aucune notification')}</div>}
    </BottomSheet>
  );
}

function Sidebar({ view, onNav, open = true, customViews = [], ha = null, vuesAutorisees = null, editMode = false, onToggleEdit = null,
  tactile = false, users = [], userIdx = 0, onSwitchUser = null, notifs = [], onLireNotifs = null }) {
  /* `ha` nul, c'est l'attente du premier tic du pont (lot 14) : un état NEUTRE,
   * « Connexion… » en gris, partout où la barre dit l'état de Home Assistant.
   * Les quatre autres endroits disaient « En ligne » en vert pendant ce temps,
   * même quand Home Assistant était injoignable (relecture du lot 14). */
  const [profilsOuverts, setProfilsOuverts] = useState(false);
  const [notifsOuvertes, setNotifsOuvertes] = useState(false);
  const profilActif = users[userIdx] || users[0] || { name: 'Administrateur', role: 'Admin' };
  /* Vu = persisté par appareil, MÊME clé que la cloche du bandeau : ce sont
   * deux portes sur la même chose, un point rouge éteint d'un côté ne doit pas
   * se rallumer de l'autre. */
  const nbNonVues = journalNonLues(notifs);
  const nonVues = nbNonVues > 0;
  const marquerVues = () => { if (onLireNotifs) onLireNotifs(); };
  // Permissions par profil : `null` = tout (admins et profils sans restriction).
  const permis = (vid) => !vuesAutorisees || vid === 'accueil' || vid === 'parametres' || vuesAutorisees.has(vid);
  // Une vue que l'installation ne peut pas remplir ne figure pas dans le menu.
  const { views: avail } = useLoggia();
  const [viewsCfg, setViewsCfg] = useState(readViewsCfg);
  // Vues remises au menu depuis Parametres : ce ne sont pas des vues
  // principales, elles ont donc leur propre section plutot que d'etre
  // melangees a MAISON, ou rien ne les distinguait.
  const secondaires = HIDDEN_VIEWS().filter(h => permis(h.vid) && viewsCfg.shown.has(h.vid) && isViewAvailable(avail, h.vid))
    .sort((x, y) => { const o = viewsCfg.order || []; const i = o.indexOf(x.vid), j = o.indexOf(y.vid); return (i < 0 ? 999 : i) - (j < 0 ? 999 : j); });
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
      <div className="o-side-text" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'var(--o-text3)', padding: g.group === 'MAISON' ? '8px 8px 5px' : '12px 8px 5px' }}>{tr(g.group)}</div>
      {g.items.filter(it => permis(LABEL_VIEW[it.label]) && !viewsCfg.hidden.has(LABEL_VIEW[it.label]) && isViewAvailable(avail, LABEL_VIEW[it.label]))
        .sort(g.reglages ? () => 0 : (a, b) => iOrdre(LABEL_VIEW[a.label]) - iOrdre(LABEL_VIEW[b.label]))
        .map(it => {
        const vid = LABEL_VIEW[it.label];
        const active = vid === view || (vid === 'pieces' && view.indexOf('room:') === 0);
        const built = BUILT.has(vid);
        return (
          /* `aria-current="page"` (plan M7) : la vue ouverte se signalait par
           * une graisse et une pastille qui glisse — rien qu'un lecteur
           * d'écran puisse dire. Le mode édition portait déjà `aria-pressed` ;
           * la navigation n'avait rien. */
          <div key={it.label} className="o-nav-item" aria-label={tr(it.label)} aria-current={active ? 'page' : undefined} data-active={active ? '1' : undefined} role="button" tabIndex={built ? 0 : -1} onClick={built ? () => onNav(vid) : undefined} onKeyDown={built ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNav(vid); } } : undefined} style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '9px 8px 9px 13px', borderRadius: 10, fontSize: 13, cursor: built ? 'pointer' : 'default', transition: 'color .25s, font-weight .25s', ...(active ? { fontWeight: 700 } : { color: 'var(--o-text1)', fontWeight: 600 }) }}>
            {it.svg}<span className="o-side-text">{tr(it.label)}</span>
          </div>
        );
      })}
    </div>
  );
  return (
    <>
    {/* Hors écran, le tiroir sort AUSSI du parcours (audit du 27/09).
      * Au tactile, `is-closed` le pousse par `transform: translateX(-100%)` —
      * il reste donc `display: flex`, visible pour le navigateur, et ses onze
      * boutons restaient tabulables et lisibles par un lecteur d'écran, à
      * l'aveugle. Sur ORDINATEUR, `is-closed` n'est qu'un rail de 72 px, bien
      * visible et bien utile : on n'y touche pas.
      *
      * `inert` en chaîne vide : React 18 ne le connaît pas comme booléen et
      * `inert={true}` écrirait `inert="true"` avec un avertissement. */}
    <aside ref={navRef} className={'loggia-aside ' + (open ? 'is-open' : 'is-closed')}
      inert={tactile && !open ? '' : undefined} style={{ width: 264, flexShrink: 0, position: 'sticky', top: 0, alignSelf: 'flex-start', height: '100vh', overflowY: 'auto', background: 'linear-gradient(180deg,var(--o-side1),var(--o-side2))', borderRight: 'var(--o-bw,1px) solid var(--o-bd3)', padding: 'calc(18px + var(--o-safe-top,0px)) 12px 18px', display: 'flex', flexDirection: 'column' }}>
      {pill && <div aria-hidden="true" className="o-navpill" style={{ position: 'absolute', left: 12, right: 12, top: 0, height: pill.h, transform: `translateY(${pill.top}px)`, borderRadius: 10, background: 'rgba(var(--o-accent-rgb),.14)', pointerEvents: 'none', zIndex: 0 }}><span style={{ position: 'absolute', left: 0, top: 9, bottom: 9, width: 3, borderRadius: 4, background: 'var(--o-accent-fond)' }} /></div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 8px 14px' }}>
        {/* Le logo du projet. C'etait un « O » sur un degrade — le O d'Orion,
            reste apres le renommage. Servi depuis le meme dossier que le reste
            du frontend, donc sans requete vers l'exterieur. */}
        <img src="./logo.png" alt="" width={38} height={38} style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'block' }} />
        <div className="o-side-text" style={{ lineHeight: 1.15 }}><div style={{ fontSize: 15, fontWeight: 800 }}>Loggia</div><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: !ha ? 'var(--o-text3)' : !ha.online ? 'var(--o-bad)' : 'var(--o-ok)' }}>{ha ? (ha.online ? ha.devCount + ' ' + tr('APPAREILS EN LIGNE') : tr('HORS LIGNE')) : tr('CONNEXION…')}</div></div>
      </div>
      {/* Les vues passent avant les reglages : « Système » et « Paramètres »
          ferment la liste, comme tout ce qui ne sert pas au quotidien. */}
      {NAV.filter(g => !g.reglages).map(groupeNav)}
      {secondaires.length > 0 && (
        <div>
          <div className="o-side-text" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'var(--o-text3)', padding: '12px 8px 5px' }}>{tr('VUES SECONDAIRES')}</div>
          {secondaires.map(h => {
            const active = h.vid === view;
            return (
              <div key={h.vid} className="o-nav-item" aria-label={tr(h.label)} aria-current={active ? 'page' : undefined} data-active={active ? '1' : undefined} role="button" tabIndex={0} onClick={() => onNav(h.vid)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNav(h.vid); } }} style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '9px 8px 9px 13px', borderRadius: 10, fontSize: 13, cursor: 'pointer', transition: 'color .25s, font-weight .25s', ...(active ? { fontWeight: 700 } : { color: 'var(--o-text1)', fontWeight: 600 }) }}>
                <Fi i={h.icon} color={h.c} /><span className="o-side-text">{h.label}</span>
              </div>
            );
          })}
        </div>
      )}
      {customViews.filter(cv => permis('cv:' + cv.id)).length > 0 && (
        <div>
          <div className="o-side-text" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'var(--o-text3)', padding: '12px 8px 5px' }}>{tr('MES VUES')}</div>
          {customViews.filter(cv => permis('cv:' + cv.id)).map(cv => {
            const vid = 'cv:' + cv.id;
            const active = vid === view;
            return (
              <div key={cv.id} className="o-nav-item" aria-label={cv.name} aria-current={active ? 'page' : undefined} data-active={active ? '1' : undefined} role="button" tabIndex={0} onClick={() => onNav(vid)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNav(vid); } }} style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '9px 8px 9px 13px', borderRadius: 10, fontSize: 13, cursor: 'pointer', transition: 'color .25s', ...(active ? { fontWeight: 700 } : { color: 'var(--o-text1)', fontWeight: 600 }) }}>
                <Fi i={cv.icon || 'sparkles'} color="var(--o-accent-soft)" /><span className="o-side-text">{cv.name}</span>
              </div>
            );
          })}
        </div>
      )}
      {NAV.filter(g => g.reglages).map(groupeNav)}
      {/* Le bas du rail pousse vers le bas : la liste respire, l'état et
        * l'identité se posent au pied. */}
      <div style={{ flex: 1, minHeight: 10 }} />
      {/* MODE ÉDITION : AU-DESSUS du trait, comme avant — « redescends le bouton
        * édition où il était », puis « passe-le au-dessus de la ligne
        * séparateur » (01/10). La maquette 1a le faisait monter dans la liste ;
        * essayé, et il y laissait un grand vide sous lui, la liste étant plus
        * courte que le rail.
        *
        * Une marge basse de 14, pour ne pas venir se poser SUR le trait — le
        * même retour que le 25/09, au même endroit.
        *
        * NI bordure NI fond : il n'en avait plus depuis qu'il était passé dans
        * la liste, et les lui rendre n'avait été demandé par personne — « je te
        * l'ai pas demandé, juste de redescendre le bouton ». Il se lit comme une
        * ligne de menu, et son mot change quand il est actif.
        *
        * Le crayon du bandeau du haut n'existe pas quand ce bandeau est masqué
        * (aperçu tactile) : c'est la seule porte qui reste.
        *
        * SON NOM, rail replié (audit du 03/10) : sur ordinateur, `is-closed`
        * passe `.o-side-text` en `display: none` — le mot sort de l'arbre
        * d'accessibilité, et le crayon est `aria-hidden`. Il restait « bouton
        * bascule, enfoncé », sans dire quoi ; les entrées de la liste, elles,
        * portaient déjà leur `aria-label`. L'étiquette ne se pose QUE replié :
        * déplié, le nom vient du mot affiché, et une étiquette fixe le
        * contredirait quand il devient « Quitter l’édition » — qui le dit à voix
        * haute (commande vocale) ne trouverait plus le bouton. Replié, rien ne
        * s'affiche : « Mode édition » et `aria-pressed` disent le mode ET son
        * état. */}
      {onToggleEdit && (
        <button onClick={onToggleEdit} aria-label={open ? undefined : tr('Mode édition')} aria-pressed={editMode}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', marginBottom: 14, borderRadius: 16, cursor: 'pointer', fontSize: 13, fontWeight: editMode ? 700 : 600, border: 'none', background: 'transparent', color: editMode ? 'var(--o-accent-soft)' : 'var(--o-text1)', textAlign: 'left', fontFamily: 'inherit' }}>
          <Fi i="pencil" color={editMode ? 'var(--o-accent-soft)' : undefined} /><span className="o-side-text">{editMode ? tr('Quitter l’édition') : tr('Mode édition')}</span>
        </button>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 14, borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 16, background: `rgba(${ha ? ha.alarmRgb : 'var(--o-text3-rgb)'},.16)` }}><svg width="16" height="16" viewBox="0 0 24 24" fill={`rgb(${ha ? ha.alarmRgb : 'var(--o-text3-rgb)'})`}><path d="M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5z" /></svg><span className="o-side-text" style={{ fontSize: 12, fontWeight: 700, color: `rgb(${ha ? ha.alarmRgb : 'var(--o-text3-rgb)'})` }}><FlipText text={ha ? ha.alarmTxt : tr('Alarme') + ' · …'} /></span></div>
        {/* LA CARTE COMPTE (maquette 1a), au tactile seulement : l'identité et
          * la cloche dans un seul bloc, parce que les notifications
          * s'adressent à CELUI qui est connecté. Elles avaient une ligne à
          * elles, vide de sens ; sur la pastille, leur nombre en a un.
          *
          * DEUX boutons voisins, et non une carte avec une zone cachée à
          * droite : ouvrir son profil et ouvrir ses notifications sont deux
          * destinations, et chacune garde sa cible au doigt (44 px). */}
        {tactile && (users.length > 0 || notifs.length > 0) ? (
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, padding: 6, borderRadius: 18, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
            <button onClick={() => setProfilsOuverts(true)} aria-haspopup="dialog"
              aria-label={nomProfil(profilActif.name) + ' · ' + (!ha ? tr('Connexion…') : !ha.online ? tr('Home Assistant · Hors ligne') : tr('Home Assistant · En ligne'))}
              style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: 6, minHeight: 44, borderRadius: 13, border: 'none', background: 'transparent', color: 'var(--o-text)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              <span style={{ width: 32, height: 32, borderRadius: '50%', background: userBg(profilActif), flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>{(nomProfil(profilActif.name) || '?').charAt(0).toUpperCase()}</span>
              <span className="o-side-text" style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomProfil(profilActif.name)}</span>
                {/* « Home Assistant · En ligne » se coupait en deux dans la
                  * largeur du tiroir, et le mot cassait au milieu. La phrase
                  * entière reste dans l'étiquette du bouton, pour qui écoute ;
                  * à l'œil, deux mots suffisent — cette carte EST le compte, et
                  * la seule liaison qu'elle puisse décrire est celle-là. Le
                  * point ne porte donc pas l'information tout seul. */}
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: ha && !ha.online ? 'var(--o-bad)' : 'var(--o-text3)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: !ha ? 'var(--o-text3)' : !ha.online ? 'var(--o-bad)' : 'var(--o-ok)' }} />
                  {!ha ? tr('Connexion…') : !ha.online ? tr('Hors ligne') : tr('En ligne')}
                </span>
              </span>
            </button>
            {/* Le nombre des NON LUES, celui de la pastille, et ses deux
              * gabarits nus (audit du 03/10) : voir la cloche du bandeau. */}
            <button onClick={() => { setNotifsOuvertes(true); marquerVues(); }} aria-haspopup="dialog"
              aria-label={tr('Notifications') + (nonVues ? ' · ' + trN(nbNonVues, '{n} non lue', '{n} non lues') : '')}
              style={{ width: 44, minHeight: 44, flexShrink: 0, borderRadius: 14, border: 'none', background: 'var(--o-s2)', color: 'var(--o-text1)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <Fi i="bell" size={15} />
              {nonVues && (
                <span aria-hidden="true" style={{ position: 'absolute', top: 5, right: 5, minWidth: 15, height: 15, padding: '0 4px', borderRadius: 8, background: 'var(--o-bad)', color: '#fff', fontSize: 9.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{nbNonVues > 9 ? '9+' : nbNonVues}</span>
              )}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 0' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: !ha ? 'var(--o-text3)' : !ha.online ? 'var(--o-bad)' : 'var(--o-ok)', boxShadow: !ha ? 'none' : !ha.online ? '0 0 7px var(--o-bad)' : '0 0 7px var(--o-ok)', animation: ha && !ha.online ? 'pulse 1.2s infinite' : 'none' }} /><div className="o-side-text" style={{ lineHeight: 1.2 }}><div style={{ fontSize: 12, fontWeight: 700, color: ha && !ha.online ? 'var(--o-bad)' : undefined }}>{!ha ? tr('Connexion…') : !ha.online ? tr('Home Assistant · Hors ligne') : tr('Home Assistant · En ligne')}</div><div style={{ fontSize: 11, color: 'var(--o-text3)', fontWeight: 600 }}>{haHost()}</div></div></div>
        )}
      </div>
    </aside>
    {/* HORS de l'aside : son `transform` (le tiroir qui glisse) en ferait le
      * bloc conteneur du `position: fixed` de la feuille, et son
      * `overflow-y: auto` la découperait — même piège que le bandeau du haut,
      * quelques centaines de lignes plus bas. */}
    {profilsOuverts && (
      <FeuilleProfils users={users} userIdx={userIdx} onSwitchUser={onSwitchUser}
        onGerer={() => onNav && onNav('parametres')} onClose={() => setProfilsOuverts(false)} />
    )}
    {notifsOuvertes && <FeuilleNotifications notifs={notifs} onClose={() => setNotifsOuvertes(false)} />}
    </>
  );
}

export { Sidebar };
