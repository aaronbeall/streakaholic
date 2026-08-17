import { useIsFocused } from '@react-navigation/native';
import React, { createContext, RefObject, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { OnboardingHint } from '../components/OnboardingHint';
import { useOnboardingTarget } from '../hooks/useOnboardingTarget';
import { useSettingsStore } from '../stores/settingsStore';
import {
  ONBOARDING_HINT_CATALOG,
  OnboardingHintId,
  selectOnboardingHint,
} from '../utils/onboardingHints';

interface RegisteredHint {
  id: OnboardingHintId;
  enabled: boolean;
  priority: number;
  registrationOrder: number;
  targetRef: RefObject<View | null>;
}

interface OnboardingHintsContextValue {
  upsert: (token: symbol, hint: Omit<RegisteredHint, 'registrationOrder'>) => void;
  unregister: (token: symbol) => void;
  complete: (id: OnboardingHintId) => void;
}

const OnboardingHintsContext = createContext<OnboardingHintsContextValue | null>(null);

export const OnboardingHintsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const containerRef = useRef<View>(null);
  const registrations = useRef(new Map<symbol, RegisteredHint>());
  const nextRegistrationOrder = useRef(0);
  const [registrationVersion, setRegistrationVersion] = useState(0);
  const onboardingHintsSeen = useSettingsStore(state => state.onboardingHintsSeen);
  const setOnboardingHintSeen = useSettingsStore(state => state.setOnboardingHintSeen);

  const upsert = useCallback((token: symbol, hint: Omit<RegisteredHint, 'registrationOrder'>) => {
    const previous = registrations.current.get(token);
    registrations.current.set(token, {
      ...hint,
      registrationOrder: previous?.registrationOrder ?? nextRegistrationOrder.current++,
    });
    setRegistrationVersion(version => version + 1);
  }, []);

  const unregister = useCallback((token: symbol) => {
    if (!registrations.current.delete(token)) return;
    setRegistrationVersion(version => version + 1);
  }, []);

  const complete = useCallback((id: OnboardingHintId) => {
    setOnboardingHintSeen(id, true);
  }, [setOnboardingHintSeen]);

  const activeHint = useMemo(
    () => selectOnboardingHint(Array.from(registrations.current.values()), onboardingHintsSeen),
    // registrationVersion is the explicit invalidation signal for the ref-backed registry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onboardingHintsSeen, registrationVersion]
  );
  const targetLayout = useOnboardingTarget(containerRef, activeHint?.targetRef, !!activeHint);
  const contextValue = useMemo(
    () => ({ upsert, unregister, complete }),
    [upsert, unregister, complete]
  );

  return (
    <OnboardingHintsContext.Provider value={contextValue}>
      <View ref={containerRef} collapsable={false} style={styles.root}>
        {children}
        {activeHint && targetLayout && (
          <OnboardingHint
            key={activeHint.id}
            text={ONBOARDING_HINT_CATALOG[activeHint.id].text}
            targetLayout={targetLayout}
            onDismiss={() => complete(activeHint.id)}
          />
        )}
      </View>
    </OnboardingHintsContext.Provider>
  );
};

export const useOnboardingHintTarget = (
  id: OnboardingHintId,
  enabled: boolean,
  sharedTargetRef?: RefObject<View | null>
) => {
  const context = useContext(OnboardingHintsContext);
  if (!context) throw new Error('useOnboardingHintTarget must be used within OnboardingHintsProvider');

  const ownTargetRef = useRef<View>(null);
  const targetRef = sharedTargetRef ?? ownTargetRef;
  const token = useRef(Symbol(id));
  const isFocused = useIsFocused();
  const eligible = enabled && isFocused;

  useEffect(() => () => context.unregister(token.current), [context]);
  useEffect(() => {
    context.upsert(token.current, {
      id,
      enabled: eligible,
      priority: ONBOARDING_HINT_CATALOG[id].priority,
      targetRef,
    });
  }, [context, eligible, id, targetRef]);

  const complete = useCallback(() => context.complete(id), [context, id]);
  return { ref: targetRef, complete };
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
