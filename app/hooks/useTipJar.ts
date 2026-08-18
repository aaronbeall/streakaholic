import { useCallback, useEffect, useState } from 'react';
import { ErrorCode, useIAP } from 'expo-iap';
import { TIP_PRODUCT_IDS, TIP_TIERS, TipTierId, TipTierMeta } from '../constants/tipJar';
import { useAchievementsStore } from '../stores/achievementsStore';

export interface TipTierOffer extends TipTierMeta {
  // The store's own localized price string (e.g. "$0.99") -- null until fetchProducts resolves,
  // never a hardcoded figure, since Play prices this per-region. See TIP_TIERS' own comment.
  price: string | null;
}

interface UseTipJarResult {
  // Always all three tiers, in TIP_TIERS' fixed order, regardless of what order (or whether)
  // the store has actually returned pricing for them yet.
  offers: TipTierOffer[];
  connected: boolean;
  // True once a fetchProducts call has settled (success or failure) -- lets the screen tell
  // "still loading" apart from "connected, but genuinely got zero products back" (e.g. a Play
  // Console SKU typo/mismatch), which would otherwise both just look like an empty list.
  productsLoaded: boolean;
  // The tier currently mid-purchase, if any -- lets the screen disable/spin just that one row
  // instead of the whole list.
  purchasingId: TipTierId | null;
  purchase: (id: TipTierId) => void;
  error: string | null;
  retry: () => void;
}

// Wraps expo-iap's own `useIAP` hook with this app's specific tip-jar logic (fixed tier order +
// localized pricing, purchasing state, consuming every purchase immediately since these are
// consumables, and a best-effort recovery pass for a purchase that never got finished -- e.g. the
// app was killed mid-purchase, before Google's 3-day auto-refund window on an unconsumed
// purchase). No backend/receipt validation: per PUBLISHING.md's own "Add a tip jar" guide, that's
// a deliberate simplification appropriate for a $1-5 tip specifically, not a general pattern for
// anything gating real paid features later (see COMMITMENT_MODE.md for why Streak Saves need
// more).
export const useTipJar = (onTipComplete: (tierId: TipTierId) => void): UseTipJarResult => {
  const [purchasingId, setPurchasingId] = useState<TipTierId | null>(null);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    connected,
    products,
    fetchProducts,
    requestPurchase,
    finishTransaction,
    getAvailablePurchases,
    availablePurchases,
    reconnect,
  } = useIAP({
    onPurchaseSuccess: async purchase => {
      try {
        await finishTransaction({ purchase, isConsumable: true });
      } catch {
        // The tip already went through on the store's side regardless of whether finishing it
        // here succeeds -- a failure to consume just means the orphaned-purchase recovery pass
        // below (or Google's own eventual auto-refund) is the fallback, not that the user's
        // payment failed. Not worth surfacing as an error.
      } finally {
        setPurchasingId(null);
      }
      if (TIP_PRODUCT_IDS.includes(purchase.productId as TipTierId)) {
        const tierId = purchase.productId as TipTierId;
        useAchievementsStore.getState().recordTipAchievements(tierId);
        onTipComplete(tierId);
      }
    },
    onPurchaseError: purchaseError => {
      setPurchasingId(null);
      // A user backing out of the purchase sheet isn't an error worth interrupting them over --
      // every other failure (network, billing unavailable, etc.) is.
      if (purchaseError.code !== ErrorCode.UserCancelled) {
        setError(purchaseError.message);
      }
    },
    onError: err => {
      setPurchasingId(null);
      setError(err.message);
    },
  });

  const loadProducts = useCallback(() => {
    setError(null);
    fetchProducts({ skus: TIP_PRODUCT_IDS, type: 'in-app' })
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setProductsLoaded(true));
  }, [fetchProducts]);

  useEffect(() => {
    if (!connected) return;
    loadProducts();
    // Best-effort: pick up any purchase still sitting unconsumed from a prior, interrupted
    // session for our own SKUs. Silently ignored on failure -- this is a background recovery
    // pass, not something the user is actively waiting on.
    getAvailablePurchases().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => {
    const orphaned = availablePurchases.filter(purchase =>
      purchase.purchaseState === 'purchased' && TIP_PRODUCT_IDS.includes(purchase.productId as TipTierId)
    );
    orphaned.forEach(purchase => {
      finishTransaction({ purchase, isConsumable: true }).catch(() => {});
      // Still recognized even though the live success toast/callback never fired for this one --
      // the purchase genuinely happened, it just got interrupted before finishing. The Supporter
      // trophy (a much bigger, more visible moment than a toast) is worth surfacing on its own the
      // next time this screen loads; recordTipAchievements is itself dedup-safe if this somehow
      // races with the live onPurchaseSuccess path above for the same purchase.
      useAchievementsStore.getState().recordTipAchievements(purchase.productId as TipTierId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availablePurchases]);

  const purchase = useCallback((id: TipTierId) => {
    setError(null);
    setPurchasingId(id);
    requestPurchase({
      request: { google: { skus: [id] } },
      type: 'in-app',
    }).catch(() => {
      // onPurchaseError above already handles user-visible feedback for a real failure; this
      // catch only exists so a rejected promise doesn't also surface as an unhandled-rejection
      // warning on native.
    });
  }, [requestPurchase]);

  const retry = useCallback(() => {
    if (!connected) {
      reconnect().then(ok => {
        if (ok) loadProducts();
      });
      return;
    }
    loadProducts();
  }, [connected, reconnect, loadProducts]);

  const offers: TipTierOffer[] = TIP_TIERS.map(tier => ({
    ...tier,
    price: products.find(product => product.id === tier.id)?.displayPrice ?? null,
  }));

  return { offers, connected, productsLoaded, purchasingId, purchase, error, retry };
};
