import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { getBarPercentage } from '../utils/data';

// Shared, React.memo'd chart cards for TaskStatsView/DashboardStatsView -- extracted since the two
// screens' chart JSX was byte-for-byte identical apart from color source (task.color vs. a fixed
// accent). react-native-chart-kit has no memoization of its own (confirmed directly: no
// React.memo/PureComponent/shouldComponentUpdate anywhere in its dist) -- every render of a
// LineChart/BarChart fully redraws every SVG path/gradient/label from scratch regardless of
// whether props actually changed. Wrapping these cards in React.memo means a parent re-render that
// doesn't change any of these specific props (e.g. LazyMount's own scroll-position state ticking,
// or the chartAreaWidth correction settling) skips that redraw entirely instead of paying for it
// every time.

const CHART_TYPE_SEGMENT_SIZE = 30;
const CHART_TYPE_SEGMENT_GAP = 3;
const CHART_TYPE_SEGMENT_STEP = CHART_TYPE_SEGMENT_SIZE + CHART_TYPE_SEGMENT_GAP;
const CARD_HORIZONTAL_PADDING = 16;

interface ChartDataset {
  data: number[];
  color?: (opacity?: number) => string;
  strokeWidth?: number;
}

interface ChartDataShape {
  labels: string[];
  datasets: ChartDataset[];
}

function useBaseChartConfig(colors: ThemeColors) {
  return useMemo(() => ({
    backgroundColor: colors.surface,
    backgroundGradientFrom: colors.surface,
    backgroundGradientTo: colors.surface,
    decimalPlaces: 0,
    labelColor: () => colors.textSecondary,
    style: { borderRadius: 16 },
    propsForLabels: {
      fontSize: 11,
      fontFamily: 'System',
      fontWeight: '400' as const,
    },
  }), [colors]);
}

interface CompletionsOverTimeChartCardProps {
  chartData: ChartDataShape;
  chartWidth: number;
  color: string;
  isCumulative: boolean;
  onToggleCumulative: () => void;
}

export const CompletionsOverTimeChartCard: React.FC<CompletionsOverTimeChartCardProps> = React.memo(
  ({ chartData, chartWidth, color, isCumulative, onToggleCumulative }) => {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const baseChartConfig = useBaseChartConfig(colors);

    return (
      <View style={styles.chartCard}>
        <View style={styles.chartHeaderRow}>
          <Text style={[styles.chartTitle, styles.chartHeaderTitle]}>Completions Over Time</Text>
          <TouchableOpacity
            style={styles.chartTypeToggle}
            onPress={onToggleCumulative}
            accessibilityRole="switch"
            accessibilityLabel="Chart type"
            accessibilityHint="Toggles between cumulative total and per-period bars"
            accessibilityState={{ checked: isCumulative }}
          >
            <View
              style={[
                styles.chartTypeIndicator,
                { backgroundColor: color, transform: [{ translateX: isCumulative ? 0 : CHART_TYPE_SEGMENT_STEP }] },
              ]}
            />
            <View style={styles.chartTypeSegment}>
              <MaterialCommunityIcons
                name="chart-line-variant"
                size={16}
                color={isCumulative ? '#fff' : colors.textSecondary}
              />
            </View>
            <View style={styles.chartTypeSegment}>
              <MaterialCommunityIcons
                name="chart-bar"
                size={16}
                color={!isCumulative ? '#fff' : colors.textSecondary}
              />
            </View>
          </TouchableOpacity>
        </View>
        {isCumulative ? (
          <LineChart
            data={chartData}
            width={chartWidth}
            height={180}
            chartConfig={{
              ...baseChartConfig,
              color: (opacity = 1) => color,
              propsForDots: { r: '4' },
              propsForBackgroundLines: {
                strokeDasharray: '',
                stroke: colors.border,
                strokeWidth: 1,
              },
              fillShadowGradient: color,
              fillShadowGradientOpacity: 0.2,
            }}
            bezier
            withInnerLines={false}
            withOuterLines={false}
            withVerticalLines={false}
            withHorizontalLines={true}
            withDots={true}
            withShadow={true}
            style={styles.chart}
          />
        ) : (
          <BarChart
            data={chartData}
            width={chartWidth}
            height={180}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={{
              ...baseChartConfig,
              color: (opacity = 1) => color,
              barPercentage: getBarPercentage(chartWidth, chartData.labels.length),
              fillShadowGradientOpacity: 1,
              propsForBackgroundLines: {
                strokeDasharray: '',
                stroke: colors.border,
                strokeWidth: 1,
              },
            }}
            style={styles.chart}
            fromZero
          />
        )}
      </View>
    );
  }
);
CompletionsOverTimeChartCard.displayName = 'CompletionsOverTimeChartCard';

interface HistogramChartCardProps {
  title: string;
  chartData: ChartDataShape;
  chartWidth: number;
  color: string;
}

export const HistogramChartCard: React.FC<HistogramChartCardProps> = React.memo(
  ({ title, chartData, chartWidth, color }) => {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const baseChartConfig = useBaseChartConfig(colors);

    return (
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>{title}</Text>
        <BarChart
          data={chartData}
          width={chartWidth}
          height={180}
          yAxisLabel=""
          yAxisSuffix=""
          chartConfig={{
            ...baseChartConfig,
            color: (opacity = 1) => color,
            barPercentage: getBarPercentage(chartWidth, chartData.labels.length),
            // BarChart's own bar fill defaults to 10% opacity (fillShadowGradientOpacity), reading
            // as faded -- only its separate 2px "bar top" cap renders fully opaque, which is what
            // actually looked like a solid border. Full opacity here makes the whole bar solid
            // instead (LineChart's own area-shadow default in the sibling card above is untouched,
            // since this override lives on this chart's own config, not the shared base).
            fillShadowGradientOpacity: 1,
            propsForBackgroundLines: {
              strokeDasharray: '',
              stroke: 'rgba(0,0,0,0)',
              strokeWidth: 1,
            },
          }}
          style={styles.chart}
          fromZero
        />
      </View>
    );
  }
);
HistogramChartCard.displayName = 'HistogramChartCard';

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: CARD_HORIZONTAL_PADDING,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chartHeaderTitle: {
    marginBottom: 0,
  },
  chartTypeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 18,
    padding: 3,
    gap: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  chartTypeIndicator: {
    position: 'absolute',
    left: 3,
    top: 3,
    width: CHART_TYPE_SEGMENT_SIZE,
    height: CHART_TYPE_SEGMENT_SIZE,
    borderRadius: CHART_TYPE_SEGMENT_SIZE / 2,
  },
  chartTypeSegment: {
    width: CHART_TYPE_SEGMENT_SIZE,
    height: CHART_TYPE_SEGMENT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
