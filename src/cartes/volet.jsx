/* Les cartes d'un volet.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { gestesCover, positionPubliee, enPanne } from '../outils.js';
import { LAVIS } from '../theme.js';
import { commander } from '../actions.js';
import { Surface, nomCarte, REDUCE_MOTION, Fi } from '../ui.jsx';
import { useOptimiste } from '../optimiste.js';
import { useConfirmerOuverture } from '../confirmerouvrant.js';
import { LISERE } from '../styles.js';
import { coverFerme, coverOuvert, vueVolet, plaqueVolet, iconeSelonEtat } from '../voletecran.js';
import { useCourseVolet, ordreEtCourse, ordreEtArret } from '../voletcourse.js';
import { useEtatVolets, voletDe } from '../voletsetat.js';
import { Ico } from '../icones.jsx';
import { tr } from '../i18n.js';
import { quandLumiere } from '../lumieres.js';
import { lavisCarte } from '../app/noyau.jsx';
import { RM_BTN, RM_CARD, RM_CARD_HAUT, RM_SOUS_PLAQUE, RM_ICO, GlypheCarte, RM_NAME, RM_SUB, RmJauge, ChiffreHaut, RM_MILIEU } from './briques.jsx';
import { RM_INERTE } from './chauffage.jsx';

/* Quand un volet est-il fermé ? Le verdict — `coverFerme`, `coverOuvert` —
 * vit dans voletecran.js depuis le chantier Volets : le seuil n'y est plus
 * un réglage (V12, sa demande du 12/10), et la fiche du volet, chargée à la
 * demande, le lit au même endroit que la carte. */

/* Un geste de cover (`gestesCover`, outils.js) prêt à partir : `surEchec` dit
 * qu'Home Assistant l'a refusé, après coup (`ordreEtCourse`, voletcourse.js). */
const envoyerGeste = (hass, id, g) => (surEchec) => commander(hass, id, g.capacite, g.valeur, null, null, surEchec);

/* Muet, la règle de la lumière (`phraseLumiere`, lumieres.js ; audit du 12/11, lot 4, E24) : « Indisponible depuis 14:20 »
 * — « hier », la date au-delà —, en rouge ; sans heure lisible, « Indisponible ». La phrase et sa couleur, rien d'autre. */
const phraseMuette = (st) => { const q = st ? quandLumiere(st.last_changed) : null; return q ? tr('Indisponible depuis {h}', { h: q }) : tr('Indisponible'); };

// « Ouvrir » armé (un portail, un garage) : le bleu plein et le blanc — une puce choisie.
const RM_CONFIRME = { background: 'var(--o-accent-fond)', color: '#fff' };

/* L'ancienne carte d'un cover qui n'est pas un volet : garage, portail, velux,
 * ouvrant sans classe (V3). Ses trois boutons suivent son `supported_features`
 * (19/10) : Stop inerte sans STOP ; Monter et Descendre passent par la
 * position s'il ne sait que se placer, par ses lames s'il ne sait que
 * s'incliner ; sans SET_POSITION, ni glissière ni pourcentage — il ne serait
 * qu'inventé. Muet (`enPanne` : `unknown` aussi), tout est inerte. */
function RoomCoverCard({ id, hass, onOpen, titre = null }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const gestes = gestesCover(st);
  const publiee = positionPubliee(st);
  const realPos = publiee != null ? Math.max(0, Math.min(100, Math.round(publiee))) : (st && st.state === 'open' ? 100 : 0);
  const [ov, setOv] = useOptimiste(realPos);
  const pos = ov != null ? ov : realPos;
  const ferme = coverFerme(st, pos);
  const mort = enPanne(id, st);
  const nom = titre || a.friendly_name || id;
  // Ouvrir un portail ou un garage se fait en deux temps (chantier du 20/11, A9 ; Gladys X6) : la phrase dit « Confirmer ? » 4 s.
  const conf = useConfirmerOuverture(st);
  const arme = conf.armee && !mort;
  const mouvement = st && (st.state === 'opening' || st.state === 'closing') ? st.state : null;
  // Le sous-titre dit l'état en mots (maquettes du 14/09) ; le pourcentage
  // reste en haut à droite, la glissière montre la position.
  const sub = mort ? phraseMuette(st) : arme ? tr('Confirmer ?') : mouvement === 'opening' ? tr('Ouverture…') : mouvement === 'closing' ? tr('Fermeture…') : ferme ? tr('Fermé') : coverOuvert(pos) ? tr('Ouvert') : tr('Ouvert à {n} %', { n: pos });
  // Un refus de Home Assistant retire l'avance tout de suite (19/10).
  // Un ordre qui part défait la question posée (un portail armé, puis « Fermer ») : l'ouverture abandonnée ne part pas.
  const envoyer = (g, avance) => { if (mort || !g) return; conf.annuler(); if (avance != null) setOv(avance); commander(hass, id, g.capacite, g.valeur, null, null, () => setOv(null)); };
  // Un geste qui OUVRE un portail ou un garage se pose d'abord comme question ; tout autre part tout de suite (confirmerouvrant.js).
  const demander = (g, avance) => { if (mort || !g) return; conf.demander(g, pos, () => envoyer(g, avance)); };
  const poser = (v) => { if (gestes.placer) demander({ capacite: gestes.placer, valeur: v }, v); };
  // `armee` : « Ouvrir » porte la question — une coche sur le bleu plein, une puce choisie ; il reste actif, quel que soit son geste.
  const bouton = (g, armee = false) => ({ 'aria-disabled': !mort && (g || armee) ? undefined : true, className: 'o-rmbtn', style: { ...RM_BTN, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 6px', ...(!mort && (g || armee) ? null : RM_INERTE), ...(armee ? RM_CONFIRME : null) } });
  /* La carte n'est plus un `role="button"` qui englobe ses commandes (lot 13
   * de l'audit du 03/10, ADR 0074). Ce rôle rendait la glissière et les trois
   * boutons présentationnels — un lecteur d'écran ne les voyait plus —, et son
   * nom, « Ouvrir Volet salon », taisait l'état et prenait celui du bouton
   * « Ouvrir », qui LÈVE le volet (WCAG 2.5.3). La fiche s'ouvre par la
   * surface (`Surface`, ui.jsx), qui dit ce que la carte affiche : « Volet
   * salon, Ouvert à 60 % » ; les boutons, eux, nomment l'appareil. */
  return (
    <div className={'o-rmcard o-gabarit' + (mort ? ' o-panne' : '')} style={{ ...RM_CARD_HAUT, position: 'relative', cursor: onOpen ? 'pointer' : 'default',
      // Teinte d'état : volet ouvert = lavis VIOLET, gradué par la position — le bleu accent restait trop proche des autres cartes.
      ...(!ferme && LAVIS ? {
        background: lavisCarte('var(--o-purple-rgb)', .10 + pos * .0012),
      } : null),
      // Le liseré du réglage, comme toute carte (04/10).
      border: LISERE }}>
      {onOpen && <Surface onClick={() => onOpen(id)} label={nomCarte(nom, sub)} />}
      {/* La question d'un portail ou d'un garage se dit aussi au lecteur d'écran (la carte de la prise fait de même). */}
      <span className="o-vh" aria-live="polite">{arme ? tr('Confirmer ?') + ' ' + nom : ''}</span>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {/* Positionnée pour son store, l'icône passerait AU-DESSUS de la
          * surface et garderait le clic : elle le laisse passer, et un appui
          * sur elle ouvre la fiche, comme avant (lot 13 de l'audit du 03/10). */}
        <span style={{ ...RM_ICO(!ferme ? 'rgba(var(--o-purple-rgb),.16)' : 'var(--o-s1)', !ferme ? 'var(--o-purple)' : 'var(--o-text3)'), position: 'relative', overflow: 'hidden', pointerEvents: 'none' }}>
          {/* store qui descend dans le chip : hauteur = part fermée, suit la position en douceur */}
          <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: (100 - pos) + '%', background: 'linear-gradient(180deg,rgba(var(--o-purple-rgb),.34),rgba(var(--o-purple-rgb),.14))', transition: REDUCE_MOTION ? 'none' : 'height .7s cubic-bezier(.22,.61,.36,1)', pointerEvents: 'none' }} />
          <GlypheCarte id={id} size={18}><Ico name={(a.device_class === 'garage' || a.device_class === 'gate') ? 'garage' : 'blinds'} size={18} /></GlypheCarte></span>
        {(publiee != null || ov != null) && !mort && <span style={{ fontSize: 15, fontWeight: 800, color: ferme ? 'var(--o-text3)' : 'var(--o-text)' }}>{pos} %</span>}
      </div>
      {/* LE NOM SOUS LA PLAQUE (audit du 12/11) : la carte range depuis le haut (`RM_CARD_HAUT`), le nom 14 px sous la plaque
        * (`RM_SOUS_PLAQUE`), les commandes au pied par leur marge auto — sans jauge, le nom d'un garage tombait vers le bas. Avec sa
        * jauge, la carte est PLEINE (38 + 37 + 32 + 9 + 32 = 148 px sur 150) : aucune marge fixe ne s'ajoute, elle pousserait le corps
        * DEHORS (la leçon du 09/10, « au même niveau que l'Echo »). Sur la carte étroite, sans jauge, le nom passe sur deux lignes au
        * plus (`o-gab-nom`) : « Porte de garage motorisée » finissait en « … ». */}
      <div style={{ marginTop: gestes.placer ? 0 : RM_SOUS_PLAQUE, minWidth: 0 }}>
        <div className={gestes.placer ? undefined : 'o-gab-nom'} style={RM_NAME}>{nom}</div>
        {/* La question posée prend la couleur d'attention ; tout autre état garde le verdict commun (violet / gris). */}
        {arme ? <div style={{ ...RM_SUB, color: 'var(--o-warn)' }}>{sub}</div>
          : <div style={{ ...RM_SUB, color: mort ? 'var(--o-bad)' : !ferme ? 'var(--o-purple)' : 'var(--o-text3)' }}>{sub}</div>}
      </div>
      <div style={{ marginTop: 'auto' }}>
        {gestes.placer && <RmJauge key={conf.tour} v={pos} couleur="var(--o-purple)" grade="linear-gradient(90deg,rgba(var(--o-purple-rgb),.75),var(--o-purple))" actif={!mort} label={tr('Position') + ' ' + nom} onCommit={poser} />}
        {/* Les mêmes trois gestes que la carte compacte : ouvrir, stop, fermer — la glissière règle le reste. */}
        {/* Les boutons SEULS sont positionnés (RM_BTN), pas la rangée : peints
          * après la surface, ils reçoivent leurs clics, et l'écart entre deux
          * ouvre la fiche (relecture du lot 13). Leur nom commence par
          * le mot de leur bulle et nomme le volet : « Ouvrir Volet salon » est
          * ce bouton-ci, plus jamais la carte (lot 13 de l'audit du 03/10). */}
        <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
          <button aria-label={(arme ? tr('Confirmer ?') : tr('Ouvrir')) + ' ' + nom} title={arme ? tr('Confirmer ?') : tr('Ouvrir')} onClick={(e) => { e.stopPropagation(); if (arme) conf.confirmer(); else demander(gestes.monter, 100); }} {...bouton(gestes.monter, arme)}><Fi i={arme ? 'check' : 'angle-up'} size={14} /></button>
          <button aria-label={tr('Stop') + ' ' + nom} title={tr('Stop')} onClick={(e) => { e.stopPropagation(); envoyer(gestes.stop, null); }} {...bouton(gestes.stop)}><Fi i="square" size={12} /></button>
          <button aria-label={tr('Fermer') + ' ' + nom} title={tr('Fermer')} onClick={(e) => { e.stopPropagation(); envoyer(gestes.descendre, 0); }} {...bouton(gestes.descendre)}><Fi i="angle-down" size={14} /></button>
        </div>
      </div>
    </div>
  );
}

/* ── La carte d'un VOLET (chantier Volets, § 3.1-3.2 ; sa maquette « Cartes
 * volets », cadre 1a) ─────────────────────────────────────────────────────────
 *
 * Dans le cadre des cartes de la maison (`RM_CARD`, le liseré, le lavis, la
 * surface qui ouvre la fiche, `o-panne` muet), à leurs tailles (184 ; 176 de
 * large au téléphone) : la plaque en haut à gauche, un petit volet dessiné à
 * droite qui suit la position ; 14 px plus bas le nom et une phrase qui dit ce
 * qui va se passer (§ 4, voletecran.js), le pourcentage en grand à droite ; en
 * bas Monter, Stop, Descendre — Stop s'allume pendant une course. Plus de
 * glissière : la fiche a sa fenêtre. Seulement pour un VOLET (sa classe, V3) :
 * le garage et le portail gardent `RoomCoverCard`.
 *
 * La position dessinée est celle de la course (voletcourse.js) : un geste la
 * lance, Home Assistant la confirme — chez lui, Netatmo ne publie rien pendant
 * une à trois minutes (§ 5). La surface dit la position, puis la phrase
 * (« Volet salon, 60 %, Ferme à 20:54 ») ; chaque bouton nomme le volet, le
 * mot de sa bulle d'abord (ADR 0074, 0147). Les boutons seuls sont
 * positionnés (`RM_BTN`) : l'écart entre deux ouvre la fiche.
 *
 * Sur une carte étroite (le téléphone, sous 188 px de contenu), la grille commune
 * (`o-gabarit`, index.css ; passe téléphone, T14) : le petit volet s'efface — un
 * détail redondant —, le pourcentage monte en haut à droite (`ChiffreHaut`), le
 * nom passe sur toute la largeur, deux lignes au plus, la phrase dessous, sur une
 * ligne ; Monter, Stop et Descendre gardent leurs trois parts égales de 44 px, et
 * le mot « Stop » s'efface (il vit dans le nom du bouton).
 */
const PETIT_VOLET = { position: 'relative', width: 28, height: 34, boxSizing: 'border-box', borderRadius: 6, border: '2px solid var(--o-text3)',
  overflow: 'hidden', background: 'var(--o-sky)', flexShrink: 0, pointerEvents: 'none' };
// Le tablier part du haut ; pas de transition CSS : la course le pilote déjà.
const TABLIER = { position: 'absolute', left: 0, right: 0, top: 0,
  background: 'repeating-linear-gradient(180deg,rgba(var(--o-purple-rgb),.95) 0 3px,rgba(var(--o-purple-rgb),.55) 3px 4px)' };
// Monter, Stop, Descendre : 44 px de haut, arrondi 12, le gris doux, sans bordure (le `ChipButton` de sa maquette).
const RM_VOLET_BTN = { ...RM_BTN, height: 44, padding: 0, borderRadius: 12, border: 'none', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 };
// Stop pendant une course : allumé, le bleu plein et le texte blanc.
const RM_VOLET_STOP = { background: 'var(--o-accent-fond)', color: '#fff' };
/* Le pourcentage d'une carte LARGE : en grand à droite du nom (25 px / 800, « % » en
 * 15 px), à la première rangée, deuxième colonne de la grille du milieu (`RM_MILIEU`) —
 * la place de la température d'un radiateur ; sa taille et son écart se lisent dans la
 * feuille (`--o-chiffre-taille`, `--o-chiffre-ecart`), la valeur large pour repli. Une
 * carte étroite l'écrit en haut (`ChiffreHaut`), et la feuille n'en montre qu'un
 * (`o-seul-large`). Muet : « — ». La surface le dit déjà au lecteur d'écran. */
function ChiffreVolet({ pos }) {
  return (
    <span aria-hidden="true" className="o-volet-chiffre o-seul-large"
      style={{ gridColumn: 2, gridRow: 1, marginLeft: 'var(--o-chiffre-ecart, 10px)', display: 'flex', alignItems: 'baseline', gap: 3, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: 'var(--o-chiffre-taille, 25px)', letterSpacing: '-.02em' }}>{pos == null ? '—' : pos}</span>
      {pos != null && <span style={{ fontSize: 'calc(var(--o-chiffre-taille, 25px) * .6)' }}>%</span>}
    </span>
  );
}
function RoomVoletCard({ id, hass, onOpen, titre = null }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const a = (st && st.attributes) || {};
  const { etat } = useEtatVolets();
  const v = voletDe(etat, id);
  const course = useCourseVolet(id, st, v && v.manoeuvre);
  const vue = vueVolet({ st, course, v, etat });
  const { pos, enCourse } = vue;
  const nom = titre || a.friendly_name || id;
  // Muet, la phrase de la lumière (E24) ; la ligne 1 de voletecran.js reste « Indisponible » pour la fiche et la compacte.
  const sub = vue.muet ? phraseMuette(st) : vue.phrase;
  const [fond, encre] = plaqueVolet(vue.allume);
  /* Les gestes que le volet ACCEPTE (`vue.gestes`, son `supported_features`) : un ordre que le moteur d'actions refuse ne
   * lance pas de course, et un refus de Home Assistant, plus tard, l'oublie (`ordreEtCourse`, 19/10). */
  const agir = (g, cible) => { if (g) ordreEtCourse(id, cible, st, envoyerGeste(hass, id, g)); };
  const arreter = () => { if (vue.peutArreter) ordreEtArret(id, st, envoyerGeste(hass, id, vue.gestes.stop)); };
  return (
    <div className={'o-rmcard o-gabarit' + (vue.muet ? ' o-panne' : '')} data-volet="" style={{ ...RM_CARD, position: 'relative', cursor: onOpen ? 'pointer' : 'default',
      // Ouvert : le lavis violet, d'autant plus fort que le volet laisse entrer le jour (sa maquette : 0,04 + 0,12 × p / 100).
      ...(vue.allume && LAVIS ? { background: lavisCarte('var(--o-purple-rgb)', .04 + pos * .0012) } : null),
      border: LISERE }}>
      {onOpen && <Surface onClick={() => onOpen(id)} label={nomCarte(nom, pos == null ? null : pos + ' %', sub)} />}
      {/* La ligne du haut : la plaque, et à droite le petit volet (carte large) ou le pourcentage (carte étroite) — la feuille n'en montre qu'un. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <span style={RM_ICO(fond, encre)}><GlypheCarte id={id} size={17} selon={(n) => iconeSelonEtat(n, vue)}><Fi i={vue.glyphe} size={17} /></GlypheCarte></span>
        <span aria-hidden="true" className="o-volet-dessin o-seul-large" style={{ ...PETIT_VOLET, opacity: vue.muet ? .4 : 1 }}>
          {pos != null && <span style={{ ...TABLIER, height: (100 - pos) + '%' }} />}
        </span>
        <ChiffreHaut v={pos == null ? '—' : pos} u={pos == null ? null : '%'} />
      </div>
      {/* La rangée du radiateur (`RM_MILIEU`) : le nom et la phrase à gauche, le pourcentage d'une carte large à droite. Sur une carte
        * étroite il se tait : le nom et la phrase prennent toute la largeur (`o-gab-nom`, `o-gab-phrase`), et la longueur de la phrase
        * (`--o-n`) règle sa taille, de 12 à 10,5 px. */}
      <div style={RM_MILIEU}>
        <div style={{ minWidth: 0 }}>
          <div className="o-gab-nom" style={{ ...RM_NAME, fontSize: 15 }}>{nom}</div>
          <div className="o-gab-phrase" style={{ ...RM_SUB, color: vue.muet ? 'var(--o-bad)' : enCourse ? 'var(--o-purple)' : 'var(--o-text2)', '--o-n': Math.max(1, String(sub).length) }}>{sub}</div>
        </div>
        <ChiffreVolet pos={pos} />
      </div>
      {/* Monter et Descendre deviennent inertes à l'arrivée d'une course : `aria-disabled`, l'appui
        * ignoré — `disabled` faisait tomber le focus sur la page (relecture des tâches 6 à 12, point 5). Stop aussi,
        * muet ou sans le bit STOP (19/10). */}
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 'var(--o-pied-haut, 14px)' }}>
        <button aria-label={tr('Ouvrir') + ' ' + nom} title={tr('Ouvrir')} aria-disabled={vue.peutMonter ? undefined : true} onClick={(e) => { e.stopPropagation(); if (vue.peutMonter) agir(vue.gestes.monter, 100); }}
          className="o-rmbtn" style={{ ...RM_VOLET_BTN, ...(vue.peutMonter ? null : RM_INERTE) }}><Fi i="angle-small-up" size={17} /></button>
        <button aria-label={tr('Stop') + ' ' + nom} title={tr('Stop')} aria-disabled={vue.peutArreter ? undefined : true} onClick={(e) => { e.stopPropagation(); arreter(); }}
          className="o-rmbtn" style={{ ...RM_VOLET_BTN, ...(enCourse && vue.peutArreter ? RM_VOLET_STOP : null), ...(vue.peutArreter ? null : RM_INERTE) }}><Fi i="square" size={12} />{enCourse && vue.peutArreter && <span className="o-volet-stop-mot o-seul-large">{tr('Stop')}</span>}</button>
        <button aria-label={tr('Fermer') + ' ' + nom} title={tr('Fermer')} aria-disabled={vue.peutDescendre ? undefined : true} onClick={(e) => { e.stopPropagation(); if (vue.peutDescendre) agir(vue.gestes.descendre, 0); }}
          className="o-rmbtn" style={{ ...RM_VOLET_BTN, ...(vue.peutDescendre ? null : RM_INERTE) }}><Fi i="angle-small-down" size={17} /></button>
      </div>
    </div>
  );
}

export { envoyerGeste, RoomCoverCard, RoomVoletCard };
