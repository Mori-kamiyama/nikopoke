import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TitlePage from './pages/TitlePage';
import HomePage from './pages/HomePage';
import DeckBuilderPage from './pages/DeckBuilderPage';
import BattlePage from './pages/BattlePage';
import ResultPage from './pages/ResultPage';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TitlePage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/deck-builder" element={<DeckBuilderPage />} />
        <Route path="/battle" element={<BattlePage />} />
        <Route path="/result" element={<ResultPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
