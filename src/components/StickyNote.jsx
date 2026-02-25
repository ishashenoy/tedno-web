import { memo, useState, useRef, useEffect } from 'react'
import Draggable from 'react-draggable'
import { Resizable } from 'react-resizable'
import 'react-resizable/css/styles.css'
import './StickyNote.css'

const StickyNote = ({ note, onUpdate, onDelete, onSelect }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [text, setText] = useState(note.text)
  const textareaRef = useRef(null)

  useEffect(() => {
    setText(note.text)
  }, [note.text])

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [isEditing])

  const handleDragStop = (e, data) => {
    onUpdate(note.id, { x: data.x, y: data.y })
  }

  const handleResize = (e, { size }) => {
    onUpdate(note.id, { width: size.width, height: size.height })
  }

  const handleTextChange = (e) => {
    setText(e.target.value)
  }

  const handleTextBlur = () => {
    setIsEditing(false)
    onUpdate(note.id, { text })
  }

  const handleTextKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      setIsEditing(false)
      onUpdate(note.id, { text })
    } else if (e.key === 'Escape') {
      setText(note.text)
      setIsEditing(false)
    }
  }

  const handleDoubleClick = () => {
    setIsEditing(true)
    onSelect(note.id)
  }

  const handleClick = () => {
    onSelect(note.id)
  }

  const handleColorChange = (color) => {
    onUpdate(note.id, { color })
  }

  const colorOptions = [
    '#ffeb3b', // Yellow
    '#ff9800', // Orange
    '#f44336', // Red
    '#e91e63', // Pink
    '#9c27b0', // Purple
    '#673ab7', // Deep Purple
    '#3f51b5', // Indigo
    '#2196f3', // Blue
    '#00bcd4', // Cyan
    '#4caf50', // Green
    '#8bc34a', // Light Green
    '#cddc39', // Lime
  ]

  return (
    <Draggable
      handle=".sticky-note-header"
      defaultPosition={{ x: note.x, y: note.y }}
      position={{ x: note.x, y: note.y }}
      onStop={handleDragStop}
      bounds="parent"
    >
      <div className="sticky-note-wrapper" style={{ zIndex: note.zIndex || 1 }}>
        <Resizable
          width={note.width}
          height={note.height}
          onResize={handleResize}
          minConstraints={[150, 100]}
          maxConstraints={[600, 400]}
          handle={
            <div className="resize-handle">
              <span>↘</span>
            </div>
          }
        >
          <div
            className="sticky-note"
            style={{ 
              backgroundColor: note.color,
              width: '100%',
              height: '100%'
            }}
            onClick={handleClick}
          >
            <div className="sticky-note-header">
              <div className="color-picker">
                {colorOptions.map(color => (
                  <button
                    key={color}
                    className="color-option"
                    style={{ backgroundColor: color }}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleColorChange(color)
                    }}
                    title={`Change color to ${color}`}
                  />
                ))}
              </div>
              <button
                className="delete-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(note.id)
                }}
                title="Delete note"
              >
                ×
              </button>
            </div>
            
            <div className="sticky-note-content">
              {isEditing ? (
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={handleTextChange}
                  onBlur={handleTextBlur}
                  onKeyDown={handleTextKeyDown}
                  className="sticky-note-textarea"
                  style={{
                    width: '100%',
                    height: '100%',
                    resize: 'none',
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    padding: '8px',
                  }}
                />
              ) : (
                <div
                  className="sticky-note-text"
                  onDoubleClick={handleDoubleClick}
                >
                  {text || 'Double-click to edit'}
                </div>
              )}
            </div>
          </div>
        </Resizable>
      </div>
    </Draggable>
  )
}

export default memo(StickyNote)
