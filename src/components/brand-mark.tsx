/** Temporary typographic avatar, not a finalized logo or a client avatar. */
export function BrandMark({ small = false }: { small?: boolean }) {
  return <span className={`brand-mark${small ? " brand-mark-small" : ""}`} aria-hidden="true">L<span /></span>;
}
