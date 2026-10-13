// Re-export unplugin-scriptc so a vite/rollup config can drive the whole
// ch3 -> ELF pipeline from the ch3 package alone:
//   import { scriptcPlugin } from "ch3/scriptc";
// The implementation lives in the unplugin-scriptc package; this shim
// only re-exports its factory and option types.
export * from "unplugin-scriptc";
