/* ── La feuille du Calendrier : le mois entier, et le choix des agendas ──────
 *
 * Ouverte par la carte du rail (`CvCalendrier`, App.jsx). Son propre module,
 * chargé à la demande (`lazyRecharge`, App.jsx) depuis l'audit des lumières
 * (19/10) : l'Accueil n'en montre que la carte, et le démarrage n'avait plus
 * la place de la porter (tests/lot14_chargement.test.mjs). Son code n'a pas
 * changé en passant ici : la coquille `FeuilleCalendrier` (App.jsx) garde la
 * feuille (`BottomSheet`) et la frontière Suspense, et lui passe `useAgenda`,
 * qui n'existe qu'à App.jsx — le rail de l'Accueil et la carte s'en servent
 * aussi — plutôt que d'importer App.jsx d'ici (aucun import circulaire).
 */
import { useState, useMemo, Suspense } from 'react';
import { lazyRecharge } from './recharge.js';
import { tr, locale } from './i18n.js';
import { Fi, CroixFeuille, NomFeuille } from './ui.jsx';
import { cfgVal, cfgSet, compteOrdinaire } from './state.js';
import { jourPlus, cleJour } from './agenda.js';
import { planAction as actionsPlan, runPlan, actionCtx, peut } from './actions.js';
// Le formulaire d'un rendez-vous, chargé quand on l'ouvre (le même morceau que celui du rail).
const NouvelEvenement = lazyRecharge(() => import('./formevenement.jsx').then(m => ({ default: m.NouvelEvenement })));

/* Le calendrier en grand : le mois entier, et le choix des agendas.
 *
 * La carte du rail dit la semaine ; elle ne peut pas dire le mois sans
 * devenir illisible. Le clic ouvre donc ce que la carte resume, avec la
 * meme grammaire — anneau sur les jours qui portent un rendez-vous, pastille
 * sur aujourd'hui — pour qu'on reconnaisse la semaine qu'on vient de voir.
 *
 * Le jour choisi montre ses evenements dessous. Un mois sans cela ne serait
 * qu'un almanach : on saurait QUE quelque chose arrive, jamais quoi.
 */
/* Créer un rendez-vous depuis le dashboard.
 *
 * Home Assistant sait le faire par `calendar.create_event`, mais seulement pour
 * les agendas qui le déclarent : un calendrier en lecture seule — un flux
 * d'anniversaires, un abonnement iCal — n'a pas le bit `CREATE_EVENT`. La liste
 * `cals` est donc filtrée par la capacité, en amont : mieux vaut ne pas montrer
 * le bouton que d'ouvrir un formulaire qui finira refusé.
 *
 * Le service prend la date par DEUX paires exclusives. Avec une heure,
 * `start_date_time` et `end_date_time` ; pour une journée entière, `start_date`
 * et `end_date`, cette dernière EXCLUSIVE — un rendez-vous d'un seul jour finit
 * le lendemain. C'est la convention iCalendar, et l'oublier fabrique un
 * événement de durée nulle que rien n'affiche.
 */

export default function FeuilleCalendrierContent({ hass, useAgenda }) {
  const S = (hass && hass.states) || {};
  const nbEntites = Object.keys(S).length;
  const tousCals = useMemo(() => Object.keys(S).filter(k => k.indexOf('calendar.') === 0).sort(), [nbEntites]);
  /* Les agendas retenus. Rien de choisi = tous : une maison qui n'a jamais
   * ouvert ce reglage doit voir son calendrier, pas un mois vide. */
  const [choisis, setChoisis] = useState(() => {
    const c = cfgVal('loggia_agendas', null);
    return Array.isArray(c) && c.length ? c.filter(x => typeof x === 'string') : null;
  });
  const [reglages, setReglages] = useState(false);
  const [nouveau, setNouveau] = useState(false);
  /* Incremente apres une creation : le sondage de l'agenda relit aussitot,
   * au lieu d'attendre son quart d'heure. */
  const [tick, setTick] = useState(0);
  const [edition, setEdition] = useState(null);
  /* L'uid du rendez-vous dont on demande confirmation avant d'effacer. Un
   * seul a la fois : deux confirmations ouvertes, c'est un clic de trop au
   * mauvais endroit. */
  const [confirme, setConfirme] = useState(null);
  const [errListe, setErrListe] = useState(null);
  const choisisSig = choisis ? choisis.join('|') : '';
  const calsSig = tousCals.join('|');
  const actifs = useMemo(() => {
    const l = (choisis || tousCals).filter(k => tousCals.indexOf(k) >= 0);
    return l.length ? l : tousCals;
  }, [choisisSig, calsSig]);

  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  const [ancre, setAncre] = useState(() => new Date(auj.getFullYear(), auj.getMonth(), 1));
  const [choisi, setChoisi] = useState(() => new Date(auj));

  /* La grille commence au LUNDI qui precede le 1er et tient six semaines :
   * un mois qui commence un dimanche en occupe six, et une grille qui change
   * de hauteur d'un mois a l'autre fait sauter tout ce qui est dessous. */
  const ancreMs = ancre.getTime();
  const debutGrille = useMemo(() => {
    const d = new Date(ancre); d.setDate(1 - ((ancre.getDay() + 6) % 7)); d.setHours(0, 0, 0, 0); return d;
  }, [ancreMs]);
  const debutMs = debutGrille.getTime();
  // Compté sur le calendrier (agenda.js, `jourPlus`) : six semaines de 24 h
  // finissaient à 23 h la veille dès que la grille passait l'heure d'hiver.
  const finGrille = useMemo(() => jourPlus(new Date(debutMs), 42), [debutMs]);
  const finMs = finGrille.getTime();
  const plage = useMemo(() => ({ debut: debutGrille, fin: finGrille }), [debutMs, finMs]);
  const events = useAgenda(hass, actifs, plage, tick);
  /* Les agendas qui acceptent qu'on y ecrive. Un flux d'anniversaires ou un
   * abonnement iCal n'a pas le bit `CREATE_EVENT` : sans ce filtre, le bouton
   * s'afficherait pour ouvrir un formulaire condamne d'avance. Calcule a
   * chaque rendu — il y a une poignee d'agendas, pas un millier. */
  const calsEcrivables = tousCals.filter(k => peut(hass, k, 'creer_evenement'));
  /* Le CHOIX des agendas reste aux administrateurs (03/10). Il ecrit
   * `loggia_agendas` — quels calendriers la maison montre : de la
   * configuration, pas de l'agencement — que `store.py` refuse a un compte
   * Home Assistant ordinaire. Lui proposer les cases, c'etait lui servir un
   * refus a chaque clic, et un choix qui revenait au rechargement : le geste
   * se masque. La LECTURE reste a tous, il voit les agendas retenus
   * (`actifs`). Seul un `false` explicite masque, comme dans la vue
   * Systeme : sans compte connu, le serveur tranchera. Le critere est celui
   * de tous les gestes masques (`compteOrdinaire`, state.js). */
  const ordinaire = compteOrdinaire(hass);

  /* Supprimer.
   *
   * `portee` vaut '' pour la seule occurrence — le defaut de Home Assistant —
   * ou 'THISANDFUTURE' pour celle-ci et les suivantes. `recurrence_id` ne part
   * que s'il existe : sur un rendez-vous unique il n'y en a pas, et l'envoyer
   * vide ferait echouer la commande. */
  const supprimer = async (e, portee) => {
    const options = {};
    if (e.recurrence_id) {
      options.recurrence_id = e.recurrence_id;
      if (portee) options.recurrence_range = portee;
    }
    const p = actionsPlan(e._cal, 'supprimer_evenement', e.uid, actionCtx(hass), options);
    if (!p.ok) { setErrListe(p.reason || tr('Home Assistant a refusé.')); return; }
    const r = await runPlan(hass, p);
    if (!r || !r.ok) { setErrListe((r && r.reason) ? String(r.reason) : tr('Home Assistant a refusé.')); return; }
    setConfirme(null); setErrListe(null); setTick(t => t + 1);
  };

  const dateDe = (e) => new Date(e.start.dateTime || (e.start.date + 'T00:00:00'));
  const parJour = useMemo(() => {
    const m = new Map();
    for (const e of events) { const k = cleJour(dateDe(e)); if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
    return m;
  }, [events]);

  const jours = useMemo(() => Array.from({ length: 42 }, (_, i) => jourPlus(new Date(debutMs), i)), [debutMs]);
  const duJour = parJour.get(cleJour(choisi)) || [];
  const moisAns = ancre.toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  const bougerMois = (n) => {
    const d = new Date(ancre.getFullYear(), ancre.getMonth() + n, 1);
    setAncre(d);
    // Le jour choisi suit le mois, sinon la liste du bas parlerait d'un jour
    // qui n'est plus a l'ecran.
    setChoisi(d.getFullYear() === auj.getFullYear() && d.getMonth() === auj.getMonth() ? new Date(auj) : d);
  };
  const basculer = (k) => {
    const base = choisis || tousCals;
    const suiv = base.indexOf(k) >= 0 ? base.filter(x => x !== k) : base.concat(k);
    // Tout decocher reviendrait a un mois vide sans rien dire : on garde au
    // moins celui qu'on vient de toucher.
    const val = suiv.length ? suiv : [k];
    setChoisis(val);
    cfgSet({ loggia_agendas: val.length === tousCals.length ? null : val });
  };
  const heureDe = (e) => e.start.dateTime
    ? dateDe(e).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
    : tr('journée');
  const nomCal = (id) => ((S[id] || {}).attributes || {}).friendly_name || id.replace('calendar.', '');

  const btnRond = { width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--o-s1)', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <NomFeuille><span style={{ flex: 1, fontSize: 17, fontWeight: 800, textTransform: 'capitalize', letterSpacing: '-.01em' }}>{moisAns}</span></NomFeuille>
        <button onClick={() => bougerMois(-1)} aria-label={tr('Mois précédent')} style={btnRond}><Fi i="angle-left" size={14} /></button>
        <button onClick={() => bougerMois(1)} aria-label={tr('Mois suivant')} style={btnRond}><Fi i="angle-right" size={14} /></button>
        {calsEcrivables.length > 0 && (
          <button onClick={() => { setNouveau(v => !v); setReglages(false); }} aria-label={tr('Nouvel événement')} aria-pressed={nouveau}
            style={{ ...btnRond, background: nouveau ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: nouveau ? '#fff' : 'var(--o-text1)' }}><Fi i="plus" size={14} /></button>
        )}
        {!ordinaire && tousCals.length > 1 && (
          <button onClick={() => { setReglages(v => !v); setNouveau(false); }} aria-label={tr('Choisir les agendas')} aria-pressed={reglages}
            style={{ ...btnRond, background: reglages ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: reglages ? '#fff' : 'var(--o-text1)' }}><Fi i="settings-sliders" size={14} /></button>
        )}
        <CroixFeuille />
      </div>

      {nouveau && calsEcrivables.length > 0 && (
        <Suspense fallback={null}><NouvelEvenement hass={hass} cals={calsEcrivables} jour={choisi}
          onClose={() => setNouveau(false)}
          onFait={() => { setNouveau(false); setTick(t => t + 1); }} /></Suspense>
      )}

      {edition && (
        <Suspense fallback={null}><NouvelEvenement hass={hass} cals={calsEcrivables} jour={choisi} evenement={edition}
          onClose={() => setEdition(null)}
          onFait={() => { setEdition(null); setTick(t => t + 1); }} /></Suspense>
      )}

      {reglages && !ordinaire && (
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 16, background: 'var(--o-s1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: 'var(--o-text1)', opacity: .78 }}>{tr('AGENDAS AFFICHÉS')}</div>
          {tousCals.map(k => {
            const on = actifs.indexOf(k) >= 0;
            return (
              <button key={k} onClick={() => basculer(k)} aria-pressed={on}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', minHeight: 44, borderRadius: 12, cursor: 'pointer',
                  border: 'var(--o-bw,1px) solid var(--o-bd2)', background: on ? 'rgba(var(--o-accent-rgb),.12)' : 'transparent', color: 'var(--o-text1)', textAlign: 'left' }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: on ? 'var(--o-accent-fond)' : 'transparent', border: on ? 'none' : 'var(--o-bw,1px) solid var(--o-bd2)' }}>
                  {on && <Fi i="check" size={11} color="#fff" />}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomCal(k)}</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', rowGap: 5, textAlign: 'center' }}>
        {jours.slice(0, 7).map((d, i) => <span key={'e' + i} style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', color: 'var(--o-text1)', opacity: .78, paddingBottom: 4 }}>{d.toLocaleDateString(locale(), { weekday: 'narrow' })}</span>)}
        {jours.map((d, i) => {
          const cJour = d.getTime() === auj.getTime();
          const sel = d.getTime() === new Date(choisi).setHours(0, 0, 0, 0);
          const horsMois = d.getMonth() !== ancre.getMonth();
          const n = (parJour.get(cleJour(d)) || []).length;
          return (
            <button key={'j' + i} onClick={() => setChoisi(new Date(d))} aria-pressed={sel}
              aria-label={d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }) + (n ? ' · ' + n : '')}
              style={{ position: 'relative', width: 36, height: 36, justifySelf: 'center', border: 'none', background: 'transparent',
                cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {n > 0 && !cJour && <span aria-hidden="true" style={{ position: 'absolute', inset: 4, borderRadius: '50%', border: (n > 1 ? 2 : 1.5) + 'px solid var(--o-accent-soft)', opacity: horsMois ? .35 : 1 }} />}
              {cJour && <span aria-hidden="true" style={{ position: 'absolute', inset: 4, borderRadius: '50%', background: 'var(--o-accent-fond)' }} />}
              {/* Le jour choisi n'est pas forcement aujourd'hui : il lui faut sa
                * propre marque, sinon on perdrait de vue ce que la liste du bas
                * est en train de raconter. */}
              {sel && !cJour && <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--o-s1)' }} />}
              {sel && cJour && <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--o-accent-soft)' }} />}
              <span style={{ position: 'relative', fontSize: 13, fontWeight: cJour || sel ? 800 : n > 0 ? 700 : 600,
                color: cJour ? '#fff' : 'var(--o-text1)', opacity: cJour ? 1 : horsMois ? .78 : n > 0 ? 1 : .9 }}>{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 16, borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', paddingTop: 13 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: 'var(--o-text1)', opacity: .78, marginBottom: 9, textTransform: 'uppercase' }}>
          {choisi.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
        {duJour.length === 0
          ? <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text1)', opacity: .62, paddingBottom: 4 }}>{tr('Rien de prévu')}</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {duJour.map((e, i) => {
                /* Un agenda peut savoir creer sans savoir modifier : les trois
                 * bits sont independants. On demande donc les deux separement,
                 * et l'`uid` en plus — sans lui, aucune des deux commandes ne
                 * sait de quel rendez-vous on parle. */
                const modifiable = !!(e._cal && e.uid && peut(hass, e._cal, 'modifier_evenement'));
                const supprimable = !!(e._cal && e.uid && peut(hass, e._cal, 'supprimer_evenement'));
                const aConfirmer = confirme === e.uid;
                const btnLigne = {
                  width: 32, height: 32, borderRadius: 10, border: 'none', background: 'var(--o-s2)',
                  color: 'var(--o-text1)', cursor: 'pointer', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                };
                const btnTexte = (fort) => ({
                  padding: '8px 12px', minHeight: 36, borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  border: fort ? 'none' : 'var(--o-bw,1px) solid var(--o-bd2)',
                  background: fort ? 'rgba(var(--o-bad-rgb),.16)' : 'transparent',
                  color: fort ? 'var(--o-bad)' : 'var(--o-text1)',
                });
                return (
                  <div key={e.uid || i} style={{ padding: '10px 12px', borderRadius: 13, background: 'var(--o-s1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <span style={{ width: 3, alignSelf: 'stretch', minHeight: 26, borderRadius: 2, background: 'var(--o-accent-soft)', flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.summary}</span>
                        {tousCals.length > 1 && e._cal && <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--o-text1)', opacity: .6, marginTop: 1 }}>{nomCal(e._cal)}</span>}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--o-text1)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{heureDe(e)}</span>
                      {modifiable && (
                        <button onClick={() => { setEdition(e); setNouveau(false); setConfirme(null); }}
                          aria-label={tr('Modifier') + ' · ' + e.summary} style={btnLigne}><Fi i="pencil" size={12} /></button>
                      )}
                      {supprimable && (
                        <button onClick={() => { setConfirme(aConfirmer ? null : e.uid); setErrListe(null); }}
                          aria-label={tr('Supprimer') + ' · ' + e.summary} aria-expanded={aConfirmer}
                          style={{ ...btnLigne, background: aConfirmer ? 'rgba(var(--o-bad-rgb),.16)' : 'var(--o-s2)', color: aConfirmer ? 'var(--o-bad)' : 'var(--o-text1)' }}><Fi i="trash" size={12} /></button>
                      )}
                    </div>

                    {/* Supprimer est irreversible : on demande, et le bouton
                      * dangereux ne se pose pas la ou etait le bouton innocent.
                      * Un rendez-vous qui se repete ouvre un choix de plus —
                      * sans lui, on ne saurait pas si l'on efface une occurrence
                      * ou toute la serie, et le defaut silencieux de Home
                      * Assistant est « celle-ci seulement ». */}
                    {aConfirmer && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
                        <span style={{ flex: '1 1 100%', fontSize: 12, fontWeight: 600, color: 'var(--o-text1)', opacity: .8 }}>
                          {e.recurrence_id ? tr('Ce rendez-vous se répète. Que supprimer ?') : tr('Supprimer ce rendez-vous ?')}
                        </span>
                        <button onClick={() => supprimer(e, '')} style={btnTexte(true)}>
                          {e.recurrence_id ? tr('Cette fois') : tr('Supprimer')}
                        </button>
                        {e.recurrence_id && (
                          <button onClick={() => supprimer(e, 'THISANDFUTURE')} style={btnTexte(true)}>{tr('Celle-ci et les suivantes')}</button>
                        )}
                        <button onClick={() => setConfirme(null)} style={btnTexte(false)}>{tr('Annuler')}</button>
                      </div>
                    )}
                    {aConfirmer && errListe && (
                      <div role="alert" style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-bad)', marginTop: 8 }}>{errListe}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </>
  );
}
