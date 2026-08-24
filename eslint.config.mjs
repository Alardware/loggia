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

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, react },
    rules: {
      ...js.configs.recommended.rules,
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
