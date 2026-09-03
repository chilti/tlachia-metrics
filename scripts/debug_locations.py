import sys
sys.path.insert(0, '/mnt/expansion/desplegados/TlachIA-Metrics')
from openalex_indicators_engine import TlachIAMetricsEngine

engine = TlachIAMetricsEngine()

sid = 'S2737081250'

# Check if works_locations exists
try:
    df_loc = engine.query_engine.query_df(f"""
        SELECT count(DISTINCT work_id) as total_loc_distinct
        FROM works_locations 
        WHERE source_id = '{sid}' OR source_id = 'https://openalex.org/{sid}'
    """)
    print("Total en works_locations:", df_loc)
except Exception as e:
    print("Error en works_locations:", e)

# Check if there are other journals related to Colegio de Mexico or Estudios Demograficos
df_rel = engine.query_engine.query_df("""
    SELECT id, display_name, works_count 
    FROM sources 
    WHERE lower(display_name) LIKE '%demograf%a y econom%a%'
""")
print("\nOtras revistas relacionadas (ej. Demografía y Economía):")
print(df_rel)
