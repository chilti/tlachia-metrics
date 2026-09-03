import React, { useState, useEffect } from 'react'
import axios from 'axios'
import {
  Sparkles,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Loader2,
  AlertCircle,
  X,
  ExternalLink,
  BookOpen,
  Building2,
  Users,
  Layers,
  ArrowRight,
  Save,
  CheckCircle2,
  Share2,
  FileSpreadsheet
} from 'lucide-react'

export default function CitingWorksModal({
  isOpen,
  onClose,
  packageName,
  entityType = '',
  entityName = '',
  onSendToCorpus,
  user
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [citingData, setCitingData] = useState({
    total_cited_works: 0,
    total_citations_count: 0,
    unique_citing_works_count: 0,
    filtered_count: 0,
    page: 1,
    limit: 25,
    total_pages: 1,
    citing_works: [],
    all_citing_ids: []
  })

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sortBy, setSortBy] = useState('cited_by_count')
  const [sortOrder, setSortOrder] = useState('desc')
  const [searchQuery, setSearchQuery] = useState('')

  // Corpus derivation state
  const [isSavingCorpus, setIsSavingCorpus] = useState(false)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(null)

  useEffect(() => {
    if (isOpen && packageName) {
      fetchCitingWorks()
      setSaveSuccessMsg(null)
      setError(null)
    }
  }, [isOpen, packageName, entityType, entityName, page, pageSize, sortBy, sortOrder, searchQuery])

  const fetchCitingWorks = () => {
    setLoading(true)
    setError(null)

    const params = {
      entity_type: entityType || '',
      entity_name: entityName || '',
      page: page,
      limit: pageSize,
      sort_by: sortBy,
      sort_order: sortOrder,
      q: searchQuery
    }

    axios.get(`/api/citations/citing-works/${packageName}`, { params })
      .then(res => {
        setCitingData(res.data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error fetching citing works:', err)
        setError(err.response?.data?.error || 'Error al consultar los artículos citantes.')
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

  const handleExportCSV = () => {
    if (!citingData.citing_works || citingData.citing_works.length === 0) return
    const headers = ['ID', 'DOI', 'Title', 'Year', 'Type', 'Authors', 'Institutions', 'Citations', 'FWCI', 'OA_Status', 'Field', 'Subfield']
    const csvRows = [headers.join(',')]

    citingData.citing_works.forEach(w => {
      const row = [
        `"${w.id || ''}"`,
        `"${w.doi || ''}"`,
        `"${(w.title || '').replace(/"/g, '""')}"`,
        w.publication_year || '',
        `"${w.type || ''}"`,
        `"${(w.author_names || []).join('; ').replace(/"/g, '""')}"`,
        `"${(w.institution_names || []).join('; ').replace(/"/g, '""')}"`,
        w.cited_by_count || 0,
        w.fwci || 0,
        `"${w.oa_status || ''}"`,
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
    link.setAttribute('download', `articulos_citantes_${packageName}_${safeEntity}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleDirectDeriveToCorpus = () => {
    if (!citingData.all_citing_ids || citingData.all_citing_ids.length === 0) {
      alert('No hay artículos citantes disponibles.')
      return
    }

    const defaultName = `Citantes de ${entityName ? `${entityName} (${packageName})` : packageName}`
    if (onSendToCorpus) {
      onSendToCorpus(citingData.all_citing_ids, defaultName)
      onClose()
    }
  }

  const handleSaveAsUserCorpus = () => {
    if (!citingData.all_citing_ids || citingData.all_citing_ids.length === 0) return

    setIsSavingCorpus(true)
    setError(null)
    const defaultName = `Citantes de ${entityName ? `${entityName} (${packageName})` : packageName}`

    axios.post('/api/citations/derive-corpus', {
      package_name: packageName,
      entity_type: entityType,
      entity_name: entityName,
      corpus_name: defaultName,
      citing_ids: citingData.all_citing_ids,
      user_name: user?.name || user?.orcid || 'Investigador'
    })
      .then(res => {
        setIsSavingCorpus(false)
        setSaveSuccessMsg(`¡Nuevo corpus "${defaultName}" guardado en "Mis Corpus"!`)
      })
      .catch(err => {
        console.error('Error saving citing corpus:', err)
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
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
          maxWidth: '1000px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
          position: 'relative',
          color: 'var(--text-main, #f3f4f6)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
              <Sparkles size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#fff' }}>
                  Artículos Citantes
                </h2>
                <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.2)', color: 'var(--accent-primary)', fontWeight: 700 }}>
                  ClickHouse 874M
                </span>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', margin: '2px 0 0' }}>
                {entityName ? (
                  <>Impacto directo de: <strong style={{ color: 'var(--text-main)' }}>{entityName}</strong> ({entityType}) en <em>{packageName}</em></>
                ) : (
                  <>Impacto directo de la totalidad del corpus <em>{packageName}</em></>
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

        {/* Impact KPI Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
              📚 Obras Citadas
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
              {citingData.total_cited_works.toLocaleString()}
            </div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>del corpus / entidad</span>
          </div>

          <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
              📈 Citas Totales Recibidas
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
              {citingData.total_citations_count.toLocaleString()}
            </div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>aristas de citación brutas</span>
          </div>

          <div style={{ background: 'rgba(56, 189, 248, 0.08)', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
              🎯 Artículos Citantes Únicos
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
              {citingData.unique_citing_works_count.toLocaleString()}
            </div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
              {citingData.total_citations_count > 0 ? (
                `Deduplicación: ${((citingData.unique_citing_works_count / citingData.total_citations_count) * 100).toFixed(1)}%`
              ) : 'Sin citantes'}
            </span>
          </div>
        </div>

        {/* Action Toolbar & Live Search */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={15} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '10px' }} />
            <input
              type="text"
              placeholder="Buscar en artículos citantes (título, autor, campo, DOI)..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setPage(1)
              }}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
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
                padding: '8px 12px',
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
              disabled={isSavingCorpus || citingData.unique_citing_works_count === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
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
              <span>Guardar en Mis Corpus</span>
            </button>

            <button
              onClick={handleDirectDeriveToCorpus}
              disabled={citingData.unique_citing_works_count === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                background: 'var(--accent-primary)',
                color: '#0f172a',
                border: 'none',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(56, 189, 248, 0.3)'
              }}
            >
              <Layers size={14} />
              <span>Crear Nuevo Corpus y Calcular</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', fontSize: '0.8rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}
        {saveSuccessMsg && (
          <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#6ee7b7', fontSize: '0.8rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={15} />
            <span>{saveSuccessMsg}</span>
          </div>
        )}

        {/* Table Content */}
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px', background: 'rgba(0, 0, 0, 0.15)', maxHeight: '42vh' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--accent-primary)' }}>
              <Loader2 size={30} className="animate-spin" style={{ margin: '0 auto 10px' }} />
              <p style={{ fontSize: '0.85rem' }}>Consultando grafo de citaciones en ClickHouse...</p>
            </div>
          ) : citingData.citing_works.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
              <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>No se encontraron artículos citantes registrados</p>
              <p style={{ fontSize: '0.78rem' }}>Esta entidad o selección no tiene citas salientes indexadas en OpenAlex.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#1e293b', zIndex: 5, borderBottom: '1px solid var(--border-color)' }}>
                <tr>
                  <th style={{ padding: '10px 12px', color: 'var(--text-main)', fontWeight: 700, minWidth: '280px' }}>
                    Artículo Citante
                  </th>
                  <th
                    onClick={() => handleSort('publication_year')}
                    style={{ padding: '10px 10px', color: sortBy === 'publication_year' ? 'var(--accent-primary)' : 'var(--text-main)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
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
                    style={{ padding: '10px 10px', color: sortBy === 'cited_by_count' ? 'var(--accent-primary)' : 'var(--text-main)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'right' }}
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
                {citingData.citing_works.map((w, idx) => (
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
                            style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}
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
        {citingData.total_pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            <span>
              Página <strong>{page}</strong> de <strong>{citingData.total_pages}</strong> ({citingData.filtered_count.toLocaleString()} citantes)
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
                disabled={page >= citingData.total_pages}
                onClick={() => setPage(p => Math.min(citingData.total_pages, p + 1))}
                style={{ padding: '4px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: page >= citingData.total_pages ? 'var(--text-muted)' : '#fff', cursor: page >= citingData.total_pages ? 'not-allowed' : 'pointer' }}
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
