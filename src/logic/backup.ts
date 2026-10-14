/** Download the complete on-device library before replacing either copy. */
export function downloadLocalBackup() {
  const payload = {
    app: 'the-watcher',
    kind: 'backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    library: JSON.parse(localStorage.getItem('the-watcher-library-v1') || 'null'),
    syncMeta: JSON.parse(localStorage.getItem('tw-sync-meta') || 'null'),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `the-watcher-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
