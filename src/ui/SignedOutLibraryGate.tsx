import { useState } from 'react'
import { AuthScreen } from './AuthScreen'
import { forgetDeviceLibrary } from '../logic/sync'

/**
 * A device still holds an account's library but nobody is signed in (expired
 * session, or a browser from before accounts existed). Keep it hidden: sign in
 * to open it, or start fresh on this device.
 */
export function SignedOutLibraryGate() {
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <AuthScreen
        onClose={() => {}}
        note="Sign in to open the library saved on this device."
        skipLabel="Start fresh on this device"
        onSkip={() => setConfirm(true)}
      />
      {confirm && (
        <div className="sheet-backdrop" style={{ zIndex: 'calc(var(--z-toast) + 1)' }} onClick={() => setConfirm(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="confirm-title">Start fresh?</div>
            <div className="confirm-body">
              This removes the library saved on this device. Anything already synced stays safe in its account.
            </div>
            <div className="confirm-actions">
              <button className="sync-btn ghost pressable" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button className="sync-btn danger pressable" onClick={forgetDeviceLibrary}>
                Start fresh
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
