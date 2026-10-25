/* ── La barre « Maison » d'Objets › Chauffage (chantier Chauffage, plan 2, tâche 11) ──
 *
 * Le mode de la maison pour le planning de chauffe (spec § 9.1, choix 14) :
 * Planning · Absence · Vacances · Été, sous le titre du filtre Chauffage
 * d'Objets, au-dessus de ses cartes. Elle suit la norme des barres de tête de
 * vue, celle des Scènes (ADR 0051 : `.o-bar`, un groupe `.o-qb` et son
 * libellé `.o-qb-lbl` ; 10 px de marge, un groupe de 37 px, 59 px en tout).
 *
 * Son propre module, chargé à la demande (`lazyRecharge`, App.jsx) : ni
 * l'Accueil ni une carte ne l'affichent, et le démarrage n'a plus de place
 * (tests/lot14_chargement.test.mjs, tests/poids.test.mjs). Un module à part
 * se rend aussi en test (tests/barremaison.test.mjs).
 *
 *  - Le mode choisi en bleu plein (`--o-accent-fond`, texte blanc), les
 *    autres au gris doux, comme les puces des Scènes : aucune teinte de mode.
 *  - Planning, Absence et Été partent aussitôt (`loggia/chauffage/maison`,
 *    `fin: null`), montrés d'avance (`useOptimiste`) ; un refus retire
 *    l'avance et se dit sous la barre (`raisonEchec`, `role="alert"`).
 *  - Vacances ouvre une petite feuille : « Jusqu’au » — un champ date natif,
 *    facultatif, comme le formulaire d'un événement (formevenement.jsx ; seul
 *    le `<select>` natif est interdit) — et « Partir en vacances ». Le JOUR
 *    part seul (« 2026-10-20 ») : le serveur en fait minuit à l'heure de la
 *    MAISON (`_minuit_de_la_maison`, chauffage.py) — réglées depuis
 *    l'étranger, les Vacances ne reculent plus d'un jour à chaque validation
 *    (relecture des tâches 11 et 12). Le jour du retour, la maison repasse au
 *    Planning dès minuit ; le plus tôt qu'on puisse choisir est le lendemain
 *    de la MAISON (`lendemainDe`). Sans date, elle reste en Vacances jusqu'à
 *    ce qu'on la remette au Planning. Choisies, les Vacances disent leur fin,
 *    comme « En ce moment » : « Vacances jusqu’au 20 oct. » (`regimeMaison`,
 *    chauffageecran.js).
 *  - Les refus de la date — et ceux de la configuration, que reçoit la fiche
 *    d'un chauffage — ne sont pas dans le démarrage : la barre les enregistre
 *    en se chargeant (refuschauffage.js).
 *  - Les droits (D8, spec § 8.3) : Planning, Absence et Vacances pour tous ;
 *    l'Été aux administrateurs, pour y entrer comme pour en sortir — le
 *    serveur refuse le reste (`not_admin`). Un compte ordinaire voit l'Été
 *    grisé : la seule exception voulue par la spec à « ce qu'il ne peut pas
 *    enregistrer se masque » (ADR 0144). La maison en Été, toute la barre
 *    se ferme pour lui, et une phrase dit pourquoi.
 *  - La maison hors Planning sans aucun planning allumé : la phrase
 *    d'« En ce moment » sous la barre (« Absence — aucun planning allumé ») ;
 *    le serveur compte les plannings avant ses droits (`plannings_allumes`).
 *  - Au téléphone (index.css, `.o-bar-maison`), la barre ne glisse pas : le
 *    libellé s'efface, les puces se partagent la largeur et vont par paires
 *    — sur une rangée si les quatre tiennent, sinon deux et deux, jamais
 *    trois et une. Et elle ne finit pas par un bouton : la règle commune des
 *    `.o-bar` rendrait le dernier collant ; son seul enfant est le groupe.
 */
import { useState, useEffect, useRef, useId } from 'react';
import { tr } from './i18n.js';
import { BottomSheet } from './ui.jsx';
import { compteOrdinaire } from './state.js';
import { useOptimiste } from './optimiste.js';
import { raisonEchec, enregistrerRefus } from './refus.js';
import { REFUS_CHAUFFAGE } from './refuschauffage.js';
import { commanderChauffage } from './chauffageetat.js';
import { regimeMaison } from './chauffageecran.js';
import { petitesCapitales } from './styles.js';

// Les refus du planning de chauffe, que seules la fiche et la barre reçoivent : enregistrés au chargement.
enregistrerRefus(REFUS_CHAUFFAGE);

const TYPE_MAISON = 'loggia/chauffage/maison';

/* Les quatre modes de la maison, dans l'ordre de la barre, par paires. Une
 * fonction : les mots se lisent au rendu, dans la langue du moment. */
const PAIRES = () => [
  [['planning', tr('Planning')], ['absence', tr('Absence')]],
  [['vacances', tr('Vacances')], ['ete', tr('Été')]],
];

/** Le message de `loggia/chauffage/maison` (websocket_api.py) : le mode, et
 * la fin des Vacances — le jour du retour, seul, ou null : jusqu'au retour au
 * Planning. Les autres modes n'ont pas de fin. */
export function messageMaison(mode, fin = null) {
  return { type: TYPE_MAISON, mode, fin: mode === 'vacances' && fin ? fin : null };
}

const deux = (n) => String(n).padStart(2, '0');
/* Une date, écrite comme la valeur d'un champ date (« 2026-10-20 ») : lue en
 * UTC, aucun fuseau ne la déplace. */
const jourUtc = (d) => d.getUTCFullYear() + '-' + deux(d.getUTCMonth() + 1) + '-' + deux(d.getUTCDate());
const JOUR = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * La fin des Vacances telle qu'elle part : le JOUR choisi, seul (la valeur du
 * champ date, « 2026-10-20 »), que le serveur fait minuit à l'heure de la
 * maison. null pour un jour qui ne se lit pas : un 31 février ne glisse pas au
 * 3 mars.
 */
export function finDesVacances(jour) {
  const m = typeof jour === 'string' ? JOUR.exec(jour) : null;
  if (!m || jour.length !== 10) return null;
  return jourUtc(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))) === jour ? jour : null;
}

/**
 * Le lendemain à l'heure de la MAISON : le jour d'après la partie murale de
 * `maintenant` (`etat.maintenant`, « 2026-10-12T23:30:00+02:00 » → le 13) —
 * jamais celui du navigateur, qui peut être déjà le 13 à Athènes. Aujourd'hui,
 * son minuit est passé : le lendemain est le plus tôt qu'on puisse choisir.
 * Sans `maintenant` lisible, celui de l'écran (`t`).
 */
export function lendemainDe(maintenant, t = Date.now()) {
  const m = typeof maintenant === 'string' ? JOUR.exec(maintenant) : null;
  if (m) return jourUtc(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1)));
  const d = new Date(t);
  return jourUtc(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + 1)));
}

/* Vivant tant que le composant est monté : une réponse revenue après son
 * départ ne touche plus à son état. */
function useVivant() {
  const vivant = useRef(true);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);
  return vivant;
}

// La barre et son groupe, au dessin de ceux des Scènes (scenes.jsx, `QuickBox`).
const BARRE = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,18px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' };
const GROUPE = { display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' };
const LIBELLE = { fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' };
const RANGEE = { display: 'flex', gap: 4 };
/* Une puce : 27 px de haut, celle du menu des Scènes — le groupe en fait 37,
 * la barre 59. Choisie, le bleu plein et le texte blanc (la règle des puces) ;
 * inerte, à .4 — la choisie reste pleine : elle dit le mode de la maison. */
const PUCE = (on, inerte) => ({ boxSizing: 'border-box', minHeight: 27, padding: '5px 10px', borderRadius: 10, border: 'none', cursor: inerte ? 'default' : 'pointer',
  fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', background: on ? 'var(--o-accent-fond)' : 'transparent', color: on ? '#fff' : 'var(--o-text2)',
  opacity: inerte && !on ? 0.4 : 1 });
const PHRASE = { fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', lineHeight: 1.45, marginTop: 8 };
const ALERTE = { fontSize: 12, fontWeight: 700, color: 'var(--o-bad)', lineHeight: 1.45, marginTop: 8 };
// Le champ de la date, celui du formulaire d'un événement (formevenement.jsx).
const CHAMP = { padding: '10px 12px', borderRadius: 12, background: 'var(--o-s2)', color: 'var(--o-text)', border: 'var(--o-bw,1px) solid var(--o-bd2)', fontSize: 13,
  fontWeight: 600, fontFamily: 'inherit', boxSizing: 'border-box', minHeight: 44, width: '100%' };
const BOUTON = (envoi) => ({ width: '100%', padding: '12px 16px', minHeight: 44, borderRadius: 14, border: 'none', cursor: envoi ? 'default' : 'pointer', fontFamily: 'inherit',
  background: 'var(--o-accent-fond)', color: '#fff', fontSize: 13, fontWeight: 800, opacity: envoi ? 0.6 : 1 });

/**
 * La feuille des Vacances : « Jusqu’au » (facultatif) et « Partir en
 * vacances ». La date déjà posée revient dans le champ, lue dans la partie
 * murale de sa fin — le jour de la maison ; le lendemain de la maison est le
 * plus tôt qu'on puisse choisir (`maintenant` : `etat.maintenant`). Partie, la
 * demande ferme la feuille ; refusée, la feuille reste ouverte et dit pourquoi
 * — la date se corrige sur place.
 */
function FeuilleVacances({ maison, maintenant, onPartir, fermer }) {
  const idJour = useId();
  const vivant = useVivant();
  const [jour, setJour] = useState(() => {
    const m = maison.mode === 'vacances' && typeof maison.vacances_fin === 'string' ? /^(\d{4}-\d{2}-\d{2})T/.exec(maison.vacances_fin) : null;
    return m ? m[1] : '';
  });
  const [err, setErr] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const demain = lendemainDe(maintenant);
  const partir = () => {
    const fin = jour ? finDesVacances(jour) : null;
    if (jour && !fin) { setErr(tr('Date de retour illisible ou déjà passée.')); return; }
    setErr('');
    setEnvoi(true);
    onPartir(fin).then((r) => {
      if (!vivant.current) return;
      setEnvoi(false);
      if (r) setErr(r); else fermer();
    });
  };
  return (
    <div className="o-vacances" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label id={idJour + 'n'} htmlFor={idJour} style={{ ...petitesCapitales(10.5), display: 'block', marginBottom: 6 }}>{tr('Jusqu’au')}</label>
        <input id={idJour} aria-labelledby={idJour + 'n'} type="date" value={jour} min={demain} onChange={(e) => { setJour(e.target.value); setErr(''); }} style={CHAMP} />
        <div style={{ ...PHRASE, marginTop: 6 }}>{jour ? tr('Le jour du retour, la maison repasse au Planning dès minuit.') : tr('Sans date, la maison reste en Vacances jusqu’à ce qu’on la remette au Planning.')}</div>
      </div>
      {err && <div role="alert" style={{ ...ALERTE, marginTop: 0 }}>{err}</div>}
      <button type="button" onClick={partir} disabled={envoi} style={BOUTON(envoi)}>{envoi ? tr('Envoi…') : tr('Partir en vacances')}</button>
    </div>
  );
}

/**
 * `etat` : la réponse de `loggia/chauffage/etat` (sa maison, `plannings_allumes`) —
 * la vue la lit dans le cache partagé ; chaque commande rend l'état, qui
 * remplace le cache (`commanderChauffage`).
 */
export default function BarreMaison({ hass, etat }) {
  const idLibelle = useId();
  const vivant = useVivant();
  const maison = (etat && etat.maison) || {};
  const lu = maison.mode || 'planning';
  const [ov, poserOv] = useOptimiste(lu);
  const mode = ov || lu;
  const [err, setErr] = useState('');
  const [feuille, setFeuille] = useState(false);
  const ordinaire = compteOrdinaire(hass);
  // La maison en Été, un compte ordinaire n'en sort pas : le serveur refuserait (D8).
  const fermee = ordinaire && lu === 'ete';
  const regime = regimeMaison(maison);
  const sansPlanning = !!regime && etat.plannings_allumes === false;
  // La demande : montrée d'avance, retirée au refus ; rend la phrase du refus, ou ''.
  const envoyer = (m, fin) => {
    setErr('');
    poserOv(m);
    return commanderChauffage(hass, messageMaison(m, fin)).then(() => '', (e) => { poserOv(null); return raisonEchec(e); });
  };
  const choisir = (m) => {
    if (m === 'vacances') { setFeuille(true); return; }
    if (m === mode) return;
    envoyer(m, null).then((r) => { if (r && vivant.current) setErr(r); });
  };
  return (
    <div>
      <div className="o-bar o-bar-maison" style={BARRE}>
        <div className="o-qb" role="group" aria-labelledby={idLibelle} style={GROUPE}>
          <span id={idLibelle} className="o-qb-lbl" style={LIBELLE}>{tr('Maison')}</span>
          <div className="o-maison-puces" style={RANGEE}>
            {PAIRES().map(paire => (
              <div key={paire[0][0]} className="o-maison-paire" style={RANGEE}>
                {paire.map(([m, mot]) => {
                  const on = m === mode;
                  const reserve = ordinaire && m === 'ete';
                  const inerte = fermee || reserve;
                  return (
                    <button key={m} type="button" aria-pressed={on} disabled={inerte} title={reserve ? tr('Réservé aux administrateurs.') : undefined}
                      onClick={() => choisir(m)} style={PUCE(on, inerte)}>
                      {m === 'vacances' && on && lu === 'vacances' ? regime[2] : mot}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {fermee && <div style={PHRASE}>{tr('La maison est en Été : seul un administrateur peut en sortir.')}</div>}
      {sansPlanning && <div style={PHRASE}>{tr('{mode} — aucun planning allumé', { mode: regime[2] })}</div>}
      {err && <div role="alert" style={ALERTE}>{err}</div>}
      {feuille && (
        <BottomSheet onClose={() => setFeuille(false)} title={tr('Vacances')}>
          {(fermer) => <FeuilleVacances maison={maison} maintenant={etat && etat.maintenant} onPartir={(fin) => envoyer('vacances', fin)} fermer={fermer} />}
        </BottomSheet>
      )}
    </div>
  );
}
