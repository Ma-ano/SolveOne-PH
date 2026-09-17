import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { PageContainer } from "../../components/PageContainer";

export function AuthShell({ eyebrow, title, description, children, footer }) {
  return (
    <PageContainer>
      <View className="flex-row items-center justify-between pb-8">
        <Link href="/" asChild>
          <Pressable
            accessibilityRole="link"
            className="min-h-12 justify-center rounded-xl px-1"
          >
            <Text className="text-xl font-black tracking-tight text-pine">
              SolveOne PH
            </Text>
          </Pressable>
        </Link>
        <Text className="text-xs font-bold uppercase tracking-widest text-leaf">
          Problems solved
        </Text>
      </View>

      <View className="w-full max-w-lg self-center rounded-3xl border border-line bg-surface p-6 shadow-sm md:p-10">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          {eyebrow}
        </Text>
        <Text
          accessibilityRole="header"
          className="mt-3 text-4xl font-black tracking-tight text-ink"
        >
          {title}
        </Text>
        {description ? (
          <Text className="mt-3 text-base leading-7 text-muted">
            {description}
          </Text>
        ) : null}
        <View className="mt-8">{children}</View>
        {footer ? (
          <View className="mt-7 border-t border-line pt-6">{footer}</View>
        ) : null}
      </View>
    </PageContainer>
  );
}

export function AuthLink({ href, children }) {
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" className="min-h-12 justify-center">
        <Text className="text-center text-sm font-bold text-leaf">
          {children}
        </Text>
      </Pressable>
    </Link>
  );
}
