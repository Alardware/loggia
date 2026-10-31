/* ── La fiche météo, chargée à la demande (sa maquette « Cartes météo », cadre 1b, 20/10) ──
 *
 * Le widget du rail ouvrait la fiche universelle : neuf lignes sous
 * « Commandes », qui ne contenait aucune commande. La maquette range la popup
 * par QUESTION : maintenant, les heures, la semaine, la vigilance. Les entités
 * restent sous « L'appareil », qui ouvre la fiche universelle par-dessus.
 *
 * Une feuille SANS onglets, sa hauteur suit son contenu :
 *  - l'en-tête commun (`EnteteFiche`) : la plaque de 40 px avec l'icône du
 *    ciel, le nom de la ville, « Météo-France · mis à jour à 14:35 », l'épingle,
 *    la croix ;
 *  - le panneau du haut, teinté au ton de la phrase (froid pour la pluie,
 *    l'orange ou le rouge d'une vigilance) : la bande de vigilance s'il y en a
 *    une, l'icône de 84, le chiffre en 50 / 800, le ciel, « Ressenti 21° ·
 *    Max 24° · Min 11° », la phrase et son conseil ;
 *  - « Prochaines heures » : huit cases, la pluie sous chacune dès 20 % ;
 *  - « 7 jours » : une barre par jour entre son minimum et son maximum sur
 *    l'échelle de la semaine, froid → chaud, le repère d'aujourd'hui ;
 *  - six tuiles, deux par rangée : vent (flèche), humidité, UV (barre des
 *    zones, et son maximum du jour), nuages, pluie du jour, soleil — chacune
 *    seulement si l'entité la donne ; puis la qualité de l'air du dehors et les
 *    pollens (chantier G4, ADR 0303), au même dessin, seulement quand leur
 *    échelle est connue : le chiffre, le mot du rang, le lendemain, une barre
 *    des rangs — une information, sans lavis ;
 *  - « Risques » : pluie, neige, gel sur les prochaines heures ;
 *  - « Vigilance » : chaque phénomène du capteur et son niveau, en vert au
 *    calme ; sans capteur, rien ;
 *  - « L'appareil ».
 * Tout ce qui se calcule vit dans meteo.js, testé à sec. Ce module n'exporte
 * qu'un CONTENU : sa coquille (`FicheMeteo`, App.jsx) garde la feuille et pose
 * la frontière Suspense dedans — un morceau introuvable se dit dans la feuille,
 * jamais à la place de l'Accueil.
 */
import { useMemo } from 'react';
import { tr, locale } from './i18n.js';
import { Fi } from './ui.jsx';
import { WeatherIco, haWeatherLabel } from './wxutil.jsx';
import { typesPrevision, degres, estNuit, modeMeteo, heuresMeteo, extremesDuJour, nomVille, phraseMeteo, vigilanceWidget } from './meteo.js';
import { semaineMeteo, tuilesMeteo, risquesMeteo } from './meteofiche.js';
import { airDuDehors, pollensDuDehors } from './airdehors.js';
import { LOGGIA_INDEX } from './state.js';
import { usePrevisions, fondTeinte, RGB_TON, ENCRE_TON } from './cartemeteo.jsx';
import { capteurVigilance, niveauDe } from './vigilance.js';
import { EnteteFiche, PETITES_CAPITALES, filet } from './fichecommune.jsx';
import { PANNEAU, RANGEE_SERREE, EN_BOUTON, TITRE, SOUS } from './fichekit.js';

const PETIT = { fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--o-text3)' };
/* Les cinq zones UV de l'OMS, leur largeur sur la barre (0-2, 3-5, 6-7, 8-10, 11+) et leur jeton. */
const ZONES_UV = [[3, 'var(--o-ok-rgb)'], [3, 'var(--o-gold-rgb)'], [2, 'var(--o-warn-rgb)'], [3, 'var(--o-bad-rgb)'], [2, 'var(--o-purple-rgb)']];
/* Les barres de la semaine : du froid (--o-cold) au chaud (--o-warn2), mêlés selon la place sur l'échelle. */
const chaud = (q) => `color-mix(in oklab, rgb(var(--o-warn2-rgb)) ${Math.round(q * 100)}%, rgb(var(--o-cold-rgb)))`;
const pc = (q) => (q * 100).toFixed(1) + '%';
const NIVEAUX = { vert: { mot: () => tr('Vert'), encre: 'var(--o-ok)' }, jaune: { mot: () => tr('Jaune'), encre: 'var(--o-warn)' }, orange: { mot: () => tr('Orange'), encre: 'var(--o-warn2)' }, rouge: { mot: () => tr('Rouge'), encre: 'var(--o-bad)' } };
const ORDRE_NIVEAUX = ['rouge', 'orange', 'jaune', 'vert'];
const sansPrefixe = (s) => String(s).replace(/^(data|powered|provided)\s+by\s+/i, '');

/* Une colonne d'heure : l'heure, l'icône figée, la température, la pluie dès 20 %. */
function Heure({ h, pluie }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>{h.libelle}</span>
      <span style={{ width: 36, height: 36, margin: '-4px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{h.mode && <WeatherIco wx={h.mode} size={36} anime={false} />}</span>
      <span style={{ fontSize: 13.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{h.temp}</span>
      {pluie && <span style={{ minHeight: 13, fontSize: 10.5, fontWeight: 800, lineHeight: '13px', color: h.forte ? 'var(--o-cold)' : 'var(--o-text3)', whiteSpace: 'nowrap' }}>{h.pluie || ''}</span>}
    </div>
  );
}

export default function FicheMeteoContenu({ id, hass, epingle = null, onFiche = null, maintenant = null }) {
  const S = (hass && hass.states) || {};
  const st = S[id] || null;
  const types = typesPrevision(st);
  const parHeure = usePrevisions(hass, id, types.heure ? 'hourly' : null);
  const parJour = usePrevisions(hass, id, types.jour ? 'daily' : null);
  const a = (st && st.attributes) || {};
  const t = maintenant == null ? Date.now() : maintenant;
  const soleil = S['sun.sun'] || null;
  const muette = !st || st.state === 'unavailable' || st.state === 'unknown';
  const nuit = estNuit(t, soleil);
  const mode = muette ? null : modeMeteo(st.state, nuit);
  const ciel = muette ? null : haWeatherLabel(st.state);
  const nom = nomVille(a.friendly_name) || tr('Météo');
  // Muette, l'entité garde ses derniers attributs : on ne les dit pas, ce serait inventer un temps qu'il fait.
  const temperature = muette ? null : degres(a.temperature, 1);
  const ressenti = muette ? null : degres(a.apparent_temperature);
  const extremes = extremesDuJour(parJour, t);
  const capteur = capteurVigilance(S);
  const vigilance = vigilanceWidget(S, capteur);
  /* La phrase et le conseil ; une vigilance orange ou rouge prend la phrase, comme sur le widget. */
  const phrase = muette ? null : vigilance && vigilance.widget ? { texte: vigilance.texte, conseil: null, ton: vigilance.ton } : phraseMeteo({ heures: parHeure, jours: parJour, maintenant: t, soleil, etat: st });
  const ton = (phrase && phrase.ton) || null;
  /* L'air et les pollens du dehors (chantier G4, A1 et A6) : ce que l'index sait de chaque entité — sa plateforme, son appareil —
   * dit si leur échelle est connue ; sans index, rien. */
  const etats = hass ? hass.states : null;
  const { air, pollens } = useMemo(() => {
    const em = LOGGIA_INDEX && LOGGIA_INDEX.entityMeta;
    const meta = (x) => (em ? em.get(x) || null : null);
    return { air: airDuDehors(etats || {}, meta), pollens: pollensDuDehors(etats || {}, meta) };
  }, [etats]);
  const { heures, semaine, tuiles, risques } = useMemo(() => ({
    heures: heuresMeteo({ etat: st, previsions: parHeure, maintenant: t, soleil, n: 8 }).map(h => {
      const p = (parHeure || []).find(x => String(Date.parse((x && x.datetime) || '')) === h.cle);
      const proba = p ? Number(p.precipitation_probability) : NaN;
      return { ...h, pluie: !isNaN(proba) && proba >= 20 ? Math.round(proba) + ' %' : null, forte: !isNaN(proba) && proba >= 50 };
    }),
    semaine: semaineMeteo(parJour, a.temperature, t, soleil),
    tuiles: muette ? [] : tuilesMeteo({ attributs: a, jours: parJour, heures: parHeure, maintenant: t, soleil, air, pollens }),
    risques: risquesMeteo(parHeure, t),
  }), [st, muette, parHeure, parJour, t, soleil, a, air, pollens]);
  const avecPluie = heures.some(h => h.pluie);
  /* Le capteur de Météo-France : chaque phénomène et son niveau ; MeteoAlarm : l'événement seul. */
  const phenomenes = useMemo(() => {
    if (!capteur) return [];
    const ca = (S[capteur] && S[capteur].attributes) || {};
    const lignes = Object.keys(ca).filter(k => niveauDe(ca[k])).map(k => ({ nom: k, niveau: niveauDe(ca[k]) }));
    if (lignes.length) return lignes.sort((x, y) => ORDRE_NIVEAUX.indexOf(x.niveau) - ORDRE_NIVEAUX.indexOf(y.niveau));
    return vigilance && vigilance.niveau ? [{ nom: vigilance.texte, niveau: vigilance.niveau }] : [];
  }, [S, capteur, vigilance]);
  const source = a.attribution ? sansPrefixe(a.attribution) : null;
  const misAJour = st && st.last_updated ? new Date(st.last_updated).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : null;
  const sousNom = [source, misAJour && tr('mis à jour à {h}', { h: misAJour })].filter(Boolean).join(' · ') || null;
  const plaque = { icone: 'cloud-sun', glyphe: mode ? <WeatherIco wx={mode} size={34} anime={false} /> : null, fond: ton ? `rgba(${RGB_TON[ton]},.16)` : 'var(--o-s1)', encre: ton ? ENCRE_TON[ton] : 'var(--o-text1)' };
  const attribution = capteur && S[capteur] && S[capteur].attributes && S[capteur].attributes.attribution ? sansPrefixe(S[capteur].attributes.attribution) : null;

  return (
    <div className="rb-fiche" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <EnteteFiche nom={nom} epingle={epingle} plaque={plaque} sousNom={sousNom} panne={muette ? tr('Indisponible') : null} />

      {/* Le panneau du haut : la vigilance en bande, le chiffre, le ciel, la phrase et son conseil. */}
      <div className={muette ? 'o-panne' : undefined} style={{ ...PANNEAU, padding: 18, background: ton ? fondTeinte(RGB_TON[ton]) : 'var(--o-s3)' }}>
        {vigilance && vigilance.widget && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '8px 12px', borderRadius: 10, background: `rgba(${RGB_TON[vigilance.ton]},.14)`, color: ENCRE_TON[vigilance.ton], fontSize: 12.5, fontWeight: 800 }}>
            <Fi i="triangle-warning" size={13} /><span>{vigilance.texte}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {mode && <span style={{ width: 84, height: 84, margin: '-14px -8px -14px -12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><WeatherIco wx={mode} size={84} /></span>}
          <div style={{ display: 'flex', alignItems: 'flex-start', fontWeight: 800, lineHeight: 1 }}>
            <span style={{ fontSize: 50, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums', color: muette ? 'var(--o-text3)' : 'var(--o-text)' }}>{temperature || '—'}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
            {ciel && <div style={{ fontSize: 15, fontWeight: 800 }}>{ciel}</div>}
            {(ressenti || extremes) && (
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 3 }}>
                {[ressenti && tr('Ressenti {t}', { t: ressenti }), extremes && tr('Max {n}', { n: extremes.max }), extremes && extremes.min && tr('Min {n}', { n: extremes.min })].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        </div>
        {phrase && <div style={{ fontSize: 14, fontWeight: 800, marginTop: 14, color: ton ? ENCRE_TON[ton] : 'var(--o-text)' }}>{phrase.texte}</div>}
        {phrase && phrase.conseil && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text1)', marginTop: 4, lineHeight: 1.45 }}>{phrase.conseil}</div>}
      </div>

      {heures.length > 0 && (
        <div style={{ ...PANNEAU, padding: '14px 12px 12px' }}>
          <div style={{ ...PETITES_CAPITALES, padding: '0 4px' }}>{tr('Prochaines heures')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + heures.length + ', minmax(0, 1fr))', gap: 2, marginTop: 12 }}>
            {heures.map(h => <Heure key={h.cle} h={h} pluie={avecPluie} />)}
          </div>
        </div>
      )}

      {semaine.length > 0 && (
        <div style={{ ...PANNEAU, padding: '12px 16px 4px' }}>
          <div style={{ ...PETITES_CAPITALES, marginBottom: 6 }}>{tr('7 jours')}</div>
          {semaine.map(j => (
            <div key={j.cle} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, borderTop: filet(1) }}>
              <span style={{ width: 40, flexShrink: 0, fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.libelle}</span>
              <span style={{ width: 36, height: 36, margin: '0 -2px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{j.mode && <WeatherIco wx={j.mode} size={36} anime={false} />}</span>
              <span style={{ width: 36, flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: 'var(--o-cold)' }}>{j.pluie || ''}</span>
              <span style={{ width: 26, flexShrink: 0, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--o-text2)', fontVariantNumeric: 'tabular-nums' }}>{j.min || ''}</span>
              <div aria-hidden="true" style={{ position: 'relative', flex: 1, height: 6, borderRadius: 3, background: 'var(--o-s1)' }}>
                {j.largeur != null && <span style={{ position: 'absolute', top: 0, bottom: 0, left: pc(j.gauche), width: pc(j.largeur), borderRadius: 3, background: `linear-gradient(90deg, ${chaud(j.gauche)}, ${chaud(j.gauche + j.largeur)})` }} />}
                {j.maintenant != null && <span style={{ position: 'absolute', top: -5, height: 16, left: pc(j.maintenant), width: 4, marginLeft: -2, borderRadius: 2, background: 'var(--o-text)', boxShadow: '0 0 0 2px var(--o-bg2)' }} />}
              </div>
              <span style={{ width: 26, flexShrink: 0, fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{j.max || ''}</span>
            </div>
          ))}
        </div>
      )}

      {tuiles.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {tuiles.map(tl => (
            <div key={tl.cle} style={{ ...PANNEAU, padding: '12px 14px', borderRadius: 16 }}>
              <div style={PETIT}>{tl.titre}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{tl.valeur}</span>
                {tl.fleche != null && <span aria-hidden="true" style={{ display: 'inline-flex', color: 'var(--o-text2)', transform: 'rotate(' + tl.fleche + 'deg)' }}><Fi i="arrow-small-up" size={16} /></span>}
              </div>
              {tl.sous && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 4 }}>{tl.sous}</div>}
              {tl.ligne && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{tl.ligne}</div>}
              {tl.rangs && (
                <div aria-hidden="true" style={{ display: 'flex', gap: 2, height: 6, marginTop: 10 }}>
                  {tl.rangs.couleurs.map((rgb, i) => <span key={i} style={{ flex: 1, borderRadius: 3, background: `rgba(${rgb},${i === tl.rangs.i ? 1 : 0.28})` }} />)}
                </div>
              )}
              {tl.uv && (
                <div aria-hidden="true" style={{ position: 'relative', marginTop: 10, paddingTop: 4 }}>
                  <div style={{ display: 'flex', gap: 2, height: 6 }}>
                    {ZONES_UV.map(([flex, rgb], i) => <span key={i} style={{ flex, borderRadius: 3, background: `rgba(${rgb},${i === tl.uv.zone ? 1 : 0.28})` }} />)}
                  </div>
                  <span style={{ position: 'absolute', top: 0, height: 14, left: pc(tl.uv.position), width: 4, marginLeft: -2, borderRadius: 2, background: 'var(--o-text)', boxShadow: '0 0 0 2px var(--o-bg2)' }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {risques.length > 0 && (
        <div style={{ ...PANNEAU, ...RANGEE_SERREE, padding: '12px 14px', borderRadius: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}><div style={PETIT}>{tr('Risques')}</div><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 4 }}>{tr('Sur les prochaines heures')}</div></div>
          {risques.map(r => (
            <div key={r.cle} style={{ minWidth: 52, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: r.valeur >= 50 ? 'var(--o-cold)' : r.valeur > 0 ? 'var(--o-text1)' : 'var(--o-text3)' }}>{r.valeur + ' %'}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', marginTop: 2 }}>{r.titre}</div>
            </div>
          ))}
        </div>
      )}

      {phenomenes.length > 0 && (
        <div style={{ ...PANNEAU, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '12px 16px 8px' }}>
            <span style={PETITES_CAPITALES}>{tr('Vigilance')}</span>
            {attribution && <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{attribution}</span>}
          </div>
          {phenomenes.map(p => (
            <div key={p.nom} style={{ ...RANGEE_SERREE, padding: '10px 16px', borderTop: filet(1) }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: NIVEAUX[p.niveau].encre }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflowWrap: 'break-word' }}>{p.nom}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: p.niveau === 'vert' ? 'var(--o-text1)' : NIVEAUX[p.niveau].encre }}>{NIVEAUX[p.niveau].mot()}</span>
            </div>
          ))}
        </div>
      )}

      {onFiche && (
        <div style={{ ...PANNEAU, overflow: 'hidden' }}>
          <button type="button" onClick={() => onFiche(id)} style={{ ...RANGEE_SERREE, ...EN_BOUTON }}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('L’appareil')}</span><span style={SOUS}>{tr('Toutes ses entités, l’épingle')}</span></span>
            <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
          </button>
        </div>
      )}
    </div>
  );
}
