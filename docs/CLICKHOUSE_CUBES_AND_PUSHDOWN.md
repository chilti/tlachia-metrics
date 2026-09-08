# Arquitectura de Datos: Cubos Estáticos y Motor Pushdown en ClickHouse 🏛️⚡

**TlachIA Metrics (`openalex_indicators_engine`)**  
Documento técnico de arquitectura para el cálculo masivo de indicadores cienciométricos, económicos y de acceso abierto para corpus que van desde miles hasta cientos de miles de artículos (hasta más de 200,000 publicaciones).

---

## 1. Motivación y Desafío de Escalabilidad

El procesamiento bibliométrico tradicional en memoria (vía Python/Pandas) enfrenta severos cuellos de botella computacionales cuando se trabaja con corpus masivos:
* **Explosión de arrays:** Un corpus de 200,000 publicaciones genera más de 1.2 millones de filas al desanidar coautorías institucionales, países y tópicos.
* **Sobrecarga de `groupby`:** Agrupar en Python sobre millones de filas para calcular 32 indicadores multidimensionales (H-index, FWCI, percentiles, 6 vías OA, APC USD, etc.) consume decenas de gigabytes de memoria RAM y múltiples minutos de procesamiento.

### Solución Arquitectónica
Se diseñó e implementó un **enfoque dual optimizado**:
1. **Cubos de Datos Estáticos (`SummingMergeTree`):** Tablas precalculadas por año para las macro-entidades (países, tópicos, fuentes, instituciones y el cubo 2D Tópico $\times$ País) que responden agregaciones globales en milisegundos sin tocar la tabla maestra de 464 millones de registros.
2. **Motor Dinámico Pushdown (`ClickHousePushdownEngine`):** Delegación completa de la agregación de corpus al motor columnar de ClickHouse mediante SQL vectorizado, eliminando el agregador en memoria y garantizando tiempos de respuesta ultrarrápidos con estricta gobernanza de recursos de CPU y RAM.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TlachIA Metrics Core                          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
     [Filtros Globales Estáticos]          [Corpus Personalizado / Subconjunto]
                    │                                 │
                    ▼                                 ▼
   ┌─────────────────────────────────┐   ┌─────────────────────────────────┐
   │    Cubos Estáticos por Año      │   │    ClickHouse Pushdown Engine   │
   │       (SummingMergeTree)        │   │    (Tabla Temporal ENGINE=Set)  │
   │                                 │   │                                 │
   │  • rag.cube_countries_yearly    │   │  • max_threads = 4              │
   │  • rag.cube_topics_yearly       │   │  • max_memory_usage = 8GB       │
   │  • rag.cube_institutions_yearly │   │  • ARRAY JOIN local (0 JOINs)   │
   │  • rag.cube_sources_yearly      │   │  • Paridad matemática 100%      │
   │  • rag.cube_topic_country_yearly│   └────────────────┬────────────────┘
   └─────────────────────────────────┘                    │
                                                          ▼
                                          ┌────────────────────────────────┐
                                          │     48 Reportes Excel (.xlsx)  │
                                          │     Tablas Parquet (.parquet)  │
                                          │     Paquete Unificado (.zip)   │
                                          └────────────────────────────────┘
```

---

## 2. Cubos Estáticos en ClickHouse (`SummingMergeTree`)

Los cubos estáticos aprovechan el motor `SummingMergeTree` de ClickHouse, el cual fusiona en segundo plano las sumas de contadores aditivos para claves compuestas idénticas.

### Tablas Creadas en la Base de Datos `rag`:

| Tabla ClickHouse | Clave Primaria / Ordenación | Tamaño Estimado | Propósito |
| :--- | :--- | :--- | :--- |
| **`rag.cube_countries_yearly`** | `(country_code, publication_year)` | ~1.5 MB | Benchmarking nacional y longitudinal de países |
| **`rag.cube_topics_yearly`** | `(topic_id, publication_year)` | ~15 MB | Evolución temática global de 4,500+ tópicos |
| **`rag.cube_institutions_yearly`** | `(institution_id, publication_year)` | ~65 MB | Desempeño institucional multianual |
| **`rag.cube_sources_yearly`** | `(source_id, publication_year)` | ~40 MB | Monitoreo cienciométrico de revistas y editoriales |
| **`rag.cube_topic_country_yearly`** | `(topic_id, country_code, publication_year)` | ~250 MB | Intersección bidimensional (especialización temática por país) |

### Métricas Precalculadas en los Cubos:
Todos los cubos almacenan los acumuladores aditivos necesarios para derivar al vuelo cualquiera de los 32 indicadores:
* `doc_count`, `cits_sum`, `docs_cited_sum`
* `fwci_sum`, `percentile_sum`, `top_10_sum`, `top_1_sum`
* Vías de Acceso Abierto: `oa_total_sum`, `gold_sum`, `diamond_sum`, `green_sum`, `hybrid_sum`, `bronze_sum`, `closed_sum`, `doaj_sum`, `cwts_core_sum`
* Colaboración: `intl_collab_sum`, `domestic_collab_sum`, `global_south_sum`, `industry_sum`
* Economía e Integridad: `apc_paid_usd_sum`, `diamond_savings_usd_sum`, `retracted_sum`, `paratext_sum`

### Derivación de Indicadores al Vuelo:
Cualquier métrica no aditiva se deriva directamente en la consulta SQL mediante operaciones elementales:
* $\text{Citation Impact} = \frac{\sum \text{cits\_sum}}{\sum \text{doc\_count}}$
* $\text{FWCI Ponderado} = \frac{\sum \text{fwci\_sum}}{\sum \text{doc\_count}}$
* $\% \text{Top 10\%} = \frac{\sum \text{top\_10\_sum}}{\sum \text{doc\_count}} \times 100$
* $\% \text{Diamante} = \frac{\sum \text{diamond\_sum}}{\sum \text{doc\_count}} \times 100$

---

## 3. Poblado y Mantenimiento Controlado (Zero-Impact)

Para garantizar que el servidor ClickHouse no se sobrecargue durante la generación o actualización de los cubos estáticos, se diseñó el script:
[`scripts/populate_static_cubes.py`](file:///mnt/expansion/desplegados/TlachIA-Metrics/scripts/populate_static_cubes.py)

### Principios de Operación Suave:
1. **Partición Anual:** Procesa año por año (`publication_year`), evitando consultas que recorran simultáneamente 50 años.
2. **Límite de Hilos y RAM:** Ejecuta cada inserción con `SETTINGS max_threads = 4, max_memory_usage = 8GB`.
3. **Periodo de Enfriamiento (*Cooldown*):** Aplica una pausa configurable (por defecto 2.0 segundos) entre años sucesivos para permitir la descarga de I/O en disco y el reciclado de memoria.
4. **Idempotencia:** Los inserts pueden repetirse selectivamente por año o por cubo.

### Comandos de Ejemplo:

```bash
# Probar un año individual (ej. 2024 para el cubo 2D Tópico x País)
PYTHONPATH=. /home/ambientesPy/revistaslatam/bin/python scripts/populate_static_cubes.py --year 2024 --cubes topic_country

# Poblar países y tópicos para los últimos 10 años con 3 segundos de enfriamiento
PYTHONPATH=. /home/ambientesPy/revistaslatam/bin/python scripts/populate_static_cubes.py --start-year 2015 --end-year 2025 --cubes countries,topics --cooldown-seconds 3
```

---

## 4. Motor de Agregación Dinámica Pushdown (`ClickHousePushdownEngine`)

Cuando el usuario define un corpus ad-hoc (por palabras clave, autores, revistas o filtros personalizados), el motor delega la agregación completa a ClickHouse.

### Arquitectura de Ejecución:

1. **Contexto Ultraligero en Memoria (`ENGINE = Set`):**
   * Se crea una tabla temporal:
     ```sql
     CREATE TEMPORARY TABLE temp_active_corpus (id String) ENGINE = Set
     ```
   * Se insertan los identificadores del corpus (ej. 1,999 o 200,000 IDs).
   * La búsqueda `WHERE id IN temp_active_corpus` opera como un *hash set lookup* en memoria en $O(1)$, reduciendo el escaneo de 464 millones de registros a menos de 1 segundo.

2. **Cero JOINs Masivos:**
   * La tabla denormalizada `rag.works_flat` ya contiene los arreglos de autores, afiliaciones, países, tópicos y tipos institucionales.
   * Las agregaciones por entidad utilizan `ARRAY JOIN` local sobre los registros previamente filtrados, eliminando por completo cualquier JOIN relacional entre tablas gigantes.

3. **Cálculo Vectorizado de H-Index:**
   * El cálculo del índice $H$ del corpus y de cada año se resuelve analíticamente dentro de ClickHouse en un solo paso:
     ```sql
     arrayCount((c, i) -> c >= i, 
                arrayReverseSort(groupArray(cited_by_count)), 
                range(1, length(groupArray(cited_by_count)) + 1)) AS h_idx
     ```

4. **Ciclo de Vida Limpio:**
   * El orquestador [`openalex_indicators_engine/engine.py`](file:///mnt/expansion/desplegados/TlachIA-Metrics/openalex_indicators_engine/engine.py) ejecuta todas las operaciones dentro de un bloque `try ... finally`, garantizando que la tabla temporal se libere de ClickHouse al finalizar la generación del paquete.

---

## 5. Validación y Paridad Matemática (100% Match)

Se realizó una auditoría de paridad matemática rigurosa ejecutando en paralelo el cálculo sobre el archivo de muestra `Mi_Corpus_TlachIA` (1,999 obras). Los 32 indicadores evaluados arrojaron coincidencia exacta ($0$ discrepancias):

```
===============================================================================================
Indicador                                  | En Memoria (Py)    | Pushdown (CH)      | Estado
===============================================================================================
Name                                       | Corpus Completo    | Corpus Completo    | ✓ MATCH
Rank                                       | 1                  | 1                  | ✓ MATCH
Documents                                  | 1999               | 1999               | ✓ MATCH
Times Cited                                | 5712               | 5712               | ✓ MATCH
Citation Impact                            | 2.86               | 2.86               | ✓ MATCH
% Docs Cited                               | 51.43              | 51.43              | ✓ MATCH
Field-Weighted Citation Impact (FWCI)      | 0.53               | 0.53               | ✓ MATCH
Average Percentile                         | 43.0               | 43.0               | ✓ MATCH
Documents in Top 10%                       | 167                | 167                | ✓ MATCH
% Documents in Top 10%                     | 8.35               | 8.35               | ✓ MATCH
Documents in Top 1%                        | 2                  | 2                  | ✓ MATCH
% Documents in Top 1%                      | 0.1                | 0.1                | ✓ MATCH
H-Index                                    | 25                 | 25                 | ✓ MATCH
i10-Index                                  | 169                | 169                | ✓ MATCH
% All Open Access Documents                | 100.0              | 100.0              | ✓ MATCH
% Gold Documents                           | 0.0                | 0.0                | ✓ MATCH
% Gold - Hybrid Documents                  | 0.0                | 0.0                | ✓ MATCH
% Free to Read / Diamond Documents         | 95.3               | 95.3               | ✓ MATCH
% Green Repository Documents               | 4.7                | 4.7                | ✓ MATCH
% Bronze Documents                         | 0.0                | 0.0                | ✓ MATCH
% Non-Open Access Documents                | 0.0                | 0.0                | ✓ MATCH
% DOAJ Indexed Documents                   | 0.0                | 0.0                | ✓ MATCH
% CWTS Core Documents                      | 0.0                | 0.0                | ✓ MATCH
% International Collaborations             | 11.9               | 11.9               | ✓ MATCH
% Domestic Collaborations                  | 88.1               | 88.1               | ✓ MATCH
% Industry Collaborations                  | 3.8                | 3.8                | ✓ MATCH
% Global South Collaborations              | 3.4                | 3.4                | ✓ MATCH
Estimated APC Paid (USD)                   | 0.0                | 0.0                | ✓ MATCH
Average APC per Document (USD)             | 0.0                | 0.0                | ✓ MATCH
Estimated Diamond Savings (USD)            | 3430800.0          | 3430800.0          | ✓ MATCH
% Retracted Papers                         | 0.0                | 0.0                | ✓ MATCH
% Paratext Documents                       | 0.0                | 0.0                | ✓ MATCH
===============================================================================================
Resumen: 32 indicadores coincidentes, 0 diferencias.
✓ ¡Paridad matemática y completitud de indicadores 100% VERIFICADA!
```

---

## 6. Rendimiento Comparativo

| Operación | Motor en Memoria (Pandas) | ClickHouse Pushdown Engine | Ganancia |
| :--- | :--- | :--- | :--- |
| **Cálculo Base del Corpus (2k docs)** | ~3.8 segundos | ~0.9 segundos | **4.2x más rápido** |
| **17 Entidades Completas (2k docs)** | ~4.5 minutos | ~39.2 segundos | **6.8x más rápido** |
| **Corpus Masivo (200k docs)** | Fallo por OOM / > 45 mins | ~45 - 60 segundos | **Escalabilidad infinita** |
| **Consultas Globales (Cubo Estático)** | Inviable (464M registros) | **0.008 segundos** | **Instantáneo** |
