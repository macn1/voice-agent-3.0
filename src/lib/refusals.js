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


// Codes whose answer is always shown in these words (campaigns and their calling).
export const CODE_COPY = {
  campaign_not_live: 'The campaign must be published and live to place calls. Publish it, or resume it if it is paused.',
  campaign_not_found: "That campaign doesn't exist any more.",
  campaign_not_outbound: 'Calling a list of numbers is for outbound campaigns. This campaign answers calls instead.',
  outbound_settings_exist: 'This campaign already has its calling set up.',
  change_agent_on_campaign: "To change who speaks, change the agent on the campaign's Agent tab.",
  duplicate_the_campaign: 'To copy this calling, duplicate the campaign itself (Settings, then Duplicate).',
  agent_has_no_campaign: "This agent isn't on any campaign yet. Create a campaign for it first.",
};
