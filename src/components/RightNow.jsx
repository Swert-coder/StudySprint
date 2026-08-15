import { useState } from 'react';
import { TIME_BUDGETS } from '../lib/constants';
import { whatShouldIDoNow } from '../lib/planner';
import { isoToday } from '../lib/dates';
import Empty from './Empty';

export default function RightNow({ data, onStartSprint, onOpenPanic }) {
  const [budget, setBudget] = useState(null);
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const today = isoToday();

  const choose = (minutes) => { setShowCustom(false); setBudget(minutes); };
  const chooseCustom = (e) => {
    e.preventDefault();
    const minutes = Math.max(5, parseInt(custom, 10) || 0);
    if (minutes) setBudget(minutes);
  };

  const result = budget ? whatShouldIDoNow(data, budget, today) : null;

  return (
    <section className="right-now">
      <div className="section-title">
        <div><h2>What should you do right now?</h2><p>Tell us how much time you have.</p></div>
      </div>
      <div className="time-pill-row">
        {TIME_BUDGETS.map((b) => (
          <button key={b.minutes} className={'time-pill' + (budget === b.minutes && !showCustom ? ' active' : '')} onClick={() => choose(b.minutes)}>{b.label}</button>
        ))}
        <button className={'time-pill' + (showCustom ? ' active' : '')} onClick={() => setShowCustom((v) => !v)}>Custom</button>
      </div>
      {showCustom && (
        <form className="custom-time-form" onSubmit={chooseCustom}>
          <input type="number" min="5" placeholder="Minutes" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <button type="submit" className="primary">Go</button>
        </form>
      )}
      {result && (
        result.picks.length ? (
          <div className="right-now-result">
            <span className="eyebrow">YOU HAVE {budget} MINUTES</span>
            <ol className="right-now-list">
              {result.picks.map((p, i) => (
                <li key={p.type + p.id}>
                  <span className="right-now-index">{i + 1}</span>
                  <div><b>{p.title}</b><small>{p.reason}</small></div>
                  <span className="right-now-minutes">{p.minutes} min</span>
                </li>
              ))}
            </ol>
            <button className="primary sprint-cta" onClick={() => onStartSprint(result.picks, budget)}>Start {budget}-minute sprint</button>
          </div>
        ) : (
          <Empty text="You're all caught up — nothing urgent fits right now." />
        )
      )}
      <button className="overwhelmed-link" onClick={onOpenPanic}>I'm overwhelmed →</button>
    </section>
  );
}
