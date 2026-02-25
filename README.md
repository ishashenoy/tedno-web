# Tedno - Rich Text Editor with Sticky Notes

A modern React web application featuring a rich text editor with draggable, resizable sticky notes.

## Features

- **Rich Text Editor**: Full-featured editor with formatting options (bold, italic, headings, lists, quotes, etc.)
- **Draggable Sticky Notes**: Create and position notes anywhere on the document
- **Resizable Notes**: Adjust the size of sticky notes by dragging the corner
- **Inline Editing**: Double-click notes to edit their content
- **Color Customization**: Change sticky note colors from a palette
- **Multiple Documents**: Create, save, and load multiple documents
- **Persistent Storage**: All data is saved to browser local storage
- **Z-Index Management**: Clicking a note brings it to the front

## Tech Stack

- **React 18** - Modern React with hooks
- **TipTap** - Rich text editor framework
- **react-draggable** - Drag and drop functionality
- **react-resizable** - Resizable components
- **Vite** - Fast build tool and dev server

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Build

```bash
npm run build
```

## Usage

1. **Editing Text**: Use the toolbar to format your document content
2. **Creating Notes**: Click the "+ New Note" button to create a sticky note
3. **Moving Notes**: Click and drag the note header to reposition it
4. **Resizing Notes**: Hover over the bottom-right corner and drag to resize
5. **Editing Notes**: Double-click a note to edit its text inline
6. **Changing Colors**: Hover over a note and click a color from the palette
7. **Managing Documents**: Click "Documents" to create, load, or delete documents

## Keyboard Shortcuts

- **Ctrl/Cmd + Enter**: Save note edits (when editing)
- **Escape**: Cancel note edits

## Browser Support

Modern browsers that support ES6+ and local storage.
