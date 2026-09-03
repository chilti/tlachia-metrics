import React, { useState, useEffect } from 'react'
import axios from 'axios'
import {
  FolderArchive,
  Save,
  Trash2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Layers,
  ArrowRight,
  Sparkles,
  BookOpen,
  Filter,
  Star,
  FileCode2,
  Hash
} from 'lucide-react'

export default function CorpusManagerModal({
  isOpen,
  onClose,
  mode = 'list', // 'list' | 'save'
  currentCorpusState = {},
  onLoadCorpus,
  user
}) {
  const [activeTab, setActiveTab] = useState(mode)
  const [savedCorpuses, setSavedCorpuses] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Save Form State
  const [corpusName, setCorpusName] = useState(currentCorpusState.corpusName || '')
  const [description, setDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setActiveTab(mode)
    if (mode === 'save' && currentCorpusState.corpusName) {
      setCorpusName(currentCorpusState.corpusName)
    }
  }, [mode, currentCorpusState])

  useEffect(() => {
    if (isOpen) {
      fetchSavedCorpuses()
      setSuccessMsg(null)
      setError(null)
    }
  }, [isOpen])

  const fetchSavedCorpuses = () => {
    setLoading(true)
    axios.get('/api/corpus/saved')
      .then(res => {
        setSavedCorpuses(res.data.corpuses || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Error fetching saved corpuses:', err)
        setError(err.response?.data?.error || 'Error al listar corpus guardados.')
        setLoading(false)
      })
  }

  const handleSaveCurrentCorpus = (e) => {
    e.preventDefault()
    if (!corpusName.trim()) {
      setError('Por favor asigna un nombre a este corpus.')
      return
    }

    setIsSaving(true)
    setError(null)

    const payload = {
      corpus_name: corpusName.trim(),
      description: description.trim(),
      source_mode: currentCorpusState.sourceMode || 'filters',
      filters: currentCorpusState.filters || {},
      ids_list: currentCorpusState.idsList || [],
      total_works_estimated: currentCorpusState.totalWorksEstimated || 0,
      owner_name: user?.name || user?.orcid || 'Investigador'
    }

    axios.post('/api/corpus/save', payload)
      .then(res => {
        setIsSaving(false)
        setSuccessMsg(`¡Corpus "${corpusName}" guardado exitosamente!`)
        fetchSavedCorpuses()
        setTimeout(() => {
          setActiveTab('list')
          setSuccessMsg(null)
        }, 1200)
      })
      .catch(err => {
        console.error('Error saving corpus:', err)
        setError(err.response?.data?.error || 'Error al guardar el corpus.')
        setIsSaving(false)
      })
  }

  const handleDeleteCorpus = (corpusId, name) => {
    if (!window.confirm(`¿Estás seguro de eliminar el corpus guardado "${name}"?`)) return

    axios.delete(`/api/corpus/saved/${corpusId}/delete`)
      .then(() => {
        setSavedCorpuses(prev => prev.filter(c => c.corpus_id !== corpusId))
      })
      .catch(err => {
        console.error('Error deleting corpus:', err)
        alert(err.response?.data?.error || 'No se pudo eliminar el corpus.')
      })
  }

  const handleSelectCorpus = (corpus) => {
    if (onLoadCorpus) {
      onLoadCorpus(corpus)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-card, #111827)',
          border: '1px solid var(--border-color, #374151)',
          borderRadius: '20px',
          padding: '28px',
          maxWidth: '750px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          position: 'relative',
          color: 'var(--text-main, #f3f4f6)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent-primary)' }}>
              <FolderArchive size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                Administrador de Corpus Guardados
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: 0 }}>
                Espacio de trabajo persistente para {user?.name || user?.orcid || 'tu cuenta'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Switches */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
          <button
            onClick={() => setActiveTab('list')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'list' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              color: activeTab === 'list' ? 'var(--accent-primary)' : 'var(--text-dim)',
              fontWeight: activeTab === 'list' ? 700 : 500,
              cursor: 'pointer',
              fontSize: '0.88rem'
            }}
          >
            📂 Mis Corpus ({savedCorpuses.length})
          </button>
          <button
            onClick={() => setActiveTab('save')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'save' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              color: activeTab === 'save' ? 'var(--accent-primary)' : 'var(--text-dim)',
              fontWeight: activeTab === 'save' ? 700 : 500,
              cursor: 'pointer',
              fontSize: '0.88rem'
            }}
          >
            💾 Guardar Corpus Actual
          </button>
        </div>

        {/* Alert Messages */}
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#6ee7b7', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* TAB 1: LIST */}
        {activeTab === 'list' && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '55vh', paddingRight: '4px' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--accent-primary)' }}>
                <Loader2 size={30} className="animate-spin" style={{ margin: '0 auto 10px' }} />
                <p style={{ fontSize: '0.85rem' }}>Cargando corpus guardados...</p>
              </div>
            ) : savedCorpuses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                <FolderArchive size={40} style={{ opacity: 0.4, margin: '0 auto 12px' }} />
                <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>No tienes ningún corpus guardado aún</p>
                <p style={{ fontSize: '0.8rem' }}>Puedes delimitar criterios en el Conformador y guardarlo para reutilizarlo en cualquier momento.</p>
                <button
                  onClick={() => setActiveTab('save')}
                  style={{
                    marginTop: '12px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'var(--accent-primary)',
                    color: '#0f172a',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Guardar configuración actual
                </button>
              </div>
            ) : (
              savedCorpuses.map(corpus => (
                <div
                  key={corpus.corpus_id}
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    transition: 'border-color 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                          {corpus.corpus_name}
                        </span>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: corpus.source_mode === 'ids' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(56, 189, 248, 0.15)',
                            color: corpus.source_mode === 'ids' ? '#c084fc' : 'var(--accent-primary)',
                            fontWeight: 700
                          }}
                        >
                          {corpus.source_mode === 'ids' ? 'DOIs / IDs' : (corpus.source_mode === 'upload' ? 'Archivo' : 'Filtros')}
                        </span>
                        {corpus.lineage_type === 'intellectual_base' && (
                          <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(129, 140, 248, 0.2)', color: '#818cf8', fontWeight: 700 }}>
                            📚 Base Intelectual
                          </span>
                        )}
                        {corpus.lineage_type === 'citing_impact' && (
                          <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', fontWeight: 700 }}>
                            ✨ Impacto (Citantes)
                          </span>
                        )}
                      </div>
                      {corpus.description && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: 0 }}>
                          {corpus.description}
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleSelectCorpus(corpus)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '7px 14px',
                          borderRadius: '8px',
                          background: 'var(--accent-primary)',
                          color: '#0f172a',
                          fontWeight: 800,
                          fontSize: '0.8rem',
                          border: 'none',
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(56, 189, 248, 0.3)'
                        }}
                      >
                        <span>Cargar</span>
                        <ArrowRight size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteCorpus(corpus.corpus_id, corpus.corpus_name)}
                        style={{
                          padding: '7px 10px',
                          borderRadius: '8px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          color: '#f87171',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          cursor: 'pointer'
                        }}
                        title="Eliminar este corpus"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Metadata Chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>📅 Guardado: {corpus.updated_at || corpus.created_at}</span>
                    {corpus.total_works_estimated > 0 && (
                      <span>• 📊 ~{corpus.total_works_estimated.toLocaleString()} obras</span>
                    )}
                    {corpus.parent_corpus_id && (
                      <span style={{ color: 'var(--text-dim)' }}>• 🔗 Derivado de: <strong style={{ color: '#fff' }}>{corpus.parent_corpus_id}</strong></span>
                    )}
                    {corpus.filters?.country_code && (
                      <span>• 🇲🇽 País: {corpus.filters.country_code}</span>
                    )}
                    {corpus.filters?.fields && (
                      <span>• 🔬 Campos: {Array.isArray(corpus.filters.fields) ? corpus.filters.fields.join(', ') : corpus.filters.fields}</span>
                    )}
                    {corpus.filters?.start_year && (
                      <span>• ⏳ Años: {corpus.filters.start_year} - {corpus.filters.end_year}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: SAVE */}
        {activeTab === 'save' && (
          <form onSubmit={handleSaveCurrentCorpus} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                Nombre del Corpus *
              </label>
              <input
                type="text"
                placeholder="Ej. Producción Científica Medicina México 2018-2024"
                value={corpusName}
                onChange={(e) => setCorpusName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '10px',
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  fontSize: '0.9rem',
                  fontWeight: 600
                }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                Descripción o Notas (Opcional)
              </label>
              <textarea
                placeholder="Notas de contexto o metodología utilizada para este corpus..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem'
                }}
              />
            </div>

            {/* Current Summary Preview */}
            <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', fontSize: '0.82rem' }}>
              <div style={{ fontWeight: 700, color: 'var(--accent-primary)', marginBottom: '4px' }}>
                Resumen de criterios a guardar:
              </div>
              <p style={{ margin: '0 0 6px', color: 'var(--text-dim)' }}>
                Modo: <strong>{currentCorpusState.sourceMode === 'ids' ? 'DOIs / Work IDs' : (currentCorpusState.sourceMode === 'upload' ? 'Archivo Subido' : 'Filtros Paramétricos')}</strong>
                {currentCorpusState.totalWorksEstimated > 0 && ` • Obras estimadas: ~${currentCorpusState.totalWorksEstimated.toLocaleString()}`}
              </p>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 20px',
                borderRadius: '10px',
                background: 'var(--accent-primary)',
                color: '#0f172a',
                border: 'none',
                fontWeight: 800,
                fontSize: '0.92rem',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(56, 189, 248, 0.3)'
              }}
            >
              {isSaving ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save size={18} />
                  <span>Guardar Corpus en Mi Espacio</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
