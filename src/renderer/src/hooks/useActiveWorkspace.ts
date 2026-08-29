import { useEffect } from 'react';
import { trpc } from '../trpc';

/**
 * Returns the active workspace id (or null). Auto-selects the first workspace
 * if none is active and at least one exists.
 */
export function useActiveWorkspace(): {
  workspaceId: number | null;
  isLoading: boolean;
  setActive: (id: number) => Promise<void>;
} {
  const utils = trpc.useUtils();
  const list = trpc.workspace.list.useQuery();
  const active = trpc.workspace.active.useQuery();
  const setActive = trpc.workspace.setActive.useMutation({
    onSuccess: () => utils.workspace.active.invalidate(),
  });

  useEffect(() => {
    if (active.data === null && list.data && list.data.length > 0) {
      setActive.mutate({ id: list.data[0]!.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.data, list.data?.length]);

  return {
    workspaceId: active.data ?? null,
    isLoading: active.isLoading || list.isLoading,
    setActive: async (id: number) => {
      await setActive.mutateAsync({ id });
    },
  };
}
