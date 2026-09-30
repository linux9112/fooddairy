import React, { useState, useEffect, useCallback } from 'react';
import {
  getTodayString,
  formatDisplayDate,
  getReportSummary
} from '../services/api';

export default function Reports() {
  const [reportType, setReportType] = useState('weekly'); // 'weekly' | 'monthly'
  const [referenceDate, setReferenceDate] = useState(getTodayString());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState(null);

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getReportSummary(reportType, referenceDate);
      setReportData(data);
    } catch (err) {
      setError(err.message || "Couldn't load report summary.");
    } finally {
      setLoading(false);
    }
  }, [reportType, referenceDate]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handlePrev = () => {
    if (reportData?.prevDate) {
      setReferenceDate(reportData.prevDate);
    }
  };

  const handleNext = () => {
    if (reportData?.nextDate) {
      setReferenceDate(reportData.nextDate);
    }
  };

  const handleCurrent = () => {
    setReferenceDate(getTodayString());
  };

  const summary = reportData?.summary || { ate: 0, skipped: 0, unrecorded: 0 };
  const meals = reportData?.meals || {
    breakfast: { ate: 0, skipped: 0, unrecorded: 0 },
    lunch: { ate: 0, skipped: 0, unrecorded: 0 },
    dinner: { ate: 0, skipped: 0, unrecorded: 0 }
  };
  const totalDays = reportData?.totalDays || (reportType === 'weekly' ? 7 : 30);
  const totalOpportunities = reportData?.totalOpportunities || totalDays * 3;

  // Format header title based on report type and range
  const formatRangeLabel = () => {
    if (!reportData) return '';
    if (reportType === 'weekly') {
      return `${formatDisplayDate(reportData.startDate)} – ${formatDisplayDate(reportData.endDate)}`;
    }
    // Monthly format: "September 2026"
    const [y, m] = reportData.startDate.split('-').map(Number);
    const date = new Date(y, m - 1, 1, 12, 0, 0);
    return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  };

  const renderProgressBar = (mealStat, denom) => {
    const atePct = denom > 0 ? (mealStat.ate / denom) * 100 : 0;
    const skippedPct = denom > 0 ? (mealStat.skipped / denom) * 100 : 0;
    const unrecordedPct = denom > 0 ? (mealStat.unrecorded / denom) * 100 : 0;

    return (
      <div className="progress-bar-track">
        <div
          className="progress-bar-ate"
          style={{ width: `${atePct}%` }}
          title={`Ate: ${mealStat.ate}`}
        />
        <div
          className="progress-bar-skipped"
          style={{ width: `${skippedPct}%` }}
          title={`Skipped: ${mealStat.skipped}`}
        />
        <div
          className="progress-bar-unrecorded"
          style={{ width: `${unrecordedPct}%` }}
          title={`Not recorded: ${mealStat.unrecorded}`}
        />
      </div>
    );
  };

  return (
    <div className="reports-page">
      {/* Type Toggle */}
      <div className="reports-toggle-container">
        <div className="reports-toggle">
          <button
            type="button"
            className={`report-tab-btn ${reportType === 'weekly' ? 'active' : ''}`}
            onClick={() => setReportType('weekly')}
          >
            Weekly Report
          </button>
          <button
            type="button"
            className={`report-tab-btn ${reportType === 'monthly' ? 'active' : ''}`}
            onClick={() => setReportType('monthly')}
          >
            Monthly Report
          </button>
        </div>
      </div>

      {/* Date Range Navigation */}
      <div className="diary-date-nav" style={{ marginBottom: '1.25rem' }}>
        <button
          type="button"
          className="nav-arrow-btn"
          onClick={handlePrev}
          title={reportType === 'weekly' ? 'Previous Week' : 'Previous Month'}
          aria-label="Previous Period"
        >
          ‹
        </button>

        <div style={{ textAlign: 'center', minWidth: '220px' }}>
          <h2 className="date-primary" style={{ fontSize: '1.4rem', marginBottom: '0.1rem' }}>
            {formatRangeLabel()}
          </h2>
          <div className="date-secondary">
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '0.15rem 0.6rem', fontSize: '0.78rem' }}
              onClick={handleCurrent}
            >
              {reportType === 'weekly' ? 'Current Week' : 'Current Month'}
            </button>
          </div>
        </div>

        <button
          type="button"
          className="nav-arrow-btn"
          onClick={handleNext}
          title={reportType === 'weekly' ? 'Next Week' : 'Next Month'}
          aria-label="Next Period"
        >
          ›
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
          Computing meal summary...
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="feedback-banner error" style={{ justifyContent: 'center' }}>
          <span>⚠️ {error}</span>
          <button
            type="button"
            className="btn-secondary"
            style={{ marginLeft: '1rem', padding: '0.2rem 0.6rem' }}
            onClick={loadReport}
          >
            Retry
          </button>
        </div>
      )}

      {/* Report Data Card */}
      {!loading && !error && (
        <>
          <div className="report-card">
            <h3 className="report-section-title">Meals Breakdown</h3>

            {/* Breakfast */}
            <div className="meal-stat-row">
              <div className="stat-header">
                <span className="stat-meal-label">🌅 Breakfast</span>
                <div className="stat-badges-row">
                  <span className="stat-badge-ate">✓ Ate: {meals.breakfast.ate}</span>
                  <span className="stat-badge-skipped">✕ Skipped: {meals.breakfast.skipped}</span>
                  <span className="stat-badge-unrecorded">— Not recorded: {meals.breakfast.unrecorded}</span>
                </div>
              </div>
              {renderProgressBar(meals.breakfast, totalDays)}
            </div>

            {/* Lunch */}
            <div className="meal-stat-row">
              <div className="stat-header">
                <span className="stat-meal-label">☀️ Lunch</span>
                <div className="stat-badges-row">
                  <span className="stat-badge-ate">✓ Ate: {meals.lunch.ate}</span>
                  <span className="stat-badge-skipped">✕ Skipped: {meals.lunch.skipped}</span>
                  <span className="stat-badge-unrecorded">— Not recorded: {meals.lunch.unrecorded}</span>
                </div>
              </div>
              {renderProgressBar(meals.lunch, totalDays)}
            </div>

            {/* Dinner */}
            <div className="meal-stat-row">
              <div className="stat-header">
                <span className="stat-meal-label">🌙 Dinner</span>
                <div className="stat-badges-row">
                  <span className="stat-badge-ate">✓ Ate: {meals.dinner.ate}</span>
                  <span className="stat-badge-skipped">✕ Skipped: {meals.dinner.skipped}</span>
                  <span className="stat-badge-unrecorded">— Not recorded: {meals.dinner.unrecorded}</span>
                </div>
              </div>
              {renderProgressBar(meals.dinner, totalDays)}
            </div>
          </div>

          {/* Overall Opportunities Summary Card */}
          <div className="report-card">
            <h3 className="report-section-title">Period Overview</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Note: Unrecorded meals and skipped meals are tracked separately and not conflated.
            </p>

            <div className="opportunities-grid">
              <div className="opp-stat-card">
                <div className="opp-num">{totalOpportunities}</div>
                <div className="opp-label">Opportunities</div>
              </div>

              <div className="opp-stat-card">
                <div className="opp-num" style={{ color: 'var(--ate-green)' }}>{summary.ate}</div>
                <div className="opp-label">Ate</div>
              </div>

              <div className="opp-stat-card">
                <div className="opp-num" style={{ color: 'var(--skipped-rose)' }}>{summary.skipped}</div>
                <div className="opp-label">Skipped</div>
              </div>

              <div className="opp-stat-card">
                <div className="opp-num" style={{ color: 'var(--text-muted)' }}>{summary.unrecorded}</div>
                <div className="opp-label">Not Recorded</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
