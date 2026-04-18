"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

interface JournalEntry {
  id: string;
  date: string;
  original_text: string;
  corrected_text: string;
  coach_feedback: string;
  created_at: string;
  entry_scores: {
    vocabulary_score: number;
    grammar_score: number;
    expression_score: number;
    accuracy_score: number;
    eqs: number;
    vocab_level: string;
  }[];
}

export default function JournalPage() {
  const [tab, setTab] = useState<"write" | "history">("write");
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 기록 탭
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [userName, setUserName] = useState<string>("");
  const [greeting, setGreeting] = useState<string>("");
  const [greetingLoading, setGreetingLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<
    { type: string; emoji: string; title: string; description: string }[]
  >([]);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setUserName(user.email.split("@")[0]);
      }
    });

    fetch("/api/greeting")
      .then((res) => res.json())
      .then((data) => setGreeting(data.greeting))
      .catch(() => {})
      .finally(() => setGreetingLoading(false));

    fetch("/api/suggestion")
      .then((res) => res.json())
      .then((data) => setSuggestions(data.suggestions || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === "history") loadHistory();
  }, [tab]);

  async function loadHistory() {
    setLoadingHistory(true);
    const { data } = await supabase
      .from("journal_entries")
      .select("*, entry_scores(vocabulary_score, grammar_score, expression_score, accuracy_score, eqs, vocab_level)")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    setEntries(data || []);
    setLoadingHistory(false);
  }

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
      const cleaned = fullText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      const parsed: Feedback = JSON.parse(cleaned);
      setFeedback(parsed);

      setSaving(true);
      const saveRes = await fetch("/api/journal/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalText: text, feedback: parsed }),
      });
      if (saveRes.ok) {
        setSaved(true);
      } else {
        const err = await saveRes.json();
        console.error("Save failed:", err);
      }
    } catch (e) {
      console.error("Parse error:", e, "fullText:", fullText);
    }

    setSaving(false);
    setStreaming(false);
  }

  const scoreColor = (score: number) =>
    score >= 80 ? "text-green-600" : score >= 60 ? "text-yellow-600" : "text-red-600";

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    });
  };

  const today = new Date();
  const todayStr = today.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const getGreeting = () => {
    const hour = today.getHours();
    const day = today.getDay();
    const greetings = {
      morning: [
        "좋은 아침이에요! 오늘도 영어로 하루를 시작해볼까요?",
        "모닝! 아침에 쓰는 일기는 머리가 맑아서 더 잘 써져요 ☀️",
        "일찍 일어나셨네요! 오늘의 일기를 기대할게요 🌅",
      ],
      afternoon: [
        "오늘 하루 어떻게 보내고 계세요? 영어로 적어볼까요?",
        "점심 드셨나요? 잠깐 영어 일기 한 편 어때요? 📝",
        "오후에도 화이팅! 오늘 있었던 일을 영어로 남겨보세요 💪",
      ],
      evening: [
        "오늘 하루 수고하셨어요! 하루를 영어로 정리해볼까요?",
        "하루를 마무리하며 오늘의 이야기를 적어보세요 🌙",
        "저녁 시간이네요. 오늘 가장 기억에 남는 순간을 써보세요 ✨",
      ],
      weekend: [
        "주말이에요! 여유롭게 일기 한 편 써볼까요? 🎉",
        "편안한 주말 보내고 계시죠? 오늘의 이야기를 들려주세요 😊",
      ],
    };

    if (day === 0 || day === 6) {
      const pool = greetings.weekend;
      return pool[today.getDate() % pool.length];
    }
    if (hour < 12) {
      const pool = greetings.morning;
      return pool[today.getDate() % pool.length];
    }
    if (hour < 18) {
      const pool = greetings.afternoon;
      return pool[today.getDate() % pool.length];
    }
    const pool = greetings.evening;
    return pool[today.getDate() % pool.length];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">일기</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("write")}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              tab === "write"
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "bg-white text-gray-600 border hover:bg-gray-50"
            }`}
          >
            새 일기
          </button>
          <button
            onClick={() => setTab("history")}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              tab === "history"
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "bg-white text-gray-600 border hover:bg-gray-50"
            }`}
          >
            기록
          </button>
        </div>
      </div>

      {/* ===== 새 일기 탭 ===== */}
      {tab === "write" && (
        <>
          <div className="bg-white rounded-xl border p-6 space-y-4">
            <div className="space-y-1">
              <p className="text-xs text-gray-400">{todayStr}</p>
              <p className="text-sm text-gray-600">
                {greetingLoading ? "..." : greeting || `${userName}님, 오늘도 영어로 하루를 기록해보세요 ✨`}
              </p>
            </div>
            {suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-400">오늘의 도전 과제</p>
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 p-2.5 rounded-lg text-sm ${
                      s.type === "mistake"
                        ? "bg-amber-50 border border-amber-100"
                        : "bg-blue-50 border border-blue-100"
                    }`}
                  >
                    <span className="shrink-0">{s.emoji}</span>
                    <div>
                      <span className="font-semibold">{s.title}</span>
                      <span className="text-gray-500 ml-1.5 text-xs">{s.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

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
            <FeedbackView feedback={feedback} saving={saving} saved={saved} scoreColor={scoreColor} />
          )}
        </>
      )}

      {/* ===== 기록 탭 ===== */}
      {tab === "history" && (
        <>
          {selectedEntry ? (
            <div className="space-y-4">
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
              >
                ← 목록으로
              </button>
              <EntryDetail entry={selectedEntry} scoreColor={scoreColor} formatDate={formatDate} />
            </div>
          ) : (
            <div className="space-y-3">
              {loadingHistory ? (
                <div className="text-center py-12 text-gray-400">로딩 중...</div>
              ) : entries.length === 0 ? (
                <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
                  {userName ? `${userName}님, ` : ""}아직 작성된 일기가 없어요.
                  <button
                    onClick={() => setTab("write")}
                    className="block mx-auto mt-3 text-blue-600 hover:underline text-sm"
                  >
                    첫 일기 작성하러 가기
                  </button>
                </div>
              ) : (
                entries.map((entry) => {
                  const score = entry.entry_scores?.[0];
                  return (
                    <button
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      className="w-full bg-white rounded-xl border p-5 text-left hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">
                          {formatDate(entry.date)}
                        </span>
                        {score && (
                          <span className={`text-lg font-bold ${scoreColor(score.eqs)}`}>
                            실력 {score.eqs}점
                          </span>
                        )}
                      </div>
                      <p className="text-gray-500 text-sm line-clamp-2">
                        {entry.original_text}
                      </p>
                      {score && (
                        <div className="flex flex-wrap gap-2 sm:gap-3 mt-2 text-[10px] sm:text-xs text-gray-400">
                          <span>어휘 {score.vocabulary_score}</span>
                          <span>문법 {score.grammar_score}</span>
                          <span>표현 {score.expression_score}</span>
                          <span>정확도 {score.accuracy_score}</span>
                          {score.vocab_level && <span>CEFR {score.vocab_level}</span>}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FeedbackView({
  feedback,
  saving,
  saved,
  scoreColor,
}: {
  feedback: Feedback;
  saving: boolean;
  saved: boolean;
  scoreColor: (n: number) => string;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-4">영어 실력 채점 결과</h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-4 text-center">
          {[
            { label: "어휘", score: feedback.scoring.vocabulary_score },
            { label: "문법", score: feedback.scoring.grammar_score },
            { label: "표현", score: feedback.scoring.expression_score },
            { label: "정확도", score: feedback.scoring.accuracy_score },
            { label: "종합 점수", score: feedback.scoring.eqs },
          ].map(({ label, score }) => (
            <div key={label} className="p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-500">{label}</div>
              <div className={`text-xl sm:text-2xl font-bold ${scoreColor(score)}`}>{score}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm text-gray-500">
          CEFR 레벨: <span className="font-semibold">{feedback.scoring.vocab_level}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-3">교정 비교</h2>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1">원문</p>
            <p className="text-gray-500 leading-relaxed">
              <HighlightedOriginal
                text={feedback.corrected_text}
                mistakes={feedback.mistakes}
                isOriginal={true}
              />
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1">교정본</p>
            <p className="text-gray-700 leading-relaxed">
              <HighlightedOriginal
                text={feedback.corrected_text}
                mistakes={feedback.mistakes}
                isOriginal={false}
              />
            </p>
          </div>
        </div>
      </div>

      {feedback.mistakes.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-3">실수 상세</h2>
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
                  <span className="bg-red-100 text-red-600 px-1 rounded line-through">{m.original}</span>
                  <span className="mx-1.5 text-gray-400">→</span>
                  <span className="bg-green-100 text-green-700 px-1 rounded">{m.corrected}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{m.rule}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-3">피드백 요약</h2>
        <p className="text-gray-700">{feedback.feedback_summary}</p>
      </div>

      <div className="text-center text-sm text-gray-400">
        {saving ? "저장 중..." : saved ? "✓ DB에 저장 완료" : ""}
      </div>
    </div>
  );
}

function EntryDetail({
  entry,
  scoreColor,
  formatDate,
}: {
  entry: JournalEntry;
  scoreColor: (n: number) => string;
  formatDate: (s: string) => string;
}) {
  const score = entry.entry_scores?.[0];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{formatDate(entry.date)}</h2>
          {score && (
            <span className={`text-2xl font-bold ${scoreColor(score.eqs)}`}>
              실력 {score.eqs}점
            </span>
          )}
        </div>

        {score && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: "어휘", value: score.vocabulary_score },
              { label: "문법", value: score.grammar_score },
              { label: "표현", value: score.expression_score },
              { label: "정확도", value: score.accuracy_score },
            ].map(({ label, value }) => (
              <div key={label} className="p-2 bg-gray-50 rounded-lg text-center">
                <div className="text-xs text-gray-500">{label}</div>
                <div className={`text-lg font-bold ${scoreColor(value)}`}>{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold mb-2 text-sm text-gray-500">원문</h3>
        <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
          <DiffHighlight original={entry.original_text} corrected={entry.corrected_text || entry.original_text} mode="original" />
        </p>
      </div>

      {entry.corrected_text && (
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold mb-2 text-sm text-gray-500">교정본</h3>
          <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
            <DiffHighlight original={entry.original_text} corrected={entry.corrected_text} mode="corrected" />
          </p>
        </div>
      )}

      {entry.coach_feedback && (
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold mb-2 text-sm text-gray-500">AI 피드백</h3>
          <p className="text-gray-700">{entry.coach_feedback}</p>
        </div>
      )}

      {score?.vocab_level && (
        <div className="text-center text-sm text-gray-400">
          CEFR 레벨: {score.vocab_level}
        </div>
      )}
    </div>
  );
}

function HighlightedOriginal({
  text,
  mistakes,
  isOriginal,
}: {
  text: string;
  mistakes: Mistake[];
  isOriginal: boolean;
}) {
  if (!mistakes.length) return <>{text}</>;

  let result = text;
  const highlights: { search: string; className: string }[] = [];

  for (const m of mistakes) {
    if (isOriginal) {
      highlights.push({
        search: m.original,
        className: "bg-red-100 text-red-600 px-0.5 rounded",
      });
    } else {
      highlights.push({
        search: m.corrected,
        className: "bg-green-100 text-green-700 px-0.5 rounded",
      });
    }
  }

  const parts: { text: string; className?: string }[] = [];
  let remaining = isOriginal
    ? text.replace(new RegExp(mistakes.map(m => m.corrected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g'), (match) => {
        const mistake = mistakes.find(m => m.corrected === match);
        return mistake?.original || match;
      })
    : text;

  for (const h of highlights) {
    const idx = remaining.toLowerCase().indexOf(h.search.toLowerCase());
    if (idx === -1) continue;

    if (idx > 0) parts.push({ text: remaining.slice(0, idx) });
    parts.push({ text: remaining.slice(idx, idx + h.search.length), className: h.className });
    remaining = remaining.slice(idx + h.search.length);
  }

  if (remaining) parts.push({ text: remaining });

  if (parts.length === 0) return <>{isOriginal ? text : text}</>;

  return (
    <>
      {parts.map((p, i) =>
        p.className ? (
          <span key={i} className={p.className}>{p.text}</span>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

function DiffHighlight({
  original,
  corrected,
  mode,
}: {
  original: string;
  corrected: string;
  mode: "original" | "corrected";
}) {
  if (original === corrected) return <>{original}</>;

  const origWords = original.split(/(\s+)/);
  const corrWords = corrected.split(/(\s+)/);
  const maxLen = Math.max(origWords.length, corrWords.length);

  const parts: { text: string; changed: boolean }[] = [];

  if (mode === "original") {
    for (let i = 0; i < origWords.length; i++) {
      const changed = i < corrWords.length && origWords[i] !== corrWords[i];
      parts.push({ text: origWords[i], changed });
    }
  } else {
    for (let i = 0; i < corrWords.length; i++) {
      const changed = i < origWords.length && origWords[i] !== corrWords[i];
      const isNew = i >= origWords.length;
      parts.push({ text: corrWords[i], changed: changed || isNew });
    }
  }

  return (
    <>
      {parts.map((p, i) =>
        p.changed ? (
          <span
            key={i}
            className={
              mode === "original"
                ? "bg-red-100 text-red-600 px-0.5 rounded"
                : "bg-green-100 text-green-700 px-0.5 rounded"
            }
          >
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}
