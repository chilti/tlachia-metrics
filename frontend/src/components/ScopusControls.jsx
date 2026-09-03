import React, { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import {
  Search,
  Sparkles,
  BookOpen,
  Filter,
  Layers,
  Globe,
  HelpCircle,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowRight,
  Code2,
  Calendar,
  Zap,
  Info
} from 'lucide-react'

export default function ScopusControls({
  scopusQuery,
  setScopusQuery,
  startYear,
  setStartYear,
  endYear,
  setEndYear,
  allYears,
  setAllYears,
  onExecuteScopusSearch,
  isSearching,
  coverageStats,
  user
}) {
  const [subTab, setSubTab] = useState('assisted') // 'assisted' | 'advanced'
  const [asjcCatalog, setAsjcCatalog] = useState({ areas: [], subareas: [] })
  const [loadingCatalog, setLoadingCatalog] = useState(false)

  // Assisted Builder State
  const [selectedAreaCode, setSelectedAreaCode] = useState('')
  const [selectedSubareaCode, setSelectedSubareaCode] = useState('')
  const [subareaSearch, setSubareaSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('Mexico')
  const [keywordTerm, setKeywordTerm] = useState('')

  // Volume Estimation State
  const [isEstimating, setIsEstimating] = useState(false)
  const [estimatedTotal, setEstimatedTotal] = useState(null)
  const [estimateError, setEstimateError] = useState(null)

  // Load ASJC Catalog from Backend
  useEffect(() => {
    setLoadingCatalog(true)
    axios.get('/api/scopus/asjc-catalog')
      .then(res => {
        setAsjcCatalog({
          areas: res.data.areas || [],
          subareas: res.data.subareas || []
        })
        if (res.data.areas?.length > 0) {
          setSelectedAreaCode(res.data.areas[0].code)
        }
        setLoadingCatalog(false)
      })
      .catch(err => {
        console.error('Error fetching ASJC catalog:', err)
        setLoadingCatalog(false)
      })
  }, [])

  // Filter Subareas by Search Text
  const filteredSubareas = useMemo(() => {
    if (!subareaSearch.trim()) return asjcCatalog.subareas
    const q = subareaSearch.toLowerCase()
    return asjcCatalog.subareas.filter(s =>
      s.name.toLowerCase().includes(q) || s.code.includes(q)
    )
  }, [asjcCatalog.subareas, subareaSearch])

  // Sync Assisted Form to Scopus Query String
  const handleApplyAssistedQuery = () => {
    const parts = []

    if (keywordTerm.trim()) {
      parts.push(`TITLE-ABS-KEY("${keywordTerm.trim()}")`)
    }

    if (selectedSubareaCode) {
      parts.push(`SUBJTERMS(${selectedSubareaCode})`)
    } else if (selectedAreaCode) {
      parts.push(`SUBJAREA(${selectedAreaCode})`)
    }

    if (countryFilter.trim()) {
      parts.push(`AFFILCOUNTRY("${countryFilter.trim()}")`)
    }

    const generated = parts.length > 0 ? parts.join(' AND ') : ''
    setScopusQuery(generated)
    setEstimatedTotal(null)
    setEstimateError(null)
  }

  // Insert Syntax Token at cursor position or append
  const handleInsertToken = (token) => {
    setScopusQuery(prev => {
      const trimmed = prev.trim()
      if (!trimmed) return token
      return `${trimmed} ${token}`
    })
    setEstimatedTotal(null)
    setEstimateError(null)
  }

  // Estimate Volume via Elsevier API
  const handleEstimateVolume = () => {
    if (!scopusQuery.trim()) {
      setEstimateError('Ingresa o genera una consulta de Scopus primero.')
      return
    }

    setIsEstimating(true)
    setEstimateError(null)
    setEstimatedTotal(null)

    axios.post('/api/scopus/estimate', {
      query: scopusQuery.trim(),
      start_year: allYears ? undefined : startYear,
      end_year: allYears ? undefined : endYear
    })
      .then(res => {
        setEstimatedTotal(res.data.total)
        setIsEstimating(false)
      })
      .catch(err => {
        console.error('Error estimating Scopus volume:', err)
        setEstimateError(err.response?.data?.error || 'Error al validar la consulta en la API de Scopus.')
        setIsEstimating(false)
      })
  }

  // Preset Template Examples
  const handleLoadPreset = (presetKey) => {
    if (presetKey === 'unam_recent') {
      setScopusQuery('AFFIL("Universidad Nacional Autonoma de Mexico")')
      setStartYear(2020)
      setEndYear(2025)
      setAllYears(false)
    } else if (presetKey === 'ai_mexico') {
      setScopusQuery('TITLE-ABS-KEY("artificial intelligence" OR "machine learning" OR "deep learning") AND AFFILCOUNTRY("Mexico")')
      setStartYear(2018)
      setEndYear(2025)
      setAllYears(false)
    } else if (presetKey === 'health_mexico') {
      setScopusQuery('SUBJAREA(MEDI) AND AFFILCOUNTRY("Mexico")')
      setStartYear(2020)
      setEndYear(2024)
      setAllYears(false)
    }
    setEstimatedTotal(null)
    setEstimateError(null)
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.15) 0%, rgba(15, 23, 42, 0.4) 100%)',
      border: '1px solid rgba(59, 130, 246, 0.35)',
      borderRadius: '16px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      position: 'relative'
    }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            padding: '8px',
            borderRadius: '10px',
            background: 'rgba(59, 130, 246, 0.2)',
            color: '#60a5fa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Database size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: '#93c5fd' }}>
              Motor de Búsqueda Scopus API (Elsevier)
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: 0 }}>
              Recupera documentos indizados en Scopus y enriquécelos automáticamente con los tópicos, ODS y métricas de OpenAlex.
            </p>
          </div>
        </div>

        {/* Sub-tab Switcher */}
        <div style={{
          display: 'flex',
          background: 'rgba(0, 0, 0, 0.3)',
          padding: '3px',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <button
            type="button"
            onClick={() => setSubTab('assisted')}
            style={{
              padding: '6px 14px',
              borderRadius: '7px',
              border: 'none',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: subTab === 'assisted' ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
              color: subTab === 'assisted' ? '#60a5fa' : 'var(--text-dim)',
              transition: 'all 0.2s ease'
            }}
          >
            🎯 Asistente por Áreas ASJC
          </button>
          <button
            type="button"
            onClick={() => setSubTab('advanced')}
            style={{
              padding: '6px 14px',
              borderRadius: '7px',
              border: 'none',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: subTab === 'advanced' ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
              color: subTab === 'advanced' ? '#60a5fa' : 'var(--text-dim)',
              transition: 'all 0.2s ease'
            }}
          >
            📝 Query Avanzado Scopus
          </button>
        </div>
      </div>

      {/* TAB 1: ASJC ASSISTED BUILDER */}
      {subTab === 'assisted' && (
        <div style={{
          background: 'rgba(0, 0, 0, 0.2)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
            {/* 1. Keyword Term */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '5px', color: 'var(--text-main)' }}>
                Términos en Título / Resumen / Keywords
              </label>
              <input
                type="text"
                placeholder='Ej. "machine learning", dengue, renewable energy'
                value={keywordTerm}
                onChange={(e) => setKeywordTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem'
                }}
              />
            </div>

            {/* 2. Scopus Area (27) */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '5px', color: 'var(--text-main)' }}>
                Área de Investigación Scopus (27 Áreas)
              </label>
              <select
                value={selectedAreaCode}
                onChange={(e) => {
                  setSelectedAreaCode(e.target.value)
                  setSelectedSubareaCode('')
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem'
                }}
              >
                <option value="">-- Toda Área Disciplinar --</option>
                {asjcCatalog.areas.map(a => (
                  <option key={a.code} value={a.code}>
                    {a.code} - {a.name_es || a.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. ASJC Subarea (334) */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '5px', color: 'var(--text-main)' }}>
                Sub-Área Específica ASJC (334 Códigos)
              </label>
              <select
                value={selectedSubareaCode}
                onChange={(e) => setSelectedSubareaCode(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem'
                }}
              >
                <option value="">-- Sin sub-área específica --</option>
                {filteredSubareas.map(s => (
                  <option key={s.code} value={s.code}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Country Filter */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '5px', color: 'var(--text-main)' }}>
                País de Afiliación (AFFILCOUNTRY)
              </label>
              <input
                type="text"
                placeholder="Ej. Mexico, Brazil, Spain"
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              onClick={handleApplyAssistedQuery}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.25)',
                color: '#93c5fd',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              <Zap size={14} />
              <span>Generar y Transferir al Query Scopus</span>
            </button>
          </div>
        </div>
      )}

      {/* SCOPUS QUERY TEXTAREA & SYNTAX CONTROLS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Code2 size={16} style={{ color: '#60a5fa' }} />
            <span>Consulta Scopus (Sintaxis Oficial Elsevier):</span>
          </label>

          {/* Quick Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Plantillas Rápidas:</span>
            <button
              type="button"
              onClick={() => handleLoadPreset('ai_mexico')}
              style={{
                fontSize: '0.7rem',
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              🤖 IA en México
            </button>
            <button
              type="button"
              onClick={() => handleLoadPreset('health_mexico')}
              style={{
                fontSize: '0.7rem',
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              🩺 Medicina México
            </button>
            <button
              type="button"
              onClick={() => handleLoadPreset('unam_recent')}
              style={{
                fontSize: '0.7rem',
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              🏛️ UNAM
            </button>
          </div>
        </div>

        {/* Syntax Insertion Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {[
            { label: 'TITLE-ABS-KEY(...)', val: 'TITLE-ABS-KEY("")' },
            { label: 'AUTH(...)', val: 'AUTH("")' },
            { label: 'AFFIL(...)', val: 'AFFIL("")' },
            { label: 'AFFILCOUNTRY(...)', val: 'AFFILCOUNTRY("Mexico")' },
            { label: 'SRCTITLE(...)', val: 'SRCTITLE("")' },
            { label: 'SUBJAREA(...)', val: 'SUBJAREA(MEDI)' },
            { label: 'SUBJTERMS(...)', val: 'SUBJTERMS(1702)' },
            { label: 'AND', val: 'AND' },
            { label: 'OR', val: 'OR' },
            { label: 'AND NOT', val: 'AND NOT' },
            { label: 'W/3 (Proximidad)', val: 'W/3' }
          ].map(pill => (
            <button
              key={pill.label}
              type="button"
              onClick={() => handleInsertToken(pill.val)}
              style={{
                fontSize: '0.72rem',
                padding: '3px 8px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                color: '#93c5fd',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              + {pill.label}
            </button>
          ))}
        </div>

        <textarea
          rows={3}
          value={scopusQuery}
          onChange={(e) => {
            setScopusQuery(e.target.value)
            setEstimatedTotal(null)
            setEstimateError(null)
          }}
          placeholder='Ej. TITLE-ABS-KEY("artificial intelligence" AND "radiology") AND AFFILCOUNTRY("Mexico")'
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: '10px',
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            color: '#f8fafc',
            fontFamily: 'monospace',
            fontSize: '0.88rem',
            lineHeight: 1.4
          }}
        />
      </div>

      {/* Temporal Bounds & Actions Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        paddingTop: '6px'
      }}>
        {/* Temporal Bounds */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            <Calendar size={15} />
            <span>Período:</span>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={allYears}
              onChange={(e) => setAllYears(e.target.checked)}
            />
            <span>Todos los años</span>
          </label>

          {!allYears && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="number"
                min={1950}
                max={2026}
                value={startYear}
                onChange={(e) => setStartYear(parseInt(e.target.value) || 2015)}
                style={{
                  width: '70px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border-color)',
                  color: '#fff',
                  fontSize: '0.8rem'
                }}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>a</span>
              <input
                type="number"
                min={1950}
                max={2026}
                value={endYear}
                onChange={(e) => setEndYear(parseInt(e.target.value) || 2026)}
                style={{
                  width: '70px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border-color)',
                  color: '#fff',
                  fontSize: '0.8rem'
                }}
              />
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={handleEstimateVolume}
            disabled={isEstimating || !scopusQuery.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 15px',
              borderRadius: '9px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: 'var(--text-main)',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: isEstimating || !scopusQuery.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {isEstimating ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Estimando en Scopus...</span>
              </>
            ) : (
              <>
                <Search size={15} />
                <span>Estimar Volumen</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onExecuteScopusSearch}
            disabled={isSearching || !scopusQuery.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 20px',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              border: 'none',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: 800,
              cursor: isSearching || !scopusQuery.trim() ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
              transition: 'all 0.2s ease'
            }}
          >
            {isSearching ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Descargando y Cruzando con OpenAlex...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>Consultar y Cruzar con OpenAlex</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Alerts & Estimation Output */}
      {estimateError && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid #ef4444',
          color: '#fca5a5',
          fontSize: '0.82rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertCircle size={16} />
          <span>{estimateError}</span>
        </div>
      )}

      {estimatedTotal !== null && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          color: '#a7f3d0',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={18} style={{ color: '#34d399' }} />
            <span>
              Volumen estimado en Scopus API: <strong style={{ fontSize: '1rem', color: '#fff' }}>{estimatedTotal.toLocaleString()}</strong> documentos encontrados.
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#6ee7b7' }}>
            Listo para descargar y cruzar con OpenAlex ClickHouse.
          </span>
        </div>
      )}

      {/* Cross-Reference Coverage Card */}
      {coverageStats && (
        <div style={{
          padding: '14px 18px',
          borderRadius: '12px',
          background: 'rgba(56, 189, 248, 0.1)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={18} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Resultados del Cruce Scopus ➜ OpenAlex Local:
              </span>
            </div>
            <span style={{
              fontSize: '0.78rem',
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.2)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.4)'
            }}>
              {coverageStats.coverage_pct}% Cobertura
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            <span>📥 Scopus (Total): <strong style={{ color: '#fff' }}>{coverageStats.scopus_total_found.toLocaleString()}</strong></span>
            <span>⚡ OpenAlex (Enriquecidos): <strong style={{ color: '#38bdf8' }}>{coverageStats.matched_in_openalex.toLocaleString()}</strong></span>
            {coverageStats.unmatched_dois_count > 0 && (
              <span>⚠️ No identificados en OpenAlex: <strong style={{ color: '#fca5a5' }}>{coverageStats.unmatched_dois_count.toLocaleString()}</strong></span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
