"use client";

import { useState } from "react";

interface Recommendation {
  type: string;
  content: string;
  meaning: string;
  example: string;
  context: string;
  difficulty: string;
  recommendation_reason: string;
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">새 학습</h1>
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
          AI가 내 레벨과 실수 패턴에 맞는 새로운 학습 콘텐츠를 추천합니다.
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          AI가 맞춤 콘텐츠를 준비하고 있어요...
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
