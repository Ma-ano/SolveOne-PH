import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { PageContainer } from "../../src/components/PageContainer";
import { FormNotice } from "../../src/features/auth/FormControls";
import { useAuth } from "../../src/features/auth/AuthContext";
import { ProfileNav } from "../../src/features/profile/ProfilePrimitives";
import { verificationApi } from "../../src/features/verification/verificationApi";

export default function IdentityReviewScreen() {
  const queryClient = useQueryClient();
  const { authenticatedRequest, status, user } = useAuth();
  const [busyId, setBusyId] = useState(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [previews, setPreviews] = useState({});
  const objectUrls = useRef(new Set());
  const canReview = ["moderator", "admin"].includes(user?.role);
  const queueQuery = useInfiniteQuery({
    queryKey: ["identity-review-queue"],
    queryFn: ({ pageParam }) =>
      verificationApi.queue(authenticatedRequest, {
        limit: 10,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled: status === "authenticated" && canReview && Platform.OS === "web",
  });
  const cases = queueQuery.data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
      objectUrls.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (status !== "authenticated" || !canReview) clearPreviews();
  }, [status, canReview]);

  function clearPreviews() {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
    setPreviews({});
  }

  async function claim(item) {
    setBusyId(item.id);
    setNotice("");
    clearPreviews();
    try {
      await verificationApi.claim(authenticatedRequest, item.id);
      await queryClient.invalidateQueries({
        queryKey: ["identity-review-queue"],
      });
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusyId(null);
    }
  }

  async function inspect(item, document) {
    setBusyId(item.id);
    setNotice("");
    try {
      const blob = await verificationApi.document(
        authenticatedRequest,
        item.id,
        document.id,
      );
      if (blob.size > 4 * 1024 * 1024)
        throw new Error("Document exceeds review size limit.");
      const url = URL.createObjectURL(
        new Blob([blob], { type: document.mimeType }),
      );
      objectUrls.current.add(url);
      setPreviews((current) => {
        if (current[document.id]) {
          URL.revokeObjectURL(current[document.id]);
          objectUrls.current.delete(current[document.id]);
        }
        return { ...current, [document.id]: url };
      });
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusyId(null);
    }
  }

  async function decide(item, decision) {
    const cleaned = reason.trim();
    if (
      decision === "reject" &&
      (cleaned.length < 10 || cleaned.length > 1000)
    ) {
      setNotice("Give specific private feedback of 10–1000 characters.");
      return;
    }
    setBusyId(item.id);
    setNotice("");
    try {
      await verificationApi.decide(
        authenticatedRequest,
        item.id,
        decision,
        cleaned,
      );
      clearPreviews();
      setReason("");
      await queryClient.invalidateQueries({
        queryKey: ["identity-review-queue"],
      });
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageContainer>
      <ProfileNav
        action={<Link href="/admin/requests">Request reviews</Link>}
      />
      <View className="w-full gap-6">
        <View>
          <Text className="text-xs font-bold uppercase tracking-widest text-coral">
            Restricted reviewer workspace
          </Text>
          <Text
            accessibilityRole="header"
            className="mt-3 text-page-title font-black text-ink md:text-page-title-lg"
          >
            Identity review queue
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            Claim a case before opening a private image. Review the person only;
            approval is a factual badge, not an endorsement. Do not download,
            share, or copy the images.
          </Text>
        </View>
        {status !== "authenticated" ? (
          <FormNotice>Moderator sign-in required.</FormNotice>
        ) : !canReview ? (
          <FormNotice>You do not have review permission.</FormNotice>
        ) : Platform.OS !== "web" ? (
          <FormNotice>
            Private identity review is available only in the restricted web
            reviewer workspace.
          </FormNotice>
        ) : (
          <>
            {notice ? <FormNotice>{notice}</FormNotice> : null}
            {queueQuery.error ? (
              <FormNotice>{queueQuery.error.message}</FormNotice>
            ) : null}
            {queueQuery.isLoading ? (
              <Text className="text-muted">Loading private queue…</Text>
            ) : null}
            {!queueQuery.isLoading && !cases.length ? (
              <Text className="text-muted">
                No identity cases currently await review.
              </Text>
            ) : null}
            {cases.map((item) => (
              <View
                className="rounded-3xl border border-line bg-surface p-6"
                key={item.id}
              >
                <Text className="text-xl font-black text-ink">
                  {item.owner?.displayName || "Member"}
                </Text>
                <Text className="mt-2 text-sm text-muted">
                  Submitted {new Date(item.submittedAt).toLocaleString()} ·{" "}
                  {item.documents.length} image
                  {item.documents.length === 1 ? "" : "s"}
                </Text>
                <Text className="mt-2 text-sm font-semibold text-leaf">
                  Claim: {item.claimState}
                </Text>
                {item.claimState === "available" ? (
                  <Pressable
                    accessibilityRole="button"
                    className="mt-4 min-h-12 justify-center self-start rounded-xl bg-pine px-5"
                    disabled={busyId === item.id}
                    onPress={() => claim(item)}
                  >
                    <Text className="font-black text-white">
                      Claim for review
                    </Text>
                  </Pressable>
                ) : null}
                {item.claimState === "mine" ? (
                  <>
                    <Text className="mt-3 text-xs text-muted">
                      Claim expires{" "}
                      {new Date(item.claimExpiresAt).toLocaleString()}; reload
                      and reclaim if needed.
                    </Text>
                    {item.documents.map((document, index) => (
                      <View className="mt-4" key={document.id}>
                        <Pressable
                          accessibilityRole="button"
                          className="min-h-12 justify-center self-start rounded-xl border border-leaf px-5"
                          disabled={busyId === item.id}
                          onPress={() => inspect(item, document)}
                        >
                          <Text className="font-bold text-leaf">
                            Inspect image {index + 1}
                          </Text>
                        </Pressable>
                        {previews[document.id] ? (
                          <Image
                            accessibilityLabel={`Private identity image ${index + 1}`}
                            className="mt-3 h-80 w-full rounded-xl"
                            resizeMode="contain"
                            source={{ uri: previews[document.id] }}
                          />
                        ) : null}
                      </View>
                    ))}
                    <Text className="mb-2 mt-5 font-bold text-ink">
                      Private rejection feedback
                    </Text>
                    <TextInput
                      accessibilityLabel="Identity rejection feedback"
                      className="min-h-28 rounded-xl border border-line bg-white p-3 text-ink"
                      multiline
                      onChangeText={setReason}
                      placeholder="Explain specifically what needs correction."
                      value={reason}
                    />
                    <View className="mt-4 flex-row flex-wrap gap-3">
                      <Pressable
                        accessibilityRole="button"
                        className="min-h-12 justify-center rounded-xl bg-pine px-5"
                        disabled={busyId === item.id}
                        onPress={() => decide(item, "approve")}
                      >
                        <Text className="font-black text-white">
                          Approve identity
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        className="min-h-12 justify-center rounded-xl border border-coral px-5"
                        disabled={busyId === item.id}
                        onPress={() => decide(item, "reject")}
                      >
                        <Text className="font-black text-coral">
                          Reject with feedback
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}
              </View>
            ))}
            {queueQuery.hasNextPage ? (
              <Pressable
                accessibilityRole="button"
                className="min-h-12 justify-center"
                onPress={() => queueQuery.fetchNextPage()}
              >
                <Text className="font-bold text-leaf">Load more cases</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </PageContainer>
  );
}
