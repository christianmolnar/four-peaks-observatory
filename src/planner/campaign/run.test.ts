import { arcToHorizonPoints } from '../profile';
import { answerCampaign } from './handler';
import type { CampaignRequest, CampaignResponse } from './handler';
import { CampaignCancelled, isCancelled, startCampaign } from './run';
import type { CampaignWorkerLike } from './run';
import { planCampaign } from './index';
import type { CampaignInput } from './index';
import { FOUNTAIN_HILLS, subjects } from './testkit-real';

const input = (ids: string[], nights: number): CampaignInput => ({
  subjects: subjects(ids),
  site: FOUNTAIN_HILLS,
  timeZone: 'America/Phoenix',
  horizon: arcToHorizonPoints([{ startAz: 120, endAz: 320, heightDeg: 42 }]),
  minAltitude: 20,
  startDate: '2026-11-14',
  nights,
});

/** A worker whose answer is held until `release`, so a test can cancel while it "works". */
function fakeWorker(respond: (m: CampaignRequest) => CampaignResponse | 'crash' = answerCampaign) {
  const requests: CampaignRequest[] = [];
  let terminated = 0;
  const held: (() => void)[] = [];
  const worker: CampaignWorkerLike = {
    onmessage: null,
    onerror: null,
    terminate: () => { terminated++; },
    postMessage: (m) => {
      requests.push(m);
      const r = respond(m);
      held.push(() => (r === 'crash' ? worker.onerror?.({ message: 'boom' }) : worker.onmessage?.({ data: r })));
    },
  };
  return { worker, requests, terminated: () => terminated, release: () => held.splice(0).forEach((f) => f()) };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('startCampaign', () => {
  it('sends the engine its own input type unchanged and resolves with planCampaign\'s own answer', async () => {
    const w = fakeWorker();
    const i = input(['m42', 'ngc1499', 'm81'], 3);
    const run = startCampaign(i, { createWorker: () => w.worker });
    await flush();
    expect(w.requests).toHaveLength(1);
    expect(w.requests[0].input).toBe(i);
    w.release();
    expect(await run.result).toEqual(planCampaign(i));
    expect(w.terminated()).toBe(1); // a worker is ended when it has answered
  });

  it('cancel ends the worker, rejects with CampaignCancelled, and a late answer changes nothing', async () => {
    const w = fakeWorker();
    const run = startCampaign(input(['m42'], 1), { createWorker: () => w.worker });
    await flush();
    run.cancel();
    expect(w.terminated()).toBe(1);
    await expect(run.result).rejects.toBeInstanceOf(CampaignCancelled);
    await run.result.catch((e: unknown) => expect(isCancelled(e)).toBe(true));
    w.release(); // the worker's last words arrive after it was ended
    run.cancel(); // a second cancel does nothing
    expect(w.terminated()).toBe(1);
  });

  it('cancel before the worker exists ends it as soon as it does and never posts', async () => {
    const w = fakeWorker();
    const run = startCampaign(input(['m42'], 1), { createWorker: async () => w.worker });
    run.cancel();
    await expect(run.result).rejects.toBeInstanceOf(CampaignCancelled);
    await flush();
    expect(w.requests).toHaveLength(0);
    expect(w.terminated()).toBe(1);
  });

  it('a worker that reports an error, or crashes, rejects with a real error', async () => {
    const bad = fakeWorker(() => ({ kind: 'error', message: 'nights must be a whole number' }));
    const r1 = startCampaign(input(['m42'], 1), { createWorker: () => bad.worker });
    await flush();
    bad.release();
    await expect(r1.result).rejects.toThrow('nights must be a whole number');
    const crash = fakeWorker(() => 'crash');
    const r2 = startCampaign(input(['m42'], 1), { createWorker: () => crash.worker });
    await flush();
    crash.release();
    await expect(r2.result).rejects.toThrow(/crashed: boom/);
    expect(crash.terminated()).toBe(1);
  });

  it('with no worker the engine runs on this thread, and cancel still stops it', async () => {
    const i = input(['m42', 'm81'], 1);
    expect(await startCampaign(i, { createWorker: () => null }).result).toEqual(planCampaign(i));
    const run = startCampaign(i, { createWorker: () => null });
    run.cancel();
    await expect(run.result).rejects.toBeInstanceOf(CampaignCancelled);
  });

  it('a worker that cannot be made falls back to this thread and warns', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const i = input(['m42'], 1);
    expect(await startCampaign(i, { createWorker: () => { throw new Error('blocked'); } }).result).toEqual(planCampaign(i));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('answerCampaign', () => {
  it('answers with the engine result, or the engine\'s refusal as an error answer', () => {
    const i = input(['m42'], 2);
    expect(answerCampaign({ input: i })).toEqual({ kind: 'result', result: planCampaign(i) });
    const refused = answerCampaign({ input: { ...i, nights: 15 } });
    expect(refused.kind).toBe('error');
  });
});
