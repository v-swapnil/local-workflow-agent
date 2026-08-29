import { useMemo } from 'react';
import { trpc } from '../../trpc';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { buttonVariants } from '../../components/ui/button';
import { ApprovalStatus } from '@shared/types';

interface ApprovalModalProps {
  id: number;
  onDecide: (decision: ApprovalStatus) => void;
}

export function ApprovalModal({ id, onDecide }: ApprovalModalProps) {
  const approval = trpc.approval.get.useQuery({ id });

  const argsPretty = useMemo(() => {
    const args = approval.data?.args;
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  }, [approval.data?.args]);

  if (!approval.data) return null;

  return (
    <AlertDialog open>
      <AlertDialogContent className="w-[400px] max-w-[90vw] border-transparent bg-ink-900 p-0 text-ink-50">
        <AlertDialogHeader className="px-5 py-3">
          <AlertDialogTitle className="mt-1 font-mono font-medium text-ink-50">
            approval required
          </AlertDialogTitle>
          <AlertDialogDescription>Arguments: {argsPretty}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="border-t border-ink-800/60 px-5 py-3">
          <AlertDialogCancel
            className={buttonVariants({ variant: 'danger', size: 'sm' })}
            onClick={() => onDecide('denied')}
          >
            deny
          </AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ size: 'sm' })}
            onClick={() => onDecide('approved')}
          >
            approve
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
