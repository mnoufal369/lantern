import { useState } from 'react'
import { ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react'
import { usePermissionsStore } from '@/stores/usePermissionsStore'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import EditDiffView from '@/components/tools/EditDiffView'

function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function basename(p: string): string {
  return p.split('/').pop() ?? p
}

const COMMAND_PREVIEW_LINES = 12
const COMMAND_PREVIEW_CHARS = 700

/** Long commands collapse to a preview so the dialog never outgrows the screen. */
function CollapsiblePre({ text }: { text: string }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const lines = text.split('\n')
  const isLong = lines.length > COMMAND_PREVIEW_LINES + 4 || text.length > COMMAND_PREVIEW_CHARS * 1.4
  const shown =
    !isLong || expanded ? text : `${lines.slice(0, COMMAND_PREVIEW_LINES).join('\n').slice(0, COMMAND_PREVIEW_CHARS)}…`

  return (
    <div>
      <pre className="selectable max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#0d0d10] p-3 font-mono text-[12.5px] text-zinc-200">
        <span className="select-none text-green-500">❯ </span>
        {shown}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 flex items-center gap-1 text-[11.5px] text-sky-400/80 hover:text-sky-300"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Show less' : `Show the full command (${lines.length} lines)`}
        </button>
      )}
    </div>
  )
}

/** One plain sentence describing what the agent wants, for Simple mode. */
function plainSentence(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'Bash') {
    return str(input.description) || 'The agent wants to run a command on your Mac.'
  }
  if (toolName === 'Write') {
    return `The agent wants to create the file ${basename(str(input.file_path))}.`
  }
  if (toolName === 'Edit' || toolName === 'MultiEdit') {
    return `The agent wants to change the file ${basename(str(input.file_path))}.`
  }
  if (toolName === 'WebFetch' || toolName === 'WebSearch') {
    return 'The agent wants to look something up on the internet.'
  }
  return `The agent wants to use ${toolName.replace(/^mcp__\w+__/, '')}.`
}

export default function PermissionDialog(): React.JSX.Element | null {
  const pending = usePermissionsStore((s) => s.pending)
  const resolve = usePermissionsStore((s) => s.resolve)
  const sessions = useSessionsStore((s) => s.sessions)
  const simple = useSettingsStore((s) => s.settings?.uiMode === 'simple')
  // Keyed by requestId so the toggle resets for each new request.
  const [detailsFor, setDetailsFor] = useState('')

  const request = pending[0]
  if (!request) {
    return null
  }
  const showDetails = detailsFor === request.requestId
  const setShowDetails = (open: boolean): void => setDetailsFor(open ? request.requestId : '')

  const session = sessions[request.sessionId]
  const input = asRecord(request.input)
  const isBash = request.toolName === 'Bash'
  const isEdit = request.toolName === 'Edit' || request.toolName === 'MultiEdit'
  const isWrite = request.toolName === 'Write'
  const detailsVisible = !simple || showDetails

  const detail = (
    <>
      {isBash && <CollapsiblePre text={str(input.command)} />}
      {isEdit && (
        <div>
          <p className="mb-1.5 font-mono text-[12px] text-zinc-400">{str(input.file_path)}</p>
          <EditDiffView oldText={str(input.old_string)} newText={str(input.new_string)} />
        </div>
      )}
      {isWrite && (
        <div>
          <p className="mb-1.5 font-mono text-[12px] text-zinc-400">{str(input.file_path)} (new file)</p>
          <EditDiffView oldText="" newText={str(input.content)} />
        </div>
      )}
      {!isBash && !isEdit && !isWrite && (
        <pre className="selectable overflow-x-auto rounded-lg bg-[#0d0d10] p-3 font-mono text-[12px] text-zinc-300">
          {JSON.stringify(request.input, null, 2)}
        </pre>
      )}
    </>
  )

  return (
    <div className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
      <div className="modal-in flex max-h-[80vh] w-full max-w-xl flex-col rounded-xl border border-amber-900/50 bg-deck-panel shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_40px_rgba(245,158,11,0.08)]">
        <div className="flex shrink-0 items-center gap-2.5 border-b border-deck-border px-4 py-3">
          <ShieldAlert size={18} className="text-amber-500" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-100">
              {simple ? (
                'Your approval needed'
              ) : (
                <>
                  Agent wants to use <span className="text-amber-400">{request.toolName}</span>
                </>
              )}
            </h2>
            {session && (
              <p className="truncate text-[11px] text-zinc-500">
                {session.meta.title || 'Session'} · {session.meta.cwd}
              </p>
            )}
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto p-4">
          {simple && (
            <div className="mb-3">
              <p className="text-sm text-zinc-200">{plainSentence(request.toolName, input)}</p>
              <p className="mt-1 text-[12px] text-zinc-500">
                Nothing happens until you decide.{' '}
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-sky-400/90 underline-offset-2 hover:underline"
                >
                  {showDetails ? 'Hide the technical details' : 'Show me exactly what it will do'}
                </button>
              </p>
            </div>
          )}
          {detailsVisible && detail}
        </div>

        <div className="shrink-0 space-y-2 border-t border-deck-border px-4 py-3">
          {/* Rules can be whole commands — clamp so the buttons never leave the screen. */}
          <p className="line-clamp-2 break-all text-[11px] text-zinc-600" title={request.alwaysAllowRule}>
            {simple ? (
              '“Always allow” stops it asking again for this kind of action'
            ) : (
              <>
                Always allow saves <span className="font-mono text-zinc-500">{request.alwaysAllowRule}</span> to this
                agent profile
              </>
            )}
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => void resolve(request.requestId, { kind: 'deny', reason: 'User denied this action' })}
              className="shrink-0 rounded-lg border border-deck-border px-3 py-1.5 text-xs text-zinc-300 hover:bg-deck-raised"
            >
              {simple ? 'Not now' : 'Deny'}
            </button>
            <button
              onClick={() => void resolve(request.requestId, { kind: 'allow-once' })}
              className="shrink-0 rounded-lg bg-deck-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Allow once
            </button>
            <button
              onClick={() => void resolve(request.requestId, { kind: 'allow-always' })}
              className="shrink-0 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600"
            >
              Always allow
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
