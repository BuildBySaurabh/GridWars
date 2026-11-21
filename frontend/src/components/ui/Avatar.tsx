/** A colored initial badge. The color is the player's own cell color. */
export function Avatar({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full font-display font-bold text-black/80 ring-2 ring-white/15"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.42 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}
