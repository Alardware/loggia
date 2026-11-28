/* ── La carte et la fiche de la voiture (chantier du 20/11, A11 ; ADR 0386 ; refaites sur ses exemples, ADR 0392) ──
 *
 * Chargées à la demande (`CarteVoiture`, `FicheVoiture` ; cartes/compose.jsx) : une maison sans voiture n'en télécharge rien.
 *
 *  - LA CARTE LARGE (184), le gabarit des cartes IoT : la plaque en haut, le pourcentage NOMMÉ à droite (« Batterie » ou
 *    « Carburant »), le nom 15 px SOUS la plaque, la phrase dessous (« En charge · 1 h 40 », « Verrouillée · 312 km »,
 *    « Ouverte »), et en bas la BARRE de la batterie, le trait de sa limite de charge quand la voiture la publie ;
 *  - LA COMPACTE (88) : la plaque, le nom, la phrase, le pourcentage à droite, la barre en fil au bas ;
 *  - muette : la plaque grise, la phrase « Indisponible depuis 14:20 » en rouge, comme la borne.
 * La fiche : une feuille À ONGLETS, UNE croix (l'en-tête commun) — Voiture, Charge, Climat, Historique ; un onglet n'existe que
 * si la voiture publie de quoi le remplir, une commande que si son entité existe (règle 46). Jamais de déverrouillage, ni
 * klaxon, ni phares : verrouiller ne laisse entrer personne, le reste se fait sur place.
 */
import { Suspense, useId, useState } from 'react';
import { Fi, Surface, nomCarte, Bascule } from './ui.jsx';
import { tr, locale } from './i18n.js';
import { quandLumiere } from './lumieres.js';
import { LISERE } from './styles.js';
import { RM_CARD_HAUT, RM_GAUCHE, RM_ICO, RM_MILIEU, RM_NAME, RM_SUB } from './cartes/briques.jsx';
import { ChiffreNomme, ChiffreNommeHaut } from './cartes/robot.jsx';
import { SURF_CARTE, lavisCarte } from './app/noyau.jsx';
import { commanderService } from './actions.js';
import { useOptimiste } from './optimiste.js';
import { couleurPile } from './attention.js';
import { entitesCompose } from './composes.js';
import { lazyRecharge } from './recharge.js';
import { relTime, heureCourte, dureeMinutes, nombre } from './format.js';
import { EnteteFiche, FicheOnglets, PanneauOnglet, PETITES_CAPITALES, filet, useHistoriquePeriode, PasAPas } from './fichecommune.jsx';
import { PANNEAU, RANGEE, EN_BOUTON, TITRE, SOUS } from './fichekit.js';
import DessinVoiture from './dessinvoiture.jsx';
import { vueVoiture, idPrincipal, pointsDe, kmParJour, sessionsCharge } from './voiturevue.js';

// « Voir sur la carte » : la carte de HA, centrée sur la voiture, chargée à la demande, Leaflet compris (ADR 0321).
const FeuilleCarte = lazyRecharge(() => import('./feuillecarte.jsx'));

const Sans = ({ children }) => children;
const ICONE = 'car-side';
const LISTE = { ...PANNEAU, overflow: 'hidden' };
const VALEUR = { fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const DOUX = { height: 40, padding: '0 14px', borderRadius: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0, background: 'var(--o-s1)', color: 'var(--o-text1)' };
const PASTILLE = { height: 36, padding: '0 13px', borderRadius: 18, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, background: 'var(--o-s1)', color: 'var(--o-text1)', border: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const mix = (c, p) => 'color-mix(in srgb, ' + c + ' ' + p + '%, transparent)';

/** La couleur du pourcentage : la règle des piles pour la batterie, le texte pour le carburant (aucun seuil deviné). */
const couleurChiffre = (ch) => (ch && ch.batterie && ch.u === '%' ? couleurPile(ch.pct, 'var(--o-text)') : 'var(--o-text)');
/** La couleur de la barre : verte en charge, la règle des piles sinon, l'accent du thème au repos. */
const couleurBarre = (v) => (v.enCharge ? 'var(--o-ok)' : couleurPile(v.chiffre ? v.chiffre.pct : 100, 'var(--o-accent)'));

/** La barre de la batterie, le trait de la limite de charge quand la voiture la publie. */
function Barre({ v, haut = 6, trait = true }) {
  const ch = v.chiffre;
  if (!ch || !ch.batterie) return null;
  const pct = Math.max(0, Math.min(100, ch.pct));
  const limite = v.charge && v.charge.limite && v.charge.limite.unite === '%' ? Math.max(0, Math.min(100, v.charge.limite.n)) : null;
  return (
    <div aria-hidden="true" data-barre="" style={{ position: 'relative', height: haut, borderRadius: haut / 2, background: 'var(--o-well)' }}>
      <div className={v.enCharge ? 'vo-remplit' : undefined} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct + '%', borderRadius: haut / 2, background: couleurBarre(v) }} />
      {trait && limite != null && limite < 100 && <div data-limite="" style={{ position: 'absolute', left: 'calc(' + limite + '% - 1px)', top: -3, bottom: -3, width: 2, borderRadius: 1, background: 'var(--o-text2)' }} />}
    </div>
  );
}

/** Les portières ouvertes, du côté où les dessiner : l'arrière quand leur nom le dit, l'avant sinon. */
const cotes = (noms) => {
  const out = [];
  (noms || []).forEach(n => { const c = /arri|rear|back|hinten|achter|poster|tras|tył|tyl/i.test(String(n)) ? 'arriere' : 'avant'; if (out.indexOf(c) < 0) out.push(c); });
  return out;
};
const etatDessin = (v) => ({ branchee: !!v.branchee, enCharge: !!v.enCharge, ouverts: cotes(v.ouverts), clim: !!(v.climat && v.climat.on), muette: v.mort });

export function CarteVoiture({ c, hass, nom = null, chip = false, onOpen = null, Glyphe = Sans }) {
  const S = (hass && hass.states) || {};
  const vue = vueVoiture({ c, S, nom });
  if (!vue) return null;
  /* Muette : « Indisponible depuis 14:20 », en rouge — depuis que la DERNIÈRE de ses entités s'est tue (la règle de la lumière) ;
   * sans heure lisible, « Indisponible ». */
  const tues = vue.mort ? entitesCompose(c).map(x => (S[x] ? Date.parse(S[x].last_changed || '') : NaN)).filter(Number.isFinite) : [];
  const depuis = tues.length ? quandLumiere(Math.max(...tues)) : null;
  const v = vue.mort ? { ...vue, phrase: { texte: depuis ? tr('Indisponible depuis {h}', { h: depuis }) : tr('Indisponible'), encre: 'var(--o-bad)' } } : vue;
  const id = idPrincipal(c);
  const [fond, encre] = v.plaque;
  const ch = v.chiffre;
  const label = nomCarte(v.nom, v.phrase.texte, ch ? ch.v + ' ' + ch.u + ' ' + ch.nom : null);
  const fondCarte = v.etat === 'charge' ? lavisCarte('var(--o-ok-rgb)', .12, .03) : SURF_CARTE;
  const plaque = (style, taille) => <span className={chip ? 'o-cvico' : undefined} style={style}><Glyphe id={id} size={taille}><Fi i={ICONE} size={taille} /></Glyphe></span>;
  if (chip) {
    return (
      <div className={'o-piece o-cvdense' + (v.mort ? ' o-panne' : '')}
        style={{ position: 'relative', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 14px', borderRadius: 'var(--o-radius,18px)', cursor: onOpen ? 'pointer' : 'default', background: fondCarte, border: LISERE, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', transition: 'all .25s' }}>
        {onOpen && <Surface onClick={onOpen} label={label} />}
        <div className="o-cvrow" style={{ display: 'flex', alignItems: 'center' }}>
          {plaque({ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: fond, color: encre }, 15)}
          <div className="o-cvtxt">
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.nom}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: v.phrase.encre, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.phrase.texte}</div>
          </div>
          {ch && <span className="o-cvmesure" style={{ fontSize: 13, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: couleurChiffre(ch) }}>{ch.v}{ch.u ? ' ' + ch.u : ''}</span>}
        </div>
        {/* La barre en fil, au bas de la compacte : la batterie d'un coup d'œil, sans rien pousser. */}
        {!v.mort && ch && ch.batterie && <div style={{ position: 'absolute', left: 14, right: 14, bottom: 7 }}><Barre v={v} haut={3} trait={false} /></div>}
      </div>
    );
  }
  return (
    <div className={'o-rmcard o-gabarit' + (v.mort ? ' o-panne' : '')} data-voiture=""
      style={{ ...RM_CARD_HAUT, position: 'relative', cursor: onOpen ? 'pointer' : 'default', background: fondCarte, border: LISERE }}>
      {onOpen && <Surface onClick={onOpen} label={label} />}
      {/* Le dessin de la voiture en filigrane, au-dessus de la barre, sans la borne (son choix B du 24/11) : il dit l'état d'un
        * coup d'œil — le câble vert branchée, le courant qui coule en charge, une portière ouverte en ambre. Pas pour une muette. */}
      {!v.mort && (
        <span aria-hidden="true" data-filigrane="" style={{ position: 'absolute', right: 8, bottom: 26, width: 112, opacity: 0.6, pointerEvents: 'none' }}>
          <DessinVoiture etat={etatDessin(v)} borne={false} largeur={112} />
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        {plaque(RM_ICO(fond, encre), 17)}
        {ch && <ChiffreNommeHaut v={ch.v} u={ch.u} nom={ch.nom} couleur={couleurChiffre(ch)} />}
      </div>
      {/* Le nom sous la plaque, comme sur toutes les cartes (`RM_MILIEU`) ; sa colonne reste en haut (`RM_GAUCHE`). */}
      <div style={RM_MILIEU}>
        <div style={RM_GAUCHE}>
          <div className="o-gab-nom" style={{ ...RM_NAME, fontSize: 15 }}>{v.nom}</div>
          <div className="o-gab-phrase" style={{ ...RM_SUB, color: v.phrase.encre, '--o-n': Math.max(1, v.phrase.texte.length) }}>{v.phrase.texte}</div>
        </div>
        {ch && <ChiffreNomme v={ch.v} u={ch.u} nom={ch.nom} couleur={couleurChiffre(ch)} />}
      </div>
      {!v.mort && ch && ch.batterie && <div data-pied="" style={{ marginTop: 'auto', paddingTop: 10 }}><Barre v={v} /></div>}
    </div>
  );
}

/* ════════════ La fiche ════════════ */

// Une action rapide : un rond de 52 px et son libellé ; en marche, le rond en bleu plein (le patron du purificateur, ADR 0387).
function Action({ icone, mot, nom = null, on = false, peut = true, onClick }) {
  return (
    <button type="button" aria-pressed={on} aria-label={nom || undefined} aria-disabled={peut ? undefined : true} onClick={() => { if (peut) onClick(); }}
      style={{ border: 'none', background: 'none', padding: '6px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, minWidth: 0, fontFamily: 'inherit', cursor: peut ? 'pointer' : 'default', opacity: peut ? 1 : 0.4 }}>
      <span style={{ width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)', boxShadow: on ? '0 6px 18px rgba(var(--o-accent-rgb),.35)' : 'none' }}>
        <Fi i={icone} size={20} /></span>
      <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.25, textAlign: 'center', textWrap: 'balance', overflowWrap: 'anywhere', color: on ? 'var(--o-accent)' : 'var(--o-text2)', maxWidth: '100%' }}>{mot}</span>
    </button>
  );
}

/** Le gros chiffre de la batterie, l'autonomie à droite, la barre et sa limite. */
function Batterie({ v }) {
  const ch = v.chiffre;
  if (!ch) return null;
  const limite = v.charge && v.charge.limite;
  const k = v.charge;
  // En charge : la puissance et l'heure de fin, quand la voiture les publie (« En charge » est déjà sous le nom).
  const ch2 = v.enCharge && k ? [k.puissance && k.puissance.n > 0 && k.puissance.valeur + ' ' + k.puissance.unite,
    k.fin != null && tr('fin vers {h}', { h: heureCourte(k.fin) })].filter(Boolean).join(' · ') || tr('En charge') : null;
  return (
    <div data-batterie="" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: couleurChiffre(ch) }}>{ch.v}</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--o-text2)' }}>{ch.u}</span>
        </span>
        {v.autonomie && (
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{v.autonomie.valeur}<span style={{ fontSize: 13, color: 'var(--o-text2)', marginLeft: 4 }}>{v.autonomie.unite}</span></span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--o-text3)' }}>{tr('d’autonomie')}</span>
          </span>
        )}
      </div>
      <Barre v={v} haut={10} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
        {ch2 && <span data-encharge="" style={{ color: 'var(--o-ok)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch2}</span>}
        {limite && limite.unite === '%' && <span style={{ color: 'var(--o-text3)', marginLeft: 'auto', flexShrink: 0 }}>{tr('limite {n} %', { n: nombre(limite.n, 0) })}</span>}
      </div>
    </div>
  );
}

/** Le climat : `climate` (marche par le premier mode qu'elle publie), interrupteur, ou bouton qui lance. */
function basculerClimat(hass, cl, on, annuler = undefined) {
  if (!cl || !cl.id) return;
  if (cl.domaine === 'climate') commanderService(hass, cl.id, 'climate', 'set_hvac_mode', { entity_id: cl.id, hvac_mode: on ? 'off' : (cl.modeMarche || 'heat_cool') }, annuler);
  else if (cl.domaine === 'switch') commanderService(hass, cl.id, 'switch', on ? 'turn_off' : 'turn_on', { entity_id: cl.id }, annuler);
  else if (cl.domaine === 'button') commanderService(hass, cl.id, 'button', 'press', { entity_id: cl.id }, annuler);
}
const basculer = (hass, b, annuler = undefined) => commanderService(hass, b.id, 'switch', b.on ? 'turn_off' : 'turn_on', { entity_id: b.id }, annuler);

function OngletVoiture({ hass, c, v, onCarte, onFiche }) {
  const S = (hass && hass.states) || {};
  const [ovVerrou, poserVerrou] = useOptimiste(v.verrouillee);
  const [ovClim, poserClim] = useOptimiste(v.climat ? v.climat.on : null);
  const [ovGivre, poserGivre] = useOptimiste(v.climat && v.climat.degivrage ? v.climat.degivrage.on : null);
  const verrouillee = ovVerrou != null ? ovVerrou : v.verrouillee;
  const cl = v.climat;
  const climOn = cl ? (ovClim != null ? ovClim : cl.on) : false;
  const givre = cl && cl.degivrage ? (ovGivre != null ? ovGivre : cl.degivrage.on) : false;
  const lock = c.verrou && String(c.verrou).split('.')[0] === 'lock' && S[c.verrou] ? c.verrou : null;
  const pos = c.position && S[c.position] && S[c.position].attributes ? S[c.position].attributes : null;
  const surCarte = !!(onCarte && pos && Number.isFinite(Number(pos.latitude)) && Number.isFinite(Number(pos.longitude)));
  const compteur = v.lignes.find(l => l.cle === 'kilometrage');
  const dehors = v.temps && v.temps.exterieur;

  const pastilles = [
    v.verrouillee != null && <span key="verrou" data-pastille="verrou" style={{ ...PASTILLE, color: verrouillee ? 'var(--o-text1)' : 'var(--o-warn2)' }}><Fi i={verrouillee ? 'lock' : 'unlock'} size={14} />{verrouillee ? tr('Verrouillée') : tr('Déverrouillée')}</span>,
    v.position && (surCarte
      ? <button key="position" type="button" data-pastille="position" onClick={onCarte} style={{ ...PASTILLE, cursor: 'pointer' }}><Fi i="marker" size={14} />{v.position}<Fi i="angle-small-right" size={12} /></button>
      : <span key="position" data-pastille="position" style={PASTILLE}><Fi i="marker" size={14} />{v.position}</span>),
    compteur && <span key="km" data-pastille="compteur" style={PASTILLE}><Fi i="tachometer-fast" size={14} />{compteur.valeur + (compteur.unite ? ' ' + compteur.unite : '')}</span>,
    dehors && <span key="dehors" data-pastille="dehors" style={PASTILLE}><Fi i="thermometer-half" size={14} />{tr('{t} dehors', { t: dehors.valeur + ' ' + dehors.unite })}</span>,
  ].filter(Boolean);

  const actions = [
    lock && verrouillee === false && <Action key="verrou" icone="lock" mot={tr('Verrouiller')} nom={tr('Verrouiller') + ' ' + v.nom} onClick={() => { poserVerrou(true); commanderService(hass, lock, 'lock', 'lock', { entity_id: lock }, () => poserVerrou(null)); }} />,
    cl && cl.id && <Action key="clim" icone="snowflake" mot={cl.domaine === 'button' ? tr('Lancer le climat') : tr('Climat')} on={climOn}
      onClick={() => { if (cl.domaine !== 'button') poserClim(!climOn); basculerClimat(hass, cl, climOn, () => poserClim(null)); }} />,
    cl && cl.degivrage && <Action key="givre" icone="wind" mot={tr('Dégivrage')} on={givre} onClick={() => { poserGivre(!givre); basculer(hass, { ...cl.degivrage, on: givre }, () => poserGivre(null)); }} />,
  ].filter(Boolean);

  // Les rangées qui restent : ce que la tête ne dit pas déjà (la batterie, l'autonomie principale, la charge, le verrou, le compteur).
  const DITES = ['batterie', 'kilometrage', 'recharge', 'verrou'];
  const lignes = v.lignes.filter(l => DITES.indexOf(l.cle) < 0 && l.cle !== 'autonomie:' + c.autonomie && !(l.cle === 'carburant' && !c.batterie));
  if (v.conso) lignes.push({ cle: 'conso', titre: tr('Consommation moyenne'), valeur: v.conso.valeur, unite: v.conso.unite });
  const derniers = entitesCompose(c).map(x => (S[x] ? Date.parse(S[x].last_updated || S[x].last_changed || '') : NaN)).filter(Number.isFinite);
  const dernier = derniers.length ? new Date(Math.max(...derniers)).toISOString() : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div data-panneau="voiture" style={LISTE}>
        <div style={{ padding: '18px 16px 4px', display: 'flex', justifyContent: 'center' }}>
          <DessinVoiture etat={etatDessin(v)} largeur={340} titre={v.phrase.texte} />
        </div>
        {v.chiffre && <div style={{ padding: '6px 18px 16px' }}><Batterie v={v} /></div>}
        {pastilles.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 16px 16px' }}>{pastilles}</div>}
        {actions.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + actions.length + ', minmax(0, 1fr))', gap: 4, padding: '4px 10px 14px', borderTop: filet(1) }}>{actions}</div>}
      </div>
      <div data-lignes="" style={LISTE}>
        {lignes.map((l, i) => (
          <div key={l.cle} data-ligne={l.cle} style={{ ...RANGEE, borderTop: filet(i), alignItems: l.items ? 'flex-start' : 'center', justifyContent: 'space-between' }}>
            <span style={{ ...TITRE, minWidth: 0, overflowWrap: 'break-word' }}>{l.titre}</span>
            {l.items ? (
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, minWidth: 0 }}>
                {l.items.map(p => (
                  <span key={p.id} data-pneu={p.bas ? 'bas' : ''} style={{ display: 'flex', alignItems: 'baseline', gap: 10, justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: p.bas ? 'var(--o-warn)' : 'var(--o-text2)', textAlign: 'right' }}>{p.nom}</span>
                    {p.valeur != null && <span style={{ ...VALEUR, color: p.bas ? 'var(--o-warn)' : 'var(--o-text)' }}>{p.valeur + (p.unite ? ' ' + p.unite : '')}</span>}
                  </span>
                ))}
              </span>
            ) : <span style={{ ...VALEUR, color: l.encre || 'var(--o-text)', textAlign: 'right' }}>{l.valeur + (l.unite ? ' ' + l.unite : '')}</span>}
          </div>
        ))}
        <div style={{ ...RANGEE, borderTop: filet(lignes.length) }}>
          <span style={{ ...TITRE, flex: 1, minWidth: 0 }}>{tr('Dernier signal')}</span>
          <span style={{ ...VALEUR, color: 'var(--o-text2)' }}>{dernier ? relTime(dernier) : '—'}</span>
        </div>
        {onFiche && idPrincipal(c) && (
          <button type="button" onClick={() => onFiche(idPrincipal(c))} style={{ ...RANGEE, ...EN_BOUTON, borderTop: filet(1) }}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('L’appareil')}</span><span style={SOUS}>{tr('L’épingle, les commandes et toutes ses entités')}</span></span>
            <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Un réglage numérique de la charge : moins, la valeur, plus — d'un pas de 5 pour un pourcentage réglé au point près. */
function Reglage({ hass, titre, sous = null, r }) {
  const [ov, poser] = useOptimiste(r.n);
  const v = ov != null ? ov : r.n;
  const pas = r.unite === '%' ? Math.max(r.pas, 5) : r.pas;
  const vers = (sens) => {
    const brut = sens > 0 ? Math.floor(v / pas) * pas + pas : Math.ceil(v / pas) * pas - pas;
    const n = Math.max(r.min != null ? r.min : -Infinity, Math.min(r.max != null ? r.max : Infinity, brut));
    return n === v ? null : n;
  };
  const regler = (n) => { if (n == null) return; poser(n); commanderService(hass, r.id, 'number', 'set_value', { entity_id: r.id, value: n }, () => poser(null)); };
  return (
    <div style={{ ...RANGEE, justifyContent: 'space-between' }}>
      <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{titre}</span>{sous && <span style={SOUS}>{sous}</span>}</span>
      {r.reglable
        ? <PasAPas nom={titre} valeur={nombre(v, 0) + ' ' + r.unite} peutMoins={vers(-1) != null} peutPlus={vers(1) != null} moins={() => regler(vers(-1))} plus={() => regler(vers(1))} />
        : <span style={VALEUR}>{nombre(v, 0) + ' ' + r.unite}</span>}
    </div>
  );
}

function OngletCharge({ hass, v }) {
  const ch = v.charge;
  const [ovCmd, poserCmd] = useOptimiste(ch.commande && ch.commande.type === 'switch' ? ch.commande.on : null);
  const [ovTrappe, poserTrappe] = useOptimiste(ch.trappe ? ch.trappe.ouverte : null);
  const enCharge = ch.enCharge;
  const titre = enCharge ? tr('En charge') : ch.branchee ? tr('Branchée') : tr('Débranchée');
  const encre = enCharge ? 'var(--o-ok)' : ch.branchee ? 'var(--o-text1)' : 'var(--o-text2)';
  const puissance = enCharge && ch.puissance && ch.puissance.n > 0 ? ch.puissance : null;
  const sous = enCharge
    ? [ch.reste != null && tr('Reste {d}', { d: dureeMinutes(ch.reste) }), ch.fin != null && tr('fin vers {h}', { h: heureCourte(ch.fin) })].filter(Boolean).join(' · ')
    : ch.branchee ? tr('Prête à charger') : tr('Câble débranché');
  const cmdOn = ch.commande && ch.commande.type === 'switch' ? (ovCmd != null ? ovCmd : ch.commande.on) : null;
  const trappe = ch.trappe ? (ovTrappe != null ? ovTrappe : ch.trappe.ouverte) : null;
  const de = v.chiffre && v.chiffre.batterie ? nombre(v.chiffre.pct, 0) + ' %' : null;
  const rangees = [
    ch.commande && ch.commande.type === 'switch' && (
      <div key="cmd" style={{ ...RANGEE, justifyContent: 'space-between' }}>
        <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('Charger')}</span><span style={SOUS}>{cmdOn ? tr('La charge est demandée') : tr('La charge est arrêtée')}</span></span>
        <Bascule on={!!cmdOn} nom={tr('Charger')} cb={() => { poserCmd(!cmdOn); commanderService(hass, ch.commande.id, 'switch', cmdOn ? 'turn_off' : 'turn_on', { entity_id: ch.commande.id }, () => poserCmd(null)); }} />
      </div>
    ),
    ch.commande && ch.commande.type === 'boutons' && (
      <div key="boutons" style={{ ...RANGEE, gap: 8, flexWrap: 'wrap' }}>
        {ch.commande.demarrer && <button type="button" style={DOUX} onClick={() => commanderService(hass, ch.commande.demarrer, 'button', 'press', { entity_id: ch.commande.demarrer })}><Fi i="bolt" size={13} />{tr('Démarrer la charge')}</button>}
        {ch.commande.arreter && <button type="button" style={DOUX} onClick={() => commanderService(hass, ch.commande.arreter, 'button', 'press', { entity_id: ch.commande.arreter })}><Fi i="stop" size={13} />{tr('Arrêter la charge')}</button>}
      </div>
    ),
    ch.limite && <Reglage key="limite" hass={hass} titre={tr('Limite de charge')} sous={tr('Elle s’arrête à ce niveau')} r={ch.limite} />,
    ch.courant && <Reglage key="courant" hass={hass} titre={tr('Courant de charge')} r={ch.courant} />,
    ch.trappe && (
      <div key="trappe" style={{ ...RANGEE, justifyContent: 'space-between' }}>
        <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('Trappe de charge')}</span><span style={SOUS}>{trappe ? tr('Ouverte') : tr('Fermée')}</span></span>
        {(trappe ? ch.trappe.peutFermer : ch.trappe.peutOuvrir) && (
          <button type="button" style={DOUX} onClick={() => { poserTrappe(!trappe); commanderService(hass, ch.trappe.id, 'cover', trappe ? 'close_cover' : 'open_cover', { entity_id: ch.trappe.id }, () => poserTrappe(null)); }}>
            {trappe ? tr('Fermer') : tr('Ouvrir')}</button>
        )}
      </div>
    ),
  ].filter(Boolean);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div data-panneau="charge" style={{ ...LISTE, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={PETITES_CAPITALES}>{tr('RECHARGE')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 52, height: 52, borderRadius: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: enCharge ? mix('var(--o-ok)', 18) : 'var(--o-s1)', color: encre }}>
            <Fi i={enCharge ? 'bolt' : 'charging-station'} size={22} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 20, fontWeight: 800, color: encre }}>{titre}</span>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{sous}</span>
          </span>
          {puissance && <span style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{puissance.valeur}<span style={{ fontSize: 13, color: 'var(--o-text2)', marginLeft: 4 }}>{puissance.unite}</span></span>}
        </div>
        {v.chiffre && v.chiffre.batterie && <Barre v={v} haut={10} />}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 700, color: 'var(--o-text2)' }}>
          {de && <span>{ch.limite && ch.limite.unite === '%' ? tr('{de} → limite {a} %', { de, a: nombre(ch.limite.n, 0) }) : de}</span>}
          {enCharge && ch.ajoutee && ch.ajoutee.n > 0 && <span>{tr('+{e} pris', { e: ch.ajoutee.valeur + ' ' + ch.ajoutee.unite })}</span>}
        </div>
      </div>
      {rangees.length > 0 && <div data-panneau="reglages" style={LISTE}>{rangees.map((r, i) => <div key={r.key} style={{ borderTop: filet(i) }}>{r}</div>)}</div>}
    </div>
  );
}

/** Une bascule de la voiture (le dégivrage, le volant chauffant), son état avancé tout de suite et rendu si l'ordre échoue. */
function RangeeBascule({ hass, b, titre, premier }) {
  const [ov, poser] = useOptimiste(b.on);
  const x = ov != null ? ov : b.on;
  return (
    <div style={{ ...RANGEE, justifyContent: 'space-between', borderTop: filet(premier ? 0 : 1) }}>
      <span style={{ ...TITRE, flex: 1, minWidth: 0 }}>{titre}</span>
      <Bascule on={!!x} nom={titre} cb={() => { poser(!x); basculer(hass, { ...b, on: x }, () => poser(null)); }} />
    </div>
  );
}

function OngletClimat({ hass, v }) {
  const cl = v.climat;
  const [ovOn, poserOn] = useOptimiste(cl.on);
  const [ovConsigne, poserConsigne] = useOptimiste(cl.consigne);
  const on = ovOn != null ? ovOn : cl.on;
  const consigne = ovConsigne != null ? ovConsigne : cl.consigne;
  const t = v.temps || {};
  const regler = (n) => { poserConsigne(n); commanderService(hass, cl.id, 'climate', 'set_temperature', { entity_id: cl.id, temperature: n }, () => poserConsigne(null)); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div data-panneau="climat" style={{ ...LISTE, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={PETITES_CAPITALES}>{tr('DANS LA VOITURE')}</span>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          {t.interieur ? (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{t.interieur.valeur}</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--o-text2)' }}>{t.interieur.unite}</span>
            </span>
          ) : <span />}
          {t.exterieur && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--o-text2)' }}>{tr('{t} dehors', { t: t.exterieur.valeur + ' ' + t.exterieur.unite })}</span>}
        </div>
        {cl.id && cl.domaine !== 'button' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('Climatisation')}</span><span style={{ ...SOUS, color: on ? 'var(--o-accent)' : 'var(--o-text2)' }}>{on ? tr('En marche') : tr('Arrêtée')}</span></span>
            <Bascule on={!!on} nom={tr('Climatisation')} cb={() => { poserOn(!on); basculerClimat(hass, cl, on, () => poserOn(null)); }} />
          </div>
        )}
        {cl.domaine === 'button' && <button type="button" style={{ ...DOUX, alignSelf: 'flex-start' }} onClick={() => basculerClimat(hass, cl, false)}><Fi i="snowflake" size={13} />{tr('Lancer le climat')}</button>}
        {cl.domaine === 'climate' && consigne != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ ...TITRE, flex: 1, minWidth: 0 }}>{tr('Consigne')}</span>
            <PasAPas nom={tr('Consigne')} valeur={nombre(consigne, 1, 0) + ' ' + cl.unite} peutMoins={consigne - cl.pas >= cl.min} peutPlus={consigne + cl.pas <= cl.max}
              moins={() => regler(Math.round((consigne - cl.pas) * 10) / 10)} plus={() => regler(Math.round((consigne + cl.pas) * 10) / 10)} />
          </div>
        )}
      </div>
      {(cl.degivrage || cl.volant) && (
        <div style={LISTE}>
          {cl.degivrage && <RangeeBascule hass={hass} b={cl.degivrage} titre={tr('Dégivrage')} premier />}
          {cl.volant && <RangeeBascule hass={hass} b={cl.volant} titre={tr('Volant chauffant')} premier={!cl.degivrage} />}
        </div>
      )}
    </div>
  );
}

const L = 320, H = 120;
function OngletHistorique({ hass, c, v }) {
  const maintenant = Date.now();
  const cle = String(Math.floor(maintenant / 600000));
  const lu = useHistoriquePeriode(hass, { ids: [c.batterie, c.compteur, c.charge].filter(Boolean), jours: 7, cle });
  if (lu == null) return <div style={{ minHeight: 260 }} />;
  if (lu === 'erreur') return <div role="status" style={{ ...LISTE, ...RANGEE, fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Historique indisponible pour le moment')}</div>;
  const listeDe = (eid) => lu.find(l => Array.isArray(l) && l.length && l[0].entity_id === eid) || [];
  const debut = maintenant - 7 * 86400000;
  const bat = c.batterie ? pointsDe(listeDe(c.batterie)) : [];
  const km = c.compteur ? kmParJour(pointsDe(listeDe(c.compteur)), maintenant, 7) : [];
  const sessions = c.charge ? sessionsCharge(listeDe(c.charge), bat, maintenant) : [];
  const x = (t) => Math.max(0, Math.min(L, ((t - debut) / (maintenant - debut)) * L));
  const y = (n) => H - (Math.max(0, Math.min(100, n)) / 100) * H;
  let ligne = '';
  bat.forEach(([t, n], i) => { ligne += (i ? ' L' : 'M') + x(t).toFixed(1) + ' ' + y(n).toFixed(1); });
  if (bat.length) ligne += ' L' + L + ' ' + y(bat[bat.length - 1][1]).toFixed(1);
  const aire = ligne ? ligne + ' L' + L + ' ' + H + ' L' + x(bat[0][0]).toFixed(1) + ' ' + H + ' Z' : '';
  const limite = v.charge && v.charge.limite && v.charge.limite.unite === '%' ? v.charge.limite.n : null;
  const kmMax = Math.max(1, ...km.map(k => k.km || 0));
  const kmTotal = km.reduce((a, k) => a + (k.km || 0), 0);
  const jourCourt = (t) => new Date(t).toLocaleDateString(locale(), { weekday: 'short' }).replace('.', '');
  const st = c.compteur && hass.states[c.compteur];
  const unite = (st && st.attributes && st.attributes.unit_of_measurement) || 'km';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {bat.length > 1 && (
        <div data-graphe="batterie" style={{ ...PANNEAU, padding: '16px 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <span style={PETITES_CAPITALES}>{tr('BATTERIE · 7 JOURS')}</span>
            {limite != null && <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--o-text2)' }}>{tr('limite {n} %', { n: nombre(limite, 0) })}</span>}
          </div>
          <svg role="img" aria-label={tr('Batterie sur 7 jours')} width="100%" height={H} viewBox={'0 0 ' + L + ' ' + H} preserveAspectRatio="none" style={{ display: 'block' }}>
            {sessions.map((s, i) => <rect key={i} x={x(s.debut)} y="0" width={Math.max(1, x(s.fin || maintenant) - x(s.debut))} height={H} style={{ fill: mix('var(--o-ok)', 14) }} />)}
            {[25, 50, 75].map(n => <line key={n} x1="0" x2={L} y1={y(n)} y2={y(n)} style={{ stroke: 'var(--o-bd3)' }} strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
            {limite != null && <line x1="0" x2={L} y1={y(limite)} y2={y(limite)} style={{ stroke: 'var(--o-text3)' }} strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
            {aire && <path d={aire} style={{ fill: mix('var(--o-accent)', 18) }} />}
            {ligne && <path d={ligne} fill="none" style={{ stroke: 'var(--o-accent)' }} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          </svg>
          <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--o-text3)' }}>
            {km.length ? km.map(k => <span key={k.debut}>{jourCourt(k.debut)}</span>) : <><span>{tr('il y a 7 jours')}</span><span>{tr('maintenant')}</span></>}
          </div>
        </div>
      )}
      {km.some(k => k.km != null) && (
        <div data-graphe="km" style={{ ...PANNEAU, padding: '16px 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <span style={PETITES_CAPITALES}>{tr('KILOMÈTRES PAR JOUR')}</span>
            <span style={{ fontSize: 12, fontWeight: 800 }}>{tr('{n} sur 7 jours', { n: nombre(kmTotal, 0) + ' ' + unite })}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + km.length + ', minmax(0, 1fr))', gap: 8, alignItems: 'end', height: 110 }}>
            {km.map(k => (
              <div key={k.debut} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--o-text2)', fontVariantNumeric: 'tabular-nums' }}>{k.km != null ? nombre(k.km, 0) : ''}</span>
                <span style={{ width: '100%', maxWidth: 28, borderRadius: 6, background: 'var(--o-accent)', opacity: k.km ? 0.85 : 0.25, height: Math.max(3, Math.round(((k.km || 0) / kmMax) * 78)) }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text3)' }}>{jourCourt(k.debut)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {sessions.length > 0 && (
        <div data-liste="recharges" style={LISTE}>
          <div style={{ ...PETITES_CAPITALES, padding: '14px 18px 6px' }}>{tr('RECHARGES')}</div>
          {sessions.slice(0, 6).map(s => (
            <div key={s.debut} style={{ ...RANGEE, gap: 12, borderTop: filet(1), minHeight: 52 }}>
              <Fi i="bolt" size={14} color="var(--o-ok)" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={TITRE}>{new Date(s.debut).toLocaleDateString(locale(), { weekday: 'long' }) + ' · ' + heureCourte(s.debut) + (s.fin ? ' → ' + heureCourte(s.fin) : '')}</span>
                <span style={SOUS}>{s.fin ? dureeMinutes((s.fin - s.debut) / 60000) : tr('En cours')}</span>
              </span>
              {s.de != null && s.a != null && <span style={VALEUR}>{nombre(s.de, 0) + ' → ' + nombre(s.a, 0) + ' %'}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FicheVoiture({ c, hass, nom = null, onFiche = null, Glyphe = null, ongletDepart = 'accueil' }) {
  const S = (hass && hass.states) || {};
  const v = vueVoiture({ c, S, nom });
  const idOnglets = useId();
  const [onglet, setOnglet] = useState(ongletDepart);
  const [carte, setCarte] = useState(false);
  if (!v) return null;
  const id = idPrincipal(c);
  const onglets = [['accueil', tr('Voiture'), ICONE], !v.mort && v.charge && ['charge', tr('Charge'), 'charging-station'], !v.mort && v.climat && ['climat', tr('Climat'), 'snowflake'],
    !v.mort && (c.batterie || c.compteur) && ['historique', tr('Historique'), 'time-past']].filter(Boolean);
  const actuel = onglets.some(o => o[0] === onglet) ? onglet : 'accueil';
  return (
    <div className="rb-fiche" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <EnteteFiche nom={v.nom} panne={v.mort ? v.phrase.texte : null}
        plaque={{ fond: v.plaque[0], encre: v.plaque[1], icone: ICONE, glyphe: Glyphe ? <Glyphe id={id} size={18}><Fi i={ICONE} size={18} /></Glyphe> : null }}
        sousNom={v.mort ? null : v.phrase.texte} />
      {onglets.length > 1 && <FicheOnglets idBase={idOnglets} nom={v.nom} onglets={onglets} actuel={actuel} onChoisir={setOnglet} />}
      <PanneauOnglet idBase={idOnglets} actuel={actuel} avecOnglets={onglets.length > 1}>
        {actuel === 'accueil' && <OngletVoiture hass={hass} c={c} v={v} onFiche={onFiche} onCarte={c.position ? () => setCarte(true) : null} />}
        {actuel === 'charge' && <OngletCharge hass={hass} v={v} />}
        {actuel === 'climat' && <OngletClimat hass={hass} v={v} />}
        {actuel === 'historique' && <OngletHistorique hass={hass} c={c} v={v} />}
      </PanneauOnglet>
      {carte && <Suspense fallback={null}><FeuilleCarte focus={c.position} autres={[c.position]} onClose={() => setCarte(false)} /></Suspense>}
    </div>
  );
}
