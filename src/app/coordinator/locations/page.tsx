'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import type { RegisteredLocation } from '@/types'
import type { Coords } from '@/lib/geocode'

const LocationPickerMap = dynamic(() => import('@/components/map/LocationPickerMap'), { ssr: false })
const SavedLocationsMap  = dynamic(() => import('@/components/map/SavedLocationsMap'),  { ssr: false })

interface PendingPin {
  address: string
  lat: number
  lng: number
}

const FONT = "var(--font-inter), 'Inter', sans-serif"
const PRIMARY = '#006064'

export default function RegisteredLocationsPage() {
  const router  = useRouter()
  const supabase = createClient()

  const [locations,     setLocations]     = useState<RegisteredLocation[]>([])
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)

  // Add flow
  const [addPickerOpen, setAddPickerOpen] = useState(false)
  const [pendingPin,    setPendingPin]    = useState<PendingPin | null>(null)
  const [newName,       setNewName]       = useState('')

  // Edit flow
  const [editLoc,       setEditLoc]       = useState<RegisteredLocation | null>(null)
  const [editName,      setEditName]      = useState('')
  const [editPin,       setEditPin]       = useState<PendingPin | null>(null)
  const [editPickerOpen, setEditPickerOpen] = useState(false)

  // Delete flow
  const [deleteId,      setDeleteId]      = useState<string | null>(null)
  const [deleteName,    setDeleteName]    = useState('')

  // Map highlight
  const [highlightId,   setHighlightId]   = useState<string | null>(null)

  // Card ⋮ menu
  const [menuOpenId,    setMenuOpenId]    = useState<string | null>(null)

  // Pagination
  const PAGE_SIZE = 6
  const [visibleCount, setVisibleCount]   = useState(PAGE_SIZE)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (profile?.role !== 'coordinator') { router.push('/login'); return }
      await load()
      setLoading(false)
    }
    init()
  }, [])

  async function load() {
    const { data } = await supabase
      .from('registered_locations')
      .select('*')
      .order('name')
    setLocations(data || [])
  }

  // ── Add ──────────────────────────────────────────────────────

  function handleAddConfirm(address: string, coords: Coords) {
    setPendingPin({ address, ...coords })
    setAddPickerOpen(false)
    setNewName('')
  }

  async function saveNew() {
    if (!pendingPin || !newName.trim()) return
    setSaving(true)
    await supabase.from('registered_locations').insert({
      name:    newName.trim(),
      address: pendingPin.address,
      lat:     pendingPin.lat,
      lng:     pendingPin.lng,
    })
    await load()
    setPendingPin(null)
    setNewName('')
    setSaving(false)
  }

  // ── Edit ─────────────────────────────────────────────────────

  function openEdit(loc: RegisteredLocation) {
    setEditLoc(loc)
    setEditName(loc.name)
    setEditPin({ address: loc.address || '', lat: loc.lat, lng: loc.lng })
  }

  function handleEditConfirm(address: string, coords: Coords) {
    setEditPin({ address, ...coords })
    setEditPickerOpen(false)
  }

  async function saveEdit() {
    if (!editLoc || !editName.trim() || !editPin) return
    setSaving(true)
    await supabase.from('registered_locations').update({
      name:    editName.trim(),
      address: editPin.address,
      lat:     editPin.lat,
      lng:     editPin.lng,
    }).eq('id', editLoc.id)
    await load()
    setEditLoc(null)
    setEditPin(null)
    setEditName('')
    setSaving(false)
  }

  // ── Delete ───────────────────────────────────────────────────

  function openDelete(loc: RegisteredLocation) {
    setDeleteId(loc.id)
    setDeleteName(loc.name)
  }

  async function confirmDelete() {
    if (!deleteId) return
    await supabase.from('registered_locations').delete().eq('id', deleteId)
    await load()
    setDeleteId(null)
    setDeleteName('')
  }

  // ── Render ───────────────────────────────────────────────────

  const visible = locations.slice(0, visibleCount)
  const hasMore = visibleCount < locations.length

  if (loading) return (
    <div style={{ height: 'calc(100dvh - 68px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(0,96,100,0.15)', borderTop: `3px solid ${PRIMARY}`, animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <>
      <div style={{ height: 'calc(100dvh - 68px)', display: 'flex', flexDirection: 'column', background: '#F5F5F2', fontFamily: FONT, WebkitFontSmoothing: 'antialiased' as any }}>

        {/* Header */}
        <header style={{
          background: '#fff', flexShrink: 0,
          padding: '16px 20px 14px',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          zIndex: 40,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => router.back()}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: '#F5F5F2', border: '1px solid rgba(0,0,0,0.08)',
                  cursor: 'pointer', fontSize: 15,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >←</button>
              <div>
                <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 2px', letterSpacing: '-0.3px', color: '#1a1c1b' }}>Saved Locations</h1>
                <p style={{ fontSize: 12, color: '#8A9BB0', margin: 0 }}>
                  {locations.length} place{locations.length !== 1 ? 's' : ''} registered
                </p>
              </div>
            </div>
            <button
              onClick={() => setAddPickerOpen(true)}
              style={{
                padding: '8px 16px',
                background: PRIMARY, border: 'none', borderRadius: 20,
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: FONT,
              }}
            >+ Add</button>
          </div>
        </header>

        {/* Body: map left + list right */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Left — map */}
          <div style={{ flex: 1, position: 'relative' }}>
            <SavedLocationsMap
              locations={locations}
              onMarkerClick={loc => {
                setHighlightId(loc.id)
                document.getElementById(`loc-${loc.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                setTimeout(() => setHighlightId(null), 2000)
              }}
            />
            {locations.length === 0 && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 10,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(245,245,242,0.75)', gap: 6,
              }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', margin: 0 }}>No pins yet</p>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Add a location to see it here</p>
              </div>
            )}
          </div>

          {/* Right — list panel */}
          <div style={{
            width: 300, flexShrink: 0,
            borderLeft: '1px solid rgba(0,0,0,0.08)',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            {locations.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📍</div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', margin: '0 0 6px' }}>No saved locations yet</p>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
                  Tap <strong>+ Add</strong> to register offices, gates, or spots inside the plant site.
                </p>
              </div>
            ) : (
              <>
                {/* Panel header */}
                <div style={{
                  padding: '12px 16px 8px',
                  borderBottom: '1px solid rgba(0,0,0,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                    Locations
                  </p>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', background: 'rgba(0,0,0,0.05)', borderRadius: 20, padding: '2px 8px' }}>
                    {locations.length}
                  </span>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {visible.map(loc => (
                      <div
                        key={loc.id}
                        id={`loc-${loc.id}`}
                        style={{
                          background: highlightId === loc.id ? 'rgba(0,96,100,0.04)' : '#fff',
                          borderRadius: 12,
                          border: `1px solid ${highlightId === loc.id ? 'rgba(0,96,100,0.25)' : 'rgba(0,0,0,0.06)'}`,
                          padding: '11px 12px',
                          transition: 'border-color 0.3s, background 0.3s',
                          position: 'relative',
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          setHighlightId(loc.id)
                          setTimeout(() => setHighlightId(null), 2000)
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                          {/* Star badge */}
                          <div style={{
                            width: 28, height: 28, borderRadius: 8,
                            background: 'rgba(217,119,6,0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, flexShrink: 0, color: '#D97706',
                          }}>★</div>

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0, paddingRight: 24 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {loc.name}
                            </p>
                            {loc.address && (
                              <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 3px', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                                {loc.address}
                              </p>
                            )}
                            <p style={{ fontSize: 10, color: '#c9d0d8', margin: 0, fontFamily: 'monospace', letterSpacing: '0.02em' }}>
                              {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                            </p>
                          </div>
                        </div>

                        {/* ⋮ menu trigger */}
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setMenuOpenId(menuOpenId === loc.id ? null : loc.id)
                          }}
                          style={{
                            position: 'absolute', top: 10, right: 10,
                            width: 24, height: 24, borderRadius: 6,
                            background: menuOpenId === loc.id ? 'rgba(0,0,0,0.06)' : 'transparent',
                            border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 16, color: '#9ca3af', fontWeight: 700, lineHeight: 1,
                            transition: 'background 0.15s',
                          }}
                        >⋮</button>

                        {/* Dropdown menu */}
                        {menuOpenId === loc.id && (
                          <>
                            <div
                              onClick={e => { e.stopPropagation(); setMenuOpenId(null) }}
                              style={{ position: 'fixed', inset: 0, zIndex: 200 }}
                            />
                            <div style={{
                              position: 'absolute', top: 36, right: 8, zIndex: 201,
                              background: '#fff', borderRadius: 10,
                              boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
                              border: '1px solid rgba(0,0,0,0.08)',
                              overflow: 'hidden', minWidth: 140,
                            }}>
                              <button
                                onClick={e => { e.stopPropagation(); setMenuOpenId(null); openEdit(loc) }}
                                style={{
                                  width: '100%', padding: '10px 14px',
                                  background: 'transparent', border: 'none',
                                  cursor: 'pointer', textAlign: 'left',
                                  display: 'flex', alignItems: 'center', gap: 9,
                                  fontSize: 13, fontWeight: 600, color: '#111827',
                                  borderBottom: '1px solid rgba(0,0,0,0.06)',
                                  fontFamily: FONT,
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth="2.2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                Edit
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setMenuOpenId(null); openDelete(loc) }}
                                style={{
                                  width: '100%', padding: '10px 14px',
                                  background: 'transparent', border: 'none',
                                  cursor: 'pointer', textAlign: 'left',
                                  display: 'flex', alignItems: 'center', gap: 9,
                                  fontSize: 13, fontWeight: 600, color: '#ba1a1a',
                                  fontFamily: FONT,
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ba1a1a" strokeWidth="2.2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Load more */}
                  {hasMore && (
                    <button
                      onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                      style={{
                        width: '100%', marginTop: 8, padding: '10px',
                        background: 'transparent',
                        border: '1px dashed rgba(0,96,100,0.25)',
                        borderRadius: 10, fontSize: 12, fontWeight: 600,
                        color: PRIMARY, cursor: 'pointer', fontFamily: FONT,
                      }}
                    >
                      Load more · {locations.length - visibleCount} remaining
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Map picker — Add */}
      {addPickerOpen && (
        <LocationPickerMap
          title="Pin the Location"
          onConfirm={handleAddConfirm}
          onClose={() => setAddPickerOpen(false)}
        />
      )}

      {/* Map picker — Edit (change pin) */}
      {editPickerOpen && (
        <LocationPickerMap
          title="Change Pin"
          onConfirm={handleEditConfirm}
          onClose={() => setEditPickerOpen(false)}
        />
      )}

      {/* Name dialog — after Add picker */}
      {pendingPin && !addPickerOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'flex-end',
        }}>
          <div style={{
            width: '100%', background: '#fff',
            borderRadius: '20px 20px 0 0',
            padding: '24px 20px 40px',
          }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#1a1c1b', margin: '0 0 4px' }}>Name This Location</p>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 16px', lineHeight: 1.4 }}>{pendingPin.address}</p>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. HR Office, Main Gate, Workshop A"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) saveNew() }}
              style={{
                width: '100%', padding: '13px 14px',
                border: `2px solid rgba(0,96,100,0.2)`,
                borderRadius: 12, fontSize: 14, fontFamily: FONT,
                outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={e => { e.target.style.borderColor = PRIMARY }}
              onBlur={e => { e.target.style.borderColor = 'rgba(0,96,100,0.2)' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                onClick={() => { setPendingPin(null); setNewName('') }}
                style={{
                  flex: 1, padding: '13px', background: 'rgba(0,0,0,0.06)',
                  border: 'none', borderRadius: 14, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', color: '#6b7280', fontFamily: FONT,
                }}
              >Cancel</button>
              <button
                onClick={saveNew}
                disabled={!newName.trim() || saving}
                style={{
                  flex: 2, padding: '13px',
                  background: !newName.trim() || saving ? '#9ca3af' : PRIMARY,
                  border: 'none', borderRadius: 14, fontSize: 14, fontWeight: 700,
                  cursor: !newName.trim() || saving ? 'not-allowed' : 'pointer',
                  color: '#fff', fontFamily: FONT,
                }}
              >{saving ? 'Saving...' : 'Save Location'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit dialog */}
      {editLoc && !editPickerOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'flex-end',
        }}>
          <div style={{
            width: '100%', background: '#fff',
            borderRadius: '20px 20px 0 0',
            padding: '24px 20px 40px',
          }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#1a1c1b', margin: '0 0 16px' }}>Edit Location</p>

            <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>Name</p>
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              style={{
                width: '100%', padding: '12px 14px',
                border: `2px solid rgba(0,96,100,0.2)`,
                borderRadius: 12, fontSize: 14, fontFamily: FONT,
                outline: 'none', boxSizing: 'border-box', marginBottom: 14,
              }}
              onFocus={e => { e.target.style.borderColor = PRIMARY }}
              onBlur={e => { e.target.style.borderColor = 'rgba(0,96,100,0.2)' }}
            />

            <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>Pin</p>
            <div style={{
              background: '#F5F5F2', borderRadius: 10, padding: '10px 12px', marginBottom: 10,
            }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1c1b', margin: '0 0 2px' }}>
                {editPin?.address || '(no address)'}
              </p>
              <p style={{ fontSize: 10, color: '#d1d5db', margin: 0, fontFamily: 'monospace' }}>
                {editPin ? `${editPin.lat.toFixed(5)}, ${editPin.lng.toFixed(5)}` : ''}
              </p>
            </div>
            <button
              onClick={() => setEditPickerOpen(true)}
              style={{
                width: '100%', padding: '11px', marginBottom: 16,
                background: 'rgba(0,96,100,0.08)', border: 'none', borderRadius: 12,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', color: PRIMARY, fontFamily: FONT,
              }}
            >Change Pin on Map</button>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setEditLoc(null); setEditPin(null); setEditName('') }}
                style={{
                  flex: 1, padding: '13px', background: 'rgba(0,0,0,0.06)',
                  border: 'none', borderRadius: 14, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', color: '#6b7280', fontFamily: FONT,
                }}
              >Cancel</button>
              <button
                onClick={saveEdit}
                disabled={!editName.trim() || saving}
                style={{
                  flex: 2, padding: '13px',
                  background: !editName.trim() || saving ? '#9ca3af' : PRIMARY,
                  border: 'none', borderRadius: 14, fontSize: 14, fontWeight: 700,
                  cursor: !editName.trim() || saving ? 'not-allowed' : 'pointer',
                  color: '#fff', fontFamily: FONT,
                }}
              >{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 24px',
        }}>
          <div style={{
            background: '#fff', borderRadius: 20,
            padding: '24px 20px', width: '100%', maxWidth: 360,
          }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#1a1c1b', margin: '0 0 8px' }}>Delete Location?</p>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px', lineHeight: 1.5 }}>
              "<strong>{deleteName}</strong>" will be removed from the map and can no longer be selected during booking.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setDeleteId(null); setDeleteName('') }}
                style={{
                  flex: 1, padding: '12px', background: 'rgba(0,0,0,0.06)',
                  border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', color: '#6b7280', fontFamily: FONT,
                }}
              >Cancel</button>
              <button
                onClick={confirmDelete}
                style={{
                  flex: 1, padding: '12px', background: '#ba1a1a',
                  border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', color: '#fff', fontFamily: FONT,
                }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
