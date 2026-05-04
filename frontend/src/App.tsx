import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TitlePage from './pages/TitlePage';
import HomePage from './pages/HomePage';
import DeckBuilderPage from './pages/DeckBuilderPage';
import BattlePage from './pages/BattlePage';
import OnlineLobbyPage from './pages/OnlineLobbyPage';
import ResultPage from './pages/ResultPage';
import PokemonDetailPage from './pages/PokemonDetailPage';
import TeamPreviewPage from './pages/TeamPreviewPage';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TitlePage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/deck-builder" element={<DeckBuilderPage />} />
        <Route path="/team-preview" element={<TeamPreviewPage />} />
        <Route path="/online-lobby" element={<OnlineLobbyPage />} />
        <Route path="/battle" element={<BattlePage />} />
        <Route path="/result" element={<ResultPage />} />
        <Route path="/pokedex/:speciesId" element={<PokemonDetailPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
