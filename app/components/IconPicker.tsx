import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useDebounce } from 'use-debounce';
import { ALL_ICONS, DEFAULT_ICONS } from '../constants/task';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { MaterialCommunityIconName } from '../types';

const PAGE_SIZE = 12;

interface IconPickerProps {
  selectedIcon: MaterialCommunityIconName;
  selectedColor: string;
  onIconSelect: (icon: MaterialCommunityIconName) => void;
}

const getInitialIcons = (selectedIcon: MaterialCommunityIconName): MaterialCommunityIconName[] => {
  const initialIcons = DEFAULT_ICONS.slice(0, PAGE_SIZE);
  if (!initialIcons.includes(selectedIcon)) {
    return [selectedIcon, ...initialIcons];
  }
  return initialIcons;
};

export const IconPicker: React.FC<IconPickerProps> = ({
  selectedIcon,
  selectedColor,
  onIconSelect,
}) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [icons, setIcons] = useState<MaterialCommunityIconName[]>(() => getInitialIcons(selectedIcon));
  const [showingCount, setShowingCount] = useState(PAGE_SIZE);
  const [searchIcons, setSearchIcons] = useState<MaterialCommunityIconName[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);
  const searchInputRef = useRef<TextInput>(null);
  const searchHeight = useRef(new Animated.Value(0)).current;

  // Handle search results
  useEffect(() => {
    if (!debouncedQuery) {
      setSearchIcons([]);
      return;
    }

    const searchTerms = debouncedQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const results = ALL_ICONS.filter(icon => {
      const iconName = icon.toLowerCase();
      return searchTerms.every(term => iconName.includes(term));
    });
    setSearchIcons(results);
    setIcons(results.slice(0, PAGE_SIZE));
    setShowingCount(PAGE_SIZE);
  }, [debouncedQuery]);

  // Animate search container height
  useEffect(() => {
    Animated.timing(searchHeight, {
      toValue: showSearch ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start(() => {
      if (showSearch) {
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 200);
      }
    });
  }, [showSearch]);

  const handleShowMore = useCallback(() => {
    const sourceIcons = debouncedQuery ? searchIcons : DEFAULT_ICONS;
    const newIcons = sourceIcons.slice(showingCount, showingCount + PAGE_SIZE);
    setIcons(prev => [...new Set([...prev, ...newIcons])]);
    setShowingCount(prev => prev + PAGE_SIZE);
  }, [debouncedQuery, searchIcons, showingCount]);

  // Scroll to bottom when additional icons are added
  useEffect(() => {
    if (icons.length > showingCount - PAGE_SIZE) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [icons, showingCount]);

  const handleShowLess = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    setIcons(getInitialIcons(selectedIcon));
    setShowingCount(PAGE_SIZE);
  }, [selectedIcon]);

  // Scroll to top when search query changes
  useEffect(() => {
    if (debouncedQuery) {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [debouncedQuery]);

  const hasMoreIcons = debouncedQuery 
    ? searchIcons.length > showingCount
    : DEFAULT_ICONS.length > showingCount;

  return (
    <View>
      <Animated.View style={[
        styles.searchContainer,
        {
          height: searchHeight.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 45],
          }),
          opacity: searchHeight,
          marginBottom: searchHeight.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 16],
          }),
        },
      ]}>
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search all icons..."
          placeholderTextColor={colors.textTertiary}
          autoFocus
        />
        <MaterialCommunityIcons
          name="magnify"
          size={20}
          color={colors.textTertiary}
          style={styles.searchIcon}
        />
      </Animated.View>
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.iconGrid}>
          {icons.map((icon) => (
            <TouchableOpacity
              key={icon}
              style={[
                styles.iconButton,
                selectedIcon === icon && { backgroundColor: selectedColor },
              ]}
              onPress={() => onIconSelect(icon)}
              accessibilityRole="radio"
              accessibilityLabel={icon.replace(/-/g, ' ')}
              accessibilityState={{ checked: selectedIcon === icon }}
            >
              <MaterialCommunityIcons
                name={icon}
                size={24}
                color={selectedIcon === icon ? '#fff' : colors.text}
              />
            </TouchableOpacity>
          ))}
          {hasMoreIcons && (
            <TouchableOpacity
              style={styles.moreButton}
              onPress={() => {
                setShowSearch(true);
                handleShowMore();
              }}
              accessibilityRole="button"
              accessibilityLabel="Show more icons"
            >
              <MaterialCommunityIcons
                name="dots-horizontal"
                size={24}
                color={colors.textTertiary}
              />
            </TouchableOpacity>
          )}
        </View>
        {!debouncedQuery && showingCount >= DEFAULT_ICONS.length && (
          <Text style={styles.searchHint}>
            Search for {ALL_ICONS.length - DEFAULT_ICONS.length} more icons...
          </Text>
        )}
      </ScrollView>
      {showSearch && (
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  searchContainer: {
    position: 'relative',
    overflow: 'hidden',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    paddingRight: 40, // Make room for the icon
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  searchIcon: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: [{ translateY: -10 }], // Center vertically
  },
  scrollView: {
    maxHeight: 300,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreButton: {
    width: 48,
    height: 48,
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
  searchHint: {
    textAlign: 'center',
    color: colors.textTertiary,
    fontSize: 14,
    marginTop: 8,
    fontStyle: 'italic',
  },
}); 