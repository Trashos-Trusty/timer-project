import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { ToastProvider } from './context/ToastContext';

// Production : aucun log visible dans la console/DevTools du renderer.
// (Le build CRA fixe NODE_ENV à 'production'.) Toute journalisation applicative
// est neutralisée pour ne rien exposer, même si les DevTools sont forcés.
if (process.env.NODE_ENV === 'production') {
  const noop = () => {};
  ['log', 'info', 'debug', 'warn', 'error', 'trace', 'table', 'dir', 'group', 'groupCollapsed', 'groupEnd']
    .forEach((method) => {
      if (typeof console[method] === 'function') {
        console[method] = noop;
      }
    });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
