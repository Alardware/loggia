/* Les feuilles de l’édition, chargées à la demande : la feuille d’une carte (`CardEditSheet`), le composeur (`ComposeurCartes`) et l’historique des mises en page (`FeuilleHistorique`).
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, useMemo, cloneElement } from 'react';
import { LOGGIA_INDEX, cfgSet, switchLights, iconesCfg, compteOrdinaire } from '../state.js';
import { deCelsius } from '../unites.js';
import { BottomSheet, NomFeuille, editBtn, CroixFeuille, cvId, Fi, TitreFeuille, ListeChoix } from '../ui.jsx';
import { DESSINS_CAT, FONTE_CAT } from '../dessins.js';
import { vuePlante } from '../plantes.js';
import { domaineEdition } from '../objets.js';
import { LISERE } from '../styles.js';
import { Ico } from '../icones.jsx';
import { locale, tr, comparerTextes, trN } from '../i18n.js';
import { cvEstLumiere, iconeChoisie, lireEpingles, Segment, rmNorm, filtresEntite, distributeurConfigure, plantesDeLaMaison, climateZones, estClimate } from '../app/noyau.jsx';
import { RmBascule, RM_ICO } from '../cartes/briques.jsx';
import { FicheRangee, heureDe } from '../appareils/fiches.jsx';
import { PlugIcon } from '../cartescustom/cartes.jsx';
import { roomEntitiesBrutes } from '../app/decouverte.jsx';
import { piecesDeLaMaison, layoutOf, ROOM_LAYOUT_KEY, layoutsOf } from './disposition.jsx';
import { OUTILS_VUES } from '../outilsvues.js';

// Emprunté au monolithe (outilsvues.js) : App.jsx le pose avant le premier rendu.
const { ChoixIcone, domainesEdition, habillagePiece, objFiltres } = OUTILS_VUES;
// Une liste-fonction se prête appelée (tests/listes_fonctions.test.mjs).
const DOMAINES_EDITION = () => domainesEdition();
const OBJ_FILTRES = () => objFiltres();

/* L'historique des mises en page.
 *
 * UNE VERSION PAR SEANCE, pas par geste. Un journal des gestes donnerait
 * cinquante entrees a trois secondes d'intervalle, et l'on n'y retrouverait
 * rien. Ce qu'on veut restaurer, c'est « l'accueil d'avant ma seance de ce
 * matin » — donc l'etat capture a l'ENTREE en edition, archive a la sortie si
 * quelque chose a bouge.
 *
 * Le defaire/refaire vit en memoire et meurt en quittant l'edition ; celui-ci
 * survit et suit la maison. Les deux se completent : l'un rattrape le geste,
 * l'autre la seance.
 */

/** Quand une version a ete prise, dans la langue de l'interface.
 *
 * `Intl.RelativeTimeFormat` traduit lui-meme, dans les 64 langues de HA —
 * la ou `relTime` (format.js) passe par le catalogue. Deux chemins, parce que
 * l'un dit « il y a deux heures » et l'autre « Il y a 2 h ».
 */
function quandVersion(ts) {
  const secs = Math.round((ts - Date.now()) / 1000);   // negatif : c'est du passe
  const paliers = [[60, 'second', 1], [3600, 'minute', 60], [86400, 'hour', 3600], [604800, 'day', 86400]];
  try {
    for (const [borne, unite, taille] of paliers) {
      if (Math.abs(secs) < borne) return new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(Math.round(secs / taille), unite);
    }
    // Au-dela d'une semaine, « il y a 3 semaines » situe moins bien qu'une date.
    return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
  } catch { return new Date(ts).toLocaleString(locale()); }
}

/** Ce qu'une version contient, en clair.
 *
 * Sans cela la liste n'est qu'une suite de dates, et l'on restaure a l'aveugle.
 */
function resumeVersion(g) {
  const n = [];
  const caches = (g.caches || []).length;
  if (caches) n.push(tr(caches > 1 ? '{n} sections masquées' : '{n} section masquée', { n: caches }));
  const tailles = Object.keys(g.tailles || {}).length;
  if (tailles) n.push(tr(tailles > 1 ? '{n} tuiles redimensionnées' : '{n} tuile redimensionnée', { n: tailles }));
  const fmts = Object.keys(g.formats || {}).length;
  if (fmts) n.push(tr(fmts > 1 ? '{n} écrans à part' : '{n} écran à part', { n: fmts }));
  const ordre = (g.piecesOrdre || []).length;
  if (ordre) n.push(tr('pièces réordonnées'));
  return n.length ? n.join(' · ') : tr('Agencement par défaut');
}

function FeuilleHistorique({ entrees, onRestaurer, onOublier, onClose }) {
  return (
    <BottomSheet onClose={onClose}>
      {(close) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <NomFeuille><span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-.01em' }}>{tr('Historique des mises en page')}</span></NomFeuille>
            {entrees.length > 0 && (
              <button onClick={() => { onOublier(); close(); }} style={editBtn(false)}>{tr('Tout oublier')}</button>
            )}
            <CroixFeuille />
          </div>
          {entrees.length === 0
            ? <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text1)', padding: '26px 4px', textAlign: 'center' }}>
              {tr('Aucune version enregistrée. Une séance d’édition qui change quelque chose en dépose une.')}
            </div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '54vh', overflowY: 'auto' }}>
                {entrees.map((e, i) => (
                  <div key={e.ts} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', borderRadius: 13, background: 'var(--o-s1)' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{tr('Avant la séance')} · {quandVersion(e.ts)}</span>
                      <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--o-text1)', marginTop: 2 }}>{resumeVersion(e.grille || {})}</span>
                    </span>
                    <button onClick={() => { onRestaurer(e); close(); }} style={editBtn(i === 0)}>{tr('Restaurer')}</button>
                  </div>
                ))}
              </div>
            )}
          {/* Restaurer n'est pas un point de non-retour : la pile de la seance
            * en cours le rattrape comme n'importe quel autre geste. */}
          {entrees.length > 0 && (
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text1)', marginTop: 12 }}>
              {tr('Une restauration se défait comme un geste ordinaire.')}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
/* La piece qui montre une entite : celle dont la grille la porte (decouverte
 * ou ajout), sinon sa zone Home Assistant. */
function pieceDeLEntite(hass, id) {
  const p = piecesDeLaMaison().find(x => roomEntitiesBrutes(hass, x).indexOf(id) >= 0 || (layoutOf(ROOM_LAYOUT_KEY, x).added || []).indexOf(id) >= 0);
  if (p) return p;
  return (LOGGIA_INDEX && typeof LOGGIA_INDEX.areaNameOf === 'function') ? (LOGGIA_INDEX.areaNameOf(id) || null) : null;
}
/* Deplacer une entite dans une piece : elle entre dans la grille de celle-ci
 * et sort de toutes les autres — en UNE ecriture, pour toutes les pieces :
 * deux ecritures successives liraient le meme agencement perime. */
function deplacerDansPiece(hass, id, vers) {
  const all = { ...layoutsOf(ROOM_LAYOUT_KEY) };
  const meme = (x, y) => (x || []).join('|') === (y || []).join('|');
  let change = false;
  piecesDeLaMaison().forEach(p => {
    const L = { ...(all[p] || {}) };
    const derive = roomEntitiesBrutes(hass, p).indexOf(id) >= 0;
    const added = (L.added || []).filter(x => x !== id);
    const removed = (L.removed || []).filter(x => x !== id);
    if (p === vers) { if (!derive) added.push(id); } else if (derive) removed.push(id);
    if (meme(added, L.added) && meme(removed, L.removed)) return;
    if (added.length) L.added = added; else delete L.added;
    if (removed.length) L.removed = removed; else delete L.removed;
    if (Object.keys(L).length) all[p] = L; else delete all[p];
    change = true;
  });
  if (change) cfgSet({ [ROOM_LAYOUT_KEY]: Object.keys(all).length ? all : null });
}
/* Une prise declaree lumiere prend la carte et le filtre des lampes : la
 * liste `loggia_switchlights`, celle que Parametres ecrit. */
function declarerLumiere(id, oui) {
  const l = switchLights().filter(x => x !== id);
  const n = oui ? [...l, id] : l;
  cfgSet({ loggia_switchlights: n.length ? n : null });
}

/* ── L'ICÔNE D'UNE CARTE, CHOISIE À LA MAIN (26/09) ──────────────────────────
 *
 * « Je veux pouvoir, si je le désire, modifier l'icône par défaut », sans que
 * cela « change de catégorie », et « peu importe le type de carte ».
 *
 * Jusqu'ici le seul levier était de déclarer une prise « lumière » : elle
 * changeait alors d'icône, mais aussi de carte, de famille et de filtre. Trois
 * effets pour une envie d'un seul.
 *
 * Un choix d'icône ne fait donc QUE cela. Il se range par entité dans la maison
 * (`loggia_icones`), il vaut pour toutes les cartes qui montrent cette entité —
 * tuile, compacte, fiche, chip — et l'effacer rend la devinette d'origine.
 *
 * Trente glyphes, trois pages de dix comme la fiche d'une pièce, tous vérifiés
 * dans `public/fonts/uicons-regular-rounded.css`. */
/* LA GRILLE D'ICÔNES SUIT LA CATÉGORIE DE LA CARTE (27/09).
 *
 * « Je ne retrouve pas mon catalogue éclairage. Pour chaque catégorie, il
 * faudrait filtrer et mettre en avant d'abord les icônes liées à sa catégorie,
 * puis passer aux autres. »
 *
 * Une grille de deux cents icônes où la bonne est en page six ne sert à rien.
 * Pour une lampe, les ampoules d'abord ; pour un volet, les volets ; pour une
 * prise, l'électroménager. Le reste suit, sans disparaître — on peut toujours
 * mettre une clé à molette sur une lampe si on le veut.
 *
 * Chaque groupe donne d'abord ses DESSINS, puis ses glyphes de police (« les
 * icônes de base ») : un thermostat dessiné avant un thermomètre de police. */
const GROUPES_ICONES = {
  lumiere: { dessins: ['eclairage'], fonte: ['eclairage'] },
  volet: { dessins: ['ouvrants'], fonte: [] },
  chauffage: { dessins: ['climat'], fonte: [] },
  prise: { dessins: ['electro', 'iot'], fonte: ['cuisine', 'energie'] },
  multimedia: { dessins: ['multimedia'], fonte: ['multimedia'] },
  capteur: { dessins: ['securite', 'meteo'], fonte: ['securite'] },
  camera: { dessins: ['securite'], fonte: ['securite'] },
  serrure: { dessins: ['ouvrants', 'securite'], fonte: ['securite'] },
  alarme: { dessins: ['securite'], fonte: ['securite'] },
  sirene: { dessins: ['securite'], fonte: ['securite'] },
  presence: { dessins: ['securite'], fonte: ['securite'] },
  aspirateur: { dessins: ['iot'], fonte: ['reseau'] },
  tondeuse: { dessins: ['iot', 'maison'], fonte: [] },
  plante: { dessins: ['maison'], fonte: [] },
  animaux: { dessins: ['maison'], fonte: [] },
};
/* Les SUGGÉRÉES : uniquement les familles du domaine de la carte, et rien
 * derrière. C'est la différence avec `iconesPour`, qui fait suivre toute la
 * bibliothèque — utile quand la grille était l'unique entrée, encombrant
 * maintenant qu'une bande de familles et une recherche sont là. */
function iconesSuggerees(domaine) {
  const g = GROUPES_ICONES[domaine] || { dessins: [], fonte: [] };
  const vues = new Set();
  const out = [];
  const pousser = (liste) => { for (const n of (liste || [])) { if (!vues.has(n)) { vues.add(n); out.push(n); } } };
  g.dessins.forEach(c => pousser(DESSINS_CAT[c]));
  g.fonte.forEach(c => pousser(FONTE_CAT[c]));
  return out;
}
/** Poser un glyphe, ou l'enlever (`null`) pour revenir au défaut. */
function declarerIcone(id, glyphe) {
  const m = { ...iconesCfg() };
  if (glyphe) m[id] = glyphe; else delete m[id];
  cfgSet({ loggia_icones: Object.keys(m).length ? m : null });
}

function CardEditSheet({ ed, id, nom, origine, hass, onClose, piece = null }) {
  const [val, setVal] = useState(ed.labelOf(id) || '');
  const estSection = id.indexOf('sect:') === 0;
  // Un poste de consommation s'appelle `dev:<entity_id>` : le prefixe cachait
  // l'entite a la fiche.
  const prefixe = id.indexOf('dev:') === 0 ? 'dev:' : '';
  const brut = prefixe ? id.slice(prefixe.length) : id;
  const estEntite = brut.indexOf('.') > 0 && brut.indexOf(':') < 0;
  /* Une carte de ZONE (radiateur en fil pilote) n'a pas d'`entity_id`, mais
   * elle a une cle stable : elle peut donc porter une icone choisie. Un
   * titre de section, non — il n'a pas de dessin. */
  const estZone = brut.indexOf('zone:') === 0;
  const peutChoisirIcone = estEntite || estZone;
  const S = (hass && hass.states) || {};
  const classe = (S[brut] && S[brut].attributes && S[brut].attributes.device_class) || '';
  const domaine = domaineEdition(brut, { estLumiere: cvEstLumiere(brut), classe });
  const estPrise = estEntite && brut.indexOf('switch.') === 0;
  /* Declarer une prise « lumiere » ecrit `loggia_switchlights`, la
   * configuration de la maison (03/10) : un compte Home Assistant ordinaire
   * ne pourrait jamais l'enregistrer, il voit le domaine sans le menu.
   * L'icone, elle, reste a tous : `loggia_icones` est de l'apparence. */
  const peutDeclarer = estPrise && !compteOrdinaire(hass);
  const [lumiere, setLumiere] = useState(estPrise && cvEstLumiere(brut));
  // L'icone choisie : `null` = celle que Loggia devine (26/09).
  const [monIcone, setMonIcone] = useState(() => iconeChoisie(brut));
  // L'apercu en tete : on allume pour voir bouger l'appareil qu'on choisit.
  const [apercuAllume, setApercuAllume] = useState(true);
  const pieces = estEntite ? piecesDeLaMaison() : [];
  const pieceActuelle = estEntite ? (piece || pieceDeLEntite(hass, brut)) : null;
  const [choixPiece, setChoixPiece] = useState(pieceActuelle);
  const [epingle, setEpingle] = useState(estEntite && lireEpingles().some(x => cvId(x) === brut));
  const nomId = 'o-cardnom-' + (estEntite ? brut.slice(0, brut.indexOf('.')) : 'x');
  const identId = 'o-cardident-' + (estEntite ? brut.slice(0, brut.indexOf('.')) : 'x');

  const valider = (close) => {
    ed.rename(id, val);
    if (estPrise && lumiere !== cvEstLumiere(brut)) declarerLumiere(brut, lumiere);
    /* Et on REDESSINE. Le choix d'icône ne passe par aucun état de React : il
     * se lit dans la configuration de la maison, au moment du rendu. Écrit sans
     * rien secouer, il restait donc invisible jusqu'au prochain rechargement —
     * « si j'en choisis un ça ne le change pas, l'ancien reste » (27/09). */
    if (peutChoisirIcone && monIcone !== iconeChoisie(brut)) { declarerIcone(brut, monIcone); if (ed.rafraichir) ed.rafraichir(); }
    if (estEntite && choixPiece && choixPiece !== pieceActuelle) { deplacerDansPiece(hass, brut, choixPiece); if (ed.rafraichir) ed.rafraichir(); }
    if (estEntite) {
      const eps = lireEpingles();
      const etait = eps.some(x => cvId(x) === brut);
      if (etait !== epingle) { const suiv = epingle ? eps.concat(brut) : eps.filter(x => cvId(x) !== brut); cfgSet({ loggia_epingles: suiv.length ? suiv : null }); }
    }
    close();
  };
  // Sans `outline: none` (23/09, plan M7) : posé en style en ligne, il battait
  // la règle `:focus-visible` de la feuille et le champ focalisé ne se voyait
  // plus au clavier. L'anneau d'accent revient, ici comme ailleurs.
  const champ = { width: '100%', boxSizing: 'border-box', padding: '10px 13px', borderRadius: 10, background: 'var(--o-s1)', border: LISERE, color: 'var(--o-text)', fontSize: 13, fontWeight: 600 };
  const etiquette = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', margin: '14px 2px 7px' };
  /* Les puces colorées du domaine, de la pièce et de la largeur ont vécu du
   * 14/09 au 29/09 — « manque de couleurs dans l'édition ». La couleur reste,
   * mais portée par les lignes des menus et par les segments, qui n'ont plus
   * besoin de ces deux aides. */
  const domaineChoisi = estPrise ? (lumiere ? 'lumiere' : 'prise') : domaine;
  /* La grille suit la catégorie de la carte, et se refait si l'on bascule une
   * prise en lumière. Une RECHERCHE passe devant la famille : on cherche dans
   * toute la bibliothèque, pas seulement sous l'onglet ouvert. */
  const domIcone = estZone ? 'chauffage' : domaineChoisi;
  const listeSuggerees = useMemo(() => iconesSuggerees(domIcone), [domIcone]);
  /* Toucher l'icone DEJA choisie la rend au defaut : c'est le seul moyen de
   * revenir a ce que Loggia devine, et il n'existe que pour une entite — une
   * piece et un scenario en ont toujours une. */
  const choisirIcone = (ic) => setMonIcone(ic === monIcone ? null : ic);
  /* La ligne d'un menu a la forme du champ NOM au-dessus : un réglage ne
   * change pas de boîte selon qu'on y tape ou qu'on y choisit. */
  const ligneMenu = { width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 13px', borderRadius: 10, background: 'var(--o-s1)', border: LISERE, color: 'var(--o-text)', fontSize: 13, fontWeight: 700 };
  /* L'icône du domaine porte SA teinte — sauf sur la ligne choisie, qui est
   * en accent plein : là, tout passe en blanc, comme partout ailleurs. */
  const glypheDomaine = (dm, choisi) => {
    if (!dm) return null;
    const c = choisi ? '#fff' : 'rgb(' + dm.rgb + ')';
    return <span style={{ display: 'inline-flex', color: c }}>{dm.prise ? <PlugIcon size={13} /> : dm.ico ? <Ico name={dm.ico} size={14} color={c} /> : <Fi i={dm.fi} size={13} color={c} />}</span>;
  };
  const tousDomaines = DOMAINES_EDITION();
  const domActuel = tousDomaines.find(d => d.id === domaineChoisi) || null;
  // Deux options, pas quinze : ce sont les deux seules qui se choisissent.
  const optionsDomaine = tousDomaines.filter(d => d.id === 'prise' || d.id === 'lumiere').map(d => ({ id: d.id, label: d.label, ico: glypheDomaine(d, d.id === domaineChoisi) }));
  const optionsPiece = pieces.map(p => {
    // L'icone et la couleur de la piece : celles de sa carte a l'Accueil.
    const zone = ((LOGGIA_INDEX && LOGGIA_INDEX.areaList) || []).find(z => z && z.name === p);
    const hp = habillagePiece(p, zone && zone.icon);
    const couleur = hp.col;
    return { id: p, label: p, ico: cloneElement(hp.icon, { size: 14, color: p === choixPiece ? '#fff' : couleur }) };
  });
  /* L'APERÇU, en tête de la fiche. Un appareil dessiné porte son mouvement :
   * sans l'allumer, on choisit une icône sans jamais voir ce qu'elle fait.
   * L'interrupteur ne commande rien dans la maison — il n'allume que
   * l'aperçu. Sans icône choisie, il montre celle du domaine. */
  const icoApercu = monIcone || (domActuel && domActuel.ico) || null;

  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <div style={{ padding: '0 0 8px' }}>
          <TitreFeuille style={{ fontSize: 15, fontWeight: 800 }}>{estSection ? tr('Modifier le titre') : tr('Modifier l’entité')}</TitreFeuille>

          {peutChoisirIcone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, padding: 12, borderRadius: 14, background: 'var(--o-s1)', border: LISERE }}>
              <span style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: apercuAllume ? 'var(--o-accent-fond)' : 'var(--o-s2)', color: apercuAllume ? '#fff' : 'var(--o-text2)' }}>
                {icoApercu ? <Ico name={icoApercu} size={24} anime={apercuAllume} /> : <PlugIcon size={22} />}
              </span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--o-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val.trim() || origine || nom}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('L’aperçu ne commande rien : il montre le dessin en mouvement.')}</span>
              </span>
              <RmBascule on={apercuAllume} nom={tr('Allumer l’aperçu')} onToggle={() => setApercuAllume(v => !v)} couleur="var(--o-accent)" />
            </div>
          )}

          <label htmlFor={nomId} style={etiquette}>{tr('NOM')}</label>
          {/* `control-has-associated-label` ne suit pas `htmlFor` : l'etiquette
            * est juste au-dessus et designe le champ par son identifiant. */}
          {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
          <input id={nomId} value={val} onChange={(e) => setVal(e.target.value)} placeholder={origine || nom}
            onKeyDown={(e) => { if (e.key === 'Enter') valider(close); }} style={champ} autoFocus />
          {!estSection && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', margin: '6px 2px 0' }}>
            {tr('Vide : revient à « {n} ». Ce nom ne vaut que pour cette vue ; Home Assistant n’est pas modifié.', { n: origine || nom })}
          </div>}

          {estEntite && (
            <>
              <div style={etiquette}>{tr('DOMAINE')}</div>
              {/* Un MENU, pas quinze puces (maquette du 29/09). Quinze domaines
                * dont deux seulement se choisissent, c'était treize boutons
                * éteints pour rien. Le menu ne montre que ce qui se choisit :
                * une prise peut se déclarer lumière, le reste vient de Home
                * Assistant et ne se discute pas. */}
              {peutDeclarer
                ? <ListeChoix value={domaineChoisi} label={tr('Domaine')} onChange={(v) => setLumiere(v === 'lumiere')} style={ligneMenu} options={optionsDomaine} />
                : <div style={{ ...ligneMenu, cursor: 'default' }}>
                    <span style={{ display: 'inline-flex', flexShrink: 0 }}>{glypheDomaine(domActuel, false)}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{domActuel ? domActuel.label : ''}</span>
                  </div>}
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', margin: '6px 2px 0' }}>
                {/* Une prise qu'un administrateur a declaree lumiere : Home
                  * Assistant la dit `switch`, la phrase mentirait. */}
                {peutDeclarer ? tr('Une prise peut se déclarer lumière : elle prend alors la carte et le filtre des lampes.') : estPrise && lumiere ? '' : tr('Le domaine vient de Home Assistant.')}
              </div>
            </>
          )}

          {/* L'ICÔNE, et rien d'autre (26/09). Toucher la puce allumée la rend
            * au défaut ; le domaine, la famille et le filtre ne bougent pas —
            * c'était tout le problème de la déclaration « lumière ».
            *
            * Pas seulement pour une ENTITÉ (27/09) : un radiateur en fil pilote
            * est une ZONE, sa carte porte une clé `zone:…` et non un
            * `entity_id`. « Les radiateurs, impossible de changer l'icône, je
            * n'ai pas l'option » — la section vivait sous la condition du
            * domaine, qui ne vaut que pour une entité. */}
          {peutChoisirIcone && (
            <>
              <ChoixIcone valeur={monIcone} onChoisir={choisirIcone} suggerees={listeSuggerees} />
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', margin: '6px 2px 0' }}>
                {monIcone ? tr('Seul le dessin change : la famille, le filtre et la carte restent les mêmes.') : tr('Aucune icône choisie : Loggia garde celle qu’il devine.')}
              </div>
            </>
          )}

          {estEntite && pieces.length > 0 && (
            <>
              <div style={etiquette}>{tr('PIÈCE')}</div>
              {/* Une maison de douze pièces faisait douze puces sur quatre
                * lignes : le menu les tient sur une, avec l'icône et la teinte
                * de chacune — celles de sa carte à l'Accueil. */}
              <ListeChoix value={choixPiece} label={tr('Pièce')} onChange={setChoixPiece} style={ligneMenu} options={optionsPiece} />
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', margin: '6px 2px 0' }}>{tr('Changer de pièce la déplace d’une grille à l’autre ; Home Assistant n’est pas modifié.')}</div>
            </>
          )}

          <label htmlFor={identId} style={etiquette}>{tr('IDENTIFIANT')}</label>
          {/* En lecture seule, mais un vrai champ : il se selectionne et se copie. */}
          {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
          <input id={identId} value={estEntite ? brut : id} readOnly spellCheck={false} onFocus={(e) => e.target.select()}
            style={{ ...champ, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12.5, color: 'var(--o-text2)' }} />

          {estEntite && (
            <FicheRangee premiere titre={tr('Épinglée sur l’accueil')} desc={tr('Apparaît dans les favoris, en plus de sa pièce.')}
              droite={<RmBascule on={epingle} nom={tr('Épinglée sur l’accueil')} onToggle={() => setEpingle(v => !v)} couleur="var(--o-accent)" />} />
          )}

          {!estSection && ed.estCompact && prefixe !== 'dev:' && brut.indexOf('zone:') !== 0 && (
            <FicheRangee titre={tr('Carte compacte')} desc={tr('Une rangée au lieu de deux : icône, nom, état et le contrôle.')}
              droite={<RmBascule on={ed.estCompact(id)} nom={tr('Carte compacte')} onToggle={() => ed.basculerCompact(id)} couleur="var(--o-accent)" />} />
          )}

          {!estSection && ed.estLarge && (
            <>
              <div style={etiquette}>{tr('LARGEUR')}</div>
              <Segment grandir value={!!ed.estLarge(id)} onChange={() => ed.basculerLarge(id)} label={tr('Largeur')}
                options={[{ id: false, label: tr('Simple') }, { id: true, label: tr('Double') }]} />
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', margin: '6px 2px 0' }}>{tr('Double : la carte prend deux emplacements côte à côte.')}</div>
            </>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 20, alignItems: 'center' }}>
            <button onClick={() => { ed.remove(id); close(); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 14px', borderRadius: 14, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'rgba(var(--o-bad-rgb),.12)', border: '1px solid rgba(var(--o-bad-rgb),.45)', color: 'var(--o-bad)' }}><Fi i="cross-small" size={12} />{tr('Supprimer')}</button>
            <span style={{ flex: 1 }} />
            <button onClick={() => valider(close)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 16px', borderRadius: 14, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'var(--o-accent-fond)', color: '#fff' }}><Fi i="plus" size={12} />{tr('Enregistrer')}</button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

// Domaines proposables dans une piece. Le reste — automatisations, mises a
// jour, entites de diagnostic — n'a rien a faire sur une carte d'ambiance.
const ROOM_ADD_DOMAINS = ['light', 'switch', 'cover', 'climate', 'media_player', 'fan',
  'lock', 'vacuum', 'sensor', 'binary_sensor', 'humidifier', 'water_heater', 'number', 'input_boolean'];

/**
 * Feuille d'ajout d'appareils a une piece.
 *
 * `present` : ce que la piece affiche deja. `onToggle(id)` ajoute ou retire.
 * La feuille reste ouverte : on compose sa piece d'un coup, pas entite par
 * entite avec un aller-retour a chaque fois.
 */
/**
 * Feuille d'ajout, commune aux vues.
 *
 * `room` nomme une zone Home Assistant dont on propose les entites d'emblee ;
 * sans elle, seule la recherche opere — c'est le cas des vues par domaine.
 * `domaines` restreint ce qu'on peut ajouter : proposer un radiateur dans la
 * vue Lumieres n'aurait pas de sens.
 */
/* Une ligne du composeur : la tuile teintee, le nom, un sous-titre qui dit ce
 * que c'est, et a droite « + » — ou la coche quand la carte est deja sur la
 * vue (un tap la retire). La meme ligne pour une carte de Loggia et pour un
 * appareil. */
function LigneComposeur({ icone, rgb = 'var(--o-accent-rgb)', nom, sous, on, onToggle }) {
  return (
    <div role="checkbox" aria-checked={on} tabIndex={0} onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 10px', borderRadius: 12, cursor: 'pointer', border: '1px solid ' + (on ? 'rgba(' + rgb + ',.45)' : 'var(--o-bd3)'), background: on ? 'rgba(' + rgb + ',.10)' : 'var(--o-s2)' }}>
      <span style={{ ...RM_ICO('rgba(' + rgb + ',.16)', 'rgb(' + rgb + ')'), width: 34, height: 34, borderRadius: 11 }}>{icone}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sous}</div>
      </div>
      <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', border: on ? 'none' : 'var(--o-bw,1px) solid var(--o-bd2)', color: on ? '#fff' : 'var(--o-text1)' }}><Fi i={on ? 'check' : 'plus'} size={11} /></span>
    </div>
  );
}

/* « Ajouter une carte » (composeur du 15/09) — la meme feuille partout ou l'on
 * range des cartes. Deux familles, dans cet ordre : les CARTES DE LOGGIA
 * (distributeur, plantes, zones fil pilote — ce que Loggia compose a partir de
 * plusieurs entites), puis les APPAREILS, groupes par piece, la piece courante
 * ouverte, les autres repliees avec leur compte. La recherche cherche tout :
 * nom de carte, nom d'appareil, piece, identifiant, cle interne. Rien ne
 * choisit un dessin : un seul type, le standard, la taille au coin de la
 * carte. `composites` : les vues qui ne veulent que des entites (Volets,
 * Energie) coupent la premiere famille. */
function ComposeurCartes({ hass, dc = null, present = [], onToggle, onClose, piece = null, domaines = ROOM_ADD_DOMAINS, entete = null, pied = null, composites = true }) {
  const [q, setQ] = useState('');
  const [filtre, setFiltre] = useState('tous');
  const [ouverts, setOuverts] = useState(() => (piece ? { [rmNorm(piece)]: true } : {}));
  const S = (hass && hass.states) || {};
  const nomEnt = (id) => (S[id] && S[id].attributes && S[id].attributes.friendly_name) || id;
  const domaineOk = (id) => domaines.indexOf(id.slice(0, id.indexOf('.'))) >= 0;
  const pieceDe = (id) => (LOGGIA_INDEX && typeof LOGGIA_INDEX.areaNameOf === 'function' && LOGGIA_INDEX.areaNameOf(id)) || null;
  const nbEntites = Object.keys(S).length;
  const domainesSig = domaines.join('|');
  // Les appareils : chaque entite avec ses filtres (le vocabulaire d'Objets) et sa piece.
  const appareils = useMemo(() => Object.keys(S).filter(domaineOk).sort().map(id => ({ id, nom: nomEnt(id), piece: pieceDe(id), filtres: filtresEntite(S, id) })), [nbEntites, domainesSig]);
  // Les cartes de Loggia disponibles chez toi : le distributeur (configure),
  // chaque plante, chaque zone fil pilote (un thermostat est une entite, il
  // vit chez les appareils). La piece courante d'abord.
  const cartes = useMemo(() => {
    if (!composites) return [];
    const out = [];
    if (distributeurConfigure()) out.push({ cle: 'obj:feeder', nom: tr('Distributeur de croquettes'), sous: dc ? dc.distributeur().phrase.texte : tr('Distributeur'), fi: 'paw', rgb: 'var(--o-piece-ambre-rgb)', piece: null });
    // Les plantes, découvertes ou configurées (C29) : la liste d'Objets.
    plantesDeLaMaison(S).forEach(p => {
      const pl = dc ? dc.plante(p.base) : null;
      const v = pl ? vuePlante(pl, { quand: heureDe, deCelsius }) : null;
      out.push({ cle: 'plant:' + p.base, nom: p.nom, sous: [pl && pl.room, v && v.phrase].filter(Boolean).join(' · ') || tr('Plante'), fi: 'leaf',
        rgb: v && v.ton === 'bad' ? 'var(--o-bad-rgb)' : v && v.ton === 'warn' ? 'var(--o-warn-rgb)' : 'var(--o-ok-rgb)', piece: pl ? pl.room : null });
    });
    climateZones(S).filter(z => !estClimate(z)).forEach(z => out.push({ cle: 'zone:' + z.id, nom: z.name || z.room || z.id, sous: tr('Zone de chauffage') + (z.room ? ' · ' + z.room : ''), fi: 'flame', rgb: 'var(--o-warn2-rgb)', piece: z.room || null }));
    if (piece) out.sort((a, b) => (rmNorm(b.piece || '') === rmNorm(piece) ? 1 : 0) - (rmNorm(a.piece || '') === rmNorm(piece) ? 1 : 0));
    return out;
  }, [composites, nbEntites, piece]);
  const puces = OBJ_FILTRES().filter(f => f.id !== 'favoris' && (f.id === 'tous' || appareils.some(a => a.filtres.indexOf(f.id) >= 0)));
  const terme = q.trim().toLowerCase();
  const cherche = (...champs) => champs.some(c => c && String(c).toLowerCase().indexOf(terme) >= 0);
  const cartesVisibles = terme ? cartes.filter(c => cherche(c.nom, c.sous, c.cle, c.piece)) : cartes;
  const appareilsVisibles = appareils.filter(a => (filtre === 'tous' || a.filtres.indexOf(filtre) >= 0) && (!terme || cherche(a.id, a.nom, a.piece)));
  // Groupes par piece : la piece courante en tete, les autres par nom, les
  // appareils sans piece en dernier.
  const groupes = [];
  if (!terme) {
    const par = new Map();
    appareilsVisibles.forEach(a => { const g = a.piece || ''; if (!par.has(g)) par.set(g, []); par.get(g).push(a); });
    const cle = (g) => (piece && rmNorm(g) === rmNorm(piece)) ? '0' : g ? '1' + g.toLowerCase() : '2';
    [...par.keys()].sort((a, b) => comparerTextes(cle(a), cle(b))).forEach(g => groupes.push({ nom: g, liste: par.get(g) }));
  }
  const iconeDe = (a) => {
    // La camera n'a plus de famille (17/09) : elle garde son icone.
    if (a.id.indexOf('camera.') === 0) return <Fi i="camera" size={15} />;
    const f = OBJ_FILTRES().find(x => x.id === (a.filtres[0] || ''));
    return f ? (f.prise ? <PlugIcon size={15} /> : f.ico ? <Ico name={f.ico} size={15} /> : <Fi i={f.fi} size={15} />) : <Fi i="bolt" size={15} />;
  };
  const ligneAppareil = (a) => <LigneComposeur key={a.id} icone={iconeDe(a)} nom={a.nom} sous={[a.piece, a.id].filter(Boolean).join(' · ')} on={present.indexOf(a.id) >= 0} onToggle={() => onToggle(a.id)} />;
  const titre = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', margin: '14px 2px 8px' };
  const puce = (on) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap', padding: '7px 11px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: 'var(--o-bw,1px) solid ' + (on ? 'transparent' : 'var(--o-bd2)'), background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)' });
  const colonne = { display: 'flex', flexDirection: 'column', gap: 8 };

  return (
    <BottomSheet onClose={onClose}>
      {() => (
        <div style={{ padding: '0 0 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <NomFeuille><div style={{ fontSize: 15, fontWeight: 800 }}>{entete || tr('Ajouter une carte')}</div></NomFeuille>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' }}>{trN(present.length, '{n} carte', '{n} cartes')}</div>
            <span style={{ flex: 1 }} />
            <CroixFeuille />
          </div>
          <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginBottom: 12 }}>{tr('Cochez pour ajouter, décochez pour retirer. Tout s’applique tout de suite.')}</div>

          <input aria-label={tr('Rechercher une carte, un appareil, une pièce…')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Rechercher une carte, un appareil, une pièce…')}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 13px', borderRadius: 10, background: 'var(--o-s1)', border: LISERE, color: 'var(--o-text)', fontSize: 13, fontWeight: 600 }} />
          {puces.length > 2 && (
            <div className="o-favrow" style={{ display: 'flex', gap: 8, overflowX: 'auto', flexWrap: 'nowrap', margin: '10px 0 0' }}>
              {puces.map(f => (
                <button key={f.id} onClick={() => setFiltre(f.id)} aria-pressed={filtre === f.id} style={puce(filtre === f.id)}>
                  {f.prise ? <PlugIcon size={12} /> : f.ico ? <Ico name={f.ico} size={13} /> : <Fi i={f.fi} size={12} />}{f.label}
                </button>
              ))}
            </div>
          )}

          {cartesVisibles.length > 0 && (
            <>
              <div style={titre}>{tr('CARTES DE LOGGIA')} ({cartesVisibles.length})</div>
              <div style={colonne}>
                {cartesVisibles.map(c => <LigneComposeur key={c.cle} icone={<Fi i={c.fi} size={15} />} rgb={c.rgb} nom={c.nom} sous={c.sous} on={present.indexOf(c.cle) >= 0} onToggle={() => onToggle(c.cle)} />)}
              </div>
            </>
          )}

          {terme ? (
            <>
              <div style={titre}>{appareilsVisibles.length ? (appareilsVisibles.length > 1 ? tr('{n} APPAREILS', { n: appareilsVisibles.length }) : tr('1 APPAREIL')) : (cartesVisibles.length ? tr('AUCUN APPAREIL') : tr('AUCUN RÉSULTAT'))}</div>
              <div style={colonne}>{appareilsVisibles.slice(0, 80).map(ligneAppareil)}</div>
            </>
          ) : groupes.map(g => {
            const ouvert = !!ouverts[rmNorm(g.nom)];
            return (
              <div key={g.nom || '-'}>
                <button onClick={() => setOuverts(o => ({ ...o, [rmNorm(g.nom)]: !ouvert }))} aria-expanded={ouvert}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 2px 6px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--o-text3)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textAlign: 'left' }}>
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr('APPAREILS')} · {(g.nom || tr('SANS PIÈCE')).toUpperCase()} ({g.liste.length})</span>
                  <Fi i={ouvert ? 'angle-small-down' : 'angle-small-right'} size={14} />
                </button>
                {ouvert && <div style={colonne}>{g.liste.slice(0, 200).map(ligneAppareil)}</div>}
              </div>
            );
          })}

          {pied && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>{pied}</div>}
        </div>
      )}
    </BottomSheet>
  );
}

export { FeuilleHistorique, CardEditSheet, ComposeurCartes };
