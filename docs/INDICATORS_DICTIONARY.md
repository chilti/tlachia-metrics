# Diccionario de Indicadores Cienciométricos y Económicos 📚🔍

**TlachIA Metrics (`openalex_indicators_engine`)**  
Este documento describe cada uno de los indicadores calculados en los 48 reportes Excel del paquete unificado.

---

## 1. Indicadores de Volumen y Citación

* **`Documents`**: Recuento total de artículos y publicaciones únicas asociadas a la entidad.
* **`Rank`**: Posición ordinal en la tabla ordenada de forma descendente por número de documentos.
* **`Publication Year`**: Año de publicación (presente en los reportes de tendencia anual *Trend*).
* **`Times Cited`**: Total acumulado de citas recibidas por los documentos según OpenAlex.
* **`Citation Impact`**: Promedio de citas por documento ($\text{Times Cited} / \text{Documents}$).
* **`% Docs Cited`**: Porcentaje de artículos que han recibido al menos 1 cita ($citas \ge 1$).

---

## 2. Indicadores de Impacto Normalizado y Excelencia

* **`Category Normalized Citation Impact (CNCI / FWCI)`**: Impacto normalizado por campo de conocimiento, cohorte temporal y tipo documental (Línea base mundial = 1.0).
* **`Average Percentile`**: Percentil promedio de citación normalizado por subcampo (escala 0 a 100).
* **`Documents in Top 10%`**: Cantidad de documentos ubicados en el percentil $\ge 90$ de su disciplina/año.
* **`% Documents in Top 10%`**: Proporción de artículos en el 10% superior de citación mundial.
* **`Documents in Top 1%`**: Cantidad de documentos ubicados en el percentil $\ge 99$ (máxima excelencia global).
* **`% Documents in Top 1%`**: Proporción de artículos en el 1% superior de citación mundial.

---

## 3. Índices de Producción y Trayectoria

* **`H-Index`**: Mayor entero $h$ tal que la entidad tiene al menos $h$ artículos con $\ge h$ citas cada uno.
* **`i10-Index`**: Cantidad de artículos que acumulan al menos 10 citas.

---

## 4. Indicadores de Ciencia Abierta y Acceso

* **`% All Open Access Documents`**: Porcentaje total de artículos accesibles en cualquier vía abierta.
* **`% Free to Read / Diamond Documents`**: Publicaciones en revistas de Acceso Abierto Diamante (sin costo para autores ni lectores).
* **`% Gold Documents`**: Publicaciones en revistas de cobro por procesamiento de artículo (APC).
* **`% Gold - Hybrid Documents`**: Artículos abiertos dentro de revistas tradicionales por suscripción con APC pagado.
* **`% Green Repository Documents`**: Artículos autoarchivados en repositorios institucionales, temáticos o regionales.
* **`% Non-Open Access Documents`**: Artículos en acceso cerrado bajo muro de pago (*paywall*).
* **`% DOAJ Indexed Documents`**: Publicaciones en revistas registradas y evaluadas en el Directory of Open Access Journals.
* **`% CWTS Core Documents`**: Publicaciones dentro del núcleo de revistas de alta calidad metodológica de Leiden CWTS.

---

## 5. Indicadores Económicos de Publicación (APC)

* **`Estimated APC Paid (USD)`**: Estimación monetaria del gasto total pagado a editoriales comerciales por concepto de APC.
* **`Average APC per Document (USD)`**: Costo promedio pagado por artículo publicado.
* **`Estimated Diamond Savings (USD)`**: Ahorro económico generado a las instituciones al publicar por la vía Diamante frente a la tarifa media comercial ($1,800 USD/artículo).

---

## 6. Indicadores de Colaboración e Internacionalización

* **`% International Collaborations`**: Artículos con autores afiliados a instituciones de $\ge 2$ países distintos.
* **`% Domestic Collaborations`**: Artículos con coautoría exclusiva entre instituciones nacionales.
* **`% Industry Collaborations`**: Artículos en colaboración con empresas o el sector productivo (`type = company`).
* **`% Global South Collaborations`**: Artículos con coautoría exclusiva entre países del Sur Global (Cooperación Sur-Sur).

---

## 7. Indicadores de Integridad Científica

* **`% Retracted Papers`**: Porcentaje de artículos retractados formalmente por mala praxis, error o fraude.
* **`% Paratext Documents`**: Porcentaje de notas editoriales, prefacios y anuncios catalogados para filtrar ruido bibliométrico.
