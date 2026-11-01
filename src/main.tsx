import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/yatra-one/400.css';
import '@fontsource/martel/400.css';
import '@fontsource/martel/700.css';
import './shared/tokens.css';
import './shared/ui.css';
import './app/app.css';
import App from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
