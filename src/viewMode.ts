/**
 * Shared module-level flag that tells App.tsx which screen to render on open.
 * index.js sets this before calling showPluginView() so App.tsx can read it on mount.
 * Both files run in the same JS thread and share this module state.
 */
type ViewMode = 'control' | 'settings';
let _mode: ViewMode = 'control';

export const setViewMode = (m: ViewMode): void => {
  _mode = m;
};

export const getViewMode = (): ViewMode => _mode;
