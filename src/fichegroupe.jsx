/* ── Les popups des groupes de capteurs, chargées à la demande (chantier Capteurs, étape 2 ; C27, § 4) ──────────
 *
 * Les cadres 1c (Ouvertures), 1d (Sécurité) et 1f (Présence) de sa maquette « Cartes capteurs ». Le CONTENU seul : sa
 * coquille (`FicheGroupe`, App.jsx) garde la feuille — sans onglets, à la hauteur de son contenu — et pose la frontière
 * Suspense dedans. Il n'importe jamais App.jsx : la coquille lui passe les membres, leurs noms et leurs pièces, le `hass`
 * vivant et les briques de là-bas (`briques` : les mots d'un binaire, sa pile, les entités de son appareil, le dessin d'un
 * ouvrant). Rien que des panneaux — pas de carte dans un panneau.
 *  1. L'en-tête commun (`EnteteFiche`) : la plaque comme la carte, le nom, la ligne de sorte ; une croix, pas d'épingle — un
 *     groupe n'est pas une entité.
 *  2. Le panneau du haut (`--o-s3`, teinté à 0,06 en alerte) : le mot en 28 / 800, la phrase en 14 / 800, et le conseil
 *     (12,5), seulement s'il est vrai.
 *  3. Une rangée par membre : sa plaque de 32 (la glyphe de sa famille ; pour une ouverture, son petit dessin), son nom et
 *     sa sous-ligne, son état à droite ; dessous, pour Ouvertures et Présence, la bande du jour. Une rangée est un bouton
 *     qui ouvre la fiche de son binaire.
 * L'historique du jour se lit UNE fois, à l'ouverture, pour tous les membres (journee.jsx) : il fait foi pour « depuis »
 * et « dernière ouverture » — lu sans changement aujourd'hui, l'heure se tait (`depuisQuand`).
 */
import { tr, trN, locale } from './i18n.js';
import { Fi, useEtatServeur } from './ui.jsx';
import { EnteteFiche, filet } from './fichecommune.jsx';
import { LISERE } from './styles.js';
import { relTime, nombre } from './format.js';
import { dernierSignal } from './mesuresfiche.js';
import { motsSurete, ICONES_ATTENTION, couleurPile, seuilsPile } from './attention.js';
import { glyphePile, vuePiles } from './piles.js';
import { quandPlante } from './plantes.js';
import { useJournee, bandesDuJour, depuisQuand, dernierPassage, resumeJour, heure, BandeJour } from './journee.jsx';
import { vueOuvertures, vuePresence, vueSecurite, delaiCourt, estMuet, estSonnette, sonne as sonneMembre } from './groupes.js';

const PANNEAU = { background: 'var(--o-s3)', border: LISERE, borderRadius: 'var(--o-radius,18px)', boxSizing: 'border-box', minWidth: 0 };
const RANGEE = { display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--o-text)', textAlign: 'left' };
const NOM = { display: 'block', fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' };
const SOUS = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 };
const ENCRES = { warn: 'var(--o-warn)', bad: 'var(--o-bad)', accent: 'var(--o-accent-soft)' };
const TEINTES = { warn: 'var(--o-warn-rgb)', bad: 'var(--o-bad-rgb)' };
/* Un capteur MUET, une seule règle (C26, audit du 19/10, lot 4 ; ADR 0252) : son état, « Indisponible », en rouge — dans sa fiche
 * comme dans la rangée d'une popup ; sa plaque en gris, comme celle de sa fiche. L'ambre reste au GROUPE (C22, C23) : le mot du
 * panneau du haut, la phrase et les puces de la carte disent « muette », « ne répond plus ». */
const ENCRE_MUET = 'var(--o-bad)';
const PLAQUE_MUETTE = { fond: 'var(--o-s1)', encre: 'var(--o-text3)' };

/* La plaque d'une rangée : 32 px, la glyphe de sa famille, ou le petit dessin d'un ouvrant. */
const Plaque = ({ children, fond = 'var(--o-s1)', encre = 'var(--o-text1)' }) => (
  <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: fond, color: encre }}>{children}</span>
);

/* Depuis quand : `depuisQuand` (journee.jsx), que la carte Ouvertures lit aussi — la rangée disait « Fermée depuis 23:48 » sous une
 * bande « fermée toute la journée » ; la puce de la carte, « Baie · 23:48 ». */

/* « Signal il y a 3 min » : `relTime` écrit « Il y a 3 min », « À l'instant » pour une tête de phrase ; au milieu de celle-ci, la
 * minuscule (passe bis du 17/10, point 9). Sûr dans les sept langues : ces mots ne sont jamais un nom propre (« Vor 3 min », « Hace
 * 3 min », « Przed chwilą »), et une heure commence par un chiffre. */
const enPhrase = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/* Ouvertures (cadre 1c, § 4.2). */
export function Ouvertures({ ids, S, noms, pieces, briques, journee, maintenant, hass, onMembre }) {
  const { etatsBinaires, pileDe, soeursDe, Dessin } = briques;
  const h = (t) => heure(t, locale());
  const lu = journee && journee !== 'erreur' ? journee : null;
  // Les états du jour d'un membre ; null si l'historique n'est pas lu, ou l'ignore (un recorder qui l'exclut) : alors ni bande ni heure devinées.
  const etatsDe = (id) => (lu ? lu.etats[id] || null : null);
  const depuis = (id) => depuisQuand(etatsDe(id), lu && lu.debut, S[id]);
  const v = vueOuvertures(ids, S, noms, h, depuis);
  const premiere = v.ouvertes.slice().sort((a, b) => (depuis(b) || 0) - (depuis(a) || 0))[0];
  const derniere = lu ? ids.map(id => [id, dernierPassage(etatsDe(id), lu.debut)]).filter(x => x[1] != null).sort((a, b) => b[1] - a[1])[0] : null;
  const mot = v.ouvertes.length ? trN(v.ouvertes.length, '{n} ouverte', '{n} ouvertes') : v.muettes.length ? trN(v.muettes.length, '{n} muette', '{n} muettes') : tr('Tout est fermé');
  // La phrase : « {nom}, depuis {h} » — le nom seul si l'heure se tait (ouverte depuis hier).
  const t1 = premiere ? depuis(premiere) : null;
  const phrase = premiere ? (t1 != null ? tr('{nom}, depuis {h}', { nom: noms.get(premiere), h: h(t1) }) : noms.get(premiere))
    : derniere ? tr('Dernière ouverture : {nom} à {h}', { nom: noms.get(derniere[0]), h: h(derniere[1]) }) : null;
  // Le conseil, seulement s'il est vrai : la nuit, une ouverte — ou plusieurs (passe bis du 17/10, point 9) ; un chauffage coupé pour elle par la règle des fenêtres.
  const { etat: fenetres } = useEtatServeur(hass, 'loggia/fenetres/etat', 30000, '');
  const coupes = (fenetres && fenetres.coupes) || {};
  const nuit = !!(S['sun.sun'] && S['sun.sun'].state === 'below_horizon');
  const conseils = [
    nuit && v.ouvertes.length ? trN(v.ouvertes.length, 'Pensez à la fermer avant de dormir.', 'Pensez à les fermer avant de dormir.') : null,
    ...[...new Set(v.ouvertes.map(id => pieces.get(id)).filter(p => p && Array.isArray(coupes[p]) && coupes[p].length))].map(p => tr('{piece} : le chauffage attend qu’elle soit fermée.', { piece: p })),
  ].filter(Boolean);
  const sabotage = (id) => soeursDe(id).some(e => S[e] && (S[e].attributes || {}).device_class === 'tamper' && S[e].state === 'on');
  const ordre = [...v.ouvertes, ...v.muettes, ...ids.filter(id => v.ouvertes.indexOf(id) < 0 && v.muettes.indexOf(id) < 0)];
  return (
    <Corps v={v} mot={mot} phrase={phrase} conseils={conseils}>
      {ordre.map((id, i) => {
        const st = S[id];
        const a = (st && st.attributes) || {};
        const muet = estMuet(st);
        const ouvert = !muet && st.state === 'on';
        const e = etatsBinaires()[a.device_class] || [tr('Ouverte'), tr('Fermée')];
        const etat = ouvert ? e[0] : e[1];
        const pile = pileDe(S, id);
        const t = depuis(id);
        // La sous-ligne : « Fermée depuis 19:12 · pile 100 % » ; l'heure tue, l'état seul ; une muette sans heure n'a rien à dire de plus.
        const sous = muet ? (t != null ? tr('Sans nouvelles depuis {h}', { h: h(t) }) : null)
          : [t != null ? tr('{etat} depuis {h}', { etat, h: h(t) }) : etat, pile != null ? tr('pile {n}', { n: pile + '\u00a0%' }) : null].filter(Boolean).join(' · ');
        const etats = etatsDe(id);
        return (
          <button key={id} type="button" onClick={() => onMembre(id)} style={{ ...RANGEE, borderTop: filet(i) }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              <Plaque><Dessin type={a.device_class === 'window' ? 'fenetre' : 'porte'} ouvert={ouvert} taille={28} /></Plaque>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={NOM}>{noms.get(id)}</span>
                {/* « boîtier ouvert » : le mot de l'Accueil et de la fiche d'un sabotage (« Boîtier ouvert »), en minuscule au milieu de la ligne. */}
                {(sous || sabotage(id)) && <span style={SOUS}>{sous}{sabotage(id) && <span style={{ color: 'var(--o-warn)' }}>{(sous ? ' · ' : '') + tr('boîtier ouvert')}</span>}</span>}
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, flexShrink: 0, color: muet ? ENCRE_MUET : ouvert ? 'var(--o-warn)' : 'var(--o-text1)' }}>{muet ? tr('Indisponible') : etat}</span>
            </span>
            {etats && <BandeJour bandes={bandesDuJour(etats, lu.debut, maintenant)} resume={resumeJour(a.device_class, etats)} />}
          </button>
        );
      })}
    </Corps>
  );
}

/* Présence (cadre 1f, § 4.4) : le dernier mouvement vient du JOURNAL de Home Assistant sur 24 h (`derniers`, que la coquille lit par
 * `useDerniersEvenements`) — la source de la carte (audit du 19/10, M19) : à 00:30, l'historique depuis minuit faisait dire « Rien
 * aujourd’hui » à la popup et « il y a 40 min » à la carte. L'historique du jour ne sert plus qu'à la bande, et à « Quelqu’un depuis ».
 * Pas de note — celle de la maquette décrit un réglage de la règle Nuit (l'éclairage qui suit un radar) que la maison n'a pas. */
const PRESENCES = ['occupancy', 'presence'];
export function Presence({ ids, S, noms, briques, journee, derniers = null, maintenant, ctx = null, onMembre }) {
  const { etatsBinaires, pileDe } = briques;
  const h = (t) => heure(t, locale());
  const lu = journee && journee !== 'erreur' ? journee : null;
  const etatsDe = (id) => (lu ? lu.etats[id] || null : null);
  const dj = derniers || {};
  const v = vuePresence(ids, S, noms, dj, maintenant, ctx);
  const presence = (id) => PRESENCES.indexOf(((S[id] && S[id].attributes) || {}).device_class) >= 0;
  const sonnette = (id) => estSonnette(id, S, ctx);
  const actif = v.actifs.find(sonnette) || v.actifs.find(id => !presence(id)) || v.actifs[0];
  const mot = actif ? (sonnette(actif) ? tr('Quelqu’un à la porte') : presence(actif) ? tr('Quelqu’un · {piece}', { piece: noms.get(actif) }) : tr('Mouvement · {piece}', { piece: noms.get(actif) }))
    : v.dernier ? tr('Rien depuis {d}', { d: delaiCourt(maintenant - v.dernier[1]) }) : tr('Rien depuis plus de 24 h');
  const phrase = v.dernier ? tr('Dernier mouvement à {h}', { h: h(v.dernier[1]) }) : null;
  const ordre = [...v.actifs, ...ids.filter(id => v.actifs.indexOf(id) < 0)];
  return (
    <Corps v={v} mot={mot} phrase={phrase} conseils={[]}>
      {ordre.map((id, i) => {
        const st = S[id];
        const a = (st && st.attributes) || {};
        const muet = estMuet(st);
        const on = !muet && st.state === 'on';
        const etats = etatsDe(id);
        const t = depuisQuand(etats, lu && lu.debut, st);
        const pile = pileDe(S, id);
        const sous = muet ? (t != null ? tr('Sans nouvelles depuis {h}', { h: h(t) }) : null)
          : [presence(id) ? (t == null ? null : on ? tr('Quelqu’un depuis {h}', { h: h(t) }) : tr('Personne depuis {h}', { h: h(t) }))
            : dj[id] != null ? tr('Dernier mouvement à {h}', { h: h(dj[id]) }) : null, pile != null ? tr('pile {n}', { n: pile + '\u00a0%' }) : null].filter(Boolean).join(' · ');
        // Les mots de LA table des binaires (`etatsBinaires()`, soit `BIN_ETATS()`) : « Occupé », « Vide », « Présent » ; un mouvement passé, le
        // délai court de la carte — « 5 h », plus jamais « Il y a 300 min ».
        const mots = etatsBinaires()[a.device_class] || [tr('Mouvement'), tr('Aucun mouvement')];
        const etat = muet ? tr('Indisponible') : presence(id) || on ? mots[on ? 0 : 1] : dj[id] != null ? delaiCourt(maintenant - dj[id]) : '—';
        return (
          <button key={id} type="button" onClick={() => onMembre(id)} style={{ ...RANGEE, borderTop: filet(i) }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              <Plaque fond={on ? 'rgba(var(--o-accent-rgb),.16)' : 'var(--o-s1)'} encre={on ? 'var(--o-accent-soft)' : muet ? PLAQUE_MUETTE.encre : 'var(--o-text1)'}><Fi i={presence(id) ? 'user' : 'signal-stream'} size={15} /></Plaque>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={NOM}>{noms.get(id)}</span>
                {sous && <span style={SOUS}>{sous}</span>}
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, flexShrink: 0, color: muet ? ENCRE_MUET : on ? 'var(--o-accent-soft)' : 'var(--o-text1)' }}>{etat}</span>
            </span>
            {etats && <BandeJour bandes={bandesDuJour(etats, lu.debut, maintenant)} resume={resumeJour(a.device_class, etats)} />}
          </button>
        );
      })}
    </Corps>
  );
}

/* Sécurité (cadre 1d, § 4.3 ; C4) : le mot — « Rien à signaler », « Fumée détectée », « 1 détecteur muet » —, la phrase — « Les {n}
 * détecteurs répondent », ou « {nom}, depuis 14:05 » —, une rangée par détecteur : la glyphe de sa famille, son nom, « Signal il y a
 * 4 min · pile 92 % » (une caméra n'a pas de pile : la sous-ligne la tait), son état — les mots d'`etatsBinaires()` en neutre, rouge s'il
 * sonne, « Indisponible » en rouge s'il est muet (C26, comme sa fiche ; audit du 19/10, lot 4). Pas de bande : un détecteur ne raconte pas sa journée. La note, sans « une heure »
 * (C4) : un détecteur qui ne répond plus passe en alerte ici. */
export function Securite({ ids, S, noms, briques, journee, onMembre }) {
  const { etatsBinaires, pileDe, soeursDe } = briques;
  const h = (t) => heure(t, locale());
  const v = vueSecurite(ids, S, noms);
  const lu = journee && journee !== 'erreur' ? journee : null;
  const classe = (id) => ((S[id] && S[id].attributes) || {}).device_class;
  const depuis = (id) => depuisQuand(lu ? lu.etats[id] || null : null, lu && lu.debut, S[id]);
  const premier = v.sonnent[0] || v.muets[0] || null;
  const mot = v.sonnent.length ? tr((motsSurete(classe(v.sonnent[0])) || ['Sécurité', 'Alerte de sécurité'])[1])
    : v.muets.length ? trN(v.muets.length, '{n} détecteur muet', '{n} détecteurs muets') : tr('Rien à signaler');
  const t0 = premier ? depuis(premier) : null;
  const phrase = premier ? (t0 != null ? tr('{nom}, depuis {h}', { nom: noms.get(premier), h: h(t0) }) : noms.get(premier))
    : trN(ids.length, 'Le détecteur répond', 'Les {n} détecteurs répondent');
  const ordre = [...v.sonnent, ...v.muets, ...ids.filter(id => v.sonnent.indexOf(id) < 0 && v.muets.indexOf(id) < 0)];
  return (
    <Corps v={v} mot={mot} phrase={phrase} conseils={[]} note={tr('Un détecteur qui ne répond plus passe en alerte ici : sans réponse, il ne protège plus.')}>
      {ordre.map((id, i) => {
        const st = S[id];
        const muet = estMuet(st);
        // Un monoxyde en ppm sonne au palier Danger, pas à `on` (relecture du lot 3) : la règle de la carte (`sonne`, groupes.js).
        const sonne = sonneMembre(S, id);
        const chiffre = id.indexOf('sensor.') === 0;
        const e = etatsBinaires()[classe(id)] || [tr('Détecté'), tr('RAS')];
        const pile = pileDe(S, id);
        const signal = dernierSignal(S, [id, ...soeursDe(id)]);
        const sous = [signal != null ? tr('Signal {quand}', { quand: enPhrase(relTime(new Date(signal).toISOString())) }) : null, pile != null ? tr('pile {n}', { n: pile + '\u00a0%' }) : null].filter(Boolean).join(' · ');
        const etat = muet ? tr('Indisponible') : sonne ? e[0] : chiffre ? nombre(st.state, 0) + '\u00a0ppm' : e[1];
        return (
          /* Sans bande du jour, la rangée est la ligne elle-même : ce que le bouton dit se lit à deux niveaux (jsx-a11y). */
          <button key={id} type="button" onClick={() => onMembre(id)} style={{ ...RANGEE, flexDirection: 'row', alignItems: 'center', gap: 12, borderTop: filet(i) }}>
            <Plaque fond={sonne ? 'rgba(var(--o-bad-rgb),.16)' : 'var(--o-s1)'} encre={sonne ? 'var(--o-bad)' : muet ? PLAQUE_MUETTE.encre : 'var(--o-text1)'}><Fi i={ICONES_ATTENTION[classe(id)] || ICONES_ATTENTION.safety} size={15} /></Plaque>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={NOM}>{noms.get(id)}</span>
              {sous && <span style={SOUS}>{sous}</span>}
            </span>
            <span style={{ fontSize: 13, fontWeight: 800, flexShrink: 0, color: sonne ? 'var(--o-bad)' : muet ? ENCRE_MUET : 'var(--o-text1)' }}>{etat}</span>
          </button>
        );
      })}
    </Corps>
  );
}

/* Le panneau du haut et la liste des rangées. */
/* Piles (chantier Capteurs, étape 3 ; C32, § 8) : toutes les piles, celles à changer d'abord, puis celles qui tiennent — la plus basse
 * en tête —, les muettes à la fin. Une rangée chacune : l'appareil, sa pièce, la glyphe au niveau et le pourcentage à la règle de la
 * maison (`couleurPile`) ; une muette, « sans nouvelles depuis {quand} » ; une rangée ouvre la fiche de l'appareil. Le seuil est celui de
 * la veille des piles, que la racine de l'écran relit avec les veilles (§ 19.8, `useSeuilPile`, App.jsx) — la note le dit. */
export function Piles({ piles, S, pieces, briques = null, maintenant, onMembre }) {
  const seuils = seuilsPile();
  const v = vuePiles(piles, seuils);
  const loc = locale();
  const t = maintenant == null ? Date.now() : maintenant;
  const pct = (p) => nombre(p.niveau, 0);
  const premiere = v.aChanger[0] || v.muettes[0] || v.basse || null;
  const phrase = !premiere ? null
    : v.aChanger.length ? (premiere.binaire ? tr('{nom} signale une pile faible', { nom: premiere.nom }) : tr('{nom}, {p} %', { nom: premiere.nom, p: pct(premiere) }))
      : v.muettes.length ? tr('{nom} ne répond plus', { nom: premiere.nom }) : tr('La plus basse : {nom}, {p} %', { nom: premiere.nom, p: pct(premiere) });
  const note = tr('Une pile est à changer sous {seuil} % — le seuil de la veille des piles (Règles › Veilles) ; critique à {danger} %.', { seuil: seuils.alerte, danger: seuils.danger });
  return (
    <Corps v={v} mot={v.phrase} phrase={phrase} conseils={[]} note={note}>
      {v.ordre.map((p, i) => {
        const aChanger = v.aChanger.indexOf(p) >= 0;
        const ton = p.muette ? null : aChanger ? (p.niveau != null && p.niveau <= seuils.danger ? 'bad' : 'warn') : null;
        const depuis = p.muette && S[p.id] ? Date.parse(S[p.id].last_changed) : NaN;
        const sous = [pieces.get(p.id) || null, p.muette ? tr('sans nouvelles depuis {quand}', { quand: Number.isFinite(depuis) ? quandPlante(depuis, t, loc) : '\u2014' }) : null].filter(Boolean).join(' · ');
        // Une pile binaire dit les mots de LA table des binaires (`etatsBinaires().battery`) : « Pile faible », « Pile en forme », comme sa carte.
        const motsPile = (briques && briques.etatsBinaires().battery) || [tr('Pile faible'), tr('Pile en forme')];
        const valeur = p.muette ? tr('Indisponible') : p.binaire ? motsPile[p.allume ? 0 : 1] : pct(p) + '\u00a0%';
        return (
          <button key={p.id} type="button" onClick={() => onMembre(p.id)} style={{ ...RANGEE, flexDirection: 'row', alignItems: 'center', gap: 12, borderTop: filet(i) }}>
            <Plaque fond={ton ? 'rgba(' + TEINTES[ton] + ',.16)' : 'var(--o-s1)'} encre={ton ? ENCRES[ton] : p.muette ? PLAQUE_MUETTE.encre : 'var(--o-text1)'}><Fi i={p.muette ? 'battery-empty' : glyphePile(p.binaire ? (p.allume ? 10 : 100) : p.niveau)} size={15} /></Plaque>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={NOM}>{p.nom}</span>
              {sous && <span style={SOUS}>{sous}</span>}
            </span>
            <span style={{ fontSize: 13, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: p.muette ? ENCRE_MUET : ton ? ENCRES[ton] : couleurPile(p.niveau, 'var(--o-text1)') }}>{valeur}</span>
          </button>
        );
      })}
    </Corps>
  );
}

function Corps({ v, mot, phrase, conseils, note = null, children }) {
  const teinte = v.ton && TEINTES[v.ton];
  return (<>
    <div style={{ ...PANNEAU, padding: 18, background: teinte ? 'rgba(' + teinte + ',.06)' : 'var(--o-s3)' }}>
      {/* Le grand mot se coupe s'il le faut : « Sicherheitswarnung » débordait à 320 px. */}
      <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15, color: v.ton ? ENCRES[v.ton] : 'var(--o-text)', overflowWrap: 'anywhere' }}>{mot}</div>
      {phrase && <div style={{ fontSize: 14, fontWeight: 800, marginTop: 6, color: 'var(--o-text2)' }}>{phrase}</div>}
      {conseils.map(c => <div key={c} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text1)', marginTop: 6, lineHeight: 1.45 }}>{c}</div>)}
    </div>
    <div style={{ ...PANNEAU, overflow: 'hidden' }}>{children}</div>
    {note && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', lineHeight: 1.45, padding: '0 4px' }}>{note}</div>}
  </>);
}

/**
 * La popup d'un groupe. `groupe` : 'ouvertures', 'securite', 'presence' ou 'piles' (alors `piles` : la liste de piles.js) ; `ids` : ses membres ; `noms`, `pieces` : leurs
 * noms et leurs pièces de Loggia (`Map`) ; `onMembre(id)` ouvre la fiche d'un binaire ; `derniers` : le dernier déclenchement de chaque
 * membre de Présence, lu dans le JOURNAL par la coquille — la source de la carte (M19) ; `ctx` : celui des groupes (la sonnette) ;
 * `maintenant` sert aux tests.
 */
export default function FicheGroupeContent({ groupe, nom, ids, hass, noms, pieces, briques, onMembre, piles = null, derniers = null, ctx = null, maintenant = null }) {
  const S = (hass && hass.states) || {};
  // La journée du jour : pour des binaires — les piles n'en ont pas.
  const journee = useJournee(hass, groupe === 'piles' ? [] : ids);
  const t = maintenant == null ? Date.now() : maintenant;
  // L'en-tête : la plaque comme la carte, et la ligne de sorte.
  const v = groupe === 'piles' ? vuePiles(piles || []) : groupe === 'presence' ? vuePresence(ids, S, noms, derniers || {}, t, ctx) : groupe === 'securite' ? vueSecurite(ids, S, noms) : vueOuvertures(ids, S, noms, () => '');
  const plaque = { icone: v.glyphe, fond: v.ton ? 'rgba(' + TEINTES[v.ton] + ',.16)' : v.accent ? 'rgba(var(--o-accent-rgb),.16)' : 'var(--o-s1)', encre: v.ton ? ENCRES[v.ton] : v.accent ? 'var(--o-accent-soft)' : 'var(--o-text1)' };
  const sorte = groupe === 'piles' ? trN(ids.length, '{n} pile', '{n} piles') : groupe === 'presence' ? trN(ids.length, '{n} détecteur de mouvement', '{n} détecteurs de mouvement')
    : groupe === 'securite' ? trN(ids.length, '{n} détecteur', '{n} détecteurs')
      : trN(ids.length, '{n} capteur · portes et fenêtres', '{n} capteurs · portes et fenêtres');
  return (
    <div className="rb-fiche" data-groupe={groupe} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <EnteteFiche nom={nom} plaque={plaque} sousNom={sorte} />
      {groupe === 'piles'
        ? <Piles piles={piles || []} S={S} pieces={pieces} briques={briques} maintenant={t} onMembre={onMembre} />
        : groupe === 'presence'
        ? <Presence ids={ids} S={S} noms={noms} briques={briques} journee={journee} derniers={derniers} maintenant={t} ctx={ctx} onMembre={onMembre} />
        : groupe === 'securite'
          ? <Securite ids={ids} S={S} noms={noms} briques={briques} journee={journee} onMembre={onMembre} />
          : <Ouvertures ids={ids} S={S} noms={noms} pieces={pieces} briques={briques} journee={journee} maintenant={t} hass={hass} onMembre={onMembre} />}
    </div>
  );
}
