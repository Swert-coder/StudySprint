import { useState } from 'react';
import { isoToday } from '../../lib/dates';
import { matchLocalCommand } from '../../lib/commandMatcher';
import { needsConfirmation } from '../../lib/actions';
import { callAssistant } from '../../lib/aiClient';
import AssistantMessage from './AssistantMessage';

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
    default: return 'Apply this change?';
  }
}

export default function AssistantPanel({ data, onApplyAction, onOpenPanic }) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(false);
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
      if (needsConfirmation(local.action)) { setPending([local.action]); onLogAssistant(describeAction(local.action)); return; }
      onLogAssistant(onApplyAction(local.action));
      return;
    }

    setLoading(true);
    try {
      const res = await callAssistant(trimmed, data, today);
      onLogAssistant(res.reply);
      const toConfirm = (res.actions || []).filter(needsConfirmation);
      const autoApply = (res.actions || []).filter((a) => !needsConfirmation(a));
      for (const a of autoApply) onLogAssistant(onApplyAction(a));
      if (toConfirm.length) setPending(toConfirm);
    } catch (err) {
      onLogAssistant(err.message || 'Something went wrong reaching the AI organizer.');
    } finally {
      setLoading(false);
    }
  };

  const confirmPending = () => {
    for (const a of pending) onLogAssistant(onApplyAction(a));
    setPending(null);
  };
  const cancelPending = () => { onLogAssistant('No changes made.'); setPending(null); };

  return (
    <div className="page assistant-page">
      <div className="page-heading"><div><h1>AI Organizer</h1><p>Tell it what's on your plate, or ask it to change your plan.</p></div></div>
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
    </div>
  );
}
