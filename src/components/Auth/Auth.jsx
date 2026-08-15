import { useState } from 'react';
import { supabase } from '../../supabase';

export function AuthConfiguration() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand auth-brand"><div className="brandmark">⚡</div><span>study<span>sprint</span></span></div>
        <h1>One quick setup</h1>
        <p>Add your Supabase environment variables, then restart the app to enable secure sign in.</p>
        <code>VITE_SUPABASE_URL<br />VITE_SUPABASE_ANON_KEY</code>
      </div>
    </div>
  );
}

export function AuthLoading() {
  return (
    <div className="auth-shell">
      <div className="auth-card loading-card">
        <div className="brandmark">⚡</div>
        <p>Getting your study space ready…</p>
      </div>
    </div>
  );
}

export function friendlyAuthError(message = '') {
  if (/invalid login credentials/i.test(message)) return 'That email or password doesn’t look right. Try again or reset your password.';
  if (/already registered/i.test(message)) return 'An account already exists for that email. Try logging in instead.';
  if (/rate limit/i.test(message)) return 'Please wait a moment before trying again.';
  return message || 'Something went wrong. Please try again.';
}

export function AuthPage() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isSignup = mode === 'signup';
  const reset = mode === 'reset';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!form.email.trim()) { setError('Please enter your email address.'); return; }
    if (!reset && form.password.length < 6) { setError('Your password needs at least 6 characters.'); return; }
    if (isSignup && !form.name.trim()) { setError('Please tell us your name.'); return; }
    setLoading(true);
    try {
      if (reset) {
        const { error } = await supabase.auth.resetPasswordForEmail(form.email, { redirectTo: window.location.origin });
        if (error) throw error;
        setMessage('Check your inbox for a secure password-reset link.');
      } else if (isSignup) {
        const { data, error } = await supabase.auth.signUp({ email: form.email, password: form.password, options: { data: { name: form.name.trim() }, emailRedirectTo: window.location.origin } });
        if (error) throw error;
        setMessage(data.session ? 'Your account is ready!' : 'Check your inbox to confirm your email, then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
        if (error) throw error;
      }
    } catch (err) {
      setError(friendlyAuthError(err.message));
    } finally {
      setLoading(false);
    }
  };

  const title = reset ? 'Reset your password' : isSignup ? 'Start your study sprint' : 'Welcome back';
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand auth-brand"><div className="brandmark">⚡</div><span>study<span>sprint</span></span></div>
        <span className="eyebrow">{reset ? 'ACCOUNT RECOVERY' : isSignup ? 'BUILD YOUR MOMENTUM' : 'YOUR FOCUSED SPACE'}</span>
        <h1>{title}</h1>
        <p>{reset ? 'We’ll email you a safe link to choose a new password.' : isSignup ? 'Create an account to keep your learning space yours.' : 'Sign in to continue making progress.'}</p>
        <form className="auth-form" onSubmit={submit}>
          {isSignup && <label>Name<input autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" disabled={loading} /></label>}
          <label>Email<input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" disabled={loading} /></label>
          {!reset && <label>Password<input type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" disabled={loading} /></label>}
          {error && <div className="auth-message error" role="alert">{error}</div>}
          {message && <div className="auth-message success">{message}</div>}
          <button className="primary auth-submit" disabled={loading}>{loading ? 'Please wait…' : reset ? 'Send reset link' : isSignup ? 'Create account' : 'Log in'}</button>
        </form>
        {!reset && !isSignup && <button className="auth-link" onClick={() => { setMode('reset'); setError(''); setMessage(''); }}>Forgot your password?</button>}
        <div className="auth-switch">
          {reset ? 'Remembered it?' : isSignup ? 'Already have an account?' : 'New to StudySprint?'}{' '}
          <button onClick={() => { setMode(reset ? 'login' : isSignup ? 'login' : 'signup'); setError(''); setMessage(''); }}>{reset || isSignup ? 'Log in' : 'Create an account'}</button>
        </div>
      </div>
    </div>
  );
}

export function ResetPassword({ onComplete }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) { setError('Your password needs at least 6 characters.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(friendlyAuthError(error.message)); return; }
    onComplete();
  };
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand auth-brand"><div className="brandmark">⚡</div><span>study<span>sprint</span></span></div>
        <h1>Choose a new password</h1>
        <p>Make it something you’ll remember and keep private.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>New password<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} /></label>
          {error && <div className="auth-message error">{error}</div>}
          <button className="primary auth-submit" disabled={loading}>{loading ? 'Saving…' : 'Save new password'}</button>
        </form>
      </div>
    </div>
  );
}
