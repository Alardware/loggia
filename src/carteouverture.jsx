/* ── La TUILE d'une ouverture (ADR 0388 ; sa maquette « Ouvertures — tuiles » du 22/11) ─────────────
 *
 * Une porte, une fenêtre, un garage, un ouvrant sans nom : la carte d'un `binary_sensor` de ces classes, partout où elle se pose —
 * Sécurité, une pièce, les favoris, une vue à soi. `RoomGenericCard` la charge à la demande ; le démarrage n'en porte que l'adresse.
 *
 * Sa maquette, dans le gabarit de la maison (icône en haut à gauche, repère à droite, nom SOUS l'icône, 184 px) :
 *  - en haut à droite, la PILE : son glyphe et « 100 % », au gris doux, à la couleur de la veille sous son seuil ; muette, « — » ;
 *  - sous le nom, l'ÉTAT : ouverte, un point ambre qui pulse et « Ouverte depuis 4 min » en ambre ; fermée, « Fermée » au gris ;
 *    muette, « Indisponible » au rouge de la panne ;
 *  - dessous, l'HEURE : « ouverte à 17:21 », « depuis 09:12 », « Pile faible : à changer », « plus de signal depuis 16:55 » ;
 *  - en bas à droite, le DESSIN (dessinouverture.jsx), 56 × 70 ;
 *  - ouverte, la carte entière passe à l'ambre (sa règle : la couleur d'une maquette s'applique EN ENTIER) — le lavis en biais, le
 *    liseré, la plaque ; muette, elle s'éteint à 0,6 et garde le liseré qui respire (`o-panne`, ADR 0048).
 * L'heure vient de l'historique du jour (`useJournee`, une lecture par tuile, refaite quand elle change), jamais de
 * `last_changed` seul (ADR 0031).
 * Toucher la carte ouvre sa popup (ficheouverture.jsx) ; elle ne commande rien.
 */
import { useEffect, useState } from 'react';
import { Fi, Surface, nomCarte } from './ui.jsx';
import { tr } from './i18n.js';
import { LISERE } from './styles.js';
import { LAVIS, lav } from './theme.js';
import { RM_CARD_HAUT, RM_ICO, RM_NAME, RM_SOUS_PLAQUE } from './cartes/briques.jsx';
import { SURF_CARTE } from './app/noyau.jsx';
import { Ico } from './icones.jsx';
import { useJournee, minuitDe } from './journeelue.js';
import { couleurPile, niveauPile } from './attention.js';
import { glyphePile } from './piles.js';
import { vueTuileOuverture, dessinOuverture } from './ouverture.js';
import DessinOuverture from './dessinouverture.jsx';

/** La pile du coin : le glyphe à son niveau (15 px) et « 100 % » ; muette, « — ». Le clic file vers la surface : il ouvre la popup. */
function PileCoin({ n, muette }) {
  if (n == null && !muette) return null;
  const col = muette ? 'var(--o-text3)' : couleurPile(n, 'var(--o-text2)');
  return (
    <span title={muette ? undefined : tr('Pile') + ' ' + n + ' %'} style={{ position: 'relative', pointerEvents: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, fontSize: 12, fontWeight: 700, color: col, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      <Fi i={glyphePile(muette ? null : n)} size={15} />{muette ? '—' : n + ' %'}
    </span>
  );
}

/** `nom` : celui de la carte ; `ico` : son icône (choisie, sinon celle de sa famille) ; `pile` : le niveau de sa pile, ou null. */
export default function CarteOuverture({ id, hass, nom, ico = null, pile = null, onOpen = null }) {
  const S = (hass && hass.states) || {};
  const st = S[id] || null;
  const classe = ((st && st.attributes) || {}).device_class;
  // Relue quand la porte change : refermée, sa lecture du matin dirait encore « depuis 08:05 ».
  const jour = useJournee(hass, [id], st ? st.last_changed : null);
  const lu = jour && jour !== 'erreur' ? jour : null;
  const ouverte = !!(st && st.state === 'on');
  // « Ouverte depuis 4 min » vieillit sur place : un rendu par demi-minute tant qu'elle est ouverte.
  const [, setTic] = useState(0);
  useEffect(() => {
    if (!ouverte) return undefined;
    const iv = setInterval(() => setTic(x => x + 1), 30000);
    return () => clearInterval(iv);
  }, [ouverte]);
  const v = vueTuileOuverture({ st, etats: lu ? lu.etats[id] || [] : null, debut: lu ? lu.debut : minuitDe(Date.now()), faible: !ouverte && pile != null && niveauPile(pile) != null });
  const ouvrable = !!onOpen && !v.muet;
  // Ouverte, l'ambre en entier : le lavis en biais de sa maquette (135°), au réglage « Teinte » de l'Apparence (`lav`).
  const fond = v.ouvert && LAVIS ? { background: `linear-gradient(135deg, rgba(var(--o-warn-rgb),${lav(0.16)}), rgba(var(--o-warn-rgb),${lav(0.03)})), ${SURF_CARTE}` } : null;
  const plaque = v.ouvert ? RM_ICO('rgba(var(--o-warn-rgb),.16)', 'var(--o-warn)') : v.muet ? RM_ICO('var(--o-s2)', 'var(--o-text3)') : RM_ICO('var(--o-s1)', 'var(--o-text3)');
  const encre = v.ouvert ? 'var(--o-warn)' : v.muet ? 'var(--o-bad)' : 'var(--o-text2)';
  return (
    <div className={'o-rmcard o-gabarit o-ouverture' + (v.muet ? ' o-panne' : '')} data-ouverture={v.ton || 'calme'}
      style={{ ...RM_CARD_HAUT, position: 'relative', overflow: 'hidden', cursor: ouvrable ? 'pointer' : 'default', ...fond,
        border: v.ouvert ? 'var(--o-bw,1px) solid rgba(var(--o-warn-rgb),.5)' : LISERE, ...(v.muet ? { opacity: 0.6 } : null) }}>
      {ouvrable && <Surface onClick={() => onOpen(id)} label={nomCarte(nom, null, [v.etat, v.sous].filter(Boolean).join(', '))} />}
      <span className="o-ouv-dessin" aria-hidden="true" style={{ position: 'absolute', right: 14, bottom: 10, pointerEvents: 'none' }}>
        <DessinOuverture type={dessinOuverture(classe)} etat={v.muet ? 'muette' : v.ouvert ? 'ouverte' : 'fermee'} hauteur={70} />
      </span>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={{ ...plaque, position: 'relative', pointerEvents: 'none' }}>{ico ? <Ico name={ico} size={17} /> : null}</span>
        <PileCoin n={pile} muette={v.muet} />
      </div>
      <div className="o-ouv-texte" style={{ marginTop: RM_SOUS_PLAQUE, position: 'relative', pointerEvents: 'none', minWidth: 0 }}>
        <div className="o-gab-nom" style={RM_NAME}>{nom}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, minWidth: 0 }}>
          {v.ouvert && <span className="o-ouv-pouls" aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: 'var(--o-warn)' }} />}
          <span className="o-gab-phrase" style={{ '--o-n': String(v.etat).length + (v.ouvert ? 3 : 0), fontSize: 13, fontWeight: 600, color: encre, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.etat}</span>
        </div>
        {v.sous && <div className="o-gab-phrase o-ouv-sous" style={{ '--o-n': String(v.sous).length, fontSize: 12, fontWeight: 500, color: 'var(--o-text3)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.sous}</div>}
      </div>
    </div>
  );
}
