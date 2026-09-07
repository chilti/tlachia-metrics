import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useI18n } from '../i18n'
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
  Hash,
  FileSpreadsheet,
  RefreshCw,
  Plus
} from 'lucide-react'

export default function CorpusManagerModal({
  isOpen,
  onClose,
  mode = 'list', // 'list' | 'save'
  currentCorpusState = {},
  onLoadCorpus,
  onOpenTables,
  packages = [],
  user
}) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState(mode)
  const [savedCorpuses, setSavedCorpuses] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Save Form State
  const [corpusName, setCorpusName] = useState('')
  const [description, setDescription] = useState('')
  const [saveAsNew, setSaveAsNew] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setActiveTab(mode)
    if (mode === 'save') {
      setCorpusName(currentCorpusState.corpusName || '')
      setDescription(currentCorpusState.description || '')
      setSaveAsNew(false)
    }
  }, [mode, currentCorpusState, isOpen])

  useEffect(() => {
    if (isOpen) {
      fetchSavedCorpuses()
      setSuccessMsg(null)
      setError(null)
    }
  }, [isOpen])

  const getActiveUser = () => {
    if (user?.orcid) return user
    try {
      const saved = localStorage.getItem('tlachia_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  }

  const fetchSavedCorpuses = () => {
    const activeUser = getActiveUser()
    const targetOrcid = activeUser?.orcid || ''
    setLoading(true)
    setError(null)
    const url = targetOrcid ? `/api/corpus/list?user_orcid=${encodeURIComponent(targetOrcid)}` : '/api/corpus/list'
    axios.get(url, {
      headers: targetOrcid ? { 'X-User-ORCID': targetOrcid, 'X-User-Name': activeUser?.name || '' } : {}
    })
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
      setError(t('modals.corpus.error_name_required'))
      return
    }

    const activeUser = getActiveUser()
    const targetOrcid = activeUser?.orcid || ''
    if (!targetOrcid) {
      setError(t('modals.corpus.error_orcid_required'))
      return
    }

    setIsSaving(true)
    setError(null)

    const corpusIdToSave = (!saveAsNew && currentCorpusState.corpusId) ? currentCorpusState.corpusId : null

    const payload = {
      corpus_id: corpusIdToSave,
      corpus_name: corpusName.trim(),
      description: description.trim(),
      source_mode: currentCorpusState.sourceMode || 'filters',
      filters: currentCorpusState.filters || {},
      ids_list: currentCorpusState.idsList || [],
      total_works_estimated: currentCorpusState.totalWorksEstimated || 0,
      parent_corpus_id: currentCorpusState.parentCorpusId || null,
      lineage_type: currentCorpusState.lineageType || 'standalone',
      owner_name: activeUser?.name || targetOrcid || 'Investigador',
      user_orcid: targetOrcid,
      owner_orcid: targetOrcid
    }

    axios.post('/api/corpus/save', payload, {
      headers: { 'X-User-ORCID': targetOrcid, 'X-User-Name': activeUser?.name || '' }
    })
      .then(res => {
        setIsSaving(false)
        setSuccessMsg(corpusIdToSave ? t('modals.corpus.success_updated', { name: corpusName }) : t('modals.corpus.success_saved', { name: corpusName }))
        fetchSavedCorpuses()
        setTimeout(() => {
          setActiveTab('list')
          setSuccessMsg(null)
        }, 1000)
      })
      .catch(err => {
        console.error('Error saving corpus:', err)
        setError(err.response?.data?.error || 'Error al guardar el corpus.')
        setIsSaving(false)
      })
  }

  const handleDeleteCorpus = (corpusId, name) => {
    if (!window.confirm(t('modals.corpus.delete_confirm', { name }))) return
    const activeUser = getActiveUser()
    const targetOrcid = activeUser?.orcid || ''

    axios.delete(`/api/corpus/saved/${corpusId}/delete?user_orcid=${encodeURIComponent(targetOrcid)}`, {
      headers: targetOrcid ? { 'X-User-ORCID': targetOrcid, 'X-User-Name': activeUser?.name || '' } : {}
    })
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
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                {t('modals.corpus.manager_title')}
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: 0 }}>
                {t('modals.corpus.manager_subtitle', { user: user?.name || user?.orcid || t('modals.corpus.your_account') })}
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
            {t('modals.corpus.tab_my_corpora', { count: savedCorpuses.length })}
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
            {t('modals.corpus.tab_save_current')}
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
                <p style={{ fontSize: '0.85rem' }}>{t('modals.corpus.loading')}</p>
              </div>
            ) : savedCorpuses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                <FolderArchive size={40} style={{ opacity: 0.4, margin: '0 auto 12px' }} />
                <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>{t('modals.corpus.empty_title')}</p>
                <p style={{ fontSize: '0.8rem' }}>{t('modals.corpus.empty_desc')}</p>
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
                  {t('modals.corpus.save_current_config')}
                </button>
              </div>
            ) : (
              savedCorpuses.map(corpus => {
                const matchingPkg = packages.find(p => (p.package_name || p.name) === corpus.corpus_name)
                return (
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' }}>
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
                              {t('modals.corpus.badge_intellectual_base')}
                            </span>
                          )}
                          {corpus.lineage_type === 'citing_impact' && (
                            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', fontWeight: 700 }}>
                              {t('modals.corpus.badge_citing_impact')}
                            </span>
                          )}
                          {(corpus.lineage_type === 'scopus_custom' || corpus.source_mode === 'scopus') && (
                            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', fontWeight: 700 }}>
                              {t('modals.corpus.badge_scopus_query')}
                            </span>
                          )}
                          {matchingPkg && (
                            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontWeight: 700, border: '1px solid rgba(16, 185, 129, 0.35)' }}>
                              {t('modals.corpus.badge_metrics_ready')}
                            </span>
                          )}
                        </div>
                        {corpus.description && (
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: 0 }}>
                            {corpus.description}
                          </p>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {matchingPkg && onOpenTables && (
                          <button
                            onClick={() => onOpenTables(corpus.corpus_name)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '7px 12px',
                              borderRadius: '8px',
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: '#34d399',
                              border: '1px solid rgba(16, 185, 129, 0.4)',
                              fontWeight: 700,
                              fontSize: '0.78rem',
                              cursor: 'pointer'
                            }}
                            title="Ver tablas analíticas calculadas de este corpus"
                          >
                            <FileSpreadsheet size={14} />
                            <span>{t('modals.corpus.btn_view_tables')}</span>
                          </button>
                        )}
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
                          <span>{t('modals.corpus.btn_load')}</span>
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
                      <span>{t('modals.corpus.meta_saved')} {corpus.updated_at || corpus.created_at}</span>
                      {corpus.total_works_estimated > 0 && (
                        <span>{t('modals.corpus.meta_works', { count: corpus.total_works_estimated.toLocaleString() })}</span>
                      )}
                      {corpus.parent_corpus_id && (
                        <span style={{ color: 'var(--text-dim)' }}>{t('modals.corpus.meta_derived_from')} <strong style={{ color: 'var(--text-main)' }}>{corpus.parent_corpus_id}</strong></span>
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
                )
              })
            )}
          </div>
        )}

        {/* TAB 2: SAVE */}
        {activeTab === 'save' && (
          <form onSubmit={handleSaveCurrentCorpus} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Mode Switcher when editing an existing loaded corpus */}
            {currentCorpusState.corpusId && (
              <div style={{
                padding: '12px 16px',
                borderRadius: '10px',
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
                    {t('modals.corpus.editing_notice')}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 600 }}>
                    {currentCorpusState.corpusName}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setSaveAsNew(false)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: !saveAsNew ? 'var(--accent-primary)' : 'rgba(255,255,255,0.06)',
                      color: !saveAsNew ? '#0f172a' : 'var(--text-dim)'
                    }}
                  >
                    <RefreshCw size={13} />
                    <span>{t('modals.corpus.btn_overwrite')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaveAsNew(true)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: saveAsNew ? 'var(--accent-primary)' : 'rgba(255,255,255,0.06)',
                      color: saveAsNew ? '#0f172a' : 'var(--text-dim)'
                    }}
                  >
                    <Plus size={13} />
                    <span>{t('modals.corpus.btn_save_as_new')}</span>
                  </button>
                </div>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
                {t('modals.corpus.field_name')}
              </label>
              <input
                type="text"
                placeholder={t('modals.corpus.field_name_placeholder')}
                value={corpusName}
                onChange={(e) => setCorpusName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '10px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  fontSize: '0.9rem',
                  fontWeight: 600
                }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
                {t('modals.corpus.field_desc')}
              </label>
              <textarea
                placeholder={t('modals.corpus.field_desc_placeholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem'
                }}
              />
            </div>

            {/* Current Summary Preview */}
            <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', fontSize: '0.82rem' }}>
              <div style={{ fontWeight: 700, color: 'var(--accent-primary)', marginBottom: '4px' }}>
                {t('modals.corpus.summary_title')}
              </div>
              <p style={{ margin: '0 0 6px', color: 'var(--text-dim)' }}>
                {t('modals.corpus.mode_label')} <strong>{currentCorpusState.sourceMode === 'ids' ? t('modals.corpus.mode_ids') : (currentCorpusState.sourceMode === 'upload' ? t('modals.corpus.mode_upload') : t('modals.corpus.mode_filters'))}</strong>
                {currentCorpusState.totalWorksEstimated > 0 && ` ${t('modals.corpus.estimated_works', { count: currentCorpusState.totalWorksEstimated.toLocaleString() })}`}
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
                  <span>{t('modals.corpus.btn_saving')}</span>
                </>
              ) : (!saveAsNew && currentCorpusState.corpusId) ? (
                <>
                  <RefreshCw size={18} />
                  <span>{t('modals.corpus.btn_update')}</span>
                </>
              ) : (
                <>
                  <Save size={18} />
                  <span>{t('modals.corpus.btn_save_new')}</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
