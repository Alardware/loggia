/* Paramètres › Appareils, et la question d'un écran qu'on ne reconnaît pas
 * (tranche 3 du chantier de synchronisation, ADR 0222).
 *
 * « Sur chaque appareil l'utilisateur peut personnaliser la mise en page »
 * (17/10). Un écran suit la mise en page commune de son type — ordinateur,
 * tablette, téléphone — tant qu'il n'a pas choisi la sienne. L'interrupteur vit
 * ICI et nulle part ailleurs (pas de réglage en double) ; le bandeau d'édition
 * de l'Accueil rappelle seulement quelle mise en page on range.
 *
 * Ses choix du 17/10 : un nom AUTOMATIQUE, qu'on change quand on veut ; tout le
 * monde voit la liste, chacun règle SON écran, et oublier un autre appareil est
 * réservé à l'administrateur ; un appareil à part range aussi sa grille
 * d'Accueil. */
import { useState } from 'react';
import { tr } from '../i18n.js';
import { Panneau, Ligne, Pastille, btnSecondaire, btnDanger, quandCourt } from './parcommun.jsx';
import { Bascule, BottomSheet, TitreFeuille } from '../ui.jsx';
import { appareilId, appareilsConnus, poserFiche, nomAutoAppareil } from '../state.js';
import { formatEcran } from '../disposition.js';

/** Le type de CET écran, comme l'éditeur le calcule : la souris fait
 *  l'ordinateur, le doigt la tablette sur grand écran et le téléphone ailleurs. */
function formatDeCetEcran() {
  try {
    const tactile = window.matchMedia('(pointer: coarse)').matches;
    return formatEcran(tactile, window.innerWidth >= 1180);
  } catch { return 'pc'; }
}

/** Le nom d'un type d'écran, dans la langue de l'écran. */
const nomDuFormat = (f) => (f === 'tablette' ? tr('Tablette') : f === 'mobile' ? tr('Téléphone') : tr('Ordinateur'));

/** Ce qu'une ligne affiche d'un appareil : son nom, ou son type s'il n'en a pas. */
const nomDe = (f) => (f && f.nom) || nomDuFormat(f && f.format);

export function AppareilsReglages({ peutOublier = false }) {
  const [, relire] = useState(0);
  const moi = appareilId();
  const tous = appareilsConnus();
  const fiche = (moi && tous[moi]) || {};
  const format = fiche.format || formatDeCetEcran();
  const [nom, setNom] = useState(fiche.nom || '');

  const poser = (champs) => { poserFiche(moi, champs); relire(n => n + 1); };
  const basculer = () => {
    if (fiche.propre) { poser({ propre: false }); return; }
    // Un nom AUTOMATIQUE au premier choix, numéroté s'il est pris.
    const n = fiche.nom || nomAutoAppareil(nomDuFormat(format));
    setNom(n);
    poser({ propre: true, nom: n, format });
  };
  const renommer = () => {
    const n = nom.trim();
    if (n && n !== fiche.nom) poser({ nom: n });
  };

  const autres = Object.keys(tous).filter(id => id !== moi)
    .sort((a, b) => ((tous[b] && tous[b].vu) || 0) - ((tous[a] && tous[a].vu) || 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panneau titre={tr('Cet écran')} desc={tr('Il suit la mise en page commune de son type d’écran, sauf s’il range la sienne.')}
        droite={<Pastille>{nomDuFormat(format)}</Pastille>}>
        <Ligne titre={tr('Sa propre mise en page')}
          desc={fiche.propre ? tr('Ses cartes et son Accueil se rangent à part.') : tr('Il range ses cartes avec les autres écrans de ce type.')}>
          <Bascule on={!!fiche.propre} cb={basculer} nom={tr('Sa propre mise en page')} />
        </Ligne>
        {/* L'apparence suit le profil ; cet écran peut avoir la sienne (ADR 0223).
          * Un choix à part : une tablette murale peut garder la mise en page
          * commune et un thème clair, ou l'inverse. */}
        <Ligne titre={tr('Sa propre apparence')}
          desc={fiche.apparence ? tr('Son thème et ses couleurs ne changent que sur cet écran.') : tr('Son thème suit celui du profil, sur tous ses écrans.')}>
          <Bascule on={!!fiche.apparence} cb={() => poser({ apparence: !fiche.apparence })} nom={tr('Sa propre apparence')} />
        </Ligne>
        {fiche.propre && (
          <Ligne titre={tr('Nom de cet écran')}>
            <input aria-label={tr('Nom de cet écran')} value={nom} maxLength={40}
              onChange={e => setNom(e.target.value)} onBlur={renommer} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              style={{ width: 200, maxWidth: '100%', padding: '9px 12px', borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s1)', color: 'var(--o-text)', font: 'inherit', fontSize: 13, fontWeight: 700 }} />
          </Ligne>
        )}
      </Panneau>

      {autres.length > 0 && (
        <Panneau titre={tr('Les autres écrans')} desc={tr('Ceux qui ont déjà ouvert Loggia dans la maison.')}>
          {autres.map(id => {
            const f = tous[id] || {};
            return (
              <Ligne key={id} titre={nomDe(f)}
                desc={[f.nom ? nomDuFormat(f.format) : null, f.propre ? tr('mise en page à part') : null, f.vu ? tr('vu {quand}', { quand: quandCourt(f.vu / 1000) }) : null].filter(Boolean).join(' · ')}>
                {peutOublier && <button onClick={() => { poserFiche(id, null); relire(n => n + 1); }} style={btnDanger}>{tr('Oublier')}</button>}
              </Ligne>
            );
          })}
        </Panneau>
      )}
    </div>
  );
}

/** Un écran sans fiche, alors que la maison connaît des appareils NOMMÉS de son
 *  type : son cache a été vidé, ou il passe par une autre adresse. On lui
 *  demande, une fois, s'il est l'un d'eux. */
export function QuestionAppareil({ candidats, onChoisir, onNouveau }) {
  return (
    <BottomSheet onClose={onNouveau}>
      <TitreFeuille marge={6}><span style={{ fontSize: 17, fontWeight: 800 }}>{tr('Cet écran est-il l’un de ceux-ci ?')}</span></TitreFeuille>
      <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, lineHeight: 1.45, marginBottom: 12 }}>
        {tr('Loggia ne le reconnaît pas : son cache a été vidé, ou il passe par une autre adresse.')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {candidats.map(([id, f]) => (
          <button key={id} onClick={() => onChoisir(id)} style={{ ...btnSecondaire, justifyContent: 'space-between' }}>
            <span>{nomDe(f)}</span>
            {f.vu ? <span style={{ fontSize: 11.5, color: 'var(--o-text2)' }}>{tr('vu {quand}', { quand: quandCourt(f.vu / 1000) })}</span> : null}
          </button>
        ))}
        <button onClick={onNouveau} style={{ ...btnSecondaire, background: 'transparent' }}>{tr('Non, c’est un nouvel appareil')}</button>
      </div>
    </BottomSheet>
  );
}
