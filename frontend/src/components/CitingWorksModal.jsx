import React, { useState, useEffect } from 'react'
import axios from 'axios'
import {
  Sparkles,
  BookOpen,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Loader2,
  AlertCircle,
  X,
  ExternalLink,
  Building2,
  Users,
  Layers,
  ArrowRight,
  Save,
  CheckCircle2,
  FileSpreadsheet
} from 'lucide-react'

export default function CitingWorksModal({
  isOpen,
  onClose,
  initialTab = 'citing', // 'citing' | 'references'
  packageName = '',
  workId = '',
  workTitle = '',
  entityType = '',
  entityName = '',
  onSendToCorpus,
  user
}) {
  const [activeTab, setActiveTab] = useState(initialTab || 'citing')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Data state
  const [modalData, setModalData] = useState({
    total_referencing_works: 0,
    total_cited_works: 0,
    total_citations_count: 0,
    total_references_count: 0,
    unique_citing_works_count: 0,
    unique_referenced_works_count: 0,
    filtered_count: 0,
    page: 1,
    limit: 25,
    total_pages: 1,
    citing_works: [],
    referenced_works: [],
    all_citing_ids: [],
    all_referenced_ids: []
  })

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sortBy, setSortBy] = useState('cited_by_count')
  const [sortOrder, setSortOrder] = useState('desc')
  const [searchQuery, setSearchQuery] = useState('')

  // Corpus derivation state
  const [isSavingCorpus, setIsSavingCorpus] = useState(false)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(null)

  const isCiting = (activeTab === 'citing')

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || 'citing')
      setPage(1)
      setSearchQuery('')
      setSaveSuccessMsg(null)
      setError(null)
    }
  }, [isOpen, initialTab])

  useEffect(() => {
    if (isOpen && (packageName || workId)) {
      fetchWorksData()
      setSaveSuccessMsg(null)
      setError(null)
    }
  }, [isOpen, activeTab, packageName, workId, workTitle, entityType, entityName, page, pageSize, sortBy, sortOrder, searchQuery])

  const fetchWorksData = () => {
    setLoading(true)
    setError(null)

    const params = {
      entity_type: entityType || '',
      entity_name: entityName || '',
      work_id: workId || '',
      work_title: workTitle || '',
      page: page,
      limit: pageSize,
      sort_by: sortBy,
      sort_order: sortOrder,
      q: searchQuery
    }

    let endpoint = ''
    if (isCiting) {
      endpoint = workId
        ? `/api/citations/work/${encodeURIComponent(workId)}`
        : `/api/citations/citing-works/${packageName}`
    } else {
      endpoint = workId
        ? `/api/citations/work-references/${encodeURIComponent(workId)}`
        : `/api/citations/referenced-works/${packageName}`
    }

    axios.get(endpoint, {
      params,
      headers: user?.orcid ? { 'X-User-ORCID': user.orcid } : {}
    })
      .then(res => {
        setModalData(res.data)
        setLoading(false)
      })
      .catch(err => {
        console.error(`Error fetching ${activeTab} works:`, err)
        setError(err.response?.data?.error || `Error al consultar ${isCiting ? 'los artículos citantes' : 'las referencias bibliográficas'}.`)
        setLoading(false)
      })
  }

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
    setPage(1)
  }

  const currentWorksList = isCiting ? (modalData.citing_works || []) : (modalData.referenced_works || [])
  const currentIdsList = isCiting ? (modalData.all_citing_ids || []) : (modalData.all_referenced_ids || [])
  const uniqueCount = isCiting ? (modalData.unique_citing_works_count || 0) : (modalData.unique_referenced_works_count || 0)
  const totalRawCount = isCiting ? (modalData.total_citations_count || 0) : (modalData.total_references_count || 0)
  const totalAnalyzedWorks = isCiting ? (modalData.total_cited_works || 1) : (modalData.total_referencing_works || 1)

  const handleExportCSV = () => {
    if (!currentWorksList || currentWorksList.length === 0) return
    const headers = ['ID', 'DOI', 'Title', 'Year', 'Type', 'Authors', 'Institutions', 'Citations', 'FWCI', 'OA_Status', 'Field', 'Subfield']
    const csvRows = [headers.join(',')]

    currentWorksList.forEach(w => {
      const row = [
        `"${w.id || ''}"`,
        `"${w.doi || ''}"`,
        `"${(w.title || '').replace(/"/g, '""')}"`,
        w.publication_year || '',
        `"${w.type || 'article'}"`,
        `"${(w.author_names || []).join('; ').replace(/"/g, '""')}"`,
        `"${(w.institution_names || []).join('; ').replace(/"/g, '""')}"`,
        w.cited_by_count || 0,
        w.fwci || 0,
        `"${w.oa_status || 'closed'}"`,
        `"${w.field_name || ''}"`,
        `"${w.subfield_name || ''}"`
      ]
      csvRows.push(row.join(','))
    })

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const safeEntity = (entityName || 'corpus_completo').replace(/[^a-zA-Z0-9_-]/g, '_')
    const prefix = isCiting ? 'articulos_citantes' : 'base_intelectual_referencias'
    link.setAttribute('download', `${prefix}_${packageName || 'paper'}_${safeEntity}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleDirectDeriveToCorpus = () => {
    if (!currentIdsList || currentIdsList.length === 0) {
      alert(`No hay ${isCiting ? 'artículos citantes' : 'referencias bibliográficas'} disponibles.`)
      return
    }

    const defaultName = isCiting
      ? `Citantes de ${workTitle ? workTitle.slice(0, 30) : entityName ? `${entityName} (${packageName})` : packageName}`
      : `Base Intelectual de ${workTitle ? workTitle.slice(0, 30) : entityName ? `${entityName} (${packageName})` : packageName}`
    
    if (onSendToCorpus) {
      onSendToCorpus(currentIdsList, defaultName)
      onClose()
    }
  }

  const handleSaveAsUserCorpus = () => {
    if (!currentIdsList || currentIdsList.length === 0) return

    setIsSavingCorpus(true)
    setError(null)

    const deriveEndpoint = isCiting ? '/api/citations/derive-corpus' : '/api/citations/derive-referenced-corpus'
    const payload = isCiting ? {
      package_name: packageName || '',
      work_id: workId || '',
      entity_type: entityType || (workId ? 'work' : ''),
      entity_name: workTitle || entityName,
      citing_ids: currentIdsList,
      corpus_name: workTitle ? `Citantes de: ${workTitle.slice(0, 40)}` : `Citantes de ${entityName ? `${entityName} (${packageName})` : packageName}`,
      user_name: user?.name || user?.orcid || 'Investigador',
      parent_corpus_id: packageName || workId || null,
      lineage_type: 'citing_impact'
    } : {
      package_name: packageName || '',
      work_id: workId || '',
      entity_type: entityType || (workId ? 'work' : ''),
      entity_name: workTitle || entityName,
      referenced_ids: currentIdsList,
      corpus_name: workTitle ? `Base_Intelectual_${workTitle.slice(0, 40)}` : `Base_Intelectual_${entityName ? `${entityName}_${packageName}` : packageName}`,
      user_name: user?.name || user?.orcid || 'Investigador',
      parent_corpus_id: packageName || workId || null,
      lineage_type: 'intellectual_base'
    }

    axios.post(deriveEndpoint, payload)
      .then(res => {
        setIsSavingCorpus(false)
        setSaveSuccessMsg(`¡Nuevo corpus "${payload.corpus_name}" guardado en "Mis Corpus"!`)
      })
      .catch(err => {
        console.error('Error saving derived corpus:', err)
        setError(err.response?.data?.error || 'Error al guardar corpus derivado.')
        setIsSavingCorpus(false)
      })
  }

  const renderOaBadge = (status) => {
    const s = String(status || 'closed').toLowerCase()
    if (s === 'diamond') return <span className="badge badge-diamond">💎 Diamante</span>
    if (s === 'gold') return <span className="badge badge-gold">🥇 Gold</span>
    if (s === 'green') return <span className="badge badge-green">🌿 Green</span>
    if (s === 'bronze') return <span className="badge badge-bronze">🥉 Bronze</span>
    if (s === 'hybrid') return <span className="badge badge-hybrid">🔀 Hybrid</span>
    return <span className="badge badge-closed">🔒 Closed</span>
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-card, #111827)',
          border: '1px solid var(--border-color, #374151)',
          borderRadius: '20px',
          padding: '24px',
          maxWidth: '1020px',
          width: '100%',
          maxHeight: '93vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85)',
          position: 'relative',
          color: 'var(--text-main, #f3f4f6)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: isCiting ? 'rgba(56, 189, 248, 0.15)' : 'rgba(129, 140, 248, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isCiting ? 'var(--accent-primary)' : '#818cf8'
            }}>
              {isCiting ? <Sparkles size={24} /> : <BookOpen size={24} />}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#fff' }}>
                  {isCiting ? 'Frente de Impacto (Artículos Citantes)' : 'Base Intelectual (Referencias Bibliográficas)'}
                </h2>
                <span style={{ fontSize: '0.74rem', padding: '2px 8px', borderRadius: '12px', background: isCiting ? 'rgba(56, 189, 248, 0.2)' : 'rgba(129, 140, 248, 0.2)', color: isCiting ? 'var(--accent-primary)' : '#818cf8', fontWeight: 700 }}>
                  OpenAlex ClickHouse
                </span>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', margin: '2px 0 0' }}>
                {workId ? (
                  <>{isCiting ? 'Impacto directo de: ' : 'Referencias citadas por: '}<strong style={{ color: 'var(--text-main)' }}>{workTitle || workId}</strong></>
                ) : entityName ? (
                  <>{isCiting ? 'Impacto directo de: ' : 'Base Intelectual de: '}<strong style={{ color: 'var(--text-main)' }}>{entityName}</strong> ({entityType}) en <em>{packageName}</em></>
                ) : (
                  <>{isCiting ? 'Impacto directo de la totalidad del corpus ' : 'Base Intelectual citada por la totalidad del corpus '}<em>{packageName}</em></>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '6px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Cienciometric Dual Tab Switcher */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', background: 'rgba(0, 0, 0, 0.35)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => { setActiveTab('citing'); setPage(1); }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: isCiting ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              color: isCiting ? 'var(--accent-primary)' : 'var(--text-dim)',
              fontWeight: isCiting ? 800 : 500,
              fontSize: '0.83rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Sparkles size={16} />
            <span>✨ Frente de Impacto (Artículos Citantes)</span>
          </button>

          <button
            onClick={() => { setActiveTab('references'); setPage(1); }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: !isCiting ? 'rgba(129, 140, 248, 0.2)' : 'transparent',
              color: !isCiting ? '#818cf8' : 'var(--text-dim)',
              fontWeight: !isCiting ? 800 : 500,
              fontSize: '0.83rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <BookOpen size={16} />
            <span>📚 Base Intelectual (Referencias Citadas)</span>
          </button>
        </div>

        {/* Dynamic KPI Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '14px' }}>
          <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
              🎯 Obras Analizadas
            </span>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
              {totalAnalyzedWorks.toLocaleString()}
            </div>
            <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>del corpus / selección</span>
          </div>

          <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
              {isCiting ? '📈 Citas Totales Recibidas' : '📚 Referencias Brutas Totales'}
            </span>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: isCiting ? '#fbbf24' : '#c084fc', fontFamily: 'var(--font-mono)' }}>
              {totalRawCount.toLocaleString()}
            </div>
            <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
              {isCiting ? 'aristas salientes de citación' : 'referencias citadas en las obras'}
            </span>
          </div>

          <div style={{
            background: isCiting ? 'rgba(56, 189, 248, 0.08)' : 'rgba(129, 140, 248, 0.08)',
            padding: '10px 14px',
            borderRadius: '10px',
            border: isCiting ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(129, 140, 248, 0.3)'
          }}>
            <span style={{ fontSize: '0.68rem', color: isCiting ? 'var(--accent-primary)' : '#818cf8', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
              {isCiting ? '🎯 Artículos Citantes Únicos' : '💡 Base Intelectual Única'}
            </span>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: isCiting ? 'var(--accent-primary)' : '#818cf8', fontFamily: 'var(--font-mono)' }}>
              {uniqueCount.toLocaleString()}
            </div>
            <span style={{ fontSize: '0.66rem', color: 'var(--text-dim)' }}>
              {totalRawCount > 0 ? (
                `Obras únicas (${((uniqueCount / totalRawCount) * 100).toFixed(1)}% desduplicación)`
              ) : 'Sin obras registradas'}
            </span>
          </div>
        </div>

        {/* Action Toolbar & Live Search */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={15} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '9px' }} />
            <input
              type="text"
              placeholder={isCiting ? "Buscar en artículos citantes (título, autor, campo, DOI)..." : "Buscar en referencias de la base intelectual (título, autor, DOI)..."}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setPage(1)
              }}
              style={{
                width: '100%',
                padding: '7px 12px 7px 34px',
                borderRadius: '8px',
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                fontSize: '0.82rem'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={handleExportCSV}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Download size={14} />
              <span>CSV</span>
            </button>

            <button
              onClick={handleSaveAsUserCorpus}
              disabled={isSavingCorpus || uniqueCount === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid #10b981',
                color: '#6ee7b7',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: isSavingCorpus ? 'not-allowed' : 'pointer'
              }}
            >
              {isSavingCorpus ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{isCiting ? 'Guardar Citantes' : 'Guardar Base Intelectual'}</span>
            </button>

            <button
              onClick={handleDirectDeriveToCorpus}
              disabled={uniqueCount === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 16px',
                borderRadius: '8px',
                background: isCiting ? 'var(--accent-primary)' : '#818cf8',
                color: '#0f172a',
                border: 'none',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: isCiting ? '0 2px 8px rgba(56, 189, 248, 0.3)' : '0 2px 8px rgba(129, 140, 248, 0.3)'
              }}
            >
              <Layers size={14} />
              <span>{isCiting ? 'Conformar Citantes y Calcular' : 'Conformar Base Intelectual y Calcular'}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', fontSize: '0.8rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}
        {saveSuccessMsg && (
          <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#6ee7b7', fontSize: '0.8rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={15} />
            <span>{saveSuccessMsg}</span>
          </div>
        )}

        {/* Table Content */}
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px', background: 'rgba(0, 0, 0, 0.15)', maxHeight: '42vh' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: isCiting ? 'var(--accent-primary)' : '#818cf8' }}>
              <Loader2 size={30} className="animate-spin" style={{ margin: '0 auto 10px' }} />
              <p style={{ fontSize: '0.85rem' }}>{isCiting ? 'Consultando grafo de citantes en ClickHouse...' : 'Consultando grafo de referencias en ClickHouse...'}</p>
            </div>
          ) : currentWorksList.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
              <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                {isCiting ? 'No se encontraron artículos citantes registrados' : 'No se encontraron referencias bibliográficas registradas'}
              </p>
              <p style={{ fontSize: '0.78rem' }}>
                {isCiting ? 'Esta entidad o selección no tiene citas salientes indexadas en OpenAlex.' : 'Esta entidad o selección no tiene referencias bibliográficas indexadas en OpenAlex.'}
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#1e293b', zIndex: 5, borderBottom: '1px solid var(--border-color)' }}>
                <tr>
                  <th style={{ padding: '10px 12px', color: 'var(--text-main)', fontWeight: 700, minWidth: '280px' }}>
                    {isCiting ? 'Artículo Citante (Impacto)' : 'Artículo Citado (Base Intelectual)'}
                  </th>
                  <th
                    onClick={() => handleSort('publication_year')}
                    style={{ padding: '10px 10px', color: sortBy === 'publication_year' ? (isCiting ? 'var(--accent-primary)' : '#818cf8') : 'var(--text-main)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>Año</span>
                      {sortBy === 'publication_year' ? (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} opacity={0.3} />}
                    </div>
                  </th>
                  <th style={{ padding: '10px 10px', color: 'var(--text-main)', fontWeight: 700 }}>
                    Autores / Afiliación
                  </th>
                  <th style={{ padding: '10px 10px', color: 'var(--text-main)', fontWeight: 700 }}>
                    Campo / Subcampo
                  </th>
                  <th
                    onClick={() => handleSort('cited_by_count')}
                    style={{ padding: '10px 10px', color: sortBy === 'cited_by_count' ? '#fbbf24' : 'var(--text-main)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'right' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                      <span>Citas</span>
                      {sortBy === 'cited_by_count' ? (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} opacity={0.3} />}
                    </div>
                  </th>
                  <th style={{ padding: '10px 10px', color: 'var(--text-main)', fontWeight: 700, textAlign: 'center' }}>
                    Acceso
                  </th>
                </tr>
              </thead>
              <tbody>
                {currentWorksList.map((w, idx) => (
                  <tr
                    key={w.id || idx}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      background: idx % 2 === 0 ? 'rgba(255, 255, 255, 0.01)' : 'transparent'
                    }}
                  >
                    <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 600, color: '#fff', marginBottom: '4px', lineHeight: 1.3 }}>
                        {w.title}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        <span style={{ textTransform: 'capitalize', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)' }}>
                          {w.type}
                        </span>
                        {w.doi ? (
                          <a
                            href={w.doi.startsWith('http') ? w.doi : `https://doi.org/${w.doi}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: isCiting ? '#38bdf8' : '#a78bfa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}
                          >
                            <span>DOI</span>
                            <ExternalLink size={10} />
                          </a>
                        ) : (
                          <a
                            href={w.id}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}
                          >
                            <span>OpenAlex</span>
                            <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    </td>

                    <td style={{ padding: '10px 10px', verticalAlign: 'top', fontWeight: 600, color: 'var(--text-main)' }}>
                      {w.publication_year}
                    </td>

                    <td style={{ padding: '10px 10px', verticalAlign: 'top', color: 'var(--text-dim)', maxWidth: '240px' }}>
                      <div style={{ color: 'var(--text-main)', fontSize: '0.78rem', marginBottom: '2px' }}>
                        {w.author_names?.slice(0, 3).join(', ')}
                        {w.author_names?.length > 3 && ` +${w.author_names.length - 3}`}
                      </div>
                      {w.institution_names?.length > 0 && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          🏢 {w.institution_names[0]}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '10px 10px', verticalAlign: 'top', color: 'var(--text-dim)' }}>
                      <div style={{ color: 'var(--text-main)', fontSize: '0.75rem' }}>{w.field_name || '-'}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{w.subfield_name || ''}</div>
                    </td>

                    <td style={{ padding: '10px 10px', verticalAlign: 'top', textAlign: 'right', fontWeight: 700, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                      {w.cited_by_count?.toLocaleString()}
                    </td>

                    <td style={{ padding: '10px 10px', verticalAlign: 'top', textAlign: 'center' }}>
                      {renderOaBadge(w.oa_status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Pagination Footer */}
        {modalData.total_pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            <span>
              Página <strong>{page}</strong> de <strong>{modalData.total_pages}</strong> ({modalData.filtered_count?.toLocaleString()} obras)
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{ padding: '4px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: page <= 1 ? 'var(--text-muted)' : '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
              >
                Anterior
              </button>
              <button
                disabled={page >= modalData.total_pages}
                onClick={() => setPage(p => Math.min(modalData.total_pages, p + 1))}
                style={{ padding: '4px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: page >= modalData.total_pages ? 'var(--text-muted)' : '#fff', cursor: page >= modalData.total_pages ? 'not-allowed' : 'pointer' }}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
