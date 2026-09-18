import { useEffect, useRef } from "react";
import { Animated } from "react-native";

export function PageTransition({ children }) {
  const opacity = useRef(new Animated.Value(0.96)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View
      style={{ flex: 1, opacity, transform: [{ translateY }], width: "100%" }}
    >
      {children}
    </Animated.View>
  );
}
