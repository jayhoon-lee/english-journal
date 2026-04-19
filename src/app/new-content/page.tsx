"use client";

import { useState, useEffect } from "react";

interface Recommendation {
  type: string;
  content: string;
  meaning: string;
  example: string;
  context: string;
  difficulty: string;
  recommendation_reason: string;
}

interface HighlightWord {
  word: string;
  meaning: string;
  type: string;
  source?: "user" | "ai";
}

interface Article {
  title: string;
  content: string;
  level: string;
  topic: string;
  highlightWords: HighlightWord[];
}

const typeLabel: Record<string, string> = {
  expression: "표현",
  grammar: "문법",
  vocabulary: "어휘",
  phrasal_verb: "구동사",
};

const diffLabel: Record<string, { text: string; color: string }> = {
  easy: { text: "쉬움", color: "bg-green-50 text-green-600" },
  intermediate: { text: "중급", color: "bg-yellow-50 text-yellow-600" },
  advanced: { text: "고급", color: "bg-red-50 text-red-600" },
};

export default function NewContentPage() {
  const [tab, setTab] = useState<"expressions" | "reading">("reading");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">새 학습</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("reading")}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              tab === "reading"
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "bg-white text-gray-600 border hover:bg-gray-50"
            }`}
          >
            읽기 학습
          </button>
          <button
            onClick={() => setTab("expressions")}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              tab === "expressions"
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "bg-white text-gray-600 border hover:bg-gray-50"
            }`}
          >
            추천 표현
          </button>
        </div>
      </div>

      {tab === "reading" ? <ReadingTab /> : <ExpressionsTab />}
    </div>
  );
}

function ReadingTab() {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(false);
  const [hintMode, setHintMode] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [levelAdjust, setLevelAdjust] = useState(0);
  const [maxWords, setMaxWords] = useState(150);

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (loading) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [loading]);

  async function loadArticle(adjust?: number) {
    const newAdjust = adjust !== undefined ? adjust : levelAdjust;
    setLevelAdjust(newAdjust);
    setLoading(true);
    setError("");
    setArticle(null);
    setHintMode(false);

    const res = await fetch("/api/article", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: topic || undefined,
        levelAdjust: newAdjust,
        maxWords,
        previousTitle: article?.title || undefined,
        seed: Date.now(),
      }),
    });

    const data = await res.json();
    if (data.error) {
      setError(data.error);
    } else {
      setArticle(data.article);
    }
    setLoading(false);
  }

  function renderArticleContent(content: string, highlights: HighlightWord[]) {
    if (!hintMode) {
      return content.split("\n\n").map((para, i) => (
        <p key={i} className="mb-4 leading-relaxed">{para}</p>
      ));
    }

    return content.split("\n\n").map((para, pIdx) => {
      const sortedHighlights = [...highlights].sort((a, b) => b.word.length - a.word.length);

      // Build a combined regex to find all highlights at once
      const escapedWords = sortedHighlights.map(h =>
        h.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      );
      if (escapedWords.length === 0) {
        return <p key={pIdx} className="mb-4 leading-relaxed">{para}</p>;
      }

      const combinedRegex = new RegExp(`(${escapedWords.join("|")})`, "gi");
      const segments = para.split(combinedRegex);

      const parts: (string | { word: string; highlight: HighlightWord })[] = segments.map(seg => {
        const match = sortedHighlights.find(h => h.word.toLowerCase() === seg.toLowerCase());
        if (match) return { word: seg, highlight: match };
        return seg;
      });

      return (
        <p key={pIdx} className="mb-4 leading-relaxed">
          {parts.map((part, i) => {
            if (typeof part === "string") return <span key={i}>{part}</span>;
            const isActive = activeTooltip === `${pIdx}-${i}`;
            return (
              <span key={i} className="relative inline">
                <span
                  onClick={() => setActiveTooltip(isActive ? null : `${pIdx}-${i}`)}
                  className={`cursor-pointer px-0.5 rounded transition-colors ${
                    part.highlight.type === "mistake"
                      ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                      : part.highlight.source === "ai"
                        ? "bg-green-100 text-green-800 hover:bg-green-200"
                        : "bg-blue-100 text-blue-800 hover:bg-blue-200"
                  }`}
                >
                  {part.word}
                </span>
                {isActive && (
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 z-10 text-center">
                    <span className="font-semibold">{part.highlight.word}</span>
                    <br />
                    {part.highlight.meaning}
                    <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-gray-800 rotate-45"></span>
                  </span>
                )}
              </span>
            );
          })}
        </p>
      );
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="주제 (선택사항)"
          className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={maxWords}
          onChange={(e) => setMaxWords(Number(e.target.value))}
          className="px-2 py-2 border rounded-lg text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value={100}>짧게</option>
          <option value={150}>보통</option>
          <option value={250}>길게</option>
        </select>
        <button
          onClick={() => loadArticle()}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
        >
          {loading ? "생성 중..." : article ? "다른 글 보기" : "아티클 생성"}
        </button>
      </div>

      {!article && !loading && !error && (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-400 space-y-3">
          <div className="text-3xl">📖</div>
          <p>내 수준에 맞는 영어 아티클을 생성해드려요.</p>
          <p className="text-xs">학습 중인 표현이 자연스럽게 포함됩니다!</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {["일상", "여행", "음식", "기술", "취미"].map((t) => (
              <button
                key={t}
                onClick={() => { setTopic(t); }}
                className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-xl border p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <p className="text-sm text-gray-500">맞춤 아티클을 작성하고 있어요...</p>
            <p className="text-xs text-red-400">⚠️ 페이지를 벗어나면 아티클이 생성되지 않을 수 있어요.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {article && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">{article.title}</h2>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                    CEFR {article.level}
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    {article.topic}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setHintMode(!hintMode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  hintMode
                    ? "bg-amber-100 text-amber-700 border border-amber-200"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {hintMode ? "💡 힌트 ON" : "💡 힌트 OFF"}
              </button>
            </div>

            {/* 난이도 조절 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-2">
                <button
                  onClick={() => loadArticle(levelAdjust - 1)}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
                >
                  ▼ 더 쉽게
                </button>
                <button
                  onClick={() => loadArticle(levelAdjust)}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                  ↻ 같은 수준 재생성
                </button>
                <button
                  onClick={() => loadArticle(levelAdjust + 1)}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-medium bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 disabled:opacity-50 transition-colors"
                >
                  ▲ 더 어렵게
                </button>
              </div>
              {levelAdjust !== 0 && (
                <span className="text-[10px] text-gray-400">
                  수준 조정: {levelAdjust > 0 ? `+${levelAdjust}` : levelAdjust}
                </span>
              )}
            </div>

            <div
              className="text-gray-700 text-[15px]"
              data-coach-context={`아티클 제목: ${article.title}\n아티클 내용:\n${article.content}`}
            >
              {renderArticleContent(article.content, article.highlightWords)}
            </div>
          </div>

          {hintMode && article.highlightWords.length > 0 && (
            <div className="bg-white rounded-xl border p-5 space-y-4">
              {/* 내가 관리하는 표현 */}
              {article.highlightWords.filter(h => h.source === "user" || h.type === "mistake").length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-blue-600 mb-2">📚 내가 관리하는 표현</h3>
                  <div className="space-y-1.5">
                    {article.highlightWords
                      .filter(h => h.source === "user" || h.type === "mistake")
                      .map((h, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <span className={`shrink-0 text-[10px] w-4 h-4 flex items-center justify-center rounded font-mono font-medium ${
                            h.type === "mistake" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                          }`}>
                            {i + 1}
                          </span>
                          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            h.type === "mistake"
                              ? "bg-red-50 text-red-600"
                              : "bg-blue-50 text-blue-600"
                          }`}>
                            {h.type === "mistake" ? "실수" : "표현"}
                          </span>
                          <span className="font-medium">{h.word}</span>
                          <span className="text-gray-400">—</span>
                          <span className="text-gray-600">{h.meaning}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* AI 제안 표현 */}
              {article.highlightWords.filter(h => h.source === "ai" && h.type !== "mistake").length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-green-600 mb-2">🆕 AI 추천 새 표현</h3>
                  <div className="space-y-1.5">
                    {article.highlightWords
                      .filter(h => h.source === "ai" && h.type !== "mistake")
                      .map((h, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <span className="shrink-0 text-[10px] w-4 h-4 flex items-center justify-center rounded font-mono font-medium bg-green-50 text-green-600">
                            {i + 1}
                          </span>
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-50 text-green-600">
                            새표현
                          </span>
                          <span className="font-medium">{h.word}</span>
                          <span className="text-gray-400">—</span>
                          <span className="text-gray-600">{h.meaning}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExpressionsTab() {
  const [items, setItems] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());

  async function loadRecommendations() {
    setLoading(true);
    const res = await fetch("/api/new-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.recommendations) {
      setItems(data.recommendations);
    }
    setLoading(false);
  }

  async function saveToExpressions(item: Recommendation) {
    await fetch("/api/new-content/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: item.content,
        meaning: item.meaning,
        example: item.example,
      }),
    });
    setSavedSet((prev) => new Set(prev).add(item.content));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={loadRecommendations}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "추천 생성 중..." : items.length > 0 ? "다음 추천 받기" : "추천 받기"}
        </button>
      </div>

      {items.length === 0 && !loading && (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
          내 레벨과 실수 패턴에 맞는 표현을 추천해드려요. 추천 받기를 눌러보세요 🆕
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          맞춤 콘텐츠를 준비하고 있어요... 잠시만 기다려주세요 ⏳
        </div>
      )}

      <div className="space-y-4">
        {items.map((item) => {
          const diff = diffLabel[item.difficulty] || diffLabel.intermediate;
          const isSaved = savedSet.has(item.content);

          return (
            <div key={item.content} className="bg-white rounded-xl border p-6 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full font-medium">
                  {typeLabel[item.type] || item.type}
                </span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${diff.color}`}>
                  {diff.text}
                </span>
              </div>

              <div>
                <h3 className="text-xl font-bold">{item.content}</h3>
                <p className="text-gray-600 mt-1">{item.meaning}</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-500 mb-1">예문</p>
                <p className="text-gray-700 italic">{item.example}</p>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-1">사용 상황</p>
                <p className="text-sm text-gray-700">{item.context}</p>
              </div>

              <div className="text-xs text-gray-400">💡 {item.recommendation_reason}</div>

              <button
                onClick={() => saveToExpressions(item)}
                disabled={isSaved}
                className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                  isSaved
                    ? "bg-green-50 text-green-600 border border-green-200"
                    : "bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100"
                }`}
              >
                {isSaved ? "✓ 내 목록에 추가됨" : "내 목록에 추가"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
