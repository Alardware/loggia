/* La vue Scénarios et la fiche d’un scénario.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, Suspense } from 'react';
import { lazyRecharge } from '../recharge.js';
import { Fi } from '../ui.jsx';
import { libelleDernier, nomScenario } from '../scenarios.js';
import { tr, locale } from '../i18n.js';
import { RmBascule } from '../cartes/briques.jsx';
import { FicheRangee } from '../appareils/fiches.jsx';
import { useScenarios, CarteScenario } from '../app/scenarios.jsx';
import { Header } from '../chrome/entete.jsx';
import { boutonEdition, BOUTON_PETIT, BandeauEdition, ChoixIcone } from '../edition/briques.jsx';

/* Les ambiances Hue (11/10, tâche 6 bis du chantier Chauffage) : la
 * bibliothèque et la section qui s'en sert, sous les scénarios. L'Accueil
 * n'en montre rien : elles se chargent à la première ouverture des
 * Scénarios — entières (règle « Garder la bibliothèque Hue »). */
const ScenesContent = lazyRecharge(() => import('../scenes.jsx'));

/* La vue Scénarios (ADR 0027) : les scénarios de Loggia et les siens en
 * cartes standard, « Ajouter un scénario » en édition, la fiche pour tout
 * régler — ordre compris, par les flèches de chaque carte ; puis, dessous,
 * les ambiances lumineuses de la bibliothèque Hue, l'ancienne vue Scènes. */
function ScenariosView({ hass, edit = false }) {
  const sc = useScenarios(hass);
  // En édition, les scénarios masqués se montrent, estompés : c'est là qu'on les remontre.
  const liste = edit ? sc.tous.filter(s => s && s.id) : sc.liste;
  const [fiche, setFiche] = useState(null); // un scénario, ou 'nouveau'
  const deplacer = (id, delta) => {
    const ids = liste.map(s => s.id); const i = ids.indexOf(id); const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    // Sur ce type d'écran seulement : l'ordinateur au composant, les autres chez eux.
    // Sans `catch` (audit du 03/10) : il avalait le refus d'un compte
    // ordinaire, et la carte revenait à sa place sans un mot. Le refus
    // remonte à l'écoute globale, comme celui d'un scénario lancé.
    sc.ordonner(ids);
  };
  const pieces = (sc.etat && sc.etat.pieces) || [];
  const liens = (sc.etat && sc.etat.liens) || [];
  const dernier = liste.reduce((m, s) => (s.dernier && (!m || s.dernier > m)) ? s.dernier : m, null);
  const outil = (actif) => ({ ...boutonEdition(false), ...BOUTON_PETIT, width: 28, height: 28, opacity: actif ? 1 : .35 });
  return (
    <main className="loggia-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {edit && <BandeauEdition onAjouter={() => setFiche('nouveau')} ajouterLabel={tr('Ajouter un scénario')}
          texte={tr('Mode édition : avancez, reculez ou modifiez un scénario, ou ajoutez-en un.')} />}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{tr('Scénarios')}</h1>
            <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>{sc.err && !liste.length ? sc.err : tr('{n} scénarios · dernier lancement {x}', { n: liste.length, x: libelleDernier(dernier, Date.now(), locale()).toLowerCase() })}</div>
          </div>
        </div>
        <div className="grid-scenarios" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(205px,1fr))', gap: 12 }}>
          {liste.map((s, i) => (
            <div key={s.id} style={{ position: 'relative', minWidth: 0 }}>
              {/* Le pointillé d'édition passe par la classe `o-pointille` : en
                * style en ligne, il cachait le focus du bouton au clavier
                * (audit du 03/10). */}
              <CarteScenario s={s} noms={sc.noms} enCours={sc.enCours === s.id} onLancer={sc.lancer} sansDernier={edit} className={edit ? 'o-pointille' : undefined} style={edit ? { '--o-pointille': '.45', opacity: s.masque ? .45 : 1 } : null} />
              {/* Les outils prennent la place du repere « dernier lancement » : en bas,
                * ils mordaient sur les puces des cartes etroites (vu en demo, 16/09). */}
              {edit && (
                <div style={{ position: 'absolute', right: 12, top: 12, display: 'flex', gap: 4 }}>
                  <button onClick={() => deplacer(s.id, -1)} disabled={i === 0} title={tr('Avancer')} aria-label={tr('Avancer') + ' ' + nomScenario(s)} style={outil(i > 0)}><Fi i="angle-small-left" size={12} /></button>
                  <button onClick={() => deplacer(s.id, 1)} disabled={i === liste.length - 1} title={tr('Reculer')} aria-label={tr('Reculer') + ' ' + nomScenario(s)} style={outil(i < liste.length - 1)}><Fi i="angle-small-right" size={12} /></button>
                  <button onClick={() => setFiche(s)} title={tr('Modifier')} aria-label={tr('Modifier') + ' ' + nomScenario(s)} style={outil(true)}><Fi i="pencil" size={12} /></button>
                </div>
              )}
            </div>
          ))}
          {edit && (
            <button onClick={() => setFiche('nouveau')} style={{ height: 184, borderRadius: 'var(--o-radius,18px)', border: '1px dashed var(--o-bd1)', background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--o-text3)', fontSize: 13, fontWeight: 700 }}>
              <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)' }}><Fi i="plus" size={18} /></span>
              {tr('Ajouter un scénario')}
            </button>
          )}
        </div>
        {/* La bibliothèque Hue arrive à la première ouverture (scenes.jsx,
          * 11/10) : le repli tient sa place, pour que rien ne saute — 534 px,
          * la section mesurée dans la démo à 1440 px de large, là où elle
          * s'affiche dès l'ouverture. Plus étroite, elle est plus haute (766 à
          * 768 px, 1 149 à 375) mais elle ferme la vue : rien au-dessus ne
          * bouge, seule la page s'allonge. */}
        <Suspense fallback={<div style={{ marginTop: 8, minHeight: 534 }} />}>
          <ScenesContent hass={hass} />
        </Suspense>
      </div>
      {fiche && <Suspense fallback={null}><FicheScenario key={fiche === 'nouveau' ? 'nouveau' : fiche.id} scenario={fiche === 'nouveau' ? null : fiche} pieces={pieces} liens={liens} lampes={(sc.etat && sc.etat.lampes) || null} onEnregistrer={sc.enregistrer} onClose={() => setFiche(null)} briques={BRIQUES_SCENARIO} /></Suspense>}
    </main>
  );
}

/* La fiche d'un scénario est chargée à la demande (`fichescenario.jsx`, contre-relecture du lot 3 des capteurs) : elle s'ouvre pour
 * composer un scénario, rien au démarrage. Elle n'importe jamais App.jsx : la vue lui passe les briques des fiches d'ici. */
const FicheScenario = lazyRecharge(() => import('../fichescenario.jsx'));
const BRIQUES_SCENARIO = { ChoixIcone, FicheRangee, RmBascule, boutonEdition, BOUTON_PETIT };

export { ScenariosView };
