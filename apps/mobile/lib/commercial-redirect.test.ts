import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildCommercialRedirectUrl, resolveCommercialRedirectUrl } from "./commercial-redirect-url";

describe("buildCommercialRedirectUrl", () => {
  it("builds /api/go with an encoded partner target", () => {
    const url = buildCommercialRedirectUrl({
      apiBaseUrl: "https://nidokey.es",
      target: "https://www.aviasales.com/search/MAD0909BCN1",
      recordType: "holiday",
      recordId: "rec_123",
    });

    assert.equal(
      url,
      "https://nidokey.es/api/go?target=https%3A%2F%2Fwww.aviasales.com%2Fsearch%2FMAD0909BCN1&recordType=holiday&recordId=rec_123"
    );
  });

  it("preserves target query strings and fragments inside the encoded target", () => {
    const url = buildCommercialRedirectUrl({
      apiBaseUrl: "https://api.example.test/",
      target: "https://alejandro-suances-isz5h.nuitee.link/hotel?id=42&currency=EUR#rooms",
      recordType: "holiday",
      recordId: "holiday:with/slash",
    });

    assert.equal(
      url,
      "https://api.example.test/api/go?target=https%3A%2F%2Falejandro-suances-isz5h.nuitee.link%2Fhotel%3Fid%3D42%26currency%3DEUR%23rooms&recordType=holiday&recordId=holiday%3Awith%2Fslash"
    );
  });

  it("normalizes API bases that include a path", () => {
    const url = buildCommercialRedirectUrl({
      apiBaseUrl: "http://192.168.1.77:4200/mobile",
      target: "https://www.aviasales.com/",
      recordType: "holiday",
      recordId: "abc",
    });

    assert.equal(
      url,
      "http://192.168.1.77:4200/api/go?target=https%3A%2F%2Fwww.aviasales.com%2F&recordType=holiday&recordId=abc"
    );
  });
});

describe("resolveCommercialRedirectUrl", () => {
  it("uses the Location returned by /api/go", async () => {
    let requestedUrl = "";
    const result = await resolveCommercialRedirectUrl({
      apiBaseUrl: "https://nidokey.es",
      target: "https://www.aviasales.com/search/MAD0909BCN1",
      recordType: "holiday",
      recordId: "rec_123",
      fetchImpl: async (url) => {
        requestedUrl = String(url);
        return new Response(null, {
          status: 302,
          headers: { Location: "https://partner.example/booking?ref=nidokey" },
        });
      },
    });

    assert.equal(
      requestedUrl,
      "https://nidokey.es/api/go?target=https%3A%2F%2Fwww.aviasales.com%2Fsearch%2FMAD0909BCN1&recordType=holiday&recordId=rec_123"
    );
    assert.deepEqual(result, {
      url: "https://partner.example/booking?ref=nidokey",
      fallback: false,
    });
  });

  it("falls back to the original affiliate URL when /api/go fails", async () => {
    const target = "https://www.aviasales.com/search/MAD0909BCN1";
    const result = await resolveCommercialRedirectUrl({
      apiBaseUrl: "https://nidokey.es",
      target,
      recordType: "holiday",
      recordId: "rec_123",
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });

    assert.deepEqual(result, { url: target, fallback: true });
  });
});
