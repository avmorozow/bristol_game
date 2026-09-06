"use client";

import type {ComponentProps} from 'react';
import {Dialog as DialogPrimitive} from 'radix-ui';
import {DialogOverlay,DialogPortal} from '@/components/ui/dialog';

// Center with layout, without combining Tailwind translate utilities and transforms.
// CSS optimization can lower individual translate into transform in production.
export function GameDecisionDialog({children,...props}:ComponentProps<typeof DialogPrimitive.Content>){
 return <DialogPortal>
  <DialogOverlay/>
  <div className="game-decision-positioner">
   <DialogPrimitive.Content data-slot="dialog-content" {...props}>{children}</DialogPrimitive.Content>
  </div>
 </DialogPortal>;
}
