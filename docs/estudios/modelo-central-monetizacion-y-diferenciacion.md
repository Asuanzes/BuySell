# Estudio central de monetización y diferenciación de Nidokey

- **Fecha:** 2026-07-28
- **Autor:** `codex`
- **Estado:** concluido; adoptado como referencia estratégica
- **Documento normativo derivado:** `docs/MODELO-NEGOCIO.md`

## 1. Objetivo y alcance

Este estudio determina cómo puede monetizarse Nidokey de forma realista y qué
funcionalidades pueden diferenciarlo aprovechando su arquitectura actual.

El análisis cubre:

- posicionamiento y unidad de valor del producto;
- suscripción Premium;
- monetización de Inmuebles, Viajes, Empleo, Mercados/Cripto, Libros y
  Tendencias;
- productos derivados, afiliación, CPL, CPA y venta directa;
- proyecciones por escala de usuarios activos;
- riesgos técnicos, económicos, regulatorios y de producto;
- funcionalidades transversales y secuencia de desarrollo.

Quedan fuera del caso económico central:

- **Comida**, porque no existe una operación de reparto viable ni se prevé que
  la vertical alcance producción final;
- **Entrenos**, porque permanece deshabilitada y fuera del roadmap de
  producción.

No se han consultado ni incluido secretos, credenciales o datos personales.

## 2. Estado actual

### Producto

Nidokey es una app móvil de registros personales multi-vertical con chat
integrado. Sus verticales activas o desarrolladas incluyen Inmuebles, Viajes,
Cripto, Mercados, Empleo, Libros, Tendencias y Chat.

La arquitectura de registros se apoya en un contrato común `BaseRecord` con
campos específicos dentro de `meta`. Esto facilita añadir comportamiento
transversal —comparación, alertas, colaboración, historial y acciones
comerciales— sin construir una aplicación separada por vertical.

### Monetización

Existe un plan Premium de 4,99 €/mes con:

- checkout y webhooks;
- entitlements resueltos en servidor;
- proveedor fake y Stripe;
- paywall móvil;
- eventos analíticos de checkout y suscripción.

Para distribución en tiendas sigue pendiente IAP/RevenueCat.

### Capacidades reutilizables

- histórico y deduplicación de inmuebles;
- alertas de precio para Inmuebles, Cripto y Mercados;
- registros y búsquedas guardadas;
- chat multiusuario;
- bot @Nidokey con herramientas sobre registros;
- eventos analíticos propios;
- modelo de Viajes con enlaces afiliados y comisión estimada;
- esquema de pagos y webhooks reutilizable.

## 3. Evidencias verificadas

| Evidencia | Ruta |
| --- | --- |
| Brief actual, verticales, Premium y foco móvil | `CLAUDE.md` |
| Modelo estratégico aprobado | `docs/MODELO-NEGOCIO.md` |
| Plan y precio Premium | `src/lib/billing/plans.ts` |
| Entitlements Premium | `src/lib/billing/entitlements.ts` |
| Operación de pagos y limitaciones IAP | `docs/OPERACIONES.md` |
| Embudo y eventos actuales | `docs/ANALITICA.md` |
| Alertas y DM del bot como historial | `docs/ALERTAS.md` |
| Contrato común de registros | `packages/shared/src/records.ts` |
| Registry de categorías móviles | `apps/mobile/lib/records/config.ts` |
| Modelo de Viajes y afiliación | `packages/shared/src/holiday.ts` |
| Comisión interna de Viajes | `packages/shared/src/holiday-build.ts` |
| Modelos por vertical y suscripción | `prisma/schema.prisma` |
| Checkout y ciclo de pedidos de Comida existente pero no estratégico | `apps/mobile/app/food/checkout.tsx` |

### Evidencia externa considerada

- Stripe España publica 1,5 % + 0,25 € para tarjetas estándar del EEE.
- Apple y Google Play contemplan una comisión del 15 % en los supuestos
  aplicables al proyecto.
- RevenueCat es gratuito hasta 2.500 USD de ingresos mensuales monitorizados y
  cobra después un porcentaje.
- LiteAPI permite configurar margen dinámico en reservas hoteleras.
- La CNMV y las políticas de tienda hacen especialmente sensible la
  monetización por captación o volumen negociado en productos financieros.

Estas condiciones pueden cambiar. Antes de implementar o firmar un acuerdo se
deben reconfirmar sus términos oficiales.

## 4. Tesis central

Nidokey no debe posicionarse como agregador de categorías. Debe ser una
aplicación para:

> **seguir decisiones importantes, detectar cambios, comparar alternativas y
> coordinar el siguiente paso con las personas implicadas.**

Un registro es una alternativa dentro de una decisión. El valor no proviene de
mostrar más inventario que los portales especializados, sino de mantener la
continuidad entre sesiones, fuentes, cambios y personas.

La unidad de valor debe ser el **usuario con decisiones activas que vuelve
cuando algo relevante cambia**, no el número de instalaciones.

## 5. Hallazgos por gravedad

### Críticos

#### C1. No existe todavía evidencia histórica para proyectar beneficio

La analítica define el embudo, pero no hay cohortes suficientes de conversión,
retención, churn o coste por usuario. Cualquier cifra actual es una hipótesis de
planificación.

**Impacto:** riesgo de priorizar features o adquisición basándose en ingresos
no demostrados.

#### C2. La afiliación vale cero hasta que existe atribución y acuerdo real

La presencia de un `affiliateUrl` o una comisión estimada en el modelo no
garantiza aprobación del programa, atribución, conversión ni cobro.

**Impacto:** sobrevaloración de Viajes, Inmuebles o Empleo en previsiones.

### Altos

#### A1. Premium comunica volumen de uso más que resultado

El límite de 400 mensajes diarios del bot es un coste potencial, no una
propuesta de valor diferenciadora.

**Impacto:** margen impredecible y paywall débil.

#### A2. La amplitud de categorías puede diluir el posicionamiento

Una aplicación que parece mezclar inmuebles, vuelos, bolsa, libros y empleo sin
una promesa transversal clara puede resultar difícil de entender y adquirir.

**Impacto:** menor activación y conversión.

#### A3. Falta atribución comercial común

La analítica actual cubre Premium, pero no el ciclo completo:

`acción visible → clic → redirección → conversión → comisión confirmada`.

**Impacto:** imposibilidad de calcular ingreso real por vertical o proveedor.

#### A4. Mercados y Cripto tienen riesgo regulatorio y reputacional

La captación remunerada, las recomendaciones personalizadas y la retribución
ligada al volumen pueden acercar el producto a actividades reguladas o crear
conflictos de interés.

**Impacto:** riesgo legal, rechazo de tienda y pérdida de confianza.

### Medios

#### M1. Alertas no cubren todas las decisiones relevantes

Las alertas vigilan Inmuebles, Cripto y Mercados, pero Viajes y Empleo necesitan
mecanismos equivalentes basados en búsquedas guardadas, precio total, retirada
de oferta o fecha límite.

#### M2. No existe todavía el concepto explícito de espacio de decisión

Los registros se organizan por categoría, pero no por objetivo compartido.

#### M3. No existe comparador transversal

Cada vertical muestra información, pero falta una capa común para criterios,
ponderación, ventajas, riesgos y decisión final.

#### M4. Inmuebles puede confundirse con intermediación

Cobrar porcentaje sobre el precio de venta introduce más complejidad de
atribución, contratos y encaje legal que vender un lead aceptado.

### Bajos

#### B1. Libros tiene poco potencial económico directo

Puede mejorar retención y contexto, pero su afiliación no justifica
infraestructura especializada.

#### B2. Tendencias carece de escala comercial inicial

Su valor es contextualizar y reactivar otros registros, no generar publicidad o
patrocinio con una audiencia pequeña.

## 6. Bugs y riesgos

### Bugs o incoherencias de producto

1. **Comida figura como vertical habilitada** en
   `apps/mobile/lib/records/config.ts`, aunque se ha decidido que no forma parte
   del caso económico y probablemente no llegará a producción final.
2. **Entrenos permanece dentro del tipo común**, aunque está deshabilitada y
   fuera del roadmap.
3. La documentación de alertas afirma que Viajes no tiene precio vigilable,
   mientras el modelo `Holiday` conserva un `currentValue`; lo que falta no es
   un precio, sino una estrategia de recotización comparable.
4. La propuesta Premium multiplica el límite del bot por diez sin una métrica
   de coste por suscriptor.

### Riesgos

- crear demasiadas verticales antes de validar la tesis transversal;
- añadir afiliación ad hoc en cada pantalla;
- mezclar resultados orgánicos y comerciales sin disclosure;
- usar clics del cliente como fuente de verdad de ingresos;
- adquirir usuarios antes de conocer D30, churn y LTV;
- operar como asesor financiero o intermediario sin pretenderlo;
- guardar más contexto personal del necesario;
- invertir en B2B antes de validar el flujo B2C;
- asumir que los ingresos escalan linealmente con MAU.

## 7. Proyección económica central

Las cantidades son hipótesis antes de infraestructura, IA, soporte, marketing e
impuestos.

### Escenario con 10.000 MAU

| Fuente | Hipótesis central | Ingreso mensual |
| --- | --- | ---: |
| Premium | 2 % × 10.000 × 3,51 € netos | 702 € |
| Viajes | 15 reservas × 27 € | 405 € |
| Inmuebles | 6–10 leads aceptados × 25 € | 150–250 € |
| Empleo | 20 conversiones × 7 € | 140 € |
| Libros | 30 compras × 0,80 € | 24 € |
| Mercados/cripto | incluido en Premium | 0 € adicional |
| Tendencias | sin escala comercial | 0 € |
| **Total central** | | **1.421–1.521 €/mes** |

### Rango por escala

| MAU | Prudente | Central | Fuerte |
| ---: | ---: | ---: | ---: |
| 1.000 | 50 € | 130–180 € | 300 € |
| 5.000 | 400 € | 700–900 € | 1.600 € |
| 10.000 | 800 € | 1.400–1.700 € | 3.000 € |
| 25.000 | 2.000 € | 4.000–5.500 € | 9.000 € |
| 50.000 | 4.000 € | 8.000–11.000 € | 18.000 € |

Superar 5.000 €/mes exige aproximadamente 25.000–35.000 MAU con retención
saludable, o un producto B2B/add-on de mayor precio ya validado.

## 8. Decisiones propuestas

### D1. Adoptar el seguimiento de decisiones como posicionamiento central

Toda nueva funcionalidad debe mejorar seguimiento, comparación, colaboración,
reacción a cambios o finalización de una decisión.

### D2. Mantener Premium como base económica

Premium monetiza continuidad y automatización:

- más alertas;
- resumen de cambios;
- comparaciones;
- espacios compartidos;
- historial ampliado;
- automatizaciones;
- informes y exportaciones;
- bot contextual.

### D3. Excluir Comida y Entrenos del roadmap económico

No se asigna desarrollo adicional salvo revisión explícita basada en evidencia.

### D4. Priorizar Viajes como primera validación afiliada

Ya existe estructura de precio total, enlace comercial y comisión. Es posible
validar el funnel sin red local de proveedores.

### D5. Monetizar Inmuebles por CPL antes que por porcentaje de venta

Se cobra por lead consentido y aceptado. El porcentaje sobre compraventa se
aplaza hasta demostrar atribución, encaje legal y contrato.

### D6. Monetizar Mercados y Cripto mediante producto, no operaciones

Se priorizan diario de tesis, alertas, exposición, informes y exportaciones. No
se vincula remuneración al volumen negociado.

### D7. Crear una capa comercial transversal

Diseño objetivo:

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

Eventos:

```text
commercial_action_view
commercial_action_click
partner_redirect
lead_submitted
conversion_confirmed
commission_confirmed
```

## 9. Recomendaciones priorizadas

### P0 — Antes de escalar adquisición

1. Medir coste variable por usuario gratuito y Premium.
2. Completar IAP/RevenueCat para las tiendas.
3. Medir conversión, D7, D30, churn y decisiones activas.
4. Corregir el posicionamiento visible para que las categorías respondan a una
   promesa común.

### P1 — Diferenciación principal

1. Crear espacios de decisión.
2. Implementar historial de decisión.
3. Añadir comparador universal.
4. Generar resumen diario/semanal de cambios.
5. Orientar el bot a próximos pasos y operaciones sobre registros.

### P2 — Monetización incremental

1. Crear la capa `CommercialAction` y la atribución completa.
2. Validar un partner de Viajes.
3. Ejecutar un piloto de leads inmobiliarios en una zona acotada.
4. Construir pipeline y servicios derivados de Empleo.

### P3 — Expansión solo con evidencia

1. Add-on inversor o fiscal.
2. Producto B2B inmobiliario.
3. Informes B2B de Tendencias.
4. Nuevas verticales únicamente si reutilizan el núcleo y superan el filtro de
   decisiones.

## 10. Filtro de desarrollo

Antes de aprobar una propuesta:

1. ¿Ayuda a seguir, comparar o completar una decisión?
2. ¿Mejora activación, retención, conversión o ingreso medible?
3. ¿Reutiliza la arquitectura común?
4. ¿Tiene métrica y evento de éxito?
5. ¿Su coste variable está limitado?
6. ¿Protege confianza, privacidad y neutralidad?
7. ¿Desplaza una prioridad de mayor impacto?

Las propuestas que no superan el filtro se descartan o se aparcan.

## 11. Siguientes pasos

1. Usar `docs/MODELO-NEGOCIO.md` como autoridad normativa.
2. Decidir si Comida se oculta o elimina de la navegación de producción.
3. Definir el modelo mínimo de espacios de decisión.
4. Diseñar el comparador universal sobre `BaseRecord`.
5. Añadir eventos comerciales a `docs/ANALITICA.md`.
6. Instrumentar coste del bot y APIs por usuario/vertical.
7. Conseguir y validar un partner de Viajes.
8. Sustituir las proyecciones por cohortes reales tras el lanzamiento.
9. Revisar el modelo trimestralmente o cuando exista evidencia que cambie una
   hipótesis central.
