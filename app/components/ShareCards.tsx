import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { format, parseISO } from 'date-fns';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BRAND_TAGLINE } from '../constants/brand';
import { TrophyEmblem } from './AchievementCard';
import { MaterialCommunityIconName } from '../types';
import { Achievement, ACHIEVEMENT_META, getRibbonText } from '../utils/achievements';

const APP_BLUE = '#007AFF';

const ShareCardFrame: React.FC<{ accentColor: string; children: React.ReactNode }> = ({ accentColor, children }) => (
  <View style={styles.frame}>
    <View style={[styles.glowOne, { backgroundColor: accentColor }]} />
    <View style={[styles.glowTwo, { borderColor: accentColor }]} />
    <View style={styles.cardContent}>{children}</View>
    <View style={styles.brandRow}>
      <View style={[styles.brandIcon, { backgroundColor: accentColor }]}>
        <MaterialCommunityIcons name="fire" size={14} color="#fff" />
      </View>
      <View>
        <Text style={styles.brandName}>Streakaholic</Text>
        <Text style={styles.brandTagline}>{BRAND_TAGLINE}</Text>
      </View>
    </View>
  </View>
);

export const AchievementShareCard: React.FC<{
  achievement: Achievement;
  includeTaskName: boolean;
}> = ({ achievement, includeTaskName }) => {
  const meta = ACHIEVEMENT_META[achievement.kind];
  const description = achievement.taskName && meta.triggerSuffix
    ? `This habit${meta.triggerSuffix(achievement.value ?? 0)}`
    : meta.describe(achievement);

  return (
    <ShareCardFrame accentColor={meta.color.glow}>
      <Text style={styles.eyebrow}>ACHIEVEMENT UNLOCKED</Text>
      <View style={styles.shareEmblemStage}>
        {/* Static echoes of TrophyBadge's animated aura. The emblem in the middle is the exact
            non-animated component used by the Trophy Case and stats showcases; these rings and
            bokeh sit outside it, so the canonical artwork remains shared rather than copied. */}
        <View style={[styles.shareEmblemRing, styles.shareEmblemRingOuter, { borderColor: meta.color.glow }]} />
        <View style={[styles.shareEmblemRing, styles.shareEmblemRingMiddle, { borderColor: meta.color.glow }]} />
        <View style={[styles.shareEmblemRing, styles.shareEmblemRingInner, { borderColor: meta.color.accent }]} />

        <View style={[styles.shareBokeh, styles.shareBokehOne, { backgroundColor: meta.color.accent }]} />
        <View style={[styles.shareBokeh, styles.shareBokehTwo, { backgroundColor: meta.color.glow }]} />
        <View style={[styles.shareBokeh, styles.shareBokehThree, { backgroundColor: meta.color.accent }]} />
        <View style={[styles.shareBokeh, styles.shareBokehFour, { backgroundColor: meta.color.glow }]} />
        <View style={[styles.shareBokeh, styles.shareBokehFive, { backgroundColor: meta.color.accent }]} />

        <View style={styles.shareEmblemScaleWrap}>
          <TrophyEmblem
            icon={meta.icon}
            color={meta.color.base}
            glowColor={meta.color.glow}
            accentColor={meta.color.accent}
            ribbonText={getRibbonText(achievement)}
          />
        </View>
      </View>
      <Text style={styles.achievementTitle}>{meta.title}</Text>
      <Text style={styles.achievementDescription}>{description}</Text>
      {includeTaskName && achievement.taskName && (
        <View style={styles.taskPill}>
          {achievement.taskIcon && (
            <MaterialCommunityIcons
              name={achievement.taskIcon}
              size={14}
              color={achievement.taskColor ?? meta.color.base}
            />
          )}
          <Text style={styles.taskPillText} numberOfLines={1}>{achievement.taskName}</Text>
        </View>
      )}
      <Text style={styles.dateText}>Unlocked {format(parseISO(achievement.earnedAt), 'MMM d, yyyy')}</Text>
    </ShareCardFrame>
  );
};

interface StatCellProps {
  value: string;
  label: string;
  accent?: string;
}

const StatCell: React.FC<StatCellProps> = ({ value, label, accent }) => (
  <View style={styles.statCell}>
    <Text style={[styles.statValue, accent ? { color: accent } : null]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

export const HabitStatsShareCard: React.FC<{
  name: string;
  includeName: boolean;
  icon: MaterialCommunityIconName;
  color: string;
  currentStreak: number;
  bestStreak: number;
  totalCompletions: number;
  completionRate: number;
  since: string;
}> = ({ name, includeName, icon, color, currentStreak, bestStreak, totalCompletions, completionRate, since }) => (
  <ShareCardFrame accentColor={color}>
    <View style={[styles.habitIcon, { backgroundColor: color }]}>
      <MaterialCommunityIcons name={icon} size={34} color="#fff" />
    </View>
    <Text style={styles.eyebrow}>MY HABIT PROGRESS</Text>
    <Text style={styles.statsTitle} numberOfLines={2}>{includeName ? name : 'Building consistency'}</Text>
    <View style={styles.heroMetric}>
      <Text style={[styles.heroMetricValue, { color }]}>{currentStreak}</Text>
      <Text style={styles.heroMetricLabel}>current streak</Text>
    </View>
    <View style={styles.statGrid}>
      <StatCell value={String(bestStreak)} label="Best streak" />
      <StatCell value={String(totalCompletions)} label="Days completed" />
      <StatCell value={`${Math.round(completionRate * 100)}%`} label="Completion rate" />
      <StatCell value={since} label="Tracking since" />
    </View>
  </ShareCardFrame>
);

export const DashboardStatsShareCard: React.FC<{
  totalCompletions: number;
  activeStreaks: number;
  habitCount: number;
  bestStreak: number;
  completionRate: number;
  since: string;
}> = ({ totalCompletions, activeStreaks, habitCount, bestStreak, completionRate, since }) => (
  <ShareCardFrame accentColor={APP_BLUE}>
    <Text style={styles.eyebrow}>MY STREAKAHOLIC PROGRESS</Text>
    <Text style={styles.dashboardTitle}>Small actions.{`\n`}Real momentum.</Text>
    <View style={styles.heroMetric}>
      <Text style={[styles.heroMetricValue, { color: APP_BLUE }]}>{totalCompletions}</Text>
      <Text style={styles.heroMetricLabel}>habit days completed</Text>
    </View>
    <View style={styles.statGrid}>
      <StatCell value={`${activeStreaks}/${habitCount}`} label="Active streaks" />
      <StatCell value={String(bestStreak)} label="Best streak" />
      <StatCell value={`${Math.round(completionRate * 100)}%`} label="Completion rate" />
      <StatCell value={since} label="Tracking since" />
    </View>
  </ShareCardFrame>
);

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#080C17',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
  },
  glowOne: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    right: -120,
    top: -110,
    opacity: 0.18,
  },
  glowTwo: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    left: -120,
    bottom: 15,
    borderWidth: 22,
    opacity: 0.1,
  },
  cardContent: {
    flex: 1,
    alignItems: 'center',
  },
  eyebrow: {
    color: '#AEB6C8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    textAlign: 'center',
  },
  shareEmblemStage: {
    width: 164,
    height: 154,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  shareEmblemScaleWrap: {
    width: 64,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ scale: 1.65 }],
  },
  shareEmblemRing: {
    position: 'absolute',
    borderWidth: 1,
  },
  shareEmblemRingOuter: {
    width: 158,
    height: 158,
    borderRadius: 79,
    opacity: 0.12,
  },
  shareEmblemRingMiddle: {
    width: 136,
    height: 136,
    borderRadius: 68,
    borderWidth: 2,
    opacity: 0.16,
  },
  shareEmblemRingInner: {
    width: 116,
    height: 116,
    borderRadius: 58,
    opacity: 0.2,
  },
  shareBokeh: {
    position: 'absolute',
    borderRadius: 999,
    shadowColor: '#fff',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  shareBokehOne: {
    width: 7,
    height: 7,
    top: 17,
    right: 30,
    opacity: 0.7,
  },
  shareBokehTwo: {
    width: 4,
    height: 4,
    top: 45,
    left: 14,
    opacity: 0.55,
  },
  shareBokehThree: {
    width: 3,
    height: 3,
    top: 9,
    left: 51,
    opacity: 0.75,
  },
  shareBokehFour: {
    width: 8,
    height: 8,
    right: 11,
    bottom: 37,
    opacity: 0.32,
  },
  shareBokehFive: {
    width: 5,
    height: 5,
    left: 27,
    bottom: 21,
    opacity: 0.55,
  },
  achievementTitle: {
    color: '#fff',
    fontSize: 27,
    lineHeight: 31,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 10,
  },
  achievementDescription: {
    color: '#D5D9E3',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 290,
  },
  taskPill: {
    maxWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  taskPillText: {
    flexShrink: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  dateText: {
    color: '#8992A7',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 10,
  },
  habitIcon: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  statsTitle: {
    color: '#fff',
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 7,
  },
  dashboardTitle: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 14,
  },
  heroMetric: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 18,
  },
  heroMetricValue: {
    fontSize: 58,
    lineHeight: 62,
    fontWeight: '900',
  },
  heroMetricLabel: {
    color: '#AEB6C8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statCell: {
    width: '50%',
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    color: '#8992A7',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 9,
    marginTop: 14,
  },
  brandIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  brandTagline: {
    color: '#7F899E',
    fontSize: 8,
    fontWeight: '600',
  },
});
