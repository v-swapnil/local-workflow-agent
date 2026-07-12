import { useMemo } from 'react';
import type { ApprovalReq } from './types';
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

interface ApprovalModalProps {
  req: ApprovalReq;
  onDecide: (d: 'approve' | 'approve_session' | 'deny') => void;
}

export function ApprovalModal({ req, onDecide }: ApprovalModalProps) {
  const argsPretty = useMemo(() => {
    try {
      return JSON.stringify(req.args, null, 2);
    } catch {
      return String(req.args);
    }
  }, [req.args]);

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
            onClick={() => onDecide('deny')}
          >
            deny
          </AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ size: 'sm' })}
            onClick={() => onDecide('approve')}
          >
            approve
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
