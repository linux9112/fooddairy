import React from 'react';

export default function Navbar({ activeTab, onSelectTab }) {
  return (
    <header className="header-wrapper">
      <h1 className="brand-title">Food Diary</h1>
      <nav className="nav-bar" aria-label="Main Navigation">
        <button
          type="button"
          className={`nav-btn ${activeTab === 'today' ? 'active' : ''}`}
          onClick={() => onSelectTab('today')}
        >
          Today
        </button>
        <button
          type="button"
          className={`nav-btn ${activeTab === 'diary' ? 'active' : ''}`}
          onClick={() => onSelectTab('diary')}
        >
          Diary
        </button>
        <button
          type="button"
          className={`nav-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => onSelectTab('reports')}
        >
          Reports
        </button>
      </nav>
    </header>
  );
}
