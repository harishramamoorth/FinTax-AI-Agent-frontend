import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './styles/index.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.error('FinTax offline support could not be enabled.', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
