import { MaterialCommunityIconName } from '../types';

// Real product SKUs, created as *consumable* in-app products in Play Console (Monetize ->
// Products -> In-app products) -- consumable, not managed, since a tip should be purchasable
// more than once, unlike a one-time unlock. See PUBLISHING.md's "Add a tip jar" section for the
// full Play Console setup and testing guide.
export type TipTierId = 'tip_small' | 'tip_medium' | 'tip_large';

export interface TipTierMeta {
  id: TipTierId;
  icon: MaterialCommunityIconName;
  label: string;
  description: string;
}

// Fixed display order -- the store can return products in any order, so the screen always sorts
// against this list rather than trusting fetch order. Pricing itself is deliberately not listed
// here: always render whatever the store's own localized `displayPrice` returns (Play prices
// this per-region), never a hardcoded dollar figure -- MONETIZATION.md's $0.99/$2.99/$4.99 is a
// rough starting point for Play Console's own product setup, not something this app should ever
// display itself.
export const TIP_TIERS: TipTierMeta[] = [
  { id: 'tip_small', icon: 'coffee-outline', label: 'Buy me a coffee', description: 'A little thank-you' },
  { id: 'tip_medium', icon: 'heart-outline', label: "You're the best!", description: 'A generous tip' },
  { id: 'tip_large', icon: 'trophy-outline', label: 'Streak legend', description: 'Above and beyond' },
];

export const TIP_PRODUCT_IDS: TipTierId[] = TIP_TIERS.map(tier => tier.id);
