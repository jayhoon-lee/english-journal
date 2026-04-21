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

  const { content, meaning, example, articleId } = await request.json();

  await saveExpressionDeduped(
    supabase, user.id, content, meaning, example,
    articleId ? "article" : "new-content",
    null, articleId || null
  );

  return NextResponse.json({ success: true });
}
