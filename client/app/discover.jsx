import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { useAuth } from "../src/features/auth/AuthContext";
import { FormNotice } from "../src/features/auth/FormControls";
import { requestApi } from "../src/features/requests/requestApi";
import {
  formatPesos,
  RequestCard,
  RequestNav,
} from "../src/features/requests/RequestPrimitives";
import { apiRequest } from "../src/services/api/client";

const modes = Object.freeze([
  { value: "relevant", label: "Recommended" },
  { value: "skills", label: "Match my skills" },
  { value: "no_money", label: "I have no money" },
  { value: "nearby", label: "Nearby" },
  { value: "budget", label: "I have a budget" },
]);

const suggestedSkills = Object.freeze([
  "Programming",
  "Graphic design",
  "Tutoring",
  "Writing",
  "Résumé review",
  "Translation",
  "Computer help",
  "Repair",
  "Photography",
  "Driving",
  "Errands",
  "Digital assistance",
  "Other",
]);

function skillsFromText(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function DiscoveryScreen() {
  const { authenticatedRequest, isAuthenticated, user } = useAuth();
  const [mode, setMode] = useState("relevant");
  const [skillsText, setSkillsText] = useState("");
  const [budget, setBudget] = useState("100");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [formError, setFormError] = useState("");
  const [applied, setApplied] = useState({ mode: "relevant" });
  const requester = isAuthenticated ? authenticatedRequest : apiRequest;
  const query = useInfiniteQuery({
    queryKey: ["advanced-discovery", applied, user?.id ?? "public"],
    queryFn: ({ pageParam }) => {
      const filters = { ...applied, limit: 12, cursor: pageParam };
      if (applied.mode === "budget") {
        const { mode: _mode, ...budgetFilters } = filters;
        return requestApi.solvable(requester, budgetFilters);
      }
      return requestApi.discover(requester, filters);
    },
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
  });
  const requests = query.data?.pages.flatMap((page) => page.items) ?? [];
  const criteria = query.data?.pages[0]?.criteria;

  function toggleSkill(skill) {
    const current = skillsFromText(skillsText);
    const exists = current.some(
      (item) => item.toLocaleLowerCase("en") === skill.toLocaleLowerCase("en"),
    );
    setSkillsText(
      (exists
        ? current.filter(
            (item) =>
              item.toLocaleLowerCase("en") !== skill.toLocaleLowerCase("en"),
          )
        : [...current, skill]
      ).join(", "),
    );
  }

  function applyFilters() {
    const skills = skillsFromText(skillsText);
    if (
      ["skills", "no_money"].includes(mode) &&
      !skills.length &&
      !isAuthenticated
    ) {
      setFormError(
        "Choose at least one skill, or sign in to use profile skills.",
      );
      return;
    }
    if (mode === "budget" && !/^\d+(?:\.\d{1,2})?$/.test(budget.trim())) {
      setFormError("Enter a PHP budget with at most two decimal places.");
      return;
    }
    if (city.trim() && !province.trim()) {
      setFormError("Choose a province when entering a city.");
      return;
    }
    setFormError("");
    setApplied({
      mode,
      ...(skills.length ? { skills: skills.join(",") } : {}),
      ...(mode === "budget" ? { budget: budget.trim() } : {}),
      ...(city.trim() ? { city: city.trim() } : {}),
      ...(province.trim() ? { province: province.trim() } : {}),
    });
  }

  return (
    <PageContainer>
      <RequestNav />
      <View className="w-full">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Advanced discovery
        </Text>
        <Text
          accessibilityRole="header"
          className="mt-3 text-4xl font-black text-ink md:text-6xl"
        >
          Find one practical way to help.
        </Text>
        <Text className="mt-4 max-w-3xl text-base leading-7 text-muted">
          Results use selected skills, factual verification, urgency, general
          location, and request age. Sensitive personal traits and AI are never
          ranking signals.
        </Text>

        <View className="mt-8 rounded-3xl border border-line bg-surface p-6 md:p-8">
          <Text className="font-black text-ink">
            How would you like to help?
          </Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {modes.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: mode === option.value }}
                className={`min-h-12 justify-center rounded-xl px-4 ${
                  mode === option.value ? "bg-pine" : "border border-leaf"
                }`}
                onPress={() => setMode(option.value)}
              >
                <Text
                  className={
                    mode === option.value
                      ? "font-bold text-white"
                      : "font-bold text-leaf"
                  }
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {["relevant", "skills", "no_money"].includes(mode) ? (
            <View className="mt-6">
              <Text className="font-black text-ink">Skills you can share</Text>
              <Text className="mt-1 text-sm leading-6 text-muted">
                Leave blank while signed in to use your saved profile skills.
              </Text>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {suggestedSkills.map((skill) => {
                  const selected = skillsFromText(skillsText).some(
                    (value) =>
                      value.toLocaleLowerCase("en") ===
                      skill.toLocaleLowerCase("en"),
                  );
                  return (
                    <Pressable
                      key={skill}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      className={`min-h-11 justify-center rounded-full border px-3 ${
                        selected ? "border-pine bg-mint" : "border-line"
                      }`}
                      onPress={() => toggleSkill(skill)}
                    >
                      <Text className="text-sm font-bold text-ink">
                        {skill}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                accessibilityLabel="Skills, comma separated"
                className="mt-4 min-h-12 rounded-xl border border-line bg-white px-4 text-ink"
                maxLength={800}
                onChangeText={setSkillsText}
                placeholder="Custom skills, comma-separated"
                value={skillsText}
              />
            </View>
          ) : null}

          {mode === "budget" ? (
            <View className="mt-6">
              <Text className="font-black text-ink">
                Available budget in PHP
              </Text>
              <TextInput
                accessibilityLabel="Available budget in Philippine pesos"
                className="mt-3 min-h-12 rounded-xl border border-line bg-white px-4 text-ink"
                keyboardType="decimal-pad"
                onChangeText={setBudget}
                placeholder="100"
                value={budget}
              />
            </View>
          ) : null}

          {["relevant", "skills", "no_money", "nearby", "budget"].includes(
            mode,
          ) ? (
            <View className="mt-6 md:flex-row md:gap-3">
              <TextInput
                accessibilityLabel="Province for general-location matching"
                className="mb-3 min-h-12 flex-1 rounded-xl border border-line bg-white px-4 text-ink md:mb-0"
                onChangeText={setProvince}
                placeholder={user?.location?.province || "Province (optional)"}
                value={province}
              />
              <TextInput
                accessibilityLabel="City for general-location matching"
                className="min-h-12 flex-1 rounded-xl border border-line bg-white px-4 text-ink"
                onChangeText={setCity}
                placeholder={
                  user?.location?.city || "City or municipality (optional)"
                }
                value={city}
              />
            </View>
          ) : null}

          {formError ? <FormNotice>{formError}</FormNotice> : null}
          <Pressable
            accessibilityRole="button"
            className="mt-6 min-h-14 items-center justify-center rounded-2xl bg-leaf px-5"
            onPress={applyFilters}
          >
            <Text className="font-black text-white">Find matches</Text>
          </Pressable>
        </View>

        {criteria ? (
          <View className="mt-6 rounded-2xl bg-mint p-4">
            <Text className="font-bold text-pine">
              {criteria.mode === "budget"
                ? `Fully solvable financial needs within ${formatPesos(criteria.budgetCentavos)}`
                : `${criteria.mode.replaceAll("_", " ")} ranking`}
            </Text>
            {criteria.selectedSkills?.length ? (
              <Text className="mt-1 text-sm text-leaf">
                Matching: {criteria.selectedSkills.join(", ")}
              </Text>
            ) : null}
          </View>
        ) : null}
        {query.error ? <FormNotice>{query.error.message}</FormNotice> : null}
        {query.isLoading ? (
          <Text className="py-12 text-center font-semibold text-muted">
            Finding practical matches…
          </Text>
        ) : null}
        {!query.isLoading && !requests.length ? (
          <View className="mt-6 rounded-3xl border border-line bg-surface p-8">
            <Text className="text-2xl font-black text-ink">No matches yet</Text>
            <Text className="mt-3 leading-7 text-muted">
              Try another skill, a broader province, or a different budget.
            </Text>
          </View>
        ) : null}
        <View className="mt-6 gap-4">
          {requests.map((item) => (
            <RequestCard key={item.id} request={item} />
          ))}
        </View>
        {query.hasNextPage ? (
          <Pressable
            accessibilityRole="button"
            className="mx-auto mt-8 min-h-14 items-center justify-center rounded-2xl border border-leaf px-7"
            disabled={query.isFetchingNextPage}
            onPress={() => query.fetchNextPage()}
          >
            <Text className="font-black text-leaf">
              {query.isFetchingNextPage ? "Loading…" : "Load more matches"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </PageContainer>
  );
}
