/* Les boutons des actions du moment, sous la phrase du bandeau (04/11, étape 1).
 * La règle vit dans `momentaccueil.js` ; ici, l'affichage et le geste. Une
 * action touchée disparaît aussitôt : la maison va changer, le bouton n'a plus
 * de raison d'être. « Bonne nuit » passe par la feuille des cartes quand
 * quelque chose reste ouvert (05/11, étape 4) : pas de raccourci qui
 * l'éviterait. */
import { useState } from 'react';
import { tr } from '../i18n.js';
import { Ico } from '../icones.jsx';
import { commanderService } from '../actions.js';
import { lancerScenario, scenarios, nomsLiens } from '../app/scenarios.jsx';
import { FeuilleDepart, restesMaintenant, AVANT_DE_LANCER } from '../app/depart.jsx';
import { resteQuelqueChose } from '../depart.js';
import { voletsCommandables } from '../vues/volets.jsx';
import { actionsDuMoment } from '../momentaccueil.js';
import { annulable } from '../annuler.js';

export function ActionsMoment({ hass, lumieres = 0 }) {
  const [faites, setFaites] = useState([]);
  const [avant, setAvant] = useState(null); // l'action qui attend, le temps de voir ce qui reste ouvert
  const S = hass && hass.states;
  if (!S) return null;
  const liste = actionsDuMoment({ heure: new Date().getHours(), S, volets: voletsCommandables(S), lumieres, scenarios: scenarios() })
    .filter(a => faites.indexOf(a.cle) < 0);
  if (!liste.length) return null;
  const executer = (a) => {
    setFaites(f => [...f, a.cle]);
    // Rattrapable cinq secondes (06/11, étape 7).
    if (a.volets) annulable(a.service === 'open_cover' ? tr('Volets ouverts') : tr('Volets fermés'), () => a.volets.forEach(id => commanderService(hass, id, 'cover', a.service, { entity_id: id })));
    else if (a.scenario) lancerScenario(hass, a.scenario);
  };
  const faire = (a) => {
    if (a.scenario && AVANT_DE_LANCER.includes(a.scenario) && resteQuelqueChose(restesMaintenant(hass))) { setAvant(a); return; }
    executer(a);
  };
  const feuille = avant ? { avant: avant.scenario, tous: scenarios(), noms: nomsLiens(), partir: () => { setAvant(null); executer(avant); }, renoncer: () => setAvant(null) } : null;
  return (
    <>
    <div role="group" aria-label={tr('Actions du moment')} className="o-actions-moment"
      style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none', marginTop: 10, maxWidth: '100%' }}>
      {liste.map(a => (
        <button key={a.cle} type="button" onClick={() => faire(a)}
          style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 999, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s1)', color: 'var(--o-text)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <Ico name={a.icone} size={14} />{a.libelle}
        </button>
      ))}
    </div>
    <FeuilleDepart hass={hass} sc={feuille} />
    </>
  );
}
