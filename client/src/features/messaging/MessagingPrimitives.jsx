import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { humanize } from "../requests/RequestPrimitives";

export function DigitalAlalayWarning({ notice }) {
  if (!notice) {
    return null;
  }
  return (
    <View
      accessibilityRole="alert"
      className="rounded-2xl border border-mango bg-amber-50 p-4"
    >
      <Text className="font-black text-ink">Digital Alalay safety rule</Text>
      <Text className="mt-2 text-sm font-semibold leading-6 text-muted">
        {notice}
      </Text>
    </View>
  );
}

export function ConversationCard({ conversation }) {
  return (
    <Link
      href={{
        pathname: "/conversation",
        params: { conversationId: conversation.id },
      }}
      asChild
    >
      <Pressable
        accessibilityRole="link"
        className="rounded-3xl border border-line bg-surface p-5"
      >
        <View className="flex-row flex-wrap items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-lg font-black text-ink">
              {conversation.otherParticipant?.displayName ?? "Help participant"}
            </Text>
            <Text className="mt-1 text-sm leading-6 text-muted">
              {conversation.request?.title ?? "Help request"}
            </Text>
          </View>
          {conversation.unreadCount ? (
            <View className="min-w-8 rounded-full bg-coral px-2 py-1">
              <Text className="text-center text-xs font-black text-white">
                {conversation.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
        <View className="mt-4 flex-row flex-wrap gap-2">
          <View className="rounded-full bg-mint px-3 py-2">
            <Text className="text-xs font-bold text-pine">
              {humanize(conversation.offerStatus ?? conversation.status)}
            </Text>
          </View>
          {conversation.isDigitalAlalay ? (
            <View className="rounded-full bg-amber-100 px-3 py-2">
              <Text className="text-xs font-bold text-ink">Digital Alalay</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

export function MessageBubble({ message, onReport }) {
  return (
    <View className={`max-w-2xl ${message.isMine ? "self-end" : "self-start"}`}>
      <View
        className={`rounded-3xl px-5 py-4 ${
          message.isMine ? "bg-pine" : "border border-line bg-white"
        }`}
      >
        {!message.isMine ? (
          <Text className="mb-1 text-xs font-black text-leaf">
            {message.sender?.displayName ?? "Participant"}
          </Text>
        ) : null}
        <Text
          className={`leading-6 ${message.isMine ? "text-white" : "text-ink"}`}
        >
          {message.content ?? "Message removed"}
        </Text>
      </View>
      {message.requiresCaution ? (
        <Text className="mt-1 text-xs font-bold text-coral">
          Caution: this message may request sensitive information or unsafe
          payment.
        </Text>
      ) : null}
      {!message.isMine ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-11 justify-center self-start px-2"
          onPress={() => onReport(message)}
        >
          <Text className="text-xs font-bold text-coral">Report message</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const reportReasons = Object.freeze([
  ["credential_request", "Credentials / OTP"],
  ["suspicious_payment", "Unsafe payment"],
  ["harassment", "Harassment"],
  ["spam", "Spam"],
  ["other", "Other safety issue"],
]);
