import { useRef, useState } from 'react';
import { isoToday } from '../../lib/dates';
import { matchLocalCommand } from '../../lib/commandMatcher';
import { needsConfirmation } from '../../lib/actions';
import { callAssistant } from '../../lib/aiClient';
import AssistantMessage from './AssistantMessage';
import Paywall from '../Paywall';
import UsageBadge from '../UsageBadge';

const SUGGESTIONS = [
  'I have a biology test next Thursday on chapters 4 through 6',
  'I have a 3-page English essay due Monday, probably 2 hours',
  "I can't study Saturday",
  "What's the most important thing I need to do?",
];

function describeAction(action) {
  const p = action.payload || {};
  switch (action.type) {
    case 'create_assignment': return `Add "${p.title}"${p.course ? ` (${p.course})` : ''}${p.due ? ` due ${p.due}` : ''}?`;
    case 'create_test': return `Add "${p.title}" test${p.date ? ` on ${p.date}` : ''}${p.material ? ` covering ${p.material}` : ''}?`;
    case 'move_sessions': return `Move ${p.scope === 'today' ? "today's remaining sessions" : 'this session'} to ${p.toDate}?`;
    case 'set_weekday_schedule': return 'Update your weekly available-time schedule?';
    case 'delete_test': return `Remove "${p.titleMatch}" and its study sessions?`;
    default: return 'Apply this change?';
  }
}

// Guards against the same create_assignment/create_test showing up twice in one AI response
// (occasional LLM redundancy) — same type + title + date collapses to a single action.
function dedupeActions(actions) {
  const seen = new Set();
  return actions.filter((a) => {
    if (a.type !== 'create_assignment' && a.type !== 'create_test') return true;
    const key = `${a.type}:${(a.payload?.title || '').trim().toLowerCase()}:${a.payload?.due || a.payload?.date || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function AssistantPanel({ data, onApplyAction, onOpenPanic, userId }) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState('');
  const confirmedRef = useRef(false);
  const today = isoToday();
  const history = data.assistant?.history || [];

  const onLogUser = (text) => onApplyAction({ __logOnly: true, role: 'user', text });
  const onLogAssistant = (text) => text && onApplyAction({ __logOnly: true, role: 'assistant', text });

  const send = async (raw) => {
    const trimmed = raw.trim();
    if (!trimmed || loading) return;
    setDraft('');
    onLogUser(trimmed);

    const local = matchLocalCommand(trimmed, data, today);
    if (local?.kind === 'panic') { onLogAssistant("Let's figure out how much time you have."); onOpenPanic(); return; }
    if (local?.kind === 'reply') { onLogAssistant(local.reply); return; }
    if (local?.kind === 'action') {
      if (needsConfirmation(local.action)) { confirmedRef.current = false; setPending([local.action]); onLogAssistant(describeAction(local.action)); return; }
      onLogAssistant(onApplyAction(local.action));
      return;
    }

    setLoading(true);
    try {
      const res = await callAssistant(trimmed, data, today);
      onLogAssistant(res.reply);
      const actions = dedupeActions(res.actions || []);
      const toConfirm = actions.filter(needsConfirmation);
      const autoApply = actions.filter((a) => !needsConfirmation(a));
      for (const a of autoApply) onLogAssistant(onApplyAction(a));
      if (toConfirm.length) { confirmedRef.current = false; setPending(toConfirm); }
    } catch (err) {
      if (err.code === 'limit_reached') { setPaywall(err.message); return; }
      onLogAssistant(err.message || 'Something went wrong reaching the AI organizer.');
    } finally {
      setLoading(false);
    }
  };

  // confirmedRef blocks a second Confirm click (or a double-fired click event) from re-applying
  // the same pending actions before React has re-rendered to remove the confirmation card.
  const confirmPending = () => {
    if (!pending || confirmedRef.current) return;
    confirmedRef.current = true;
    const actions = pending;
    setPending(null);
    for (const a of actions) onLogAssistant(onApplyAction(a));
  };
  const cancelPending = () => {
    if (!pending || confirmedRef.current) return;
    confirmedRef.current = true;
    setPending(null);
    onLogAssistant('No changes made.');
  };

  return (
    <div className="page assistant-page">
      <div className="page-heading"><div><h1>AI Organizer</h1><p>Tell it what's on your plate, or ask it to change your plan.</p></div></div>
      <UsageBadge userId={userId} feature="organizer" />
      <div className="panel assistant-panel">
        <div className="assistant-transcript">
          {!history.length && (
            <div className="assistant-empty">
              <p>Try something like:</p>
              <div className="assistant-suggestions">{SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => send(s)}>{s}</button>)}</div>
            </div>
          )}
          {history.map((m, i) => <AssistantMessage key={i} role={m.role} text={m.text} />)}
          {loading && <AssistantMessage role="assistant" text="Thinking…" />}
          {pending && (
            <div className="assistant-confirm">
              {pending.map((a, i) => <p key={i}>{describeAction(a)}</p>)}
              <div className="assistant-confirm-actions">
                <button className="primary" onClick={confirmPending}>Confirm</button>
                <button className="reset" onClick={cancelPending}>Cancel</button>
              </div>
            </div>
          )}
        </div>
        <form className="assistant-input-row" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Tell StudySprint what's going on…" disabled={loading} />
          <button type="submit" className="primary" disabled={loading || !draft.trim()}>Send</button>
        </form>
      </div>
      {paywall && <Paywall reason={paywall} onClose={() => setPaywall('')} />}
    </div>
  );
}
