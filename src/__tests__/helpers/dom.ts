/**
 * Narrows a queried node to a specific element type.
 *
 * Testing Library's queries return the base `HTMLElement`, so tests that read
 * subtype members (`value`, `disabled`, …) would otherwise assert the type and
 * crash later with an unhelpful message. This checks instead, and names what
 * it actually found when the check fails.
 */
export function asElement<T extends Element>(
  node: Node | null | undefined,
  elementType: new () => T,
): T {
  if (!(node instanceof elementType)) {
    throw new Error(
      `Expected ${elementType.name}, got ${node?.constructor.name ?? String(node)}`,
    )
  }
  return node
}
