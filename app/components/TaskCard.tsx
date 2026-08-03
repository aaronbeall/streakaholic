import { MaterialCommunityIcons } from '@expo/vector-icons';
import { addDays, format, getDay, getDaysInMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSettings } from '../context/SettingsContext';
import { useTaskContext } from '../context/TaskContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { Task } from '../types';
import { ParticleSystem } from './ParticleSystem';

const AnimatedPath = Reanimated.createAnimatedComponent(Path);

interface TaskCardProps {
  task: Task;
  size: number;
  onLongPressCalendar?: () => void;
  onLongPressStats?: () => void;
  onLongPressTask?: () => void;
}

type CardSide = 'task' | 'calendar' | 'stats';

interface CardTaskProps {
  task: Task;
  size: number;
  progress: Reanimated.SharedValue<number>;
  isCompleting: boolean;
  onCompleted: () => void;
}

const CardTask = React.memo(({ task, size, progress, isCompleting, onCompleted }: CardTaskProps) => {
  const { isTaskCompleted, getCompletionCount } = useTaskContext();
  const { showTaskName, showTaskCounter, showCardBackground } = useSettings();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const checkmarkOpacity = useSharedValue(0);
  const iconOpacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const badgeScale = useSharedValue(1);
  const [showParticles, setShowParticles] = useState(false);

  // Scale the icon with the actual card size instead of a fixed 128px -- on a small grid
  // (3+ columns, narrow phones) a fixed-size icon left no room for the name/counter text
  // below it, silently squeezing them to zero height. Without a card background there's no
  // visual boundary to respect, so let the graphic claim even more of the tile.
  const iconSize = showCardBackground
    ? Math.max(48, Math.min(size * 0.68, 148))
    : Math.max(48, Math.min(size * 0.8, 176));
  const iconFontSize = iconSize / 2;
  const iconMarginBottom = Math.max(2, Math.min(size * 0.03, 8));

  const getStreakBadgeStyle = () => {
    const currentStreak = task.stats?.currentStreak || 0;
    const lastStreak = task.stats?.lastStreak || 0;
    const bestStreak = task.stats?.bestStreak || 0;
    const streakStatus = task.stats?.streakStatus;
    
    if (!streakStatus || streakStatus === 'never_started') {
      return null;
    }

    if (currentStreak > 0) {
      if (streakStatus === 'up_to_date') {
        return {
          backgroundColor: '#FF6B6B',
          icon: 'fire' as const,
          value: currentStreak,
          showTrophy: currentStreak === bestStreak
        };
      }
      return {
        backgroundColor: '#FFA726',
        icon: 'clock-outline' as const,
        value: currentStreak,
        showTrophy: currentStreak === bestStreak
      };
    }

    if (lastStreak > 0) {
      return {
        backgroundColor: '#90A4AE',
        icon: 'sleep' as const,
        value: lastStreak,
        showTrophy: false
      };
    }

    return null;
  };

  const streakBadgeStyle = getStreakBadgeStyle();

  const CIRCLE_STROKE_WIDTH = 8;
  const CIRCLE_RADIUS = 60;
  const CIRCLE_CENTER = 64;
  const INNER_CIRCLE_RADIUS = CIRCLE_RADIUS - CIRCLE_STROKE_WIDTH;

  const animatedProps = useAnimatedProps(() => {
    const angle = progress.value * 360;
    const radians = (angle - 90) * (Math.PI / 180);
    const x = CIRCLE_CENTER + INNER_CIRCLE_RADIUS * Math.cos(radians);
    const y = CIRCLE_CENTER + INNER_CIRCLE_RADIUS * Math.sin(radians);
    
    // Create the path for the pie slice
    const largeArcFlag = angle > 180 ? 1 : 0;
    const path = [
      `M ${CIRCLE_CENTER} ${CIRCLE_CENTER}`,
      `L ${CIRCLE_CENTER} ${CIRCLE_CENTER - INNER_CIRCLE_RADIUS}`,
      `A ${INNER_CIRCLE_RADIUS} ${INNER_CIRCLE_RADIUS} 0 ${largeArcFlag} 1 ${x} ${y}`,
      'Z'
    ].join(' ');

    return {
      d: path
    };
  });

  const timesPerDayCount = task.timesPerDay || 1;
  const completionCount = getCompletionCount(task);
  const dayProgressFraction = Math.min(completionCount / timesPerDayCount, 1);

  // Static (non-animated) pie slice showing how many of today's timesPerDay reps are
  // logged so far -- separate from `animatedProps` above, which is the transient
  // press-and-hold confirmation ring.
  const dayProgressPath = useMemo(() => {
    if (timesPerDayCount <= 1 || dayProgressFraction <= 0) return null;
    const angle = dayProgressFraction * 360;
    const radians = (angle - 90) * (Math.PI / 180);
    const x = CIRCLE_CENTER + INNER_CIRCLE_RADIUS * Math.cos(radians);
    const y = CIRCLE_CENTER + INNER_CIRCLE_RADIUS * Math.sin(radians);
    const largeArcFlag = angle > 180 ? 1 : 0;
    return [
      `M ${CIRCLE_CENTER} ${CIRCLE_CENTER}`,
      `L ${CIRCLE_CENTER} ${CIRCLE_CENTER - INNER_CIRCLE_RADIUS}`,
      `A ${INNER_CIRCLE_RADIUS} ${INNER_CIRCLE_RADIUS} 0 ${largeArcFlag} 1 ${x} ${y}`,
      'Z'
    ].join(' ');
  }, [dayProgressFraction, timesPerDayCount, CIRCLE_CENTER, INNER_CIRCLE_RADIUS]);

  const checkmarkStyle = useAnimatedStyle(() => ({
    opacity: checkmarkOpacity.value,
    transform: [{ scale: checkmarkOpacity.value }]
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value * (1 - progress.value)
  }));

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const completed = isTaskCompleted(task) || isCompleting;

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }]
  }));

  useEffect(() => {
    if (streakBadgeStyle?.icon === 'fire') {
      badgeScale.value = withSequence(
        withSpring(1.2, { damping: 8, stiffness: 100 }),
        withSpring(1, { damping: 8, stiffness: 100 })
      );
      setShowParticles(true);
    }
  }, [task.stats?.currentStreak, streakBadgeStyle?.icon]);

  useEffect(() => {
    if (isCompleting) {
      // Pop animation
      scale.value = withSequence(
        withSpring(1.1, { damping: 8, stiffness: 100 }),
        withSpring(1, { damping: 8, stiffness: 100 })
      );
      
      // Fade out icon and show checkmark
      iconOpacity.value = withTiming(0, { duration: 200 });
      checkmarkOpacity.value = withTiming(1, { duration: 200 });

      // After delay, fade out checkmark and show icon
      setTimeout(() => {
        checkmarkOpacity.value = withTiming(0, { duration: 200 });
        iconOpacity.value = withTiming(1, { duration: 200 });
      }, 500);
      setTimeout(() => onCompleted(), 800);
    }
  }, [isCompleting]);

  return (
    <View style={styles.contentContainer}>
      <Reanimated.View style={[styles.iconContainer, { width: iconSize, height: iconSize, borderRadius: iconSize / 2, marginBottom: iconMarginBottom, backgroundColor: 'transparent' }, containerStyle]}>
        <Svg width={iconSize} height={iconSize} viewBox="0 0 128 128">
          {/* Outer circle (border) */}
          <Circle
            cx={CIRCLE_CENTER}
            cy={CIRCLE_CENTER}
            r={CIRCLE_RADIUS}
            stroke={task.color}
            strokeWidth={CIRCLE_STROKE_WIDTH}
            fill={completed ? task.color : 'none'}
          />
          {/* Today's times-per-day progress, when this task requires more than one rep a day */}
          {!completed && dayProgressPath && (
            <Path fill={task.color} opacity={0.35} d={dayProgressPath} />
          )}
          {/* Inner circle (progress) */}
          {!completed && (
            <AnimatedPath
              fill={task.color}
              animatedProps={animatedProps}
            />
          )}
        </Svg>
        <Reanimated.View style={[StyleSheet.absoluteFill, iconStyle]}>
          <MaterialCommunityIcons
            name={task.icon}
            size={iconFontSize}
            color={completed ? '#fff' : task.color}
            style={{
              textAlign: 'center',
              textAlignVertical: 'center',
              lineHeight: iconSize
            }}
          />
        </Reanimated.View>
        <Reanimated.View style={[StyleSheet.absoluteFill, checkmarkStyle, { justifyContent: 'center', alignItems: 'center' }]}>
          <MaterialCommunityIcons
            name="check"
            size={iconFontSize}
            color="#fff"
            style={{
              textAlign: 'center',
              textAlignVertical: 'center',
              lineHeight: iconSize
            }}
          />
        </Reanimated.View>
      </Reanimated.View>
      {(showTaskName || (timesPerDayCount > 1 && showTaskCounter)) && (
        <View style={styles.titleRow}>
          {showTaskName && (
            <Text style={styles.taskName} numberOfLines={1}>{task.name}</Text>
          )}
          {timesPerDayCount > 1 && showTaskCounter && (
            <Text style={[styles.progressCountText, { color: task.color }]}>
              {completionCount}/{timesPerDayCount}
            </Text>
          )}
        </View>
      )}
      {streakBadgeStyle && (
        <Reanimated.View style={[styles.streakBadge, badgeStyle]}>
          <View style={[styles.streakBubble, { backgroundColor: streakBadgeStyle.backgroundColor }]}>
            <MaterialCommunityIcons name={streakBadgeStyle.icon} size={14} color="#fff" />
            <Text style={styles.streakText}>{streakBadgeStyle.value}</Text>
          </View>
          {streakBadgeStyle.showTrophy && (
            <MaterialCommunityIcons 
              name="trophy" 
              size={20} 
              color="#FFD700" 
              style={styles.trophyIcon} 
            />
          )}
          {showParticles && (
            <ParticleSystem 
              onComplete={() => setShowParticles(false)}
            />
          )}
        </Reanimated.View>
      )}
    </View>
  );
});

CardTask.displayName = 'CardTask';

const CardCalendar = React.memo(({ task }: { task: Task }) => {
  const { isTaskCompleted } = useTaskContext();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const today = format(new Date(), 'yyyy-MM-dd');
  const currentMonth = new Date();
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDayOfMonth = startOfMonth(currentMonth);
  const startingDayOfWeek = getDay(firstDayOfMonth);

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i + 1);
    const dateString = format(date, 'yyyy-MM-dd');
    const isCompleted = isTaskCompleted(task, date);
    const isToday = dateString === today;
    const isPast = dateString < today;
    const isMissed = isPast && !isCompleted;
    return {
      date,
      isCompleted,
      isToday,
      isMissed,
      dayNumber: i + 1
    };
  });

  // Pad the tail to a full multiple of 7 too, matching the leading padding -- otherwise
  // an incomplete final week renders with fewer than 7 cells, and since each cell is
  // flex:1, the FlatList stretches those few cells across the whole row width instead of
  // leaving them in their correct weekday columns.
  const totalCells = Math.ceil((startingDayOfWeek + days.length) / 7) * 7;
  const trailingBlanks = totalCells - startingDayOfWeek - days.length;

  return (
    <View style={styles.calendarContainer}>
      <View style={styles.calendarGrid}>
        <View style={styles.calendarDayNames}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
            <Text key={index} style={styles.calendarDayName}>{day}</Text>
          ))}
        </View>
        <FlatList
          data={[
            ...Array(startingDayOfWeek).fill(null),
            ...days,
            ...Array(trailingBlanks).fill(null)
          ]}
          renderItem={({ item: day, index }) => (
            <View style={styles.calendarDay}>
              {day ? (
                <View style={styles.calendarDayInner}>
                  {day.isCompleted ? (
                    <View style={[styles.calendarDot, { backgroundColor: task.color }]} />
                  ) : day.isToday ? (
                    <View style={[styles.calendarDot, { borderWidth: 2, borderColor: task.color, backgroundColor: 'transparent' }]} />
                  ) : day.isMissed ? (
                    <MaterialCommunityIcons name="close" size={20} color={colors.textTertiary} />
                  ) : (
                    <View style={[styles.calendarDot, styles.calendarDotFuture]} />
                  )}
                </View>
              ) : null}
            </View>
          )}
          numColumns={7}
          scrollEnabled={false}
          keyExtractor={(_, index) => index.toString()}
        />
      </View>
    </View>
  );
});

CardCalendar.displayName = 'CardCalendar';

const CardStats = React.memo(({ task }: { task: Task }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const requiredTimes = task.timesPerDay || 1;

  const getWeeklyStats = () => {
    const today = new Date();
    const weekStart = startOfWeek(today);
    const completions = task.completions?.filter(completion => {
      const date = parseISO(completion.date);
      return date >= weekStart && date <= today && completion.timesCompleted >= requiredTimes;
    }) || [];
    return {
      completed: completions.length,
      total: 7
    };
  };

  const getMonthlyStats = () => {
    const today = new Date();
    const thirtyDaysAgo = addDays(today, -30);
    const completions = task.completions?.filter(completion => {
      const date = parseISO(completion.date);
      return date >= thirtyDaysAgo && date <= today && completion.timesCompleted >= requiredTimes;
    }) || [];
    return {
      completed: completions.length,
      total: 30
    };
  };

  const weeklyStats = getWeeklyStats();
  const monthlyStats = getMonthlyStats();
  const isBestStreak = task.stats?.currentStreak === task.stats?.bestStreak && (task.stats?.bestStreak || 0) > 0;

  return (
    <View style={styles.statsContainer}>
      <View style={styles.statRow}>
        <Text style={styles.statLabel}>Streak: <Text style={styles.statValue}>{task.stats?.currentStreak || 0}</Text></Text>
        {isBestStreak ? (
          <View style={styles.bestStreakContainer}>
            <MaterialCommunityIcons name="trophy" size={16} color="#FFD700" />
            <Text style={[styles.statLabel, styles.bestStreakText]}>Best!</Text>
          </View>
        ) : (
          <Text style={styles.statLabel}>Best: <Text style={styles.statValue}>{task.stats?.bestStreak || 0}</Text></Text>
        )}
      </View>
      <View style={[styles.progressBar, { backgroundColor: task.color + '33' }]}>
        <View 
          style={[
            styles.progressFill, 
            { 
              backgroundColor: task.color,
              width: `${Math.min((task.stats?.currentStreak || 0) / 10 * 100, 100)}%` as const
            }
          ]} 
        />
      </View>

      <View style={styles.statRow}>
        <Text style={styles.statLabel}>This week</Text>
        <Text style={styles.statValue}>{weeklyStats.completed}/{weeklyStats.total}</Text>
      </View>
      <View style={[styles.progressBar, { backgroundColor: task.color + '33' }]}>
        <View 
          style={[
            styles.progressFill, 
            { 
              backgroundColor: task.color,
              width: `${(weeklyStats.completed / weeklyStats.total) * 100}%` as const
            }
          ]} 
        />
      </View>

      <View style={styles.statRow}>
        <Text style={styles.statLabel}>Past 30 days</Text>
        <Text style={styles.statValue}>{monthlyStats.completed}/{monthlyStats.total}</Text>
      </View>
      <View style={[styles.progressBar, { backgroundColor: task.color + '33' }]}>
        <View 
          style={[
            styles.progressFill, 
            { 
              backgroundColor: task.color,
              width: `${(monthlyStats.completed / monthlyStats.total) * 100}%` as const
            }
          ]} 
        />
      </View>
    </View>
  );
});

CardStats.displayName = 'CardStats';

export const TaskCard = React.memo(({
  task,
  size,
  onLongPressCalendar,
  onLongPressStats,
  onLongPressTask,
}: TaskCardProps) => {
  const { showCardBackground } = useSettings();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const flipAnim = useSharedValue(0);
  const scaleAnim = useSharedValue(1);
  const progressAnim = useSharedValue(0);
  const [sides, setSides] = useState<[CardSide, CardSide]>(['task', 'calendar']);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const handlePressIn = () => {
    scaleAnim.value = withSpring(0.95, { damping: 8, stiffness: 100 });
    progressAnim.value = withTiming(0.99999, { duration: 500 });
  };

  const handlePressOut = () => {
    scaleAnim.value = withSpring(1, { damping: 8, stiffness: 100 });
    progressAnim.value = withTiming(0, { duration: 200 });
  };

  const handleLongPress = () => {
    const visibleSide = isFlipped ? sides[1] : sides[0];
    if (visibleSide === 'calendar' && onLongPressCalendar) {
      onLongPressCalendar();
    } else if (visibleSide === 'stats' && onLongPressStats) {
      onLongPressStats();
    } else if (visibleSide === 'task' && onLongPressTask) {
      setIsCompleting(true);
    }
  };

  const flipCard = () => {
    const nextSides: [CardSide, CardSide] = [...sides];
    if (!isFlipped) {
      // Flipping to back, update back side
      if (sides[0] === 'task') {
        nextSides[1] = 'calendar';
      } else if (sides[0] === 'calendar') {
        nextSides[1] = 'stats';
      } else if (sides[0] === 'stats') {
        nextSides[1] = 'task';
      }
    } else {
      // Flipping to front, update front side
      if (sides[1] === 'calendar') {
        nextSides[0] = 'stats';
      } else if (sides[1] === 'stats') {
        nextSides[0] = 'task';
      } else if (sides[1] === 'task') {
        nextSides[0] = 'calendar';
      }
    }
    setSides(nextSides);
    setIsFlipped(!isFlipped);
    
    flipAnim.value = withTiming(isFlipped ? 0 : 1, {
      duration: 800,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  };

  const frontAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotateY: `${flipAnim.value * 180}deg`,
      },
      { scale: scaleAnim.value }
    ],
  }));

  const backAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotateY: `${180 + flipAnim.value * 180}deg`,
      },
      { scale: scaleAnim.value }
    ],
  }));

  const handleTaskCompleted = useCallback(() => {
    onLongPressTask?.();
  }, [onLongPressTask]);

  useEffect(() => {
    setIsCompleting(false);
  }, [task])

  const renderContent = (side: CardSide) => {
    switch (side) {
      case 'task':
        return <CardTask task={task} size={size} progress={progressAnim} isCompleting={isCompleting} onCompleted={handleTaskCompleted} />;
      case 'calendar':
        return <CardCalendar task={task} />;
      case 'stats':
        return <CardStats task={task} />;
    }
  };

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Pressable 
        onPress={flipCard} 
        onLongPress={handleLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        delayLongPress={500}
        style={styles.touchable}
      >
        <Reanimated.View style={[styles.cardContainer, frontAnimatedStyle]}>
          <View style={[styles.card, !showCardBackground && styles.cardTransparent]}>
            {renderContent(sides[0])}
          </View>
        </Reanimated.View>

        <Reanimated.View style={[styles.cardContainer, styles.cardBack, backAnimatedStyle]}>
          <View style={[styles.card, !showCardBackground && styles.cardTransparent]}>
            {renderContent(sides[1])}
          </View>
        </Reanimated.View>
      </Pressable>
    </View>
  );
});

TaskCard.displayName = 'TaskCard';

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  touchable: {
    flex: 1,
  },
  cardContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backfaceVisibility: 'hidden',
  },
  card: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardBack: {
    transform: [{ rotateY: '180deg' }],
  },
  cardTransparent: {
    backgroundColor: 'transparent',
    elevation: 0,
    shadowOpacity: 0,
    padding: 2,
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  taskName: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'center',
  },
  progressCountText: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '600',
  },
  streakBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakBubble: {
    backgroundColor: '#FF6B6B',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  calendarContainer: {
    flex: 1,
    padding: 12,
  },
  calendarGrid: {
    flex: 1,
  },
  calendarDayNames: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calendarDayName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    color: colors.textSecondary,
  },
  calendarDay: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  calendarDayInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    aspectRatio: 1,
  },
  calendarDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarDotFuture: {
    opacity: 0.3,
  },
  calendarX: {
    fontSize: 24,
    color: '#E0E0E0',
    fontWeight: '300',
    lineHeight: 24,
  },
  statsContainer: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  trophyIcon: {
    marginLeft: 2,
  },
  bestStreakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bestStreakText: {
    color: '#FFD700',
    fontWeight: '600',
  },
}); 