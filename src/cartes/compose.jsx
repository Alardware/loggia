/* ── La voiture, la litière, la fontaine : leurs coquilles (chantier du 20/11, A11 et A12 ; ADR 0386) ──
 *
 * Chargées à la demande elles aussi (`CarteCompose`, `FicheCompose` ; appareils/fiches.jsx), comme pour la borne
 * (`eauborne.jsx`) : l'adresse des morceaux — la voiture (`voiture.jsx`), la litière et la fontaine (`animaux.jsx`), la carte
 * et la popup de chacun —, le `hass` vivant de leurs entités, et un repli de la même taille le temps qu'ils arrivent. Une
 * maison sans voiture ni animal n'en télécharge rien.
 *
 * Ce ne sont pas des entités : ce sont des APPAREILS que la découverte a reconnus (`composesDe`, composes.js). Leur carte se
 * pose sous la clé `obj:app:<appareil>`, dans Objets comme dans une pièce ou en favori.
 */
import { Suspense, useState } from 'react';
import { lazyRecharge } from '../recharge.js';
import { BottomSheet } from '../ui.jsx';
import { LOGGIA_INDEX, getHass } from '../state.js';
import { useHass } from '../app/noyau.jsx';
import { hassQuiConnait } from './mesure.jsx';
import { RM_CARD, GlypheCarte } from './briques.jsx';
import { FicheAppareil } from '../appareils/fiches.jsx';
import { composesDe, entitesCompose, nomGenre } from '../composes.js';
import { CLE_COMPOSE } from '../composesboot.js';

const morceau = (charger, nom) => lazyRecharge(() => charger().then(m => ({ default: m[nom] })));
const voiture = () => import('../voiture.jsx');
const animaux = () => import('../animaux.jsx');
const CarteAnimal = morceau(animaux, 'CarteAnimal');
const FicheAnimal = morceau(animaux, 'FicheAnimal');
const CARTES = { voiture: morceau(voiture, 'CarteVoiture'), litiere: CarteAnimal, fontaine: CarteAnimal };
const FICHES = { voiture: morceau(voiture, 'FicheVoiture'), litiere: FicheAnimal, fontaine: FicheAnimal };

/** L'appareil composé que désigne une clé `obj:app:<appareil>`, ou null. */
function composeDeCle(cle, S = null) {
  const appareil = String(cle || '').slice(CLE_COMPOSE.length);
  return composesDe(LOGGIA_INDEX, S || (getHass() || {}).states || {}).find(c => c.appareil === appareil) || null;
}
const repli = (chip) => <div className="o-rmcard" style={chip ? { height: '100%' } : RM_CARD} />;

/** La carte d'un appareil composé, large ou compacte (`chip`) — rien quand la découverte ne le connaît plus. */
export function CarteCompose({ cle, hass, label = null, onOpen = null, chip = false }) {
  const c = composeDeCle(cle, hass && hass.states);
  const cles = entitesCompose(c);
  const H = hassQuiConnait(useHass(cles), hass, cles[0]);
  if (!c) return null;
  const Carte = CARTES[c.genre];
  return <Suspense fallback={repli(chip)}><Carte c={c} hass={H} nom={label || c.nom || nomGenre(c.genre)} chip={chip} onOpen={onOpen} Glyphe={GlypheCarte} /></Suspense>;
}

/** La popup d'un appareil composé, et la fiche universelle de l'appareil par-dessus (« L'appareil »). */
export function FicheCompose({ cle, hass, onClose }) {
  const c = composeDeCle(cle, hass && hass.states);
  const cles = entitesCompose(c);
  const H = hassQuiConnait(useHass(cles), hass, cles[0]);
  const [fiche, setFiche] = useState(null);
  if (!c) return null;
  const FicheComposeContent = FICHES[c.genre];
  return (
    // La voiture a sa feuille À ONGLETS (ADR 0392) : hauteur fixe, comme le robot — elle ne saute pas d'un onglet à l'autre.
    <BottomSheet onClose={onClose} onglets={c.genre === 'voiture'}>
      {() => (<>
        <Suspense fallback={<div style={{ minHeight: 260 }} />}>
          <FicheComposeContent c={c} hass={H} nom={c.nom || nomGenre(c.genre)} onFiche={setFiche} Glyphe={GlypheCarte} />
        </Suspense>
        {fiche && <FicheAppareil id={fiche} hass={H} onClose={() => setFiche(null)} />}
      </>)}
    </BottomSheet>
  );
}
