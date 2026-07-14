'use client'

interface Props {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  color?: string
  border?: string
  text?: string
  textMuted?: string
  surface?: string
}

export default function SwitchRow({
  label, description, checked, onChange,
  color = '#006064', border = 'rgba(0,0,0,0.1)', text = '#1a1c1b', textMuted = '#9ca3af', surface = '#ffffff',
}: Props) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '12px 14px', background: surface, cursor: 'pointer',
        border: `1.5px solid ${checked ? color : border}`, borderRadius: 12, marginBottom: 14,
      }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: checked ? color : text, margin: 0 }}>{label}</p>
        {description && <p style={{ fontSize: 11, color: textMuted, margin: '2px 0 0' }}>{description}</p>}
      </div>
      <div style={{ width: 40, height: 22, borderRadius: 11, flexShrink: 0, background: checked ? color : border, position: 'relative', transition: 'background 0.2s' }}>
        <div style={{
          position: 'absolute', top: 2, left: checked ? 20 : 2,
          width: 18, height: 18, borderRadius: '50%', background: surface,
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
    </div>
  )
}
