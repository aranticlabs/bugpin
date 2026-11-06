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

/** Rejects or resolves to false when saving failed, which keeps the user on the page. */
type SaveHandler = () => Promise<unknown>;

interface UnsavedChangesRegistry {
  register: (id: string, save: SaveHandler) => void;
  unregister: (id: string) => void;
  setDirty: (id: string, dirty: boolean) => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesRegistry | null>(null);

/**
 * Owns the single navigation blocker of the app. React Router supports only one active blocker,
 * so every form registers here through UnsavedChangesGuard instead of blocking on its own.
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const savers = useRef(new Map<string, SaveHandler>());
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(() => new Set());
  const isDirty = dirtyIds.size > 0;

  const registry = useMemo<UnsavedChangesRegistry>(
    () => ({
      register: (id, save) => savers.current.set(id, save),
      unregister: (id) => {
        savers.current.delete(id);
        setDirtyIds((current) => {
          if (!current.has(id)) return current;
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      },
      setDirty: (id, dirty) =>
        setDirtyIds((current) => {
          if (current.has(id) === dirty) return current;
          const next = new Set(current);
          if (dirty) next.add(id);
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
  const saveAll = async () => {
    for (const id of dirtyIds) {
      const save = savers.current.get(id);
      if (save && (await save()) === false) return false;
    }
    return true;
  };

  const proceed = () => {
    if (blocker.state === 'blocked') blocker.proceed();
  };

  return (
    <UnsavedChangesContext.Provider value={registry}>
      {children}
      <UnsavedChangesDialog
        open={blocker.state === 'blocked'}
        description="You changed settings that are not saved yet. Save them before you leave, or discard them."
        onSave={saveAll}
        onSaved={proceed}
        onDiscard={proceed}
        onCancel={() => {
          if (blocker.state === 'blocked') blocker.reset();
        }}
      />
    </UnsavedChangesContext.Provider>
  );
}

interface UnsavedChangesGuardProps {
  isDirty: boolean;
  onSave: SaveHandler;
}

/** Registers a form with the UnsavedChangesProvider. Renders nothing. */
export function UnsavedChangesGuard({ isDirty, onSave }: UnsavedChangesGuardProps) {
  const registry = useContext(UnsavedChangesContext);
  const id = useId();
  const latestSave = useRef(onSave);

  useEffect(() => {
    latestSave.current = onSave;
  });

  useEffect(() => {
    if (!registry) return;
    registry.register(id, () => latestSave.current());
    return () => registry.unregister(id);
  }, [registry, id]);

  useEffect(() => {
    registry?.setDirty(id, isDirty);
  }, [registry, id, isDirty]);

  return null;
}
