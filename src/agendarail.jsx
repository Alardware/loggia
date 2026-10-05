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
 */
import { useState, useMemo, useEffect } from 'react';
import { tr, trN, locale, comparerTextes } from './i18n.js';
import { BottomSheet, Fi, CroixFeuille, NomFeuille, nomCarte } from './ui.jsx';
import { cleJour, jourDeCle, moisPlus, joursAgenda, comptesParJour, evenementsDuJour, debutDe, finDe } from './agenda.js';
import { peut } from './actions.js';
import { NouvelEvenement } from './formevenement.jsx';
import { CARTE_RAIL } from './styles.js';

/* La couleur d'un calendrier. Home Assistant n'en donne aucune : on en dérive
 * une, STABLE, du nom de l'entité — le même agenda garde sa teinte d'une
 * session à l'autre, ce qu'un tirage au sort ne ferait pas. */
const TEINTES = ['79,140,255', '142,110,255', '46,196,136', '236,98,140', '255,166,60', '64,196,214'];
function teinteAgenda(id) {
  const s = String(id || '');
  let n = 0;
  for (let i = 0; i < s.length; i += 1) n = (n * 31 + s.charCodeAt(i)) % 9973;
  return TEINTES[n % TEINTES.length];
}

const hhmm = (d) => d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* `useAgenda` marque chaque evenement de son calendrier sous `_cal` — et non
 * `calendar`. Lire le mauvais nom ne plantait rien : la teinte retombait sur la
 * meme pour tous, et le nom du calendrier sortait VIDE. Un defaut silencieux,
 * exactement ceux qui durent. */
const calDe = (e) => (e && (e._cal || e.calendar)) || null;

function nomCalendrier(e, hass) {
  const id = calDe(e);
  const et = id && hass && hass.states ? hass.states[id] : null;
  return (et && et.attributes && et.attributes.friendly_name) || (id ? String(id).split('.').pop().replace(/_/g, ' ') : '');
}

/** Un événement, tel que la carte et la feuille le lisent. */
function lire(e, hass) {
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
          <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 14, fontWeight: 500, color: 'var(--o-text2)', marginTop: 2 }}>{titreJour}</div>
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
        {duJour.slice(0, MONTRES).map(e => (
          <button key={e.cle} type="button" onClick={onOuvrir}
            style={{ display: 'flex', alignItems: 'stretch', gap: 10, padding: 0, border: 'none', background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ width: 42, flexShrink: 0, paddingTop: 9, fontSize: 11.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--o-text1)' }}>{e.heure}</div>
            <div style={{ flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: 12, background: 'rgba(' + e.rgb + ',.16)', border: '1px solid rgba(' + e.rgb + ',.28)' }}>
              <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.titre}</div>
              <div style={{ fontSize: 11, color: 'var(--o-text2)', marginTop: 2 }}>{e.plage}{e.calendrier ? ' · ' + e.calendrier : ''}</div>
            </div>
          </button>
        ))}
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
function BandeJours({ jours, compte, choisi, onChoisir, grand = false }) {
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
            <span style={{ fontSize: grand ? 9.5 : 9, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', opacity: .8 }}>{dow}</span>
            <span style={{ fontSize: grand ? 18 : 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{j.getDate()}</span>
            <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: '50%', background: n ? (sel ? '#fff' : 'var(--o-accent-soft)') : 'transparent' }} />
          </button>
        );
      })}
    </div>
  );
}

/* ════════════ LA FEUILLE ════════════ */

const H0 = 6;          // la journée montrée commence à 6 h
const H1 = 23;         // et finit à 23 h
const PAS_H = 48;      // hauteur d'une heure, en pixels

const lundiDe = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; };
const ajoute = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export function FeuilleAgenda({ hass = null, evenements = null, jourChoisi = null, onChoisirJour = null, onClose = null, large = false, onPlage = null }) {
  const evts = Array.isArray(evenements) ? evenements : [];
  const base = useMemo(() => new Date(new Date().toDateString()), []);
  const choisi = jourChoisi || cleJour(base);
  /* La feuille RELIT la clé au lieu de la chercher dans les sept jours du rail.
   * Avec `find`, toute date hors de ces sept jours retombait sur aujourd'hui :
   * les flèches changeaient bien la clé, le rendu suivant la refusait, et plus
   * rien ne défilait — « je ne peux pas faire défiler les jours et mois avec
   * les flèches ». La clé s'écrit `année-mois-jour`, le mois comptant de 0
   * (`cleJour`) ; une clé illisible ramène à aujourd'hui. */
  const jourSel = useMemo(() => jourDeCle(choisi) || base, [base, choisi]);

  /* Les agendas de la maison, avec leur compte et leur teinte. La case à cocher
   * les éteint à l'écran — elle ne touche à rien chez Home Assistant. */
  const cals = useMemo(() => {
    const m = new Map();
    for (const e of evts) {
      const id = calDe(e) || '';
      if (!m.has(id)) m.set(id, { id, nom: nomCalendrier(e, hass), rgb: teinteAgenda(id), n: 0 });
      m.get(id).n += 1;
    }
    return [...m.values()].sort((a, b) => comparerTextes(a.nom, b.nom));
  }, [evts, hass]);
  const [eteints, setEteints] = useState(() => new Set());
  const basculer = (id) => setEteints(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const visibles = useMemo(() => evts.filter(e => !eteints.has(calDe(e) || '')), [evts, eteints]);

  const [vue, setVue] = useState('semaine');
  /* La vue MOIS demande sa propre plage. Le rail n'en charge que sept jours —
   * c'est tout ce que sa carte montre — et le mois ressortait donc presque
   * vide : « ici il n'y a pas le texte ». On demande le mois entier, et on
   * rend la plage courte en repartant. */
  /* La plage se calcule DEHORS : une expression dans un tableau de dépendances
   * se recalcule à chaque rendu sans que React puisse la comparer. */
  const plageMois = useMemo(() => {
    const d = new Date(jourSel.getFullYear(), jourSel.getMonth(), 1);
    const f = new Date(jourSel.getFullYear(), jourSel.getMonth() + 1, 1);
    d.setDate(d.getDate() - 7);
    f.setDate(f.getDate() + 7);
    return { debut: d, fin: f };
  }, [jourSel]);
  useEffect(() => {
    if (!onPlage) return undefined;
    if (vue !== 'mois') { onPlage(null); return undefined; }
    onPlage(plageMois);
    return () => onPlage(null);
  }, [vue, plageMois, onPlage]);
  const [ouvert, setOuvert] = useState(null);           // l'événement dont la fiche est ouverte
  const [nouveau, setNouveau] = useState(false);
  /* Les agendas qui acceptent qu'on y écrive. Un flux d'anniversaires ou un
   * abonnement iCal n'a pas de quoi : sans ce filtre, le bouton ouvrirait un
   * formulaire condamné d'avance. */
  const ecrivables = useMemo(() => cals.map(c => c.id).filter(id => peut(hass, id, 'creer_evenement')), [cals, hass]);

  const allerA = (k) => { if (onChoisirJour) onChoisirJour(k); setOuvert(null); };
  /* Un mois se franchit en MOIS, pas en trente jours : depuis le 31 janvier,
   * trente jours tombent le 2 mars et février serait sauté. Le jour du mois se
   * ramène au dernier existant — du 31 mars au 28 février, pas au 3 mars. */
  const bouger = (sens) => allerA(cleJour(vue === 'mois' ? moisPlus(jourSel, sens) : ajoute(jourSel, sens * (vue === 'jour' ? 1 : 7))));

  const commun = { hass, evts: visibles, jourSel, choisi, allerA, vue, setVue, bouger, cals, eteints, basculer,
    ouvert, setOuvert, onClose, ecrivables, nouveau, setNouveau };
  return large ? <FeuilleLarge {...commun} /> : <FeuilleEtroite {...commun} />;
}

/* ──────────── La feuille d'ORDINATEUR (1b) : deux colonnes ──────────── */

function FeuilleLarge({ hass, evts, jourSel, allerA, vue, setVue, bouger, cals, eteints, basculer, ouvert, setOuvert, onClose, ecrivables, nouveau, setNouveau }) {
  const lundi = lundiDe(jourSel);
  const colonnes = vue === 'jour' ? [jourSel] : Array.from({ length: 7 }, (_, i) => ajoute(lundi, i));
  const titre = vue === 'mois'
    ? majuscule(jourSel.toLocaleDateString(locale(), { month: 'long', year: 'numeric' }))
    : vue === 'jour'
      ? majuscule(jourSel.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }))
      : ajoute(lundi, 0).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) + ' – ' + ajoute(lundi, 6).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });

  return (
    <BottomSheet large onClose={onClose}>
      {() => (
        <div style={{ display: 'grid', gridTemplateColumns: '248px minmax(0,1fr)', gap: 0, margin: '0 -8px' }}>
          <aside style={{ padding: '4px 16px 10px 8px', borderRight: '1px solid var(--o-bd2)', display: 'flex', flexDirection: 'column', gap: 22 }}>
            <MiniMois jourSel={jourSel} evts={evts} onChoisir={allerA} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--o-text3)', padding: '0 4px 6px' }}>{tr('Mes agendas')}</div>
              {cals.map(c => {
                const on = !eteints.has(c.id);
                return (
                  <button key={c.id} type="button" onClick={() => basculer(c.id)} aria-pressed={on}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 36, padding: '0 6px', borderRadius: 10, border: 'none', background: 'none', color: 'var(--o-text1)', font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                    <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid rgba(' + c.rgb + ',1)', background: on ? 'rgba(' + c.rgb + ',1)' : 'transparent', color: '#fff' }}>
                      {on && <Fi i="check" size={9} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: on ? 1 : .5 }}>{c.nom}</span>
                    <span style={{ fontSize: 11, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums' }}>{c.n}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <NomFeuille>
              <EnTete titre={titre} vue={vue} setVue={setVue} bouger={bouger} allerA={allerA} large croix={<CroixFeuille />}
                onNouveau={ecrivables.length ? () => setNouveau(true) : null} />
            </NomFeuille>
            {nouveau && (
              <NouvelEvenement hass={hass} cals={ecrivables} jour={jourSel}
                onClose={() => setNouveau(false)} onFait={() => setNouveau(false)} />
            )}
            {/* Une HAUTEUR FIXE, quelle que soit la vue : « quand je passe en
              * mois ça change la taille, la taille ne doit pas changer ». La
              * semaine défile dans sa zone, le mois tient dans la sienne — et
              * la feuille, elle, ne bouge plus. */}
            <div style={{ height: 596, overflowY: 'auto' }}>
              {vue === 'mois'
                ? <GrilleMois jourSel={jourSel} evts={evts} hass={hass} onChoisir={allerA} />
                : <GrilleHeures colonnes={colonnes} evts={evts} hass={hass} ouvert={ouvert} setOuvert={setOuvert} onChoisir={allerA} jourSel={jourSel} />}
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

/* ──────────── La feuille de TÉLÉPHONE (2b) : une colonne ──────────── */

function FeuilleEtroite({ hass, evts, jourSel, choisi, allerA, vue, setVue, bouger, onClose, ecrivables, nouveau, setNouveau }) {
  /* La bande suit le jour CHOISI, comme les sept colonnes de l'ordinateur.
   * Figée sur les sept jours à partir d'aujourd'hui, elle ne bougeait pas d'un
   * pouce quand on avançait d'une semaine, et le titre non plus — « je ne peux
   * pas faire défiler les jours et mois avec les flèches ». */
  const lundi = useMemo(() => lundiDe(jourSel), [jourSel]);
  const jours = useMemo(() => Array.from({ length: 7 }, (_, i) => ajoute(lundi, i)), [lundi]);
  const compte = useMemo(() => comptesParJour(evts, jours), [evts, jours]);
  const duJour = useMemo(() => evenementsDuJour(evts, jourSel).map(e => lire(e, hass)), [evts, jourSel, hass]);
  /* Le titre dit ce que la vue montre : le mois, ou la semaine affichée. */
  const titre = vue === 'mois'
    ? majuscule(jourSel.toLocaleDateString(locale(), { month: 'long', year: 'numeric' }))
    : ajoute(lundi, 0).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) + ' – ' + ajoute(lundi, 6).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });

  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <NomFeuille>
          <EnTete titre={titre} vue={vue} setVue={setVue} bouger={bouger} allerA={allerA} croix={<CroixFeuille />}
            onNouveau={ecrivables.length ? () => setNouveau(true) : null} />
        </NomFeuille>
        {nouveau && (
          <NouvelEvenement hass={hass} cals={ecrivables} jour={jourSel}
            onClose={() => setNouveau(false)} onFait={() => setNouveau(false)} />
        )}
        <div style={{ height: '58vh', overflowY: 'auto' }}>
        {vue === 'mois'
          ? <GrilleMois jourSel={jourSel} evts={evts} hass={hass} onChoisir={allerA} compacte />
          : (<>
            <BandeJours jours={jours} compte={compte} choisi={choisi} onChoisir={allerA} grand />
            <div style={{ padding: '16px 2px 8px', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--o-text3)' }}>
              {majuscule(jourSel.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }))} · {duJour.length ? trN(duJour.length, '{n} événement', '{n} événements') : tr('rien')}
            </div>
            <GrilleHeures colonnes={[jourSel]} evts={evts} hass={hass} ouvert={null} setOuvert={null} onChoisir={allerA} jourSel={jourSel} compacte />
          </>)}
        </div>
      </>)}
    </BottomSheet>
  );
}

/* ──────────── Les morceaux communs ──────────── */

/* La croix arrive en PROPRIETE, et non depuis l'interieur : le controle des
 * feuilles la cherche litteralement dans le bloc de chaque `BottomSheet`,
 * et il a raison de ne pas voir a travers un composant. Le NOM suit le meme
 * chemin (audit du 03/10) : `NomFeuille`, pose autour de l'en-tete dans ce
 * bloc, lui passe l'id de la feuille en `id`, et le titre le porte. */
function EnTete({ titre, vue, setVue, bouger, allerA, large = false, croix = null, onNouveau = null, id: idTitre = null }) {
  const rond = (n) => ({ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'var(--o-s1)', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: n });
  const VUES = large ? [['mois', tr('Mois')], ['semaine', tr('Semaine')], ['jour', tr('Jour')]] : [['semaine', tr('Semaine')], ['mois', tr('Mois')]];

  const titreDOM = (
    <div id={idTitre || undefined} style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: large ? 30 : 26, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{titre}</div>
  );
  const aujourdhui = (
    <button type="button" onClick={() => allerA(cleJour(new Date()))}
      style={{ height: 28, padding: '0 11px', borderRadius: 999, border: 'none', background: 'rgba(var(--o-accent-rgb),.18)', color: 'var(--o-accent-soft)', font: 'inherit', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{tr('Aujourd’hui')}</button>
  );
  const fleches = (
    <>
      <button type="button" onClick={() => bouger(-1)} aria-label={tr('Précédent')} style={rond(0)}><Fi i="angle-left" size={15} /></button>
      <button type="button" onClick={() => bouger(1)} aria-label={tr('Suivant')} style={rond(0)}><Fi i="angle-right" size={15} /></button>
    </>
  );
  /* Au TÉLÉPHONE le groupe prend la place qui reste et ses deux puces la
   * partagent : « Settimana » et « Miesiąc » sont bien plus longs que
   * « Semaine », et une largeur figée déborderait sur un écran de 320 px. */
  const vues = (
    <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 12, background: 'var(--o-s2)', flexShrink: large ? 0 : 1, flexGrow: large ? 0 : 1, minWidth: 0 }}>
      {VUES.map(([id, nom]) => (
        <button key={id} type="button" onClick={() => setVue(id)} aria-pressed={vue === id}
          style={{ height: 32, padding: large ? '0 14px' : '0 10px', borderRadius: 10, border: 'none', background: vue === id ? 'var(--o-accent-fond)' : 'transparent', color: vue === id ? '#fff' : 'var(--o-text1)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flex: large ? '0 0 auto' : '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</button>
      ))}
    </div>
  );
  /* « + Événement » n'apparaît que s'il existe un agenda OÙ ÉCRIRE : un flux
   * d'anniversaires ou un abonnement iCal n'accepte rien, et le bouton
   * ouvrirait un formulaire condamné d'avance. */
  /* Au TÉLÉPHONE, le mot ne tient pas : flèches, vues et bouton demandent 373 px
   * sur les 344 d'une feuille de 390, et cassent plus bas encore. Le bouton s'y
   * réduit donc à son « + » en accent plein, son nom porté par `aria-label`. */
  const nouveau = onNouveau ? (
    <button type="button" onClick={onNouveau} aria-label={tr('Nouvel événement')}
      style={{ height: 36, width: large ? undefined : 36, padding: large ? '0 14px' : 0, borderRadius: large ? 12 : '50%', border: 'none', background: 'var(--o-accent)', color: '#fff', font: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, whiteSpace: 'nowrap', flexShrink: 0 }}>
      <Fi i="plus" size={large ? 12 : 14} />{large ? tr('Événement') : null}
    </button>
  ) : null;

  /* TÉLÉPHONE : deux rangées, jamais un repli au petit bonheur. Sur 390 px,
   * tout sur une ligne renvoyait la flèche « suivant » en tête de la deuxième
   * et la croix seule sur une troisième — « rien à faire glisser », et la
   * croix reste en dernier sur la ligne d'en-tête (celle du titre). */
  if (!large) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 0 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {titreDOM}
          {aujourdhui}
          <div style={{ flex: 1 }} />
          {croix}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {fleches}
          <div style={{ flex: 1 }} />
          {vues}
          {nouveau}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px 14px 18px', flexWrap: 'nowrap' }}>
      {titreDOM}
      {aujourdhui}
      {fleches}
      <div style={{ flex: 1 }} />
      {vues}
      {nouveau}
      {croix}
    </div>
  );
}

/** Le mini-mois de la colonne de gauche. */
function MiniMois({ jourSel, evts, onChoisir }) {
  const jours = useMemo(() => joursAgenda(new Date(new Date().toDateString())), []);
  const connus = useMemo(() => new Set(jours.map(cleJour)), [jours]);
  const compte = useMemo(() => comptesParJour(evts, jours), [evts, jours]);
  const premier = new Date(jourSel.getFullYear(), jourSel.getMonth(), 1);
  const decalage = (premier.getDay() + 6) % 7;
  const auj = cleJour(new Date());
  const sel = cleJour(jourSel);
  const entetes = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'narrow' }));
  return (
    <div style={{ padding: 12, borderRadius: 16, background: 'var(--o-s2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 2px 10px' }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 800 }}>{majuscule(jourSel.toLocaleDateString(locale(), { month: 'long', year: 'numeric' }))}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 2, textAlign: 'center' }}>
        {entetes.map((l, i) => <span key={'e' + i} style={{ fontSize: 10, fontWeight: 800, color: 'var(--o-text3)', paddingBottom: 4 }}>{l}</span>)}
        {Array.from({ length: 42 }, (_, i) => new Date(premier.getFullYear(), premier.getMonth(), 1 - decalage + i)).map(d => {
          const k = cleJour(d);
          const dehors = d.getMonth() !== jourSel.getMonth();
          const estSel = k === sel;
          return (
            <button key={k} type="button" onClick={() => onChoisir(k)}
              style={{ height: 28, borderRadius: 9, border: (!estSel && k === auj) ? '1px solid var(--o-accent-soft)' : '1px solid transparent',
                background: estSel ? 'var(--o-accent-fond)' : 'transparent', color: estSel ? '#fff' : 'var(--o-text1)',
                font: 'inherit', fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', cursor: 'pointer', opacity: dehors ? .38 : 1,
                position: 'relative' }}>
              {d.getDate()}
              {connus.has(k) && (compte[k] || 0) > 0 && !estSel && (
                <span aria-hidden="true" style={{ position: 'absolute', left: '50%', bottom: 2, transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: '50%', background: 'var(--o-accent-soft)' }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** La grille des heures : une colonne par jour, les événements à leur place. */
function GrilleHeures({ colonnes, evts, hass, ouvert, setOuvert, onChoisir, jourSel = null, compacte = false }) {
  const heures = Array.from({ length: H1 - H0 + 1 }, (_, i) => H0 + i);
  const haut = (d) => (d ? Math.max(0, (Math.min(H1, Math.max(H0, d.getHours() + d.getMinutes() / 60)) - H0) * PAS_H) : 0);
  const maintenant = new Date();
  const auj = cleJour(maintenant);
  const cols = 'repeat(' + colonnes.length + ',minmax(0,1fr))';

  return (
    <>
      {!compacte && (
        <div style={{ display: 'grid', gridTemplateColumns: '56px ' + cols, gap: 6, padding: '0 18px 10px' }}>
          <div />
          {colonnes.map(d => {
            const k = cleJour(d);
            const sel = !!jourSel && k === cleJour(jourSel);
            const cejour = k === auj;
            return (
              <button key={k} type="button" onClick={() => onChoisir(k)}
                style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '10px 12px', borderRadius: 14,
                  /* Meme couple de reperes que la bande des jours : le jour CHOISI
                   * se remplit d'accent, aujourd'hui se contente d'un lisere. */
                  border: (!sel && cejour) ? '1px solid var(--o-accent-soft)' : '1px solid transparent',
                  background: sel ? 'var(--o-accent-fond)' : 'var(--o-s2)', color: sel ? '#fff' : 'var(--o-text1)', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 12, fontWeight: 700, opacity: .85 }}>{majuscule(d.toLocaleDateString(locale(), { weekday: 'short' }).replace('.', ''))}</span>
                <span style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em' }}>{d.getDate()}</span>
              </button>
            );
          })}
        </div>
      )}
      <div style={{ borderTop: '1px solid var(--o-bd2)' }}>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '56px ' + cols, gap: 6, padding: compacte ? '10px 2px 0' : '10px 18px 0', height: (H1 - H0) * PAS_H + 30 }}>
          <div style={{ position: 'relative' }}>
            {heures.map(h => (
              <span key={h} style={{ position: 'absolute', right: 8, top: (h - H0) * PAS_H, transform: 'translateY(-50%)', fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums' }}>{String(h).padStart(2, '0')}:00</span>
            ))}
          </div>
          {colonnes.map(d => {
            const k = cleJour(d);
            const duJour = evenementsDuJour(evts, d).map(e => lire(e, hass));
            return (
              <div key={k} style={{ position: 'relative', background: k === auj ? 'rgba(var(--o-accent-rgb),.045)' : 'transparent', borderRadius: 12 }}>
                {heures.map(h => (
                  <div key={h} aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: (h - H0) * PAS_H, borderTop: '1px solid var(--o-bd3)' }} />
                ))}
                {duJour.map(e => {
                  const y = e.journee ? 0 : haut(e.debut);
                  const h = e.journee ? 36 : Math.max(30, haut(e.fin) - y);
                  const estOuvert = !!(ouvert && ouvert.cle === e.cle);
                  return (
                    <div key={e.cle} style={{ position: 'absolute', left: 3, right: 3, top: y, height: h }}>
                      <button type="button" onClick={setOuvert ? () => setOuvert(estOuvert ? null : e) : undefined}
                        style={{ width: '100%', height: '100%', padding: '7px 9px', borderRadius: 12, border: '1px solid rgba(' + e.rgb + ',.3)', background: 'rgba(' + e.rgb + ',.18)', color: 'var(--o-text)', font: 'inherit', textAlign: 'left', cursor: setOuvert ? 'pointer' : 'default', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 2, boxSizing: 'border-box' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.titre}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--o-text2)', fontVariantNumeric: 'tabular-nums' }}>{e.plage}</span>
                      </button>
                      {estOuvert && <FicheEvenement e={e} hass={hass} onFermer={() => setOuvert(null)} />}
                    </div>
                  );
                })}
                {k === auj && maintenant.getHours() >= H0 && maintenant.getHours() <= H1 && (
                  <div aria-hidden="true" style={{ position: 'absolute', left: -3, right: 0, top: haut(maintenant), height: 2, background: 'var(--o-bad)', pointerEvents: 'none', zIndex: 4 }}>
                    <span style={{ position: 'absolute', left: -4, top: -4, width: 10, height: 10, borderRadius: '50%', background: 'var(--o-bad)' }} />
                  </div>
                )}
                {!duJour.length && colonnes.length === 1 && (
                  <div style={{ position: 'absolute', left: 3, right: 3, top: 12, padding: 14, borderRadius: 12, background: 'var(--o-s2)', fontSize: 12.5, color: 'var(--o-text2)' }}>{tr('Rien de prévu ce jour-là.')}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** La fiche d'un événement, posée à côté de lui. */
function FicheEvenement({ e, hass, onFermer }) {
  const jourLong = e.debut ? majuscule(e.debut.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })) : '';
  const peutSupprimer = peut(hass, e.calId, 'supprimer_evenement') && e.uid;
  const supprimer = () => {
    if (!hass || !hass.callWS) return;
    hass.callWS({ type: 'calendar/event/delete', entity_id: e.calId, uid: e.uid }).catch(() => { /* le serveur dira non */ });
    onFermer();
  };
  const ligne = (icone, texte) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Fi i={icone} size={13} color="var(--o-text3)" />{texte}</div>
  );
  return (
    <div style={{ position: 'absolute', zIndex: 6, width: 280, top: 0, left: '100%', marginLeft: 8, padding: 16, borderRadius: 18, background: 'var(--o-bg2)', border: '1px solid var(--o-bd1)', boxShadow: 'var(--o-shadow-hover)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>{e.titre}</div>
        <button type="button" onClick={onFermer} aria-label={tr('Fermer')}
          style={{ width: 28, height: 28, borderRadius: 9, border: 'none', background: 'var(--o-s1)', color: 'var(--o-text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i="cross-small" size={13} /></button>
      </div>
      <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'rgba(' + e.rgb + ',.16)', color: 'rgba(' + e.rgb + ',1)', fontSize: 11, fontWeight: 800 }}>
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />{e.calendrier}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: 'var(--o-text1)' }}>
        {ligne('calendar', jourLong)}
        {ligne('clock', e.plage + (e.duree ? ' · ' + e.duree : ''))}
      </div>
      {/* Supprimer n'apparaît que si le calendrier le DÉCLARE. Un bouton qui ne
        * peut pas agir vaut moins que pas de bouton. */}
      {peutSupprimer && (
        <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
          <button type="button" onClick={supprimer} aria-label={tr('Supprimer')}
            style={{ width: 36, height: 36, borderRadius: 12, border: 'none', background: 'rgba(var(--o-bad-rgb),.12)', color: 'var(--o-bad)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i="trash" size={12} /></button>
        </div>
      )}
    </div>
  );
}

/** Le mois en grille, avec ses pastilles d'événements. */
function GrilleMois({ jourSel, evts, hass, onChoisir, compacte = false }) {
  const premier = new Date(jourSel.getFullYear(), jourSel.getMonth(), 1);
  const decalage = (premier.getDay() + 6) % 7;
  const auj = cleJour(new Date());
  const sel = cleJour(jourSel);
  const entetes = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: compacte ? 'narrow' : 'short' }));
  const cases = Array.from({ length: 42 }, (_, i) => new Date(premier.getFullYear(), premier.getMonth(), 1 - decalage + i));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: compacte ? '4px 2px' : 6, padding: compacte ? 0 : '0 18px 18px', textAlign: compacte ? 'center' : 'left' }}>
      {entetes.map((l, i) => (
        <span key={'e' + i} style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--o-text3)', padding: compacte ? 0 : '0 6px 4px' }}>{majuscule(l.replace('.', ''))}</span>
      ))}
      {cases.map(d => {
        const k = cleJour(d);
        const dehors = d.getMonth() !== jourSel.getMonth();
        const estSel = k === sel;
        const duJour = evenementsDuJour(evts, d).map(e => lire(e, hass));
        const MONTRES = compacte ? 0 : 2;
        if (compacte) {
          return (
            <button key={k} type="button" onClick={() => onChoisir(k)}
              style={{ height: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, border: 'none', background: 'none', font: 'inherit', cursor: 'pointer', opacity: dehors ? .38 : 1 }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                border: (!estSel && k === auj) ? '1px solid var(--o-accent-soft)' : '1px solid transparent',
                background: estSel ? 'var(--o-accent-fond)' : 'transparent', color: estSel ? '#fff' : 'var(--o-text1)', fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{d.getDate()}</span>
              <span aria-hidden="true" style={{ display: 'flex', gap: 2, height: 4 }}>
                {duJour.slice(0, 3).map(e => <span key={e.cle} style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(' + e.rgb + ',1)' }} />)}
              </span>
            </button>
          );
        }
        return (
          <button key={k} type="button" onClick={() => onChoisir(k)}
            style={{ height: 104, padding: 8, borderRadius: 14,
              border: estSel ? '1px solid var(--o-accent-soft)' : '1px solid transparent',
              background: k === auj ? 'rgba(var(--o-accent-rgb),.08)' : 'var(--o-s2)',
              color: 'var(--o-text)', font: 'inherit', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden', opacity: dehors ? .38 : 1, boxSizing: 'border-box' }}>
            <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: k === auj ? 'var(--o-accent-soft)' : 'var(--o-text1)' }}>{d.getDate()}</span>
            {duJour.slice(0, MONTRES).map(e => (
              <span key={e.cle} style={{ display: 'block', padding: '3px 6px', borderRadius: 7, background: 'rgba(' + e.rgb + ',.18)', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', boxSizing: 'border-box' }}>{e.heure} {e.titre}</span>
            ))}
            {duJour.length > MONTRES && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)', paddingLeft: 4 }}>{trN(duJour.length - MONTRES, '+{n} autre', '+{n} autres')}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
