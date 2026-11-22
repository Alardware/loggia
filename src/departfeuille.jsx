/* La feuille « Avant de partir » (04/11, étape 2 du rapport sur l'usage),
 * et « Avant de dormir » pour « Bonne nuit », sur le même modèle (05/11,
 * étape 4) : ce qui restera ouvert, puis ce que le scénario fera — l'alarme
 * de nuit, les lampes éteintes, les volets fermés, dits en clair.
 * La règle vit dans `depart.js` ; ici, l'affichage et les gestes. La feuille
 * relit la maison à chaque rendu : un portail qu'on ferme d'ici quitte la
 * liste dès que Home Assistant le dit en train de se fermer, et le bouton
 * perd son « quand même » quand plus rien ne reste ouvert.
 *
 * Chargée à la demande depuis le chantier du 20/11 (lot 6, ADR 0386) :
 * elle ne s'ouvre que sur un geste, et ses lignes de serrures (A4) ne pèsent
 * rien au démarrage. La coquille et la règle partagée restent dans
 * `app/depart.jsx`. */
import { useState } from 'react';
import { BottomSheet, TitreFeuille } from './ui.jsx';
import { Ico } from './icones.jsx';
import { tr } from './i18n.js';
import { commanderService } from './actions.js';
import { nomScenario, resumeScenario } from './scenarios.js';
import { resteQuelqueChose } from './depart.js';
import { SaisieCodeAlarme } from './cartescustom/cartes.jsx';
import { restesMaintenant } from './app/depart.jsx';

const LIGNE = { display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '4px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd1)' };
const NOM = { flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const BOUTON = { flex: 'none', minHeight: 36, padding: '0 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)' };
const PRIMAIRE = { width: '100%', minHeight: 46, borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, background: 'var(--o-accent-fond)', color: '#fff' };

export default function FeuilleDepartContenu({ hass, sc }) {
  // La serrure à code dont on tape le code, à la place de sa ligne (A4) — le pavé de l'alarme.
  const [codePour, setCodePour] = useState(null);
  const [code, setCode] = useState('');
  if (!sc || !sc.avant) return null;
  const s = (sc.tous || []).find(x => x && x.id === sc.avant) || { id: sc.avant };
  const r = restesMaintenant(hass, s);
  const reste = resteQuelqueChose(r);
  const fermer = (id) => commanderService(hass, id, 'cover', 'close_cover', { entity_id: id });
  // Verrouiller d'ici : la serrure part en `locking` et quitte la liste, comme un portail qui se ferme.
  const verrouiller = (id, c = null) => commanderService(hass, id, 'lock', 'lock', { entity_id: id, ...(c ? { code: c } : {}) });
  const valider = () => { if (!code) return; verrouiller(codePour, code); setCodePour(null); setCode(''); };
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
          {/* Une serrure que le scénario ne verrouillera pas (A4) : bloquée, elle le dit ; à code, le pavé de l'alarme prend la ligne. */}
          {r.serrures.map(x => (
            <div role="listitem" key={x.id} style={LIGNE}>
              <Ico name="unlock" size={18} color={x.bloquee ? 'var(--o-warn)' : 'var(--o-text2)'} />
              {codePour === x.id ? (
                <SaisieCodeAlarme code={code} setCode={setCode} onValider={valider} onAnnuler={() => setCodePour(null)} style={{ flex: 1, minWidth: 0 }} />
              ) : (<>
                <span style={NOM}>{x.nom}</span>
                {x.bloquee ? <span style={{ flex: 'none', fontSize: 13, fontWeight: 700, color: 'var(--o-warn)' }}>{tr('Bloquée')}</span>
                  : <button type="button" onClick={() => { if (x.code) { setCodePour(x.id); setCode(''); } else verrouiller(x.id); }} aria-label={tr('Verrouiller') + ' ' + x.nom} style={BOUTON}>{tr('Verrouiller')}</button>}
              </>)}
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
