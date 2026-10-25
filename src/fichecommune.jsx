/* ── Le socle commun des fiches à onglets (ADR 0155, 05/10) ──────────────────
 *
 * La fiche du distributeur prend le gabarit de celle du robot (ADR 0042) :
 * un en-tête (le nom, l'épingle, la roue, la croix), une barre d'onglets au
 * motif ARIA complet, des panneaux, une page de réglages. Les briques vivent
 * ICI, et pas dans `ficherobot.jsx` : dix-neuf tests lisent celui-ci comme du
 * texte, le migrer est un lot à part. D'ici là, ces quelque 150 lignes sont
 * des COPIES assumées de la fiche du robot — mêmes valeurs, mêmes gestes —,
 * qu'un écart de l'une à l'autre se voie à la relecture plutôt qu'à l'écran.
 *
 * Trois écarts voulus avec le robot, tous du 05/10 :
 *  - `LigneReglage` commande le DOMAINE du réglage (un voyant peut être une
 *    `light`, pas un `switch`), montre la demande en vol (`useOptimiste`) et
 *    reste une COMMANDE pour tous : un réglage de l'appareil est un service
 *    qu'un compte Home Assistant ordinaire peut appeler (ADR 0144). Seule la
 *    configuration de Loggia se masque, et ce n'est pas ce socle qui en décide ;
 *  - au clavier, le focus suit les vues internes (`focaliser`) : la roue, Retour,
 *    une tuile qui change d'onglet ne le laissent plus tomber sur <body> ;
 *  - `useHistoriquePeriode` distingue l'échec (« erreur ») du vide, et lit les
 *    attributs des seules entités qui en ont besoin (le `last_triggered` d'une
 *    automatisation) : l'historique minimal ne les a pas.
 */
import { useState, useEffect, useRef } from 'react';
import { tr, trSens, locale } from './i18n.js';
import { Fi, Bascule, NomFeuille, CroixFeuille } from './ui.jsx';
import { vacOption } from './state.js';
import { commanderService } from './actions.js';
import { useOptimiste } from './optimiste.js';
import { petitesCapitales, LISERE } from './styles.js';
import { ongletVoisin } from './choix.js';
import { nomJour, heureValide } from './robots.js';

/* ════════════ Les styles (copies de ficherobot.jsx) ════════════ */

export const FOND = 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))';
// Le liseré du réglage (04/10), comme les panneaux de Paramètres et du robot.
export const PANNEAU = { background: FOND, border: LISERE, borderRadius: 'var(--o-radius,18px)', padding: '18px 20px', boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', boxSizing: 'border-box', minWidth: 0 };
// Les titres de bloc de la fiche du distributeur sont des petites capitales depuis sa maquette (étape 2 du chantier IoT) : le titre
// en italique de section est parti avec eux.
export const PETITES_CAPITALES = petitesCapitales(10.5);
/* Le repère gauche d'un historique sur 7 jours : sept phrases ENTIÈRES — « domenica
 * scorsa » s'accorde —, lues au rendu. Une seule copie pour le chauffage et les
 * volets (25/10) : chacune avait la sienne. */
export const JOURS_DERNIERS = () => [tr('lundi dernier'), tr('mardi dernier'), tr('mercredi dernier'), tr('jeudi dernier'), tr('vendredi dernier'), tr('samedi dernier'), tr('dimanche dernier')];
// Le bouton doux du socle (« Confirmer ? », « Retour ») ; la fiche du distributeur ne le lit plus (étape 2 du chantier IoT) : il n'est plus exporté.
const BOUTON_DOUX = { padding: '9px 14px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: 'var(--o-s1)', color: 'var(--o-text1)', fontFamily: 'inherit' };
export const CHAMP_HEURE = { padding: '9px 12px', borderRadius: 12, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s2)', color: 'var(--o-text1)', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums', colorScheme: 'inherit' };
// Une ligne de liste dans un panneau : le filet du dessus sauf pour la première.
export const LIGNE = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '13px 18px' };
export const SOUS = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 };
export const filet = (i) => (i ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none');

/* ════════════ Les briques ════════════ */

/* Un geste qui ne se rattrape pas (remettre un compteur à neuf, supprimer un
 * repas, copier une journée du planning de chauffe sur la semaine) : deux
 * appuis. `nom` nomme le bouton quand `libelle` ne dit pas tout (« Lun – ven »
 * : « Copier cette journée sur : Lun – ven ») ; armé, « Confirmer ? » se lit,
 * et c'est lui qui se dit. `style` : le dessin de qui l'emploie (la puce de
 * 40 px du planning) — le fond, l'encre et le rouge d'armement restent les
 * siens. */
export function BoutonConfirme({ libelle, onConfirme, nom = null, style = null }) {
  const [arme, setArme] = useState(false);
  useEffect(() => { if (!arme) return undefined; const t = setTimeout(() => setArme(false), 4000); return () => clearTimeout(t); }, [arme]);
  const nomme = nom && !arme ? nom : undefined;
  return (
    <button type="button" aria-label={nomme} title={nomme} onClick={() => { if (arme) { setArme(false); onConfirme(); } else setArme(true); }}
      style={{ ...BOUTON_DOUX, ...style, background: arme ? 'rgba(var(--o-bad-rgb),.16)' : 'var(--o-s1)', color: arme ? 'var(--o-bad)' : 'var(--o-text1)' }}>{arme ? tr('Confirmer ?') : libelle}</button>
  );
}

/* Moins, la valeur, plus : jamais un curseur pour ce qui DISTRIBUE ou règle
 * une quantité — un glissé de trop et la vis tourne. `nom` : ce qu'il règle,
 * en tête de ses deux noms accessibles (« Taille de la portion : Moins ») —
 * sinon une page de réglages répète « Moins », « Plus » sans dire de quoi (05/10). */
const nomPas = (nom, geste) => (nom ? tr('{a} : {b}', { a: nom, b: geste }) : geste);
export const PasAPas = ({ valeur, moins, plus, peutMoins = true, peutPlus = true, nom = null }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 12, background: 'var(--o-well)', flexShrink: 0 }}>
    <button type="button" onClick={moins} disabled={!peutMoins} aria-label={nomPas(nom, tr('Moins'))} style={{ width: 32, height: 32, borderRadius: 9, border: 'none', cursor: 'pointer', background: 'var(--o-s1)', color: 'var(--o-text1)', fontSize: 16, fontWeight: 800, opacity: peutMoins ? 1 : .4 }}>−</button>
    <span style={{ minWidth: 64, padding: '0 6px', textAlign: 'center', fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{valeur}</span>
    <button type="button" onClick={plus} disabled={!peutPlus} aria-label={nomPas(nom, tr('Plus'))} style={{ width: 32, height: 32, borderRadius: 9, border: 'none', cursor: 'pointer', background: 'var(--o-s1)', color: 'var(--o-text1)', fontSize: 16, fontWeight: 800, opacity: peutPlus ? 1 : .4 }}>+</button>
  </span>
);

/* Un réglage de l'appareil, par le service de SON domaine — ouvert à tous
 * (ADR 0144). La demande se voit tout de suite et le pas suivant part d'ELLE
 * (`useOptimiste`, 6 s au plus) : sans ce filet, deux « + » rapprochés
 * repartaient tous deux de la valeur d'avant, et un appui sur deux se
 * perdait — mesuré à 60 ms d'écart, quand la portion de l'Accueil, elle,
 * tenait (05/10). Le libellé se coupe (`overflowWrap`) plutôt que de passer
 * sous le pas à pas : « Fütterungsmodus » à 320 px. */
export function LigneReglage({ hass, r, motOption = null }) {
  const appel = (domaine, service, data) => commanderService(hass, r.id, domaine, service, { entity_id: r.id, ...data });
  const [ov, poser] = useOptimiste(r.type === 'bascule' ? !!r.actif : r.valeur);
  let commande = null;
  if (r.type === 'bascule') {
    const dom = r.domaine === 'light' ? 'light' : 'switch';
    const on = ov != null ? ov : !!r.actif;
    commande = <Bascule on={on} nom={r.nom} cb={() => { poser(!on); appel(dom, on ? 'turn_off' : 'turn_on', {}); }} />;
  } else if (r.type === 'choix') {
    const valeur = ov != null ? ov : r.valeur;
    const i = r.options.indexOf(valeur);
    // L'option dans la langue de l'écran, par `trSens` comme le robot — ou
    // le mot que la fiche donne pour CE réglage (le mode d'un distributeur).
    const mot = (motOption && motOption(r, valeur)) || trSens(vacOption(valeur));
    const choisir = (o) => { poser(o); appel('select', 'select_option', { option: o }); };
    commande = <PasAPas nom={r.nom} valeur={mot} peutMoins={i > 0} peutPlus={i >= 0 && i < r.options.length - 1}
      moins={() => choisir(r.options[i - 1])} plus={() => choisir(r.options[i + 1])} />;
  } else {
    const v = ov != null ? ov : r.valeur;
    const texte = Number(v).toLocaleString(locale()) + (r.unite ? ' ' + r.unite : '');
    const regler = (x) => { const n = Math.round(x * 1000) / 1000; poser(n); appel('number', 'set_value', { value: n }); };
    commande = <PasAPas nom={r.nom} valeur={texte} peutMoins={r.min == null || v - r.pas >= r.min} peutPlus={r.max == null || v + r.pas <= r.max}
      moins={() => regler(v - r.pas)} plus={() => regler(v + r.pas)} />;
  }
  return (
    <div style={{ ...LIGNE, borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
      <span style={{ fontSize: 14.5, fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere', hyphens: 'auto' }}>{r.nom}</span>{commande}
    </div>
  );
}

/* Un jour de la semaine : choisi, bleu plein et texte blanc (règle des puces).
 * `attenue` : la pastille d'un repas éteint, en retrait — l'opacité sur le seul
 * décor, jamais sur un texte qui dit l'état (05/10). */
export const PuceJour = ({ j, on, onClick, taille = 30, disabled = false, attenue = false }) => (
  <button type="button" onClick={onClick} aria-pressed={on} disabled={disabled} aria-label={nomJour(j, locale(), 'long')} title={nomJour(j, locale(), 'long')}
    style={{ width: taille, height: taille, borderRadius: '50%', border: 'none', cursor: disabled ? 'default' : 'pointer', flexShrink: 0, padding: 0, fontSize: 11.5, fontWeight: 800, fontFamily: 'inherit', opacity: attenue ? .55 : 1,
      background: on ? 'var(--o-accent-fond)' : 'var(--o-s2)', color: on ? '#fff' : 'var(--o-text3)' }}>{nomJour(j, locale(), 'narrow')}</button>
);

/* Un champ d'heure qui ne rend la valeur que lorsqu'elle est entière.
 * `aLaSortie` : seulement quand on QUITTE le champ, ou par Entrée — une liste
 * rangée par heure ne se réordonne plus sous les doigts, et une heure à
 * moitié tapée (« 00:30 » en route vers « 09:30 ») ne part pas. Laissée
 * incomplète, elle redevient celle d'avant. Sans lui, chaque heure entière
 * part aussitôt (les repas du distributeur). `onValide` qui rend `false` :
 * l'heure est refusée (une heure déjà prise du planning de chauffe), le champ
 * redit celle d'avant. `style` : par-dessus son dessin (l'heure d'un
 * changement du planning, 17 px, sans cadre). */
export function ChampHeure({ valeur, onValide, nom, aLaSortie = false, style = null }) {
  const [v, setV] = useState(valeur);
  useEffect(() => { setV(valeur); }, [valeur]);
  const rendre = (n) => { if (heureValide(n) && n !== valeur && onValide(n) === false) setV(valeur); };
  const sortir = (n) => { if (heureValide(n)) rendre(n); else setV(valeur); };
  return <input type="time" value={v} aria-label={nom} style={style ? { ...CHAMP_HEURE, ...style } : CHAMP_HEURE}
    onChange={(e) => { const n = e.target.value; setV(n); if (!aLaSortie) rendre(n); }}
    onBlur={aLaSortie ? (e) => sortir(e.target.value) : undefined}
    onKeyDown={aLaSortie ? (e) => { if (e.key === 'Enter') sortir(e.currentTarget.value); } : undefined} />;
}

/**
 * L'historique de quelques entités sur `jours` jours (dix : la purge par
 * défaut de Home Assistant), relu quand `cle` change. `null` tant qu'il n'est
 * pas lu, 'erreur' s'il ne se lit pas — un historique illisible n'est pas un
 * historique vide —, sinon les listes de `history/period`. `ids` se lisent au
 * format minimal, `idsAttributs` avec leurs attributs. Home Assistant
 * REMPLACE `hass` à chaque état : l'appel lit le `hass` du moment par une
 * référence vivante, comme `useHistoriqueRobot`.
 */
export function useHistoriquePeriode(hass, { ids = [], idsAttributs = [], jours = 10, cle = '' } = {}) {
  const [reponse, setReponse] = useState(null);
  const hRef = useRef(hass);
  useEffect(() => { hRef.current = hass; });
  const connecte = !!(hass && typeof hass.callApi === 'function');
  const a = ids.filter(Boolean).join(',');
  const b = idsAttributs.filter(Boolean).join(',');
  useEffect(() => {
    if (!connecte || (!a && !b)) { setReponse(a || b ? null : []); return undefined; }
    let vivant = true;
    const debut = new Date(Date.now() - jours * 86400000).toISOString();
    const fin = encodeURIComponent(new Date().toISOString());
    const lire = (liste, minimal) => (liste ? hRef.current.callApi('GET', 'history/period/' + debut + '?filter_entity_id=' + encodeURIComponent(liste) + '&end_time=' + fin + (minimal ? '&minimal_response&no_attributes' : ''))
      : Promise.resolve([]));
    Promise.all([lire(a, true), lire(b, false)])
      .then(([x, y]) => { if (vivant) setReponse([...(Array.isArray(x) ? x : []), ...(Array.isArray(y) ? y : [])]); })
      .catch(() => { if (vivant) setReponse('erreur'); });
    return () => { vivant = false; };
  }, [connecte, a, b, jours, cle]);
  return reponse;
}

/* L'historique d'un `climate`, RÉSUMÉ par le serveur (`loggia/chauffage/historique`,
 * audit du 19/10) : sept jours d'un poêle pesaient 3 à 14 Mo par `history/period`,
 * tous ses attributs à chaque mise à jour. Même forme qu'une lecture de
 * `history/period` (`[[{ state, last_updated, attributes }]]`). La commande
 * absente — Home Assistant pas encore redémarré, la démo — ou en panne :
 * 'repli', et la fiche lit `history/period` comme avant. */
export function useHistoriqueClimat(hass, cle, jours, recharge, actif) {
  const [reponse, setReponse] = useState(null);
  const hRef = useRef(hass);
  useEffect(() => { hRef.current = hass; });
  useEffect(() => {
    if (!actif || !cle) { setReponse(null); return undefined; }
    let vivant = true;
    Promise.resolve().then(() => hRef.current.callWS({ type: 'loggia/chauffage/historique', chauffage: cle, jours }))
      .then((r) => { if (vivant) setReponse(r && Array.isArray(r.points) ? [r.points] : 'repli'); })
      .catch(() => { if (vivant) setReponse('repli'); });
    return () => { vivant = false; };
  }, [actif, cle, jours, recharge]);
  return reponse;
}

/* ════════════ L'en-tête, les onglets, la page des réglages ════════════ */

/**
 * Le focus, après un changement de vue interne (05/10) : la roue, Retour,
 * une tuile qui ouvre un onglet, un repas supprimé démontaient l'élément qui
 * l'avait — il tombait sur <body>, et le Tab suivant repartait de la croix,
 * en haut de la feuille. Une fois le rendu posé, il va au PREMIER identifiant
 * qui existe (un point d'arrivée, puis son repli). `setTimeout` plutôt
 * qu'une image d'animation : celle-ci ne vient pas dans un onglet en retrait.
 */
export function focaliser(...ids) {
  if (typeof document === 'undefined') return;
  setTimeout(() => {
    for (const id of ids) {
      const el = id ? document.getElementById(id) : null;
      if (el) { el.focus(); return; }
    }
  }, 0);
}

/**
 * La ligne d'en-tête des fiches à onglets : le nom (qui NOMME la feuille,
 * réglages compris), l'épingle, la roue des réglages, puis la croix — la
 * même, en dernier, partout. `panne` : l'appareil ne répond plus ; la ligne
 * porte le liseré `o-panne` (ADR 0048) et le dit sous le nom.
 *
 * Deux props facultatives, sans lesquelles rien ne change (la fiche d'un
 * chauffage, tâche 10 bis B) : `plaque`, `{ icone, fond, encre }`, la plaque
 * de la carte de l'appareil à gauche du nom — 40 × 40, arrondi 12, glyphe de
 * 18 px ; `plaque.glyphe`, facultatif, le remplace : l'icône choisie pour la
 * carte, que la coquille passe (relecture de la partie B) ; `sousNom`, une
 * ligne sous le nom (« Bureau · fil pilote »), en 12 px au gris secondaire,
 * qui passe à la ligne plutôt que de se couper.
 */
export function EnteteFiche({ nom, reglages = false, enReglages = false, onReglages = null, epingle = null, panne = null, idRoue = undefined, plaque = null, sousNom = null }) {
  return (
    <div className={panne ? 'o-panne' : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 12, ...(panne ? { padding: '6px 6px 6px 14px', borderRadius: 30 } : null) }}>
      {plaque && (
        <span aria-hidden="true" data-plaque=""
          style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: plaque.fond, color: plaque.encre }}>
          {plaque.glyphe || <Fi i={plaque.icone} size={18} />}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Le nom est la seule identité de la feuille : deux lignes au téléphone plutôt
          * qu'une ellipse (« Distribute… » à 320 px hors ligne, 05/10). Coupé aux espaces
          * seulement : un mot trop long pour la ligne (« Futterautomat ») garde son ellipsis
          * plutôt que d'être tranché en « Futterautom / at ». */}
        <NomFeuille><div style={{ fontSize: 19, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', hyphens: 'auto', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{enReglages ? tr('Réglages') : nom}</div></NomFeuille>
        {/* Le gris secondaire : le tertiaire tombait à 4,16:1 en clair (05/10). */}
        {enReglages && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>}
        {/* `break-word`, pas `anywhere` : à 320 px en allemand, « Schlafzimmer · Lautsprecher » se coupait en « Schlafzimm / er » — `anywhere`
          * laisse la colonne rétrécir sous le mot le plus long. Un mot ne se coupe qu'en dernier recours, quand il ne tient pas même seul sur
          * sa ligne — et alors avec un trait d'union, à la règle de la langue (`hyphens`), comme le nom au-dessus : « Kinder-modus » dans la
          * colonne de 72 px d'une TV à 320 px (passe bis du 17/10, point 12). */}
        {!enReglages && sousNom && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2, minWidth: 0, overflowWrap: 'break-word', hyphens: 'auto' }}>{sousNom}</div>}
        {!enReglages && panne && <div role="status" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{panne}</div>}
      </div>
      {!enReglages && epingle}
      {!enReglages && reglages && (
        <button type="button" id={idRoue} onClick={onReglages} aria-label={tr('Réglages')} title={tr('Réglages')}
          style={{ width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text1)' }}><Fi i="settings" size={14} /></button>
      )}
      <CroixFeuille />
    </div>
  );
}

/**
 * La barre d'onglets, le motif ARIA en entier (audit du 03/10, comme le
 * robot) : l'onglet actif est le SEUL arrêt de Tab ; ← →, Début et Fin
 * déplacent le focus ET ouvrent l'onglet ; l'actif seul désigne son panneau.
 * `idBase` vient d'un `useId()` du parent, appelé avant tout retour anticipé.
 * Onglet choisi : bleu plein, texte blanc (règle des puces). Les autres en
 * --o-text1 : en --o-text2, 4,24:1 en clair sur le fond de la barre (05/10).
 */
export function FicheOnglets({ idBase, nom, onglets, actuel, onChoisir }) {
  const aller = (e, i) => {
    const j = ongletVoisin(onglets.length, i, e.key);
    if (j < 0) return;
    e.preventDefault();
    const voisin = typeof document !== 'undefined' ? document.getElementById(idBase + '-t-' + onglets[j][0]) : null;
    if (voisin) voisin.focus();
    onChoisir(onglets[j][0]);
  };
  return (
    <div role="tablist" aria-label={nom} className="rb-onglets" style={{ '--rb-n': onglets.length }}>
      {onglets.map(([id, libelle, icone], i) => (
        <button key={id} id={idBase + '-t-' + id} type="button" role="tab" aria-selected={actuel === id}
          aria-controls={actuel === id ? idBase + '-p-' + id : undefined} tabIndex={actuel === id ? 0 : -1}
          onClick={() => onChoisir(id)} onKeyDown={(e) => aller(e, i)} className="rb-onglet"
          style={{ background: actuel === id ? 'var(--o-accent-fond)' : 'transparent', color: actuel === id ? '#fff' : 'var(--o-text1)' }}>
          <Fi i={icone} size={15} /><span>{libelle}</span>
        </button>
      ))}
    </div>
  );
}

/* Le panneau de l'onglet actif, nommé par lui ; sans barre (un seul onglet),
 * un simple bloc. */
export const PanneauOnglet = ({ idBase, actuel, avecOnglets, children }) => (
  <div role={avecOnglets ? 'tabpanel' : undefined} id={idBase + '-p-' + actuel} aria-labelledby={avecOnglets ? idBase + '-t-' + actuel : undefined}>{children}</div>
);

/**
 * La page des réglages d'un appareil, ouverte par la roue : le nom, ce qui se
 * règle d'abord, la fiche technique et « L'appareil » (la fiche universelle
 * par-dessus), le reste replié, et Retour — qui reçoit le focus à l'ouverture
 * (`idRetour`). Tout s'y COMMANDE, pour tous les comptes : ce sont les
 * services de l'appareil, que Home Assistant ouvre à un compte ordinaire
 * (ADR 0144, 05/10). La configuration de Loggia n'a rien à faire ici.
 */
/* ════════════ L'entretien (I20 ; sa maquette 1d) — le robot et le distributeur (passe bis de l'étape 2, 19/10 ; point G) ════════════
 *
 * La phrase, seulement quand une pièce presse (jamais de « Tout va bien » permanent) ; un panneau, une rangée par pièce : le nom
 * (« 43 h sur 60 h », « 12 jours restants » dessous), le pourcentage et la barre de 6 px — rouge sous 15, ambre sous 35, neutre
 * au-dessus (`niveau` : bas, moyen, bon). « Remplacé » n'existe que si l'appareil a le bouton de remise à zéro et pas à 100 % — rien
 * d'inerte ; il DEMANDE sur sa rangée, « Remettre Filtre à 100 % ? » · « Annuler » · « Oui, 100 % » : une remise à zéro ne se
 * rattrape pas (ADR 0042). Puis les compteurs, tels que l'appareil les nomme. Les pièces : `{ id, nom, pct, texte, niveau, reset }`
 * (`piecesUsure` du robot, les consommables du distributeur sur le même gabarit). */

const ENCRE_USURE = { bas: 'var(--o-bad)', moyen: 'var(--o-warn)', bon: 'var(--o-text1)' };
const BARRE_USURE = { bas: 'var(--o-bad)', moyen: 'var(--o-warn)', bon: 'var(--o-text3)' };
/* Le panneau PLAT des fiches IoT (sa maquette 1d, § 7.5 ; passe bis 2 de l'étape 2, 19/10) : `--o-s3`, le liseré de la maison, le
 * rayon 18 — celui des autres onglets du robot (ficherobot.jsx) et de l'Accueil du distributeur (`CADRE`), sans le dégradé ni l'ombre
 * du socle (`PANNEAU`, la page des réglages). En devenant brique commune, l'Entretien avait pris le panneau du socle : chez lui,
 * l'onglet installé le matin même changeait de dessin. */
const PANNEAU_PLAT = { background: 'var(--o-s3)', border: LISERE, borderRadius: 18, boxSizing: 'border-box', minWidth: 0 };
// « Remplacé » et les puces de sa question : la puce de sa maquette (`ChipButton`, rayon 10 ; passe bis du 18/10, point 13).
const PUCE_RANGEE = { height: 36, padding: '0 12px', borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, background: 'var(--o-s1)', color: 'var(--o-text1)' };

export function OngletEntretien({ hass, pieces, compteurs = [], phrase = null }) {
  const [question, setQuestion] = useState(null); // la pièce dont on demande la remise à 100 %
  const presser = (id) => { setQuestion(null); commanderService(hass, id, 'button', 'press', { entity_id: id }); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {phrase && <div style={{ fontSize: 12.5, color: 'var(--o-text2)', lineHeight: 1.45, textWrap: 'pretty' }}>{phrase}</div>}
      {pieces.length > 0 && (
        <div style={{ ...PANNEAU_PLAT, padding: 0, overflow: 'hidden' }}>
          {pieces.map((p, i) => {
            const remplacer = p.reset && p.pct !== 100;
            const demande = remplacer && question === p.id;
            return (
              <div key={p.id} style={{ padding: '14px 16px', borderTop: filet(i) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</span>
                    {/* Le sous-texte ne porte la couleur que s'il est le SEUL signal — des jours sans pourcentage (le distributeur) ; sous un
                      * pourcentage et sa barre, il reste gris : « 43 h sur 60 h » d'une pièce à 28 % passait à l'ambre chez lui (passe bis 2). */}
                    {p.texte && <span style={{ display: 'block', fontSize: 12, color: p.pct == null && p.niveau && p.niveau !== 'bon' ? ENCRE_USURE[p.niveau] : 'var(--o-text2)', marginTop: 2 }}>{p.texte}</span>}
                  </span>
                  {p.pct != null && <span style={{ fontSize: 16, fontWeight: 800, color: ENCRE_USURE[p.niveau], fontVariantNumeric: 'tabular-nums' }}>{p.pct + ' %'}</span>}
                  {remplacer && !demande && <button type="button" onClick={() => setQuestion(p.id)} style={PUCE_RANGEE}>{tr('Remplacé')}</button>}
                </div>
                {p.pct != null && (
                  <div aria-hidden="true" style={{ position: 'relative', height: 6, marginTop: 10, borderRadius: 3, background: 'var(--o-s1)', overflow: 'hidden' }}>
                    <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: p.pct + '%', borderRadius: 3, background: BARRE_USURE[p.niveau] }} />
                  </div>
                )}
                {demande && (
                  <div role="group" aria-label={tr('Remettre {piece} à 100 % ?', { piece: p.nom })} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700 }}>{tr('Remettre {piece} à 100 % ?', { piece: p.nom })}</span>
                    <button type="button" onClick={() => setQuestion(null)} style={{ ...PUCE_RANGEE, height: 40 }}>{tr('Annuler')}</button>
                    <button type="button" onClick={() => presser(p.reset)} style={{ ...PUCE_RANGEE, height: 40, background: 'var(--o-accent-fond)', color: '#fff' }}>{tr('Oui, 100 %')}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {compteurs.length > 0 && (
        <div style={{ ...PANNEAU_PLAT, padding: 0, overflow: 'hidden' }}>
          {compteurs.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderTop: filet(i), fontSize: 13 }}>
              <span style={{ color: 'var(--o-text2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom}</span>
              <span style={{ fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{c.valeur.toLocaleString(locale(), { maximumFractionDigits: 1 }) + (c.unite ? ' ' + c.unite : '')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PageReglagesAppareil({ hass, nom, libelleNom, reglages, fiche = [], retour, onFiche = null, avant = null, motOption = null, idRetour = undefined }) {
  const [tout, setTout] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <div style={{ ...PANNEAU, padding: '4px 0' }}>
        <div style={{ padding: '13px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)' }}>{libelleNom}</div>
          <div style={{ fontSize: 15.5, fontWeight: 800, marginTop: 2 }}>{nom}</div>
        </div>
        {avant}
        {reglages.principaux.map(r => <LigneReglage key={r.id} hass={hass} r={r} motOption={motOption} />)}
      </div>
      {(fiche.length > 0 || onFiche) && (
        <div style={{ ...PANNEAU, padding: '4px 0' }}>
          {fiche.map((l, i) => (
            <div key={l.cle} style={{ ...LIGNE, gap: 12, borderTop: filet(i) }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--o-text2)' }}>{l.nom}</span>
              <span style={{ fontSize: 14, fontWeight: 800, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.valeur}</span>
            </div>
          ))}
          {/* L'épingle, les commandes de l'appareil et toutes ses entités restent à un geste. */}
          {onFiche && (
            <button type="button" onClick={onFiche}
              style={{ ...LIGNE, gap: 12, width: '100%', border: 'none', borderTop: filet(fiche.length), background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'left' }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700 }}>{tr('L’appareil')}</span>
                <span style={SOUS}>{tr('L’épingle, les commandes et toutes ses entités')}</span>
              </span>
              <Fi i="angle-right" size={12} color="var(--o-text2)" />
            </button>
          )}
        </div>
      )}
      {reglages.autres.length > 0 && (
        <div style={{ ...PANNEAU, padding: '4px 0' }}>
          <button type="button" onClick={() => setTout(v => !v)} aria-expanded={tout}
            style={{ ...LIGNE, gap: 12, width: '100%', padding: '14px 18px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'left' }}>
            <span style={{ fontSize: 14.5, fontWeight: 700 }}>{tr('Tous les réglages de l’appareil')} · {reglages.autres.length}</span>
            <Fi i={tout ? 'angle-small-up' : 'angle-small-down'} size={14} color="var(--o-text2)" />
          </button>
          {tout && reglages.autres.map(r => <LigneReglage key={r.id} hass={hass} r={r} motOption={motOption} />)}
        </div>
      )}
      <button type="button" id={idRetour} onClick={retour} style={{ ...BOUTON_DOUX, padding: '14px 12px', fontSize: 14, borderRadius: 14 }}>{tr('Retour')}</button>
    </div>
  );
}
