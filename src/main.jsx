import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';
import Admin from './components/Admin.jsx';
import { adminMode } from './lib/supabase';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {adminMode ? <Admin /> : <App />}
  </React.StrictMode>
);
