import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Reanimated, { useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../context/ToastContext';
import { useFireCelebration } from '../hooks/useFireCelebration';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { useTaskStore } from '../stores/taskStore';
import { Task } from '../types';
import { formatFrequencyLabel } from '../utils/formatFrequency';
import { isTaskCompleted } from '../utils/streaks';
import { ParticleSystem } from './ParticleSystem';
import { TaskProgressIcon } from './TaskProgressIcon';

export type TaskDetailTab = 'calendar' | 'stats' | 'streaks';

const ICON_SIZE = 96;
const ICON_FONT_SIZE = ICON_SIZE / 2;

// Same capsule-spawn-area approach as TaskCard.tsx's own streak badge (see ESTIMATED_BADGE_SPAWN_AREA
// there for the full reasoning) -- just re-estimated for this badge's own, noticeably bigger size.
const ESTIMATED_BADGE_HEIGHT = 40;
const ESTIMATED_BADGE_WIDTH = 76;
const ESTIMATED_BADGE_RADIUS = ESTIMATED_BADGE_HEIGHT / 2;
const ESTIMATED_BADGE_SPAWN_AREA = {
  start: { x: ESTIMATED_BADGE_RADIUS, y: ESTIMATED_BADGE_RADIUS },
  end: { x: ESTIMATED_BADGE_WIDTH - ESTIMATED_BADGE_RADIUS, y: ESTIMATED_BADGE_RADIUS },
  radius: ESTIMATED_BADGE_RADIUS,
};

interface TaskHeaderProps {
  task: Task;
  activeTab: TaskDetailTab;
  onTabChange: (tab: TaskDetailTab) => void;
  // Cycling to an adjacent task -- omitted (no buttons rendered) when there's only one task to
  // show, e.g. a single-task list. See TaskDetailScreen for how these are wired (router.setParams
  // on the same screen instance, not a new navigation, so the modal doesn't stack).
  onPrevTask?: () => void;
  onNextTask?: () => void;
}

// Calendar/Stats switch local state on the already-open detail screen (see TaskDetailScreen) --
// no navigation, so no full-screen re-transition just to flip a tab. Back and Edit are genuine
// navigations and still go through the router.
export const TaskHeader: React.FC<TaskHeaderProps> = ({ task, activeTab, onTabChange, onPrevTask, onNextTask }) => {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { showToast } = useToast();
  const completeTask = useTaskStore(state => state.completeTask);
  const undoCompleteTask = useTaskStore(state => state.undoCompleteTask);

  const isCalendarScreen = activeTab === 'calendar';
  const isStatsScreen = activeTab === 'stats';
  const isStreaksScreen = activeTab === 'streaks';
  const frequencyLabel = formatFrequencyLabel(task);

  const { streakBadgeStyle, badgeAnimatedStyle, showParticles, celebrationKey, handleParticlesComplete } = useFireCelebration(task);

  // Same press-and-hold-to-complete interaction as TaskCard's own task face (TaskProgressIcon
  // renders identically here), reimplemented at this screen's own level rather than reusing
  // TaskCard/CardTask directly -- this is a single large icon in a header, not a flippable card.
  const progress = useSharedValue(0);
  const [isPressed, setIsPressed] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const completed = isTaskCompleted(task);

  // Guards against stale press/completion state carrying over when `task` itself changes out
  // from under this component -- e.g. cycling to the next task via onNextTask/onPrevTask while
  // mid-press, or (in principle) an external completion elsewhere updating this same task.
  useEffect(() => {
    setIsCompleting(false);
  }, [task]);

  const handlePressIn = () => {
    if (completed) return;
    progress.value = withTiming(0.99999, { duration: 500 });
    setIsPressed(true);
  };

  const handlePressOut = () => {
    progress.value = withTiming(0, { duration: 200 });
    setIsPressed(false);
  };

  const handleLongPress = () => {
    if (completed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsCompleting(true);
  };

  // Fired by TaskProgressIcon once its fixed hold-duration timeout elapses -- mirrors
  // HomeScreen's own handleLongPressTask exactly (success haptic, commit the completion, toast
  // with Undo), since this is the same real completion action, just triggered from this screen.
  const handleCompleted = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    completeTask(task.id);
    showToast({
      message: `"${task.name}" completed`,
      action: { label: 'Undo', onPress: () => undoCompleteTask(task.id) },
    });
  }, [completeTask, undoCompleteTask, showToast, task.id, task.name]);

  return (
    <View>
      <View style={[styles.header, { backgroundColor: task.color, paddingTop: insets.top + 8 }]}>
        {/* Slim nav row -- Back / task name / Edit -- matching the same headerTop pattern
            Dashboard/Settings/Archived Tasks already use, rather than flanking the whole
            icon+badges stack below with these buttons: that older layout left Back/Edit floating
            at whatever height the icon+badges block happened to be tall (varying per task,
            depending on whether the streak badge or prev/next chevrons render), instead of
            pinned to the title the way a header button normally is. */}
        <View style={styles.headerTop}>
          {/* router.back() (not push('/')) -- pushing Home unconditionally skipped whatever screen
              actually opened this one (e.g. Dashboard's per-task month cards) and played a forward
              slide-in animation instead of reversing, since it's a genuine push, not a pop.
              canGoBack() falls back to Home only for the edge case of landing here with no history
              at all (e.g. a fresh deep link). */}
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => (router.canGoBack() ? router.back() : router.push('/'))}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color="rgba(255, 255, 255, 0.8)" />
          </TouchableOpacity>

          <Text style={styles.headerTitle} numberOfLines={1}>{task.name}</Text>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push({
              pathname: '/add-task',
              params: { taskId: task.id }
            })}
            accessibilityRole="button"
            accessibilityLabel="Edit habit"
          >
            <MaterialCommunityIcons name="pencil" size={24} color="rgba(255, 255, 255, 0.8)" />
          </TouchableOpacity>
        </View>

        <View style={styles.iconSection}>
          <View style={styles.iconRow}>
            {onPrevTask && (
              <TouchableOpacity
                style={styles.cycleButton}
                onPress={onPrevTask}
                accessibilityRole="button"
                accessibilityLabel="Previous habit"
              >
                <MaterialCommunityIcons name="chevron-left" size={28} color="rgba(255, 255, 255, 0.8)" />
              </TouchableOpacity>
            )}
            <Pressable
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onLongPress={handleLongPress}
              delayLongPress={500}
              accessibilityRole="button"
              accessibilityLabel={completed ? `${task.name}, completed` : `${task.name}, not yet completed`}
              accessibilityHint={completed ? undefined : 'Press and hold to mark complete'}
            >
              {/* TaskProgressIcon draws its ring/fill in `color` and whatever sits on top of a
                  solid `color` fill (the completed-state icon glyph, the checkmark) in `onColor`
                  -- normally task.color/white (TaskCard's own look), which would disappear here
                  since this header's own background already *is* task.color. Rather than adding a
                  backdrop behind the icon (tried, didn't like the look), this inverts which color
                  plays which role: white for the ring/fill, task.color for whatever sits on top of
                  it -- so it reads correctly directly against the header's own task.color
                  background, no backdrop needed at all. */}
              <TaskProgressIcon
                task={task}
                iconSize={ICON_SIZE}
                iconFontSize={ICON_FONT_SIZE}
                progress={progress}
                isPressed={isPressed}
                isCompleting={isCompleting}
                onCompleted={handleCompleted}
                color="#fff"
                onColor={task.color}
              />
            </Pressable>
            {onNextTask && (
              <TouchableOpacity
                style={styles.cycleButton}
                onPress={onNextTask}
                accessibilityRole="button"
                accessibilityLabel="Next habit"
              >
                <MaterialCommunityIcons name="chevron-right" size={28} color="rgba(255, 255, 255, 0.8)" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.badgesRow}>
            <View style={styles.frequencyBadge}>
              <MaterialCommunityIcons name="repeat" size={13} color="rgba(255, 255, 255, 0.85)" />
              <Text style={styles.frequencyText} accessibilityLabel={`Repeats ${frequencyLabel}`}>
                {frequencyLabel}
              </Text>
            </View>
            {streakBadgeStyle && (
              <Reanimated.View style={[styles.streakBadgeWrap, badgeAnimatedStyle]}>
                <View style={[styles.streakBadge, { backgroundColor: streakBadgeStyle.color }]}>
                  <MaterialCommunityIcons name={streakBadgeStyle.icon} size={22} color="#fff" />
                  <Text style={styles.streakText}>{streakBadgeStyle.value}</Text>
                </View>
                {streakBadgeStyle.showTrophy && (
                  <MaterialCommunityIcons name="trophy" size={26} color="#FFD700" style={styles.trophyIcon} />
                )}
                {showParticles && (
                  <ParticleSystem
                    key={celebrationKey}
                    onComplete={handleParticlesComplete}
                    spawnArea={ESTIMATED_BADGE_SPAWN_AREA}
                  />
                )}
              </Reanimated.View>
            )}
          </View>
        </View>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, isCalendarScreen && styles.activeTab]}
          onPress={() => onTabChange('calendar')}
          accessibilityRole="tab"
          accessibilityState={{ selected: isCalendarScreen }}
        >
          <MaterialCommunityIcons
            name="calendar"
            size={20}
            color={isCalendarScreen ? task.color : colors.textSecondary}
          />
          <Text style={[styles.tabText, isCalendarScreen && { color: task.color }]}>
            Calendar
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, isStatsScreen && styles.activeTab]}
          onPress={() => onTabChange('stats')}
          accessibilityRole="tab"
          accessibilityState={{ selected: isStatsScreen }}
        >
          <MaterialCommunityIcons
            name="chart-bar"
            size={20}
            color={isStatsScreen ? task.color : colors.textSecondary}
          />
          <Text style={[styles.tabText, isStatsScreen && { color: task.color }]}>
            Stats
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, isStreaksScreen && styles.activeTab]}
          onPress={() => onTabChange('streaks')}
          accessibilityRole="tab"
          accessibilityState={{ selected: isStreaksScreen }}
        >
          <MaterialCommunityIcons
            name="fire"
            size={20}
            color={isStreaksScreen ? task.color : colors.textSecondary}
          />
          <Text style={[styles.tabText, isStreaksScreen && { color: task.color }]}>
            Streaks
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 16,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  iconSection: {
    alignItems: 'center',
    gap: 16,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cycleButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Deliberately smaller/quieter than streakBadge below -- this is supporting context (what the
  // schedule is), not the headline number (how the streak is doing right now).
  frequencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  frequencyText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  // Bigger and bolder than before (2026-08-10, per explicit user direction to improve the visual
  // emphasis of streak status), and now colored with the task's actual streak-status color
  // (getStreakBadgeStyle -- red/orange/gray, the same mapping TaskCard's own front-face badge
  // uses) instead of a flat translucent-white pill regardless of status.
  streakBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  streakText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  trophyIcon: {
    marginTop: 2,
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
