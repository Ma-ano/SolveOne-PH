import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { AuthLink } from "../src/features/auth/AuthShell";
import {
  FormField,
  FormNotice,
  PrimaryButton,
} from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import { aiApi } from "../src/features/ai/aiApi";
import { requestApi } from "../src/features/requests/requestApi";
import {
  formatPesos,
  humanize,
  NeedItemList,
  RequestNav,
  StatusBadge,
} from "../src/features/requests/RequestPrimitives";
import {
  helpTypes,
  requestCategories,
  requestDraftFormSchema,
  requestFormToPayload,
  requestSubmissionChecklist,
  requestToFormValues,
  requestUrgencies,
} from "../src/features/requests/schemas";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const editableStatuses = new Set(["draft", "changes_requested"]);

function ChoiceGroup({ control, label, name, options, multiple = false }) {
  return (
    <View className="mb-6">
      <Text className="mb-3 text-sm font-bold text-ink">{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, value } }) => (
          <View className="flex-row flex-wrap gap-2">
            {options.map((option) => {
              const selected = multiple
                ? value.includes(option)
                : value === option;
              return (
                <Pressable
                  accessibilityRole={multiple ? "checkbox" : "radio"}
                  accessibilityState={{ checked: selected }}
                  className={`min-h-12 justify-center rounded-full border px-4 ${
                    selected ? "border-pine bg-pine" : "border-line bg-white"
                  }`}
                  key={option}
                  onPress={() => {
                    if (!multiple) {
                      onChange(option);
                      return;
                    }
                    onChange(
                      selected
                        ? value.filter((item) => item !== option)
                        : [...value, option],
                    );
                  }}
                >
                  <Text
                    className={`text-sm font-bold ${selected ? "text-white" : "text-ink"}`}
                  >
                    {humanize(option)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      />
    </View>
  );
}

function errorMessage(error) {
  const detail = error?.details
    ?.slice(0, 8)
    .map((item) => item.message)
    .join(" · ");
  return detail ? `${error.message}: ${detail}` : error.message;
}

export default function RequestEditorScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { authenticatedRequest, status } = useAuth();
  const requestId =
    typeof params.requestId === "string" ? params.requestId : "";
  const hasRequestId = objectIdPattern.test(requestId);
  const invalidRequestId = Boolean(requestId) && !hasRequestId;
  const [savedNotice, setSavedNotice] = useState("");
  const [safetyGuidance, setSafetyGuidance] = useState([]);
  const [aiDescription, setAiDescription] = useState("");
  const [aiConsent, setAiConsent] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiNotice, setAiNotice] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const requestQuery = useQuery({
    queryKey: ["owned-request", requestId],
    queryFn: () => requestApi.getMine(authenticatedRequest, requestId),
    enabled: status === "authenticated" && hasRequestId,
  });
  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(requestDraftFormSchema),
    defaultValues: requestToFormValues(null),
  });
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "needItems",
  });
  const watched = watch();
  const submissionChecklist = requestSubmissionChecklist(watched);
  const submissionReady = submissionChecklist.every((item) => item.met);
  const storedRequest = requestQuery.data?.request;
  const canEdit = !storedRequest || editableStatuses.has(storedRequest.status);
  const aiStatusQuery = useQuery({
    queryKey: ["ai-assistance-status"],
    queryFn: () => aiApi.status(authenticatedRequest),
    enabled: status === "authenticated" && canEdit,
    staleTime: 5 * 60 * 1000,
  });

  async function generateAiSuggestion() {
    setAiBusy(true);
    setAiNotice("");
    setAiResult(null);
    try {
      const result = await aiApi.structureRequest(authenticatedRequest, {
        description: aiDescription.trim(),
        consent: true,
      });
      setAiResult(result);
    } catch (error) {
      setAiNotice(errorMessage(error));
    } finally {
      setAiBusy(false);
    }
  }

  function applyAiSuggestion() {
    const suggestion = aiResult?.suggestion;
    if (!suggestion) return;
    setValue("title", suggestion.title, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("description", suggestion.description, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("category", suggestion.category, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("helpTypes", [...suggestion.helpTypes], {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("requiredSkillsText", suggestion.requiredSkills.join(", "), {
      shouldDirty: true,
      shouldValidate: true,
    });
    replace(
      suggestion.needItems.map((item) => ({
        ...item,
        quantity: "1",
        estimatedValuePesos: "",
        estimatedMinutes: "",
      })),
    );
    setAiResult(null);
    setAiNotice(
      "Suggestions copied into the editable draft. Review quantities, amounts, time, urgency, dates, and location before saving.",
    );
  }

  useEffect(() => {
    if (storedRequest) {
      reset(requestToFormValues(storedRequest));
    }
  }, [reset, storedRequest]);

  async function persist(values) {
    const payload = requestFormToPayload(values);
    const result = hasRequestId
      ? await requestApi.updateDraft(authenticatedRequest, requestId, payload)
      : await requestApi.createDraft(authenticatedRequest, payload);
    queryClient.setQueryData(["owned-request", result.request.id], result);
    await queryClient.invalidateQueries({ queryKey: ["my-requests"] });
    reset(requestToFormValues(result.request));
    setSavedNotice("Draft saved privately.");
    if (!hasRequestId) {
      router.replace({
        pathname: "/request-editor",
        params: { requestId: result.request.id },
      });
    }
    return result.request;
  }

  const saveDraft = handleSubmit(async (values) => {
    try {
      setSavedNotice("");
      await persist(values);
    } catch (error) {
      setError("root", { message: errorMessage(error) });
    }
  });

  const saveAndSubmit = handleSubmit(async (values) => {
    try {
      setSavedNotice("");
      if (!requestSubmissionChecklist(values).every((item) => item.met)) {
        setError("root", {
          message:
            "Finish the submission checklist below. You can still save this as a private draft.",
        });
        return;
      }
      const saved = await persist(values);
      const result = await requestApi.submit(authenticatedRequest, saved.id);
      queryClient.setQueryData(["owned-request", saved.id], result);
      await queryClient.invalidateQueries({ queryKey: ["my-requests"] });
      reset(requestToFormValues(result.request));
      setSafetyGuidance(result.safetyGuidance ?? []);
      setSavedNotice("Submitted for moderator review.");
    } catch (error) {
      setError("root", { message: errorMessage(error) });
    }
  });

  if (status === "loading") {
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
          <Text className="text-3xl font-black text-ink">
            Sign in to create a request
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            Drafts remain private until you submit them and a moderator approves
            them.
          </Text>
          <View className="mt-5">
            <AuthLink href="/login">Continue to sign in</AuthLink>
          </View>
        </View>
      </PageContainer>
    );
  }

  if (invalidRequestId) {
    return (
      <PageContainer>
        <RequestNav />
        <FormNotice>This draft link is incomplete or invalid.</FormNotice>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <RequestNav />
      <View className="w-full">
        <View className="mb-8 md:flex-row md:items-end md:justify-between">
          <View className="max-w-2xl">
            <Text className="text-xs font-bold uppercase tracking-widest text-coral">
              {hasRequestId ? "Request workspace" : "New private draft"}
            </Text>
            <Text className="mt-3 text-page-title font-black text-ink md:text-page-title-lg">
              What exactly would solve the problem?
            </Text>
            <Text className="mt-4 text-base leading-7 text-muted">
              Break the finish line into concrete items, tasks, skills, or time.
              Your barangay remains private; the public page shows only city and
              province.
            </Text>
          </View>
          {storedRequest ? (
            <View className="mt-5 md:mt-0">
              <StatusBadge status={storedRequest.status} />
            </View>
          ) : null}
        </View>

        {requestQuery.isLoading ? (
          <Text className="py-12 text-center font-semibold text-muted">
            Loading draft…
          </Text>
        ) : null}
        {requestQuery.error ? (
          <FormNotice>{requestQuery.error.message}</FormNotice>
        ) : null}
        {storedRequest?.moderation?.notes ? (
          <FormNotice>
            Moderator feedback: {storedRequest.moderation.notes}
          </FormNotice>
        ) : null}
        {errors.root ? <FormNotice>{errors.root.message}</FormNotice> : null}
        {savedNotice ? (
          <FormNotice tone="success">{savedNotice}</FormNotice>
        ) : null}
        {safetyGuidance.map((message) => (
          <FormNotice key={message}>{message}</FormNotice>
        ))}

        {canEdit && !requestQuery.isLoading ? (
          <View className="rounded-3xl border border-line bg-surface p-6 md:p-10">
            {aiStatusQuery.data?.available ? (
              <View className="mb-8 rounded-3xl border border-line bg-canvas p-5 md:p-6">
                <Text className="text-xs font-bold uppercase tracking-widest text-coral">
                  Optional AI writing help
                </Text>
                <Text className="mt-2 text-xl font-black text-ink">
                  Turn a rough description into an editable outline
                </Text>
                <Text className="mt-2 text-sm leading-6 text-muted">
                  This optional tool sends only the text below after the server
                  removes detected contact, address, ID, authentication, and
                  payment details. AI can be wrong. It cannot approve, submit,
                  or save a request, and the normal form works without it.
                </Text>
                <Text className="mb-2 mt-5 text-sm font-bold text-ink">
                  Rough description
                </Text>
                <TextInput
                  accessibilityLabel="Rough description for AI assistance"
                  className="min-h-32 rounded-2xl border border-line bg-white px-4 py-3 text-base text-ink"
                  maxLength={2000}
                  multiline
                  onChangeText={setAiDescription}
                  placeholder="Example: I need help getting my children ready for school, but I am not sure how to list each need."
                  placeholderTextColor="#738078"
                  textAlignVertical="top"
                  value={aiDescription}
                />
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: aiConsent }}
                  className="mt-4 min-h-12 flex-row items-center"
                  onPress={() => setAiConsent((current) => !current)}
                >
                  <View
                    className={`mr-3 h-6 w-6 items-center justify-center rounded-md border ${
                      aiConsent ? "border-pine bg-pine" : "border-line bg-white"
                    }`}
                  >
                    <Text className="font-black text-white">
                      {aiConsent ? "✓" : ""}
                    </Text>
                  </View>
                  <Text className="flex-1 text-sm leading-6 text-ink">
                    I consent to sending the sanitized text to the configured AI
                    provider for this one suggestion.
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled:
                      aiBusy || !aiConsent || aiDescription.trim().length < 20,
                  }}
                  className={`mt-4 min-h-14 items-center justify-center rounded-2xl px-5 ${
                    aiBusy || !aiConsent || aiDescription.trim().length < 20
                      ? "bg-line"
                      : "bg-pine"
                  }`}
                  disabled={
                    aiBusy || !aiConsent || aiDescription.trim().length < 20
                  }
                  onPress={generateAiSuggestion}
                >
                  {aiBusy ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text className="font-black text-white">
                      Generate suggestion
                    </Text>
                  )}
                </Pressable>
                {aiNotice ? (
                  <Text className="mt-4 text-sm leading-6 text-muted">
                    {aiNotice}
                  </Text>
                ) : null}
                {aiResult ? (
                  <View className="mt-5 rounded-2xl border border-leaf bg-white p-5">
                    <Text className="text-xs font-bold uppercase tracking-widest text-leaf">
                      Preview only · not saved
                    </Text>
                    <Text className="mt-2 text-xl font-black text-ink">
                      {aiResult.suggestion.title}
                    </Text>
                    <Text className="mt-2 text-sm leading-6 text-muted">
                      {aiResult.suggestion.description}
                    </Text>
                    <Text className="mt-3 text-sm font-bold text-pine">
                      {humanize(aiResult.suggestion.category)} ·{" "}
                      {aiResult.suggestion.helpTypes.map(humanize).join(", ")}
                    </Text>
                    <View className="mt-4 gap-2">
                      {aiResult.suggestion.needItems.map((item, index) => (
                        <Text
                          className="text-sm leading-6 text-ink"
                          key={`${item.name}-${index}`}
                        >
                          • {item.name} ({humanize(item.type)}):{" "}
                          {item.description}
                        </Text>
                      ))}
                    </View>
                    {aiResult.suggestion.followUpQuestions.length ? (
                      <View className="mt-4">
                        <Text className="text-sm font-black text-ink">
                          Questions to answer before saving
                        </Text>
                        {aiResult.suggestion.followUpQuestions.map(
                          (question, index) => (
                            <Text
                              className="mt-1 text-sm leading-6 text-muted"
                              key={`${question}-${index}`}
                            >
                              • {question}
                            </Text>
                          ),
                        )}
                      </View>
                    ) : null}
                    {aiResult.redactions.length ? (
                      <Text className="mt-4 text-xs leading-5 text-muted">
                        Removed before AI processing:{" "}
                        {aiResult.redactions.join(", ")}.
                      </Text>
                    ) : null}
                    <Text className="mt-3 text-xs leading-5 text-muted">
                      {aiResult.disclaimer}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      className="mt-4 min-h-14 items-center justify-center rounded-2xl bg-leaf px-5"
                      onPress={applyAiSuggestion}
                    >
                      <Text className="font-black text-white">
                        Use these suggestions
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : (
              <View className="mb-8 rounded-3xl border border-line bg-canvas p-5 md:p-6">
                <Text className="text-xs font-bold uppercase tracking-widest text-leaf">
                  Guided request form
                </Text>
                <Text className="mt-2 text-lg font-black text-ink">
                  AI writing help is currently off
                </Text>
                <Text className="mt-2 text-sm leading-6 text-muted">
                  Nothing is broken—you can complete every step below manually.
                  The optional writing helper appears here only when an operator
                  has enabled and reviewed it.
                </Text>
              </View>
            )}
            <Text className="mb-6 text-xl font-black text-ink">
              1. The problem and finish line
            </Text>
            <FormField
              autoCapitalize="sentences"
              control={control}
              error={errors.title}
              label="Specific title"
              name="title"
              placeholder="School printing needed for enrollment"
            />
            <FormField
              autoCapitalize="sentences"
              control={control}
              error={errors.description}
              label="What is happening, and what outcome would solve it?"
              multiline
              name="description"
              numberOfLines={6}
            />
            <ChoiceGroup
              control={control}
              label="Category"
              name="category"
              options={requestCategories}
            />
            <ChoiceGroup
              control={control}
              label="Kinds of help that would work"
              multiple
              name="helpTypes"
              options={helpTypes}
            />
            <ChoiceGroup
              control={control}
              label="Urgency"
              name="urgency"
              options={requestUrgencies}
            />

            <View className="my-7 border-t border-line pt-7">
              <Text className="text-xl font-black text-ink">
                2. Concrete need items
              </Text>
              <Text className="mt-2 text-sm leading-6 text-muted">
                Add one line for every item or task. Amounts are estimates only;
                this phase does not move money.
              </Text>
            </View>
            <View className="gap-4">
              {fields.map((field, index) => (
                <View
                  className="rounded-2xl border border-line bg-canvas p-5"
                  key={field.id}
                >
                  <View className="mb-4 flex-row flex-wrap items-center justify-between gap-3">
                    <Text className="text-lg font-black text-ink">
                      Need {index + 1}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      className="min-h-12 justify-center px-2"
                      onPress={() => remove(index)}
                    >
                      <Text className="font-bold text-coral">Remove</Text>
                    </Pressable>
                  </View>
                  <FormField
                    autoCapitalize="sentences"
                    control={control}
                    error={errors.needItems?.[index]?.name}
                    label="Item or task"
                    name={`needItems.${index}.name`}
                  />
                  <FormField
                    autoCapitalize="sentences"
                    control={control}
                    error={errors.needItems?.[index]?.description}
                    label="What will this solve?"
                    multiline
                    name={`needItems.${index}.description`}
                    numberOfLines={3}
                  />
                  <ChoiceGroup
                    control={control}
                    label="Help type"
                    name={`needItems.${index}.type`}
                    options={helpTypes}
                  />
                  <View className="md:flex-row md:gap-4">
                    <View className="flex-1">
                      <FormField
                        control={control}
                        error={errors.needItems?.[index]?.quantity}
                        keyboardType="number-pad"
                        label="Quantity"
                        name={`needItems.${index}.quantity`}
                      />
                    </View>
                    <View className="flex-1">
                      {["skill", "time"].includes(
                        watched.needItems?.[index]?.type,
                      ) ? (
                        <FormField
                          control={control}
                          error={errors.needItems?.[index]?.estimatedMinutes}
                          keyboardType="number-pad"
                          label="Approximate minutes (optional)"
                          name={`needItems.${index}.estimatedMinutes`}
                          placeholder="30"
                        />
                      ) : (
                        <FormField
                          control={control}
                          error={errors.needItems?.[index]?.estimatedValuePesos}
                          keyboardType="decimal-pad"
                          label="Estimated total (PHP)"
                          name={`needItems.${index}.estimatedValuePesos`}
                          placeholder="150.00"
                        />
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              className="mt-4 min-h-14 items-center justify-center rounded-2xl border border-leaf px-5"
              onPress={() =>
                append({
                  name: "",
                  description: "",
                  type: watched.helpTypes?.[0] ?? "item",
                  quantity: "1",
                  estimatedValuePesos: "",
                  estimatedMinutes: "",
                })
              }
            >
              <Text className="font-black text-leaf">Add a need item</Text>
            </Pressable>

            <View className="my-7 border-t border-line pt-7">
              <Text className="text-xl font-black text-ink">
                3. Timing and private location
              </Text>
            </View>
            <FormField
              control={control}
              error={errors.neededBy}
              label="Needed by (YYYY-MM-DD)"
              name="neededBy"
              placeholder="2026-12-31"
            />
            <View className="md:flex-row md:gap-4">
              <View className="flex-1">
                <FormField
                  autoCapitalize="words"
                  control={control}
                  error={errors.country}
                  label="Country"
                  name="country"
                />
              </View>
              <View className="flex-1">
                <FormField
                  autoCapitalize="words"
                  control={control}
                  error={errors.province}
                  label="Province"
                  name="province"
                />
              </View>
            </View>
            <View className="md:flex-row md:gap-4">
              <View className="flex-1">
                <FormField
                  autoCapitalize="words"
                  control={control}
                  error={errors.city}
                  label="City or municipality"
                  name="city"
                />
              </View>
              <View className="flex-1">
                <FormField
                  autoCapitalize="words"
                  control={control}
                  error={errors.barangay}
                  label="Barangay (private)"
                  name="barangay"
                />
              </View>
            </View>
            <FormField
              control={control}
              error={errors.requiredSkillsText}
              label="Required skills, comma-separated (optional)"
              name="requiredSkillsText"
              placeholder="Document formatting, tutoring"
            />

            <View className="my-7 border-t border-line pt-7">
              <Text className="text-xl font-black text-ink">
                4. Preview before moderation
              </Text>
              <Text className="mt-2 text-sm leading-6 text-muted">
                Public visitors will see the content below only after approval.
              </Text>
            </View>
            <View className="mb-7 rounded-2xl border border-line bg-white p-5">
              <Text className="text-lg font-black text-ink">
                Ready for review?
              </Text>
              <Text className="mt-1 text-sm leading-6 text-muted">
                You can save at any time. All five checks are required only when
                you submit to moderators.
              </Text>
              <View className="mt-4 gap-2">
                {submissionChecklist.map((item) => (
                  <View className="flex-row items-start gap-3" key={item.key}>
                    <Text
                      accessibilityLabel={item.met ? "Complete" : "Incomplete"}
                      className={`font-black ${item.met ? "text-leaf" : "text-coral"}`}
                    >
                      {item.met ? "✓" : "○"}
                    </Text>
                    <Text
                      className={`flex-1 text-sm leading-6 ${
                        item.met ? "text-ink" : "text-muted"
                      }`}
                    >
                      {item.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
            <View className="mb-7 rounded-2xl bg-canvas p-5">
              <Text className="text-xs font-bold uppercase tracking-widest text-coral">
                {humanize(watched.category)} · {humanize(watched.urgency)}
              </Text>
              <Text className="mt-3 text-2xl font-black text-ink">
                {watched.title || "Your request title"}
              </Text>
              <Text className="mt-3 leading-7 text-muted">
                {watched.description ||
                  "Your problem and clear finish line will appear here."}
              </Text>
              <Text className="mt-4 font-bold text-leaf">
                Public location: {watched.city || "city"},{" "}
                {watched.province || "province"}
              </Text>
              <View className="mt-5">
                <NeedItemList
                  items={(watched.needItems ?? []).map((item, index) => ({
                    ...item,
                    id: String(index),
                    quantity: item.quantity || "—",
                    estimatedValueCentavos: item.estimatedValuePesos
                      ? Math.round(Number(item.estimatedValuePesos) * 100)
                      : 0,
                    estimatedMinutes: item.estimatedMinutes
                      ? Number(item.estimatedMinutes)
                      : null,
                  }))}
                />
              </View>
              <Text className="mt-4 text-sm font-black text-pine">
                Estimated total:{" "}
                {formatPesos(
                  (watched.needItems ?? []).reduce(
                    (sum, item) =>
                      sum + (Number(item.estimatedValuePesos) || 0) * 100,
                    0,
                  ),
                )}
              </Text>
            </View>

            <PrimaryButton
              disabled={!isDirty && hasRequestId}
              loading={isSubmitting}
              onPress={saveDraft}
            >
              Save private draft
            </PrimaryButton>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: isSubmitting || !submissionReady,
              }}
              className={`mt-3 min-h-14 items-center justify-center rounded-2xl px-5 ${
                submissionReady ? "bg-leaf" : "bg-muted"
              }`}
              disabled={isSubmitting || !submissionReady}
              onPress={saveAndSubmit}
            >
              <Text className="text-base font-black text-white">
                Save and submit for review
              </Text>
            </Pressable>
            <Text className="mt-4 text-xs leading-5 text-muted">
              Never include passwords, OTP codes, banking PINs, exact home
              directions, or illegal requests. Urgent danger and medical
              emergencies need qualified professional or emergency support.
            </Text>
          </View>
        ) : null}

        {storedRequest && !canEdit ? (
          <View className="rounded-3xl border border-line bg-surface p-8">
            <Text className="text-2xl font-black text-ink">
              This request is not editable now
            </Text>
            <Text className="mt-3 leading-7 text-muted">
              Pending requests are locked during review. Published and terminal
              requests preserve the reviewed record.
            </Text>
          </View>
        ) : null}
      </View>
    </PageContainer>
  );
}
