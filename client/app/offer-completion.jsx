import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { AuthLink } from "../src/features/auth/AuthShell";
import { FormNotice } from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import {
  createOfferOperationKey,
  offerApi,
} from "../src/features/offers/offerApi";
import {
  RequestNav,
  StatusBadge,
} from "../src/features/requests/RequestPrimitives";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const proofTypes = Object.freeze({
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
});

function proofMimeType(file) {
  const extension = `.${file.name?.split(".").at(-1)?.toLowerCase()}`;
  return file.type || file.mimeType || proofTypes[extension] || "";
}

function Action({ children, onPress, disabled, secondary = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`min-h-12 justify-center rounded-xl px-5 ${secondary ? "border border-coral" : "bg-pine"}`}
    >
      <Text className={`font-black ${secondary ? "text-coral" : "text-white"}`}>
        {children}
      </Text>
    </Pressable>
  );
}

export default function OfferCompletionScreen() {
  const params = useLocalSearchParams();
  const queryClient = useQueryClient();
  const { authenticatedRequest, status } = useAuth();
  const offerId = typeof params.offerId === "string" ? params.offerId : "";
  const requestId =
    typeof params.requestId === "string" ? params.requestId : "";
  const perspective = params.perspective === "owner" ? "owner" : "helper";
  const helpType = typeof params.helpType === "string" ? params.helpType : "";
  const initialStatus =
    typeof params.offerStatus === "string" ? params.offerStatus : "";
  const [offerStatus, setOfferStatus] = useState(initialStatus);
  const [note, setNote] = useState("");
  const [actualMinutes, setActualMinutes] = useState("");
  const [reason, setReason] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadedFileIds, setUploadedFileIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const validId = objectIdPattern.test(offerId);
  const evidenceQuery = useQuery({
    queryKey: ["completion-evidence", offerId],
    queryFn: () => offerApi.evidence(authenticatedRequest, offerId),
    enabled:
      status === "authenticated" &&
      validId &&
      (perspective === "owner" || offerStatus !== "in_progress"),
  });
  const evidence = evidenceQuery.data?.evidence;
  const displayStatus = evidence?.confirmedAt
    ? "completed"
    : evidence?.disputedAt
      ? "disputed"
      : offerStatus;

  async function refresh(requestStatus) {
    setOfferStatus(requestStatus);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["my-offers"] }),
      queryClient.invalidateQueries({
        queryKey: ["request-offers", requestId],
      }),
      queryClient.invalidateQueries({ queryKey: ["owned-request", requestId] }),
      queryClient.invalidateQueries({
        queryKey: ["public-request", requestId],
      }),
      queryClient.invalidateQueries({ queryKey: ["my-requests"] }),
      queryClient.invalidateQueries({
        queryKey: ["completion-evidence", offerId],
      }),
      queryClient.invalidateQueries({ queryKey: ["platform-impact"] }),
      queryClient.invalidateQueries({ queryKey: ["user-impact"] }),
    ]);
  }

  async function submit() {
    const cleaned = note.trim();
    if (cleaned.length < 10 || cleaned.length > 2000) {
      setNotice("Write a private completion note of 10–2000 characters.");
      return;
    }
    const minutes = actualMinutes.trim();
    if (
      minutes &&
      (!/^\d+$/.test(minutes) || Number(minutes) < 1 || Number(minutes) > 10080)
    ) {
      setNotice(
        "Actual time must be a whole number between 1 and 10080 minutes.",
      );
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const ids = [...uploadedFileIds];
      for (let index = 0; index < selectedFiles.length; index += 1) {
        if (ids[index]) continue;
        const file = selectedFiles[index];
        if (file.size && file.size > 5 * 1024 * 1024)
          throw new Error(`${file.name} exceeds the 5 MB private proof limit.`);
        let localFile = file;
        if (file.uri) {
          const { File } = await import("expo-file-system");
          localFile = new File(file.uri);
        }
        if (localFile.size > 5 * 1024 * 1024)
          throw new Error(`${file.name} exceeds the 5 MB private proof limit.`);
        const uploaded = await offerApi.uploadFile(
          authenticatedRequest,
          offerId,
          {
            bytes:
              Platform.OS === "web"
                ? new Uint8Array(await localFile.arrayBuffer())
                : localFile,
            name: file.name,
            mimeType: proofMimeType(file),
          },
        );
        ids[index] = uploaded.file.id;
        setUploadedFileIds([...ids]);
      }
      await offerApi.complete(authenticatedRequest, offerId, {
        note: cleaned,
        ...(minutes && ["skill", "time"].includes(helpType)
          ? { actualMinutes: Number(minutes) }
          : {}),
        fileIds: ids,
      });
      await refresh("completion_submitted");
      if (Platform.OS !== "web") {
        try {
          const { File, Paths } = await import("expo-file-system");
          for (const picked of selectedFiles) {
            if (picked.uri?.startsWith(Paths.cache.uri)) {
              const cached = new File(picked.uri);
              if (cached.exists) cached.delete();
            }
          }
        } catch {
          // The OS cache will eventually evict a copy if immediate cleanup fails.
        }
      }
      setSelectedFiles([]);
      setNotice(
        "Completion submitted. It remains reserved until the requester confirms it.",
      );
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function pickNativeProofs() {
    setNotice("");
    try {
      const DocumentPicker = await import("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      if (result.assets.length > 4) {
        setNotice("Choose no more than four private proof files.");
        return;
      }
      setSelectedFiles(result.assets);
      setUploadedFileIds([]);
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function openNativeProof(file) {
    let cached;
    try {
      const Sharing = await import("expo-sharing");
      if (!(await Sharing.isAvailableAsync())) {
        setNotice(
          "This device cannot open private proof files through the system share sheet.",
        );
        return;
      }
      const { File, Paths } = await import("expo-file-system");
      const blob = await offerApi.downloadFile(
        authenticatedRequest,
        offerId,
        file.id,
      );
      if (blob.size > 5 * 1024 * 1024)
        throw new Error("Private proof is too large to open.");
      const extension =
        Object.entries(proofTypes).find(
          ([, mime]) => mime === file.mimeType,
        )?.[0] ?? ".bin";
      cached = new File(Paths.cache, `private-proof-${file.id}${extension}`);
      cached.write(new Uint8Array(await blob.arrayBuffer()));
      await Sharing.shareAsync(cached.uri, {
        mimeType: file.mimeType,
        dialogTitle: "Open private completion proof",
      });
    } catch (error) {
      setNotice(error.message);
    } finally {
      if (cached)
        setTimeout(() => {
          try {
            if (cached.exists) cached.delete();
          } catch {
            // An OS cache copy may remain until system eviction.
          }
        }, 60000);
    }
  }

  async function download(file) {
    if (Platform.OS !== "web") {
      Alert.alert(
        "Private completion proof",
        "The system share sheet can send this file to other apps. Do not publish it without everyone’s consent.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Continue", onPress: () => openNativeProof(file) },
        ],
      );
      return;
    }
    try {
      const blob = await offerApi.downloadFile(
        authenticatedRequest,
        offerId,
        file.id,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function decide(operation) {
    if (
      operation === "dispute" &&
      (reason.trim().length < 10 || reason.trim().length > 2000)
    ) {
      setNotice("Explain the concern in 10–2000 characters.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      if (operation === "confirm") {
        await offerApi.confirm(
          authenticatedRequest,
          offerId,
          createOfferOperationKey("confirm", offerId),
        );
      } else {
        await offerApi.dispute(authenticatedRequest, offerId, reason.trim());
      }
      await refresh(operation === "confirm" ? "completed" : "disputed");
      setNotice(
        operation === "confirm"
          ? "Completion confirmed. Solved progress and impact were updated by the server."
          : "Dispute recorded. This does not count as solved help.",
      );
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (status !== "authenticated") {
    return (
      <PageContainer>
        <RequestNav />
        <FormNotice>Sign in to review private completion evidence.</FormNotice>
        <AuthLink href="/login">Continue to sign in</AuthLink>
      </PageContainer>
    );
  }
  if (!validId)
    return (
      <PageContainer>
        <RequestNav />
        <FormNotice>Invalid offer link.</FormNotice>
      </PageContainer>
    );

  return (
    <PageContainer>
      <RequestNav />
      <View className="w-full rounded-3xl border border-line bg-surface p-6 md:p-8">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Private completion review
        </Text>
        <Text className="mt-3 text-3xl font-black text-ink">
          Assistance evidence
        </Text>
        <View className="mt-4">
          <StatusBadge status={displayStatus} />
        </View>
        <Text className="mt-4 leading-7 text-muted">
          A submitted offer stays reserved. Only requester confirmation moves it
          into solved progress. Do not share recipient photos publicly or
          include account credentials in evidence.
        </Text>
        {notice ? (
          <View className="mt-5">
            <FormNotice>{notice}</FormNotice>
          </View>
        ) : null}
        {evidenceQuery.error && offerStatus !== "in_progress" ? (
          <View className="mt-5">
            <FormNotice>{evidenceQuery.error.message}</FormNotice>
          </View>
        ) : null}
        {evidence ? (
          <View className="mt-6 rounded-2xl border border-line bg-white p-5">
            <Text className="text-sm font-black text-ink">
              Helper’s private note
            </Text>
            <Text className="mt-3 leading-7 text-muted">{evidence.note}</Text>
            {evidence.actualMinutes ? (
              <Text className="mt-3 text-sm font-semibold text-leaf">
                Actual time reviewed: {evidence.actualMinutes} minutes
              </Text>
            ) : null}
            {evidence.files?.map((file) => (
              <Pressable
                key={file.id}
                accessibilityRole="button"
                onPress={() => download(file)}
                className="mt-3 min-h-12 justify-center rounded-xl border border-leaf px-4"
              >
                <Text className="font-bold text-leaf">
                  Download private proof: {file.name}
                </Text>
              </Pressable>
            ))}
            {evidence.disputeReason ? (
              <Text className="mt-3 leading-6 text-coral">
                Dispute: {evidence.disputeReason}
              </Text>
            ) : null}
            <Text className="mt-3 text-xs font-semibold text-muted">
              Evidence is visible only to the helper and requester.
            </Text>
          </View>
        ) : null}
        {perspective === "helper" && offerStatus === "in_progress" ? (
          <View className="mt-6 gap-4">
            <Text className="font-black text-ink">
              What was actually delivered?
            </Text>
            <TextInput
              accessibilityLabel="Completion note"
              multiline
              value={note}
              onChangeText={setNote}
              placeholder="Describe the completed assistance and how the requester can verify it"
              className="min-h-32 rounded-xl border border-line bg-white p-4 text-ink"
            />
            {Platform.OS === "web" ? (
              <View className="rounded-xl border border-line bg-white p-4">
                <Text className="mb-3 font-black text-ink">
                  Optional private photos or receipts (up to four, 5 MB each)
                </Text>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) => {
                    setSelectedFiles(
                      Array.from(event.target.files ?? []).slice(0, 4),
                    );
                    setUploadedFileIds([]);
                  }}
                />
                {selectedFiles.length ? (
                  <Text className="mt-3 text-sm text-muted">
                    {selectedFiles.map((file) => file.name).join(", ")}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View className="gap-3 rounded-xl border border-line bg-white p-4">
                <Text className="font-black text-ink">
                  Optional private photos or receipts (up to four, 5 MB each)
                </Text>
                <Action secondary onPress={pickNativeProofs}>
                  Choose private proof files
                </Action>
                {selectedFiles.length ? (
                  <Text className="text-sm text-muted">
                    {selectedFiles.map((file) => file.name).join(", ")}
                  </Text>
                ) : null}
              </View>
            )}
            {["skill", "time"].includes(helpType) ? (
              <>
                <Text className="font-black text-ink">
                  Actual minutes volunteered (optional, requester verifies)
                </Text>
                <TextInput
                  accessibilityLabel="Actual minutes volunteered"
                  keyboardType="number-pad"
                  value={actualMinutes}
                  onChangeText={setActualMinutes}
                  placeholder="e.g. 90"
                  className="min-h-12 rounded-xl border border-line bg-white p-4 text-ink"
                />
              </>
            ) : null}
            <Action disabled={busy} onPress={submit}>
              Submit for requester review
            </Action>
          </View>
        ) : null}
        {perspective === "owner" &&
        displayStatus === "completion_submitted" &&
        evidence ? (
          <View className="mt-6 gap-4">
            <Text className="leading-6 text-muted">
              Confirm only if the agreed help was delivered. Dispute if the
              evidence or delivery is incorrect.
            </Text>
            <Action disabled={busy} onPress={() => decide("confirm")}>
              Confirm delivered help
            </Action>
            <TextInput
              accessibilityLabel="Dispute reason"
              multiline
              value={reason}
              onChangeText={setReason}
              placeholder="Explain what was not delivered or is incorrect"
              className="min-h-24 rounded-xl border border-line bg-white p-4 text-ink"
            />
            <Action disabled={busy} secondary onPress={() => decide("dispute")}>
              Dispute completion
            </Action>
          </View>
        ) : null}
        <View className="mt-8">
          <Link
            href={
              perspective === "owner"
                ? { pathname: "/request-offers", params: { requestId } }
                : "/my-offers"
            }
            asChild
          >
            <Pressable
              accessibilityRole="link"
              className="min-h-12 justify-center"
            >
              <Text className="font-black text-leaf">Back to offers</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </PageContainer>
  );
}
