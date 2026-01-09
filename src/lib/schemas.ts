/**
 * Zod validation schemas for runtime type validation.
 * Use schemas directly with .parse() or .safeParse() - no wrapper functions needed.
 *
 * Security: All schemas enforce strict validation to prevent injection attacks
 * and ensure data integrity before use in application logic.
 */

import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Core Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const UUIDSchema = z.string().uuid()

/**
 * Jellyfin ID schema - accepts both standard UUID format (with dashes)
 * and Jellyfin's 32-character hex format (without dashes).
 * Security: Strict regex prevents injection via malformed IDs.
 */
export const JellyfinIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i,
    'Invalid Jellyfin ID format',
  )

export const ItemIdSchema = JellyfinIdSchema

/**
 * Server URL schema with strict protocol validation.
 * Security: Only allows http/https protocols to prevent protocol injection.
 */
export const ServerUrlSchema = z
  .string()
  .url('Invalid URL format')
  .refine(
    (url) => {
      try {
        const { protocol } = new URL(url)
        return protocol === 'http:' || protocol === 'https:'
      } catch {
        return false
      }
    },
    { message: 'URL must use http or https protocol' },
  )

/**
 * API Key schema - validates format and prevents empty/whitespace-only keys.
 * Security: Ensures API keys are non-empty strings without leading/trailing whitespace.
 */
export const ApiKeySchema = z
  .string()
  .min(1, 'API key is required')
  .transform((val) => val.trim())
  .refine((val) => val.length > 0, 'API key cannot be empty or whitespace')

/**
 * Provider ID schema with strict whitelist validation.
 * Security: Only allows known provider IDs to prevent injection.
 */
export const ProviderIdSchema = z.enum([
  'SegmentEditor',
  'IntroSkipper',
  'ChapterSegments',
])

export const MediaSegmentTypeSchema = z.enum([
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

/**
 * Time input schema - accepts numbers or time strings.
 * Security: Strict regex prevents injection via malformed time strings.
 */
export const TimeInputSchema = z.union([
  z.number().nonnegative(),
  z.string().regex(/^[\d:.]+$/, 'Invalid time format'),
])

export const MediaSegmentArraySchema = z.array(MediaSegmentSchema)

/**
 * Pagination schema for API requests.
 * Security: Enforces reasonable limits to prevent DoS via large requests.
 */
export const PaginationSchema = z.object({
  limit: z.number().int().positive().max(1000).optional(),
  startIndex: z.number().int().nonnegative().optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// API Response Schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base item schema for Jellyfin media items.
 * Uses passthrough() to allow additional fields from API while validating core fields.
 */
export const BaseItemSchema = z
  .object({
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
  .passthrough()

export const BaseItemArraySchema = z.array(BaseItemSchema)

export const VirtualFolderSchema = z
  .object({
    Name: z.string().optional(),
    ItemId: z.string().optional(),
    CollectionType: z.string().optional().nullable(),
  })
  .passthrough()

export const VirtualFolderArraySchema = z.array(VirtualFolderSchema)

export const PluginInfoSchema = z
  .object({
    Name: z.string().optional(),
    Version: z.string().optional(),
    Id: JellyfinIdSchema.optional(),
    CanUninstall: z.boolean().optional(),
    Description: z.string().optional(),
    Status: z.string().optional(),
  })
  .passthrough()

export const PluginInfoArraySchema = z.array(PluginInfoSchema)

/**
 * Search input schema with sanitization.
 * Security: Limits length and trims whitespace to prevent injection.
 */
export const SearchInputSchema = z
  .string()
  .max(200, 'Search query too long')
  .transform((val) => val.trim())

/**
 * URL-safe string schema for path parameters.
 * Security: Validates that strings are safe for URL inclusion.
 */
export const UrlSafeStringSchema = z.string().refine(
  (val) => {
    // Check for common URL injection patterns
    const dangerousPatterns = [
      /\.\./,
      /<script/i,
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
    ]
    return !dangerousPatterns.some((pattern) => pattern.test(val))
  },
  { message: 'String contains potentially unsafe characters' },
)

// ─────────────────────────────────────────────────────────────────────────────
// Inferred Types
// ─────────────────────────────────────────────────────────────────────────────

export type ValidatedSegment = z.infer<typeof MediaSegmentSchema>
export type ValidatedSegmentType = z.infer<typeof MediaSegmentTypeSchema>
export type ValidatedTimeInput = z.infer<typeof TimeInputSchema>
export type ValidatedBaseItem = z.infer<typeof BaseItemSchema>
export type ValidatedVirtualFolder = z.infer<typeof VirtualFolderSchema>
export type ValidatedPluginInfo = z.infer<typeof PluginInfoSchema>
export type ValidatedProviderId = z.infer<typeof ProviderIdSchema>
export type ValidatedPagination = z.infer<typeof PaginationSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Validation Helpers (only for commonly used patterns)
// ─────────────────────────────────────────────────────────────────────────────

export const isValidItemId = (id: unknown): id is string =>
  ItemIdSchema.safeParse(id).success

export const isValidServerUrl = (url: unknown): url is string =>
  ServerUrlSchema.safeParse(url).success

export const isValidProviderId = (id: unknown): id is string =>
  ProviderIdSchema.safeParse(id).success

export const isValidApiKey = (key: unknown): key is string =>
  ApiKeySchema.safeParse(key).success

export const sanitizeSearchInput = (input: unknown): string => {
  const result = SearchInputSchema.safeParse(input)
  return result.success ? result.data : ''
}

/**
 * Safely encodes a value for use in URL path segments.
 * Security: Ensures proper encoding to prevent URL injection.
 */
export const encodeUrlParam = (value: string): string => {
  return encodeURIComponent(value)
}

/**
 * Safely decodes a URL-encoded value.
 * Security: Handles malformed encoding gracefully.
 */
export const decodeUrlParam = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    // Return original value if decoding fails (malformed encoding)
    return value
  }
}

/**
 * Validates and parses API response data with strict mode.
 * Returns null if validation fails, logging the error.
 * Security: Ensures API responses conform to expected schema before use.
 */
export function validateApiResponse<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string,
): T | null {
  const result = schema.safeParse(data)
  if (!result.success) {
    console.warn(`[${context}] API response validation failed:`, {
      issues: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    })
    return null
  }
  return result.data
}
