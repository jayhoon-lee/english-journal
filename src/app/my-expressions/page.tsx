"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import YouGlishModal from "@/components/YouGlishModal";

interface ExampleItem {
  text: string;
  translation?: string;
}

interface UnifiedItem {
  id: string;
  realId: string;
  kind: "mistake" | "expression";
  title: string;
  description: string;
  examples?: ExampleItem[];
  rawExampleSentence?: string;
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

function parseExamples(raw: string | null | undefined): ExampleItem[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        return arr
          .map((entry): ExampleItem | null => {
            if (typeof entry === "string" && entry.trim()) return { text: entry.trim() };
            if (entry && typeof entry === "object" && typeof entry.text === "string" && entry.text.trim()) {
              return {
                text: entry.text.trim(),
                translation: typeof entry.translation === "string" ? entry.translation : undefined,
              };
            }
            return null;
          })
          .filter((e): e is ExampleItem => e !== null);
      }
    } catch {}
  }
  return [{ text: trimmed }];
}

function serializeExamples(examples: ExampleItem[]): string {
  return JSON.stringify(
    examples
      .filter((e) => e.text.trim().length > 0)
      .map((e) => (e.translation ? { text: e.text, translation: e.translation } : { text: e.text }))
  );
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
  const [tab, setTab] = useState<"expressions" | "mistakes">("expressions");
  const [youglishQuery, setYouglishQuery] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newExample, setNewExample] = useState("");
  const [savingExample, setSavingExample] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<{
    status: "ok" | "needs_fix" | "rejected";
    issues?: string[];
    corrected?: string;
    explanation?: string;
  } | null>(null);
  const supabase = createClient();

  const [translating, setTranslating] = useState<string | null>(null);
  const [pressedKey, setPressedKey] = useState<string | null>(null);

  async function persistExample(item: UnifiedItem, text: string) {
    setSavingExample(true);
    const updated: ExampleItem[] = [...(item.examples || []), { text }];
    await supabase
      .from("expressions")
      .update({ example_sentence: serializeExamples(updated) })
      .eq("id", item.realId);
    setNewExample("");
    setAddingFor(null);
    setReviewResult(null);
    setSavingExample(false);
    loadData();
  }

  async function pressTranslation(item: UnifiedItem, exIdx: number) {
    const key = `${item.realId}-${exIdx}`;
    const example = item.examples?.[exIdx];
    if (!example) return;

    setPressedKey(key);

    if (example.translation) return;

    setTranslating(key);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: example.text }),
      });
      const data = await res.json();
      if (data.error || !data.translation) return;

      const updated = [...(item.examples || [])];
      updated[exIdx] = { ...updated[exIdx], translation: data.translation };
      await supabase
        .from("expressions")
        .update({ example_sentence: serializeExamples(updated) })
        .eq("id", item.realId);

      loadData();
    } catch {
    } finally {
      setTranslating(null);
    }
  }

  function releaseTranslation() {
    setPressedKey(null);
  }

  async function reviewAndAddExample(item: UnifiedItem) {
    const text = newExample.trim();
    if (!text) return;
    setReviewing(true);
    setReviewResult(null);
    try {
      const res = await fetch("/api/expressions/validate-example", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expression: item.title,
          meaning: item.description,
          example: text,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setReviewResult({ status: "needs_fix", issues: [data.error], explanation: "" });
        return;
      }
      if (data.status === "ok") {
        await persistExample(item, text);
        return;
      }
      setReviewResult(data);
    } catch (e) {
      setReviewResult({
        status: "needs_fix",
        issues: [e instanceof Error ? e.message : "검토 중 오류가 발생했어요."],
      });
    } finally {
      setReviewing(false);
    }
  }

  function applyCorrected(corrected: string) {
    setNewExample(corrected);
    setReviewResult(null);
  }

  function cancelAdd() {
    setAddingFor(null);
    setNewExample("");
    setReviewResult(null);
  }

  async function deleteExample(item: UnifiedItem, idx: number) {
    if (!confirm("이 예문을 삭제할까요?")) return;
    const updated = (item.examples || []).filter((_, i) => i !== idx);
    await supabase
      .from("expressions")
      .update({ example_sentence: updated.length ? serializeExamples(updated) : null })
      .eq("id", item.realId);
    loadData();
  }

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
        examples: parseExamples(e.example_sentence),
        rawExampleSentence: e.example_sentence || undefined,
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

  const mistakes = items.filter(i => i.kind === "mistake").sort((a, b) => a.score - b.score);
  const expressions = items.filter(i => i.kind === "expression").sort((a, b) => a.score - b.score);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">내 표현 관리</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("expressions")}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              tab === "expressions"
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "bg-white text-gray-600 border hover:bg-gray-50"
            }`}
          >
            📚 표현 ({expressions.length})
          </button>
          <button
            onClick={() => setTab("mistakes")}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              tab === "mistakes"
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-white text-gray-600 border hover:bg-gray-50"
            }`}
          >
            🔴 실수 ({mistakes.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">로딩 중...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
          아직 관리할 항목이 없어요. 일기를 쓰거나 AI 코치에게 물어보세요! 📖
        </div>
      ) : (
        <div
          className="space-y-2"
          data-coach-context={`내 표현 관리 현황:\n${items.slice(0, 10).map(i => `${i.kind === "mistake" ? "실수" : "표현"}: ${i.title} (점수: ${i.score}) ${i.description}`).join("\n")}`}
        >
          {/* 실수 탭 */}
          {tab === "mistakes" && (
            <>
            {mistakes.length === 0 ? (
              <p className="text-xs text-gray-400 bg-white rounded-lg border p-4 text-center">실수가 없어요. 잘하고 있어요! 🎉</p>
            ) : (
              <div className="space-y-2">
                {mistakes.map((item, idx) => (
                  <div key={item.id} className="bg-white rounded-xl border p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] w-5 h-5 flex items-center justify-center rounded font-mono font-medium bg-red-50 text-red-600">
                          {idx + 1}
                        </span>
                        <span className="font-semibold">{item.title}</span>
                      </div>
                      <span className={`text-sm font-bold ${
                        item.score > 0 ? "text-green-600" : item.score < 0 ? "text-red-600" : "text-gray-400"
                      }`}>
                        {item.score > 0 ? `+${item.score}` : item.score}
                      </span>
                    </div>
                    {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
                    {item.corrections && item.corrections.length > 0 && (
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
                ))}
              </div>
            )}
            </>
          )}

          {/* 표현 탭 */}
          {tab === "expressions" && (
            <>
            {expressions.length === 0 ? (
              <p className="text-xs text-gray-400 bg-white rounded-lg border p-4 text-center">아직 표현이 없어요. AI 코치에게 물어보거나 일기를 써보세요! 📖</p>
            ) : (
              <div className="space-y-2">
                {expressions.map((item, idx) => (
                  <div key={item.id} className="bg-white rounded-xl border p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] w-5 h-5 flex items-center justify-center rounded font-mono font-medium bg-blue-50 text-blue-600">
                          {idx + 1}
                        </span>
                        <button
                          onClick={() => setYouglishQuery(item.title)}
                          className="font-semibold hover:text-blue-600 hover:underline text-left"
                          title="YouTube에서 이 표현이 쓰이는 영상 보기"
                        >
                          {item.title}
                          <span className="ml-1 text-xs">▶</span>
                        </button>
                      </div>
                      <span className={`text-sm font-bold ${
                        item.score > 0 ? "text-green-600" : item.score < 0 ? "text-red-600" : "text-gray-400"
                      }`}>
                        {item.score > 0 ? `+${item.score}` : item.score}
                      </span>
                    </div>
                    {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
                    {item.examples && item.examples.length > 0 && (
                      <ul className="mt-1 space-y-1">
                        {item.examples.map((ex, exIdx) => {
                          const key = `${item.realId}-${exIdx}`;
                          const isTranslating = translating === key;
                          const isPressed = pressedKey === key;
                          return (
                            <li key={exIdx} className="group">
                              <div className="flex items-start gap-1 text-xs text-gray-500 italic">
                                <span className="text-gray-300 not-italic">·</span>
                                <span className="flex-1">
                                  <span>{ex.text}</span>
                                  <button
                                    onPointerDown={(e) => { e.preventDefault(); pressTranslation(item, exIdx); }}
                                    onPointerUp={releaseTranslation}
                                    onPointerLeave={releaseTranslation}
                                    onPointerCancel={releaseTranslation}
                                    onContextMenu={(e) => e.preventDefault()}
                                    className="ml-1 align-middle text-[10px] px-1.5 py-0.5 rounded border border-gray-200 bg-white text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 active:bg-blue-100 not-italic transition-colors select-none whitespace-nowrap"
                                    title="누르고 있으면 한국어 번역이 보여요"
                                  >
                                    {isTranslating ? "..." : "🇰🇷"}
                                  </button>
                                </span>
                                <button
                                  onClick={() => deleteExample(item, exIdx)}
                                  className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-300 hover:text-red-500 not-italic transition-opacity"
                                  title="예문 삭제"
                                >
                                  ✕
                                </button>
                              </div>
                              {isPressed && ex.translation && (
                                <p className="ml-3 mt-0.5 text-xs text-gray-600 not-italic">
                                  <span className="text-gray-300 mr-1">→</span>
                                  {ex.translation}
                                </p>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {addingFor === item.realId ? (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex gap-1.5">
                          <input
                            autoFocus
                            type="text"
                            value={newExample}
                            onChange={(e) => { setNewExample(e.target.value); if (reviewResult) setReviewResult(null); }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !reviewing && !savingExample) reviewAndAddExample(item);
                              if (e.key === "Escape") cancelAdd();
                            }}
                            disabled={reviewing || savingExample}
                            placeholder={`"${item.title}"이 들어간 영어 예문...`}
                            className="flex-1 text-xs px-2 py-1 border rounded focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50"
                          />
                          <button
                            onClick={() => reviewAndAddExample(item)}
                            disabled={reviewing || savingExample || !newExample.trim()}
                            className="text-xs px-2.5 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                          >
                            {reviewing ? "검토 중..." : savingExample ? "저장 중..." : "AI 검토 후 저장"}
                          </button>
                          <button
                            onClick={cancelAdd}
                            disabled={reviewing || savingExample}
                            className="text-xs px-2 py-1 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                          >
                            취소
                          </button>
                        </div>

                        {reviewResult && reviewResult.status === "needs_fix" && (
                          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-amber-700 font-semibold">⚠️ AI 코치 피드백</span>
                            </div>
                            {reviewResult.issues && reviewResult.issues.length > 0 && (
                              <ul className="list-disc list-inside text-amber-800 space-y-0.5">
                                {reviewResult.issues.map((iss, i) => <li key={i}>{iss}</li>)}
                              </ul>
                            )}
                            {reviewResult.explanation && (
                              <p className="text-amber-700/80 italic">{reviewResult.explanation}</p>
                            )}
                            {reviewResult.corrected && (
                              <div className="mt-1.5 p-2 bg-white rounded border border-amber-100">
                                <p className="text-[10px] uppercase font-semibold text-green-700 mb-1">✓ 수정 제안</p>
                                <p className="text-gray-800">{reviewResult.corrected}</p>
                                <div className="flex gap-1.5 mt-1.5">
                                  <button
                                    onClick={() => applyCorrected(reviewResult.corrected!)}
                                    className="text-[11px] px-2 py-0.5 rounded bg-green-500 text-white hover:bg-green-600"
                                  >
                                    이 문장으로 바꾸기
                                  </button>
                                  <button
                                    onClick={() => persistExample(item, reviewResult.corrected!)}
                                    disabled={savingExample}
                                    className="text-[11px] px-2 py-0.5 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                                  >
                                    수정본 바로 저장
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {reviewResult && reviewResult.status === "rejected" && (
                          <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-red-700 font-semibold">❌ 저장할 수 없어요</span>
                            </div>
                            {reviewResult.issues && reviewResult.issues.length > 0 && (
                              <ul className="list-disc list-inside text-red-700 space-y-0.5">
                                {reviewResult.issues.map((iss, i) => <li key={i}>{iss}</li>)}
                              </ul>
                            )}
                            {reviewResult.explanation && (
                              <p className="text-red-700/80 italic mt-1">{reviewResult.explanation}</p>
                            )}
                            <p className="text-red-600 mt-1.5">예문을 다시 작성해주세요.</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingFor(item.realId); setNewExample(""); setReviewResult(null); }}
                        className="mt-1.5 text-[11px] text-blue-500 hover:text-blue-700 hover:underline"
                      >
                        + 예문 추가
                      </button>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        {item.sourceType && item.sourceType !== "unknown" && (
                          <span className="text-[10px] text-gray-400">
                            {sourceLabel[item.sourceType]?.emoji} {sourceLabel[item.sourceType]?.label}
                            {item.sourceDate && ` · ${new Date(item.sourceDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}`}
                          </span>
                        )}
                        {item.sourceEntryId && (
                          <a href={`/journal?tab=history&highlight=${encodeURIComponent(item.title)}`} className="text-[10px] text-blue-500 hover:underline">
                            원문 보기 →
                          </a>
                        )}
                        {item.sourceArticleId && (
                          <a href={`/new-content?articleId=${item.sourceArticleId}&highlight=${encodeURIComponent(item.title)}`} className="text-[10px] text-blue-500 hover:underline">
                            아티클 보기 →
                          </a>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          if (!confirm(`"${item.title}" 표현을 삭제할까요?`)) return;
                          await supabase.from("expressions").delete().eq("id", item.realId);
                          loadData();
                        }}
                        className="text-xs px-2.5 py-1 rounded-md bg-red-50 text-red-600 border border-red-200 hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors font-medium"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </>
          )}
        </div>
      )}

      <YouGlishModal query={youglishQuery} onClose={() => setYouglishQuery(null)} />
    </div>
  );
}
