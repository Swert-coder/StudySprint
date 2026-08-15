import { useState } from 'react';
import { isoToday, niceDate, WEEKDAYS } from '../lib/dates';
import { LEARNING_PREFS } from '../lib/constants';
import { supabase } from '../supabase';

const WEEKDAY_LABELS = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
const ORDERED = WEEKDAYS.slice(1).concat(WEEKDAYS[0]); // Mon..Sun

export default function Settings({ data, update, notify }) {
  const [profile, setProfile] = useState(data.profile);
  const [customDay, setCustomDay] = useState('');
  const save = () => { update('profile')(profile); notify('Settings saved'); };
  const togglePref = (p) => setProfile((pr) => ({ ...pr, learningPreferences: (pr.learningPreferences || []).includes(p) ? pr.learningPreferences.filter((x) => x !== p) : [...(pr.learningPreferences || []), p] }));

  const customizing = !!profile.weekdayMinutes;
  const toggleCustomizing = () => {
    setProfile((pr) => (pr.weekdayMinutes
      ? { ...pr, weekdayMinutes: null }
      : { ...pr, weekdayMinutes: Object.fromEntries(WEEKDAYS.map((w) => [w, +pr.dailyGoal || 60])) }));
  };
  const setDayMinutes = (wd, minutes) => setProfile((pr) => ({ ...pr, weekdayMinutes: { ...pr.weekdayMinutes, [wd]: Math.max(0, minutes) } }));

  const addBlockedDate = () => {
    if (!customDay || (profile.blockedDates || []).includes(customDay)) return;
    setProfile((pr) => ({ ...pr, blockedDates: [...(pr.blockedDates || []), customDay].sort() }));
    setCustomDay('');
  };
  const removeBlockedDate = (d) => setProfile((pr) => ({ ...pr, blockedDates: (pr.blockedDates || []).filter((x) => x !== d) }));

  return (
    <div className="page settings">
      <div className="page-heading"><div><h1>Settings</h1><p>Make Study Sprint feel like yours.</p></div></div>

      <div className="panel form">
        <h2>Your profile</h2>
        <label>Name<input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label>
        <label>Default daily focus goal (minutes)<input type="number" min="15" value={profile.dailyGoal} onChange={(e) => setProfile({ ...profile, dailyGoal: +e.target.value })} /></label>
        <label>Daily motivation<input value={profile.goal} onChange={(e) => setProfile({ ...profile, goal: e.target.value })} /></label>
        <button className="primary" onClick={save}>Save changes</button>
        <button className="signout-button" onClick={() => supabase.auth.signOut()}>Log out of StudySprint</button>
      </div>

      <div className="panel form">
        <h2>Available study time</h2>
        <p className="muted">Some days you have more time than others — StudySprint won't overbook the light days.</p>
        <label className="toggle-row"><input type="checkbox" checked={customizing} onChange={toggleCustomizing} /> Customize by day of the week</label>
        {customizing && (
          <div className="weekday-grid">
            {ORDERED.map((wd) => (
              <label key={wd} className="weekday-input">{WEEKDAY_LABELS[wd]}<input type="number" min="0" value={profile.weekdayMinutes[wd] ?? 0} onChange={(e) => setDayMinutes(wd, +e.target.value || 0)} /></label>
            ))}
          </div>
        )}
        <h3 className="subhead">Days you can't study</h3>
        <div className="blocked-date-row">
          <input type="date" min={isoToday()} value={customDay} onChange={(e) => setCustomDay(e.target.value)} />
          <button type="button" className="primary" onClick={addBlockedDate}>Block this day</button>
        </div>
        {!!(profile.blockedDates || []).length && (
          <ul className="blocked-date-list">
            {profile.blockedDates.map((d) => (
              <li key={d}>{niceDate(d)}<button type="button" onClick={() => removeBlockedDate(d)}>×</button></li>
            ))}
          </ul>
        )}
        <button className="primary" onClick={save}>Save changes</button>
      </div>

      <div className="panel form">
        <h2>For your Study Analyzer feedback</h2>
        <p className="muted">Used to tailor feedback on work you upload. Nothing here is shared unless you run an analysis.</p>
        <label>Grade level<input value={profile.gradeLevel || ''} onChange={(e) => setProfile({ ...profile, gradeLevel: e.target.value })} placeholder="e.g. 10th grade, College sophomore" /></label>
        <label>Class or subject<input value={profile.className || ''} onChange={(e) => setProfile({ ...profile, className: e.target.value })} placeholder="e.g. AP Biology" /></label>
        <label>Typical grades in this class<input value={profile.typicalGrade || ''} onChange={(e) => setProfile({ ...profile, typicalGrade: e.target.value })} placeholder="e.g. B+ / A-" /></label>
        <label>How you learn best
          <div className="pref-pills">{LEARNING_PREFS.map((p) => <button type="button" key={p} className={'pref-pill' + ((profile.learningPreferences || []).includes(p) ? ' active' : '')} onClick={() => togglePref(p)}>{p}</button>)}</div>
        </label>
        <label>Accommodations <small>(optional, self-reported — never used to diagnose anything)</small>
          <textarea rows="3" value={profile.accommodations || ''} onChange={(e) => setProfile({ ...profile, accommodations: e.target.value })} placeholder="e.g. extended time, chunked assignments, text-to-speech" />
        </label>
        <button className="primary" onClick={save}>Save changes</button>
      </div>

      <div className="panel data-note">
        <h2>Your data stays with you</h2>
        <p>Your study plan is saved securely and separated by account. Passwords are handled securely by Supabase.</p>
      </div>
    </div>
  );
}
