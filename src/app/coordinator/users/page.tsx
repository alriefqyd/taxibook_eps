'use client'

import { useEffect, useState } from 'react'
import { useNavRouter as useRouter } from '@/hooks/useNavRouter'
import { createClient } from '@/lib/supabase/client'
import type { User, Role } from '@/types'
import { useLang } from '@/lib/language'

const PRIMARY = '#006064'

const MSG = {
  en: {
    title:          'Users',
    totalActive:    (total: number, active: number) => `${total} total · ${active} active`,
    addUser:        'Add User',
    searchPlaceholder: 'Search name or email...',
    allRoles:       'All roles',
    noUsers:        'No users found',
    edit:           'Edit',
    deactivate:     'Deactivate',
    activate:       'Activate',
    inactive:       'Inactive',
    detail:         'Detail',
    detailTitle:    'Trip Details',
    totalTrips:     'Total Trips',
    completed:      'Completed',
    cancelled:      'Cancelled',
    rejected:       'Rejected',
    active:         'Active / Pending',
    cancelRate:     'Cancellation Rate',
    recentTrips:    'Recent Trips',
    noTrips:        'No trips yet',
    loadingDetail:  'Loading...',
    editTitle:      'Edit User',
    addTitle:       'Add New User',
    fieldName:      'Full Name',
    fieldEmail:     'Work Email',
    fieldPassword:  'Temporary Password',
    fieldRole:      'Role',
    fieldPhone:     'Phone (optional)',
    minPassword:    'Password must be at least 6 characters',
    saving:         'Saving...',
    saveChanges:    'Save Changes',
    createUser:     'Create User',
    updateFailed:   'Update failed',
    createFailed:   'Create failed',
    roleStaff:      'Staff',
    roleCoord:      'Coordinator',
    roleDriver:     'Driver',
  },
  id: {
    title:          'Pengguna',
    totalActive:    (total: number, active: number) => `${total} total · ${active} aktif`,
    addUser:        'Tambah Pengguna',
    searchPlaceholder: 'Cari nama atau email...',
    allRoles:       'Semua peran',
    noUsers:        'Tidak ada pengguna',
    edit:           'Edit',
    deactivate:     'Nonaktifkan',
    activate:       'Aktifkan',
    inactive:       'Tidak Aktif',
    detail:         'Detail',
    detailTitle:    'Detail Perjalanan',
    totalTrips:     'Total Trip',
    completed:      'Selesai',
    cancelled:      'Dibatalkan',
    rejected:       'Ditolak',
    active:         'Aktif / Menunggu',
    cancelRate:     'Tingkat Pembatalan',
    recentTrips:    'Trip Terbaru',
    noTrips:        'Belum ada trip',
    loadingDetail:  'Memuat...',
    editTitle:      'Edit Pengguna',
    addTitle:       'Tambah Pengguna Baru',
    fieldName:      'Nama Lengkap',
    fieldEmail:     'Email Kerja',
    fieldPassword:  'Password Sementara',
    fieldRole:      'Peran',
    fieldPhone:     'Telepon (opsional)',
    minPassword:    'Password minimal 6 karakter',
    saving:         'Menyimpan...',
    saveChanges:    'Simpan Perubahan',
    createUser:     'Buat Pengguna',
    updateFailed:   'Gagal memperbarui',
    createFailed:   'Gagal membuat pengguna',
    roleStaff:      'Staff',
    roleCoord:      'Koordinator',
    roleDriver:     'Driver',
  },
}

const ROLE_COLORS: Record<Role, { bg: string; text: string }> = {
  staff:       { bg: '#DBEAFE', text: '#1E40AF' },
  coordinator: { bg: '#D1FAE5', text: '#065F46' },
  driver:      { bg: '#FEF3C7', text: '#92400E' },
}

interface FormState {
  name: string
  email: string
  password: string
  role: Role
  phone: string
}

const EMPTY_FORM: FormState = { name: '', email: '', password: '', role: 'staff', phone: '' }

interface TripStats {
  total: number
  completed: number
  cancelled: number
  rejected: number
  active: number
}

interface TripRow {
  id: string
  booking_code: string
  status: string
  scheduled_at: string
  completed_at: string | null
  pickup: string
  destination: string
  driver_name: string | null
}

const TRIP_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  completed:                    { bg: '#D1FAE5', text: '#065F46' },
  cancelled:                    { bg: '#FEE2E2', text: '#991B1B' },
  rejected:                     { bg: '#FEE2E2', text: '#991B1B' },
  booked:                       { bg: '#DBEAFE', text: '#1E40AF' },
  on_trip:                      { bg: '#DBEAFE', text: '#1E40AF' },
  waiting_trip:                 { bg: '#FEF3C7', text: '#92400E' },
  submitted:                    { bg: '#F1F5F9', text: '#64748b' },
  pending_coordinator_approval: { bg: '#F1F5F9', text: '#64748b' },
}

export default function CoordinatorUsersPage() {
  const router   = useRouter()
  const supabase = createClient()
  const lang     = useLang()
  const t        = MSG[lang]

  const [token,       setToken]       = useState<string | null>(null)
  const [users,       setUsers]       = useState<User[]>([])
  const [loading,     setLoading]     = useState(true)
  const [filterRole,  setFilterRole]  = useState<Role | 'all'>('all')
  const [search,      setSearch]      = useState('')
  const [showModal,   setShowModal]   = useState(false)
  const [editUser,    setEditUser]    = useState<User | null>(null)
  const [form,        setForm]        = useState<FormState>(EMPTY_FORM)
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState('')

  const [detailUser,    setDetailUser]    = useState<User | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailStats,   setDetailStats]   = useState<TripStats | null>(null)
  const [detailTrips,   setDetailTrips]   = useState<TripRow[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single()
        .then(({ data }) => {
          if (data?.role !== 'coordinator') { router.replace('/login'); return }
          setToken(session.access_token)
        })
    })
  }, [])

  useEffect(() => {
    if (token) loadUsers()
  }, [token])

  async function loadUsers() {
    setLoading(true)
    const res = await fetch('/api/users?roles=staff,coordinator,driver&includeInactive=true', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json()
    setUsers(json.users || [])
    setLoading(false)
  }

  function openAddModal() {
    setEditUser(null)
    setForm(EMPTY_FORM)
    setError('')
    setSuccess('')
    setShowModal(true)
  }

  function openEditModal(u: User) {
    setEditUser(u)
    setForm({ name: u.name, email: u.email, password: '', role: u.role, phone: u.phone || '' })
    setError('')
    setSuccess('')
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    if (editUser) {
      const body: Record<string, unknown> = { name: form.name, phone: form.phone, role: form.role }
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || t.updateFailed); setSubmitting(false); return }
      setSuccess(editUser.name)
      setShowModal(false)
      loadUsers()
    } else {
      if (form.password.length < 6) {
        setError(t.minPassword)
        setSubmitting(false)
        return
      }
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || t.createFailed); setSubmitting(false); return }
      setSuccess(form.name)
      setShowModal(false)
      loadUsers()
    }

    setSubmitting(false)
  }

  async function openDetail(u: User) {
    setDetailUser(u)
    setDetailLoading(true)
    setDetailStats(null)
    setDetailTrips([])
    const res = await fetch(`/api/users/${u.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json()
    setDetailStats(json.stats || null)
    setDetailTrips(json.trips || [])
    setDetailLoading(false)
  }

  async function toggleActive(u: User) {
    await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_active: !u.is_active }),
    })
    loadUsers()
  }

  const roleLabels: Record<Role, string> = {
    staff:       t.roleStaff,
    coordinator: t.roleCoord,
    driver:      t.roleDriver,
  }

  const filtered = users.filter(u => {
    if (filterRole !== 'all' && u.role !== filterRole) return false
    if (search) {
      const q = search.toLowerCase()
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div style={{ minHeight: '100dvh', background: '#F5F5F2', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{
        background: 'white', borderBottom: '1px solid rgba(0,0,0,0.06)',
        padding: '16px 20px', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => router.back()}
              style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: -8 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
            </button>
            <div>
              <h1 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#1a1a1a' }}>{t.title}</h1>
              <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                {t.totalActive(users.length, users.filter(u => u.is_active).length)}
              </p>
            </div>
          </div>
          <button
            onClick={openAddModal}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: PRIMARY, color: 'white', border: 'none',
              borderRadius: '10px', padding: '9px 14px',
              fontSize: '13px', fontWeight: '700', cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            {t.addUser}
          </button>
        </div>

        {/* Search + Role filter */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            style={{
              flex: 1, padding: '8px 12px', fontSize: '13px',
              border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: '8px',
              outline: 'none', background: '#f9fafb',
            }}
          />
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value as Role | 'all')}
            style={{
              padding: '8px 10px', fontSize: '13px',
              border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: '8px',
              outline: 'none', background: '#f9fafb', color: '#374151',
            }}
          >
            <option value="all">{t.allRoles}</option>
            <option value="staff">{t.roleStaff}</option>
            <option value="coordinator">{t.roleCoord}</option>
            <option value="driver">{t.roleDriver}</option>
          </select>
        </div>
      </div>

      {/* Success banner */}
      {success && (
        <div style={{
          background: '#D1FAE5', border: '1px solid #6EE7B7', margin: '12px 16px',
          borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#065F46',
        }}>
          {success}
        </div>
      )}

      {/* List */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid rgba(0,96,100,0.15)', borderTop: '3px solid #006064', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: '14px' }}>
            {t.noUsers}
          </div>
        ) : filtered.map(u => {
          const rc = ROLE_COLORS[u.role]
          return (
            <div key={u.id} style={{
              background: u.is_active ? 'white' : '#f9fafb',
              border: '1px solid rgba(0,0,0,0.06)',
              borderRadius: '12px', padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              opacity: u.is_active ? 1 : 0.6,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>{u.name}</span>
                  <span style={{
                    fontSize: '10px', fontWeight: '700', padding: '2px 7px',
                    borderRadius: '20px', background: rc.bg, color: rc.text,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {roleLabels[u.role]}
                  </span>
                  {!u.is_active && (
                    <span style={{
                      fontSize: '10px', fontWeight: '700', padding: '2px 7px',
                      borderRadius: '20px', background: '#F1F5F9', color: '#64748b',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      {t.inactive}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{u.email}</div>
                {u.phone && <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{u.phone}</div>}
              </div>

              <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
                <button
                  onClick={() => openDetail(u)}
                  style={{
                    padding: '6px 10px', fontSize: '12px', fontWeight: '600',
                    border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: '8px',
                    background: 'white', color: '#374151', cursor: 'pointer',
                  }}
                >
                  {t.detail}
                </button>
                <button
                  onClick={() => openEditModal(u)}
                  style={{
                    padding: '6px 10px', fontSize: '12px', fontWeight: '600',
                    border: '1.5px solid rgba(0,96,100,0.2)', borderRadius: '8px',
                    background: 'white', color: PRIMARY, cursor: 'pointer',
                  }}
                >
                  {t.edit}
                </button>
                <button
                  onClick={() => toggleActive(u)}
                  style={{
                    padding: '6px 10px', fontSize: '12px', fontWeight: '600',
                    border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: '8px',
                    background: u.is_active ? '#FEF2F2' : '#F0FDF4',
                    color: u.is_active ? '#DC2626' : '#16A34A',
                    cursor: 'pointer',
                  }}
                >
                  {u.is_active ? t.deactivate : t.activate}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 74, zIndex: 1100,
          background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={{
            background: 'white', borderRadius: '20px 20px 0 0',
            width: '100%', maxWidth: '480px', maxHeight: '90dvh',
            overflowY: 'auto', padding: '24px 20px 32px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1a1a1a' }}>
                {editUser ? t.editTitle : t.addTitle}
              </h2>
              <button onClick={() => setShowModal(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Field label={t.fieldName}>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="John Doe"
                  required
                  style={inputStyle}
                />
              </Field>

              <Field label={t.fieldEmail}>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="john@company.com"
                  required
                  disabled={!!editUser}
                  style={{ ...inputStyle, background: editUser ? '#f3f4f6' : 'white', color: editUser ? '#6b7280' : '#1a1a1a' }}
                />
              </Field>

              {!editUser && (
                <Field label={t.fieldPassword}>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min. 6 characters"
                    required
                    style={inputStyle}
                  />
                </Field>
              )}

              <Field label={t.fieldRole}>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))}
                  style={inputStyle}
                >
                  <option value="staff">{t.roleStaff}</option>
                  <option value="coordinator">{t.roleCoord}</option>
                  <option value="driver">{t.roleDriver}</option>
                </select>
              </Field>

              <Field label={t.fieldPhone}>
                <input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+62..."
                  style={inputStyle}
                />
              </Field>

              {error && (
                <div style={{
                  background: '#FEE2E2', border: '1px solid #FCA5A5',
                  borderRadius: '8px', padding: '10px 12px',
                  fontSize: '12px', color: '#991B1B',
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%', padding: '13px',
                  background: submitting ? '#888' : PRIMARY,
                  color: 'white', border: 'none', borderRadius: '10px',
                  fontSize: '14px', fontWeight: '700', cursor: submitting ? 'not-allowed' : 'pointer',
                  marginTop: '4px',
                }}
              >
                {submitting ? t.saving : editUser ? t.saveChanges : t.createUser}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Detail popup — trip stats + recent trips for this user (as passenger) */}
      {detailUser && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 74, zIndex: 1100,
          background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={e => { if (e.target === e.currentTarget) setDetailUser(null) }}>
          <div style={{
            background: 'white', borderRadius: '20px 20px 0 0',
            width: '100%', maxWidth: '480px', maxHeight: '90dvh',
            overflowY: 'auto', padding: '24px 20px 32px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1a1a1a' }}>{detailUser.name}</h2>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#9ca3af' }}>{t.detailTitle}</p>
              </div>
              <button onClick={() => setDetailUser(null)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {detailLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid rgba(0,96,100,0.15)', borderTop: '3px solid #006064', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : detailStats && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px', margin: '16px 0' }}>
                  <StatTile label={t.totalTrips} value={detailStats.total} />
                  <StatTile label={t.completed}  value={detailStats.completed} color="#065F46" />
                  <StatTile label={t.cancelled}  value={detailStats.cancelled + detailStats.rejected} color="#991B1B" />
                  <StatTile label={t.active}     value={detailStats.active} color="#1E40AF" />
                </div>

                {detailStats.total > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#f9fafb', border: '1px solid rgba(0,0,0,0.06)',
                    borderRadius: '10px', padding: '10px 14px', marginBottom: '16px',
                  }}>
                    <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600' }}>{t.cancelRate}</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#1a1a1a' }}>
                      {Math.round(((detailStats.cancelled + detailStats.rejected) / detailStats.total) * 100)}%
                    </span>
                  </div>
                )}

                <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9ca3af', margin: '0 0 8px' }}>
                  {t.recentTrips}
                </p>

                {detailTrips.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: '#9ca3af', fontSize: '13px' }}>
                    {t.noTrips}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {detailTrips.map(trip => {
                      const sc = TRIP_STATUS_COLORS[trip.status] || { bg: '#F1F5F9', text: '#64748b' }
                      return (
                        <div key={trip.id} style={{
                          border: '1px solid rgba(0,0,0,0.06)', borderRadius: '10px',
                          padding: '10px 12px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{trip.booking_code}</span>
                            <span style={{
                              fontSize: '10px', fontWeight: '700', padding: '2px 7px',
                              borderRadius: '20px', background: sc.bg, color: sc.text,
                              textTransform: 'uppercase', letterSpacing: '0.04em',
                            }}>
                              {trip.status}
                            </span>
                          </div>
                          <div style={{ fontSize: '12.5px', color: '#1a1a1a', fontWeight: '600', marginBottom: '2px' }}>
                            {trip.pickup} → {trip.destination}
                          </div>
                          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                            {new Date(trip.scheduled_at).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', {
                              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                            })}
                            {trip.driver_name && ` · ${trip.driver_name}`}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatTile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: '#f9fafb', border: '1px solid rgba(0,0,0,0.06)', borderRadius: '10px', padding: '10px 12px' }}>
      <p style={{ margin: '0 0 4px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>{label}</p>
      <p style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: color || '#1a1a1a' }}>{value}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: '11px', fontWeight: '700',
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: '#9ca3af', marginBottom: '6px',
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', fontSize: '14px',
  border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: '10px',
  outline: 'none', boxSizing: 'border-box', background: 'white',
}
