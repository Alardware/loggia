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
import { cvName, useEtatServeur } from '../ui.jsx';
import { tr } from '../i18n.js';
import { mot, pourquoi } from '../journalmots.js';
import { puce } from '../styles.js';
import { TITRE_PANNEAU, DESC_PANNEAU, CAPITALES, MONO, quandCourt } from './parcommun.jsx';

/* Le nom d'un module tel qu'on le lit à l'écran — les mêmes que les onglets. */
const NOM_MODULE = () => ({
  volets: tr('Volets'), fenetres: tr('Chauffage'), presence: tr('Départ et retour'),
  nuit: tr('La nuit'), veilles: tr('Veilles'), alertes: tr('Alertes'),
  interrupteurs: tr('Interrupteurs'), regles: tr('Journal'),
});

export function JournalReglages({ hass, cardSt }) {
  const h = hass && typeof hass.callWS === 'function' ? hass : null;
  const { etat, setEtat, err, setErr } =
    useEtatServeur(hass, 'loggia/regles/etat', 5000, tr('Journal indisponible.'));
  /* Rendre la main est un geste d'administrateur : c'est défaire ce que
   * quelqu'un a fait à la main. Le serveur le refuse de toute façon ; ne pas
   * montrer un bouton qui ne peut qu'échouer. */
  const admin = !!(hass && hass.user && hass.user.is_admin);
  const nom = (id) => (hass && hass.states && hass.states[id]) ? cvName(hass.states[id], id) : id;

  const titre = TITRE_PANNEAU;
  const sous = DESC_PANNEAU;
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
  // Plus de puces de filtre (maquette du 18/09) : le journal se lit d'un bloc.
  const lignes = journal;

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
          <div style={{ marginTop: 12, fontSize: 13, fontWeight: 800, color: 'var(--o-ok)' }}>{tr('Rien ne retient quoi que ce soit.')}</div>
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
                  <span style={{ color: 'var(--o-text3)' }}>{tr('en attente')} · {mot(attentes[id], 'sens')}{mot(attentes[id], 'motif') ? ' · ' + mot(attentes[id], 'motif') : ''}{attentes[id].expire ? ' · ' + tr('jusqu’à') + ' ' + quandCourt(attentes[id].expire) : ''}</span>
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
        {lignes.length === 0 && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Aucune manœuvre.')}</div>
        )}
        <div style={{ margin: '12px -22px -4px', display: 'flex', flexDirection: 'column' }}>
          {lignes.map((j, i) => (
            <div key={j.ts + '' + i} className="o-journal-ligne" style={{ display: 'grid', gridTemplateColumns: 'minmax(64px,120px) minmax(56px,96px) minmax(0,1fr) auto', alignItems: 'center', gap: 12, padding: '10px 22px', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', fontSize: 12.5, fontWeight: 600 }}>
              <span style={{ ...CAPITALES, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{noms[j.module] || j.module}</span>
              {/* La ligne rouge : un ordre qui n'a pas abouti (ADR 0007). */}
              <span style={{ fontWeight: 800, color: j.echec ? 'var(--o-bad)' : 'var(--o-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.simule && <span style={badge('var(--o-warn)')}>{tr('simulé')}</span>}{mot(j, 'quoi')}{j.n > 1 ? ' ' + j.n : ''}</span>
              <span style={{ color: j.echec ? 'var(--o-bad)' : 'var(--o-text2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pourquoi(j)}</span>
              <span style={{ ...MONO, fontSize: 11.5, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>{quandCourt(j.ts)}</span>
            </div>
          ))}
        </div>
      </div>

      {err && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-bad)' }}>{err}</div>}
    </div>
  );
}

