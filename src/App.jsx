import { useEffect, useRef, useState } from 'react';
import { hasSupabaseConfig, supabase } from './supabase';
import { isoToday, timeOfDay } from './lib/dates';
import { mergeData, loadLegacyLocal, cleanStart } from './lib/defaults';
import { makeSmartPlan, panicPlan } from './lib/planner';
import { recordActual, recordCompletionHour } from './lib/personalization';
import { applyAction, addTopicsToWork as libAddTopicsToWork, startSprintFromPicks } from './lib/actions';

import { AuthConfiguration, AuthLoading, AuthPage, ResetPassword } from './components/Auth/Auth';
import Icon from './components/Icon';
import Dashboard from './components/Dashboard';
import Work from './components/Work';
import Plan from './components/Plan';
import Progress from './components/Progress';
import Settings from './components/Settings';
import Analyzer from './components/Analyzer';
import Calendar from './components/Calendar/Calendar';
import Quiz from './components/Quiz/Quiz';
import AssistantPanel from './components/Assistant/AssistantPanel';
import { Modal, EditAssignmentModal } from './components/Modal';
import EmergencyModal from './components/EmergencyModal';
import SprintSession from './components/SprintSession';

const PRIMARY_NAV = [
  { key: 'Dashboard', icon: '⌂' },
  { key: 'Calendar', icon: '▦' },
  { key: 'Assignments', icon: '▣' },
  { key: 'Practice', icon: '✎' },
  { key: 'AI Organizer', icon: '✦' },
];
const SECONDARY_NAV = ['Study plan', 'Progress', 'Analyzer', 'Settings'];

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setAuthLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession); setPasswordRecovery(event === 'PASSWORD_RECOVERY'); setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!hasSupabaseConfig) return <AuthConfiguration />;
  if (authLoading) return <AuthLoading />;
  return passwordRecovery && session ? <ResetPassword onComplete={() => setPasswordRecovery(false)} /> : session ? <StudyApp session={session} /> : <AuthPage />;
}

function StudyApp({ session }) {
  const userId = session.user.id;
  const userName = session.user.user_metadata?.name;
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [today, setToday] = useState(isoToday);
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState('Dashboard');
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [sprintConfig, setSprintConfig] = useState(null); // { queue, mode: 'session'|'assignment'|'freeform' }

  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    let cancelled = false;
    setLoaded(false); setLoadError('');
    (async () => {
      const { data: row, error } = await supabase.from('app_data').select('data').eq('user_id', userId).maybeSingle();
      if (cancelled) return;
      if (error) { setLoadError('Could not load your saved data. Check your connection and try again.'); return; }
      if (row?.data) { setIsFirstLogin(false); setData(makeSmartPlan(mergeData(row.data, userName), isoToday())); setLoaded(true); return; }
      const legacy = loadLegacyLocal(userId, userName);
      const initial = legacy ? makeSmartPlan(legacy, isoToday()) : cleanStart(userName);
      setIsFirstLogin(!legacy); setData(initial); setLoaded(true);
      await supabase.from('app_data').upsert({ user_id: userId, data: initial, updated_at: new Date().toISOString() });
    })();
    return () => { cancelled = true; };
  }, [userId, userName, retry]);

  const writeTimer = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      supabase.from('app_data').upsert({ user_id: userId, data, updated_at: new Date().toISOString() }).then(({ error }) => {
        if (error) notify('Could not save changes — check your connection');
      });
    }, 500);
    return () => clearTimeout(writeTimer.current);
  }, [data, userId, loaded]);

  useEffect(() => {
    const tick = () => { const next = isoToday(); if (next !== today) { setToday(next); setData((d) => (d ? makeSmartPlan(d, next) : d)); } };
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [today]);

  if (loadError) {
    return (
      <div className="auth-shell"><div className="auth-card loading-card">
        <div className="brandmark">⚡</div><p>{loadError}</p>
        <button className="primary" style={{ marginTop: 18 }} onClick={() => setRetry((r) => r + 1)}>Try again</button>
      </div></div>
    );
  }
  if (!loaded) return <AuthLoading />;

  const completed = data.sessions.filter((s) => s.complete).reduce((a, s) => a + s.minutes, 0);
  const totalToday = data.sessions.filter((s) => s.date === today).reduce((a, s) => a + s.minutes, 0);
  const pending = data.assignments.filter((a) => !a.done);
  const replan = (next) => makeSmartPlan(next, today);
  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2600); };

  // The single place a structured action (AI organizer, local command matcher, or a manual form)
  // turns into a data mutation, so every entry point behaves identically. Uses a ref-mirror of the
  // latest data so several actions applied back-to-back in one tick (e.g. the AI returning multiple
  // auto-apply actions) each build on the previous one instead of racing against stale state.
  const runAction = (action) => {
    if (action.__logOnly) {
      const next = { ...dataRef.current, assistant: { history: [...dataRef.current.assistant.history, { role: action.role, text: action.text, createdAt: new Date().toISOString() }].slice(-40) } };
      dataRef.current = next; setData(next); return null;
    }
    const { data: mutated, message } = applyAction(action, dataRef.current, today);
    const next = replan(mutated);
    dataRef.current = next; setData(next);
    return message;
  };

  const update = (key) => (value) => setData((d) => replan({ ...d, [key]: value }));
  const addItem = (type, form) => {
    const action = type === 'assignments' ? { type: 'create_assignment', payload: form } : { type: 'create_test', payload: { ...form, material: form.material || form.topics } };
    const message = runAction(action);
    setModal(null);
    notify(message || `${type === 'assignments' ? 'Assignment' : 'Test'} added — your sprint updated`);
  };
  const toggleAssignment = (id) => setData((d) => replan({ ...d, assignments: d.assignments.map((a) => (a.id === id ? { ...a, done: !a.done } : a)) }));
  const saveAssignment = (assignment) => { setData((d) => replan({ ...d, assignments: d.assignments.map((a) => (a.id === assignment.id ? assignment : a)) })); setEditing(null); notify('Assignment updated — plan refreshed'); };
  const removeAssignment = (id) => {
    if (!window.confirm('Remove this assignment?')) return;
    setData((d) => replan({ ...d, assignments: d.assignments.filter((a) => a.id !== id), sessions: d.sessions.filter((s) => s.sourceId !== id) }));
    notify('Assignment removed — plan refreshed');
  };
  const toggleSession = (id) => {
    const found = data.sessions.find((s) => s.id === id);
    setData((d) => {
      let next = replan({ ...d, sessions: d.sessions.map((s) => (s.id === id ? { ...s, complete: !s.complete, completedAt: !s.complete ? new Date().toISOString() : null } : s)) });
      if (found && !found.complete) next = recordCompletionHour(next);
      return next;
    });
    if (found && !found.complete) notify('Sprint block complete — we adjusted what’s next');
  };
  const createPlan = () => { setData((d) => replan(d)); notify('Today’s Sprint is ready'); };
  const emergencyPlan = (minutes) => {
    setData((d) => panicPlan(d, minutes, today));
    setModal(null);
    notify('A simplified plan is ready — lower-priority work was pushed back');
  };
  const addTopicsToWork = (topics) => { setData((d) => replan(libAddTopicsToWork(d, topics, today))); notify('Added to your study plan'); };
  const removeAnalysis = (id) => setData((d) => ({ ...d, analyses: d.analyses.filter((a) => a.id !== id) }));
  const addAnalysis = (entry) => setData((d) => ({ ...d, analyses: [entry, ...d.analyses].slice(0, 20) }));
  const saveQuizAttempt = (attempt) => setData((d) => ({ ...d, quizHistory: [attempt, ...d.quizHistory].slice(0, 20) }));

  // Sprint session launchers — all end up opening SprintSession on a queue of task-shaped items.
  const startTodaySprint = () => {
    const queue = data.sessions.filter((s) => s.date === today && !s.complete);
    if (queue.length) setSprintConfig({ queue, mode: 'session' });
  };
  const startSprintFromRightNow = (picks, budget) => {
    const { data: next, queue } = startSprintFromPicks(data, picks, today);
    setData(next);
    setSprintConfig({ queue, mode: 'session' });
    notify(`${budget}-minute sprint started`);
  };
  const startAssignmentSprint = (assignment) => {
    setSprintConfig({ queue: [{ id: `adhoc-${assignment.id}`, title: assignment.title, subject: assignment.course, minutes: +assignment.minutes || 45, sourceType: 'assignment', sourceId: assignment.id }], mode: 'assignment' });
  };
  const startSessionSprint = (session) => setSprintConfig({ queue: [session], mode: 'session' });
  const startFreeformSprint = () => setSprintConfig({ queue: [{ id: `freeform-${Date.now()}`, title: 'Open focus session', subject: '', minutes: 25 }], mode: 'freeform' });

  const handleSprintFinish = (item, actualMinutes) => {
    if (sprintConfig.mode === 'assignment') {
      setData((d) => {
        const withActual = recordActual(d, 'assignment', item.sourceId, item.minutes, actualMinutes);
        return replan({ ...withActual, assignments: withActual.assignments.map((a) => (a.id === item.sourceId ? { ...a, done: true } : a)) });
      });
      notify('Assignment complete — sprint won!');
      return;
    }
    if (sprintConfig.mode === 'freeform') { notify('Focus session complete.'); return; }
    setData((d) => {
      let next = { ...d, sessions: d.sessions.map((s) => (s.id === item.id ? { ...s, complete: true, completedAt: new Date().toISOString() } : s)) };
      next = recordCompletionHour(next);
      if (item.sourceType && item.sourceId) next = recordActual(next, item.sourceType, item.sourceId, item.minutes, actualMinutes);
      return replan(next);
    });
    notify('Nice work — sprint block complete.');
  };

  const goTab = (n) => { setTab(n); setNavOpen(false); };

  return (
    <div className="app">
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      <aside className={navOpen ? 'open' : ''}>
        <div className="brand"><div className="brandmark">⚡</div><span>study<span>sprint</span></span></div>
        <nav>{PRIMARY_NAV.map((n) => (
          <button className={tab === n.key ? 'active' : ''} onClick={() => goTab(n.key)} key={n.key}><Icon>{n.icon}</Icon>{n.key}</button>
        ))}</nav>
        <div className="side-secondary-nav">{SECONDARY_NAV.map((n) => (
          <button className={tab === n ? 'active' : ''} onClick={() => goTab(n)} key={n}>{n}</button>
        ))}</div>
        <div className="side-bottom">
          <div className="streak"><span>🔥</span><div><b>{data.streak} day streak</b><small>Keep it going!</small></div></div>
        </div>
      </aside>
      <main>
        <header>
          <button className="nav-toggle" aria-label="Open menu" aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}>☰</button>
          <div className="mobile-brand">⚡ study<span>sprint</span></div>
          <div className="greeting">
            <p>{tab === 'Dashboard' ? `Good ${timeOfDay()}, ${data.profile.name}!` : tab}</p>
            <span>{tab === 'Dashboard' ? 'Let’s make today count.' : 'Your learning space, all in one place.'}</span>
          </div>
          <div className="header-right"><div className="avatar">{data.profile.name[0]}</div></div>
        </header>

        {tab === 'Dashboard' && (
          <Dashboard
            data={data} completed={completed} totalToday={totalToday} pending={pending}
            setModal={setModal} toggleSession={toggleSession} toggleAssignment={toggleAssignment} removeAssignment={removeAssignment}
            isFirstLogin={isFirstLogin}
            onStartSprintPicks={startSprintFromRightNow}
            onOpenPanic={() => setModal('emergency')}
            onStartTodaySprint={startTodaySprint}
          />
        )}
        {tab === 'Calendar' && <Calendar data={data} onEditAssignment={setEditing} onToggleSession={toggleSession} onStartSessionSprint={startSessionSprint} />}
        {tab === 'Assignments' && <Work data={data} setModal={setModal} toggleAssignment={toggleAssignment} removeAssignment={removeAssignment} startAssignmentSprint={startAssignmentSprint} editAssignment={setEditing} />}
        {tab === 'Practice' && <Quiz profile={data.profile} setTab={setTab} notify={notify} saveAttempt={saveQuizAttempt} addTopicsToWork={addTopicsToWork} />}
        {tab === 'AI Organizer' && <AssistantPanel data={data} onApplyAction={runAction} onOpenPanic={() => setModal('emergency')} />}
        {tab === 'Study plan' && <Plan data={data} createPlan={createPlan} toggleSession={toggleSession} />}
        {tab === 'Progress' && <Progress data={data} completed={completed} />}
        {tab === 'Analyzer' && <Analyzer data={data} profile={data.profile} setTab={setTab} notify={notify} addAnalysis={addAnalysis} removeAnalysis={removeAnalysis} addTopicsToWork={addTopicsToWork} />}
        {tab === 'Settings' && <Settings data={data} update={update} notify={notify} />}
      </main>

      {modal && (modal === 'emergency' ? <EmergencyModal onClose={() => setModal(null)} onChoose={emergencyPlan} /> : <Modal type={modal} onClose={() => setModal(null)} onSave={addItem} />)}
      {editing && <EditAssignmentModal assignment={editing} onClose={() => setEditing(null)} onSave={saveAssignment} />}
      {sprintConfig && <SprintSession queue={sprintConfig.queue} onClose={() => setSprintConfig(null)} onFinishSession={handleSprintFinish} />}
      {toast && <div className="toast">✓ {toast}</div>}
      <button className="focus-fab" onClick={startFreeformSprint}>◉ Focus</button>
    </div>
  );
}
