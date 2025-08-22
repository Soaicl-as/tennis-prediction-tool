import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { Navigation } from './components/Navigation';
import { PredictionPage } from './pages/PredictionPage';
import { PlayersPage } from './pages/PlayersPage';
import { HistoryPage } from './pages/HistoryPage';
import { MetricsPage } from './pages/MetricsPage';
import { LiveDataPage } from './pages/LiveDataPage';
import { SyncPage } from './pages/SyncPage';
import { UploadPage } from './pages/UploadPage';

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<PredictionPage />} />
            <Route path="/players" element={<PlayersPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/metrics" element={<MetricsPage />} />
            <Route path="/live" element={<LiveDataPage />} />
            <Route path="/sync" element={<SyncPage />} />
            <Route path="/upload" element={<UploadPage />} />
          </Routes>
        </main>
        <Toaster />
      </div>
    </Router>
  );
}
