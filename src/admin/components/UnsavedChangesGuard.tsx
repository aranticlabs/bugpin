import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useBlocker } from 'react-router-dom';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';
import { FloatingBar } from './FloatingBar';

/** Rejects or resolves to false when saving failed, which keeps the user on the page. */
type SaveHandler = () => Promise<unknown>;

interface GuardEntry {
  save: SaveHandler;
  discard: () => void;
}

interface UnsavedChangesRegistry {
  register: (id: string, entry: GuardEntry) => void;
  unregister: (id: string) => void;
  /** inSaveBar marks forms that the save bar saves and discards. */
  setDirty: (id: string, dirty: boolean, inSaveBar: boolean) => void;
}

interface SaveBarState {
  hasChanges: boolean;
  isSaving: boolean;
  save: () => void;
  discard: () => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesRegistry | null>(null);
const SaveBarContext = createContext<SaveBarState | null>(null);

/**
 * Owns the single navigation blocker of the app. React Router supports only one active blocker,
 * so every form registers here through UnsavedChangesGuard instead of blocking on its own.
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const entries = useRef(new Map<string, GuardEntry>());
  // Every form with changes, mapped to whether the save bar handles it.
  const [dirty, setDirtyMap] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [isSaving, setIsSaving] = useState(false);
  const isDirty = dirty.size > 0;
  const saveBarIds = [...dirty].filter(([, inSaveBar]) => inSaveBar).map(([id]) => id);

  const registry = useMemo<UnsavedChangesRegistry>(
    () => ({
      register: (id, entry) => entries.current.set(id, entry),
      unregister: (id) => {
        entries.current.delete(id);
        setDirtyMap((current) => {
          if (!current.has(id)) return current;
          const next = new Map(current);
          next.delete(id);
          return next;
        });
      },
      setDirty: (id, isFormDirty, inSaveBar) =>
        setDirtyMap((current) => {
          if (!isFormDirty && !current.has(id)) return current;
          if (isFormDirty && current.get(id) === inSaveBar) return current;
          const next = new Map(current);
          if (isFormDirty) next.set(id, inSaveBar);
          else next.delete(id);
          return next;
        }),
    }),
    []
  );

  // Only a change of path leaves the page. Query changes, such as switching tabs, keep the edits.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  // Reloading or closing the browser tab can only show the browser's own confirmation.
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // A failed save stops here, so the remaining forms keep their changes.
  const saveForms = async (ids: string[]) => {
    for (const id of ids) {
      const save = entries.current.get(id)?.save;
      if (save && (await save()) === false) return false;
    }
    return true;
  };

  const saveBar: SaveBarState = {
    hasChanges: saveBarIds.length > 0,
    isSaving,
    save: () => {
      setIsSaving(true);
      saveForms(saveBarIds)
        .catch(() => false)
        .finally(() => setIsSaving(false));
    },
    discard: () => {
      for (const id of saveBarIds) entries.current.get(id)?.discard();
    },
  };

  const proceed = () => {
    if (blocker.state === 'blocked') blocker.proceed();
  };

  return (
    <UnsavedChangesContext.Provider value={registry}>
      <SaveBarContext.Provider value={saveBar}>
        {children}
        <UnsavedChangesDialog
          open={blocker.state === 'blocked'}
          description="You changed settings that are not saved yet. Save them before you leave, or discard them."
          onSave={() => saveForms([...dirty.keys()])}
          onSaved={proceed}
          onDiscard={proceed}
          onCancel={() => {
            if (blocker.state === 'blocked') blocker.reset();
          }}
        />
      </SaveBarContext.Provider>
    </UnsavedChangesContext.Provider>
  );
}

/** Floats over the bottom of the page content while it has unsaved changes. */
export function UnsavedChangesBar() {
  const saveBar = useContext(SaveBarContext);
  if (!saveBar?.hasChanges) return null;
  return (
    <FloatingBar label="Unsaved changes">
      <p className="text-sm font-medium">Unsaved changes</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={saveBar.isSaving} onClick={saveBar.discard}>
          Discard
        </Button>
        <Button size="sm" disabled={saveBar.isSaving} onClick={saveBar.save}>
          {saveBar.isSaving ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Saving...
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </div>
    </FloatingBar>
  );
}

/** Extra room at the end of the page content, so the floating bar never hides the last fields. */
export function UnsavedChangesBarSpacer() {
  const saveBar = useContext(SaveBarContext);
  if (!saveBar?.hasChanges) return null;
  return <div aria-hidden="true" className="h-16 shrink-0" />;
}

interface UnsavedChangesGuardProps {
  isDirty: boolean;
  onSave: SaveHandler;
  /**
   * Restores the saved values. Forms that pass it are saved and discarded by the save bar;
   * forms without it keep their own Save button and are only covered when leaving the page.
   */
  onDiscard?: () => void;
}

/** Registers a form with the UnsavedChangesProvider. Renders nothing. */
export function UnsavedChangesGuard({ isDirty, onSave, onDiscard }: UnsavedChangesGuardProps) {
  const registry = useContext(UnsavedChangesContext);
  const id = useId();
  const latestSave = useRef(onSave);
  const latestDiscard = useRef(onDiscard);
  const inSaveBar = onDiscard !== undefined;

  useEffect(() => {
    latestSave.current = onSave;
    latestDiscard.current = onDiscard;
  });

  useEffect(() => {
    if (!registry) return;
    registry.register(id, {
      save: () => latestSave.current(),
      discard: () => latestDiscard.current?.(),
    });
    return () => registry.unregister(id);
  }, [registry, id]);

  useEffect(() => {
    registry?.setDirty(id, isDirty, inSaveBar);
  }, [registry, id, isDirty, inSaveBar]);

  return null;
}
