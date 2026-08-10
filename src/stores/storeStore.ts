import { create } from 'zustand';
import { useAppStore } from './appStore';
import { SHOP_ITEMS } from '../shared/lib/storeCatalog';
import {
  applyEquip,
  applyPurchase,
  Inventory,
  InventoryEntry,
} from '../shared/lib/storeEngine';

/**
 * Inventário da Loja: itens comprados e o item equipado.
 * A compra deduz XP do gamification (useAppStore) e persiste tudo
 * em localStorage para o FocusCompanion ler o acessório equipado.
 */

const STORAGE_KEY = 'mm_inventory';

type InventoryMap = Record<string, InventoryEntry>;

function loadInventory(): InventoryMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch { /* ignora */ }
  return {};
}

function persist(inventory: Inventory) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
}

interface StoreState {
  inventory: Inventory;
  /** Tenta a compra: saldo suficiente -> deduz XP + registra a compra. Retorna true no sucesso. */
  buyItem: (itemId: string) => boolean;
  /** Equipa um item (desativa os demais). */
  equipItem: (itemId: string) => void;
}

export const useStoreStore = create<StoreState>((set, get) => ({
  inventory: loadInventory(),

  buyItem: (itemId) => {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return false;
    const { gamification, updateGamification, addLog } = useAppStore.getState();

    const result = applyPurchase(get().inventory, itemId, gamification.xp);
    if (!result) return false;

    updateGamification({ xp: gamification.xp - result.cost });
    persist(result.inventory);
    set({ inventory: result.inventory });

    addLog({
      timestamp: Date.now(),
      type: 'atividade',
      description: `Comprou ${item.name} na Loja do Sagui (-${result.cost} XP)`,
      xp: -result.cost,
    });
    return true;
  },

  equipItem: (itemId) => {
    const inventory = applyEquip(get().inventory, itemId);
    if (inventory !== get().inventory && inventory !== undefined) {
      persist(inventory);
      set({ inventory });
    }
  },
}));