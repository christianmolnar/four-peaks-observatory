import { planCampaign } from './schedule';
import type { CampaignInput, CampaignResult } from './types';

/** What the page sends the worker: the campaign exactly as `planCampaign` takes it. */
export interface CampaignRequest {
  input: CampaignInput;
}

export type CampaignResponse = { kind: 'result'; result: CampaignResult } | { kind: 'error'; message: string };

/** The worker's side, apart from the worker globals so it can be tested: runs the engine and answers, never throws. */
export function answerCampaign({ input }: CampaignRequest): CampaignResponse {
  try {
    return { kind: 'result', result: planCampaign(input) };
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
