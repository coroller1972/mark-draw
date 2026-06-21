import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleIcon,
  ClipboardTextIcon,
  CornersOutIcon,
  DotsNineIcon,
  HandIcon,
  MinusIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { DiagramCanvas } from './components/DiagramCanvas'
import { Inspector } from './components/Inspector'
import { Toolbar } from './components/Toolbar'
import type { DiagramElement, DocumentState, Tool } from './model'
import { EMPTY_DOCUMENT } from './model'
import { parseStoredDocument, toMarkdown } from './rasterize'
import markDrawLogo from './assets/mark-draw-logo.png'

const STORAGE_KEY = 'mark-draw.document.v1'
const TOOL_KEYS: Record<string, Tool> = {
  '1': 'select',
  '2': 'box',
  '3': 'text',
  '4': 'line',
  '5': 'arrow',
  '6': 'doubleArrow',
  '7': 'freeform',
  v: 'select',
}

function initialDocument(): DocumentState {
  if (typeof window === 'undefined') return EMPTY_DOCUMENT
  return parseStoredDocument(window.localStorage.getItem(STORAGE_KEY))
}

export function App() {
  const [document, setDocument] = useState<DocumentState>(initialDocument)
  const [past, setPast] = useState<DiagramElement[][]>([])
  const [future, setFuture] = useState<DiagramElement[][]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState({ x: 74, y: 70, zoom: 1 })
  const [showGrid, setShowGrid] = useState(true)
  const [fitRequest, setFitRequest] = useState(0)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'empty'>('idle')
  const [confirmClear, setConfirmClear] = useState(false)
  const copyTimer = useRef<number | null>(null)

  const commit = useCallback((elements: DiagramElement[]) => {
    setDocument((current) => {
      if (JSON.stringify(current.elements) === JSON.stringify(elements)) return current
      setPast((history) => [...history.slice(-99), current.elements])
      setFuture([])
      return { version: 1, elements }
    })
  }, [])

  const undo = useCallback(() => {
    setPast((history) => {
      if (!history.length) return history
      const previous = history.at(-1)!
      setDocument((current) => {
        setFuture((items) => [current.elements, ...items].slice(0, 100))
        return { version: 1, elements: previous }
      })
      return history.slice(0, -1)
    })
  }, [])

  const redo = useCallback(() => {
    setFuture((items) => {
      if (!items.length) return items
      const next = items[0]
      setDocument((current) => {
        setPast((history) => [...history.slice(-99), current.elements])
        return { version: 1, elements: next }
      })
      return items.slice(1)
    })
  }, [])

  useEffect(() => {
    setSaveStatus('saving')
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document))
      setSaveStatus('saved')
    }, 280)
    return () => window.clearTimeout(timer)
  }, [document])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (confirmClear) {
        if (event.key === 'Escape') setConfirmClear(false)
        return
      }
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault()
        commit(document.elements.filter((element) => element.id !== selectedId))
        setSelectedId(null)
        return
      }
      const nextTool = TOOL_KEYS[event.key.toLowerCase()]
      if (nextTool) setTool(nextTool)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commit, confirmClear, document.elements, redo, selectedId, undo])

  const selectedElement = useMemo(
    () => document.elements.find((element) => element.id === selectedId) ?? null,
    [document.elements, selectedId],
  )

  const copyMarkdown = async () => {
    if (document.elements.length === 0) {
      setCopyStatus('empty')
      if (copyTimer.current) window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopyStatus('idle'), 1800)
      return
    }
    const markdown = toMarkdown(document.elements)
    try {
      await navigator.clipboard.writeText(markdown)
    } catch {
      const textarea = window.document.createElement('textarea')
      textarea.value = markdown
      window.document.body.append(textarea)
      textarea.select()
      window.document.execCommand('copy')
      textarea.remove()
    }
    setCopyStatus('copied')
    if (copyTimer.current) window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopyStatus('idle'), 1800)
  }

  return (
    <>
      <main className="app-shell">
        <header className="app-header">
          <a className="brand" href="/" aria-label="Mark Draw — accueil">
            <span className="brand-mark"><img src={markDrawLogo} alt="" /></span>
            <span>Mark Draw</span>
          </a>
          <Toolbar active={tool} onSelect={setTool} onUndo={undo} onRedo={redo} canUndo={past.length > 0} canRedo={future.length > 0} />
          <div className="header-actions">
            <button
              type="button"
              className="clear-button"
              onClick={() => setConfirmClear(true)}
              disabled={document.elements.length === 0}
              aria-label="Créer un nouveau diagramme"
              title="Nouveau diagramme"
            >
              <TrashIcon size={20} />
            </button>
            <button type="button" className={copyStatus === 'copied' ? 'copy-button copied' : copyStatus === 'empty' ? 'copy-button empty' : 'copy-button'} onClick={copyMarkdown}>
              {copyStatus === 'copied' ? <CheckCircleIcon size={20} weight="bold" /> : <ClipboardTextIcon size={20} />}
              {copyStatus === 'copied' ? 'Markdown copié' : copyStatus === 'empty' ? 'Diagramme vide' : 'Copier Markdown'}
            </button>
          </div>
        </header>

        <section className="workspace" aria-label="Éditeur de diagramme">
          <DiagramCanvas
            elements={document.elements}
            tool={tool}
            selectedId={selectedId}
            view={view}
            showGrid={showGrid}
            fitRequest={fitRequest}
            onViewChange={setView}
            onCommit={commit}
            onSelect={setSelectedId}
          />
          {selectedElement ? (
            <Inspector
              element={selectedElement}
              onClose={() => setSelectedId(null)}
              onChange={(next) => commit(document.elements.map((element) => element.id === next.id ? next : element))}
            />
          ) : null}
        </section>

        <footer className="status-bar">
          <div className="viewport-controls" aria-label="Contrôles de la vue">
            <button type="button" onClick={() => setView((current) => ({ ...current, zoom: Math.max(0.5, current.zoom - 0.1) }))} aria-label="Dézoomer"><MinusIcon size={18} /></button>
            <button type="button" className="zoom-value" onClick={() => setView((current) => ({ ...current, zoom: 1 }))}>{Math.round(view.zoom * 100)}%</button>
            <button type="button" onClick={() => setView((current) => ({ ...current, zoom: Math.min(2.5, current.zoom + 0.1) }))} aria-label="Zoomer"><PlusIcon size={18} /></button>
            <span className="control-divider" />
            <button type="button" onClick={() => document.elements.length ? setFitRequest((value) => value + 1) : setView({ x: 74, y: 70, zoom: 1 })} aria-label="Adapter le diagramme à l’écran" title="Adapter à l’écran"><CornersOutIcon size={19} /></button>
            <button type="button" className={tool === 'hand' ? 'hand-control active' : 'hand-control'} onClick={() => setTool((current) => current === 'hand' ? 'select' : 'hand')} aria-label="Outil main pour déplacer la vue" aria-pressed={tool === 'hand'} title="Main — déplacer la vue"><HandIcon size={20} weight={tool === 'hand' ? 'fill' : 'regular'} /></button>
            <button
              type="button"
              className={showGrid ? 'grid-control active' : 'grid-control'}
              aria-label={showGrid ? 'Masquer la grille' : 'Afficher la grille'}
              aria-pressed={showGrid}
              title={showGrid ? 'Masquer la grille' : 'Afficher la grille'}
              onClick={() => setShowGrid((visible) => !visible)}
            >
              <DotsNineIcon size={20} weight={showGrid ? 'fill' : 'regular'} />
            </button>
          </div>
          <div className={saveStatus === 'saved' ? 'save-status saved' : 'save-status'} role="status">
            <CheckCircleIcon size={21} weight={saveStatus === 'saved' ? 'fill' : 'regular'} />
            <span>{saveStatus === 'saved' ? 'Autosauvegardé' : 'Enregistrement…'}</span>
            <small>{saveStatus === 'saved' ? 'à l’instant' : ''}</small>
            <i />
          </div>
        </footer>
      </main>

      {copyStatus !== 'idle' ? (
        <div className={copyStatus === 'copied' ? 'toast success' : 'toast warning'} role="status" aria-live="polite">
          {copyStatus === 'copied' ? <CheckCircleIcon size={21} weight="fill" /> : <WarningCircleIcon size={21} weight="fill" />}
          <div>
            <strong>{copyStatus === 'copied' ? 'Prêt à coller' : 'Rien à copier'}</strong>
            <span>{copyStatus === 'copied' ? 'Le bloc Markdown est dans le presse-papiers.' : 'Dessinez au moins un élément avant l’export.'}</span>
          </div>
        </div>
      ) : null}

      {confirmClear ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setConfirmClear(false)}>
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-icon"><TrashIcon size={22} /></div>
            <h2 id="clear-title">Nouveau diagramme ?</h2>
            <p>Le canevas actuel sera effacé. Vous pourrez encore utiliser Annuler juste après.</p>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setConfirmClear(false)} autoFocus>Annuler</button>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  commit([])
                  setSelectedId(null)
                  setConfirmClear(false)
                }}
              >
                Effacer le canevas
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="desktop-required">
        <div className="brand-mark large"><img src={markDrawLogo} alt="" /></div>
        <h1>Mark Draw préfère un grand écran</h1>
        <p>Ouvrez l’éditeur sur un ordinateur avec une fenêtre d’au moins 900 px.</p>
      </section>
    </>
  )
}
