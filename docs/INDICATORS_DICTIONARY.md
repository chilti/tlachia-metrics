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

* **`Field-Weighted Citation Impact (FWCI)`**: Impacto normalizado por campo de conocimiento, cohorte temporal y tipo documental (Línea base mundial = 1.0).
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
* **`% Bronze Documents`**: Publicaciones de acceso libre temporal o permanente en el sitio web de la editorial sin una licencia abierta explícita (Creative Commons).
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

---

## 8. Reportes Específicos del Corpus (Línea Base General)

El paquete unificado de TlachIA Metrics incorpora a la entidad **`Corpus`** como punto de referencia canónico global para contrastar el desempeño de las 16 entidades restantes:

* **`03_Historico_Completo/Corpus.xlsx`**: Resumen macro de todos los 32 indicadores para la totalidad del corpus a lo largo de todo el horizonte temporal.
* **`02_Periodos_Consecutivos/Corpus {p}.xlsx`**: Indicadores globales desagregados para cada ventana temporal quinquenal o personalizada.
* **`02_Periodos_Consecutivos/Corpus Periodos Consecutivos.xlsx`**: Tabla cronológica consolidada en filas consecutivas que incluye indicadores de variación interperiódica:
  * **`Δ% Documents (Interperiod)`**: Tasa de crecimiento del volumen de artículos respecto al periodo anterior:
    $$\Delta\% \text{Docs} = \frac{\text{Docs}_t - \text{Docs}_{t-1}}{\text{Docs}_{t-1}} \times 100$$
  * **`Δ% Times Cited (Interperiod)`**: Tasa de crecimiento de citas respecto al periodo anterior:
    $$\Delta\% \text{Citas} = \frac{\text{Citas}_t - \text{Citas}_{t-1}}{\text{Citas}_{t-1}} \times 100$$
  * **`Δ FWCI (Interperiod)`**: Variación absoluta del impacto normalizado ponderado:
    $$\Delta \text{FWCI} = \text{FWCI}_t - \text{FWCI}_{t-1}$$
* **`01_Matrices_Desempeño_Longitudinal/Corpus Performance Matrix.xlsx`**: Matriz en formato horizontal (*wide format*) que compara los indicadores clave del corpus a través de los periodos consecutivos.
* **`04_Tendencias_Anuales/Corpus Trend.xlsx`**: Serie temporal año por año con tasas de crecimiento anual (`Δ% Documents (Annual)` y `Δ% Times Cited (Annual)`).

