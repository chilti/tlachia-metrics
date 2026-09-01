import React, { useState, useEffect, useRef } from 'react'
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
  Check
} from 'lucide-react'

const API_BASE = ''

export default function App() {
  const [activeTab, setActiveTab] = useState('builder') // 'builder' | 'downloads'
  const [searchMode, setSearchMode] = useState('filters') // 'filters' | 'ids' | 'upload'

  // Filters State
  const [query, setQuery] = useState('')
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [selectedSource, setSelectedSource] = useState(null)
  const [selectedInstitution, setSelectedInstitution] = useState(null)
  const [selectedAuthor, setSelectedAuthor] = useState(null)
  const [startYear, setStartYear] = useState(2015)
  const [endYear, setEndYear] = useState(2026)
  const [allYears, setAllYears] = useState(false)
  const [oaStatus, setOaStatus] = useState('all')
  const [countryCode, setCountryCode] = useState('')
  const [limit, setLimit] = useState(250)

  // Direct IDs / DOIs State
  const [idsText, setIdsText] = useState('')

  // Upload State
  const [uploadedFile, setUploadedFile] = useState(null)
  const [uploadResult, setUploadResult] = useState(null)
  const [isUploading, setIsUploading] = useState(false)

  // Autocomplete Modal State
  const [modalEntity, setModalEntity] = useState(null) // 'topic' | 'source' | 'institution' | 'author'
  const [entitySearchQuery, setEntitySearchQuery] = useState('')
  const [entityResults, setEntityResults] = useState([])
  const [isSearchingEntity, setIsSearchingEntity] = useState(false)

  // Results & Pagination State
  const [previewLoading, setPreviewLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [previewData, setPreviewData] = useState({ total: 0, results: [], page: 1, total_pages: 1 })
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 20

  // Package & Calculation State
  const [packageName, setPackageName] = useState('Mi_Corpus_TlachIA')
  const [activeJob, setActiveJob] = useState(null)
  const [jobModalOpen, setJobModalOpen] = useState(false)

  // Downloads Hub State
  const [packages, setPackages] = useState([])
  const [loadingPackages, setLoadingPackages] = useState(false)
  const [selectedPackageDetails, setSelectedPackageDetails] = useState(null)

  // Health Status
  const [apiOnline, setApiOnline] = useState(true)

  // Check API Health
  useEffect(() => {
    axios.get('/api/health')
      .then(() => setApiOnline(true))
      .catch(() => setApiOnline(false))
  }, [])

  // Explicit Search Trigger
  const handleSearch = () => {
    setHasSearched(true)
    fetchPreview(1)
  }

  // Fetch Preview Works from Filters
  const fetchPreview = async (page = 1) => {
    setPreviewLoading(true)
    try {
      const offset = (page - 1) * pageSize
      const payload = {
        query,
        topic_id: selectedTopic?.id,
        source_id: selectedSource?.id,
        institution_id: selectedInstitution?.id,
        author_id: selectedAuthor?.id,
        start_year: allYears ? 1900 : startYear,
        end_year: allYears ? 2026 : endYear,
        oa_status: oaStatus !== 'all' ? oaStatus : undefined,
        country_code: countryCode || undefined,
        limit: pageSize,
        offset
      }
      const res = await axios.post('/api/corpus/preview', payload)
      setPreviewData(res.data)
      setCurrentPage(page)
    } catch (err) {
      console.error('Error fetching preview:', err)
    } finally {
      setPreviewLoading(false)
    }
  }

  // Preview Direct IDs
  const handlePreviewIds = async () => {
    const lines = idsText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
    if (lines.length === 0) return
    setPreviewLoading(true)
    try {
      const isDois = lines.some(l => l.startsWith('10.') || l.includes('doi.org'))
      const payload = isDois ? { dois: lines } : { work_ids: lines }
      const res = await axios.post('/api/corpus/preview-ids', payload)
      setPreviewData({
        total: res.data.total,
        results: res.data.results,
        page: 1,
        total_pages: 1
      })
    } catch (err) {
      console.error('Error previewing IDs:', err)
    } finally {
      setPreviewLoading(false)
    }
  }

  // Upload Handler
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadedFile(file)
    setIsUploading(true)
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
    const timer = setTimeout(async () => {
      setIsSearchingEntity(true)
      try {
        const typeMap = {
          topic: 'topics',
          source: 'sources',
          institution: 'institutions',
          author: 'authors'
        }
        const res = await axios.get('/api/entities/search', {
          params: { type: typeMap[modalEntity], q: entitySearchQuery, limit: 12 }
        })
        setEntityResults(res.data.results || [])
      } catch (err) {
        console.error('Error searching entity:', err)
      } finally {
        setIsSearchingEntity(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [modalEntity, entitySearchQuery])

  // Select Entity from Modal
  const handleSelectEntity = (item) => {
    if (modalEntity === 'topic') setSelectedTopic(item)
    if (modalEntity === 'source') setSelectedSource(item)
    if (modalEntity === 'institution') setSelectedInstitution(item)
    if (modalEntity === 'author') setSelectedAuthor(item)
    setModalEntity(null)
    setEntitySearchQuery('')
  }

  // Launch Metrics Computation Job
  const handleLaunchCalculation = async () => {
    let payload = {
      package_name: packageName,
      source_mode: searchMode
    }

    if (searchMode === 'filters') {
      payload.filters = {
        query,
        topic_id: selectedTopic?.id,
        source_id: selectedSource?.id,
        institution_id: selectedInstitution?.id,
        author_id: selectedAuthor?.id,
        start_year: allYears ? 1900 : startYear,
        end_year: allYears ? 2026 : endYear,
        oa_status: oaStatus !== 'all' ? oaStatus : undefined,
        country_code: countryCode || undefined,
        limit: limit > 0 ? limit : undefined
      }
    } else if (searchMode === 'ids') {
      const lines = idsText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
      payload.ids = lines
    } else if (searchMode === 'upload') {
      if (!uploadResult?.file_path) {
        alert('Por favor sube un archivo primero.')
        return
      }
      payload.file_path = uploadResult.file_path
    }

    try {
      const res = await axios.post('/api/jobs/create', payload)
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

  // Fetch Packages List
  const fetchPackages = async () => {
    setLoadingPackages(true)
    try {
      const res = await axios.get('/api/indicators/packages')
      setPackages(res.data.packages || [])
    } catch (err) {
      console.error('Error loading packages:', err)
    } finally {
      setLoadingPackages(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'downloads') {
      fetchPackages()
    }
  }, [activeTab])

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
                Motor Cienciométrico OpenAlex ClickHouse
              </p>
            </div>
          </div>

          <nav className="nav-tabs">
            <button
              className={`nav-tab ${activeTab === 'builder' ? 'active' : ''}`}
              onClick={() => setActiveTab('builder')}
            >
              <Layers size={16} />
              Conformador de Corpus
            </button>
            <button
              className={`nav-tab ${activeTab === 'downloads' ? 'active' : ''}`}
              onClick={() => setActiveTab('downloads')}
            >
              <FolderArchive size={16} />
              Centro de Descargas
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: apiOnline ? '#10b981' : '#f43f5e',
              boxShadow: apiOnline ? '0 0 8px #10b981' : 'none'
            }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {apiOnline ? 'ClickHouse Online' : 'API Desconectada'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="container" style={{ flex: 1 }}>
        {activeTab === 'builder' ? (
          <div className="main-layout">
            {/* Sidebar Filters */}
            <aside className="glass-panel filters-sidebar">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SlidersHorizontal size={18} color="var(--accent-primary)" />
                  Filtros del Corpus
                </span>
                <button
                  className="btn-outline"
                  style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px' }}
                  onClick={() => {
                    setQuery('')
                    setSelectedTopic(null)
                    setSelectedSource(null)
                    setSelectedInstitution(null)
                    setSelectedAuthor(null)
                    setStartYear(2015)
                    setEndYear(2026)
                    setOaStatus('all')
                    setCountryCode('')
                  }}
                >
                  Limpiar
                </button>
              </div>

              {/* Search Mode Selector */}
              <div className="filter-group">
                <label className="filter-label">Modo de Conformación</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', background: '#0e1526', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
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
                    Filtros
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
                    IDs / DOIs
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
                    Subir
                  </button>
                </div>
              </div>

              {searchMode === 'filters' && (
                <>
                  {/* Entity Chips Selectors */}
                  <div className="filter-group">
                    <label className="filter-label">Entidades Específicas</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ justifyContent: 'flex-start', fontSize: '0.8rem', padding: '8px 12px' }}
                        onClick={() => setModalEntity('topic')}
                      >
                        <Compass size={16} color="var(--accent-primary)" />
                        {selectedTopic ? selectedTopic.name : '+ Filtrar por Tópico'}
                      </button>

                      <button
                        className="btn btn-secondary"
                        style={{ justifyContent: 'flex-start', fontSize: '0.8rem', padding: '8px 12px' }}
                        onClick={() => setModalEntity('source')}
                      >
                        <BookOpen size={16} color="#fbbf24" />
                        {selectedSource ? selectedSource.name : '+ Filtrar por Revista / Fuente'}
                      </button>

                      <button
                        className="btn btn-secondary"
                        style={{ justifyContent: 'flex-start', fontSize: '0.8rem', padding: '8px 12px' }}
                        onClick={() => setModalEntity('institution')}
                      >
                        <Building2 size={16} color="#34d399" />
                        {selectedInstitution ? selectedInstitution.name : '+ Filtrar por Institución'}
                      </button>

                      <button
                        className="btn btn-secondary"
                        style={{ justifyContent: 'flex-start', fontSize: '0.8rem', padding: '8px 12px' }}
                        onClick={() => setModalEntity('author')}
                      >
                        <Users size={16} color="#a78bfa" />
                        {selectedAuthor ? selectedAuthor.name : '+ Filtrar por Investigador'}
                      </button>
                    </div>
                  </div>

                  {/* Year Range */}
                  <div className="filter-group">
                    <label className="filter-label">
                      <span>Rango Temporal</span>
                      <span style={{ color: 'var(--accent-primary)', fontSize: '0.75rem' }}>
                        {allYears ? 'Todo (Histórico)' : `${startYear} — ${endYear}`}
                      </span>
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', opacity: allYears ? 0.45 : 1 }}>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Desde:</span>
                        <input
                          type="number"
                          className="input-text"
                          min="1900"
                          max="2026"
                          disabled={allYears}
                          value={startYear}
                          onChange={(e) => setStartYear(parseInt(e.target.value) || 1970)}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Hasta:</span>
                        <input
                          type="number"
                          className="input-text"
                          min="1900"
                          max="2026"
                          disabled={allYears}
                          value={endYear}
                          onChange={(e) => setEndYear(parseInt(e.target.value) || 2026)}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-main)', userSelect: 'none' }}>
                        <input
                          type="checkbox"
                          checked={allYears}
                          onChange={(e) => setAllYears(e.target.checked)}
                          style={{ cursor: 'pointer', accentColor: 'var(--accent-primary)', width: '15px', height: '15px' }}
                        />
                        <span>Todo (Histórico completo)</span>
                      </label>
                    </div>
                  </div>

                  {/* Open Access Status */}
                  <div className="filter-group">
                    <label className="filter-label">Vía de Acceso Abierto</label>
                    <select
                      className="select-custom"
                      value={oaStatus}
                      onChange={(e) => setOaStatus(e.target.value)}
                    >
                      <option value="all">🌐 Todos los Estados</option>
                      <option value="diamond">💎 Solo Diamante (Sin APC)</option>
                      <option value="gold">🥇 Solo Gold (Con APC)</option>
                      <option value="green">🌿 Solo Green (Repositorios)</option>
                      <option value="bronze">🥉 Solo Bronze</option>
                      <option value="hybrid">🔀 Solo Hybrid</option>
                      <option value="closed">🔒 Solo Closed</option>
                    </select>
                  </div>

                  {/* Country ISO */}
                  <div className="filter-group">
                    <label className="filter-label">País (Código ISO)</label>
                    <input
                      type="text"
                      className="input-text"
                      placeholder="Ej. MX, ES, CO, BR, US"
                      maxLength={3}
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                    />
                  </div>

                  {/* Max Works Limit */}
                  <div className="filter-group">
                    <label className="filter-label">Límite para Cálculo</label>
                    <select
                      className="select-custom"
                      value={limit}
                      onChange={(e) => setLimit(parseInt(e.target.value))}
                    >
                      <option value={100}>100 artículos (Rápido)</option>
                      <option value={250}>250 artículos (Estándar)</option>
                      <option value={500}>500 artículos</option>
                      <option value={1000}>1,000 artículos</option>
                      <option value={5000}>5,000 artículos</option>
                      <option value={0}>Sin límite (Todo el corpus)</option>
                    </select>
                  </div>

                  {/* Search Button in Sidebar */}
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '14px', padding: '12px', fontSize: '0.9rem' }}
                    onClick={handleSearch}
                    disabled={previewLoading}
                  >
                    {previewLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    Buscar en OpenAlex
                  </button>
                </>
              )}

              {searchMode === 'ids' && (
                <div className="filter-group">
                  <label className="filter-label">Lista de DOIs o IDs OpenAlex</label>
                  <textarea
                    className="input-text"
                    style={{ minHeight: '180px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                    placeholder="Pega aquí DOIs o IDs separados por comas o saltos de línea:&#10;10.1016/j.jclinepi.2020.08.012&#10;W3023041060&#10;W4288109921"
                    value={idsText}
                    onChange={(e) => setIdsText(e.target.value)}
                  />
                  <button className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} onClick={handlePreviewIds} disabled={previewLoading}>
                    {previewLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={14} />}
                    Consultar IDs
                  </button>
                </div>
              )}

              {searchMode === 'upload' && (
                <div className="filter-group">
                  <label className="filter-label">Subir Archivo de Corpus</label>
                  <div
                    style={{
                      border: '2px dashed var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '24px 16px',
                      textAlign: 'center',
                      background: 'rgba(14, 21, 38, 0.5)',
                      cursor: 'pointer'
                    }}
                    onClick={() => document.getElementById('file-upload-input').click()}
                  >
                    <UploadCloud size={32} color="var(--accent-primary)" style={{ margin: '0 auto 8px' }} />
                    <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>Selecciona un archivo</p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                      JSON, JSONL, CSV o Parquet
                    </p>
                    <input
                      id="file-upload-input"
                      type="file"
                      accept=".json,.jsonl,.csv,.parquet"
                      style={{ display: 'none' }}
                      onChange={handleFileUpload}
                    />
                  </div>
                  {isUploading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--accent-primary)' }}>
                      <Loader2 size={14} className="animate-spin" />
                      Procesando archivo...
                    </div>
                  )}
                  {uploadResult && (
                    <div style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '6px', fontSize: '0.8rem', color: '#34d399' }}>
                      ✓ {uploadResult.filename} ({uploadResult.total_works} artículos)
                    </div>
                  )}
                </div>
              )}
            </aside>

            {/* Main Content Area */}
            <div className="content-area">
              {/* Search Hero */}
              {searchMode === 'filters' && (
                <div className="glass-panel search-hero">
                  <div className="search-input-wrapper">
                    <Search className="search-icon" size={20} />
                    <input
                      type="text"
                      className="search-input"
                      style={{ paddingRight: '120px' }}
                      placeholder="Buscar por título, palabras clave, conceptos o tema..."
                      value={query}
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
                        fontSize: '0.85rem'
                      }}
                      onClick={handleSearch}
                      disabled={previewLoading}
                    >
                      {previewLoading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                      Buscar
                    </button>
                  </div>

                  {/* Active Chips Bar */}
                  {(selectedTopic || selectedSource || selectedInstitution || selectedAuthor || countryCode || oaStatus !== 'all') && (
                    <div className="chips-container">
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', alignSelf: 'center' }}>Filtros activos:</span>
                      {selectedTopic && (
                        <div className="chip">
                          <Compass size={13} color="var(--accent-primary)" />
                          <span>Tópico: <strong>{selectedTopic.name}</strong></span>
                          <button className="chip-remove" onClick={() => setSelectedTopic(null)}><X size={12} /></button>
                        </div>
                      )}
                      {selectedSource && (
                        <div className="chip">
                          <BookOpen size={13} color="#fbbf24" />
                          <span>Revista: <strong>{selectedSource.name}</strong></span>
                          <button className="chip-remove" onClick={() => setSelectedSource(null)}><X size={12} /></button>
                        </div>
                      )}
                      {selectedInstitution && (
                        <div className="chip">
                          <Building2 size={13} color="#34d399" />
                          <span>Institución: <strong>{selectedInstitution.name}</strong></span>
                          <button className="chip-remove" onClick={() => setSelectedInstitution(null)}><X size={12} /></button>
                        </div>
                      )}
                      {selectedAuthor && (
                        <div className="chip">
                          <Users size={13} color="#a78bfa" />
                          <span>Autor: <strong>{selectedAuthor.name}</strong></span>
                          <button className="chip-remove" onClick={() => setSelectedAuthor(null)}><X size={12} /></button>
                        </div>
                      )}
                      {countryCode && (
                        <div className="chip">
                          <Globe2 size={13} color="#38bdf8" />
                          <span>País: <strong>{countryCode}</strong></span>
                          <button className="chip-remove" onClick={() => setCountryCode('')}><X size={12} /></button>
                        </div>
                      )}
                      {oaStatus !== 'all' && (
                        <div className="chip">
                          <Unlock size={13} color="#34d399" />
                          <span>OA: <strong>{oaStatus}</strong></span>
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
                      CORPUS CONFORMADO
                    </span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>
                      {previewLoading ? (
                        <Loader2 size={16} className="animate-spin" style={{ display: 'inline' }} />
                      ) : (
                        previewData.total.toLocaleString()
                      )} artículos identificados
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {limit > 0 && previewData.total > limit
                      ? `Se procesarán los primeros ${limit.toLocaleString()} artículos más citados.`
                      : `Se calcularán los 48 libros Excel con indicadores analíticos completos.`}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="text"
                    className="input-text"
                    style={{ width: '220px', background: '#0e1526' }}
                    placeholder="Nombre del Paquete"
                    value={packageName}
                    onChange={(e) => setPackageName(e.target.value)}
                  />
                  <button
                    className="btn btn-primary"
                    style={{ padding: '12px 24px', fontSize: '0.95rem' }}
                    disabled={previewData.total === 0 || previewLoading}
                    onClick={handleLaunchCalculation}
                  >
                    <Sparkles size={18} />
                    Calcular Métricas (48 Tablas)
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
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)' }}>569M+</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Obras Científicas Globales</div>
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(167, 139, 250, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa' }}>
                      <Users size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)' }}>337M+</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Perfiles de Investigadores</div>
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(52, 211, 153, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399' }}>
                      <Building2 size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)' }}>109K+</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Instituciones & RORs</div>
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(251, 191, 36, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24' }}>
                      <Library size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)' }}>124K+</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Revistas & Fuentes</div>
                    </div>
                  </div>
                </div>

                {/* Corpus Coverage Card */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                  {previewLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                      <Loader2 size={36} className="animate-spin" style={{ margin: '0 auto 14px', color: 'var(--accent-primary)' }} />
                      <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>Consultando OpenAlex ClickHouse...</h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Cuantificando registros y aplicando filtros analíticos en el cluster de alta velocidad.
                      </p>
                    </div>
                  ) : !hasSearched ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(56, 189, 248, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)', margin: '0 auto 16px' }}>
                        <Search size={28} />
                      </div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
                        Dimensionamiento del Corpus en OpenAlex
                      </h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '520px', margin: '0 auto 20px', lineHeight: 1.5 }}>
                        Configura los filtros en la barra lateral o escribe palabras clave en el buscador y presiona <strong>Buscar</strong> para consultar la cantidad exacta de artículos disponibles antes de calcular las 48 tablas.
                      </p>
                      <button className="btn btn-primary" style={{ padding: '10px 28px', fontSize: '0.9rem' }} onClick={handleSearch}>
                        <Search size={16} /> Consultar Corpus
                      </button>
                    </div>
                  ) : previewData.total === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <AlertCircle size={36} color="#f59e0b" style={{ margin: '0 auto 12px' }} />
                      <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>No se encontraron artículos</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '460px', margin: '4px auto 0' }}>
                        No existen registros que coincidan con la combinación de filtros seleccionada. Prueba ampliando el rango de años o flexibilizando las restricciones.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <CheckCircle2 size={24} color="#10b981" />
                          <div>
                            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                              Corpus Localizado con Éxito
                            </h4>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              Resultados verificados sobre la base de datos OpenAlex
                            </span>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                            {previewData.total.toLocaleString()}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Artículos Totales Encontrados
                          </div>
                        </div>
                      </div>

                      {/* Criteria summary */}
                      <div style={{ background: '#0e1526', borderRadius: 'var(--radius-md)', padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Rango Temporal</span>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', marginTop: '2px' }}>
                            {allYears ? 'Todo (1900 — 2026)' : `${startYear} — ${endYear}`}
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Acceso Abierto</span>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', marginTop: '2px' }}>
                            {oaStatus === 'all' ? 'Todos los estados' : oaStatus.toUpperCase()}
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>País / Territorio</span>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', marginTop: '2px' }}>
                            {countryCode || 'Global (Sin filtro)'}
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Límite para Métricas</span>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#34d399', marginTop: '2px' }}>
                            {limit > 0 && previewData.total > limit ? `Top ${limit.toLocaleString()} citados` : `Completo (${previewData.total.toLocaleString()})`}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Downloads Hub Tab */
          <div style={{ marginTop: '24px', marginBottom: '48px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Centro de Paquetes Generados (.ZIP)</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                  Descarga directa de los 48 libros Excel estilizados, el archivo JSON de OpenAlex y tablas Parquet.
                </p>
              </div>
              <button className="btn btn-secondary" onClick={fetchPackages}>
                <RefreshCw size={16} />
                Actualizar Lista
              </button>
            </div>

            {loadingPackages ? (
              <div style={{ textAlign: 'center', padding: '60px' }}>
                <Loader2 size={36} className="animate-spin" style={{ margin: '0 auto 16px', color: 'var(--accent-primary)' }} />
                <p style={{ color: 'var(--text-muted)' }}>Explorando paquetes en disco...</p>
              </div>
            ) : packages.length === 0 ? (
              <div className="glass-panel" style={{ padding: '60px', textAlign: 'center' }}>
                <FolderArchive size={48} color="var(--text-dim)" style={{ margin: '0 auto 16px' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Aún no hay paquetes calculados</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '6px', maxWidth: '420px', margin: '6px auto 16px' }}>
                  Conforma un corpus en la pestaña anterior y presiona "Calcular Métricas" para generar tu primer paquete cienciométrico.
                </p>
                <button className="btn btn-primary" onClick={() => setActiveTab('builder')}>
                  Ir al Conformador de Corpus
                </button>
              </div>
            ) : (
              <div className="packages-grid">
                {packages.map((pkg) => (
                  <div key={pkg.package_name} className="glass-panel package-card">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FolderArchive size={22} color="var(--accent-primary)" />
                          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', wordBreak: 'break-all' }}>
                            {pkg.package_name}
                          </h3>
                        </div>
                        <span className="badge badge-green">Listo</span>
                      </div>

                      <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Archivos Excel:</span>
                          <strong style={{ color: 'var(--text-muted)' }}>48 libros (.xlsx)</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Corpus JSON OpenAlex:</span>
                          <strong style={{ color: pkg.has_json ? '#34d399' : 'var(--text-dim)' }}>
                            {pkg.has_json ? 'Incluido' : 'No'}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Tamaño del Paquete:</span>
                          <strong style={{ color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)' }}>
                            {pkg.zip_size_mb} MB
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Fecha de Generación:</span>
                          <span style={{ color: 'var(--text-dim)' }}>
                            {new Date(pkg.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                      <a
                        href={pkg.download_url}
                        className="btn btn-success"
                        style={{ flex: 1, textDecoration: 'none' }}
                        download
                      >
                        <Download size={16} />
                        Descargar .ZIP
                      </a>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setSelectedPackageDetails(pkg)}
                      >
                        <FileSpreadsheet size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Autocomplete Entity Modal */}
      {modalEntity && (
        <div className="modal-backdrop" onClick={() => setModalEntity(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {modalEntity === 'topic' && <Compass size={22} color="var(--accent-primary)" />}
                {modalEntity === 'source' && <BookOpen size={22} color="#fbbf24" />}
                {modalEntity === 'institution' && <Building2 size={22} color="#34d399" />}
                {modalEntity === 'author' && <Users size={22} color="#a78bfa" />}
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                  Buscar {modalEntity === 'topic' ? 'Tópico' : modalEntity === 'source' ? 'Revista / Fuente' : modalEntity === 'institution' ? 'Institución' : 'Investigador'}
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
                placeholder={`Escribe el nombre del ${modalEntity}...`}
                value={entitySearchQuery}
                onChange={(e) => setEntitySearchQuery(e.target.value)}
              />
            </div>

            <div style={{ maxHeight: '340px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {isSearchingEntity ? (
                <div style={{ textAlign: 'center', padding: '30px' }}>
                  <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px', color: 'var(--accent-primary)' }} />
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Buscando en OpenAlex...</p>
                </div>
              ) : entityResults.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                  {entitySearchQuery ? 'No se encontraron resultados.' : 'Escribe para buscar coincidencias.'}
                </p>
              ) : (
                entityResults.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectEntity(item)}
                    style={{
                      padding: '10px 14px',
                      background: '#0e1526',
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
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff' }}>{item.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        ID: {item.id} {item.extra?.field && `• ${item.extra.field}`} {item.extra?.country_code && `• ${item.extra.country_code}`}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {item.works_count ? `${item.works_count.toLocaleString()} arts` : ''}
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

              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
                {activeJob.status === 'completed'
                  ? '¡Cálculo de Indicadores Completado!'
                  : activeJob.status === 'failed'
                  ? 'Error en el Procesamiento'
                  : 'Calculando Indicadores Cienciométricos'}
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Paquete: <strong>{activeJob.package_name}</strong>
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
              background: '#0e1526',
              borderRadius: '8px',
              padding: '12px 16px',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.78rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-dim)' }}>
                <span>Dimensiones Analíticas:</span>
                <span>16 Entidades (Locations, Orgs, Authors, Sources, Topics, APC...)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-dim)' }}>
                <span>Libros Excel Estilizados:</span>
                <span>48 Reportes (Histórico, 2021-2025, Anual Trend)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-dim)' }}>
                <span>Dataset Completo:</span>
                <span>JSON Estructurado OpenAlex</span>
              </div>
            </div>

            {/* Action Buttons */}
            {activeJob.status === 'completed' ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <a
                  href={activeJob.result?.download_url}
                  className="btn btn-success"
                  style={{ flex: 1, padding: '14px', fontSize: '0.95rem', textDecoration: 'none' }}
                  download
                >
                  <Download size={18} />
                  Descargar Paquete .ZIP Ahora
                </a>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setJobModalOpen(false)
                    setActiveTab('downloads')
                  }}
                >
                  Ver en Catálogo
                </button>
              </div>
            ) : activeJob.status === 'failed' ? (
              <button className="btn btn-secondary" onClick={() => setJobModalOpen(false)}>
                Cerrar
              </button>
            ) : (
              <button
                className="btn btn-outline"
                style={{ fontSize: '0.8rem' }}
                onClick={() => setJobModalOpen(false)}
              >
                Minimizar (Continuará en segundo plano)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Package Contents Breakdown Modal */}
      {selectedPackageDetails && (
        <div className="modal-backdrop" onClick={() => setSelectedPackageDetails(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderArchive size={22} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Contenido de {selectedPackageDetails.package_name}</h3>
              </div>
              <button
                onClick={() => setSelectedPackageDetails(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p>Este paquete contiene la batería unificada de 48 libros Excel organizados en tres temporalidades:</p>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#0e1526', padding: '12px', borderRadius: '8px' }}>
                <div>• Locations.xlsx</div>
                <div>• Organizations.xlsx</div>
                <div>• Locations Subnational.xlsx</div>
                <div>• Organizations Colab.xlsx</div>
                <div>• Sector Types.xlsx</div>
                <div>• Researchers.xlsx</div>
                <div>• Publication Sources.xlsx</div>
                <div>• Funding Agencies.xlsx</div>
                <div>• Macro Topics.xlsx</div>
                <div>• Meso Topics.xlsx</div>
                <div>• Micro Topics.xlsx</div>
                <div>• Research Areas ESI.xlsx</div>
                <div>• Research Areas SDG.xlsx</div>
                <div>• Concepts.xlsx</div>
                <div>• Keywords.xlsx</div>
                <div>• Economic APC Breakdown.xlsx</div>
              </div>
            </div>

            <a
              href={selectedPackageDetails.download_url}
              className="btn btn-success"
              style={{ textDecoration: 'none' }}
              download
            >
              <Download size={18} />
              Descargar {selectedPackageDetails.zip_filename} ({selectedPackageDetails.zip_size_mb} MB)
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
