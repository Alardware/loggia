/* ── Les widgets en option du rail de l'Accueil : l'heure, le calendrier (ADR 0041) ──
 *
 * Quatre captures fournies le 17/09 (« sur le côté à l'accueil voici d'autres
 * widgets que l'on pourrait mettre, pour l'heure 2 styles, calendrier
 * également ») : des aiguilles sur de grands chiffres, trois tuiles heures ·
 * minutes · secondes, une semaine sous deux tuiles (agenda, soleil), et un
 * mois à côté de l'heure d'ici et d'ailleurs.
 *
 * Les captures donnent la DISPOSITION ; les teintes sont celles des cartes du
 * rail (`railPanel`, la carte météo) — une capture venue d'ailleurs ne donne
 * pas une palette. Le panneau violet devient un lavis de l'accent du thème.
 *
 * Tout ce qui se calcule vit dans `horloge.js`, testé à sec. Rien sans source :
 * pas d'entité `calendar`, pas de tuile Agenda ; pas de `sun.sun`, pas de tuile
 * soleil ; pas de météo, pas de température sous les aiguilles.
 */
import { useState, useEffect, useMemo } from 'react';
import { tr, locale } from './i18n.js';
import { BottomSheet, Fi } from './ui.jsx';
import { weatherEntity, WeatherIco } from './wxutil.jsx';
import { degres, estNuit, modeMeteo } from './meteo.js';
import {
  chiffresHeure, anglesAiguilles, heureVille, premierJourSemaine, semaineDe, grilleMois,
  prochainSoleil, resumeAgendaDuJour, fuseauValide, villesDe, VILLES_MAX,
} from './horloge.js';

/* La surface des cartes du rail (voir `railPanel` dans App.jsx et cartemeteo.jsx). */
const CARTE_RAIL = { background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,18px)', boxShadow: 'var(--o-shadow)', color: 'var(--o-text)', minWidth: 0 };
/* Une tuile DANS un widget : le fond des pastilles de la barre de confort. */
const TUILE = { background: 'var(--o-s2)', borderRadius: 12, minWidth: 0 };
const PETITES_CAPITALES = { fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--o-text3)' };

/* L'heure qui passe : un rendu par `pas`, calé sur la frontière (la seconde ou
 * la minute ronde) pour que deux widgets voisins changent ensemble. Le widget
 * masqué n'est pas monté : rien ne tourne pour rien. */
function useMaintenant(pas) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    let iv = null;
    const to = setTimeout(() => { setT(Date.now()); iv = setInterval(() => setT(Date.now()), pas); }, pas - (Date.now() % pas));
    return () => { clearTimeout(to); if (iv) clearInterval(iv); };
  }, [pas]);
  return t;
}

const heureLocale = (d) => d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const sansPoint = (s) => String(s || '').replace(/\./g, '');

/* ════════════ L'HEURE ════════════ */

function HeureAiguilles({ hass }) {
  const t = useMaintenant(1000);
  const d = new Date(t);
  const { h, m } = chiffresHeure(d);
  const a = anglesAiguilles(d);
  const S = (hass && hass.states) || {};
  const idMeteo = weatherEntity(hass);
  const st = idMeteo ? S[idMeteo] : null;
  const vivante = st && st.state !== 'unavailable' && st.state !== 'unknown';
  const mode = vivante ? modeMeteo(st.state, estNuit(t, S['sun.sun'] || null)) : null;
  const temp = vivante ? degres((st.attributes || {}).temperature, 0) : null;
  const date = sansPoint(d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' }));
  return (
    <div className="o-w-temps" role="img" aria-label={tr('Heure') + ' ' + h + ':' + m} style={{ ...CARTE_RAIL, padding: '12px 14px 12px' }}>
      <div style={{ ...PETITES_CAPITALES, fontSize: 10.5, color: 'var(--o-text2)', textAlign: 'center' }}>{date}</div>
      <div className="o-w-cadran" aria-hidden="true" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '2px 0' }}>
        {/* Les chiffres, très pâles, derrière les aiguilles : l'heure se lit deux fois. */}
        <div className="o-w-chiffres-fond" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.62em', fontWeight: 800, lineHeight: 1, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--o-text)', opacity: .09 }}>
          <span>{h}</span><span>{m}</span>
        </div>
        <svg viewBox="-50 -50 100 100" style={{ position: 'absolute', top: '50%', left: '50%', height: '100%', aspectRatio: '1 / 1', transform: 'translate(-50%,-50%)', overflow: 'visible' }}>
          <line x1="0" y1="3" x2="0" y2="-23" stroke="var(--o-text)" strokeWidth="3.4" strokeLinecap="round" transform={'rotate(' + a.heures + ')'} />
          <line x1="0" y1="4" x2="0" y2="-38" stroke="var(--o-text2)" strokeWidth="2.4" strokeLinecap="round" transform={'rotate(' + a.minutes + ')'} />
          <line x1="0" y1="11" x2="0" y2="-42" stroke="var(--o-accent)" strokeWidth="1.3" strokeLinecap="round" transform={'rotate(' + a.secondes + ')'} />
          <circle r="3.6" fill="var(--o-text)" />
          <circle r="1.4" fill="var(--o-surfA)" />
        </svg>
      </div>
      {(mode || temp) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {mode && <WeatherIco wx={mode} size={20} />}{temp}
        </div>
      )}
    </div>
  );
}

function HeureTuiles() {
  const t = useMaintenant(1000);
  const { h, m, s } = chiffresHeure(new Date(t));
  const tuile = (v, mot, muet) => (
    <div style={{ ...TUILE, padding: '13px 4px 10px', textAlign: 'center' }}>
      <div className="o-w-tuile-chiffre" aria-hidden={muet || undefined} style={{ fontWeight: 300, lineHeight: 1, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
      <div aria-hidden="true" style={{ ...PETITES_CAPITALES, marginTop: 8 }}>{mot}</div>
    </div>
  );
  return (
    <div className="o-w-temps" role="img" aria-label={tr('Heure') + ' ' + h + ':' + m} style={{ ...CARTE_RAIL, padding: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {tuile(h, tr('Heures'), true)}{tuile(m, tr('Minutes'), true)}{tuile(s, tr('Secondes'), true)}
      </div>
    </div>
  );
}

export function HorlogeRail({ style = 'aiguilles', hass = null }) {
  return style === 'tuiles' ? <HeureTuiles /> : <HeureAiguilles hass={hass} />;
}

/* ════════════ LE CALENDRIER ════════════ */

/* La pastille d'un jour : aujourd'hui cerclé de l'accent, le reste sur le fond des tuiles. */
const pastilleJour = (n, auj, taille, fond, classe = null) => (
  <span className={classe || undefined} style={{ ...(classe ? {} : { width: taille, height: taille }), borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
    background: auj ? 'transparent' : fond, border: auj ? '2px solid var(--o-accent)' : '2px solid transparent',
    fontSize: taille >= 28 ? 12 : 11.5, fontWeight: auj ? 800 : 600, fontVariantNumeric: 'tabular-nums', color: auj ? 'var(--o-text)' : 'var(--o-text1)' }}>{n}</span>
);

function CalendrierSemaine({ hass, calId, evenementsJour, onOpen }) {
  const t = useMaintenant(60000);
  const d = new Date(t);
  const S = (hass && hass.states) || {};
  const soleil = prochainSoleil(S['sun.sun'] || null, t);
  const resume = resumeAgendaDuJour(evenementsJour);
  const jours = semaineDe(d, premierJourSemaine(locale()));
  const ligneAgenda = resume.prochain
    ? (resume.prochain.start && resume.prochain.start.dateTime ? heureLocale(new Date(resume.prochain.start.dateTime)) : tr('journée')) + ' · ' + (resume.prochain.summary || tr('Événement'))
    : tr('Aucun événement aujourd’hui');
  const tuiles = [];
  if (calId) tuiles.push(
    <button key="agenda" type="button" onClick={() => { if (onOpen) onOpen(calId); }} aria-label={tr('Ouvrir le calendrier')}
      style={{ ...TUILE, padding: '10px 12px', border: 'none', textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{tr('Agenda')}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 3, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ligneAgenda}</div>
      {resume.autres > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-accent-soft)', marginTop: 3 }}>{resume.autres > 1 ? tr('+ {n} autres', { n: resume.autres }) : tr('+ 1 autre')}</div>}
    </button>);
  if (soleil) tuiles.push(
    <div key="soleil" style={{ ...TUILE, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{soleil.type === 'coucher' ? tr('Coucher') : tr('Lever')}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{heureLocale(soleil.date)}</div>
      </div>
      <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: soleil.type === 'coucher' ? 'var(--o-warn2)' : 'var(--o-warn)' }} />
    </div>);
  return (
    <div className="o-w-temps" style={{ ...CARTE_RAIL, padding: 10 }}>
      {tuiles.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + tuiles.length + ', minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>{tuiles}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2, padding: '0 2px 2px' }}>
        {jours.map(j => (
          <div key={j.date.getTime()} aria-current={j.aujourdhui ? 'date' : undefined} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            {pastilleJour(j.date.getDate(), j.aujourdhui, 30, 'var(--o-s2)')}
            <span style={{ ...PETITES_CAPITALES, color: j.aujourdhui ? 'var(--o-text)' : 'var(--o-text3)' }}>{sansPoint(j.date.toLocaleDateString(locale(), { weekday: 'short' }))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendrierMois({ villes }) {
  const t = useMaintenant(60000);
  const d = new Date(t);
  const premier = premierJourSemaine(locale());
  const semaines = grilleMois(d, premier);
  const entetes = semaines[0].map(c => c.date);
  /* `villes` arrive BRUT de l'agencement (`null` = jamais réglées) : la liste
   * se valide ici, une fois par changement — pas à chaque rendu de l'Accueil,
   * qui suit tous les états de la maison. */
  const liste = useMemo(() => villesDe(villes), [villes]);
  const lignes = liste.map(v => ({ ...v, heure: heureVille(d, v.fuseau, locale()) })).filter(v => v.heure);
  const dateLongue = d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div className="o-w-temps" style={{ ...CARTE_RAIL, padding: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 1fr) minmax(0, 1.45fr)', gap: 10, alignItems: 'stretch' }}>
        {/* L'heure d'ici, puis celle d'ailleurs : le panneau teinté de la capture, au lavis de l'accent. */}
        <div style={{ borderRadius: 12, padding: '10px 8px', background: 'rgba(var(--o-accent-rgb),.14)', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
          <div className="o-w-mois-heure" style={{ fontWeight: 800, lineHeight: 1, letterSpacing: '-.01em', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{heureLocale(d)}</div>
          {lignes.length > 0
            ? <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {lignes.map(v => (
                  <div key={v.fuseau + v.nom} className="o-w-ville" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 5, fontSize: 11.5 }}>
                    <span style={{ fontWeight: 600, color: 'var(--o-text2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nom}</span>
                    <span style={{ fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{v.heure}</span>
                  </div>
                ))}
              </div>
            : <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text2)', textAlign: 'center', lineHeight: 1.3, textTransform: 'capitalize' }}>{dateLongue}</div>}
        </div>
        <div role="grid" aria-label={d.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', rowGap: 3, alignItems: 'center', justifyItems: 'center', minWidth: 0 }}>
          {entetes.map(x => (
            <span key={'e' + x.getTime()} aria-hidden="true" style={{ ...PETITES_CAPITALES, fontSize: 9, letterSpacing: '.04em', paddingBottom: 2 }}>
              <span className="o-w-j3">{sansPoint(x.toLocaleDateString(locale(), { weekday: 'short' }))}</span>
              <span className="o-w-j1">{x.toLocaleDateString(locale(), { weekday: 'narrow' })}</span>
            </span>
          ))}
          {semaines.flat().map(c => (
            <span key={c.date.getTime()} role="gridcell" aria-current={c.aujourdhui ? 'date' : undefined} style={{ opacity: c.horsMois ? .28 : 1 }}>
              {pastilleJour(c.date.getDate(), c.aujourdhui, 23, 'transparent', 'o-w-pm')}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CalendrierRail({ style = 'semaine', hass = null, calId = null, evenementsJour = null, villes = null, onOpen = null }) {
  return style === 'mois'
    ? <CalendrierMois villes={villes} />
    : <CalendrierSemaine hass={hass} calId={calId} evenementsJour={evenementsJour} onOpen={onOpen} />;
}

/* ════════════ LES VILLES DU CALENDRIER « MOIS » ════════════ */

const champ = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' };

/* Les fuseaux que le moteur connaît, pour la saisie assistée ; un moteur ancien
 * n'en donne pas : le champ reste libre, et la validité se lit à la coche. */
const fuseauxConnus = () => { try { return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []; } catch { return []; } };

export function FeuilleVilles({ villes, onEnregistrer, onClose }) {
  const [lignes, setLignes] = useState(() => (villes || []).map((v, i) => ({ ...v, _k: 'v' + i })));
  const [fuseaux] = useState(fuseauxConnus);
  const poser = (k, patch) => setLignes(l => l.map(x => x._k === k ? { ...x, ...patch } : x));
  const valides = lignes.filter(x => fuseauValide(x.fuseau));
  return (
    <BottomSheet onClose={onClose}>
      {close => (<>
        <div style={{ fontSize: 19, fontWeight: 700 }}>{tr('Heures d’ailleurs')}</div>
        <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, margin: '4px 0 14px' }}>{tr('Jusqu’à quatre villes, à côté du mois. Le fuseau s’écrit comme « Europe/Paris » ; sans ville, le panneau montre la date.')}</div>
        {/* Une liste de suggestions ne se saisit pas : le champ qui la référence porte déjà son étiquette. */}
        {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
        <datalist id="o-dl-fuseaux">{fuseaux.map(f => <option key={f} value={f} />)}</datalist>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lignes.map(x => {
            const ok = fuseauValide(x.fuseau);
            return (
              <div key={x._k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input aria-label={tr('Nom affiché')} value={x.nom || ''} onChange={e => poser(x._k, { nom: e.target.value })} placeholder={tr('Nom affiché')} style={{ ...champ, flex: '0 1 34%' }} />
                <input aria-label={tr('Fuseau horaire')} value={x.fuseau || ''} onChange={e => poser(x._k, { fuseau: e.target.value.trim() })} placeholder="Europe/Paris" list="o-dl-fuseaux" spellCheck={false}
                  style={{ ...champ, flex: 1, borderColor: x.fuseau && !ok ? 'var(--o-bad)' : undefined }} />
                <button type="button" onClick={() => setLignes(l => l.filter(y => y._k !== x._k))} aria-label={tr('Retirer') + ' ' + (x.nom || x.fuseau || '')} title={tr('Retirer')}
                  style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--o-s1)', color: 'var(--o-bad)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Fi i="cross-small" size={14} /></button>
              </div>
            );
          })}
          {lignes.length < VILLES_MAX && (
            <button type="button" onClick={() => setLignes(l => [...l, { nom: '', fuseau: '', _k: 'n' + Date.now() }])}
              style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)' }}><Fi i="plus" size={12} />{tr('Ajouter une ville')}</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" onClick={close} style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{tr('Annuler')}</button>
          <button type="button" onClick={() => { onEnregistrer(valides.map(x => ({ nom: String(x.nom || '').trim(), fuseau: x.fuseau }))); close(); }}
            style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--o-accent-fond)', border: 'none', color: '#06121f', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{tr('Enregistrer')}</button>
        </div>
      </>)}
    </BottomSheet>
  );
}
