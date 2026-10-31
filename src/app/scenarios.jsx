/* Les scénarios : leur état, leur lancement, leur carte.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, useEffect, useRef } from 'react';
import { formatEcran, ordonnerSelon, ordreDuFormat } from '../disposition.js';
import { cfgVal, cfgSet } from '../state.js';
import { commander } from '../actions.js';
import { useEtatServeur } from '../ui.jsx';
import { LISERE } from '../styles.js';
import { Ico } from '../icones.jsx';
import { scenariosVisibles, rangerScenarios, teinteScenario, nomScenario, nombreCibles, nombreActions, libelleDernier, resumeScenario } from '../scenarios.js';
import { tr, locale, trN } from '../i18n.js';
import { lavisCarte, SURF_CARTE } from './noyau.jsx';
import { useCoarse, useWide } from './ecran.jsx';
import { fxTap } from '../chrome/entete.jsx';

/* ════════════ SCÉNARIOS — composés par Loggia, lancés par le serveur (ADR 0027) ════════════ */
/* L'état des scénarios tel que le serveur l'a dit en dernier. La veille, la
 * recherche et l'Accueil le lisent sans attendre : un seul sondage, celui de
 * `useScenarios`. Avant la première réponse, rien. */
let SCN_ETAT = null;
const scenarios = () => scenariosVisibles(SCN_ETAT && SCN_ETAT.scenarios);
const nomsLiens = () => { const o = {}; ((SCN_ETAT && SCN_ETAT.liens) || []).forEach(l => { o[l.haid] = l.nom; }); return o; };
/* Lancer : le serveur résout et commande avec la main de l'utilisateur. Sans
 * serveur — composant trop ancien —, une scène liée part quand même par le
 * service standard ; un scénario composé, lui, ne peut rien sans lui. */
function lancerScenario(h, id) {
  if (!h) return Promise.resolve(null);
  if (typeof h.callWS === 'function') {
    // Le composant dit ce qu'il a refusé ou raté ; le geste ne doit pas
    // avoir l'air d'avoir marché. Le rejet remonte à l'écoute globale
    // (toast) — aucun appelant ne l'attrape (audit 18/09).
    // `scenario`, et non `id` : `id` est le numéro du message, que la
    // bibliothèque de Home Assistant écrase avec le sien (audit du 03/10).
    return h.callWS({ type: 'loggia/scenarios/lancer', scenario: id }).then(r => {
      if (r && (r.erreurs > 0 || (r.refusees > 0 && !r.n))) {
        const e = new Error(r.n ? tr('Scénario en partie exécuté — {n} commande(s) refusée(s)', { n: (r.erreurs || 0) + (r.refusees || 0) }) : tr('Scénario refusé — aucune cible autorisée ou joignable'));
        e.code = 'scenario_incomplet'; e.resultat = r;
        throw e;
      }
      return r;
    });
  }
  const s = scenarios().find(x => x.id === id);
  if (s && s.lien && h.callService) commander(h, s.lien, 'turn_on');
  return Promise.resolve(null);
}
function useScenarios(hass) {
  const { etat, setEtat, err } = useEtatServeur(hass, 'loggia/scenarios/etat', 5000, tr('Scénarios indisponibles.'));
  /* L'ordre suit le TYPE d'écran (ADR 0052) : celui du composant sur
   * l'ordinateur ; sur la tablette et le téléphone, le leur — tant qu'on n'y
   * a rien rangé, celui de l'ordinateur. `tous` est la liste dans cet ordre ;
   * la veille et la recherche la lisent par SCN_ETAT. */
  const format = formatEcran(useCoarse(), useWide(1180));
  const [ordres, setOrdres] = useState(() => { const v = cfgVal('loggia_scnordre', null); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; });
  const tous = ordonnerSelon((etat && etat.scenarios) || [], ordreDuFormat(ordres, format));
  useEffect(() => { if (etat) SCN_ETAT = { ...etat, scenarios: tous }; }, [etat, ordres, format]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [enCours, setEnCours] = useState(null); // retour visuel immédiat, le temps que le serveur réponde
  const fRef = useRef(null);
  useEffect(() => () => clearTimeout(fRef.current), []);
  const lancer = (id) => {
    setEnCours(id); clearTimeout(fRef.current); fRef.current = setTimeout(() => setEnCours(null), 2500);
    // Le refus remonte à l'écoute globale : pas de `catch` ici non plus.
    lancerScenario(hass, id).then(r => { if (r) setEtat(e => e ? { ...e, scenarios: e.scenarios.map(s => s.id === id ? { ...s, dernier: Date.now() / 1000 } : s) } : e); });
  };
  const enregistrer = async (patch) => {
    const h = hass && typeof hass.callWS === 'function' ? hass : null;
    if (!h) throw new Error(tr('Home Assistant n’est pas joignable.'));
    const r = await h.callWS({ type: 'loggia/scenarios/config', patch });
    if (r && r.etat) { SCN_ETAT = r.etat; setEtat(r.etat); }
    return r;
  };
  /* Ranger les scénarios : l'ordinateur écrit l'ordre du composant, les
   * autres formats le leur.
   *
   * L'ordinateur passait par `enregistrer`, donc par `loggia/scenarios/config`,
   * réservée aux administrateurs : sur un compte ordinaire la flèche était
   * refusée, la vue avalait le refus, et la carte revenait à sa place au
   * sondage suivant (audit du 03/10). Ranger est de l'agencement (ADR 0125) :
   * `rangerScenarios` passe par `loggia/scenarios/ordre`, ouverte à tout
   * compte, et un refus remonte, nommé, au toast global (ADR 0046). */
  const ordonner = async (ids) => {
    if (format === 'pc') {
      const h = hass && typeof hass.callWS === 'function' ? hass : null;
      if (!h) throw new Error(tr('Home Assistant n’est pas joignable.'));
      const r = await rangerScenarios(h, ids);
      if (r && r.etat) { SCN_ETAT = r.etat; setEtat(r.etat); }
      return r;
    }
    const n = { ...ordres, [format]: ids };
    setOrdres(n);
    cfgSet({ loggia_scnordre: n });
    return null;
  };
  const noms = {};
  ((etat && etat.liens) || []).forEach(l => { noms[l.haid] = l.nom; });
  return { etat, err, lancer, enCours, enregistrer, ordonner, noms, tous, liste: scenariosVisibles(tous) };
}

/* `lineHeight` est ÉCRIT, parce que la rangée compte dessus : 15 de ligne plus
 * 4 et 4 de rembourrage font 23 px, la hauteur d'UNE pastille — et la rangée
 * s'y borne pour ne montrer qu'une seule ligne (voir `CarteScenario`). Laissé
 * au défaut de la police, ce nombre changerait avec la langue. */
const H_PUCE_SCN = 23;
const PUCE_SCN = { fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 9, lineHeight: '15px', background: 'var(--o-s1)', color: 'var(--o-text1)', whiteSpace: 'nowrap' };
/* La carte d'un scénario, au gabarit maison : l'icône en haut à gauche dans
 * un disque teinté, le dernier lancement en haut à droite, le titre sous
 * l'icône ; compacte (88) sur l'Accueil, standard (184) dans la vue, où elle
 * dit aussi ce qu'elle fait. La teinte s'applique en entier — lavis, icône,
 * repère —, sans bordure. En cours : le lavis se renforce. */
function CarteScenario({ s, noms = {}, compacte = false, enCours = false, onLancer, style = null, className = null, sansDernier = false }) {
  const t = teinteScenario(s);
  const nom = nomScenario(s);
  const cibles = nombreCibles(s);
  /* La maquette donne un dégradé à la carte, là où Loggia posait un aplat, et
   * ne colore QUE le scénario qui tourne : sur ses captures, seul « Musique ·
   * En cours » est rose, les cinq autres sont gris. La teinte redevient le
   * signal « ça tourne » au lieu d'être la décoration de tout le monde. */
  const fond = enCours ? lavisCarte(t.rgb, .26) : SURF_CARTE;
  const nActions = nombreActions(s);
  return (
    <button type="button" onClick={(e) => { fxTap(e); if (onLancer) onLancer(s.id); }} aria-label={tr('Lancer {x}', { x: nom })} className={className}
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', height: compacte ? 88 : 184, padding: compacte ? '12px 13px' : '14px 15px', boxSizing: 'border-box', borderRadius: 'var(--o-radius,18px)', border: LISERE, cursor: 'pointer', textAlign: 'left', overflow: 'hidden', transition: 'background .25s, box-shadow .25s', color: 'var(--o-text)',
        background: fond,
        boxShadow: enCours ? `0 10px 26px rgba(${t.rgb},.35)` : 'var(--o-shadow,0 6px 16px rgba(0,0,0,.26))', ...(style || {}) }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%' }}>
        <span aria-hidden="true" style={{ width: compacte ? 34 : 38, height: compacte ? 34 : 38, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `rgba(${t.rgb},.22)`, color: t.col, flexShrink: 0 }}><Ico name={s.icone || 'sparkles'} size={compacte ? 18 : 20} color={t.col} /></span>
        {/* En édition, la place du repère revient aux outils de la carte (voir ScenariosView). */}
        {!sansDernier && <span style={{ fontSize: 11, fontWeight: 700, color: enCours ? t.col : 'var(--o-text2)', whiteSpace: 'nowrap', marginLeft: 6 }}>{enCours ? tr('En cours') : libelleDernier(s.dernier, Date.now(), locale())}</span>}
      </div>
      <div style={{ marginTop: compacte ? 8 : 12, fontSize: compacte ? 13 : 15, fontWeight: 700, width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>
      {!compacte && <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, lineHeight: 1.45, color: 'var(--o-text2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.lien_absent ? tr('Scène introuvable') : resumeScenario(s, noms)}</div>}
      {!compacte && (
        /* La rangée s'arrête à la marge de DROITE, et ne montre qu'une ligne.
         *
         * Elle n'était bornée qu'à gauche, chaque pastille en `nowrap` : sur
         * un téléphone la rangée mesurait 192 px pour une carte de 141, et la
         * carte la coupait en plein mot — « scène H », « Loggi » (audit du
         * 27/09, mesuré à 320, 360 et 390 px).
         *
         * Pas de seuil en pixels : ce qui ne tient pas passe à la ligne
         * suivante, hors de la hauteur visible, et disparaît donc ENTIER. La
         * dernière pastille cède la première — l'origine du scénario pèse
         * moins que ce qu'il fait. Et la règle vaut dans les sept langues
         * sans rien régler : une rangée mesure 220 px en français, 249 en
         * espagnol, un nombre écrit d'avance aurait trahi l'une ou l'autre.
         *
         * Mesuré : 1 pastille sur une carte de 141 px, 2 sur 176, 3 sur 236. */
        <div style={{ position: 'absolute', left: 15, right: 15, bottom: 14, display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 6, height: H_PUCE_SCN, overflow: 'hidden' }}>
          <span style={PUCE_SCN}>{trN(nActions, '{n} action', '{n} actions')}</span>
          {cibles != null && <span style={PUCE_SCN}>{trN(cibles, '{n} cible', '{n} cibles')}</span>}
          <span style={PUCE_SCN}>{s.lien ? tr('scène HA') : 'Loggia'}</span>
        </div>
      )}
    </button>
  );
}

export { scenarios, nomsLiens, lancerScenario, useScenarios, CarteScenario };
