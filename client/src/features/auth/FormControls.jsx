import { Controller } from "react-hook-form";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

export function FormField({
  allowPasswordReveal = false,
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
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <View className="mb-5">
      <Text className="mb-2 text-sm font-bold text-ink">{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onBlur, onChange, value } }) => (
          <View className="relative">
            <TextInput
              accessibilityLabel={label}
              aria-invalid={Boolean(error)}
              autoCapitalize={autoCapitalize}
              autoComplete={autoComplete}
              autoCorrect={!secureTextEntry}
              className={`${multiline ? "min-h-32 py-4" : "min-h-14"} rounded-2xl border bg-white px-4 text-base text-ink ${
                allowPasswordReveal ? "pr-14" : ""
              } ${error ? "border-coral" : "border-line"}`}
              keyboardType={keyboardType}
              multiline={multiline}
              numberOfLines={numberOfLines}
              onBlur={onBlur}
              onChangeText={onChange}
              placeholderTextColor="#7D8A83"
              placeholder={placeholder}
              secureTextEntry={secureTextEntry && !passwordVisible}
              textContentType={textContentType}
              textAlignVertical={multiline ? "top" : "center"}
              value={value}
            />
            {allowPasswordReveal ? (
              <Pressable
                accessibilityLabel={
                  passwordVisible ? "Hide password" : "Show password"
                }
                accessibilityRole="button"
                accessibilityState={{ expanded: passwordVisible }}
                className="absolute right-1 top-1 min-h-12 w-12 items-center justify-center rounded-xl"
                onPress={() => setPasswordVisible((visible) => !visible)}
              >
                <View className="h-4 w-6 items-center justify-center rounded-full border-2 border-leaf">
                  <View className="h-2 w-2 rounded-full bg-leaf" />
                  {!passwordVisible ? (
                    <View className="absolute h-0.5 w-7 rotate-45 bg-leaf" />
                  ) : null}
                </View>
              </Pressable>
            ) : null}
          </View>
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
