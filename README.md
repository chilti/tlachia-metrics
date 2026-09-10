# TlachIA Metrics 🔬📊

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22693945.svg)](https://doi.org/10.5281/zenodo.22693945)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

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

---

## 👥 Autores

- **José Luis Jiménez Andrade** (ORCID: [0000-0003-3453-7159](https://orcid.org/0000-0003-3453-7159))  
  *Facultad de Ciencias y Centro de Ciencias de la Complejidad (C3), Universidad Nacional Autónoma de México (UNAM)*
- **Humberto Andrés Carrillo Calvet** (ORCID: [0000-0003-3659-6769](https://orcid.org/0000-0003-3659-6769))  
  *Facultad de Ciencias y Centro de Ciencias de la Complejidad (C3), Universidad Nacional Autónoma de México (UNAM)*

---

## 📖 Cómo Citar / Citation

Si utilizas **TlachIA Metrics** en tus investigaciones, análisis cienciométricos o desarrollos de software, por favor cita este repositorio utilizando la siguiente referencia oficial:

### Formato APA:
> Jiménez Andrade, J. L., & Carrillo Calvet, H. A. (2026). *TlachIA Metrics: Unified Scientometric Indicators Calculation Engine for OpenAlex* (Version v1.0.0) [Computer software]. Zenodo. [https://doi.org/10.5281/zenodo.22693945](https://doi.org/10.5281/zenodo.22693945)

### Formato BibTeX:
```bibtex
@software{jimenez_andrade_2026_22693945,
  author       = {Jiménez Andrade, José Luis and
                  Carrillo Calvet, Humberto Andrés},
  title        = {TlachIA Metrics: Unified Scientometric Indicators Calculation Engine for OpenAlex},
  month        = sep,
  year         = 2026,
  publisher    = {Zenodo},
  version      = {v1.0.0},
  doi          = {10.5281/zenodo.22693945},
  url          = {https://doi.org/10.5281/zenodo.22693945}
}
```

---

## 🙏 Agradecimientos

Nuestro especial reconocimiento y agradecimiento a **Romel Calero Ramos**, por el diseño, despliegue y administración de la infraestructura de servidores y base de datos analítica masiva en **ClickHouse** en el **Centro de Ciencias de la Complejidad (C3, UNAM)**, pilar fundamental para el procesamiento y consulta a gran escala de los datos de este proyecto.
