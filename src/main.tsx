import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource/dm-sans/latin-700.css';
import './styles.css';
const root = ReactDOM.createRoot(document.getElementById('root')!);
if (import.meta.env.DEV && new URLSearchParams(location.search).get('debug') === 'poses') {
  void import('./PoseViewer').then(({ default: PoseViewer }) => root.render(<React.StrictMode><PoseViewer /></React.StrictMode>));
} else root.render(<React.StrictMode><App /></React.StrictMode>);
