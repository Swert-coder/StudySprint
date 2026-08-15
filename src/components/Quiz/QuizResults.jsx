export default function QuizResults({ attempt, onRetry, onRegenerate, onStudyWeakAreas }) {
  const { questions, answers, results, score, correctCount, questionCount, weakTopics } = attempt;
  return (
    <div className="panel report-card quiz-results">
      <div className="quiz-score-hero">
        <span className="eyebrow">QUIZ COMPLETE</span>
        <h2>{score}%</h2>
        <p>{correctCount} of {questionCount} correct</p>
      </div>

      {weakTopics.length > 0 && (
        <div className="report-topics">
          <h3>Topics to review</h3>
          <div className="topic-tags">{weakTopics.map((t, i) => <span className="topic-tag" key={i}>{t}</span>)}</div>
        </div>
      )}

      <div className="quiz-list">
        {questions.map((q, i) => {
          const r = results[i];
          return (
            <div className="quiz-question" key={i}>
              <div className="quiz-question-head"><b>{i + 1}. {q.question}</b><label className={'quiz-result-tag ' + (r.correct ? 'correct' : 'incorrect')}>{r.correct ? '✓ Correct' : '✗ Incorrect'}</label></div>
              <p className="quiz-your-answer">Your answer: {answers[i] || <em>skipped</em>}</p>
              {!r.correct && <p className="quiz-correct-answer">Correct answer: {q.answer}</p>}
              {r.feedback && <div className="quiz-answer"><p>{r.feedback}</p></div>}
            </div>
          );
        })}
      </div>

      <div className="quiz-results-actions">
        <button className="reset" onClick={onRetry}>Retry this quiz</button>
        <button className="reset" onClick={onRegenerate}>Generate another</button>
        {weakTopics.length > 0 && <button className="primary" onClick={onStudyWeakAreas}>Study weak areas</button>}
      </div>
    </div>
  );
}
