import { test } from "node:test";
import assert from "node:assert/strict";

import { GO_RATE_LIMIT, checkGoRateLimit } from "./route";

test("go route applies hourly commercial redirect rate limit per authenticated user", async () => {
  const calls: Array<{ bucket: string; key: string; opts: { limit: number; windowMs: number } }> = [];
  const result = { ok: true, remaining: 59, resetAt: new Date("2026-08-09T10:00:00.000Z") };

  const response = await checkGoRateLimit("user-1", async (bucket, key, opts) => {
    calls.push({ bucket, key, opts });
    return result;
  });

  assert.equal(response, result);
  assert.deepEqual(calls, [
    {
      bucket: "commercial-go",
      key: "user-1",
      opts: GO_RATE_LIMIT,
    },
  ]);
});
