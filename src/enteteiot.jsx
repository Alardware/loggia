/* ── L'en-tête d'Objets › IoT (chantier IoT, I14 ; § 7.4) ──────────────────────
 *
 * Le titre du filtre reste « IoT » ; à côté, le compte de sa maquette —
 * « 3 appareils · 1 en marche » —, au pluriel de chaque langue ; rien à droite.
 * « En marche » est une liste FERMÉE (`enMarcheIot`, objets.js ; passe bis du
 * 18/10, point 9) : un robot au travail, un ventilateur ou un humidificateur
 * allumé — jamais une vanne ouverte, ni un interrupteur ou une aide allumés,
 * que le filtre range aussi. Le distributeur compte dans le total seulement.
 * Rien ne travaille : le total seul, jamais « 0 en marche ».
 *
 * Son propre module, chargé à la première ouverture du filtre (`lazyRecharge`,
 * App.jsx), comme les en-têtes des volets, des prises, des lumières et des
 * médias : ni l'Accueil ni une carte ne l'affichent. Il reçoit un `hass`
 * VIVANT d'`EnteteIotVive` (App.jsx), abonné aux entités visibles — ce module
 * ne peut pas importer `useHass` d'App.jsx.
 *
 * La rangée a la hauteur des autres en-têtes (40 px) ; le compte tient sur UNE
 * ligne (index.css), « … » au besoin : rien ne saute quand il change.
 */
import { trN } from './i18n.js';
import { enMarcheIot } from './objets.js';

/** Le compte : `{ total, enMarche }` — `objets` : ceux que le filtre montre (`{ id, domaine }`). */
export function compteIot(objets, S) {
  const etats = S || {};
  let enMarche = 0;
  (objets || []).forEach(o => {
    const st = o && o.id ? etats[o.id] : null;
    if (st && enMarcheIot(o.domaine, st.state)) enMarche += 1;
  });
  return { total: (objets || []).length, enMarche };
}

export default function EnteteIot({ hass, titre, objets }) {
  const { total, enMarche } = compteIot(objets, (hass && hass.states) || {});
  const compte = trN(total, '{n} appareil', '{n} appareils') + (enMarche ? ' · ' + trN(enMarche, '{n} en marche', '{n} en marche') : '');
  return (
    <div className="o-iot-entete">
      <h2 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' }}>{titre}</h2>
      <span className="o-iot-compte" style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{compte}</span>
    </div>
  );
}
