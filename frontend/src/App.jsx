import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import Leaderboard from './components/Leaderboard';
import AgentConfig from './components/AgentConfig';
import './App.css';

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <h1>PIC KPI Dashboard</h1>
        </div>
        <nav className="header-nav">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/leaderboard">Leaderboard</NavLink>
          <NavLink to="/config">Agent Config</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/config" element={<AgentConfig />} />
        </Routes>
      </main>
    </div>
  );
}
