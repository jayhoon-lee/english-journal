import { createClient } from "@/lib/supabase/server";
import { saveExpressionDeduped } from "@/lib/expression-utils";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { originalText, feedback } = await request.json();

  // 1. journal_entries 저장
  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .insert({
      user_id: user.id,
      original_text: originalText,
      corrected_text: feedback.corrected_text,
      coach_feedback: feedback.feedback_summary,
      feedback_json: JSON.stringify(feedback),
    })
    .select()
    .single();

  if (entryError) {
    return NextResponse.json({ error: entryError.message }, { status: 500 });
  }

  // 2. entry_scores 저장 (종합 점수는 서버에서 직접 계산)
  const v = feedback.scoring.vocabulary_score || 0;
  const g = feedback.scoring.grammar_score || 0;
  const e = feedback.scoring.expression_score || 0;
  const a = feedback.scoring.accuracy_score || 0;
  const calculatedEqs = Math.round((v + g + e + a) / 4);

  await supabase.from("entry_scores").insert({
    user_id: user.id,
    entry_id: entry.id,
    vocabulary_score: v,
    grammar_score: g,
    expression_score: e,
    accuracy_score: a,
    eqs: calculatedEqs,
    vocab_level: feedback.scoring.vocab_level,
  });

  // 3. mistake_patterns 업데이트
  for (const mistake of feedback.mistakes || []) {
    const { data: existing } = await supabase
      .from("mistake_patterns")
      .select("id, count, examples")
      .eq("user_id", user.id)
      .eq("pattern_name", mistake.pattern_name)
      .single();

    if (existing) {
      await supabase
        .from("mistake_patterns")
        .update({
          count: existing.count + 1,
          consecutive_clean: 0,
          status: "active",
          examples: [...(existing.examples || []), mistake.original].slice(-5),
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("mistake_patterns").insert({
        user_id: user.id,
        pattern_name: mistake.pattern_name,
        rule: mistake.rule,
        count: 1,
        examples: [mistake.original],
      });
    }
  }

  // 4. 실수 없는 패턴들 consecutive_clean +1
  const mistakeNames = (feedback.mistakes || []).map(
    (m: { pattern_name: string }) => m.pattern_name
  );

  const { data: cleanPatterns } = await supabase
    .from("mistake_patterns")
    .select("id, consecutive_clean")
    .eq("user_id", user.id)
    .not("pattern_name", "in", `(${mistakeNames.map((n: string) => `"${n}"`).join(",")})`)
    .neq("status", "cleared");

  for (const pattern of cleanPatterns || []) {
    const newClean = pattern.consecutive_clean + 1;
    let status = "active";
    if (newClean >= 5) status = "cleared";
    else if (newClean >= 2) status = "improving";

    await supabase
      .from("mistake_patterns")
      .update({
        consecutive_clean: newClean,
        status,
        ...(status === "cleared" ? { cleared_at: new Date().toISOString() } : {}),
      })
      .eq("id", pattern.id);
  }

  // 5. expressions usage_count 갱신 + 좋은 표현 자동 저장 (중복 체크)
  for (const exprItem of feedback.used_expressions || []) {
    // 새 형식 (object) 또는 이전 형식 (string) 모두 지원
    const expr = typeof exprItem === "string" ? exprItem : exprItem.expression;
    const meaning = typeof exprItem === "string" ? undefined : exprItem.meaning;
    const example = typeof exprItem === "string" ? undefined : exprItem.example;

    const { data: allExprs } = await supabase
      .from("expressions")
      .select("id, expression, usage_count, meaning, example_sentence")
      .eq("user_id", user.id);

    const exprLower = expr.toLowerCase().trim();
    const existing = allExprs?.find((e) => {
      const eLower = e.expression.toLowerCase().trim();
      return eLower === exprLower || eLower.includes(exprLower) || exprLower.includes(eLower);
    });

    if (existing) {
      const updates: Record<string, unknown> = {
        usage_count: existing.usage_count + 1,
        last_used_at: new Date().toISOString(),
        status: "active",
      };
      if (!existing.meaning && meaning) updates.meaning = meaning;
      if (!existing.example_sentence && example) updates.example_sentence = example;

      await supabase.from("expressions").update(updates).eq("id", existing.id);
    } else {
      await saveExpressionDeduped(supabase, user.id, expr, meaning, example, "journal", entry.id);
    }
  }

  // 6. user_stats EQS 업데이트
  const { data: recentScores } = await supabase
    .from("entry_scores")
    .select("eqs")
    .eq("user_id", user.id)
    .order("scored_at", { ascending: false })
    .limit(5);

  const avgEqs = recentScores?.length
    ? Math.round(
        recentScores.reduce((sum, s) => sum + (s.eqs || 0), 0) /
          recentScores.length
      )
    : 0;

  const level =
    avgEqs >= 96 ? 9 :
    avgEqs >= 90 ? 8 :
    avgEqs >= 82 ? 7 :
    avgEqs >= 72 ? 6 :
    avgEqs >= 60 ? 5 :
    avgEqs >= 48 ? 4 :
    avgEqs >= 35 ? 3 :
    avgEqs >= 20 ? 2 : 1;

  const { data: stats } = await supabase
    .from("user_stats")
    .select("total_entries, current_streak, longest_streak, last_entry_date")
    .eq("user_id", user.id)
    .single();

  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const isConsecutive = stats?.last_entry_date === yesterday || stats?.last_entry_date === today;
  const newStreak = isConsecutive ? (stats?.current_streak || 0) + 1 : 1;

  await supabase
    .from("user_stats")
    .update({
      current_eqs: avgEqs,
      level,
      total_entries: (stats?.total_entries || 0) + 1,
      current_streak: newStreak,
      longest_streak: Math.max(newStreak, stats?.longest_streak || 0),
      last_entry_date: today,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  return NextResponse.json({ success: true, entryId: entry.id });
}
