import type { ReactNode } from 'react'
import { C, Sql } from './ui'

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`')) return <C key={i}>{part.slice(1, -1)}</C>
    return part
  })
}

/** Rendu Markdown minimal pour les fichiers du kit (paragraphes, listes, citations, tableaux, blocs de code). */
export function Markdown({ source }: { source: string }) {
  const lines = source.split('\n')
  const out: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const code: string[] = []
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i])
      i++
      out.push(lang === 'sql' ? <Sql key={i} code={code.join('\n')} /> : <pre key={i} className="my-3 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[13px] text-slate-100">{code.join('\n')}</pre>)
      continue
    }
    const collect = (re: RegExp) => {
      const items: string[] = []
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ''))
      return items
    }
    if (line.startsWith('>')) {
      const items = collect(/^>\s?/)
      out.push(
        <blockquote key={i} className="my-3 rounded-r-lg border-l-4 border-indigo-400 bg-indigo-50 px-4 py-2 text-slate-700 dark:bg-indigo-950/40 dark:text-slate-300">
          {items.map((l, k) => <div key={k}>{inline(l)}</div>)}
        </blockquote>,
      )
    } else if (/^\d+\.\s/.test(line)) {
      out.push(<ol key={i} className="my-3 list-decimal space-y-1 pl-6">{collect(/^\d+\.\s/).map((l, k) => <li key={k}>{inline(l)}</li>)}</ol>)
    } else if (/^[-*]\s/.test(line)) {
      out.push(<ul key={i} className="my-3 list-disc space-y-1 pl-6">{collect(/^[-*]\s/).map((l, k) => <li key={k}>{inline(l)}</li>)}</ul>)
    } else if (line.startsWith('|')) {
      const rows = collect(/^(?=\|)/).filter((r) => !/^\|[-\s|]+\|$/.test(r)).map((r) => r.split('|').slice(1, -1).map((c) => c.trim()))
      out.push(
        <div key={i} className="my-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr>{rows[0].map((c, k) => <th key={k} className="border-b border-slate-300 px-3 py-2 text-left dark:border-slate-700">{inline(c)}</th>)}</tr></thead>
            <tbody>{rows.slice(1).map((r, k) => <tr key={k} className="border-b border-slate-100 dark:border-slate-800">{r.map((c, j) => <td key={j} className="px-3 py-2 align-top">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      )
    } else if (/^#{1,4} /.test(line)) {
      out.push(<h3 key={i} className="mt-6 mb-2 font-semibold text-slate-900 dark:text-white">{line.replace(/^#+ /, '')}</h3>)
      i++
    } else if (line.trim() === '' || line.trim() === '---') {
      i++
    } else {
      const para: string[] = []
      while (i < lines.length && lines[i].trim() !== '' && !/^(```|>|\d+\.\s|[-*]\s|\||#)/.test(lines[i])) para.push(lines[i++])
      out.push(<p key={i} className="my-3 leading-relaxed">{inline(para.join(' '))}</p>)
    }
  }
  return <>{out}</>
}
