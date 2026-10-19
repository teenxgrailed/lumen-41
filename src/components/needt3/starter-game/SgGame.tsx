"use client";

import { useRef, useState } from "react";

import { ApiError } from "@/lib/needt3/hooks/core";
import {
  type StarterCreated,
  useStarterCreate,
  useStarterPlan,
  useUndoStarterAction,
} from "@/lib/needt3/hooks/starter-game";
import { notify } from "@/lib/notifications";
import type {
  StarterAnswers,
  StarterScreen,
  StarterSuggestions,
} from "@/lib/starter-game";

import { openPaywall } from "../paywall/store";
import { SgBoard } from "./SgBoard";
import { SgChat } from "./SgChat";
import { SgShell } from "./SgShell";
import { SgSummary } from "./SgSummary";
import {
  type SgTile,
  countTiles,
  createInput,
  createLabel,
  tileFromItem,
} from "./board";

type Stage = "chat" | "sort" | "sum";

/**
 * THE GAME (sg-game.jsx `SgGame`): chat, sort, summary, in one shell. The
 * only AI in it is one request after the third answer, which returns every
 * tile and every lane suggestion; after that nothing asks the model again.
 * Creating is one request too (one transaction, one AgentAction), and its
 * toast carries the single Undo, which brings the sorted board back.
 */
export function SgGame({
  entry,
  phone,
  onClose,
}: {
  entry: StarterScreen;
  phone: boolean;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>("chat");
  const [failed, setFailed] = useState(false);
  const [tiles, setTiles] = useState<SgTile[]>([]);
  const [suggestions, setSuggestions] = useState<StarterSuggestions>({});
  const [made, setMade] = useState<StarterCreated | null>(null);
  const answers = useRef<StarterAnswers | null>(null);

  const plan = useStarterPlan();
  const create = useStarterCreate();
  const undo = useUndoStarterAction();

  const ask = (a: StarterAnswers) => {
    answers.current = a;
    setFailed(false);
    plan.mutate(a, {
      onSuccess: (r) => {
        if (r.status === "ready") {
          setTiles(r.items.map((item, i) => tileFromItem(item, `t${i + 1}`)));
          setSuggestions(r.suggestions);
          setStage("sort");
        } else if (r.status === "upgrade") {
          openPaywall("Starter game");
          onClose();
        } else {
          setFailed(true);
        }
      },
      onError: () => setFailed(true),
    });
  };

  const make = (all: SgTile[]) => {
    const input = createInput(all);
    create.mutate(input, {
      onSuccess: (res) => {
        setTiles(all);
        setMade(res);
        setStage("sum");
        const label = createLabel(countTiles(all)).replace("Create", "Created");
        notify.success(label, {
          ...(res.undoable && res.actionId
            ? {
                action: {
                  label: "Undo",
                  onClick: () => {
                    void undo(res.actionId as string)
                      .then(() => setStage("sort"))
                      .catch((error: unknown) =>
                        notify.error(
                          error instanceof ApiError && error.status === 409
                            ? "Could not undo: something changed since."
                            : "Could not undo."
                        )
                      );
                  },
                },
              }
            : {}),
        });
      },
      onError: (error) => {
        if (error instanceof ApiError && error.status === 403) {
          openPaywall("Starter game");
          return;
        }
        notify.error("Could not create that. Nothing was changed.");
      },
    });
  };

  const step = stage === "chat" ? 1 : stage === "sort" ? 2 : 3;
  return (
    <SgShell entry={entry} phone={phone} step={step} onClose={onClose}>
      {stage === "chat" ? (
        <SgChat
          entry={entry}
          failed={failed}
          onDone={ask}
          onRetry={() => answers.current && ask(answers.current)}
        />
      ) : null}
      {stage === "sort" ? (
        <SgBoard
          initial={tiles}
          suggestions={suggestions}
          phone={phone}
          creating={create.isPending}
          onCreate={make}
        />
      ) : null}
      {stage === "sum" && made ? (
        <SgSummary
          tiles={tiles.filter((x) => x.g)}
          created={made.result}
          onClose={onClose}
        />
      ) : null}
    </SgShell>
  );
}
