/* La vue Volets (modes et planning).
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { Suspense } from 'react';
import { lazyRecharge } from '../recharge.js';
import { voletMode, voletDays } from '../lectures.js';
import { estVolet } from '../voletecran.js';
import { envoyerGeste } from '../cartes/volet.jsx';
import { useDomainCards } from '../appareils/fiches.jsx';
import { voletCovers } from '../app/decouverte.jsx';
import { useLayoutEditor } from '../edition/disposition.jsx';
import { Header } from '../chrome/entete.jsx';
import { BandeauEdition, CarteAjout, EditableCard } from '../edition/briques.jsx';
import { CardEditSheet, ComposeurCartes } from '../edition/coquilles.jsx';

// Fond adaptatif de la bannière selon la météo : teinte colorée par-dessus la surface du thème (reste lisible en clair ET sombre).


/**
 * Presentation des vues metier : en-tete, carte a lignes denses.
 *
 * Patron Atrium, exige par le user : un titre, une accroche, une pastille
 * d'etat, puis des lignes « libelle / contexte / valeur ». Jamais d'onglets
 * sur une vue metier.
 */
function ViewHead({ titre, sous, badge, rgb = 'var(--o-ok-rgb)' }) {
  return (
    <div className="o-obj-head" style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{titre}</h1>
        {sous && <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>{sous}</div>}
      </div>
      <span style={{ flex: 1 }} />
      {badge && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
          background: `rgba(${rgb},.14)`, color: `rgb(${rgb})` }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: `rgb(${rgb})` }} />{String(badge).toUpperCase()}
        </span>
      )}
    </div>
  );
}
/** Barre de reglages rapides, exactement celle de Securite. */
/* La barre d'une vue ne porte plus que ses CONTRÔLES. Les panneaux de synthèse
 * repliables et leur bouton « Réglages de la vue » ont disparu (retour 02/09) :
 * ils redisaient ce que les cartes montrent déjà et coûtaient une pleine
 * hauteur d'écran sur mobile. */
function ViewBar({ children }) {
  return (
    <div className="o-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,18px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
      {children}
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
const barBtn = (actif) => ({ padding: '5px 11px', borderRadius: 10, border: actif ? '1px solid transparent' : '1px solid var(--o-bd1)', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
  background: actif ? 'var(--o-accent-fond)' : 'transparent', color: actif ? '#fff' : 'var(--o-text2)' });

/* La vue Climat a disparu le 14/09/2026 : la vue Objets, filtre « Chauffage »,
 * dessine thermostats et zones aux cartes de la piece. La route `climat` y
 * mene ; la vue Volets, elle, reste. */

/* ════════════ VUE VOLETS (reproduction fidèle de "Loggia Volets.dc.html") ════════════ */
/* Les modes d'automatisme d'une INSTALLATION (son `input_select`) sont LUS SUR
 * L'ENTITE, comme ceux du chauffage : ils etaient ecrits en dur. Ils ne servent
 * qu'a la barre de la vue Volets, tant que le planning de Loggia dort ; allume,
 * la barre montre les modes de Loggia, que la fiche d'un volet choisit aussi
 * (Planning › Mode de la maison). */
function voletModes(S) {
  const id = voletMode();
  const st = S && id && S[id];
  const opts = st && st.attributes && st.attributes.options;
  if (!Array.isArray(opts)) return [];
  return opts.filter(o => typeof o === 'string' && o).map(o => ({ id: o, label: o }));
}
const voletKeys = () => [...voletCovers(null).map(c => c.haid), voletMode(), ...voletDays().map(d => d.haid)].filter(Boolean);
/* Ceux qu'un ordre GROUPÉ commande (V3, audit du 19/10) : des volets, par leur
 * classe — le miroir de `est_volet` au serveur. `voletCovers` prend tout le
 * domaine : un garage, un portail, un velux, un groupe sans classe y gardent
 * leur carte, mais « Ouvrir » ne les ouvre pas. */
function voletsCommandables(S) {
  return S ? voletCovers(S).filter(c => c && c.haid && estVolet(S[c.haid])) : [];
}
// Aides propres à une installation (mode d'automatisme, planning des nuits).
// Absentes ⇒ la vue n'affiche pas les réglages correspondants.

/* La vue « modes et planning » se charge à la demande (19/10 : elle faisait
 * dépasser au démarrage sa borne de poids) — src/views/voletsplan.jsx. Ses
 * dépendances internes lui sont posées au chargement, sous les mêmes noms. */
const VoletsContent = lazyRecharge(() => import('../views/voletsplan.jsx').then(m => {
  m.poserKit({ BandeauEdition, BarGroup, CardEditSheet, CarteAjout, ComposeurCartes, EditableCard, ViewBar, ViewHead, barBtn, envoyerGeste, useDomainCards, useLayoutEditor, voletCovers, voletModes, voletsCommandables });
  return { default: m.VoletsContent };
}));

function VoletsView({ hass, edit = false, onEnt }) {
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <Suspense fallback={<div className="loggia-content" style={{ padding: '26px 28px 56px' }} />}>
        <VoletsContent hass={hass} edit={edit} onEnt={onEnt} />
      </Suspense>
    </main>
  );
}

export { voletKeys, voletsCommandables, VoletsView };
