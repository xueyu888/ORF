export type ChatPollInputContract = {
  maximumOptionCount: number;
  maximumOptionLabelLength: number;
  maximumQuestionLength: number;
  minimumOptionCount: number;
};

export const CHAT_POLL_INPUT_CONTRACT = Object.freeze({
  maximumOptionCount: 100,
  maximumOptionLabelLength: 80,
  maximumQuestionLength: 280,
  minimumOptionCount: 2,
} satisfies ChatPollInputContract);
