type PublishButtonProps = {
  disabled: boolean
  pending: boolean
  onClick: () => void
}

/**
 * Ink-filled primary action for section 04 (UI direction component
 * inventory: "Disabled until valid; drafts never publicly reachable").
 * `disabled` reflects only the client-side completeness check — the
 * one-mile pin-to-station check is server-authoritative and can only be
 * known after this button is pressed, so a click that fails still leaves
 * the job a draft rather than the button silently doing nothing.
 */
export function PublishButton({ disabled, pending, onClick }: PublishButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      className="rounded-md bg-ink-primary px-6 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? "Publishing…" : "Publish"}
    </button>
  )
}
