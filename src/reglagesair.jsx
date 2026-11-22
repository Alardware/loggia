/* Les réglages de l'air d'une fiche (chantier du 20/11, A5) : ventilation et balayage d'un climatiseur, vitesse d'un
 * purificateur ou d'un ventilateur, humidité visée d'un humidificateur ou d'un déshumidificateur, et son bac quand il est plein.
 *
 * Ce qui se calcule — ce que l'appareil SAIT, les crans, les bornes — vit dans `reglagesair.js` (pur) ; ici le dessin, aux briques
 * des fiches : une rangée par réglage, son titre à gauche, la commande à droite ; un menu (`ListeChoix`), jamais un `<select>` ;
 * un choix en bleu plein. Rien ne part que sur un geste : une fiche qui s'ouvre ne commande rien.
 *
 * Servie à trois fiches : celle d'un chauffage (`fichechauffage.jsx`, un climatiseur y est un thermostat), celle d'un climat que le
 * moteur ne connaît pas, et la fiche d'un appareil (`FicheAppareil` : un ventilateur, un humidificateur). */
import { useOptimiste } from './optimiste.js';
import { commander, commanderService } from './actions.js';
import { ListeChoix, Fi } from './ui.jsx';
import { LOGGIA_INDEX } from './state.js';
import { nombre } from './format.js';
import { tr } from './i18n.js';
import { reglagesAir, etapeDe, pctDeLEtape, vitesseVoisine, humiditeVoisine, humiditeBornee } from './reglagesair.js';

const TITRE = { fontSize: 13.5, fontWeight: 700, minWidth: 0 };
const SOUS = { fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', marginTop: 2 };
const RANGEE = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 };
const BOUTON = (ok) => ({ width: 44, height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'var(--o-s1)', color: 'var(--o-text1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: ok ? 1 : 0.4 });
const nomPas = (titre, geste) => tr('{a} : {b}', { a: titre, b: geste });

// Un menu de l'appareil (ventilation, balayage, mode) : la liste que l'appareil publie, la choisie en tête.
function MenuAir({ hass, id, m }) {
  const [ov, poser] = useOptimiste(m.courant);
  const choisir = (o) => {
    // Un humidificateur n'a pas de capacité de moteur : la route directe, par la même garde.
    const parti = m.capacite ? commander(hass, id, m.capacite, o) : commanderService(hass, id, 'humidifier', 'set_mode', { entity_id: id, mode: o });
    if (parti != null) poser(o);
  };
  return (
    <div data-reglage={m.cle} style={RANGEE}>
      <span style={TITRE}>{m.titre}</span>
      <ListeChoix value={ov != null ? ov : m.courant} options={m.options} onChange={choisir} label={m.titre} recherche={false} />
    </div>
  );
}

// − valeur + : la valeur dite au milieu, les deux boutons inertes à la borne (le clic est ignoré, le focus reste).
function PasAir({ titre, texte, moins, plus }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <button type="button" aria-disabled={moins ? undefined : true} aria-label={nomPas(titre, tr('Moins'))} onClick={() => { if (moins) moins(); }} style={BOUTON(!!moins)}><Fi i="minus-small" size={18} /></button>
      <span aria-live="polite" style={{ minWidth: 56, textAlign: 'center', fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{texte}</span>
      <button type="button" aria-disabled={plus ? undefined : true} aria-label={nomPas(titre, tr('Plus'))} onClick={() => { if (plus) plus(); }} style={BOUTON(!!plus)}><Fi i="plus-small" size={18} /></button>
    </span>
  );
}

// La vitesse : ses crans en puces quand l'appareil en a de 2 à 6, sinon pas à pas.
function VitesseAir({ hass, id, v }) {
  const parCrans = v.etapes.length > 0;
  const [ov, poser] = useOptimiste(parCrans ? etapeDe(v, v.pct) : v.pct);
  const courant = ov != null ? ov : (parCrans ? etapeDe(v, v.pct) : v.pct);
  const titre = tr('Vitesse du ventilateur');
  const envoyer = (pct, avance) => { if (commander(hass, id, 'set_speed', pct, 'percentage') != null) poser(avance); };
  if (parCrans) {
    return (
      <div data-reglage="vitesse">
        <div style={{ ...TITRE, marginBottom: 8 }}>{titre}</div>
        <div role="group" aria-label={titre} style={{ display: 'grid', gridTemplateColumns: 'repeat(' + Math.min(3, v.etapes.length) + ', minmax(0, 1fr))', gap: 4, padding: 4, borderRadius: 12, background: 'var(--o-well)' }}>
          {v.etapes.map(k => {
            const on = k === courant;
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => { if (!on) envoyer(pctDeLEtape(v, k), k); }}
                style={{ minHeight: 38, padding: '7px 8px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
                  background: on ? 'var(--o-accent-fond)' : 'transparent', color: on ? '#fff' : 'var(--o-text1)' }}>{k}</button>
            );
          })}
        </div>
      </div>
    );
  }
  const vers = (sens) => { const vise = vitesseVoisine({ ...v, pct: courant }, sens); return vise == null ? null : () => envoyer(vise, vise); };
  return (
    <div data-reglage="vitesse" style={RANGEE}>
      <span style={TITRE}>{titre}</span>
      <PasAir titre={titre} texte={courant != null ? nombre(courant, 0) + ' %' : '—'} moins={vers(-1)} plus={vers(1)} />
    </div>
  );
}

// L'humidité visée, de cinq en cinq points ; l'humidité mesurée dessous quand l'appareil la donne.
function HumiditeAir({ hass, id, h }) {
  const [ov, poser] = useOptimiste(h.valeur);
  const courant = ov != null ? ov : h.valeur;
  const titre = tr('Consigne d’humidité');
  const envoyer = (vise) => {
    const v = humiditeBornee(h, vise);
    const parti = id.indexOf('climate.') === 0 ? commander(hass, id, 'set_humidity', v) : commanderService(hass, id, 'humidifier', 'set_humidity', { entity_id: id, humidity: v });
    if (parti != null) poser(v);
  };
  const vers = (sens) => { const vise = humiditeVoisine({ ...h, valeur: courant }, sens); return vise == null ? null : () => envoyer(vise); };
  return (
    <div data-reglage="humidite" style={RANGEE}>
      <div style={{ minWidth: 0 }}>
        <div style={TITRE}>{titre}</div>
        {h.courante != null && <div style={SOUS}>{tr('Humidité {n} %', { n: Math.round(h.courante) })}</div>}
      </div>
      <PasAir titre={titre} texte={courant != null ? nombre(courant, 0) + ' %' : '—'} moins={vers(-1)} plus={vers(1)} />
    </div>
  );
}

/** Les réglages de l'air de `id` : le bac en alerte (au liseré de panne, comme les avertissements des fiches), puis un panneau — son
 * `style`, celui de la fiche qui l'accueille — avec ce que l'appareil sait régler. Rien (null) quand il ne sait rien de tout cela. */
export function ReglagesAir({ hass, id, style = null }) {
  const S = (hass && hass.states) || null;
  const { menus, vitesse, humidite, bacs } = reglagesAir(id, S, LOGGIA_INDEX && LOGGIA_INDEX.entityMeta);
  const regle = menus.length > 0 || !!vitesse || !!humidite;
  if (!regle && !bacs.length) return null;
  return (
    <>
      {bacs.map(({ cle, texte }) => (
        <div key={cle} className="o-panne" role="status" data-bac={cle}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 14, fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>
          <Fi i="triangle-warning" size={14} color="var(--o-text2)" /><span style={{ minWidth: 0 }}>{texte}</span>
        </div>
      ))}
      {regle && (
        <div data-panneau="air" style={{ ...(style || { padding: 18, borderRadius: 14, background: 'var(--o-s1)' }), display: 'flex', flexDirection: 'column', gap: 16 }}>
          {vitesse && <VitesseAir hass={hass} id={id} v={vitesse} />}
          {humidite && <HumiditeAir hass={hass} id={id} h={humidite} />}
          {menus.map(m => <MenuAir key={m.cle} hass={hass} id={id} m={m} />)}
        </div>
      )}
    </>
  );
}
