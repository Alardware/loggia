/* Saphir, Acier, Givre : trois thèmes tirés de trois planches de couleurs
 * envoyées le 25/10/2026 — « Primary Blue », « Сталь » et la « Holst »
 * bleue. Même forme que les presets de `theme.js` (entrée d'`applyVars`).
 *
 * Pourquoi un fichier à part : le boot n'avait plus que 2,5 Ko sous sa borne
 * (tests/lot14_chargement.test.mjs). Ces trois thèmes n'y entrent pas ; ils
 * arrivent quand on en choisit un, et `applyTheme` se rejoue à leur arrivée.
 *
 * Les valeurs sont celles des planches. Là où un texte manquerait son seuil,
 * la garde de contraste (ADR 0060) en relève la clarté à l'exécution, sans
 * changer de teinte.
 *
 * Comme pour The Projekt, la hiérarchie se fait par la CLARTÉ : les accents
 * décoratifs (volets, scènes, épingles) restent dans le bleu, l'avertissement
 * garde sa chaleur, les points vert / rouge leur sens, et les teintes des
 * pièces ne sont pas reprises — elles identifient, elles n'habillent pas. */

const MANROPE = "'Manrope', -apple-system, sans-serif";

// Ce qui ne change pas d'un thème bleu à l'autre : la lecture d'un point vert
// ou d'une jauge rouge, refroidie en sombre, assombrie en clair.
const SEM_SOMBRE = {
  '--o-ok': '#4fd1a5', '--o-ok-rgb': '79,209,165',
  '--o-warn2': '#f0b25e', '--o-warn2-rgb': '240,178,94',
  '--o-bad': '#f58c7f', '--o-bad-rgb': '245,140,127',
  '--o-warn': '#f2c97d', '--o-warn-rgb': '242,201,125',
};
const SEM_CLAIR = {
  '--o-ok': '#0f7a5a', '--o-ok-rgb': '15,122,90',
  '--o-warn2': '#a85b0b', '--o-warn2-rgb': '245,158,11',
  '--o-bad': '#b4231a', '--o-bad-rgb': '239,68,68',
  '--o-warn': '#9a6809', '--o-warn-rgb': '154,104,9',
};

export const THEMES_BLEUS = {
  /* ── Saphir — planche « Primary Blue ».
   * Un quasi-noir #02060A éclairé d'en haut par le bleu roi (le dégradé
   * Midnight → Primary de la planche). Le bleu roi #24428F REMPLIT ; le cyan
   * #63A7D4 ÉCRIT : sur ce fond, le roi en texte ne se lirait pas. */
  saphir: {
    dark: {
      bg: '#02060a', surface: '#0b1521', surfaceElevated: '#13263b', text: '#ffffff', muted: '#9db3cc',
      border: 'rgba(227,241,248,.12)', accent: '#24428f', accentText: '#63a7d4',
      radius: '16px', borderWidth: '1px',
      shadow: '0 4px 12px rgba(0,0,0,.5), 0 18px 40px rgba(2,6,10,.45)',
      bggrad: 'radial-gradient(120% 80% at 50% -15%, #1a2f63 0%, #0b1521 40%, #050a10 68%, #02060a 90%)',
      font: MANROPE,
      fine: {
        '--o-surfA': '#13263b', '--o-surfB': '#0b1521',
        '--o-bg2': '#050a10', '--o-side1': '#07101a', '--o-side2': '#02060a',
        '--o-header': 'rgba(2,6,10,.82)',
        '--o-well': '#08101a', '--o-well0': '#13263b', '--o-well2': '#02060a',
        '--o-text': '#ffffff', '--o-text1': '#e3f1f8', '--o-text2': '#9db3cc', '--o-text3': '#7d97b4',
        '--o-bd1': 'rgba(227,241,248,.16)', '--o-bd2': 'rgba(227,241,248,.105)', '--o-bd3': 'rgba(227,241,248,.07)',
        '--o-s1': 'rgba(227,241,248,.09)', '--o-s2': 'rgba(227,241,248,.06)', '--o-s3': 'rgba(227,241,248,.042)',
        '--o-s4': 'rgba(227,241,248,.028)', '--o-s5': 'rgba(227,241,248,.028)',
        '--o-sky': 'rgba(36,66,143,.4)',
        ...SEM_SOMBRE,
        '--o-gold': '#e3f1f8', '--o-gold-rgb': '227,241,248',
        '--o-cold': '#9fc8e6', '--o-cold-rgb': '159,200,230',
        '--o-cyan': '#6cc3ec', '--o-cyan-rgb': '108,195,236',
        '--o-purple': '#8aa6cc', '--o-purple-rgb': '138,166,204',
        '--o-shadow-hover': '0 22px 48px rgba(36,66,143,.45)',
      },
    },
    light: {
      bg: '#e3f1f8', surface: '#ffffff', surfaceElevated: '#ffffff', text: '#02060a', muted: '#3a5c8c',
      border: 'rgba(11,21,33,.12)', accent: '#24428f', accentText: '#24428f',
      radius: '16px', borderWidth: '1px',
      shadow: '0 1px 2px rgba(11,21,33,.06), 0 10px 26px rgba(19,38,59,.08)',
      bggrad: 'radial-gradient(118% 78% at 50% -14%, #ffffff 0%, #eef6fb 38%, #e3f1f8 100%)',
      font: MANROPE,
      fine: {
        '--o-surfA': '#ffffff', '--o-surfB': '#fbfdff',
        '--o-bg2': '#eef6fb', '--o-side1': '#ffffff', '--o-side2': '#e3f1f8',
        '--o-header': 'rgba(246,251,253,.88)',
        '--o-well': '#ffffff', '--o-well0': '#ffffff', '--o-well2': '#e3f1f8',
        '--o-text': '#02060a', '--o-text1': '#0b1521', '--o-text2': '#3a5c8c', '--o-text3': '#55759f',
        '--o-bd1': 'rgba(11,21,33,.16)', '--o-bd2': 'rgba(11,21,33,.11)', '--o-bd3': 'rgba(11,21,33,.075)',
        '--o-s1': 'rgba(11,21,33,.075)', '--o-s2': 'rgba(11,21,33,.05)', '--o-s3': 'rgba(11,21,33,.035)',
        '--o-s4': 'rgba(11,21,33,.022)', '--o-s5': 'rgba(11,21,33,.022)',
        '--o-sky': 'rgba(36,66,143,.22)',
        ...SEM_CLAIR,
        '--o-gold': '#13263b', '--o-gold-rgb': '19,38,59',
        '--o-cold': '#24609a', '--o-cold-rgb': '36,96,154',
        '--o-cyan': '#1f6f9f', '--o-cyan-rgb': '31,111,159',
        '--o-purple': '#3a5c8c', '--o-purple-rgb': '58,92,140',
        '--o-shadow-hover': '0 18px 40px rgba(19,38,59,.14)',
      },
    },
  },
  /* ── Acier — planche « Сталь », sept gris bleutés de #10161C à #E7EDF2.
   * Rien de vif : l'accent est l'acier moyen #4E6A83, qui porte encore le
   * texte blanc ; les volets, les scènes et les épingles se distinguent par
   * la clarté, comme sur la planche. Le fond descend du haut, comme elle. */
  acier: {
    dark: {
      bg: '#10161c', surface: '#19242e', surfaceElevated: '#1f2c38', text: '#e7edf2', muted: '#9fb2c3',
      border: 'rgba(183,198,211,.12)', accent: '#4e6a83', accentText: '#b7c6d3',
      radius: '16px', borderWidth: '1px',
      shadow: '0 4px 12px rgba(0,0,0,.4), 0 16px 36px rgba(5,8,11,.4)',
      bggrad: 'linear-gradient(180deg, #1b2631 0%, #10161c 58%, #0c1116 100%)',
      font: MANROPE,
      fine: {
        '--o-surfA': '#1f2c38', '--o-surfB': '#19242e',
        '--o-bg2': '#121920', '--o-side1': '#151d25', '--o-side2': '#10161c',
        '--o-header': 'rgba(16,22,28,.85)',
        '--o-well': '#141c24', '--o-well0': '#1f2c38', '--o-well2': '#10161c',
        '--o-text': '#e7edf2', '--o-text1': '#d0dbe4', '--o-text2': '#9fb2c3', '--o-text3': '#8199ae',
        '--o-bd1': 'rgba(183,198,211,.16)', '--o-bd2': 'rgba(183,198,211,.105)', '--o-bd3': 'rgba(183,198,211,.07)',
        '--o-s1': 'rgba(183,198,211,.09)', '--o-s2': 'rgba(183,198,211,.06)', '--o-s3': 'rgba(183,198,211,.042)',
        '--o-s4': 'rgba(183,198,211,.028)', '--o-s5': 'rgba(183,198,211,.028)',
        '--o-sky': 'rgba(78,106,131,.4)',
        ...SEM_SOMBRE,
        '--o-warn': '#e6c27e', '--o-warn-rgb': '230,194,126',
        '--o-gold': '#e7edf2', '--o-gold-rgb': '231,237,242',
        '--o-cold': '#a9c2d8', '--o-cold-rgb': '169,194,216',
        '--o-cyan': '#7fb7d6', '--o-cyan-rgb': '127,183,214',
        '--o-purple': '#8199ae', '--o-purple-rgb': '129,153,174',
        '--o-shadow-hover': '0 20px 44px rgba(0,0,0,.45)',
      },
    },
    light: {
      bg: '#e7edf2', surface: '#ffffff', surfaceElevated: '#ffffff', text: '#10161c', muted: '#4e6a83',
      border: 'rgba(16,22,28,.12)', accent: '#33475a', accentText: '#33475a',
      radius: '16px', borderWidth: '1px',
      shadow: '0 1px 2px rgba(16,22,28,.06), 0 10px 26px rgba(31,44,56,.08)',
      bggrad: 'linear-gradient(180deg, #f3f6f9 0%, #e7edf2 50%, #dbe4ec 100%)',
      font: MANROPE,
      fine: {
        '--o-surfA': '#ffffff', '--o-surfB': '#f8fafc',
        '--o-bg2': '#eef2f6', '--o-side1': '#ffffff', '--o-side2': '#e7edf2',
        '--o-header': 'rgba(243,246,249,.88)',
        '--o-well': '#ffffff', '--o-well0': '#ffffff', '--o-well2': '#e7edf2',
        '--o-text': '#10161c', '--o-text1': '#1f2c38', '--o-text2': '#4e6a83', '--o-text3': '#5d7890',
        '--o-bd1': 'rgba(16,22,28,.16)', '--o-bd2': 'rgba(16,22,28,.11)', '--o-bd3': 'rgba(16,22,28,.075)',
        '--o-s1': 'rgba(16,22,28,.075)', '--o-s2': 'rgba(16,22,28,.05)', '--o-s3': 'rgba(16,22,28,.035)',
        '--o-s4': 'rgba(16,22,28,.022)', '--o-s5': 'rgba(16,22,28,.022)',
        '--o-sky': 'rgba(51,71,90,.22)',
        ...SEM_CLAIR,
        '--o-gold': '#1f2c38', '--o-gold-rgb': '31,44,56',
        '--o-cold': '#3d6a8e', '--o-cold-rgb': '61,106,142',
        '--o-cyan': '#2f6380', '--o-cyan-rgb': '47,99,128',
        '--o-purple': '#4e6a83', '--o-purple-rgb': '78,106,131',
        '--o-shadow-hover': '0 18px 40px rgba(31,44,56,.14)',
      },
    },
  },
  /* ── Givre — la planche « Holst » bleue, de #223A5E à #F3F8FD.
   * Sa nature est claire : texte et icônes dans les bleus de la planche, sur
   * un fond qui monte du #D0E1F2 au #F3F8FD. Le sombre est un bleu marine,
   * pas du noir ; le fond y reste plus sombre que les cartes, sinon elles
   * s'y perdraient en haut de page. */
  givre: {
    dark: {
      bg: '#0f1c30', surface: '#223a5e', surfaceElevated: '#294670', text: '#f3f8fd', muted: '#9fc0e3',
      border: 'rgba(208,225,242,.14)', accent: '#4d79a8', accentText: '#d0e1f2',
      radius: '16px', borderWidth: '1px',
      shadow: '0 4px 12px rgba(5,12,24,.4), 0 16px 36px rgba(5,12,24,.35)',
      bggrad: 'linear-gradient(180deg, #1f3557 0%, #172a44 45%, #0f1c30 100%)',
      font: MANROPE,
      fine: {
        '--o-surfA': '#294670', '--o-surfB': '#223a5e',
        '--o-bg2': '#172a44', '--o-side1': '#1b3050', '--o-side2': '#0f1c30',
        '--o-header': 'rgba(15,28,48,.85)',
        '--o-well': '#1b3050', '--o-well0': '#294670', '--o-well2': '#0f1c30',
        '--o-text': '#f3f8fd', '--o-text1': '#d0e1f2', '--o-text2': '#9fc0e3', '--o-text3': '#8cb0d8',
        '--o-bd1': 'rgba(208,225,242,.18)', '--o-bd2': 'rgba(208,225,242,.12)', '--o-bd3': 'rgba(208,225,242,.08)',
        '--o-s1': 'rgba(208,225,242,.1)', '--o-s2': 'rgba(208,225,242,.07)', '--o-s3': 'rgba(208,225,242,.05)',
        '--o-s4': 'rgba(208,225,242,.03)', '--o-s5': 'rgba(208,225,242,.03)',
        '--o-sky': 'rgba(110,158,204,.35)',
        ...SEM_SOMBRE,
        '--o-gold': '#f3f8fd', '--o-gold-rgb': '243,248,253',
        '--o-cold': '#bcd6f0', '--o-cold-rgb': '188,214,240',
        '--o-cyan': '#8fd0f0', '--o-cyan-rgb': '143,208,240',
        '--o-purple': '#9fc0e3', '--o-purple-rgb': '159,192,227',
        '--o-shadow-hover': '0 20px 44px rgba(5,12,24,.45)',
      },
    },
    light: {
      bg: '#d0e1f2', surface: '#f3f8fd', surfaceElevated: '#ffffff', text: '#223a5e', muted: '#355982',
      border: 'rgba(34,58,94,.14)', accent: '#355982', accentText: '#223a5e',
      radius: '16px', borderWidth: '1px',
      shadow: '0 1px 2px rgba(34,58,94,.08), 0 10px 26px rgba(34,58,94,.1)',
      bggrad: 'linear-gradient(180deg, #f3f8fd 0%, #e2edf8 45%, #d0e1f2 100%)',
      font: MANROPE,
      fine: {
        '--o-surfA': '#ffffff', '--o-surfB': '#f3f8fd',
        '--o-bg2': '#e2edf8', '--o-side1': '#f3f8fd', '--o-side2': '#d0e1f2',
        '--o-header': 'rgba(243,248,253,.88)',
        '--o-well': '#eaf2fa', '--o-well0': '#ffffff', '--o-well2': '#d0e1f2',
        '--o-text': '#223a5e', '--o-text1': '#2b4870', '--o-text2': '#355982', '--o-text3': '#4d79a8',
        '--o-bd1': 'rgba(34,58,94,.18)', '--o-bd2': 'rgba(34,58,94,.12)', '--o-bd3': 'rgba(34,58,94,.08)',
        '--o-s1': 'rgba(34,58,94,.08)', '--o-s2': 'rgba(34,58,94,.055)', '--o-s3': 'rgba(34,58,94,.04)',
        '--o-s4': 'rgba(34,58,94,.025)', '--o-s5': 'rgba(34,58,94,.025)',
        '--o-sky': 'rgba(77,121,168,.25)',
        ...SEM_CLAIR,
        '--o-gold': '#223a5e', '--o-gold-rgb': '34,58,94',
        '--o-cold': '#3f6f9f', '--o-cold-rgb': '63,111,159',
        '--o-cyan': '#2f6d9e', '--o-cyan-rgb': '47,109,158',
        '--o-purple': '#4d79a8', '--o-purple-rgb': '77,121,168',
        '--o-shadow-hover': '0 18px 40px rgba(34,58,94,.16)',
      },
    },
  },
};
