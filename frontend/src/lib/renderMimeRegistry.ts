/**
 * Application compatibility entry point. MIME renderer selection lives in the
 * installable @lumen/rendermime package so the web app and SDK share one registry.
 */
export { RenderMimeRegistry, standardRenderMime } from '@lumen/rendermime';
export type { MimeRendererFactory } from '@lumen/rendermime';
