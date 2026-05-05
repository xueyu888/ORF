import assert from "node:assert/strict";
import test from "node:test";

type Bit = 0 | 1;

interface SubtaskCase {
  id: string;
  done: Bit;
}

interface TaskCase {
  id: string;
  done: Bit;
  subtasks: SubtaskCase[];
}

interface RetCase {
  id: string;
  tasks: TaskCase[];
}

interface GoalCase {
  id: string;
  rets: RetCase[];
}

interface CompletionCaseResult {
  goal: Bit;
  rets: Record<string, Bit>;
  tasks: Record<string, Bit>;
}

const RANDOM_SEED = 0x20260505;
const RANDOM_CASE_COUNT = 2048;

function allDone(values: Bit[]): Bit {
  return values.every((value) => value === 1) ? 1 : 0;
}

function taskCompletion(taskCase: TaskCase): Bit {
  return taskCase.subtasks.length === 0 ? taskCase.done : allDone(taskCase.subtasks.map((subtask) => subtask.done));
}

function calculateCompletion(goalCase: GoalCase): CompletionCaseResult {
  const tasks: Record<string, Bit> = {};
  const rets: Record<string, Bit> = {};

  for (const retCase of goalCase.rets) {
    for (const taskCase of retCase.tasks) {
      tasks[taskCase.id] = taskCompletion(taskCase);
    }

    rets[retCase.id] = allDone(retCase.tasks.map((taskCase) => tasks[taskCase.id]));
  }

  return {
    goal: allDone(goalCase.rets.map((retCase) => rets[retCase.id])),
    rets,
    tasks,
  };
}

function finalGoalFormula(goalCase: GoalCase): Bit {
  return allDone(goalCase.rets.flatMap((retCase) => retCase.tasks.map(taskCompletion)));
}

function assertRule(goalCase: GoalCase): void {
  assert.ok(goalCase.rets.length >= 1);

  const actual = calculateCompletion(goalCase);

  for (const retCase of goalCase.rets) {
    assert.ok(retCase.tasks.length >= 1);

    for (const taskCase of retCase.tasks) {
      const expectedTask = taskCase.subtasks.length === 0
        ? taskCase.done
        : allDone(taskCase.subtasks.map((subtask) => subtask.done));
      assert.equal(actual.tasks[taskCase.id], expectedTask, taskCase.id);
    }

    assert.equal(actual.rets[retCase.id], allDone(retCase.tasks.map((taskCase) => actual.tasks[taskCase.id])), retCase.id);
  }

  assert.equal(actual.goal, allDone(goalCase.rets.map((retCase) => actual.rets[retCase.id])), goalCase.id);
  assert.equal(actual.goal, finalGoalFormula(goalCase), `${goalCase.id}: final formula`);
}

test("fixed acceptance case matches the referenced document", () => {
  const goalCase: GoalCase = {
    id: "g",
    rets: [
      {
        id: "r1",
        tasks: [
          { id: "t11", done: 1, subtasks: [] },
          {
            id: "t12",
            done: 0,
            subtasks: [
              { id: "s121", done: 1 },
              { id: "s122", done: 1 },
            ],
          },
        ],
      },
      {
        id: "r2",
        tasks: [
          {
            id: "t21",
            done: 1,
            subtasks: [
              { id: "s211", done: 1 },
              { id: "s212", done: 0 },
            ],
          },
        ],
      },
    ],
  };

  assert.deepEqual(calculateCompletion(goalCase), {
    tasks: {
      t11: 1,
      t12: 1,
      t21: 0,
    },
    rets: {
      r1: 1,
      r2: 0,
    },
    goal: 0,
  });
  assertRule(goalCase);
});

test("exhaustively covers small legal combinations", () => {
  let caseCount = 0;

  for (const goalCase of smallGoalCases()) {
    assertRule(goalCase);
    caseCount += 1;
  }

  assert.equal(caseCount, 44310);
});

test("randomly covers larger legal combinations with a reproducible seed", () => {
  const random = seededRandom(RANDOM_SEED);
  const coverage = {
    noSubtaskTask: false,
    subtaskTask: false,
    allDoneGoal: false,
    undoneGoal: false,
    taskOwnDoneIgnoredWhenSubtasksExist: false,
  };

  for (let caseIndex = 0; caseIndex < RANDOM_CASE_COUNT; caseIndex += 1) {
    const goalCase = randomGoalCase(random, caseIndex);
    const actual = calculateCompletion(goalCase);

    assertRule(goalCase);

    coverage.allDoneGoal ||= actual.goal === 1;
    coverage.undoneGoal ||= actual.goal === 0;

    for (const retCase of goalCase.rets) {
      for (const taskCase of retCase.tasks) {
        coverage.noSubtaskTask ||= taskCase.subtasks.length === 0;
        coverage.subtaskTask ||= taskCase.subtasks.length > 0;
        coverage.taskOwnDoneIgnoredWhenSubtasksExist ||= taskCase.subtasks.length > 0 && actual.tasks[taskCase.id] !== taskCase.done;
      }
    }
  }

  assert.deepEqual(coverage, {
    noSubtaskTask: true,
    subtaskTask: true,
    allDoneGoal: true,
    undoneGoal: true,
    taskOwnDoneIgnoredWhenSubtasksExist: true,
  });
});

function* smallGoalCases(): Generator<GoalCase> {
  const retVariantCache = new Map<string, RetCase[]>();

  for (const retCount of [1, 2]) {
    const retVariantGroups = Array.from({ length: retCount }, (_, index) => {
      const retIndex = index + 1;
      const cacheKey = String(retIndex);
      const cached = retVariantCache.get(cacheKey);

      if (cached) {
        return cached;
      }

      const variants = retVariants(retIndex);
      retVariantCache.set(cacheKey, variants);
      return variants;
    });

    for (const rets of product(retVariantGroups)) {
      yield { id: `g-small-${retCount}`, rets };
    }
  }
}

function retVariants(retIndex: number): RetCase[] {
  const variants: RetCase[] = [];

  for (const taskCount of [1, 2]) {
    const taskVariantGroups = Array.from({ length: taskCount }, (_, index) => taskVariants(retIndex, index + 1));

    for (const tasks of product(taskVariantGroups)) {
      variants.push({ id: `r${retIndex}`, tasks });
    }
  }

  return variants;
}

function taskVariants(retIndex: number, taskIndex: number): TaskCase[] {
  const variants: TaskCase[] = [];
  const taskId = `t${retIndex}${taskIndex}`;

  for (const done of bits()) {
    variants.push({ id: taskId, done, subtasks: [] });
  }

  for (const subtaskCount of [1, 2]) {
    for (const done of bits()) {
      for (const subtaskStates of bitTuples(subtaskCount)) {
        variants.push({
          id: taskId,
          done,
          subtasks: subtaskStates.map((subtaskDone, index) => ({
            id: `s${retIndex}${taskIndex}${index + 1}`,
            done: subtaskDone,
          })),
        });
      }
    }
  }

  return variants;
}

function product<T>(groups: T[][]): T[][] {
  return groups.reduce<T[][]>(
    (rows, group) => rows.flatMap((row) => group.map((item) => [...row, item])),
    [[]],
  );
}

function bits(): Bit[] {
  return [0, 1];
}

function bitTuples(length: number): Bit[][] {
  return Array.from({ length: 2 ** length }, (_, value) =>
    Array.from({ length }, (_item, bitIndex) => ((value >> bitIndex) & 1) as Bit),
  );
}

function randomGoalCase(random: () => number, caseIndex: number): GoalCase {
  const retCount = randomInt(random, 1, 8);

  return {
    id: `g-random-${caseIndex}`,
    rets: Array.from({ length: retCount }, (_ret, retOffset) => {
      const retIndex = retOffset + 1;
      const taskCount = randomInt(random, 1, 8);

      return {
        id: `r${retIndex}`,
        tasks: Array.from({ length: taskCount }, (_task, taskOffset) => {
          const taskIndex = taskOffset + 1;
          const subtaskCount = randomInt(random, 0, 8);

          return {
            id: `t${retIndex}_${taskIndex}`,
            done: randomBit(random),
            subtasks: Array.from({ length: subtaskCount }, (_subtask, subtaskOffset) => ({
              id: `s${retIndex}_${taskIndex}_${subtaskOffset + 1}`,
              done: randomBit(random),
            })),
          };
        }),
      };
    }),
  };
}

function randomInt(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomBit(random: () => number): Bit {
  return random() < 0.5 ? 0 : 1;
}

function seededRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;

    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
