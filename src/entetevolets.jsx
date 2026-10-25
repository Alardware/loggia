/* ── L'en-tête d'Objets › Volets (chantier Volets, § 3.4 ; sa maquette, 1a) ──
 *
 * Le titre du filtre, le compte des VOLETS — pas des appareils : un garage ou
 * un portail n'y compte pas, et Tout ouvrir / Tout fermer ne le touchent
 * jamais (V3) —, puis à droite Tout arrêter (pendant une course), Tout ouvrir,
 * Tout fermer : chaque volet visible sous le filtre lance sa course. Le compte
 * suit les courses, il se redessine à chaque image (`useCoursesVolets`). Au
 * téléphone, le mot des puces s'efface, l'icône reste, et « · n en
 * mouvement » se tait (index.css) ; leur nom le dit toujours. Le lien « modes
 * et planning → » reste au-dessus (V4).
 *
 * Son propre module, chargé à la première ouverture du filtre (`lazyRecharge`,
 * App.jsx) : ni l'Accueil ni une carte ne l'affichent, et le démarrage n'a
 * pas de place à lui donner (tests/lot14_chargement.test.mjs).
 */
import { useCallback, useRef } from 'react';
import { tr, trN } from './i18n.js';
import { Fi } from './ui.jsx';
import { commander } from './actions.js';
import { estMuetVolet, vueVolet } from './voletecran.js';
import { useCoursesVolets, afficherCourse, lancerCourse, arreterCourse, oublierCourse, ordreSuivi } from './voletcourse.js';
import { gestesCover } from './outils.js';

// Une puce de sa maquette (`ChipButton`) : 40 px de haut, le gris doux, sans bordure.
const PUCE = { position: 'relative', height: 40, padding: '0 12px', borderRadius: 10, border: 'none', background: 'var(--o-s1)', color: 'var(--o-text1)',
  display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 };
// « Tout arrêter » ne paraît que pendant une course : allumé, comme le Stop d'une carte.
const ALLUMEE = { background: 'var(--o-accent-fond)', color: '#fff' };

/**
 * Tout ouvrir, Tout fermer (relecture des tâches 6 à 12, point 8) : un ordre à
 * chaque volet VIVANT de `vues` — jamais à un muet —, et sa course quand le
 * moteur d'actions l'accepte (`commanderUn` rend null s'il le refuse : rien ne
 * bougera). `vues` : `[{ id, st, c }]`, les volets visibles sous le filtre.
 * `commanderUn(id, capacite, surEchec)` : `surEchec` dit, plus tard, que Home
 * Assistant l'a refusé — la course de CE volet s'oublie (`oublier`, 19/10).
 * Rend les volets commandés. Pur : `commanderUn`, `lancer` et `oublier` se
 * doublent.
 */
export function commanderTous(vues, capacite, cible, { commanderUn, lancer, oublier = () => {} }) {
  const partis = [];
  for (const x of vues) {
    if (estMuetVolet(x.st)) continue;
    const ok = ordreSuivi((surEchec) => commanderUn(x.id, capacite, surEchec), () => lancer(x.id, cible, x.st), (c) => oublier(x.id, c));
    if (ok != null) partis.push(x.id);
  }
  return partis;
}

/** Tout arrêter : Stop aux seuls volets vivants qui BOUGENT ; leur course s'arrête là où elle est — et s'oublie sur un refus. */
export function arreterTous(vues, { commanderUn, arreter, oublier = () => {} }) {
  const partis = [];
  for (const x of vues) {
    if (estMuetVolet(x.st) || !(x.c && x.c.enCourse)) continue;
    const ok = ordreSuivi((surEchec) => commanderUn(x.id, 'stop', surEchec), () => arreter(x.id, x.st), (c) => oublier(x.id, c));
    if (ok != null) partis.push(x.id);
  }
  return partis;
}

/* Le geste qu'un volet accepte pour `open`, `close` ou `stop` (`gestesCover`, son `supported_features`, 19/10) : sans
 * OPEN / CLOSE, la position ; sans rien, aucun ordre — et aucun toast de refus. */
const GESTE = { open: 'monter', close: 'descendre', stop: 'stop' };
const commanderGeste = (hass, S) => (id, capacite, surEchec) => {
  const g = gestesCover(S[id])[GESTE[capacite]];
  return g ? commander(hass, id, g.capacite, g.valeur, null, null, surEchec) : null;
};

export default function EnteteVolets({ hass, titre, ids }) {
  useCoursesVolets();
  /* « Tout arrêter » disparaît à la fin de la course : s'il avait le focus, le
   * focus revient à « Tout ouvrir » au lieu de tomber sur la page (relecture des
   * tâches 6 à 12, point 5). React détache sa référence AVANT de le retirer :
   * le focus s'y lit encore. */
  const ouvrir = useRef(null);
  const arret = useRef(null);
  const refArret = useCallback((noeud) => {
    if (noeud) { arret.current = noeud; return; }
    const parti = arret.current;
    arret.current = null;
    if (!parti || typeof document === 'undefined' || document.activeElement !== parti) return;
    queueMicrotask(() => {
      const ici = document.activeElement;
      if (ouvrir.current && (!ici || ici === document.body || ici === parti)) ouvrir.current.focus();
    });
  }, []);
  const S = (hass && hass.states) || {};
  const vues = ids.map(id => ({ id, st: S[id] || null, c: afficherCourse(id, S[id]) }));
  const ouverts = vues.filter(x => vueVolet({ st: x.st, course: x.c }).allume).length;
  const bougent = vues.filter(x => x.c.enCourse).length;
  const vivants = vues.filter(x => !estMuetVolet(x.st));
  const muets = ids.length - vivants.length;
  /* « tous fermés » se SAIT (19/10) : jamais pour une liste vide — rien ne s'écrit —, ni quand un volet est muet ; les muets
   * se comptent. « 3 volets · 1 ouvert · 2 indisponibles ». */
  const compte = ids.length ? [trN(ids.length, '{n} volet', '{n} volets'),
    ouverts ? trN(ouverts, '{n} ouvert', '{n} ouverts') : muets ? null : tr('tous fermés'),
    muets ? trN(muets, '{n} indisponible', '{n} indisponibles') : null].filter(Boolean).join(' · ') : '';
  const commanderUn = commanderGeste(hass, S);
  const tous = (capacite, cible) => commanderTous(vues, capacite, cible, { commanderUn, lancer: lancerCourse, oublier: oublierCourse });
  const arreter = () => arreterTous(vues, { commanderUn, arreter: arreterCourse, oublier: oublierCourse });
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 12px', minHeight: 40 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' }}>{titre}</h2>
      <span className="o-volets-compte" style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{compte}{bougent > 0 && <span className="o-volets-mouvement">{' · ' + trN(bougent, '{n} en mouvement', '{n} en mouvement')}</span>}</span>
      {vivants.length > 0 && (
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {bougent > 0 && <button type="button" ref={refArret} onClick={arreter} aria-label={tr('Tout arrêter')} title={tr('Tout arrêter')} style={{ ...PUCE, ...ALLUMEE }}><Fi i="square" size={11} /><span className="o-volets-tout-mot">{tr('Tout arrêter')}</span></button>}
          <button type="button" ref={ouvrir} onClick={() => tous('open', 100)} aria-label={tr('Tout ouvrir')} title={tr('Tout ouvrir')} style={PUCE}><Fi i="angle-small-up" size={15} /><span className="o-volets-tout-mot">{tr('Tout ouvrir')}</span></button>
          <button type="button" onClick={() => tous('close', 0)} aria-label={tr('Tout fermer')} title={tr('Tout fermer')} style={PUCE}><Fi i="angle-small-down" size={15} /><span className="o-volets-tout-mot">{tr('Tout fermer')}</span></button>
        </span>
      )}
    </div>
  );
}
