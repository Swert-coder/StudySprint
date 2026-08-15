import { useEffect, useRef, useState } from 'react';

const fmtClock = (totalSeconds) => {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${m}:${s}`;
};
const fmtETA = (secondsFromNow) => new Date(Date.now() + secondsFromNow * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// The focused study-session experience: works through a queue of sessions one at a time, tracks
// actual time spent (paused time doesn't count), and — before moving on — asks the student to
// confirm how long it really took, feeding future estimates via onFinishSession.
export default function SprintSession({ queue, onClose, onFinishSession }) {
  const [index, setIndex] = useState(0);
  const current = queue[index];
  const [secondsLeft, setSecondsLeft] = useState(current.minutes * 60);
  const [running, setRunning] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [reporting, setReporting] = useState(false);
  const [reportMinutes, setReportMinutes] = useState(current.minutes);
  const tick = useRef(null);

  useEffect(() => {
    setSecondsLeft(current.minutes * 60);
    setElapsedSeconds(0);
    setRunning(true);
    setReporting(false);
    setReportMinutes(current.minutes);
  }, [index]);

  useEffect(() => {
    if (!running || reporting) return;
    tick.current = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(tick.current);
  }, [running, reporting]);

  const startReport = () => {
    setRunning(false);
    setReportMinutes(Math.max(1, Math.round(elapsedSeconds / 60) || current.minutes));
    setReporting(true);
  };

  const confirmDone = () => {
    onFinishSession(current, reportMinutes);
    if (index + 1 < queue.length) setIndex((i) => i + 1);
    else onClose();
  };

  const total = current.minutes * 60;
  const progressPct = Math.min(100, Math.round((elapsedSeconds / Math.max(1, total)) * 100));

  return (
    <div className="overlay">
      <div className="sprint-session">
        <button className="close" onClick={onClose}>×</button>
        <span className="eyebrow">{queue.length > 1 ? `TASK ${index + 1} OF ${queue.length}` : 'FOCUS SPRINT'}</span>
        <h3>{current.title}</h3>
        {current.subject && <p className="sprint-session-subject">{current.subject}</p>}

        {!reporting ? (
          <>
            <h2>{fmtClock(secondsLeft)}</h2>
            <div className="bar sprint-session-bar"><i style={{ width: `${progressPct}%` }} /></div>
            <p className="sprint-session-meta">{progressPct}% through your {current.minutes}-min estimate · done around {fmtETA(secondsLeft)}</p>
            <div className="sprint-session-actions">
              <button className="primary" onClick={() => setRunning((r) => !r)}>{running ? 'Pause' : 'Resume'}</button>
              <button className="reset" onClick={startReport}>Mark complete</button>
            </div>
            {index + 1 < queue.length && <button className="skip-link" onClick={startReport}>Skip to next task →</button>}
          </>
        ) : (
          <div className="sprint-report">
            <p>How long did that actually take?</p>
            <div className="sprint-report-input">
              <input type="number" min="1" value={reportMinutes} onChange={(e) => setReportMinutes(Math.max(1, +e.target.value || 1))} />
              <span>minutes</span>
            </div>
            <p className="sprint-report-hint">{reportMinutes > current.minutes ? 'Longer than estimated — noted for next time.' : reportMinutes < current.minutes ? 'Faster than estimated — nice.' : 'Right on estimate.'}</p>
            <button className="primary" onClick={confirmDone}>{index + 1 < queue.length ? 'Next task →' : 'Finish sprint'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
