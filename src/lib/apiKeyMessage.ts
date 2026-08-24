import { getSupabase } from "@/lib/supabase";
import { messageIndexForSeq } from "@/lib/apiKeyMessages";

// Hand out one of the API_KEY_MESSAGES variants, round-robin by claim order.
// Idempotent — an already-assigned index is returned untouched and never recomputed,
// so expanding the message list later can't change what an existing user sees.
export async function assignMessageIndex(userId: string): Promise<number> {
  const db = getSupabase();

  const { data: existing } = await db
    .from("user_settings")
    .select("api_key_message_index")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.api_key_message_index != null) return existing.api_key_message_index;

  // A real sequence, not `count(*)` — two concurrent claims must not land on the same slot.
  const { data: seq } = await db.rpc("next_api_key_message_seq");
  const index = messageIndexForSeq(Number(seq));

  // Upsert (not update) — a brand-new user has no user_settings row yet.
  await db
    .from("user_settings")
    .upsert(
      { user_id: userId, api_key_message_index: index, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  return index;
}
