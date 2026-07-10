import { useState } from 'react';

/**
 * 订单详情里的可展开面板互斥可见性。
 *
 * 原实现用 7 个布尔 useState，且每次 toggle 都把其它面板关掉，
 * 本质是「同一时刻至多展开一个面板」，因此收敛成单个 openPanel 枚举。
 */
export type OrderDetailPanel =
  | 'quotes'
  | 'exception'
  | 'evaluation'
  | 'cancellation'
  | 'changeRequest'
  | 'tracking'
  | 'bonus';

export function useOrderDetailPanels() {
  const [openPanel, setOpenPanel] = useState<OrderDetailPanel | null>(null);

  return {
    isPanelOpen: (panel: OrderDetailPanel) => openPanel === panel,
    openPanelOnly: (panel: OrderDetailPanel) => setOpenPanel(panel),
    closeAllPanels: () => setOpenPanel(null),
    togglePanel: (panel: OrderDetailPanel) =>
      setOpenPanel(current => (current === panel ? null : panel)),
  };
}
