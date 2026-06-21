import { describe, expect, it } from 'vitest'
import type { DiagramElement } from './model'
import { connectorPath, orthogonalPath, parseStoredDocument, rasterizeElements, toAscii, toMarkdown } from './rasterize'

describe('orthogonalPath', () => {
  it('routes horizontally then vertically through one corner', () => {
    expect(orthogonalPath({ x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 },
    ])
  })

  it('starts vertically when the vertical movement is dominant', () => {
    expect(orthogonalPath({ x: 0, y: 0 }, { x: 2, y: 4 })).toEqual([
      { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }, { x: 0, y: 4 },
      { x: 1, y: 4 }, { x: 2, y: 4 },
    ])
  })

  it('preserves multiple anchors for S-shaped connectors', () => {
    const path = connectorPath(
      { x: 0, y: 0 },
      [{ x: 3, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 4 }],
      { x: 3, y: 4 },
    )
    expect(path).toContainEqual({ x: 3, y: 2 })
    expect(path).toContainEqual({ x: 0, y: 4 })
    expect(path.at(-1)).toEqual({ x: 3, y: 4 })
  })
})

describe('rasterization', () => {
  it('renders a unicode box with centered text', () => {
    const box: DiagramElement = { id: 'box', z: 0, type: 'box', x: 0, y: 0, width: 7, height: 3, text: 'Hi' }
    expect(toAscii([box])).toBe('┌─────┐\n│ Hi  │\n└─────┘')
  })

  it('merges line crossings into a junction', () => {
    const elements: DiagramElement[] = [
      { id: 'h', z: 0, type: 'line', lineStyle: 'solid', anchors: [], start: { x: 0, y: 1 }, end: { x: 2, y: 1 } },
      { id: 'v', z: 1, type: 'line', lineStyle: 'solid', anchors: [], start: { x: 1, y: 0 }, end: { x: 1, y: 2 } },
    ]
    expect(rasterizeElements(elements).get('1,1')).toBe('┼')
  })

  it('places directional arrowheads', () => {
    const arrow: DiagramElement = { id: 'a', z: 0, type: 'doubleArrow', lineStyle: 'solid', anchors: [], start: { x: 0, y: 0 }, end: { x: 3, y: 0 } }
    expect(toAscii([arrow])).toBe('◄──►')
  })

  it('renders dashed horizontal and vertical connectors', () => {
    const horizontal: DiagramElement = { id: 'h', z: 0, type: 'line', lineStyle: 'dashed', anchors: [], start: { x: 0, y: 0 }, end: { x: 3, y: 0 } }
    const vertical: DiagramElement = { id: 'v', z: 0, type: 'line', lineStyle: 'dashed', anchors: [], start: { x: 0, y: 0 }, end: { x: 0, y: 2 } }
    expect(toAscii([horizontal])).toBe('┄┄┄┄')
    expect(toAscii([vertical])).toBe('┆\n┆\n┆')
  })

  it('deduplicates freeform cells through the raster map', () => {
    const freeform: DiagramElement = { id: 'f', z: 0, type: 'freeform', character: 'x', points: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }] }
    expect(toAscii([freeform])).toBe('xx')
  })

  it('uses the selected freeform character', () => {
    const freeform: DiagramElement = { id: 'f', z: 0, type: 'freeform', character: '#', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }
    expect(toAscii([freeform])).toBe('##')
  })
})

describe('markdown export', () => {
  it('crops whitespace and wraps the diagram in a code fence', () => {
    const text: DiagramElement = { id: 't', z: 0, type: 'text', x: 12, y: 8, text: 'hello' }
    expect(toMarkdown([text])).toBe('```\nhello\n```')
  })
})

describe('stored document validation', () => {
  it('restores a valid v1 document', () => {
    expect(parseStoredDocument('{"version":1,"elements":[]}')).toEqual({ version: 1, elements: [] })
  })

  it('migrates old freeform elements to the default character', () => {
    const restored = parseStoredDocument('{"version":1,"elements":[{"id":"f","z":0,"type":"freeform","points":[{"x":0,"y":0}]}]}')
    expect(restored.elements[0]).toMatchObject({ type: 'freeform', character: 'x' })
  })

  it('migrates old connectors to a solid line', () => {
    const restored = parseStoredDocument('{"version":1,"elements":[{"id":"l","z":0,"type":"line","start":{"x":0,"y":0},"end":{"x":2,"y":0}}]}')
    expect(restored.elements[0]).toMatchObject({ type: 'line', lineStyle: 'solid' })
  })

  it('falls back safely for invalid or old data', () => {
    expect(parseStoredDocument('not json')).toEqual({ version: 1, elements: [] })
    expect(parseStoredDocument('{"version":2,"elements":[]}')).toEqual({ version: 1, elements: [] })
  })
})
