import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ attempts: [] });
  }

  const { data } = await supabase
    .from("quiz_attempts")
    .select("id, quiz_type, question, correct_answer, user_answer, is_correct, attempted_at")
    .eq("user_id", user.id)
    .order("attempted_at", { ascending: false })
    .limit(30);

  return NextResponse.json({ attempts: data || [] });
}
