import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  decisionPath,
  formatDecisionBadge,
  isValidDecisionTitle,
  normalizeDecisionTitle,
} from "./decisions-helpers";

describe("decisionPath", () => {
  it("builds collection, detail and items URLs", () => {
    assert.equal(decisionPath(), "/api/decisions");
    assert.equal(decisionPath("dec_123"), "/api/decisions/dec_123");
    assert.equal(decisionPath("id with spaces", "/items"), "/api/decisions/id%20with%20spaces/items");
  });
});

describe("decision helpers", () => {
  it("normalizes and validates titles", () => {
    assert.equal(normalizeDecisionTitle("  Piso   vs   alquiler  "), "Piso vs alquiler");
    assert.equal(isValidDecisionTitle("Casa"), true);
    assert.equal(isValidDecisionTitle("   "), false);
    assert.equal(isValidDecisionTitle("x".repeat(81)), false);
  });

  it("formats changed badges", () => {
    assert.equal(formatDecisionBadge(0), null);
    assert.equal(formatDecisionBadge(7), "7");
    assert.equal(formatDecisionBadge(100), "99+");
  });
});
