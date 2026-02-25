import { useEffect, useRef, useState } from 'react'
import getStroke from 'perfect-freehand'
import { Canvg } from 'canvg'
import './DrawingCanvas.css'

const COLORS = ['#37352f', '#ef4444', '#f97316', '#3b82f6', '#22c55e', '#a855f7']
const MIN_WIDTH = 2
const MAX_WIDTH = 24
const DEFAULT_WIDTH = 8

function getSvgPathFromStroke(points) {
  if (!points || points.length === 0) return ''
  const d = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')
  return `${d} Z`
}

function pathToPolygon(d) {
  if (!d) return []
  const tokens = d.match(/[MLZmlz]|-?\d*\.?\d+/g) || []
  const points = []
  let i = 0
  while (i < tokens.length) {
    const cmd = tokens[i++]
    if (cmd === 'M' || cmd === 'L' || cmd === 'm' || cmd === 'l') {
      const x = parseFloat(tokens[i++])
      const y = parseFloat(tokens[i++])
      if (!Number.isNaN(x) && !Number.isNaN(y)) points.push([x, y])
    } else if (cmd === 'Z' || cmd === 'z') {
      break
    }
  }
  return points
}

function isPointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false
  const [x, y] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function isPointInStroke(point, d) {
  return isPointInPolygon(point, pathToPolygon(d))
}

const DrawingCanvas = ({ editorWrapperRef, strokes, onChangeStrokes }) => {
  const svgRef = useRef(null)
  const livePathRef = useRef(null)
  const pointsRef = useRef([])
  const isDrawingRef = useRef(false)
  const isErasingRef = useRef(false)
  const erasedIdsRef = useRef(new Set())
  const strokesRef = useRef(strokes || [])
  const nextStrokeIdRef = useRef(1)

  const [internalStrokes, setInternalStrokes] = useState(strokes || [])
  const [history, setHistory] = useState([])
  const [redoHistory, setRedoHistory] = useState([])

  const [isDrawingMode, setIsDrawingMode] = useState(false)
  const [activeTool, setActiveTool] = useState('pen')
  const [penColor, setPenColor] = useState(COLORS[0])
  const [penWidth, setPenWidth] = useState(DEFAULT_WIDTH)

  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const lastClearTapRef = useRef(0)

  // Zoom state for tablet pinch gestures
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isZooming, setIsZooming] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const touchStartDistance = useRef(0)
  const touchStartZoom = useRef(1)
  const touchStartPan = useRef({ x: 0, y: 0 })
  const lastTouchCenter = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const safeStrokes = strokes || []
    setInternalStrokes(safeStrokes)
    strokesRef.current = safeStrokes
    const maxId = Math.max(0, ...safeStrokes.map((s) => s.id || 0))
    nextStrokeIdRef.current = maxId + 1
    setHistory([])
    setRedoHistory([])
  }, [strokes])

  useEffect(() => {
    const host = editorWrapperRef?.current
    if (!host) return
    const updateSize = () => {
      if (isDrawingRef.current) return
      const rect = host.getBoundingClientRect()
      setCanvasSize({ width: rect.width, height: host.scrollHeight || rect.height || 600 })
    }
    const observer = new ResizeObserver(updateSize)
    observer.observe(host)
    updateSize()
    return () => observer.disconnect()
  }, [editorWrapperRef])

  const commitStrokes = (updater, historyEntry) => {
    setInternalStrokes((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      strokesRef.current = next
      onChangeStrokes?.(next)
      return next
    })
    if (historyEntry) {
      setHistory((prev) => {
        const newHistory = [...prev, historyEntry]
        return newHistory
      })
      setRedoHistory([]) // Clear redo history when new action is performed
    }
  }

  const updateLiveStroke = () => {
    const pts = pointsRef.current
    if (!pts.length) { livePathRef.current?.setAttribute('d', ''); return }
    const stroke = getStroke(pts, {
      size: penWidth, thinning: 0.7, smoothing: 0.5, streamline: 0.5,
      easing: (t) => Math.sqrt(t), simulatePressure: false,
    })
    const d = getSvgPathFromStroke(stroke)
    if (livePathRef.current) {
      livePathRef.current.setAttribute('d', d)
      livePathRef.current.setAttribute('stroke', 'none')
      livePathRef.current.setAttribute('fill', penColor)
    }
  }

  const clearLiveStroke = () => {
    pointsRef.current = []
    livePathRef.current?.setAttribute('d', '')
  }

  const commitStroke = () => {
    const pts = pointsRef.current
    if (!pts.length) return
    const stroke = getStroke(pts, {
      size: penWidth, thinning: 0.7, smoothing: 0.5, streamline: 0.5,
      easing: (t) => Math.sqrt(t), simulatePressure: false,
    })
    const strokeObj = {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `stroke-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      d: getSvgPathFromStroke(stroke),
      color: penColor,
      width: penWidth,
      tool: 'pen',
    }
    commitStrokes((prev) => [...prev, strokeObj], { type: 'add', strokeId: strokeObj.id })
    clearLiveStroke()
  }

  const handleEraseAtPoint = (point) => {
    const [x, y] = point
    for (const stroke of strokesRef.current) {
      if (!stroke?.d || erasedIdsRef.current.has(stroke.id)) continue
      if (isPointInStroke([x, y], stroke.d)) erasedIdsRef.current.add(stroke.id)
    }
  }

   const commitEraseGesture = () => {
    const ids = Array.from(erasedIdsRef.current)
    if (!ids.length) return
    const removedStrokes = strokesRef.current.filter((s) => ids.includes(s.id))
    if (!removedStrokes.length) return
    commitStrokes((prev) => prev.filter((s) => !ids.includes(s.id)), { type: 'erase', removed: removedStrokes })
    erasedIdsRef.current = new Set()
  }

  const handleUndo = () => {
    if (!history.length) return
    
    const last = history[history.length - 1]
    
    if (last.type === 'add') {
      const removed = internalStrokes.find((s) => s.id === last.strokeId)
      if (removed) {
        setRedoHistory((r) => [...r, { type: 'add', stroke: removed }])
        commitStrokes((prev) => prev.filter((s) => s.id !== last.strokeId), null)
      }
    } else if (last.type === 'erase') {
      setRedoHistory((r) => [...r, { type: 'erase', removedIds: last.removed.map((s) => s.id) }])
      commitStrokes((prev) => [...prev, ...last.removed], null)
    } else if (last.type === 'clear') {
      setRedoHistory((r) => [...r, { type: 'clear' }])
      commitStrokes(last.previousStrokes, null)
    }
    
    setHistory((prev) => prev.slice(0, -1))
  }

  const handleRedo = () => {
    if (!redoHistory.length) return
    
    const last = redoHistory[redoHistory.length - 1]
    
    if (last.type === 'add' && last.stroke) {
      commitStrokes((prev) => [...prev, last.stroke], { type: 'add', strokeId: last.stroke.id })
    } else if (last.type === 'erase' && last.removedIds?.length) {
      const removed = internalStrokes.filter((s) => last.removedIds.includes(s.id))
      commitStrokes((prev) => prev.filter((s) => !last.removedIds.includes(s.id)), { type: 'erase', removed })
    } else if (last.type === 'clear') {
      commitStrokes([], { type: 'clear', previousStrokes: internalStrokes })
    }
    
    setRedoHistory((prev) => prev.slice(0, -1))
  }

  useEffect(() => {
    if (!isDrawingMode) return
    const handleKeyDown = (e) => {
      const modKey = navigator.platform.toLowerCase().includes('mac') ? e.metaKey : e.ctrlKey
      if (!modKey || e.key.toLowerCase() !== 'z') return
      e.preventDefault()
      e.shiftKey ? handleRedo() : handleUndo()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isDrawingMode])

  useEffect(() => {
    const svg = svgRef.current
    const host = editorWrapperRef?.current
    if (!svg || !host) return

    const getPoint = (e) => {
      const rect = host.getBoundingClientRect()
      const x = (e.clientX - rect.left + host.scrollLeft - panOffset.x) / zoom
      const y = (e.clientY - rect.top + host.scrollTop - panOffset.y) / zoom
      return [x, y]
    }

    const getTouchDistance = (touches) => {
      if (touches.length < 2) return 0
      const dx = touches[1].clientX - touches[0].clientX
      const dy = touches[1].clientY - touches[0].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const getTouchCenter = (touches) => {
      if (touches.length === 0) return { x: 0, y: 0 }
      if (touches.length === 1) {
        const rect = host.getBoundingClientRect()
        return {
          x: touches[0].clientX - rect.left,
          y: touches[0].clientY - rect.top
        }
      }
      const rect = host.getBoundingClientRect()
      return {
        x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
        y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top
      }
    }

    const onDown = (e) => {
      if (!isDrawingMode) return
      
      // Check if this is a stylus or pen input
      const isStylus = e.pointerType === 'pen' || 
                      (e.pointerType === 'touch' && (e.pressure > 0 || e.width < 10 || e.height < 10))
      
      // Handle stylus/pen input with pointer events
      if (isStylus || e.pointerType === 'mouse') {
        e.preventDefault()
        if (activeTool === 'pen') {
          isDrawingRef.current = true
          const [x, y] = getPoint(e)
          pointsRef.current = [[x, y, Math.sqrt(e.pressure || 0.5)]]
          svg.setPointerCapture(e.pointerId)
          updateLiveStroke()
        } else if (activeTool === 'eraser') {
          isErasingRef.current = true
          erasedIdsRef.current = new Set()
          svg.setPointerCapture(e.pointerId)
          handleEraseAtPoint(getPoint(e))
        }
        return
      }
      
      // Let touch events handle finger input for gestures
    }

    const onTouchStart = (e) => {
      if (!isDrawingMode) return
      
      // Skip if this touch event might be from a stylus (stylus should use pointer events)
      if (e.touches.length === 1) {
        const touch = e.touches[0]
        // Check if this might be a stylus by examining touch properties
        if (touch.force !== undefined && touch.force > 0) {
          // This might be a stylus with pressure, let pointer events handle it
          return
        }
      }
      
      e.preventDefault()
      
      if (e.touches.length === 2) {
        // Two fingers - start pinch zoom
        setIsZooming(true)
        setIsPanning(false)
        touchStartDistance.current = getTouchDistance(e.touches)
        touchStartZoom.current = zoom
        lastTouchCenter.current = getTouchCenter(e.touches)
        return
      }
      
      if (e.touches.length === 1 && zoom > 1) {
        // Single finger with zoom - start panning
        setIsPanning(true)
        setIsZooming(false)
        const rect = host.getBoundingClientRect()
        touchStartPan.current = {
          x: e.touches[0].clientX - rect.left - panOffset.x,
          y: e.touches[0].clientY - rect.top - panOffset.y
        }
        return
      }
      
      // Single finger drawing (fallback for devices without pointer events)
      if (activeTool === 'pen' && e.touches.length === 1) {
        isDrawingRef.current = true
        const touch = e.touches[0]
        const [x, y] = getPoint({ clientX: touch.clientX, clientY: touch.clientY })
        pointsRef.current = [[x, y, 0.5]]
        updateLiveStroke()
      } else if (activeTool === 'eraser' && e.touches.length === 1) {
        isErasingRef.current = true
        erasedIdsRef.current = new Set()
        const touch = e.touches[0]
        handleEraseAtPoint(getPoint({ clientX: touch.clientX, clientY: touch.clientY }))
      }
    }

    const onTouchMove = (e) => {
      if (!isDrawingMode) return
      
      // Skip if this might be a stylus touch (let pointer events handle it)
      if (e.touches.length === 1) {
        const touch = e.touches[0]
        if (touch.force !== undefined && touch.force > 0) {
          return
        }
      }
      
      e.preventDefault()
      
      if (e.touches.length === 2 && isZooming) {
        // Pinch zoom
        const distance = getTouchDistance(e.touches)
        const center = getTouchCenter(e.touches)
        const scaleFactor = distance / touchStartDistance.current
        const newZoom = Math.max(0.5, Math.min(5, touchStartZoom.current * scaleFactor))
        
        // Calculate pan offset to zoom around the touch center
        const zoomDelta = newZoom - zoom
        const newPanX = panOffset.x - (center.x - panOffset.x) * (zoomDelta / zoom)
        const newPanY = panOffset.y - (center.y - panOffset.y) * (zoomDelta / zoom)
        
        setZoom(newZoom)
        setPanOffset({ x: newPanX, y: newPanY })
        return
      }
      
      if (e.touches.length === 1 && isPanning) {
        // Pan
        const rect = host.getBoundingClientRect()
        const newPanX = e.touches[0].clientX - rect.left - touchStartPan.current.x
        const newPanY = e.touches[0].clientY - rect.top - touchStartPan.current.y
        setPanOffset({ x: newPanX, y: newPanY })
        return
      }
      
      // Drawing (fallback for devices without pointer events)
      if (e.touches.length === 1) {
        const touch = e.touches[0]
        if (isDrawingRef.current && activeTool === 'pen') {
          const [x, y] = getPoint({ clientX: touch.clientX, clientY: touch.clientY })
          pointsRef.current.push([x, y, 0.5])
          updateLiveStroke()
        } else if (isErasingRef.current && activeTool === 'eraser') {
          handleEraseAtPoint(getPoint({ clientX: touch.clientX, clientY: touch.clientY }))
        }
      }
    }

    const onTouchEnd = (e) => {
      if (!isDrawingMode) return
      e.preventDefault()
      
      if (e.touches.length === 0) {
        // All fingers lifted
        setIsZooming(false)
        setIsPanning(false)
        
        if (isDrawingRef.current && activeTool === 'pen') {
          isDrawingRef.current = false
          commitStroke()
        } else if (isErasingRef.current && activeTool === 'eraser') {
          isErasingRef.current = false
          commitEraseGesture()
        }
      } else if (e.touches.length === 1 && isZooming) {
        // Went from two fingers to one - stop zooming, maybe start panning
        setIsZooming(false)
        if (zoom > 1) {
          setIsPanning(true)
          const rect = host.getBoundingClientRect()
          touchStartPan.current = {
            x: e.touches[0].clientX - rect.left - panOffset.x,
            y: e.touches[0].clientY - rect.top - panOffset.y
          }
        }
      }
    }

    const onMove = (e) => {
      if (!isDrawingMode) return
      
      // Check if this is a stylus or pen input
      const isStylus = e.pointerType === 'pen' || 
                      (e.pointerType === 'touch' && (e.pressure > 0 || e.width < 10 || e.height < 10))
      
      // Handle stylus/pen input with pointer events
      if (isStylus || e.pointerType === 'mouse') {
        e.preventDefault()
        if (isDrawingRef.current && activeTool === 'pen') {
          const [x, y] = getPoint(e)
          pointsRef.current.push([x, y, Math.sqrt(e.pressure || 0.5)])
          updateLiveStroke()
        } else if (isErasingRef.current && activeTool === 'eraser') {
          handleEraseAtPoint(getPoint(e))
        }
        return
      }
      
      // Let touch events handle finger input
    }

    const onUp = (e) => {
      if (!isDrawingMode) return
      if (isDrawingRef.current && activeTool === 'pen') {
        isDrawingRef.current = false
        svg.releasePointerCapture(e.pointerId)
        commitStroke()
      } else if (isErasingRef.current && activeTool === 'eraser') {
        isErasingRef.current = false
        svg.releasePointerCapture(e.pointerId)
        commitEraseGesture()
      }
    }

    svg.addEventListener('pointerdown', onDown, { passive: false })
    svg.addEventListener('pointermove', onMove, { passive: false })
    svg.addEventListener('pointerup', onUp)
    svg.addEventListener('pointercancel', onUp)
    
    // Touch events for tablets
    svg.addEventListener('touchstart', onTouchStart, { passive: false })
    svg.addEventListener('touchmove', onTouchMove, { passive: false })
    svg.addEventListener('touchend', onTouchEnd, { passive: false })
    svg.addEventListener('touchcancel', onTouchEnd, { passive: false })
    
    return () => {
      svg.removeEventListener('pointerdown', onDown)
      svg.removeEventListener('pointermove', onMove)
      svg.removeEventListener('pointerup', onUp)
      svg.removeEventListener('pointercancel', onUp)
      svg.removeEventListener('touchstart', onTouchStart)
      svg.removeEventListener('touchmove', onTouchMove)
      svg.removeEventListener('touchend', onTouchEnd)
      svg.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [isDrawingMode, activeTool, penWidth, penColor, editorWrapperRef, zoom, panOffset])

  const handleToggleDrawing = () => {
    setIsDrawingMode((prev) => !prev)
    isDrawingRef.current = false
    isErasingRef.current = false
    clearLiveStroke()
  }

  const handleClearAll = () => {
    const now = Date.now()
    if (now - lastClearTapRef.current < 2000) {
      const previous = strokesRef.current
      if (!previous.length) return
      commitStrokes([], { type: 'clear', previousStrokes: previous })
      lastClearTapRef.current = 0
    } else {
      lastClearTapRef.current = now
    }
  }

  const handleResetZoom = () => {
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
  }

  const handleExport = async () => {
    const svg = svgRef.current
    if (!svg || !internalStrokes.length) return
    const rect = svg.getBoundingClientRect()
    const canvas = document.createElement('canvas')
    const scale = window.devicePixelRatio || 1
    canvas.width = rect.width * scale
    canvas.height = rect.height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    const cloned = svg.cloneNode(true)
    cloned.setAttribute('width', `${rect.width}`)
    cloned.setAttribute('height', `${rect.height}`)
    const svgString = new XMLSerializer().serializeToString(cloned)
    const v = await Canvg.from(ctx, svgString)
    await v.render()
    const link = document.createElement('a')
    link.download = `tedno-drawing-${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  // Scale preview dot: maps penWidth 2–24 → dot 4–16px
  const previewDotSize = Math.round(4 + ((penWidth - MIN_WIDTH) / (MAX_WIDTH - MIN_WIDTH)) * 12)

  return (
    <div className="drawing-layer">
      <svg
        ref={svgRef}
        className="drawing-svg"
        width={canvasSize.width}
        height={canvasSize.height}
        style={{ 
          pointerEvents: isDrawingMode ? 'auto' : 'none',
          transform: `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
          transformOrigin: '0 0'
        }}
      >
        <g className="drawing-strokes">
          {internalStrokes.map((stroke) => (
            <path key={stroke.id} d={stroke.d} fill={stroke.color} stroke="none" />
          ))}
        </g>
        <path ref={livePathRef} className="drawing-live-stroke" />
      </svg>

      <div className={`drawing-toolbar ${isDrawingMode ? 'drawing-toolbar--expanded' : 'drawing-toolbar--collapsed'}`}>
        {/* Toggle */}
        <button
          className={`drawing-toolbar-btn drawing-toolbar-toggle ${isDrawingMode ? 'is-active' : ''}`}
          onClick={handleToggleDrawing}
          type="button"
          title="Toggle drawing mode"
        >
          ✏
        </button>

        <div className="drawing-toolbar-main">
          {/* Pen */}
          <button
            type="button"
            className={`drawing-toolbar-btn ${activeTool === 'pen' ? 'is-active' : ''}`}
            onClick={() => setActiveTool('pen')}
            title="Pen"
          >
            ✏
          </button>

          {/* Eraser */}
          <button
            type="button"
            className={`drawing-toolbar-btn ${activeTool === 'eraser' ? 'is-active' : ''}`}
            onClick={() => setActiveTool('eraser')}
            title="Eraser"
          >
            ◻
          </button>

          <div className="drawing-toolbar-divider" />

          {/* Color swatches */}
          <div className="drawing-color-swatches">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`drawing-color-swatch ${penColor === color ? 'is-active' : ''}`}
                style={{ backgroundColor: color, color }}
                onClick={() => { setPenColor(color); setActiveTool('pen') }}
                title={color}
              />
            ))}
          </div>

          <div className="drawing-toolbar-divider" />

          {/* Width slider */}
          <div className="drawing-width-slider-wrap">
            <div className="drawing-width-preview">
              <span
                className="drawing-width-dot"
                style={{ width: previewDotSize, height: previewDotSize }}
              />
            </div>
            <input
              type="range"
              className="drawing-width-slider"
              min={MIN_WIDTH}
              max={MAX_WIDTH}
              step={1}
              value={penWidth}
              onChange={(e) => { setPenWidth(Number(e.target.value)); setActiveTool('pen') }}
              title={`Stroke width: ${penWidth}px`}
            />
          </div>

          <div className="drawing-toolbar-divider" />

          {/* Undo / Redo */}
          <button type="button" className="drawing-toolbar-btn" onClick={handleUndo} disabled={!history.length} title="Undo (Cmd+Z)">↶</button>
          <button type="button" className="drawing-toolbar-btn" onClick={handleRedo} disabled={!redoHistory.length} title="Redo (Cmd+Shift+Z)">↷</button>

          <div className="drawing-toolbar-divider" />

          {/* Clear */}
          <button type="button" className="drawing-toolbar-btn" onClick={handleClearAll} title="Clear (double-tap to confirm)">⌫</button>

          {/* Reset Zoom */}
          {zoom !== 1 && (
            <button type="button" className="drawing-toolbar-btn" onClick={handleResetZoom} title="Reset Zoom">⊙</button>
          )}

          {/* Export */}
          <button type="button" className="drawing-toolbar-btn" onClick={handleExport} title="Export PNG">↓</button>
        </div>
      </div>
    </div>
  )
}

export default DrawingCanvas