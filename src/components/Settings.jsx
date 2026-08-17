import { useEffect, useState } from 'react';
import { isoToday, niceDate, niceTime, WEEKDAYS } from '../lib/dates';
import { LEARNING_PREFS } from '../lib/constants';
import { supabase } from '../supabase';
import { fetchSubscription, openBillingPortal } from '../lib/subscription';
import { PaywallInline } from './Paywall';

const WEEKDAY_LABELS = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
const ORDERED = WEEKDAYS.slice(1).concat(WEEKDAYS[0]); // Mon..Sun

export default function Settings({ data, update, notify, userId }) {
  const [profile, setProfile] = useState(data.profile);
  const [subscription, setSubscription] = useState(null);
  const [subLoading, setSubLoading] = useState(true);
  const [subError, setSubError] = useState('');
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSubLoading(true);
    fetchSubscription(userId)
      .then((s) => { if (!cancelled) setSubscription(s); })
      .catch((err) => { if (!cancelled) setSubError(err.message); })
      .finally(() => { if (!cancelled) setSubLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  const manageBilling = async () => {
    setSubError(''); setPortalLoading(true);
    try {
      await openBillingPortal(); // redirects on success
    } catch (err) {
      setSubError(err.message || 'Could not open the billing portal.');
      setPortalLoading(false);
    }
  };
  const [customDay, setCustomDay] = useState('');
  const [blockTime, setBlockTime] = useState({ mode: 'weekly', weekday: 'Mon', date: isoToday(), start: '18:00', end: '20:00', label: '' });
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

  const addBlockedTime = () => {
    if (!blockTime.start || !blockTime.end || blockTime.start >= blockTime.end) return;
    const entry = {
      id: Date.now(),
      label: blockTime.label.trim(),
      start: blockTime.start,
      end: blockTime.end,
      weekday: blockTime.mode === 'weekly' ? blockTime.weekday : null,
      date: blockTime.mode === 'once' ? blockTime.date : null,
    };
    setProfile((pr) => ({ ...pr, blockedTimes: [...(pr.blockedTimes || []), entry] }));
    setBlockTime((b) => ({ ...b, label: '' }));
  };
  const removeBlockedTime = (id) => setProfile((pr) => ({ ...pr, blockedTimes: (pr.blockedTimes || []).filter((b) => b.id !== id) }));
  const weeklyBlocks = (profile.blockedTimes || []).filter((b) => b.weekday);
  const oneOffBlocks = (profile.blockedTimes || []).filter((b) => b.date);

  return (
    <div className="page settings">
      <div className="page-heading"><div><h1>Settings</h1><p>Make Study Sprint feel like yours.</p></div></div>

      <div className="panel form subscription-panel">
        <h2>Subscription</h2>
        {subLoading ? (
          <p className="muted">Loading your plan…</p>
        ) : subscription?.isPro ? (
          <>
            <p className="sub-status-line">
              <span className="pro-badge">PRO</span>
              {subscription.isTrialing
                ? ` Free trial — ${subscription.trialDaysLeft} day${subscription.trialDaysLeft === 1 ? '' : 's'} left`
                : subscription.cancelAtPeriodEnd
                  ? ` Cancels ${subscription.currentPeriodEnd ? niceDate(subscription.currentPeriodEnd.slice(0, 10)) : 'soon'} — you'll keep Pro access until then`
                  : ' Active — thanks for supporting StudySprint!'}
            </p>
            {subError && <div className="auth-message error">{subError}</div>}
            <button className="primary" disabled={portalLoading} onClick={manageBilling}>{portalLoading ? 'Opening billing…' : 'Manage subscription'}</button>
          </>
        ) : (
          <>
            {subError && <div className="auth-message error">{subError}</div>}
            <PaywallInline />
          </>
        )}
      </div>

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

        <div className="settings-section">
          <h3 className="subhead">Weekly schedule</h3>
          <button type="button" className={'pref-pill' + (customizing ? ' active' : '')} onClick={toggleCustomizing}>{customizing ? '✓ Customized by day' : 'Customize by day of the week'}</button>
          {customizing && (
            <div className="weekday-grid">
              {ORDERED.map((wd) => (
                <label key={wd} className="weekday-input">{WEEKDAY_LABELS[wd]}<input type="number" min="0" value={profile.weekdayMinutes[wd] ?? 0} onChange={(e) => setDayMinutes(wd, +e.target.value || 0)} /></label>
              ))}
            </div>
          )}
        </div>

        <div className="settings-section">
          <h3 className="subhead">Blocked days</h3>
          <p className="muted">A full day you won't study at all — no time is planned that day.</p>
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
        </div>

        <div className="settings-section">
          <h3 className="subhead">Blocked times</h3>
          <p className="muted">A recurring weekly slot (like practice) or a one-time appointment — that time is subtracted from the day's budget instead of clearing the whole day.</p>
          <div className="blocked-date-row">
            <select value={blockTime.mode} onChange={(e) => setBlockTime((b) => ({ ...b, mode: e.target.value }))}>
              <option value="weekly">Every week</option>
              <option value="once">One date</option>
            </select>
            {blockTime.mode === 'weekly' ? (
              <select value={blockTime.weekday} onChange={(e) => setBlockTime((b) => ({ ...b, weekday: e.target.value }))}>
                {ORDERED.map((wd) => <option key={wd} value={wd}>{WEEKDAY_LABELS[wd]}</option>)}
              </select>
            ) : (
              <input type="date" min={isoToday()} value={blockTime.date} onChange={(e) => setBlockTime((b) => ({ ...b, date: e.target.value }))} />
            )}
            <input type="time" value={blockTime.start} onChange={(e) => setBlockTime((b) => ({ ...b, start: e.target.value }))} />
            <span className="time-sep">–</span>
            <input type="time" value={blockTime.end} onChange={(e) => setBlockTime((b) => ({ ...b, end: e.target.value }))} />
            <input type="text" className="blocked-time-label" placeholder="Label (optional)" value={blockTime.label} onChange={(e) => setBlockTime((b) => ({ ...b, label: e.target.value }))} />
            <button type="button" className="primary" onClick={addBlockedTime}>Block this time</button>
          </div>
          {!!weeklyBlocks.length && (
            <ul className="blocked-date-list">
              {weeklyBlocks.map((b) => (
                <li key={b.id}>Every {WEEKDAY_LABELS[b.weekday]}, {niceTime(b.start)}–{niceTime(b.end)}{b.label ? ` · ${b.label}` : ''}<button type="button" onClick={() => removeBlockedTime(b.id)}>×</button></li>
              ))}
            </ul>
          )}
          {!!oneOffBlocks.length && (
            <ul className="blocked-date-list">
              {oneOffBlocks.map((b) => (
                <li key={b.id}>{niceDate(b.date)}, {niceTime(b.start)}–{niceTime(b.end)}{b.label ? ` · ${b.label}` : ''}<button type="button" onClick={() => removeBlockedTime(b.id)}>×</button></li>
              ))}
            </ul>
          )}
        </div>

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
