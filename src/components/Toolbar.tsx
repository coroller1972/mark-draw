import {
  ArrowsHorizontalIcon,
  ArrowRightIcon,
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
  CursorClickIcon,
  LineSegmentIcon,
  PencilSimpleLineIcon,
  RectangleIcon,
  TextTIcon,
} from '@phosphor-icons/react'
import type { ComponentType } from 'react'
import type { Tool } from '../model'

type IconComponent = ComponentType<{ size?: number; weight?: 'regular' | 'bold' }>

const TOOLS: Array<{ id: Tool; label: string; shortcut: string; icon: IconComponent }> = [
  { id: 'select', label: 'Sélection', shortcut: 'V / 1', icon: CursorClickIcon },
  { id: 'box', label: 'Boîte', shortcut: '2', icon: RectangleIcon },
  { id: 'text', label: 'Texte', shortcut: '3', icon: TextTIcon },
  { id: 'line', label: 'Ligne', shortcut: '4', icon: LineSegmentIcon },
  { id: 'arrow', label: 'Flèche', shortcut: '5', icon: ArrowRightIcon },
  { id: 'doubleArrow', label: 'Double flèche', shortcut: '6', icon: ArrowsHorizontalIcon },
  { id: 'freeform', label: 'Main libre', shortcut: '7', icon: PencilSimpleLineIcon },
]

type ToolbarProps = {
  active: Tool
  onSelect: (tool: Tool) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

export function Toolbar({ active, onSelect, onUndo, onRedo, canUndo, canRedo }: ToolbarProps) {
  return (
    <>
      <div className="history-controls" aria-label="Historique">
        <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Annuler" title="Annuler (Ctrl/⌘ Z)">
          <ArrowCounterClockwiseIcon size={22} />
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Rétablir" title="Rétablir (Ctrl/⌘ ⇧ Z)">
          <ArrowClockwiseIcon size={22} />
        </button>
      </div>
      <div className="toolbar" role="toolbar" aria-label="Outils de dessin">
        {TOOLS.map(({ id, label, shortcut, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={active === id ? 'tool active' : 'tool'}
            onClick={() => onSelect(id)}
            aria-pressed={active === id}
            title={`${label} (${shortcut})`}
          >
            <Icon size={25} weight={active === id ? 'bold' : 'regular'} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </>
  )
}
