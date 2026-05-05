import { useState, useEffect, useRef } from 'react'

/**
 * useTypingState — separates "live display" from "settled animation"
 *
 * While the user is actively typing: displayValue updates instantly, isTyping = true.
 * After `settleDelay` ms of no changes: isTyping = false and settledKey increments,
 * which callers use as a remount key to replay the stroke/word animation.
 *
 * This prevents the animation from restarting on every single keystroke.
 */
export function useTypingState(value, settleDelay = 1000) {
  const [isTyping,     setIsTyping]     = useState(false)
  const [settledValue, setSettledValue] = useState(value)
  const [settledKey,   setSettledKey]   = useState(0)
  const prevValue = useRef(value)
  const timerRef  = useRef(null)

  useEffect(() => {
    // Ignore if value didn't actually change
    if (value === prevValue.current) return
    prevValue.current = value

    setIsTyping(true)
    clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      setIsTyping(false)
      setSettledValue(value)
      setSettledKey(k => k + 1)
    }, settleDelay)

    return () => clearTimeout(timerRef.current)
  }, [value, settleDelay])

  return {
    displayValue: value,      // always current — use for static preview
    isTyping,                 // true while user is mid-keystroke
    settledValue,             // last value that triggered animation
    settledKey,               // remount key — increment triggers animation replay
  }
}
