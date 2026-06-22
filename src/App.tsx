import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleIcon,
  ClipboardTextIcon,
  CornersOutIcon,
  DotsNineIcon,
  DownloadSimpleIcon,
  FolderOpenIcon,
  HandIcon,
  MinusIcon,
  PlusIcon,
  QuestionIcon,
  TrashIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { DiagramCanvas } from './components/DiagramCanvas'
import { Inspector } from './components/Inspector'
import { Toolbar } from './components/Toolbar'
import type { DiagramElement, DocumentState, Tool } from './model'
import { EMPTY_DOCUMENT } from './model'
import { decodeStoredDocument, parseStoredDocument, toMarkdown } from './rasterize'
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
  const [helpOpen, setHelpOpen] = useState(false)
  const [fileNotice, setFileNotice] = useState<'saved' | 'loaded' | 'error' | null>(null)
  const [maximizeCompatibility, setMaximizeCompatibility] = useState(false)
  const copyTimer = useRef<number | null>(null)
  const fileTimer = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      if (helpOpen) {
        if (event.key === 'Escape') setHelpOpen(false)
        return
      }
      if (confirmClear) {
        if (event.key === 'Escape') setConfirmClear(false)
        return
      }
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return
      const modifier = event.metaKey || event.ctrlKey
      if (event.key === '?') {
        event.preventDefault()
        setHelpOpen(true)
        return
      }
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
  }, [commit, confirmClear, document.elements, helpOpen, redo, selectedId, undo])

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
    const markdown = toMarkdown(document.elements, maximizeCompatibility)
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

  const showFileNotice = (notice: 'saved' | 'loaded' | 'error') => {
    setFileNotice(notice)
    if (fileTimer.current) window.clearTimeout(fileTimer.current)
    fileTimer.current = window.setTimeout(() => setFileNotice(null), 2600)
  }

  const saveDiagramToDisk = () => {
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `mark-draw-${date}.markdraw.json`
    window.document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    showFileNotice('saved')
  }

  const loadDiagramFromDisk = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const loaded = decodeStoredDocument(await file.text())
      if (!loaded) {
        showFileNotice('error')
        return
      }
      commit(loaded.elements)
      setSelectedId(null)
      setTool('select')
      setFitRequest((value) => value + 1)
      showFileNotice('loaded')
    } catch {
      showFileNotice('error')
    }
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
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept=".json,.markdraw.json,application/json"
              onChange={loadDiagramFromDisk}
              tabIndex={-1}
              aria-hidden="true"
            />
            <button type="button" className="file-button" onClick={() => fileInputRef.current?.click()} aria-label="Charger un diagramme" title="Charger un diagramme">
              <FolderOpenIcon size={20} />
            </button>
            <button type="button" className="file-button" onClick={saveDiagramToDisk} aria-label="Sauvegarder le diagramme sur le disque" title="Sauvegarder sur le disque">
              <DownloadSimpleIcon size={20} />
            </button>
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
            <div className="export-stack">
              <button type="button" className={copyStatus === 'copied' ? 'copy-button copied' : copyStatus === 'empty' ? 'copy-button empty' : 'copy-button'} onClick={copyMarkdown}>
                {copyStatus === 'copied' ? <CheckCircleIcon size={20} weight="bold" /> : <ClipboardTextIcon size={20} />}
                {copyStatus === 'copied' ? 'Markdown copié' : copyStatus === 'empty' ? 'Diagramme vide' : 'Copier Markdown'}
              </button>
              <label className="compatibility-option" title="Utiliser uniquement des caractères ASCII pour les bordures et les flèches">
                <input type="checkbox" checked={maximizeCompatibility} onChange={(event) => setMaximizeCompatibility(event.target.checked)} />
                <span>Maximiser la compatibilité</span>
              </label>
            </div>
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
            <button type="button" className="footer-help-control" onClick={() => setHelpOpen(true)} aria-label="Afficher l’aide" title="Aide et raccourcis (?)">
              <QuestionIcon size={20} weight="bold" />
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

      {fileNotice ? (
        <div className={fileNotice === 'error' ? 'toast file-toast warning' : 'toast file-toast success'} role="status" aria-live="polite">
          {fileNotice === 'error' ? <WarningCircleIcon size={21} weight="fill" /> : <CheckCircleIcon size={21} weight="fill" />}
          <div>
            <strong>{fileNotice === 'saved' ? 'Diagramme sauvegardé' : fileNotice === 'loaded' ? 'Diagramme chargé' : 'Fichier invalide'}</strong>
            <span>{fileNotice === 'saved' ? 'Le fichier JSON a été téléchargé.' : fileNotice === 'loaded' ? 'Le canevas a été remplacé avec succès.' : 'Ce fichier n’est pas un document Mark Draw valide.'}</span>
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

      {helpOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setHelpOpen(false)}>
          <div className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="help-heading">
              <div>
                <span className="help-symbol"><QuestionIcon size={22} weight="bold" /></span>
                <div>
                  <h2 id="help-title">Aide-mémoire Mark Draw</h2>
                  <p>L’essentiel pour dessiner sans perdre le fil.</p>
                </div>
              </div>
              <button type="button" className="dialog-close" onClick={() => setHelpOpen(false)} aria-label="Fermer l’aide" autoFocus>×</button>
            </div>

            <div className="reference-grid">
              <section>
                <h3>Outils</h3>
                <dl>
                  <div><dt>Sélection</dt><dd><kbd>V</kbd> <kbd>1</kbd></dd></div>
                  <div><dt>Boîte / Texte</dt><dd><kbd>2</kbd> <kbd>3</kbd></dd></div>
                  <div><dt>Ligne / Flèches</dt><dd><kbd>4</kbd> <kbd>5</kbd> <kbd>6</kbd></dd></div>
                  <div><dt>Main libre</dt><dd><kbd>7</kbd></dd></div>
                </dl>
              </section>

              <section>
                <h3>Connecteurs</h3>
                <ol>
                  <li>Cliquez pour poser le départ.</li>
                  <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + clic ajoute une ancre.</li>
                  <li>Un clic simple termine le tracé.</li>
                  <li><kbd>Échap</kbd> annule le tracé en cours.</li>
                </ol>
              </section>

              <section>
                <h3>Édition & navigation</h3>
                <dl>
                  <div><dt>Annuler</dt><dd><kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>Z</kbd></dd></div>
                  <div><dt>Rétablir</dt><dd><kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧ Z</kbd></dd></div>
                  <div><dt>Supprimer</dt><dd><kbd>Suppr</kbd></dd></div>
                  <div><dt>Déplacer la vue</dt><dd><kbd>Espace</kbd> + glisser</dd></div>
                  <div><dt>Zoomer</dt><dd>Molette</dd></div>
                </dl>
              </section>

              <section>
                <h3>Fichiers & Markdown</h3>
                <ul>
                  <li>Le dossier charge un fichier <code>.markdraw.json</code>.</li>
                  <li>La flèche télécharge le diagramme courant.</li>
                  <li><strong>Copier Markdown</strong> prépare un bloc de code.</li>
                  <li>Le mode compatibilité remplace les glyphes Unicode.</li>
                </ul>
              </section>
            </div>

            <div className="help-footer">
              <span>Astuce : sélectionnez un élément pour modifier ses propriétés.</span>
              <button type="button" className="primary-button" onClick={() => setHelpOpen(false)}>Compris</button>
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
