import { useState } from 'react';
import QuizGenerator from './QuizGenerator';
import QuizRunner from './QuizRunner';
import QuizResults from './QuizResults';

export default function Quiz({ profile, setTab, notify, saveAttempt, addTopicsToWork }) {
  const [stage, setStage] = useState('setup');
  const [quiz, setQuiz] = useState(null);
  const [attempt, setAttempt] = useState(null);

  const onGenerated = (q) => { setQuiz(q); setAttempt(null); setStage('running'); };
  const onFinished = (result) => { setAttempt(result); saveAttempt(result); setStage('results'); };
  const retry = () => setStage('running');
  const regenerate = () => { setQuiz(null); setAttempt(null); setStage('setup'); };

  return (
    <div className="page analyzer">
      <div className="page-heading"><div><h1>Practice Quiz</h1><p>Test yourself on what you're studying.</p></div></div>
      {stage === 'setup' && <QuizGenerator profile={profile} setTab={setTab} onGenerated={onGenerated} />}
      {stage === 'running' && quiz && <QuizRunner quiz={quiz} profile={profile} onFinished={onFinished} />}
      {stage === 'results' && attempt && (
        <QuizResults
          attempt={attempt}
          onRetry={retry}
          onRegenerate={regenerate}
          onStudyWeakAreas={() => { addTopicsToWork(attempt.weakTopics); notify('Added weak topics to your study plan'); }}
        />
      )}
    </div>
  );
}
