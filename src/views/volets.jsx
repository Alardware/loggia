/* Volets : régler ce que Loggia fait tout seul.
 *
 * Quatre règles, chacune débrayable, tenues par le composant serveur — pas par
 * cette page. Elles continuent donc de tourner dashboard fermé, ce qui est
 * bien le moins pour un volet qui doit descendre au coucher du soleil.
 *
 * Ce qui règle UN volet — ses heures, ses jours, sa façade, la porte devant
 * lui — vit dans sa fiche (chantier Volets, V2) : ici restent les réglages de
 * la maison.
 */
import {
  useState, useMemo
} from 'react';
import { BottomSheet, EntPicker, RegleEntete, usePli , useEtatServeur, cvName } from '../ui.jsx';
import { compteOrdinaire } from '../state.js';
import { ZONE_REGLAGES, CAPITALES, MONO, quandCourt, majuscule } from './parcommun.jsx';
import { tr, trN } from '../i18n.js';
import { raisonEchec } from '../refus.js';
import { puceHaute as puce } from '../styles.js';
import { uniteTemp, deCelsius } from '../unites.js';
import { mot, pourquoi } from '../journalmots.js';
import { rafraichirVolets } from '../voletsetat.js';

/* `champ` et `Nombre` vivent ici, et non dans le composant.
 *
 * Un composant defini dans un autre est recree a chaque rendu : React voit un
 * type different au meme endroit et remonte le sous-arbre. Pour un champ de
 * saisie, chaque frappe detruisait donc le champ et emportait le focus — il
 * fallait recliquer entre deux chiffres. Le style le suit : il ne depend de
 * rien d'autre que des variables CSS. */

const champ = { padding: '9px 12px', borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s2)', color: 'var(--o-text1)', fontSize: 13, fontWeight: 600 };

/* `nom` sert d'intitule : le champ n'a pas d'etiquette propre, et l'unite
 * affichee a cote (« min apres le lever ») ne dit pas de quoi il s'agit. */
/* `inerte` (compte ordinaire, V10) : le champ se lit, ne se change pas ; le
 * toucher rappelle `cb` avec la valeur affichée, que `enregistrer` refuse en
 * nommant sa clé, sous la rangée. */
/* La saisie reste un BROUILLON jusqu'à la sortie du champ ou Entrée (relecture
 * du 19/10) : bornée à chaque frappe, « 3 » devenait 5 puis « 30 » 50 — le
 * seuil de vent ne se tapait plus —, et chaque valeur de passage partait au
 * serveur. Vide ou illisible, elle ne change rien. */
const Nombre = ({ v, min, max, pas = 1, unite, nom, cb, inerte = false }) => {
  const [brouillon, setBrouillon] = useState(null);
  const valider = () => {
    if (brouillon == null) return;
    const n = Number(brouillon);
    setBrouillon(null);
    if (String(brouillon).trim() === '' || !Number.isFinite(n)) return;
    const borne = Math.max(min, Math.min(max, n));
    if (borne !== v) cb(borne);
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <input aria-label={nom || unite} type="number" value={brouillon != null ? brouillon : v} min={min} max={max} step={pas}
        readOnly={inerte} aria-disabled={inerte || undefined} onClick={inerte ? () => cb(v) : undefined}
        onChange={e => { if (!inerte) setBrouillon(e.target.value); }}
        onBlur={valider} onKeyDown={e => { if (e.key === 'Enter') valider(); }}
        style={{ ...champ, width: 78, ...(inerte ? { opacity: 0.6, cursor: 'default' } : null) }} />
      <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 700 }}>{unite}</span>
    </span>
  );
};


// Nomme ainsi, et non `JOURS`, pour ne pas se confondre avec le tableau du
// meme nom dans meteo.jsx : l un s appelle, l autre s indexe.
/* Le nom d'une règle dans l'ordre de priorité — celui qu'on lit à l'écran. */
const nomPriorite = (r) => ({
  vent: tr('vent fort'), coucher: tr('fermeture du soir'),
  soleil: tr('protection solaire'), lever: tr('ouverture du matin'),
}[r] || r);

const JOURS_COURTS = () => [tr('lun'), tr('mar'), tr('mer'), tr('jeu'), tr('ven'), tr('sam'), tr('dim')];

/* Fusion locale, miroir de celle du serveur : une section reçoit un patch
 * partiel, le reste de la section survit. */
function fusion(cfg, patch) {
  const n = { ...cfg };
  for (const section of Object.keys(patch || {})) {
    n[section] = { ...(cfg[section] || {}), ...patch[section] };
  }
  return n;
}

/* Défaire un patch refusé : chaque champ touché reprend la valeur d'avant le
 * geste — la valeur affichée ne ment plus jusqu'au relevé suivant (V10). */
export function defaire(cfg, avant, patch) {
  const n = { ...cfg };
  for (const section of Object.keys(patch || {})) {
    const ancien = (avant && avant[section]) || {};
    const remis = { ...(cfg[section] || {}) };
    for (const champNom of Object.keys(patch[section] || {})) {
      if (Object.prototype.hasOwnProperty.call(ancien, champNom)) remis[champNom] = ancien[champNom];
      else delete remis[champNom];
    }
    n[section] = remis;
  }
  return n;
}

/* La rangée qu'un patch touche : `section.champ` (« planning.jours »). C'est
 * là, sous elle, que se dit un refus — en bas de la page, il se lisait hors de
 * vue, puis s'effaçait au relevé suivant (5 s). */
export const rangeeDe = (patch) => {
  const section = Object.keys(patch || {})[0] || '';
  const champNom = Object.keys((patch && patch[section]) || {})[0];
  return champNom ? section + '.' + champNom : section;
};

/* Ce qu'un compte ordinaire lit quand il touche un réglage : le refus, qui nomme
 * la clé (V10) — le même que dans la popup d'un volet (fichevolet.jsx). */
const refusLecture = () => raisonEchec(Object.assign(new Error('Unauthorized'), { code: 'unauthorized' }), 'loggia_volets');

export function VoletsReglages({ hass, cardSt }) {
  const h = hass && typeof hass.callWS === 'function' ? hass : null;
  const { etat, setEtat, err, vivant } =
    useEtatServeur(hass, 'loggia/volets/etat', 5000, tr('Réglages indisponibles.'));
  const [picker, setPicker] = useState(null);   // { section, champ, domaines }
  /* Un pli par regle — avec les autres etats : un hook ne peut pas vivre
   * apres un retour conditionnel. */
  const [pliPlan, plierPlan] = usePli('volets:planning');
  const [pliSol, plierSol] = usePli('volets:soleil');
  const [pliVent, plierVent] = usePli('volets:vent');
  const [pliBaies, plierBaies] = usePli('volets:baies');
  const [pliVelux, plierVelux] = usePli('volets:velux');
  /* Un refus d'écriture : `{ ou, texte }`, dit SOUS la rangée touchée (`ou`,
   * `rangeeDe`). À part de `err`, que le relevé suivant efface : un refus
   * reste jusqu'au geste suivant. */
  const [refus, setRefus] = useState(null);
  /* Un compte ordinaire lit tout et n'écrit rien (V10, comme la popup d'un
   * volet) : les réglages sont inertes, et un appui dit pourquoi sans rien
   * envoyer — le serveur refuserait (`require_admin`). */
  const ordinaire = compteOrdinaire(hass);


  const cfg = (etat && etat.config) || null;

  const enregistrer = async (patch) => {
    const ou = rangeeDe(patch);
    if (ordinaire) { setRefus({ ou, texte: refusLecture() }); return; }
    if (!h || !cfg) return;
    setRefus(null);
    const avant = cfg;
    // On rend la main tout de suite : le sondage remettrait la vieille valeur
    // le temps de l'aller-retour, et la bascule reviendrait en arrière sous
    // le doigt.
    setEtat(e => (e ? { ...e, config: fusion(e.config, patch) } : e));
    try {
      const r = await h.callWS({ type: 'loggia/volets/config', patch });
      if (vivant.current && r && r.config) setEtat(e => (e ? { ...e, config: r.config } : e));
      // Les cartes ont leur cache (voletsetat.js, 60 s) : sans relecture, elles
      // disaient encore « Ouvre à 07:47 » une minute après « Manuel » (audit du 19/10).
      rafraichirVolets();
    } catch (e) {
      if (!vivant.current) return;
      // L'avance s'annule : la valeur d'avant revient tout de suite.
      setEtat(x => (x ? { ...x, config: defaire(x.config, avant, patch) } : x));
      // Un refus se dit comme tel et nomme sa clé ; une panne reste une panne
      // (audit du 03/10, refus.js). Il s'affichait en « Unauthorized ».
      setRefus({ ou, texte: raisonEchec(e, 'loggia_volets') });
    }
  };
  /* Le refus de cette rangée, sous elle. */
  const alerte = (ou) => (refus && refus.ou === ou
    ? <div role="alert" style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--o-bad)' }}>{refus.texte}</div>
    : null);
  // Une puce inerte (compte ordinaire) : elle se lit, la choisie reste pleine.
  const puceInerte = (on) => (ordinaire ? { cursor: 'default', opacity: on ? 1 : 0.4 } : null);
  // Un capteur par son nom (friendly_name), comme partout ailleurs ; l'identifiant s'il n'existe plus.
  const nomEntite = (id) => (hass && hass.states && hass.states[id] ? cvName(hass.states[id], id) : id);

  /* Les ouvrants, par leur CLASSE (ouvrants.py, audit du 03/10) : un garage, un
   * portail, une porte ne sont pas des volets — une classe absente non plus.
   * Chaque volet se règle dans sa fiche (V2) : ici ne restent que deux comptes,
   * les ouvrants sans classe (laissés de côté) et les fenêtres de toit. */
  const velux = !!(cfg && cfg.velux && cfg.velux.actif);
  const { sansClasse, fenetres } = useMemo(() => {
    if (!hass || !hass.states) return { sansClasse: 0, fenetres: 0 };
    const ids = Object.keys(hass.states).filter(id => id.indexOf('cover.') === 0);
    const classe = (id) => (hass.states[id].attributes || {}).device_class;
    return {
      sansClasse: ids.filter(id => !classe(id)).length,
      fenetres: ids.filter(id => classe(id) === 'window').length,
    };
  }, [hass]);

  if (!cfg) {
    return (
      <div style={cardSt}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{tr('Volets')}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: err ? 'var(--o-bad)' : 'var(--o-text3)' }}>
          {err || tr('Chargement…')}
        </div>
      </div>
    );
  }

  const plan = cfg.planning || {};
  const sol = cfg.soleil || {};
  // Comparee a une lecture reelle cote serveur (volets.py), jamais une conversion
  // interne : le bon label et les bonnes bornes suffisent, suivant le capteur choisi.
  const uTSol = uniteTemp(sol.temp_entite && hass && hass.states && hass.states[sol.temp_entite] ? hass.states[sol.temp_entite].attributes : null, hass);
  const bMinSol = Math.round(deCelsius(0, uTSol)), bMaxSol = Math.round(deCelsius(45, uTSol));
  const vent = cfg.vent || {};
  const baies = cfg.baies || {};
  // Ordre non abouti (ADR 0007) : le seul réglage est le nombre de reprises.
  const verification = cfg.verification || {};
  const tentatives = [1, 2, 3].indexOf(verification.tentatives) >= 0 ? verification.tentatives : 2;
  const simu = cfg.simulation || {};
  const label = { fontSize: 12, fontWeight: 700, marginBottom: 6 };
  const ligne = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 };



  const choisirEntite = (section, champNom, domaines) => {
    if (ordinaire) { setRefus({ ou: section + '.' + champNom, texte: refusLecture() }); return; }
    setPicker({ section, champ: champNom, domaines });
  };
  /* La protection solaire ne baisse que les volets dont la façade est connue
   * (volets.py) : allumée sans aucune, elle ne fait rien — le dire. Une façade
   * se choisit dans la popup d'un volet (V2). */
  const S = (hass && hass.states) || {};
  const facades = sol.volets || {};
  const sansFacade = !!sol.actif && !Object.keys(facades).some(id => S[id] && facades[id]
    && facades[id].orientation != null && Number.isFinite(Number(facades[id].orientation)));
  // Tous les jours décochés : le planning ne bouge plus aucun jour (le moteur suit l'écran).
  const joursActifs = Array.isArray(plan.jours) ? plan.jours : [0, 1, 2, 3, 4, 5, 6];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* La simulation se dit EN HAUT, pas seulement dans son réglage : sinon
        * on cherche pourquoi les volets ne bougent plus. */}
      {simu.actif && (
        <div role="status" style={{ ...cardSt, border: 'var(--o-bw,1px) solid var(--o-warn2)', fontSize: 12.5, fontWeight: 700, color: 'var(--o-warn2)' }}>
          {tr('Simulation : les volets ne bougent pas, les manœuvres sont notées.')}
        </div>
      )}
      {/* ── Le planning ── */}
      <div style={cardSt}>
        <RegleEntete nom={tr('Lever et coucher du soleil')}
          desc={tr('Ouvrir le matin, fermer le soir, aux heures réelles du soleil chez vous.')}
          on={plan.actif} cb={() => enregistrer({ planning: { actif: !plan.actif } })} plie={pliPlan} onPlier={plierPlan} zone="volets-plan" />
        {alerte('planning.actif')}
        {plan.actif && !pliPlan && (
          <div id="volets-plan" style={ZONE_REGLAGES}>
            {/* Ce que la règle fait AUJOURD'HUI. Il se choisit au quotidien dans
              * la popup d'un volet et dans la vue « modes et planning » : ici il
              * se DIT, sans troisième commande (sa règle « rien en double dans
              * Paramètres », décision du 19/10). */}
            <div style={{ marginTop: 14 }}>
              <div style={label}>{tr('En ce moment')}</div>
              <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600 }}>
                {tr('Mode : {mode}. Il se choisit dans la popup d’un volet, ou dans Volets › modes et planning.',
                  { mode: (plan.mode || 'auto') === 'nuit' ? tr('Fermeture nuit') : (plan.mode || 'auto') === 'manuel' ? tr('Manuel') : tr('Auto lever/coucher') })}
              </div>
            </div>
            <div style={ligne}>
              <span style={{ ...label, marginBottom: 0, minWidth: 92 }}>{tr('Ouverture')}</span>
              {/* Les bornes de la popup d'un volet : −120 à +240 min. */}
              <Nombre v={(plan.ouverture || {}).decalage || 0} nom={tr('Ouverture, décalage par rapport au lever du soleil')} min={-120} max={240} unite={tr('min après le lever')}
                inerte={ordinaire} cb={n => enregistrer({ planning: { ouverture: { decalage: n } } })} />
            </div>
            {alerte('planning.ouverture')}
            <div style={ligne}>
              <span style={{ ...label, marginBottom: 0, minWidth: 92 }}>{tr('Fermeture')}</span>
              <Nombre v={(plan.fermeture || {}).decalage || 0} nom={tr('Fermeture, décalage par rapport au coucher du soleil')} min={-120} max={240} unite={tr('min après le coucher')}
                inerte={ordinaire} cb={n => enregistrer({ planning: { fermeture: { decalage: n } } })} />
            </div>
            {alerte('planning.fermeture')}
            <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginTop: 7 }}>
              {tr('Un nombre négatif avance l’heure : −30 ferme une demi-heure avant le coucher.')}
            </div>
            <div style={{ marginTop: 13 }}>
              <div style={label}>{tr('Les jours')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {JOURS_COURTS().map((j, i) => {
                  const actifs = joursActifs;
                  const on = actifs.indexOf(i) >= 0;
                  return (
                    <button key={j} type="button" aria-pressed={on} aria-disabled={ordinaire || undefined}
                      onClick={() => enregistrer({ planning: { jours: on ? actifs.filter(x => x !== i) : [...actifs, i].sort() } })}
                      style={{ ...puce(on), minWidth: 46, textAlign: 'center', ...puceInerte(on) }}>{j}</button>
                  );
                })}
              </div>
              {joursActifs.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--o-warn2)', fontWeight: 700, marginTop: 8 }}>
                  {tr('Aucun jour choisi : le planning ne bouge les volets aucun jour.')}
                </div>
              )}
              {alerte('planning.jours')}
            </div>
          </div>
        )}
        {/* Chaque volet se règle dans sa fiche (chantier Volets, V2) : ses heures,
          * ses jours, sa façade, la porte devant lui. Une ligne le dit, ici, à la
          * place de la liste — la même phrase trois fois serait du bruit. Hors du
          * pli et même planning coupé (audit du 19/10) : la façade et la porte se
          * règlent aussi sans lui, et c'est là qu'on cherche pourquoi un ouvrant
          * sans classe ne bouge pas. */}
        <div style={{ marginTop: 16, borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', paddingTop: 13 }}>
          <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600 }}>
            {tr('Chaque volet se règle dans sa popup : ses heures, sa façade, la porte devant lui.')}
          </div>
          {/* Un vrai volet sans classe n'est plus piloté (03/10) : le
            * dire, sinon on cherche pourquoi il ne bouge plus. */}
          {sansClasse > 0 && (
            <div style={{ fontSize: 12, color: 'var(--o-warn2)', fontWeight: 700, marginTop: 10 }}>
              {tr('Ouvrants sans classe dans Home Assistant, laissés de côté : {n}. Donnez-leur une classe (volet, store…) pour que Loggia les pilote.', { n: sansClasse })}
            </div>
          )}
        </div>
      </div>

      {/* ── La protection solaire ── */}
      <div style={cardSt}>
        <RegleEntete nom={tr('Protection solaire')}
          desc={tr('Quand le soleil frappe une façade et qu’il fait chaud, baisser ses volets — puis les rouvrir quand il est passé.')}
          on={sol.actif} cb={() => enregistrer({ soleil: { actif: !sol.actif } })} plie={pliSol} onPlier={plierSol} zone="volets-sol" />
        {alerte('soleil.actif')}
        {sansFacade && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--o-warn2)', fontWeight: 700 }}>
            {tr('Aucun volet n’a de façade : la protection solaire ne baissera rien. La façade se choisit dans la popup d’un volet.')}
          </div>
        )}
        {etat.soleil && etat.soleil.azimut != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, margin: '14px -22px 0', padding: '12px 22px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: 'var(--o-lampe)' }} />
            <span>
              {tr('En ce moment : soleil à {a}°, hauteur {e}°', { a: Math.round(etat.soleil.azimut), e: Math.round(etat.soleil.elevation) })}
              {' — '}{etat.abaisses && etat.abaisses.length ? trN(etat.abaisses.length, '{n} volet abaissé', '{n} volets abaissés') : tr('aucun volet abaissé')}
            </span>
          </div>
        )}
        {sol.actif && !pliSol && (
          <div id="volets-sol" style={ZONE_REGLAGES}>
            <div style={ligne}>
              <span style={{ ...label, marginBottom: 0, minWidth: 92 }}>{tr('Descendre à')}</span>
              <Nombre v={sol.position != null ? sol.position : 30} nom={tr('Position des volets sous le soleil, en pourcentage')} min={0} max={100} pas={5} unite="%"
                inerte={ordinaire} cb={n => enregistrer({ soleil: { position: n } })} />
            </div>
            {alerte('soleil.position')}
            {/* Un store banne, lui, se déploie en entier au soleil, et se replie quand il part (25/10). */}
            <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginTop: 7 }}>{tr('Un store banne, lui, se déploie en entier, puis se replie quand le soleil quitte sa façade.')}</div>
            <div style={ligne}>
              <span style={{ ...label, marginBottom: 0, minWidth: 92 }}>{tr('Au-dessus de')}</span>
              <Nombre v={sol.elevation_min != null ? sol.elevation_min : 15} nom={tr('Hauteur minimale du soleil, en degrés')} min={0} max={60} pas={5} unite={tr('° de hauteur')}
                inerte={ordinaire} cb={n => enregistrer({ soleil: { elevation_min: n } })} />
            </div>
            {alerte('soleil.elevation_min')}
            <div style={ligne}>
              <span style={{ ...label, marginBottom: 0, minWidth: 92 }}>{tr('Et au-delà de')}</span>
              <Nombre v={sol.temp_min != null && sol.temp_min !== '' ? sol.temp_min : 25} nom={tr('Température extérieure minimale, en °{u}', { u: uTSol })} min={bMinSol} max={bMaxSol} unite={tr('°{u} dehors', { u: uTSol })}
                inerte={ordinaire} cb={n => enregistrer({ soleil: { temp_min: n } })} />
            </div>
            {alerte('soleil.temp_min')}
            <div style={{ ...ligne, marginTop: 8 }}>
              <span style={{ ...label, marginBottom: 0, minWidth: 92 }}>{tr('Thermomètre')}</span>
              <button type="button" aria-disabled={ordinaire || undefined} onClick={() => choisirEntite('soleil', 'temp_entite', ['sensor'])}
                style={{ ...champ, cursor: ordinaire ? 'default' : 'pointer', color: sol.temp_entite ? 'var(--o-text1)' : 'var(--o-text3)' }}>
                {sol.temp_entite ? nomEntite(sol.temp_entite) : tr('Choisir un capteur…')}
              </button>
            </div>
            {alerte('soleil.temp_entite')}
          </div>
        )}
      </div>

      {/* ── La mise à l'abri ── */}
      <div style={cardSt}>
        <RegleEntete nom={tr('Vent fort')}
          desc={tr('Au-delà d’un seuil, remonter les volets et replier les stores bannes — un volet baissé dans une rafale est un volet plié.')}
          note={tr('Passe avant les deux règles ci-dessus')}
          on={vent.actif} cb={() => enregistrer({ vent: { actif: !vent.actif } })} plie={pliVent} onPlier={plierVent} zone="volets-vent" />
        {alerte('vent.actif')}
        {etat.a_l_abri && (
          <div style={{ marginTop: 9, fontSize: 12, fontWeight: 800, color: 'var(--o-warn2)' }}>{tr('Volets à l’abri en ce moment.')}</div>
        )}
        {vent.actif && !pliVent && (
          <div id="volets-vent" style={ZONE_REGLAGES}>
            <div style={ligne}>
              <span style={{ ...label, marginBottom: 0, minWidth: 92 }}>{tr('Anémomètre')}</span>
              <button type="button" aria-disabled={ordinaire || undefined} onClick={() => choisirEntite('vent', 'entite', ['sensor'])}
                style={{ ...champ, cursor: ordinaire ? 'default' : 'pointer', color: vent.entite ? 'var(--o-text1)' : 'var(--o-text3)' }}>
                {vent.entite ? nomEntite(vent.entite) : tr('Choisir un capteur…')}
              </button>
            </div>
            {alerte('vent.entite')}
            <div style={ligne}>
              <span style={{ ...label, marginBottom: 0, minWidth: 92 }}>{tr('À partir de')}</span>
              <Nombre v={vent.seuil != null ? vent.seuil : 50} nom={tr('Seuil de vent, dans l’unité du capteur')} min={5} max={150} pas={5} unite={tr('dans l’unité du capteur')}
                inerte={ordinaire} cb={n => enregistrer({ vent: { seuil: n } })} />
            </div>
            {alerte('vent.seuil')}
          </div>
        )}
      </div>

      {/* ── Les fenêtres de toit ── */}
      {/* Une option, pas une règle de plus : une fenêtre n'est pas un volet.
        * « Tout remonter » au vent, c'est l'OUVRIR dans la tempête — Loggia ne
        * fait donc que les fermer, et chacun choisit (03/10, ouvrants.py). */}
      <div style={cardSt}>
        <RegleEntete nom={tr('Fenêtres de toit (velux)')}
          desc={tr('Les fermer avec les volets : au coucher du soleil, par vent fort et dans les scénarios qui ferment. Loggia ne les ouvre jamais.')}
          on={velux} cb={() => enregistrer({ velux: { actif: !velux } })} plie={pliVelux} onPlier={plierVelux} zone="volets-velux" />
        {alerte('velux.actif')}
        {velux && !pliVelux && (
          <div id="volets-velux" style={ZONE_REGLAGES}>
            <div style={{ marginTop: 9, fontSize: 12, fontWeight: 700, color: fenetres ? 'var(--o-text3)' : 'var(--o-warn2)' }}>
              {fenetres
                ? tr('Fenêtres de toit trouvées : {n}', { n: fenetres })
                : tr('Aucune fenêtre de toit trouvée : il faut qu’elle porte la classe « fenêtre » dans Home Assistant.')}
            </div>
          </div>
        )}
      </div>

      {/* ── Volet bloqué ── */}
      {/* On ne ferme pas sur une porte ouverte : quelqu'un est peut-être
        * dehors. La fermeture attend que la baie se referme, jamais au-delà
        * du matin. Un capteur muet ne retient rien (ADR 0010). */}
      <div style={cardSt}>
        <RegleEntete nom={tr('Volet bloqué')}
          desc={tr('Ne pas fermer un volet tant que la porte ou la fenêtre devant lui est ouverte : la fermeture attend qu’elle se referme.')}
          on={baies.actif} cb={() => enregistrer({ baies: { actif: !baies.actif } })} plie={pliBaies} onPlier={plierBaies} zone="volets-baies" />
        {alerte('baies.actif')}
        {baies.actif && !pliBaies && (
          <div id="volets-baies" style={ZONE_REGLAGES}>
            <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginTop: 8, marginBottom: 4 }}>
              {tr('Un volet sans porte ni fenêtre désignée ferme comme avant. Un capteur muet ne retient rien : le volet ferme, et le journal le dit.')}
            </div>
          </div>
        )}
      </div>

      {/* ── Ordre non abouti (ADR 0007) ── */}
      {/* Un volet injoignable attend son retour ; un volet qui n'a pas répondu
        * deux minutes après l'ordre se voit redemander ; un volet qui a répondu
        * (il bouge, son état a basculé) est attendu jusqu'à six minutes
        * (ADR 0192). Après la dernière tentative, le journal le dit en rouge.
        * Un seul réglage : combien de fois. */}
      <div style={cardSt}>
        <div style={CAPITALES}>{tr('Manœuvre non confirmée')}</div>
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--o-text3)', fontWeight: 600 }}>
          {tr('Deux minutes après un ordre, un volet qui n’a pas répondu se voit redemander ; un volet qui a répondu (il bouge, son état a changé) est attendu jusqu’à six minutes. Après la dernière tentative, la manœuvre est notée en rouge ci-dessous.')}
        </div>
        <div style={{ ...ligne, marginTop: 10 }}>
          <span style={{ ...label, marginBottom: 0, minWidth: 92 }}>{tr('Tentatives')}</span>
          {[1, 2, 3].map(n => (
            <button key={n} type="button" aria-pressed={tentatives === n} aria-disabled={ordinaire || undefined}
              onClick={() => enregistrer({ verification: { tentatives: n } })} style={{ ...puce(tentatives === n), ...puceInerte(tentatives === n) }}>{n}</button>
          ))}
        </div>
        {alerte('verification.tentatives')}
      </div>

      {/* ── Ce qui s'est passé ── */}
      {etat.journal && etat.journal.length > 0 && (
        <div style={cardSt}>
          <div style={CAPITALES}>{tr('Dernières manœuvres')}</div>
          {/* Qui l'emporte quand deux règles visent le même volet : le dire,
            * plutôt que laisser deviner pourquoi l'une a cédé. */}
          {Array.isArray(etat.priorites) && etat.priorites.length > 1 && (
            <div style={{ marginTop: 4, fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)' }}>
              {/* Libellé et valeur par un gabarit (audit du 03/10) : l'espace
                * avant les deux-points est française, « {a}: {b} » ailleurs. */}
              {tr('{a} : {b}', { a: tr('Qui l’emporte'), b: etat.priorites.map(nomPriorite).join(' › ') })}
            </div>
          )}
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
            {etat.journal.slice(0, 8).map((j, i) => (
              <div key={j.ts + '' + i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: i ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none', fontSize: 12, fontWeight: 600 }}>
                {/* La ligne rouge : un ordre qui n'a pas abouti (ADR 0007). */}
                <span style={j.echec ? { color: 'var(--o-bad)' } : undefined}>
                  {j.simule && <span style={{ marginRight: 6, padding: '1px 6px', borderRadius: 6, fontSize: 10.5, fontWeight: 800, background: 'var(--o-s2)', color: 'var(--o-warn2)' }}>{tr('simulé')}</span>}
                  {majuscule(mot(j, 'quoi'))} · <span style={{ color: j.echec ? 'var(--o-bad)' : 'var(--o-text2)' }}>{pourquoi(j)}</span>
                </span>
                <span style={{ ...MONO, fontSize: 11.5, color: 'var(--o-text3)', flexShrink: 0 }}>{quandCourt(j.ts)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-bad)' }}>{err}</div>}

      {picker && (
        <BottomSheet onClose={() => setPicker(null)} title={tr('Choisir un capteur')}>
          {/* `autoFocus` est ici delibere : ce selecteur s'ouvre en reponse a un
            * clic, pour saisir tout de suite. Le retirer obligerait a un second
            * clic — la regle vise les champs focalises au CHARGEMENT d'une page,
            * ce qui n'est pas le cas. */}
            <EntPicker hass={hass} autoFocus domaines={picker.domaines}
            onPick={(id) => { enregistrer({ [picker.section]: { [picker.champ]: id } }); setPicker(null); }} />
        </BottomSheet>
      )}
    </div>
  );
}

