/* La carte d'un lecteur, et le mode enfant qui s'y pose.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, Suspense } from 'react';
import { lazyRecharge } from '../recharge.js';
import { medPlayers } from '../state.js';
import { LAVIS } from '../theme.js';
import { commanderService } from '../actions.js';
import { Fi, Surface, nomCarte } from '../ui.jsx';
import { lireLecteur, titreLecteur, nomLecteur, phraseLecteur, commandesLecteur, posLecteur, pourcentTexte, volumeTexte, glypheLecteur, etatVolume } from '../lecteur.js';
import { useAnnonces, useTeintePochette, annonceDe } from '../lecteuretat.js';
import { maisonAvecEnfant, useEtatEnfant, lecteurEnfant, budgetEcran, dureeTexte } from '../enfantetat.js';
import { cleTeinte, TEINTE_REPLI } from '../pochette.js';
import { useOptimiste } from '../optimiste.js';
import { LISERE } from '../styles.js';
import { tr } from '../i18n.js';
import { useHass, HASS_POLL_MS, Segment, lavisCarte, SURF_CARTE } from '../app/noyau.jsx';
import { zoneDe } from '../appareils/fiches.jsx';
import { useSeconde } from '../cartescustom/cartes.jsx';
import { RM_BTN, RmBascule, RmJauge, RM_CARD, RM_ICO, GlypheCarte, emChiffre, ChiffreHaut, RM_NAME, RM_SUB } from './briques.jsx';
import { hassQuiConnait } from './mesure.jsx';

/* Le mode enfant sur la carte d'un lecteur (chantier Mode enfant, E15 à E17 ; passe bis du 17/10, point 14) : la pastille, le glyphe du
 * haut de la carte étroite, le pied du temps d'écran et la puce « Revient à » (carteenfant.jsx, la pièce par `quoi`) ne se chargent que
 * pour un lecteur sous profil (`v.enfant`), dans un `Suspense` au repli nul — UN import, le boot n'en porte que l'adresse, et regagne
 * leur poids (lot14_chargement). Un DÉCOR de carte, comme l'orbe et le fond météo (passe bis 2 du 17/10) : introuvable même après le
 * rechargement unique, il ne rend rien — aucune barrière ne sépare la carte de la vue, et « Cette vue n'a pas pu s'afficher » pour toute
 * maison sous profil serait payer un pied du temps manquant au prix de l'écran. */
const CarteEnfant = lazyRecharge(() => import('../carteenfant.jsx'), { decor: true });

/* ── La carte d'un LECTEUR (chantier Médias ; sa maquette « Cartes médias », cadre 1a ; M2 A, M5 à M8, M10, M11, M13 ; ADR 0207) ──
 *
 * La carte 1a aux tailles de la maison (184 ; 176 de large au téléphone ; compacte 88), dans le cadre des cartes de la maison
 * (`RM_CARD`, le liseré, la surface qui ouvre la popup, `o-panne` muette) et, pour la première fois pour un lecteur, dans la
 * grille commune de la carte étroite (`o-gabarit`, ADR 0202 — la tâche 5 écrit l'écriture étroite) :
 *  - la ligne du haut : la plaque de 38 px — la pochette (`object-fit: cover`), sinon le glyphe `speaker` ou `screen`
 *    (`device_class: tv`), le gris doux éteinte ou inactive ; à droite, la SOURCE (`app_name` seulement : « Netflix » — Home
 *    Assistant ne dit pas quel service joue sur une Echo, et son attribut `source` n'est pas une source) et l'INTERRUPTEUR s'il
 *    sert (M10 : les bits `TURN_ON` et `TURN_OFF`, et pas une Echo — « une Echo ne s'éteint pas ») — sauf bloquée par le mode
 *    enfant : allumé, l'écran serait rééteint vingt secondes plus tard, la maison ne tend pas un bouton qu'elle défait ;
 *  - 10 px plus bas, le nom (15 / 700, une ligne) et la PHRASE (M6, § 5 : `phraseLecteur`), dans son encre ;
 *  - la PROGRESSION (3 px), en lecture ou en pause avec une durée : elle avance seule chaque seconde (`ProgressionLecteur`), sans
 *    redessiner la carte ;
 *  - le PIED (allumée seulement) : la puce lecture/pause (44 × 44, M11 ; ABSENTE s'il n'y a rien à reprendre — « Rien en lecture »
 *    n'a pas de puce inerte, passe bis 2 du 17/10) et la zone du
 *    volume — « Volume 30 % » (« Muet », en retrait), puis la barre de la maison (`RmJauge`, piste 24, `pan-y`) en accent ; coupé,
 *    le remplissage disparaît et le repère est gris. Le budget : 38 + 10 + 18 + 2 + 15 + 8 + 3 + 8 + 44 = 146, la marge auto du pied
 *    prend les 4 px qui restent (ADR 0179 : aucune marge fixe ne pousse le corps dehors).
 *  - la COULEUR est celle de la pochette (M8) : en lecture, le lavis prend sa teinte dominante (pochette.js, mis en cache par titre
 *    et artiste) de 0,20 en haut à 0,03 en bas, 0,08 en pause ; sans pochette, ou si le canvas est souillé, le rose de la maison.
 *    La barre de volume, elle, est en accent (la maquette), pas dans la teinte.
 * Les gestes (M13) : toucher la carte (la `Surface`) ouvre la popup ; la puce envoie `media_pause` si le lecteur joue, `media_play`
 * sinon — jamais `media_play_pause` ; la barre envoie `volume_set` au relâcher, et `volume_mute {is_volume_muted: false}` d'abord si
 * le son était coupé ; la bascule envoie `turn_on` ou `turn_off` selon l'état AFFICHÉ, jamais `toggle`. Le geste d'abord
 * (`useOptimiste` : 6 s pour la lecture et la marche ; pour le volume, 5 s de réponse et un relevé du pont — 18/10). Précédent et suivant
 * sont dans la popup (M2 A).
 * Les états (M7) : en lecture, en pause, rien en lecture, éteinte (la plaque grise, pas de pied, la bascule en haut), indisponible
 * (`o-panne`, la phrase rouge, ni bascule ni pied), une annonce en vol (M9 : « Annonce : « … » », six secondes).
 */

/* Ce que la carte, la compacte, la popup et « En ce moment » lisent d'un lecteur, dans un `hass` VIVANT : la carte s'abonne à SON
 * entité et à son JUMEAU (M14 : `useHass` — la vue qui la porte ne surveille pas toujours `media_player.`, et un geste se relit
 * dans ce relevé-là) ; la lecture pure (`lireLecteur`), la phrase, les bits ; le geste d'abord ; l'annonce en vol (lecteuretat.js) ;
 * la teinte de la pochette, lue une fois par titre et artiste (M8). Un identifiant qui est celui du JUMEAU (une vue personnelle qui
 * épinglait la jumelle HACS, § 13) ouvre la même carte. Un lecteur que l'appariement ne connaît pas (la Bibliothèque des cartes)
 * est lu seul. `actif` faux : rien ne s'abonne, et rien ne se rend. */
function useVueLecteur(hass, id, label = null, actif = true) {
  const lecteur = actif ? (medPlayers().find(p => p.haid === id || p.ma === id) || { haid: id, ma: null, alexa: false }) : null;
  const vivant = useHass(lecteur ? [lecteur.haid, lecteur.ma].filter(Boolean) : []);
  const H = hassQuiConnait(vivant, hass, lecteur ? lecteur.haid : id);
  const S = (H && H.states) || {};
  useAnnonces();
  const l = lecteur ? lireLecteur(S, lecteur) : null;
  const [ovMarche, poserMarche] = useOptimiste(l ? l.on : null);
  const [ovLecture, poserLecture] = useOptimiste(l ? l.playing : null);
  /* Le filet du volume et du muet (son retour du 18/10 : la barre « revient en arrière avant de se mettre là où je l'ai réglé ») : une
   * Echo se règle par sa jumelle HACS, qui met 1,9 à 2,8 s à rapporter le volume (mesuré chez lui), et le pont ne le voit qu'au relevé
   * suivant (`HASS_POLL_MS`). Quatre secondes ne couvraient pas les deux : la barre retombait sur l'ancien volume, puis sautait au
   * nouveau. Cinq secondes de réponse et un relevé ; une réponse, quelle qu'elle soit (la maison qui ramène au plafond), le lève aussitôt. */
  const filetVolume = 5000 + HASS_POLL_MS;
  const [ovVol, poserVol] = useOptimiste(l ? l.vol : null, filetVolume);
  /* Le son RENDU par le geste (passe bis 2 du 17/10) : tirer la barre d'un son coupé l'allume (`volume_mute` faux d'abord) ; la carte ne
   * redit pas « Muet » entre le relâcher et la réponse de l'appareil. Et le volume SOUS LE DOIGT, tant que la barre est tenue (`RmJauge`,
   * `onGlisse`) : le chiffre suit le doigt, comme la barre — l'ordre, lui, ne part qu'au relâcher. */
  const [ovMuet, poserMuet] = useOptimiste(l ? l.muted : null, filetVolume);
  const [glisse, poserGlisse] = useState(null);
  /* Le mode enfant (chantier Mode enfant, E21) : ce que le serveur dit de CE lecteur — son profil, le plafond, le blocage, le budget
   * d'écran —, lu une fois pour tout l'écran (enfantetat.js), et seulement si la maison a un profil : sans, rien ne s'abonne. */
  const enfantActif = actif && !!lecteur && maisonAvecEnfant();
  const { etat: etatEnfant } = useEtatEnfant(enfantActif);
  // « Limité à 40 % » quatre secondes après un geste qui a buté sur le plafond (§ 6.1).
  const [bute, poserBute] = useOptimiste(null, 4000);
  const teinte = useTeintePochette(l && l.on && !l.indispo && l.art ? l.art : null, l ? cleTeinte(l) : null);
  if (!l) return null;
  const maintenant = Date.now();
  const on = !l.indispo && (ovMarche != null ? ovMarche : l.on);
  const playing = on && (ovLecture != null ? ovLecture : l.playing);
  /* La garde (passe bis 3 du 17/10, point 1) : un lecteur qui n'est plus vivant — indisponible, éteint — n'a plus de doigt sur sa barre.
   * La valeur glissée s'OUBLIE, même si la barre n'a pas pu le dire (elle le dit en partant, `RmJauge`) : revenue, l'Echo dit son volume
   * et son muet, jamais celui d'un geste d'avant. Un état remis pendant le rendu : React rejoue ce composant avant d'afficher quoi que ce soit. */
  if (glisse != null && !on) poserGlisse(null);
  const doigt = on ? glisse : null;
  // Sous le doigt (`doigt`), la valeur du geste ; sinon l'avance du geste (`ovVol`), puis ce que dit l'appareil. Le son est déjà rendu : le relâcher le rend.
  const vol = l.hasVol ? (doigt != null ? doigt : ovVol != null ? ovVol : l.vol) : null;
  const muted = doigt != null ? false : ovMuet != null ? ovMuet : !!l.muted;
  const annonce = annonceDe(lecteur.haid, maintenant) || (lecteur.ma ? annonceDe(lecteur.ma, maintenant) : null);
  const enfant = enfantActif ? lecteurEnfant(etatEnfant, lecteur.haid, lecteur.ma) : null;
  // Le profil AGIT : allumé, et les limites ne sont pas levées (E14) ; levées ou désactivé, la carte montre le profil sans borne.
  const limite = enfant && enfant.actif && !enfant.leve_jusqua ? enfant : null;
  const plafond = limite && limite.plafond != null ? Math.max(0, Math.min(100, Math.round(limite.plafond))) : null;
  // Le budget suit ce qui AGIT (passe bis du 17/10, point 11) : un profil désactivé, ou des limites levées, n'a ni pied du temps ni
  // « Écoulé » — ni pastille ni panneau (§ 6.3) ; la carte redevient celle d'avant, le volume au pied.
  const budget = limite ? budgetEcran(limite, etatEnfant, maintenant, on && !l.indispo) : null;
  const appel = (ent, service, data) => commanderService(H, ent, 'media_player', service, { entity_id: ent, ...(data || {}) });
  // Inactive (`idle`, `on` : le menu d'une appli), rien n'est en pause ni à reprendre — l'état prime sur un titre prêté par l'appli (§ 5).
  const titre = l.idle ? null : titreLecteur(l);
  return {
    id: lecteur.haid, lecteur, l, hass: H, nom: nomLecteur(S, lecteur, label), piece: zoneDe(lecteur.haid),
    on, playing, paused: on && !playing && !l.idle && !!(l.paused || titre), indispo: l.indispo, vol, muted, annonce,
    phrase: phraseLecteur(l, { annonce, marche: ovMarche, lecture: ovLecture, maintenant, enfant: limite }),
    cmd: commandesLecteur(l),
    // « r,g,b » de la pochette ; la dernière teinte connue le temps de la lecture ; le rose de la maison sans pochette (M8).
    teinte: teinte || TEINTE_REPLI,
    /* Rien à reprendre : ni en lecture, ni en pause, ni un titre — la puce lecture/pause n'est PAS dessinée (M11 : rien d'inerte à
     * l'écran ; passe bis 2 du 17/10) : c'est exactement quand la phrase dit « Rien en lecture » (`phraseLecteur`). Le volume reste. */
    reprenable: !!(l.playing || l.paused || titre),
    lecture: () => { poserLecture(!playing); appel(l.ctl, playing ? 'media_pause' : 'media_play'); },
    marche: (allumer) => { poserMarche(!!allumer); appel(lecteur.haid, allumer ? 'turn_on' : 'turn_off'); },
    /* Le volume ne dépasse pas le plafond du mode enfant (E7, E15) : un geste au-delà pose le plafond — jamais plus haut — et la
     * carte dit « Limité à 40 % » quatre secondes. */
    volume: (v) => {
      let n = Math.round(v);
      if (plafond != null && n > plafond) { poserBute(true); n = plafond; }
      poserVol(n);
      if (l.muted) { poserMuet(false); appel(l.volId, 'volume_mute', { is_volume_muted: false }); }
      appel(l.volId, 'volume_set', { volume_level: n / 100 });
    },
    muet: (coupe) => { poserMuet(!!coupe); appel(l.volId, 'volume_mute', { is_volume_muted: !!coupe }); },
    // Le volume sous le doigt (`RmJauge`, `onGlisse`) : la valeur du geste, `null` quand le doigt s'en va.
    suivre: poserGlisse,
    precedent: () => appel(l.ctl, 'media_previous_track'),
    suivant: () => appel(l.ctl, 'media_next_track'),
    chercher: (secondes) => appel(l.ctl, 'media_seek', { seek_position: Math.round(secondes) }),
    aleatoire: (actif) => appel(l.ctl, 'shuffle_set', { shuffle: !!actif }),
    repeter: (mode) => appel(l.ctl, 'repeat_set', { repeat: mode }),
    // Pour la popup : l'avance d'un geste fait là-bas.
    avancerLecture: poserLecture, avancerMarche: poserMarche,
    /* Le mode enfant (E15 à E17) : ce que le serveur dit du lecteur (null sans profil) ; ce qui AGIT (`limite`) ; le plafond du moment ;
     * le blocage (`coucher`, `temps`, null) ; le budget d'écran ; la butée des quatre secondes ; la pastille, et sa variante levée. */
    enfant, limite, plafond, bloque: limite ? limite.bloque || null : null, budget, bute: !!bute && doigt == null, reprise: enfant ? enfant.reprise || null : null,
    pastille: !!enfant && (!!enfant.actif || !!enfant.leve_jusqua), levee: !!(enfant && enfant.leve_jusqua),
  };
}

/* La progression d'une carte (§ 6.1) : 3 px, le rempli en `--o-text2`. Elle seule bat la seconde en lecture (`useSeconde`) : la
 * position publiée (`media_position_updated_at`) avance d'autant, sans redessiner la carte entière. À la carte LARGE seule
 * (`o-seul-large`) : le § 6.2 ne la liste pas sur la carte étroite, et son budget de 150 px (ADR 0202) ne la loge pas sous un nom
 * de deux lignes — à 360 et 320 px le pied tombait à 178 sur 184 (passe bis, 17/10). */
function ProgressionLecteur({ l, playing }) {
  useSeconde(playing);
  const pos = posLecteur(l, Date.now());
  const pct = l.dur ? Math.min(100, Math.max(0, (pos || 0) / l.dur * 100)) : 0;
  return (
    <div className="o-seul-large" aria-hidden="true" data-progression="" style={{ position: 'relative', height: 3, marginTop: 8, borderRadius: 2, background: 'var(--o-s1)', overflow: 'hidden', flexShrink: 0 }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct + '%', borderRadius: 2, background: 'var(--o-text2)' }} />
    </div>
  );
}

/* La puce de sa maquette (`ChipButton`) sur la carte : 44 × 44, arrondi 12, le gris doux, sans bordure, positionnée (`RM_BTN` : peinte
 * après la surface, elle reçoit son clic). Elle n'est dessinée que s'il y a quelque chose à reprendre (`v.reprenable`) : « Rien en
 * lecture » n'a pas de puce inerte (M11 ; passe bis 2 du 17/10), la zone du volume reste seule au pied.
 * `o-puce-lecteur` : la vue Pièce au téléphone serre les `o-rmbtn` (index.css) ; ces puces gardent leur rembourrage et leur corps. */
const RM_MEDIA_PUCE = { ...RM_BTN, flex: 'none', width: 44, height: 44, padding: 0, borderRadius: 12, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const CLASSE_PUCE_LECTEUR = 'o-rmbtn o-puce-lecteur';
function PuceLecture({ v }) {
  return (
    <button type="button" aria-label={(v.playing ? tr('Mettre en pause') : tr('Lire')) + ' ' + v.nom} title={v.playing ? tr('Mettre en pause') : tr('Lire')}
      onClick={(e) => { e.stopPropagation(); v.lecture(); }} className={CLASSE_PUCE_LECTEUR} style={RM_MEDIA_PUCE}>
      <Fi i={v.playing ? 'pause' : 'play'} size={14} />
    </button>
  );
}
// Le remplissage de la barre de volume (§ 6.1) : de l'accent éclairci à l'accent ; coupé, rien, et le repère gris.
const GRADE_VOLUME = 'linear-gradient(90deg,color-mix(in oklab, var(--o-accent) 55%, #fff),var(--o-accent))';
// Ce que la fiche d'un lecteur (fichemedia.jsx, à la demande) reçoit d'ici : la bascule, la barre, le groupe segmenté et le dégradé du volume (M12).
const BRIQUES_MEDIA = { RmBascule, RmJauge, Segment, gradeVolume: GRADE_VOLUME };

/* ── Le mode enfant sur la carte (chantier Mode enfant, E15 à E17 ; § 6.1, § 6.2) ──────────────────────────────────────────────── */
/* La pastille, le glyphe du haut, le pied du temps et la puce « Revient à » vivent dans carteenfant.jsx, à la demande (passe bis du
 * 17/10, point 14). Reste ici ce que la carte dit AVANT que ce module n'arrive : le mot du reste d'un budget d'écran (§ 6.1) —
 * « 35 min restantes », « Écoulé », « Reprise à 07:30 » (au coucher) —, que la surface de la carte lit au lecteur d'écran et que le
 * pied du temps reçoit tout fait. */
const resteTexte = (budget, bloque, reprise) => (bloque === 'coucher' ? tr('Reprise à {h}', { h: reprise || '—' })
  : bloque === 'temps' || !budget.reste_s ? tr('Écoulé') : tr('{t} restantes', { t: dureeTexte(budget.reste_s / 60) }));

function RoomMediaCard({ id, hass, onOpen, label = null }) {
  const v = useVueLecteur(hass, id, label);
  const l = v.l;
  // Une pochette qui ne charge pas (`onError`) : le glyphe reprend sa place, jusqu'à la pochette suivante.
  const [artKo, setArtKo] = useState(null);
  const pochette = v.on && !v.indispo && l.art && l.art !== artKo ? l.art : null;
  const joue = v.on && !v.indispo && (v.playing || v.paused);
  /* Le mode enfant (chantier Mode enfant, E15, E16 ; § 6.1) : bloqué — le coucher, le temps écoulé —, la plaque est grise avec la lune
   * ou le sablier, sans lavis ; un écran à budget porte au pied le TEMPS (même éteint) à la place du volume, qui reste dans la popup. */
  const bloque = v.bloque;
  const temps = v.budget;
  // La plaque : la pochette, sinon le glyphe sur la teinte en lecture ou en pause ; le gris doux éteinte, inactive ou bloquée, le gris éteint muette.
  const [fond, encre] = v.indispo || bloque ? ['var(--o-s1)', 'var(--o-text3)'] : joue ? ['rgba(' + v.teinte + ',.18)', 'var(--o-text1)'] : v.on ? ['var(--o-s1)', 'var(--o-text1)'] : ['var(--o-s1)', 'var(--o-text3)'];
  // Le lavis (M8) : de 0,20 à 0,03 en lecture, 0,08 en pause, rien autrement — ni bloquée.
  const lavis = bloque ? null : v.playing ? [.2, .03] : joue ? [.08, .03] : null;
  // La puce lecture/pause : le lecteur sait lire ou mettre en pause (M11) ET il y a quelque chose à reprendre — « Rien en lecture » n'en a pas.
  const puce = v.cmd.lecture && v.reprenable;
  const piedEtroit = v.on && !v.indispo && (puce || v.vol != null);
  const pied = temps ? !v.indispo : piedEtroit;
  // Les mots du pied : « Volume 30 % » ; sous profil « Volume 30 % · max 40 % », et « Limité à 40 % » quatre secondes après un geste qui a buté.
  const texteVolume = v.vol == null ? null : v.bute && v.plafond != null ? tr('Limité à {m}', { m: pourcentTexte(v.plafond) })
    : v.plafond != null && !v.muted ? tr('Volume {n} · max {m}', { n: pourcentTexte(v.vol), m: pourcentTexte(v.plafond) }) : volumeTexte(v.vol, v.muted);
  const texteTemps = temps ? resteTexte(temps, bloque, v.reprise) : null;
  const motPastille = v.pastille && !v.indispo ? (v.levee ? tr('Limites levées') : tr('Mode enfant')) : null;
  return (
    /* La carte n'est pas un bouton (ADR 0074) : la surface, premier enfant, dit ce que la carte affiche — le nom, la phrase, le
     * volume — et les commandes, positionnées, passent au-dessus d'elle. */
    <div className={'o-rmcard o-gabarit' + (v.indispo ? ' o-panne' : '')} data-lecteur=""
      style={{ ...RM_CARD, position: 'relative', textAlign: 'left', width: '100%', cursor: onOpen ? 'pointer' : 'default', overflow: 'hidden', justifyContent: 'flex-start',
        background: lavis && LAVIS ? lavisCarte(v.teinte, lavis[0], lavis[1]) : SURF_CARTE, border: LISERE }}>
      {onOpen && <Surface onClick={() => onOpen(id)} label={nomCarte(v.nom, v.phrase.texte, pied ? (temps ? texteTemps : v.vol != null ? texteVolume : null) : null, motPastille)} />}
      {/* La ligne du haut : la plaque ; à droite, la source (M10) — ou la pastille « Mode enfant » à sa place (E15) — et la bascule si elle
        * sert (M10) — la carte large seule. Bloquée par le mode enfant (le coucher, le temps écoulé), elle ne s'offre PLUS (passe bis 2 du
        * 17/10) : allumé par cette bascule, l'écran serait rééteint vingt secondes plus tard — un bouton tendu que la maison défait. La
        * phrase dit pourquoi, le pied dit quand il revient ; le parent qui veut l'écran lève les limites (la popup). */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ ...RM_ICO(fond, encre), overflow: 'hidden', marginRight: 'auto' }}>
          {/* `onError` n'est pas une interaction : c'est le repli quand la pochette ne charge pas. */}
          {bloque ? <Fi i={bloque === 'coucher' ? 'moon' : 'hourglass-end'} size={17} /> : pochette ? (
            /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- voir le commentaire ci-dessus */
            <img src={pochette} alt="" onError={() => setArtKo(l.art)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : <GlypheCarte id={id} size={17}><Fi i={glypheLecteur(l)} size={17} /></GlypheCarte>}
        </span>
        {/* Les aides du mode enfant arrivent à la demande (carteenfant.jsx, `CarteEnfant quoi=…`) : leur repli ne dessine rien — la plaque
          * de 38 px tient déjà la hauteur de la ligne, la carte garde ses 184 px, rien ne saute. */}
        {motPastille ? <Suspense fallback={null}><CarteEnfant quoi="pastille" className="o-seul-large" levee={v.levee} /></Suspense>
          : v.on && !v.indispo && l.app && <span className="o-seul-large" data-source="" style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', lineHeight: '26px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 104 }}>{l.app}</span>}
        {!v.indispo && v.cmd.marche && !bloque && <RmBascule className="o-seul-large" on={v.on} nom={v.nom} onToggle={() => v.marche(!v.on)} />}
        {/* Le chiffre de la carte ÉTROITE (§ 6.2, la grille commune) : le volume, « 30 » et « % » ; « Muet » quand le son est coupé ; rien
          * éteinte ou indisponible. Caché au lecteur d'écran : la barre le dit. Sous profil (E16) : le temps qui reste sur un écran à
          * budget (« 35 min », « 1 h 25 »), la lune ou le sablier quand il est bloqué. */}
        {!v.indispo && bloque ? <Suspense fallback={null}><CarteEnfant quoi="glyphe" i={bloque === 'coucher' ? 'moon' : 'hourglass-end'} em={emChiffre('00')} /></Suspense>
          : !v.indispo && temps ? (temps.reste_s != null && temps.reste_s >= 3600 ? <ChiffreHaut v={dureeTexte(temps.reste_s / 60)} /> : <ChiffreHaut v={Math.round((temps.reste_s || 0) / 60)} u="min" />)
          : v.on && !v.indispo && v.vol != null && (v.muted ? <ChiffreHaut v={tr('Muet')} /> : <ChiffreHaut v={v.vol} u="%" />)}
      </div>
      <div style={{ marginTop: 'var(--o-milieu-haut, 10px)', minWidth: 0 }}>
        <div className="o-gab-nom" style={{ ...RM_NAME, fontSize: 15 }}>{v.nom}</div>
        <div className="o-gab-phrase" style={{ ...RM_SUB, color: v.phrase.encre, '--o-n': Math.max(1, v.phrase.texte.length) }}>{v.phrase.texte}</div>
      </div>
      {joue && !!l.dur && <ProgressionLecteur l={l} playing={v.playing} />}
      {/* La ligne de commandes de la carte ÉTROITE (§ 6.2 ; ADR 0202), 44 px collés au pied : allumée, la puce lecture/pause (s'il y a
        * quelque chose à reprendre) et la barre (piste 24 dans une zone de 44, `pan-y`) — « Rien en lecture » : la barre seule, la ligne
        * tient ses 44 px ; éteinte, UNE puce « Allumer » (`turn_on`) — la bascule et la source sont à la carte
        * large seule (M10, comme le chauffage étroit, T9) ; rien d'autre. Au téléphone, la plaque n'est PAS un interrupteur (M13) :
        * rien ne se déclenche en touchant la carte hors de cette ligne. */}
      {/* Bloquée et éteinte (E16) : pas d'« Allumer » — la maison déferait le `turn_on` vingt secondes plus tard ; « Revient à 07:30 »,
        * inerte, à sa place. La barre, elle, porte le plafond (hachurée). */}
      {!v.indispo && (v.on ? piedEtroit : (bloque || v.cmd.marche)) && (
        <div className="o-seul-etroit" data-commandes="" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 'var(--o-pied-haut, 9px)', minHeight: 'calc(var(--o-pied-haut, 9px) + 44px)' }}>
          {v.on ? (<>
            {puce && <PuceLecture v={v} />}
            {v.vol != null && (
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* `etatVolume` : « Muet », « max 40 % » sous un plafond, pour le lecteur d'écran (passe bis du 17/10, point 9). */}
                <RmJauge v={v.vol} couleur={v.muted ? 'var(--o-text3)' : 'var(--o-accent)'} grade={v.muted ? 'transparent' : GRADE_VOLUME} eteinte={false} zone={44} marge={0} plafond={v.plafond}
                  etat={etatVolume(v.muted, v.plafond)} label={tr('Volume') + ' ' + v.nom} onCommit={v.volume} onGlisse={v.suivre} />
              </div>
            )}
          </>) : bloque ? (
            <Suspense fallback={null}><CarteEnfant quoi="revient" bloque={bloque} reprise={v.reprise} style={RM_MEDIA_PUCE} /></Suspense>
          ) : (
            <button type="button" className={CLASSE_PUCE_LECTEUR} aria-label={tr('Allumer') + ' ' + v.nom} title={tr('Allumer')} onClick={(e) => { e.stopPropagation(); v.marche(true); }}
              style={{ ...RM_MEDIA_PUCE, width: 'auto', padding: '0 14px', gap: 8, fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap' }}>
              <Fi i="power" size={13} /><span>{tr('Allumer')}</span>
            </button>
          )}
        </div>
      )}
      {/* Le pied d'une carte large, allumée : la puce lecture/pause (s'il y a quelque chose à reprendre) et la zone du volume (44 px),
        * collées au pied par la marge auto. Un écran à budget (E15) : le TEMPS à la place du volume, même éteint ; la barre reçoit le
        * plafond (hachurée), et le mot du volume dit le plafond. */}
      {pied && (
        <div className="o-seul-large" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 'auto', paddingTop: 'var(--o-pied-haut, 8px)' }}>
          {v.on && puce && <PuceLecture v={v} />}
          {temps ? <Suspense fallback={null}><CarteEnfant quoi="pied" budget={temps} bloque={bloque} texte={texteTemps} /></Suspense>
            : v.vol != null && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div data-volume="" style={{ fontSize: 11.5, fontWeight: 800, lineHeight: '14px', color: v.muted ? 'var(--o-text2)' : v.bute && v.plafond != null ? 'var(--o-accent-soft)' : v.plafond != null ? 'var(--o-text2)' : 'var(--o-accent-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{texteVolume}</div>
              <RmJauge v={v.vol} couleur={v.muted ? 'var(--o-text3)' : 'var(--o-accent)'} grade={v.muted ? 'transparent' : GRADE_VOLUME} eteinte={false} marge={6} plafond={v.plafond}
                etat={etatVolume(v.muted, v.plafond)} label={tr('Volume') + ' ' + v.nom} onCommit={v.volume} onGlisse={v.suivre} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { CarteEnfant, useVueLecteur, BRIQUES_MEDIA, RoomMediaCard };
