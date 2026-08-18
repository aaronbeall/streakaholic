import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../context/ToastContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { TipTierOffer, useTipJar } from '../hooks/useTipJar';
import { TipTierId } from '../constants/tipJar';

const ACCENT = '#007AFF';

// One friendly line per tier, picked when that exact tip lands -- specific enough to feel like a
// real reaction (per BRAND.md's "celebrate specifically"), not one generic "thanks!" for every
// amount.
const THANK_YOU_MESSAGES: Record<TipTierId, string> = {
  tip_small: 'Thanks for the coffee! ☕',
  tip_medium: "You're the best! Thank you! 💛",
  tip_large: 'Whoa, thank you so much! 🏆',
};

const TipTierRow: React.FC<{
  offer: TipTierOffer;
  disabled: boolean;
  isPurchasing: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}> = ({ offer, disabled, isPurchasing, onPress, styles, colors }) => (
  <TouchableOpacity
    style={[styles.tierRow, disabled && styles.tierRowDisabled]}
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={`${offer.label}, ${offer.price ?? 'price unavailable'}`}
    accessibilityState={{ disabled, busy: isPurchasing }}
  >
    <View style={styles.tierIcon}>
      <MaterialCommunityIcons name={offer.icon} size={24} color={ACCENT} />
    </View>
    <View style={styles.tierTextGroup}>
      <Text style={styles.tierLabel}>{offer.label}</Text>
      <Text style={styles.tierDescription}>{offer.description}</Text>
    </View>
    {isPurchasing ? (
      <ActivityIndicator size="small" color={ACCENT} />
    ) : offer.price ? (
      <View style={styles.priceBadge}>
        <Text style={styles.priceBadgeText}>{offer.price}</Text>
      </View>
    ) : (
      <ActivityIndicator size="small" color={colors.textTertiary} />
    )}
  </TouchableOpacity>
);

export const TipJarScreen: React.FC = () => {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { showToast } = useToast();

  const handleTipComplete = (tierId: TipTierId) => {
    showToast({ message: THANK_YOU_MESSAGES[tierId] });
  };

  const { offers, connected, productsLoaded, purchasingId, purchase, error, retry } = useTipJar(handleTipComplete);

  // Distinguishes "still connecting/fetching" (a spinner per row, see TipTierRow) from a genuine
  // failure worth its own inline banner + retry -- the row-level spinners alone would otherwise
  // spin forever with no way out if the store connection never comes through.
  const showUnavailableBanner = productsLoaded && (!connected || offers.every(offer => !offer.price));

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tip jar</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <MaterialCommunityIcons name="hand-heart-outline" size={32} color={ACCENT} />
          </View>
          <Text style={styles.introTitle}>Enjoying Streakaholic?</Text>
          <Text style={styles.introBody}>
            Streakaholic is free, with no ads and no subscription — and it always will be. If it’s
            helped you build a streak worth celebrating, a tip is a nice way to say thanks. Totally
            optional, no strings attached.
          </Text>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        )}

        {showUnavailableBanner && !error && (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons name="store-off" size={20} color={colors.textSecondary} />
            <Text style={styles.errorBannerText}>
              Can’t reach the Play Store right now — tips need a real device build installed
              through a Play Store testing track, not a local dev build.
            </Text>
          </View>
        )}

        {(error || showUnavailableBanner) && (
          <TouchableOpacity style={styles.retryButton} onPress={retry} accessibilityRole="button">
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        )}

        <View style={styles.card}>
          {offers.map((offer, index) => (
            <React.Fragment key={offer.id}>
              {index > 0 && <View style={styles.divider} />}
              <TipTierRow
                offer={offer}
                disabled={!connected || purchasingId !== null || !offer.price}
                isPurchasing={purchasingId === offer.id}
                onPress={() => purchase(offer.id)}
                styles={styles}
                colors={colors}
              />
            </React.Fragment>
          ))}
        </View>

        <Text style={styles.footnote}>Every tip goes directly to supporting indie development. Thank you 💛</Text>
      </ScrollView>
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.iconButtonBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  introCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  introIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ACCENT + '1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  introTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  introBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  retryButton: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 12,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: ACCENT,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 68,
  },
  tierRowDisabled: {
    opacity: 0.5,
  },
  tierIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ACCENT + '1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierTextGroup: {
    flex: 1,
  },
  tierLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  tierDescription: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 1,
  },
  priceBadge: {
    backgroundColor: colors.iconButtonBackground,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  priceBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: ACCENT,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 16,
  },
  footnote: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
