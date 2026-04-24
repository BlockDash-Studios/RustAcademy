import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../../src/theme/ThemeContext';

interface SkeletonItemProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * A single animated skeleton placeholder bar.
 */
export function SkeletonItem({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}: SkeletonItemProps) {
  const { theme } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: theme.border ?? '#E0E0E0',
          opacity,
        },
        style,
      ]}
    />
  );
}

interface SkeletonRowProps {
  /** Number of skeleton rows to render */
  count?: number;
  /** Height of each row */
  rowHeight?: number;
  style?: ViewStyle;
}

/**
 * A stack of skeleton rows — suitable for list placeholders.
 */
export function SkeletonList({ count = 5, rowHeight = 64, style }: SkeletonRowProps) {
  return (
    <View style={[styles.list, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} height={rowHeight} />
      ))}
    </View>
  );
}

function SkeletonRow({ height }: { height: number }) {
  return (
    <View style={[styles.row, { height }]}>
      {/* Avatar / icon placeholder */}
      <SkeletonItem width={40} height={40} borderRadius={20} style={styles.avatar} />
      <View style={styles.lines}>
        <SkeletonItem width="60%" height={14} style={styles.lineTop} />
        <SkeletonItem width="40%" height={12} />
      </View>
      {/* Amount placeholder */}
      <SkeletonItem width={60} height={14} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    marginRight: 12,
  },
  lines: {
    flex: 1,
    marginRight: 12,
  },
  lineTop: {
    marginBottom: 6,
  },
});
