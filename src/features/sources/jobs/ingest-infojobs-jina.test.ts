/**
 * Tests del parser de InfoJobs vía Jina (puro, sin red).
 * Ejecutar:  node --import tsx --test src/features/sources/jobs/ingest-infojobs-jina.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { extractOffersJson, infoJobsSearchUrl, parseInfoJobsHtml } from "./ingest-infojobs-jina";
import { resolveInfoJobsProvinceId } from "./province";

/**
 * Recorte FIEL de la página real (2026-07-28). Lleva las dos copias que trae
 * InfoJobs: el JSON embebido y ESCAPADO con las ofertas completas (de donde se
 * lee todo) y las tarjetas renderizadas (de donde se rescata el salario).
 */
const OFFERS_JSON =
  '\\"offers\\":[' +
  '{\\"code\\":\\"340ef9f73f422db941b0249ca47168\\",\\"title\\":\\"Senior NET Developer\\",' +
  '\\"description\\":\\"Buscamos un/a Senior Software Engineer\\",\\"city\\":\\"Barcelona\\",' +
  '\\"link\\":\\"//www.infojobs.net/barcelona/senior-net-developer/of-i340ef9f73f422db941b0249ca47168?applicationOrigin=search-new\\",' +
  '\\"contractType\\":\\"Contrato indefinido\\",\\"workday\\":\\"Jornada completa\\",\\"teleworking\\":\\"H\\u00EDbrido\\",' +
  '\\"publishedAt\\":\\"2026-07-27T14:00:05Z\\",\\"companyName\\":\\"Consultia IT\\",' +
  '\\"companyLogo\\":\\"https://multimedia-logos.infojobs.net/image/upload/9c/abc\\"},' +
  '{\\"code\\":\\"11151c3cde4328863a6d0fbb47884f\\",\\"title\\":\\"Programador/a Labview\\",' +
  '\\"description\\":\\"Uneix-te al repte\\",\\"city\\":\\"Manresa\\",' +
  '\\"link\\":\\"//www.infojobs.net/manresa/programador-labview/of-i11151c3cde4328863a6d0fbb47884f\\",' +
  '\\"contractType\\":\\"Contrato indefinido\\",\\"workday\\":\\"Jornada completa\\",\\"teleworking\\":\\"Solo teletrabajo\\",' +
  '\\"publishedAt\\":\\"2026-06-12T09:00:00Z\\",\\"companyName\\":\\"Etalentum Selecci\\u00F3n\\",' +
  '\\"companyLogo\\":\\"\\"}]';

const HTML = `<script>window.__STATE__="{${OFFERS_JSON}}"</script>`;

/** Las tarjetas renderizadas: solo aportan el salario. */
const CARDS = `
<div class="ij-OfferCardContent-description-head-left"><div class="ij-OfferCardContent-description-badges"></div>
<h2 id="job-title-340ef9f73f422db941b0249ca47168" class="ij-OfferCardContent-description-title">
<a class="ij-OfferCardContent-description-link" href="//www.infojobs.net/barcelona/senior-net-developer/of-i340ef9f73f422db941b0249ca47168?applicationOrigin=search">
<span class="ij-OfferCardContent-description-title-link">Senior NET Developer</span></a></h2>
<h3 id="job-company-340ef9f73f422db941b0249ca47168" class="ij-OfferCardContent-description-subtitle">
<a href="https://consultia.ofertas-trabajo.infojobs.net/">Consultia IT</a></h3>
<ul class="ij-OfferCardContent-description-list">
<li>Barcelona</li><li>H&iacute;brido</li><li>Hace 22h(Publicada de nuevo)</li>
<li>Contrato indefinido</li><li>Jornada completa</li><li>Salario no disponible</li></ul>

<h2 id="job-title-11151c3cde4328863a6d0fbb47884f" class="ij-OfferCardContent-description-title">
<a class="ij-OfferCardContent-description-link" href="//www.infojobs.net/manresa/programador-labview/of-i11151c3cde4328863a6d0fbb47884f">
<span class="ij-OfferCardContent-description-title-link">Programador/a Labview</span></a></h2>
<h3 id="job-company-11151c3cde4328863a6d0fbb47884f" class="ij-OfferCardContent-description-subtitle">Etalentum Selecci&oacute;n</h3>
<ul class="ij-OfferCardContent-description-list">
<li>Manresa</li><li>12 jun</li><li>Contrato indefinido</li><li>Jornada completa</li>
<li>36.000&nbsp;&euro; - 40.000&nbsp;&euro; Bruto/a&ntilde;o</li></ul>
`;

const NOW = new Date("2026-07-28T12:00:00Z");
const PAGE = HTML + CARDS;

test("extractOffersJson: desescapa el estado embebido y devuelve las ofertas", () => {
  const raw = extractOffersJson(PAGE);
  assert.equal(raw.length, 2);
  assert.equal(raw[0].title, "Senior NET Developer");
  // Los \u escapados llegan como acentos de verdad.
  assert.equal(raw[1].companyName, "Etalentum Selección");
});

test("extractOffersJson: formato inesperado devuelve vacío, no revienta", () => {
  assert.deepEqual(extractOffersJson("<html>sin estado</html>"), []);
  assert.deepEqual(extractOffersJson('\\"offers\\":[{roto'), []);
});

test("parseInfoJobsHtml: saca las ofertas con enlace absoluto, empresa y descripción", () => {
  const offers = parseInfoJobsHtml(PAGE, NOW);
  assert.equal(offers.length, 2);

  const [a, b] = offers;
  assert.equal(a.title, "Senior NET Developer");
  assert.equal(a.companyName, "Consultia IT");
  assert.equal(a.location, "Barcelona");
  assert.equal(a.externalId, "340ef9f73f422db941b0249ca47168");
  assert.equal(a.contractType, "Contrato indefinido");
  // El enlace viene sin protocolo: hay que completarlo o no abre.
  assert.ok(a.url.startsWith("https://www.infojobs.net/barcelona/"));
  // La descripción SOLO está en el JSON; las tarjetas no la traen.
  assert.ok((a.description ?? "").includes("Senior Software Engineer"));

  assert.equal(b.title, "Programador/a Labview");
  assert.equal(b.companyName, "Etalentum Selección");
});

test("parseInfoJobsHtml: fecha ISO del JSON, sin adivinar desde 'Hace 22h'", () => {
  const [a] = parseInfoJobsHtml(PAGE, NOW);
  assert.equal(a.postedAt?.toISOString(), "2026-07-27T14:00:05.000Z");
});

test("parseInfoJobsHtml: el salario se rescata de las tarjetas (el JSON no lo trae)", () => {
  const [a, b] = parseInfoJobsHtml(PAGE, NOW);
  assert.equal(a.salaryMin, undefined); // "Salario no disponible"
  assert.equal(b.salaryMin, 36_000_00);
  assert.equal(b.salaryMax, 40_000_00);
  assert.equal(b.currency, "EUR");
  // Sin las tarjetas sigue funcionando: solo se pierde el salario.
  const soloJson = parseInfoJobsHtml(HTML, NOW);
  assert.equal(soloJson.length, 2);
  assert.equal(soloJson[1].salaryMin, undefined);
});

test("parseInfoJobsHtml: 'Híbrido' NO es teletrabajo; 'Solo teletrabajo' sí", () => {
  const [a, b] = parseInfoJobsHtml(PAGE, NOW);
  assert.equal(a.remote, undefined);
  assert.equal(b.remote, true);
});

test("parseInfoJobsHtml: descarta ofertas sin título o sin enlace", () => {
  const sinEnlace = PAGE.replace(
    "//www.infojobs.net/barcelona/senior-net-developer/of-i340ef9f73f422db941b0249ca47168?applicationOrigin=search-new",
    ""
  );
  assert.equal(parseInfoJobsHtml(sinEnlace, NOW).length, 1);

  const sinTitulo = PAGE.replace("Senior NET Developer", "");
  assert.equal(parseInfoJobsHtml(sinTitulo, NOW).length, 1);
});

test("infoJobsSearchUrl: palabra clave, provincia y paginación", () => {
  const u = infoJobsSearchUrl("programador senior", 33, 3);
  assert.ok(u.includes("/jobsearch/search-results/list.xhtml"));
  assert.ok(u.includes("keyword=programador+senior"));
  assert.ok(u.includes("provinceIds=33"));
  assert.ok(u.includes("page=3"));
  // Página 1 y sin provincia: ninguno de los dos parámetros.
  const simple = infoJobsSearchUrl("programador");
  assert.ok(!simple.includes("page="));
  assert.ok(!simple.includes("provinceIds="));
  // NUNCA la forma segmentada: ignora la palabra clave.
  assert.ok(!u.includes("/ofertas-trabajo/"));
});

test("resolveInfoJobsProvinceId: ciudad → provincia → id de InfoJobs", () => {
  // La tabla se sondeó contra la web: Álava=2, Madrid=33, A Coruña=28.
  assert.equal(resolveInfoJobsProvinceId("Vitoria-Gasteiz"), 2);
  assert.equal(resolveInfoJobsProvinceId("Álava"), 2);
  assert.equal(resolveInfoJobsProvinceId("Madrid"), 33);
  assert.equal(resolveInfoJobsProvinceId("Bilbao"), 51);
  assert.equal(resolveInfoJobsProvinceId("A Coruña"), 28);
  // Desconocida → sin id (y la ingesta devuelve vacío en vez de ruido nacional).
  assert.equal(resolveInfoJobsProvinceId("Lisboa"), undefined);
  assert.equal(resolveInfoJobsProvinceId(undefined), undefined);
});
