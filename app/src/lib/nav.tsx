import { createContext, useContext } from 'react'

export type Page = 'accueil' | 'methode' | 'cours' | 'lexique' | 'cheatsheet' | 'tickets' | 'playground' | 'quiz'

type Nav = {
  page: Page
  go: (page: Page, anchor?: string) => void
  /** Charge une requête dans le playground et y bascule */
  openInPlayground: (sql: string) => void
}

export const NavContext = createContext<Nav>(null as unknown as Nav)
export const useNav = () => useContext(NavContext)
