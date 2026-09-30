import React, { useState, useEffect } from 'react';
import { formatDisplayTime } from '../services/api';

export default function MealCard({
  mealKey,
  mealLabel,
  emoji,
  record,
  onSave,
  onReset
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [status, setStatus] = useState(null); // 'yes' | 'no' | null
  const [time, setTime] = useState('');
  const [details, setDetails] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Default times for convenience when logging
  const defaultTimes = {
    breakfast: '08:30',
    lunch: '13:30',
    dinner: '20:30'
  };

  // Sync internal state when record prop updates
  useEffect(() => {
    if (record && record.status) {
      setStatus(record.status);
      setTime(record.time || record.rawTime?.slice(0, 5) || defaultTimes[mealKey] || '12:00');
      setDetails(record.details || '');
    } else {
      setStatus(null);
      setTime(defaultTimes[mealKey] || '12:00');
      setDetails('');
    }
    setErrorMsg('');
  }, [record, mealKey]);

  const handleOpenExpand = () => {
    if (record && record.status) {
      setStatus(record.status);
      setTime(record.time || record.rawTime?.slice(0, 5) || defaultTimes[mealKey] || '12:00');
      setDetails(record.details || '');
    } else {
      setStatus(null);
      setTime(defaultTimes[mealKey] || '12:00');
      setDetails('');
    }
    setErrorMsg('');
    setIsExpanded(true);
  };

  const handleCancel = () => {
    setIsExpanded(false);
    setErrorMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!status) {
      setErrorMsg('Please select whether you ate (Yes or No).');
      return;
    }

    if (status === 'yes') {
      if (!time) {
        setErrorMsg('Please specify what time you ate (Kitna baje?).');
        return;
      }
      if (!details.trim()) {
        setErrorMsg('Please specify what you ate (Kya khae?).');
        return;
      }
    } else {
      if (!details.trim()) {
        setErrorMsg("Please specify why you didn't eat (Kyu nahi khae?).");
        return;
      }
    }

    try {
      setIsSaving(true);
      await onSave(mealKey, {
        status,
        time: status === 'yes' ? time : null,
        details: details
      });
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setIsExpanded(false);
      }, 700);
    } catch (err) {
      setIsSaving(false);
      setErrorMsg(err.message || 'Couldn\'t save this meal. Please try again.');
    }
  };

  const handleResetMeal = async () => {
    if (!window.confirm(`Reset ${mealLabel} back to unrecorded?`)) return;
    try {
      setIsSaving(true);
      await onReset(mealKey);
      setIsSaving(false);
      setIsExpanded(false);
    } catch (err) {
      setIsSaving(false);
      setErrorMsg(err.message || 'Couldn\'t reset meal. Please try again.');
    }
  };

  const isRecorded = record && record.status !== null;
  const isAte = isRecorded && record.status === 'yes';
  const isSkipped = isRecorded && record.status === 'no';

  return (
    <div className={`meal-card ${isExpanded ? 'expanded' : ''}`}>
      {/* Card Header */}
      <div className="meal-card-header">
        <div className="meal-name-row">
          <span className="meal-emoji">{emoji}</span>
          <h2 className="meal-title">{mealLabel}</h2>
        </div>
        {!isExpanded && isRecorded && (
          <button
            type="button"
            className="btn-secondary"
            onClick={handleOpenExpand}
          >
            Edit
          </button>
        )}
      </div>

      {/* Collapsed State */}
      {!isExpanded && (
        <div>
          {!isRecorded ? (
            <div className="meal-collapsed-content">
              <span className="meal-status-unrecorded">Not recorded yet</span>
              <button
                type="button"
                className="btn-primary"
                onClick={handleOpenExpand}
              >
                Record {mealLabel}
              </button>
            </div>
          ) : (
            <div className={`meal-summary-box ${isAte ? 'ate' : 'skipped'}`}>
              {isAte ? (
                <>
                  <div className="summary-heading">
                    <span>✓</span>
                    <span>Ate at {record.formattedTime || formatDisplayTime(record.time)}</span>
                  </div>
                  <div className="summary-details">{record.details}</div>
                </>
              ) : (
                <>
                  <div className="summary-heading">
                    <span>✕</span>
                    <span>Didn't eat</span>
                  </div>
                  <div className="summary-details">{record.details}</div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Expanded Form State */}
      {isExpanded && (
        <form className="meal-form" onSubmit={handleSubmit}>
          {errorMsg && (
            <div className="feedback-banner error">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Question: Did you eat? */}
          <div className="question-block">
            <label className="question-label">Did you eat?</label>
            <div className="yes-no-group">
              <button
                type="button"
                className={`toggle-btn ${status === 'yes' ? 'selected-yes' : ''}`}
                onClick={() => setStatus('yes')}
              >
                <span>✓</span> Yes
              </button>
              <button
                type="button"
                className={`toggle-btn ${status === 'no' ? 'selected-no' : ''}`}
                onClick={() => setStatus('no')}
              >
                <span>✕</span> No
              </button>
            </div>
          </div>

          {/* If YES: Kitna baje? and Kya khae? */}
          {status === 'yes' && (
            <>
              <div className="question-block">
                <label className="question-label" htmlFor={`${mealKey}-time`}>
                  Kitna baje? <span className="question-sublabel">/ What time did you eat?</span>
                </label>
                <input
                  id={`${mealKey}-time`}
                  type="time"
                  className="input-field input-time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                />
              </div>

              <div className="question-block">
                <label className="question-label" htmlFor={`${mealKey}-food`}>
                  Kya khae? <span className="question-sublabel">/ What did you eat?</span>
                </label>
                <textarea
                  id={`${mealKey}-food`}
                  className="input-field"
                  placeholder="e.g. Poha, banana and milk"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          {/* If NO: Kyu nahi khae? */}
          {status === 'no' && (
            <div className="question-block">
              <label className="question-label" htmlFor={`${mealKey}-reason`}>
                Kyu nahi khae? <span className="question-sublabel">/ Why didn't you eat?</span>
              </label>
              <textarea
                id={`${mealKey}-reason`}
                className="input-field"
                placeholder="e.g. Wasn't hungry / fasting"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                required
              />
            </div>
          )}

          {/* Form Actions */}
          <div className="form-actions-row">
            <div className="form-left-actions">
              <button
                type="submit"
                className="btn-primary"
                disabled={isSaving || !status}
              >
                {isSaving
                  ? 'Saving...'
                  : saveSuccess
                  ? 'Saved ✓'
                  : `Save ${mealLabel}`}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </button>
            </div>

            {isRecorded && (
              <button
                type="button"
                className="btn-danger-subtle"
                onClick={handleResetMeal}
                disabled={isSaving}
              >
                Reset to unrecorded
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
