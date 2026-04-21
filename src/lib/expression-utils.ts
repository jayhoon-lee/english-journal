import { SupabaseClient } from "@supabase/supabase-js";

export type SourceType = "journal" | "coach" | "article" | "new-content" | "unknown";

export async function saveExpressionDeduped(
  supabase: SupabaseClient,
  userId: string,
  expression: string,
  meaning?: string,
  exampleSentence?: string | null,
  sourceType?: SourceType,
  sourceEntryId?: string | null,
  sourceArticleId?: string | null
) {
  const exprLower = expression.toLowerCase().trim();

  const { data: allExprs } = await supabase
    .from("expressions")
    .select("id, expression, meaning, example_sentence, usage_count")
    .eq("user_id", userId);

  if (!allExprs) {
    await supabase.from("expressions").insert({
      user_id: userId,
      expression: expression.trim(),
      meaning: meaning || null,
      example_sentence: exampleSentence || null,
      usage_count: 0,
      status: "active",
      source_type: sourceType || "unknown",
      source_entry_id: sourceEntryId || null,
      source_article_id: sourceArticleId || null,
    });
    return { saved: true, merged: false };
  }

  const match = allExprs.find((e) => {
    const eLower = e.expression.toLowerCase().trim();
    return (
      eLower === exprLower ||
      eLower.includes(exprLower) ||
      exprLower.includes(eLower)
    );
  });

  if (match) {
    const keepShorter = match.expression.length <= expression.trim().length;
    const updates: Record<string, string | null> = {};

    if (!match.meaning && meaning) updates.meaning = meaning;
    if (!match.example_sentence && exampleSentence) updates.example_sentence = exampleSentence;
    if (!keepShorter) updates.expression = expression.trim();

    if (Object.keys(updates).length > 0) {
      await supabase.from("expressions").update(updates).eq("id", match.id);
    }

    return { saved: false, merged: true, existingId: match.id };
  }

  await supabase.from("expressions").insert({
    user_id: userId,
    expression: expression.trim(),
    meaning: meaning || null,
    example_sentence: exampleSentence || null,
    usage_count: 0,
    status: "active",
    source_type: sourceType || "unknown",
    source_entry_id: sourceEntryId || null,
    source_article_id: sourceArticleId || null,
  });

  return { saved: true, merged: false };
}
