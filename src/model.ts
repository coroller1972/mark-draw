export type Tool = 'select' | 'hand' | 'box' | 'text' | 'line' | 'arrow' | 'doubleArrow' | 'freeform'

export type Point = { x: number; y: number }

type BaseElement = {
  id: string
  z: number
}

export type BoxElement = BaseElement & {
  type: 'box'
  x: number
  y: number
  width: number
  height: number
  text: string
}

export type TextElement = BaseElement & {
  type: 'text'
  x: number
  y: number
  text: string
}

export type ConnectorElement = BaseElement & {
  type: 'line' | 'arrow' | 'doubleArrow'
  start: Point
  end: Point
  anchors: Point[]
  lineStyle: 'solid' | 'dashed'
}

export type FreeformElement = BaseElement & {
  type: 'freeform'
  points: Point[]
  character: string
}

export type DiagramElement = BoxElement | TextElement | ConnectorElement | FreeformElement

export type DocumentState = {
  version: 1
  elements: DiagramElement[]
}

export const EMPTY_DOCUMENT: DocumentState = { version: 1, elements: [] }

export const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `element-${Date.now()}-${Math.random().toString(16).slice(2)}`

export function elementBounds(element: DiagramElement) {
  if (element.type === 'box') {
    return { x: element.x, y: element.y, width: element.width, height: element.height }
  }
  if (element.type === 'text') {
    return { x: element.x, y: element.y, width: Math.max(1, element.text.length), height: 1 }
  }
  if (element.type === 'freeform') {
    if (!element.points.length) return { x: 0, y: 0, width: 0, height: 0 }
    const xs = element.points.map((point) => point.x)
    const ys = element.points.map((point) => point.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, width: Math.max(...xs) - x + 1, height: Math.max(...ys) - y + 1 }
  }
  const points = [element.start, ...element.anchors, element.end]
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x + 1, height: Math.max(...ys) - y + 1 }
}

export function moveElement(element: DiagramElement, dx: number, dy: number): DiagramElement {
  if (element.type === 'box' || element.type === 'text') {
    return { ...element, x: element.x + dx, y: element.y + dy }
  }
  if (element.type === 'freeform') {
    return { ...element, points: element.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) }
  }
  return {
    ...element,
    start: { x: element.start.x + dx, y: element.start.y + dy },
    end: { x: element.end.x + dx, y: element.end.y + dy },
    anchors: element.anchors.map((point) => ({ x: point.x + dx, y: point.y + dy })),
  }
}
