import { BROADBAND_ID, PROJECT_LIMITS } from '@/planner/projects';
import { addDraftTarget, draftFromProject, fillFromPlan, newDraft, parseDraft, removeDraftTarget, setDraftFilter } from './projectDraft';
import { project } from '@/planner/projects/testkit';

const names = { target: (id: string) => id.toUpperCase(), filter: (id: string) => (id === BROADBAND_ID ? 'Broadband' : id) };
const L = BROADBAND_ID;
const base = () => ({ ...newDraft({ scopeId: 'sc', cameraId: 'cam', filterIds: [L, 'nbz'], subSeconds: 60 }), name: 'Fall' });

describe('the project draft', () => {
  it('a new draft starts from the context: setup as given, no targets, a status of active', () => {
    const d = newDraft({ scopeId: 'sc', cameraId: null, filterIds: [L], subSeconds: 90 });
    expect(d).toMatchObject({ name: '', status: 'active', scopeId: 'sc', cameraId: null, filterIds: [L], subText: '90', targets: [] });
  });

  it('a project turns into a draft and back into the same project fields', () => {
    const p = project();
    const r = parseDraft(draftFromProject(p), names);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.setup).toEqual(p.setup);
    expect(r.value.targets).toEqual(p.targets);
    expect(r.value.name).toBe(p.name);
  });

  it('blank minutes mean the filter is not planned for that target; 0 is a planned line of 0', () => {
    let d = addDraftTarget(base(), 'm31');
    d = { ...d, targets: [{ id: 'm31', lines: { [L]: { minutes: '120', optional: false }, nbz: { minutes: '', optional: false } } }] };
    let r = parseDraft(d, names);
    expect(r.ok && r.value.targets).toEqual([{ id: 'm31', lines: [{ filterId: L, minutes: 120, optional: false }] }]);
    d = { ...d, targets: [{ id: 'm31', lines: { [L]: { minutes: '0', optional: false } } }] };
    r = parseDraft(d, names);
    expect(r.ok && r.value.targets[0].lines).toEqual([{ filterId: L, minutes: 0, optional: false }]);
  });

  it('refuses in words at the box that is wrong, every box at once', () => {
    const d = { ...addDraftTarget(base(), 'm31'), name: '   ', subText: 'abc' };
    d.targets[0].lines[L] = { minutes: '-5', optional: false };
    d.targets[0].lines.nbz = { minutes: '1e308', optional: true };
    const r = parseDraft(d, names);
    if (r.ok) throw new Error('expected a refusal');
    expect(r.errors.name).toBe('Name: type a name of 1 to 60 characters.');
    expect(r.errors.sub).toMatch(/^Sub length: that is not a number written with digits only\./);
    expect(r.errors.lines['m31|no-filter']).toMatch(/^M31, Broadband, planned minutes: -5 is below the lowest allowed number\./);
    expect(r.errors.lines['m31|nbz']).toMatch(/^M31, nbz, planned minutes: that is not a number written with digits only\./);
    expect(r.summary).toBe('Nothing was saved. Fix the boxes marked below.');
    expect(JSON.stringify(r.errors)).not.toMatch(/NaN|Infinity|\$\./);
  });

  it('an optional line needs minutes; a name over 60 characters, no targets and no filters are refused', () => {
    const d = addDraftTarget(base(), 'm31');
    d.targets[0].lines.nbz = { minutes: '', optional: true };
    let r = parseDraft(d, names);
    expect(!r.ok && r.errors.lines['m31|nbz']).toBe('M31, nbz: type the optional minutes, or untick Optional.');
    r = parseDraft({ ...base(), name: 'x'.repeat(61) }, names);
    expect(!r.ok && r.errors.name).toBe('Name: type a name of 1 to 60 characters.');
    expect(!r.ok && r.errors.targets).toBe(`Targets: pick at least one target (at most ${PROJECT_LIMITS.targets.max}).`);
    r = parseDraft({ ...base(), filterIds: [] }, names);
    expect(!r.ok && r.errors.filters).toBe(`Filters: tick at least one filter (at most ${PROJECT_LIMITS.filters.max}).`);
  });

  it('adding a target twice, or removing one, or dropping a filter keeps the draft consistent', () => {
    let d = addDraftTarget(addDraftTarget(base(), 'm31'), 'm31');
    expect(d.targets.map((t) => t.id)).toEqual(['m31']);
    expect(Object.keys(d.targets[0].lines)).toEqual([L, 'nbz']);
    d.targets[0].lines.nbz.minutes = '30';
    d = setDraftFilter(d, 'nbz', false, [L, 'nbz']);
    expect(d.filterIds).toEqual([L]);
    expect(Object.keys(d.targets[0].lines)).toEqual([L]);
    d = setDraftFilter(d, 'nbz', true, [L, 'nbz']);
    expect(d.filterIds).toEqual([L, 'nbz']);
    expect(d.targets[0].lines.nbz).toEqual({ minutes: '', optional: false });
    d = removeDraftTarget(d, 'm31');
    expect(d.targets).toEqual([]);
  });

  it('fills a target\'s boxes from the plan for the filters the draft holds, and counts the lines it has no filter for', () => {
    const d = addDraftTarget(base(), 'm31');
    const r = fillFromPlan(d, 'm31', [{ filterId: L, minutes: 120 }, { filterId: 'nbz', minutes: 135 }, { filterId: 'nb3', minutes: 60 }]);
    expect(r.filled).toBe(2);
    expect(r.left).toBe(1);
    expect(r.draft.targets[0].lines[L].minutes).toBe('120');
    expect(r.draft.targets[0].lines.nbz).toEqual({ minutes: '135', optional: false });
    expect(Object.keys(r.draft.targets[0].lines)).toEqual([L, 'nbz']);
    expect(d.targets[0].lines.nbz.minutes).toBe('');
    expect(fillFromPlan(d, 'nope', [{ filterId: L, minutes: 1 }])).toEqual({ draft: d, filled: 0, left: 1 });
  });
});
