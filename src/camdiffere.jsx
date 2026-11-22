/* Ce que la caméra charge à la demande : le son, la croix d'orientation et le cadre « Privé » (chantier du 20/11, A8 ; ADR 0385).
 *
 * Ils n'ont rien à faire au démarrage. Le son ne se monte qu'en direct vidéo ; la croix, que si la caméra a de quoi bouger (`ptzDe`,
 * pur et petit) ; le cadre, que pour une caméra privée — une caméra fixe et publique ne charge rien. Le MOT « Privé » d'une tuile
 * (tag et sous-ligne), lui, part avec la page : il est petit.
 *
 * À part de `camera.jsx` : ses tests le lisent avec une doublure de React qui ne donne que trois crochets, et `Suspense` n'en est pas. */
import { Suspense } from 'react';
import { LOGGIA_INDEX } from './state.js';
import { ptzDe } from './camcmd.js';
import { lazyRecharge } from './recharge.js';

const PanneauPriveDiffere = lazyRecharge(() => import('./camprive.jsx').then(m => ({ default: m.PanneauPrive })));
const BoutonSonDiffere = lazyRecharge(() => import('./camcommandes.jsx').then(m => ({ default: m.BoutonSon })));
const CamOrientationDiffere = lazyRecharge(() => import('./camcommandes.jsx').then(m => ({ default: m.CamOrientation })));

export const PanneauPrive = (props) => <Suspense fallback={null}><PanneauPriveDiffere {...props} /></Suspense>;
export const BoutonSon = (props) => <Suspense fallback={null}><BoutonSonDiffere {...props} /></Suspense>;
export const CamOrientation = (props) => (ptzDe(LOGGIA_INDEX, props.hass && props.hass.states, props.haid)
  ? <Suspense fallback={null}><CamOrientationDiffere {...props} /></Suspense> : null);
