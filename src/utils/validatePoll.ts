import { Poll } from "@/types";

export function validatePoll(poll: Poll) {
  if (!poll) {
    throw new Error("Poll cannot be null or undefined");
  }

  if (typeof poll.question !== "string" || poll.question.trim() === "") {
    throw new Error("Poll question must be a non-empty string");
  }

  if (
    !Array.isArray(poll.choices) ||
    poll.choices.length < 1 ||
    poll.choices.length > 8
  ) {
    throw new Error("Poll choices must be an array with 1 to 8 items");
  }

  if (
    poll.choices.some(
      (choice) => typeof choice !== "string" || choice.trim() === ""
    )
  ) {
    throw new Error("All poll choices must be non-empty strings");
  }

  if (poll.guild_id === undefined || typeof poll.guild_id !== "bigint") {
    throw new Error("Poll guild_id must be a valid bigint");
  }

  if (
    poll.tag !== undefined &&
    (typeof poll.tag !== "number" || poll.tag < 0)
  ) {
    throw new Error("Poll tag must be a non-negative number");
  }
}

export function validatePublishedPoll(newPoll: Poll, existingPoll: Poll) {
  if (existingPoll.published) {
    if (newPoll.choices.length !== existingPoll.choices.length) {
      throw new Error(
        "Cannot change the number of choices for a published poll"
      );
    }

    const newTime = newPoll.time
      ? newPoll.time instanceof Date
        ? newPoll.time
        : new Date(newPoll.time)
      : null;
    const existingTime = existingPoll.time
      ? existingPoll.time instanceof Date
        ? existingPoll.time
        : new Date(existingPoll.time)
      : null;

    if (newTime?.getTime() !== existingTime?.getTime()) {
      throw new Error("Cannot change the time of a published poll");
    }
  }
}
