import { useEffect, useRef, useState } from 'react'

/** True for ~0.9s after `value` changes (never on the first render). */
export function useChangeFlash(value: unknown): boolean {
  const previous = useRef(value)
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (Object.is(previous.current, value)) return
    previous.current = value
    setFlash(true)
    const timer = setTimeout(() => setFlash(false), 900)
    return () => clearTimeout(timer)
  }, [value])
  return flash
}
