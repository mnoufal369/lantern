import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, GitBranch, Loader2 } from 'lucide-react'
import type { GitStatusSummary } from '@shared/types'

export default function BranchSwitcher({ sessionId }: { sessionId: string }): React.JSX.Element | null {
  const [status, setStatus] = useState<GitStatusSummary | null>(null)
  const [open, setOpen] = useState(false)
  const [branches, setBranches] = useState<string[] | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setStatus(null)
    setBranches(null)
    void window.api.invoke('git:status', { sessionId }).then(setStatus).catch(() => setStatus(null))
  }, [sessionId])

  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  if (!status?.isRepo) {
    return null
  }

  const toggle = async (): Promise<void> => {
    const next = !open
    setOpen(next)
    if (next && branches === null) {
      const remote = await window.api.invoke('git:remoteBranches', { sessionId })
      setBranches(remote)
    }
  }

  const switchTo = async (branch: string): Promise<void> => {
    if (branch === status.branch || switching) {
      return
    }
    setSwitching(branch)
    try {
      const updated = await window.api.invoke('git:checkoutBranch', { sessionId, branch })
      setStatus(updated)
      setOpen(false)
    } catch (e) {
      alert(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Could not switch branch')
    } finally {
      setSwitching(null)
    }
  }

  if (!status.managed) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-zinc-500">
        <GitBranch size={11} />
        {status.branch}
      </span>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => void toggle()}
        title="Switch branch — Crew refetches the code for you"
        className="flex items-center gap-1 rounded-md border border-deck-border px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-deck-raised hover:text-zinc-200"
      >
        <GitBranch size={11} />
        {status.branch}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-30 max-h-64 w-56 overflow-y-auto rounded-lg border border-deck-border bg-deck-panel py-1 shadow-2xl">
          {branches === null && (
            <p className="flex items-center gap-2 px-3 py-2 text-[11px] text-zinc-500">
              <Loader2 size={11} className="animate-spin" /> Loading branches…
            </p>
          )}
          {branches?.length === 0 && <p className="px-3 py-2 text-[11px] text-zinc-500">No branches found</p>}
          {branches?.map((branch) => (
            <button
              key={branch}
              onClick={() => void switchTo(branch)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-zinc-300 hover:bg-deck-raised"
            >
              {switching === branch ? (
                <Loader2 size={11} className="shrink-0 animate-spin" />
              ) : branch === status.branch ? (
                <Check size={11} className="shrink-0 text-green-400" />
              ) : (
                <span className="w-[11px] shrink-0" />
              )}
              <span className="truncate font-mono">{branch}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
