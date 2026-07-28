/**
 * Tests del parser de Tecnoempleo (puro, sin red).
 * Ejecutar:  node --import tsx --test src/features/sources/jobs/ingest-tecnoempleo-jina.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseEsDate, parseTecnoempleoHtml, tecnoempleoSearchUrl } from "./ingest-tecnoempleo-jina";
import { resolveTecnoempleoProvinceId } from "./province";

/** Recorte FIEL de la web real (2026-07-28): dos tarjetas. */
const HTML = `
<a name="rf-11b518bad25c533ecd44" id="rf-11b518bad25c533ecd44"></a>
<div class="p-3 border rounded mb-3 bg-white">
<img data-src="https://www.tecnoempleo.com/logotipos/153604.png?01" alt="Logo Serem" class="lazy">
<h3 class="fs-5 mb-2">
<a href="https://www.tecnoempleo.com/analista-programador-natural-adabas-serem/db2/rf-11b518bad25c533ecd44" class="font-weight-bold" title="x">
Analista Programador/a Natural Adabas					</a>
</h3>
<a title="Ofertas de Empleo Serem" href="https://www.tecnoempleo.com/serem-trabajo" class="text-primary">Serem</a>
<span class="d-block d-lg-none text-gray-800">
<b>Madrid</b> (H&iacute;brido) - 28/07/2026 <span class="badge badge-primary">Nueva</span>
</span>
<span class="badge bg-gray-500 mx-1">natural</span>
<span class="badge bg-gray-500 mx-1">DB2</span>
</div>

<a name="rf-40071e5c22f833af1048" id="rf-40071e5c22f833af1048"></a>
<div class="p-3 border rounded mb-3 bg-white">
<h3 class="fs-5 mb-2">
<a href="https://www.tecnoempleo.com/analista-programador-ia-bi-incoming-domain/aws-iam/rf-40071e5c22f833af1048" class="font-weight-bold">
Analista Programador IA, BI</a>
</h3>
<a title="Ofertas de Empleo Incoming Domain" href="https://www.tecnoempleo.com/incoming-domain/re-162939">Incoming Domain</a>
<span class="d-block d-lg-none text-gray-800">
<b>100% remoto</b> - 26/06/2026
</span>
21.000&euro; - 30.000&euro; b/a
<span class="badge bg-gray-500 mx-1">aws</span>
</div>
`;

const NOW = new Date("2026-07-28T12:00:00Z");

test("parseTecnoempleoHtml: saca las dos ofertas con empresa, zona y fecha", () => {
  const offers = parseTecnoempleoHtml(HTML, NOW);
  assert.equal(offers.length, 2);

  const [a, b] = offers;
  assert.equal(a.title, "Analista Programador/a Natural Adabas");
  assert.equal(a.companyName, "Serem");
  assert.equal(a.location, "Madrid");
  assert.equal(a.platform, "tecnoempleo");
  assert.equal(a.externalId, "rf-11b518bad25c533ecd44");
  assert.ok(a.url.endsWith("rf-11b518bad25c533ecd44"));
  assert.equal(a.postedAt?.toISOString().slice(0, 10), "2026-07-28");
  // Las etiquetas de tecnología son lo más parecido a un sector que da el portal.
  assert.equal(a.sector, "natural, DB2");

  assert.equal(b.title, "Analista Programador IA, BI");
  assert.equal(b.companyName, "Incoming Domain");
});

test("parseTecnoempleoHtml: salario en céntimos y entidades resueltas", () => {
  const [a, b] = parseTecnoempleoHtml(HTML, NOW);
  assert.equal(a.salaryMin, undefined); // esta oferta no publica salario
  assert.equal(b.salaryMin, 21_000_00);
  assert.equal(b.salaryMax, 30_000_00);
});

test("parseTecnoempleoHtml: '100% remoto' es remoto; 'Híbrido' no", () => {
  const [a, b] = parseTecnoempleoHtml(HTML, NOW);
  assert.equal(a.remote, undefined);
  assert.equal(b.remote, true);
});

test("parseTecnoempleoHtml: descarta tarjetas sin título o sin enlace", () => {
  const sinTitulo = HTML.replace("Analista Programador/a Natural Adabas", "");
  assert.equal(parseTecnoempleoHtml(sinTitulo, NOW).length, 1);
});

test("parseEsDate: dd/mm/aaaa", () => {
  assert.equal(parseEsDate("28/07/2026")?.toISOString().slice(0, 10), "2026-07-28");
  assert.equal(parseEsDate("sin fecha"), undefined);
  assert.equal(parseEsDate(undefined), undefined);
});

test("tecnoempleoSearchUrl: provincia entre comas, remoto y paginación", () => {
  const u = tecnoempleoSearchUrl("programador", 232, true, 2);
  assert.ok(u.includes("te=programador"));
  // Su buscador espera la provincia como lista: ,232,
  assert.ok(decodeURIComponent(u).includes("pr=,232,"));
  assert.ok(u.includes("en_remoto=1"));
  assert.ok(u.includes("pagina=2"));

  const simple = tecnoempleoSearchUrl("programador");
  assert.ok(!simple.includes("pr="));
  assert.ok(!simple.includes("pagina="));
  assert.ok(!simple.includes("en_remoto"));
});

test("resolveTecnoempleoProvinceId: nombres propios del portal", () => {
  // Su lista usa Bizkaia/Gipuzkoa/Girona/Lleida/Ourense; nosotros el nombre canónico.
  assert.equal(resolveTecnoempleoProvinceId("Vitoria-Gasteiz"), 232);
  assert.equal(resolveTecnoempleoProvinceId("Bilbao"), 241);
  assert.equal(resolveTecnoempleoProvinceId("Madrid"), 263);
  assert.equal(resolveTecnoempleoProvinceId("Palma de Mallorca"), 239);
  assert.equal(resolveTecnoempleoProvinceId("Lisboa"), undefined);
});
