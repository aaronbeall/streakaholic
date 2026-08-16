import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { useToast } from '../context/ToastContext';

interface SharePreviewModalProps {
  visible: boolean;
  title: string;
  filename: string;
  onClose: () => void;
  children: React.ReactNode;
  option?: {
    label: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
  };
}

const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1350;

/**
 * Shows the exact locally-rendered card that will be shared, then captures only that card—not the
 * surrounding app screen or controls. The temporary PNG goes straight to the native share sheet,
 * so sharing does not need photo-library permission and nothing leaves the device until the user
 * chooses a destination.
 */
export const SharePreviewModal: React.FC<SharePreviewModalProps> = ({
  visible,
  title,
  filename,
  onClose,
  children,
  option,
}) => {
  const cardRef = useRef<View>(null);
  const [isSharing, setIsSharing] = useState(false);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const cardWidth = Math.min(360, width - 32, Math.max(240, (height - insets.top - insets.bottom - 210) * 0.8));
  const cardHeight = cardWidth * 1.25;

  const handleShare = useCallback(async () => {
    if (!cardRef.current || isSharing) return;
    if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
      showToast({ message: 'Image sharing is not available on this device.' });
      return;
    }

    setIsSharing(true);
    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        fileName: filename,
      });
      await Sharing.shareAsync(uri, {
        dialogTitle: title,
        mimeType: 'image/png',
        UTI: 'public.png',
      });
    } catch (error) {
      console.warn('Failed to share image', error);
      showToast({ message: 'Could not create the share image.' });
    } finally {
      setIsSharing(false);
    }
  }, [filename, isSharing, showToast, title]);

  // Keep the generated card completely out of the React/native trees during ordinary app use.
  // In particular, achievement celebrations shouldn't pay to render a second static emblem and
  // text layout merely because sharing is available in principle.
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={isSharing ? undefined : onClose}
    >
      <View style={[styles.backdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable
            style={styles.iconButton}
            onPress={onClose}
            disabled={isSharing}
            accessibilityRole="button"
            accessibilityLabel="Close share preview"
          >
            <MaterialCommunityIcons name="close" size={22} color="#fff" />
          </Pressable>
        </View>

        <View
          ref={cardRef}
          collapsable={false}
          style={{ width: cardWidth, height: cardHeight }}
        >
          {children}
        </View>

        {option && (
          <View style={styles.optionRow}>
            <Text style={styles.optionLabel}>{option.label}</Text>
            <Switch
              value={option.value}
              onValueChange={option.onValueChange}
              disabled={isSharing}
              trackColor={{ false: '#3A3D46', true: '#007AFF' }}
              thumbColor="#fff"
              accessibilityLabel={option.label}
            />
          </View>
        )}

        <Pressable
          style={[styles.shareButton, isSharing && styles.shareButtonDisabled]}
          onPress={handleShare}
          disabled={isSharing}
          accessibilityRole="button"
          accessibilityLabel="Open share sheet"
          accessibilityState={{ disabled: isSharing, busy: isSharing }}
        >
          {isSharing
            ? <ActivityIndicator color="#fff" />
            : <MaterialCommunityIcons name="share-variant" size={20} color="#fff" />}
          <Text style={styles.shareButtonText}>{isSharing ? 'Preparing…' : 'Share'}</Text>
        </Pressable>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 5, 11, 0.96)',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  header: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionRow: {
    width: '100%',
    maxWidth: 360,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionLabel: {
    color: '#D6D9E0',
    fontSize: 15,
    fontWeight: '600',
  },
  shareButton: {
    width: '100%',
    maxWidth: 360,
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  shareButtonDisabled: {
    opacity: 0.65,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
