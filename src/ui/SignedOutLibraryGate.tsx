import { useState } from 'react'
import { AuthScreen } from './AuthScreen'
import { forgetDeviceLibrary, hasUnsavedDeviceChanges } from '../logic/sync'

/**
 * This device still holds an account's library but nobody is signed in. It's
 * a copy of that account's cloud library, so: sign in to open it, or continue
 * without an account (the copy is removed; the account keeps everything).
 */
export function SignedOutLibraryGate() {
  const [confirm, setConfirm] = useState(false)
  const skip = () => (hasUnsavedDeviceChanges() ? setConfirm(true) : forgetDeviceLibrary())
  return (
    <>
      <AuthScreen onClose={() => {}} note="Sign in to pick up where you left off." skipLabel="Continue without an account" onSkip={skip} />
      {confirm && (
        <div className="sheet-backdrop" style={{ zIndex: 'calc(var(--z-toast) + 1)' }} onClick={() => setConfirm(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="confirm-title">Some changes aren’t synced yet</div>
            <div className="confirm-body">Sign in to keep your latest changes. Continuing without an account removes them from this device.</div>
            <div className="confirm-actions">
              <button className="sync-btn ghost pressable" onClick={() => setConfirm(false)}>
                Sign in instead
              </button>
              <button className="sync-btn danger pressable" onClick={forgetDeviceLibrary}>
                Continue anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
