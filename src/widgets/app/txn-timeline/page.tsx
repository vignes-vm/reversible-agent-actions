'use client';

import React from 'react';
import { useWidgetSDK } from '@nitrostack/widgets';
import TxnTimeline from '../../../../widgets/txn-timeline/index';
import type { TxnTimelineData } from '../../../../widgets/txn-timeline/normalize';

export const dynamic = 'force-dynamic';

export default function TxnTimelinePage() {
  const { isReady, toolOutput, theme } = useWidgetSDK();
  const data = toolOutput as TxnTimelineData | null;

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      {!isReady || !data ? (
        <div className="p-10 text-center text-[13px] text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-950">
          Loading transaction timeline…
        </div>
      ) : (
        <TxnTimeline data={data} />
      )}
    </div>
  );
}
