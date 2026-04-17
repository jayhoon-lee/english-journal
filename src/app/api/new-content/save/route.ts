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

  const { content, meaning, example } = await request.json();

  await supabase.from("expressions").insert({
    user_id: user.id,
    expression: content,
    meaning,
    example_sentence: example,
    usage_count: 0,
    status: "active",
  });

  return NextResponse.json({ success: true });
}
