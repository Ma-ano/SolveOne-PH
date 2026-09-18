import { Children } from "react";
import { View } from "react-native";

export function ResponsiveGrid({ children, className = "" }) {
  return (
    <View className={`flex-row flex-wrap gap-4 ${className}`}>
      {Children.map(children, (child, index) => (
        <View
          className="basis-full md:basis-[48%] xl:basis-[31%]"
          key={child?.key ?? index}
        >
          {child}
        </View>
      ))}
    </View>
  );
}
