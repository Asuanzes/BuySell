import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatRecordEventDescription } from "./events-format";

const t = (key: string, opts?: Record<string, string | number>) =>
  `${key} ${JSON.stringify(opts ?? {})}`;

describe("formatRecordEventDescription", () => {
  it("describe una bajada de precio con delta y valores", () => {
    const text = formatRecordEventDescription(
      "price_changed",
      { previousCents: 250000, newCents: 240000, currency: "EUR" },
      t,
      "es"
    );
    assert.match(text, /^events\.desc\.price_down /);
    assert.match(text, /-100/);
    assert.match(text, /2500|2500/);
    assert.match(text, /2400|2400/);
  });

  it("describe una subida de valor de mercado", () => {
    const text = formatRecordEventDescription(
      "value_changed",
      { previousCents: 1000, newCents: 1250, currency: "USD" },
      t,
      "en"
    );
    assert.match(text, /^events\.desc\.value_up /);
    assert.match(text, /\+\$2\.50|\+US\$2\.50/);
  });

  it("usa el mensaje de la alerta disparada", () => {
    const text = formatRecordEventDescription(
      "alert_fired",
      { message: "BTC ha bajado de 60.000 EUR" },
      t
    );
    assert.equal(text, 'events.desc.alert_fired {"message":": BTC ha bajado de 60.000 EUR"}');
  });

  it("distingue compartidos a grupo e importaciones", () => {
    assert.equal(
      formatRecordEventDescription("record_shared", { destination: "conversation", targetCount: 3 }, t),
      'events.desc.record_shared_group {"count":3}'
    );
    assert.equal(formatRecordEventDescription("record_imported", {}, t), "events.desc.record_imported {}");
  });
});
