import { useState } from 'react';
import { supabase } from '../../supabase';
import { extractText } from '../../extract';
import { QUESTION_TYPES } from '../../lib/constants';

export default function QuizGenerator({ profile, setTab, onGenerated }) {
  const [inputMode, setInputMode] = useState('file');
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [subject, setSubject] = useState(profile.className || '');
  const [difficulty, setDifficulty] = useState('Medium');
  const [types, setTypes] = useState(['multiple-choice']);
  const [count, setCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const profileReady = profile.gradeLevel && profile.className;

  const onFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f); setError(''); setExtractedText(''); setExtracting(true); setStatus('Reading your file…');
    try {
      const text = await extractText(f, setStatus);
      if (!text.trim()) throw new Error('No readable text was found in that file. Try a clearer photo or a text-based PDF.');
      setExtractedText(text);
    } catch (err) {
      setError(err.message || 'Could not read that file.');
    } finally {
      setExtracting(false); setStatus('');
    }
  };

  const usePastedText = () => {
    const t = pastedText.trim();
    if (!t) return;
    setFile(null); setError(''); setExtractedText(t);
  };

  const toggleType = (id) => setTypes((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const startQuiz = async () => {
    if (!extractedText.trim() || !types.length) return;
    setGenerating(true); setError('');
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke('generate-quiz', {
        body: { text: extractedText, types, count, difficulty, profile: { gradeLevel: profile.gradeLevel, className: profile.className } },
      });
      if (fnError) throw new Error(fnError.message || 'The quiz generator could not be reached.');
      if (res?.error) throw new Error(res.error);
      onGenerated({ questions: res.quiz.questions, sourceText: extractedText, types, count, difficulty, subject: subject || profile.className || 'Study' });
    } catch (err) {
      setError(err.message || 'Something went wrong generating this quiz.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="quiz-setup">
      <div className="panel privacy-note"><b>🔒 Private by design</b><p>Your file is read right here in your browser and never uploaded anywhere. Only the text you approve is sent to build your quiz.</p></div>
      {!profileReady && <div className="panel analyzer-hint"><p>Add your grade level and class in <button onClick={() => setTab('Settings')}>Settings</button> for a quiz tailored to you — or generate one without it.</p></div>}

      <div className="panel upload-panel">
        <div className="input-mode-toggle">
          <button type="button" className={inputMode === 'file' ? 'active' : ''} onClick={() => setInputMode('file')}>Upload file</button>
          <button type="button" className={inputMode === 'text' ? 'active' : ''} onClick={() => setInputMode('text')}>Paste text</button>
        </div>
        {inputMode === 'file' ? (
          <>
            <label className="upload-drop">
              <input type="file" accept="application/pdf,image/*" onChange={onFile} hidden />
              <span className="upload-icon">⇪</span>
              <b>{file ? file.name : 'Upload a PDF or photo of your notes'}</b>
              <small>PDF, JPG, or PNG</small>
            </label>
            {extracting && <div className="extract-status"><span className="spinner" />{status}</div>}
          </>
        ) : (
          <div className="paste-text-panel">
            <textarea rows="6" placeholder="Paste your notes, textbook excerpt, or study material here…" value={pastedText} onChange={(e) => setPastedText(e.target.value)} />
            <button type="button" className="primary" disabled={!pastedText.trim()} onClick={usePastedText}>Use this text</button>
          </div>
        )}
        {error && <div className="auth-message error">{error}</div>}
      </div>

      {extractedText && !extracting && (
        <div className="panel quiz-setup-options">
          <h2>Choose what you want to practice</h2>
          <div className="quiz-setup-grid">
            <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Biology" /></label>
            <label>Difficulty<select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option>Easy</option><option>Medium</option><option>Hard</option></select></label>
            <label>Number of questions<input type="number" min="1" max="20" value={count} onChange={(e) => setCount(Math.min(20, Math.max(1, +e.target.value || 1)))} /></label>
          </div>
          <label className="quiz-types-label">Question types
            <div className="pref-pills">{QUESTION_TYPES.map((qt) => <button type="button" key={qt.id} className={'pref-pill' + (types.includes(qt.id) ? ' active' : '')} onClick={() => toggleType(qt.id)}>{qt.label}</button>)}</div>
          </label>
          <button className="primary quiz-start-btn" disabled={generating || !types.length} onClick={startQuiz}>{generating ? 'Building your quiz…' : 'Start quiz'}</button>
        </div>
      )}
    </div>
  );
}
