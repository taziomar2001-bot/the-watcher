import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { CommunityDiscoveryFilters, CommunityRole } from '../data/communities'
import { COMMUNITY_CONTENT_TYPES, validCommunityLocation, type CommunityLocation } from '../logic/communityTaxonomy'
import { CommunityLocationField } from './CommunityLocationField'

export type MyCommunityRoleFilter = CommunityRole | 'all'

export function CommunityFilterSheet({
  filters,
  role,
  onApply,
  onClose,
}: {
  filters: CommunityDiscoveryFilters
  role?: MyCommunityRoleFilter
  onApply: (filters: CommunityDiscoveryFilters, role?: MyCommunityRoleFilter) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(filters)
  const [draftRole, setDraftRole] = useState<MyCommunityRoleFilter>(role ?? 'all')
  const location: CommunityLocation = draft.location ?? { kind: 'global' }
  const locationSelected = draft.location !== undefined
  const setLocation = (value: CommunityLocation | undefined) => setDraft((f) => ({ ...f, location: value }))

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet community-form community-filter-sheet" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (locationSelected && !validCommunityLocation(location)) return
          onApply(draft, role === undefined ? undefined : draftRole)
        }}>
        <div className="sheet-handle" />
        <div className="sheet-title">Filter communities</div>
        <div className="field-label">Content</div>
        <div className="vis-choice" role="group" aria-label="Content type">
          <button type="button" className={`vis-opt pressable ${!draft.contentType ? 'on' : ''}`}
            aria-pressed={!draft.contentType} onClick={() => setDraft((f) => ({ ...f, contentType: undefined }))}>All</button>
          {COMMUNITY_CONTENT_TYPES.map((type) => (
            <button key={type.key} type="button" className={`vis-opt pressable ${draft.contentType === type.key ? 'on' : ''}`}
              aria-pressed={draft.contentType === type.key}
              onClick={() => setDraft((f) => ({ ...f, contentType: type.key }))}>{type.label}</button>
          ))}
        </div>
        <div className="field-label">Location</div>
        <div className="vis-choice" role="group" aria-label="Location filter">
          {(['anywhere', 'global', 'country', 'city'] as const).map((kind) => (
            <button key={kind} type="button" className={`vis-opt pressable ${kind === 'anywhere' ? !locationSelected ? 'on' : '' : draft.location?.kind === kind ? 'on' : ''}`}
              aria-pressed={kind === 'anywhere' ? !locationSelected : draft.location?.kind === kind}
              onClick={() => setLocation(kind === 'anywhere' ? undefined : kind === 'global' ? { kind } : kind === 'country'
                ? { kind, countryCode: location.countryCode, countryName: location.countryName }
                : { ...location, kind })}>
              {kind === 'anywhere' ? 'Any' : kind === 'global' ? 'Global' : kind === 'country' ? 'Country' : 'City'}
            </button>
          ))}
        </div>
        {locationSelected && location.kind !== 'global' && (
          <CommunityLocationField value={location} onChange={setLocation} hideKindChoice />
        )}
        {role !== undefined && (
          <>
            <div className="field-label">Your role</div>
            <div className="vis-choice" role="group" aria-label="Your role">
              {(['all', 'owner', 'admin', 'member'] as const).map((item) => (
                <button key={item} type="button" className={`vis-opt pressable ${draftRole === item ? 'on' : ''}`}
                  aria-pressed={draftRole === item} onClick={() => setDraftRole(item)}>
                  {item === 'all' ? 'All' : item === 'owner' ? 'Owner' : item === 'admin' ? 'Admin' : 'Member'}
                </button>
              ))}
            </div>
          </>
        )}
        <button type="submit" className="welcome-primary pressable" disabled={locationSelected && !validCommunityLocation(location)}>
          Apply filters
        </button>
      </form>
    </div>,
    document.body,
  )
}
