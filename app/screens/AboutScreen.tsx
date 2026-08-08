import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';

const CREDITS: { name: string; note: string }[] = [
  { name: 'React Native & Expo', note: 'App framework and tooling' },
  { name: 'Expo Router', note: 'File-based navigation' },
  { name: 'react-native-reanimated', note: 'Animations' },
  { name: 'react-native-svg', note: 'Progress rings and charts' },
  { name: 'react-native-chart-kit', note: 'Dashboard and stats charts' },
  { name: 'react-native-gesture-handler', note: 'Press-and-hold and swipe gestures' },
  { name: 'date-fns', note: 'Date math' },
  { name: 'tinycolor2', note: 'Color picker and particle effects' },
  { name: '@expo/vector-icons', note: 'Material Community Icons' },
  { name: 'Zustand', note: 'App state management' },
];

export const AboutScreen: React.FC = () => {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const appName = Constants.expoConfig?.name ?? 'Streakaholic';
  const version = Constants.expoConfig?.version ?? '';
  const copyrightYear = new Date().getFullYear();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: insets.bottom }}>
        <View style={styles.appCard}>
          <Image source={require('../../assets/images/icon.png')} style={styles.appIcon} />
          <Text style={styles.appName}>{appName}</Text>
          {!!version && <Text style={styles.appVersion}>Version {version}</Text>}
          <Text style={styles.appTagline}>A playful habit &amp; streak tracker</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://metamodernmonkey.com')}
            accessibilityRole="link"
            accessibilityLabel="Visit metamodernmonkey.com"
          >
            <Text style={styles.appMadeByLink}>Made by Metamodern Monkey</Text>
          </TouchableOpacity>
          <Text style={styles.appCopyright}>© {copyrightYear} Metamodern Monkey. All rights reserved.</Text>
        </View>

        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.contactRow}
            onPress={() => Linking.openURL('mailto:support@metamodernmonkey.com')}
            accessibilityRole="link"
            accessibilityLabel="Email support@metamodernmonkey.com"
          >
            <MaterialCommunityIcons name="email-outline" size={22} color={colors.textSecondary} />
            <Text style={styles.contactText}>support@metamodernmonkey.com</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Privacy Policy</Text>
        <View style={styles.card}>
          <Text style={styles.bodyText}>
            {appName} doesn’t collect, transmit, or sell any of your data. Every task, streak, and
            completion is stored only on this device — there’s no account, no sign-in, and no
            server involved. Exporting your data creates a local file that only ever leaves this
            device if you choose to share it yourself.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Terms of Service</Text>
        <View style={styles.card}>
          <Text style={styles.bodyText}>
            {appName} is provided as-is, without warranty of any kind. Since your data lives only
            on this device, you’re responsible for backing it up (Settings → Export Data) —
            reinstalling the app, switching devices, or clearing app data will erase it. The
            developer isn’t liable for any lost data or missed streaks. By using this app, you
            agree to these terms.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Open Source</Text>
        <View style={styles.card}>
          {CREDITS.map((credit, index) => (
            <React.Fragment key={credit.name}>
              {index > 0 && <View style={styles.divider} />}
              <View style={styles.creditRow}>
                <Text style={styles.creditName}>{credit.name}</Text>
                <Text style={styles.creditNote}>{credit.note}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
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
  appCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  appIcon: {
    width: 72,
    height: 72,
    borderRadius: 18,
    marginBottom: 12,
  },
  appName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  appVersion: {
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 2,
  },
  appTagline: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
    textAlign: 'center',
  },
  appMadeByLink: {
    fontSize: 13,
    color: '#007AFF',
    marginTop: 8,
  },
  appCopyright: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  contactText: {
    fontSize: 15,
    color: '#007AFF',
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
    padding: 16,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 16,
  },
  creditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  creditName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  creditNote: {
    flexShrink: 1,
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'right',
  },
});
