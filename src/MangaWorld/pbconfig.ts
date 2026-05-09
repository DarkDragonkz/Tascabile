import type { ExtensionInfo } from '@paperback/types'
import { ContentRating, SourceIntents } from '@paperback/types'

export default {
  name: 'MangaWorld',
  description: 'MangaWorld source for Paperback 0.9',
  version: '0.9.0-alpha.9',
  icon: 'icon.svg',
  language: 'it',
  contentRating: ContentRating.MATURE,
  capabilities: [
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.CHAPTER_PROVIDING,
  ],
  badges: [
    {
      label: 'Italian',
      textColor: '#ffffff',
      backgroundColor: '#2c3e50'
    }
  ],
  developers: [
    {
      name: 'DarkDragonkz',
      github: 'https://github.com/DarkDragonkz'
    }
  ]
} satisfies ExtensionInfo
