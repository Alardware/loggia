// Attraper ce que ni Vite ni la relecture ne voient : une variable jamais
// definie, un hook appele sous condition, une dependance d'effet oubliee.
//
// Vite ne les voit pas — ce n'est pas une erreur de syntaxe, seulement une
// erreur d'execution. Le bundle se construit, la page s'ouvre, et React
// demonte tout l'arbre au premier rendu : ecran noir.
//
// C'est arrive six fois pendant la refonte, toujours de la meme facon : un
// remplacement retire une declaration, ses usages restent. `no-undef` le dit en
// une seconde.
//
//   npm run lint
//
// Volontairement minimal : ce fichier n'est pas un manifeste de style. Des
// regles de mise en forme feraient du bruit sur un fichier de 8 000 lignes
// ecrit avant elles, et noieraient le seul signal qui compte.

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';
import a11y from 'eslint-plugin-jsx-a11y';

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, react, 'jsx-a11y': a11y },
    rules: {
      ...js.configs.recommended.rules,
      /* L'accessibilite, en AVERTISSEMENT.
       *
       * `npm run lint` tourne avec `--quiet` et ne montre que les erreurs : le
       * signal qui casse la page reste donc seul a l'ecran, comme voulu plus
       * haut. Ces regles-la se lisent avec `npm run lint:tout`, qui sort aussi
       * les avertissements.
       *
       * Pourquoi pas en erreur : au 06/09 elles relevent 121 cas, surtout des
       * boutons sans intitule lisible et des `onClick` poses sur un `div` —
       * reels (rien ne repond au clavier), mais
       * dans du JSX ecrit avant la regle. Les corriger d'un bloc sans pouvoir
       * regarder chaque ecran, c'est echanger un defaut d'accessibilite contre
       * un defaut de mise en page. La dette est donc chiffree et visible plutot
       * que masquee. */
      ...Object.fromEntries(Object.entries(a11y.flatConfigs.recommended.rules)
        .map(([regle]) => [regle, 'warn'])),
      /* `no-autofocus` ne s'applique pas a ce dashboard.
       *
       * La regle vise les pages web ou un champ focalise AU CHARGEMENT
       * desoriente : on arrive quelque part, et le curseur est deja pose sans
       * qu'on l'ait demande.
       *
       * Ici, les dix-huit `autoFocus` sont tous dans des feuilles ouvertes a la
       * demande — la recherche (Ctrl+K), la saisie d'un code, le choix d'une
       * entite, le renommage d'une vue. Donner le focus au premier champ d'un
       * dialogue qui vient de s'ouvrir est le motif RECOMMANDE : sans lui, il
       * faudrait un clic ou une tabulation de plus a chaque ouverture, pour
       * tout le monde.
       *
       * Desactivee une fois plutot que dix-huit : dix-huit exceptions
       * identiques disent moins bien la meme chose, et la dix-neuvieme serait
       * posee sans reflechir. */
      'jsx-a11y/no-autofocus': 'off',
      // Un hook appele sous condition casse l'ordre des hooks : React lit
      // alors l'etat d'un autre. Erreur, jamais negociable.
      // LE filet : `no-undef` ne voit pas les composants JSX. Un composant
      // deplace sans son import passait donc le lint et cassait la page.
      'react/jsx-no-undef': 'error',
      // Miroir de la precedente : sans elle, `no-unused-vars` croit morts les
      // composants utilises uniquement en JSX.
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      // Dependance oubliee = valeur figee au premier rendu. Averti seulement :
      // ajouter une dependance a l'aveugle peut creer une boucle de rendu, il
      // faut lire chaque cas.
      'react-hooks/exhaustive-deps': 'warn',
      // Le motif recherche.
      'no-undef': 'error',
      // Utile, mais moins critique : une variable morte ne casse rien.
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      // Bruit sur du code existant, sans rapport avec la panne visee.
      'no-empty': 'off',
      'no-cond-assign': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
      'no-prototype-builtins': 'off',
    },
  },
];
