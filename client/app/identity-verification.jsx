import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { AuthLink } from "../src/features/auth/AuthShell";
import { FormNotice } from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import { ProfileNav } from "../src/features/profile/ProfilePrimitives";
import { verificationApi } from "../src/features/verification/verificationApi";

const allowedTypes = Object.freeze({
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
});

function fileType(file) {
  return allowedTypes[file.name?.split(".").at(-1)?.toLowerCase()] || "";
}

function Action({ children, onPress, disabled, secondary = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      className={`min-h-12 justify-center rounded-xl px-5 ${secondary ? "border border-leaf" : "bg-pine"}`}
      disabled={disabled}
      onPress={onPress}
    >
      <Text className={`font-black ${secondary ? "text-leaf" : "text-white"}`}>
        {children}
      </Text>
    </Pressable>
  );
}

export default function IdentityVerificationScreen() {
  const queryClient = useQueryClient();
  const { authenticatedRequest, status } = useAuth();
  const [acknowledged, setAcknowledged] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploadIds, setUploadIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const requirementsQuery = useQuery({
    queryKey: ["identity-requirements"],
    queryFn: () => verificationApi.requirements(authenticatedRequest),
    enabled: status === "authenticated",
  });
  const ownQuery = useQuery({
    queryKey: ["identity-own"],
    queryFn: () => verificationApi.mine(authenticatedRequest),
    enabled: status === "authenticated",
  });
  const requirements = requirementsQuery.data;
  const own = ownQuery.data?.verification;

  useEffect(() => {
    if (own?.status === "approved") {
      queryClient.invalidateQueries({ queryKey: ["private-profile"] });
    }
  }, [own?.status, queryClient]);

  useEffect(() => {
    setAcknowledged(false);
    setFiles([]);
    setUploadIds([]);
  }, [requirements?.privacyNoticeVersion]);

  useEffect(
    () => () => {
      if (Platform.OS === "web" || !files.length) return;
      import("expo-file-system")
        .then(({ File, Paths }) => {
          for (const picked of files) {
            if (picked.uri?.startsWith(Paths.cache.uri)) {
              const cached = new File(picked.uri);
              if (cached.exists) cached.delete();
            }
          }
        })
        .catch(() => {
          // Picker cache deletion is best-effort; the OS eventually evicts it.
        });
    },
    [files],
  );

  async function pickNative() {
    try {
      const DocumentPicker = await import("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/png"],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      setFiles(result.assets);
      setUploadIds([]);
      setNotice("");
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function submit() {
    if (!requirements?.enabled || !requirements.eligible || !acknowledged) {
      setNotice(
        "Read and acknowledge the current identity privacy notice first.",
      );
      return;
    }
    if (files.length < 1 || files.length > requirements.maxFiles) {
      setNotice("Choose one or two identity images.");
      return;
    }
    if (
      files.some(
        (file) => !fileType(file) || file.size > requirements.maxFileBytes,
      )
    ) {
      setNotice("Use JPEG or PNG images, each no larger than 4 MB.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const ids = [...uploadIds];
      for (let index = 0; index < files.length; index += 1) {
        if (ids[index]) continue;
        const file = files[index];
        let localFile = file;
        if (file.uri) {
          const { File } = await import("expo-file-system");
          localFile = new File(file.uri);
        }
        if (localFile.size > requirements.maxFileBytes)
          throw new Error(`${file.name} exceeds the 4 MB limit.`);
        const bytes =
          Platform.OS === "web"
            ? new Uint8Array(await localFile.arrayBuffer())
            : localFile;
        const result = await verificationApi.upload(
          authenticatedRequest,
          bytes,
          fileType(file),
          requirements.privacyNoticeVersion,
        );
        ids[index] = result.upload.id;
        setUploadIds([...ids]);
      }
      await verificationApi.submit(authenticatedRequest, ids);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["identity-own"] }),
        queryClient.invalidateQueries({ queryKey: ["identity-requirements"] }),
      ]);
      if (Platform.OS !== "web") {
        try {
          const { File, Paths } = await import("expo-file-system");
          for (const picked of files) {
            if (picked.uri?.startsWith(Paths.cache.uri)) {
              const cached = new File(picked.uri);
              if (cached.exists) cached.delete();
            }
          }
        } catch {
          // The OS will eventually evict a cached picker copy.
        }
      }
      setFiles([]);
      setUploadIds([]);
      setAcknowledged(false);
      setNotice(
        "Identity review submitted. Only an assigned reviewer may inspect the images.",
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
        <ProfileNav />
        <FormNotice>
          Sign in to view your private identity review status.
        </FormNotice>
        <AuthLink href="/login">Continue to sign in</AuthLink>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <ProfileNav action={<Link href="/profile">Back to profile</Link>} />
      <View className="w-full gap-6">
        <View>
          <Text className="text-xs font-bold uppercase tracking-widest text-coral">
            Optional private review
          </Text>
          <Text
            accessibilityRole="header"
            className="mt-3 text-4xl font-black text-ink"
          >
            Identity verification
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            This badge records that a human reviewed your identity images. It is
            not an endorsement, safety guarantee, or public copy of your ID.
          </Text>
        </View>
        {ownQuery.error ? (
          <FormNotice>{ownQuery.error.message}</FormNotice>
        ) : null}
        {requirementsQuery.error ? (
          <FormNotice>{requirementsQuery.error.message}</FormNotice>
        ) : null}
        {notice ? <FormNotice>{notice}</FormNotice> : null}
        {own ? (
          <View className="rounded-3xl border border-line bg-surface p-6">
            <Text className="text-xl font-black text-ink">
              Latest review: {own.status.replaceAll("_", " ")}
            </Text>
            <Text className="mt-2 text-sm text-muted">
              Submitted {new Date(own.submittedAt).toLocaleDateString()}
            </Text>
            {own.rejectionReason ? (
              <Text className="mt-3 leading-6 text-coral">
                Reviewer feedback: {own.rejectionReason}
              </Text>
            ) : null}
            <Text className="mt-3 text-xs leading-5 text-muted">
              {own.documentsPurgedAt
                ? "The uploaded images were deleted from private storage."
                : "Images are queued for deletion after a decision; unreviewed cases expire after 30 days."}
            </Text>
          </View>
        ) : null}
        {!requirements?.enabled ? (
          <FormNotice>
            Identity submissions are currently closed. No ID images can be
            uploaded.
          </FormNotice>
        ) : !requirements.eligible ? (
          <FormNotice>
            Your account is not currently eligible for another identity
            submission. Verify your email first, or wait for your pending
            review.
          </FormNotice>
        ) : (
          <View className="rounded-3xl border border-line bg-surface p-6 md:p-9">
            <Text className="text-2xl font-black text-ink">
              Before uploading
            </Text>
            <Text className="mt-3 leading-7 text-muted">
              {requirements.purpose}
            </Text>
            <Pressable
              accessibilityRole="link"
              className="mt-4 min-h-12 justify-center"
              onPress={() =>
                Linking.openURL(requirements.privacyNoticeUrl).catch((error) =>
                  setNotice(error.message),
                )
              }
            >
              <Text className="font-bold text-leaf">
                Read the identity privacy notice (version{" "}
                {requirements.privacyNoticeVersion})
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acknowledged }}
              className="my-5 min-h-12 justify-center rounded-xl border border-line p-3"
              disabled={busy}
              onPress={() => {
                if (acknowledged) {
                  setFiles([]);
                  setUploadIds([]);
                }
                setAcknowledged((current) => !current);
              }}
            >
              <Text className="font-semibold text-ink">
                {acknowledged ? "☑" : "☐"} I have read and acknowledge this
                notice for optional identity review.
              </Text>
            </Pressable>
            {acknowledged ? (
              Platform.OS === "web" ? (
                <input
                  accept="image/jpeg,image/png"
                  aria-label="Choose one or two identity images"
                  multiple
                  onChange={(event) => {
                    setFiles(Array.from(event.target.files ?? []));
                    setUploadIds([]);
                    setNotice("");
                  }}
                  type="file"
                />
              ) : (
                <Action onPress={pickNative} disabled={busy} secondary>
                  Choose identity images
                </Action>
              )
            ) : null}
            {files.length ? (
              <Text className="mt-4 text-sm text-muted">
                {files.length} image{files.length === 1 ? "" : "s"} selected
              </Text>
            ) : null}
            <View className="mt-6 self-start">
              <Action
                onPress={submit}
                disabled={!acknowledged || busy || !files.length}
              >
                {busy ? "Submitting securely…" : "Submit for private review"}
              </Action>
            </View>
          </View>
        )}
      </View>
    </PageContainer>
  );
}
