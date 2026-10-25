/* Fenêtre ouverte, chauffage coupé : le réglage, pièce par pièce.
 *
 * Rien à saisir : les pièces viennent des zones de Home Assistant, les
 * ouvrants de leur `device_class`, les chauffages de leur domaine. Activer une
 * pièce la remplit toute seule ; les cases servent à retrancher, pas à
 * construire.
 *
 * Le travail est fait par le serveur (`fenetres.py`) : la règle tient dashboard
 * fermé, ce qui est le minimum pour un radiateur.
 */
import {
  useMemo, useState
} from 'react';
import { LOGGIA_INDEX } from '../state.js';
import { cvName, Fi, RegleEntete, usePli , useEtatServeur } from '../ui.jsx';
import { tr, trN } from '../i18n.js';
import { raisonEchec } from '../refus.js';
import { puce as pucePartagee } from '../styles.js';
import { interrupteurDeModule } from '../resolve.js';

/* Au niveau du module, et non dans le composant.
 *
 * Une fonction declaree dans un corps de composant est recreee a chaque
 * rendu : React voit un type different au meme endroit et remonte tout le
 * sous-arbre. Ici rien ne prend le focus, donc rien ne se voyait — mais le
 * travail etait refait pour rien a chaque frappe, et toute transition CSS en
 * cours repartait de zero. Voir `tests/composants.test.mjs`. */

const Bascule = ({ on, cb, nom }) => (
  <button aria-label={nom} onClick={cb} style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, padding: 3, background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start' }}>
    <span style={{ width: 20, height: 20, borderRadius: '50%', background: on ? '#fff' : 'var(--o-text3)' }} />
  </button>
);


/* Ce qui compte comme ouvrant : Home Assistant le dit lui-même dans la
 * `device_class`, plutôt que de le deviner sur le nom de l'entité. */
const CLASSES_OUVRANT = ['window', 'door', 'garage_door', 'opening'];

const estOuvrant = (id, st) => id.indexOf('binary_sensor.') === 0
  && CLASSES_OUVRANT.indexOf(((st && st.attributes) || {}).device_class) >= 0;

/* La famille d'un chauffage, que le serveur reconnaît et pose dans l'index
 * (chantier Chauffage, plan 2, choix 1) : l'écran la lit, il ne la devine pas.
 * Sans le composant (les registres de Home Assistant seuls), aucune. */
const familleDe = (index, id) => {
  const m = index && index.entityMeta && index.entityMeta.get(id);
  return (m && m.famille) || null;
};

/* Ce qui peut chauffer : un thermostat, un module fil pilote — son `select`,
 * qui porte l'ordre —, ou une prise commandée. On propose, l'utilisateur
 * tranche : une prise peut aussi bien piloter une lampe. L'interrupteur d'un
 * module n'est PAS proposé : il l'alimente, et le couper le rendrait sourd à
 * tout ordre. La règle coupe un module par son ordre Arrêt (ADR 0178 ; choix
 * 17 du plan 2).
 *
 * Jamais une entité masquée, ni un interrupteur qui RÈGLE son appareil — la
 * catégorie `config` ou `diagnostic` que lui donne Home Assistant : les LED
 * d'un interrupteur mural, le mode avancé d'un robot (« Faire le tri »,
 * 12/10). Le `select` d'un module, lui, reste proposé quelle que soit sa
 * catégorie : une intégration peut ranger la liste des ordres parmi les
 * réglages, mais le serveur l'a reconnue (`chauffage_familles.py`), et c'est
 * par elle qu'il coupe. Déjà cochée, une entité écartée se montre quand même
 * (`pucesChauffages`) : on doit pouvoir la décocher. */
const REGLAGE = ['config', 'diagnostic'];

const estChauffage = (index, id) => {
  const m = index && index.entityMeta && index.entityMeta.get(id);
  if (m && m.hidden) return false;
  if (id.indexOf('climate.') === 0) return true;
  if (id.indexOf('select.') === 0) return familleDe(index, id) === 'fil_pilote';
  return id.indexOf('switch.') === 0 && !interrupteurDeModule(index, id)
    && !(m && REGLAGE.indexOf(m.category) >= 0);
};

/* Ce qu'on coche TOUT SEUL en activant une pièce. Un thermostat ne fait aucun
 * doute, un module fil pilote non plus. Une prise, si : elle peut piloter une
 * lampe. On ne retient donc que celles dont le nom l'annonce — beaucoup
 * d'installations chauffent par une simple prise, et n'ont que des `switch`.
 * Le choix reste corrigeable d'un clic. */
const MOTS_CHAUFFAGE = /radiateur|chauffage|chauffe|convecteur|s[ée]che[- ]serviette|heater|radiator/i;

const chauffeSurement = (index, id, nom) => id.indexOf('climate.') === 0
  || familleDe(index, id) === 'fil_pilote' || MOTS_CHAUFFAGE.test(nom || id);

/* Parmi ce qui peut chauffer, ce qui chauffe VRAISEMBLABLEMENT, montré
 * d'abord : un thermostat, un module, une prise — sa `device_class` le dit —,
 * un interrupteur dont le nom annonce un radiateur (le nom même que lit
 * `chauffeSurement` : un `switch` n'a jamais de famille). Le reste — les
 * interrupteurs d'une enceinte, ceux d'un poêle qui a son thermostat — attend
 * sous « Autres interrupteurs », replié : rien ne s'y perd. */
const chauffeProbablement = (id, st) => id.indexOf('switch.') !== 0
  || ((st && st.attributes) || {}).device_class === 'outlet'
  || MOTS_CHAUFFAGE.test(cvName(st, id));

/** Le `select` fil pilote du module dont `id` est l'interrupteur, sinon null.
 * Le pendant de `select_du_module` (`chauffage.py`), par lequel le serveur
 * coupe déjà un module que la configuration nomme par son interrupteur
 * (`fenetres.py`, `_chauffages`). */
export function selectDuModule(index, id) {
  if (!interrupteurDeModule(index, id)) return null;
  const appareil = index.entityMeta.get(id).deviceId;
  let trouve = null;
  index.entityMeta.forEach((m, autre) => {
    if (!trouve && m && m.deviceId === appareil && m.famille === 'fil_pilote' && autre.indexOf('select.') === 0) trouve = autre;
  });
  return trouve;
}

/** Les chauffages d'une configuration, tels que la règle les coupe :
 * l'interrupteur d'un module y devient son `select`, sans doublon ; ce qui
 * n'est pas un identifiant est écarté, comme au serveur (`piece_propre`). Le
 * reste tel quel — un chauffage introuvable compris : le retirer est un geste
 * de l'utilisateur, pas une décision de l'écran. */
export function chauffagesRelus(index, liste) {
  const sortie = [];
  (Array.isArray(liste) ? liste : []).forEach(id => {
    if (typeof id !== 'string') return;
    const vrai = selectDuModule(index, id) || id;
    if (sortie.indexOf(vrai) < 0) sortie.push(vrai);
  });
  return sortie;
}

/** Les pièces candidates : celles qui ont au moins un ouvrant — une pièce sans
 * capteur d'ouverture n'a rien à offrir à cette règle —, avec ses ouvrants, ce
 * qui y chauffe vraisemblablement (`chauffages`) et ses autres interrupteurs
 * (`autres`), dans l'ordre de la zone. */
export function piecesCandidates(index, S) {
  const zones = (index && index.areaList) || [];
  return zones.map(z => {
    const proposes = (z.entities || []).filter(id => S[id] && estChauffage(index, id));
    return {
      nom: z.name,
      ouvrants: (z.entities || []).filter(id => estOuvrant(id, S[id])),
      chauffages: proposes.filter(id => chauffeProbablement(id, S[id])),
      autres: proposes.filter(id => !chauffeProbablement(id, S[id])),
    };
  }).filter(z => z.ouvrants.length > 0);
}

/** Les puces de « Couper » d'une pièce : ses chauffages probables, cochés ou
 * non, puis ce que sa configuration (`coches`, relue) coupe hors d'eux — un
 * autre interrupteur coché, un réglage coché avant le tri, un chauffage rangé
 * ailleurs : ce qui est coupé se voit toujours, sans rien déplier, là où il
 * agit. Un chauffage sans état est introuvable — renommé ou retiré dans Home
 * Assistant : la règle range ses chauffages par `entity_id`, et la pièce
 * perdrait sa protection en silence. */
export function pucesChauffages(S, piece, coches) {
  const puces = piece.chauffages.map(id => ({ id, coche: coches.indexOf(id) >= 0, introuvable: false }));
  coches.forEach(id => {
    if (piece.chauffages.indexOf(id) < 0) puces.push({ id, coche: true, introuvable: !S[id] });
  });
  return puces;
}

/* Ce qu'une modification de la pièce écrit : le changement, et ses chauffages
 * relus quand la configuration les porte sous une forme ancienne —
 * l'interrupteur d'un module à la place de son `select`. Écrite ainsi, la pièce
 * dit ce que la règle fait. */
function changementDePiece(index, reg, changement) {
  const lus = reg && Array.isArray(reg.chauffages) ? reg.chauffages : null;
  if (!lus || 'chauffages' in changement) return changement;
  const relus = chauffagesRelus(index, lus);
  const pareils = relus.length === lus.length && relus.every((id, i) => id === lus[i]);
  return pareils ? changement : { ...changement, chauffages: relus };
}

export function FenetresReglages({ hass, cardSt }) {
  const h = hass && typeof hass.callWS === 'function' ? hass : null;
  const { etat, setEtat, err, setErr, vivant } =
    useEtatServeur(hass, 'loggia/fenetres/etat', 5000, tr('Réglages indisponibles.'));
  /* Le pli de cette regle — avec les autres etats. */
  const [pliFen, plierFen] = usePli('fenetres:coupure');
  /* Les autres interrupteurs, dépliés pièce par pièce, le temps de l'écran :
   * repliés, ils ne cachent rien de ce qui est coupé. */
  const [autresVus, setAutresVus] = useState({});


  const cfg = (etat && etat.config) || null;

  const enregistrer = async (patch) => {
    if (!h || !cfg) return;
    setEtat(e => {
      if (!e) return e;
      const n = { ...e.config, ...patch };
      if (patch.pieces) {
        n.pieces = { ...(e.config.pieces || {}) };
        for (const nom of Object.keys(patch.pieces)) {
          if (patch.pieces[nom] === null) delete n.pieces[nom];
          else n.pieces[nom] = { ...(n.pieces[nom] || {}), ...patch.pieces[nom] };
        }
      }
      return { ...e, config: n };
    });
    try {
      const r = await h.callWS({ type: 'loggia/fenetres/config', patch });
      if (vivant.current && r && r.config) setEtat(e => (e ? { ...e, config: r.config } : e));
    } catch (e) {
      // Un refus se dit comme tel et nomme sa clé ; une panne reste une panne
      // (audit du 03/10, refus.js). Il s'affichait en « Unauthorized ».
      setErr(raisonEchec(e, 'loggia_fenetres'));
    }
  };

  /* Les pièces candidates : celles qui ont au moins un ouvrant. Une pièce sans
   * capteur d'ouverture n'a rien à offrir à cette règle. */
  const pieces = useMemo(() => piecesCandidates(LOGGIA_INDEX, (hass && hass.states) || {}), [hass]);

  if (!cfg) {
    return (
      <div style={cardSt}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{tr('Fenêtre ouverte')}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: err ? 'var(--o-bad)' : 'var(--o-text3)' }}>
          {err || tr('Chargement…')}
        </div>
      </div>
    );
  }

  const reglees = cfg.pieces || {};
  const simu = !!cfg.simulation;
  const sous = { fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 };
  const label = { fontSize: 12, fontWeight: 700 };
  // La puce partagée (styles.js), avec son rembourrage d'ici : le choix ne
  // se recopie plus (lot 15 de l’audit du 03/10).
  const puce = (on) => ({ ...pucePartagee(on), padding: '6px 11px' });

  const S = (hass && hass.states) || {};

  /* Un module fil pilote se nomme par son APPAREIL (« Radiateur Chambre ») :
   * son `select` s'affiche sous ce nom suivi de celui de l'exposition
   * (« … Pilot wire mode » sous zigbee2mqtt). Comme sa carte et sa fiche
   * (`resolve.js`, `zonesFilPilote`). */
  const nomDe = (id) => {
    const m = familleDe(LOGGIA_INDEX, id) === 'fil_pilote' ? LOGGIA_INDEX.entityMeta.get(id) : null;
    if (m && m.device) return m.device;
    const st = S[id];
    return st ? cvName(st, id) : id;
  };

  /* Toute modification d'une pièce passe par ici : elle réécrit au passage
   * l'interrupteur d'un module coché par une configuration ancienne. */
  const ecrirePiece = (nom, reg, changement) =>
    enregistrer({ pieces: { [nom]: changementDePiece(LOGGIA_INDEX, reg, changement) } });

  /* Activer une pièce la remplit : tous ses ouvrants, ses thermostats et ses
   * modules fil pilote s'il y en a — sinon rien, pour ne pas couper une prise
   * au hasard. Les autres interrupteurs n'y entrent jamais d'office. Une pièce
   * déjà réglée retrouve ses chauffages, relus. */
  const basculerPiece = (p) => {
    const dejaLa = reglees[p.nom];
    if (dejaLa && dejaLa.actif) {
      ecrirePiece(p.nom, dejaLa, { actif: false });
      return;
    }
    const relus = chauffagesRelus(LOGGIA_INDEX, dejaLa && dejaLa.chauffages);
    const surs = p.chauffages.filter(id => chauffeSurement(LOGGIA_INDEX, id, nomDe(id)));
    ecrirePiece(p.nom, dejaLa, {
      actif: true,
      ouvrants: (dejaLa && dejaLa.ouvrants && dejaLa.ouvrants.length) ? dejaLa.ouvrants : p.ouvrants,
      chauffages: relus.length ? relus : surs,
    });
  };

  const basculerEntite = (nomPiece, reg, champ, id, liste) => {
    const dedans = liste.indexOf(id) >= 0;
    ecrirePiece(nomPiece, reg, { [champ]: dedans ? liste.filter(x => x !== id) : [...liste, id] });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* La simulation se dit EN HAUT, pas seulement dans son réglage : sinon
        * on cherche pourquoi rien ne bouge. */}
      {simu && (
        <div role="status" style={{ ...cardSt, border: 'var(--o-bw,1px) solid var(--o-warn2)', fontSize: 12.5, fontWeight: 700, color: 'var(--o-warn2)' }}>
          {tr('Simulation : rien ne bouge, tout est noté.')}
        </div>
      )}
      <div style={cardSt}>
        <RegleEntete nom={tr('Fenêtre ouverte, chauffage coupé')}
          desc={tr('Chauffer une pièce dont la fenêtre est ouverte, c’est chauffer la rue.')}
          on={!!cfg.actif} cb={() => enregistrer({ actif: !cfg.actif })}
          plie={pliFen} onPlier={plierFen} zone="fenetres-fen" />
        {cfg.actif && !pliFen && (
          <div id="fenetres-fen" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <span style={{ ...label, minWidth: 92 }}>{tr('Après')}</span>
            <input aria-label={tr('Délai avant coupure, en minutes')} type="number" value={cfg.delai != null ? cfg.delai : 3} min={0} max={60}
              onChange={e => enregistrer({ delai: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })}
              style={{ width: 78, padding: '9px 12px', borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s2)', color: 'var(--o-text1)', fontSize: 13, fontWeight: 600 }} />
            <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 700 }}>
              {tr('min d’ouverture — le temps d’aérer sans que le radiateur s’arrête pour rien')}
            </span>
          </div>
        )}
        {etat.en_attente && etat.en_attente.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: 'var(--o-warn2)' }}>
            {tr('Décompte en cours : {p}', { p: etat.en_attente.join(', ') })}
          </div>
        )}
        {Object.keys(etat.coupes || {}).length > 0 && (
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: 'var(--o-accent-soft)' }}>
            {tr('Chauffage coupé : {p}', { p: Object.keys(etat.coupes).join(', ') })}
          </div>
        )}
      </div>

      {cfg.actif && !pliFen && pieces.length === 0 && (
        <div style={cardSt}>
          <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600 }}>
            {tr('Aucune pièce avec un capteur d’ouverture. Rangez vos capteurs dans une zone Home Assistant : la détection s’appuie dessus.')}
          </div>
        </div>
      )}

      {cfg.actif && !pliFen && pieces.map((p, rang) => {
        const reg = reglees[p.nom] || null;
        const on = !!(reg && reg.actif);
        const mesOuvrants = (reg && reg.ouvrants) || [];
        // Relus : l'interrupteur d'un module, coché par une configuration
        // ancienne, se montre sur son `select` (choix 17 du plan 2).
        const mesChauffages = chauffagesRelus(LOGGIA_INDEX, reg && reg.chauffages);
        const puces = pucesChauffages(S, p, mesChauffages);
        // Sous le pli, ceux qui ne sont pas cochés : un coché se montre plus
        // haut, avec ce qui est coupé.
        const autres = p.autres.filter(id => mesChauffages.indexOf(id) < 0);
        const autresDeplies = !!autresVus[p.nom];
        const zoneAutres = 'fenetres-autres-' + rang;
        return (
          <div key={p.nom} style={cardSt}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{p.nom}</div>
                {/* Deux nombres dans une même phrase, chacun son accord — une
                  * seule clé aurait donné « 1 ouvrants ». Le second ne compte
                  * que ce qui chauffe vraisemblablement, et peut valoir zéro :
                  * `trN` le met au pluriel, et le polonais à sa forme. */}
                <div style={sous}>
                  {trN(p.ouvrants.length, '{n} ouvrant', '{n} ouvrants')}
                  {' · '}
                  {trN(p.chauffages.length, '{n} chauffage possible', '{n} chauffages possibles')}
                </div>
              </div>
              <Bascule nom={tr('Couper le chauffage dans cette pièce')} on={on} cb={() => basculerPiece(p)} />
            </div>
            {on && (
              <>
                <div style={{ marginTop: 14 }}>
                  <div style={{ ...label, marginBottom: 7 }}>{tr('Surveiller')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {p.ouvrants.map(id => (
                      <button key={id} type="button" aria-pressed={mesOuvrants.indexOf(id) >= 0}
                        onClick={() => basculerEntite(p.nom, reg, 'ouvrants', id, mesOuvrants)}
                        style={puce(mesOuvrants.indexOf(id) >= 0)}>{nomDe(id)}</button>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 13 }}>
                  <div style={{ ...label, marginBottom: 7 }}>{tr('Couper')}</div>
                  {p.chauffages.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600 }}>
                      {tr('Aucun thermostat ni prise dans cette zone.')}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {puces.filter(x => !x.introuvable).map(({ id, coche }) => (
                      <button key={id} type="button" aria-pressed={coche}
                        onClick={() => basculerEntite(p.nom, reg, 'chauffages', id, mesChauffages)}
                        style={puce(coche)}>{nomDe(id)}</button>
                    ))}
                  </div>
                  {/* Renommé ou retiré dans Home Assistant : la règle ne le
                    * retrouve plus. Il reste coché — c'est ce que dit la
                    * configuration —, nommé par son identifiant, et se retire
                    * d'un geste ; la couleur du sens n'est que dans la phrase.
                    * L'identifiant n'a pas d'espace : il passe à la ligne
                    * plutôt que de déborder sur un téléphone, sans être
                    * tronqué — c'est le seul indice de ce qui a changé. */}
                  {puces.filter(x => x.introuvable).map(({ id }) => (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 7 }}>
                      <button type="button" title={tr('Retirer')} aria-label={tr('Retirer') + ' ' + id}
                        onClick={() => basculerEntite(p.nom, reg, 'chauffages', id, mesChauffages)}
                        style={{ ...puce(true), maxWidth: '100%', wordBreak: 'break-all', textAlign: 'left' }}>{id} ×</button>
                      <span style={{ fontSize: 12, color: 'var(--o-warn2)', fontWeight: 700 }}>
                        {tr('Introuvable dans Home Assistant : renommé ou retiré ?')}
                      </span>
                    </div>
                  ))}
                  {/* Le reste, replié sous ce qui chauffe : l'interrupteur d'une
                    * enceinte, celui d'un poêle qui a son thermostat. Rien ne
                    * s'y perd : déplié, chacun se coche comme les autres.
                    * `aria-controls` n'est posé que déplié, comme sur l'en-tête
                    * d'une règle (`RegleEntete`) : replié, la région n'existe
                    * pas. */}
                  {autres.length > 0 && (
                    <>
                      <button type="button" aria-expanded={autresDeplies} aria-controls={autresDeplies ? zoneAutres : undefined}
                        onClick={() => setAutresVus(v => ({ ...v, [p.nom]: !v[p.nom] }))}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, padding: '6px 0', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--o-text2)' }}>
                        <span>{trN(autres.length, 'Autre interrupteur ({n})', 'Autres interrupteurs ({n})')}</span>
                        <Fi i={autresDeplies ? 'angle-small-up' : 'angle-small-down'} size={13} />
                      </button>
                      {autresDeplies && (
                        <div id={zoneAutres} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                          {autres.map(id => (
                            <button key={id} type="button" aria-pressed={false}
                              onClick={() => basculerEntite(p.nom, reg, 'chauffages', id, mesChauffages)}
                              style={puce(false)}>{nomDe(id)}</button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {mesChauffages.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--o-warn2)', fontWeight: 700, marginTop: 7 }}>
                      {tr('Rien à couper : choisissez au moins un appareil.')}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}

      {err && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-bad)' }}>{err}</div>}
    </div>
  );
}

