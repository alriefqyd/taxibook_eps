'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import type { RegisteredLocation } from '@/types'
import type { Coords } from '@/lib/geocode'

const LocationPickerMap = dynamic(() => import('@/components/map/LocationPickerMap'), { ssr: false })

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

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(0,96,100,0.15)', borderTop: `3px solid ${PRIMARY}`, animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <>
      <div style={{ minHeight: '100dvh', background: '#F5F5F2', fontFamily: FONT }}>

        {/* Header */}
        <header style={{
          background: PRIMARY, color: '#fff', height: 60,
          padding: '0 16px', position: 'sticky', top: 0, zIndex: 40,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <button
            onClick={() => router.back()}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: 'none',
              cursor: 'pointer', fontSize: 18, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >←</button>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Saved Locations</p>
            <p style={{ fontSize: 11, margin: 0, opacity: 0.7 }}>
              {locations.length} place{locations.length !== 1 ? 's' : ''} registered
            </p>
          </div>
          <button
            onClick={() => setAddPickerOpen(true)}
            style={{
              padding: '8px 16px', background: 'rgba(255,255,255,0.2)',
              border: 'none', borderRadius: 20, color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            + Add
          </button>
        </header>

        {/* Location list */}
        <div style={{ padding: 16, maxWidth: 640, margin: '0 auto' }}>
          {locations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
              <div style={{ fontSize: 48, marginBottom: 14 }}>📍</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#6b7280', margin: '0 0 6px' }}>No saved locations yet</p>
              <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                Tap <strong>+ Add</strong> to register offices, gates, or any specific spot inside the plant site.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {locations.map(loc => (
                <div key={loc.id} style={{
                  background: '#fff', borderRadius: 16, padding: '14px 16px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: 'rgba(217,119,6,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, flexShrink: 0, color: '#D97706',
                  }}>★</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1c1b', margin: '0 0 3px' }}>{loc.name}</p>
                    {loc.address && (
                      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 4px', lineHeight: 1.4 }}>{loc.address}</p>
                    )}
                    <p style={{ fontSize: 10, color: '#d1d5db', margin: 0, fontFamily: 'monospace' }}>
                      {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => openEdit(loc)}
                      style={{
                        padding: '6px 12px', borderRadius: 10,
                        background: 'rgba(0,96,100,0.08)', border: 'none',
                        cursor: 'pointer', fontSize: 12, fontWeight: 600, color: PRIMARY,
                        fontFamily: FONT,
                      }}
                    >Edit</button>
                    <button
                      onClick={() => openDelete(loc)}
                      style={{
                        padding: '6px 12px', borderRadius: 10,
                        background: 'rgba(186,26,26,0.08)', border: 'none',
                        cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#ba1a1a',
                        fontFamily: FONT,
                      }}
                    >Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
