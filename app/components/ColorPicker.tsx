import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import tinycolor from 'tinycolor2';
import { DEFAULT_COLORS } from '../constants/task';
import { useThemeColors } from '../hooks/useThemeColors';

interface ColorPickerProps {
  selectedColor: string;
  onColorSelect: (color: string) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  selectedColor,
  onColorSelect,
}) => {
  const themeColors = useThemeColors();
  const [colors, setColors] = useState(() => {
    // Initialize with default colors, ensuring selected color is included
    return DEFAULT_COLORS.includes(selectedColor) 
      ? DEFAULT_COLORS 
      : [selectedColor, ...DEFAULT_COLORS];
  });
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Generate 10 random colors using tinycolor
  const generateRandomColors = () => {
    return Array.from({ length: 10 }, () => {
      const hue = Math.floor(Math.random() * 360);
      return tinycolor({ h: hue, s: 85, l: 65 }).toHexString();
    });
  };

  const handleShowMore = () => {
    setColors(prev => [...new Set([...prev, ...generateRandomColors()])]);
  };

  const handleShowLess = () => {
    // Reset to default colors, ensuring selected color is included
    setColors(DEFAULT_COLORS.includes(selectedColor) 
      ? DEFAULT_COLORS 
      : [selectedColor, ...DEFAULT_COLORS]
    );
  };

  // Scroll to bottom when additional colors are added
  useEffect(() => {
    if (colors.length > DEFAULT_COLORS.length) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [colors]);

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
          <TouchableOpacity
            style={styles.moreButton}
            onPress={handleShowMore}
          >
            <MaterialCommunityIcons
              name="dots-horizontal"
              size={24}
              color={themeColors.textTertiary}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>
      
      {colors.length > DEFAULT_COLORS.length && (
        <TouchableOpacity
          style={styles.showLessButton}
          onPress={handleShowLess}
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