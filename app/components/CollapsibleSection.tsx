import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';

interface CollapsibleSectionProps {
  title: string;
  // Rendered in place of `title` while collapsed (a name, an icon glyph, a color swatch, a
  // frequency label, ...) -- expanded always shows the plain title instead, since the content
  // below already shows the live, editable value at that point. Falls back to the title itself
  // if a caller doesn't supply one.
  summary?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

// A form-section header with a divider under it and a chevron indicating expanded/collapsed
// state -- tapping anywhere on the header row toggles. Content is only mounted while expanded
// (not just visually hidden), matching how the rest of this app conditionally renders optional
// form content (e.g. AddTaskScreen's own frequency-specific option cards) rather than paying to
// keep collapsed content alive.
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, summary, expanded, onToggle, children }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const titleText = <Text style={styles.title} numberOfLines={1}>{title}</Text>;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title} section`}
        accessibilityHint={expanded ? 'Collapses this section' : 'Expands this section'}
      >
        <View style={styles.headerLeft}>
          {expanded ? titleText : (summary ?? titleText)}
        </View>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-down' : 'chevron-right'}
          size={22}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
      <View style={styles.divider} />
      {expanded && <View style={styles.content}>{children}</View>}
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 8,
    marginBottom: 12,
  },
  content: {},
});
