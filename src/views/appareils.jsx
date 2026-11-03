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
import { Panneau, Ligne, Pastille, GrilleCartes, CarteGens, btnSecondaire, btnDanger, quandCourt } from './parcommun.jsx';
import { CarteTel, LignesTel, LigneTel, ChoixTel, BasculeTel, btnTel, pasTel } from './partel.jsx';
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

/** L'icône d'un type d'écran, sur sa carte (maquette v3, 02/11). */
const iconeDuFormat = (f) => (f === 'tablette' ? 'mode-landscape' : f === 'mobile' ? 'portrait' : 'computer');

/** Ce qu'une ligne affiche d'un appareil : son nom, ou son type s'il n'en a pas. */
const nomDe = (f) => (f && f.nom) || nomDuFormat(f && f.format);

/** Ce que le rôle du profil permet, en une phrase (maquette v3, ligne « Pour »). */
const DROITS_DU_ROLE = (role) => (role === 'Admin' ? tr('Tout se règle, sections réservées comprises.')
  : role === 'Enfant' ? tr('Un écran tenu par le serveur, dans sa pièce.')
    : tr('Commande la maison ; les réglages réservés restent fermés.'));

/** Le type d'écran tel que la ligne « C'est » le dit. */
const cEst = (f) => (f === 'tablette' ? tr('Une tablette') : f === 'mobile' ? tr('Un téléphone') : tr('Un ordinateur'));

/* Paramètres › Écrans, sur la maquette v3 (02/11) : les écrans de la maison en
 * cartes, à nu — celui-ci en premier, plein d'accent —, puis « Cet écran ».
 * Le type d'écran et le profil se LISENT ici : Loggia détecte le premier (la
 * souris, le doigt, la largeur) et le second suit le compte Home Assistant ;
 * des boutons qui ne changeraient rien n'y ont pas leur place. */
export function AppareilsReglages({ peutOublier = false, profil = '', role = 'Famille', tel = false, profils = [] }) {
  const [, relire] = useState(0);
  const [ouvert, setOuvert] = useState(null);
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
    if (n && n !== fiche.nom) poser({ nom: n, format });
  };

  const autres = Object.keys(tous).filter(id => id !== moi)
    .sort((a, b) => ((tous[b] && tous[b].vu) || 0) - ((tous[a] && tous[a].vu) || 0));
  // Vu dans les cinq dernières minutes : en ligne, le point passe au vert.
  const enLigne = (f) => !!f.vu && Date.now() - f.vu < 5 * 60000;
  const fo = ouvert && tous[ouvert];
  const champNom = (largeur) => (
    <input aria-label={tr('Nom de cet écran')} value={nom} maxLength={40} placeholder={nomDuFormat(format)}
      onChange={e => setNom(e.target.value)} onBlur={renommer} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      style={{ width: largeur, maxWidth: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s1)', color: 'var(--o-text)', font: 'inherit', fontSize: 13, fontWeight: 700 }} />
  );

  /* Au téléphone (maquette v4) : « Cet écran » en une carte — son nom, son
   * type et son profil LUS (Loggia les connaît, ils ne se choisissent pas),
   * sa mise en page —, puis les autres écrans en lignes. */
  if (tel) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <CarteTel chip={iconeDuFormat(format)} chipFond="rgba(var(--o-accent-rgb),.16)" chipCouleur="var(--o-accent)" titre={tr('Cet écran')}
        desc={tr('Il suit la mise en page commune de son type d’écran, sauf s’il range la sienne.')} gap={20}>
        <LignesTel><LigneTel titre={tr('Nom de cet écran')}>{champNom(220)}</LigneTel></LignesTel>
        <ChoixTel lecture titre={tr('Type d’écran')} desc={tr('C’est le type qui décide du rangement, jamais la largeur.')} value={format}
          opts={[['pc', tr('Ordinateur')], ['tablette', tr('Tablette murale')], ['mobile', tr('Téléphone')]]} />
        {profils.length > 0 && <ChoixTel lecture titre={tr('Profil de cet écran')} value={profil} opts={profils.map(n => [n, n])} />}
        <LignesTel>
          <LigneTel titre={tr('Mise en page')}
            desc={format === 'pc' && !fiche.propre ? tr('Celle des ordinateurs est la mise en page commune : tablettes et téléphones la suivent, réglage par réglage, tant qu’ils n’ont rien rangé eux-mêmes.')
              : fiche.propre ? tr('Cet écran range la sienne.') : tr('Suit l’ordinateur, réglage par réglage.')}>
            {(format !== 'pc' || fiche.propre) && <button type="button" onClick={basculer} style={btnTel}>{fiche.propre ? tr('Suivre l’ordinateur') : tr('Ranger la sienne')}</button>}
          </LigneTel>
          {/* L'apparence suit le profil ; cet écran peut avoir la sienne (ADR 0223, revenue le 03/11). */}
          <LigneTel titre={tr('Sa propre apparence')} desc={fiche.apparence ? tr('Son thème et ses couleurs ne changent que sur cet écran.') : tr('Son thème suit celui du profil, sur tous ses écrans.')}>
            <BasculeTel on={!!fiche.apparence} cb={() => poser({ apparence: !fiche.apparence })} nom={tr('Sa propre apparence')} />
          </LigneTel>
        </LignesTel>
      </CarteTel>
      {autres.length > 0 && (
        <CarteTel titre={tr('Les autres écrans')} desc={tr('Ceux qui ont déjà ouvert Loggia dans la maison.')}>
          <LignesTel>
            {autres.map(id => {
              const f = tous[id] || {};
              return (
                <LigneTel key={id} ico={iconeDuFormat(f.format)} titre={nomDe(f)}
                  desc={[nomDuFormat(f.format), f.propre ? tr('mise en page à part') : null, f.vu ? tr('vu {quand}', { quand: quandCourt(f.vu / 1000) }) : null].filter(Boolean).join(' · ')}>
                  {enLigne(f) && <span style={pasTel('ok')}>{tr('En ligne')}</span>}
                  {peutOublier && <button type="button" onClick={() => { poserFiche(id, null); relire(n => n + 1); }} style={btnTel}>{tr('Oublier')}</button>}
                </LigneTel>
              );
            })}
          </LignesTel>
        </CarteTel>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <GrilleCartes label={tr('Écrans')}>
        <CarteGens choisi haut={160} ico={iconeDuFormat(format)} nom={fiche.nom || nomDuFormat(format)}
          sous={[nomDuFormat(format), profil ? tr('profil {nom}', { nom: profil }) : null].filter(Boolean).join(' · ')}
          vu={tr('vous êtes ici')} />
        {autres.map(id => {
          const f = tous[id] || {};
          return (
            <CarteGens key={id} haut={160} ico={iconeDuFormat(f.format)} nom={nomDe(f)}
              sous={[nomDuFormat(f.format), f.propre ? tr('mise en page à part') : null].filter(Boolean).join(' · ')}
              vu={f.vu ? tr('vu {quand}', { quand: quandCourt(f.vu / 1000) }) : null} actif={enLigne(f)}
              onClick={() => setOuvert(id)} label={nomDe(f)} />
          );
        })}
      </GrilleCartes>

      <Panneau titre={tr('Cet écran')}>
        <Ligne titre={tr('Son nom')}>{champNom(240)}</Ligne>
        <Ligne titre={tr('C’est')} desc={tr('Le type décide du rangement, jamais la largeur.')}>
          <Pastille>{cEst(format)}</Pastille>
        </Ligne>
        <Ligne titre={tr('Pour')} desc={DROITS_DU_ROLE(role)}>
          {profil && <Pastille>{profil}</Pastille>}
        </Ligne>
        {/* L'ordinateur porte le rangement que les autres suivent ; une
          * tablette ou un téléphone peut ranger le sien. Un ordinateur passé
          * à part garde de quoi revenir. */}
        <Ligne titre={tr('Son rangement')}
          desc={format === 'pc' && !fiche.propre ? tr('C’est celui des ordinateurs, que tablettes et téléphones suivent réglage par réglage.')
            : fiche.propre ? tr('Le sien : ordre, cartes larges, cartes compactes.') : tr('Celui de l’ordinateur, réglage par réglage.')}>
          {(format !== 'pc' || fiche.propre) && <button type="button" onClick={basculer} style={btnSecondaire}>{fiche.propre ? tr('Suivre l’ordinateur') : tr('Ranger le sien')}</button>}
        </Ligne>
        {/* L'apparence suit le profil ; cet écran peut avoir la sienne (ADR 0223). Partie avec la maquette v3, revenue le 03/11 :
          * sans elle, un écran qui avait la sienne la gardait pour toujours. */}
        <Ligne titre={tr('Sa propre apparence')} desc={fiche.apparence ? tr('Son thème et ses couleurs ne changent que sur cet écran.') : tr('Son thème suit celui du profil, sur tous ses écrans.')}>
          <Bascule on={!!fiche.apparence} cb={() => poser({ apparence: !fiche.apparence })} nom={tr('Sa propre apparence')} />
        </Ligne>
      </Panneau>

      {fo && (
        <BottomSheet onClose={() => setOuvert(null)} title={nomDe(fo)}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginBottom: 6 }}>
            {[nomDuFormat(fo.format), fo.vu ? tr('vu {quand}', { quand: quandCourt(fo.vu / 1000) }) : null].filter(Boolean).join(' · ')}
          </div>
          <Ligne titre={tr('En ligne')} style={{ padding: '14px 0', borderTop: 'none' }}>
            {enLigne(fo) ? <Pastille niveau="ok" point capitales>{tr('Oui')}</Pastille> : <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text3)' }}>{tr('Non')}</span>}
          </Ligne>
          <Ligne titre={tr('Son rangement')} desc={fo.propre ? tr('Le sien : ordre, cartes larges, cartes compactes.') : tr('Suit l’ordinateur, réglage par réglage.')} style={{ padding: '14px 0' }} />
          {/* Oublier un autre écran reste un geste d'administrateur. */}
          {peutOublier && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
              <span style={{ flex: '1 1 200px', fontSize: 12, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Il réapparaîtra s’il rouvre Loggia.')}</span>
              <button type="button" onClick={() => { poserFiche(ouvert, null); setOuvert(null); relire(n => n + 1); }} style={btnDanger}>{tr('Oublier cet écran')}</button>
            </div>
          )}
        </BottomSheet>
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
