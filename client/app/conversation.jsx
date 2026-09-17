import { zodResolver } from "@hookform/resolvers/zod";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Pressable, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { AuthLink } from "../src/features/auth/AuthShell";
import { useAuth } from "../src/features/auth/AuthContext";
import {
  FormField,
  FormNotice,
  PrimaryButton,
} from "../src/features/auth/FormControls";
import {
  DigitalAlalayWarning,
  MessageBubble,
  reportReasons,
} from "../src/features/messaging/MessagingPrimitives";
import {
  createClientMessageId,
  messagingApi,
} from "../src/features/messaging/messagingApi";
import { useRealtime } from "../src/features/messaging/RealtimeContext";
import { messageFormSchema } from "../src/features/messaging/schemas";
import { RequestNav } from "../src/features/requests/RequestPrimitives";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const messageableStatuses = [
  "accepted",
  "in_progress",
  "completion_submitted",
  "disputed",
];

export default function ConversationScreen() {
  const params = useLocalSearchParams();
  const queryClient = useQueryClient();
  const { authenticatedRequest, status } = useAuth();
  const realtime = useRealtime();
  const [notice, setNotice] = useState(null);
  const [reportingMessage, setReportingMessage] = useState(null);
  const readMessageRef = useRef(null);
  const pendingSendRef = useRef(null);
  const conversationId =
    typeof params.conversationId === "string" ? params.conversationId : "";
  const validId = objectIdPattern.test(conversationId);
  const conversationQuery = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () =>
      messagingApi.getConversation(authenticatedRequest, conversationId),
    enabled: status === "authenticated" && validId,
  });
  const messagesQuery = useInfiniteQuery({
    queryKey: ["conversation-messages", conversationId],
    queryFn: ({ pageParam }) =>
      messagingApi.listMessages(authenticatedRequest, conversationId, {
        limit: 30,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled: status === "authenticated" && validId,
  });
  const newestFirst =
    messagesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const messages = [...newestFirst].reverse();
  const conversation =
    conversationQuery.data?.conversation ??
    messagesQuery.data?.pages[0]?.conversation;
  const form = useForm({
    resolver: zodResolver(messageFormSchema),
    defaultValues: { content: "" },
  });

  useEffect(() => {
    readMessageRef.current = null;
    pendingSendRef.current = null;
    setNotice(null);
    setReportingMessage(null);
  }, [conversationId]);

  useEffect(() => {
    if (realtime.status !== "connected" || !validId) {
      return;
    }
    realtime.joinConversation(conversationId).catch(() => {
      setNotice(
        "Realtime updates are unavailable; manual refresh still works.",
      );
    });
  }, [conversationId, realtime, validId]);

  const newestReadThroughMessage = newestFirst[0];
  useEffect(() => {
    if (
      !newestReadThroughMessage ||
      newestReadThroughMessage.id === readMessageRef.current
    ) {
      return;
    }
    readMessageRef.current = newestReadThroughMessage.id;
    messagingApi
      .markRead(
        authenticatedRequest,
        conversationId,
        newestReadThroughMessage.id,
      )
      .then(() =>
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
      )
      .catch(() => {
        readMessageRef.current = null;
      });
  }, [
    authenticatedRequest,
    conversationId,
    newestReadThroughMessage,
    queryClient,
  ]);

  async function send(values) {
    setNotice(null);
    try {
      const content = values.content.trim();
      if (pendingSendRef.current?.content !== content) {
        pendingSendRef.current = {
          content,
          clientMessageId: createClientMessageId(),
        };
      }
      const result = await messagingApi.sendText(
        authenticatedRequest,
        conversationId,
        {
          type: "text",
          content,
          clientMessageId: pendingSendRef.current.clientMessageId,
        },
      );
      pendingSendRef.current = null;
      form.reset();
      setNotice(result.safetyGuidance);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["conversation-messages", conversationId],
        }),
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
      ]);
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function report(reason) {
    if (!reportingMessage) {
      return;
    }
    try {
      await messagingApi.reportMessage(
        authenticatedRequest,
        reportingMessage.id,
        { reason },
      );
      setReportingMessage(null);
      Alert.alert(
        "Report received",
        "Your report was saved for an authorized safety review.",
      );
    } catch (error) {
      Alert.alert("Report could not be sent", error.message);
    }
  }

  if (status !== "authenticated") {
    return (
      <PageContainer>
        <RequestNav />
        <View className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-surface p-8">
          <Text className="text-3xl font-black text-ink">
            Sign in to open this conversation
          </Text>
          <View className="mt-5">
            <AuthLink href="/login">Continue to sign in</AuthLink>
          </View>
        </View>
      </PageContainer>
    );
  }

  if (!validId) {
    return (
      <PageContainer>
        <RequestNav />
        <FormNotice>This conversation link is invalid.</FormNotice>
      </PageContainer>
    );
  }

  const canSend =
    conversation?.status === "active" &&
    messageableStatuses.includes(conversation.offerStatus);

  return (
    <PageContainer>
      <RequestNav />
      {conversationQuery.error || messagesQuery.error ? (
        <FormNotice>
          {conversationQuery.error?.message ?? messagesQuery.error?.message}
        </FormNotice>
      ) : null}
      {conversation ? (
        <View className="mb-5 rounded-3xl border border-line bg-surface p-6">
          <Text className="text-xs font-bold uppercase tracking-widest text-coral">
            Help conversation · {realtime.status}
          </Text>
          <Text className="mt-3 text-3xl font-black tracking-tight text-ink">
            {conversation.otherParticipant?.displayName ?? "Help participant"}
          </Text>
          <Text className="mt-2 leading-7 text-muted">
            {conversation.request?.title ?? "Help request"}
          </Text>
          <Pressable
            accessibilityRole="button"
            className="mt-4 min-h-12 justify-center self-start rounded-xl border border-leaf px-4"
            onPress={() => {
              conversationQuery.refetch();
              messagesQuery.refetch();
            }}
          >
            <Text className="text-sm font-black text-leaf">
              Refresh messages
            </Text>
          </Pressable>
        </View>
      ) : null}
      <DigitalAlalayWarning notice={conversation?.safetyNotice} />
      {messagesQuery.hasNextPage ? (
        <Pressable
          accessibilityRole="button"
          className="mx-auto my-5 min-h-12 justify-center rounded-xl border border-leaf px-5"
          onPress={() => messagesQuery.fetchNextPage()}
        >
          <Text className="font-black text-leaf">Load older messages</Text>
        </Pressable>
      ) : null}
      {messagesQuery.isLoading ? (
        <Text className="py-12 text-center font-semibold text-muted">
          Loading messages…
        </Text>
      ) : null}
      {!messagesQuery.isLoading && !messages.length ? (
        <View className="my-5 rounded-3xl border border-line bg-surface p-6">
          <Text className="text-xl font-black text-ink">No messages yet</Text>
          <Text className="mt-2 leading-7 text-muted">
            Keep coordination specific to the accepted offer and meet in a safe,
            public place when in-person help is needed.
          </Text>
        </View>
      ) : null}
      <View className="my-5 gap-3">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onReport={setReportingMessage}
          />
        ))}
      </View>
      {reportingMessage ? (
        <View className="mb-5 rounded-3xl border border-coral bg-red-50 p-5">
          <Text className="font-black text-ink">
            Why are you reporting this?
          </Text>
          <Text className="mt-1 text-sm leading-6 text-muted">
            This report identifies the selected message. Other private messages
            remain private.
          </Text>
          <View className="mt-4 flex-row flex-wrap gap-2">
            {reportReasons.map(([reason, label]) => (
              <Pressable
                accessibilityRole="button"
                className="min-h-12 justify-center rounded-xl border border-coral bg-white px-4"
                key={reason}
                onPress={() => report(reason)}
              >
                <Text className="text-sm font-bold text-coral">{label}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              className="min-h-12 justify-center px-4"
              onPress={() => setReportingMessage(null)}
            >
              <Text className="text-sm font-bold text-muted">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {notice ? <FormNotice>{notice}</FormNotice> : null}
      {canSend ? (
        <View className="rounded-3xl border border-line bg-surface p-5">
          <FormField
            control={form.control}
            name="content"
            label="Message"
            error={form.formState.errors.content}
            autoCapitalize="sentences"
            multiline
            numberOfLines={4}
            placeholder="Coordinate this accepted offer…"
          />
          <PrimaryButton
            loading={form.formState.isSubmitting}
            onPress={form.handleSubmit(send)}
          >
            Send message
          </PrimaryButton>
        </View>
      ) : conversation ? (
        <FormNotice>
          This conversation is read-only because the help relationship is no
          longer eligible for messaging.
        </FormNotice>
      ) : null}
    </PageContainer>
  );
}
