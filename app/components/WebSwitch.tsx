import React from 'react';
import { Switch } from 'react-native';

// react-native-web's Switch splits the thumb color into two props: `thumbColor` (off state)
// and `activeThumbColor` (on state, defaulting to Material teal if unset). Native RN's own
// Switch type doesn't know about `activeThumbColor` since it's a web-only extension, so it's
// typed here rather than reached for with `any`. Pass both whenever a switch sets thumbColor.
export const WebSwitch = Switch as React.ComponentType<React.ComponentProps<typeof Switch> & { activeThumbColor?: string }>;
