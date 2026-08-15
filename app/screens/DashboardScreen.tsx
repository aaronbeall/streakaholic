import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { OnboardingHint } from '../components/OnboardingHint';
import { useOnboardingTarget } from '../hooks/useOnboardingTarget';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';
import { DashboardCalendarView } from './DashboardCalendarView';
import { DashboardStatsView } from './DashboardStatsView';
import { DashboardStreaksView } from './DashboardStreaksView';

export type DashboardTab = 'stats' | 'calendar' | 'streaks';
const ACCENT = '#007AFF';
const TASK_FILTER_HINT_TEXT = 'Tap habits to toggle which ones are included in the dashboard';

const DashboardHeader: React.FC<{
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  selectedTasks: string[];
  onTaskToggle: (taskId: string) => void;
  taskFilterRef: React.RefObject<View | null>;
}> = ({ activeTab, onTabChange, selectedTasks, onTaskToggle, taskFilterRef }) => {
  const tasks = useTaskStore(state => state.tasks);
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const visibleTasks = useMemo(() => tasks.filter(task => !task.archived), [tasks]);

  return (
    <View>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerTop}>
          {/* router.back() (not push('/')) -- pushing Home unconditionally skipped whatever
              screen was actually below Dashboard on the stack (e.g. task-detail opened from here
              would "back" straight past Dashboard to Home) and played a forward slide-in
              animation instead of reversing, since it's a genuine push, not a pop. canGoBack()
              falls back to Home only for the edge case of landing here with no history at all
              (e.g. a fresh deep link). */}
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => (router.canGoBack() ? router.back() : router.push('/'))}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Dashboard</Text>
          {/* Was a plain empty spacer (matching headerButton's own size/shape but no icon) purely
              to balance the back button so the title stays centered in this space-between row --
              now a real nav button to the Trophy Case, still filling that same role. */}
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/trophies')}
            accessibilityRole="button"
            accessibilityLabel="Trophy Case"
            accessibilityHint="Opens your trophy history"
          >
            <MaterialCommunityIcons name="trophy-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.taskFilterContainer} ref={taskFilterRef}>
          {visibleTasks.map((task) => (
            <TouchableOpacity
              key={task.id}
              style={[
                styles.taskFilterButton,
                { backgroundColor: colors.overlay },
                selectedTasks.includes(task.id) && { backgroundColor: task.color },
              ]}
              onPress={() => onTaskToggle(task.id)}
              accessibilityRole="checkbox"
              accessibilityLabel={task.name}
              accessibilityState={{ checked: selectedTasks.includes(task.id) }}
            >
              <MaterialCommunityIcons
                name={task.icon}
                size={16}
                color={selectedTasks.includes(task.id) ? '#fff' : task.color}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'calendar' && styles.activeTab]}
          onPress={() => onTabChange('calendar')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'calendar' }}
        >
          <MaterialCommunityIcons
            name="calendar"
            size={20}
            color={activeTab === 'calendar' ? ACCENT : colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'calendar' && { color: ACCENT }]}>
            Calendar
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'stats' && styles.activeTab]}
          onPress={() => onTabChange('stats')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'stats' }}
        >
          <MaterialCommunityIcons
            name="chart-box-outline"
            size={20}
            color={activeTab === 'stats' ? ACCENT : colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'stats' && { color: ACCENT }]}>
            Stats
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'streaks' && styles.activeTab]}
          onPress={() => onTabChange('streaks')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'streaks' }}
        >
          <MaterialCommunityIcons
            name="fire"
            size={20}
            color={activeTab === 'streaks' ? ACCENT : colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'streaks' && { color: ACCENT }]}>
            Streaks
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// Mirrors TaskDetailScreen's shape: the header (back button, task filter, Stats/Calendar/Streaks
// tabs) renders once; only the content below swaps on local `activeTab` state, cross-faded
// rather than navigated, so flipping tabs doesn't re-transition the header.
export const DashboardScreen: React.FC = () => {
  const allTasks = useTaskStore(state => state.tasks);
  const tasks = useMemo(() => allTasks.filter(task => !task.archived), [allTasks]);
  const { dashboardLastTab, setDashboardLastTab, onboardingHintsSeen, setOnboardingHintSeen } = useSettingsStore(
    useShallow(state => ({
      dashboardLastTab: state.dashboardLastTab,
      setDashboardLastTab: state.setDashboardLastTab,
      onboardingHintsSeen: state.onboardingHintsSeen,
      setOnboardingHintSeen: state.setOnboardingHintSeen,
    }))
  );
  // Dashboard has no deep-linked tab of its own (unlike task-detail's `tab` search param), so it
  // always just restores whichever tab was last viewed.
  const [activeTab, setActiveTab] = useState<DashboardTab>(dashboardLastTab);
  const [selectedTasks, setSelectedTasks] = useState<string[]>(tasks.map(t => t.id));
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const containerRef = useRef<View>(null);
  const taskFilterRef = useRef<View>(null);

  const handleTabChange = (tab: DashboardTab) => {
    setActiveTab(tab);
    setDashboardLastTab(tab);
  };

  // Only worth teaching once there's actually more than one task to filter between.
  const showTaskFilterHint = !onboardingHintsSeen['dashboard-task-filter'] && tasks.length > 1;
  const taskFilterHintLayout = useOnboardingTarget(containerRef, taskFilterRef, showTaskFilterHint);
  const dismissTaskFilterHint = () => setOnboardingHintSeen('dashboard-task-filter', true);

  // The task filter lives here (not inside DashboardStatsView) so it can filter everything on
  // the view, regardless of which tab is active.
  const filteredTasks = useMemo(() => tasks.filter(task => selectedTasks.includes(task.id)), [tasks, selectedTasks]);

  return (
    <View style={styles.container} ref={containerRef}>
      <DashboardHeader
        activeTab={activeTab}
        onTabChange={handleTabChange}
        selectedTasks={selectedTasks}
        taskFilterRef={taskFilterRef}
        onTaskToggle={(taskId) => {
          setSelectedTasks(prev =>
            prev.includes(taskId)
              ? prev.filter(id => id !== taskId)
              : [...prev, taskId]
          );
          // Tapping a filter bubble is the gesture this hint teaches -- dismiss it the same way
          // Home's hints dismiss themselves when the user performs the taught gesture directly.
          dismissTaskFilterHint();
        }}
      />
      <Reanimated.View key={activeTab} entering={FadeIn.duration(150)} style={styles.body}>
        {activeTab === 'stats' ? (
          <DashboardStatsView tasks={filteredTasks} />
        ) : activeTab === 'calendar' ? (
          <DashboardCalendarView tasks={filteredTasks} />
        ) : (
          <DashboardStreaksView tasks={filteredTasks} />
        )}
      </Reanimated.View>

      {showTaskFilterHint && taskFilterHintLayout && (
        <OnboardingHint
          text={TASK_FILTER_HINT_TEXT}
          targetLayout={taskFilterHintLayout}
          onDismiss={dismissTaskFilterHint}
        />
      )}
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
  },
  header: {
    paddingBottom: 12,
    backgroundColor: colors.surface,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
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
  taskFilterContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  taskFilterButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: colors.overlay,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
