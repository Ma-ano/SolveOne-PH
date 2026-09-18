import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { AuthLink } from "../src/features/auth/AuthShell";
import { useAuth } from "../src/features/auth/AuthContext";
import {
  FormField,
  FormNotice,
  PrimaryButton,
} from "../src/features/auth/FormControls";
import {
  missionApi,
  missionOperationKey,
} from "../src/features/missions/missionApi";
import {
  emptyMissionForm,
  missionCategories,
  missionFormSchema,
  missionFormToPayload,
  missionResourceTypes,
  missionToForm,
} from "../src/features/missions/schemas";
import {
  humanize,
  RequestNav,
} from "../src/features/requests/RequestPrimitives";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

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

export default function MissionCreateScreen() {
  const params = useLocalSearchParams();
  const missionId =
    typeof params.missionId === "string" ? params.missionId : "";
  const editing = objectIdPattern.test(missionId);
  const router = useRouter();
  const { authenticatedRequest, status } = useAuth();
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
    setError,
  } = useForm({
    resolver: zodResolver(missionFormSchema),
    defaultValues: emptyMissionForm,
  });
  const resources = useFieldArray({ control, name: "requiredResources" });
  const resourceValues = watch("requiredResources");
  const missionQuery = useQuery({
    queryKey: ["mission-edit", missionId],
    queryFn: () => missionApi.get(authenticatedRequest, missionId),
    enabled: status === "authenticated" && editing,
  });

  useEffect(() => {
    if (missionQuery.data?.mission)
      reset(missionToForm(missionQuery.data.mission));
  }, [missionQuery.data, reset]);

  async function submit(values) {
    try {
      const payload = missionFormToPayload(values);
      const saved = editing
        ? await missionApi.update(authenticatedRequest, missionId, payload)
        : await missionApi.create(
            authenticatedRequest,
            payload,
            missionOperationKey("mission-create"),
          );
      await missionApi.submit(authenticatedRequest, saved.mission.id);
      router.replace("/my-missions");
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
            Sign in to propose a mission
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            Community reports require an accountable creator and human review.
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
          <Link href="/my-missions" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-12 justify-center rounded-xl border border-leaf px-4"
            >
              <Text className="font-black text-leaf">My missions</Text>
            </Pressable>
          </Link>
        }
      />
      <View className="w-full rounded-3xl border border-line bg-surface p-6 md:p-10">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Moderated community mission
        </Text>
        <Text className="mt-3 text-4xl font-black text-ink">
          {editing ? "Revise this mission." : "Define one shared finish line."}
        </Text>
        <Text className="mt-3 leading-7 text-muted">
          State the permission, public benefit, safe scope, and exact resources.
          Evidence notes stay private to you and authorized moderators.
        </Text>
        {missionQuery.error ? (
          <View className="mt-6">
            <FormNotice>{missionQuery.error.message}</FormNotice>
          </View>
        ) : null}
        <View className="mt-8">
          {errors.root ? <FormNotice>{errors.root.message}</FormNotice> : null}
          <FormField
            autoCapitalize="sentences"
            control={control}
            error={errors.title}
            label="Mission title"
            name="title"
            placeholder="Restore the shared handwashing station"
          />
          <FormField
            autoCapitalize="sentences"
            control={control}
            error={errors.description}
            label="Community problem, permission, and safe finish line"
            multiline
            name="description"
            placeholder="Describe the shared need without accusing a person or exposing private information."
          />
          <ChoiceField
            control={control}
            label="Category"
            name="category"
            values={missionCategories}
          />
          <Text className="mb-4 mt-3 text-xl font-black text-ink">
            Private site area
          </Text>
          <FormField
            control={control}
            error={errors.country}
            label="Country"
            name="country"
          />
          <FormField
            control={control}
            error={errors.province}
            label="Province"
            name="province"
          />
          <FormField
            control={control}
            error={errors.city}
            label="City or municipality"
            name="city"
          />
          <FormField
            control={control}
            error={errors.barangay}
            label="Barangay or site detail (private, optional)"
            name="barangay"
          />
          <FormField
            autoCapitalize="sentences"
            control={control}
            error={errors.evidenceNote}
            label="Private verification note"
            multiline
            name="evidenceNote"
            placeholder="Who confirmed the issue and permission to perform this work?"
          />
          <Text className="mb-4 mt-4 text-xl font-black text-ink">
            Resource breakdown
          </Text>
          <View className="gap-5">
            {resources.fields.map((field, index) => (
              <View
                className="rounded-2xl border border-line bg-sand p-5"
                key={field.id}
              >
                <View className="mb-4 flex-row flex-wrap items-center justify-between gap-3">
                  <Text className="text-lg font-black text-ink">
                    Resource {index + 1}
                  </Text>
                  {resources.fields.length > 1 ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => resources.remove(index)}
                    >
                      <Text className="font-bold text-coral">Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
                <FormField
                  control={control}
                  error={errors.requiredResources?.[index]?.name}
                  label="Resource name"
                  name={`requiredResources.${index}.name`}
                />
                <FormField
                  control={control}
                  error={errors.requiredResources?.[index]?.description}
                  label="Exact resource or task"
                  multiline
                  name={`requiredResources.${index}.description`}
                />
                <ChoiceField
                  control={control}
                  label="Resource type"
                  name={`requiredResources.${index}.type`}
                  values={missionResourceTypes}
                />
                <FormField
                  control={control}
                  error={errors.requiredResources?.[index]?.quantity}
                  keyboardType="number-pad"
                  label="Quantity or volunteer slots"
                  name={`requiredResources.${index}.quantity`}
                />
                {resourceValues?.[index]?.type !== "item" ? (
                  <>
                    <FormField
                      control={control}
                      error={
                        errors.requiredResources?.[index]?.estimatedMinutes
                      }
                      keyboardType="number-pad"
                      label="Estimated minutes per contribution"
                      name={`requiredResources.${index}.estimatedMinutes`}
                    />
                    <FormField
                      control={control}
                      error={
                        errors.requiredResources?.[index]?.requiredSkillsText
                      }
                      label="Required skills, comma separated"
                      name={`requiredResources.${index}.requiredSkillsText`}
                      placeholder="community cleanup, basic repair"
                    />
                  </>
                ) : null}
              </View>
            ))}
          </View>
          {resources.fields.length < 5 ? (
            <Pressable
              accessibilityRole="button"
              className="mt-4 min-h-12 items-center justify-center rounded-xl border border-leaf"
              onPress={() =>
                resources.append({
                  name: "",
                  description: "",
                  type: "item",
                  quantity: "1",
                  estimatedMinutes: "",
                  requiredSkillsText: "",
                })
              }
            >
              <Text className="font-black text-leaf">Add resource line</Text>
            </Pressable>
          ) : null}
          <View className="mt-6 rounded-2xl bg-mint p-4">
            <Text className="text-sm font-semibold leading-6 text-pine">
              Submission creates a private saved draft first, then sends it for
              human verification. Do not include names of accused people,
              private addresses, children’s schedules, or unsafe work.
            </Text>
          </View>
          <View className="mt-6">
            <PrimaryButton
              loading={isSubmitting}
              onPress={handleSubmit(submit)}
            >
              Save and submit for review
            </PrimaryButton>
          </View>
        </View>
      </View>
    </PageContainer>
  );
}
