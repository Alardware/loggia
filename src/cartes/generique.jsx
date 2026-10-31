/* La carte d'une entité sans carte à elle.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { LAVIS } from '../theme.js';
import { commanderService } from '../actions.js';
import { cvDomain, cvName, Surface, nomCarte, Fi } from '../ui.jsx';
import { appuiBascule } from '../prises.js';
import { nomClasse, nomDitFamille } from '../confort.js';
import { useOptimiste } from '../optimiste.js';
import { CLASSES_MOUVEMENT, couleurPile, niveauPile } from '../attention.js';
import { LISERE } from '../styles.js';
import { Ico } from '../icones.jsx';
import { tr } from '../i18n.js';
import { useGardeSwitch, decMax, iconeChoisie, hx, lavisCarte } from '../app/noyau.jsx';
import { pileDe } from '../appareils/fiches.jsx';
import { cvIcoEntite, OUVRANT_DCS, texteDate, PlugIcon } from '../cartescustom/cartes.jsx';
import { BIN_ETATS, RM_CARD, IlluOuvrant, RM_ICO, RmBascule, PileRepere, RM_NAME, RM_SUB, JaugePile, RM_BTN } from './briques.jsx';
import { lireNombre } from './mesure.jsx';

function RoomGenericCard({ id, hass, onOpen, label = null }) {
  const S = (hass && hass.states) || {};
  const st = S[id] || null;
  const a = (st && st.attributes) || {};
  const dom = cvDomain(id);
  const s = st ? st.state : null;
  const mort = !st || s === 'unavailable' || s === 'unknown';
  const nom = label || cvName(st, id);
  // Le carre d'une camera montre un appareil photo ; le repere en haut a
  // droite, la camera video — les deux glyphes de la maquette.
  const call = (d, svc, data) => commanderService(hass, id, d, svc, { entity_id: id, ...(data || {}) });
  const togglable = ['switch', 'input_boolean', 'fan', 'humidifier', 'siren'].indexOf(dom) >= 0;
  const on = !mort && (dom === 'lock' ? s === 'locked' : s === 'on');
  const [ov, setOv] = useOptimiste(s);
  const actif = ov != null ? ov : on;
  // Avant l'index de la découverte, une PRISE s'affiche ici, en switch ordinaire : la règle commune des switch que l'index ne classe pas (F2).
  const gs = useGardeSwitch(S, id, dom === 'switch');
  const basculer = () => {
    /* Avant l'index de la découverte, une PRISE s'affiche ici, en switch ordinaire
     * (relecture finale, A3, F2) : si l'état du serveur la nomme dans `protegees`,
     * ou n'a pas encore répondu — le chargement —, et qu'elle est allumée, sa
     * fiche demande ; la carte ne coupe pas d'un appui. Une erreur sans état ne
     * garde rien : un serveur trop vieux ne gêne pas indéfiniment. */
    if (dom === 'switch' && onOpen && appuiBascule({ on: actif, garde: gs.garde, ouvrable: true }) === 'fiche') { onOpen(id); return; }
    const nv = !actif; setOv(nv);
    if (dom === 'lock') call('lock', nv ? 'lock' : 'unlock');
    else call('homeassistant', nv ? 'turn_on' : 'turn_off');
  };
  const fmtN = (n) => decMax(Math.round(n * 10) / 10, 1);
  /* Une PRISE n'arrive plus ici : elle a sa carte (`RoomPriseCard`, chantier
   * Prises), sa puissance, sa phrase et sa courbe. Un switch qui n'est pas une
   * prise (P1) n'a pas de mesure à montrer. */
  const ico = iconeChoisie(id) || (dom === 'camera' ? 'camera' : cvIcoEntite(dom, id, st, nom));
  const etatsBin = BIN_ETATS()[a.device_class] || null;
  const danger = dom === 'binary_sensor' && !!(etatsBin && etatsBin[2]) && s === 'on';
  // Un ouvrant (porte, fenetre, garage, portail) : la carte d'avant, plus son
  // illustration en filigrane, qui suit l'etat (retour user du 15/09 : « comme
  // pour les plantes » — pas de bouton, pas de duree).
  const ouvrant = dom === 'binary_sensor' && OUVRANT_DCS.indexOf(a.device_class) >= 0;
  const ouvert = ouvrant && !mort && s === 'on';
  // La pile d'un capteur sans fil, lue dans son capteur soeur : le repere du
  // coin haut droit quand la carte n'a ni interrupteur ni mesure a y mettre.
  const pile = (dom === 'binary_sensor' || dom === 'sensor') && !mort ? pileDe(S, id) : null;
  // Une camera en direct est ALLUMEE, au sens de la carte : lavis, icone et
  // repere en bleu — la maquette entiere, pas seulement le sous-titre (retour
  // user du 14/09, deux fois : « pourquoi pas la couleur sur la carte »).
  const direct = dom === 'camera' && !mort && (s === 'streaming' || s === 'recording' || s === 'idle');
  let sub, couleur = 'var(--o-text3)', teinte = 'accent';
  // Un capteur DATÉ (05/10, suite « dates partout ») : `texteDate`, la règle
  // de la tuile et de la pastille. `parseFloat` y lisait l'année, « 2 026 |
  // Passage facteur | Mesure ».
  const dateTxt = dom === 'sensor' && !mort ? texteDate(st) : null;
  // Le capteur : sa mesure (en grand, en haut a droite) et, dessous, ses cinq
  // barres quand c'est une pile (retour user du 19/09). Une mesure de la table
  // a sa carte (`RoomMesureCard`, chantier Capteurs, C6).
  let mesure = null, barres = null, subLu = null;
  // Muet : « Indisponible » ; en rouge pour un capteur binaire (chantier Capteurs, C26), comme la carte d'une mesure.
  if (mort) { sub = tr('Indisponible'); if (dom === 'binary_sensor') couleur = 'var(--o-bad)'; }
  else if (dom === 'lock') { sub = s === 'locked' ? tr('Verrouillée') : s === 'unlocked' ? tr('Déverrouillée') : s === 'locking' ? tr('Verrouillage…') : s === 'unlocking' ? tr('Déverrouillage…') : s === 'jammed' ? tr('Bloquée') : String(s); teinte = 'ok'; couleur = actif ? 'var(--o-ok)' : 'var(--o-warn2)'; }
  else if (dom === 'camera') { sub = direct ? tr('En direct') : String(s); couleur = 'var(--o-accent-soft)'; }
  /* Le calme en neutre (chantier Capteurs, C26) : fermé, sans fumée, sans mouvement, intact — le gris doux ; ouvert, l'ambre du
   * dessin ; un mouvement, une présence, l'accent ; un danger qui sonne, le rouge, sa plaque et son lavis. */
  else if (dom === 'binary_sensor') {
    sub = etatsBin ? (s === 'on' ? etatsBin[0] : etatsBin[1]) : (s === 'on' ? tr('Détecté') : tr('RAS'));
    couleur = danger ? 'var(--o-bad)' : s !== 'on' ? 'var(--o-text2)' : CLASSES_MOUVEMENT.indexOf(a.device_class) >= 0 ? 'var(--o-accent-soft)' : 'var(--o-warn)';
    teinte = danger ? 'bad' : 'or';
  }
  // Une date n'est pas une mesure : ni le coin chiffré (22 px n'ont pas la
  // place d'un « 15 janv. 2027, 14:00 »), ni jauge, ni « Mesure ». Elle se dit
  // sur la ligne d'état, où elle passe à la ligne au lieu de s'y couper (la
  // mise en page cède, pas les mots) ; le nom de la carte la lit en clair.
  else if (dateTxt != null) { sub = <span style={{ whiteSpace: 'normal' }}>{dateTxt}</span>; subLu = dateTxt; }
  else if (dom === 'sensor') {
    // La mesure en grand en haut a droite (le gabarit). Plus de puces soeurs
    // (retour user du 19/09 : « revenir a la carte de base ») — la temperature et
    // l'humidite d'une station vivent dans la barre de confort de la piece. Une
    // mesure de la table n'arrive plus ici : sa carte a sa phrase et sa barre, et
    // la ligne « Libellé · VERDICT » est partie avec la jauge (chantier Capteurs, C11).
    const n = lireNombre(s);
    const unite = a.unit_of_measurement || '';
    mesure = n == null ? { v: String(s), u: '' } : { v: fmtN(n), u: unite };
    if (a.device_class === 'battery' && n != null) {
      barres = { n: Math.max(1, Math.min(5, Math.round(n / 20))), c: couleurPile(n, 'var(--o-ok)') };
      const faible = niveauPile(n) != null;
      sub = faible ? tr('Pile faible') : tr('Pile');
      couleur = faible ? barres.c : 'var(--o-text3)';
    } else {
      // Le nom de sa classe — qui se tait quand le nom de la carte le dit déjà (« Qualité de l'air » deux fois, audit du 19/10).
      const nc = nomClasse(a.device_class, unite);
      sub = (nc && !nomDitFamille(nom, nc) ? nc : '') || unite || tr('Mesure'); couleur = 'var(--o-text3)'; teinte = 'or';
    }
  }
  else if (dom === 'fan') { sub = actif ? (a.percentage != null ? tr('Vitesse {n} %', { n: Math.round(a.percentage) }) : tr('En marche')) : tr('Éteint'); couleur = actif ? 'var(--o-accent-soft)' : 'var(--o-text3)'; }
  else if (dom === 'humidifier') { sub = actif ? (a.current_humidity != null ? tr('Humidité {n} %', { n: Math.round(a.current_humidity) }) : tr('En marche')) : tr('Éteint'); couleur = actif ? 'var(--o-accent-soft)' : 'var(--o-text3)'; }
  else { sub = actif ? tr('Allumée') : tr('Éteinte'); couleur = actif ? 'var(--o-accent-soft)' : 'var(--o-text3)'; }
  const TEINTES = { accent: ['rgba(var(--o-accent-rgb),.16)', 'var(--o-accent-soft)', 'rgba(var(--o-accent-rgb),'], ok: ['rgba(var(--o-ok-rgb),.16)', 'var(--o-ok)', 'rgba(var(--o-ok-rgb),'], bad: ['rgba(var(--o-bad-rgb),.16)', 'var(--o-bad)', 'rgba(var(--o-bad-rgb),'], or: [hx('var(--o-lampe)', .16), 'var(--o-warn)', 'rgba(var(--o-lampe-rgb),'], froid: ['rgba(var(--o-cold-rgb),.16)', 'var(--o-cold)', 'rgba(var(--o-cold-rgb),'], orange: ['rgba(var(--o-warn2-rgb),.16)', 'var(--o-warn2)', 'rgba(var(--o-warn2-rgb),'] };
  const [icoFond, icoTexte, lavisBase] = TEINTES[teinte];
  // Un capteur n'allume plus cette carte : une mesure de la table a la sienne,
  // qui prend la couleur de sa zone (chantier Capteurs, C5).
  const allume = !mort && (danger || direct || (actif && dom !== 'sensor' && dom !== 'binary_sensor' && dom !== 'camera'));
  const ouvrable = !!onOpen && !mort;
  // Ce que la carte affiche, dans son ordre : la mesure d'un capteur (en grand,
  // en haut à droite), puis la ligne d'état. Le nom du bouton de surface n'en
  // dit ni plus ni moins (lot 13 de l'audit du 03/10).
  const valeur = mesure ? mesure.v + (mesure.u ? ' ' + mesure.u : '') : null;
  // « Voir le flux » d'une caméra : la seule commande que porte le texte.
  const voirFlux = dom === 'camera' && !mort;
  return (
    /* LA CARTE N'EST PLUS UN BOUTON (lot 13 de l'audit du 03/10, ADR 0074).
     *
     * Un rôle bouton rend sa descendance présentationnelle : la bascule d'une
     * prise, d'une serrure, d'une vanne ou d'une sirène, et « Voir le flux »
     * d'une caméra, disparaissaient d'un lecteur d'écran (`nested-interactive`,
     * six cartes sur Objets dans la démonstration). Et la carte se nommait
     * « Ouvrir Porte d'entrée » : le nom taisait l'état, et prenait le verbe
     * d'une commande (WCAG 2.5.3).
     *
     * Le geste « ouvrir la fiche » passe donc par le bouton de SURFACE
     * (`Surface`, ui.jsx), premier enfant, frère des commandes, nommé de ce
     * que la carte affiche : « Porte d'entrée, Verrouillée ». Ce qui est
     * positionné passe au-dessus de lui : la bascule et « Voir le flux »
     * reçoivent leurs clics. Le DÉCOR positionné — la plaque, le texte qui
     * passe devant le filigrane — le laisse filer (`pointerEvents: 'none'`) :
     * un clic sur le nom, l'icône ou la jauge ouvre la fiche, comme avant.
     * Jamais `pointerEvents: 'auto'` dessous : en édition, la grille rend la
     * carte inerte par un `none` hérité, qu'un `auto` percerait. */
    <div className={'o-rmcard' + (mort ? ' o-panne' : '')}
      style={{ ...RM_CARD, position: 'relative', cursor: ouvrable ? 'pointer' : 'default',
        ...((allume && LAVIS) ? { background: lavisCarte((a) => `${lavisBase}${a})`) } : null),
        border: LISERE }}>
      {ouvrable && <Surface onClick={() => onOpen(id)} label={nomCarte(nom, valeur, subLu || sub)} />}
      {ouvrant && <IlluOuvrant type={a.device_class === 'window' ? 'fenetre' : 'porte'} ouvert={ouvert} />}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {/* La plaque. Positionnée, elle passerait devant la surface : elle
          * laisse filer le clic (lot 13 de l'audit du 03/10). Plus rien ne s'y
          * anime : les prises ont leur carte (chantier Prises, P11). */}
        <span style={{ ...RM_ICO(allume ? icoFond : 'var(--o-s1)', allume ? icoTexte : 'var(--o-text3)'), position: 'relative', pointerEvents: 'none' }}>
          {/* `Ico` et non `Fi` : une icône choisie peut être un appareil
            * dessiné (`icones.jsx`), que la fonte n'a pas. */}
          {ico ? <Ico name={ico} size={17} /> : <PlugIcon size={17} />}
        </span>
        {(togglable || dom === 'lock') && !mort
          ? <RmBascule on={actif} nom={nom} onToggle={basculer} />
          : (dom === 'sensor' && mesure && !mort)
            ? <span style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 4, fontSize: 22, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'var(--o-text)' }}>{mesure.v}{mesure.u ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text2)' }}>{mesure.u}</span> : null}</span>
          : dom === 'camera'
            ? <span aria-hidden="true" style={{ color: direct ? icoTexte : 'var(--o-text3)', display: 'flex', alignItems: 'center', height: 26 }}><Fi i="video-camera" size={15} /></span>
            : pile != null ? <PileRepere n={pile} onOuvrir={ouvrable ? () => onOpen(id) : null} /> : null}
      </div>
      {/* Le texte passe devant le filigrane d'un ouvrant (positionné), et
        * laisse alors filer le clic vers la surface, jauges comprises. Celui
        * d'une caméra porte « Voir le flux » : il reste dans le flux, sous la
        * surface, et seul le bouton se positionne (lot 13 de l'audit du 03/10). */}
      <div style={voirFlux ? { marginTop: 14 } : { marginTop: 14, position: 'relative', pointerEvents: 'none' }}>
        <div style={RM_NAME}>{nom}</div>
        <div style={{ ...RM_SUB, color: couleur }}>{sub}</div>
        {barres && !mort && <JaugePile barres={barres} />}
        {voirFlux && (
          <button type="button" onClick={(e) => { e.stopPropagation(); if (onOpen) onOpen(id); }} aria-label={tr('Voir le flux') + ' ' + nom} aria-haspopup="dialog" className="o-rmbtn" style={{ ...RM_BTN, marginTop: 11, width: '100%', position: 'relative' }}>{tr('Voir le flux')}</button>
        )}
      </div>
    </div>
  );
}

export { RoomGenericCard };
