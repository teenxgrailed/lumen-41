"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { isSampleId } from "@/lib/learn/samples";
import type { LearnTopicInput } from "@/lib/learn/schema";
import type {
  LearnLessonView,
  LearnOverview,
  LearnTopicView,
} from "@/lib/needt3/learn";
import { qk } from "@/lib/needt3/query-keys";

import { fetchJson, sendJson } from "./core";

/** Topics (no lesson bodies) and today's count. */
export function useLearn() {
  return useQuery({
    queryKey: qk.learn(),
    queryFn: () => fetchJson<LearnOverview>("/api/learn"),
    staleTime: 30_000,
  });
}

/** One of the person's topics with lesson bodies. Samples never fetch. */
export function useLearnTopic(topicId: string) {
  return useQuery({
    queryKey: qk.learnTopic(topicId),
    queryFn: () =>
      fetchJson<LearnTopicView>(
        `/api/learn/topics/${encodeURIComponent(topicId)}`
      ),
    enabled: !isSampleId(topicId),
    staleTime: 30_000,
  });
}

function useRefresh() {
  const qc = useQueryClient();
  return (topicId?: string) => {
    void qc.invalidateQueries({ queryKey: qk.learn() });
    if (topicId)
      void qc.invalidateQueries({ queryKey: qk.learnTopic(topicId) });
  };
}

export function useCreateTopic() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (
      input: LearnTopicInput | { sample: string }
    ): Promise<LearnTopicView> => sendJson("/api/learn/topics", "POST", input),
    onSuccess: (topic) => refresh(topic.id),
  });
}

export function useGenerateLessons() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (
      topicId: string
    ): Promise<{ status: string; topic?: LearnTopicView }> =>
      sendJson(
        `/api/learn/topics/${encodeURIComponent(topicId)}/generate`,
        "POST"
      ),
    onSuccess: (_r, topicId) => refresh(topicId),
  });
}

export function useSetLessonStatus() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (v: {
      lessonId: string;
      topicId: string;
      status: "new" | "done";
    }): Promise<LearnLessonView> =>
      sendJson(
        `/api/learn/lessons/${encodeURIComponent(v.lessonId)}`,
        "PATCH",
        { status: v.status }
      ),
    onSuccess: (_r, v) => refresh(v.topicId),
  });
}

export function useScheduleLesson() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (v: {
      lessonId: string;
      topicId: string;
    }): Promise<{ taskId: string }> =>
      sendJson(
        `/api/learn/lessons/${encodeURIComponent(v.lessonId)}/schedule`,
        "POST"
      ),
    onSuccess: (_r, v) => refresh(v.topicId),
  });
}
