export type StateCoroutine = Generator<StateYield, void, unknown>;

type StateYield = number | null | void | StateCoroutine;

type StateUpdate<State> = () => State;
type StateBegin = () => void;
type StateEnd = () => void;
type StateCoroutineFactory = () => StateCoroutine;

interface StateCallbacks<State> {
  begin?: StateBegin;
  coroutine?: StateCoroutineFactory;
  end?: StateEnd;
  update?: StateUpdate<State>;
}

function isCoroutine(value: StateYield): value is StateCoroutine {
  return !!value && typeof value === "object" && "next" in value;
}

class CoroutineRunner {
  active = false;
  finished = true;

  private waitTimer = 0;
  private ended = false;
  private stack: StateCoroutine[] = [];

  cancel(): void {
    this.active = false;
    this.finished = true;
    this.waitTimer = 0;
    this.stack = [];
    this.ended = true;
  }

  replace(coroutine: StateCoroutine): void {
    this.active = true;
    this.finished = false;
    this.waitTimer = 0;
    this.stack = [coroutine];
    this.ended = true;
  }

  update(dt: number): void {
    this.ended = false;

    if (this.waitTimer > 0) {
      this.waitTimer -= dt;
      return;
    }

    if (!this.active || this.stack.length === 0) {
      return;
    }

    const current = this.stack[this.stack.length - 1];
    const next = current.next();
    if (!next.done && !this.ended) {
      if (typeof next.value === "number") {
        this.waitTimer = next.value;
      } else if (isCoroutine(next.value)) {
        this.stack.push(next.value);
      }
      return;
    }

    if (!this.ended) {
      this.stack.pop();
      if (this.stack.length === 0) {
        this.active = false;
        this.finished = true;
      }
    }
  }
}

export class StateMachine<State extends string | number> {
  changedStates = false;
  locked = false;
  previousState: State;

  private readonly callbacks = new Map<State, StateCallbacks<State>>();
  private readonly coroutine = new CoroutineRunner();
  private stateValue: State;

  constructor(initialState: State) {
    this.stateValue = initialState;
    this.previousState = initialState;
  }

  get state(): State {
    return this.stateValue;
  }

  set state(value: State) {
    if (this.locked || this.stateValue === value) {
      return;
    }

    this.transition(value);
  }

  forceState(value: State): void {
    if (this.stateValue !== value) {
      this.state = value;
      return;
    }

    this.transition(value);
  }

  setCallbacks(
    state: State,
    onUpdate?: StateUpdate<State>,
    coroutine?: StateCoroutineFactory,
    begin?: StateBegin,
    end?: StateEnd,
  ): void {
    this.callbacks.set(state, {
      begin,
      coroutine,
      end,
      update: onUpdate,
    });
  }

  update(dt: number): void {
    this.changedStates = false;

    const callbacks = this.callbacks.get(this.stateValue);
    if (callbacks?.update) {
      this.state = callbacks.update();
    }

    this.coroutine.update(dt);
  }

  private transition(nextState: State): void {
    const previousState = this.stateValue;
    this.changedStates = true;
    this.previousState = previousState;
    this.stateValue = nextState;

    this.callbacks.get(previousState)?.end?.();
    this.callbacks.get(nextState)?.begin?.();

    const coroutineFactory = this.callbacks.get(nextState)?.coroutine;
    if (coroutineFactory) {
      this.coroutine.replace(coroutineFactory());
    } else {
      this.coroutine.cancel();
    }
  }
}
