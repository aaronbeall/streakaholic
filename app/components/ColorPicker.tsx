import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import tinycolor from 'tinycolor2';
import { DEFAULT_COLORS, EXTENDED_COLOR_BATCHES } from '../constants/task';
import { useThemeColors } from '../hooks/useThemeColors';

interface ColorPickerProps {
  selectedColor: string;
  onColorSelect: (color: string) => void;
}

const TOTAL_BATCHES = EXTENDED_COLOR_BATCHES.length;

export const ColorPicker: React.FC<ColorPickerProps> = ({
  selectedColor,
  onColorSelect,
}) => {
  const themeColors = useThemeColors();
  // How many batches of EXTENDED_COLOR_BATCHES are revealed, beyond the 12 defaults always shown.
  const [batchesShown, setBatchesShown] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const colors = useMemo(() => {
    const revealed = [...DEFAULT_COLORS, ...EXTENDED_COLOR_BATCHES.slice(0, batchesShown).flat()];
    // Keep the task's current color visible/selectable even if it predates this palette
    // (e.g. picked via a since-removed default, or the old random generator).
    return revealed.includes(selectedColor) ? revealed : [selectedColor, ...revealed];
  }, [batchesShown, selectedColor]);

  const hasMore = batchesShown < TOTAL_BATCHES;

  const handleShowMore = () => {
    setBatchesShown(prev => Math.min(prev + 1, TOTAL_BATCHES));
  };

  const handleShowLess = () => {
    setBatchesShown(0);
  };

  // Scroll to bottom when additional colors are revealed
  useEffect(() => {
    if (batchesShown > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [batchesShown]);

  return (
    <View>
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.colorGrid}>
          {colors.map((color) => (
            <TouchableOpacity
              key={color}
              style={[
                styles.colorButton,
                { backgroundColor: color },
                selectedColor === color && {
                  ...styles.selectedColor,
                  borderColor: tinycolor(color).lighten(15).toString(),
                },
              ]}
              onPress={() => onColorSelect(color)}
              accessibilityRole="radio"
              accessibilityLabel={`Color ${color}`}
              accessibilityState={{ checked: selectedColor === color }}
            >
              {selectedColor === color && (
                <MaterialCommunityIcons
                  name="check"
                  size={20}
                  color="#fff"
                  style={styles.checkIcon}
                />
              )}
            </TouchableOpacity>
          ))}
          {hasMore && (
            <TouchableOpacity
              style={styles.moreButton}
              onPress={handleShowMore}
              accessibilityRole="button"
              accessibilityLabel="Show more colors"
            >
              <MaterialCommunityIcons
                name="dots-horizontal"
                size={24}
                color={themeColors.textTertiary}
              />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {batchesShown > 0 && (
        <TouchableOpacity
          style={styles.showLessButton}
          onPress={handleShowLess}
          accessibilityRole="button"
        >
          <Text style={styles.showLessText}>Show Less</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    maxHeight: 200,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedColor: {
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  checkIcon: {
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  moreButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  showLessButton: {
    marginTop: 8,
    padding: 8,
    alignItems: 'center',
  },
  showLessText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
}); 