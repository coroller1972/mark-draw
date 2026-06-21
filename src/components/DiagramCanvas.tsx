import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DiagramElement, Point, Tool } from '../model'
import { createId, elementBounds, moveElement } from '../model'
import { rasterizeElements } from '../rasterize'

const CELL_WIDTH = 11
const CELL_HEIGHT = 18
const FONT_SIZE = 14

type ViewState = { x: number; y: number; zoom: number }

type CanvasProps = {
  elements: DiagramElement[]
  tool: Tool
  selectedId: string | null
  view: ViewState
  showGrid: boolean
  fitRequest: number
  onViewChange: (view: ViewState) => void
  onCommit: (elements: DiagramElement[]) => void
  onSelect: (id: string | null) => void
}

type Gesture =
  | { kind: 'draw'; start: Point; current: Point; points: Point[] }
  | { kind: 'text'; point: Point }
  | { kind: 'connectorStart'; point: Point }
  | { kind: 'connectorNext'; point: Point }
  | { kind: 'move'; start: Point; element: DiagramElement }
  | { kind: 'resize'; element: DiagramElement }
  | { kind: 'endpoint'; element: DiagramElement; endpoint: 'start' | 'end' | number }
  | { kind: 'pan'; clientX: number; clientY: number; view: ViewState }

type ConnectorDraft = {
  tool: 'line' | 'arrow' | 'doubleArrow'
  points: Point[]
  current: Point
}

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y

const cellFromEvent = (event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement, view: ViewState): Point => {
  const rect = canvas.getBoundingClientRect()
  return {
    x: Math.round((event.clientX - rect.left - view.x) / (CELL_WIDTH * view.zoom)),
    y: Math.round((event.clientY - rect.top - view.y) / (CELL_HEIGHT * view.zoom)),
  }
}

const hitElement = (elements: DiagramElement[], point: Point) =>
  elements.slice().sort((a, b) => b.z - a.z).find((element) => {
    const bounds = elementBounds(element)
    return point.x >= bounds.x - 1 && point.x <= bounds.x + bounds.width && point.y >= bounds.y - 1 && point.y <= bounds.y + bounds.height
  })

function draftElement(tool: Tool, gesture: Extract<Gesture, { kind: 'draw' }>, z: number): DiagramElement | null {
  const { start, current } = gesture
  if (tool === 'box') {
    const x = Math.min(start.x, current.x)
    const y = Math.min(start.y, current.y)
    return { id: 'draft', z, type: 'box', x, y, width: Math.max(3, Math.abs(current.x - start.x) + 1), height: Math.max(3, Math.abs(current.y - start.y) + 1), text: 'Boîte' }
  }
  if (tool === 'line' || tool === 'arrow' || tool === 'doubleArrow') {
    return { id: 'draft', z, type: tool, start, end: current, anchors: [], lineStyle: 'solid' }
  }
  if (tool === 'freeform') return { id: 'draft', z, type: 'freeform', points: gesture.points, character: 'x' }
  return null
}

export function DiagramCanvas({ elements, tool, selectedId, view, showGrid, fitRequest, onViewChange, onCommit, onSelect }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [connectorDraft, setConnectorDraft] = useState<ConnectorDraft | null>(null)
  const [spacePressed, setSpacePressed] = useState(false)
  const [textEditor, setTextEditor] = useState<{ point: Point; value: string } | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (fitRequest === 0 || elements.length === 0) return
    const bounds = elements.map(elementBounds)
    const minX = Math.min(...bounds.map((item) => item.x))
    const minY = Math.min(...bounds.map((item) => item.y))
    const maxX = Math.max(...bounds.map((item) => item.x + item.width))
    const maxY = Math.max(...bounds.map((item) => item.y + item.height))
    const contentWidth = Math.max(1, (maxX - minX + 6) * CELL_WIDTH)
    const contentHeight = Math.max(1, (maxY - minY + 6) * CELL_HEIGHT)
    const zoom = Math.min(1.6, Math.max(0.5, Math.min(size.width / contentWidth, size.height / contentHeight)))
    onViewChange({
      zoom,
      x: (size.width - (maxX - minX) * CELL_WIDTH * zoom) / 2 - minX * CELL_WIDTH * zoom,
      y: (size.height - (maxY - minY) * CELL_HEIGHT * zoom) / 2 - minY * CELL_HEIGHT * zoom,
    })
  // fitRequest is the explicit trigger; the remaining values are read at that moment.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConnectorDraft(null)
        setGesture(null)
      }
      if (event.code === 'Space' && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault()
        setSpacePressed(true)
      }
    }
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useEffect(() => {
    if (connectorDraft && tool !== connectorDraft.tool) setConnectorDraft(null)
  }, [connectorDraft, tool])

  const visibleElements = useMemo(() => {
    if (!gesture) {
      if (connectorDraft) {
        return [...elements, {
          id: 'draft',
          z: elements.length,
          type: connectorDraft.tool,
          start: connectorDraft.points[0],
          anchors: connectorDraft.points.slice(1),
          end: connectorDraft.current,
          lineStyle: 'solid' as const,
        }]
      }
      return elements
    }
    if (gesture.kind === 'draw') {
      const draft = draftElement(tool, gesture, elements.length)
      return draft ? [...elements, draft] : elements
    }
    if (gesture.kind === 'connectorNext' && connectorDraft) {
      return [...elements, {
        id: 'draft',
        z: elements.length,
        type: connectorDraft.tool,
        start: connectorDraft.points[0],
        anchors: connectorDraft.points.slice(1),
        end: gesture.point,
        lineStyle: 'solid' as const,
      }]
    }
    if (gesture.kind === 'move') {
      return elements.map((element) => element.id === gesture.element.id ? gesture.element : element)
    }
    if (gesture.kind === 'resize' || gesture.kind === 'endpoint') {
      return elements.map((element) => element.id === gesture.element.id ? gesture.element : element)
    }
    return elements
  }, [connectorDraft, elements, gesture, tool])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = size.width * ratio
    canvas.height = size.height * ratio
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`
    const context = canvas.getContext('2d')
    if (!context) return
    context.scale(ratio, ratio)
    context.clearRect(0, 0, size.width, size.height)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, size.width, size.height)

    const cellWidth = CELL_WIDTH * view.zoom
    const cellHeight = CELL_HEIGHT * view.zoom
    const minX = Math.floor(-view.x / cellWidth) - 1
    const maxX = Math.ceil((size.width - view.x) / cellWidth) + 1
    const minY = Math.floor(-view.y / cellHeight) - 1
    const maxY = Math.ceil((size.height - view.y) / cellHeight) + 1
    if (showGrid) {
      context.fillStyle = '#c5c9e4'
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          context.beginPath()
          context.arc(view.x + x * cellWidth, view.y + y * cellHeight, Math.max(0.8, view.zoom * 0.85), 0, Math.PI * 2)
          context.fill()
        }
      }
    }

    const raster = rasterizeElements(visibleElements)
    context.font = `${FONT_SIZE * view.zoom}px "JetBrains Mono", "SFMono-Regular", Consolas, monospace`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#111827'
    raster.forEach((character, cell) => {
      const [x, y] = cell.split(',').map(Number)
      const px = view.x + x * cellWidth
      const py = view.y + y * cellHeight
      if (px > -cellWidth && px < size.width + cellWidth && py > -cellHeight && py < size.height + cellHeight) {
        context.fillText(character, px, py)
      }
    })

    const selected = visibleElements.find((element) => element.id === selectedId)
    if (selected) {
      const bounds = elementBounds(selected)
      const x = view.x + (bounds.x - 0.65) * cellWidth
      const y = view.y + (bounds.y - 0.65) * cellHeight
      const width = (bounds.width + 0.3) * cellWidth
      const height = (bounds.height + 0.3) * cellHeight
      context.strokeStyle = '#5b5ce2'
      context.lineWidth = 1.5
      context.setLineDash([4, 3])
      context.strokeRect(x, y, width, height)
      context.setLineDash([])
      const handles: Point[] = selected.type === 'line' || selected.type === 'arrow' || selected.type === 'doubleArrow'
        ? [selected.start, ...selected.anchors, selected.end]
        : selected.type === 'box'
          ? [{ x: selected.x + selected.width - 1, y: selected.y + selected.height - 1 }]
          : []
      handles.forEach((handle) => {
        context.fillStyle = '#ffffff'
        context.strokeStyle = '#5b5ce2'
        context.lineWidth = 2
        context.fillRect(view.x + handle.x * cellWidth - 4, view.y + handle.y * cellHeight - 4, 8, 8)
        context.strokeRect(view.x + handle.x * cellWidth - 4, view.y + handle.y * cellHeight - 4, 8, 8)
      })
    }
  }, [selectedId, showGrid, size, view, visibleElements])

  const commitText = useCallback(() => {
    if (!textEditor) return
    const value = textEditor.value.trim()
    if (value) onCommit([...elements, { id: createId(), z: elements.length, type: 'text', x: textEditor.point.x, y: textEditor.point.y, text: value }])
    setTextEditor(null)
  }, [elements, onCommit, textEditor])

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(event.pointerId)
    if (tool === 'hand' || spacePressed || event.button === 1) {
      setGesture({ kind: 'pan', clientX: event.clientX, clientY: event.clientY, view })
      return
    }
    const point = cellFromEvent(event, canvas, view)
    if (connectorDraft && (tool === 'line' || tool === 'arrow' || tool === 'doubleArrow')) {
      setGesture({ kind: 'connectorNext', point })
      return
    }
    if (tool === 'line' || tool === 'arrow' || tool === 'doubleArrow') {
      event.preventDefault()
      setGesture({ kind: 'connectorStart', point })
      return
    }
    if (tool === 'text') {
      event.preventDefault()
      setGesture({ kind: 'text', point })
      return
    }
    if (tool !== 'select') {
      setGesture({ kind: 'draw', start: point, current: point, points: [point] })
      return
    }
    const selected = elements.find((element) => element.id === selectedId)
    if (selected?.type === 'box' && samePoint(point, { x: selected.x + selected.width - 1, y: selected.y + selected.height - 1 })) {
      setGesture({ kind: 'resize', element: selected })
      return
    }
    if (selected && (selected.type === 'line' || selected.type === 'arrow' || selected.type === 'doubleArrow')) {
      if (samePoint(point, selected.start)) {
        setGesture({ kind: 'endpoint', element: selected, endpoint: 'start' })
        return
      }
      if (samePoint(point, selected.end)) {
        setGesture({ kind: 'endpoint', element: selected, endpoint: 'end' })
        return
      }
      const anchorIndex = selected.anchors.findIndex((anchor) => samePoint(point, anchor))
      if (anchorIndex >= 0) {
        setGesture({ kind: 'endpoint', element: selected, endpoint: anchorIndex })
        return
      }
    }
    const hit = hitElement(elements, point)
    onSelect(hit?.id ?? null)
    if (hit) setGesture({ kind: 'move', start: point, element: hit })
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!gesture) {
      if (connectorDraft) setConnectorDraft({ ...connectorDraft, current: cellFromEvent(event, canvas, view) })
      return
    }
    if (gesture.kind === 'pan') {
      onViewChange({ ...gesture.view, x: gesture.view.x + event.clientX - gesture.clientX, y: gesture.view.y + event.clientY - gesture.clientY })
      return
    }
    const point = cellFromEvent(event, canvas, view)
    if (gesture.kind === 'text' || gesture.kind === 'connectorStart') return
    if (gesture.kind === 'connectorNext') {
      setGesture({ ...gesture, point })
      return
    }
    if (gesture.kind === 'draw') {
      const points = tool === 'freeform' && !gesture.points.some((item) => samePoint(item, point)) ? [...gesture.points, point] : gesture.points
      setGesture({ ...gesture, current: point, points })
    } else if (gesture.kind === 'move') {
      setGesture({ ...gesture, element: moveElement(elements.find((element) => element.id === gesture.element.id)!, point.x - gesture.start.x, point.y - gesture.start.y) })
    } else if (gesture.kind === 'resize' && gesture.element.type === 'box') {
      setGesture({ ...gesture, element: { ...gesture.element, width: Math.max(3, point.x - gesture.element.x + 1), height: Math.max(3, point.y - gesture.element.y + 1) } })
    } else if (gesture.kind === 'endpoint' && (gesture.element.type === 'line' || gesture.element.type === 'arrow' || gesture.element.type === 'doubleArrow')) {
      if (typeof gesture.endpoint === 'number') {
        setGesture({ ...gesture, element: { ...gesture.element, anchors: gesture.element.anchors.map((anchor, index) => index === gesture.endpoint ? point : anchor) } })
      } else {
        setGesture({ ...gesture, element: { ...gesture.element, [gesture.endpoint]: point } })
      }
    }
  }

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!gesture) return
    const keepDrawing = event.ctrlKey || event.metaKey
    if (gesture.kind === 'connectorStart' && (tool === 'line' || tool === 'arrow' || tool === 'doubleArrow')) {
      setConnectorDraft({ tool, points: [gesture.point], current: gesture.point })
    } else if (gesture.kind === 'connectorNext' && connectorDraft) {
      if (keepDrawing) {
        const points = samePoint(connectorDraft.points.at(-1)!, gesture.point)
          ? connectorDraft.points
          : [...connectorDraft.points, gesture.point]
        setConnectorDraft({ ...connectorDraft, points, current: gesture.point })
      } else {
        const created: DiagramElement = {
          id: createId(),
          z: elements.length,
          type: connectorDraft.tool,
          start: connectorDraft.points[0],
          anchors: connectorDraft.points.slice(1),
          end: gesture.point,
          lineStyle: 'solid',
        }
        onCommit([...elements, created])
        onSelect(created.id)
        setConnectorDraft(null)
      }
    } else if (gesture.kind === 'text') {
      setTextEditor({ point: gesture.point, value: '' })
    } else if (gesture.kind === 'draw') {
      const draft = draftElement(tool, gesture, elements.length)
      if (draft) {
        const created = { ...draft, id: createId() } as DiagramElement
        onCommit([...elements, created])
        onSelect(created.id)
      }
    } else if (gesture.kind === 'move' || gesture.kind === 'resize' || gesture.kind === 'endpoint') {
      onCommit(elements.map((element) => element.id === gesture.element.id ? gesture.element : element))
    }
    setGesture(null)
  }

  return (
    <div ref={containerRef} className={`canvas-container tool-${tool}${spacePressed ? ' panning' : ''}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setGesture(null)}
        onWheel={(event) => {
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          const pointerX = event.clientX - rect.left
          const pointerY = event.clientY - rect.top
          const worldX = (pointerX - view.x) / view.zoom
          const worldY = (pointerY - view.y) / view.zoom
          const zoom = Math.min(2.5, Math.max(0.5, view.zoom * (event.deltaY > 0 ? 0.9 : 1.1)))
          onViewChange({ zoom, x: pointerX - worldX * zoom, y: pointerY - worldY * zoom })
        }}
        aria-label="Zone de dessin ASCII"
      />
      {elements.length === 0 && !gesture && !connectorDraft && !textEditor ? (
        <div className="empty-canvas" aria-hidden="true">
          <strong>Commencez votre diagramme</strong>
          <span>Choisissez un outil ou appuyez sur <kbd>2</kbd> pour dessiner une boîte.</span>
        </div>
      ) : null}
      {connectorDraft ? (
        <div className="connector-hint" role="status">
          <strong>{connectorDraft.points.length - 1} point{connectorDraft.points.length > 2 ? 's' : ''} d’ancrage</strong>
          <span><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + clic pour poser une ancre · clic simple pour terminer · <kbd>Échap</kbd> pour annuler</span>
        </div>
      ) : null}
      {textEditor ? (
        <input
          className="canvas-text-editor"
          style={{ left: view.x + textEditor.point.x * CELL_WIDTH * view.zoom, top: view.y + textEditor.point.y * CELL_HEIGHT * view.zoom }}
          value={textEditor.value}
          autoFocus
          placeholder="Saisissez votre texte…"
          onChange={(event) => setTextEditor({ ...textEditor, value: event.target.value })}
          onBlur={commitText}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitText()
            if (event.key === 'Escape') setTextEditor(null)
          }}
          aria-label="Texte du diagramme"
        />
      ) : null}
    </div>
  )
}
