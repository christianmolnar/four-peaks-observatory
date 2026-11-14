/// <reference lib="webworker" />
import { answerCampaign } from './handler';
import type { CampaignRequest } from './handler';

self.onmessage = (event: MessageEvent<CampaignRequest>) => {
  self.postMessage(answerCampaign(event.data));
};
