/**
 * Zod validation schemas for runtime type validation.
 * Use schemas directly with .parse() or .safeParse() - no wrapper functions needed.
 *
 * Security: All schemas enforce strict validation to prevent injection attacks
 * and ensure data integrity before use in application logic.
 */

import { z } from 'zod'

/**
 * Jellyfin ID schema - accepts both standard UUID format (with dashes)
 * and Jellyfin's 32-character hex format (without dashes).
 * Security: Strict regex prevents injection via malformed IDs.
 */
const JellyfinIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i,
    'Invalid Jellyfin ID format',
  )

const ItemIdSchema = JellyfinIdSchema

const MediaSegmentTypeSchema = z.enum([
  'Intro',
  'Outro',
  'Preview',
  'Recap',
  'Commercial',
  'Unknown',
])

/**
 * Media segment schema with strict validation.
 * Security: Validates all fields to prevent malformed segment data.
 */
export const MediaSegmentSchema = z.object({
  Id: JellyfinIdSchema.optional(),
  ItemId: JellyfinIdSchema.optional(),
  Type: MediaSegmentTypeSchema,
  StartTicks: z.number().nonnegative(),
  EndTicks: z.number().nonnegative(),
})

export const MediaSegmentArraySchema = z.array(MediaSegmentSchema)

/**
 * Base item schema for Jellyfin media items.
 * Uses passthrough() to allow additional fields from API while validating core fields.
 */
const BaseItemSchema = z.looseObject({
  Id: JellyfinIdSchema.optional(),
  Name: z.string().optional(),
  Type: z.string().optional(),
  ParentId: JellyfinIdSchema.optional().nullable(),
  SeriesId: JellyfinIdSchema.optional().nullable(),
  SeasonId: JellyfinIdSchema.optional().nullable(),
  RunTimeTicks: z.number().nonnegative().optional().nullable(),
  IndexNumber: z.number().int().optional().nullable(),
  ParentIndexNumber: z.number().int().optional().nullable(),
})

export const BaseItemArraySchema = z.array(BaseItemSchema)

const VirtualFolderSchema = z.looseObject({
  Name: z.string().optional(),
  ItemId: z.string().optional(),
  CollectionType: z.string().optional().nullable(),
})

export const VirtualFolderArraySchema = z.array(VirtualFolderSchema)

export const isValidItemId = (id: string | null | undefined): id is string =>
  ItemIdSchema.safeParse(id).success

/**
 * Safely encodes a value for use in URL path segments.
 * Security: Ensures proper encoding to prevent URL injection.
 */
export const encodeUrlParam = (value: string): string => {
  return encodeURIComponent(value)
}
