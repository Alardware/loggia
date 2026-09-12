/* Le journal de la maison : toutes les règles mêlées, dans l'ordre du temps.
 *
 * C'est le seul outil de débogage dont un non-technicien dispose. Chaque
 * onglet montre déjà ses propres manœuvres ; ici, la maison entière, et ce
 * que le socle tient en commun (ADR 0009, 0020).
 *
 * En tête, le PRÉSENT. Quand rien ne bouge, la question n'est pas ce qui
 * s'est passé mais ce qui retient : une main (le gel), une règle (la tenue),
 * un volet injoignable (l'attente). Sans cette section, on relit dix lignes
 * de journal pour comprendre qu'on a soi-même touché le volet il y a un
 * quart d'heure.
 *
 * Dessous, la liste, filtrée par module et par simulé / réel. Rien d'autre
 * n'est visible par défaut : une manœuvre précise se retrouve en lisant,
 * pas en réglant trois filtres.
 */
import { useState } from 'react';
import { cvName, useEtatServeur } from '../ui.jsx';
import { tr } from '../i18n.js';

/* Le nom d'un module tel qu'on le lit à l'écran — les mêmes que les onglets. */
const NOM_MODULE = () => ({
  volets: tr('Volets'), fenetres: tr('Chauffage'), presence: tr('Départ et retour'),
  nuit: tr('La nuit'), veilles: tr('Veilles'), alertes: tr('Alertes'),
  interrupteurs: tr('Interrupteurs'), regles: tr('Journal'),
});

/* L'heure seule aujourd'hui, la date avant : une ligne d'avant-hier ne doit
 * pas se lire comme une ligne de ce matin. */
function quand(ts) {
  const d = new Date(ts * 1000);
  const heure = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? heure
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + heure;
}

const puce = (on) => ({ padding: '6px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: 'none', background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text2)' });

export function JournalReglages({ hass, cardSt }) {
  const h = hass && typeof hass.callWS === 'function' ? hass : null;
  const { etat, setEtat, err, setErr } =
    useEtatServeur(hass, 'loggia/regles/etat', 5000, tr('Journal indisponible.'));
  const [module, setModule] = useState('');
  const [simulees, setSimulees] = useState(true);
  /* Rendre la main est un geste d'administrateur : c'est défaire ce que
   * quelqu'un a fait à la main. Le serveur le refuse de toute façon ; ne pas
   * montrer un bouton qui ne peut qu'échouer. */
  const admin = !!(hass && hass.user && hass.user.is_admin);
  const nom = (id) => (hass && hass.states && hass.states[id]) ? cvName(hass.states[id], id) : id;

  const titre = { fontSize: 15, fontWeight: 700 };
  const sous = { fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 };
  const ligne = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', fontSize: 12, fontWeight: 600 };
  const etiquette = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  const badge = (couleur) => ({ marginRight: 6, padding: '1px 6px', borderRadius: 6, fontSize: 10.5, fontWeight: 800, background: 'var(--o-s2)', color: couleur });

  if (!etat) {
    return (
      <div style={cardSt}>
        <div style={titre}>{tr('Journal')}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: err ? 'var(--o-bad)' : 'var(--o-text3)', marginTop: 4 }}>{err || tr('Chargement…')}</div>
      </div>
    );
  }

  const journal = etat.journal || [];
  const gels = etat.gels || {};
  const tenues = etat.tenues || {};
  const attentes = etat.attentes || {};
  const retenu = Object.keys(gels).length + Object.keys(tenues).length + Object.keys(attentes).length;
  const noms = NOM_MODULE();
  const presents = [...new Set(journal.map(j => j.module))].filter(Boolean);
  const lignes = journal.filter(j => (!module || j.module === module) && (simulees || !j.simule));

  const rendre = async (id) => {
    if (!h) return;
    setErr('');
    try {
      const r = await h.callWS({ type: 'loggia/regles/degeler', entity_id: id });
      // Le serveur rend les gels qui restent : pas besoin d'attendre le sondage.
      setEtat(e => (e ? { ...e, gels: (r && r.gels) || {} } : e));
    } catch (e) {
      setErr((e && (e.message || e.code)) || tr('Impossible de rendre la main.'));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── En ce moment ── */}
      <div style={cardSt}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={titre}>{tr('En ce moment')}</div>
            <div style={sous}>{tr('Ce qui retient les règles : une main, une règle plus forte, un volet injoignable.')}</div>
          </div>
          {etat.calme && (
            <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: 'var(--o-s2)', color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{tr('Heures calmes')}</span>
          )}
        </div>
        {retenu === 0 && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Rien ne retient quoi que ce soit.')}</div>
        )}
        {retenu > 0 && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column' }}>
            {Object.keys(gels).sort().map(id => (
              <div key={'gel-' + id} style={ligne}>
                <span style={{ minWidth: 0 }}>
                  <span style={etiquette}>{nom(id)}</span>
                  <span style={{ color: 'var(--o-text3)' }}>{tr('sous la main de quelqu’un')} · {tr('{n} min', { n: Math.max(1, Math.round(gels[id] / 60)) })}</span>
                </span>
                {admin && (
                  <button onClick={() => rendre(id)} style={{ ...puce(false), flexShrink: 0 }}>{tr('Rendre la main aux règles')}</button>
                )}
              </div>
            ))}
            {Object.keys(tenues).sort().map(id => (
              <div key={'tenue-' + id} style={ligne}>
                <span style={{ minWidth: 0 }}>
                  <span style={etiquette}>{nom(id)}</span>
                  <span style={{ color: 'var(--o-text3)' }}>{tr('tenu par')} {noms[tenues[id].module] || tenues[id].module} · {tenues[id].regle}</span>
                </span>
              </div>
            ))}
            {Object.keys(attentes).sort().map(id => (
              <div key={'attente-' + id} style={ligne}>
                <span style={{ minWidth: 0 }}>
                  <span style={etiquette}>{nom(id)}</span>
                  <span style={{ color: 'var(--o-text3)' }}>{tr('en attente')} · {attentes[id].sens}{attentes[id].expire ? ' · ' + tr('jusqu’à') + ' ' + quand(attentes[id].expire) : ''}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Le journal ── */}
      <div style={cardSt}>
        <div style={titre}>{tr('Journal')}</div>
        <div style={sous}>{tr('Toutes les règles, la plus récente en premier.')}</div>
        {presents.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12, alignItems: 'center' }}>
            <button onClick={() => setModule('')} style={puce(!module)}>{tr('Tout')}</button>
            {presents.map(m => (
              <button key={m} onClick={() => setModule(module === m ? '' : m)} style={puce(module === m)}>{noms[m] || m}</button>
            ))}
            <span style={{ flex: 1 }} />
            <button onClick={() => setSimulees(s => !s)} aria-pressed={simulees}
              style={{ ...puce(simulees), color: simulees ? '#fff' : 'var(--o-warn2)' }}>{tr('simulées')}</button>
          </div>
        )}
        {lignes.length === 0 && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Aucune manœuvre.')}</div>
        )}
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
          {lignes.map((j, i) => (
            <div key={j.ts + '' + i} style={{ ...ligne, borderTop: i ? ligne.borderTop : 'none' }}>
              <span style={{ minWidth: 0 }}>
                {j.simule && <span style={badge('var(--o-warn2)')}>{tr('simulé')}</span>}
                {!module && <span style={badge('var(--o-text2)')}>{noms[j.module] || j.module}</span>}
                {j.quoi}{j.n > 1 ? ' ' + j.n : ''} · <span style={{ color: 'var(--o-text3)' }}>{j.regle}{j.motif ? ' · ' + j.motif : ''}{j.detail ? ' · ' + j.detail : ''}</span>
              </span>
              <span style={{ color: 'var(--o-text3)', flexShrink: 0 }}>{quand(j.ts)}</span>
            </div>
          ))}
        </div>
      </div>

      {err && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-bad)' }}>{err}</div>}
    </div>
  );
}

export default JournalReglages;
