import { DisposableDelegate, type IDisposable } from '@lumino/disposable';
import { Signal, type ISignal, type Slot } from '@lumino/signaling';
export interface Trackable { id: string; disposed?: ISignal<unknown, void> }
export class WidgetTracker<T extends Trackable> {
  readonly currentChanged = new Signal<WidgetTracker<T>, T | null>(this);
  readonly widgetAdded = new Signal<WidgetTracker<T>, T>(this);
  private widgets = new Map<string, T>();
  currentWidget: T | null = null;
  constructor(readonly namespace: string) {}
  get size(): number { return this.widgets.size; }
  has(widget: T): boolean { return this.widgets.get(widget.id) === widget; }
  add(widget: T): void { this.widgets.set(widget.id, widget); this.currentWidget = widget; this.widgetAdded.emit(widget); this.currentChanged.emit(widget); }
  remove(widget: T): void { if (!this.has(widget)) return; this.widgets.delete(widget.id); if (this.currentWidget === widget) { this.currentWidget = this.widgets.values().next().value ?? null; this.currentChanged.emit(this.currentWidget); } }
  forEach(fn: (widget: T) => void): void { this.widgets.forEach(fn); }
}
export class ActivityMonitor<TSender, TArgs> implements IDisposable {
  isDisposed = false;
  readonly activityStopped = new Signal<ActivityMonitor<TSender, TArgs>, TArgs>(this);
  private timer?: ReturnType<typeof setTimeout>;
  private last?: TArgs;
  private readonly signal: ISignal<TSender, TArgs>;
  private readonly slot: Slot<TSender, TArgs>;
  constructor(options: { signal: ISignal<TSender, TArgs>; timeout?: number }) { this.signal = options.signal; this.slot = (_sender, args) => { this.last = args; if (this.timer) clearTimeout(this.timer); this.timer = setTimeout(() => { if (this.last !== undefined) this.activityStopped.emit(this.last); }, options.timeout ?? 1000); }; this.signal.connect(this.slot); }
  dispose(): void { if (this.isDisposed) return; this.isDisposed = true; if (this.timer) clearTimeout(this.timer); this.signal.disconnect(this.slot); Signal.clearData(this); }
}
export async function showDialog(options: { title: string; body: string; acceptLabel?: string; cancelLabel?: string }): Promise<boolean> { if (typeof document === 'undefined') return false; const dialog = document.createElement('dialog'); dialog.innerHTML = `<form method="dialog"><h2></h2><p></p><menu><button value="cancel"></button><button value="accept"></button></menu></form>`; dialog.querySelector('h2')!.textContent = options.title; dialog.querySelector('p')!.textContent = options.body; const buttons = dialog.querySelectorAll('button'); buttons[0].textContent = options.cancelLabel ?? 'Cancel'; buttons[1].textContent = options.acceptLabel ?? 'OK'; document.body.append(dialog); dialog.showModal(); return new Promise(resolve => dialog.addEventListener('close', () => { const accepted = dialog.returnValue === 'accept'; dialog.remove(); resolve(accepted); }, { once: true })); }
export const disposableTimeout = (callback: () => void, delay: number): IDisposable => { const timer = setTimeout(callback, delay); return new DisposableDelegate(() => clearTimeout(timer)); };
