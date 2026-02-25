import { useState, useMemo } from 'react'
import './DocumentManager.css'

const DocumentManager = ({
  documents,
  selectedDocument,
  onCreateDocument,
  onLoadDocument,
  onDeleteDocument,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [newDocName, setNewDocName] = useState('')

  const documentList = useMemo(() => {
    const entries = Object.entries(documents || {})
    return entries
      .map(([id, doc]) => ({
        id,
        title: doc?.title || 'Untitled',
        updatedAt: doc?.updatedAt || null,
      }))
      .sort((a, b) => {
        if (a.updatedAt && b.updatedAt) {
          return b.updatedAt.localeCompare(a.updatedAt)
        }
        return a.title.localeCompare(b.title)
      })
  }, [documents])

  const handleCreate = () => {
    const title = newDocName.trim()
    if (!title) return

    const exists = documentList.some((doc) => doc.title === title)
    if (exists) {
      setNewDocName('')
      setIsOpen(false)
      return
    }

    onCreateDocument(title)
    setNewDocName('')
    setIsOpen(false)
  }

  return (
    <div className="document-manager">
      <button className="btn btn-secondary" onClick={() => setIsOpen(!isOpen)}>
        📄 Documents
      </button>

      {isOpen && (
        <div className="document-manager-dropdown">
          <div className="document-manager-header">
            <h3>Documents</h3>
            <button className="close-btn" onClick={() => setIsOpen(false)}>
              ×
            </button>
          </div>

          <div className="document-list">
            {documentList.length === 0 ? (
              <p className="empty-message">No documents yet</p>
            ) : (
              documentList.map((doc) => (
                <div
                  key={doc.id}
                  className={`document-item ${
                    selectedDocument === doc.id ? 'active' : ''
                  }`}
                >
                  <button
                    className="document-name"
                    onClick={() => {
                      onLoadDocument(doc.id)
                      setIsOpen(false)
                    }}
                  >
                    {doc.title}
                  </button>
                  <button
                    className="delete-doc-btn"
                    onClick={() => onDeleteDocument(doc.id)}
                    title="Delete document"
                  >
                    🗑️
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="create-document">
            <input
              type="text"
              placeholder="New document name..."
              value={newDocName}
              onChange={(e) => setNewDocName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreate()
                }
              }}
            />
            <button className="btn btn-primary" onClick={handleCreate}>
              Create
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default DocumentManager
