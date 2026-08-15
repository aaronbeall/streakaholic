import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Reanimated, { useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../context/ToastContext';
import { useFireCelebration } from '../hooks/useFireCelebration';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { useTaskStore } from '../stores/taskStore';
import { Task } from '../types';
import { formatFrequencyLabel } from '../utils/formatFrequency';
import { isTaskCompleted } from '../utils/streaks';
import { getTaskStatusInfo } from '../utils/taskStatusSummary';
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

  // Tapping the frequency/streak badges row pops up a plain-English recap of exactly this state --
  // recomputed fresh each time it opens (not memoized against `task` alone) since "today" itself is
  // part of what the summary depends on, same reasoning as every other "asOfDate"-sensitive read
  // elsewhere in this app.
  const [showSummary, setShowSummary] = useState(false);
  const statusInfo = useMemo(() => getTaskStatusInfo(task), [task]);
  const handleOpenSummary = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowSummary(true);
  };

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
          <TouchableOpacity
            style={styles.badgesRow}
            onPress={handleOpenSummary}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Habit status summary"
            accessibilityHint="Shows today's status in plain English"
          >
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
          </TouchableOpacity>
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

      {/* RN's Modal, not a plain absolute-positioned overlay -- TaskHeader isn't mounted at the
          screen root (it's nested inside TaskDetailScreen, sitting above the tab content), so a
          plain absolute View here would only ever cover TaskHeader's own bounds, not the tab
          content below it. Modal renders as a true full-screen layer regardless of where it's
          declared, which is what lets tapping anywhere -- including the Calendar/Stats/Streaks
          content below -- dismiss it. transparent + a manual backdrop (rather than the platform's
          own opaque default) keeps this reading as a lightweight popover, not a full navigation. */}
      <Modal
        transparent
        visible={showSummary}
        animationType="fade"
        onRequestClose={() => setShowSummary(false)}
      >
        <Pressable
          style={styles.summaryBackdrop}
          onPress={() => setShowSummary(false)}
          accessibilityRole="none"
        >
          {/* Swallows the touch so tapping the card itself doesn't fall through to the backdrop's
              own onPress and dismiss it -- the same nested-Pressable pattern already proven
              elsewhere in this app (AchievementCelebration's unlock-history list). */}
          <Pressable style={styles.summaryCard} onPress={() => {}}>
            <View style={styles.summaryHeader}>
              {/* The task's own icon (not a generic "info" glyph) -- ties this popover's title
                  back to the task the same way its icon already identifies it everywhere else in
                  the app (TaskCard, the header's own big icon above). */}
              <View style={[styles.summaryIconBadge, { backgroundColor: task.color }]}>
                <MaterialCommunityIcons name={task.icon} size={16} color="#fff" />
              </View>
              <Text style={styles.summaryTitle} numberOfLines={1}>{task.name}</Text>
              <TouchableOpacity
                onPress={() => setShowSummary(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
              >
                <MaterialCommunityIcons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Schedule / Status / Best remain the three primary data rows. The optional frequency
                explainer is nested inside Schedule as a small tip, so its info icon doesn't claim
                a fourth slot in the left-hand data-icon column. */}
            <View style={[styles.summaryRow, styles.summaryScheduleRow]}>
              <View style={[styles.summaryRowIcon, { backgroundColor: 'rgba(0,0,0,0.06)' }]}>
                <MaterialCommunityIcons name="repeat" size={16} color={colors.textSecondary} />
              </View>
              <View style={styles.summaryScheduleContent}>
                <Text style={[styles.summaryRowText, styles.summaryScheduleText]}>{statusInfo.scheduleSentence}</Text>
                {statusInfo.frequencyExplainer && (
                  <View style={styles.summaryTip}>
                    <MaterialCommunityIcons
                      name="information-outline"
                      size={14}
                      color={colors.textSecondary}
                      style={styles.summaryTipIcon}
                    />
                    <Text style={[styles.summaryRowText, styles.summaryExplainerText]}>{statusInfo.frequencyExplainer}</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={[styles.summaryRowIcon, { backgroundColor: `${statusInfo.status.color}26` }]}>
                <MaterialCommunityIcons name={statusInfo.status.icon} size={16} color={statusInfo.status.color} />
              </View>
              <Text style={styles.summaryRowText}>{statusInfo.status.text}</Text>
            </View>

            {statusInfo.best && (
              <View style={styles.summaryRow}>
                {/* No tinted circle behind this one, unlike the other rows -- a bare trophy reads
                    clearly enough on its own, per explicit user direction. */}
                <MaterialCommunityIcons name={statusInfo.best.icon} size={22} color={statusInfo.best.color} style={styles.summaryBestIcon} />
                <Text style={[styles.summaryRowText, styles.summaryBestText]}>{statusInfo.best.text}</Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
  summaryBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  summaryCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryScheduleRow: {
    alignItems: 'flex-start',
  },
  summaryScheduleContent: {
    flex: 1,
  },
  summaryScheduleText: {
    flex: 0,
  },
  summaryRowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRowText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    color: colors.text,
  },
  // Slightly smaller/quieter than the other rows -- supplementary context (why the schedule works
  // the way it does), not a headline fact like Schedule/Status/Best.
  summaryExplainerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  summaryTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.surfaceSecondary,
  },
  summaryTipIcon: {
    marginTop: 1,
  },
  // A touch bolder than the other rows -- this one's a celebratory acknowledgment, not just a
  // status fact, so it earns slightly more visual weight.
  summaryBestText: {
    fontWeight: '700',
  },
  // Matches summaryRowIcon's own 28px width so the text column still lines up with the rows
  // above/below it, even though this icon has no tinted circle behind it.
  summaryBestIcon: {
    width: 28,
    textAlign: 'center',
  },
});
