"use client";

import { useState } from "react";

interface Scoring {
  vocabulary_score: number;
  grammar_score: number;
  expression_score: number;
  accuracy_score: number;
  eqs: number;
  vocab_level: string;
  scoring_reason: {
    vocabulary: string;
    grammar: string;
    expression: string;
    accuracy: string;
  };
}

interface Mistake {
  pattern_name: string;
  original: string;
  corrected: string;
  rule: string;
  is_new_pattern: boolean;
}

interface Feedback {
  corrected_text: string;
  mistakes: Mistake[];
  used_expressions: string[];
  scoring: Scoring;
  feedback_summary: string;
}

export default function JournalPage() {
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit() {
    if (!text.trim() || streaming) return;

    setStreaming(true);
    setStreamText("");
    setFeedback(null);
    setSaved(false);

    const res = await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

      for (const line of lines) {
        const data = JSON.parse(line.slice(6));
        if (data.done) {
          fullText = data.fullText;
        } else {
          setStreamText((prev) => prev + data.text);
        }
      }
    }

    try {
      const parsed: Feedback = JSON.parse(fullText);
      setFeedback(parsed);

      setSaving(true);
      await fetch("/api/journal/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalText: text, feedback: parsed }),
      });
      setSaved(true);
    } catch {
      // JSON 파싱 실패 시 스트리밍 텍스트 유지
    }

    setSaving(false);
    setStreaming(false);
  }

  const scoreColor = (score: number) =>
    score >= 80 ? "text-green-600" : score >= 60 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">일기 작성</h1>

      <div className="bg-white rounded-xl border p-6 space-y-4">
        <p className="text-sm text-gray-500">
          오늘의 영어 일기를 작성하세요. AI가 교정과 피드백을 제공합니다.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write your English journal here..."
          rows={8}
          className="w-full px-4 py-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
        />
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">{text.length}자</span>
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || streaming}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {streaming ? "분석 중..." : "제출하기"}
          </button>
        </div>
      </div>

      {streaming && !feedback && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-3">AI 피드백 (스트리밍)</h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
            {streamText}
          </pre>
        </div>
      )}

      {feedback && (
        <div className="space-y-4">
          {/* EQS 점수 */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="font-semibold mb-4">EQS 채점 결과</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
              {[
                { label: "어휘", score: feedback.scoring.vocabulary_score },
                { label: "문법", score: feedback.scoring.grammar_score },
                { label: "표현", score: feedback.scoring.expression_score },
                { label: "정확도", score: feedback.scoring.accuracy_score },
                { label: "EQS 종합", score: feedback.scoring.eqs },
              ].map(({ label, score }) => (
                <div key={label} className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500">{label}</div>
                  <div className={`text-2xl font-bold ${scoreColor(score)}`}>
                    {score}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-sm text-gray-500">
              CEFR 레벨: <span className="font-semibold">{feedback.scoring.vocab_level}</span>
            </div>
          </div>

          {/* 교정본 */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="font-semibold mb-3">교정본</h2>
            <p className="text-gray-700 leading-relaxed">{feedback.corrected_text}</p>
          </div>

          {/* 실수 패턴 */}
          {feedback.mistakes.length > 0 && (
            <div className="bg-white rounded-xl border p-6">
              <h2 className="font-semibold mb-3">실수 패턴</h2>
              <div className="space-y-3">
                {feedback.mistakes.map((m, i) => (
                  <div key={i} className="p-3 bg-red-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-red-700">{m.pattern_name}</span>
                      {m.is_new_pattern && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">NEW</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="line-through text-red-400">{m.original}</span>
                      {" → "}
                      <span className="text-green-600">{m.corrected}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{m.rule}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 피드백 요약 */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="font-semibold mb-3">피드백 요약</h2>
            <p className="text-gray-700">{feedback.feedback_summary}</p>
          </div>

          {/* 저장 상태 */}
          <div className="text-center text-sm text-gray-400">
            {saving ? "저장 중..." : saved ? "✓ DB에 저장 완료" : ""}
          </div>
        </div>
      )}
    </div>
  );
}
