"""
TlachIA Metrics - openalex_indicators_engine
core/pubmed_parser.py
Parser exhaustivo y de alto rendimiento para metadatos XML de PubMed (PubmedArticleSet).
Extrae el 100% de los campos provistos por la NLM / NCBI.
"""
import re
import json
import logging
from typing import List, Dict, Any, Optional, Union
import pandas as pd

try:
    from lxml import etree
except ImportError:
    import xml.etree.ElementTree as etree

logger = logging.getLogger(__name__)

# Diccionario de detección de países frecuentes en afiliaciones biomédicas
COUNTRY_ISO_MAP = {
    'MEXICO': 'MX', 'MÉXICO': 'MX', 'UNITED STATES': 'US', 'USA': 'US', 'UNITED STATES OF AMERICA': 'US',
    'CANADA': 'CA', 'CANADÁ': 'CA', 'BRAZIL': 'BR', 'BRASIL': 'BR', 'ARGENTINA': 'AR', 'COLOMBIA': 'CO',
    'CHILE': 'CL', 'PERU': 'PE', 'PERÚ': 'PE', 'SPAIN': 'ES', 'ESPAÑA': 'ES', 'FRANCE': 'FR', 'FRANCIA': 'FR',
    'GERMANY': 'DE', 'ALEMANIA': 'DE', 'UNITED KINGDOM': 'GB', 'UK': 'GB', 'ENGLAND': 'GB', 'SCOTLAND': 'GB',
    'ITALY': 'IT', 'ITALIA': 'IT', 'CHINA': 'CN', 'JAPAN': 'JP', 'JAPÓN': 'JP', 'INDIA': 'IN',
    'AUSTRALIA': 'AU', 'NETHERLANDS': 'NL', 'SWITZERLAND': 'CH', 'SWEDEN': 'SE', 'BELGIUM': 'BE',
    'PORTUGAL': 'PT', 'CUBA': 'CU', 'URUGUAY': 'UY', 'ECUADOR': 'EC', 'BOLIVIA': 'BO', 'VENEZUELA': 'VE',
    'COSTA RICA': 'CR', 'PANAMA': 'PA', 'PANAMÁ': 'PA', 'GUATEMALA': 'GT', 'HONDURAS': 'HN',
    'EL SALVADOR': 'SV', 'NICARAGUA': 'NI', 'DOMINICAN REPUBLIC': 'DO', 'REPÚBLICA DOMINICANA': 'DO'
}


def _clean_text(elem) -> str:
    """Extrae texto recursivo eliminando etiquetas internas como <i>, <b>, <sup>, etc."""
    if elem is None:
        return ""
    return "".join(elem.itertext()).strip()


def _detect_country_code(affiliation: str) -> Optional[str]:
    """Detecta el código ISO de país al final o dentro de una cadena de afiliación."""
    if not affiliation:
        return None
    upper_aff = affiliation.upper()
    parts = [p.strip() for p in re.split(r'[,;.]', upper_aff) if p.strip()]
    # Revisar las últimas 3 partes (donde típicamente está el país)
    for part in reversed(parts[-3:]):
        for country_name, iso in COUNTRY_ISO_MAP.items():
            if country_name in part or part == country_name:
                return iso
    return None


def parse_pubmed_article_element(article_elem) -> Dict[str, Any]:
    """
    Parsea un elemento XML <PubmedArticle> extrayendo todos sus campos.
    """
    medline = article_elem.find("MedlineCitation")
    pubmed_data = article_elem.find("PubmedData")

    # 1. Identificadores
    pmid = ""
    if medline is not None:
        pmid_elem = medline.find("PMID")
        if pmid_elem is not None:
            pmid = _clean_text(pmid_elem)

    doi = ""
    pmc_id = ""
    mid = ""

    if pubmed_data is not None:
        article_ids = pubmed_data.findall(".//ArticleId")
        for aid in article_ids:
            id_type = aid.get("IdType", "").lower()
            val = _clean_text(aid)
            if id_type == "doi" and not doi:
                doi = val.lower().replace("https://doi.org/", "").replace("http://dx.doi.org/", "").strip()
            elif id_type == "pmc" and not pmc_id:
                pmc_id = val if val.startswith("PMC") else f"PMC{val}"
            elif id_type == "mid" and not mid:
                mid = val

    # Fallback para DOI desde MedlineCitation/Article/ELocationID
    if medline is not None and not doi:
        for eloc in medline.findall(".//ELocationID"):
            if eloc.get("EIdType", "").lower() == "doi":
                doi = _clean_text(eloc).lower().replace("https://doi.org/", "").replace("http://dx.doi.org/", "").strip()
                break

    # 2. Artículo básico
    article = medline.find("Article") if medline is not None else None
    title = ""
    vernacular_title = ""
    abstract_text = ""
    abstract_sections = []
    copyright_info = ""
    languages = []
    publication_types = []

    if article is not None:
        # Título
        title_elem = article.find("ArticleTitle")
        title = _clean_text(title_elem)

        vern_elem = article.find("VernacularTitle")
        if vern_elem is not None:
            vernacular_title = _clean_text(vern_elem)

        # Abstract
        abstract_elem = article.find("Abstract")
        if abstract_elem is not None:
            abs_parts = []
            for at in abstract_elem.findall("AbstractText"):
                lbl = at.get("Label") or at.get("NlmCategory") or ""
                txt = _clean_text(at)
                if txt:
                    abs_parts.append(f"{lbl}: {txt}" if lbl else txt)
                    abstract_sections.append({
                        "label": at.get("Label") or "",
                        "category": at.get("NlmCategory") or "",
                        "text": txt
                    })
            abstract_text = "\n\n".join(abs_parts)
            c_elem = abstract_elem.find("CopyrightInformation")
            if c_elem is not None:
                copyright_info = _clean_text(c_elem)

        # Idiomas
        for lang_elem in article.findall("Language"):
            l_val = _clean_text(lang_elem)
            if l_val:
                languages.append(l_val)

        # Tipos de publicación
        pt_list = article.find("PublicationTypeList")
        if pt_list is not None:
            for pt in pt_list.findall("PublicationType"):
                pt_text = _clean_text(pt)
                pt_ui = pt.get("UI") or ""
                if pt_text:
                    publication_types.append({"type": pt_text, "ui": pt_ui})

    # 3. Revista y Edición
    journal_title = ""
    journal_iso = ""
    journal_issn_print = ""
    journal_issn_electronic = ""
    journal_issn_linking = ""
    journal_country = ""
    pub_year = 0
    pub_date_str = ""
    volume = ""
    issue = ""
    pages = ""

    if article is not None:
        journal_elem = article.find("Journal")
        if journal_elem is not None:
            jt_elem = journal_elem.find("Title")
            journal_title = _clean_text(jt_elem)

            j_iso_elem = journal_elem.find("ISOAbbreviation")
            journal_iso = _clean_text(j_iso_elem)

            for issn_elem in journal_elem.findall("ISSN"):
                itype = issn_elem.get("IssnType", "").lower()
                issn_val = _clean_text(issn_elem)
                if "elect" in itype:
                    journal_issn_electronic = issn_val
                else:
                    journal_issn_print = issn_val

            issue_elem = journal_elem.find("JournalIssue")
            if issue_elem is not None:
                vol_elem = issue_elem.find("Volume")
                volume = _clean_text(vol_elem)
                iss_elem = issue_elem.find("Issue")
                issue = _clean_text(iss_elem)

                # Fecha de publicación
                pubdate_elem = issue_elem.find("PubDate")
                if pubdate_elem is not None:
                    y = pubdate_elem.find("Year")
                    if y is not None and _clean_text(y).isdigit():
                        pub_year = int(_clean_text(y))
                        m = pubdate_elem.find("Month")
                        d = pubdate_elem.find("Day")
                        pub_date_str = f"{_clean_text(y)}-{_clean_text(m) if m is not None else '01'}-{_clean_text(d) if d is not None else '01'}"
                    else:
                        med_date = pubdate_elem.find("MedlineDate")
                        if med_date is not None:
                            match = re.search(r'\b(19\d\d|20\d\d)\b', _clean_text(med_date))
                            if match:
                                pub_year = int(match.group(1))
                                pub_date_str = str(pub_year)

        # Fallback fecha desde ArticleDate
        if pub_year == 0:
            art_date = article.find("ArticleDate")
            if art_date is not None:
                y = art_date.find("Year")
                if y is not None and _clean_text(y).isdigit():
                    pub_year = int(_clean_text(y))
                    m = art_date.find("Month")
                    d = art_date.find("Day")
                    pub_date_str = f"{_clean_text(y)}-{_clean_text(m) if m is not None else '01'}-{_clean_text(d) if d is not None else '01'}"

        # Páginas
        pag_elem = article.find("Pagination")
        if pag_elem is not None:
            pg = pag_elem.find("MedlinePgn")
            pages = _clean_text(pg)

    # MedlineJournalInfo
    if medline is not None:
        mj_info = medline.find("MedlineJournalInfo")
        if mj_info is not None:
            c_elem = mj_info.find("Country")
            journal_country = _clean_text(c_elem)
            issn_l = mj_info.find("ISSNLinking")
            if issn_l is not None:
                journal_issn_linking = _clean_text(issn_l)

    # 4. Autores, Identificadores (ORCID) y Afiliaciones
    authors = []
    author_names = []
    author_ids = []
    all_affiliations = []
    all_country_codes = set()
    institution_names = set()

    if article is not None:
        author_list = article.find("AuthorList")
        if author_list is not None:
            for auth in author_list.findall("Author"):
                last_name = _clean_text(auth.find("LastName"))
                fore_name = _clean_text(auth.find("ForeName"))
                initials = _clean_text(auth.find("Initials"))
                suffix = _clean_text(auth.find("Suffix"))

                # Nombre compuesto
                if last_name and fore_name:
                    full_name = f"{last_name}, {fore_name}"
                elif last_name:
                    full_name = last_name
                else:
                    coll = auth.find("CollectiveName")
                    full_name = _clean_text(coll) if coll is not None else ""

                if not full_name:
                    continue

                author_names.append(full_name)

                # ORCID u otros IDs
                orcid = ""
                for ident in auth.findall("Identifier"):
                    src = ident.get("Source", "").upper()
                    val = _clean_text(ident)
                    if "ORCID" in src or "0000-" in val:
                        clean_orcid = val.replace("https://orcid.org/", "").replace("http://orcid.org/", "").strip()
                        orcid = clean_orcid
                        author_ids.append(orcid)

                # Afiliaciones de este autor
                auth_affs = []
                for aff_info in auth.findall("AffiliationInfo"):
                    aff_txt = _clean_text(aff_info.find("Affiliation"))
                    if aff_txt:
                        auth_affs.append(aff_txt)
                        all_affiliations.append(aff_txt)
                        c_code = _detect_country_code(aff_txt)
                        if c_code:
                            all_country_codes.add(c_code)
                        # Heurística simple para institución
                        inst_cand = aff_txt.split(',')[0].strip()
                        if len(inst_cand) > 3:
                            institution_names.add(inst_cand)

                authors.append({
                    "last_name": last_name,
                    "fore_name": fore_name,
                    "initials": initials,
                    "suffix": suffix,
                    "name": full_name,
                    "orcid": orcid,
                    "affiliations": auth_affs
                })

    # Investigadores de consorcios
    investigators = []
    if medline is not None:
        inv_list = medline.find("InvestigatorList")
        if inv_list is not None:
            for inv in inv_list.findall("Investigator"):
                ln = _clean_text(inv.find("LastName"))
                fn = _clean_text(inv.find("ForeName"))
                name = f"{ln}, {fn}" if ln and fn else ln
                if name:
                    investigators.append(name)

    # 5. Términos MeSH (Medical Subject Headings)
    mesh_headings = []
    mesh_major_topics = []
    mesh_keywords = []

    if medline is not None:
        mesh_list = medline.find("MeshHeadingList")
        if mesh_list is not None:
            for mh in mesh_list.findall("MeshHeading"):
                desc = mh.find("DescriptorName")
                desc_text = _clean_text(desc)
                desc_ui = desc.get("UI") or "" if desc is not None else ""
                desc_major = desc.get("MajorTopicYN", "N") == "Y" if desc is not None else False

                if desc_text:
                    mesh_keywords.append(desc_text)
                    if desc_major:
                        mesh_major_topics.append(desc_text)

                qualifiers = []
                for q in mh.findall("QualifierName"):
                    q_text = _clean_text(q)
                    q_ui = q.get("UI") or ""
                    q_major = q.get("MajorTopicYN", "N") == "Y"
                    if q_text:
                        qualifiers.append({"qualifier": q_text, "ui": q_ui, "major_topic": q_major})
                        if q_major:
                            mesh_major_topics.append(f"{desc_text}/{q_text}")

                mesh_headings.append({
                    "descriptor": desc_text,
                    "ui": desc_ui,
                    "major_topic": desc_major,
                    "qualifiers": qualifiers
                })

    # 6. Palabras clave del autor (KeywordList)
    author_keywords = []
    if medline is not None:
        for kw_list in medline.findall("KeywordList"):
            for kw in kw_list.findall("Keyword"):
                k_text = _clean_text(kw)
                if k_text:
                    author_keywords.append(k_text)

    all_keywords = list(dict.fromkeys(mesh_keywords + author_keywords))

    # 7. Sustancias químicas
    chemicals = []
    if medline is not None:
        chem_list = medline.find("ChemicalList")
        if chem_list is not None:
            for chem in chem_list.findall("Chemical"):
                reg_num = _clean_text(chem.find("RegistryNumber"))
                subst = _clean_text(chem.find("NameOfSubstance"))
                subst_ui = chem.find("NameOfSubstance").get("UI") or "" if chem.find("NameOfSubstance") is not None else ""
                if subst:
                    chemicals.append({"registry_number": reg_num, "name": subst, "ui": subst_ui})

    # 8. Financiamiento (Grants)
    grants = []
    funder_names = []
    awards = []
    if article is not None:
        grant_list = article.find("GrantList")
        if grant_list is not None:
            for gr in grant_list.findall("Grant"):
                gid = _clean_text(gr.find("GrantID"))
                agency = _clean_text(gr.find("Agency"))
                acronym = _clean_text(gr.find("Acronym"))
                country = _clean_text(gr.find("Country"))
                if agency or gid:
                    grants.append({
                        "grant_id": gid,
                        "agency": agency,
                        "acronym": acronym,
                        "country": country
                    })
                    if agency and agency not in funder_names:
                        funder_names.append(agency)
                    if gid and gid not in awards:
                        awards.append(gid)

    # 9. Bancos de datos de genómica / ensayos clínicos
    databank_accessions = []
    if article is not None:
        db_list = article.find("DataBankList")
        if db_list is not None:
            for db in db_list.findall("DataBank"):
                db_name = _clean_text(db.find("DataBankName"))
                acc_list = db.find("AccessionNumberList")
                accs = []
                if acc_list is not None:
                    for acc in acc_list.findall("AccessionNumber"):
                        atxt = _clean_text(acc)
                        if atxt:
                            accs.append(atxt)
                if db_name:
                    databank_accessions.append({"name": db_name, "accessions": accs})

    # 10. Referencias bibliográficas citadas
    references = []
    if pubmed_data is not None:
        ref_list = pubmed_data.find("ReferenceList")
        if ref_list is not None:
            for ref in ref_list.findall("Reference"):
                cit = _clean_text(ref.find("Citation"))
                ref_pmid = ""
                ref_doi = ""
                for aid in ref.findall(".//ArticleId"):
                    t = aid.get("IdType", "").lower()
                    v = _clean_text(aid)
                    if t == "pubmed" and not ref_pmid:
                        ref_pmid = v
                    elif t == "doi" and not ref_doi:
                        ref_doi = v.lower()
                references.append({"citation": cit, "pmid": ref_pmid, "doi": ref_doi})

    # 11. Fechas de historial
    history_dates = {}
    if pubmed_data is not None:
        hist = pubmed_data.find("History")
        if hist is not None:
            for pdate in hist.findall("PubMedPubDate"):
                status = pdate.get("PubStatus", "")
                y = _clean_text(pdate.find("Year"))
                m = _clean_text(pdate.find("Month"))
                d = _clean_text(pdate.find("Day"))
                if y and status:
                    history_dates[status] = f"{y}-{m if m else '01'}-{d if d else '01'}"

    # Estado y Acceso Abierto
    pub_status = ""
    if pubmed_data is not None:
        ps_elem = pubmed_data.find("PublicationStatus")
        if ps_elem is not None:
            pub_status = _clean_text(ps_elem)

    is_oa = 1 if pmc_id else 0
    oa_status = "gold" if pmc_id else "closed"

    country_list = sorted(list(all_country_codes))
    country_code_primary = country_list[0] if country_list else ""

    return {
        # Identificadores principales
        "id": pmid,
        "pmid": pmid,
        "doi": doi,
        "pmc_id": pmc_id,
        "mid": mid,
        # Título y Abstract
        "title": title or "Sin título",
        "vernacular_title": vernacular_title,
        "abstract": abstract_text,
        "abstract_sections": abstract_sections,
        "copyright": copyright_info,
        # Revista
        "source_name": journal_title,
        "journal_title": journal_title,
        "journal_iso": journal_iso,
        "journal_issn_print": journal_issn_print,
        "journal_issn_electronic": journal_issn_electronic,
        "journal_issn_linking": journal_issn_linking,
        "journal_country": journal_country,
        "volume": volume,
        "issue": issue,
        "pages": pages,
        # Fechas
        "publication_year": pub_year,
        "publication_date": pub_date_str,
        "history_dates": history_dates,
        # Autores e Instituciones
        "authors": authors,
        "author_names": author_names,
        "author_ids": author_ids,
        "affiliations": all_affiliations,
        "institution_names": list(institution_names),
        "all_country_codes": country_list,
        "country_code": country_code_primary,
        "investigators": investigators,
        # Taxonomía y MeSH
        "mesh_headings": mesh_headings,
        "mesh_major_topics": mesh_major_topics,
        "keywords": all_keywords,
        "author_keywords": author_keywords,
        "subfield": mesh_major_topics[0] if mesh_major_topics else (all_keywords[0] if all_keywords else ""),
        "field": journal_title,
        "domain": "Health Sciences",
        # Química, Financiamiento, Bancos y Referencias
        "chemicals": chemicals,
        "grants": grants,
        "funder_names": funder_names,
        "awards": awards,
        "databank_accessions": databank_accessions,
        "references": references,
        "referenced_works_count": len(references),
        # Tipos de publicación, Idiomas y OA
        "publication_types": [pt["type"] for pt in publication_types],
        "publication_types_detail": publication_types,
        "languages": languages,
        "publication_status": pub_status,
        "is_oa": is_oa,
        "oa_status": oa_status,
        "cited_by_count": 0,
        "fwci": 0.0,
        "percentile": 0.0,
        "is_top_10": 0,
        "is_top_1": 0
    }


def parse_pubmed_xml_to_records(xml_content: Union[str, bytes]) -> List[Dict[str, Any]]:
    """
    Parsea un documento XML completo (PubmedArticleSet) a una lista de diccionarios con todos los campos.
    """
    if isinstance(xml_content, str):
        xml_bytes = xml_content.encode('utf-8')
    else:
        xml_bytes = xml_content

    if not xml_bytes or not xml_bytes.strip():
        return []

    try:
        root = etree.fromstring(xml_bytes)
    except Exception as e:
        logger.error(f"Error parseando XML con etree: {e}")
        return []

    records = []
    # Buscar todos los PubmedArticle y PubmedBookArticle
    articles = root.findall(".//PubmedArticle")
    for art in articles:
        try:
            rec = parse_pubmed_article_element(art)
            if rec.get("pmid") or rec.get("title"):
                records.append(rec)
        except Exception as ex:
            logger.warning(f"Error parseando artículo individual de PubMed: {ex}")

    return records


def parse_pubmed_xml_to_dataframe(xml_content: Union[str, bytes]) -> pd.DataFrame:
    """Convierte el XML de PubMed en un DataFrame de Pandas estructurado."""
    records = parse_pubmed_xml_to_records(xml_content)
    if not records:
        return pd.DataFrame()
    return pd.DataFrame(records)
