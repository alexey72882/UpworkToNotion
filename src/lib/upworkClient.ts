import { getValidAccessToken } from "@/lib/upworkToken";

export type UpworkResult =
  | { ok: true; status: number; json: any; url: string }
  | { ok: false; status?: number; body?: string; error?: string; url: string };

export async function callUpwork(path: string, init?: RequestInit): Promise<UpworkResult> {
  let token: string | null = null;

  try {
    token = await getValidAccessToken();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
    const details =
      error && typeof error === "object" ? JSON.stringify(error) : undefined;
    return { ok: false, error: message, body: details, url: path };
  }

  if (!token) {
    return { ok: false, error: "no_token", url: path };
  }

  const url = path.startsWith("http")
    ? path
    : `https://www.upwork.com/api/v3/${path.replace(/^\/+/, "")}`;

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "User-Agent": "notion-to-upwork/1.0 (+vercel)",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });

    const raw = await response.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }

    if (!response.ok) {
      return { ok: false, status: response.status, body: raw, url };
    }

    return { ok: true, status: response.status, json: parsed, url };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
    const details =
      error && typeof error === "object" ? JSON.stringify(error) : undefined;
    return { ok: false, error: message, body: details, url };
  }
}
