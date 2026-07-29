import { SyncPanel } from './SyncPanel'

export function SettingsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span className="settings-title">Settings</span>
          <button className="settings-close pressable" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="settings-body">
          <SyncPanel />
          <div className="settings-note">
            The Watcher · your library is stored on this device and, when signed in, backed up to your private cloud.
          </div>
        </div>
      </div>
    </div>
  )
}
