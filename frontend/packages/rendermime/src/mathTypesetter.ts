/** Shared MathJax 3 typesetter following JupyterLab's ILatexTypesetter lifecycle. */
export class MathTypesetter {
  private loading: Promise<MathDocumentLike> | null = null;

  async typeset(node: HTMLElement): Promise<void> {
    const mathDocument = await this.ensureDocument();
    mathDocument.options.elements = [node];
    mathDocument.clear().render();
    delete mathDocument.options.elements;
    for (const anchor of node.querySelectorAll<HTMLAnchorElement>('.MathJax a')) {
      anchor.rel = [...new Set(anchor.rel.split(/\s+/).filter(Boolean).concat('noopener'))].join(' ');
      anchor.target = '_blank';
    }
  }

  async renderLatex(node: HTMLElement, source: string): Promise<void> {
    const latex = source.trim();
    node.textContent = hasMathDelimiter(latex) ? latex : `\\[${latex}\\]`;
    await this.typeset(node);
  }

  private ensureDocument(): Promise<MathDocumentLike> {
    if (!this.loading) this.loading = createMathDocument();
    return this.loading;
  }
}

interface MathDocumentLike {
  options: { elements?: HTMLElement[] };
  clear(): MathDocumentLike;
  render(): MathDocumentLike;
}

const hasMathDelimiter = (value: string) =>
  /^\s*(\$\$[\s\S]*\$\$|\$[\s\S]*\$|\\\[[\s\S]*\\\]|\\\([\s\S]*\\\))\s*$/.test(value);

async function createMathDocument(): Promise<MathDocumentLike> {
  const [
    { mathjax }, { CHTML }, { TeX }, { AllPackages }, { SafeHandler },
    { HTMLHandler }, { browserAdaptor }, { AssistiveMmlHandler }
  ] = await Promise.all([
    import('mathjax-full/js/mathjax.js'),
    import('mathjax-full/js/output/chtml.js'),
    import('mathjax-full/js/input/tex.js'),
    import('mathjax-full/js/input/tex/AllPackages.js'),
    import('mathjax-full/js/ui/safe/SafeHandler.js'),
    import('mathjax-full/js/handlers/html/HTMLHandler.js'),
    import('mathjax-full/js/adaptors/browserAdaptor.js'),
    import('mathjax-full/js/a11y/assistive-mml.js')
  ]);
  const adaptor = browserAdaptor();
  mathjax.handlers.register(AssistiveMmlHandler(SafeHandler(new HTMLHandler(adaptor))));
  const output = new CHTML({ fontURL: '/mathjax' });
  const input = new TeX({
    // The TeX `require` extension depends on Node globals and cannot run in a
    // browser bundle. All standard Jupyter/MathJax packages remain available.
    packages: AllPackages,
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    processEscapes: true,
    processEnvironments: true
  });
  const documentModel = mathjax.document(window.document, { InputJax: input, OutputJax: output });
  if (!window.document.querySelector('style[data-lumen-mathjax]')) {
    const stylesheet = output.styleSheet(documentModel) as unknown as HTMLElement;
    adaptor.setAttribute(stylesheet, 'data-lumen-mathjax', 'true');
    adaptor.append(window.document.head, stylesheet);
  }
  return documentModel as unknown as MathDocumentLike;
}

export const mathTypesetter = new MathTypesetter();
