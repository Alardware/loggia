/* ── La carte et la popup de la litière et de la fontaine (chantier du 20/11, A12 ; ADR 0386) ──
 *
 * Chargées à la demande par la coquille (`cartes/compose.jsx`) : une maison sans animal n'en télécharge rien. La logique
 * (phrases, chiffres, plaques) est dans `animauxvue.js` ; ici on ne fait qu'afficher.
 *
 * LA CARTE, le gabarit de la borne (`carteborne.jsx`) : large (184) — la plaque en haut, le chiffre nommé à droite (les passages
 * du jour d'une litière, le filtre d'une fontaine), le nom et la phrase dessous ; étroite : la plaque et le chiffre en haut ;
 * compacte (88) : la plaque, le nom, la phrase, le chiffre à droite. Muette, la plaque grise et « Indisponible depuis 14:20 »
 * en rouge (la règle de la lumière).
 *
 * LA POPUP, une feuille SANS onglets, à la hauteur de son contenu, UNE croix (`EnteteFiche`) : la tête dit la phrase, un panneau
 * liste ce que l'appareil sait — une rangée sans entité ne s'affiche pas —, la fontaine ajoute sa pompe en bascule et « Filtre
 * remplacé » en deux appuis ; en pied, « L'appareil » ouvre la fiche universelle. La litière ne commande rien.
 */
import { Fragment } from 'react';
import { Fi, Surface, nomCarte } from './ui.jsx';
import { tr } from './i18n.js';
import { quandLumiere } from './lumieres.js';
import { LISERE } from './styles.js';
import { commanderService } from './actions.js';
import { useOptimiste } from './optimiste.js';
import { EnteteFiche, BoutonConfirme, PETITES_CAPITALES, filet } from './fichecommune.jsx';
import { RM_CARD_HAUT, RM_GAUCHE, RM_ICO, RM_MILIEU, RM_NAME, RM_SUB, RmBascule } from './cartes/briques.jsx';
import { ChiffreNomme, ChiffreNommeHaut } from './cartes/robot.jsx';
import { SURF_CARTE, lavisCarte } from './app/noyau.jsx';
import { nomZoneDe } from './state.js';
import { nomGenre } from './composes.js';
import { vueAnimal } from './animauxvue.js';

const Sans = ({ children }) => children;
// La teinte du fond de la carte : le rouge d'un bac à vider, l'ambre de ce qui manque, le vert du travail ; sinon, au repos.
const TEINTES = { plein: 'var(--o-bad-rgb)', bas: 'var(--o-warn-rgb)', remplir: 'var(--o-warn-rgb)', filtre: 'var(--o-warn-rgb)', travail: 'var(--o-ok-rgb)' };

export function CarteAnimal({ c, hass, nom = null, chip = false, onOpen = null, Glyphe = Sans }) {
  const S = (hass && hass.states) || {};
  const vue = vueAnimal({ c, S, nom });
  if (!vue) return null;
  /* Muette : « Indisponible depuis 14:20 », en rouge — depuis que la DERNIÈRE de ses entités s'est tue ; sans heure lisible,
   * « Indisponible ». La carte seule : la popup garde ce que `vueAnimal` lui dit. */
  const tues = vue.mort ? vue.ids.map(x => (S[x] ? Date.parse(S[x].last_changed || '') : NaN)).filter(Number.isFinite) : [];
  const depuis = tues.length ? quandLumiere(Math.max(...tues)) : null;
  const v = vue.mort ? { ...vue, phrase: { texte: depuis ? tr('Indisponible depuis {h}', { h: depuis }) : tr('Indisponible'), encre: 'var(--o-bad)' } } : vue;
  const [fond, encre] = v.plaque;
  const ch = v.chiffre;
  const label = nomCarte(v.nom, v.phrase.texte, ch ? ch.nom + ' ' + ch.v + (ch.u ? ' ' + ch.u : '') : null);
  const fondCarte = TEINTES[v.etat] ? lavisCarte(TEINTES[v.etat], .12, .03) : SURF_CARTE;
  const plaque = (style, taille) => <span className={chip ? 'o-cvico' : undefined} style={style}><Glyphe id={v.ancre} size={taille}><Fi i={v.icone} size={taille} /></Glyphe></span>;
  if (chip) {
    return (
      <div className={'o-piece o-cvdense' + (v.mort ? ' o-panne' : '')}
        style={{ position: 'relative', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 14px', borderRadius: 'var(--o-radius,18px)', cursor: onOpen ? 'pointer' : 'default', background: fondCarte, border: LISERE, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', transition: 'all .25s' }}>
        {onOpen && <Surface onClick={onOpen} label={label} />}
        <div className="o-cvrow" style={{ display: 'flex', alignItems: 'center' }}>
          {plaque({ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: fond, color: encre }, 15)}
          <div className="o-cvtxt">
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.nom}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: v.phrase.encre, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.phrase.texte}</div>
          </div>
          {ch && <span className="o-cvmesure" style={{ fontSize: 13, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'var(--o-text)' }}>{ch.v}{ch.u ? ' ' + ch.u : ''}</span>}
        </div>
      </div>
    );
  }
  return (
    <div className={'o-rmcard o-gabarit' + (v.mort ? ' o-panne' : '')} data-animal=""
      style={{ ...RM_CARD_HAUT, position: 'relative', cursor: onOpen ? 'pointer' : 'default', background: fondCarte, border: LISERE }}>
      {onOpen && <Surface onClick={onOpen} label={label} />}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        {plaque(RM_ICO(fond, encre), 17)}
        {ch && <ChiffreNommeHaut v={ch.v} u={ch.u} nom={ch.nom} />}
      </div>
      <div style={RM_MILIEU}>
        <div style={RM_GAUCHE}>
          <div className="o-gab-nom" style={{ ...RM_NAME, fontSize: 15 }}>{v.nom}</div>
          <div className="o-gab-phrase" style={{ ...RM_SUB, color: v.phrase.encre, '--o-n': Math.max(1, v.phrase.texte.length) }}>{v.phrase.texte}</div>
        </div>
        {ch && <ChiffreNomme v={ch.v} u={ch.u} nom={ch.nom} />}
      </div>
    </div>
  );
}

const PANNEAU = { marginTop: 12, borderRadius: 18, background: 'var(--o-s3)', border: LISERE, overflow: 'hidden' };
const RANGEE = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px' };
const VALEUR = { fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', textAlign: 'right', minWidth: 0 };

/** Une rangée du panneau : le libellé à gauche, ce qu'elle dit (un texte, ou un composant) à droite. */
const Rangee = ({ i, libelle, children, ...reste }) => (
  <div {...reste} style={{ ...RANGEE, borderTop: filet(i) }}>
    <span style={{ ...PETITES_CAPITALES, flexShrink: 0 }}>{libelle}</span>
    {children}
  </div>
);
const Valeur = ({ v }) => <span style={{ ...VALEUR, color: v.encre }}>{v.texte}</span>;

export function FicheAnimal({ c, hass, nom = null, onFiche = null, Glyphe = null }) {
  const S = (hass && hass.states) || {};
  const v = vueAnimal({ c, S, nom });
  // La pompe : l'avance de l'appui se voit tout de suite (`useOptimiste`) et tombe si Home Assistant refuse.
  const pompe = v && v.fiche.pompe;
  const [ovPompe, poserPompe] = useOptimiste(pompe ? pompe.on : null);
  if (!v) return null;
  const f = v.fiche;
  const zone = nomZoneDe(v.ancre);
  const genre = nomGenre(v.genre);
  const marche = pompe ? (ovPompe != null ? ovPompe : pompe.on) : null;
  const basculer = () => {
    poserPompe(!marche);
    commanderService(hass, pompe.id, 'switch', marche ? 'turn_off' : 'turn_on', { entity_id: pompe.id }, () => poserPompe(null));
  };
  const rangees = v.genre === 'litiere'
    ? [
      f.etat && { cle: 'etat', libelle: tr('État'), contenu: <Valeur v={f.etat} /> },
      f.bac && { cle: 'bac', libelle: tr('Bac'), contenu: <Valeur v={f.bac} /> },
      f.sable && { cle: 'sable', libelle: tr('Sable'), contenu: <Valeur v={f.sable} /> },
      f.passages && { cle: 'passages', libelle: tr('Passages du jour'), contenu: <Valeur v={{ texte: f.passages.texte, encre: 'var(--o-text)' }} /> },
    ]
    : [
      f.niveau && { cle: 'eau', libelle: tr('Eau'), contenu: <Valeur v={f.niveau} /> },
      f.filtre && { cle: 'filtre', libelle: tr('Filtre'), contenu: <Valeur v={f.filtre} /> },
      pompe && { cle: 'pompe', libelle: tr('Pompe'), contenu: <RmBascule on={marche} nom={tr('Pompe')} onToggle={basculer} /> },
      f.remise && { cle: 'remise', libelle: tr('Filtre remplacé'), contenu: <BoutonConfirme libelle={tr('Remplacé')} nom={tr('Filtre remplacé')} onConfirme={() => commanderService(hass, f.remise, 'button', 'press', { entity_id: f.remise })} /> },
    ];
  const lignes = rangees.filter(Boolean);
  const detail = v.genre === 'litiere' && f.passages ? f.passages.detail : [];
  const fond = v.etat === 'travail' ? 'rgba(var(--o-ok-rgb),.08)' : v.etat === 'plein' ? 'rgba(var(--o-bad-rgb),.08)' : 'var(--o-s3)';
  return (
    <div>
      <EnteteFiche nom={v.nom}
        plaque={{ fond: v.plaque[0], encre: v.plaque[1], icone: v.icone, glyphe: Glyphe ? <Glyphe id={v.ancre} size={18}><Fi i={v.icone} size={18} /></Glyphe> : null }}
        sousNom={zone ? zone + ' · ' + genre : genre} />
      <div data-tete="" style={{ marginTop: 18, padding: 18, borderRadius: 18, background: fond, border: LISERE }}>
        <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, color: v.mort ? 'var(--o-text3)' : v.phrase.encre === 'var(--o-text2)' ? 'var(--o-text)' : v.phrase.encre }}>{v.phrase.texte || '—'}</div>
        {v.chiffre && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6 }}>{tr('{a} : {b}', { a: v.chiffre.nom, b: v.chiffre.v + (v.chiffre.u ? ' ' + v.chiffre.u : '') })}</div>}
      </div>
      {lignes.length > 0 && (
        <div data-lignes="" style={PANNEAU}>
          {lignes.map((l, i) => (
            <Fragment key={l.cle}>
              <Rangee i={i} libelle={l.libelle} data-rangee={l.cle}>{l.contenu}</Rangee>
              {l.cle === 'passages' && detail.map(d => (
                <div key={d.id} data-chat="" style={{ ...RANGEE, padding: '6px 16px 6px 28px', borderTop: filet(0) }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nom}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--o-text2)' }}>{d.n}</span>
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      )}
      {onFiche && v.ancre && (
        <button type="button" onClick={() => onFiche(v.ancre)} style={{ ...PANNEAU, ...RANGEE, width: '100%', cursor: 'pointer', color: 'var(--o-text)', fontFamily: 'inherit', textAlign: 'left' }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{tr('L’appareil')}</span><Fi i="angle-small-right" size={14} />
        </button>
      )}
    </div>
  );
}
