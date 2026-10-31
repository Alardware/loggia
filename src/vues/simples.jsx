/* Les vues chargées à la demande, posées sous leur en-tête : Énergie, Sécurité, Système, Paramètres ; et la vue indisponible.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { Suspense } from 'react';
import { lazyRecharge } from '../recharge.js';
import { Fi, LOOK_DEF } from '../ui.jsx';
import { tr } from '../i18n.js';
import { Header } from '../chrome/entete.jsx';

// Vue chargee a la demande : personne n'atterrit sur Meteo en ouvrant le
// dashboard, son code n'a donc pas a etre analyse au demarrage.
/* Systeme : on l'ouvre pour regarder l'etat des machines, pas au demarrage. */
const SystemeContent = lazyRecharge(() => import('../views/systeme.jsx'));
/* Énergie et Sécurité (ADR 0274) : deux vues qu'on ouvre d'un tap, sorties du
 * boot. Elles empruntent le reste au monolithe par `OUTILS_VUES`, posé en fin
 * de fichier. */
const EnergieContent = lazyRecharge(() => import('../views/energie.jsx').then(m => ({ default: m.EnergieContent })));
const SecuriteContent = lazyRecharge(() => import('../views/securite.jsx').then(m => ({ default: m.SecuriteContent })));
// Parametres : 1300 lignes ou l'on n'arrive que volontairement. Le formulaire
// d'entites vient du meme morceau — il ne s'ouvre qu'en mode edition.
const ParametresContent = lazyRecharge(() => import('../views/parametres.jsx').then(m => ({ default: m.ParametresContent })));
function EnergieView({ hass, edit = false, onEnt }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <Suspense fallback={<div className="loggia-content" style={{ padding: '26px 28px 56px' }} />}>
        <EnergieContent hass={hass} edit={edit} onEnt={onEnt} />
      </Suspense>
    </main>
  );
}

const VIEW_TITLES = {
  pieces: tr('Pièces'), scenes: tr('Scénarios'), objets: tr('Objets'), energie: tr('Énergie'),
  securite: tr('Sécurité'), systeme: tr('Système'), lumieres: tr('Lumières'), climat: tr('Climat'),
  volets: tr('Volets'), voletsplan: tr('Volets'), medias: tr('Médias'),
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
        <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,18px)', padding: '26px 24px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16, boxShadow: 'var(--o-shadow)' }}>
          <span style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--o-s1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Fi i="search-alt" size={19} color="var(--o-text3)" />
          </span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{tr('Cette vue reste vide')}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', marginTop: 5, maxWidth: 520, lineHeight: 1.5 }}>
              {/* Le motif est une CLÉ du catalogue (`views.js`) : il se traduit
                * ici, à l'affichage. Écrit tel quel, il restait en français dans
                * les sept langues (audit du 03/10). */}
              {tr(reason || 'aucune entité correspondante trouvée')}.
              {/* La section Entités des Paramètres n'existe plus (audit du
                  03/10) : chaque vue règle les siennes en mode édition. Une vue
                  bloquée ne monte pas son bandeau — on nomme donc celles dont la
                  fiche peut la débloquer : l'Accueil (énergie), Objets
                  (distributeur). */}
              {' '}{tr('Ajoutez les appareils concernés dans Home Assistant, ou désignez les entités à utiliser : sur l’Accueil ou dans Objets, en mode édition, bouton « Entités de la vue ». La vue réapparaîtra d’elle-même.')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => onNav('accueil')} style={{ padding: '9px 15px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: 'rgba(var(--o-accent-rgb),.16)', color: 'var(--o-accent-soft)' }}>{tr("Retour à l'accueil")}</button>
            <button onClick={() => onNav('parametres')} style={{ padding: '9px 15px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text2)' }}>{tr('Ouvrir les paramètres')}</button>
          </div>
        </div>
      </div>
    </main>
  );
}
function SecuriteView({ hass, edit = false, onEnt, onNav = null }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <Suspense fallback={<div className="loggia-content" style={{ padding: '26px 28px 56px' }} />}>
        <SecuriteContent hass={hass} edit={edit} onEnt={onEnt} onNav={onNav} />
      </Suspense>
    </main>
  );
}

/* ════════════ VUE SYSTÈME (reproduction fidèle de "Loggia Système.dc.html") ════════════ */
// Logos officiels des machines (source : dashboardicons.com / homarr-labs).
// Inlines en data-URI : le projet interdit tout appel CDN.


function SystemeView({ hass }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <Suspense fallback={<div className="loggia-content" style={{ padding: '26px 28px 56px' }} />}>
        <SystemeContent hass={hass} />
      </Suspense>
    </main>
  );
}

function ParametresView({ themeMode, loggiaTheme, haTheme, onMode, onPickTheme, onFollowHa, navbar, onToggleNavbar, wxFx, onToggleWxFx, ambient = 0, onAmbient, ambPlage = 'toujours', onAmbPlage, retourAcc = 0, onRetourAcc, cielEtoile, onToggleCiel, navMargin, navAuto, onNavOffset, onNavOffsetReset, onNavSet, onTopSet, look = LOOK_DEF, onLook, topMargin, topAuto, onTopOffset, onTopOffsetReset, hass, users, userIdx, isAdmin, droits = [], onAddUser, onUpdateUser, onDeleteUser, customViews, onSaveCustomViews, onNav = null }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <Suspense fallback={<div className="loggia-content" style={{ padding: '26px 28px 56px' }} />}>
      <ParametresContent droits={droits} onNavSet={onNavSet} onTopSet={onTopSet} look={look} onLook={onLook} wxFx={wxFx} onToggleWxFx={onToggleWxFx} ambient={ambient} onAmbient={onAmbient} ambPlage={ambPlage} onAmbPlage={onAmbPlage} retourAcc={retourAcc} onRetourAcc={onRetourAcc} themeMode={themeMode} loggiaTheme={loggiaTheme} haTheme={haTheme} onMode={onMode} onPickTheme={onPickTheme} onFollowHa={onFollowHa} navbar={navbar} onToggleNavbar={onToggleNavbar} navMargin={navMargin} navAuto={navAuto} onNavOffset={onNavOffset} onNavOffsetReset={onNavOffsetReset} topMargin={topMargin} topAuto={topAuto} onTopOffset={onTopOffset} onTopOffsetReset={onTopOffsetReset} hass={hass} users={users} userIdx={userIdx} isAdmin={isAdmin} onAddUser={onAddUser} onUpdateUser={onUpdateUser} onDeleteUser={onDeleteUser} customViews={customViews} onSaveCustomViews={onSaveCustomViews} onNav={onNav} />
      </Suspense>
    </main>
  );
}

export { EnergieView, ViewEmpty, SecuriteView, SystemeView, ParametresView };
