import React from "react"
import { Sun, Moon } from "lucide-react"
import { useI18n } from "../i18n"

export default function ThemeToggle({ theme, onToggle }) {
  const { t } = useI18n()
  const isDark = theme === "dark"

  return (
    <button
      onClick={onToggle}
      className="theme-toggle-btn"
      title={isDark ? t("app.theme_light") : t("app.theme_dark")}
      aria-label={isDark ? t("app.theme_light") : t("app.theme_dark")}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "36px",
        height: "36px",
        borderRadius: "8px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
        color: isDark ? "#fbbf24" : "#0284c7",
        cursor: "pointer",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: "var(--shadow-sm)"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-card-hover)"
        e.currentTarget.style.transform = "scale(1.05)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-card)"
        e.currentTarget.style.transform = "scale(1)"
      }}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
