import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

export function ProfileNav({ action }) {
  return (
    <View className="mb-8 flex-row items-center justify-between border-b border-line pb-5">
      <Link href="/" asChild>
        <Pressable accessibilityRole="link" className="min-h-12 justify-center">
          <Text className="text-xl font-black tracking-tight text-pine">
            SolveOne PH
          </Text>
        </Pressable>
      </Link>
      {action}
    </View>
  );
}

export function VerificationBadge({ level }) {
  const label = (level || "UNVERIFIED").replaceAll("_", " ");

  return (
    <View className="self-start rounded-full bg-mint px-3 py-2">
      <Text className="text-xs font-black uppercase tracking-wider text-pine">
        {label}
      </Text>
    </View>
  );
}

export function InitialAvatar({ name }) {
  const initials = (name || "SolveOne member")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("en"))
    .join("");

  return (
    <View
      accessibilityLabel={`${name || "Member"} profile avatar`}
      accessibilityRole="image"
      className="h-20 w-20 items-center justify-center rounded-full bg-pine"
    >
      <Text className="text-2xl font-black text-white">{initials}</Text>
    </View>
  );
}

export function SkillChips({ skills }) {
  if (!skills?.length) {
    return (
      <Text className="text-sm italic text-muted">No skills listed yet.</Text>
    );
  }

  return (
    <View className="flex-row flex-wrap gap-2">
      {skills.map((skill) => (
        <View
          className="rounded-full border border-line bg-white px-3 py-2"
          key={skill}
        >
          <Text className="text-sm font-semibold text-pine">{skill}</Text>
        </View>
      ))}
    </View>
  );
}

export function formatPublicLocation(location) {
  return [location?.city, location?.province, location?.country]
    .filter(Boolean)
    .join(", ");
}
