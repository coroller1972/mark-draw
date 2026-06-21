import type { DiagramElement, DocumentState, Point } from './model'

const N = 1
const E = 2
const S = 4
const W = 8

const GLYPHS: Record<number, string> = {
  [N | S]: '│',
  [E | W]: '─',
  [E | S]: '┌',
  [S | W]: '┐',
  [N | E]: '└',
  [N | W]: '┘',
  [N | E | S]: '├',
  [N | S | W]: '┤',
  [E | S | W]: '┬',
  [N | E | W]: '┴',
  [N | E | S | W]: '┼',
  [N]: '│',
  [E]: '─',
  [S]: '│',
  [W]: '─',
}

const key = (point: Point) => `${point.x},${point.y}`

const direction = (from: Point, to: Point) => {
  if (to.x > from.x) return E
  if (to.x < from.x) return W
  if (to.y > from.y) return S
  return N
}

const opposite = (value: number) => ({ [N]: S, [E]: W, [S]: N, [W]: E })[value] ?? 0

export type Raster = Map<string, string>

function segmentPoints(from: Point, to: Point) {
  const points: Point[] = []
  const dx = Math.sign(to.x - from.x)
  const dy = Math.sign(to.y - from.y)
  let cursor = { ...from }
  points.push(cursor)
  while (cursor.x !== to.x || cursor.y !== to.y) {
    cursor = { x: cursor.x + dx, y: cursor.y + dy }
    points.push(cursor)
  }
  return points
}

export function orthogonalPath(start: Point, end: Point) {
  if (start.x === end.x || start.y === end.y) return segmentPoints(start, end)
  const horizontalFirst = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
  const corner = horizontalFirst
    ? { x: end.x, y: start.y }
    : { x: start.x, y: end.y }
  return [...segmentPoints(start, corner), ...segmentPoints(corner, end).slice(1)]
}

export function connectorPath(start: Point, anchors: Point[], end: Point) {
  const waypoints = [start, ...anchors, end]
  const path: Point[] = []
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const segment = orthogonalPath(waypoints[index], waypoints[index + 1])
    path.push(...(index === 0 ? segment : segment.slice(1)))
  }
  return path
}

function addPath(masks: Map<string, number>, points: Point[], dashedCells?: Set<string>) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const outgoing = direction(current, next)
    masks.set(key(current), (masks.get(key(current)) ?? 0) | outgoing)
    masks.set(key(next), (masks.get(key(next)) ?? 0) | opposite(outgoing))
    if (dashedCells) {
      dashedCells.add(key(current))
      dashedCells.add(key(next))
    }
  }
}

function arrowFor(from: Point, to: Point) {
  if (to.x > from.x) return '►'
  if (to.x < from.x) return '◄'
  if (to.y > from.y) return '▼'
  return '▲'
}

function drawElement(element: DiagramElement, masks: Map<string, number>, chars: Raster, dashedCells: Set<string>) {
  if (element.type === 'box') {
    const left = element.x
    const right = element.x + Math.max(2, element.width) - 1
    const top = element.y
    const bottom = element.y + Math.max(2, element.height) - 1
    addPath(masks, segmentPoints({ x: left, y: top }, { x: right, y: top }))
    addPath(masks, segmentPoints({ x: right, y: top }, { x: right, y: bottom }))
    addPath(masks, segmentPoints({ x: right, y: bottom }, { x: left, y: bottom }))
    addPath(masks, segmentPoints({ x: left, y: bottom }, { x: left, y: top }))
    if (element.text && bottom - top > 1) {
      const available = Math.max(0, right - left - 1)
      const text = element.text.slice(0, available)
      const textX = left + 1 + Math.max(0, Math.floor((available - text.length) / 2))
      const textY = top + Math.floor((bottom - top) / 2)
      Array.from(text).forEach((character, index) => chars.set(`${textX + index},${textY}`, character))
    }
    return
  }
  if (element.type === 'text') {
    Array.from(element.text).forEach((character, index) => chars.set(`${element.x + index},${element.y}`, character))
    return
  }
  if (element.type === 'freeform') {
    const character = Array.from(element.character || 'x')[0] ?? 'x'
    element.points.forEach((point) => chars.set(key(point), character))
    return
  }
  const points = connectorPath(element.start, element.anchors, element.end)
  addPath(masks, points, element.lineStyle === 'dashed' ? dashedCells : undefined)
  if (points.length > 1 && (element.type === 'arrow' || element.type === 'doubleArrow')) {
    chars.set(key(points.at(-1)!), arrowFor(points.at(-2)!, points.at(-1)!))
  }
  if (points.length > 1 && element.type === 'doubleArrow') {
    chars.set(key(points[0]), arrowFor(points[1], points[0]))
  }
}

export function rasterizeElements(elements: DiagramElement[]): Raster {
  const masks = new Map<string, number>()
  const chars: Raster = new Map()
  const dashedCells = new Set<string>()
  elements.slice().sort((a, b) => a.z - b.z).forEach((element) => drawElement(element, masks, chars, dashedCells))
  masks.forEach((mask, cell) => {
    if (!chars.has(cell)) {
      const dashedGlyph = mask === (E | W) || mask === E || mask === W
        ? '┄'
        : mask === (N | S) || mask === N || mask === S
          ? '┆'
          : null
      chars.set(cell, dashedCells.has(cell) && dashedGlyph ? dashedGlyph : GLYPHS[mask] ?? '─')
    }
  })
  return chars
}

export function rasterBounds(raster: Raster) {
  if (!raster.size) return null
  const points = [...raster.keys()].map((cell) => cell.split(',').map(Number))
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

export function toAscii(elements: DiagramElement[]) {
  const raster = rasterizeElements(elements)
  const bounds = rasterBounds(raster)
  if (!bounds) return ''
  const lines: string[] = []
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    let line = ''
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) line += raster.get(`${x},${y}`) ?? ' '
    lines.push(line.trimEnd())
  }
  while (lines.at(-1) === '') lines.pop()
  return lines.join('\n')
}

export const toMarkdown = (elements: DiagramElement[]) => `\`\`\`\n${toAscii(elements)}\n\`\`\``

export function parseStoredDocument(value: string | null): DocumentState {
  if (!value) return { version: 1, elements: [] }
  try {
    const parsed = JSON.parse(value) as Partial<DocumentState>
    if (parsed.version !== 1 || !Array.isArray(parsed.elements)) return { version: 1, elements: [] }
    const elements = (parsed.elements as DiagramElement[]).map((element) => {
      if (element.type === 'freeform') return { ...element, character: element.character || 'x' }
      if (element.type === 'line' || element.type === 'arrow' || element.type === 'doubleArrow') {
        return { ...element, anchors: element.anchors || [], lineStyle: element.lineStyle || 'solid' }
      }
      return element
    })
    return { version: 1, elements }
  } catch {
    return { version: 1, elements: [] }
  }
}
