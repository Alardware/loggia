/* ── Le mode enfant sur la carte d'un lecteur, à la demande (chantier Mode enfant, E15 à E17 ; § 6.1, § 6.2 ; passe bis du 17/10, point 14) ──
 *
 * Les aides de la carte qui ne servent qu'à un lecteur SOUS PROFIL : la pastille « Mode enfant », le glyphe du haut de la carte
 * étroite (la lune, le sablier), le pied du temps d'écran et la puce inerte « Revient à 08:30 ». La carte (App.jsx) charge ce module
 * par UN `lazyRecharge` — son export par défaut, `CarteEnfant`, rend la pièce demandée (`quoi`) : quatre imports à la demande
 * coûteraient quatre préchargements dans le boot — et ne le monte que quand le serveur dit que le lecteur a un profil (`v.enfant`),
 * dans un `Suspense` au repli NUL : rien de visible, et la carte ne saute pas — sa hauteur est celle de la grille (184), la plaque de
 * 38 px tient la ligne du haut, le pied est collé au bas par sa marge auto. Une maison sans mode enfant n'en télécharge rien, et le
 * boot (lot14_chargement, 1 100 000 octets) regagne leur poids. Le mot du reste (« 35 min restantes ») reste calculé par la carte
 * (`resteTexte`, App.jsx) : la surface de la carte le dit au lecteur d'écran, et il est là avant ce module.
 * Ce module n'importe jamais App.jsx (poids.test.mjs). */
import { tr } from './i18n.js';
import { Fi } from './ui.jsx';
import { dureeTexte } from './enfantetat.js';

/* La pastille « Mode enfant » : le glyphe `child-head`, le mot, 11,5 / 700, le gris doux, rayon 10, 26 de haut — à la place de la
 * source de la carte large ; « Limites levées » en accent doux (`unlock`) quand le parent les a levées (E14). `petite` : le glyphe
 * seul, 20 de haut, sur la compacte (E17). Un profil désactivé n'a pas de pastille (§ 6.3 : le bandeau de la popup est le seul
 * endroit qui le dit). */
export function PastilleEnfant({ levee = false, petite = false, className = undefined }) {
  const mot = levee ? tr('Limites levées') : tr('Mode enfant');
  return (
    <span className={className} data-enfant={levee ? 'levee' : 'actif'} title={mot}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: petite ? 20 : 26, padding: petite ? '0 5px' : '0 9px', borderRadius: 10, background: 'var(--o-s1)', color: levee ? 'var(--o-accent-soft)' : 'var(--o-text2)', fontSize: 11.5, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
      <Fi i={levee ? 'unlock' : 'child-head'} size={12} />
      {!petite && <span>{mot}</span>}
    </span>
  );
}

/* Le chiffre de la carte ÉTROITE quand il n'y a pas de chiffre : la lune du coucher, le sablier du temps écoulé (E16), à la place du
 * volume ou du temps qui reste ; caché au lecteur d'écran — la phrase le dit. `em` : la largeur d'un « 00 » (`emChiffre`, App.jsx),
 * pour que la feuille lui donne la taille du chiffre qu'il remplace. */
export function GlypheHaut({ i, em }) {
  return (
    <span aria-hidden="true" className="o-gab-chiffre o-seul-etroit" style={{ display: 'flex', alignItems: 'center', marginTop: 4, lineHeight: 1, color: 'var(--o-text3)', '--o-em': em }}>
      <Fi i={i} size={20} />
    </span>
  );
}

/* Le pied d'un ÉCRAN à budget (E15 ; § 6.1, la maquette mot pour mot) : « Temps d'écran » et, à droite, ce qui reste (`texte`, le mot
 * que la carte a calculé : « 35 min restantes », « Écoulé », « Reprise à 07:30 ») ; la barre de 8 px (l'utilisé sur le total du jour,
 * les minutes accordées comprises) ; puis « 55 min utilisées » · « sur 1 h 30 ». En gris quand l'écran est bloqué. 14 + 8 + 8 + 5 + 14
 * = 49 px pour les 44 du volume qu'il remplace : la marge auto du pied prend la différence (ADR 0179) — mesuré dans la démo à la
 * tâche 9. Le volume, lui, reste dans la popup. Le temps du chargement, rien : collé au bas d'une carte de 184 px, il ne pousse rien. */
export function PiedTemps({ budget, bloque, texte }) {
  const gris = !!bloque;
  const pct = Math.min(100, Math.round(budget.utilise_s / Math.max(1, budget.total_s) * 100));
  return (
    <div data-temps="" style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, fontWeight: 800, lineHeight: '14px', whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--o-text2)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr('Temps d’écran')}</span>
        <span data-reste="" style={{ color: gris ? 'var(--o-text2)' : 'var(--o-text1)', flexShrink: 0 }}>{texte}</span>
      </div>
      <div aria-hidden="true" style={{ position: 'relative', height: 8, marginTop: 8, borderRadius: 4, background: 'var(--o-s1)', overflow: 'hidden' }}>
        <span data-utilise="" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct + '%', borderRadius: 4, background: gris ? 'var(--o-text3)' : 'var(--o-accent)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 5, fontSize: 11, fontWeight: 700, lineHeight: '14px', color: 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span>{tr('{t} utilisées', { t: dureeTexte(budget.utilise_s / 60) })}</span>
        <span>{tr('sur {t}', { t: dureeTexte(budget.total_s / 60) })}</span>
      </div>
    </div>
  );
}

/* La puce INERTE de la ligne de commandes étroite d'un écran bloqué et éteint (E16) : la lune ou le sablier et « Revient à 07:30 », à la
 * place d'« Allumer » — la maison déferait le `turn_on` vingt secondes plus tard. Deux écritures, et la feuille n'en montre qu'une
 * (index.css, `o-revient-long` / `o-revient-court`) : la phrase entière mesurait 143 px en français, plus en allemand (« Wieder ab
 * 08:30 »), pour 107 px de contenu sur un téléphone de 320 px — coupée, ou hors de la carte (passe bis du 17/10, point 3). Sous 148 px
 * de contenu (un téléphone de 390 px et moins, où l'espagnol ne tient plus), l'heure seule : le chiffre du haut dit déjà l'état, la
 * phrase de la carte l'écrit en mots. `style` : le dessin de la puce, que la carte lui passe. */
export function RevientPuce({ bloque, reprise, style }) {
  const h = reprise || '—';
  return (
    <span data-revient="" style={{ ...style, width: 'auto', padding: '0 10px', gap: 7, fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap', color: 'var(--o-text2)', cursor: 'default' }}>
      <Fi i={bloque === 'coucher' ? 'moon' : 'hourglass-end'} size={13} />
      <span className="o-revient-long">{tr('Revient à {h}', { h })}</span>
      <span className="o-revient-court" aria-hidden="true">{h}</span>
    </span>
  );
}

/* Ce que la carte demande, par son nom : UN import à la demande pour les quatre pièces. */
const PIECES = { pastille: PastilleEnfant, glyphe: GlypheHaut, pied: PiedTemps, revient: RevientPuce };
/** La pièce `quoi` (« pastille », « glyphe », « pied », « revient ») avec le reste des props ; un nom inconnu ne rend rien. */
export default function CarteEnfant({ quoi, ...props }) {
  const Piece = PIECES[quoi];
  return Piece ? <Piece {...props} /> : null;
}
