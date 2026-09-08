"""
TlachIA Metrics - DDL de Creación de Cubos de Datos Estáticos Especializados en ClickHouse.
Crea tablas SummingMergeTree compactas para Países, Tópicos, Instituciones, Revistas y Tópico x País.
"""
from openalex_indicators_engine.core.gentle_query_engine import GentleQueryEngine

METRIC_COLUMNS_DDL = """
    doc_count UInt32,
    cits_sum UInt64,
    docs_cited_sum UInt32,
    fwci_sum Float64,
    percentile_sum Float64,
    top_10_sum UInt32,
    top_1_sum UInt32,
    oa_total_sum UInt32,
    gold_sum UInt32,
    diamond_sum UInt32,
    green_sum UInt32,
    hybrid_sum UInt32,
    bronze_sum UInt32,
    closed_sum UInt32,
    doaj_sum UInt32,
    cwts_core_sum UInt32,
    intl_collab_sum UInt32,
    domestic_collab_sum UInt32,
    global_south_sum UInt32,
    industry_sum UInt32,
    apc_paid_usd_sum Float64,
    diamond_savings_usd_sum Float64,
    retracted_sum UInt32,
    paratext_sum UInt32
"""

CUBES_DEFINITIONS = {
    "cube_countries_yearly": f"""
    CREATE TABLE IF NOT EXISTS rag.cube_countries_yearly
    (
        country_code LowCardinality(String),
        publication_year UInt16,
        {METRIC_COLUMNS_DDL}
    )
    ENGINE = SummingMergeTree
    ORDER BY (country_code, publication_year)
    SETTINGS index_granularity = 8192;
    """,

    "cube_topics_yearly": f"""
    CREATE TABLE IF NOT EXISTS rag.cube_topics_yearly
    (
        topic_id LowCardinality(String),
        publication_year UInt16,
        {METRIC_COLUMNS_DDL}
    )
    ENGINE = SummingMergeTree
    ORDER BY (topic_id, publication_year)
    SETTINGS index_granularity = 8192;
    """,

    "cube_institutions_yearly": f"""
    CREATE TABLE IF NOT EXISTS rag.cube_institutions_yearly
    (
        institution_id LowCardinality(String),
        publication_year UInt16,
        {METRIC_COLUMNS_DDL}
    )
    ENGINE = SummingMergeTree
    ORDER BY (institution_id, publication_year)
    SETTINGS index_granularity = 8192;
    """,

    "cube_sources_yearly": f"""
    CREATE TABLE IF NOT EXISTS rag.cube_sources_yearly
    (
        source_id LowCardinality(String),
        publication_year UInt16,
        {METRIC_COLUMNS_DDL}
    )
    ENGINE = SummingMergeTree
    ORDER BY (source_id, publication_year)
    SETTINGS index_granularity = 8192;
    """,

    "cube_topic_country_yearly": f"""
    CREATE TABLE IF NOT EXISTS rag.cube_topic_country_yearly
    (
        topic_id LowCardinality(String),
        country_code LowCardinality(String),
        publication_year UInt16,
        {METRIC_COLUMNS_DDL}
    )
    ENGINE = SummingMergeTree
    ORDER BY (topic_id, country_code, publication_year)
    SETTINGS index_granularity = 8192;
    """
}

def create_cubes():
    engine = GentleQueryEngine()
    client = engine.get_client()
    print("Iniciando verificación y creación de tablas de Cubos Estáticos en ClickHouse...")
    for cube_name, ddl in CUBES_DEFINITIONS.items():
        print(f" -> Verificando / creando {cube_name}...")
        client.command(ddl)
        print(f"    ✓ {cube_name} lista.")
    print("\n✓ ¡Todas las tablas de cubos creadas exitosamente en rag!")

if __name__ == "__main__":
    create_cubes()
