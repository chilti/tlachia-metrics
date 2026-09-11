import { useI18n } from '../i18n'
import React, { useState, useMemo, useEffect } from 'react'
import {
  SlidersHorizontal,
  Sparkles,
  Calendar,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  Table,
  Check,
  Building2,
  Globe2,
  Users,
  BookOpen,
  DollarSign,
  Tag,
  Lightbulb,
  FileSpreadsheet,
  CheckSquare,
  Square,
  RotateCcw,
  Compass,
  Microscope,
  Award
} from 'lucide-react'

export const ENTITY_CATEGORIES = [
  {
    id: 'base',
    title: 'Base Global del Corpus',
    icon: '📦',
    entities: [
      { id: 'corpus', name: 'Corpus Completo (Baseline)', icon: '📦', desc: 'Métricas consolidadas de todo el corpus sin segmentar' }
    ]
  },
  {
    id: 'institutional',
    title: 'Estructura Institucional y Geográfica',
    icon: '🏢',
    entities: [
      { id: 'organizations', name: 'Organizaciones (Instituciones)', icon: '🏢', desc: 'Universidades, centros y dependencias' },
      { id: 'organizations_colab', name: 'Colaboraciones Institucionales', icon: '🤝', desc: 'Redes y co-afiliaciones interinstitucionales' },
      { id: 'sector_types', name: 'Tipos de Sector', icon: '🏭', desc: 'Educación, Salud, Gobierno, Empresa, etc.' },
      { id: 'locations', name: 'Países (Locations)', icon: '🌐', desc: 'Distribución geopolítica internacional' },
      { id: 'locations_subnational', name: 'Estados / Provincias', icon: '🗺️', desc: 'Desglose geográfico subnacional' }
    ]
  },
  {
    id: 'researchers',
    title: 'Investigadores, Fuentes y Financiamiento',
    icon: '👥',
    entities: [
      { id: 'researchers', name: 'Investigadores (Autores)', icon: '👥', desc: 'Producción, citas, H-index y FWCI por autor' },
      { id: 'publication_sources', name: 'Fuentes de Publicación (Revistas)', icon: '📚', desc: 'Revistas, actas y series editoriales' },
      { id: 'funding_agencies', name: 'Agencias de Financiamiento', icon: '🏛️', desc: 'Fondos y agencias patrocinadoras' }
    ]
  },
  {
    id: 'taxonomy',
    title: 'Taxonomía OpenAlex, ODS y Temáticas',
    icon: '🧭',
    entities: [
      { id: 'research_areas_domain', name: 'Dominios (Nivel 1)', icon: '🧭', desc: 'Grandes áreas del conocimiento' },
      { id: 'research_areas_field', name: 'Campos (Nivel 2)', icon: '🔬', desc: 'Campos disciplinares principales' },
      { id: 'research_areas_subfield', name: 'Subcampos (Nivel 3)', icon: '🏷️', desc: 'Especialidades disciplinares (ESI)' },
      { id: 'research_areas_topic', name: 'Tópicos (Research Fronts - Nivel 4)', icon: '🔍', desc: 'Frentes de investigación especializados' },
      { id: 'research_areas_sdg', name: 'Objetivos de Desarrollo Sostenible (ODS)', icon: '🎯', desc: 'Alineación con los 17 ODS de la ONU' },
      { id: 'concepts', name: 'Conceptos', icon: '💡', desc: 'Conceptos jerárquicos normalizados' },
      { id: 'keywords', name: 'Palabras Clave (Keywords)', icon: '🏷️', desc: 'Términos y descriptores textuales' }
    ]
  },
  {
    id: 'economics',
    title: 'Economía de la Publicación',
    icon: '💰',
    entities: [
      { id: 'economic_apc_breakdown', name: 'Desglose Económico APC', icon: '💰', desc: 'Gasto comercial en APC y ahorro Diamante' }
    ]
  }
]

export const ALL_ENTITY_IDS = ENTITY_CATEGORIES.flatMap(c => c.entities.map(e => e.id))

export const DEFAULT_ENTITIES = [
  'corpus',
  'organizations',
  'locations',
  'research_areas_topic',
  'publication_sources'
]

export default function MetricsConfigTab({
  previewData = { total: 0, results: [] },
  packageName = 'Mi_Corpus_TlachIA',
  setPackageName,
  timeWindowsConfig = {},
  setTimeWindowsConfig,
  onLaunchCalculation,
  onGoToBuilder,
  user,
  onOpenLoginModal
}) {
  const { t } = useI18n()

  const [windowSize, setWindowSize] = useState(() => timeWindowsConfig.windowSize || 5)
  const [windowMode, setWindowMode] = useState(() => timeWindowsConfig.windowMode || 'consecutive')
  const [anchorDirection, setAnchorDirection] = useState(() => timeWindowsConfig.anchorDirection || 'end')
  
  const detectedYears = useMemo(() => {
    // 1. Si previewData trae min_year y max_year calculados sobre el corpus completo
    if (previewData?.min_year && previewData?.max_year) {
      return { min: parseInt(previewData.min_year, 10), max: parseInt(previewData.max_year, 10) }
    }
    // 2. Si vienen en results o sample_results
    const list = previewData?.results || previewData?.sample_results || []
    if (list.length > 0) {
      const yrs = list
        .map(w => w.publication_year)
        .filter(y => y && !isNaN(y) && y >= 1900 && y <= 2030)
      if (yrs.length > 0) {
        return { min: Math.min(...yrs), max: Math.max(...yrs) }
      }
    }
    return { min: 2011, max: 2025 }
  }, [previewData])

  // Por defecto usar el periodo completo del corpus
  const [startYear, setStartYear] = useState(() => detectedYears.min)
  const [endYear, setEndYear] = useState(() => detectedYears.max)
  const [minDocs, setMinDocs] = useState(() => timeWindowsConfig.minDocs || 1)

  // Sincronizar automáticamente con el periodo completo del corpus cuando detectedYears cambie
  useEffect(() => {
    if (detectedYears.min && detectedYears.max) {
      setStartYear(detectedYears.min)
      setEndYear(detectedYears.max)
    }
  }, [detectedYears.min, detectedYears.max])
  
  const [generateFull, setGenerateFull] = useState(true)
  const [generateMatrix, setGenerateMatrix] = useState(true)
  const [generateIndividualPeriods, setGenerateIndividualPeriods] = useState(true)
  const [generateAnnualTrend, setGenerateAnnualTrend] = useState(true)
  const [selectedEntities, setSelectedEntities] = useState(() => DEFAULT_ENTITIES)

  const toggleEntity = (id) => {
    setSelectedEntities(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const selectPreset = (preset) => {
    switch (preset) {
      case 'default':
        setSelectedEntities(DEFAULT_ENTITIES)
        break
      case 'all':
        setSelectedEntities(ALL_ENTITY_IDS)
        break
      case 'basic':
        setSelectedEntities(['corpus', 'organizations', 'researchers', 'publication_sources'])
        break
      case 'thematic':
        setSelectedEntities(['corpus', 'research_areas_domain', 'research_areas_field', 'research_areas_subfield', 'research_areas_topic', 'research_areas_sdg', 'concepts', 'keywords'])
        break
      case 'institutional':
        setSelectedEntities(['corpus', 'organizations', 'organizations_colab', 'sector_types', 'locations', 'locations_subnational'])
        break
      case 'none':
        setSelectedEntities([])
        break
      default:
        break
    }
  }

  const calculatedPeriods = useMemo(() => {
    const s = parseInt(startYear, 10)
    const e = parseInt(endYear, 10)
    const w = Math.max(1, parseInt(windowSize, 10))

    if (isNaN(s) || isNaN(e) || isNaN(w) || s > e) return []

    const periods = []

    if (windowMode === 'consecutive') {
      if (anchorDirection === 'end') {
        let curEnd = e
        while (curEnd >= s) {
          const curStart = Math.max(s, curEnd - w + 1)
          periods.unshift([curStart, curEnd])
          curEnd = curStart - 1
        }
      } else {
        let curStart = s
        while (curStart <= e) {
          const curEnd = Math.min(e, curStart + w - 1)
          periods.push([curStart, curEnd])
          curStart = curEnd + 1
        }
      }
    } else {
      for (let curEnd = e; curEnd >= s + w - 1; curEnd -= 1) {
        const curStart = curEnd - w + 1
        periods.unshift([curStart, curEnd])
      }
      if (periods.length === 0 && e >= s) {
        periods.push([s, e])
      }
    }

    return periods
  }, [startYear, endYear, windowSize, windowMode, anchorDirection])

  useEffect(() => {
    if (setTimeWindowsConfig) {
      setTimeWindowsConfig({
        windowSize,
        windowMode,
        anchorDirection,
        startYear,
        endYear,
        minDocs,
        periods: calculatedPeriods,
        generateFull,
        generateMatrix,
        generateIndividualPeriods,
        generateAnnualTrend,
        selectedEntities
      })
    }
  }, [windowSize, windowMode, anchorDirection, startYear, endYear, minDocs, calculatedPeriods, generateFull, generateMatrix, generateIndividualPeriods, generateAnnualTrend, selectedEntities, setTimeWindowsConfig])

  const handleLaunch = () => {
    if (!user) {
      if (onOpenLoginModal) onOpenLoginModal()
      return
    }

    if (calculatedPeriods.length === 0) {
      alert(t('metrics.invalid_range_alert'))
      return
    }

    if (selectedEntities.length === 0) {
      alert('Debes seleccionar al menos una entidad para calcular métricas.')
      return
    }

    if (!generateFull && !generateIndividualPeriods && !generateMatrix && !generateAnnualTrend) {
      alert('Debes seleccionar al menos un tipo de tabla para calcular.')
      return
    }

    if (onLaunchCalculation) {
      onLaunchCalculation({
        time_windows: {
          window_size: windowSize,
          window_mode: windowMode,
          anchor_direction: anchorDirection,
          start_year: startYear,
          end_year: endYear,
          min_docs: minDocs,
          periods: calculatedPeriods,
          has_performance_matrix: generateMatrix
        },
        selected_entities: selectedEntities,
        table_types: {
          full: generateFull,
          periods: generateIndividualPeriods,
          performance_matrix: generateMatrix,
          trend: generateAnnualTrend
        }
      })
    }
  }

  const hasCorpus = previewData && previewData.total > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12) 0%, rgba(99, 102, 241, 0.12) 100%)',
        border: '1px solid rgba(56, 189, 248, 0.3)',
        borderRadius: '16px',
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(56, 189, 248, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-primary)',
            boxShadow: '0 0 15px rgba(56, 189, 248, 0.3)'
          }}>
            <SlidersHorizontal size={26} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                {t('metrics.title')}
              </h2>
              <span style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'rgba(56, 189, 248, 0.2)',
                color: 'var(--accent-primary)',
                fontWeight: 700
              }}>
                {t('metrics.step_indicator')}
              </span>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-dim)', margin: '4px 0 0' }}>
              {t('metrics.subtitle')}
            </p>
          </div>
        </div>

        {onGoToBuilder && (
          <button
            onClick={onGoToBuilder}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', padding: '10px 16px' }}
          >
            <Layers size={16} />
            <span>{t('metrics.back_to_builder')}</span>
          </button>
        )}
      </div>

      {!hasCorpus && (
        <div className="card-panel" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <AlertCircle size={44} color="#f59e0b" style={{ margin: '0 auto 12px', opacity: 0.8 }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '6px' }}>
            {t('metrics.no_active_corpus_title')}
          </h3>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', maxWidth: '500px', margin: '0 auto 18px' }}>
            {t('metrics.no_active_corpus_desc')}
          </p>
          {onGoToBuilder && (
            <button onClick={onGoToBuilder} className="btn btn-primary" style={{ padding: '10px 20px', fontWeight: 700 }}>
              <Layers size={16} />
              <span>{t('metrics.go_to_builder')}</span>
            </button>
          )}
        </div>
      )}

      {hasCorpus && (
        <>
          {/* Active Corpus Summary Card */}
          <div className="card-panel" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ flex: '1 1 300px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 700 }}>
                  🏷️ {t('metrics.package_name_input_label')}
                </label>
                <input
                  type="text"
                  value={packageName}
                  onChange={(e) => setPackageName && setPackageName(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, '_'))}
                  placeholder={t('metrics.package_name_placeholder')}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    fontSize: '0.95rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ background: 'var(--bg-card-hover)', padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{t('metrics.total_articles')}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                    {previewData.total.toLocaleString()}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-card-hover)', padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{t('metrics.detected_range')}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>
                    {detectedYears.min} – {detectedYears.max}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Time Windows Controls Section */}
          <div className="card-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={20} color="var(--accent-primary)" />
              <span>{t('metrics.window_config_title')}</span>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              
              {/* Window Size Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
                  {t('metrics.window_size_label')}
                </label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  {[3, 5, 2, 4].map(ws => (
                    <button
                      key={ws}
                      type="button"
                      onClick={() => setWindowSize(ws)}
                      className={`btn ${windowSize === ws ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem', fontWeight: 700 }}
                    >
                      {ws} {t('metrics.years_unit')}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>{t('metrics.custom_label')}</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={windowSize}
                    onChange={(e) => setWindowSize(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{
                      width: '80px',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.85rem',
                      fontWeight: 700
                    }}
                  />
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>{t('metrics.years_per_interval')}</span>
                </div>
              </div>

              {/* Year Range Selectors */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
                  {t('metrics.time_horizon_label')}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '4px' }}>{t('metrics.start_year')}</span>
                    <input
                      type="number"
                      min="1950"
                      max="2030"
                      value={startYear}
                      onChange={(e) => setStartYear(parseInt(e.target.value, 10) || 2011)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.9rem',
                        fontWeight: 700
                      }}
                    />
                  </div>
                  <div style={{ color: 'var(--text-dim)', paddingTop: '16px' }}>—</div>
                  <div style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '4px' }}>{t('metrics.end_year')}</span>
                    <input
                      type="number"
                      min="1950"
                      max="2030"
                      value={endYear}
                      onChange={(e) => setEndYear(parseInt(e.target.value, 10) || 2025)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.9rem',
                        fontWeight: 700
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setStartYear(detectedYears.min)
                      setEndYear(detectedYears.max)
                    }}
                    style={{
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      borderRadius: '6px',
                      color: 'var(--accent-primary)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      padding: '3px 8px',
                      fontWeight: 700
                    }}
                  >
                    ↺ {t('metrics.full_corpus_period')} ({detectedYears.min}–{detectedYears.max})
                  </button>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>•</span>
                  <button
                    type="button"
                    onClick={() => {
                      setStartYear(Math.max(detectedYears.min, detectedYears.max - 14))
                      setEndYear(detectedYears.max)
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '0.75rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                  >
                    {t('metrics.last_15_years')}
                  </button>
                </div>
              </div>

              {/* Window Mode & Anchor */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
                  {t('metrics.segmentation_mode_label')}
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer', color: windowMode === 'consecutive' ? 'var(--text-main)' : 'var(--text-dim)' }}>
                    <input
                      type="radio"
                      name="windowMode"
                      checked={windowMode === 'consecutive'}
                      onChange={() => setWindowMode('consecutive')}
                    />
                    <span><strong>{t('metrics.consecutive_disjoint')}</strong> {t('metrics.consecutive_sub')}</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer', color: windowMode === 'rolling' ? 'var(--text-main)' : 'var(--text-dim)' }}>
                    <input
                      type="radio"
                      name="windowMode"
                      checked={windowMode === 'rolling'}
                      onChange={() => setWindowMode('rolling')}
                    />
                    <span><strong>{t('metrics.sliding_windows')}</strong> {t('metrics.sliding_sub')}</span>
                  </label>
                </div>

                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{t('metrics.anchor_label')}</span>
                  <button
                    type="button"
                    onClick={() => setAnchorDirection(anchorDirection === 'end' ? 'start' : 'end')}
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    {anchorDirection === 'end' ? t('metrics.anchor_end') : t('metrics.anchor_start')}
                  </button>
                </div>
              </div>

            </div>

            {/* Dynamic Interactive Period Preview Timeline */}
            <div style={{ marginTop: '24px', background: 'var(--bg-input)', borderRadius: '12px', padding: '18px 20px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={18} color="var(--accent-primary)" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    {t('metrics.resulting_periods_title')} ({calculatedPeriods.length} {calculatedPeriods.length === 1 ? t('metrics.period_singular') : t('metrics.period_plural')})
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  {t('metrics.timeline_sub')}
                </span>
              </div>

              {calculatedPeriods.length === 0 ? (
                <div style={{ color: '#f87171', fontSize: '0.85rem' }}>
                  {t('metrics.invalid_range')}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  {calculatedPeriods.map(([s, e], idx) => (
                    <React.Fragment key={`${s}-${e}`}>
                      <div style={{
                        background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%)',
                        border: '1px solid var(--accent-primary)',
                        borderRadius: '10px',
                        padding: '8px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                      }}>
                        <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700 }}>
                          {t('metrics.period_label')} {idx + 1}
                        </span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                          {s} – {e}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--accent-primary)', marginTop: '2px' }}>
                          {e - s + 1} {e - s + 1 === 1 ? t('metrics.year_singular') : t('metrics.year_plural')}
                        </span>
                      </div>

                      {idx < calculatedPeriods.length - 1 && (
                        <ArrowRight size={18} color="var(--accent-primary)" style={{ opacity: 0.7 }} />
                      )}
                    </React.Fragment>
                  ))}

                  <div style={{ marginLeft: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.72rem', padding: '4px 8px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-dim)' }}>
                      + {t('metrics.full_history_badge')}
                    </span>
                    {generateMatrix && (
                      <span style={{ fontSize: '0.72rem', padding: '4px 8px', borderRadius: '6px', background: 'rgba(167, 139, 250, 0.2)', color: '#a78bfa', fontWeight: 700 }}>
                        {t('metrics.performance_matrix_badge')}
                      </span>
                    )}
                    {generateAnnualTrend && (
                      <span style={{ fontSize: '0.72rem', padding: '4px 8px', borderRadius: '6px', background: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent-primary)' }}>
                        + {t('metrics.annual_trend_badge')}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* 1. Selector de Tipos de Tablas a Generar */}
          <div className="card-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={20} color="#a78bfa" />
              <span>{t('metrics.table_types_section') || 'Tipos de Tablas a Generar'}</span>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              
              {/* Checkboxes de Tipos de Tablas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={generateFull}
                    onChange={(e) => setGenerateFull(e.target.checked)}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {t('metrics.gen_full_title') || 'Histórico Completo (Full / Baseline)'}
                    </span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '2px 0 0' }}>
                      {t('metrics.gen_full_desc') || 'Agregación total acumulada del corpus completo para cada entidad seleccionada.'}
                    </p>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={generateIndividualPeriods}
                    onChange={(e) => setGenerateIndividualPeriods(e.target.checked)}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {t('metrics.gen_individual_title')}
                    </span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '2px 0 0' }}>
                      {t('metrics.gen_individual_desc')} ({calculatedPeriods.map(p => `${p[0]}-${p[1]}`).join(', ')}).
                    </p>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={generateMatrix}
                    onChange={(e) => setGenerateMatrix(e.target.checked)}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {t('metrics.gen_matrix_title')}
                    </span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '2px 0 0' }}>
                      {t('metrics.gen_matrix_desc')}
                    </p>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={generateAnnualTrend}
                    onChange={(e) => setGenerateAnnualTrend(e.target.checked)}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {t('metrics.gen_trend_title')}
                    </span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '2px 0 0' }}>
                      {t('metrics.gen_trend_desc')}
                    </p>
                  </div>
                </label>
              </div>

              {/* Thresholds & Pushdown Info */}
              <div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                    {t('metrics.min_docs_title')}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={minDocs}
                      onChange={(e) => setMinDocs(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      style={{
                        width: '80px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.9rem',
                        fontWeight: 700
                      }}
                    />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                      {t('metrics.min_docs_desc')}
                    </span>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-card-hover)', borderRadius: '10px', padding: '14px 18px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--accent-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⚡</span>
                    <span>Cálculo 100% Pushdown en ClickHouse</span>
                  </div>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', margin: 0, lineHeight: 1.4 }}>
                    El cálculo se ejecuta en ClickHouse sin transferir registros completos. La descarga de obras individuales queda reservada para el Gestor de Descargas.
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* 2. Selector Modular de Entidades Analizadas */}
          <div className="card-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={20} color="var(--accent-primary)" />
                  <span>{t('metrics.entity_selector_title') || 'Entidades a Incluir en el Cálculo'}</span>
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: '4px 0 0' }}>
                  {t('metrics.entity_selector_sub') || 'Selecciona qué dimensiones cienciométricas deseas calcular en esta corrida.'}
                </p>
              </div>

              {/* Badge Contador de Entidades */}
              <div style={{
                background: selectedEntities.length > 0 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${selectedEntities.length > 0 ? 'var(--accent-primary)' : '#ef4444'}`,
                borderRadius: '20px',
                padding: '4px 12px',
                fontSize: '0.8rem',
                fontWeight: 800,
                color: selectedEntities.length > 0 ? 'var(--accent-primary)' : '#ef4444'
              }}>
                {selectedEntities.length} / {ALL_ENTITY_IDS.length} {t('metrics.entities_selected_badge') || 'entidades seleccionadas'}
              </div>
            </div>

            {/* Barra de Presets Rápidos */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              background: 'var(--bg-input)',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              marginBottom: '20px'
            }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '4px' }}>
                {t('metrics.presets_label') || 'Atajos:'}
              </span>

              <button
                type="button"
                onClick={() => selectPreset('default')}
                style={{
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid var(--accent-primary)',
                  color: 'var(--accent-primary)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ⭐ {t('metrics.preset_default') || 'Por defecto (5)'}
              </button>

              <button
                type="button"
                onClick={() => selectPreset('all')}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                💎 {t('metrics.preset_all') || 'Todas (17)'}
              </button>

              <button
                type="button"
                onClick={() => selectPreset('basic')}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ⚡ {t('metrics.preset_basic') || 'Básico (4)'}
              </button>

              <button
                type="button"
                onClick={() => selectPreset('thematic')}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                🧭 {t('metrics.preset_thematic') || 'Temático (8)'}
              </button>

              <button
                type="button"
                onClick={() => selectPreset('institutional')}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                🏛️ {t('metrics.preset_institutional') || 'Institucional (6)'}
              </button>

              <button
                type="button"
                onClick={() => selectPreset('none')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim)',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginLeft: 'auto',
                  textDecoration: 'underline'
                }}
              >
                {t('metrics.preset_clear') || 'Deseleccionar todas'}
              </button>
            </div>

            {/* Bloques de Categorías de Entidades */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {ENTITY_CATEGORIES.map(category => (
                <div key={category.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '16px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{category.icon}</span>
                    <span>{category.title}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                    {category.entities.map(ent => {
                      const isSelected = selectedEntities.includes(ent.id)
                      return (
                        <div
                          key={ent.id}
                          onClick={() => toggleEntity(ent.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            background: isSelected ? 'rgba(56, 189, 248, 0.08)' : 'var(--bg-input)',
                            border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            userSelect: 'none'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // Manejado por onClick del contenedor
                            style={{ marginTop: '3px', cursor: 'pointer' }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: isSelected ? 'var(--text-main)' : 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{ent.icon}</span>
                              <span>{ent.name}</span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '2px', lineHeight: 1.3 }}>
                              {ent.desc}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {selectedEntities.length === 0 && (
              <div style={{ marginTop: '16px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid #ef4444', color: '#f87171', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={18} />
                <span>Debes seleccionar al menos una entidad para ejecutar el cálculo.</span>
              </div>
            )}
          </div>

          {/* Launch Action Footer */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, rgba(56, 189, 248, 0.15) 0%, rgba(167, 139, 250, 0.15) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: '16px',
            padding: '20px 28px',
            flexWrap: 'wrap',
            gap: '16px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
          }}>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {t('metrics.ready_to_launch_title')}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                {t('metrics.ready_to_launch_will_compute')} <strong>{selectedEntities.length} entidades</strong> sobre <strong>{calculatedPeriods.length} {t('metrics.ready_to_launch_periods_consecutive')}</strong> con ClickHouse Pushdown nativo.
              </div>
            </div>

            <button
              onClick={handleLaunch}
              disabled={selectedEntities.length === 0 || (!generateFull && !generateIndividualPeriods && !generateMatrix && !generateAnnualTrend)}
              className="btn btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '14px 28px',
                fontSize: '1rem',
                fontWeight: 800,
                boxShadow: '0 0 20px rgba(56, 189, 248, 0.4)',
                cursor: selectedEntities.length > 0 ? 'pointer' : 'not-allowed',
                opacity: selectedEntities.length > 0 ? 1 : 0.5
              }}
            >
              <Sparkles size={20} />
              <span>{t('metrics.btn_launch')}</span>
            </button>
          </div>
        </>
      )}

    </div>
  )
}
