"use client";

import { useState, useEffect } from "react";

interface Question {
  quiz_type: string;
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  related_pattern: string;
}

interface QuizAttempt {
  id: string;
  quiz_type: string;
  question: string;
  correct_answer: string;
  user_answer: string;
  is_correct: boolean;
  attempted_at: string;
}

export default function QuizPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(false);
  const [includeTrap, setIncludeTrap] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<QuizAttempt[]>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    const res = await fetch("/api/quiz/history");
    const data = await res.json();
    setHistory(data.attempts || []);
  }

  async function generateQuiz() {
    setLoading(true);
    setError("");
    setQuestions([]);
    setCurrent(0);
    setScore(0);
    setFinished(false);

    const res = await fetch("/api/quiz/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includeTrap }),
    });

    const data = await res.json();
    if (data.error) {
      setError(data.error);
    } else {
      setQuestions(data.questions);
    }
    setLoading(false);
  }

  async function handleAnswer(option: string) {
    if (answered) return;
    setSelected(option);
    setAnswered(true);

    const q = questions[current];
    const isCorrect = option === q.correct_answer;
    if (isCorrect) setScore((s) => s + 1);

    await fetch("/api/quiz/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quizType: q.quiz_type,
        question: q.question,
        correctAnswer: q.correct_answer,
        userAnswer: option,
        isCorrect,
        relatedPattern: q.related_pattern,
      }),
    });
    loadHistory();
  }

  function nextQuestion() {
    if (current + 1 >= questions.length) {
      setFinished(true);
    } else {
      setCurrent((c) => c + 1);
      setSelected(null);
      setAnswered(false);
    }
  }

  const wrongHistory = history.filter(h => !h.is_correct);

  const quizTypeLabel: Record<string, string> = {
    error_correction: "틀린 곳 찾기",
    fill_blank: "빈칸 채우기",
    expression_choice: "표현 선택",
  };

  // 시작 화면
  if (questions.length === 0 && !loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl sm:text-2xl font-bold">퀴즈</h1>
        <div className="bg-white rounded-xl border p-8 text-center space-y-6">
          <p className="text-gray-500">내 실수 패턴과 일기를 기반으로 맞춤 퀴즈를 만들어 드려요 🧩</p>

          <label className="flex items-center justify-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeTrap}
              onChange={(e) => setIncludeTrap(e.target.checked)}
              className="rounded"
            />
            함정 문제 포함
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={generateQuiz}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            퀴즈 시작
          </button>

          {wrongHistory.length > 0 && (
            <button
              onClick={generateQuiz}
              className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
            >
              틀린 문제 다시 풀기 ({wrongHistory.length}개)
            </button>
          )}
        </div>

        <QuizHistory history={history} quizTypeLabel={quizTypeLabel} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl sm:text-2xl font-bold">퀴즈</h1>
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          퀴즈 생성 중...
        </div>
      </div>
    );
  }

  // 결과 화면
  if (finished) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl sm:text-2xl font-bold">퀴즈 결과</h1>
        <div
          className="bg-white rounded-xl border p-8 text-center space-y-4"
          data-coach-context={`퀴즈 결과: ${score}/${questions.length}\n${questions.map((q, i) => `문제${i+1}: ${q.question} → 정답: ${q.correct_answer}, 해설: ${q.explanation}`).join("\n")}`}
        >
          <div className="text-5xl font-bold text-blue-600">
            {score} / {questions.length}
          </div>
          <p className="text-gray-500">
            {score === questions.length
              ? "완벽해요! 🎉"
              : score >= questions.length / 2
                ? "잘했어요! 👏"
                : "다시 도전해보세요! 💪"}
          </p>
          <button
            onClick={generateQuiz}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            다시 풀기
          </button>
        </div>

        <QuizHistory history={history} quizTypeLabel={quizTypeLabel} />
      </div>
    );
  }

  // 문제 화면
  const q = questions[current];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">퀴즈</h1>
        <span className="text-sm text-gray-400">
          {current + 1} / {questions.length}
        </span>
      </div>

      <div
        className="bg-white rounded-xl border p-6 space-y-5"
        data-coach-context={`퀴즈 ${current + 1}/${questions.length}\n유형: ${quizTypeLabel[q.quiz_type] || q.quiz_type}\n문제: ${q.question}\n보기: ${q.options.join(", ")}\n정답: ${q.correct_answer}\n관련 패턴: ${q.related_pattern || "없음"}${answered ? `\n사용자 답: ${selected}\n결과: ${selected === q.correct_answer ? "정답" : "오답"}\n해설: ${q.explanation}` : ""}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full font-medium">
            {quizTypeLabel[q.quiz_type] || q.quiz_type}
          </span>
          {q.related_pattern && (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
              {q.related_pattern}
            </span>
          )}
        </div>

        <p className="text-lg font-medium">{q.question}</p>

        <div className="space-y-2">
          {q.options.map((opt) => {
            let style = "border hover:bg-gray-50";
            if (answered) {
              if (opt === q.correct_answer) style = "border-green-500 bg-green-50";
              else if (opt === selected) style = "border-red-500 bg-red-50";
              else style = "border opacity-50";
            }
            return (
              <button
                key={opt}
                onClick={() => handleAnswer(opt)}
                disabled={answered}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${style}`}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {answered && (
          <div className="space-y-3">
            <div
              className={`p-3 rounded-lg text-sm ${
                selected === q.correct_answer
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {selected === q.correct_answer ? "정답입니다! ✅" : "오답입니다 ❌"}
            </div>
            <p className="text-sm text-gray-600">{q.explanation}</p>
            <button
              onClick={nextQuestion}
              className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              {current + 1 >= questions.length ? "결과 보기" : "다음 문제"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function QuizHistory({
  history,
  quizTypeLabel,
}: {
  history: QuizAttempt[];
  quizTypeLabel: Record<string, string>;
}) {
  if (history.length === 0) return null;

  const grouped: Record<string, QuizAttempt[]> = {};
  for (const h of history) {
    const date = new Date(h.attempted_at).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(h);
  }

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-gray-500 mb-3">📝 퀴즈 기록</h3>
      <div className="space-y-4">
        {Object.entries(grouped).map(([date, attempts]) => {
          const correct = attempts.filter((a) => a.is_correct).length;
          return (
            <div key={date}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">{date}</span>
                <span className="text-xs text-gray-400">
                  {correct}/{attempts.length} 정답
                </span>
              </div>
              <div className="space-y-1.5">
                {attempts.map((a) => (
                  <div
                    key={a.id}
                    className={`bg-white rounded-lg border p-3 text-sm ${
                      a.is_correct ? "" : "border-l-4 border-l-red-400"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs ${a.is_correct ? "text-green-600" : "text-red-600"}`}>
                          {a.is_correct ? "✅" : "❌"}
                        </span>
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          {quizTypeLabel[a.quiz_type] || a.quiz_type}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400">
                        {new Date(a.attempted_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 mb-1">{a.question}</p>
                    {!a.is_correct && (
                      <div className="text-xs space-y-0.5">
                        <p>
                          <span className="text-gray-400">내 답: </span>
                          <span className="bg-red-100 text-red-600 px-1 rounded">{a.user_answer}</span>
                        </p>
                        <p>
                          <span className="text-gray-400">정답: </span>
                          <span className="bg-green-100 text-green-700 px-1 rounded">{a.correct_answer}</span>
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
