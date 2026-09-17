import React, { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { useI18n } from '../i18n'
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
  Info,
  Download,
  FileText,
  Activity
} from 'lucide-react'

export default function PubmedControls({
  pubmedQuery,
  setPubmedQuery,
  startYear,
  setStartYear,
  endYear,
  setEndYear,
  allYears,
  setAllYears,
  onExecutePubmedSearch,
  isSearching,
  coverageStats,
  user
}) {
  const { t } = useI18n()
  const [subTab, setSubTab] = useState('assisted') // 'assisted' | 'advanced'
  const [meshCatalog, setMeshCatalog] = useState([])
  const [loadingCatalog, setLoadingCatalog] = useState(false)

  // Assisted Builder State
  const [keywordTerm, setKeywordTerm] = useState('')
  const [selectedMeshCategory, setSelectedMeshCategory] = useState('')
  const [countryFilter, setCountryFilter] = useState('Mexico')
  const [pubTypeFilter, setPubTypeFilter] = useState('')
  const [maxResults, setMaxResults] = useState(5000)

  // Volume Estimation State
  const [isEstimating, setIsEstimating] = useState(false)
  const [estimatedTotal, setEstimatedTotal] = useState(null)
  const [estimateError, setEstimateError] = useState(null)

  // Medline Download State
  const [isDownloadingMedline, setIsDownloadingMedline] = useState(false)

  // Cargar catálogo de categorías MeSH
  useEffect(() => {
    setLoadingCatalog(true)
    axios.get('/api/pubmed/mesh-catalog')
      .then(res => {
        setMeshCatalog(res.data.categories || [])
      })
      .catch(err => {
        console.warn('No se pudo cargar el catálogo MeSH:', err)
      })
      .finally(() => setLoadingCatalog(false))
  }, [])

  // Construir la consulta automática en modo asistido
  useEffect(() => {
    if (subTab !== 'assisted') return

    const parts = []
    if (keywordTerm.trim()) {
      parts.push(`"${keywordTerm.trim()}"[Title/Abstract]`)
    }
    if (selectedMeshCategory) {
      parts.push(`"${selectedMeshCategory}"[Mesh]`)
    }
    if (countryFilter.trim()) {
      parts.push(`"${countryFilter.trim()}"[Affiliation]`)
    }
    if (pubTypeFilter) {
      parts.push(`"${pubTypeFilter}"[Publication Type]`)
    }

    const built = parts.join(' AND ')
    setPubmedQuery(built)
  }, [keywordTerm, selectedMeshCategory, countryFilter, pubTypeFilter, subTab, setPubmedQuery])

  // Estimar volumen de documentos
  const handleEstimateVolume = async () => {
    if (!pubmedQuery.trim()) {
      alert('Por favor especifica o genera una consulta para PubMed.')
      return
    }
    setIsEstimating(true)
    setEstimateError(null)
    try {
      const res = await axios.post('/api/pubmed/estimate', {
        query: pubmedQuery.trim(),
        start_year: allYears ? undefined : startYear,
        end_year: allYears ? undefined : endYear
      })
      if (res.data.success) {
        setEstimatedTotal(res.data.total)
      } else {
        setEstimateError(res.data.error || 'Error al estimar volumen')
      }
    } catch (err) {
      setEstimateError(err.response?.data?.error || 'Error de conexión con PubMed')
    } finally {
      setIsEstimating(false)
    }
  }

  // Descargar directamente en texto plano oficial de MEDLINE
  const handleDownloadMedline = async () => {
    if (!pubmedQuery.trim()) {
      alert('Por favor especifica una consulta para exportar en texto plano MEDLINE.')
      return
    }
    setIsDownloadingMedline(true)
    try {
      const res = await axios.post('/api/pubmed/export-pubmed', {
        query: pubmedQuery.trim(),
        max_results: maxResults
      }, { responseType: 'blob' })

      const blob = new Blob([res.data], { type: 'text/plain;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pubmed_${Date.now()}.txt`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      alert('Error descargando texto plano Formato PubMed: ' + (err.message || 'Error del servidor'))
    } finally {
      setIsDownloadingMedline(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Selector de Subpestaña */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setSubTab('assisted')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: subTab === 'assisted' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              color: subTab === 'assisted' ? '#60a5fa' : '#94a3b8',
              border: subTab === 'assisted' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <Sparkles size={16} />
            Constructor Asistido MeSH
          </button>
          <button
            type="button"
            onClick={() => setSubTab('advanced')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: subTab === 'advanced' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              color: subTab === 'advanced' ? '#60a5fa' : '#94a3b8',
              border: subTab === 'advanced' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <Code2 size={16} />
            Consulta Avanzada Entrez
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(16, 185, 129, 0.1)', padding: '3px 8px', borderRadius: '6px' }}>
            <Activity size={12} /> NCBI E-Utilities 10 req/s
          </span>
        </div>
      </div>

      {/* Modo Asistido */}
      {subTab === 'assisted' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          {/* Término / Palabra Clave */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Término o Enfermedad</label>
            <input
              type="text"
              placeholder="Ej. Asthma, Diabetes, COVID-19"
              value={keywordTerm}
              onChange={(e) => setKeywordTerm(e.target.value)}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '0.6rem 0.8rem',
                color: '#f8fafc',
                fontSize: '0.85rem'
              }}
            />
          </div>

          {/* Categoría MeSH */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Categoría Temática MeSH</label>
            <select
              value={selectedMeshCategory}
              onChange={(e) => setSelectedMeshCategory(e.target.value)}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '0.6rem 0.8rem',
                color: '#f8fafc',
                fontSize: '0.85rem'
              }}
            >
              <option value="">-- Todas las Categorías MeSH --</option>
              {meshCatalog.map(cat => (
                <option key={cat.code} value={cat.name}>
                  {cat.name_es} ({cat.name})
                </option>
              ))}
            </select>
          </div>

          {/* País o Institución de Afiliación */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>País / Institución [Affiliation]</label>
            <input
              type="text"
              placeholder="Ej. Mexico, Spain, UNAM"
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '0.6rem 0.8rem',
                color: '#f8fafc',
                fontSize: '0.85rem'
              }}
            />
          </div>

          {/* Tipo de Publicación */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Tipo de Publicación</label>
            <select
              value={pubTypeFilter}
              onChange={(e) => setPubTypeFilter(e.target.value)}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '0.6rem 0.8rem',
                color: '#f8fafc',
                fontSize: '0.85rem'
              }}
            >
              <option value="">Todos los tipos</option>
              <option value="Journal Article">Journal Article (Artículo Científico)</option>
              <option value="Clinical Trial">Clinical Trial (Ensayo Clínico)</option>
              <option value="Review">Review (Revisión Sistemática)</option>
              <option value="Meta-Analysis">Meta-Analysis (Meta-análisis)</option>
              <option value="Case Reports">Case Reports (Reporte de Caso)</option>
            </select>
          </div>
        </div>
      )}

      {/* Editor de Consulta PubMed (Visible o editable según modo) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Code2 size={14} /> Sintaxis Oficial Entrez PubMed (Generada o Personalizada)
          </label>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Etiquetas admitidas: [Mesh], [Title/Abstract], [Author], [Affiliation], [Publication Type]
          </span>
        </div>
        <textarea
          rows={3}
          value={pubmedQuery}
          onChange={(e) => setPubmedQuery(e.target.value)}
          placeholder='Ej. ("Asthma"[Title/Abstract]) AND ("Mexico"[Affiliation]) AND ("Journal Article"[Publication Type])'
          style={{
            width: '100%',
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '8px',
            padding: '0.75rem',
            color: '#93c5fd',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            resize: 'vertical'
          }}
        />
      </div>

      {/* Rango de Años y Límite de Resultados */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', background: 'rgba(255, 255, 255, 0.03)', padding: '0.75rem 1rem', borderRadius: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Calendar size={14} /> Periodo:
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#cbd5e1', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={allYears}
              onChange={(e) => setAllYears(e.target.checked)}
            />
            Todos los años
          </label>

          {!allYears && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="number"
                value={startYear}
                onChange={(e) => setStartYear(parseInt(e.target.value) || 1990)}
                style={{ width: '80px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', padding: '0.3rem 0.5rem', color: '#fff', fontSize: '0.8rem' }}
              />
              <span style={{ color: '#64748b' }}>-</span>
              <input
                type="number"
                value={endYear}
                onChange={(e) => setEndYear(parseInt(e.target.value) || 2026)}
                style={{ width: '80px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', padding: '0.3rem 0.5rem', color: '#fff', fontSize: '0.8rem' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Máximo a descargar:</span>
            <select
              value={maxResults}
              onChange={(e) => setMaxResults(parseInt(e.target.value))}
              style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', padding: '0.3rem 0.5rem', color: '#fff', fontSize: '0.8rem' }}
            >
              <option value={1000}>1,000 docs</option>
              <option value={5000}>5,000 docs</option>
              <option value={10000}>10,000 docs</option>
              <option value={20000}>20,000 docs</option>
            </select>
          </div>
        </div>

        {/* Acciones de Estimación y Descarga */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Botón Estimar Volumen */}
          <button
            type="button"
            onClick={handleEstimateVolume}
            disabled={isEstimating || !pubmedQuery.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.85rem',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#e2e8f0',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              cursor: isEstimating ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {isEstimating ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} color="#f59e0b" />}
            Estimar Volumen
          </button>

          {/* Botón Exportar Texto Plano Formato PubMed (.txt) */}
          <button
            type="button"
            onClick={handleDownloadMedline}
            disabled={isDownloadingMedline || !pubmedQuery.trim()}
            title="Descarga directa en formato oficial de PubMed (.txt)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.85rem',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              background: 'rgba(168, 85, 247, 0.15)',
              color: '#c084fc',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              cursor: isDownloadingMedline ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {isDownloadingMedline ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            Exportar Formato PubMed (.txt)
          </button>

          {/* Botón Buscar y Descargar Corpus */}
          <button
            type="button"
            onClick={onExecutePubmedSearch}
            disabled={isSearching || !pubmedQuery.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.55rem 1.25rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
              color: '#ffffff',
              border: 'none',
              cursor: isSearching ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
              transition: 'all 0.2s ease'
            }}
          >
            {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
            {isSearching ? 'Descargando de PubMed...' : 'Descargar y Cruzar Metadatos'}
          </button>
        </div>
      </div>

      {/* Resultados de Estimación */}
      {estimatedTotal !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)', padding: '0.6rem 1rem', borderRadius: '8px' }}>
          <CheckCircle2 size={16} color="#60a5fa" />
          <span style={{ fontSize: '0.85rem', color: '#bfdbfe' }}>
            PubMed reporta <strong>{estimatedTotal.toLocaleString()}</strong> artículos para esta consulta.
          </span>
        </div>
      )}

      {estimateError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '0.6rem 1rem', borderRadius: '8px' }}>
          <AlertCircle size={16} color="#f87171" />
          <span style={{ fontSize: '0.85rem', color: '#fca5a5' }}>{estimateError}</span>
        </div>
      )}

      {/* Estadísticas de Cruce y Cobertura si están disponibles */}
      {coverageStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', background: 'rgba(15, 23, 42, 0.5)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Total en PubMed</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
              {(coverageStats.pubmed_total_found || 0).toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Descargados Completos</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#60a5fa' }}>
              {(coverageStats.pubmed_docs_fetched || 0).toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Cruzados con OpenAlex</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#10b981' }}>
              {(coverageStats.matched_in_openalex || 0).toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Tasa de Cobertura DOI</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fbbf24' }}>
              {coverageStats.coverage_pct || 0}%
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
