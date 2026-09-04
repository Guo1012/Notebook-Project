import type { MimeBundle } from '@lumen/nbformat';

export interface MimeRendererFactory { mimeTypes: string[]; safe: boolean; rank: number }

/** Lightweight equivalent of JupyterLab's RenderMimeRegistry selection layer. */
export class RenderMimeRegistry {
  private factories: MimeRendererFactory[];
  constructor(factories: MimeRendererFactory[] = []) { this.factories = [...factories].sort((a, b) => a.rank - b.rank); }
  addFactory(factory: MimeRendererFactory): void {
    this.factories = this.factories.filter((x) => !x.mimeTypes.some((m) => factory.mimeTypes.includes(m)));
    this.factories.push(factory); this.factories.sort((a, b) => a.rank - b.rank);
  }
  preferredMimeType(bundle: MimeBundle, trusted = false): string | undefined {
    for (const f of this.factories) {
      if (!trusted && !f.safe) continue;
      const match = f.mimeTypes.find((m) => bundle[m] !== undefined);
      if (match) return match;
    }
    return undefined;
  }
}

export const standardRenderMime = new RenderMimeRegistry([
  { mimeTypes: ['application/vnd.lumen.circuit+json'], safe: true, rank: 0 },
  { mimeTypes: ['text/html'], safe: false, rank: 10 },
  { mimeTypes: ['image/svg+xml'], safe: false, rank: 20 },
  { mimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'], safe: true, rank: 30 },
  { mimeTypes: ['application/pdf'], safe: true, rank: 35 },
  { mimeTypes: ['video/mp4', 'video/webm', 'video/ogg'], safe: true, rank: 36 },
  { mimeTypes: ['audio/mpeg', 'audio/ogg', 'audio/wav'], safe: true, rank: 37 },
  { mimeTypes: ['text/markdown'], safe: false, rank: 40 },
  { mimeTypes: ['text/latex'], safe: true, rank: 50 },
  { mimeTypes: ['application/json', 'application/geo+json'], safe: true, rank: 60 },
  { mimeTypes: ['application/vnd.jupyter.widget-view+json', 'application/vnd.jupyter.widget-state+json'], safe: true, rank: 70 },
  { mimeTypes: ['application/vnd.plotly.v1+json', 'application/vnd.vega.v5+json'], safe: true, rank: 72 },
  { mimeTypes: ['text/plain'], safe: true, rank: 100 }
]);
