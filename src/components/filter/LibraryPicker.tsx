import { useTranslation } from 'react-i18next'
import type { VirtualFolderInfo } from '@/types/jellyfin'
import { Film, Library, Mic2, Tv } from 'lucide-react'
import { LibraryCard } from '@/components/filter/LibraryCard'

const COLLECTION_ICON_PATTERNS: Array<
  readonly [pattern: RegExp, icon: typeof Library]
> = [
  [/movie/, Film],
  [/film/, Film],
  [/series/, Tv],
  [/tv/, Tv],
  [/show/, Tv],
  [/music/, Mic2],
  [/artist/, Mic2],
]

const getCollectionIcon = (name: string) => {
  const lower = name.toLowerCase()
  for (const [pattern, icon] of COLLECTION_ICON_PATTERNS) {
    if (pattern.test(lower)) return icon
  }
  return Library
}

interface LibraryPickerProps {
  collections: Array<VirtualFolderInfo> | undefined
  onCollectionChange: (value: string | null) => void
}

export function LibraryPicker({
  collections,
  onCollectionChange,
}: LibraryPickerProps) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-center py-8">
      <div className="w-full max-w-6xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-16 rounded-full bg-primary/10 mb-4">
            <Library className="size-8 text-secondary" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">
            {t('items.selectLibrary', {
              defaultValue: 'Select a Library',
            })}
          </h2>
          <p className="text-base text-muted-foreground">
            {t('items.selectLibraryDescription', {
              defaultValue: 'Choose a library to browse your media collection',
            })}
          </p>
        </div>
        <fieldset
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 border-0 p-0 m-0"
          aria-label={t('items.selectLibrary', {
            defaultValue: 'Select a Library',
          })}
        >
          {collections?.map((collection, index) => {
            const Icon = getCollectionIcon(collection.Name || '')
            return (
              <LibraryCard
                key={collection.ItemId}
                collection={collection}
                Icon={Icon}
                onSelect={onCollectionChange}
                index={index}
              />
            )
          })}
        </fieldset>
      </div>
    </div>
  )
}
