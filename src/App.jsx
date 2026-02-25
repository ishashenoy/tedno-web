import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from './supabaseClient'
import RichTextEditor, { RichTextToolbar } from './components/RichTextEditor'
import StickyNote from './components/StickyNote'
import DocumentManager from './components/DocumentManager'
import DrawingCanvas, { DrawingToolbar } from './components/DrawingCanvas'
import SignUp from './components/SignUp'
import SignIn from './components/SignIn'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import './App.css'

function App() {
  const [session, setSession] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [authView, setAuthView] = useState('signin') // 'signin' or 'signup'

  const [documents, setDocuments] = useState({}) // id -> { title, contentHtml, updatedAt }
  const [selectedDocumentId, setSelectedDocumentId] = useState(null)

  const [documentTitle, setDocumentTitle] = useState('')
  const [documentContent, setDocumentContent] = useState('')

  /** @type {[Array<{id: string, x: number, y: number, width: number, height: number, color: string, text: string, zIndex: number}>, Function]} */
  const [stickyNotes, setStickyNotes] = useState([])
  /** @type {[Array<{id: string, stroke_data: { d: string, color?: string, width?: number }}>, Function]} */
  const [strokes, setStrokes] = useState([])

  const [documentReady, setDocumentReady] = useState(false)
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [authLoading, setAuthLoading] = useState(false)
  const [error, setError] = useState(null)

  const editorWrapperRef = useRef(null)

  // Drawing mode state
  const [isDrawingMode, setIsDrawingMode] = useState(false)

  // Create editor instance for the fixed toolbar
  const editor = useEditor({
    extensions: [StarterKit],
    content: documentContent,
    onUpdate: ({ editor }) => {
      setDocumentContent(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'rich-text-editor-content',
      },
    },
  })

  // Update editor content when documentContent changes
  useEffect(() => {
    if (editor && editor.getHTML() !== documentContent) {
      editor.commands.setContent(documentContent, false)
    }
  }, [editor, documentContent])
  const contentSaveTimeoutRef = useRef(null)
  const notesSaveTimeoutRef = useRef(null)
  const strokesSaveTimeoutRef = useRef(null)
  const prevStrokesRef = useRef([])
  const lastStrokesDocIdRef = useRef(null)

  /* ================================
     ZOOM + PAN SYSTEM
  ================================= */

  const transformRef = useRef(null)

  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })

  const gestureRef = useRef({
    mode: null, // 'pan' | 'pinch'
    startZoom: 1,
    startPan: { x: 0, y: 0 },
    startDistance: 0,
    startCenter: { x: 0, y: 0 }
  })

  const rafRef = useRef(null)

  /* ---------- Helpers ---------- */

  function getDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.hypot(dx, dy)
  }

  function getCenter(touches, rect) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
      y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top
    }
  }

  function applyTransform() {
    if (!transformRef.current) return

    transformRef.current.style.transform =
      `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${zoomRef.current})`
  }

  function requestFrame() {
    if (rafRef.current) return

    rafRef.current = requestAnimationFrame(() => {
      applyTransform()
      rafRef.current = null
    })
  }

  // --- Auth ---
  useEffect(() => {
    const initAuth = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading session', error)
      }
      setSession(data?.session ?? null)
      setAuthChecked(true)
    }

    initAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleSignUp = useCallback(async (email, password) => {
    setAuthLoading(true)
    setError(null)
    console.log('Attempting to sign up with:', email)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    console.log('Sign up result:', { data, error })
    if (error) {
      setError(error.message)
    } else if (data?.user) {
      console.log('User created successfully:', data.user.id)
    }
    setAuthLoading(false)
  }, [])

  const handleSignIn = useCallback(async (email, password) => {
    setAuthLoading(true)
    setError(null)
    console.log('Attempting to sign in with:', email)
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    console.log('Sign in result:', { data, error })
    if (error) {
      setError(error.message)
    }
    setAuthLoading(false)
  }, [])

  const handleSignOut = useCallback(async () => {
    setAuthLoading(true)
    const { error } = await supabase.auth.signOut()
    if (error) {
      setError(error.message)
    }
    setAuthLoading(false)
  }, [])

  const handleSwitchToSignUp = useCallback(() => {
    setAuthView('signup')
    setError(null)
  }, [])

  const handleSwitchToSignIn = useCallback(() => {
    setAuthView('signin')
    setError(null)
  }, [])

  // --- Load documents after auth ---
  useEffect(() => {
    if (!session) {
      setLoadingInitial(false)
      return
    }

    let cancelled = false

    const loadDocuments = async () => {
      setLoadingInitial(true)
      setError(null)
      
      console.log('Loading documents for user:', session.user.id)

      const { data, error } = await supabase
        .from('documents')
        .select('id, title, content, created_at, updated_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true })

      if (cancelled) return

      if (error) {
        console.error('Error loading documents:', error)
        setError(`Database error: ${error.message}. Please make sure you've created the required Supabase tables.`)
        setLoadingInitial(false)
        return
      }

      const map = {}
      ;(data || []).forEach((row) => {
        const contentHtml =
          row?.content && typeof row.content === 'object' ? row.content.html || '' : ''
        map[row.id] = {
          title: row.title || 'Untitled',
          contentHtml,
          updatedAt: row.updated_at || row.created_at || null,
        }
      })

      // If no documents exist yet, create an initial one
      if (!data || data.length === 0) {
        const { data: inserted, error: insertError } = await supabase
          .from('documents')
          .insert({
            user_id: session.user.id,
            title: 'Untitled',
            content: { html: '' },
          })
          .select('id, title, content, created_at, updated_at')
          .single()

        if (cancelled) return

        if (insertError) {
          console.error('Error creating initial document:', insertError)
          setError(`Database error: ${insertError.message}. Please make sure you've created the required Supabase tables.`)
          setLoadingInitial(false)
          return
        }

        const html =
          inserted?.content && typeof inserted.content === 'object'
            ? inserted.content.html || ''
            : ''

        setDocuments({
          [inserted.id]: {
            title: inserted.title || 'Untitled',
            contentHtml: html,
            updatedAt: inserted.updated_at || inserted.created_at || null,
          },
        })
        setSelectedDocumentId(inserted.id)
        setDocumentTitle(inserted.title || 'Untitled')
        setDocumentContent(html)
        setStickyNotes([])
        setStrokes([])
        setLoadingInitial(false)
        return
      }

      setDocuments(map)

      // Select first document if none selected
      const first = data[0]
      if (!selectedDocumentId || !map[selectedDocumentId]) {
        const html =
          first?.content && typeof first.content === 'object'
            ? first.content.html || ''
            : ''
        setSelectedDocumentId(first.id)
        setDocumentTitle(first.title || 'Untitled')
        setDocumentContent(html)
        setStickyNotes([])
        setStrokes([])
      }

      setLoadingInitial(false)
    }

    loadDocuments()

    return () => {
      cancelled = true
    }
  }, [session, selectedDocumentId])

  // --- Layout: only enable drawing once editor height is stable ---
  useLayoutEffect(() => {
    if (!selectedDocumentId) return

    setDocumentReady(false)

    const host = editorWrapperRef.current
    if (!host) return

    let frame = requestAnimationFrame(() => {
      const height = host.scrollHeight || host.getBoundingClientRect().height
      if (height > 0) {
        setDocumentReady(true)
      }
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [selectedDocumentId, documentContent])

  // --- Fetch sticky notes and drawings after layout is ready ---
  useEffect(() => {
    if (!session || !selectedDocumentId || !documentReady) return

    let cancelled = false

    const loadNotesAndStrokes = async () => {
      const userId = session.user.id

      const [notesRes, strokesRes] = await Promise.all([
        supabase
          .from('sticky_notes')
          .select('id, note_data')
          .eq('user_id', userId)
          .eq('document_id', selectedDocumentId),
        supabase
          .from('drawings')
          .select('id, stroke_data')
          .eq('user_id', userId)
          .eq('document_id', selectedDocumentId),
      ])

      if (cancelled) return

      if (notesRes.error || strokesRes.error) {
        setError(notesRes.error?.message || strokesRes.error?.message)
        return
      }

      const loadedNotes = (notesRes.data || []).map((row) => row.note_data || {})
      const loadedStrokes = (strokesRes.data || []).map((row) => ({
        id: row.id,
        stroke_data: row.stroke_data || { d: '' },
      }))

      setStickyNotes(loadedNotes)
      setStrokes(loadedStrokes)
      prevStrokesRef.current = loadedStrokes
      lastStrokesDocIdRef.current = selectedDocumentId
    }

    loadNotesAndStrokes()

    return () => {
      cancelled = true
    }
  }, [session, selectedDocumentId, documentReady])

  // --- Debounced save for document content ---
  useEffect(() => {
    if (!session || !selectedDocumentId) return

    if (contentSaveTimeoutRef.current) {
      clearTimeout(contentSaveTimeoutRef.current)
    }

    contentSaveTimeoutRef.current = setTimeout(async () => {
      const userId = session.user.id
      const updatedAt = new Date().toISOString()

      const { error } = await supabase
        .from('documents')
        .update({
          content: { html: documentContent },
          updated_at: updatedAt,
        })
        .eq('user_id', userId)
        .eq('id', selectedDocumentId)

      if (error) {
        // eslint-disable-next-line no-console
        console.error('Error saving document content', error)
        return
      }

      setDocuments((prev) => ({
        ...prev,
        [selectedDocumentId]: {
          ...(prev[selectedDocumentId] || {}),
          title: documentTitle || prev[selectedDocumentId]?.title || 'Untitled',
          contentHtml: documentContent,
          updatedAt,
        },
      }))
    }, 400)

    return () => {
      if (contentSaveTimeoutRef.current) {
        clearTimeout(contentSaveTimeoutRef.current)
      }
    }
  }, [session, selectedDocumentId, documentContent, documentTitle])

  // --- Debounced upsert for sticky notes (optimistic) ---
  useEffect(() => {
    if (!session || !selectedDocumentId || !documentReady) return

    if (notesSaveTimeoutRef.current) {
      clearTimeout(notesSaveTimeoutRef.current)
    }

    const userId = session.user.id

    notesSaveTimeoutRef.current = setTimeout(async () => {
      const rows = stickyNotes.map((note) => ({
        id: note.id,
        user_id: userId,
        document_id: selectedDocumentId,
        note_data: note,
      }))

      if (!rows.length) return

      const { error } = await supabase
        .from('sticky_notes')
        .upsert(rows, { onConflict: 'id' })

      if (error) {
        // eslint-disable-next-line no-console
        console.error('Error saving sticky notes', error)
      }
    }, 400)

    return () => {
      if (notesSaveTimeoutRef.current) {
        clearTimeout(notesSaveTimeoutRef.current)
      }
    }
  }, [session, selectedDocumentId, documentReady, stickyNotes])

  // --- Debounced upsert & delete for strokes ---
  useEffect(() => {
    if (!session || !selectedDocumentId || !documentReady) return

    const userId = session.user.id

    // Avoid cross-document deletes when switching documents
    if (lastStrokesDocIdRef.current === selectedDocumentId) {
      const prev = prevStrokesRef.current || []
      const prevIds = new Set(prev.map((s) => s.id))
      const currIds = new Set(strokes.map((s) => s.id))
      const deletedIds = prev.filter((s) => !currIds.has(s.id)).map((s) => s.id)

      if (deletedIds.length) {
        supabase
          .from('drawings')
          .delete()
          .eq('user_id', userId)
          .eq('document_id', selectedDocumentId)
          .in('id', deletedIds)
          .then(({ error }) => {
            if (error) {
              // eslint-disable-next-line no-console
              console.error('Error deleting strokes', error)
            }
          })
      }
    }

    prevStrokesRef.current = strokes
    lastStrokesDocIdRef.current = selectedDocumentId

    if (strokesSaveTimeoutRef.current) {
      clearTimeout(strokesSaveTimeoutRef.current)
    }

    strokesSaveTimeoutRef.current = setTimeout(async () => {
      const rows = strokes.map((stroke) => ({
        id: stroke.id,
        user_id: userId,
        document_id: selectedDocumentId,
        stroke_data: stroke.stroke_data,
      }))

      if (!rows.length) return

      const { error } = await supabase.from('drawings').upsert(rows, { onConflict: 'id' })
      if (error) {
        // eslint-disable-next-line no-console
        console.error('Error saving strokes', error)
      }
    }, 400)

    return () => {
      if (strokesSaveTimeoutRef.current) {
        clearTimeout(strokesSaveTimeoutRef.current)
      }
    }
  }, [session, selectedDocumentId, documentReady, strokes])

  // --- Note handlers (optimistic) ---
  const handleCreateNote = useCallback(() => {
    setStickyNotes((prev) => {
      const maxZ = Math.max(0, ...prev.map((n) => n.zIndex || 0))
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `note-${Date.now()}-${Math.random().toString(16).slice(2)}`

      const newNote = {
        id,
        x: Math.random() * 300 + 50,
        y: Math.random() * 200 + 50,
        width: 200,
        height: 150,
        text: 'New note',
        color: '#ffeb3b',
        zIndex: maxZ + 1,
      }
      return [...prev, newNote]
    })
  }, [])

  const handleUpdateNote = useCallback((id, updates) => {
    setStickyNotes((prev) =>
      prev.map((note) => (note.id === id ? { ...note, ...updates } : note)),
    )
  }, [])

  const handleDeleteNote = useCallback(
    (id) => {
      setStickyNotes((prev) => prev.filter((note) => note.id !== id))

      if (session && selectedDocumentId) {
        const userId = session.user.id
        supabase
          .from('sticky_notes')
          .delete()
          .eq('user_id', userId)
          .eq('document_id', selectedDocumentId)
          .eq('id', id)
          .then(({ error }) => {
            if (error) {
              // eslint-disable-next-line no-console
              console.error('Error deleting sticky note', error)
            }
          })
      }
    },
    [session, selectedDocumentId],
  )

  const handleSelectNote = useCallback((id) => {
    setStickyNotes((prev) => {
      const maxZ = Math.max(0, ...prev.map((n) => n.zIndex || 0))
      return prev.map((note) =>
        note.id === id ? { ...note, zIndex: maxZ + 1 } : note,
      )
    })
  }, [])

  // --- Document management ---
  const handleCreateDocument = useCallback(
    async (title) => {
      if (!session) return
      const userId = session.user.id

      const { data, error } = await supabase
        .from('documents')
        .insert({
          user_id: userId,
          title: title || 'Untitled',
          content: { html: '' },
        })
        .select('id, title, content, created_at, updated_at')
        .single()

      if (error) {
        setError(error.message)
        return
      }

      const html =
        data?.content && typeof data.content === 'object' ? data.content.html || '' : ''

      setDocuments((prev) => ({
        ...prev,
        [data.id]: {
          title: data.title || 'Untitled',
          contentHtml: html,
          updatedAt: data.updated_at || data.created_at || null,
        },
      }))

      setSelectedDocumentId(data.id)
      setDocumentTitle(data.title || 'Untitled')
      setDocumentContent(html)
      setStickyNotes([])
      setStrokes([])
    },
    [session],
  )

  const handleLoadDocument = useCallback(
    (id) => {
      const doc = documents[id]
      if (!doc) return
      setSelectedDocumentId(id)
      setDocumentTitle(doc.title || 'Untitled')
      setDocumentContent(doc.contentHtml || '')
      setStickyNotes([])
      setStrokes([])
    },
    [documents],
  )

  const handleDeleteDocument = useCallback(
    async (id) => {
      if (!session) return
      const userId = session.user.id

      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('user_id', userId)
        .eq('id', id)

      if (error) {
        setError(error.message)
        return
      }

      setDocuments((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })

      if (selectedDocumentId === id) {
        const remainingIds = Object.keys(documents).filter((docId) => docId !== id)
        if (remainingIds.length > 0) {
          const fallbackId = remainingIds[0]
          const fallbackDoc = documents[fallbackId]
          setSelectedDocumentId(fallbackId)
          setDocumentTitle(fallbackDoc?.title || 'Untitled')
          setDocumentContent(fallbackDoc?.contentHtml || '')
          setStickyNotes([])
          setStrokes([])
        } else {
          setSelectedDocumentId(null)
          setDocumentTitle('')
          setDocumentContent('')
          setStickyNotes([])
          setStrokes([])
        }
      }
    },
    [session, selectedDocumentId, documents],
  )

  // Adapt backend-ready stroke shape to DrawingCanvas internal shape
  const canvasStrokes = useMemo(
    () =>
      (strokes || []).map((s) => ({
        id: s.id,
        d: s.stroke_data?.d || '',
        color: s.stroke_data?.color || '#37352f',
        width: s.stroke_data?.width || 8,
      })),
    [strokes],
  )

  const handleCanvasStrokesChange = useCallback((nextInternal) => {
    const next = (nextInternal || []).map((s) => ({
      id: s.id,
      stroke_data: {
        d: s.d,
        color: s.color,
        width: s.width,
      },
    }))
    setStrokes(next)
  }, [])

  const documentsForManager = useMemo(() => documents, [documents])

  /* ================================
    TOUCH SYSTEM
  ================================= */

  const handleTouchStart = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()

    if (e.touches.length === 1) {
      gestureRef.current.mode = 'pan'
      gestureRef.current.startPan = { ...panRef.current }
      gestureRef.current.startCenter = {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      }
    }

    if (e.touches.length === 2) {
      gestureRef.current.mode = 'pinch'
      gestureRef.current.startZoom = zoomRef.current
      gestureRef.current.startPan = { ...panRef.current }
      gestureRef.current.startDistance = getDistance(e.touches)
      gestureRef.current.startCenter = getCenter(e.touches, rect)
    }
  }

  const handleTouchMove = (e) => {
    e.preventDefault()

    const rect = e.currentTarget.getBoundingClientRect()

    if (gestureRef.current.mode === 'pan' && e.touches.length === 1) {
      const x = e.touches[0].clientX - rect.left
      const y = e.touches[0].clientY - rect.top

      panRef.current.x =
        gestureRef.current.startPan.x +
        (x - gestureRef.current.startCenter.x)

      panRef.current.y =
        gestureRef.current.startPan.y +
        (y - gestureRef.current.startCenter.y)

      requestFrame()
    }

    if (gestureRef.current.mode === 'pinch' && e.touches.length === 2) {
      const distance = getDistance(e.touches)
      const scaleFactor =
        distance / gestureRef.current.startDistance

      const newZoom =
        gestureRef.current.startZoom * scaleFactor

      zoomRef.current = Math.max(0.5, Math.min(3, newZoom))

      const center = getCenter(e.touches, rect)

      const ratio =
        zoomRef.current / gestureRef.current.startZoom

      panRef.current.x =
        center.x -
        (gestureRef.current.startCenter.x -
          gestureRef.current.startPan.x) *
          ratio

      panRef.current.y =
        center.y -
        (gestureRef.current.startCenter.y -
          gestureRef.current.startPan.y) *
          ratio

      requestFrame()
    }
  }

  const handleTouchEnd = () => {
    gestureRef.current.mode = null
  }

  // --- Render ---
  if (!authChecked) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>Tedno</h1>
        </header>
        <div
            className="editor-container"
          >
          <p>Loading…</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="auth-wrapper">
        {authView === 'signin' ? (
          <SignIn
            onSignIn={handleSignIn}
            onSwitchToSignUp={handleSwitchToSignUp}
            error={error}
            loading={authLoading}
          />
        ) : (
          <SignUp
            onSignUp={handleSignUp}
            onSwitchToSignIn={handleSwitchToSignIn}
            error={error}
            loading={authLoading}
          />
        )}
      </div>
    )
  }

return (
  <div className={`app ${isDrawingMode ? 'drawing-mode' : ''}`}>
    <header className="app-header">
      <h1>Tedno</h1>
      <div className="header-controls">
        <DocumentManager
          documents={documentsForManager}
          selectedDocument={selectedDocumentId}
          onCreateDocument={handleCreateDocument}
          onLoadDocument={handleLoadDocument}
          onDeleteDocument={handleDeleteDocument}
        />

        <button
          className="btn btn-primary"
          onClick={handleCreateNote}
          disabled={!selectedDocumentId}
        >
          + New Note
        </button>

        <div className="user-menu">
          <span className="user-email">
            {session?.user?.email || 'Guest'}
          </span>

          <button
            className="btn btn-secondary"
            onClick={handleSignOut}
            disabled={authLoading}
          >
            {authLoading ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>
      </div>
    </header>

    {/* Fixed Rich Text Toolbar */}
    <div className="rich-text-toolbar-container">
      <RichTextToolbar editor={editor} onToggleDrawing={() => setIsDrawingMode(!isDrawingMode)} isDrawingMode={isDrawingMode} />
    </div>

    {/* Fixed Drawing Toolbar */}
    {isDrawingMode && (
      <div className="drawing-toolbar-container">
        <DrawingToolbar />
      </div>
    )}

    {/* GESTURE LAYER */}
    <div
      className="gesture-layer"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* TRANSFORM LAYER (ONLY this moves) */}
      <div
        ref={transformRef}
        className="transform-layer"
      >
        {error && (
          <div className="error-box">
            <h3>Database Error</h3>
            <p>{error}</p>
            <p className="error-hint">
              Make sure you've created the required database tables in Supabase.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => setError(null)}
            >
              Retry
            </button>
          </div>
        )}

        {!error && (
          <>
            <div
              className="editor-container"
              ref={editorWrapperRef}
            >
              {loadingInitial ? (
                <div className="centered">
                  <p>Loading document…</p>
                </div>
              ) : !selectedDocumentId ? (
                <div className="centered">
                  <p>
                    No documents found. Click "+ New Document" to create one.
                  </p>
                </div>
              ) : (
                <RichTextEditor
                  content={documentContent}
                  onChange={setDocumentContent}
                  showToolbar={false}
                />
              )}
            </div>

            {documentReady && selectedDocumentId && (
              <DrawingCanvas
                editorWrapperRef={editorWrapperRef}
                strokes={canvasStrokes}
                onChangeStrokes={handleCanvasStrokesChange}
                isDrawingMode={isDrawingMode}
              />
            )}

            <div className="notes-layer">
              {stickyNotes.map((note) => (
                <StickyNote
                  key={note.id}
                  note={note}
                  onUpdate={handleUpdateNote}
                  onDelete={handleDeleteNote}
                  onSelect={handleSelectNote}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  </div>
)
}


export default App