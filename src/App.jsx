import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from './supabaseClient'
import RichTextEditor from './components/RichTextEditor'
import StickyNote from './components/StickyNote'
import DocumentManager from './components/DocumentManager'
import DrawingCanvas from './components/DrawingCanvas'
import SignUp from './components/SignUp'
import SignIn from './components/SignIn'
import './App.css'

function App() {

  /* ================================
     AUTH + DOCUMENT STATE (UNCHANGED)
  ================================= */

  const [session, setSession] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [authView, setAuthView] = useState('signin')

  const [documents, setDocuments] = useState({})
  const [selectedDocumentId, setSelectedDocumentId] = useState(null)

  const [documentTitle, setDocumentTitle] = useState('')
  const [documentContent, setDocumentContent] = useState('')

  const [stickyNotes, setStickyNotes] = useState([])
  const [strokes, setStrokes] = useState([])

  const [documentReady, setDocumentReady] = useState(false)
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [authLoading, setAuthLoading] = useState(false)
  const [error, setError] = useState(null)

  const editorWrapperRef = useRef(null)

  /* ================================
     ✨ PREMIUM ZOOM + PAN SYSTEM
  ================================= */

  const [editorZoom, setEditorZoom] = useState(1)
  const [editorPanOffset, setEditorPanOffset] = useState({ x: 0, y: 0 })
  const [isZooming, setIsZooming] = useState(false)
  const [isPanning, setIsPanning] = useState(false)

  const pinchStartDistance = useRef(0)
  const pinchStartZoom = useRef(1)
  const pinchStartPan = useRef({ x: 0, y: 0 })

  const panVelocity = useRef({ x: 0, y: 0 })
  const lastPanPoint = useRef({ x: 0, y: 0, time: 0 })
  const momentumFrame = useRef(null)

  /* ------------------------
     Helpers
  -------------------------*/

  const getTouchDistance = (touches) => {
    const dx = touches[1].clientX - touches[0].clientX
    const dy = touches[1].clientY - touches[0].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const getTouchCenter = (touches, rect) => ({
    x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
    y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top
  })

  const applyResistance = (value, limit = 250) => {
    if (Math.abs(value) <= limit) return value
    const excess = Math.abs(value) - limit
    const resisted = limit + excess * 0.3
    return value < 0 ? -resisted : resisted
  }

  /* ------------------------
     Touch Start
  -------------------------*/

  const handleTouchStart = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect()

    if (e.touches.length === 2) {
      e.preventDefault()

      setIsZooming(true)
      setIsPanning(false)

      pinchStartDistance.current = getTouchDistance(e.touches)
      pinchStartZoom.current = editorZoom
      pinchStartPan.current = { ...editorPanOffset }

      if (momentumFrame.current) {
        cancelAnimationFrame(momentumFrame.current)
        momentumFrame.current = null
      }
    }

    if (e.touches.length === 1 && editorZoom > 1) {
      e.preventDefault()

      setIsPanning(true)
      setIsZooming(false)

      const x = e.touches[0].clientX - rect.left
      const y = e.touches[0].clientY - rect.top

      pinchStartPan.current = {
        x: x - editorPanOffset.x,
        y: y - editorPanOffset.y
      }

      lastPanPoint.current = {
        x: editorPanOffset.x,
        y: editorPanOffset.y,
        time: performance.now()
      }
    }
  }, [editorZoom, editorPanOffset])

  /* ------------------------
     Touch Move
  -------------------------*/

  const handleTouchMove = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect()

    /* ========================
      TWO FINGER GESTURE
    =========================*/
    if (e.touches.length === 2) {
      e.preventDefault()

      const center = getTouchCenter(e.touches, rect)

      setIsZooming(true)
      setIsPanning(false)

      pinchStartDistance.current = getTouchDistance(e.touches)
      pinchStartZoom.current = editorZoom

      pinchStartPan.current = {
        x: editorPanOffset.x,
        y: editorPanOffset.y,
        centerX: center.x,
        centerY: center.y
      }

      if (momentumFrame.current) {
        cancelAnimationFrame(momentumFrame.current)
        momentumFrame.current = null
      }
    }

    /* ========================
      ONE FINGER PAN
    =========================*/
    if (e.touches.length === 1 && isPanning) {
      e.preventDefault()

      const x = e.touches[0].clientX - rect.left
      const y = e.touches[0].clientY - rect.top

      const newPanX = x - pinchStartPan.current.x
      const newPanY = y - pinchStartPan.current.y

      const now = performance.now()
      const dt = now - lastPanPoint.current.time || 16

      panVelocity.current = {
        x: (newPanX - editorPanOffset.x) / dt,
        y: (newPanY - editorPanOffset.y) / dt,
      }

      lastPanPoint.current = {
        x: newPanX,
        y: newPanY,
        time: now
      }

      setEditorPanOffset({
        x: applyResistance(newPanX),
        y: applyResistance(newPanY)
      })
    }

  }, [isZooming, isPanning, editorPanOffset])

  /* ------------------------
     Momentum
  -------------------------*/

  const applyMomentum = () => {
    const friction = 0.94
    const min = 0.01

    panVelocity.current.x *= friction
    panVelocity.current.y *= friction

    if (
      Math.abs(panVelocity.current.x) < min &&
      Math.abs(panVelocity.current.y) < min
    ) {
      momentumFrame.current = null
      return
    }

    setEditorPanOffset(prev => ({
      x: prev.x + panVelocity.current.x * 16,
      y: prev.y + panVelocity.current.y * 16,
    }))

    momentumFrame.current = requestAnimationFrame(applyMomentum)
  }

  /* ------------------------
     Touch End
  -------------------------*/

  const handleTouchEnd = useCallback((e) => {
    if (e.touches.length === 0) {

      if (isPanning) {
        momentumFrame.current = requestAnimationFrame(applyMomentum)
      }

      setIsZooming(false)
      setIsPanning(false)
    }
  }, [isPanning])

  /* ------------------------
     Reset Zoom
  -------------------------*/

  const resetZoom = () => {
    setEditorZoom(1)
    setEditorPanOffset({ x: 0, y: 0 })
    panVelocity.current = { x: 0, y: 0 }
  }

  /* ================================
     RENDER
  ================================= */

  if (!authChecked) return <div>Loading…</div>

  return (
    <div className="app">
      <header className="app-header">
        <h1>Tedno</h1>

        {editorZoom !== 1 && (
          <button className="btn btn-secondary" onClick={resetZoom}>
            Reset Zoom ({Math.round(editorZoom * 100)}%)
          </button>
        )}
      </header>

      <div
        className="editor-container"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translate(${editorPanOffset.x}px, ${editorPanOffset.y}px) scale(${editorZoom})`,
          transformOrigin: '0 0',
          transition: isZooming || isPanning ? 'none' : 'transform 0.15s ease-out'
        }}
      >
        <div className="editor-wrapper" ref={editorWrapperRef}>
          <RichTextEditor
            content={documentContent}
            onChange={setDocumentContent}
          />
        </div>
      </div>
    </div>
  )
}

export default App