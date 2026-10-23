// Reasons a call or test conversation is refused: the entitlements route and
// 402 / 429 / 409 errors from the call APIs. Used when the API sends no message.
export const REFUSAL_COPY = {
  live_audio_unavailable: 'Listening in and taking over need live audio, which isn’t connected yet.',
  agent_not_published: "Publish this agent first — test conversations run on the published version.",
  agent_paused: "This agent is paused. Resume it to start a conversation.",
  no_plan: 'Your company has no plan yet. Choose one to start placing and taking calls.',
  plan_inactive: "Your plan isn't active, so calls are paused.",
  minutes_exhausted: "You've used all included call minutes and have no wallet balance for extra minutes.",
  insufficient_balance: 'Your wallet balance is too low to pay for extra minutes.',
  concurrent_call_limit: "Your plan's limit of calls at the same time has been reached. Try again when a call ends.",
  agent_concurrent_limit: "This agent's limit of calls at the same time has been reached.",
  too_many_text_sessions: 'You already have 5 test conversations open. End one to start another.',
};

