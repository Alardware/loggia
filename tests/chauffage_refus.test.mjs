/* Les refus du planning de chauffe se disent dans la langue de l'écran
 * (chantier Chauffage, plan 2, tâche 3).
 *
 * Le serveur refuse une écriture du chauffage avec onze codes `chauffage_*`
 * (`RefusNomme`, chauffage_config.py et chauffage.py). Ce qu'il NOMME suit
 * les deux-points : la place d'un changement (« jeu[2].h »), un jour
 * (« jeu »), une consigne (« temperatures.eco »), une limite (« 32 ») — ou
 * l'identifiant opaque d'un chauffage et la clé de la date des Vacances, qui
 * ne doivent jamais s'afficher. `tests/refus_codes.test.mjs` tient l'accord
 * entre les codes du composant et ceux de l'écran ; ici, ce que chacun dit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// La langue de la machine ne doit pas changer le résultat : posée AVANT l'import d'i18n.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { texteRefus, raisonEchec, enregistrerRefus } = await import('../src/refus.js');
const { REFUS_CHAUFFAGE } = await import('../src/refuschauffage.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const refus = (code, message) => ({ code, message });

/* Relecture des tâches 11 et 12 : le démarrage ne garde que les quatre refus
 * qu'une CARTE peut recevoir d'une reprise en main, dits sans lieu. Les
 * autres — ceux de la configuration et de la maison — n'arrivent qu'à la
 * fiche d'un chauffage et à la barre « Maison », chargées à la demande, qui
 * les enregistrent en se chargeant (refuschauffage.js). Ce qui se dit AVANT
 * cet enregistrement est lu ici ; puis le fichier enregistre comme elles, et
 * les tests qui suivent tiennent les phrases d'avant, mot pour mot.
 * ASSERTION MODIFIÉE (en-tête) : l'enregistrement, et ce relevé d'avant. */
const AVANT = {
  carte: ['chauffage_inconnu', 'chauffage_sans_planning', 'chauffage_mode_inconnu', 'chauffage_temperature_hors_bornes']
    .map(code => [code, texteRefus(refus(code, 'motif : mode'))]),
  situe: [texteRefus(refus('chauffage_mode_inconnu', 'mode x inconnu : jeu[2].mode')), texteRefus(refus('chauffage_temperature_hors_bornes', 'hors bornes : temperatures.eco'))],
  ailleurs: ['chauffage_heure_illisible', 'chauffage_heure_en_double', 'chauffage_trop_de_changements', 'chauffage_semaine_vide',
    'chauffage_temperatures_desordre', 'chauffage_trop_de_chauffages', 'chauffage_date_illisible',
    'chauffage_programme_appareil', 'chauffage_programme_concurrent'].map(code => [code, texteRefus(refus(code, 'motif : 1'))]),
};
enregistrerRefus(REFUS_CHAUFFAGE);

test('le démarrage ne garde que les refus d’une carte, sans lieu ; la fiche et la barre enregistrent le reste en se chargeant', () => {
  assert.deepEqual(AVANT.carte, [
    ['chauffage_inconnu', 'Ce chauffage est introuvable.'],
    ['chauffage_sans_planning', 'Le planning de ce chauffage est éteint.'],
    ['chauffage_mode_inconnu', 'Ce chauffage ne connaît pas ce mode.'],
    ['chauffage_temperature_hors_bornes', 'Température hors bornes : de 5 à 30 °C.'],
  ], 'une carte dit ses refus sans attendre la fiche — la phrase d’avant');
  assert.deepEqual(AVANT.situe, ['Ce chauffage ne connaît pas ce mode.', 'Température hors bornes : de 5 à 30 °C.'],
    'sans la fiche, rien n’est situé : une reprise en main ne nomme jamais une place de la semaine');
  assert.ok(AVANT.ailleurs.every(([, phrase]) => phrase === null), 'ces refus sont sortis du démarrage : ' + JSON.stringify(AVANT.ailleurs));
  // La fiche et la barre les enregistrent à leur chargement, et ne les importent qu'elles.
  for (const f of ['fichechauffage.jsx', 'barremaison.jsx']) {
    const s = readFileSync(join(RACINE, 'src', f), 'utf8');
    assert.ok(s.includes("import { REFUS_CHAUFFAGE } from './refuschauffage.js';") && /\nenregistrerRefus\(REFUS_CHAUFFAGE\);\n/.test(s.replace(/\r\n/g, '\n')), f);
  }
  const importeurs = readdirSync(join(RACINE, 'src'), { recursive: true }).filter(f => /\.jsx?$/.test(String(f)))
    .filter(f => readFileSync(join(RACINE, 'src', String(f)), 'utf8').includes("from './refuschauffage.js'")).map(f => String(f).replace(/\\/g, '/')).sort();
  assert.deepEqual(importeurs, ['barremaison.jsx', 'fichechauffage.jsx']);
  const boot = readFileSync(join(RACINE, 'src', 'refus.js'), 'utf8');
  assert.ok(!boot.includes('ouDansLePlanning') && !boot.includes('chauffage_date_illisible'), 'refus.js reprend ce qui est sorti du démarrage');
});

const CODES = [
  'chauffage_heure_illisible', 'chauffage_heure_en_double', 'chauffage_mode_inconnu',
  'chauffage_trop_de_changements', 'chauffage_semaine_vide', 'chauffage_temperature_hors_bornes',
  'chauffage_temperatures_desordre', 'chauffage_inconnu', 'chauffage_sans_planning',
  'chauffage_trop_de_chauffages', 'chauffage_date_illisible',
  // Audit du 19/10 : le programme de l'appareil allume refuse l'allumage du planning.
  'chauffage_programme_appareil',
  // Velair, Scheduler ou une automatisation commande déjà le chauffage (D5).
  'chauffage_programme_concurrent',
  // Le décalage du capteur d'un thermostat, hors de −5 à +5 °C (30/10).
  'chauffage_decalage_hors_bornes',
];

// ASSERTION MODIFIÉE (audit du 19/10) : douze codes, le programme de l'appareil en plus.
// ASSERTION MODIFIÉE (audit du 19/10, D5) : treize codes, le programme concurrent en plus.
// ASSERTION MODIFIÉE (30/10) : quatorze, le décalage hors bornes en plus.
test('les quatorze codes sont ceux que le composant envoie', () => {
  const dossier = join(RACINE, 'custom_components', 'loggia');
  const py = readdirSync(dossier).filter(f => f.endsWith('.py'))
    .map(f => readFileSync(join(dossier, f), 'utf8')).join('\n');
  const codes = new Set([...py.matchAll(/RefusNomme\(\s*"(chauffage_[a-z_]+)"/g)].map(m => m[1]));
  assert.deepEqual([...codes].sort(), [...CODES].sort(), 'un code du chauffage est apparu ou a disparu : sa phrase avec');
});

test('chaque code a sa phrase, même quand le serveur ne nomme qu’un « 1 »', () => {
  for (const code of CODES) {
    const phrase = texteRefus(refus(code, 'motif : 1'));
    assert.equal(typeof phrase, 'string', code + ' : pas de phrase');
    assert.ok(phrase.trim(), code + ' : phrase vide');
  }
});

test('une faute dans la semaine se situe : le jour dans la langue de l’écran, le rang du changement', () => {
  assert.equal(texteRefus(refus('chauffage_heure_illisible', 'heure illisible : jeu[2].h')),
    'Heure illisible (jeudi, changement 3).');
  assert.equal(texteRefus(refus('chauffage_heure_en_double', 'deux changements a la meme heure : lun[0].h')),
    'Deux changements à la même heure (lundi, changement 1).');
  assert.equal(texteRefus(refus('chauffage_mode_inconnu', 'mode confort_1 inconnu de ce chauffage : dim[11].mode')),
    'Ce chauffage ne connaît pas ce mode (dimanche, changement 12).');
  assert.equal(texteRefus(refus('chauffage_trop_de_changements', 'plus de 12 changements ce jour : sam')),
    '12 changements par jour au plus (samedi).');
  // Par `raisonEchec` aussi : c'est elle que les écrans appellent.
  const phrase = raisonEchec(refus('chauffage_heure_en_double', 'deux changements a la meme heure : jeu[2].h'));
  assert.ok(phrase.includes('jeudi') && phrase.includes('3'), phrase);
});

test('ce qui ne se situe pas dans la semaine : la phrase générale', () => {
  const general = [
    ['chauffage_mode_inconnu', 'mode eco inconnu de ce chauffage : fenetre', 'Ce chauffage ne connaît pas ce mode.'],
    ['chauffage_mode_inconnu', 'mode chaud inconnu : maison.absence', 'Ce chauffage ne connaît pas ce mode.'],
    ['chauffage_mode_inconnu', 'mode chaud inconnu de ce chauffage : mode', 'Ce chauffage ne connaît pas ce mode.'],
    ['chauffage_semaine_vide', 'planning sans aucun changement : semaine', 'Un planning garde au moins un changement.'],
    ['chauffage_heure_illisible', 'heure illisible : jeu[x].h', 'Heure illisible.'],
    ['chauffage_heure_illisible', 'heure illisible : jeudi[2].h', 'Heure illisible.'],
    ['chauffage_heure_en_double', 'deux changements a la meme heure', 'Deux changements à la même heure.'],
    ['chauffage_trop_de_changements', 'plus de 12 changements ce jour', '12 changements par jour au plus.'],
  ];
  for (const [code, message, attendu] of general) assert.equal(texteRefus(refus(code, message)), attendu, message);
});

test('une consigne hors bornes dit son mode ; l’ordre des consignes se dit en entier', () => {
  const bornes = (nomme) => texteRefus(refus('chauffage_temperature_hors_bornes', 'temperature hors bornes (5 a 30 °C) : ' + nomme));
  assert.equal(bornes('temperatures.eco'), 'Température hors bornes (Éco) : de 5 à 30 °C.');
  assert.equal(bornes('temperatures.hors_gel'), 'Température hors bornes (Hors-gel) : de 5 à 30 °C.');
  assert.equal(bornes('temperatures.confort'), 'Température hors bornes (Confort) : de 5 à 30 °C.');
  // La consigne d'une reprise en main : un seul champ, rien à situer.
  assert.equal(bornes('temperature'), 'Température hors bornes : de 5 à 30 °C.');
  assert.equal(texteRefus(refus('chauffage_temperatures_desordre', 'temperatures en desordre (hors_gel < eco <= confort) : temperatures.eco')),
    'Les températures doivent rester dans l’ordre : Hors-gel sous Éco, Éco au plus Confort.');
});

test('trop de chauffages : la limite que le serveur nomme, sinon rien de juste à dire', () => {
  assert.equal(texteRefus(refus('chauffage_trop_de_chauffages', 'trop de chauffages, au plus : 32')), '32 chauffages au plus.');
  assert.equal(raisonEchec(refus('chauffage_trop_de_chauffages', 'trop de chauffages, au plus : 32')), '32 chauffages au plus.');
  assert.equal(texteRefus(refus('chauffage_trop_de_chauffages', 'trop de chauffages, au plus')), null,
    'une phrase avec un trou à la place du nombre');
});

test('l’identifiant d’un chauffage et la clé de la date ne s’affichent jamais', () => {
  const ID = '0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f';
  const cas = [
    ['chauffage_inconnu', 'chauffage inconnu : ' + ID, 'Ce chauffage est introuvable.'],
    ['chauffage_inconnu', 'chauffage introuvable : ' + ID, 'Ce chauffage est introuvable.'],
    ['chauffage_sans_planning', 'planning eteint pour ce chauffage : ' + ID, 'Le planning de ce chauffage est éteint.'],
  ];
  for (const [code, message, attendu] of cas) {
    assert.equal(texteRefus(refus(code, message)), attendu, message);
    assert.equal(raisonEchec(refus(code, message), 'loggia_chauffage'), attendu, message);
  }
  const date = texteRefus(refus('chauffage_date_illisible', 'date illisible ou passee : maison.vacances_fin'));
  assert.equal(date, 'Date de retour illisible ou déjà passée.');
  assert.ok(!/vacances_fin|maison\./.test(date), date);
});
