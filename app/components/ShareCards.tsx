import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { format, parseISO } from 'date-fns';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { BRAND_TAGLINE } from '../constants/brand';
import { TrophyEmblem } from './AchievementCard';
import { MaterialCommunityIconName } from '../types';
import { Achievement, ACHIEVEMENT_META, getRibbonText } from '../utils/achievements';

const APP_BLUE = '#007AFF';
const TROPHY_GOLD = '#FFD700';
// The same red TaskCard's own streak-badge "fire" state, streaks.ts, DashboardStreaksView, etc.
// already use app-wide for "streak = active" -- reused here rather than inventing a new accent.
const STREAK_RED = '#FF6B6B';
// A small "when was this shared" stamp -- distinct from any date a card's own content might
// already show (e.g. AchievementShareCard's own "Unlocked {date}" line, which is when the
// achievement was earned, not necessarily today). Lives in the shared frame, not any one variant,
// so every card -- across both Dashboard/Habit and every style within each -- gets it for free
// from one place rather than four-plus separate additions. Computed fresh at render time (no
// memoized "today" state) since this only ever renders for the few seconds the share modal is
// actually open. Sits at the very top, centered inside a thin divider line, deliberately quieter
// than the eyebrow/title styling below it -- title-like in shape (all caps, letter-spaced, bold)
// but dimmer in color/size, reading as a subtle watermark rather than another headline.
const ShareDateStamp: React.FC = () => (
  <Text style={styles.shareDateText}>{format(new Date(), 'EEEE, MMMM d')}</Text>
);

const ShareCardFrame: React.FC<{ accentColor: string; children: React.ReactNode }> = ({ accentColor, children }) => (
  <View style={styles.frame}>
    <View style={[styles.glowOne, { backgroundColor: accentColor }]} />
    <View style={[styles.glowTwo, { borderColor: accentColor }]} />
    <ShareDateStamp />
    <View style={styles.cardContent}>{children}</View>
    <View style={styles.brandRow}>
      <Image source={require('../../assets/images/logo-mark.png')} style={styles.brandIcon} resizeMode="contain" />
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
  // Usually a plain string, but a ratio like "5/7" can pass rich content instead (the numerator
  // plain, a de-emphasized "/7" nested inside) -- see DashboardStatsShareCard's own "Active
  // streaks" cell, matching the same de-emphasis technique DashboardStatsView's real secondary
  // strip already uses for the identical ratio.
  value: React.ReactNode;
  label: string;
  accent?: string;
  // Optional icon alongside the value -- e.g. a flame for a streak count, a trophy for a personal
  // best -- matching the same icon language TaskCard/TaskHeader/DashboardStreaksView already use
  // for these exact two stats elsewhere in the app, rather than leaving the number to speak for
  // itself here alone.
  icon?: MaterialCommunityIconName;
  iconColor?: string;
}

const StatCell: React.FC<StatCellProps> = ({ value, label, accent, icon, iconColor }) => (
  <View style={styles.statCell}>
    <View style={styles.statValueRow}>
      {icon && <MaterialCommunityIcons name={icon} size={14} color={iconColor ?? accent ?? '#fff'} />}
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>{value}</Text>
    </View>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// A row of StatCells divided by thin vertical hairlines between them (none framing the outer
// edges) -- matching the real Stats screens' own secondaryStrip/tertiaryStrip treatment exactly
// (TaskStatsView/DashboardStatsView), not a bordered table. That "no card chrome, hairline
// dividers carry it" language is this app's own deliberate, already-settled design after two
// earlier rounds of boxed layouts read as too many repeated boxes -- the original bordered-grid
// version here was a real inconsistency with that, not a considered alternative.
const StatRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.statRow}>
    {React.Children.toArray(children).map((child, index) => (
      <React.Fragment key={index}>
        {index > 0 && <View style={styles.statDivider} />}
        {child}
      </React.Fragment>
    ))}
  </View>
);

// The top-of-card icon badge every per-habit share card leads with (originally only
// HabitStatsShareCard's own inline markup) -- extracted so every habit variant shares one visual
// identity anchor rather than each re-declaring the same circle.
const HabitIconBadge: React.FC<{ icon: MaterialCommunityIconName; color: string }> = ({ icon, color }) => (
  <View style={[styles.habitIcon, { backgroundColor: color }]}>
    <MaterialCommunityIcons name={icon} size={26} color="#fff" />
  </View>
);

export interface HabitLegendItem {
  icon: MaterialCommunityIconName;
  color: string;
  // Not shown as visible text (a row of habit titles across a whole roster read poorly -- long,
  // uneven, wrapping badly at this card width) -- kept only to label each icon for accessibility.
  name: string;
}

// Every Dashboard variant aggregates across whichever habits are currently included, but none of
// them previously said *which* habits that actually was -- this closes that gap with one small,
// shared legend rather than four separately-built ones. A concise icon-only row (no name text --
// see HabitLegendItem's own comment for why that didn't work), so it stays compact regardless of
// how many habits or how long their names are. When `showIcons` is off (the same privacy toggle
// HabitStatsShareCard's own "include habit name" already established, just scoped to the whole
// roster here instead of one name), even the icons are replaced by a plain count -- an icon alone
// can still be identifying (e.g. a distinctive icon for a habit someone would rather not reveal in
// a shared image).
// Renders nothing at all when `showIcons` is off -- turning the toggle off hides the whole legend
// (the "N habits" label included), not just the icons falling back to a plain count. The privacy
// toggle is "don't reveal my roster," not "reveal it, just less specifically."
const HabitLegend: React.FC<{ habits: HabitLegendItem[]; showIcons: boolean }> = ({ habits, showIcons }) => {
  if (habits.length === 0 || !showIcons) return null;
  const countLabel = `${habits.length} habit${habits.length === 1 ? '' : 's'}`;
  return (
    <View style={styles.legendBlock}>
      <Text style={styles.legendCountText}>{countLabel}</Text>
      <View style={styles.legendRow}>
        {habits.map((habit, index) => (
          <View
            key={index}
            style={[styles.legendIcon, { backgroundColor: habit.color }]}
            accessibilityLabel={habit.name}
          >
            <MaterialCommunityIcons name={habit.icon} size={11} color="#fff" />
          </View>
        ))}
      </View>
    </View>
  );
};

export const HabitStatsShareCard: React.FC<{
  name: string;
  includeName: boolean;
  icon: MaterialCommunityIconName;
  color: string;
  currentStreak: number;
  bestStreak: number;
  totalCompletions: number;
  completionRate: number;
  // A short date (e.g. "Jan 2024") for the "Since {date}" label -- the value shown is the day
  // count instead (see daysTracked below), matching DashboardStatsShareCard's own hero
  // "Since {date}" caption paired with a separate "Days tracked" number rather than repeating a
  // full date as the headline value of a stat cell.
  since: string;
  daysTracked: number;
}> = ({ name, includeName, icon, color, currentStreak, bestStreak, totalCompletions, completionRate, since, daysTracked }) => (
  <ShareCardFrame accentColor={color}>
    <HabitIconBadge icon={icon} color={color} />
    <Text style={styles.eyebrow}>MY HABIT PROGRESS</Text>
    <Text style={styles.statsTitle} numberOfLines={2}>{includeName ? name : ''}</Text>
    <View style={styles.heroMetric}>
      <View style={styles.heroMetricValueRow}>
        <MaterialCommunityIcons name="fire" size={30} color={color} />
        <Text style={[styles.heroMetricValue, { color }]}>{currentStreak}</Text>
      </View>
      <Text style={styles.heroMetricLabel}>current streak</Text>
    </View>
    <StatRow>
      <StatCell value={String(bestStreak)} label="Best streak" icon="trophy" iconColor={TROPHY_GOLD} />
      <StatCell value={String(totalCompletions)} label="Days completed" />
    </StatRow>
    <View style={styles.statSectionDivider} />
    <StatRow>
      <StatCell value={`${Math.round(completionRate * 100)}%`} label="Completion rate" />
      <StatCell value={`${daysTracked} days`} label={`Since ${since}`} />
    </StatRow>
  </ShareCardFrame>
);

export const DashboardStatsShareCard: React.FC<{
  totalCompletions: number;
  activeStreaks: number;
  habitCount: number;
  bestStreak: number;
  completionRate: number;
  // The full "Since {date}" caption under the hero number (e.g. "Jan 1, 2026") -- matching
  // DashboardStatsView's own heroSince exactly, both in format and in pairing it with the hero
  // rather than the stat grid (see daysTracked below for what replaced it there).
  since: string;
  // Replaces the old "Tracking since" stat-cell date -- the same underlying measurement (days
  // since that same start date), just as the number it already implies rather than repeating the
  // date a second time now that the hero states it directly.
  daysTracked: number;
  habits: HabitLegendItem[];
  showHabitIcons: boolean;
}> = ({ totalCompletions, activeStreaks, habitCount, bestStreak, completionRate, since, daysTracked, habits, showHabitIcons }) => (
  <ShareCardFrame accentColor={APP_BLUE}>
    <Text style={styles.eyebrow}>MY STREAKAHOLIC PROGRESS</Text>
    <View style={styles.heroMetric}>
      <Text style={[styles.heroMetricValue, { color: APP_BLUE }]}>{totalCompletions}</Text>
      <Text style={styles.heroMetricLabel}>total completions</Text>
      <Text style={styles.heroMetricSince}>Since {since}</Text>
    </View>
    <StatRow>
      <StatCell
        value={<>{activeStreaks}<Text style={styles.statValueDim}>/{habitCount}</Text></>}
        label="Active streaks"
        icon="fire"
        iconColor={STREAK_RED}
      />
      <StatCell value={String(bestStreak)} label="Best streak" icon="trophy" iconColor={TROPHY_GOLD} />
    </StatRow>
    <View style={styles.statSectionDivider} />
    <StatRow>
      <StatCell value={`${Math.round(completionRate * 100)}%`} label="Completion rate" />
      <StatCell value={String(daysTracked)} label="Days tracked" />
    </StatRow>
    <HabitLegend habits={habits} showIcons={showHabitIcons} />
  </ShareCardFrame>
);

// --- Shared graphical building blocks -------------------------------------------------------
// Each of these powers both a Dashboard (aggregate) and a per-habit variant of the same "style"
// -- kept as one implementation each, parameterized by accent color and data, rather than two
// near-identical copies that could drift apart the way this codebase generally avoids elsewhere
// (see e.g. getQuotaPeriodInfo/getStreakBadgeStyle's own extraction history).

const MIN_BAR_HEIGHT_FRACTION = 0.06;

const ActivityBarChart: React.FC<{ labels: string[]; data: number[]; accentColor: string }> = ({
  labels,
  data,
  accentColor,
}) => {
  const max = Math.max(1, ...data);
  return (
    <View style={styles.barChartRow}>
      {data.map((value, index) => {
        const fraction = Math.max(MIN_BAR_HEIGHT_FRACTION, value / max);
        const isMostRecent = index === data.length - 1;
        return (
          <View key={index} style={styles.barColumn}>
            <Text style={styles.barValueLabel}>{value > 0 ? value : ''}</Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.bar,
                  { height: `${fraction * 100}%`, backgroundColor: isMostRecent ? accentColor : `${accentColor}73` },
                ]}
              />
            </View>
            <Text style={styles.barDayLabel}>{labels[index]}</Text>
          </View>
        );
      })}
    </View>
  );
};

// Reuses the exact same emblem (halo, ring, ribbon banner) the Trophy Case and the celebration
// screen itself render -- per explicit user direction, not a lighter stand-in -- so this variant
// genuinely shows "your trophies," not an approximation of them.
const AchievementEmblem: React.FC<{ achievement: Achievement }> = ({ achievement }) => {
  const meta = ACHIEVEMENT_META[achievement.kind];
  return (
    <TrophyEmblem
      icon={meta.icon}
      color={meta.color.base}
      glowColor={meta.color.glow}
      accentColor={meta.color.accent}
      ribbonText={getRibbonText(achievement)}
    />
  );
};

// One wide row, not a stacked two-tier pyramid: the most recent achievement (the list's own first
// entry) sits center, scaled up and lifted a bit higher than its neighbors -- "a center that's a
// bit larger and higher than the flanking," not a literal geometric triangle. The next two most
// recent flank it at a more modest size, spaced generously apart rather than huddled close, so the
// whole row reads as spread out. `TrophyEmblem` has no size prop of its own (it's a fixed-size,
// precisely shadow-tuned component -- see AchievementCard.tsx), so both the size and the lift are
// pure `transform`/`margin` on a wrapping View -- matching the exact scale-wrap technique
// AchievementShareCard already uses to blow its own single hero emblem up to 1.65x -- which don't
// change each slot's reserved layout space, so the row's own centering math stays simple.
// Kept modest (not the originally-tried 1.25/0.88) -- `transform: scale` is purely visual and
// doesn't add anything to the layout box flexbox uses to place the *next* sibling below it, so a
// bigger scale-up here would visually bleed into trophyIconRow beneath it without flexbox ever
// "knowing" to make room for that -- exactly the class of bug behind the original overlap report.
// A smaller scale keeps that invisible overflow small enough that trophyIconRow's own explicit
// marginTop below comfortably covers it.
const TROPHY_HERO_SCALE = 1.15;
const TROPHY_SIDE_SCALE = 0.85;
// How far the hero sits above the row's shared bottom baseline (`alignItems: 'flex-end'`) on top
// of whatever lift its own larger scale already gives it -- a deliberate, explicit raise rather
// than relying on the size difference alone to read as "higher."
const TROPHY_HERO_LIFT = 8;

// Beyond the row's own 3, further achievements get a small chip each -- an icon circle plus a
// miniature version of the *real* ribbon banner (tails and all, same short ribbon text via
// getRibbonText -- "10 DAYS", not the full achievement title, exactly what the full-size emblems
// above already show on their own banners) rather than a plain label -- so even the compact
// overflow tally still visually matches the emblem language instead of reading as an unrelated,
// simplified stand-in. Using the short ribbon text (not the title) is also most of what makes
// room to fit more chips per row than a longer title's worth of text ever could. Up to this cap,
// with a "+N" bubble for whatever's still left over (same overflow-bubble language
// AchievementCard.tsx's own EarnerIconRow already established for "more than fits" elsewhere in
// this feature).
const TROPHY_ICON_ROW_MAX = 5;
// How many achievements a caller actually needs to supply for TrophyHighlightRow to have enough
// to fill the main row (3) plus a full icon row (TROPHY_ICON_ROW_MAX) -- exported so a caller can
// slice its own sorted achievement list to exactly this instead of guessing a number that could
// silently drift out of sync if either constant above is ever retuned.
export const TROPHY_HIGHLIGHT_CAP = 3 + TROPHY_ICON_ROW_MAX;

const TROPHY_ICON_RING_SIZE = 28;
// Same ~6% ring-width-to-diameter ratio TrophyEmblem's own `ringWidth = EMBLEM_SIZE * 0.06`
// formula uses, so the small ring reads proportionally the same as the full-size one.
const TROPHY_ICON_FACE_SIZE = TROPHY_ICON_RING_SIZE - Math.round(TROPHY_ICON_RING_SIZE * 0.06) * 2;

// Mirrors TrophyEmblem's own ring-around-face structure at a much smaller scale (an accent-
// colored outer ring, a base-colored inner face, an accent-colored icon glyph on top of it) --
// same color roles as the full-size emblem, just tiny, rather than a single flat base-colored dot.
const TrophyIconChip: React.FC<{ achievement: Achievement }> = ({ achievement }) => {
  const meta = ACHIEVEMENT_META[achievement.kind];
  return (
    <View style={styles.trophyIconChip}>
      <View style={[styles.trophyIconRing, { backgroundColor: meta.color.accent }]}>
        <View style={[styles.trophyIconFace, { backgroundColor: meta.color.base }]}>
          <MaterialCommunityIcons name={meta.icon} size={13} color={meta.color.accent} />
        </View>
      </View>
      <View style={styles.trophyIconRibbonRow}>
        <View style={[styles.trophyIconRibbonTailLeft, { borderRightColor: meta.color.base }]} />
        <View style={[styles.trophyIconRibbonClip, { backgroundColor: meta.color.base }]}>
          <Text style={styles.trophyIconRibbonText} numberOfLines={1}>{getRibbonText(achievement)}</Text>
        </View>
        <View style={[styles.trophyIconRibbonTailRight, { borderLeftColor: meta.color.base }]} />
      </View>
    </View>
  );
};

// `totalCount` is the true lifetime count (e.g. every achievement this task/the whole app has
// ever earned), independent of how many entries `achievements` itself was actually handed --
// needed so the "+N" bubble stays accurate even though the caller only passes a bounded, already
// newest-first slice rather than the full history.
const TrophyHighlightRow: React.FC<{ achievements: Achievement[]; totalCount: number; emptyText: string }> = ({
  achievements,
  totalCount,
  emptyText,
}) => {
  if (achievements.length === 0) {
    return <Text style={styles.trophyEmptyText}>{emptyText}</Text>;
  }

  const [hero, left, right, ...rest] = achievements;
  const iconRowItems = rest.slice(0, TROPHY_ICON_ROW_MAX);
  const shownCount = [hero, left, right].filter(Boolean).length + iconRowItems.length;
  const overflowCount = Math.max(0, totalCount - shownCount);

  return (
    <View>
      <View style={styles.trophyRow}>
        {left && (
          <View style={[styles.trophySideSlot, { transform: [{ scale: TROPHY_SIDE_SCALE }] }]}>
            <AchievementEmblem achievement={left} />
          </View>
        )}
        <View style={[styles.trophyHeroSlot, { transform: [{ scale: TROPHY_HERO_SCALE }] }]}>
          <AchievementEmblem achievement={hero} />
        </View>
        {right && (
          <View style={[styles.trophySideSlot, { transform: [{ scale: TROPHY_SIDE_SCALE }] }]}>
            <AchievementEmblem achievement={right} />
          </View>
        )}
      </View>
      {(iconRowItems.length > 0 || overflowCount > 0) && (
        <View style={styles.trophyIconRow}>
          {iconRowItems.map(achievement => (
            <TrophyIconChip key={achievement.id} achievement={achievement} />
          ))}
          {overflowCount > 0 && (
            <View style={styles.trophyIconChip}>
              <View style={styles.trophyIconOverflowCircle}>
                <Text style={styles.trophyIconOverflowText}>+{overflowCount}</Text>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

// Sized to leave room, on the smallest supported card, for a leading habit-icon badge + 2-line
// name above it and a full stat row below it (the Habit Momentum variant's own worst case -- see
// cardContent's own comment on this file's overall explicit-spacing budgeting approach).
const RING_SIZE = 112;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const MomentumRing: React.FC<{
  fraction: number;
  color: string;
  icon: MaterialCommunityIconName;
  // ReactNode, not just number -- lets a caller pass a de-emphasized "/total" suffix nested
  // inside (e.g. DashboardMomentumShareCard's "X/Y" ratio, same statValueDim-style technique
  // StatCell's own value prop already established) alongside a caller that just wants a plain
  // count (HabitMomentumShareCard's currentStreak).
  centerValue: React.ReactNode;
  centerLabel: string;
}> = ({ fraction, color, icon, centerValue, centerLabel }) => (
  <View style={styles.ringStage}>
    <Svg width={RING_SIZE} height={RING_SIZE}>
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={RING_STROKE}
        fill="none"
      />
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        stroke={color}
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${RING_CIRCUMFERENCE}, ${RING_CIRCUMFERENCE}`}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, fraction)))}
        rotation="-90"
        origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
      />
    </Svg>
    <View style={styles.ringCenter}>
      <MaterialCommunityIcons name={icon} size={18} color={color} />
      <Text style={styles.ringCenterValue}>{centerValue}</Text>
      <Text style={styles.ringCenterLabel}>{centerLabel}</Text>
    </View>
  </View>
);

// --- Dashboard (aggregate) variants -----------------------------------------------------------

export const DashboardActivityShareCard: React.FC<{
  labels: string[];
  data: number[];
  totalThisWeek: number;
  totalCompletions: number;
  habits: HabitLegendItem[];
  showHabitIcons: boolean;
}> = ({ labels, data, totalThisWeek, totalCompletions, habits, showHabitIcons }) => (
  <ShareCardFrame accentColor={APP_BLUE}>
    <Text style={styles.eyebrow}>MY WEEKLY ACTIVITY</Text>
    <ActivityBarChart labels={labels} data={data} accentColor={APP_BLUE} />
    <StatRow>
      <StatCell value={String(totalThisWeek)} label="This week" accent={APP_BLUE} />
      <StatCell value={String(totalCompletions)} label="All-time total" />
    </StatRow>
    <HabitLegend habits={habits} showIcons={showHabitIcons} />
  </ShareCardFrame>
);

export const DashboardTrophyShareCard: React.FC<{
  recentAchievements: Achievement[];
  totalUnlocked: number;
  habits: HabitLegendItem[];
  showHabitIcons: boolean;
}> = ({ recentAchievements, totalUnlocked, habits, showHabitIcons }) => (
  <ShareCardFrame accentColor={TROPHY_GOLD}>
    <Text style={styles.eyebrow}>MY TROPHY CASE</Text>
    {totalUnlocked > 0 ? (
      <>
        <Text style={styles.dashboardTitle}>
          <Text style={styles.trophyCountNumber}>{totalUnlocked}</Text> trophies
        </Text>
        <Text style={styles.trophyCountSuffix}>and counting</Text>
      </>
    ) : (
      <Text style={styles.dashboardTitle}>The trophy case{'\n'}awaits</Text>
    )}
    <TrophyHighlightRow
      achievements={recentAchievements}
      totalCount={totalUnlocked}
      emptyText="Keep showing up — your first trophy is closer than you think."
    />
    <HabitLegend habits={habits} showIcons={showHabitIcons} />
  </ShareCardFrame>
);

export const DashboardMomentumShareCard: React.FC<{
  activeStreaks: number;
  habitCount: number;
  bestStreak: number;
  totalCompletions: number;
  habits: HabitLegendItem[];
  showHabitIcons: boolean;
}> = ({ activeStreaks, habitCount, bestStreak, totalCompletions, habits, showHabitIcons }) => {
  const fraction = habitCount > 0 ? activeStreaks / habitCount : 0;
  return (
    <ShareCardFrame accentColor={STREAK_RED}>
      <Text style={styles.eyebrow}>MY MOMENTUM</Text>
      {/* Ring center deliberately shows the *same* ratio the ring's own fill visualizes
          (activeStreaks/habitCount) -- the original version put bestStreak here, a
          different-scope number (a single habit's longest run, not an aggregate fraction) that
          had no visual relationship to what the ring was filling, which read as confusing. The
          "/habitCount" half uses the same de-emphasized-suffix technique as the Stats card's own
          "X/Y" ratio (see ringCenterValueDim). */}
      <MomentumRing
        fraction={fraction}
        color={STREAK_RED}
        icon="fire"
        centerValue={<>{activeStreaks}<Text style={styles.ringCenterValueDim}>/{habitCount}</Text></>}
        centerLabel="streaks"
      />
      <Text style={styles.ringCaption}>{activeStreaks} of {habitCount} habits on an active streak</Text>
      <StatRow>
        <StatCell value={String(totalCompletions)} label="Total completions" />
        <StatCell value={String(bestStreak)} label="Best streak" icon="trophy" iconColor={TROPHY_GOLD} />
      </StatRow>
      <HabitLegend habits={habits} showIcons={showHabitIcons} />
    </ShareCardFrame>
  );
};

// --- Per-habit variants ------------------------------------------------------------------------
// All three share HabitStatsShareCard's own top structure (icon badge, eyebrow, name-or-fallback
// title) so the "include habit name" privacy toggle behaves identically across every style.

export const HabitActivityShareCard: React.FC<{
  name: string;
  includeName: boolean;
  icon: MaterialCommunityIconName;
  color: string;
  labels: string[];
  data: number[];
  totalThisWeek: number;
  bestWeek: number;
}> = ({ name, includeName, icon, color, labels, data, totalThisWeek, bestWeek }) => (
  <ShareCardFrame accentColor={color}>
    <HabitIconBadge icon={icon} color={color} />
    <Text style={styles.eyebrow}>MY WEEKLY ACTIVITY</Text>
    <Text style={styles.statsTitle} numberOfLines={2}>{includeName ? name : ''}</Text>
    <ActivityBarChart labels={labels} data={data} accentColor={color} />
    <StatRow>
      <StatCell value={String(totalThisWeek)} label="This week" accent={color} />
      <StatCell value={String(bestWeek)} label="Best week" icon="trophy" iconColor={TROPHY_GOLD} />
    </StatRow>
  </ShareCardFrame>
);

export const HabitTrophyShareCard: React.FC<{
  name: string;
  includeName: boolean;
  icon: MaterialCommunityIconName;
  color: string;
  recentAchievements: Achievement[];
  totalUnlocked: number;
}> = ({ name, includeName, icon, color, recentAchievements, totalUnlocked }) => (
  <ShareCardFrame accentColor={color}>
    <HabitIconBadge icon={icon} color={color} />
    <Text style={styles.eyebrow}>MY TROPHY CASE</Text>
    <Text style={styles.statsTitle} numberOfLines={2}>{includeName ? name : ''}</Text>
    <Text style={styles.trophyCountText}>
      {totalUnlocked > 0 ? `${totalUnlocked} trophies earned` : 'No trophies yet'}
    </Text>
    <TrophyHighlightRow
      achievements={recentAchievements}
      totalCount={totalUnlocked}
      emptyText="Every streak earns its own trophies — keep going."
    />
  </ShareCardFrame>
);

export const HabitMomentumShareCard: React.FC<{
  name: string;
  includeName: boolean;
  icon: MaterialCommunityIconName;
  color: string;
  currentStreak: number;
  bestStreak: number;
  completionRate: number;
  // A rate/pace stat, deliberately distinct from completionRate (already stated by the ring +
  // its caption) -- "how often," not "what fraction of days," so the stat row adds real
  // information instead of just restating the caption above it in a different format.
  avgPerWeek: number;
}> = ({ name, includeName, icon, color, currentStreak, bestStreak, completionRate, avgPerWeek }) => (
  <ShareCardFrame accentColor={color}>
    <HabitIconBadge icon={icon} color={color} />
    <Text style={styles.eyebrow}>MY MOMENTUM</Text>
    <Text style={styles.statsTitle} numberOfLines={2}>{includeName ? name : ''}</Text>
    <MomentumRing fraction={completionRate} color={color} icon="fire" centerValue={currentStreak} centerLabel="day streak" />
    <Text style={styles.ringCaption}>{Math.round(completionRate * 100)}% completion rate</Text>
    <StatRow>
      <StatCell value={String(bestStreak)} label="Best streak" icon="trophy" iconColor={TROPHY_GOLD} />
      <StatCell value={avgPerWeek.toFixed(1)} label="Weekly average" accent={color} />
    </StatRow>
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
    // Deliberately NOT justifyContent:'space-between' -- auto-distributing leftover space can
    // only ever redistribute *slack*, it can't shrink content that's genuinely taller than the
    // fixed card budget, which is exactly what caused real reported overlap with the brand footer
    // on the denser variants (Trophy/Momentum especially). Every element below instead carries its
    // own small, explicit margin, hand-budgeted (see the per-style comments) so the *worst case*
    // for every variant -- a full icon-chip row, a 2-line habit name, a full habit-icon legend --
    // reliably totals less than the smallest realistic card's content height.
    // `flex-start`, not `center`: content on shorter variants (Stats/Activity) is noticeably
    // shorter than the fixed card budget, and centering the whole block as one unit pushed a
    // visible, variant-dependent gap between the date stamp above and the card's own heading --
    // flex-start keeps every card's heading sitting right below the date at a fixed distance, and
    // lets any real leftover slack collect safely at the bottom (above the brand row) instead.
    justifyContent: 'flex-start',
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
  // Sized to leave room, on the smallest supported card, for a 2-line habit name below it plus
  // every stat below *that* -- see cardContent's own comment for the overall budgeting approach.
  habitIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  // numberOfLines={2} at every call site -- fontSize/lineHeight sized so even a full 2-line wrap
  // (the worst case this budget accounts for) stays affordable against every other stat below it.
  statsTitle: {
    color: '#fff',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 6,
  },
  dashboardTitle: {
    color: '#fff',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 8,
  },
  // The card's own theme color on just the number, not the whole headline -- the same "tint the
  // number, not the noun around it" technique used elsewhere in this app (e.g. the achievement
  // celebration's own hero number).
  trophyCountNumber: {
    color: TROPHY_GOLD,
  },
  // A quieter, smaller flourish on "and counting" -- a separate sibling Text (not nested inside
  // dashboardTitle) specifically so it can have its own tight marginTop instead of inheriting
  // dashboardTitle's own lineHeight (sized for its much larger font, which read as too loose a
  // gap between the two lines when they shared one Text block). Soft translucent white rather
  // than a hue, so the color contrast lives in the number above, not competing here too.
  trophyCountSuffix: {
    fontSize: 13,
    fontWeight: '700',
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    marginTop: 2,
  },
  heroMetric: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  heroMetricValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroMetricValue: {
    fontSize: 48,
    lineHeight: 52,
    fontWeight: '900',
  },
  heroMetricLabel: {
    color: '#AEB6C8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Matches DashboardStatsView's own heroSince exactly (fontSize/weight/marginTop) -- the real
  // screen's hero already pairs its total-completions number with a "Since {date}" caption right
  // below it, so this share card should too.
  heroMetricSince: {
    color: '#8992A7',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  statRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  // A thin hairline between adjacent StatCells within one row -- matches TaskStatsView/
  // DashboardStatsView's own stripDividerV exactly (StyleSheet.hairlineWidth, a fixed height,
  // no full-row-framing border), not a bordered table cell.
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  // Separates two StatRows stacked in the same card (e.g. a 4-stat card split into two rows of
  // two) -- same role as the real Stats screens' own statsDivider/statsDividerMinor.
  statSectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginTop: 8,
    width: '100%',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  // The de-emphasized "/N" half of a ratio value (e.g. "5/7") -- same "numerator reads as the
  // real number, denominator is a smaller/dimmer suffix" technique DashboardStatsView's own
  // secondaryValueTotal already establishes for this identical stat.
  statValueDim: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8992A7',
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
  // The actual logo mark (transparent PNG, its own circular badge shape) -- no backdrop/border
  // radius needed, unlike the old plain-fire-glyph placeholder this replaced.
  brandIcon: {
    width: 30,
    height: 30,
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
  // Title-shaped (all caps, letter-spaced, bold -- same structural language as eyebrow) but
  // deliberately dimmer/smaller than it, so this reads as a quiet watermark rather than another
  // headline competing with the card's own actual title.
  shareDateText: {
    color: '#7F899E',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 14,
  },
  // marginTop/marginBottom are the explicit, hand-budgeted clearance around this chart -- see
  // cardContent's own comment for why this is a fixed value rather than auto-distributed slack.
  // marginTop is deliberately generous (not just the minimum clearance below the title) -- with
  // flex-start layout, a shorter-than-budget card (Activity is one of the lighter variants) would
  // otherwise stack everything near the top and leave all its slack at the bottom; pushing the
  // chart down instead distributes that slack above and below it, reading as centered rather than
  // top-heavy.
  barChartRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 26,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barValueLabel: {
    color: '#AEB6C8',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
    minHeight: 13,
  },
  // Sized to leave room, on the smallest supported card, for a leading habit-icon badge + 2-line
  // name above it (Habit Activity's own worst case) plus a full stat row below it.
  barTrack: {
    width: 14,
    height: 56,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
    borderRadius: 7,
  },
  barDayLabel: {
    color: '#8992A7',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
  },
  trophyCountText: {
    color: '#AEB6C8',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
  },
  trophyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    // No flexWrap here (unlike the icon row below) -- this is a fixed, deliberate 1-3 item
    // composition, not an arbitrary-length list that should reflow; a generous gap is what gives
    // the "spread wide" feel, not letting it wrap onto a second line.
    gap: 14,
    marginTop: 26,
  },
  trophyHeroSlot: {
    zIndex: 2,
    // Positive marginBottom on a flex-end-aligned item pushes it away from the row's shared
    // bottom baseline -- i.e. visibly higher than its flex-end-aligned neighbors -- on top of
    // (not instead of) the extra height its own larger scale already gives it.
    marginBottom: TROPHY_HERO_LIFT,
  },
  trophySideSlot: {
    zIndex: 1,
    opacity: 0.92,
  },
  trophyIconRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    // Explicit, hand-budgeted gap (not auto-distributed) -- comfortably clears trophyRow's own
    // hero emblem, including the invisible visual overflow its scale-transform adds beyond its own
    // layout box (see TROPHY_HERO_SCALE's own comment), without relying on leftover slack.
    marginTop: 16,
    marginBottom: 6,
    paddingHorizontal: 10,
  },
  // No fixed width -- each chip is only as wide as its own circle or ribbon needs (whichever is
  // wider), the same "content-sized, not a forced box" approach TrophyEmblem's own wrap already
  // uses, so a short ribbon ("10 DAYS") doesn't waste space reserved for a longer one.
  trophyIconChip: {
    alignItems: 'center',
  },
  // Outer ring (accent-colored) and inner face (base-colored) -- same two-layer structure as
  // TrophyEmblem's own ring/face (AchievementCard.tsx), just scaled down: TROPHY_ICON_RING_SIZE
  // (28) and a ring width (2) proportioned the same ~6% of diameter that component's own
  // `EMBLEM_SIZE * 0.06` formula uses, leaving TROPHY_ICON_FACE_SIZE (24) for the face.
  trophyIconRing: {
    width: TROPHY_ICON_RING_SIZE,
    height: TROPHY_ICON_RING_SIZE,
    borderRadius: TROPHY_ICON_RING_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  trophyIconFace: {
    width: TROPHY_ICON_FACE_SIZE,
    height: TROPHY_ICON_FACE_SIZE,
    borderRadius: TROPHY_ICON_FACE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // The "+N" overflow bubble isn't a real achievement -- no accent/base color pair to draw a
  // ring/face split from -- so it stays a single flat circle, just matching the ring's own outer
  // diameter so it lines up with its neighboring chips.
  trophyIconOverflowCircle: {
    width: TROPHY_ICON_RING_SIZE,
    height: TROPHY_ICON_RING_SIZE,
    borderRadius: TROPHY_ICON_RING_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  trophyIconOverflowText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  // A miniature version of TrophyEmblem's own ribbon (emblemStyles.ribbonRow/ribbonClip/
  // ribbonText/ribbonTailLeft/ribbonTailRight in AchievementCard.tsx) -- same shape, same
  // border-triangle tail trick, same short ribbon-text styling, just scaled down for this much
  // smaller circle instead of a plain unrelated label.
  trophyIconRibbonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
  },
  trophyIconRibbonClip: {
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  trophyIconRibbonText: {
    color: '#fff',
    fontSize: 6,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  trophyIconRibbonTailLeft: {
    width: 0,
    height: 0,
    borderTopWidth: 3,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderLeftWidth: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginRight: -1,
  },
  trophyIconRibbonTailRight: {
    width: 0,
    height: 0,
    borderTopWidth: 3,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderRightWidth: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginLeft: -1,
  },
  trophyEmptyText: {
    color: '#AEB6C8',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 22,
    maxWidth: 260,
  },
  legendBlock: {
    alignItems: 'center',
    marginTop: 14,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 8,
  },
  legendIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Same title styling as eyebrow (all caps, bold, letter-spaced) -- textTransform is what makes
  // that work for this one, unlike eyebrow's own callers, which just type their text pre-capped
  // ("MY MOMENTUM") directly in JSX; this label's text is a dynamic, naturally-cased count.
  legendCountText: {
    color: '#AEB6C8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  ringStage: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenterValue: {
    color: '#fff',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
    marginTop: 2,
  },
  // The de-emphasized "/total" half of a ring-center ratio (e.g. "3/5") -- same role as
  // statValueDim, just scaled down to this smaller ring-center font instead of a full StatCell's.
  ringCenterValueDim: {
    fontSize: 15,
    fontWeight: '700',
    color: '#8992A7',
  },
  ringCenterLabel: {
    color: '#AEB6C8',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  ringCaption: {
    color: '#D5D9E3',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 8,
  },
});
