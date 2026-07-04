import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ParticleBackground from './components/ParticleBackground';
import HomePage from './pages/HomePage';
import SwapPage from './pages/SwapPage';
import MyIntentsPage from './pages/MyIntentsPage';
import ExplorerPage from './pages/ExplorerPage';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="min-h-screen relative" style={{ background: 'var(--bg-primary)' }}>
          <ParticleBackground />
          <Navbar />
          <main>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/swap" element={<SwapPage />} />
              <Route path="/intents" element={<MyIntentsPage />} />
              <Route path="/explorer" element={<ExplorerPage />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
