/**
 * The editor's draft of one item's segments. Edits stay local, sorted by
 * start, until save() replaces the item's whole set on the server; a failed
 * save keeps the draft and refetches what the server holds.
 */

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { MediaSegmentDto } from '@/types/jellyfin'
import type { CreateSegmentData } from '@/types/segment'
import type { SegmentSnapshot } from './store'
import { UNREAD_SNAPSHOT, replaceSegments } from './store'
import { NO_SEGMENTS, segmentsQueryOptions, useSegments } from './queries'
import { segmentsKeys } from './query-keys'
import {
  generateUUID,
  getSegmentsSortedByStart,
  sortSegmentsByStart,
} from '@/lib/segment-utils'
import { elementAt } from '@/lib/utils'
import type { RangeRules, SegmentRange } from '@/lib/segment-range'
import { placeRange } from '@/lib/segment-range'
import { showError, showSuccess } from '@/lib/notifications'
import { AppError, ErrorCodes } from '@/lib/unified-error'
import { handleQueryError } from '@/hooks/queries/query-error-handling'

/**
 * The segment a command acts on. Prefer `id`: the list re-sorts after every
 * edit, so an index captured earlier can point at another segment. 'active'
 * resolves when the command applies.
 */
export type SegmentTarget = { id: string } | { index: number } | 'active'

/**
 * Fields an edit changes. Moved boundaries are placed under the range rules,
 * and the edited segment re-sorts and becomes active.
 */
export type SegmentPatch = Partial<
  Pick<MediaSegmentDto, 'Type' | 'StartTicks' | 'EndTicks'>
>

interface Draft {
  itemId: string
  segments: Array<MediaSegmentDto> | null
  activeIndex: number
  /**
   * The snapshot the draft started from; saving writes from it, so a change
   * made elsewhere meanwhile is a conflict, not silently overwritten.
   * 'reread' after a failed save: the server may hold part of that save.
   */
  base: SegmentSnapshot | 'reread'
}

interface Edit {
  segments: Array<MediaSegmentDto>
  activeIndex: number
}

interface SaveInput {
  itemId: string
  base: Draft['base']
  segments: Array<MediaSegmentDto>
}

const emptyDraft = (itemId: string): Draft => ({
  itemId,
  segments: null,
  activeIndex: 0,
  base: UNREAD_SNAPSHOT,
})

const startOf = (segment: MediaSegmentDto): number => segment.StartTicks ?? 0
const endOf = (segment: MediaSegmentDto): number =>
  segment.EndTicks ?? startOf(segment)

/** Insertion point after every segment that starts earlier, or ends no later at the same start. */
function findInsertionIndex(
  segments: ReadonlyArray<MediaSegmentDto>,
  segment: MediaSegmentDto,
): number {
  let low = 0
  let high = segments.length
  while (low < high) {
    const mid = (low + high) >> 1
    const candidate = segments[mid]
    if (
      startOf(candidate) < startOf(segment) ||
      (startOf(candidate) === startOf(segment) &&
        endOf(candidate) <= endOf(segment))
    ) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return low
}

function insertSorted(
  segments: ReadonlyArray<MediaSegmentDto>,
  segment: MediaSegmentDto,
): Edit {
  const activeIndex = findInsertionIndex(segments, segment)
  return { segments: segments.toSpliced(activeIndex, 0, segment), activeIndex }
}

function resolveIndex(
  segments: ReadonlyArray<MediaSegmentDto>,
  activeIndex: number,
  target: SegmentTarget,
): number {
  if (target !== 'active' && 'id' in target) {
    return segments.findIndex((segment) => segment.Id === target.id)
  }
  const index = target === 'active' ? activeIndex : target.index
  return index >= 0 && index < segments.length ? index : -1
}

const rangeOf = (segment: MediaSegmentDto): SegmentRange => ({
  start: segment.StartTicks ?? 0,
  end: segment.EndTicks ?? 0,
})

/**
 * Time inputs show three decimals, so a boundary that comes back within this
 * of its old value was retyped or rounded, not moved.
 */
const INPUT_PRECISION_SECONDS = 0.0005

/**
 * `next` with the boundaries that moved away from `from` placed under the
 * rules. A boundary the edit left alone keeps its exact old value, so saving
 * the edit dialog unchanged or changing only the type keeps what the server
 * holds.
 */
function placeMoved(
  from: SegmentRange,
  next: SegmentRange,
  rules: RangeRules,
): SegmentRange {
  const startMoved = Math.abs(next.start - from.start) > INPUT_PRECISION_SECONDS
  const endMoved = Math.abs(next.end - from.end) > INPUT_PRECISION_SECONDS
  if (!startMoved && !endMoved) return from
  return placeRange(
    {
      start: startMoved ? next.start : from.start,
      end: endMoved ? next.end : from.end,
    },
    rules,
    startMoved && endMoved ? 'both' : startMoved ? 'start' : 'end',
  )
}

const withRange = (
  segment: MediaSegmentDto,
  { start, end }: SegmentRange,
): MediaSegmentDto => ({ ...segment, StartTicks: start, EndTicks: end })

const compareStrings = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0

const compareCanonical = (a: MediaSegmentDto, b: MediaSegmentDto): number =>
  startOf(a) - startOf(b) ||
  (a.EndTicks ?? 0) - (b.EndTicks ?? 0) ||
  compareStrings(a.Id ?? '', b.Id ?? '') ||
  compareStrings(a.Type ?? '', b.Type ?? '')

/** Same segments in any order: list order is presentation, not an edit. */
function isSameSegmentSet(
  a: ReadonlyArray<MediaSegmentDto>,
  b: ReadonlyArray<MediaSegmentDto>,
): boolean {
  if (a.length !== b.length) return false
  const sortedB = b.toSorted(compareCanonical)
  return a.toSorted(compareCanonical).every((segment, index) => {
    const other = sortedB[index]
    return (
      segment.Id === other.Id &&
      segment.Type === other.Type &&
      segment.StartTicks === other.StartTicks &&
      segment.EndTicks === other.EndTicks
    )
  })
}

/**
 * Edits one item's segments under `rules`. `enabled: false` edits without
 * reading the server's set, and saving then only adds segments.
 */
export function useSegmentEditSession(
  itemId: string,
  { enabled, rules }: { enabled: boolean; rules: RangeRules },
) {
  const queryClient = useQueryClient()
  const query = useSegments(itemId, { enabled })
  const snapshot = query.data
  // Identity-stable per snapshot, so commands keep their identity between
  // edits and list rows stay cached (see getSegmentsSortedByStart).
  const serverSegments = getSegmentsSortedByStart(
    snapshot?.segments ?? NO_SEGMENTS,
  )

  const [draft, setDraft] = React.useState(() => emptyDraft(itemId))
  if (draft.itemId !== itemId) setDraft(emptyDraft(itemId))

  const saveMutation = useMutation({
    mutationFn: async ({ itemId: id, base, segments: next }: SaveInput) =>
      replaceSegments(
        id,
        base === 'reread'
          ? await queryClient.fetchQuery({
              ...segmentsQueryOptions.list(id),
              staleTime: 0,
            })
          : base,
        next,
      ),
    // A replace is not safe to replay from the same snapshot; the store
    // already retries each request.
    retry: false,
    onSuccess: (saved, { itemId: id }) => {
      queryClient.setQueryData<SegmentSnapshot>(segmentsKeys.list(id), saved)
      showSuccess('All segments saved')
    },
    onError: (cause) => {
      const error = AppError.from(cause)
      if (error.code === ErrorCodes.CANCELLED) return
      handleQueryError(error, { operation: 'Save segments' })
      showError(
        'Save segments failed',
        error.recoverable ? 'Please try again' : error.message,
      )
    },
    onSettled: (_saved, _error, { itemId: id }) => {
      void queryClient.invalidateQueries({ queryKey: segmentsKeys.list(id) })
    },
  })
  const isSaving = saveMutation.isPending

  const segments = draft.segments ?? serverSegments
  // A draft stays unsaved until its save settles, even if it meanwhile
  // matches the server set: the save in flight may still write older edits.
  const isDirty =
    draft.segments !== null &&
    (isSaving || !isSameSegmentSet(draft.segments, serverSegments))

  const edit = (apply: (current: Edit) => Edit | null): void => {
    setDraft((previous) => {
      const next = apply({
        segments: previous.segments ?? serverSegments,
        activeIndex: previous.activeIndex,
      })
      if (next === null) return previous
      const base =
        previous.segments === null
          ? (snapshot ?? UNREAD_SNAPSHOT)
          : previous.base
      return { ...previous, ...next, base }
    })
  }

  const create = ({ type, start, end }: CreateSegmentData): void => {
    const segment = withRange(
      { Id: generateUUID(), ItemId: itemId, Type: type },
      placeRange({ start, end: end ?? start + 1 }, rules),
    )
    edit(({ segments: current }) => insertSorted(current, segment))
  }

  const update = (target: SegmentTarget, patch: SegmentPatch): void => {
    edit(({ segments: current, activeIndex }) => {
      const index = resolveIndex(current, activeIndex, target)
      const segment = elementAt(current, index)
      if (segment === undefined) return null
      const patched = { ...segment, ...patch }
      const updated = withRange(
        patched,
        placeMoved(rangeOf(segment), rangeOf(patched), rules),
      )
      if (isSameSegmentSet([segment], [updated])) return null
      return insertSorted(current.toSpliced(index, 1), updated)
    })
  }

  const remove = (target: SegmentTarget): void => {
    edit(({ segments: current, activeIndex }) => {
      const index = resolveIndex(current, activeIndex, target)
      if (index === -1) return null
      const remaining = current.toSpliced(index, 1)
      return {
        segments: remaining,
        activeIndex:
          activeIndex > index
            ? activeIndex - 1
            : Math.max(0, Math.min(activeIndex, remaining.length - 1)),
      }
    })
  }

  /** 'replace' swaps the whole draft for `imported`; 'merge' adds them. */
  const importSegments = (
    imported: Array<MediaSegmentDto>,
    mode: 'replace' | 'merge',
  ): void => {
    const placed = imported.map((segment) =>
      withRange(segment, placeRange(rangeOf(segment), rules)),
    )
    edit(({ segments: current, activeIndex }) =>
      mode === 'replace'
        ? { segments: placed.toSorted(sortSegmentsByStart), activeIndex: 0 }
        : {
            segments: [...current, ...placed].sort(sortSegmentsByStart),
            activeIndex,
          },
    )
  }

  // Rows call this on every pointerdown and focus inside them; returning the
  // same state for an unchanged index lets React skip the re-render.
  const select = (index: number): void => {
    setDraft((previous) =>
      previous.activeIndex === index
        ? previous
        : { ...previous, activeIndex: index },
    )
  }

  /** Moves the active segment by `delta`, wrapping at either end. */
  const step = (delta: 1 | -1): void => {
    setDraft((previous) => {
      const count = (previous.segments ?? serverSegments).length
      const activeIndex =
        count === 0 ? 0 : (previous.activeIndex + delta + count) % count
      return { ...previous, activeIndex }
    })
  }

  const save = async (): Promise<void> => {
    if (!isDirty || isSaving || draft.segments === null) return
    const saving = draft.segments
    let saved: SegmentSnapshot
    try {
      saved = await saveMutation.mutateAsync({
        itemId,
        base: draft.base,
        segments: saving,
      })
    } catch {
      // onError reported it; the draft stays for another try. A draft that
      // started before the server set loaded keeps only adding segments.
      setDraft((previous) =>
        previous.itemId !== itemId || previous.base === UNREAD_SNAPSHOT
          ? previous
          : { ...previous, base: 'reread' },
      )
      return
    }
    // Clear only the draft this save wrote. Edits made while it was in
    // flight stay unsaved, now on top of what it wrote.
    setDraft((previous) => {
      if (previous.itemId !== itemId) return previous
      return previous.segments === saving
        ? { ...previous, segments: null }
        : { ...previous, base: saved }
    })
  }

  const discard = (): void => {
    setDraft(emptyDraft(itemId))
  }

  return {
    segments,
    activeIndex: draft.activeIndex,
    isLoading: query.isLoading,
    isDirty,
    isSaving,
    create,
    update,
    remove,
    importSegments,
    select,
    step,
    save,
    discard,
  }
}
