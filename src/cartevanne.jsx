/* ── La carte d'une vanne (chantier IoT, étape 3 ; sa maquette « Cartes IoT », 1a ; I5, I8, I11, I12, I31, I33, § 6) ──────────
 *
 * Chargée à la demande (App.jsx, `CarteVanne`, son repli de la même taille) : le démarrage n'en porte rien. Le gabarit des cartes
 * IoT (`GABARIT` : `RM_CARD`, `RM_ICO`, `RM_MILIEU`, les puces de 44 px, le lavis) est RECOPIÉ d'App.jsx — passé en propriété, il
 * pesait au démarrage — et tenu par un test de source (tests/carte_vanne.test.mjs) : la vanne est dessinée comme le robot et le
 * distributeur. Seul le glyphe choisi pour la carte (`Glyphe`, `GlypheCarte`) vient d'App.jsx.
 *
 *  - La vanne d'EAU (une `valve` de classe `water`, ou l'entité désignée dans « Quelle vanne », une prise comprise) : la plaque
 *    cyan ouverte, rouge et un lavis rouge fermée sur fuite, grise sinon (I8) ; le nom ; la phrase de § 6 ; pas de chiffre ; UNE
 *    puce au pied — « Fermer l'eau » en encre rouge, d'un appui : c'est le sens sûr ; « Rouvrir l'eau » (I11), qui DEMANDE après
 *    une fuite et tant qu'un détecteur voit de l'eau.
 *  - La question, sur la carte LARGE : la phrase devient « La fuite est réparée ? » (« Rouvrir l'eau ? » quand le carnet ne dit pas
 *    pourquoi elle est fermée — passe bis, point 3) et le pied « Annuler » · « Rouvrir », sur une ligne de 44 px ; laissée, elle se
 *    referme au bout de 10 s. La carte ÉTROITE (1c, ADR 0202) ne demande pas sur place : elle pose la question (eauetat.js) et ouvre
 *    la popup, qui la trouve. Les deux écritures sont dans la carte (`o-seul-large`, `o-seul-etroit`) ; la feuille n'en montre
 *    qu'une. « {nom} voit encore de l'eau. Rouvrir quand même ? » ne tient sur aucune carte : la large aussi ouvre la popup (point 4).
 *  - Une autre vanne (I31) : la même carte, simple — « Ouverte » / « Fermée », « Fermer » / « Ouvrir » ; ouvrir le GAZ demande
 *    « Ouvrir le gaz ? ».
 *  - La COMPACTE (I12) : la plaque, le nom, la phrase — et aucune commande : un appui de travers couperait l'eau de la maison.
 *  - Le geste est PARTAGÉ (I33, eauetat.js) : deux appuis, une commande, d'où qu'ils viennent ; en vol, et tant que la vanne tourne
 *    (`closing`, `opening`), la puce reste à sa place, choisie, et ne fait rien (`aria-disabled`, le focus reste) ; « Fermeture… ».
 *    Un appareil muet n'a pas de puce, ni un sens que la vanne ne sait pas faire (`supported_features`).
 * La carte n'est pas un bouton (ADR 0074) : la surface, premier enfant, dit ce que la carte affiche ; les puces, positionnées, passent
 * au-dessus d'elle en nommant l'appareil.
 */
import { useEffect, useState } from 'react';
import { Fi, Surface, nomCarte } from './ui.jsx';
import { cfgVal, plateformeDe } from './state.js';
import { plantsCfg } from './lectures.js';
import { CARTE_MAISON, ICONE_CARTE, NOM_CARTE, SOUS_CARTE, LISERE } from './styles.js';
import { LAVIS, lav } from './theme.js';
import { vueVanne, vanneDesignee, questionVanne } from './eau.js';
import { useEtatEau, useGesteVanne, commanderVanne, poserQuestion, useHassEau } from './eauetat.js';

const QUESTION_MS = 10000;
const PIED = { display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 'var(--o-pied-haut, 9px)' };
const SURF = 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))';
/** Le gabarit des cartes IoT d'App.jsx, recopié : `RM_CARD`, `RM_ICO`, `RM_MILIEU`, `RM_NAME`, `RM_SUB`, `RM_PUCE_ROBOT` (sur
 *  `RM_BTN`), `RM_PUCE_CHOISIE`, `SURF_CARTE` et `lavisCarte`. */
export const GABARIT = {
  carte: { ...CARTE_MAISON, transition: 'all .3s' },
  ico: (bg, col) => ({ ...ICONE_CARTE, background: bg, color: col }),
  milieu: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'end', marginTop: 'var(--o-milieu-haut, 14px)' },
  nom: NOM_CARTE, sub: SOUS_CARTE,
  puce: { position: 'relative', flex: 1, padding: '0 8px', borderRadius: 10, background: 'var(--o-s1)', border: 'none', color: 'var(--o-text1)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
    height: 44, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 },
  choisie: { background: 'var(--o-accent-fond)', color: '#fff' },
  surf: SURF,
  lavis: (teinte, base, bas = base / 4) => (!teinte || !LAVIS ? SURF : `linear-gradient(180deg,rgba(${teinte},${lav(base)}),rgba(${teinte},${lav(bas)}) 72%), ${SURF}`),
};
const Sans = ({ children }) => children;

export default function CarteVanne({ id, hass: vue, nom = null, chip = false, onOpen = null, Glyphe = Sans }) {
  const g = GABARIT;
  const hass = useHassEau(vue, id);
  const S = (hass && hass.states) || {};
  const st = S[id] || null;
  const designee = vanneDesignee(cfgVal('loggia_alertes', null));
  const eau = String(id).indexOf('valve.') !== 0 || (st && st.attributes && st.attributes.device_class === 'water') || id === designee;
  // `suivre` : quand la vanne change d'état, le carnet se relit aussitôt (passe bis, point 3).
  const { etat } = useEtatEau(!!eau, { suivre: st ? st.state : null });
  const enVol = useGesteVanne(id, st);
  const [demande, setDemande] = useState(false);
  useEffect(() => { if (!demande) return undefined; const t = setTimeout(() => setDemande(false), QUESTION_MS); return () => clearTimeout(t); }, [demande]);
  const v = vueVanne({ id, S, etat, designee, plateforme: plateformeDe, plantes: plantsCfg().map(p => p.base).filter(Boolean), enVol, nom });
  const geste = v.geste;
  // En vol, ou la vanne qui tourne (`closing`, `opening` ; passe bis, point 2) : la puce reste à sa place, choisie, et ne fait rien.
  const inerte = !!enVol || !!(geste && geste.inerte);
  const enQuestion = demande && !!geste && !!geste.demander && !inerte;
  const q = enQuestion ? questionVanne(v, { carte: true }) : null;
  const texte = q ? q.texte : v.phrase.texte;
  const label = nomCarte(v.nom, v.phrase.texte);
  const [fond, encre] = v.plaque;
  const agir = () => { if (geste && !inerte) commanderVanne(hass, id, geste.sens, st); };
  const ouvrirSurQuestion = () => { poserQuestion(id); if (onOpen) onOpen(id); };
  const plaque = (style, taille) => <span className={chip ? 'o-cvico' : undefined} style={style}><Glyphe id={id} size={taille}><Fi i="water" size={taille} /></Glyphe></span>;
  if (chip) {
    return (
      <div className={'o-piece o-cvdense' + (v.mort ? ' o-panne' : '')}
        style={{ position: 'relative', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 14px', borderRadius: 'var(--o-radius,18px)', cursor: onOpen ? 'pointer' : 'default', background: v.lavis ? g.lavis('var(--o-bad-rgb)', .14, .03) : g.surf, border: LISERE, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', transition: 'all .25s' }}>
        {onOpen && <Surface onClick={() => onOpen(id)} label={label} />}
        <div className="o-cvrow" style={{ display: 'flex', alignItems: 'center' }}>
          {plaque({ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: fond, color: encre }, 15)}
          <div className="o-cvtxt">
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.nom}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: v.phrase.encre, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.phrase.texte}</div>
          </div>
        </div>
      </div>
    );
  }
  // Une puce : son mot, l'appareil dans son nom ; en vol ou la vanne qui tourne, choisie et inerte.
  const puce = (mot, onClick, { rouge = false, ecrit = null, glyphe = true, accent = false } = {}) => (
    <button type="button" aria-label={mot + ' ' + v.nom} title={mot} data-ecrit={ecrit || undefined} aria-disabled={inerte ? 'true' : undefined} className="o-rmbtn"
      onClick={(e) => { e.stopPropagation(); if (!inerte) onClick(); }}
      style={{ ...g.puce, flex: 1, ...(rouge ? { color: 'var(--o-bad)' } : null), ...(accent || inerte ? g.choisie : null) }}>
      {/* Une ligne, toujours (la carte étroite 1c : UNE ligne de commandes de 44 px) : sur la carte étroite, le mot seul — « Wasser aufdrehen »
        * ne tenait pas à côté de son glyphe à 390 px ; le mot entier reste dans le nom de la puce. */}
      {glyphe && <span className="o-seul-large" style={{ display: 'inline-flex' }}><Fi i="water" size={14} /></span>}
      <span className="o-puce-robot-mot" style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mot}</span>
    </button>
  );
  let pied = null;
  if (geste && enQuestion) {
    /* Sans popup à ouvrir (la carte de l'appareil, DANS sa fiche universelle), la question se pose sur place, quelle que soit la largeur.
     * Sa rangée n'est PAS une rangée de puces de robot (passe bis, point 1) : la règle d'index.css qui cache le mot des rangées de deux
     * puces sous 200 px de contenu en faisait deux boutons vides sur une carte de 226 px (192 px de contenu, à 1280 px). */
    pied = (
      <div className={'o-puces-vanne' + (onOpen ? ' o-seul-large' : '')} style={PIED}>
        {puce(q.non, () => setDemande(false), { glyphe: false })}
        {puce(q.oui, () => { setDemande(false); commanderVanne(hass, id, geste.sens, st); }, { glyphe: false, accent: true })}
      </div>
    );
  } else if (geste && geste.demander && !onOpen) {
    pied = <div className="o-puces-robot" data-n={1} style={PIED}>{puce(geste.mot, () => setDemande(true), { ecrit: 'large' })}</div>;
  } else if (geste && geste.demander === 'mouillee') {
    /* « {nom} voit encore de l'eau. Rouvrir quand même ? » ne tient pas sur la ligne d'une carte, même large (passe bis, point 4) :
     * la large fait comme l'étroite — elle ouvre la popup sur sa question. */
    pied = <div className="o-puces-robot" data-n={1} style={PIED}>{puce(geste.mot, ouvrirSurQuestion, { ecrit: 'large' })}</div>;
  } else if (geste && geste.demander) {
    // Deux écritures : la carte large demande sur place, l'étroite ouvre la popup sur la question.
    pied = (<>
      <div className="o-puces-robot o-seul-large" data-n={1} style={PIED}>{puce(geste.mot, () => setDemande(true), { ecrit: 'large' })}</div>
      <div className="o-puces-robot o-seul-etroit" data-n={1} style={PIED}>{puce(geste.mot, ouvrirSurQuestion, { ecrit: 'etroit' })}</div>
    </>);
  } else if (geste) {
    pied = <div className="o-puces-robot" data-n={1} style={PIED}>{puce(geste.mot, agir, { rouge: geste.rouge && !inerte })}</div>;
  }
  return (
    <div className={'o-rmcard o-gabarit' + (v.mort ? ' o-panne' : '')} data-vanne=""
      style={{ ...g.carte, position: 'relative', cursor: onOpen ? 'pointer' : 'default', ...(v.lavis ? { background: g.lavis('var(--o-bad-rgb)', .14, .03) } : null), border: LISERE }}>
      {onOpen && <Surface onClick={() => onOpen(id)} label={label} />}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        {plaque(g.ico(fond, encre), 17)}
      </div>
      <div style={{ ...g.milieu, marginTop: 'var(--o-milieu-haut, 10px)' }}>
        <div style={{ minWidth: 0 }}>
          <div className="o-gab-nom" style={{ ...g.nom, fontSize: 15 }}>{v.nom}</div>
          {/* La question prend la place de la phrase, en texte plein : elle se lit avant les deux puces. */}
          <div className="o-gab-phrase" aria-live={q ? 'polite' : undefined}
            style={{ ...g.sub, color: q ? 'var(--o-text1)' : v.phrase.encre, ...(q ? { fontWeight: 700 } : null), '--o-n': Math.max(1, texte.length) }}>{texte}</div>
        </div>
      </div>
      {pied}
    </div>
  );
}
