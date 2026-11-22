/* ── La POPUP d'une ouverture (ADR 0388 ; ses maquettes « Ouverture — popup (ouverte, alerte) » et « (fermée) » du 22/11) ──────
 *
 * Le CONTENU seul, chargé à la demande : sa coquille (`FicheBinaire`, appareils/fiches.jsx) garde la feuille, l'épingle, la fiche
 * universelle de l'appareil, et pose la frontière Suspense dedans. Une feuille SANS onglets : sa hauteur suit son contenu.
 * De haut en bas, comme ses maquettes :
 *  - l'en-tête commun : la plaque (ambre ouverte), le nom, « {pièce} · Ouverture », l'épingle, la croix (`EnteteFiche`) ;
 *  - le HAUT : le dessin en grand (104 × 130) ; l'état en 34 / 800, un point ambre qui pulse quand elle est ouverte ; « depuis
 *    12 min 03 s », à la seconde ; « Ouverte à 17:09 » — fermée, « depuis 09:12 » et « Fermée depuis 2 h 20 ». Ouvert, le panneau
 *    passe à l'ambre en entier (lavis en biais, liseré) ;
 *  - l'ALERTE, quand elle est ouverte depuis plus que le délai choisi : « Ouverte depuis plus de 10 min. Pensez à la fermer. » ;
 *  - AUJOURD'HUI : ouvertures, temps ouvert, dernière ; la bande de 0 h à 24 h (l'ambre ouverte, le bleu éteint fermée, le reste de
 *    la journée à venir plus sombre, un trait à maintenant) ; la liste, la plus récente d'abord ;
 *  - 7 DERNIERS JOURS : une barre par jour, le chiffre dessus, aujourd'hui en ambre ;
 *  - le RAPPEL (pour qui règle la maison) : « Me prévenir si elle reste ouverte » — Jamais, 5, 10, 30 min — et « Prévenir dès
 *    l'ouverture la nuit ». Le composant envoie (`ouvertures.py`) : une minuterie vit au serveur, jamais dans un onglet ;
 *  - l'APPAREIL : le dernier signal, la pile et sa jauge, et « L'appareil », la fiche universelle.
 * Une lecture de l'historique sur 7 jours, à l'ouverture, relue quand l'état change (`useSemaine`).
 */
import { useState, useEffect, useRef } from 'react';
import { tr } from './i18n.js';
import { Fi } from './ui.jsx';
import { relTime, dureeMinutes, heureCourte } from './format.js';
import { EnteteFiche, filet } from './fichecommune.jsx';
import { PANNEAU, EN_BOUTON, TITRE, SOUS } from './fichekit.js';
import { railBascule, rondBascule } from './cartes/briques.jsx';
import { couleurPile } from './attention.js';
import { cfgVal, cfgSet, compteOrdinaire } from './state.js';
import { lireJournee, minuitDe, depuisQuand } from './journeelue.js';
import { dernierSignal } from './mesuresfiche.js';
import {
  CLE_OUVERTURES, DELAIS_OUVERTURE, REPRISE_OUVERTURE, NUIT_OUVERTURE, reglageOuverture, poserReglage, dessinOuverture,
  etatsVivants, journeeOuverture, semaineOuverture, lettreJour, vueHautOuverture, alerteOuverture, motsOuverture, ligneEpisode, totalSemaine,
} from './ouverture.js';
import DessinOuverture from './dessinouverture.jsx';

const CAPS = { fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--o-text2)' };
const AMBRE = 'var(--o-warn)';
/* Le liseré de l'ambre suit le réglage « Liserés » (`--o-bw`) comme celui des panneaux. */
const LISERE_AMBRE = 'var(--o-bw,1px) solid rgba(var(--o-warn-rgb),.45)';
// La liste du jour garde les six plus récentes : une porte poussée trente fois ne fait pas une popup de trois écrans.
const LISTE_MAX = 6;

/** L'historique de la semaine : UNE lecture à l'ouverture (`history/period`, de minuit il y a six jours à maintenant), relue quand
 *  l'état change et le lendemain. null tant qu'elle n'est pas lue, 'erreur' si elle ne se lit pas, sinon `{ debut, etats }`. */
function useSemaine(hass, id, change) {
  const [lu, setLu] = useState(null);
  const h = useRef(hass);
  h.current = hass;
  const connecte = !!(hass && typeof hass.callApi === 'function');
  const jour = minuitDe(Date.now());
  useEffect(() => {
    if (!connecte || !id) { setLu(null); return undefined; }
    let vivant = true;
    const d = new Date(jour);
    d.setDate(d.getDate() - 6);
    const debut = d.getTime();
    new Promise((ok) => ok(h.current.callApi('GET', 'history/period/' + new Date(debut).toISOString() + '?filter_entity_id=' + encodeURIComponent(id)
      + '&end_time=' + encodeURIComponent(new Date().toISOString()) + '&minimal_response&no_attributes')))
      .then((r) => { if (vivant) setLu({ debut, etats: lireJournee(r)[id] || [] }); }, () => { if (vivant) setLu('erreur'); });
    return () => { vivant = false; };
  }, [connecte, id, jour, change]);
  return lu;
}

/** Une ligne d'un panneau : le titre à gauche, ce qu'il faut à droite (54 px, sa maquette). */
const LIGNE = { display: 'flex', alignItems: 'center', gap: 12, minHeight: 54, padding: '0 18px', boxSizing: 'border-box', width: '100%' };

export default function FicheOuvertureContent({ id, hass, briques, piece = null, epingle = null, glyphe = null, onFiche = null, maintenant = null }) {
  const { pileDe, soeursDe } = briques;
  const S = (hass && hass.states) || {};
  const st = S[id] || null;
  const a = (st && st.attributes) || {};
  const classe = a.device_class;
  const ouverte = !!(st && st.state === 'on');
  const lu = useSemaine(hass, id, st ? st.last_changed : null);
  const semaine = lu && lu !== 'erreur' ? lu : null;
  // Ouverte, « depuis 12 min 03 s » bat à la seconde ; fermée, la bande avance à la demi-minute.
  const [, setTic] = useState(0);
  useEffect(() => {
    if (maintenant != null) return undefined;
    const iv = setInterval(() => setTic(x => x + 1), ouverte ? 1000 : 30000);
    return () => clearInterval(iv);
  }, [ouverte, maintenant]);
  const t = maintenant == null ? Date.now() : maintenant;
  const debut = minuitDe(t);
  const etats = semaine ? etatsVivants(semaine.etats, st, semaine.debut) : null;
  const depuis = etats ? depuisQuand(etats, debut, st) : null;
  const jour = etats ? journeeOuverture(etats, debut, t) : null;
  const sept = etats ? semaineOuverture(etats, t) : null;
  const haut = vueHautOuverture({ st, jour, depuis, debut, maintenant: t });
  const mots = motsOuverture(classe);

  // Le rappel : la table de la maison, un geste optimiste qui retombe si le composant refuse (`cfgSet` rend false).
  const [local, setLocal] = useState(null);
  const reglage = local || reglageOuverture(cfgVal(CLE_OUVERTURES, null), id);
  const reglable = !compteOrdinaire(hass);
  const poser = (patch) => {
    setLocal({ ...reglage, ...patch });
    cfgSet({ [CLE_OUVERTURES]: (brut) => poserReglage(brut, id, patch) }).then((pris) => { if (pris === false) setLocal(null); });
  };
  // Ouverte depuis la veille, l'heure vient de la semaine lue : le serveur, lui, prévient quand même.
  const depuisAlerte = depuis != null ? depuis : etats ? depuisQuand(etats, semaine.debut, st) : null;
  const alerte = alerteOuverture({ st, depuis: depuisAlerte, delai: reglage.delai, maintenant: t });

  const pile = pileDe(S, id);
  const dernier = dernierSignal(S, [id, ...soeursDe(id)]);
  const plaque = { icone: 'door-closed', glyphe, fond: haut.ouvert ? 'rgba(var(--o-warn-rgb),.16)' : 'var(--o-s1)', encre: haut.ouvert ? AMBRE : 'var(--o-text3)' };
  const chargement = lu === 'erreur' ? tr('Historique indisponible pour le moment') : tr('Chargement…');
  const maxSemaine = sept ? Math.max(1, ...sept.map(j => j.n)) : 1;
  const liste = jour ? jour.episodes.slice().reverse() : [];

  return (
    <div className="rb-fiche o-fiche-ouverture" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <EnteteFiche nom={a.friendly_name || id} epingle={epingle} plaque={plaque} sousNom={[piece, tr('Ouverture')].filter(Boolean).join(' · ')} />

      {/* LE HAUT : le dessin, l'état, depuis quand. Ouvert, l'ambre en entier ; muet, le liseré qui respire. */}
      <div className={haut.muet ? 'o-panne' : undefined} data-haut={haut.ouvert ? 'ouverte' : haut.muet ? 'muette' : 'fermee'}
        style={{ ...PANNEAU, padding: 18, display: 'flex', alignItems: 'center', gap: 18,
          ...(haut.ouvert ? { background: 'linear-gradient(135deg, rgba(var(--o-warn-rgb),.14), rgba(var(--o-warn-rgb),.04)), var(--o-s3)', border: LISERE_AMBRE } : null) }}>
        <span style={{ flexShrink: 0, width: 104, height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <DessinOuverture type={dessinOuverture(classe)} etat={haut.muet ? 'muette' : haut.ouvert ? 'ouverte' : 'fermee'} hauteur={130} />
        </span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {haut.ouvert && <span className="o-ouv-pouls" aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, flexShrink: 0, background: AMBRE }} />}
            <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.1, color: haut.ouvert ? AMBRE : haut.muet ? 'var(--o-bad)' : 'var(--o-text)', overflowWrap: 'anywhere' }}>{haut.etat}</span>
          </div>
          {haut.depuis && <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--o-text1)', fontVariantNumeric: 'tabular-nums' }}>{haut.depuis}</div>}
          {haut.sous && <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--o-text2)' }}>{haut.sous}</div>}
        </div>
      </div>

      {alerte && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(var(--o-warn2-rgb),.12)', border: 'var(--o-bw,1px) solid rgba(var(--o-warn2-rgb),.5)' }}>
          <Fi i="triangle-warning" size={18} color="var(--o-warn2)" />
          <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: 'var(--o-text)' }}>{alerte}</span>
        </div>
      )}

      {/* AUJOURD'HUI : les trois chiffres, la bande de 0 à 24 h, la liste. */}
      <div style={{ ...PANNEAU, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', borderBottom: filet(1) }}>
          {[[tr('Ouvertures'), jour ? String(jour.fois) : '—'], [tr('Temps ouvert'), jour ? dureeMinutes(Math.round(jour.total / 60000)) : '—'], [tr('Dernière'), jour && jour.derniere != null ? heureCourte(jour.derniere) : '—']].map(([l, v], i) => (
            <div key={l} className="o-ouv-chiffre" style={{ padding: '14px 18px', minWidth: 0, borderLeft: filet(i) }}>
              {/* Au téléphone, « Temps ouvert » passe sur deux lignes plutôt que de finir en « Temps ou… ». */}
              <div style={{ ...CAPS, lineHeight: 1.25, overflowWrap: 'break-word', hyphens: 'auto' }}>{l}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '16px 18px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <span style={{ ...CAPS, letterSpacing: '.12em' }}>{tr('Aujourd’hui')}</span>
            <span aria-hidden="true" style={{ display: 'flex', gap: 12, fontSize: 11, fontWeight: 600, color: 'var(--o-text2)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: AMBRE }} />{mots.ouverte}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(var(--o-accent-rgb),.22)' }} />{mots.fermee}</span>
            </span>
          </div>
          {/* La bande : elle ne se lit pas à voix haute — les chiffres et la liste la disent. */}
          {/* Le passé de la journée au bleu éteint (fermée), l'ambre par-dessus (ouverte) ; ce qui reste à venir, creusé (`--o-well`). */}
          <div aria-hidden="true" data-bande-jour="" style={{ position: 'relative', height: 26, borderRadius: 8, background: 'var(--o-well)', overflow: 'hidden' }}>
            {jour && <span style={{ position: 'absolute', left: 0, width: jour.maintenant + '%', top: 0, bottom: 0, background: 'rgba(var(--o-accent-rgb),.22)' }} />}
            {jour && jour.bandes.map((b) => <span key={b.l} data-episode="" style={{ position: 'absolute', top: 0, bottom: 0, left: b.l + '%', width: b.w + '%', minWidth: 3, background: AMBRE }} />)}
            {jour && <span style={{ position: 'absolute', top: 0, bottom: 0, left: jour.maintenant + '%', width: 2, background: 'var(--o-text)' }} />}
          </div>
          <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', marginTop: 8 }}>
            {[0, 6, 12, 18, 24].map(h => <span key={h}>{tr('{n} h', { n: h })}</span>)}
          </div>
        </div>
        <div style={{ borderTop: filet(1), padding: '4px 18px' }}>
          {!jour && <div style={{ ...SOUS, padding: '14px 0' }}>{chargement}</div>}
          {jour && !liste.length && <div style={{ ...SOUS, padding: '14px 0' }}>{tr('Aucune ouverture aujourd’hui')}</div>}
          {liste.slice(0, LISTE_MAX).map((e, i) => {
            const l = ligneEpisode(e);
            return (
              <div key={e.a} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, borderTop: filet(i) }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: l.enCours ? AMBRE : 'var(--o-accent-soft)' }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{l.plage}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: l.enCours ? AMBRE : 'var(--o-text2)', whiteSpace: 'nowrap' }}>{l.duree}</span>
              </div>
            );
          })}
          {liste.length > LISTE_MAX && <div style={{ ...SOUS, padding: '10px 0 12px', borderTop: filet(1), marginTop: 0 }}>{tr('{n} de plus aujourd’hui', { n: liste.length - LISTE_MAX })}</div>}
        </div>
      </div>

      {/* 7 DERNIERS JOURS : une barre par jour, le chiffre dessus ; aujourd'hui à l'ambre. */}
      <div style={{ ...PANNEAU, padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <span style={{ ...CAPS, letterSpacing: '.12em' }}>{tr('7 derniers jours')}</span>
          {sept && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text1)' }}>{totalSemaine(sept)}</span>}
        </div>
        {!sept && <div style={{ ...SOUS, marginTop: 12 }}>{chargement}</div>}
        {sept && (<>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, alignItems: 'end', height: 84, marginTop: 12 }}>
            {sept.map((j, i) => (
              <div key={j.debut} data-jour={i === 6 ? 'aujourdhui' : ''} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: 84 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text1)' }}>{j.n}</span>
                <span aria-hidden="true" style={{ width: '100%', maxWidth: 30, height: Math.max(6, Math.round(j.n / maxSemaine * 60)), borderRadius: '6px 6px 3px 3px', background: i === 6 ? AMBRE : 'rgba(var(--o-accent-rgb),.35)' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, marginTop: 6 }}>
            {sept.map((j, i) => <span key={j.debut} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: i === 6 ? AMBRE : 'var(--o-text3)' }}>{i === 6 ? tr('Auj.') : lettreJour(j.debut)}</span>)}
          </div>
        </>)}
      </div>

      {/* LE RAPPEL, pour qui règle la maison : le délai, puis la nuit. Le choisi en bleu plein, texte blanc. */}
      {reglable && (
        <div style={{ ...PANNEAU, padding: '16px 18px 6px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <span style={TITRE}>{mots.prevenir}</span>
            <span style={{ ...SOUS, marginTop: 3 }}>{tr('Notification sur le téléphone, puis rappel toutes les {n} min', { n: REPRISE_OUVERTURE })}</span>
          </div>
          <div role="group" aria-label={mots.prevenir} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
            {DELAIS_OUVERTURE.map(d => {
              const on = reglage.delai === d;
              return (
                <button key={d} type="button" aria-pressed={on} onClick={() => { if (!on) poser({ delai: d }); }}
                  style={{ height: 44, borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 600, padding: '0 6px', minWidth: 0,
                    background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)' }}>
                  {d ? tr('{n} min', { n: d }) : tr('Jamais')}
                </button>
              );
            })}
          </div>
          <button type="button" role="switch" aria-checked={reglage.nuit} aria-label={tr('Prévenir dès l’ouverture la nuit')} onClick={() => poser({ nuit: !reglage.nuit })}
            style={{ ...EN_BOUTON, display: 'flex', alignItems: 'center', gap: 12, minHeight: 62, padding: 0, borderTop: filet(1), marginTop: 4, width: '100%' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={TITRE}>{tr('Prévenir dès l’ouverture la nuit')}</span>
              <span style={{ ...SOUS, marginTop: 3 }}>{tr('De {debut} à {fin}, ou quand personne n’est à la maison', { debut: heureCourte(new Date(2000, 0, 1, NUIT_OUVERTURE.debut)), fin: heureCourte(new Date(2000, 0, 1, NUIT_OUVERTURE.fin)) })}</span>
            </span>
            <span aria-hidden="true" style={railBascule(reglage.nuit)}><span style={rondBascule(reglage.nuit)} /></span>
          </button>
        </div>
      )}

      {/* L'APPAREIL : le dernier signal, la pile et sa jauge, la fiche universelle. */}
      <div style={{ ...PANNEAU, overflow: 'hidden' }}>
        <div style={LIGNE}>
          <span style={{ ...TITRE, flex: 1, minWidth: 0 }}>{tr('Dernier signal')}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--o-text1)', whiteSpace: 'nowrap' }}>{dernier == null ? '—' : relTime(new Date(dernier).toISOString())}</span>
        </div>
        {pile != null && (
          <div style={{ ...LIGNE, borderTop: filet(1) }}>
            <span style={{ ...TITRE, flex: 1, minWidth: 0 }}>{tr('Pile')}</span>
            <span aria-hidden="true" style={{ width: 70, height: 8, borderRadius: 4, background: 'var(--o-s1)', overflow: 'hidden', flexShrink: 0 }}>
              <span style={{ display: 'block', height: 8, width: Math.max(0, Math.min(100, pile)) + '%', borderRadius: 4, background: couleurPile(pile, 'var(--o-ok)') }} />
            </span>
            <span style={{ minWidth: 48, textAlign: 'right', fontSize: 14, fontWeight: 700, color: couleurPile(pile, 'var(--o-ok)'), fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{pile + ' %'}</span>
          </div>
        )}
        {onFiche && (
          <button type="button" onClick={() => onFiche(id)} style={{ ...LIGNE, ...EN_BOUTON, minHeight: 64, borderTop: filet(1) }}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('L’appareil')}</span><span style={{ ...SOUS, marginTop: 3 }}>{tr('L’épingle, les commandes et toutes ses entités')}</span></span>
            <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
          </button>
        )}
      </div>
    </div>
  );
}
