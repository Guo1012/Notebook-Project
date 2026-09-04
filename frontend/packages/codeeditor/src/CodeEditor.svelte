<script lang="ts">
  import { onMount } from 'svelte';
  import { Compartment, EditorState } from '@codemirror/state';
  import { EditorView, keymap, type KeyBinding } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap, indentWithTab, insertNewlineAndIndent } from '@codemirror/commands';
  import { python, pythonLanguage } from '@codemirror/lang-python';
  import { HighlightStyle, LanguageSupport, bracketMatching, codeFolding, foldGutter, foldKeymap, forceParsing, indentUnit, syntaxHighlighting, syntaxTree } from '@codemirror/language';
  import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
  import { lintGutter, linter, lintKeymap, setDiagnostics, type Diagnostic } from '@codemirror/lint';
  import { CodeEditor as JupyterCodeEditor } from '@jupyterlab/codeeditor';
  import { CodeMirrorEditor, EditorLanguageRegistry } from '@jupyterlab/codemirror';
  import { tags } from '@lezer/highlight';
  import type { CodeEditorDiagnostic, CodeEditorHandle, CompletionProvider } from './types';

  // CodeMirrorEditor resolves the model's mime type through its own language registry; without a
  // registered Python language it falls back to the text/plain placeholder parser, which disables
  // syntax highlighting. Register Python so 'text/x-python' parses as actual Python.
  const pythonLanguages = new EditorLanguageRegistry();
  pythonLanguages.addLanguage({
    name: 'Python',
    mime: 'text/x-python',
    extensions: ['py'],
    load: async () => new LanguageSupport(pythonLanguage)
  });

  let {
    value, readOnly = false, autofocus = false, compact = false, diagnostics = [], completionProvider,
    messages = {}, onchange = () => undefined, onready
  }: {
    value: string; language?: string; readOnly?: boolean; autofocus?: boolean; compact?: boolean;
    diagnostics?: CodeEditorDiagnostic[]; completionProvider?: CompletionProvider;
    messages?: { syntaxError?: string };
    onchange?: (value: string) => void; onready?: (handle: CodeEditorHandle) => void;
  } = $props();
  let container: HTMLElement;
  let editor: CodeMirrorEditor | undefined;
  let mounted = $state(false);
  const readOnlyCompartment = new Compartment();
  const editableCompartment = new Compartment();
  const colors = HighlightStyle.define([
    { tag: tags.keyword, color: '#4f7a52' }, { tag: tags.string, color: '#a65f49' },
    { tag: tags.number, color: '#3f7a9e' }, { tag: tags.comment, color: '#9aa297', fontStyle: 'italic' },
    { tag: tags.function(tags.variableName), color: '#2f6b8a' }
  ]);
  const bindings: KeyBinding[] = [
    { key: 'Enter', run: insertNewlineAndIndent }, indentWithTab,
    ...defaultKeymap.filter(binding => binding.key !== 'Escape' && binding.key !== 'Mod-Enter' && binding.key !== 'Enter'),
    ...historyKeymap, ...foldKeymap, ...lintKeymap
  ];
  const syntaxLinter = linter(async editor => {
    await forceParsing(editor);
    const result: Diagnostic[] = [];
    syntaxTree(editor.state).iterate({ enter(node) { if (node.type.isError) { result.push({ from: node.from, to: node.to, severity: 'error', message: messages.syntaxError ?? 'Syntax error' }); return false; } } });
    return result;
  });

  async function complete(context: CompletionContext) {
    if (!completionProvider) return null;
    const word = context.matchBefore(/[\w.]*/);
    if (!context.explicit && (!word || word.from === word.to)) return null;
    const line = context.state.doc.lineAt(context.pos);
    const items = await completionProvider({ line: line.number - 1, character: context.pos - line.from, prefix: word?.text ?? '', explicit: context.explicit });
    return { from: word?.from ?? context.pos, options: items.map(item => ({ label: item.label, detail: item.detail, type: item.type, apply: item.insertText ?? item.label })) };
  }

  function offset(position: { line: number; character: number }): number {
    const view = editor?.editor;
    if (!view) return 0;
    const line = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, position.line + 1)));
    return Math.min(line.to, line.from + position.character);
  }

  onMount(() => {
    const model = new JupyterCodeEditor.Model({ mimeType: 'text/x-python' });
    model.sharedModel.setSource(value);
    editor = new CodeMirrorEditor({ host: container, model, languages: pythonLanguages, extensions: [
      python(), syntaxHighlighting(colors), indentUnit.of('    '), autocompletion({ override: [complete] }),
      bracketMatching(), codeFolding(), foldGutter(), lintGutter(), syntaxLinter, EditorView.lineWrapping,
      history(), keymap.of(bindings), readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
      editableCompartment.of(EditorView.editable.of(!readOnly)),
      EditorView.updateListener.of(update => { if (update.docChanged) onchange(update.state.doc.toString()); })
    ] });
    mounted = true;
    onready?.({
      focus: () => editor?.focus(),
      getValue: () => editor?.model.sharedModel.getSource() ?? '',
      setValue(next) { editor?.model.sharedModel.setSource(next); }
    });
    return () => { editor?.dispose(); editor = undefined; };
  });

  $effect(() => {
    if (!mounted || !editor) return;
    if (value !== editor.model.sharedModel.getSource()) editor.model.sharedModel.setSource(value);
  });
  $effect(() => {
    const view = editor?.editor;
    if (mounted && view) view.dispatch({ effects: [readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)), editableCompartment.reconfigure(EditorView.editable.of(!readOnly))] });
  });
  $effect(() => {
    const view = editor?.editor;
    if (!view) return;
    const mapped: Diagnostic[] = diagnostics.map(item => ({ from: offset(item.start), to: offset(item.end), message: item.message, severity: item.severity ?? 'error', source: item.source }));
    view.dispatch(setDiagnostics(view.state, mapped));
  });
  $effect(() => { if (editor && autofocus && !readOnly) editor.focus(); });
</script>

<div class="host" class:compact bind:this={container}></div>

<style>
  .host { width: 100%; }.host :global(.cm-editor) { min-height: 102px; background: #fbfbf8; color: #243029; }
  .host.compact :global(.cm-editor) { min-height: 52px; max-height: 1000px; }.host :global(.cm-editor.cm-focused) { outline: none; }
  .host :global(.cm-scroller) { font-family: ui-monospace, monospace; font-size: 11px; line-height: 1.55; overflow-y: auto; }
  .host :global(.cm-content) { padding: 9px 12px; }.host :global(.cm-gutters) { background: #fbfbf8; color: #b6b8b0; border-right: 1px solid #ecebe5; }
</style>
