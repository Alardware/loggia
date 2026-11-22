/* ── La carte et la fiche de la voiture (chantier du 20/11, A11 ; ADR 0386) ──
 *
 * Chargées à la demande (`CarteVoiture`, `FicheVoiture` ; cartes/compose.jsx) : une maison sans voiture n'en télécharge rien.
 *
 *  - LA CARTE LARGE (184), le gabarit des cartes IoT : la plaque en haut, le pourcentage NOMMÉ à droite (« Batterie » ou
 *    « Carburant »), le nom 15 px SOUS la plaque, la phrase dessous (« En charge · 312 km », « Verrouillée · 312 km »,
 *    « Ouverte »). La carte étroite montre le pourcentage en haut, comme les autres ;
 *  - LA COMPACTE (88) : la plaque, le nom, la phrase, le pourcentage à droite ;
 *  - muette : la plaque grise, la phrase « Indisponible depuis 14:20 » en rouge, comme la borne.
 * La fiche : une feuille SANS onglets, UNE croix (l'en-tête commun), la position en sous-nom, puis des rangées — celles dont
 * l'entité existe. AUCUNE commande, sauf « Verrouiller » quand elle est déverrouillée et que son verrou se pilote : verrouiller
 * ne laisse entrer personne. Jamais déverrouiller, klaxon, clim ni charge. En pied, « L'appareil » : la fiche universelle.
 */
import { Fi, Surface, nomCarte } from './ui.jsx';
import { tr } from './i18n.js';
import { quandLumiere } from './lumieres.js';
import { LISERE } from './styles.js';
import { RM_CARD_HAUT, RM_GAUCHE, RM_ICO, RM_MILIEU, RM_NAME, RM_SUB } from './cartes/briques.jsx';
import { ChiffreNomme, ChiffreNommeHaut } from './cartes/robot.jsx';
import { SURF_CARTE, lavisCarte } from './app/noyau.jsx';
import { commanderService } from './actions.js';
import { couleurPile } from './attention.js';
import { entitesCompose } from './composes.js';
import { EnteteFiche, LIGNE, filet } from './fichecommune.jsx';
import { vueVoiture, idPrincipal } from './voiturevue.js';

const Sans = ({ children }) => children;
const ICONE = 'car-side';
const PANNEAU = { marginTop: 12, borderRadius: 18, background: 'var(--o-s3)', border: LISERE, overflow: 'hidden' };
const DOUX = { height: 40, padding: '0 14px', borderRadius: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0, background: 'var(--o-s1)', color: 'var(--o-text1)' };

/** La couleur du pourcentage : la règle des piles pour la batterie, le texte pour le carburant (aucun seuil deviné). */
const couleurChiffre = (ch) => (ch && ch.batterie && ch.u === '%' ? couleurPile(ch.pct, 'var(--o-text)') : 'var(--o-text)');

export function CarteVoiture({ c, hass, nom = null, chip = false, onOpen = null, Glyphe = Sans }) {
  const S = (hass && hass.states) || {};
  const vue = vueVoiture({ c, S, nom });
  if (!vue) return null;
  /* Muette : « Indisponible depuis 14:20 », en rouge — depuis que la DERNIÈRE de ses entités s'est tue (la règle de la lumière) ;
   * sans heure lisible, « Indisponible ». */
  const tues = vue.mort ? entitesCompose(c).map(x => (S[x] ? Date.parse(S[x].last_changed || '') : NaN)).filter(Number.isFinite) : [];
  const depuis = tues.length ? quandLumiere(Math.max(...tues)) : null;
  const v = vue.mort ? { ...vue, phrase: { texte: depuis ? tr('Indisponible depuis {h}', { h: depuis }) : tr('Indisponible'), encre: 'var(--o-bad)' } } : vue;
  const id = idPrincipal(c);
  const [fond, encre] = v.plaque;
  const ch = v.chiffre;
  const label = nomCarte(v.nom, v.phrase.texte, ch ? ch.v + ' ' + ch.u + ' ' + ch.nom : null);
  const fondCarte = v.etat === 'charge' ? lavisCarte('var(--o-ok-rgb)', .12, .03) : SURF_CARTE;
  const plaque = (style, taille) => <span className={chip ? 'o-cvico' : undefined} style={style}><Glyphe id={id} size={taille}><Fi i={ICONE} size={taille} /></Glyphe></span>;
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
          {ch && <span className="o-cvmesure" style={{ fontSize: 13, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: couleurChiffre(ch) }}>{ch.v}{ch.u ? ' ' + ch.u : ''}</span>}
        </div>
      </div>
    );
  }
  return (
    <div className={'o-rmcard o-gabarit' + (v.mort ? ' o-panne' : '')} data-voiture=""
      style={{ ...RM_CARD_HAUT, position: 'relative', cursor: onOpen ? 'pointer' : 'default', background: fondCarte, border: LISERE }}>
      {onOpen && <Surface onClick={onOpen} label={label} />}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        {plaque(RM_ICO(fond, encre), 17)}
        {ch && <ChiffreNommeHaut v={ch.v} u={ch.u} nom={ch.nom} couleur={couleurChiffre(ch)} />}
      </div>
      {/* Le nom sous la plaque, comme sur toutes les cartes (`RM_MILIEU`) ; sa colonne reste en haut (`RM_GAUCHE`). */}
      <div style={RM_MILIEU}>
        <div style={RM_GAUCHE}>
          <div className="o-gab-nom" style={{ ...RM_NAME, fontSize: 15 }}>{v.nom}</div>
          <div className="o-gab-phrase" style={{ ...RM_SUB, color: v.phrase.encre, '--o-n': Math.max(1, v.phrase.texte.length) }}>{v.phrase.texte}</div>
        </div>
        {ch && <ChiffreNomme v={ch.v} u={ch.u} nom={ch.nom} couleur={couleurChiffre(ch)} />}
      </div>
    </div>
  );
}

/** Une valeur et son unité, en 15 px / 800. */
const Valeur = ({ valeur, unite, encre }) => (
  <span style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: encre || 'var(--o-text)' }}>
    {valeur}{unite ? <span style={{ fontSize: 12, fontWeight: 700, color: encre || 'var(--o-text2)', marginLeft: 4 }}>{unite}</span> : null}
  </span>
);

export function FicheVoiture({ c, hass, nom = null, onFiche = null, Glyphe = null }) {
  const S = (hass && hass.states) || {};
  const v = vueVoiture({ c, S, nom });
  if (!v) return null;
  const id = idPrincipal(c);
  const verrouiller = (cible) => commanderService(hass, cible, 'lock', 'lock', { entity_id: cible });
  return (
    <div>
      <EnteteFiche nom={v.nom} panne={v.mort ? v.phrase.texte : null}
        plaque={{ fond: v.plaque[0], encre: v.plaque[1], icone: ICONE, glyphe: Glyphe ? <Glyphe id={id} size={18}><Fi i={ICONE} size={18} /></Glyphe> : null }}
        sousNom={v.position} />
      {v.lignes.length > 0 && (
        <div data-lignes="" style={PANNEAU}>
          {v.lignes.map((l, i) => (
            <div key={l.cle} data-ligne={l.cle} style={{ ...LIGNE, borderTop: filet(i), alignItems: l.items ? 'flex-start' : 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 700, minWidth: 0, overflowWrap: 'break-word' }}>{l.titre}</span>
              {l.items ? (
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, minWidth: 0 }}>
                  {l.items.map(p => (
                    <span key={p.id} data-pneu={p.bas ? 'bas' : ''} style={{ display: 'flex', alignItems: 'baseline', gap: 10, justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: p.bas ? 'var(--o-warn)' : 'var(--o-text2)', overflowWrap: 'break-word', textAlign: 'right' }}>{p.nom}</span>
                      {p.valeur != null && <Valeur valeur={p.valeur} unite={p.unite} encre={p.bas ? 'var(--o-warn)' : null} />}
                    </span>
                  ))}
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, justifyContent: 'flex-end' }}>
                  {l.verrouiller && (
                    <button type="button" style={DOUX} aria-label={tr('Verrouiller') + ' ' + v.nom} onClick={() => verrouiller(l.verrouiller)}>
                      <Fi i="lock" size={13} />{tr('Verrouiller')}
                    </button>
                  )}
                  <Valeur valeur={l.valeur} unite={l.unite} encre={l.encre} />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {onFiche && id && (
        <button type="button" onClick={() => onFiche(id)} style={{ ...PANNEAU, ...LIGNE, width: '100%', cursor: 'pointer', color: 'var(--o-text)', fontFamily: 'inherit', textAlign: 'left' }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{tr('L’appareil')}</span><Fi i="angle-small-right" size={14} />
        </button>
      )}
    </div>
  );
}
