import React, { useState } from 'react';
import axios from 'axios';
import { X, ExternalLink, Loader2, CheckCircle, ShieldCheck, Sparkles, FolderArchive, Lock } from 'lucide-react';

export default function OrcidLoginModal({ isOpen, onClose, reason = 'general' }) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleConnectOrcid = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await axios.get('/api/auth/orcid/url');
      if (res.data && res.data.auth_url) {
        window.location.href = res.data.auth_url;
      } else {
        setErrorMsg('No se pudo generar el enlace de autenticación con ORCID.');
        setLoading(false);
      }
    } catch (err) {
      console.error('Error initiating ORCID OAuth:', err);
      setErrorMsg('Error de comunicación con el servidor al iniciar sesión con ORCID.');
      setLoading(false);
    }
  };

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
          padding: '36px',
          maxWidth: '520px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          color: 'var(--text-main, #f3f4f6)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '18px',
            right: '18px',
            background: 'none',
            border: 'none',
            color: 'var(--text-dim, #9ca3af)',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <X size={20} />
        </button>

        {/* Header with ORCID Badge */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '68px',
              height: '68px',
              borderRadius: '50%',
              backgroundColor: 'rgba(166, 206, 57, 0.15)',
              border: '2px solid #a6ce39',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#a6ce39',
              fontWeight: '900',
              fontSize: '28px',
              boxShadow: '0 0 25px rgba(166, 206, 57, 0.3)'
            }}
          >
            iD
          </div>

          <h2 style={{ fontSize: '1.35rem', fontWeight: '800', marginBottom: '8px' }}>
            Autenticación de Investigador
          </h2>

          <p style={{ fontSize: '0.9rem', color: 'var(--text-dim, #9ca3af)', lineHeight: '1.5' }}>
            {reason === 'job_creation' ? (
              <>Para conformar corpus y generar paquetes de 45 indicadores analíticos, conecta tu identificador oficial de <strong>ORCID</strong>.</>
            ) : reason === 'downloads' ? (
              <>Tu <strong>Centro de Descargas</strong> personal guarda y organiza tus paquetes .ZIP asociados a tu registro de investigador.</>
            ) : (
              <>Identifícate con tu cuenta <strong>ORCID</strong> para acceder a los servicios de cómputo analítico y descarga de corpus en TlachIA Metrics.</>
            )}
          </p>
        </div>

        {/* Benefits list */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            fontSize: '0.85rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FolderArchive size={16} color="var(--accent-primary, #38bdf8)" />
            <span><strong>Centro de Descargas Exclusivo:</strong> Acceso a tus paquetes generados.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles size={16} color="#a6ce39" />
            <span><strong>Cálculo de 45 Indicadores:</strong> Excel y Parquets automáticos.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck size={16} color="#10b981" />
            <span><strong>Acceso Verificado:</strong> Whitelist restringida por padrón institucional.</span>
          </div>
        </div>

        {errorMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              color: '#fca5a5',
              fontSize: '0.85rem',
              textAlign: 'center'
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Connect Button */}
        <button
          onClick={handleConnectOrcid}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '14px 20px',
            borderRadius: '12px',
            backgroundColor: '#a6ce39',
            color: '#111827',
            border: 'none',
            fontSize: '0.95rem',
            fontWeight: '800',
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 16px rgba(166, 206, 57, 0.35)',
            transition: 'all 0.2s ease',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Conectando con ORCID...</span>
            </>
          ) : (
            <>
              <span style={{ fontWeight: '900', fontSize: '18px' }}>iD</span>
              <span>Conectar con ORCID</span>
              <ExternalLink size={16} />
            </>
          )}
        </button>

        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-dim, #9ca3af)', margin: 0 }}>
          Solo se solicitarán permisos de lectura pública para validar tu identidad académica.
        </p>
      </div>
    </div>
  );
}
