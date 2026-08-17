import { useEffect, useState } from 'react';
import { isoToday, daysUntil } from '../lib/dates';
import { plannedMinutes } from '../lib/planner';
import { fetchSubscription } from '../lib/subscription';
import { Stat, Assignment } from './shared';
import Empty from './Empty';
import RightNow from './RightNow';
import { ProUpgradeCard } from './Paywall';

export default function Dashboard({ data, completed, totalToday, pending, setModal, toggleSession, toggleAssignment, removeAssignment, isFirstLogin, onStartSprintPicks, onOpenPanic, onStartTodaySprint, userId }) {
  const [why, setWhy] = useState(null);
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchSubscription(userId).then((s) => { if (!cancelled) setSubscription(s); }).catch(() => {}); // upsell is display-only — skip it silently if this fails
    return () => { cancelled = true; };
  }, [userId]);
  const today = isoToday();
  const blocks = data.sessions.filter((s) => s.date === today);
  const remaining = blocks.filter((s) => !s.complete).reduce((n, s) => n + s.minutes, 0);
  const completedToday = blocks.filter((s) => s.complete).reduce((n, s) => n + s.minutes, 0);
  const upcoming = [...pending].sort((a, b) => daysUntil(a.due) - daysUntil(b.due)).slice(0, 4);
  const tests = data.tests.filter((t) => daysUntil(t.date) >= 0).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2);
  const tasksCompleted = data.assignments.filter((a) => a.done).length;

  return (
    <div className="page dashboard">
      {isFirstLogin && !data.assignments.length && !data.tests.length && (
        <section className="first-login">
          <div><span className="eyebrow">LET'S GET STARTED</span><h2>Add your first assignment</h2><p>Tell us what is on your plate. StudySprint will decide how to break it down.</p></div>
          <button className="primary" onClick={() => setModal('assignments')}>＋ Add assignment</button>
        </section>
      )}

      <RightNow data={data} onStartSprint={onStartSprintPicks} onOpenPanic={onOpenPanic} />

      <section className="sprint-hero">
        <div className="sprint-heading">
          <span className="eyebrow">TODAY'S SPRINT</span>
          <h1>Today's Sprint</h1>
          <p>{blocks.length ? `${remaining} min remaining · ${totalToday} min planned` : 'Add your work and we’ll build today for you.'}</p>
        </div>
        {!blocks.length ? (
          <div className="sprint-empty">
            <strong>{data.assignments.length || data.tests.length ? 'You’re caught up. Enjoy your free time.' : 'Your study assistant is ready.'}</strong>
            <span>{data.assignments.length || data.tests.length ? 'There’s no focused work left for today.' : 'Add an assignment or test and we’ll make the decisions for you.'}</span>
            <button onClick={() => setModal('assignments')}>＋ Add schoolwork</button>
          </div>
        ) : (
          <>
            <div className="sprint-blocks">
              {blocks.map((s, i) => (
                <div className={'sprint-block ' + (s.complete ? 'finished' : '')} key={s.id}>
                  <button className="check" onClick={() => toggleSession(s.id)} aria-label={`Complete ${s.title}`}>{s.complete ? '✓' : ''}</button>
                  <div className="block-order">{i + 1}</div>
                  <div className="block-main"><b>{s.title}</b><small>{s.subject || 'Study block'} · {s.minutes} min</small></div>
                  <label className={(s.priority || 'Medium').toLowerCase()}>{s.priority || 'Medium'}</label>
                  <button className="why-button" onClick={() => setWhy(why === s.id ? null : s.id)}>Why this?</button>
                  {why === s.id && <p className="why-copy">{s.reason || 'This is the best use of your study time right now.'}</p>}
                </div>
              ))}
            </div>
            {remaining > 0 && <button className="primary sprint-cta" onClick={onStartTodaySprint}>Start sprint</button>}
          </>
        )}
      </section>

      {subscription && !subscription.isPro && <ProUpgradeCard />}

      <section className="dashboard-lower">
        <div className="panel">
          <div className="section-title"><div><h2>Upcoming</h2><p>What matters most, not just what's due soonest</p></div><button onClick={() => setModal('tests')}>＋ Add test</button></div>
          {upcoming.length || tests.length ? (
            <>
              {tests.map((t) => {
                const goal = +t.studyMinutes || 120;
                const done = plannedMinutes(data.sessions, 'test', t.id);
                return (
                  <div className="exam-card" key={`t${t.id}`}>
                    <div>
                      <b>{t.course || t.title}</b>
                      <strong>{daysUntil(t.date)} days until test</strong>
                      <small>Preparation: {Math.min(100, Math.round((done / goal) * 100))}% complete</small>
                      <div className="bar"><i style={{ width: `${Math.min(100, (done / goal) * 100)}%` }} /></div>
                    </div>
                  </div>
                );
              })}
              {upcoming.map((a) => <Assignment a={a} key={a.id} toggle={toggleAssignment} remove={removeAssignment} />)}
            </>
          ) : <Empty text="Nothing upcoming — enjoy the breathing room." />}
        </div>
        <div className="panel">
          <div className="section-title"><div><h2>Progress</h2><p>How things are going</p></div></div>
          <div className="stats stats-compact">
            <Stat icon="✓" label="Completed" value={tasksCompleted} note="tasks finished" />
            <Stat icon="◷" label="Study time" value={`${completed} min`} note="total focused minutes" />
            <Stat icon="🔥" label="Streak" value={data.streak} note="days" />
            <Stat icon="▣" label="Today" value={`${totalToday ? Math.round((completedToday / totalToday) * 100) : 0}%`} note="planned vs. completed" />
          </div>
        </div>
      </section>
    </div>
  );
}
