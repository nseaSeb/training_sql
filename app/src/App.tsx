import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { NavContext, type Page } from './lib/nav'
import { useStored } from './lib/storage'
import Home from './pages/Home'


const Lessons = lazy(() => import('./pages/Lessons'))
const Method = lazy(() => import('./pages/Method'))
const Lexicon = lazy(() => import('./pages/Lexicon'))
const Cheatsheet = lazy(() => import('./pages/Cheatsheet'))
const Tickets = lazy(() => import('./pages/Tickets'))
const Quiz = lazy(() => import('./pages/Quiz'))
const Playground = lazy(() => import('./pages/Playground'))

const pages: { id: Page; label: string; icon: string }[] = [
  { id: 'accueil', label: 'Accueil', icon: '⌂' },
  { id: 'methode', label: 'Méthode', icon: '⇢' },
  { id: 'cours', label: 'Cours', icon: '◧' },
  { id: 'lexique', label: 'Lexique', icon: 'Aa' },
  { id: 'cheatsheet', label: 'Cheatsheet', icon: '⌕' },
  { id: 'tickets', label: 'Tickets', icon: '◉' },
  { id: 'playground', label: 'Playground', icon: '▶' },
  { id: 'quiz', label: 'Auto-évaluation', icon: '✓' },
]

const readHash = (): [Page, string | undefined] => {
  const [p, anchor] = location.hash.slice(1).split('/')
  return [pages.some((x) => x.id === p) ? (p as Page) : 'accueil', anchor]
}

export default function App() {
  const [page, setPage] = useState<Page>(() => readHash()[0])
  const [sql, setSql] = useStored('playground:sql', 'SELECT * FROM magasins;')

  useEffect(() => {
    const onHash = () => {
      const [p, anchor] = readHash()
      setPage(p)
      if (!anchor) return window.scrollTo({ top: 0 })
      // la page peut être chargée à la demande : on réessaie le temps qu'elle apparaisse
      let tries = 0
      const scroll = () => {
        const el = document.getElementById(anchor)
        if (el) el.scrollIntoView({ behavior: 'smooth' })
        else if (tries++ < 20) setTimeout(scroll, 50)
      }
      scroll()
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = useCallback((p: Page, anchor?: string) => {
    location.hash = anchor ? `${p}/${anchor}` : p
  }, [])
  const openInPlayground = useCallback(
    (s: string) => {
      setSql(s)
      go('playground')
    },
    [go, setSql],
  )

  return (
    <NavContext.Provider value={{ page, go, openInPlayground }}>
      <div className="flex min-h-full flex-col md:flex-row">
        <nav className="sticky top-0 z-10 flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-white/90 px-3 py-2 backdrop-blur md:h-screen md:w-56 md:flex-col md:border-r md:border-b-0 md:px-3 md:py-6 dark:border-slate-800 dark:bg-slate-900/90">
          <div className="mb-6 hidden px-3 md:block">
            <div className="text-lg font-bold tracking-tight">Training<span className="text-indigo-600"> SQL</span></div>
            <div className="text-xs text-slate-500">training_sql · Postgres 16</div>
          </div>
          {pages.map((p) => (
            <button key={p.id} onClick={() => go(p.id)} className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${page === p.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>
              <span className="w-4 text-center">{p.icon}</span>
              {p.label}
            </button>
          ))}
        </nav>
        <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-8 md:px-10">
          <Suspense fallback={<div className="text-slate-400">Chargement…</div>}>
            {page === 'accueil' && <Home />}
            {page === 'cours' && <Lessons />}
            {page === 'methode' && <Method />}
            {page === 'lexique' && <Lexicon />}
            {page === 'cheatsheet' && <Cheatsheet />}
            {page === 'tickets' && <Tickets />}
            {page === 'playground' && <Playground sql={sql} setSql={setSql} />}
            {page === 'quiz' && <Quiz />}
          </Suspense>
        </main>
      </div>
    </NavContext.Provider>
  )
}
