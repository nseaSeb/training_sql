import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { basicSetup } from 'codemirror'
import { EditorView, Decoration, keymap, tooltips, type DecorationSet } from '@codemirror/view'
import { Compartment, EditorState, Prec, StateEffect, StateField } from '@codemirror/state'
import { indentWithTab, isolateHistory, toggleComment } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { PostgreSQL, sql } from '@codemirror/lang-sql'
import { tags as t } from '@lezer/highlight'
import { statementAt } from '../lib/statements'

/** Ce que la page peut demander à l'éditeur. */
export type SqlEditorHandle = {
  /** Texte sélectionné (ou tout le texte), avec sa position de départ dans l'éditeur */
  selectionOrAll(): { text: string; from: number }
  /** Instruction sous le curseur (ou la sélection si elle existe) */
  current(): { text: string; from: number } | null
  insert(text: string): void
  /** Remplace un morceau du texte (formatage), en gardant l'annulation possible avec ⌘Z */
  replace(from: number, to: number, text: string): void
  /** Souligne l'erreur à partir de la position donnée (0 = début du texte) et y place le curseur */
  markError(pos: number): void
  focus(): void
}

type Props = {
  value: string
  onChange: (v: string) => void
  schema: Record<string, string[]>
  onRun: () => void
  onRunCurrent: () => void
  onToggleSchema: () => void
  onSave: () => void
  onFormat: () => void
}

// Même palette que les blocs de code du site (highlight.ts)
const colors = HighlightStyle.define([
  { tag: t.keyword, color: '#7dd3fc', fontWeight: '600' },
  { tag: [t.string, t.special(t.string)], color: '#fcd34d' },
  { tag: t.number, color: '#fdba74' },
  { tag: [t.lineComment, t.blockComment], color: '#64748b', fontStyle: 'italic' },
  { tag: [t.typeName, t.standard(t.name)], color: '#6ee7b7' },
  { tag: t.special(t.name), color: '#c4b5fd' },
  { tag: [t.operator, t.punctuation], color: '#cbd5e1' },
])

const theme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: '#f1f5f9', fontSize: '13px' },
    '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', padding: '12px 0', caretColor: '#f1f5f9' },
    '.cm-scroller': { lineHeight: '1.65', minHeight: '180px', maxHeight: '60vh' },
    '.cm-gutters': { backgroundColor: 'transparent', color: '#475569', border: 'none' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgba(148, 163, 184, 0.07)' },
    '&.cm-focused': { outline: 'none' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(99, 102, 241, 0.4)' },
    '&.cm-focused .cm-cursor': { borderLeftColor: '#f1f5f9' },
    '.cm-matchingBracket': { backgroundColor: 'rgba(99, 102, 241, 0.35)', outline: 'none' },
    '.cm-error': { textDecoration: 'underline wavy #fb7185', textUnderlineOffset: '3px', backgroundColor: 'rgba(244, 63, 94, 0.15)' },
    '.cm-tooltip': { backgroundColor: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: '#4f46e5', color: 'white' },
  },
  { dark: true },
)

// Soulignement de l'erreur : posé par markError, effacé à la première modification
const setError = StateEffect.define<{ from: number; to: number } | null>()
const errorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) if (e.is(setError)) return e.value ? Decoration.set([Decoration.mark({ class: 'cm-error' }).range(e.value.from, e.value.to)]) : Decoration.none
    return tr.docChanged ? Decoration.none : deco.map(tr.changes)
  },
  provide: (f) => EditorView.decorations.from(f),
})

export const SqlEditor = forwardRef<SqlEditorHandle, Props>(function SqlEditor({ value, onChange, schema, onRun, onRunCurrent, onToggleSchema, onSave, onFormat }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const language = useRef(new Compartment())
  // Les raccourcis lisent toujours les derniers callbacks, sans recréer l'éditeur
  const cb = useRef({ onChange, onRun, onRunCurrent, onToggleSchema, onSave, onFormat })
  cb.current = { onChange, onRun, onRunCurrent, onToggleSchema, onSave, onFormat }

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          Prec.highest(
            keymap.of([
              { key: 'Mod-Enter', run: () => (cb.current.onRun(), true) },
              { key: 'Shift-Mod-Enter', run: () => (cb.current.onRunCurrent(), true) },
              { key: 'Mod-i', run: () => (cb.current.onToggleSchema(), true) },
              { key: 'Mod-s', run: () => (cb.current.onSave(), true) },
              { key: 'Shift-Alt-f', run: () => (cb.current.onFormat(), true) },
              // Mod-/ (fourni par basicSetup) ne part pas en AZERTY, où « / » se tape avec Maj + « : »
              { key: 'Mod-:', run: toggleComment },
              { key: 'Shift-Mod-:', run: toggleComment },
            ]),
          ),
          basicSetup,
          keymap.of([indentWithTab]),
          language.current.of(sql({ dialect: PostgreSQL })),
          syntaxHighlighting(colors),
          theme,
          EditorView.lineWrapping,
          tooltips({ parent: document.body }),
          errorField,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Texte changé depuis l'extérieur (historique, aperçu, « Exécuter » d'une fiche)
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])

  // Le schéma arrive après le montage : on reconfigure l'autocomplétion
  useEffect(() => {
    view.current?.dispatch({ effects: language.current.reconfigure(sql({ dialect: PostgreSQL, schema })) })
  }, [schema])

  useImperativeHandle(ref, () => ({
    selectionOrAll() {
      const s = view.current!.state
      const { from, to } = s.selection.main
      return from === to ? { text: s.doc.toString(), from: 0 } : { text: s.sliceDoc(from, to), from }
    },
    current() {
      const s = view.current!.state
      const { from, to } = s.selection.main
      if (from !== to) return { text: s.sliceDoc(from, to), from }
      const st = statementAt(s.doc.toString(), from)
      return st && { text: st.text, from: st.from }
    },
    insert(text) {
      const v = view.current!
      v.dispatch(v.state.replaceSelection(text))
      v.focus()
    },
    replace(from, to, text) {
      const v = view.current!
      // Étape d'annulation à part : ⌘Z défait le formatage seul, pas la frappe qui le précède
      v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from, head: from + text.length }, annotations: isolateHistory.of('full') })
      v.focus()
    },
    markError(pos) {
      const v = view.current!
      const len = v.state.doc.length
      const from = Math.max(0, Math.min(pos, len))
      const word = /^[\w$."]+|^./.exec(v.state.sliceDoc(from, Math.min(len, from + 60)))
      const to = Math.min(len, from + (word ? word[0].length : 1))
      v.dispatch({ effects: setError.of(to > from ? { from, to } : null), selection: { anchor: from }, scrollIntoView: true })
      v.focus()
    },
    focus: () => view.current?.focus(),
  }))

  return <div ref={host} />
})
