// Profils et notifications au TACTILE (24/09, ADR 0085).
//
// `html.loggia-tactile` masque le bandeau du haut. La pastille de profil et la
// cloche n'y vivaient QUE : sur un telephone ou une tablette, changer de
// profil etait impossible, et Parametres › Profils ne sait que creer et
// modifier. Les deux reviennent en deux rangees dans le pied du tiroir.
//
// Verifie A L'ECRAN sur la demonstration, en emulation tactile 375 x 812 :
// les deux rangees sont au-dessus du separateur, la feuille s'ouvre, basculer
// vers « Invite » change la rangee et retire « Mode edition » (ce profil
// n'edite pas), la cloche eteint son point. Sur ordinateur, rien n'apparait.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => {
  const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable');
  const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f);
};

test('le bandeau du haut reste masque au tactile : c’est la raison d’etre de ces rangees', () => {
  assert.ok(css.includes('html.loggia-tactile .loggia-hdr { display: none !important; }'),
    'si le bandeau revenait, les rangees du tiroir feraient double emploi');
});

test('le pied du tiroir : UNE carte compte, deux boutons', () => {
  /* Maquette 1a (01/10). Quatre blocs de meme poids disaient quatre choses de
   * natures differentes — une identite, un flux, un mode, un etat — et rien ne
   * les hierarchisait. Le pied porte desormais trois natures, trois
   * traitements : la navigation en liste, l'etat en bandeau colore, l'identite
   * en carte.
   *
   * La cloche vit SUR l'identite : les notifications s'adressent a celui qui
   * est connecte. Elles avaient une ligne a elles, vide de sens ; sur la
   * pastille, leur nombre en a un. */
  const side = bloc('function Sidebar(', NL + '/* ── Recherche globale');
  assert.match(side, /\{tactile && \(users\.length > 0 \|\| notifs\.length > 0\) \? \(/,
    'la carte compte ne se rend plus hors tactile — sur PC elle serait un reglage en double');
  assert.ok(side.includes('setProfilsOuverts(true)') && side.includes('setNotifsOuvertes(true)'),
    'les deux boutons ouvrent chacun sa feuille');

  /* DEUX boutons voisins, et non une carte avec une zone cachee a droite :
   * ouvrir son profil et ouvrir ses notifications sont deux destinations. */
  const carte = side.slice(side.indexOf('LA CARTE COMPTE'), side.indexOf('</div>', side.indexOf('LA CARTE COMPTE')) + 600);
  assert.equal(carte.split('<button').length - 1, 2, 'la carte compte n’a plus exactement deux boutons');
  assert.equal(carte.split('minHeight: 44').length - 1, 2, 'un des deux boutons est passe sous 44 px au doigt');

  // Le compte des non lues se LIT : une pastille muette ne disait rien.
  assert.ok(side.includes("nbNonVues > 9 ? '9+' : nbNonVues"), 'la pastille ne porte plus le nombre de NON LUES');
});

test('« Mode edition » reste au PIED du tiroir', () => {
  /* La maquette 1a le faisait monter dans la liste, sous Systeme. Essaye le
   * 01/10, et refuse le jour meme : la liste est plus courte que le rail, et il
   * laissait un grand vide sous lui — « redescends le bouton edition ou il
   * etait avant ».
   *
   * Il garde en revanche l'arrondi de ses voisins : 16, comme le bandeau
   * d'alarme et la carte compte. */
  const side = bloc('function Sidebar(', NL + '/* ── Recherche globale');
  const iTrait = side.indexOf("borderTop: 'var(--o-bw,1px) solid var(--o-bd3)'");
  const iEdition = side.indexOf('aria-pressed={editMode}');
  // AU-DESSUS du trait, pas dans le bloc qu'il ouvre.
  assert.ok(iEdition > 0 && iEdition < iTrait, '« Mode edition » est repasse SOUS la ligne separateur');
  assert.ok(side.includes('marginBottom: 14'), 'il se pose de nouveau SUR le trait, sans marge');
  assert.ok(side.indexOf('NAV.filter(g => g.reglages)') < iEdition, 'il est remonte dans la liste');
  assert.ok(!side.includes('MODE EDITION dans la liste'), 'la version en liste est revenue');
  /* NI bordure NI fond : il n'en avait plus depuis son passage dans la liste,
   * et les lui rendre n'avait ete demande par personne. */
  const bout = side.slice(iEdition - 400, iEdition + 400);
  assert.ok(bout.includes("border: 'none'") && bout.includes("background: 'transparent'"),
    'le bouton edition a repris un cadre que personne n’a demande');
  // Les trois blocs du pied partagent leur arrondi.
  assert.equal(side.split('borderRadius: 16').length - 1, 2, 'l’edition et l’alarme n’ont plus le meme arrondi');
  assert.ok(side.includes('borderRadius: 18'), 'la carte compte a perdu le sien');
});

test('la bascule passe par onSwitchUser — donc par le code pour un Admin', () => {
  const feuille = bloc('function FeuilleProfils(', NL + 'function FeuilleNotifications');
  assert.ok(feuille.includes('onSwitchUser(i)'), 'la feuille appelle switchUser');
  assert.ok(!feuille.includes('cfgSet') && !feuille.includes('applyUser'),
    'ecrire loggia_active_user directement sauterait PinModal — et le composant refuserait');
  assert.ok(src.includes("const switchUser = (i) => { if (i === userIdx) return; if (users[i] && users[i].role === 'Admin') setPinTarget(i); else applyUser(i); };"),
    'switchUser ouvre toujours PinModal pour un profil Admin');
  assert.ok(src.includes('onSwitchUser={switchUser}'), 'le tiroir recoit bien switchUser');
});

test('les feuilles sont rendues HORS de l’aside', () => {
  /* Son `transform` (le tiroir qui glisse) en ferait le bloc conteneur du
   * `position: fixed`, et son `overflow-y: auto` la decouperait. Vu a l'ecran :
   * la feuille existait dans le DOM et restait invisible. */
  const side = bloc('function Sidebar(', NL + '/* ── Recherche globale');
  const iFin = side.indexOf('</aside>');
  assert.ok(iFin > 0, '</aside> introuvable');
  assert.ok(side.indexOf('<FeuilleProfils') > iFin, 'la feuille des profils sort de l’aside');
  assert.ok(side.indexOf('<FeuilleNotifications') > iFin, 'la feuille des notifications sort de l’aside');
});

test('« lu » vit dans le journal, et les deux cloches le partagent', () => {
  /* Avant le 01/10, « vu » etait une SIGNATURE du contenu, rangee a part. Elle
   * ne savait pas distinguer « deux alertes dont une deja lue » de « deux
   * alertes neuves » : elle changeait, et tout redevenait non lu.
   *
   * Desormais chaque entree porte son `lu`, le journal est unique, et les deux
   * cloches lisent le meme. */
  const side = bloc('function Sidebar(', NL + '/* ── Recherche globale');
  assert.ok(!side.includes('loggia-notifsvues'), 'la signature du contenu est revenue a cote du journal');
  assert.ok(side.includes('journalNonLues(notifs)'), 'le tiroir ne compte plus les non lues depuis le journal');
  assert.ok(side.includes('if (onLireNotifs) onLireNotifs();'), 'ouvrir la feuille ne marque plus lu');
  // Et la barre du haut passe par le MEME chemin.
  assert.equal(src.split('journalNonLues(notifs)').length - 1, 2, 'les deux cloches ne comptent plus pareil');
  assert.ok(src.includes('onLireNotifs: lireNotifs'), 'la barre du haut ne recoit plus de quoi marquer lu');
});

test('la reconnaissance automatique ne bascule pas vers un Admin sans droit HA', () => {
  /* Elle ne PROUVE pas le code. Depuis l'ADR 0080 le composant refuse
   * l'ecriture : tenter ici aurait fait apparaitre un refus au demarrage. */
  assert.ok(src.includes("if (!haAdmin && String(users[i].role || '').toLowerCase() === 'admin') return;"),
    'un repli refuse, il n’elargit pas (ADR 0079)');
  const i = src.indexOf("if (!haAdmin && String(users[i].role");
  const j = src.indexOf('applyUser(i);', i);
  assert.ok(j > i && j - i < 400, 'le refus precede bien l’ecriture');
});

test('le toast distingue les deux refus « not_admin »', () => {
  assert.ok(src.includes("/code administrateur/i.test(String(r.message || ''))"),
    'le motif du composant departage le reglage de maison et le code admin');
  assert.ok(src.includes("tr('Profil non changé — le code administrateur est requis')"),
    'le message du code admin ne parle plus d’administrateur Home Assistant');
});
