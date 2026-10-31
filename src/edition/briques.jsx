/* Les briques de l’édition partagées par toutes les grilles : la carte éditable, le bandeau, le choix d’une icône.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, useRef, useId, useMemo, useContext } from 'react';
import { compteOrdinaire } from '../state.js';
import { sansAccents } from '../outils.js';
import { REDUCE_MOTION, Fi, Surface, nomCarte } from '../ui.jsx';
import { DESSINS_CAT, FONTE_CAT, NOMS_DESSINS } from '../dessins.js';
import { domaineEdition, identifiantEdition } from '../objets.js';
import { LISERE } from '../styles.js';
import { Ico } from '../icones.jsx';
import { tr, trN } from '../i18n.js';
import { cvEstLumiere, lavisCarte } from '../app/noyau.jsx';
import { RM_CARD, RM_ICO, RM_NAME, RM_SUB } from '../cartes/briques.jsx';
import { PlugIcon } from '../cartescustom/cartes.jsx';
import { useCoarse } from '../app/ecran.jsx';
import { HeaderCtx } from '../chrome/entete.jsx';

/**
 * Fiche d'une carte : ce qu'on peut en changer sans quitter la vue.
 *
 * `id` peut designer une carte native (`obj:…`), un intertitre (`sect:…`) ou
 * une entite. Le nom est toujours modifiable ; l'entite ne l'est pas — en
 * changer reviendrait a changer de carte, ce que le retrait et l'ajout font
 * deja, plus clairement.
 */
/* Les domaines d'une carte en mode edition (maquette du 14/09) : leur mot,
 * leur glyphe, leur teinte. Dits au rendu, dans la langue du moment. */
const DOMAINES_EDITION = () => [
  { id: 'lumiere', label: tr('Lumière'), fi: 'bulb', rgb: '255,204,68' },
  { id: 'volet', label: tr('Volet'), fi: 'blinds', rgb: 'var(--o-purple-rgb)' },
  // Le chauffage : l'orange de ses cartes (maquette « Cartes chauffage », 11/10) — le rouge reste aux alertes.
  { id: 'chauffage', label: tr('Chauffage'), fi: 'flame', rgb: 'var(--o-warn2-rgb)' },
  { id: 'prise', label: tr('Prise'), prise: true, rgb: 'var(--o-accent-rgb)' },
  { id: 'multimedia', label: tr('Multimédia'), fi: 'tv-music', rgb: 'var(--o-rose-rgb)' },
  { id: 'capteur', label: tr('Capteur'), fi: 'sensor', rgb: '255,204,68' },
  { id: 'camera', label: tr('Caméra'), fi: 'camera', rgb: 'var(--o-accent-rgb)' },
  { id: 'serrure', label: tr('Serrure'), fi: 'lock', rgb: 'var(--o-ok-rgb)' },
  { id: 'alarme', label: tr('Alarme'), fi: 'shield-check', rgb: 'var(--o-ok-rgb)' },
  { id: 'sirene', label: tr('Sirène'), fi: 'bell-ring', rgb: 'var(--o-bad-rgb)' },
  { id: 'presence', label: tr('Présence'), fi: 'users', rgb: 'var(--o-accent-rgb)' },
  { id: 'aspirateur', label: tr('Aspirateur'), ico: 'vacuum', rgb: 'var(--o-ok-rgb)' },
  { id: 'tondeuse', label: tr('Tondeuse'), fi: 'tractor', rgb: 'var(--o-ok-rgb)' },
  { id: 'plante', label: tr('Plante'), fi: 'seedling', rgb: 'var(--o-ok-rgb)' },
  { id: 'animaux', label: tr('Animaux'), fi: 'paw', rgb: '255,204,68' },
];
const domaineInfo = (id) => DOMAINES_EDITION().find(x => x.id === id)
  || (id === 'titre' ? { id, label: tr('Titre'), fi: 'apps', rgb: 'var(--o-accent-rgb)' } : { id, label: tr('Carte'), fi: 'apps', rgb: 'var(--o-accent-rgb)' });
/* ── LA GRILLE PAR FAMILLES (29/09, maquette « Modifier l'entité ») ──────────
 *
 * Deux cents icônes en pages de dix faisaient vingt-cinq pages : on feuillette,
 * on ne cherche pas. La maquette les range par FAMILLE sur une bande qui
 * défile, met devant celles qui vont avec la carte — « Suggérées » — et ouvre
 * un champ de recherche au-dessus.
 *
 * `sug` et `recent` ne sont pas des familles du catalogue, elles se calculent.
 * `tout` est la bibliothèque entière, en dernier : on y va quand on sait qu'on
 * cherche ailleurs que dans sa famille. */
const FAMILLES_ICONES = [
  ['sug', 'star'], ['recent', 'time-past'], ['electro', 'apps'], ['multimedia', 'tv-music'], ['streaming', 'play-alt'],
  ['eclairage', 'bulb'], ['ouvrants', 'blinds'], ['climat', 'flame'], ['securite', 'shield'],
  ['iot', 'user-robot'], ['cuisine', 'utensils'], ['energie', 'bolt'], ['reseau', 'wifi-alt'],
  ['maison', 'leaf'], ['pieces', 'house-chimney'], ['mobilite', 'car-side'], ['meteo', 'cloud-sun'],
  ['temps', 'hourglass'], ['tout', 'apps'],
];
/** Le nom de chaque famille, dans la langue affichée — et sa version courte,
 *  celle qui tient sous l'icône de la bande. */
const NOMS_FAMILLES_ICONES = () => ({
  sug: [tr('Suggérées'), tr('Suggérées')], recent: [tr('Récentes'), tr('Récentes')],
  electro: [tr('Électroménager'), tr('Électro')], multimedia: [tr('Multimédia'), tr('Multimédia')],
  streaming: [tr('Services de streaming'), tr('Streaming')],
  eclairage: [tr('Éclairage'), tr('Lumière')], ouvrants: [tr('Ouvrants'), tr('Ouvrants')],
  climat: [tr('Chauffage'), tr('Chauffage')], securite: [tr('Sécurité'), tr('Sécurité')],
  iot: [tr('Objets connectés'), tr('Objets')], cuisine: [tr('Cuisine et entretien'), tr('Cuisine')],
  energie: [tr('Énergie'), tr('Énergie')], reseau: [tr('Réseau'), tr('Réseau')],
  maison: [tr('Maison et jardin'), tr('Jardin')], pieces: [tr('Pièces'), tr('Pièces')],
  mobilite: [tr('Mobilité'), tr('Mobilité')], meteo: [tr('Météo'), tr('Météo')],
  temps: [tr('Temps'), tr('Temps')], tout: [tr('Bibliothèque'), tr('Tout')],
});
/** Les icônes d'une famille : ses dessins, puis ses glyphes de police. */
function iconesFamille(cle) {
  if (cle === 'tout') return toutesLesIcones();
  const vues = new Set();
  const out = [];
  const pousser = (liste) => { for (const n of (liste || [])) { if (!vues.has(n)) { vues.add(n); out.push(n); } } };
  pousser(DESSINS_CAT[cle]);
  pousser(FONTE_CAT[cle]);
  return out;
}
/** La bibliothèque entière, calculée une fois : les dessins d'abord. */
let TOUTES_ICONES = null;
function toutesLesIcones() {
  if (TOUTES_ICONES) return TOUTES_ICONES;
  const vues = new Set();
  const out = [];
  const pousser = (liste) => { for (const n of (liste || [])) { if (!vues.has(n)) { vues.add(n); out.push(n); } } };
  Object.values(DESSINS_CAT).forEach(pousser);
  Object.values(FONTE_CAT).forEach(pousser);
  TOUTES_ICONES = out;
  return out;
}
/* Le nom d'une icône. Un dessin a le sien, venu du catalogue — « Lave-linge »,
 * « Tambour ». Un glyphe de police n'a que son identifiant : on le rend
 * lisible, sans lui inventer une traduction. */
function nomIcone(cle) {
  const n = NOMS_DESSINS[cle];
  return n ? n[0] : cle.replace(/-/g, ' ');
}
function legendeIcone(cle) {
  const n = NOMS_DESSINS[cle];
  return n ? n[1] : '';
}
/** Ce que la recherche trouve : la clé, le nom du dessin, sa légende — sans
 *  accents ni casse, « Réfrigérateur » se trouve en tapant « refri ». */
function chercherIcones(q) {
  const t = sansAccents(q).trim();
  if (!t) return [];
  return toutesLesIcones().filter(c => sansAccents(c).indexOf(t) >= 0
    || sansAccents(nomIcone(c)).indexOf(t) >= 0
    || sansAccents(legendeIcone(c)).indexOf(t) >= 0);
}
/* Les dernières icônes choisies. Elles ne sont PAS de la configuration de la
 * maison : c'est une commodité de celui qui règle, ici et maintenant. Elle
 * reste donc dans son navigateur, et son absence ne casse rien. */
const CLE_RECENTES = 'loggia_icorecents';
function iconesRecentes() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_RECENTES) || '[]');
    return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 12) : [];
  } catch { return []; }
}
function noterIconeRecente(cle) {
  try {
    const l = [cle, ...iconesRecentes().filter(x => x !== cle)].slice(0, 12);
    localStorage.setItem(CLE_RECENTES, JSON.stringify(l));
    return l;
  } catch { return iconesRecentes(); }
}

/* « Modifier l'entite » (maquette du 14/09) : le nom, le domaine (celui que
 * Home Assistant donne — seule une prise peut se declarer lumiere, ou
 * l'inverse), la piece (deplacer l'entite d'une grille a l'autre),
 * l'identifiant, l'epingle de l'accueil ; puis, en dessous, la carte du
 * catalogue et la largeur — les reglages d'avant, toujours la. Pas d'« etat de
 * depart » : Loggia n'invente pas ce que Home Assistant n'a pas encore dit. */
/* LE SÉLECTEUR D'ICÔNE, le même partout (29/09).
 *
 * Il vivait dans la fiche d'une entité ; la fiche d'une PIÈCE et celle d'un
 * SCÉNARIO gardaient l'ancienne grille paginée — « sauf par l'accueil, c'est
 * toujours l'ancien système ». Trois grilles pour un seul geste, dont deux
 * proposaient trente icônes quand la bibliothèque en a cinq cents.
 *
 * `suggerees` est ce que la fiche mettait devant : les icônes de pièces pour
 * une pièce, celles des scénarios pour un scénario, celles du domaine pour une
 * entité. Le reste de la bibliothèque suit, par famille, comme ailleurs.
 */
function ChoixIcone({ valeur, onChoisir, suggerees }) {
  const [q, setQ] = useState('');
  const [fam, setFam] = useState('sug');
  const [recentes, setRecentes] = useState(() => iconesRecentes());
  const [apercu, setApercu] = useState(null);
  const bande = useRef(null);
  const id = 'o-icoq-' + useId();

  const cherche = q.trim().length > 0;
  const liste = useMemo(() => {
    if (cherche) return chercherIcones(q);
    if (fam === 'sug') return suggerees;
    if (fam === 'recent') return recentes;
    return iconesFamille(fam);
  }, [cherche, q, fam, suggerees, recentes]);
  const noms = NOMS_FAMILLES_ICONES();
  const familles = FAMILLES_ICONES.filter(([k]) => (k === 'sug' || k === 'tout')
    || (k === 'recent' ? recentes.length > 0 : iconesFamille(k).length > 0));
  const glisser = (sens) => {
    const el = bande.current;
    // Mouvement reduit (audit du 03/10) : la bande saute d'un coup quand le
    // systeme demande moins d'animation, comme la barre des pieces et la
    // rangee des scenarios — le glissement ecrit en dur ignorait la preference.
    if (el) el.scrollBy({ left: sens * el.clientWidth * 0.8, behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
  };
  const poser = (ic) => { onChoisir(ic); if (ic) setRecentes(noterIconeRecente(ic)); };
  // Les deux fleches de la bande : la HAUTEUR de la bande, pas celle d'un
  // bouton rond — sinon elles flottent a cote d'elle.
  const fleche = { width: 30, height: 56, padding: 0, flexShrink: 0, borderRadius: 12, border: LISERE, background: 'var(--o-s1)', color: 'var(--o-text1)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <>
      <label htmlFor={id} style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', display: 'block', margin: '14px 2px 7px' }}>{tr('ICÔNE')}</label>

      {/* On CHERCHE avant de feuilleter : « lave » trouve le lave-vaisselle,
        * dont la clé est `dishwasher`. La recherche passe devant la famille
        * ouverte et fouille toute la bibliothèque. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, padding: '0 12px', borderRadius: 12, background: 'var(--o-s1)', border: LISERE }}>
        <Fi i="search" size={13} color="var(--o-text3)" />
        {/* L'étiquette ICÔNE désigne ce champ par `htmlFor`, que la règle ne suit pas :
          * la directive vise le champ, pas la div qui l'enveloppe (05/10). */}
        {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
        <input id={id} value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false} autoComplete="off"
          placeholder={tr('Rechercher : lave, lampe, volet…')}
          style={{ flex: 1, minWidth: 0, padding: 0, border: 'none', background: 'transparent', color: 'var(--o-text)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }} />
        {cherche && (
          <button aria-label={tr('Effacer la recherche')} onClick={() => setQ('')}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, padding: 0, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--o-s2)', color: 'var(--o-text2)' }}><Fi i="cross-small" size={12} /></button>
        )}
      </div>

      {/* LA BANDE DES FAMILLES. Elle défile — à la souris par les deux flèches,
        * au doigt en la poussant. « Suggérées » d'abord : celles qui vont avec
        * ce qu'on règle. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <button aria-label={tr('Familles précédentes')} onClick={() => glisser(-1)} style={fleche}><Fi i="angle-small-left" size={14} /></button>
        <div ref={bande} style={{ flex: 1, minWidth: 0, display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', padding: 2 }}>
          {familles.map(([k, ico]) => {
            const on = !cherche && k === fam;
            const n = k === 'sug' ? suggerees.length : k === 'recent' ? recentes.length : iconesFamille(k).length;
            return (
              <button key={k} aria-pressed={on} title={noms[k][0] + ' · ' + trN(n, '{n} icône', '{n} icônes')}
                onClick={() => { setFam(k); setQ(''); }}
                style={{ flexShrink: 0, minWidth: 64, height: 56, padding: '0 8px', borderRadius: 12, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: 'inherit', border: 'var(--o-bw,1px) solid ' + (on ? 'transparent' : 'var(--o-bd2)'), background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text2)' }}>
                <Fi i={ico} size={16} />
                <span style={{ fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{noms[k][1]}</span>
              </button>
            );
          })}
        </div>
        <button aria-label={tr('Familles suivantes')} onClick={() => glisser(1)} style={fleche}><Fi i="angle-small-right" size={14} /></button>
      </div>

      {/* La grille remplit la largeur qu'elle a, et défile chez elle : une
        * famille de trois cents glyphes ne pousse pas le reste de la fiche
        * hors de l'écran. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 8, marginTop: 8, maxHeight: 244, overflowY: 'auto', padding: 2 }}>
        {liste.map(ic => { const on = ic === valeur; return (
          <button key={ic} aria-pressed={on} aria-label={nomIcone(ic)} title={nomIcone(ic)} onClick={() => poser(ic)}
            onMouseEnter={() => setApercu(ic)} onMouseLeave={() => setApercu(null)}
            onFocus={() => setApercu(ic)} onBlur={() => setApercu(null)}
            style={{ height: 52, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'var(--o-bw,1px) solid ' + (on ? 'transparent' : 'var(--o-bd2)'), background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)' }}>
            {/* Un appareil dessiné bouge. Encore faut-il pouvoir le voir : il
              * s'anime sous le curseur, au clavier quand il prend le focus, et
              * une fois choisi — au doigt, c'est le seul moment où l'on peut le
              * regarder. */}
            <Ico name={ic} size={20} anime={on || apercu === ic} />
          </button>
        ); })}
      </div>
      {liste.length === 0 && (
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', margin: '8px 2px 0' }}>
          {cherche ? tr('Aucune icône pour « {q} ».', { q: q.trim() }) : tr('Aucune icône choisie récemment.')}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '8px 2px 0' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text1)' }}>
          {valeur ? nomIcone(valeur) + (legendeIcone(valeur) ? ' · ' + legendeIcone(valeur) : '') : ''}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums' }}>
          {cherche
            ? trN(liste.length, '{n} résultat', '{n} résultats')
            : trN(liste.length, '{n} icône', '{n} icônes') + ' · ' + (fam === 'sug' ? tr('pour cette carte') : noms[fam][0])}
        </span>
      </div>
    </>
  );
}

/* Le bandeau du mode edition (maquette du 14/09), le meme partout ou l'on
 * range des cartes : le mot d'ordre, « Ajouter une entite », « Toutes les
 * entites » (retour a la liste automatique : tout revient, l'ordre et les
 * noms aussi) et « Terminer ».
 *
 * TOUJOURS le premier enfant du contenu de la vue (17/09) : il vivait en bas
 * dans les pieces, au milieu dans l'Energie, et se dedoublait dans les Volets
 * et la Securite, ou une seconde barre portait « Entites de la vue ». Une
 * barre, une place : `onEnt` y pose ce bouton, `texte` change le mot d'ordre
 * la ou l'on ne glisse pas de carte (Scenarios). */
function BandeauEdition({ ed = null, onAjouter = null, toutes = null, ajouterLabel = null, extra = null, onEnt = null, entLabel = null, texte = null }) {
  const ctx = useContext(HeaderCtx) || {};
  /* Le geste, dit la ou on en a besoin (retour 22/09) : au doigt on maintient
   * puis on glisse, au clavier on prend le focus puis les fleches (ADR 0068). */
  const tactile = useCoarse();
  const geste = tactile ? tr('Au doigt : maintenez une carte, puis glissez-la.') : tr('Au clavier : Tab jusqu’à une carte, puis les flèches.');
  const btn = (accent) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', flexShrink: 0, background: accent ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: accent ? '#fff' : 'var(--o-text1)', border: accent ? 'none' : 'var(--o-bw,1px) solid var(--o-bd2)' });
  const peutTout = !!toutes || !!(ed && ed.edits > 0);
  const montreTout = !!toutes || !!ed;
  /* « Entites de la vue » ecrit la configuration de la maison — pieces,
   * cameras, alarme, energie, prises lumieres (03/10). Un compte Home
   * Assistant ordinaire ne pourrait jamais l'enregistrer : il ne voit pas le
   * bouton. Le reste du bandeau — ajouter, ranger, retirer une carte — est de
   * l'agencement, et ne bouge pas. */
  const ouvrirEnt = onEnt && !compteOrdinaire(ctx.hass) ? onEnt : null;
  return (
    <div className="o-bandeau-edition" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: 14, flexWrap: 'wrap', background: 'rgba(var(--o-accent-rgb),.12)', border: '1px dashed rgba(var(--o-accent-rgb),.45)' }}>
      <Fi i="pencil" size={14} color="var(--o-accent-soft)" />
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', flex: 1, minWidth: 200 }}>{texte || tr('Mode édition : attrapez une carte pour la déplacer où vous voulez, ou ajoutez, renommez et retirez une carte.')} <span style={{ color: 'var(--o-text3)' }}>{geste}</span></span>
      {onAjouter && <button onClick={onAjouter} style={btn(true)}><Fi i="plus" size={12} />{ajouterLabel || tr('Ajouter une carte')}</button>}
      {extra}
      {ouvrirEnt && <button onClick={ouvrirEnt} style={btn(false)}><Fi i="list" size={12} />{entLabel || tr('Entités de la vue')}</button>}
      {montreTout && <button onClick={toutes || (() => ed.reset())} disabled={!peutTout} title={tr('Rétablit la liste automatique : les cartes et leurs noms reviennent partout, l’ordre et les tailles sur ce type d’écran.')} style={{ ...btn(false), opacity: peutTout ? 1 : .5 }}><Fi i="apps" size={12} />{tr('Toutes les cartes')}</button>}
      {ctx.onToggleEdit && <button onClick={ctx.onToggleEdit} style={btn(false)}><Fi i="cross-small" size={12} />{tr('Terminer')}</button>}
    </div>
  );
}

/* La case pointillee « Ajouter une entite », en fin de grille (maquette). */
function CarteAjout({ onClick, label = null }) {
  return (
    <button onClick={onClick} style={{ ...RM_CARD, border: '1px dashed var(--o-bd1)', background: 'transparent', boxShadow: 'none', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', color: 'var(--o-text3)', fontSize: 13, fontWeight: 700 }}>
      <Fi i="plus" size={18} /><span>{label || tr('Ajouter une carte')}</span>
    </button>
  );
}

/**
 * Enveloppe d'une carte en mode edition : voile de saisie, bouton de retrait,
 * et le retour visuel du glissement.
 *
 * Le voile capte le geste ET neutralise les commandes de la carte. En mode
 * edition on range ses cartes, on ne pilote pas ses appareils : les deux gestes
 * ne doivent pas se disputer le meme pointeur.
 */
/* Les boutons des cartes d'edition, les memes pour une entite et une piece :
 * Modifier / Supprimer en bas, le petit format des intertitres et des cartes
 * compactes, et le bouton de coin — la largeur d'une entite, la taille d'une
 * piece — en accent, comme la maquette du 15/09. */
const boutonEdition = (rouge) => ({ flex: 1, padding: '9px 6px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: rouge ? 'var(--o-bad)' : 'var(--o-text1)' });
const BOUTON_PETIT = { flex: 'none', width: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
const BOUTON_COIN = { width: 30, height: 30, borderRadius: 10, border: 'none', background: 'rgba(var(--o-accent-rgb),.16)', color: 'var(--o-accent-soft)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 };

/* La carte en mode edition (maquette du 14/09) : la meme place et la meme
 * teinte que la carte vivante, mais rien qui se pilote — l'icone, le bouton
 * de TAILLE en coin (compacte ↔ standard ; le crayon faisait doublon avec
 * Modifier, retour user du 15/09), le nom, « Domaine · identifiant »,
 * Modifier et Supprimer. Compacte, elle tient sur une rangee de 88 px, comme
 * la carte vivante qu'elle remplace. On la SAISIT
 * n'importe ou : elle suit le pointeur tant qu'on la tient. `plat` : un
 * intertitre, qui garde son dessin et prend juste ses deux boutons. */
/* `entite` et `sous` (06/10) : les vues personnalisées posent des CARTES, pas
 * des entités. Leur clé n'est pas toujours un `entity_id` — une horloge ou un
 * groupe de pastilles n'en ont pas —, et ce qu'il faut lire sous le nom est le
 * TYPE de carte, pas le domaine. Les vues de la maison ne passent ni l'un ni
 * l'autre : elles gardent exactement ce qu'elles avaient. */
function EditableCard({ ed, id, nom, onEdit, plat = false, hass = null, taille = true, entite = null, sous = null, ...reste }) {
  const saisie = ed.dragId === id;
  const S = (hass && hass.states) || {};
  const source = entite || id;
  const brut = source.indexOf('dev:') === 0 ? source.slice(4) : source;
  const classe = (S[brut] && S[brut].attributes && S[brut].attributes.device_class) || '';
  const info = domaineInfo(domaineEdition(brut, { estLumiere: cvEstLumiere(brut), classe }));
  /* Le GESTE au pointeur reste à la racine (lot 13 de l'audit du 03/10) :
   * l'appui sur la surface y remonte, `dragStart` remonte jusqu'à la case
   * `data-id`, et `dragEnd` tranche au relâcher entre un clic — la fiche — et
   * un glisser. */
  const prise = {
    onPointerDown: (e) => ed.dragStart(id, e),
    onPointerMove: ed.dragMove,
    onPointerUp: () => { const clic = ed.dragEnd(); if (clic && onEdit) onEdit(id); },
    onPointerCancel: ed.dragEnd,
  };
  /* Le CLAVIER et le nom passent par la SURFACE (ADR 0074 ; lot 13 de l'audit
   * du 03/10). La racine était elle-même un bouton (rôle ARIA) : ce rôle rend sa
   * descendance présentationnelle, et Modifier, Supprimer et la taille
   * disparaissaient d'un lecteur d'écran — 39 cartes `nested-interactive` sur
   * Objets en édition, 10 sur Sécurité, 8 dans le Salon. La surface est leur
   * SŒUR : la touche d'un bouton ne l'atteint plus (la garde reste, un
   * gestionnaire en objet ne sait pas où on le pose — tests/clavier). Son
   * clic ne compte que SANS pointeur (`detail` à 0) : l'activation d'un
   * lecteur d'écran, que la racine n'entendait pas. Celui d'une souris ou
   * d'un doigt, `dragEnd` l'a déjà tranché : il ne compte pas deux fois, et un
   * glisser n'ouvre pas la fiche. */
  const clavier = {
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); ed.move(id, -1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); ed.move(id, 1); }
      else if ((e.key === 'Enter' || e.key === ' ') && onEdit) { e.preventDefault(); onEdit(id); }
    },
    onClick: (e) => { if (e.detail === 0 && onEdit) onEdit(id); },
  };
  // Les boutons ne saisissent pas : leur appui ne remonte pas a la carte.
  const stop = (e) => e.stopPropagation();
  const bouton = boutonEdition, petit = BOUTON_PETIT;
  const large = !!(ed.estLarge && ed.estLarge(id));
  // La taille : compacte (une rangee) ou standard (deux). Une zone fil pilote
  // n'a pas de compacte ; une vue peut ne pas en offrir (`taille`).
  const compact = !!(ed.estCompact && ed.estCompact(id));
  const peutCompacter = taille && !!ed.basculerCompact && brut.indexOf('zone:') !== 0 && brut.indexOf('sect:') !== 0;
  if (plat) {
    return (
      <div data-id={id} {...prise}
        className="o-pointille" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 'var(--o-radius,18px)', '--o-pointille': '.45', opacity: saisie ? .25 : 1, cursor: saisie ? 'grabbing' : 'grab', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
        {/* La surface passe sous les deux boutons, `position: relative` : peints
          * après elle, ils reçoivent leurs clics. Le texte de l'intertitre
          * reste dessous — un clic sur lui est celui de la carte. */}
        <Surface label={nomCarte(nom || id, tr('Modifier ou déplacer'))} popup={!!onEdit} {...clavier} style={{ cursor: 'inherit' }} />
        <div style={{ flex: 1, minWidth: 0 }}>{reste.children}</div>
        <button data-drag-ui="1" onPointerDown={stop} onClick={() => onEdit && onEdit(id)} title={tr('Modifier')} aria-label={tr('Modifier') + ' ' + (nom || id)} style={{ ...bouton(false), ...petit, position: 'relative' }}><Fi i="pencil" size={12} /></button>
        <button data-drag-ui="1" onPointerDown={stop} onClick={() => ed.remove(id)} title={tr('Supprimer')} aria-label={tr('Supprimer') + ' ' + (nom || id)} style={{ ...bouton(true), ...petit, marginRight: 8, position: 'relative' }}><Fi i="cross-small" size={12} /></button>
      </div>
    );
  }
  /* Le pointillé d'édition est une CLASSE (`o-pointille`, index.css), plus un
   * style en ligne : en ligne, il battait `:focus-visible`, et la carte qui
   * avait le focus ne se distinguait plus de ses voisines au clavier (audit
   * du 03/10). Chaque forme garde l'opacité de son trait (`--o-pointille`). */
  const classes = ['o-pointille', large ? 'o-cvw2' : '', compact ? 'o-cvrow1' : ''].filter(Boolean).join(' ');
  const lavis = lavisCarte(info.rgb);
  const icone = (px) => (info.prise ? <PlugIcon size={px} /> : info.ico ? <Ico name={info.ico} size={px} /> : <Fi i={info.fi} size={px} />);
  const sousTitre = sous || (info.label + ' · ' + identifiantEdition(brut));
  const titre = tr('Attrapez pour déplacer · cliquez pour modifier (flèches ← →)');
  /* La surface d'une carte (lot 13) : son nom est ce que la carte affiche,
   * puis le geste — « Plafonnier, Lumière · plafonnier, Modifier ou
   * déplacer » : le nom visible en tête (WCAG 2.5.3), là où la racine disait
   * « Modifier ou déplacer Plafonnier ». Son titre, celui de la racine,
   * devient sa description : les flèches. */
  const surface = <Surface label={nomCarte(nom || id, sousTitre, tr('Modifier ou déplacer'))} popup={!!onEdit} title={titre} {...clavier} style={{ cursor: 'inherit' }} />;
  const racine = { ...RM_CARD, border: LISERE, position: 'relative', cursor: saisie ? 'grabbing' : 'grab', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', opacity: saisie ? .25 : 1,
    background: lavis, '--o-pointille': '.35' };
  /* La bascule de taille garde UN nom, « Une rangée · Plafonnier », et dit
   * son état par `aria-pressed` (vrai = compacte), comme la largeur d'une vue
   * personnalisée : le nom suivait l'état, et une carte d'une rangée
   * s'annonçait « Deux rangées, enfoncé » — le lot 13 avait réglé la
   * largeur, pas la taille (relecture du lot 13, 04/10). L'infobulle garde
   * le geste à venir. */
  const coin = peutCompacter ? (
    <button data-drag-ui="1" onPointerDown={stop} onClick={() => ed.basculerCompact(id)} aria-pressed={compact}
      title={compact ? tr('Deux rangées') : tr('Une rangée')} aria-label={tr('Une rangée') + ' · ' + (nom || id)}
      style={BOUTON_COIN}><Fi i="resize" size={13} /></button>
  ) : null;
  /* La LARGEUR, à côté de la taille (06/10). Elle ne vivait que dans la fiche
   * — « ajoute le bouton simple double ». Le bouton de taille garde son rôle :
   * il bascule les rangées, jamais la largeur (règle du 04/10). Un seul nom,
   * l'état dit par `aria-pressed`, comme son voisin. */
  const peutElargir = !!ed.estLarge && !!ed.basculerLarge;
  const coins = (peutElargir || peutCompacter) ? (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      {coin}
      {peutElargir && (
        <button data-drag-ui="1" onPointerDown={stop} onClick={() => ed.basculerLarge(id)} aria-pressed={large}
          title={large ? tr('Largeur simple') : tr('Largeur double')} aria-label={tr('Largeur double') + ' · ' + (nom || id)}
          style={{ ...BOUTON_COIN, ...(large ? { background: 'var(--o-accent-fond)', color: '#fff' } : {}) }}><Fi i="arrows-h" size={13} /></button>
      )}
    </div>
  ) : null;
  if (compact) {
    const serre = { padding: '4px 6px', fontSize: 11.5 };
    return (
      <div data-id={id} {...prise} className={classes} title={titre}
        style={{ ...racine, minHeight: 0, height: '100%', boxSizing: 'border-box', gap: 6, padding: '8px 10px' }}>
        {surface}
        {/* Les deux rangées portent des commandes : `position: relative`, elles
          * passent au-dessus de la surface et reçoivent leurs clics. */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...RM_ICO('rgba(' + info.rgb + ',.16)', 'rgb(' + info.rgb + ')'), width: 32, height: 32, borderRadius: 11 }}>{icone(15)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={RM_NAME}>{nom || id}</div>
            <div style={{ ...RM_SUB, marginTop: 0, color: 'rgb(' + info.rgb + ')' }}>{sousTitre}</div>
          </div>
          {coins}
        </div>
        <div style={{ position: 'relative', display: 'flex', gap: 6 }}>
          <button data-drag-ui="1" onPointerDown={stop} onClick={() => onEdit && onEdit(id)} aria-label={tr('Modifier') + ' ' + (nom || id)} style={{ ...bouton(false), ...serre }}>{tr('Modifier')}</button>
          <button data-drag-ui="1" onPointerDown={stop} onClick={() => ed.remove(id)} aria-label={tr('Supprimer') + ' ' + (nom || id)} style={{ ...bouton(true), ...serre }}>{tr('Supprimer')}</button>
        </div>
      </div>
    );
  }
  return (
    <div data-id={id} {...prise} className={classes} title={titre} style={racine}>
      {surface}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={RM_ICO('rgba(' + info.rgb + ',.16)', 'rgb(' + info.rgb + ')')}>{icone(17)}</span>
        {coins}
      </div>
      {/* PAS DE MARGE SUR LE CORPS (09/10). Le parent est en
        * `space-between` : le corps est deja colle en bas, la marge n'y
        * ajoute rien — sauf quand le contenu remplit la carte, et la elle le
        * pousse DEHORS. « Il y a un souci au niveau de l'organisation,
        * arrange la carte volet que ce soit au meme niveau que l'Echo » :
        * mesure, le corps du volet finissait 12 px sous sa zone quand celui
        * du media tombait pile. */}
      <div>
        <div style={RM_NAME}>{nom || id}</div>
        <div style={{ ...RM_SUB, color: 'rgb(' + info.rgb + ')' }}>{sousTitre}</div>
      </div>
      <div style={{ position: 'relative', display: 'flex', gap: 8, marginTop: 12 }}>
        <button data-drag-ui="1" onPointerDown={stop} onClick={() => onEdit && onEdit(id)} aria-label={tr('Modifier') + ' ' + (nom || id)} style={bouton(false)}>{tr('Modifier')}</button>
        <button data-drag-ui="1" onPointerDown={stop} onClick={() => ed.remove(id)} aria-label={tr('Supprimer') + ' ' + (nom || id)} style={bouton(true)}>{tr('Supprimer')}</button>
      </div>
    </div>
  );
}

export { DOMAINES_EDITION, ChoixIcone, BandeauEdition, CarteAjout, boutonEdition, BOUTON_PETIT, BOUTON_COIN, EditableCard };
