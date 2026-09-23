import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/core/render/render.css';
import './index.css';
import { installAppFonts } from '@/editor/fonts';
import { App } from './App';

installAppFonts();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
