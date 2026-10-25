/* ── La fiche d'un scénario, chargée à la demande (contre-relecture du lot 3 des capteurs, 19/10) ──────────────────────────
 *
 * Elle a quitté App.jsx, et le démarrage avec elle (le lot 3 y ajoutait ce que l'audit des capteurs demandait). Elle n'importe
 * jamais App.jsx : la vue Scénarios lui passe les briques des fiches de là-bas (`briques` : `ChoixIcone`, `FicheRangee`,
 * `RmBascule`, `boutonEdition`, `BOUTON_PETIT`).
 *
 * La fiche d'un scénario : nom, icône (quarante, par pages de dix), teinte,
 * nature — composé par Loggia, ou lié à une scène ou un script de Home
 * Assistant —, les actions (famille, geste, portée, pièce, valeur, moment),
 * sur l'Accueil ou non, masqué ou non ; « Remettre d'origine » pour un
 * scénario de Loggia qu'on a touché, « Supprimer » pour un des siens.
 */
import { useState } from 'react';
import { tr } from './i18n.js';
import { BottomSheet, TitreFeuille, ListeChoix, Fi } from './ui.jsx';
import { estRefus, raisonEchec } from './refus.js';
import { GESTES_SCENARIO as GESTES_SCN, FAMILLES as FAMILLES_SCN, PORTEES as PORTEES_SCN, NOMS_INTEGRES, NOMS_FAMILLES, NOMS_GESTES, NOMS_PORTEES, NOMS_CONDITIONS,
  ICONES_FAMILLES, TEINTES_SCENARIO, ICONES_SCENARIO, teinteScenario, actionVide, scenarioVide, versEnregistrement } from './scenarios.js';

export default function FicheScenario({ scenario = null, pieces = [], liens = [], onEnregistrer, onClose, briques }) {
  const { ChoixIcone, FicheRangee, RmBascule, boutonEdition, BOUTON_PETIT } = briques;
  const existant = !!scenario;
  const [s, setS] = useState(() => scenario ? { ...scenario, nom: scenario.nom || '', actions: (scenario.actions || []).map(a => ({ ...a })) } : scenarioVide());
  const maj = (patch) => setS(v => ({ ...v, ...patch }));
  const [nature, setNature] = useState(scenario && scenario.lien ? 'lie' : 'compose');
  const [err, setErr] = useState('');
  const [attente, setAttente] = useState(false);
  const t = teinteScenario(s);
  const nomIntegre = existant && scenario.integre ? NOMS_INTEGRES()[scenario.id] : '';
  const valide = existant ? true : !!(s.nom || '').trim();
  // Sans `outline: none` (23/09, plan M7) : posé en style en ligne, il battait
  // la règle `:focus-visible` de la feuille et le champ focalisé ne se voyait
  // plus au clavier. L'anneau d'accent revient, ici comme ailleurs.
  const champ = { width: '100%', boxSizing: 'border-box', padding: '10px 13px', borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 13, fontWeight: 600 };
  const etiquette = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', margin: '14px 2px 7px' };
  const note = { fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', margin: '6px 2px 0' };
  const puce = (on, x) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, border: 'var(--o-bw,1px) solid ' + (on ? 'rgba(' + x.rgb + ',.5)' : 'var(--o-bd2)'), background: on ? 'rgba(' + x.rgb + ',.14)' : 'var(--o-s1)', color: on ? x.col : 'var(--o-text1)' });
  const secondaire = { padding: '11px 14px', borderRadius: 14, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)' };
  const majAction = (i, patch) => setS(v => ({ ...v, actions: v.actions.map((a, k) => k === i ? { ...a, ...patch } : a) }));
  const retirerAction = (i) => setS(v => ({ ...v, actions: v.actions.filter((_, k) => k !== i) }));
  const ajouterAction = (famille) => setS(v => ({ ...v, actions: [...v.actions, actionVide(famille)] }));
  const envoyer = async (close, patch) => {
    setAttente(true); setErr('');
    try { await onEnregistrer(patch); close(); }
    /* Un refus du composant se dit par son code, dans la langue de l'écran :
     * « trop de scenarios (24 au plus) » s'affichait tel quel, en français
     * sans accents, dans les sept langues (audit du 03/10). Ce qui n'est pas
     * un refus garde son texte, déjà traduit — « Home Assistant n'est pas
     * joignable ». */
    catch (e) { setErr(estRefus(e) ? raisonEchec(e) : ((e && e.message) || tr('Enregistrement impossible.'))); setAttente(false); }
  };
  const valider = (close) => {
    if (!valide || attente) return;
    const doc = versEnregistrement({ ...s, lien: nature === 'lie' ? s.lien : null });
    if (nature === 'lie' && !doc.lien) { setErr(tr('Choisissez une scène ou un script.')); return; }
    envoyer(close, { enregistrer: doc });
  };
  const optionsLiens = [{ id: '', label: tr('— choisir —') }, ...liens.map(l => ({ id: l.haid, label: l.nom, sub: l.haid }))];
  const optionsPieces = [{ id: '', label: tr('Pièce de la TV ou de l’enceinte') }, ...pieces.map(p => ({ id: p, label: p }))];
  const famillesNoms = NOMS_FAMILLES(), gestesNoms = NOMS_GESTES(), porteesNoms = NOMS_PORTEES(), conditionsNoms = NOMS_CONDITIONS();
  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <div style={{ padding: '0 0 8px' }}>
          <TitreFeuille style={{ fontSize: 15, fontWeight: 800 }}>{existant ? tr('Modifier le scénario') : tr('Ajouter un scénario')}</TitreFeuille>
          <div style={{ ...note, marginTop: 4 }}>{existant && scenario.integre ? tr('Un scénario de Loggia : modifiez-le, ou remettez-le d’origine.') : tr('Composez-le à partir de ce que la maison possède, ou liez une scène ou un script.')}</div>

          <label htmlFor="o-scn-nom" style={etiquette}>{tr('NOM')}</label>
          {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
          <input id="o-scn-nom" value={s.nom} onChange={(e) => maj({ nom: e.target.value })} placeholder={nomIntegre || tr('Apéro, Sieste, Devoirs…')}
            onKeyDown={(e) => { if (e.key === 'Enter') valider(close); }} style={champ} autoFocus={!existant} />

          {/* Un scenario garde son icone cote serveur : pas de trait/plein ici,
            * mais la bibliotheque entiere au lieu des quarante d'avant. */}
          <ChoixIcone valeur={s.icone} onChoisir={(ic) => maj({ icone: ic })} suggerees={ICONES_SCENARIO} />

          <div style={etiquette}>{tr('TEINTE')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TEINTES_SCENARIO.map(x => { const on = x.id === s.teinte; return (
              <button key={x.id} aria-pressed={on} onClick={() => maj({ teinte: x.id })} style={puce(on, x)}>
                <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: x.col, display: 'inline-block' }} />{tr(x.label)}
              </button>
            ); })}
          </div>

          <div style={etiquette}>{tr('NATURE')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button aria-pressed={nature === 'compose'} onClick={() => setNature('compose')} style={puce(nature === 'compose', t)}>{tr('Composé par Loggia')}</button>
            <button aria-pressed={nature === 'lie'} onClick={() => setNature('lie')} style={puce(nature === 'lie', t)}>{tr('Lié à Home Assistant')}</button>
          </div>
          {nature === 'lie' ? (
            <div style={{ marginTop: 10 }}>
              <ListeChoix value={s.lien || ''} options={optionsLiens} onChange={(v) => maj({ lien: v || null })} label={tr('Scène ou script')} />
              {existant && scenario.suggestion && !s.lien && <div style={{ marginTop: 8 }}><button onClick={() => maj({ lien: scenario.suggestion })} style={puce(false, t)}><Fi i="sparkles" size={12} />{tr('Suggestion : {x}', { x: scenario.suggestion })}</button></div>}
              <div style={note}>{tr('Loggia lance cette scène ou ce script, et rien d’autre.')}</div>
            </div>
          ) : (
            <>
              <div style={etiquette}>{tr('ACTIONS')}</div>
              {s.actions.length === 0 && <div style={{ ...note, margin: '0 2px 8px' }}>{tr('Aucune action : ajoutez une famille ci-dessous.')}</div>}
              {s.actions.map((a, i) => (
                <div key={i} style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Fi i={ICONES_FAMILLES[a.famille] || 'bulb'} size={14} color={t.col} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 800 }}>{famillesNoms[a.famille] || a.famille}</span>
                    <button onClick={() => retirerAction(i)} title={tr('Retirer')} aria-label={tr('Retirer') + ' ' + (famillesNoms[a.famille] || a.famille)} style={{ ...boutonEdition(true), ...BOUTON_PETIT, width: 28, height: 28 }}><Fi i="cross-small" size={12} /></button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {(GESTES_SCN[a.famille] || []).map(g => <button key={g} aria-pressed={a.geste === g} onClick={() => majAction(i, { geste: g })} style={puce(a.geste === g, t)}>{(gestesNoms[a.famille] || {})[g] || g}</button>)}
                  </div>
                  {a.famille !== 'alarme' && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                      {PORTEES_SCN.map(p => <button key={p} aria-pressed={(a.portee || 'maison') === p} onClick={() => majAction(i, { portee: p })} style={puce((a.portee || 'maison') === p, t)}>{porteesNoms[p]}</button>)}
                      {a.portee === 'piece' && <ListeChoix value={a.piece || ''} options={optionsPieces} onChange={(v) => majAction(i, { piece: v || null })} label={tr('Pièce')} />}
                    </div>
                  )}
                  {((a.famille === 'lumieres' && a.geste === 'allumer') || a.famille === 'chauffage') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' }}>{a.famille === 'lumieres' ? tr('Luminosité') : tr('Consigne')}</span>
                      <input type="number" aria-label={a.famille === 'lumieres' ? tr('Luminosité') : tr('Consigne')} min={a.famille === 'lumieres' ? 1 : 5} max={a.famille === 'lumieres' ? 100 : 30} step={a.famille === 'lumieres' ? 5 : 0.5}
                        value={a.valeur != null ? a.valeur : (a.famille === 'lumieres' ? 100 : (a.geste === 'eco' ? 17 : 20))}
                        onChange={(e) => majAction(i, { valeur: e.target.value === '' ? null : Number(e.target.value) })} style={{ ...champ, width: 90 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' }}>{a.famille === 'lumieres' ? '%' : '°C'}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {['toujours', 'nuit', 'jour'].map(c => { const on = (a.si || 'toujours') === c; return <button key={c} aria-pressed={on} onClick={() => majAction(i, { si: c === 'toujours' ? null : c })} style={puce(on, t)}>{conditionsNoms[c]}</button>; })}
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {FAMILLES_SCN.map(f => <button key={f} onClick={() => ajouterAction(f)} style={puce(false, t)}><Fi i="plus" size={11} />{famillesNoms[f]}</button>)}
              </div>
              <div style={note}>{tr('Résolu au lancement : une lampe ajoutée demain sera prise. Jamais de désarmement ni de déverrouillage.')}</div>
            </>
          )}

          <div style={{ marginTop: 8 }}>
            <FicheRangee premiere titre={tr('Sur l’Accueil')} desc={tr('Dans la rangée des scénarios de l’accueil et de la veille.')}
              droite={<RmBascule on={s.accueil !== false} nom={tr('Sur l’Accueil')} onToggle={() => maj({ accueil: s.accueil === false })} couleur={t.col} />} />
            {existant && <FicheRangee titre={tr('Masqué')} desc={tr('Gardé, mais plus montré nulle part.')}
              droite={<RmBascule on={!!s.masque} nom={tr('Masqué')} onToggle={() => maj({ masque: !s.masque })} couleur={t.col} />} />}
          </div>
          {err && <div style={{ ...note, color: 'var(--o-bad)' }}>{err}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            {existant && scenario.integre && scenario.modifie && <button onClick={() => envoyer(close, { reinitialiser: scenario.id })} style={secondaire}>{tr('Remettre d’origine')}</button>}
            {existant && !scenario.integre && <button onClick={() => envoyer(close, { supprimer: scenario.id })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 14px', borderRadius: 14, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'rgba(var(--o-bad-rgb),.12)', border: '1px solid rgba(var(--o-bad-rgb),.45)', color: 'var(--o-bad)' }}><Fi i="cross-small" size={12} />{tr('Supprimer')}</button>}
            <span style={{ flex: 1 }} />
            <button onClick={() => valider(close)} disabled={!valide || attente} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 16px', borderRadius: 14, border: 'none', cursor: valide && !attente ? 'pointer' : 'default', fontSize: 13, fontWeight: 700, background: 'var(--o-accent-fond)', color: '#fff', opacity: valide && !attente ? 1 : .45 }}><Fi i="plus" size={12} />{tr('Enregistrer')}</button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
