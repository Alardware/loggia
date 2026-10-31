/* ── L'agenda du rail : UNE carte, et sa feuille (maquettes du 02/10) ───────
 *
 * L'Accueil portait DEUX cartes pour la même chose : « Calendrier », qui
 * dessinait une semaine ou un mois sans dire ce qui s'y passe, et « Agenda »,
 * qui listait sept jours d'événements sans montrer où ils tombent.
 *
 * QUATRE maquettes ont été fournies, pas deux : la carte et la feuille, pour
 * l'ordinateur ET pour le mobile. Un premier essai n'a repris que le mobile et
 * l'a servi partout — « tu n'as pas respecté ce que je t'ai partagé ». Sur
 * grand écran la feuille est tout autre chose : deux colonnes, un mini-mois et
 * la liste des agendas à gauche, trois vues (Mois, Semaine, Jour), la semaine
 * en sept colonnes d'heures.
 *
 * Tout ce qui se calcule vit dans `agenda.js`, testé à sec : ici on ne fait
 * que poser des pixels et appeler Home Assistant.
 *
 * LA FEUILLE VIT DANS `feuilleagenda.jsx`, chargée quand on l'ouvre (chantier
 * Prises, la borne du démarrage) : l'Accueil ne montre que la carte. Ce que
 * les deux partagent — la couleur d'un agenda, son nom, la lecture d'un
 * événement, la bande des jours, la ligne d'un événement — reste ici, exporté.
 */
import { useMemo } from 'react';
import { tr, trN, locale } from './i18n.js';
import { Fi, nomCarte } from './ui.jsx';
import { cleJour, joursAgenda, comptesParJour, evenementsDuJour, debutDe, finDe } from './agenda.js';
import { CARTE_RAIL } from './styles.js';

/* La couleur d'un calendrier. Home Assistant n'en donne aucune : on en dérive
 * une, STABLE, du nom de l'entité — le même agenda garde sa teinte d'une
 * session à l'autre, ce qu'un tirage au sort ne ferait pas. */
const TEINTES = ['79,140,255', '142,110,255', '46,196,136', '236,98,140', '255,166,60', '64,196,214'];
export function teinteAgenda(id) {
  const s = String(id || '');
  let n = 0;
  for (let i = 0; i < s.length; i += 1) n = (n * 31 + s.charCodeAt(i)) % 9973;
  return TEINTES[n % TEINTES.length];
}

const hhmm = (d) => d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
export const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* `useAgenda` marque chaque evenement de son calendrier sous `_cal` — et non
 * `calendar`. Lire le mauvais nom ne plantait rien : la teinte retombait sur la
 * meme pour tous, et le nom du calendrier sortait VIDE. Un defaut silencieux,
 * exactement ceux qui durent. */
export const calDe = (e) => (e && (e._cal || e.calendar)) || null;

/* Le nom se demande par l'ID, pas par un evenement : un agenda VIDE n'en a
 * aucun a presenter, et il doit quand meme se nommer dans la liste. */
export function nomDuCalendrier(id, hass) {
  const et = id && hass && hass.states ? hass.states[id] : null;
  return (et && et.attributes && et.attributes.friendly_name) || (id ? String(id).split('.').pop().replace(/_/g, ' ') : '');
}
function nomCalendrier(e, hass) {
  return nomDuCalendrier(calDe(e), hass);
}

/** Les agendas de la MAISON, dans l'ordre des noms. */
export function calendriersDeLaMaison(hass) {
  const S = (hass && hass.states) || null;
  if (!S) return [];
  return Object.keys(S).filter(id => id.indexOf('calendar.') === 0);
}

/** Un événement, tel que la carte et la feuille le lisent. */
export function lire(e, hass) {
  const d = debutDe(e);
  const f = finDe(e);
  const journee = !!(e.start && e.start.date && !e.start.dateTime);
  const mins = (d && f) ? Math.max(0, Math.round((f - d) / 60000)) : 0;
  return {
    cle: (e.uid || e.summary || '') + '|' + (d ? d.getTime() : 0),
    uid: e.uid || null,
    calId: calDe(e),
    titre: e.summary || tr('Sans titre'),
    debut: d,
    fin: f,
    journee,
    heure: journee ? tr('Jour') : (d ? hhmm(d) : ''),
    plage: journee ? tr('Toute la journée') : (d && f ? hhmm(d) + ' – ' + hhmm(f) : ''),
    duree: journee ? '' : (mins >= 60 ? Math.floor(mins / 60) + ' h' + (mins % 60 ? ' ' + (mins % 60) : '') : mins + ' min'),
    calendrier: nomCalendrier(e, hass),
    rgb: teinteAgenda(calDe(e)),
  };
}

/* ════════════ LA CARTE DU RAIL (1a / 2a) ════════════ */

export function CarteAgenda({ hass = null, evenements = null, jourChoisi = null, onChoisirJour = null, onOuvrir = null, lever = null }) {
  const evts = Array.isArray(evenements) ? evenements : [];
  const base = useMemo(() => new Date(new Date().toDateString()), []);
  const jours = useMemo(() => joursAgenda(base), [base]);
  const compte = useMemo(() => comptesParJour(evts, jours), [evts, jours]);
  /* La carte ne montre que sept jours : un jour choisi AILLEURS — la feuille
   * défile, elle, de semaine en semaine — la ramène à aujourd'hui. `choisi` se
   * relit alors sur le jour retenu, sinon la bande ne marquait plus rien
   * pendant que le contenu parlait d'un autre jour. */
  const jourSel = jours.find(j => cleJour(j) === (jourChoisi || cleJour(base))) || jours[0];
  const choisi = cleJour(jourSel);
  const duJour = useMemo(() => evenementsDuJour(evts, jourSel).map(e => lire(e, hass)), [evts, jourSel, hass]);

  const titreJour = majuscule(jourSel.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }));
  const MONTRES = 2;
  const reste = Math.max(0, duJour.length - MONTRES);

  return (
    <div style={{ ...CARTE_RAIL, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{tr('Agenda')}</div>
          <div style={{ fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 14, fontWeight: 500, color: 'var(--o-text2)', marginTop: 2 }}>{titreJour}</div>
        </div>
        {/* Le prochain lever ou coucher, s'il y a un `sun.sun` : rien sans source. */}
        {lever && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 10, background: 'rgba(var(--o-gold-rgb),.12)', flexShrink: 0 }}>
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--o-gold)' }} />
            <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--o-gold)', fontVariantNumeric: 'tabular-nums' }}>{lever}</span>
          </div>
        )}
        <button type="button" onClick={onOuvrir} aria-label={tr('Ouvrir l’agenda')}
          style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: 'var(--o-s1)', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Fi i="expand" size={13} />
        </button>
      </div>

      <BandeJours jours={jours} compte={compte} choisi={choisi} onChoisir={onChoisirJour} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {duJour.slice(0, MONTRES).map(e => <LigneEvenement key={e.cle} e={e} onClick={onOuvrir} />)}
        {reste > 0 && (
          <button type="button" onClick={onOuvrir}
            style={{ minHeight: 36, border: 'none', background: 'none', color: 'var(--o-accent-soft)', font: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
            {trN(reste, '+{n} autre ce jour-là', '+{n} autres ce jour-là')}
          </button>
        )}
        {!duJour.length && (
          <div style={{ padding: 12, borderRadius: 12, background: 'var(--o-s2)', fontSize: 12.5, color: 'var(--o-text2)' }}>{tr('Rien de prévu ce jour-là.')}</div>
        )}
      </div>
    </div>
  );
}

/** La bande des sept jours : le jour choisi se marque, et chacun porte son point. */
export function BandeJours({ jours, compte, choisi, onChoisir, grand = false }) {
  const auj = cleJour(new Date());
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 4 }}>
      {jours.map(j => {
        const k = cleJour(j);
        const sel = k === choisi;
        const cejour = k === auj;
        const n = compte[k] || 0;
        const dow = j.toLocaleDateString(locale(), { weekday: 'short' }).replace('.', '').slice(0, 3);
        return (
          /* Son nom COMMENCE par ce qu'il affiche, « dim 4 », puis la date en
           * entier (lot 13 de l'audit du 03/10). « dimanche 4 octobre » seul ne
           * contenait pas « dim 4 » : qui pilote à la voix dit ce qu'il voit, et
           * le bouton ne répondait pas (WCAG 2.5.3). */
          <button key={k} type="button" onClick={onChoisir ? () => onChoisir(k) : undefined}
            aria-pressed={sel} aria-label={nomCarte(dow + ' ' + j.getDate(), j.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }))}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: grand ? '8px 0 6px' : '7px 0 6px',
              borderRadius: grand ? 14 : 12,
              /* Le jour CHOISI se remplit d'accent, comme toute puce choisie de
               * Loggia ; AUJOURD'HUI, s'il n'est pas choisi, se contente d'un
               * liseré — deux repères différents ne doivent pas se ressembler. */
              border: (!sel && cejour) ? '1px solid var(--o-accent-soft)' : '1px solid transparent',
              background: sel ? 'var(--o-accent-fond)' : 'var(--o-s2)',
              color: sel ? '#fff' : 'var(--o-text1)', font: 'inherit', cursor: onChoisir ? 'pointer' : 'default' }}>
            {/* 11 px, sans voile (lot 7 de l'audit du 28/10, V4) : à 9 px et 80 % d'opacité, « mer » tombait à 3,69:1. Le jour
              * reste plus discret que la date par sa couleur, `--o-text2`, que la garde de contraste tient lisible. */}
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: sel ? 'inherit' : 'var(--o-text2)' }}>{dow}</span>
            <span style={{ fontSize: grand ? 18 : 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{j.getDate()}</span>
            <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: '50%', background: n ? (sel ? '#fff' : 'var(--o-accent-soft)') : 'transparent' }} />
          </button>
        );
      })}
    </div>
  );
}

/* ──────────── La ligne d'un evenement (la carte et la feuille) ──────────── */

/**
 * UN evenement : son heure a gauche, son titre et sa plage dans sa couleur.
 *
 * Le meme dessin servait a deux endroits, recopie — le widget du rail et la
 * carte d'un jour. Il en sert trois depuis que le telephone liste sa semaine.
 */
export function LigneEvenement({ e, onClick = null }) {
  const corps = (
    <>
      <div style={{ width: 42, flexShrink: 0, paddingTop: 9, fontSize: 11.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--o-text1)' }}>{e.heure}</div>
      <div style={{ flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: 12, background: 'rgba(' + e.rgb + ',.16)', border: '1px solid rgba(' + e.rgb + ',.28)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.titre}</div>
        <div style={{ fontSize: 11, color: 'var(--o-text2)', marginTop: 2 }}>{e.plage}{e.calendrier ? ' · ' + e.calendrier : ''}</div>
      </div>
    </>
  );
  const style = { display: 'flex', alignItems: 'stretch', gap: 10, padding: 0, border: 'none', background: 'none', font: 'inherit', color: 'inherit', textAlign: 'left' };
  return onClick
    ? <button type="button" onClick={onClick} style={{ ...style, cursor: 'pointer' }}>{corps}</button>
    : <div style={style}>{corps}</div>;
}

