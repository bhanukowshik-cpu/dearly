import { useRef } from 'react'
import { useTypingSound } from '../../lib/useTypingSound'
import styles from './NamePanel.module.css'

/* ─────────────────────────────────────────────────────────────────────────
   NamePanel — two plain inputs for sender + recipient.
   Lives in the right sidebar above PaperControls.
   ───────────────────────────────────────────────────────────────────────── */
export default function NamePanel({
  recipient,
  onRecipientChange,
  senderName,
  onSenderNameChange,
  horizontal = false,
}) {
  const senderRef    = useRef(null)
  const recipientRef = useRef(null)
  useTypingSound(senderRef)
  useTypingSound(recipientRef)

  return (
    <div className={`${styles.wrap} ${horizontal ? styles.wrapHorizontal : ''}`}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="np-sender">
          Sender's name <span className={styles.labelHint}>(yours)</span>
        </label>
        <input
          ref={senderRef}
          id="np-sender"
          className={styles.input}
          type="text"
          value={senderName ?? ''}
          onChange={e => onSenderNameChange?.(e.target.value)}
          placeholder="Your name"
          maxLength={40}
          spellCheck
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="np-recipient">
          Receiver's name
        </label>
        <input
          ref={recipientRef}
          id="np-recipient"
          className={styles.input}
          type="text"
          value={recipient ?? ''}
          onChange={e => onRecipientChange?.(e.target.value)}
          placeholder="Their name"
          maxLength={60}
          spellCheck
        />
      </div>
    </div>
  )
}
