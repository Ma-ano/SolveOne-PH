import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { Pressable, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { AuthLink } from "../src/features/auth/AuthShell";
import {
  FormField,
  FormNotice,
  PrimaryButton,
} from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import {
  giveawayApi,
  giveawayOperationKey,
} from "../src/features/giveaways/giveawayApi";
import {
  emptyGiveawayForm,
  giveawayCategories,
  giveawayConditions,
  giveawayFormSchema,
  giveawayFormToPayload,
} from "../src/features/giveaways/schemas";
import {
  humanize,
  RequestNav,
} from "../src/features/requests/RequestPrimitives";

function ChoiceField({ control, name, label, values }) {
  return (
    <View className="mb-5">
      <Text className="mb-2 text-sm font-bold text-ink">{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, value } }) => (
          <View className="flex-row flex-wrap gap-2">
            {values.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ checked: value === option }}
                className={`min-h-11 justify-center rounded-full border px-3 ${
                  value === option
                    ? "border-pine bg-mint"
                    : "border-line bg-white"
                }`}
                onPress={() => onChange(option)}
              >
                <Text className="text-sm font-bold text-ink">
                  {humanize(option)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      />
    </View>
  );
}

export default function GiveawayCreateScreen() {
  const router = useRouter();
  const { authenticatedRequest, status } = useAuth();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm({
    resolver: zodResolver(giveawayFormSchema),
    defaultValues: emptyGiveawayForm,
  });

  async function submit(values) {
    try {
      const result = await giveawayApi.create(
        authenticatedRequest,
        giveawayFormToPayload(values),
        giveawayOperationKey("giveaway-create"),
      );
      router.replace({
        pathname: "/giveaway-item",
        params: { itemId: result.item.id },
      });
    } catch (error) {
      setError("root", { message: error.message });
    }
  }

  if (status !== "authenticated") {
    return (
      <PageContainer>
        <RequestNav />
        <View className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-surface p-8">
          <Text className="text-3xl font-black text-ink">
            Sign in to list a free item
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            Listings are tied to an accountable profile and can never include a
            sale price.
          </Text>
          <View className="mt-5">
            <AuthLink href="/login">Continue to sign in</AuthLink>
          </View>
        </View>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <RequestNav
        action={
          <Link href="/my-giveaways" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-12 justify-center rounded-xl border border-leaf px-4"
            >
              <Text className="font-black text-leaf">My items</Text>
            </Pressable>
          </Link>
        }
      />
      <View className="w-full rounded-3xl border border-line bg-surface p-6 md:p-10">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Free item listing
        </Text>
        <Text className="mt-3 text-4xl font-black text-ink">
          Pass one useful thing forward.
        </Text>
        <Text className="mt-3 leading-7 text-muted">
          Be specific about condition and quantity. Only city and province are
          public; barangay stays private. Selling and payment requests are not
          allowed.
        </Text>
        <View className="mt-8">
          {errors.root ? <FormNotice>{errors.root.message}</FormNotice> : null}
          <FormField
            autoCapitalize="sentences"
            control={control}
            error={errors.title}
            label="Item title"
            name="title"
            placeholder="Working USB keyboard"
          />
          <FormField
            autoCapitalize="sentences"
            control={control}
            error={errors.description}
            label="Description and known issues"
            multiline
            name="description"
            placeholder="Describe what works, what does not, and what is included."
          />
          <ChoiceField
            control={control}
            label="Category"
            name="category"
            values={giveawayCategories}
          />
          <ChoiceField
            control={control}
            label="Condition"
            name="condition"
            values={giveawayConditions}
          />
          <FormField
            control={control}
            error={errors.quantity}
            keyboardType="number-pad"
            label="Quantity"
            name="quantity"
          />
          <Text className="mb-4 mt-3 text-xl font-black text-ink">
            Private pickup area
          </Text>
          <FormField
            autoCapitalize="words"
            control={control}
            error={errors.country}
            label="Country"
            name="country"
          />
          <FormField
            autoCapitalize="words"
            control={control}
            error={errors.province}
            label="Province"
            name="province"
          />
          <FormField
            autoCapitalize="words"
            control={control}
            error={errors.city}
            label="City or municipality"
            name="city"
          />
          <FormField
            autoCapitalize="words"
            control={control}
            error={errors.barangay}
            label="Barangay (private, optional)"
            name="barangay"
          />
          <View className="rounded-2xl bg-mint p-4">
            <Text className="text-sm font-semibold leading-6 text-pine">
              Photo uploads are not enabled yet. Do not put phone numbers,
              addresses, payment details, or credentials in the description.
            </Text>
          </View>
          <View className="mt-6">
            <PrimaryButton
              loading={isSubmitting}
              onPress={handleSubmit(submit)}
            >
              Publish free listing
            </PrimaryButton>
          </View>
        </View>
      </View>
    </PageContainer>
  );
}
