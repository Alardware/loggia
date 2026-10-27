/* ── L'en-tête d'Objets › IoT (chantier IoT, I14 ; § 7.4) ──────────────────────
 *
 * Le titre du filtre reste « IoT » ; à côté, le compte de sa maquette —
 * « 3 appareils · 1 en marche » —, au pluriel de chaque langue ; rien à droite.
 * « En marche » est une liste FERMÉE (`enMarcheIot`, objets.js ; passe bis du
 * 18/10, point 9) : un robot au travail, un ventilateur ou un humidificateur
 * allumé — jamais une vanne ouverte, ni un interrupteur ou une aide allumés,
 * que le filtre range aussi. Le distributeur compte dans le total seulement.
 * Rien ne travaille : le total seul, jamais « 0 en marche ». Une vanne d'eau fermée sur
 * fuite (étape 3 IoT) ajoute « · eau fermée sur fuite », d'après le carnet du serveur
 * (`loggia/eau/etat`, eauetat.js) — lu seulement quand le filtre montre une vanne.
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
import { tr, trN } from './i18n.js';
import { enMarcheIot } from './objets.js';
import { cfgVal } from './state.js';
import { sensVanne, vanneDesignee } from './eau.js';
import { useEtatEau } from './eauetat.js';

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

/** Une vanne de la liste est-elle fermée SUR FUITE, et l'est-elle encore ? `etat` : la réponse de `loggia/eau/etat`. */
export function fuiteIot(objets, S, etat) {
  const vannes = (etat && etat.vannes) || {};
  return (objets || []).some(o => o && o.id && vannes[o.id] && vannes[o.id].ferme && vannes[o.id].cause === 'fuite'
    && S && S[o.id] && sensVanne(o.id, S[o.id].state) === 'fermee');
}

export default function EnteteIot({ hass, titre, objets }) {
  const S = (hass && hass.states) || {};
  const designee = vanneDesignee(cfgVal('loggia_alertes', null));
  const { etat } = useEtatEau((objets || []).some(o => o && (o.domaine === 'valve' || (o.id && o.id === designee))));
  const { total, enMarche } = compteIot(objets, S);
  const compte = trN(total, '{n} appareil', '{n} appareils') + (enMarche ? ' · ' + trN(enMarche, '{n} en marche', '{n} en marche') : '')
    + (fuiteIot(objets, S, etat) ? ' · ' + tr('eau fermée sur fuite') : '');
  return (
    <div className="o-iot-entete">
      <h2 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' }}>{titre}</h2>
      <span className="o-iot-compte" style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{compte}</span>
    </div>
  );
}
