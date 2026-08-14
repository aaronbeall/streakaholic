import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useDebounce } from 'use-debounce';
import { ALL_ICONS, DEFAULT_ICONS } from '../constants/task';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { MaterialCommunityIconName } from '../types';
import { searchIcons } from '../utils/iconSearch';

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
  const [searchResults, setSearchResults] = useState<MaterialCommunityIconName[]>([]);
  const searchInputRef = useRef<TextInput>(null);
  const searchHeight = useRef(new Animated.Value(0)).current;

  // Keeps the selected icon visible even when it's changed *after* mount by something other than
  // tapping a tile here -- `icons`' own initial value already does this once via getInitialIcons,
  // but that's a useState lazy initializer, which only ever runs on mount. It doesn't re-fire just
  // because the `selectedIcon` *prop* changes later, which is exactly what AddTaskScreen's own
  // name-based icon auto-suggestion does (it updates `selectedIcon` well after this component has
  // already mounted) -- without this, an auto-suggested icon outside the currently-shown page
  // would silently apply with no visible selected tile anywhere in the grid. Skipped while a
  // search is active (`debouncedQuery`), since `icons` holds search results in that mode, not the
  // "always show the current pick" browse list, and splicing an unrelated icon to the front of
  // search results would read as a stray, unexplained result.
  useEffect(() => {
    if (debouncedQuery) return;
    setIcons(prev => (prev.includes(selectedIcon) ? prev : [selectedIcon, ...prev]));
  }, [selectedIcon, debouncedQuery]);

  // Handle search results -- stem matches (a curated word-stem -> icon table, shared with
  // AddTaskScreen's own name-based icon auto-suggestion so both features agree on what counts as
  // a match) come first, followed by a plain substring match against every icon's own literal MDI
  // name for anything the stems don't cover. See iconSearch.ts's own doc comment for the full
  // rationale.
  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults([]);
      return;
    }

    const results = searchIcons(debouncedQuery, ALL_ICONS);
    setSearchResults(results);
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
    const sourceIcons = debouncedQuery ? searchResults : DEFAULT_ICONS;
    const newIcons = sourceIcons.slice(showingCount, showingCount + PAGE_SIZE);
    setIcons(prev => [...new Set([...prev, ...newIcons])]);
    setShowingCount(prev => prev + PAGE_SIZE);
  }, [debouncedQuery, searchResults, showingCount]);

  const handleShowLess = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    setIcons(getInitialIcons(selectedIcon));
    setShowingCount(PAGE_SIZE);
  }, [selectedIcon]);

  const hasMoreIcons = debouncedQuery
    ? searchResults.length > showingCount
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
        />
        <MaterialCommunityIcons
          name="magnify"
          size={20}
          color={colors.textTertiary}
          style={styles.searchIcon}
        />
      </Animated.View>
      {/* No internal scrolling -- this grid just grows as more icons/search results are
          revealed, relying on the screen's own outer ScrollView (AddTaskScreen) for any page
          scrolling. */}
      <View>
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
      </View>
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