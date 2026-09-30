import React, { useState, useEffect, useCallback } from 'react';
import {
  getTodayString,
  formatDisplayDate,
  formatDayOfWeek,
  formatDisplayTime,
  getFoodRecord
} from '../services/api';

export default function Diary({ initialDate, onEditDay }) {
  const [currentDate, setCurrentDate] = useState(initialDate || getTodayString());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [record, setRecord] = useState(null);

  const loadDateRecord = useCallback(async (dateStr) => {
    try {
      setLoading(true);
      setError(null);
      const data = await getFoodRecord(dateStr);
      setRecord(data);
    } catch (err) {
      setError(err.message || "Couldn't load diary entry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDateRecord(currentDate);
  }, [currentDate, loadDateRecord]);

  // Navigate to previous calendar day
  const handlePrevDay = () => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const date = new Date(y, m - 1, d, 12, 0, 0);
    date.setDate(date.getDate() - 1);
    const yStr = date.getFullYear();
    const mStr = String(date.getMonth() + 1).padStart(2, '0');
    const dStr = String(date.getDate()).padStart(2, '0');
    setCurrentDate(`${yStr}-${mStr}-${dStr}`);
  };

  // Navigate to next calendar day
  const handleNextDay = () => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const date = new Date(y, m - 1, d, 12, 0, 0);
    date.setDate(date.getDate() + 1);
    const yStr = date.getFullYear();
    const mStr = String(date.getMonth() + 1).padStart(2, '0');
    const dStr = String(date.getDate()).padStart(2, '0');
    setCurrentDate(`${yStr}-${mStr}-${dStr}`);
  };

  const handleJumpToday = () => {
    setCurrentDate(getTodayString());
  };

  const meals = record?.meals || {
    breakfast: { status: null, time: null, details: null },
    lunch: { status: null, time: null, details: null },
    dinner: { status: null, time: null, details: null }
  };

  const hasAnyRecord = record && (
    meals.breakfast.status !== null ||
    meals.lunch.status !== null ||
    meals.dinner.status !== null
  );

  const isToday = currentDate === getTodayString();

  return (
    <div className="diary-page">
      {/* Date Navigation */}
      <div className="diary-date-nav">
        <button
          type="button"
          className="nav-arrow-btn"
          onClick={handlePrevDay}
          title="Previous Day"
          aria-label="Previous Day"
        >
          ‹
        </button>

        <div style={{ textAlign: 'center', minWidth: '220px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <h2 className="date-primary" style={{ fontSize: '1.5rem', marginBottom: '0.1rem' }}>
              {formatDisplayDate(currentDate)}
            </h2>
            {record?.isEdited && (
              <span className="badge-edited">Edited</span>
            )}
          </div>
          <div className="date-secondary">
            {formatDayOfWeek(currentDate)}
            {!isToday && (
              <button
                type="button"
                className="btn-secondary"
                style={{ marginLeft: '0.6rem', padding: '0.15rem 0.6rem', fontSize: '0.78rem' }}
                onClick={handleJumpToday}
              >
                Today
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          className="nav-arrow-btn"
          onClick={handleNextDay}
          title="Next Day"
          aria-label="Next Day"
        >
          ›
        </button>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
          Reading diary...
        </div>
      )}

      {/* Error Banner */}
      {error && !loading && (
        <div className="feedback-banner error" style={{ justifyContent: 'center' }}>
          <span>⚠️ {error}</span>
          <button
            type="button"
            className="btn-secondary"
            style={{ marginLeft: '1rem', padding: '0.2rem 0.6rem' }}
            onClick={() => loadDateRecord(currentDate)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Diary Content */}
      {!loading && !error && (
        <>
          {!hasAnyRecord ? (
            <div className="empty-box">
              <div className="empty-icon">📖</div>
              <h3 className="empty-title">No food record for this day.</h3>
              <p className="empty-desc">
                Nothing was logged for {formatDisplayDate(currentDate)}.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => onEditDay(currentDate)}
              >
                Record This Day
              </button>
            </div>
          ) : (
            <div className="diary-paper-card">
              {/* Breakfast Entry */}
              <div className="diary-entry-section">
                <div className="diary-entry-header">
                  <span className="meal-emoji">🌅</span>
                  <h3 className="diary-meal-name">Breakfast</h3>
                </div>
                <div className="diary-entry-body">
                  {meals.breakfast.status === 'yes' ? (
                    <>
                      <div className="diary-tag-ate">
                        <span>✓ Khae hai</span>
                        {(meals.breakfast.formattedTime || meals.breakfast.time) && (
                          <span style={{ fontWeight: 400, opacity: 0.9 }}>
                            ({meals.breakfast.formattedTime || formatDisplayTime(meals.breakfast.time)})
                          </span>
                        )}
                      </div>
                      <p className="diary-details-text">{meals.breakfast.details}</p>
                    </>
                  ) : meals.breakfast.status === 'no' ? (
                    <>
                      <div className="diary-tag-skipped">
                        <span>✕ Nahi khae</span>
                      </div>
                      <p className="diary-details-text">{meals.breakfast.details}</p>
                    </>
                  ) : (
                    <span className="diary-tag-unrecorded">— Not recorded —</span>
                  )}
                </div>
              </div>

              {/* Lunch Entry */}
              <div className="diary-entry-section">
                <div className="diary-entry-header">
                  <span className="meal-emoji">☀️</span>
                  <h3 className="diary-meal-name">Lunch</h3>
                </div>
                <div className="diary-entry-body">
                  {meals.lunch.status === 'yes' ? (
                    <>
                      <div className="diary-tag-ate">
                        <span>✓ Khae hai</span>
                        {(meals.lunch.formattedTime || meals.lunch.time) && (
                          <span style={{ fontWeight: 400, opacity: 0.9 }}>
                            ({meals.lunch.formattedTime || formatDisplayTime(meals.lunch.time)})
                          </span>
                        )}
                      </div>
                      <p className="diary-details-text">{meals.lunch.details}</p>
                    </>
                  ) : meals.lunch.status === 'no' ? (
                    <>
                      <div className="diary-tag-skipped">
                        <span>✕ Nahi khae</span>
                      </div>
                      <p className="diary-details-text">{meals.lunch.details}</p>
                    </>
                  ) : (
                    <span className="diary-tag-unrecorded">— Not recorded —</span>
                  )}
                </div>
              </div>

              {/* Dinner Entry */}
              <div className="diary-entry-section">
                <div className="diary-entry-header">
                  <span className="meal-emoji">🌙</span>
                  <h3 className="diary-meal-name">Dinner</h3>
                </div>
                <div className="diary-entry-body">
                  {meals.dinner.status === 'yes' ? (
                    <>
                      <div className="diary-tag-ate">
                        <span>✓ Khae hai</span>
                        {(meals.dinner.formattedTime || meals.dinner.time) && (
                          <span style={{ fontWeight: 400, opacity: 0.9 }}>
                            ({meals.dinner.formattedTime || formatDisplayTime(meals.dinner.time)})
                          </span>
                        )}
                      </div>
                      <p className="diary-details-text">{meals.dinner.details}</p>
                    </>
                  ) : meals.dinner.status === 'no' ? (
                    <>
                      <div className="diary-tag-skipped">
                        <span>✕ Nahi khae</span>
                      </div>
                      <p className="diary-details-text">{meals.dinner.details}</p>
                    </>
                  ) : (
                    <span className="diary-tag-unrecorded">— Not recorded —</span>
                  )}
                </div>
              </div>

              {/* Edit Day Action */}
              <div className="diary-footer-action">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => onEditDay(currentDate)}
                >
                  Edit Day
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
