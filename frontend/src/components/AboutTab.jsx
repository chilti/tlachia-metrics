import React, { useState, useEffect } from 'react'
import axios from 'axios'
import {
  Sparkles,
  Database,
  Users,
  Building2,
  ExternalLink,
  Layers,
  Cpu,
  Clock,
  Calendar,
  CheckCircle2,
  FileCode2,
  GitBranch,
  ShieldCheck,
  Globe2,
  SlidersHorizontal,
  FolderArchive
} from 'lucide-react'
import { useI18n } from '../i18n'

export default function AboutTab() {
  const { t } = useI18n()
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    axios.get('/api/info')
      .then(res => {
        if (mounted && res.data) {
          setInfo(res.data)
        }
      })
      .catch(err => {
        console.warn('No se pudo consultar /api/info:', err)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [])

  return (
    <div style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.75rem'
    }}>
      {/* ── 1. Encabezado de la Plataforma ── */}
      <div className="card glass-panel" style={{
        padding: '2rem',
        borderRadius: '16px',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid var(--border-color)',
        background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.06) 0%, rgba(99, 102, 241, 0.04) 100%)',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: '20px',
            background: 'rgba(2, 132, 199, 0.12)',
            color: 'var(--accent-primary)',
            border: '1px solid rgba(2, 132, 199, 0.3)'
          }}>
            v2.0 Arquitectura Ecosistémica
          </span>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: '20px',
            background: 'rgba(16, 185, 129, 0.12)',
            color: '#10b981',
            border: '1px solid rgba(16, 185, 129, 0.3)'
          }}>
            Ciencia Abierta UNAM
          </span>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: '20px',
            background: 'rgba(139, 92, 246, 0.12)',
            color: '#a855f7',
            border: '1px solid rgba(139, 92, 246, 0.3)'
          }}>
            Motor ClickHouse Pushdown
          </span>
        </div>

        <h1 style={{
          fontSize: '1.85rem',
          fontWeight: 800,
          margin: '0 0 0.5rem 0',
          letterSpacing: '-0.02em',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem'
        }}>
          <Sparkles style={{ color: 'var(--accent-primary)' }} size={28} />
          {t('about_section.title')}
        </h1>

        <p style={{
          fontSize: '0.98rem',
          color: 'var(--text-muted)',
          lineHeight: 1.6,
          margin: 0,
          maxWidth: '960px'
        }}>
          {t('about_section.subtitle')}. Un desarrollo de ciencia abierta diseñado por la <strong>Facultad de Ciencias</strong> y el <strong>Centro de Ciencias de la Complejidad (C3)</strong> de la Universidad Nacional Autónoma de México (UNAM).
        </p>
      </div>

      {/* ── 2. Ficha Informativa: Snapshot Oficial de OpenAlex ── */}
      <div className="card glass-panel" style={{
        padding: '1.75rem',
        borderRadius: '16px',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(2, 132, 199, 0.03) 100%)',
        boxShadow: '0 8px 25px rgba(16, 185, 129, 0.08)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.25rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)'
            }}>
              <Database size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                {t('about_section.snapshot_title')}
              </h2>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {t('about_section.snapshot_subtitle')}
              </span>
            </div>
          </div>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '6px 14px',
            borderRadius: '20px',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            fontSize: '0.82rem',
            fontWeight: 700,
            color: '#10b981'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 8px #10b981'
            }} />
            <span>{t('about_section.status_connected')}</span>
          </div>
        </div>

        {/* Grid de 4 tarjetas de la ficha del snapshot */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem'
        }}>
          {/* Versión del Snapshot */}
          <div style={{
            background: 'var(--bg-card, rgba(0,0,0,0.2))',
            padding: '1.1rem 1.25rem',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              <Calendar size={14} style={{ color: '#10b981' }} />
              <span>{t('about_section.snapshot_version')}</span>
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#10b981' }}>
              {info?.openalex_release || 'OpenAlex Snapshot 2026-09-23'}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Release Trimestral Oficial (Septiembre 2026)
            </span>
          </div>

          {/* Cobertura Global */}
          <div style={{
            background: 'var(--bg-card, rgba(0,0,0,0.2))',
            padding: '1.1rem 1.25rem',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              <Globe2 size={14} style={{ color: 'var(--accent-primary)' }} />
              <span>{t('about_section.global_coverage')}</span>
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
              569 Millones de Obras
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              337 Millones de Autores y Coautorías
            </span>
          </div>

          {/* Motor Analítico */}
          <div style={{
            background: 'var(--bg-card, rgba(0,0,0,0.2))',
            padding: '1.1rem 1.25rem',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              <Cpu size={14} style={{ color: '#f59e0b' }} />
              <span>{t('about_section.engine_type')}</span>
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
              ClickHouse Pushdown Engine
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Servidor Columnar (10.90.0.87:8124 / rag)
            </span>
          </div>

          {/* Capacidades Analíticas */}
          <div style={{
            background: 'var(--bg-card, rgba(0,0,0,0.2))',
            padding: '1.1rem 1.25rem',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              <Layers size={14} style={{ color: '#8b5cf6' }} />
              <span>Capacidades Analíticas</span>
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
              45 Indicadores Cienciométricos
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              FWCI, Top 10%, Top 1%, OA y Gini
            </span>
          </div>
        </div>
      </div>

      {/* ── 3. Autores del Sistema & Dirección Científica ── */}
      <div className="card glass-panel" style={{
        padding: '1.75rem',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem' }}>
          <Users size={22} style={{ color: 'var(--accent-primary)' }} />
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
              {t('about_section.authors_title')}
            </h2>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {t('about_section.authors_subtitle')}
            </span>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '1.25rem'
        }}>
          {/* Dr. Humberto Andrés Carrillo Calvet */}
          <div style={{
            background: 'var(--bg-card, rgba(0,0,0,0.2))',
            padding: '1.25rem 1.5rem',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem'
          }}>
            <div>
              <div style={{ fontSize: '1.08rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Dr. Humberto Andrés Carrillo Calvet
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', fontWeight: 600, marginTop: '2px' }}>
                {t('about_section.role_carrillo')}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
                {t('about_section.affil_fc_c3')}
              </div>
            </div>

            <a
              href="https://orcid.org/0000-0003-3659-6769"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.82rem',
                color: '#a6ce39',
                background: 'rgba(166, 206, 57, 0.1)',
                border: '1px solid rgba(166, 206, 57, 0.3)',
                padding: '6px 12px',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 600,
                width: 'fit-content'
              }}
            >
              <span>🆔 ORCID: 0000-0003-3659-6769</span>
              <ExternalLink size={13} />
            </a>
          </div>

          {/* Dr. José Luis Jiménez Andrade */}
          <div style={{
            background: 'var(--bg-card, rgba(0,0,0,0.2))',
            padding: '1.25rem 1.5rem',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem'
          }}>
            <div>
              <div style={{ fontSize: '1.08rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Dr. José Luis Jiménez Andrade
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', fontWeight: 600, marginTop: '2px' }}>
                {t('about_section.role_jimenez')}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
                {t('about_section.affil_fc_c3')}
              </div>
            </div>

            <a
              href="https://orcid.org/0000-0003-3453-7159"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.82rem',
                color: '#a6ce39',
                background: 'rgba(166, 206, 57, 0.1)',
                border: '1px solid rgba(166, 206, 57, 0.3)',
                padding: '6px 12px',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 600,
                width: 'fit-content'
              }}
            >
              <span>🆔 ORCID: 0000-0003-3453-7159</span>
              <ExternalLink size={13} />
            </a>
          </div>
        </div>
      </div>

      {/* ── 4. Agradecimientos Especiales & Infraestructura ── */}
      <div className="card glass-panel" style={{
        padding: '1.5rem',
        borderRadius: '16px',
        border: '1px solid rgba(245, 158, 11, 0.25)',
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.04) 0%, rgba(2, 132, 199, 0.03) 100%)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.65rem' }}>
          <Building2 size={20} style={{ color: '#f59e0b' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
            {t('about_section.infrastructure_title')}
          </h3>
        </div>
        <p style={{
          fontSize: '0.88rem',
          lineHeight: 1.65,
          color: 'var(--text-muted)',
          margin: 0
        }}>
          {t('about_section.infrastructure_desc')}
        </p>
      </div>
    </div>
  )
}
