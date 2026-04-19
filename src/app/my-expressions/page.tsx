"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface UnifiedItem {
  id: string;
  kind: "mistake" | "expression";
  title: string;
  description: string;
  example?: string;
  status: string;
  priority: number; // lower = more urgent
  usageCount?: number;
  mistakeCount?: number;
  consecutiveClean?: number;
  corrections?: {
    original: string;
    corrected: string;
    entryDate: string;
  }[];
}

const statusConfig: Record<string, { emoji: string; label: string; color: string }> = {
  // mistakes
  "mistake-active": { emoji: "🔴", label: "반복 실수", color: "bg-red-50 text-red-700" },
  "mistake-improving": { emoji: "🟡", label: "개선 중", color: "bg-yellow-50 text-yellow-700" },
  "mistake-cleared": { emoji: "🟢", label: "극복!", color: "bg-green-50 text-green-700" },
  // expressions
  "expr-unused": { emoji: "🆕", label: "미사용", color: "bg-orange-50 text-orange-700" },
  "expr-forgotten": { emoji: "❄️", label: "잊혀가는 중", color: "bg-blue-50 text-blue-700" },
  "expr-dormant": { emoji: "😴", label: "오래 안 씀", color: "bg-gray-100 text-gray-600" },
  "expr-active": { emoji: "🔥", label: "잘 사용 중", color: "bg-green-50 text-green-700" },
};

export default function MyExpressionsPage() {
  const [items, setItems] = useState<UnifiedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "attention" | "good">("all");
  const supabase = createClient();

  useEffect(() => {
    loadData();

    function handleUpdate() { loadData(); }
    window.addEventListener("expressions-updated", handleUpdate);
    return () => window.removeEventListener("expressions-updated", handleUpdate);
  }, []);

  async function loadData() {
    setLoading(true);

    const [patternsRes, expressionsRes, entriesRes] = await Promise.all([
      supabase.from("mistake_patterns").select("*").order("count", { ascending: false }),
      supabase.from("expressions").select("*").order("last_used_at", { ascending: true, nullsFirst: true }),
      supabase.from("journal_entries").select("id, date, feedback_json")
        .not("feedback_json", "is", null)
        .order("created_at", { ascending: false }).limit(20),
    ]);

    const entries = entriesRes.data || [];
    const unified: UnifiedItem[] = [];

    // Mistakes → UnifiedItem
    for (const p of patternsRes.data || []) {
      const corrections: { original: string; corrected: string; entryDate: string }[] = [];
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
              entryDate: entry.date,
            });
          }
        } catch {}
      }

      const priority =
        p.status === "active" ? 0 :
        p.status === "improving" ? 2 : 4;

      unified.push({
        id: `m-${p.id}`,
        kind: "mistake",
        title: p.pattern_name,
        description: p.rule || "",
        status: `mistake-${p.status}`,
        priority,
        mistakeCount: p.count,
        consecutiveClean: p.consecutive_clean,
        corrections,
      });
    }

    // Expressions → UnifiedItem
    for (const e of expressionsRes.data || []) {
      let status: string;
      let priority: number;

      if (e.usage_count === 0) {
        status = "expr-unused";
        priority = 1;
      } else if (e.status === "forgotten") {
        status = "expr-forgotten";
        priority = 1;
      } else if (e.status === "dormant") {
        status = "expr-dormant";
        priority = 2;
      } else {
        status = "expr-active";
        priority = 5;
      }

      unified.push({
        id: `e-${e.id}`,
        kind: "expression",
        title: e.expression,
        description: e.meaning || "",
        example: e.example_sentence || undefined,
        status,
        priority,
        usageCount: e.usage_count,
      });
    }

    unified.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
    setItems(unified);
    setLoading(false);
  }

  const attentionItems = items.filter(i => i.priority <= 2);
  const goodItems = items.filter(i => i.priority > 2);

  const displayItems =
    filter === "attention" ? attentionItems :
    filter === "good" ? goodItems : items;

  const todayPick = attentionItems.filter(i => i.kind === "expression")[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">내 표현 관리</h1>
        <div className="text-xs text-gray-400">
          {attentionItems.length}개 주의 · {goodItems.length}개 양호
        </div>
      </div>

      {/* 필터 */}
      <div className="flex gap-2">
        {[
          { key: "all" as const, label: "전체", count: items.length },
          { key: "attention" as const, label: "주의 필요", count: attentionItems.length },
          { key: "good" as const, label: "잘하고 있어요", count: goodItems.length },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === key
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "bg-white text-gray-500 border hover:bg-gray-50"
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {/* 오늘의 추천 */}
      {filter !== "good" && todayPick && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-200 p-4">
          <div className="text-xs font-medium text-blue-600 mb-1">💡 오늘 일기에 써보세요</div>
          <div className="font-semibold">{todayPick.title}</div>
          <p className="text-sm text-gray-600 mt-0.5">{todayPick.description}</p>
          {todayPick.example && (
            <p className="text-xs text-gray-400 italic mt-1">{todayPick.example}</p>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">로딩 중...</div>
      ) : displayItems.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
          {filter === "all"
            ? "아직 관리할 표현이 없어요. 일기를 쓰거나 AI 코치에게 물어보세요! 📖"
            : filter === "attention"
              ? "주의가 필요한 항목이 없어요. 잘하고 있어요! 🎉"
              : "아직 잘 관리되는 항목이 없어요. 일기를 더 써보세요!"}
        </div>
      ) : (
        <div className="space-y-3">
          {displayItems.map((item) => {
            const cfg = statusConfig[item.status] || statusConfig["expr-active"];

            return (
              <div
                key={item.id}
                className={`bg-white rounded-xl border p-4 ${
                  item.priority <= 1 ? "border-l-4 border-l-orange-400" : ""
                }`}
              >
                {/* 헤더 */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span>{cfg.emoji}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      item.kind === "mistake" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                    }`}>
                      {item.kind === "mistake" ? "실수" : "표현"}
                    </span>
                    <span className="font-semibold">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    {item.kind === "mistake" && (
                      <span className="text-xs text-gray-400">{item.mistakeCount}회</span>
                    )}
                    {item.kind === "expression" && (
                      <span className="text-xs text-gray-400">{item.usageCount}회 사용</span>
                    )}
                  </div>
                </div>

                {/* 설명 */}
                {item.description && (
                  <p className="text-sm text-gray-600 mb-2">{item.description}</p>
                )}

                {/* 예문 (표현) */}
                {item.kind === "expression" && item.example && (
                  <p className="text-xs text-gray-400 italic">{item.example}</p>
                )}

                {/* 교정 테이블 (실수) */}
                {item.kind === "mistake" && item.corrections && item.corrections.length > 0 && (
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
                        {item.corrections.map((c, i) => (
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
