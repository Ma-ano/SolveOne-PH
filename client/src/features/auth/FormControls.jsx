import { Controller } from "react-hook-form";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

export function FormField({
  control,
  name,
  label,
  error,
  secureTextEntry,
  autoCapitalize = "none",
  autoComplete,
  keyboardType = "default",
  textContentType,
  multiline = false,
  numberOfLines,
  placeholder,
}) {
  return (
    <View className="mb-5">
      <Text className="mb-2 text-sm font-bold text-ink">{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onBlur, onChange, value } }) => (
          <TextInput
            accessibilityLabel={label}
            aria-invalid={Boolean(error)}
            autoCapitalize={autoCapitalize}
            autoComplete={autoComplete}
            className={`${multiline ? "min-h-32 py-4" : "min-h-14"} rounded-2xl border bg-white px-4 text-base text-ink ${
              error ? "border-coral" : "border-line"
            }`}
            keyboardType={keyboardType}
            multiline={multiline}
            numberOfLines={numberOfLines}
            onBlur={onBlur}
            onChangeText={onChange}
            placeholderTextColor="#7D8A83"
            placeholder={placeholder}
            secureTextEntry={secureTextEntry}
            textContentType={textContentType}
            textAlignVertical={multiline ? "top" : "center"}
            value={value}
          />
        )}
      />
      {error ? (
        <Text className="mt-2 text-sm font-semibold text-coral">
          {error.message}
        </Text>
      ) : null}
    </View>
  );
}

export function ConsentField({ control, name, label, error }) {
  return (
    <View className="mb-4">
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, value } }) => (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: value }}
            className="min-h-12 flex-row items-center"
            onPress={() => onChange(!value)}
          >
            <View
              className={`mr-3 h-6 w-6 items-center justify-center rounded-md border ${
                value ? "border-leaf bg-leaf" : "border-line bg-white"
              }`}
            >
              {value ? <Text className="font-black text-white">✓</Text> : null}
            </View>
            <Text className="flex-1 text-sm leading-6 text-ink">{label}</Text>
          </Pressable>
        )}
      />
      {error ? (
        <Text className="ml-9 mt-1 text-sm font-semibold text-coral">
          {error.message}
        </Text>
      ) : null}
    </View>
  );
}

export function PrimaryButton({ children, disabled, loading, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      className={`min-h-14 items-center justify-center rounded-2xl px-5 ${
        disabled || loading ? "bg-muted" : "bg-pine"
      }`}
      disabled={disabled || loading}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text className="text-base font-black text-white">{children}</Text>
      )}
    </Pressable>
  );
}

export function FormNotice({ children, tone = "error" }) {
  const style =
    tone === "success"
      ? "border-mint bg-mint text-pine"
      : "border-coral bg-red-50 text-coral";

  return (
    <View
      accessibilityRole="alert"
      className={`mb-5 rounded-2xl border p-4 ${style}`}
    >
      <Text
        className={`text-sm font-semibold leading-6 ${tone === "success" ? "text-pine" : "text-coral"}`}
      >
        {children}
      </Text>
    </View>
  );
}
