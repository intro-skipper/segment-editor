import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Settings } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useSessionStore } from '@/stores/session-store'

export default function Header() {
  const { t } = useTranslation()
  const toggleSettings = useSessionStore((state) => state.toggleSettings)

  return (
    <header className="h-14 px-4 flex items-center justify-between bg-card border-b border-border">
      <h1 className="text-lg font-semibold">
        <Link
          to="/"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <span>{t('app.title')}</span>
        </Link>
      </h1>

      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSettings}
        aria-label={t('app.theme.title')}
      >
        <Settings className="size-5" />
      </Button>
    </header>
  )
}
