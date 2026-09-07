import React, { useState, useRef, useEffect } from "react"
import { Globe, ChevronDown, Check } from "lucide-react"
import { useI18n, AVAILABLE_LANGUAGES } from "../i18n"

export default function LanguageSelector() {
  const { lang, setLang } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  const current = AVAILABLE_LANGUAGES.find((l) => l.code === lang) || AVAILABLE_LANGUAGES[0]

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn-language-trigger"
        title="Cambiar idioma / Change language / Mudar idioma"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "8px",
          padding: "6px 10px",
          fontSize: "0.8rem",
          fontWeight: 600,
          color: "var(--text-main)",
          cursor: "pointer",
          transition: "all 0.2s ease"
        }}
      >
        <Globe size={15} style={{ color: "var(--accent-primary)" }} />
        <span style={{ fontSize: "0.78rem", fontWeight: 700 }}>{current.short}</span>
        <ChevronDown size={14} style={{ color: "var(--text-dim)", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 100,
            background: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "10px",
            boxShadow: "var(--shadow-md)",
            minWidth: "140px",
            padding: "4px",
            display: "flex",
            flexDirection: "column",
            gap: "2px"
          }}
        >
          {AVAILABLE_LANGUAGES.map((item) => {
            const isSelected = item.code === lang
            return (
              <button
                key={item.code}
                onClick={() => {
                  setLang(item.code)
                  setIsOpen(false)
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  background: isSelected ? "var(--bg-accent-subtle)" : "transparent",
                  border: "none",
                  color: isSelected ? "var(--accent-primary)" : "var(--text-main)",
                  fontSize: "0.82rem",
                  fontWeight: isSelected ? 700 : 500,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s ease"
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = "var(--bg-card-hover)"
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = "transparent"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "0.74rem", fontWeight: 800, color: isSelected ? "var(--accent-primary)" : "var(--text-dim)", fontFamily: "var(--font-mono)", width: "22px" }}>
                    {item.short}
                  </span>
                  <span>{item.label}</span>
                </div>
                {isSelected && <Check size={14} style={{ color: "var(--accent-primary)" }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
