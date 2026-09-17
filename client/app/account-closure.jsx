import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  View,
} from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { AuthLink } from "../src/features/auth/AuthShell";
import {
  ConsentField,
  FormField,
  FormNotice,
  PrimaryButton,
} from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import { profileApi } from "../src/features/profile/profileApi";
import { ProfileNav } from "../src/features/profile/ProfilePrimitives";
import { accountClosureFormSchema } from "../src/features/profile/schemas";

const blockerDetails = Object.freeze({
  help_requests: {
    label: "Cancel or finish your active help requests.",
    href: "/my-requests",
  },
  help_offers: {
    label:
      "Withdraw pending offers or resolve accepted work with the request owner or support.",
    href: "/my-offers",
  },
  giveaway_items: {
    label: "Remove or finish your active giveaway listings.",
    href: "/my-giveaways",
  },
  giveaway_reservations: {
    label: "Cancel or complete your active giveaway handoffs.",
    href: "/giveaway-handoffs",
  },
  community_missions: {
    label: "Cancel or finish your active community missions.",
    href: "/my-missions",
  },
  mission_contributions: {
    label: "Withdraw or finish your active mission contributions.",
    href: "/mission-contributions",
  },
  staff_account: {
    label: "Staff accounts require administrator-managed offboarding.",
    href: null,
  },
});

function ClosureBlockers({ blockers }) {
  if (!blockers?.length) return null;

  return (
    <View className="rounded-3xl border border-coral bg-red-50 p-6">
      <Text className="text-lg font-black text-coral">
        Resolve these items first
      </Text>
      <View className="mt-3 gap-3">
        {blockers.map((code) => {
          const detail = blockerDetails[code] ?? {
            label: "Resolve the remaining account commitment.",
            href: null,
          };
          return detail.href ? (
            <Link href={detail.href} asChild key={code}>
              <Pressable accessibilityRole="link" className="min-h-12">
                <Text className="font-bold leading-6 text-coral">
                  • {detail.label} Open →
                </Text>
              </Pressable>
            </Link>
          ) : (
            <Text className="leading-6 text-coral" key={code}>
              • {detail.label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

export default function AccountClosureScreen() {
  const { authenticatedRequest, clearSession, status } = useAuth();
  const requirementsQuery = useQuery({
    queryKey: ["account-closure-requirements"],
    queryFn: () =>
      profileApi.getAccountClosureRequirements(authenticatedRequest),
    enabled: status === "authenticated",
  });
  const requirements = requirementsQuery.data;
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(accountClosureFormSchema),
    defaultValues: {
      password: "",
      confirmation: "",
      retentionAcknowledged: false,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!requirements?.policyVersion) {
      setError("root", {
        message: "The current account-closure notice is unavailable.",
      });
      return;
    }

    try {
      await profileApi.closeAccount(authenticatedRequest, {
        ...values,
        policyVersion: requirements.policyVersion,
      });
      await clearSession();
      router.replace("/");
    } catch (error) {
      if (error.code === "ACCOUNT_CLOSURE_BLOCKED") {
        requirementsQuery.refetch();
      }
      setError("root", { message: error.message });
    }
  });

  if (status === "loading") {
    return (
      <PageContainer>
        <View className="flex-1 items-center justify-center py-24">
          <ActivityIndicator color="#18392B" size="large" />
        </View>
      </PageContainer>
    );
  }

  if (status !== "authenticated") {
    return (
      <PageContainer>
        <ProfileNav />
        <FormNotice>Sign in to manage account closure.</FormNotice>
        <AuthLink href="/login">Continue to sign in</AuthLink>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <ProfileNav action={<Link href="/profile">Back to profile</Link>} />
      <View className="mx-auto w-full max-w-3xl gap-6">
        <View>
          <Text className="text-xs font-bold uppercase tracking-widest text-coral">
            Permanent account action
          </Text>
          <Text
            accessibilityRole="header"
            className="mt-3 text-4xl font-black text-ink"
          >
            Close your account
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            Account closure cannot be undone. You may register again later, but
            your former activity will not be reattached to the new account.
          </Text>
        </View>

        {requirementsQuery.isLoading ? (
          <FormNotice tone="success">Checking active commitments…</FormNotice>
        ) : null}
        {requirementsQuery.error ? (
          <FormNotice>{requirementsQuery.error.message}</FormNotice>
        ) : null}
        <ClosureBlockers blockers={requirements?.blockers} />

        {requirements ? (
          <View className="rounded-3xl border border-line bg-surface p-6 md:p-9">
            <Text className="text-2xl font-black text-ink">
              What happens to your data
            </Text>
            <Text className="mt-3 leading-7 text-muted">
              {requirements.effect}
            </Text>
            <Text className="mt-3 text-sm leading-6 text-muted">
              Content you shared in requests, messages, completed help,
              donations, safety cases, and audit records may remain for the
              documented purpose and retention period. Backup deletion follows
              the backup rotation schedule. Contact the privacy channel in the
              published notice for an erasure or access request.
            </Text>
            {requirements.noticeUrl ? (
              <Pressable
                accessibilityRole="link"
                className="mt-4 min-h-12 justify-center"
                onPress={() =>
                  Linking.openURL(requirements.noticeUrl).catch((error) =>
                    setError("root", { message: error.message }),
                  )
                }
              >
                <Text className="font-bold text-leaf">
                  Read account-closure notice (version{" "}
                  {requirements.policyVersion})
                </Text>
              </Pressable>
            ) : (
              <Text className="mt-4 text-sm font-semibold text-coral">
                No published notice URL is configured in this development
                environment.
              </Text>
            )}

            {requirements.eligible ? (
              <View className="mt-6 border-t border-line pt-6">
                {errors.root ? (
                  <FormNotice>{errors.root.message}</FormNotice>
                ) : null}
                <FormField
                  autoComplete="current-password"
                  control={control}
                  error={errors.password}
                  label="Current password"
                  name="password"
                  secureTextEntry
                  textContentType="password"
                />
                <FormField
                  autoCapitalize="characters"
                  control={control}
                  error={errors.confirmation}
                  label='Type "CLOSE MY ACCOUNT"'
                  name="confirmation"
                />
                <ConsentField
                  control={control}
                  error={errors.retentionAcknowledged}
                  label="I understand that closure disables access and anonymizes my profile, while records required for transactions, safety, legal claims, consent, security, and audits may be retained under the published policy."
                  name="retentionAcknowledged"
                />
                <View className="mt-3">
                  <PrimaryButton loading={isSubmitting} onPress={onSubmit}>
                    Permanently close account
                  </PrimaryButton>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </PageContainer>
  );
}
