import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";

export function ConfirmationDialog({
  cancelLabel = "Go back",
  confirmLabel = "Confirm",
  error,
  message,
  onCancel,
  onConfirm,
  open,
  pending,
  title,
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={pending ? undefined : onCancel}
      transparent
      visible={open}
    >
      <View className="flex-1 items-center justify-center bg-black/50 px-4">
        <View
          accessibilityRole="alert"
          className="w-full max-w-lg rounded-3xl border border-line bg-white p-6 shadow-lg md:p-8"
        >
          <Text className="text-2xl font-black text-ink">{title}</Text>
          <Text className="mt-3 text-base leading-7 text-muted">{message}</Text>
          {error ? (
            <View className="mt-5 rounded-2xl border border-coral bg-red-50 p-4">
              <Text className="text-sm font-semibold text-coral">{error}</Text>
            </View>
          ) : null}
          <View className="mt-7 gap-3 sm:flex-row sm:justify-end">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: pending }}
              className="min-h-12 items-center justify-center rounded-2xl border border-line px-5"
              disabled={pending}
              onPress={onCancel}
            >
              <Text className="font-black text-leaf">{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: pending, disabled: pending }}
              className="min-h-12 items-center justify-center rounded-2xl bg-coral px-5"
              disabled={pending}
              onPress={onConfirm}
            >
              {pending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="font-black text-white">{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
