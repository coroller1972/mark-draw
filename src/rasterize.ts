import type { DiagramElement, DocumentState, Point, RouteAxis } from './model'

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

const ASCII_GLYPHS: Record<number, string> = {
  [N | S]: '|',
  [E | W]: '-',
  [N]: '|',
  [S]: '|',
  [E]: '-',
  [W]: '-',
  [E | S]: '+',
  [S | W]: '+',
  [N | E]: '+',
  [N | W]: '+',
  [N | E | S]: '+',
  [N | S | W]: '+',
  [E | S | W]: '+',
  [N | E | W]: '+',
  [N | E | S | W]: '+',
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

export function orthogonalPath(start: Point, end: Point, preferredAxis?: RouteAxis) {
  if (start.x === end.x || start.y === end.y) return segmentPoints(start, end)
  const horizontalFirst = preferredAxis
    ? preferredAxis === 'horizontal'
    : Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
  const corner = horizontalFirst
    ? { x: end.x, y: start.y }
    : { x: start.x, y: end.y }
  return [...segmentPoints(start, corner), ...segmentPoints(corner, end).slice(1)]
}

export function connectorPath(start: Point, anchors: Point[], end: Point, routeAxes: RouteAxis[] = []) {
  const waypoints = [start, ...anchors, end]
  const path: Point[] = []
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const segment = orthogonalPath(waypoints[index], waypoints[index + 1], routeAxes[index])
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

function arrowFor(from: Point, to: Point, compatibilityMode = false) {
  if (to.x > from.x) return compatibilityMode ? '>' : '►'
  if (to.x < from.x) return compatibilityMode ? '<' : '◄'
  if (to.y > from.y) return compatibilityMode ? 'v' : '▼'
  return compatibilityMode ? '^' : '▲'
}

function drawElement(element: DiagramElement, masks: Map<string, number>, chars: Raster, dashedCells: Set<string>, compatibilityMode: boolean) {
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
  const points = connectorPath(element.start, element.anchors, element.end, element.routeAxes)
  addPath(masks, points, element.lineStyle === 'dashed' ? dashedCells : undefined)
  if (points.length > 1 && (element.type === 'arrow' || element.type === 'doubleArrow')) {
    chars.set(key(points.at(-1)!), arrowFor(points.at(-2)!, points.at(-1)!, compatibilityMode))
  }
  if (points.length > 1 && element.type === 'doubleArrow') {
    chars.set(key(points[0]), arrowFor(points[1], points[0], compatibilityMode))
  }
}

export function rasterizeElements(elements: DiagramElement[], compatibilityMode = false): Raster {
  const masks = new Map<string, number>()
  const chars: Raster = new Map()
  const dashedCells = new Set<string>()
  elements.slice().sort((a, b) => a.z - b.z).forEach((element) => drawElement(element, masks, chars, dashedCells, compatibilityMode))
  masks.forEach((mask, cell) => {
    if (!chars.has(cell)) {
      const dashedGlyph = mask === (E | W) || mask === E || mask === W
        ? '┄'
        : mask === (N | S) || mask === N || mask === S
          ? '┆'
          : null
      const compatibleDashedGlyph = dashedGlyph === '┄' ? '.' : ':'
      chars.set(
        cell,
        dashedCells.has(cell) && dashedGlyph
          ? compatibilityMode ? compatibleDashedGlyph : dashedGlyph
          : compatibilityMode ? ASCII_GLYPHS[mask] ?? '-' : GLYPHS[mask] ?? '─',
      )
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

export function toAscii(elements: DiagramElement[], compatibilityMode = false) {
  const raster = rasterizeElements(elements, compatibilityMode)
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

export const toMarkdown = (elements: DiagramElement[], compatibilityMode = false) => `\`\`\`\n${toAscii(elements, compatibilityMode)}\n\`\`\``

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isPoint = (value: unknown): value is Point =>
  isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)

function normalizeElement(value: unknown): DiagramElement | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !isFiniteNumber(value.z) || typeof value.type !== 'string') return null
  const base = { id: value.id, z: value.z }

  if (value.type === 'box') {
    if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.width) || !isFiniteNumber(value.height) || typeof value.text !== 'string') return null
    return { ...base, type: 'box', x: value.x, y: value.y, width: value.width, height: value.height, text: value.text }
  }

  if (value.type === 'text') {
    if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y) || typeof value.text !== 'string') return null
    return { ...base, type: 'text', x: value.x, y: value.y, text: value.text }
  }

  if (value.type === 'freeform') {
    if (!Array.isArray(value.points) || !value.points.every(isPoint)) return null
    return { ...base, type: 'freeform', points: value.points, character: typeof value.character === 'string' && value.character ? value.character : 'x' }
  }

  if (value.type === 'line' || value.type === 'arrow' || value.type === 'doubleArrow') {
    if (!isPoint(value.start) || !isPoint(value.end)) return null
    const anchors = value.anchors === undefined ? [] : value.anchors
    const routeAxes = value.routeAxes === undefined ? [] : value.routeAxes
    if (!Array.isArray(anchors) || !anchors.every(isPoint)) return null
    if (!Array.isArray(routeAxes) || !routeAxes.every((axis) => axis === 'horizontal' || axis === 'vertical')) return null
    const lineStyle = value.lineStyle === 'dashed' ? 'dashed' : 'solid'
    return { ...base, type: value.type, start: value.start, end: value.end, anchors, routeAxes, lineStyle }
  }

  return null
}

export function decodeStoredDocument(value: string): DocumentState | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.elements)) return null
    const elements = parsed.elements.map(normalizeElement)
    if (elements.some((element) => element === null)) return null
    return { version: 1, elements: elements as DiagramElement[] }
  } catch {
    return null
  }
}

export function parseStoredDocument(value: string | null): DocumentState {
  if (!value) return { version: 1, elements: [] }
  return decodeStoredDocument(value) ?? { version: 1, elements: [] }
}
