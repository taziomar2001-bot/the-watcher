import { useState } from 'react'
import { AuthScreen } from './AuthScreen'
import { ConfirmSheet } from './Sheet'
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
        <ConfirmSheet
          danger
          zIndex="calc(var(--z-toast) + 1)"
          title="Some changes aren’t synced yet"
          body="Sign in to keep your latest changes. Continuing without an account removes them from this device."
          cancelLabel="Sign in instead"
          confirmLabel="Continue anyway"
          onCancel={() => setConfirm(false)}
          onConfirm={forgetDeviceLibrary}
        />
      )}
    </>
  )
}
