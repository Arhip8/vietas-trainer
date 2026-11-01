import { useRef, useState } from 'react'
import { createSessionStorage } from './session.ts'
import type { SavedSession, StorageError } from './session.ts'

/** Restore lazily before the first render; every event-driven update is saved synchronously. */
export function useActiveSession() {
  const [initial] = useState(() => {
    const storage = createSessionStorage(() => window.localStorage)
    return { storage, ...storage.load() }
  })
  const [session, setSession] = useState(initial.session)
  const [error, setError] = useState<StorageError>(initial.error)
  const current = useRef(session)

  function commit(next: SavedSession | null, replace = false): boolean {
    if (next === current.current && next !== null) return true
    const failure = initial.storage.save(next, replace)
    setError(failure)
    // If deletion fails, keep the screen and explain why exit was not completed.
    if (next === null && failure) return false
    // Retain an existing session if starting its replacement failed. This also
    // avoids presenting a new session over an older, undeletable disk snapshot.
    if (replace && failure && current.current !== null) return false
    current.current = next
    setSession(next)
    return true
  }

  function update(transform: (previous: SavedSession | null) => SavedSession | null) {
    return commit(transform(current.current))
  }

  function flush() {
    return initial.storage.save(current.current)
  }

  return { session, error, commit, update, flush }
}
