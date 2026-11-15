/* Step 5 — shared drag-and-drop list reorder helper (native HTML5 DnD, no deps).
   NOT a hook — safe to call inside loops/maps (plain factory over one shared
   ref). items: array · onReorder(fromIndex, toIndex). */
import { useRef } from 'react';

/* one ref per component: const drag = useDragState();
   then per list: const d = makeDragHandlers(drag, 'listKey', onReorder) */
export function useDragState() {
  const ref = useRef(null);
  return ref;
}

export function makeDragHandlers(dragRef, listKey, onReorder) {
  return {
    onDragStart: (i) => (e) => {
      dragRef.current = { list: listKey, index: i };
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); } catch { /* IE */ }
    },
    onDragOver: (i) => (e) => {
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'move'; } catch { /* noop */ }
    },
    onDrop: (i) => (e) => {
      e.preventDefault();
      const d = dragRef.current;
      dragRef.current = null;
      if (d && d.list === listKey && d.index !== null && d.index !== i) onReorder(d.index, i);
    },
    onDragEnd: () => { dragRef.current = null; },
  };
}

/* STEP 5 — field-type metadata shared by the schema editor + the per-product
   values editor. Adding a NEW type later = add one entry here + one branch in
   SpecValuesEditor's renderer — no backend change needed. */
export const FIELD_TYPES = [
  ['text', 'Text'],
  ['number', 'Number (+ unit)'],
  ['select', 'Dropdown (single)'],
  ['multiselect', 'Multi-select'],
  ['boolean', 'Yes / No'],
  ['textarea', 'Long text'],
];
