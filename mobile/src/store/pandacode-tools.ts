import { countNoun, t as msg } from '../i18n.ts';
// Sentences for PandaCode's own MCP tools (team coordination, title, change tracking, simulator,
// VM, design canvas, preview), as the desktop's pandacodeTrace in src/tool-trace.ts and the team
// lines in src/team-progress.ts word them. Pure (tested in node).
type Fields = Record<string, unknown>;
/** Worker id → display name, from the task's team when the phone has it. */
export type WorkerNames = Readonly<Record<string, string>>;
/** [running verb, finished verb, object] */
type Sentence = [string, string, string];

const MAX = 60;
const clip = (value: string, limit = MAX) => {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
};
const str = (f: Fields, key: string) => (typeof f[key] === 'string' ? f[key] as string : '');
const num = (f: Fields, key: string) => (typeof f[key] === 'number' && Number.isFinite(f[key]) ? Math.round(f[key] as number) : undefined);
const quoted = (value: string) => (value ? `“${clip(value)}”` : '');
const point = (f: Fields, x = 'x', y = 'y') => (num(f, x) !== undefined && num(f, y) !== undefined ? `(${num(f, x)}, ${num(f, y)})` : '');
const list = (f: Fields, key: string) => (Array.isArray(f[key]) ? f[key] as unknown[] : []);

/** `mcp__pandacode_architect__pandacode_dispatch_workers`, `pandacode_title` → `dispatch_workers`, `title`; undefined for other tools. */
export function ownTool(name: string): string | undefined {
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
  const [server, tool] = mcp ? [mcp[1], mcp[2]] : ['', name];
  if (mcp && !/^pandacode/i.test(server)) return;
  if (!/^pandacode_/i.test(tool) && !mcp) return;
  return tool.replace(/^pandacode_architect_/i, '').replace(/^pandacode_/i, '').toLowerCase();
}

/** A worker's name from the team, else a generic word. */
function worker(id: string, names: WorkerNames, fallback = msg("mobile.text.a_worker")): string {
  if (id === 'architect') return msg("mobile.text.the_architect");
  return names[id] || fallback;
}

const SIM_CONTROL: Record<string, [string, string]> = {
  get tap(): [string, string] { return [msg("mobile.text.tapping"), msg("mobile.text.tapped")]; }, get double_tap(): [string, string] { return [msg("mobile.text.double_tapping"), msg("mobile.text.double_tapped")]; }, get long_press(): [string, string] { return [msg("mobile.text.long_pressing"), msg("mobile.text.long_pressed")]; },
  get swipe(): [string, string] { return [msg("mobile.text.swiping"), msg("mobile.text.swiped")]; }, get type(): [string, string] { return [msg("mobile.text.typing"), msg("mobile.text.typed")]; }, get key(): [string, string] { return [msg("mobile.text.pressing"), msg("mobile.text.pressed")]; }, get button(): [string, string] { return [msg("mobile.text.pressing"), msg("mobile.text.pressed")]; }, get tap_label(): [string, string] { return [msg("mobile.text.tapping"), msg("mobile.text.tapped")]; },
};
const VM_CONTROL: Record<string, [string, string]> = {
  get click(): [string, string] { return [msg("mobile.text.clicking"), msg("mobile.text.clicked")]; }, get double_click(): [string, string] { return [msg("mobile.text.double_clicking"), msg("mobile.text.double_clicked")]; }, get right_click(): [string, string] { return [msg("mobile.text.right_clicking"), msg("mobile.text.right_clicked")]; },
  get middle_click(): [string, string] { return [msg("mobile.text.middle_clicking"), msg("mobile.text.middle_clicked")]; }, get move(): [string, string] { return [msg("mobile.text.moving_to"), msg("mobile.text.moved_to")]; }, get drag(): [string, string] { return [msg("mobile.text.dragging"), msg("mobile.text.dragged")]; },
  get scroll(): [string, string] { return [msg("mobile.text.scrolling"), msg("mobile.text.scrolled")]; }, get type(): [string, string] { return [msg("mobile.text.typing"), msg("mobile.text.typed")]; }, get key(): [string, string] { return [msg("mobile.text.pressing"), msg("mobile.text.pressed")]; },
};
const MANAGE: Record<string, [string, string]> = {
  get boot(): [string, string] { return [msg("mobile.text.booting"), msg("mobile.text.booted")]; }, get shutdown(): [string, string] { return [msg("mobile.text.shutting_down"), msg("mobile.text.shut_down")]; }, get show(): [string, string] { return [msg("mobile.text.showing"), msg("mobile.text.showed")]; }, get install(): [string, string] { return [msg("mobile.text.installing"), msg("mobile.text.installed")]; },
  get launch(): [string, string] { return [msg("mobile.text.launching"), msg("mobile.text.launched")]; }, get terminate(): [string, string] { return [msg("mobile.text.quitting"), msg("mobile.text.quit")]; }, get open_url(): [string, string] { return [msg("mobile.text.opening"), msg("mobile.text.opened")]; }, get appearance(): [string, string] { return [msg("mobile.text.switching"), msg("mobile.text.switched")]; },
  get pose(): [string, string] { return [msg("mobile.text.folding"), msg("mobile.text.folded")]; }, get create(): [string, string] { return [msg("mobile.text.creating"), msg("mobile.text.created")]; }, get start(): [string, string] { return [msg("mobile.text.starting"), msg("mobile.text.started")]; }, get stop(): [string, string] { return [msg("mobile.text.stopping_930576"), msg("mobile.text.stopped")]; },
  get suspend(): [string, string] { return [msg("mobile.text.suspending"), msg("mobile.text.suspended")]; }, get delete(): [string, string] { return [msg("mobile.text.deleting"), msg("mobile.text.deleted")]; }, get install_desktop(): [string, string] { return [msg("mobile.text.installing_a_desktop_on"), msg("mobile.text.installed_a_desktop_on")]; },
};

function control(f: Fields, verbs: Record<string, [string, string]>): Sentence {
  const action = str(f, 'action');
  const [run, done] = verbs[action] ?? [msg("mobile.text.using"), msg("mobile.text.used")];
  const object = action === 'swipe' || action === 'drag' ? [point(f), point(f, 'endX', 'endY')].filter(Boolean).join(' → ')
    : action === 'type' ? quoted(str(f, 'text'))
    : action === 'key' ? str(f, 'key') || str(f, 'keys')
    : action === 'button' ? str(f, 'button')
    : action === 'tap_label' ? quoted(str(f, 'label'))
    : action === 'scroll' ? [str(f, 'direction'), point(f) && msg('mobile.trace.at', { point: point(f) })].filter(Boolean).join(' ')
    : point(f) || action.replace(/_/g, ' ');
  return [run, done, object];
}

function manage(f: Fields, what: string): Sentence {
  const action = str(f, 'action');
  const [run, done] = MANAGE[action] ?? [msg("mobile.text.managing"), msg("mobile.text.managed")];
  const object = action === 'launch' || action === 'terminate' ? str(f, 'bundleId') || msg("mobile.text.the_app")
    : action === 'install' ? (str(f, 'path').split('/').pop() || msg("mobile.text.the_app"))
    : action === 'open_url' ? clip(str(f, 'url'))
    : action === 'appearance' ? msg('mobile.trace.appearance_mode', { mode: str(f, 'appearance') || msg('mobile.trace.another') })
    : action === 'pose' ? msg('mobile.trace.pose', { pose: str(f, 'pose') || msg('mobile.text.a_new_pose') })
    : str(f, 'name') ? `${what} ${str(f, 'name')}` : msg('mobile.trace.the', { name: what });
  return [run, done, object];
}

const SENTENCES: Record<string, (f: Fields, names: WorkerNames) => Sentence> = {
  dispatch_workers: f => {
    const n = list(f, 'assignments').length || list(f, 'workers').length || list(f, 'tasks').length;
    return [msg("mobile.text.dispatching"), msg("mobile.text.dispatched"), n ? countNoun(n, 'worker') : msg('mobile.text.the_workers')];
  },
  followup_worker: (f, names) => [msg("mobile.text.asking"), msg("mobile.text.asked"), msg('mobile.trace.followup', { name: worker(str(f, 'workerId'), names) })],
  cancel_worker: (f, names) => [msg("mobile.text.cancelling"), msg("mobile.text.cancelled"), worker(str(f, 'workerId'), names)],
  read_worker: (f, names) => [msg("mobile.text.checking_on"), msg("mobile.text.checked_on"), worker(str(f, 'workerId'), names)],
  list_workers: () => [msg("mobile.text.checking"), msg("mobile.text.checked"), msg("mobile.text.the_workers")],
  finish_team: () => [msg("mobile.text.finishing"), msg("mobile.text.finished"), msg("mobile.text.the_team")],
  send_team_message: (f, names) => [msg("mobile.text.messaging"), msg("mobile.text.messaged"), worker(str(f, 'recipient'), names, str(f, 'recipient') ? clip(str(f, 'recipient'), 30) : msg("mobile.text.a_teammate"))],
  read_team_mailbox: () => [msg("mobile.text.reading"), msg("mobile.text.read"), msg("mobile.text.the_team_mailbox")],
  team_directory: () => [msg("mobile.text.looking_up"), msg("mobile.text.looked_up"), msg("mobile.text.the_team")],
  checkpoint_worker: f => [msg("mobile.text.saving"), msg("mobile.text.saved"), str(f, 'blocker') ? msg("mobile.text.a_checkpoint_with_a_blocker") : msg("mobile.text.a_checkpoint")],
  title: f => [msg("mobile.text.renaming"), msg("mobile.text.renamed"), str(f, 'title') ? msg('mobile.trace.rename', { name: quoted(str(f, 'title')) }) : msg("mobile.text.the_thread")],
  track_files: f => {
    const n = list(f, 'paths').length;
    return str(f, 'action') === 'complete' ? [msg("mobile.text.recording"), msg("mobile.text.recorded"), n ? countNoun(n, 'changed_file') : msg("mobile.text.changed_files")] : [msg("mobile.text.tracking"), msg("mobile.text.tracked"), n ? countNoun(n, 'file') : msg('mobile.text.files')];
  },
  simulator_screenshot: () => [msg("mobile.text.taking"), msg("mobile.text.took"), msg("mobile.text.a_simulator_screenshot")],
  simulator_describe: f => [msg("mobile.text.reading"), msg("mobile.text.read"), point(f) ? msg('mobile.trace.simulator_element', { point: point(f) }) : msg("mobile.text.the_simulator_screen")],
  simulator_devices: () => [msg("mobile.text.listing"), msg("mobile.text.listed"), msg('mobile.trace.simulators')],
  simulator_control: f => control(f, SIM_CONTROL),
  simulator_manage: f => manage(f, msg('mobile.trace.simulator')),
  vm_screenshot: () => [msg("mobile.text.taking"), msg("mobile.text.took"), msg("mobile.text.a_vm_screenshot")],
  vm_list: () => [msg("mobile.text.listing"), msg("mobile.text.listed"), msg("mobile.text.vms")],
  vm_control: f => control(f, VM_CONTROL),
  vm_manage: f => manage(f, msg("mobile.text.vm")),
  design_write: f => [msg("mobile.text.drawing"), msg("mobile.text.drew"), str(f, 'name') || str(f, 'title') ? msg('mobile.trace.artboard', { name: quoted(str(f, 'name') || str(f, 'title')) }) : msg("mobile.text.an_artboard")],
  design_list: () => [msg("mobile.text.listing"), msg("mobile.text.listed"), msg('mobile.trace.artboards')],
  design_comments: () => [msg("mobile.text.reading"), msg("mobile.text.read"), msg("mobile.text.design_comments")],
  design_resolve: () => [msg("mobile.text.resolving"), msg("mobile.text.resolved"), msg("mobile.text.a_design_comment")],
  preview_file: f => [msg("mobile.text.previewing"), msg("mobile.text.previewed"), str(f, 'path').split('/').pop() || msg("mobile.text.a_file")],
  run_project: () => [msg("mobile.text.running"), msg("mobile.text.ran"), msg("mobile.text.the_project")],
  cloud_cli: f => [msg("mobile.text.running"), msg("mobile.text.ran"), clip(str(f, 'cli') || str(f, 'tool') || msg("mobile.text.a_deploy_command"), 40)],
};

/** `Dispatched 3 workers`, `Tapped (200, 618)`: the sentence for one of PandaCode's own tools, or undefined. */
export function ownSentence(tool: string, fields: Fields, running: boolean, names: WorkerNames = {}): { verb: string; object: string } | undefined {
  const sentence = SENTENCES[tool]?.(fields, names);
  return sentence && { verb: sentence[running ? 0 : 1], object: sentence[2] };
}

export interface Assignment { key: string; name: string; prompt: string; provider: string; model: string; profileId: string; files: string[]; readOnly: boolean; dependsOn: string[] }

/** dispatch_workers' assignments, for the expanded card per worker. */
export function assignmentsOf(fields: Fields): Assignment[] {
  return list(fields, 'assignments').filter((a): a is Fields => !!a && typeof a === 'object').slice(0, 12).map(a => ({
    key: str(a, 'key'), name: str(a, 'name') || str(a, 'key') || msg("mobile.text.worker"), prompt: str(a, 'prompt'), provider: str(a, 'provider'), model: str(a, 'model'),
    profileId: str(a, 'profileId'), readOnly: a.readOnly === true,
    files: list(a, 'files').filter((x): x is string => typeof x === 'string'), dependsOn: list(a, 'dependsOn').filter((x): x is string => typeof x === 'string'),
  }));
}

/** A screenshot a tool result carries as a data: URL or bare base64 PNG/JPEG; undefined when the host dropped the bytes. */
export function imageOf(output: string): string | undefined {
  const data = /data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]{100,}/.exec(output.slice(0, 4_000_000));
  if (data) return data[0];
  const bare = /"(?:data|base64)"\s*:\s*"((?:iVBORw0KGgo|\/9j\/)[A-Za-z0-9+/=]{100,})"/.exec(output.slice(0, 4_000_000));
  return bare ? `data:image/${bare[1].startsWith('/9j/') ? 'jpeg' : 'png'};base64,${bare[1]}` : undefined;
}
