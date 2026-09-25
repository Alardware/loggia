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

test('le tiroir porte le profil et la cloche, au TACTILE seulement', () => {
  const side = bloc('function Sidebar(', NL + '/* ── Recherche globale');
  assert.match(side, /\{tactile && \(users\.length > 0 \|\| notifs\.length > 0\) && \(/,
    'les rangees ne se rendent pas hors tactile — sur PC elles seraient un reglage en double');
  assert.ok(side.includes('setProfilsOuverts(true)') && side.includes('setNotifsOuvertes(true)'),
    'les deux rangees ouvrent chacune sa feuille');
  // L'ordre compte : AU-DESSUS du separateur, donc avant le bloc de pied.
  const iRangees = side.indexOf('{tactile && (users.length > 0');
  const iPied = side.indexOf('Mode édition depuis le tiroir');
  assert.ok(iRangees > 0 && iRangees < iPied,
    'les rangees passent avant « Mode edition », pas apres');
});

test('les deux rangees respirent comme « Mode edition » et « Alarme » dessous', () => {
  /* Retour du 25/09 : « le bouton notification est litteralement pose sur le
   * separateur et l'espace entre les 2 boutons est trop mince ». C'etait vrai
   * trois fois — ecart de 4 au lieu de 8, aucune marge basse (le bouton
   * touchait le trait), et une pastille de 28 px qui faisait depasser la
   * rangee profil de onze pixels.
   *
   * MESURE au telephone, apres correction : les quatre rangees font 37 px,
   * les ecarts valent 8, et il reste 14 px avant le trait pour 15 apres. */
  const side = bloc('function Sidebar(', NL + '/* ── Recherche globale');
  assert.ok(side.includes("gap: 8, marginTop: 'auto', paddingTop: 10, paddingBottom: 14 }}"),
    'le bloc des deux rangees a perdu son ecart de 8 ou sa marge basse de 14');
  assert.ok(side.includes("width: 17, height: 17, borderRadius: '50%', background: userBg(profilActif)"),
    'la pastille du profil dicte de nouveau la hauteur de sa rangee');
  // Le bloc d'en dessous, celui qui sert de reference.
  assert.ok(side.includes("gap: 8, marginTop: tactile && (users.length > 0 || notifs.length > 0) ? 0 : 'auto', paddingTop: 14"),
    'la reference a change : remesurer les deux blocs ensemble');
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

test('la cloche du tiroir et celle du bandeau partagent leur « vu »', () => {
  const side = bloc('function Sidebar(', NL + '/* ── Recherche globale');
  assert.ok(side.includes("localStorage.getItem('loggia-notifsvues')") && side.includes("localStorage.setItem('loggia-notifsvues', nsig)"),
    'meme cle que le bandeau : un point rouge eteint d’un cote ne se rallume pas de l’autre');
  assert.ok(side.includes("notifs.map(n => '' + n[1] + n[2]).join('|')"), 'meme signature du contenu');
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
