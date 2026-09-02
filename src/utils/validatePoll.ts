import { BadRequestError } from "@/errors";
import { Poll } from "@/types";

export function validatePoll(poll: Poll) {
  if (!poll) {
    throw new BadRequestError("Poll cannot be null or undefined");
  }

  if (typeof poll.question !== "string" || poll.question.trim() === "") {
    throw new BadRequestError("Poll question must be a non-empty string");
  }

  if (
    !Array.isArray(poll.choices) ||
    poll.choices.length < 1 ||
    poll.choices.length > 8
  ) {
    throw new BadRequestError("Poll choices must be an array with 1 to 8 items");
  }

  if (
    poll.choices.some(
      (choice) => typeof choice !== "string" || choice.trim() === ""
    )
  ) {
    throw new BadRequestError("All poll choices must be non-empty strings");
  }

  if (poll.guild_id === undefined || typeof poll.guild_id !== "bigint") {
    throw new BadRequestError("Poll guild_id must be a valid bigint");
  }

  if (
    poll.tag !== undefined &&
    (typeof poll.tag !== "number" || poll.tag < 0)
  ) {
    throw new BadRequestError("Poll tag must be a non-negative number");
  }
}

export function validatePublishedPoll(newPoll: Poll, existingPoll: Poll) {
  if (existingPoll.published) {
    if (newPoll.choices.length !== existingPoll.choices.length) {
      throw new BadRequestError(
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
      throw new BadRequestError("Cannot change the time of a published poll");
    }
  }
}
