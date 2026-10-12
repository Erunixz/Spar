"""Step-by-step tracer for the visual tab.

Runs user code under sys.settrace and records a snapshot before every line
(plus function returns and exceptions). Each snapshot is a deep copy taken at
that moment, so later mutations never leak into earlier steps.

Values are encoded as JSON:
  - None, bools, small ints, finite floats and (truncated) strings are inline
  - big ints are {"bigint": "..."}, inf/nan are {"float": "inf"}
  - everything else is {"ref": n}, pointing into the step's "heap", where n is
    stable for the object's whole run. Stable ids are what let the UI show the
    same list node or tree node moving between steps.
"""

import builtins
import io
import json
import math
import sys
import types

USER_FILE = "<user>"
DEFAULT_MAX_STEPS = 1000
MAX_HEAP_OBJECTS = 300
# Every step copies the objects it can reach; this caps the whole trace so a
# big structure over many steps can't exhaust the tab's memory.
MAX_TOTAL_OBJECTS = 100_000
MAX_ITEMS = 100
MAX_STR = 200
SAFE_INT = 2**53
CO_OPTIMIZED = 0x1


class StepLimit(BaseException):
    """Raised from the trace function to stop runaway programs.

    BaseException so a user's `except Exception:` can't swallow it.
    reason is "steps" (too many steps) or "size" (too much data recorded).
    """

    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


def _no_input(*_args, **_kwargs):
    raise RuntimeError("input() isn't available in the visualizer; hard-code test values instead")


def _primitive(value):
    if value is None or isinstance(value, bool):
        return True, value
    if isinstance(value, int):
        return True, value if -SAFE_INT < value < SAFE_INT else {"bigint": str(value)}
    if isinstance(value, float):
        return True, value if math.isfinite(value) else {"float": repr(value)}
    if isinstance(value, str):
        return True, value if len(value) <= MAX_STR else value[:MAX_STR] + "…"
    return False, None


class _Ids:
    """Small stable ids for objects. Holding a reference stops id() reuse after GC."""

    def __init__(self):
        self.by_id = {}
        self.keep = []

    def of(self, value):
        key = id(value)
        n = self.by_id.get(key)
        if n is None:
            n = len(self.by_id) + 1
            self.by_id[key] = n
            self.keep.append(value)
        return n


class _Snapshot:
    def __init__(self, ids):
        self.ids = ids
        self.heap = {}
        self.queue = []

    def encode(self, value):
        ok, prim = _primitive(value)
        if ok:
            return prim
        n = self.ids.of(value)
        if n not in self.heap:
            if len(self.heap) >= MAX_HEAP_OBJECTS:
                return {"ref": n, "truncated": True}
            self.heap[n] = None  # placeholder: being described
            self.queue.append((n, value))
        return {"ref": n}

    def drain(self):
        # Iterative, so deep linked lists can't hit the recursion limit.
        while self.queue:
            n, value = self.queue.pop(0)
            self.heap[n] = self._describe(value)

    def _items(self, iterable, total):
        items = []
        for i, item in enumerate(iterable):
            if i >= MAX_ITEMS:
                break
            items.append(self.encode(item))
        return items, total > MAX_ITEMS

    def _describe(self, value):
        type_name = type(value).__name__
        if isinstance(value, (list, tuple)) or type_name == "deque":
            items, more = self._items(value, len(value))
            kind = "tuple" if isinstance(value, tuple) else "list"
            return {"kind": kind, "type": type_name, "items": items, "more": more}
        if isinstance(value, (set, frozenset)):
            try:
                ordered = sorted(value)
            except TypeError:
                ordered = list(value)
            items, more = self._items(ordered, len(value))
            return {"kind": "set", "type": type_name, "items": items, "more": more}
        if isinstance(value, dict):
            entries = []
            for i, (k, v) in enumerate(value.items()):
                if i >= MAX_ITEMS:
                    break
                entries.append([self.encode(k), self.encode(v)])
            return {"kind": "dict", "type": type_name, "entries": entries, "more": len(value) > MAX_ITEMS}
        if isinstance(value, (types.FunctionType, types.BuiltinFunctionType, types.MethodType)):
            return {"kind": "function", "name": getattr(value, "__qualname__", type_name)}
        if isinstance(value, type):
            return {"kind": "class", "name": value.__name__}
        if isinstance(value, types.ModuleType):
            return {"kind": "module", "name": value.__name__}
        fields = getattr(value, "__dict__", None)
        if isinstance(fields, dict):
            return {
                "kind": "object",
                "type": type_name,
                "fields": {k: self.encode(v) for k, v in fields.items() if not k.startswith("__")},
            }
        return {"kind": "other", "type": type_name, "repr": repr(value)[:MAX_STR]}


def _is_user_frame(frame):
    """User code worth stepping through: functions and the module, not class bodies.

    A class body is neither the module nor an optimized (function) frame, and
    its locals are interpreter bookkeeping like __qualname__.
    """
    code = frame.f_code
    if code.co_filename != USER_FILE:
        return False
    return code.co_name == "<module>" or bool(code.co_flags & CO_OPTIMIZED)


def _visible_globals(frame_globals):
    """Module-level names worth showing: not dunders, functions, classes or modules."""
    hidden = (types.FunctionType, type, types.ModuleType, types.BuiltinFunctionType)
    return {
        k: v
        for k, v in frame_globals.items()
        if not k.startswith("__") and not isinstance(v, hidden)
    }


def run(source, max_steps=DEFAULT_MAX_STEPS):
    """Run source and return a JSON string describing every step."""
    steps = []
    out = io.StringIO()
    ids = _Ids()
    status = "ok"
    error = None
    limit = None
    total_objects = [0]

    def user_frames(frame):
        frames = []
        while frame is not None:
            if _is_user_frame(frame):
                frames.append(frame)
            frame = frame.f_back
        frames.reverse()  # outermost first
        return frames

    def record(frame, event, arg):
        if len(steps) >= max_steps:
            raise StepLimit("steps")
        snap = _Snapshot(ids)
        stack = []
        for f in user_frames(frame):
            is_module = f.f_code.co_name == "<module>"
            local_vars = _visible_globals(f.f_globals) if is_module else dict(f.f_locals)
            stack.append({
                "fn": f.f_code.co_name,
                "line": f.f_lineno,
                "locals": {k: snap.encode(v) for k, v in local_vars.items()},
            })
        step = {"event": event, "line": frame.f_lineno, "stack": stack, "stdout": len(out.getvalue())}
        if event == "return":
            step["retval"] = snap.encode(arg)
        if event == "exception":
            exc_type, exc_value, _tb = arg
            step["exception"] = {"type": exc_type.__name__, "message": str(exc_value)}
        snap.drain()
        step["heap"] = {str(k): v for k, v in snap.heap.items()}
        steps.append(step)
        total_objects[0] += len(snap.heap)
        if total_objects[0] > MAX_TOTAL_OBJECTS:
            raise StepLimit("size")

    def tracer(frame, event, arg):
        if not _is_user_frame(frame):
            return None
        if event in ("line", "return", "exception"):
            record(frame, event, arg)
        return tracer

    try:
        code = compile(source, USER_FILE, "exec")
    except SyntaxError as e:
        return json.dumps({
            "status": "error",
            "error": {"type": "SyntaxError", "message": e.msg, "line": e.lineno},
            "steps": [],
            "stdout": "",
        })

    user_globals = {"__name__": "__main__", "__builtins__": builtins}
    real_stdout, real_input = sys.stdout, builtins.input
    sys.stdout = out
    builtins.input = _no_input
    sys.settrace(tracer)
    try:
        exec(code, user_globals)
    except StepLimit as e:
        status = "step_limit"
        limit = e.reason
    except BaseException as e:  # report every user error, including SystemExit
        status = "error"
        tb = e.__traceback__
        line = None
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == USER_FILE:
                line = tb.tb_lineno
            tb = tb.tb_next
        error = {"type": type(e).__name__, "message": str(e), "line": line}
    finally:
        sys.settrace(None)
        sys.stdout = real_stdout
        builtins.input = real_input

    return json.dumps(
        {
            "status": status,
            "limit": limit,
            "error": error,
            "steps": steps,
            "stdout": out.getvalue(),
            "maxSteps": max_steps,
        },
        allow_nan=False,
    )
