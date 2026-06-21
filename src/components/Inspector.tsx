import { CaretLeftIcon, CaretRightIcon, XIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import type { DiagramElement } from '../model'
import { elementBounds } from '../model'

type InspectorProps = {
  element: DiagramElement
  onChange: (element: DiagramElement) => void
  onClose: () => void
}

const numberValue = (value: string, fallback: number) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function Inspector({ element, onChange, onClose }: InspectorProps) {
  const [collapsed, setCollapsed] = useState(false)
  const bounds = elementBounds(element)
  const hasText = element.type === 'box' || element.type === 'text'
  return (
    <aside className={collapsed ? 'inspector collapsed' : 'inspector'} aria-label="Inspecteur de l’élément sélectionné">
      <div className="inspector-title">
        <strong>{collapsed ? 'I' : 'Inspecteur'}</strong>
        <div>
          <button type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Déplier l’inspecteur' : 'Replier l’inspecteur'} title={collapsed ? 'Déplier' : 'Replier'}>
            {collapsed ? <CaretLeftIcon size={18} /> : <CaretRightIcon size={18} />}
          </button>
          {!collapsed ? <button type="button" onClick={onClose} aria-label="Fermer l’inspecteur"><XIcon size={18} /></button> : null}
        </div>
      </div>
      <div className="inspector-content">
      <section>
        <h2>Bordure</h2>
        <label>
          Style
          <select disabled value="simple" onChange={() => undefined}>
            <option value="simple">Simple</option>
          </select>
        </label>
        <label>
          Caractère
          <span className="field-static">Unicode</span>
        </label>
      </section>

      {hasText ? (
        <section>
          <h2>Texte</h2>
          <label className="stacked">
            Contenu
            <input
              value={element.text}
              onChange={(event) => onChange({ ...element, text: event.target.value })}
              placeholder="Votre texte"
            />
          </label>
          <label>
            Alignement
            <span className="alignment-demo" aria-label="Centré">≡</span>
          </label>
        </section>
      ) : null}

      {element.type === 'freeform' ? (
        <section>
          <h2>Tracé libre</h2>
          <label>
            Caractère
            <input
              className="character-input"
              value={element.character}
              maxLength={2}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                const characters = Array.from(event.target.value)
                onChange({ ...element, character: characters.at(-1) ?? '' })
              }}
              onBlur={() => {
                if (!element.character) onChange({ ...element, character: 'x' })
              }}
              aria-label="Caractère du tracé libre"
            />
          </label>
        </section>
      ) : null}

      {element.type === 'line' || element.type === 'arrow' || element.type === 'doubleArrow' ? (
        <section>
          <h2>Ligne</h2>
          <label>
            Tracé
            <select
              value={element.lineStyle}
              onChange={(event) => onChange({ ...element, lineStyle: event.target.value as 'solid' | 'dashed' })}
              aria-label="Style du connecteur"
            >
              <option value="solid">Continue</option>
              <option value="dashed">Pointillée</option>
            </select>
          </label>
          <div className={element.lineStyle === 'dashed' ? 'line-preview dashed' : 'line-preview'} aria-hidden="true" />
        </section>
      ) : null}

      <section>
        <h2>Position</h2>
        <div className="field-grid">
          <label>
            X
            <input
              type="number"
              value={bounds.x}
              onChange={(event) => {
                const x = numberValue(event.target.value, bounds.x)
                if (element.type === 'box' || element.type === 'text') onChange({ ...element, x })
                else if (element.type === 'freeform') onChange({ ...element, points: element.points.map((p) => ({ ...p, x: p.x + x - bounds.x })) })
                else onChange({ ...element, start: { ...element.start, x: element.start.x + x - bounds.x }, end: { ...element.end, x: element.end.x + x - bounds.x }, anchors: element.anchors.map((p) => ({ ...p, x: p.x + x - bounds.x })) })
              }}
            />
          </label>
          <label>
            Y
            <input
              type="number"
              value={bounds.y}
              onChange={(event) => {
                const y = numberValue(event.target.value, bounds.y)
                if (element.type === 'box' || element.type === 'text') onChange({ ...element, y })
                else if (element.type === 'freeform') onChange({ ...element, points: element.points.map((p) => ({ ...p, y: p.y + y - bounds.y })) })
                else onChange({ ...element, start: { ...element.start, y: element.start.y + y - bounds.y }, end: { ...element.end, y: element.end.y + y - bounds.y }, anchors: element.anchors.map((p) => ({ ...p, y: p.y + y - bounds.y })) })
              }}
            />
          </label>
          {element.type === 'box' ? (
            <>
              <label>
                Largeur
                <input type="number" min="3" value={element.width} onChange={(event) => onChange({ ...element, width: Math.max(3, numberValue(event.target.value, element.width)) })} />
              </label>
              <label>
                Hauteur
                <input type="number" min="3" value={element.height} onChange={(event) => onChange({ ...element, height: Math.max(3, numberValue(event.target.value, element.height)) })} />
              </label>
            </>
          ) : null}
        </div>
      </section>
      </div>
    </aside>
  )
}
