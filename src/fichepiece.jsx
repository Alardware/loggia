/* ── La fiche d'une pièce, chargée à la demande (audit du 19/10) ──────────────────────────────────────
 *
 * Elle a quitté App.jsx, et le démarrage avec elle : elle s'ouvre en édition, par qui configure la maison. Elle
 * n'importe jamais App.jsx : l'Accueil lui passe l'habillage des pièces et les briques des fiches de là-bas
 * (`briques` : `habillagePiece`, `TEINTES_PIECE`, `ICONES_PIECE`, `ChoixIcone`, `FicheRangee`, `RmBascule`).
 *
 * « Ajouter une piece » / « Modifier la piece » (maquette du 15/09) : le nom,
 * l'icone (grille), la teinte (puces), « Tuile compacte », puis les entites
 * de la carte — temperature, humidite, CO2, lumieres, les memes champs que
 * Parametres › Entites — « si besoin » (retour user du 15/09). Enregistrer
 * passe par `lotPiece` ; la taille et l'ordre de l'accueil sont a
 * l'appelant, qui tient la grille et l'envoie dans le meme lot.
 * « Pièce du dehors » (décision D5 du 19/10) : Auto — la règle des noms (`estDehors`, App.jsx) —, Oui ou Non, qui
 * l'emportent ; rangée avec la pièce (`dehors`), dans la configuration de la maison.
 */
import { useState } from 'react';
import { tr } from './i18n.js';
import { BottomSheet, TitreFeuille, ChampSuggere, Fi } from './ui.jsx';
import { cfgVal, normRooms } from './state.js';

export default function FichePiece({ nom = '', hass, compacte: compacteInit = false, onEnregistrer, onSupprimer, onClose, briques }) {
  const { habillagePiece, TEINTES_PIECE, ICONES_PIECE, ChoixIcone, FicheRangee, RmBascule } = briques;
  const existante = !!nom;
  const pieces = normRooms(cfgVal('loggia_rooms', null));
  const cfg = existante ? (pieces.find(r => r.room === nom) || null) : null;
  const h = (cfg && cfg.haid) || {};
  const actuel = existante ? habillagePiece(nom, null) : null;
  const [val, setVal] = useState(nom);
  const [icone, setIcone] = useState(actuel ? actuel.glyphe : 'home');
  const [teinte, setTeinte] = useState(actuel ? actuel.teinte : 'accent');
  // La grille d'icones, par pages de dix : on ouvre sur celle de l'icone choisie.
  const [compacte, setCompacte] = useState(!!compacteInit);
  const [temp, setTemp] = useState(h.temp || '');
  const [hum, setHum] = useState(h.humidity || '');
  const [co2, setCo2] = useState(h.co2 || '');
  const [lumieres, setLumieres] = useState(Array.isArray(h.lights) ? h.lights.join(', ') : '');
  // « Pièce du dehors » (décision D5) : Auto — la règle des noms (`estDehors`) —, Oui ou Non, qui l'emportent.
  const [dehors, setDehors] = useState(cfg && typeof cfg.dehors === 'boolean' ? cfg.dehors : null);
  const S = (hass && hass.states) || {};
  const capteurs = (classe) => Object.keys(S).filter(id => id.indexOf('sensor.') === 0 && S[id] && S[id].attributes && S[id].attributes.device_class === classe).sort();
  const propre = val.trim();
  const doublon = !!propre && propre !== nom && pieces.some(r => r.room === propre);
  const valide = !!propre && !doublon;
  const valider = (close) => {
    if (!valide) return;
    // `...h` : ce que la fiche n'édite pas reste — le seuil CO₂ de la pièce (audit du 19/10, H7).
    onEnregistrer(existante ? nom : null, {
      room: propre, icon: icone, teinte, dehors: dehors == null ? undefined : dehors,
      haid: { ...h, temp: temp.trim() || null, humidity: hum.trim() || null, co2: co2.trim() || null, lights: lumieres.split(',').map(s => s.trim()).filter(Boolean) },
    }, compacte);
    close();
  };
  const t = TEINTES_PIECE.find(x => x.id === teinte) || TEINTES_PIECE[0];
  // Sans `outline: none` (23/09, plan M7) : posé en style en ligne, il battait
  // la règle `:focus-visible` de la feuille et le champ focalisé ne se voyait
  // plus au clavier. L'anneau d'accent revient, ici comme ailleurs.
  const champ = { width: '100%', boxSizing: 'border-box', padding: '10px 13px', borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 13, fontWeight: 600 };
  const mono = { ...champ, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12.5 };
  const etiquette = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', margin: '14px 2px 7px' };
  const note = { fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', margin: '6px 2px 0' };
  const puce = (on, x) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, border: 'var(--o-bw,1px) solid ' + (on ? 'rgba(' + x.rgb + ',.5)' : 'var(--o-bd2)'), background: on ? 'rgba(' + x.rgb + ',.14)' : 'var(--o-s1)', color: on ? x.col : 'var(--o-text1)' });
  const entites = [['o-piece-temp', tr('Température'), temp, setTemp, 'temperature'], ['o-piece-hum', tr('Humidité'), hum, setHum, 'humidity'], ['o-piece-co2', tr('CO₂'), co2, setCo2, 'carbon_dioxide']];

  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <div style={{ padding: '0 0 8px' }}>
          <TitreFeuille style={{ fontSize: 15, fontWeight: 800 }}>{existante ? tr('Modifier la pièce') : tr('Ajouter une pièce')}</TitreFeuille>
          <div style={{ ...note, marginTop: 4 }}>{tr('La pièce apparaîtra sur l’accueil et dans le sélecteur de pièces.')}</div>

          <label htmlFor="o-piece-nom" style={etiquette}>{tr('NOM')}</label>
          {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
          <input id="o-piece-nom" value={val} onChange={(e) => setVal(e.target.value)} placeholder={tr('Salon, Cuisine, Chambre…')}
            onKeyDown={(e) => { if (e.key === 'Enter') valider(close); }} style={champ} autoFocus />
          {doublon && <div style={{ ...note, color: 'var(--o-bad)' }}>{tr('Une pièce porte déjà ce nom.')}</div>}

          <ChoixIcone valeur={icone} onChoisir={setIcone} suggerees={ICONES_PIECE} />

          <div style={etiquette}>{tr('TEINTE')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TEINTES_PIECE.map(x => { const on = x.id === teinte; return (
              <button key={x.id} aria-pressed={on} onClick={() => setTeinte(x.id)} style={puce(on, x)}>
                <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: x.col, display: 'inline-block' }} />{tr(x.label)}
              </button>
            ); })}
          </div>

          <div style={{ marginTop: 8 }}>
            <FicheRangee premiere titre={tr('Tuile compacte')} desc={tr('Une rangée sur l’accueil au lieu de deux.')}
              droite={<RmBascule on={compacte} nom={tr('Tuile compacte')} onToggle={() => setCompacte(v => !v)} couleur={t.col} />} />
          </div>

          <div style={etiquette}>{tr('Pièce du dehors')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[[null, tr('Auto')], [true, tr('Oui')], [false, tr('Non')]].map(([v, l]) => (
              <button key={l} aria-pressed={dehors === v} onClick={() => setDehors(v)} style={{ ...puce(false, t), ...(dehors === v ? { background: 'var(--o-accent-fond)', borderColor: 'transparent', color: '#fff' } : null) }}>{l}</button>))}
          </div>

          <div style={{ ...etiquette, marginTop: 4 }}>{tr('ENTITÉS')}</div>
          <div style={{ ...note, margin: '0 2px 8px' }}>{tr('Les capteurs de la carte. Vide : ceux de la zone Home Assistant du même nom.')}</div>
          {entites.map(([id, lbl, v, set, classe]) => (
            <div key={id} style={{ marginBottom: 8 }}>
              <label htmlFor={id} style={{ ...etiquette, margin: '0 2px 5px', letterSpacing: 0, fontSize: 12 }}>{lbl}</label>
              <ChampSuggere id={id} label={lbl} value={v} onChange={set} placeholder="sensor.…" style={mono}
                suggestions={capteurs(classe).map(x => ({ id: x, label: S[x].attributes.friendly_name || x, sub: x }))} />
            </div>
          ))}
          <label htmlFor="o-piece-lum" style={{ ...etiquette, margin: '0 2px 5px', letterSpacing: 0, fontSize: 12 }}>{tr('Lumières')}</label>
          {/* Deux identifiants d'exemple, l'un après l'autre : le filet des chaînes en clair lit un identifiant à la fois. */}
          {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
          <input id="o-piece-lum" value={lumieres} onChange={(e) => setLumieres(e.target.value)} placeholder={'light.…' + ', ' + 'light.…'} spellCheck={false} style={mono} />
          <div style={note}>{tr('Vide : toutes les lumières de la pièce. Une liste ne vaut que pour le bouton de la carte.')}</div>

          <div style={{ display: 'flex', gap: 8, marginTop: 20, alignItems: 'center' }}>
            {existante && <button onClick={() => { onSupprimer(nom); close(); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 14px', borderRadius: 14, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'rgba(var(--o-bad-rgb),.12)', border: '1px solid rgba(var(--o-bad-rgb),.45)', color: 'var(--o-bad)' }}><Fi i="cross-small" size={12} />{tr('Supprimer')}</button>}
            <span style={{ flex: 1 }} />
            <button onClick={() => valider(close)} disabled={!valide} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 16px', borderRadius: 14, border: 'none', cursor: valide ? 'pointer' : 'default', fontSize: 13, fontWeight: 700, background: 'var(--o-accent-fond)', color: '#fff', opacity: valide ? 1 : .45 }}><Fi i="plus" size={12} />{tr('Enregistrer')}</button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
