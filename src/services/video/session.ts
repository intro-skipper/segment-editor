import { generateUUID } from '@/lib/segment-utils'

export const createPlaySessionId = (): string => generateUUID()
