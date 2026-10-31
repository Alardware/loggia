/* La carte du distributeur de croquettes, et celle d'une vanne.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { Suspense } from 'react';
import { lazyRecharge } from '../recharge.js';
import { nomCarte, Surface, Fi } from '../ui.jsx';
import { pourcentTexte } from '../lecteur.js';
import { LISERE } from '../styles.js';
import { locale, tr } from '../i18n.js';
import { SURF_CARTE } from '../app/noyau.jsx';
import { FicheAppareil, BoutonEpingle } from '../appareils/fiches.jsx';
import { RM_CARD, RM_ICO, RM_MILIEU, RM_NAME, RM_SUB, GlypheCarte } from './briques.jsx';
import { RM_PUCE_CHOISIE, ChiffreNommeHaut, ChiffreNomme, RM_PUCE_ROBOT } from './robot.jsx';

// Une vanne (chantier IoT, étape 3) : sa carte — large, étroite, compacte — et sa popup, d'UN morceau chargé à la demande (vanne.jsx,
// par `CarteVanne`, `fiche` posé ou non) — le démarrage n'en porte que l'adresse.
const VanneContent = lazyRecharge(() => import('../vanne.jsx'));

/* ── Le distributeur de croquettes (étape 2 du chantier IoT, 19/10 ; sa maquette « Cartes IoT », 1a ; I5, I6, I8, I10, I12, § 6) ──
 *
 * La carte au gabarit commun (`o-gabarit`, ADR 0202), ses deux écritures, celles du robot :
 *  - large (184 × 225) : la plaque seule en haut ; 10 px plus bas, la rangée `RM_MILIEU` — le nom et la phrase à gauche, le
 *    réservoir NOMMÉ à droite (« 38 % » · « RÉSERVOIR ») ; au pied, UNE puce de 44 px, « Distribuer 12 g » ;
 *  - étroite (1c) : la plaque et le réservoir nommé en haut, le nom entier, la phrase, la même puce.
 * La couleur n'alerte que (I8) : la plaque ambre, sans lavis — l'orange d'avant part ; grise quand l'appareil ne répond plus, avec
 * le liseré qui respire ; la phrase (`phraseDistributeur`, § 6) passe à l'ambre sous 15 % de bac ou sur une anomalie. « Rempli »
 * quitte la carte (I10) : un appui par erreur remettait le bac à 100 % ; il vit près du réservoir, dans la popup, et demande.
 * « Distribuer » est UN geste pour tout l'écran (distributeuretat.js, la variante partagée d'optimiste.js) : le verrou de 2,5 s
 * que la carte tenait seule vaut pour la carte large, l'étroite, la compacte et la popup — deux appuis, une ration.
 * La compacte (I12) garde la disposition de la maison : la plaque, le nom, la phrase, le réservoir à droite, son mini « Distribuer ».
 * Ni l'une ni l'autre n'est un `role="button"` autour de sa commande (lot 13 de l'audit du 03/10) : la surface (ADR 0074) porte
 * « ouvrir la fiche » sous ce que la carte affiche, et la puce, positionnée, passe au-dessus d'elle en nommant l'appareil. */
const PLAQUE_DISTRIBUTEUR = ['rgba(var(--o-piece-ambre-rgb),.18)', 'var(--o-piece-ambre)'];
// Le mini « Distribuer » de la compacte : celui d'un robot (`miniAccent` de `CvCard`), le bleu plein et le blanc.
const RM_MINI_DISTRIBUER = { position: 'relative', width: 38, height: 26, borderRadius: 10, border: 'none', background: 'var(--o-accent-fond)', color: '#fff', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 };

function RoomFeederCard({ v, onOpen, chip = false }) {
  const g = v.ration == null ? null : v.ration.toLocaleString(locale(), { maximumFractionDigits: 1 });
  const mot = g ? tr('Distribuer {g} g', { g }) : tr('Distribuer');
  const label = nomCarte(v.nom, v.phrase.texte, v.pct == null ? null : tr('réservoir {p} %', { p: v.pct }));
  const [fond, encre] = v.mort && v.raison !== 'reservoir' ? ['var(--o-s1)', 'var(--o-text3)'] : PLAQUE_DISTRIBUTEUR;
  // Un geste en vol : la puce reste à sa place, choisie, et ne fait rien (`aria-disabled`, le focus reste).
  const puce = (style, enfants) => (
    <button type="button" aria-label={mot + ' ' + v.nom} title={mot} aria-disabled={v.enVol ? 'true' : undefined}
      onClick={(e) => { e.stopPropagation(); v.distribuer(); }} className={chip ? undefined : 'o-rmbtn'} style={{ ...style, ...(v.enVol ? RM_PUCE_CHOISIE : null) }}>{enfants}</button>
  );
  if (chip) {
    return (
      <div className={'o-piece o-cvdense' + (v.mort ? ' o-panne' : '')}
        style={{ position: 'relative', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 14px', borderRadius: 'var(--o-radius,18px)', cursor: 'pointer', background: SURF_CARTE, border: LISERE, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', transition: 'all .25s' }}>
        {onOpen && <Surface onClick={() => onOpen()} label={label} />}
        <div className="o-cvrow" style={{ display: 'flex', alignItems: 'center' }}>
          <span className="o-cvico" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: fond, color: encre }}><Fi i="paw" size={15} /></span>
          <div className="o-cvtxt">
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.nom}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: v.phrase.encre, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.phrase.texte}</div>
          </div>
          {v.pct != null && <span style={{ fontSize: 12, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'var(--o-text2)' }}>{pourcentTexte(v.pct)}</span>}
          {/* Le bouton SEUL est positionné, pas la rangée : le nom et le réservoir restent sous la surface, un appui dessus ouvre la fiche.
            * En vol, la mini-puce — déjà à l'accent — le montre par son glyphe, le sablier (passe bis, point G). */}
          {v.envoi && puce(RM_MINI_DISTRIBUER, <Fi i={v.enVol ? 'hourglass-end' : 'paw'} size={13} />)}
        </div>
      </div>
    );
  }
  return (
    /* La carte n'est pas un bouton (ADR 0074) : la surface, premier enfant, dit ce que la carte affiche — le nom, la phrase, le
     * réservoir — et la puce, positionnée, passe au-dessus d'elle. */
    <div className={'o-rmcard o-gabarit' + (v.mort ? ' o-panne' : '')} style={{ ...RM_CARD, position: 'relative', cursor: onOpen ? 'pointer' : 'default', border: LISERE }}>
      {onOpen && <Surface onClick={() => onOpen()} label={label} />}
      {/* La ligne du haut : la plaque, et le réservoir nommé de la carte étroite. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <span style={RM_ICO(fond, encre)}><Fi i="paw" size={17} /></span>
        {v.pct != null && <ChiffreNommeHaut v={v.pct} nom={tr('Réservoir')} />}
      </div>
      {/* La rangée du milieu, 10 px sous la plaque : le nom et la phrase à gauche, le réservoir nommé de la carte large à droite. */}
      <div style={{ ...RM_MILIEU, marginTop: 'var(--o-milieu-haut, 10px)' }}>
        <div style={{ minWidth: 0 }}>
          <div className="o-gab-nom" style={{ ...RM_NAME, fontSize: 15 }}>{v.nom}</div>
          <div className="o-gab-phrase" style={{ ...RM_SUB, color: v.phrase.encre, '--o-n': Math.max(1, v.phrase.texte.length) }}>{v.phrase.texte}</div>
        </div>
        {v.pct != null && <ChiffreNomme v={v.pct} nom={tr('Réservoir')} />}
      </div>
      {/* Le pied, collé en bas par la marge auto : UNE puce, son mot et ses grammes. L'appareil muet n'en a pas : rien d'inerte. */}
      {v.envoi && (
        <div className="o-puces-robot" data-n={1} style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 'var(--o-pied-haut, 9px)' }}>
          {puce(RM_PUCE_ROBOT, <><Fi i="paw" size={14} /><span className="o-puce-robot-mot">{mot}</span></>)}
        </div>
      )}
    </div>
  );
}
/* ── Une vanne (chantier IoT, étape 3 ; sa maquette « Cartes IoT », 1a ; I5, I11, I12, I31) ──
 * Sa carte — large, étroite, compacte — se charge à la demande (cartevanne.jsx) : la vanne d'eau, ses détecteurs et sa règle de
 * sûreté n'ont rien à faire au démarrage d'une maison qui n'en a pas. Ici ne reste que la coquille : le `hass` vivant de la vanne
 * et des binaires (un détecteur qui voit de l'eau change sa phrase), le gabarit des cartes IoT — le même dessin que le robot et le
 * distributeur —, et un repli de la même taille, vide, le temps qu'elle arrive. Une vanne est une `valve`, ou la prise désignée dans
 * Paramètres › Alertes (« Quelle vanne ») : elle a sa carte partout, Objets, une pièce, une vue personnelle. */
// `estVanneCarte` vit dans actions.js : la garde des commandes la lit aussi (passe bis de l'étape 3, point 9).
/* La carte, et la popup (1f) quand `fiche` est posé — UNE coquille pour les deux (passe bis, point 9 : la place du démarrage) : la
 * feuille entière vit dans fichevanne.jsx, qui reçoit d'ici la fiche universelle et l'épingle ; la carte, son glyphe. Le repli de la
 * carte : sa place (`RM_CARD` porte le liseré), ou celle de la compacte que sa cellule dimensionne ; la popup, rien. */
const CarteVanne = (p) => <Suspense fallback={p.fiche ? null : <div className="o-rmcard" style={p.chip ? { height: '100%' } : RM_CARD} />}><VanneContent {...p} Glyphe={GlypheCarte} Appareil={FicheAppareil} Epingle={BoutonEpingle} /></Suspense>;

/* Le distributeur de la bibliothèque des cartes : un exemple à 74 %, sa phrase et sa puce, sans geste. */
const biblioDistributeur = () => ({ nom: tr('Croquettes'), pct: 74, ration: 18, envoi: {}, enVol: null, mort: false, raison: null, distribuer: () => {},
  phrase: { texte: tr('Repas à {h}', { h: '18:00' }) + ' · ' + tr('≈ {n} j', { n: 8 }), encre: 'var(--o-text2)' } });

export { PLAQUE_DISTRIBUTEUR, RoomFeederCard, CarteVanne, biblioDistributeur };
