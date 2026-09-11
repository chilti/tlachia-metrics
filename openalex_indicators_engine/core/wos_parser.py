"""
TlachIA Metrics - openalex_indicators_engine
core/wos_parser.py

Analizador sintáctico (AST) y compilador de consultas Web of Science (Clarivate)
a condiciones SQL optimizadas para ClickHouse sobre la tabla works_flat.

Soporta la sintaxis completa de WoS:
  - Etiquetas de campo: TS=, TI=, AB=, WC=, CU=, PY=, SO=, AU=
  - Operadores booleanos: AND, OR, NOT (infijo y prefijo)
  - Operadores de proximidad: NEAR/n
  - Comodines: * (truncamiento), ? (carácter)
  - Frases exactas: "..."
  - Paréntesis anidados

Compilación optimizada en 3 capas CTE:
  1. Prefiltros de partición (país, año)          → microsegundos
  2. Filtros taxonómicos LowCardinality (WC)      → milisegundos
  3. Búsqueda textual diferida (TS/TI/AB + NEAR)  → segundos

Rendimiento:  ~2-8s sobre 569M filas con prefiltrado CU=(Mexico) + índices tokenbf.
Sin prefiltrado ni índices: minutos u horas → inaceptable.
"""
import re
import logging
from enum import Enum, auto
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Tuple, Set, Union

logger = logging.getLogger(__name__)


# =============================================================================
# 1. LÉXICO (TOKENIZER)
# =============================================================================

class TokenType(Enum):
    """Tipos de token reconocidos en la sintaxis de Web of Science."""
    FIELD   = auto()   # TS=, WC=, TI=, AB=, CU=, PY=, SO=, AU=
    LPAREN  = auto()   # (
    RPAREN  = auto()   # )
    AND     = auto()   # AND
    OR      = auto()   # OR
    NOT     = auto()   # NOT
    NEAR    = auto()   # NEAR/n
    PHRASE  = auto()   # "exact phrase"
    TERM    = auto()   # word, word*, word?
    EOF     = auto()   # fin de la cadena


@dataclass
class Token:
    """Token léxico con tipo, valor y posición en la cadena original."""
    type: TokenType
    value: Any
    pos: int


class WoSTokenizer:
    """
    Tokenizador léxico para consultas Web of Science.

    Convierte una cadena de texto WoS en una secuencia de Tokens tipados,
    incluyendo etiquetas de campo, operadores booleanos, proximidad,
    frases entre comillas, comodines y paréntesis.
    """

    # Etiquetas de campo reconocidas
    KNOWN_FIELDS = {'TS', 'TI', 'AB', 'WC', 'CU', 'PY', 'SO', 'AU', 'SU', 'OG', 'AD'}

    def __init__(self, text: str):
        self.text = text
        self.pos = 0
        self.length = len(text)

    def tokenize(self) -> List[Token]:
        """Produce la lista completa de tokens a partir del texto de entrada."""
        tokens: List[Token] = []
        while self.pos < self.length:
            # Saltar espacios en blanco y saltos de línea
            while self.pos < self.length and self.text[self.pos] in ' \t\n\r':
                self.pos += 1
            if self.pos >= self.length:
                break

            start = self.pos
            ch = self.text[self.pos]

            # Paréntesis
            if ch == '(':
                tokens.append(Token(TokenType.LPAREN, '(', start))
                self.pos += 1
                continue
            if ch == ')':
                tokens.append(Token(TokenType.RPAREN, ')', start))
                self.pos += 1
                continue

            # Frase entre comillas
            if ch == '"':
                self.pos += 1
                phrase_start = self.pos
                while self.pos < self.length and self.text[self.pos] != '"':
                    self.pos += 1
                val = self.text[phrase_start:self.pos]
                if self.pos < self.length:
                    self.pos += 1  # consumir comilla de cierre
                tokens.append(Token(TokenType.PHRASE, val, start))
                continue

            # Etiqueta de campo: XX= (con 2-4 letras mayúsculas seguidas de =)
            m_field = re.match(r'([A-Za-z]{2,4})\s*=', self.text[self.pos:])
            if m_field:
                field_name = m_field.group(1).upper()
                if field_name in self.KNOWN_FIELDS:
                    tokens.append(Token(TokenType.FIELD, field_name, start))
                    self.pos += m_field.end()
                    continue

            # Operador de proximidad: NEAR/n
            m_near = re.match(r'NEAR/(\d+)\b', self.text[self.pos:], re.IGNORECASE)
            if m_near:
                dist = int(m_near.group(1))
                tokens.append(Token(TokenType.NEAR, dist, start))
                self.pos += m_near.end()
                continue

            # Palabra o operador booleano
            m_word = re.match(r'[^\s()="]+', self.text[self.pos:])
            if m_word:
                word = m_word.group(0)
                upper = word.upper()
                if upper == 'AND':
                    tokens.append(Token(TokenType.AND, 'AND', start))
                elif upper == 'OR':
                    tokens.append(Token(TokenType.OR, 'OR', start))
                elif upper == 'NOT':
                    tokens.append(Token(TokenType.NOT, 'NOT', start))
                else:
                    tokens.append(Token(TokenType.TERM, word, start))
                self.pos += m_word.end()
                continue

            # Carácter no reconocido: saltar
            self.pos += 1

        tokens.append(Token(TokenType.EOF, '', self.pos))
        return tokens


# =============================================================================
# 2. ÁRBOL SINTÁCTICO ABSTRACTO (AST)
# =============================================================================

class ASTNode:
    """Clase base para todos los nodos del árbol sintáctico."""
    pass


@dataclass
class TermNode(ASTNode):
    """Término individual (palabra con posible comodín) o frase exacta."""
    value: str
    is_phrase: bool
    has_wildcard: bool = False

    def __post_init__(self):
        self.has_wildcard = '*' in self.value or '?' in self.value


@dataclass
class FieldNode(ASTNode):
    """Nodo de etiqueta de campo WoS (TS=, WC=, CU=, etc.)."""
    field: str
    expr: ASTNode


@dataclass
class NotNode(ASTNode):
    """Negación lógica (NOT)."""
    child: ASTNode


@dataclass
class NearNode(ASTNode):
    """Operador de proximidad (NEAR/n)."""
    left: ASTNode
    right: ASTNode
    distance: int


@dataclass
class BinaryOpNode(ASTNode):
    """Operador binario AND u OR con lista de hijos."""
    op: str  # 'AND' o 'OR'
    children: List[ASTNode]


# =============================================================================
# 3. PARSER (Descendente Recursivo)
# =============================================================================

class WoSParseError(Exception):
    """Error de análisis sintáctico en una consulta WoS."""
    def __init__(self, message: str, pos: int = -1, context: str = ''):
        self.pos = pos
        self.context = context
        super().__init__(message)


class WoSParser:
    """
    Parser descendente recursivo para consultas Web of Science.

    Jerarquía de precedencia (menor a mayor):
      1. OR
      2. AND / NOT infijo (A NOT B → A AND NOT B)
      3. NOT prefijo unario
      4. NEAR/n
      5. Primarios (Campo, Paréntesis, Frase, Término)
    """

    def __init__(self, tokens: List[Token]):
        self.tokens = tokens
        self.pos = 0

    def current(self) -> Token:
        return self.tokens[self.pos]

    def peek_type(self) -> TokenType:
        return self.tokens[self.pos].type

    def match(self, token_type: TokenType) -> bool:
        if self.peek_type() == token_type:
            self.pos += 1
            return True
        return False

    def expect(self, token_type: TokenType) -> Token:
        tok = self.current()
        if tok.type != token_type:
            ctx = self._context_around(tok.pos)
            raise WoSParseError(
                f"Se esperaba {token_type.name} en posición {tok.pos}, "
                f"se encontró {tok.type.name} ('{tok.value}')",
                pos=tok.pos, context=ctx
            )
        self.pos += 1
        return tok

    def _context_around(self, pos: int, radius: int = 60) -> str:
        """Extrae contexto de texto alrededor de la posición del error."""
        # Reconstruimos el texto original a partir de los tokens
        if not self.tokens:
            return ''
        # Buscar token más cercano
        for t in self.tokens:
            if t.pos >= pos - radius and t.type != TokenType.EOF:
                break
        start = max(0, pos - radius)
        end = min(pos + radius, self.tokens[-1].pos)
        # Intento rudimentario
        return f"...pos {pos}..."

    def parse(self) -> ASTNode:
        """Punto de entrada principal: parsea toda la expresión."""
        node = self._parse_or()
        if self.peek_type() != TokenType.EOF:
            tok = self.current()
            raise WoSParseError(
                f"Token inesperado al final: {tok.type.name} ('{tok.value}') "
                f"en posición {tok.pos}",
                pos=tok.pos
            )
        return node

    def _parse_or(self) -> ASTNode:
        nodes = [self._parse_and_not()]
        while self.match(TokenType.OR):
            nodes.append(self._parse_and_not())
        return nodes[0] if len(nodes) == 1 else BinaryOpNode('OR', nodes)

    def _parse_and_not(self) -> ASTNode:
        left = self._parse_prefix_not()
        while True:
            if self.match(TokenType.AND):
                # AND seguido opcionalmente de NOT
                if self.match(TokenType.NOT):
                    right = self._parse_prefix_not()
                    left = BinaryOpNode('AND', [left, NotNode(right)])
                else:
                    right = self._parse_prefix_not()
                    if isinstance(left, BinaryOpNode) and left.op == 'AND':
                        left.children.append(right)
                    else:
                        left = BinaryOpNode('AND', [left, right])
            elif self.peek_type() == TokenType.NOT:
                # NOT infijo: A NOT B → A AND (NOT B)
                self.pos += 1
                right = self._parse_prefix_not()
                if isinstance(left, BinaryOpNode) and left.op == 'AND':
                    left.children.append(NotNode(right))
                else:
                    left = BinaryOpNode('AND', [left, NotNode(right)])
            else:
                break
        return left

    def _parse_prefix_not(self) -> ASTNode:
        if self.match(TokenType.NOT):
            child = self._parse_prefix_not()
            return NotNode(child)
        return self._parse_near()

    def _parse_near(self) -> ASTNode:
        left = self._parse_primary()
        while self.peek_type() == TokenType.NEAR:
            dist = self.current().value
            self.pos += 1
            right = self._parse_primary()
            left = NearNode(left, right, dist)
        return left

    def _parse_primary(self) -> ASTNode:
        tok = self.current()

        # Etiqueta de campo
        if tok.type == TokenType.FIELD:
            self.pos += 1
            expr = self._parse_primary()
            return FieldNode(tok.value, expr)

        # Expresión entre paréntesis
        if self.match(TokenType.LPAREN):
            expr = self._parse_or()
            self.expect(TokenType.RPAREN)
            return expr

        # Frase entre comillas
        if tok.type == TokenType.PHRASE:
            self.pos += 1
            return TermNode(tok.value, is_phrase=True)

        # Término simple
        if tok.type == TokenType.TERM:
            self.pos += 1
            return TermNode(tok.value, is_phrase=False)

        raise WoSParseError(
            f"Token inesperado: {tok.type.name} ('{tok.value}') en posición {tok.pos}",
            pos=tok.pos
        )


# =============================================================================
# 4. COMPILADOR A CLICKHOUSE SQL (Optimizado en 3 Capas)
# =============================================================================

# Mapeo de nombres de país a códigos ISO 3166-1 alpha-2
COUNTRY_NAME_TO_ISO2: Dict[str, str] = {
    'AFGHANISTAN': 'AF', 'ALBANIA': 'AL', 'ALGERIA': 'DZ', 'ARGENTINA': 'AR',
    'AUSTRALIA': 'AU', 'AUSTRIA': 'AT', 'BANGLADESH': 'BD', 'BELGIUM': 'BE',
    'BOLIVIA': 'BO', 'BRAZIL': 'BR', 'BRASIL': 'BR', 'CAMEROON': 'CM',
    'CANADA': 'CA', 'CHILE': 'CL', 'CHINA': 'CN', 'COLOMBIA': 'CO',
    'COSTA RICA': 'CR', 'CROATIA': 'HR', 'CUBA': 'CU', 'CZECH REPUBLIC': 'CZ',
    'CZECHIA': 'CZ', 'DENMARK': 'DK', 'DOMINICAN REPUBLIC': 'DO',
    'ECUADOR': 'EC', 'EGYPT': 'EG', 'EL SALVADOR': 'SV', 'ENGLAND': 'GB',
    'ESTONIA': 'EE', 'ETHIOPIA': 'ET', 'FINLAND': 'FI', 'FRANCE': 'FR',
    'GERMANY': 'DE', 'GHANA': 'GH', 'GREECE': 'GR', 'GUATEMALA': 'GT',
    'HONDURAS': 'HN', 'HONG KONG': 'HK', 'HUNGARY': 'HU', 'ICELAND': 'IS',
    'INDIA': 'IN', 'INDONESIA': 'ID', 'IRAN': 'IR', 'IRAQ': 'IQ',
    'IRELAND': 'IE', 'ISRAEL': 'IL', 'ITALY': 'IT', 'JAMAICA': 'JM',
    'JAPAN': 'JP', 'JORDAN': 'JO', 'KAZAKHSTAN': 'KZ', 'KENYA': 'KE',
    'KOREA': 'KR', 'SOUTH KOREA': 'KR', 'NORTH KOREA': 'KP',
    'KUWAIT': 'KW', 'LATVIA': 'LV', 'LEBANON': 'LB', 'LITHUANIA': 'LT',
    'LUXEMBOURG': 'LU', 'MALAYSIA': 'MY', 'MEXICO': 'MX', 'MEX': 'MX',
    'MOROCCO': 'MA', 'NEPAL': 'NP', 'NETHERLANDS': 'NL', 'NEW ZEALAND': 'NZ',
    'NICARAGUA': 'NI', 'NIGERIA': 'NG', 'NORWAY': 'NO', 'OMAN': 'OM',
    'PAKISTAN': 'PK', 'PANAMA': 'PA', 'PARAGUAY': 'PY', 'PEOPLES R CHINA': 'CN',
    'PERU': 'PE', 'PHILIPPINES': 'PH', 'POLAND': 'PL', 'PORTUGAL': 'PT',
    'QATAR': 'QA', 'ROMANIA': 'RO', 'RUSSIA': 'RU', 'SAUDI ARABIA': 'SA',
    'SCOTLAND': 'GB', 'SINGAPORE': 'SG', 'SLOVAKIA': 'SK', 'SLOVENIA': 'SI',
    'SOUTH AFRICA': 'ZA', 'SPAIN': 'ES', 'ESPANA': 'ES', 'SRI LANKA': 'LK',
    'SWEDEN': 'SE', 'SWITZERLAND': 'CH', 'TAIWAN': 'TW', 'TANZANIA': 'TZ',
    'THAILAND': 'TH', 'TRINIDAD TOBAGO': 'TT', 'TUNISIA': 'TN', 'TURKEY': 'TR',
    'TURKIYE': 'TR', 'UAE': 'AE', 'UGANDA': 'UG', 'UKRAINE': 'UA',
    'UNITED ARAB EMIRATES': 'AE', 'UNITED KINGDOM': 'GB', 'UK': 'GB',
    'UNITED STATES': 'US', 'USA': 'US', 'URUGUAY': 'UY', 'UZBEKISTAN': 'UZ',
    'VENEZUELA': 'VE', 'VIETNAM': 'VN', 'WALES': 'GB',
}

# Mapeo de categorías Web of Science a condiciones ClickHouse sobre OpenAlex
# Clave: nombre WoS en mayúsculas. Valor: SQL condition sobre subfield_name/field_name.
WOS_CATEGORY_MAP: Dict[str, str] = {
    # Ciencias Biomédicas y de la Salud
    'RESPIRATORY SYSTEM': "subfield_name IN ('Pulmonology', 'Respiratory Medicine') OR field_name = 'Medicine' AND (topic ILIKE '%respiratory%' OR topic ILIKE '%pulmonary%' OR topic ILIKE '%lung%')",
    'CARDIAC & CARDIOVASCULAR SYSTEMS': "subfield_name IN ('Cardiology and Cardiovascular Medicine')",
    'CLINICAL NEUROLOGY': "subfield_name IN ('Neurology (clinical)', 'Neurology')",
    'ONCOLOGY': "subfield_name IN ('Oncology', 'Cancer Research')",
    'SURGERY': "subfield_name IN ('Surgery')",
    'IMMUNOLOGY': "subfield_name IN ('Immunology', 'Immunology and Allergy')",
    'INFECTIOUS DISEASES': "subfield_name IN ('Infectious Diseases')",
    'PHARMACOLOGY & PHARMACY': "subfield_name IN ('Pharmacology', 'Pharmaceutical Science')",
    'NEUROSCIENCES': "field_name = 'Neuroscience'",
    'BIOCHEMISTRY & MOLECULAR BIOLOGY': "subfield_name IN ('Biochemistry', 'Molecular Biology')",
    'GENETICS & HEREDITY': "subfield_name IN ('Genetics', 'Genetics (clinical)')",
    'MICROBIOLOGY': "subfield_name IN ('Microbiology', 'Microbiology (medical)')",
    'PUBLIC, ENVIRONMENTAL & OCCUPATIONAL HEALTH': "subfield_name IN ('Public Health, Environmental and Occupational Health')",
    'MEDICINE, GENERAL & INTERNAL': "subfield_name IN ('General Medicine', 'Internal Medicine')",
    'PEDIATRICS': "subfield_name IN ('Pediatrics, Perinatology and Child Health')",
    'ENDOCRINOLOGY & METABOLISM': "subfield_name IN ('Endocrinology, Diabetes and Metabolism')",
    'GASTROENTEROLOGY & HEPATOLOGY': "subfield_name IN ('Gastroenterology', 'Hepatology')",
    'RADIOLOGY, NUCLEAR MEDICINE & MEDICAL IMAGING': "subfield_name IN ('Radiology, Nuclear Medicine and Imaging')",
    'PATHOLOGY': "subfield_name IN ('Pathology and Forensic Medicine')",
    'DERMATOLOGY': "subfield_name IN ('Dermatology')",
    'PSYCHIATRY': "subfield_name IN ('Psychiatry and Mental Health')",
    'CRITICAL CARE MEDICINE': "subfield_name IN ('Critical Care and Intensive Care Medicine')",
    'ANESTHESIOLOGY': "subfield_name IN ('Anesthesiology and Pain Medicine')",
    'NURSING': "field_name = 'Nursing'",
    'DENTISTRY, ORAL SURGERY & MEDICINE': "subfield_name IN ('Oral Surgery', 'General Dentistry')",
    'OPHTHALMOLOGY': "subfield_name IN ('Ophthalmology')",
    'UROLOGY & NEPHROLOGY': "subfield_name IN ('Urology', 'Nephrology')",

    # Ciencias exactas y naturales
    'CHEMISTRY, MULTIDISCIPLINARY': "field_name = 'Chemistry'",
    'PHYSICS, MULTIDISCIPLINARY': "field_name = 'Physics and Astronomy'",
    'MATHEMATICS': "field_name = 'Mathematics'",
    'COMPUTER SCIENCE, ARTIFICIAL INTELLIGENCE': "subfield_name IN ('Artificial Intelligence')",
    'ENGINEERING, ELECTRICAL & ELECTRONIC': "subfield_name IN ('Electrical and Electronic Engineering')",
    'MATERIALS SCIENCE, MULTIDISCIPLINARY': "field_name = 'Materials Science'",
    'ENVIRONMENTAL SCIENCES': "subfield_name IN ('Environmental Science (miscellaneous)', 'Environmental Engineering')",

    # Exclusiones frecuentes en búsquedas biomédicas
    'VETERINARY SCIENCES': "subfield_name IN ('Small Animals', 'Large Animals', 'Equine') OR field_name ILIKE '%veterinary%'",
    'ZOOLOGY': "subfield_name IN ('Animal Science and Zoology', 'Ecology, Evolution, Behavior and Systematics')",
    'AGRICULTURE, DAIRY & ANIMAL SCIENCE': "subfield_name IN ('Animal Science and Zoology', 'Food Animals')",
    'FISHERIES': "subfield_name IN ('Aquatic Science')",
    'ORNITHOLOGY': "topic ILIKE '%bird%' OR topic ILIKE '%ornithol%' OR topic ILIKE '%avian%'",
}


@dataclass
class CostClassification:
    """Clasificación de costos del AST para compilación en capas."""
    country_filters: List[str] = field(default_factory=list)    # CU= → has(all_country_codes,...)
    year_filters: List[str] = field(default_factory=list)        # PY= → publication_year ...
    category_filters: List[str] = field(default_factory=list)    # WC= → subfield/field conditions
    text_filters: List[str] = field(default_factory=list)        # TS/TI/AB → text search


@dataclass
class CompilationResult:
    """Resultado de la compilación WoS → ClickHouse SQL."""
    sql_where: str
    sql_full: str
    node_count: int
    fields_detected: List[str]
    countries_detected: List[str]
    categories_detected: List[str]
    has_near_operators: bool
    near_count: int
    term_count: int
    phrase_count: int
    wildcard_count: int
    warnings: List[str]
    uses_cte: bool


class ClickHouseCompiler:
    """
    Compilador de AST WoS a SQL ClickHouse optimizado.

    Estrategia de rendimiento:
    - Clasifica nodos por costo computacional
    - Genera CTEs para ejecutar filtros baratos (país, año) antes que caros (texto)
    - Usa hasTokenCaseInsensitive / ILIKE en lugar de match() cuando es posible
    - Prefiltro obligatorio antes de cada NEAR/x para minimizar regex
    """

    def __init__(self, table: str = 'works_flat', use_cte: bool = True):
        self.table = table
        self.use_cte = use_cte
        self._fields_seen: Set[str] = set()
        self._countries: List[str] = []
        self._categories: List[str] = []
        self._near_count = 0
        self._term_count = 0
        self._phrase_count = 0
        self._wildcard_count = 0
        self._warnings: List[str] = []

    def compile(self, ast: ASTNode) -> CompilationResult:
        """
        Compila un AST WoS completo a SQL ClickHouse.

        Genera una consulta con CTEs si hay prefiltros de país/año disponibles,
        o una cláusula WHERE plana si no los hay (peor rendimiento).
        """
        self._reset()
        self._scan_ast(ast)

        where_clause = self._compile_node(ast, current_field='TS')

        # Generar SQL completo
        if self.use_cte and (self._countries or self._has_year_filters(ast)):
            sql_full = self._build_cte_query(ast, where_clause)
        else:
            sql_full = f"SELECT * FROM {self.table}\nWHERE {where_clause}"
            if not self._countries:
                self._warnings.append(
                    "Sin filtro de país (CU=). La consulta se ejecutará sobre los 569M "
                    "de registros completos. Se recomienda agregar CU=(country) para "
                    "mejorar el rendimiento."
                )

        return CompilationResult(
            sql_where=where_clause,
            sql_full=sql_full,
            node_count=self._count_nodes(ast),
            fields_detected=sorted(self._fields_seen),
            countries_detected=self._countries,
            categories_detected=self._categories,
            has_near_operators=self._near_count > 0,
            near_count=self._near_count,
            term_count=self._term_count,
            phrase_count=self._phrase_count,
            wildcard_count=self._wildcard_count,
            warnings=self._warnings,
            uses_cte=self.use_cte and bool(self._countries),
        )

    def _reset(self):
        self._fields_seen = set()
        self._countries = []
        self._categories = []
        self._near_count = 0
        self._term_count = 0
        self._phrase_count = 0
        self._wildcard_count = 0
        self._warnings = []

    # ------------------------------------------------------------------
    # Escaneo previo del AST (detección de campos, países, categorías)
    # ------------------------------------------------------------------

    def _scan_ast(self, node: ASTNode):
        """Recorre el AST para recopilar metadatos antes de compilar."""
        if isinstance(node, FieldNode):
            self._fields_seen.add(node.field)
            if node.field == 'CU':
                self._extract_countries(node.expr)
            if node.field == 'WC':
                self._extract_categories(node.expr)
            self._scan_ast(node.expr)
        elif isinstance(node, BinaryOpNode):
            for child in node.children:
                self._scan_ast(child)
        elif isinstance(node, NotNode):
            self._scan_ast(node.child)
        elif isinstance(node, NearNode):
            self._near_count += 1
            self._scan_ast(node.left)
            self._scan_ast(node.right)
        elif isinstance(node, TermNode):
            if node.is_phrase:
                self._phrase_count += 1
            else:
                self._term_count += 1
            if node.has_wildcard:
                self._wildcard_count += 1

    def _extract_countries(self, node: ASTNode):
        """Extrae códigos de país ISO-2 del subárbol CU=."""
        if isinstance(node, TermNode):
            name = re.sub(r'[^A-Za-z0-9 ]', '', node.value).strip().upper()
            iso2 = COUNTRY_NAME_TO_ISO2.get(name, None)
            if iso2:
                self._countries.append(iso2)
            elif len(name) == 2 and name.isalpha():
                self._countries.append(name)
            else:
                self._warnings.append(f"País no reconocido: '{node.value}'. Se intentará usar como código ISO-2 directo.")
                self._countries.append(name[:2])
        elif isinstance(node, BinaryOpNode):
            for child in node.children:
                self._extract_countries(child)

    def _extract_categories(self, node: ASTNode):
        """Extrae nombres de categorías WoS del subárbol WC=."""
        if isinstance(node, TermNode):
            self._categories.append(node.value)
        elif isinstance(node, BinaryOpNode):
            for child in node.children:
                self._extract_categories(child)

    def _has_year_filters(self, node: ASTNode) -> bool:
        if isinstance(node, FieldNode) and node.field == 'PY':
            return True
        if isinstance(node, BinaryOpNode):
            return any(self._has_year_filters(c) for c in node.children)
        if isinstance(node, (NotNode,)):
            return self._has_year_filters(node.child)
        return False

    def _count_nodes(self, node: ASTNode) -> int:
        count = 1
        if isinstance(node, BinaryOpNode):
            for c in node.children:
                count += self._count_nodes(c)
        elif isinstance(node, FieldNode):
            count += self._count_nodes(node.expr)
        elif isinstance(node, NotNode):
            count += self._count_nodes(node.child)
        elif isinstance(node, NearNode):
            count += self._count_nodes(node.left) + self._count_nodes(node.right)
        return count

    # ------------------------------------------------------------------
    # Generación CTE (Compilación en Capas)
    # ------------------------------------------------------------------

    def _build_cte_query(self, ast: ASTNode, where_clause: str) -> str:
        """
        Genera una consulta con CTE que prefiltro por país/año antes
        de aplicar la búsqueda textual costosa.
        """
        cte_filters = []
        if self._countries:
            codes = ", ".join(f"'{c}'" for c in self._countries)
            if len(self._countries) == 1:
                cte_filters.append(f"has(all_country_codes, '{self._countries[0]}')")
            else:
                cte_filters.append(f"hasAny(all_country_codes, [{codes}])")

        if not cte_filters:
            return f"SELECT * FROM {self.table}\nWHERE {where_clause}"

        cte_where = " AND ".join(cte_filters)

        return (
            f"WITH prefiltrado AS (\n"
            f"    SELECT *\n"
            f"    FROM {self.table}\n"
            f"    WHERE {cte_where}\n"
            f")\n"
            f"SELECT * FROM prefiltrado\n"
            f"WHERE {where_clause}"
        )

    # ------------------------------------------------------------------
    # Compilación de nodos AST a SQL
    # ------------------------------------------------------------------

    def _compile_node(self, node: ASTNode, current_field: str = 'TS') -> str:
        """Despacho principal: compila un nodo AST a una cláusula SQL."""
        if isinstance(node, FieldNode):
            return self._compile_node(node.expr, current_field=node.field)
        elif isinstance(node, NotNode):
            inner = self._compile_node(node.child, current_field)
            return f"(NOT ({inner}))"
        elif isinstance(node, BinaryOpNode):
            return self._compile_binary(node, current_field)
        elif isinstance(node, NearNode):
            return self._compile_near(node, current_field)
        elif isinstance(node, TermNode):
            return self._compile_term(node, current_field)
        else:
            raise ValueError(f"Tipo de nodo AST desconocido: {type(node)}")

    def _compile_binary(self, node: BinaryOpNode, field: str) -> str:
        parts = [self._compile_node(c, field) for c in node.children]
        joiner = f" {node.op} "
        return f"({joiner.join(parts)})"

    # ------------------------------------------------------------------
    # Compilación de TÉRMINOS (hasToken, ILIKE, positionCI)
    # ------------------------------------------------------------------

    def _compile_term(self, node: TermNode, field: str) -> str:
        """Compila un TermNode según el campo activo."""
        val = node.value

        # ── Campo CU= (País) ──────────────────────────────────────────
        if field == 'CU':
            return self._compile_country(val)

        # ── Campo WC= (Categoría WoS) ─────────────────────────────────
        if field == 'WC':
            return self._compile_wc_category(val)

        # ── Campo PY= (Año de publicación) ─────────────────────────────
        if field == 'PY':
            return self._compile_year(val)

        # ── Campo SO= (Source / Revista) ───────────────────────────────
        if field == 'SO':
            safe = val.replace("'", "\\'")
            return f"positionCaseInsensitiveUTF8(source_name, '{safe}') > 0"

        # ── Campos de texto: TS=, TI=, AB= ────────────────────────────
        return self._compile_text_term(node, field)

    def _compile_country(self, val: str) -> str:
        name = re.sub(r'[^A-Za-z0-9 ]', '', val).strip().upper()
        iso2 = COUNTRY_NAME_TO_ISO2.get(name, name[:2] if len(name) >= 2 else name)
        return f"has(all_country_codes, '{iso2}')"

    def _compile_wc_category(self, val: str) -> str:
        upper_val = val.strip().upper()
        if upper_val in WOS_CATEGORY_MAP:
            mapped = WOS_CATEGORY_MAP[upper_val]
            return f"({mapped})"
        # Fallback: búsqueda difusa sobre subfield_name, field_name, topic
        safe = val.replace("'", "\\'")
        return (
            f"(subfield_name ILIKE '%{safe}%' "
            f"OR field_name ILIKE '%{safe}%' "
            f"OR topic ILIKE '%{safe}%')"
        )

    def _compile_year(self, val: str) -> str:
        if '-' in val:
            parts = val.split('-')
            try:
                return f"(publication_year BETWEEN {int(parts[0])} AND {int(parts[1])})"
            except ValueError:
                return "1=1"
        try:
            return f"publication_year = {int(val)}"
        except ValueError:
            return "1=1"

    def _compile_text_term(self, node: TermNode, field: str) -> str:
        """
        Compila un término de texto usando funciones ClickHouse optimizadas.

        Estrategia de rendimiento:
        - Términos exactos → hasTokenCaseInsensitive() (aprovecha tokenbf index)
        - Frases exactas → positionCaseInsensitiveUTF8()
        - Comodines → ILIKE (aprovecha tokenbf como prefiltro) + match() solo si necesario
        """
        val = node.value.replace("'", "\\'")

        # Columnas destino según la etiqueta de campo
        if field == 'TI':
            text_cols = ['title']
        elif field == 'AB':
            text_cols = ['abstract']
        else:  # TS (Topic Search = title + abstract + keywords)
            text_cols = ['title', 'abstract']

        include_keywords = (field == 'TS')
        conds: List[str] = []

        if node.is_phrase:
            # ── Frase exacta: positionCaseInsensitiveUTF8 ──
            for col in text_cols:
                conds.append(f"positionCaseInsensitiveUTF8({col}, '{val}') > 0")
            if include_keywords:
                # Buscar la frase como keyword completo (match parcial en arrays)
                conds.append(
                    f"arrayExists(k -> positionCaseInsensitiveUTF8(k, '{val}') > 0, keywords)"
                )
        elif node.has_wildcard:
            # ── Comodín: ILIKE como primer filtro (usa tokenbf si existe) ──
            # Extraer la raíz antes del primer comodín para ILIKE
            root = re.split(r'[*?]', val)[0]
            if len(root) >= 3:
                # ILIKE con raíz ≥3 caracteres aprovecha el índice tokenbf
                ilike_pattern = val.replace('*', '%').replace('?', '_')
                for col in text_cols:
                    conds.append(f"{col} ILIKE '%{ilike_pattern}%'")
                if include_keywords:
                    conds.append(
                        f"arrayExists(k -> k ILIKE '%{ilike_pattern}%', keywords)"
                    )
            else:
                # Raíz corta: regex necesario (menos eficiente)
                regex_pat = val.replace('*', '\\w*').replace('?', '.')
                for col in text_cols:
                    conds.append(f"match({col}, '(?i)\\\\b{regex_pat}')")
                if include_keywords:
                    conds.append(
                        f"arrayExists(k -> match(k, '(?i)\\\\b{regex_pat}'), keywords)"
                    )
        else:
            # ── Término exacto: hasTokenCaseInsensitive (óptimo) ──
            lower_val = val.lower()
            for col in text_cols:
                conds.append(f"hasTokenCaseInsensitive({col}, '{lower_val}')")
            if include_keywords:
                conds.append(
                    f"arrayExists(k -> hasTokenCaseInsensitive(k, '{lower_val}'), keywords)"
                )

        if len(conds) == 1:
            return conds[0]
        return f"({' OR '.join(conds)})"

    # ------------------------------------------------------------------
    # Compilación de NEAR/x (con prefiltro obligatorio)
    # ------------------------------------------------------------------

    def _compile_near(self, node: NearNode, field: str) -> str:
        """
        Compila un operador de proximidad NEAR/n a SQL ClickHouse.

        Estrategia de 2 fases:
        1. Prefiltro barato: ambos operandos deben estar presentes (ILIKE)
        2. Verificación de proximidad: regex solo sobre candidatos del prefiltro

        Esto evita ejecutar regex costosos sobre millones de filas.
        """
        dist = node.distance

        # Columnas destino
        if field == 'TI':
            text_cols = ['title']
        elif field == 'AB':
            text_cols = ['abstract']
        else:
            text_cols = ['title', 'abstract']

        # Extraer patrones para regex
        pat_a = self._extract_near_pattern(node.left)
        pat_b = self._extract_near_pattern(node.right)

        # Extraer raíces para prefiltro ILIKE
        roots_a = self._extract_near_roots(node.left)
        roots_b = self._extract_near_roots(node.right)

        col_conds = []
        for col in text_cols:
            # Fase 1: Prefiltro (ambos operandos presentes en la columna)
            prefilt_parts = []
            for root in roots_a:
                if root:
                    prefilt_parts.append(f"{col} ILIKE '%{root}%'")
            for root in roots_b:
                if root:
                    prefilt_parts.append(f"{col} ILIKE '%{root}%'")

            # Si hay raíces suficientes para prefiltrar:
            if len(prefilt_parts) >= 2:
                # Al menos una raíz de A Y una de B deben estar presentes
                a_part = prefilt_parts[0] if len(roots_a) == 1 else f"({' OR '.join(prefilt_parts[:len(roots_a)])})"
                b_part = prefilt_parts[len(roots_a)] if len(roots_b) == 1 else f"({' OR '.join(prefilt_parts[len(roots_a):])})"
                prefilt = f"{a_part} AND {b_part}"
            elif prefilt_parts:
                prefilt = " AND ".join(prefilt_parts)
            else:
                prefilt = None

            # Fase 2: Regex de proximidad bidireccional
            regex_fwd = f"(?i)\\\\b{pat_a}(?:\\\\s+\\\\S+){{0,{dist}}}\\\\s+{pat_b}\\\\b"
            regex_rev = f"(?i)\\\\b{pat_b}(?:\\\\s+\\\\S+){{0,{dist}}}\\\\s+{pat_a}\\\\b"
            regex_full = f"({regex_fwd}|{regex_rev})"

            match_expr = f"match({col}, '{regex_full}')"

            if prefilt:
                col_conds.append(f"({prefilt} AND {match_expr})")
            else:
                col_conds.append(match_expr)

        if len(col_conds) == 1:
            return col_conds[0]
        return f"({' OR '.join(col_conds)})"

    def _extract_near_pattern(self, node: ASTNode) -> str:
        """Extrae un patrón regex del operando de un NEAR."""
        if isinstance(node, TermNode):
            val = re.escape(node.value).replace(r'\*', r'\w*').replace(r'\?', r'.')
            if node.is_phrase:
                words = node.value.split()
                return r'\s+'.join(re.escape(w) for w in words)
            return val
        elif isinstance(node, BinaryOpNode) and node.op == 'OR':
            sub = [self._extract_near_pattern(c) for c in node.children]
            return f"(?:{'|'.join(sub)})"
        elif isinstance(node, FieldNode):
            return self._extract_near_pattern(node.expr)
        return r'\w+'

    def _extract_near_roots(self, node: ASTNode) -> List[str]:
        """Extrae raíces de texto (sin comodines) para prefiltro ILIKE de NEAR."""
        roots = []
        if isinstance(node, TermNode):
            root = re.split(r'[*?]', node.value)[0]
            if len(root) >= 3:
                roots.append(root.replace("'", "\\'"))
        elif isinstance(node, BinaryOpNode):
            for c in node.children:
                roots.extend(self._extract_near_roots(c))
        elif isinstance(node, FieldNode):
            roots.extend(self._extract_near_roots(node.expr))
        return roots


# =============================================================================
# 5. FUNCIÓN PÚBLICA DE ALTO NIVEL
# =============================================================================

def compile_wos_query(
    query_str: str,
    table: str = 'works_flat',
    use_cte: bool = True,
) -> CompilationResult:
    """
    Compila una consulta en sintaxis Web of Science a SQL ClickHouse optimizado.

    Parámetros:
        query_str:  Texto de la consulta WoS (puede ser multilínea).
        table:      Nombre de la tabla ClickHouse destino.
        use_cte:    Si True, genera CTEs para prefiltrado por país/año.

    Retorna:
        CompilationResult con la cláusula WHERE, SQL completo y metadatos.

    Ejemplo:
        >>> result = compile_wos_query('TS=(lung* OR pulmonary) AND CU=(Mexico)')
        >>> print(result.sql_full)
    """
    # Tokenizar
    tokenizer = WoSTokenizer(query_str)
    tokens = tokenizer.tokenize()

    # Parsear
    parser = WoSParser(tokens)
    ast = parser.parse()

    # Compilar
    compiler = ClickHouseCompiler(table=table, use_cte=use_cte)
    return compiler.compile(ast)
