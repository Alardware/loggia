// Ce que le plan 3D lit d'un modele (chantier Plan 3D, ADR 0230).
//
// Une petite maison construite ici, aux conventions du correctif de Claude
// Design (17/10) : des battants `*_ouvrant` poses sur leur charniere, une
// fenetre enregistree OUVERTE, des portes enregistrees fermees.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { indexerModele, poserOuvrant } from '../src/plan3dmodele.js';

const boite = (nom, x, y, z, sx, sy, sz, mat = new THREE.MeshStandardMaterial()) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.name = nom; m.position.set(x, y, z);
  return m;
};
const groupe = (nom, enfants = [], x = 0, y = 0, z = 0) => {
  const g = new THREE.Group(); g.name = nom; g.position.set(x, y, z);
  enfants.forEach((e) => g.add(e));
  return g;
};
const angleY = (o) => Math.round(THREE.MathUtils.radToDeg(new THREE.Euler().setFromQuaternion(o.quaternion, 'YXZ').y));
const trouver = (racine, nom) => { let o = null; racine.traverse((x) => { if (!o && x.name === nom) o = x; }); return o; };

/* Un couloir (z de -1 a 0) entre la chambre (z de 0 a 3) et le bureau (z de -4 a -1).
 * La porte de la chambre est dans la cloison z = 0, sa charniere en x = 1. */
function maison() {
  const lampe = new THREE.MeshStandardMaterial({ emissive: 0xffffff });
  const porteChambre = groupe('porte_chambre_ouvrant', [boite('porte_chambre', 0.4, 1, 0, 0.8, 2, 0.04)], 1, 0, 0);
  const fenetre = groupe('fenetre_bureau_ouvrant_1', [boite('fenetre_bureau_ouvrant_1_vitrage', 0.3, 1.5, 0, 0.6, 1, 0.02)], 2, 0, -4);
  fenetre.rotation.y = THREE.MathUtils.degToRad(80);   // enregistree ouverte
  const libre = groupe('fenetre_chambre_ouvrant_1', [boite('fenetre_chambre_ouvrant_1_vitrage', 0.3, 1.5, 0, 0.6, 1, 0.02)], 2, 0, 3);
  libre.rotation.y = THREE.MathUtils.degToRad(80);     // ouverte, mais reliee a rien
  return groupe('maison', [groupe('structure', [
    boite('sol_chambre', 2, 0, 1.5, 4, 0.02, 3), boite('sol_couloir', 2, 0, -0.5, 4, 0.02, 1), boite('sol_bureau', 2, 0, -2.5, 4, 0.02, 3),
    boite('cloison_chambre_0', 0.25, 1.25, 0, 0.5, 2.5, 0.1), boite('cloison_chambre_1', 3, 1.25, 0, 2, 2.5, 0.1),
  ]), groupe('menuiseries', [porteChambre, fenetre, libre]),
  groupe('light.chambre', [boite('ampoule', 2, 2.3, 1.5, 0.1, 0.1, 0.1, lampe)]),
  groupe('light.bureau', [boite('ampoule', 2, 2.3, -2.5, 0.1, 0.1, 0.1, lampe)])]);
}

test('une fenetre enregistree ouverte se ferme ; ouverte, elle reprend son angle et sa teinte ambre', () => {
  const racine = maison();
  const idx = indexerModele(racine, { fenetre_bureau_ouvrant_1: { entite: 'binary_sensor.fenetre_bureau' } });
  const e = idx.entites.get('binary_sensor.fenetre_bureau');
  assert.ok(e && e.ouvrants.length === 1, 'la fenetre reliee n’est pas un ouvrant');
  poserOuvrant(e.ouvrants[0], 0, e.meshes);
  assert.equal(angleY(e.ouvrants[0].noeud), 0, 'fermee, elle reste ouverte');
  poserOuvrant(e.ouvrants[0], 1, e.meshes);
  assert.equal(angleY(e.ouvrants[0].noeud), 80, 'ouverte, elle n’a pas son angle enregistre');
  assert.ok(e.meshes[0].material.emissiveIntensity > 0, 'ouverte, elle n’est pas teintee');
});

test('une porte s’ouvre dans la piece qu’elle nomme, jamais dans le mur', () => {
  const racine = maison();
  const idx = indexerModele(racine, { porte_chambre_ouvrant: { entite: 'binary_sensor.porte_chambre' } });
  const e = idx.entites.get('binary_sensor.porte_chambre');
  poserOuvrant(e.ouvrants[0], 1, e.meshes);
  racine.updateMatrixWorld(true);
  const centre = new THREE.Box3().setFromObject(e.ouvrants[0].noeud).getCenter(new THREE.Vector3());
  assert.ok(centre.z > 0.1, 'la porte de la chambre s’ouvre cote couloir (z = ' + centre.z.toFixed(2) + ')');
  assert.equal(Math.abs(angleY(e.ouvrants[0].noeud)), 90);
});

test('un battant que rien ne relie est montre ferme', () => {
  const racine = maison();
  indexerModele(racine, {});
  assert.equal(angleY(trouver(racine, 'fenetre_chambre_ouvrant_1')), 0);
});

test('chaque lampe a son materiau : deux lampes ne s’allument jamais ensemble', () => {
  const racine = maison();
  const idx = indexerModele(racine, {});
  const a = idx.entites.get('light.chambre').ampoules[0].material;
  const b = idx.entites.get('light.bureau').ampoules[0].material;
  assert.notEqual(a, b);
});

test('delier un appareil emporte ses pieces : elles ne deviennent pas des appareils', () => {
  const racine = maison();
  trouver(racine, 'light.chambre').add(boite('light.chambre_cordon', 2, 2.4, 1.5, 0.01, 0.2, 0.01));
  const idx = indexerModele(racine, { 'light.chambre': { aucun: true } });
  assert.ok(!idx.entites.has('light.chambre') && !idx.entites.has('light.chambre_cordon'));
});

test('un modele a plat (un .obj) : les morceaux d’une lampe vont a leur appareil, s’il existe chez Home Assistant', () => {
  /* Le premier .obj reel (18/10) : 63 « appareils » au lieu de 11, chaque
   * cordon et chaque cloche a cote de sa lampe, plus aucun groupe. */
  const racine = groupe('maison', [
    boite('light.salon', 0, 2, 0, 0.2, 0.2, 0.2), boite('light.salon_cordon', 0, 2.3, 0, 0.01, 0.4, 0.01),
    boite('light.salon_cloche_1', 0.5, 2, 0, 0.2, 0.2, 0.2), boite('light.salon_cloche_1_capot', 0.5, 2.1, 0, 0.2, 0.05, 0.2),
    boite('light.salon_2', 2, 2, 0, 0.2, 0.2, 0.2),
    boite('switch.exterieur_applique_1', 5, 2, 0, 0.1, 0.2, 0.1), boite('switch.exterieur_1', 5, 2, 0.1, 0.05, 0.05, 0.05),
  ]);
  const idx = indexerModele(racine, {}, { connus: ['light.salon', 'light.salon_2', 'switch.exterieur'] });
  assert.deepEqual([...idx.entites.keys()].sort(), ['light.salon', 'light.salon_2', 'switch.exterieur']);
  assert.equal(idx.entites.get('light.salon').noeuds.length, 4, 'le cordon, la cloche et son capot vont a light.salon');
  assert.equal(idx.entites.get('switch.exterieur').noeuds.length, 2, 'les appliques vont a switch.exterieur, que personne ne nomme');
  // Sans la liste de Home Assistant, rien ne se devine.
  assert.equal(indexerModele(racine.clone(), {}).entites.size, 7);
});
