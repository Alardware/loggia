/* La feuille « Avant de partir » (04/11, étape 2 du rapport sur l'usage),
 * et « Avant de dormir » pour « Bonne nuit », sur le même modèle (05/11,
 * étape 4) : ce qui restera ouvert, puis ce que le scénario fera — l'alarme
 * de nuit, les lampes éteintes, les volets fermés, dits en clair.
 * La règle vit dans `depart.js` ; ici, l'affichage et les gestes. La feuille
 * relit la maison à chaque rendu : un portail qu'on ferme d'ici quitte la
 * liste dès que Home Assistant le dit en train de se fermer, et le bouton
 * perd son « quand même » quand plus rien ne reste ouvert. */
import { BottomSheet, TitreFeuille } from '../ui.jsx';
import { Ico } from '../icones.jsx';
import { tr } from '../i18n.js';
import { commanderService } from '../actions.js';
import { plateformeDe, voisinsDe } from '../state.js';
import { nomScenario, resumeScenario } from '../scenarios.js';
import { restesAvantDepart, resteQuelqueChose } from '../depart.js';
import { masqueDe } from './noyau.jsx';

const CTX = { plateforme: plateformeDe, masque: masqueDe, voisins: voisinsDe };
/** Les scénarios qui regardent d'abord ce qui reste ouvert : « Je pars » (étape 2) et « Bonne nuit » (étape 4). */
export const AVANT_DE_LANCER = ['depart', 'nuit'];
/** Ce qui restera ouvert si l'on part maintenant, lu dans la maison telle qu'elle est. */
export const restesMaintenant = (hass) => restesAvantDepart(hass && hass.states, CTX);

const LIGNE = { display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '4px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd1)' };
const NOM = { flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const BOUTON = { flex: 'none', minHeight: 36, padding: '0 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)' };
const PRIMAIRE = { width: '100%', minHeight: 46, borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, background: 'var(--o-accent-fond)', color: '#fff' };

export function FeuilleDepart({ hass, sc }) {
  if (!sc || !sc.avant) return null;
  const r = restesMaintenant(hass);
  const reste = resteQuelqueChose(r);
  const s = (sc.tous || []).find(x => x && x.id === sc.avant) || { id: sc.avant };
  const fermer = (id) => commanderService(hass, id, 'cover', 'close_cover', { entity_id: id });
  const nuit = sc.avant === 'nuit';
  const nom = nomScenario(s);
  return (
    <BottomSheet onClose={sc.renoncer}>
      <TitreFeuille marge={4}><span style={{ fontSize: 17, fontWeight: 800 }}>{nuit ? tr('Avant de dormir') : tr('Avant de partir')}</span></TitreFeuille>
      <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, lineHeight: 1.45, marginBottom: 8 }}>
        {reste ? tr('Ceci restera ouvert :') : tr('Tout est fermé')}
      </div>
      {reste && (
        <div role="list" style={{ marginBottom: 14, borderBottom: 'var(--o-bw,1px) solid var(--o-bd1)' }}>
          {r.portails.map(p => (
            <div role="listitem" key={p.id} style={LIGNE}>
              <Ico name="garage" size={18} color="var(--o-text2)" />
              <span style={NOM}>{p.nom}</span>
              <button type="button" onClick={() => fermer(p.id)} aria-label={tr('Fermer') + ' ' + p.nom} style={BOUTON}>{tr('Fermer')}</button>
            </div>
          ))}
          {r.ouverts.map(o => (
            <div role="listitem" key={o.id} style={LIGNE}>
              <Ico name={o.famille === 'portes' ? 'door-open' : 'window-alt'} size={18} color="var(--o-text2)" />
              <span style={NOM}>{o.nom}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, lineHeight: 1.45, marginBottom: 14 }}>
        {tr('{nom} fera le reste : {quoi}', { nom, quoi: resumeScenario(s, sc.noms) })}
      </div>
      <button type="button" onClick={() => sc.partir(sc.avant)} style={PRIMAIRE}>{nuit ? (reste ? tr('{nom} quand même', { nom }) : nom) : (reste ? tr('Partir quand même') : tr('Partir'))}</button>
    </BottomSheet>
  );
}
