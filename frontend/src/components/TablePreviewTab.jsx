import React, { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import {
  Table as TableIcon,
  Layers,
  Calendar,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Loader2,
  AlertCircle,
  FolderArchive,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ExternalLink,
  Eye,
  SlidersHorizontal,
  BookOpen
} from 'lucide-react'
import CitingWorksModal from './CitingWorksModal'
import { useI18n } from '../i18n'

const resolveDownloadUrl = (url) => {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const clean = url.startsWith('/') ? url : `/${url}`
  const path = typeof window !== 'undefined' ? (window.location.pathname || '') : ''
  const matched = path.match(/^\/(tlachiametrics|tlachia-metrics|tlachia_metrics|tlachia)/i)
  const prefix = matched ? `/${matched[1]}` : ''
  return `${prefix}${clean}`
}

const TABLE_OPTIONS = [
  { id: 'corpus', name: 'Corpus Completo (Baseline)', icon: '📦' },
  { id: 'organizations', name: 'Organizations (Instituciones)', icon: '🏢' },
  { id: 'locations', name: 'Locations (Países)', icon: '🌐' },
  { id: 'locations_subnational', name: 'Locations Subnational (Estados)', icon: '🗺️' },
  { id: 'organizations_colab', name: 'Organizations Colab (Co-afiliaciones)', icon: '🤝' },
  { id: 'sector_types', name: 'Sector Types (Sectores)', icon: '🏭' },
  { id: 'researchers', name: 'Researchers (Investigadores)', icon: '👥' },
  { id: 'publication_sources', name: 'Publication Sources (Revistas)', icon: '📚' },
  { id: 'funding_agencies', name: 'Funding Agencies (Financiamiento)', icon: '🏛️' },
  { id: 'research_areas_domain', name: 'Domains (Dominios - Nivel 1)', icon: '🧭' },
  { id: 'research_areas_field', name: 'Fields (Campos - Nivel 2)', icon: '🔬' },
  { id: 'research_areas_subfield', name: 'Subfields (Subcampos - Nivel 3)', icon: '🏷️' },
  { id: 'research_areas_topic', name: 'Topics (Tópicos - Nivel 4)', icon: '🔍' },
  { id: 'research_areas_sdg', name: 'Research Areas SDG (ODS)', icon: '🎯' },
  { id: 'concepts', name: 'Concepts (Conceptos)', icon: '💡' },
  { id: 'keywords', name: 'Keywords (Palabras Clave)', icon: '🏷️' },
  { id: 'economic_apc_breakdown', name: 'Economic APC Breakdown (Costos APC)', icon: '💰' }
]

const PERIOD_OPTIONS = [
  { id: 'full', label: 'Histórico Completo' },
  { id: 'recent', label: 'Reciente (2021-2025)' },
  { id: 'trend', label: 'Tendencia Anual' }
]

const getPkgName = (p) => (typeof p === 'string' ? p : (p?.package_name || p?.name || ''))

export default function TablePreviewTab({
  packages = [],
  initialPackage = null,
  activeJob = null,
  onOpenJobModal = null,
  onOpenDownloads,
  onGoToBuilder,
  onSendToCorpus,
  onRefreshPackages,
  user
}) {
  const { t } = useI18n()

  const [selectedPackage, setSelectedPackage] = useState(() => {
    return initialPackage || ''
  })
  const [selectedTable, setSelectedTable] = useState('organizations')
  const [selectedPeriod, setSelectedPeriod] = useState('full')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('')
  const [sortOrder, setSortOrder] = useState('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // ZIP Generation State
  const [generatingZip, setGeneratingZip] = useState(false)

  // Citing Works Modal State
  const [citingModalOpen, setCitingModalOpen] = useState(false)
  const [citingModalInitialTab, setCitingModalInitialTab] = useState('citing')
  const [selectedCitingEntity, setSelectedCitingEntity] = useState({ type: '', name: '' })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [tableData, setTableData] = useState({
    columns: [],
    data: [],
    total_rows: 0,
    total_pages: 1,
    available_periods: []
  })

  // Dynamic available periods discovery
  const effectivePeriodOptions = useMemo(() => {
    if (tableData?.available_periods && tableData.available_periods.length > 0) {
      return tableData.available_periods
    }
    const currentPkg = packages.find(p => getPkgName(p) === selectedPackage)
    if (currentPkg?.periods && currentPkg.periods.length > 0) {
      const opts = [{ id: 'full', label: 'Histórico Completo' }]
      if (currentPkg.has_performance_matrix) {
        opts.push({ id: 'performance_matrix', label: 'Matriz de Desempeño' })
      }
      currentPkg.periods.forEach(p => {
        const id = p.replace('-', '_')
        opts.push({ id, label: `Periodo ${p}` })
      })
      opts.push({ id: 'trend', label: 'Tendencia Anual' })
      return opts
    }
    return PERIOD_OPTIONS
  }, [tableData?.available_periods, packages, selectedPackage])

  useEffect(() => {
    if (effectivePeriodOptions.length > 0 && !effectivePeriodOptions.some(p => p.id === selectedPeriod)) {
      setSelectedPeriod(effectivePeriodOptions[0].id)
    }
  }, [effectivePeriodOptions, selectedPeriod])

  // Filter entity options to only those calculated in the selected package
  const effectiveTableOptions = useMemo(() => {
    const currentPkg = packages.find(p => getPkgName(p) === selectedPackage)
    // If the package has selected_entities metadata, restrict to those
    if (currentPkg?.selected_entities && currentPkg.selected_entities.length > 0) {
      const allowed = new Set(currentPkg.selected_entities)
      return TABLE_OPTIONS.filter(t => allowed.has(t.id))
    }
    // Fallback: show all options (legacy packages without metadata)
    return TABLE_OPTIONS
  }, [packages, selectedPackage])

  // Auto-switch selectedTable if current selection wasn't calculated in this package
  useEffect(() => {
    if (effectiveTableOptions.length > 0 && !effectiveTableOptions.some(t => t.id === selectedTable)) {
      setSelectedTable(effectiveTableOptions[0].id)
    }
  }, [effectiveTableOptions, selectedTable])

  // Sync initialPackage when passed from parent (e.g. clicking "Explorar Tablas" from a specific card)
  useEffect(() => {
    if (initialPackage) {
      setSelectedPackage(initialPackage)
    }
  }, [initialPackage])

  // Reset when user logs out
  useEffect(() => {
    if (!user) {
      setSelectedPackage('')
      setTableData({ columns: [], data: [], total_rows: 0, total_pages: 1 })
    }
  }, [user])

  // Auto-switch to newly completed package
  useEffect(() => {
    if (activeJob && activeJob.status === 'completed' && activeJob.package_name) {
      setSelectedPackage(activeJob.package_name)
    }
  }, [activeJob?.status, activeJob?.package_name])

  // Fetch Table Data
  useEffect(() => {
    if (!selectedPackage || !user) {
      setTableData({ columns: [], data: [], total_rows: 0, total_pages: 1 })
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const params = {
      table: selectedTable,
      period: selectedPeriod,
      page: page,
      limit: pageSize,
      sort_by: sortBy,
      sort_order: sortOrder,
      q: searchQuery
    }

    axios.get(`/api/indicators/table-preview/${selectedPackage}`, { 
      params,
      headers: user?.orcid ? { 'X-User-ORCID': user.orcid } : {}
    })
      .then(res => {
        setTableData(res.data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error fetching table preview:', err)
        setError(err.response?.data?.error || 'No se pudo cargar la vista previa de la tabla seleccionada.')
        setLoading(false)
      })
  }, [selectedPackage, selectedTable, selectedPeriod, page, pageSize, sortBy, sortOrder, searchQuery, user])

  const handleOpenCitingModal = (entityType = 'corpus', entityName = '', tab = 'citing') => {
    setSelectedCitingEntity({
      type: entityType,
      name: entityName
    })
    setCitingModalInitialTab(tab)
    setCitingModalOpen(true)
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

  const handleGenerateZip = async () => {
    if (!selectedPackage) return
    setGeneratingZip(true)
    try {
      const res = await axios.post(
        `/api/indicators/packages/${encodeURIComponent(selectedPackage)}/generate-zip`,
        {},
        {
          headers: user?.orcid ? { 'X-User-ORCID': user.orcid } : {}
        }
      )
      if (onRefreshPackages) {
        await onRefreshPackages()
      }
      alert(t('tables.zip_success', { size: res.data.zip_size_mb }))
      if (res.data.download_url) {
        const a = document.createElement('a')
        a.href = resolveDownloadUrl(res.data.download_url)
        a.download = `${selectedPackage}.zip`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
    } catch (err) {
      alert('Error generando archivo ZIP: ' + (err.response?.data?.error || err.message))
    } finally {
      setGeneratingZip(false)
    }
  }

  const handleExportCSV = () => {
    if (!tableData.data || tableData.data.length === 0) return
    const cols = tableData.columns
    const csvRows = [cols.join(',')]
    tableData.data.forEach(row => {
      const values = cols.map(c => {
        const val = row[c] === null || row[c] === undefined ? '' : String(row[c])
        return `"${val.replace(/"/g, '""')}"`
      })
      csvRows.push(values.join(','))
    })
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `${selectedPackage}_${selectedTable}_${selectedPeriod}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const formatCellValue = (col, val) => {
    if (val === null || val === undefined) return '-'
    if (typeof val === 'number') {
      if (col.startsWith('%') || col.includes('Percent') || col.includes('Rate')) {
        return `${val.toFixed(1)}%`
      }
      if (col.includes('USD') || col.includes('APC') || col.includes('Savings')) {
        return `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
      }
      if (Number.isInteger(val)) {
        return val.toLocaleString()
      }
      return val.toFixed(2)
    }
    return String(val)
  }

  if (packages.length === 0) {
    if (activeJob && (activeJob.status === 'queued' || activeJob.status === 'running')) {
      return (
        <div className="card-panel" style={{ padding: '50px 24px', textAlign: 'center', maxWidth: '580px', margin: '0 auto' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <Loader2 size={30} color="var(--accent-primary)" className="animate-spin" />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '6px' }}>
            Cálculo de Indicadores en Curso
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '20px' }}>
            Procesando el paquete <strong>{activeJob.package_name}</strong>. En unos momentos las tablas estarán listas para su exploración.
          </p>

          <div style={{ background: 'var(--bg-input)', padding: '14px 18px', borderRadius: '10px', marginBottom: '20px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-dim)' }}>{activeJob.stage_label}</span>
              <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>
                {activeJob.progress}%
              </span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${activeJob.progress}%` }} />
            </div>
          </div>

          {onOpenJobModal && (
            <button
              className="btn btn-outline"
              style={{ fontSize: '0.85rem', margin: '0 auto' }}
              onClick={onOpenJobModal}
            >
              <Eye size={15} />
              <span>{t('tables.view_full_dialog')}</span>
            </button>
          )}
        </div>
      )
    }

    return (
      <div className="card-panel" style={{ padding: '60px 20px', textAlign: 'center' }}>
        <FolderArchive size={48} color="var(--accent-primary)" style={{ margin: '0 auto 16px', opacity: 0.6 }} />
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>
          {t('tables.no_packages_yet_title')}
        </h3>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', maxWidth: '450px', margin: '0 auto 20px' }}>
          {t('tables.no_packages_yet_desc')}
        </p>
      </div>
    )
  }

  const isJobRunning = activeJob && (activeJob.status === 'queued' || activeJob.status === 'running')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Live Calculation Banner */}
      {isJobRunning && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(56, 189, 248, 0.12) 0%, rgba(99, 102, 241, 0.12) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: '12px',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'rgba(56, 189, 248, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Loader2 size={20} color="var(--accent-primary)" className="animate-spin" />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{t('tables.calculation_in_progress')} <strong>{activeJob.package_name}</strong></span>
                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.2)', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                  {activeJob.progress}%
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                {activeJob.stage_label}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 220px', maxWidth: '340px' }}>
            <div className="progress-bar-container" style={{ flex: 1 }}>
              <div className="progress-bar-fill" style={{ width: `${activeJob.progress}%` }} />
            </div>
            {onOpenJobModal && (
              <button
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                onClick={onOpenJobModal}
              >
                <Eye size={13} />
                <span>{t('tables.view_dialog')}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Context Navigation & Breadcrumb Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        borderRadius: '14px',
        padding: '14px 20px',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'rgba(56, 189, 248, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-primary)'
          }}>
            <FileSpreadsheet size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                {t('tables.explorer_title')}
              </h2>
              {selectedPackage && (
                <span style={{ fontSize: '0.74rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.2)', color: 'var(--accent-primary)', fontWeight: 700 }}>
                  {selectedPackage}
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: '2px 0 0' }}>
              {t('tables.explorer_subtitle')}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {onGoToBuilder && (
            <button
              onClick={onGoToBuilder}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '8px 16px', fontWeight: 800, boxShadow: '0 2px 10px rgba(56, 189, 248, 0.3)' }}
            >
              <SlidersHorizontal size={15} />
              <span>{t('tables.back_to_builder')}</span>
            </button>
          )}
          {onOpenDownloads && (
            <button
              onClick={onOpenDownloads}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '8px 14px' }}
            >
              <FolderArchive size={15} />
              <span>{t('tables.download_center_btn')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Top Controls Bar */}
      <div className="card-panel" style={{ padding: '18px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', alignItems: 'center' }}>
          
          {/* Package Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 700 }}>
              {t('tables.package_label')}
            </label>
            <select
              value={selectedPackage}
              onChange={(e) => {
                setSelectedPackage(e.target.value)
                setPage(1)
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'var(--bg-input)',
                border: selectedPackage ? '1px solid var(--border-color)' : '1px solid var(--accent-primary)',
                color: selectedPackage ? 'var(--text-main)' : 'var(--accent-primary)',
                fontSize: '0.9rem',
                fontWeight: 600
              }}
            >
              <option value="" style={{ background: 'var(--table-header-bg)', color: 'var(--text-dim)' }}>
                {packages.length === 0 ? t('tables.no_packages_calculated') : t('tables.select_package_placeholder')}
              </option>
              {packages.map(pkg => {
                const pName = getPkgName(pkg)
                return (
                  <option key={pName} value={pName} style={{ background: 'var(--table-header-bg)', color: 'var(--text-main)' }}>
                    {pName} ({pkg.total_works?.toLocaleString() || 0} {t('tables.works_count_suffix')})
                  </option>
                )
              })}
            </select>
          </div>

          {/* Table Entity Selector (Combo) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 700 }}>
              {t('tables.entity_label')}
            </label>
            <select
              value={selectedTable}
              onChange={(e) => {
                setSelectedTable(e.target.value)
                setPage(1)
                setSortBy('')
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'var(--bg-input)',
                border: '1px solid var(--accent-primary)',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
                fontWeight: 700
              }}
            >
              {effectiveTableOptions.map(tab => (
                <option key={tab.id} value={tab.id} style={{ background: 'var(--table-header-bg)' }}>
                  {tab.icon} {t('tables.entities.' + tab.id) || tab.name}
                </option>
              ))}
            </select>
          </div>

          {/* Period Selector (Dropdown) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 700 }}>
              {t('tables.temporality_label')}
            </label>
            <select
              value={selectedPeriod}
              onChange={(e) => {
                setSelectedPeriod(e.target.value)
                setPage(1)
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
                fontWeight: 600
              }}
            >
              {effectivePeriodOptions.map(per => {
                let label = per.label
                if (per.id === 'full') label = t('tables.full_history')
                else if (per.id === 'recent') label = t('tables.recent_period')
                else if (per.id === 'trend') label = t('tables.annual_trend')
                else if (per.id === 'performance_matrix') label = 'Matriz de Desempeño'

                let icon = '📅'
                if (per.id === 'full') icon = '📜'
                else if (per.id === 'performance_matrix') icon = '📊'
                else if (per.id === 'trend') icon = '📈'
                else if (per.id === 'recent') icon = '⏱️'

                return (
                  <option key={per.id} value={per.id} style={{ background: 'var(--table-header-bg)', color: 'var(--text-main)' }}>
                    {icon} {label}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Table Search & Export */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 700 }}>
              {t('tables.quick_filter_label')}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                <input
                  type="text"
                  placeholder={t('tables.search_rows_placeholder')}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setPage(1)
                  }}
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 36px',
                    borderRadius: '10px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
              <button
                onClick={handleExportCSV}
                title={t('tables.export_csv_tooltip')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 14px',
                  borderRadius: '10px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid var(--accent-primary)',
                  color: 'var(--accent-primary)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                <Download size={15} />
                <span>CSV</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Conditional Rendering: Empty State vs Main Table View */}
      {!selectedPackage ? (
        <div className="glass-panel" style={{ padding: '60px 24px', textAlign: 'center', margin: '20px 0' }}>
          <FolderArchive size={48} color="var(--text-dim)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
            {t('tables.empty_selection_title')}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '500px', margin: '0 auto 20px', lineHeight: 1.6 }}>
            {packages.length > 0
              ? t('tables.empty_selection_desc_packages')
              : t('tables.empty_selection_desc_empty')}
          </p>
          {onGoToBuilder && (
            <button
              className="btn btn-primary"
              onClick={onGoToBuilder}
              style={{ margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <Search size={15} />
              <span>{t('tables.go_to_builder')}</span>
            </button>
          )}
        </div>
      ) : (
        /* Main Table View */
        <div className="card-panel" style={{ padding: '0', overflow: 'hidden' }}>
        {/* Header Summary */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.25rem' }}>
              {TABLE_OPTIONS.find(t => t.id === selectedTable)?.icon || '📊'}
            </span>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                {t('tables.entities.' + selectedTable) || TABLE_OPTIONS.find(t => t.id === selectedTable)?.name || selectedTable}
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: 0 }}>
                {selectedPeriod === 'full' ? t('tables.full_history') : (selectedPeriod === 'recent' ? t('tables.recent_period') : t('tables.annual_trend'))} • {tableData.total_rows.toLocaleString()} {t('tables.records_found')}
              </p>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* On-Demand ZIP Generation Button */}
            {(() => {
              const currentPkgInfo = packages.find(p => getPkgName(p) === selectedPackage)
              if (currentPkgInfo?.has_zip) {
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <a
                      href={resolveDownloadUrl(currentPkgInfo.download_url || `/api/indicators/download/${selectedPackage}`)}
                      download
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%)',
                        border: '1px solid #10b981',
                        color: '#34d399',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        textDecoration: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(16, 185, 129, 0.2)'
                      }}
                      title={`Descargar paquete comprimido (${currentPkgInfo.zip_size_mb} MB)`}
                    >
                      <Download size={13} />
                      <span>{t('tables.download_zip_btn', { size: currentPkgInfo.zip_size_mb })}</span>
                    </a>

                    <button
                      onClick={handleGenerateZip}
                      disabled={generatingZip}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-dim)',
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                      }}
                      title={t('tables.regenerate_zip_tooltip')}
                    >
                      <RefreshCw size={12} className={generatingZip ? 'animate-spin' : ''} />
                    </button>
                  </div>
                )
              } else {
                return (
                  <button
                    onClick={handleGenerateZip}
                    disabled={generatingZip}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.25) 0%, rgba(99, 102, 241, 0.25) 100%)',
                      border: '1px solid var(--accent-primary)',
                      color: 'var(--accent-primary)',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      boxShadow: '0 2px 10px rgba(56, 189, 248, 0.25)'
                    }}
                    title={t('tables.create_zip_tooltip')}
                  >
                    {generatingZip ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>{t('tables.generating_zip')}</span>
                      </>
                    ) : (
                      <>
                        <FolderArchive size={14} />
                        <span>{t('tables.generate_zip_btn')}</span>
                      </>
                    )}
                  </button>
                )
              }
            })()}

            {onGoToBuilder && (
              <button
                onClick={onGoToBuilder}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  background: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  color: 'var(--accent-primary)',
                  fontWeight: 600,
                  fontSize: '0.78rem',
                  cursor: 'pointer'
                }}
                title="Regresar a modificar filtros y recalcular"
              >
                <Search size={13} />
                <span>{t('tables.refine_corpus_btn')}</span>
              </button>
            )}

            {onOpenDownloads && (
              <button
                onClick={onOpenDownloads}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#6ee7b7',
                  fontWeight: 600,
                  fontSize: '0.78rem',
                  cursor: 'pointer'
                }}
                title="Ir al Centro de Descargas para descargar el paquete .ZIP"
              >
                <Download size={13} />
                <span>{t('tables.go_to_downloads')}</span>
              </button>
            )}

            <button
              onClick={() => handleOpenCitingModal('corpus', '', 'citing')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'rgba(251, 191, 36, 0.12)',
                border: '1px solid rgba(251, 191, 36, 0.4)',
                color: '#fbbf24',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
              title="Explorar todos los artículos citantes de este corpus"
            >
              <Sparkles size={14} />
              <span>{t('tables.citing_corpus_btn')}</span>
            </button>

            <button
              onClick={() => handleOpenCitingModal('corpus', '', 'references')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'rgba(129, 140, 248, 0.12)',
                border: '1px solid rgba(129, 140, 248, 0.4)',
                color: '#818cf8',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
              title="Explorar las referencias bibliográficas que fundamentan la totalidad de este corpus"
            >
              <BookOpen size={14} />
              <span>{t('tables.intellectual_base_btn')}</span>
            </button>

            {/* Pagination Top Indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '4px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                <span>{t('tables.page_label', { current: tableData.page, total: tableData.total_pages })}</span>
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-color)',
                    color: page <= 1 ? 'var(--text-muted)' : 'var(--text-main)',
                    cursor: page <= 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  disabled={page >= tableData.total_pages || loading}
                  onClick={() => setPage(p => Math.min(tableData.total_pages, p + 1))}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-color)',
                    color: page >= tableData.total_pages ? 'var(--text-muted)' : 'var(--text-main)',
                    cursor: page >= tableData.total_pages ? 'not-allowed' : 'pointer'
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--accent-primary)' }}>
            <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>{t('tables.loading_table')}</p>
          </div>
        )}

        {error && !loading && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#f87171' }}>
            <AlertCircle size={32} style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>{error}</p>
          </div>
        )}

        {/* Data Table */}
        {!loading && !error && tableData.data && (
          <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)', zIndex: 10, borderBottom: '2px solid var(--border-color)' }}>
                <tr>
                  {tableData.columns.map((col, idx) => {
                    const isSorted = sortBy === col
                    return (
                      <th
                        key={idx}
                        onClick={() => handleSort(col)}
                        style={{
                          padding: '12px 14px',
                          color: isSorted ? 'var(--accent-primary)' : 'var(--text-main)',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          userSelect: 'none',
                          borderRight: '1px solid rgba(255, 255, 255, 0.05)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: typeof tableData.data[0]?.[col] === 'number' ? 'flex-end' : 'flex-start' }}>
                          <span>{col}</span>
                          {isSorted ? (
                            sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                          ) : (
                            <ArrowUpDown size={12} style={{ opacity: 0.3 }} />
                          )}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {tableData.data.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      background: rowIdx % 2 === 0 ? 'rgba(255, 255, 255, 0.01)' : 'transparent',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.06)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = rowIdx % 2 === 0 ? 'rgba(255, 255, 255, 0.01)' : 'transparent'}
                  >
                    {tableData.columns.map((col, colIdx) => {
                      const val = row[col]
                      const isNumeric = typeof val === 'number'
                      const isNameCol = col === 'Name' || col.includes('Name') || col.includes('Title')
                      const isCitationCol = col === 'Times Cited' || col === 'Citations' || col.toLowerCase().includes('times cited')

                      return (
                        <td
                          key={colIdx}
                          style={{
                            padding: '10px 14px',
                            color: isNameCol ? 'var(--text-main)' : 'var(--text-dim)',
                            fontWeight: isNameCol ? 600 : 400,
                            textAlign: isNumeric ? 'right' : 'left',
                            whiteSpace: isNameCol ? 'normal' : 'nowrap',
                            maxWidth: isNameCol ? '280px' : 'none',
                            borderRight: '1px solid rgba(255, 255, 255, 0.02)'
                          }}
                        >
                          {isCitationCol && isNumeric && val > 0 ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                const entityName = row['Name'] || row['Title'] || row['Country'] || row['Source'] || ''
                                handleOpenCitingModal(selectedTable, entityName)
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '3px 9px',
                                borderRadius: '12px',
                                background: 'rgba(251, 191, 36, 0.12)',
                                border: '1px solid rgba(251, 191, 36, 0.4)',
                                color: '#fbbf24',
                                fontWeight: 800,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              title={`Explorar artículos citantes de ${row['Name'] || 'esta entidad'}`}
                            >
                              <span>{val.toLocaleString()}</span>
                              <Sparkles size={11} />
                            </button>
                          ) : (
                            formatCellValue(col, val)
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Bottom Pagination Bar */}
        {!loading && !error && tableData.total_pages > 1 && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0, 0, 0, 0.15)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              <span>{t('tables.showing_records', { start: ((page - 1) * pageSize) + 1, end: Math.min(page * pageSize, tableData.total_rows), total: tableData.total_rows.toLocaleString() })}</span>
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(1)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color)',
                  color: page <= 1 ? 'var(--text-muted)' : 'var(--text-main)',
                  fontSize: '0.8rem',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer'
                }}
              >
                {t('tables.first_page')}
              </button>
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color)',
                  color: page <= 1 ? 'var(--text-muted)' : 'var(--text-main)',
                  fontSize: '0.8rem',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer'
                }}
              >
                {t('tables.prev_page')}
              </button>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: '0.8rem', fontWeight: 700 }}>
                {page} / {tableData.total_pages}
              </span>
              <button
                disabled={page >= tableData.total_pages}
                onClick={() => setPage(p => Math.min(tableData.total_pages, p + 1))}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color)',
                  color: page >= tableData.total_pages ? 'var(--text-muted)' : 'var(--text-main)',
                  fontSize: '0.8rem',
                  cursor: page >= tableData.total_pages ? 'not-allowed' : 'pointer'
                }}
              >
                {t('tables.next_page')}
              </button>
              <button
                disabled={page >= tableData.total_pages}
                onClick={() => setPage(tableData.total_pages)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color)',
                  color: page >= tableData.total_pages ? 'var(--text-muted)' : 'var(--text-main)',
                  fontSize: '0.8rem',
                  cursor: page >= tableData.total_pages ? 'not-allowed' : 'pointer'
                }}
              >
                {t('tables.last_page')}
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Citing & References Modal */}
      <CitingWorksModal
        isOpen={citingModalOpen}
        onClose={() => setCitingModalOpen(false)}
        initialTab={citingModalInitialTab}
        packageName={selectedPackage}
        entityType={selectedCitingEntity.type}
        entityName={selectedCitingEntity.name}
        onSendToCorpus={onSendToCorpus}
        user={user}
      />
    </div>
  )
}
