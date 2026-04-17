import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quizType, question, correctAnswer, userAnswer, isCorrect, relatedPattern } =
    await request.json();

  // quiz_attempts 저장
  let relatedPatternId = null;
  if (relatedPattern) {
    const { data } = await supabase
      .from("mistake_patterns")
      .select("id")
      .eq("user_id", user.id)
      .eq("pattern_name", relatedPattern)
      .single();
    relatedPatternId = data?.id;
  }

  await supabase.from("quiz_attempts").insert({
    user_id: user.id,
    quiz_type: quizType,
    question,
    correct_answer: correctAnswer,
    user_answer: userAnswer,
    is_correct: isCorrect,
    related_pattern_id: relatedPatternId,
  });

  // 패턴 업데이트
  if (relatedPatternId) {
    const { data: pattern } = await supabase
      .from("mistake_patterns")
      .select("count, consecutive_clean")
      .eq("id", relatedPatternId)
      .single();

    if (pattern) {
      if (isCorrect) {
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
          .eq("id", relatedPatternId);
      } else {
        await supabase
          .from("mistake_patterns")
          .update({
            count: pattern.count + 1,
            consecutive_clean: 0,
            status: "active",
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", relatedPatternId);
      }
    }
  }

  return NextResponse.json({ success: true });
}
