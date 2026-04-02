import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireAuth } from "@/lib/requireAuth";

function mockReqRes(authHeader?: string) {
  const req = {
    headers: authHeader ? { authorization: authHeader } : {},
  } as any;

  const res = {
    statusCode: 0,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  } as any;

  return { req, res };
}

describe("requireAuth", () => {
  const SECRET = "test-secret-123";

  beforeEach(() => {
    vi.stubEnv("API_SECRET", SECRET);
  });

  it("returns true with correct bearer token", () => {
    const { req, res } = mockReqRes(`Bearer ${SECRET}`);
    expect(requireAuth(req, res)).toBe(true);
  });

  it("returns false and 401 with missing header", () => {
    const { req, res } = mockReqRes();
    expect(requireAuth(req, res)).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });

  it("returns false and 401 with wrong token", () => {
    const { req, res } = mockReqRes("Bearer wrong-token");
    expect(requireAuth(req, res)).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("returns false and 500 when API_SECRET not set", () => {
    vi.stubEnv("API_SECRET", "");
    const { req, res } = mockReqRes(`Bearer ${SECRET}`);
    expect(requireAuth(req, res)).toBe(false);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("API_SECRET not configured");
  });
});
