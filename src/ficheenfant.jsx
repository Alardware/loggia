/* ── La feuille « Réglages parent » du mode enfant (chantier Mode enfant, E13, E14, E19, E20, E23 ; § 6.4 ; sa maquette, cadre 2d) ──
 *
 * La seconde feuille de la fiche d'un lecteur sous profil — ou d'un lecteur qui a une pièce et pas encore de profil (E20) : montée
 * APRÈS le contenu de la fiche (le motif du navigateur de médias), chargée à la demande, ouverte par le pavé du code quand le compte
 * n'est pas administrateur de Home Assistant et n'a pas de laissez-passer (E2 B). Elle écrit par `loggia/enfant/config`, `lever`,
 * `repondre` ; ce que chaque commande rend — la configuration écrite, l'état — remplace celui des cartes (`poserReponseEnfant`) ; un
 * refus `code_admin_requis` — le laissez-passer a expiré — rouvre le pavé (`onCode`), tout autre refus se dit, nommé. Une seule
 * commande en vol.
 *
 * Sa maquette, panneau par panneau, moins ce que la conception écarte (§ 4 : les appels, les applications verrouillées) :
 *  - l'en-tête commun : la plaque `child-head` sur l'accent, « Mode enfant · {nom} », « {n} appareils · code demandé pour modifier »
 *    (ou « Désactivé · aucune limite », « Limites levées jusqu'à {h} »), la bascule « Mode enfant », UNE croix ;
 *  - la demande en attente (E13) : « {nom} demande 15 min de plus », l'appareil et l'heure, Refuser / Accorder 15 min ;
 *  - le volume maximum : la barre de la maison, de 10 à 100 par 5 (piste 32), et la phrase qui dit ce que la maison fait ;
 *  - le temps d'écran, s'il y a un écran : « {t} utilisées aujourd'hui », un segment 30 min · 1 h · 1 h 30 · 2 h · Illimité — UN seul
 *    pour le profil, la semaine et le week-end ensemble : le budget est celui du profil (§ 7.1), pas celui d'un écran ;
 *  - les heures autorisées : « En semaine », « Le week-end », le début et la fin par quart d'heure (`ListeChoix`, jamais un menu natif) ;
 *    la bascule « Au coucher : sons pour dormir » si une Echo du profil a une jumelle HACS, « Prévenir cinq minutes avant par {Echo} »
 *    si une Echo sait parler (E4 B) — rien d'inerte (M11) ;
 *  - « Recevoir les annonces » (E23) : la sœur « Annonces » de l'Echo, un réglage de l'appareil, `switch.turn_on` / `turn_off` ;
 *  - les appareils du profil : « Pièce {pièce} · ajouté tout seul », « Ajouté par vous » et sa croix, « Ajouter un appareil » ;
 *  - au pied : « Lever les limites 30 min » / « Rétablir les limites » (E14), « Code parent » — un administrateur le change sur place
 *    (`loggia/pin/definir`, les règles de Paramètres), les autres lisent où il se change.
 * Elle n'importe jamais App.jsx : ses briques (`RmBascule`, `RmJauge`, `Segment`) lui viennent de la fiche.
 * Elle n'est PAS la feuille (passe bis du 17/10, point 10) : la coquille `FicheEnfant` (fichemedia.jsx) garde le `BottomSheet` et pose
 * la frontière Suspense DEDANS, avec un repli de hauteur — comme `FicheMedia` dans App.jsx. Ce module n'exporte que le contenu : un
 * morceau qui ne se charge pas se dit dans la feuille, par sa barrière, et la feuille s'ouvre pendant le chargement.
 */
import { useState } from 'react';
import { tr, trN, locale } from './i18n.js';
import { ListeChoix, Fi } from './ui.jsx';
import { EnteteFiche, filet } from './fichecommune.jsx';
import { LISERE } from './styles.js';
import { poserReponseEnfant, dureeTexte, profilEnfant, lecteurEnfant } from './enfantetat.js';
import { raisonEchec } from './refus.js';
import { pourcentTexte } from './lecteur.js';
import { useOptimiste } from './optimiste.js';

/* Les panneaux de sa maquette : le gris --o-s3, l'arrondi du thème, le liseré du réglage « Liserés », 12 px entre eux. */
const PANNEAU = { background: 'var(--o-s3)', border: LISERE, borderRadius: 'var(--o-radius,18px)', boxSizing: 'border-box', minWidth: 0, padding: '16px 18px' };
const TITRE = { fontSize: 14, fontWeight: 700 };
const SOUS = { fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 };
const NOTE = { fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', lineHeight: 1.45 };
const RANGEE = (i) => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 0', borderTop: filet(i) });
/* Une puce de sa maquette : le gris doux, sans bordure ; choisie, le bleu plein et le blanc (la règle des puces) ; inerte à .4. */
const PUCE = (choisie = false, peut = true) => ({ border: 'none', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: peut ? 'pointer' : 'default', opacity: peut ? 1 : .4,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, boxSizing: 'border-box', minWidth: 0, height: 44, padding: '0 14px', borderRadius: 12, whiteSpace: 'nowrap',
  background: choisie ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: choisie ? '#fff' : 'var(--o-text1)' });
const CHAMP = { height: 46, padding: '0 12px', borderRadius: 12, background: 'var(--o-s1)', border: LISERE, color: 'var(--o-text)', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, boxSizing: 'border-box', width: '100%', fontVariantNumeric: 'tabular-nums' };

/* Les réglages d'un profil qui n'existe pas encore (E20) : ceux de `profil_defaut` du serveur, mot pour mot. */
const PROFIL_NEUF = (nom, zone) => ({ nom, zone, actif: true, ajouts: [], ecrans: null, volume_max: 40, coucher_max: 20, budget: { semaine: 90, weekend: 90 }, heures: { semaine: ['07:30', '20:30'], weekend: ['08:30', '21:00'] }, dormir: true, voix: true });
// Les heures par quart d'heure : la liste de choix de la maison, jamais un menu natif (sa règle).
const QUARTS = [];
for (let h = 0; h < 24; h++) for (const m of ['00', '15', '30', '45']) { const v = String(h).padStart(2, '0') + ':' + m; QUARTS.push({ id: v, label: v }); }
const BUDGETS = () => [30, 60, 90, 120].map(n => ({ id: n, label: dureeTexte(n) })).concat([{ id: 0, label: tr('Illimité') }]);
const heureDe = (ts) => new Date(Number(ts) * 1000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
/* Le nom d'un appareil : celui de Home Assistant, sinon celui de l'appariement, sinon l'identifiant. */
const nomDe = (S, haid, lecteurs) => {
  const st = S[haid];
  const l = (lecteurs || []).find(p => p && (p.haid === haid || p.ma === haid));
  return (st && st.attributes && st.attributes.friendly_name) || (l && l.name) || haid;
};

/**
 * Le contenu de la feuille. `ident` : le profil (la zone de Home Assistant, E6) ; `nom` et `piece` : le nom du profil et celui de la
 * pièce ; `etat` : `loggia/enfant/etat` (null : pas encore lu) ; `config` : `loggia_enfant` ; `lecteurs` : ceux de la maison
 * (`medPlayers`) ; `briques` : d'App.jsx ; `admin` : le compte est administrateur de Home Assistant ; `onCode` : le laissez-passer a
 * expiré, le pavé doit se rouvrir.
 */
export default function ContenuEnfant({ hass, ident, nom, piece = null, zone, etat = null, config = null, lecteurs = [], briques, admin = false, onCode = null }) {
  const { RmBascule, RmJauge, Segment } = briques;
  const S = (hass && hass.states) || {};
  const profil = profilEnfant(etat, ident);
  const existant = config && config.profils && typeof config.profils === 'object' ? config.profils[ident] : null;
  const neuf = !existant;
  const cfg = { ...PROFIL_NEUF(nom, zone), ...(existant || {}) };
  const [enVol, setEnVol] = useState(false);
  const [erreur, setErreur] = useState('');
  const [ajout, setAjout] = useState(false);
  // L'éditeur du code parent : { a, b, dit, faute } — ouvert quand il existe.
  const [code, setCode] = useState(null);
  /* Une commande à la fois. L'état qu'elle rend — `{config, etat}` pour la configuration, l'état seul pour lever et répondre —
   * remplace celui des cartes et de la fiche, sans attendre leur sondage. */
  const envoyer = (msg) => {
    if (enVol || !hass || typeof hass.callWS !== 'function') return Promise.resolve(null);
    setEnVol(true); setErreur('');
    return Promise.resolve(hass.callWS(msg)).then((r) => {
      poserReponseEnfant(r);
      return r;
    }, (e) => {
      // Le laissez-passer a expiré : le pavé, pas une erreur. Tout autre refus se dit, nommé (refus.js).
      if (e && e.code === 'code_admin_requis') { if (onCode) onCode(); } else setErreur(raisonEchec(e, 'loggia_enfant'));
      return null;
    }).then((r) => { setEnVol(false); return r; });
  };
  // Un profil neuf (E20) porte son nom et sa zone à chaque écriture, jusqu'à ce que le serveur le connaisse.
  const ecrire = (patch) => envoyer({ type: 'loggia/enfant/config', patch: { profils: { [ident]: neuf ? { nom: cfg.nom, zone, ...patch } : patch } } });
  /* Le volume maximum suit le doigt (passe bis 3 du 17/10, point 4 ; sa demande, « quand je règle le volume, le pourcentage ne suit pas
   * comme sur la maquette ») : la barre est celle de la maison (`RmJauge`, `onGlisse`). Le chiffre lit la valeur sous le doigt ; relâché,
   * la valeur posée (`useOptimiste`, 6 s) jusqu'à ce que la configuration la dise — il ne repasse pas par l'ancienne. Celle que
   * l'écriture rend, posée par `envoyer` : sans elle, rien ne relisait la configuration, et 40 revenait au bout des 6 s alors que le
   * serveur tenait 20 (son retour du 18/10). Une écriture refusée, ou qui ne part pas (une autre en vol), la retire : la commande rend null. */
  const [glisseMax, poserGlisseMax] = useState(null);
  const [ovMax, poserOvMax] = useOptimiste(cfg.volume_max);
  const volumeMax = glisseMax != null ? glisseMax : ovMax != null ? ovMax : cfg.volume_max;
  const reglerMax = (v) => { poserOvMax(v); ecrire({ volume_max: v }).then((r) => { if (!r) poserOvMax(null); }); };

  const leve = !!(profil && profil.leve_jusqua);
  const appareils = (profil && Array.isArray(profil.appareils)) ? profil.appareils : [];
  const demande = profil && profil.demande && !profil.demande.reponse ? profil.demande : null;
  const ecrans = appareils.filter(a => a.ecran);
  const utilise = ecrans.reduce((s, a) => { const l = lecteurEnfant(etat, a.entite); return s + (l && l.ecran ? Number(l.ecran.utilise_s) || 0 : 0); }, 0);
  const hacs = appareils.some(a => a.hacs);
  const parleur = appareils.find(a => a.parler) || null;
  const annonceur = appareils.find(a => a.annonces) || null;
  const annoncesOn = annonceur && S[annonceur.annonces] ? S[annonceur.annonces].state === 'on' : false;
  const dansProfil = new Set(appareils.flatMap(a => [a.entite, a.hacs].filter(Boolean)));
  const ajoutables = (lecteurs || []).filter(p => p && p.haid && !dansProfil.has(p.haid) && !(p.ma && dansProfil.has(p.ma))).map(p => ({ id: p.haid, label: p.name || p.haid }));
  const sousNom = !cfg.actif ? tr('Désactivé · aucune limite')
    : leve ? tr('Limites levées jusqu’à {h}', { h: heureDe(profil.leve_jusqua) })
      : trN(appareils.length, '{n} appareil · code demandé pour modifier', '{n} appareils · code demandé pour modifier');
  const heure = (jour, i, v) => { const h = { semaine: [...cfg.heures.semaine], weekend: [...cfg.heures.weekend] }; h[jour][i] = v; ecrire({ heures: h }); };
  // « Recevoir les annonces » : un réglage de l'appareil (E23), un service explicite — jamais une bascule à l'aveugle.
  const basculerAnnonces = () => { if (hass && typeof hass.callService === 'function') hass.callService('switch', annoncesOn ? 'turn_off' : 'turn_on', { entity_id: annonceur.annonces }); };
  const enregistrerCode = () => {
    if (!/^\d{4,8}$/.test(code.a)) { setCode({ ...code, dit: tr('Le code fait de 4 à 8 chiffres.'), faute: true }); return; }
    if (code.a !== code.b) { setCode({ ...code, dit: tr('Les deux codes ne correspondent pas.'), faute: true }); return; }
    if (!hass || typeof hass.callWS !== 'function') return;
    Promise.resolve(hass.callWS({ type: 'loggia/pin/definir', pin: code.a }))
      .then(() => setCode({ a: '', b: '', dit: tr('Code administrateur mis à jour — le même sur tous les appareils.'), faute: false }),
        (e) => setCode(c => (c ? { ...c, dit: raisonEchec(e, 'loggia_code_admin'), faute: true } : c)));
  };
  return (
    <div className="rb-fiche" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <EnteteFiche nom={tr('Mode enfant · {nom}', { nom: cfg.nom })} sousNom={sousNom}
        plaque={{ fond: 'rgba(var(--o-accent-rgb),.16)', encre: 'var(--o-accent-soft)', icone: 'child-head' }}
        epingle={<RmBascule on={!!cfg.actif} nom={tr('Mode enfant')} onToggle={() => ecrire({ actif: !cfg.actif })} />} />

      {erreur && <div role="alert" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--o-bad)' }}>{erreur}</div>}

      {/* La demande en attente (E13) : encadrée d'accent, l'appareil et l'heure, les deux réponses. */}
      {demande && (
        <div data-panneau="demande" style={{ ...PANNEAU, background: 'rgba(var(--o-accent-rgb),.10)', border: 'var(--o-bw,1px) solid rgba(var(--o-accent-rgb),.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Fi i="bell" size={15} color="var(--o-accent-soft)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={TITRE}>{tr('{nom} demande 15 min de plus', { nom: cfg.nom })}</div>
              <div style={SOUS}>{nomDe(S, demande.appareil, lecteurs) + ' · ' + tr('à {h}', { h: heureDe(demande.quand) })}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => envoyer({ type: 'loggia/enfant/repondre', profil: ident, accorder: false })} aria-disabled={enVol || undefined} style={PUCE(false, !enVol)}>{tr('Refuser')}</button>
            <button type="button" onClick={() => envoyer({ type: 'loggia/enfant/repondre', profil: ident, accorder: true })} aria-disabled={enVol || undefined} style={PUCE(true, !enVol)}>{tr('Accorder 15 min')}</button>
          </div>
        </div>
      )}

      {/* Le volume maximum : la barre de la maison, de 10 à 100 par 5, et ce que la maison en fait. */}
      <div data-panneau="volume" style={PANNEAU}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <span style={TITRE}>{tr('Volume maximum')}</span>
          <span data-volume-max="" style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{pourcentTexte(volumeMax)}</span>
        </div>
        <RmJauge v={volumeMax} min={10} pas={5} piste={32} zone={44} marge={10} couleur="var(--o-accent)" label={tr('Volume maximum')} onCommit={reglerMax} onGlisse={poserGlisseMax} />
        <div style={{ ...NOTE, marginTop: 10 }}>{tr('Loggia ramène le volume à ce niveau s’il est monté depuis l’appareil, à la voix ou dans l’appli Alexa. Au coucher : {m} max.', { m: pourcentTexte(cfg.coucher_max) })}</div>
      </div>

      {/* Le temps d'écran, s'il y a un écran dans le profil : un segment pour le profil entier (§ 7.1). */}
      {ecrans.length > 0 && (
        <div data-panneau="temps" style={PANNEAU}>
          <div style={TITRE}>{tr('Temps d’écran') + ' · ' + ecrans.map(a => nomDe(S, a.entite, lecteurs)).join(' · ')}</div>
          <div style={SOUS}>{cfg.budget.semaine ? tr('{t} utilisées aujourd’hui', { t: dureeTexte(utilise / 60) }) : tr('Aucune limite')}</div>
          <div style={{ marginTop: 12 }}>
            <Segment grandir value={cfg.budget.semaine} options={BUDGETS()} onChange={(v) => ecrire({ budget: { semaine: v, weekend: v } })} label={tr('Temps d’écran')} />
          </div>
        </div>
      )}

      {/* Les heures autorisées, puis les sons pour dormir et la voix — seulement si une Echo du profil sait (M11). */}
      <div data-panneau="heures" style={PANNEAU}>
        <div style={TITRE}>{tr('Heures autorisées')}</div>
        {[['semaine', tr('En semaine')], ['weekend', tr('Le week-end')]].map(([jour, mot], i) => (
          <div key={jour} style={RANGEE(i)}>
            <span style={{ ...TITRE, fontSize: 13.5 }}>{mot}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ListeChoix value={cfg.heures[jour][0]} options={QUARTS} onChange={(v) => heure(jour, 0, v)} label={mot + ' · ' + tr('Début')} />
              <span aria-hidden="true" style={{ color: 'var(--o-text3)' }}>–</span>
              <ListeChoix value={cfg.heures[jour][1]} options={QUARTS} onChange={(v) => heure(jour, 1, v)} label={mot + ' · ' + tr('Fin')} />
            </span>
          </div>
        ))}
        {hacs && (
          <div style={RANGEE(1)}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={{ ...TITRE, display: 'block' }}>{tr('Au coucher : sons pour dormir')}</span><span style={{ ...SOUS, display: 'block' }}>{tr('Bruit blanc et musique douce, {m} max', { m: pourcentTexte(cfg.coucher_max) })}</span></span>
            <RmBascule on={!!cfg.dormir} nom={tr('Au coucher : sons pour dormir')} onToggle={() => ecrire({ dormir: !cfg.dormir })} />
          </div>
        )}
        {parleur && (
          <div style={RANGEE(1)}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={{ ...TITRE, display: 'block' }}>{tr('Prévenir cinq minutes avant par {appareil}', { appareil: nomDe(S, parleur.entite, lecteurs) })}</span><span style={{ ...SOUS, display: 'block' }}>{tr('L’Echo dit que l’écran s’éteint dans cinq minutes')}</span></span>
            <RmBascule on={!!cfg.voix} nom={tr('Prévenir cinq minutes avant par {appareil}', { appareil: nomDe(S, parleur.entite, lecteurs) })} onToggle={() => ecrire({ voix: !cfg.voix })} />
          </div>
        )}
      </div>

      {/* « Recevoir les annonces » (E23) : la sœur « Annonces » de l'Echo officielle, un réglage de l'appareil. */}
      {annonceur && (
        <div data-panneau="annonces" style={{ ...PANNEAU, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <span style={{ flex: 1, minWidth: 0 }}><span style={{ ...TITRE, display: 'block' }}>{tr('Recevoir les annonces')}</span><span style={{ ...SOUS, display: 'block' }}>{tr('Les messages envoyés à toute la maison')}</span></span>
          <RmBascule on={annoncesOn} nom={tr('Recevoir les annonces')} onToggle={basculerAnnonces} />
        </div>
      )}

      {/* Les appareils du profil : ceux de la pièce, tout seuls ; ceux que le parent a ajoutés, avec leur croix ; et en ajouter un. */}
      <div data-panneau="appareils" style={PANNEAU}>
        <div style={TITRE}>{tr('Appareils du profil')}</div>
        {appareils.map((a, i) => (
          <div key={a.entite} style={{ ...RANGEE(i), justifyContent: 'flex-start' }}>
            <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text2)' }}><Fi i={a.ecran ? 'screen' : 'speaker'} size={14} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...TITRE, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomDe(S, a.entite, lecteurs)}</span>
              <span style={{ ...SOUS, display: 'block' }}>{a.ajoute ? tr('Ajouté par vous') : tr('Pièce {piece} · ajouté tout seul', { piece: piece || cfg.nom })}</span>
            </span>
            {a.ajoute && (
              <button type="button" onClick={() => ecrire({ ajouts: cfg.ajouts.filter(x => x !== a.entite) })} aria-label={tr('Retirer') + ' ' + nomDe(S, a.entite, lecteurs)} title={tr('Retirer')}
                style={{ ...PUCE(), width: 34, height: 34, padding: 0, borderRadius: 10 }}><Fi i="cross" size={12} /></button>
            )}
          </div>
        ))}
        {neuf && <div style={{ ...NOTE, marginTop: 8 }}>{tr('Les appareils de la pièce s’ajoutent tout seuls à l’enregistrement.')}</div>}
        {ajout ? (
          <div style={{ marginTop: 10 }}>
            <ListeChoix value="" options={ajoutables} onChange={(v) => { setAjout(false); ecrire({ ajouts: [...cfg.ajouts, v] }); }} label={tr('Ajouter un appareil')} vide={tr('Choisir un appareil')} />
          </div>
        ) : ajoutables.length > 0 && (
          <button type="button" onClick={() => setAjout(true)} style={{ ...PUCE(), marginTop: 10 }}><Fi i="plus" size={12} /><span>{tr('Ajouter un appareil')}</span></button>
        )}
      </div>

      {/* Au pied : lever ou rétablir les limites (E14), et le code parent. */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => { if (cfg.actif) envoyer({ type: 'loggia/enfant/lever', profil: ident, minutes: leve ? 0 : 30 }); }} aria-disabled={!cfg.actif || enVol || undefined}
          style={{ ...PUCE(false, !!cfg.actif && !enVol), flex: 1, height: 48 }}>
          <Fi i={leve ? 'lock' : 'unlock'} size={13} /><span>{leve ? tr('Rétablir les limites') : tr('Lever les limites 30 min')}</span>
        </button>
        {admin && (
          <button type="button" onClick={() => setCode(code ? null : { a: '', b: '', dit: '', faute: false })} aria-expanded={!!code} style={{ ...PUCE(!!code), minWidth: 150, height: 48 }}>
            <Fi i="lock" size={13} /><span>{tr('Code parent')}</span>
          </button>
        )}
      </div>
      {!admin && <div style={NOTE}>{tr('Le code se change dans Paramètres, par un administrateur')}</div>}
      {code && (
        <div data-panneau="code" style={PANNEAU}>
          <div style={TITRE}>{tr('Code parent')}</div>
          <div style={SOUS}>{tr('Le même que le code administrateur de Paramètres, sur tous les appareils.')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
            <input type="password" inputMode="numeric" autoComplete="off" value={code.a} aria-label={tr('Nouveau code')} placeholder={tr('Nouveau code')} onChange={(e) => setCode({ ...code, a: e.target.value, dit: '', faute: false })} style={CHAMP} />
            <input type="password" inputMode="numeric" autoComplete="off" value={code.b} aria-label={tr('Confirmer')} placeholder={tr('Confirmer')} onChange={(e) => setCode({ ...code, b: e.target.value, dit: '', faute: false })} style={CHAMP} />
          </div>
          <button type="button" onClick={enregistrerCode} style={{ ...PUCE(true), width: '100%', marginTop: 10 }}>{tr('Enregistrer le code')}</button>
          {code.dit && <div role={code.faute ? 'alert' : 'status'} style={{ ...NOTE, marginTop: 10, color: code.faute ? 'var(--o-bad)' : 'var(--o-ok)', fontWeight: 700 }}>{code.dit}</div>}
        </div>
      )}
    </div>
  );
}
