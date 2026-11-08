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
 *
 * Deux formats, deux maquettes (03/11) : sur écran large, la v3 — des
 * panneaux aux lignes pleine largeur, l'heure en tête ; au téléphone, la v4 —
 * des cartes, et dans le journal seulement le pourquoi et l'heure.
 */
import { cvName, useEtatServeur, Fi } from '../ui.jsx';
import { tr } from '../i18n.js';
import { mot, pourquoi } from '../journalmots.js';
import { puce } from '../styles.js';
import { Panneau, CAPITALES, MONO, FILET, quandCourt } from './parcommun.jsx';
import { CarteTel } from './partel.jsx';

/* Le nom d'un module tel qu'on le lit à l'écran — les mêmes que les onglets. */
const NOM_MODULE = () => ({
  volets: tr('Volets'), fenetres: tr('Chauffage'), presence: tr('Départ et retour'),
  nuit: tr('La nuit'), veilles: tr('Veilles'), alertes: tr('Alertes'),
  interrupteurs: tr('Interrupteurs'), regles: tr('Journal'),
  // Le moteur du chauffage (plan 2, choix 16) : « Chauffage » nomme déjà la
  // règle des fenêtres, celle qui coupe les radiateurs.
  chauffage: tr('Planning de chauffe'),
  // Les cycles de l'électroménager et la pose d'un minuteur (chantier Prises, le contrat du plan 1).
  prises: tr('Prises'), minuteurs: tr('Minuteurs'),
  // « Me prévenir » d'un conseil d'énergie (usage étape 11).
  rappels: tr('Rappels'),
});

export function JournalReglages({ hass, tel = false }) {
  const h = hass && typeof hass.callWS === 'function' ? hass : null;
  const { etat, setEtat, err, setErr } =
    useEtatServeur(hass, 'loggia/regles/etat', 5000, tr('Journal indisponible.'));
  /* Rendre la main est un geste d'administrateur : c'est défaire ce que
   * quelqu'un a fait à la main. Le serveur le refuse de toute façon ; ne pas
   * montrer un bouton qui ne peut qu'échouer. */
  const admin = !!(hass && hass.user && hass.user.is_admin);
  const nom = (id) => (hass && hass.states && hass.states[id]) ? cvName(hass.states[id], id) : id;
  const badge = (couleur) => ({ marginRight: 6, padding: '1px 6px', borderRadius: 6, fontSize: 10.5, fontWeight: 800, background: 'var(--o-s2)', color: couleur });
  const Carte = tel ? CarteTel : Panneau;
  const pad = tel ? '10px 0' : '14px 22px';

  if (!etat) {
    return (
      <Carte titre={tr('Journal')}>
        <div style={{ padding: tel ? 0 : '0 22px 18px', fontSize: 12, fontWeight: 700, color: err ? 'var(--o-bad)' : 'var(--o-text3)' }}>{err || tr('Chargement…')}</div>
      </Carte>
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
  const calme = etat.calme ? <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: 'var(--o-s2)', color: 'var(--o-text2)', whiteSpace: 'nowrap', alignSelf: 'flex-start' }}>{tr('Heures calmes')}</span> : null;

  const rendre = async (id) => {
    if (!h) return;
    setErr('');
    try {
      const r = await h.callWS({ type: 'loggia/regles/degeler', entity_id: id });
      // Le serveur rend les gels qui restent : pas besoin d'attendre le sondage.
      setEtat(e => (e ? { ...e, gels: (r && r.gels) || {} } : e));
    } catch (e) {
      // « Unauthorized », « socle des regles indisponible » s'affichaient tels
      // quels (audit du 03/10) : un refus de Home Assistant se dit dans la
      // langue de l'écran, le reste par le repli de la vue.
      setErr(e && e.code === 'unauthorized' ? tr('Réservé aux administrateurs.') : tr('Impossible de rendre la main.'));
    }
  };

  /* Une ligne de ce qui retient : la puce de sa nature — une main, une règle
   * plus forte, un ordre qui attend —, le nom, pourquoi, et le geste. */
  const retient = (cle, ico, teinte, titre, desc, geste = null) => (
    <div key={cle} style={{ display: 'flex', alignItems: 'center', gap: tel ? 10 : 12, flexWrap: 'wrap', padding: pad, borderTop: FILET }}>
      <span aria-hidden="true" style={{ width: tel ? 28 : 34, height: tel ? 28 : 34, borderRadius: tel ? 9 : 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--o-' + teinte + '-rgb),.16)' }}>
        <Fi i={ico} size={tel ? 13 : 15} color={'var(--o-' + teinte + ')'} />
      </span>
      <span style={{ flex: '1 1 160px', minWidth: 0, lineHeight: 1.3 }}>
        <span style={{ display: 'block', fontSize: tel ? 12.5 : 13.5, fontWeight: tel ? 800 : 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titre}</span>
        <span style={{ display: 'block', fontSize: tel ? 11.5 : 12, fontWeight: 600, color: tel ? 'var(--o-text3)' : 'var(--o-text2)', marginTop: 2 }}>{desc}</span>
      </span>
      {geste}
    </div>
  );
  const enAttente = (id) => tr('en attente') + ' · ' + mot(attentes[id], 'sens')
    + (mot(attentes[id], 'motif') ? ' · ' + mot(attentes[id], 'motif') : '')
    + (attentes[id].expire ? ' · ' + tr('jusqu’à') + ' ' + quandCourt(attentes[id].expire) : '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tel ? 14 : 16 }}>
      {/* ── En ce moment : ce qui retient les règles (v4 : « En ce moment » ; v3 : « Ce qui retient les règles ») ── */}
      <Carte titre={tel ? tr('En ce moment') : tr('Ce qui retient les règles')}
        desc={tel ? tr('Ce qui retient les règles : une main, une règle plus forte, un volet injoignable.') : null}
        droite={calme}>
        {tel && calme}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {retenu === 0 && (
            <div style={{ padding: pad, borderTop: FILET, fontSize: 13, fontWeight: 800, color: 'var(--o-ok)' }}>{tr('Rien ne retient quoi que ce soit.')}</div>
          )}
          {Object.keys(gels).sort().map(id => retient('gel-' + id, 'hand', 'accent', nom(id),
            tr('sous la main de quelqu’un') + ' · ' + tr('{n} min', { n: Math.max(1, Math.round(gels[id] / 60)) }),
            admin && (
              <button type="button" onClick={() => rendre(id)} style={tel
                ? { padding: '7px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: 'rgba(var(--o-accent-rgb),.16)', color: 'var(--o-accent-soft)', fontSize: 11.5, fontWeight: 800 }
                : { ...puce(false), flexShrink: 0 }}>{tel ? tr('Rendre la main aux règles') : tr('Rendre la main')}</button>
            )))}
          {/* La règle, un mot du serveur : traduite comme les autres mots du journal (`mot`), jamais brute. */}
          {Object.keys(tenues).sort().map(id => retient('tenue-' + id, 'lock', 'orange', nom(id),
            tr('tenu par') + ' ' + (noms[tenues[id].module] || tenues[id].module) + (mot(tenues[id], 'regle') ? ' · ' + mot(tenues[id], 'regle') : '')))}
          {Object.keys(attentes).sort().map(id => retient('attente-' + id, 'time-quarter-to', 'warn', nom(id), enAttente(id)))}
        </div>
      </Carte>

      {/* ── Le journal ── */}
      <Carte titre={tr('Journal')} desc={tr('Toutes les règles, la plus récente en premier.')}>
        {lignes.length === 0 && (
          <div style={{ padding: pad, borderTop: FILET, fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Aucune manœuvre.')}</div>
        )}
        <div style={{ margin: tel ? '0 -18px -18px' : 0, display: 'flex', flexDirection: 'column' }}>
          {lignes.map((j, i) => tel ? (
            // Au téléphone (maquette v4) : pourquoi, et l'heure. La ligne rouge : un ordre qui n'a pas abouti (ADR 0007).
            <div key={j.ts + '' + i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderTop: FILET, fontSize: 12.5, fontWeight: 600 }}>
              <span style={{ flex: 1, minWidth: 0, color: j.echec ? 'var(--o-bad)' : 'var(--o-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.simule && <span style={badge('var(--o-warn)')}>{tr('simulé')}</span>}{pourquoi(j) || mot(j, 'quoi')}</span>
              <span style={{ ...MONO, fontSize: 11.5, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>{quandCourt(j.ts)}</span>
            </div>
          ) : (
            // Sur écran large (maquette v3) : l'heure en tête, ce que la règle a fait et pourquoi, son module en capitales.
            <div key={j.ts + '' + i} style={{ display: 'flex', alignItems: 'center', gap: '6px 16px', padding: '11px 22px', borderTop: FILET }}>
              <span style={{ ...CAPITALES, ...MONO, fontSize: 10, flex: '0 0 78px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{quandCourt(j.ts)}</span>
              <span style={{ flex: '1 1 160px', minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: j.echec ? 'var(--o-bad)' : 'var(--o-text)' }}>
                  {mot(j, 'quoi')}{j.n > 1 ? ' ' + j.n : ''}
                  {pourquoi(j) && <span style={{ fontWeight: 700, color: j.echec ? 'var(--o-bad)' : 'var(--o-text2)' }}> · {pourquoi(j)}</span>}
                </span>
                {j.simule ? <span style={badge('var(--o-warn)')}>{tr('simulé')}</span>
                  : <span style={{ ...CAPITALES, fontSize: 10, padding: '2px 6px', borderRadius: 6, background: 'var(--o-s1)' }}>{noms[j.module] || j.module}</span>}
              </span>
            </div>
          ))}
        </div>
      </Carte>

      {err && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-bad)' }}>{err}</div>}
    </div>
  );
}
