import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';

// Dev-only diagnostic screen (see its `__DEV__`-gated Settings entry point) -- built directly in
// response to a real reported bug ("permission granted but no reminder showed up") where the
// actual cause was impossible to pin down from code alone. Reads straight from expo-notifications'
// own inspection APIs rather than trusting anything this app itself believes it scheduled, so it
// can't lie the way silently-swallowed failures elsewhere in this feature already did once.
interface DebugState {
  permission: Notifications.NotificationPermissionsStatus | null;
  scheduled: Notifications.NotificationRequest[];
  presented: Notifications.Notification[];
}

const EMPTY_STATE: DebugState = { permission: null, scheduled: [], presented: [] };

export const DebugNotificationsScreen: React.FC = () => {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [state, setState] = useState<DebugState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [permission, scheduled, presented] = await Promise.all([
      Notifications.getPermissionsAsync(),
      Notifications.getAllScheduledNotificationsAsync(),
      Notifications.getPresentedNotificationsAsync(),
    ]);
    setState({ permission, scheduled, presented });
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Debug</Text>
        <TouchableOpacity style={styles.headerButton} onPress={refresh} accessibilityRole="button" accessibilityLabel="Refresh">
          <MaterialCommunityIcons name="refresh" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 16 + insets.bottom }]}>
        <Text style={styles.sectionTitle}>Permission</Text>
        <View style={styles.card}>
          <Text style={styles.monoText}>
            {state.permission ? JSON.stringify(state.permission, null, 2) : loading ? 'Loading…' : 'Unknown'}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Scheduled ({state.scheduled.length})</Text>
        {state.scheduled.length === 0 ? (
          <Text style={styles.emptyText}>
            {loading ? 'Loading…' : 'Nothing currently scheduled -- either nothing has a reminder on, or scheduling silently failed (check the Metro log for a "Failed to schedule notifications" warning).'}
          </Text>
        ) : (
          state.scheduled.map(request => (
            <View key={request.identifier} style={styles.card}>
              <Text style={styles.itemTitle}>{request.content.title}</Text>
              {!!request.content.body && <Text style={styles.itemBody}>{request.content.body}</Text>}
              <Text style={styles.monoText}>{request.identifier}</Text>
              <Text style={styles.monoText}>{JSON.stringify(request.trigger, null, 2)}</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>In notification shade ({state.presented.length})</Text>
        {state.presented.length === 0 ? (
          <Text style={styles.emptyText}>
            {loading ? 'Loading…' : 'Nothing currently showing -- if something\'s scheduled above but never lands here once its time passes, that points at the OS itself (permission, channel, or battery optimization) rather than this app\'s own scheduling.'}
          </Text>
        ) : (
          state.presented.map(notification => (
            <View key={notification.request.identifier} style={styles.card}>
              <Text style={styles.itemTitle}>{notification.request.content.title}</Text>
              {!!notification.request.content.body && <Text style={styles.itemBody}>{notification.request.content.body}</Text>}
              <Text style={styles.monoText}>{notification.request.identifier}</Text>
              <Text style={styles.monoText}>{new Date(notification.date).toLocaleString()}</Text>
            </View>
          ))
        )}
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
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 4,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  itemBody: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  // Plain 'monospace' -- resolves correctly on Android (this app's real target platform); iOS
  // just falls back to the system default rather than a true mono face, an acceptable gap for a
  // dev-only debug screen not worth pulling in Platform.select for.
  monoText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: colors.textTertiary,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textTertiary,
    fontStyle: 'italic',
    paddingHorizontal: 4,
  },
});
