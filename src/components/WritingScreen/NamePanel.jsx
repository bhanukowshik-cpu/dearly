import { useRef } from 'react'
import styles from './NamePanel.module.css'

/* ─────────────────────────────────────────────────────────────────────────
   NamePanel — two plain inputs for sender + recipient.
   Lives in the right sidebar above PaperControls.

   No pencil-scratch audio on these fields. The metadata entry (sender
   name + recipient name) is a setup step, not the creative act of
   writing the letter — playing the writing sound here made the typing
   feel performative when it should feel like quietly filling in a form.
   The body editor (MessageBox in InputPanel.jsx) keeps the sound, which
   is where the real "writing" happens.
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
