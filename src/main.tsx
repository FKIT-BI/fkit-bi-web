import { createRoot } from 'react-dom/client';
import './style.css';

const analyticsApi = import.meta.env.VITE_ANALYTICS_API_URL ?? '/api/analytics';
const generatorApi = import.meta.env.VITE_GENERATOR_API_URL ?? '/api/generator';
function App() {
  return <main><h1>FKIT BI</h1><p>Стартовый каркас web-клиента.</p><small>Analytics: {analyticsApi}; Generator: {generatorApi}</small></main>;
}
createRoot(document.getElementById('root')!).render(<App />);
