# TlachIA Metrics 🔬📊

**TlachIA Metrics** es una plataforma de inteligencia cienciométrica y motor analítico diseñado para construir corpus personalizados sobre **OpenAlex ClickHouse** y calcular la batería completa de indicadores de producción, impacto, ciencia abierta diamante, economía de APC, redes de colaboración y taxonomías de conocimiento.

---

## 🏛️ Estructura del Proyecto

- `openalex_indicators_engine/`: Motor reutilizable de cálculo
  - `core/`: Configuración, cliente ClickHouse no bloqueante y normalizador universal
  - `aggregators/`: 16 Agregadores por entidad (Locations, Organizations, Researchers, Sources, Funders, Topics, Concepts, Keywords, APC, etc.)
  - `exporters/`: Generador de 48 libros Excel estilizados, empaquetador Zip y Parquets
  - `cli.py`: Interfaz de línea de comandos
  - `engine.py`: Orquestador maestro `TlachIAMetricsEngine`
- `api/`: Backend FastAPI con endpoints REST para ingesta, cálculo y descarga
- `data/`: Almacén de caché y exportación de paquetes .zip

---

## 🚀 Uso mediante CLI

```bash
# 1. Procesar un corpus desde archivo JSON o CSV
PYTHONPATH=/mnt/expansion/desplegados/TlachIA-Metrics /home/ambientesPy/revistaslatam/bin/python openalex_indicators_engine/cli.py \
    --file /ruta/a/archivo.json \
    --package-name Mi_Corpus_Metrics

# 2. Extraer y procesar por ID de Revista
PYTHONPATH=/mnt/expansion/desplegados/TlachIA-Metrics /home/ambientesPy/revistaslatam/bin/python openalex_indicators_engine/cli.py \
    --source S2737081250 \
    --package-name Revista_Estudios_Demograficos
```

---

## 🌐 Uso mediante Python SDK

```python
import sys
sys.path.insert(0, "/mnt/expansion/desplegados/TlachIA-Metrics")

from openalex_indicators_engine import TlachIAMetricsEngine

engine = TlachIAMetricsEngine()
df = engine.load_corpus("/ruta/a/corpus.json")
resultado = engine.process_and_export_package(df, package_name="Analisis_2026")
print(f"Total artículos: {resultado['total_works']}")
print(f"Paquete .zip generado: {resultado['zip_path']}")
```
