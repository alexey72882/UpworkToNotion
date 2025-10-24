import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

export async function recordSync(runId: string, payload: unknown) {
  try {
    await supabase.from("sync_logs").insert({ run_id: runId, payload });
  } catch {
    // swallow logging errors so sync flow continues
  }
}

export async function rememberExternalId(externalId: string) {
  try {
    await supabase.from("contracts").upsert(
      { external_id: externalId },
      { onConflict: "external_id" },
    );
  } catch {
    // swallow logging errors so sync flow continues
  }
}
