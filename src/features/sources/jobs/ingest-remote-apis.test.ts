/**
 * Tests de los normalizadores de las APIs de remoto (puros, sin red).
 * Los payloads son recortes FIELES de cada API, sondeadas el 2026-07-28.
 * Ejecutar:  node --import tsx --test src/features/sources/jobs/ingest-remote-apis.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  matchesKeyword,
  normalizeArbeitnow,
  normalizeHimalayas,
  normalizeJobicy,
  normalizeRemoteOk,
  normalizeRemotive,
  normalizeTheMuse,
} from "./ingest-remote-apis";

const NOW = new Date("2026-07-28T12:00:00Z");

test("normalizeRemotive: mapea id, empresa, tags y fecha", () => {
  const o = normalizeRemotive(
    {
      id: 1994990,
      url: "https://remotive.com/remote-jobs/software-dev/react-developer-1994990",
      title: "React Developer",
      company_name: "Proxify",
      company_logo: "https://remotive.com/job/logo.png",
      category: "Software Development",
      tags: ["react", "typescript"],
      candidate_required_location: "Europe",
      publication_date: "2026-07-20T08:14:00",
      description: "<p>Build <b>things</b> remotely</p>",
    },
    NOW
  );
  assert.equal(o.platform, "remotive");
  assert.equal(o.externalId, "remotive:1994990");
  assert.equal(o.title, "React Developer");
  assert.equal(o.companyName, "Proxify");
  assert.equal(o.location, "Europe");
  assert.equal(o.remote, true);
  assert.equal(o.sector, "react, typescript");
  assert.equal(o.description, "Build things remotely"); // HTML fuera
  assert.equal(o.postedAt?.toISOString().slice(0, 10), "2026-07-20");
});

test("normalizeJobicy: salario anual a céntimos con su divisa", () => {
  const o = normalizeJobicy(
    {
      id: 141460,
      url: "https://jobicy.com/jobs/141460-backend-engineer",
      jobTitle: "Backend Engineer",
      companyName: "Acme",
      companyLogo: "https://jobicy.com/logo.png",
      jobIndustry: ["Programming"],
      jobGeo: "Europe",
      jobExcerpt: "Go and Postgres.",
      pubDate: "2026-07-25 10:00:00",
      salaryMin: 60000,
      salaryMax: 80000,
      salaryCurrency: "EUR",
    },
    NOW
  );
  assert.equal(o.platform, "jobicy");
  assert.equal(o.salaryMin, 6_000_000); // céntimos
  assert.equal(o.salaryMax, 8_000_000);
  assert.equal(o.currency, "EUR");
  assert.equal(o.location, "Europe");
  assert.equal(o.sector, "Programming");
});

test("normalizeArbeitnow: respeta su campo remote (mezcla presencial alemán)", () => {
  const base = {
    slug: "devops-engineer-berlin-123",
    company_name: "Zeal",
    title: "DevOps Engineer",
    description: "Kubernetes.",
    remote: false,
    url: "https://www.arbeitnow.com/jobs/companies/zeal/devops-engineer-berlin-123",
    tags: ["devops"],
    location: "Berlin",
    created_at: 1785110400,
  };
  assert.equal(normalizeArbeitnow(base, NOW).remote, undefined);
  assert.equal(normalizeArbeitnow({ ...base, remote: true }, NOW).remote, true);
  assert.equal(normalizeArbeitnow(base, NOW).externalId, "arbeitnow:devops-engineer-berlin-123");
});

test("normalizeRemoteOk: fecha epoch y salario en USD", () => {
  const o = normalizeRemoteOk(
    {
      id: "1090910",
      position: "Senior Rust Engineer",
      company: "Cranky Inc",
      location: "Worldwide",
      description: "Systems work.",
      url: "https://remoteOK.com/remote-jobs/1090910",
      salary_min: 90000,
      salary_max: 120000,
      tags: ["rust"],
      epoch: 1785110400, // 2026-07-27T00:00:00Z
      company_logo: "https://remoteok.com/assets/logo.png",
    },
    NOW
  );
  assert.equal(o.platform, "remoteok");
  assert.equal(o.postedAt?.toISOString().slice(0, 10), "2026-07-27");
  assert.equal(o.salaryMin, 9_000_000);
  assert.equal(o.currency, "USD");
});

test("normalizeHimalayas: guid como id/url de respaldo y restricciones como ubicación", () => {
  const o = normalizeHimalayas(
    {
      title: "Product Designer",
      excerpt: "Design the app.",
      companyName: "Float",
      companyLogo: "https://himalayas.app/logo.png",
      minSalary: 70000,
      maxSalary: 90000,
      currency: "USD",
      locationRestrictions: ["United Kingdom", "Spain"],
      categories: ["Design"],
      pubDate: 1785024000,
      applicationLink: "https://himalayas.app/companies/float/jobs/product-designer",
      guid: "https://himalayas.app/companies/float/jobs/product-designer#guid",
    },
    NOW
  );
  assert.equal(o.platform, "himalayas");
  assert.equal(o.location, "United Kingdom, Spain");
  assert.equal(o.salaryMax, 9_000_000);
  assert.equal(o.sector, "Design");
  assert.ok(o.url.length > 0);
});

test("normalizeTheMuse: empresa anidada, refs.landing_page y remoto inferido", () => {
  const o = normalizeTheMuse(
    {
      id: 82412345,
      name: "Data Analyst",
      contents: "<p>Analyze data.</p>",
      publication_date: "2026-07-26T00:00:00Z",
      locations: [{ name: "Flexible / Remote" }],
      categories: [{ name: "Data and Analytics" }],
      refs: { landing_page: "https://www.themuse.com/jobs/acme/data-analyst" },
      company: { name: "Acme Corp" },
    },
    NOW
  );
  assert.equal(o.platform, "themuse");
  assert.equal(o.companyName, "Acme Corp");
  assert.equal(o.remote, true);
  assert.equal(o.url, "https://www.themuse.com/jobs/acme/data-analyst");
  assert.equal(o.sector, "Data and Analytics");
});

test("matchesKeyword: exige TODAS las palabras en título/tags/descripción", () => {
  const o = normalizeRemotive(
    { title: "Senior React Developer", tags: ["typescript"], description: "<p>Node backend</p>", url: "https://x" },
    NOW
  );
  assert.equal(matchesKeyword(o, "react"), true);
  assert.equal(matchesKeyword(o, "REACT node"), true); // case-insensitive, AND
  assert.equal(matchesKeyword(o, "react angular"), false);
  assert.equal(matchesKeyword(o, ""), true); // sin palabras = pasa todo
});

test("cents (vía normalizadores): descarta salarios basura", () => {
  const o = normalizeJobicy({ jobTitle: "X", salaryMin: 0, salaryMax: 5_000_000, url: "https://x" }, NOW);
  assert.equal(o.salaryMin, undefined); // 0 no es un salario
  assert.equal(o.salaryMax, undefined); // 5M anuales tampoco (fuera de rango)
});
