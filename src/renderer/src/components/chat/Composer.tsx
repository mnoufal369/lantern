import { useEffect, useRef, useState } from 'react'
import { SendHorizonal, Square, Zap } from 'lucide-react'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { FALLBACK_MODELS } from '@shared/constants'
import type { PermissionMode, SessionStatus } from '@shared/types'
import QuickMenu, { MODE_SEQUENCE, type QuickCommand } from './QuickMenu'

const MODE_OPTIONS: { value: PermissionMode; label: string; hint: string; proOnly?: boolean }[] = [
  { value: 'plan', label: 'Plan', hint: 'Plans before acting' },
  { value: 'default', label: 'Ask', hint: 'Asks before risky tools' },
  { value: 'acceptEdits', label: 'Auto-edit', hint: 'Auto-approves file edits' },
  { value: 'bypassPermissions', label: 'Full auto', hint: 'Never asks, careful!', proOnly: true }
]

export default function Composer({
  sessionId,
  status,
  injectedDraft
}: {
  sessionId: string
  status: SessionStatus
  injectedDraft?: { text: string; nonce: number } | null
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<{ dataUrl: string; mediaType: string }[]>([])
  const [menuIndex, setMenuIndex] = useState(0)
  const [sendError, setSendError] = useState('')
  const menuCommands = useRef<QuickCommand[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const simple = useSettingsStore((s) => s.settings?.uiMode === 'simple')

  const menuOpen = text.startsWith('/')
  const menuQuery = menuOpen ? text.slice(1) : ''

  useEffect(() => {
    if (injectedDraft) {
      setText(injectedDraft.text)
      textareaRef.current?.focus()
    }
  }, [injectedDraft])

  // Grow with the content — wrapped lines count too, unlike a rows= heuristic.
  // Caps at ~12 lines, then scrolls.
  const MAX_COMPOSER_HEIGHT = 260
  useEffect(() => {
    const el = textareaRef.current
    if (!el) {
      return
    }
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`
    el.style.overflowY = el.scrollHeight > MAX_COMPOSER_HEIGHT ? 'auto' : 'hidden'
  }, [text])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.metaKey && e.key === 'k') {
        e.preventDefault()
        setText('/')
        setMenuIndex(0)
        textareaRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  const sendMessage = useSessionsStore((s) => s.sendMessage)
  const interrupt = useSessionsStore((s) => s.interrupt)
  const meta = useSessionsStore((s) => s.sessions[sessionId]?.meta)
  const setModel = useSessionsStore((s) => s.setModel)
  const setPermissionMode = useSessionsStore((s) => s.setPermissionMode)

  const busy = status.kind === 'thinking' || status.kind === 'running-tool'

  const addImages = (files: File[]): void => {
    for (const file of files.slice(0, 3 - attachments.length)) {
      const reader = new FileReader()
      reader.onload = () => {
        setAttachments((prev) =>
          prev.length >= 3 ? prev : [...prev, { dataUrl: String(reader.result), mediaType: file.type }]
        )
      }
      reader.readAsDataURL(file)
    }
  }

  const onPaste = (e: React.ClipboardEvent): void => {
    const files = Array.from(e.clipboardData.items)
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
    if (files.length === 0) {
      return
    }
    e.preventDefault()
    addImages(files)
  }

  // Images dropped onto the composer become attachments; without this the
  // app-level drop handler would treat them as a project and open New Session.
  const onDrop = (e: React.DragEvent): void => {
    const files = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith('image/'))
    if (files.length === 0) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    addImages(files)
    textareaRef.current?.focus()
  }

  const submit = (): void => {
    const trimmed = text.trim()
    if ((!trimmed && attachments.length === 0) || menuOpen) {
      return
    }
    const images = attachments.map((a) => ({ mediaType: a.mediaType, base64: a.dataUrl.split(',')[1] }))
    const sentAttachments = attachments
    setSendError('')
    setText('')
    setAttachments([])
    sendMessage(sessionId, trimmed, images.length > 0 ? images : undefined).catch((e: unknown) => {
      // Give the draft back — a failed send must never eat the message.
      setText(trimmed)
      setAttachments(sentAttachments)
      const raw = e instanceof Error ? e.message : 'Could not send the message'
      setSendError(raw.replace(/^Error invoking remote method '[^']+': Error: /, ''))
    })
  }

  return (
    <div
      className="relative shrink-0 border-t border-deck-border bg-deck-panel p-3"
      onDrop={onDrop}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.items).some((item) => item.type.startsWith('image/'))) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      {menuOpen && (
        <QuickMenu
          sessionId={sessionId}
          query={menuQuery}
          onClose={() => setText('')}
          selectedIndex={menuIndex}
          setSelectedIndex={setMenuIndex}
          registerCommands={(commands) => {
            menuCommands.current = commands
          }}
        />
      )}
      <div className={busy ? 'progress-border rounded-[10px] p-[1.5px]' : ''}>
      <div
        className={`flex flex-col gap-2 rounded-lg border border-deck-border bg-deck-raised p-2 focus-within:border-zinc-600 ${
          busy ? 'progress-sheen' : ''
        }`}
      >
        {attachments.length > 0 && (
          <div className="flex gap-2 px-1 pt-1">
            {attachments.map((att, index) => (
              <div key={index} className="group relative">
                <img
                  src={att.dataUrl}
                  alt="pasted screenshot"
                  className="h-16 w-auto max-w-40 rounded-lg border border-deck-border object-cover"
                />
                <button
                  onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                  title="Remove"
                  className="absolute -right-1.5 -top-1.5 hidden h-4.5 w-4.5 items-center justify-center rounded-full bg-zinc-700 text-[10px] text-white group-hover:flex"
                >
                  ×
                </button>
              </div>
            ))}
            <span className="self-end text-[10.5px] text-zinc-600">{attachments.length}/3</span>
          </div>
        )}
        <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          onPaste={onPaste}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (e.target.value.startsWith('/')) {
              setMenuIndex(0)
            }
          }}
          onKeyDown={(e) => {
            if (menuOpen) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setMenuIndex((i) => Math.min(i + 1, Math.max(0, menuCommands.current.length - 1)))
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setMenuIndex((i) => Math.max(i - 1, 0))
                return
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                const command = menuCommands.current[menuIndex]
                if (command) {
                  void command.run()
                }
                setText('')
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setText('')
                return
              }
            }
            if (e.key === 'Tab' && e.shiftKey && meta) {
              e.preventDefault()
              const sequence = simple ? MODE_SEQUENCE.filter((m) => m.value !== 'bypassPermissions') : MODE_SEQUENCE
              const currentIndex = sequence.findIndex((m) => m.value === meta.permissionMode)
              const next = sequence[(currentIndex + 1) % sequence.length]
              void setPermissionMode(sessionId, next.value)
              return
            }
            if (e.key === 'Enter' && e.shiftKey && !e.metaKey) {
              // Insert the newline ourselves rather than trusting the default, which some
              // keyboard layouts swallow.
              e.preventDefault()
              const el = e.currentTarget
              const { selectionStart, selectionEnd } = el
              setText(`${text.slice(0, selectionStart)}\n${text.slice(selectionEnd)}`)
              requestAnimationFrame(() => {
                el.selectionStart = selectionStart + 1
                el.selectionEnd = selectionStart + 1
              })
              return
            }
            if (e.key === 'Enter' && (e.metaKey || !e.shiftKey)) {
              if (e.nativeEvent.isComposing) {
                return
              }
              e.preventDefault()
              submit()
            }
            if (e.key === 'Escape' && busy) {
              void interrupt(sessionId)
            }
          }}
          rows={1}
          placeholder="Message the agent…   ⏎ send · ⇧⏎ new line · ⌘K actions"
          className="selectable flex-1 resize-none bg-transparent px-1 py-1 text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600"
        />
        <button
          onClick={() => {
            setText(menuOpen ? '' : '/')
            setMenuIndex(0)
            textareaRef.current?.focus()
          }}
          title="Quick actions (/ or ⌘K): mode, model, branch, export…"
          className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
            menuOpen
              ? 'border-deck-accent bg-deck-accent/20 text-deck-accent-text'
              : 'border-deck-border text-zinc-400 hover:bg-deck-panel hover:text-zinc-200'
          }`}
        >
          <Zap size={14} />
        </button>
        {busy ? (
          <button
            onClick={() => void interrupt(sessionId)}
            title="Interrupt (Esc)"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/90 text-white hover:bg-red-500"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!text.trim() && attachments.length === 0}
            title="Send (⏎)"
            className="btn-brand flex h-8 w-8 items-center justify-center rounded-md disabled:opacity-30"
          >
            <SendHorizonal size={14} />
          </button>
        )}
        </div>
      </div>
      </div>
      {sendError && (
        <p className="mt-2 px-1 text-[11.5px] text-red-400">
          {sendError} <span className="text-zinc-500">Your message is back in the box.</span>
        </p>
      )}
      {meta && (
        <div className="mt-2 flex items-center gap-2 px-1">
          {!simple && (
            <select
              value={meta.model}
              onChange={(e) => void setModel(sessionId, e.target.value)}
              title="Model for this session"
              className="rounded-md border border-deck-border bg-deck-raised px-1.5 py-0.5 text-[11px] text-zinc-400 outline-none hover:text-zinc-200"
            >
              {FALLBACK_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
              {!FALLBACK_MODELS.some((m) => m.id === meta.model) && (
                <option value={meta.model}>{meta.model}</option>
              )}
            </select>
          )}
          <div className="flex rounded-md border border-deck-border bg-deck-raised p-0.5">
            {MODE_OPTIONS.map((mode) => {
              // Full auto stays visible in Simple mode but locked — invisible
              // options read as broken, disabled ones explain themselves.
              const locked = simple && mode.proOnly && meta.permissionMode !== mode.value
              return (
                <button
                  key={mode.value}
                  disabled={locked}
                  onClick={() => void setPermissionMode(sessionId, mode.value)}
                  title={locked ? 'Full auto is Pro-only. Switch the interface mode in Settings' : mode.hint}
                  className={`rounded px-2 py-0.5 text-[11px] ${
                    meta.permissionMode === mode.value
                      ? mode.value === 'bypassPermissions'
                        ? 'bg-red-700/80 text-white'
                        : 'bg-deck-accent text-deck-on-accent'
                      : locked
                        ? 'cursor-not-allowed text-zinc-700'
                        : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {mode.label}
                </button>
              )
            })}
          </div>
          {meta.permissionMode === 'bypassPermissions' && (
            <span className="text-[11px] text-red-400">agent acts without asking</span>
          )}
        </div>
      )}
    </div>
  )
}
