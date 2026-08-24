import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { migrerAnciennesCles } from './state.js';
import './index.css';

// Avant toute lecture, donc avant le rendu : sans cela, une installation qui
// vient d'Orion demarre sur des reglages vides et les reecrit aussitot.
migrerAnciennesCles();

/**
 * Filet de securite au rendu.
 *
 * Une erreur pendant le rendu demonte tout l'arbre React : la page reste noire,
 * sans un mot. Le message se trouve dans la console — encore faut-il l'ouvrir,
 * et savoir que le dashboard tourne dans une iframe.
 *
 * Ici, l'erreur s'affiche. C'est moins beau qu'un dashboard, mais infiniment
 * plus utile qu'un ecran noir.
 */
class LoggiaErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err, info) {
    console.error('Loggia : erreur de rendu', err, info);
  }

  render() {
    const { err } = this.state;
    if (!err) return this.props.children;
    const box = {
      minHeight: '100vh', padding: '40px 24px', boxSizing: 'border-box',
      background: '#0b1017', color: '#e6ecf5',
      font: '400 14px/1.6 ui-sans-serif, system-ui, sans-serif',
    };
    const pre = {
      whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12,
      background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)',
      borderRadius: 10, padding: '12px 14px', margin: '14px 0 18px', maxHeight: 260, overflow: 'auto',
    };
    return (
      <div style={box}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Loggia n'a pas pu s'afficher</div>
          <div style={{ color: '#93a3ba' }}>
            Une erreur est survenue pendant le rendu. Le détail ci-dessous permet de la corriger.
          </div>
          <pre style={pre}>{String((err && err.stack) || (err && err.message) || err)}</pre>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: '#4f8cff', color: '#06121f' }}
          >
            Recharger
          </button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <LoggiaErrorBoundary><App /></LoggiaErrorBoundary>
);
