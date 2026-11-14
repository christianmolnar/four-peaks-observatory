/**
 * The chevron for a native `<details>` whose `<summary>` is `display:flex` (which removes the browser's own marker).
 * The `<details>` must carry the `group` class; the chevron turns down while it is open, with no state to keep.
 */
export default function DisclosureChevron() {
  return (
    <span aria-hidden="true" data-disclosure-chevron className="mr-2 inline-block w-4 shrink-0 text-white/70 group-open:rotate-90">
      ▸
    </span>
  );
}
