/* ── L'eau chaude et la borne : leurs coquilles (chantier G3, E2 et E3 ; ADR 0302) ──
 *
 * Le démarrage ne porte que ceci : l'adresse des quatre morceaux chargés à la
 * demande (la carte et la popup de chacun), le `hass` vivant de leurs entités,
 * et un repli de la même taille le temps qu'elles arrivent. Une maison sans
 * chauffe-eau ni borne n'en télécharge rien de plus (`tests/lot14_chargement`).
 *
 * La borne n'est pas une entité : c'est un APPAREIL trouvé par la découverte
 * (`enBorne`, borne.js) — sa carte se pose sous la clé `obj:borne`.
 */
import { Suspense, useState } from 'react';
import { lazyRecharge } from '../recharge.js';
import { BottomSheet } from '../ui.jsx';
import { enBorne, LOGGIA_INDEX } from '../state.js';
import { useHass } from '../app/noyau.jsx';
import { hassQuiConnait } from './mesure.jsx';
import { RM_CARD, GlypheCarte } from './briques.jsx';
import { FicheAppareil, BoutonEpingle } from '../appareils/fiches.jsx';

const CarteEauContent = lazyRecharge(() => import('../carteeau.jsx'));
const FicheEauContent = lazyRecharge(() => import('../ficheeau.jsx'));
const CarteBorneContent = lazyRecharge(() => import('../carteborne.jsx'));
const FicheBorneContent = lazyRecharge(() => import('../ficheborne.jsx'));

/** Le nom de la borne : celui de son APPAREIL (« Wallbox »), pas celui de sa puissance. */
const nomBorne = (b) => { const d = b && LOGGIA_INDEX && LOGGIA_INDEX.deviceMeta ? LOGGIA_INDEX.deviceMeta.get(b.appareil) : null; return (d && d.name) || null; };
const repli = (chip) => <div className="o-rmcard" style={chip ? { height: '100%' } : RM_CARD} />;
/** Les entités de la borne que l'écran suit, et sa puissance — une clé BRUYANTE, arrondie à 10 W. */
const clesBorne = (b) => (b ? [b.puissance, b.courant, b.prise, b.statut, b.interrupteur, b.energie].filter(Boolean) : []);

/** La carte d'un chauffe-eau, large ou compacte (`chip`). */
export function CarteEauChaude({ id, hass, label = null, onOpen = null, chip = false }) {
  const H = hassQuiConnait(useHass([id]), hass, id);
  return <Suspense fallback={repli(chip)}><CarteEauContent id={id} hass={H} nom={label} chip={chip} onOpen={onOpen} Glyphe={GlypheCarte} /></Suspense>;
}

/** La popup d'un chauffe-eau, et la fiche universelle par-dessus. */
export function FicheEauChaude({ id, hass, onClose }) {
  const H = hassQuiConnait(useHass([id]), hass, id);
  const [fiche, setFiche] = useState(null);
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <Suspense fallback={<div style={{ minHeight: 260 }} />}>
          <FicheEauContent id={id} hass={H} onFiche={setFiche} epingle={<BoutonEpingle id={id} />} Glyphe={GlypheCarte} />
        </Suspense>
        {fiche && <FicheAppareil id={fiche} hass={H} onClose={() => setFiche(null)} />}
      </>)}
    </BottomSheet>
  );
}

/** La carte de la borne trouvée — rien sans borne. */
export function CarteBorne({ hass, label = null, onOpen = null, chip = false }) {
  const b = enBorne();
  const cles = clesBorne(b);
  const H = hassQuiConnait(useHass(cles, b ? [b.puissance] : null), hass, cles[0]);
  if (!b) return null;
  return <Suspense fallback={repli(chip)}><CarteBorneContent borne={b} hass={H} nom={label || nomBorne(b)} chip={chip} onOpen={onOpen} Glyphe={GlypheCarte} /></Suspense>;
}

/** La popup de la borne, et la fiche universelle de son appareil par-dessus. */
export function FicheBorne({ hass, onClose }) {
  const b = enBorne();
  const cles = clesBorne(b);
  const H = hassQuiConnait(useHass(cles, b ? [b.puissance] : null), hass, cles[0]);
  const [fiche, setFiche] = useState(null);
  if (!b) return null;
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <Suspense fallback={<div style={{ minHeight: 260 }} />}>
          <FicheBorneContent borne={b} hass={H} nom={nomBorne(b)} onFiche={setFiche} epingle={<BoutonEpingle id={b.puissance} />} Glyphe={GlypheCarte} />
        </Suspense>
        {fiche && <FicheAppareil id={fiche} hass={H} onClose={() => setFiche(null)} />}
      </>)}
    </BottomSheet>
  );
}

/** Les clés que l'écran doit suivre pour la carte de la borne (App.jsx, `obj:borne`). */
export const clesDeLaBorne = () => clesBorne(enBorne());
