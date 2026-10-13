import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { connect, loadInitial } from './lib/store.js';
import './styles.css';

loadInitial().finally(() => {
  connect();
  createRoot(document.getElementById('root')).render(<App />);
});
