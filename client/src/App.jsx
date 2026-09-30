import React, { useState } from 'react';
import Navbar from './components/Navbar';
import Today from './pages/Today';
import Diary from './pages/Diary';
import Reports from './pages/Reports';

export default function App() {
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'diary' | 'reports'
  const [editingDate, setEditingDate] = useState(null); // when editing a historical date from Diary

  const handleSelectTab = (tab) => {
    if (tab === 'today') {
      setEditingDate(null); // Reset to actual today
    }
    setActiveTab(tab);
  };

  const handleEditDayFromDiary = (dateStr) => {
    setEditingDate(dateStr);
    setActiveTab('today');
  };

  const handleBackToDiary = () => {
    setActiveTab('diary');
  };

  return (
    <div className="app-container">
      <Navbar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
      />

      <main className="main-content">
        {activeTab === 'today' && (
          <Today
            customDate={editingDate}
            onBackToDiary={handleBackToDiary}
          />
        )}

        {activeTab === 'diary' && (
          <Diary
            initialDate={editingDate || undefined}
            onEditDay={handleEditDayFromDiary}
          />
        )}

        {activeTab === 'reports' && (
          <Reports />
        )}
      </main>
    </div>
  );
}
