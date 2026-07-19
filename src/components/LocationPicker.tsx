import { useApp } from '../state/AppContext'

/** Chip row for filtering by location; '' means all locations. */
export function LocationPicker(props: { value: string; onChange: (id: string) => void; allowAll?: boolean }) {
  const { locations } = useApp()
  const allowAll = props.allowAll ?? true
  if (locations.length <= 1 && allowAll) return null
  return (
    <div className="chip-row" data-testid="location-picker">
      {allowAll && (
        <button className={`chip${props.value === '' ? ' active' : ''}`} onClick={() => props.onChange('')}>
          All locations
        </button>
      )}
      {locations.map((l) => (
        <button
          key={l.id}
          className={`chip${props.value === l.id ? ' active' : ''}`}
          onClick={() => props.onChange(l.id)}
        >
          {l.name}
        </button>
      ))}
    </div>
  )
}
