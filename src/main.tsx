import React from 'react';
import ReactDOM from 'react-dom/client';
import { IconContext } from '@phosphor-icons/react';
import App from './App';
import { AppProvider } from './lib/store';
import './styles.css';
// Phosphor's light weight is the house icon style; icons under 16px opt into regular.
const icons = { weight: 'light' as const, mirrored: false };
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <IconContext.Provider value={icons}>
      <AppProvider>
        <App />
      </AppProvider>
    </IconContext.Provider>
  </React.StrictMode>,
);
