import type { CommunityContentType } from '../data/communities'
import { COMMUNITY_CONTENT_TYPES, contentTypesLabel } from '../logic/communityTaxonomy'

export function CommunityContentField({ value, onChange }: {
  value: CommunityContentType[]
  onChange: (types: CommunityContentType[]) => void
}) {
  return (
    <div>
      <div className="field-label">Content types</div>
      <div className="vis-choice" role="group" aria-label="Community content types">
        {COMMUNITY_CONTENT_TYPES.map(({ key, label }) => (
          <button key={key} type="button" className={`vis-opt pressable ${value.includes(key) ? 'on' : ''}`}
            aria-pressed={value.includes(key)}
            onClick={() => {
              if (value.includes(key)) {
                if (value.length > 1) onChange(value.filter((type) => type !== key))
              } else onChange(COMMUNITY_CONTENT_TYPES.map((type) => type.key).filter((type) => [...value, key].includes(type)))
            }}>
            {label}
          </button>
        ))}
      </div>
      <div className="vis-hint">Select one or both. Both appear as {contentTypesLabel(COMMUNITY_CONTENT_TYPES.map((type) => type.key))}.</div>
    </div>
  )
}
