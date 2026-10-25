/* Départ et retour : régler ce que fait la maison quand elle se vide.
 *
 * Le serveur (`presence.py`) tient la règle — elle marche dashboard fermé, ce
 * qui est le minimum pour une maison qu'on quitte.
 *
 * Un parti pris d'interface : le désarmement au retour est présenté à part,
 * avec son avertissement. Armer parce que la maison se vide est sans risque ;
 * la désarmer parce qu'un téléphone approche en est un, et cette case ne doit
 * pas se cocher distraitement au milieu des autres.
 */
import { useMemo, useState, useEffect } from 'react';
import { cvName, RegleEntete, usePli, useEtatServeur, ListeChoix, Bascule } from '../ui.jsx';
import { ZONE_REGLAGES, CAPITALES, TITRE_PANNEAU } from './parcommun.jsx';
import { tr, trN, locale, comparerTextes } from '../i18n.js';
import { raisonEchec } from '../refus.js';
import { puce } from '../styles.js';
import { uniteTemp, deCelsius } from '../unites.js';
import { CLASSES_MOUVEMENT, CLASSES_OUVRANT } from '../attention.js';

/* Au niveau du module, et non dans le composant.
 *
 * Une fonction declaree dans un corps de composant est recreee a chaque
 * rendu : React voit un type different au meme endroit et remonte tout le
 * sous-arbre. Ici rien ne prend le focus, donc rien ne se voyait — mais le
 * travail etait refait pour rien a chaque frappe, et toute transition CSS en
 * cours repartait de zero. Voir `tests/composants.test.mjs`. */

/* La bascule est celle de toutes les règles (`Bascule`, ui.jsx ; audit du 19/10, lot 4) : `role="switch"`, son état annoncé,
 * `type="button"`. La copie d'ici n'avait ni rôle ni état, et faisait 24 px de haut. */

/** Un champ NOMBRE qui part à la sortie, ou sur Entrée (le motif de `ChampHeure aLaSortie`, fichecommune.jsx ; audit du 19/10, M20).
 *  Il partait à chaque frappe : en tapant « 16 », la consigne d'absence passait d'abord à 1 °C ; vidé, le délai valait 0 min.
 *  Borné (`min`, `max`), arrondi au `pas` ; la virgule se lit ; vide ou illisible, il redit la valeur d'avant — jamais 0. */
export function ChampNombre({ valeur, onValide, nom, min, max, pas = 1, style = null }) {
  const [v, setV] = useState(String(valeur));
  useEffect(() => { setV(String(valeur)); }, [valeur]);
  const sortir = (brut) => {
    // Rien de changé, rien ne part : en °F, passer dans le champ écrivait 41 (la borne basse) — relecture du lot 4.
    if (String(brut == null ? '' : brut).trim() === String(valeur)) { setV(String(valeur)); return; }
    const t = String(brut == null ? '' : brut).trim().replace(',', '.');
    const n = t === '' ? NaN : Number(t);
    if (!Number.isFinite(n)) { setV(String(valeur)); return; }
    const borne = Math.round(Math.min(max, Math.max(min, n)) / pas) * pas;
    const juste = Math.round(borne * 100) / 100;
    setV(String(juste));
    if (juste !== valeur) onValide(juste);
  };
  return <input aria-label={nom} type="number" inputMode="decimal" value={v} min={min} max={max} step={pas} style={style || undefined}
    onChange={(e) => setV(e.target.value)} onBlur={(e) => sortir(e.target.value)}
    onKeyDown={(e) => { if (e.key === 'Enter') sortir(e.currentTarget.value); }} />;
}

const Rangee = ({ nom, desc, on, cb }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
    <span style={{ minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{nom}</span>
      {desc ? <span style={{ display: 'block', fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginTop: 2 }}>{desc}</span> : null}
    </span>
    <Bascule nom={nom} on={on} cb={cb} />
  </div>
);


export function PresenceReglages({ hass, cardSt }) {
  const h = hass && typeof hass.callWS === 'function' ? hass : null;
  // La consigne part telle quelle vers climate.set_temperature (presence.py) : aucune
  // conversion interne, juste le bon label et les bonnes bornes pour l'unite reelle.
  const uT = uniteTemp(null, hass);
  const bMin = Math.round(deCelsius(5, uT)), bMax = Math.round(deCelsius(25, uT));
  const { etat, setEtat, err, setErr, vivant } =
    useEtatServeur(hass, 'loggia/presence/etat', 5000, tr('Réglages indisponibles.'));
  /* Le pli de la regle — avec les autres etats. */
  const [pliPres, plierPres] = usePli('presence:depart');


  const cfg = (etat && etat.config) || null;

  const enregistrer = async (patch) => {
    if (!h || !cfg) return;
    setEtat(e => {
      if (!e) return e;
      const objet = (x) => x && typeof x === 'object' && !Array.isArray(x);
      const n = { ...e.config };
      for (const k of Object.keys(patch)) {
        if (objet(n[k]) && objet(patch[k])) {
          n[k] = { ...n[k] };
          for (const kk of Object.keys(patch[k])) {
            n[k][kk] = (objet(n[k][kk]) && objet(patch[k][kk]))
              ? { ...n[k][kk], ...patch[k][kk] } : patch[k][kk];
          }
        } else n[k] = patch[k];
      }
      return { ...e, config: n };
    });
    try {
      const r = await h.callWS({ type: 'loggia/presence/config', patch });
      if (vivant.current && r && r.config) setEtat(e => (e ? { ...e, config: r.config } : e));
    } catch (e) {
      // Un refus se dit comme tel et nomme sa clé ; une panne reste une panne
      // (audit du 03/10, refus.js). Il s'affichait en « Unauthorized ».
      setErr(raisonEchec(e, 'loggia_presence'));
    }
  };

  const gens = useMemo(() => {
    if (!hass || !hass.states) return [];
    return Object.keys(hass.states).filter(id => id.indexOf('person.') === 0)
      .map(id => ({ id, nom: cvName(hass.states[id], id) }))
      .sort((a, b) => comparerTextes(a.nom, b.nom));
  }, [hass]);
  const alarmes = useMemo(() => {
    if (!hass || !hass.states) return [];
    return Object.keys(hass.states).filter(id => id.indexOf('alarm_control_panel.') === 0)
      .map(id => ({ id, nom: cvName(hass.states[id], id) }))
      .sort((a, b) => comparerTextes(a.nom, b.nom));
  }, [hass]);
  /* Les interrupteurs de Home Assistant (input_boolean) : le mode invité en
   * désigne un (ADR 0016). Il appartient à Home Assistant, pas à Loggia. */
  const interrupteurs = useMemo(() => {
    if (!hass || !hass.states) return [];
    return Object.keys(hass.states).filter(id => id.indexOf('input_boolean.') === 0)
      .map(id => ({ id, nom: cvName(hass.states[id], id) }))
      .sort((a, b) => comparerTextes(a.nom, b.nom));
  }, [hass]);
  /* Les capteurs qui trahissent une présence : par device_class, jamais par
   * nom — le miroir de `presence.INDICES` côté serveur. */
  const capteurs = useMemo(() => {
    if (!hass || !hass.states) return [];
    // LA table des classes (attention.js, audit du 19/10) : la présence et les ouvrants.
    const classes = [...CLASSES_MOUVEMENT, ...CLASSES_OUVRANT];
    return Object.keys(hass.states).filter(id => id.indexOf('binary_sensor.') === 0
      && classes.indexOf(String((hass.states[id].attributes || {}).device_class || '').toLowerCase()) >= 0);
  }, [hass]);

  if (!cfg) {
    return (
      <div style={cardSt}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{tr('Départ et retour')}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: err ? 'var(--o-bad)' : 'var(--o-text3)' }}>
          {err || tr('Chargement…')}
        </div>
      </div>
    );
  }

  const dep = cfg.depart || {};
  const ret = cfg.retour || {};
  const chauf = dep.chauffage || {};
  const alarme = dep.alarme || {};
  const suivies = cfg.personnes || [];
  const ind = cfg.indices || {};
  const invite = cfg.invite || {};
  const inviteSt = invite.entite && hass && hass.states ? hass.states[invite.entite] : null;
  const inviteOn = !!inviteSt && inviteSt.state === 'on';

  const simu = cfg.simulation || {};
  const label = { fontSize: 12, fontWeight: 700 };
  const ligne = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 };
  const champ = { padding: '8px 12px', borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s2)', color: 'var(--o-text1)', fontSize: 13, fontWeight: 600 };



  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* La simulation se dit EN HAUT, pas seulement dans son réglage : sinon
        * on cherche pourquoi rien ne bouge. */}
      {simu.actif && (
        <div role="status" style={{ ...cardSt, border: 'var(--o-bw,1px) solid var(--o-warn2)', fontSize: 12.5, fontWeight: 700, color: 'var(--o-warn2)' }}>
          {tr('Simulation : rien ne bouge, tout est noté.')}
        </div>
      )}
      <div style={cardSt}>
        <RegleEntete nom={tr('Départ et retour')}
          desc={tr('Quand la dernière personne s’en va, la maison se met en veille. Elle se réveille au retour.')}
          on={!!cfg.actif} cb={() => enregistrer({ actif: !cfg.actif })}
          plie={pliPres} onPlier={plierPres} zone="presence-pres-1 presence-pres-2 presence-pres-3 presence-pres-4" />
        {etat.dehors && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: 'var(--o-accent-soft)' }}>{tr('Maison en veille en ce moment.')}</div>
        )}
        {etat.en_attente && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: 'var(--o-warn2)' }}>{tr('Décompte de départ en cours.')}</div>
        )}
        {cfg.actif && !pliPres && (
          <div id="presence-pres-1" style={ZONE_REGLAGES}>
            <div style={ligne}>
              <span style={{ ...label, minWidth: 88 }}>{tr('Attendre')}</span>
              <ChampNombre nom={tr('Attendre avant la mise en veille, en minutes')} valeur={cfg.delai_depart != null ? cfg.delai_depart : 5} min={0} max={60}
                onValide={n => enregistrer({ delai_depart: n })} style={{ ...champ, width: 74 }} />
              <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 700 }}>
                {tr('min — un téléphone qui accroche une autre antenne ne doit pas vider la maison')}
              </span>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ ...label, marginBottom: 7 }}>{tr('Qui compte')}</div>
              {gens.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600 }}>
                  {tr('Aucune personne dans Home Assistant. Sans personne suivie, la règle ne se déclenche jamais.')}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {gens.map(g => {
                  const on = suivies.indexOf(g.id) >= 0;
                  return (
                    <button key={g.id} type="button" aria-pressed={on} onClick={() => enregistrer({ personnes: on ? suivies.filter(x => x !== g.id) : [...suivies, g.id] })}
                      style={puce(on)}>{g.nom}</button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {cfg.actif && !pliPres && (<div className="grid-pres-dep" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, alignItems: 'stretch' }}>
        <div id="presence-pres-2" style={cardSt}>
          <div style={CAPITALES}>{tr('En partant')}</div>
          <div style={{ marginTop: 8 }}>
            <Rangee nom={tr('Éteindre les lumières')} desc={tr('Celles qui étaient déjà éteintes ne se rallumeront pas au retour.')}
              on={!!dep.lumieres} cb={() => enregistrer({ depart: { lumieres: !dep.lumieres } })} />
            <Rangee nom={tr('Baisser le chauffage')} desc={chauf.actif ? tr('Consigne d’absence ; au retour, les consignes d’avant sont remises.') : ''}
              on={!!chauf.actif} cb={() => enregistrer({ depart: { chauffage: { actif: !chauf.actif } } })} />
            {chauf.actif && (
              <div style={{ ...ligne, marginTop: 4, paddingBottom: 8 }}>
                <span style={{ ...label, minWidth: 88 }}>{tr('Absence')}</span>
                <ChampNombre nom={tr('Température en absence, en °{u}', { u: uT })} valeur={chauf.consigne != null ? chauf.consigne : 17} min={bMin} max={bMax} pas={0.5}
                  onValide={n => enregistrer({ depart: { chauffage: { consigne: n } } })} style={{ ...champ, width: 74 }} />
                <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 700 }}>°{uT}</span>
              </div>
            )}
            <Rangee nom={tr('Armer l’alarme')} desc={alarmes.length === 0 ? tr('Aucune alarme trouvée.') : ''}
              on={!!alarme.actif} cb={() => enregistrer({ depart: { alarme: { actif: !alarme.actif, entite: alarme.entite || (alarmes[0] && alarmes[0].id) || '' } } })} />
            {alarme.actif && alarmes.length > 0 && (
              <div style={{ ...ligne, marginTop: 4, paddingBottom: 8 }}>
                <ListeChoix value={alarme.entite || ''} onChange={v => enregistrer({ depart: { alarme: { entite: v } } })} label={tr('Alarme à armer')}
                  options={alarmes.map(a => ({ id: a.id, label: a.nom }))} style={{ ...champ, minWidth: 200 }} />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[['away', tr('Absent')], ['home', tr('Présent')], ['night', tr('Nuit')]].map(([id, nom]) => (
                    <button key={id} type="button" aria-pressed={(alarme.mode || 'away') === id} onClick={() => enregistrer({ depart: { alarme: { mode: id } } })}
                      style={puce((alarme.mode || 'away') === id)}>{nom}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div id="presence-pres-3" style={cardSt}>
          <div style={CAPITALES}>{tr('Au retour')}</div>
          <div style={{ marginTop: 8 }}>
            <Rangee nom={tr('Rallumer les lumières')} desc={tr('Seulement celles que Loggia a éteintes en partant.')}
              on={!!ret.lumieres} cb={() => enregistrer({ retour: { lumieres: !ret.lumieres } })} />
            {ret.lumieres && (
              <Rangee nom={tr('Seulement s’il fait nuit')} desc={tr('Rentrer à quinze heures ne doit pas rallumer le salon.')}
                on={ret.seulement_la_nuit !== false} cb={() => enregistrer({ retour: { seulement_la_nuit: ret.seulement_la_nuit === false } })} />
            )}
            <Rangee nom={tr('Remettre le chauffage')} desc={tr('Aux consignes d’avant le départ, telles quelles.')}
              on={!!ret.chauffage} cb={() => enregistrer({ retour: { chauffage: !ret.chauffage } })} />
          </div>
          {/* Le désarmement à part, avec son avertissement : cette case ne
            * doit pas se cocher distraitement au milieu des autres. */}
          {alarme.actif && (
            <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(var(--o-warn2-rgb),.10)', border: 'var(--o-bw,1px) solid rgba(var(--o-warn2-rgb),.30)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--o-warn2)' }}>{tr('Désarmer l’alarme au retour')}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginTop: 3 }}>
                    {tr('Armer parce que la maison se vide est sans risque. La désarmer parce qu’un téléphone approche en est un : qui tient ce téléphone entre dans une maison ouverte.')}
                  </span>
                </span>
                <Bascule nom={tr('Désarmer l’alarme au retour')} on={!!ret.desarmer} cb={() => enregistrer({ retour: { desarmer: !ret.desarmer } })} />
              </div>
            </div>
          )}
        </div>
      </div>)}

      {/* ── Un seul indice suffit (§10) ── */}
      {/* Le téléphone dit qui est parti ; il ne dit pas qui est resté. Un
        * mouvement, une porte, une lampe touchée pendant le décompte : quelqu'un
        * est là, le décompte repart de zéro. */}
      {cfg.actif && !pliPres && (
        <div id="presence-pres-4" style={cardSt}>
          <div style={TITRE_PANNEAU}>{tr('Un seul indice suffit')}</div>
          <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 }}>
            {tr('Pendant le décompte, un mouvement, une porte qui s’ouvre ou une lampe touchée à la main veut dire que quelqu’un est là : le décompte repart de zéro.')}
          </div>
          <div style={{ marginTop: 8 }}>
            <Rangee nom={tr('Mouvements et ouvertures')}
              desc={capteurs.length === 0 ? tr('Aucun capteur de mouvement ni d’ouverture trouvé.') : trN(capteurs.length, '{n} capteur trouvé dans Home Assistant', '{n} capteurs trouvés dans Home Assistant')}
              on={ind.actif !== false} cb={() => enregistrer({ indices: { actif: ind.actif === false } })} />
            <Rangee nom={tr('Gestes manuels')} desc={tr('Une lampe ou un volet touché à la main compte aussi.')}
              on={ind.mains !== false} cb={() => enregistrer({ indices: { mains: ind.mains === false } })} />
          </div>
          {etat.indices && etat.indices.dernier && (
            <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginTop: 8 }}>
              {/* Le genre arrive du serveur en français — « mouvement »,
                * « ouverture », « main » (presence.py) — et s'affichait tel
                * quel : « Last clue : mouvement » (audit du 03/10). Les trois
                * mots sont au catalogue ; un genre inconnu sort tel qu'il est. */}
              {/* Libellé et valeur par un gabarit (audit du 03/10) : l'espace
                * avant les deux-points est française, « {a}: {b} » ailleurs. Le
                * genre — « mouvement », « ouverture », « main » — est un mot du
                * serveur : il passe par `tr`, comme au journal. */}
              {tr('{a} : {b}', { a: tr('Dernier indice'), b: tr(etat.indices.dernier.genre || '') })} · {etat.indices.dernier.nom} · {new Date(etat.indices.dernier.ts * 1000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
      )}

      {/* ── Le mode invité (ADR 0016) ── */}
      {/* Quelqu'un garde la maison sans téléphone suivi. L'interrupteur est
        * un input_boolean de Home Assistant : la voix, un bouton mural ou une
        * automatisation peuvent aussi l'allumer. Allumé, la maison ne se met
        * pas en veille et l'extinction du coucher attend ; il se coupe seul
        * trente minutes après le retour d'un habitant. Sans désignation, la
        * carte dit quoi créer. */}
      {/* Comme toutes ses voisines : la carte ne parait que si la regle
        * tourne. La coupure automatique des trente minutes vit DANS cette
        * regle — eteinte, elle n'arme plus rien, et la carte promettrait
        * un retour a la normale qui ne viendrait pas (audit du 23/09). */}
      {cfg.actif && !pliPres && (<>
      <div id="presence-invite" style={cardSt}>
        <div style={TITRE_PANNEAU}>{tr('Mode invité')}</div>
        <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 }}>
          {tr('Quelqu’un garde la maison sans téléphone suivi : allumé, la maison ne se met pas en veille et l’extinction du coucher attend. Il se coupe seul trente minutes après le retour d’un habitant.')}
        </div>
        <div style={ligne}>
          <span style={{ ...label, minWidth: 88 }}>{tr('L’interrupteur')}</span>
          <ListeChoix value={invite.entite || ''} onChange={v => enregistrer({ invite: { entite: v } })} label={tr('Interrupteur du mode invité')}
            options={[{ id: '', label: tr('Aucun interrupteur') }, ...interrupteurs.map(a => ({ id: a.id, label: a.nom }))]} style={{ ...champ, minWidth: 200 }} />
        </div>
        {!invite.entite && (
          <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginTop: 8 }}>
            {tr('Aucun interrupteur désigné : créez une entrée « Interrupteur » (input_boolean) nommée Invité dans Home Assistant, puis désignez-la ici.')}
          </div>
        )}
        {invite.entite && (
          <div style={{ ...ligne, marginTop: 10 }}>
            <button type="button" aria-pressed={inviteOn}
              onClick={() => { if (hass && typeof hass.callService === 'function') hass.callService('input_boolean', inviteOn ? 'turn_off' : 'turn_on', { entity_id: invite.entite }); }}
              style={puce(inviteOn)}>{inviteOn ? tr('Invité en ce moment') : tr('Pas d’invité')}</button>
            {inviteOn && etat.invite && etat.invite.coupure_prevue && (
              <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600 }}>{tr('Un habitant est rentré : le mode se coupera dans la demi-heure.')}</span>
            )}
          </div>
        )}
      </div>
      </>)}

      {err && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-bad)' }}>{err}</div>}
    </div>
  );
}

