export interface CellToolbarActions {
  running?: boolean;
  runnable?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  readOnly?: boolean;
  onrun?: () => void;
  onmoveup?: () => void;
  onmovedown?: () => void;
  onedit?: () => void;
  onduplicate?: () => void;
  oncut?: () => void;
  ondelete?: () => void;
  onclearoutputs?: () => void;
}
