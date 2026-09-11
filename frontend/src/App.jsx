import React, { useState, useEffect, useRef, useMemo } from 'react'
import axios from 'axios'
import {
  Search,
  SlidersHorizontal,
  Sparkles,
  Download,
  FileSpreadsheet,
  FileJson,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  BookOpen,
  Building2,
  Users,
  Compass,
  X,
  RefreshCw,
  FolderArchive,
  Layers,
  ArrowRight,
  UploadCloud,
  FileCode2,
  Hash,
  Globe2,
  Lock,
  Unlock,
  Calendar,
  Database,
  Library,
  Check,
  FileText,
  Trash2,
  LogOut,
  ShieldCheck,
  User,
  AlertOctagon,
  AlertTriangle,
  KeyRound
} from 'lucide-react'
import OrcidLoginModal from './components/OrcidLoginModal'
import TablePreviewTab from './components/TablePreviewTab'
import CorpusManagerModal from './components/CorpusManagerModal'
import CitingWorksModal from './components/CitingWorksModal'
import ScopusControls from './components/ScopusControls'
import MetricsConfigTab from './components/MetricsConfigTab'
import { useI18n } from './i18n'
import LanguageSelector from './components/LanguageSelector'
import ThemeToggle from './components/ThemeToggle'

const API_BASE = ''

export const resolveDownloadUrl = (url) => {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const clean = url.startsWith('/') ? url : `/${url}`
  const path = typeof window !== 'undefined' ? (window.location.pathname || '') : ''
  const matched = path.match(/^\/(tlachiametrics|tlachia-metrics|tlachia_metrics|tlachia)/i)
  const prefix = matched ? `/${matched[1]}` : ''
  return `${prefix}${clean}`
}

const loadSessionState = (key, fallback) => {
  try {
    const v = sessionStorage.getItem(`tlachia_${key}`)
    return v !== null ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

export const generateSuggestedCorpusName = (userData) => {
  // Pequeña cadena aleatoria de 4 caracteres para evitar colisiones
  const rand = Math.random().toString(36).substring(2, 6)
  if (userData?.name) {
    const clean = userData.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    const parts = clean.split('_').filter(Boolean)
    const shortName = parts.slice(0, 2).join('_')
    return `Corpus_${shortName}_${rand}`
  } else if (userData?.orcid) {
    const cleanOrcid = userData.orcid.replace(/[^0-9X]/gi, '').slice(-4)
    return `Corpus_User_${cleanOrcid}_${rand}`
  }
  return `Corpus_${rand}`
}

export default function App() {
  const { t, lang } = useI18n()

  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('tlachia_theme')
      if (saved === 'light' || saved === 'dark') return saved
      if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light'
      }
      return 'dark'
    } catch {
      return 'dark'
    }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('tlachia_theme', theme)
    } catch {}
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
  }

  const [activeTab, setActiveTab] = useState(() => loadSessionState('activeTab', 'builder')) // 'builder' | 'tables' | 'downloads'
  const [searchMode, setSearchMode] = useState(() => loadSessionState('searchMode', 'filters')) // 'filters' | 'wos' | 'ids' | 'upload'

  // Web of Science (WoS) Query State
  const [wosQuery, setWosQuery] = useState(() => loadSessionState('wosQuery', ''))
  const [wosUseCte, setWosUseCte] = useState(() => loadSessionState('wosUseCte', true))
  const [wosCompiled, setWosCompiled] = useState(null)
  const [wosCompiling, setWosCompiling] = useState(false)
  const [wosError, setWosError] = useState(null)
  const [showCompiledSql, setShowCompiledSql] = useState(false)
  const [sqlCopied, setSqlCopied] = useState(false)

  // Scopus Search API State
  const [scopusAvailable, setScopusAvailable] = useState(false)
  const [isScopusMode, setIsScopusMode] = useState(() => loadSessionState('isScopusMode', false))
  const [scopusQuery, setScopusQuery] = useState(() => loadSessionState('scopusQuery', ''))
  const [isScopusSearching, setIsScopusSearching] = useState(false)
  const [scopusCoverageStats, setScopusCoverageStats] = useState(() => loadSessionState('scopusCoverageStats', null))

  // User & ORCID Authentication State
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('tlachia_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [loginModalReason, setLoginModalReason] = useState('general')
  const [unauthorizedError, setUnauthorizedError] = useState(null)

  // Corpus Manager State
  const [corpusManagerModalOpen, setCorpusManagerModalOpen] = useState(false)
  const [corpusManagerMode, setCorpusManagerMode] = useState('list') // 'list' | 'save'

  // Table Preview State
  const [selectedPackageForTablePreview, setSelectedPackageForTablePreview] = useState(null)

  // Filters State (Cumulative Multiselect)
  const [query, setQuery] = useState(() => loadSessionState('query', ''))
  const [selectedDomains, setSelectedDomains] = useState(() => loadSessionState('selectedDomains', []))
  const [selectedFields, setSelectedFields] = useState(() => loadSessionState('selectedFields', []))
  const [selectedSubfields, setSelectedSubfields] = useState(() => loadSessionState('selectedSubfields', []))
  const [selectedTopics, setSelectedTopics] = useState(() => loadSessionState('selectedTopics', []))
  const [topicLogic, setTopicLogic] = useState(() => loadSessionState('topicLogic', 'OR'))
  const [selectedSources, setSelectedSources] = useState(() => loadSessionState('selectedSources', []))
  const [selectedInstitutions, setSelectedInstitutions] = useState(() => loadSessionState('selectedInstitutions', []))
  const [institutionLogic, setInstitutionLogic] = useState(() => loadSessionState('institutionLogic', 'OR'))
  const [selectedAuthors, setSelectedAuthors] = useState(() => loadSessionState('selectedAuthors', []))
  const [authorLogic, setAuthorLogic] = useState(() => loadSessionState('authorLogic', 'OR'))
  const [selectedCountries, setSelectedCountries] = useState(() => loadSessionState('selectedCountries', []))
  const [countryLogic, setCountryLogic] = useState(() => loadSessionState('countryLogic', 'OR'))
  const [selectedTypes, setSelectedTypes] = useState(() => loadSessionState('selectedTypes', []))
  const [startYear, setStartYear] = useState(() => loadSessionState('startYear', 2015))
  const [endYear, setEndYear] = useState(() => loadSessionState('endYear', 2026))
  const [allYears, setAllYears] = useState(() => loadSessionState('allYears', true))
  const [oaStatus, setOaStatus] = useState(() => loadSessionState('oaStatus', 'all'))

  // Direct IDs / DOIs State
  const [idsText, setIdsText] = useState(() => loadSessionState('idsText', ''))

  // Upload State
  const [uploadedFile, setUploadedFile] = useState(null)
  const [uploadResult, setUploadResult] = useState(null)
  const [isUploading, setIsUploading] = useState(false)

  // Autocomplete Modal State
  const [modalEntity, setModalEntity] = useState(null) // 'topic' | 'source' | 'institution' | 'author' | 'country'
  const [entitySearchQuery, setEntitySearchQuery] = useState('')
  const [entityResults, setEntityResults] = useState([])
  const [isSearchingEntity, setIsSearchingEntity] = useState(false)

  // Results & Pagination State
  const [previewLoading, setPreviewLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(() => loadSessionState('hasSearched', false))
  const [previewData, setPreviewData] = useState(() => loadSessionState('previewData', { total: 0, results: [], page: 1, total_pages: 1 }))
  const [currentPage, setCurrentPage] = useState(1)
  const [isExportingCorpus, setIsExportingCorpus] = useState(null) // 'csv' | 'json' | null
  const pageSize = 20

  // Individual Work Citing & References Modal State
  const [workCitingModalOpen, setWorkCitingModalOpen] = useState(false)
  const [workCitationModalTab, setWorkCitationModalTab] = useState('citing')
  const [selectedWorkForCiting, setSelectedWorkForCiting] = useState({ id: '', title: '', citations: 0, references: 0 })

  // Builder Corpus Citing & References Modal State
  const [builderCitingModalOpen, setBuilderCitingModalOpen] = useState(false)
  const [builderCitingModalTab, setBuilderCitingModalTab] = useState('citing')

  // Package & Calculation State
  const [packageName, setPackageName] = useState(() => {
    const saved = loadSessionState('packageName', null)
    if (saved && saved !== 'Mi_Corpus_TlachIA') return saved
    return generateSuggestedCorpusName(user)
  })

  useEffect(() => {
    if (user && (!packageName || packageName === 'Mi_Corpus_TlachIA' || packageName.startsWith('Mi_Corpus_'))) {
      setPackageName(generateSuggestedCorpusName(user))
    }
  }, [user])
  const [activeJob, setActiveJob] = useState(null)
  const [jobModalOpen, setJobModalOpen] = useState(false)
  const [timeWindowsConfig, setTimeWindowsConfig] = useState(() => loadSessionState('timeWindowsConfig', {
    windowSize: 5,
    windowMode: 'consecutive',
    anchorDirection: 'end',
    minDocs: 1
  }))

  // Duplicate Corpus Validation State
  const [lastCalculatedSignature, setLastCalculatedSignature] = useState(null)
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false)
  const [duplicatePackageName, setDuplicatePackageName] = useState('')

  // Massive Corpus (> 1M) Confirmation Modal State
  const [massiveCorpusModalOpen, setMassiveCorpusModalOpen] = useState(false)

  // Determine if there is at least one active filter or search query
  const hasAnyFilter = useMemo(() => {
    if (isScopusMode) {
      return scopusQuery.trim().length > 0
    }
    if (searchMode === 'wos') {
      return wosQuery.trim().length > 0
    }
    if (searchMode === 'ids') {
      return idsText.trim().length > 0
    }
    if (searchMode === 'upload') {
      return uploadedFile !== null || uploadResult !== null
    }
    return Boolean(
      query.trim().length > 0 ||
      selectedDomains.length > 0 ||
      selectedFields.length > 0 ||
      selectedSubfields.length > 0 ||
      selectedTopics.length > 0 ||
      selectedSources.length > 0 ||
      selectedInstitutions.length > 0 ||
      selectedAuthors.length > 0 ||
      selectedCountries.length > 0 ||
      selectedTypes.length > 0 ||
      !allYears ||
      oaStatus !== 'all'
    )
  }, [
    isScopusMode, scopusQuery, searchMode, wosQuery, idsText, uploadedFile, uploadResult, query,
    selectedDomains, selectedFields, selectedSubfields, selectedTopics,
    selectedSources, selectedInstitutions, selectedAuthors, selectedCountries,
    selectedTypes, allYears, oaStatus
  ])

  // Downloads Hub State
  const [packages, setPackages] = useState([])
  const [loadingPackages, setLoadingPackages] = useState(false)
  const [selectedPackageDetails, setSelectedPackageDetails] = useState(null)
  const [generatingZipPackages, setGeneratingZipPackages] = useState({})

  // Health Status
  const [apiOnline, setApiOnline] = useState(true)

  // Loaded Corpus Identity State
  const [loadedCorpusMetadata, setLoadedCorpusMetadata] = useState(() => loadSessionState('loadedCorpusMetadata', null))

  // Save Builder State in Session Storage to preserve across tabs and reloads
  useEffect(() => {
    try {
      sessionStorage.setItem('tlachia_activeTab', JSON.stringify(activeTab))
      sessionStorage.setItem('tlachia_searchMode', JSON.stringify(searchMode))
      sessionStorage.setItem('tlachia_query', JSON.stringify(query))
      sessionStorage.setItem('tlachia_selectedDomains', JSON.stringify(selectedDomains))
      sessionStorage.setItem('tlachia_selectedFields', JSON.stringify(selectedFields))
      sessionStorage.setItem('tlachia_selectedSubfields', JSON.stringify(selectedSubfields))
      sessionStorage.setItem('tlachia_selectedTopics', JSON.stringify(selectedTopics))
      sessionStorage.setItem('tlachia_topicLogic', JSON.stringify(topicLogic))
      sessionStorage.setItem('tlachia_selectedSources', JSON.stringify(selectedSources))
      sessionStorage.setItem('tlachia_selectedInstitutions', JSON.stringify(selectedInstitutions))
      sessionStorage.setItem('tlachia_institutionLogic', JSON.stringify(institutionLogic))
      sessionStorage.setItem('tlachia_selectedAuthors', JSON.stringify(selectedAuthors))
      sessionStorage.setItem('tlachia_authorLogic', JSON.stringify(authorLogic))
      sessionStorage.setItem('tlachia_selectedCountries', JSON.stringify(selectedCountries))
      sessionStorage.setItem('tlachia_countryLogic', JSON.stringify(countryLogic))
      sessionStorage.setItem('tlachia_selectedTypes', JSON.stringify(selectedTypes))
      sessionStorage.setItem('tlachia_startYear', JSON.stringify(startYear))
      sessionStorage.setItem('tlachia_endYear', JSON.stringify(endYear))
      sessionStorage.setItem('tlachia_allYears', JSON.stringify(allYears))
      sessionStorage.setItem('tlachia_oaStatus', JSON.stringify(oaStatus))
      sessionStorage.setItem('tlachia_idsText', JSON.stringify(idsText))
      sessionStorage.setItem('tlachia_hasSearched', JSON.stringify(hasSearched))
      sessionStorage.setItem('tlachia_previewData', JSON.stringify(previewData))
      sessionStorage.setItem('tlachia_packageName', JSON.stringify(packageName))
      sessionStorage.setItem('tlachia_loadedCorpusMetadata', JSON.stringify(loadedCorpusMetadata))
      sessionStorage.setItem('tlachia_isScopusMode', JSON.stringify(isScopusMode))
      sessionStorage.setItem('tlachia_scopusQuery', JSON.stringify(scopusQuery))
      sessionStorage.setItem('tlachia_scopusCoverageStats', JSON.stringify(scopusCoverageStats))
      sessionStorage.setItem('tlachia_timeWindowsConfig', JSON.stringify(timeWindowsConfig))
      sessionStorage.setItem('tlachia_wosQuery', JSON.stringify(wosQuery))
      sessionStorage.setItem('tlachia_wosUseCte', JSON.stringify(wosUseCte))
    } catch (e) {
      console.warn('Could not persist session state:', e)
    }
  }, [
    activeTab, searchMode, query, selectedDomains, selectedFields, selectedSubfields,
    selectedTopics, topicLogic, selectedSources, selectedInstitutions, institutionLogic,
    selectedAuthors, authorLogic, selectedCountries, countryLogic, selectedTypes,
    startYear, endYear, allYears, oaStatus, idsText, hasSearched, previewData, packageName,
    loadedCorpusMetadata, isScopusMode, scopusQuery, scopusCoverageStats, timeWindowsConfig,
    wosQuery, wosUseCte
  ])

  // Check API Health & Scopus Availability
  useEffect(() => {
    axios.get('/api/health')
      .then(() => setApiOnline(true))
      .catch(() => setApiOnline(false))

    axios.get('/api/scopus/status')
      .then(res => {
        setScopusAvailable(Boolean(res.data.available))
      })
      .catch(err => {
        console.warn('Could not verify Scopus status:', err)
        setScopusAvailable(false)
      })
  }, [])

  // Handle ORCID OAuth callback (?code=...) on page load
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      if (code) {
        axios.post('/api/auth/orcid/token', { code })
          .then(res => {
            if (res.data && res.data.orcid) {
              const userData = {
                orcid: res.data.orcid,
                name: res.data.name,
                institution: res.data.institution || '',
                country: res.data.country || '',
                role: res.data.role || 'user',
                is_admin: !!res.data.is_admin,
                access_token: res.data.access_token
              }
              setUser(userData)
              localStorage.setItem('tlachia_user', JSON.stringify(userData))
              setPackageName(prev => (!prev || prev === 'Mi_Corpus_TlachIA' || prev.startsWith('Corpus_') || prev.startsWith('Mi_Corpus_')) ? generateSuggestedCorpusName(userData) : prev)
              fetchPackages(userData.orcid)
            }
          })
          .catch(err => {
            console.error('Error exchanging ORCID code:', err)
            const errorData = err.response?.data
            if (err.response?.status === 403 || errorData?.error === 'unauthorized_user') {
              setUnauthorizedError(errorData?.message || `Acceso Denegado: Tu identificador ORCID (${errorData?.orcid || ''}) no está en la lista de usuarios autorizados.`)
            } else {
              alert('Error al autenticar con ORCID: ' + (errorData?.detail || errorData?.error || err.message))
            }
          })
          .finally(() => {
            params.delete('code')
            params.delete('state')
            const cleanUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname
            window.history.replaceState({}, '', cleanUrl)
          })
      }
    } catch (e) {
      console.error('ORCID callback error:', e)
    }
  }, [])

  // Logout handler
  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem('tlachia_user')
    setSelectedPackageForTablePreview(null)
    setActiveJob(null)
    setPackages([])
    handleResetCorpus()
    setActiveTab('builder')
  }

  // Explicit Search Trigger
  const handleSearch = () => {
    if (!user) {
      setLoginModalReason('general')
      setLoginModalOpen(true)
      return
    }
    if (!hasAnyFilter) {
      alert('Debes ingresar al menos una palabra clave, seleccionar una entidad o aplicar un filtro para dimensionar el corpus.')
      return
    }
    setHasSearched(true)
    fetchPreview(1)
  }

  // Open Autocomplete Entity Modal with Auth Guard
  const openEntityModal = (entity) => {
    if (!user) {
      setLoginModalReason('filters')
      setLoginModalOpen(true)
      return
    }
    setModalEntity(entity)
    setEntitySearchQuery('')
    setEntityResults([])
  }

  // Reset Corpus Parameters
  const handleResetCorpus = () => {
    setQuery('')
    setSelectedDomains([])
    setSelectedFields([])
    setSelectedSubfields([])
    setSelectedTopics([])
    setSelectedSources([])
    setSelectedInstitutions([])
    setSelectedAuthors([])
    setSelectedCountries([])
    setSelectedTypes([])
    setStartYear(2015)
    setEndYear(2026)
    setAllYears(true)
    setOaStatus('all')
    setIdsText('')
    setUploadedFile(null)
    setUploadResult(null)
    setHasSearched(false)
    setPreviewData({ total: 0, results: [], page: 1, total_pages: 1 })
    setPackageName(generateSuggestedCorpusName(user))
    setLoadedCorpusMetadata(null)
    setIsScopusMode(false)
    setScopusQuery('')
    setScopusCoverageStats(null)
    setWosQuery('')
    setWosCompiled(null)
    setWosError(null)
    setShowCompiledSql(false)

    try {
      Object.keys(sessionStorage).forEach(k => {
        if (k.startsWith('tlachia_') && k !== 'tlachia_activeTab') {
          sessionStorage.removeItem(k)
        }
      })
    } catch (e) {
      console.warn('Could not clear sessionStorage:', e)
    }
  }

  // Compile Web of Science (WoS) Query to ClickHouse SQL
  const handleCompileWos = async (queryToCompile = null) => {
    const q = (queryToCompile !== null ? queryToCompile : wosQuery).trim()
    if (!q) {
      setWosCompiled(null)
      setWosError(null)
      return
    }
    setWosCompiling(true)
    setWosError(null)
    try {
      const res = await axios.post('/api/corpus/compile-wos', {
        query: q,
        use_cte: wosUseCte
      })
      if (res.data?.status === 'success') {
        setWosCompiled(res.data.data)
      } else {
        setWosError(res.data?.error || 'Error compilando consulta WoS')
      }
    } catch (err) {
      setWosError(err.response?.data?.error || err.message || 'Error de sintaxis WoS')
    } finally {
      setWosCompiling(false)
    }
  }

  const handleWosFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result || ''
      setWosQuery(content)
      handleCompileWos(content)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleInsertWosTag = (tag) => {
    setWosQuery(prev => prev ? `${prev} ${tag}` : tag)
  }

  const handleCopySql = (sql) => {
    if (!sql) return
    navigator.clipboard.writeText(sql).then(() => {
      setSqlCopied(true)
      setTimeout(() => setSqlCopied(false), 2000)
    })
  }

  // Execute Search in Scopus API and Cross-Reference with OpenAlex ClickHouse
  const handleExecuteScopusSearch = async () => {
    if (!user) {
      setLoginModalReason('general')
      setLoginModalOpen(true)
      return
    }
    if (!scopusQuery.trim()) {
      alert('Por favor especifica o genera una consulta de Scopus.')
      return
    }

    setIsScopusSearching(true)
    setPreviewLoading(true)
    setHasSearched(true)
    try {
      const res = await axios.post('/api/scopus/search-and-enrich', {
        query: scopusQuery.trim(),
        start_year: allYears ? undefined : startYear,
        end_year: allYears ? undefined : endYear,
        max_results: 10000
      }, { timeout: 180000 })

      const data = res.data
      setScopusCoverageStats({
        scopus_total_found: data.scopus_total_found || 0,
        scopus_docs_fetched: data.scopus_docs_fetched || 0,
        matched_in_openalex: data.matched_in_openalex || 0,
        coverage_pct: data.coverage_pct || 0.0,
        unmatched_dois_count: data.unmatched_dois_count || 0
      })

      setPreviewData({
        total: data.matched_in_openalex || 0,
        results: data.preview_results || [],
        page: 1,
        total_pages: Math.ceil((data.matched_in_openalex || 0) / 20) || 1
      })

      if (data.work_ids?.length > 0) {
        setIdsText(data.work_ids.join('\n'))
      }

      if (packageName === 'Mi_Corpus_TlachIA') {
        setPackageName('Corpus_Scopus_Custom')
      }
    } catch (err) {
      console.error('Error executing Scopus search:', err)
      const errorDetail = err.response?.data?.error || err.message || 'Error de conexión con Scopus API.'
      alert(`Error en consulta Scopus: ${errorDetail}`)
    } finally {
      setIsScopusSearching(false)
      setPreviewLoading(false)
    }
  }

  // Load Saved Corpus from Corpus Manager
  const handleLoadSavedCorpus = (corpus) => {
    if (!corpus) return

    // 1. Limpiar completamente el estado anterior antes de cargar el nuevo corpus
    handleResetCorpus()
    setPreviewData({ total: corpus.total_works_estimated || 0, results: [], page: 1, total_pages: 1 })

    // 2. Registrar la identidad del corpus cargado para permitir actualizaciones en el mismo
    setLoadedCorpusMetadata({
      corpus_id: corpus.corpus_id,
      corpus_name: corpus.corpus_name,
      description: corpus.description || '',
      lineage_type: corpus.lineage_type || 'standalone',
      parent_corpus_id: corpus.parent_corpus_id || null,
      source_mode: corpus.source_mode || 'filters'
    })

    // 3. Vincular o resetear la vista de tablas del paquete
    const cName = corpus.corpus_name || 'Mi_Corpus_TlachIA'
    setPackageName(cName)
    const matchingPackage = packages.find(p => (p.package_name || p.name) === cName)
    if (matchingPackage) {
      setSelectedPackageForTablePreview(cName)
    } else {
      setSelectedPackageForTablePreview(null)
    }

    // 4. Cargar los nuevos parámetros del corpus
    const mode = corpus.source_mode || 'filters'
    setSearchMode(mode)

    if (mode === 'ids') {
      const idsArr = Array.isArray(corpus.ids_list) ? corpus.ids_list : []
      setIdsText(idsArr.join('\n'))
      setActiveTab('builder')
      setHasSearched(true)
      if (idsArr.length > 0) {
        setPreviewLoading(true)
        axios.post('/api/corpus/preview-ids', { work_ids: idsArr.slice(0, 500) })
          .then(res => {
            setPreviewData({
              total: idsArr.length,
              results: res.data.results || [],
              page: 1,
              total_pages: Math.ceil(idsArr.length / 20) || 1
            })
            setPreviewLoading(false)
          })
          .catch(err => {
            console.error('Error previewing loaded IDs:', err)
            setPreviewLoading(false)
          })
      }
    } else if (mode === 'filters' || mode === 'scopus') {
      const f = corpus.filters || {}
      if (mode === 'scopus' || f.scopus_query) {
        setIsScopusMode(true)
        setScopusQuery(f.scopus_query || '')
      } else {
        setIsScopusMode(false)
        setScopusQuery('')
      }
      setQuery(f.query || '')
      setStartYear(f.start_year || 2015)
      setEndYear(f.end_year || 2026)
      setAllYears(f.all_years !== undefined ? f.all_years : (f.start_year === 1900 && f.end_year === 2026))
      setOaStatus(f.oa_status || 'all')

      // Taxonomía
      setSelectedDomains((f.domain_names || f.domains || []).map(d => typeof d === 'object' ? d : { id: d, name: d, domain_name: d }))
      setSelectedFields((f.field_names || f.fields || []).map(d => typeof d === 'object' ? d : { id: d, name: d, field_name: d }))
      setSelectedSubfields((f.subfield_names || f.subfields || []).map(d => typeof d === 'object' ? d : { id: d, name: d, subfield_name: d }))
      setSelectedTopics((f.topic_ids || f.topics || []).map(d => typeof d === 'object' ? d : { id: d, name: d }))
      setTopicLogic(f.topic_logic || 'OR')

      // Entidades
      setSelectedSources((f.source_ids || []).map(d => typeof d === 'object' ? d : { id: d, name: d }))
      setSelectedInstitutions((f.institution_ids || []).map(d => typeof d === 'object' ? d : { id: d, name: d }))
      setInstitutionLogic(f.institution_logic || 'OR')
      setSelectedAuthors((f.author_ids || []).map(d => typeof d === 'object' ? d : { id: d, name: d }))
      setAuthorLogic(f.author_logic || 'OR')
      setSelectedCountries((f.country_codes || []).map(c => typeof c === 'object' ? (c.code || c.id) : c).map(c => ({ code: c.code || c, name: c.name || c })))
      setCountryLogic(f.country_logic || 'OR')
      setSelectedTypes((f.work_types || []).map(d => typeof d === 'object' ? d : { id: d, name: d }))

      setActiveTab('builder')
      setHasSearched(true)

      const previewPayload = {
        query: f.query || '',
        domain_names: (f.domain_names || []).map(d => typeof d === 'object' ? (d.domain_name || d.name) : d),
        domain_ids: (f.domain_ids || []),
        field_names: (f.field_names || []).map(d => typeof d === 'object' ? (d.field_name || d.name) : d),
        field_ids: (f.field_ids || []),
        subfield_names: (f.subfield_names || []).map(d => typeof d === 'object' ? (d.subfield_name || d.name) : d),
        subfield_ids: (f.subfield_ids || []),
        topic_ids: (f.topic_ids || []).map(t => typeof t === 'object' ? t.id : t),
        topic_logic: f.topic_logic || 'OR',
        source_ids: (f.source_ids || []).map(s => typeof s === 'object' ? s.id : s),
        institution_ids: (f.institution_ids || []).map(i => typeof i === 'object' ? i.id : i),
        institution_logic: f.institution_logic || 'OR',
        author_ids: (f.author_ids || []).map(a => typeof a === 'object' ? a.id : a),
        author_logic: f.author_logic || 'OR',
        country_codes: (f.country_codes || []).map(c => typeof c === 'object' ? (c.code || c.id) : c),
        country_logic: f.country_logic || 'OR',
        work_types: (f.work_types || []).map(t => typeof t === 'object' ? (t.id || t.type_id) : t),
        start_year: f.start_year || 1900,
        end_year: f.end_year || 2026,
        oa_status: (f.oa_status && f.oa_status !== 'all') ? f.oa_status : undefined,
        limit: 20,
        offset: 0
      }

      setPreviewLoading(true)
      axios.post('/api/corpus/preview', previewPayload)
        .then(res => {
          setPreviewData({
            total: res.data.total || 0,
            results: res.data.results || [],
            page: 1,
            total_pages: res.data.total_pages || 1
          })
          setPreviewLoading(false)
        })
        .catch(err => {
          console.error('Error previewing loaded filters corpus:', err)
          setPreviewLoading(false)
        })
    }
  }

  // Fetch Preview Works from Filters
  const fetchPreview = async (page = 1) => {
    if (!user) return
    setPreviewLoading(true)
    try {
      const offset = (page - 1) * pageSize
      let payload
      if (searchMode === 'wos') {
        payload = {
          source_mode: 'wos',
          wos_query: wosQuery.trim(),
          use_cte: wosUseCte,
          limit: pageSize,
          offset
        }
      } else {
        payload = {
          query,
          domain_names: selectedDomains.map(d => d.domain_name || d.name),
          domain_ids: selectedDomains.map(d => d.id),
          field_names: selectedFields.map(f => f.field_name || f.name),
          field_ids: selectedFields.map(f => f.id),
          subfield_names: selectedSubfields.map(sf => sf.subfield_name || sf.name),
          subfield_ids: selectedSubfields.map(sf => sf.id),
          topic_ids: selectedTopics.map(t => t.id),
          topic_logic: topicLogic,
          source_ids: selectedSources.map(s => s.id),
          institution_ids: selectedInstitutions.map(i => i.id),
          institution_logic: institutionLogic,
          author_ids: selectedAuthors.map(a => a.id),
          author_logic: authorLogic,
          country_codes: selectedCountries.map(c => c.code || c.id),
          country_logic: countryLogic,
          work_types: selectedTypes.map(t => t.id || t.type_id),
          start_year: allYears ? 1900 : startYear,
          end_year: allYears ? 2026 : endYear,
          oa_status: oaStatus !== 'all' ? oaStatus : undefined,
          limit: pageSize,
          offset
        }
      }
      const res = await axios.post('/api/corpus/preview', payload)
      setPreviewData(res.data)
      if (res.data?.wos_metadata) {
        setWosCompiled(prev => ({ ...(prev || {}), ...res.data.wos_metadata }))
      }
      setCurrentPage(page)
    } catch (err) {
      console.error('Error fetching preview:', err)
      if (err.response?.status === 401) {
        setUser(null)
        localStorage.removeItem('tlachia_user')
        setLoginModalReason('general')
        setLoginModalOpen(true)
      }
    } finally {
      setPreviewLoading(false)
    }
  }

  // Download Corpus in CSV or JSON
  const handleDownloadCorpus = async (format = 'csv') => {
    if (!user) {
      setLoginModalReason('general')
      setLoginModalOpen(true)
      return
    }

    setIsExportingCorpus(format)
    try {
      const payload = {
        format,
        corpus_name: packageName || 'Corpus_OpenAlex',
        source_mode: searchMode,
        wos_query: searchMode === 'wos' ? wosQuery.trim() : undefined,
        use_cte: wosUseCte,
        query,
        domain_names: selectedDomains.map(d => d.domain_name || d.name),
        domain_ids: selectedDomains.map(d => d.id),
        field_names: selectedFields.map(f => f.field_name || f.name),
        field_ids: selectedFields.map(f => f.id),
        subfield_names: selectedSubfields.map(sf => sf.subfield_name || sf.name),
        subfield_ids: selectedSubfields.map(sf => sf.id),
        topic_ids: selectedTopics.map(t => t.id),
        topic_logic: topicLogic,
        source_ids: selectedSources.map(s => s.id),
        institution_ids: selectedInstitutions.map(i => i.id),
        institution_logic: institutionLogic,
        author_ids: selectedAuthors.map(a => a.id),
        author_logic: authorLogic,
        country_codes: selectedCountries.map(c => c.code || c.id),
        country_logic: countryLogic,
        work_types: selectedTypes.map(t => t.id || t.type_id),
        start_year: allYears ? 1900 : startYear,
        end_year: allYears ? 2026 : endYear,
        oa_status: oaStatus !== 'all' ? oaStatus : undefined,
        ids: searchMode === 'ids' ? idsText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) : [],
        file_path: uploadResult?.file_path,
        limit: 10000
      }

      const response = await axios.post('/api/corpus/export', payload, {
        headers: user.orcid ? { 'X-User-ORCID': user.orcid } : {},
        responseType: 'blob'
      })

      const blob = new Blob([response.data], {
        type: format === 'json' ? 'application/json' : 'text/csv'
      })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(packageName || 'Corpus_OpenAlex').trim()}_works.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error downloading corpus:', err)
      alert('Error descargando el corpus: ' + (err.response?.data?.error || err.message))
    } finally {
      setIsExportingCorpus(null)
    }
  }

  // Open Citing / References Modal for an Individual Paper
  const handleOpenWorkCitationModal = (workId, workTitle, citations, references, tab = 'citing') => {
    if (!user) {
      setLoginModalReason('general')
      setLoginModalOpen(true)
      return
    }
    setSelectedWorkForCiting({
      id: workId,
      title: workTitle || 'Artículo Científico',
      citations: citations || 0,
      references: references || 0
    })
    setWorkCitationModalTab(tab)
    setWorkCitingModalOpen(true)
  }

  // Receive Citing Works and load into Corpus Builder
  const handleReceiveCitingCorpus = (citingIds, corpusName) => {
    if (!citingIds || citingIds.length === 0) return
    handleResetCorpus()
    setSelectedPackageForTablePreview(null)
    setPackageName(corpusName || 'Corpus_Citantes')
    setSearchMode('ids')
    const idsString = citingIds.join('\n')
    setIdsText(idsString)
    setActiveTab('builder')
    setHasSearched(true)
    setPreviewLoading(true)

    // Consultar previsualización de IDs de inmediato
    axios.post('/api/corpus/preview-ids', { work_ids: citingIds.slice(0, 500) })
      .then(res => {
        setPreviewData({
          total: citingIds.length,
          results: res.data.results || [],
          page: 1,
          total_pages: Math.ceil(citingIds.length / 50) || 1
        })
      })
      .catch(err => {
        console.error('Error previewing citing IDs:', err)
      })
      .finally(() => {
        setPreviewLoading(false)
      })
  }

  // Preview Direct IDs
  const handlePreviewIds = async () => {
    if (!user) {
      setLoginModalReason('filters')
      setLoginModalOpen(true)
      return
    }
    const lines = idsText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
    if (lines.length === 0) return
    setPreviewLoading(true)
    setHasSearched(true)
    try {
      const isDois = lines.some(l => l.startsWith('10.') || l.includes('doi.org'))
      const payload = isDois ? { dois: lines } : { work_ids: lines }
      const res = await axios.post('/api/corpus/preview-ids', payload)
      setPreviewData({
        total: res.data.total,
        results: res.data.results,
        page: 1,
        total_pages: Math.ceil(res.data.total / 50) || 1
      })
    } catch (err) {
      console.error('Error previewing IDs:', err)
      if (err.response?.status === 401) {
        setUser(null)
        localStorage.removeItem('tlachia_user')
        setLoginModalReason('general')
        setLoginModalOpen(true)
      }
    } finally {
      setPreviewLoading(false)
    }
  }

  // Upload Handler
  const handleFileUpload = async (e) => {
    if (!user) {
      setLoginModalReason('upload')
      setLoginModalOpen(true)
      return
    }
    const file = e.target.files?.[0]
    if (!file) return
    setUploadedFile(file)
    setIsUploading(true)
    setHasSearched(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await axios.post('/api/corpus/upload-preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setUploadResult(res.data)
      setPreviewData({
        total: res.data.total_works,
        results: res.data.sample_results,
        page: 1,
        total_pages: 1
      })
    } catch (err) {
      alert('Error al subir archivo: ' + (err.response?.data?.error || err.message))
    } finally {
      setIsUploading(false)
    }
  }

  // Entity Autocomplete Search
  useEffect(() => {
    if (!modalEntity || !entitySearchQuery.trim()) {
      setEntityResults([])
      return
    }
    if (!user) {
      setEntityResults([])
      return
    }
    const timer = setTimeout(async () => {
      setIsSearchingEntity(true)
      try {
        const typeMap = {
          domain: 'domains',
          field: 'fields',
          subfield: 'subfields',
          topic: 'topics',
          source: 'sources',
          institution: 'institutions',
          author: 'authors',
          country: 'countries',
          work_type: 'work_types'
        }
        const res = await axios.get('/api/entities/search', {
          params: { type: typeMap[modalEntity] || modalEntity, q: entitySearchQuery, limit: 25 }
        })
        setEntityResults(res.data.results || [])
      } catch (err) {
        console.error('Error searching entity:', err)
        if (err.response?.status === 401) {
          setUser(null)
          localStorage.removeItem('tlachia_user')
          setModalEntity(null)
          setLoginModalReason('filters')
          setLoginModalOpen(true)
        }
      } finally {
        setIsSearchingEntity(false)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [modalEntity, entitySearchQuery, user])

  // Select Entity from Modal
  const handleSelectEntity = (item) => {
    if (modalEntity === 'domain') {
      setSelectedDomains(prev => prev.some(x => x.id === item.id) ? prev : [...prev, item])
    } else if (modalEntity === 'field') {
      setSelectedFields(prev => prev.some(x => x.id === item.id) ? prev : [...prev, item])
    } else if (modalEntity === 'subfield') {
      setSelectedSubfields(prev => prev.some(x => x.id === item.id) ? prev : [...prev, item])
    } else if (modalEntity === 'topic') {
      setSelectedTopics(prev => prev.some(x => x.id === item.id) ? prev : [...prev, item])
    } else if (modalEntity === 'source') {
      setSelectedSources(prev => prev.some(x => x.id === item.id) ? prev : [...prev, item])
    } else if (modalEntity === 'institution') {
      setSelectedInstitutions(prev => prev.some(x => x.id === item.id) ? prev : [...prev, item])
    } else if (modalEntity === 'author') {
      setSelectedAuthors(prev => prev.some(x => x.id === item.id) ? prev : [...prev, item])
    } else if (modalEntity === 'country') {
      setSelectedCountries(prev => prev.some(x => (x.code || x.id) === (item.code || item.id)) ? prev : [...prev, item])
    } else if (modalEntity === 'work_type') {
      setSelectedTypes(prev => prev.some(x => (x.id || x.type_id) === (item.id || item.type_id)) ? prev : [...prev, item])
    }
    setModalEntity(null)
    setEntitySearchQuery('')
  }

  // Helper to build canonical payload and deterministic signature
  const buildCorpusPayload = () => {
    let payload = {
      package_name: packageName.trim().replace(/\s+/g, '_') || `Corpus_${Date.now()}`,
      source_mode: searchMode
    }

    if (searchMode === 'filters') {
      payload.filters = {
        query: query.trim(),
        domain_names: selectedDomains.map(d => d.domain_name || d.name),
        domain_ids: selectedDomains.map(d => d.id),
        field_names: selectedFields.map(f => f.field_name || f.name),
        field_ids: selectedFields.map(f => f.id),
        subfield_names: selectedSubfields.map(sf => sf.subfield_name || sf.name),
        subfield_ids: selectedSubfields.map(sf => sf.id),
        topic_ids: selectedTopics.map(t => t.id),
        topic_logic: topicLogic,
        source_ids: selectedSources.map(s => s.id),
        institution_ids: selectedInstitutions.map(i => i.id),
        institution_logic: institutionLogic,
        author_ids: selectedAuthors.map(a => a.id),
        author_logic: authorLogic,
        country_codes: selectedCountries.map(c => c.code || c.id),
        country_logic: countryLogic,
        work_types: selectedTypes.map(t => t.id || t.type_id),
        start_year: allYears ? 1900 : startYear,
        end_year: allYears ? 2026 : endYear,
        oa_status: oaStatus !== 'all' ? oaStatus : undefined
      }
    } else if (searchMode === 'wos') {
      payload.wos_query = wosQuery.trim()
      payload.use_cte = wosUseCte
    } else if (searchMode === 'ids') {
      const lines = idsText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
      payload.ids = lines
    } else if (searchMode === 'upload') {
      if (!uploadResult?.file_path) {
        alert('Por favor sube un archivo primero.')
        return null
      }
      payload.file_path = uploadResult.file_path
    }

    // Canonical signature for change detection
    const canonical = {
      package_name: payload.package_name,
      source_mode: payload.source_mode,
      filters: payload.filters ? {
        query: payload.filters.query || '',
        domain_ids: [...(payload.filters.domain_ids || [])].sort(),
        field_ids: [...(payload.filters.field_ids || [])].sort(),
        subfield_ids: [...(payload.filters.subfield_ids || [])].sort(),
        topic_ids: [...(payload.filters.topic_ids || [])].sort(),
        topic_logic: payload.filters.topic_logic,
        source_ids: [...(payload.filters.source_ids || [])].sort(),
        institution_ids: [...(payload.filters.institution_ids || [])].sort(),
        institution_logic: payload.filters.institution_logic,
        author_ids: [...(payload.filters.author_ids || [])].sort(),
        author_logic: payload.filters.author_logic,
        country_codes: [...(payload.filters.country_codes || [])].sort(),
        country_logic: payload.filters.country_logic,
        work_types: [...(payload.filters.work_types || [])].sort(),
        start_year: payload.filters.start_year,
        end_year: payload.filters.end_year,
        oa_status: payload.filters.oa_status || 'all'
      } : null,
      ids: payload.ids ? [...payload.ids].sort() : null,
      wos_query: payload.wos_query || null,
      use_cte: payload.use_cte ?? null,
      file_path: payload.file_path || null
    }

    return { payload, signature: JSON.stringify(canonical) }
  }

  // Open Citations / References for the Assembled Builder Corpus
  const handleOpenBuilderCitations = (tab = 'citing') => {
    if (!user) {
      setLoginModalReason('citations')
      setLoginModalOpen(true)
      return
    }
    if (previewData.total === 0 || !hasAnyFilter) {
      alert(t('builder.alert_no_corpus_citations', 'Debes definir al menos un filtro o identificador en el corpus antes de consultar sus citas o base intelectual.'))
      return
    }
    setBuilderCitingModalTab(tab)
    setBuilderCitingModalOpen(true)
  }

  const getBuilderPayload = () => {
    const built = buildCorpusPayload()
    if (!built) return null
    const { payload } = built
    return {
      source_mode: payload.source_mode,
      filters: payload.filters || {},
      ids: payload.ids || [],
      wos_query: payload.wos_query || '',
      use_cte: payload.use_cte ?? true,
      corpus_name: payload.package_name || packageName || 'Corpus_TlachIA'
    }
  }

  // Launch Metrics Computation Job
  const handleLaunchCalculation = async (force = false, skipMassiveWarning = false, extraConfig = null) => {
    // Verificar que el usuario esté autenticado para procesar
    if (!user?.orcid) {
      setLoginModalReason('job_creation')
      setLoginModalOpen(true)
      return
    }

    if (!hasAnyFilter) {
      alert('Debes definir al menos un filtro, palabra clave o lista de identificadores para calcular métricas.')
      return
    }

    // Si el corpus supera 1 millón de obras y no se ha confirmado explícitamente, pedir confirmación
    if (previewData.total > 1000000 && !skipMassiveWarning) {
      setMassiveCorpusModalOpen(true)
      return
    }

    const built = buildCorpusPayload()
    if (!built) return
    const { payload } = built

    payload.user_orcid = user.orcid
    payload.user_name = user.name || user.orcid

    if (extraConfig?.time_windows) {
      payload.time_windows = extraConfig.time_windows
    } else if (timeWindowsConfig?.periods) {
      payload.time_windows = timeWindowsConfig
    }

    const signature = JSON.stringify({
      package_name: payload.package_name,
      source_mode: payload.source_mode,
      filters: payload.filters,
      ids: payload.ids,
      file_path: payload.file_path,
      time_windows: payload.time_windows || null
    })

    // Validar si ya hay un trabajo en ejecución
    if (activeJob && (activeJob.status === 'queued' || activeJob.status === 'running')) {
      if (activeJob.package_name === payload.package_name || lastCalculatedSignature === signature) {
        setJobModalOpen(true)
        return
      } else {
        alert(`Ya hay un cálculo en curso para el paquete "${activeJob.package_name}". Espera a que termine antes de lanzar otro.`)
        setJobModalOpen(true)
        return
      }
    }

    // Validar si el corpus NO ha cambiado respecto al último cálculo
    if (!force && lastCalculatedSignature === signature) {
      setDuplicatePackageName(payload.package_name)
      setDuplicateModalOpen(true)
      return
    }

    try {
      const res = await axios.post('/api/jobs/create', payload, {
        headers: user?.orcid ? { 'X-User-ORCID': user.orcid, 'X-User-Name': user.name || '' } : {}
      })
      setLastCalculatedSignature(signature)
      setDuplicateModalOpen(false)
      setMassiveCorpusModalOpen(false)
      setActiveJob({
        job_id: res.data.job_id,
        package_name: res.data.package_name,
        status: 'queued',
        progress: 0,
        stage_label: 'Iniciando proceso...'
      })
      setJobModalOpen(true)
    } catch (err) {
      alert('Error al iniciar cálculo: ' + (err.response?.data?.error || err.message))
    }
  }

  // Poll Active Job
  useEffect(() => {
    if (!activeJob || activeJob.status === 'completed' || activeJob.status === 'failed') return

    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`/api/jobs/status/${activeJob.job_id}`)
        setActiveJob(res.data)
        if (res.data.status === 'completed') {
          fetchPackages()
        }
      } catch (err) {
        console.error('Error polling job:', err)
      }
    }, 1200)

    return () => clearInterval(interval)
  }, [activeJob])

  // Fetch Packages List (asociado al usuario)
  const fetchPackages = async (overrideOrcid = undefined) => {
    setLoadingPackages(true)
    try {
      const targetOrcid = overrideOrcid !== undefined ? overrideOrcid : user?.orcid
      const url = targetOrcid ? `/api/indicators/packages?orcid=${encodeURIComponent(targetOrcid)}` : '/api/indicators/packages'
      const res = await axios.get(url, {
        headers: targetOrcid ? { 'X-User-ORCID': targetOrcid } : {}
      })
      setPackages(res.data.packages || [])
    } catch (err) {
      console.error('Error loading packages:', err)
    } finally {
      setLoadingPackages(false)
    }
  }

  // Delete Package from Disk
  const handleDeletePackage = async (packageName) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente el paquete "${packageName}"?\n\nEsta acción borrará los archivos Excel, JSON y ZIP asociados en disco.`)) {
      return
    }
    try {
      const orcidParam = user?.orcid ? `?orcid=${encodeURIComponent(user.orcid)}` : ''
      await axios.delete(`/api/indicators/packages/${encodeURIComponent(packageName)}${orcidParam}`, {
        headers: user?.orcid ? { 'X-User-ORCID': user.orcid } : {}
      })
      fetchPackages()
    } catch (err) {
      alert('Error al eliminar paquete: ' + (err.response?.data?.error || err.message))
    }
  }

  // Polling para paquetes conformando dataset JSON en segundo plano
  useEffect(() => {
    const anyGenerating = packages.some((p) => p.json_generating)
    if (!anyGenerating) return

    const interval = setInterval(() => {
      fetchPackages()
    }, 3000)

    return () => clearInterval(interval)
  }, [packages])

  // Iniciar conformación de dataset JSON en segundo plano
  const handleTriggerGenerateJson = async (packageName) => {
    try {
      // Actualización optimista de estado para retroalimentación inmediata en UI
      setPackages((prev) =>
        prev.map((p) =>
          p.package_name === packageName ? { ...p, json_generating: true } : p
        )
      )
      const orcidHeader = user?.orcid ? { 'X-User-ORCID': user.orcid } : {}
      const res = await axios.post(
        `/api/indicators/packages/${encodeURIComponent(packageName)}/generate-json`,
        {},
        { headers: orcidHeader }
      )
      if (res.data?.status === 'completed') {
        fetchPackages()
      }
    } catch (err) {
      console.error('Error initiating JSON generation:', err)
      alert('Error iniciando generación de JSON: ' + (err.response?.data?.error || err.message))
      fetchPackages()
    }
  }

  // Generar archivo ZIP bajo demanda para un paquete
  const handleGenerateZipForPackage = async (packageName) => {
    setGeneratingZipPackages((prev) => ({ ...prev, [packageName]: true }))
    try {
      const orcidHeader = user?.orcid ? { 'X-User-ORCID': user.orcid } : {}
      const res = await axios.post(
        `/api/indicators/packages/${encodeURIComponent(packageName)}/generate-zip`,
        {},
        { headers: orcidHeader }
      )
      await fetchPackages()
      if (res.data?.download_url) {
        const a = document.createElement('a')
        a.href = resolveDownloadUrl(res.data.download_url)
        a.download = `${packageName}.zip`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
    } catch (err) {
      alert('Error generando archivo ZIP: ' + (err.response?.data?.error || err.message))
    } finally {
      setGeneratingZipPackages((prev) => ({ ...prev, [packageName]: false }))
    }
  }

  useEffect(() => {
    if (activeTab === 'downloads' || activeTab === 'tables') {
      fetchPackages()
    }
  }, [activeTab, user])

  // OA Badge Helper
  const renderOaBadge = (status) => {
    const s = String(status || 'closed').toLowerCase()
    if (s === 'diamond') return <span className="badge badge-diamond">💎 Diamante</span>
    if (s === 'gold') return <span className="badge badge-gold">🥇 Gold</span>
    if (s === 'green') return <span className="badge badge-green">🌿 Green</span>
    if (s === 'bronze') return <span className="badge badge-bronze">🥉 Bronze</span>
    if (s === 'hybrid') return <span className="badge badge-hybrid">🔀 Hybrid</span>
    return <span className="badge badge-closed">🔒 Closed</span>
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header className="app-header">
        <div className="container header-content">
          <div className="brand">
            <div className="brand-icon">
              <Sparkles size={22} />
            </div>
            <div>
              <h1 className="brand-title">TlachIA Metrics</h1>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                {t('app.subtitle')}
              </p>
            </div>
          </div>

          <nav className="nav-tabs">
            <button
              className={`nav-tab ${activeTab === 'builder' ? 'active' : ''}`}
              onClick={() => setActiveTab('builder')}
            >
              <Layers size={16} />
              {t('nav.corpus_builder')}
            </button>
            <button
              className={`nav-tab ${activeTab === 'metrics' ? 'active' : ''}`}
              onClick={() => setActiveTab('metrics')}
            >
              <SlidersHorizontal size={16} />
              {t('nav.metrics_config')}
            </button>
            <button
              className={`nav-tab ${activeTab === 'tables' ? 'active' : ''}`}
              onClick={() => setActiveTab('tables')}
            >
              <FileSpreadsheet size={16} />
              {t('nav.table_preview')}
            </button>
            <button
              className={`nav-tab ${activeTab === 'downloads' ? 'active' : ''}`}
              onClick={() => setActiveTab('downloads')}
            >
              <FolderArchive size={16} />
              {t('nav.downloads_center')}
              {packages.length > 0 && (
                <span style={{
                  background: 'var(--accent-primary)',
                  color: '#000',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '10px'
                }}>
                  {packages.length}
                </span>
              )}
            </button>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <LanguageSelector />
            <ThemeToggle theme={theme} onToggle={toggleTheme} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: apiOnline ? '#10b981' : '#f43f5e',
                boxShadow: apiOnline ? '0 0 8px #10b981' : 'none'
              }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {apiOnline ? t('app.clickhouse_online') : t('app.api_offline')}
              </span>
            </div>

            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '24px',
                    padding: '4px 12px 4px 6px'
                  }}
                  title={`${user.name}\n${user.institution || ''} ${user.country || ''}\nORCID: ${user.orcid}`}
                >
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(166, 206, 57, 0.2)',
                      border: '1.5px solid #a6ce39',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#a6ce39',
                      fontWeight: '800',
                      fontSize: '11px'
                    }}
                  >
                    iD
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#fff', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.name}
                    </span>
                    <span style={{ fontSize: '0.66rem', color: user.is_admin ? '#38bdf8' : 'var(--text-dim)' }}>
                      {user.is_admin ? `⚡ ${t('auth.admin')}` : t('auth.researcher')}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  title={t('auth.logout')}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <LogOut size={15} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setLoginModalReason('general')
                  setLoginModalOpen(true)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  backgroundColor: 'rgba(166, 206, 57, 0.15)',
                  border: '1px solid #a6ce39',
                  color: '#a6ce39',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <span style={{ fontWeight: '900', fontSize: '13px' }}>iD</span>
                <span>{t('auth.connect_orcid')}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="container" style={{ flex: 1 }}>
        {activeTab === 'tables' ? (
          <div style={{ marginTop: '24px', marginBottom: '48px' }}>
            <TablePreviewTab
              packages={packages}
              initialPackage={selectedPackageForTablePreview}
              activeJob={activeJob}
              onOpenJobModal={() => setJobModalOpen(true)}
              onOpenDownloads={() => setActiveTab('downloads')}
              onGoToBuilder={() => setActiveTab('builder')}
              onSendToCorpus={handleReceiveCitingCorpus}
              onRefreshPackages={fetchPackages}
              user={user}
            />
          </div>
        ) : activeTab === 'metrics' ? (
          <div style={{ marginTop: '24px', marginBottom: '48px' }}>
            <MetricsConfigTab
              previewData={previewData}
              packageName={packageName}
              setPackageName={setPackageName}
              timeWindowsConfig={timeWindowsConfig}
              setTimeWindowsConfig={setTimeWindowsConfig}
              onLaunchCalculation={(extraCfg) => handleLaunchCalculation(false, false, extraCfg)}
              onGoToBuilder={() => setActiveTab('builder')}
              user={user}
              onOpenLoginModal={() => {
                setLoginModalReason('job_creation')
                setLoginModalOpen(true)
              }}
            />
          </div>
        ) : activeTab === 'builder' ? (
          <div className="main-layout">
            {/* Sidebar Filters */}
            <aside className="glass-panel filters-sidebar">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SlidersHorizontal size={18} color="var(--accent-primary)" />
                  {t('builder.sidebar_title')}
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    className="btn-outline"
                    style={{ padding: '4px 7px', fontSize: '0.72rem', borderRadius: '6px' }}
                    onClick={() => {
                      if (!user) {
                        setLoginModalReason('filters')
                        setLoginModalOpen(true)
                        return
                      }
                      setCorpusManagerMode('save')
                      setCorpusManagerModalOpen(true)
                    }}
                    title={t('builder.save_corpus_tooltip')}
                  >
                    {t('builder.save_corpus_btn')}
                  </button>
                  <button
                    className="btn-outline"
                    style={{ padding: '4px 7px', fontSize: '0.72rem', borderRadius: '6px' }}
                    onClick={() => {
                      if (!user) {
                        setLoginModalReason('filters')
                        setLoginModalOpen(true)
                        return
                      }
                      setCorpusManagerMode('list')
                      setCorpusManagerModalOpen(true)
                    }}
                    title={t('builder.my_corpora_tooltip')}
                  >
                    {t('builder.my_corpora_btn')}
                  </button>
                  <button
                    className="btn-outline"
                    style={{ padding: '4px 7px', fontSize: '0.72rem', borderRadius: '6px' }}
                    onClick={handleResetCorpus}
                    title={t('builder.new_corpus_tooltip')}
                  >
                    {t('builder.new_corpus_btn')}
                  </button>
                </div>
              </div>

              {/* Search Mode Selector */}
              <div className="filter-group">
                <label className="filter-label">{t('builder.mode_selector_label')}</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px', background: 'var(--bg-input)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <button
                    onClick={() => setSearchMode('filters')}
                    style={{
                      padding: '6px 4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background: searchMode === 'filters' ? 'var(--accent-primary)' : 'transparent',
                      color: searchMode === 'filters' ? '#000' : 'var(--text-muted)'
                    }}
                  >
                    {t('builder.mode_filters')}
                  </button>
                  <button
                    onClick={() => setSearchMode('wos')}
                    style={{
                      padding: '6px 4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background: searchMode === 'wos' ? 'var(--accent-primary)' : 'transparent',
                      color: searchMode === 'wos' ? '#000' : 'var(--text-muted)'
                    }}
                  >
                    {t('builder.mode_wos')}
                  </button>
                  <button
                    onClick={() => setSearchMode('ids')}
                    style={{
                      padding: '6px 4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background: searchMode === 'ids' ? 'var(--accent-primary)' : 'transparent',
                      color: searchMode === 'ids' ? '#000' : 'var(--text-muted)'
                    }}
                  >
                    {t('builder.mode_ids')}
                  </button>
                  <button
                    onClick={() => setSearchMode('upload')}
                    style={{
                      padding: '6px 4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background: searchMode === 'upload' ? 'var(--accent-primary)' : 'transparent',
                      color: searchMode === 'upload' ? '#000' : 'var(--text-muted)'
                    }}
                  >
                    {t('builder.mode_upload')}
                  </button>
                </div>
              </div>

              {searchMode === 'filters' && (
                <>
                  {/* Entity Chips Selectors */}
                  <div className="filter-group">
                    <label className="filter-label">{t('builder.taxonomy_title')}</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* 1. Domains */}
                      <div>
                        <button
                          className="btn btn-secondary"
                          style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.8rem', padding: '8px 12px' }}
                          onClick={() => openEntityModal('domain')}
                        >
                          <Compass size={16} color="#38bdf8" />
                          {t('builder.add_domain')} ({selectedDomains.length})
                        </button>
                        {selectedDomains.length > 0 && (
                          <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {selectedDomains.map(d => (
                              <span key={d.id} className="chip" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                                {d.name || d.domain_name}
                                <button className="chip-remove" onClick={() => setSelectedDomains(prev => prev.filter(x => x.id !== d.id))}><X size={10} /></button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 2. Fields */}
                      <div>
                        <button
                          className="btn btn-secondary"
                          style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.8rem', padding: '8px 12px' }}
                          onClick={() => openEntityModal('field')}
                        >
                          <Compass size={16} color="#818cf8" />
                          {t('builder.add_field')} ({selectedFields.length})
                        </button>
                        {selectedFields.length > 0 && (
                          <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {selectedFields.map(f => (
                              <span key={f.id} className="chip" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                                {f.name || f.field_name}
                                <button className="chip-remove" onClick={() => setSelectedFields(prev => prev.filter(x => x.id !== f.id))}><X size={10} /></button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 3. Subfields */}
                      <div>
                        <button
                          className="btn btn-secondary"
                          style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.8rem', padding: '8px 12px' }}
                          onClick={() => openEntityModal('subfield')}
                        >
                          <Compass size={16} color="#c084fc" />
                          {t('builder.add_subfield')} ({selectedSubfields.length})
                        </button>
                        {selectedSubfields.length > 0 && (
                          <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {selectedSubfields.map(sf => (
                              <span key={sf.id} className="chip" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                                {sf.name || sf.subfield_name}
                                <button className="chip-remove" onClick={() => setSelectedSubfields(prev => prev.filter(x => x.id !== sf.id))}><X size={10} /></button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 4. Topics */}
                      <div>
                        <button
                          className="btn btn-secondary"
                          style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.8rem', padding: '8px 12px' }}
                          onClick={() => openEntityModal('topic')}
                        >
                          <Compass size={16} color="var(--accent-primary)" />
                          {t('builder.add_topic')} ({selectedTopics.length})
                        </button>
                        {selectedTopics.length > 0 && (
                          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {selectedTopics.map(t => (
                                <span key={t.id} className="chip" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                                  {t.name}
                                  <button className="chip-remove" onClick={() => setSelectedTopics(prev => prev.filter(x => x.id !== t.id))}><X size={10} /></button>
                                </span>
                              ))}
                            </div>
                            {selectedTopics.length > 1 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                                <span>{t('builder.operator_label')}</span>
                                <button
                                  type="button"
                                  onClick={() => setTopicLogic('OR')}
                                  style={{ background: topicLogic === 'OR' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)', color: topicLogic === 'OR' ? '#000' : 'var(--text-muted)', border: 'none', borderRadius: '4px', padding: '1px 6px', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 600 }}
                                >
                                  {t('builder.operator_or')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTopicLogic('AND')}
                                  style={{ background: topicLogic === 'AND' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)', color: topicLogic === 'AND' ? '#000' : 'var(--text-muted)', border: 'none', borderRadius: '4px', padding: '1px 6px', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 600 }}
                                >
                                  {t('builder.operator_and')}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Entity Chips Selectors: Sources, Insts, Authors */}
                  <div className="filter-group">
                    <label className="filter-label">{t('builder.sources_inst_auth_title')}</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Sources */}
                      <div>
                        <button
                          className="btn btn-secondary"
                          style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.8rem', padding: '8px 12px' }}
                          onClick={() => openEntityModal('source')}
                        >
                          <BookOpen size={16} color="#fbbf24" />
                          {t('builder.add_source')} ({selectedSources.length})
                        </button>
                        {selectedSources.length > 0 && (
                          <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {selectedSources.map(s => (
                              <span key={s.id} className="chip" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                                {s.name}
                                <button className="chip-remove" onClick={() => setSelectedSources(prev => prev.filter(x => x.id !== s.id))}><X size={10} /></button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Institutions */}
                      <div>
                        <button
                          className="btn btn-secondary"
                          style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.8rem', padding: '8px 12px' }}
                          onClick={() => openEntityModal('institution')}
                        >
                          <Building2 size={16} color="#34d399" />
                          {t('builder.add_institution')} ({selectedInstitutions.length})
                        </button>
                        {selectedInstitutions.length > 0 && (
                          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {selectedInstitutions.map(i => (
                                <span key={i.id} className="chip" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                                  {i.name}
                                  <button className="chip-remove" onClick={() => setSelectedInstitutions(prev => prev.filter(x => x.id !== i.id))}><X size={10} /></button>
                                </span>
                              ))}
                            </div>
                            {selectedInstitutions.length > 1 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                                <span>{t('builder.operator_label')}</span>
                                <button
                                  type="button"
                                  onClick={() => setInstitutionLogic('OR')}
                                  style={{ background: institutionLogic === 'OR' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)', color: institutionLogic === 'OR' ? '#000' : 'var(--text-muted)', border: 'none', borderRadius: '4px', padding: '1px 6px', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 600 }}
                                >
                                  {t('builder.operator_or_union')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setInstitutionLogic('AND')}
                                  style={{ background: institutionLogic === 'AND' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)', color: institutionLogic === 'AND' ? '#000' : 'var(--text-muted)', border: 'none', borderRadius: '4px', padding: '1px 6px', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 600 }}
                                >
                                  {t('builder.operator_and_colab')}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Authors */}
                      <div>
                        <button
                          className="btn btn-secondary"
                          style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.8rem', padding: '8px 12px' }}
                          onClick={() => openEntityModal('author')}
                        >
                          <Users size={16} color="#a78bfa" />
                          {t('builder.add_author')} ({selectedAuthors.length})
                        </button>
                        {selectedAuthors.length > 0 && (
                          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {selectedAuthors.map(a => (
                                <span key={a.id} className="chip" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                                  {a.name}
                                  <button className="chip-remove" onClick={() => setSelectedAuthors(prev => prev.filter(x => x.id !== a.id))}><X size={10} /></button>
                                </span>
                              ))}
                            </div>
                            {selectedAuthors.length > 1 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                                <span>{t('builder.operator_label')}</span>
                                <button
                                  type="button"
                                  onClick={() => setAuthorLogic('OR')}
                                  style={{ background: authorLogic === 'OR' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)', color: authorLogic === 'OR' ? '#000' : 'var(--text-muted)', border: 'none', borderRadius: '4px', padding: '1px 6px', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 600 }}
                                >
                                  {t('builder.operator_or')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAuthorLogic('AND')}
                                  style={{ background: authorLogic === 'AND' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)', color: authorLogic === 'AND' ? '#000' : 'var(--text-muted)', border: 'none', borderRadius: '4px', padding: '1px 6px', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 600 }}
                                >
                                  {t('builder.operator_and_coauth')}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Countries Multiselect Catalog */}
                  <div className="filter-group">
                    <label className="filter-label">{t('builder.countries_title')}</label>
                    <button
                      className="btn btn-secondary"
                      style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.8rem', padding: '8px 12px' }}
                      onClick={() => openEntityModal('country')}
                    >
                      <Globe2 size={16} color="#38bdf8" />
                      {t('builder.add_country')} ({selectedCountries.length})
                    </button>
                    {selectedCountries.length > 0 && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {selectedCountries.map(c => (
                            <span key={c.code || c.id} className="chip" style={{ fontSize: '0.74rem', padding: '3px 8px' }}>
                              <span>{c.flag || '🌐'} {c.country_name || c.name}</span>
                              <button className="chip-remove" onClick={() => setSelectedCountries(prev => prev.filter(x => (x.code || x.id) !== (c.code || c.id)))}>
                                <X size={11} />
                              </button>
                            </span>
                          ))}
                        </div>

                        {selectedCountries.length > 1 && (
                          <div style={{ background: 'var(--bg-input)', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                            <span style={{ color: 'var(--text-dim)' }}>{t('builder.country_logic_label')}</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                type="button"
                                onClick={() => setCountryLogic('OR')}
                                style={{
                                  background: countryLogic === 'OR' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                                  color: countryLogic === 'OR' ? '#000' : 'var(--text-muted)',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '2px 8px',
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                {t('builder.country_logic_or')}
                              </button>
                              <button
                                type="button"
                                onClick={() => setCountryLogic('AND')}
                                style={{
                                  background: countryLogic === 'AND' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                                  color: countryLogic === 'AND' ? '#000' : 'var(--text-muted)',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '2px 8px',
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                {t('builder.country_logic_and')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Year Range */}
                  <div className="filter-group">
                    <label className="filter-label">
                      <span>{t('builder.time_range_title')}</span>
                      <span style={{ color: 'var(--accent-primary)', fontSize: '0.75rem' }}>
                        {allYears ? t('builder.all_history_badge') : `${startYear} — ${endYear}`}
                      </span>
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', opacity: allYears ? 0.45 : 1 }}>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{t('builder.from_year')}</span>
                        <input
                          type="number"
                          className="input-text"
                          min="1900"
                          max="2026"
                          disabled={allYears || !user}
                          value={startYear}
                          onChange={(e) => setStartYear(parseInt(e.target.value) || 1970)}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{t('builder.to_year')}</span>
                        <input
                          type="number"
                          className="input-text"
                          min="1900"
                          max="2026"
                          disabled={allYears || !user}
                          value={endYear}
                          onChange={(e) => setEndYear(parseInt(e.target.value) || 2026)}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: user ? 'pointer' : 'not-allowed', fontSize: '0.78rem', color: 'var(--text-main)', userSelect: 'none' }}>
                        <input
                          type="checkbox"
                          checked={allYears}
                          disabled={!user}
                          onChange={(e) => setAllYears(e.target.checked)}
                          style={{ cursor: user ? 'pointer' : 'not-allowed', accentColor: 'var(--accent-primary)', width: '15px', height: '15px' }}
                        />
                        <span>{t('builder.all_history_checkbox')}</span>
                      </label>
                    </div>
                  </div>

                  {/* Document Types Multiselect Catalog */}
                  <div className="filter-group">
                    <label className="filter-label">{t('builder.doc_type_title')}</label>
                    <button
                      className="btn btn-secondary"
                      style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.8rem', padding: '8px 12px' }}
                      onClick={() => openEntityModal('work_type')}
                    >
                      <FileText size={16} color="#fb7185" />
                      {t('builder.add_doc_type')} ({selectedTypes.length})
                    </button>
                    {selectedTypes.length > 0 && (
                      <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {selectedTypes.map(t => (
                          <span key={t.id || t.type_id} className="chip" style={{ fontSize: '0.74rem', padding: '3px 8px' }}>
                            <span>{t.flag || '📄'} {t.type_name || t.name}</span>
                            <button className="chip-remove" onClick={() => setSelectedTypes(prev => prev.filter(x => (x.id || x.type_id) !== (t.id || t.type_id)))}>
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Open Access Status */}
                  <div className="filter-group">
                    <label className="filter-label">{t('builder.oa_title')}</label>
                    <select
                      className="select-custom"
                      value={oaStatus}
                      onChange={(e) => setOaStatus(e.target.value)}
                    >
                      <option value="all">{t('builder.oa_options.all')}</option>
                      <option value="diamond">{t('builder.oa_options.diamond')}</option>
                      <option value="gold">{t('builder.oa_options.gold')}</option>
                      <option value="green">{t('builder.oa_options.green')}</option>
                      <option value="bronze">{t('builder.oa_options.bronze')}</option>
                      <option value="hybrid">{t('builder.oa_options.hybrid')}</option>
                      <option value="closed">{t('builder.oa_options.closed')}</option>
                    </select>
                  </div>

                  {/* Search Button in Sidebar */}
                  <button
                    className="btn btn-primary"
                    style={{
                      width: '100%',
                      marginTop: '14px',
                      padding: '12px',
                      fontSize: '0.9rem',
                      backgroundColor: user ? undefined : 'rgba(166, 206, 57, 0.2)',
                      color: user ? undefined : '#a6ce39',
                      border: user ? undefined : '1px solid #a6ce39'
                    }}
                    onClick={handleSearch}
                    disabled={previewLoading}
                  >
                    {user ? (
                      previewLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />
                    ) : (
                      <span style={{ fontWeight: '900', fontSize: '13px', marginRight: '6px' }}>iD</span>
                    )}
                    {user ? t('builder.search_openalex_btn') : t('builder.connect_orcid_to_search')}
                  </button>
                </>
              )}

              {searchMode === 'wos' && (
                <div className="filter-group" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="filter-label" style={{ marginBottom: 0 }}>{t('builder.wos_sidebar_label')}</label>
                    <label
                      htmlFor="wos-file-input"
                      className="btn-outline"
                      style={{ padding: '3px 8px', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      title={t('builder.wos_load_file')}
                    >
                      <UploadCloud size={12} />
                      {t('builder.wos_load_file')}
                      <input
                        id="wos-file-input"
                        type="file"
                        accept=".txt,.wos,.query"
                        style={{ display: 'none' }}
                        onChange={handleWosFileUpload}
                      />
                    </label>
                  </div>

                  <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
                    {t('builder.wos_sidebar_desc')}
                  </p>

                  {/* Quick Syntax Badges */}
                  <div>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
                      {t('builder.wos_quick_tags')}
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {['TS=', 'TI=', 'AB=', 'WC=', 'CU=(Mexico)', 'PY=(2020-2024)', 'AND', 'OR', 'NOT', 'NEAR/5'].map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleInsertWosTag(tag)}
                          style={{
                            padding: '2px 6px',
                            fontSize: '0.68rem',
                            fontFamily: 'var(--font-mono)',
                            borderRadius: '4px',
                            border: '1px solid var(--border-subtle)',
                            background: 'rgba(255, 255, 255, 0.04)',
                            color: 'var(--accent-primary)',
                            cursor: 'pointer'
                          }}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Textarea Editor */}
                  <textarea
                    className="input-text"
                    style={{
                      minHeight: '220px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.8rem',
                      lineHeight: 1.4,
                      resize: 'vertical',
                      cursor: user ? 'text' : 'not-allowed',
                      background: 'rgba(10, 15, 29, 0.7)',
                      borderColor: wosError ? '#ef4444' : (wosCompiled ? '#10b981' : 'var(--border-subtle)')
                    }}
                    placeholder={user ? t('builder.wos_sidebar_placeholder') : t('builder.ids_sidebar_locked')}
                    value={wosQuery}
                    disabled={!user}
                    onClick={() => {
                      if (!user) {
                        setLoginModalReason('filters')
                        setLoginModalOpen(true)
                      }
                    }}
                    onChange={(e) => {
                      setWosQuery(e.target.value)
                      if (wosCompiled) setWosCompiled(null)
                      if (wosError) setWosError(null)
                    }}
                  />

                  {/* CTE Optimization Toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: 'rgba(0, 200, 150, 0.05)', border: '1px solid rgba(0, 200, 150, 0.2)', borderRadius: '6px' }}>
                    <input
                      type="checkbox"
                      id="wos-cte-toggle"
                      checked={wosUseCte}
                      onChange={(e) => setWosUseCte(e.target.checked)}
                      style={{ cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
                    />
                    <label htmlFor="wos-cte-toggle" style={{ fontSize: '0.72rem', cursor: 'pointer', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '4px' }} title={t('builder.wos_cte_tooltip')}>
                      <span>⚡</span>
                      <strong>{t('builder.wos_cte_label')}</strong>
                    </label>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <button
                      type="button"
                      className="btn-outline"
                      style={{
                        padding: '8px',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        opacity: (!wosQuery.trim() || wosCompiling) ? 0.5 : 1,
                        cursor: (!wosQuery.trim() || wosCompiling) ? 'not-allowed' : 'pointer'
                      }}
                      onClick={() => handleCompileWos()}
                      disabled={!wosQuery.trim() || wosCompiling}
                    >
                      {wosCompiling ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                      {wosCompiling ? t('builder.wos_compiling') : t('builder.wos_compile_btn')}
                    </button>

                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{
                        padding: '8px',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        opacity: (!wosQuery.trim() || previewLoading) ? 0.5 : 1,
                        cursor: (!wosQuery.trim() || previewLoading) ? 'not-allowed' : 'pointer'
                      }}
                      onClick={() => {
                        if (!user) {
                          setLoginModalReason('general')
                          setLoginModalOpen(true)
                          return
                        }
                        setHasSearched(true)
                        fetchPreview(1)
                      }}
                      disabled={!wosQuery.trim() || previewLoading}
                    >
                      {previewLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                      {t('builder.wos_search_btn')}
                    </button>
                  </div>

                  {/* Error Box */}
                  {wosError && (
                    <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', fontSize: '0.75rem', color: '#f87171' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, marginBottom: '2px' }}>
                        <AlertCircle size={14} />
                        Error de Sintaxis WoS
                      </div>
                      <div style={{ wordBreak: 'break-word', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                        {wosError}
                      </div>
                    </div>
                  )}

                  {/* Metadata / Analysis Box */}
                  {wosCompiled && (
                    <div style={{ padding: '10px 12px', background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '6px', fontSize: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 600, color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={14} />
                          Compilación Exitosa
                        </span>
                        {wosCompiled.uses_cte && (
                          <span style={{ fontSize: '0.65rem', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                            CTE ON
                          </span>
                        )}
                      </div>

                      {/* Stats Badges */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                        <span style={{ padding: '2px 6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', fontSize: '0.7rem' }}>
                          Nodos: <strong>{wosCompiled.node_count}</strong>
                        </span>
                        <span style={{ padding: '2px 6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', fontSize: '0.7rem' }}>
                          Términos: <strong>{wosCompiled.term_count}</strong>
                        </span>
                        {wosCompiled.countries_detected?.length > 0 && (
                          <span style={{ padding: '2px 6px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', borderRadius: '4px', fontSize: '0.7rem' }}>
                            Países: <strong>{wosCompiled.countries_detected.join(', ')}</strong>
                          </span>
                        )}
                        {wosCompiled.near_count > 0 && (
                          <span style={{ padding: '2px 6px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', borderRadius: '4px', fontSize: '0.7rem' }}>
                            NEAR: <strong>{wosCompiled.near_count}</strong>
                          </span>
                        )}
                        {wosCompiled.wildcard_count > 0 && (
                          <span style={{ padding: '2px 6px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', borderRadius: '4px', fontSize: '0.7rem' }}>
                            Comodines: <strong>{wosCompiled.wildcard_count}</strong>
                          </span>
                        )}
                      </div>

                      {/* Warnings */}
                      {wosCompiled.warnings?.length > 0 && (
                        <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '4px', color: '#fbbf24', fontSize: '0.68rem' }}>
                          {wosCompiled.warnings.map((w, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                              <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
                              <span>{w}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Toggle Compiled SQL Preview */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setShowCompiledSql(prev => !prev)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--accent-primary)',
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                            padding: 0,
                            textDecoration: 'underline'
                          }}
                        >
                          {showCompiledSql ? t('builder.wos_hide_sql') : t('builder.wos_show_sql')}
                        </button>
                        {showCompiledSql && (
                          <button
                            type="button"
                            onClick={() => handleCopySql(wosCompiled.sql_full || wosCompiled.sql_where)}
                            style={{
                              background: 'rgba(255, 255, 255, 0.06)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '4px',
                              padding: '2px 6px',
                              fontSize: '0.68rem',
                              color: sqlCopied ? '#34d399' : 'var(--text-muted)',
                              cursor: 'pointer'
                            }}
                          >
                            {sqlCopied ? t('builder.wos_sql_copied') : t('builder.wos_copy_sql')}
                          </button>
                        )}
                      </div>

                      {showCompiledSql && (
                        <pre style={{
                          marginTop: '8px',
                          padding: '8px',
                          background: 'rgba(0, 0, 0, 0.5)',
                          borderRadius: '4px',
                          fontSize: '0.65rem',
                          fontFamily: 'var(--font-mono)',
                          color: '#e2e8f0',
                          maxHeight: '180px',
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}>
                          {wosCompiled.sql_full || wosCompiled.sql_where}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}

              {searchMode === 'ids' && (
                <div className="filter-group">
                  <label className="filter-label">{t('builder.ids_sidebar_label')}</label>
                  <textarea
                    className="input-text"
                    style={{ minHeight: '180px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', cursor: user ? 'text' : 'not-allowed' }}
                    placeholder={user ? t('builder.ids_sidebar_placeholder') : t('builder.ids_sidebar_locked')}
                    value={idsText}
                    disabled={!user}
                    onClick={() => {
                      if (!user) {
                        setLoginModalReason('filters')
                        setLoginModalOpen(true)
                      }
                    }}
                    onChange={(e) => setIdsText(e.target.value)}
                  />
                  <button
                    className="btn btn-primary"
                    style={{
                      width: '100%',
                      marginTop: '10px',
                      opacity: (!idsText.trim() || previewLoading) ? 0.5 : 1,
                      cursor: (!idsText.trim() || previewLoading) ? 'not-allowed' : 'pointer'
                    }}
                    onClick={handlePreviewIds}
                    disabled={previewLoading || !idsText.trim()}
                    title={!idsText.trim() ? t('builder.ids_sidebar_btn_tooltip_empty') : t('builder.ids_sidebar_btn_tooltip_ready')}
                  >
                    {previewLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={14} />}
                    {t('builder.ids_sidebar_btn')}
                  </button>
                </div>
              )}

              {searchMode === 'upload' && (
                <div className="filter-group">
                  <label className="filter-label">{t('builder.upload_sidebar_label')}</label>
                  <div
                    style={{
                      border: '2px dashed var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '24px 16px',
                      textAlign: 'center',
                      background: 'rgba(14, 21, 38, 0.5)',
                      cursor: user ? 'pointer' : 'not-allowed'
                    }}
                    onClick={() => {
                      if (!user) {
                        setLoginModalReason('upload')
                        setLoginModalOpen(true)
                        return
                      }
                      document.getElementById('file-upload-input').click()
                    }}
                  >
                    <UploadCloud size={32} color="var(--accent-primary)" style={{ margin: '0 auto 8px' }} />
                    <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t('builder.upload_sidebar_select')}</p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                      {t('builder.upload_sidebar_formats')}
                    </p>
                    <input
                      id="file-upload-input"
                      type="file"
                      accept=".json,.jsonl,.csv,.parquet"
                      style={{ display: 'none' }}
                      disabled={!user}
                      onChange={handleFileUpload}
                    />
                  </div>
                  {isUploading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--accent-primary)' }}>
                      <Loader2 size={14} className="animate-spin" />
                      {t('builder.upload_sidebar_processing')}
                    </div>
                  )}
                  {uploadResult && (
                    <div style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '6px', fontSize: '0.8rem', color: '#34d399' }}>
                      {t('builder.upload_sidebar_success', { filename: uploadResult.filename, count: uploadResult.total_works })}
                    </div>
                  )}
                </div>
              )}
            </aside>

            {/* Main Content Area */}
            <div className="content-area">
              {!user && (
                <div className="glass-panel" style={{
                  padding: '32px 28px',
                  textAlign: 'center',
                  background: 'linear-gradient(135deg, rgba(166, 206, 57, 0.12) 0%, var(--bg-card) 100%)',
                  border: '1.5px solid rgba(166, 206, 57, 0.35)',
                  borderRadius: '16px',
                  marginBottom: '20px'
                }}>
                  <div style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(166, 206, 57, 0.15)',
                    border: '2px solid #a6ce39',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#a6ce39',
                    fontWeight: '900',
                    fontSize: '22px',
                    margin: '0 auto 14px',
                    boxShadow: '0 0 20px rgba(166, 206, 57, 0.25)'
                  }}>
                    iD
                  </div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
                    {t('builder.auth_banner_title')}
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', maxWidth: '560px', margin: '0 auto 20px', lineHeight: 1.5 }}>
                    {t('builder.auth_banner_desc')}
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setLoginModalReason('general')
                      setLoginModalOpen(true)
                    }}
                    style={{
                      backgroundColor: '#a6ce39',
                      color: '#111827',
                      padding: '12px 26px',
                      fontSize: '0.92rem',
                      fontWeight: 800,
                      margin: '0 auto',
                      boxShadow: '0 4px 16px rgba(166, 206, 57, 0.35)'
                    }}
                  >
                    <span style={{ fontWeight: '900', fontSize: '15px' }}>iD</span>
                    {t('builder.auth_banner_btn')}
                  </button>
                </div>
              )}

                {/* Search Hero & Scopus API Switcher */}
                {searchMode === 'filters' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Scopus Engine Checkbox Toggle */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 14px',
                          borderRadius: '10px',
                          background: isScopusMode ? 'rgba(59, 130, 246, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                          border: isScopusMode ? '1.5px solid #3b82f6' : '1px solid var(--border-color)',
                          cursor: scopusAvailable ? 'pointer' : 'not-allowed',
                          opacity: scopusAvailable ? 1 : 0.6,
                          userSelect: 'none',
                          transition: 'all 0.2s ease'
                        }}
                        title={!scopusAvailable ? t('builder.scopus_tooltip_unavailable') : t('builder.scopus_tooltip_available')}
                      >
                        <input
                          type="checkbox"
                          checked={isScopusMode}
                          disabled={!scopusAvailable}
                          onChange={(e) => {
                            if (!user) {
                              setLoginModalReason('filters')
                              setLoginModalOpen(true)
                              return
                            }
                            setIsScopusMode(e.target.checked)
                          }}
                          style={{ cursor: scopusAvailable ? 'pointer' : 'not-allowed', accentColor: '#3b82f6' }}
                        />
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: isScopusMode ? '#93c5fd' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{t('builder.scopus_search_checkbox')}</span>
                          {!scopusAvailable && (
                            <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', fontWeight: 600 }}>
                              {t('builder.scopus_no_api_key')}
                            </span>
                          )}
                        </span>
                      </label>

                      {isScopusMode && (
                        <span style={{ fontSize: '0.75rem', color: '#60a5fa', background: 'rgba(59, 130, 246, 0.1)', padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                          {t('builder.scopus_badge_remote')}
                        </span>
                      )}
                    </div>

                    {isScopusMode ? (
                      <ScopusControls
                        scopusQuery={scopusQuery}
                        setScopusQuery={setScopusQuery}
                        startYear={startYear}
                        setStartYear={setStartYear}
                        endYear={endYear}
                        setEndYear={setEndYear}
                        allYears={allYears}
                        setAllYears={setAllYears}
                        onExecuteScopusSearch={handleExecuteScopusSearch}
                        isSearching={isScopusSearching}
                        coverageStats={scopusCoverageStats}
                        user={user}
                      />
                    ) : (
                      <div className="glass-panel search-hero">
                        <div className="search-input-wrapper">
                          <Search className="search-icon" size={20} />
                          <input
                            type="text"
                            className="search-input"
                            style={{ paddingRight: '120px', cursor: user ? 'text' : 'pointer' }}
                            placeholder={user ? t('builder.main_search_placeholder') : t('builder.main_search_locked')}
                            value={query}
                            disabled={!user}
                            onClick={() => {
                              if (!user) {
                                setLoginModalReason('general')
                                setLoginModalOpen(true)
                              }
                            }}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                          />
                          {query && (
                            <button
                              onClick={() => setQuery('')}
                              style={{ position: 'absolute', right: '115px', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                            >
                              <X size={18} />
                            </button>
                          )}
                          <button
                            className="btn btn-primary"
                            style={{
                              position: 'absolute',
                              right: '8px',
                              top: '8px',
                              bottom: '8px',
                              padding: '0 20px',
                              borderRadius: 'var(--radius-md)',
                              fontSize: '0.85rem',
                              opacity: (!hasAnyFilter || previewLoading) ? 0.5 : 1,
                              cursor: (!hasAnyFilter || previewLoading) ? 'not-allowed' : 'pointer'
                            }}
                            onClick={handleSearch}
                            disabled={previewLoading || !hasAnyFilter}
                            title={!hasAnyFilter ? t('builder.main_search_tooltip_inactive') : t('builder.main_search_tooltip_active')}
                          >
                            {previewLoading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                            {t('builder.main_search_btn')}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Active Chips Bar */}
                  {(selectedTopics.length > 0 || selectedSources.length > 0 || selectedInstitutions.length > 0 || selectedAuthors.length > 0 || selectedCountries.length > 0 || selectedTypes.length > 0 || oaStatus !== 'all') && (
                    <div className="chips-container">
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', alignSelf: 'center' }}>{t('builder.active_chips_title')}</span>
                      {selectedTopics.map(t_topic => (
                        <div key={t_topic.id} className="chip">
                          <Compass size={13} color="var(--accent-primary)" />
                          <span>{t('builder.chip_topic')} <strong>{t_topic.name}</strong></span>
                          <button className="chip-remove" onClick={() => setSelectedTopics(prev => prev.filter(x => x.id !== t_topic.id))}><X size={12} /></button>
                        </div>
                      ))}
                      {selectedSources.map(s => (
                        <div key={s.id} className="chip">
                          <BookOpen size={13} color="#fbbf24" />
                          <span>{t('builder.chip_source')} <strong>{s.name}</strong></span>
                          <button className="chip-remove" onClick={() => setSelectedSources(prev => prev.filter(x => x.id !== s.id))}><X size={12} /></button>
                        </div>
                      ))}
                      {selectedInstitutions.map(i => (
                        <div key={i.id} className="chip">
                          <Building2 size={13} color="#34d399" />
                          <span>{t('builder.chip_institution')} <strong>{i.name}</strong></span>
                          <button className="chip-remove" onClick={() => setSelectedInstitutions(prev => prev.filter(x => x.id !== i.id))}><X size={12} /></button>
                        </div>
                      ))}
                      {selectedAuthors.map(a => (
                        <div key={a.id} className="chip">
                          <Users size={13} color="#a78bfa" />
                          <span>{t('builder.chip_author')} <strong>{a.name}</strong></span>
                          <button className="chip-remove" onClick={() => setSelectedAuthors(prev => prev.filter(x => x.id !== a.id))}><X size={12} /></button>
                        </div>
                      ))}
                      {selectedCountries.map(c => (
                        <div key={c.code || c.id} className="chip">
                          <Globe2 size={13} color="#38bdf8" />
                          <span>{t('builder.chip_country')} <strong>{c.flag || ''} {c.country_name || c.name}</strong></span>
                          <button className="chip-remove" onClick={() => setSelectedCountries(prev => prev.filter(x => (x.code || x.id) !== (c.code || c.id)))}><X size={12} /></button>
                        </div>
                      ))}
                      {selectedCountries.length > 1 && (
                        <span style={{ fontSize: '0.7rem', background: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, alignSelf: 'center' }}>
                          {t('builder.chip_logic')} {countryLogic}
                        </span>
                      )}
                      {selectedTypes.map(t_item => (
                        <div key={t_item.id || t_item.type_id} className="chip">
                          <FileText size={13} color="#fb7185" />
                          <span>{t('builder.chip_type')} <strong>{t_item.flag || '📄'} {t_item.type_name || t_item.name}</strong></span>
                          <button className="chip-remove" onClick={() => setSelectedTypes(prev => prev.filter(x => (x.id || x.type_id) !== (t_item.id || t_item.type_id)))}><X size={12} /></button>
                        </div>
                      ))}
                      {oaStatus !== 'all' && (
                        <div className="chip">
                          <Unlock size={13} color="#34d399" />
                          <span>{t('builder.chip_oa')} <strong>{oaStatus}</strong></span>
                          <button className="chip-remove" onClick={() => setOaStatus('all')}><X size={12} /></button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Action Banner / Launcher */}
              <div className="action-banner">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <span style={{
                      background: 'rgba(56, 189, 248, 0.2)',
                      color: 'var(--accent-primary)',
                      padding: '3px 10px',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: 800
                    }}>
                      {t('builder.corpus_assembled_badge')}
                    </span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                      {previewLoading ? (
                        <Loader2 size={16} className="animate-spin" style={{ display: 'inline' }} />
                      ) : (
                        previewData.total.toLocaleString()
                      )} {t('builder.articles_identified')}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {t('builder.corpus_processing_notice', { count: previewData.total.toLocaleString() })}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="input-text"
                      style={{ width: '235px', background: 'var(--bg-input)', paddingRight: '28px' }}
                      placeholder={t('builder.package_name_placeholder')}
                      disabled={!user}
                      value={packageName}
                      onChange={(e) => setPackageName(e.target.value)}
                      title="Nombre asignado al paquete de indicadores del corpus"
                    />
                    {user && (
                      <button
                        type="button"
                        onClick={() => setPackageName(generateSuggestedCorpusName(user))}
                        style={{
                          position: 'absolute',
                          right: '6px',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '3px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '4px'
                        }}
                        title="Generar nuevo nombre con código aleatorio"
                      >
                        <RefreshCw size={13} />
                      </button>
                    )}
                  </div>

                  {/* Botones de Citantes y Base Intelectual en el Corpus Builder */}
                  <button
                    type="button"
                    className="btn"
                    style={{
                      padding: '12px 16px',
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      color: 'var(--accent-primary)',
                      cursor: (previewData.total === 0 || previewLoading || !hasAnyFilter) ? 'not-allowed' : 'pointer',
                      opacity: (previewData.total === 0 || previewLoading || !hasAnyFilter) ? 0.5 : 1,
                      transition: 'all 0.15s ease'
                    }}
                    disabled={previewData.total === 0 || previewLoading || !hasAnyFilter}
                    title={t('builder.btn_citing_works_tooltip', 'Consultar y derivar artículos citantes de este corpus sin requerir cálculo previo')}
                    onClick={() => handleOpenBuilderCitations('citing')}
                  >
                    <Sparkles size={15} />
                    <span>{t('builder.btn_citing_works', 'Citantes')}</span>
                  </button>

                  <button
                    type="button"
                    className="btn"
                    style={{
                      padding: '12px 16px',
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'rgba(129, 140, 248, 0.12)',
                      border: '1px solid rgba(129, 140, 248, 0.35)',
                      color: '#a78bfa',
                      cursor: (previewData.total === 0 || previewLoading || !hasAnyFilter) ? 'not-allowed' : 'pointer',
                      opacity: (previewData.total === 0 || previewLoading || !hasAnyFilter) ? 0.5 : 1,
                      transition: 'all 0.15s ease'
                    }}
                    disabled={previewData.total === 0 || previewLoading || !hasAnyFilter}
                    title={t('builder.btn_intellectual_base_tooltip', 'Consultar y derivar referencias bibliográficas citadas por este corpus sin requerir cálculo previo')}
                    onClick={() => handleOpenBuilderCitations('references')}
                  >
                    <BookOpen size={15} />
                    <span>{t('builder.btn_intellectual_base', 'Base Intelectual')}</span>
                  </button>

                  <button
                    className="btn btn-primary"
                    style={{
                      padding: '12px 24px',
                      fontSize: '0.95rem',
                      opacity: (previewData.total === 0 || previewLoading || !hasAnyFilter) ? 0.5 : 1,
                      cursor: (previewData.total === 0 || previewLoading || !hasAnyFilter) ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                    disabled={previewData.total === 0 || previewLoading || !hasAnyFilter}
                    title={!hasAnyFilter ? "Define al menos un filtro o palabra clave para calcular métricas" : "Configurar ventanas de tiempo y matrices de desempeño"}
                    onClick={() => {
                      if (!user) {
                        setLoginModalReason('job_creation')
                        setLoginModalOpen(true)
                        return
                      }
                      setActiveTab('metrics')
                    }}
                  >
                    <SlidersHorizontal size={18} />
                    <span>{t('builder.cta.configure_btn')} →</span>
                  </button>
                </div>
              </div>

              {/* OpenAlex Universe & Corpus Info Panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Global OpenAlex Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                      <Database size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)' }}>{t('builder.stats_works_count')}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('builder.stats_works_label')}</div>
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(167, 139, 250, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa' }}>
                      <Users size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)' }}>{t('builder.stats_researchers_count')}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('builder.stats_researchers_label')}</div>
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(52, 211, 153, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399' }}>
                      <Building2 size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)' }}>{t('builder.stats_institutions_count')}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('builder.stats_institutions_label')}</div>
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(251, 191, 36, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24' }}>
                      <Library size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)' }}>{t('builder.stats_sources_count')}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('builder.stats_sources_label')}</div>
                    </div>
                  </div>
                </div>

                {/* Corpus Coverage Card */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                  {previewLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                      <Loader2 size={36} className="animate-spin" style={{ margin: '0 auto 14px', color: 'var(--accent-primary)' }} />
                      <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>{t('builder.hero_loading_title')}</h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {t('builder.hero_loading_desc')}
                      </p>
                    </div>
                  ) : !hasSearched ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(56, 189, 248, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)', margin: '0 auto 16px' }}>
                        <Search size={28} />
                      </div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
                        {t('builder.hero_empty_title')}
                      </h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '520px', margin: '0 auto 20px', lineHeight: 1.5 }}>
                        {t('builder.hero_empty_desc')}
                      </p>
                      <button
                        className="btn btn-primary"
                        style={{
                          padding: '10px 28px',
                          fontSize: '0.9rem',
                          opacity: (!hasAnyFilter || previewLoading) ? 0.5 : 1,
                          cursor: (!hasAnyFilter || previewLoading) ? 'not-allowed' : 'pointer'
                        }}
                        onClick={handleSearch}
                        disabled={previewLoading || !hasAnyFilter}
                        title={!hasAnyFilter ? t('builder.hero_empty_btn_tooltip_inactive') : t('builder.hero_empty_btn_tooltip_active')}
                      >
                        <Search size={16} /> {t('builder.hero_empty_btn')}
                      </button>
                    </div>
                  ) : previewData.total === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <AlertCircle size={36} color="#f59e0b" style={{ margin: '0 auto 12px' }} />
                      <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>{t('builder.hero_no_results_title')}</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '460px', margin: '4px auto 0' }}>
                        {t('builder.hero_no_results_desc')}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <CheckCircle2 size={24} color="#10b981" />
                          <div>
                            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                              {t('builder.hero_success_title')}
                            </h4>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {t('builder.hero_success_subtitle')}
                            </span>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                            {previewData.total.toLocaleString()}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t('builder.hero_total_found_label')}
                          </div>
                        </div>
                      </div>

                      {/* Criteria summary */}
                      <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{t('builder.hero_time_range_label')}</span>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', marginTop: '2px' }}>
                            {allYears ? `1900 — 2026 (${t('common.all')})` : `${startYear} — ${endYear}`}
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{t('builder.hero_open_access_label')}</span>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', marginTop: '2px' }}>
                            {oaStatus === 'all' ? t('builder.hero_all_states') : oaStatus.toUpperCase()}
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{t('builder.hero_countries_label')}</span>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', marginTop: '2px' }}>
                            {selectedCountries.length === 0
                              ? t('builder.hero_global_no_filter')
                              : `${selectedCountries.map(c => `${c.flag || ''} ${c.code || c.name}`).join(', ')} (${countryLogic})`}
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{t('builder.hero_doc_type_label')}</span>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', marginTop: '2px' }}>
                            {selectedTypes.length === 0
                              ? t('builder.hero_all_types')
                              : selectedTypes.map(t => `${t.flag || ''} ${t.type_name || t.name}`).join(', ')}
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{t('builder.hero_scope_label')}</span>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#34d399', marginTop: '2px' }}>
                            {t('builder.hero_full_corpus_scope', { count: previewData.total.toLocaleString() })}
                          </div>
                        </div>
                      </div>

                      {/* Massive Corpus (> 1M) Alert Banner */}
                      {previewData.total > 1000000 && (
                        <div style={{
                          background: 'rgba(245, 158, 11, 0.1)',
                          border: '1.5px solid rgba(245, 158, 11, 0.45)',
                          borderRadius: '12px',
                          padding: '14px 18px',
                          marginTop: '16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '14px'
                        }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            background: 'rgba(245, 158, 11, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#f59e0b',
                            flexShrink: 0
                          }}>
                            <AlertTriangle size={22} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#fbbf24', margin: '0 0 2px' }}>
                              {t('builder.hero_massive_warning_title', { count: previewData.total.toLocaleString() })}
                            </h4>
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: 0, lineHeight: 1.45 }}>
                              {t('builder.hero_massive_warning_desc')}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Papers Preview Table & Export Section */}
                {hasSearched && previewData.total > 0 && (
                  <div className="glass-panel" style={{ padding: '24px', marginTop: '20px' }}>
                    {/* Header with Title and Download Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                          <FileText size={20} />
                        </div>
                        <div>
                          <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                            {t('builder.preview_table_title')}
                          </h4>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                            {t('builder.preview_table_showing', {
                              start: ((currentPage - 1) * pageSize) + 1,
                              end: Math.min(currentPage * pageSize, previewData.total),
                              total: previewData.total.toLocaleString()
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Download Buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => handleDownloadCorpus('csv')}
                          disabled={isExportingCorpus !== null}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            background: 'rgba(56, 189, 248, 0.12)',
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                            color: 'var(--accent-primary)',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: isExportingCorpus !== null ? 'not-allowed' : 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          title="Descargar dataset en formato CSV con todas las variables normalizadas"
                        >
                          {isExportingCorpus === 'csv' ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <FileSpreadsheet size={14} />
                          )}
                          <span>Descargar CSV</span>
                        </button>

                        <button
                          onClick={() => handleDownloadCorpus('json')}
                          disabled={isExportingCorpus !== null}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            background: 'rgba(167, 139, 250, 0.12)',
                            border: '1px solid rgba(167, 139, 250, 0.35)',
                            color: '#c084fc',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: isExportingCorpus !== null ? 'not-allowed' : 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          title="Descargar dataset completo estructurado en formato JSON"
                        >
                          {isExportingCorpus === 'json' ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <FileJson size={14} />
                          )}
                          <span>Descargar JSON</span>
                        </button>
                      </div>
                    </div>

                    {/* Table of Works */}
                    <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-subtle)', background: 'rgba(0, 0, 0, 0.2)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                        <thead style={{ background: 'var(--bg-input)', borderBottom: '1px solid var(--border-subtle)' }}>
                          <tr>
                            <th style={{ padding: '12px 14px', color: 'var(--text-main)', fontWeight: 700, minWidth: '280px' }}>
                              Artículo / Obra Científica
                            </th>
                            <th style={{ padding: '12px 10px', color: 'var(--text-main)', fontWeight: 700, width: '65px', textAlign: 'center' }}>
                              Año
                            </th>
                            <th style={{ padding: '12px 12px', color: 'var(--text-main)', fontWeight: 700, minWidth: '220px' }}>
                              Autores / Afiliación
                            </th>
                            <th style={{ padding: '12px 12px', color: 'var(--text-main)', fontWeight: 700, minWidth: '180px' }}>
                              Disciplina / Tópico
                            </th>
                            <th style={{ padding: '12px 10px', color: 'var(--text-main)', fontWeight: 700, textAlign: 'right', width: '90px' }}>
                              Referencias
                            </th>
                            <th style={{ padding: '12px 10px', color: 'var(--text-main)', fontWeight: 700, textAlign: 'right', width: '85px' }}>
                              Citas
                            </th>
                            <th style={{ padding: '12px 10px', color: 'var(--text-main)', fontWeight: 700, textAlign: 'center', width: '95px' }}>
                              Acceso
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.results.map((r, idx) => (
                            <tr
                              key={r.id || idx}
                              style={{
                                borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                                background: idx % 2 === 0 ? 'rgba(255, 255, 255, 0.015)' : 'transparent'
                              }}
                            >
                              <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                                <div style={{ fontWeight: 600, color: '#fff', marginBottom: '4px', lineHeight: 1.35 }}>
                                  {r.title}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: 'var(--text-dim)', flexWrap: 'wrap' }}>
                                  {r.doi ? (
                                    <a
                                      href={r.doi.startsWith('http') ? r.doi : `https://doi.org/${r.doi}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}
                                    >
                                      <span>DOI: {r.doi.replace('https://doi.org/', '')}</span>
                                      <ExternalLink size={10} />
                                    </a>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>ID: {r.id}</span>
                                  )}
                                  {r.source_name && (
                                    <span style={{ color: 'var(--text-dim)', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: '4px' }}>
                                      📚 {r.source_name}
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td style={{ padding: '12px 10px', verticalAlign: 'top', textAlign: 'center', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                                {r.publication_year || '-'}
                              </td>

                              <td style={{ padding: '12px 12px', verticalAlign: 'top', color: 'var(--text-dim)' }}>
                                <div style={{ color: 'var(--text-main)', fontSize: '0.78rem', marginBottom: '2px' }}>
                                  {r.authors && r.authors.length > 0 ? (
                                    <>
                                      {r.authors.slice(0, 3).join(', ')}
                                      {r.authors.length > 3 && ` +${r.authors.length - 3}`}
                                    </>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>Sin autores listados</span>
                                  )}
                                </div>
                                {r.institutions && r.institutions.length > 0 && (
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                    🏢 {r.institutions[0]}
                                  </div>
                                )}
                              </td>

                              <td style={{ padding: '12px 12px', verticalAlign: 'top', color: 'var(--text-dim)' }}>
                                <div style={{ color: 'var(--text-main)', fontSize: '0.76rem', fontWeight: 600 }}>
                                  {r.field || r.domain || '-'}
                                </div>
                                {r.topic && (
                                  <div style={{ fontSize: '0.7rem', color: '#38bdf8', marginTop: '1px' }}>
                                    {r.topic}
                                  </div>
                                )}
                              </td>

                              <td style={{ padding: '12px 10px', verticalAlign: 'top', textAlign: 'right', fontWeight: 700, color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>
                                {r.referenced_works_count > 0 ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleOpenWorkCitationModal(r.id, r.title, r.cited_by_count, r.referenced_works_count, 'references')
                                    }}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      padding: '3px 8px',
                                      borderRadius: '12px',
                                      background: 'rgba(167, 139, 250, 0.12)',
                                      border: '1px solid rgba(167, 139, 250, 0.4)',
                                      color: '#a78bfa',
                                      fontWeight: 800,
                                      fontSize: '0.78rem',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease'
                                    }}
                                    title={`Explorar las ${r.referenced_works_count.toLocaleString()} referencias bibliográficas (Base Intelectual)`}
                                  >
                                    <span>{r.referenced_works_count.toLocaleString()}</span>
                                    <BookOpen size={10} />
                                  </button>
                                ) : (
                                  <span style={{ color: 'var(--text-dim)', paddingRight: '6px' }}>0</span>
                                )}
                              </td>

                              <td style={{ padding: '12px 10px', verticalAlign: 'top', textAlign: 'right', fontWeight: 700, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                                {r.cited_by_count > 0 ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleOpenWorkCitationModal(r.id, r.title, r.cited_by_count, r.referenced_works_count, 'citing')
                                    }}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      padding: '3px 8px',
                                      borderRadius: '12px',
                                      background: 'rgba(251, 191, 36, 0.12)',
                                      border: '1px solid rgba(251, 191, 36, 0.4)',
                                      color: '#fbbf24',
                                      fontWeight: 800,
                                      fontSize: '0.78rem',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease'
                                    }}
                                    title={`Explorar artículos citantes de este paper (${r.cited_by_count.toLocaleString()} citas)`}
                                  >
                                    <span>{r.cited_by_count.toLocaleString()}</span>
                                    <Sparkles size={10} />
                                  </button>
                                ) : (
                                  <span style={{ color: 'var(--text-dim)', paddingRight: '6px' }}>0</span>
                                )}
                              </td>

                              <td style={{ padding: '12px 10px', verticalAlign: 'top', textAlign: 'center' }}>
                                {renderOaBadge(r.oa_status)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination for Preview Table */}
                    {previewData.total_pages > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', fontSize: '0.8rem', color: 'var(--text-dim)', flexWrap: 'wrap', gap: '8px' }}>
                        <span>
                          {t('modals.citing.pagination_page', { page: currentPage, totalPages: previewData.total_pages, count: previewData.total.toLocaleString() })}
                        </span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            disabled={previewLoading || currentPage <= 1}
                            onClick={() => fetchPreview(currentPage - 1)}
                            style={{
                              padding: '5px 12px',
                              borderRadius: '6px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid var(--border-color)',
                              color: currentPage <= 1 ? 'var(--text-muted)' : 'var(--text-main)',
                              cursor: currentPage <= 1 ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {t('modals.citing.btn_prev')}
                          </button>
                          <button
                            disabled={previewLoading || currentPage >= previewData.total_pages}
                            onClick={() => fetchPreview(currentPage + 1)}
                            style={{
                              padding: '5px 12px',
                              borderRadius: '6px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid var(--border-color)',
                              color: currentPage >= previewData.total_pages ? 'var(--text-muted)' : 'var(--text-main)',
                              cursor: currentPage >= previewData.total_pages ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {t('modals.citing.btn_next')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Downloads Hub Tab */
          <div style={{ marginTop: '24px', marginBottom: '48px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {user && user.is_admin ? (
                    <ShieldCheck size={24} color="#38bdf8" />
                  ) : (
                    <FolderArchive size={24} color="var(--accent-primary)" />
                  )}
                  {user ? (
                    user.is_admin ? (
                      t('downloads.header_admin_title')
                    ) : (
                      t('downloads.header_user_title', { name: user.name })
                    )
                  ) : (
                    t('downloads.header_guest_title')
                  )}
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                  {user ? (
                    user.is_admin ? (
                      t('downloads.header_admin_desc', { count: packages.length })
                    ) : (
                      t('downloads.header_user_desc', { orcid: user.orcid })
                    )
                  ) : (
                    t('downloads.header_guest_desc')
                  )}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {!user && (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setLoginModalReason('downloads')
                      setLoginModalOpen(true)
                    }}
                    style={{ backgroundColor: '#a6ce39', color: '#111827' }}
                  >
                    <span style={{ fontWeight: '900' }}>iD</span>
                    {t('auth.connect_orcid')}
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => fetchPackages()}>
                  <RefreshCw size={16} />
                  {t('downloads.refresh_list')}
                </button>
              </div>
            </div>

            {!user && (
              <div style={{
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: '12px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <KeyRound size={24} color="#38bdf8" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>{t('downloads.custom_center_title')}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{t('downloads.custom_center_desc')}</div>
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setLoginModalReason('downloads')
                    setLoginModalOpen(true)
                  }}
                  style={{ backgroundColor: '#a6ce39', color: '#111827', whiteSpace: 'nowrap' }}
                >
                  {t('downloads.identify_btn')}
                </button>
              </div>
            )}

            {(() => {
              const displayPackages = packages
              if (loadingPackages) {
                return (
                  <div style={{ textAlign: 'center', padding: '60px' }}>
                    <Loader2 size={36} className="animate-spin" style={{ margin: '0 auto 16px', color: 'var(--accent-primary)' }} />
                    <p style={{ color: 'var(--text-muted)' }}>{t('downloads.loading_packages')}</p>
                  </div>
                )
              }
              if (displayPackages.length === 0) {
                return (
                  <div className="glass-panel" style={{ padding: '60px', textAlign: 'center' }}>
                    <FolderArchive size={48} color="var(--text-dim)" style={{ margin: '0 auto 16px' }} />
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {user ? t('downloads.empty_title_user') : t('downloads.empty_title_guest')}
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '6px', maxWidth: '480px', margin: '6px auto 16px' }}>
                      {user ? t('downloads.empty_desc_user') : t('downloads.empty_desc_guest')}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                      <button className="btn btn-secondary" onClick={() => setActiveTab('tables')}>
                        <FileSpreadsheet size={16} />
                        {t('downloads.go_to_tables')}
                      </button>
                      <button className="btn btn-primary" onClick={() => setActiveTab('builder')}>
                        {t('downloads.go_to_builder')}
                      </button>
                    </div>
                  </div>
                )
              }
              return (
                <div className="packages-grid">
                  {displayPackages.map((pkg) => (
                    <div key={pkg.package_name} className="glass-panel package-card">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FolderArchive size={22} color="var(--accent-primary)" />
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', wordBreak: 'break-all' }}>
                              {pkg.package_name}
                            </h3>
                          </div>
                          {pkg.has_zip ? (
                            <span className="badge badge-green">{t('downloads.ready_badge')}</span>
                          ) : (
                            <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>Pendiente .ZIP</span>
                          )}
                        </div>

                      <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                        {pkg.owner_name || pkg.owner_orcid ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.03)', padding: '3px 6px', borderRadius: '4px' }}>
                            <span>{t('downloads.researcher')}</span>
                            <strong style={{ color: pkg.is_owner ? '#a6ce39' : '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <User size={12} />
                              {pkg.owner_name || pkg.owner_orcid} {pkg.is_owner ? t('downloads.you') : ''}
                            </strong>
                          </div>
                        ) : null}

                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{t('downloads.used_documents')}</span>
                          <strong style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                            {pkg.total_works ? `${pkg.total_works.toLocaleString()} arts` : t('downloads.full')}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{pkg.csv_files_count ? t('downloads.csv_files', 'Archivos CSV:') : t('downloads.excel_files')}</span>
                          <strong style={{ color: 'var(--text-muted)' }}>
                            {pkg.csv_files_count 
                              ? `${pkg.csv_files_count} ${t('downloads.csv_files_count', 'archivos (.csv)')}`
                              : (pkg.excel_files_count ? `${pkg.excel_files_count} libros (.xlsx)` : t('downloads.excel_books_count'))
                            }
                          </strong>
                        </div>

                        {/* Checkbox interactivo para dataset JSON completo */}
                        <div style={{
                          marginTop: '6px',
                          marginBottom: '4px',
                          padding: '8px 10px',
                          background: 'rgba(255, 255, 255, 0.03)',
                          borderRadius: '6px',
                          border: '1px solid rgba(255, 255, 255, 0.07)'
                        }}>
                          <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            cursor: (pkg.has_json || pkg.json_generating) ? 'default' : 'pointer',
                            fontSize: '0.78rem',
                            userSelect: 'none'
                          }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontWeight: 600 }}>
                              <input
                                type="checkbox"
                                id={`json-checkbox-${pkg.package_name}`}
                                checked={pkg.has_json || pkg.json_generating}
                                disabled={pkg.has_json || pkg.json_generating}
                                onChange={(e) => {
                                  if (e.target.checked && !pkg.has_json && !pkg.json_generating) {
                                    handleTriggerGenerateJson(pkg.package_name)
                                  }
                                }}
                                style={{
                                  cursor: (pkg.has_json || pkg.json_generating) ? 'default' : 'pointer',
                                  accentColor: 'var(--accent-primary)',
                                  width: '15px',
                                  height: '15px'
                                }}
                              />
                              {t('downloads.include_json_checkbox')}
                            </span>
                            {pkg.has_json ? (
                              <span className="badge badge-green" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>✓ {t('downloads.json_included')}</span>
                            ) : pkg.json_generating ? (
                              <span className="badge badge-amber" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>⏳ {t('downloads.json_generating_badge')}</span>
                            ) : (
                              <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>{t('downloads.json_not_included')}</span>
                            )}
                          </label>

                          {pkg.json_generating && (
                            <div style={{
                              marginTop: '8px',
                              padding: '6px 8px',
                              borderRadius: '4px',
                              background: 'rgba(245, 158, 11, 0.12)',
                              border: '1px solid rgba(245, 158, 11, 0.35)',
                              color: '#fbbf24',
                              fontSize: '0.74rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              lineHeight: '1.3'
                            }}>
                              <Loader2 size={14} className="animate-spin" style={{ flexShrink: 0 }} />
                              <span>{t('downloads.json_generating_alert')}</span>
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{t('downloads.package_size')}</span>
                          <strong style={{ color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)' }}>
                            {pkg.has_zip ? `${pkg.zip_size_mb} MB` : 'N/A'}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{t('downloads.generation_date')}</span>
                          <span style={{ color: 'var(--text-dim)' }}>
                            {new Date(pkg.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', flexWrap: 'wrap' }}>
                      {pkg.has_zip ? (
                        <a
                          href={resolveDownloadUrl(pkg.download_url)}
                          className="btn btn-success"
                          style={{ flex: 1, textDecoration: 'none', minWidth: '120px' }}
                          download
                        >
                          <Download size={16} />
                          {t('downloads.download_zip')}
                        </a>
                      ) : (
                        <button
                          className="btn btn-primary"
                          style={{ flex: 1, minWidth: '120px' }}
                          disabled={generatingZipPackages[pkg.package_name]}
                          onClick={() => handleGenerateZipForPackage(pkg.package_name)}
                        >
                          {generatingZipPackages[pkg.package_name] ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              {t('downloads.card.generating')}
                            </>
                          ) : (
                            <>
                              <FolderArchive size={16} />
                              {t('downloads.card.generate_btn')}
                            </>
                          )}
                        </button>
                      )}
                      <button
                        className="btn btn-secondary"
                        title={t('downloads.explore_tables_tooltip')}
                        style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.35)', background: 'rgba(56, 189, 248, 0.08)' }}
                        onClick={() => {
                          setSelectedPackageForTablePreview(pkg.package_name)
                          setActiveTab('tables')
                        }}
                      >
                        <FileSpreadsheet size={16} />
                        <span>{t('downloads.explore_tables')}</span>
                      </button>
                      <button
                        className="btn btn-secondary"
                        title={t('downloads.view_details_tooltip')}
                        onClick={() => setSelectedPackageDetails(pkg)}
                      >
                        <ExternalLink size={16} />
                      </button>
                      <button
                        className="btn btn-secondary"
                        title={t('downloads.delete_tooltip')}
                        style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.35)', background: 'rgba(239, 68, 68, 0.08)' }}
                        onClick={() => handleDeletePackage(pkg.package_name)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )})()}
          </div>
        )}
      </main>

      {/* Autocomplete Entity Modal */}
      {modalEntity && (
        <div className="modal-backdrop" onClick={() => setModalEntity(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {modalEntity === 'domain' && <Compass size={22} color="#38bdf8" />}
                {modalEntity === 'field' && <Compass size={22} color="#818cf8" />}
                {modalEntity === 'subfield' && <Compass size={22} color="#c084fc" />}
                {modalEntity === 'topic' && <Compass size={22} color="var(--accent-primary)" />}
                {modalEntity === 'source' && <BookOpen size={22} color="#fbbf24" />}
                {modalEntity === 'institution' && <Building2 size={22} color="#34d399" />}
                {modalEntity === 'author' && <Users size={22} color="#a78bfa" />}
                {modalEntity === 'country' && <Globe2 size={22} color="#38bdf8" />}
                {modalEntity === 'work_type' && <FileText size={22} color="#fb7185" />}
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                  {modalEntity === 'domain'
                    ? t('builder.entity_modal.title_domain')
                    : modalEntity === 'field'
                    ? t('builder.entity_modal.title_field')
                    : modalEntity === 'subfield'
                    ? t('builder.entity_modal.title_subfield')
                    : modalEntity === 'topic'
                    ? t('builder.entity_modal.title_topic')
                    : modalEntity === 'source'
                    ? t('builder.entity_modal.title_source')
                    : modalEntity === 'institution'
                    ? t('builder.entity_modal.title_institution')
                    : modalEntity === 'author'
                    ? t('builder.entity_modal.title_author')
                    : modalEntity === 'country'
                    ? t('builder.entity_modal.title_country')
                    : t('builder.entity_modal.title_work_type')}
                </h3>
              </div>
              <button
                onClick={() => setModalEntity(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="search-input-wrapper">
              <Search className="search-icon" size={18} />
              <input
                type="text"
                autoFocus
                className="search-input"
                placeholder={
                  modalEntity === 'country'
                    ? t('builder.entity_modal.placeholder_country')
                    : modalEntity === 'work_type'
                    ? t('builder.entity_modal.placeholder_work_type')
                    : t('builder.entity_modal.placeholder_default')
                }
                value={entitySearchQuery}
                onChange={(e) => setEntitySearchQuery(e.target.value)}
              />
            </div>

            <div style={{ maxHeight: '340px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {isSearchingEntity ? (
                <div style={{ textAlign: 'center', padding: '30px' }}>
                  <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px', color: 'var(--accent-primary)' }} />
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('builder.entity_modal.searching')}</p>
                </div>
              ) : entityResults.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                  {entitySearchQuery ? t('builder.entity_modal.no_results') : t('builder.entity_modal.type_to_search')}
                </p>
              ) : (
                entityResults.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectEntity(item)}
                    style={{
                      padding: '10px 14px',
                      background: 'var(--bg-input)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-main)' }}>{item.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        {item.type === 'countries'
                          ? `${t('builder.entity_modal.iso_code')} ${item.code || item.id}`
                          : `ID: ${item.id} ${item.extra?.field ? `• ${item.extra.field}` : ''} ${item.extra?.country_code ? `• ${item.extra.country_code}` : ''}`}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {item.works_count ? t('builder.entity_modal.arts_count', { count: item.works_count.toLocaleString() }) : ''}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Progress & Live Job Modal */}
      {jobModalOpen && activeJob && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: activeJob.status === 'completed'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : activeJob.status === 'failed'
                  ? 'rgba(244, 63, 94, 0.15)'
                  : 'rgba(56, 189, 248, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                border: activeJob.status === 'completed'
                  ? '1px solid rgba(16, 185, 129, 0.4)'
                  : '1px solid rgba(56, 189, 248, 0.4)'
              }}>
                {activeJob.status === 'completed' ? (
                  <CheckCircle2 size={30} color="#34d399" />
                ) : activeJob.status === 'failed' ? (
                  <AlertCircle size={30} color="#f43f5e" />
                ) : (
                  <Loader2 size={30} color="var(--accent-primary)" className="animate-spin" />
                )}
              </div>

              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {activeJob.status === 'completed'
                  ? t('jobs.completed_title')
                  : activeJob.status === 'failed'
                  ? t('jobs.failed_title')
                  : t('jobs.running_title')}
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {t('jobs.package_label')} <strong>{activeJob.package_name}</strong>
              </p>
            </div>

            {/* Progress Bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-dim)' }}>{activeJob.stage_label}</span>
                <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>
                  {activeJob.progress}%
                </span>
              </div>
              <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: `${activeJob.progress}%` }} />
              </div>
            </div>

            {/* 16 Dimensions Checklist Summary */}
            <div style={{
              background: 'var(--bg-input)',
              borderRadius: '8px',
              padding: '12px 16px',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.78rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-dim)' }}>
                <span>{t('jobs.dimensions_label')}</span>
                <span>{t('jobs.dimensions_desc')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-dim)' }}>
                <span>{t('jobs.excel_label')}</span>
                <span>{t('jobs.excel_desc')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-dim)' }}>
                <span>{t('jobs.dataset_label')}</span>
                <span>{t('jobs.dataset_desc')}</span>
              </div>
            </div>

            {/* Action Buttons */}
            {activeJob.status === 'completed' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  className="btn btn-primary"
                  style={{
                    padding: '13px 18px',
                    fontSize: '0.95rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(56, 189, 248, 0.3)'
                  }}
                  onClick={() => {
                    setJobModalOpen(false)
                    setSelectedPackageForTablePreview(activeJob.package_name)
                    setActiveTab('tables')
                  }}
                >
                  <FileSpreadsheet size={18} />
                  <span>{t('jobs.explore_btn')}</span>
                </button>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '10px 14px', fontSize: '0.85rem' }}
                    onClick={() => {
                      setJobModalOpen(false)
                      setActiveTab('builder')
                    }}
                  >
                    <SlidersHorizontal size={15} />
                    <span>{t('jobs.refine_btn')}</span>
                  </button>

                  <button
                    className="btn btn-outline"
                    style={{ flex: 1, padding: '10px 14px', fontSize: '0.85rem' }}
                    onClick={() => {
                      setJobModalOpen(false)
                      setActiveTab('downloads')
                    }}
                  >
                    <FolderArchive size={15} />
                    <span>{t('jobs.downloads_btn')}</span>
                  </button>
                </div>
              </div>
            ) : activeJob.status === 'failed' ? (
              <button className="btn btn-secondary" onClick={() => setJobModalOpen(false)}>
                {t('common.close')}
              </button>
            ) : (
              <button
                className="btn btn-outline"
                style={{ fontSize: '0.8rem' }}
                onClick={() => setJobModalOpen(false)}
              >
                {t('jobs.minimize_btn')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Massive Corpus (> 1M) Confirmation Modal */}
      {massiveCorpusModalOpen && (
        <div className="modal-backdrop" onClick={() => setMassiveCorpusModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px', textAlign: 'center', padding: '32px 28px' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1.5px solid rgba(245, 158, 11, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#f59e0b'
            }}>
              <AlertTriangle size={32} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
              {t('modals.massive_corpus.title')}
            </h3>

            <div style={{
              fontSize: '1.35rem',
              fontWeight: 800,
              color: '#fbbf24',
              fontFamily: 'var(--font-mono)',
              marginBottom: '12px'
            }}>
              {previewData.total.toLocaleString()} {t('modals.massive_corpus.identified')}
            </div>

            <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: '1.55', marginBottom: '22px', whiteSpace: 'pre-line' }}>
              {t('modals.massive_corpus.desc')}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="btn btn-primary"
                style={{
                  padding: '13px 18px',
                  fontSize: '0.92rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  border: 'none',
                  color: '#0f172a',
                  boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)'
                }}
                onClick={() => {
                  setMassiveCorpusModalOpen(false)
                  handleLaunchCalculation(false, true)
                }}
              >
                <Sparkles size={18} />
                <span>{t('modals.massive_corpus.proceed')}</span>
              </button>

              <button
                className="btn btn-secondary"
                style={{ padding: '10px 14px', fontSize: '0.86rem' }}
                onClick={() => setMassiveCorpusModalOpen(false)}
              >
                <SlidersHorizontal size={14} />
                <span>{t('modals.massive_corpus.refine')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Corpus Notice & Shortcut Modal */}
      {duplicateModalOpen && (
        <div className="modal-backdrop" onClick={() => setDuplicateModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px', textAlign: 'center', padding: '32px 28px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: 'var(--accent-primary)'
            }}>
              <Sparkles size={28} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
              {t('modals.duplicate.title')}
            </h3>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '22px' }}>
              {t('modals.duplicate.desc', { package: duplicatePackageName })}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="btn btn-primary"
                style={{
                  padding: '13px 18px',
                  fontSize: '0.92rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(56, 189, 248, 0.3)'
                }}
                onClick={() => {
                  setDuplicateModalOpen(false)
                  setSelectedPackageForTablePreview(duplicatePackageName)
                  setActiveTab('tables')
                }}
              >
                <FileSpreadsheet size={18} />
                <span>{t('modals.duplicate.explore')}</span>
              </button>

              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '10px 14px', fontSize: '0.85rem' }}
                  onClick={() => handleLaunchCalculation(true)}
                >
                  <RefreshCw size={14} />
                  <span>{t('modals.duplicate.recalc')}</span>
                </button>

                <button
                  className="btn btn-outline"
                  style={{ flex: 1, padding: '10px 14px', fontSize: '0.85rem' }}
                  onClick={() => setDuplicateModalOpen(false)}
                >
                  {t('modals.duplicate.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Package Contents Breakdown Modal */}
      {selectedPackageDetails && (
        <div className="modal-backdrop" onClick={() => setSelectedPackageDetails(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                  <FolderArchive size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                    {t('modals.package_details.title')}
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {selectedPackageDetails.package_name}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedPackageDetails(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Quick Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginTop: '16px' }}>
              <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>{t('modals.package_details.docs_used')}</span>
                <strong style={{ fontSize: '1.1rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                  {selectedPackageDetails.total_works ? `${selectedPackageDetails.total_works.toLocaleString()}` : t('downloads.full')}
                </strong>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block' }}>{t('modals.package_details.arts_processed')}</span>
              </div>

              <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>
                  {selectedPackageDetails.csv_files_count ? 'Archivos CSV' : 'Libros Excel'}
                </span>
                <strong style={{ fontSize: '1.1rem', color: '#34d399', fontFamily: 'var(--font-mono)' }}>
                  {selectedPackageDetails.csv_files_count 
                    ? `${selectedPackageDetails.csv_files_count} Archivos` 
                    : (selectedPackageDetails.excel_files_count ? `${selectedPackageDetails.excel_files_count} Libros` : '48 Tablas')}
                </strong>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block' }}>16 ent. × periodos</span>
              </div>

              <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Tamaño Paquete</span>
                <strong style={{ fontSize: '1.1rem', color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)' }}>
                  {selectedPackageDetails.zip_size_mb} MB
                </strong>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block' }}>archivo comprimido</span>
              </div>

              <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Dataset Obras (CSV)</span>
                <strong style={{ fontSize: '1.1rem', color: selectedPackageDetails.has_json ? '#10b981' : 'var(--text-dim)' }}>
                  {selectedPackageDetails.has_json ? 'Incluido' : 'No'}
                </strong>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block' }}>obras completas OpenAlex</span>
              </div>
            </div>

            {/* Search Strategy & Filters Card */}
            <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-subtle)', marginTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <SlidersHorizontal size={16} color="var(--accent-primary)" />
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                  {t('modals.package_details.strategy_title')}
                </h4>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--text-dim)' }}>{t('modals.package_details.extraction_mode')}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                    {selectedPackageDetails.search_strategy?.mode_label || (selectedPackageDetails.source_mode === 'ids' ? 'Lista de IDs' : selectedPackageDetails.source_mode === 'upload' ? 'Archivo Subido' : 'Filtros Dinámicos OpenAlex')}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ color: 'var(--text-dim)' }}>{t('modals.package_details.criteria_applied')}</span>
                  <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '8px 12px', borderRadius: '6px', color: 'var(--text-main)', lineHeight: 1.5, fontSize: '0.78rem' }}>
                    {selectedPackageDetails.search_strategy?.description || 'Consulta procesada sobre la base de datos OpenAlex.'}
                  </div>
                </div>

                {selectedPackageDetails.filters && Object.keys(selectedPackageDetails.filters).length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginTop: '6px' }}>
                    {selectedPackageDetails.filters.query && (
                      <div style={{ fontSize: '0.74rem' }}>
                        <span style={{ color: 'var(--text-dim)' }}>Texto / Query: </span>
                        <strong style={{ color: '#fff' }}>"{selectedPackageDetails.filters.query}"</strong>
                      </div>
                    )}
                    {selectedPackageDetails.filters.country_codes?.length > 0 && (
                      <div style={{ fontSize: '0.74rem' }}>
                        <span style={{ color: 'var(--text-dim)' }}>Países: </span>
                        <strong style={{ color: '#38bdf8' }}>{selectedPackageDetails.filters.country_codes.join(', ')} ({selectedPackageDetails.filters.country_logic || 'OR'})</strong>
                      </div>
                    )}
                    {selectedPackageDetails.filters.work_types?.length > 0 && (
                      <div style={{ fontSize: '0.74rem' }}>
                        <span style={{ color: 'var(--text-dim)' }}>Tipos: </span>
                        <strong style={{ color: '#fb7185' }}>{selectedPackageDetails.filters.work_types.join(', ')}</strong>
                      </div>
                    )}
                    {(selectedPackageDetails.filters.start_year || selectedPackageDetails.filters.end_year) && (
                      <div style={{ fontSize: '0.74rem' }}>
                        <span style={{ color: 'var(--text-dim)' }}>Años: </span>
                        <strong style={{ color: '#fbbf24' }}>{selectedPackageDetails.filters.start_year || 1900} — {selectedPackageDetails.filters.end_year || 2026}</strong>
                      </div>
                    )}
                    {selectedPackageDetails.filters.oa_status && selectedPackageDetails.filters.oa_status !== 'all' && (
                      <div style={{ fontSize: '0.74rem' }}>
                        <span style={{ color: 'var(--text-dim)' }}>OA: </span>
                        <strong style={{ color: '#34d399' }}>{selectedPackageDetails.filters.oa_status.toUpperCase()}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Excel Reports Breakdown */}
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {t('modals.package_details.excel_battery_title')}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                  {t('modals.package_details.excel_battery_sub')}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', maxHeight: '180px', overflowY: 'auto', fontSize: '0.75rem' }}>
                <div style={{ gridColumn: '1 / -1', fontWeight: 700, color: 'var(--accent-primary)' }}>📦 0. Corpus (Línea Base General).xlsx</div>
                <div>🌐 1. Locations.xlsx</div>
                <div>🗺️ 2. Locations Subnational.xlsx</div>
                <div>🏢 3. Organizations.xlsx</div>
                <div>🤝 4. Organizations Colab.xlsx</div>
                <div>🏭 5. Sector Types.xlsx</div>
                <div>👥 6. Researchers.xlsx</div>
                <div>📚 7. Publication Sources.xlsx</div>
                <div>🏛️ 8. Funding Agencies.xlsx</div>
                <div>🧭 9. Research Areas Domain (Nivel 1).xlsx</div>
                <div>🔬 10. Research Areas Field (Nivel 2).xlsx</div>
                <div>🏷️ 11. Research Areas Subfield (Nivel 3).xlsx</div>
                <div>🔍 12. Research Areas Topic (Nivel 4).xlsx</div>
                <div>🎯 13. Research Areas SDG (ODS).xlsx</div>
                <div>💡 14. Concepts.xlsx</div>
                <div>🏷️ 15. Keywords.xlsx</div>
                <div>💰 16. Economic APC Breakdown.xlsx</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
              <a
                href={resolveDownloadUrl(selectedPackageDetails.download_url)}
                className="btn btn-success"
                style={{ flex: 1, textDecoration: 'none', justifyContent: 'center', padding: '12px' }}
                download
              >
                <Download size={18} />
                {t('modals.package_details.download_btn', { size: selectedPackageDetails.zip_size_mb })}
              </a>
              <button
                className="btn btn-secondary"
                onClick={() => setSelectedPackageDetails(null)}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Conexión ORCID */}
      <OrcidLoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        reason={loginModalReason}
      />

      {/* Modal de Acceso Denegado (Segunda Verificación Fallida) */}
      {unauthorizedError && (
        <div className="modal-backdrop" onClick={() => setUnauthorizedError(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px', textAlign: 'center', padding: '36px' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '2px solid #ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#ef4444'
            }}>
              <AlertOctagon size={32} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '10px', color: 'var(--text-main)' }}>
              {t('modals.unauthorized.title')}
            </h3>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '24px' }}>
              {unauthorizedError}
            </p>

            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
              onClick={() => setUnauthorizedError(null)}
            >
              {t('modals.unauthorized.dismiss')}
            </button>
          </div>
        </div>
      )}

      {/* Modal Administrador de Corpus Guardados */}
      <CorpusManagerModal
        isOpen={corpusManagerModalOpen}
        onClose={() => setCorpusManagerModalOpen(false)}
        mode={corpusManagerMode}
        currentCorpusState={{
          corpusId: loadedCorpusMetadata?.corpus_id || null,
          corpusName: packageName || loadedCorpusMetadata?.corpus_name || '',
          description: loadedCorpusMetadata?.description || '',
          lineageType: isScopusMode ? 'scopus_custom' : (loadedCorpusMetadata?.lineage_type || 'standalone'),
          parentCorpusId: loadedCorpusMetadata?.parent_corpus_id || null,
          sourceMode: isScopusMode ? 'scopus' : searchMode,
          totalWorksEstimated: previewData.total,
          filters: {
            query,
            scopus_query: isScopusMode ? scopusQuery : undefined,
            domain_names: selectedDomains.map(d => d.domain_name || d.name),
            field_names: selectedFields.map(f => f.field_name || f.name),
            subfield_names: selectedSubfields.map(sf => sf.subfield_name || sf.name),
            topic_ids: selectedTopics.map(t => t.id),
            source_ids: selectedSources.map(s => s.id),
            institution_ids: selectedInstitutions.map(i => i.id),
            author_ids: selectedAuthors.map(a => a.id),
            country_codes: selectedCountries.map(c => c.code || c.id),
            work_types: selectedTypes.map(t => t.id || t.type_id),
            start_year: allYears ? 1900 : startYear,
            end_year: allYears ? 2026 : endYear,
            oa_status: oaStatus !== 'all' ? oaStatus : undefined
          },
          idsList: idsText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
        }}
        onLoadCorpus={handleLoadSavedCorpus}
        onOpenTables={(pkgName) => {
          setSelectedPackageForTablePreview(pkgName)
          setActiveTab('tables')
          setCorpusManagerModalOpen(false)
        }}
        packages={packages}
        user={user}
      />

      {/* Modal de Artículos Citantes y Base Intelectual por Paper Individual */}
      <CitingWorksModal
        isOpen={workCitingModalOpen}
        onClose={() => setWorkCitingModalOpen(false)}
        initialTab={workCitationModalTab}
        workId={selectedWorkForCiting.id}
        workTitle={selectedWorkForCiting.title}
        onSendToCorpus={handleReceiveCitingCorpus}
        user={user}
      />

      {/* Modal de Artículos Citantes y Base Intelectual para el Corpus en Conformación */}
      <CitingWorksModal
        isOpen={builderCitingModalOpen}
        onClose={() => setBuilderCitingModalOpen(false)}
        initialTab={builderCitingModalTab}
        packageName={packageName}
        isBuilderMode={true}
        builderPayload={getBuilderPayload()}
        onSendToCorpus={handleReceiveCitingCorpus}
        user={user}
      />
    </div>
  )
}

