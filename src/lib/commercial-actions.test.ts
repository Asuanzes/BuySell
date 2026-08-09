import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COMMERCIAL_ACTION_EVENTS,
  buildCommercialRedirect,
  commercialRedirectAnalyticsEvents,
  isAllowedTravelPartnerHost,
} from "./commercial-actions";

test("travel partner host whitelist accepts generated Aviasales and Nuitee hosts", () => {
  assert.equal(isAllowedTravelPartnerHost("www.aviasales.com"), true);
  assert.equal(isAllowedTravelPartnerHost("alejandro-suances-isz5h.nuitee.link"), true);
  assert.equal(isAllowedTravelPartnerHost("evil.example"), false);
  assert.equal(isAllowedTravelPartnerHost("nuitee.link.evil.example"), false);
});

test("commercial redirect rejects arbitrary hosts", () => {
  assert.equal(
    buildCommercialRedirect({
      target: "https://example.com/book",
      recordType: "holiday",
      recordId: "h1",
      attributionId: "attr-1",
    }),
    null
  );
});

test("commercial redirect adds attribution id as generic sub_id", () => {
  const redirect = buildCommercialRedirect({
    target: "https://www.aviasales.com/search/MAD1508BCN1?currency=eur",
    recordType: "holiday",
    recordId: "h1",
    attributionId: "attr-1",
  });

  assert.ok(redirect);
  const url = new URL(redirect.targetUrl);
  assert.equal(url.hostname, "www.aviasales.com");
  assert.equal(url.searchParams.get("currency"), "eur");
  assert.equal(url.searchParams.get("sub_id"), "attr-1");
  assert.equal(redirect.host, "www.aviasales.com");
});

test("commercial event names match MODELO-NEGOCIO §8 literals", () => {
  assert.deepEqual(Object.values(COMMERCIAL_ACTION_EVENTS), [
    "commercial_action_view",
    "commercial_action_click",
    "partner_redirect",
    "lead_submitted",
    "conversion_confirmed",
    "commission_confirmed",
  ]);
});

test("/go analytics registration uses MODELO-NEGOCIO §8 click and redirect names", () => {
  const events = commercialRedirectAnalyticsEvents({
    attributionId: "attr-1",
    recordType: "holiday",
    recordId: "h1",
    host: "www.aviasales.com",
  });

  assert.deepEqual(
    events.map((event) => event.name),
    ["commercial_action_click", "partner_redirect"]
  );
  assert.equal(events[0].props.attributionId, "attr-1");
});
