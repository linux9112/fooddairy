import React, { useState, useEffect } from 'react';

export default function Navbar({ activeTab, onSelectTab }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  return (
    <header className="header-wrapper">
      <div className="brand-header">
        <img
          src="/icons/logo.png"
          alt="Food Diary Logo"
          className="brand-logo"
        />
        <h1 className="brand-title">Food Diary</h1>
      </div>

      <div className="nav-row-wrapper">
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

        {isInstallable && (
          <div className="install-banner-row">
            <button
              type="button"
              className="btn-install-app"
              onClick={handleInstallClick}
              title="Install Food Diary on your home screen"
            >
              <span>⬇</span>
              <span>Install App</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
