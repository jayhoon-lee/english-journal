"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface MistakePattern {
  id: string;
  pattern_name: string;
  rule: string;
  count: number;
  consecutive_clean: number;
  status: string;
  examples: string[];
  last_seen_at: string;
}

interface Expression {
  id: string;
  expression: string;
  meaning: string;
  example_sentence: string;
  usage_count: number;
  last_used_at: string;
  status: string;
}

const statusBadge: Record<string, { emoji: string; label: string; color: string }> = {
  active: { emoji: "🔴", label: "Active", color: "bg-red-50 text-red-700" },
  improving: { emoji: "🟡", label: "Improving", color: "bg-yellow-50 text-yellow-700" },
  cleared: { emoji: "🟢", label: "Cleared", color: "bg-green-50 text-green-700" },
};

const exprStatusBadge: Record<string, { emoji: string; label: string; color: string }> = {
  active: { emoji: "🔥", label: "Active", color: "bg-orange-50 text-orange-700" },
  dormant: { emoji: "😴", label: "Dormant", color: "bg-gray-50 text-gray-600" },
  forgotten: { emoji: "❄️", label: "Forgotten", color: "bg-blue-50 text-blue-700" },
};

export default function MyExpressionsPage() {
  const [tab, setTab] = useState<"watch" | "keep">("watch");
  const [patterns, setPatterns] = useState<MistakePattern[]>([]);
  const [expressions, setExpressions] = useState<Expression[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const [patternsRes, expressionsRes] = await Promise.all([
      supabase
        .from("mistake_patterns")
        .select("*")
        .order("count", { ascending: false }),
      supabase
        .from("expressions")
        .select("*")
        .order("last_used_at", { ascending: true, nullsFirst: true }),
    ]);

    setPatterns(patternsRes.data || []);
    setExpressions(expressionsRes.data || []);
    setLoading(false);
  }

  const dormantOrForgotten = expressions.filter(
    (e) => e.status === "dormant" || e.status === "forgotten"
  );
  const todayPick = dormantOrForgotten.length > 0
    ? dormantOrForgotten[Math.floor(Math.random() * dormantOrForgotten.length)]
    : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">내 표현 관리</h1>

      {/* 탭 */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("watch")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            tab === "watch"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-white text-gray-600 border hover:bg-gray-50"
          }`}
        >
          Watch List (주의 목록)
        </button>
        <button
          onClick={() => setTab("keep")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            tab === "keep"
              ? "bg-blue-50 text-blue-700 border border-blue-200"
              : "bg-white text-gray-600 border hover:bg-gray-50"
          }`}
        >
          Keep List (유지 목록)
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">로딩 중...</div>
      ) : tab === "watch" ? (
        <div className="space-y-3">
          {patterns.length === 0 ? (
            <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
              아직 기록된 실수 패턴이 없습니다. 일기를 작성해보세요!
            </div>
          ) : (
            patterns.map((p) => {
              const badge = statusBadge[p.status] || statusBadge.active;
              return (
                <div key={p.id} className="bg-white rounded-xl border p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{badge.emoji}</span>
                      <span className="font-semibold">{p.pattern_name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                        {badge.label}
                      </span>
                      <span className="text-gray-400">실수 {p.count}회</span>
                      <span className="text-gray-400">연속클린 {p.consecutive_clean}회</span>
                    </div>
                  </div>
                  {p.rule && <p className="text-sm text-gray-600 mb-2">{p.rule}</p>}
                  {p.examples?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {p.examples.slice(-3).map((ex, i) => (
                        <span key={i} className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">
                          {ex}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* 오늘의 추천 표현 */}
          {todayPick && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-200 p-5">
              <div className="text-sm font-medium text-blue-600 mb-1">💡 오늘의 추천 표현</div>
              <div className="font-semibold text-lg">{todayPick.expression}</div>
              {todayPick.meaning && (
                <p className="text-sm text-gray-600 mt-1">{todayPick.meaning}</p>
              )}
              <p className="text-xs text-gray-400 mt-2">
                사용 횟수: {todayPick.usage_count}회 · 오늘 일기에 써보세요!
              </p>
            </div>
          )}

          {/* 표현 목록 */}
          {expressions.length === 0 ? (
            <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
              아직 학습 중인 표현이 없습니다. 일기를 쓰거나 새 학습에서 추가하세요!
            </div>
          ) : (
            expressions.map((e) => {
              const badge = exprStatusBadge[e.status] || exprStatusBadge.active;
              return (
                <div key={e.id} className="bg-white rounded-xl border p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span>{badge.emoji}</span>
                      <span className="font-semibold">{e.expression}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                        {badge.label}
                      </span>
                      <span className="text-gray-400">{e.usage_count}회 사용</span>
                    </div>
                  </div>
                  {e.meaning && <p className="text-sm text-gray-600">{e.meaning}</p>}
                  {e.example_sentence && (
                    <p className="text-sm text-gray-400 italic mt-1">{e.example_sentence}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
