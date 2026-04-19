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
  corrections: {
    original: string;
    corrected: string;
    entryId: string;
    entryDate: string;
  }[];
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

    function handleUpdate() {
      loadData();
    }
    window.addEventListener("expressions-updated", handleUpdate);
    return () => window.removeEventListener("expressions-updated", handleUpdate);
  }, []);

  async function loadData() {
    setLoading(true);

    const [patternsRes, expressionsRes, entriesRes] = await Promise.all([
      supabase
        .from("mistake_patterns")
        .select("*")
        .order("count", { ascending: false }),
      supabase
        .from("expressions")
        .select("*")
        .order("last_used_at", { ascending: true, nullsFirst: true }),
      supabase
        .from("journal_entries")
        .select("id, date, feedback_json")
        .not("feedback_json", "is", null)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    // 패턴에 교정 정보 + 일기 링크 매칭
    const entries = entriesRes.data || [];
    const patternsWithDetails = (patternsRes.data || []).map((p: MistakePattern) => {
      const corrections: { original: string; corrected: string; entryId: string; entryDate: string }[] = [];

      for (const entry of entries) {
        try {
          const fb = JSON.parse(entry.feedback_json);
          const matches = (fb.mistakes || []).filter(
            (m: { pattern_name: string }) => m.pattern_name === p.pattern_name
          );
          for (const match of matches) {
            corrections.push({
              original: match.original,
              corrected: match.corrected,
              entryId: entry.id,
              entryDate: entry.date,
            });
          }
        } catch {}
      }

      return { ...p, corrections };
    });
    setPatterns(patternsWithDetails);

    const exprs = expressionsRes.data || [];
    exprs.sort((a, b) => {
      const priorityOrder: Record<string, number> = { forgotten: 0, dormant: 1, active: 2 };
      const aPriority = a.usage_count === 0 ? -1 : (priorityOrder[a.status] ?? 2);
      const bPriority = b.usage_count === 0 ? -1 : (priorityOrder[b.status] ?? 2);
      if (aPriority !== bPriority) return aPriority - bPriority;
      return (a.usage_count || 0) - (b.usage_count || 0);
    });
    setExpressions(exprs);
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
      <h1 className="text-xl sm:text-2xl font-bold">내 표현 관리</h1>

      {/* 탭 */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("watch")}
          className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
            tab === "watch"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-white text-gray-600 border hover:bg-gray-50"
          }`}
        >
          Watch List
        </button>
        <button
          onClick={() => setTab("keep")}
          className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
            tab === "keep"
              ? "bg-blue-50 text-blue-700 border border-blue-200"
              : "bg-white text-gray-600 border hover:bg-gray-50"
          }`}
        >
          Keep List
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">로딩 중...</div>
      ) : tab === "watch" ? (
        <div className="space-y-3">
          {patterns.length === 0 ? (
            <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
              아직 기록된 실수 패턴이 없어요. 일기를 작성하면 자동으로 분석됩니다 💪
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
                    <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                        {badge.label}
                      </span>
                      <span className="text-gray-400">실수 {p.count}회</span>
                      <span className="text-gray-400">클린 {p.consecutive_clean}</span>
                    </div>
                  </div>
                  {p.rule && <p className="text-sm text-gray-600 mb-2">{p.rule}</p>}

                  {p.corrections.length > 0 && (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-1.5 pr-2 text-gray-400 font-medium">내가 쓴 표현</th>
                            <th className="text-left py-1.5 pr-2 text-gray-400 font-medium">올바른 표현</th>
                            <th className="text-left py-1.5 text-gray-400 font-medium">일기</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.corrections.map((c, i) => (
                            <tr key={i} className="border-b border-gray-50">
                              <td className="py-1.5 pr-2">
                                <span className="bg-red-100 text-red-600 px-1 rounded">{c.original}</span>
                              </td>
                              <td className="py-1.5 pr-2">
                                <span className="bg-green-100 text-green-700 px-1 rounded">{c.corrected}</span>
                              </td>
                              <td className="py-1.5">
                                <a
                                  href="/journal?tab=history"
                                  className="text-blue-500 hover:underline whitespace-nowrap"
                                >
                                  {new Date(c.entryDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })} →
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {p.corrections.length === 0 && p.examples?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
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
              아직 학습 중인 표현이 없어요. 새 학습 탭에서 추가해보세요 📖
            </div>
          ) : (
            expressions.map((e, idx) => {
              const badge = exprStatusBadge[e.status] || exprStatusBadge.active;
              const needsPractice = e.usage_count === 0;
              const prevExpr = idx > 0 ? expressions[idx - 1] : null;
              const showDivider = idx > 0 && (prevExpr?.usage_count === 0) !== needsPractice;

              return (
                <div key={e.id}>
                  {showDivider && (
                    <div className="flex items-center gap-2 my-3">
                      <div className="flex-1 border-t border-gray-200" />
                      <span className="text-[10px] text-gray-400">사용한 적 있는 표현</span>
                      <div className="flex-1 border-t border-gray-200" />
                    </div>
                  )}
                <div className={`bg-white rounded-xl border p-5 ${needsPractice ? "border-l-4 border-l-orange-400" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {needsPractice && <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-medium">미사용</span>}
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
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
