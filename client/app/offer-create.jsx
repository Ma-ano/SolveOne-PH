import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { ActivityIndicator, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { AuthLink } from "../src/features/auth/AuthShell";
import {
  FormField,
  FormNotice,
  PrimaryButton,
} from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import { offerApi } from "../src/features/offers/offerApi";
import {
  emptyOfferForm,
  offerFormSchema,
  offerFormToPayload,
} from "../src/features/offers/schemas";
import { requestApi } from "../src/features/requests/requestApi";
import {
  formatPesos,
  humanize,
  RequestNav,
} from "../src/features/requests/RequestPrimitives";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

export default function OfferCreateScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { authenticatedRequest, status, user } = useAuth();
  const requestId =
    typeof params.requestId === "string" ? params.requestId : "";
  const needItemId =
    typeof params.needItemId === "string" ? params.needItemId : "";
  const validIds =
    objectIdPattern.test(requestId) && objectIdPattern.test(needItemId);
  const requestQuery = useQuery({
    queryKey: ["public-request", requestId],
    queryFn: () => requestApi.getPublic(requestId),
    enabled: validIds,
  });
  const requestItem = requestQuery.data?.request;
  const needItem = requestItem?.needItems?.find(
    (item) => item.id === needItemId,
  );
  const {
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(offerFormSchema),
    defaultValues: emptyOfferForm(),
  });
  const helpType = watch("helpType");

  useEffect(() => {
    if (needItem) {
      reset(emptyOfferForm(needItem.type));
    }
  }, [needItem, reset]);

  const submit = handleSubmit(async (values) => {
    try {
      await offerApi.create(
        authenticatedRequest,
        requestId,
        offerFormToPayload(values, needItemId),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-offers"] }),
        queryClient.invalidateQueries({
          queryKey: ["request-offers", requestId],
        }),
      ]);
      router.replace("/my-offers");
    } catch (error) {
      setError("root", { message: error.message });
    }
  });

  if (status === "loading" || requestQuery.isLoading) {
    return (
      <PageContainer>
        <View className="items-center py-24">
          <ActivityIndicator color="#18392B" size="large" />
        </View>
      </PageContainer>
    );
  }

  if (status !== "authenticated") {
    return (
      <PageContainer>
        <RequestNav />
        <View className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-surface p-8">
          <Text className="text-3xl font-black text-ink">Sign in to help</Text>
          <Text className="mt-3 leading-7 text-muted">
            Offers are private to you and the request owner.
          </Text>
          <View className="mt-5">
            <AuthLink href="/login">Continue to sign in</AuthLink>
          </View>
        </View>
      </PageContainer>
    );
  }

  if (!validIds || requestQuery.error || !needItem) {
    return (
      <PageContainer>
        <RequestNav />
        <FormNotice>
          {requestQuery.error?.message ??
            "This offer link is incomplete or the need is unavailable."}
        </FormNotice>
      </PageContainer>
    );
  }

  if (requestItem.owner.id === user.id) {
    return (
      <PageContainer>
        <RequestNav />
        <FormNotice>You cannot offer help to your own request.</FormNotice>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <RequestNav />
      <View className="w-full">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          I can help · {humanize(needItem.type)}
        </Text>
        <Text className="mt-3 text-page-title font-black text-ink md:text-page-title-lg">
          Make one concrete offer
        </Text>
        <Text className="mt-4 text-base leading-7 text-muted">
          {requestItem.title} · {needItem.name}
        </Text>

        <View className="mt-8 rounded-3xl border border-line bg-surface p-6 md:p-10">
          {errors.root ? <FormNotice>{errors.root.message}</FormNotice> : null}
          <View className="mb-6 rounded-2xl bg-mint p-4">
            <Text className="font-black text-pine">{needItem.name}</Text>
            <Text className="mt-2 text-sm leading-6 text-muted">
              {needItem.type === "money"
                ? `${formatPesos(needItem.remainingValueCentavos)} remains unpledged.`
                : `${needItem.remainingQuantity} of ${needItem.quantity} units remain open.`}
            </Text>
          </View>
          <FormField
            autoCapitalize="sentences"
            control={control}
            error={errors.message}
            label="What exactly can you provide?"
            multiline
            name="message"
            numberOfLines={5}
            placeholder="Explain the item, time, or skill you can provide and a realistic next step."
          />
          {helpType === "money" ? (
            <FormField
              control={control}
              error={errors.pledgedValuePesos}
              keyboardType="decimal-pad"
              label="Pledge amount (PHP)"
              name="pledgedValuePesos"
              placeholder="100.00"
            />
          ) : (
            <FormField
              control={control}
              error={errors.quantity}
              keyboardType="number-pad"
              label="Quantity you can cover"
              name="quantity"
            />
          )}
          {["skill", "time"].includes(helpType) ? (
            <FormField
              control={control}
              error={errors.estimatedMinutes}
              keyboardType="number-pad"
              label="Estimated minutes"
              name="estimatedMinutes"
            />
          ) : null}
          {helpType === "money" ? (
            <FormNotice tone="success">
              This records a MONETARY_PLEDGE only. SolveOne does not hold funds,
              debit a wallet, or transfer money to the recipient.
            </FormNotice>
          ) : null}
          <PrimaryButton loading={isSubmitting} onPress={submit}>
            Submit private offer
          </PrimaryButton>
          <Text className="mt-4 text-xs leading-5 text-muted">
            Never share passwords, OTP codes, banking PINs, or exact home
            directions. Private negotiation is not shown on public request
            pages.
          </Text>
        </View>
      </View>
    </PageContainer>
  );
}
