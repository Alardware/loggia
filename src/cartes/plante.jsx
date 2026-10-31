/* La carte d'une plante.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { LAVIS } from '../theme.js';
import { deCelsius } from '../unites.js';
import { Fi, nomCarte } from '../ui.jsx';
import { vuePlante } from '../plantes.js';
import { LISERE } from '../styles.js';
import { nombre } from '../format.js';
import { tr } from '../i18n.js';
import { lavisCarte, SURF_CARTE, PLANT_ART } from '../app/noyau.jsx';
import { heureDe } from '../appareils/fiches.jsx';
import { RM_CARD, ChiffreHaut, RM_SUB } from './briques.jsx';
import { NOM_GROUPE } from './groupe.jsx';

/* ── La carte d'une PLANTE (chantier Capteurs, étape 3 ; C29 à C31, § 7.2) ──────────────────────
 *
 * La carte 1a de sa maquette « Cartes capteurs », aux tailles de la maison, pour une plante lue par `lirePlante` (`pl`) :
 *  - la plaque : la feuille, sur le vert de la plante à 0,14 — son identité, pas un verdict ;
 *  - le nom (15 / 700, deux lignes au plus) et la phrase de sa vue (`vuePlante`, plantes.js) : muette, « Indisponible depuis … »
 *    en rouge et le liseré qui respire ; ce qui presse, en ambre ; sinon le mot du sol, en neutre — jamais « Tout lui convient » ;
 *  - le chiffre à droite, aligné sur la phrase : le sol, « 28 % », et « SOL » dessous ; muette, « — » ;
 *  - au pied, la grille 2 × 2 : sol, lumière, température, engrais — une valeur ne passe en ambre que si elle presse ; l'engrais et un
 *    sol très humide restent neutres sur la carte, la fiche les dit ;
 *  - le dessin choisi (`img`), à 0,14, en filigrane — un fichier (C34) ; une plante découverte n'en a pas ;
 *  - le lavis ambre à 0,1, seulement quand quelque chose presse. Plus de lavis vert (C5).
 * La carte ÉTROITE (la grille commune, ADR 0202) : la plaque et le sol en haut (`ChiffreHaut`), le nom, la phrase — pas de grille.
 * La COMPACTE : sa disposition d'aujourd'hui, avec la phrase, le sol à droite et ces couleurs.
 * Sans commande, la plante reste un bouton entier (lot 13 de l'audit du 03/10) : son nom dit ce qu'elle affiche — le nom, le sol,
 * la phrase —, et `aria-haspopup` la fiche qu'elle ouvre. Budget : 38 + 14 + 2 × 18 + 16 + 8 + 14 + 6 + 14 = 146 px, pour 150. */
function RoomPlantCard({ pl, nom, onOpen, chip = false }) {
  const v = vuePlante(pl, { quand: heureDe, deCelsius });
  const mort = v.muette;
  const encre = v.ton === 'bad' ? 'var(--o-bad)' : v.ton === 'warn' ? 'var(--o-warn)' : 'var(--o-text2)';
  const lavis = v.ton === 'warn' && LAVIS ? lavisCarte('var(--o-warn-rgb)', .1, .03) : null;
  /* La plaque : la feuille sur le vert de la plante. La COMPACTE passe sa classe (`o-cvico`) : sa taille vient alors de la feuille, qui
   * la rapetisse quand la carte est étroite — en ligne, elle ne le pourrait pas (tests/cartes_compactes_gabarit). */
  const portrait = (taille, cls = null) => (
    <span className={cls || undefined} style={{ ...(cls ? null : { width: taille, height: taille, borderRadius: taille > 36 ? 14 : 10 }), flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--o-ok-rgb),.14)', color: 'var(--o-ok)' }}><Fi i="leaf" size={taille > 36 ? 17 : 15} /></span>
  );
  // Ce que la carte affiche, dans l'ordre : le nom, le sol, la phrase.
  const label = nomCarte(nom, v.sol == null ? null : v.chiffre, v.phrase);
  const clavier = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen && onOpen(); } };
  if (chip) {
    return (
      <div className={'o-piece o-cvdense' + (mort ? ' o-panne' : '')} data-plante="" role="button" tabIndex={0} aria-label={label} aria-haspopup="dialog" onKeyDown={clavier}
        onClick={onOpen} style={{ position: 'relative', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 14px', borderRadius: 'var(--o-radius,18px)', cursor: 'pointer', background: lavis || SURF_CARTE, border: LISERE, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', transition: 'all .25s' }}>
        <div className="o-cvrow" style={{ display: 'flex', alignItems: 'center' }}>
          {portrait(34, 'o-cvico')}
          <div className="o-cvtxt">
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: encre, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.phrase}</div>
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', flexShrink: 0, color: v.sol == null ? 'var(--o-text3)' : 'var(--o-text2)' }}>{v.chiffre}</span>
        </div>
      </div>
    );
  }
  const filigrane = pl.img && PLANT_ART[pl.img] && (
    <span aria-hidden="true" style={{ position: 'absolute', right: 6, bottom: -10, width: 120, height: 120, backgroundImage: `url("${PLANT_ART[pl.img]}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center bottom', opacity: 0.14, pointerEvents: 'none' }} />
  );
  return (
    <div className={'o-rmcard o-gabarit' + (mort ? ' o-panne' : '')} data-plante="" role="button" tabIndex={0} aria-label={label} aria-haspopup="dialog" onKeyDown={clavier}
      onClick={onOpen} style={{ ...RM_CARD, cursor: 'pointer', position: 'relative', overflow: 'hidden', justifyContent: 'flex-start', border: LISERE, ...(lavis ? { background: lavis } : null) }}>
      {filigrane}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        {portrait(38)}
        {/* Sur la carte étroite, le sol en haut à droite (la grille commune) ; la feuille n'en montre qu'une écriture. */}
        <ChiffreHaut v={v.sol == null ? '\u2014' : nombre(v.sol, 0)} u={v.sol == null ? null : '%'} couleur={v.sol == null ? 'var(--o-text3)' : 'var(--o-text)'} />
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 'var(--o-milieu-haut, 14px)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="o-gab-nom" style={NOM_GROUPE}>{nom}</div>
          <div className="o-gab-phrase" style={{ ...RM_SUB, color: encre, '--o-n': Math.max(1, v.phrase.length) }}>{v.phrase}</div>
        </div>
        {/* Le chiffre de la carte large : le sol, et « SOL » dessous, en petites capitales. */}
        <span aria-hidden="true" className="o-seul-large" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1, flexShrink: 0 }}>
          <span style={{ fontSize: 25, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: v.sol == null ? 'var(--o-text3)' : 'var(--o-text)' }}>{v.chiffre}</span>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--o-text3)', marginTop: 5 }}>{tr('Sol')}</span>
        </span>
      </div>
      <div aria-hidden="true" className="o-seul-large" data-grille="" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px', marginTop: 'auto', paddingTop: 8 }}>
        {v.mesures.map(m => (
          <span key={m.cle} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 12, fontWeight: 700, color: m.presse ? 'var(--o-warn)' : 'var(--o-text2)', whiteSpace: 'nowrap' }}>
            <Fi i={m.glyphe} size={12} color={m.presse ? 'var(--o-warn)' : 'var(--o-text3)'} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.valeur == null ? '\u2014' : m.valeur}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export { RoomPlantCard };
