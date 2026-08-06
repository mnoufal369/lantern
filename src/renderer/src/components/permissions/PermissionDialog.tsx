import { ShieldAlert } from 'lucide-react'
import { usePermissionsStore } from '@/stores/usePermissionsStore'
import { useSessionsStore } from '@/stores/useSessionsStore'
import EditDiffView from '@/components/tools/EditDiffView'

function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export default function PermissionDialog(): React.JSX.Element | null {
  const pending = usePermissionsStore((s) => s.pending)
  const resolve = usePermissionsStore((s) => s.resolve)
  const sessions = useSessionsStore((s) => s.sessions)

  const request = pending[0]
  if (!request) {
    return null
  }

  const session = sessions[request.sessionId]
  const input = asRecord(request.input)
  const isBash = request.toolName === 'Bash'
  const isEdit = request.toolName === 'Edit' || request.toolName === 'MultiEdit'
  const isWrite = request.toolName === 'Write'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-xl border border-amber-900/50 bg-deck-panel shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-deck-border px-4 py-3">
          <ShieldAlert size={18} className="text-amber-500" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-100">
              Agent wants to use <span className="text-amber-400">{request.toolName}</span>
            </h2>
            {session && (
              <p className="truncate text-[11px] text-zinc-500">
                {session.meta.title || 'Session'} · {session.meta.cwd}
              </p>
            )}
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto p-4">
          {isBash && (
            <pre className="selectable overflow-x-auto rounded-lg bg-[#0d0d10] p-3 font-mono text-[12.5px] text-zinc-200">
              <span className="select-none text-green-500">❯ </span>
              {str(input.command)}
            </pre>
          )}
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
        </div>

        <div className="flex items-center gap-2 border-t border-deck-border px-4 py-3">
          <p className="mr-auto text-[11px] text-zinc-600">
            Always allow saves <span className="font-mono text-zinc-500">{request.alwaysAllowRule}</span> to this
            agent profile
          </p>
          <button
            onClick={() => void resolve(request.requestId, { kind: 'deny', reason: 'User denied this action' })}
            className="rounded-lg border border-deck-border px-3 py-1.5 text-xs text-zinc-300 hover:bg-deck-raised"
          >
            Deny
          </button>
          <button
            onClick={() => void resolve(request.requestId, { kind: 'allow-once' })}
            className="rounded-lg bg-deck-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            Allow once
          </button>
          <button
            onClick={() => void resolve(request.requestId, { kind: 'allow-always' })}
            className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600"
          >
            Always allow
          </button>
        </div>
      </div>
    </div>
  )
}
