/* Le mot « Privé » d'une caméra dont l'objectif est occulté (chantier du 20/11, A8).
 *
 * À part des commandes (`camcommandes.jsx`) : le cadre (`PanneauPrive`) se charge à la demande avec la caméra privée (`camera.jsx`),
 * la sous-ligne (`SousPrive`) avec la vue Sécurité. Pas de React, rien que `tr`. */
import { tr } from './i18n.js';

const Cadenas = ({ size }) => <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;

/** Le cadre d'une caméra en mode privé : plus d'image (l'objectif est occulté), et le MOT, pas le silence d'un
 *  « hors ligne » qui ferait croire à une panne. */
export function PanneauPrive({ nom }) {
  return (
    <div role="img" aria-label={nom ? nom + ' · ' + tr('Privé') : tr('Privé')}
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(8,12,20,.78)', color: '#fff', pointerEvents: 'none' }}>
      <Cadenas size={24} />
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>{tr('Privé')}</span>
    </div>
  );
}

/** La sous-ligne d'une tuile en mode privé, à la place de « Hors ligne » : même forme que `sousCamera`. */
export function SousPrive() {
  return <><Cadenas size={11} />{tr('Privé')}</>;
}
