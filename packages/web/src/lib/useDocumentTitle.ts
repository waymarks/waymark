import { useEffect } from 'react';
import { useActions } from '@/api/hooks';

export function usePendingDocumentTitle() {
  const { data: actions = [] } = useActions();
  const pending = actions.filter((a) => a.status === 'pending').length;
  useEffect(() => {
    document.title = pending > 0 ? `Waymark (${pending} pending)` : 'Waymark';
  }, [pending]);
}
