"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface UnifiedItem {
  id: string;
  realId: string;
  kind: "mistake" | "expression";
  title: string;
  description: string;
  example?: string;
  score: number;
  sourceType?: string;
  sourceEntryId?: string;
  sourceArticleId?: string;
  sourceDate?: string;
  corrections?: {
    original: string;
    corrected: string;
    entryDate: string;
  }[];
}

const sourceLabel: Record<string, { label: string; emoji: string }> = {
  journal: { label: "일기", emoji: "✏️" },
  coach: { label: "AI 코치", emoji: "🧑‍🏫" },
  article: { label: "아티클", emoji: "📖" },
  "new-content": { label: "추천 표현", emoji: "🆕" },
  unknown: { label: "", emoji: "" },
};

export default function MyExpressionsPage() {
  const [items, setItems] = useState<UnifiedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "negative" | "positive">("all");
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
      supabase.from("expressions").select("*, source_type, source_entry_id, source_article_id").order("last_used_at", { ascending: true, nullsFirst: true }),
      supabase.from("journal_entries").select("id, date, feedback_json")
        .not("feedback_json", "is", null)
        .order("created_at", { ascending: false }).limit(20),
    ]);

    const entries = entriesRes.data || [];
    const unified: UnifiedItem[] = [];

    for (const p of patternsRes.data || []) {
      const corrections: { original: string; corrected: string; entryDate: string }[] = [];
      for (const entry of entries) {
        try {
          const fb = JSON.parse(entry.feedback_json);
          const matches = (fb.mistakes || []).filter(
            (m: { pattern_name: string }) => m.pattern_name === p.pattern_name
          );
          for (const match of matches) {
            corrections.push({ original: match.original, corrected: match.corrected, entryDate: entry.date });
          }
        } catch {}
      }

      // 실수: score = consecutive_clean - count (클린 많으면 +, 실수 많으면 -)
      const score = (p.consecutive_clean || 0) - (p.count || 0);

      unified.push({
        id: `m-${p.id}`,
        realId: p.id,
        kind: "mistake",
        title: p.pattern_name,
        description: p.rule || "",
        score,
        corrections,
      });
    }

    for (const e of expressionsRes.data || []) {
      // 표현: score = usage_count (많이 쓰면 +, 안 쓰면 0 또는 -)
      const score = e.usage_count || 0;

      // 출처 날짜 찾기
      let sourceDate: string | undefined;
      if (e.source_entry_id) {
        const entry = entries.find((en) => en.id === e.source_entry_id);
        if (entry) sourceDate = entry.date;
      }

      unified.push({
        id: `e-${e.id}`,
        realId: e.id,
        kind: "expression",
        title: e.expression,
        description: e.meaning || "",
        example: e.example_sentence || undefined,
        score,
        sourceType: e.source_type || "unknown",
        sourceEntryId: e.source_entry_id || undefined,
        sourceArticleId: e.source_article_id || undefined,
        sourceDate,
      });
    }

    unified.sort((a, b) => a.score - b.score);
    setItems(unified);
    setLoading(false);
  }

  const negativeItems = items.filter(i => i.score <= 0);
  const positiveItems = items.filter(i => i.score > 0);

  const displayItems =
    filter === "negative" ? negativeItems :
    filter === "positive" ? positiveItems : items;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">내 표현 관리</h1>
        <div className="text-xs text-gray-400">
          총 {items.length}개
        </div>
      </div>

      <div className="flex gap-2">
        {[
          { key: "all" as const, label: "전체", count: items.length },
          { key: "negative" as const, label: "집중 필요", count: negativeItems.length },
          { key: "positive" as const, label: "잘하고 있어요", count: positiveItems.length },
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

      {loading ? (
        <div className="text-center py-12 text-gray-400">로딩 중...</div>
      ) : displayItems.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
          {filter === "all"
            ? "아직 관리할 표현이 없어요. 일기를 쓰거나 AI 코치에게 물어보세요! 📖"
            : filter === "negative"
              ? "집중이 필요한 항목이 없어요. 잘하고 있어요! 🎉"
              : "아직 잘 관리되는 항목이 없어요. 일기를 더 써보세요!"}
        </div>
      ) : (
        <div
          className="space-y-2"
          data-coach-context={`내 표현 관리 현황:\n${displayItems.slice(0, 10).map(i => `${i.kind === "mistake" ? "실수" : "표현"}: ${i.title} (점수: ${i.score}) ${i.description}`).join("\n")}`}
        >
          {(() => {
            let mistakeIdx = 0;
            let exprIdx = 0;
            return displayItems.map((item) => {
              const idx = item.kind === "mistake" ? ++mistakeIdx : ++exprIdx;
              return (
            <div
              key={item.id}
              className="bg-white rounded-xl border p-4"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] w-5 h-5 flex items-center justify-center rounded font-mono font-medium ${
                    item.kind === "mistake" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                  }`}>
                    {idx}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    item.kind === "mistake" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                  }`}>
                    {item.kind === "mistake" ? "실수" : "표현"}
                  </span>
                  <span className="font-semibold">{item.title}</span>
                </div>
                <span className={`text-sm font-bold ${
                  item.score > 0 ? "text-green-600" : item.score < 0 ? "text-red-600" : "text-gray-400"
                }`}>
                  {item.score > 0 ? `+${item.score}` : item.score}
                </span>
              </div>

              {item.description && (
                <p className="text-xs text-gray-500">{item.description}</p>
              )}

              {item.kind === "expression" && item.example && (
                <p className="text-xs text-gray-400 italic mt-1">{item.example}</p>
              )}

              {/* 출처 + 삭제 */}
              {item.kind === "expression" && (
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    {item.sourceType && item.sourceType !== "unknown" && (
                      <span className="text-[10px] text-gray-400">
                        {sourceLabel[item.sourceType]?.emoji} {sourceLabel[item.sourceType]?.label}
                        {item.sourceDate && ` · ${new Date(item.sourceDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}`}
                      </span>
                    )}
                    {item.sourceEntryId && (
                      <a
                        href={`/journal?tab=history&highlight=${encodeURIComponent(item.title)}`}
                        className="text-[10px] text-blue-500 hover:underline"
                      >
                        원문 보기 →
                      </a>
                    )}
                    {item.sourceArticleId && (
                      <a
                        href={`/new-content?articleId=${item.sourceArticleId}&highlight=${encodeURIComponent(item.title)}`}
                        className="text-[10px] text-blue-500 hover:underline"
                      >
                        아티클 보기 →
                      </a>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      await supabase.from("expressions").delete().eq("id", item.realId);
                      loadData();
                    }}
                    className="text-[10px] text-gray-300 hover:text-red-500 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              )}

              {item.kind === "mistake" && item.corrections && item.corrections.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-1 pr-2 text-gray-400 font-medium">내가 쓴 표현</th>
                        <th className="text-left py-1 pr-2 text-gray-400 font-medium">올바른 표현</th>
                        <th className="text-left py-1 text-gray-400 font-medium">일기</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.corrections.map((c, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-1 pr-2">
                            <span className="bg-red-100 text-red-600 px-1 rounded">{c.original}</span>
                          </td>
                          <td className="py-1 pr-2">
                            <span className="bg-green-100 text-green-700 px-1 rounded">{c.corrected}</span>
                          </td>
                          <td className="py-1">
                            <a href="/journal?tab=history" className="text-blue-500 hover:underline whitespace-nowrap">
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
            });
          })()}
        </div>
      )}
    </div>
  );
}
