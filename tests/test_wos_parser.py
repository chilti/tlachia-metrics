"""
Tests para el compilador WoS → ClickHouse SQL.
Ejecutar: python -m pytest tests/test_wos_parser.py -v
"""
import sys
import os
import unittest
from pathlib import Path

# Asegurar que el paquete esté en el path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from openalex_indicators_engine.core.wos_parser import (
    WoSTokenizer, TokenType,
    WoSParser, WoSParseError,
    ClickHouseCompiler,
    compile_wos_query,
    ASTNode, TermNode, FieldNode, BinaryOpNode, NotNode, NearNode,
    CompilationResult,
)


class TestTokenizer(unittest.TestCase):
    """Tests para WoSTokenizer."""

    def test_basic_tokens(self):
        tokens = WoSTokenizer('TS=(lung*)').tokenize()
        types = [t.type for t in tokens]
        self.assertEqual(types, [
            TokenType.FIELD, TokenType.LPAREN, TokenType.TERM,
            TokenType.RPAREN, TokenType.EOF
        ])
        self.assertEqual(tokens[0].value, 'TS')
        self.assertEqual(tokens[2].value, 'lung*')

    def test_boolean_operators(self):
        tokens = WoSTokenizer('lung* AND pulmonary OR NOT asthma').tokenize()
        types = [t.type for t in tokens if t.type != TokenType.EOF]
        self.assertEqual(types, [
            TokenType.TERM, TokenType.AND, TokenType.TERM,
            TokenType.OR, TokenType.NOT, TokenType.TERM
        ])

    def test_near_operator(self):
        tokens = WoSTokenizer('alveol* NEAR/5 lung*').tokenize()
        types = [t.type for t in tokens if t.type != TokenType.EOF]
        self.assertEqual(types, [TokenType.TERM, TokenType.NEAR, TokenType.TERM])
        self.assertEqual(tokens[1].value, 5)

    def test_quoted_phrase(self):
        tokens = WoSTokenizer('"respiratory tract"').tokenize()
        self.assertEqual(tokens[0].type, TokenType.PHRASE)
        self.assertEqual(tokens[0].value, 'respiratory tract')

    def test_field_tags(self):
        tokens = WoSTokenizer('TS=(a) AND WC=(b) AND CU=(c) AND TI=(d) AND AB=(e)').tokenize()
        fields = [t.value for t in tokens if t.type == TokenType.FIELD]
        self.assertEqual(fields, ['TS', 'WC', 'CU', 'TI', 'AB'])

    def test_multiple_near_distances(self):
        tokens = WoSTokenizer('a NEAR/3 b NEAR/10 c').tokenize()
        nears = [t for t in tokens if t.type == TokenType.NEAR]
        self.assertEqual(len(nears), 2)
        self.assertEqual(nears[0].value, 3)
        self.assertEqual(nears[1].value, 10)

    def test_whitespace_handling(self):
        q = """TS = (
            lung*
            OR airway*
        )"""
        tokens = WoSTokenizer(q).tokenize()
        types = [t.type for t in tokens if t.type != TokenType.EOF]
        self.assertIn(TokenType.FIELD, types)
        self.assertIn(TokenType.TERM, types)

    def test_phrase_with_wildcard(self):
        tokens = WoSTokenizer('"lung cancer*"').tokenize()
        self.assertEqual(tokens[0].type, TokenType.PHRASE)
        self.assertEqual(tokens[0].value, 'lung cancer*')


class TestParser(unittest.TestCase):
    """Tests para WoSParser."""

    def _parse(self, q: str) -> ASTNode:
        tokens = WoSTokenizer(q).tokenize()
        return WoSParser(tokens).parse()

    def test_simple_term(self):
        ast = self._parse('lung')
        self.assertIsInstance(ast, TermNode)
        self.assertEqual(ast.value, 'lung')

    def test_field_tag(self):
        ast = self._parse('TS=(lung*)')
        self.assertIsInstance(ast, FieldNode)
        self.assertEqual(ast.field, 'TS')
        self.assertIsInstance(ast.expr, TermNode)

    def test_or_expression(self):
        ast = self._parse('lung* OR asthma OR COPD')
        self.assertIsInstance(ast, BinaryOpNode)
        self.assertEqual(ast.op, 'OR')
        self.assertEqual(len(ast.children), 3)

    def test_and_expression(self):
        ast = self._parse('lung* AND asthma')
        self.assertIsInstance(ast, BinaryOpNode)
        self.assertEqual(ast.op, 'AND')
        self.assertEqual(len(ast.children), 2)

    def test_infix_not(self):
        """WoS: A NOT B → A AND (NOT B)"""
        ast = self._parse('TS=(lung*) NOT TS=(asthma)')
        self.assertIsInstance(ast, BinaryOpNode)
        self.assertEqual(ast.op, 'AND')
        self.assertEqual(len(ast.children), 2)
        self.assertIsInstance(ast.children[1], NotNode)

    def test_near_operator(self):
        ast = self._parse('alveol* NEAR/5 lung*')
        self.assertIsInstance(ast, NearNode)
        self.assertEqual(ast.distance, 5)

    def test_nested_parentheses(self):
        ast = self._parse('(lung* OR (asthma AND COPD))')
        self.assertIsInstance(ast, BinaryOpNode)
        self.assertEqual(ast.op, 'OR')
        self.assertIsInstance(ast.children[1], BinaryOpNode)

    def test_precedence_or_and(self):
        """AND debe tener mayor precedencia que OR."""
        ast = self._parse('a OR b AND c')
        self.assertIsInstance(ast, BinaryOpNode)
        self.assertEqual(ast.op, 'OR')
        # 'a' es hijo OR, 'b AND c' es otro hijo OR
        self.assertEqual(len(ast.children), 2)
        self.assertIsInstance(ast.children[1], BinaryOpNode)
        self.assertEqual(ast.children[1].op, 'AND')

    def test_complex_field_expression(self):
        ast = self._parse('WC=("Respiratory System") OR TS=(lung* OR airway*)')
        self.assertIsInstance(ast, BinaryOpNode)
        self.assertEqual(ast.op, 'OR')
        self.assertIsInstance(ast.children[0], FieldNode)
        self.assertEqual(ast.children[0].field, 'WC')
        self.assertIsInstance(ast.children[1], FieldNode)
        self.assertEqual(ast.children[1].field, 'TS')

    def test_syntax_error(self):
        with self.assertRaises(WoSParseError):
            self._parse('lung* AND')


class TestCompiler(unittest.TestCase):
    """Tests para ClickHouseCompiler."""

    def _compile(self, q: str, use_cte: bool = False) -> CompilationResult:
        return compile_wos_query(q, use_cte=use_cte)

    def test_country_filter(self):
        result = self._compile('CU=(Mexico)')
        self.assertIn('MX', result.countries_detected)
        self.assertIn("has(all_country_codes, 'MX')", result.sql_where)

    def test_wc_category_mapped(self):
        result = self._compile('WC=("Respiratory System")')
        self.assertIn('Pulmonology', result.sql_where)
        self.assertIn('WC', result.fields_detected)

    def test_wc_category_fallback(self):
        result = self._compile('WC=("Unknown Category XYZ")')
        self.assertIn('ILIKE', result.sql_where)

    def test_year_filter(self):
        result = self._compile('PY=(2020)')
        self.assertIn('publication_year = 2020', result.sql_where)

    def test_ts_term_exact(self):
        """Términos exactos deben usar hasTokenCaseInsensitive."""
        result = self._compile('TS=(pneumonia)')
        self.assertIn('hasTokenCaseInsensitive', result.sql_where)

    def test_ts_term_wildcard(self):
        """Comodines deben usar ILIKE (aprovecha tokenbf)."""
        result = self._compile('TS=(lung*)')
        self.assertIn('ILIKE', result.sql_where)

    def test_ts_phrase(self):
        """Frases deben usar positionCaseInsensitiveUTF8."""
        result = self._compile('TS=("respiratory tract")')
        self.assertIn('positionCaseInsensitiveUTF8', result.sql_where)

    def test_ti_field(self):
        """TI= debe buscar solo en title."""
        result = self._compile('TI=(asthma)')
        self.assertIn('title', result.sql_where)
        self.assertNotIn('abstract', result.sql_where)

    def test_ab_field(self):
        """AB= debe buscar solo en abstract."""
        result = self._compile('AB=(asthma)')
        self.assertIn('abstract', result.sql_where)
        self.assertNotIn('title', result.sql_where)

    def test_ts_searches_multiple_columns(self):
        """TS= debe buscar en title, abstract y keywords."""
        result = self._compile('TS=(pneumonia)')
        self.assertIn('title', result.sql_where)
        self.assertIn('abstract', result.sql_where)
        self.assertIn('keywords', result.sql_where)

    def test_near_has_prefiltro(self):
        """NEAR debe generar prefiltro ILIKE antes del regex."""
        result = self._compile('TS=(alveol* NEAR/5 (lung* OR pulmonary))')
        self.assertIn('ILIKE', result.sql_where)
        self.assertIn('match(', result.sql_where)
        self.assertTrue(result.has_near_operators)
        self.assertEqual(result.near_count, 1)

    def test_not_operator(self):
        result = self._compile('TS=(lung*) NOT TS=(asthma)')
        self.assertIn('NOT', result.sql_where)

    def test_cte_with_country(self):
        """Con use_cte=True y filtro de país, debe generar CTE."""
        result = self._compile('TS=(lung*) AND CU=(Mexico)', use_cte=True)
        self.assertTrue(result.uses_cte)
        self.assertIn('prefiltrado', result.sql_full)
        self.assertIn("has(all_country_codes, 'MX')", result.sql_full)

    def test_cte_without_country(self):
        """Sin filtro de país, no debe generar CTE."""
        result = self._compile('TS=(lung*)', use_cte=True)
        self.assertFalse(result.uses_cte)

    def test_metadata_counts(self):
        result = self._compile('TS=(lung* OR "respiratory tract" OR pneumonia)')
        self.assertEqual(result.term_count, 2)    # lung*, pneumonia
        self.assertEqual(result.phrase_count, 1)   # "respiratory tract"
        self.assertEqual(result.wildcard_count, 1) # lung*

    def test_warning_no_country(self):
        result = self._compile('TS=(lung*)', use_cte=True)
        self.assertTrue(any('Sin filtro de país' in w for w in result.warnings))

    def test_complex_boolean(self):
        q = '(WC=("Respiratory System") OR TS=(lung* OR airway*)) AND CU=(Mexico)'
        result = self._compile(q, use_cte=True)
        self.assertIn('WC', result.fields_detected)
        self.assertIn('TS', result.fields_detected)
        self.assertIn('CU', result.fields_detected)
        self.assertIn('MX', result.countries_detected)
        self.assertTrue(result.uses_cte)


class TestBusquedaTxtIntegration(unittest.TestCase):
    """Test integral con el archivo busqueda.txt del proyecto de neumología."""

    BUSQUEDA_PATH = Path(r"H:\Mi unidad\Ciencias\Unidades Compartidas\Proyectos\Neumología\Investigacion_Bibliométrica\busqueda.txt")

    @unittest.skipUnless(BUSQUEDA_PATH.exists(), "busqueda.txt no accesible")
    def test_full_busqueda_txt(self):
        """
        Parsea y compila el archivo busqueda.txt completo (622 líneas).
        Verifica que:
        - El tokenizador produce los tokens esperados.
        - El parser genera un AST válido sin excepciones.
        - El compilador produce SQL ClickHouse válido.
        - Los metadatos contienen los campos, países y categorías correctos.
        """
        content = self.BUSQUEDA_PATH.read_text(encoding='utf-8')
        result = compile_wos_query(content, use_cte=True)

        # Verificar que compiló exitosamente
        self.assertIsInstance(result, CompilationResult)
        self.assertGreater(len(result.sql_where), 1000)
        self.assertGreater(result.node_count, 400)

        # Campos detectados
        self.assertIn('TS', result.fields_detected)
        self.assertIn('WC', result.fields_detected)
        self.assertIn('CU', result.fields_detected)
        self.assertIn('TI', result.fields_detected)
        self.assertIn('AB', result.fields_detected)

        # País México detectado
        self.assertIn('MX', result.countries_detected)

        # CTE generado para prefiltrado por país
        self.assertTrue(result.uses_cte)
        self.assertIn('prefiltrado', result.sql_full)

        # NEAR operators detectados
        self.assertTrue(result.has_near_operators)
        self.assertGreater(result.near_count, 10)

        # SQL balanceado en paréntesis
        open_count = result.sql_where.count('(')
        close_count = result.sql_where.count(')')
        self.assertEqual(open_count, close_count,
                         f"Paréntesis desbalanceados: {open_count} abiertos vs {close_count} cerrados")

        # Funciones optimizadas presentes
        self.assertIn('hasTokenCaseInsensitive', result.sql_where)
        self.assertIn('ILIKE', result.sql_where)
        self.assertIn('positionCaseInsensitiveUTF8', result.sql_where)

        # Prefiltro de NEAR presente
        self.assertIn('match(', result.sql_where)

        print(f"\n[OK] busqueda.txt compilada exitosamente:")
        print(f"   Nodos AST: {result.node_count}")
        print(f"   Términos: {result.term_count}")
        print(f"   Frases: {result.phrase_count}")
        print(f"   Comodines: {result.wildcard_count}")
        print(f"   NEAR operators: {result.near_count}")
        print(f"   Campos: {result.fields_detected}")
        print(f"   Países: {result.countries_detected}")
        print(f"   SQL WHERE length: {len(result.sql_where):,} chars")
        print(f"   SQL Full length: {len(result.sql_full):,} chars")
        print(f"   Usa CTE: {result.uses_cte}")
        if result.warnings:
            print(f"   Advertencias: {result.warnings}")



class TestCorpusBuilderWoS(unittest.TestCase):
    """Pruebas de integración entre WoS Parser y CorpusBuilder."""

    def setUp(self):
        from openalex_indicators_engine.core.corpus_builder import CorpusBuilder
        self.cb = CorpusBuilder()

    def test_build_where_clauses_with_wos(self):
        clauses = self.cb._build_where_clauses({
            'wos_query': 'TS=(pneumonia) AND CU=(Mexico)',
            'start_year': 2018,
            'end_year': 2024
        })
        self.assertEqual(len(clauses), 2)
        combined = " AND ".join(clauses)
        self.assertIn('pneumonia', combined)
        self.assertIn("has(all_country_codes, 'MX')", combined)
        self.assertIn("publication_year BETWEEN 2018 AND 2024", combined)

    def test_build_where_clauses_wos_with_py_suppresses_redundant_year(self):
        clauses = self.cb._build_where_clauses({
            'wos_query': 'TS=(asthma) AND PY=(2020-2023)'
        })
        combined = " AND ".join(clauses)
        self.assertIn('publication_year BETWEEN 2020 AND 2023', combined)
        # No debe haber una segunda cláusula de publication_year 1970-2026
        self.assertEqual(combined.count('publication_year'), 1)

    def test_has_other_entity_filters(self):
        self.assertFalse(self.cb._has_other_entity_filters({'wos_query': 'TS=(lung)'}))
        self.assertFalse(self.cb._has_other_entity_filters({'wos_query': 'TS=(lung)', 'source_mode': 'wos'}))
        self.assertTrue(self.cb._has_other_entity_filters({'wos_query': 'TS=(lung)', 'topic_ids': ['T123']}))
        self.assertTrue(self.cb._has_other_entity_filters({'wos_query': 'TS=(lung)', 'country_codes': ['MX']}))


if __name__ == '__main__':
    unittest.main(verbosity=2)
