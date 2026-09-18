// Les pieces en mode edition (maquette du 15/09) : la carte d'edition d'une
// piece, la case d'ajout, la fiche « Ajouter une piece », et la teinte qui
// s'applique en entier.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const par = readFileSync(join(RACINE, 'src', 'views', 'parametres.jsx'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

test('les teintes : six jetons, chacun avec son rgb, et rien de libre', () => {
  const b = bloc('const TEINTES_PIECE = [', NL + '];');
  const ids = [...b.matchAll(/id: '([a-z]+)'/g)].map(m => m[1]);
  assert.deepEqual(ids, ['accent', 'ambre', 'tendre', 'chambre', 'bain', 'vert'], 'l’ordre des puces de la maquette');
  for (const m of b.matchAll(/col: 'var\((--o-[a-z-]+)\)', rgb: 'var\((--o-[a-z-]+)\)'/g)) assert.equal(m[2], m[1] + '-rgb', m[1] + ' et son rgb vont ensemble');
  assert.equal((b.match(/col: /g) || []).length, 6, 'six couleurs, toutes des jetons');
  assert.ok(!/#[0-9a-f]{3,6}/i.test(b), 'aucune couleur en dur');
});

test('l’habillage : l’icone choisie prime, la teinte choisie s’applique en entier, et il dit sa couleur', () => {
  const h = bloc('function habillagePiece(', NL + '}');
  assert.ok(h.includes("const glyphe = perso.icon || uiconDeMdi(mdi) || (modele && modele.icon && modele.icon.props && modele.icon.props.name) || 'home';"), 'fiche > zone Home Assistant > modele > maison');
  assert.ok(h.includes("bg: propre ? 'rgba(' + teinte.rgb + ',.16)' : modele.bg,") && h.includes('tc: propre ? teinte.col : modele.tc,') && h.includes('icon: <Ico name={glyphe} color={teinte.col} size={22} />'), 'lavis, releve et icone : la teinte en entier');
  assert.ok(h.includes('col: teinte.col,') && h.includes('rgb: teinte.rgb,') && h.includes('glyphe,') && h.includes('teinte: teinte.id,'), 'l’habillage dit sa couleur, son glyphe et sa teinte');
  const t = bloc('function teinteDePiece(', NL + '}');
  assert.ok(t.includes('const col = couleurDePiece(modele);') && t.includes('TEINTES_PIECE[0]'), 'sans choix : le modele, sinon l’accent');
  const p = bloc('function personnalisationPiece(', NL + '}');
  assert.ok(p.includes("cfgVal('loggia_rooms', null)") && p.includes('TEINTES_PIECE.some(t => t.id === r.teinte)'), 'lu dans loggia_rooms, une teinte inconnue est ignoree');
});

test('la couleur de l’habillage sert partout : barre des pieces, fiche entite, en-tete de la vue piece', () => {
  const nav = bloc('function RoomNav(', NL + '}');
  assert.ok(nav.includes('col: p.col }') && !nav.includes('couleurDePiece(modeleDePiece('), 'la barre des pieces');
  const f = bloc('function CardEditSheet(', NL + '}');
  assert.ok(f.includes('const couleur = hp.col;'), 'les puces de piece de la fiche entite');
  assert.ok(src.includes('const base = habillagePiece(activeRoom, lv && lv.icon);') && !src.includes('PIECES.find(p => p.name === activeRoom)'), 'l’en-tete de la vue piece passe par l’habillage');
});

test('la carte d’une piece en edition : meme dessin, taille en coin, Modifier, Supprimer en deux appuis', () => {
  const c = bloc('function CartePieceEdition(', NL + '}');
  assert.ok(c.includes('<Fi i="resize" size={13} />') && c.includes('style={BOUTON_COIN}'), 'le bouton de taille en coin, en accent');
  assert.ok(c.includes("{tr('Modifier')}") && c.includes("{confirme ? tr('Confirmer ?') : tr('Supprimer')}"), 'Modifier, et Supprimer qui demande un second appui');
  assert.ok(c.includes('setTimeout(() => setConfirme(false), 4000)'), 'la confirmation retombe seule');
  assert.ok(c.includes("tr('Pièce') + ' · '") && c.includes("tr('Aucun capteur')") && c.includes("tr('{n} capteurs', { n })"), '« Piece · n capteurs » : des capteurs configures, rien d’invente');
  assert.ok(c.includes('boutonEdition(false)') && c.includes('boutonEdition(true)'), 'les boutons de la carte d’entite');
  assert.ok(c.includes("rgba(' + p.rgb + ',.14)") && c.includes("RM_ICO('rgba(' + p.rgb + ',.16)', p.col)"), 'le lavis et l’icone dans la teinte de la piece');
  assert.ok(c.includes('if (compacte) {') && c.includes("const serre = { padding: '4px 6px', fontSize: 11.5 };"), 'compacte, elle tient sur une rangee : les boutons se serrent sur une seconde ligne');
});

test('l’Accueil : la carte d’edition remplace la tuile, la case d’ajout ferme la grille, la fiche s’ouvre', () => {
  const home = bloc('function Dashboard(', NL + 'function ');
  assert.ok(home.includes("<CartePieceEdition p={p} compacte={t === 'c'} onModifier={() => setPieceSheet({ nom: p.name, compacte: t === 'c' })} onSupprimer={() => retirerPiece(p.name)}"), 'la carte d’edition');
  assert.ok(home.includes("[p.name]: t === 'c' ? 's' : 'c'"), 'la taille bascule entre une et deux rangees');
  assert.ok(!home.includes("pointerEvents: 'none', height: '100%'") && !home.includes("tr('Taille de la carte')"), 'plus de tuile inerte ni de barre d’outils');
  assert.ok(home.includes("{editMode && <CarteAjout onClick={() => setPieceSheet({ nom: '', compacte: false })} label={tr('Ajouter une pièce')} />}"), 'la case d’ajout');
  assert.ok(home.includes('<FichePiece key={pieceSheet.nom} nom={pieceSheet.nom} compacte={pieceSheet.compacte} hass={dashHass} onEnregistrer={enregistrerPieceIci} onSupprimer={retirerPiece}'), 'la fiche');
  assert.ok(home.includes("tailles[piece.room] = compacte ? 'c' : 's';") && home.includes("piecesOrdre: (grille.piecesOrdre || []).map(n => n === avant ? piece.room : n)"), 'renommer emporte la taille et l’ordre');
  assert.ok(home.includes("piecesOrdre: (grille.piecesOrdre || []).filter(n => n !== nom)"), 'retirer les efface');
});

test('la fiche : nom, icone, teinte, tuile compacte, entites — et un nom deja pris ne s’enregistre pas', () => {
  const f = bloc('function FichePiece(', NL + '}');
  ['NOM', 'ICÔNE', 'TEINTE', 'ENTITÉS', 'Tuile compacte', 'Ajouter une pièce', 'Modifier la pièce', 'Température', 'Humidité', 'CO₂', 'Lumières'].forEach(k => assert.ok(f.includes("tr('" + k + "')"), k));
  assert.ok(f.includes("tr('La pièce apparaîtra sur l’accueil et dans le sélecteur de pièces.')"), 'la phrase de la maquette');
  assert.ok(f.includes('ICONES_PIECE.slice(page * ICONES_PAR_PAGE, (page + 1) * ICONES_PAR_PAGE).map(') && f.includes('TEINTES_PIECE.map('), 'la grille d’icones, par page, et les puces de teinte');
  assert.ok(f.includes("tr('Icônes précédentes')") && f.includes("tr('Icônes suivantes')") && f.includes('pages > 1 && (') && f.includes("aria-label={tr('Page {n}', { n: i + 1 })}"), 'la grille se pagine : fleches et points');
  assert.ok(f.includes('useState(Math.max(0, Math.floor(ICONES_PIECE.indexOf(icone) / ICONES_PAR_PAGE)))'), 'la fiche s’ouvre sur la page de l’icone choisie');
  const liste = src.match(/const ICONES_PIECE = \[([^\]]+)\]/);
  assert.equal([...liste[1].matchAll(/'([a-z0-9-]+)'/g)].length, 30, 'trente icones, trois pages de dix');
  assert.ok(src.includes('const ICONES_PAR_PAGE = 10;'), 'deux lignes de cinq par page');
  assert.ok(f.includes("const doublon = !!propre && propre !== nom && pieces.some(r => r.room === propre);") && f.includes('disabled={!valide}'), 'pas deux pieces du meme nom');
  ['temperature', 'humidity', 'carbon_dioxide'].forEach(c => assert.ok(f.includes("'" + c + "'"), 'les capteurs proposes par device_class ' + c));
  assert.ok(f.includes('<ChampSuggere id={id} label={lbl} value={v} onChange={set}') && f.includes('suggestions={capteurs(classe).map('), 'une liste de suggestions par capteur, aux couleurs du thème');
  assert.ok(f.includes('{existante && <button onClick={() => { onSupprimer(nom); close(); }}'), 'Supprimer seulement pour une piece existante');
  assert.ok(f.includes("haid: { temp: temp.trim() || null, humidity: hum.trim() || null, co2: co2.trim() || null, lights: lumieres.split(',').map(s => s.trim()).filter(Boolean) }"), 'les capteurs sous haid, comme Parametres');
});

test('ecrire une piece : une seule ecriture, et renommer emporte sa grille', () => {
  const e = bloc('function enregistrerPiece(', NL + '}');
  assert.equal((e.match(/cfgSet\(/g) || []).length, 1, 'une ecriture');
  assert.ok(e.includes('if (all[avant]) { all[piece.room] = all[avant]; delete all[avant]; maj[ROOM_LAYOUT_KEY] = all; }'), 'la grille suit le nouveau nom');
  assert.ok(e.includes("normRooms(cfgVal('loggia_rooms', null))"), 'la liste normalisee, jamais une piece seule');
  const s = bloc('function supprimerPiece(', NL + '}');
  assert.equal((s.match(/cfgSet\(/g) || []).length, 1, 'une ecriture aussi');
  assert.ok(s.includes('delete all[nom]'), 'la grille de la piece part avec elle');
});

test('Parametres ne perd ni l’icone ni la teinte a l’enregistrement', () => {
  assert.ok(par.includes("icon: r.icon || null, teinte: r.teinte || null, temp:"), 'lues avec la piece');
  assert.ok(par.includes("...(r.icon ? { icon: r.icon } : {}), ...(r.teinte ? { teinte: r.teinte } : {}), haid: {"), 'reecrites avec elle');
});

test('les mots de la fiche et des cartes ont leur traduction', () => {
  ['Une rangée', 'Deux rangées', 'Aucun capteur', '{n} capteur', '{n} capteurs', 'Ajouter une pièce', 'Modifier la pièce', 'TEINTE', 'Tuile compacte', 'Une pièce porte déjà ce nom.', 'Salon, Cuisine, Chambre…', 'Accent', 'Ambre', 'Tendre', 'Bain', 'Vert', 'CO₂']
    .forEach(k => assert.ok(en.includes("  '" + k + "':"), k + ' manque dans en.js'));
});
