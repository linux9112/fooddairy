import React, { useState, useEffect, useCallback } from 'react';
import MealCard from '../components/MealCard';
import {
  getTodayString,
  formatDisplayDate,
  formatDayOfWeek,
  getFoodRecord,
  saveMealRecord,
  resetMealRecord
} from '../services/api';

export default function Today({ customDate, onBackToDiary }) {
  const targetDate = customDate || getTodayString();
  const isEditingOtherDay = !!customDate && customDate !== getTodayString();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dayRecord, setDayRecord] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getFoodRecord(targetDate);
      setDayRecord(data);
    } catch (err) {
      setError(err.message || "Couldn't load food diary. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [targetDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveMeal = async (mealKey, payload) => {
    await saveMealRecord(targetDate, mealKey, payload);
    await loadData();
  };

  const handleResetMeal = async (mealKey) => {
    await resetMealRecord(targetDate, mealKey);
    await loadData();
  };

  const recordedCount = dayRecord?.recordedCount || 0;
  const meals = dayRecord?.meals || {
    breakfast: { status: null, time: null, details: null },
    lunch: { status: null, time: null, details: null },
    dinner: { status: null, time: null, details: null }
  };

  return (
    <div className="today-page">
      {/* Date Header */}
      <div className="date-section">
        {isEditingOtherDay && (
          <div style={{ marginBottom: '0.75rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onBackToDiary}
            >
              ← Return to Diary
            </button>
          </div>
        )}
        <h2 className="date-primary">{formatDisplayDate(targetDate)}</h2>
        <div className="date-secondary">{formatDayOfWeek(targetDate)}</div>
      </div>

      {/* Progress Indicator */}
      <div className="progress-box">
        <div className={`progress-pill ${recordedCount === 3 ? 'complete' : ''}`}>
          <span>Today's meals</span>
          <span>•</span>
          <span>{recordedCount} / 3 recorded</span>
          {recordedCount === 3 && <span>✓</span>}
        </div>
      </div>

      {/* Global Error Banner if initial fetch fails */}
      {error && (
        <div className="feedback-banner error" style={{ justifyContent: 'center' }}>
          <span>⚠️ {error}</span>
          <button
            type="button"
            className="btn-secondary"
            style={{ marginLeft: '1rem', padding: '0.2rem 0.6rem' }}
            onClick={loadData}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !dayRecord && (
        <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
          Loading diary entries...
        </div>
      )}

      {/* Meal Cards */}
      <div className="meal-list">
        <MealCard
          mealKey="breakfast"
          mealLabel="Breakfast"
          emoji="🌅"
          record={meals.breakfast}
          onSave={handleSaveMeal}
          onReset={handleResetMeal}
        />

        <MealCard
          mealKey="lunch"
          mealLabel="Lunch"
          emoji="☀️"
          record={meals.lunch}
          onSave={handleSaveMeal}
          onReset={handleResetMeal}
        />

        <MealCard
          mealKey="dinner"
          mealLabel="Dinner"
          emoji="🌙"
          record={meals.dinner}
          onSave={handleSaveMeal}
          onReset={handleResetMeal}
        />
      </div>
    </div>
  );
}
