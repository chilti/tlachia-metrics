import sys
sys.path.insert(0, '/mnt/expansion/desplegados/TlachIA-Metrics')
from openalex_indicators_engine import TlachIAMetricsEngine

engine = TlachIAMetricsEngine()

sid = 'S2737081250'

# 1. Total in works_flat with source_id all time
df_all = engine.query_engine.query_df(f"""
    SELECT count(*) as total, min(publication_year) as min_yr, max(publication_year) as max_yr
    FROM works_flat 
    WHERE source_id = '{sid}' OR source_id = 'https://openalex.org/{sid}'
""")
print(f"1. Total histórico en works_flat (sin filtros de año ni tipo):")
print(df_all)

# 2. Total with default year range in TlachIA UI (2015-2026)
df_2015 = engine.query_engine.query_df(f"""
    SELECT count(*) as total_2015_2026
    FROM works_flat 
    WHERE (source_id = '{sid}' OR source_id = 'https://openalex.org/{sid}')
      AND publication_year >= 2015 AND publication_year <= 2026
""")
print(f"\n2. Total en rango 2015-2026:")
print(df_2015)

# 3. Total only for type = 'article' (sin otros tipos)
df_art = engine.query_engine.query_df(f"""
    SELECT count(*) as total_art_only
    FROM works_flat 
    WHERE (source_id = '{sid}' OR source_id = 'https://openalex.org/{sid}')
      AND lower(type) = 'article'
""")
print(f"\n3. Total solo de tipo 'article' histórico:")
print(df_art)

# 4. Total by type across all years
df_types = engine.query_engine.query_df(f"""
    SELECT type, count(*) as c
    FROM works_flat 
    WHERE source_id = '{sid}' OR source_id = 'https://openalex.org/{sid}'
    GROUP BY type ORDER BY c DESC
""")
print(f"\n4. Desglose por tipo (Histórico):")
print(df_types)

# 5. Total by publication year
df_years = engine.query_engine.query_df(f"""
    SELECT publication_year, count(*) as c
    FROM works_flat 
    WHERE source_id = '{sid}' OR source_id = 'https://openalex.org/{sid}'
    GROUP BY publication_year ORDER BY publication_year ASC
""")
print(f"\n5. Desglose por año:")
print(df_years.to_string())
