import { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";

export function StickyHeader({ children, hidden }) {
  const [height, setHeight] = useState(0);
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      duration: 220,
      toValue: hidden ? -height : 0,
      useNativeDriver: true,
    }).start();
  }, [height, hidden, translateY]);

  return (
    <Animated.View
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      pointerEvents={hidden ? "none" : "auto"}
      style={{
        backgroundColor: "#F7F4EC",
        transform: [{ translateY }],
        zIndex: 1000,
      }}
    >
      {children}
    </Animated.View>
  );
}
