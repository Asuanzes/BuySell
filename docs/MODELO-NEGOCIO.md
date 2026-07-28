# Modelo estratégico y de negocio de Nidokey

> **Documento normativo — fuente central para producto, priorización y
> monetización.** Aprobado el 2026-07-28.
>
> Toda decisión relevante de diseño, desarrollo, integración, adquisición o
> monetización debe evaluarse contra este modelo. Si una propuesta entra en
> conflicto con él, no se implementa hasta actualizar explícitamente este
> documento y justificar el cambio con datos o una decisión estratégica.

## 1. Tesis de producto

Nidokey no es un agregador de categorías. Es una aplicación para **seguir
decisiones importantes, detectar cambios y actuar en el momento adecuado**.

Un registro no es el producto final: es una alternativa dentro de una decisión.
La ventaja de Nidokey nace de combinar:

- registros personales multi-vertical;
- históricos y alertas;
- comparación entre alternativas;
- contexto, notas y documentos;
- colaboración mediante chat;
- un bot que entiende los registros y propone próximos pasos;
- acciones comerciales trazables cuando el usuario decide comprar, reservar,
  solicitar o contactar.

La unidad de valor es el **usuario con decisiones activas que vuelve cuando algo
relevante cambia**, no la instalación ni el número bruto de registros.

## 2. Alcance estratégico

### Verticales prioritarias

1. **Inmuebles**: decisión de compra/alquiler, histórico, comparación y leads.
2. **Viajes**: seguimiento de una combinación concreta y reserva afiliada.
3. **Empleo**: pipeline de candidatura y servicios de preparación.
4. **Cripto y mercados**: alertas, diario de tesis y análisis; nunca asesoría.
5. **Libros**: retención, objetivos de aprendizaje y afiliación secundaria.
6. **Tendencias**: contexto para los demás registros, no negocio independiente.
7. **Chat y bot**: tejido transversal de colaboración, alertas y automatización.

### Fuera del caso económico central

- **Comida** no forma parte de la proyección ni del roadmap comercial hacia
  producción. No se asumen repartidores ni una operación logística.
- **Entrenos** permanece fuera del roadmap de producción.

El código existente de estas verticales no autoriza a invertir más producto en
ellas. Reactivarlas exige una decisión explícita, evidencia de demanda y una
actualización de este documento.

## 3. Posicionamiento

La promesa de Nidokey es:

> **Guarda tus alternativas. Nidokey vigila qué cambia, te ayuda a compararlas y
> coordina el siguiente paso con las personas implicadas.**

Nidokey no debe competir por amplitud de catálogo con Idealista, Skyscanner,
LinkedIn, Amazon o un broker. Esas plataformas resuelven descubrimiento y
transacción dentro de una vertical. Nidokey resuelve la continuidad de una
decisión entre sesiones, fuentes y personas.

## 4. Capacidades diferenciadoras

### 4.1 Espacios de decisión

Los registros deben poder agruparse por objetivo:

```text
Objetivo
├── alternativas guardadas
├── cambios desde la última visita
├── comparación y criterios
├── notas y documentos
├── personas implicadas
├── alertas
├── próximas acciones
└── decisión y resultado
```

Ejemplos: «Comprar vivienda en Oviedo», «Viaje a Japón», «Cambiar de empleo» o
«Construir una cartera conservadora».

### 4.2 Resumen de cambios

La funcionalidad Premium principal debe ser un resumen diario o semanal:

> «Bajaron dos inmuebles, una oferta vence el viernes, el viaje cuesta 74 €
> menos y tres tendencias afectan a tus activos».

Las alertas dejan de ser avisos aislados y forman una memoria cronológica en el
DM de @Nidokey.

### 4.3 Comparador universal

Una capa común permite seleccionar registros, definir criterios, ponderarlos,
añadir riesgos, compartir la comparación y registrar la decisión final. Cada
vertical aporta sus campos específicos sin romper el contrato común
`BaseRecord`.

### 4.4 Historial de decisión

Cada registro debe poder explicar:

- por qué se añadió;
- qué expectativa tenía el usuario;
- qué cambió;
- qué acciones se realizaron;
- por qué se eligió o descartó;
- cuál fue el resultado.

### 4.5 Bot orientado a acciones

El bot debe priorizar operaciones sobre el contexto del usuario:

- comparar alternativas;
- resumir cambios;
- preparar preguntas para una visita;
- adaptar una candidatura;
- filtrar combinaciones de viaje;
- recordar la tesis escrita por el propio usuario;
- avisar o consultar a un grupo.

El volumen de mensajes es un coste y un límite operativo, no la propuesta de
valor principal de Premium.

## 5. Modelo de ingresos

### 5.1 Base: Nidokey Premium

- Precio vigente: **4,99 €/mes**.
- Precio anual objetivo cuando exista IAP: **49,99 €/año**.
- Neto orientativo por suscriptor vía tienda en España: **~3,51 €/mes** antes
  de infraestructura y coste variable.

Premium debe vender continuidad y automatización:

- más alertas;
- resumen de cambios;
- comparaciones ilimitadas;
- espacios compartidos;
- historial ampliado;
- automatizaciones;
- informes/exportaciones;
- bot sobre todos los registros.

### 5.2 Ingresos incrementales

| Vertical | Modelo primario | Modelo secundario |
| --- | --- | --- |
| Viajes | afiliación/margen por reserva | seguro, actividades, coche, eSIM |
| Inmuebles | CPL por lead aceptado | informes, servicios auxiliares, B2B |
| Empleo | servicios de candidatura | afiliación formación/CV, B2B futuro |
| Mercados/cripto | Premium/add-on | informe fiscal/exportación |
| Libros | afiliación | clubes/funciones Premium |
| Tendencias | retención contextual | informes o B2B solo con escala |

Hasta que exista un contrato, programa aprobado y atribución verificable, el
ingreso esperado de un partner se contabiliza como **cero**.

### 5.3 Lo que no se hará inicialmente

- comisión porcentual sobre la venta de inmuebles;
- afiliación ligada a volumen negociado en brokers o exchanges;
- recomendaciones financieras personalizadas;
- publicidad programática dentro del chat;
- logística o reparto de comida;
- desarrollo de verticales solo porque técnicamente sea fácil añadirlas.

## 6. Proyección central

Las cifras son hipótesis de planificación, no previsiones. Deben sustituirse por
cohortes reales cuando exista tráfico suficiente.

### Escenario central con 10.000 MAU

| Fuente | Hipótesis | Ingreso mensual |
| --- | --- | ---: |
| Premium | 2 % × 10.000 × 3,51 € netos | 702 € |
| Viajes | 15 reservas × 27 € | 405 € |
| Inmuebles | 6–10 leads aceptados × 25 € | 150–250 € |
| Empleo | 20 conversiones × 7 € | 140 € |
| Libros | 30 compras × 0,80 € | 24 € |
| Mercados/cripto | incluido en Premium | 0 € adicional |
| Tendencias | sin escala comercial | 0 € |
| **Total central** | antes de costes | **1.421–1.521 €/mes** |

### Rango por escala

| MAU | Prudente | Central | Fuerte |
| ---: | ---: | ---: | ---: |
| 1.000 | 50 € | 130–180 € | 300 € |
| 5.000 | 400 € | 700–900 € | 1.600 € |
| 10.000 | 800 € | 1.400–1.700 € | 3.000 € |
| 25.000 | 2.000 € | 4.000–5.500 € | 9.000 € |
| 50.000 | 4.000 € | 8.000–11.000 € | 18.000 € |

El escenario fuerte exige conversión Premium cercana al 4 %, reservas
atribuidas, acuerdos de leads aceptados y retención D30 saludable.

## 7. Estrategia por vertical

### Inmuebles

Producto: expediente de decisión con duplicados, histórico, comparación, coste
total, checklist de visita, notas, documentos, colaboración e informe.

Monetización por orden:

1. Premium;
2. informe de decisión de 6,99–9,99 €;
3. lead consentido y aceptado de 15–40 €;
4. CPA de tasación, reforma, seguro, abogado o mudanza;
5. modo inversor de 9,99–19,99 €/mes;
6. B2B posterior de 49–149 €/mes.

No se cobra porcentaje sobre una venta sin validar atribución, encaje legal y
economía mediante un acuerdo real.

### Viajes

Producto: guardar una búsqueda exacta —fechas, aeropuertos, ocupación,
equipaje, escalas, hotel y presupuesto— y volver a cotizar alternativas
equivalentes.

Monetización: vuelos afiliados, margen hotelero, actividades, seguro, eSIM,
coche y traslados. La proyección central a 10.000 MAU es 270–540 €/mes.

### Empleo

Producto: pipeline
`descubierta → interesante → preparando → solicitada → entrevista → oferta`,
con comparación, CV adaptado, preparación y seguimiento.

Monetización: Premium, paquetes de candidatura, revisión humana, afiliación de
CV/formación y B2B solo después de validar la demanda.

### Mercados y cripto

Producto: diario de tesis, alertas, exposición, concentración, rendimiento,
eventos que invalidan la tesis e informe fiscal.

Monetización: Premium y add-ons. No se monetiza incentivando operaciones ni
ordenando proveedores por la comisión que pagan.

### Libros

Producto: intención de lectura, estado, notas, préstamos, objetivos de
aprendizaje y listas compartidas. Afiliación secundaria; no justificar
infraestructura propia con su ingreso esperado.

### Tendencias

Producto: relacionar información nueva con registros existentes. Su objetivo
inicial es reactivación y contexto, no ingresos directos.

## 8. Capa comercial común

No se implementará afiliación de forma ad hoc en cada pantalla. El diseño
objetivo es una acción comercial transversal:

```text
CommercialAction
- recordType / recordId
- action: BUY | BOOK | APPLY | CONTACT | REQUEST_REPORT
- provider
- destinationUrl
- commercialModel: AFFILIATE | CPL | CPA | FIXED
- expectedCommission
- disclosure
- attributionId
```

Eventos mínimos:

```text
commercial_action_view
commercial_action_click
partner_redirect
lead_submitted
conversion_confirmed
commission_confirmed
```

La interfaz siempre identifica que existe una relación comercial. La fuente de
verdad del ingreso es un webhook/postback o conciliación del proveedor, nunca
un clic del cliente.

## 9. Filtro obligatorio de decisiones

Antes de aprobar una feature o integración se responde:

1. ¿Ayuda a seguir, comparar o completar una decisión?
2. ¿Aumenta activación, retención, conversión o ingreso medible?
3. ¿Reutiliza la arquitectura transversal en vez de crear un silo?
4. ¿Tiene un evento y una métrica de éxito definidos?
5. ¿Su coste variable está limitado y es observable?
6. ¿Protege la confianza, privacidad y neutralidad del usuario?
7. ¿Desplaza una prioridad con mejor impacto esperado?

Una propuesta que no supera este filtro se descarta o se aparca.

## 10. Secuencia de desarrollo

1. Lanzamiento, medición del embudo y coste por usuario.
2. Espacios de decisión e historial.
3. Comparador universal.
4. Resumen de cambios.
5. Premium anual e IAP.
6. Capa común de acciones y atribución.
7. Primera validación comercial en Viajes.
8. Leads inmobiliarios en un mercado geográfico acotado.
9. Pipeline y servicios de Empleo.
10. Add-ons de mayor valor solo con evidencia de uso.

## 11. Métricas rectoras

- decisiones activas por MAU;
- porcentaje de usuarios que vuelve por un cambio/alerta;
- activación: primer registro y primera decisión;
- retención D7/D30 por vertical;
- conversión `paywall_view → subscribe_success`;
- coste variable por usuario gratuito y Premium;
- clics comerciales atribuidos;
- conversiones y comisión confirmada;
- ingreso neto por MAU;
- porcentaje de decisiones finalizadas con resultado registrado.

Este modelo se revisa con datos reales, inicialmente cada trimestre. Las cifras
pueden cambiar; la tesis solo cambia mediante una decisión explícita y
documentada.
