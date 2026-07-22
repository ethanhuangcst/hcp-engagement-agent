/** Cursor Canvas 运行时类型桩：仅消 IDE 噪声，不参与产品构建 */
declare module "cursor/canvas" {
  type AnyComp = any;
  export const Stack: AnyComp;
  export const Row: AnyComp;
  export const Text: AnyComp;
  export const H1: AnyComp;
  export const H2: AnyComp;
  export const H3: AnyComp;
  export const Button: AnyComp;
  export const TextArea: AnyComp;
  export const TextInput: AnyComp;
  export const Input: AnyComp;
  export const Code: AnyComp;
  export const Grid: AnyComp;
  export const Divider: AnyComp;
  export const Spacer: AnyComp;
  export const Card: AnyComp;
  export const TagChip: AnyComp;
  export const Link: AnyComp;
  export const Stat: AnyComp;
  export const Table: AnyComp;
  export function useHostTheme(): any;
  export function useCanvasState<T = any>(
    key: string,
    initial: T,
  ): [T, (v: T | ((prev: T) => T)) => void];
}
